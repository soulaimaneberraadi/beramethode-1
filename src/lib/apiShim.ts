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

const TOMBSTONES_KEY = 'beramethode_tombstones';
const SQLITE_EXPORT_KEY = '__bera_sqlite_export__';
const TOMBSTONE_TTL_MS = 60 * 60 * 1000; // 1h

const readJson = (key: string): any => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
};

const writeJson = (key: string, value: any) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn(`writeJson ${key}`, e); }
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
  workers:          { kind: 'export', path: ['workers'] },
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

const tombstonedIds = (type: string): Set<string> => {
  const now = Date.now();
  const ts = readTombstones().filter(t => {
    if (t.type !== type) return false;
    const d = new Date(t.deleted_at).getTime();
    return now - d < TOMBSTONE_TTL_MS;
  });
  return new Set(ts.map(t => String(t.id)));
};

const addTombstone = (type: string, id: string) => {
  const ts = readTombstones().filter(t => !(t.type === type && String(t.id) === String(id)));
  ts.push({ type, id: String(id), deleted_at: new Date().toISOString() });
  writeTombstones(ts);
};

const removeTombstone = (type: string, id: string) => {
  const ts = readTombstones().filter(t => !(t.type === type && String(t.id) === String(id)));
  writeTombstones(ts);
};

// Purge tombstones older than 1h AND remove their target rows from storage.
// Runs opportunistically on each fetch — keeps the local snapshot clean.
const purgeExpiredTombstones = () => {
  const ts = readTombstones();
  if (ts.length === 0) return;
  const now = Date.now();
  const kept: Tombstone[] = [];
  const expired: Tombstone[] = [];
  for (const t of ts) {
    const d = new Date(t.deleted_at).getTime();
    (now - d >= TOMBSTONE_TTL_MS ? expired : kept).push(t);
  }
  if (expired.length === 0) return;
  // Hard-delete expired rows from their stores.
  const byType: Record<string, Set<string>> = {};
  for (const t of expired) (byType[t.type] ||= new Set()).add(String(t.id));
  for (const [type, ids] of Object.entries(byType)) {
    const arr = readArray(type);
    const next = arr.filter((it: any) => !ids.has(String(it.id)));
    if (next.length !== arr.length) writeArray(type, next);
  }
  writeTombstones(kept);
};

// ─── CRUD helpers ────────────────────────────────────────────────────────────

const upsertItem = (type: string, item: any): any => {
  if (!STORES[type]) return null;
  const id = String(item.id ?? Date.now());
  const arr = readArray(type);
  const idx = arr.findIndex((it: any) => String(it.id) === id);
  const next = { ...item, id };
  if (idx >= 0) arr[idx] = next; else arr.push(next);
  writeArray(type, arr);
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

const handleGet = (pathname: string): any => {
  // Specials
  if (/^\/api\/auth\/me$/.test(pathname)) return { user: null };
  if (/^\/api\/network-info$/.test(pathname)) return { ip: '127.0.0.1', host: 'static' };
  if (/^\/api\/settings$/.test(pathname)) return readJson('beramethode_settings') || {};
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
  // Tombstones inspection endpoint (for Corbeille UI)
  if (/^\/api\/_tombstones$/.test(pathname)) {
    purgeExpiredTombstones();
    return readTombstones();
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
      return reply(handleGet(url.pathname));
    }

    // Parse body
    let body: any = null;
    try {
      const txt = init?.body ? (typeof init.body === 'string' ? init.body : await new Response(init.body as any).text()) : '';
      body = txt ? JSON.parse(txt) : null;
    } catch { body = null; }

    const r = resolveTypeAndId(url.pathname);
    if (!r) return reply({ ok: true, static: true, note: 'no store for path' });

    // POST → upsert (with body) ; PUT/PATCH → upsert at id ; DELETE → soft delete
    if (method === 'POST') {
      if (body == null) return reply({ ok: false, error: 'empty body' }, 400);
      const saved = upsertItem(r.type, body);
      return reply(saved ?? { ok: true });
    }
    if (method === 'PUT' || method === 'PATCH') {
      if (body == null && r.id == null) return reply({ ok: false }, 400);
      const item = { ...(body || {}), id: r.id ?? body?.id };
      const saved = upsertItem(r.type, item);
      return reply(saved ?? { ok: true });
    }
    if (method === 'DELETE') {
      const id = r.id ?? body?.id;
      if (!id) return reply({ ok: false, error: 'no id' }, 400);
      const ok = softDeleteItem(r.type, String(id));
      return reply({ ok, soft_deleted: ok, recoverable_for_ms: TOMBSTONE_TTL_MS });
    }
    return reply({ ok: true, static: true });
  };
};

// ─── Public API for Corbeille UI / restore button ────────────────────────────

export const beraCorbeille = {
  list: (): Tombstone[] => {
    purgeExpiredTombstones();
    return readTombstones();
  },
  restore: (type: string, id: string): boolean => {
    removeTombstone(type, id);
    // Trigger sync push
    const arr = readArray(type);
    writeArray(type, arr);
    return true;
  },
  hardDelete: (type: string, id: string): boolean => {
    const arr = readArray(type);
    const next = arr.filter((it: any) => String(it.id) !== String(id));
    if (next.length === arr.length) { removeTombstone(type, id); return false; }
    writeArray(type, next);
    removeTombstone(type, id);
    return true;
  },
  ttlMs: TOMBSTONE_TTL_MS,
};

if (typeof window !== 'undefined') {
  (window as any).beraCorbeille = beraCorbeille;
}
