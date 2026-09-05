import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient';
import { SCHEMA_VERSION, migrateSnapshot } from './dataVersion';
import { pkey, lsGet, lsSet, isSyncKey, getCurrentEmail } from '../../lib/storageKeys';
import {
  aPhotoEnClair,
  ecrireModelesAuMieux,
  lirePhotosElaguees,
  signalerStockagePlein,
} from '../../lib/stockageLocal';
import {
  contientDesReferences,
  deshydraterModeles,
  rehydraterModeles,
} from '../../lib/photosLocales';

/** Durée pendant laquelle une suppression reste opposable à la fusion.
 *  Doit rester alignée sur `TOMBSTONE_KEEP_MS` d'`apiShim.ts` : ces deux
 *  bornes décrivent le même fait — jusqu'à quand une suppression compte. */
const TOMBSTONE_KEEP_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Quelle clé de stockage porte quel type d'entité — donc quelles pierres
 * tombales la concernent. Doit rester alignée sur `STORES` d'`apiShim.ts` :
 * un type absent d'ici n'est protégé par aucune suppression, et ses éléments
 * effacés reviendront à la première fusion.
 */
const CLE_VERS_TYPE: Record<string, string> = {
  beramethode_library: 'models',
  beramethode_planning: 'planning',
  beramethode_suivis: 'suivi',
  beramethode_demandesAppro: 'demandes-appro',
  beramethode_subcontract_orders: 'subcontract',
  beramethode_subcontract_groups: 'subcontract/groups',
  beramethode_subcontract_profiles: 'subcontract/profiles',
};

/**
 * Retire d'une liste fusionnée ce que l'utilisateur a supprimé.
 *
 * Un élément ré-édité APRÈS sa suppression est conservé : sur un autre poste,
 * quelqu'un a pu le reprendre en main, et écraser ce travail serait pire que
 * de laisser revenir une ligne.
 */
const sansSupprimes = (lsKey: string, items: any[]): any[] => {
  const type = CLE_VERS_TYPE[lsKey];
  if (!type) return items;
  try {
    const raw = lsGet('beramethode_tombstones');
    const ts = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(ts) || ts.length === 0) return items;
    const now = Date.now();
    const supprimeLe = new Map<string, number>();
    for (const t of ts) {
      if (!t || t.type !== type) continue;
      const d = new Date(t.deleted_at).getTime();
      if (!d || now - d >= TOMBSTONE_KEEP_MS) continue;
      const id = String(t.id);
      if (!supprimeLe.has(id) || d > (supprimeLe.get(id) as number)) supprimeLe.set(id, d);
    }
    if (supprimeLe.size === 0) return items;
    return items.filter((it: any) => {
      if (!it) return false;
      const del = supprimeLe.get(String(it.id));
      if (del == null) return true;
      const edit = it.updatedAt || it.updated_at;
      if (!edit) return false;
      const e = new Date(edit).getTime();
      return Number.isFinite(e) && e > del;
    });
  } catch {
    return items;
  }
};

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
  // Profils sous-traitants (CIN, ICE, RC, photos). Les champs photo/cinRectoPhoto/
  // cinVersoPhoto sont des data-URLs : replaceImages() les compresse (ou les
  // téléverse si le bucket est activé) avant l'UPSERT, comme pour les autres clés
  // à images — pas de blob base64 brut envoyé à Supabase.
  'beramethode_subcontract_profiles',
  // Reglages du tiki (marque, logo, format). Le logo est une data-URL :
  // replaceImages() la compresse avant l'UPSERT comme les autres images.
  'beramethode_tiki_settings',
  // Frais par canal de vente (livraison, emballage, publicite) : ils entrent
  // dans le calcul du prix suggere, donc ils doivent suivre le compte.
  'beramethode_canal_frais',
];

const TABLE = 'user_data';
const STORAGE_BUCKET = 'bera-assets';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isCloudSyncUserId = (userId: unknown): userId is string =>
  typeof userId === 'string' && UUID_RE.test(userId);

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
 * Le jeton de la session, lu directement dans le stockage.
 *
 * `supabase.auth.getSession()` rend une promesse — inutilisable dans
 * `beforeunload`/`pagehide`, ou la page meurt avant qu'elle n'aboutisse. Le
 * client range pourtant la session sous une cle connue : on la lit telle
 * quelle, en une instruction.
 */
