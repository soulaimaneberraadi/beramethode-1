/**
 * Auto-sync the local SQLite snapshot to Supabase `user_data` so the same
 * account can read the data on the Vercel static deployment (mobile / web).
 *
 * Images (base64) are uploaded to Supabase Storage (bucket `bera-assets`)
 * and replaced with public URLs so they display on Vercel without bloating
 * the user_data UPSERT payload.
 *
 * Disabled unless SUPABASE_OWNER_EMAIL + SUPABASE_OWNER_PASSWORD are set in
 * the environment. Push is debounced (PUSH_DELAY_MS) and triggered from a
 * middleware that watches successful API writes.
 */

import { createHash } from 'crypto';
import db from './db';
import { Request, Response, NextFunction } from 'express';
import { markLocalPushing, isApplyingRemoteSnapshot } from './supabaseRealtime';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jiscgwioxwsulaopsivc.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2Nnd2lveHdzdWxhb3BzaXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTcwNTgsImV4cCI6MjA5MTU3MzA1OH0.-jRI1RlbjxecLyN2b83xmjuJCKhs7ti_7_-RWXNCNgk';
const OWNER_EMAIL = (process.env.SUPABASE_OWNER_EMAIL || '').trim().toLowerCase();
const OWNER_PASSWORD = process.env.SUPABASE_OWNER_PASSWORD || '';
const PUSH_DELAY_MS = Number(process.env.SUPABASE_SYNC_DEBOUNCE_MS || 2000);
const STORAGE_BUCKET = 'bera-assets';
// When Storage upload fails (e.g. bucket missing / no service_role), keep the
// image inline in user_data instead of stripping it — as long as it stays
// under this base64 size. Larger images are still stripped to avoid bloating
// the UPSERT payload. Override with SUPABASE_INLINE_IMAGE_MAX (bytes).
const INLINE_IMAGE_MAX = Number(process.env.SUPABASE_INLINE_IMAGE_MAX || 700_000);

const enabled = Boolean(OWNER_EMAIL && OWNER_PASSWORD);

type Session = { userId: string; accessToken: string; expiresAt: number };
let session: Session | null = null;
let pushTimer: NodeJS.Timeout | null = null;
let pushInFlight = false;
let pendingAfterFlight = false;

// In-memory cache: MD5 filename → public URL (avoids re-uploading same image)
const imageUrlCache = new Map<string, string>();
// Track whether the bucket has been confirmed to exist this session
let bucketReady: boolean | null = null;

// ─── DB helpers ───────────────────────────────────────────────────────────────

const safe = <T = any>(sql: string): T[] => {
  try { return db.prepare(sql).all() as T[]; } catch { return []; }
};

const parseJsonFields = (row: any) => {
  if (!row || typeof row !== 'object') return row;
  const out: any = { ...row };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
      try { out[k] = JSON.parse(v); } catch { /* keep raw */ }
    }
  }
  return out;
};

// planning_events and suivi_data store the full object in `raw_data TEXT`.
// The Express API returns JSON.parse(r.raw_data), so the snapshot must do
// the same — otherwise Vercel reads rows with raw_data nested one level
// deeper than expected (suivi.raw_data.sorties instead of suivi.sorties).
const extractRawData = (rows: any[]): any[] =>
  rows.map((row: any) => {
    if (!row) return row;
    const raw = row.raw_data;
    if (typeof raw === 'string' && raw.length > 0) {
      try { return JSON.parse(raw); } catch { /* fall through */ }
    }
    return parseJsonFields(row);
  });

// ─── Supabase Storage helpers ─────────────────────────────────────────────────

const ensureBucket = async (accessToken: string): Promise<boolean> => {
  if (bucketReady === true) return true;
  try {
    // Check if bucket exists
    const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${STORAGE_BUCKET}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) { bucketReady = true; return true; }

    // Try to create it (public so images are accessible without auth on Vercel)
    const createRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ id: STORAGE_BUCKET, name: STORAGE_BUCKET, public: true }),
    });
    bucketReady = createRes.ok;
    if (!bucketReady) {
      const body = await createRes.text().catch(() => '');
      console.warn(`[supabaseSync] could not create bucket (${createRes.status}): ${body.slice(0, 120)}`);
    }
    return bucketReady;
  } catch (e) {
    console.warn('[supabaseSync] ensureBucket error:', e);
    bucketReady = false;
    return false;
  }
};

/**
 * Upload a base64 data-URL to Supabase Storage.
 * Uses MD5 of the raw bytes as filename → deterministic, dedup-safe.
 * Returns the public URL, or null on failure.
 */
