import { supabase } from './supabaseClient';
import { SCHEMA_VERSION, migrateSnapshot } from './dataVersion';

// Keys synchronisées vers Supabase (toutes les données qui doivent suivre l'utilisateur entre appareils)
const SYNC_KEYS = [
  'beramethode_autosave_v1',
  'beramethode_library',
  'beramethode_planning',
  'beramethode_suivis',
  'beramethode_settings',
  'beramethode_machine_instances',
  'beramethode_machines_v1',
  'beramethode_machines_fleet_history_v1',
  'beramethode_manual_links',
  'beramethode_demandesAppro',
  'beramethode_tombstones', // soft-delete markers ({type,id,deleted_at})
  'bera_nav_config',
  'BERA_CUSTOM_ROLES',
  'BERA_CUSTOM_PARTITIONS',
  'BERA_SALLES',
];

const TABLE = 'user_data';
const STORAGE_BUCKET = 'bera-assets';

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let isApplyingRemote = false;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

// ─── Image upload helpers ─────────────────────────────────────────────────────

const imgUrlCache = new Map<string, string>();
const IMAGE_FIELDS = new Set(['image', 'photo', 'fournisseurLogo']);
const IMAGE_ARRAY_FIELDS = new Set(['images', 'machinePhotos']);

const hashB64 = async (b64: string): Promise<string> => {
  try {
    const enc = new TextEncoder();
    // Hash first 4KB + length — enough for dedup, avoids hashing huge strings
    const sample = b64.slice(0, 4096) + String(b64.length);
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(sample));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  } catch {
    // Fallback: length + first 32 chars (non-cryptographic, still useful)
    return `${b64.length}_${b64.slice(0, 32).replace(/[^a-zA-Z0-9]/g, '')}`;
  }
};

/**
 * Upload a base64 data-URL to Supabase Storage.
 * Returns the public URL, or null on failure (caller should strip the field).
 */
const uploadBase64 = async (dataUrl: string): Promise<string | null> => {
  try {
    const m = dataUrl.match(/^data:(image\/([^;]+));base64,(.+)$/s);
    if (!m) return null;
    const [, contentType, rawExt, b64data] = m;
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;

    const hash = await hashB64(b64data);
    const filename = `${hash}.${ext}`;
    const cacheKey = filename;

    if (imgUrlCache.has(cacheKey)) return imgUrlCache.get(cacheKey)!;

    // Build public URL first — check if file already exists (avoid re-upload)
    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filename);
    const publicUrl = urlData.publicUrl;

    const headRes = await fetch(publicUrl, { method: 'HEAD' }).catch(() => null);
    if (headRes?.ok) {
      imgUrlCache.set(cacheKey, publicUrl);
      return publicUrl;
    }

    // Convert base64 → Uint8Array → Blob
    const byteArray = Uint8Array.from(atob(b64data), c => c.charCodeAt(0));
    const blob = new Blob([byteArray], { type: contentType });

    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filename, blob, {
      contentType,
      upsert: true,
    });

    if (error) {
      console.warn('[cloudSync] image upload failed:', error.message);
      return null;
    }

    imgUrlCache.set(cacheKey, publicUrl);
    return publicUrl;
  } catch (e) {
    console.warn('[cloudSync] uploadBase64 error:', e);
    return null;
  }
};

/**
 * Walk a snapshot object tree and replace any base64 image fields
 * with Supabase Storage URLs. Fields that fail to upload are stripped
 * (keeps the user_data UPSERT payload small and avoids timeouts).
 */
const replaceImages = async (o: any): Promise<any> => {
  if (!o || typeof o !== 'object') return o;
  if (Array.isArray(o)) return Promise.all(o.map(item => replaceImages(item)));

  const out: any = {};
  for (const k of Object.keys(o)) {
    const v = o[k];

    if (IMAGE_FIELDS.has(k)) {
      if (typeof v === 'string' && v.startsWith('data:')) {
        const url = await uploadBase64(v);
        if (url) out[k] = url; // replaced with Storage URL
        // else: field omitted (stripped) to keep payload small
      } else if (v) {
        out[k] = v; // already a URL or empty
      }

    } else if (IMAGE_ARRAY_FIELDS.has(k) && Array.isArray(v)) {
      const urls = await Promise.all(v.map(async (item: any) => {
        if (typeof item === 'string' && item.startsWith('data:')) {
          return uploadBase64(item);
        }
        return item; // already a URL
      }));
      const valid = urls.filter(Boolean);
      if (valid.length > 0) out[k] = valid;

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
  // Préserve les données serveur seed importées (workers, HR, magasin)
  // pour qu'elles ne soient pas effacées par un push subséquent.
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
        try {
          localStorage.setItem(k, JSON.stringify(snapshot[k]));
        } catch {}
      }
    }
    // Données serveur (lecture seule, non re-synchronisées)
    if ('__sqlite_export__' in snapshot) {
      try {
        localStorage.setItem('__bera_sqlite_export__', JSON.stringify(snapshot.__sqlite_export__));
      } catch {}
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

  // Garde-fou: ne JAMAIS écraser une donnée distante avec un snapshot vide.
  const lib = (snapshot as any).beramethode_library;
  const plan = (snapshot as any).beramethode_planning;
  const sqlExp = (snapshot as any).__sqlite_export__;
  const libEmpty = !Array.isArray(lib) || lib.length === 0;
  const planEmpty = !Array.isArray(plan) || plan.length === 0;
  const sqlEmpty = !sqlExp || Object.keys(sqlExp).length === 0;
  if (libEmpty && planEmpty && sqlEmpty) {
    console.warn('[cloudSync] push annulé: snapshot local vide (probable push prématuré)');
    return;
  }

  // Upload base64 images to Supabase Storage and replace with public URLs.
  // This keeps the user_data row small and makes images visible on all devices.
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

    // Détecte si le snapshot remote diffère vraiment du local (signature légère).
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

// ─── Realtime ─────────────────────────────────────────────────────────────────

export const startCloudSync = (userId: string) => {
  if (!userId) return;

  // Intercepter writes à localStorage pour déclencher un push debouncé
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && SYNC_KEYS.includes(key) && !isApplyingRemote) {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => pushSnapshotToCloud(userId), 1500);
    }
  };

  // Realtime: écouter les changements depuis d'autres appareils
  if (realtimeChannel) realtimeChannel.unsubscribe();
  realtimeChannel = supabase
    .channel(`user_data_${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
      (payload) => {
        const newRow = (payload.new as { data?: Record<string, unknown> } | null)?.data;
        if (newRow) applySnapshotToLocal(newRow);
      },
    )
    .subscribe();
};

export const stopCloudSync = () => {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
    realtimeChannel = null;
  }
};
