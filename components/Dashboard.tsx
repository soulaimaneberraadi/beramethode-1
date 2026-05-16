import React, { useMemo, useState, useEffect } from 'react';
import { ModelData, SuiviData, PlanningEvent, AppSettings, AppTask } from '../types';
import { Users, Activity, Layers, TrendingUp, Download, AlertTriangle, ShieldAlert, CheckCircle2, ListTodo, CalendarClock, ChevronRight, Factory, Package, DollarSign, RefreshCw, Calendar as CalendarIcon } from 'lucide-react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
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

/** Vues accessibles depuis les cartes KPI (aligné sur App.tsx `currentView`). */
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
  /** Ouvre le module lié à une carte (optionnel). */
  onNavigateModule?: (view: DashboardNavTarget) => void;
}

/** Mini Sparkline component for KPI cards */
function Sparkline({ data, color }: { data: any[], color: string }) {
  if (!data || data.length < 2) return null;
  return (
    <div className="h-8 w-16 ml-auto opacity-50 group-hover:opacity-100 transition-opacity">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={2} 
            dot={false} 
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Dashboard({ models, suivis, planningEvents, settings, setSettings, onOpenAgenda, onNavigateModule }: DashboardProps) {

  // ── Live KPIs from DB (Phase 6) ──
  const [liveKPIs, setLiveKPIs] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(true);

  const fetchKPIs = () => {
    setKpiLoading(true);
    fetch('/api/dashboard/kpis', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLiveKPIs(data); setKpiLoading(false); })
      .catch(() => setKpiLoading(false));
  };

  useEffect(() => {
    fetchKPIs();
    const interval = setInterval(fetchKPIs, 30000);
    return () => clearInterval(interval);
  }, []);

  // 1. Modèles Actifs (En Planification ou En Suivi)
  const activeModelsCount = models.filter(m => m.workflowStatus === 'PLANNING' || m.workflowStatus === 'SUIVI').length;

  // 2. Compute Real-time Production Data from Suivis — TODAY ONLY
  const todayDateStr = new Date().toISOString().split('T')[0];
  const { totalEffectif, globalTRS, pJournaliere, productionData, efficiencyData, andonAlerts } = useMemo(() => {
    // Filter to today's suivis only so stats reflect current-day production
    const todaySuivis = suivis.filter(s => s.date === todayDateStr);
    let effectif = 0;
    let totalH = 0;
    let totalTarget = 0;

    // For TRS
    let sumTRS = 0;
    let countTRS = 0;
    const alerts: { title: string, trs: number, time: string }[] = [];

    // Base Data for Area Chart (Sortie par heure)
    const hourlyAccumulator = {
      h0830: 0, h0930: 0, h1030: 0, h1130: 0, h1430: 0, h1530: 0, h1630: 0, h1730: 0, h1830: 0, h1930: 0
    };

    const chaineEffMap = new Map<string, { totalH: number, target: number }>();

    todaySuivis.forEach(suivi => {
      effectif += (suivi.totalWorkers || 0);
      totalH += (suivi.totalHeure || 0);

      const target = suivi.pJournaliere || 400;
      totalTarget += target;

      // Hourly Accumulator
      Object.keys(hourlyAccumulator).forEach(key => {
        hourlyAccumulator[key as keyof typeof hourlyAccumulator] += (suivi.sorties[key as keyof typeof suivi.sorties] || 0) as number;
      });

      // Efficiency per chaine
      const event = planningEvents.find(e => e.id === suivi.planningId);
      if (event) {
        const chaine = event.chaineId;
        const existing = chaineEffMap.get(chaine) || { totalH: 0, target: 0 };
        chaineEffMap.set(chaine, {
          totalH: existing.totalH + (suivi.totalHeure || 0),
          target: existing.target + target
        });
      }

      // --- Compute Individual TRS ---
      const targetPerHour = target / 10;
      let hoursWorked = 0;
      let totalDowntimePenalty = 0;
      ['h0830', 'h0930', 'h1030', 'h1130', 'h1430', 'h1530', 'h1630', 'h1730', 'h1830', 'h1930'].forEach((key) => {
        const val = suivi.sorties[key as keyof typeof suivi.sorties] as number | undefined;
        if (val !== undefined && val >= 0) {
          hoursWorked++;
          if (suivi.downtimes && suivi.downtimes[key]) totalDowntimePenalty += 0.2;
        }
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
          alerts.push({
            title: `Alerte TRS Chaîne ${event?.chaineId || '?'}`,
            trs: trs,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }
      }
    });

    const overallTRS = countTRS > 0 ? Math.round(sumTRS / countTRS) : 0;

    // Transform hourly data for Recharts
    const labels = ['08:30', '09:30', '10:30', '11:30', '14:30', '15:30', '16:30', '17:30', '18:30', '19:30'];
    const keys = ['h0830', 'h0930', 'h1030', 'h1130', 'h1430', 'h1530', 'h1630', 'h1730', 'h1830', 'h1930'];

    let cumPCount = 0;
    let cumTarget = 0;
    const targetPerHour = suivis.length > 0 ? (totalTarget / 10) : 0;

    const pData = labels.map((label, idx) => {
      const val = hourlyAccumulator[keys[idx] as keyof typeof hourlyAccumulator] || 0;
      cumPCount += val;
      cumTarget += targetPerHour;

      return {
        time: label,
        pCount: Math.round(cumPCount),
        target: Math.round(cumTarget)
      };
    });

    // Transform Efficiency Data for Bar Chart
    const colors = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6'];
    const eData: any[] = [];
    let cIdx = 0;
    chaineEffMap.forEach((val, chaine) => {
      eData.push({
        name: chaine,
        rendement: val.target > 0 ? Math.min(100, Math.round((val.totalH / val.target) * 100)) : 0,
        fill: colors[cIdx % colors.length]
      });
      cIdx++;
    });

    if (eData.length === 0) {
      eData.push({ name: 'CH 1', rendement: 0, fill: '#6366f1' });
    }

    return {
      totalEffectif: effectif,
      globalTRS: overallTRS,
      pJournaliere: totalH,
      productionData: pData,
      efficiencyData: eData,
      andonAlerts: alerts
    };

  }, [suivis, planningEvents, todayDateStr]);

  /** Indicateurs API + fiches suivi du jour — une seule grille. */
  const mergedDashboardKpis = useMemo(() => {
    const stockVal =
      liveKPIs?.stock?.valeur_totale != null ? `${(liveKPIs.stock.valeur_totale / 1000).toFixed(1)}k` : '—';
    const avancesVal =
      liveKPIs?.rh?.avances_encours != null ? `${(liveKPIs.rh.avances_encours / 1000).toFixed(1)}k` : '—';
    return [
      {
        key: 'of',
        label: 'OF En Cours',
        value: liveKPIs?.planning?.en_cours ?? '—',
        sub: `${liveKPIs?.planning?.avancement ?? 0}% avancement`,
        icon: Factory,
        iconWrap: 'bg-indigo-50',
        iconClass: 'text-indigo-600',
        nav: 'planning' as DashboardNavTarget,
        valueFromApi: true,
        sparkData: liveKPIs?.charts?.spark_ofs || [],
        sparkColor: '#6366f1'
      },
      {
        key: 'eff-rh',
        label: 'Effectif Actif',
        value: liveKPIs?.effectifs?.total ?? '—',
        sub: `${liveKPIs?.effectifs?.presents ?? 0} présents aujourd'hui`,
        icon: Users,
        iconWrap: 'bg-emerald-50',
        iconClass: 'text-emerald-600',
        nav: 'effectifs' as DashboardNavTarget,
        valueFromApi: true,
        sparkData: liveKPIs?.charts?.spark_presence || [],
        sparkColor: '#10b981'
      },
      {
        key: 'stock',
        label: 'Valeur Stock',
        value: stockVal,
        sub: `${liveKPIs?.stock?.nb_alertes ?? 0} alerte(s) stock`,
        icon: Package,
        iconWrap: 'bg-amber-50',
        iconClass: 'text-amber-600',
        nav: 'magasin' as DashboardNavTarget,
        valueFromApi: true,
        sparkData: (liveKPIs?.charts?.mouvements_7j || []).map((m:any) => ({ value: m.total_entrees })),
        sparkColor: '#f59e0b'
      },
      {
        key: 'avances',
        label: 'Avances En Cours',
        value: avancesVal,
        sub: `${liveKPIs?.rh?.demandes_attente ?? 0} demande(s) appro`,
        icon: DollarSign,
        iconWrap: 'bg-violet-50',
        iconClass: 'text-violet-600',
        nav: 'effectifs' as DashboardNavTarget,
        valueFromApi: true,
        sparkData: [],
        sparkColor: '#8b5cf6'
      },
      {
        key: 'modeles',
        label: 'Modèles Actifs',
        value: activeModelsCount.toString(),
        sub: 'En planification ou suivi',
        icon: Layers,
        iconWrap: 'bg-sky-50',
        iconClass: 'text-sky-600',
        nav: 'library' as DashboardNavTarget,
        valueFromApi: false,
      },
      {
        key: 'eff-suivi',
        label: 'Effectif Présent',
        value: totalEffectif.toString(),
        sub: "Aujourd'hui (fiches suivi)",
        icon: Users,
        iconWrap: 'bg-teal-50',
        iconClass: 'text-teal-600',
        nav: 'suivi' as DashboardNavTarget,
        valueFromApi: false,
      },
      {
        key: 'trs',
        label: 'T.R.S Global',
        value: `${globalTRS}%`,
        sub: 'Synthèse du jour',
        icon: Activity,
        iconWrap: 'bg-rose-50',
        iconClass: 'text-rose-600',
        nav: 'rendement' as DashboardNavTarget,
        valueFromApi: false,
        sparkData: [],
        sparkColor: '#f43f5e'
      },
      {
        key: 'pj',
        label: 'P° Journalière',
        value: pJournaliere.toLocaleString(),
        sub: 'Cumul pièces (jour)',
        icon: TrendingUp,
        iconWrap: 'bg-blue-50',
        iconClass: 'text-blue-600',
        nav: 'suivi' as DashboardNavTarget,
        valueFromApi: false,
        sparkData: (liveKPIs?.charts?.prod_7j || []).map((p:any) => ({ value: p.total })),
        sparkColor: '#3b82f6'
      },
    ];
  }, [liveKPIs, activeModelsCount, totalEffectif, globalTRS, pJournaliere]);

  // --- TASK MANAGEMENT LOGIC ---
  const [skipReasonModal, setSkipReasonModal] = useState<AppTask | null>(null);
  const [skipReasonText, setSkipReasonText] = useState('');

  const handleUpdateTaskStatus = (taskId: string, newStatus: AppTask['status'], reason?: string) => {
    setSettings(prev => ({
      ...prev,
      tasks: prev.tasks?.map(task =>
        task.id === taskId
          ? { ...task, status: newStatus, skipReason: reason }
          : task
      ) || []
    }));
  };

  const handleSkipSubmit = () => {
    if (skipReasonModal && skipReasonText.trim()) {
      handleUpdateTaskStatus(skipReasonModal.id, 'SKIPPED', skipReasonText.trim());
      setSkipReasonModal(null);
      setSkipReasonText('');
    } else {
      alert('Veuillez entrer une raison valide.');
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  // Phase 26 requires: "عرض المهام الحالية والمهام غير المنجزة"
  // Which means PENDING tasks that are due today OR earlier (overdue).
  const pendingTasks = (settings.tasks || []).filter(t => t.status === 'PENDING' && t.date <= todayStr);


  return (
    <div className="h-full flex flex-col bg-slate-50 relative pb-20 overflow-y-auto">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 px-8 py-6 mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Tableau de Bord</h1>
          <p className="text-slate-500 mt-1">Aperçu en temps réel de l'atelier et de la production globale.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchKPIs}
            title="Rafraîchir les données"
            className={`p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-all ${kpiLoading ? 'animate-pulse' : ''}`}
          >
            <RefreshCw className={`w-5 h-5 ${kpiLoading ? 'animate-spin' : ''}`} />
          </button>
          <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Live Monitoring</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-none mx-auto px-8 space-y-6">

        {/* KPIs fusionnés : API + suivi du jour — une grille ; clic → module */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {mergedDashboardKpis.map(kpi => {
            const showLoading = kpiLoading && kpi.valueFromApi;
            const Inner = (
              <>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${kpi.iconWrap}`}>
                  <kpi.icon className={`w-5 h-5 ${kpi.iconClass}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                  <div className="flex items-end gap-2">
                    <p className="text-2xl font-black text-slate-800 leading-tight">
                      {showLoading ? <span className="text-slate-200">···</span> : kpi.value}
                    </p>
                    {kpi.sparkData && kpi.sparkData.length > 0 && (
                      <Sparkline data={kpi.sparkData} color={kpi.sparkColor || '#6366f1'} />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{kpi.sub}</p>
                </div>
                {onNavigateModule && (
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 shrink-0" aria-hidden />
                )}
              </>
            );
            const shell = 'bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-3 group hover:shadow-md transition-shadow';
            if (onNavigateModule) {
              return (
                <button key={kpi.key} type="button" onClick={() => onNavigateModule(kpi.nav)} className={`${shell} w-full text-left cursor-pointer`}>
                  {Inner}
                </button>
              );
            }
            return (
              <div key={kpi.key} className={shell}>
                {Inner}
              </div>
            );
          })}
        </div>

        {/* Stock Alert Banner */}
        {liveKPIs?.stock?.alertes?.length > 0 && (
          onNavigateModule ? (
            <button
              type="button"
              onClick={() => onNavigateModule('magasin')}
              className="w-full text-left rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-amber-100/80 transition-colors"
            >
              <AlertTriangle className="w-[18px] h-[18px] text-amber-600 shrink-0" />
              <div className="text-[13px] min-w-0">
                <strong className="text-amber-900">Alertes Stock ({liveKPIs.stock.alertes.length}) :</strong>{' '}
                <span className="text-amber-950/90">
                  {liveKPIs.stock.alertes.map((a: any) => `${a.designation} (${a.stock_actuel}/${a.stockAlerte})`).join(' • ')}
                </span>
              </div>
              <ChevronRight className="w-5 h-5 text-amber-700/60 shrink-0" aria-hidden />
            </button>
          ) : (
            <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="w-[18px] h-[18px] text-amber-600 shrink-0" />
              <div className="text-[13px] min-w-0">
                <strong className="text-amber-900">Alertes Stock ({liveKPIs.stock.alertes.length}) :</strong>{' '}
                <span className="text-amber-950/90">
                  {liveKPIs.stock.alertes.map((a: any) => `${a.designation} (${a.stock_actuel}/${a.stockAlerte})`).join(' • ')}
                </span>
              </div>
            </div>
          )
        )}

        {/* CHARTS GRID & TASKS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <div className="lg:col-span-1 space-y-6">
            {/* TASKS WIDGET */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col h-[350px]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <ListTodo className="w-5 h-5 text-indigo-500" />
                  Tâches Courantes
                </h3>
                <span className="text-xs font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md">
                  {pendingTasks.length} en attente
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">Aujourd'hui et retards. Cliquez pour ouvrir l'Agenda.</p>

              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {pendingTasks.map(task => (
                  <div key={task.id} className="group bg-slate-50 border border-slate-200 rounded-xl p-3 hover:border-indigo-300 transition-colors flex flex-col gap-3">
                    <div
                      className="cursor-pointer"
                      onClick={() => onOpenAgenda()}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{task.assigneeName} {task.assigneeRole ? `(${task.assigneeRole})` : ''}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${task.date < todayStr ? 'text-rose-600 bg-rose-50 border border-rose-200' : 'text-amber-500 bg-amber-50'}`}>
                          <CalendarClock className="w-3 h-3" /> {task.date} {task.date < todayStr ? '(Retard)' : ''}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-700 leading-tight group-hover:text-indigo-700 transition-colors">{task.text}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t border-slate-200">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'DONE_OK'); }}
                        className="flex-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-bold py-1.5 rounded-lg transition-colors border border-emerald-100"
                      >
                        OK
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'DONE_NOT_OK'); }}
                        className="flex-1 bg-rose-50 text-rose-700 hover:bg-rose-100 text-[10px] font-bold py-1.5 rounded-lg transition-colors border border-rose-100"
                      >
                        NOT OK
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSkipReasonModal(task as AppTask); }}
                        className="flex-1 bg-slate-100 text-slate-600 hover:bg-slate-200 text-[10px] font-bold py-1.5 rounded-lg transition-colors border border-slate-200"
                      >
                        SKIP
                      </button>
                    </div>
                  </div>
                ))}
                {pendingTasks.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-50" />
                    <span className="text-sm font-bold opacity-70 text-center">Aucune tâche en attente<br />pour aujourd'hui.</span>
                  </div>
                )}
              </div>
            </div>

            {/* CALENDAR WIDGET */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col h-[350px]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-emerald-500" />
                  Planning Mensuel
                </h3>
              </div>
              <div className="flex-1 grid grid-cols-7 gap-1 auto-rows-fr">
                {['L','M','M','J','V','S','D'].map((d, i) => (
                  <div key={i} className="text-[10px] font-bold text-slate-400 text-center py-2">{d}</div>
                ))}
                {Array.from({ length: 35 }).map((_, i) => {
                  const day = i - 1; // Simplified calendar for demo
                  const hasProd = day > 0 && (liveKPIs?.charts?.calendar_prod_days || []).includes(day);
                  const isToday = day === new Date().getDate();
                  return (
                    <div 
                      key={i} 
                      className={`relative rounded-lg border flex items-center justify-center text-[11px] font-medium transition-all
                        ${day < 1 || day > 31 ? 'opacity-0' : 'opacity-100'}
                        ${isToday ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold' : 'border-slate-100'}
                        ${hasProd ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : ''}
                      `}
                    >
                      {day > 0 && day <= 31 ? day : ''}
                      {hasProd && <div className="absolute top-1 right-1 w-1 h-1 bg-emerald-500 rounded-full" />}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-4 text-[10px]">
                <div className="flex items-center gap-1.5 font-bold text-slate-500">
                  <div className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-200" /> PRODUCTION
                </div>
                <div className="flex items-center gap-1.5 font-bold text-slate-500">
                  <div className="w-2.5 h-2.5 rounded bg-indigo-100 border border-indigo-200" /> AUJOURD'HUI
                </div>
              </div>
            </div>
          </div>

          {/* Main Production Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden h-[730px]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Évolution de la Production</h3>
                <p className="text-sm text-slate-500">Comparaison entre l'objectif calculé et le réel cumulé.</p>
              </div>
              <button
                onClick={() => {
                  const csvRows = ['Heure,Production Reelle,Objectif Dynamique'];
                  productionData.forEach(row => {
                    csvRows.push(`${row.time},${row.pCount},${row.target}`);
                  });
                  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.setAttribute('hidden', '');
                  a.setAttribute('href', url);
                  a.setAttribute('download', `production_export_${new Date().toISOString().split('T')[0]}.csv`);
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>

            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={productionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} dx={-10} />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontWeight: 'bold' }}
                    labelStyle={{ color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Area type="monotone" name="P° Réelle Cumulée" dataKey="pCount" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                  <Area type="monotone" name="Objectif Dynamique" dataKey="target" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right Column: Efficiency + Feed */}
          <div className="space-y-6">
            {/* Efficiency Bar Chart */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-800">Rendement Chaînes</h3>
                <p className="text-xs text-slate-500">% d'efficacité base effectif.</p>
              </div>

              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={efficiencyData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} stroke="#e2e8f0" />
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }} width={60} />
                    <RechartsTooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(val: number) => [`${val}%`, 'Rendement']}
                    />
                    <Bar dataKey="rendement" radius={[0, 6, 6, 0]} maxBarSize={30}>
                      {
                        efficiencyData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Andon Alerts Feed */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 h-[225px] flex flex-col">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Alertes Andon
              </h3>
              <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                {andonAlerts.map((alert, idx) => (
                  <div key={idx} className="flex gap-3 items-start p-3 bg-rose-50 rounded-xl border border-rose-100">
                    <div className="w-8 h-8 rounded-full bg-rose-200 flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-4 h-4 text-rose-700" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-bold text-rose-900">{alert.title}</p>
                        <span className="text-xs font-bold text-rose-500">{alert.time}</span>
                      </div>
                      <p className="text-xs text-rose-700 mt-0.5">Performance critique à <span className="font-black">{alert.trs}%</span>. Intervention requise.</p>
                    </div>
                  </div>
                ))}
                {andonAlerts.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2 opacity-50" />
                    <span className="text-sm font-bold opacity-70">Aucune alerte Andon.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* MODAL: SKIP REASON */}
      {skipReasonModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Motif d'annulation (Obligatoire)</h3>
              <button onClick={() => { setSkipReasonModal(null); setSkipReasonText(''); }} className="text-slate-400 hover:text-slate-600">
                <AlertTriangle className="w-5 h-5 opacity-0" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 text-amber-800 p-3 rounded-xl text-sm border border-amber-100 flex gap-2 items-start">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>Vous êtes sur le point d'ignorer la tâche : <br /><span className="font-bold">"{skipReasonModal.text}"</span>.</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Raison / Justification</label>
                <textarea
                  value={skipReasonText}
                  onChange={(e) => setSkipReasonText(e.target.value)}
                  placeholder="Ex: Machine en panne, Attente fourniture..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 h-24 resize-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => { setSkipReasonModal(null); setSkipReasonText(''); }}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSkipSubmit}
                disabled={!skipReasonText.trim()}
                className="px-4 py-2 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirmer l'annulation
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}