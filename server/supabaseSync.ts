import { createHash, randomUUID } from 'crypto';
import db from './db';
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { mergeSnapshotIntoSqlite } from './supabaseRealtime';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.BERA_DB_PATH || path.join(process.cwd(), 'database.sqlite');
const dbDir = path.dirname(dbPath);

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const OWNER_EMAIL = (process.env.SUPABASE_OWNER_EMAIL || '').trim().toLowerCase();
const OWNER_PASSWORD = process.env.SUPABASE_OWNER_PASSWORD || '';
const SERVER_SYNC_ENABLED = process.env.SUPABASE_SERVER_SYNC !== 'false';
const enabled = Boolean(OWNER_EMAIL && OWNER_PASSWORD) && SERVER_SYNC_ENABLED;
const canSync = Boolean(OWNER_EMAIL && OWNER_PASSWORD && SUPABASE_URL && SUPABASE_ANON_KEY);

if (enabled && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  throw new Error('[supabaseSync] CRITICAL: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env when backup/sync is enabled.');
}
const PUSH_DELAY_MS = Number(process.env.SUPABASE_SYNC_DEBOUNCE_MS || 2000);
const STORAGE_BUCKET = 'bera-assets';
const BACKUP_BUCKET = 'bera-backups';
const INLINE_IMAGE_MAX = Number(process.env.SUPABASE_INLINE_IMAGE_MAX || 5_000_000);
const SAFETY_PULL_MS = 5 * 60 * 1000;

interface UserSyncState {
  localUserId: number;
  supabaseUserId: string;
  email: string;
  accessToken: string;
  refreshToken: string | null; // Null if using hardcoded owner password login
  expiresAt: number;
  pushTimer: NodeJS.Timeout | null;
  pushInFlight: boolean;
  pendingAfterFlight: boolean;
  supabaseClient: any;
  realtimeChannel: any;
  safetyTimer: NodeJS.Timeout | null;
  lastAppliedAt?: number;
  skipUntilTs?: number;
}

const syncStates = new Map<number, UserSyncState>();

// In-memory cache: filename → public URL
const imageUrlCache = new Map<string, string>();
let bucketReady = false;
let backupBucketReady = false;
let backupBucketWarningShown = false;

// Helper to check if any user's pull/merge is active
let isApplyingRemote = false;
export const isApplyingRemoteSnapshot = () => isApplyingRemote;

// Helper to run query safely
const safe = (sql: string, params: any[] = []): any[] => {
  try { return db.prepare(sql).all(...params); } catch { return []; }
};

const tableHasColumn = (table: string, col: string): boolean => {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some(c => c.name === col);
  } catch { return false; }
};

const parseJsonFields = (row: any) => {
  if (!row) return row;
  const out = { ...row };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
      try { out[k] = JSON.parse(v); } catch { /* ignore */ }
    }
  }
  return out;
};

const extractRawData = (rows: any[]) => {
  return rows.map((r) => {
    if (typeof r.raw_data === 'string' && r.raw_data.length > 0) {
      try { return JSON.parse(r.raw_data); } catch { /* fallback */ }
    }
    return parseJsonFields(r);
  });
};

// ─── Supabase Storage helpers ─────────────────────────────────────────────────

const ensureBucket = async (accessToken: string): Promise<boolean> => {
  if (bucketReady === true) return true;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${STORAGE_BUCKET}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) { bucketReady = true; return true; }

    const createRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ id: STORAGE_BUCKET, name: STORAGE_BUCKET, public: true }),
    });

    bucketReady = true;
    if (!createRes.ok) {
      const body = await createRes.text().catch(() => '');
      console.warn(`[supabaseSync] bucket check/create status: ${createRes.status} (${body.slice(0, 80)}) — will attempt uploads anyway`);
    }
    return true;
  } catch (e) {
    console.warn('[supabaseSync] ensureBucket error:', e);
    bucketReady = true;
    return true;
  }
};

