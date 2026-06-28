# 🏗️ BERAMETHODE — الهندسة المعمارية

> وثيقة الهندسة المعمارية الكاملة لنظام BERAMETHODE ERP

---

## 📐 1. الهندسة العامة (Overall Architecture)

```
┌─────────────────────────────────────────────────────────────────────┐
 │                        المتصفح (Browser)                            │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │              React SPA (Vite 8 + TypeScript)                  │   │
 │  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐   │   │
 │  │  │ Auth    │ │ License  │ │ Permiss. │ │ Language       │   │   │
 │  │  │ Provider│ │ Provider │ │ Provider │ │ Provider       │   │   │
 │  │  └─────────┘ └──────────┘ └──────────┘ └────────────────┘   │   │
 │  │                                                              │   │
 │  │  ┌──────────────────────────────────────────────────────┐   │   │
 │  │  │                 App.tsx (1866 سطر)                    │   │   │
 │  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │   │   │
 │  │  │  │ Router   │ │ Nav      │ │ View     │ │ Toast  │  │   │   │
 │  │  │  │ lib/     │ │ app/     │ │ 23 page  │ │ +      │  │   │   │
 │  │  │  │router.ts │ │AppHeader │ │ components│ │ Modals │  │   │   │
 │  │  │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │   │   │
 │  │  └──────────────────────────────────────────────────────┘   │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                           │                                         │
 │                     fetch() /api/*                                   │
 │                           ▼                                         │
 │  ┌──────────────────────────────────────────────────────────────┐   │
 │  │              Express.js Server (port 7000)                    │   │
 │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐   │   │
 │  │  │ Security │ │ 21       │ │ Middle-  │ │ AI / Gemini    │   │   │
 │  │  │ 11-layer │ │Controllers│ │ ware     │ │ Engine         │   │   │
 │  │  └──────────┘ └──────────┘ └──────────┘ └────────────────┘   │   │
 │  │                           │                                    │   │
 │  │                    better-sqlite3                               │   │
 │  │                           ▼                                    │   │
 │  │              ┌──────────────────────────┐                      │   │
 │  │              │   SQLite (WAL mode)      │                      │   │
 │  │              │   66 tables              │                      │   │
 │  │              └──────────────────────────┘                      │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │                           │                                         │
 │              Supabase (اختياري — مزامنة سحابية)                      │
 └─────────────────────────────────────────────────────────────────────┘
```

---

## 🧩 2. تدفق البيانات (Data Flow)

### 2.1 قراءة البيانات (Read)

```
المكوّن (React)
    │
    ▼ useEffect + fetch('/api/xxx')
    │
    ▼ Express Middleware: authenticateToken → rate limiter → sanitizeParams
    │
    ▼ Controller: getXxx(req, res)
    │
    ▼ db.prepare('SELECT ...').all() / .get()
    │
    ▼ JSON response
    │
    ▼ setState(data) → React re-render
```

### 2.2 كتابة البيانات (Write)

```
المكوّن (React) ← حدث مستخدم (نقر، إدخال)
    │
    ▼ fetch('POST /api/xxx', { body: JSON })
    │
    ▼ Express Middleware: auth → rate limiter → session → IDOR guard → sanitize
    │
    ▼ Controller + License Guard (isLicenseWritable?)
    │
    ▼ db.prepare('INSERT/UPDATE ...').run()
    │
    ▼ Audit Logger (system_audit_logs)
    │
    ▼ JSON response { success: true }
    │
    ▼ React state update → re-render
```

### 2.3 المزامنة التلقائية (Auto-save)

```
App.tsx يستمع لتغييرات planningEvents و suivis
    │
    ▼ useEffect (debounced 1.2s)
    │
    ▼ POST /api/planning أو POST /api/suivi
    │
    ▼ شرط: planningHydratedRef.current === true (يمنع إرسال [] قبل تحميل البيانات)
```

---

## 🚦 3. تدفق التوجيه (Routing Flow)

```
نظام Hash-Based (للتوافق مع Vercel static hosting)
                               ┌──────────────────┐
                               │  lib/router.ts   │
                               │  (215 سطر)       │
                               └──────────────────┘

window.location.hash = '#abc123/suivi'
        │
        ▼ hashchange event
        │
        ▼ parseHash('#abc123/suivi')
        │  ├── sanitizeHash → يزيل # و /
        │  ├── split('/') → ['abc123', 'suivi']
        │  └── VIEW_MAP.get('suivi') → 'suivi'
        │
        ▼  ParsedRoute { view: 'suivi', tokens: ['abc123'], isNotFound: false }
        │
        ▼ syncHashToView() في App.tsx
        │  ┌── ALLOW.has(route.view) → true
        │  └── setCurrentView('suivi')
        │         setRouteTokens(['abc123'])
        │
        ▼  App.tsx rendering:
        │    {currentView === 'suivi' && <SuiviProduction ... />}
        │
        ▼  المكوّن يستخدم tokens للتحميل الأولي
           directModelId = tokens[0]
```

