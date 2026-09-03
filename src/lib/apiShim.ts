/**
 * Intercepteur fetch pour static mode (Vercel/phone).
 *
 * Lecture: traduit /api/* en lectures depuis le snapshot localStorage
 * (synchronisé depuis Supabase).
 *
 * Écriture (NEW): traduit POST/PUT/PATCH/DELETE en mutations directes du
 * localStorage. Le `setItem` est intercepté par cloudSync qui pousse le
 * snapshot vers Supabase, et le serveur PC reçoit la mise à jour via
 * son listener realtime → fusion dans SQLite. Les suppressions passent
 * par un mécanisme de tombstones (recovery 1h).
 */

import { pkey } from '../../lib/storageKeys';
import { deshydraterModeles, nettoyerPhotosOrphelines, rehydraterModeles } from '../../lib/photosLocales';
import { calculerKpisLocaux } from '../../lib/kpisLocaux';

const TOMBSTONES_KEY = 'beramethode_tombstones';
const SQLITE_EXPORT_KEY = '__bera_sqlite_export__';
const TOMBSTONE_TTL_MS = 60 * 60 * 1000; // 1h — fenêtre de restauration
/** Durée pendant laquelle la suppression reste opposable à la synchro. Une
 *  pierre tombale pèse ~90 octets : un an d'historique tient sans peine, et
 *  c'est ce qui empêche le cloud de réinstaller ce qu'on a supprimé. */
const TOMBSTONE_KEEP_MS = 365 * 24 * 60 * 60 * 1000;
/** Garde-fou de volume : au-delà, on ne garde que les plus récentes. */
const MAX_TOMBSTONES = 5000;

const p = (key: string) => pkey(key);

const readJson = (key: string): any => {
  try { const v = localStorage.getItem(p(key)); return v ? JSON.parse(v) : null; } catch { return null; }
};

/**
 * Écrit — ou LÈVE une erreur.
 *
 * L'échec était avalé ici : le stockage du téléphone refusait la ligne
 * (mémoire pleine), la fonction n'en disait rien, et l'écran affichait
 * « enregistré » sur un modèle qui n'existait nulle part. On préfère une
 * erreur franche, qui remonte jusqu'à l'utilisateur, à un succès imaginaire.
 */
const writeJson = (key: string, value: any) => {
  try {
    localStorage.setItem(p(key), JSON.stringify(value));
  } catch (e) {
    console.error(`[apiShim] écriture refusée (${key})`, e);
    try {
      window.dispatchEvent(new CustomEvent('beramethode:storage-full', { detail: { key } }));
    } catch { /* ignore */ }
    throw e;
  }
};

// ─── Entity store registry ───────────────────────────────────────────────────
// Maps a logical entity name to either a top-level localStorage key (kind=ls)
// or a path inside __bera_sqlite_export__ (kind=export).

type StoreRef =
  | { kind: 'ls'; key: string }
  | { kind: 'export'; path: string[] };

const STORES: Record<string, StoreRef> = {
  models:           { kind: 'ls', key: 'beramethode_library' },
  planning:         { kind: 'ls', key: 'beramethode_planning' },
  suivi:            { kind: 'ls', key: 'beramethode_suivis' },
  'demandes-appro': { kind: 'ls', key: 'beramethode_demandesAppro' },
  'worker-skills':  { kind: 'export', path: ['workerSkills'] },
  'worker-pointage':{ kind: 'export', path: ['workerPointage'] },
  'poste-suivi':    { kind: 'export', path: ['posteSuivi'] },
  'magasin/products':    { kind: 'export', path: ['magasin', 'products'] },
  'magasin/lots':        { kind: 'export', path: ['magasin', 'lots'] },
  'magasin/mouvements':  { kind: 'export', path: ['magasin', 'mouvements'] },
  'magasin/commandes':   { kind: 'export', path: ['magasin', 'commandes'] },
  'magasin/demandes':    { kind: 'export', path: ['magasin', 'demandes'] },
  'hr/workers':     { kind: 'export', path: ['hr', 'workers'] },
  'hr/pointage':    { kind: 'export', path: ['hr', 'pointage'] },
  'hr/production':  { kind: 'export', path: ['hr', 'production'] },
  'hr/avances':     { kind: 'export', path: ['hr', 'avances'] },
  subcontract:            { kind: 'ls', key: 'beramethode_subcontract_orders' },
  'subcontract/groups':   { kind: 'ls', key: 'beramethode_subcontract_groups' },
  'subcontract/profiles': { kind: 'ls', key: 'beramethode_subcontract_profiles' },
};