const ensureBackupBucketConfigured = async (accessToken: string): Promise<boolean> => {
  if (backupBucketReady) return true;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BACKUP_BUCKET}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) { backupBucketReady = true; return true; }

    const createRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ id: BACKUP_BUCKET, name: BACKUP_BUCKET, public: false }),
    });

    if (createRes.ok) {
      backupBucketReady = true;
      return true;
    }
    if (!backupBucketWarningShown) {
      backupBucketWarningShown = true;
      const body = await createRes.text().catch(() => '');
      console.warn(`[supabaseSync] Warning: could not create backups bucket (${createRes.status}). Ensure it is created manually in Supabase Storage with name "${BACKUP_BUCKET}". Details: ${body.slice(0, 120)}`);
    }
    return false;
  } catch (e) {
    if (!backupBucketWarningShown) {
      backupBucketWarningShown = true;
      console.warn('[supabaseSync] ensureBackupBucketConfigured error:', e);
    }
    return false;
  }
};

const uploadBase64 = async (b64data: string, contentType: string, accessToken: string, userId: string): Promise<string | null> => {
  try {
    const hash = createHash('sha256').update(b64data, 'base64').digest('hex').slice(0, 32);
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const filename = `${userId}/${hash}.${ext}`;

    if (imageUrlCache.has(filename)) return imageUrlCache.get(filename)!;

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filename}`;

    const headRes = await fetch(publicUrl, { method: 'HEAD' });
    if (headRes.ok) {
      imageUrlCache.set(filename, publicUrl);
      return publicUrl;
    }

    const binaryString = atob(b64data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filename}`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        'x-upsert': 'true',
      },
      body: bytes.buffer,
    });

    if (!uploadRes.ok) {
      const body = await uploadRes.text().catch(() => '');
      console.warn(`[supabaseSync] image upload failed (${uploadRes.status}): ${body.slice(0, 150)}`);
      if (b64data.length * 0.75 < INLINE_IMAGE_MAX) {
        return `data:${contentType};base64,${b64data}`;
      }
      return null;
    }

    imageUrlCache.set(filename, publicUrl);
    return publicUrl;
  } catch (err) {
    console.warn('[supabaseSync] uploadBase64 error:', err);
    return null;
  }
};

const replaceImages = async (v: any, accessToken: string, userId: string): Promise<any> => {
  if (!v || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    return Promise.all(v.map((item) => replaceImages(item, accessToken, userId)));
  }

  const out = { ...v };
  for (const [k, val] of Object.entries(out)) {
    if (typeof val === 'string' && val.startsWith('data:image/')) {
      const parts = val.split(';base64,');
      if (parts[0] && parts[1]) {
        const ct = parts[0].replace('data:', '');
        const url = await uploadBase64(parts[1], ct, accessToken, userId);
        if (url) out[k] = url;
      }
    } else if (k === 'images' && val && typeof val === 'object') {
      const urls: any = {};
      for (const [side, pathStr] of Object.entries(val)) {
        if (typeof pathStr === 'string' && pathStr.startsWith('data:image/')) {
          const parts = pathStr.split(';base64,');
          if (parts[0] && parts[1]) {
            const ct = parts[0].replace('data:', '');
            const url = await uploadBase64(parts[1], ct, accessToken, userId);
            if (url) urls[side] = url;
          }
        } else {
          urls[side] = pathStr;
        }
      }
      out[k] = urls;
    } else if (k === 'sizes' && Array.isArray(val)) {
      const urls = await Promise.all(
        val.map(async (item: any) => {
          if (typeof item === 'string' && item.startsWith('data:image/')) {
            const parts = item.split(';base64,');
            if (parts[0] && parts[1]) {
              const ct = parts[0].replace('data:', '');
              return uploadBase64(parts[1], ct, accessToken, userId);
            }
          }
          return item;
        }),
      );
      const valid = urls.filter(Boolean);
      if (valid.length > 0) out[k] = valid;
    } else if (Array.isArray(val)) {
      out[k] = await replaceImages(val, accessToken, userId);
    } else if (val && typeof val === 'object') {
      out[k] = await replaceImages(val, accessToken, userId);
    } else {
      out[k] = val;
    }
  }
  return out;
};

// ─── Snapshot builder ─────────────────────────────────────────────────────────

