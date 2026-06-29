import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { ModelData, SuiviData, PlanningEvent, AppSettings, AppTask } from '../types';
import { Users, Activity, Layers, TrendingUp, Download, AlertTriangle, ShieldAlert, CheckCircle2, CalendarClock, ChevronRight, Factory, Package, DollarSign, Calendar as CalendarIcon } from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import { ResponsiveChart } from './ui/ResponsiveChart';
import { useIsDark } from '../src/context/ThemeContext';
import { chartColors } from '../lib/themeColors';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

type DashboardNavTarget =
  | 'planning'
  | 'effectifs'
  | 'magasin'
  | 'library'
  | 'suivi'
  | 'rendement';

interface DashboardProps {
  models: ModelData[];
  suivis: SuiviData[];
  planningEvents: PlanningEvent[];
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onOpenAgenda: () => void;
  onNavigateModule?: (view: DashboardNavTarget) => void;
}

const Sparkline = React.memo(function Sparkline({ data, color }: { data: any[], color: string }) {
  if (!data || data.length < 2) return null;
  return (
    <div className="h-8 w-14 ml-auto opacity-60 group-hover:opacity-100 transition-opacity">
      <ResponsiveChart>
        <LineChart data={data}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveChart>
    </div>
  );
});

/**
 * Compte de 0 → cible à l'entrée, puis anime de la valeur précédente vers la
 * nouvelle à chaque mise à jour live (easeOutCubic, ~900 ms). Chiffre « vivant ».
 */
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const safeTarget = Number.isFinite(target) ? target : 0;
    const from = fromRef.current;
    if (from === safeTarget) { setVal(safeTarget); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (safeTarget - from) * eased);
      if (t < 1) { raf = requestAnimationFrame(tick); }
      else { fromRef.current = safeTarget; setVal(safeTarget); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/** Abréviation lisible : 1 234 → « 1.2k », 2 500 000 → « 2.5M ». */
function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}
/** Valeur réelle complète (séparateurs de milliers) — affichée au survol. */
function fmtFull(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : '—';
}

/** Temps relatif localisé : « à l'instant », « il y a 2 min », « il y a 1 h ». */
function relTime(ts: number, now: number, lang: string): string {
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 10) return tx(lang, { fr: "à l'instant", ar: 'الآن', en: 'just now', es: 'ahora', pt: 'agora', tr: 'şimdi' });
  if (sec < 60) return tx(lang, { fr: `il y a ${sec}s`, ar: `قبل ${sec} ث`, en: `${sec}s ago`, es: `hace ${sec}s`, pt: `há ${sec}s`, tr: `${sec}sn önce` });
  const min = Math.round(sec / 60);
  if (min < 60) return tx(lang, { fr: `il y a ${min} min`, ar: `قبل ${min} د`, en: `${min} min ago`, es: `hace ${min} min`, pt: `há ${min} min`, tr: `${min} dk önce` });
  const hr = Math.round(min / 60);
  return tx(lang, { fr: `il y a ${hr} h`, ar: `قبل ${hr} س`, en: `${hr}h ago`, es: `hace ${hr}h`, pt: `há ${hr}h`, tr: `${hr}sa önce` });
}

const KPI_ACCENT: Record<string, string> = {
  of: '#6366f1', 'eff-rh': '#10b981', stock: '#f59e0b', avances: '#8b5cf6',
  modeles: '#0ea5e9', 'eff-suivi': '#14b8a6', trs: '#f43f5e', pj: '#3b82f6',
};