// ─── Generic entity reader / writer ──────────────────────────────────────────

const readArray = (name: string): any[] => {
  const ref = STORES[name];
  if (!ref) return [];
  if (ref.kind === 'ls') return readJson(ref.key) || [];
  const exp = readJson(SQLITE_EXPORT_KEY);
  let node: any = exp;
  for (const p of ref.path) {
    if (!node) return [];
    node = node[p];
  }
  return Array.isArray(node) ? node : [];
};

const writeArray = (name: string, arr: any[]) => {
  const ref = STORES[name];
  if (!ref) return;
  if (ref.kind === 'ls') { writeJson(ref.key, arr); return; }
  const exp = readJson(SQLITE_EXPORT_KEY) || {};
  let node: any = exp;
  for (let i = 0; i < ref.path.length - 1; i++) {
    const k = ref.path[i];
    if (!node[k] || typeof node[k] !== 'object') node[k] = {};
    node = node[k];
  }
  node[ref.path[ref.path.length - 1]] = arr;
  writeJson(SQLITE_EXPORT_KEY, exp);
};

// ─── Tombstones ──────────────────────────────────────────────────────────────

type Tombstone = { type: string; id: string; deleted_at: string };

const readTombstones = (): Tombstone[] => readJson(TOMBSTONES_KEY) || [];
const writeTombstones = (ts: Tombstone[]) => writeJson(TOMBSTONES_KEY, ts);

/**
 * Les identifiants supprimés, SANS limite de corbeille.
 *
 * Il y a deux durées, et les confondre faisait ressusciter les données :
 *  - `TOMBSTONE_TTL_MS` (1 h) = la fenêtre pendant laquelle on peut RESTAURER.
 *  - `TOMBSTONE_KEEP_MS` (1 an) = la durée pendant laquelle la suppression
 *    reste OPPOSABLE à la synchro.
 * En n'utilisant que la première, une suppression cessait d'exister au bout
 * d'une heure ; la copie restée dans le cloud repassait alors la fusion union
 * et réinstallait l'élément — 33 modèles supprimés sont revenus ainsi.
 */
export const tombstonedIds = (type: string): Set<string> => {
  const now = Date.now();
  const ts = readTombstones().filter(t => {
    if (t.type !== type) return false;
    const d = new Date(t.deleted_at).getTime();
    return now - d < TOMBSTONE_KEEP_MS;
  });
  return new Set(ts.map(t => String(t.id)));
};

/** Ce que la Corbeille peut encore rendre : la fenêtre d'une heure. */
export const restorableTombstones = (): Tombstone[] => {
  const now = Date.now();
  return readTombstones().filter(t => now - new Date(t.deleted_at).getTime() < TOMBSTONE_TTL_MS);
};

export const addTombstone = (type: string, id: string) => {
  const ts = readTombstones().filter(t => !(t.type === type && String(t.id) === String(id)));
  ts.push({ type, id: String(id), deleted_at: new Date().toISOString() });
  writeTombstones(ts);
};

const removeTombstone = (type: string, id: string) => {
  const ts = readTombstones().filter(t => !(t.type === type && String(t.id) === String(id)));
  writeTombstones(ts);
};

/**
 * Passé l'heure de grâce, la ligne quitte réellement le stockage — mais la
 * pierre tombale, elle, RESTE. C'est tout l'inverse d'avant : on effaçait la
 * preuve de la suppression en même temps que la donnée, et la synchro, ne
 * voyant plus aucune trace, réinstallait la copie du cloud.
 * Tourne au fil des appels ; ne coûte rien quand il n'y a rien à faire.
 */