const buildSnapshot = async (localUserId: number, accessToken: string, userId: string) => {
  const models = safe('SELECT * FROM models WHERE user_id = ?', [localUserId]);
  const planningEvents = safe('SELECT * FROM planning_events WHERE owner_id = ?', [localUserId]);
  const suiviData = safe('SELECT * FROM suivi_data WHERE owner_id = ?', [localUserId]);
  const posteSuivi = safe('SELECT * FROM poste_suivi WHERE owner_id = ?', [localUserId]);
  const workers = safe('SELECT * FROM workers WHERE owner_id = ?', [localUserId]);
  const workerSkills = safe('SELECT * FROM worker_skills WHERE owner_id = ?', [localUserId]);
  const workerPointage = safe('SELECT * FROM worker_pointage WHERE owner_id = ?', [localUserId]);
  const magasinProducts = safe('SELECT * FROM magasin_products WHERE owner_id = ?', [localUserId]);
  const magasinLots = safe('SELECT * FROM magasin_lots WHERE owner_id = ?', [localUserId]);
  const magasinMouvements = safe('SELECT * FROM magasin_mouvements WHERE owner_id = ?', [localUserId]);
  const magasinCommandes = safe('SELECT * FROM magasin_commandes WHERE owner_id = ?', [localUserId]);
  const magasinDemandes = safe('SELECT * FROM magasin_demandes WHERE owner_id = ?', [localUserId]);
  const demandesAppro = safe('SELECT * FROM demandes_appro WHERE owner_id = ?', [localUserId]);
  const appSettings = safe('SELECT * FROM app_settings WHERE owner_id = ?', [localUserId]);
  const hrWorkers = safe('SELECT * FROM hr_workers WHERE owner_id = ?', [localUserId]);
  const hrPointage = safe('SELECT * FROM hr_pointage WHERE owner_id = ?', [localUserId]);
  const hrProduction = safe('SELECT * FROM hr_production WHERE owner_id = ?', [localUserId]);
  const hrAvances = safe('SELECT * FROM hr_avances WHERE owner_id = ?', [localUserId]);
  const subcontractOrders = safe('SELECT * FROM subcontract_orders WHERE owner_id = ?', [localUserId]);
  const subcontractorGroups = safe('SELECT * FROM subcontractor_groups WHERE owner_id = ?', [localUserId]);

  const libraryModels = await Promise.all(
    models.map(async (row: any) => {
      let m: any;
      if (row && typeof row.data === 'string') {
        try { m = JSON.parse(row.data); } catch { m = parseJsonFields(row); }
      } else {
        m = parseJsonFields(row);
      }
      return replaceImages(m, accessToken, userId);
    }),
  );

  const slimProducts = await Promise.all(
    magasinProducts.map(async (row: any) => replaceImages(parseJsonFields(row), accessToken, userId)),
  );

  const slimWorkers = await Promise.all(
    workers.map(async (row: any) => replaceImages(parseJsonFields(row), accessToken, userId)),
  );

  const slimHrWorkers = await Promise.all(
    hrWorkers.map(async (row: any) => replaceImages(parseJsonFields(row), accessToken, userId)),
  );

  return {
    beramethode_library: libraryModels,
    beramethode_planning: extractRawData(planningEvents),
    beramethode_suivis: extractRawData(suiviData),
    beramethode_demandesAppro: demandesAppro.map(parseJsonFields),
    beramethode_settings: appSettings.length === 1 ? parseJsonFields(appSettings[0]) : appSettings.map(parseJsonFields),
    beramethode_subcontract_orders: subcontractOrders.map(parseJsonFields),
    beramethode_subcontract_groups: subcontractorGroups.map(parseJsonFields),
    __sqlite_export__: {
      exported_at: new Date().toISOString(),
      counts: {
        models: libraryModels.length,
        planningEvents: planningEvents.length,
        suiviData: suiviData.length,
        workers: slimWorkers.length,
        magasinProducts: magasinProducts.length,
        hrWorkers: slimHrWorkers.length,
      },
      workers: slimWorkers,
      workerSkills: workerSkills.map(parseJsonFields),
      workerPointage: workerPointage.map(parseJsonFields),
      posteSuivi: posteSuivi.map(parseJsonFields),
      magasin: {
        products: slimProducts,
        lots: magasinLots.map(parseJsonFields),
        mouvements: magasinMouvements.map(parseJsonFields),
        commandes: magasinCommandes.map(parseJsonFields),
        demandes: magasinDemandes.map(parseJsonFields),
      },
      hr: {
        workers: slimHrWorkers,
        pointage: hrPointage.map(parseJsonFields),
        production: hrProduction.map(parseJsonFields),
        avances: hrAvances.map(parseJsonFields),
      },
    },
  };
};

