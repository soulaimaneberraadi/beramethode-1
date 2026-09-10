/**
 * DEUX TÉLÉPHONES, UN SEUL COMPTE.
 *
 * La question que pose cette suite est celle de l'atelier : « je saisis ici,
 * est-ce que ça arrive là-bas — et est-ce que ça y reste ? »
 *
 * On ne simule pas la synchro : on fait tourner le VRAI `cloudSync`, celui qui
 * part sur les téléphones. Seuls le stockage du navigateur et le serveur sont
 * remplacés — par un stockage en mémoire par appareil, et par une unique ligne
 * `user_data` partagée, exactement comme sur Supabase (un UPSERT remplace la
 * ligne ENTIÈRE : c'est de là que vient tout le danger).
 *
 * Chaque appareil importe le module sous un chemin distinct : sans cela, les
 * deux téléphones partageraient les variables du module (signature du dernier
 * envoi, compteur de travail non envoyé) et le test mentirait.
 */

import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const RACINE = dirname(dirname(dirname(fileURLToPath(import.meta.url)))); // .../beramethode-1

// ── Le navigateur, en mémoire ────────────────────────────────────────────────

/* `Storage` existe dans tout navigateur ; `cloudSync` s'appuie dessus des son
   chargement (il garde `Storage.prototype.setItem` pour poser son declencheur
   d'envoi). Sous Node il faut le fournir. */
class Storage {
  getItem(_k: string): string | null { return null; }
  setItem(_k: string, _v: string): void {}
  removeItem(_k: string): void {}
}
(globalThis as any).Storage = Storage;

