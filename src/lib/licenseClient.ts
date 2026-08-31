// ════════════════════════════════════════════════════════════════════════════
// licenseClient — جسر BERAMETHODE نحو منصة BERA MASTER.
// يستدعي Edge Function "verify-license" للتحقق من ترخيص المصنع، ويُخزّن النتيجة
// محلياً (bera_license) للعمل أوفلاين ضمن فترة سماح.
//
// ⚠️ الإنفاذ مُطفأ افتراضياً (VITE_LICENSE_ENFORCE !== 'true') لتفادي أي قفل
//    غير مقصود للبرنامج الإنتاجي. عند التفعيل يُطبَّق إخفاء الوحدات/القراءة فقط.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient';

const CACHE_KEY = 'bera_license';
/** أقصى مدة عمل أوفلاين بلا إعادة تحقق (أيام) قبل اعتبار الترخيص غير مؤكَّد. */
const OFFLINE_GRACE_DAYS = 7;

export interface LicenseState {
  ok: boolean;
  active: boolean;
  expired: boolean;
  status: string;          // active | suspended | revoked | unknown
  daysLeft: number;
  modules: string[];
  max_workers: number;
  expires_at: string | null;
  verified_at: string | null;
  source: 'server' | 'cache' | 'none';
}

export const LICENSE_ENFORCED =
  import.meta.env.VITE_LICENSE_ENFORCE === 'true';

const EMPTY: LicenseState = {
  ok: false, active: false, expired: false, status: 'none',
  daysLeft: 0, modules: [], max_workers: 0,
  expires_at: null, verified_at: null, source: 'none',
};

function readCache(): LicenseState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LicenseState;
  } catch {
    return null;
  }
}

function writeCache(state: LicenseState): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch { /* ignore quota */ }
}

function withinOfflineGrace(verifiedAt: string | null): boolean {
  if (!verifiedAt) return false;
  const ageMs = Date.now() - new Date(verifiedAt).getTime();
  return ageMs <= OFFLINE_GRACE_DAYS * 86_400_000;
}

/**
 * يتحقق من الترخيص عبر الخادم (Edge Function). يحتاج بريد المستخدم (= client_email
 * المرتبط بالمفتاح) أو رمز المفتاح مباشرة عند التفعيل اليدوي.
 */
export async function verifyLicense(opts: { email?: string; keyCode?: string }): Promise<LicenseState> {
  // إذا كان الإنفاذ مُطفأ ولا يوجد تفعيل صريح بمفتاح، نتجنّب استدعاء الـ Edge
  // Function (قد تكون غير منشورة على مشروع Supabase الحالي) → لا أخطاء 404/CORS
  // في الـ console. التفعيل اليدوي بمفتاح (keyCode) يبقى يستدعيها دائماً.
  if (!LICENSE_ENFORCED && !opts.keyCode) {
    const cached = readCache();
    if (cached && withinOfflineGrace(cached.verified_at)) return { ...cached, source: 'cache' };
    return EMPTY;
  }
  try {
    const { data, error } = await supabase.functions.invoke('verify-license', {
      body: opts.keyCode ? { key_code: opts.keyCode } : { email: opts.email },
    });
    if (error || !data?.ok) {
      // فشل التحقق الخادمي → ارجع للذاكرة ضمن فترة السماح
      const cached = readCache();
      if (cached && withinOfflineGrace(cached.verified_at)) {
        return { ...cached, source: 'cache' };
      }
      return EMPTY;
    }
    const state: LicenseState = {
      ok: true,
      active: !!data.active,
      expired: !!data.expired,
      status: data.status || 'unknown',
      daysLeft: typeof data.daysLeft === 'number' ? data.daysLeft : 0,
      modules: Array.isArray(data.modules) ? data.modules : [],
      max_workers: typeof data.max_workers === 'number' ? data.max_workers : 0,
      expires_at: data.expires_at || null,
      verified_at: data.verified_at || new Date().toISOString(),
      source: 'server',
    };
    writeCache(state);
    return state;
  } catch {
    const cached = readCache();
    if (cached && withinOfflineGrace(cached.verified_at)) {
      return { ...cached, source: 'cache' };
    }
    return EMPTY;
  }
}

/** يقرأ آخر حالة ترخيص محفوظة محلياً (بدون شبكة). */
export function getCachedLicense(): LicenseState {
  const cached = readCache();
  if (cached && withinOfflineGrace(cached.verified_at)) return { ...cached, source: 'cache' };
  return EMPTY;
}

