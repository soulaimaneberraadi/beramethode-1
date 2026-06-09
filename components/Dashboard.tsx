import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ModelData, SuiviData, PlanningEvent, AppSettings, AppTask } from '../types';
import { Users, Activity, Layers, TrendingUp, Download, AlertTriangle, ShieldAlert, CheckCircle2, ListTodo, CalendarClock, ChevronRight, Factory, Package, DollarSign, RefreshCw, Calendar as CalendarIcon } from 'lucide-react';
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

const KpiCard = React.memo(function KpiCard({ kpi, showLoading, onNavigateModule }: {
  kpi: ReturnType<typeof useDashboardKpis>[number];
  showLoading: boolean;
  onNavigateModule?: (view: DashboardNavTarget) => void;
}) {
  const Inner = (
    <>
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${kpi.iconBg} flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}>
        <kpi.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${kpi.iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">{kpi.label}</p>
        <div className="flex items-center gap-2">
          <p className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-800 leading-none tabular-nums tracking-tight">
            {showLoading ? <span className="text-slate-200 animate-pulse">···</span> : kpi.value}
          </p>
          {kpi.sparkData && kpi.sparkData.length > 0 && (
            <Sparkline data={kpi.sparkData} color={kpi.sparkColor || '#6366f1'} />
          )}
        </div>
        <p className="text-[10px] sm:text-xs text-slate-500 mt-1 font-medium truncate">{kpi.sub}</p>
      </div>
      {onNavigateModule && (
        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:bg-indigo-100 shrink-0">
          <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-slate-400 group-hover:text-indigo-600" aria-hidden />
        </div>
      )}
    </>
  );
  const shell = 'bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-5 border border-slate-200/80 shadow-sm flex items-center gap-3 sm:gap-4 group hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer';
  if (onNavigateModule) {
    return (
      <button key={kpi.key} type="button" onClick={() => onNavigateModule(kpi.nav)} className={`${shell} w-full text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:ring-offset-2`}>
        {Inner}
      </button>
    );
  }
  return <div key={kpi.key} className={shell}>{Inner}</div>;
});