const purgeExpiredTombstones = () => {
  const ts = readTombstones();
  if (ts.length === 0) return;
  const now = Date.now();
  // 1. Les lignes dont la corbeille a expiré sortent du stockage.
  const aSupprimer: Record<string, Set<string>> = {};
  for (const t of ts) {
    if (now - new Date(t.deleted_at).getTime() < TOMBSTONE_TTL_MS) continue;
    (aSupprimer[t.type] ||= new Set()).add(String(t.id));
  }
  for (const [type, ids] of Object.entries(aSupprimer)) {
    const arr = readArray(type);
    const next = arr.filter((it: any) => !ids.has(String(it.id)));
    if (next.length !== arr.length) writeArray(type, next);
  }
  // 2. Les pierres tombales ne tombent qu'au bout d'un an, ou si elles
  //    deviennent trop nombreuses — les plus récentes d'abord.
  const vivantes = ts.filter(t => now - new Date(t.deleted_at).getTime() < TOMBSTONE_KEEP_MS);
  const bornees = vivantes.length > MAX_TOMBSTONES
    ? vivantes
        .slice()
        .sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime())
        .slice(0, MAX_TOMBSTONES)
    : vivantes;
  if (bornees.length !== ts.length) writeTombstones(bornees);
};

// ─── CRUD helpers ────────────────────────────────────────────────────────────

/**
 * Upsert d'un enregistrement.
 *
 * `merge=true` (PUT/PATCH partiels) : on FUSIONNE avec l'existant au lieu de le
 * remplacer. Le front envoie régulièrement des mises à jour partielles
 * (`{ status }` seul, `{ tissuStatus }` seul depuis une pastille) ; un remplacement
 * intégral effaçait alors pricePerPiece, totalQuantity et la grille couleur×taille
 * — perte de données à impact financier direct.
 */
const upsertItem = async (type: string, item: any, merge = false): Promise<any> => {
  if (!STORES[type]) return null;
  const id = String(item.id ?? Date.now());
  const arr = readArray(type);
  const idx = arr.findIndex((it: any) => String(it.id) === id);
  const existing = idx >= 0 ? arr[idx] : null;
  const next = merge && existing ? { ...existing, ...item, id } : { ...item, id };
  if (idx >= 0) arr[idx] = next; else arr.push(next);
  // Un modèle arrive ici avec ses photos en clair (il vient d'une lecture
  // réhydratée). On les range dans IndexedDB avant d'écrire : sans cela, la
  // bibliothèque regonflerait à chaque enregistrement et retrouverait le
  // plafond de 5 Mo qu'on vient de lui faire quitter.
  writeArray(type, type === 'models' ? await deshydraterModeles(arr) : arr);
  if (type === 'models') void nettoyerPhotosOrphelines();
  removeTombstone(type, id); // restoring a deleted item by upserting
  return next;
};

const softDeleteItem = (type: string, id: string): boolean => {
  if (!STORES[type]) return false;
  const arr = readArray(type);
  const exists = arr.some((it: any) => String(it.id) === String(id));
  if (!exists) return false;
  addTombstone(type, id);
  // Trigger a localStorage write on the parent key so cloudSync pushes.
  writeArray(type, arr);
  return true;
};

// ─── Resolve incoming URL → {type, id} ───────────────────────────────────────
// Patterns supported:
//   /api/models                  → type=models
//   /api/models/abc              → type=models, id=abc
//   /api/magasin/products        → type=magasin/products
//   /api/magasin/products/abc    → type=magasin/products, id=abc
//   /api/hr/workers/123          → type=hr/workers, id=123

const resolveTypeAndId = (pathname: string): { type: string; id: string | null } | null => {
  const m = pathname.match(/^\/api\/(.+?)\/?$/);
  if (!m) return null;
  const parts = m[1].split('/').filter(Boolean);

  // Try matching longest possible store name first
  for (let len = Math.min(parts.length, 3); len >= 1; len--) {
    const candidate = parts.slice(0, len).join('/');
    if (STORES[candidate]) {
      const rest = parts.slice(len);
      const id = rest.length > 0 ? rest.join('/') : null;
      return { type: candidate, id };
    }
  }
  return null;
};

// ─── GET routes ──────────────────────────────────────────────────────────────

const filterAlive = (type: string, arr: any[]): any[] => {
  const dead = tombstonedIds(type);
  return dead.size === 0 ? arr : arr.filter((it: any) => !dead.has(String(it.id)));
};

// Lit l'identité société depuis le localStorage (clé synchronisée via cloudSync).
const readCompany = () => {
  const c = readJson('beramethode_company') || {};
  return {
    ok: true,
    store: 'company_settings' as const,
    canEdit: true,
    name: c.name || '',
    logo: c.logo || null,
    specialty: c.specialty || '',
    accountType: c.accountType || 'societe',
    profileMeta: c.profileMeta || null,
  };
};

