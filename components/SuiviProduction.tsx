import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as animeLib from 'animejs';
const anime: any = (animeLib as any).default ?? animeLib;
import {
    animateCardEntrance, animateCountUp, animateProgressBar,
    animateTableRows, animateHeader, animateKpiCards,
} from './SuiviAnimeUtils';
import { ModelData, SuiviData, AppSettings, PlanningEvent, PosteSuiviData, Machine, EffectifRoleTagKey } from '../types';
import SuiviEffectifsModal from './SuiviEffectifsModal';
import ModelOfJournalierSummary from './ModelOfJournalierSummary';
import { resolveSuiviContext, alignHourKeyToGrid } from '../lib/suiviContextResolver';
import { suggestSimilarModelsForTemps, mean } from '../lib/suggestionTempsCatalogue';
import {
    Activity, Printer, PackageCheck, Plus, Trash2, CalendarDays, Box, Target,
    AlertTriangle, ShieldAlert, Timer, CheckCircle2, Factory, Filter, Settings2,
    Image as ImageIcon, ChevronLeft, ChevronDown, Calendar, Info, Scissors, PenTool, CheckCircle, Clock, Layers,
    Search, GitMerge, Palette, Table2, LayoutGrid,
} from 'lucide-react';

interface SuiviProductionProps {
    models: ModelData[];
    suivis: SuiviData[];
    setSuivis: React.Dispatch<React.SetStateAction<SuiviData[]>>;
    planningEvents?: PlanningEvent[];
    settings: AppSettings;
    directModelId?: string | null;
    clearDirectModel?: () => void;
    machines?: Machine[];
}

type ProdType = 'INGENIERIE' | 'COUPE' | 'PLANNING' | 'ATELIER';

type FilterStatus = 'tous' | 'en_cours' | 'termine' | 'en_attente';

interface ProdItem {
    id: string; // plan.id or model.id
    type: ProdType;
    model: ModelData;
    plan?: PlanningEvent;
    events: SuiviData[];
    targetQuantity: number;
    totalProduced: number;
    missingItems: string[];
}

const KISBA_LABELS: Record<string, string> = {
    COUPE: 'Coupé',
    EN_COURS: 'En cours',
    NON_LANCE: 'Non lancé',
    AUTRE: 'Autre',
};

const EFFECTIF_ROLE_KEYS: EffectifRoleTagKey[] = ['chaf', 'recta', 'sujet', 'transp', 'man', 'sp', 'stager'];

const EFFECTIF_SHORT: Record<EffectifRoleTagKey, string> = {
    chaf: 'CH',
    recta: 'RC',
    sujet: 'SJ',
    transp: 'TR',
    man: 'MN',
    sp: 'SP',
    stager: 'ST',
};

const HALA_LABELS: Record<string, string> = {
    EN_COURS: 'En cours',
    TERMINE: 'Terminé',
    EN_ATTENTE: 'En attente',
    BLOQUE: 'Bloqué',
};

function labelKisba(v?: string) {
    if (!v) return '—';
    return KISBA_LABELS[v] || v;
}

function labelHala(v?: string) {
    if (!v) return '—';
    return HALA_LABELS[v] || v;
}

/** Pastille couleur stable à partir d’une clé (nom / id couleur). */
function swatchColorFromSeed(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 3)) % 360;
    return `hsl(${h} 52% 48%)`;
}

/** Fond cellule M.R (efficacité %), proche logique feuille atelier. */
function mrCellTone(mr: number): string {
    if (mr === 0) return 'bg-slate-50 text-slate-500 font-bold';
    if (mr >= 100) return 'bg-emerald-200/90 text-emerald-950 font-black';
    if (mr >= 90) return 'bg-amber-50 text-amber-950 font-black';
    return 'bg-rose-100 text-rose-950 font-black';
}

