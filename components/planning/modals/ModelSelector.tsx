import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { ModelData, PlanningEvent, AppSettings } from '../../../types';
import { getClientColor } from '../shared/clientColors';
import { ChevronDown, Package, Zap, CheckCircle2, AlertCircle, AlertTriangle, Clock, Calendar, Search, X, ExternalLink } from 'lucide-react';
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';
import { addWorkingDaysFromLaunchIso, planningLocalDateKey } from '../../../utils/planning';

function getModelThumb(m: ModelData): string | null {
    return m.images?.front || m.image || null;
}

interface Props {
    models: ModelData[];
    value: string;
    onChange: (id: string) => void;
    label?: string;
    planningEvents?: PlanningEvent[];
    chainEfficiency?: number;
    /** Quantité de la commande — drives finish-date prediction. */
    quantity?: number;
    /** Deadline client (DDS) — drives on-time / risk / late status. */
    strictDeadline?: string;
    /** Start date du planning — base pour calculer la fin. */
    startDate?: string;
    /** Working hours per day. Default 8. */
    workingHoursPerDay?: number;
    /** Callback to open a model in Ingénierie view. */
    onOpenInIngenierie?: (modelId: string) => void;
    settings?: AppSettings;
    chainId?: string;
}

interface ProductionMetrics {
    samSeconds: number;       // SAM brut (sec/pièce)
    samFormatted: string;     // ex: "13:24"
    pcsPerHour: number;       // SAM (théorique 100%)
    pcsPerHourEff: number;    // pcsPerHour * efficiency
    pcsPerDay: number;        // pcsPerHourEff * workingHours
    minTotal: number;         // workingHours * 60 (capacité minute/jour)
    bfSeconds: number;        // Bottleneck factor — temps de l'opération goulot
    assemblageSec: number;
    finitionSec: number;
}

function computeMetrics(
    model: ModelData,
    chainEfficiency: number,
    workingHoursPerDay: number,
    settings?: AppSettings,
    chainId?: string
): ProductionMetrics {
    const sam = Number(model.meta_data?.total_temps) || 0; // in minutes
    const samSec = sam * 60;
    const ops = model.gamme_operatoire || [];

    let assemblage = 0;
    let finition = 0;
    let bf = 0;
    for (const op of ops) {
        const t = (Number(op.time) || 0) * 60; // Convert minutes to seconds
        if ((op.section || 'GLOBAL') === 'PREPARATION') finition += t;
        else assemblage += t;
        if (t > bf) bf = t;
    }

    const operators = (chainId && settings) ? (settings.chainOperators?.[chainId] ?? 30) : 30;
    const workMins = settings ? (
        (() => {
            const [sh, sm] = (settings.workingHoursStart || '08:00').split(':').map(Number);
            const [eh, em] = (settings.workingHoursEnd || '18:00').split(':').map(Number);
            const total = (eh * 60 + em) - (sh * 60 + sm);
            const pauses = (settings.pauses || []).reduce((acc, p) => acc + (p.durationMin || 0), 0);
            return total - pauses > 0 ? total - pauses : workingHoursPerDay * 60;
        })()
    ) : workingHoursPerDay * 60;

    const pcsPerHour = sam > 0 ? Math.round(((operators * 60) / sam) * 100) / 100 : 0;
    const eff = Math.max(0, Math.min(1, chainEfficiency));
    const pcsPerHourEff = Math.round(pcsPerHour * eff * 100) / 100;
    const pcsPerDay = sam > 0 ? Math.round((operators * workMins * eff) / sam) : 0;
    const minTotal = workMins;
    const mins = Math.floor(samSec / 60);
    const secs = Math.floor(samSec % 60);

    return {
        samSeconds: samSec,
        samFormatted: samSec > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : '—',
        pcsPerHour,
        pcsPerHourEff,
        pcsPerDay,
        minTotal,
        bfSeconds: bf,
        assemblageSec: assemblage,
        finitionSec: finition,
    };
}

interface Prediction {
    daysNeeded: number;
    finishDate: string;
    status: 'on_time' | 'at_risk' | 'late' | 'unknown';
    diffDays: number | null;
}

