import { supabase } from './supabaseClient';
import { SCHEMA_VERSION, migrateSnapshot } from './dataVersion';
import { pkey, lsGet, lsSet, isSyncKey, getCurrentEmail } from '../../lib/storageKeys';

const SYNC_KEYS = [
  'beramethode_autosave_v1',
  'beramethode_chrono_sessions_v1',
  'beramethode_library',
  'beramethode_planning',
  'beramethode_suivis',
  'beramethode_settings',
  'beramethode_company',
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
  'beramethode_subcontract_orders',
  'beramethode_subcontract_groups',
];

const TABLE = 'user_data';
const STORAGE_BUCKET = 'bera-assets';

/** Dernier compte ayant synchronisé sur ce navigateur — détecte les changements d'utilisateur. */
const LAST_SYNC_USER_KEY = 'beramethode_last_sync_user';

/**
 * `updated_at` du dernier snapshot RÉELLEMENT téléchargé (ou poussé) par cet
 * appareil. Sert au *pull conditionnel* : avant de télécharger le blob ~2 Mo,
 * on lit uniquement `updated_at` (quelques octets) ; s'il est identique, AUCUN
 * téléchargement du blob n'a lieu. C'est la cause n°1 de l'explosion d'egress :
 * chaque boot/reload + chaque notification Realtime re-téléchargeait 2 Mo même
 * quand rien n'avait changé. Persisté en localStorage pour survivre aux reloads.
 */
const LAST_PULLED_AT_KEY = 'beramethode_last_pulled_at';

/**
 * Purge toutes les données métier locales (clés synchronisées + export SQLite).
 * Sans cette purge, un nouvel utilisateur sur le même navigateur voit les
 * données du compte précédent — et son premier push les enverrait dans SON
 * cloud (fuite de données entre comptes).
 */
export const clearLocalAppData = () => {
  for (const k of SYNC_KEYS) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
  try { localStorage.removeItem('__bera_sqlite_export__'); } catch { /* ignore */ }
  try { localStorage.removeItem(LAST_PULLED_AT_KEY); } catch { /* ignore */ }
  try {
    sessionStorage.removeItem('beramethode_pulled_once');
    sessionStorage.removeItem('beramethode_last_pull_sig');
  } catch { /* ignore */ }
};

// NOTE : les anciennes fonctions savePrefixedBackup/restorePrefixedBackup
// (copie non-préfixé ↔ préfixé au changement de compte) ont été supprimées.
// Désormais TOUTES les couches (App.tsx, apiShim, cloudSync) lisent/écrivent
// directement les clés préfixées par compte via pkey()/lsGet()/lsSet(), donc
// l'isolation par compte est garantie par le suffixe ; aucune copie n'est
// nécessaire — et l'ancien savePrefixedBackup écrasait même les données
// préfixées du compte précédent par des clés non-préfixées vides (perte de
// données). Voir ensureLocalDataOwner ci-dessous.

