# CLAUDE.md — BERAMETHODE

## ⚠️ قاعدة مطلقة: اللغة الإجبارية ⚠️

- تحدّث مع المستخدم (Soulaimane Berraadi) **بالدارجة المغربية فقط**.
- ممنوع الجواب بالإنجليزية أو الفرنسية إلا إذا طُلب صراحة.
- المصطلحات التقنية (API, JWT, SQLite, HMAC, RLS) تبقى بالإنجليزية داخل النص بالدارجة.

---

## ⚠️ قواعد العمل الإضافية ⚠️

1. **استعمال المهارات (Skills):** في كل مهمة، شوف واش كاينة مهارة مناسبة وتستعملها.
2. **توفير الـ Tokens:** خدم بطريقة اقتصادية — Grep/Glob عوض قراءة ملفات كاملة، أجوبة مركّزة.
3. **الخريطة (Blueprint):** راجع `BERAMETHODE_BLUEPRINT.md` قبل المهام الكبيرة.
4. **البورت 7000 محلياً (إلزامي):** الخدمة على السيرفر المحلي يكون على البورت **7000** بشكل إجباري. تأكد من أن جميع إعدادات السيرفر تستخدم `localhost:7000` أو `127.0.0.1:7000` عند التطوير المحلي.
5. **البيانات الأوتوماتيكية:** فلو البيانات الأوتوماتيكي يجب أن يكون شغّال بشكل إجباري. تأكد من أن جميع البيانات تتدفق بشكل آلي بين الخادم والواجهة دون تدخل يدوي.

---

## نظرة عامة

**BERAMETHODE** نظام ERP للصناعات النسيجية في المغرب. يدير: حساب التكاليف، التخطيط الإنتاجي، المخازن، الموارد البشرية، الفوترة، ومتابعة الإنتاج.

> **مشروع مكمّل:** `Bera-master-admin` (مشروع 2) يدير التراخيص وينجّل المفاتيح لهاد المشروع.

## المكدّس التقني

| الطبقة | التقنية |
|---|---|
| الواجهة | React 19 + TypeScript + Vite 8 |
| التصميم | Tailwind CSS (CDN) + Framer Motion + Recharts + Lucide Icons |
| الخادم | Express.js (port 8000) |
| قاعدة البيانات | SQLite (better-sqlite3, WAL mode) |
| المصادقة | JWT في httpOnly cookies |
| الذكاء الاصطناعي | Google Gemini API (server-side فقط) |
| المزامنة السحابية | Supabase (`user_data` + Broadcast) |
| التشفير | `vite-plugin-javascript-obfuscator` في وضع الإنتاج |

## أوامر التطوير

```bash
npm install
npm run dev          # Vite dev server (port 5173) — واجهة فقط
npm run dev:app      # Express server (port 7000) — خادم + قاعدة بيانات
npm run type-check   # TypeScript بدون emit
npm run build        # بناء للإنتاج (مع تشفير الكود)
npm run build:static # بناء بدون تشفير (لـ Vercel)
npm run start        # تشغيل خادم الإنتاج
```

> **ملاحظة:** عند التطوير، شغّل `npm run dev` + `npm run dev:app` مع بعض. Vite يحوّل طلبات `/api` للخادم على البورت 7000.

## البنية

### الواجهة الأمامية

```
App.tsx                    # المكون الرئيسي (1642 سطر) — التوجيه + تحميل كسول
index.tsx                  # نقطة الدخول — AuthProvider + LicenseProvider
constants.ts               # الترجمات (dr/fr/en/es) + fmt()
types.ts                   # تعريفات TypeScript (1047 سطر)
app/constants.ts           # ترجمات المستوى + ترتيب التنقل + الافتراضيات
app/AppHeader.tsx          # شريط التنقل العلوي
```

### المكتبات (`lib/`)

| الملف | الوظيفة |
|---|---|
| `bootSequence.ts` | تسلسل الإقلاع: مصادقة + تحميل البيانات بالتوازي |
| `methodesEngine.ts` | محرك حساب التكاليف والطرق |
| `sageTimeRules.ts` | قواعد أوقات Sage ERP |
| `suggestionTempsCatalogue.ts` | اقتراح الأوقات المعيارية |
| `suiviContextResolver.ts` | حل سياق متابعة الإنتاج |
| `dataIdentity.ts` | بنا snapshots لعزل البيانات |

### الخادم (`server/`)

**المتحكمات (Controllers):**

