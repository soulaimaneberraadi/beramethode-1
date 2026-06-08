import { supabase } from './supabaseClient';
import { SCHEMA_VERSION, migrateSnapshot } from './dataVersion';

const SYNC_KEYS = [
  'beramethode_autosave_v1',
  'beramethode_chrono_sessions_v1',
  'beramethode_library',
  'beramethode_planning',
  'beramethode_suivis',
  'beramethode_settings',
  'beramethode_machine_instances',
  'beramethode_machines_v1',
  'beramethode_machines_fleet_history_v1',
  'beramethode_manual_links',
  'beramethode_demandesAppro',
  'beramethode_tombstones',
  'bera_nav_config',
  'BERA_CUSTOM_ROLES',
  'BERA_CUSTOM_PARTITIONS',
  'BERA_SALLES',
];

const TABLE = 'user_data';
const STORAGE_BUCKET = 'bera-assets';

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let isApplyingRemote = false;

// Délai de regroupement des écritures avant un push cloud. Une valeur trop
// basse (ex. 1,5 s) provoque une rafale d'UPSERT du blob `user_data` (~2 Mo)
// qui sature la base free-tier. 8 s regroupe les éditions successives.
const PUSH_DEBOUNCE_MS = 8000;

// ─── Image processing ─────────────────────────────────────────────────────────

const IMAGE_FIELDS = new Set(['image', 'photo', 'fournisseurLogo']);
const IMAGE_ARRAY_FIELDS = new Set(['images', 'machinePhotos']);
const imgUrlCache = new Map<string, string>();

// Max dimension and quality for compressed thumbnails stored inline in user_data
const IMG_MAX_DIM = 700;
const IMG_QUALITY = 0.72;
// ~100KB in base64 (133 chars ≈ 100 bytes); images above this are stripped
const IMG_MAX_INLINE_B64 = 140_000;

/**
 * Compress a base64 image using Canvas.
 * Returns a compressed JPEG data-URL, or null if compression fails / output
 * is still too large to store inline.
 */
const compressImage = (dataUrl: string): Promise<string | null> =>
  new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (!w || !h) { resolve(null); return; }
        const ratio = Math.min(IMG_MAX_DIM / w, IMG_MAX_DIM / h, 1);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/jpeg', IMG_QUALITY);
        resolve(out.length <= IMG_MAX_INLINE_B64 ? out : null);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });

/**
 * Process a single image field value:
 * 1. Try uploading to Supabase Storage → return permanent public URL (best)
 * 2. Fallback: compress inline → return compressed data-URL (no bucket needed)
 * 3. If both fail → return null (field will be stripped from snapshot)
 */
const processImage = async (dataUrl: string): Promise<string | null> => {
  if (!dataUrl.startsWith('data:')) return dataUrl; // already a URL

  // ── 1. Try Supabase Storage ───────────────────────────────────────────────
  try {
    const m = dataUrl.match(/^data:(image\/([^;]+));base64,(.+)$/s);
    if (m) {
      const [, contentType, rawExt, b64data] = m;
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;

      // Deterministic filename via SHA-256 (first 4KB + length sample)
      let filename: string;
      try {
        const enc = new TextEncoder();
        const sample = b64data.slice(0, 4096) + String(b64data.length);
        const buf = await crypto.subtle.digest('SHA-256', enc.encode(sample));
        const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
        filename = `${hex}.${ext}`;
      } catch {
        filename = `${b64data.length}_${b64data.slice(0, 16).replace(/\W/g, '')}.${ext}`;
      }

      if (imgUrlCache.has(filename)) return imgUrlCache.get(filename)!;

      // Check if already uploaded (avoids re-upload on repeated pushes)
      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filename);
      const publicUrl = urlData.publicUrl;
      const headOk = await fetch(publicUrl, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
      if (headOk) { imgUrlCache.set(filename, publicUrl); return publicUrl; }

      // Upload
      const byteArray = Uint8Array.from(atob(b64data), c => c.charCodeAt(0));
      const blob = new Blob([byteArray], { type: contentType });
      const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filename, blob, { contentType, upsert: true });
      if (!error) { imgUrlCache.set(filename, publicUrl); return publicUrl; }
    }
  } catch { /* fall through to compression */ }

  // ── 2. Compress inline (works without Storage bucket) ─────────────────────
  const compressed = await compressImage(dataUrl);
  return compressed; // null if still too large → caller strips the field
};

/**
 * Walk snapshot tree and replace base64 image fields:
 * - with a Storage URL if upload succeeds
 * - with a compressed data-URL if upload fails but compression fits
 * - field is omitted if both fail (keeps user_data small, avoids UPSERT timeout)
 */
