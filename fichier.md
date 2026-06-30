# 📋 BERAMETHODE — الخريطة الكاملة للنظام

> **BERAMETHODE** نظام ERP للصناعات النسيجية في المغرب.
> إدارة: حساب التكاليف، التخطيط الإنتاجي، المخازن، الموارد البشرية، الفوترة، ومتابعة الإنتاج.

---

## 🧭 فهرس المحتويات

1. [هندسة التطبيق (Architecture)](#1-هندسة-التطبيق)
2. [نظام التوجيه (Routing)](#2-نظام-التوجيه)
3. [تسلسل الإقلاع (Boot Sequence)](#3-تسلسل-الإقلاع)
4. [هيكل التنقل (Navigation)](#4-هيكل-التنقل)
5. [جميع الصفحات (Pages)](#5-جميع-الصفحات)
6. [طبقات إخفاء الصفحات](#6-طبقات-إخفاء-الصفحات)
7. [المكونات المدمجة](#7-المكونات-المدمجة)
8. [نقاط API](#8-نقاط-api)
9. [جداول قاعدة البيانات](#9-جداول-قاعدة-البيانات)
10. [الأمان (Security)](#10-الأمان)
11. [الخادم (Controllers)](#11-الخادم)
12. [المكدس التقني](#12-المكدس-التقني)

---

## 1. هندسة التطبيق

```
📦 index.tsx ← نقطة الدخول
┣━ AuthProvider        (مصادقة JWT)
┣━ LicenseProvider     (ترخيص BERA MASTER)
┣━ PermissionsProvider (صلاحيات الأدوار)
┣━ ThemeProvider       (السمة فاتح/داكن)
┗━ LanguageProvider    (الترجمة dr/fr/en/es)

📦 App.tsx ← المكون الرئيسي (1866 سطر)
┣━ AnnouncementBar    (إعلانات Supabase)
┣━ LicenseBanner      (تنبيه الترخيص)
┣━ AppHeader          (شريط التنقل العلوي)
┃  ┣━ Logo + WorkspaceSwitcher
┃  ┣━ Navigation (dropdown/flat/mobile-only)
┃  ┗━ SupportWidget + SyncIndicator + Profil + Logout
┣━ ErrorBoundary      (عزل أعطال الصفحات | key=currentView)
┃  ┗━ {currentView === 'xxx' && <Component />} × 23
┣━ NavConfirmModal    (تأكيد عند تغيير الصفحة)
┗━ Toast              (إشعارات)
```

---

## 2. نظام التوجيه

**الملف:** `lib/router.ts` (215 سطر)

**آلية Hash-Based SPA:**

```
المستخدم → #suivi/abc123
     │
     ▼ hashchange event
     │
     ▼ parseHash(hash) → ParsedRoute { view, tokens, isNotFound }
     │
     ▼ syncHashToView() في App.tsx
     │
     ▼ setCurrentView(view) → المكون المناسب
```

**أنواع الروابط:**

| النمط | مثال | النتيجة |
|---|---|---|
| `#view` | `#dashboard` | عرض الصفحة مباشرة |
| `#tokens/view` | `#abc123/suivi` | عرض مع معاملات (tokens) |
| `#` | `#` | → dashboard |
| غير معروف | `#xyz` | 404 |

**الصفحات المعروفة (23):**

```
login, signup
vuegenerale, dashboard, ingenierie, library, coupe
effectifs, gestionRh, planning, suivi
magasin, export, config, profil, admin
rendement, pageMachine, machin, facturation
atelierProd, sousTraitance, catalogTemps
```

**دوال الموجه:**

| الدالة | الوظيفة |
|---|---|
| `navigate(view, ...tokens)` | تغيير الـ URL + إعلام المستمعين |
| `parseHash(hash)` | تفكيك الهاش إلى view + tokens |
| `getCurrentRoute()` | قراءة المسار الحالي |
| `createRouteUrl(view, ...tokens)` | بناء رابط هاش |
| `resetToHome()` | العودة إلى dashboard |
| `onRouteChange(fn)` | الاشتراك في تغييرات التوجيه |

---

## 3. تسلسل الإقلاع

**الملف:** `lib/bootSequence.ts` (136 سطر)

```
التحقق من الجلسة (auth) ──── 15%
    │
    ▼ تحميل البيانات بالتوازي (data) ──── 85%
    ├── GET /api/settings
    ├── GET /api/hr/workers
    ├── GET /api/magasin/products
    ├── GET /api/magasin/lots
    ├── GET /api/magasin/mouvements
    └── GET /api/dashboard/kpis
```

**شاشة التحميل:**

| الحالة | الإجراء |
|---|---|
| `authLoading = true` | GlobalLoader (انتظار AuthContext) |
| `user = null` | عرض Login/Signup |
| `user موجود` | تشغيل bootSequence مع progress bar |
| `static mode` | إخفاء التحميل فوراً |

---

## 4. هيكل التنقل

**الملف:** `app/AppHeader.tsx` (674 سطر)

### `defaultNavOrder` (الترتيب الافتراضي):

```javascript
['vuegenerale', 'dashboard', 'library', 'coupe', 'effectifs', 'gestionRh',
 'planning', 'suivi', 'rendement', 'magasin', 'export', 'facturation',
 'config', 'pageMachine', 'machin', 'catalogTemps', 'admin', 'sousTraitance']
```

ملاحظة: `ingenierie` و `atelierProd` في VIEW_DEFS لكن ليسا في defaultNavOrder.

### جميع `VIEW_DEFS` (20 صفحة):

| المفتاح | التسمية (fr) | الأيقونة | لون النشاط |
|---|---|---|---|
| `vuegenerale` | Vue Générale | `BarChart3` | indigo |
| `dashboard` | Tableau de bord | SVG مخصص | indigo |
| `planning` | Planning | SVG تقويم | blue |
| `suivi` | Suivi Production | `Activity` | indigo |
| `rendement` | Rendement | SVG رسم بياني | violet |
| `ingenierie` | Ingénierie | `Factory` | emerald |
| `atelierProd` | Atelier P° | `Factory` | orange |
| `coupe` | La Coupe | `Scissors` | rose |
| `sousTraitance` | Sous-traitance | `Truck` | indigo |
| `effectifs` | Effectifs | `Users` | orange |
| `gestionRh` | Gestion RH | SVG أشخاص | sky |
| `magasin` | Magasin | `Package` | emerald |
| `export` | Stock Fini | `PackageCheck` | cyan |
| `facturation` | Facturation | SVG فاتورة | blue |
| `library` | Bibliothèque | `FolderOpen` | indigo |
| `pageMachine` | Suivi des Machines | `Activity` | fuchsia |
| `machin` | Catalogue & Paramètres | `Layers` | indigo |
| `catalogTemps` | Catalogue de Temps | `Clock` | violet |
| `config` | Configuration | `SettingsIcon` | amber |
| `admin` | Admin | `Shield` | purple |

### `profil` (صفحة الملف الشخصي):
- **ليست** في VIEW_DEFS
- **ليست** في defaultNavOrder
- تظهر فقط كزر في الـ Header (الأفاتار)
- **لا تُخفى أبداً** بموجب الترخيص

### أنماط التنقل (3):

| النمط | الوصف |
|---|---|
| `dropdown` (افتراضي) | مجموعات منسدلة حسب الفئات |
| `flat` | قائمة مسطحة بجميع الوحدات |
| `mobile-only` | شريط مخفي على سطح المكتب، قائمة جانبية فقط |

### فئات التنقل (categories):

| الفئة | الترجمة (fr) | الصفحات |
|---|---|---|
| `principal` | Principal | dashboard, library, suivi, planning |
| `production` | Production | effectifs, coupe, sousTraitance |
| `rh` | RH | gestionRh, catalogTemps |
| `logistique` | Logistique | magasin, export, facturation |
| `config` | Config | machin, rendement, pageMachine, config |

### شريط الـ Header:

```
[☰ Hamburger] [BERAMETHODE Logo] [WorkspaceSwitcher] [Auto-save]
    → [Dropdown Categories / Flat Nav] ←
    [DB Backup] [SyncIndicator] [SupportWidget] [Avatar] [Logout]
```

---

## 5. جميع الصفحات

### 🔐 صفحات الدخول (قبل المصادقة)

| # | الصفحة | المسار | المكون | الحجم | API |
|---|---|---|---|---|---|
| 1 | **تسجيل الدخول** | `login` | `Login.tsx` | 667 س | POST `/api/auth/login` |
| 2 | **إنشاء حساب** | `signup` | `Signup.tsx` | 288 س | POST `/api/auth/register` |
| 3 | **الإعداد الأول** | — | `Setup.tsx` | 1030 س | POST `/api/setup/init` |

### 📊 صفحات الإدارة (بعد تسجيل الدخول)

| # | الصفحة | المسار | المكون | سطور | API | الوظيفة |
|---|---|---|---|---|---|---|
| 4 | **نظرة عامة** | `vuegenerale` | `VueGenerale.tsx` | 343 | — | حالة الآلات، خطوط الإنتاج، ملخص التخطيط |
| 5 | **لوحة القيادة** | `dashboard` | `Dashboard.tsx` | 642 | GET `/api/dashboard/kpis` | بطاقات الأداء، رسوم Recharts، KPIs، اختصارات |
| 6 | **الهندسة** | `ingenierie` | `ModelWorkflow.tsx` | 618 | — | الملف التقني، Gamme، Balancing، CostCalc، Chrono |
| 7 | **المكتبة** | `library` | `Library.tsx` | 896 | GET `/api/models` | عرض/بحث/تحميل/استيراد النماذج |
| 8 | **القص** | `coupe` | `LaCoupe.tsx` | 2424 | — | طوابير القص، تتبع الأقمشة، إدخال بيانات القص |
| 9 | **التأطير** | `effectifs` | `Effectifs.tsx` | 1777 | POST `/api/suivi` (خروج) | توزيع العمال على خطوط الإنتاج |
| 10 | **الموارد البشرية** | `gestionRh` | `GESTION-RH.tsx` | 3018 | GET `/api/hr/workers` | ملفات العمال، الحضور، الإنتاج، السلفات، Sage |
| 11 | **التخطيط** | `planning` | `Planning.tsx` | 1452 | GET/POST `/api/planning` | عرض تقويمي (Gantt) وبطاقات، إضافة/تعديل/حذف |
| 12 | **متابعة الإنتاج** | `suivi` | `SuiviProduction.tsx` | 2343 | GET/POST `/api/suivi` | Timeline، مخرجات بالساعة، عيوب، توقفات |
| 13 | **العائد** | `rendement` | `RendementBoard.tsx` | 250 | — | نسب الإنتاجية لكل خط |
| 14 | **المخزن** | `magasin` | `Magasin.tsx` | 4010 | — | منتجات، دفعات، حركات، أوامر شراء، نفايات |
| 15 | **المخزون النهائي** | `export` | `StockExport.tsx` | 1325 | — | تصدير المنتجات النهائية، تتبع الشحنات |
| 16 | **الفوترة** | `facturation` | `Facturation.tsx` | 296 | — | فواتير، إيصالات تسليم، مدفوعات |
| 17 | **الإعدادات** | `config` | `Configuration.tsx` | 1985 | GET/POST `/api/settings` | ملف الشركة، العملة، الآلات، التقويم، التنقل، التراخيص |
| 18 | **الملف الشخصي** | `profil` | `Profil.tsx` | 136 | — | اسم المستخدم، البريد، الدور |
| 19 | **متابعة الآلات** | `pageMachine` | `PageMachine.tsx` | 1620 | — | حالة الآلات (OK/PANNE/MAINT)، سجل الصيانة |
| 20 | **كتالوج الآلات** | `machin` | `Machin.tsx` | 1133 | — | إضافة/تعديل/حذف آلة، Speed/Complexity Factors |
| 21 | **ورشة الإنتاج** | `atelierProd` | `Atelier.tsx` | 489 | — | خطوط الإنتاج النشطة، طلبات التموين |
| 22 | **المقاولة** | `sousTraitance` | `SousTraitance.tsx` | 2807 | — | أوامر المقاولة، تتبع الإنتاج الخارجي |
| 23 | **كتالوج الأوقات** | `catalogTemps` | `CatalogueTemps.tsx` | 861 | — | أوقات معيارية للعمليات، ربط بـ Sage ERP |

---

## 6. طبقات إخفاء الصفحات

**3 طبقات تُدمج معاً في App.tsx (السطر 312):**

```typescript
const extraHidden = [
  ...licenseHiddenModules,   // الترخيص
  ...permHiddenPages,        // الصلاحيات
  ...(ACCOUNT_TYPE_HIDDEN[accountType] || []),  // نوع الحساب
];
```

### الطبقة 1: ترخيص BERA MASTER

**الملف:** `src/context/LicenseContext.tsx`

```javascript
ALL_MODULES = [
  'dashboard', 'ingenierie', 'atelierProd', 'library', 'coupe',
  'effectifs', 'gestionRh', 'planning', 'suivi', 'rendement', 'magasin', 'export',
  'facturation', 'config', 'pageMachine', 'machin', 'catalogTemps', 'objectifs',
  'sousTraitance', 'admin', 'profil', 'atelier',
];
```
- `hiddenModules = ALL_MODULES.filter(m => !license.modules.includes(m))`
- `profil` لا يُخفى أبداً

### الطبقة 2: صلاحيات الأدوار

**الملف:** `src/context/PermissionsContext.tsx`

- `GET /api/permissions/me` → `{ hiddenPages, pages, fields }`
- إذا `isSuper` → لا إخفاء
- إذا فشل الطلب → لا إخفاء (non-breaking)

**أدوار الصلاحيات المسبقة (server/permissions/presets.ts):**

| الدور | المستوى | الصفحات المسموحة | التحكم |
|---|---|---|---|
| **Patron** | 0 | الكل | view + edit |
| **Méthode** | 1 | vuegenerale, dashboard, ingenierie, atelier, atelierProd, library, coupe, planning, suivi, rendement, machin, pageMachine | edit: ingenierie, atelier, atelierProd, library, coupe |
| **Chrono** | 2 | dashboard, ingenierie, atelier, suivi, rendement, machin | edit: atelier |
| **Commercial** | 1 | vuegenerale, dashboard, facturation, library, planning | edit: facturation |
| **RH** | 1 | dashboard, gestionRh, effectifs, objectifs | edit: gestionRh, effectifs |
| **Chef de chaîne** | 2 | dashboard, suivi, rendement, effectifs, planning | edit: suivi |

### الطبقة 3: نوع الحساب

**الملف:** `app/accountTypes.ts`

| النوع | الوصف | الصفحات المخفية |
|---|---|---|
| `societe` | ERP كامل | `[]` (لا شيء) |
| `client` | متابعة الطلبات فقط | `['catalogTemps', 'effectifs', 'suivi', 'coupe', 'rendement', 'pageMachine', 'machin', 'gestionRh', 'objectifs', 'atelierProd', 'atelier']` |
| `personnel` | الطرق والتوقيت فقط | `['coupe', 'gestionRh', 'planning', 'suivi', 'magasin', 'export', 'facturation', 'pageMachine', 'sousTraitance', 'objectifs', 'atelierProd', 'atelier']` |

### طبقة إضافية: دور المستخدم

- `admin` يظهر فقط إذا `user?.role === 'admin'`
- التحقق في `AppHeader.tsx` + `App.tsx`

---

## 7. المكونات المدمجة

| # | المكون | الملف | سطور | الوظيفة |
|---|---|---|---|---|
| 1 | **AppHeader** | `app/AppHeader.tsx` | 674 | شريط التنقل العلوي الكامل |
| 2 | **NavConfirmModal** | `app/NavConfirmModal.tsx` | 157 | تأكيد عند مغادرة صفحة مع تغييرات غير محفوظة |
| 3 | **SupportWidget** | `components/SupportWidget.tsx` | 179 | واجهة الدعم الفني (Supabase tickets) |
| 4 | **LicenseBanner** | `components/LicenseBanner.tsx` | 28 | شريط تحذير عند انتهاء/اقتراب انتهاء الترخيص |
| 5 | **AnnouncementBar** | `components/AnnouncementBar.tsx` | 64 | إعلانات من Supabase (صيانة، تحديثات) |
| 6 | **GlobalLoader** | `components/GlobalLoader.tsx` | 192 | شاشة تحميل مع شريط تقدم + إعادة محاولة |
| 7 | **ErrorBoundary** | `components/ErrorBoundary.tsx` | 172 | عزل أعطال الصفحات + إرسال تقارير |
| 8 | **SyncIndicator** | `components/SyncIndicator.tsx` | 57 | مؤشر المزامنة السحابية (Supabase) |
| 9 | **Toast** | `App.tsx` (مضمن) | ~15 | إشعارات نجاح/خطأ عائمة |

---

## 8. نقاط API

### المصادقة والإعداد

| المسار | الطريقة | الوظيفة |
|---|---|---|
| `/api/auth/me` | GET | التحقق من الجلسة |
| `/api/auth/login` | POST | تسجيل الدخول |
| `/api/auth/register` | POST | إنشاء حساب |
| `/api/auth/logout` | POST | تسجيل الخروج |
| `/api/auth/forgot-password` | POST | طلب إعادة تعيين كلمة السر |
| `/api/auth/verify-code` | POST | التحقق من رمز OTP |
| `/api/auth/reset-password` | POST | إعادة تعيين كلمة السر |
| `/api/setup/status` | GET | التحقق من الإعداد الأول |
| `/api/setup/init` | POST | تهيئة النظام لأول مرة |

### البيانات الأساسية

| المسار | الطريقة | الوظيفة |
|---|---|---|
| `/api/settings` | GET/POST | قراءة/كتابة الإعدادات |
| `/api/models` | GET/POST | نماذج المنتجات |
| `/api/models/:id` | DELETE | حذف نموذج |
| `/api/planning` | GET/POST | التخطيط |
| `/api/suivi` | GET/POST | متابعة الإنتاج |
| `/api/demandes-appro` | GET/POST | طلبات التموين |

### المخازن

| المسار | الطريقة |
|---|---|
| `/api/magasin/products` | GET/POST |
| `/api/magasin/lots` | GET |
| `/api/magasin/mouvements` | GET/PUT |
| `/api/magasin/commandes/:id` | DELETE |
| `/api/magasin/demandes/:id` | DELETE |
| `/api/magasin/dechets/:id` | DELETE |
| `/api/material-receipts` | GET/POST |
| `/api/finished-goods` | GET/POST |
| `/api/finished-goods/mouvements` | GET/POST |

### الموارد البشرية

| المسار | الطريقة | الوظيفة |
|---|---|---|
| `/api/hr/workers` | GET | بيانات العمال |
| `/api/hr/pointage` | GET/POST | الحضور |
| `/api/hr/production` | GET/POST | إنتاج العمال |
| `/api/hr/avances` | GET/POST | السلفات |
| `/api/hr/sage-exports` | GET | تصدير Sage |
| `/api/hr/invitations` | GET/POST | دعوات العمال |
| `/api/workers` | GET/POST | العمال (Legacy) |
| `/api/worker-skills` | GET/POST | مصفوفة الكفاءات |
| `/api/worker-pointage` | GET/POST | سجل الحضور (Legacy) |

### لوحة القيادة والذكاء الاصطناعي

| المسار | الطريقة |
|---|---|
| `/api/dashboard/kpis` | GET |
| `/api/dashboard/kpis/stream` | GET (SSE) |
| `/api/ai/analyze-textile` | POST |
| `/api/ai/optimize-planning` | POST |

### الإدارة والأمان

| المسار | الطريقة | الحماية |
|---|---|---|
| `/api/users` | GET | مشرف |
| `/api/users/:id/role` | PUT | مشرف + noDirectUserAccess |
| `/api/users/:id` | DELETE | مشرف + noDirectUserAccess |
| `/api/admin/export-all-data` | GET | مشرف |
| `/api/admin/download-db` | GET | مشرف |
| `/api/permissions/me` | GET | مصادق |
| `/api/permissions/roles` | GET/POST | مشرف |
| `/api/workspaces` | GET/POST | مصادق |
| `/api/workspaces/switch` | POST | مصادق |
| `/api/license/verify` | POST | عام |
| `/api/master/*` | POST | localhost فقط |
| `/api/health` | GET | عام |

---

## 9. جداول قاعدة البيانات

**الملف:** `server/db.ts` (1671 سطر)  
**قاعدة البيانات:** SQLite مع WAL mode

### إعدادات SQLite
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
```

### المستخدمون والمصادقة

| الجدول | الوظيفة |
|---|---|
| `users` | مستخدمو النظام |
| `verification_codes` | رموز إعادة تعيين كلمة المرور |
| `user_profiles` | الملفات الشخصية |
| `impersonation_audit_logs` | سجل انتحال الهوية (BERA MASTER) |

### النماذج والمنتجات

| الجدول | الوظيفة |
|---|---|
| `models` | نماذج المنتجات (JSON data) |
| `app_settings` | إعدادات المستخدمين (JSON key-value) |

### المخازن

| الجدول | الوظيفة |
|---|---|
| `magasin_products` | منتجات المخزون |
| `magasin_lots` | تتبع الدُفعات |
| `magasin_mouvements` | حركات المخزون |
| `magasin_commandes` | أوامر الشراء |
| `magasin_demandes` | طلبات الورشة |
| `magasin_dechets` | النفايات |
| `material_receipts` | إيصالات استلام المواد |
| `material_invoices` | فواتير المواد |
| `inventory_movements` | حركات الجرد |
| `finished_goods_stock` | مخزون المنتجات التامة |
| `finished_goods_movements` | حركات المنتجات التامة |

### التخطيط والإنتاج

| الجدول | الوظيفة |
|---|---|
| `planning_events` | أحداث التخطيط |
| `planning_reservations` | حجوزات المواد |
| `suivi_data` | بيانات متابعة الإنتاج |
| `suivi_sorties_horaires` | الإنتاج بالساعة |
| `suivi_effectifs` | التأثيرات حسب الدور |
| `suivi_defauts` | العيوب |
| `suivi_downtimes` | أوقات التوقف |
| `downtime_codes` | رموز أسباب التوقف |
| `poste_suivi` | متابعة محطات العمل |
| `demandes_appro` | طلبات الإمداد |
| `production_lines` | خطوط الإنتاج |
| `production_daily` | الإنتاج اليومي |

### الموارد البشرية

| الجدول | الوظيفة |
|---|---|
| `workers` | بيانات العمال (Legacy) |
| `worker_skills` | مصفوفة الكفاءات |
| `worker_pointage` | سجل الحضور (Legacy) |
| `hr_workers` | ملفات العمال المحسّنة |
| `hr_pointage` | الحضور المتقدم |
| `hr_production` | إنتاج العمال |
| `hr_avances` | سلفات العمال |
| `hr_sage_exports` | تصدير Sage |
| `hr_transport_lignes` | خطوط النقل |
| `hr_invitation` | دعوات العمال |
| `platform_person` | الهوية الشاملة |
| `hr_worker_person` | ربط العمال بالهويات |

### الفوترة

| الجدول | الوظيفة |
|---|---|
| `factures` | الفواتير |
| `bons_livraison` | إيصالات التسليم |
| `paiements` | المدفوعات |

### المقاولة

| الجدول | الوظيفة |
|---|---|
| `subcontract_orders` | أوامر المقاولة |
| `subcontractor_groups` | مجموعات المقاولين |

### الجدولة المتقدمة

| الجدول | الوظيفة |
|---|---|
| `chain_activity_rates` | معدلات النشاط لكل سلسلة |
| `learning_curve_profiles` | منحنيات التعلم |
| `crisis_alerts` | تنبيهات الأزمات |

### الأمان والصلاحيات

| الجدول | الوظيفة |
|---|---|
| `system_audit_logs` | سجل التدقيق |
| `company_roles` | الأدوار الوظيفية |
| `company_members` | أعضاء الشركة |
| `role_permissions` | صلاحيات الأدوار |
| `member_permission_overrides` | تجاوزات الصلاحيات الفردية |
| `crash_reports` | تقارير الأعطال |

### مساحات العمل والمجتمعات

| الجدول | الوظيفة |
|---|---|
| `workspaces` | مساحات العمل (multitenant) |
| `communities` | المجتمعات |
| `community_members` | أعضاء المجتمعات |
| `shared_resources` | الموارد المشتركة |
| `company_settings` | إعدادات الشركة |
| `sync_outbox` | صندوق البريد الصادر للمزامنة |

---

## 10. الأمان

### 11 طبقة حماية

| # | الطبقة | التفاصيل |
|---|---|---|
| 1 | **Rate Limiting** | 8 محدّدات — Auth (10/15min)، IP Block (5 violations → 30min)، PIN (8/15min) |
| 2 | **IDOR** | `ownershipGuard` على 30+ مسار DELETE + `noDirectUserAccess` |
| 3 | **SQL Injection** | فحص params ضد `['";\-\-]` والكلمات الممنوعة |
| 4 | **CSRF** | Same-Origin check في الإنتاج |
| 5 | **Session** | 60min خمول → Logout تلقائي، تجديد منزلق |
| 6 | **JWT** | HttpOnly + Secure + SameSite=Strict + تجديد 30min |
| 7 | **Cookies** | httpOnly, sameSite='strict', secure (prod) |
| 8 | **Headers** | HSTS + X-Frame-Options: DENY + X-Content-Type-Options + CSP |
| 9 | **Error** | أخطاء عامة 404/500 بدون تفاصيل داخلية |
| 10 | **Directory** | تعطيل directory listing |
| 11 | **Audit** | تسجيل LOGIN, LOGOUT, PERMISSION_DENIED, IDOR_ATTEMPT |

### الترخيص (License Enforcement)

- `isLicenseWritable()` — يمنع الكتابة إذا الترخيص منتهي/معلق/ملغى
- مسارات معفاة: `/api/settings`, `/api/license`, `/api/auth`, `/api/setup`, `/api/master`
- `Fail-open`: في حالة خطأ، يُسمح بالكتابة

---

## 11. الخادم

**الملف:** `server.ts` (961 سطر)  
**الخادم:** Express.js على port 7000

### Controllers (21 ملف)

| الملف | المسؤولية |
|---|---|
| `authController.ts` | المصادقة + JWT |
| `hrController.ts` | بيانات العمال + الحضور |
| `hrIdentityController.ts` | دعوات العمال |
| `hrSageController.ts` | تصدير Sage |
| `magasinController.ts` | المخزون + الحركات |
| `planningController.ts` | التخطيط + الحجوزات |
| `suiviController.ts` | متابعة الإنتاج |
| `posteSuiviController.ts` | محطات العمل |
| `facturationController.ts` | الفواتير + المدفوعات |
| `dashboardController.ts` | لوحة القيادة + KPIs |
| `geminiController.ts` | الذكاء الاصطناعي |
| `workersController.ts` | بيانات العمال |
| `workerSkillsController.ts` | الكفاءات |
| `workerPointageController.ts` | الحضور |
| `schedulingController.ts` | الجدولة المتقدمة |
| `catalogController.ts` | كتالوج الأوقات |
| `subcontractController.ts` | المقاولة |
| `productionController.ts` | خطوط الإنتاج |
| `userController.ts` | إدارة المستخدمين |
| `modelController.ts` | نماذج المنتجات |
| `licenseController.ts` | الترخيص |
| `settingsController.ts` | الإعدادات |
| `permissionsController.ts` | الصلاحيات |
| `errorController.ts` | تقارير الأعطال |
| `masterController.ts` | واجهة BERA MASTER |
| `profileController.ts` | الملف الشخصي |
| `setupController.ts` | الإعداد الأول |
| `workspacesController.ts` | مساحات العمل |

### Middleware (الوسائط)

| الملف | الوظيفة |
|---|---|
| `middleware.ts` | JWT auth + sliding refresh + session tracking + param sanitization |
| `auditLogger.ts` | تسجيل الأحداث الأمنية |
| `securityAgent.ts` | 7 وكلاء أمن (Rate Limiter, Auth Guard, UUID Validator, Error Handler, HTTPS Enforcer, Session Manager, CSRF Shield) |
| `uuidUtils.ts` | توليد والتحقق من المعرفات |
| `jwtConfig.ts` | إعدادات JWT |
| `licenseGuard.ts` | حماية الترخيص |

---

## 12. المكدس التقني

| الطبقة | التقنية |
|---|---|
| **الواجهة** | React 19 + TypeScript + Vite 8 |
| **التصميم** | Tailwind CSS (CDN) + Framer Motion + Recharts + Lucide Icons |
| **الخادم** | Express.js (port 7000) |
| **قاعدة البيانات** | SQLite (better-sqlite3, WAL mode) |
| **المصادقة** | JWT في httpOnly cookies |
| **الذكاء الاصطناعي** | Google Gemini API (server-side) |
| **المزامنة السحابية** | Supabase (user_data + Broadcast) |
| **التشفير** | vite-plugin-javascript-obfuscator (إنتاج) |
| **البريد** | Nodemailer (SMTP) |
| **التقارير** | ExcelJS + XLSX |

### أوامر التطوير

```bash
npm run dev            # Vite (port 5173)
npm run dev:app        # Express (port 7000)
npm run type-check     # TypeScript
npm run build          # بناء مع تشفير
npm run electron:build:win  # EXE ويندوز
```

### متغيرات البيئة الرئيسية

```env
JWT_SECRET=           # مطلوب إجباري
GEMINI_API_KEY=       # مطلوب للـ AI
SMTP_*                # مطلوب للبريد
SUPABASE_URL=         # للمزامنة السحابية
SUPABASE_ANON_KEY=    # للمزامنة السحابية
COOKIE_SECURE=true    # HTTPS فقط
HELMET=true           # رؤوس الأمان
```

---

**النهاية.** هذا المستند يغطي كل page, route, component, API, table, security layer في نظام BERAMETHODE.