function useDashboardKpis(liveKPIs: any, activeModelsCount: number, totalEffectif: number, globalTRS: number, pJournaliere: number) {
  return useMemo(() => {
    const stockVal = liveKPIs?.stock?.valeur_totale != null ? `${(liveKPIs.stock.valeur_totale / 1000).toFixed(1)}k` : '—';
    const avancesVal = liveKPIs?.rh?.avances_encours != null ? `${(liveKPIs.rh.avances_encours / 1000).toFixed(1)}k` : '—';
    return [
      { key: 'of', label: 'OF En Cours', value: liveKPIs?.planning?.en_cours ?? '—', sub: `${liveKPIs?.planning?.avancement ?? 0}% avancement`, icon: Factory, iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600', nav: 'planning' as DashboardNavTarget, valueFromApi: true, sparkData: liveKPIs?.charts?.spark_ofs || [], sparkColor: '#6366f1' },
      { key: 'eff-rh', label: 'Effectif Actif', value: liveKPIs?.effectifs?.total ?? '—', sub: `${liveKPIs?.effectifs?.presents ?? 0} présents`, icon: Users, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', nav: 'effectifs' as DashboardNavTarget, valueFromApi: true, sparkData: liveKPIs?.charts?.spark_presence || [], sparkColor: '#10b981' },
      { key: 'stock', label: 'Valeur Stock', value: stockVal, sub: `${liveKPIs?.stock?.nb_alertes ?? 0} alerte(s)`, icon: Package, iconBg: 'bg-amber-50', iconColor: 'text-amber-600', nav: 'magasin' as DashboardNavTarget, valueFromApi: true, sparkData: (liveKPIs?.charts?.mouvements_7j || []).map((m:any) => ({ value: m.total_entrees })), sparkColor: '#f59e0b' },
      { key: 'avances', label: 'Avances', value: avancesVal, sub: `${liveKPIs?.rh?.demandes_attente ?? 0} demande(s)`, icon: DollarSign, iconBg: 'bg-violet-50', iconColor: 'text-violet-600', nav: 'effectifs' as DashboardNavTarget, valueFromApi: true, sparkData: [], sparkColor: '#8b5cf6' },
      { key: 'modeles', label: 'Modèles Actifs', value: activeModelsCount.toString(), sub: 'En planification', icon: Layers, iconBg: 'bg-sky-50', iconColor: 'text-sky-600', nav: 'library' as DashboardNavTarget, valueFromApi: false, sparkData: [], sparkColor: '#06b6d4' },
      { key: 'eff-suivi', label: 'Effectif Présent', value: totalEffectif.toString(), sub: "Aujourd'hui", icon: Users, iconBg: 'bg-teal-50', iconColor: 'text-teal-600', nav: 'suivi' as DashboardNavTarget, valueFromApi: false, sparkData: [], sparkColor: '#14b8a6' },
      { key: 'trs', label: 'T.R.S Global', value: `${globalTRS}%`, sub: 'Synthèse du jour', icon: Activity, iconBg: 'bg-rose-50', iconColor: 'text-rose-600', nav: 'rendement' as DashboardNavTarget, valueFromApi: false, sparkData: [], sparkColor: '#f43f5e' },
      { key: 'pj', label: 'P° Journalière', value: pJournaliere.toLocaleString(), sub: 'Cumul pièces', icon: TrendingUp, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', nav: 'suivi' as DashboardNavTarget, valueFromApi: false, sparkData: (liveKPIs?.charts?.prod_7j || []).map((p:any) => ({ value: p.total })), sparkColor: '#3b82f6' },
    ];
  }, [liveKPIs, activeModelsCount, totalEffectif, globalTRS, pJournaliere]);
}

export default function Dashboard({ models, suivis, planningEvents, settings, setSettings, onOpenAgenda, onNavigateModule }: DashboardProps) {

  const [liveKPIs, setLiveKPIs] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  // "live" turns true as soon as the SSE stream delivers its first message.
  // Used only by the small refresh button — no banner, no toast.
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

  // One-shot fetch — used for the manual Refresh button and as a fallback
  // when the SSE stream is unavailable (e.g. static deploy, proxy issue).
  // We only flip kpiLoading when the SSE stream is *not* connected, so a
  // manual refresh while live doesn't briefly grey out the values.
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

  // Instant push updates via Server-Sent Events (WhatsApp-style).
  // The server pushes a new payload only when the underlying data changes
  // (event-driven via the in-process bus), so the UI stays in sync with
  // effectively zero perceptible delay.
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
        consecutiveErrors = 0; // any successful push resets the failure budget
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
        // EventSource silently retries forever; we need our own ceiling so a
        // 401 / 404 / server shutdown eventually triggers the HTTP fallback
        // instead of looping invisibly in the background.
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

  // Derive a minimal KPI shape from local state when the backend is absent
  // (Vercel static deployment). Stock / HR cards still read '—' because that
  // data lives in tables that are not synced to Supabase.
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
          alerts.push({ title: `Alerte TRS ${event?.chaineId || '?'}`, trs, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
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

    return { totalEffectif: effectif, globalTRS: overallTRS, pJournaliere: totalH, productionData: pData, efficiencyData: eData, andonAlerts: alerts };
  }, [suivis, planningEvents, todayDateStr]);

  const mergedDashboardKpis = useDashboardKpis(effectiveLiveKPIs, activeModelsCount, productionStats.totalEffectif, productionStats.globalTRS, productionStats.pJournaliere);

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
      alert('Veuillez entrer une raison valide.');
    }
  }, [skipReasonModal, skipReasonText, handleUpdateTaskStatus]);

  const todayStr = new Date().toISOString().split('T')[0];
  const pendingTasks = useMemo(() => 
    (settings.tasks || []).filter(t => t.status === 'PENDING' && t.date <= todayStr),
    [settings.tasks, todayStr]
  );

  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  const handleExportCSV = useCallback(() => {
    const csvRows = ['Heure,Production Reelle,Objectif Dynamique'];
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
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 via-white to-slate-50 overflow-hidden">

      {/* HEADER */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/80 px-3 sm:px-4 md:px-6 py-3 sm:py-4 flex justify-between items-center shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-[18px] bg-[linear-gradient(135deg,#4f46e5_0%,#7c3aed_48%,#0f766e_100%)] flex items-center justify-center text-white shadow-[0_18px_38px_-18px_rgba(79,70,229,0.7)] ring-1 ring-white/50">
              <TrendingUp className="w-4.5 h-4.5 sm:w-5 sm:h-5" strokeWidth={2.3} />
            </div>
            <div className="absolute inset-0 rounded-[18px] bg-white/20 blur-xl scale-90 -z-10" />
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-emerald-400 rounded-full border-2 border-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg md:text-xl font-black text-slate-800 tracking-tight truncate">Tableau de Bord</h1>
            <p className="text-[10px] sm:text-xs text-slate-400 font-medium hidden sm:block">Vue d&apos;ensemble synchronisee automatiquement</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Bouton Refresh manuel — discret, sans bannière. Les KPIs se
              mettent a jour en temps reel via SSE (push instantane). */}
          <button
            type="button"
            onClick={fetchKPIs}
            disabled={kpiLoading}
            title={
              liveConnected
                ? `En direct${lastUpdate ? ` - dernier MAJ ${new Date(lastUpdate).toLocaleTimeString()}` : ''}`
                : 'Hors ligne - cliquer pour rafraichir'
            }
            aria-label="Rafraichir les KPIs"
            className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center text-slate-600 hover:text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${kpiLoading ? 'animate-spin' : ''}`} />
            {/* Live status dot: green pulse when SSE stream is active,
                amber when we fell back to polling. */}
            <span
              className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                liveConnected
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-amber-400'
              }`}
              aria-hidden
            />
          </button>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-[1400px] mx-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

          {/* KPIs - 2 cols mobile, 4 cols desktop */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            {mergedDashboardKpis.map(kpi => (
              <KpiCard
                key={kpi.key}
                kpi={kpi}
                showLoading={kpiLoading && kpi.valueFromApi}
                onNavigateModule={onNavigateModule}
              />
            ))}
          </div>

          {/* Stock Alert Banner */}
          {liveKPIs?.stock?.alertes?.length > 0 && (
            onNavigateModule ? (
              <button type="button" onClick={() => onNavigateModule('magasin')} className="w-full text-left rounded-xl sm:rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-3 sm:px-4 md:px-5 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 cursor-pointer hover:shadow-md hover:border-amber-300 transition-all duration-200">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                </div>
                <div className="text-xs sm:text-sm min-w-0 flex-1">
                  <strong className="text-amber-900 font-bold">Alertes Stock ({liveKPIs.stock.alertes.length})</strong>
                  <span className="text-amber-700/80 ml-1 sm:ml-2 hidden sm:inline">{liveKPIs.stock.alertes.map((a: any) => `${a.designation} (${a.stock_actuel}/${a.stockAlerte})`).join(' • ')}</span>
                </div>
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600/60 shrink-0" aria-hidden />
              </button>
            ) : (
              <div className="w-full rounded-xl sm:rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-3 sm:px-4 md:px-5 py-3 sm:py-4 flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                </div>
                <div className="text-xs sm:text-sm min-w-0">
                  <strong className="text-amber-900 font-bold">Alertes Stock ({liveKPIs.stock.alertes.length})</strong>
                  <span className="text-amber-700/80 ml-1 sm:ml-2 hidden sm:inline">{liveKPIs.stock.alertes.map((a: any) => `${a.designation} (${a.stock_actuel}/${a.stockAlerte})`).join(' • ')}</span>
                </div>
              </div>
            )
          )}

          {/* MAIN GRID: Production Chart + Tasks + Calendar + Efficiency + Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6">

            {/* LEFT COL: Tasks + Calendar */}
            <div className="lg:col-span-1 space-y-4 sm:space-y-5 md:space-y-6">

              {/* TASKS */}
              <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
                <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-2.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <ListTodo className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
                    </div>
                    <h2 className="font-bold text-slate-800 text-xs sm:text-sm">Tâches</h2>
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">{pendingTasks.length} en attente</span>
                </div>
                <div className="p-3 sm:p-4 md:p-5 flex-1 flex flex-col">
                  <p className="text-[10px] sm:text-xs text-slate-400 mb-3 sm:mb-4 font-medium hidden sm:block">Aujourd'hui et retards. Cliquez pour ouvrir l'Agenda.</p>
                  <div className="flex-1 overflow-y-auto space-y-2 sm:space-y-3 custom-scrollbar">
                    {pendingTasks.map(task => (
                      <div key={task.id} className="bg-slate-50/80 border border-slate-200/60 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5 hover:border-indigo-300 hover:shadow-sm transition-all duration-200 flex flex-col gap-2 sm:gap-3">
                        <div className="cursor-pointer" onClick={() => onOpenAgenda()}>
                          <div className="flex justify-between items-start mb-1 sm:mb-1.5">
                            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">{task.assigneeName}</span>
                            <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 ${task.date < todayStr ? 'text-rose-600 bg-rose-100 border border-rose-200' : 'text-amber-600 bg-amber-100 border border-amber-200'}`}>
                              <CalendarClock className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {task.date}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm font-bold text-slate-700 leading-tight">{task.text}</p>
                        </div>
                        <div className="flex gap-1.5 sm:gap-2 pt-2 sm:pt-2.5 border-t border-slate-200/60">
                          <button onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'DONE_OK'); }} className="flex-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[9px] sm:text-[10px] font-bold py-1.5 sm:py-2 rounded-lg transition-colors border border-emerald-200/60">OK</button>
                          <button onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'DONE_NOT_OK'); }} className="flex-1 bg-rose-50 text-rose-700 hover:bg-rose-100 text-[9px] sm:text-[10px] font-bold py-1.5 sm:py-2 rounded-lg transition-colors border border-rose-200/60">NOT OK</button>
                          <button onClick={(e) => { e.stopPropagation(); setSkipReasonModal(task as AppTask); }} className="flex-1 bg-slate-100 text-slate-600 hover:bg-slate-200 text-[9px] sm:text-[10px] font-bold py-1.5 sm:py-2 rounded-lg transition-colors border border-slate-200/60">SKIP</button>
                        </div>
                      </div>
                    ))}
                    {pendingTasks.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-10 sm:py-16 text-center">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/60 flex items-center justify-center shadow-inner mb-3 sm:mb-4">
                          <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400" strokeWidth={1.5} />
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-slate-400">Aucune tâche</p>
                        <p className="text-[10px] sm:text-xs text-slate-300 mt-1 hidden sm:block">Tout est à jour</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* CALENDAR */}
              <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center gap-2 sm:gap-2.5">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                  </div>
                  <h2 className="font-bold text-slate-800 text-xs sm:text-sm">Planning</h2>
                </div>
                <div className="p-3 sm:p-4 md:p-5">
                  <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center mb-2 sm:mb-3">
                    {['L','M','M','J','V','S','D'].map((d, idx) => (
                      <div key={idx} className="text-[9px] sm:text-[10px] font-bold text-slate-400 py-1 sm:py-1.5">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5">
                    {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`e-${i}`} />)}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const hasProd = (liveKPIs?.charts?.calendar_prod_days || []).includes(day);
                      const isToday = day === new Date().getDate();
                      return (
                        <div key={i} className={`relative rounded-lg sm:rounded-xl border flex items-center justify-center text-[10px] sm:text-xs font-medium py-1.5 sm:py-2 transition-all duration-200
                          ${isToday ? 'border-indigo-500 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-bold shadow-md sm:shadow-lg shadow-indigo-500/30 scale-105' : 'border-slate-100 hover:border-slate-200'}
                          ${hasProd && !isToday ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60 font-bold' : ''}
                        `}>
                          {day}
                          {hasProd && !isToday && <div className="absolute -bottom-0.5 w-1 sm:w-1.5 h-1 sm:h-1.5 bg-emerald-500 rounded-full shadow-sm" />}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 sm:mt-5 pt-3 sm:pt-4 border-t border-slate-100 flex gap-3 sm:gap-4 text-[10px] sm:text-xs">
                    <div className="flex items-center gap-1.5 sm:gap-2 font-medium text-slate-500"><div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-emerald-100 border border-emerald-200" /> Prod</div>
                    <div className="flex items-center gap-1.5 sm:gap-2 font-medium text-slate-500"><div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-indigo-500 shadow-sm" /> Aujourd'hui</div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT AREA: Production Chart */}
            <div className="lg:col-span-2 bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
              <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
                  </div>
                  <h2 className="font-bold text-slate-800 text-xs sm:text-sm">Évolution Production</h2>
                </div>
                <button onClick={handleExportCSV} className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold text-[10px] sm:text-xs shadow-lg shadow-indigo-500/30 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5">
                  <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Export CSV</span>
                  <span className="sm:hidden">CSV</span>
                </button>
              </div>
              <div className="p-3 sm:p-4 md:p-5 flex-1">
                <div className="h-[250px] sm:h-[300px] md:h-[350px] w-full">
                  <ResponsiveChart>
                    <AreaChart data={productionStats.productionData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} dx={-5} width={30} />
                      <RechartsTooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 8px 16px rgba(0,0,0,0.1)', fontSize: '11px' }} itemStyle={{ fontWeight: 'bold' }} labelStyle={{ color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }} />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                      <Area type="monotone" name="P° Réelle" dataKey="pCount" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCount)" />
                      <Area type="monotone" name="Objectif" dataKey="target" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5" fill="none" />
                    </AreaChart>
                  </ResponsiveChart>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM GRID: Efficiency + Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6">

            {/* EFFICIENCY */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
                </div>
                <h2 className="font-bold text-slate-800 text-xs sm:text-sm">Rendement Chaînes</h2>
              </div>
              <div className="p-3 sm:p-4 md:p-5">
                <div className="h-[180px] sm:h-[200px] w-full">
                  <ResponsiveChart>
                    <BarChart data={productionStats.efficiencyData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }} width={45} />
                      <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }} formatter={(val: number) => [`${val}%`, 'Rendement']} />
                      <Bar dataKey="rendement" radius={[0, 6, 6, 0]} maxBarSize={20}>
                        {productionStats.efficiencyData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveChart>
                </div>
              </div>
            </div>

            {/* ANDON ALERTS */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
              <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600" />
                </div>
                <h2 className="font-bold text-slate-800 text-xs sm:text-sm">Alertes Andon</h2>
              </div>
              <div className="p-3 sm:p-4 md:p-5 flex-1" style={{ minHeight: '200px' }}>
                <div className="h-full overflow-y-auto space-y-2 sm:space-y-3 custom-scrollbar">
                  {productionStats.andonAlerts.map((alert, idx) => (
                    <div key={idx} className="flex gap-2 sm:gap-3 items-start p-2.5 sm:p-3 md:p-3.5 bg-gradient-to-r from-rose-50 to-orange-50 rounded-lg sm:rounded-xl border border-rose-200/60 hover:shadow-sm transition-all duration-200">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-xs sm:text-sm font-bold text-rose-900 truncate">{alert.title}</p>
                          <span className="text-[10px] sm:text-xs font-bold text-rose-500 bg-rose-100 px-1.5 sm:px-2 py-0.5 rounded-full shrink-0">{alert.time}</span>
                        </div>
                        <p className="text-[10px] sm:text-xs text-rose-700 mt-0.5 sm:mt-1 font-medium">Performance critique à <span className="font-black text-rose-900">{alert.trs}%</span></p>
                      </div>
                    </div>
                  ))}
                  {productionStats.andonAlerts.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 sm:py-16 text-center">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/60 flex items-center justify-center shadow-inner mb-3 sm:mb-4">
                        <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400" strokeWidth={1.5} />
                      </div>
                      <p className="text-xs sm:text-sm font-bold text-slate-400">Aucune alerte</p>
                      <p className="text-[10px] sm:text-xs text-slate-300 mt-1 hidden sm:block">Tout fonctionne normalement</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* SKIP MODAL */}
      {skipReasonModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl w-full max-w-sm sm:max-w-md overflow-hidden shadow-2xl border border-slate-200/80">
            <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 to-orange-500" />
            <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-base sm:text-lg">Motif d'annulation</h3>
              <button onClick={() => { setSkipReasonModal(null); setSkipReasonText(''); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <AlertTriangle className="w-5 h-5 opacity-0" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 text-amber-800 p-3 sm:p-4 rounded-lg sm:rounded-xl text-xs sm:text-sm border border-amber-200/60 flex gap-2 sm:gap-3 items-start">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
                </div>
                <p>Vous êtes sur le point d'ignorer la tâche : <br /><span className="font-bold">"{skipReasonModal.text}"</span>.</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Raison / Justification</label>
                <textarea value={skipReasonText} onChange={(e) => setSkipReasonText(e.target.value)} placeholder="Ex: Machine en panne..." className="w-full border border-slate-200 bg-white rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all shadow-sm h-20 sm:h-24 resize-none" autoFocus />
              </div>
            </div>
            <div className="p-3 sm:p-4 bg-slate-50/80 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => { setSkipReasonModal(null); setSkipReasonText(''); }} className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg sm:rounded-xl transition-colors">Annuler</button>
              <button onClick={handleSkipSubmit} disabled={!skipReasonText.trim()} className="px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg sm:rounded-xl shadow-lg shadow-amber-500/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">Confirmer</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
