import React, { useMemo, useState } from 'react';
import { TrendingUp, Calendar, Package, MapPin, Cpu } from 'lucide-react';
import type { ModelData, PlanningEvent, SuiviData, AppSettings } from '../types';
import { calculateSectionDates, getWorkMinutesPerDay } from '../utils/planning';

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
        { id: 'jour', label: 'Par Jour', icon: Calendar },
        { id: 'modele', label: 'Par Modèle', icon: Package },
        { id: 'poste', label: 'Par Poste', icon: MapPin },
        { id: 'machine', label: 'Machine + Société', icon: Cpu },
    ];

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
                        <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800">Rendement</h1>
                        <p className="text-xs text-slate-500">Agrégation jour · modèle · poste · machine + société</p>
                    </div>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${tab === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            <t.icon className="w-3.5 h-3.5" /> {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                {tab === 'jour' && (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                                <tr>
                                    <th className="px-4 py-3 text-left">Date</th>
                                    <th className="px-4 py-3 text-left">Chaîne</th>
                                    <th className="px-4 py-3 text-right">Effectif</th>
                                    <th className="px-4 py-3 text-right text-blue-600">Prép.</th>
                                    <th className="px-4 py-3 text-right text-emerald-600">Montage</th>
                                    <th className="px-4 py-3 text-right">Total Output</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {byDay.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Aucune donnée de suivi</td></tr>}
                                {byDay.map((r, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-4 py-2.5 font-mono text-xs">{r.date}</td>
                                        <td className="px-4 py-2.5">{settings.chainNames?.[r.chaineId] || r.chaineId}</td>
                                        <td className="px-4 py-2.5 text-right font-bold">{r.effectif}</td>
                                        <td className="px-4 py-2.5 text-right text-blue-700 font-bold">{r.prep || '—'}</td>
                                        <td className="px-4 py-2.5 text-right text-emerald-700 font-bold">{r.montage || '—'}</td>
                                        <td className="px-4 py-2.5 text-right font-black text-slate-800">{r.output}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {tab === 'modele' && (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                                <tr>
                                    <th className="px-4 py-3 text-left">Modèle</th>
                                    <th className="px-4 py-3 text-right">SAM</th>
                                    <th className="px-4 py-3 text-right">Produit</th>
                                    <th className="px-4 py-3 text-right">Cible</th>
                                    <th className="px-4 py-3 text-right text-blue-600">Prép.</th>
                                    <th className="px-4 py-3 text-right text-emerald-600">Montage</th>
                                    <th className="px-4 py-3 text-right">% Eff.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {byModel.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Aucun modèle planifié</td></tr>}
                                {byModel.map(r => (
                                    <tr key={r.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-2.5 font-bold flex items-center gap-2">{r.name}{r.split && <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-violet-100 text-violet-700">SPLIT</span>}</td>
                                        <td className="px-4 py-2.5 text-right">{r.sam.toFixed(2)}</td>
                                        <td className="px-4 py-2.5 text-right font-black text-emerald-700">{r.produced}</td>
                                        <td className="px-4 py-2.5 text-right">{r.target}</td>
                                        <td className="px-4 py-2.5 text-right text-blue-700">{r.split ? r.prep : '—'}</td>
                                        <td className="px-4 py-2.5 text-right text-emerald-700">{r.split ? r.mont : '—'}</td>
                                        <td className="px-4 py-2.5 text-right"><span className={`px-2 py-0.5 rounded text-xs font-black ${r.eff >= 85 ? 'bg-emerald-100 text-emerald-700' : r.eff >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{r.eff}%</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {tab === 'poste' && (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                        <table className="w-full min-w-[480px] text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                                <tr>
                                    <th className="px-4 py-3 text-left">Poste</th>
                                    <th className="px-4 py-3 text-left">Modèle</th>
                                    <th className="px-4 py-3 text-right">Nb Ops</th>
                                    <th className="px-4 py-3 text-right">SAM cumulé</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {byPoste.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Aucune implantation</td></tr>}
                                {byPoste.map((r, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-4 py-2.5 font-bold">{r.posteName}</td>
                                        <td className="px-4 py-2.5">{r.modelName}</td>
                                        <td className="px-4 py-2.5 text-right">{r.nbOps}</td>
                                        <td className="px-4 py-2.5 text-right font-mono">{r.samExpected.toFixed(2)} min</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {tab === 'machine' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-2xl border border-slate-200">
                                <div className="text-[10px] uppercase font-bold text-slate-400">Machines distinctes</div>
                                <div className="text-3xl font-black text-indigo-700">{byMachine.societeTotals.machines}</div>
                            </div>
                            <div className="bg-white p-4 rounded-2xl border border-slate-200">
                                <div className="text-[10px] uppercase font-bold text-slate-400">Total opérations société</div>
                                <div className="text-3xl font-black text-emerald-700">{byMachine.societeTotals.nbOps}</div>
                            </div>
                            <div className="bg-white p-4 rounded-2xl border border-slate-200">
                                <div className="text-[10px] uppercase font-bold text-slate-400">SAM société (min)</div>
                                <div className="text-3xl font-black text-amber-700">{byMachine.societeTotals.samTotal.toFixed(1)}</div>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                            <table className="w-full min-w-[480px] text-sm">
                                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Machine</th>
                                        <th className="px-4 py-3 text-right">Nb Ops</th>
                                        <th className="px-4 py-3 text-right">Modèles</th>
                                        <th className="px-4 py-3 text-right">SAM cumulé</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {byMachine.rows.map(r => (
                                        <tr key={r.machine} className="hover:bg-slate-50">
                                            <td className="px-4 py-2.5 font-bold">{r.machine}</td>
                                            <td className="px-4 py-2.5 text-right">{r.nbOps}</td>
                                            <td className="px-4 py-2.5 text-right">{r.modelCount}</td>
                                            <td className="px-4 py-2.5 text-right font-mono">{r.samTotal.toFixed(2)}</td>
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
