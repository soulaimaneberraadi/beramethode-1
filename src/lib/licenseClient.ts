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
  if (!LICENSE_ENFORCED) return false;
  if (state.source === 'none') return false; // لا ترخيص بعد → لا تقفل
  return state.expired || state.status === 'suspended' || state.status === 'revoked';
}
