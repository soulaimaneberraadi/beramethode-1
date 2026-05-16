import React, { useState, useEffect } from 'react';
import { Users, Save, RefreshCw, Briefcase, Activity, Plus } from 'lucide-react';
import { AppSettings } from '../types';

interface EffectifsProps {
    settings: AppSettings;
}

type ChaineEffectif = {
    recta: number;
    surjet: number;
    transp: number;
    plancha: number;
    man: number;
    controle: number;
    sp: number;
    stager: number;
    reserve: number;
    absent: number;
};

type GlobalIndirects = {
    plancha: number;
    lamblage: number;
    finition: number;
    controle: number;
    man: number;
    final: number;
};

export default function Effectifs({ settings }: EffectifsProps) {
    const defaultChaine: ChaineEffectif = {
        recta: 0, surjet: 0, transp: 0, plancha: 0, man: 0, controle: 0, sp: 0, stager: 0, reserve: 0, absent: 0
    };

    const generateInitialChaines = (count: number) => {
        const initial: Record<string, ChaineEffectif> = {};
        for (let i = 1; i <= count; i++) {
            initial[`CHAINE ${i}`] = { ...defaultChaine };
        }
        return initial;
    };

    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [chaines, setChaines] = useState<Record<string, ChaineEffectif>>(() => generateInitialChaines(settings.chainsCount));

    // Sync chains state if settings.chainsCount changes globally
    useEffect(() => {
        setChaines(prev => {
            const next = { ...prev };
            const currentKeys = Object.keys(next);
            const expectedCount = settings.chainsCount;

            // Allow expanding
            for (let i = 1; i <= expectedCount; i++) {
                const key = `CHAINE ${i}`;
                if (!next[key]) next[key] = { ...defaultChaine };
            }

            // Allow shrinking
            if (currentKeys.length > expectedCount) {
                currentKeys.forEach((key, idx) => {
                    if (idx >= expectedCount) {
                        delete next[key];
                    }
                });
            }
            return next;
        });
    }, [settings.chainsCount]);

    const [indirects, setIndirects] = useState<GlobalIndirects>({
        plancha: 0, lamblage: 0, finition: 0, controle: 0, man: 0, final: 0
    });

    const handleChaineChange = (chaineId: string, field: keyof ChaineEffectif, val: string) => {
        setChaines(prev => ({
            ...prev,
            [chaineId]: {
                ...prev[chaineId],
                [field]: parseInt(val) || 0
            }
        }));
    };

    const handleIndirectChange = (field: keyof GlobalIndirects, val: string) => {
        setIndirects(prev => ({
            ...prev,
            [field]: parseInt(val) || 0
        }));
    };

    const calcChaineTotal = (c: ChaineEffectif) => {
        return Object.values(c).reduce((a, b) => a + b, 0);
    };

    const calcIndirectsTotal = () => {
        return Object.values(indirects).reduce((a, b) => a + b, 0);
    };

    const handleSave = () => {
        alert("Effectifs journaliers sauvegardés avec succès !");
    };

    return (
        <div className="h-full flex flex-col bg-[#f8fafc] relative overflow-hidden">
            {/* HEADER - Premium Design */}
            <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200 px-8 py-6 shrink-0 z-10 sticky top-0 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <Users className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                            Effectifs <span className="text-xl text-slate-400 font-medium">| Présence Journalière</span>
                        </h1>
                        <p className="text-slate-500 mt-1 font-medium text-sm">Déclarez le nombre d'opérateurs présents aujourd'hui pour chaque chaîne afin d'alimenter la matrice de rendement.</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl shadow-sm hover:border-indigo-300 transition-colors group">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider group-hover:text-indigo-500 transition-colors">Date du jour</span>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="bg-transparent font-black text-slate-700 outline-none text-sm cursor-pointer"
                        />
                    </div>
                    <button onClick={handleSave} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:-translate-y-0.5 group">
                        <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        Enregistrer
                    </button>
                </div>
            </div>

            {/* BODY */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="w-full mx-auto px-6 flex flex-col xl:flex-row gap-8 items-start animate-in fade-in slide-in-from-bottom-8 duration-500">

                    {/* DIRECT EFFECTIFS (Chaines) */}
                    <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden min-w-0">
                        <div className="bg-slate-900 px-8 py-6 text-white relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                            <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 relative z-10">
                                <Activity className="w-6 h-6 text-indigo-400" />
                                Effectifs Directs par Chaîne
                            </h2>
                            <p className="text-slate-400 font-medium mt-1 text-sm relative z-10">Opérateurs directement liés à la chaîne de production.</p>
                        </div>

                        <div className="p-0 overflow-x-auto">
                            <table className="w-full min-w-[700px] border-collapse text-sm">
                                <thead>
                                    <tr>
                                        <th className="bg-slate-50 border-b border-r border-slate-100 p-4 text-left w-40 font-black text-slate-500 uppercase tracking-widest text-xs">
                                            Role / Poste
                                        </th>
                                        {Object.keys(chaines).map(chaine => (
                                            <th key={chaine} className="bg-white border-b border-l border-slate-100 p-4 text-center">
                                                <div className="inline-block px-4 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100">
                                                    <span className="font-black text-indigo-700 uppercase tracking-wider">{settings.chainNames?.[chaine] || chaine}</span>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {Object.keys(defaultChaine).map((role) => (
                                        <tr key={role} className={`hover:bg-indigo-50/30 transition-colors group ${role === 'absent' ? 'bg-rose-50/20' : ''}`}>
                                            <td className={`border-r border-slate-100 p-4 transition-colors ${role === 'absent' ? 'bg-rose-50/50 text-rose-700' : 'bg-slate-50/50 group-hover:bg-indigo-50/50 text-slate-700'}`}>
                                                <div className="font-bold uppercase tracking-wider flex items-center gap-2">
                                                    {role === 'absent' && <Users className="w-4 h-4 text-rose-500" />}
                                                    {role === 'absent' ? 'ABSENTS (Abs)' : role}
                                                </div>
                                            </td>
                                            {Object.entries(chaines).map(([chaineId, data]) => (
                                                <td key={chaineId} className="p-3 border-l border-slate-100">
                                                    <div className="relative max-w-[100px] mx-auto">
                                                        <input
                                                            type="number" min="0"
                                                            value={data[role as keyof ChaineEffectif] || ''}
                                                            onChange={(e) => handleChaineChange(chaineId, role as keyof ChaineEffectif, e.target.value)}
                                                            className={`w-full text-center py-2.5 font-black text-lg bg-slate-50 border outline-none focus:bg-white focus:ring-4 rounded-xl transition-all placeholder:text-slate-300 ${role === 'absent' ? 'text-rose-600 border-rose-200 focus:border-rose-400 focus:ring-rose-500/10' : 'text-slate-700 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/10'}`}
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    {/* TOTAL ROW */}
                                    <tr className="bg-slate-900">
                                        <td className="border-r border-slate-800 p-5">
                                            <div className="font-black text-white uppercase tracking-widest text-lg">
                                                TOTAL
                                            </div>
                                        </td>
                                        {Object.entries(chaines).map(([chaineId, data]) => {
                                            const total = calcChaineTotal(data);
                                            return (
                                                <td key={chaineId} className="p-5 border-l border-slate-800 text-center">
                                                    <span className={`text-2xl font-black ${total > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>
                                                        {total}
                                                    </span>
                                                </td>
                                            )
                                        })}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* INDIRECT EFFECTIFS (Globaux) */}
                    <div className="w-full xl:w-96 shrink-0 bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col">
                        <div className="bg-slate-900 px-8 py-6 text-white relative flex-shrink-0 overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                            <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 relative z-10">
                                <Briefcase className="w-6 h-6 text-emerald-400" />
                                Indirects globaux
                            </h2>
                            <p className="text-slate-400 font-medium mt-1 text-sm relative z-10">Personnel partagé ou d'encadrement.</p>
                        </div>

                        <div className="p-0 flex-1 overflow-y-auto">
                            <table className="w-full border-collapse text-sm">
                                <tbody className="divide-y divide-slate-100">
                                    {Object.keys(indirects).map((role) => (
                                        <tr key={role} className="hover:bg-slate-50 transition-colors group">
                                            <td className="p-4 bg-slate-50/50 group-hover:bg-emerald-50/30 transition-colors w-1/2">
                                                <div className="font-bold text-slate-700 uppercase tracking-wider">{role}</div>
                                            </td>
                                            <td className="p-3 border-l border-slate-100">
                                                <div className="relative">
                                                    <input
                                                        type="number" min="0"
                                                        value={indirects[role as keyof GlobalIndirects] || ''}
                                                        onChange={(e) => handleIndirectChange(role as keyof GlobalIndirects, e.target.value)}
                                                        className="w-full text-center py-2.5 font-black text-lg text-slate-700 bg-white border border-slate-200 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 rounded-xl transition-all placeholder:text-slate-300"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-slate-50 p-6 border-t border-slate-100 flex-shrink-0">
                            <div className="flex items-center justify-between border-2 border-emerald-100 bg-emerald-50 rounded-2xl overflow-hidden p-4">
                                <div className="font-black text-emerald-800 uppercase tracking-widest text-lg">
                                    Total Global:
                                </div>
                                <div className="text-center font-black text-emerald-600 text-3xl">
                                    {calcIndirectsTotal()}
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