### التنقل البرمجي (Programmatic Navigation):

```typescript
// من أي مكوّن:
import { navigate } from './lib/router';

// ← بدون معاملات:
navigate('dashboard');

// ← مع معاملات:
navigate('suivi', modelId, chainId);

// ← داخل App.tsx، handleNavigation يفعل ذلك تلقائياً:
const handleNavigation = (targetView) => {
  // تحقق من التغييرات غير المحفوظة
  setCurrentView(targetView);
  setRouteTokens([]);
  navigate(targetView);  // يضبط window.location.hash
};
```

---

## 🔐 4. تدفق المصادقة (Auth Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│  نظام المصادقة: JWT في httpOnly Cookies                          │
│  الملفات: server/authController.ts + server/middleware.ts        │
└─────────────────────────────────────────────────────────────────┘

تسجيل الدخول:
──────────────
POST /api/auth/login { email, password }
    │
    ▼ bcrypt.compare(password, user.password_hash)
    │
    ▼ jwt.sign({ id, email, role }, SECRET, { expiresIn: '24h' })
    │
    ▼ res.cookie('token', jwt, {
         httpOnly: true,
         sameSite: 'strict',
         secure: process.env.COOKIE_SECURE === 'true',
         maxAge: 24 * 60 * 60 * 1000,
       })
    │
    ▼ رد: { user: { id, name, email, role } }

التحقق من الجلسة (كل طلب):
─────────────────────────────
middleware.ts → authenticateToken
    │
    ├── cookie 'token' موجود؟
    │   │
    │   ▼ verify(token, SECRET) → { id, email, role, iat, exp }
    │   │
    │   ├── منتهي → 401 { error: 'Token expired' }
    │   │
    │   └── صالح ← تجديد منزلق:
    │       │  إذا (exp - iat) > 30min ← jwt.sign(...) ← cookie جديد
    │       │  req.user = { id, email, role }
    │       ▼
    │       متابعة إلى المسار المطلوب
    │
    └── غير موجود → 401 { error: 'No token' }

تسجيل الخروج:
──────────────
POST /api/auth/logout
    │
    ▼ res.clearCookie('token')
    │
    ▼ auditLogger(userId, 'LOGOUT')