const jetonDeSession = (): string | null => {
  try {
    const brut = localStorage.getItem('beramethode_supabase_session');
    if (!brut) return null;
    const session = JSON.parse(brut);
    return typeof session?.access_token === 'string' ? session.access_token : null;
  } catch {
    return null;
  }
};

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
  // Do not delete scoped keys such as `base__userId` here. They are isolated
  // per-account backups and may contain unsynced data for another user.
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
    try {
      window.dispatchEvent(new CustomEvent('bera_user_changed', { detail: { userId } }));
    } catch {}

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
let beforeUnloadHandler: (() => void) | null = null;
let visibiliteHandler: (() => void) | null = null;
/** Filet de securite quand le canal Realtime ne passe pas (voir POLL_PULL_MS). */
let pollPullTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Intervalle du pull de secours, appareil au premier plan uniquement.
 *
 * Le temps reel repose sur un canal WebSocket : pare-feu d'atelier, reseau
 * mobile capricieux ou Realtime indisponible sur le projet, et le signal
 * « quelqu'un a modifie » n'arrive jamais — deux telephones ouverts cote a cote
 * ne se voyaient plus jusqu'a ce qu'on bascule hors de l'application et qu'on y
 * revienne. Ce rappel ne coute qu'un SELECT d'une colonne : le blob n'est
 * telecharge que si `updated_at` a change.
 */
const POLL_PULL_MS = 60000;

// Délai de regroupement des écritures avant un push cloud. Une valeur trop
// basse (ex. 1,5 s) provoque une rafale d'UPSERT du blob `user_data` (~2 Mo)
// qui sature la base free-tier (→ 522). 15 s regroupe davantage d'éditions
// successives en un seul UPSERT. Le push final au logout protège les dernières
// secondes non encore poussées.
const PUSH_DEBOUNCE_MS = 5000;

/**
 * Au-dela de cette attente, on pousse meme si les ecritures continuent.
 *
 * Le regroupement repartait a zero a CHAQUE ecriture. Un composant qui ecrit
 * plus souvent que le delai de regroupement repoussait donc l'envoi sans fin :
 * la sauvegarde automatique de l'espace de travail, qui tournait toutes les
 * deux secondes, suffisait a ce que RIEN ne parte jamais au cloud. Le
 * telephone enregistrait ses modeles et personne d'autre ne les voyait.
 *
 * Le defaut de la sauvegarde est corrige, mais le regroupement ne doit plus
 * jamais pouvoir etre affame : passe ce delai depuis la premiere ecriture en
 * attente, l'envoi part, quitte a en refaire un plus tard.
 */
const PUSH_ATTENTE_MAX_MS = 20000;

/** Horodatage de la premiere ecriture non encore poussee (0 = rien en attente). */
let attenteDepuis = 0;

/** Plafond du corps d'un `fetch(..., { keepalive: true })` : 64 Kio dans la
 *  spécification. On garde une marge sous la borne — la longueur en caractères
 *  d'un JSON quasi-ASCII approche sa taille en octets sans l'égaler. */
const KEEPALIVE_MAX_OCTETS = 60_000;

// Signature du dernier snapshot RÉELLEMENT poussé (ou tiré) au cloud. Sert à
// sauter un UPSERT quand le contenu local n'a pas changé : sans ça, chaque
// setItem (même réécriture d'une valeur identique par un re-render React)
// renvoie le blob entier ~2 Mo et sature la base free-tier. Réinitialisée à
// chaque reload : un seul push « inutile » au démarrage au pire, sans risque.
let lastSyncedSig: string | null = null;

/**
 * Un instantané dont toutes les clés sont vides n'a rien à sauvegarder — et
 * l'envoyer EFFACERAIT le cloud, donc les données de tous les autres appareils.
 * Le cas n'est pas théorique : Safari purge le stockage d'un site resté 7 jours
 * sans visite, et le téléphone se réveille alors avec un stockage vierge.
 */
const instantaneVide = (snapshot: Record<string, unknown>): boolean =>
  SYNC_KEYS.every(k => {
    const v = (snapshot as any)[k];
    return v == null
      || (Array.isArray(v) && v.length === 0)
      || (typeof v === 'object' && v.constructor === Object && !Object.keys(v).length);
  });

/** Hash rapide (djb2) d'une chaîne — empreinte compacte d'un snapshot. */
const quickSig = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  // On combine longueur + hash : collisions quasi impossibles pour notre usage.
  return `${s.length}:${(h >>> 0).toString(36)}`;
};

/**
 * Empreinte, cle par cle, de ce que le CLOUD detient — le point de comparaison
 * qui distingue « cette cle n'a pas bouge ici » de « je l'ai modifiee et mon
 * envoi n'est pas encore parti ».
 *
 * POURQUOI : la fusion d'un pull remplace sans condition les valeurs qui ne
 * sont pas des listes (les reglages, la fiche entreprise, la barre de
 * navigation). Un reglage tout juste enregistre — un horaire du vendredi, par
 * exemple — etait donc efface par le premier pull qui arrivait avant que
 * l'envoi groupe (5 s) ne soit parti. L'utilisateur voyait son reglage revenir
 * a l'ancienne valeur tout seul.
 */
const REPERES_KEY = 'beramethode_sync_reperes';

const lireReperes = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(REPERES_KEY);
    const o = raw ? JSON.parse(raw) : null;
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
};

