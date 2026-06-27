/*
 * ╔════════════════════════════════════════════════════════════╗
 * ║     BERAMETHODE — Security Agent System                   ║
 * ║     7 وكلاء أمنيين لحماية التطبيق                        ║
 * ╚════════════════════════════════════════════════════════════╝
 *
 * الوكيل 1: Rate Limiter    — تحديد معدل الطلبات ومنع التخمين
 * الوكيل 2: Auth Guard      — حماية IDOR والصلاحيات
 * الوكيل 3: UUID Validator  — التحقق من المعرفات العشوائية
 * الوكيل 4: Error Handler   — إخفاء التفاصيل التقنية
 * الوكيل 5: HTTPS Enforcer  — فرض HTTPS والكوكيز الآمنة
 * الوكيل 6: Session Manager — إدارة الجلسات والتايم أوت
 * الوكيل 7: CSRF Shield     — حماية من الهجمات المتقاطعة
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// ═══════════════════════════════════════════════════════════════
// الوكيل 1: Rate Limiter — تحديد معدل الطلبات ومنع التخمين
// ═══════════════════════════════════════════════════════════════
const isDev = () => process.env.NODE_ENV === 'development';

/** سجل عنوان IP المخالف (بروتوكول حظر مؤقت) */
const ipViolations = new Map<string, { count: number; until: number }>();

export function checkIpViolation(ip: string): boolean {
  const record = ipViolations.get(ip);
  if (record && Date.now() < record.until) return true;
  if (record && Date.now() >= record.until) ipViolations.delete(ip);
  return false;
}

export function recordViolation(ip: string) {
  const record = ipViolations.get(ip) || { count: 0, until: 0 };
  record.count++;
  if (record.count >= 5) {
    record.until = Date.now() + 30 * 60 * 1000; // حظر 30 دقيقة
    record.count = 0;
  }
  ipViolations.set(ip, record);
}

/** وسيط حظر الـ IPs المخالفة */
export function ipBanMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (checkIpViolation(ip)) {
    return res.status(429).json({ message: 'تم حظر عنوان IP مؤقتاً. حاول بعد 30 دقيقة.' });
  }
  next();
}

/** حدود صارمة لصفحة تسجيل الدخول */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev(),
  handler: (_req, res) => {
    recordViolation(_req.ip || 'unknown');
    res.status(429).json({ message: 'Trop de tentatives de connexion. Attendez 15 minutes.' });
  },
});

/** حدود للبحث عن المستخدمين (منع تخمين المعرفات) */
export const userIdLookupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  skip: () => isDev(),
  keyGenerator: (req) => `${req.ip || 'unknown'}:user-lookup`,
  handler: (_req, res) => {
    recordViolation(_req.ip || 'unknown');
    res.status(429).json({ message: 'Too many user lookups. Try again later.' });
  },
});

/** حدود للبحث عن المعرفات في المسارات */
export const pathScanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  skip: () => isDev(),
  keyGenerator: (req) => `${req.ip || 'unknown'}:path-scan`,
  handler: (_req, res) => {
    recordViolation(_req.ip || 'unknown');
    res.status(429).json({ message: 'Too many requests. Slow down.' });
  },
});

// ═══════════════════════════════════════════════════════════════
// الوكيل 2: Auth Guard — حماية IDOR والصلاحيات
// ═══════════════════════════════════════════════════════════════

/** التحقق من أن المستخدم يملك صلاحية الوصول إلى المورد المطلوب */
export function ownershipGuard(ownerIdField: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id;
    const companyId = (req as any).companyId;
    const requestedOwnerId = req.params[ownerIdField] || req.body[ownerIdField];

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (requestedOwnerId && Number(requestedOwnerId) !== companyId && (req as any).user?.role !== 'admin') {
      recordViolation(req.ip || 'unknown');
      return res.status(403).json({ message: 'Access denied' });
    }

    next();
  };
}

/** منع الوصول المباشر إلى معرفات المستخدمين عبر URL */
export function noDirectUserIdMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path.includes('/user/') || req.path.includes('/users/')) {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (req.params.id && Number(req.params.id) !== userId && (req as any).user?.role !== 'admin') {
      recordViolation(req.ip || 'unknown');
      return res.status(403).json({ message: 'Access denied' });
    }
  }
  next();
}

// ═══════════════════════════════════════════════════════════════
// الوكيل 3: UUID Validator — التحقق من المعرفات العشوائية
// ═══════════════════════════════════════════════════════════════

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/** التحقق من أن المعرّف آمن (ليس محاولة اختراق) */
export function validateIdParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.params[paramName];
    if (!id) return next();

    if (!SAFE_ID_REGEX.test(id)) {
      recordViolation(req.ip || 'unknown');
      return res.status(400).json({ message: 'Invalid identifier format' });
    }
    next();
  };
}

