// ════════════════════════════════════════════════════════════════════════════
// accessControl — العمود الفقري لنظام الصلاحيات/الميزات (data-driven، هجين).
//
// طبقات التحكّم (اتحاد المخفيّات = تقاطع المسموح):
//   1) MASTER  (السقف)   — مفروض من BERA MASTER (license/plan). لا يقدر الأدمين يفكّه.
//   2) TYPE    (النوع)   — افتراضات société/client/personnel (قابلة للتعديل مستقبلاً).
//   3) ADMIN   (محلي)    — اختيار الأدمين داخل الحدود (bera_nav_config.hidden).
//   4) ROLE    (المستخدم) — صلاحيات الدور/الشخص (permHiddenPages).
//
// النتيجة النهائية = اتحاد كل المخفيّات. `lockedPages/lockedFields` = ما فرضه
// MASTER (يُعرض في الواجهة كـ 🔒 غير قابل للتعديل).
// ════════════════════════════════════════════════════════════════════════════

import { AccountType, ACCOUNT_TYPE_HIDDEN } from './accountTypes';
import { defaultNavOrder } from './constants';
import { FIELDS_BY_MODULE, PROTECTED_FIELDS } from './permissionCatalog';

/** كل مفاتيح الصفحات (الوحدات) المعروفة في التنقّل. */
export const PAGE_CATALOG: string[] = [...defaultNavOrder];

/**
 * كتالوج الحقول الحسّاسة، مُجمَّعة حسب الوحدة. مفتاح الحقل = `module.field`
 * (نفس صيغة `can('view', key)` في الـ resolver). مصدره الآن الموحَّد
 * `app/permissionCatalog.ts` — لا تكرار للقيم هنا.
 */
export const FIELD_CATALOG: Record<string, string[]> = FIELDS_BY_MODULE;

/** كل مفاتيح الحقول مسطّحة. */
export const ALL_FIELDS: string[] = [...PROTECTED_FIELDS];

export interface TypeAccess {
  hiddenPages: string[];
  hiddenFields: string[];
}

/**
 * الإعدادات الافتراضية لكل نوع حساب. الصفحات مبذورة من ACCOUNT_TYPE_HIDDEN
 * (المصدر الحالي)، والحقول من أمثلة أولية. لاحقاً تصبح قابلة للتعديل/التخزين.
 */
export const DEFAULT_TYPE_ACCESS: Record<AccountType, TypeAccess> = {
  societe: { hiddenPages: [...ACCOUNT_TYPE_HIDDEN.societe], hiddenFields: [] },
  // `profil.community` n'existe pas (encore) dans le catalogue unifié
  // (app/permissionCatalog.ts) → laissé vide jusqu'à son ajout éventuel.
  client: { hiddenPages: [...ACCOUNT_TYPE_HIDDEN.client], hiddenFields: [] },
  personnel: { hiddenPages: [...ACCOUNT_TYPE_HIDDEN.personnel], hiddenFields: [] },
};

export interface ResolveInput {
  accountType: AccountType;
  /** مخفيّ مفروض من MASTER (license) — السقف، غير قابل للفكّ. */
  masterHiddenPages?: string[];
  masterHiddenFields?: string[];
  /** اختيار الأدمين المحلي (bera_nav_config.hidden). */
  adminHiddenPages?: string[];
  adminHiddenFields?: string[];
  /** حسب الدور/المستخدم (permHiddenPages). */
  roleHiddenPages?: string[];
  roleHiddenFields?: string[];
  /** تجاوز افتراضات النوع (لمّا تصبح قابلة للتعديل). افتراضياً DEFAULT_TYPE_ACCESS. */
  typeOverride?: Partial<TypeAccess>;
}

export interface ResolvedAccess {
  hiddenPages: string[];   // اتحاد كل الطبقات
  hiddenFields: string[];
  lockedPages: string[];   // ما فرضه MASTER (🔒)
  lockedFields: string[];
}

const uniq = (arr: string[]) => [...new Set(arr)];

/** يحسب الرؤية الفعلية بدمج الطبقات الأربع (اتحاد المخفيّات). */
export function resolveAccess(input: ResolveInput): ResolvedAccess {
  const typeDef = DEFAULT_TYPE_ACCESS[input.accountType] || { hiddenPages: [], hiddenFields: [] };
  const typePages = input.typeOverride?.hiddenPages ?? typeDef.hiddenPages;
  const typeFields = input.typeOverride?.hiddenFields ?? typeDef.hiddenFields;

  const master = { p: input.masterHiddenPages || [], f: input.masterHiddenFields || [] };

  return {
    hiddenPages: uniq([
      ...master.p,
      ...typePages,
      ...(input.adminHiddenPages || []),
      ...(input.roleHiddenPages || []),
    ]),
    hiddenFields: uniq([
      ...master.f,
      ...typeFields,
      ...(input.adminHiddenFields || []),
      ...(input.roleHiddenFields || []),
    ]),
    lockedPages: uniq(master.p),
    lockedFields: uniq(master.f),
  };
}

/** مساعد مختصر: الصفحات المخفيّة فقط (توافق مع extraHidden الحالي). */
export function resolveHiddenPages(
  accountType: AccountType,
  masterHiddenPages: string[],
  roleHiddenPages: string[],
): string[] {
  return resolveAccess({ accountType, masterHiddenPages, roleHiddenPages }).hiddenPages;
}
