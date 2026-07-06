// ════════════════════════════════════════════════════════════════════════════
// masterRegistration — جسر التسجيل نحو BERA MASTER.
// عند إنشاء حساب جديد في BERAMETHODE، ندفع بيانات الزبون (اسم الشركة، البريد،
// نوع الحساب) إلى منصّة BERA MASTER كـ tenant بحالة "pending" (بلا مفتاح بعد).
// يظهر عندها المالك في قسم Users → يُصدر له مفتاح الترخيص.
//
// الدفع يمرّ عبر Edge Function "register-tenant" (service_role) لأنّ RLS يمنع
// الكتابة المباشرة في جدول tenants بمفتاح anon. العملية best-effort: أي فشل
// لا يمنع إتمام التسجيل (الزبون يقدر يخدم، والمالك يقدر يضيفه يدوياً لاحقاً).
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient';

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
    const { data, error } = await supabase.functions.invoke('register-tenant', {
      body: {
        name: company,
        contact_email: email,
        account_type: input.accountType || null,
        location: input.location || null,
        commercial_reg: input.commercialReg || null,
        admin_name: input.adminName || null,
      },
    });
    if (error) return { ok: false, message: error.message };
    if (!data?.ok) return { ok: false, message: data?.error || 'register_failed' };
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