// ─── Multi-user Session management ──────────────────────────────────────────

const ensureUserSession = async (state: UserSyncState): Promise<boolean> => {
  if (state.expiresAt - Date.now() > 60_000) return true;
  try {
    let res: Response;
    if (state.refreshToken) {
      // Refresh token
      res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: state.refreshToken }),
      }) as never;
    } else {
      // Fallback for owner email login
      res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
      }) as never;
    }

    if (!res.ok) {
      console.warn(`[supabaseSync] Token refresh failed for ${state.email}: ${res.status}`);
      return false;
    }

    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
    state.accessToken = data.access_token;
    state.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    if (data.refresh_token) {
      state.refreshToken = data.refresh_token;
      db.prepare(`
        UPDATE supabase_sessions
        SET refresh_token = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(data.refresh_token, state.localUserId);
    }
    return true;
  } catch (err) {
    console.warn(`[supabaseSync] Token refresh error for ${state.email}:`, err);
    return false;
  }
};

export const initUserSync = async (localUserId: number, supabaseUserId: string, email: string, refreshToken: string | null) => {
  if (syncStates.has(localUserId)) {
    const existing = syncStates.get(localUserId)!;
    if (existing.refreshToken === refreshToken && refreshToken !== null) return;
    cleanupUserSync(localUserId);
  }

  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: {
        reconnectAfterMs: (tries: number) => Math.min(1000 * 2 ** tries, 5 * 60 * 1000),
      },
    });

    let currentRefreshToken = refreshToken;
    let accessToken = '';
    let expiresAt = 0;
    let sbUserId = supabaseUserId;

    if (refreshToken) {
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) {
        console.warn(`[supabaseSync] Failed to init sync with refresh_token for ${email}:`, error?.message);
        return;
      }
      currentRefreshToken = data.session.refresh_token;
      accessToken = data.session.access_token;
      expiresAt = Date.now() + (data.session.expires_in || 3600) * 1000;
      sbUserId = data.session.user.id;

      if (currentRefreshToken !== refreshToken) {
        db.prepare(`
          UPDATE supabase_sessions
          SET refresh_token = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `).run(currentRefreshToken, localUserId);
      }
    } else {
      // Owner login fallback
      const { data, error } = await client.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
      if (error || !data.session) {
        console.warn(`[supabaseSync] Failed to init sync via password for owner ${email}:`, error?.message);
        return;
      }
      accessToken = data.session.access_token;
      expiresAt = Date.now() + (data.session.expires_in || 3600) * 1000;
      sbUserId = data.session.user.id;
    }

    console.log(`[supabaseSync] 🔌 Subscribed to Supabase Realtime broadcast for user ${email} (${sbUserId.slice(0, 8)})`);
    const channel = client.channel(`bera_sync_${sbUserId}`, { config: { broadcast: { self: false } } });

    const state: UserSyncState = {
      localUserId,
      supabaseUserId: sbUserId,
      email,
      accessToken,
      refreshToken: currentRefreshToken,
      expiresAt,
      pushTimer: null,
      pushInFlight: false,
      pendingAfterFlight: false,
      supabaseClient: client,
      realtimeChannel: channel,
      safetyTimer: null,
    };

    let initialSyncStarted = false;
    syncStates.set(localUserId, state);

    channel
      .on('broadcast', { event: 'updated' }, () => { void pullAndMergeForUser(state); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[supabaseSync] ✅ Realtime channel SUBSCRIBED for ${email}`);
          if (!initialSyncStarted) {
            initialSyncStarted = true;
            void (async () => {
              const safeToPush = await pullAndMergeForUser(state);
              if (safeToPush && SERVER_SYNC_ENABLED) {
                schedulePush(localUserId);
              } else if (!SERVER_SYNC_ENABLED) {
                console.log(`[supabaseSync] Server push disabled, listening only for ${email}.`);
              } else {
                console.warn(`[supabaseSync] Initial pull failed for ${email}: cloud pull did not complete safely.`);
              }
            })();
          }
        }
      });

    state.safetyTimer = setInterval(() => { void pullAndMergeForUser(state); }, SAFETY_PULL_MS);
  } catch (err) {
    console.warn(`[supabaseSync] initUserSync error for user ${email}:`, err);
  }
};