const ecrireReperes = (r: Record<string, string>): void => {
  try { localStorage.setItem(REPERES_KEY, JSON.stringify(r)); } catch { /* place manquante : on repart sans repere */ }
};

/** Empreinte d'une valeur de cle (identique des deux cotes pour une meme valeur). */
const sigValeur = (v: unknown): string => {
  try { return quickSig(JSON.stringify(v ?? null)); } catch { return ''; }
};

/** Empreinte de la valeur LOCALE d'une cle. */
const sigLocal = (k: string): string => {
  try {
    const raw = lsGet(k);
    return raw == null ? '' : quickSig(JSON.stringify(JSON.parse(raw)));
  } catch { return ''; }
};

/**
 * La cle porte-t-elle une modification locale que le cloud n'a pas encore recue ?
 * Sans repere connu on repond NON : au premier demarrage, le cloud fait foi.
 */
const modifieeLocalement = (k: string): boolean => {
  const repere = lireReperes()[k];
  if (!repere) return false;
  return sigLocal(k) !== repere;
};

/** Aligne les reperes sur l'etat local courant (apres un envoi confirme, ou une fusion). */
const majReperes = (cles: readonly string[]): void => {
  const r = lireReperes();
  for (const k of cles) r[k] = sigLocal(k);
  ecrireReperes(r);
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
// Plafond inline raisonnable: si la compression échoue, une image déjà sous ce
// seuil reste inline au lieu d'être supprimée.
const IMG_MAX_INLINE_B64 = 3_000_000;
// Storage est opt-in: le bucket `bera-assets` peut être absent ou privé, et
// getPublicUrl renvoie alors des URLs cassées. Par défaut on garde les images en
// data-URL compressée inline (fiable, s'affiche toujours). Activer uniquement
// après création du bucket public + policies OK:
// VITE_BERA_USE_STORAGE_BUCKET=true
const USE_STORAGE_BUCKET = import.meta.env.VITE_BERA_USE_STORAGE_BUCKET === 'true';

/**
 * Compress a base64 image using Canvas.
 * Returns a compressed JPEG data-URL, or null if compression fails.
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
 * 3. If compression fails → keep reasonable-size original data-URL inline
 * 4. Only strip when the original is too large and cannot be compressed
 */
const processImage = async (dataUrl: string, userId: string): Promise<string | null> => {
  if (!dataUrl.startsWith('data:')) return dataUrl; // already a URL

  // ── 1. Try Supabase Storage only when explicitly enabled ────
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
        filename = `${userId}/${hex}.${ext}`;
      } catch {
        filename = `${userId}/${b64data.length}_${b64data.slice(0, 16).replace(/\W/g, '')}.${ext}`;
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
  if (compressed) return compressed.length <= dataUrl.length ? compressed : dataUrl;

  // Compression can fail on malformed or browser-unsupported images. Keep
  // reasonable-size inline data instead of losing the photo just because
  // Storage is unavailable.
  if (dataUrl.length <= IMG_MAX_INLINE_B64) return dataUrl;

  console.warn('[cloudSync] image skipped: inline data-url exceeds fallback limit and compression failed');
  return null;
};

/**
 * Walk snapshot tree and replace base64 image fields:
 * - with a Storage URL if upload succeeds
 * - with a compressed data-URL if upload fails but compression fits
 * - reasonable-size original data-URL if compression fails
 * - field is omitted only if inline data is too large and cannot be compressed
 */
const replaceImages = async (o: any, userId: string): Promise<any> => {
  if (!o || typeof o !== 'object') return o;
  if (Array.isArray(o)) return Promise.all(o.map(item => replaceImages(item, userId)));

  const out: any = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    // Process ANY base64 data-URL regardless of field name.
    // This handles: `image`, `photo`, `fournisseurLogo`, AND nested fields
    // inside the `images` object like `front` / `back` that are NOT in
    // IMAGE_FIELDS. Without this, those data-URLs stay inline, bloating the
    // snapshot to >2 MB and causing UPSERT timeout (522) on free tier.
    if (typeof v === 'string' && v.startsWith('data:')) {
      const result = await processImage(v, userId);
      out[k] = result || v;
    } else if (IMAGE_FIELDS.has(k)) {
      if (v) out[k] = v;
    } else if (IMAGE_ARRAY_FIELDS.has(k) && Array.isArray(v)) {
      const results = await Promise.all(v.map(async (item: any) => {
        if (typeof item === 'string' && item.startsWith('data:')) return (await processImage(item, userId)) || item;
        return item;
      }));
      const valid = results.filter(Boolean);
      if (valid.length) out[k] = valid;
    } else if (v && typeof v === 'object') {
      out[k] = await replaceImages(v, userId);
    } else {
      out[k] = v;
    }
  }
  return out;
};

// ─── Local snapshot ───────────────────────────────────────────────────────────

