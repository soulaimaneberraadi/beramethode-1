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
const SERVER_SYNC_ENABLED = process.env.SUPABASE_SERVER_SYNC !== 'false';

const enabled = Boolean(OWNER_EMAIL && OWNER_PASSWORD) && SERVER_SYNC_ENABLED;

let channel: RealtimeChannel | null = null;
let lastAppliedAt = 0;
/** Durée pendant laquelle une suppression reste opposable. Alignée sur
 *  `TOMBSTONE_KEEP_MS` d'`apiShim.ts` et de `cloudSync.ts` : les trois
 *  décrivent le même fait, et une divergence ferait revenir des lignes. */
const TOMBSTONE_KEEP_MS = 365 * 24 * 60 * 60 * 1000;

let isApplyingRemote = false;

// Skip a remote change if we just pushed it ourselves (avoid echo loop).
// supabaseSync.ts can call this before each push.
let skipUntilTs = 0;
export const markLocalPushing = () => { skipUntilTs = Date.now() + 3000; };
export const isApplyingRemoteSnapshot = () => isApplyingRemote;

const modelPreview = (m: any): string | null =>
  (typeof m?.images?.front === 'string' && m.images.front) ||
  (typeof m?.image === 'string' && m.image) ||
  (typeof m?.meta_data?.photo_url === 'string' && m.meta_data.photo_url) ||
  (typeof m?.images?.back === 'string' && m.images.back) ||
  null;

const withPreservedPreview = (incoming: any, existing: any): any => {
  if (modelPreview(incoming) || !modelPreview(existing)) return incoming;
  return {
    ...incoming,
    image: incoming?.image || existing?.image || existing?.images?.front || existing?.meta_data?.photo_url || null,
    images: {
      front: incoming?.images?.front || existing?.images?.front || existing?.image || existing?.meta_data?.photo_url || null,
      back: incoming?.images?.back || existing?.images?.back || null,
    },
    meta_data: {
      ...(incoming?.meta_data || {}),
      photo_url: incoming?.meta_data?.photo_url || existing?.meta_data?.photo_url,
    },
  };
};

const tableHasColumn = (table: string, col: string): boolean => {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some(c => c.name === col);
  } catch { return false; }
};