function predictFinish(metrics: ProductionMetrics, quantity: number, startYmd: string, settings?: AppSettings, deadlineYmd?: string): Prediction | null {
    if (metrics.pcsPerDay <= 0 || quantity <= 0) return null;
    const daysNeeded = Math.min(Math.ceil(quantity / metrics.pcsPerDay), 36500); // max 100 ans
    
    let finishYmd = '';
    let diffDays: number | null = null;
    let status: Prediction['status'] = 'unknown';

    if (settings) {
        const finishDate = addWorkingDaysFromLaunchIso(startYmd, daysNeeded, settings);
        finishYmd = planningLocalDateKey(finishDate);

        if (deadlineYmd) {
            const ddsDate = new Date(deadlineYmd);
            if (!isNaN(ddsDate.getTime())) {
                diffDays = Math.ceil((ddsDate.getTime() - finishDate.getTime()) / 86400000);
            }
        }
    } else {
        const start = new Date(startYmd || new Date().toISOString().split('T')[0]);
        if (isNaN(start.getTime())) start.setTime(Date.now());
        const finish = new Date(start);
        finish.setDate(finish.getDate() + daysNeeded);
        finishYmd = finish.toISOString().split('T')[0];

        if (deadlineYmd) {
            const ddsDate = new Date(deadlineYmd);
            if (!isNaN(ddsDate.getTime())) {
                diffDays = Math.ceil((ddsDate.getTime() - finish.getTime()) / 86400000);
            }
        }
    }

    if (diffDays !== null) {
        if (diffDays < 0) status = 'late';
        else if (diffDays < 3) status = 'at_risk';
        else status = 'on_time';
    }

    return { daysNeeded, finishDate: finishYmd, status, diffDays };
}

