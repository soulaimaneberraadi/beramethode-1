/**
 * Realtime listener: subscribe to `user_data` changes in Supabase and merge
 * them into local SQLite. Combined with `supabaseSync.ts` (PC → cloud push),
 * this gives bi-directional sync: changes on Vercel/phone flow back to PC
 * within ~1 second.
 *
 * Merge strategy is upsert-by-id per table — additions and updates from the
 * remote snapshot are applied, but rows that exist locally and not remotely
 * are NOT deleted (deletions go through the tombstones mechanism so we
 * preserve the 1h recovery window).
 *
 * Disabled unless SUPABASE_OWNER_EMAIL + SUPABASE_OWNER_PASSWORD are set.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import db from './db';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://utrojjhscyatppgcszrt.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cm9qamhzY3lhdHBwZ2NzenJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjUwNDEsImV4cCI6MjA5NzIwMTA0MX0.Nu6MQJe6YTN-TH7kBLHqStaFSrvXpuGuzr6wp28XFlk';
const OWNER_EMAIL = (process.env.SUPABASE_OWNER_EMAIL || '').trim().toLowerCase();
const OWNER_PASSWORD = process.env.SUPABASE_OWNER_PASSWORD || '';

const enabled = Boolean(OWNER_EMAIL && OWNER_PASSWORD);

let channel: RealtimeChannel | null = null;
let lastAppliedAt = 0;
let isApplyingRemote = false;

// Skip a remote change if we just pushed it ourselves (avoid echo loop).
// supabaseSync.ts can call this before each push.
let skipUntilTs = 0;
export const markLocalPushing = () => { skipUntilTs = Date.now() + 3000; };
export const isApplyingRemoteSnapshot = () => isApplyingRemote;

const tableHasColumn = (table: string, col: string): boolean => {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some(c => c.name === col);
  } catch { return false; }
};

const safeDeleteById = (table: string, id: string | number) => {
  try { db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id); } catch (e) { /* table missing */ }
};

/**
 * Résout l'id LOCAL (SQLite users.id) du propriétaire configuré via
 * SUPABASE_OWNER_EMAIL. Le snapshot distant est construit owner-scopé
 * (supabaseSync.buildSnapshot), donc à la fusion on rattache chaque ligne à
 * CE propriétaire local — jamais à un `user_id: 1` codé en dur (qui rendait
 * les modèles fusionnés invisibles du vrai propriétaire) ni à un owner_id
 * étranger venu d'un snapshot d'un autre tenant.
 */
const getLocalOwnerId = (): number | null => {
  if (!OWNER_EMAIL) return null;
  try {
    const row = db.prepare('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?').get(OWNER_EMAIL) as { id: number } | undefined;
    return row ? row.id : null;
  } catch {
    return null;
  }
};

const applyArrayToTable = (table: string, items: any[], ownerId: number | null, idField = 'id') => {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const enforceOwner = ownerId != null && tableHasColumn(table, 'owner_id');
  // Generic upsert: build dynamic INSERT OR REPLACE based on the row's keys.
  let n = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    // Garde multi-tenant : si la table possède owner_id et que la ligne
    // entrante porte un owner_id d'un AUTRE tenant, on la rejette (jamais
    // d'écrasement inter-sociétés). Sinon on force l'owner local.
    if (enforceOwner) {
      const incoming = (item as any).owner_id;
      if (incoming != null && Number(incoming) !== ownerId) continue;
    }
    const keys = Object.keys(item).filter(k => tableHasColumn(table, k));
    if (keys.length === 0) continue;
    if (enforceOwner && !keys.includes('owner_id')) keys.push('owner_id');
    const cols = keys.join(', ');
    const placeholders = keys.map(k => `@${k}`).join(', ');
    try {
      const sql = `INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${placeholders})`;
      const params: any = {};
      for (const k of keys) {
        const v = item[k];
        params[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
      }
      if (enforceOwner) params.owner_id = ownerId;
      db.prepare(sql).run(params);
      n++;
    } catch (e) {
      // Skip rows that don't fit the schema — log once.
      console.warn(`[supabaseRealtime] ${table} upsert skipped row:`, (e as Error).message);
    }
  }
  return n;
};

