# BERAMETHODE → React Native (Expo) — Mobile App

## الهدف
تحويل مشروع BERAMETHODE من تطبيق ويب (React + Vite + Express) إلى تطبيق موبايل بـ **Expo + React Native** مع الحفاظ على نفس الـ Backend (Express API على port 8000).

---

## الفكرة العامة

```
┌─────────────────────────┐         ┌──────────────────────┐
│  📱 React Native (Expo) │◄───────►│  🖥️ Express Backend  │
│  Mobile App             │  HTTP   │  (server.ts:8000)    │
│  - Dashboard            │  /api/* │  - SQLite            │
│  - Planning             │         │  - JWT Auth          │
│  - Pointage             │         │  - Supabase Sync     │
│  - Suivi Production     │         └──────────────────────┘
│  - Magasin              │
│  - HR (consultation)    │
└─────────────────────────┘
```

**الـ Backend يبقى كما هو** — التطبيق الموبايل غير يتواصل مع `/api/*` endpoints اللي كاينين.

---

## User Review Required

> [!IMPORTANT]
> **الموديلات الأولى**: غادي نبداو بـ 5 modules أساسية فقط (Dashboard, Planning, Pointage, Suivi, Magasin). الباقي يتزاد بالتدريج.

> [!WARNING]  
> **ANDROID_HOME ماشي مضبوط** — شفت في الـ screenshot ديالك أن `ANDROID_HOME is not set`. خاصك تضبط Android SDK قبل ما نقدرو نشغلو الـ emulator. غادي نساعدك فيها.

> [!IMPORTANT]
> **الـ Backend خاص يكون شغال** — التطبيق الموبايل كيقرا من `http://<IP_DYAL_PC>:8000/api/*`. خاص `npm run dev:app` يكون شغال.

---

## Open Questions

> [!IMPORTANT]
> 1. **واش عندك Android SDK مثبت؟** (Android Studio ولا SDK standalone؟) — باش نقدرو نشغلو الـ emulator.
> 2. **واش بغيتي تجرب على تليفون حقيقي (Expo Go)** ولا على emulator فقط؟ Expo Go أسهل بزاف — تسكاني QR code وتشوف التطبيق مباشرة.
> 3. **واش عندك تليفون Android متصل بنفس الشبكة (WiFi)؟** — هادشي ضروري باش Expo Go يتواصل مع الـ Backend.

---

## Proposed Changes

### Phase 1: إنشاء مشروع Expo

#### [NEW] `beramethode-mobile/` (مجلد جديد في root)

مشروع Expo جديد بهاد الهيكل:

```
beramethode-mobile/
├── app/                    # Expo Router (file-based navigation)
│   ├── _layout.tsx         # Root layout + navigation
│   ├── index.tsx           # Login screen
│   ├── (tabs)/             # Tab navigation (بعد Login)
│   │   ├── _layout.tsx     # Tab bar config
│   │   ├── dashboard.tsx   # Dashboard KPIs
│   │   ├── planning.tsx    # Planning (calendar view)
│   │   ├── pointage.tsx    # Pointage des ouvriers
│   │   ├── suivi.tsx       # Suivi production
│   │   └── magasin.tsx     # Stock / Magasin
│   └── settings.tsx        # Paramètres + IP serveur
├── components/             # Reusable RN components
│   ├── ui/                 # Design system (Button, Card, Input...)
│   ├── DashboardKPI.tsx    # KPI card component
│   ├── PlanningCard.tsx    # Planning event card
│   ├── PointageRow.tsx     # Worker attendance row
│   └── StockItem.tsx       # Stock item component
├── lib/
│   ├── api.ts              # API client (fetch wrapper → Express)
│   ├── auth.ts             # JWT token storage (SecureStore)
│   ├── theme.ts            # Colors, fonts, spacing tokens
│   └── types.ts            # Shared types (copied from web)
├── assets/                 # Logo, icons, fonts
├── app.json                # Expo config
├── package.json
└── tsconfig.json
```

---

### Phase 2: الشاشات (واحد بواحد)

