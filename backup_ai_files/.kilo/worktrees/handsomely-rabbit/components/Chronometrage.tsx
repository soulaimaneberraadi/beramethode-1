import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Operation, ChronoData } from '../types';
import {
    Activity, Clock, Percent, Calculator, FileText, ClipboardList,
    Timer, Play, Pause, RotateCcw, TrendingUp, AlertTriangle, CheckCircle2,
    Zap, BarChart3, Target, ChevronDown, ChevronUp, Printer, Settings, Flag, Trash2, X, Hash
} from 'lucide-react';

interface ChronometrageProps {
    operations: Operation[];
    chronoData: Record<string, ChronoData>;
    setChronoData: React.Dispatch<React.SetStateAction<Record<string, ChronoData>>>;
    presenceTime: number;
}

/* ─── ADVANCED STOPWATCH (PHONE–STYLE) ─── */
function AdvancedStopwatch({ onRecord, trCount }: { onRecord: (time: number) => void; trCount: number }) {
    const [running, setRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0); // ms
    const [laps, setLaps] = useState<{ time: number; total: number }[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startRef = useRef<number>(0);

    useEffect(() => {
        if (running) {
            startRef.current = Date.now() - elapsed;
            intervalRef.current = setInterval(() => {
                setElapsed(Date.now() - startRef.current);
            }, 10);
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [running]);

    const formatTime = (ms: number) => {
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        const cs = Math.floor((ms % 1000) / 10);
        return { mins, secs, cs, display: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}` };
    };

    const formatSeconds = (ms: number) => {
        return (ms / 1000).toFixed(2);
    };

    const handleLap = () => {
        if (!running || elapsed === 0) return;
        const lastTotal = laps.length > 0 ? laps[laps.length - 1].total : 0;
        setLaps(prev => [...prev, { time: elapsed - lastTotal, total: elapsed }]);
    };

    const handleRecord = () => {
        if (elapsed > 0) {
            const timeInSeconds = elapsed / 1000;
            onRecord(parseFloat(timeInSeconds.toFixed(2)));
            setRunning(false);
            setElapsed(0);
            setLaps([]);
        }
    };

    const handleReset = () => {
        setRunning(false);
        setElapsed(0);
        setLaps([]);
    };

    const { mins, secs, cs } = formatTime(elapsed);

    // Sort laps for ranking
    const rankedLaps = [...laps].sort((a, b) => a.time - b.time);
    const fastestLap = rankedLaps.length > 0 ? rankedLaps[0].total : null;
    const slowestLap = rankedLaps.length > 0 ? rankedLaps[rankedLaps.length - 1].total : null;

    return (
        <div className="w-full">
            {/* Timer Display */}
            <div className="flex flex-col items-center gap-4 py-4">
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl px-6 sm:px-10 py-5 sm:py-6 font-mono text-center shadow-xl border border-slate-700/50 w-full max-w-xs">
                    <div className="text-4xl sm:text-5xl font-black tracking-wider text-white">
                        <span className="text-emerald-400">{String(mins).padStart(2, '0')}</span>
                        <span className="text-slate-500 animate-pulse">:</span>
                        <span className="text-white">{String(secs).padStart(2, '0')}</span>
                        <span className="text-slate-500">.</span>
                        <span className="text-slate-400 text-3xl">{String(cs).padStart(2, '0')}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-2 font-bold uppercase tracking-wider">
                        {formatSeconds(elapsed)} secondes
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                    {/* Reset / Lap */}
                    <button
                        onClick={running ? handleLap : handleReset}
                        disabled={elapsed === 0}
                        className="w-14 h-14 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                        title={running ? 'Tour (Lap)' : 'Réinitialiser'}
                    >
                        {running ? <Flag className="w-5 h-5" /> : <RotateCcw className="w-5 h-5" />}
                    </button>

                    {/* Start / Stop */}
                    <button
                        onClick={() => setRunning(!running)}
                        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl transform hover:scale-105 ${running
                            ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-rose-500/30'
                            : 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-emerald-500/30'
                            }`}
                    >
                        {running ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                    </button>

                    {/* Record */}
                    <button
                        onClick={handleRecord}
                        disabled={elapsed === 0 || running}
                        className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center transition-all shadow-xl shadow-indigo-500/30 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transform"
                        title="Enregistrer dans le prochain TR"
                    >
                        <Target className="w-5 h-5" />
                    </button>
                </div>

                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                    {running ? 'Appuyer sur 🏁 pour un tour' : elapsed > 0 ? 'Appuyer sur ⏺ pour enregistrer' : 'Appuyer sur ▶ pour démarrer'}
                </p>
            </div>

            {/* Laps List (Ranking) */}
            {laps.length > 0 && (
                <div className="mt-3 border-t border-slate-200 pt-3 max-h-40 overflow-y-auto custom-scrollbar">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Hash className="w-3 h-3" /> Tours enregistrés ({laps.length})
                    </div>
                    <div className="space-y-1">
                        {[...laps].reverse().map((lap, i) => {
                            const originalIdx = laps.length - 1 - i;
                            const isFastest = lap.time === (rankedLaps.length > 1 ? rankedLaps[0].time : -1);
                            const isSlowest = lap.time === (rankedLaps.length > 1 ? rankedLaps[rankedLaps.length - 1].time : -1);
                            return (
                                <div key={originalIdx} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono ${isFastest ? 'bg-emerald-50 text-emerald-700' : isSlowest ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>
                                    <span className="font-bold">Tour {originalIdx + 1}</span>
                                    <span className="font-bold">{formatSeconds(lap.time)}s</span>
                                    {isFastest && <span className="text-[9px] font-black text-emerald-500 bg-emerald-100 px-1.5 py-0.5 rounded-md">RAPIDE</span>}
                                    {isSlowest && <span className="text-[9px] font-black text-rose-500 bg-rose-100 px-1.5 py-0.5 rounded-md">LENT</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── MAIN COMPONENT ─── */
export default function Chronometrage({ operations, chronoData, setChronoData, presenceTime }: ChronometrageProps) {

    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [trCount, setTrCount] = useState(5);
    const [showTrConfig, setShowTrConfig] = useState(false);
    const [unitSeconds, setUnitSeconds] = useState(true); // seconds by default per user request

    const trSlots = useMemo(() => Array.from({ length: trCount }, (_, i) => i + 1), [trCount]);

    const handleCellChange = (opId: string, field: keyof ChronoData, value: string) => {
        const numValue = value === '' ? undefined : parseFloat(value);

        setChronoData(prev => {
            const current = prev[opId] || { operationId: opId, majoration: 1.15 };
            const updated = { ...current, [field]: numValue };

            // Recalculate T.M (Temps Moyen) if TR changes
            if (field.startsWith('tr')) {
                const trs: number[] = [];
                for (let i = 1; i <= trCount; i++) {
                    const v = updated[`tr${i}` as keyof ChronoData];
                    if (v !== undefined && v !== null && !isNaN(v as number)) trs.push(v as number);
                }
                if (trs.length > 0) {
                    updated.tm = trs.reduce((a, b) => a + b, 0) / trs.length;
                } else {
                    updated.tm = undefined;
                }
            }

            // T.M is stored in the same unit as inputs (seconds). Convert to minutes for Temp Majoré
            if (updated.tm !== undefined && updated.majoration !== undefined) {
                const tmMinutes = unitSeconds ? updated.tm / 60 : updated.tm;
                updated.tempMajore = tmMinutes * updated.majoration;
                if (updated.tempMajore > 0) {
                    updated.pMax = Math.round(presenceTime / updated.tempMajore);
                    updated.p85 = Math.round(updated.pMax * 0.85);
                } else {
                    updated.pMax = undefined;
                    updated.p85 = undefined;
                }
            } else {
                updated.tempMajore = undefined;
                updated.pMax = undefined;
                updated.p85 = undefined;
            }

            return { ...prev, [opId]: updated };
        });
    };

    const handleStopwatchRecord = (opId: string, timeInSeconds: number) => {
        const data = chronoData[opId] || { operationId: opId, majoration: 1.15 };
        // Find the first empty TR slot
        for (let i = 1; i <= trCount; i++) {
            const key = `tr${i}` as keyof ChronoData;
            if (data[key] === undefined || data[key] === null) {
                const value = unitSeconds ? timeInSeconds : timeInSeconds / 60;
                handleCellChange(opId, key, value.toString());
                return;
            }
        }
        // All slots filled - ask to redo
        alert(`Tous les ${trCount} relevés sont remplis. Vous pouvez supprimer un relevé pour réenregistrer.`);
    };

    const clearTR = (opId: string, trNum: number) => {
        handleCellChange(opId, `tr${trNum}` as keyof ChronoData, '');
    };

    const toggleRowExpand = (opId: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(opId)) next.delete(opId); else next.add(opId);
            return next;
        });
    };

    // Calculate Column Totals
    const totals = useMemo(() => {
        let tmTotal = 0;
        let tempMajoreTotal = 0;
        let filledCount = 0;

        operations.forEach(op => {
            const data = chronoData[op.id];
            if (data?.tm) { tmTotal += data.tm; filledCount++; }
            if (data?.tempMajore) tempMajoreTotal += data.tempMajore;
        });

        const pMaxGlobal = tempMajoreTotal > 0 ? Math.round(presenceTime / tempMajoreTotal) : 0;
        const p85Global = Math.round(pMaxGlobal * 0.85);

        return { tm: tmTotal, tempMajore: tempMajoreTotal, filledCount, pMaxGlobal, p85Global };
    }, [chronoData, operations, presenceTime]);

    const progressPercent = operations.length > 0 ? Math.round((totals.filledCount / operations.length) * 100) : 0;

    const formatVal = (v: number | undefined) => {
        if (v === undefined) return '—';
        return v.toFixed(2);
    };

    return (
        <div className="space-y-4 sm:space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-2 duration-300">

            {/* ─── HERO HEADER ─── */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 rounded-2xl sm:rounded-[2rem] p-5 sm:p-8 md:p-10 relative overflow-hidden border border-slate-700/50">
                <div className="absolute top-0 right-0 w-48 sm:w-72 h-48 sm:h-72 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                <div className="absolute bottom-0 left-0 w-40 sm:w-56 h-40 sm:h-56 bg-cyan-500/15 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3"></div>

                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6">
                    <div className="flex items-center gap-3 sm:gap-5">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
                            <Timer className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight">Chronométrage</h1>
                            <p className="text-slate-400 font-medium text-xs sm:text-sm mt-0.5">Fiche d'analyse des temps — Relevés terrain et calculs automatisés</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                        {/* TR Count Config */}
                        <button
                            onClick={() => setShowTrConfig(!showTrConfig)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border backdrop-blur-sm ${showTrConfig ? 'bg-indigo-500/30 text-indigo-200 border-indigo-400/30' : 'bg-white/10 text-white border-white/10 hover:bg-white/20'}`}
                        >
                            <Settings className="w-3.5 h-3.5" /> TR: {trCount}
                        </button>
                        {/* Unit Toggle */}
                        <button
                            onClick={() => setUnitSeconds(!unitSeconds)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border backdrop-blur-sm ${unitSeconds ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/30' : 'bg-amber-500/30 text-amber-200 border-amber-400/30'}`}
                        >
                            <Clock className="w-3.5 h-3.5" /> {unitSeconds ? 'Secondes' : 'Minutes'}
                        </button>
                        <button
                            onClick={() => window.print()}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl border border-white/10 transition-all backdrop-blur-sm text-xs"
                        >
                            <Printer className="w-3.5 h-3.5" /> Imprimer
                        </button>
                    </div>
                </div>

                {/* TR Count Config Dropdown */}
                {showTrConfig && (
                    <div className="relative z-10 mt-4 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10 flex flex-wrap gap-2 items-center animate-in slide-in-from-top-2 duration-200">
                        <span className="text-xs font-bold text-slate-300 mr-2 uppercase tracking-wide">Nombre de relevés (TR):</span>
                        {[3, 4, 5, 6, 7, 8, 10].map(n => (
                            <button
                                key={n}
                                onClick={() => { setTrCount(n); setShowTrConfig(false); }}
                                className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${trCount === n
                                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                                    }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                )}

                {/* ─── STATS CARDS ─── */}
                <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mt-6 sm:mt-8">
                    {[
                        { label: 'Opérations', value: operations.length, sub: `${totals.filledCount} chronométrées`, icon: ClipboardList, color: 'from-amber-500/20 to-amber-600/10 border-amber-500/20', iconColor: 'text-amber-400' },
                        { label: 'T.M Global', value: formatVal(totals.tm), sub: unitSeconds ? 'secondes' : 'minutes', icon: Clock, color: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/20', iconColor: 'text-indigo-400' },
                        { label: 'T. Majoré', value: totals.tempMajore.toFixed(2), sub: 'minutes', icon: Calculator, color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20', iconColor: 'text-emerald-400' },
                        { label: 'Temps Présence', value: presenceTime, sub: 'minutes', icon: Activity, color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/20', iconColor: 'text-cyan-400' },
                        { label: 'Objectif 85%', value: totals.p85Global > 0 ? `${totals.p85Global} p/j` : '-', sub: `P° Max: ${totals.pMaxGlobal}`, icon: Target, color: 'from-rose-500/20 to-rose-600/10 border-rose-500/20', iconColor: 'text-rose-400' },
                    ].map((stat, i) => (
                        <div key={i} className={`bg-gradient-to-br ${stat.color} border rounded-xl p-3 sm:p-4 backdrop-blur-sm`}>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <stat.icon className={`w-3.5 h-3.5 ${stat.iconColor}`} />
                                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wide truncate">{stat.label}</span>
                            </div>
                            <div className="text-lg sm:text-2xl font-black text-white truncate">{stat.value}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5 font-medium truncate">{stat.sub}</div>
                        </div>
                    ))}
                </div>

                {/* Progress Bar */}
                <div className="relative z-10 mt-5 sm:mt-6">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wide">Progression chronométrage</span>
                        <span className="text-[10px] sm:text-xs font-bold text-indigo-300">{progressPercent}%</span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                    </div>
                </div>
            </div>

            {/* ─── MAIN TABLE CARD ─── */}
            <div className="bg-white rounded-2xl sm:rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">

                {/* Table Header */}
                <div className="p-4 sm:p-6 md:p-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                            <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 text-base sm:text-xl">Relevés Terrain</h3>
                            <p className="text-slate-500 text-xs sm:text-sm font-medium">
                                {trCount} relevés • Unité: <strong className="text-indigo-600">{unitSeconds ? 'secondes' : 'minutes'}</strong>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-500 rounded-lg"><AlertTriangle className="w-3 h-3" /> Lent</span>
                        <span className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg"><Zap className="w-3 h-3" /> Rapide</span>
                        <span className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg"><CheckCircle2 className="w-3 h-3" /> Normal</span>
                    </div>
                </div>

                {/* Table - Cards on mobile, table on desktop */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 border-b-2 border-slate-200 text-[11px] uppercase tracking-wider font-bold">
                                <th className="py-3 px-3 text-left w-10">#</th>
                                <th className="py-3 px-3 text-left min-w-[160px]">Opération</th>
                                <th className="py-3 px-3 text-center bg-amber-50/50 text-amber-600 border-x border-slate-100 w-16">TS</th>
                                {trSlots.map(n => (
                                    <th key={n} className="py-3 px-1 text-center w-14 bg-slate-100/50">TR {n}</th>
                                ))}
                                <th className="py-3 px-2 text-center bg-indigo-50/60 text-indigo-700 w-16 border-l border-slate-200">T.Moy</th>
                                <th className="py-3 px-1 text-center w-14">Maj.</th>
                                <th className="py-3 px-2 text-center bg-emerald-50/60 text-emerald-700 w-20">T.Maj</th>
                                <th className="py-3 px-2 text-center w-14 text-slate-500">P° Max</th>
                                <th className="py-3 px-2 text-center bg-slate-800 text-white rounded-tr-lg w-16">P° 85%</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {operations.length === 0 ? (
                                <tr>
                                    <td colSpan={trCount + 7} className="px-8 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                                                <ClipboardList className="w-8 h-8 text-slate-300" />
                                            </div>
                                            <p className="text-slate-500 font-bold text-lg">Aucune opération</p>
                                            <p className="text-slate-400 text-sm">Veuillez d'abord remplir la Gamme Opératoire (étape 2).</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                operations.map((op, index) => {
                                    const data = (chronoData[op.id] || { operationId: op.id, majoration: 1.15 }) as ChronoData;
                                    const isExpanded = expandedRows.has(op.id);
                                    const isActive = activeRowId === op.id;

                                    const isSlow = data.tm && op.time && (data.tm > op.time * 1.2);
                                    const isFast = data.tm && op.time && (data.tm < op.time * 0.8);
                                    const filledTRs = trSlots.filter(n => {
                                        const v = data[`tr${n}` as keyof ChronoData];
                                        return v !== undefined && v !== null;
                                    }).length;

                                    return (
                                        <React.Fragment key={op.id}>
                                            <tr
                                                className={`group transition-all duration-200 cursor-pointer ${isActive ? 'bg-indigo-50/50 ring-1 ring-inset ring-indigo-200' : 'hover:bg-slate-50/80'} ${isSlow ? 'border-l-4 border-l-red-400' : isFast ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-transparent'}`}
                                                onClick={() => setActiveRowId(isActive ? null : op.id)}
                                            >
                                                <td className="px-3 py-3">
                                                    <span className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center font-mono font-bold text-xs text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                                        {index + 1}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-slate-800 truncate text-[13px]" title={op.description}>{op.description}</p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <div className="w-10 h-1 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div className={`h-full rounded-full transition-all ${filledTRs === trCount ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${(filledTRs / trCount) * 100}%` }} />
                                                                </div>
                                                                <span className="text-[10px] text-slate-400 font-medium">{filledTRs}/{trCount}</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleRowExpand(op.id); }}
                                                            className="w-6 h-6 rounded-md bg-slate-100 hover:bg-indigo-100 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all shrink-0"
                                                        >
                                                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3 text-center font-bold text-amber-600 bg-amber-50/20 border-x border-slate-100 font-mono text-xs">
                                                    {op.time.toFixed(2)}
                                                </td>
                                                {trSlots.map((trNum) => {
                                                    const val = data[`tr${trNum}` as keyof ChronoData];
                                                    const hasVal = val !== undefined && val !== null;
                                                    return (
                                                        <td key={trNum} className={`px-0.5 py-1.5 ${trNum === trCount ? 'border-r border-slate-200' : ''} relative group/cell`}>
                                                            <input
                                                                type="number" step="0.01"
                                                                className="w-full px-0.5 py-1 text-center text-[12px] font-mono font-medium border border-transparent rounded-lg bg-transparent hover:bg-slate-50 hover:border-slate-200 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder:text-slate-300"
                                                                placeholder="—"
                                                                value={val ?? ''}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onChange={e => handleCellChange(op.id, `tr${trNum}` as keyof ChronoData, e.target.value)}
                                                            />
                                                            {hasVal && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); clearTR(op.id, trNum); }}
                                                                    className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white rounded-full text-[8px] font-bold opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-center justify-center z-10"
                                                                    title="Supprimer ce relevé"
                                                                >
                                                                    <X className="w-2.5 h-2.5" />
                                                                </button>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className={`px-2 py-3 text-center font-mono font-black text-xs border-l border-slate-200 ${isSlow ? 'text-red-600 bg-red-50/60' : isFast ? 'text-emerald-600 bg-emerald-50/60' : 'text-indigo-700 bg-indigo-50/40'}`}>
                                                    {data.tm !== undefined ? data.tm.toFixed(2) : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-0.5 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="number" step="0.01"
                                                        className="w-12 px-0.5 py-1 text-center text-xs font-mono font-medium border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                                        value={data.majoration ?? ''}
                                                        onChange={e => handleCellChange(op.id, 'majoration', e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-2 py-3 text-center font-mono font-bold text-emerald-700 bg-emerald-50/30 text-xs">
                                                    {data.tempMajore !== undefined ? data.tempMajore.toFixed(2) : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-2 py-3 text-center font-mono text-slate-500 font-medium text-xs">
                                                    {data.pMax !== undefined ? data.pMax : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-2 py-3 text-center font-mono font-black text-slate-800 bg-slate-50 group-hover:bg-indigo-50 transition-colors text-xs">
                                                    {data.p85 !== undefined ? data.p85 : <span className="text-slate-300">—</span>}
                                                </td>
                                            </tr>

                                            {/* ─── EXPANDED: STOPWATCH ─── */}
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={trCount + 7} className="px-4 py-4 bg-gradient-to-r from-indigo-50/50 via-white to-cyan-50/50 border-b border-indigo-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="flex flex-col items-center gap-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                                                    <Timer className="w-4 h-4 text-indigo-600" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Chronomètre pour:</p>
                                                                    <p className="text-sm font-bold text-indigo-700">{op.description}</p>
                                                                </div>
                                                                <div className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg font-bold">
                                                                    Prochain: TR{filledTRs + 1 > trCount ? '✓' : filledTRs + 1}
                                                                </div>
                                                            </div>
                                                            <AdvancedStopwatch
                                                                onRecord={(time) => handleStopwatchRecord(op.id, time)}
                                                                trCount={trCount}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>

                        {/* Footer Totals */}
                        {operations.length > 0 && (
                            <tfoot>
                                <tr className="border-t-2 border-slate-800 bg-gradient-to-r from-slate-50 to-slate-100">
                                    <td colSpan={2} className="px-4 py-4 text-right font-black uppercase tracking-wider text-slate-700 text-xs">
                                        Total Général
                                    </td>
                                    <td className="px-2 py-4 text-center font-black font-mono text-amber-600 border-x border-slate-200 bg-amber-50/50 text-xs">
                                        {operations.reduce((acc, op) => acc + (op.time || 0), 0).toFixed(2)}
                                    </td>
                                    <td colSpan={trCount} className="border-r border-slate-200 px-3 py-4 text-center">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">— Relevés Individuels —</span>
                                    </td>
                                    <td className="px-2 py-4 text-center font-black font-mono text-indigo-700 bg-indigo-100/70 text-sm border-l border-slate-200">
                                        {formatVal(totals.tm)}
                                    </td>
                                    <td className="px-2 py-4"></td>
                                    <td className="px-2 py-4 text-center font-black font-mono text-emerald-700 bg-emerald-100/70 text-sm">
                                        {totals.tempMajore.toFixed(2)}
                                    </td>
                                    <td className="px-2 py-4 text-center font-bold font-mono text-slate-600 text-xs">
                                        {totals.pMaxGlobal || '-'}
                                    </td>
                                    <td className="px-2 py-4 text-center font-black font-mono text-white bg-slate-800 text-sm rounded-br-lg">
                                        {totals.p85Global || '-'}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* ─── MOBILE CARD VIEW ─── */}
                <div className="md:hidden divide-y divide-slate-100">
                    {operations.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <ClipboardList className="w-6 h-6 text-slate-300" />
                            </div>
                            <p className="text-slate-500 font-bold">Aucune opération</p>
                            <p className="text-slate-400 text-xs mt-1">Remplir la Gamme Opératoire d'abord.</p>
                        </div>
                    ) : (
                        operations.map((op, index) => {
                            const data = (chronoData[op.id] || { operationId: op.id, majoration: 1.15 }) as ChronoData;
                            const isExpanded = expandedRows.has(op.id);
                            const filledTRs = trSlots.filter(n => {
                                const v = data[`tr${n}` as keyof ChronoData];
                                return v !== undefined && v !== null;
                            }).length;

                            return (
                                <div key={op.id} className="p-4">
                                    {/* Name + Expand */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <span className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center font-mono text-[10px] font-bold text-slate-500 shrink-0">{index + 1}</span>
                                            <p className="font-bold text-slate-800 text-sm truncate">{op.description}</p>
                                        </div>
                                        <button onClick={() => toggleRowExpand(op.id)} className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                    </div>

                                    {/* TR Grid */}
                                    <div className="grid grid-cols-3 gap-2 mb-3">
                                        {trSlots.map(trNum => {
                                            const val = data[`tr${trNum}` as keyof ChronoData];
                                            return (
                                                <div key={trNum} className="relative">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-0.5 block text-center">TR {trNum}</label>
                                                    <input
                                                        type="number" step="0.01"
                                                        className="w-full px-2 py-2 text-center text-sm font-mono font-bold border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                                        placeholder="—"
                                                        value={val ?? ''}
                                                        onChange={e => handleCellChange(op.id, `tr${trNum}` as keyof ChronoData, e.target.value)}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Results Strip */}
                                    <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-2.5">
                                        <div className="flex-1 text-center">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">T.Moy</p>
                                            <p className="text-sm font-black text-indigo-700 font-mono">{formatVal(data.tm)}</p>
                                        </div>
                                        <div className="w-px h-6 bg-slate-200"></div>
                                        <div className="flex-1 text-center">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">T.Maj</p>
                                            <p className="text-sm font-black text-emerald-700 font-mono">{formatVal(data.tempMajore)}</p>
                                        </div>
                                        <div className="w-px h-6 bg-slate-200"></div>
                                        <div className="flex-1 text-center">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">P° 85%</p>
                                            <p className="text-sm font-black text-slate-800 font-mono">{data.p85 ?? '—'}</p>
                                        </div>
                                        <div className="w-px h-6 bg-slate-200"></div>
                                        <div className="text-center px-2">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">{filledTRs}/{trCount}</p>
                                            <div className="w-8 h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                                                <div className={`h-full rounded-full ${filledTRs === trCount ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${(filledTRs / trCount) * 100}%` }} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Stopwatch */}
                                    {isExpanded && (
                                        <div className="mt-3 bg-gradient-to-br from-indigo-50 to-cyan-50 rounded-xl p-4 border border-indigo-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <AdvancedStopwatch
                                                onRecord={(time) => handleStopwatchRecord(op.id, time)}
                                                trCount={trCount}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ─── BOTTOM INSIGHT CARD ─── */}
            {operations.length > 0 && totals.tempMajore > 0 && (
                <div className="bg-white rounded-2xl sm:rounded-[2rem] border border-slate-200 shadow-sm p-4 sm:p-6 md:p-8 flex flex-col sm:flex-row gap-4 sm:gap-6 items-center">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
                        <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                        <h4 className="font-black text-slate-800 text-base sm:text-lg">Résumé de Production</h4>
                        <p className="text-slate-500 text-xs sm:text-sm mt-1 font-medium">
                            Temps présence: <strong className="text-slate-800">{presenceTime} min</strong> •
                            T. majoré: <strong className="text-emerald-700">{totals.tempMajore.toFixed(2)} min</strong> •
                            P° Max: <strong className="text-indigo-700">{totals.pMaxGlobal}</strong> •
                            Objectif 85%: <strong className="text-slate-900">{totals.p85Global} pcs/j</strong>
                        </p>
                    </div>
                    <div className="text-center px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-200 shrink-0">
                        <p className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase">Cible Quotidienne</p>
                        <p className="text-3xl sm:text-4xl font-black text-slate-900 mt-1">{totals.p85Global}</p>
                        <p className="text-slate-400 text-[10px] sm:text-xs font-medium">pièces / jour</p>
                    </div>
                </div>
            )}

            {/* ─── FOOTER INFO ─── */}
            <div className="bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-100 p-3 sm:p-4 flex items-center gap-3 print:hidden">
                <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400 shrink-0" />
                <p className="text-[10px] sm:text-xs text-slate-500 font-medium">
                    Production basée sur <strong>{presenceTime}</strong> min. Majoration par défaut: <strong>15%</strong> (1.15).
                    Cliquez ▾ pour le chronomètre. Unité: <strong>{unitSeconds ? 'secondes' : 'minutes'}</strong>.
                </p>
            </div>
        </div>
    );
}
