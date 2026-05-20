/**
 * Auto-sync the local SQLite snapshot to Supabase `user_data` so the same
 * account can read the data on the Vercel static deployment (mobile / web).
 *
 * Disabled unless SUPABASE_OWNER_EMAIL + SUPABASE_OWNER_PASSWORD are set in
 * the environment. Push is debounced (PUSH_DELAY_MS) and triggered from a
 * middleware that watches successful API writes.
 *
 * The snapshot shape matches `scripts/export-to-supabase.mjs` so the
 * frontend (cloudSync + apiShim) reads it transparently.
 */

import db from './db';
import { Request, Response, NextFunction } from 'express';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jiscgwioxwsulaopsivc.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2Nnd2lveHdzdWxhb3BzaXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTcwNTgsImV4cCI6MjA5MTU3MzA1OH0.-jRI1RlbjxecLyN2b83xmjuJCKhs7ti_7_-RWXNCNgk';
const OWNER_EMAIL = (process.env.SUPABASE_OWNER_EMAIL || '').trim().toLowerCase();
const OWNER_PASSWORD = process.env.SUPABASE_OWNER_PASSWORD || '';
const PUSH_DELAY_MS = Number(process.env.SUPABASE_SYNC_DEBOUNCE_MS || 2000);

const enabled = Boolean(OWNER_EMAIL && OWNER_PASSWORD);

type Session = { userId: string; accessToken: string; expiresAt: number };
let session: Session | null = null;
let pushTimer: NodeJS.Timeout | null = null;
let pushInFlight = false;
let pendingAfterFlight = false;

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

const buildSnapshot = () => {
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

  // The model JSON is stored in the `data` column; surface it under
  // `beramethode_library` so the frontend reads the same shape as the
  // /api/models GET (raw model objects, not the SQL row wrapper).
  const libraryModels = models.map((row: any) => {
    if (row && typeof row.data === 'string') {
      try { return JSON.parse(row.data); } catch { /* fall through */ }
    }
    return parseJsonFields(row);
  });

  return {
    beramethode_library: libraryModels,
    beramethode_planning: planningEvents.map(parseJsonFields),
    beramethode_suivis: suiviData.map(parseJsonFields),
    beramethode_demandesAppro: demandesAppro.map(parseJsonFields),
    beramethode_settings: appSettings.length === 1 ? parseJsonFields(appSettings[0]) : appSettings.map(parseJsonFields),
    __sqlite_export__: {
      exported_at: new Date().toISOString(),
      counts: {
        models: libraryModels.length,
        planningEvents: planningEvents.length,
        suiviData: suiviData.length,
        workers: workers.length,
        magasinProducts: magasinProducts.length,
        hrWorkers: hrWorkers.length,
      },
      workers: workers.map(parseJsonFields),
      workerSkills: workerSkills.map(parseJsonFields),
      workerPointage: workerPointage.map(parseJsonFields),
      posteSuivi: posteSuivi.map(parseJsonFields),
      magasin: {
        products: magasinProducts.map(parseJsonFields),
        lots: magasinLots.map(parseJsonFields),
        mouvements: magasinMouvements.map(parseJsonFields),
        commandes: magasinCommandes.map(parseJsonFields),
        demandes: magasinDemandes.map(parseJsonFields),
      },
      hr: {
        workers: hrWorkers.map(parseJsonFields),
        pointage: hrPointage.map(parseJsonFields),
        production: hrProduction.map(parseJsonFields),
        avances: hrAvances.map(parseJsonFields),
      },
    },
  };
};

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

const pushNow = async () => {
  if (!enabled) return;
  if (pushInFlight) { pendingAfterFlight = true; return; }
  pushInFlight = true;
  try {
    const sess = await ensureSession();
    if (!sess) return;
    const snapshot = buildSnapshot();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${sess.accessToken}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ user_id: sess.userId, data: snapshot, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[supabaseSync] upsert failed (${res.status}): ${body.slice(0, 200)}`);
      // Force re-login on next push if token was rejected.
      if (res.status === 401 || res.status === 403) session = null;
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
 * Mount this AFTER routes are declared (so res.statusCode is final) by
 * listening on res.on('finish').
 */
export const supabaseSyncMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!enabled) return next();
  if (!req.path.startsWith('/api/')) return next();
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  // Auth routes don't change app data.
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