const handleGet = (pathname: string): any => {
  // Specials
  if (/^\/api\/auth\/me$/.test(pathname)) return { user: null };
  // Indicateurs du tableau de bord : calcules ici, faute de serveur. Sans cela
  // la requete tombait dans « aucun magasin pour ce chemin » et renvoyait un
  // tableau vide — d'ou un tableau de bord entierement a zero alors que les
  // donnees etaient bien la.
  if (/^\/api\/dashboard\/kpis$/.test(pathname)) {
    return calculerKpisLocaux({
      planning: filterAlive('planning', readArray('planning')),
      suivis: filterAlive('suivi', readArray('suivi')),
      hrWorkers: readArray('hr/workers'),
      hrPointage: readArray('hr/pointage'),
      hrAvances: readArray('hr/avances'),
      produits: readArray('magasin/products'),
      lots: readArray('magasin/lots'),
      mouvements: readArray('magasin/mouvements'),
      demandesAppro: filterAlive('demandes-appro', readArray('demandes-appro')),
    });
  }
  if (/^\/api\/network-info$/.test(pathname)) return { ip: '127.0.0.1', host: 'static' };
  if (/^\/api\/settings$/.test(pathname)) return readJson('beramethode_settings') || {};
  // Identité société (onglet Entreprise de l'admin) — sinon « Chargement… » infini.
  if (/^\/api\/permissions\/company$/.test(pathname)) return readCompany();
  if (/^\/api\/permissions\/me$/.test(pathname)) {
    const c = readJson('beramethode_company') || {};
    return { isSuper: true, ownerId: null, roleId: null, pages: {}, fields: {}, hiddenPages: [], accountType: c.accountType || 'societe' };
  }
  if (/^\/api\/dashboard\/kpis$/.test(pathname)) {
    const planning = filterAlive('planning', readArray('planning'));
    const models = filterAlive('models', readArray('models'));
    const enCours = planning.filter((p: any) => p.status === 'IN_PROGRESS' || p.status === 'READY').length;
    return {
      of_en_cours: enCours,
      of_total: planning.length,
      modeles_actifs: models.length,
      effectif_present_today: 0,
      valeur_stock: 0,
      avances_en_cours: 0,
      trs_global: 0,
      production_journaliere: 0,
    };
  }
  // Numéro de facture séquentiel (mode statique) : même contrat que le serveur
  // — { number: string } au format FV-<année>-<0000>. La séquence est déduite du
  // max local des factures déjà connues, faute de SQLite côté navigateur.
  if (/^\/api\/subcontract\/next-invoice-number$/.test(pathname)) {
    const year = new Date().getFullYear();
    const prefix = `FV-${year}-`;
    const exp = readJson(SQLITE_EXPORT_KEY) || {};
    const factures: any[] = Array.isArray(exp?.factures) ? exp.factures : [];
    let max = 0;
    for (const f of factures) {
      const n = String(f?.numero || '');
      if (!n.startsWith(prefix)) continue;
      const seq = parseInt(n.slice(prefix.length), 10);
      if (Number.isFinite(seq) && seq > max) max = seq;
    }
    return { number: `${prefix}${String(max + 1).padStart(4, '0')}` };
  }
  // Tombstones inspection endpoint (for Corbeille UI)
  if (/^\/api\/_tombstones$/.test(pathname)) {
    try { purgeExpiredTombstones(); } catch { /* stockage plein : on montre au moins la corbeille */ }
    // La Corbeille ne montre que ce qu'elle peut encore rendre : l'historique
    // complet sert a la synchro, pas a l'ecran.
    return restorableTombstones();
  }
  // Generic
  const r = resolveTypeAndId(pathname);
  if (!r) return [];
  const arr = filterAlive(r.type, readArray(r.type));
  if (r.id != null) return arr.find((it: any) => String(it.id) === r.id) || null;
  return arr;
};

// ─── Install ─────────────────────────────────────────────────────────────────

const installed = { v: false };

