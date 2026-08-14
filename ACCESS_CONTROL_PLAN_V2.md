# خطة نظام الصلاحيات والتسلسل الهرمي — V2

> الهدف: صفحة إدارة (Admin) متماسكة: **Entreprise** (معلومات الشركة كمصدر وحيد للفوترة وباقي البرنامج)،
> **Équipe & rôles** (تسلسل هرمي + صلاحيات لكل صفحة/حقل)، **Comptes** (مصدر المستخدمين)،
> وعزل تامّ للبيانات بين الشركات، مع **Profil** شخصي يبقى مع المستخدم حتى بعد خروجه من الشركة.

---

## 0) الوضع الحالي بعد الفحص (وقائع، لا افتراضات)

**موجود ويشتغل:**

| العنصر | المكان |
|---|---|
| جداول `company_roles` (level, parent_role_id, is_system)، `company_members`، `role_permissions`، `member_permission_overrides` | `server/db.ts` |
| محرّك القرار النقي: super → override → سلسلة الأدوار (وراثة) → DENY | `server/permissions/resolver.ts` |
| قوالب الأدوار (Patron/Méthode/Chrono/Commercial/RH/Chef de chaîne) | `server/permissions/presets.ts` |
| مسارات `/api/permissions/*` (roles, members, perms, company) | `server.ts:612-622` |
| `/api/permissions/me` → pages/fields/hiddenPages/accountType | `server/permissionsController.ts:88` |
| دمج الطبقات (MASTER + type + admin + role) | `app/accessControl.ts` + `App.tsx:373` |
| عزل البيانات بـ `owner_id` + `users.active_owner_id` + إنشاء workspace | `server/workspacesController.ts` |

**الأعطاب المرصودة (كلها مؤكَّدة بالكود):**

1. `PAGE_LABELS` في `components/PermissionsManager.tsx:23-25` فيها نصوص `{tx(lang, {...})}` **حرفية** — هي التي تظهر مشوَّهة في لقطاتك (خطأ ترحيل i18n الآلي).
2. **مصدرا حقيقة متضاربان للحقول الحسّاسة**: `presets.ts` يستعمل `facturation.marge`، و`app/accessControl.ts` يستعمل `facture.marge` + حقول (`hr.cnss`, `model.marge`, `profil.community`) غير موجودة في `PROTECTED_FIELDS`.
3. **التسلسل الهرمي غير مُدار من الواجهة**: `parent_role_id` و`level` موجودان في DB، لكن `PermissionsManager` لا يعرضهما ولا يرسلهما عند إنشاء دور → لا شجرة هرمية فعلياً.
4. **`member_permission_overrides` بلا API** → «الاستثناء لشخص واحد» (تبيّن معلومة لشخص معيّن فقط) غير قابل للتفعيل اليوم.
5. زر **Nouvelle société** في رأس صفحة Admin ظاهر لكل الأنواع (حتى `personnel`) وخارج تبويب Entreprise.
6. **لا يوجد Historique** مربوط بالشركة: `system_audit_logs` بلا `owner_id`، والمسار الوحيد `/api/master/audit-logs` محصور بـ `requireLocalhost`.
7. لا يوجد **تطبيق فعلي** للحقول الحسّاسة داخل الصفحات: `can('field', …)` غير مستعمل في Ingénierie/RH/Facturation، و`can edit` لا يحوّل الصفحات لـ read-only.
8. `PermissionsManager` مثبّت `dir="ltr"` + `max-w-3xl` داخل صفحة Admin عريضة، وفيه خلط `isDark ? … : 'bg-white dark:bg-dk-surface …'` (dark مكرّر مرّتين) → الشكل غير متّسق ومشكل الوضع الليلي في تبويب Équipe & rôles.
9. عند إزالة عضو: `status='removed'` فقط — بلا تصفير `active_owner_id` ولا مسح مفاتيح localStorage الخاصة بالشركة (خطر تسرّب بيانات).
10. قسم **Machines par chaîne (planning)** — مطلوب حذفه.

---

## 1) القواعد التي ستُبنى عليها (خلاصة طلبك)

