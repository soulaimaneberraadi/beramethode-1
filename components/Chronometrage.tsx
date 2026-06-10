import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Operation, ChronoData, Poste, Machine, CustomStation, HRWorker } from '../types';
import {
    Activity, ClipboardList,
    Timer, Play, Pause, RotateCcw,
    Zap, BarChart3, Target, ChevronDown, ChevronUp, Settings, Flag, X, Hash, Columns3, Pin,
    Plus, History, Trash2, TrendingUp, Pencil, Check, Eye
} from 'lucide-react';

interface ChronometrageProps {
    operations: Operation[];
    chronoData: Record<string, ChronoData>;
    setChronoData: React.Dispatch<React.SetStateAction<Record<string, ChronoData>>>;
    presenceTime: number;
    bf: number;
    numWorkers: number;
    efficiency: number;
    machines?: Machine[];
    assignments?: Record<string, string[]>;
    postes?: Poste[];
    currentModelId?: string | null;
    articleName?: string;
    setPresenceTime?: React.Dispatch<React.SetStateAction<number>>;
    setNumWorkers?: React.Dispatch<React.SetStateAction<number>>;
    setEfficiency?: React.Dispatch<React.SetStateAction<number>>;
    activeLayout?: 'zigzag' | 'free' | 'line' | 'double-zigzag';
    toleranceSaturation?: number;
    chronoCustomStations?: CustomStation[];
    setChronoCustomStations?: React.Dispatch<React.SetStateAction<CustomStation[]>>;
    chronoLayoutSide?: 'left' | 'right' | 'both';
    setChronoLayoutSide?: React.Dispatch<React.SetStateAction<'left' | 'right' | 'both'>>;
}

/** Snapshot d'une séance de chronométrage (relevés figés à un instant T). */
export interface ChronoSession {
    id: string;
    label: string;
    createdAt: number;            // timestamp
    /** Mesure par opération : temps moyen (tm) et temps majoré (tempMajore) en secondes. */
    entries: Record<string, { tm?: number; tempMajore?: number; pMax?: number }>;
    opNames: Record<string, string>; // nom des opérations au moment du snapshot
    totalTempMajore: number;      // somme des tempMajore (min) — pour la courbe globale
    gammeType?: 'default' | 'plantation' | 'new'; // Type de gamme utilisé
    orderSource?: 'gamme' | 'plantation'; // Source d'ordre des opérations
    modelId?: string; // ID du modèle associé
}

const CHRONO_SESSIONS_KEY = 'beramethode_chrono_sessions_v1';

type TimeUnit = 'ms' | 'cs' | 'ds' | 'sec' | 'min' | 'cmin' | 'dmin' | 'hour' | 'tmu' | 'sam';
type OutputMode = 'PJ' | 'PH';

const INPUT_NO_SPIN =
    '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const TIME_UNIT_OPTIONS: { id: TimeUnit; label: string; name: string; secondsFactor: number }[] = [
    { id: 'ms', label: 'ms', name: 'Millisecondes', secondsFactor: 0.001 },
    { id: 'cs', label: 'cs', name: 'Centi-secondes', secondsFactor: 0.01 },
    { id: 'ds', label: 'ds', name: 'Deci-secondes', secondsFactor: 0.1 },
    { id: 'sec', label: 'Sec', name: 'Secondes', secondsFactor: 1 },
    { id: 'min', label: 'Min', name: 'Minutes', secondsFactor: 60 },
    { id: 'cmin', label: 'cMin', name: 'Centi-minutes', secondsFactor: 0.6 },
    { id: 'dmin', label: 'dMin', name: 'Deci-minutes', secondsFactor: 6 },
    { id: 'hour', label: 'H', name: 'Heures', secondsFactor: 3600 },
    { id: 'tmu', label: 'TMU', name: 'Time Measurement Unit', secondsFactor: 0.036 },
    { id: 'sam', label: 'SAM', name: 'Standard Allowed Minute', secondsFactor: 60 },
];

