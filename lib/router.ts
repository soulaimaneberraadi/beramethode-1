/*
 * ╔══════════════════════════════════════════════════╗
 * ║     BERAMETHODE — Agent Routing Engine v3        ║
 * ║     وكيل التوجيه الذكي                           ║
 * ╚══════════════════════════════════════════════════╝
 *
 *  الشكل المعتمد: الصفحة أوّلاً، ثم أجزاء متسلسلة
 *
 *   #/sous-traitance/tableau-de-bord/clients/facture/123
 *    └──── view ────┘└──────── segments (عمق 0،1،2،3) ────┘
 *
 *  كل تبويب وكل قائمة وكل عنصر مفتوح = جزء في الرابط.
 *  النتيجة: الرجوع/الأمام ديال المتصفّح خدّامين، والرابط قابل للمشاركة.
 *
 *  ┌──────────┐    تفكيك    ┌────────────┐    useRouteSegment(0)
 *  │ URL Hash ├────────────►│ parseHash  ├───────────────────────► تبويب
 *  │          │◄────────────┤  navigate  │◄──────────────────────  onChange
 *  └────┬─────┘             └────────────┘
 *       │ hashchange / popstate
 *       ▼
 *   إعادة التصيير
 */

import { useCallback, useEffect, useState } from 'react';

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

/*
 * الأسماء المقروءة في الرابط (slug) ← اسم الصفحة الداخلي.
 * الهدف: رابط نظيف بالفرنسية بدل camelCase.
 *   #/sous-traitance  →  sousTraitance
 *   #/gestion-rh      →  gestionRh
 */
export const VIEW_SLUGS: Record<AppView, string> = {
  login: 'login', signup: 'signup',
  vuegenerale: 'vue-generale', dashboard: 'tableau-de-bord',
  ingenierie: 'ingenierie', library: 'bibliotheque', coupe: 'coupe',
  effectifs: 'effectifs', gestionRh: 'gestion-rh', planning: 'planning',
  suivi: 'suivi', magasin: 'magasin', export: 'export', config: 'configuration',
  profil: 'profil', admin: 'admin', rendement: 'rendement',
  pageMachine: 'machines', machin: 'catalogue-machines',
  facturation: 'facturation', atelierProd: 'atelier', sousTraitance: 'sous-traitance',
  catalogTemps: 'catalogue-temps',
};

/** slug (وأي صيغة قديمة) ← view. يقبل camelCase و kebab-case و lowercase. */
const SLUG_TO_VIEW = new Map<string, AppView>();
for (const view of Array.from(ALL_VIEWS) as AppView[]) {
  SLUG_TO_VIEW.set(view.toLowerCase(), view);
  const slug = VIEW_SLUGS[view];
  if (slug) SLUG_TO_VIEW.set(slug.toLowerCase(), view);
}
// مرادفات إضافية متسامحة (أخطاء مطبعية شائعة أو أسماء بديلة)
const EXTRA_ALIASES: Record<string, AppView> = {
  'soustraitance': 'sousTraitance', 'sous_traitance': 'sousTraitance',
  'gestionrh': 'gestionRh', 'rh': 'gestionRh', 'gestion_rh': 'gestionRh',
  'vue_generale': 'vuegenerale', 'accueil': 'vuegenerale', 'home': 'vuegenerale',
  'pagemachine': 'pageMachine', 'atelierprod': 'atelierProd',
  'catalogtemps': 'catalogTemps', 'catalogue_temps': 'catalogTemps',
  'stock': 'magasin', 'factures': 'facturation', 'facture': 'facturation',
  'parametres': 'config', 'settings': 'config',
};
for (const [alias, view] of Object.entries(EXTRA_ALIASES)) SLUG_TO_VIEW.set(alias, view);

export interface ParsedRoute {
  view: AppView | null;
  /** الأجزاء بعد الصفحة: ['tableau-de-bord','clients','facture','123'] */
  segments: string[];
  /** @deprecated اسم قديم لـ segments — محفوظ لعدم كسر الكود الموجود */
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
  listeners.forEach(fn => {
    try { fn(); } catch (e) { console.error('[Router] listener error:', e); }
  });
}

export function onRouteChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** ترميز جزء آمن (إزالة المسافات الطرفية + ترميز الحروف الخاصة) */
export function encodeSegment(raw: string): string {
  return encodeURIComponent(String(raw ?? '').trim()).replace(/%20/g, '+');
}

