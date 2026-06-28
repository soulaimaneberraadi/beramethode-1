import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Factory, Users, Package, TrendingUp, AlertTriangle,
  CheckCircle2, Clock, Calendar, BarChart3, Activity,
  ChevronRight, ArrowUpRight, Layers, Target
} from 'lucide-react';
import { ModelData, PlanningEvent, AppSettings, MachineInstance, Machine } from '../types';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';

interface VueGeneraleProps {
  models: ModelData[];
  planningEvents: PlanningEvent[];
  settings: AppSettings;
  machines: Machine[];
  machineInstances: MachineInstance[];
  onNavigate?: (view: string) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } }
};

export default function VueGenerale({
  models,
  planningEvents,
  settings,
  machines,
  machineInstances,
  onNavigate
}: VueGeneraleProps) {
  const { lang } = useLang();

  const activeEvents = useMemo(() =>
    planningEvents.filter(e => e.status === 'IN_PROGRESS' || e.status === 'READY'),
    [planningEvents]
  );

  const totalProduced = useMemo(() =>
    activeEvents.reduce((s, e) => s + (e.qteProduite || 0), 0),
    [activeEvents]
  );

  const totalTarget = useMemo(() =>
    activeEvents.reduce((s, e) => {
      const model = models.find(m => m.id === e.modelId);
      return s + (e.qteTotal || model?.meta_data?.quantity || 0);
    }, 0),
    [activeEvents, models]
  );

  const globalProgress = totalTarget > 0 ? Math.round((totalProduced / totalTarget) * 100) : 0;

  const okMachines = machineInstances.filter(m => m.status === 'OK' || !m.status).length;
  const panneMachines = machineInstances.filter(m => m.status === 'PANNE').length;
  const maintMachines = machineInstances.filter(m => m.status === 'MAINT').length;
  const machineHealth = machineInstances.length > 0 ? Math.round((okMachines / machineInstances.length) * 100) : 0;

  const chainsCount = settings?.chainsCount || 4;
  const activeChains = activeEvents.filter(e => e.chaineId).length;

  const kpis = useMemo(() => {
    const base = [
    {
      label: tx(lang, { fr: 'OF En Cours', ar: 'أوامر التصنيع الجارية', en: 'WO In Progress', es: 'OF En Curso', pt: 'OF Em Andamento', tr: 'Devam Eden İş Emri' }),
      value: activeEvents.length,
      sub: tx(lang, { fr: `${activeChains} chaîne(s) active(s)`, ar: `${activeChains} خط(وط) نشط(ة)`, en: `${activeChains} active line(s)`, es: `${activeChains} cadena(s) activa(s)`, pt: `${activeChains} linha(s) ativa(s)`, tr: `${activeChains} aktif hat` }),
      icon: Factory,
      color: 'indigo',
      bg: 'bg-indigo-50',
      iconBg: 'text-indigo-600',
      border: 'border-indigo-100'
    },
    {
      label: tx(lang, { fr: 'Production', ar: 'الإنتاج', en: 'Production', es: 'Producción', pt: 'Produção', tr: 'Üretim' }),
      value: `${totalProduced}/${totalTarget}`,
      sub: tx(lang, { fr: `${globalProgress}% avancement global`, ar: `${globalProgress}% تقدّم عام`, en: `${globalProgress}% overall progress`, es: `${globalProgress}% progreso global`, pt: `${globalProgress}% progresso global`, tr: `${globalProgress}% genel ilerleme` }),
      icon: Target,
      color: 'emerald',
      bg: 'bg-emerald-50',
      iconBg: 'text-emerald-600',
      border: 'border-emerald-100'
    },
    {
      label: tx(lang, { fr: 'Parc Machines', ar: 'أسطول الآلات', en: 'Machine Fleet', es: 'Parque de Máquinas', pt: 'Parque de Máquinas', tr: 'Makine Filosu' }),
      value: machineInstances.length,
      sub: tx(lang, { fr: `${okMachines} opérationnelles`, ar: `${okMachines} تعمل بشكل سليم`, en: `${okMachines} operational`, es: `${okMachines} operativas`, pt: `${okMachines} operacionais`, tr: `${okMachines} çalışır durumda` }),
      icon: Layers,
      color: 'sky',
      bg: 'bg-sky-50',
      iconBg: 'text-sky-600',
      border: 'border-sky-100'
    },
    {
      label: tx(lang, { fr: 'Santé Machines', ar: 'سلامة الآلات', en: 'Machine Health', es: 'Salud de Máquinas', pt: 'Saúde das Máquinas', tr: 'Makine Sağlığı' }),
      value: `${machineHealth}%`,
      sub: tx(lang, { fr: `${panneMachines} en panne · ${maintMachines} maintenance`, ar: `${panneMachines} معطلة · ${maintMachines} صيانة`, en: `${panneMachines} broken down · ${maintMachines} maintenance`, es: `${panneMachines} averiadas · ${maintMachines} mantenimiento`, pt: `${panneMachines} com defeito · ${maintMachines} manutenção`, tr: `${panneMachines} arızalı · ${maintMachines} bakımda` }),
      icon: Activity,
      color: panneMachines > 0 ? 'rose' : 'emerald',
      bg: panneMachines > 0 ? 'bg-rose-50' : 'bg-emerald-50',
      iconBg: panneMachines > 0 ? 'text-rose-600' : 'text-emerald-600',
      border: panneMachines > 0 ? 'border-rose-100' : 'border-emerald-100'
    }
    ];
    // Module Machines désactivé (Configuration) → on retire les cartes liées aux machines
    const parcLabel = tx(lang, { fr: 'Parc Machines', ar: 'أسطول الآلات', en: 'Machine Fleet', es: 'Parque de Máquinas', pt: 'Parque de Máquinas', tr: 'Makine Filosu' });
    const santeLabel = tx(lang, { fr: 'Santé Machines', ar: 'سلامة الآلات', en: 'Machine Health', es: 'Salud de Máquinas', pt: 'Saúde das Máquinas', tr: 'Makine Sağlığı' });
    return settings.machineAlertsEnabled === false
      ? base.filter(k => k.label !== parcLabel && k.label !== santeLabel)
      : base;
  }, [activeEvents, activeChains, totalProduced, totalTarget, globalProgress, machineInstances.length, okMachines, panneMachines, maintMachines, machineHealth, settings.machineAlertsEnabled, lang]);

  const recentModels = useMemo(() => {
    const sorted = [...planningEvents].sort((a, b) =>
      new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime()
    );
    return sorted.slice(0, 5).map(ev => {
      const model = models.find(m => m.id === ev.modelId);
      return {
        event: ev,
        model,
        progress: ev.qteTotal > 0 ? Math.round(((ev.qteProduite || 0) / ev.qteTotal) * 100) : 0
      };
    });
  }, [planningEvents, models]);

  return (
    <div className="min-h-screen bg-[#f8f9fc]">
      {/* Header */}
      <div className="bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border/60 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-dk-text">{tx(lang, { fr: 'Vue Générale', ar: 'نظرة عامة', en: 'Overview', es: 'Vista General', pt: 'Visão Geral', tr: 'Genel Görünüm' })}</h1>
              <p className="text-[11px] text-slate-400 dark:text-dk-muted font-medium">{tx(lang, { fr: 'Tableau de bord de production', ar: 'لوحة قيادة الإنتاج', en: 'Production dashboard', es: 'Panel de producción', pt: 'Painel de produção', tr: 'Üretim panosu' })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 dark:text-dk-muted font-medium">
              {new Date().toLocaleDateString(tx(lang, { fr: 'fr-FR', ar: 'ar-MA', en: 'en-US', es: 'es-ES', pt: 'pt-PT', tr: 'tr-TR' }), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* KPI Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {kpis.map((kpi, i) => (
            <motion.div
              key={kpi.label}
              variants={itemVariants}
              whileHover={{ y: -2, scale: 1.01 }}
              className={`bg-white dark:bg-dk-surface rounded-2xl border ${kpi.border} p-5 flex items-start gap-4 cursor-pointer hover:shadow-md transition-all duration-300`}
              onClick={() => onNavigate?.(kpi.color === 'indigo' ? 'planning' : kpi.color === 'sky' ? 'machines' : 'dashboard')}
            >
              <div className={`w-11 h-11 rounded-xl ${kpi.bg} flex items-center justify-center shrink-0`}>
                <kpi.icon className={`w-5 h-5 ${kpi.iconBg}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-slate-400 dark:text-dk-muted uppercase tracking-wider">{kpi.label}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-dk-text mt-1 leading-none">{kpi.value}</p>
                <p className="text-[11px] text-slate-500 dark:text-dk-muted mt-1.5 font-medium">{kpi.sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-dk-muted shrink-0 mt-1" />
            </motion.div>
          ))}
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Active Productions */}
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.3 }}
            className="lg:col-span-2 bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border/60 overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Factory className="w-4 h-4 text-indigo-600" />
                </div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Productions Actives', ar: 'الإنتاجات النشطة', en: 'Active Productions', es: 'Producciones Activas', pt: 'Produções Ativas', tr: 'Aktif Üretimler' })}</h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-400 dark:text-dk-muted">{activeEvents.length} OF</span>
            </div>

            <div className="divide-y divide-slate-50">
              {recentModels.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border flex items-center justify-center mb-3">
                    <Factory className="w-5 h-5 text-slate-300 dark:text-dk-muted" />
                  </div>
                  <p className="text-sm font-semibold text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Aucune production active', ar: 'لا يوجد إنتاج نشط', en: 'No active production', es: 'Sin producción activa', pt: 'Nenhuma produção ativa', tr: 'Aktif üretim yok' })}</p>
                  <p className="text-[11px] text-slate-400 dark:text-dk-muted mt-1">{tx(lang, { fr: 'Les OF planifiés apparaîtront ici', ar: 'أوامر التصنيع المبرمجة ستظهر هنا', en: 'Scheduled WOs will appear here', es: 'Las OF planificadas aparecerán aquí', pt: 'As OF planejadas aparecerão aqui', tr: 'Planlanan iş emirleri burada görünecek' })}</p>
                </div>
              ) : (
                recentModels.map(({ event, model, progress }) => (
                  <div key={event.id} className="px-6 py-4 hover:bg-slate-50/50 dark:hover:bg-dk-elevated/60 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-4">
                      {model?.image ? (
                        <img src={model.image} className="w-12 h-12 rounded-xl object-cover border border-slate-100 dark:border-dk-border shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border flex items-center justify-center shrink-0">
                          <Layers className="w-5 h-5 text-slate-300 dark:text-dk-muted" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-800 dark:text-dk-text truncate">{model?.meta_data?.nom_modele || tx(lang, { fr: 'Modèle sans nom', ar: 'نموذج بدون اسم', en: 'Unnamed model', es: 'Modelo sin nombre', pt: 'Modelo sem nome', tr: 'Adsız model' })}</p>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${event.status === 'IN_PROGRESS' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                            {event.status === 'IN_PROGRESS' ? tx(lang, { fr: 'En cours', ar: 'جارٍ', en: 'In progress', es: 'En curso', pt: 'Em andamento', tr: 'Devam ediyor' }) : tx(lang, { fr: 'Prêt', ar: 'جاهز', en: 'Ready', es: 'Listo', pt: 'Pronto', tr: 'Hazır' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 dark:text-dk-muted mt-0.5">
                          {event.chaineId} · {model?.ficheData?.client || tx(lang, { fr: 'Client N/A', ar: 'لا يوجد زبون', en: 'Client N/A', es: 'Cliente N/D', pt: 'Cliente N/D', tr: 'Müşteri Yok' })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-800 dark:text-dk-text">{event.qteProduite || 0} <span className="text-slate-300 dark:text-dk-muted font-normal">/</span> {event.qteTotal || 0}</p>
                        <div className="w-20 h-1.5 bg-slate-100 dark:bg-dk-elevated/60 rounded-full overflow-hidden mt-1.5">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${progress >= 100 ? 'bg-emerald-500' : progress >= 50 ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-dk-elevated'}`}
                            style={{ width: `${Math.min(100, progress)}%` }}
                          />
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-300 dark:text-dk-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>

          {/* Machine Status — masqué si le Module Machines est désactivé (Configuration) */}
          {settings.machineAlertsEnabled !== false && (
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border/60 overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
                <Layers className="w-4 h-4 text-sky-600" />
              </div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'État du Parc', ar: 'حالة الأسطول', en: 'Fleet Status', es: 'Estado del Parque', pt: 'Status do Parque', tr: 'Filo Durumu' })}</h2>
            </div>

            <div className="p-6 space-y-5">
              {/* Health Ring */}
              <div className="flex items-center justify-center">
                <div className="relative w-28 h-28">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke={machineHealth >= 80 ? '#10b981' : machineHealth >= 50 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${machineHealth * 2.64} 264`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-slate-900 dark:text-dk-text">{machineHealth}%</span>
                    <span className="text-[9px] font-semibold text-slate-400 dark:text-dk-muted uppercase tracking-wider">{tx(lang, { fr: 'Opérationnel', ar: 'تشغيلي', en: 'Operational', es: 'Operativo', pt: 'Operacional', tr: 'Çalışır Durumda' })}</span>
                  </div>
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100/50">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft">{tx(lang, { fr: 'Opérationnelles', ar: 'تعمل بشكل سليم', en: 'Operational', es: 'Operativas', pt: 'Operacionais', tr: 'Çalışır Durumda' })}</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">{okMachines}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-rose-50/50 border border-rose-100/50">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft">{tx(lang, { fr: 'En Panne', ar: 'معطلة', en: 'Broken Down', es: 'Averiadas', pt: 'Com Defeito', tr: 'Arızalı' })}</span>
                  </div>
                  <span className="text-sm font-bold text-rose-700">{panneMachines}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-50/50 border border-amber-100/50">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft">{tx(lang, { fr: 'Maintenance', ar: 'الصيانة', en: 'Maintenance', es: 'Mantenimiento', pt: 'Manutenção', tr: 'Bakım' })}</span>
                  </div>
                  <span className="text-sm font-bold text-amber-700">{maintMachines}</span>
                </div>
              </div>

              {/* Total */}
              <div className="pt-3 border-t border-slate-100 dark:border-dk-border flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-dk-muted uppercase tracking-wider">{tx(lang, { fr: 'Total', ar: 'الإجمالي', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' })}</span>
                <span className="text-lg font-bold text-slate-900 dark:text-dk-text">{machineInstances.length}</span>
              </div>
            </div>
          </motion.div>
          )}
        </div>

        {/* Quick Stats Bar */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-muted">{tx(lang, { fr: 'Chaînes', ar: 'الخطوط', en: 'Lines', es: 'Cadenas', pt: 'Linhas', tr: 'Hatlar' })}</span>
              <span className="text-sm font-bold text-slate-800 dark:text-dk-text">{activeChains}/{chainsCount}</span>
            </div>
            <div className="w-px h-6 bg-slate-200" />
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-muted">{tx(lang, { fr: 'Modèles', ar: 'النماذج', en: 'Models', es: 'Modelos', pt: 'Modelos', tr: 'Modeller' })}</span>
              <span className="text-sm font-bold text-slate-800 dark:text-dk-text">{models.length}</span>
            </div>
            <div className="w-px h-6 bg-slate-200" />
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-muted">{tx(lang, { fr: 'Effectif', ar: 'العدد', en: 'Staff', es: 'Personal', pt: 'Efetivo', tr: 'Personel' })}</span>
              <span className="text-sm font-bold text-slate-800 dark:text-dk-text">{settings?.employees?.length || '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-[11px] font-semibold text-emerald-600">{tx(lang, { fr: 'Production en cours', ar: 'الإنتاج جارٍ', en: 'Production in progress', es: 'Producción en curso', pt: 'Produção em andamento', tr: 'Üretim devam ediyor' })}</span>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