const uploadBase64 = async (dataUrl: string, accessToken: string): Promise<string | null> => {
  // Bucket déjà confirmé absent (ensureBucket) → ne pas réessayer chaque image :
  // ça échouerait pareil et inonderait les logs de « Bucket not found ».
  if (bucketReady === false) return null;
  try {
    const m = dataUrl.match(/^data:(image\/([^;]+));base64,(.+)$/s);
    if (!m) return null;
    const [, contentType, rawExt, b64data] = m;
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;

    const hash = createHash('md5').update(b64data).digest('hex');
    const filename = `${hash}.${ext}`;

    if (imageUrlCache.has(filename)) return imageUrlCache.get(filename)!;

    // Check if already uploaded (server restart case)
    const headRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/info/public/${STORAGE_BUCKET}/${filename}`,
      { headers: { apikey: SUPABASE_ANON_KEY } },
    );
    if (headRes.ok) {
      const url = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filename}`;
      imageUrlCache.set(filename, url);
      return url;
    }

    const buffer = Buffer.from(b64data, 'base64');
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filename}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
          'x-upsert': 'true',
        },
        body: buffer,
      },
    );

    if (!uploadRes.ok) {
      const body = await uploadRes.text().catch(() => '');
      console.warn(`[supabaseSync] image upload failed (${uploadRes.status}): ${body.slice(0, 100)}`);
      return null;
    }

    const url = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filename}`;
    imageUrlCache.set(filename, url);
    return url;
  } catch (e) {
    console.warn('[supabaseSync] uploadBase64 error:', e);
    return null;
  }
};

/**
 * Walk an object tree and:
 * - if a field is a base64 image → upload to Storage → replace with URL
 * - if upload fails → strip the field (keep snapshot small)
 * - if field is already a URL → keep as-is
 */
const IMAGE_FIELDS = new Set(['image', 'photo', 'fournisseurLogo']);
const IMAGE_ARRAY_FIELDS = new Set(['images', 'machinePhotos']);

const replaceImages = async (o: any, accessToken: string): Promise<any> => {
  if (!o || typeof o !== 'object') return o;
  if (Array.isArray(o)) {
    return Promise.all(o.map(item => replaceImages(item, accessToken)));
  }

  const out: any = {};
  for (const k of Object.keys(o)) {
    const v = o[k];

    if (IMAGE_FIELDS.has(k)) {
      if (typeof v === 'string' && v.startsWith('data:')) {
        const url = await uploadBase64(v, accessToken);
        if (url) out[k] = url;
        // Fallback: upload failed (bucket missing / no service_role) → keep
        // the image inline if small enough, so it still displays on Vercel.
        else if (v.length <= INLINE_IMAGE_MAX) out[k] = v;
        // else: field omitted (stripped) — keeps the UPSERT payload small
      } else if (v) {
        out[k] = v; // already a URL or empty string
      }

    } else if (IMAGE_ARRAY_FIELDS.has(k) && Array.isArray(v)) {
      const urls = await Promise.all(v.map(async (item: any) => {
        if (typeof item === 'string' && item.startsWith('data:')) {
          const url = await uploadBase64(item, accessToken);
          // Fallback to inline if upload failed and image is small enough
          return url || (item.length <= INLINE_IMAGE_MAX ? item : null);
        }
        return item; // already a URL
      }));
      const valid = urls.filter(Boolean);
      if (valid.length > 0) out[k] = valid;

    } else if (Array.isArray(v)) {
      out[k] = await replaceImages(v, accessToken);
    } else if (v && typeof v === 'object') {
      out[k] = await replaceImages(v, accessToken);
    } else {
      out[k] = v;
    }
  }
  return out;
};

// ─── Snapshot builder ─────────────────────────────────────────────────────────

const buildSnapshot = async (accessToken: string) => {
  const models = safe('SELECT * FROM models');
  const planningEvents = safe('SELECT * FROM planning_events');
  const suiviData = safe('SELECT * FROM suivi_data');
  const posteSuivi = safe('SELECT * FROM poste_suivi');
  const workers = safe('SELECT * FROM workers');
  const workerSkills = safe('SELECT * FROM worker_skills');
  const workerPointage = safe('SELECT * FROM worker_pointage');
  const magasinProducts = safe('SELECT * FROM magasin_products');
  const magasinLots = safe('SELECT * FROM magasin_lots');
  const magasinMouvements = safe('SELECT * FROM magasin_mouvements');
  const magasinCommandes = safe('SELECT * FROM magasin_commandes');
  const magasinDemandes = safe('SELECT * FROM magasin_demandes');
  const demandesAppro = safe('SELECT * FROM demandes_appro');
  const appSettings = safe('SELECT * FROM app_settings');
  const hrWorkers = safe('SELECT * FROM hr_workers');
  const hrPointage = safe('SELECT * FROM hr_pointage');
  const hrProduction = safe('SELECT * FROM hr_production');
  const hrAvances = safe('SELECT * FROM hr_avances');

  // Upload images to Storage and replace base64 with public URLs.
  // This runs in parallel per-model for speed.
  const libraryModels = await Promise.all(
    models.map(async (row: any) => {
      let m: any;
      if (row && typeof row.data === 'string') {
        try { m = JSON.parse(row.data); } catch { m = parseJsonFields(row); }
      } else {
        m = parseJsonFields(row);
      }
      return replaceImages(m, accessToken);
    }),
  );

  const slimProducts = await Promise.all(
    magasinProducts.map(async (row: any) => replaceImages(parseJsonFields(row), accessToken)),
  );

  const slimWorkers = await Promise.all(
    workers.map(async (row: any) => replaceImages(parseJsonFields(row), accessToken)),
  );

  const slimHrWorkers = await Promise.all(
    hrWorkers.map(async (row: any) => replaceImages(parseJsonFields(row), accessToken)),
  );

  return {
    beramethode_library: libraryModels,
    beramethode_planning: extractRawData(planningEvents),
    beramethode_suivis: extractRawData(suiviData),
    beramethode_demandesAppro: demandesAppro.map(parseJsonFields),
    beramethode_settings: appSettings.length === 1 ? parseJsonFields(appSettings[0]) : appSettings.map(parseJsonFields),
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

// ─── Auth ─────────────────────────────────────────────────────────────────────

const ensureSession = async (): Promise<Session | null> => {
  if (session && session.expiresAt - Date.now() > 60_000) return session;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[supabaseSync] login failed (${res.status}): ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json() as { access_token: string; expires_in: number; user: { id: string } };
    session = {
      userId: data.user.id,
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
    return session;
  } catch (err) {
    console.warn('[supabaseSync] login error:', err);
    return null;
  }
};

// ─── Push ─────────────────────────────────────────────────────────────────────

const pushNow = async () => {
  if (!enabled) return;
  if (pushInFlight) { pendingAfterFlight = true; return; }
  if (isApplyingRemoteSnapshot()) return;
  pushInFlight = true;
  markLocalPushing();
  try {
    const sess = await ensureSession();
    if (!sess) return;

    // Ensure the storage bucket exists before uploading images
    await ensureBucket(sess.accessToken);

    const snapshot = await buildSnapshot(sess.accessToken);
    const bodyStr = JSON.stringify({ user_id: sess.userId, data: snapshot, updated_at: new Date().toISOString() });
    const sizeKb = (bodyStr.length / 1024).toFixed(1);
    console.log(`[supabaseSync] 📤 pushing ${sizeKb} KB...`);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${sess.accessToken}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: bodyStr,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[supabaseSync] upsert failed (${res.status}): ${body.slice(0, 200)}`);
      if (res.status === 401 || res.status === 403) session = null;
    } else {
      const c = (snapshot as any).__sqlite_export__?.counts || {};
      console.log(`[supabaseSync] ✅ pushed — models=${c.models||0} planning=${c.planningEvents||0} workers=${c.workers||0} hrWorkers=${c.hrWorkers||0} (images→Storage)`);
    }
  } catch (err) {
    console.warn('[supabaseSync] push error:', err);
  } finally {
    pushInFlight = false;
    if (pendingAfterFlight) {
      pendingAfterFlight = false;
      schedulePush();
    }
  }
};

export const schedulePush = () => {
  if (!enabled) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void pushNow(); }, PUSH_DELAY_MS);
};

/**
 * Express middleware: after a successful write to /api/*, schedule a push.
 */
export const supabaseSyncMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!enabled) return next();
  if (!req.path.startsWith('/api/')) return next();
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (req.path.startsWith('/api/auth/')) return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) schedulePush();
  });
  next();
};

export const supabaseSyncEnabled = () => enabled;

export const logSupabaseSyncStatus = () => {
  if (enabled) {
    console.log(`[supabaseSync] enabled → ${OWNER_EMAIL} @ ${SUPABASE_URL}`);
  } else {
    console.log('[supabaseSync] disabled (set SUPABASE_OWNER_EMAIL + SUPABASE_OWNER_PASSWORD in .env to enable)');
  }
};

// Push once on boot so a fresh container/PC immediately reflects the
// current SQLite state, even without subsequent writes.
if (enabled) {
  setTimeout(() => { schedulePush(); }, 3000);
}