const safeDeleteById = (table: string, id: string | number, ownerId: number | null) => {
  try {
    if (ownerId != null && tableHasColumn(table, 'owner_id')) {
      db.prepare(`DELETE FROM ${table} WHERE id = ? AND owner_id = ?`).run(id, ownerId);
      return;
    }
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  } catch (e) { /* table missing */ }
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

const applyArrayToTable = (
  table: string,
  items: any[],
  ownerId: number | null,
  idField = 'id',
  /** Ce que l'utilisateur a supprime : ces lignes ne se reinstallent pas. */
  supprimes?: Map<string, number>,
) => {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const enforceOwner = ownerId != null && tableHasColumn(table, 'owner_id');
  // Generic upsert without REPLACE: REPLACE deletes the old row first, which can
  // break child rows and triggers. Update the existing row in place instead.
  let n = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    // Une suppression volontaire prime sur la copie restee dans le cloud,
    // sauf si la ligne a ete ree-ditee APRES coup ailleurs.
    const supprimeLe = supprimes?.get(String((item as any)[idField]));
    if (supprimeLe != null) {
      const edit = (item as any).updatedAt || (item as any).updated_at;
      const e = edit ? new Date(edit).getTime() : 0;
      if (!(Number.isFinite(e) && e > supprimeLe)) continue;
    }
    // Garde multi-tenant : si la table possède owner_id et que la ligne
    // entrante porte un owner_id d'un AUTRE tenant, on la rejette (jamais
    // d'écrasement inter-sociétés). Sinon on force l'owner local.
    if (enforceOwner) {
      const incoming = (item as any).owner_id;
      if (incoming != null && Number(incoming) !== ownerId) continue;
    }
    const keys = Object.keys(item).filter(k => tableHasColumn(table, k));
    if (tableHasColumn(table, 'raw_data') && !keys.includes('raw_data')) {
      keys.push('raw_data');
    }
    if (keys.length === 0) continue;
    if (enforceOwner && !keys.includes('owner_id')) keys.push('owner_id');
    const hasConflictKey = keys.includes(idField) && tableHasColumn(table, idField);
    const cols = keys.join(', ');
    const placeholders = keys.map(k => `@${k}`).join(', ');
    const updateKeys = keys.filter(k => k !== idField);
    const updateSql = updateKeys.length > 0
      ? `DO UPDATE SET ${updateKeys.map(k => `${k} = excluded.${k}`).join(', ')}`
      : 'DO NOTHING';
    try {
      const sql = hasConflictKey
        ? `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON CONFLICT(${idField}) ${updateSql}`
        : `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`;
      const params: any = {};
      for (const k of keys) {
        const v = k === 'raw_data' && item[k] == null ? item : item[k];
        params[k] = v === undefined ? null : (typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
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

/**
 * Ce que l'utilisateur a supprimé, lu AVANT toute réinsertion.
 *
 * L'ordre compte : on lisait les pierres tombales à la fin, après avoir déjà
 * réinstallé les lignes du cloud, et on ne les appliquait qu'au-delà d'une
 * heure. Résultat : la ligne revenait, repartait dans le cloud au push
 * suivant, et le cycle recommençait indéfiniment.
 */
const lireSupprimes = (snapshot: any): Map<string, Map<string, number>> => {
  const parType = new Map<string, Map<string, number>>();
  const ts = snapshot?.beramethode_tombstones || snapshot?.tombstones;
  if (!Array.isArray(ts)) return parType;
  const now = Date.now();
  for (const t of ts) {
    if (!t?.id || !t?.type) continue;
    const d = t.deleted_at ? new Date(t.deleted_at).getTime() : 0;
    if (!d || now - d >= TOMBSTONE_KEEP_MS) continue;
    const m = parType.get(t.type) || new Map<string, number>();
    const id = String(t.id);
    if (!m.has(id) || d > (m.get(id) as number)) m.set(id, d);
    parType.set(t.type, m);
  }
  return parType;
};

export const mergeSnapshotIntoSqlite = (snapshot: any, localOwnerId: number) => {
  if (!snapshot || typeof snapshot !== 'object') return;
  isApplyingRemote = true;
  const start = Date.now();
  const summary: Record<string, number> = {};
  const supprimes = lireSupprimes(snapshot);
  try {
    // Models — table has (id, user_id, data); the `data` column holds the
    // full model JSON. The snapshot stores models as raw JSON objects.
    // NB: la colonne `user_id` joue le rôle d'owner_id (cf. modelController qui
    // lit/écrit WHERE user_id = companyId) → on y met localOwnerId, jamais 1.
    if (Array.isArray(snapshot.beramethode_library)) {
      const stmt = db.prepare(`
        INSERT INTO models (id, user_id, owner_id, data, created_at, updated_at)
        VALUES (@id, @user_id, @owner_id, @data, COALESCE(@created_at, datetime('now')), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          data = excluded.data,
          owner_id = excluded.owner_id,
          updated_at = excluded.updated_at
      `);
      const existingStmt = db.prepare('SELECT data FROM models WHERE id = ? AND owner_id = ?');
      let n = 0;
      const modelesSupprimes = supprimes.get('models');
      for (const model of snapshot.beramethode_library) {
        if (!model?.id) continue;
        // Supprimé ici : on ne le réinstalle pas. Sauf s'il a été ré-édité
        // APRÈS la suppression — quelqu'un l'a repris ailleurs, et écraser
        // ce travail serait pire que de laisser revenir une ligne.
        const supprimeLe = modelesSupprimes?.get(String(model.id));
        if (supprimeLe != null) {
          const edit = model.updatedAt || model.updated_at;
          const e = edit ? new Date(edit).getTime() : 0;
          if (!(Number.isFinite(e) && e > supprimeLe)) continue;
        }
        try {
          let modelToStore = model;
          const existingRow = existingStmt.get(String(model.id), localOwnerId) as { data?: string } | undefined;
          if (existingRow?.data) {
            try {
              modelToStore = withPreservedPreview(model, JSON.parse(existingRow.data));
            } catch { /* keep incoming */ }
          }
          stmt.run({
            id: String(model.id),
            user_id: localOwnerId,
            owner_id: localOwnerId,
            data: JSON.stringify(modelToStore),
            created_at: model.created_at || null,
          });
          n++;
        } catch (e) { /* skip */ }
      }
      summary.models = n;
    }

    // Planning events — full row mirror, columns vary
    if (Array.isArray(snapshot.beramethode_planning)) {
      summary.planning = applyArrayToTable('planning_events', snapshot.beramethode_planning, localOwnerId, 'id', supprimes.get('planning'));
    }

    if (Array.isArray(snapshot.beramethode_suivis)) {
      summary.suivis = applyArrayToTable('suivi_data', snapshot.beramethode_suivis, localOwnerId, 'id', supprimes.get('suivi'));
    }

    // Tables that mirror SQLite directly via __sqlite_export__
    const exp = snapshot.__sqlite_export__;
    if (exp && typeof exp === 'object') {
      // `exp.workers` (table legacy `workers`) est volontairement ignoré :
      // les employés vivent uniquement dans hr_workers (voir exp.hr.workers).
      if (exp.workerSkills) summary.workerSkills = applyArrayToTable('worker_skills', exp.workerSkills, localOwnerId, 'id', supprimes.get('worker-skills'));
      if (exp.posteSuivi) summary.posteSuivi = applyArrayToTable('poste_suivi', exp.posteSuivi, localOwnerId, 'id', supprimes.get('poste-suivi'));
      if (exp.magasin?.products) summary.magasinProducts = applyArrayToTable('magasin_products', exp.magasin.products, localOwnerId, 'id', supprimes.get('magasin/products'));
      if (exp.magasin?.lots) summary.magasinLots = applyArrayToTable('magasin_lots', exp.magasin.lots, localOwnerId, 'id', supprimes.get('magasin/lots'));
      if (exp.magasin?.mouvements) summary.magasinMouvements = applyArrayToTable('magasin_mouvements', exp.magasin.mouvements, localOwnerId, 'id', supprimes.get('magasin/mouvements'));
      if (exp.hr?.workers) summary.hrWorkers = applyArrayToTable('hr_workers', exp.hr.workers, localOwnerId, 'id', supprimes.get('hr/workers'));
      if (exp.hr?.avances) summary.hrAvances = applyArrayToTable('hr_avances', exp.hr.avances, localOwnerId, 'id', supprimes.get('hr/avances'));
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
        // Encore restaurable : la Corbeille doit pouvoir rendre la ligne.
        if (!deletedAt || now - deletedAt < ONE_HOUR) continue;
        // Passé un an, la pierre tombale ne vaut plus rien et la ligne a
        // disparu depuis longtemps : inutile de rejouer la suppression.
        if (now - deletedAt >= TOMBSTONE_KEEP_MS) continue;
        const table = TYPE_TO_TABLE[t.type];
        if (table) { safeDeleteById(table, t.id, localOwnerId); purged++; }
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