1. **الشركة = الحاوية**: كل بيانات البرنامج (فوترة، نماذج، RH…) تابعة لـ `owner_id` واحد. شركتان لا تتقاسمان أي شيء.
2. **الحساب (Compte) ≠ الشركة**: البريد + كلمة السر ملك للشخص. `Profil` (اسم، صورة، هاتف، مهنة) يتبع الشخص ويبقى معه إذا خرج من الشركة. (V2: خصوصية عامّ/خاص لكل حقل).
3. **التسلسل الهرمي**: Admin/Patron → Méthode / Commercial / RH / Chrono / Chef de chaîne… كل مستوى يتحكّم فيمَن تحته فقط، ولا يرى/يعدّل مَن فوقه.
4. **التحكّم على محورين**: `view` (يرى) و`edit` (يعدّل)، لكل **صفحة** ولكل **حقل حسّاس**.
5. **الاستثناء الفردي (Override)**: يمكن فتح/غلق معلومة أو صفحة لشخص بعينه، فوق قواعد دوره.
6. **الظهور المتسلسل**: ما يُخفى على مستوى، يبقى مخفياً لكل مَن تحته.
7. **تأكيد إجباري** قبل كل تعديل صلاحيات (Confirmation modal).
8. **الخروج من الشركة** = تصفير الرؤية فوراً: كل البيانات تختفي، يبقى الـProfil فقط، وإذا التحق بشركة أخرى تبدأ دورة جديدة.
9. **التصميم**: Minimalist SaaS بلغة Planning (slate، بلا gradients)، شجرة على طراز **Device Manager** بمربّعات ✅، مع دعم كامل للوضع الليلي و6 لغات.

---

## 2) القرارات — مُصادَق عليها (2026-08-14)

| # | القرار | ما تمّ اعتماده |
|---|---|---|
| Q1 | زر «Nouvelle société» | ✅ ينتقل داخل تبويب **Entreprise** فقط، ويظهر لـ `isSuper` وللنوعين `societe` و`client`. النوع `personnel` (Indépendant) يرى بدله «Devenir société» يفتح نموذج معلومات الشركة (نفس حقول Setup) ثم يُرقَّى النوع. |
| Q2 | Historique | ✅ حسب التسلسل الهرمي: كل واحد يرى نشاط مَن تحته فقط، والـPatron يرى الكل. |
| Q3 | حقول الشركة | ✅ الكل: ICE / RC / IF / CNSS، العنوان + الهاتف + البريد، RIB + البنك، الشعار + الاسم التجاري (raison sociale) منفصلاً عن الاسم المختصر. تصير المصدر الوحيد لرأس وذيل الفاتورة. |
| Q4 | Machines par chaîne | ✅ حذف كامل من `StructureSection` مع تنظيف الحالة إن لم تكن مستعملة في Planning. |
| Q5 | الحقول الحسّاسة (V1) | `model.cout_minute`, `model.prix_revient`, `model.marge`, `hr.salaire`, `hr.avances`, `hr.cnss`, `facture.marge`, `facture.remise` (توحيد على صيغة `facture.*`). |

---

## 3) تقسيم المهام على الوكلاء (كل وكيل = Sonnet، نطاق ملفّي مغلق)

> **قاعدة**: لا يشترك وكيلان في نفس الملف. الموجات متسلسلة، وداخل كل موجة يشتغل الوكلاء بالتوازي.
> بعد كل موجة: `npm run type-check` + commit + push (أنا المسؤول).

### الموجة 1 — تنظيف وتصحيح فوري (بلا اعتماديات)

**A1 · تنظيف صفحة Admin**
- ملفات: `components/admin/AdminConfigSections.tsx`، `src/components/AdminDashboard.tsx`
- حذف قسم «Machines par chaîne (planning)» بالكامل + الحالة المرتبطة به.
- نقل زر «Nouvelle société» من الرأس إلى تبويب **Entreprise**، بشرط `isSuper && accountType !== 'personnel'`.
- للنوع `personnel`: بطاقة «Devenir société» → تفتح نموذج معلومات الشركة (نفس حقول Setup المرحلة 2).
- إثراء تبويب Entreprise بالحقول التي تعتمد عليها الفوترة: ICE، RC، IF، CNSS، العنوان، الهاتف، البريد، RIB (تُخزَّن في `profile_meta` / أعمدة `workspaces`).

