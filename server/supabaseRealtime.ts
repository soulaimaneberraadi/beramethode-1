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

import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import db from './db';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jiscgwioxwsulaopsivc.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2Nnd2lveHdzdWxhb3BzaXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTcwNTgsImV4cCI6MjA5MTU3MzA1OH0.-jRI1RlbjxecLyN2b83xmjuJCKhs7ti_7_-RWXNCNgk';
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

const applyArrayToTable = (table: string, items: any[], idField = 'id') => {
  if (!Array.isArray(items) || items.length === 0) return 0;
  // Generic upsert: build dynamic INSERT OR REPLACE based on the row's keys.
  let n = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const keys = Object.keys(item).filter(k => tableHasColumn(table, k));
    if (keys.length === 0) continue;
    const cols = keys.join(', ');
    const placeholders = keys.map(k => `@${k}`).join(', ');
    try {
      const sql = `INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${placeholders})`;
      const params: any = {};
      for (const k of keys) {
        const v = item[k];
        params[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
      }
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
  isApplyingRemote = true;
  const start = Date.now();
  const summary: Record<string, number> = {};
  try {
    // Models — table has (id, user_id, data); the `data` column holds the
    // full model JSON. The snapshot stores models as raw JSON objects.
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
            user_id: 1,
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
      summary.planning = applyArrayToTable('planning_events', snapshot.beramethode_planning);
    }

    // Tables that mirror SQLite directly via __sqlite_export__
    const exp = snapshot.__sqlite_export__;
    if (exp && typeof exp === 'object') {
      if (exp.workers) summary.workers = applyArrayToTable('workers', exp.workers);
      if (exp.workerSkills) summary.workerSkills = applyArrayToTable('worker_skills', exp.workerSkills);
      if (exp.posteSuivi) summary.posteSuivi = applyArrayToTable('poste_suivi', exp.posteSuivi);
      if (exp.magasin?.products) summary.magasinProducts = applyArrayToTable('magasin_products', exp.magasin.products);
      if (exp.magasin?.lots) summary.magasinLots = applyArrayToTable('magasin_lots', exp.magasin.lots);
      if (exp.magasin?.mouvements) summary.magasinMouvements = applyArrayToTable('magasin_mouvements', exp.magasin.mouvements);
      if (exp.hr?.workers) summary.hrWorkers = applyArrayToTable('hr_workers', exp.hr.workers);
      if (exp.hr?.avances) summary.hrAvances = applyArrayToTable('hr_avances', exp.hr.avances);
    }

    // Tombstones — apply soft delete by removing rows past their 1h grace.
    // (Recent tombstones < 1h are kept so they show in Corbeille on the
    // frontend; the actual SQLite row stays until pg_cron purges.)
    if (Array.isArray(snapshot.tombstones)) {
      const ONE_HOUR = 60 * 60 * 1000;
      const now = Date.now();
      for (const t of snapshot.tombstones) {
        if (!t?.id || !t?.type) continue;
        const deletedAt = t.deleted_at ? new Date(t.deleted_at).getTime() : 0;
        if (!deletedAt || now - deletedAt < ONE_HOUR) continue;
        const tableMap: Record<string, string> = {
          model: 'models',
          planning: 'planning_events',
          worker: 'hr_workers',
          product: 'magasin_products',
        };
        const table = tableMap[t.type];
        if (table) safeDeleteById(table, t.id);
      }
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

export const startSupabaseRealtime = async () => {
  if (!enabled) return;
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: true },
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
    console.log(`[supabaseRealtime] 🔌 subscribing for user ${userId.slice(0, 8)}…`);

    channel = client
      .channel(`pc_pull_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_data', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (Date.now() < skipUntilTs) {
            // This is our own push echoing back — ignore.
            return;
          }
          const row = (payload.new as { data?: any; updated_at?: string } | null);
          if (!row?.data) return;
          const ts = row.updated_at ? new Date(row.updated_at).getTime() : 0;
          if (ts && ts <= lastAppliedAt) return; // already applied
          lastAppliedAt = ts;
          mergeSnapshotIntoSqlite(row.data, userId);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[supabaseRealtime] ✅ subscribed to user_data changes');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[supabaseRealtime] channel ${status}`);
        }
      });
  } catch (err) {
    console.warn('[supabaseRealtime] startup error:', err);
  }
};

export const stopSupabaseRealtime = () => {
  if (channel) {
    channel.unsubscribe();
    channel = null;
  }
};
