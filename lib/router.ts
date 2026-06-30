/*
 * ╔══════════════════════════════════════════════════╗
 * ║     BERAMETHODE — Agent Routing Engine v2       ║
 * ║     وكيل التوجيه الذكي                          ║
 * ╚══════════════════════════════════════════════════╝
 *
 * ┌──────────┐     تفكيك الرابط      ┌────────────┐
 * │  URL Hash├──────────────────────►│ parseHash  │
 * │ #a/suivi │                       │  {'suivi', │
 * │  /88k    │◄──────────────────────│  ['a','88']}│
 * └──────────┘     بناء الرابط      └────────────┘
 *       │                                 │
 *       │ hashchange                      │ setCurrentView
 *       ▼                                 ▼
 * ┌──────────┐                     ┌────────────┐
 * │المتصفح   │                     │ React View │
 * │رجوع/أمام │                     │ (Suivi)    │
 * └──────────┘                     └────────────┘
 */

export type AppView =
  | 'login' | 'signup'
  | 'vuegenerale' | 'dashboard' | 'ingenierie' | 'library' | 'coupe'
  | 'effectifs' | 'gestionRh' | 'planning' | 'suivi'
  | 'magasin' | 'export' | 'config' | 'profil' | 'admin'
  | 'rendement' | 'pageMachine' | 'machin' | 'facturation'
  | 'atelierProd' | 'sousTraitance' | 'catalogTemps';

export const ALL_VIEWS: Set<string> = new Set([
  'login', 'signup', 'vuegenerale', 'dashboard', 'ingenierie', 'library', 'coupe',
  'effectifs', 'gestionRh', 'planning', 'suivi', 'magasin', 'export',
  'config', 'profil', 'admin', 'rendement', 'pageMachine', 'machin',
  'facturation', 'atelierProd', 'sousTraitance', 'catalogTemps',
]);

export interface ParsedRoute {
  view: AppView | null;
  tokens: string[];
  /** true إذا الرابط غير معروف (404) */
  isNotFound: boolean;
  /** الرابط الأصلي قبل المعالجة */
  rawHash: string;
}

const listeners = new Set<() => void>();
const DEBUG = false; // شغّل true للتصحيح في Console

function debug(...args: unknown[]) {
  if (DEBUG) console.log('[Router]', ...args);
}

function notify() {
  debug('notify: إعلام', listeners.size, 'مستمع');
  listeners.forEach(fn => {
    try { fn(); } catch (e) { console.error('[Router] listener error:', e); }
  });
}

export function onRouteChange(fn: () => void): () => void {
  listeners.add(fn);
  debug('onRouteChange: تمت إضافة مستمع');
  return () => {
    listeners.delete(fn);
    debug('onRouteChange: تمت إزالة مستمع');
  };
}

/** ترميز Token آمن (إزالة المسافات + ترميز الحروف الخاصة) */
function encodeToken(raw: string): string {
  return encodeURIComponent(raw.trim()).replace(/%20/g, '+');
}

/** فك ترميز Token */
function decodeToken(encoded: string): string {
  return decodeURIComponent(encoded.replace(/\+/g, ' '));
}