#### Screen 1: Login
- نفس الـ endpoint: `POST /api/auth/login`
- JWT token يتخزن فـ `expo-secure-store` (ماشي cookie)
- IP ديال السيرفر يدخلو المستخدم (مثلا `192.168.1.5:8000`)

#### Screen 2: Dashboard  
- `GET /api/dashboard/kpis` — يعرض KPIs رئيسية
- Cards بـ animations (React Native Reanimated)
- OFs في progress, effectif présent, TRS, valeur stock

#### Screen 3: Planning
- `GET /api/planning` — عرض الأحداث في calendar
- Cards view (ماشي Gantt — الموبايل ماشي مناسب للـ Gantt)
- Filter by chaîne, status

#### Screen 4: Pointage
- `GET /api/hr/pointage` + `POST /api/hr/pointage`
- قائمة العمال + زر pointage (حاضر/غائب)
- Scan QR code بالكاميرا ديال التليفون (expo-camera)

#### Screen 5: Magasin (consultation)
- `GET /api/magasin/products` — عرض المنتجات + الكميات
- Search + filter
- Mouvements (read-only بداية)

---

### Phase 3: Design System

#### [NEW] `beramethode-mobile/lib/theme.ts`

```typescript
// نفس الألوان ديال الويب باش يبان unified
export const colors = {
  primary: '#6366f1',      // Indigo
  secondary: '#8b5cf6',    // Violet  
  background: '#0f172a',   // Dark navy (BERAMETHODE brand)
  surface: '#1e293b',
  text: '#f8fafc',
  textSecondary: '#94a3b8',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  border: '#334155',
};
```

---

### Phase 4: API Layer

#### [NEW] `beramethode-mobile/lib/api.ts`

```typescript
// Centralized API client — يتواصل مع Express backend
// - IP يتخزن فـ AsyncStorage
// - JWT token من SecureStore
// - Error handling + retry
```

الـ API client غادي يدير:
- `baseURL` dynamic (المستخدم يدخل IP ديال PC)
- Auth header مع JWT token
- Timeout + retry logic
- Offline detection

---

## Dependencies (مكتبات جديدة)

| مكتبة | علاش |
|---|---|
| `expo` | Framework ديال React Native |
| `expo-router` | File-based navigation |
| `expo-secure-store` | تخزين JWT بطريقة آمنة |
| `expo-camera` | QR scan للـ pointage |
| `react-native-reanimated` | Animations |
| `@expo/vector-icons` | أيقونات |
| `react-native-chart-kit` | بديل Recharts للموبايل |

---

## Verification Plan

### الخطوة 1: إنشاء المشروع
```bash
npx -y create-expo-app@latest beramethode-mobile --template tabs
```

### الخطوة 2: تشغيل على Expo Go
```bash
cd beramethode-mobile
npx expo start
```
→ يعطيك QR code → تسكانيه من التليفون ديالك

### الخطوة 3: تجربة Login
- شغل Express backend: `npm run dev:app` (في BERAMETHODE 1)
- فتح التطبيق → دخل IP + credentials → يدخل

### Manual Verification
- ✅ Login يخدم مع Express backend
- ✅ Dashboard يعرض KPIs
- ✅ Planning يعرض الأحداث
- ✅ Pointage يخدم (حاضر/غائب)
- ✅ Magasin يعرض المنتجات

---

## الخطوات التالية (بعد Phase 1)

| Phase | شنو كيتزاد | متى |
|---|---|---|
| **Phase 2** | HR consultation, Effectifs | بعد validation Phase 1 |
| **Phase 3** | Suivi Production complet, Rendement | بالتدريج |
| **Phase 4** | Facturation (read-only) | بعدها |
| **Phase 5** | Push notifications (alertes stock, planning) | لاحقا |
| **Phase 6** | Offline mode (SQLite local + sync) | متقدم |

---

*خلاصة: غادي ننشئو مشروع Expo جديد في `beramethode-mobile/`، ونبداو بـ Login + Dashboard + Planning + Pointage + Magasin. الـ Backend يبقى كما هو — التطبيق الموبايل غير HTTP client للـ API.*