const cleanupUserSync = (localUserId: number) => {
  const state = syncStates.get(localUserId);
  if (!state) return;
  if (state.pushTimer) clearTimeout(state.pushTimer);
  if (state.safetyTimer) clearInterval(state.safetyTimer);
  if (state.realtimeChannel) state.realtimeChannel.unsubscribe();
  syncStates.delete(localUserId);
};

// ─── Push & Pull ──────────────────────────────────────────────────────────────

const pushNowForUser = async (state: UserSyncState) => {
  if (state.pushInFlight) { state.pendingAfterFlight = true; return; }
  if (isApplyingRemote) return;
  state.pushInFlight = true;
  state.skipUntilTs = Date.now() + 3000; // prevent echo loop

  try {
    const active = await ensureUserSession(state);
    if (!active) return;

    await ensureBucket(state.accessToken);

    const snapshot = await buildSnapshot(state.localUserId, state.accessToken, state.supabaseUserId);
    const bodyStr = JSON.stringify({ user_id: state.supabaseUserId, data: snapshot, updated_at: new Date().toISOString() });
    const sizeKb = (bodyStr.length / 1024).toFixed(1);
    
    console.log(`[supabaseSync] 📤 pushing ${sizeKb} KB for ${state.email}...`);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${state.accessToken}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: bodyStr,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[supabaseSync] Push failed for ${state.email} (${res.status}): ${body.slice(0, 200)}`);
    } else {
      const c = (snapshot as any).__sqlite_export__?.counts || {};
      console.log(`[supabaseSync] ✅ pushed successfully for ${state.email} — models=${c.models||0} planning=${c.planningEvents||0} workers=${c.workers||0} hrWorkers=${c.hrWorkers||0}`);
      
      // Broadcast signal
      try {
        await state.realtimeChannel.send({ type: 'broadcast', event: 'updated', payload: {} });
      } catch (err) {
        console.warn(`[supabaseSync] Failed to send broadcast for ${state.email}:`, err);
      }

      // Clear outbox
      try {
        db.prepare("UPDATE sync_outbox SET status = 'synced' WHERE status = 'pending'").run();
      } catch (e) {
        console.warn('[supabaseSync] Failed to clear outbox:', e);
      }
    }
  } catch (err) {
    console.warn(`[supabaseSync] pushNow error for ${state.email}:`, err);
  } finally {
    state.pushInFlight = false;
    if (state.pendingAfterFlight) {
      state.pendingAfterFlight = false;
      schedulePush(state.localUserId);
    }
  }
};

const pullAndMergeForUser = async (state: UserSyncState): Promise<boolean> => {
  if (state.pushInFlight) return true;
  if (isApplyingRemote) return true;
  if (state.skipUntilTs && Date.now() < state.skipUntilTs) return true;

  try {
    const active = await ensureUserSession(state);
    if (!active) return false;

    const { data: meta, error: metaErr } = await state.supabaseClient
      .from('user_data')
      .select('updated_at')
      .eq('user_id', state.supabaseUserId)
      .maybeSingle();
    if (metaErr) return false;
    if (!meta) return true;

    const ts = (meta as { updated_at?: string }).updated_at
      ? new Date((meta as { updated_at: string }).updated_at).getTime()
      : 0;

    if (state.lastAppliedAt && ts <= state.lastAppliedAt) return true; // already synced

    const { data: row, error } = await state.supabaseClient
      .from('user_data')
      .select('data, updated_at')
      .eq('user_id', state.supabaseUserId)
      .maybeSingle();

    if (error) return false;
    if (!row?.data) return true;

    state.lastAppliedAt = row.updated_at ? new Date(row.updated_at).getTime() : ts;
    
    isApplyingRemote = true;
    try {
      mergeSnapshotIntoSqlite((row as { data: any }).data, state.localUserId);
    } finally {
      isApplyingRemote = false;
    }
    return true;
  } catch (e) {
    console.warn(`[supabaseSync] Pull error for ${state.email}:`, (e as Error).message);
    return false;
  }
};

export const schedulePush = (localUserId: number) => {
  const state = syncStates.get(localUserId);
  if (!state) return;
  if (state.pushTimer) clearTimeout(state.pushTimer);
  state.pushTimer = setTimeout(() => {
    state.pushTimer = null;
    void pushNowForUser(state);
  }, PUSH_DELAY_MS);
};

// ─── Middleware ──────────────────────────────────────────────────────────────

export const supabaseSyncMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith('/api/')) return next();
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (req.path.startsWith('/api/auth/')) return next();

  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const id = randomUUID();
        let tableName = 'unknown';
        const parts = req.path.split('/');
        if (parts[2]) {
          tableName = parts[2];
          if (parts[3] && !/^[0-9a-fA-F-]{36}$|^\d+$/.test(parts[3])) {
            tableName = `${parts[2]}_${parts[3]}`;
          }
        }
        const recordId = req.params.id || req.body?.id || '';
        const action = method === 'POST' ? 'INSERT' : method === 'PUT' ? 'UPDATE' : method === 'DELETE' ? 'DELETE' : method;
        let payload: string | null = null;
        if (req.body) {
          const bodyCopy = { ...req.body };
          const sensitiveFields = ['password', 'salary', 'cin', 'cnss', 'card_pin', 'pin', 'token'];
          for (const field of sensitiveFields) {
            if (field in bodyCopy) {
              bodyCopy[field] = '[REDACTED]';
            }
          }
          payload = JSON.stringify(bodyCopy);
        }
        
        db.prepare(`
          INSERT INTO sync_outbox (id, table_name, record_id, action, payload)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, tableName, String(recordId), action, payload);

        // Impersonation audit trail
        if ((req as any).viaImpersonation) {
          try {
            const actor = 'MASTER';
            const targetUserId = (req as any).user?.id || null;
            const auditAction = `${method}:${req.path}`;
            db.prepare(`
              INSERT INTO impersonation_audit_logs (id, actor, target_user_id, action, details, via_impersonation)
              VALUES (?, ?, ?, ?, ?, 1)
            `).run(randomUUID(), actor, targetUserId, auditAction, payload);
          } catch (auditErr) {
            console.error('[Impersonation Audit] Failed to log write:', auditErr);
          }
        }

        // Schedule push for this specific user (only when server sync is enabled)
        const localUserId = (req as any).user?.id;
        if (localUserId && SERVER_SYNC_ENABLED) {
          schedulePush(localUserId);
        }
      } catch (err) {
        console.error('[supabaseSyncMiddleware] outbox log error:', err);
      }
    }
  });
  next();
};