/** تنظيف الهاش من الشوائب */
function sanitizeHash(hash: string): string {
  return String(hash ?? '')
    .trim()
    .replace(/^#\/?/, '')
    .replace(/\s+/g, '');
}

/*
 * ╔══════════════════════════════════════════════════╗
 * ║  1. تفكيك الرابط — URL Parsing                   ║
 * ╚══════════════════════════════════════════════════╝
 *
 *  #dashboard          → view='dashboard',  tokens=[]
 *  #7yjhh/suivi/88k    → view='suivi',      tokens=['7yjhh','88k']
 *  #a/b/c/planning     → view='planning',   tokens=['a','b','c']
 *  #nothing/xyz        → view=null,         404 (غير معروف)
 *  #                   → view=null (الصفحة الرئيسية)
 */
export function parseHash(hash: string): ParsedRoute {
  const rawHash = String(hash ?? '');
  try {
    const clean = sanitizeHash(rawHash);
    debug('parseHash: المدخل "%s" → النظيف "%s"', rawHash, clean);

    if (!clean) {
      return { view: null, tokens: [], isNotFound: false, rawHash };
    }

    const segments = clean.split('/').filter(Boolean);
    debug('parseHash: الأجزاء', segments);

    if (segments.length === 0) {
      return { view: null, tokens: [], isNotFound: false, rawHash };
    }

    const VIEW_MAP = new Map(Array.from(ALL_VIEWS).map(v => [v.toLowerCase(), v]));

    if (segments.length === 1) {
      const match = VIEW_MAP.get(segments[0].toLowerCase());
      if (match) {
        return { view: match as AppView, tokens: [], isNotFound: false, rawHash };
      }
      debug('parseHash: ⚠️ جزء واحد غير معروف "%s"', segments[0]);
      return { view: null, tokens: [], isNotFound: true, rawHash };
    }

    const candidate = VIEW_MAP.get(segments[segments.length - 1].toLowerCase());
    if (candidate) {
      const rawTokens = segments.slice(0, -1);
      const decodedTokens = rawTokens.map(t => decodeToken(t));
      debug('parseHash: ✅ view="%s" tokens=%j', candidate, decodedTokens);
      return { view: candidate as AppView, tokens: decodedTokens, isNotFound: false, rawHash };
    }

    debug('parseHash: ⚠️ آخر جزء "%s" ليس صفحة معروفة', candidate);
    return { view: null, tokens: [], isNotFound: true, rawHash };
  } catch (error) {
    console.error('[Router] parseHash error:', error);
    return { view: null, tokens: [], isNotFound: true, rawHash };
  }
}

/*
 * ╔══════════════════════════════════════════════════╗
 * ║  2. التنقل — Navigation                          ║
 * ╚══════════════════════════════════════════════════╝
 *
 *  navigate('suivi', '7yjhh', '88k')
 *    → window.location.hash = '#7yjhh/suivi/88k'
 *    → hashchange event يشتغل
 *    → syncHashToView يتلقى
 *    → setCurrentView('suivi')
 */
export function navigate(view: AppView, ...tokens: string[]) {
  try {
    const encodedTokens = tokens.map(t => encodeToken(String(t ?? '')));
    const path = encodedTokens.length
      ? `#${encodedTokens.join('/')}/${view}`
      : `#${view}`;

    lastRoute = parseHash(path);
    debug('navigate: → "%s" view=%s tokens=%j', path, view, encodedTokens);
    window.location.hash = path;
    notify();
  } catch (error) {
    console.error('[Router] navigate error:', error);
  }
}

/*
 * ╔══════════════════════════════════════════════════╗
 * ║  3. قراءة الرابط الحالي — Current Route          ║
 * ╚══════════════════════════════════════════════════╝
 */
let lastRoute: ParsedRoute = { view: null, tokens: [], isNotFound: false, rawHash: '' };

export function getCurrentRoute(): ParsedRoute {
  try {
    const hash = window.location.hash;
    lastRoute = parseHash(hash);
    return lastRoute;
  } catch (error) {
    console.error('[Router] getCurrentRoute error:', error);
    return { view: null, tokens: [], isNotFound: true, rawHash: '' };
  }
}

/*
 * ╔══════════════════════════════════════════════════╗
 * ║  4. بناء رابط — URL Builder                      ║
 * ╚══════════════════════════════════════════════════╝
 *
 *  createRouteUrl('suivi', '7yjhh', '88k')
 *    → '#7yjhh/suivi/88k'
 */
export function createRouteUrl(view: AppView, ...tokens: string[]): string {
  try {
    const encodedTokens = tokens.map(t => encodeToken(String(t ?? '')));
    return encodedTokens.length
      ? `#${encodedTokens.join('/')}/${view}`
      : `#${view}`;
  } catch (error) {
    console.error('[Router] createRouteUrl error:', error);
    return `#${view}`;
  }
}

/** مسح الهاش والرجوع للصفحة الرئيسية */
export function resetToHome() {
  try {
    window.location.hash = '';
    lastRoute = { view: null, tokens: [], isNotFound: false, rawHash: '' };
    notify();
  } catch (error) {
    console.error('[Router] resetToHome error:', error);
  }
}
