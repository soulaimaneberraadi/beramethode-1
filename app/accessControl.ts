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

// ════════════════════════════════════════════════════════════════════════════
// CONFIDENTIALITÉ DU COÛT — capacité transversale « champ sensible »
//
// Pourquoi : aujourd'hui tout le monde voit le prix de revient et la marge.
// Impossible de vendre le produit à un atelier qui emploie plusieurs personnes :
// un vendeur ne doit PAS connaître la marge de son patron.
//
// Ce bloc N'INTRODUIT PAS un second système de permissions : il s'appuie sur les
// mêmes clés `module.champ` que `resolveAccess` (FIELD_CATALOG / PROTECTED_FIELDS).
// Le réglage `AppSettings.masquerCoutRevient` sert d'interrupteur : à false
// (défaut), le comportement reste EXACTEMENT celui d'aujourd'hui.
//
// ── RÈGLE DES DEUX CAPACITÉS (à lire avant de toucher au code) ──────────────
//
//   canSeeCost  : VRAI par défaut. Ne devient faux que si le patron a activé
//                 `masquerCoutRevient` ET que la personne tient un rôle de
//                 vente, ou si une couche de permissions masque explicitement
//                 le champ témoin `model.prix_revient`.
//
//   canSetPrice : VRAI par défaut (fail-open). Ne devient faux que sur un
//                 REFUS EXPLICITE :
//                   • une permission de champ interdit l'écriture du prix de
//                     vente (`priceFieldEdit === false`) ; ou
//                   • le rôle est déclaré en lecture seule (`roleReadOnly`, ou
//                     un nom de rôle de la liste READ_ONLY_ROLE_KEYS).
//                 Un nom de rôle INCONNU (« Chef d'atelier », « Responsable
//                 production », vocabulaire local de l'atelier) n'est JAMAIS une
//                 restriction : deviner un refus à partir d'un nom faisait
//                 disparaître l'édition du prix chez tout atelier ayant nommé
//                 ses rôles, sans que personne ne l'ait décidé.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Champs « coût » regroupés : prix de revient, marge, coût/minute. Le
 * cloisonnement commercial les masque en bloc (une marge se recalcule
 * trivialement dès qu'un seul des trois fuite).
 */
export const COST_SENSITIVE_FIELDS: string[] = [
  'model.cout_minute',
  'model.prix_revient',
  'model.marge',
  'facturation.marge',
];

/** Champ témoin du cloisonnement : s'il est masqué, le coût l'est aussi. */
const COST_PROBE_FIELD = 'model.prix_revient';

/**
 * Rôles « vente » (presets serveur `RolePresetKey`). Ils voient le prix de vente
 * et le stock, mais pas le coût ni la marge dès que `masquerCoutRevient` est actif.
 * Les alias couvrent les rôles renommés par l'atelier (vocabulaire local).
 */
export const SALES_ROLE_KEYS: string[] = ['commercial', 'vendeur', 'vente', 'ventes', 'sales'];

/**
 * Rôles historiquement listés comme « tarificateurs ». Conservé pour
 * compatibilité d'import : la tarification est désormais ouverte par défaut
 * (fail-open), donc cette liste ne sert PLUS à refuser quoi que ce soit.
 */
export const PRICING_ROLE_KEYS: string[] = [...SALES_ROLE_KEYS];

/**
 * Rôles dont le nom DIT explicitement « lecture seule ». C'est la seule
 * reconnaissance par nom autorisée pour refuser l'écriture : elle ne devine
 * rien, elle lit une intention déjà écrite par l'atelier dans le nom du rôle.
 * Tout autre nom (connu ou non) reste autorisé.
 */
export const READ_ONLY_ROLE_KEYS: string[] = [
  'lecture', 'lecture seule', 'lecture-seule', 'lecteur',
  'consultation', 'observateur',
  'read only', 'read-only', 'readonly', 'viewer',
  'solo lectura', 'somente leitura', 'salt okunur',
  'قراءة فقط',
];

/**
 * Clé de champ facultative que l'atelier peut déclarer pour verrouiller
 * l'écriture du prix de vente. Absente du catalogue par défaut : tant qu'elle
 * n'est pas déclarée, aucune restriction ne s'applique.
 */
export const SALE_PRICE_FIELD = 'model.prix_vente';

export interface CommercialAccessInput {
  /** Propriétaire du workspace — voit et modifie tout, sans exception. */
  isOwner?: boolean;
  /** Administrateur — même niveau que le propriétaire sur ces deux capacités. */
  isAdmin?: boolean;
  /** Clé du rôle (preset serveur ou rôle local). `null`/absent = pas de rôle → non restreint. */
  roleKey?: string | null;
  /** `AppSettings.masquerCoutRevient` (défaut false = comportement historique). */
  masquerCoutRevient?: boolean;
  /** Champs déjà masqués par les 4 couches (`resolveAccess().hiddenFields`). */
  hiddenFields?: string[];
  /**
   * Permission d'ÉCRITURE sur le prix de vente, telle que déclarée par les
   * permissions de champ (`perms.fields[SALE_PRICE_FIELD]?.edit`).
   * `false` = refus explicite → l'édition est fermée.
   * `undefined`/`null` = rien n'a été déclaré → on n'invente pas de restriction.
   */
  priceFieldEdit?: boolean | null;
  /** Le rôle est déclaré en lecture seule (aucune écriture, nulle part). */
  roleReadOnly?: boolean;
}

export interface CommercialAccess {
  /** Voir prix de revient, marge, valeur du stock au coût. */
  canSeeCost: boolean;
  /** Modifier les prix de vente et les tarifs. */
  canSetPrice: boolean;
  /**
   * Champs à ajouter à `roleHiddenFields` de `resolveAccess` quand le
   * cloisonnement est actif (vide sinon → aucun effet de bord).
   */
  hiddenCostFields: string[];
}

const normRole = (roleKey?: string | null) =>
  roleKey ? String(roleKey).trim().toLowerCase() : null;

const isSalesRole = (roleKey?: string | null) => {
  const r = normRole(roleKey);
  return !!r && SALES_ROLE_KEYS.includes(r);
};

/** Le NOM du rôle dit lui-même « lecture seule ». Aucune déduction ici. */
const isReadOnlyRole = (roleKey?: string | null) => {
  const r = normRole(roleKey);
  return !!r && READ_ONLY_ROLE_KEYS.includes(r);
};

/**
 * Résout les deux capacités commerciales. Hiérarchie respectée :
 * propriétaire/admin > réglage `masquerCoutRevient` > rôle > couches existantes.
 */
export function resolveCommercialAccess(input: CommercialAccessInput): CommercialAccess {
  const privileged = !!input.isOwner || !!input.isAdmin;
  const role = normRole(input.roleKey);

  // 1) Patron / admin : rien ne leur est caché, même cloisonnement actif.
  if (privileged) {
    return { canSeeCost: true, canSetPrice: true, hiddenCostFields: [] };
  }

  // 2) Cloisonnement actif + rôle de vente → le coût disparaît en bloc.
  const cloisonne = input.masquerCoutRevient === true && isSalesRole(role);

  // 3) Sinon on retombe sur le mécanisme existant (champ masqué par une couche).
  const hiddenByLayers = (input.hiddenFields || []).includes(COST_PROBE_FIELD);

  // 4) Prix de vente : FAIL-OPEN. Ouvert tant que personne n'a écrit un refus.
  //    Un « Chef d'atelier » ou un « Responsable production » — rôles que
  //    l'atelier nomme lui-même — doit continuer à corriger un prix comme hier.
  const refusExplicitePrix =
    input.priceFieldEdit === false
    || input.roleReadOnly === true
    || isReadOnlyRole(role);

  return {
    canSeeCost: !cloisonne && !hiddenByLayers,
    canSetPrice: !refusExplicitePrix,
    hiddenCostFields: cloisonne ? [...COST_SENSITIVE_FIELDS] : [],
  };
}

/** Raccourci UI : « ai-je le droit de voir le coût / la marge ? ». */
export function canSeeCost(input: CommercialAccessInput): boolean {
  return resolveCommercialAccess(input).canSeeCost;
}

/**
 * Raccourci UI : « ai-je le droit de modifier les prix de vente ? ».
 * VRAI par défaut ; faux uniquement sur refus explicite (cf. bloc de tête).
 */
export function canSetPrice(input: CommercialAccessInput): boolean {
  return resolveCommercialAccess(input).canSetPrice;
}