// ─── Startup and Backups ─────────────────────────────────────────────────────

const getOwnerSession = async (): Promise<{ userId: string; accessToken: string } | null> => {
  const ownerRow = db.prepare('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?').get(OWNER_EMAIL) as { id: number } | undefined;
  if (ownerRow) {
    const state = syncStates.get(ownerRow.id);
    if (state) {
      const ok = await ensureUserSession(state);
      if (ok) return { userId: state.supabaseUserId, accessToken: state.accessToken };
    }
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
    });
    if (res.ok) {
      const data = await res.json() as { access_token: string; user: { id: string } };
      return { userId: data.user.id, accessToken: data.access_token };
    }
  } catch {}
  return null;
};

export const backupDatabaseToSupabase = async () => {
  let tempBackupPath: string | null = null;
  try {
    const sess = await getOwnerSession();
    if (!sess) return;

    const backupBucketConfigured = await ensureBackupBucketConfigured(sess.accessToken);
    if (!backupBucketConfigured) return;

    const companyId = sess.userId;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    tempBackupPath = path.join(dbDir, `temp_backup_${timestamp}.sqlite`);

    console.log(`[supabaseSync] 🗄️ Starting SQLite database backup via VACUUM INTO...`);
    db.prepare(`VACUUM INTO ?`).run(tempBackupPath);

    if (!fs.existsSync(tempBackupPath)) {
      throw new Error(`Temp backup file not found at ${tempBackupPath}`);
    }

    const buffer = fs.readFileSync(tempBackupPath);
    const filename = `backups/${companyId}/backup_${timestamp}.sqlite`;

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BACKUP_BUCKET}/${filename}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sqlite3',
        Authorization: `Bearer ${sess.accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload failed: ${await uploadRes.text()}`);
    }

    console.log(`[supabaseSync] ✅ SQLite backup uploaded successfully: ${filename}`);
  } catch (err) {
    console.error('[supabaseSync] SQLite database backup failed:', err);
  } finally {
    if (tempBackupPath && fs.existsSync(tempBackupPath)) {
      try {
        fs.unlinkSync(tempBackupPath);
      } catch (cleanupErr) {
        console.warn('[supabaseSync] failed to delete temp SQLite backup:', cleanupErr);
      }
    }
  }
};