const modelPreview = (m: any): string | null =>
  (typeof m?.images?.front === 'string' && m.images.front) ||
  (typeof m?.image === 'string' && m.image) ||
  (typeof m?.meta_data?.photo_url === 'string' && m.meta_data.photo_url) ||
  (typeof m?.images?.back === 'string' && m.images.back) ||
  null;

const withPreservedPreview = (winner: any, other: any): any => {
  if (modelPreview(winner) || !modelPreview(other)) return winner;
  return {
    ...winner,
    image: winner?.image || other?.image || other?.images?.front || other?.meta_data?.photo_url || null,
    images: {
      front: winner?.images?.front || other?.images?.front || other?.image || other?.meta_data?.photo_url || null,
      back: winner?.images?.back || other?.images?.back || null,
    },
    meta_data: {
      ...(winner?.meta_data || {}),
      photo_url: winner?.meta_data?.photo_url || other?.meta_data?.photo_url,
    },
  };
};

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

/**
 * Écrit l'instantané du cloud dans le stockage local.
 *
 * Les photos qu'il transporte ne vont PAS dans `localStorage` : elles sont
 * rangées dans IndexedDB, et la bibliothèque n'en garde qu'une référence.
 * C'est ce qui permet à un téléphone de recevoir quarante modèles illustrés
 * sans jamais approcher son plafond de 5 Mo.
 *
 * @returns false si AU MOINS une clé n'a pas pu être écrite localement.
 */
const applySnapshotToLocal = async (snapshot: Record<string, unknown> | null): Promise<boolean> => {
  let toutApplique = true;
  if (!snapshot) return true;

  // Déshydratation AVANT d'entrer dans la boucle d'écriture : celle-ci est
  // synchrone, et c'est très bien ainsi — le drapeau `isApplyingRemote` ne doit
  // pas rester levé pendant une attente, sinon un push concurrent serait rejeté.
  if (Array.isArray((snapshot as any).beramethode_library)) {
    try {
      snapshot = {
        ...snapshot,
        beramethode_library: await deshydraterModeles((snapshot as any).beramethode_library),
      };
    } catch { /* magasin indisponible : on écrira les photos en clair, comme avant */ }
  }

  isApplyingRemote = true;
  try {
    for (const k of SYNC_KEYS) {
      if (k in snapshot) {
        try {
          if (k === 'beramethode_library') {
            const localRaw = lsGet('beramethode_library');
            if (localRaw) {
              let modelesFusionnes: any[] | null = null;
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
                    return withPreservedPreview(winner, other);
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
                    // id → date de suppression la plus récente (dans la fenêtre 1h).
                    const deletedAt = new Map<string, number>();
                    for (const t of (Array.isArray(ts) ? ts : [])) {
                      if (!t || t.type !== 'models') continue;
                      const d = new Date(t.deleted_at).getTime();
                      // Une suppression ne se périme pas au bout d'une heure.
                      // Avec l'ancienne borne, passé ce délai la fusion union
                      // réinstallait la copie restée dans le cloud : c'est
                      // ainsi que 33 modèles supprimés sont revenus d'un coup.
                      if (!d || now - d >= TOMBSTONE_KEEP_MS) continue;
                      const id = String(t.id);
                      if (!deletedAt.has(id) || d > (deletedAt.get(id) as number)) deletedAt.set(id, d);
                    }
                    if (deletedAt.size) {
                      finalModels = merged.filter((m: any) => {
                        if (!m) return false;
                        const del = deletedAt.get(String(m.id));
                        if (del == null) return true;        // pas supprimé
                        if (!m.updatedAt) return true;       // pas d'horodatage → on GARDE (sécurité données)
                        const edited = new Date(m.updatedAt).getTime();
                        return edited > del;                 // gardé si ré-édité APRÈS la suppression
                      });
                    }
                  } catch { /* ignore */ }
                  modelesFusionnes = finalModels;
                }
              } catch { /* liste illisible : on retombe sur la fusion générique */ }
              if (modelesFusionnes) {
                // Écriture VOLONTAIREMENT hors du `try` ci-dessus : si elle
                // échoue (stockage plein), il ne faut PAS retomber sur la
                // branche générique. Celle-ci finirait par écrire la seule
                // liste du cloud — plus courte, donc susceptible de passer — et
                // les modèles qui n'existent que sur cet appareil seraient
                // perdus.
                // Si le téléphone n'a plus la place pour les photos, la
                // bibliothèque est enregistrée SANS elles plutôt que pas du
                // tout : c'est la différence entre un écran « Aucun modèle
                // trouvé » et un modèle qu'on peut ouvrir, avec sa gamme et ses
                // prix, en attendant que sa vignette revienne. Les identifiants
                // élagués sont notés — le push leur rendra leur photo depuis le
                // cloud au lieu de l'effacer chez les autres.
                if (ecrireModelesAuMieux(k, modelesFusionnes) === 'echec') toutApplique = false;
                continue;
              }
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
          /* Valeur qui n'est pas une liste (reglages, entreprise, navigation) :
             la suite la remplace telle quelle par celle du cloud. On ne le fait
             PAS quand cette cle porte ici une modification pas encore envoyee,
             sinon le pull annule ce que l'utilisateur vient d'enregistrer. */
          if (!Array.isArray(cloudVal) && modifieeLocalement(k)) continue;
          let fusionGenerique: any[] | null = null;
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
              // L'union garde tout des deux côtés — y compris ce que
              // l'utilisateur avait supprimé, tant que la copie du cloud n'a
              // pas été purgée. Les pierres tombales sont la seule chose qui
              // distingue « jamais reçu » de « volontairement supprimé ».
              fusionGenerique = sansSupprimes(k, [...byId.values()]);
            }
            // Listes sans id : au moins, ne pas écraser du non-vide par du vide.
            if (!fusionGenerique && Array.isArray(cloudVal) && cloudVal.length === 0 && Array.isArray(localArr) && localArr.length > 0) {
              continue; // garde le local
            }
          } catch { /* si illisible, on applique le cloud tel quel */ }
          // Hors du `try` : un refus d'écriture (stockage plein) ne doit pas
          // faire retomber la fusion sur la valeur du cloud seule, qui effacerait
          // ce que cet appareil est seul à connaître.
          const aEcrire = fusionGenerique ?? (snapshot as any)[k];
          // La bibliothèque passe TOUJOURS par l'écriture « au mieux », y compris
          // ici : un téléphone qui n'en a encore aucune copie ne rencontre pas la
          // branche de fusion plus haut, et c'est justement le cas où tout se
          // joue — la première réception de modèles volumineux. Sans ce passage,
          // l'appareil restait avec « Aucun modèle trouvé ».
          if (k === 'beramethode_library' && Array.isArray(aEcrire)) {
            if (ecrireModelesAuMieux(k, aEcrire) === 'echec') toutApplique = false;
            continue;
          }
          lsSet(k, JSON.stringify(aEcrire));
        } catch (e) {
          toutApplique = false;
          signalerStockagePlein(k, e);
        }
      }
    }
    if ('__sqlite_export__' in snapshot) {
      try {
        lsSet('__bera_sqlite_export__', JSON.stringify(snapshot.__sqlite_export__));
      } catch (e) {
        toutApplique = false;
        signalerStockagePlein('__bera_sqlite_export__', e);
      }
    }
    majReperes(SYNC_KEYS);
  } finally {
    isApplyingRemote = false;
  }
  window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-applied'));
  return toutApplique;
};