const mergeSnapshotIntoSqlite = (snapshot: any, userId: string) => {
  if (!snapshot || typeof snapshot !== 'object') return;
  // Le snapshot distant est owner-scopé : on le rattache au propriétaire LOCAL
  // (résolu par email). Sans propriétaire local résoluble, on n'écrit rien —
  // mieux vaut ne pas fusionner que de mal attribuer des données financières.
  const localOwnerId = getLocalOwnerId();
  if (localOwnerId === null) {
    console.warn('[supabaseRealtime] merge skipped: no local user matches SUPABASE_OWNER_EMAIL');
    return;
  }
  isApplyingRemote = true;
  const start = Date.now();
  const summary: Record<string, number> = {};
  try {
    // Models — table has (id, user_id, data); the `data` column holds the
    // full model JSON. The snapshot stores models as raw JSON objects.
    // NB: la colonne `user_id` joue le rôle d'owner_id (cf. modelController qui
    // lit/écrit WHERE user_id = companyId) → on y met localOwnerId, jamais 1.
    if (Array.isArray(snapshot.beramethode_library)) {
      const stmt = db.prepare(`
        INSERT INTO models (id, user_id, data, created_at, updated_at)
        VALUES (@id, @user_id, @data, COALESCE(@created_at, datetime('now')), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
      `);
      let n = 0;
      for (const model of snapshot.beramethode_library) {
        if (!model?.id) continue;
        try {
          stmt.run({
            id: String(model.id),
            user_id: localOwnerId,
            data: JSON.stringify(model),
            created_at: model.created_at || null,
          });
          n++;
        } catch (e) { /* skip */ }
      }
      summary.models = n;
    }

    // Planning events — full row mirror, columns vary
    if (Array.isArray(snapshot.beramethode_planning)) {
      summary.planning = applyArrayToTable('planning_events', snapshot.beramethode_planning, localOwnerId);
    }

    // Tables that mirror SQLite directly via __sqlite_export__
    const exp = snapshot.__sqlite_export__;
    if (exp && typeof exp === 'object') {
      if (exp.workers) summary.workers = applyArrayToTable('workers', exp.workers, localOwnerId);
      if (exp.workerSkills) summary.workerSkills = applyArrayToTable('worker_skills', exp.workerSkills, localOwnerId);
      if (exp.posteSuivi) summary.posteSuivi = applyArrayToTable('poste_suivi', exp.posteSuivi, localOwnerId);
      if (exp.magasin?.products) summary.magasinProducts = applyArrayToTable('magasin_products', exp.magasin.products, localOwnerId);
      if (exp.magasin?.lots) summary.magasinLots = applyArrayToTable('magasin_lots', exp.magasin.lots, localOwnerId);
      if (exp.magasin?.mouvements) summary.magasinMouvements = applyArrayToTable('magasin_mouvements', exp.magasin.mouvements, localOwnerId);
      if (exp.hr?.workers) summary.hrWorkers = applyArrayToTable('hr_workers', exp.hr.workers, localOwnerId);
      if (exp.hr?.avances) summary.hrAvances = applyArrayToTable('hr_avances', exp.hr.avances, localOwnerId);
    }

    // Tombstones — apply hard delete on SQLite for entries past their 1h
    // grace window. Recent tombstones (<1h) stay so Corbeille can restore.
    // Tombstone types come from apiShim STORES; mirror them to SQLite tables.
    const tombstones = snapshot.beramethode_tombstones || snapshot.tombstones;
    if (Array.isArray(tombstones)) {
      const TYPE_TO_TABLE: Record<string, string> = {
        models: 'models',
        planning: 'planning_events',
        suivi: 'suivi_data',
        'demandes-appro': 'demandes_appro',
        workers: 'workers',
        'worker-skills': 'worker_skills',
        'worker-pointage': 'worker_pointage',
        'poste-suivi': 'poste_suivi',
        'magasin/products': 'magasin_products',
        'magasin/lots': 'magasin_lots',
        'magasin/mouvements': 'magasin_mouvements',
        'magasin/commandes': 'magasin_commandes',
        'magasin/demandes': 'magasin_demandes',
        'hr/workers': 'hr_workers',
        'hr/pointage': 'hr_pointage',
        'hr/production': 'hr_production',
        'hr/avances': 'hr_avances',
      };
      const ONE_HOUR = 60 * 60 * 1000;
      const now = Date.now();
      let purged = 0;
      for (const t of tombstones) {
        if (!t?.id || !t?.type) continue;
        const deletedAt = t.deleted_at ? new Date(t.deleted_at).getTime() : 0;
        if (!deletedAt || now - deletedAt < ONE_HOUR) continue;
        const table = TYPE_TO_TABLE[t.type];
        if (table) { safeDeleteById(table, t.id); purged++; }
      }
      if (purged > 0) summary.tombstonesPurged = purged;
    }
  } finally {
    isApplyingRemote = false;
  }
  const ms = Date.now() - start;
  const parts = Object.entries(summary).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`);
  if (parts.length > 0) {
    console.log(`[supabaseRealtime] ⬇️  merged from cloud in ${ms}ms — ${parts.join(' ')}`);
  }
};

/**
 * Pull conditionnel : on lit d'abord uniquement `updated_at` (~30 octets). Si
 * rien de nouveau, on NE télécharge PAS le blob ~2 Mo. C'est le remplacement de
 * `postgres_changes`, qui renvoyait la ligne ENTIÈRE (~2 Mo) sur CHAQUE écriture
 * user_data — y compris nos propres push — saturant l'egress free-tier.
 */
const pullAndMerge = async (client: SupabaseClient, userId: string) => {
  if (isApplyingRemote) return;
  if (Date.now() < skipUntilTs) return; // notre propre push vient de partir
  try {
    const { data: meta, error: metaErr } = await client
      .from('user_data')
      .select('updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (metaErr || !meta) return;
    const ts = (meta as { updated_at?: string }).updated_at
      ? new Date((meta as { updated_at: string }).updated_at).getTime()
      : 0;
    if (!ts || ts <= lastAppliedAt) return; // rien de neuf → aucun blob téléchargé

    const { data: row, error } = await client
      .from('user_data')
      .select('data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !row?.data) return;
    const ts2 = (row as { updated_at?: string }).updated_at
      ? new Date((row as { updated_at: string }).updated_at).getTime()
      : ts;
    lastAppliedAt = ts2;
    mergeSnapshotIntoSqlite((row as { data: any }).data, userId);
  } catch (e) {
    console.warn('[supabaseRealtime] pull error:', (e as Error).message);
  }
};

// Intervalle de sécurité : un pull conditionnel périodique rattrape un signal
// broadcast manqué (déconnexion brève). Coût ~30 octets par tick → négligeable.
let safetyTimer: ReturnType<typeof setInterval> | null = null;
const SAFETY_PULL_MS = 5 * 60 * 1000;

export const startSupabaseRealtime = async () => {
  if (!enabled) return;
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: true },
      realtime: {
        // Même backoff que le client navigateur : éviter le martèlement toutes
        // les ~5-10 s lors d'une panne prolongée (visible dans les api logs).
        reconnectAfterMs: (tries: number) => Math.min(1000 * 2 ** tries, 5 * 60 * 1000),
      },
    });
    const { data: auth, error: authErr } = await client.auth.signInWithPassword({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    });
    if (authErr || !auth?.user) {
      console.warn('[supabaseRealtime] auth failed:', authErr?.message);
      return;
    }
    const userId = auth.user.id;
    console.log(`[supabaseRealtime] 🔌 subscribing (broadcast) for user ${userId.slice(0, 8)}…`);

    // Canal *Broadcast* (zéro charge DB, zéro WAL) — identique à cloudSync.ts
    // côté navigateur. À la réception du signal léger « updated », on déclenche
    // un pull conditionnel : le blob n'est téléchargé que s'il a réellement
    // changé. Remplace postgres_changes qui renvoyait ~2 Mo à chaque écriture.
    channel = client
      .channel(`bera_sync_${userId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'updated' }, () => { void pullAndMerge(client, userId); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[supabaseRealtime] ✅ subscribed (broadcast) to user_data signals');
          // Premier pull au démarrage pour aligner SQLite sur l'état cloud.
          void pullAndMerge(client, userId);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[supabaseRealtime] channel ${status}`);
        }
      });

    if (safetyTimer) clearInterval(safetyTimer);
    safetyTimer = setInterval(() => { void pullAndMerge(client, userId); }, SAFETY_PULL_MS);
  } catch (err) {
    console.warn('[supabaseRealtime] startup error:', err);
  }
};

export const stopSupabaseRealtime = () => {
  if (safetyTimer) { clearInterval(safetyTimer); safetyTimer = null; }
  if (channel) {
    channel.unsubscribe();
    channel = null;
  }
};
