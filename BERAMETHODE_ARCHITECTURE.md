# BERAMETHODE — المرجع المعماري الموحّد

> وثيقة ماستر تجمع ثلاث خطط منفصلة في مرجع واحد شامل.
> **آخر تحديث:** 2026-06-17 · **المؤلف:** Soulaimane Berraadi (تصوّر) + توثيق تقني.
> **الجمهور:** المالك + أي مطوّر يشتغل على المشروع لاحقاً.

---

> ⚠️ **قاعدة ذهبية:** الدقّة = الرزق. الحسابات مالية حرجة. كل تغيير يُختبَر قبل التالي. لا refactor كبير بلا backend حيّ للاختبار. بعد كل مرحلة: `npm run type-check` + اختبار يدوي + commit.

---

## الفهرس

- [القسم 0 — ما تـمّ إنجازه (2026-06-16)](#0-ما-تمّ-إنجازه)
- [القسم 1 — الرؤية العامة](#1-الرؤية-العامة)
- [القسم 2 — المبادئ المعمارية الأساسية](#2-المبادئ-المعمارية-الأساسية)
- [القسم 3 — نموذج البيانات المركزي (USER → شركة → هرمية)](#3-نموذج-البيانات-المركزي)
- [القسم 4 — خارطة الطريق التنفيذية (المراحل 0→10)](#4-خارطة-الطريق-التنفيذية)
- [القسم 5 — المراجعة الأمنية الشاملة](#5-المراجعة-الأمنية-الشاملة)
- [القسم 6 — نموذج النشر (Deployment)](#6-نموذج-النشر)
- [القسم 7 — Bera Master Admin (نظام التراخيص والتحكم)](#7-bera-master-admin)
- [القسم 8 — Plan B / الصمود (Graceful Degradation)](#8-plan-b--الصمود)
- [القسم 9 — الرؤية بعيدة المدى (ما بعد MVP)](#9-الرؤية-بعيدة-المدى)
- [القسم 10 — مراجع التصميم + جوانب منسية + ما لا يُكسر](#10-مراجع-شاملة)
- [روابط المصادر](#روابط-المصادر)

---

## 0. ما تـمّ إنجازه (2026-06-16)

### 0.1 إصلاحات Egress (مطبّقة، type-check ناجح، منشورة على Vercel)

**السبب الجذري للحادثة:** منظّمة Supabase Free تجاوزت سقف Egress = 5 GB (وصلت 9.485 GB = 190%). مصدران:
1. المتصفّح — `pullSnapshotFromCloud` كان ينزّل الـ blob كامل (~2.2 MB) في كل boot، حتى بلا تغيير.
2. السيرفر (الأكبر) — `server/supabaseRealtime.ts` كان يستعمل `postgres_changes` على `user_data` → Supabase يبعث الصفّ كامل (~2.2 MB) عبر WebSocket في كل كتابة + عاصفة reconnect كل ~5-10s.

**الكود المصلَح:**
- `src/lib/cloudSync.ts` — pull شرطي: يقرأ `updated_at` (~30 بايت) قبل تنزيل الـ blob؛ ينزّل فقط إذا تغيّر + `LAST_PULLED_AT_KEY`.
- `server/supabaseRealtime.ts` — استبدال `postgres_changes` بـ **Broadcast** + pull شرطي (`pullAndMerge`) + safety interval (5 دقائق) + reconnect backoff تصاعدي محدود بـ 5 دقائق.
- `src/lib/supabaseClient.ts` — `realtime.reconnectAfterMs` تصاعدي → حلّ فيضان الـ console (~50k رسالة).

**قاعدة البيانات (عبر MCP):**
- `ALTER PUBLICATION supabase_realtime DROP TABLE public.user_data` (إيقاف فك WAL).
- migration `optimize_rls_initplan_auth_calls` — لفّ `auth.uid()/auth.jwt()` في `(select …)` (9 سياسات).
- migration `revoke_public_execute_on_internal_functions` — REVOKE EXECUTE على `rls_auto_enable()` + `touch_ticket_on_message()`.
- `VACUUM (FULL, ANALYZE) public.user_data` → 11 MB ⟶ 3.67 MB.
- إنشاء bucket `bera-assets` + سياسات Storage (`supabase_storage_setup.sql`).

**الأثر المتوقّع:** egress من ~9.5 GB/أيام ⟶ ~1–1.5 GB/شهر → مريح داخل المجّاني.

### 0.2 مشروع Supabase الجديد (الجسر المؤقّت)

- مشروع جديد `utrojjhscyatppgcszrt` مُعدّ ومؤمَّن (RLS محسّن، user_data خارج Realtime publication، bucket bera-assets، جداول support، advisor نظيف ما عدا Leaked Password Protection اليدوي).
- **جسر مؤقّت حتى 12 يوليوز 2026** ثم العودة للقديم (أو التأكيد على الجديد). التبديل بمتغيّرات البيئة فقط.

### 0.3 المصادقة المحلية موجودة (Plan B الأهمّ محقّق)

**اكتشاف جوهري:** المصادقة المحلية موجودة بالكامل في وضع Express:
- `server/authController.ts` = login/register عبر bcrypt + JWT cookie + SQLite `users`، صفر اعتماد على Supabase.
- الـ **.exe (وضع Express) يدخل محلياً حتى بلا إنترنت/سحابة.**
- العطل وقع فقط لأن نسخة الويب (Vercel static، `VITE_STATIC_MODE=true`) تستعمل Supabase auth حصرياً.
- **الإجراء = أولوية شحن الـ .exe، ماشي كتابة كود مصادقة جديد.**

---

## 1. الرؤية العامة

**BERAMETHODE** = نظام ERP للصناعة النسيجية بالمغرب، يُوزَّع كـ **تطبيق سطح مكتب (.exe)** يُباع لعدّة شركات. كل شركة مستقلّة، والسحابة دور **ثانوي** (جسر + ترخيص + backup).

**الفلسفة:** Local-First — البرنامج يخدم على البيانات المحلية، والسحابة إضافة ماشي شرط. تقطع الإنترنت → البرنامج يكمّل.

```
┌─ شركة A ──────────────┐     ┌─ شركة B ──────────────┐
│  PC الأدمين (سيرفر)   │     │  PC الأدمين (سيرفر)   │
│  Express :7000 + SQLite│     │  Express :7000 + SQLite│
│   ▲   ▲   ▲ (LAN/WiFi) │     │   ▲   ▲               │
│  عامل عامل عامل        │     │  عامل عامل            │
└────────┬──────────────┘     └────────┬──────────────┘
         │                             │
         └──────── سحابة خفيفة ──────────┘
            (جسر للبعيد + backup + ترخيص)
                         │
             Bera-master-admin (تراخيص + fleet control)
```

**الحالي:** BERAMETHODE يعمل web app + وضع Express (EXE قيد البناء). كل مستخدم معزول بـ `owner_id`.

**الهدف النهائي:**
1. تطبيق Desktop قابل للتثبيت (EXE) — offline-first، SQLite محلي أساسي، Supabase مرآة.
2. Onboarding wizard عند أول تشغيل (شركة + admin).
3. نظام صلاحيات هرمي متعدد المستخدمين (الباترون = الشركة).
4. ثيم (Dark/Light/System) + لغات كاملة.
5. Bera Master — لوحة مركزية (أعطال + عملاء + إصدارات + تراخيص).
6. تحديثات تلقائية.

**القرارات المعتمدة:**

| القرار | الاختيار |
|--------|---------|
| نموذج الشركة | حساب الباترون = جذر الشركة (owner_id) |
| البدء | الصلاحيات الهرمية أولاً |
| مستوى الإخفاء | صفحات + حقول من البداية |
| تقارير الأخطاء | Bera Master + إيميل + صفحة ويب |
| التحديثات | GitHub Releases + electron-updater |
| المنصة | Windows أولاً ثم Mac/web |
| Code signing | بدون توقيع في MVP (SmartScreen يدوي) |
| مخرجات البناء | `C:\Users\HP\3D Objects\beramethode exe` |

---

## 2. المبادئ المعمارية الأساسية

### 2.1 Local-First
الجهاز هو مصدر الحقيقة (SQLite محلي). السحابة طاحت → البرنامج يكمّل، المزامنة تُستأنف عند الرجوع. **السحابة لا تُوقِف العمل أبداً.**

### 2.2 الأدمين = سيرفر · العامل = client
- **الأدمين:** تطبيق ثقيل (Electron) فيه Express :7000 + SQLite → سيرفر الشركة، يحمل الاتحاد الكامل للبيانات.
- **العامل:** client خفيف (Capacitor mobile / web) يتّصل بسيرفر الأدمين عبر LAN أو السحابة.

### 2.3 Delta Sync (تدريجي، بناء مخصّص)
بدل بعث الـ snapshot الكامل، نبعث فقط الصفوف اللي تبدّلت:
- كل كيان = صفّ مستقل بـ `id`, `updated_at`, `deleted_at`.
- الجهاز يتذكّر `last_synced_at` ويجلب `WHERE updated_at > last_synced_at`.
- الأساس موجود: `__schema_version` + `migrateSnapshot` (`dataVersion.ts`).
- **ملاحظة:** «Outbox sync» في المرحلة 7 = الخطوة العملية الأولى. Delta-sync على جداول حقيقية كاملة = أبعد (القسم 9).

### 2.4 الوسائط في Buckets (ماشي inline)
الصور تُرفع لـ Storage (`bera-assets`) وتُخزَّن كـ **رابط** بدل base64 داخل الـ blob → الـ blob من ~2.2 MB ⟶ ~0.3 MB. (الكود يدعمه أصلاً؛ الـ bucket أُنشئ في 2026-06-16.)

### 2.5 RBAC عبر RLS (صلاحيات مفروضة في قاعدة البيانات)
الصلاحيات في الواجهة وحدها هشّة. الهدف: فرضها بـ RLS على مستوى الـ DB:
- `partition_id` / `role` لكل صفّ → سياسة SELECT تكشف القسم المسموح.
- أمان حقيقي لا يُتجاوَز حتى بالـ anon key.

### 2.6 الحذف بالملكية + Tombstones (نموذج WhatsApp)
- كل صفّ عندو `created_by` (الصاحب).
- يمسح فقط ما عمّر هو — RLS: `using ((select auth.uid()) = created_by)`.
- الحذف = soft delete (علامة `deleted_at`/tombstone، الصفّ يبقى مخفي ماشي ممحو).
- نافذة استرجاع قابلة للضبط (15 دقيقة / 1h) → Corbeille. بعدها purge حقيقي.
- الأساس موجود: `apiShim.ts` (tombstones + `beraCorbeille` + `purgeExpiredTombstones`).

### 2.7 Multi-Transport (LAN-first + جسر سحابي)
- نفس الشبكة: الأجهزة تزامن مباشرة مع سيرفر الأدمين المحلي (LAN) — سريع، بلا إنترنت.
- جهاز بعيد / شبكة مختلفة: يبدّل للجسر السحابي تلقائياً.
- منطق الاختيار: جرّب LAN (mDNS/discovery) → إن فشل → سحابة.

### 2.8 طبقات الـ Backup
1. Local export (زرّ → ملف) — فوري، الأساس.
2. Git/GitHub (repo خاص) — للنصّ (JSON): تاريخ كامل + diff + استرجاع أي تاريخ.
3. Google Drive (المالك) — backups/أرشيف ثقيل (نموذج WhatsApp: على حساب المستخدم).
- الصور ماشي في Git (تضخّم) → Storage/Drive.
- **Backup إجباري** لأن PC الأدمين = نقطة فشل وحيدة.

### 2.9 استقلالية المزوّد (Config Indirection)
لا تكتب عنوان السحابة في الكود. البرنامج يجلب إعداد الـ backend من نقطة ثابتة تتحكّم فيها. تبديل المزوّد = تعديل نقطة واحدة، بلا إعادة تثبيت.

### 2.10 توافق النسخ + التحديثات
- تحديث بموافقة الأدمين (electron-updater notify mode).
- تغييرات إضافية فقط + `schema_version` + قراءة متسامحة + migrations.
- التحكّم في «النسخة الدنيا المدعومة» عبر Bera-master-admin.

---

## 3. نموذج البيانات المركزي

> الأساس الفكري لكل المشروع. يبدأ من USER، ومنه تُعرَّف الشركة والهرمية تحتها، وكل البيانات مِلك الشركة لا الفرد.

### المستوى 0 — USER (الأساس، يبقى مدى الحياة)
- كل شخص = حساب USER (Gmail + كلمة سر) + profile شخصي يبقى معه حتى لو غادر الشركة.
- عند أول تسجيل: بياناته خاصة به وحده (نطاق `private`). ثم إما يصبح باترون (شركة)، أو يبقى مستقلاً.

الجداول:
- `users` (موجود): `id, email, password, name, role(global: user/admin), status(active|suspended)`
- `user_profiles` (جديد): `user_id, phone, photo, métier, bio...` — معلومات شخصية تتبع الشخص لا الشركة.

### المستوى 1 — من USER إلى PATRON (تعريف الشركة)
- عند Setup Wizard (أول تشغيل)، الـ USER يصبح PATRON ويُنشئ الشركة.
- **الشركة = `owner_id` (= users.id ديال الباترون)** — مفتاح المستأجر (tenant).
- `company_settings` (موجود) = اسم/شعار/تخصص الشركة.

### المستوى 2 — الهرمية تحت الشركة
```
ADMIN  (super-admin — أنت)
  └─ PATRON  (= الشركة، owner_id، يرى كل بيانات شركته)
       ├─ MÉTHODE     (يعدّل الموديل، يرى التكلفة)
       ├─ CHRONO      (القياس الزمني)
       ├─ COMMERCIAL  (الفواتير، لا الأجور)
       ├─ RH          (العمّال والأجور)
       ├─ CAF · chef de chaîne · transport ... (قابل للإضافة + ترتيب)
       └─ USER        (دور افتراضي محدود)
```
- `company_roles` (هرمية قابلة للتخصيص: `name, level, parent_role_id`)
- `company_members` (ربط: `user_id → owner_id الشركة + role_id + status active/removed`)
- `role_permissions` (صفحة/حقل × view/edit)
- `member_permission_overrides` (استثناءات شخصية)

### المستوى 3 — إعادة تنظيم البيانات (الجوهر)

**التحوّل المطلوب:** البيانات تنتقل من مِلك الفرد إلى مِلك الشركة.

| العمود | المعنى | الغرض |
|--------|--------|-------|
| `owner_id` | الشركة (= باترون id) | تقاسم البيانات بين كل أعضاء الشركة |
| `created_by` | الفرد الذي أنشأ السجل (user_id) | audit: "من أنشأ هذا الموديل" |
| `updated_by` | آخر مُعدِّل | audit التعديلات |
| `created_at` / `updated_at` | التواريخ | السجل الزمني |

**الحالي:** `owner_id = req.user.id` (الفرد) → كل واحد جزيرة.
**الجديد:**
1. middleware يحقن `req.companyId` = الشركة التي ينتمي لها العضو (resolve من `company_members`).
2. الـ controllers تستعمل `req.companyId` للـ `owner_id` + `req.user.id` للـ `created_by`.
3. النتيجة: موديل أنشأه méthode → owner_id = الشركة → يراه الباترون، بينما chef de chaîne محجوب حسب الصلاحية.

### نطاقات البيانات الثلاثة (Data Scopes)

| النطاق | لمن | الوصف |
|--------|-----|-------|
| **خاص (Private)** | الافتراضي عند أول تسجيل | بيانات الفرد وحده — `scope='private'`, owner = user id |
| **شركة (Company)** | موظف في شركة | مِلك الشركة، هرمية + صلاحيات — `scope='company'`, owner = باترون id |
| **مجتمع (Community)** | مستخدم مستقل | يشارك بياناته مع مستقلين آخرين في مجتمع مهني |

### جداول المجتمع (Community)
```sql
CREATE TABLE communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by INTEGER NOT NULL,
  visibility TEXT DEFAULT 'private',  -- private(بدعوة) | public(انضمام حر)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE community_members (
  community_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'member',         -- owner | moderator | member
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (community_id, user_id)
);
-- مشاركة عنصر محدد (نظيف — لا يلوّث كل الجداول)
CREATE TABLE shared_resources (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,        -- 'model' | 'catalogue_temps' | ...
  resource_id TEXT NOT NULL,
  shared_by INTEGER NOT NULL,
  access TEXT DEFAULT 'view',         -- view | copy(fork)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### نموذج البيانات للكيانات (الهدف)
```
<entity> (models, workers, suivi, magasin, planning, ...)
  ├── id            (PK)
  ├── owner_id      (الشركة / workspace — مفتاح الـ tenant)
  ├── created_by    (الفرد الصاحب — للحذف بالملكية + audit)
  ├── updated_by    (آخر مُعدِّل)
  ├── partition_id  (القسم/الدور — للرؤية)
  ├── data          (محتوى الكيان)
  ├── updated_at    (للـ delta sync) + trigger
  ├── deleted_at    (tombstone / soft delete)
  └── shared_with_broker (bool — لطبقة السمسار)
```

### دورة الحياة (Lifecycle)
```
USER ينضم لشركة (دعوة hr_invitation) → member(active) → يرى بيانات الشركة حسب دوره
USER يغادر → member(status='removed') → ينقطع وصوله، يحتفظ بـ profile فقط
USER ينضم لشركة أخرى → دورة جديدة، نفس profile الشخصي
```
البيانات التي أنشأها العضو تبقى مِلك الشركة (owner_id) — لا تُحذف بمغادرته. فقط وصوله يُقطع.

---

## 4. خارطة الطريق التنفيذية

> **العمود الفقري للتنفيذ القريب.** الخطّة 2 (la-proji-dyli-hdxi-lively-anchor) هي المرجع التنفيذي. المراحل 0→10 مرتّبة ومتسلسلة.

### ملخّص المراحل

| المرحلة | العنوان | المحتوى المختصر | يعتمد على |
|---------|---------|-----------------|-----------|
| **0** | التأسيس الأمني | C1 (JWT secret) · C2 (electron-rebuild) | — |
| **1** | Desktop / EXE | db paths · setup/error controllers · Setup.tsx · Electron shell · أول EXE | 0 |
| **2** | أمان Desktop | 127.0.0.1 · setup guard 403 · tsup bundle | 1 |
| **3** | الصلاحيات (م1) | الأدوار · resolver · PermissionsManager · Profile | 1 |
| **4** | Quick Wins | View As · إخفاء ذكي · قوالب الأدوار | 3 |
| **5** | الثيم | Dark / Light / System | 1 (مستقل) |
| **6** | الصلاحيات (م2) + أمان Multi-Tenant | companyId · تحويل controllers · lifecycle · **سدّ ثقوب الخطّة 1** · IDOR tests | 3 |
| **7** | السحابة + RLS + Outbox | RLS · worker endpoints · Outbox sync · backup | 6 |
| **8** | Bera Master | Fleet Health · Crash dedup · ترخيص بالمقاعد | 7 |
| **9** | اللغات الكاملة | استخراج + Gemini translate (تدريجي) | مستمر |
| **10** | التحديثات + التوقيع | electron-updater · (مستقبلاً) EV cert | 2 |

---

### المرحلة 0 — التأسيس الأمني (بلوكرات) 🔴

**الهدف:** سدّ البلوكرين قبل أي بناء EXE.

#### C1 — JWT_SECRET في Electron
`jwtConfig.ts` يوقف العملية إذا JWT_SECRET ناقص. EXE ما عندوش `.env` → السيرفر يموت → شاشة بيضاء.

**الحل (في `electron/main.ts`):**
```typescript
const secretFile = path.join(app.getPath('userData'), '.secret');
let jwtSecret = fs.existsSync(secretFile) ? fs.readFileSync(secretFile,'utf8') : '';
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(48).toString('base64');
  fs.writeFileSync(secretFile, jwtSecret);
}
// يُمرَّر في fork: env: { JWT_SECRET: jwtSecret, ... }
```

#### C2 — better-sqlite3 ABI rebuild
الـ native module مبني لـ Node، Electron عندو ABI مختلف → ينهار.
**الحل:** `@electron/rebuild` → `electron-rebuild -f -w better-sqlite3` قبل electron-builder.

**التحقق:** EXE تجريبي يفتح بدون شاشة بيضاء + SQLite يشتغل.

---

### المرحلة 1 — Desktop / EXE 📦

**الهدف:** تحويل المشروع لتطبيق Desktop + Onboarding، وإنتاج أول EXE.

#### 1.1 — `server/db.ts` (مسار ديناميكي + جداول)
```typescript
const dbPath = process.env.BERA_DB_PATH || path.join(process.cwd(), 'database.sqlite');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
```
+ جدولان جديدان: `company_settings` (CHECK id=1) + `crash_reports`.

#### 1.2 — `server/setupController.ts` (جديد)
- `GET /api/setup/status` → `{ initialized }`
- `POST /api/setup/init` → شركة + أول مستخدم role='admin' (مع guard المرحلة 2)

#### 1.3 — `server/errorController.ts` (جديد)
- `POST /api/errors/report` · `GET /api/errors/reports` (admin) · `PUT /api/errors/reports/:id/resolve`

#### 1.4 — `server/authController.ts` (تعديل سطر)
أول مستخدم في DB → `role='admin'`.

#### 1.5 — Frontend
- `components/Setup.tsx` (جديد، 3 خطوات: ترحيب → بيانات شركة → admin)
- `components/ErrorBoundary.tsx` (تعديل الموجود): إضافة `fetch('/api/errors/report')` في `componentDidCatch`
- `App.tsx`: setup check (`setupDone` state) + إصلاح navigation (سطر 1028)

#### 1.6 — `electron/main.ts` + `electron/preload.ts` (جديد)
fork للـ Express (يمرّر BERA_DB_PATH + JWT_SECRET) + BrowserWindow + findFreePort + DevTools فقط `!app.isPackaged`.

#### 1.7 — `package.json` + `vite.config.ts`
- deps: electron, electron-builder, electron-updater, concurrently, @electron/rebuild
- scripts: `electron:dev`, `electron:build:win`
- build config: asar + asarUnpack(better-sqlite3) + output=`C:/Users/HP/3D Objects/beramethode exe`
- vite: `base: './'` في mode electron فقط

**التحقق:** `npm run dev:app` يشتغل → احذف DB → Setup يظهر → `npm run electron:build:win` → EXE في المجلد.

---

### المرحلة 2 — أمان Desktop 🔒

| الثغرة | الحل |
|--------|------|
| Express على 0.0.0.0 | `ELECTRON_MODE=true` → `127.0.0.1` في server.ts listen |
| تخطي Setup | guard 403 في `POST /api/setup/init` إذا setup_complete=1 |
| server.ts plain في ASAR | `tsup` يبني الـ backend (minify) قبل electron-builder |

**التحقق:** الـ API لا يُرى من جهاز آخر في الشبكة · Postman لا يعيد تشغيل setup · الكود مبني/مشوّش.

---

### المرحلة 3 — الصلاحيات الهرمية (مرحلة 1) 👥

**الهدف:** البنية التحتية للأدوار والصلاحيات + الواجهة. لا تلمس controllers موجودة (آمنة).

#### 3.1 — `server/db.ts`: 4 جداول
`company_roles` (هرمية قابلة للتخصيص) · `company_members` (عضوية + portfolio RH) · `role_permissions` (صفحة/حقل × view/edit) · `member_permission_overrides` (استثناءات).

#### 3.2 — `server/permissions/resolver.ts` (مشترك frontend+backend)
```
can(user, resource, action):
  1. override الشخص → 2. صلاحية الدور → 3. موروثة من الأب → 4. الافتراضي
```

#### 3.3 — `server/permissionsController.ts` + middleware `requirePermission`

#### 3.4 — `src/context/PermissionsContext.tsx` (`usePermissions`)

#### 3.5 — gating: الصفحات (دمج navConfig.hidden) + الحقول (`can('view','model.cout_minute')`)

#### 3.6 — `components/Profil.tsx` (إعادة بناء: profile حقيقي + زر الصلاحيات)

#### 3.7 — `components/PermissionsManager.tsx` (شجرة Device Manager + استثناءات + confirmation)

**التحقق:** باترون يخفي صفحة عن دور → تختفي · يخفي حقل → يظهر بدونه · استثناء لشخص واحد يعمل.

---

### المرحلة 4 — Quick Wins ⚡
- **View As** (الباترون يرى كما يرى الموظف)
- **إخفاء ذكي** (🔒 محجوب بدل اختفاء)
- **قوالب أدوار** (`presets.ts`: méthode/commercial/RH...)

---

### المرحلة 5 — الثيم (مستقلة، يمكن بالتوازي) 🌗
- Tailwind `darkMode:'class'` + `src/context/ThemeContext.tsx` (light/dark/system عبر matchMedia)
- مبدّل 3 خيارات في `Configuration.tsx` · تطبيق `dark:` تدريجياً

---

### المرحلة 6 — الصلاحيات (مرحلة 2) + سدّ ثقوب Multi-Tenant 🔗

> ⚠️ **هذه المرحلة تضمّ ثقوب الخطّة 1 الأمنية.** ليست عاجلة الآن (مستخدم واحد)، لكنها **إجبارية قبل onboarding أي شركة ثانية**. ثغرة 0.2 لها أيضاً بُعد egress (تصدير بيانات كل الشركات في snapshot واحد).

#### 6.1 — تحويل controllers لـ companyId
- `req.companyId` في middleware (= owner_id الشركة للأعضاء، resolve من `company_members`)
- تحويل controllers تدريجياً من `req.user.id` → `req.companyId`

#### 6.2 — سدّ ثقب 0.1 (endpoints تسرّب عمّال) 🔴
**الملف:** `server/hrController.ts`
- `getWorkerByCin()` ([hrController.ts:638](server/hrController.ts:638)) — يقرأ worker بالـ CIN بلا `owner_id` → تسريب عمّال بين الشركات.
- `getWorkerPointageToday()` / `getWorkerProductionToday()` ([hrController.ts:658](server/hrController.ts:658)) — نفس المشكل.

**الحل:** هاد الـ endpoints كيخدمو سيناريو "العامل كيدخل بالـ CIN". خاصهم يقيّدو بـ `owner_id`. نمرّرو `owner_id` (أو token دعوة/جلسة) في الـ request بدل ما نثقو غير في الـ CIN. إلا كانو فعلاً عموميين، نزيدو حقل ثاني (token/société id) يحدّد الشركة قبل أي قراءة.

#### 6.3 — سدّ ثقب 0.2 (snapshot يصدّر كل الـ tenants) 🔴 [أولوية egress أيضاً]
**الملف:** `server/supabaseSync.ts` ([buildSnapshot ~229-247](server/supabaseSync.ts:229))
- كل الـ `SELECT * FROM ...` بلا `WHERE owner_id = ?` → يصدّر بيانات كل الشركات في blob واحد.

**الحل:** نمرّرو `ownerId` (من `loadUserContext` ديال الجلسة) لـ `buildSnapshot`، ونزيدو `WHERE owner_id = ?` على كل query من الجداول اللي فيهم owner_id. الهدف: الـ blob اللي كيتسيّنك لـ Supabase يحمل **بيانات tenant واحد فقط**. (هاد الثغرة سبب إضافي لتضخّم egress.)

#### 6.4 — سدّ ثقب 0.3 (Realtime merge يكتب user_id ثابت) 🔴
**الملف:** `server/supabaseRealtime.ts` ([~75-120](server/supabaseRealtime.ts:75))
- يكتب `user_id: 1` ثابت، و `applyArrayToTable()` يدير `INSERT OR REPLACE` بلا تحقّق من `owner_id`.

**الحل:**
1. استعمال الـ `userId` اللي أصلاً متمرّر للـ merge ([line ~201](server/supabaseRealtime.ts:201)) بدل `1` الثابت.
2. في `applyArrayToTable()` نزيد تحقّق: أي صفّ وارد بـ `owner_id` مخالف للـ tenant الحالي يتّرفض (ماشي يتكتب).
3. نزيد `owner_id` متوقّع كـ metadata في الـ snapshot ونتحقّق منو قبل الكتابة.

#### 6.5 — سدّ ثقب 0.4 (جدول models يستعمل user_id legacy) 🟡
**الملفات:** `server/db.ts` ([~65-73](server/db.ts:65))، `server/modelController.ts:7`، `server/catalogController.ts:59`

**الحل:** migration idempotent: نزيدو عمود `owner_id` لـ `models` (نعمّرو من `user_id` للصفوف القديمة)، ونبدّلو القراءات لـ `WHERE owner_id = ?`.

#### 6.6 — توحيد نموذج Tenancy (المرحلة 1 من الخطّة 1)
- `owner_id` = الشركة (id الباترون) — هو الـ tenant key الرسمي.
- `loadUserContext()` ([permissionsController.ts:23](server/permissionsController.ts:23)) هو المصدر الوحيد لـ `ownerId`. قاعدة: كل query على جدول فيه owner_id خاصها تمرّ من `ownerId` ديال هاد الـ context.
- **helper موحّد** `server/tenancy.ts`: يلفّ `loadUserContext` + `requireOwner(req)` باش ماكاينش نسيان للفلترة.
- عمود `status` في `users` (`active|suspended`) لـ BERA MASTER (المرحلة 8).

#### 6.7 — مشاركة البيانات user↔user (3 أنماط)
البناء فوق الجداول الموجودة: `communities`, `community_members`, `shared_resources` ([db.ts:1487-1517](server/db.ts:1487)) — كاينين بلا controllers.

**جدول جديد** `user_share_invitations`:
- `id, from_user_id, to_email, share_mode ('resources'|'workspace'|'member'), token (UUID), code (6 أرقام), status (PENDING|CONFIRMED|REFUSED), created_at, confirmed_at`
- التأكيد متبادل: from يبعت، to يأكّد بالـ code/QR من صفحة Profil.

**Controller جديد** `server/shareController.ts`:
- `POST /api/shares` — إنشاء دعوة (يختار النمط)، يبعت إيميل + يولّد QR من الـ token.
- `GET /api/shares/preview/:token` — معاينة (public، rate-limited).
- `POST /api/shares/confirm` — تأكيد بالـ code/token → يفعّل الربط.
- `GET /api/shares` / `DELETE /api/shares/:id` — تدبير (authenticated، owner-scoped).

تطبيق كل نمط:
- **resources:** صفوف في `shared_resources` (`resource_type`, `resource_id`, `access='view'|'copy'`).
- **member:** نعيد استعمال `company_members` (نزيد الـ user للـ workspace بـ role) — موجود.
- **workspace:** «سياق نشط» — الـ user عندو workspace ديالو + workspaces مشاركة معاه، يبدّل بيناتهم من الواجهة. القراءات تفلتر بـ `ownerId` ديال السياق النشط (عزل يبقى، غير الـ context يتبدّل).

#### 6.8 — اختبارات IDOR منهجية (M1)
نخلقو 2 users (شركتين)، نزيدو عمّال/منتجات لكل وحدة، نتأكّدو:
- (أ) حتى endpoint مكيرجّعش بيانات الشركة الأخرى.
- (ب) الـ snapshot ديال كل user فيه غير بياناتو.
- (ج) merge كيرفض بيانات owner مخالف.

#### 6.9 — Lifecycle المغادرة
- `status='removed'` → قطع scope، حفظ profile.
- صفحة "المسؤولون والفريق" في Gestion RH (شجرة + حذف عضو).

---

### المرحلة 7 — السحابة + RLS + المزامنة ☁️
- **RLS (H1)** على كل جداول Supabase حسب `auth.uid()` + role
- **مراجعة worker endpoints (H2)** — PIN-gating
- **Outbox sync**: sync_outbox + idempotent + حل تعارض (آخر كتابة تربح، أو أذكى)
- نسخ احتياطي مجدول SQLite → Supabase

---

### المرحلة 8 — Bera Master (مشروع منفصل) 📊

> تفاصيل كاملة في **القسم 7** أدناه.

- `POST /api/reports` (license_key إجباري — يسدّ M5)
- لوحة Fleet Health (شركات · إصدارات · معدّل أعطال · آخر ظهور)
- Crash dedup + تصنيف خطورة
- ترخيص بالمقاعد
- Impersonation + Audit (مبني في `server/masterController.ts`)

---

### المرحلة 9 — اللغات الكاملة 🌍
- توسيع `Lang` (fr/ar + en/es/zh) + مفاتيح متداخلة + `useT()` + fallback
- مبدّل لغة + تبديل `dir` · سكربت استخراج النصوص hardcoded
- Gemini يترجم المفاتيح → مراجعة بشرية · استخراج صفحة-صفحة

---

### المرحلة 10 — التحديثات + التوقيع 🔄
- electron-updater + GitHub Releases (`git tag` + `gh release create`)
- إشعار update-available داخل التطبيق
- مستقبلاً: شهادة EV (~300$/سنة) لإزالة SmartScreen

---

## 5. المراجعة الأمنية الشاملة

### جدول الثغرات (Audit)

| الرمز | الخطورة | الثغرة | الحل | المرحلة |
|------|---------|--------|------|---------|
| C1 | 🔴 | JWT_SECRET ينهار في EXE | secret في userData | 0 |
| C2 | 🔴 | better-sqlite3 ABI | electron-rebuild | 0 |
| **0.1** | 🔴 | `hrController.ts:638,658` — endpoints تقرأ workers بلا owner_id (تسريب بين الشركات) | تمرير owner_id أو token الشركة | **6** |
| **0.2** | 🔴 | `supabaseSync.ts:229` — `buildSnapshot()` بلا WHERE owner_id → يصدّر كل الـ tenants [بُعد egress أيضاً] | تمرير ownerId من loadUserContext → WHERE owner_id = ? | **6** |
| **0.3** | 🔴 | `supabaseRealtime.ts:75` — merge يكتب `user_id: 1` ثابت + INSERT بلا تحقّق owner_id | استعمال userId المتمرّر + رفض صفوف owner مخالف | **6** |
| **0.4** | 🟡 | `db.ts:65`, `modelController.ts:7`, `catalogController.ts:59` — جدول models يستعمل user_id legacy | migration: إضافة owner_id + تعمير من user_id + تحديث queries | **6** |
| H1 | 🟠 | Supabase anon key مكشوف | RLS إجباري على كل الجداول | 7 |
| H2 | 🟠 | worker endpoints عمومية | PIN-gating | 7 |
| M1 | 🟡 | IDOR بين الشركات | owner_id backend + اختبارات منهجية | 6 |
| M2 | 🟡 | guest مضمّن معروف | تعطيل في الإنتاج | 6 |
| M3 | 🟡 | 0.0.0.0 + لا CORS | 127.0.0.1 + allowlist | 2 |
| C1-M3 | ✅ | audit trail BERA MASTER | `system_audit_logs` (شكون=MASTER, target, action, timestamp, قيم قبل/بعد) | 8 |

**نقاط قوة مؤكّدة:** SQL parameterized · JWT قوي · cookies httpOnly/sameSite · bcrypt · rate-limit · obfuscation.

> ⚠️ **تنبيه خاص:** الثغرات 0.1 → 0.4 ليست عاجلة اليوم (مستخدم واحد) لكنها **إجبارية قبل onboarding أي شركة ثانية.** ثغرة 0.2 لها بُعد مزدوج: أمني (تسريب) + egress (تضخّم).

---

## 6. نموذج النشر (Deployment)

| المنصّة | التقنية | الحجم التقريبي | الدور |
|---|---|---|---|
| Windows `.exe` | Electron (بديل: Tauri ~10MB) | ~70–120 MB | الأدمين (سيرفر كامل) |
| Mac `.dmg` | Electron / Tauri | ~80–150 MB / ~10MB | الأدمين |
| Android `.apk` | Capacitor | ~10–25 MB | العامل (client) |
| iOS `.ipa` | Capacitor | ~15–30 MB | العامل (client) |

> كود BERAMETHODE الصافي ≈ 4 MB. الباقي = المحرّك (Chromium/Node/WebView).

**سيناريو التثبيت:** مفتاح من Bera-master-admin → تثبيت `.exe` على PC الأدمين → إدخال المفتاح (تحقّق online) → تشغيل تلقائي للسيرفر + إنشاء DB + حساب الأدمين → إضافة العمّال (أدوار/أقسام) → العمّال يتّصلون عبر QR/كود ربط (LAN) → backup تلقائي.

**مخرجات البناء:** كل الـ EXE → `C:\Users\HP\3D Objects\beramethode exe` (مضبوط في `build.directories.output`). خارج git.

---

## 7. Bera Master Admin (نظام التراخيص والتحكم)

> مشروع منفصل في `C:\Users\HP\3D Objects\Bera-master-admin`. يدير التراخيص ويتحكّم في BERAMETHODE مركزياً.

### 7.1 نموذج الترخيص

توليد المفتاح (في لوحة الإدارة) — سجل في جدول Supabase `licenses`:
```jsonc
{
  "id": "uuid",
  "key_code": "BERA-XXXX-XXXX-XXXX",
  "client_name": "...", "client_email": "...",
  "modules": ["dashboard","planning","magasin", ...],
  "max_workers": 50,
  "issued_at": "...", "expires_at": "...",
  "status": "active | suspended | revoked",
  "signature": "HMAC-SHA256 موقّع بسرّ الخادم"
}
```

### 7.2 التحقق الآمن
- **Supabase Edge Function** `verify-license`: تستقبل `key_code`، تتحقق من الجدول + التوقيع + `expires_at`. تُرجع: حالة الترخيص + الوحدات + `max_workers` + **توكن موقّع قصير الأجل** يُخزَّن محلياً.
- BERAMETHODE يستدعيها عند التفعيل وعند كل دخول/مزامنة.

### 7.3 العمل أوفلاين وفترة السماح
- يُخزَّن آخر ترخيص مُتحقَّق منه (موقّع) محلياً مع `last_verified_at`.
- يعمل البرنامج أوفلاين ضمن نافذة سماح؛ عند عودة الاتصال يعيد التحقق تلقائياً.

### 7.4 سلوك انتهاء المدة
ليس قفلاً كاملاً. يتحوّل البرنامج إلى **وضع القراءة فقط (Read-Only)**:
- يرى المستخدم كل بياناته القديمة عادي.
- يُمنع من: إضافة موديل جديد، إنشاء/كتابة جديدة، إيقاف suivi.
- تنبيه تجديد يظهر قبل الانتهاء (مثلاً بـ 5 أيام).

### 7.5 بنية مشروع Bera-master-admin
```
src/
  lib/supabaseAdmin.ts   (عميل anon + service_role محلي)
  lib/modules.ts         (الوحدات الـ22 + القوالب)
  lib/license.ts         (توليد key_code + توقيع + كتابة/قراءة licenses)
  context/AuthContext.tsx
  pages/
    Login.tsx
    Dashboard.tsx        (إحصائيات: تراخيص نشطة/منتهية، قرب الانتهاء)
    Licenses.tsx         (سرد + بحث)
    LicenseEditor.tsx    (توليد/تعديل مفتاح: عميل + مدة + عدد عمال + وحدات)
    Users.tsx            (سرد/إنشاء/حذف)
    AuditLog.tsx         (سجل الإجراءات)
```

### 7.6 BERA MASTER: Impersonation + Audit (إجباري)

> ⚠️ ميزة حسّاسة جداً. وصول كامل (edit) يستلزم تأمين قوي + audit إجباري قانونياً.

#### 7.6.1 — إيقاف/تفعيل user
- عمود `users.status` (active|suspended). `authenticateToken` يرفض `suspended` (401 + رسالة).
- endpoint محمي بـ **master key** (سرّ منفصل، ماشي login عادي): `POST /api/master/users/:id/suspend|activate`.

#### 7.6.2 — Impersonation (دخول كـ user)
- endpoint `POST /api/master/impersonate/:userId` محمي بـ **master secret منفصل** (env `MASTER_KEY`, HMAC).
- يصدّر **JWT قصير العمر** (مثلاً 30 دقيقة) فيه claim `imp_by: 'BERA_MASTER'` + `target_user_id`.
- `loadUserContext` يفهم هاد الـ token ويعطي سياق الـ user الهدف (قراءة + تعديل).

#### 7.6.3 — Audit إجباري
كل عملية وقت الـ impersonation تتسجّل في `system_audit_logs`:
- شكون=MASTER, target user, action, timestamp, القيم القديمة/الجديدة عند التعديل.
- علم `via_impersonation` في كل كتابة.

> **ملاحظة قانونية:** الـ MASTER_KEY خاصو يتخزّن غير في BERA MASTER، ماشي في BERAMETHODE. الـ audit الكامل هو الحماية القانونية الوحيدة إلا تسرّبت بيانات.

### 7.7 تعديلات BERAMETHODE للإنفاذ
- شاشة تفعيل (إدخال المفتاح) عند أول استعمال.
- استدعاء `verify-license` عند الدخول/المزامنة؛ تخزين في `bera_license` (متزامن عبر cloudSync).
- إنفاذ الوحدات: ملء `bera_nav_config.hidden` من `modules` المسموحة.
- إنفاذ عدد العمال: سقف في `GESTION-RH.tsx` حسب `max_workers`.
- وضع القراءة فقط + تنبيه التجديد + فترة السماح أوفلاين.

---

## 8. Plan B / الصمود (Graceful Degradation)

| الطبقة | تعتمد على | تحلّ |
|---|---|---|
| 0. محلي-أولاً | SQLite محلي | السحابة طاحت → يكمّل |
| 0.5. مصادقة محلية ✅ | Express JWT (بلا Supabase) | **موجودة ديجا** في وضع Express (`authController.ts`) |
| 1. طابور offline | تخزين محلي للتغييرات | يُدفَع عند الرجوع |
| 2. backups | Git/Drive/export | استرجاع |
| 3. relay بديل (LAN/P2P) | الشبكة المحلية | مزامنة بلا سحابة (مرحلة متقدّمة) |

> **بند Plan B الأهمّ محقّق:** المصادقة المحلية موجودة بالكامل في `server/authController.ts`. الـ .exe (وضع Express) يدخل محلياً حتى بلا إنترنت. العطل أصاب فقط نسخة الويب (static = Supabase-only). **الإجراء = أولوية شحن الـ .exe.**

---

## 9. الرؤية بعيدة المدى (ما بعد MVP)

> هذا القسم يوثّق الرؤية المعمارية **بعيدة المدى** — ليس للتنفيذ الفوري. الأولوية = المراحل 0→10 في القسم 4.

### 9.1 Delta Sync على جداول حقيقية (الانتقال من blob)
الانتقال من `user_data.data` (blob JSON واحد) إلى **جداول حقيقية**، صفّ لكل كيان، مع delta sync حقيقي:
- كل entity = صفّ مستقل بـ `id`, `tenant_id`, `updated_at` + trigger, `deleted_at`.
- push يبعث الصفّ المتغيّر فقط · pull يجلب الفرق فقط (`WHERE updated_at > last_synced_at`).
- حلّ التعارض (آخر كتابة تربح، أو أذكى).
- **ملاحظة:** «Outbox sync» في المرحلة 7 = الخطوة العملية الأولى. delta-sync الكامل على جداول حقيقية = هاد القسم.

### 9.2 RBAC كامل في DB (صلاحيات مفروضة في Postgres)
- `partition_id`/`role` لكل صفّ + سياسات RLS للرؤية.
- نقل الأدوار/الأقسام من الواجهة إلى فرض RLS.
- RLS نموذجية: `SELECT: tenant_id = mine AND partition مسموح لدوري`.

### 9.3 طبقة السمسار (مشاركة بموافقة — consent-based)
- المالك (سمسار) يرى **فقط** ما وافقت الشركة على مشاركته.
- صنفان للبيانات: خاصّة (لا يراها السمسار) · مشتركة بموافقة (`shared_with_broker = true`).
- RLS تفرضها: `to broker using (shared_with_broker = true)`.
- granular + revocable + auditable.

### 9.4 Multi-Transport LAN-first كامل
- mDNS/discovery للـ LAN تلقائياً.
- relay بديل LAN/P2P عند انقطاع السحابة.
- يعالج حالة «5 routers»: إن كانت شبكة واحدة → LAN في كل مكان؛ إن منفصلة → السحابة للأجهزة البعيدة.

### 9.5 Electron Desktop كامل
- Capacitor للعمّال (client).
- LAN discovery + QR pairing.
- backup تلقائي (Git repo خاص + Drive).

### 9.6 Config Indirection (قرار مبكّر مهمّ)
**لا تكتب عنوان السحابة في الكود.** البرنامج يجلب إعداد الـ backend من نقطة ثابتة تتحكّم فيها (مثلاً `config.beramethode.com`). تبديل المزوّد = تعديل نقطة واحدة، بلا إعادة تثبيت.

### 9.7 جداول `communities` + `shared_resources` + `user_share_invitations`
موجودة في DB ([db.ts:1487-1517](server/db.ts:1487)) بلا controllers — تنتظر المرحلة 6.

---

## 10. مراجع شاملة

### 10.1 نظام التصميم (Minimalist SaaS)
- **Tokens:** emerald (أساسي) · slate (محايد) · amber (تحذير) · red (خطر) · زجاج `bg-white/70 backdrop-blur-xl` · `rounded-2xl`
- **مكوّنات مشتركة:** GlassCard · ConfirmDialog · PermissionToggle · RoleBadge · SyncIndicator · EmptyState · Skeleton
- **RTL** كامل للعربية + انعكاس الأيقونات + `toLocaleString`
- **شجرة الصلاحيات:** مجلدات قابلة للطي + سحب لإعادة الترتيب + بحث

### 10.2 البنية (هيكل الملفات الجديدة)
```
electron/
  main.ts
  preload.ts
server/
  setupController.ts
  errorController.ts
  permissionsController.ts
  tenancy.ts                     (helper موحّد — requireOwner)
  masterController.ts            (BERA MASTER — impersonation + suspend)
  shareController.ts             (مشاركة user↔user)
  permissions/
    resolver.ts                  (مشترك frontend+backend)
    presets.ts                   (قوالب أدوار)
src/context/
  PermissionsContext.tsx
  ThemeContext.tsx
components/
  Setup.tsx
  PermissionsManager.tsx
  ui/                            (مكوّنات مشتركة)
```

**تدفق الجلسة:** Login → resolve member → company+role → permissions → gating → requirePermission

**API موحّد:** `{ ok, data?, error?, code? }` · أكواد: `PERMISSION_DENIED`, `SETUP_DONE`, `NO_COMPANY`

**Sync:** SQLite (حقيقة) → outbox → Supabase (مرآة)

### 10.3 ما هو جاهز vs ما يحتاج بناء

| القطعة | الحالة |
|---|---|
| الواجهة + المنطق + SQLite محلي | ✅ موجود |
| نظام tombstones + Corbeille | ✅ موجود (`apiShim.ts`) |
| الأدوار/الأقسام (`BERA_CUSTOM_ROLES`) | ✅ موجود (واجهة فقط) |
| `__schema_version` + migrations | ✅ موجود |
| التراخيص (Bera-master-admin) | ✅ مشروع 2 (قيد البناء) |
| إصلاحات Egress + RLS + bucket | ✅ مطبّق (2026-06-16) |
| مصادقة محلية fallback | ✅ موجودة في وضع Express (`authController.ts`) |
| `communities`, `shared_resources` في DB | ✅ جداول موجودة — بلا controllers |
| تغليف `.exe` (Electron) + auto-start | 🔨 المرحلة 1 |
| Onboarding Setup wizard | 🔨 المرحلة 1 |
| أمان Desktop (127.0.0.1 + tsup) | 🔨 المرحلة 2 |
| نظام الصلاحيات الهرمي (resolver + PermissionsManager) | 🔨 المرحلة 3 |
| الثيم (dark/light/system) | 🔨 المرحلة 5 |
| **سدّ ثقوب 0.1→0.4 + tenancy.ts** | 🔨 **المرحلة 6** — إجباري قبل onboarding ثانٍ |
| **مشاركة user↔user (shareController)** | 🔨 **المرحلة 6** |
| RLS Supabase + Outbox sync | 🔨 المرحلة 7 |
| Fleet Health + Impersonation + Audit | 🔨 المرحلة 8 |
| اللغات الكاملة | 🔨 المرحلة 9 (مستمرة) |
| electron-updater + GitHub Releases | 🔨 المرحلة 10 |
| ربط LAN + QR pairing | 🔨 الرؤية بعيدة المدى (القسم 9) |
| Delta sync كامل + جداول حقيقية + RLS DB | 🔨 الرؤية بعيدة المدى (القسم 9) |
| طبقة السمسار (مشاركة بموافقة) | 🔨 الرؤية بعيدة المدى (القسم 9) |
| backup تلقائي (Git/Drive) | 🔨 الرؤية بعيدة المدى (القسم 9) |
| Config indirection | 🔨 قرار مبكّر (يُفضَّل في المرحلة 2) |

### 10.4 أفكار إبداعية (مرتّبة تأثير÷جهد)
View As · إخفاء ذكي · قوالب أدوار · مؤشر مزامنة · Fleet Health · سجل تغييرات الصلاحيات · صلاحيات مؤقتة · علامة مائية للتصدير · PIN سريع · نسخ احتياطي مجدول · Crash dedup · ترخيص بالمقاعد · قوالب صناعية للإعداد · مركز إشعارات · مساعد Gemini.

### 10.5 جوانب منسية (Cross-cutting)
اختبارات resolver · migrations idempotent · rate-limit · أداء (pagination/virtualization) · أخطاء موحّدة · a11y · اختصارات لوحة المفاتيح · طباعة · soft-delete · رفيق موبايل (beraouvier) · سجل جلسات · تدويل كامل · توثيق داخلي.

### 10.6 ما يجب عدم كسره ⛔
- جداول db.ts الموجودة (نضيف فقط، لا نحذف).
- guest@local (حتى نعطّله رسمياً م6).
- Supabase sync (Broadcast بدل postgres_changes).
- Vite proxy في dev.
- dynamic port في server.ts.
- `IS_STATIC`.
- العزل الحالي owner_id.

### 10.7 التحقق النهائي (end-to-end)
1. `npm run dev:app` → web يشتغل بدون كسر.
2. حذف DB → Setup wizard يظهر → إدخال شركة+admin → دخول.
3. `npm run electron:build:win` → EXE في المجلد المحدد.
4. تثبيت EXE → يفتح بلا شاشة بيضاء (C1+C2) → DB في AppData.
5. إنشاء دور+موظف → الصلاحيات تشتغل (صفحة/حقل/استثناء).
6. الثيم يتبدّل (light/dark/system).
7. admin يرى History (من أنشأ ماذا).
8. 2 users مختلفين: حتى endpoint لا يُرجع بيانات الآخر.

### 10.8 مسرد المصطلحات

| المصطلح | المعنى |
|---|---|
| Local-First | الجهاز مصدر الحقيقة؛ السحابة إضافة |
| Egress | البيانات الصادرة من السحابة (التنزيل) — سقف Supabase Free = 5 GB |
| Delta Sync | مزامنة الفرق فقط، ماشي الحالة كاملة |
| Tombstone | علامة حذف (soft delete) تنتشر بدل المحو الفوري |
| RLS | Row Level Security — صلاحيات على مستوى الصفّ في Postgres |
| RBAC | صلاحيات بالأدوار |
| Broadcast | قناة Realtime WebSocket خفيفة (بلا فك WAL) |
| Store-and-Forward | السيرفر يرحّل ويخزّن مؤقتاً حتى التسليم |
| Config Indirection | جلب إعداد الـ backend من نقطة قابلة للتبديل |
| Outbox Sync | طابور محلي للتغييرات يُدفَع للسحابة بشكل idempotent |
| Impersonation | دخول BERA MASTER كمستخدم معيّن بـ JWT مؤقّت + audit |
| owner_id | مفتاح المستأجر (tenant) = id الباترون |
| companyId | owner_id الشركة محقون في req.companyId من middleware |
| MASTER_KEY | سرّ منفصل لـ BERA MASTER فقط — ماشي JWT عادي |

---

## روابط المصادر

الوثيقة مبنية على دمج ثلاث خطط:

1. **الخطّة 2 — العمود الفقري التنفيذي** (المراحل 0→10 + نموذج البيانات + Scopes + Audit):
   `C:\Users\HP\.claude\plans\la-proji-dyli-hdxi-lively-anchor.md`

2. **الخطّة 1 — تأمين Multi-Tenancy + عزل البيانات + المشاركة + BERA MASTER** (الثقوب 0.1→0.4 + tenancy.ts + shareController + masterController):
   `C:\Users\HP\.claude\plans\elegant-knitting-porcupine.md`

3. **الرؤية المعمارية الأصلية — Local-First / LAN / Delta Sync / السمسار / Plan B** (الآن: القسم 9 — ما بعد MVP):
   النسخة السابقة من `BERAMETHODE_ARCHITECTURE.md` (هاد الملف قبل هاد التحديث)

4. **Bera Master Admin — نظام التراخيص** (توليد المفتاح + Edge Function + لوحة الإدارة):
   `C:\Users\HP\.claude\plans\ok-nta-atkon-agent-encapsulated-dream.md`

---

*آخر تحديث: 2026-06-17. هذه وثيقة حيّة — تُحدَّث مع كل قرار معماري.*