/** توليد UUID v4 بسيط */
export function generateUUID(): string {
  const chars = '0123456789abcdef';
  const sections = [8, 4, 4, 4, 12];
  return sections.map(len => {
    let section = '';
    for (let i = 0; i < len; i++) section += chars[Math.floor(Math.random() * 16)];
    return section;
  }).join('-');
}

// ═══════════════════════════════════════════════════════════════
// الوكيل 4: Error Handler — إخفاء التفاصيل التقنية
// ═══════════════════════════════════════════════════════════════

/** إخفاء رؤوس التقنية (X-Powered-By) */
export function hideTechHeaders(req: Request, res: Response, next: NextFunction) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

/** رسالة خطأ عامة بدون تفاصيل تقنية */
export function genericErrorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[SecurityAgent] Unhandled error:', err.message);
  res.status(500).json({ message: 'Internal server error' });
}

/** اعتراض أخطاء 404 وإرجاع رسالة عامة */
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ message: 'Not found' });
}

// ═══════════════════════════════════════════════════════════════
// الوكيل 5: HTTPS Enforcer — فرض HTTPS والكوكيز الآمنة
// ═══════════════════════════════════════════════════════════════

/** توجيه HTTP إلى HTTPS */
export function httpsRedirect(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'production' && !req.secure && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
  }
  next();
}

/** إعدادات الكوكيز الآمنة الموحدة */
export const SECURE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
  sameSite: 'strict' as const,
  path: '/',
};

// ═══════════════════════════════════════════════════════════════
// الوكيل 6: Session Manager — إدارة الجلسات والتايم أوت
// ═══════════════════════════════════════════════════════════════

const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // ساعة واحدة بدون نشاط
const REFRESH_THRESHOLD_MS = 30 * 60 * 1000; // تجديد التوكين بعد 30 دقيقة

/** تسجيل آخر نشاط للمستخدم */
const userActivity = new Map<number, number>();

export function updateUserActivity(userId: number) {
  userActivity.set(userId, Date.now());
}

/** التحقق من صلاحية الجلسة (هل انتهت؟) */
export function isSessionExpired(userId: number): boolean {
  const lastActivity = userActivity.get(userId);
  if (!lastActivity) return true;
  return Date.now() - lastActivity > SESSION_TIMEOUT_MS;
}

/** وسيط تحديث النشاط */
export function sessionActivityMiddleware(req: Request, _res: Response, next: NextFunction) {
  const userId = (req as any).user?.id;
  if (userId) {
    updateUserActivity(userId);
    // إذا اقترب وقت انتهاء الجلسة، نطلب تجديد التوكين
    const lastActivity = userActivity.get(userId) || 0;
    if (Date.now() - lastActivity > REFRESH_THRESHOLD_MS) {
      // سيتم تجديد التوكين في الاستجابة
      (req as any).needsTokenRefresh = true;
    }
  }
  next();
}

/** تنظيف الجلسات المنتهية (كل ساعة) */
setInterval(() => {
  const now = Date.now();
  for (const [userId, lastActivity] of userActivity.entries()) {
    if (now - lastActivity > SESSION_TIMEOUT_MS * 2) {
      userActivity.delete(userId);
    }
  }
}, 60 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════
// الوكيل 7: CSRF Shield — حماية من الهجمات المتقاطعة
// ═══════════════════════════════════════════════════════════════

/** التحقق من مصدر الطلب (Same Origin) */
export function sameOriginCheck(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const origin = req.headers.origin;
  const host = req.headers.host;

  // في الإنتاج، نتحقق من أن الطلب من نفس المصدر
  if (process.env.NODE_ENV === 'production' && origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        recordViolation(req.ip || 'unknown');
        return res.status(403).json({ message: 'Cross-origin request blocked' });
      }
    } catch {
      return res.status(403).json({ message: 'Invalid origin' });
    }
  }

  next();
}

/** منع استعراض المجلدات (Directory Listing) */
export function disableDirectoryListing(req: Request, res: Response, next: NextFunction) {
  if (req.path.endsWith('/') && req.path !== '/') {
    return res.status(404).json({ message: 'Not found' });
  }
  next();
}

/** تطهير رؤوس الاستجابة من المعلومات الحساسة */
export function sanitizeResponseHeaders(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (body && typeof body === 'object' && !body.ok) {
      // إخفاء تفاصيل الأخطاء (إلا في وضع التطوير)
      if (isDev() && body.message) {
        return originalJson(body);
      }
      return originalJson({ message: body.message || 'Request failed' });
    }
    return originalJson(body);
  };
  next();
}

export default {
  ipBanMiddleware,
  loginRateLimiter,
  userIdLookupLimiter,
  pathScanLimiter,
  ownershipGuard,
  noDirectUserIdMiddleware,
  validateIdParam,
  generateUUID,
  hideTechHeaders,
  genericErrorHandler,
  notFoundHandler,
  httpsRedirect,
  SECURE_COOKIE_OPTIONS,
  sessionActivityMiddleware,
  sameOriginCheck,
  disableDirectoryListing,
  sanitizeResponseHeaders,
};