/** مسح الترخيص المخزّن (عند تسجيل الخروج أو إعادة التفعيل). */
export function clearLicense(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

/**
 * هل وضع القراءة فقط مُفعّل؟ صحيح عندما يكون الإنفاذ مُفعّلاً والترخيص منتهياً
 * أو موقوفاً (لكن نسمح بالعرض). إذا لم يوجد ترخيص إطلاقاً والإنفاذ مطفأ → false.
 */
export function isReadOnly(state: LicenseState): boolean {
  return etatLicence(state).etat === 'grace';
}

/*
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  حالة الترخيص — نسخة مطابقة لما في السيرفر (licenseState.ts)     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 *   انتهى الاشتراك
 *        │
 *        ├─ زبون وفيّ (٦ شهور مدفوعة) ──→ ١٥ يوم مهلة: يشوف كلشي، ما يكتبش
 *        └─ زبون جديد ─────────────────→ بلا مهلة
 *        │
 *        ▼
 *    مقفول: ما بقاش كيدخل. الداتا باقة، وزر التصدير باقي خدّام.
 *
 * الواجهة كتحسب نفس الحساب باش تعرف آش توري. والسيرفر هو اللي كيفرض —
 * حساب الواجهة كيقدر يتغيّر من طرف المستخدم، ديال السيرفر لا.
 */

export type EtatLicence = 'actif' | 'grace' | 'verrouille' | 'inconnu';

export const JOURS_GRACE = 15;
export const JOURS_FIDELITE = 182; // ≈ ٦ شهور
const JOUR_MS = 24 * 60 * 60 * 1000;

export interface EvaluationLicence {
  etat: EtatLicence;
  /** الأيام الباقية قبل المرحلة الجاية (نهاية الاشتراك، ثم نهاية المهلة). */
  joursRestants: number | null;
  /** واش خاصنا نورّيو تنبيه دابا؟ */
  alerter: boolean;
}

/**
 * المهلة كتستحقّ بالوفاء. بلا هاد الشرط، يكفي تخلّص شهر باش تاخد ١٥ يوم فابور،
 * وتعاود بلا نهاية.
 *
 * وملي تكون المعلومة ناقصة → **كنعطيو المهلة**. الغلط فالعطاء كيسوّى ١٥ يوم؛
 * الغلط فالمنع كيقفل بلا سابق إنذار على زبون كيخلّص من عامين. ماشي بحال بحال.
 */
const meriteGrace = (state: LicenseState, reference: number): boolean => {
  const s = state as LicenseState & { total_paid_days?: number; first_issued_at?: string };
  if (typeof s.total_paid_days === 'number') return s.total_paid_days >= JOURS_FIDELITE;
  if (s.first_issued_at) {
    const debut = new Date(s.first_issued_at).getTime();
    if (!Number.isNaN(debut)) return (reference - debut) / JOUR_MS >= JOURS_FIDELITE;
  }
  return true;
};

/** التنبيه كيبان ١٥ يوم قبل، ومن بعد ٥، ومن بعد كل نهار فآخر ٣ أيام. */
const doitAlerter = (jours: number): boolean => jours <= 3 || jours === 5 || jours === 15;

export function etatLicence(state: LicenseState, maintenant = Date.now()): EvaluationLicence {
  const ouvert: EvaluationLicence = { etat: 'inconnu', joursRestants: null, alerter: false };

  if (!LICENSE_ENFORCED) return ouvert;
  if (!state || state.source === 'none') return ouvert;

  // موقوف ولا ملغى = قرار ديال المالك، ماشي نسيان خلاص. كيطبّق دغيا بلا مهلة.
  if (state.status === 'suspended' || state.status === 'revoked') {
    return { etat: 'verrouille', joursRestants: 0, alerter: true };
  }

  if (!state.expires_at) {
    return state.expired ? { etat: 'grace', joursRestants: null, alerter: true } : { ...ouvert, etat: 'actif' };
  }

  const fin = new Date(state.expires_at).getTime();
  if (Number.isNaN(fin)) return ouvert;

  const joursAvantFin = Math.ceil((fin - maintenant) / JOUR_MS);
  if (joursAvantFin > 0) {
    return { etat: 'actif', joursRestants: joursAvantFin, alerter: doitAlerter(joursAvantFin) };
  }

  if (!meriteGrace(state, maintenant)) {
    return { etat: 'verrouille', joursRestants: 0, alerter: true };
  }

  const joursAvantVerrou = Math.ceil((fin + JOURS_GRACE * JOUR_MS - maintenant) / JOUR_MS);
  return joursAvantVerrou > 0
    ? { etat: 'grace', joursRestants: joursAvantVerrou, alerter: true }
    : { etat: 'verrouille', joursRestants: 0, alerter: true };
}

/** البرنامج مقفول كامل (ما بقا غير التفعيل والتصدير). */
export function isLocked(state: LicenseState): boolean {
  return etatLicence(state).etat === 'verrouille';
}
