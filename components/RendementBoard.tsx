import React, { useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ModelData, PlanningEvent, SuiviData, AppSettings } from '../types';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';
import { computeRendement, type RendementNode } from '../lib/rendementEngine';
import { getWorkMinutesPerDay } from '../utils/planning';
import CompanyKpiRow from './rendement/CompanyKpiRow';
import DrilldownTable from './rendement/DrilldownTable';
import RendementTrendChart from './rendement/RendementTrendChart';
import SalleComparison from './rendement/SalleComparison';
import DowntimePareto from './rendement/DowntimePareto';

interface Props {
    models: ModelData[];
    planningEvents: PlanningEvent[];
    suivis: SuiviData[];
    settings: AppSettings;
}

type PeriodPreset = 'today' | 'week' | 'month' | 'custom';

function periodRange(preset: PeriodPreset, customFrom?: string, customTo?: string): { from: string; to: string } | undefined {
    if (preset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    if (preset === 'today') return { from: to, to };
    if (preset === 'week') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return { from: d.toISOString().slice(0, 10), to };
    }
    if (preset === 'month') {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        return { from: d.toISOString().slice(0, 10), to };
    }
    return undefined;
}

function calcTrend(suivis: SuiviData[], planningEvents: PlanningEvent[], models: ModelData[], minutesPerDay: number, range?: { from: string; to: string }) {
    type Acc = { rP: number; tMin: number; downtime: number; produced: number; defects: number; workers: number };
    const byDate = new Map<string, Acc>();
    let filtered = suivis;
    if (range) filtered = suivis.filter(s => s.date >= range.from && s.date <= range.to);
    const eventMap = new Map(planningEvents.map(e => [e.id, e]));
    const modelMap = new Map(models.map(m => [m.id, m]));

    for (const s of filtered) {
        const ev = eventMap.get(s.planningId);
        if (!ev) continue;
        const model = modelMap.get(ev.modelId);
        const sam = model?.meta_data?.total_temps || 0;
        const prod = Object.values(s.sorties || {}).reduce<number>((a, v) => a + (Number(v) || 0), 0);
        const dt = (s.downtime_events || []).reduce((a, d) => a + (d.minutes || 0), 0);
        const def = (s.defauts || []).reduce((a, d) => a + (d.quantity || 0), 0) + (s.scrap_details || []).reduce((a, d) => a + (d.quantity || 0), 0);
        const w = s.totalWorkers || 0;
        const cur: Acc = byDate.get(s.date) || { rP: 0, tMin: 0, downtime: 0, produced: 0, defects: 0, workers: 0 };
        cur.rP += prod * sam;
        cur.tMin += w * minutesPerDay;
        cur.downtime += dt;
        cur.produced += prod;
        cur.defects += def;
        cur.workers += w;
        byDate.set(s.date, cur);
    }

    return Array.from(byDate.entries())
        .map(([date, v]) => {
            const avail = v.tMin > 0 ? ((v.tMin - Math.min(v.downtime, v.tMin)) / v.tMin) * 100 : 100;
            const qual = v.produced > 0 ? ((v.produced - v.defects) / v.produced) * 100 : 100;
            const rP = v.tMin > 0 ? (v.rP / v.tMin) * 100 : 0;
            const trs = (rP * avail * qual) / 10000;
            return { date, rPercent: Math.round(rP * 100) / 100, trs: Math.round(trs * 100) / 100 };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
}

export default function RendementBoard({ models, planningEvents, suivis, settings }: Props) {
    const { lang } = useLang();
    const [period, setPeriod] = useState<PeriodPreset>('month');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    const range = useMemo(() => periodRange(period, customFrom || undefined, customTo || undefined), [period, customFrom, customTo]);

    const root = useMemo(() => computeRendement({ models, planningEvents, suivis, settings, range }), [models, planningEvents, suivis, settings, range]);

    const minutesPerDay = useMemo(() => getWorkMinutesPerDay(settings), [settings]);

    const trendData = useMemo(() => calcTrend(suivis, planningEvents, models, minutesPerDay, range), [suivis, planningEvents, models, minutesPerDay, range]);

    const salles = useMemo(() => {
        if (!root.children) return [];
        return root.children.map(c => ({ id: c.id, label: c.label, rPercent: c.rPercent }));
    }, [root]);

    const downtimeByCode = useMemo(() => {
        const map = new Map<string, number>();
        let filtered = suivis;
        if (range) filtered = suivis.filter(s => s.date >= range.from && s.date <= range.to);
        for (const s of filtered) {
            for (const d of s.downtime_events || []) {
                map.set(d.code, (map.get(d.code) || 0) + (d.minutes || 0));
            }
        }
        return Array.from(map.entries()).map(([code, minutes]) => ({ code, minutes })).sort((a, b) => b.minutes - a.minutes);
    }, [suivis, range]);

    const prevPeriodRange = useMemo(() => {
        if (!range) return undefined;
        const from = new Date(range.from);
        const to = new Date(range.to);
        const diff = to.getTime() - from.getTime();
        const prevTo = new Date(from.getTime() - 1);
        const prevFrom = new Date(prevTo.getTime() - diff);
        return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
    }, [range]);

    const prevRoot = useMemo(() => {
        if (!prevPeriodRange) return null;
        return computeRendement({ models, planningEvents, suivis, settings, range: prevPeriodRange });
    }, [models, planningEvents, suivis, settings, prevPeriodRange]);

    if (suivis.length === 0) {
        return (
            <div className="h-full flex flex-col bg-slate-50 dark:bg-dk-bg items-center justify-center">
                <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border p-8 max-w-md text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-dk-elevated flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-slate-400" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-700 dark:text-dk-text mb-2">
                        {tx(lang, { fr: 'Aucune donnée de suivi', ar: 'لا توجد بيانات متابعة', en: 'No tracking data', es: 'Sin datos de seguimiento', pt: 'Nenhum dado de acompanhamento', tr: 'Takip verisi yok' })}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-dk-muted">
                        {tx(lang, { fr: 'Les données de rendement apparaîtront ici une fois le suivi de production saisi.', ar: 'ستظهر بيانات العائد هنا بعد إدخال متابعة الإنتاج.', en: 'Performance data will appear here once production tracking is entered.', es: 'Los datos de rendimiento aparecerán aquí una vez ingresado el seguimiento de producción.', pt: 'Os dados de rendimento aparecerão aqui após o acompanhamento da produção.', tr: 'Üretim takibi girildikten sonra performans verileri burada görünecektir.' })}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-dk-bg">
            <div className="bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border px-8 py-5 flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-black text-slate-800 dark:text-dk-text">
                    {tx(lang, { fr: 'Rendement', ar: 'العائد', en: 'Performance', es: 'Rendimiento', pt: 'Rendimento', tr: 'Performans' })}
                </h1>

                <div className="flex items-center gap-2 bg-slate-100 dark:bg-dk-elevated p-1 rounded-xl">
                    {(['today', 'week', 'month'] as PeriodPreset[]).map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${period === p ? 'bg-white dark:bg-dk-surface text-indigo-700 dark:text-dk-accent-text shadow-sm' : 'text-slate-500 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text-soft'}`}>
                            {tx(lang, {
                                fr: p === 'today' ? "Aujourd'hui" : p === 'week' ? 'Semaine' : 'Mois',
                                ar: p === 'today' ? 'اليوم' : p === 'week' ? 'أسبوع' : 'شهر',
                                en: p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'Month',
                                es: p === 'today' ? 'Hoy' : p === 'week' ? 'Semana' : 'Mes',
                                pt: p === 'today' ? 'Hoje' : p === 'week' ? 'Semana' : 'Mês',
                                tr: p === 'today' ? 'Bugün' : p === 'week' ? 'Hafta' : 'Ay'
                            })}
                        </button>
                    ))}
                    <button onClick={() => setPeriod('custom')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${period === 'custom' ? 'bg-white dark:bg-dk-surface text-indigo-700 dark:text-dk-accent-text shadow-sm' : 'text-slate-500 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text-soft'}`}>
                        {tx(lang, { fr: 'Personnalisé', ar: 'مخصص', en: 'Custom', es: 'Personalizado', pt: 'Personalizado', tr: 'Özel' })}
                    </button>
                    {period === 'custom' && (
                        <div className="flex items-center gap-1 ml-1">
                            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                className="w-28 px-2 py-1 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-xs dark:text-dk-text" />
                            <span className="text-xs text-slate-400">—</span>
                            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                                className="w-28 px-2 py-1 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-xs dark:text-dk-text" />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
                <div className="flex items-center gap-3">
                    <CompanyKpiRow societeNode={root} prevRPercent={prevRoot?.rPercent} prevTrs={prevRoot?.trs} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <RendementTrendChart data={trendData} />
                    <SalleComparison salles={salles} />
                </div>

                <DrilldownTable root={root} />

                {downtimeByCode.length > 0 && (
                    <div className="max-w-xl">
                        <DowntimePareto downtimeByCode={downtimeByCode} />
                    </div>
                )}
            </div>
        </div>
    );
}