// ─── Push ─────────────────────────────────────────────────────────────────────

/** @returns true si le snapshot est bien arrivé au cloud (ou s'il n'y avait rien à pousser). */
export const pushSnapshotToCloud = async (userId: string): Promise<boolean> => {
  if (!isCloudSyncUserId(userId) || isApplyingRemote) return false;

  /* ── D'ABORD RECUPERER, ENSUITE ENVOYER ──────────────────────────────────
   * L'UPSERT remplace la ligne entiere : envoyer sans avoir fusionne l'etat du
   * cloud EFFACE ce qu'un autre appareil vient d'y mettre. Deux telephones sur
   * le meme compte se comportaient ainsi : celui qui revenait en dernier
   * ecrasait le travail de l'autre, puis notait l'horodatage de SON envoi comme
   * « derniere version connue » — son pull suivant se croyait a jour et sautait
   * le telechargement. Rien ne passait plus d'un telephone a l'autre.
   *
   * Un SELECT d'une seule colonne suffit a savoir si le cloud a bouge depuis
   * notre dernier pull ; on ne telecharge le blob que dans ce cas. La fusion du
   * pull est une union : elle ne perd aucune donnee locale. */
  try {
    const { data: meta } = await supabase
      .from(TABLE)
      .select('updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    const remoteAt = (meta as { updated_at?: string } | null)?.updated_at || '';
    const localAt = (() => { try { return localStorage.getItem(LAST_PULLED_AT_KEY); } catch { return null; } })();
    if (remoteAt && remoteAt !== localAt) {
      await pullSnapshotFromCloud(userId).catch(() => false);
    }
  } catch { /* cloud illisible : on tente l'envoi, c'est mieux que de perdre le travail local */ }

  let snapshot: Record<string, unknown> = { ...collectLocalSnapshot(), __schema_version: SCHEMA_VERSION };

  // Les photos vivent dans IndexedDB ; la bibliothèque locale n'en garde qu'une
  // référence. Le cloud, lui, doit recevoir les images EN CLAIR : un autre
  // appareil ne saurait pas quoi faire d'une référence pointant vers un magasin
  // qui n'est pas le sien. On les rend donc ici, avant tout le reste — ainsi
  // tout ce qui suit (garde anti-vide, signature, fusion, compression) voit
  // exactement ce qu'il voyait avant que les photos déménagent.
  if (Array.isArray((snapshot as any).beramethode_library)) {
    try {
      snapshot.beramethode_library = await rehydraterModeles((snapshot as any).beramethode_library);
    } catch { /* magasin illisible : on pousse ce qu'on a */ }
  }

  // Garde-fou: ne jamais écraser avec un snapshot vide
  if (instantaneVide(snapshot)) {
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
  // Photos écartées faute de place : cet appareil détient une bibliothèque
  // amputée. L'envoyer telle quelle effacerait les photos de tout le monde.
  const photosElaguees = lirePhotosElaguees();
  if (hasEmptyKey || photosElaguees.size) {
    let cloudData: Record<string, any> | null = null;
    try {
      const { data: existing } = await supabase.from(TABLE).select('data').eq('user_id', userId).maybeSingle();
      cloudData = ((existing as any)?.data as any) || {};
    } catch { cloudData = null; }
    if (!cloudData && photosElaguees.size) {
      // Impossible de relire le cloud alors qu'on sait notre copie incomplète :
      // on renonce à l'envoi. Reporter vaut mieux qu'effacer des photos qu'on
      // n'a pas les moyens de rendre.
      console.warn('[cloudSync] push reporté: bibliothèque locale amputée et cloud illisible');
      return false;
    }
    if (cloudData) {
      for (const k of SYNC_KEYS) {
        const localV = (snapshot as any)[k];
        const cloudV = cloudData[k];
        if (k === 'beramethode_library' && Array.isArray(localV) && Array.isArray(cloudV)) {
          const parIdCloud = new Map<string, any>();
          for (const cm of cloudV) if (cm) parIdCloud.set(String(cm.id), cm);
          // 1. Rendre sa photo à chaque modèle élagué qui n'en a plus.
          const rendus = localV.map((lm: any) => {
            if (!lm || !photosElaguees.has(String(lm.id)) || aPhotoEnClair(lm)) return lm;
            const cm = parIdCloud.get(String(lm.id));
            return cm ? withPreservedPreview(lm, cm) : lm;
          });
          // 2. Conserver les modèles que le cloud est seul à connaître.
          const ids = new Set(rendus.map((m: any) => m && String(m.id)));
          const extra = cloudV.filter((m: any) => m && !ids.has(String(m.id)));
          (snapshot as any)[k] = extra.length ? [...rendus, ...extra] : rendus;
        } else if (isEmptyVal(localV) && !isEmptyVal(cloudV)) {
          (snapshot as any)[k] = cloudV; // préserve le cloud non vide
        }
      }
    }
  }

  // Replace base64 images with Storage URLs (or compressed inline data-URLs)
  try {
    snapshot = await replaceImages(snapshot, userId) as Record<string, unknown>;
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
    // Le cloud detient desormais l'etat local : les reperes le disent, cle par cle.
    majReperes(SYNC_KEYS);
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

/**
 * Récupère l'instantané du compte et le fusionne dans le stockage local.
 *
 * `force` saute le pull conditionnel (comparaison d'`updated_at`) : c'est ce
 * que demande le bouton de synchronisation du bandeau. Sans lui, un appareil
 * qui croit déjà tenir la dernière version ne retéléchargeait RIEN, et le
 * bouton affichait « synchronisé » sans avoir rien fait.
 */
export const pullSnapshotFromCloud = async (
  userId: string,
  options?: { force?: boolean },
): Promise<boolean> => {
  if (!isCloudSyncUserId(userId)) return false;
  window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-start'));
  try {
    const { data: meta, error: metaErr } = await supabase
      .from(TABLE)
      .select('updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (metaErr || !meta) { window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-end')); return false; }
    const remoteAt = (meta as { updated_at?: string }).updated_at || '';
    const localAt = (() => { try { return localStorage.getItem(LAST_PULLED_AT_KEY); } catch { return null; } })();
    if (!options?.force && remoteAt && remoteAt === localAt) { window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-end')); return true; }

    const { data, error } = await supabase
      .from(TABLE)
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data?.data) { window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-end')); return false; }
    let snap = data.data as Record<string, unknown>;
    const v = typeof snap.__schema_version === 'number' ? (snap.__schema_version as number) : 0;
    if (v < SCHEMA_VERSION) snap = migrateSnapshot(snap, v);

    const toutApplique = await applySnapshotToLocal(snap);

    // On ne retient `updated_at` QUE si TOUT a été écrit. Retenir une version
    // qu'on n'a pas su enregistrer (stockage du téléphone plein) rendait
    // l'écart DÉFINITIF : le pull conditionnel sautait ensuite le
    // téléchargement en croyant l'appareil à jour, et l'écran restait sur 1
    // modèle pendant que le poste fixe en affichait 4. En cas d'échec on efface
    // le repère : le prochain démarrage retentera la fusion.
    try {
      if (toutApplique && remoteAt) localStorage.setItem(LAST_PULLED_AT_KEY, remoteAt);
      else if (!toutApplique) localStorage.removeItem(LAST_PULLED_AT_KEY);
    } catch { /* ignore */ }

    /* La signature sert a sauter un envoi dont le contenu est DEJA dans le
     * cloud. Apres une fusion, l'etat local n'est plus celui du cloud : il
     * contient en plus ce que cet appareil n'a pas encore envoye. Y inscrire la
     * signature du local faisait sauter l'envoi suivant — le travail local
     * restait sur l'appareil, invisible pour les autres. On efface : le prochain
     * envoi partira, et il portera l'etat fusionne. */
    lastSyncedSig = null;

    const wasEmpty = !sessionStorage.getItem(RELOAD_FLAG);
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
    const sigChanged = sig && sig !== lastSig;
    if (wasEmpty || sigChanged) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      if (sig) sessionStorage.setItem('beramethode_last_pull_sig', sig);
    }

    window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-end'));
    return true;
  } catch (err) {
    console.warn('Cloud pull failed:', err);
    window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-end', { detail: { error: String(err) } }));
    return false;
  }
};

// ─── Sync ───────────────────────────────────────────────────────────────────

/** Retire les écouteurs de fin de session posés par `startCloudSync`. */
const detacherEcouteurs = () => {
  if (beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    window.removeEventListener('pagehide', beforeUnloadHandler);
    beforeUnloadHandler = null;
  }
  if (visibiliteHandler) {
    document.removeEventListener('visibilitychange', visibiliteHandler);
    visibiliteHandler = null;
  }
};

export const startCloudSync = (userId: string) => {
  if (!isCloudSyncUserId(userId)) return;

  // Détacher les écouteurs d'un démarrage précédent. `startCloudSync` est
  // rappelé à chaque changement d'état d'authentification : sans ce retrait,
  // les gestionnaires s'empilaient et le même instantané partait plusieurs
  // fois par retour d'application.
  detacherEcouteurs();

  // Push à chaque écriture d'une clé synchronisée, regroupé via PUSH_DEBOUNCE_MS.
  // Restore original first to prevent stacking layers of monkey-patches on repeated calls.
  Storage.prototype.setItem = ORIGINAL_SET_ITEM;
  Storage.prototype.setItem = function (key: string, value: string) {
    ORIGINAL_SET_ITEM.call(this, key, value);
    if (this === localStorage && isSyncKey(key, SYNC_KEYS) && !isApplyingRemote) {
      const maintenant = Date.now();
      if (!attenteDepuis) attenteDepuis = maintenant;
      if (syncTimer) clearTimeout(syncTimer);
      // Le regroupement repousse l'envoi, mais jamais au-dela de
      // `PUSH_ATTENTE_MAX_MS` apres la premiere ecriture en attente.
      const delai = Math.max(0, Math.min(PUSH_DEBOUNCE_MS, attenteDepuis + PUSH_ATTENTE_MAX_MS - maintenant));
      syncTimer = setTimeout(() => { attenteDepuis = 0; void pushSnapshotToCloud(userId); }, delai);
    }
  };

  /** Envoie tout de suite ce qui attendait encore la fin du regroupement. */
  const viderLaFileDAttente = () => {
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    attenteDepuis = 0;
    void pushSnapshotToCloud(userId).catch(() => false);
  };

  /* Ce qui attend encore la fin du regroupement part AVANT le pull : sinon un
     reglage tout juste enregistre se ferait doubler par la version du cloud. */
  const recupererApresAvoirEnvoye = async () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
      attenteDepuis = 0;
      await pushSnapshotToCloud(userId).catch(() => false);
    }
    await pullSnapshotFromCloud(userId).catch(() => false);
  };

  // ── Le téléphone ne prévient pas qu'il s'en va ─────────────────────────────
  // `beforeunload` ne se déclenche PAS sur mobile : quand on bascule vers une
  // autre application, la page est gelée puis jetée sans un mot. Tout ce qui
  // attendait la fin du regroupement (5 s) partait donc à la poubelle — c'est
  // le « je ferme le téléphone, je reviens, et le modèle n'est plus là ».
  // `visibilitychange → hidden` est le seul signal fiable des deux côtés, et la
  // page y est encore vivante : le temps d'un envoi.
  visibiliteHandler = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') { viderLaFileDAttente(); return; }
    // Retour dans l'application : on rattrape ce qui n'a pas pu partir (réseau
    // coupé, page gelée trop tôt), PUIS on récupère le travail des autres
    // appareils. Dans cet ordre : le rattrapage local ne doit pas être noyé par
    // la fusion du pull. Les deux appels savent ne rien faire s'il n'y a rien de
    // neuf (signature identique, `updated_at` identique) — aucun trafic inutile.
    void (async () => {
      // Dans CET ordre : la fusion du pull est une union (rien de local ne se
      // perd), et l'envoi qui suit part d'un etat qui contient deja le travail
      // des autres appareils. L'ordre inverse envoyait l'etat local par-dessus
      // le leur, puis sautait le pull en se croyant a jour.
      await recupererApresAvoirEnvoye();
      await pushSnapshotToCloud(userId).catch(() => false);
    })();
  };
  document.addEventListener('visibilitychange', visibiliteHandler);

  // Fermeture réelle de l'onglet (poste fixe surtout). `keepalive` laisse la
  // requête survivre à la page, mais la spécification la plafonne à 64 Kio :
  // au-delà elle est REJETÉE sans erreur visible — un instantané complet (~2 Mo)
  // ne partait donc jamais par ce chemin, qui donnait pourtant l'illusion d'un
  // filet de sécurité. On ne s'en sert que pour les petits comptes ; pour les
  // autres, le vidage à `hidden` ci-dessus a déjà fait le travail.
  // `pagehide` et `beforeunload` se suivent sur poste fixe : sans ce garde-fou,
  // la même fermeture enverrait l'instantané deux fois.
  let dernierEnvoiCloture = 0;
  beforeUnloadHandler = () => {
    const maintenant = Date.now();
    if (maintenant - dernierEnvoiCloture < 2000) return;
    dernierEnvoiCloture = maintenant;
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    const snapshot = { ...collectLocalSnapshot(), __schema_version: SCHEMA_VERSION };
    // Ce chemin est synchrone : impossible d'aller rechercher les photos dans
    // IndexedDB. Envoyer la bibliothèque telle quelle enverrait des RÉFÉRENCES,
    // que les autres appareils ne sauraient pas résoudre — et qui effaceraient
    // les vraies images. On s'abstient : le vidage à `hidden`, lui, a tout le
    // temps de réhydrater, et c'est désormais le chemin principal.
    if (contientDesReferences((snapshot as any).beramethode_library)) return;
    // Même garde que le push normal : ne JAMAIS envoyer un instantané vide.
    // Sans elle, un téléphone dont Safari a purgé le stockage effaçait le cloud
    // en se fermant, et emportait les données de tous les autres appareils.
    if (instantaneVide(snapshot)) return;
    const corps = JSON.stringify({ user_id: userId, data: snapshot, updated_at: new Date().toISOString() });
    if (corps.length > KEEPALIVE_MAX_OCTETS) { viderLaFileDAttente(); return; }
    // SANS le jeton, cet envoi est REFUSE — et il l'etait en silence.
    //
    // La table n'accepte d'ecriture que du proprietaire de la ligne
    // (`auth.uid() = user_id`). Une requete qui ne porte que la cle publique
    // n'est le proprietaire de rien : le serveur la rejette. Personne ne le
    // voyait — ni `catch`, ni lecture du code de reponse — et l'envoi de
    // derniere chance, celui qui devait sauver le travail au moment de fermer,
    // ne sauvait rien depuis toujours. C'est exactement le « je ferme, je
    // rouvre sur l'autre telephone, et mon travail n'y est pas ».
    const jeton = jetonDeSession();
    if (!jeton) { viderLaFileDAttente(); return; }
    try {
      fetch(`${SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${jeton}`,
          Prefer: 'resolution=merge-duplicates',
        },
        body: corps,
        keepalive: true,
      }).catch(() => { /* la page se ferme : plus personne pour lire l'erreur */ });
    } catch {}
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);
  // `pagehide` est la contrepartie mobile de `beforeunload` : sur iOS c'est le
  // dernier événement reçu avant la mise au rebut de la page.
  window.addEventListener('pagehide', beforeUnloadHandler);

  // Pull de secours quand le canal temps réel ne passe pas (cf. POLL_PULL_MS).
  if (pollPullTimer) { clearInterval(pollPullTimer); pollPullTimer = null; }
  pollPullTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (isApplyingRemote) return;
    void recupererApresAvoirEnvoye();
  }, POLL_PULL_MS);

  // Synchro inter-appareils en temps réel via Broadcast (zéro charge DB).
  // À la réception d'un signal « updated », l'appareil pull le dernier snapshot.
  // IMPORTANT: on n'utilise PAS postgres_changes (décodage WAL du blob ~2 Mo)
  // qui saturait la base free-tier jusqu'au crash.
  if (syncChannel) syncChannel.unsubscribe();
  syncChannel = supabase
    .channel(`bera_sync_${userId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'updated' }, () => {
      if (!isApplyingRemote) void recupererApresAvoirEnvoye();
    })
    .subscribe();
};

export const stopCloudSync = () => {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  if (pollPullTimer) { clearInterval(pollPullTimer); pollPullTimer = null; }
  attenteDepuis = 0;
  if (syncChannel) { syncChannel.unsubscribe(); syncChannel = null; }
  detacherEcouteurs();
  // Restore original setItem so no further writes trigger push
  Storage.prototype.setItem = ORIGINAL_SET_ITEM;
};