const KpiCard = React.memo(function KpiCard({ kpi, showLoading, onNavigateModule, index = 0 }: {
  kpi: ReturnType<typeof useDashboardKpis>[number];
  showLoading: boolean;
  onNavigateModule?: (view: DashboardNavTarget) => void;
  index?: number;
}) {
  const accent = KPI_ACCENT[kpi.key] || '#6366f1';
  // Valeur réelle complète (présente sur les KPI abrégés : stock, avances) ⇒ tooltip.
  const fullValue = (kpi as { fullValue?: string }).fullValue;
  // Entrée décalée (stagger) via le keyframe `fadeInUp` défini dans index.html.
  // (Les utilitaires animate-in de tailwindcss-animate ne sont PAS chargés sur
  // le CDN Tailwind — d'où l'animation inline qui, elle, fonctionne.)
  const delayStyle = { borderLeftColor: accent, animation: 'fadeInUp 0.5s ease-out both', animationDelay: `${index * 60}ms` } as React.CSSProperties;
  const Inner = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg ${kpi.iconBg} flex items-center justify-center shrink-0`}>
          <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
        </div>
        <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider truncate">{kpi.label}</p>
        {onNavigateModule && (
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-dk-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" aria-hidden />
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <p title={fullValue} className={`text-xl sm:text-2xl font-black text-slate-800 dark:text-dk-text leading-none tabular-nums tracking-tight ${fullValue ? 'cursor-help decoration-dotted decoration-slate-300 underline-offset-4 hover:underline' : ''}`}>
          {showLoading ? <span className="inline-block h-5 sm:h-6 w-16 rounded-md bg-slate-200 dark:bg-dk-elevated/70 animate-pulse align-middle" aria-hidden /> : kpi.value}
        </p>
        {kpi.sparkData && kpi.sparkData.length > 0 && (
          <Sparkline data={kpi.sparkData} color={kpi.sparkColor || '#6366f1'} />
        )}
      </div>
      <p className="text-[10px] sm:text-xs text-slate-500 dark:text-dk-muted mt-1.5 font-medium truncate">{kpi.sub}</p>
    </>
  );
  const shell = 'bg-white dark:bg-dk-surface rounded-xl p-3 sm:p-3.5 border border-slate-200 dark:border-dk-border border-l-[3px] shadow-sm dark:shadow-dk-sm flex flex-col group hover:border-slate-300 dark:hover:border-dk-border/90 hover:shadow-md transition-all duration-200 cursor-pointer';
  if (onNavigateModule) {
    return (
      <button key={kpi.key} type="button" onClick={() => onNavigateModule(kpi.nav)} style={delayStyle} className={`${shell} w-full text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20`}>
        {Inner}
      </button>
    );
  }
  return <div key={kpi.key} style={delayStyle} className={shell}>{Inner}</div>;
});

function useDashboardKpis(liveKPIs: any, activeModelsCount: number, totalEffectif: number, globalTRS: number, pJournaliere: number, lang: string) {
  return useMemo(() => {
    const stockRaw = liveKPIs?.stock?.valeur_totale;
    const avancesRaw = liveKPIs?.rh?.avances_encours;
    const stockVal = stockRaw != null ? fmtCompact(stockRaw) : '—';
    const avancesVal = avancesRaw != null ? fmtCompact(avancesRaw) : '—';
    // Valeur réelle complète, révélée au survol (title) — l'abréviation ne doit
    // jamais masquer le chiffre exact dans un contexte financier.
    const stockFull = stockRaw != null ? fmtFull(stockRaw) : undefined;
    const avancesFull = avancesRaw != null ? fmtFull(avancesRaw) : undefined;
    return [
      { key: 'of', label: tx(lang, { fr: 'OF En Cours', ar: 'أوامر الإنتاج الجارية', en: 'OF In Progress', es: 'OF En Curso', pt: 'OF Em Andamento', tr: 'Devam Eden OF' }), value: liveKPIs?.planning?.en_cours ?? '—', sub: tx(lang, { fr: `${liveKPIs?.planning?.avancement ?? 0}% avancement`, ar: `${liveKPIs?.planning?.avancement ?? 0}% تقدّم`, en: `${liveKPIs?.planning?.avancement ?? 0}% progress`, es: `${liveKPIs?.planning?.avancement ?? 0}% avance`, pt: `${liveKPIs?.planning?.avancement ?? 0}% progresso`, tr: `${liveKPIs?.planning?.avancement ?? 0}% ilerleme` }), icon: Factory, iconBg: 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20', iconColor: 'text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text', nav: 'planning' as DashboardNavTarget, valueFromApi: true, sparkData: liveKPIs?.charts?.spark_ofs || [], sparkColor: '#6366f1' },
      { key: 'eff-rh', label: tx(lang, { fr: 'Effectif Actif', ar: 'العمالة النشطة', en: 'Active Workforce', es: 'Plantilla Activa', pt: 'Efetivo Ativo', tr: 'Aktif Personel' }), value: liveKPIs?.effectifs?.total ?? '—', sub: tx(lang, { fr: `${liveKPIs?.effectifs?.presents ?? 0} présents`, ar: `${liveKPIs?.effectifs?.presents ?? 0} حاضرون`, en: `${liveKPIs?.effectifs?.presents ?? 0} present`, es: `${liveKPIs?.effectifs?.presents ?? 0} presentes`, pt: `${liveKPIs?.effectifs?.presents ?? 0} presentes`, tr: `${liveKPIs?.effectifs?.presents ?? 0} mevcut` }), icon: Users, iconBg: 'bg-emerald-50 dark:bg-emerald-900/30', iconColor: 'text-emerald-600 dark:text-emerald-400', nav: 'effectifs' as DashboardNavTarget, valueFromApi: true, sparkData: liveKPIs?.charts?.spark_presence || [], sparkColor: '#10b981' },
      { key: 'stock', label: tx(lang, { fr: 'Valeur Stock', ar: 'قيمة المخزون', en: 'Stock Value', es: 'Valor de Stock', pt: 'Valor de Estoque', tr: 'Stok Değeri' }), value: stockVal, fullValue: stockFull, sub: tx(lang, { fr: `${liveKPIs?.stock?.nb_alertes ?? 0} alerte(s)`, ar: `${liveKPIs?.stock?.nb_alertes ?? 0} تنبيه`, en: `${liveKPIs?.stock?.nb_alertes ?? 0} alert(s)`, es: `${liveKPIs?.stock?.nb_alertes ?? 0} alerta(s)`, pt: `${liveKPIs?.stock?.nb_alertes ?? 0} alerta(s)`, tr: `${liveKPIs?.stock?.nb_alertes ?? 0} uyarı` }), icon: Package, iconBg: 'bg-amber-50 dark:bg-amber-900/30', iconColor: 'text-amber-600 dark:text-amber-400', nav: 'magasin' as DashboardNavTarget, valueFromApi: true, sparkData: (liveKPIs?.charts?.mouvements_7j || []).map((m:any) => ({ value: m.total_entrees })), sparkColor: '#f59e0b' },
      { key: 'avances', label: tx(lang, { fr: 'Avances', ar: 'السلفات', en: 'Advances', es: 'Anticipos', pt: 'Adiantamentos', tr: 'Avanslar' }), value: avancesVal, fullValue: avancesFull, sub: tx(lang, { fr: `${liveKPIs?.rh?.demandes_attente ?? 0} demande(s)`, ar: `${liveKPIs?.rh?.demandes_attente ?? 0} طلب`, en: `${liveKPIs?.rh?.demandes_attente ?? 0} request(s)`, es: `${liveKPIs?.rh?.demandes_attente ?? 0} solicitud(es)`, pt: `${liveKPIs?.rh?.demandes_attente ?? 0} pedido(s)`, tr: `${liveKPIs?.rh?.demandes_attente ?? 0} talep` }), icon: DollarSign, iconBg: 'bg-violet-50', iconColor: 'text-violet-600', nav: 'effectifs' as DashboardNavTarget, valueFromApi: true, sparkData: [], sparkColor: '#8b5cf6' },
      { key: 'modeles', label: tx(lang, { fr: 'Modèles Actifs', ar: 'النماذج النشطة', en: 'Active Models', es: 'Modelos Activos', pt: 'Modelos Ativos', tr: 'Aktif Modeller' }), value: activeModelsCount.toString(), sub: tx(lang, { fr: 'En planification', ar: 'في التخطيط', en: 'In planning', es: 'En planificación', pt: 'Em planejamento', tr: 'Planlamada' }), icon: Layers, iconBg: 'bg-sky-50 dark:bg-sky-900/30', iconColor: 'text-sky-600 dark:text-sky-400', nav: 'library' as DashboardNavTarget, valueFromApi: false, sparkData: [], sparkColor: '#06b6d4' },
      { key: 'eff-suivi', label: tx(lang, { fr: 'Effectif Présent', ar: 'العمالة الحاضرة', en: 'Present Workforce', es: 'Plantilla Presente', pt: 'Efetivo Presente', tr: 'Mevcut Personel' }), value: totalEffectif.toString(), sub: tx(lang, { fr: "Aujourd'hui", ar: 'اليوم', en: 'Today', es: 'Hoy', pt: 'Hoje', tr: 'Bugün' }), icon: Users, iconBg: 'bg-teal-50 dark:bg-teal-900/30', iconColor: 'text-teal-600 dark:text-teal-400', nav: 'suivi' as DashboardNavTarget, valueFromApi: false, sparkData: [], sparkColor: '#14b8a6' },
      { key: 'trs', label: tx(lang, { fr: 'T.R.S Global', ar: 'TRS الإجمالي', en: 'Global TRS', es: 'TRS Global', pt: 'TRS Global', tr: 'Genel TRS' }), value: `${globalTRS}%`, sub: tx(lang, { fr: 'Synthèse du jour', ar: 'ملخص اليوم', en: "Today's summary", es: 'Resumen del día', pt: 'Resumo do dia', tr: 'Günün özeti' }), icon: Activity, iconBg: 'bg-rose-50 dark:bg-rose-900/30', iconColor: 'text-rose-600 dark:text-rose-400', nav: 'rendement' as DashboardNavTarget, valueFromApi: false, sparkData: [], sparkColor: '#f43f5e' },
      { key: 'pj', label: tx(lang, { fr: 'P° Journalière', ar: 'الإنتاج اليومي', en: 'Daily Output', es: 'P° Diaria', pt: 'P° Diária', tr: 'Günlük Üretim' }), value: pJournaliere.toLocaleString(), sub: tx(lang, { fr: 'Cumul pièces', ar: 'مجموع القطع', en: 'Total pieces', es: 'Total piezas', pt: 'Total de peças', tr: 'Toplam parça' }), icon: TrendingUp, iconBg: 'bg-blue-50 dark:bg-blue-900/30', iconColor: 'text-blue-600 dark:text-blue-400', nav: 'suivi' as DashboardNavTarget, valueFromApi: false, sparkData: (liveKPIs?.charts?.prod_7j || []).map((p:any) => ({ value: p.total })), sparkColor: '#3b82f6' },
    ];
  }, [liveKPIs, activeModelsCount, totalEffectif, globalTRS, pJournaliere, lang]);
}

export default function Dashboard({ models, suivis, planningEvents, settings, setSettings, onOpenAgenda, onNavigateModule }: DashboardProps) {
  const { lang } = useLang();
  const isDark = useIsDark();
  const cc = chartColors(isDark);

  const [liveKPIs, setLiveKPIs] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  // Horloge légère (30 s) pour rafraîchir l'affichage « MAJ il y a … ».
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

  const fetchKPIs = useCallback(() => {
    if (IS_STATIC) {
      setKpiLoading(false);
      return;
    }
    setKpiLoading((prev) => (liveConnected ? prev : true));
    fetch('/api/dashboard/kpis', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setLiveKPIs(data);
          setLastUpdate(Date.now());
        }
        setKpiLoading(false);
      })
      .catch(() => setKpiLoading(false));
  }, [IS_STATIC, liveConnected]);

  useEffect(() => {
    if (IS_STATIC) {
      setKpiLoading(false);
      return;
    }

    let es: EventSource | null = null;
    let pollFallback: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let consecutiveErrors = 0;
    const MAX_ERRORS_BEFORE_FALLBACK = 3;

    const startPollingFallback = () => {
      if (pollFallback || cancelled) return;
      setLiveConnected(false);
      fetchKPIs();
      pollFallback = setInterval(fetchKPIs, 5000);
    };

    try {
      es = new EventSource('/api/dashboard/kpis/stream', { withCredentials: true });

      es.addEventListener('kpis', (evt: MessageEvent) => {
        consecutiveErrors = 0;
        try {
          const data = JSON.parse(evt.data);
          setLiveKPIs(data);
          setLastUpdate(Date.now());
          setLiveConnected(true);
          setKpiLoading(false);
        } catch (err) {
          console.error('SSE parse error', err);
        }
      });

      es.onopen = () => {
        consecutiveErrors = 0;
      };

      es.onerror = () => {
        consecutiveErrors += 1;
        const definitivelyClosed = es && es.readyState === 2;
        const tooManyFailures = consecutiveErrors >= MAX_ERRORS_BEFORE_FALLBACK;
        if (definitivelyClosed || tooManyFailures) {
          setLiveConnected(false);
          if (es) { es.close(); es = null; }
          startPollingFallback();
        }
      };
    } catch {
      startPollingFallback();
    }

    return () => {
      cancelled = true;
      if (es) { es.close(); es = null; }
      if (pollFallback) { clearInterval(pollFallback); pollFallback = null; }
    };
  }, [IS_STATIC, fetchKPIs]);

  const staticLiveKPIs = useMemo(() => {
    if (!IS_STATIC) return null;
    const en_cours = planningEvents.filter(e => e.status === 'IN_PROGRESS').length;
    const planned = planningEvents.filter(e => e.status === 'IN_PROGRESS' || e.status === 'READY').length;
    let avancementSum = 0;
    let avancementCount = 0;
    planningEvents.forEach(e => {
      if (e.status === 'IN_PROGRESS' || e.status === 'DONE') {
        const target = (e as any).quantity || 0;
        const done = (e as any).piecesProduites || 0;
        if (target > 0) {
          avancementSum += Math.min(100, Math.round((done / target) * 100));
          avancementCount += 1;
        }
      }
    });
    const avancement = avancementCount > 0 ? Math.round(avancementSum / avancementCount) : 0;
    return { planning: { en_cours, planned, avancement } };
  }, [IS_STATIC, planningEvents]);

  const effectiveLiveKPIs = liveKPIs ?? staticLiveKPIs;

  const activeModelsCount = useMemo(() => {
    const activeModelIds = new Set<string>();
    planningEvents.forEach(evt => {
      if (evt.status === 'IN_PROGRESS' || evt.status === 'READY') {
        if (evt.modelId) activeModelIds.add(evt.modelId);
      }
    });
    return activeModelIds.size;
  }, [planningEvents]);

  const todayDateStr = new Date().toISOString().split('T')[0];
  const productionStats = useMemo(() => {
    const todaySuivis = suivis.filter(s => s.date === todayDateStr);
    let effectif = 0;
    let totalH = 0;
    let totalTarget = 0;
    let sumTRS = 0;
    let countTRS = 0;
    const alerts: { title: string, trs: number, time: string }[] = [];
    const hourlyAccumulator: Record<string, number> = { h0830: 0, h0930: 0, h1030: 0, h1130: 0, h1430: 0, h1530: 0, h1630: 0, h1730: 0, h1830: 0, h1930: 0 };
    const chaineEffMap = new Map<string, { totalH: number, target: number }>();

    todaySuivis.forEach(suivi => {
      effectif += (suivi.totalWorkers || 0);
      totalH += (suivi.totalHeure || 0);
      const target = suivi.pJournaliere || 400;
      totalTarget += target;
      Object.keys(hourlyAccumulator).forEach(key => {
        hourlyAccumulator[key] += (suivi.sorties?.[key as keyof typeof suivi.sorties] || 0) as number;
      });
      const event = planningEvents.find(e => e.id === suivi.planningId);
      if (event) {
        const chaine = event.chaineId;
        const existing = chaineEffMap.get(chaine) || { totalH: 0, target: 0 };
        chaineEffMap.set(chaine, { totalH: existing.totalH + (suivi.totalHeure || 0), target: existing.target + target });
      }
      const targetPerHour = target / 10;
      let hoursWorked = 0;
      let totalDowntimePenalty = 0;
      ['h0830','h0930','h1030','h1130','h1430','h1530','h1630','h1730','h1830','h1930'].forEach(key => {
        const val = suivi.sorties?.[key as keyof typeof suivi.sorties] as number | undefined;
        if (val !== undefined && val >= 0) { hoursWorked++; if (suivi.downtimes && suivi.downtimes[key]) totalDowntimePenalty += 0.2; }
      });
      if (hoursWorked > 0) {
        const disponibilite = Math.max(0, (hoursWorked - totalDowntimePenalty) / hoursWorked);
        const currentRate = suivi.totalHeure / hoursWorked;
        const performance = Math.min(1, currentRate / targetPerHour);
        const totalDefects = (suivi.defauts || []).reduce((acc, def) => acc + def.quantity, 0);
        const quality = suivi.totalHeure > 0 ? Math.max(0, (suivi.totalHeure - totalDefects) / suivi.totalHeure) : 1;
        const trs = Math.round((disponibilite * performance * quality) * 100);
        sumTRS += trs;
        countTRS++;
        if (trs < 65) {
          alerts.push({ title: tx(lang, { fr: `Alerte TRS ${event?.chaineId || '?'}`, ar: `تنبيه TRS ${event?.chaineId || '?'}`, en: `TRS Alert ${event?.chaineId || '?'}`, es: `Alerta TRS ${event?.chaineId || '?'}`, pt: `Alerta TRS ${event?.chaineId || '?'}`, tr: `TRS Uyarısı ${event?.chaineId || '?'}` }), trs, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        }
      }
    });

    const overallTRS = countTRS > 0 ? Math.round(sumTRS / countTRS) : 0;
    const labels = ['08:30','09:30','10:30','11:30','14:30','15:30','16:30','17:30','18:30','19:30'];
    const keys = ['h0830','h0930','h1030','h1130','h1430','h1530','h1630','h1730','h1830','h1930'];
    let cumPCount = 0;
    let cumTarget = 0;
    const targetPh = suivis.length > 0 ? (totalTarget / 10) : 0;
    const pData = labels.map((label, idx) => {
      const val = hourlyAccumulator[keys[idx]] || 0;
      cumPCount += val;
      cumTarget += targetPh;
      return { time: label, pCount: Math.round(cumPCount), target: Math.round(cumTarget) };
    });
    const colors = ['#6366f1','#8b5cf6','#10b981','#f59e0b','#3b82f6'];
    const eData: any[] = [];
    let cIdx = 0;
    chaineEffMap.forEach((val, chaine) => {
      eData.push({ name: chaine, rendement: val.target > 0 ? Math.min(100, Math.round((val.totalH / val.target) * 100)) : 0, fill: colors[cIdx % colors.length] });
      cIdx++;
    });
    if (eData.length === 0) eData.push({ name: 'CH 1', rendement: 0, fill: '#6366f1' });

    return { totalEffectif: effectif, globalTRS: overallTRS, pJournaliere: totalH, totalTarget, productionData: pData, efficiencyData: eData, andonAlerts: alerts };
  }, [suivis, planningEvents, todayDateStr, lang]);

  const mergedDashboardKpis = useDashboardKpis(effectiveLiveKPIs, activeModelsCount, productionStats.totalEffectif, productionStats.globalTRS, productionStats.pJournaliere, lang);

  // Valeurs animées du Hero (compteur + remplissage anneau/barre depuis 0).
  const ofNumeric = Number(effectiveLiveKPIs?.planning?.en_cours);
  const animProd = useCountUp(productionStats.pJournaliere);
  const animTrs = useCountUp(productionStats.globalTRS);
  const animOf = useCountUp(Number.isFinite(ofNumeric) ? ofNumeric : 0);

  // Salutation selon l'heure + date du jour localisée — touche humaine et vivante.
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return tx(lang, { fr: 'Bonjour', ar: 'صباح الخير', en: 'Good morning', es: 'Buenos días', pt: 'Bom dia', tr: 'Günaydın' });
    if (h < 18) return tx(lang, { fr: 'Bon après-midi', ar: 'مساء الخير', en: 'Good afternoon', es: 'Buenas tardes', pt: 'Boa tarde', tr: 'İyi günler' });
    return tx(lang, { fr: 'Bonsoir', ar: 'مساء الخير', en: 'Good evening', es: 'Buenas noches', pt: 'Boa noite', tr: 'İyi akşamlar' });
  }, [lang]);
  const todayLabel = useMemo(() => {
    const localeMap: Record<string, string> = { fr: 'fr-FR', ar: 'ar-MA', es: 'es-ES', en: 'en-US', pt: 'pt-PT', tr: 'tr-TR' };
    try { return new Date().toLocaleDateString(localeMap[lang] || 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
    catch { return ''; }
  }, [lang]);

  // Variation de production vs hier (données locales = fiable, pas d'estimation).
  const prodTrend = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yStr = d.toISOString().split('T')[0];
    const yProd = suivis.filter(s => s.date === yStr).reduce((a, s) => a + (s.totalHeure || 0), 0);
    if (yProd <= 0) return null;
    return Math.round(((productionStats.pJournaliere - yProd) / yProd) * 100);
  }, [suivis, productionStats.pJournaliere]);

  const [skipReasonModal, setSkipReasonModal] = useState<AppTask | null>(null);
  const [skipReasonText, setSkipReasonText] = useState('');

  const handleUpdateTaskStatus = useCallback((taskId: string, newStatus: AppTask['status'], reason?: string) => {
    setSettings(prev => ({
      ...prev,
      tasks: prev.tasks?.map(task =>
        task.id === taskId ? { ...task, status: newStatus, skipReason: reason } : task
      ) || []
    }));
  }, [setSettings]);

  const handleSkipSubmit = useCallback(() => {
    if (skipReasonModal && skipReasonText.trim()) {
      handleUpdateTaskStatus(skipReasonModal.id, 'SKIPPED', skipReasonText.trim());
      setSkipReasonModal(null);
      setSkipReasonText('');
    } else {
      alert(tx(lang, { fr: 'Veuillez entrer une raison valide.', ar: 'يرجى إدخال سبب صحيح.', en: 'Please enter a valid reason.', es: 'Por favor, introduzca un motivo válido.', pt: 'Por favor, insira um motivo válido.', tr: 'Lütfen geçerli bir neden girin.' }));
    }
  }, [skipReasonModal, skipReasonText, handleUpdateTaskStatus]);

  const todayStr = new Date().toISOString().split('T')[0];
  const pendingTasks = useMemo(() =>
    (settings.tasks || []).filter(t => t.status === 'PENDING' && t.date <= todayStr),
    [settings.tasks, todayStr]
  );

  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  const weekDayLabels: Record<string, string[]> = { fr: ['L','M','M','J','V','S','D'], ar: ['ن','ث','ر','خ','ج','س','ح'], en: ['M','T','W','T','F','S','S'], es: ['L','M','X','J','V','S','D'], pt: ['S','T','Q','Q','S','S','D'], tr: ['P','S','Ç','P','C','C','P'] };
  const currentWeekDayLabels = weekDayLabels[lang] || weekDayLabels.fr;

  const handleExportCSV = useCallback(() => {
    const csvRows = [tx(lang, { fr: 'Heure,Production Reelle,Objectif Dynamique', ar: 'الوقت,الإنتاج الفعلي,الهدف الديناميكي', en: 'Time,Actual Production,Dynamic Target', es: 'Hora,Producción Real,Objetivo Dinámico', pt: 'Hora,Produção Real,Meta Dinâmica', tr: 'Saat,Gerçek Üretim,Dinamik Hedef' })];
    productionStats.productionData.forEach(row => csvRows.push(`${row.time},${row.pCount},${row.target}`));
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `production_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, [productionStats.productionData]);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-dk-bg overflow-hidden">

      {/* HEADER */}
      <div className="bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border px-3 sm:px-4 md:px-6 py-3 sm:py-4 flex justify-between items-center shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl md:text-2xl font-black text-slate-800 dark:text-dk-text tracking-tight truncate">{tx(lang, { fr: 'Tableau de Bord', ar: 'لوحة القيادة', en: 'Dashboard', es: 'Panel de Control', pt: 'Painel de Controle', tr: 'Kontrol Paneli' })}</h1>
            <p className="text-[10px] sm:text-xs text-slate-400 dark:text-dk-muted font-medium hidden sm:block">
              <span className="text-slate-500 dark:text-dk-text-soft font-semibold">{greeting}</span>
              {todayLabel ? <span className="capitalize"> · {todayLabel}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Pastille de statut live — lisible d'un coup d'œil */}
          <span className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold border ${liveConnected ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200/70 dark:border-emerald-900/40' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200/70 dark:border-amber-900/40'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${liveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} aria-hidden />
            {liveConnected ? tx(lang, { fr: 'En direct', ar: 'مباشر', en: 'Live', es: 'En directo', pt: 'Em direto', tr: 'Canlı' }) : tx(lang, { fr: 'Hors ligne', ar: 'غير متصل', en: 'Offline', es: 'Sin conexión', pt: 'Offline', tr: 'Çevrimdışı' })}
          </span>
          {lastUpdate && (
            <span className="hidden md:inline text-[10px] text-slate-400 dark:text-dk-muted font-medium whitespace-nowrap">
              {tx(lang, { fr: 'MAJ', ar: 'تحديث', en: 'Upd.', es: 'Act.', pt: 'Atu.', tr: 'Gün.' })} {relTime(lastUpdate, nowTick, lang)}
            </span>
          )}
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-[1400px] mx-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5 md:space-y-6">

          {/* HERO — pulse usine : production du jour, TRS, OF en cours */}
          {(() => {
            const target = productionStats.totalTarget;
            const pj = Math.round(animProd);
            const pct = target > 0 ? Math.min(100, Math.round((animProd / target) * 100)) : 0;
            const trs = Math.round(animTrs);
            const ringC = 201;
            const ringOffset = ringC * (1 - Math.min(100, Math.max(0, animTrs)) / 100);
            const realTrs = productionStats.globalTRS;
            const trsColor = realTrs >= 75 ? '#10b981' : realTrs >= 50 ? '#f59e0b' : '#f43f5e';
            const ofRaw = effectiveLiveKPIs?.planning?.en_cours;
            const ofEnCours = Number.isFinite(ofNumeric) ? Math.round(animOf) : (ofRaw ?? '—');
            const ofAvancement = effectiveLiveKPIs?.planning?.avancement ?? 0;
            return (
              <div style={{ animation: 'fadeInUp 0.5s ease-out both' }} className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-dk-border">
                {/* Production du jour */}
                <div className="pb-4 sm:pb-0 sm:pr-5">
                  <p className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider">{tx(lang, { fr: 'Production du jour', ar: 'إنتاج اليوم', en: "Today's output", es: 'Producción del día', pt: 'Produção do dia', tr: 'Günün üretimi' })}</p>
                  <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                    <span className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-dk-text tracking-tight tabular-nums leading-none">{pj.toLocaleString()}</span>
                    <span className="text-sm text-slate-400 dark:text-dk-muted font-medium">/ {target.toLocaleString()} {tx(lang, { fr: 'pcs', ar: 'قطعة', en: 'pcs', es: 'pzs', pt: 'pçs', tr: 'adet' })}</span>
                    {prodTrend !== null && (
                      <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-md ${prodTrend >= 0 ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/25' : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/25'}`} title={tx(lang, { fr: 'vs hier', ar: 'مقارنة بالأمس', en: 'vs yesterday', es: 'vs ayer', pt: 'vs ontem', tr: 'düne göre' })}>
                        {prodTrend >= 0 ? '↑' : '↓'} {prodTrend >= 0 ? '+' : ''}{prodTrend}%
                      </span>
                    )}
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-dk-elevated/60 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#10b981' : '#6366f1' }} />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="text-[11px] text-slate-500 dark:text-dk-muted font-medium">{pct}% {tx(lang, { fr: "de l'objectif", ar: 'من الهدف', en: 'of target', es: 'del objetivo', pt: 'da meta', tr: 'hedeften' })}</p>
                    {pct >= 100 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/25 border border-emerald-200/70 dark:border-emerald-900/40 px-1.5 py-0.5 rounded-md">
                        <CheckCircle2 className="w-3 h-3" /> {tx(lang, { fr: 'Objectif atteint', ar: 'تحقّق الهدف', en: 'Target reached', es: 'Objetivo logrado', pt: 'Meta atingida', tr: 'Hedefe ulaşıldı' })}
                      </span>
                    )}
                  </div>
                </div>
                {/* TRS ring */}
                <button type="button" onClick={() => onNavigateModule?.('rendement')} aria-label={tx(lang, { fr: 'Voir le rendement', ar: 'عرض المردودية', en: 'View efficiency', es: 'Ver rendimiento', pt: 'Ver rendimento', tr: 'Verimliliği gör' })} title={tx(lang, { fr: 'TRS = Disponibilité × Performance × Qualité', ar: 'TRS = التوفّر × الأداء × الجودة', en: 'TRS = Availability × Performance × Quality', es: 'TRS = Disponibilidad × Rendimiento × Calidad', pt: 'TRS = Disponibilidade × Desempenho × Qualidade', tr: 'TRS = Kullanılabilirlik × Performans × Kalite' })} className="py-4 sm:py-0 sm:px-5 flex items-center justify-center gap-3 group hover:bg-slate-50/70 dark:hover:bg-dk-bg/40 sm:rounded-lg transition-colors">
                  <div className="relative w-[78px] h-[78px] shrink-0">
                    <svg width="78" height="78" viewBox="0 0 78 78" className="-rotate-90">
                      <circle cx="39" cy="39" r="32" fill="none" className="stroke-slate-100 dark:stroke-dk-bg" strokeWidth="8" />
                      <circle cx="39" cy="39" r="32" fill="none" stroke={trsColor} strokeWidth="8" strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringOffset} className="transition-all duration-700" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-black text-slate-800 dark:text-dk-text leading-none tabular-nums">{trs}%</span>
                      <span className="text-[8px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider mt-0.5">TRS</span>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider">{tx(lang, { fr: 'T.R.S Global', ar: 'TRS الإجمالي', en: 'Global TRS', es: 'TRS Global', pt: 'TRS Global', tr: 'Genel TRS' })}</p>
                    <p className="text-xs text-slate-500 dark:text-dk-muted mt-0.5 font-medium">{tx(lang, { fr: 'Synthèse du jour', ar: 'ملخص اليوم', en: "Today's summary", es: 'Resumen del día', pt: 'Resumo do dia', tr: 'Günün özeti' })}</p>
                  </div>
                </button>
                {/* OF en cours */}
                <button type="button" onClick={() => onNavigateModule?.('planning')} aria-label={tx(lang, { fr: 'Voir le planning', ar: 'عرض التخطيط', en: 'View planning', es: 'Ver planificación', pt: 'Ver planejamento', tr: 'Planlamayı gör' })} className="pt-4 sm:pt-0 sm:pl-5 flex items-center gap-3 group hover:bg-slate-50/70 dark:hover:bg-dk-bg/40 sm:rounded-lg transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-dk-accent/20 flex items-center justify-center shrink-0">
                    <Factory className="w-6 h-6 text-indigo-600 dark:text-dk-accent-text" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider truncate">{tx(lang, { fr: 'OF en cours', ar: 'أوامر الإنتاج الجارية', en: 'OF in progress', es: 'OF en curso', pt: 'OF em andamento', tr: 'Devam eden OF' })}</p>
                    <p className="text-3xl font-black text-slate-800 dark:text-dk-text leading-none tabular-nums mt-1">{ofEnCours}</p>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-dk-elevated/60 overflow-hidden max-w-[120px]">
                      <div className="h-full rounded-full bg-indigo-500 dark:bg-dk-accent transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, ofAvancement))}%` }} />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-dk-muted mt-1 font-medium">{ofAvancement}% {tx(lang, { fr: 'avancement', ar: 'تقدّم', en: 'progress', es: 'avance', pt: 'progresso', tr: 'ilerleme' })}</p>
                  </div>
                </button>
              </div>
            );
          })()}

          {/* KPIs secondaires — accent par catégorie (hors Hero).
              On masque aussi 'eff-suivi' : doublon de 'eff-rh' (même effectif,
              les présents figurent déjà dans le sous-titre de « Effectif Actif »). */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            {mergedDashboardKpis.filter(kpi => !['of', 'trs', 'pj', 'eff-suivi'].includes(kpi.key)).map((kpi, i) => (
              <KpiCard
                key={kpi.key}
                kpi={kpi}
                index={i}
                showLoading={kpiLoading && kpi.valueFromApi}
                onNavigateModule={onNavigateModule}
              />
            ))}
          </div>

          {/* Stock Alert Banner */}
          {liveKPIs?.stock?.alertes?.length > 0 && (
            onNavigateModule ? (
              <button type="button" onClick={() => onNavigateModule('magasin')} className="w-full text-left rounded-xl sm:rounded-2xl border border-amber-200/80 dark:border-dk-border/80 bg-amber-50 dark:bg-dk-elevated/50 px-3 sm:px-4 md:px-5 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 cursor-pointer hover:shadow-md hover:border-amber-300 dark:hover:border-dk-border transition-all duration-200">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-100 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400 dark:text-dk-accent-text" />
                </div>
                <div className="text-xs sm:text-sm min-w-0 flex-1">
                  <strong className="text-amber-900 dark:text-dk-text font-bold">{tx(lang, { fr: 'Alertes Stock', ar: 'تنبيهات المخزون', en: 'Stock Alerts', es: 'Alertas de Stock', pt: 'Alertas de Estoque', tr: 'Stok Uyarıları' })} ({liveKPIs.stock.alertes.length})</strong>
                  <span className="text-amber-700/80 dark:text-dk-text-soft/80 ml-1 sm:ml-2 hidden sm:inline">{liveKPIs.stock.alertes.map((a: any) => `${a.designation} (${a.stock_actuel}/${a.stockAlerte})`).join(' • ')}</span>
                </div>
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400/60 dark:text-dk-muted/60 shrink-0" aria-hidden />
              </button>
            ) : (
              <div className="w-full rounded-xl sm:rounded-2xl border border-amber-200/80 dark:border-dk-border/80 bg-amber-50 dark:bg-dk-elevated/50 px-3 sm:px-4 md:px-5 py-3 sm:py-4 flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-100 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400 dark:text-dk-accent-text" />
                </div>
                <div className="text-xs sm:text-sm min-w-0">
                  <strong className="text-amber-900 dark:text-dk-text font-bold">{tx(lang, { fr: 'Alertes Stock', ar: 'تنبيهات المخزون', en: 'Stock Alerts', es: 'Alertas de Stock', pt: 'Alertas de Estoque', tr: 'Stok Uyarıları' })} ({liveKPIs.stock.alertes.length})</strong>
                  <span className="text-amber-700/80 dark:text-dk-text-soft/80 ml-1 sm:ml-2 hidden sm:inline">{liveKPIs.stock.alertes.map((a: any) => `${a.designation} (${a.stock_actuel}/${a.stockAlerte})`).join(' • ')}</span>
                </div>
              </div>
            )
          )}

          {/* MAIN GRID : Production chart + Centre d'action */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6" style={{ animation: 'fadeInUp 0.5s ease-out both', animationDelay: '120ms' }}>

            {/* Production chart */}
            <div className="lg:col-span-2 bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden flex flex-col">
              <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 bg-slate-50/70 dark:bg-dk-bg/40 border-b border-slate-100 dark:border-dk-border flex items-center justify-between flex-wrap gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-100 dark:bg-dk-accent/20 flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 dark:text-dk-accent-text" />
                  </div>
                  <h2 className="font-bold text-slate-800 dark:text-dk-text text-xs sm:text-sm">{tx(lang, { fr: 'Évolution Production', ar: 'تطور الإنتاج', en: 'Production Trend', es: 'Evolución de Producción', pt: 'Evolução da Produção', tr: 'Üretim Trendi' })}</h2>
                </div>
                <button onClick={handleExportCSV} className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] sm:text-xs transition-colors duration-200">
                  <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">{tx(lang, { fr: 'Export CSV', ar: 'تصدير CSV', en: 'Export CSV', es: 'Exportar CSV', pt: 'Exportar CSV', tr: 'CSV Dışa Aktar' })}</span>
                  <span className="sm:hidden">CSV</span>
                </button>
              </div>
              <div className="p-3 sm:p-4 md:p-5 flex-1">
                <div className="h-[250px] sm:h-[300px] md:h-[340px] w-full">
                  <ResponsiveChart>
                    <AreaChart data={productionStats.productionData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cc.grid} />
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: cc.axis, fontSize: 10, fontWeight: 600 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: cc.axis, fontSize: 10, fontWeight: 600 }} dx={-5} width={30} />
                      <RechartsTooltip contentStyle={{ backgroundColor: cc.tooltipBg, color: cc.tooltipText, borderRadius: '10px', border: 'none', boxShadow: '0 8px 16px rgba(0,0,0,0.1)', fontSize: '11px' }} itemStyle={{ fontWeight: 'bold' }} labelStyle={{ color: cc.tooltipText, fontWeight: 'bold', marginBottom: '4px' }} />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                      <Area type="monotone" isAnimationActive={false} name={tx(lang, { fr: 'P° Réelle', ar: 'الإنتاج الفعلي', en: 'Actual Output', es: 'P° Real', pt: 'P° Real', tr: 'Gerçek Üretim' })} dataKey="pCount" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCount)" />
                      <Area type="monotone" isAnimationActive={false} name={tx(lang, { fr: 'Objectif', ar: 'الهدف', en: 'Target', es: 'Objetivo', pt: 'Meta', tr: 'Hedef' })} dataKey="target" stroke={cc.grid} strokeWidth={2} strokeDasharray="5 5" fill="none" />
                    </AreaChart>
                  </ResponsiveChart>
                </div>
              </div>
            </div>

            {/* Centre d'action : alertes Andon (urgence haute) + tâches */}
            <div className="lg:col-span-1 bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden flex flex-col">
              <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 bg-slate-50/70 dark:bg-dk-bg/40 border-b border-slate-100 dark:border-dk-border flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                  <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 dark:text-rose-400" />
                </div>
                <h2 className="font-bold text-slate-800 dark:text-dk-text text-xs sm:text-sm">{tx(lang, { fr: "Centre d'action", ar: 'مركز الإجراءات', en: 'Action center', es: 'Centro de acción', pt: 'Centro de ação', tr: 'Eylem merkezi' })}</h2>
                {(productionStats.andonAlerts.length + pendingTasks.length) > 0 && (
                  <span className="ml-auto text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{productionStats.andonAlerts.length + pendingTasks.length}</span>
                )}
              </div>
              <div className="p-3 sm:p-4 flex-1" style={{ minHeight: '260px' }}>
                <div className="h-full overflow-y-auto space-y-2 sm:space-y-2.5 custom-scrollbar">
                  {productionStats.andonAlerts.map((alert, idx) => (
                    <div key={`andon-${idx}`} className="flex gap-2.5 items-start p-2.5 sm:p-3 bg-rose-50 dark:bg-dk-elevated/50 rounded-lg border border-rose-200/60 dark:border-dk-border/60">
                      <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-xs sm:text-sm font-bold text-rose-900 dark:text-dk-text truncate">{alert.title}</p>
                          <span className="text-[10px] font-bold text-rose-500 bg-rose-100 dark:bg-dk-elevated dark:text-dk-text-soft px-1.5 py-0.5 rounded-full shrink-0">{alert.time}</span>
                        </div>
                        <p className="text-[10px] sm:text-xs text-rose-700 dark:text-dk-text-soft mt-0.5 font-medium">{tx(lang, { fr: 'Performance critique à', ar: 'أداء حرج عند', en: 'Critical performance at', es: 'Rendimiento crítico en', pt: 'Desempenho crítico em', tr: 'Kritik performans' })} <span className="font-black text-rose-900 dark:text-dk-text">{alert.trs}%</span></p>
                      </div>
                    </div>
                  ))}
                  {pendingTasks.map(task => (
                    <div key={task.id} className="bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border/60 rounded-lg p-2.5 sm:p-3 flex flex-col gap-2">
                      <div className="cursor-pointer" onClick={() => onOpenAgenda()}>
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide truncate">{task.assigneeName}</span>
                          <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0 ${task.date < todayStr ? 'text-rose-600 dark:text-rose-400 bg-rose-100 border border-rose-200' : 'text-amber-600 dark:text-amber-400 bg-amber-100 border border-amber-200'}`}>
                            <CalendarClock className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {task.date}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-dk-text leading-tight">{task.text}</p>
                      </div>
                      <div className="flex gap-1.5 pt-2 border-t border-slate-200 dark:border-dk-border/60">
                        <button onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'DONE_OK'); }} className="flex-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-[9px] sm:text-[10px] font-bold py-1.5 rounded-lg transition-colors border border-emerald-200/60">OK</button>
                        <button onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'DONE_NOT_OK'); }} className="flex-1 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-[9px] sm:text-[10px] font-bold py-1.5 rounded-lg transition-colors border border-rose-200/60">NOT OK</button>
                        <button onClick={(e) => { e.stopPropagation(); setSkipReasonModal(task as AppTask); }} className="flex-1 bg-slate-100 dark:bg-dk-elevated/60 text-slate-600 dark:text-dk-text-soft hover:bg-slate-200 text-[9px] sm:text-[10px] font-bold py-1.5 rounded-lg transition-colors border border-slate-200 dark:border-dk-border/60">{tx(lang, { fr: 'IGNORER', ar: 'تجاوز', en: 'SKIP', es: 'OMITIR', pt: 'IGNORAR', tr: 'ATLA' })}</button>
                      </div>
                    </div>
                  ))}
                  {productionStats.andonAlerts.length === 0 && pendingTasks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-dk-elevated/50 border border-emerald-200/60 dark:border-dk-border/60 flex items-center justify-center mb-3">
                        <CheckCircle2 className="w-7 h-7 text-emerald-400" strokeWidth={1.5} />
                      </div>
                      <p className="text-xs sm:text-sm font-bold text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Tout est sous contrôle', ar: 'كل شيء تحت السيطرة', en: 'All under control', es: 'Todo bajo control', pt: 'Tudo sob controle', tr: 'Her şey kontrol altında' })}</p>
                      <p className="text-[10px] sm:text-xs text-slate-300 dark:text-dk-muted mt-1">{tx(lang, { fr: 'Aucune alerte ni tâche', ar: 'لا تنبيهات ولا مهام', en: 'No alerts or tasks', es: 'Sin alertas ni tareas', pt: 'Sem alertas ou tarefas', tr: 'Uyarı veya görev yok' })}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM GRID : Rendement chaînes + Calendrier */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6" style={{ animation: 'fadeInUp 0.5s ease-out both', animationDelay: '200ms' }}>

            {/* RENDEMENT CHAÎNES */}
            <div className="lg:col-span-2 bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
              <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 bg-slate-50/70 dark:bg-dk-bg/40 border-b border-slate-100 dark:border-dk-border flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-100 dark:bg-dk-accent/20 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 dark:text-dk-accent-text" />
                </div>
                <h2 className="font-bold text-slate-800 dark:text-dk-text text-xs sm:text-sm">{tx(lang, { fr: 'Rendement Chaînes', ar: 'مردودية الخطوط', en: 'Line Efficiency', es: 'Rendimiento de Líneas', pt: 'Rendimento das Linhas', tr: 'Hat Verimliliği' })}</h2>
              </div>
              <div className="p-3 sm:p-4 md:p-5">
                <div className="h-[180px] sm:h-[200px] w-full">
                  <ResponsiveChart>
                      <BarChart data={productionStats.efficiencyData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={cc.grid} />
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: cc.axis, fontSize: 11, fontWeight: 700 }} width={45} />
                      <RechartsTooltip cursor={{ fill: cc.tooltipBg }} contentStyle={{ backgroundColor: cc.tooltipBg, color: cc.tooltipText, borderRadius: '10px', border: 'none', boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }} formatter={(val: number) => [`${val}%`, tx(lang, { fr: 'Rendement', ar: 'المردودية', en: 'Efficiency', es: 'Rendimiento', pt: 'Rendimento', tr: 'Verimlilik' })]} />
                      <Bar dataKey="rendement" isAnimationActive={false} radius={[0, 6, 6, 0]} maxBarSize={20}>
                        {productionStats.efficiencyData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveChart>
                </div>
              </div>
            </div>

            {/* CALENDRIER PRODUCTION */}
            <div className="lg:col-span-1 bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
              <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 bg-slate-50/70 dark:bg-dk-bg/40 border-b border-slate-100 dark:border-dk-border flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="font-bold text-slate-800 dark:text-dk-text text-xs sm:text-sm">{tx(lang, { fr: 'Planning', ar: 'التخطيط', en: 'Planning', es: 'Planificación', pt: 'Planejamento', tr: 'Planlama' })}</h2>
              </div>
              <div className="p-3 sm:p-4 md:p-5">
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center mb-2 sm:mb-3">
                  {currentWeekDayLabels.map((d, idx) => (
                    <div key={idx} className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-dk-muted py-1 sm:py-1.5">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5">
                  {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`e-${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const hasProd = (liveKPIs?.charts?.calendar_prod_days || []).includes(day);
                    const isToday = day === new Date().getDate();
                    return (
                      <div key={i} className={`relative rounded-lg border flex items-center justify-center text-[10px] sm:text-xs font-medium py-1.5 sm:py-2 transition-colors duration-200
                        ${isToday ? 'border-indigo-600 bg-indigo-600 text-white font-bold' : 'border-slate-100 dark:border-dk-border hover:border-slate-200 dark:hover:border-dk-border/80'}
                        ${hasProd && !isToday ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 font-bold' : ''}
                      `}>
                        {day}
                        {hasProd && !isToday && <div className="absolute -bottom-0.5 w-1 sm:w-1.5 h-1 sm:h-1.5 bg-emerald-500 rounded-full" />}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-100 dark:border-dk-border flex gap-3 sm:gap-4 text-[10px] sm:text-xs">
                  <div className="flex items-center gap-1.5 sm:gap-2 font-medium text-slate-500 dark:text-dk-muted"><div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-emerald-100 border border-emerald-200" /> {tx(lang, { fr: 'Prod', ar: 'إنتاج', en: 'Prod', es: 'Prod', pt: 'Prod', tr: 'Üretim' })}</div>
                  <div className="flex items-center gap-1.5 sm:gap-2 font-medium text-slate-500 dark:text-dk-muted"><div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-indigo-600" /> {tx(lang, { fr: "Aujourd'hui", ar: 'اليوم', en: 'Today', es: 'Hoy', pt: 'Hoje', tr: 'Bugün' })}</div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* SKIP MODAL */}
      {skipReasonModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 dark:bg-dk-bg/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white dark:bg-dk-surface rounded-xl sm:rounded-2xl w-full max-w-sm sm:max-w-md overflow-hidden shadow-xl dark:shadow-dk-lg border border-slate-200 dark:border-dk-border">
            <div className="h-1 w-full bg-amber-500" />
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-dk-border flex justify-between items-center">
              <h3 className="font-bold text-slate-800 dark:text-dk-text text-base sm:text-lg">{tx(lang, { fr: "Motif d'annulation", ar: 'سبب الإلغاء', en: 'Cancellation reason', es: 'Motivo de cancelación', pt: 'Motivo do cancelamento', tr: 'İptal nedeni' })}</h3>
              <button onClick={() => { setSkipReasonModal(null); setSkipReasonText(''); }} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-dk-elevated/60 text-slate-400 dark:text-dk-muted hover:text-slate-600 transition-colors">
                <AlertTriangle className="w-5 h-5 opacity-0" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
              <div className="bg-amber-50 dark:bg-dk-elevated/50 text-amber-800 dark:text-dk-text-soft p-3 sm:p-4 rounded-lg sm:rounded-xl text-xs sm:text-sm border border-amber-200/60 dark:border-dk-border/60 flex gap-2 sm:gap-3 items-start">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400 dark:text-dk-accent-text" />
                </div>
                <p>{tx(lang, { fr: "Vous êtes sur le point d'ignorer la tâche :", ar: 'أنت على وشك تجاوز المهمة:', en: 'You are about to skip the task:', es: 'Está a punto de omitir la tarea:', pt: 'Você está prestes a ignorar a tarefa:', tr: 'Görevi atlamak üzeresiniz:' })} <br /><span className="font-bold">"{skipReasonModal.text}"</span>.</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{tx(lang, { fr: 'Raison / Justification', ar: 'السبب / التبرير', en: 'Reason / Justification', es: 'Motivo / Justificación', pt: 'Motivo / Justificativa', tr: 'Neden / Gerekçe' })}</label>
                <textarea value={skipReasonText} onChange={(e) => setSkipReasonText(e.target.value)} placeholder={tx(lang, { fr: 'Ex: Machine en panne...', ar: 'مثال: عطل في الآلة...', en: 'E.g.: Machine breakdown...', es: 'Ej: Máquina averiada...', pt: 'Ex: Máquina avariada...', tr: 'Örn: Makine arızası...' })} className="w-full border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all shadow-sm dark:shadow-dk-sm h-20 sm:h-24 resize-none" autoFocus />
              </div>
            </div>
            <div className="p-3 sm:p-4 bg-slate-50 dark:bg-dk-bg/80 border-t border-slate-100 dark:border-dk-border flex justify-end gap-2">
              <button onClick={() => { setSkipReasonModal(null); setSkipReasonText(''); }} className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:hover:bg-dk-elevated/60 rounded-lg sm:rounded-xl transition-colors">{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}</button>
              <button onClick={handleSkipSubmit} disabled={!skipReasonText.trim()} className="px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed">{tx(lang, { fr: 'Confirmer', ar: 'تأكيد', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' })}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