| الملف | domaine |
|---|---|
| `authController.ts` | المصادقة + إعادة تعيين كلمة المرور |
| `hrController.ts` | بيانات العمال + الحضور + الإنتاج + المخصصات |
| `hrIdentityController.ts` | دعوات العمال + الهوية |
| `hrSageController.ts` | تصدير Sage |
| `magasinController.ts` | المخزون + الحركات + الطلبات |
| `planningController.ts` | التخطيط + الحجوزات |
| `facturationController.ts` | الفواتير + إيصالات التسليم + المدفوعات |
| `suiviController.ts` | متابعة الإنتاج |
| `posteSuiviController.ts` | متابعة محطات العمل |
| `dashboardController.ts` | KPIs |
| `geminiAi.ts` / `geminiController.ts` | الذكاء الاصطناعي |
| `workersController.ts` | بيانات العمال |
| `workerSkillsController.ts` | مصفوفة الكفاءات |
| `workerPointageController.ts` | سجل الحضور |
| `schedulingController.ts` | الجدولة المتقدمة |
| `catalogController.ts` | كتالوج الأوقات |
| `subcontractController.ts` | الاستعانة بمthird parties |
| `productionController.ts` | خطوط الإنتاج |
| `userController.ts` | إدارة المستخدمين |
| `supabaseSync.ts` / `supabaseRealtime.ts` | المزامنة السحابية |

**核心:** `db.ts` — تهيئة SQLite + migrations (1287 سطر)

### الكومونونات (`components/`)

67 ملف. أهمها:

| المكون | الوحدة |
|---|---|
| `VueGenerale.tsx` | نظرة عامة |
| `Dashboard.tsx` | لوحة القيادة |
| `ModelWorkflow.tsx` | الهندسة + ورشة الطرق |
| `Atelier.tsx` | ورشة الإنتاج |
| `Library.tsx` | المكتبة |
| `LaCoupe.tsx` | القص |
| `Effectifs.tsx` | التأثيرات |
| `GESTION-RH.tsx` | الموارد البشرية |
| `Planning.tsx` | التخطيط |
| `SuiviProduction.tsx` | متابعة الإنتاج |
| `RendementBoard.tsx` | العائد |
| `Magasin.tsx` | المخازن |
| `StockExport.tsx` | التصدير |
| `Facturation.tsx` | الفوترة |
| `Configuration.tsx` | الإعدادات |
| `PageMachine.tsx` | متابعة الآلات |
| `Machin.tsx` | كتالوج الآلات |
| `CatalogueTemps.tsx` | كتالوج الأوقات |
| `TasksAndHR.tsx` | الأهداف |
| `SousTraitance.tsx` | الاستعانة بمthird parties |
| `Profil.tsx` | الملف الشخصي |

### قاعدة البيانات

**SQLite:** `database.sqlite` (WAL mode)

**الجداول الرئيسية:**

| الجدول | الوظيفة |
|---|---|
| `users` | مستخدمي النظام |
| `models` | نماذج المنتجات |
| `workers` | بيانات العمال |
| `worker_skills` | مصفوفة الكفاءات |
| `worker_pointage` | سجل الحضور |
| `hr_workers` | ملفات العمال المحسّنة |
| `hr_pointage` | الحضور (مع pauses + validation) |
| `hr_production` | إنتاج العمال |
| `hr_avances` | السلفات |
| `hr_sage_exports` | تصدير Sage |
| `magasin_products` | منتجات المخزون |
| `magasin_lots` | تتبع الدُفعات |
| `magasin_mouvements` | حركات المخزون |
| `magasin_commandes` | طلبات الشراء |
| `magasin_demandes` | طلبات الورشة |
| `magasin_dechets` | النفايات |
| `planning_events` | أحداث التخطيط |
| `planning_reservations` | حجوزات المواد |
| `suivi_data` | بيانات المتابعة |
| `suivi_sorties_horaires` | الإنتاج بالساعة |
| `suivi_effectifs` | التأثيرات حسب الدور |
| `suivi_defauts` | العيوب |
| `suivi_downtimes` | أوقات التوقف |
| `downtime_codes` | أسباب التوقف |
| `poste_suivi` | متابعة محطات العمل |
| `demandes_appro` | طلبات الإمداد |
| `production_lines` | خطوط الإنتاج |
| `production_daily` | الإنتاج اليومي |
| `subcontract_orders` | أوامر الاستعانة بمthird parties |
| `system_audit_logs` | سجل التدقيق |
| `platform_person` | الهوية الشاملة |
| `hr_worker_person` | ربط العمال بالهويات |
| `hr_invitation` | دعوات العمال |
| `app_settings` | إعدادات المستخدمين |
| `verification_codes` | أكواد إعادة التعيين |