function formatTime(seconds: number): string {
    if (seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
}

export default function ModelSelector({
    models, value, onChange, label = '',
    planningEvents = [], chainEfficiency = 0.85,
    quantity = 0, strictDeadline, startDate,
    workingHoursPerDay = 8, onOpenInIngenierie,
    settings, chainId,
}: Props) {
    const { lang } = useLang();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'default' | 'name-asc' | 'name-desc' | 'sam-asc' | 'sam-desc' | 'client' | 'pcs-desc'>('default');
    const [showSortMenu, setShowSortMenu] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const sortMenuRef = useRef<HTMLDivElement>(null);

    const selected = models.find(m => m.id === value);
    const selectedThumb = selected ? getModelThumb(selected) : null;
    const selectedColor = selected ? getClientColor(selected.ficheData?.client) : '#64748B';

    const filtered = useMemo(() => {
        let result = models;

        // Apply search filter
        const q = search.toLowerCase().trim();
        if (q) {
            result = result.filter(m => {
                const name = (m.meta_data?.nom_modele || '').toLowerCase();
                const client = (m.ficheData?.client || '').toLowerCase();
                const ref = (m.meta_data?.reference || '').toLowerCase();
                return name.includes(q) || client.includes(q) || ref.includes(q);
            });
        }

        // Apply sorting
        const sorted = [...result];
        switch (sortBy) {
            case 'name-asc':
                sorted.sort((a, b) => (a.meta_data?.nom_modele || '').localeCompare(b.meta_data?.nom_modele || ''));
                break;
            case 'name-desc':
                sorted.sort((a, b) => (b.meta_data?.nom_modele || '').localeCompare(a.meta_data?.nom_modele || ''));
                break;
            case 'client':
                sorted.sort((a, b) => (a.ficheData?.client || '').localeCompare(b.ficheData?.client || ''));
                break;
            case 'sam-asc':
                sorted.sort((a, b) => {
                    const samA = Number(a.meta_data?.total_temps) || 0;
                    const samB = Number(b.meta_data?.total_temps) || 0;
                    return samA - samB;
                });
                break;
            case 'sam-desc':
                sorted.sort((a, b) => {
                    const samA = Number(a.meta_data?.total_temps) || 0;
                    const samB = Number(b.meta_data?.total_temps) || 0;
                    return samB - samA;
                });
                break;
            case 'pcs-desc':
                sorted.sort((a, b) => {
                    const samA = Number(a.meta_data?.total_temps) || 0;
                    const samB = Number(b.meta_data?.total_temps) || 0;
                    const metricsA = computeMetrics(a, chainEfficiency, workingHoursPerDay, settings, chainId);
                    const metricsB = computeMetrics(b, chainEfficiency, workingHoursPerDay, settings, chainId);
                    return metricsB.pcsPerDay - metricsA.pcsPerDay;
                });
                break;
            case 'default':
            default:
                // Keep original order
                break;
        }

        return sorted;
    }, [models, search, sortBy, chainEfficiency, workingHoursPerDay, settings, chainId]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    useEffect(() => {
        if (!showSortMenu) return;
        const onDoc = (e: MouseEvent) => {
            if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setShowSortMenu(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [showSortMenu]);

    const handleSelect = (id: string) => {
        onChange(id);
        setOpen(false);
        setSearch('');
    };

    const metrics = selected ? computeMetrics(selected, chainEfficiency, workingHoursPerDay, settings, chainId) : null;
    const prediction = (() => {
        if (!selected || !metrics) return null;
        try {
            const sd = (startDate || '').replace(/[^0-9\-]/g, '') || new Date().toISOString().split('T')[0];
            const dl = (strictDeadline || '').replace(/[^0-9\-]/g, '') || undefined;
            return predictFinish(metrics, quantity, sd, settings, dl);
        } catch { return null; }
    })();

    return (
        <div ref={containerRef} className="relative">
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">{label || tx(lang, {fr:'Modèle',ar:'نموذج',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})}</label>

            {/* Trigger */}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full h-11 px-3 flex items-center gap-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-left"
            >
                {selected ? (
                    <>
                        {selectedThumb ? (
                            <img src={selectedThumb} alt="" className="w-8 h-8 rounded-md object-cover border border-slate-200 shrink-0" />
                        ) : (
                            <div className="w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: selectedColor }}>
                                {(selected.ficheData?.client || '?')[0].toUpperCase()}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-slate-900 truncate leading-tight">
                                {selected.meta_data?.nom_modele || selected.id}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                                {selected.ficheData?.client || '—'}
                            </div>
                        </div>
                    </>
                ) : (
                    <span className="text-[13px] text-slate-400 flex-1">— Choisir un modèle —</span>
                )}
                <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute z-50 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
                        <div className="flex-1 relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Rechercher…"
                                className="w-full h-8 pl-8 pr-7 text-[12px] bg-white border border-slate-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                                autoFocus
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700"
                                    aria-label="Effacer"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        <div className="relative" ref={sortMenuRef}>
                            <button
                                type="button"
                                onClick={() => setShowSortMenu(v => !v)}
                                className="px-2.5 py-1.5 h-8 flex items-center gap-1.5 bg-white border border-slate-200 rounded-md hover:border-slate-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-[11px] font-medium text-slate-600 whitespace-nowrap shrink-0"
                                title={tx(lang, {fr:'Trier les modèles',ar:'ترتيب النماذج',en:'Sort models',es:'Ordenar modelos',pt:'Ordenar modelos',tr:'Modelleri sırala'})}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                                Trier
                            </button>
                            {showSortMenu && (
                                <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-md overflow-hidden z-50 w-48">
                                    <button
                                        type="button"
                                        onClick={() => { setSortBy('default'); setShowSortMenu(false); }}
                                        className={`w-full px-3 py-2 text-left text-[12px] hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                                            sortBy === 'default' ? 'bg-indigo-50 text-indigo-700 font-medium' : ''
                                        }`}
                                    >
                                        {sortBy === 'default' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        Par défaut
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setSortBy('name-asc'); setShowSortMenu(false); }}
                                        className={`w-full px-3 py-2 text-left text-[12px] hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                                            sortBy === 'name-asc' ? 'bg-indigo-50 text-indigo-700 font-medium' : ''
                                        }`}
                                    >
                                        {sortBy === 'name-asc' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        Nom (A-Z)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setSortBy('name-desc'); setShowSortMenu(false); }}
                                        className={`w-full px-3 py-2 text-left text-[12px] hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                                            sortBy === 'name-desc' ? 'bg-indigo-50 text-indigo-700 font-medium' : ''
                                        }`}
                                    >
                                        {sortBy === 'name-desc' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        Nom (Z-A)
                                    </button>
                                    <div className="border-t border-slate-100" />
                                    <button
                                        type="button"
                                        onClick={() => { setSortBy('sam-asc'); setShowSortMenu(false); }}
                                        className={`w-full px-3 py-2 text-left text-[12px] hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                                            sortBy === 'sam-asc' ? 'bg-indigo-50 text-indigo-700 font-medium' : ''
                                        }`}
                                    >
                                        {sortBy === 'sam-asc' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        SAM (rapide)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setSortBy('sam-desc'); setShowSortMenu(false); }}
                                        className={`w-full px-3 py-2 text-left text-[12px] hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                                            sortBy === 'sam-desc' ? 'bg-indigo-50 text-indigo-700 font-medium' : ''
                                        }`}
                                    >
                                        {sortBy === 'sam-desc' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        SAM (lent)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setSortBy('pcs-desc'); setShowSortMenu(false); }}
                                        className={`w-full px-3 py-2 text-left text-[12px] hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                                            sortBy === 'pcs-desc' ? 'bg-indigo-50 text-indigo-700 font-medium' : ''
                                        }`}
                                    >
                                        {sortBy === 'pcs-desc' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        Productivité (↓)
                                    </button>
                                    <div className="border-t border-slate-100" />
                                    <button
                                        type="button"
                                        onClick={() => { setSortBy('client'); setShowSortMenu(false); }}
                                        className={`w-full px-3 py-2 text-left text-[12px] hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                                            sortBy === 'client' ? 'bg-indigo-50 text-indigo-700 font-medium' : ''
                                        }`}
                                    >
                                        {sortBy === 'client' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        Par client
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
                        {filtered.length === 0 ? (
                            <div className="px-4 py-10 text-center text-[12px] text-slate-400">
                                <Package className="w-7 h-7 mx-auto mb-2 opacity-30" />
                                Aucun modèle trouvé
                            </div>
                        ) : (
                            filtered.map(m => {
                                const mThumb = getModelThumb(m);
                                const mColor = getClientColor(m.ficheData?.client);
                                const isSelected = m.id === value;
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => handleSelect(m.id)}
                                        className={`w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors ${
                                            isSelected ? 'bg-indigo-50/70' : ''
                                        }`}
                                    >
                                        {mThumb ? (
                                            <img src={mThumb} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: mColor }}>
                                                {(m.ficheData?.client || '?')[0].toUpperCase()}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[12px] font-medium text-slate-900 truncate">
                                                {m.meta_data?.nom_modele || m.id}
                                            </div>
                                            <div className="text-[10px] text-slate-500 truncate">
                                                {m.ficheData?.client || '—'}
                                                {m.meta_data?.reference && ` · ${m.meta_data.reference}`}
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
                                                <CheckCircle2 className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                        {onOpenInIngenierie && (
                                            <div
                                                role="button"
                                                title={tx(lang, {fr:'Ouvrir dans Ingénierie',ar:'فتح في الهندسة',en:'Open in Engineering',es:'Abrir en Ingeniería',pt:'Abrir na Engenharia',tr:'Mühendislikte aç'})}
                                                onClick={(e) => { e.stopPropagation(); onOpenInIngenierie(m.id); }}
                                                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors shrink-0"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* Inline detail panel — appears only when a model is selected */}
            {selected && metrics && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white overflow-hidden">
                    {/* Production stat bar (FicheTechnique style) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100">
                        <StatCell label="BF (s)" value={metrics.bfSeconds.toFixed(1)} accent="emerald" hint="Bottleneck" />
                        <StatCell label="Min Tot." value={String(metrics.minTotal)} accent="emerald" hint={`${workingHoursPerDay}h/j`} />
                        <StatCell label="P/H" value={String(metrics.pcsPerHourEff)} accent="indigo" hint={`100% : ${metrics.pcsPerHour}`} />
                        <StatCell label="P/J" value={String(metrics.pcsPerDay)} accent="indigo" hint={`η ${Math.round(chainEfficiency * 100)}%`} />
                    </div>

                    {/* Temps breakdown + SAM */}
                    {metrics.samSeconds > 0 && (
                        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-4 text-[11px]">
                            <div className="flex items-center gap-1.5 text-slate-500">
                                <Clock className="w-3.5 h-3.5" />
                                <span className="uppercase tracking-wider font-medium">Temps</span>
                            </div>
                            <div className="flex items-center gap-4 tabular-nums">
                                <span className="text-slate-600">Assemblage <span className="font-semibold text-slate-900">{formatTime(metrics.assemblageSec)}</span></span>
                                <span className="text-slate-600">Finition <span className="font-semibold text-slate-900">{formatTime(metrics.finitionSec)}</span></span>
                                <span className="text-slate-700 font-medium">SAM <span className="font-bold text-slate-900">{metrics.samFormatted}</span></span>
                            </div>
                        </div>
                    )}

                    {/* Prediction — only with quantity */}
                    {prediction && (
                        <PredictionRow prediction={prediction} quantity={quantity} pcsPerDay={metrics.pcsPerDay} />
                    )}
                    {!prediction && quantity > 0 && metrics.samSeconds <= 0 && (
                        <div className="px-4 py-3 border-t border-slate-100 text-[11px] text-amber-700 bg-amber-50/40 flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            SAM non défini sur ce modèle — impossible de calculer la date de fin.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function StatCell({
    label, value, accent, hint,
}: { label: string; value: string; accent: 'indigo' | 'emerald'; hint?: string }) {
    const cls = accent === 'indigo'
        ? 'bg-indigo-50/40 text-indigo-700'
        : 'bg-emerald-50/40 text-emerald-700';
    const hintCls = accent === 'indigo' ? 'text-indigo-500/80' : 'text-emerald-600/80';
    return (
        <div className={`px-3 py-2.5 ${cls}`}>
            <div className={`text-[9px] font-bold uppercase tracking-wider ${hintCls}`}>{label}</div>
            <div className="text-[18px] font-bold tabular-nums leading-tight">{value}</div>
            {hint && <div className={`text-[9px] mt-0.5 ${hintCls} tabular-nums`}>{hint}</div>}
        </div>
    );
}

function PredictionRow({
    prediction, quantity, pcsPerDay,
}: { prediction: Prediction; quantity: number; pcsPerDay: number }) {
    const { lang } = useLang();
    const { daysNeeded, finishDate, status, diffDays } = prediction;
    const config = {
        on_time: { cls: 'bg-emerald-50/60 text-emerald-700 border-emerald-200', icon: CheckCircle2, label: tx(lang, {fr:'Dans les délais',ar:'في الموعد',en:'On time',es:'A tiempo',pt:'No prazo',tr:'Zamanında'}) },
        at_risk: { cls: 'bg-amber-50/60 text-amber-700 border-amber-200', icon: AlertCircle, label: 'Risque de retard' },
        late: { cls: 'bg-red-50/60 text-red-700 border-red-200', icon: AlertTriangle, label: 'En retard' },
        unknown: { cls: 'bg-slate-50 text-slate-700 border-slate-200', icon: Calendar, label: tx(lang, {fr:'Prévision',ar:'توقع',en:'Forecast',es:'Previsión',pt:'Previsão',tr:'Tahmin'}) },
    }[status];
    const Icon = config.icon;
    return (
        <div className={`px-4 py-3 border-t border-slate-100 ${config.cls}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
                    <Icon className="w-3.5 h-3.5" />
                    {config.label}
                </div>
                <div className="text-[11px] tabular-nums">
                    <span className="opacity-70">Fin : </span>
                    <span className="font-bold">{finishDate}</span>
                    <span className="opacity-60"> · {daysNeeded}j à {pcsPerDay} pcs/j</span>
                </div>
            </div>
            {diffDays !== null && status !== 'unknown' && (
                <div className="text-[10px] mt-1 opacity-80 tabular-nums">
                    {diffDays >= 0
                        ? `+${diffDays} jour${diffDays > 1 ? 's' : ''} de marge avant DDS`
                        : `${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? 's' : ''} après DDS`}
                </div>
            )}
            {status === 'unknown' && quantity > 0 && (
                <div className="text-[10px] mt-1 opacity-70">
                    Renseignez la DDS pour comparer avec la deadline.
                </div>
            )}
        </div>
    );
}
