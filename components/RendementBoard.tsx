import React, { useMemo, useState } from 'react';
import { TrendingUp, Calendar, Package, MapPin, Cpu } from 'lucide-react';
import type { ModelData, PlanningEvent, SuiviData, AppSettings } from '../types';
import { calculateSectionDates, getWorkMinutesPerDay } from '../utils/planning';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';

interface Props {
    models: ModelData[];
    planningEvents: PlanningEvent[];
    suivis: SuiviData[];
    settings: AppSettings;
}

type Tab = 'jour' | 'modele' | 'poste' | 'machine';

const HOUR_KEYS_FALLBACK = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17'];

const sumHourly = (s: SuiviData): number => {
    return Object.values(s.sorties || {}).reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
};

export default function RendementBoard({ models, planningEvents, suivis, settings }: Props) {
    const { lang } = useLang();
    const [tab, setTab] = useState<Tab>('jour');

    // Par jour: agrège par chaîne et date
    const byDay = useMemo(() => {
        const map = new Map<string, { date: string; chaineId: string; output: number; effectif: number; prep: number; montage: number }>();
        suivis.forEach(s => {
            const ev = planningEvents.find(p => p.id === s.planningId);
            if (!ev) return;
            const key = `${s.date}__${ev.chaineId}`;
            const cur = map.get(key) || { date: s.date, chaineId: ev.chaineId, output: 0, effectif: 0, prep: 0, montage: 0 };
            cur.output += sumHourly(s);
            cur.effectif += s.totalWorkers || 0;
            cur.prep += s.sectionOutput?.preparation || 0;
            cur.montage += s.sectionOutput?.montage || 0;
            map.set(key, cur);
        });
        return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
    }, [suivis, planningEvents]);

    // Par modèle
    const byModel = useMemo(() => {
        return models.map(m => {
            const evs = planningEvents.filter(p => p.modelId === m.id);
            const sus = suivis.filter(s => evs.some(e => e.id === s.planningId));
            const produced = sus.reduce<number>((acc, s) => acc + sumHourly(s), 0);
            const target = evs.reduce((acc, e) => acc + (e.qteTotal || 0), 0);
            const sam = m.meta_data?.total_temps || 0;
            const totalMin = produced * sam;
            const minutesPerDay = getWorkMinutesPerDay(settings);
            const presence = sus.reduce<number>((acc, s) => acc + (s.totalWorkers || 0) * minutesPerDay, 0);
            const eff = presence > 0 ? Math.round((totalMin / presence) * 100) : 0;
            const prep = sus.reduce<number>((acc, s) => acc + (s.sectionOutput?.preparation || 0), 0);
            const mont = sus.reduce<number>((acc, s) => acc + (s.sectionOutput?.montage || 0), 0);
            return { id: m.id, name: m.meta_data?.nom_modele || m.filename, sam, produced, target, eff, prep, mont, split: !!m.ficheData?.sectionSplitEnabled };
        }).filter(r => r.target > 0 || r.produced > 0);
    }, [models, planningEvents, suivis, settings]);

    // Par poste: depuis implantation
    const byPoste = useMemo(() => {
        const rows: { posteName: string; modelName: string; nbOps: number; samExpected: number }[] = [];
        models.forEach(m => {
            const postes = m.implantation?.postes || [];
            const assignments = m.implantation?.assignments || {};
            postes.forEach(p => {
                const opIds: string[] = [];
                Object.entries(assignments).forEach(([opId, posteIds]) => {
                    if (posteIds.includes(p.id)) opIds.push(opId);
                });
                if (opIds.length === 0) return;
                const samExpected = (m.gamme_operatoire || [])
                    .filter(o => opIds.includes(o.id))
                    .reduce<number>((acc, o) => acc + (o.time || 0), 0);
                rows.push({ posteName: p.name, modelName: m.meta_data?.nom_modele || m.filename, nbOps: opIds.length, samExpected });
            });
        });
        return rows;
    }, [models]);

    // Par machine + société
    const byMachine = useMemo(() => {
        const map = new Map<string, { machine: string; nbOps: number; samTotal: number; modelCount: number; models: Set<string> }>();
        models.forEach(m => {
            (m.gamme_operatoire || []).forEach(op => {
                const machine = op.machineName || op.machineId || '—';
                const cur = map.get(machine) || { machine, nbOps: 0, samTotal: 0, modelCount: 0, models: new Set<string>() };
                cur.nbOps += 1;
                cur.samTotal += op.time || 0;
                cur.models.add(m.id);
                map.set(machine, cur);
            });
        });
        const rows = Array.from(map.values()).map(r => ({ ...r, modelCount: r.models.size }));
        const societeTotals = {
            machines: rows.length,
            nbOps: rows.reduce((a, r) => a + r.nbOps, 0),
            samTotal: rows.reduce((a, r) => a + r.samTotal, 0),
        };
        return { rows, societeTotals };
    }, [models]);

    const tabs: { id: Tab; label: string; icon: React.ComponentType<any> }[] = [
        { id: 'jour', label: tx(lang, { fr: 'Par Jour', ar: 'حسب اليوم', en: 'By Day', es: 'Por Día', pt: 'Por Dia', tr: 'Güne Göre' }), icon: Calendar },
        { id: 'modele', label: tx(lang, { fr: 'Par Modèle', ar: 'حسب النموذج', en: 'By Model', es: 'Por Modelo', pt: 'Por Modelo', tr: 'Modele Göre' }), icon: Package },
        { id: 'poste', label: tx(lang, { fr: 'Par Poste', ar: 'حسب المحطة', en: 'By Station', es: 'Por Puesto', pt: 'Por Posto', tr: 'İstasyona Göre' }), icon: MapPin },
        { id: 'machine', label: tx(lang, { fr: 'Machine + Société', ar: 'الآلة + الشركة', en: 'Machine + Company', es: 'Máquina + Empresa', pt: 'Máquina + Empresa', tr: 'Makine + Şirket' }), icon: Cpu },
    ];

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-dk-bg">
            <div className="bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border px-8 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg dark:shadow-dk-lg">
                        <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Rendement', ar: 'العائد', en: 'Performance', es: 'Rendimiento', pt: 'Rendimento', tr: 'Performans' })}</h1>
                        <p className="text-xs text-slate-500 dark:text-dk-muted">{tx(lang, { fr: 'Agrégation jour · modèle · poste · machine + société', ar: 'تجميع: اليوم · النموذج · المحطة · الآلة + الشركة', en: 'Aggregation: day · model · station · machine + company', es: 'Agregación: día · modelo · puesto · máquina + empresa', pt: 'Agregação: dia · modelo · posto · máquina + empresa', tr: 'Toplama: gün · model · istasyon · makine + şirket' })}</p>
                    </div>
                </div>
                <div className="flex bg-slate-100 dark:bg-dk-elevated p-1 rounded-xl">
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${tab === t.id ? 'bg-white dark:bg-dk-elevated text-indigo-700 dark:text-dk-accent-text shadow-sm dark:shadow-dk-sm dark:shadow-none' : 'text-slate-500 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text-soft'}`}>
                            <t.icon className="w-3.5 h-3.5" /> {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                {tab === 'jour' && (
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-dk-bg dark:bg-dk-elevated text-slate-500 dark:text-dk-muted text-[11px] uppercase">
                                <tr>
                                    <th className="px-4 py-3 text-left">{tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' })}</th>
                                    <th className="px-4 py-3 text-left">{tx(lang, { fr: 'Chaîne', ar: 'الخط', en: 'Line', es: 'Cadena', pt: 'Linha', tr: 'Hat' })}</th>
                                    <th className="px-4 py-3 text-right">{tx(lang, { fr: 'Effectif', ar: 'العدد', en: 'Staff', es: 'Personal', pt: 'Efetivo', tr: 'Personel' })}</th>
                                    <th className="px-4 py-3 text-right text-blue-600 dark:text-blue-400">{tx(lang, { fr: 'Prép.', ar: 'تحضير', en: 'Prep.', es: 'Prep.', pt: 'Prep.', tr: 'Haz.' })}</th>
                                    <th className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{tx(lang, { fr: 'Montage', ar: 'التركيب', en: 'Assembly', es: 'Montaje', pt: 'Montagem', tr: 'Montaj' })}</th>
                                    <th className="px-4 py-3 text-right">{tx(lang, { fr: 'Total Output', ar: 'مجموع الإنتاج', en: 'Total Output', es: 'Salida Total', pt: 'Saída Total', tr: 'Toplam Çıkış' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {byDay.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Aucune donnée de suivi', ar: 'لا توجد بيانات متابعة', en: 'No tracking data', es: 'Sin datos de seguimiento', pt: 'Nenhum dado de acompanhamento', tr: 'Takip verisi yok' })}</td></tr>}
                                {byDay.map((r, i) => (
                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                        <td className="px-4 py-2.5 font-mono text-xs dark:text-dk-text-soft">{r.date}</td>
                                        <td className="px-4 py-2.5 dark:text-dk-text-soft">{settings.chainNames?.[r.chaineId] || r.chaineId}</td>
                                        <td className="px-4 py-2.5 text-right font-bold dark:text-dk-text">{r.effectif}</td>
                                        <td className="px-4 py-2.5 text-right text-blue-700 dark:text-blue-400 font-bold">{r.prep || '—'}</td>
                                        <td className="px-4 py-2.5 text-right text-emerald-700 dark:text-emerald-400 font-bold">{r.montage || '—'}</td>
                                        <td className="px-4 py-2.5 text-right font-black text-slate-800 dark:text-dk-text">{r.output}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {tab === 'modele' && (
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead className="bg-slate-50 dark:bg-dk-bg dark:bg-dk-elevated text-slate-500 dark:text-dk-muted text-[11px] uppercase">
                                <tr>
                                    <th className="px-4 py-3 text-left">{tx(lang, { fr: 'Modèle', ar: 'النموذج', en: 'Model', es: 'Modelo', pt: 'Modelo', tr: 'Model' })}</th>
                                    <th className="px-4 py-3 text-right">SAM</th>
                                    <th className="px-4 py-3 text-right">{tx(lang, { fr: 'Produit', ar: 'مُنتَج', en: 'Produced', es: 'Producido', pt: 'Produzido', tr: 'Üretilen' })}</th>
                                    <th className="px-4 py-3 text-right">{tx(lang, { fr: 'Cible', ar: 'الهدف', en: 'Target', es: 'Objetivo', pt: 'Meta', tr: 'Hedef' })}</th>
                                    <th className="px-4 py-3 text-right text-blue-600 dark:text-blue-400">{tx(lang, { fr: 'Prép.', ar: 'تحضير', en: 'Prep.', es: 'Prep.', pt: 'Prep.', tr: 'Haz.' })}</th>
                                    <th className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{tx(lang, { fr: 'Montage', ar: 'التركيب', en: 'Assembly', es: 'Montaje', pt: 'Montagem', tr: 'Montaj' })}</th>
                                    <th className="px-4 py-3 text-right">{tx(lang, { fr: '% Eff.', ar: '% الفعالية', en: '% Eff.', es: '% Ef.', pt: '% Ef.', tr: '% Verim' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {byModel.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Aucun modèle planifié', ar: 'لا يوجد نموذج مبرمج', en: 'No model planned', es: 'Ningún modelo planificado', pt: 'Nenhum modelo planejado', tr: 'Planlanmış model yok' })}</td></tr>}
                                {byModel.map(r => (
                                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                        <td className="px-4 py-2.5 font-bold flex items-center gap-2 dark:text-dk-text">{r.name}{r.split && <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">SPLIT</span>}</td>
                                        <td className="px-4 py-2.5 text-right dark:text-dk-text-soft">{r.sam.toFixed(2)}</td>
                                        <td className="px-4 py-2.5 text-right font-black text-emerald-700 dark:text-emerald-400">{r.produced}</td>
                                        <td className="px-4 py-2.5 text-right dark:text-dk-text-soft">{r.target}</td>
                                        <td className="px-4 py-2.5 text-right text-blue-700 dark:text-blue-400">{r.split ? r.prep : '—'}</td>
                                        <td className="px-4 py-2.5 text-right text-emerald-700 dark:text-emerald-400">{r.split ? r.mont : '—'}</td>
                                        <td className="px-4 py-2.5 text-right"><span className={`px-2 py-0.5 rounded text-xs font-black ${r.eff >= 85 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : r.eff >= 70 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'}`}>{r.eff}%</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {tab === 'poste' && (
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border overflow-x-auto">
                        <table className="w-full min-w-[480px] text-sm">
                            <thead className="bg-slate-50 dark:bg-dk-bg dark:bg-dk-elevated text-slate-500 dark:text-dk-muted text-[11px] uppercase">
                                <tr>
                                    <th className="px-4 py-3 text-left">{tx(lang, { fr: 'Poste', ar: 'المحطة', en: 'Station', es: 'Puesto', pt: 'Posto', tr: 'İstasyon' })}</th>
                                    <th className="px-4 py-3 text-left">{tx(lang, { fr: 'Modèle', ar: 'النموذج', en: 'Model', es: 'Modelo', pt: 'Modelo', tr: 'Model' })}</th>
                                    <th className="px-4 py-3 text-right">{tx(lang, { fr: 'Nb Ops', ar: 'عدد العمليات', en: 'Nb Ops', es: 'N.º Ops', pt: 'N.º Ops', tr: 'İşlem Sayısı' })}</th>
                                    <th className="px-4 py-3 text-right">{tx(lang, { fr: 'SAM cumulé', ar: 'SAM التراكمي', en: 'Cumulative SAM', es: 'SAM acumulado', pt: 'SAM acumulado', tr: 'Kümülatif SAM' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {byPoste.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Aucune implantation', ar: 'لا يوجد تخطيط للمحطات', en: 'No layout', es: 'Sin implantación', pt: 'Nenhuma implantação', tr: 'Yerleşim yok' })}</td></tr>}
                                {byPoste.map((r, i) => (
                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                        <td className="px-4 py-2.5 font-bold dark:text-dk-text">{r.posteName}</td>
                                        <td className="px-4 py-2.5 dark:text-dk-text-soft">{r.modelName}</td>
                                        <td className="px-4 py-2.5 text-right dark:text-dk-text-soft">{r.nbOps}</td>
                                        <td className="px-4 py-2.5 text-right font-mono dark:text-dk-text-soft">{r.samExpected.toFixed(2)} min</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {tab === 'machine' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-white dark:bg-dk-surface p-4 rounded-2xl border border-slate-200 dark:border-dk-border">
                                <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Machines distinctes', ar: 'الآلات المتميزة', en: 'Distinct machines', es: 'Máquinas distintas', pt: 'Máquinas distintas', tr: 'Farklı makineler' })}</div>
                                <div className="text-3xl font-black text-indigo-700 dark:text-dk-accent-text">{byMachine.societeTotals.machines}</div>
                            </div>
                            <div className="bg-white dark:bg-dk-surface p-4 rounded-2xl border border-slate-200 dark:border-dk-border">
                                <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Total opérations société', ar: 'إجمالي عمليات الشركة', en: 'Total company operations', es: 'Total operaciones empresa', pt: 'Total de operações da empresa', tr: 'Toplam şirket işlemleri' })}</div>
                                <div className="text-3xl font-black text-emerald-700 dark:text-emerald-400">{byMachine.societeTotals.nbOps}</div>
                            </div>
                            <div className="bg-white dark:bg-dk-surface p-4 rounded-2xl border border-slate-200 dark:border-dk-border">
                                <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'SAM société (min)', ar: 'SAM الشركة (دقيقة)', en: 'Company SAM (min)', es: 'SAM empresa (min)', pt: 'SAM da empresa (min)', tr: 'Şirket SAM (dk)' })}</div>
                                <div className="text-3xl font-black text-amber-700 dark:text-amber-400">{byMachine.societeTotals.samTotal.toFixed(1)}</div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border overflow-x-auto">
                            <table className="w-full min-w-[480px] text-sm">
                                <thead className="bg-slate-50 dark:bg-dk-bg dark:bg-dk-elevated text-slate-500 dark:text-dk-muted text-[11px] uppercase">
                                    <tr>
                                        <th className="px-4 py-3 text-left">{tx(lang, { fr: 'Machine', ar: 'الآلة', en: 'Machine', es: 'Máquina', pt: 'Máquina', tr: 'Makine' })}</th>
                                        <th className="px-4 py-3 text-right">{tx(lang, { fr: 'Nb Ops', ar: 'عدد العمليات', en: 'Nb Ops', es: 'N.º Ops', pt: 'N.º Ops', tr: 'İşlem Sayısı' })}</th>
                                        <th className="px-4 py-3 text-right">{tx(lang, { fr: 'Modèles', ar: 'النماذج', en: 'Models', es: 'Modelos', pt: 'Modelos', tr: 'Modeller' })}</th>
                                        <th className="px-4 py-3 text-right">{tx(lang, { fr: 'SAM cumulé', ar: 'SAM التراكمي', en: 'Cumulative SAM', es: 'SAM acumulado', pt: 'SAM acumulado', tr: 'Kümülatif SAM' })}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {byMachine.rows.map(r => (
                                        <tr key={r.machine} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                            <td className="px-4 py-2.5 font-bold dark:text-dk-text">{r.machine}</td>
                                            <td className="px-4 py-2.5 text-right dark:text-dk-text-soft">{r.nbOps}</td>
                                            <td className="px-4 py-2.5 text-right dark:text-dk-text-soft">{r.modelCount}</td>
                                            <td className="px-4 py-2.5 text-right font-mono dark:text-dk-text-soft">{r.samTotal.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