**Supabase (سحابي):**

| الجدول | الوظيفة |
|---|---|
| `user_data` | مزامنة بيانات localStorage |
| `announcements` | الإعلانات (يقرأها BERAMETHODE) |

## التكامل مع Bera-master-admin (نظام التراخيص)

### تدفق الترخيص

1. **المالك يولّد مفتاح** في Bera-master-admin → `BERA-XXXX-XXXX-XXXX` → HMAC-SHA256 → مخزّن في `licenses`
2. **BERAMETHODE يتحقق** عبر Edge Function `verify-license` → يفحص التوقيع + الحالة + الانتهاء
3. **الإنفاذ** (فقط إذا `VITE_LICENSE_ENFORCE=true`):
   - الوحدات غير المسموحة → مخفية من التنقل (`bera_nav_config.hidden`)
   - منتهي/معلق/ملغى → بانر "قراءة فقط"
   - `max_workers` → القيمة متوفرة لكن **لم يتم تطبيقها بعد** (TODO)
   - أزرار الحفظ/الإضافة/الحذف **لم يتم تعطيلها بعد** (TODO)

### مزامنة وحدات التنقل

مفاتيح `ALL_MODULES` في `LicenseContext.tsx` يجب أن تتطابق مع:
- `app/constants.ts` → `defaultNavOrder`
- `src/lib/modules.ts` في Bera-master-admin

**القائمة الحالية (22 + legacy + profil):**
```
vuegenerale, dashboard, ingenierie, atelierProd, library, coupe, effectifs, gestionRh,
planning, suivi, rendement, magasin, export, facturation, config, pageMachine, machin,
objectifs, sousTraitance, admin, profil, atelier
```

`profil` لا يُخفى أبداً (دوماً متاح).

### المزامنة السحابية

- **العملية:** `cloudSync.ts` → 16 مفتاح في localStorage → UPSERT إلى `user_data`
- **القناة:** Supabase Broadcast (Realtime)
- **المعالجة:** صور base64 → رفع إلى `bera-assets` أو ضغط inline

## متغيرات البيئة

### `.env` (Frontend)
- `VITE_STATIC_MODE=true` — وضع Vercel (بدون Express)
- `VITE_LICENSE_ENFORCE=true` — تفعيل إنفاذ التراخيص

### `.env` (Backend)
- `JWT_SECRET` — **مطلوب**. توليد: `openssl rand -base64 32`
- `GEMINI_API_KEY` — مفتاح Gemini (مfeatures features)
- `SMTP_HOST/PORT/USER/PASS/SECURE` — إعدادات البريد
- `HR_SAGE_ROUNDING`, `HR_SAGE_WORKDAY_START`, `HR_SAGE_APPLY` — تعديلات Sage
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — Supabase (للمزامنة)
- `COOKIE_SECURE=true` — cookies آمنة فقط
- `HELMET=true` — تفعيل Helmet headers
- `BERAMETHODE_NO_HMR` — تعطيل HMR
- `ALLOW_RESET_DEV_CODE=true` — إرجاع أكواد إعادة التعيين (تطوير فقط)

## الترجمات

4 لغات في `constants.ts`: **Darija** (dr) + **Français** (fr) + **English** (en) + **Español** (es)

مستوى إضافي في `app/constants.ts`: **Français** (fr) + **العربية** (ar)

## أنماط التصميم الرئيسية

1. **توجيه بالتحكمات:** كل domain له controller يصدّر CRUD functions
2. **مصادقة Middleware:** `authenticateToken` للمسارات المحمية
3. **معالجة الأخطاء:** controllers ترجع JSON + status codes
4. **متعدد اللغات:** كل النصوص في `constants.ts` تحت مفتاح اللغة
5. **حساب التكاليف:** صيغة "Prix de Revient": مواد + يد عاملة + هامش المصنع + ضريبة + هامش الورشة
6. **Gemini:** استدعاءات غير متزامنة، try-catch إجباري

## ملاحظات مهمة

- **النسيج:** فهم المصطلحات الفرنسية في النسيج وممارسات العمل المغربية يساعد في التسمية
- **SQLite Concurrency:** WAL mode مفعّل — القراءات لا تمنع الكتابات
- **Gemini Integration:** استدعاءات async، لازم try-catch + rate limits
- **الإنتاج:** `NODE_ENV=production` يفعّل Helmet + rate limiting + تحسين البناء
- **لا تنشر هذا المشروع على الإنترنت** بدون حماية — يحمل JWT secrets + Gemini key
