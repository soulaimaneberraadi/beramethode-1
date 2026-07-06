// ════════════════════════════════════════════════════════════════════════════
// masterRegistration — جسر التسجيل نحو BERA MASTER.
// عند إنشاء حساب جديد في BERAMETHODE، ندفع بيانات الزبون (اسم الشركة، البريد،
// نوع الحساب) إلى منصّة BERA MASTER كـ tenant بحالة "pending" (بلا مفتاح بعد).
// يظهر عندها المالك في قسم Users → يُصدر له مفتاح الترخيص.
//
// ⚠️ مشروع Supabase مختلف: BERAMETHODE يشتغل على مشروع الجسر
// (utrojjhscyatppgcszrt) بينما جداول BERA MASTER (tenants…) على المشروع الأصلي
// (jiscgwioxwsulaopsivc). لذلك ننادي Edge Function "register-tenant" مباشرةً على
// مشروع BERA MASTER عبر fetch (وليس عبر الـ client المشترك). المفتاح anon عمومي
// (آمن في المتصفّح) ويمكن تجاوزه بمتغيّرات البيئة.
//
// العملية best-effort: أي فشل لا يمنع إتمام التسجيل.
// ════════════════════════════════════════════════════════════════════════════

const MASTER_URL =
  (import.meta.env.VITE_MASTER_SUPABASE_URL as string) ||
  'https://jiscgwioxwsulaopsivc.supabase.co';

const MASTER_ANON =
  (import.meta.env.VITE_MASTER_SUPABASE_ANON_KEY as string) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2Nnd2lveHdzdWxhb3BzaXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTcwNTgsImV4cCI6MjA5MTU3MzA1OH0.-jRI1RlbjxecLyN2b83xmjuJCKhs7ti_7_-RWXNCNgk';

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