export const ensureLocalDataOwner = (userId: string) => {
  if (!userId) return;
  try {
    const prev = localStorage.getItem(LAST_SYNC_USER_KEY);
    // On pose le scope AVANT toute lecture/écriture scopée ci-dessous.
    localStorage.setItem(LAST_SYNC_USER_KEY, userId);

    if (prev && prev !== userId) {
      // Changement de compte → purge des clés de base (anti-fuite inter-comptes).
      clearLocalAppData();
    } else {
      // Premier compte / même compte : MIGRER les données héritées des clés de
      // BASE (non-scopées, d'avant l'isolation par compte) vers les clés scopées
      // de CE compte, PUIS nettoyer la base. Récupère les données pré-isolation
      // sans les perdre (sinon un modèle enregistré sous la clé de base devient
      // invisible), et évite qu'elles fuitent vers un futur autre compte.
      // Fait AVANT le pull cloud → le merge (union) préservera ces modèles.
      for (const k of SYNC_KEYS) {
        try {
          if (lsGet(k) != null) continue;            // clé scopée déjà remplie
          const base = localStorage.getItem(k);
          if (base == null) continue;
          lsSet(k, base);                            // → clé scopée du compte courant
          // On GARDE la clé de base comme filet de sécurité (pas de removeItem) :
          // si le scopé est vidé par une course de synchro, la base récupère les
          // données. Purge de la base uniquement au changement de compte.
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
};

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let isApplyingRemote = false;

/** Keep a reference to the original setItem so each startCloudSync patches from the same base. */
const ORIGINAL_SET_ITEM = Storage.prototype.setItem;
// Canal Realtime de type *Broadcast* uniquement (pas de postgres_changes).
// Broadcast est un simple relais WebSocket : il ne lit jamais le WAL ni la base,
// donc aucune charge DB. Sert à notifier les autres appareils qu'un pull est
// nécessaire (le snapshot lui-même transite via un SELECT, pas via le canal).
let syncChannel: ReturnType<typeof supabase.channel> | null = null;

// Délai de regroupement des écritures avant un push cloud. Une valeur trop
// basse (ex. 1,5 s) provoque une rafale d'UPSERT du blob `user_data` (~2 Mo)
// qui sature la base free-tier (→ 522). 15 s regroupe davantage d'éditions
// successives en un seul UPSERT. Le push final au logout protège les dernières
// secondes non encore poussées.
const PUSH_DEBOUNCE_MS = 15000;

// Signature du dernier snapshot RÉELLEMENT poussé (ou tiré) au cloud. Sert à
// sauter un UPSERT quand le contenu local n'a pas changé : sans ça, chaque
// setItem (même réécriture d'une valeur identique par un re-render React)
// renvoie le blob entier ~2 Mo et sature la base free-tier. Réinitialisée à
// chaque reload : un seul push « inutile » au démarrage au pire, sans risque.
let lastSyncedSig: string | null = null;

/** Hash rapide (djb2) d'une chaîne — empreinte compacte d'un snapshot. */
const quickSig = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  // On combine longueur + hash : collisions quasi impossibles pour notre usage.
  return `${s.length}:${(h >>> 0).toString(36)}`;
};

// ─── Image processing ─────────────────────────────────────────────────────────

const IMAGE_FIELDS = new Set(['image', 'photo', 'fournisseurLogo']);
const IMAGE_ARRAY_FIELDS = new Set(['images', 'machinePhotos']);
const imgUrlCache = new Map<string, string>();

// Qualité des images stockées inline. On garde une HAUTE définition (proche de
// l'original) : on ne réduit QUE les très grandes images (> IMG_MAX_DIM) et avec
// une forte qualité, pour que la photo du modèle reste nette.
const IMG_MAX_DIM = 1600;
const IMG_QUALITY = 0.88;
// Plafond inline élevé (les images sont conservées même au-dessus : jamais
// supprimées pour cause de taille).
const IMG_MAX_INLINE_B64 = 3_000_000;
// Le bucket Storage `bera-assets` s'est révélé peu fiable (upload « réussi » mais
// URL publique inaccessible → « Aucun aperçu »). On garde donc les images
// COMPRESSÉES INLINE (data-URL auto-contenue qui s'affiche partout, sans dépendre
// du bucket). Repasser à true une fois le bucket + ses policies vérifiés.
const USE_STORAGE_BUCKET = false;

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
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (!nw || !nh) { resolve(null); return; }
        // On ne réduit QUE si l'image dépasse IMG_MAX_DIM, sinon on garde ses
        // dimensions d'origine. Haute qualité JPEG. On ne supprime JAMAIS la photo.
        const ratio = Math.min(IMG_MAX_DIM / nw, IMG_MAX_DIM / nh, 1);
        const w = Math.max(1, Math.round(nw * ratio));
        const h = Math.max(1, Math.round(nh * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        // Si l'image tient déjà telle quelle, on la garde sans recompresser.
        resolve(canvas.toDataURL('image/jpeg', IMG_QUALITY));
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

  // ── 1. Try Supabase Storage (désactivé : bucket bera-assets peu fiable) ────
  if (USE_STORAGE_BUCKET) try {
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
    const v = lsGet(k);
    if (v == null) continue;
    try {
      out[k] = JSON.parse(v);
    } catch {
      // Valeur brute non-JSON : on la conserve telle quelle.
      out[k] = v;
    }
  }
  try {
    const exp = lsGet('__bera_sqlite_export__');
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
          if (k === 'beramethode_library') {
            const localRaw = lsGet('beramethode_library');
            if (localRaw) {
              try {
                const localModels = JSON.parse(localRaw);
                const cloudModels = snapshot[k] as any[];
                if (Array.isArray(cloudModels) && Array.isArray(localModels)) {
                  // Résolution de conflit DÉTERMINISTE par horodatage (updatedAt) :
                  // quand un modèle existe des deux côtés avec un contenu différent
                  // (ex. deux appareils ont changé la photo), on garde la version la
                  // PLUS RÉCENTE. Les deux appareils convergent vers la dernière
                  // édition → plus de « ping-pong » entre les deux photos. À défaut
                  // d'horodatage, on préfère le cloud (déterministe).
                  const merged = cloudModels.map((cm: any) => {
                    if (!cm) return cm;
                    const lm = localModels.find((m: any) => m.id === cm.id);
                    if (!lm) return cm;
                    const localNewer = String(lm.updatedAt || '') > String(cm.updatedAt || '');
                    const winner = localNewer ? lm : cm;
                    const other = localNewer ? cm : lm;
                    // Si le gagnant n'a pas d'image mais l'autre oui (image pas encore
                    // re-poussée), on emprunte celle de l'autre → évite « Aucun aperçu ».
                    if (!winner.image && !winner.images && (other.image || other.images)) {
                      return { ...winner, image: other.image || null, images: other.images || null };
                    }
                    return winner;
                  });
                  // UNION : conserver les modèles LOCAUX absents du cloud, sinon un
                  // pull d'un cloud vide (ex. après un push vide accidentel) ferait
                  // DISPARAÎTRE un modèle enregistré localement / récupéré des clés
                  // de base héritées. On ne perd jamais un modèle local.
                  const cloudIds = new Set(cloudModels.map((cm: any) => cm && cm.id));
                  for (const lm of localModels) {
                    if (lm && !cloudIds.has(lm.id)) merged.push(lm);
                  }
                  // Exclure les modèles supprimés EXPLICITEMENT par l'utilisateur
                  // (tombstones) : une suppression volontaire ne doit pas être annulée
                  // par la fusion union (sinon le modèle « ressuscite »).
                  let finalModels: any[] = merged;
                  try {
                    const tsRaw = lsGet('beramethode_tombstones');
                    const ts = tsRaw ? JSON.parse(tsRaw) : [];
                    const now = Date.now();
                    const dead = new Set(
                      (Array.isArray(ts) ? ts : [])
                        .filter((t: any) => t && t.type === 'models' && (now - new Date(t.deleted_at).getTime()) < 3_600_000)
                        .map((t: any) => String(t.id)),
                    );
                    if (dead.size) finalModels = merged.filter((m: any) => m && !dead.has(String(m.id)));
                  } catch { /* ignore */ }
                  lsSet(k, JSON.stringify(finalModels));
                  continue;
                }
              } catch { /* fall through */ }
            }
          }
          // ── RÈGLE D'OR : la synchro ne SUPPRIME JAMAIS de données. ────────────
          // Pour toute liste d'éléments identifiés par `id`, on FUSIONNE (union par
          // id) au lieu de remplacer : on garde les éléments des DEUX côtés. Un
          // élément présent localement mais absent du cloud n'est jamais retiré par
          // un pull. Les suppressions ne se font que par action explicite de
          // l'utilisateur (bouton supprimer). En cas de conflit (même id), on garde
          // la version cloud (dernière poussée).
          const cloudVal = (snapshot as any)[k];
          try {
            const localRaw2 = lsGet(k);
            const localArr = localRaw2 ? JSON.parse(localRaw2) : null;
            const idOf = (x: any) => (x && typeof x === 'object' ? x.id : undefined);
            const bothArrays = Array.isArray(cloudVal) && Array.isArray(localArr);
            const haveIds = bothArrays && [...cloudVal, ...localArr].every((x: any) => idOf(x) != null);
            if (haveIds) {
              const byId = new Map<any, any>();
              for (const it of localArr) byId.set(idOf(it), it);      // base = local
              for (const it of cloudVal) byId.set(idOf(it), it);      // cloud gagne les conflits
              lsSet(k, JSON.stringify([...byId.values()]));
              continue;
            }
            // Listes sans id : au moins, ne pas écraser du non-vide par du vide.
            if (Array.isArray(cloudVal) && cloudVal.length === 0 && Array.isArray(localArr) && localArr.length > 0) {
              continue; // garde le local
            }
          } catch { /* si illisible, on applique le cloud tel quel */ }
          lsSet(k, JSON.stringify(snapshot[k]));
        } catch {}
      }
    }
    if ('__sqlite_export__' in snapshot) {
      try { lsSet('__bera_sqlite_export__', JSON.stringify(snapshot.__sqlite_export__)); } catch {}
    }
  } finally {
    isApplyingRemote = false;
  }
  window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-applied'));
};

// ─── Push ─────────────────────────────────────────────────────────────────────

/** @returns true si le snapshot est bien arrivé au cloud (ou s'il n'y avait rien à pousser). */
export const pushSnapshotToCloud = async (userId: string): Promise<boolean> => {
  if (!userId || isApplyingRemote) return false;
  let snapshot: Record<string, unknown> = { ...collectLocalSnapshot(), __schema_version: SCHEMA_VERSION };

  // Garde-fou: ne jamais écraser avec un snapshot vide
  const lib = (snapshot as any).beramethode_library;
  const plan = (snapshot as any).beramethode_planning;
  const sqlExp = (snapshot as any).__sqlite_export__;
  const allEmpty = SYNC_KEYS.every(k => {
    const v = (snapshot as any)[k];
    return v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && v.constructor === Object && !Object.keys(v).length);
  });
  if (allEmpty) {
    console.warn('[cloudSync] push annulé: snapshot local vide');
    return true; // rien d'important à pousser — une purge ne perdrait rien
  }

  // Dé-duplication : si le contenu local est identique au dernier snapshot
  // poussé/tiré, on évite de renvoyer le blob ~2 Mo (cause majeure de saturation
  // free-tier → 522). La signature est calculée sur le snapshot AVANT traitement
  // des images (représente l'état métier local). lastSyncedSig n'est mis à jour
  // qu'après un UPSERT confirmé → un échec réseau laisse le prochain push réessayer.
  const sig = quickSig(JSON.stringify(snapshot));
  if (sig === lastSyncedSig) return true;

  // Fusion anti-destruction : si une clé est VIDE localement (risque d'écraser des
  // données non vides d'un autre appareil), on lit l'état cloud et on préserve ses
  // valeurs non vides. Pour la bibliothèque : union par id (on ne perd aucun modèle
  // des deux côtés). Lecture faite UNIQUEMENT en cas de risque (limite l'egress).
  const isEmptyVal = (v: any) => v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && v.constructor === Object && !Object.keys(v).length);
  const hasEmptyKey = SYNC_KEYS.some(k => isEmptyVal((snapshot as any)[k]));
  if (hasEmptyKey) {
    try {
      const { data: existing } = await supabase.from(TABLE).select('data').eq('user_id', userId).maybeSingle();
      const cloudData: Record<string, any> = ((existing as any)?.data as any) || {};
      for (const k of SYNC_KEYS) {
        const localV = (snapshot as any)[k];
        const cloudV = cloudData[k];
        if (k === 'beramethode_library' && Array.isArray(localV) && Array.isArray(cloudV)) {
          const ids = new Set(localV.map((m: any) => m && m.id));
          const extra = cloudV.filter((m: any) => m && !ids.has(m.id));
          if (extra.length) (snapshot as any)[k] = [...localV, ...extra];
        } else if (isEmptyVal(localV) && !isEmptyVal(cloudV)) {
          (snapshot as any)[k] = cloudV; // préserve le cloud non vide
        }
      }
    } catch { /* lecture cloud impossible → on pousse le local tel quel */ }
  }

  // Replace base64 images with Storage URLs (or compressed inline data-URLs)
  try {
    snapshot = await replaceImages(snapshot) as Record<string, unknown>;
  } catch (e) {
    console.warn('[cloudSync] image processing error, pushing as-is:', e);
  }

  try {
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from(TABLE).upsert(
      { user_id: userId, data: snapshot, updated_at: nowIso },
      { onConflict: 'user_id' },
    );
    if (error) {
      console.warn('Cloud push failed:', error);
      return false;
    }
    // UPSERT confirmé : mémorise la signature pour sauter les prochains push
    // identiques (re-renders qui réécrivent la même valeur).
    lastSyncedSig = sig;
    // On vient d'écrire ce contenu : aligne `updated_at` local pour que le
    // prochain pull conditionnel de CET appareil saute le re-téléchargement.
    try { localStorage.setItem(LAST_PULLED_AT_KEY, nowIso); } catch { /* ignore */ }
    // Notifie les autres appareils (signal léger, pas de données) → ils pullent.
    if (syncChannel) {
      try { await syncChannel.send({ type: 'broadcast', event: 'updated', payload: {} }); } catch { /* hors-ligne: ignore */ }
    }
    return true;
  } catch (err) {
    console.warn('Cloud push failed:', err);
    return false;
  }
};