export const startSupabaseSync = async () => {
  // 1. Initialize default owner if credentials exist in .env
  // Toujours initialiser (même avec SUPABASE_SERVER_SYNC=false) pour
  // écouter les broadcasts Realtime et fusionner les données entrantes
  // dans SQLite (pull uniquement). Le push est contrôlé par SERVER_SYNC_ENABLED.
  if (canSync) {
    const ownerRow = db.prepare('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?').get(OWNER_EMAIL) as { id: number } | undefined;
    if (ownerRow) {
      const mode = SERVER_SYNC_ENABLED ? 'push+receive' : 'receive-only';
      console.log(`[supabaseSync] Initializing default owner sync for ${OWNER_EMAIL} (${mode})`);
      void initUserSync(ownerRow.id, '', OWNER_EMAIL, null);
    } else {
      console.warn(`[supabaseSync] Default owner email ${OWNER_EMAIL} not found in local SQLite users table.`);
    }
  } else {
    console.log('[supabaseSync] Default owner credentials not set. Dynamic sync only.');
  }

  // 2. Load all saved multi-user sessions
  try {
    const sessions = db.prepare(`
      SELECT s.user_id, s.supabase_user_id, s.refresh_token, u.email
      FROM supabase_sessions s
      JOIN users u ON s.user_id = u.id
    `).all() as Array<{ user_id: number; supabase_user_id: string; refresh_token: string; email: string }>;

    for (const sess of sessions) {
      // Avoid re-initializing if it is the owner and already initialized
      const ownerRow = canSync ? db.prepare('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?').get(OWNER_EMAIL) as { id: number } | undefined : null;
      if (ownerRow && ownerRow.id === sess.user_id) continue;

      console.log(`[supabaseSync] Restoring saved sync session for ${sess.email}`);
      void initUserSync(sess.user_id, sess.supabase_user_id, sess.email, sess.refresh_token);
    }
  } catch (err) {
    console.warn('[supabaseSync] Failed to restore sessions from database:', err);
  }

  // Schedule SQLite backup for the owner (runs 15s after startup, then every 12 hours)
  setTimeout(() => { void backupDatabaseToSupabase(); }, 15000);
  setInterval(() => { void backupDatabaseToSupabase(); }, 12 * 60 * 60 * 1000);
};

export const supabaseSyncEnabled = () => syncStates.size > 0 || enabled;

export const logSupabaseSyncStatus = () => {
  console.log(`[supabaseSync] Running in multi-user mode. Active sync sessions: ${syncStates.size}`);
};