export const installApiShim = () => {
  if (installed.v) return;
  installed.v = true;

  // Purge once on install
  try { purgeExpiredTombstones(); } catch {}
  // And every 5 minutes thereafter
  setInterval(() => { try { purgeExpiredTombstones(); } catch {} }, 5 * 60 * 1000);

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? new URL(input, location.origin)
      : input instanceof URL ? input : new URL((input as Request).url, location.origin);

    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) {
      return originalFetch(input as any, init);
    }

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const reply = (body: any, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    });

    // Skip auth POSTs (Supabase handles auth elsewhere)
    if (url.pathname.startsWith('/api/auth/')) return reply({ ok: true });

    if (method === 'GET' || method === 'HEAD') {
      const resultat = handleGet(url.pathname);
      // Les modèles sortent du stockage avec des références ; l'appelant, lui,
      // attend des images. La Coupe et l'export lisent par ici.
      const r = resolveTypeAndId(url.pathname);
      if (r?.type === 'models' && resultat) {
        try {
          const rendu = Array.isArray(resultat)
            ? await rehydraterModeles(resultat)
            : (await rehydraterModeles([resultat]))[0];
          return reply(rendu);
        } catch { /* magasin illisible : on répond sans les images */ }
      }
      return reply(resultat);
    }

    // Parse body
    let body: any = null;
    try {
      const txt = init?.body ? (typeof init.body === 'string' ? init.body : await new Response(init.body as any).text()) : '';
      body = txt ? JSON.parse(txt) : null;
    } catch { body = null; }

    // 507 « Insufficient Storage » : la mémoire du navigateur a refusé
    // l'écriture. Ce code existe pour ça, et il vaut mille fois mieux qu'un 200
    // menteur — l'écran peut enfin dire à l'utilisateur que rien n'est
    // enregistré, au lieu de le lui laisser découvrir le lendemain.
    const stockagePlein = () => reply({
      ok: false,
      error: 'storage_full',
      message: "Mémoire de l'appareil pleine : l'enregistrement a échoué. Libérez de l'espace puis réessayez.",
    }, 507);

    try {
      // Identité société : persiste dans le localStorage (clé synchronisée).
      if (/^\/api\/permissions\/company$/.test(url.pathname) && (method === 'PUT' || method === 'POST')) {
        const prev = readJson('beramethode_company') || {};
        writeJson('beramethode_company', { ...prev, ...(body || {}) });
        return reply(readCompany());
      }

      const r = resolveTypeAndId(url.pathname);
      if (!r) return reply({ ok: true, static: true, note: 'no store for path' });

      // POST → upsert (with body) ; PUT/PATCH → upsert at id ; DELETE → soft delete
      if (method === 'POST') {
        if (body == null) return reply({ ok: false, error: 'empty body' }, 400);
        const saved = await upsertItem(r.type, body);
        return reply(saved ?? { ok: true });
      }
      if (method === 'PUT' || method === 'PATCH') {
        if (body == null && r.id == null) return reply({ ok: false }, 400);
        const item = { ...(body || {}), id: r.id ?? body?.id };
        // merge=true : PUT/PATCH sont partiels côté front (cf. upsertItem).
        // S'aligne sur le serveur SQLite dont l'UPDATE ne touche que les champs fournis.
        const saved = await upsertItem(r.type, item, true);
        return reply(saved ?? { ok: true });
      }
      if (method === 'DELETE') {
        const id = r.id ?? body?.id;
        if (!id) return reply({ ok: false, error: 'no id' }, 400);
        const ok = softDeleteItem(r.type, String(id));
        return reply({ ok, soft_deleted: ok, recoverable_for_ms: TOMBSTONE_TTL_MS });
      }
      return reply({ ok: true, static: true });
    } catch (e) {
      return stockagePlein();
    }
  };
};

// ─── Public API for Corbeille UI / restore button ────────────────────────────

export const beraCorbeille = {
  list: (): Tombstone[] => {
    purgeExpiredTombstones();
    return restorableTombstones();
  },
  restore: (type: string, id: string): boolean => {
    removeTombstone(type, id);
    // Trigger sync push. Les valeurs relues sont déjà déshydratées : on les
    // réécrit telles quelles, sans repasser par le magasin de photos.
    const arr = readArray(type);
    writeArray(type, arr);
    return true;
  },
  /** Suppression définitive : la ligne part, la pierre tombale RESTE. La
   *  retirer ici rouvrait la porte au cloud, qui réinstallait aussitôt ce que
   *  l'utilisateur venait de supprimer pour de bon. */
  hardDelete: (type: string, id: string): boolean => {
    const arr = readArray(type);
    const next = arr.filter((it: any) => String(it.id) !== String(id));
    addTombstone(type, String(id));
    if (next.length === arr.length) return false;
    writeArray(type, next);
    return true;
  },
  ttlMs: TOMBSTONE_TTL_MS,
};

if (typeof window !== 'undefined') {
  (window as any).beraCorbeille = beraCorbeille;
}