```

---

## 🛡️ 5. تدفق الأمان (Security Flow)

### 5.1 11 طبقة أمنية بالترتيب (server.ts)

```
طلب HTTP وارد
    │
    ▼ 1. X-Powered-By معطل
    │  app.disable('x-powered-by')
    │
    ▼ 2. رؤوس الأمان
    │  res.setHeader('X-Content-Type-Options', 'nosniff')
    │  res.setHeader('X-Frame-Options', 'DENY')
    │  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    │  (في الإنتاج) HSTS header
    │  (في الإنتاج) helmet() مع CSP مخصص
    │
    ▼ 3. إعادة توجيه HTTP → HTTPS (إنتاج فقط)
    │
    ▼ 4. express.json({ limit: '10mb' })
    │
    ▼ 5. cookieParser()
    │
    ▼ 6. IP Block Check
    │  ipViolations[ip] >= 5 → 403 لمدة 30 دقيقة
    │
    ▼ 7. CSRF Same-Origin Check (إنتاج فقط)
    │  POST/PUT/DELETE بدون Origin مطابق → 403
    │
    ▼ 8. Rate Limiting
    │  ├── /api/* → apiLimiter (8000/15min)
    │  ├── /api/auth/* → authLimiter (10/15min)
    │  ├── /api/auth/login → loginRateLimiter (10/15min)
    │  ├── /api/worker/:cin/pin-verify → pinVerifyLimiter (8/15min)
    │  ├── /api/users* → usersLookupLimiter (20/60min)
    │  ├── /api/network-info → networkInfoLimiter
    │  └── pathScanLimiter (100/60min للمسارات العشوائية)
    │
    ▼ 9. Session Tracking
    │  كل طلب → تحديث userActivity[userId] = Date.now()
    │  إذا مر 60 دقيقة → 401 مع clearAuthCookie
    │  كل 5 دقائق → تنظيف الجلسات المنتهية
    │
    ▼ 10. مسارات API → authenticateToken (للمحمية)
    │
    ▼ 11. IDOR Guard (على DELETE routes)
    │  ownershipGuard(table, ownerColumn) → يتحقق من ملكية المورد
    │  ← انتهاك → auditLogger(..., 'IDOR_ATTEMPT')
    │
    ▼ 12. معاملات المسار → sanitizeIdParam
    │  يمنع SQL injection في req.params
    │  isValidSafeId() → فقط أحرف وأرقام وشرطات سفلية
    │
    ▼ 13. License Enforcement
    │  isLicenseWritable() → يمنع الكتابة إذا الترخيص منتهي
    │
    ▼ 14. معالجة الأخطاء
    │  ← 404 عام "Not found"
    │  ← 500 عام "Internal server error"
    │  (لا تسريب لتفاصيل الأخطاء)
```

---

## 🧠 6. تدفق الذكاء الاصطناعي (Gemini AI Flow)

```
server/geminiController.ts ← POST /api/ai/*
    │
    ▼ تحقق من وجود GEMINI_API_KEY
    │
    ▼ بناء الـ prompt حسب نوع الطلب:
    │  ├── analyze-textile → تحليل بيانات نسيجية
    │  ├── suggest-vocabulary → اقتراح مفردات تقنية
    │  ├── generate-operations → توليد عمليات إنتاجية
    │  └── optimize-planning → تحسين التخطيط
    │
    ▼ geminiAi.ts → Google GenAI SDK
    │  try { const result = await model.generateContent(prompt) }
    │
    ▼ معالجة الرد:
    │  try { JSON.parse(result.text) } catch → خطأ
    │
    ▼ رد JSON منظم
```

---

## 💾 7. تدفق قاعدة البيانات (DB Flow)

### 7.1 التهيئة (server/db.ts:1-200)

```
import Database from 'better-sqlite3'

const DB = new Database('database.sqlite')

PRAGMA journal_mode = WAL    ← كتابة-أمامية (أداء أفضل)
PRAGMA synchronous = NORMAL  ← توازن سرعة/أمان
PRAGMA foreign_keys = ON     ← تكامل مرجعي
PRAGMA cache_size = -10000   ← 10MB ذاكرة تخزين مؤقت

// إنشاء 66 جدولاً
db.exec(`
  CREATE TABLE IF NOT EXISTS users ( ... );
  CREATE TABLE IF NOT EXISTS models ( ... );
  ...
`);
```

### 7.2 نمط CRUD في الـ Controllers

```typescript
// GET — قراءة
const getProducts = (req, res) => {
  const products = db.prepare('SELECT * FROM magasin_products WHERE owner_id = ?').all(ownerId);
  res.json(products);
};

// POST — إنشاء/تحديث
const saveProducts = (req, res) => {
  const data = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO magasin_products ...');
  const tx = db.transaction((items) => {
    for (const item of items) stmt.run(item);
  });
  tx(data);
  res.json({ success: true });
};

// DELETE — حذف (مع IDOR Guard)
const deleteProduct = (req, res) => {
  db.prepare('DELETE FROM magasin_products WHERE id = ? AND owner_id = ?').run(id, ownerId);
  res.json({ success: true });
};
```

### 7.3 التخزين المحلي (LocalStorage — Static Mode)

```
وضع Vercel (VITE_STATIC_MODE=true):
  → لا خادم Express
  → كل البيانات في localStorage
  → المزامنة عبر Supabase (cloudSync.ts)

المفاتيح الـ 16 في localStorage:
  beramethode_models, beramethode_planning, beramethode_suivis,
  beramethode_demandesAppro, beramethode_settings, beramethode_machines_v1,
  beramethode_machine_instances, beramethode_machines_fleet_history_v1,
  beramethode_library, beramethode_manual_links_by_model,
  bera_license, bera_refresh_token, bera_nav_config,
  bera_model_last_id, etc.
```

---

## 🗺️ 8. خريطة المكونات (Component Tree)

### 8.1 شجرة المكونات الكاملة

```
<App>
  ├── <AnnouncementBar />          ← إعلانات Supabase
  ├── <LicenseBanner />            ← تحذير الترخيص
  ├── <AppHeader>                  ← شريط التنقل
  │    ├── Logo
  │    ├── <WorkspaceSwitcher />   ← تبديل الشركات
  │    ├── Navigation              ← dropdown/flat/mobile
  │    ├── <SyncIndicator />       ← مؤشر المزامنة
  │    ├── <SupportWidget />       ← الدعم الفني
  │    ├── Avatar → Profil         ← الملف الشخصي
  │    └── Logout Button
  ├── <ErrorBoundary key={currentView}>
  │    │
  │    ├── currentView === 'dashboard'     → <Dashboard />
  │    ├── currentView === 'vuegenerale'   → <VueGenerale />
  │    ├── currentView === 'ingenierie'    → <ModelWorkflow />
  │    ├── currentView === 'library'       → <Library />
  │    ├── currentView === 'coupe'         → <LaCoupe />
  │    ├── currentView === 'effectifs'     → <Effectifs />
  │    ├── currentView === 'gestionRh'     → <GESTION-RH />
  │    ├── currentView === 'planning'      → <Planning />
  │    ├── currentView === 'suivi'         → <SuiviProduction />
  │    ├── currentView === 'rendement'     → <RendementBoard />
  │    ├── currentView === 'magasin'       → <Magasin />
  │    ├── currentView === 'export'        → <StockExport />
  │    ├── currentView === 'facturation'   → <Facturation />
  │    ├── currentView === 'config'        → <Configuration />
  │    ├── currentView === 'profil'        → <Profil />
  │    ├── currentView === 'pageMachine'   → <PageMachine />
  │    ├── currentView === 'machin'        → <Machin />
  │    ├── currentView === 'atelierProd'   → <Atelier />
  │    ├── currentView === 'sousTraitance' → <SousTraitance />
  │    ├── currentView === 'catalogTemps'  → <CatalogueTemps />
  │    ├── currentView === 'admin'         → <AdminDashboard />
  │    │
  │    └── routeNotFound === true → <404 Page />
  │
  ├── <NavConfirmModal />          ← تأكيد عند فقدان التغييرات
  └── <Toast />                    ← إشعارات عائمة
```

### 8.2 المكونات الفرعية داخل الصفحات

```
<ModelWorkflow> (Ingenierie)
  ├── <FicheTechnique />
  ├── <Gamme />
  ├── <AnalyseTechnologique />
  ├── <Balancing />
  ├── <Implantation />
  ├── <CostCalculator />
  ├── <Chronometrage />
  ├── <MaterialsList />
  ├── <MaterialAssignment />
  ├── <CompactCostSheet />
  ├── <CostPartials />
  └── <CostSanityCheck />

<Planning>
  ├── Calendar View (Gantt)
  ├── Cards View
  ├── <AgendaModal />
  └── <OrderModelPage />

<SuiviProduction>
  ├── Timeline View
  ├── Suivi Header
  ├── SuiviAnimeUtils
  └── SuiviComponents

<PageMachine>
  ├── <MachineQuickScanModal />
  ├── <MachineEditorModal />
  ├── <MachineExitModal />
  ├── <MachineQrTicket />
  └── <TicketView />

<Magasin>
  ├── <ProductDetailPanel />
  ├── <MaterialDetailModal />
  ├── <OrderTablesPanel />
  └── <Pedido />
```

---

## 🔄 9. تدفق الحالات (State Flow)

### 9.1 حالة التحميل (Loading States)

```
authLoading = true
    │
    ▼
appLoading.isActive = true
    │  display: <GlobalLoader />
    │
    ▼ runBootSequence()
    │  progress: 5% → 25% → 50% → 75% → 100%
    │  subText: "جاري تهيئة الوحدات..." → "تحميل البيانات..."
    │
    ├── success → appLoading.isActive = false
    │            → عرض الصفحة الرئيسية
    │
    └── error   → appLoading.error = "فشل الاتصال بالخادم"
                → <GlobalLoader error> مع زر إعادة المحاولة
```

### 9.2 حالة البيانات الفارغة (Empty States)

```
// في App.tsx:
useEffect(() => {
  if (user && !IS_STATIC) {
    fetch('/api/planning')
      .then(r => r.json())
      .then(data => setPlanningEvents(data || []))
      .catch(() => { /* ignore */ });
  }
}, [user]);
```

### 9.3 حالة الخطأ (Error Boundary)

```
<ErrorBoundary> يحيط بمحتوى الصفحات
    │
    ├── إذا إنهارت صفحة ← عرض "حدث خطأ في هذه الصفحة"
    │                     + إرسال تقرير (createTicketFromReport)
    │                     + شريط التنقل يبقى نشطاً
    │
    └── key={currentView} ← إعادة تعيين الحماية عند تغيير الصفحة
