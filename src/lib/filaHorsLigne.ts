/**
 * La file d'attente hors ligne (outbox).
 *
 * L'application s'ouvrait deja sans reseau — le service worker rend la
 * derniere page et les dernieres lectures connues. Mais TOUT ce qu'on tapait
 * pendant la coupure etait perdu : le fetch echouait, l'ecran affichait une
 * erreur, et la piece comptee a l'atelier n'existait nulle part. Dans une usine
 * dont le Wi-Fi tombe, cela veut dire ressaisir une demi-journee de pointage.
 *
 * Desormais toute ecriture qui ne peut pas partir est rangee ici, dans
 * IndexedDB — pas dans localStorage, qui est efface par le navigateur bien plus
 * volontiers et qui ne survit pas a un gros corps de requete. Elle y attend le
 * retour du reseau, puis part SEULE, dans l'ORDRE ou elle a ete faite : une
 * entree de stock avant la sortie qui la consomme, sinon le solde passe en
 * negatif et le serveur refuse.
 *
 * Chaque requete emporte une cle d'idempotence (`X-Bera-Idempotence`). Le
 * serveur s'en sert pour reconnaitre un renvoi : la coupure peut arriver APRES
 * que le serveur ait enregistre mais AVANT que la reponse ne revienne — sans
 * cette cle, le rattrapage facturerait deux fois.
 */

const BASE = 'beramethode-hors-ligne';
const MAGASIN = 'file';
const VERSION_BASE = 1;

/** Au-dela, on renonce : une requete que le serveur refuse en boucle bloquerait
 *  toute la file derriere elle. Elle passe alors dans les echecs, visibles. */
const MAX_ESSAIS = 5;

/** Routes qu'il ne faut JAMAIS mettre en file. Les rejouer plus tard n'a aucun
 *  sens : se connecter hors ligne ne connecte pas, et une reponse d'IA differee
 *  d'une heure arrive dans un ecran que personne ne regarde plus. */
const JAMAIS_EN_FILE = /^\/api\/(auth\/|gemini|ai\/|license|sync\/|diagnostics|crash)/;

export type EntreeFile = {
  id?: number;
  url: string;
  methode: string;
  entetes: Record<string, string>;
  corps: string | null;
  cle: string;
  creeLe: number;
  essais: number;
  derniereErreur?: string;
};

export type EtatFile = {
  enAttente: number;
  envoiEnCours: boolean;
  echecs: number;
  derniereSynchro: number | null;
};

const etat: EtatFile = { enAttente: 0, envoiEnCours: false, echecs: 0, derniereSynchro: null };

export const etatFile = (): EtatFile => ({ ...etat });

const diffuser = () => {
  try {
    window.dispatchEvent(new CustomEvent('beramethode:file-hors-ligne', { detail: etatFile() }));
  } catch { /* environnement sans window : rien a annoncer */ }
};

// ─── IndexedDB ───────────────────────────────────────────────────────────────

let basePromesse: Promise<IDBDatabase> | null = null;

const ouvrirBase = (): Promise<IDBDatabase> => {
  if (basePromesse) return basePromesse;
  basePromesse = new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(BASE, VERSION_BASE);
    requete.onupgradeneeded = () => {
      const base = requete.result;
      if (!base.objectStoreNames.contains(MAGASIN)) {
        // `autoIncrement` : la cle croit avec le temps, donc parcourir le
        // magasin rend les requetes dans l'ordre ou elles ont ete faites.
        base.createObjectStore(MAGASIN, { keyPath: 'id', autoIncrement: true });
      }
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
  // Une base illisible ne doit pas condamner les tentatives suivantes.
  basePromesse.catch(() => { basePromesse = null; });
  return basePromesse;
};

const transaction = <T>(mode: IDBTransactionMode, action: (magasin: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  ouvrirBase().then(base => new Promise<T>((resoudre, rejeter) => {
    const tx = base.transaction(MAGASIN, mode);
    const requete = action(tx.objectStore(MAGASIN));
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  }));

const toutesLesEntrees = (): Promise<EntreeFile[]> =>
  transaction<EntreeFile[]>('readonly', m => m.getAll() as IDBRequest<EntreeFile[]>)
    .then(entrees => entrees.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)));

const ajouter = (entree: EntreeFile): Promise<number> =>
  transaction<IDBValidKey>('readwrite', m => m.add(entree) as IDBRequest<IDBValidKey>).then(Number);

const remplacer = (entree: EntreeFile): Promise<unknown> =>
  transaction('readwrite', m => m.put(entree) as IDBRequest<IDBValidKey>);

const supprimer = (id: number): Promise<unknown> =>
  transaction('readwrite', m => m.delete(id) as IDBRequest<undefined>);

const compter = (): Promise<number> =>
  transaction<number>('readonly', m => m.count() as IDBRequest<number>);

const rafraichirCompte = async () => {
  try {
    const entrees = await toutesLesEntrees();
    etat.enAttente = entrees.filter(e => e.essais < MAX_ESSAIS).length;
    etat.echecs = entrees.length - etat.enAttente;
  } catch {
    etat.enAttente = 0;
    etat.echecs = 0;
  }
  diffuser();
};

// ─── Mise en file ────────────────────────────────────────────────────────────

const identifiant = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* navigateur ancien : repli ci-dessous */ }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

