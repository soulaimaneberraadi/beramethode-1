/**
 * Relais des rapports de plantage vers le propriétaire (Bera-master-admin).
 *
 * ── Le problème ──────────────────────────────────────────────────────────────
 * `ErrorBoundary` envoie déjà un rapport automatique à `/api/errors/report`,
 * mais celui-ci est écrit dans la table LOCALE `crash_reports`, sur le PC de
 * l'entreprise. Il n'en sort jamais. Seules les réclamations écrites À LA MAIN
 * par l'utilisateur (bouton « Signaler ») remontent via `support_tickets`.
 *
 * Autrement dit : quand une entreprise plante, le propriétaire ne l'apprend que
 * si quelqu'un pense à l'appeler.
 *
 * ── Ce que fait ce module ────────────────────────────────────────────────────
 * Il relaie AUSSI le rapport automatique vers le cloud, sous trois contraintes
 * qui ne sont pas négociables :
 *
 *  1. HORS LIGNE — le programme tourne en réseau local, parfois sans internet.
 *     Le rapport part dans une file persistante et s'envoie au retour du réseau.
 *
 *  2. CONFIDENTIALITÉ — un message d'erreur contient parfois des données
 *     métier (nom de client, prix, identifiant). On envoie CE QUI S'EST PASSÉ,
 *     pas LES DONNÉES. Voir `caviarder()`.
 *
 *  3. RÉPÉTITION — une erreur dans une boucle de rendu peut se déclencher des
 *     centaines de fois par minute. Une signature + une fenêtre de silence
 *     évitent d'inonder la base et de faire passer un seul bug pour une panne
 *     générale.
 *
 * Aucun changement de schéma côté cloud : on réutilise `support_tickets` avec
 * les types existants, et on marque l'origine par `context.auto = true`.
 */

import type { ErrorReport } from '../../components/ErrorBoundary';

const FILE_KEY = 'bera_crash_queue';
const IDENTITE_KEY = 'bera_crash_identite';
/** Au-delà, les plus anciens sautent : une file qui gonfle sans fin finit par
 *  saturer localStorage et casser le reste de l'application. */
const FILE_MAX = 20;
/** Même signature dans cette fenêtre → on ne renvoie pas. */
const SILENCE_MS = 5 * 60 * 1000;

/**
 * Qui a planté. Ce bloc n'est PAS caviardé, et c'est voulu.
 *
 * Identifier l'entreprise n'est pas la même chose que lire ses données : sans
 * le nom et un contact, un rapport de plantage est inexploitable — on sait
 * qu'un programme a cassé quelque part, sans pouvoir rappeler ni corriger pour
 * la bonne personne. Le caviardage porte sur le CONTENU métier (noms de
 * clients, prix, numéros de pièce), pas sur l'identité du client.
 */
export interface IdentiteCrash {
  /** Raison sociale de l'entreprise utilisatrice. */
  entreprise: string;
  /** ICE — identifie l'entreprise sans ambiguïté même si deux ont le même nom. */
  ice: string;
  /** Téléphone de l'entreprise, pour la rappeler. */
  tel: string;
  email: string;
  /** Utilisateur qui a subi le plantage. */
  userId: string | null;
  userEmail: string | null;
  /** Compte administrateur racine de l'entreprise (le patron). */
  ownerId: string | number | null;
  roleName: string | null;
  /** Version du programme — deux entreprises peuvent tourner sur deux versions. */
  version: string;
}

interface EnQueue {
  report: ErrorReport;
  signature: string;
  /** Nombre de fois où ce plantage s'est produit depuis la mise en file. */
  occurrences: number;
  /** Identité au moment du plantage (peut différer d'un envoi différé). */
  identite: IdentiteCrash | null;
}

// ─── 1. Caviardage ────────────────────────────────────────────────────────────

/**
 * Retire d'un texte ce qui ressemble à une donnée métier ou personnelle, en
 * gardant ce qui sert au diagnostic (type d'erreur, fichier, ligne).
 *
 * On ne cherche pas l'exhaustivité — c'est impossible sur du texte libre. On
 * couvre ce qui fuit réellement : adresses e-mail, numéros de téléphone, longues
 * suites de chiffres (identifiants, montants, numéros de facture).
 */