```

---

## 📁 10. هيكل الملفات (Directory Structure)

```
BERAMETHODE 1/
│
├── server.ts              ← نقطة الدخول (Express, 961 سطر)
├── App.tsx                ← المكوّن الرئيسي (1866 سطر)
├── index.tsx              ← نقطة دخول React
├── types.ts               ← TypeScript types (1047 سطر)
│
├── server/                ← 46 ملف
│   ├── db.ts              ← SQLite (1671 سطر)
│   ├── authController.ts  ← المصادقة
│   ├── middleware.ts       ← JWT + session
│   ├── securityAgent.ts   ← 7 وكلاء أمن
│   ├── auditLogger.ts     ← سجل التدقيق
│   ├── uuidUtils.ts       ← المعرفات
│   ├── jwtConfig.ts       ← JWT
│   ├── permissions/       ← الصلاحيات
│   │   ├── presets.ts     ← أدوار مسبقة
│   │   └── resolver.ts    ← حل الصلاحيات
│   └── ...Controllers     ← 21 وحدة تحكم
│
├── lib/                   ← 22 ملف
│   ├── router.ts          ← محرك التوجيه
│   ├── bootSequence.ts    ← تسلسل الإقلاع
│   ├── methodesEngine.ts  ← محرك حساب التكاليف
│   ├── cloudSync.ts       ← مزامنة Supabase
│   ├── dataIdentity.ts    ← عزل البيانات
│   └── ...
│
├── components/            ← 66 ملف TSX
│   ├── Dashboard.tsx
│   ├── Library.tsx
│   ├── Magasin.tsx        ← 4010 سطر (أكبر مكوّن)
│   ├── GESTION-RH.tsx     ← 3018 سطر
│   └── ...
│
├── src/
│   ├── context/           ← 6 سياقات
│   │   ├── AuthContext.tsx
│   │   ├── LicenseContext.tsx
│   │   ├── PermissionsContext.tsx
│   │   ├── LanguageContext.tsx
│   │   ├── ThemeContext.tsx
│   │   └── DataOwnerContext.tsx
│   │
│   └── components/        ← 11 ملف
│       ├── Login.tsx
│       ├── Signup.tsx
│       ├── AdminDashboard.tsx
│       └── ui/ (SaasButton, SaasCard, etc.)
│
├── app/                   ← 7 ملفات
│   ├── AppHeader.tsx      ← 674 سطر
│   ├── constants.ts       ← الترجمات + defaultNavOrder
│   ├── accountTypes.ts    ← أنواع الحسابات
│   ├── machineUtils.ts    ← أدوات الآلات
│   ├── NavConfirmModal.tsx
│   ├── NavMenuSettings.tsx
│   └── useAppModelManager.ts
│
├── public/                ← 9 ملفات
│   ├── beraouvier.html    ← واجهة العمال
│   └── sync-to-cloud.html ← أداة المزامنة
│
├── .env                   ← متغيرات البيئة
├── package.json           ← الاعتماديات
├── fichier.md             ← خريطة الصفحات
└── BERAMETHODE_BLUEPRINT.md ← المخطط العام
```

---

## 🌐 11. تدفق الشبكة (Network Flow)

### 11.1 الوضع المحلي (Express + Vite Dev)

```
المتصفح → localhost:5173 (Vite)
               │
               │ /api/* → Vite proxy → localhost:7000 (Express)
               │
               │ static files → Vite dev server
```

### 11.2 وضع الإنتاج (Express)

```
المتصفح → 0.0.0.0:7000 (Express)
               │
               │ /api/* → Express controllers
               │
               │ /* → dist/ (Vite build)
```

### 11.3 وضع Vercel (Static + Supabase)

```
المتصفح → Vercel (CDN)
               │
               │ /assets/* → Build files
               │
               │ /* → index.html (SPA)
               │
               │ البيانات → Supabase (localStorage)
```

### 11.4 وضع Electron (EXE)

```
تطبيق ويندوز
    │
    ├── Express server على 127.0.0.1:7000 (غير معرض للشبكة)
    ├── Electron BrowserWindow
    │       │
    │       └── http://127.0.0.1:7000
    │
    └── SQLite embedded (database.sqlite)
```

---

## 🎯 12. نمط عزل البيانات (Data Isolation)

### 12.1 مفهوم Data Owner

```
كل صف في قاعدة البيانات له owner_id
    │
    ├── GET: WHERE owner_id = ?  (المستخدم يرى بياناته فقط)
    ├── POST: owner_id مأخوذ من JWT token
    │
    └── static mode: DataOwnerContext + فلاتر في الذاكرة
```

### 12.2 Snapshots (dataIdentity.ts)

```
قبل كل عملية مزامنة:
  1. snapshot = JSON.parse(JSON.stringify(data))
  2. إرسال snapshot إلى الخادم
  3. الخادم يقارن + يدمج
  4. لا فقدان للبيانات
```

---

## ⚡ 13. تحسينات الأداء (Performance)

| التقنية | مكان التطبيق |
|---|---|
| **WAL mode** | SQLite — قراءة + كتابة متزامنة |
| **Lazy loading** | React.lazy — 23 صفحة تُحمّل عند الطلب فقط |
| **Debounced auto-save** | 1.2 ثانية بعد آخر تغيير |
| **Memo + useCallback** | المكونات الكبيرة (Magasin, GESTION-RH) |
| **localStorage cache** | بيانات الترخيص والإعدادات |
| **ErrorBoundary isolation** | لا انهيار شامل عند فشل صفحة |
| **Session cleanup** | كل 5 دقائق ← حذف الجلسات المنتهية (unref'd interval) |
| **Rate limiting** | 8 محدّدات ← منع هجمات DDoS |
| **IP blocking** | 5 انتهاكات → حظر 30 دقيقة |
| **Helmet CSP** | منع تنفيذ البرامج النصية غير المصرح بها |

---

## 🧬 14. الاعتماديات (Dependency Graph)

```
index.tsx
  └── AuthContext
        └── LicenseContext
              └── PermissionsContext
                    └── ThemeContext
                          └── LanguageContext
                                └── App.tsx
                                      ├── lib/router.ts       ← مستقل
                                      ├── lib/bootSequence.ts ← يعتمد على Auth
                                      ├── lib/dataIdentity.ts ← مستقل
                                      ├── lib/i18n.ts         ← مستقل
                                      ├── app/constants.ts    ← مستقل
                                      ├── app/AppHeader.tsx   ← يعتمد على constants
                                      ├── app/accountTypes.ts ← مستقل
                                      └── components/*.tsx
                                            ├── Dashboard.tsx
                                            ├── Planning.tsx
                                            └── ... (كل صفحة مستقلة)

server.ts
  ├── server/db.ts              ← مستقل (SQLite)
  ├── server/jwtConfig.ts       ← مستقل
  ├── server/middleware.ts      ← يعتمد على jwtConfig + db
  ├── server/auditLogger.ts     ← يعتمد على db
  ├── server/securityAgent.ts   ← مستقل
  ├── server/uuidUtils.ts       ← مستقل
  ├── server/licenseGuard.ts    ← يعتمد على jwtConfig
  └── server/*Controller.ts     ← يعتمد على db + middleware
```

---

## 📐 15. أنماط التصميم (Design Patterns)

| النمط | مكان الاستخدام | شرح |
|---|---|---|
| **Provider Pattern** | 6 سياقات (Auth, License, Permissions...) | توفير حالة عامة عبر React Context |
| **Lazy Loading** | React.lazy لكل الصفحات | تقليل الحجم الأولي للتطبيق |
| **Hash Routing** | lib/router.ts | توافق مع Vercel static hosting |
| **Controller Pattern** | server/*Controller.ts | فصل منطق API عن الإعدادات |
| **Middleware Chain** | server.ts + middleware.ts | معالجة الطلب خطوة بخطوة |
| **Transaction** | db.ts + Controllers | db.transaction() للتحديثات المتعددة |
| **Observer** | router.ts (onRouteChange) | إعلام المستمعين بتغيير التوجيه |
| **Error Boundary** | components/ErrorBoundary.tsx | عزل أعطال React |
| **Guard Pattern** | ownershipGuard, licenseGuard | التحقق من الصلاحية قبل التنفيذ |
| **Snapshot Pattern** | lib/dataIdentity.ts | التقاط حالة قبل المزامنة |
| **Debounce** | App.tsx (auto-save) | تقليل عدد طلبات الكتابة |
| **Sliding Session** | middleware.ts | تجديد JWT مع النشاط |

---

**النهاية.** هذه الوثيقة تغطي الهندسة المعمارية الكاملة لنظام BERAMETHODE: تدفق البيانات، التوجيه، الأمان، المكونات، الشبكة، والأداء.