class StockageMemoire extends Storage {
  private m = new Map<string, string>();
  constructor() { super(); }
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  override getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  override setItem(k: string, v: string) { this.m.set(k, String(v)); }
  override removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

/** L'unique ligne `user_data` du compte — ce que les deux téléphones se disputent. */
const serveur: { updated_at: string; data: Record<string, unknown> } | null[] = [] as never;
let ligne: { user_id: string; updated_at: string; data: Record<string, unknown> } | null = null;

const UID = '4c42b6d3-2dbc-49fc-961e-4b94dc452452';

/** Le peu de PostgREST dont `cloudSync` se sert : lire la ligne, la remplacer. */
const faireServeur = async (url: string, init?: any): Promise<any> => {
  const u = new URL(url);
  const methode = (init?.method || 'GET').toUpperCase();
  const entetes = new Headers(init?.headers || {});
  const veutUnObjet = (entetes.get('Accept') || '').includes('pgrst.object');

  if (!u.pathname.endsWith('/user_data')) {
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (methode === 'GET') {
    const select = (u.searchParams.get('select') || '*').split(',');
    const lignes = ligne ? [ligne] : [];
    const projetees = lignes.map((l) => {
      if (select.includes('*')) return l;
      const o: Record<string, unknown> = {};
      for (const c of select) if (c in l) o[c] = (l as any)[c];
      return o;
    });
    if (veutUnObjet) {
      if (!projetees.length) {
        // PGRST116 : « aucune ligne » — ce que `maybeSingle()` traduit en `null`.
        return new Response(JSON.stringify({ code: 'PGRST116', message: 'no rows' }), {
          status: 406, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(projetees[0]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(projetees), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (methode === 'POST') {
    // UPSERT : la ligne entière est REMPLACÉE, comme sur le vrai serveur.
    const corps = JSON.parse(String(init?.body ?? '{}'));
    const enreg = Array.isArray(corps) ? corps[0] : corps;
    ligne = { user_id: enreg.user_id, updated_at: enreg.updated_at, data: enreg.data };
    return new Response('', { status: 201 });
  }

  return new Response('', { status: 204 });
};

// ── Un appareil ──────────────────────────────────────────────────────────────

type Appareil = {
  nom: string;
  stockage: StockageMemoire;
  sessionStockage: StockageMemoire;
  sync: typeof import('./cloudSync');
};

let actif: Appareil | null = null;

/** Bascule le « navigateur » global sur cet appareil. */
const allumer = (a: Appareil) => {
  actif = a;
  (globalThis as any).localStorage = a.stockage;
  (globalThis as any).sessionStorage = a.sessionStockage;
};

/**
 * Charge une copie NEUVE de la synchro — le propre d'un second téléphone.
 *
 * Un simple second `import` ne suffit pas : Node garde le module en cache et
 * les deux appareils partageraient alors les variables du module (signature du
 * dernier envoi, compteur de travail non envoyé). Le test passait au vert en
 * ne testant qu'un seul téléphone. On vide donc le cache des fichiers DU DÉPÔT
 * (jamais ceux de `node_modules`) avant chaque chargement : l'instance déjà
 * obtenue reste vivante dans sa variable, la suivante repart de zéro.
 */
const chargerSyncNeuve = (): typeof import('./cloudSync') => {
  for (const chemin of Object.keys(require_.cache)) {
    if (chemin.startsWith(RACINE) && !chemin.includes('node_modules')) delete require_.cache[chemin];
  }
  return require_('./cloudSync.ts') as typeof import('./cloudSync');
};

const creerAppareil = async (nom: string): Promise<Appareil> => {
  const a: Appareil = {
    nom,
    stockage: new StockageMemoire(),
    sessionStockage: new StockageMemoire(),
    sync: null as never,
  };
  allumer(a);
  a.sync = chargerSyncNeuve();
  return a;
};

/** Ce que l'appareil détient pour une clé. */
const lire = (a: Appareil, cle: string): any => {
  const brut = a.stockage.getItem(cle);
  return brut == null ? null : JSON.parse(brut);
};

const ecrire = (a: Appareil, cle: string, valeur: unknown) => {
  a.stockage.setItem(cle, JSON.stringify(valeur));
};

/** L'appareil envoie, puis reçoit — le cycle exact d'un retour dans l'application. */
const synchroniser = async (a: Appareil) => {
  allumer(a);
  await a.sync.pushSnapshotToCloud(UID);
  await a.sync.pullSnapshotFromCloud(UID, { force: true });
  await a.sync.pushSnapshotToCloud(UID);
};

// ── Le harnais ───────────────────────────────────────────────────────────────

let echecs = 0;
const verifier = (titre: string, condition: boolean, detail?: string) => {
  if (condition) { console.log(`  ok   ${titre}`); return; }
  echecs += 1;
  console.log(`  ECHEC ${titre}${detail ? ` — ${detail}` : ''}`);
};

const ids = (liste: any[] | null): string[] =>
  (liste ?? []).map((x) => String(x?.id)).sort();

// ── Mise en place ────────────────────────────────────────────────────────────

const stockageBidon = new StockageMemoire();
(globalThis as any).localStorage = stockageBidon;
(globalThis as any).sessionStorage = new StockageMemoire();
(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  location: { href: 'https://beramethode.vercel.app/', hostname: 'beramethode.vercel.app' },
};
(globalThis as any).document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  visibilityState: 'visible',
};
// `navigator` est en lecture seule sous Node : on redéfinit la propriété.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
(globalThis as any).CustomEvent = class { constructor(public type: string, public detail?: unknown) {} } as never;
(globalThis as any).fetch = faireServeur;

const main = async () => {
  const A = await creerAppareil('Téléphone A');
  const B = await creerAppareil('Téléphone B');

  /* La premisse du test, verifiee avant tout le reste : deux appareils, donc
     deux etats de module distincts (signature du dernier envoi, compteur de
     travail non envoye). S'ils partageaient ces variables, chaque resultat qui
     suit serait faux sans qu'on le voie. */
  verifier('les deux appareils ont bien des etats separes', A.sync.SYNC_KEYS !== B.sync.SYNC_KEYS);

  const t = (h: number) => new Date(Date.UTC(2026, 8, 10, h, 0, 0)).toISOString();

  // ── 1. Ce que A crée arrive chez B ─────────────────────────────────────────
  allumer(A);
  ecrire(A, 'beramethode_library', [
    { id: 'm1', name: 'Chemise', updatedAt: t(8) },
    { id: 'm2', name: 'Pantalon', updatedAt: t(8) },
  ]);
  ecrire(A, 'beramethode_settings', { devise: 'MAD', tva: 20 });
  await synchroniser(A);

  await synchroniser(B);
  verifier(
    'ce que A crée arrive chez B',
    JSON.stringify(ids(lire(B, 'beramethode_library'))) === JSON.stringify(['m1', 'm2']),
    `B a ${JSON.stringify(ids(lire(B, 'beramethode_library')))}`,
  );

  // ── 2. Saisies simultanées : aucune ne se perd ─────────────────────────────
  // Chacun saisit de son côté SANS avoir vu l'autre. C'est le cas dangereux :
  // l'UPSERT remplace la ligne entière, donc le dernier arrivé pourrait
  // effacer le travail du premier.
  allumer(A);
  ecrire(A, 'beramethode_suivis', [
    { id: 's1', chaineId: 'c1', date: '2026-09-10', pieces: 120, updatedAt: t(9) },
  ]);
  allumer(B);
  ecrire(B, 'beramethode_suivis', [
    { id: 's2', chaineId: 'c2', date: '2026-09-10', pieces: 80, updatedAt: t(9) },
  ]);

  await synchroniser(A);
  await synchroniser(B);
  await synchroniser(A);

  verifier(
    'deux saisies simultanées : les deux survivent chez A',
    JSON.stringify(ids(lire(A, 'beramethode_suivis'))) === JSON.stringify(['s1', 's2']),
    `A a ${JSON.stringify(ids(lire(A, 'beramethode_suivis')))}`,
  );
  verifier(
    'deux saisies simultanées : les deux survivent chez B',
    JSON.stringify(ids(lire(B, 'beramethode_suivis'))) === JSON.stringify(['s1', 's2']),
    `B a ${JSON.stringify(ids(lire(B, 'beramethode_suivis')))}`,
  );

  // ── 3. Une suppression faite sur A disparaît AUSSI chez B ──────────────────
  // Le défaut du 08/09 : le modèle supprimé revenait dans l'envoi, le serveur
  // le gardait, et le diagnostic affichait « serveur 7 · ici 6 » pour toujours.
  allumer(A);
  ecrire(A, 'beramethode_library', [{ id: 'm1', name: 'Chemise', updatedAt: t(8) }]);
  ecrire(A, 'beramethode_tombstones', [
    { type: 'models', id: 'm2', deleted_at: t(10) },
  ]);
  await synchroniser(A);

  verifier(
    'la suppression atteint le serveur',
    JSON.stringify(ids((ligne?.data as any)?.beramethode_library)) === JSON.stringify(['m1']),
    `serveur : ${JSON.stringify(ids((ligne?.data as any)?.beramethode_library))}`,
  );

  await synchroniser(B);
  verifier(
    'la suppression atteint le second téléphone',
    JSON.stringify(ids(lire(B, 'beramethode_library'))) === JSON.stringify(['m1']),
    `B a ${JSON.stringify(ids(lire(B, 'beramethode_library')))}`,
  );

  // ── 4. La suppression NE REVIENT PAS ───────────────────────────────────────
  // B détient encore la pierre tombale ; A repasse. Rien ne doit ressusciter.
  await synchroniser(A);
  await synchroniser(B);
  await synchroniser(A);
  verifier(
    'le modèle supprimé ne ressuscite pas',
    JSON.stringify(ids(lire(A, 'beramethode_library'))) === JSON.stringify(['m1'])
      && JSON.stringify(ids(lire(B, 'beramethode_library'))) === JSON.stringify(['m1'])
      && JSON.stringify(ids((ligne?.data as any)?.beramethode_library)) === JSON.stringify(['m1']),
    `A ${JSON.stringify(ids(lire(A, 'beramethode_library')))} · B ${JSON.stringify(ids(lire(B, 'beramethode_library')))} · serveur ${JSON.stringify(ids((ligne?.data as any)?.beramethode_library))}`,
  );

  // ── 5. Un réglage enregistré ici n'est pas écrasé par l'ancienne valeur ────
  // Les réglages ne sont pas une liste : le pull les remplace en bloc. Un
  // réglage tout juste saisi sur B, pas encore parti, doit survivre au pull.
  allumer(B);
  ecrire(B, 'beramethode_settings', { devise: 'MAD', tva: 20, horaireVendredi: '14:30' });
  allumer(B);
  await B.sync.pullSnapshotFromCloud(UID, { force: true });
  verifier(
    'un réglage non encore envoyé survit à une réception',
    (lire(B, 'beramethode_settings') as any)?.horaireVendredi === '14:30',
    `B a ${JSON.stringify(lire(B, 'beramethode_settings'))}`,
  );

  await synchroniser(B);
  await synchroniser(A);
  verifier(
    'ce réglage finit par atteindre l’autre téléphone',
    (lire(A, 'beramethode_settings') as any)?.horaireVendredi === '14:30',
    `A a ${JSON.stringify(lire(A, 'beramethode_settings'))}`,
  );

  // ── 6. Convergence : plus aucun écart, comme au diagnostic ─────────────────
  await synchroniser(A);
  await synchroniser(B);
  await synchroniser(A);

  const CLES = A.sync.SYNC_KEYS;
  const compter = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);
  const ecarts: string[] = [];
  for (const k of CLES) {
    const cs = compter((ligne?.data as any)?.[k]);
    const ca = compter(lire(A, k));
    const cb = compter(lire(B, k));
    if (cs !== ca || cs !== cb) ecarts.push(`${k} : serveur ${cs} · A ${ca} · B ${cb}`);
  }
  verifier('les 22 clés s’accordent sur les deux téléphones', ecarts.length === 0, ecarts.join(' | '));

  console.log(echecs ? `\n${echecs} vérification(s) en échec.` : '\nDeux téléphones, un compte : tout concorde.');
  /* Sortie explicite : le client Supabase arme des minuteries (renouvellement
     du jeton) qui gardent Node en vie indefiniment. Sans cela la suite passe
     au vert puis ne rend jamais la main. */
  process.exit(echecs ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