// ─── Pull ─────────────────────────────────────────────────────────────────────

const RELOAD_FLAG = 'beramethode_pulled_once';

export const pullSnapshotFromCloud = async (userId: string): Promise<boolean> => {
  if (!userId) return false;
  // Signale au header qu'une synchronisation est en cours (indicateur discret).
  window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-start'));
  try {
    // ── Pull conditionnel : on lit d'abord uniquement `updated_at` (~30 octets)
    // pour savoir si le snapshot distant a changé depuis notre dernier
    // téléchargement. Si identique, on NE télécharge PAS le blob ~2 Mo. C'est
    // la correction majeure de l'egress : sans ça, chaque boot/reload + chaque
    // notification Realtime re-téléchargeait 2 Mo même quand rien n'avait changé.
    const { data: meta, error: metaErr } = await supabase
      .from(TABLE)
      .select('updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (metaErr || !meta) return false;
    const remoteAt = (meta as { updated_at?: string }).updated_at || '';
    const localAt = (() => { try { return localStorage.getItem(LAST_PULLED_AT_KEY); } catch { return null; } })();
    // Rien de nouveau côté cloud → on s'arrête ici (aucun blob téléchargé).
    if (remoteAt && remoteAt === localAt) return true;

    // Le snapshot a changé : on télécharge maintenant le blob complet.
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

    // On vient de télécharger `remoteAt` : on le mémorise pour que le prochain
    // pull conditionnel saute le re-téléchargement tant que le cloud ne change pas.
    try { if (remoteAt) localStorage.setItem(LAST_PULLED_AT_KEY, remoteAt); } catch { /* ignore */ }

    // Après le pull, local == distant : on aligne la signature pour éviter un
    // push redondant du blob ~2 Mo juste après chaque synchronisation entrante.
    try {
      lastSyncedSig = quickSig(JSON.stringify({ ...collectLocalSnapshot(), __schema_version: SCHEMA_VERSION }));
    } catch { /* signature best-effort : au pire un push de plus */ }

    // Plus de window.location.reload() : les composants se ré-hydratent en
    // direct via l'événement 'beramethode:cloud-sync-applied' émis par
    // applySnapshotToLocal(). Évite la réapparition de l'écran de chargement
    // plein écran et la perte du brouillon autosave à chaque synchronisation.
    const wasEmpty = !sessionStorage.getItem(RELOAD_FLAG);
    const sigChanged = sig && sig !== lastSig;
    if (wasEmpty || sigChanged) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      if (sig) sessionStorage.setItem('beramethode_last_pull_sig', sig);
    }
    return true;
  } catch (err) {
    console.warn('Cloud pull failed:', err);
    return false;
  } finally {
    window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-end'));
  }
};

