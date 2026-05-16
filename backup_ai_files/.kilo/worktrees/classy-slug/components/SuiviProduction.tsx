import React, { useState, useMemo } from 'react';
import { ModelData, SuiviData, AppSettings, PlanningEvent } from '../types';
import { Activity, Printer, PackageCheck, Plus, Trash2, CalendarDays, Box, Target, AlertTriangle, ShieldAlert, Timer, CheckCircle2, Factory, Filter, Settings2 } from 'lucide-react';

interface SuiviProductionProps {
    models: ModelData[];
    suivis: SuiviData[];
    setSuivis: React.Dispatch<React.SetStateAction<SuiviData[]>>;
    planningEvents?: PlanningEvent[];
    settings: AppSettings;
}

export default function SuiviProduction({ models, suivis = [], setSuivis, planningEvents = [], settings }: SuiviProductionProps) {
    // Filter States
    const [filterChaine, setFilterChaine] = useState<string>('ALL');
    const [filterModele, setFilterModele] = useState<string>('ALL');
    const [filterDate, setFilterDate] = useState<string>('ALL');

    // Dynamic HOURS from Settings
    const { HOURS, HOUR_KEYS } = useMemo(() => {
        const startStr = settings.workingHoursStart || "08:00";
        const endStr = settings.workingHoursEnd || "18:00";
        const pauses = settings.pauses || [];

        let startMin = parseInt(startStr.split(':')[0]) * 60 + parseInt(startStr.split(':')[1]);
        if (isNaN(startMin)) startMin = 480;

        let endMin = parseInt(endStr.split(':')[0]) * 60 + parseInt(endStr.split(':')[1]);
        if (isNaN(endMin)) endMin = 1080;

        const hoursArr: string[] = [];
        const keysArr: string[] = [];

        for (let m = startMin; m < endMin; m += 60) {
            const blockEnd = m + 60;
            let overlap = 0;
            pauses.forEach(p => {
                const pStart = parseInt(p.start.split(':')[0]) * 60 + parseInt(p.start.split(':')[1]);
                const pEnd = parseInt(p.end.split(':')[0]) * 60 + parseInt(p.end.split(':')[1]);
                const overlapStart = Math.max(m, pStart);
                const overlapEnd = Math.min(blockEnd, pEnd);
                if (overlapEnd > overlapStart) overlap += (overlapEnd - overlapStart);
            });

            if (overlap < 30) {
                const hStart = Math.floor(m / 60).toString().padStart(2, '0');
                const mStart = (m % 60).toString().padStart(2, '0');
                hoursArr.push(`${hStart}:${mStart}`);
                keysArr.push(`h${hStart}${mStart}`);
            }
        }

        if (hoursArr.length === 0) {
            return {
                HOURS: ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
                HOUR_KEYS: ['h0800', 'h0900', 'h1000', 'h1100', 'h1400', 'h1500', 'h1600', 'h1700']
            }
        }

        return { HOURS: hoursArr, HOUR_KEYS: keysArr };
    }, [settings.workingHoursStart, settings.workingHoursEnd, settings.pauses]);


    // Extract distinct options for filters
    const allChains = useMemo(() => {
        const chains = new Set<string>();
        planningEvents.forEach(p => chains.add(p.chaineId));
        return Array.from(chains).sort();
    }, [planningEvents]);

    const allModels = useMemo(() => {
        const mods = new Set<{ id: string, name: string }>();
        planningEvents.forEach(p => {
            if (filterChaine !== 'ALL' && p.chaineId !== filterChaine) return;
            const m = models.find(mod => mod.id === p.modelId);
            if (m) mods.add({ id: m.id, name: m.meta_data.nom_modele });
        });
        return Array.from(mods).filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i).sort((a, b) => a.name.localeCompare(b.name));
    }, [planningEvents, models, filterChaine]);

    const allDates = useMemo(() => {
        const dts = new Set<string>();
        suivis.forEach(s => {
            const plan = planningEvents.find(p => p.id === s.planningId);
            if (plan && (filterChaine === 'ALL' || plan.chaineId === filterChaine) && (filterModele === 'ALL' || plan.modelId === filterModele)) {
                dts.add(s.date);
            }
        });
        return Array.from(dts).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [suivis, planningEvents, filterChaine, filterModele]);


    // Group Data by Chain and Model applying Filters
    const groupedData = useMemo(() => {
        const chains: Record<string, { chaineId: string, superviseur: string, productionFiles: Record<string, { planningId: string, model: ModelData, events: SuiviData[] }> }> = {};

        suivis.forEach(s => {
            if (filterDate !== 'ALL' && s.date !== filterDate) return;

            const plan = planningEvents.find(p => p.id === s.planningId);
            if (!plan) return;

            if (filterChaine !== 'ALL' && plan.chaineId !== filterChaine) return;
            if (filterModele !== 'ALL' && plan.modelId !== filterModele) return;

            const model = models.find(m => m.id === plan.modelId);
            if (!model || model.workflowStatus === 'EXPORT') return;

            if (!chains[plan.chaineId]) {
                chains[plan.chaineId] = {
                    chaineId: plan.chaineId,
                    superviseur: plan.superviseur || 'Superviseur',
                    productionFiles: {}
                };
            }

            if (!chains[plan.chaineId].productionFiles[plan.id]) {
                chains[plan.chaineId].productionFiles[plan.id] = {
                    planningId: plan.id,
                    model: model,
                    events: []
                };
            }

            chains[plan.chaineId].productionFiles[plan.id].events.push(s);
        });

        const sortedChains = Object.values(chains).sort((a, b) => a.chaineId.localeCompare(b.chaineId));
        sortedChains.forEach(chain => {
            Object.values(chain.productionFiles).forEach(pf => {
                pf.events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            });
        });

        return sortedChains;
    }, [suivis, planningEvents, models, filterChaine, filterModele, filterDate]);

    // Helpers
    const getBaseTime = (model: ModelData) => {
        return (model.gamme_operatoire || []).reduce((acc, op) => acc + (op.time || 0), 0);
    };

    const getDayName = (dateStr: string) => {
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        return days[new Date(dateStr).getDay()] || '';
    };

    const calculateEfficiency = (suivi: SuiviData, baseTime: number) => {
        if (!suivi.totalHeure || !suivi.totalWorkers || baseTime === 0) return 0;
        const activeHours = HOUR_KEYS.filter(k => (suivi.sorties[k] ?? -1) >= 0).length;
        if (activeHours === 0) return 0;

        const totalPresenceMinutes = suivi.totalWorkers * (activeHours * 60);
        if (totalPresenceMinutes === 0) return 0;

        // Apply QC penalties directly or just visually
        const validProduction = Math.max(0, suivi.totalHeure - (suivi.defauts?.reduce((acc, d) => acc + d.quantity, 0) || 0));

        const earnedMinutes = validProduction * (baseTime * 1.15); // +15% majoration
        return Math.round((earnedMinutes / totalPresenceMinutes) * 100);
    };

    const calculateModelEfficiency = (events: SuiviData[], baseTime: number) => {
        const totalValidProduced = events.reduce((acc, s) => acc + Math.max(0, s.totalHeure - (s.defauts?.reduce((a, d) => a + d.quantity, 0) || 0)), 0);
        const totalActiveHours = events.reduce((acc, s) => acc + HOUR_KEYS.filter(k => (s.sorties[k] ?? -1) >= 0).length * s.totalWorkers, 0);

        if (totalActiveHours === 0 || baseTime === 0) return 0;

        const earnedMinutes = totalValidProduced * (baseTime * 1.15);
        const presenceMinutes = totalActiveHours * 60;
        return Math.round((earnedMinutes / presenceMinutes) * 100);
    };

    // Actions
    const handleUpdateHourly = (id: string, hourKey: string, value: string) => {
        let val = parseInt(value);
        if (isNaN(val) || val < 0) {
            val = -1; // -1 represents empty
        }

        setSuivis(prev => prev.map(s => {
            if (s.id === id) {
                const newSorties = { ...s.sorties, [hourKey]: val === -1 ? undefined : val };
                const totalHeure = Object.values(newSorties).reduce((a, b) => (a || 0) + (b || 0), 0);
                return { ...s, sorties: newSorties, totalHeure };
            }
            return s;
        }));
    };

    const handleDowntimeChange = (id: string, hourKey: string, reason: string) => {
        setSuivis(prev => prev.map(s => s.id === id ? { ...s, downtimes: { ...(s.downtimes || {}), [hourKey]: reason } } : s));
    };

    const handleDefectChange = (id: string, value: string) => {
        const val = Math.max(0, parseInt(value) || 0); // No negatives Let's prevent it visually too
        setSuivis(prev => prev.map(s => {
            if (s.id === id) {
                return { ...s, defauts: val > 0 ? [{ id: '1', hour: 'all', type: 'General', quantity: val, notes: '' }] : [] }
            }
            return s;
        }));
    };

    const handleUpdateWorker = (id: string, field: string, value: string) => {
        const val = Math.max(0, parseInt(value) || 0); // Positives only
        setSuivis(prev => prev.map(s => {
            if (s.id === id) {
                const updated = { ...s, [field]: val };
                updated.totalWorkers = (Number(updated.machinistes) || 0) + (Number(updated.tracage) || 0) + (Number(updated.preparation) || 0) + (Number(updated.finition) || 0) + (Number(updated.controle) || 0);
                return updated;
            }
            return s;
        }));
    };

    const handleAddDay = (planningId: string) => {
        const existingSuivis = suivis.filter(s => s.planningId === planningId);
        let nextDateStr = new Date().toISOString().split('T')[0];

        if (existingSuivis.length > 0) {
            const sorted = [...existingSuivis].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const lastDate = new Date(sorted[0].date);
            lastDate.setDate(lastDate.getDate() + 1);
            nextDateStr = lastDate.toISOString().split('T')[0];
        }

        while (suivis.some(s => s.planningId === planningId && s.date === nextDateStr)) {
            const d = new Date(nextDateStr);
            d.setDate(d.getDate() + 1);
            nextDateStr = d.toISOString().split('T')[0];
        }

        const newSuivi: SuiviData = {
            id: `suivi_${Date.now()}`,
            planningId,
            date: nextDateStr,
            entrer: 0,
            sorties: {},
            totalHeure: 0,
            pJournaliere: 400,
            enCour: 0,
            resteEntrer: 0,
            resteSortie: 0,
            machinistes: 0,
            tracage: 0,
            preparation: 0,
            finition: 0,
            controle: 0,
            absent: 0,
            totalWorkers: 0
        };
        setSuivis(prev => [...prev, newSuivi]);
    };

    const handleDeleteSuivi = (id: string) => {
        if (confirm('Supprimer cette ligne ?')) {
            setSuivis(prev => prev.filter(s => s.id !== id));
        }
    };

    const handleExport = (model: ModelData) => {
        if (confirm(`Clôturer la production pour ${model.meta_data.nom_modele} ?`)) {
            const event = new CustomEvent('export-model', { detail: { modelId: model.id } });
            window.dispatchEvent(event);
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 overflow-y-auto pb-24">
            {/* HEADER & FILTERS */}
            <div className="bg-white px-6 py-4 flex flex-col gap-4 shrink-0 shadow-sm z-20 print:hidden sticky top-0 border-b border-slate-200">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        <Activity className="w-6 h-6 text-indigo-600" />
                        SUIVI DE PRODUCTION
                    </h1>

                    <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold font-bold transition-all border border-slate-200 shadow-sm">
                        <Printer className="w-4 h-4" /> Imprimer
                    </button>
                </div>

                {/* FILTERS BAR */}
                <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2 px-2 border-r border-slate-200">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest hidden sm:block">Filtres :</span>
                    </div>

                    <select className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shadow-sm cursor-pointer"
                        value={filterChaine} onChange={e => { setFilterChaine(e.target.value); setFilterModele('ALL'); setFilterDate('ALL'); }}>
                        <option value="ALL">Toutes les Chaînes</option>
                        {allChains.map(c => <option key={c} value={c}>{settings.chainNames?.[c] || c}</option>)}
                    </select>

                    <select className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shadow-sm cursor-pointer"
                        value={filterModele} onChange={e => setFilterModele(e.target.value)}>
                        <option value="ALL">Tous les Modèles</option>
                        {allModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>

                    <select className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shadow-sm cursor-pointer"
                        value={filterDate} onChange={e => setFilterDate(e.target.value)}>
                        <option value="ALL">Tous les Jours</option>
                        {allDates.map(d => <option key={d} value={d}>{new Date(d).toLocaleDateString('fr-FR')}</option>)}
                    </select>

                    <div className="flex-1"></div>

                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-700 text-xs font-bold shadow-sm" title="Géré depuis la page Paramètres">
                        <Settings2 className="w-3.5 h-3.5" />
                        Horaires sync.
                    </div>
                </div>
            </div>

            <div className="p-6">
                {groupedData.length === 0 ? (
                    <div className="text-center py-20">
                        <Box className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-slate-400">Aucune production pour ce filtre</h2>
                    </div>
                ) : (
                    groupedData.map(chain => (
                        <div key={chain.chaineId} className="mb-10 last:mb-0">

                            {/* CHAIN HEADER */}
                            <div className="flex items-center gap-3 mb-4">
                                <Factory className="w-5 h-5 text-indigo-500" />
                                <h2 className="text-lg font-black tracking-widest text-slate-800 uppercase">{settings.chainNames?.[chain.chaineId] || chain.chaineId}</h2>
                                <span className="ml-2 px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs font-bold uppercase tracking-wider">{chain.superviseur}</span>
                            </div>

                            <div className="space-y-6">
                                {Object.values(chain.productionFiles).map(file => {
                                    const baseTime = getBaseTime(file.model);
                                    const totalProduced = file.events.reduce((acc, s) => acc + s.totalHeure, 0);
                                    const targetQuantity = file.model.meta_data.quantity || 1;
                                    const resteProduire = targetQuantity - totalProduced;
                                    const avgPerHour = totalProduced / (file.events.reduce((acc, s) => acc + HOUR_KEYS.filter(k => (s.sorties[k] ?? -1) >= 0).length, 0) || 1);
                                    const hoursLeft = avgPerHour > 0 ? Math.ceil(resteProduire / avgPerHour) : 0;
                                    const dailyTarget = file.events.length > 0 ? Math.round(targetQuantity / file.events.length) : targetQuantity;
                                    const hourlyTarget = Math.round(dailyTarget / HOURS.length) || 1; // Prevent 0
                                    const overallEff = calculateModelEfficiency(file.events, baseTime);

                                    return (
                                        <div key={file.planningId} className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">

                                            {/* MODEL TOP BAR */}
                                            <div className="bg-slate-50 border-b border-slate-200 p-3 flex flex-wrap items-center justify-between gap-4">
                                                <div className="flex items-center flex-wrap gap-4 lg:gap-8">
                                                    <div>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Modèle</span>
                                                        <span className="text-base font-black text-indigo-900 leading-none">{file.model.meta_data.nom_modele}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tps Base</span>
                                                        <span className="text-base font-black text-slate-700 leading-none">{baseTime.toFixed(2)}m</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block flex items-center gap-1"><Target className="w-3 h-3" /> Obj. H.</span>
                                                        <span className="text-base font-black text-indigo-600 leading-none">{hourlyTarget} /h</span>
                                                    </div>

                                                    <div className="w-px h-8 bg-slate-300 hidden md:block"></div>

                                                    <div>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total</span>
                                                        <span className="text-base font-black text-emerald-600 leading-none">{totalProduced} <span className="text-xs text-slate-400">/ {targetQuantity}</span></span>
                                                    </div>

                                                    {resteProduire > 0 && (
                                                        <>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Reste</span>
                                                                <span className="text-base font-black text-rose-600 leading-none">{resteProduire}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block flex items-center gap-1"><Timer className="w-3 h-3" /> ETA</span>
                                                                <span className="text-base font-black text-amber-600 leading-none">~{hoursLeft}H</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">MR Moyen</span>
                                                        <span className={`text-xl font-black ${overallEff >= 80 ? 'text-emerald-500' : overallEff >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>{overallEff}%</span>
                                                    </div>
                                                    <button onClick={() => handleExport(file.model)} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-slate-800 hover:text-white rounded-lg transition-colors border border-indigo-100 h-10 w-10 flex items-center justify-center pointer" title="Clôturer le Suivi">
                                                        <CheckCircle2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* EXCEL-LIKE CLEAN MATRIX */}
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm text-center font-medium border-collapse min-w-[1000px]">
                                                    <thead>
                                                        <tr className="bg-white border-b border-slate-200">
                                                            <th className="py-2.5 px-3 border-r border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider w-[120px] text-left sticky left-0 bg-white z-10">Date / Jour</th>

                                                            {/* EFFECTIFS */}
                                                            <th colSpan={6} className="py-1 px-2 border-r border-slate-200 bg-slate-50">
                                                                <div className="text-[9px] uppercase font-black text-slate-400 tracking-widest border-b border-slate-200 pb-1 mb-1">Effectifs N.O (Lié)</div>
                                                                <div className="flex justify-between px-2 w-[260px] mx-auto">
                                                                    <span className="w-10 text-[10px] font-bold text-slate-600 uppercase" title="Machinistes">Mac</span>
                                                                    <span className="w-10 text-[10px] font-bold text-slate-600 uppercase" title="Traçage / Coupe">Tra</span>
                                                                    <span className="w-10 text-[10px] font-bold text-slate-600 uppercase" title="Préparation">Pre</span>
                                                                    <span className="w-10 text-[10px] font-bold text-slate-600 uppercase" title="Finition">Fin</span>
                                                                    <span className="w-10 text-[10px] font-bold text-slate-600 uppercase" title="Contrôle">Ctr</span>
                                                                    <span className="w-10 text-[10px] font-bold text-rose-500 uppercase" title="Absents (Non inclus dans Σ E.)">Abs</span>
                                                                </div>
                                                            </th>
                                                            <th className="py-2.5 px-3 border-r border-slate-200 bg-slate-100 text-slate-600 font-black text-xs w-[60px]" title="Total Effectif">Σ E.</th>

                                                            {/* HORAIRES DYNAMIQUES */}
                                                            {HOURS.map(h => (
                                                                <th key={h} className="py-2.5 px-1 border-r border-slate-100 text-slate-500 font-bold text-xs w-[56px] bg-white">{h}</th>
                                                            ))}

                                                            {/* TOTALS & QC */}
                                                            <th className="py-2.5 px-3 border-r border-slate-200 bg-emerald-50 text-emerald-800 font-black text-xs w-[60px]" title="Total Pièces">Σ P.</th>
                                                            <th className="py-2.5 px-2 border-r border-slate-200 bg-rose-50 text-rose-800 font-bold text-[10px] uppercase w-[60px]"><ShieldAlert className="w-3 h-3 mx-auto mb-0.5" /> QC</th>
                                                            <th className="py-2.5 px-3 border-r border-slate-200 bg-slate-100 text-slate-700 font-black text-xs w-[70px]" title="M.R Journalier">M.R %</th>
                                                            <th className="w-10 bg-white border-none"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-200">
                                                        {file.events.map(s => {
                                                            const eff = calculateEfficiency(s, baseTime);
                                                            const effColorBg = eff >= 80 ? 'bg-emerald-500' : eff >= 60 ? 'bg-amber-500' : eff > 0 ? 'bg-rose-500' : 'bg-slate-300';

                                                            return (
                                                                <tr key={s.id} className="hover:bg-indigo-50/30 transition-colors group">

                                                                    {/* DATE */}
                                                                    <td className="p-0 border-r border-slate-200 relative sticky left-0 bg-white group-hover:bg-indigo-50/30 z-10 align-middle">
                                                                        <div className="flex flex-col items-start justify-center h-full px-3 py-1.5 min-h-[46px]">
                                                                            <span className="text-[10px] font-black uppercase text-slate-700">{getDayName(s.date)}</span>
                                                                            <input type="date" className="text-[10px] text-slate-400 bg-transparent outline-none m-0 p-0 block leading-none font-bold cursor-pointer" value={s.date} onChange={e => {
                                                                                setSuivis(prev => prev.map(x => x.id === s.id ? { ...x, date: e.target.value } : x));
                                                                            }} />
                                                                        </div>
                                                                    </td>

                                                                    {/* EFFECTIFS */}
                                                                    <td className="p-0 border-r border-slate-200" colSpan={6}>
                                                                        <div className="flex items-center justify-between w-[260px] mx-auto h-full px-2 py-1.5 gap-2">
                                                                            {['machinistes', 'tracage', 'preparation', 'finition', 'controle'].map(role => (
                                                                                <input key={role} type="number" min="0" title={role}
                                                                                    className="w-10 h-8 text-center text-sm font-bold bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-400 focus:bg-white rounded outline-none transition-all placeholder:text-slate-300"
                                                                                    value={String(s[role as keyof SuiviData] || '')}
                                                                                    onChange={e => handleUpdateWorker(s.id, role, e.target.value)}
                                                                                    placeholder="0"
                                                                                />
                                                                            ))}
                                                                            <input type="number" min="0" title="absents"
                                                                                className="w-10 h-8 text-center text-sm font-bold bg-rose-50 border border-transparent hover:border-rose-200 focus:border-rose-400 focus:bg-white text-rose-600 rounded outline-none transition-all placeholder:text-rose-300"
                                                                                value={String(s['absent' as keyof SuiviData] || '')}
                                                                                onChange={e => handleUpdateWorker(s.id, 'absent', e.target.value)}
                                                                                placeholder="0"
                                                                            />
                                                                        </div>
                                                                    </td>

                                                                    <td className="p-0 border-r border-slate-200 bg-slate-50/50">
                                                                        <div className="w-full h-full flex items-center justify-center font-black text-slate-700 text-sm">
                                                                            {s.totalWorkers > 0 ? s.totalWorkers : '-'}
                                                                        </div>
                                                                    </td>

                                                                    {/* HORAIRES CHUNKS */}
                                                                    {HOURS.map((h, i) => {
                                                                        const k = HOUR_KEYS[i];
                                                                        const val = s.sorties[k];
                                                                        const isFilled = val !== undefined && val >= 0;
                                                                        const isUnderTarget = isFilled && val < hourlyTarget;

                                                                        return (
                                                                            <td key={h} className="p-0 border-r border-slate-100 relative align-middle">
                                                                                <div className="w-full h-full relative group/input p-1">
                                                                                    <input
                                                                                        type="number" min="0" step="1"
                                                                                        className={`w-full h-8 px-1 text-center text-sm font-bold rounded outline-none border border-transparent transition-all placeholder:text-slate-200 ${isFilled ? (isUnderTarget ? 'text-rose-700 bg-rose-50 hover:border-rose-300' : 'text-slate-900 bg-white border-slate-200 hover:border-slate-400') : 'text-slate-400 bg-transparent hover:border-slate-200 focus:bg-white'} ${s.downtimes?.[k] ? 'border-b-2 border-b-rose-400' : ''}`}
                                                                                        value={val === undefined ? '' : val}
                                                                                        onChange={e => handleUpdateHourly(s.id, k, e.target.value)}
                                                                                        placeholder="-"
                                                                                    />
                                                                                    {isUnderTarget && (
                                                                                        <div className="absolute top-1 right-1 opacity-70 pointer-events-none">
                                                                                            <div className="w-1.5 h-1.5 bg-rose-500 rounded-full"></div>
                                                                                        </div>
                                                                                    )}

                                                                                    {/* DOWNTIME TOOLTIP */}
                                                                                    {isUnderTarget && (
                                                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/input:block z-50 min-w-[140px]">
                                                                                            <input type="text"
                                                                                                className="w-full text-[10px] p-1.5 border border-rose-300 bg-rose-50 text-rose-800 outline-none rounded shadow-lg placeholder:text-rose-400 font-medium"
                                                                                                placeholder="Motif (ex: Panne)..."
                                                                                                value={s.downtimes?.[k] || ''}
                                                                                                onChange={e => handleDowntimeChange(s.id, k, e.target.value)}
                                                                                            />
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </td>
                                                                        )
                                                                    })}

                                                                    {/* TOTALS */}
                                                                    <td className="p-0 border-r border-slate-200 bg-emerald-50/50">
                                                                        <div className="w-full h-full flex items-center justify-center font-black text-emerald-700 text-lg">
                                                                            {s.totalHeure > 0 ? s.totalHeure : '-'}
                                                                        </div>
                                                                    </td>

                                                                    {/* QC */}
                                                                    <td className="p-0 border-r border-slate-200">
                                                                        <div className="p-1 h-full w-full">
                                                                            <input type="number" min="0" title="Retouches / Défauts" // NO negatives
                                                                                className={`w-full h-8 text-center text-sm font-bold bg-transparent outline-none rounded border border-transparent hover:border-slate-300 focus:bg-white transition-all placeholder:text-slate-200 ${((s.defauts?.reduce((acc, d) => acc + d.quantity, 0) || 0) > 0) ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-slate-500'}`}
                                                                                value={s.defauts?.reduce((acc, d) => acc + d.quantity, 0) || ''}
                                                                                onChange={e => handleDefectChange(s.id, e.target.value)}
                                                                                placeholder="0"
                                                                            />
                                                                        </div>
                                                                    </td>

                                                                    {/* MR */}
                                                                    <td className="p-0 border-r border-slate-200">
                                                                        <div className="p-1 h-full w-full flex items-center justify-center">
                                                                            <span className={`inline-flex items-center justify-center px-1.5 py-1 min-w-[44px] rounded text-white font-black text-[11px] shadow-sm ${effColorBg}`}>
                                                                                {eff}%
                                                                            </span>
                                                                        </div>
                                                                    </td>

                                                                    {/* DELETE */}
                                                                    <td className="p-0 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <button onClick={() => handleDeleteSuivi(s.id)} className="p-1 text-slate-300 hover:text-rose-600 rounded">
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    </td>

                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* ADD BTN */}
                                            <div className="p-2 border-t border-slate-100 bg-slate-50/50 print:hidden text-center sm:text-left">
                                                <button onClick={() => handleAddDay(file.planningId)} className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-bold text-xs uppercase tracking-wider px-4 py-2 rounded transition-colors hover:bg-slate-100 w-max mx-auto sm:mx-0">
                                                    <Plus className="w-4 h-4" /> Nouvelle Ligne (Shift)
                                                </button>
                                            </div>

                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