function GammeBoundsStrip({ model }: { model: ModelData }) {
    const ops = [...(model.gamme_operatoire || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const first = ops[0];
    const last = ops.length > 1 ? ops[ops.length - 1] : null;
    if (!first) return null;
    return (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 text-xs text-indigo-950">
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-600 mb-1">Gamme — entrée / sortie</div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 items-baseline">
                <span className="font-bold text-slate-700 shrink-0">Entrée</span>
                <span className="text-slate-800 min-w-0">
                    {(first.description || '—').trim()}
                    {first.machineName ? <span className="text-slate-500 font-medium"> · {first.machineName}</span> : null}
                </span>
                {last && last.id !== first.id && (
                    <>
                        <span className="text-indigo-300 font-black">→</span>
                        <span className="font-bold text-slate-700 shrink-0">Sortie</span>
                        <span className="text-slate-800 min-w-0">
                            {(last.description || '—').trim()}
                            {last.machineName ? <span className="text-slate-500 font-medium"> · {last.machineName}</span> : null}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}

function getModelThumbUrl(m: ModelData): string | null {
    const front = m.images?.front;
    if (front) return front;
    if (m.image) return m.image;
    const pu = m.meta_data?.photo_url;
    return pu?.trim() ? pu.trim() : null;
}

function getFrenchWeekday(dateStr: string): string {
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '—';
    return days[d.getDay()] || '—';
}

/** Créneau horaire actuel — même style partout (barre titre liste + en-tête fiche). */
function SuiviCurrentHourBadge({ label }: { label: string }) {
    return (
        <div
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-xl text-sm font-black shadow-lg shadow-slate-900/20 ring-1 ring-white/10 shrink-0 tabular-nums"
            title="Heure actuelle (créneau)"
        >
            <Clock className="w-4 h-4 text-amber-400 animate-pulse shrink-0" aria-hidden />
            {label}
        </div>
    );
}

type SuiviModelHeaderProps = {
    model: ModelData | null;
    planningEvent: PlanningEvent | null;
    currentHourLabel: string;
    /** Base time from gamme (minutes) — used if meta total_temps missing */
    baseTimeMinutes: number;
    variant: 'list' | 'detail';
    onBack?: () => void;
    chainLabel?: string;
    superviseur?: string;
    rightSlot?: React.ReactNode;
    /** Faux en vue liste si l’heure est affichée sur la ligne du titre (évite doublon). */
    showHourBadge?: boolean;
};

function SuiviModelHeader({
    model,
    planningEvent,
    currentHourLabel,
    baseTimeMinutes,
    variant,
    onBack,
    chainLabel,
    superviseur,
    rightSlot,
    showHourBadge = true,
}: SuiviModelHeaderProps) {
    const front = model?.images?.front || model?.image;
    const back = model?.images?.back;
    const meta = model?.meta_data;
    const qte = planningEvent?.qteTotal ?? (meta?.quantity != null ? Number(meta.quantity) : null);
    const totalTemps = meta?.total_temps != null && !Number.isNaN(Number(meta.total_temps))
        ? Number(meta.total_temps)
        : baseTimeMinutes;

    if (!model) {
        return (
            <div className="relative overflow-hidden rounded-3xl border border-indigo-100/50 bg-gradient-to-br from-white/80 to-indigo-50/30 backdrop-blur-xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-indigo-400/10 rounded-full blur-3xl"></div>
                <div className="flex items-start gap-5 relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/60 shadow-inner flex items-center justify-center shrink-0">
                        <ImageIcon className="w-7 h-7 text-slate-300" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <h3 className="text-lg font-black text-slate-800 tracking-tight">Aucun modèle sélectionné</h3>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-md">
                            Choisissez un modèle dans le filtre ou le modèle actif (planning <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">En cours</span>) s’affichera ici.
                        </p>
                    </div>
                </div>
                {showHourBadge ? (
                    <div className="relative z-10 shrink-0">
                        <span className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-black shadow-lg shadow-orange-500/20 ring-1 ring-white/20">
                            <Clock className="w-4 h-4 animate-pulse" /> {currentHourLabel}
                        </span>
                    </div>
                ) : null}
            </div>
        );
    }

    const hala = meta?.hala;
    const halaClass =
        hala === 'EN_COURS' ? 'text-emerald-700 bg-emerald-50/80 border-emerald-200/60' :
        hala === 'TERMINE' ? 'text-slate-700 bg-slate-50/80 border-slate-200/60' :
        hala === 'BLOQUE' ? 'text-rose-700 bg-rose-50/80 border-rose-200/60' :
        hala ? 'text-amber-700 bg-amber-50/80 border-amber-200/60' : 'text-slate-700 bg-slate-50/80 border-slate-200/60';

    const cellQte = qte != null && !Number.isNaN(Number(qte)) ? String(qte) : '—';
    const cellTemps = totalTemps > 0 ? String(Math.round(totalTemps * 100) / 100) : '—';

    return (
        <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-white/90 via-white/50 to-indigo-50/30 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-5 sm:p-6 flex flex-col gap-5 sm:flex-row sm:items-stretch sm:justify-between transition-all duration-500 hover:shadow-[0_8px_40px_rgb(79,70,229,0.08)]">
            <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex gap-4 sm:gap-6 min-w-0 flex-1 relative z-10">
                {variant === 'detail' && onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="p-2.5 h-fit bg-white/80 backdrop-blur border border-slate-200/60 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all shadow-sm text-slate-500 hover:text-indigo-600 hover:scale-105 shrink-0 group"
                    >
                        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                )}
                <div className="flex flex-col sm:flex-row gap-5 min-w-0 flex-1">
                    <div className="flex gap-3 shrink-0">
                        <div className="relative w-24 h-24 sm:w-28 sm:h-28 group">
                            {front ? (
                                <img src={front} alt="" className="w-full h-full rounded-2xl object-cover border border-slate-200/60 shadow-md group-hover:shadow-xl transition-all duration-500" />
                            ) : (
                                <div className="w-full h-full rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/60 shadow-inner flex items-center justify-center">
                                    <ImageIcon className="w-8 h-8 text-slate-300" />
                                </div>
                            )}
                            {back && (
                                <img
                                    src={back}
                                    alt=""
                                    className="absolute -bottom-2 -right-2 w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border-2 border-white shadow-lg group-hover:scale-110 transition-transform duration-300"
                                    title="Dos"
                                />
                            )}
                        </div>
                    </div>
                    <div className="min-w-0 flex-1 grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                        <div className="rounded-2xl border border-white/60 bg-white/40 backdrop-blur-md px-4 py-3 shadow-sm min-w-0 flex flex-col justify-center">
                            <div className="text-[10px] font-black text-indigo-500/80 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                                <Layers className="w-3 h-3" /> Modèle
                            </div>
                            <div className="text-base font-black text-slate-800 line-clamp-2 leading-tight" title={meta?.nom_modele || ''}>
                                {meta?.nom_modele || '—'}
                            </div>
                            {(variant === 'detail' || variant === 'list') && (chainLabel || superviseur) && (
                                <div className="text-[10px] font-bold text-slate-500 mt-2 flex flex-wrap gap-1.5 items-center">
                                    {chainLabel && (
                                        <span className="uppercase tracking-wider bg-indigo-100/50 text-indigo-700 rounded-md px-2 py-0.5 border border-indigo-200/50 shadow-sm">{chainLabel}</span>
                                    )}
                                    {superviseur && <span className="text-slate-400">{chainLabel ? '• ' : ''}{superviseur}</span>}
                                </div>
                            )}
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/40 backdrop-blur-md px-4 py-3 shadow-sm flex flex-col justify-center relative overflow-hidden group">
                            <div className="absolute right-0 top-0 w-16 h-16 bg-gradient-to-bl from-sky-400/10 to-transparent rounded-bl-3xl"></div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest relative z-10">Quantité</span>
                            <p className="text-xl font-black text-slate-800 mt-0.5 tabular-nums relative z-10">{cellQte}</p>
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/40 backdrop-blur-md px-4 py-3 shadow-sm flex flex-col justify-center relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-16 h-16 bg-gradient-to-bl from-indigo-400/10 to-transparent rounded-bl-3xl"></div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest relative z-10">Temps (min)</span>
                            <p className="text-xl font-black text-slate-800 mt-0.5 tabular-nums relative z-10">{cellTemps}</p>
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/40 backdrop-blur-md px-4 py-3 shadow-sm min-w-0 flex flex-col justify-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Todm</span>
                            <p className="text-sm font-black text-indigo-600 mt-0.5 truncate bg-indigo-50/50 px-2 py-0.5 rounded-md w-fit border border-indigo-100/50">{meta?.todm?.trim() || '—'}</p>
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/40 backdrop-blur-md px-4 py-3 shadow-sm flex flex-col justify-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kisba</span>
                            <p className="text-sm font-black text-sky-700 mt-0.5">{labelKisba(meta?.kisba)}</p>
                        </div>
                        <div className={`rounded-2xl border backdrop-blur-md px-4 py-3 min-w-0 flex flex-col justify-center shadow-sm ${halaClass}`}>
                            <span className="text-[10px] font-black opacity-70 uppercase tracking-widest">Hala</span>
                            <p className="text-sm font-black mt-0.5 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                                {labelHala(hala)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            {(showHourBadge || rightSlot) ? (
                <div className="flex flex-col items-stretch sm:items-end gap-3 shrink-0 relative z-10 justify-between">
                    {showHourBadge ? <SuiviCurrentHourBadge label={currentHourLabel} /> : null}
                    {rightSlot}
                </div>
            ) : null}
        </div>
    );
}

export default function SuiviProduction({
    models, suivis = [], setSuivis, planningEvents = [], settings, directModelId, clearDirectModel, machines = []
}: SuiviProductionProps) {
    // States
    const [filterChaine, setFilterChaine] = useState<string>('ALL');
    const [filterModele, setFilterModele] = useState<string>('ALL');
    const [selectedProdId, setSelectedProdId] = useState<string | null>(null);
    const [modelPickerOpen, setModelPickerOpen] = useState(false);
    const modelPickerRef = useRef<HTMLDivElement>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('tous');
    const todayStr = () => new Date().toISOString().split('T')[0];
    const [contextDate, setContextDate] = useState<string>(todayStr);
    const [userOverrodeContextSuggestion, setUserOverrodeContextSuggestion] = useState(false);
    const [lockedContext, setLockedContext] = useState<{ planningId: string; date: string } | null>(null);
    const [posteSuiviRows, setPosteSuiviRows] = useState<PosteSuiviData[]>([]);
    const [posteSuiviStatus, setPosteSuiviStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle');
    const [posteSuiviDraft, setPosteSuiviDraft] = useState<Record<string, Partial<PosteSuiviData>>>({});
    const [effectifsModalSuiviId, setEffectifsModalSuiviId] = useState<string | null>(null);
    const [suiviListTab, setSuiviListTab] = useState<'module' | 'gamme'>('module');
    const [gammePosteCache, setGammePosteCache] = useState<PosteSuiviData[]>([]);
    const [gammePosteStatus, setGammePosteStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle');
    const [gammeDraft, setGammeDraft] = useState<Record<string, Partial<PosteSuiviData>>>({});

    // ── Anime.js refs ──────────────────────────────────────────────────────────
    const cardsGridRef = useRef<HTMLDivElement>(null);
    const headerBarRef = useRef<HTMLDivElement>(null);
    const detailHeaderRef = useRef<HTMLDivElement>(null);
    const kpiRowRef = useRef<HTMLDivElement>(null);;

    // Current hour sync (refresh every 60s)
    const computeHourKey = () => {
        const h = new Date().getHours().toString().padStart(2, '0');
        return `h${h}00`;
    };
    const [currentHourKey, setCurrentHourKey] = useState<string>(computeHourKey);
    const [currentHourLabel, setCurrentHourLabel] = useState<string>(() => {
        const h = new Date().getHours().toString().padStart(2, '0');
        return `${h}:00`;
    });
    useEffect(() => {
        const tick = () => {
            const h = new Date().getHours().toString().padStart(2, '0');
            setCurrentHourKey(`h${h}00`);
            setCurrentHourLabel(`${h}:00`);
        };
        tick();
        const id = setInterval(tick, 60_000);
        return () => clearInterval(id);
    }, []);

    // PHASE 6 — auto-preselect when coming from Library
    useEffect(() => {
        if (!directModelId) return;
        const plan = planningEvents.find(p => p.modelId === directModelId);
        if (plan) {
            setFilterChaine(plan.chaineId);
            setSelectedProdId(plan.id);
        } else {
            setSelectedProdId(directModelId);
        }
        clearDirectModel?.();
    }, [directModelId]);

    useEffect(() => {
        if (!modelPickerOpen) return;
        const close = (e: MouseEvent) => {
            if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
                setModelPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [modelPickerOpen]);

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

    const resolvedHourKey = useMemo(
        () => alignHourKeyToGrid(currentHourKey, HOUR_KEYS) ?? currentHourKey,
        [currentHourKey, HOUR_KEYS],
    );

    /** Libellé du créneau grille aligné sur les paramètres (plages / pauses), pas l’heure système brute */
    const resolvedHourLabel = useMemo(() => {
        const m = /^h(\d{2})(\d{2})$/.exec(resolvedHourKey);
        if (!m) return currentHourLabel;
        return `${m[1]}:${m[2]}`;
    }, [resolvedHourKey, currentHourLabel]);

    const contextResolution = useMemo(
        () =>
            resolveSuiviContext({
                contextDate,
                hourKey: resolvedHourKey,
                suivis,
                planningEvents,
                filterChaine,
                filterModele,
            }),
        [contextDate, resolvedHourKey, suivis, planningEvents, filterChaine, filterModele],
    );

    useEffect(() => {
        if (!lockedContext) return;
        const plan = planningEvents.find(p => p.id === lockedContext.planningId);
        if (!plan) return;
        if (plan.chaineId) setFilterChaine(plan.chaineId);
        if (plan.modelId) setFilterModele(plan.modelId);
    }, [lockedContext, planningEvents]);

    useEffect(() => {
        if (userOverrodeContextSuggestion || lockedContext) return;
        if (directModelId) return;
        const { suggestedPlanningIds, suggestedChaineId, conflict } = contextResolution;
        if (conflict || suggestedPlanningIds.length !== 1) return;
        const pid = suggestedPlanningIds[0];
        const plan = planningEvents.find(p => p.id === pid);
        if (!plan) return;
        if (plan.chaineId) setFilterChaine(plan.chaineId);
        if (plan.modelId) setFilterModele(plan.modelId);
    }, [contextResolution, userOverrodeContextSuggestion, lockedContext, directModelId, planningEvents]);

    const allChains = useMemo(() => {
        const count = Math.max(1, settings.chainsCount ?? 12);
        const fromSettings = Array.from({ length: count }, (_, i) => `CHAINE ${i + 1}`);
        const seen = new Set(fromSettings);
        const extras: string[] = [];
        planningEvents.forEach(p => {
            if (p.chaineId && !seen.has(p.chaineId)) {
                seen.add(p.chaineId);
                extras.push(p.chaineId);
            }
        });
        extras.sort((a, b) => a.localeCompare(b, 'fr'));
        return [...fromSettings, ...extras];
    }, [planningEvents, settings.chainsCount]);

    /** Tous les modèles du programme (Bibliothèque), avec vignette pour le sélecteur */
    const allModelsList = useMemo(() => {
        return models
            .map(m => ({
                id: m.id,
                name: (m.meta_data?.nom_modele || m.filename || m.id).trim() || m.id,
                thumb: getModelThumbUrl(m),
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }, [models]);

    const selectedModelSummary = useMemo(
        () => (filterModele === 'ALL' ? null : allModelsList.find(x => x.id === filterModele) ?? null),
        [filterModele, allModelsList],
    );

    useEffect(() => {
        if (filterModele === 'ALL') return;
        if (!models.some(m => m.id === filterModele)) {
            setFilterModele('ALL');
        }
    }, [models, filterModele]);

    // Gather active productions for the cards view (ALL STAGES)
    const activeProductions = useMemo(() => {
        const prods: ProdItem[] = [];
        
        models.forEach(model => {
            if (model.workflowStatus === 'EXPORT') return;

            const openPlans = planningEvents.filter(p => p.modelId === model.id && p.status !== 'DONE');
            const historicPlans = planningEvents.filter(
                p => p.modelId === model.id && p.status === 'DONE' && suivis.some(s => s.planningId === p.id),
            );
            const modelPlans = [...openPlans, ...historicPlans.filter(h => !openPlans.some(o => o.id === h.id))];

            // Modèle NEW sans aucun OF (ni ouvert ni historique saisi) : masqué
            if ((!model.workflowStatus || model.workflowStatus === 'NEW') && modelPlans.length === 0) return;

            if (modelPlans.length > 0) {
                // Models with Planning/Atelier Events
                modelPlans.forEach(plan => {
                    if (filterChaine !== 'ALL' && plan.chaineId !== filterChaine) return;

                    const modelSuivis = suivis.filter(s => s.planningId === plan.id);
                    modelSuivis.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                    const targetQuantity = plan.qteTotal || Number(model.meta_data.quantity) || 1;
                    const totalProduced = modelSuivis.reduce((acc, s) => acc + s.totalHeure, 0);

                    const missingItems = [];
                    if (!model.images?.front) missingItems.push("Image modèle manquante");
                    if (!model.gamme_operatoire?.length) missingItems.push("Gamme opératoire non définie");
                    
                    const isStarted = modelSuivis.length > 0;
                    if (targetQuantity > totalProduced) {
                         if (!isStarted) missingItems.push("En attente de démarrage (Production)");
                         else missingItems.push(`Reste ${targetQuantity - totalProduced} pcs à produire`);
                    }

                    prods.push({
                        id: plan.id,
                        plan,
                        model,
                        events: modelSuivis,
                        targetQuantity,
                        totalProduced,
                        missingItems,
                        type: isStarted ? 'ATELIER' : 'PLANNING'
                    });
                });
            } else {
                // Models in INGENIERIE or COUPE
                if (filterChaine !== 'ALL') return; // If filtered by chain, hide these as they don't have chains

                const missingItems = [];
                if (!model.images?.front) missingItems.push("Image modèle manquante");
                if (!model.gamme_operatoire?.length) missingItems.push("Gamme opératoire non définie");
                if (!model.meta_data.quantity) missingItems.push("Quantité non spécifiée");
                
                if (model.workflowStatus === 'COUPE') missingItems.push("En attente: Finalisation de la Coupe");
                if (model.workflowStatus === 'INGENIERIE') missingItems.push("En attente: Validation Bureau d'Études");

                const targetQuantity = Number(model.meta_data.quantity) || 0;

                prods.push({
                    id: model.id,
                    model,
                    events: [],
                    targetQuantity,
                    totalProduced: 0,
                    missingItems,
                    type: model.workflowStatus as ProdType
                });
            }
        });

        return prods.sort((a, b) => {
            const order: Record<ProdType, number> = { 'ATELIER': 1, 'PLANNING': 2, 'COUPE': 3, 'INGENIERIE': 4 };
            return order[a.type] - order[b.type];
        });
    }, [planningEvents, models, suivis, filterChaine]);

    const filteredProductions = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return activeProductions.filter(prod => {
            const name = (prod.model.meta_data?.nom_modele || prod.model.filename || '').toLowerCase();
            const ref = String(prod.model.meta_data?.reference || '').toLowerCase();
            if (q && !name.includes(q) && !ref.includes(q)) return false;

            const done = prod.targetQuantity > 0 && prod.totalProduced >= prod.targetQuantity;
            if (filterStatus === 'tous') return true;
            if (filterStatus === 'termine') return done;
            if (filterStatus === 'en_cours') return !done && prod.type === 'ATELIER';
            if (filterStatus === 'en_attente') {
                return !done && (prod.type === 'PLANNING' || prod.type === 'COUPE' || prod.type === 'INGENIERIE');
            }
            return true;
        });
    }, [activeProductions, searchQuery, filterStatus]);

    const detailProd = useMemo(
        () => (selectedProdId ? activeProductions.find(p => p.id === selectedProdId) ?? null : null),
        [selectedProdId, activeProductions],
    );

    /** Lignes journalières pour le tableau récap (jours + créneaux horaires saisis) — respecte filtres chaîne / modèle */
    const suiviTableRows = useMemo(() => {
        type Row = {
            id: string;
            date: string;
            weekday: string;
            modelName: string;
            chainLabel: string;
            pieces: number;
            creneauxActifs: number;
            workers: number;
            planningId: string;
        };
        const rows: Row[] = [];
        suivis.forEach(s => {
            const plan = planningEvents.find(p => p.id === s.planningId);
            const modelId = plan?.modelId ?? s.modelId;
            if (!modelId) return;
            if (plan) {
                if (filterChaine !== 'ALL' && plan.chaineId !== filterChaine) return;
            } else if (filterChaine !== 'ALL') {
                if (!s.chaineId || s.chaineId !== filterChaine) return;
            }
            if (filterModele !== 'ALL' && modelId !== filterModele) return;

            const model = models.find(m => m.id === modelId);
            const chainId = plan?.chaineId ?? s.chaineId;
            const chainLabel = chainId ? (settings.chainNames?.[chainId] || chainId) : '—';

            const creneauxActifs = HOUR_KEYS.filter(k => (s.sorties[k] ?? -1) >= 0).length;
            rows.push({
                id: s.id,
                date: s.date,
                weekday: getFrenchWeekday(s.date),
                modelName: (model?.meta_data?.nom_modele || model?.filename || modelId).trim(),
                chainLabel,
                pieces: s.totalHeure ?? 0,
                creneauxActifs,
                workers: s.totalWorkers ?? 0,
                planningId: s.planningId,
            });
        });
        return rows.sort((a, b) => {
            const c = b.date.localeCompare(a.date);
            return c !== 0 ? c : a.modelName.localeCompare(b.modelName, 'fr');
        });
    }, [suivis, planningEvents, models, filterChaine, filterModele, settings.chainNames, HOUR_KEYS]);

    const suiviTableTotals = useMemo(() => ({
        pieces: suiviTableRows.reduce((a, r) => a + r.pieces, 0),
        creneaux: suiviTableRows.reduce((a, r) => a + r.creneauxActifs, 0),
    }), [suiviTableRows]);

    // Helpers
    const getBaseTime = (model: ModelData) => {
        return (model.gamme_operatoire || []).reduce((acc, op) => acc + (op.time || 0), 0);
    };

    const calculateEfficiency = (suivi: SuiviData, baseTime: number) => {
        if (!suivi.totalHeure || !suivi.totalWorkers || baseTime === 0) return 0;
        const activeHours = HOUR_KEYS.filter(k => (suivi.sorties[k] ?? -1) >= 0).length;
        if (activeHours === 0) return 0;

        const totalPresenceMinutes = suivi.totalWorkers * (activeHours * 60);
        if (totalPresenceMinutes === 0) return 0;

        const validProduction = Math.max(0, suivi.totalHeure - (suivi.defauts?.reduce((acc, d) => acc + d.quantity, 0) || 0));
        const earnedMinutes = validProduction * (baseTime * 1.15);
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

    /** Vue tableau type reporting (modèle, couleur, temps/pièce, totaux, écart, j., M.R) — mêmes OF que les cartes filtrées */
    const syntheseOfRows = useMemo(() => {
        return filteredProductions.map(prod => {
            const meta = prod.model.meta_data;
            const base = getBaseTime(prod.model);
            const totalTempsMin =
                meta?.total_temps != null && !Number.isNaN(Number(meta.total_temps))
                    ? Number(meta.total_temps)
                    : base;
            const target = prod.targetQuantity;
            const produced = prod.totalProduced;
            const ecartPieces = produced - target;
            const distinctDays = new Set(prod.events.map(e => e.date).filter(Boolean)).size;
            const avgPerDay = distinctDays > 0 ? produced / distinctDays : 0;
            let resteJours: number | null = null;
            if (avgPerDay > 0.0001) {
                resteJours = (target - produced) / avgPerDay;
            } else if (target === produced) {
                resteJours = 0;
            }
            const mr = calculateModelEfficiency(prod.events, base);
            const temArticle =
                target > 0 && totalTempsMin > 0
                    ? Math.round((totalTempsMin / target) * 1000) / 1000
                    : null;
            const colorFirst = meta?.colors?.[0] ?? prod.model.ficheData?.colors?.[0];
            const modelRef = (meta?.reference || '').trim();
            const modelLabel = modelRef || (meta?.nom_modele || prod.model.filename).trim();

            return {
                id: prod.id,
                modelLabel,
                modelLongName: (meta?.nom_modele || prod.model.filename).trim(),
                colorName: colorFirst?.name || '—',
                colorKey: (colorFirst?.id || colorFirst?.name || prod.model.id || 'x').trim(),
                temArticle,
                totalPieces: produced,
                commandeNeg: target > 0 ? -target : null,
                ecartPieces,
                resteJours,
                mr,
            };
        });
    }, [filteredProductions, HOUR_KEYS]);

    const groupedByChaine = useMemo(() => {
        const groups = new Map<string, { label: string, prods: typeof filteredProductions, suivis: SuiviData[] }>();

        filteredProductions.forEach(prod => {
            const chainId = prod.plan?.chaineId || prod.events[0]?.chaineId || 'UNKNOWN';
            const chainLabel = chainId === 'UNKNOWN' ? 'Non affecté' : (settings.chainNames?.[chainId] || chainId);
            
            const group = groups.get(chainId) || { label: chainLabel, prods: [], suivis: [] };
            group.prods.push(prod);
            
            prod.events.forEach(s => {
                if (!group.suivis.some(x => x.id === s.id)) {
                    group.suivis.push(s);
                }
            });
            
            groups.set(chainId, group);
        });

        return Array.from(groups.values()).map(g => {
            const byDate = new Map<string, SuiviData[]>();
            g.suivis.forEach(s => {
                const dateGroup = byDate.get(s.date) || [];
                dateGroup.push(s);
                byDate.set(s.date, dateGroup);
            });
            
            const bottomRows = Array.from(byDate.entries()).flatMap(([date, daySuivis]) => {
                const modelRows = daySuivis.map((s, index) => {
                    const prod = g.prods.find(p => p.id === s.planningId);
                    const rowInfo = prod ? syntheseOfRows.find(r => r.id === prod.id) : null;
                    const modelName = rowInfo?.modelLabel || 'Inconnu';
                    
                    const creneauxActifs = HOUR_KEYS.filter(k => (s.sorties[k] ?? -1) >= 0).length;
                    const chaf = s.chaf || 0, recta = s.recta || 0, sujet = s.sujet || 0, transp = s.transp || 0;
                    const man = s.man || 0, sp = s.sp || 0, stager = s.stager || 0;
                    const totalWorkers = chaf + recta + sujet + transp + man + sp + stager;
                    
                    let efficiency = 0;
                    if (prod) {
                        const baseTime = getBaseTime(prod.model);
                        const validProd = Math.max(0, (s.totalHeure || 0) - (s.defauts?.reduce((a, d) => a + d.quantity, 0) || 0));
                        const earnedMins = validProd * (baseTime * 1.15);
                        const presenceMins = creneauxActifs * totalWorkers * 60;
                        if (presenceMins > 0) efficiency = Math.round((earnedMins / presenceMins) * 100);
                    }

                    return {
                        id: s.id,
                        isTot: false,
                        date,
                        weekday: getFrenchWeekday(date),
                        modelName,
                        sorties: s.sorties,
                        pieces: s.totalHeure || 0,
                        creneauxActifs,
                        chaf, recta, sujet, transp, man, sp, stager, totalWorkers,
                        effectifRoleTags: s.effectifRoleTags,
                        efficiency,
                        rawSuivi: s,
                        colorIndex: index
                    };
                });

                const totSorties: Record<string, number> = {};
                let pieces = 0;
                let chaf = 0, recta = 0, sujet = 0, transp = 0, man = 0, sp = 0, stager = 0;
                let activeHoursSet = new Set<string>();
                
                daySuivis.forEach(s => {
                    HOUR_KEYS.forEach(k => {
                        if ((s.sorties[k] ?? -1) >= 0) {
                            totSorties[k] = (totSorties[k] || 0) + s.sorties[k]!;
                            activeHoursSet.add(k);
                        }
                    });
                    pieces += (s.totalHeure || 0);
                    chaf = Math.max(chaf, s.chaf || 0);
                    recta = Math.max(recta, s.recta || 0);
                    sujet = Math.max(sujet, s.sujet || 0);
                    transp = Math.max(transp, s.transp || 0);
                    man = Math.max(man, s.man || 0);
                    sp = Math.max(sp, s.sp || 0);
                    stager = Math.max(stager, s.stager || 0);
                });
                
                const creneauxActifs = activeHoursSet.size;
                const totalWorkers = chaf + recta + sujet + transp + man + sp + stager;
                
                let earnedMins = 0;
                let presenceMins = creneauxActifs * totalWorkers * 60;
                daySuivis.forEach(s => {
                    const prod = g.prods.find(p => p.id === s.planningId);
                    if (prod) {
                        const baseTime = getBaseTime(prod.model);
                        const validProd = Math.max(0, (s.totalHeure || 0) - (s.defauts?.reduce((a, d) => a + d.quantity, 0) || 0));
                        earnedMins += validProd * (baseTime * 1.15);
                    }
                });
                const efficiency = presenceMins > 0 ? Math.round((earnedMins / presenceMins) * 100) : 0;
                
                const totRow = {
                    id: `${g.label}-${date}-TOT`,
                    isTot: true,
                    date,
                    weekday: getFrenchWeekday(date),
                    modelName: 'TOT',
                    sorties: totSorties,
                    pieces,
                    creneauxActifs,
                    chaf, recta, sujet, transp, man, sp, stager, totalWorkers,
                    effectifRoleTags: undefined,
                    efficiency,
                    rawSuivi: undefined,
                    colorIndex: -1
                };

                return [...modelRows, totRow];
            }).sort((a, b) => {
                const dateCmp = b.date.localeCompare(a.date);
                if (dateCmp !== 0) return dateCmp;
                if (a.isTot) return 1;
                if (b.isTot) return -1;
                return 0;
            });
            
            return { ...g, bottomRows };
        }).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    }, [filteredProductions, HOUR_KEYS, getBaseTime, settings.chainNames, syntheseOfRows]);

    type GammePlanningRow = {
        key: string;
        planningId: string;
        modelId: string;
        date: string;
        chainLabel: string;
        modelLabel: string;
        opId: string;
        opOrder: number;
        opDesc: string;
    };

    const gammePlanningRows = useMemo(() => {
        const out: GammePlanningRow[] = [];
        for (const prod of filteredProductions) {
            if (!prod.plan) continue;
            const ops = [...(prod.model.gamme_operatoire || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            if (!ops.length) continue;
            const chainLabel = settings.chainNames?.[prod.plan.chaineId] || prod.plan.chaineId;
            const sm = syntheseOfRows.find(r => r.id === prod.id);
            const modelLabel = sm?.modelLabel || prod.model.meta_data?.nom_modele || prod.model.filename;
            const dates = [...new Set(prod.events.map(e => e.date).filter(Boolean))].sort((a, b) => b.localeCompare(a));
            for (const date of dates) {
                for (const op of ops) {
                    out.push({
                        key: `${prod.id}|${op.id}|${date}`,
                        planningId: prod.id,
                        modelId: prod.model.id,
                        date,
                        chainLabel,
                        modelLabel,
                        opId: op.id,
                        opOrder: op.order ?? 0,
                        opDesc: (op.description || op.machineName || '—').trim(),
                    });
                }
            }
        }
        out.sort((a, b) => {
            const d = b.date.localeCompare(a.date);
            if (d !== 0) return d;
            const c = a.chainLabel.localeCompare(b.chainLabel, 'fr');
            if (c !== 0) return c;
            const m = a.modelLabel.localeCompare(b.modelLabel, 'fr');
            if (m !== 0) return m;
            return a.opOrder - b.opOrder;
        });
        return out;
    }, [filteredProductions, settings.chainNames, syntheseOfRows]);

    useEffect(() => {
        if (suiviListTab !== 'gamme') return;
        let cancelled = false;
        setGammePosteStatus('loading');
        fetch('/api/poste-suivi', { credentials: 'include' })
            .then(r => {
                if (r.status === 401) throw new Error('401');
                if (!r.ok) throw new Error(String(r.status));
                return r.json();
            })
            .then((data: PosteSuiviData[]) => {
                if (cancelled) return;
                setGammePosteCache(Array.isArray(data) ? data : []);
                setGammePosteStatus('ok');
            })
            .catch(() => {
                if (!cancelled) {
                    setGammePosteCache([]);
                    setGammePosteStatus('error');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [suiviListTab]);

    const saveGammePosteBatch = useCallback(async () => {
        const dirtyKeys = Object.keys(gammeDraft);
        if (dirtyKeys.length === 0) {
            alert('Aucune modification à enregistrer.');
            return;
        }
        const rows: PosteSuiviData[] = [];
        for (const gr of gammePlanningRows) {
            const dk = `${gr.planningId}|${gr.opId}|${gr.date}`;
            if (!gammeDraft[dk]) continue;
            const fromDb = gammePosteCache.find(r => r.planningId === gr.planningId && r.posteId === gr.opId && r.date === gr.date);
            const dr = gammeDraft[dk] || {};
            const id =
                fromDb?.id
                || `ps_${gr.planningId.slice(0, 24)}_${gr.opId.slice(0, 20)}_${gr.date}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            rows.push({
                id,
                planningId: gr.planningId,
                modelId: gr.modelId,
                posteId: gr.opId,
                date: gr.date,
                pieces_entrees: Number(dr.pieces_entrees ?? fromDb?.pieces_entrees ?? 0) || 0,
                pieces_sorties: Number(dr.pieces_sorties ?? fromDb?.pieces_sorties ?? 0) || 0,
                pieces_defaut: Number(dr.pieces_defaut ?? fromDb?.pieces_defaut ?? 0) || 0,
                notes: (dr.notes as string | undefined) ?? fromDb?.notes,
                heure_debut: dr.heure_debut ?? fromDb?.heure_debut,
                heure_fin: dr.heure_fin ?? fromDb?.heure_fin,
                problemes: (dr.problemes as string[] | undefined) ?? fromDb?.problemes ?? [],
            });
        }
        if (rows.length === 0) {
            alert('Aucune modification à enregistrer.');
            return;
        }
        try {
            const r = await fetch('/api/poste-suivi', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suivis: rows }),
            });
            if (!r.ok) throw new Error('save');
            setGammePosteCache(prev => {
                const next = [...prev];
                for (const row of rows) {
                    const idx = next.findIndex(x => x.posteId === row.posteId && x.date === row.date && x.planningId === row.planningId);
                    if (idx >= 0) next[idx] = row;
                    else next.push(row);
                }
                return next;
            });
            setGammeDraft(d => {
                const next = { ...d };
                for (const row of rows) {
                    delete next[`${row.planningId}|${row.posteId}|${row.date}`];
                }
                return next;
            });
        } catch {
            alert('Enregistrement suivi par poste (gamme) impossible (vérifiez la connexion / session).');
        }
    }, [gammePlanningRows, gammeDraft, gammePosteCache]);

    // Actions
    const handleUpdateHourly = (id: string, hourKey: string, value: string) => {
        let val = parseInt(value);
        if (isNaN(val) || val < 0) {
            val = -1; // -1 represents empty
        }

        setSuivis(prev => prev.map(s => {
            if (s.id === id) {
                const newSorties = { ...s.sorties, [hourKey]: val === -1 ? undefined : val };
                const filteredSorties = Object.fromEntries(Object.entries(newSorties).filter(([, v]) => v !== undefined)) as Record<string, number>;
                const totalHeure = Object.values(filteredSorties).reduce((a, b) => a + b, 0);
                return { ...s, sorties: filteredSorties, totalHeure };
            }
            return s;
        }));
    };

    const handleDowntimeChange = (id: string, hourKey: string, reason: string) => {
        setSuivis(prev => prev.map(s => s.id === id ? { ...s, downtimes: { ...(s.downtimes || {}), [hourKey]: reason } } : s));
    };

    const handleDefectChange = (id: string, value: string) => {
        const val = Math.max(0, parseInt(value) || 0);
        setSuivis(prev => prev.map(s => {
            if (s.id === id) {
                return { ...s, defauts: val > 0 ? [{ id: '1', hour: 'all', type: 'General', quantity: val, notes: '' }] : [] }
            }
            return s;
        }));
    };

    const handleUpdateWorker = (id: string, field: string, value: string) => {
        const val = Math.max(0, parseInt(value) || 0);
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
            setSelectedProdId(null);
        }
    };

    const renderCard = (prod: ProdItem) => {
        const image = prod.model.images?.front || prod.model.image;
        const progress = prod.targetQuantity > 0 ? Math.min(100, Math.round((prod.totalProduced / prod.targetQuantity) * 100)) : 0;
        const isDone = prod.totalProduced >= prod.targetQuantity && prod.targetQuantity > 0;
        
        let statusColor = "";
        let statusText = "";
        let StatusIcon = AlertTriangle;

        switch(prod.type) {
            case 'INGENIERIE':
                statusColor = "bg-rose-500/10 text-rose-600 border-rose-500/20";
                statusText = "Bureau d'études";
                StatusIcon = PenTool;
                break;
            case 'COUPE':
                statusColor = "bg-orange-500/10 text-orange-600 border-orange-500/20";
                statusText = "La Coupe";
                StatusIcon = Scissors;
                break;
            case 'PLANNING':
                statusColor = "bg-sky-500/10 text-sky-600 border-sky-500/20";
                statusText = "En Planning";
                StatusIcon = Calendar;
                break;
            case 'ATELIER':
                if (isDone) {
                    statusColor = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
                    statusText = "Terminé";
                    StatusIcon = CheckCircle;
                } else {
                    statusColor = "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 ring-2 ring-indigo-500/20";
                    statusText = "En Atelier";
                    StatusIcon = Activity;
                }
                break;
        }

        const meta = prod.model.meta_data;
        const baseT = getBaseTime(prod.model);
        const totalTemps =
            meta?.total_temps != null && !Number.isNaN(Number(meta.total_temps))
                ? Number(meta.total_temps)
                : baseT;
        const cellTemps = totalTemps > 0 ? String(Math.round(totalTemps * 100) / 100) : '—';
        const hala = meta?.hala;
        const halaCardClass =
            hala === 'EN_COURS' ? 'bg-emerald-50/90 border-emerald-200/70 text-emerald-900' :
            hala === 'TERMINE' ? 'bg-slate-50/90 border-slate-200/70 text-slate-800' :
            hala === 'BLOQUE' ? 'bg-rose-50/90 border-rose-200/70 text-rose-900' :
            hala ? 'bg-amber-50/90 border-amber-200/70 text-amber-900' : 'bg-slate-50/80 border-slate-200/60 text-slate-700';
        const todmShort = (meta?.todm || '').trim();
        const metricCell =
            'flex flex-col items-center justify-center text-center min-h-[4.25rem] px-1.5 py-2 rounded-xl border bg-white/80 border-slate-200/70 shadow-sm';

        return (
            <div 
                key={prod.id}
                onClick={() => setSelectedProdId(prod.id)}
                className="group relative bg-white/60 backdrop-blur-xl rounded-[2rem] border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(79,70,229,0.12)] hover:-translate-y-1 transition-all duration-500 cursor-pointer overflow-hidden flex flex-col h-full"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                {/* Header with image */}
                <div className="relative h-44 sm:h-48 bg-slate-100 flex items-center justify-center overflow-hidden m-2 rounded-t-[1.5rem] rounded-b-xl z-10">
                    {image ? (
                        <img src={image} alt={prod.model.meta_data.nom_modele} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                    ) : (
                        <ImageIcon className="w-12 h-12 text-slate-300" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80"></div>
                    
                    {/* Status Badge */}
                    <div className={`absolute top-3 right-3 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl backdrop-blur-md border flex items-center gap-2 shadow-lg ${statusColor} ${prod.type === 'ATELIER' && !isDone ? 'bg-indigo-600/90 text-white border-transparent ring-0' : 'bg-white/90'}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {statusText}
                    </div>
                    {/* Chain Badge (If assigned to planning) */}
                    {prod.plan && (
                        <div className="absolute bottom-3 left-3 bg-black/40 backdrop-blur-md text-white px-3 py-1.5 rounded-xl text-xs font-black tracking-wide flex items-center gap-2 shadow-lg border border-white/10">
                            <Factory className="w-3.5 h-3.5 text-indigo-300" />
                            {settings.chainNames?.[prod.plan.chaineId] || prod.plan.chaineId}
                        </div>
                    )}
                </div>

                {/* Body — grille 3 colonnes fixe (mêmes emplacements sur toutes les cartes) */}
                <div className="px-4 sm:px-5 pb-5 pt-3 flex-1 flex flex-col gap-3 relative z-10 min-h-0">
                    <div className="min-h-[3.25rem]">
                        <h3 className="text-lg sm:text-xl font-black text-slate-800 line-clamp-2 leading-tight tracking-tight group-hover:text-indigo-600 transition-colors">
                            {meta?.nom_modele || '—'}
                        </h3>
                        {prod.model.ficheData?.client && (
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1.5 line-clamp-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></span>
                                {prod.model.ficheData.client}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className={metricCell}>
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">Qté obj.</span>
                            <span className="text-base sm:text-lg font-black text-slate-900 tabular-nums leading-tight">{prod.targetQuantity > 0 ? prod.targetQuantity : '—'}</span>
                            <span className="text-[10px] font-bold text-slate-500 tabular-nums mt-0.5">{prod.totalProduced} prod.</span>
                        </div>
                        <div className={metricCell}>
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">Temps (min)</span>
                            <span className="text-base sm:text-lg font-black text-slate-900 tabular-nums leading-tight">{cellTemps}</span>
                            <span className="text-[10px] font-bold text-slate-500 mt-0.5">Gamme</span>
                        </div>
                        <div className={`${metricCell} ${halaCardClass}`}>
                            <span className="text-[9px] font-black uppercase tracking-wider opacity-75 leading-none mb-1">Hala</span>
                            <span className="text-xs sm:text-sm font-black leading-tight flex items-center justify-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                                {labelHala(hala)}
                            </span>
                            <span className="text-[10px] font-bold opacity-80 mt-0.5 line-clamp-1">Kisba · {labelKisba(meta?.kisba)}</span>
                        </div>
                    </div>

                    {(todmShort || meta?.reference) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500 border-t border-slate-100/80 pt-2">
                            {meta?.reference ? (
                                <span className="tabular-nums"><span className="text-slate-400 font-black uppercase tracking-tighter mr-1">Réf.</span>{meta.reference}</span>
                            ) : null}
                            {todmShort ? (
                                <span className="min-w-0 truncate max-w-full" title={todmShort}><span className="text-slate-400 font-black uppercase tracking-tighter mr-1">Todm</span>{todmShort}</span>
                            ) : null}
                        </div>
                    )}

                    {/* Progress Bar (Only relevant if target exist) */}
                    {prod.targetQuantity > 0 && (
                        <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50">
                            <div className="flex items-end justify-between mb-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Progression</span>
                                <div className="text-right flex items-baseline gap-1">
                                    <span className={`text-lg font-black ${isDone ? 'text-emerald-600' : 'text-indigo-600'}`}>{prod.totalProduced}</span>
                                    <span className="text-xs font-bold text-slate-400">/ {prod.targetQuantity}</span>
                                </div>
                            </div>
                            <div className="w-full bg-slate-200/50 rounded-full h-2 overflow-hidden shadow-inner">
                                <div 
                                    className={`h-full rounded-full transition-all duration-1000 ease-out relative ${isDone ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-indigo-400 to-indigo-600'}`} 
                                    style={{ width: `${progress}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]"></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Missing Items / Info */}
                    <div className="border-t border-slate-100/60 pt-3 mt-auto">
                        <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Alertes
                        </div>
                        <ul className="space-y-1.5">
                            {prod.missingItems.length > 0 ? (
                                prod.missingItems.slice(0, 3).map((item, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-[11px] text-rose-700 font-bold bg-rose-50/50 p-1.5 rounded-lg border border-rose-100/50">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0"></div>
                                        <span className="leading-snug">{item}</span>
                                    </li>
                                ))
                            ) : (
                                <li className="text-[11px] text-emerald-800 font-black flex items-center gap-2 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Prêt pour production
                                </li>
                            )}
                            {prod.missingItems.length > 3 && (
                                <li className="text-[10px] text-slate-400 font-bold italic px-1">+{prod.missingItems.length - 3} autres…</li>
                            )}
                        </ul>
                    </div>
                </div>
            </div>
        );
    };

    const renderDetailView = (prod: ProdItem) => {
        const file = prod;

        // If it DOESN'T have a plan yet (Ingenierie, Coupe)
        if (!file.plan) {
            return (
                <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
                    <div className="bg-white px-6 py-4 border-b border-slate-200 shrink-0 sticky top-0 z-20 shadow-sm">
                        <SuiviModelHeader
                            model={file.model}
                            planningEvent={null}
                            currentHourLabel={resolvedHourLabel}
                            baseTimeMinutes={getBaseTime(file.model)}
                            variant="detail"
                            onBack={() => setSelectedProdId(null)}
                        />
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center gap-4">
                        <div className="w-full max-w-md">
                            <GammeBoundsStrip model={file.model} />
                        </div>
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-md w-full text-center">
                            <Info className="w-16 h-16 text-indigo-300 mx-auto mb-4" />
                            <h3 className="text-xl font-black text-slate-800 mb-2">Pas encore en Atelier</h3>
                            <p className="text-slate-500 text-sm mb-6">
                                Ce modèle est actuellement en étape <strong className="text-indigo-600">{file.type}</strong>. 
                                Le tableau de pointage horaire sera disponible une fois affecté à une ligne dans le Planning.
                            </p>
                            
                            <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <h4 className="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">Éléments manquants</h4>
                                <ul className="space-y-2">
                                    {file.missingItems.map((item, idx) => (
                                        <li key={idx} className="flex items-center gap-2 text-sm text-rose-600 font-medium">
                                            <AlertTriangle className="w-4 h-4 shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )
        }

        // FULL ATELIER / PLANNING VIEW
        const baseTime = getBaseTime(file.model);
        const posteDateStr = contextDate;
        const implantPostes = file.model.implantation?.postes || [];
        const catalogSimilar = suggestSimilarModelsForTemps(file.model, models, machines, { limit: 6 });
        const avgGammeSuggested = mean(catalogSimilar.map(r => r.gammeMinutes).filter(x => x > 0));
        const avgTotalSuggested = mean(catalogSimilar.map(r => r.totalTempsMin).filter(x => x > 0));
        const activityThread = file.events[0]?.activityThreadId ?? '';
        const activityPoste = file.events[0]?.activityAnchorPosteId ?? '';

        const savePosteSuiviBatch = async () => {
            if (!file.plan) return;
            const rows: PosteSuiviData[] = implantPostes.map(poste => {
                const key = `${poste.id}|${posteDateStr}`;
                const fromDb = posteSuiviRows.find(r => r.posteId === poste.id && r.date === posteDateStr);
                const dr = posteSuiviDraft[key] || {};
                const id =
                    fromDb?.id
                    || `ps_${file.plan!.id.slice(0, 24)}_${poste.id.slice(0, 20)}_${posteDateStr}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                return {
                    id,
                    planningId: file.plan!.id,
                    modelId: file.model.id,
                    posteId: poste.id,
                    date: posteDateStr,
                    pieces_entrees: Number(dr.pieces_entrees ?? fromDb?.pieces_entrees ?? 0) || 0,
                    pieces_sorties: Number(dr.pieces_sorties ?? fromDb?.pieces_sorties ?? 0) || 0,
                    pieces_defaut: Number(dr.pieces_defaut ?? fromDb?.pieces_defaut ?? 0) || 0,
                    notes: (dr.notes as string | undefined) ?? fromDb?.notes,
                    heure_debut: dr.heure_debut ?? fromDb?.heure_debut,
                    heure_fin: dr.heure_fin ?? fromDb?.heure_fin,
                    problemes: (dr.problemes as string[] | undefined) ?? fromDb?.problemes ?? [],
                };
            });
            try {
                const r = await fetch('/api/poste-suivi', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ suivis: rows }),
                });
                if (!r.ok) throw new Error('save');
                setPosteSuiviRows(prev => {
                    const next = [...prev];
                    for (const row of rows) {
                        const idx = next.findIndex(x => x.posteId === row.posteId && x.date === row.date);
                        if (idx >= 0) next[idx] = row;
                        else next.push(row);
                    }
                    return next;
                });
                setPosteSuiviDraft({});
            } catch {
                alert('Enregistrement suivi par poste impossible (vérifiez la connexion / session).');
            }
        };

        const resteProduire = file.targetQuantity - file.totalProduced;
        const avgPerHour = file.totalProduced / (file.events.reduce((acc, s) => acc + HOUR_KEYS.filter(k => (s.sorties[k] ?? -1) >= 0).length, 0) || 1);
        const hoursLeft = avgPerHour > 0 ? Math.ceil(resteProduire / avgPerHour) : 0;
        const dailyTarget = file.events.length > 0 ? Math.round(file.targetQuantity / file.events.length) : file.targetQuantity;
        const hourlyTarget = Math.round(dailyTarget / HOURS.length) || 1;
        const overallEff = calculateModelEfficiency(file.events, baseTime);

        return (
            <div className="flex min-h-0 flex-1 flex-col bg-slate-50 overflow-y-auto relative scroll-smooth touch-pan-y no-scrollbar-on-print">
                <div className="bg-white px-6 py-4 border-b border-slate-200 shrink-0 sticky top-0 z-20 shadow-sm">
                    <SuiviModelHeader
                        model={file.model}
                        planningEvent={file.plan}
                        currentHourLabel={resolvedHourLabel}
                        baseTimeMinutes={getBaseTime(file.model)}
                        variant="detail"
                        onBack={() => setSelectedProdId(null)}
                        chainLabel={settings.chainNames?.[file.plan.chaineId] || file.plan.chaineId}
                        superviseur={file.plan.superviseur}
                        rightSlot={(
                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto items-stretch sm:items-end">
                                {lockedContext?.planningId === file.plan.id ? (
                                    <button
                                        type="button"
                                        onClick={() => setLockedContext(null)}
                                        className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-bold border border-amber-200"
                                    >
                                        Déverrouiller le contexte
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setLockedContext({ planningId: file.plan?.id ?? '', date: contextDate })}
                                        className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-lg text-xs font-bold border border-indigo-200"
                                    >
                                        Verrouiller ce contexte
                                    </button>
                                )}
                                <button type="button" onClick={() => window.print()} className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all border border-slate-200">
                                    <Printer className="w-4 h-4" /> Imprimer
                                </button>
                            </div>
                        )}
                    />
                </div>

                <div className="flex-1 p-4 sm:p-6 flex flex-col gap-4 max-w-[1600px] mx-auto w-full">
                    <GammeBoundsStrip model={file.model} />

                    <ModelOfJournalierSummary
                        key={file.plan.id}
                        chaineId={file.plan.chaineId}
                        chainLabel={settings.chainNames?.[file.plan.chaineId] || file.plan.chaineId}
                        modelLabel={(file.model.meta_data?.nom_modele || file.model.filename || 'Modèle').trim()}
                        events={file.events}
                        hours={HOURS}
                        hourKeys={HOUR_KEYS}
                        suivis={suivis}
                        planningEvents={planningEvents}
                        models={models}
                        onUpdateHourly={handleUpdateHourly}
                    />

                    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                        {/* Tableau de bord — KPIs en grille lisible (remplace la bande flex dense) */}
                        <div className="bg-white/40 backdrop-blur-xl border-b border-white/60 p-5 sm:p-6">
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between">
                                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 flex-1 min-w-0">
                                    <div className="relative overflow-hidden rounded-[1.5rem] border border-white/60 bg-gradient-to-br from-white/80 to-slate-50/50 p-4 shadow-sm group hover:shadow-md transition-shadow">
                                        <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity"><Clock className="w-6 h-6 text-slate-400" /></div>
                                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">Tps base</span>
                                        <span className="text-2xl font-black text-slate-800 leading-tight tabular-nums mt-2 block">{baseTime.toFixed(2)}<span className="text-sm font-bold text-slate-400 ml-1">m</span></span>
                                    </div>
                                    <div className="relative overflow-hidden rounded-[1.5rem] border border-indigo-100/50 bg-gradient-to-br from-indigo-50/80 to-white/50 p-4 shadow-sm group hover:shadow-md transition-shadow">
                                        <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity"><Target className="w-6 h-6 text-indigo-500" /></div>
                                        <span className="text-[11px] font-black text-indigo-500 uppercase tracking-widest block flex items-center gap-1">Obj. h.</span>
                                        <span className="text-2xl font-black text-indigo-700 leading-tight tabular-nums mt-2 block">{hourlyTarget}<span className="text-sm font-bold text-indigo-400 ml-1">/h</span></span>
                                    </div>
                                    <div className="relative overflow-hidden rounded-[1.5rem] border border-emerald-100/50 bg-gradient-to-br from-emerald-50/80 to-white/50 p-4 shadow-sm group hover:shadow-md transition-shadow">
                                        <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity"><PackageCheck className="w-6 h-6 text-emerald-500" /></div>
                                        <span className="text-[11px] font-black text-emerald-500 uppercase tracking-widest block">Total produit</span>
                                        <span className="text-2xl font-black text-emerald-700 leading-tight tabular-nums mt-2 block">
                                            {file.totalProduced}<span className="text-sm font-bold text-emerald-400/80 ml-1">/ {file.targetQuantity}</span>
                                        </span>
                                    </div>
                                    {resteProduire > 0 ? (
                                        <>
                                            <div className="relative overflow-hidden rounded-[1.5rem] border border-rose-100/50 bg-gradient-to-br from-rose-50/80 to-white/50 p-4 shadow-sm group hover:shadow-md transition-shadow">
                                                <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity"><Activity className="w-6 h-6 text-rose-500" /></div>
                                                <span className="text-[11px] font-black text-rose-500 uppercase tracking-widest block">Reste</span>
                                                <span className="text-2xl font-black text-rose-700 leading-tight tabular-nums mt-2 block">{resteProduire}</span>
                                            </div>
                                            <div className="relative overflow-hidden rounded-[1.5rem] border border-amber-100/50 bg-gradient-to-br from-amber-50/80 to-white/50 p-4 shadow-sm group hover:shadow-md transition-shadow">
                                                <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity"><Timer className="w-6 h-6 text-amber-500" /></div>
                                                <span className="text-[11px] font-black text-amber-600 uppercase tracking-widest block">ETA</span>
                                                <span className="text-2xl font-black text-amber-700 leading-tight tabular-nums mt-2 block">~{hoursLeft}h</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="col-span-2 relative overflow-hidden rounded-[1.5rem] border border-emerald-100/50 bg-gradient-to-r from-emerald-400 to-emerald-500 p-4 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
                                            <div className="flex items-center gap-3 text-white">
                                                <CheckCircle2 className="w-8 h-8" />
                                                <span className="text-lg font-black uppercase tracking-widest">Objectif Atteint</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-row items-center justify-between gap-6 rounded-[1.5rem] border border-white/60 bg-white/60 backdrop-blur-md px-6 py-4 shadow-sm lg:flex-col lg:justify-center lg:min-w-[180px] relative overflow-hidden">
                                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-bl from-indigo-500/5 to-transparent rounded-full blur-2xl"></div>
                                    <div className="flex flex-col min-w-0 items-start lg:items-center text-left lg:text-center z-10">
                                        <span className="text-[11px] uppercase font-black text-slate-400 tracking-widest">M.R moyen</span>
                                        <div className="relative mt-2">
                                            <span className={`text-4xl font-black leading-none tabular-nums tracking-tighter bg-clip-text text-transparent ${overallEff >= 80 ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' : overallEff >= 60 ? 'bg-gradient-to-br from-amber-500 to-orange-500' : 'bg-gradient-to-br from-rose-500 to-rose-700'}`}>{overallEff}%</span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleExport(file.model)}
                                        className="p-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 rounded-2xl transition-all h-14 w-14 shrink-0 flex items-center justify-center cursor-pointer shadow-lg shadow-indigo-500/30 hover:scale-105 hover:rotate-3 z-10"
                                        title="Clôturer le suivi"
                                    >
                                        <CheckCircle2 className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="border-b border-slate-200 p-4 sm:p-5 space-y-4 bg-slate-50/40 print:hidden">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Suggestion catalogue (modèles proches)</div>
                                {catalogSimilar.length === 0 ? (
                                    <p className="text-xs text-slate-500">Pas assez de données texte pour comparer — enrichissez fiche / gamme.</p>
                                ) : (
                                    <>
                                        <p className="text-xs text-slate-600 mb-2">
                                            Moyennes sur {catalogSimilar.length} modèle(s) proche(s) : temps gamme ≈{' '}
                                            <strong>{avgGammeSuggested > 0 ? `${avgGammeSuggested.toFixed(1)} min` : '—'}</strong>
                                            {' · '}méta total ≈{' '}
                                            <strong>{avgTotalSuggested > 0 ? `${avgTotalSuggested.toFixed(1)} min` : '—'}</strong>
                                        </p>
                                        <ul className="text-[11px] text-slate-700 space-y-1 max-h-28 overflow-y-auto">
                                            {catalogSimilar.map(c => (
                                                <li key={c.modelId} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                                                    <span className="truncate font-semibold">{c.nom}</span>
                                                    <span className="shrink-0 tabular-nums text-slate-500">score {c.score}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Lien activité (référence)</div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="text"
                                        className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 font-mono"
                                        placeholder="ID fil d’activité (ex. bera:activity:OF123:P1)"
                                        value={activityThread}
                                        onChange={e => persistActivityForPlanning(file.plan!.id, { activityThreadId: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        className="sm:w-36 text-xs border border-slate-200 rounded-lg px-2 py-1.5 font-mono"
                                        placeholder="Poste ancré"
                                        value={activityPoste}
                                        onChange={e => persistActivityForPlanning(file.plan!.id, { activityAnchorPosteId: e.target.value })}
                                    />
                                </div>
                            </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        Suivi par poste (jour : {posteDateStr})
                                    </div>
                                    {implantPostes.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => void savePosteSuiviBatch()}
                                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                                        >
                                            Enregistrer postes
                                        </button>
                                    )}
                                </div>
                                {posteSuiviStatus === 'error' && (
                                    <p className="text-xs text-amber-700 mb-2">API poste suivi indisponible (hors ligne ou non connecté) — saisie locale seulement jusqu’à sync.</p>
                                )}
                                {implantPostes.length === 0 ? (
                                    <p className="text-xs text-slate-500">Définissez l’implantation (postes) sur le modèle pour activer le suivi par poste.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead>
                                                <tr className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                                                    <th className="py-2 pr-2">Poste</th>
                                                    <th className="py-2 pr-2">Entrées</th>
                                                    <th className="py-2 pr-2">Sorties</th>
                                                    <th className="py-2 pr-2">Défauts</th>
                                                    <th className="py-2">Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {implantPostes.map(poste => {
                                                    const key = `${poste.id}|${posteDateStr}`;
                                                    const fromDb = posteSuiviRows.find(r => r.posteId === poste.id && r.date === posteDateStr);
                                                    const dr = posteSuiviDraft[key] || {};
                                                    const peRaw = dr.pieces_entrees !== undefined ? dr.pieces_entrees : fromDb?.pieces_entrees;
                                                    const psRaw = dr.pieces_sorties !== undefined ? dr.pieces_sorties : fromDb?.pieces_sorties;
                                                    const pdRaw = dr.pieces_defaut !== undefined ? dr.pieces_defaut : fromDb?.pieces_defaut;
                                                    const pe = peRaw !== undefined && peRaw !== null ? Number(peRaw) : '';
                                                    const ps = psRaw !== undefined && psRaw !== null ? Number(psRaw) : '';
                                                    const pd = pdRaw !== undefined && pdRaw !== null ? Number(pdRaw) : '';
                                                    const notes = (dr.notes as string | undefined) ?? fromDb?.notes ?? '';
                                                    return (
                                                        <tr key={poste.id}>
                                                            <td className="py-1.5 pr-2 font-semibold text-slate-800 max-w-[140px] truncate" title={poste.name}>{poste.name}</td>
                                                            <td className="py-1.5 pr-1">
                                                                <input type="number" min={0} className="w-16 border border-slate-200 rounded px-1 py-0.5"
                                                                    value={pe === '' ? '' : pe}
                                                                    onChange={e => setPosteSuiviDraft(prev => ({ ...prev, [key]: { ...prev[key], pieces_entrees: parseInt(e.target.value, 10) || 0 } }))}
                                                                />
                                                            </td>
                                                            <td className="py-1.5 pr-1">
                                                                <input type="number" min={0} className="w-16 border border-slate-200 rounded px-1 py-0.5"
                                                                    value={ps === '' ? '' : ps}
                                                                    onChange={e => setPosteSuiviDraft(prev => ({ ...prev, [key]: { ...prev[key], pieces_sorties: parseInt(e.target.value, 10) || 0 } }))}
                                                                />
                                                            </td>
                                                            <td className="py-1.5 pr-1">
                                                                <input type="number" min={0} className="w-16 border border-slate-200 rounded px-1 py-0.5"
                                                                    value={pd === '' ? '' : pd}
                                                                    onChange={e => setPosteSuiviDraft(prev => ({ ...prev, [key]: { ...prev[key], pieces_defaut: parseInt(e.target.value, 10) || 0 } }))}
                                                                />
                                                            </td>
                                                            <td className="py-1.5">
                                                                <input type="text" className="w-full min-w-[120px] border border-slate-200 rounded px-1 py-0.5"
                                                                    value={notes}
                                                                    onChange={e => setPosteSuiviDraft(prev => ({ ...prev, [key]: { ...prev[key], notes: e.target.value } }))}
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* EXCEL-LIKE CLEAN MATRIX */}
                        <div className="overflow-x-auto rounded-[1.5rem] border border-slate-200/60 shadow-sm bg-white print:border-none print:shadow-none mb-6">
                            <table className="w-full text-sm text-center font-medium border-collapse min-w-[1000px]">
                                <thead>
                                    <tr className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200/80">
                                        <th className="py-4 px-4 border-r border-slate-200/60 text-slate-500 font-black uppercase text-[10px] tracking-widest w-[120px] text-left sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] bg-gradient-to-b from-slate-50 to-white">Date / Jour</th>

                                        {/* EFFECTIFS */}
                                        <th colSpan={6} className="py-2 px-3 border-r border-slate-200/60 bg-slate-50/50">
                                            <div className="text-[9px] uppercase font-black text-slate-400 tracking-widest border-b border-slate-200/60 pb-1.5 mb-1.5">Effectifs N.O (Lié)</div>
                                            <div className="flex justify-between px-2 w-[260px] mx-auto">
                                                <span className="w-10 text-[10px] font-bold text-slate-600 uppercase bg-white rounded shadow-sm border border-slate-100 py-0.5" title="Machinistes">Mac</span>
                                                <span className="w-10 text-[10px] font-bold text-slate-600 uppercase bg-white rounded shadow-sm border border-slate-100 py-0.5" title="Traçage / Coupe">Tra</span>
                                                <span className="w-10 text-[10px] font-bold text-slate-600 uppercase bg-white rounded shadow-sm border border-slate-100 py-0.5" title="Préparation">Pre</span>
                                                <span className="w-10 text-[10px] font-bold text-slate-600 uppercase bg-white rounded shadow-sm border border-slate-100 py-0.5" title="Finition">Fin</span>
                                                <span className="w-10 text-[10px] font-bold text-slate-600 uppercase bg-white rounded shadow-sm border border-slate-100 py-0.5" title="Contrôle">Ctr</span>
                                                <span className="w-10 text-[10px] font-bold text-rose-500 uppercase bg-rose-50 rounded shadow-sm border border-rose-100 py-0.5" title="Absents (Non inclus dans Σ E.)">Abs</span>
                                            </div>
                                        </th>
                                        <th className="py-2.5 px-3 border-r border-slate-200/60 bg-slate-100 text-slate-700 font-black text-[11px] uppercase tracking-wider w-[60px]" title="Total Effectif">Σ E.</th>

                                        {/* HORAIRES DYNAMIQUES */}
                                        {HOURS.map((h, i) => {
                                            const isNow = HOUR_KEYS[i] === resolvedHourKey;
                                            return (
                                                <th key={h} className={`py-3 px-2 border-r border-slate-100 font-bold text-xs w-[60px] ${isNow ? 'bg-indigo-50/80 text-indigo-700 ring-2 ring-indigo-400 ring-inset shadow-sm relative' : 'bg-transparent text-slate-500'}`}>
                                                    {isNow && <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-indigo-500 rounded-b-full"></div>}
                                                    <div className="bg-white/60 border border-slate-200/60 rounded-md py-1 px-1 shadow-sm text-[10px] uppercase tracking-wider">{h}</div>
                                                </th>
                                            );
                                        })}

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
                                                        <span className="text-[10px] font-black uppercase text-slate-700">{getFrenchWeekday(s.date)}</span>
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

                                                    const isNowCol = k === resolvedHourKey;
                                                    return (
                                                        <td key={h} className={`p-0 border-r border-slate-100 relative align-middle ${isNowCol ? 'bg-amber-50' : ''}`}>
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
                                                        <input type="number" min="0" title="Retouches / Défauts"
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
                        <div className="p-3 border-t border-slate-100 bg-slate-50/50 print:hidden text-center sm:text-left">
                            <button onClick={() => handleAddDay(file.plan!.id)} className="inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 font-bold text-sm px-4 py-2 rounded-lg shadow-sm transition-colors">
                                <Plus className="w-4 h-4" /> Nouvelle Ligne (Journée/Shift)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const selectedPlanningIdForPoste = planningEvents.some(p => p.id === selectedProdId) ? selectedProdId : null;

    useEffect(() => {
        if (!selectedPlanningIdForPoste) {
            setPosteSuiviRows([]);
            setPosteSuiviDraft({});
            setPosteSuiviStatus('idle');
            return;
        }
        let cancelled = false;
        setPosteSuiviStatus('loading');
        fetch(`/api/poste-suivi?planningId=${encodeURIComponent(selectedPlanningIdForPoste)}`, { credentials: 'include' })
            .then(r => {
                if (r.status === 401) throw new Error('401');
                if (!r.ok) throw new Error(String(r.status));
                return r.json();
            })
            .then((data: PosteSuiviData[]) => {
                if (!cancelled) {
                    setPosteSuiviRows(Array.isArray(data) ? data : []);
                    setPosteSuiviStatus('ok');
                    setPosteSuiviDraft({});
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setPosteSuiviRows([]);
                    setPosteSuiviStatus('error');
                }
            });
        return () => { cancelled = true; };
    }, [selectedPlanningIdForPoste]);

    useEffect(() => {
        setEffectifsModalSuiviId(null);
    }, [selectedProdId]);

    const persistActivityForPlanning = useCallback((planningId: string, patch: { activityThreadId?: string; activityAnchorPosteId?: string }) => {
        setSuivis(prev => prev.map(s => (s.planningId === planningId ? { ...s, ...patch } : s)));
    }, [setSuivis]);

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col bg-slate-50/50 overflow-y-auto overflow-x-hidden relative touch-pan-y scroll-smooth no-scrollbar-on-print">
            <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-indigo-50/50 to-transparent pointer-events-none"></div>
            {selectedProdId ? (
                detailProd ? (
                    renderDetailView(detailProd)
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-8 bg-transparent text-center relative z-10">
                        <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 max-w-md flex flex-col items-center">
                            <div className="w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center mb-6">
                                <AlertTriangle className="w-10 h-10 text-amber-500" />
                            </div>
                            <h2 className="text-xl font-black text-slate-800 mb-3 tracking-tight">Fiche indisponible</h2>
                            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                                Ce dossier n'est pas dans la liste active. Vérifiez vos filtres ou le planning de production.
                            </p>
                            <button
                                type="button"
                                onClick={() => setSelectedProdId(null)}
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-all hover:shadow-lg hover:-translate-y-0.5"
                            >
                                <ChevronLeft className="w-4 h-4" /> Retour à la liste
                            </button>
                        </div>
                    </div>
                )
            ) : (
                // --- CARDS VIEW (LEVEL 1) ---
                <>
                    {/* HEADER & FILTERS */}
                    <div className="bg-white/80 backdrop-blur-xl flex flex-col gap-4 shrink-0 shadow-sm z-20 print:hidden border-b border-slate-200/60 sticky top-0">
                        <div className="px-6 pt-5 pb-2 flex flex-col gap-4">
                            <div className="flex items-center justify-between gap-3 min-w-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20 shrink-0">
                                        <Activity className="w-5 h-5 text-white" />
                                    </div>
                                    <h1 className="text-2xl font-black text-slate-800 tracking-tight truncate">
                                        Suivi de production
                                    </h1>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <div
                                        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-indigo-50/80 border border-indigo-100/50 rounded-xl text-indigo-700 text-[11px] font-black uppercase tracking-wider shadow-sm"
                                        title="Créneaux horaires du tableau = Paramètres (plages, pauses)"
                                    >
                                        <Settings2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                        <span className="hidden sm:inline whitespace-nowrap">Horaires sync.</span>
                                    </div>
                                    <SuiviCurrentHourBadge label={resolvedHourLabel} />
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                {/* Search & Status Toggle */}
                                <div className="flex flex-wrap items-center gap-3 mr-auto">
                                    <div className="relative group">
                                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" />
                                        <input
                                            type="text"
                                            placeholder="Rechercher modèle, référence…"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="pl-10 pr-4 py-2.5 w-64 lg:w-80 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-400 shadow-sm"
                                        />
                                    </div>

                                    <div className="flex items-center bg-slate-100/80 p-1 rounded-2xl border border-slate-200/50 shadow-sm">
                                        {(['tous', 'en_cours', 'termine', 'en_attente'] as FilterStatus[]).map(status => (
                                            <button
                                                key={status}
                                                type="button"
                                                onClick={() => setFilterStatus(status)}
                                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${filterStatus === status
                                                        ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50'
                                                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                                                    }`}
                                            >
                                                {status === 'tous' ? 'Tous' :
                                                    status === 'en_cours' ? 'En cours' :
                                                        status === 'termine' ? 'Terminé' : 'En attente'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Detailed Filters (Date, Chain, Model, Settings) */}
                                <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-2 pl-3 pr-2 border-r border-slate-200">
                                        <Filter className="w-4 h-4 text-slate-400" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">Filtres</span>
                                    </div>

                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 shrink-0 bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 hover:border-slate-300 transition-colors cursor-pointer">
                                        <Calendar className="w-4 h-4 text-indigo-500" />
                                        <span className="hidden xl:inline text-slate-500">Date</span>
                                        <input
                                            type="date"
                                            className="bg-transparent border-none text-xs font-bold text-slate-800 outline-none cursor-pointer"
                                            value={contextDate}
                                            onChange={e => {
                                                setUserOverrodeContextSuggestion(true);
                                                setContextDate(e.target.value);
                                            }}
                                        />
                                    </label>

                                    <div className="relative group shrink-0">
                                        <select className="appearance-none bg-white border border-slate-200/80 rounded-xl pl-9 pr-8 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 shadow-sm cursor-pointer hover:border-slate-300 transition-colors"
                                            value={filterChaine} onChange={e => { setUserOverrodeContextSuggestion(true); setFilterChaine(e.target.value); }}>
                                            <option value="ALL">Toutes les Chaînes</option>
                                            {allChains.map(c => <option key={c} value={c}>{settings.chainNames?.[c] || c}</option>)}
                                        </select>
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <GitMerge className="w-4 h-4 text-indigo-500" />
                                        </div>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                        </div>
                                    </div>

                                    <div className="relative min-w-[200px] max-w-[260px]" ref={modelPickerRef}>
                                        <button
                                            type="button"
                                            onClick={() => setModelPickerOpen(o => !o)}
                                            className="w-full flex items-center gap-2 bg-white border border-slate-200/80 rounded-xl pl-3 pr-8 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 shadow-sm cursor-pointer hover:border-slate-300 transition-all text-left min-w-0"
                                            aria-expanded={modelPickerOpen}
                                            aria-haspopup="listbox"
                                        >
                                            {filterModele === 'ALL' ? (
                                                <span className="truncate flex-1 py-0.5 text-slate-500 font-semibold">Tous les modèles</span>
                                            ) : (
                                                <>
                                                    <span className="w-6 h-6 rounded-md border border-slate-100 bg-slate-50 shrink-0 overflow-hidden flex items-center justify-center">
                                                        {selectedModelSummary?.thumb ? (
                                                            <img src={selectedModelSummary.thumb} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <ImageIcon className="w-3 h-3 text-slate-400" />
                                                        )}
                                                    </span>
                                                    <span className="truncate flex-1">{selectedModelSummary?.name ?? filterModele}</span>
                                                </>
                                            )}
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
                                            </div>
                                        </button>
                                        {modelPickerOpen && (
                                            <div
                                                className="absolute left-0 right-0 top-full mt-2 z-50 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
                                                role="listbox"
                                            >
                                                <button
                                                    type="button"
                                                    role="option"
                                                    aria-selected={filterModele === 'ALL'}
                                                    onClick={() => { setUserOverrodeContextSuggestion(true); setFilterModele('ALL'); setModelPickerOpen(false); }}
                                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${filterModele === 'ALL' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                                >
                                                    Tous les modèles
                                                </button>
                                                {allModelsList.map(m => (
                                                    <button
                                                        key={m.id}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={filterModele === m.id}
                                                        onClick={() => { setUserOverrodeContextSuggestion(true); setFilterModele(m.id); setModelPickerOpen(false); }}
                                                        className={`w-full flex items-center gap-3 px-2 py-2 mt-1 rounded-xl text-left text-xs font-bold transition-colors min-w-0 ${filterModele === m.id ? 'bg-indigo-50 text-indigo-800' : 'text-slate-700 hover:bg-slate-50'}`}
                                                    >
                                                        <span className="w-8 h-8 rounded-lg border border-slate-200 bg-white shrink-0 overflow-hidden flex items-center justify-center shadow-sm">
                                                            {m.thumb ? (
                                                                <img src={m.thumb} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <ImageIcon className="w-4 h-4 text-slate-300" />
                                                            )}
                                                        </span>
                                                        <span className="truncate">{m.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 flex flex-col gap-2">
                            {contextResolution.conflict && (
                                <div className="text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs font-bold">
                                    Plusieurs OF ont de la saisie au créneau {resolvedHourLabel} le {contextDate}. Affinez le filtre chaîne ou modèle.
                                </div>
                            )}
                            {!userOverrodeContextSuggestion && contextResolution.suggestedPlanningIds.length === 1 && !contextResolution.conflict && !selectedProdId && (
                                <div className="flex flex-wrap items-center gap-2 text-xs bg-indigo-50/80 border border-indigo-100 rounded-lg px-3 py-2">
                                    <span className="text-slate-700 font-medium">Contexte détecté pour cette heure.</span>
                                    <button
                                        type="button"
                                        className="font-black text-indigo-700 underline decoration-2"
                                        onClick={() => setSelectedProdId(contextResolution.suggestedPlanningIds[0])}
                                    >
                                        Ouvrir l’OF
                                    </button>
                                </div>
                            )}
                            {userOverrodeContextSuggestion && (
                                <button
                                    type="button"
                                    className="text-left text-[11px] font-bold text-slate-500 hover:text-indigo-600 w-fit"
                                    onClick={() => setUserOverrodeContextSuggestion(false)}
                                >
                                    Réactiver la détection automatique du contexte (heure + date)
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="px-6 pt-3 pb-2 print:hidden shrink-0 flex flex-wrap gap-2 border-b border-slate-200/70 bg-[#fafafa]">
                        <button
                            type="button"
                            onClick={() => setSuiviListTab('module')}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-colors ${suiviListTab === 'module'
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                        >
                            <Table2 className="w-4 h-4 shrink-0" />
                            Suivi module
                        </button>
                        <button
                            type="button"
                            onClick={() => setSuiviListTab('gamme')}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-colors ${suiviListTab === 'gamme'
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                        >
                            <LayoutGrid className="w-4 h-4 shrink-0" />
                            Suivi par poste (gamme)
                        </button>
                    </div>

                    {/* Zone scrollable : min-h-0 obligatoire sinon flex empêche overflow-y (page bloquée) */}
                    <div className="flex-1 p-6 flex flex-col gap-10">
                        {suiviListTab === 'module' && (
                        <>
                        {groupedByChaine.length === 0 && (
                            <div className="text-center py-20 bg-white/60 backdrop-blur-sm rounded-[2rem] border border-slate-200/60 border-dashed max-w-2xl mx-auto shadow-sm mt-8">
                                <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-slate-100 shadow-sm">
                                    <Box className="w-10 h-10 text-slate-300" />
                                </div>
                                <h2 className="text-xl font-black text-slate-700 mb-2 tracking-tight">Aucun modèle en cours</h2>
                                <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                                    Aucun modèle n'est actuellement en phase d'ingénierie, coupe ou atelier, ou ne correspond aux filtres.
                                </p>
                            </div>
                        )}

                        {groupedByChaine.map(group => {
                            const chainDetailRows = group.bottomRows.filter(r => !r.isTot);
                            return (
                            <div key={group.label} className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden flex flex-col">
                                {/* Header Chaîne */}
                                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-4 flex items-center justify-between shadow-inner">
                                    <h2 className="text-xl font-black text-white tracking-wide">{group.label}</h2>
                                    <span className="bg-slate-900/50 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-600/50">
                                        Responsable: {settings.chainStaff?.[group.label]?.[0]?.name || '—'}
                                    </span>
                                </div>

                                {/* Top Table: Models */}
                                <div className="overflow-x-auto border-b-4 border-slate-100">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500 border-b border-slate-200">
                                                <th className="px-3 py-2 text-left border-r border-slate-100">Modèle</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-100">Couleur</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-100">Temps/pièce<br/>(min)</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-100">Total pièces</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-100 text-rose-600">Qté commande</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-100">Écart pièces</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-100">Reste (j.)</th>
                                                <th className="px-2 py-2 text-center text-indigo-600">M.R (%)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {group.prods.map(prod => {
                                                const row = syntheseOfRows.find(r => r.id === prod.id);
                                                if (!row) return null;
                                                return (
                                                    <tr key={prod.id} className="hover:bg-slate-50/50 cursor-pointer group transition-colors" onClick={() => setSelectedProdId(prod.id)}>
                                                        <td className="px-3 py-2 border-r border-slate-100">
                                                            <div className="font-black text-slate-800">{row.modelLabel}</div>
                                                        </td>
                                                        <td className="px-2 py-2 text-center font-bold text-slate-600 border-r border-slate-100">{row.colorName}</td>
                                                        <td className="px-2 py-2 text-center font-mono font-bold text-slate-600 border-r border-slate-100">{row.temArticle?.toFixed(3) || '—'}</td>
                                                        <td className="px-2 py-2 text-center font-black text-emerald-600 border-r border-slate-100 text-base">{row.totalPieces}</td>
                                                        <td className="px-2 py-2 text-center font-black text-rose-500 border-r border-slate-100">{row.commandeNeg}</td>
                                                        <td className={`px-2 py-2 text-center font-black border-r border-slate-100 ${row.ecartPieces >= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                            {row.ecartPieces > 0 ? '+' : ''}{row.ecartPieces}
                                                        </td>
                                                        <td className="px-2 py-2 text-center font-bold text-slate-500 border-r border-slate-100">{row.resteJours != null ? row.resteJours.toFixed(1) : '—'}</td>
                                                        <td className={`px-2 py-2 text-center font-black ${row.mr >= 85 ? 'text-emerald-600 bg-emerald-50/50' : row.mr >= 70 ? 'text-amber-600 bg-amber-50/50' : 'text-rose-600 bg-rose-50/50'}`}>
                                                            {row.mr}%
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Bottom Table: Hourly Output per Day */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100 border-y border-slate-300 text-[9px] font-black uppercase tracking-wider text-slate-600">
                                                <th className="px-2 py-2 text-left border-r border-slate-200 sticky left-0 bg-slate-100 z-10 w-24">Date</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-200 w-12">Jour</th>
                                                <th className="px-2 py-2 text-left border-r border-slate-200 w-32">Modèle</th>
                                                {HOURS.map((h, i) => (
                                                    <th key={h} className="px-2 py-2 text-center border-r border-slate-200 whitespace-nowrap min-w-[60px]" title={h}>{h}</th>
                                                ))}
                                                <th className="px-2 py-2 text-center border-r border-slate-200 bg-indigo-50/50 text-indigo-700 whitespace-nowrap" title="Production journalière (champ totalHeure)">P Journ.</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-200 bg-indigo-50/50 text-indigo-700 whitespace-nowrap" title="Créneaux horaires avec saisie (nombre d’heures ≥ 0)">Créneaux</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-200 min-w-[200px]" title="Effectifs par rôle (CHAF…STG) + tags">
                                                    Eff. rôles
                                                </th>
                                                <th className="px-2 py-2 text-center border-r border-slate-200 bg-emerald-50/50 text-emerald-700">Tot M</th>
                                                <th className="px-2 py-2 text-center bg-violet-50/50 text-violet-700">R%</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {group.bottomRows.length === 0 && (
                                                <tr>
                                                    <td colSpan={8 + HOUR_KEYS.length} className="px-4 py-6 text-center text-slate-400 font-bold text-xs">
                                                        Aucune saisie journalière pour cette chaîne.
                                                    </td>
                                                </tr>
                                            )}
                                            {group.bottomRows.map(row => {
                                                // Dynamic colors for models
                                                const colors = ['bg-blue-50/40 hover:bg-blue-50/70', 'bg-emerald-50/40 hover:bg-emerald-50/70', 'bg-amber-50/40 hover:bg-amber-50/70', 'bg-fuchsia-50/40 hover:bg-fuchsia-50/70'];
                                                const rowClass = row.isTot 
                                                    ? 'bg-slate-50/80 hover:bg-slate-100 transition-colors border-t-2 border-slate-200' 
                                                    : colors[row.colorIndex % colors.length] + ' transition-colors';

                                                return (
                                                    <tr key={row.id} className={rowClass}>
                                                        {row.isTot ? (
                                                            <td colSpan={3} className="px-2 py-2 font-black text-xs text-slate-700 border-r border-slate-200 sticky left-0 bg-slate-50 text-right pr-4 uppercase tracking-widest shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                                                Total Jour {row.date}
                                                            </td>
                                                        ) : (
                                                            <>
                                                                <td className="px-2 py-1.5 font-mono text-[11px] font-bold text-slate-700 border-r border-slate-100 sticky left-0 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] z-10">{row.date}</td>
                                                                <td className="px-2 py-1.5 text-[10px] font-bold text-slate-500 text-center uppercase border-r border-slate-100">{row.weekday.substring(0, 3)}</td>
                                                                <td className="px-2 py-1.5 text-xs font-black text-slate-800 border-r border-slate-100 truncate max-w-[120px]" title={row.modelName}>{row.modelName}</td>
                                                            </>
                                                        )}
                                                        {HOUR_KEYS.map((k) => {
                                                            const val = row.sorties[k];
                                                            return (
                                                                <td key={k} className={`px-2 py-1.5 text-center font-bold border-r border-slate-100 ${row.isTot ? 'text-slate-800' : 'text-slate-700'}`}>
                                                                    {val != null ? val : <span className="text-slate-200">—</span>}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="px-2 py-1.5 text-center font-black text-indigo-700 bg-indigo-50/20 border-r border-slate-100 text-sm">{row.pieces}</td>
                                                        <td className="px-2 py-1.5 text-center font-bold text-indigo-600 bg-indigo-50/20 border-r border-slate-200" title="Nombre de créneaux horaires saisis (≥0)">
                                                            {row.creneauxActifs > 0 ? row.creneauxActifs : '—'}
                                                        </td>
                                                        <td className="px-2 py-1.5 text-center border-r border-slate-200 align-middle min-w-[200px] max-w-[320px]">
                                                            <div className="flex flex-col items-center gap-1">
                                                                {!row.isTot && row.rawSuivi ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={e => {
                                                                            e.stopPropagation();
                                                                            setEffectifsModalSuiviId(row.rawSuivi!.id);
                                                                        }}
                                                                        className="text-[9px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 underline decoration-2"
                                                                    >
                                                                        Modifier
                                                                    </button>
                                                                ) : null}
                                                                <div className="flex flex-wrap gap-1 justify-center">
                                                                    {EFFECTIF_ROLE_KEYS.map(k => {
                                                                        const n = row[k] as number;
                                                                        const tag = row.effectifRoleTags?.[k];
                                                                        if (!n && !tag) return null;
                                                                        return (
                                                                            <span
                                                                                key={k}
                                                                                className="inline-flex flex-col items-center rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[9px] font-black leading-tight text-slate-600 min-w-[2.25rem]"
                                                                                title={k}
                                                                            >
                                                                                <span className="text-slate-400">{EFFECTIF_SHORT[k]}</span>
                                                                                <span>{n > 0 ? n : '—'}</span>
                                                                                {tag ? (
                                                                                    <span className="text-indigo-600 font-bold normal-case max-w-[4.5rem] truncate text-[8px]">
                                                                                        {tag}
                                                                                    </span>
                                                                                ) : null}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                                {!row.isTot &&
                                                                EFFECTIF_ROLE_KEYS.every(k => !(row[k] as number) && !row.effectifRoleTags?.[k]) ? (
                                                                    <span className="text-slate-300 font-bold">—</span>
                                                                ) : null}
                                                            </div>
                                                        </td>
                                                        <td className="px-2 py-1.5 text-center font-black text-emerald-700 bg-emerald-50/20 border-r border-slate-200">{row.totalWorkers || '—'}</td>
                                                        <td className={`px-2 py-1.5 text-center font-black text-sm bg-violet-50/20 ${row.efficiency >= 85 ? 'text-emerald-600' : row.efficiency >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                                                            {row.efficiency}%
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        {group.bottomRows.length > 0 && (
                                            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                                <tr>
                                                    <td colSpan={3} className="px-2 py-2 text-right font-black text-slate-500 text-[10px] uppercase border-r border-slate-200">Total</td>
                                                    {HOUR_KEYS.map((k) => {
                                                        const sum = chainDetailRows.reduce((acc, row) => acc + (row.sorties[k] || 0), 0);
                                                        return (
                                                            <td key={k} className="px-2 py-2 text-center font-black text-slate-700 border-r border-slate-200">{sum > 0 ? sum : ''}</td>
                                                        );
                                                    })}
                                                    <td className="px-2 py-2 text-center font-black text-indigo-700 bg-indigo-100/50 border-r border-slate-200">
                                                        {chainDetailRows.reduce((acc, r) => acc + r.pieces, 0)}
                                                    </td>
                                                    <td className="px-2 py-2 text-center font-black text-indigo-700 bg-indigo-100/50 border-r border-slate-200">
                                                        {chainDetailRows.reduce((acc, r) => acc + r.creneauxActifs, 0)}
                                                    </td>
                                                    <td className="border-r border-slate-200 bg-slate-50"></td>
                                                    <td className="px-2 py-2 text-center font-black text-emerald-700 bg-emerald-100/50 border-r border-slate-200">—</td>
                                                    <td className="px-2 py-2 text-center font-black text-violet-700 bg-violet-100/50">—</td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>
                            );
                        })}
                        </>
                        )}
                        {suiviListTab === 'gamme' && (
                            <div className="max-w-6xl mx-auto w-full space-y-4">
                                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                    Saisie par <strong className="text-slate-700">opération de gamme</strong> (une ligne par jour OF déjà saisi). Les enregistrements utilisent{' '}
                                    <code className="text-[10px] bg-slate-100 px-1 rounded">posteId = id opération</code> — complémentaire du suivi par poste d’implantation dans la fiche OF.
                                </p>
                                {gammePosteStatus === 'loading' && (
                                    <p className="text-sm font-bold text-slate-600">Chargement des données poste…</p>
                                )}
                                {gammePosteStatus === 'error' && (
                                    <p className="text-sm font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                        API poste-suivi indisponible — vérifiez la connexion ou la session.
                                    </p>
                                )}
                                <div className="flex flex-wrap justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setGammeDraft({})}
                                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50"
                                    >
                                        Réinitialiser brouillon
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void saveGammePosteBatch()}
                                        className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                                    >
                                        Enregistrer les lignes modifiées
                                    </button>
                                </div>
                                <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-sm">
                                    <table className="w-full text-sm border-collapse min-w-[720px]">
                                        <thead>
                                            <tr className="bg-slate-100 border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-600">
                                                <th className="px-2 py-2 text-left border-r border-slate-200">Date</th>
                                                <th className="px-2 py-2 text-left border-r border-slate-200">Chaîne</th>
                                                <th className="px-2 py-2 text-left border-r border-slate-200">Modèle</th>
                                                <th className="px-2 py-2 text-left border-r border-slate-200">Opération</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-200 w-12">Ord.</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-200">Entrées</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-200">Sorties</th>
                                                <th className="px-2 py-2 text-center border-r border-slate-200">Défaut</th>
                                                <th className="px-2 py-2 text-left border-r border-slate-200 min-w-[140px]">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {gammePlanningRows.length === 0 ? (
                                                <tr>
                                                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400 font-bold text-xs">
                                                        Aucune ligne (vérifiez filtres, gamme opératoire, ou présence de jours saisis sur les OF).
                                                    </td>
                                                </tr>
                                            ) : (
                                                gammePlanningRows.map(gr => {
                                                    const dk = `${gr.planningId}|${gr.opId}|${gr.date}`;
                                                    const fromDb = gammePosteCache.find(
                                                        r => r.planningId === gr.planningId && r.posteId === gr.opId && r.date === gr.date,
                                                    );
                                                    const dr = gammeDraft[dk] || {};
                                                    const ent = dr.pieces_entrees ?? fromDb?.pieces_entrees ?? 0;
                                                    const sor = dr.pieces_sorties ?? fromDb?.pieces_sorties ?? 0;
                                                    const def = dr.pieces_defaut ?? fromDb?.pieces_defaut ?? 0;
                                                    const notes = (dr.notes as string | undefined) ?? fromDb?.notes ?? '';
                                                    const patchDraft = (patch: Partial<PosteSuiviData>) =>
                                                        setGammeDraft(prev => ({ ...prev, [dk]: { ...prev[dk], ...patch } }));
                                                    return (
                                                        <tr key={gr.key} className="hover:bg-slate-50/80">
                                                            <td className="px-2 py-1.5 font-mono text-xs border-r border-slate-100">{gr.date}</td>
                                                            <td className="px-2 py-1.5 text-xs font-bold text-slate-700 border-r border-slate-100">{gr.chainLabel}</td>
                                                            <td className="px-2 py-1.5 text-xs font-black text-slate-800 border-r border-slate-100 max-w-[140px] truncate" title={gr.modelLabel}>
                                                                {gr.modelLabel}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-xs text-slate-700 border-r border-slate-100 max-w-[200px]" title={gr.opDesc}>
                                                                {gr.opDesc}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center font-mono text-xs border-r border-slate-100">{gr.opOrder}</td>
                                                            <td className="px-1 py-1 border-r border-slate-100">
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    className="w-full min-w-[4rem] h-8 px-1 text-center text-xs font-bold rounded border border-slate-200"
                                                                    value={ent === 0 && !gammeDraft[dk]?.pieces_entrees && !fromDb ? '' : String(ent)}
                                                                    onChange={e => {
                                                                        const v = e.target.value;
                                                                        patchDraft({ pieces_entrees: v === '' ? undefined : Math.max(0, Math.floor(Number(v)) || 0) });
                                                                    }}
                                                                />
                                                            </td>
                                                            <td className="px-1 py-1 border-r border-slate-100">
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    className="w-full min-w-[4rem] h-8 px-1 text-center text-xs font-bold rounded border border-slate-200"
                                                                    value={sor === 0 && !gammeDraft[dk]?.pieces_sorties && !fromDb ? '' : String(sor)}
                                                                    onChange={e => {
                                                                        const v = e.target.value;
                                                                        patchDraft({ pieces_sorties: v === '' ? undefined : Math.max(0, Math.floor(Number(v)) || 0) });
                                                                    }}
                                                                />
                                                            </td>
                                                            <td className="px-1 py-1 border-r border-slate-100">
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    className="w-full min-w-[4rem] h-8 px-1 text-center text-xs font-bold rounded border border-slate-200"
                                                                    value={def === 0 && !gammeDraft[dk]?.pieces_defaut && !fromDb ? '' : String(def)}
                                                                    onChange={e => {
                                                                        const v = e.target.value;
                                                                        patchDraft({ pieces_defaut: v === '' ? undefined : Math.max(0, Math.floor(Number(v)) || 0) });
                                                                    }}
                                                                />
                                                            </td>
                                                            <td className="px-1 py-1">
                                                                <input
                                                                    type="text"
                                                                    className="w-full h-8 px-2 text-xs font-medium rounded border border-slate-200"
                                                                    value={notes}
                                                                    onChange={e => patchDraft({ notes: e.target.value })}
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
            <SuiviEffectifsModal
                open={Boolean(effectifsModalSuiviId)}
                suivi={effectifsModalSuiviId ? suivis.find(s => s.id === effectifsModalSuiviId) ?? null : null}
                onClose={() => setEffectifsModalSuiviId(null)}
                onConfirm={next => {
                    const totalWorkers = EFFECTIF_ROLE_KEYS.reduce((acc, k) => acc + (Number(next[k]) || 0), 0);
                    setSuivis(prev => prev.map(s => (s.id === next.id ? { ...next, totalWorkers } : s)));
                }}
            />
        </div>
    );
}
