// ════════════════════════════════════════════════════════════════════════════
// masterRegistration — جسر التسجيل نحو BERA MASTER.
// عند إنشاء حساب جديد في BERAMETHODE، ندفع بيانات الزبون (اسم الشركة، البريد،
// نوع الحساب) إلى منصّة BERA MASTER كـ tenant بحالة "pending" (بلا مفتاح بعد).
// يظهر عندها المالك في قسم Users → يُصدر له مفتاح الترخيص.
//
// مشروع Supabase: جداول BERA MASTER (tenants, licenses, plans…) صارت على نفس
// مشروع BERAMETHODE (الجسر utrojjhscyatppgcszrt). المشروع الأصلي
// jiscgwioxwsulaopsivc لم يعد موجوداً (النطاق لا يُحَلّ منذ أكتوبر 2026)، وكان
// كل تسجيل يفشل بصمت. ننادي Edge Function "register-tenant" عبر fetch، ويمكن
// توجيهها لمشروع آخر بـ VITE_MASTER_SUPABASE_URL / VITE_MASTER_SUPABASE_ANON_KEY.
//
// العملية best-effort: أي فشل لا يمنع إتمام التسجيل.
// ════════════════════════════════════════════════════════════════════════════

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient';

const MASTER_URL =
  (import.meta.env.VITE_MASTER_SUPABASE_URL as string) || SUPABASE_URL;

const MASTER_ANON =
  (import.meta.env.VITE_MASTER_SUPABASE_ANON_KEY as string) || SUPABASE_ANON_KEY;

export interface MasterRegistrationInput {
  /** اسم الشركة / الزبون / المستقل (= tenants.name) */
  company: string;
  /** بريد المدير (= tenants.contact_email، ومفتاح الربط مع الترخيص) */
  email: string;
  /** نوع الحساب في BERAMETHODE: societe | client | personnel */
  accountType?: string;
  /** الموقع/الجهة (اختياري) */
  location?: string;
  /** السجل التجاري (اختياري، فريد في BERA MASTER) */
  commercialReg?: string;
  /** اسم المدير (اختياري، للتدقيق) */
  adminName?: string;
}

export interface MasterRegistrationResult {
  ok: boolean;
  tenantId?: string;
  status?: string;
  /** true إذا كان الزبون موجوداً مسبقاً (نفس البريد) */
  existed?: boolean;
  message?: string;
}

/**
 * يدفع تسجيلاً جديداً إلى BERA MASTER. لا يرمي استثناءً أبداً — يرجّع { ok:false }
 * عند الفشل حتى لا يعطّل مسار التسجيل في BERAMETHODE.
 */
export async function registerTenantInMaster(
  input: MasterRegistrationInput,
): Promise<MasterRegistrationResult> {
  const company = (input.company || '').trim();
  const email = (input.email || '').trim().toLowerCase();
  if (!company || !email) return { ok: false, message: 'missing_company_or_email' };

  try {
    const res = await fetch(`${MASTER_URL}/functions/v1/register-tenant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: MASTER_ANON,
        Authorization: `Bearer ${MASTER_ANON}`,
      },
      body: JSON.stringify({
        name: company,
        contact_email: email,
        account_type: input.accountType || null,
        location: input.location || null,
        commercial_reg: input.commercialReg || null,
        admin_name: input.adminName || null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return { ok: false, message: data?.error || `http_${res.status}` };
    }
    return {
      ok: true,
      tenantId: data.tenant_id,
      status: data.status,
      existed: !!data.existed,
    };
  } catch (e: any) {
    // شبكة/دالة غير منشورة → لا نعطّل التسجيل.
    return { ok: false, message: e?.message || 'network_error' };
  }
}