const replaceImages = async (o: any): Promise<any> => {
  if (!o || typeof o !== 'object') return o;
  if (Array.isArray(o)) return Promise.all(o.map(item => replaceImages(item)));

  const out: any = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (IMAGE_FIELDS.has(k)) {
      if (typeof v === 'string' && v.startsWith('data:')) {
        const result = await processImage(v);
        if (result) out[k] = result;
      } else if (v) {
        out[k] = v;
      }
    } else if (IMAGE_ARRAY_FIELDS.has(k) && Array.isArray(v)) {
      const results = await Promise.all(v.map(async (item: any) => {
        if (typeof item === 'string' && item.startsWith('data:')) return processImage(item);
        return item;
      }));
      const valid = results.filter(Boolean);
      if (valid.length) out[k] = valid;
    } else if (v && typeof v === 'object') {
      out[k] = await replaceImages(v);
    } else {
      out[k] = v;
    }
  }
  return out;
};

// ─── Local snapshot ───────────────────────────────────────────────────────────

const collectLocalSnapshot = (): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const k of SYNC_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v != null) out[k] = JSON.parse(v);
    } catch {
      const raw = localStorage.getItem(k);
      if (raw != null) out[k] = raw;
    }
  }
  try {
    const exp = localStorage.getItem('__bera_sqlite_export__');
    if (exp) out.__sqlite_export__ = JSON.parse(exp);
  } catch {}
  return out;
};

const applySnapshotToLocal = (snapshot: Record<string, unknown> | null) => {
  if (!snapshot) return;
  isApplyingRemote = true;
  try {
    for (const k of SYNC_KEYS) {
      if (k in snapshot) {
        try { localStorage.setItem(k, JSON.stringify(snapshot[k])); } catch {}
      }
    }
    if ('__sqlite_export__' in snapshot) {
      try { localStorage.setItem('__bera_sqlite_export__', JSON.stringify(snapshot.__sqlite_export__)); } catch {}
    }
  } finally {
    isApplyingRemote = false;
  }
  window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-applied'));
};

// ─── Push ─────────────────────────────────────────────────────────────────────

export const pushSnapshotToCloud = async (userId: string) => {
  if (!userId || isApplyingRemote) return;
  let snapshot: Record<string, unknown> = { ...collectLocalSnapshot(), __schema_version: SCHEMA_VERSION };

  // Garde-fou: ne jamais écraser avec un snapshot vide
  const lib = (snapshot as any).beramethode_library;
  const plan = (snapshot as any).beramethode_planning;
  const sqlExp = (snapshot as any).__sqlite_export__;
  if ((!Array.isArray(lib) || !lib.length) && (!Array.isArray(plan) || !plan.length) && (!sqlExp || !Object.keys(sqlExp).length)) {
    console.warn('[cloudSync] push annulé: snapshot local vide');
    return;
  }

  // Replace base64 images with Storage URLs (or compressed inline data-URLs)
  try {
    snapshot = await replaceImages(snapshot) as Record<string, unknown>;
  } catch (e) {
    console.warn('[cloudSync] image processing error, pushing as-is:', e);
  }

  try {
    await supabase.from(TABLE).upsert(
      { user_id: userId, data: snapshot, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  } catch (err) {
    console.warn('Cloud push failed:', err);
  }
};

// ─── Pull ─────────────────────────────────────────────────────────────────────

const RELOAD_FLAG = 'beramethode_pulled_once';

export const pullSnapshotFromCloud = async (userId: string): Promise<boolean> => {
  if (!userId) return false;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data?.data) return false;
    let snap = data.data as Record<string, unknown>;
    const v = typeof snap.__schema_version === 'number' ? (snap.__schema_version as number) : 0;
    if (v < SCHEMA_VERSION) snap = migrateSnapshot(snap, v);

    const sig = (() => {
      try {
        const lib = (snap as any).beramethode_library;
        const plan = (snap as any).beramethode_planning;
        return [
          Array.isArray(lib) ? lib.length : 0,
          Array.isArray(plan) ? plan.length : 0,
          (snap as any).__sqlite_export__?.exported_at || '',
        ].join('|');
      } catch { return ''; }
    })();
    const lastSig = sessionStorage.getItem('beramethode_last_pull_sig');

    applySnapshotToLocal(snap);

    const wasEmpty = !sessionStorage.getItem(RELOAD_FLAG);
    const sigChanged = sig && sig !== lastSig;
    if (wasEmpty || sigChanged) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      if (sig) sessionStorage.setItem('beramethode_last_pull_sig', sig);
      setTimeout(() => window.location.reload(), 200);
    }
    return true;
  } catch (err) {
    console.warn('Cloud pull failed:', err);
    return false;
  }
};

// ─── Sync ───────────────────────────────────────────────────────────────────

export const startCloudSync = (userId: string) => {
  if (!userId) return;

  // Push à chaque écriture d'une clé synchronisée, regroupé via PUSH_DEBOUNCE_MS.
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && SYNC_KEYS.includes(key) && !isApplyingRemote) {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => pushSnapshotToCloud(userId), PUSH_DEBOUNCE_MS);
    }
  };

  // NOTE: pas d'abonnement Realtime sur `user_data`. Le blob (~2 Mo) déclenchait
  // un décodage WAL coûteux (>10 s) à chaque écriture, saturant la base
  // free-tier jusqu'au crash. La synchro inter-appareils se fait désormais via
  // pullSnapshotFromCloud à l'ouverture / au rafraîchissement de l'application.
};

export const stopCloudSync = () => {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
};
