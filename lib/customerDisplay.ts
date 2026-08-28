/**
 * L'afficheur client — le petit écran qui fait face au comptoir.
 *
 * Le caissier voit son total sur son écran ; le client, lui, ne voit rien tant
 * qu'on ne le lui montre pas. Un afficheur de pôle (VFD 2x20, branché en USB)
 * lit le montant à sa place, et la vente cesse d'être une affaire de confiance.
 *
 * Le lien passe par Web Serial : Chrome et Edge seulement, et toujours après un
 * geste de l'utilisateur pour le tout premier branchement. Une fois le port
 * autorisé, le navigateur s'en souvient — `autoConnectDisplay` le retrouve seul
 * à l'ouverture suivante de la caisse.
 *
 * Règle de survie : rien ici ne doit jamais faire tomber la caisse. Un afficheur
 * débranché, un navigateur sans Web Serial, un port pris par une autre fenêtre —
 * on encaisse quand même. Toutes les erreurs meurent dans ce fichier.
 */

import { lsGetMig, lsSet } from './storageKeys';

/* -------------------------------------------------------------------------- */
/* Web Serial — déclarations minimales                                        */
/* Le lib DOM de TypeScript ne connaît pas encore l'API : on décrit ici juste  */
/* ce qu'on utilise, plutôt que de semer des `any` dans le code.              */
/* -------------------------------------------------------------------------- */

interface SerialPortLike {
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>;
  requestPort(): Promise<SerialPortLike>;
}