export const caviarder = (texte: string | undefined | null): string => {
  if (!texte) return '';
  return String(texte)
    // 1. adresses e-mail
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    // 2. téléphone ÉCRIT AVEC SÉPARATEURS (06 12 34 56 78, +212 6 12 ...).
    //    L'exigence d'un séparateur l'empêche de mordre au milieu d'un long
    //    nombre collé : sans ça, « Facture 20260830001 » devenait « 2[tel] ».
    .replace(/(?:\+212|\b0)\d?[\s.-]\d[\d\s.-]{5,12}\d/g, '[tel]')
    // 3. puis toute suite collée de 6 chiffres ou plus : identifiants, montants,
    //    numéros de pièce — et les téléphones écrits sans séparateur.
    //    Le seuil de 6 laisse passer les numéros de ligne d'une pile d'appels
    //    et les versions, qui sont justement ce qu'on veut lire.
    .replace(/\d{6,}/g, '[nombre]');
};

/**
 * L'URL porte désormais la position exacte dans l'application
 * (`#/sous-traitance/clients/42`). Le segment identifiant est remplacé : savoir
 * QUELLE page a planté est utile, savoir QUEL client ne l'est pas.
 */
const caviarderUrl = (url: string | undefined): string => {
  if (!url) return '';
  const brut = String(url);
  const diese = brut.indexOf('#');
  if (diese === -1) return caviarder(brut);
  const base = brut.slice(0, diese);
  const parties = brut.slice(diese + 1).split('/').filter(Boolean);
  // On garde la page et les onglets (lettres/tirets), on masque les identifiants.
  const propres = parties.map(p => (/^[a-zA-Z][a-zA-Z-]*$/.test(p) ? p : ':id'));
  return `${base}#/${propres.join('/')}`;
};

// ─── 2. Signature et répétition ───────────────────────────────────────────────

/** Identifie un plantage indépendamment des valeurs qu'il transporte. */
const signatureDe = (report: ErrorReport): string => {
  const premiereLigne = (report.stack || '').split('\n')[1]?.trim() || '';
  return `${caviarder(report.message)}|${caviarder(premiereLigne)}|${report.view || ''}`;
};

const derniersEnvois = new Map<string, number>();

const troRecent = (signature: string): boolean => {
  const precedent = derniersEnvois.get(signature);
  const maintenant = Date.now();
  if (precedent && maintenant - precedent < SILENCE_MS) return true;
  derniersEnvois.set(signature, maintenant);
  return false;
};

// ─── 3. File persistante ──────────────────────────────────────────────────────

const lireFile = (): EnQueue[] => {
  try {
    const brut = localStorage.getItem(FILE_KEY);
    if (!brut) return [];
    const parse = JSON.parse(brut);
    return Array.isArray(parse) ? parse : [];
  } catch {
    return [];
  }
};

const ecrireFile = (file: EnQueue[]): void => {
  try {
    localStorage.setItem(FILE_KEY, JSON.stringify(file.slice(-FILE_MAX)));
  } catch {
    // localStorage plein ou indisponible : on abandonne le relais plutôt que
    // de faire échouer l'affichage de l'erreur à l'utilisateur.
  }
};

// ─── 4. Identité ──────────────────────────────────────────────────────────────

/**
 * Mémorise QUI utilise le programme, pendant que tout va bien.
 *
 * Pourquoi maintenant et pas au moment du plantage : quand ça casse, le serveur
 * local peut être injoignable, la session perdue, le rendu mort. Aller chercher
 * l'identité à cet instant, c'est risquer de n'avoir ni l'identité ni le
 * rapport. On la range à l'avance, et le plantage n'a plus qu'à la lire.
 *
 * Appelée après la connexion et à chaque changement d'entreprise.
 */