/** فك ترميز جزء */
export function decodeSegment(encoded: string): string {
  try { return decodeURIComponent(String(encoded ?? '').replace(/\+/g, ' ')); }
  catch { return String(encoded ?? ''); }
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
 *  #/sous-traitance/clients/12  → view='sousTraitance', segments=['clients','12']
 *  #/suivi                      → view='suivi',         segments=[]
 *  #                            → view=null (الصفحة الرئيسية)
 *  #/xyz                        → 404
 *
 *  توافق خلفي مع v2 (الصفحة في الآخر): #a/b/suivi → view='suivi', segments=['a','b']
 */
export function parseHash(hash: string): ParsedRoute {
  const rawHash = String(hash ?? '');
  const empty = (over: Partial<ParsedRoute> = {}): ParsedRoute =>
    ({ view: null, segments: [], tokens: [], isNotFound: false, rawHash, ...over });

  try {
    const clean = sanitizeHash(rawHash);
    if (!clean) return empty();

    const raw = clean.split('/').filter(Boolean);
    if (raw.length === 0) return empty();

    // — الشكل المعتمد: الصفحة في الأوّل —
    const head = SLUG_TO_VIEW.get(raw[0].toLowerCase());
    if (head) {
      const segments = raw.slice(1).map(decodeSegment);
      debug('parseHash: view=%s segments=%j', head, segments);
      return { view: head, segments, tokens: segments, isNotFound: false, rawHash };
    }

    // — توافق خلفي v2: الصفحة في الآخر —
    const tail = SLUG_TO_VIEW.get(raw[raw.length - 1].toLowerCase());
    if (tail) {
      const segments = raw.slice(0, -1).map(decodeSegment);
      debug('parseHash: legacy view=%s segments=%j', tail, segments);
      return { view: tail, segments, tokens: segments, isNotFound: false, rawHash };
    }

    debug('parseHash: unknown route "%s"', clean);
    return empty({ isNotFound: true });
  } catch (error) {
    console.error('[Router] parseHash error:', error);
    return empty({ isNotFound: true });
  }
}

/*
 * ╔══════════════════════════════════════════════════╗
 * ║  2. بناء رابط — URL Builder                      ║
 * ╚══════════════════════════════════════════════════╝
 *
 *  createRouteUrl('sousTraitance', 'clients', '12')
 *    → '#/sous-traitance/clients/12'
 */
export function createRouteUrl(view: AppView, ...segments: (string | number | null | undefined)[]): string {
  try {
    const slug = VIEW_SLUGS[view] || view;
    const parts = segments
      .filter(s => s !== null && s !== undefined && String(s) !== '')
      .map(s => encodeSegment(String(s)));
    return parts.length ? `#/${slug}/${parts.join('/')}` : `#/${slug}`;
  } catch (error) {
    console.error('[Router] createRouteUrl error:', error);
    return `#/${view}`;
  }
}

/*
 * ╔══════════════════════════════════════════════════╗
 * ║  3. التنقل — Navigation                          ║
 * ╚══════════════════════════════════════════════════╝
 *
 *  navigate('sousTraitance', 'clients', '12')
 *    → #/sous-traitance/clients/12  → hashchange → إعادة تصيير
 */
export function navigate(view: AppView, ...segments: (string | number | null | undefined)[]) {
  try {
    const path = createRouteUrl(view, ...segments);
    lastRoute = parseHash(path);
    if (window.location.hash === path) { notify(); return; }
    window.location.hash = path;
    notify();
  } catch (error) {
    console.error('[Router] navigate error:', error);
  }
}

/**
 * استبدال الرابط الحالي بدون إضافة خطوة في سجلّ المتصفّح.
 * يُستعمل للمزامنة الأوّلية (مثلاً تبويب افتراضي) حتى لا يمتلئ زر «رجوع».
 */
export function replaceRoute(view: AppView, ...segments: (string | number | null | undefined)[]) {
  try {
    const path = createRouteUrl(view, ...segments);
    if (window.location.hash === path) return;
    lastRoute = parseHash(path);
    const url = window.location.pathname + window.location.search + path;
    window.history.replaceState(window.history.state, '', url);
    notify();
  } catch (error) {
    console.error('[Router] replaceRoute error:', error);
  }
}

/*
 * ╔══════════════════════════════════════════════════╗
 * ║  4. قراءة الرابط الحالي — Current Route          ║
 * ╚══════════════════════════════════════════════════╝
 */
let lastRoute: ParsedRoute = { view: null, segments: [], tokens: [], isNotFound: false, rawHash: '' };

export function getCurrentRoute(): ParsedRoute {
  try {
    lastRoute = parseHash(window.location.hash);
    return lastRoute;
  } catch (error) {
    console.error('[Router] getCurrentRoute error:', error);
    return { view: null, segments: [], tokens: [], isNotFound: true, rawHash: '' };
  }
}

/** مسح الهاش والرجوع للصفحة الرئيسية */
export function resetToHome() {
  try {
    window.location.hash = '';
    lastRoute = { view: null, segments: [], tokens: [], isNotFound: false, rawHash: '' };
    notify();
  } catch (error) {
    console.error('[Router] resetToHome error:', error);
  }
}

/*
 * ╔══════════════════════════════════════════════════╗
 * ║  5. الاشتراك في الرابط — React hooks             ║
 * ╚══════════════════════════════════════════════════╝
 */

/** يشترك في كل تغيير للرابط (hashchange + navigate الداخلي). */
export function useRoute(): ParsedRoute {
  const [route, setRoute] = useState<ParsedRoute>(() => getCurrentRoute());
  useEffect(() => {
    const sync = () => setRoute(getCurrentRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    const off = onRouteChange(sync);
    sync();
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
      off();
    };
  }, []);
  return route;
}

export interface RouteSegmentOptions<T extends string> {
  /** عمق الجزء بعد اسم الصفحة: 0 = التبويب الأوّل، 1 = التبويب الفرعي… */
  depth: number;
  /** القيم المسموحة؛ أي قيمة أخرى في الرابط تُتجاهل ويُرجَع الافتراضي. */
  allowed: readonly T[];
  /** القيمة الافتراضية عند غياب الجزء أو كونه غير صالح. */
  fallback: T;
  /** الصفحة المالكة — نحتاجها لإعادة بناء الرابط عند التغيير. */
  view: AppView;
  /**
   * أسماء مقروءة في الرابط بدل المُعرِّفات الداخلية.
   *   slugs: { orders: 'commandes', subcontractors: 'sous-traitants' }
   * → `#/sous-traitance/commandes` بينما الكود يبقى يشتغل بـ 'orders'.
   * المُعرِّف الداخلي يبقى مقبولاً كذلك عند القراءة (توافق خلفي).
   */
  slugs?: Partial<Record<T, string>>;
  /**
   * true = يُكتب التبويب الافتراضي في الرابط عند أوّل عرض.
   * false (الافتراضي) = الرابط يبقى نظيفاً حتى يختار المستخدم تبويباً.
   */
  pinDefault?: boolean;
}

/**
 * يربط تبويباً (أو أي حالة نصّية) بجزء من الرابط.
 *
 *   const [tab, setTab] = useRouteSegment({
 *     view: 'sousTraitance', depth: 0,
 *     allowed: ['orders','subcontractors','stock','clients','ventes'] as const,
 *     fallback: 'orders',
 *   });
 *
 * النتيجة: `#/sous-traitance/clients` — والرجوع ديال المتصفّح كيرجع للتبويب السابق.
 * الأجزاء الأعمق تتمسح تلقائياً عند تبديل جزء أعلى منها (تبديل التبويب يغلق التفاصيل).
 */
export function useRouteSegment<T extends string>(opts: RouteSegmentOptions<T>): [T, (next: T) => void] {
  const { depth, allowed, fallback, view, slugs, pinDefault = false } = opts;
  const route = useRoute();

  // id ↔ slug (المُعرِّف الداخلي يبقى مقبولاً في الرابط للتوافق الخلفي)
  const toSlug = (id: T): string => (slugs?.[id] as string) || id;
  const fromSlug = (raw: string): T | null => {
    const lower = raw.toLowerCase();
    for (const id of allowed) {
      if (id.toLowerCase() === lower || toSlug(id).toLowerCase() === lower) return id;
    }
    return null;
  };

  const onThisView = route.view === view;
  const raw = onThisView ? route.segments[depth] : undefined;
  const value = (raw ? fromSlug(raw) : null) ?? fallback;

  // تثبيت الافتراضي في الرابط (بدون خطوة إضافية في السجلّ)
  useEffect(() => {
    if (!pinDefault || !onThisView || raw) return;
    const current = getCurrentRoute();
    const next = [...current.segments];
    next[depth] = toSlug(fallback);
    for (let i = 0; i < depth; i++) if (!next[i]) next[i] = '-';
    replaceRoute(view, ...next);
  }, [pinDefault, onThisView, raw, depth, fallback, view]);

  const setValue = useCallback((next: T) => {
    const current = getCurrentRoute();
    const base = current.view === view ? current.segments : [];
    // تبديل جزء = مسح كل ما تحته (تبويب جديد ⇒ تفاصيل قديمة تُغلق)
    const kept = base.slice(0, depth);
    for (let i = 0; i < depth; i++) if (!kept[i]) kept[i] = '-';
    navigate(view, ...kept, toSlug(next));
  }, [depth, view, slugs]);

  return [value, setValue];
}

/**
 * نسخة حرّة من `useRouteSegment` لعنصر مفتوح (مُعرِّف سجلّ) بدل قائمة قيم مغلقة.
 *
 *   const [factureId, openFacture] = useRouteParam({ view:'facturation', depth: 1 });
 *   openFacture('123')  → #/facturation/<tab>/123
 *   openFacture(null)   → يرجع للقائمة
 */
export function useRouteParam(opts: { view: AppView; depth: number }): [string | null, (next: string | null) => void] {
  const { view, depth } = opts;
  const route = useRoute();
  const rawValue = route.view === view ? (route.segments[depth] ?? null) : null;

  const setValue = useCallback((next: string | null) => {
    const current = getCurrentRoute();
    const base = current.view === view ? current.segments : [];
    const kept = base.slice(0, depth);
    for (let i = 0; i < depth; i++) if (!kept[i]) kept[i] = '-';
    if (next === null || next === '') navigate(view, ...kept);
    else navigate(view, ...kept, next);
  }, [depth, view]);

  return [rawValue === '-' ? null : rawValue, setValue];
}