// ─── Sync ───────────────────────────────────────────────────────────────────

export const startCloudSync = (userId: string) => {
  if (!userId) return;

  // Push à chaque écriture d'une clé synchronisée, regroupé via PUSH_DEBOUNCE_MS.
  // Restore original first to prevent stacking layers of monkey-patches on repeated calls.
  Storage.prototype.setItem = ORIGINAL_SET_ITEM;
  Storage.prototype.setItem = function (key: string, value: string) {
    ORIGINAL_SET_ITEM.call(this, key, value);
    if (this === localStorage && isSyncKey(key, SYNC_KEYS) && !isApplyingRemote) {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => pushSnapshotToCloud(userId), PUSH_DEBOUNCE_MS);
    }
  };

  // Synchro inter-appareils en temps réel via Broadcast (zéro charge DB).
  // À la réception d'un signal « updated », l'appareil pull le dernier snapshot.
  // IMPORTANT: on n'utilise PAS postgres_changes (décodage WAL du blob ~2 Mo)
  // qui saturait la base free-tier jusqu'au crash.
  if (syncChannel) syncChannel.unsubscribe();
  syncChannel = supabase
    .channel(`bera_sync_${userId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'updated' }, () => {
      if (!isApplyingRemote) pullSnapshotFromCloud(userId);
    })
    .subscribe();
};

export const stopCloudSync = () => {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  if (syncChannel) { syncChannel.unsubscribe(); syncChannel = null; }
  // Restore original setItem so no further writes trigger push
  Storage.prototype.setItem = ORIGINAL_SET_ITEM;
};