export const memoriserIdentite = async (): Promise<void> => {
  try {
    const [{ loadCompanyIdentity }, { supabase }, { APP_VERSION }] = await Promise.all([
      import('../../lib/companyIdentity'),
      import('./supabaseClient'),
      import('./dataVersion'),
    ]);

    // `force` : sans ça, après un changement d'entreprise on remémoriserait
    // l'identité en cache — celle de l'entreprise précédente.
    const societe = await loadCompanyIdentity(true).catch(() => null);

    let userId: string | null = null;
    let userEmail: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      userEmail = data.user?.email ?? null;
    } catch { /* hors ligne : on garde ce qu'on a */ }

    let ownerId: string | number | null = null;
    let roleName: string | null = null;
    try {
      const rep = await fetch('/api/permissions/me', { credentials: 'include' });
      if (rep.ok) {
        const perm = await rep.json();
        ownerId = perm?.ownerId ?? null;
        roleName = perm?.roleName ?? null;
      }
    } catch { /* serveur local absent (mode statique) : non bloquant */ }

    const identite: IdentiteCrash = {
      entreprise: societe?.nom || '',
      ice: societe?.ice || '',
      tel: societe?.tel || '',
      email: societe?.email || '',
      userId, userEmail, ownerId, roleName,
      version: APP_VERSION,
    };

    // On n'écrase pas une identité complète par une plus pauvre : au démarrage,
    // la société n'est pas encore chargée et on écrirait des champs vides.
    const ancienne = lireIdentite();
    if (ancienne?.entreprise && !identite.entreprise) return;

    localStorage.setItem(IDENTITE_KEY, JSON.stringify(identite));
  } catch {
    /* jamais bloquant */
  }
};

const lireIdentite = (): IdentiteCrash | null => {
  try {
    const brut = localStorage.getItem(IDENTITE_KEY);
    return brut ? (JSON.parse(brut) as IdentiteCrash) : null;
  } catch {
    return null;
  }
};

// ─── 5. API publique ──────────────────────────────────────────────────────────

/**
 * Met un plantage en file pour le propriétaire, puis tente un envoi immédiat.
 *
 * Ne lève JAMAIS : appelé depuis `componentDidCatch`, une exception ici
 * masquerait l'erreur d'origine et pourrait boucler.
 */
export const signalerPlantage = (report: ErrorReport): void => {
  try {
    const signature = signatureDe(report);
    const file = lireFile();

    // Déjà en file : on incrémente au lieu d'ajouter une ligne de plus.
    const existant = file.find(e => e.signature === signature);
    if (existant) {
      existant.occurrences += 1;
      ecrireFile(file);
      return;
    }

    if (troRecent(signature)) return;

    file.push({
      signature,
      occurrences: 1,
      identite: lireIdentite(),
      report: {
        ...report,
        message: caviarder(report.message),
        stack: caviarder(report.stack),
        componentStack: caviarder(report.componentStack),
        url: caviarderUrl(report.url),
      },
    });
    ecrireFile(file);
    void viderFile();
  } catch {
    /* jamais d'exception depuis un gestionnaire d'erreur */
  }
};

let videnEnCours = false;

/**
 * Tente d'envoyer la file au cloud. Ce qui échoue reste en file pour la
 * prochaine tentative — un envoi raté ne doit jamais perdre un rapport.
 */
export const viderFile = async (): Promise<void> => {
  if (videnEnCours) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const file = lireFile();
  if (file.length === 0) return;

  videnEnCours = true;
  try {
    // Import tardif : ne pas tirer le client cloud au démarrage pour un module
    // qui, la plupart du temps, n'aura rien à envoyer.
    const { creerTicketAutomatique } = await import('./support');

    const restants: EnQueue[] = [];
    for (const entree of file) {
      // L'identité est relue si elle manquait au moment du plantage (plantage
      // survenu avant la connexion, puis envoi une fois connecté).
      const envoye = await creerTicketAutomatique(
        entree.report,
        entree.occurrences,
        entree.identite ?? lireIdentite(),
      );
      if (!envoye) restants.push(entree);
    }
    ecrireFile(restants);
  } catch {
    // Cloud injoignable : la file reste intacte.
  } finally {
    videnEnCours = false;
  }
};

/** Branche la reprise automatique : au démarrage et au retour du réseau. */
export const demarrerRelaisPlantages = (): void => {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => void viderFile());
  // Léger différé : au démarrage, la session et le réseau ne sont pas encore prêts.
  window.setTimeout(() => void viderFile(), 8000);
};