/** La reponse rendue a l'ecran quand la requete est mise de cote.
 *
 *  202 et non 503 : l'ecran ne doit PAS afficher d'erreur. Du point de vue de
 *  la personne devant la machine, la saisie est acceptee — elle partira. Le
 *  bandeau, lui, dit combien de saisies attendent encore. */
const reponseEnFile = (id: number, cle: string) =>
  new Response(
    JSON.stringify({ horsLigne: true, enFile: true, id, cle, message: 'Enregistre sur l\'appareil — sera envoye au retour du reseau.' }),
    { status: 202, statusText: 'Accepted (hors ligne)', headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Bera-File-Attente': '1' } },
  );

const entetesDe = (requete: Request): Record<string, string> => {
  const sortie: Record<string, string> = {};
  requete.headers.forEach((valeur, nom) => {
    // Les en-tetes d'authentification sont volontairement laisses de cote :
    // le cookie de session est rejoue par le navigateur au moment de l'envoi,
    // et un jeton fige ici serait perime a l'heure ou la file repart.
    if (nom.toLowerCase() === 'cookie' || nom.toLowerCase() === 'authorization') return;
    sortie[nom] = valeur;
  });
  return sortie;
};

const mettreEnFile = async (requete: Request): Promise<Response> => {
  const cle = identifiant();
  const corps = ['GET', 'HEAD'].includes(requete.method) ? null : await requete.clone().text();
  const entree: EntreeFile = {
    url: new URL(requete.url, location.origin).pathname + new URL(requete.url, location.origin).search,
    methode: requete.method,
    entetes: entetesDe(requete),
    corps,
    cle,
    creeLe: Date.now(),
    essais: 0,
  };
  const id = await ajouter(entree);
  await rafraichirCompte();
  return reponseEnFile(id, cle);
};

// ─── Vidage de la file ───────────────────────────────────────────────────────

let fetchReseau: typeof window.fetch | null = null;

/** Une panne de reseau, distincte d'un refus du serveur : `fetch` ne rejette
 *  que dans le premier cas. Le second (400, 403, 500...) revient en `Response`
 *  et se traite differemment — le renvoyer a l'identique ne changerait rien. */
const estPanneReseau = (e: unknown) => e instanceof TypeError;

const envoyer = async (entree: EntreeFile): Promise<Response> => {
  const envoi = fetchReseau ?? window.fetch.bind(window);
  return envoi(entree.url, {
    method: entree.methode,
    headers: { ...entree.entetes, 'X-Bera-Idempotence': entree.cle, 'X-Bera-Rejoue': '1' },
    body: entree.corps,
    credentials: 'include',
  });
};

/**
 * Vide la file, une requete apres l'autre.
 *
 * Sequentiel et non parallele : l'ordre des ecritures porte du sens metier
 * (une reception de tissu doit precede la sortie qui l'entame). A la premiere
 * panne de reseau on s'arrete net et on garde le reste pour la prochaine fois.
 */
export const viderFile = async (): Promise<void> => {
  if (etat.envoiEnCours) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  etat.envoiEnCours = true;
  diffuser();
  let envoyees = 0;

  try {
    const entrees = await toutesLesEntrees();
    for (const entree of entrees) {
      if (entree.essais >= MAX_ESSAIS) continue; // deja abandonnee : visible dans les echecs
      let reponse: Response;
      try {
        reponse = await envoyer(entree);
      } catch (e) {
        if (estPanneReseau(e)) break; // reseau reparti : on reprendra plus tard
        entree.essais += 1;
        entree.derniereErreur = String(e);
        await remplacer(entree);
        continue;
      }

      if (reponse.ok || reponse.status === 409) {
        // 409 = le serveur a deja traite cette cle d'idempotence. La requete a
        // donc abouti lors d'un essai precedent : la garder la rejouerait pour
        // rien.
        await supprimer(entree.id as number);
        envoyees += 1;
        continue;
      }

      if (reponse.status === 401 || reponse.status === 403) {
        // Session expiree pendant la coupure. Ce n'est pas la requete qui est
        // mauvaise : on la garde intacte, et on arrete la — les suivantes
        // echoueraient de la meme facon jusqu'a epuiser leurs essais.
        entree.derniereErreur = `HTTP ${reponse.status}`;
        await remplacer(entree);
        break;
      }

      if (reponse.status >= 400 && reponse.status < 500) {
        // Refus definitif (donnee invalide, doublon...). La rejouer mille fois
        // ne la fera pas passer, et elle bloquerait tout ce qui suit.
        entree.essais = MAX_ESSAIS;
        entree.derniereErreur = `HTTP ${reponse.status} — ${await reponse.text().catch(() => '')}`.slice(0, 500);
        await remplacer(entree);
        continue;
      }

      // 5xx : panne passagere du serveur, on reessaiera.
      entree.essais += 1;
      entree.derniereErreur = `HTTP ${reponse.status}`;
      await remplacer(entree);
    }
  } catch (e) {
    console.warn('[file hors ligne] vidage interrompu', e);
  } finally {
    etat.envoiEnCours = false;
    if (envoyees > 0) etat.derniereSynchro = Date.now();
    await rafraichirCompte();
  }

  if (envoyees > 0) {
    // Le cache de lectures du service worker date d'AVANT ces envois : il rendrait
    // un stock ou un solde qui ignore ce qu'on vient tout juste de transmettre.
    // On le vide, pour que la prochaine lecture reparte du serveur.
    await viderCacheDonnees();
    // Les ecrans affichent encore l'etat d'avant l'envoi. On previent : a eux
    // de recharger leurs donnees depuis le serveur, qui fait desormais foi.
    try {
      window.dispatchEvent(new CustomEvent('beramethode:file-videe', { detail: { envoyees } }));
    } catch { /* ignore */ }
  }
};

/** Le service worker garde une copie des lectures de l'API pour les coupures.
 *  Apres un envoi, cette copie est perimee par construction. */
const viderCacheDonnees = async (): Promise<void> => {
  try {
    if (typeof caches === 'undefined') return;
    await caches.delete('beramethode-donnees-v1');
  } catch { /* cache inaccessible : la lecture suivante sera simplement servie depuis lui */ }
};

/** Les requetes abandonnees, pour les montrer et permettre un nouvel essai. */
export const echecsFile = async (): Promise<EntreeFile[]> =>
  (await toutesLesEntrees()).filter(e => e.essais >= MAX_ESSAIS);

/** Remet les abandonnees dans le circuit (bouton « reessayer »). */
export const relancerEchecs = async (): Promise<void> => {
  for (const entree of await echecsFile()) {
    entree.essais = 0;
    entree.derniereErreur = undefined;
    await remplacer(entree);
  }
  await rafraichirCompte();
  await viderFile();
};

/** Jette definitivement une saisie que le serveur refuse. */
export const oublierEntree = async (id: number): Promise<void> => {
  await supprimer(id);
  await rafraichirCompte();
};

// ─── Installation ────────────────────────────────────────────────────────────

let installee = false;

/**
 * Detourne `fetch` pour les ecritures de l'API.
 *
 * A poser APRES `installerRedirectionApi` et `installerEnteteAppareil` : la
 * derniere enveloppe posee s'execute la premiere, et il faut voir l'adresse
 * encore relative (`/api/...`) pour reconnaitre nos routes. Les renvois, eux,
 * repassent par l'enveloppe precedente — ils gardent donc la redirection vers
 * le serveur distant et l'identifiant d'appareil.
 */
export const installerFileHorsLigne = () => {
  if (installee || typeof window === 'undefined' || typeof indexedDB === 'undefined') return;
  installee = true;

  const precedent = window.fetch.bind(window);
  fetchReseau = precedent;

  window.fetch = ((entree: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree
      : entree instanceof URL ? entree.toString()
        : entree.url;
    const methode = String(init?.method || (entree instanceof Request ? entree.method : 'GET')).toUpperCase();

    const concernee = url.startsWith('/api/')
      && !['GET', 'HEAD', 'OPTIONS'].includes(methode)
      && !JAMAIS_EN_FILE.test(url);

    if (!concernee) return precedent(entree as any, init);

    const requete = new Request(url, entree instanceof Request ? entree : init);

    // Deja hors ligne : inutile de faire semblant d'essayer.
    if (navigator.onLine === false) return mettreEnFile(requete);

    return precedent(entree as any, init).catch((e: unknown) => {
      // `navigator.onLine` ment : il dit « en ligne » des qu'une carte reseau
      // est active, meme si le serveur de l'atelier est injoignable. Seul
      // l'echec reel du fetch le prouve.
      if (estPanneReseau(e)) return mettreEnFile(requete);
      throw e;
    });
  }) as typeof window.fetch;

  // Reprise : au retour du reseau, au demarrage, et periodiquement — un
  // evenement `online` peut manquer (veille prolongee, bascule Wi-Fi/4G).
  window.addEventListener('online', () => { void viderFile(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void viderFile();
  });
  window.setInterval(() => { void viderFile(); }, 60_000);

  void compter().then(() => rafraichirCompte()).then(() => viderFile());
};