const POSTE_COLORS = [
    { name: 'indigo', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-100', badgeText: 'text-indigo-800', fill: '#6366f1' },
    { name: 'orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100', badgeText: 'text-orange-800', fill: '#f97316' },
    { name: 'emerald', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100', badgeText: 'text-emerald-800', fill: '#10b981' },
    { name: 'rose', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', badge: 'bg-rose-100', badgeText: 'text-rose-800', fill: '#f43f5e' },
    { name: 'cyan', bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', badge: 'bg-cyan-100', badgeText: 'text-cyan-800', fill: '#06b6d4' },
    { name: 'amber', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100', badgeText: 'text-amber-800', fill: '#f59e0b' },
    { name: 'violet', bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100', badgeText: 'text-violet-800', fill: '#8b5cf6' },
    { name: 'lime', bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', badge: 'bg-lime-100', badgeText: 'text-lime-800', fill: '#84cc16' },
    { name: 'fuchsia', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', badge: 'bg-fuchsia-100', badgeText: 'text-fuchsia-800', fill: '#d946ef' },
    { name: 'teal', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', badge: 'bg-teal-100', badgeText: 'text-teal-800', fill: '#14b8a6' },
    { name: 'red', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100', badgeText: 'text-red-800', fill: '#ef4444' },
    { name: 'sky', bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', badge: 'bg-sky-100', badgeText: 'text-sky-800', fill: '#0ea5e9' },
];

const SPECIAL_COLORS = {
    controle: { name: 'orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', fill: '#f97316', badge: 'bg-orange-100', badgeText: 'text-orange-800' },
    fer: { name: 'rose', bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-800', fill: '#e11d48', badge: 'bg-rose-200', badgeText: 'text-rose-900' },
    finition: { name: 'purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', fill: '#a855f7', badge: 'bg-purple-100', badgeText: 'text-purple-800' },
    vide: { name: 'vide', bg: 'bg-transparent', border: 'border-slate-300 border-2 border-dashed', text: 'text-slate-400', fill: 'transparent', badge: 'bg-slate-100', badgeText: 'text-slate-500' },
};

const getPosteColor = (index: number, machineName: string, colorName?: string) => {
    if (machineName === 'VIDE') return SPECIAL_COLORS.vide;
    if (colorName) {
        const found = POSTE_COLORS.find(c => c.name === colorName);
        if (found) return found;
    }
    const name = machineName.toUpperCase();
    if (name.includes('CONTROL') || name.includes('CONTROLE')) return SPECIAL_COLORS.controle;
    if (name.includes('FER') || name.includes('REPASSAGE')) return SPECIAL_COLORS.fer;
    if (name.includes('FINITION')) return SPECIAL_COLORS.finition;
    return POSTE_COLORS[index % POSTE_COLORS.length];
};

function AdvancedStopwatch({ onRecord, onClear, onAdvance, onPrev, onNext, onUndoLast, trCount, filledCount = 0, compact = false }: {
    onRecord: (time: number) => void;
    onClear: () => void;
    onAdvance?: () => void;
    onPrev?: () => void;
    onNext?: () => void;
    onUndoLast?: () => void;
    trCount: number;
    filledCount?: number;
    compact?: boolean;
}) {
    const [running, setRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [laps, setLaps] = useState<{ time: number; total: number }[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startRef    = useRef<number>(0);
    const elapsedRef  = useRef<number>(0);
    const lapsRef     = useRef<{ time: number; total: number }[]>([]);
    const [confirmClear, setConfirmClear] = useState(false);
    const [rejectedFlash, setRejectedFlash] = useState(false); // flash when a lap is auto-rejected
    const lastTourTimeRef = useRef<number>(0); // Keeps track of when the last split (Tour) happened, even if rejected
    const initialFilledRef = useRef<number>(filledCount);
    const neededLaps = trCount - initialFilledRef.current;

    const vibrate = useCallback((pattern: number | number[]) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
    }, []);

    const beep = useCallback((freq = 880, duration = 80, volume = 0.25) => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(volume, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration / 1000);
        } catch { /* audio blocked */ }
    }, []);

    useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);
    useEffect(() => { lapsRef.current = laps; }, [laps]);

    useEffect(() => {
        if (running) {
            startRef.current = Date.now() - elapsedRef.current;
            intervalRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 16);
        } else {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        }
        return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
    }, [running]);

    const formatMs = (ms: number) => {
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        const cs   = Math.floor((ms % 1000) / 10);
        return { mins, secs, cs };
    };

    const formatSeconds = (ms: number) => {
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        const cs   = Math.floor((ms % 1000) / 10);
        const s = `${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
        return mins > 0 ? `${String(mins).padStart(2, '0')}:${s}` : s;
    };

    const isCompleted = neededLaps > 0 && laps.length >= neededLaps;
    useEffect(() => { if (isCompleted && running) setRunning(false); }, [isCompleted, running]);

    const handleReset = useCallback(() => {
        setRunning(false);
        setElapsed(0); elapsedRef.current = 0;
        setLaps([]); lapsRef.current = [];
        lastTourTimeRef.current = 0;
        initialFilledRef.current = 0; // Reset starting point so new laps can be recorded
    }, []);

    /**
     * Industrial Outlier Detection (Modified Z-Score / MAD)
     * Robust for small factory samples (N=3 to 30).
     * Uses Median Absolute Deviation (MAD) as the measure of dispersion.
     */
    const isOutlierIndustrial = useCallback((existingTimes: number[], candidate: number): boolean => {
        if (existingTimes.length < 3) return false;
        
        // 1. Calculate Median
        const sorted = [...existingTimes].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

        // 2. Calculate MAD (Median Absolute Deviation)
        const absoluteDeviations = sorted.map(v => Math.abs(v - median));
        const sortedAD = [...absoluteDeviations].sort((a, b) => a - b);
        const mad = sortedAD.length % 2 !== 0 ? sortedAD[mid] : (sortedAD[mid - 1] + sortedAD[mid]) / 2;

        // 3. Handle Zero Dispersion (All prior laps identical)
        if (mad === 0) {
            // Fallback: Reject if > 40% deviation from median
            return candidate > median * 1.4 || candidate < median * 0.6;
        }

        // 4. Calculate Modified Z-Score
        // Standard threshold is 3.5 for industrial outliers
        const modifiedZ = (0.6745 * Math.abs(candidate - median)) / mad;
        
        return modifiedZ > 3.5;
    }, []);

    const handleLapOrReset = useCallback(() => {
        if (running) {
            const cur = elapsedRef.current;
            if (cur === 0) return;
            const curLaps = lapsRef.current;
            if (curLaps.length >= neededLaps) return;
            
            // Calculate lap time based on the last tour (accepted or rejected)
            const lapTime = cur - lastTourTimeRef.current;

            // ── Auto-reject outlier (Industrial MAD method, ≥ 3 valid laps needed) ──
            const existingTimes = curLaps.map(l => l.time);
            if (isOutlierIndustrial(existingTimes, lapTime)) {
                // Flash rejection feedback — CRITICAL: Update ref so the NEXT attempt starts from now
                lastTourTimeRef.current = cur;
                vibrate([50, 30, 50, 30, 80]); beep(180, 200, 0.4); 
                setRejectedFlash(true);
                setTimeout(() => setRejectedFlash(false), 1800);
                return; // NOT recorded
            }

            const newLap = { time: lapTime, total: cur };
            setLaps(prev => [...prev, newLap]);
            lapsRef.current = [...curLaps, newLap];
            lastTourTimeRef.current = cur; // Update for next lap
            vibrate(30); beep(880, 60, 0.2);
            onRecord(parseFloat((lapTime / 1000).toFixed(2)));
        } else {
            handleReset();
        }
    }, [running, onRecord, neededLaps, handleReset, vibrate, beep, isOutlierIndustrial]);

    const handleUndo = useCallback(() => {
        const curLaps = lapsRef.current;
        if (curLaps.length === 0) return;
        const updated = curLaps.slice(0, -1);
        setLaps(updated); lapsRef.current = updated;
        const prevTotal = updated.length > 0 ? updated[updated.length - 1].total : 0;
        lastTourTimeRef.current = prevTotal; // Sync split ref with new last lap
        setElapsed(prevTotal); elapsedRef.current = prevTotal;
        startRef.current = Date.now() - prevTotal;
        vibrate([20, 10, 20]); beep(440, 80, 0.15);
        if (onUndoLast) onUndoLast();
    }, [onUndoLast, vibrate, beep]);

    // Statistical helpers
    const lapTimesMs = laps.map(l => l.time);
    const mean = lapTimesMs.length > 0 ? lapTimesMs.reduce((a, b) => a + b, 0) / lapTimesMs.length : 0;
    const variance = lapTimesMs.length > 1
        ? lapTimesMs.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / lapTimesMs.length : 0;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
    const nRequired = useMemo(() => {
        const n = lapTimesMs.length;
        if (n < 2) return null;
        const sumX  = lapTimesMs.reduce((a, b) => a + b, 0);
        const sumX2 = lapTimesMs.reduce((a, b) => a + b * b, 0);
        const inner = n * sumX2 - sumX * sumX;
        if (inner <= 0 || sumX === 0) return n;
        const res = Math.ceil(Math.pow(40 * Math.sqrt(Math.max(0, inner)) / sumX, 2));
        return isFinite(res) ? res : n;
    }, [lapTimesMs]);
    const cvStatus: 'valid' | 'warn' | 'invalid' =
        lapTimesMs.length < neededLaps ? 'warn' : cv < 10 ? 'valid' : cv < 15 ? 'warn' : 'invalid';
    const cvLabel = cvStatus === 'valid' ? 'Série valide' : cvStatus === 'warn' ? 'Vérifier' : 'Série invalide';
    const cvColor = cvStatus === 'valid' ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
        : cvStatus === 'warn' ? 'text-amber-600 bg-amber-50 border-amber-200'
        : 'text-rose-600 bg-rose-50 border-rose-200';

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (isCompleted) { beep(660, 120, 0.25); vibrate([30, 20, 80]); } }, [isCompleted]);
    // NOTE: Auto-advance removed — user must manually press Next arrow.
    // This prevents skipping when there are outliers that need verification.

    const { mins, secs, cs } = formatMs(elapsed);
    const rankedLaps = [...laps].sort((a, b) => a.time - b.time);
    const remainingSlots = Math.max(0, neededLaps - laps.length);
    const lastLapTotal = laps.length > 0 ? laps[laps.length - 1].total : 0;
    const currentLapElapsed = Math.max(0, elapsed - lastLapTotal);

    return (
        <div
            className={`w-full ${compact ? 'rounded-xl' : 'rounded-2xl'} overflow-hidden flex flex-col select-none`}
            style={{ background: '#f2f2f7', boxShadow: compact ? '0 2px 8px rgba(0,0,0,0.06)' : '0 4px 16px rgba(0,0,0,0.08)', fontFamily: '-apple-system, "SF Pro Display", sans-serif' }}
        >
            {/* Status row */}
            <div className={`flex items-center justify-between px-3 ${compact ? 'pt-1.5 pb-0.5' : 'pt-2.5 pb-0.5'}`}>
                <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold tracking-wide`} style={{ color: '#8e8e93' }}>
                    {isCompleted ? '✓ Complétés'
                        : running ? `Tour ${laps.length + 1}/${neededLaps}`
                        : `${remainingSlots} restant${remainingSlots !== 1 ? 's' : ''}`}
                </span>
                <div className="flex items-center gap-1.5">
                    <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-bold tabular-nums`} style={{ color: '#8e8e93' }}>
                        {Math.min(initialFilledRef.current + laps.length, trCount)}/{trCount}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${isCompleted ? 'bg-indigo-500' : running ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                </div>
            </div>

            {/* Time display — turns red when outlier is rejected */}
            <div
                className={`flex items-center justify-between px-3 ${compact ? 'pt-0.5 pb-0.5' : 'pt-1 pb-1'} rounded-xl mx-1 transition-colors duration-200`}
                style={{ background: rejectedFlash ? '#fff1f1' : 'transparent' }}
            >
                <div className="flex items-baseline tabular-nums tracking-tight"
                     style={{ color: rejectedFlash ? '#e5383b' : '#1c1c1e' }}>
                    {mins > 0 && (
                        <>
                            <span style={{ fontSize: compact ? '1.3rem' : '2.2rem', fontWeight: 300, lineHeight: 1 }}>{String(mins).padStart(2, '0')}</span>
                            <span style={{ fontSize: compact ? '0.95rem' : '1.6rem', fontWeight: 200, color: rejectedFlash ? '#e5383b' : '#aeaeb2', margin: '0 1px 2px', lineHeight: 1 }}>:</span>
                        </>
                    )}
                    <span style={{ fontSize: compact ? '1.3rem' : '2.2rem', fontWeight: 300, lineHeight: 1 }}>{String(secs).padStart(2, '0')}</span>
                    <span style={{ fontSize: compact ? '0.95rem' : '1.6rem', fontWeight: 200, color: rejectedFlash ? '#e5383b' : '#aeaeb2', margin: '0 1px', lineHeight: 1 }}>.</span>
                    <span style={{ fontSize: compact ? '1.3rem' : '2.2rem', fontWeight: 300, lineHeight: 1 }}>{String(cs).padStart(2, '0')}</span>
                </div>
                {/* Right side: rejected flash OR current lap sub-timer */}
                {rejectedFlash ? (
                    <div className="flex items-center gap-1 animate-pulse"
                         style={{ fontSize: compact ? '0.7rem' : '0.75rem', fontWeight: 700, color: '#e5383b' }}>
                        <span style={{ fontSize: compact ? '0.85rem' : '1rem' }}>⊘</span> Rejeté !
                    </div>
                ) : laps.length > 0 && !isCompleted ? (
                    <div className="tabular-nums" style={{ fontSize: compact ? '0.75rem' : '0.9rem', fontWeight: 400, color: '#8e8e93' }}>
                        {formatSeconds(currentLapElapsed)}
                    </div>
                ) : null}
            </div>


            {/* Lap table */}
            {laps.length > 0 && (
                <div className="mx-2 mb-1 rounded-xl overflow-hidden" style={{ background: '#ffffff' }}>
                    {!compact && (
                        <div className="grid grid-cols-3 px-3 py-1 border-b" style={{ borderColor: '#e5e5ea' }}>
                            <span className="text-[10px] font-semibold" style={{ color: '#8e8e93' }}>Tour</span>
                            <span className="text-[10px] font-semibold text-center" style={{ color: '#8e8e93' }}>T. Tour</span>
                            <span className="text-[10px] font-semibold text-right" style={{ color: '#8e8e93' }}>T. Total</span>
                        </div>
                    )}
                    {/* Keep lap area bounded so control buttons stay in place while recording tours. */}
                    <div className="overflow-y-auto" style={{ maxHeight: compact ? '3.5rem' : '7.5rem' }}>
                        {[...laps].reverse().map((lap, i) => {
                            const idx = laps.length - 1 - i;
                            const isFastest = rankedLaps.length > 1 && lap.time === rankedLaps[0].time;
                            const isSlowest = rankedLaps.length > 1 && lap.time === rankedLaps[rankedLaps.length - 1].time;
                            const isOutlier = mean > 0 && stdDev > 0 && Math.abs(lap.time - mean) > 2 * stdDev;
                            const prev = idx > 0 ? laps[idx - 1] : null;
                            const trendUp   = !!prev && lap.time > prev.time;
                            const trendDown = !!prev && lap.time < prev.time;
                            let rowBg = 'transparent', numColor = '#1c1c1e', timeColor = '#1c1c1e';
                            if (isSlowest || isOutlier) { rowBg = '#fff1f1'; numColor = '#e5383b'; timeColor = '#e5383b'; }
                            else if (isFastest)          { rowBg = '#f0f4ff'; numColor = '#3a6bdc'; timeColor = '#3a6bdc'; }
                            const ArrowIcon = () => {
                                const stroke = (isSlowest || isOutlier) ? '#e5383b' : isFastest ? '#3a6bdc' : '#8e8e93';
                                const opacity = (isFastest || isSlowest || isOutlier) ? 1 : 0.35;
                                const up   = isSlowest || isOutlier || (!isFastest && trendUp);
                                const down = isFastest || (!isSlowest && !isOutlier && trendDown);
                                if (!up && !down) return null;
                                const path = up ? 'M6 10L6 2M6 2L3 5M6 2L9 5' : 'M6 2L6 10M6 10L3 7M6 10L9 7';
                                return (
                                    <svg width={compact ? '6' : '8'} height={compact ? '6' : '8'} viewBox="0 0 12 12" fill="none" className="inline-block ml-0.5 -mt-px" style={{ opacity }}>
                                        <path d={path} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                );
                            };
                            return (
                                <div key={idx} className={`grid grid-cols-3 items-center px-3 ${compact ? 'py-0.5' : 'py-1.5'} border-b`}
                                     style={{ background: rowBg, borderColor: '#f2f2f7' }}>
                                    <div className="flex items-center">
                                        <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold tabular-nums`} style={{ color: numColor }}>
                                            {String(idx + 1).padStart(2, '0')}
                                        </span>
                                        <ArrowIcon />
                                    </div>
                                    <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold tabular-nums text-center`} style={{ color: timeColor }}>
                                        {formatSeconds(lap.time)}
                                    </span>
                                    <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold tabular-nums text-right`} style={{ color: '#3c3c43' }}>
                                        {formatSeconds(lap.total)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* CV bar — visible at all times when 2+ laps */}
            {laps.length >= 2 && (
                <div className={`mx-2 mb-1 px-3 ${compact ? 'py-0.5 text-[8.5px] rounded-lg' : 'py-1 text-[10px] rounded-xl'} font-bold border ${cvColor}`}>
                    <span className="uppercase tracking-wide">{cvLabel}</span>
                    <span className="font-mono">CV {cv.toFixed(1)}%</span>
                </div>
            )}

            {/* Completed overlay — shown when all laps done, but user stays here to verify */}
            {isCompleted && (
                <div className={`mx-2 mb-1 flex flex-col ${compact ? 'gap-0.5' : 'gap-1.5'}`}>
                    {/* Lifson warning if needed */}
                    {nRequired !== null && nRequired > neededLaps && (
                        <div className={`px-2.5 ${compact ? 'py-0.5 text-[8.5px] rounded-lg' : 'py-1 text-[10px] rounded-xl'} border border-amber-200 bg-amber-50 font-bold text-amber-700`}>
                            ⚠ Lifson : {nRequired} relevés recommandés pour fiabilité 95%
                        </div>
                    )}
                    {/* Outlier warning */}
                    {lapTimesMs.some((t, _, arr) => {
                        if (arr.length < 2) return false;
                        const m = arr.reduce((a,b)=>a+b,0)/arr.length;
                        const sd = Math.sqrt(arr.reduce((acc,v)=>acc+Math.pow(v-m,2),0)/arr.length);
                        return Math.abs(t - m) > 2 * sd;
                    }) && (
                        <div className={`px-2.5 ${compact ? 'py-0.5 text-[8.5px] rounded-lg' : 'py-1 text-[10px] rounded-xl'} border border-rose-200 bg-rose-50 font-bold text-rose-700`}>
                            ✗ Valeur aberrante détectée — vérifiez avant de continuer
                        </div>
                    )}
                    <div className={`flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 ${compact ? 'py-0.5 text-[9px]' : 'py-1.5'}`}>
                        <div className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} rounded-full bg-emerald-500 flex items-center justify-center shrink-0`}>
                            <Hash className={`${compact ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'} text-white`} />
                        </div>
                        <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} font-bold text-emerald-700`}>{trCount} relevés enregistrés</span>
                    </div>
                </div>
            )}

            {/* Bottom action & navigation bar */}
            {compact ? (
                <div className="mx-2 mb-1.5 flex flex-col gap-1.5">
                    {/* Navigation, Dots, and Reset/Clear Actions in one compact row */}
                    <div className="flex items-center justify-between gap-1.5 mt-0.5">
                        {/* Prev arrow */}
                        <button
                            onClick={onPrev}
                            disabled={!onPrev}
                            className="flex items-center justify-center active:scale-95 transition-transform"
                            style={{
                                width: '1.5rem', height: '1.5rem', borderRadius: '0.4rem',
                                background: onPrev ? '#e5e5ea' : 'transparent',
                                color: onPrev ? '#3c3c43' : '#c7c7cc',
                                border: 'none', outline: 'none',
                                cursor: onPrev ? 'pointer' : 'not-allowed',
                            }}
                            title="Poste précédent"
                        >
                            <ChevronDown className="w-3.5 h-3.5 rotate-90" />
                        </button>

                        {/* Middle: Actions OR Dots */}
                        <div className="flex-1 flex justify-center items-center gap-1.5">
                            {confirmClear ? (
                                <div className="flex gap-1.5 items-center">
                                    <span className="text-[8px] font-bold text-rose-600">Effacer?</span>
                                    <button onClick={() => setConfirmClear(false)} className="px-1.5 py-0.5 text-[8px] font-bold bg-slate-200 rounded">Non</button>
                                    <button onClick={() => { onClear(); handleReset(); setConfirmClear(false); vibrate([50, 30, 50]); }} className="px-1.5 py-0.5 text-[8px] font-bold bg-rose-500 text-white rounded">Oui</button>
                                </div>
                            ) : isCompleted ? (
                                <div className="flex gap-1">
                                    <button onClick={handleReset} className="flex items-center gap-0.5 px-2 py-0.5 text-[8.5px] font-bold bg-slate-200 hover:bg-slate-300 rounded text-slate-750 active:scale-95 transition-all">
                                        <RotateCcw className="w-2.5 h-2.5" /> Nouveau
                                    </button>
                                    <button onClick={() => setConfirmClear(true)} className="flex items-center gap-0.5 px-2 py-0.5 text-[8.5px] font-bold bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded active:scale-95 transition-all">
                                        <X className="w-2.5 h-2.5" /> Effacer
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Progress dots */}
                                    {neededLaps > 0 && (
                                        <div className="flex gap-0.5 items-center justify-center">
                                            {Array.from({ length: Math.min(neededLaps, 8) }, (_, k) => (
                                                <div key={k} className="rounded-full transition-colors duration-200"
                                                     style={{ width: '4px', height: '4px', background: k < laps.length ? '#3a6bdc' : '#d1d1d6' }} />
                                            ))}
                                            {neededLaps > 8 && <span className="text-[7px] font-bold text-slate-500">+{neededLaps - 8}</span>}
                                        </div>
                                    )}
                                    {/* Inline clear button if has laps but not finished */}
                                    {(laps.length > 0 || initialFilledRef.current > 0) && (
                                        <button onClick={() => setConfirmClear(true)} className="ml-1 p-0.5 text-slate-400 hover:text-rose-500 rounded active:scale-95 transition-all" title="Effacer tout">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Next arrow */}
                        <button
                            onClick={onNext || onAdvance}
                            disabled={!onNext && !onAdvance}
                            className="flex items-center justify-center active:scale-95 transition-transform"
                            style={{
                                width: '1.5rem', height: '1.5rem', borderRadius: '0.4rem',
                                background: isCompleted ? '#34c759' : (onNext || onAdvance) ? '#e5e5ea' : 'transparent',
                                color: isCompleted ? '#fff' : (onNext || onAdvance) ? '#3c3c43' : '#c7c7cc',
                                border: 'none', outline: 'none',
                                cursor: (onNext || onAdvance) ? 'pointer' : 'not-allowed',
                                boxShadow: isCompleted ? '0 1px 6px rgba(52,199,89,0.3)' : 'none',
                            }}
                            title="Poste suivant"
                        >
                            <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mx-2 mb-2 flex flex-col gap-1">
                    {/* Effacer / Nouveau cycle — always available */}
                    {(laps.length > 0 || isCompleted || initialFilledRef.current > 0) && !confirmClear && (
                        <div className="flex gap-1.5">
                            {isCompleted && (
                                <button onClick={handleReset}
                                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold active:scale-95 transition-all`}
                                    style={{ background: '#e5e5ea', color: '#3c3c43' }}>
                                    <RotateCcw className="w-3 h-3" /> Nouveau cycle
                                </button>
                            )}
                            <button onClick={() => setConfirmClear(true)}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold active:scale-95 transition-all`}
                                style={{ background: '#ffe5e5', color: '#e5383b', border: '1px solid #fecaca' }}>
                                <X className="w-3 h-3" /> Effacer
                            </button>
                        </div>
                    )}
                    {confirmClear && (
                        <div className="flex flex-col gap-1">
                            <p className="text-[10px] font-bold text-rose-600 text-center">Effacer les {trCount} relevés ?</p>
                            <div className="flex gap-1.5">
                                <button onClick={() => setConfirmClear(false)}
                                    className="flex-1 py-1.5 text-[11px] font-bold active:scale-95 transition-all"
                                    style={{ background: '#e5e5ea', color: '#3c3c43' }}>Annuler</button>
                                <button onClick={() => { onClear(); handleReset(); setConfirmClear(false); vibrate([50, 30, 50]); }}
                                    className="flex-1 py-1.5 text-[11px] font-bold active:scale-95 transition-all text-white"
                                    style={{ background: '#e5383b' }}>Confirmer</button>
                            </div>
                        </div>
                    )}

                    {/* Navigation row: ‹ prev | dots | next › */}
                    <div className="flex items-center justify-between mt-0.5">
                        {/* Prev arrow */}
                        <button
                            onClick={onPrev}
                            disabled={!onPrev}
                            className="flex items-center justify-center active:scale-95 transition-transform"
                            style={{
                                width: '2rem', height: '2rem', borderRadius: '0.5rem',
                                background: onPrev ? '#e5e5ea' : 'transparent',
                                color: onPrev ? '#3c3c43' : '#c7c7cc',
                                border: 'none', outline: 'none',
                                cursor: onPrev ? 'pointer' : 'not-allowed',
                            }}
                            title="Poste précédent"
                        >
                            <ChevronDown className="w-4 h-4 rotate-90" />
                        </button>

                        {/* Lap dots */}
                        {!isCompleted && neededLaps > 0 && (
                            <div className="flex gap-1 items-center flex-wrap justify-center" style={{ maxWidth: '5rem' }}>
                                {Array.from({ length: Math.min(neededLaps, 10) }, (_, k) => (
                                    <div key={k} className="rounded-full transition-colors duration-200"
                                         style={{ width: '5px', height: '5px', background: k < laps.length ? '#3a6bdc' : '#d1d1d6' }} />
                                ))}
                                {neededLaps > 10 && <span className="text-[8px] font-bold" style={{ color: '#8e8e93' }}>+{neededLaps - 10}</span>}
                            </div>
                        )}

                        {/* Next arrow — green when completed, gray otherwise */}
                        <button
                            onClick={onNext || onAdvance}
                            disabled={!onNext && !onAdvance}
                            className="flex items-center justify-center active:scale-95 transition-transform"
                            style={{
                                width: '2rem', height: '2rem', borderRadius: '0.5rem',
                                background: isCompleted ? '#34c759' : (onNext || onAdvance) ? '#e5e5ea' : 'transparent',
                                color: isCompleted ? '#fff' : (onNext || onAdvance) ? '#3c3c43' : '#c7c7cc',
                                border: 'none', outline: 'none',
                                cursor: (onNext || onAdvance) ? 'pointer' : 'not-allowed',
                                boxShadow: isCompleted ? '0 2px 8px rgba(52,199,89,0.35)' : 'none',
                            }}
                            title="Poste suivant"
                        >
                            <ChevronDown className="w-4 h-4 -rotate-90" />
                        </button>
                    </div>
                </div>
            )}

            {/* Main stopwatch controls (Tour / Arrêt-Début) */}
            {!isCompleted && (
                <div className={`flex items-center justify-between px-3 ${compact ? 'pb-2 pt-0' : 'pb-2.5 pt-0'} relative bg-[#f2f2f7]`}>
                    <button
                        onClick={handleLapOrReset}
                        disabled={elapsed === 0 && !running}
                        className="flex items-center justify-center active:scale-95 transition-transform"
                        style={{
                            width: compact ? '3.75rem' : '4.25rem', height: compact ? '1.75rem' : '2rem', borderRadius: compact ? '0.875rem' : '1rem',
                            background: '#e5e5ea', border: 'none', outline: 'none',
                            color: elapsed === 0 && !running ? '#c7c7cc' : '#1c1c1e',
                            fontWeight: 600, fontSize: compact ? '0.72rem' : '0.78rem',
                            boxShadow: elapsed === 0 && !running ? 'none' : '0 1px 6px rgba(0,0,0,0.10)',
                            cursor: elapsed === 0 && !running ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {running ? 'Tour' : 'Réinit'}
                    </button>
                    <div className="flex-1 flex justify-center items-center">
                        {laps.length > 0 && !isCompleted && (
                            <button onClick={handleUndo}
                                className={`flex items-center gap-0.5 ${compact ? 'text-[8px]' : 'text-[9px]'} font-bold px-2 py-0.5 rounded-full active:scale-95 transition-all hover:bg-white/50`}
                                style={{ color: '#8e8e93', background: 'rgba(0,0,0,0.04)' }} title="Annuler le dernier relevé">
                                <RotateCcw className={compact ? 'w-2 h-2' : 'w-2.5 h-2.5'} /> Annuler
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setRunning(!running)}
                        className="flex items-center justify-center active:scale-95 transition-transform"
                        style={{
                            width: compact ? '3.75rem' : '4.25rem', height: compact ? '1.75rem' : '2rem', borderRadius: compact ? '0.875rem' : '1rem',
                            background: running ? '#e5383b' : '#34c759', border: 'none', outline: 'none',
                            color: '#ffffff', fontWeight: 600, fontSize: compact ? '0.72rem' : '0.78rem', cursor: 'pointer',
                            boxShadow: running ? '0 2px 8px rgba(229,56,59,0.30)' : '0 2px 8px rgba(52,199,89,0.30)',
                        }}
                    >
                        {running ? 'Arrêt' : 'Début'}
                    </button>
                </div>
            )}
        </div>
    );
}


interface Workstation extends Poste {
    index: number;
    originalIndex: number;
    operations: Operation[];
    totalTime: number;
    saturation: number;
    operators: number;
    color: typeof POSTE_COLORS[0];
    groups: string[];
    feedsInto?: string;
    isFeeder?: boolean;
    targetStationName?: string;
    gammeOrderMin: number;
    dominantSection?: 'PREPARATION' | 'MONTAGE' | 'GLOBAL';
    parentOperators?: number;
}
const SAM_MAJORATION = 1.20;

/* ─── MAIN COMPONENT ─── */
export default function Chronometrage({
    operations,
    chronoData,
    setChronoData,
    presenceTime,
    bf,
    numWorkers,
    efficiency,
    machines = [],
    assignments = {},
    postes = [],
    currentModelId = null,
    articleName = '',
    setPresenceTime,
    setNumWorkers,
    setEfficiency,
    activeLayout = 'zigzag',
    toleranceSaturation = 115,
    chronoCustomStations = [],
    setChronoCustomStations,
    chronoLayoutSide = 'both',
    setChronoLayoutSide
}: ChronometrageProps) {

    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [trCount, setTrCount] = useState(5);
    const [trEnabled, setTrEnabled] = useState(false);
    const [showTrConfig, setShowTrConfig] = useState(false);
    const [targetQuantity, setTargetQuantity] = useState(100);
    const [unit, setUnit] = useState<TimeUnit>('sec');
    const previousUnitRef = useRef<TimeUnit>('sec');
    const [showUnitMenu, setShowUnitMenu] = useState(false);
    const unitMenuRef = useRef<HTMLDivElement>(null);
    const [sectionFilter, setSectionFilter] = useState<'ALL' | 'PREPARATION' | 'MONTAGE'>('ALL');
    const [outputMode, setOutputMode] = useState<OutputMode>('PJ');
    /** Colonne TS : temps gamme affiché en secondes (la gamme stocke `op.time` en minutes). */
    const [showTsColumn, setShowTsColumn] = useState(true);
    /** Colonnes + récap P° Max / P° Rdt (ou P/H) : indépendant du bouton P/J vs P/H. */
    const [showThroughputKpi, setShowThroughputKpi] = useState(true);
    /** Barre stats + outils : sticky en haut de #workflow-content ou défile avec le contenu. */
    const [stickyToolbar, setStickyToolbar] = useState(false);
    /** Source de l'ordre des opérations dans le tableau : ordre Gamme (défaut) ou ordre réel d'implantation (flux des postes). */
    const [orderSource, setOrderSource] = useState<'gamme' | 'plantation' | 'new'>('gamme');

    // State for inline suggestions / autocomplete inside custom cards
    const [activeSuggestionStationId, setActiveSuggestionStationId] = useState<string | null>(null);
    const [suggestionFilter, setSuggestionFilter] = useState('');

    const suggestions = useMemo(() => {
        if (!suggestionFilter) return [];
        const term = suggestionFilter.toLowerCase();
        return operations.filter(op => 
            op.description?.toLowerCase().includes(term) ||
            op.order.toString() === term
        );
    }, [suggestionFilter, operations]);

    // Worker suggestions states and logic
    const [activeOperatorStationId, setActiveOperatorStationId] = useState<string | null>(null);
    const [operatorFilter, setOperatorFilter] = useState('');
    const [activeWorkers, setActiveWorkers] = useState<HRWorker[]>([]);

    // Opérateur assigné par poste en mode "Plantation" (les postes viennent de l'implantation,
    // sans setter parent) — on garde l'affectation localement et on la persiste par modèle.
    const plantationOpsDefaultKey = 'beramethode_chrono_plant_ops_default';
    const plantationOpsKey = `beramethode_chrono_plant_ops_${currentModelId || 'default'}`;
    const [plantationOperators, setPlantationOperators] = useState<Record<string, string>>({});
    const loadedPlantationKeyRef = useRef<string | null>(null);

    useEffect(() => {
        // Ne recharger qu'une seule fois par clé (modèle).
        if (loadedPlantationKeyRef.current === plantationOpsKey) return;
        const prevKey = loadedPlantationKeyRef.current;
        loadedPlantationKeyRef.current = plantationOpsKey;
        try {
            const raw = localStorage.getItem(plantationOpsKey);
            const stored = raw ? JSON.parse(raw) : null;
            if (stored && Object.keys(stored).length > 0) {
                setPlantationOperators(stored);
            } else if (prevKey === plantationOpsDefaultKey) {
                // Un projet neuf vient de recevoir un id (autosave/restore) : la clé passe
                // de "default" à l'id réel. On NE doit PAS écraser les noms déjà saisis —
                // on les conserve (l'effet de sauvegarde les persistera sous la nouvelle clé).
            } else {
                // Première montée, ou bascule vers un modèle sans opérateurs enregistrés.
                setPlantationOperators({});
            }
        } catch {
            /* en cas d'erreur de parsing, on conserve l'état courant plutôt que de l'effacer */
        }
    }, [plantationOpsKey]);

    useEffect(() => {
        try {
            localStorage.setItem(plantationOpsKey, JSON.stringify(plantationOperators));
        } catch {
            /* ignore quota errors */
        }
    }, [plantationOpsKey, plantationOperators]);

    useEffect(() => {
        console.log('[Chrono] Fetching active workers...');
        fetch('/api/hr/workers?active=1', { credentials: 'include' })
            .then(res => {
                console.log('[Chrono] Fetch status:', res.status);
                return res.ok ? res.json() : [];
            })
            .then(data => {
                console.log('[Chrono] Fetched active workers count:', data.length);
                if (Array.isArray(data)) {
                    setActiveWorkers(data);
                }
            })
            .catch(err => console.error("[Chrono] Error fetching active workers:", err));
    }, []);

    const workerSuggestions = useMemo(() => {
        const term = operatorFilter.toLowerCase();
        // Exclude workers assigned to OTHER stations, not the current one
        // En "Plantation" chaque carte (poste + opération) a sa propre clé `stId__opId`.
        const assignedWorkerNames = new Set([
            ...(chronoCustomStations || [])
                .filter(s => s.id !== activeOperatorStationId)
                .map(s => s.operatorName)
                .filter(Boolean),
            ...Object.entries(plantationOperators)
                .filter(([key]) => key !== activeOperatorStationId)
                .map(([, name]) => name)
                .filter(Boolean),
        ]);
        
        const filtered = activeWorkers.filter(w => {
            // Exclude if already assigned elsewhere
            if (w.full_name && assignedWorkerNames.has(w.full_name)) return false;
            
            // Filter by search term (match full_name or matricule)
            if (!term) return true;
            return (
                (w.full_name || '').toLowerCase().includes(term) ||
                (w.matricule || '').toLowerCase().includes(term)
            );
        });

        console.log('[Chrono] Suggestions term:', term, 'assigned:', Array.from(assignedWorkerNames), 'filtered count:', filtered.length);
        return filtered;
    }, [operatorFilter, activeWorkers, chronoCustomStations, plantationOperators, activeOperatorStationId]);

    const fillCustomStationFromOperation = (stationId: string, op: Operation) => {
        let nameUpdate = '';
        let machineUpdate = op.machineId || '';
        let operatorUpdate = '';

        const assignedPosteIds = assignments?.[op.id] || [];
        if (assignedPosteIds.length > 0) {
            const foundPoste = postes?.find(p => p.id === assignedPosteIds[0]);
            if (foundPoste) {
                nameUpdate = foundPoste.name;
                machineUpdate = foundPoste.machine || '';
                operatorUpdate = foundPoste.operatorName || '';
            }
        }

        setChronoCustomStations?.(prev =>
            prev.map(s =>
                s.id === stationId
                    ? {
                        ...s,
                        description: op.description,
                        linkedOperationId: op.id,
                        name: nameUpdate || s.name,
                        machine: machineUpdate,
                        // Ne pas écraser un opérateur déjà saisi si le poste n'en fournit pas
                        operatorName: operatorUpdate || s.operatorName
                    }
                    : s
            )
        );
    };

    const deleteCustomStation = (id: string) => {
        setChronoCustomStations?.(prev => prev.filter(s => s.id !== id));
        setChronoData(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        if (activeRowId === id) setActiveRowId(null);
    };

    const getVisibleCustomStations = useCallback(() => {
        const left = (chronoCustomStations || []).filter(s => s.side === 'left');
        const right = (chronoCustomStations || []).filter(s => s.side === 'right');
        if (chronoLayoutSide === 'left') return left;
        if (chronoLayoutSide === 'right') return right;
        
        const visible: CustomStation[] = [];
        const maxLen = Math.max(left.length, right.length);
        for (let i = 0; i < maxLen; i++) {
            if (left[i]) visible.push(left[i]);
            if (right[i]) visible.push(right[i]);
        }
        return visible;
    }, [chronoCustomStations, chronoLayoutSide]);

    const handleCustomAdvance = useCallback((stationId: string) => {
        const visible = getVisibleCustomStations();
        const idx = visible.findIndex(s => s.id === stationId);
        if (idx !== -1 && idx < visible.length - 1) {
            setActiveRowId(visible[idx + 1].id);
        } else {
            setActiveRowId(null);
        }
    }, [getVisibleCustomStations]);

    const handleCustomPrev = useCallback((stationId: string) => {
        const visible = getVisibleCustomStations();
        const idx = visible.findIndex(s => s.id === stationId);
        if (idx > 0) {
            setActiveRowId(visible[idx - 1].id);
        }
    }, [getVisibleCustomStations]);

    const handleCustomNext = useCallback((stationId: string) => {
        const visible = getVisibleCustomStations();
        const idx = visible.findIndex(s => s.id === stationId);
        if (idx !== -1 && idx < visible.length - 1) {
            setActiveRowId(visible[idx + 1].id);
        }
    }, [getVisibleCustomStations]);

    /** Indice de flux (position du poste dans l'implantation) par opération — pour le tri "Plantation". */
    const plantationFlowIndex = useMemo(() => {
        // Sort a copy of postes by their minimum operation order in the gamme
        const sortedPostes = [...postes].sort((a, b) => {
            const getMinOrder = (p: Poste) => {
                const assigned = operations.filter(op => assignments?.[op.id]?.includes(p.id));
                return assigned.length > 0 ? Math.min(...assigned.map(o => o.order)) : 9999;
            };
            return getMinOrder(a) - getMinOrder(b);
        });

        const posteIndexById = new Map<string, number>();
        sortedPostes.forEach((p, i) => {
            posteIndexById.set(p.id, i);
            // Les sous-postes scindés (x2) partagent le flux de leur poste parent.
            const originalId = (p as any).originalId as string | undefined;
            if (originalId && !posteIndexById.has(originalId)) posteIndexById.set(originalId, i);
        });
        const map = new Map<string, number>();
        operations.forEach(op => {
            const aids = assignments?.[op.id] || [];
            let best = Infinity;
            aids.forEach(aid => {
                const idx = posteIndexById.get(aid);
                if (idx !== undefined && idx < best) best = idx;
            });
            map.set(op.id, best);
        });
        return map;
    }, [postes, assignments, operations]);

    const filteredOperations = useMemo(() => {
        const base = sectionFilter === 'ALL'
            ? operations
            : operations.filter(o => (o.section || 'GLOBAL') === sectionFilter);
        if (orderSource !== 'plantation') return base;
        // Tri par flux d'implantation ; opérations non assignées → à la fin, dans l'ordre Gamme.
        return [...base].sort((a, b) => {
            const fa = plantationFlowIndex.get(a.id) ?? Infinity;
            const fb = plantationFlowIndex.get(b.id) ?? Infinity;
            if (fa !== fb) return fa - fb;
            return (a.order ?? 0) - (b.order ?? 0);
        });
    }, [operations, sectionFilter, orderSource, plantationFlowIndex]);

    const hasSections = useMemo(
        () => operations.some(o => o.section === 'PREPARATION' || o.section === 'MONTAGE'),
        [operations]
    );

    const trSlots = useMemo(() => Array.from({ length: trCount }, (_, i) => i + 1), [trCount]);
    const operationsById = useMemo(
        () => Object.fromEntries(operations.map(op => [op.id, op])),
        [operations]
    );
    const machinesById = useMemo(
        () => new Map(machines.map(machine => [machine.id, machine])),
        [machines]
    );
    const machinesByName = useMemo(() => {
        const map = new Map<string, Machine>();
        machines.forEach((machine) => {
            const key = machine.name?.trim().toLowerCase();
            if (key && !map.has(key)) map.set(key, machine);
        });
        return map;
    }, [machines]);
    const posteColorById = useMemo(
        () => new Map(postes.map((poste, index) => [poste.id, getPosteColor(index, poste.machine, poste.colorName)])),
        [postes]
    );

    const roundValue = (n: number) => Math.round(n * 100) / 100;
    const displayValue = (n?: number) =>
        (n !== undefined && n !== null && !isNaN(n) ? String(roundValue(n)) : '');
    const getUnitMeta = (u: TimeUnit) => TIME_UNIT_OPTIONS.find(opt => opt.id === u) ?? TIME_UNIT_OPTIONS[3];
    const toSeconds = (value: number, sourceUnit: TimeUnit) => value * getUnitMeta(sourceUnit).secondsFactor;
    const fromSeconds = (valueInSeconds: number, targetUnit: TimeUnit) => valueInSeconds / getUnitMeta(targetUnit).secondsFactor;
    const toMinutes = (value: number, sourceUnit: TimeUnit) => toSeconds(value, sourceUnit) / 60;
    const convertUnitValue = (value: number, sourceUnit: TimeUnit, targetUnit: TimeUnit) => {
        if (sourceUnit === targetUnit) return value;
        return roundValue(fromSeconds(toSeconds(value, sourceUnit), targetUnit));
    };

    const unitLabel = getUnitMeta(unit).name.toLowerCase();
    const unitShort = getUnitMeta(unit).label;
    const resolveMachineForOperation = useCallback((opId: string): Machine | undefined => {
        const op = operationsById[opId];
        if (!op) return undefined;
        if (op.machineId && machinesById.has(op.machineId)) return machinesById.get(op.machineId);
        const nameKey = op.machineName?.trim().toLowerCase();
        if (nameKey && machinesByName.has(nameKey)) return machinesByName.get(nameKey);
        return undefined;
    }, [operationsById, machinesById, machinesByName]);
    const getDefaultMajoration = useCallback((opId: string) => {
        const machineMaj = resolveMachineForOperation(opId)?.cofs;
        if (typeof machineMaj === 'number' && !isNaN(machineMaj) && machineMaj > 0) return roundValue(machineMaj);
        const opMaj = operationsById[opId]?.majoration;
        return typeof opMaj === 'number' && !isNaN(opMaj) && opMaj > 0 ? roundValue(opMaj) : 1.15;
    }, [operationsById, resolveMachineForOperation]);
    const getMachineLabel = useCallback((opId: string) => {
        const resolvedMachine = resolveMachineForOperation(opId);
        if (resolvedMachine?.name) return resolvedMachine.name;
        const op = operationsById[opId];
        const label = op?.machineName?.trim() || op?.machineId?.trim();
        return label && label.length > 0 ? label : 'Machine non définie';
    }, [operationsById, resolveMachineForOperation]);
    const ensureRow = useCallback((opId: string, current?: ChronoData): ChronoData => {
        const defaultMaj = getDefaultMajoration(opId);
        const currentMaj = current?.majoration;
        return {
            operationId: opId,
            ...(current || {}),
            majoration: (typeof currentMaj === 'number' && !isNaN(currentMaj) && currentMaj > 0) ? currentMaj : defaultMaj
        };
    }, [getDefaultMajoration]);

    const recalcRow = (row: ChronoData, currentUnit: TimeUnit = unit): ChronoData => {
        const trs: number[] = [];
        for (let i = 1; i <= trCount; i++) {
            const v = row[`tr${i}` as keyof ChronoData];
            if (v !== undefined && v !== null && !isNaN(v as number) && (v as number) > 0) trs.push(v as number);
        }
        const trAvg = trs.length > 0 ? roundValue(trs.reduce((a, b) => a + b, 0) / trs.length) : undefined;
        const maj = row.majoration ?? 1.15;

        let tm: number | undefined;
        let tmManual = row.tmManual ?? false;
        if (row.tmManual && row.tm !== undefined && !isNaN(row.tm)) {
            tm = roundValue(row.tm);
            tmManual = true;
        } else if (trAvg !== undefined) {
            tm = trAvg;
            tmManual = false;
        } else {
            tm = undefined;
            tmManual = row.tmManual ?? false;
        }

        let tempMajore: number | undefined;
        let pMax: number | undefined;
        let p85: number | undefined;
        if (tm !== undefined && maj) {
            const tmMin = toMinutes(tm, currentUnit);
            tempMajore = roundValue(tmMin * maj);
            if (tempMajore > 0) {
                pMax = Math.round(presenceTime / tempMajore);
                p85 = Math.round(pMax * (Math.max(1, Math.min(100, efficiency)) / 100));
            }
        }
        return { ...row, tm, tmManual, majoration: maj, tempMajore, pMax, p85 };
    };

    const getChronoDataForOp = useCallback((opId: string, stId?: string): ChronoData => {
        let matchingKeys: string[] = [];
        if (stId) {
            matchingKeys = Object.keys(chronoData).filter(k => 
                k === `${stId}__${opId}` || 
                (k.startsWith(`${stId}__`) && k.endsWith(`__${opId}`))
            );
            if (matchingKeys.length === 0 && chronoData[opId]) {
                matchingKeys = [opId];
            }
        } else {
            matchingKeys = Object.keys(chronoData).filter(k => 
                k === opId || 
                k.endsWith(`__${opId}`)
            );
        }

        if (matchingKeys.length === 1) {
            return ensureRow(opId, chronoData[matchingKeys[0]]);
        } else if (matchingKeys.length > 1) {
            let sumTm = 0;
            let countTm = 0;
            let sumMaj = 0;
            let countMaj = 0;
            matchingKeys.forEach(k => {
                const row = recalcRow(ensureRow(opId, chronoData[k]), unit);
                if (row.tm !== undefined && !isNaN(row.tm)) {
                    sumTm += row.tm;
                    countTm++;
                }
                if (row.majoration !== undefined && !isNaN(row.majoration)) {
                    sumMaj += row.majoration;
                    countMaj++;
                }
            });
            const defaultMaj = getDefaultMajoration(opId);
            return {
                operationId: opId,
                tm: countTm > 0 ? roundValue(sumTm / countTm) : undefined,
                majoration: countMaj > 0 ? roundValue(sumMaj / countMaj) : defaultMaj,
                tmManual: true
            };
        } else {
            return ensureRow(opId, chronoData[opId]);
        }
    }, [chronoData, ensureRow, unit, getDefaultMajoration]);

    // Calculate Column Totals (moved up)
    const totals = useMemo(() => {
        let tmTotal = 0;
        let tempMajoreTotal = 0;
        let filledCount = 0;
        const pMaxPerOp: number[] = [];
        const p85PerOp: number[] = [];
        const eff = Math.max(1, Math.min(100, efficiency));

        const targetList = orderSource === 'new' ? (chronoCustomStations || []) : operations;

        targetList.forEach(item => {
            const isCustom = orderSource === 'new';
            const id = item.id;
            const data = getChronoDataForOp(id);
            const row = recalcRow(data, unit);
            if (row.tm !== undefined && !isNaN(row.tm)) { tmTotal += row.tm; filledCount++; }
            
            let opTempMajore = 0;
            if (row.tempMajore !== undefined) {
                opTempMajore = row.tempMajore;
            } else if (!isCustom) {
                const op = item as Operation;
                if (showTsColumn) {
                    opTempMajore = (op.time || 0) * (row.majoration || 1.15);
                }
            } else {
                const cs = item as CustomStation;
                if (cs.linkedOperationId) {
                    const linkedOp = operations.find(o => o.id === cs.linkedOperationId);
                    if (linkedOp && showTsColumn) {
                        opTempMajore = (linkedOp.time || 0) * (row.majoration || 1.15);
                    }
                }
            }
            tempMajoreTotal += opTempMajore;
            
            if (opTempMajore > 0) {
                const opPMax = Math.round(presenceTime / opTempMajore);
                pMaxPerOp.push(opPMax);
                const opP85 = Math.round(opPMax * (eff / 100));
                p85PerOp.push(opP85);
            }
        });

        let pMaxGlobal = 0;
        if (pMaxPerOp.length > 0) {
            pMaxGlobal = Math.min(...pMaxPerOp);
        } else if (tempMajoreTotal > 0) {
            pMaxGlobal = Math.round(presenceTime / tempMajoreTotal);
        }
        let p85Global = 0;
        if (p85PerOp.length > 0) {
            p85Global = Math.min(...p85PerOp);
        } else if (pMaxGlobal > 0) {
            p85Global = Math.round(pMaxGlobal * (eff / 100));
        }

        return { tm: tmTotal, tempMajore: tempMajoreTotal, filledCount, pMaxGlobal, p85Global };
    }, [chronoData, operations, chronoCustomStations, orderSource, presenceTime, efficiency, unit, trCount, trEnabled, getChronoDataForOp]);

    const totalCountForProgress = orderSource === 'new' ? (chronoCustomStations || []).length : operations.length;
    const progressPercent = totalCountForProgress > 0 ? Math.round((totals.filledCount / totalCountForProgress) * 100) : 0;
    const clampedEfficiency = Math.max(1, Math.min(100, efficiency));
    const hasChronoCycle = totals.filledCount > 0;
    const chronoBfMinutes = hasChronoCycle && numWorkers > 0
        ? totals.tempMajore / numWorkers
        : bf;
    const effectiveTempsArticle = totals.tempMajore > 0 ? totals.tempMajore : (bf * numWorkers);
    const prodHour100Chrono = effectiveTempsArticle > 0 ? (numWorkers * 60) / effectiveTempsArticle : 0;
    const prodDayEffChrono = effectiveTempsArticle > 0 ? ((presenceTime * numWorkers) / effectiveTempsArticle) * (efficiency / 100) : 0;
    const prodHourEffChrono = effectiveTempsArticle > 0 ? (((presenceTime * numWorkers) / effectiveTempsArticle) / (presenceTime / 60)) * (efficiency / 100) : 0;
    const presenceHours = presenceTime / 60;
    const cycleHours = totals.tempMajore / 60;
    const estimatedDays = totals.p85Global > 0 ? targetQuantity / totals.p85Global : 0;
    const visibleTrCount = trEnabled ? trCount : 0;
    const desktopColSpan =
        visibleTrCount + 5 + (showTsColumn ? 1 : 0) + (showThroughputKpi ? 2 : 0);

    // ─── SÉANCES DE CHRONO (historique + évolution) ───
    const [sessions, setSessions] = useState<ChronoSession[]>([]);
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [sessionLabelDraft, setSessionLabelDraft] = useState('');
    /** Métrique suivie dans la courbe d'évolution. */
    const [evolutionMetric, setEvolutionMetric] = useState<'tempMajore' | 'tm'>('tempMajore');
    /** Type de gamme pour la nouvelle séance. */
    const [newSessionGammeType, setNewSessionGammeType] = useState<'default' | 'plantation' | 'new'>('default');
    /** Source d'ordre pour la nouvelle séance. */
    const [newSessionOrderSource, setNewSessionOrderSource] = useState<'gamme' | 'plantation'>('gamme');
    /** Session sélectionnée pour affichage détaillé (page dédiée). */
    const [selectedSession, setSelectedSession] = useState<ChronoSession | null>(null);
    /** Show create session dialog. */
    const [showCreateDialog, setShowCreateDialog] = useState(false);

    // Charger les séances depuis l'API
    useEffect(() => {
        if (!currentModelId) { setSessions([]); return; }
        fetch(`/api/chrono/sessions?modelId=${currentModelId}`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : [])
            .then((data: ChronoSession[]) => setSessions(Array.isArray(data) ? data : []))
            .catch(() => setSessions([]));
    }, [currentModelId]);

    /** Fige les relevés actuels dans une nouvelle séance horodatée. */
    const createSession = useCallback(async () => {
        const entries: ChronoSession['entries'] = {};
        const opNames: Record<string, string> = {};
        let totalTempMajore = 0;
        operations.forEach(op => {
            const row = getChronoDataForOp(op.id);
            opNames[op.id] = op.description || `Op. ${op.order}`;
            if (row) {
                entries[op.id] = { tm: row.tm, tempMajore: row.tempMajore, pMax: row.pMax };
                totalTempMajore += row.tempMajore || 0;
            }
        });
        const now = new Date();
        const label = `Chrono ${sessions.length + 1} · ${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        const session: ChronoSession = {
            id: `CS-${Date.now()}`,
            label,
            createdAt: now.getTime(),
            entries,
            opNames,
            totalTempMajore: roundValue(totalTempMajore),
            gammeType: newSessionGammeType,
            orderSource: newSessionOrderSource,
        };
        try {
            const res = await fetch('/api/chrono/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    modelId: currentModelId,
                    ...session,
                }),
            });
            if (res.ok) {
                const saved = await res.json();
                setSessions(prev => [...prev, { ...session, ...saved }]);
            }
        } catch { /* fallback to local only */ }
        setShowCreateDialog(false);
    }, [operations, getChronoDataForOp, sessions.length, currentModelId, newSessionGammeType, newSessionOrderSource]);

    const deleteSession = useCallback(async (id: string) => {
        try {
            await fetch(`/api/chrono/sessions/${id}`, { method: 'DELETE', credentials: 'include' });
        } catch { /* continue even if API fails */ }
        setSessions(prev => prev.filter(s => s.id !== id));
        if (selectedSession?.id === id) setSelectedSession(null);
    }, [selectedSession]);

    const startRenameSession = (s: ChronoSession) => { setEditingSessionId(s.id); setSessionLabelDraft(s.label); };
    const commitRenameSession = async () => {
        if (!editingSessionId) return;
        const label = sessionLabelDraft.trim();
        setSessions(prev => prev.map(s => (s.id === editingSessionId ? { ...s, label: label || s.label } : s)));
        try {
            await fetch(`/api/chrono/sessions/${editingSessionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ label: label || undefined }),
            });
        } catch { /* ignore */ }
        setEditingSessionId(null);
        setSessionLabelDraft('');
    };

    const gammeTypeOptions = [
        { value: 'default' as const, label: 'Défaut', desc: 'Ordre de la Gamme' },
        { value: 'plantation' as const, label: 'Plantation', desc: 'Flux réel atelier' },
        { value: 'new' as const, label: 'Nouveau', desc: 'Nouvelle séquence' },
    ];

    const getGlobalStationIndex = (st: Workstation) => {
        if (!workstationsList) return st.index;
        const uniqueGlobalIds = Array.from(new Set(workstationsList.map(w => w.originalId || w.id)));
        const idx = uniqueGlobalIds.indexOf(st.originalId || st.id);
        return idx >= 0 ? idx + 1 : st.index;
    };

    const workstationsList = useMemo(() => {
        if (postes && postes.length > 0 && assignments) {
            const toleranceRatio = (toleranceSaturation ?? 115) / 100;
            
            // Sort a copy of postes by their minimum operation order in the gamme
            const sortedPostes = [...postes].sort((a, b) => {
                const getMinOrder = (p: Poste) => {
                    const assigned = operations.filter(op => assignments[op.id]?.includes(p.id));
                    return assigned.length > 0 ? Math.min(...assigned.map(o => o.order)) : 9999;
                };
                return getMinOrder(a) - getMinOrder(b);
            });

            let initialStations: Workstation[] = sortedPostes.map((p, realIndex) => {
                let totalTime = 0; let saturation = 0; let operators = 1;
                const assignedOps = operations.filter(op => assignments[op.id]?.some(aid => aid === p.id || (p.originalId && aid === p.originalId)));
                const groups = [...new Set(assignedOps.map(op => op.groupId).filter(Boolean) as string[])];
                const gammeOrderMin = assignedOps.length > 0 ? Math.min(...assignedOps.map(o => o.order)) : 9999;

                const activeBf = hasChronoCycle ? chronoBfMinutes : bf;

                if (p.timeOverride !== undefined) {
                    totalTime = p.timeOverride;
                    if (activeBf > 0) {
                        operators = 1;
                        saturation = ((totalTime * SAM_MAJORATION) / activeBf) * 100;
                    }
                } else {
                    let standardTotalTime = 0;
                    assignedOps.forEach(op => {
                        let sharingCount = 1;
                        if (p.originalId) {
                            sharingCount = sortedPostes.filter(x => x.originalId === p.originalId).length;
                        } else {
                            sharingCount = assignments[op.id]?.length || 1;
                        }

                        standardTotalTime += (op.time || 0) / sharingCount;

                        const data = getChronoDataForOp(op.id, p.id);
                        const row = recalcRow(data, unit);
                        const isMeasured = row.tempMajore !== undefined;
                        
                        let opTime = 0;
                        if (isMeasured) {
                            if (trEnabled || !showTsColumn) {
                                opTime = row.tempMajore;
                            } else {
                                opTime = (op.time || 0) * (row.majoration || 1.15);
                            }
                        } else {
                            if (showTsColumn) {
                                opTime = (op.time || 0) * (row.majoration || 1.15);
                            } else {
                                opTime = 0;
                            }
                        }

                        totalTime += opTime / sharingCount;
                    });

                    const nTheo = activeBf > 0 ? (standardTotalTime * SAM_MAJORATION) / activeBf : 0;
                    operators = nTheo > toleranceRatio ? Math.ceil(nTheo) : (nTheo > 0 ? 1 : 0);

                    if (p.originalId) {
                        operators = 1;
                    }

                    saturation = (operators > 0 && activeBf > 0) ? (totalTime / (operators * activeBf)) * 100 : 0;
                }
                operators = Math.max(1, operators);
                const pNum = parseInt(p.name.replace(/^P/i, ''));
                const effectiveIndex = !isNaN(pNum) ? pNum - 1 : realIndex;
                
                // Color mapping logic
                const color = getPosteColor(effectiveIndex, p.machine, p.colorName);

                let feedsInto: string | undefined = undefined;
                let isFeeder = false;

                for (const op of assignedOps) {
                    if (op.targetOperationId) {
                        const targetStation = sortedPostes.find(st => assignments[op.targetOperationId!]?.includes(st.id));
                        if (targetStation && targetStation.id !== p.id) {
                            feedsInto = targetStation.id;
                            isFeeder = true;
                            break;
                        }
                    }
                }

                const isBroken = p.notes?.includes('#PANNE');
                const sectionTimes: Record<string, number> = { PREPARATION: 0, MONTAGE: 0, GLOBAL: 0 };
                assignedOps.forEach(o => { sectionTimes[o.section || 'GLOBAL'] += (o.time || 0); });
                const dominantSection: 'PREPARATION' | 'MONTAGE' | 'GLOBAL' =
                    sectionTimes.PREPARATION > sectionTimes.MONTAGE && sectionTimes.PREPARATION > sectionTimes.GLOBAL ? 'PREPARATION'
                        : sectionTimes.MONTAGE > sectionTimes.GLOBAL ? 'MONTAGE'
                            : 'GLOBAL';
                return { ...p, index: 0, originalIndex: realIndex, operations: assignedOps, totalTime, saturation, operators, color, groups, feedsInto, isFeeder, gammeOrderMin, isPlaced: p.isPlaced, status: isBroken ? 'panne' as const : 'ok' as const, x: p.x, y: p.y, rotation: p.rotation, shape: p.shape, dominantSection };
            });

            const expandedResult: Workstation[] = [];
            initialStations.forEach((st) => {
                const showOnCanvas = st.machine !== 'VIDE';
                if (showOnCanvas) {
                    if (st.originalId || st.operators <= 1) {
                        expandedResult.push({ ...st, index: expandedResult.length + 1, isPlaced: true });
                    } else {
                        for (let i = 1; i <= st.operators; i++) {
                            expandedResult.push({
                                ...st,
                                id: `${st.id}__${i}`,
                                originalId: st.id,
                                name: `${st.name.replace('P', '').split('.')[0]}.${i}`,
                                index: expandedResult.length + 1,
                                totalTime: st.totalTime / st.operators,
                                parentOperators: st.operators,
                                operators: 1,
                                isPlaced: true
                            });
                        }
                    }
                }
            });
            return expandedResult;
        }
        return [];
    }, [operations, bf, assignments, postes, toleranceSaturation, chronoData, unit, trEnabled, trCount, efficiency, hasChronoCycle, chronoBfMinutes, getChronoDataForOp, showTsColumn]);

    const structureSections = useMemo(() => {
        if (!workstationsList || workstationsList.length === 0) return [];
        
        const prep = workstationsList.filter(st => st.dominantSection === 'PREPARATION');
        const montage = workstationsList.filter(st => st.dominantSection === 'MONTAGE');
        const global = workstationsList.filter(st => st.dominantSection === 'GLOBAL');

        const sections = [];
        if (prep.length > 0) sections.push({ 
            id: 'PREPARATION', 
            name: 'PRÉPARATION', 
            stations: prep, 
            theme: 'amber'
        });
        if (montage.length > 0) sections.push({ 
            id: 'MONTAGE', 
            name: 'MONTAGE', 
            stations: montage, 
            theme: 'sky'
        });
        if (global.length > 0) sections.push({ 
            id: 'GLOBAL', 
            name: (prep.length || montage.length) ? 'ZONE COMMUNE' : 'PRODUCTION GLOBALE', 
            stations: global, 
            theme: 'indigo'
        });
        
        if (prep.length === 0 && montage.length === 0 && global.length === 0 && workstationsList.length > 0) {
             sections.push({
                id: 'GLOBAL',
                name: 'Flux de Production',
                stations: workstationsList,
                theme: 'indigo'
             });
        }
        
        return sections;
    }, [workstationsList]);

    const getSaturationBadgeStyles = (sat: number) => {
        const tolerance = toleranceSaturation ?? 115;
        if (sat > tolerance) return 'text-rose-700 bg-rose-50 border-rose-200';
        if (sat >= 70) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
        if (sat >= 40) return 'text-amber-700 bg-amber-50 border-amber-200';
        return 'text-slate-600 bg-slate-50 border-slate-200';
    };

    const isWorkstationCompleted = (st: Workstation) => {
        return st.operations.every(op => {
            const data = getChronoDataForOp(op.id, st.id);
            const filledTRs = trSlots.filter(n => data[`tr${n}` as keyof ChronoData] !== undefined).length;
            return trEnabled ? (filledTRs >= trCount) : (data.tm !== undefined);
        });
    };

    const renderStationCells = (st: Workstation | undefined) => {
        if (!st) {
            return (
                <>
                    <td className="border-none py-4"></td>
                    <td className="border-none py-4"></td>
                    <td className="border-none py-4"></td>
                    <td className="border-none py-4"></td>
                    <td className="border-none py-4"></td>
                    <td className="border-none py-4"></td>
                    <td className="border-none py-4"></td>
                    <td className="border-none py-4"></td>
                </>
            );
        }

        const fill = st.color?.fill || '#64748b';
        const sat = Math.round(st.saturation || 0);
        const isCompleted = isWorkstationCompleted(st);
        
        const stationMeasuredTime = st.operations.reduce((acc, op) => {
            const r = recalcRow(getChronoDataForOp(op.id), unit);
            const oMeasured = r.tempMajore !== undefined;
            
            let tInSec = 0;
            if (oMeasured) {
                if (trEnabled || !showTsColumn) {
                    tInSec = r.tempMajore * 60;
                } else {
                    tInSec = op.time * (r.majoration || 1.15) * 60;
                }
            } else {
                if (showTsColumn) {
                    tInSec = op.time * (r.majoration || 1.15) * 60;
                } else {
                    tInSec = 0;
                }
            }
            return acc + tInSec;
        }, 0);
        
        const photos = st.operations.map(op => op.photo).filter(Boolean) as string[];

        return (
            <>
                <td className="py-2.5 px-2 text-center align-middle w-10">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${isCompleted ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                        {isCompleted && (
                            <svg className="w-3.5 h-3.5 stroke-current stroke-[3]" fill="none" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </div>
                </td>
                <td className="py-2.5 px-2 align-middle w-24">
                    {photos.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                            {photos.slice(0, 3).map((p, idx) => (
                                <img key={idx} src={p} className="w-8 h-8 object-cover rounded-lg border border-slate-200" alt="Op" />
                            ))}
                        </div>
                    ) : (
                        <span className="text-slate-300 text-xs">—</span>
                    )}
                </td>
                <td className="py-2.5 px-2 font-black text-slate-800 align-middle w-24 border-l-4 text-left" style={{ borderLeftColor: fill }}>
                    <div className="flex items-center gap-1.5 justify-start">
                        <span className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.5 rounded border font-extrabold shrink-0">#{st.index}</span>
                        <span className="text-xs font-black truncate">{st.name}</span>
                    </div>
                </td>
                <td className="py-2.5 px-2 text-slate-700 font-bold align-middle w-24 text-[11px] truncate max-w-[100px] text-left">{st.machine}</td>
                <td className="py-2.5 px-2 align-middle text-left">
                    <div className="flex flex-col gap-1.5">
                        {st.operations.map(op => {
                            const isOpActive = op.id === activeRowId;
                            const data = getChronoDataForOp(op.id);
                            const filled = trSlots.filter(n => data[`tr${n}` as keyof ChronoData] !== undefined).length;
                            const statusVal = getRowValidity(op.id);
                            
                            let dotColor = 'bg-slate-200';
                            if (statusVal === 'valid') dotColor = 'bg-emerald-500';
                            else if (statusVal === 'warn') dotColor = 'bg-amber-400';
                            else if (statusVal === 'invalid') dotColor = 'bg-rose-500';
                            
                            return (
                                <button
                                    key={op.id}
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveRowId(isOpActive ? null : op.id);
                                        setExpandedRows(prev => {
                                            const next = new Set(prev);
                                            if (isOpActive) next.delete(op.id); else next.add(op.id);
                                            return next;
                                        });
                                    }}
                                    className={`flex items-center justify-between text-left p-1.5 rounded-lg border transition-all w-full focus:outline-none ${isOpActive ? 'bg-indigo-600 text-white border-indigo-600 shadow' : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'}`}
                                >
                                    <span className="font-extrabold text-[11px] truncate flex-1 leading-tight pr-1" title={op.description}>
                                        • {op.description}
                                    </span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {trEnabled && (
                                            <span className={`text-[9px] font-black font-mono ${isOpActive ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                {filled}/{trCount}
                                            </span>
                                        )}
                                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </td>
                <td className="py-2.5 px-2 font-black text-indigo-700 align-middle w-20 text-center font-mono text-xs">{Math.round(stationMeasuredTime)}s</td>
                <td className="py-2.5 px-2 align-middle w-20 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black border ${getSaturationBadgeStyles(sat)}`}>
                        {sat}%
                    </span>
                </td>
                <td className="py-2.5 px-2 text-slate-500 align-middle w-24 text-xs font-semibold text-left">{st.operatorName || '—'}</td>
            </>
        );
    };

    const renderOpChronoDetailPanel = (opId: string) => {
        const op = operationsById[opId];
        if (!op) return null;
        const data = getChronoDataForOp(op.id);
        const row = recalcRow(data, unit);
        const filledTRs = trSlots.filter(n => data[`tr${n}` as keyof ChronoData] !== undefined).length;
        const rowTRs = getRowTRs(data);
        const median = getMedian(rowTRs);

        return (
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl border border-indigo-100 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col text-left">
                {/* Header Info */}
                <div className="bg-gradient-to-r from-indigo-50/50 to-white px-5 py-4 border-b border-indigo-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                    <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                            Chronométrage Actif
                        </span>
                        <h4 className="font-black text-slate-800 text-sm mt-1.5 leading-snug line-clamp-2">{op.description}</h4>
                        <p className="text-slate-500 text-[11px] font-medium mt-0.5 flex items-center gap-1.5">
                            <span className="font-semibold text-slate-400">Machine :</span> 
                            <strong className="text-indigo-600 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/50">{getMachineLabel(op.id)}</strong>
                        </p>
                    </div>
                    {showTsColumn && (
                        <div className="shrink-0 text-left sm:text-right">
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg inline-block">
                                TS: {formatTsSeconds(op.time)} s
                            </span>
                        </div>
                    )}
                </div>

                {/* Stopwatch Component */}
                <AdvancedStopwatch
                    key={op.id}
                    onRecord={(time) => handleStopwatchRecord(op.id, time)}
                    onClear={() => clearAllTRs(op.id)}
                    onAdvance={() => advanceToNextOp(op.id)}
                    onPrev={() => goToPrevOp(op.id)}
                    onNext={() => goToNextOp(op.id)}
                    onUndoLast={() => clearLastTR(op.id)}
                    trCount={trCount}
                    filledCount={filledTRs}
                />

                {/* TR Inputs & Calculations (Only needed in plantation because columns don't exist) */}
                <div className="p-5 border-t border-slate-100 bg-slate-50/50 text-left">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saisie des Relevés (Unité : {unitShort})</span>
                        {!trEnabled && (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">TR OFF</span>
                        )}
                    </div>

                    {trEnabled ? (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                            {trSlots.map(trNum => {
                                const val = data[`tr${trNum}` as keyof ChronoData];
                                const hasVal = val !== undefined && val !== null && (val as number) > 0;
                                const status = hasVal ? classifyTR(val as number, median) : 'normal';
                                return (
                                    <div key={trNum} className="relative group/cell text-center">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">TR {trNum}</span>
                                        <div className="relative">
                                            <input
                                                type="number" step="0.01" min="0"
                                                className={`w-full py-2 px-2 text-center text-sm font-mono font-bold border rounded-lg bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder:text-slate-300 ${INPUT_NO_SPIN} ${hasVal ? trStatusStyles[status] : 'text-indigo-600 border-slate-200 bg-white shadow-sm'}`}
                                                placeholder="—"
                                                value={hasVal && typeof val === 'number' ? displayValue(val) : ''}
                                                onChange={e => handleCellChange(op.id, `tr${trNum}` as keyof ChronoData, e.target.value)}
                                            />
                                            {hasVal && (
                                                <button
                                                    type="button"
                                                    aria-label={`Supprimer TR ${trNum}`}
                                                    onClick={(e) => handleClearTRClick(e, op.id, trNum)}
                                                    className="absolute -top-1.5 -right-1.5 z-10 flex h-[16px] w-[16px] items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 shadow-sm opacity-0 scale-90 transition-all duration-200 group-hover/cell:opacity-100 group-hover/cell:scale-100 hover:bg-rose-50 hover:text-rose-600"
                                                    title="Supprimer"
                                                >
                                                    <X className="w-2.5 h-2.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-semibold mb-4">
                            Les relevés individuels (TR) sont désactivés. Vous pouvez saisir directement le temps moyen (T. Moyen) ci-dessous.
                        </div>
                    )}

                    {/* Calculations strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm">
                        <div className="text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">T. Moyen</span>
                            <div className="mt-1 relative flex flex-col items-center">
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className={`w-full max-w-[6.5rem] px-2.5 py-1.5 text-center text-sm font-black text-indigo-700 font-mono border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none ${INPUT_NO_SPIN} shadow-inner`}
                                    placeholder="—"
                                    value={displayValue(row.tm)}
                                    onChange={e => handleCellChange(op.id, 'tm', e.target.value)}
                                />
                                {row.tmManual && (
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">manuel</span>
                                )}
                            </div>
                        </div>
                        
                        <div className="text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Majoration</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                className={`mt-1 w-full max-w-[5rem] mx-auto px-2.5 py-1.5 text-center text-sm font-mono font-bold text-slate-700 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none ${INPUT_NO_SPIN} shadow-inner`}
                                value={displayValue(data.majoration)}
                                onChange={e => handleCellChange(op.id, 'majoration', e.target.value)}
                            />
                        </div>
                        
                        <div className="text-center flex flex-col justify-center border-l border-slate-100 pl-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">T. Majoré</span>
                            <span className="mt-1.5 text-sm font-black text-emerald-700 font-mono block">
                                {formatTempMajoreInUnit(row.tempMajore)}
                            </span>
                        </div>
                        
                        {showThroughputKpi && (
                            <div className="text-center flex flex-col justify-center border-l border-slate-100 pl-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                    {outputMode === 'PJ' ? 'P° Rdt (85%)' : 'P/H Rdt'}
                                </span>
                                <span className="mt-1.5 text-sm font-black text-slate-800 font-mono block">
                                    {formatProductionCell(row.p85, outputMode)}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Footer buttons */}
                    <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => {
                                setActiveRowId(null);
                                setExpandedRows(prev => {
                                    const next = new Set(prev);
                                    next.delete(op.id);
                                    return next;
                                });
                            }}
                            className="px-4 py-2 rounded-lg text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors flex items-center gap-1.5 active:scale-95 shadow-sm"
                        >
                            <X className="w-3.5 h-3.5" /> Fermer
                        </button>
                    </div>
                </div>
            </div>
        );
    };
    const handlePlantationAdvance = (stId: string, currentOpId: string) => {
        const st = workstationsList.find(s => s.id === stId);
        if (!st) return;
        const currentIdx = st.operations.findIndex(op => op.id === currentOpId);
        for (let i = currentIdx + 1; i < st.operations.length; i++) {
            const nextOp = st.operations[i];
            const data = ensureRow(nextOp.id, chronoData[`${stId}__${nextOp.id}`]);
            let hasFree = false;
            for (let t = 1; t <= trCount; t++) {
                const v = data[`tr${t}` as keyof ChronoData];
                if (v === undefined || v === null) { hasFree = true; break; }
            }
            if (hasFree) {
                const key = `${stId}__${nextOp.id}`;
                setActiveRowId(key);
                setExpandedRows(prev => {
                    const next = new Set(prev);
                    next.delete(currentOpId);
                    next.add(nextOp.id);
                    return next;
                });
                return;
            }
        }
        setActiveRowId(null);
    };

    const handlePlantationPrev = (stId: string, currentOpId: string) => {
        const st = workstationsList.find(s => s.id === stId);
        if (!st) return;
        const idx = st.operations.findIndex(op => op.id === currentOpId);
        if (idx <= 0) return;
        const prevOp = st.operations[idx - 1];
        const key = `${stId}__${prevOp.id}`;
        setActiveRowId(key);
        setExpandedRows(prev => {
            const next = new Set(prev);
            next.delete(currentOpId);
            next.add(prevOp.id);
            return next;
        });
    };

    const handlePlantationNext = (stId: string, currentOpId: string) => {
        const st = workstationsList.find(s => s.id === stId);
        if (!st) return;
        const idx = st.operations.findIndex(op => op.id === currentOpId);
        if (idx < 0 || idx >= st.operations.length - 1) return;
        const nextOp = st.operations[idx + 1];
        const key = `${stId}__${nextOp.id}`;
        setActiveRowId(key);
        setExpandedRows(prev => {
            const next = new Set(prev);
            next.delete(currentOpId);
            next.add(nextOp.id);
            return next;
        });
    };

    const renderPlantationChronoPanel = (opId: string, stId: string) => {
        const op = operationsById[opId];
        if (!op) return null;
        const key = `${stId}__${opId}`;
        const data = getChronoDataForOp(op.id, stId);
        const row = recalcRow(data, unit);
        const filledTRs = trSlots.filter(n => data[`tr${n}` as keyof ChronoData] !== undefined).length;
        const rowTRs = getRowTRs(data);
        const median = getMedian(rowTRs);

        return (
            <div className="w-full mt-1.5 p-0.5 animate-in slide-in-from-top-1 duration-200">
                {/* Combined Calculations & TR inputs card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-1.5 sm:p-2 mb-1.5 flex flex-col gap-1.5 text-left">
                    {/* Top row: Calculations */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-1 flex-wrap">
                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">T.Moy:</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                className={`w-12 py-0.5 px-0.5 text-center text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200 rounded focus:border-indigo-400 outline-none ${INPUT_NO_SPIN}`}
                                placeholder="—"
                                value={row.tm !== undefined ? displayValue(row.tm) : ''}
                                onChange={e => handleCellChange(op.id, 'tm', e.target.value, stId)}
                            />
                            {row.tmManual && (
                                <span className="text-[7px] font-bold text-indigo-500 uppercase tracking-wider">manuel</span>
                            )}
                        </div>

                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Majoration:</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                className={`w-10 py-0.5 px-0.5 text-center text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200 rounded focus:border-indigo-400 outline-none ${INPUT_NO_SPIN}`}
                                value={data.majoration !== undefined ? displayValue(data.majoration) : ''}
                                onChange={e => handleCellChange(op.id, 'majoration', e.target.value, stId)}
                            />
                        </div>

                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">T.Maj:</span>
                            <span className="text-xs font-black text-emerald-600 font-mono">
                                {row.tempMajore !== undefined ? formatTempMajoreInUnit(row.tempMajore) : '—'}
                            </span>
                        </div>
                    </div>

                    {/* Bottom row: TR Inputs */}
                    {trEnabled && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 shrink-0">Relevés:</span>
                            <div className="flex gap-0.5 items-center flex-wrap">
                                {trSlots.map(trNum => {
                                    const val = data[`tr${trNum}` as keyof ChronoData];
                                    const hasVal = val !== undefined && val !== null && (val as number) > 0;
                                    const status = hasVal ? classifyTR(val as number, median) : 'normal';
                                    return (
                                        <div key={trNum} className="relative group/cell w-8 text-center">
                                            <input
                                                type="number" step="0.01" min="0"
                                                className={`w-full py-0.5 text-center text-[9px] font-mono font-bold border rounded bg-white focus:border-indigo-400 outline-none transition-all placeholder:text-slate-300 ${INPUT_NO_SPIN} ${hasVal ? trStatusStyles[status] : 'text-indigo-600 border-slate-200'}`}
                                                placeholder={`TR${trNum}`}
                                                value={hasVal && typeof val === 'number' ? displayValue(val) : ''}
                                                onChange={e => handleCellChange(op.id, `tr${trNum}` as keyof ChronoData, e.target.value, stId)}
                                            />
                                            {hasVal && (
                                                <button
                                                    type="button"
                                                    aria-label={`Supprimer TR ${trNum}`}
                                                    onClick={(e) => handleClearTRClick(e, op.id, trNum, stId)}
                                                    className="absolute -top-1 -right-1 z-10 flex h-[10px] w-[10px] items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 shadow-sm opacity-0 scale-90 transition-all duration-200 group-hover/cell:opacity-100 group-hover/cell:scale-100 hover:bg-rose-50 hover:text-rose-600"
                                                    title="Supprimer"
                                                >
                                                    <X className="w-1.5 h-1.5" />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Stopwatch Component */}
                <AdvancedStopwatch
                    key={op.id}
                    onRecord={(time) => handleStopwatchRecord(op.id, time, stId)}
                    onClear={() => clearAllTRs(op.id, stId)}
                    onAdvance={() => handlePlantationAdvance(stId, op.id)}
                    onPrev={() => handlePlantationPrev(stId, op.id)}
                    onNext={() => handlePlantationNext(stId, op.id)}
                    onUndoLast={() => clearLastTR(op.id, stId)}
                    trCount={trCount}
                    filledCount={filledTRs}
                    compact={true}
                />
            </div>
        );
    };

    const isOperationCompleted = (st: Workstation, op: Operation) => {
        const data = getChronoDataForOp(op.id, st.id);
        const filledTRs = trSlots.filter(n => data[`tr${n}` as keyof ChronoData] !== undefined).length;
        return trEnabled ? (filledTRs >= trCount) : (data.tm !== undefined);
    };

    const renderEmptyWorkstationCard = (st: Workstation) => {
        const color = st.color || POSTE_COLORS[0];
        const fill = color.fill || '#64748b';
        
        return (
            <div
                key={st.id}
                className="bg-slate-50/20 rounded-xl sm:rounded-2xl border-2 border-dashed border-slate-250 p-3 sm:p-4 flex items-center justify-between gap-3 text-left opacity-60 min-h-[96px] shadow-sm select-none"
            >
                <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
                    {/* Muted Checkbox */}
                    <div className="w-5 h-5 rounded-md border-2 border-dashed border-slate-305 bg-transparent shrink-0" />
                    
                    {/* Flow Index */}
                    <span className="bg-slate-100 text-slate-400 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 font-extrabold shrink-0">
                        #{st.index}
                    </span>

                    {/* Workstation Badge */}
                    <span className="text-white text-[10px] sm:text-xs px-2 py-0.5 rounded font-black tracking-wide shrink-0" style={{ backgroundColor: fill }}>
                        {st.name}
                    </span>

                    <span className="text-xs sm:text-sm font-medium text-slate-400 italic truncate">
                        Aucune opération
                    </span>
                </div>
                <div className="text-[9px] font-bold text-slate-400 bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200/50 uppercase tracking-wider shrink-0">
                    Poste Vide
                </div>
            </div>
        );
    };

    const renderPlantationOperationCard = (st: Workstation, op: Operation, opIdx: number, totalOps: number) => {
        const color = st.color || POSTE_COLORS[0];
        const fill = color.fill || '#64748b';
        const sat = Math.round(st.saturation || 0);
        const isCompleted = isOperationCompleted(st, op);
        const tolerance = toleranceSaturation ?? 115;
        
        const row = recalcRow(getChronoDataForOp(op.id, st.id), unit);
        const isMeasured = row.tempMajore !== undefined;
        
        let shouldShowTimeBadge = false;
        let displayTimeSec = 0;
        let timeLabel: 'TS' | 'TR' = 'TS';

        if (isMeasured) {
            if (trEnabled || !showTsColumn) {
                shouldShowTimeBadge = true;
                displayTimeSec = row.tempMajore * 60;
                timeLabel = 'TR';
            } else {
                shouldShowTimeBadge = true;
                displayTimeSec = op.time * (row.majoration || 1.15) * 60;
                timeLabel = 'TS';
            }
        } else {
            if (showTsColumn) {
                shouldShowTimeBadge = true;
                displayTimeSec = op.time * (row.majoration || 1.15) * 60;
                timeLabel = 'TS';
            } else {
                shouldShowTimeBadge = false;
            }
        }
        
        const stationMeasuredTime = st.operations.reduce((acc, o) => {
            const r = recalcRow(getChronoDataForOp(o.id, st.id), unit);
            const oMeasured = r.tempMajore !== undefined;
            
            let tInSec = 0;
            if (oMeasured) {
                if (trEnabled || !showTsColumn) {
                    tInSec = r.tempMajore * 60;
                } else {
                    tInSec = o.time * (r.majoration || 1.15) * 60;
                }
            } else {
                if (showTsColumn) {
                    tInSec = o.time * (r.majoration || 1.15) * 60;
                } else {
                    tInSec = 0;
                }
            }
            return acc + tInSec;
        }, 0);
        const parentOpsCount = (st as any).parentOperators || 1;
        const stationTimeInSeconds = Math.round(stationMeasuredTime / parentOpsCount);

        // Saturation badge & progress classes (mirroring Implantation exactly)
        let satBadgeClass = 'bg-emerald-50 text-emerald-500';
        let satProgressClass = fill; // default to color.fill (hex)
        if (sat > tolerance) {
            satBadgeClass = 'bg-rose-100 text-rose-700 border border-rose-200';
            satProgressClass = 'bg-rose-500 animate-pulse';
        } else if (sat >= 100) {
            satBadgeClass = 'bg-amber-100 text-amber-700 border border-amber-200';
            satProgressClass = 'bg-amber-500';
        } else if (sat < 50) {
            satBadgeClass = 'bg-slate-100 text-slate-500 border border-slate-200';
            satProgressClass = 'bg-slate-400';
        }

        const isOpActive = trEnabled && `${st.id}__${op.id}` === activeRowId;

        return (
            <div
                key={`${st.id}__${op.id}`}
                onClick={() => {
                    if (!trEnabled) return;
                    const key = `${st.id}__${op.id}`;
                    setActiveRowId(activeRowId === key ? null : key);
                    setExpandedRows(prev => {
                        const next = new Set(prev);
                        if (activeRowId === key) next.delete(op.id); else next.add(op.id);
                        return next;
                    });
                }}
                className={`bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm transition-all p-3 sm:p-4 relative flex flex-col gap-2 sm:gap-3 border-l-[4px] sm:border-l-[6px] text-left ${
                    trEnabled ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
                } ${isOpActive ? 'ring-2 ring-indigo-500 shadow-md font-extrabold' : ''}`}
                style={{ borderLeftColor: fill }}
            >
                {/* Card Header */}
                <div className="flex items-center justify-between gap-2 pb-2 sm:pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 sm:gap-2.5 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
                        {/* Checkbox */}
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${isCompleted ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-slate-300 bg-white'}`}>
                            {isCompleted && (
                                <svg className="w-3.5 h-3.5 stroke-current stroke-[3]" fill="none" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </div>

                        {/* Photo preview before the post name/number */}
                        {op.photo && (
                            <img
                                src={op.photo}
                                className="w-8 h-8 sm:w-9 sm:h-9 object-cover rounded-lg border border-slate-200 shadow-sm shrink-0"
                                alt="Op"
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}

                        {/* Flow Index (e.g. #1) - Using st.index to be unique for each worker and matches Implantation */}
                        <span className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 font-extrabold shrink-0" title="Ordre dans le flux">
                            #{st.index}
                        </span>

                        {/* Workstation Badge (Post name like P1 or 2.1) */}
                        <span className="text-white text-[10px] sm:text-xs px-2 py-0.5 rounded font-black tracking-wide shrink-0" style={{ backgroundColor: fill }}>
                            {st.name}
                        </span>

                        {/* Operation description and Station/Machine details */}
                        <div className="flex flex-col text-left min-w-0 flex-1">
                            <span className="text-xs sm:text-sm font-black text-slate-800 leading-tight truncate sm:whitespace-normal" title={op.description}>
                                {op.description}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] font-semibold text-slate-400">
                                    M: {st.machine}
                                </span>
                                {totalOps > 1 && (
                                    <span className="text-[9px] font-bold uppercase text-indigo-650 bg-indigo-50 border border-indigo-100 px-1 py-0.2 rounded leading-none shrink-0">
                                        Op {opIdx + 1}/{totalOps}
                                    </span>
                                )}
                            </div>

                            {/* Affectation de l'opérateur (identique au mode "Nouveau") */}
                            <div className="flex items-center gap-1.5 w-full sm:w-auto mt-1.5" onClick={e => e.stopPropagation()}>
                                <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0">
                                    Opé:
                                </span>
                                <div className="relative flex-1 sm:flex-none sm:w-56">
                                    <input
                                        type="text"
                                        value={plantationOperators[`${st.id}__${op.id}`] ?? st.operatorName ?? ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setOperatorFilter(val);
                                            setPlantationOperators(prev => ({ ...prev, [`${st.id}__${op.id}`]: val }));
                                        }}
                                        onFocus={(e) => {
                                            setActiveOperatorStationId(`${st.id}__${op.id}`);
                                            setOperatorFilter(e.target.value);
                                        }}
                                        onBlur={() => {
                                            setTimeout(() => {
                                                setActiveOperatorStationId(null);
                                            }, 250);
                                        }}
                                        placeholder="Nom / Matricule..."
                                        className="bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:bg-white rounded px-2 py-1 sm:py-0.5 outline-none w-full text-[11px] sm:text-xs font-black text-slate-700 placeholder-slate-400 transition-all shadow-sm"
                                    />

                                    {/* Liste des effectifs : ancrée juste sous le champ "Opé" */}
                                    {activeOperatorStationId === `${st.id}__${op.id}` && (
                                        <div
                                            onClick={e => e.stopPropagation()}
                                            className="absolute z-[200] left-0 top-full mt-1.5 w-full sm:w-72 max-h-60 sm:max-h-72 overflow-y-auto bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl shadow-xl divide-y divide-slate-100 p-1.5"
                                        >
                                            <div className="px-3 py-2 bg-slate-50/80 rounded-t-lg text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-100 flex items-center justify-between">
                                                <span>Membres d'Effectifs Disponibles</span>
                                                <span className="text-[8px] bg-slate-200/60 text-slate-500 px-1 py-0.2 rounded font-mono">
                                                    {workerSuggestions.length} dispo
                                                </span>
                                            </div>
                                            {activeWorkers.length === 0 ? (
                                                <div className="px-4 py-4 text-center text-xs text-slate-450 font-semibold">
                                                    Chargement des effectifs...
                                                </div>
                                            ) : workerSuggestions.length === 0 ? (
                                                <div className="px-4 py-4 text-center text-xs text-slate-450 font-semibold">
                                                    Aucun membre disponible
                                                </div>
                                            ) : (
                                                workerSuggestions.map(w => (
                                                    <button
                                                        key={w.id}
                                                        type="button"
                                                        onMouseDown={e => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                        }}
                                                        onClick={() => {
                                                            setPlantationOperators(prev => ({ ...prev, [`${st.id}__${op.id}`]: w.full_name }));
                                                            setActiveOperatorStationId(null);
                                                        }}
                                                        className="w-full text-left px-3 py-2.5 hover:bg-slate-50 active:bg-slate-100/70 transition-colors flex items-center justify-between gap-2"
                                                    >
                                                        <div className="flex flex-col gap-0.5 min-w-0">
                                                            <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">{w.full_name}</span>
                                                            <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400 truncate">
                                                                Matricule: {w.matricule}
                                                            </span>
                                                        </div>
                                                        {w.role && (
                                                            <span className="text-[8px] sm:text-[9px] font-bold text-indigo-650 bg-indigo-50 border border-indigo-100/30 px-1.5 py-0.5 rounded-lg shrink-0 uppercase tracking-wider">
                                                                {w.role}
                                                            </span>
                                                        )}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Time */}
                    {shouldShowTimeBadge && (
                        <div className="flex items-center gap-1 shrink-0 self-start sm:self-center">
                            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400">
                                {timeLabel}
                            </span>
                            <span className="font-mono font-black text-indigo-700 text-[11px] sm:text-xs bg-indigo-50 border border-indigo-100/50 px-1.5 sm:px-2 py-0.5 rounded-lg shrink-0">
                                {Math.round(displayTimeSec)}s
                            </span>
                        </div>
                    )}
                </div>

                {/* Timing panel nested inside the active operation */}
                {isOpActive && trEnabled && (
                    <div onClick={(e) => e.stopPropagation()} className="cursor-default">
                        {renderPlantationChronoPanel(op.id, st.id)}
                    </div>
                )}

                {/* Footer: Station total time & sat indicator */}
                <div className="flex items-center justify-between mt-auto pt-1.5 border-t border-slate-100">
                    {stationTimeInSeconds > 0 ? (
                        <div className="flex flex-col">
                            <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Total Poste</span>
                            <span className={`text-sm font-bold ${color.text}`}>{stationTimeInSeconds}s</span>
                        </div>
                    ) : (
                        <div />
                    )}
                    <div className="flex flex-col items-end">
                        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Sat. Poste</span>
                        <div className="flex items-center gap-1">
                            {st.operators > 1 && <span className="text-[9px] font-black px-1 rounded bg-amber-100 text-amber-700">x{st.operators}</span>}
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${satBadgeClass}`}>{sat}%</span>
                        </div>
                    </div>
                </div>

                {/* Bottom saturation progress bar */}
                <div className="absolute bottom-0 left-0 h-1 bg-slate-200 w-full">
                    <div 
                        className={`h-full transition-all ${!satProgressClass.startsWith('#') ? satProgressClass : ''}`} 
                        style={{ 
                            width: `${Math.min(sat, 100)}%`, 
                            backgroundColor: satProgressClass.startsWith('#') ? satProgressClass : undefined 
                        }}
                    ></div>
                </div>
            </div>
        );
    };

    const handleCellChange = (opId: string, field: keyof ChronoData, value: string, stId?: string) => {
        const key = stId ? `${stId}__${opId}` : opId;
        if (field === 'tm') {
            if (value === '') {
                setChronoData(prev => {
                    const current = ensureRow(opId, prev[key]);
                    return { ...prev, [key]: recalcRow({ ...current, tm: undefined, tmManual: false }) };
                });
                return;
            }
            const num = parseFloat(value);
            if (isNaN(num) || num < 0) return;
            setChronoData(prev => {
                const current = ensureRow(opId, prev[key]);
                return { ...prev, [key]: recalcRow({ ...current, tm: roundValue(num), tmManual: true }) };
            });
            return;
        }

        if (value === '') {
            setChronoData(prev => {
                const current = ensureRow(opId, prev[key]);
                let next: ChronoData = { ...current, [field]: undefined };
                if (String(field).match(/^tr\d+/)) next = { ...next, tmManual: false };
                return { ...prev, [key]: recalcRow(next) };
            });
            return;
        }
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) return;
        setChronoData(prev => {
            const current = ensureRow(opId, prev[key]);
            let next: ChronoData = { ...current, [field]: roundValue(num) };
            if (String(field).match(/^tr\d+/)) next = { ...next, tmManual: false };
            return { ...prev, [key]: recalcRow(next) };
        });
    };

    const getRowTRs = (data: ChronoData): number[] => {
        const trs: number[] = [];
        for (let i = 1; i <= trCount; i++) {
            const v = data[`tr${i}` as keyof ChronoData];
            if (v !== undefined && v !== null && !isNaN(v as number) && (v as number) > 0) trs.push(v as number);
        }
        return trs;
    };

    const getMedian = (arr: number[]): number => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    type TRStatus = 'normal' | 'slow' | 'fast' | 'outlier';
    const classifyTR = (val: number, median: number): TRStatus => {
        if (median === 0) return 'normal';
        const ratio = val / median;
        if (ratio > 1.5 || ratio < 0.5) return 'outlier';
        if (ratio > 1.15) return 'slow';
        if (ratio < 0.85) return 'fast';
        return 'normal';
    };

    const trStatusStyles: Record<TRStatus, string> = {
        normal: '',
        slow: 'bg-rose-50 text-rose-700 border-rose-200',
        fast: 'bg-rose-50 text-rose-700 border-rose-200',
        outlier: 'bg-rose-100 text-rose-800 border-rose-300 ring-1 ring-rose-200',
    };

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!unitMenuRef.current?.contains(e.target as Node)) setShowUnitMenu(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    useEffect(() => {
        const sourceUnit = previousUnitRef.current;
        if (sourceUnit === unit) return;

        setChronoData(prev => {
            const nextData: Record<string, ChronoData> = {};
            Object.entries(prev).forEach(([key, row]) => {
                const converted: ChronoData = { ...row };
                for (let i = 1; i <= 10; i++) {
                    const trKey = `tr${i}` as keyof ChronoData;
                    const val = converted[trKey];
                    if (val !== undefined && val !== null && !isNaN(val as number)) {
                        (converted as unknown as Record<string, number | undefined>)[`tr${i}`] = convertUnitValue(val as number, sourceUnit, unit);
                    }
                }
                if (converted.tm !== undefined && converted.tm !== null && !isNaN(converted.tm)) {
                    converted.tm = convertUnitValue(converted.tm, sourceUnit, unit);
                }
                nextData[key] = recalcRow(converted, unit);
            });
            return nextData;
        });

        previousUnitRef.current = unit;
    }, [unit, setChronoData, trCount, presenceTime]);

    useEffect(() => {
        if (trEnabled) return;
        setChronoData(prev => {
            const nextData: Record<string, ChronoData> = {};
            Object.entries(prev).forEach(([key, row]) => {
                const recalculated = recalcRow(row, unit);
                nextData[key] = {
                    ...recalculated,
                    tm: recalculated.tm,
                    tmManual: recalculated.tm !== undefined
                };
            });
            return nextData;
        });
    }, [trEnabled]);

    useEffect(() => {
        setChronoData(prev => {
            const nextData: Record<string, ChronoData> = {};
            Object.entries(prev).forEach(([key, row]) => {
                nextData[key] = recalcRow(row, unit);
            });
            return nextData;
        });
    }, [efficiency, setChronoData]);

    /** Returns the number of filled TR slots for an operation. */
    const countFilledTRs = useCallback((opId: string, stId?: string): number => {
        const data = getChronoDataForOp(opId, stId);
        let count = 0;
        for (let i = 1; i <= trCount; i++) {
            const val = data[`tr${i}` as keyof ChronoData];
            if (val !== undefined && val !== null) count++;
        }
        return count;
    }, [getChronoDataForOp, trCount]);

    const handleStopwatchRecord = useCallback((opId: string, timeInSeconds: number, stId?: string) => {
        const data = getChronoDataForOp(opId, stId);
        for (let i = 1; i <= trCount; i++) {
            const trKey = `tr${i}` as keyof ChronoData;
            if (data[trKey] === undefined || data[trKey] === null) {
                const value = fromSeconds(timeInSeconds, unit);
                handleCellChange(opId, trKey, value.toString(), stId);
                return;
            }
        }
    }, [getChronoDataForOp, trCount, unit, handleCellChange]);

    /** Clears ALL TR slots for a given operation */
    const clearAllTRs = useCallback((opId: string, stId?: string) => {
        for (let i = 1; i <= trCount; i++) {
            handleCellChange(opId, `tr${i}` as keyof ChronoData, '', stId);
        }
    }, [trCount, handleCellChange]);

    const clearTR = (opId: string, trNum: number, stId?: string) => {
        handleCellChange(opId, `tr${trNum}` as keyof ChronoData, '', stId);
    };

    /** Removes the most recent TR entry for an operation row (Undo) */
    const clearLastTR = useCallback((opId: string, stId?: string) => {
        const data = getChronoDataForOp(opId, stId);
        for (let i = trCount; i >= 1; i--) {
            const trKey = `tr${i}` as keyof ChronoData;
            if (data[trKey] !== undefined && data[trKey] !== null) {
                handleCellChange(opId, trKey, '', stId);
                return;
            }
        }
    }, [getChronoDataForOp, trCount, handleCellChange]);

    /** Computes CV-based validity for a row */
    const getRowValidity = useCallback((opId: string, stId?: string): 'valid' | 'warn' | 'invalid' | 'empty' => {
        const data = getChronoDataForOp(opId, stId);
        const vals: number[] = [];
        for (let i = 1; i <= trCount; i++) {
            const v = data[`tr${i}` as keyof ChronoData];
            if (v !== undefined && v !== null && !isNaN(v as number) && (v as number) > 0) vals.push(v as number);
        }
        if (vals.length < 2) return 'empty';
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (mean <= 0) return 'empty';
        const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
        const cv = (Math.sqrt(Math.max(0, variance)) / mean) * 100;
        
        if (cv < 10) return 'valid';
        if (cv < 15) return 'warn';
        return 'invalid';
    }, [getChronoDataForOp, trCount]);

    const handleClearTRClick = (e: React.MouseEvent<HTMLButtonElement>, opId: string, trNum: number, stId?: string) => {
        e.preventDefault();
        e.stopPropagation();
        clearTR(opId, trNum, stId);
    };

    const toggleRowExpand = useCallback((opId: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(opId)) next.delete(opId); else next.add(opId);
            return next;
        });
    }, []);

    /** Advance: close current op, open next one that has unfilled TRs */
    const advanceToNextOp = useCallback((currentOpId: string) => {
        const currentIdx = filteredOperations.findIndex(op => op.id === currentOpId);
        for (let i = currentIdx + 1; i < filteredOperations.length; i++) {
            const nextOp = filteredOperations[i];
            const data = getChronoDataForOp(nextOp.id);
            let hasFree = false;
            for (let t = 1; t <= trCount; t++) {
                const v = data[`tr${t}` as keyof ChronoData];
                if (v === undefined || v === null) { hasFree = true; break; }
            }
            if (hasFree) {
                setExpandedRows(prev => {
                    const next = new Set(prev);
                    next.delete(currentOpId);
                    next.add(nextOp.id);
                    return next;
                });
                return;
            }
        }
        setExpandedRows(prev => { const n = new Set(prev); n.delete(currentOpId); return n; });
    }, [filteredOperations, getChronoDataForOp, trCount]);

    /** Go to the immediately previous operation (simple, no TR-check) */
    const goToPrevOp = useCallback((currentOpId: string) => {
        const idx = filteredOperations.findIndex(op => op.id === currentOpId);
        if (idx <= 0) return;
        const prevOp = filteredOperations[idx - 1];
        setExpandedRows(prev => {
            const next = new Set(prev);
            next.delete(currentOpId);
            next.add(prevOp.id);
            return next;
        });
    }, [filteredOperations]);

    /** Go to the immediately next operation (simple, no TR-check) */
    const goToNextOp = useCallback((currentOpId: string) => {
        const idx = filteredOperations.findIndex(op => op.id === currentOpId);
        if (idx < 0 || idx >= filteredOperations.length - 1) return;
        const nextOp = filteredOperations[idx + 1];
        setExpandedRows(prev => {
            const next = new Set(prev);
            next.delete(currentOpId);
            next.add(nextOp.id);
            return next;
        });
    }, [filteredOperations]);


    // duplicate totals and column vars removed (moved up)

    /** Temps standard gamme : `op.time` est en minutes → affichage TS en secondes. */
    const formatTsSeconds = (minutesVal: number | undefined) =>
        roundValue((minutesVal ?? 0) * 60).toFixed(2);
    const totalTsSeconds = roundValue(
        operations.reduce((acc, op) => acc + (op.time || 0), 0) * 60
    );

    const formatVal = (v: number | undefined) => {
        if (v === undefined) return '—';
        return v.toFixed(2);
    };
    const formatTempMajoreInUnit = (valueInMinutes: number | undefined) => {
        if (valueInMinutes === undefined) return '—';
        return fromSeconds(valueInMinutes * 60, unit).toFixed(2);
    };
    const formatProductionCell = (value: number | undefined, mode: OutputMode) => {
        if (value === undefined || value <= 0) return '—';
        if (mode === 'PJ') return String(value);
        const presenceHoursForRate = presenceTime / 60;
        if (presenceHoursForRate <= 0) return '—';
        const piecesPerHour = value / presenceHoursForRate;
        return piecesPerHour.toFixed(2);
    };

    const footerPMaxTitle =
        outputMode === 'PJ'
            ? `Total ligne : goulot — min des P° max par opération (pièces / jour), présence ${presenceTime.toFixed(0)} min`
            : `Total ligne : goulot — min des P° max par opération (pièces / heure), présence ${presenceTime.toFixed(0)} min`;
    const footerPRdtTitle =
        outputMode === 'PJ'
            ? `Total ligne : capacité avec rendement ${clampedEfficiency}% (pièces / jour) — même goulot que P° max × rendement`
            : `Total ligne : capacité avec rendement ${clampedEfficiency}% (pièces / heure) — même goulot que P° max × rendement`;

    const isCustomStationCompleted = (stationId: string) => {
        const data = getChronoDataForOp(stationId);
        const filledTRs = trSlots.filter(n => data[`tr${n}` as keyof ChronoData] !== undefined).length;
        return trEnabled ? (filledTRs >= trCount) : (data.tm !== undefined);
    };

    const renderAddCustomStationCard = (side: 'left' | 'right') => {
        return (
            <button
                type="button"
                onClick={() => {
                    const id = `CS-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
                    const leftCount = chronoCustomStations.filter(s => s.side === 'left').length;
                    const rightCount = chronoCustomStations.filter(s => s.side === 'right').length;
                    const name = side === 'left' ? `P${leftCount * 2 + 1}` : `P${rightCount * 2 + 2}`;
                    const newStation: CustomStation = {
                        id,
                        name,
                        machine: '',
                        side,
                        operatorName: '',
                        description: ''
                    };
                    setChronoCustomStations?.(prev => [...prev, newStation]);
                }}
                className="w-full bg-slate-50/20 hover:bg-slate-100/40 rounded-xl sm:rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 py-6 px-4 flex items-center justify-center gap-2 text-center opacity-70 text-slate-400 hover:text-indigo-650 transition-all min-h-[96px] shadow-sm select-none"
            >
                <Plus className="w-5 h-5 shrink-0 text-slate-400 group-hover:text-indigo-650" />
                <span className="text-xs sm:text-sm font-black uppercase tracking-wide">Ajouter un poste {side === 'left' ? 'Gauche' : 'Droit'}</span>
            </button>
        );
    };

    const renderCustomChronoPanel = (stationId: string) => {
        const data = getChronoDataForOp(stationId);
        const row = recalcRow(data, unit);
        const filledTRs = trSlots.filter(n => data[`tr${n}` as keyof ChronoData] !== undefined).length;
        const rowTRs = getRowTRs(data);
        const median = getMedian(rowTRs);

        return (
            <div className="w-full mt-1.5 p-0.5 animate-in slide-in-from-top-1 duration-200">
                {/* Combined Calculations & TR inputs card */}
                <div className="bg-slate-50 border border-slate-250 rounded-xl p-1.5 sm:p-2 mb-1.5 flex flex-col gap-1.5 text-left">
                    {/* Top row: Calculations */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-1 flex-wrap">
                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">T.Moy:</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                className={`w-12 py-0.5 px-0.5 text-center text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200 rounded focus:border-indigo-400 outline-none ${INPUT_NO_SPIN}`}
                                placeholder="—"
                                value={row.tm !== undefined ? displayValue(row.tm) : ''}
                                onChange={e => handleCellChange(stationId, 'tm', e.target.value)}
                            />
                            {row.tmManual && (
                                <span className="text-[7px] font-bold text-indigo-500 uppercase tracking-wider">manuel</span>
                            )}
                        </div>

                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Majoration:</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                className={`w-10 py-0.5 px-0.5 text-center text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200 rounded focus:border-indigo-400 outline-none ${INPUT_NO_SPIN}`}
                                value={data.majoration !== undefined ? displayValue(data.majoration) : ''}
                                onChange={e => handleCellChange(stationId, 'majoration', e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">T.Maj:</span>
                            <span className="text-xs font-black text-emerald-600 font-mono">
                                {row.tempMajore !== undefined ? formatTempMajoreInUnit(row.tempMajore) : '—'}
                            </span>
                        </div>
                    </div>

                    {/* Bottom row: TR Inputs */}
                    {trEnabled && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 shrink-0">Relevés:</span>
                            <div className="flex gap-0.5 items-center flex-wrap">
                                {trSlots.map(trNum => {
                                    const val = data[`tr${trNum}` as keyof ChronoData];
                                    const hasVal = val !== undefined && val !== null && (val as number) > 0;
                                    const status = hasVal ? classifyTR(val as number, median) : 'normal';
                                    return (
                                        <div key={trNum} className="relative group/cell w-8 text-center">
                                            <input
                                                type="number" step="0.01" min="0"
                                                className={`w-full py-0.5 text-center text-[9px] font-mono font-bold border rounded bg-white focus:border-indigo-400 outline-none transition-all placeholder:text-slate-300 ${INPUT_NO_SPIN} ${hasVal ? trStatusStyles[status] : 'text-indigo-600 border-slate-200'}`}
                                                placeholder={`TR${trNum}`}
                                                value={hasVal && typeof val === 'number' ? displayValue(val) : ''}
                                                onChange={e => handleCellChange(stationId, `tr${trNum}` as keyof ChronoData, e.target.value)}
                                            />
                                            {hasVal && (
                                                <button
                                                    type="button"
                                                    aria-label={`Supprimer TR ${trNum}`}
                                                    onClick={(e) => handleClearTRClick(e, stationId, trNum)}
                                                    className="absolute -top-1 -right-1 z-10 flex h-[10px] w-[10px] items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 shadow-sm opacity-0 scale-90 transition-all duration-200 group-hover/cell:opacity-100 group-hover/cell:scale-100 hover:bg-rose-50 hover:text-rose-600"
                                                    title="Supprimer"
                                                >
                                                    <X className="w-1.5 h-1.5" />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Stopwatch Component */}
                <AdvancedStopwatch
                    key={stationId}
                    onRecord={(time) => handleStopwatchRecord(stationId, time)}
                    onClear={() => clearAllTRs(stationId)}
                    onAdvance={() => handleCustomAdvance(stationId)}
                    onPrev={() => handleCustomPrev(stationId)}
                    onNext={() => handleCustomNext(stationId)}
                    onUndoLast={() => clearLastTR(stationId)}
                    trCount={trCount}
                    filledCount={filledTRs}
                    compact={true}
                />
            </div>
        );
    };

    const renderCustomStationCard = (station: CustomStation, flowNum: number) => {
        const linkedOp = station.linkedOperationId ? operations.find(o => o.id === station.linkedOperationId) : undefined;
        
        // Find corresponding workstation color from implantation if linked
        let color = getPosteColor(flowNum, station.machine || 'VIDE');
        let opIdx = 0;
        let totalOps = 0;
        
        if (linkedOp) {
            const assignedPosteIds = assignments?.[linkedOp.id] || [];
            if (assignedPosteIds.length > 0) {
                const foundPoste = postes?.find(p => p.id === assignedPosteIds[0]);
                if (foundPoste) {
                    const sortedPostes = [...(postes || [])].sort((a, b) => {
                        const getMinOrder = (p: Poste) => {
                            const assigned = operations.filter(op => assignments[op.id]?.includes(p.id));
                            return assigned.length > 0 ? Math.min(...assigned.map(o => o.order)) : 9999;
                        };
                        return getMinOrder(a) - getMinOrder(b);
                    });
                    const realIndex = sortedPostes.findIndex(p => p.id === foundPoste.id);
                    const effectiveIndex = realIndex >= 0 ? realIndex : flowNum;
                    color = getPosteColor(effectiveIndex, foundPoste.machine, foundPoste.colorName);
                    
                    const stOps = operations.filter(op => assignments[op.id]?.includes(foundPoste.id));
                    totalOps = stOps.length;
                    opIdx = stOps.findIndex(op => op.id === linkedOp.id);
                }
            }
        }

        const fill = color.fill || '#64748b';
        const isCompleted = isCustomStationCompleted(station.id);
        const isOpActive = trEnabled && station.id === activeRowId;

        const data = getChronoDataForOp(station.id);
        const row = recalcRow(data, unit);
        const isMeasured = row.tempMajore !== undefined;

        let shouldShowTimeBadge = false;
        let displayTimeSec = 0;
        let timeLabel: 'TS' | 'TR' = 'TS';

        if (isMeasured) {
            if (trEnabled || !showTsColumn) {
                shouldShowTimeBadge = true;
                displayTimeSec = row.tempMajore * 60;
                timeLabel = 'TR';
            } else if (linkedOp) {
                shouldShowTimeBadge = true;
                displayTimeSec = linkedOp.time * (row.majoration || 1.15) * 60;
                timeLabel = 'TS';
            }
        } else if (linkedOp && showTsColumn) {
            shouldShowTimeBadge = true;
            displayTimeSec = linkedOp.time * (row.majoration || 1.15) * 60;
            timeLabel = 'TS';
        }

        // Station measured time & saturation calculations
        let stationTimeInSeconds = 0;
        if (isMeasured) {
            if (trEnabled || !showTsColumn) {
                stationTimeInSeconds = Math.round(row.tempMajore * 60);
            } else if (linkedOp) {
                stationTimeInSeconds = Math.round(linkedOp.time * (row.majoration || 1.15) * 60);
            }
        } else if (linkedOp && showTsColumn) {
            stationTimeInSeconds = Math.round(linkedOp.time * (row.majoration || 1.15) * 60);
        }

        const activeBf = hasChronoCycle ? chronoBfMinutes : bf;
        const sat = Math.round(activeBf > 0 ? (stationTimeInSeconds / (activeBf * 60)) * 100 : 0);
        const tolerance = toleranceSaturation ?? 115;

        let satBadgeClass = 'bg-emerald-50 text-emerald-500';
        let satProgressClass = fill;
        let colorText = 'text-slate-755';
        if (sat > tolerance) {
            satBadgeClass = 'bg-rose-100 text-rose-700 border border-rose-200';
            satProgressClass = 'bg-rose-500 animate-pulse';
            colorText = 'text-rose-600';
        } else if (sat >= 100) {
            satBadgeClass = 'bg-amber-100 text-amber-700 border border-amber-200';
            satProgressClass = 'bg-amber-500';
            colorText = 'text-amber-600';
        } else if (sat < 50) {
            satBadgeClass = 'bg-slate-100 text-slate-500 border border-slate-200';
            satProgressClass = 'bg-slate-400';
            colorText = 'text-slate-500';
        }

        return (
            <div
                key={station.id}
                onClick={() => {
                    if (!trEnabled) return;
                    setActiveRowId(activeRowId === station.id ? null : station.id);
                }}
                className={`bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm transition-all p-2.5 sm:p-4 relative flex flex-col gap-1.5 sm:gap-3 border-l-[4px] sm:border-l-[6px] text-left ${
                    trEnabled ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
                } ${isOpActive ? 'ring-2 ring-indigo-500 shadow-md font-extrabold' : ''}`}
                style={{ borderLeftColor: fill }}
            >
                {/* Card Header */}
                <div className="flex items-start sm:items-center justify-between gap-1.5 sm:gap-2 pb-1.5 sm:pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-1 sm:gap-2.5 min-w-0 flex-1 flex-wrap">
                        {/* Checkbox */}
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${isCompleted ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-slate-300 bg-white'}`}>
                            {isCompleted && (
                                <svg className="w-3.5 h-3.5 stroke-current stroke-[3]" fill="none" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </div>

                        {/* Flow Index */}
                        <span className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 font-extrabold shrink-0" title="Ordre dans le flux">
                            #{flowNum}
                        </span>

                        {/* Workstation Badge */}
                        <input
                            type="text"
                            value={station.name || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                setChronoCustomStations?.(prev =>
                                    prev.map(s => s.id === station.id ? { ...s, name: val } : s)
                                );
                            }}
                            onClick={e => e.stopPropagation()}
                            className="text-white text-[9px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded font-black tracking-wide shrink-0 w-10 sm:w-12 text-center border-none outline-none focus:ring-1 focus:ring-white/50"
                            style={{ backgroundColor: fill }}
                            placeholder="Nom"
                        />

                        {/* Operation description and Station/Machine details */}
                        <div className="flex flex-col text-left min-w-0 flex-1" onClick={e => e.stopPropagation()}>
                            <div className="relative w-full">
                                <input
                                    type="text"
                                    value={station.description || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setSuggestionFilter(val);
                                        const exactOp = operations.find(op => op.description.toLowerCase() === val.toLowerCase());
                                        setChronoCustomStations?.(prev =>
                                            prev.map(s => s.id === station.id ? {
                                                ...s,
                                                description: val,
                                                linkedOperationId: exactOp ? exactOp.id : s.linkedOperationId
                                            } : s)
                                        );
                                    }}
                                    onFocus={(e) => {
                                        setActiveSuggestionStationId(station.id);
                                        setSuggestionFilter(e.target.value);
                                    }}
                                    onBlur={() => {
                                        setTimeout(() => {
                                            setActiveSuggestionStationId(null);
                                        }, 250);
                                    }}
                                    className="text-[11px] sm:text-sm font-black text-slate-800 bg-transparent border-b border-dashed border-slate-200 hover:border-slate-350 focus:border-indigo-500 outline-none w-full placeholder-slate-400 py-0.5"
                                    placeholder="Opération / Desc..."
                                />

                                {/* Suggestions d'opérations : ancrées juste sous le champ "Opération / Desc" */}
                                {activeSuggestionStationId === station.id && suggestions.length > 0 && (
                                    <div className="absolute z-[150] left-0 top-full mt-1.5 w-full sm:w-80 max-h-56 sm:max-h-72 overflow-y-auto bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl shadow-xl divide-y divide-slate-100 p-1.5">
                                        {suggestions.map(op => (
                                            <button
                                                key={op.id}
                                                type="button"
                                                onMouseDown={e => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                }}
                                                onClick={() => {
                                                    fillCustomStationFromOperation(station.id, op);
                                                    setActiveSuggestionStationId(null);
                                                }}
                                                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 active:bg-slate-100/70 transition-colors flex flex-col gap-0.5"
                                            >
                                                <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">{op.description}</span>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400">Machine: {op.machineId || '—'}</span>
                                                    <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400">Temps: {op.time} min</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-3 mt-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                                        M:
                                    </span>
                                    <input
                                        type="text"
                                        value={station.machine || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setChronoCustomStations?.(prev =>
                                                prev.map(s => s.id === station.id ? { ...s, machine: val } : s)
                                            );
                                        }}
                                        placeholder="—"
                                        className="bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:bg-white rounded px-1.5 py-0.5 outline-none w-14 text-[11px] sm:text-xs font-black text-slate-700 placeholder-slate-400 text-center transition-all shadow-sm"
                                    />
                                </div>

                                <div className="flex items-center gap-1.5 w-full sm:w-auto" onClick={e => e.stopPropagation()}>
                                    <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0">
                                        Opé:
                                    </span>
                                    <div className="relative flex-1 sm:flex-none sm:w-56">
                                        <input
                                            type="text"
                                            value={station.operatorName || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setOperatorFilter(val);
                                                setChronoCustomStations?.(prev =>
                                                    prev.map(s => s.id === station.id ? { ...s, operatorName: val } : s)
                                                );
                                            }}
                                            onFocus={(e) => {
                                                setActiveOperatorStationId(station.id);
                                                setOperatorFilter(e.target.value);
                                            }}
                                            onBlur={() => {
                                                setTimeout(() => {
                                                    setActiveOperatorStationId(null);
                                                }, 250);
                                            }}
                                            placeholder="Nom / Matricule..."
                                            className="bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:bg-white rounded px-2 py-1 sm:py-0.5 outline-none w-full text-[11px] sm:text-xs font-black text-slate-700 placeholder-slate-400 transition-all shadow-sm"
                                        />

                                        {/* Liste des effectifs : ancrée juste sous le champ "Opé" */}
                                        {activeOperatorStationId === station.id && (
                                            <div
                                                onClick={e => e.stopPropagation()}
                                                className="absolute z-[200] left-0 top-full mt-1.5 w-full sm:w-72 max-h-60 sm:max-h-72 overflow-y-auto bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl shadow-xl divide-y divide-slate-100 p-1.5"
                                            >
                                                <div className="px-3 py-2 bg-slate-50/80 rounded-t-lg text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-100 flex items-center justify-between">
                                                    <span>Membres d'Effectifs Disponibles</span>
                                                    <span className="text-[8px] bg-slate-200/60 text-slate-500 px-1 py-0.2 rounded font-mono">
                                                        {workerSuggestions.length} dispo
                                                    </span>
                                                </div>
                                                {activeWorkers.length === 0 ? (
                                                    <div className="px-4 py-4 text-center text-xs text-slate-450 font-semibold">
                                                        Chargement des effectifs...
                                                    </div>
                                                ) : workerSuggestions.length === 0 ? (
                                                    <div className="px-4 py-4 text-center text-xs text-slate-450 font-semibold">
                                                        Aucun membre disponible
                                                    </div>
                                                ) : (
                                                    workerSuggestions.map(w => (
                                                        <button
                                                            key={w.id}
                                                            type="button"
                                                            onMouseDown={e => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                            }}
                                                            onClick={() => {
                                                                setChronoCustomStations?.(prev =>
                                                                    prev.map(s => s.id === station.id ? { ...s, operatorName: w.full_name } : s)
                                                                );
                                                                setActiveOperatorStationId(null);
                                                            }}
                                                            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 active:bg-slate-100/70 transition-colors flex items-center justify-between gap-2"
                                                        >
                                                            <div className="flex flex-col gap-0.5 min-w-0">
                                                                <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">{w.full_name}</span>
                                                                <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400 truncate">
                                                                    Matricule: {w.matricule}
                                                                </span>
                                                            </div>
                                                            {w.role && (
                                                                <span className="text-[8px] sm:text-[9px] font-bold text-indigo-650 bg-indigo-50 border border-indigo-100/30 px-1.5 py-0.5 rounded-lg shrink-0 uppercase tracking-wider">
                                                                    {w.role}
                                                                </span>
                                                            )}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {totalOps > 1 && (
                                    <span className="text-[9px] font-bold uppercase text-indigo-650 bg-indigo-50 border border-indigo-100 px-1 py-0.2 rounded leading-none shrink-0">
                                        Op {opIdx + 1}/{totalOps}
                                    </span>
                                )}
                                {linkedOp && (
                                    <span className="text-[9px] font-bold uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 px-1 py-0.2 rounded leading-none shrink-0" title="Lié à l'opération de la Gamme">
                                        Gamme Op #{linkedOp.order}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                        {/* Time */}
                        {shouldShowTimeBadge && (
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] sm:text-[10px] font-bold text-slate-400">
                                    {timeLabel}
                                </span>
                                <span className="font-mono font-black text-indigo-700 text-[11px] sm:text-xs bg-indigo-50 border border-indigo-100/50 px-1.5 sm:px-2 py-0.5 rounded-lg shrink-0">
                                    {Math.round(displayTimeSec)}s
                                </span>
                            </div>
                        )}
                        {/* Delete Button */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Voulez-vous vraiment supprimer ce poste ?")) {
                                    deleteCustomStation(station.id);
                                }
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                            title="Supprimer ce poste"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Timing panel nested inside the active operation */}
                {isOpActive && trEnabled && (
                    <div onClick={(e) => e.stopPropagation()} className="cursor-default">
                        {renderCustomChronoPanel(station.id)}
                    </div>
                )}

                {/* Footer: Station total time & sat indicator */}
                <div className="flex items-center justify-between mt-auto pt-1.5 border-t border-slate-100">
                    {stationTimeInSeconds > 0 ? (
                        <div className="flex flex-col">
                            <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Total Poste</span>
                            <span className={`text-sm font-bold ${colorText}`}>{stationTimeInSeconds}s</span>
                        </div>
                    ) : (
                        <div />
                    )}
                    <div className="flex flex-col items-end">
                        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Sat. Poste</span>
                        <div className="flex items-center gap-1">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${satBadgeClass}`}>{sat}%</span>
                        </div>
                    </div>
                </div>

                {/* Bottom saturation progress bar */}
                <div className="absolute bottom-0 left-0 h-1 bg-slate-200 w-full">
                    <div 
                        className={`h-full transition-all ${!satProgressClass.startsWith('#') ? satProgressClass : ''}`} 
                        style={{ 
                            width: `${Math.min(sat, 100)}%`, 
                            backgroundColor: satProgressClass.startsWith('#') ? satProgressClass : undefined 
                        }}
                    ></div>
                </div>

            </div>
        );
    };

    return (
        <div className="space-y-4 sm:space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-2 duration-300">

            {/* ─── GAMME-STYLE COMPACT STAT BAR (option sticky : Pin ON = fixée au scroll dans #workflow-content) ─── */}
            <div
                className={`rounded-xl border border-slate-200 shadow-sm p-2 sm:p-4 flex flex-col gap-2.5 sm:gap-4 xl:flex-row xl:items-start xl:justify-between xl:gap-6 min-w-0 ${
                    stickyToolbar
                        ? 'sticky top-[1px] z-40 bg-white/95 backdrop-blur-sm'
                        : 'relative z-auto bg-white'
                }`}
            >
                
                {/* Stats Section — compact for mobile */}
                <div className="flex flex-wrap items-stretch gap-1.5 sm:gap-3 min-w-0 flex-1 max-xl:w-full overflow-x-auto max-sm:pb-1 max-sm:-mx-3 max-sm:px-3 sm:overflow-visible custom-scrollbar-hide">
                    {/* OUVRIERS / HEURES — compact mobile */}
                    <div className="flex items-center gap-1 sm:gap-3 px-1.5 py-0.5 sm:px-3 sm:py-2 bg-slate-50 rounded-lg border border-slate-100 shadow-sm shrink-0">
                        <div className="flex flex-col items-center border-r border-slate-200 pr-1.5 sm:pr-3 mr-1.5 sm:mr-3">
                            <span className="text-[7px] sm:text-[9px] font-bold text-slate-400 uppercase">Ouvriers</span>
                            <input 
                                type="number" 
                                min="1" 
                                value={Math.round(numWorkers)} 
                                onChange={(e) => setNumWorkers && setNumWorkers(Math.max(1, Math.round(Number(e.target.value))))} 
                                className="w-8 sm:w-12 text-center bg-transparent font-black text-slate-700 outline-none text-xs sm:text-sm p-0" 
                            />
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[7px] sm:text-[9px] font-bold text-slate-400 uppercase">Heures</span>
                            <input 
                                type="number" 
                                min="0" 
                                step="0.5" 
                                value={presenceTime / 60} 
                                onChange={(e) => setPresenceTime && setPresenceTime(Math.max(0, Number(e.target.value)) * 60)} 
                                className="w-7 sm:w-10 text-center bg-transparent font-black text-slate-700 outline-none text-xs sm:text-sm p-0" 
                            />
                        </div>
                    </div>

                    {/* OPERATIONS / CHRONO — compact mobile */}
                    <div className="flex items-center gap-1 sm:gap-3 px-1.5 py-0.5 sm:px-3 sm:py-2 bg-slate-50 rounded-lg border border-slate-100 shadow-sm shrink-0">
                        <div className="flex flex-col items-center border-r border-slate-200 pr-1.5 sm:pr-3">
                            <span className="text-[7px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider">Opérations</span>
                            <span className="font-black text-slate-800 text-[10px] sm:text-base">{operations.length}</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[7px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider">Chrono.</span>
                            <span className="font-black text-indigo-600 text-[10px] sm:text-base">{totals.filledCount}</span>
                        </div>
                    </div>

                    {/* BF (s) — compact mobile */}
                    <div className="flex items-center gap-1 sm:gap-3 px-1.5 py-0.5 sm:px-3 sm:py-1.5 bg-emerald-50/50 rounded-lg border border-emerald-100 shadow-sm shrink-0">
                        <div className="flex flex-col items-center">
                            <span className="text-[7px] sm:text-[9px] font-bold text-emerald-600 uppercase flex items-center gap-0.5 sm:gap-1"><Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> BF (s)</span>
                            <span
                                className="font-black text-emerald-700 text-[10px] sm:text-sm mt-0.5 sm:mt-1"
                                title={hasChronoCycle
                                    ? `BF chrono ≈ ${chronoBfMinutes.toFixed(2)} min (cycle chrono ${totals.tempMajore.toFixed(2)} min, ${numWorkers} ouvrier(s))`
                                    : `BF global ≈ ${bf.toFixed(2)} min (en attente des relevés chrono)`}
                            >
                                {(chronoBfMinutes * 60).toFixed(1)}
                            </span>
                        </div>
                    </div>

                    {/* DYNAMIC TARGETS — compact mobile */}
                    <div className="flex items-center gap-1.5 sm:gap-3 px-1.5 py-0.5 sm:px-3 sm:py-1.5 bg-slate-50/50 rounded-lg border border-slate-100 shadow-sm shrink-0">
                        <div className="flex flex-col items-center border-r border-slate-200 pr-1.5 sm:pr-3 mr-0.5 sm:mr-1">
                            <span className="text-[7px] sm:text-[9px] font-bold text-slate-400 uppercase">P/J</span>
                            <span className="font-black text-slate-700 text-[10px] sm:text-sm leading-none mt-0.5 sm:mt-1">
                                {Math.round(prodDayEffChrono)}
                            </span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[7px] sm:text-[9px] font-bold text-slate-400 uppercase">P/H</span>
                            <span className="font-black text-slate-700 text-[10px] sm:text-sm leading-none mt-0.5 sm:mt-1">
                                {Math.round(prodHourEffChrono)}
                            </span>
                        </div>
                    </div>

                    {/* % RENDU — compact mobile */}
                    <div className="flex flex-col items-center px-1.5 py-0.5 sm:px-3 sm:py-1.5 bg-indigo-50/50 rounded-lg border border-indigo-100 shadow-sm shrink-0">
                        <span className="text-[7px] sm:text-[9px] font-bold text-indigo-400 uppercase">% Rendu</span>
                        <div className="flex items-baseline gap-0.5">
                            <input 
                                type="number" 
                                min="1" max="100" 
                                value={efficiency} 
                                onChange={(e) => setEfficiency && setEfficiency(Math.max(1, Math.min(100, Number(e.target.value))))} 
                                className="w-6 sm:w-8 text-center bg-transparent font-black text-indigo-600 outline-none text-xs sm:text-sm border-b border-indigo-200 p-0" 
                            />
                            <span className="text-[8px] sm:text-[10px] font-bold text-indigo-400">%</span>
                        </div>
                    </div>

                    {/* Progress bar — compact mobile */}
                    <div className="flex items-center gap-1 sm:gap-2 px-1.5 py-0.5 sm:px-3 sm:py-2 bg-slate-50/80 rounded-lg border border-slate-100 shadow-sm shrink-0 min-w-[min(100%,100px)] sm:min-w-[160px] xl:flex-1 xl:max-w-[220px]">
                        <div className="w-full h-1.5 sm:h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                        </div>
                        <span className="text-[10px] sm:text-xs font-bold text-slate-500">{progressPercent}%</span>
                    </div>
                </div>

                {/* Toolbar Actions — compact for mobile */}
                <div className="flex flex-wrap items-center gap-1 sm:gap-2 pt-2 sm:pt-3 border-t border-slate-100 xl:pt-0 xl:border-0 xl:justify-end shrink-0 min-w-0 max-xl:w-full overflow-x-auto max-sm:pb-1 max-sm:-mx-3 max-sm:px-3 sm:overflow-visible custom-scrollbar-hide">
                    <button
                        type="button"
                        onClick={() => setStickyToolbar(v => !v)}
                        className={`shrink-0 flex items-center gap-0.5 sm:gap-1.5 px-1.5 py-0.5 sm:px-3 sm:py-2 rounded-lg text-[9px] sm:text-xs font-bold transition-all border shadow-sm min-h-[24px] sm:min-h-[40px] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400 focus:outline-none ${stickyToolbar ? 'bg-slate-100 text-slate-800 border-slate-300' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        title={stickyToolbar ? 'Désactiver : la barre défile avec la page' : 'Activer : la barre reste fixée en haut au scroll'}
                    >
                        <Pin className={`w-3 h-3 sm:w-4 sm:h-4 shrink-0 ${stickyToolbar ? '' : 'opacity-60'}`} /> <span className="hidden sm:inline">Pin:</span>{stickyToolbar ? 'ON' : 'OFF'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowTsColumn(v => !v)}
                        className={`shrink-0 flex items-center gap-0.5 sm:gap-1.5 px-1.5 py-0.5 sm:px-3 sm:py-2 rounded-lg text-[9px] sm:text-xs font-bold transition-all border shadow-sm min-h-[24px] sm:min-h-[40px] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-amber-400 focus:outline-none ${showTsColumn ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        title="Afficher ou masquer la colonne TS (temps standard gamme)"
                    >
                        <Columns3 className="w-3 h-3 sm:w-4 sm:h-4" /> TS:{showTsColumn ? 'ON' : 'OFF'}
                    </button>
                    
                    <button
                        onClick={() => {
                            setTrEnabled(v => !v);
                            setShowTrConfig(false);
                        }}
                        className={`shrink-0 flex items-center gap-0.5 sm:gap-1.5 px-1.5 py-0.5 sm:px-3 sm:py-2 rounded-lg text-[9px] sm:text-xs font-bold transition-all border shadow-sm min-h-[24px] sm:min-h-[40px] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-emerald-400 focus:outline-none ${trEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        title="Activer / désactiver TR"
                    >
                        <Timer className="w-3 h-3 sm:w-4 sm:h-4" /> TR:{trEnabled ? 'ON' : 'OFF'}
                    </button>
                    
                    <button
                        onClick={() => setShowTrConfig(!showTrConfig)}
                        disabled={!trEnabled}
                        className={`shrink-0 flex items-center gap-0.5 sm:gap-1.5 px-1.5 py-0.5 sm:px-3 sm:py-2 rounded-lg text-[9px] sm:text-xs font-bold transition-all border shadow-sm min-h-[24px] sm:min-h-[40px] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${showTrConfig ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                        <Settings className="w-3 h-3 sm:w-4 sm:h-4" /> {trCount} lancers
                    </button>

                    <div className="shrink-0 flex items-stretch rounded-lg border border-slate-200 overflow-hidden shadow-sm h-[24px] sm:h-[40px]" title="Ordre des opérations : Gamme, implantation (Plantation) ou nouvelle séquence libre (Nouveau)">
                        <button
                            type="button"
                            onClick={() => setOrderSource('gamme')}
                            className={`px-1.5 py-0.5 sm:px-3 sm:py-2 text-[8px] sm:text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 focus:outline-none ${orderSource === 'gamme' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            title="Ordre de la Gamme"
                        >
                            Gamme
                        </button>
                        <button
                            type="button"
                            onClick={() => setOrderSource('plantation')}
                            className={`px-1.5 py-0.5 sm:px-3 sm:py-2 text-[8px] sm:text-xs font-bold transition-colors border-l border-slate-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 focus:outline-none ${orderSource === 'plantation' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            title="Ordre réel du flux d'implantation (lancement de la chaîne)"
                        >
                            Plantation
                        </button>
                        <button
                            type="button"
                            onClick={() => setOrderSource('new')}
                            className={`px-1.5 py-0.5 sm:px-3 sm:py-2 text-[8px] sm:text-xs font-bold transition-colors border-l border-slate-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 focus:outline-none ${orderSource === 'new' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            title="Créer une nouvelle séquence personnalisée sur le terrain"
                        >
                            Nouveau
                        </button>
                    </div>

                    {(orderSource === 'new' || orderSource === 'plantation') && (
                        <div className="shrink-0 flex items-stretch rounded-lg border border-slate-200 overflow-hidden shadow-sm h-[24px] sm:h-[40px]" title="Disposition du terrain">
                            <button
                                type="button"
                                onClick={() => setChronoLayoutSide?.('left')}
                                className={`px-1.5 py-0.5 sm:px-3 sm:py-2 text-[8px] sm:text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 focus:outline-none ${chronoLayoutSide === 'left' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            >
                                Gauche
                            </button>
                            <button
                                type="button"
                                onClick={() => setChronoLayoutSide?.('right')}
                                className={`px-1.5 py-0.5 sm:px-3 sm:py-2 text-[8px] sm:text-xs font-bold transition-colors border-l border-slate-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 focus:outline-none ${chronoLayoutSide === 'right' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            >
                                Droite
                            </button>
                            <button
                                type="button"
                                onClick={() => setChronoLayoutSide?.('both')}
                                className={`px-1.5 py-0.5 sm:px-3 sm:py-2 text-[8px] sm:text-xs font-bold transition-colors border-l border-slate-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 focus:outline-none ${chronoLayoutSide === 'both' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            >
                                Les deux
                            </button>
                        </div>
                    )}

                    <div className="shrink-0 flex items-stretch rounded-lg border border-slate-200 overflow-hidden shadow-sm h-[24px] sm:h-[40px]">
                        <button
                            type="button"
                            onClick={() => setOutputMode('PJ')}
                            className={`px-2 sm:px-3 py-1 sm:py-2 text-[10px] sm:text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 focus:outline-none ${outputMode === 'PJ' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            title="Afficher en pièces par jour"
                        >
                            P/J
                        </button>
                        <button
                            type="button"
                            onClick={() => setOutputMode('PH')}
                            className={`px-2 sm:px-3 py-1 sm:py-2 text-[10px] sm:text-xs font-bold transition-colors border-l border-slate-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 focus:outline-none ${outputMode === 'PH' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            title="Afficher en pièces par heure"
                        >
                            P/H
                        </button>
                    </div>
                    
                    <button
                        type="button"
                        onClick={() => setShowThroughputKpi(v => !v)}
                        className={`shrink-0 flex items-center gap-0.5 sm:gap-1.5 px-1.5 py-0.5 sm:px-3 sm:py-2 rounded-lg text-[9px] sm:text-xs font-bold transition-all border shadow-sm min-h-[24px] sm:min-h-[40px] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-orange-400 focus:outline-none ${showThroughputKpi ? 'bg-orange-50 text-orange-800 border-orange-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        title="Afficher/masquer P° Max / P° Rdt"
                    >
                        <Target className="w-3 h-3 sm:w-4 sm:h-4" /> P° KPI
                    </button>
                    
                    <div className="relative shrink-0" ref={unitMenuRef}>
                        <button
                            type="button"
                            onClick={() => setShowUnitMenu(v => !v)}
                            className={`flex items-center justify-between gap-0.5 sm:gap-2 px-1.5 sm:px-3 py-0.5 sm:py-2 rounded-lg text-left transition-all border shadow-sm min-w-[70px] sm:min-w-[100px] min-h-[24px] sm:min-h-[40px] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400 focus:outline-none ${showUnitMenu ? 'bg-indigo-50 text-indigo-800 border-indigo-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                            title={`Unité: ${getUnitMeta(unit).name}`}
                        >
                            <span className="flex flex-col leading-none">
                                <span className="text-[7px] sm:text-[9px] font-bold uppercase tracking-wider text-slate-500">Unité</span>
                                <span className="font-black text-[10px] sm:text-sm">{unitShort}</span>
                            </span>
                            <ChevronDown className={`w-3 h-3 sm:w-4 sm:h-4 text-slate-400 transition-transform ${showUnitMenu ? 'rotate-180 text-indigo-500' : ''}`} />
                        </button>
                        {showUnitMenu && (
                            <div className="absolute right-0 top-[calc(100%+8px)] z-[200] w-[240px] rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
                                <div className="px-2 pb-2 border-b border-slate-100 mb-2">
                                    <p className="text-xs font-bold text-slate-700">Choisir l'unité de temps</p>
                                </div>
                                <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                                    {TIME_UNIT_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => { setUnit(opt.id); setShowUnitMenu(false); }}
                                            className={`flex items-center justify-center p-2 rounded-lg text-xs font-bold border transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400 focus:outline-none ${unit === opt.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-100 hover:border-slate-300 hover:bg-slate-100'}`}
                                            title={opt.name}
                                        >
                                            <span className="font-mono">{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {trEnabled && showTrConfig && (
                <div className="bg-gradient-to-r from-indigo-50 to-white rounded-xl border border-indigo-100 shadow-sm p-2 sm:p-3 flex flex-wrap gap-2 items-center animate-in slide-in-from-top-2 duration-200">
                    <span className="text-[10px] sm:text-xs font-bold text-indigo-800 uppercase tracking-wider mr-2 flex items-center gap-1">
                        <Settings className="w-3 h-3 sm:w-4 sm:h-4" /> Nombre de relevés (TR) :
                    </span>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 10].map(n => (
                            <button
                                key={n}
                                onClick={() => { setTrCount(n); setShowTrConfig(false); }}
                                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg font-black text-[10px] sm:text-sm transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400 focus:outline-none ${trCount === n ? 'bg-indigo-600 text-white ring-2 ring-indigo-600 ring-offset-2' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'}`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── MAIN TABLE CARD ─── */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-lg overflow-visible">

                {/* Table Header */}
                <div className="px-2 py-1.5 sm:px-6 sm:py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-1.5 sm:gap-4">
                    <div className="flex items-center gap-1.5 sm:gap-3">
                        <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                            <BarChart3 className="w-3 h-3 sm:w-5 sm:h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 text-[11px] sm:text-lg leading-tight">Relevés Terrain</h3>
                            <p className="text-slate-500 text-[9px] sm:text-sm font-medium mt-0.5">
                                {trCount} relevés configurés • Unité : <strong className="text-indigo-600 bg-indigo-50 px-1 rounded">{unitLabel}</strong>
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 md:gap-6">
                        {hasSections && (
                            <div className="flex items-center gap-1.5 bg-slate-50 p-0.5 rounded-lg border border-slate-200">
                                {(['ALL', 'PREPARATION', 'MONTAGE'] as const).map(s => {
                                    const active = sectionFilter === s;
                                    return (
                                        <button key={s} onClick={() => setSectionFilter(s)}
                                            className={`px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 ${active ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
                                            {s === 'ALL' ? 'Toutes' : s === 'PREPARATION' ? 'Prépa' : 'Montage'}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        
                        <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                            <span className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>Lent</span>
                            <span className="mx-1 text-slate-300">|</span>
                            <span className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>Rapide</span>
                        </div>
                    </div>
                </div>

                {orderSource === 'plantation' ? (
                    <div className="space-y-6 p-4 bg-slate-50/50">
                        {structureSections.map(section => {
                            const isAlternating = activeLayout === 'double-zigzag' || activeLayout === 'zigzag';
                            
                            const sectionCards: {
                                type: 'station' | 'empty';
                                st: Workstation;
                                op: Operation | null;
                                opIdx: number;
                                totalOps: number;
                            }[] = [];
                            
                            section.stations.forEach(st => {
                                if (st.operations.length > 0) {
                                    st.operations.forEach((op, opIdx) => {
                                        sectionCards.push({
                                            type: 'station',
                                            st,
                                            op,
                                            opIdx,
                                            totalOps: st.operations.length
                                        });
                                    });
                                } else {
                                    sectionCards.push({
                                        type: 'empty',
                                        st,
                                        op: null,
                                        opIdx: 0,
                                        totalOps: 0
                                    });
                                }
                            });

                            if (isAlternating) {
                                const sideA: typeof sectionCards = [];
                                const sideB: typeof sectionCards = [];
                                
                                section.stations.forEach((st, stIdx) => {
                                    const stCards = sectionCards.filter(c => c.st.id === st.id);
                                    if (stIdx % 2 === 0) {
                                        sideA.push(...stCards);
                                    } else {
                                        sideB.push(...stCards);
                                    }
                                });

                                return (
                                    <div key={section.id} className="bg-slate-100/50 rounded-2xl border border-slate-205 p-4 sm:p-6 mb-6">
                                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                                            <span className={`px-3 py-1 rounded-lg text-xs font-black tracking-wide text-white uppercase bg-${section.theme}-600`}>
                                                {section.name}
                                            </span>
                                            <span className="text-xs text-slate-500 font-bold">{section.stations.length} postes</span>
                                        </div>

                                        <div className={`grid grid-cols-1 ${chronoLayoutSide === 'both' ? 'lg:grid-cols-2' : ''} gap-6 items-start`}>
                                            {/* Left side: odd stations/operations */}
                                            {(chronoLayoutSide === 'left' || chronoLayoutSide === 'both') && (
                                                <div className="flex flex-col gap-4">
                                                    <div className="bg-indigo-50 border border-indigo-100 text-indigo-850 py-2 px-3 rounded-xl font-black text-center text-xs uppercase tracking-wide">
                                                        CÔTÉ GAUCHE (POSTES IMPAIRS)
                                                    </div>
                                                    {sideA.map((item, idx) => (
                                                        <React.Fragment key={`${item.st.id}__${item.op?.id || idx}`}>
                                                            {item.type === 'station' && item.op ? (
                                                                renderPlantationOperationCard(item.st, item.op, item.opIdx, item.totalOps)
                                                            ) : (
                                                                renderEmptyWorkstationCard(item.st)
                                                            )}
                                                        </React.Fragment>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Right side: even stations/operations */}
                                            {(chronoLayoutSide === 'right' || chronoLayoutSide === 'both') && (
                                                <div className="flex flex-col gap-4">
                                                    <div className="bg-slate-100 border border-slate-250 text-slate-750 py-2 px-3 rounded-xl font-black text-center text-xs uppercase tracking-wide">
                                                        CÔTÉ DROIT (POSTES PAIRS)
                                                    </div>
                                                    {sideB.map((item, idx) => (
                                                        <React.Fragment key={`${item.st.id}__${item.op?.id || idx}`}>
                                                            {item.type === 'station' && item.op ? (
                                                                renderPlantationOperationCard(item.st, item.op, item.opIdx, item.totalOps)
                                                            ) : (
                                                                renderEmptyWorkstationCard(item.st)
                                                            )}
                                                        </React.Fragment>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            } else {
                                return (
                                    <div key={section.id} className="bg-slate-100/50 rounded-2xl border border-slate-205 p-4 sm:p-6 mb-6">
                                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                                            <span className={`px-3 py-1 rounded-lg text-xs font-black tracking-wide text-white uppercase bg-${section.theme}-600`}>
                                                {section.name}
                                            </span>
                                            <span className="text-xs text-slate-500 font-bold">{section.stations.length} postes</span>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            {sectionCards.map((item, idx) => (
                                                <React.Fragment key={`${item.st.id}__${item.op?.id || idx}`}>
                                                    {item.type === 'station' && item.op ? (
                                                        renderPlantationOperationCard(item.st, item.op, item.opIdx, item.totalOps)
                                                    ) : (
                                                        renderEmptyWorkstationCard(item.st)
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }
                        })}
                    </div>
                ) : orderSource === 'new' ? (
                    (() => {
                        const leftStations = (chronoCustomStations || []).filter(s => s.side === 'left');
                        const rightStations = (chronoCustomStations || []).filter(s => s.side === 'right');

                        return (
                            <div className={`grid grid-cols-1 ${chronoLayoutSide === 'both' ? 'lg:grid-cols-2' : ''} gap-3 sm:gap-6 items-start p-2.5 sm:p-4 bg-slate-50/50`}>
                                {/* Left Column */}
                                {(chronoLayoutSide === 'left' || chronoLayoutSide === 'both') && (
                                    <div className="flex flex-col gap-2.5 sm:gap-4">
                                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-850 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg sm:rounded-xl font-black text-center text-[10px] sm:text-xs uppercase tracking-wide">
                                            CÔTÉ GAUCHE (POSTES IMPAIRS)
                                        </div>
                                        {leftStations.map((station, idx) => (
                                            renderCustomStationCard(station, idx * 2 + 1)
                                        ))}
                                        {renderAddCustomStationCard('left')}
                                    </div>
                                )}

                                {/* Right Column */}
                                {(chronoLayoutSide === 'right' || chronoLayoutSide === 'both') && (
                                    <div className="flex flex-col gap-2.5 sm:gap-4">
                                        <div className="bg-slate-100 border border-slate-205 text-slate-750 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg sm:rounded-xl font-black text-center text-[10px] sm:text-xs uppercase tracking-wide">
                                            CÔTÉ DROIT (POSTES PAIRS)
                                        </div>
                                        {rightStations.map((station, idx) => (
                                            renderCustomStationCard(station, idx * 2 + 2)
                                        ))}
                                        {renderAddCustomStationCard('right')}
                                    </div>
                                )}
                            </div>
                        );
                    })()
                ) : (
                    <>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 border-b-2 border-slate-200 text-[11px] uppercase tracking-wider font-bold">
                                        <th className="py-3 px-3 text-left w-10">#</th>
                                        <th className="py-3 px-3 text-left min-w-[160px]">Opération</th>
                                        {showTsColumn && (
                                            <th
                                                className="py-3 px-3 text-center bg-amber-50/50 text-amber-600 border-x border-slate-100 w-16"
                                                title="Temps standard (gamme), affiché en secondes — indépendant de l’unité des relevés"
                                            >
                                                TS <span className="normal-case font-semibold text-[10px]">(s)</span>
                                            </th>
                                        )}
                                        {trEnabled && trSlots.map(n => (
                                            <th key={n} className="py-3 px-1 text-center w-14 bg-slate-100/50">TR {n}</th>
                                        ))}
                                        <th className="py-3 px-2 text-center bg-indigo-50/60 text-indigo-700 w-16 border-l border-slate-200">T.Moy</th>
                                        <th
                                            className="py-3 px-1 text-center w-14"
                                            title="Majoration : coefficient multiplicateur (ex. 1,15 = +15 % sur le temps moyen)"
                                        >
                                            Maj.
                                        </th>
                                        <th
                                            className={`py-3 px-2 text-center bg-emerald-50/60 text-emerald-700 w-[5.25rem] ${!showThroughputKpi ? 'rounded-tr-lg' : ''}`}
                                            title={`Temps majoré = T.Moy × Maj. Affichage en ${getUnitMeta(unit).name} (${unitShort}).`}
                                        >
                                            <span className="block leading-tight">T.Maj</span>
                                            <span className="block text-[9px] font-semibold normal-case tracking-normal text-emerald-600/90">× Maj</span>
                                        </th>
                                        {showThroughputKpi && (
                                            <>
                                                <th className="py-3 px-2 text-center w-14 text-slate-500">{outputMode === 'PJ' ? 'P° Max' : 'P/H Max'}</th>
                                                <th className="py-3 px-2 text-center bg-slate-800 text-white rounded-tr-lg w-16">{outputMode === 'PJ' ? 'P° Rdt' : 'P/H Rdt'}</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredOperations.length === 0 ? (
                                        <tr>
                                            <td colSpan={desktopColSpan} className="px-8 py-16 text-center">
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
                                        filteredOperations.map((op, index) => {
                                            const data = getChronoDataForOp(op.id);
                                            const row = recalcRow(data, unit);
                                            const isExpanded = expandedRows.has(op.id);
                                            const isActive = activeRowId === op.id;
                                            const assignedPostes = assignments[op.id] || [];
                                            const primaryPosteColor = assignedPostes.length > 0 ? posteColorById.get(assignedPostes[0]) : undefined;
        
                                            const filledTRs = trSlots.filter(n => {
                                                const v = data[`tr${n}` as keyof ChronoData];
                                                return v !== undefined && v !== null;
                                            }).length;
        
                                            return (
                                                <React.Fragment key={op.id}>
                                                    <tr
                                                        className={`group transition-colors duration-200 cursor-pointer ${isActive ? 'bg-indigo-50/60 ring-1 ring-inset ring-indigo-200 shadow-sm' : 'hover:bg-slate-50/90'}`}
                                                        onClick={() => setActiveRowId(isActive ? null : op.id)}
                                                    >
                                                        <td
                                                            className={`px-3 py-3 transition-colors ${isActive ? 'bg-transparent' : 'bg-white group-hover:bg-slate-50/90'}`}
                                                        >
                                                            <div className="flex items-center justify-center">
                                                                <span
                                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-black text-xs shadow-sm transition-colors ${primaryPosteColor ? 'text-white ring-1 ring-black/10' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-700'}`}
                                                                    style={primaryPosteColor ? { backgroundColor: primaryPosteColor.fill ?? '#6366f1' } : undefined}
                                                                >
                                                                    {index + 1}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="font-black text-slate-800 truncate text-sm" title={op.description}>{op.description}</p>
                                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                        {trEnabled && filledTRs >= 2 && (() => {
                                                                            const v = getRowValidity(op.id);
                                                                            const cfg = v === 'valid'
                                                                                ? { dot: 'bg-emerald-400', title: 'Série valide (CV<10%)' }
                                                                                : v === 'warn'
                                                                                ? { dot: 'bg-amber-400', title: 'Série à vérifier (CV 10-15%)' }
                                                                                : { dot: 'bg-rose-500',   title: 'Série invalide (CV>15%)' };
                                                                            if (v === 'empty') return null;
                                                                            return <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot} mb-0.5`} title={cfg.title} />;
                                                                        })()}
                                                                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 truncate max-w-[140px] font-semibold" title={getMachineLabel(op.id)}>
                                                                            {getMachineLabel(op.id)}
                                                                        </span>
                                                                        <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
                                                                            <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                                                <div className={`h-full rounded-full transition-all ${filledTRs === trCount ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${(filledTRs / Math.max(1, trCount)) * 100}%` }} />
                                                                            </div>
                                                                            <span className="text-[10px] text-slate-500 font-bold">{trEnabled ? `${filledTRs}/${trCount}` : 'TR OFF'}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); toggleRowExpand(op.id); }}
                                                                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-indigo-100 flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                                                                    title={isExpanded ? 'Réduire' : 'Chronométrer'}
                                                                >
                                                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <Timer className="w-4 h-4" />}
                                                                </button>
                                                            </div>
                                                        </td>
                                                        {showTsColumn && (
                                                            <td
                                                                className="px-2 py-3 text-center font-bold text-amber-700 bg-amber-50/40 border-x border-slate-100 font-mono text-xs"
                                                                title="Temps standard gamme (secondes)"
                                                            >
                                                                {formatTsSeconds(op.time)}
                                                            </td>
                                                        )}
                                                        {trEnabled && (() => {
                                                            const rowTRs = getRowTRs(data);
                                                            const median = getMedian(rowTRs);
                                                            return trSlots.map((trNum) => {
                                                                const val = data[`tr${trNum}` as keyof ChronoData];
                                                                const hasVal = val !== undefined && val !== null && (val as number) > 0;
                                                                const status: TRStatus = hasVal ? classifyTR(val as number, median) : 'normal';
                                                                return (
                                                                    <td key={trNum} className={`px-0.5 py-1.5 ${trNum === trCount ? 'border-r border-slate-200' : ''} relative group/cell`}>
                                                                        <input
                                                                            type="number" step="0.01" min="0"
                                                                            className={`w-full pl-1 pr-6 py-1.5 text-center text-[13px] font-mono font-bold border border-transparent rounded-md hover:bg-slate-50 hover:border-slate-200 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder:text-slate-300 cursor-text shadow-sm ${INPUT_NO_SPIN} ${hasVal ? trStatusStyles[status] : 'bg-transparent text-indigo-600'}`}
                                                                            placeholder="—"
                                                                            value={hasVal && typeof val === 'number' ? displayValue(val) : ''}
                                                                            onClick={(e) => { e.stopPropagation(); }}
                                                                            onChange={e => handleCellChange(op.id, `tr${trNum}` as keyof ChronoData, e.target.value)}
                                                                        />
                                                                        {hasVal && (
                                                                            <button
                                                                            type="button"
                                                                            aria-label={`Supprimer TR ${trNum}`}
                                                                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                            onClick={(e) => handleClearTRClick(e, op.id, trNum)}
                                                                            className="absolute right-0.5 top-1/2 -translate-y-1/2 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-md border border-rose-200 bg-white/95 text-rose-500 shadow-sm opacity-0 scale-90 pointer-events-none transition-all duration-200 group-hover/cell:opacity-100 group-hover/cell:scale-100 group-hover/cell:pointer-events-auto group-focus-within/cell:opacity-100 group-focus-within/cell:scale-100 group-focus-within/cell:pointer-events-auto hover:bg-rose-50 hover:text-rose-600 hover:shadow active:scale-95"
                                                                                title="Supprimer ce relevé"
                                                                            >
                                                                                <X className="w-2.5 h-2.5" />
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                );
                                                            });
                                                        })()}
                                                        <td
                                                            className="px-1.5 py-2 text-center align-middle border-l border-slate-200 bg-indigo-50/20"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                className={`w-full min-w-[3.5rem] px-1 py-1 text-center text-[13px] font-mono font-black rounded-md border border-transparent hover:bg-white hover:border-slate-300 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all ${INPUT_NO_SPIN} text-indigo-700 shadow-sm`}
                                                                placeholder="—"
                                                                title={row.tmManual ? 'T.Moy manuel — T.Maj / P° recalculés' : 'Moyenne des TR — ou saisie manuelle ici'}
                                                                value={displayValue(row.tm)}
                                                                onChange={e => handleCellChange(op.id, 'tm', e.target.value)}
                                                            />
                                                            {row.tmManual && (
                                                                <span className="block text-[9px] font-bold text-indigo-400 leading-none mt-1 uppercase tracking-wider">manuel</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                type="number" step="0.01" min="0"
                                                                className={`w-14 mx-auto px-1 py-1 text-center text-[13px] font-mono font-bold text-slate-700 border border-slate-200 rounded-md shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all ${INPUT_NO_SPIN}`}
                                                                value={displayValue(data.majoration)}
                                                                onChange={e => handleCellChange(op.id, 'majoration', e.target.value)}
                                                            />
                                                        </td>
                                                        <td
                                                            className="px-2 py-3 text-center font-mono font-bold text-emerald-700 bg-emerald-50/30 text-xs"
                                                            title={
                                                                row.tempMajore !== undefined
                                                                    ? `T.Moy × Maj. → ${row.tempMajore.toFixed(2)} min (affiché : ${formatTempMajoreInUnit(row.tempMajore)} ${unitShort})`
                                                                    : undefined
                                                            }
                                                        >
                                                            {formatTempMajoreInUnit(row.tempMajore)}
                                                        </td>
                                                        {showThroughputKpi && (
                                                            <>
                                                                <td className="px-2 py-3 text-center font-mono text-slate-500 font-medium text-xs">
                                                                    {formatProductionCell(row.pMax, outputMode)}
                                                                </td>
                                                                <td className="px-2 py-3 text-center font-mono font-black text-slate-800 bg-slate-50 group-hover:bg-indigo-50 transition-colors text-xs">
                                                                    {formatProductionCell(row.p85, outputMode)}
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
        
                                                    {/* ─── EXPANDED: STOPWATCH ─── */}
                                                    {isExpanded && (
                                                        <tr>
                                                            <td colSpan={desktopColSpan} className="px-6 py-8 bg-slate-50/50 border-b border-slate-200 shadow-inner">
                                                                <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl border border-indigo-100 overflow-hidden animate-in zoom-in-95 duration-200">
                                                                    <AdvancedStopwatch
                                                                        key={op.id}
                                                                        onRecord={(time) => handleStopwatchRecord(op.id, time)}
                                                                        onClear={() => clearAllTRs(op.id)}
                                                                        onAdvance={() => advanceToNextOp(op.id)}
                                                                        onPrev={() => goToPrevOp(op.id)}
                                                                        onNext={() => goToNextOp(op.id)}
                                                                        onUndoLast={() => clearLastTR(op.id)}
                                                                        trCount={trCount}
                                                                        filledCount={filledTRs}
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
                                            {showTsColumn && (
                                                <td
                                                    className="px-2 py-4 text-center font-black font-mono text-amber-600 border-x border-slate-200 bg-amber-50/50 text-xs"
                                                    title="Σ temps gamme (secondes)"
                                                >
                                                    {totalTsSeconds.toFixed(2)}
                                                </td>
                                            )}
                                            {trEnabled && (
                                                <td colSpan={visibleTrCount} className="border-r border-slate-200 px-3 py-4 text-center">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">— Relevés Individuels —</span>
                                                </td>
                                            )}
                                            <td className="px-2 py-4 text-center font-black font-mono text-indigo-700 bg-indigo-100/70 text-sm border-l border-slate-200">
                                                {totals.tm.toFixed(2)}
                                            </td>
                                            <td className="px-2 py-4"></td>
                                            <td
                                                className={`px-2 py-4 text-center font-black font-mono text-emerald-700 bg-emerald-100/70 text-sm ${!showThroughputKpi ? 'rounded-br-lg' : ''}`}
                                                title={`Σ (T.Moy × Maj.) : ${totals.tempMajore.toFixed(2)} min — affiché en ${unitShort}`}
                                            >
                                                {formatTempMajoreInUnit(totals.tempMajore)}
                                            </td>
                                            {showThroughputKpi && (
                                                <>
                                                    <td className="px-2 py-4 text-center font-bold font-mono text-slate-600 text-xs" title={footerPMaxTitle}>
                                                        {formatProductionCell(totals.pMaxGlobal || undefined, outputMode)}
                                                    </td>
                                                    <td
                                                        className="px-2 py-4 text-center font-black font-mono text-white bg-slate-800 text-sm rounded-br-lg"
                                                        title={footerPRdtTitle}
                                                    >
                                                        {formatProductionCell(totals.p85Global || undefined, outputMode)}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
        
                        {/* ─── MOBILE CARD VIEW ─── */}
                        <div className="md:hidden divide-y divide-slate-100">
                            {filteredOperations.length === 0 ? (
                                <div className="px-6 py-12 text-center">
                                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <ClipboardList className="w-6 h-6 text-slate-300" />
                                    </div>
                                    <p className="text-slate-500 font-bold">Aucune opération</p>
                                    <p className="text-slate-400 text-xs mt-1">Remplir la Gamme Opératoire d'abord.</p>
                                </div>
                            ) : (
                                filteredOperations.map((op, index) => {
                                    const data = getChronoDataForOp(op.id);
                                    const row = recalcRow(data, unit);
                                    const isExpanded = expandedRows.has(op.id);
                                    const assignedPostes = assignments[op.id] || [];
                                    const primaryPosteColor = assignedPostes.length > 0 ? posteColorById.get(assignedPostes[0]) : undefined;
                                    const filledTRs = trSlots.filter(n => {
                                        const v = data[`tr${n}` as keyof ChronoData];
                                        return v !== undefined && v !== null;
                                    }).length;
        
                                    return (
                                        <div key={op.id} className="p-3 sm:p-4 bg-white">
                                            {/* Name + Expand */}
                                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <span
                                                        className={`w-6 h-6 shrink-0 rounded-lg flex items-center justify-center font-mono text-[10px] font-bold shadow-sm ${primaryPosteColor ? 'text-white ring-1 ring-black/10' : 'bg-slate-100 text-slate-500'}`}
                                                        style={primaryPosteColor ? { backgroundColor: primaryPosteColor.fill ?? '#6366f1' } : undefined}
                                                    >
                                                        {index + 1}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-slate-800 text-sm truncate">{op.description}</p>
                                                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 truncate max-w-[140px]">
                                                                {getMachineLabel(op.id)}
                                                            </span>
                                                            {showTsColumn && (
                                                                <span
                                                                    className="text-[9px] font-mono font-bold text-amber-600 px-1.5 py-0.5 rounded-md bg-amber-50/80 border border-amber-100"
                                                                    title="Temps standard gamme (s)"
                                                                >
                                                                    TS {formatTsSeconds(op.time)} s
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button onClick={() => toggleRowExpand(op.id)} className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            </div>
        
                                            {/* TR Grid */}
                                            {trEnabled && (
                                            <div className="grid grid-cols-3 gap-2 mb-3">
                                                {trSlots.map(trNum => {
                                                    const val = data[`tr${trNum}` as keyof ChronoData];
                                                    return (
                                                        <div key={trNum} className="relative">
                                                            <label className="text-[9px] font-bold text-slate-400 uppercase mb-0.5 block text-center">TR {trNum}</label>
                                                            <input
                                                                type="number" step="0.01"
                                                                className={`w-full px-2 py-2 text-center text-sm font-mono font-bold border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all ${INPUT_NO_SPIN}`}
                                                                placeholder="—"
                                                                value={typeof val === 'number' && !isNaN(val) ? displayValue(val) : ''}
                                                                onChange={e => handleCellChange(op.id, `tr${trNum}` as keyof ChronoData, e.target.value)}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            )}
        
                                            {/* Results Strip */}
                                            <div className="bg-slate-50 rounded-xl p-2.5 space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Majoration</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        className={`w-20 px-2 py-1 text-center text-sm font-mono font-bold border border-slate-200 rounded-lg bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all ${INPUT_NO_SPIN}`}
                                                        value={displayValue(data.majoration)}
                                                        onChange={e => handleCellChange(op.id, 'majoration', e.target.value)}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                <div className="flex-1 text-center min-w-0">
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase">T.Moy</p>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        className={`mt-0.5 w-full max-w-[5rem] mx-auto px-1 py-1 text-center text-sm font-black text-indigo-700 font-mono border border-slate-200 rounded-lg bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none ${INPUT_NO_SPIN}`}
                                                        placeholder="—"
                                                        value={displayValue(row.tm)}
                                                        onChange={e => handleCellChange(op.id, 'tm', e.target.value)}
                                                    />
                                                    {row.tmManual && <span className="text-[8px] font-bold text-slate-400">manuel</span>}
                                                </div>
                                                <div className="w-px h-6 bg-slate-200"></div>
                                                <div className="flex-1 text-center">
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase" title="T.Moy × Maj.">T.Maj × Maj ({unitShort})</p>
                                                    <p className="text-sm font-black text-emerald-700 font-mono">{formatTempMajoreInUnit(row.tempMajore)}</p>
                                                </div>
                                                {showThroughputKpi && (
                                                    <>
                                                        <div className="w-px h-6 bg-slate-200"></div>
                                                        <div className="flex-1 text-center">
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase">{outputMode === 'PJ' ? 'P° Rdt' : 'P/H Rdt'}</p>
                                                            <p className="text-sm font-black text-slate-800 font-mono">{formatProductionCell(row.p85, outputMode)}</p>
                                                        </div>
                                                    </>
                                                )}
                                                <div className="w-px h-6 bg-slate-200"></div>
                                                <div className="text-center px-2">
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase">{trEnabled ? `${filledTRs}/${trCount}` : 'TR OFF'}</p>
                                                    <div className="flex items-center justify-center gap-1 mt-1">
                                                        <div className="w-8 h-1 bg-slate-200 rounded-full overflow-hidden">
                                                            <div className={`h-full rounded-full ${filledTRs === trCount ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${(filledTRs / Math.max(1, trCount)) * 100}%` }} />
                                                        </div>
                                                        {trEnabled && filledTRs >= 2 && (() => {
                                                            const v = getRowValidity(op.id);
                                                            const dot = v === 'valid' ? 'bg-emerald-400' : v === 'warn' ? 'bg-amber-400' : 'bg-rose-500';
                                                            const tip = v === 'valid' ? 'Série valide' : v === 'warn' ? 'Vérifier CV' : 'Série invalide';
                                                            return <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} title={tip} />;
                                                        })()}
                                                    </div>
                                                </div>
                                                </div>
                                            </div>
        
                                            {/* Expanded Stopwatch */}
                                            {isExpanded && (
                                                <div className="mt-3 bg-gradient-to-br from-indigo-50 to-cyan-50 rounded-xl p-4 border border-indigo-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <AdvancedStopwatch
                                                        key={op.id}
                                                        onRecord={(time) => handleStopwatchRecord(op.id, time)}
                                                        onClear={() => clearAllTRs(op.id)}
                                                        onAdvance={() => advanceToNextOp(op.id)}
                                                        onPrev={() => goToPrevOp(op.id)}
                                                        onNext={() => goToNextOp(op.id)}
                                                        onUndoLast={() => clearLastTR(op.id)}
                                                        trCount={trCount}
                                                        filledCount={filledTRs}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </>
                )}
            </div>



            {/* ─── BOTTOM INSIGHT CARD ─── */}
            {operations.length > 0 && totals.tempMajore > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Configuration</span>
                            <span className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-black text-slate-700 shadow-sm text-sm">{presenceHours.toFixed(1)} h/j</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">Temps de Cycle</span>
                            <span className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 font-black text-emerald-700 shadow-sm text-sm">{totals.tempMajore.toFixed(2)} min</span>
                        </div>
                        {showThroughputKpi && (
                            <>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-0.5">Rendement {Math.max(1, Math.min(100, efficiency))}%</span>
                                    <span className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 font-black text-indigo-700 shadow-sm text-sm">
                                        {outputMode === 'PJ' ? `${totals.p85Global} pcs/j` : `${formatProductionCell(totals.p85Global || undefined, 'PH')} pcs/h`}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-0.5">Capacité Max</span>
                                    <span className="px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200 font-black text-orange-700 shadow-sm text-sm">
                                        {outputMode === 'PJ' ? `${totals.pMaxGlobal} pcs/j` : `${formatProductionCell(totals.pMaxGlobal || undefined, 'PH')} pcs/h`}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                    
                    <div className="flex flex-wrap items-end gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Objectif (Pièces)</label>
                            <input
                                type="number"
                                min="1"
                                value={targetQuantity}
                                onChange={(e) => setTargetQuantity(Math.max(1, Number(e.target.value) || 1))}
                                className={`w-28 h-9 px-3 rounded-lg border border-slate-300 text-left font-black text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm ${INPUT_NO_SPIN}`}
                            />
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="flex flex-col px-3 py-1.5 rounded-lg bg-purple-100 border border-purple-200 font-black text-purple-700 shadow-sm">
                                <span className="text-[9px] font-bold text-purple-500 uppercase tracking-wider leading-none mb-1">Délai estimé</span>
                                {estimatedDays > 0 ? estimatedDays.toFixed(1) : '—'} jours
                            </span>
                            <span className="hidden sm:flex flex-col px-3 py-1.5 rounded-lg bg-cyan-50 border border-cyan-200 font-black text-cyan-700 shadow-sm">
                                <span className="text-[9px] font-bold text-cyan-500 uppercase tracking-wider leading-none mb-1">Cadence</span>
                                {cycleHours.toFixed(2)} h / pce
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── FOOTER INFO ─── */}
            <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-4 flex items-start sm:items-center gap-3 print:hidden">
                <div className="bg-blue-100 p-1.5 rounded-lg shrink-0 mt-0.5 sm:mt-0">
                    <Activity className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-xs text-blue-800/80 font-medium leading-relaxed">
                    Production calculée sur <strong>{presenceTime}</strong> minutes avec une majoration par défaut de <strong>15%</strong> (1.15).
                    L'unité de temps définie est <strong className="uppercase">{unitLabel}</strong>. La moyenne (T.Moy) est automatique mais peut être ajustée manuellement.
                </p>
            </div>

            {/* ─── CREATE SESSION DIALOG ─── */}
            {showCreateDialog && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-black text-slate-800 text-lg">Nouvelle Séance Chrono</h3>
                                <p className="text-slate-500 text-xs mt-0.5">Choisir le type de gamme et créer la séance</p>
                            </div>
                            <button onClick={() => setShowCreateDialog(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            {/* Gamme Type Selector */}
                            <div>
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">Type de Gamme</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {gammeTypeOptions.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => {
                                                setNewSessionGammeType(opt.value);
                                                setNewSessionOrderSource(opt.value === 'plantation' ? 'plantation' : 'gamme');
                                            }}
                                            className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                                                newSessionGammeType === opt.value
                                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-md'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span className="text-sm font-black">{opt.label}</span>
                                            <span className="text-[10px] font-medium text-center leading-tight">{opt.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Order Source Toggle */}
                            <div>
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">Ordre des Opérations</label>
                                <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                                    <button
                                        onClick={() => setNewSessionOrderSource('gamme')}
                                        className={`flex-1 px-4 py-2.5 text-xs font-bold transition-colors ${
                                            newSessionOrderSource === 'gamme' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        Gamme
                                    </button>
                                    <button
                                        onClick={() => setNewSessionOrderSource('plantation')}
                                        className={`flex-1 px-4 py-2.5 text-xs font-bold transition-colors border-l border-slate-200 ${
                                            newSessionOrderSource === 'plantation' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        Plantation
                                    </button>
                                </div>
                            </div>
                            {/* Preview */}
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                    <span className="font-bold">Modèle :</span>
                                    <span className="text-indigo-600 font-black">{articleName || 'Non défini'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
                                    <span className="font-bold">Opérations :</span>
                                    <span className="font-black">{operations.length}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
                                    <span className="font-bold">Séances existantes :</span>
                                    <span className="font-black">{sessions.length}</span>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowCreateDialog(false)}
                                className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={createSession}
                                className="px-6 py-2.5 rounded-xl text-sm font-black bg-indigo-600 text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all"
                            >
                                <Plus className="w-4 h-4 inline mr-1" /> Créer la Séance
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── SELECTED SESSION VIEW (Page dédiée) ─── */}
            {selectedSession && (
                <div className="fixed inset-0 z-[150] bg-white overflow-y-auto animate-in fade-in duration-200">
                    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSelectedSession(null)}
                                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <div>
                                <h2 className="font-black text-slate-800 text-lg">{selectedSession.label}</h2>
                                <p className="text-slate-500 text-xs">
                                    {articleName && <><strong className="text-indigo-600">{articleName}</strong> · </>}
                                    {new Date(selectedSession.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                    {selectedSession.gammeType && selectedSession.gammeType !== 'default' && (
                                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${selectedSession.gammeType === 'plantation' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {selectedSession.gammeType === 'plantation' ? 'Plantation' : 'Nouveau'}
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Total T.Maj</p>
                                <p className="font-black text-indigo-700 text-xl mt-1">{(selectedSession.totalTempMajore || 0).toFixed(2)} min</p>
                            </div>
                            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Opérations</p>
                                <p className="font-black text-emerald-700 text-xl mt-1">{Object.keys(selectedSession.entries).length}</p>
                            </div>
                            <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">Séance #</p>
                                <p className="font-black text-orange-700 text-xl mt-1">{sessions.findIndex(s => s.id === selectedSession.id) + 1} / {sessions.length}</p>
                            </div>
                            <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                                <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Ordre</p>
                                <p className="font-black text-purple-700 text-xl mt-1 capitalize">{selectedSession.orderSource || 'gamme'}</p>
                            </div>
                        </div>

                        {/* Bar Chart — Temps majoré par opération */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-5">
                            <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-indigo-500" /> Temps Majoré par Opération (min)
                            </h3>
                            {(() => {
                                const entries = Object.entries(selectedSession.entries);
                                if (entries.length === 0) return <p className="text-slate-400 text-sm">Aucune donnée</p>;
                                const maxVal = Math.max(...entries.map(([, e]) => e.tempMajore || 0), 0.1);
                                return (
                                    <div className="space-y-2">
                                        {entries.map(([opId, entry], idx) => {
                                            const name = selectedSession.opNames[opId] || `Op. ${idx + 1}`;
                                            const val = entry.tempMajore || 0;
                                            const pct = (val / maxVal) * 100;
                                            return (
                                                <div key={opId} className="flex items-center gap-3">
                                                    <span className="text-[10px] font-bold text-slate-500 w-6 text-right shrink-0">#{idx + 1}</span>
                                                    <span className="text-xs font-semibold text-slate-700 w-32 sm:w-48 truncate shrink-0" title={name}>{name}</span>
                                                    <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-500"
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-mono font-black text-indigo-700 w-16 text-right shrink-0">{val.toFixed(2)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Comparison Table with other sessions */}
                        {sessions.length > 1 && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100">
                                    <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-indigo-500" /> Comparaison avec les Autres Séances
                                    </h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                                <th className="py-2.5 px-3 text-left font-black sticky left-0 bg-slate-50 min-w-[140px]">Opération</th>
                                                {sessions.map((s, i) => (
                                                    <th key={s.id} className={`py-2.5 px-2 text-center font-bold min-w-[60px] ${s.id === selectedSession.id ? 'bg-indigo-50 text-indigo-700' : ''}`} title={s.label}>
                                                        #{i + 1}
                                                    </th>
                                                ))}
                                                <th className="py-2.5 px-2 text-center font-black text-indigo-700 bg-indigo-50/50 min-w-[60px]">Δ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredOperations.map(op => {
                                                const series = sessions.map(s => s.entries[op.id]?.tempMajore);
                                                const firstV = series.find(v => v !== undefined && v !== null);
                                                const lastDefined = [...series].reverse().find(v => v !== undefined && v !== null);
                                                const d = (typeof firstV === 'number' && typeof lastDefined === 'number') ? lastDefined - firstV : undefined;
                                                return (
                                                    <tr key={op.id} className={`hover:bg-slate-50/50 ${selectedSession.entries[op.id] ? 'bg-indigo-50/20' : ''}`}>
                                                        <td className="py-2 px-3 font-semibold text-slate-700 sticky left-0 bg-white truncate max-w-[140px]" title={op.description}>{op.description}</td>
                                                        {sessions.map((s, i) => {
                                                            const v = s.entries[op.id]?.tempMajore;
                                                            const isCurrent = s.id === selectedSession.id;
                                                            return (
                                                                <td key={i} className={`py-2 px-2 text-center font-mono ${isCurrent ? 'text-indigo-700 font-black bg-indigo-50/40' : 'text-slate-600'}`}>
                                                                    {typeof v === 'number' ? v.toFixed(2) : <span className="text-slate-300">—</span>}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="py-2 px-2 text-center font-mono font-black bg-indigo-50/30">
                                                            {typeof d === 'number'
                                                                ? <span className={d < 0 ? 'text-emerald-600' : d > 0 ? 'text-rose-600' : 'text-slate-400'}>{d > 0 ? '+' : ''}{d.toFixed(2)}</span>
                                                                : <span className="text-slate-300">—</span>}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}


        </div>
    );
}