**A2 · توحيد كتالوج الصلاحيات (Backend نقي)**
- ملفات: `server/permissions/presets.ts`، `app/accessControl.ts`
- مصدر حقيقة واحد للصفحات والحقول (توحيد `facture.*`), مزامنة مع `defaultNavOrder`.
- تسميات متعدّدة اللغات للصفحات/الحقول في ملف واحد مشترك (لا `{tx(...)}` حرفية).

### الموجة 2 — قلب النظام (Backend)

**A3 · التسلسل الهرمي + الاستثناءات**
- ملفات: `server/permissionsController.ts`، `server.ts` (مسارات فقط)
- `createRole/updateRole`: قبول `level` و`parent_role_id` + منع الحلقات (cycles).
- حراسة هرمية: لا يعدّل أحد دوراً أو عضواً مستواه ≤ مستواه.
- API جديدة للاستثناءات: `GET/PUT/DELETE /api/permissions/members/:userId/overrides`.
- `getMyPermissions`: إرجاع `level`, `roleName`, `overrides` كي تُعرض في Profil.

**A4 · سجل النشاط (Historique)**
- ملفات: `server/db.ts` (migration)، `server/auditLogger.ts`، `server/permissionsController.ts`، `server.ts`
- إضافة عمود `owner_id` لـ `system_audit_logs` + فهرس.
- `logAudit` يستقبل `ownerId` (من `loadUserContext`).
- `GET /api/permissions/activity?userId=&limit=` — محمي بالتسلسل الهرمي (ترى مَن تحتك فقط).

**A5 · نظافة الخروج من الشركة**
- ملفات: `server/permissionsController.ts` (removeMember)، `src/lib/` (تنظيف localStorage)، `src/context/PermissionsContext.tsx`
- عند الإزالة: تصفير `active_owner_id` إن كان يشير لهذه الشركة، وعند إعادة التحميل تُمسح مفاتيح الشركة محلياً ويبقى الـProfil.

### الموجة 3 — الواجهة

**A6 · صفحة الصلاحيات «Device Manager»**
- ملف: `components/PermissionsManager.tsx` (إعادة كتابة)
- شجرة هرمية قابلة للطيّ: الدور → الأعضاء → الصفحات → الحقول، بمربّعات ✅ (view) و✎ (edit).
- إدارة `parent_role_id` (سحب/اختيار الأب) وعرض المستوى.
- لوحة «Exceptions» لكل عضو (overrides).
- Confirmation إجباري + حالة dirty + رسائل نجاح/خطأ.
- تصميم Planning، دعم dark mode كامل، RTL/LTR حسب اللغة.

**A7 · ربط Comptes ↔ Équipe + Profil**
- ملفات: `src/components/AdminDashboard.tsx` (تبويب Comptes)، `components/Profil.tsx`
- من Comptes: زر «إضافة إلى الفريق» يفتح اختيار الدور مباشرة (بدل إعادة كتابة البريد).
- Profil: بطاقة «صلاحياتي» (قراءة فقط) تعرض الدور، المستوى، الصفحات المسموحة، والاستثناءات.
- Profil: صورة شخصية + مهنة، مع تمييز ما هو عام وما هو خاص.

### الموجة 4 — التطبيق والإنهاء

**A8 · تطبيق الحقول الحسّاسة داخل الصفحات**
- ملفات: `components/ModelWorkflow.tsx`, `components/GESTION-RH.tsx`, `components/Facturation.tsx`, `components/CostCalculator.tsx` (وما يلزم)
- إخفاء القيمة (لا الحقل فقط) عند `!can('field', k, 'view')`، وقفل الإدخال عند `!can(..., 'edit')`.

**A9 · تدقيق نهائي**
- `npm run type-check`، فحص عدم وجود `{tx(` حرفية، فحص أصناف `dark:` مكرّرة، مراجعة منطق العزل.

---

## 4) ترتيب التنفيذ ونقاط التحقّق

```
الموجة 1 (A1 + A2 بالتوازي) → type-check → commit
الموجة 2 (A3 + A4 + A5 بالتوازي) → type-check → commit
الموجة 3 (A6 + A7 بالتوازي)      → type-check → commit
الموجة 4 (A8 ثم A9)               → type-check → commit + push
```

**لا يبدأ التنفيذ قبل موافقتك على القرارات Q1–Q4.**