function serial(): SerialLike | null {
  if (typeof navigator === 'undefined') return null;
  const s = (navigator as Navigator & { serial?: SerialLike }).serial;
  return s ?? null;
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

export type DisplayConfig = {
  /** Débit du port. 9600 est le réglage d'usine de la quasi-totalité des VFD. */
  baudRate: number;
  /** Colonnes par ligne — 20 sur un afficheur de pôle standard. */
  columns: number;
  /** Libellé affiché au-dessus du montant, sur la première ligne. */
  label: string;
};

const CONFIG_KEY = 'beramethode_customer_display';

const DEFAUT: DisplayConfig = { baudRate: 9600, columns: 20, label: 'TOTAL' };

/**
 * Le réglage de l'afficheur, tel que ce poste l'a enregistré.
 *
 * Un poste n'est pas l'autre : le comptoir du magasin et celui de l'atelier
 * n'ont pas forcément le même modèle. Le réglage reste donc local, et toute
 * valeur douteuse retombe sur le défaut plutôt que de bloquer l'affichage.
 */
export function getDisplayConfig(): DisplayConfig {
  try {
    const brut = lsGetMig(CONFIG_KEY);
    if (!brut) return { ...DEFAUT };
    const lu = JSON.parse(brut) as Partial<DisplayConfig>;
    return {
      baudRate: Number(lu.baudRate) > 0 ? Number(lu.baudRate) : DEFAUT.baudRate,
      columns: Number(lu.columns) > 0 ? Number(lu.columns) : DEFAUT.columns,
      label: typeof lu.label === 'string' && lu.label.trim() ? lu.label : DEFAUT.label,
    };
  } catch {
    return { ...DEFAUT };
  }
}

/** Enregistre le réglage du poste et renvoie la configuration complète. */
export function setDisplayConfig(patch: Partial<DisplayConfig>): DisplayConfig {
  const suivant = { ...getDisplayConfig(), ...patch };
  try { lsSet(CONFIG_KEY, JSON.stringify(suivant)); } catch { /* stockage plein ou refusé : le défaut fera l'affaire */ }
  return suivant;
}

/* -------------------------------------------------------------------------- */
/* Connexion                                                                  */
/* -------------------------------------------------------------------------- */

let portOuvert: SerialPortLike | null = null;
/** Les écritures se font à la queue leu leu : deux `write` concurrents sur un
 *  même port se mélangent, et l'afficheur montre un montant hybride. */
let file: Promise<void> = Promise.resolve();

/** Vrai si le navigateur expose Web Serial (Chrome / Edge de bureau). */
export function isWebSerialSupported(): boolean {
  return serial() !== null;
}

async function ouvrir(port: SerialPortLike): Promise<boolean> {
  try {
    await port.open({ baudRate: getDisplayConfig().baudRate });
    portOuvert = port;
    return true;
  } catch (e) {
    // « already open » : le port est déjà ouvert par cette page — c'est un
    // succès déguisé. Tout le reste est un vrai échec.
    if (e instanceof Error && /already open/i.test(e.message)) {
      portOuvert = port;
      return true;
    }
    portOuvert = null;
    return false;
  }
}

/**
 * Branchement explicite, déclenché par le caissier.
 *
 * `requestPort` ouvre le sélecteur de port du navigateur : il exige un geste
 * utilisateur, d'où l'appel depuis un `onClick` et non depuis un effet.
 */
export async function connectDisplay(): Promise<{ ok: boolean; msg: string }> {
  const s = serial();
  if (!s) return { ok: false, msg: 'Web Serial non supporté — utilisez Chrome/Edge.' };
  if (portOuvert) return { ok: true, msg: 'Afficheur déjà connecté.' };
  try {
    const port = await s.requestPort();
    if (await ouvrir(port)) return { ok: true, msg: 'Afficheur client connecté.' };
    return { ok: false, msg: 'Port trouvé mais impossible à ouvrir — vérifiez qu\'aucune autre fenêtre ne l\'utilise.' };
  } catch {
    // L'utilisateur a fermé le sélecteur sans choisir : ce n'est pas une panne.
    return { ok: false, msg: 'Aucun afficheur sélectionné.' };
  }
}

/**
 * Reprise silencieuse à l'ouverture de la caisse.
 *
 * `getPorts` ne rend que les ports DÉJÀ autorisés par le caissier : aucun geste
 * n'est requis, et aucune fenêtre ne s'ouvre. Si rien n'est autorisé, on répond
 * simplement « non » et la caisse fonctionne sans afficheur.
 */
export async function autoConnectDisplay(): Promise<boolean> {
  const s = serial();
  if (!s) return false;
  if (portOuvert) return true;
  try {
    const ports = await s.getPorts();
    for (const port of ports) {
      if (await ouvrir(port)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Referme le port. Sans effet si rien n'est ouvert. */
export async function disconnectDisplay(): Promise<void> {
  const port = portOuvert;
  portOuvert = null;
  if (!port) return;
  try { await port.close(); } catch { /* déjà débranché */ }
}

/* -------------------------------------------------------------------------- */
/* Affichage                                                                  */
/* -------------------------------------------------------------------------- */

const ESC = 0x1b;
const CLEAR = 0x0c; // efface l'écran et ramène le curseur en haut à gauche
const LF = 0x0a;
const CR = 0x0d;

/** Un VFD affiche de l'ASCII : les accents et le « ن » deviendraient des
 *  hiéroglyphes. On les retire plutôt que de les envoyer tels quels. */
function ascii(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ');
}

/** Cale le libellé à gauche et le montant à droite, sur la largeur de l'écran. */
function ligneJustifiee(gauche: string, droite: string, colonnes: number): string {
  const g = ascii(gauche);
  const d = ascii(droite);
  const espace = colonnes - g.length - d.length;
  if (espace < 1) return (g + ' ' + d).slice(0, colonnes);
  return g + ' '.repeat(espace) + d;
}

async function ecrire(octets: Uint8Array): Promise<void> {
  const port = portOuvert;
  if (!port || !port.writable) return;
  const writer = port.writable.getWriter();
  try {
    await writer.write(octets);
  } finally {
    // Sans `releaseLock`, le flux reste verrouillé et l'écriture suivante
    // échoue en silence : l'afficheur se figerait sur le premier montant.
    try { writer.releaseLock(); } catch { /* flux déjà rendu */ }
  }
}

/**
 * Montre le total au client.
 *
 * Appelée à chaque changement du panier, donc très souvent : elle ne renvoie
 * rien, ne lève rien, et n'est jamais attendue par l'appelant. Si l'afficheur
 * n'est pas là, l'appel ne coûte rien.
 */
export function sendToCustomerDisplay(total: number, currency: string): void {
  if (!portOuvert) return;
  const { columns, label } = getDisplayConfig();
  const montant = `${(Math.round((Number(total) || 0) * 100) / 100).toFixed(2)} ${currency ?? ''}`.trim();

  const texte = ligneJustifiee(label, '', columns) + '\r\n' + ligneJustifiee('', montant, columns);
  const corps = new TextEncoder().encode(texte);
  const trame = new Uint8Array(corps.length + 4);
  // ESC @ : réinitialise l'afficheur — il peut avoir gardé un mode d'un poste
  // précédent (clignotement, défilement) qui rendrait le montant illisible.
  trame.set([ESC, 0x40, CLEAR], 0);
  trame.set(corps, 3);
  trame[trame.length - 1] = CR;

  // Chaînée sur la file : le dernier montant demandé est le dernier affiché.
  file = file
    .then(() => ecrire(trame))
    .catch(() => {
      // Câble arraché en pleine vente : on oublie le port pour que le bouton
      // « connecter » redevienne proposable, et la caisse continue.
      portOuvert = null;
    });
}

/** Efface l'écran client — fin de vente, le montant précédent ne traîne pas. */
export function clearCustomerDisplay(): void {
  if (!portOuvert) return;
  file = file
    .then(() => ecrire(new Uint8Array([ESC, 0x40, CLEAR, LF])))
    .catch(() => { portOuvert = null; });
}
