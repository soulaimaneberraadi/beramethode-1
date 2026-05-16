import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { AppSettings, Lot, Machine, ModelData, PlanningEvent, PlanningStatus, SuiviData } from '../types';
import {
    calculateSectionDates,
    calculateEndDate,
    parsePlanningDateAtNoon,
    planningLocalDateKey,
    getNetWorkHours,
    isPlanningWorkingDay,
} from '../utils/planning';
import { computeChainEfficiency } from '../utils/efficiency';
import { getChainDailyCapacity, maxDayLoadRatioInSpan, overloadDaysInSpan } from '../utils/capacity';
import { getChainMachineIds, validateMachineCoverage } from '../utils/machineMatch';
import { evaluateStockForPlanning, formatStockBlockedReason, materialStockRowsForDisplay } from '../utils/materialNeeds';
import DateTimePicker from './ui/DateTimePicker';
import LotsEditor from './planning/LotsEditor';
import BlockingConfirm from './planning/BlockingConfirm';
import CapacityRibbon from './planning/CapacityRibbon';
import MachineCoverageTable from './planning/MachineCoverageTable';
import MaterialArrivalTimeline from './planning/MaterialArrivalTimeline';
import {
    PLANNING_STATUS_EMERALD_SURFACE,
    PLANNING_STATUS_BRAND_SURFACE,
    PLANNING_STATUS_RED_SURFACE,
    PLANNING_STATUS_ORANGE_SURFACE,
    PLANNING_STATUS_AMBER_SURFACE,
} from './planning/planningDesignTokens';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, Layers, Split, ArrowRightCircle,
    Plus, X, ChevronLeft, ChevronRight, ChevronDown, Calendar,
    Clock, Target, Check, Trash2, Eye, Edit2,
    PanelLeftClose, PanelLeftOpen, Package, Ruler, Palette,
    Activity, TrendingUp, AlertCircle, CheckCircle2, User,
    Truck, Warehouse, Shirt, Wrench,
} from 'lucide-react';

const EMPTY_LOTS: Lot[] = [];

interface PlanningProps {
    models: ModelData[];
    planningEvents: PlanningEvent[];
    suivis: SuiviData[];
    setPlanningEvents: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    setModels: React.Dispatch<React.SetStateAction<ModelData[]>>;
    setSuivis: React.Dispatch<React.SetStateAction<SuiviData[]>>;
    setCurrentView: (view: 'planning' | 'suivi' | 'dashboard' | 'atelier' | 'library' | 'coupe' | 'effectifs' | 'gestionRh' | 'magasin' | 'config' | 'profil' | 'admin' | 'rendement') => void;
    onOpenSuivi?: (planningEventId: string) => void;
    settings: AppSettings;
    machines: Machine[];
}

type HeaderPopoverKind = 'logistics' | 'total' | 'ready' | 'inProg' | 'atRisk' | 'done';

// ── Status Config (Light Theme) ──────────────────────────────────────────────
const STATUS_CONFIG: Record<string, {
    label: string; bar: string; bg: string; border: string; dot: string;
    textColor: string; badgeBg: string; badgeText: string;
}> = {
    READY: {
        label: 'Prêt',
        ...PLANNING_STATUS_EMERALD_SURFACE,
        textColor: 'text-emerald-800',
        badgeBg: 'bg-emerald-100',
        badgeText: 'text-emerald-700',
    },
    BLOCKED_STOCK: { label: 'Bloqué Stock', ...PLANNING_STATUS_RED_SURFACE },
    EXTERNAL_PROCESS: { label: 'Sous-trait.', ...PLANNING_STATUS_ORANGE_SURFACE },
    IN_PROGRESS: { label: 'En cours', ...PLANNING_STATUS_BRAND_SURFACE },
    DONE: {
        label: 'Terminé',
        ...PLANNING_STATUS_EMERALD_SURFACE,
        textColor: 'text-emerald-900',
        badgeBg: 'bg-emerald-100',
        badgeText: 'text-emerald-800',
    },
    ON_TRACK: { label: 'En cours', ...PLANNING_STATUS_BRAND_SURFACE },
    AT_RISK: { label: 'À risque', ...PLANNING_STATUS_AMBER_SURFACE },
    OFF_TRACK: { label: 'Hors délai', ...PLANNING_STATUS_RED_SURFACE },
};

const DAY_WIDTH_MAP = { daily: 240, weekly: 120, monthly: 40 };
const MODEL_COLORS = ['#2149C1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];

// ── Helpers (dates canoniques : `utils/planning`) ───────────────────────────

/** Infobulle native : date complète en français. */
function formatPlanningTooltipLine(iso?: string): string {
    if (!iso) return '—';
    const d = parsePlanningDateAtNoon(iso);
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Libellé court sur la barre Gantt (début → fin). */
function formatGanttShortDate(iso?: string): string {
    if (!iso) return '—';
    const d = parsePlanningDateAtNoon(iso);
    const yNow = new Date().getFullYear();
    return d.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        ...(d.getFullYear() !== yNow ? { year: 'numeric' as const } : {}),
    });
}

function buildTimeline(refDate: Date): Date[] {
    const dates: Date[] = [];
    const start = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
    const end   = new Date(refDate.getFullYear(), refDate.getMonth() + 2, 0);
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d));
    }
    return dates;
}

/** Détail des jours > 100 % pour enrichir le modal capacité (§ plan : alerte surcharge). */
function formatOverloadDaysHint(
    events: PlanningEvent[],
    chainId: string,
    cap: number,
    startYmd: string,
    endYmd: string
): string {
    const days = overloadDaysInSpan(events, chainId, cap, startYmd, endYmd, 6);
    if (!days.length) return '';
    const lines = days.map(d => {
        const short = parsePlanningDateAtNoon(d.dateKey).toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
        });
        return `• ${short} → ~${Math.round(d.ratio * 100)} %`;
    });
    return `\n\nJours critiques :\n${lines.join('\n')}`;
}

// ── Inline style helpers ─────────────────────────────────────────────────────
const labelCls = 'text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5';
const inputCls = 'w-full bg-slate-50 border border-slate-200 focus:border-[#2149C1] focus:ring-2 focus:ring-[#2149C1]/10 text-slate-800 rounded-xl px-4 py-2.5 outline-none text-sm transition-all';

// ── Component ─────────────────────────────────────────────────────────────────
export default function Planning({ models, planningEvents, suivis, setPlanningEvents, setModels, setSuivis, setCurrentView, onOpenSuivi, settings, machines }: PlanningProps) {

    const [viewMode, setViewMode]       = useState<'daily' | 'weekly' | 'monthly'>('weekly');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedEvent, setSelectedEvent] = useState<PlanningEvent | null>(null);
    const [eventDetailTab, setEventDetailTab] = useState<'resume' | 'lots' | 'materials' | 'machines'>('resume');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    /** Dépassement capacité — glisser / créer / éditer OF. */
    const [capacityConfirm, setCapacityConfirm] = useState<null | {
        title: string;
        message: string;
        onProceed: () => void;
    }>(null);
    /** Couverture classes machines (gamme vs parc affecté à la ligne). */
    const [machineConfirm, setMachineConfirm] = useState<null | {
        title: string;
        message: string;
        onProceed: () => void;
    }>(null);

    useEffect(() => {
        if (!selectedEvent) setEventDetailTab('resume');
    }, [selectedEvent]);
    const [contextMenu, setContextMenu]     = useState<{ x: number; y: number; eventId: string } | null>(null);
    const [splitModal, setSplitModal]       = useState<PlanningEvent | null>(null);
    const [splitQty, setSplitQty]           = useState(0);
    const [addModal, setAddModal]           = useState(false);
    /** Clé jour = `YYYY-MM-DD` local (aligné grille / parsePlanningDateAtNoon — pas toISOString UTC). */
    const [dragOverInfo, setDragOverInfo]   = useState<{ chaineId: string; dateKey: string } | null>(null);
    /** Glisser-déposer OF — pour surligner la cellule si le dépôt dépasserait la capacité. */
    const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen]     = useState(true);
    const [editModal, setEditModal]         = useState<PlanningEvent | null>(null);
    const [editForm, setEditForm]           = useState({ quantity: 0, startDate: '', strictDeadline_DDS: '', chaineId: '', clientName: '' });

    /** Tri des pastilles OF dans l’en-tête (client, modèle ou date de lancement) */
    const [ofHeaderSort, setOfHeaderSort] = useState<'client' | 'modele' | 'date'>('client');
    const [headerPopover, setHeaderPopover] = useState<null | { kind: HeaderPopoverKind; top: number; left: number; width: number }>(null);
    const [headerOrdresExpanded, setHeaderOrdresExpanded] = useState(false);
    const headerPopoverRef = useRef<HTMLDivElement>(null);

    /** Phase 5–6 — catalogue + lots magasin (délais fournisseur pour ETA) */
    const [magasinStock, setMagasinStock] = useState<{
        products: {
            id: string;
            designation: string;
            reference?: string;
            fournisseurNom?: string;
            fournisseurDelaiLivraisonJours?: number;
        }[];
        lots: { productId: string; quantiteRestante: number; quantiteReservee?: number }[];
    } | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [rp, rl] = await Promise.all([
                    fetch('/api/magasin/products', { credentials: 'include' }),
                    fetch('/api/magasin/lots', { credentials: 'include' }),
                ]);
                if (!rp.ok || !rl.ok) return;
                const products = await rp.json();
                const lots = await rl.json();
                if (!cancelled) setMagasinStock({ products, lots });
            } catch {
                /* pas de blocage planning si API magasin indisponible */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const [newEv, setNewEv] = useState({
        modelId: '',
        chaineId: 'CHAINE 1',
        startDate: new Date().toISOString().split('T')[0],
        quantity: 0,
        clientName: '',
        strictDeadline_DDS: '',
        fournisseurDate: '' as string,
        color: '#2149C1',
    });

    const openEditModal = (ev: PlanningEvent) => {
        setEditModal(ev);
        setEditForm({
            quantity: ev.totalQuantity || ev.qteTotal || 0,
            startDate: (ev.startDate || ev.dateLancement || '').split('T')[0],
            strictDeadline_DDS: ev.strictDeadline_DDS || '',
            chaineId: ev.chaineId || '',
            clientName: ev.clientName || '',
        });
    };

    const commitEdit = () => {
        if (!editModal) return;
        const model  = models.find(m => m.id === editModal.modelId);
        const chaine = chaines.find(c => c.id === editForm.chaineId);
        const sam    = model?.meta_data.total_temps || 15;
        const eff    = chaine?.efficiency ?? 0.85;
        const endIso = calculateEndDate(editForm.startDate, editForm.quantity, sam, eff, settings);
        const cap    = getChainDailyCapacity(settings.chainCapacityPerDay, editForm.chaineId, 1000);
        const updated: PlanningEvent = {
            ...editModal,
            totalQuantity: editForm.quantity, qteTotal: editForm.quantity,
            startDate: editForm.startDate, dateLancement: editForm.startDate,
            estimatedEndDate: endIso, dateExport: endIso,
            strictDeadline_DDS: editForm.strictDeadline_DDS || undefined,
            chaineId: editForm.chaineId, clientName: editForm.clientName,
        };
        const stocked = applyMaterialStock(updated, editForm.quantity);
        const next = planningEvents.map(ev => (ev.id === editModal.id ? stocked : ev));
        const endDay = (endIso || '').split('T')[0];
        const maxR   = maxDayLoadRatioInSpan(next, editForm.chaineId, cap, editForm.startDate, endDay);

        const saveEdit = () => {
            if (maxR > 1.0001) {
                setCapacityConfirm({
                    title: 'Capacité dépassée',
                    message:
                        `La charge atteint environ ${Math.round(maxR * 100)} % (${cap} pcs/j) sur au moins un jour. Enregistrer quand même ?` +
                        formatOverloadDaysHint(next, editForm.chaineId, cap, editForm.startDate, endDay),
                    onProceed: () => {
                        setPlanningEvents(prev => prev.map(ev => (ev.id === editModal.id ? stocked : ev)));
                        setEditModal(null);
                    },
                });
                return;
            }
            setPlanningEvents(prev => prev.map(ev => (ev.id === editModal.id ? stocked : ev)));
            setEditModal(null);
        };

        const ops = model?.gamme_operatoire ?? [];
        const chainIds = getChainMachineIds(editForm.chaineId, settings, machines);
        const mc = validateMachineCoverage(ops, machines, chainIds);
        if (!mc.ok) {
            setMachineConfirm({
                title: 'Couverture machines',
                message:
                    `Classes sans machine sur cette ligne (${editForm.chaineId}) : ${mc.missingClasses.join(', ')}. Enregistrer quand même ?`,
                onProceed: () => {
                    saveEdit();
                },
            });
            return;
        }
        saveEdit();
    };

    const DAY_WIDTH = DAY_WIDTH_MAP[viewMode];
    const timelineRef = useRef<HTMLDivElement>(null);

    const chaines = useMemo(() => {
        return Array.from({ length: settings.chainsCount || 12 }, (_, i) => {
            const id = `CHAINE ${i + 1}`;
            const { eff, n } = computeChainEfficiency(suivis, planningEvents, models, id, settings);
            return {
                id,
                name: settings.chainNames?.[id] || id,
                capacityPerDay: getChainDailyCapacity(settings.chainCapacityPerDay, id, 1000),
                isActive: true,
                efficiency: eff,
                efficiencySource: n > 0 ? ('COMPUTED' as const) : undefined,
                efficiencySampleSize: n,
            };
        });
    }, [settings.chainsCount, settings.chainNames, suivis, planningEvents, models, settings]);

    function applyMaterialStock<T extends PlanningEvent>(ev: T, qty: number): T {
        if (!magasinStock?.products?.length) return ev;
        const model = models.find(m => m.id === ev.modelId);
        const lots = magasinStock.lots ?? [];
        const evalResult = evaluateStockForPlanning(model, qty, magasinStock.products, lots);
        if (!evalResult.ok) {
            const shortRows = evalResult.shortages.map(s => ({
                name: s.name,
                unit: s.unit,
                productId: s.productId,
                required: s.required,
                available: s.available,
                missing: s.missing,
                unmatched: s.unmatched,
            }));
            return {
                ...ev,
                status: 'BLOCKED_STOCK',
                blockedReason: formatStockBlockedReason(evalResult.shortages),
                materialShortages: shortRows,
            };
        }
        const cleared: T = { ...ev };
        delete (cleared as PlanningEvent).materialShortages;
        const br = ev.blockedReason;
        const autoStockBlock =
            ev.status === 'BLOCKED_STOCK' &&
            (!!(ev.materialShortages && ev.materialShortages.length > 0) ||
                !!((br && /^Stock insuffisant|^Article inconnu/.test(br))));
        if (autoStockBlock) {
            (cleared as PlanningEvent).status = 'READY';
            (cleared as PlanningEvent).blockedReason = undefined;
        } else if (br && /^Stock insuffisant|^Article inconnu/.test(br)) {
            (cleared as PlanningEvent).blockedReason = undefined;
        }
        return cleared;
    }

    /** Phase 6 — persiste la date fournisseur ; si section prépa/montage activée, recale montage via calculateSectionDates. */
    function applyFournisseurDateToEvent(ev: PlanningEvent, ymd: string, model: ModelData | undefined): PlanningEvent {
        const next: PlanningEvent = { ...ev, fournisseurDate: ymd };
        const splitEnabled = next.sectionSplitEnabled ?? model?.ficheData?.sectionSplitEnabled ?? false;
        if (!splitEnabled || !model) return next;
        const sd = calculateSectionDates(next, model, settings);
        return {
            ...next,
            prepStart: sd.prepStart ?? next.prepStart,
            prepEnd: sd.prepEnd ?? next.prepEnd,
            montageStart: sd.montageStart ?? next.montageStart,
            montageEnd: sd.montageEnd ?? next.montageEnd,
        };
    }

    const timelineDates = useMemo(() => buildTimeline(currentDate), [currentDate]);

    const timelineWindowYmd = useMemo(() => {
        if (!timelineDates.length) return null;
        return {
            lo: planningLocalDateKey(timelineDates[0]),
            hi: planningLocalDateKey(timelineDates[timelineDates.length - 1]),
        };
    }, [timelineDates]);

    /** Lignes avec pic > 100 % sur la fenêtre calendrier (alerte visuelle en-tête + jauge sidebar). */
    const capacityGlobalOverload = useMemo(() => {
        if (!timelineWindowYmd) return [];
        const { lo, hi } = timelineWindowYmd;
        return chaines
            .map(ch => {
                const maxR = maxDayLoadRatioInSpan(planningEvents, ch.id, ch.capacityPerDay, lo, hi);
                return { id: ch.id, name: ch.name, maxR, cap: ch.capacityPerDay };
            })
            .filter(x => x.maxR > 1.0001);
    }, [timelineWindowYmd, chaines, planningEvents]);

    /** Prévisualisation d'un drop sur la cellule survolée : pic de charge + couverture machines + stock magasin (un parcours). */
    const previewDrop = useMemo(() => {
        const empty = {
            maxRatio: null as number | null,
            machineMissing: null as string[] | null,
            stockShortage: false,
        };
        if (!draggingEventId || !dragOverInfo) return empty;
        const ev = planningEvents.find(x => x.id === draggingEventId);
        if (!ev) return empty;
        const { chaineId, dateKey } = dragOverInfo;
        const chaine = chaines.find(c => c.id === chaineId);
        const model = models.find(m => m.id === ev.modelId);
        if (!model) return empty;

        const ops = model.gamme_operatoire ?? [];
        const ids = getChainMachineIds(chaineId, settings, machines);
        const mc = validateMachineCoverage(ops, machines, ids);
        const machineMissing = mc.ok ? null : mc.missingClasses;

        const sam = model.meta_data.total_temps || 15;
        const qty = ev.totalQuantity || ev.qteTotal || 0;
        const eff = chaine?.efficiency ?? 0.85;
        const endIso = calculateEndDate(dateKey, qty, sam, eff, settings);
        const updated: PlanningEvent = {
            ...ev,
            chaineId,
            startDate: dateKey,
            dateLancement: dateKey,
            estimatedEndDate: endIso,
            dateExport: endIso,
        };
        const next = planningEvents.map(x => (x.id === draggingEventId ? updated : x));
        const cap = getChainDailyCapacity(settings.chainCapacityPerDay, chaineId, 1000);
        const endDay = (endIso || '').split('T')[0];
        const maxRatio = maxDayLoadRatioInSpan(next, chaineId, cap, dateKey, endDay);

        let stockShortage = false;
        if (magasinStock?.products?.length) {
            const st = evaluateStockForPlanning(model, qty, magasinStock.products, magasinStock.lots ?? []);
            stockShortage = !st.ok;
        }

        return { maxRatio, machineMissing, stockShortage };
    }, [draggingEventId, dragOverInfo, planningEvents, chaines, models, settings, machines, magasinStock]);

    /** Molette (sans Shift) → scroll horizontal ; Shift+molette / pavé : inchangé ou géré ci-dessous. passive: false requis pour preventDefault. */
    useEffect(() => {
        const el = timelineRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (el.scrollWidth <= el.clientWidth + 2) return;
            // Laisser le zoom navigateur (pavé / pinch → souvent ctrlKey + wheel)
            if (e.ctrlKey) return;
            const dx = e.deltaX;
            const dy = e.deltaY;
            if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0) return;
            if (e.shiftKey && dy !== 0) {
                const maxL = el.scrollWidth - el.clientWidth;
                const next = Math.max(0, Math.min(maxL, el.scrollLeft + dy));
                if (next === el.scrollLeft && dy !== 0) return;
                e.preventDefault();
                el.scrollLeft = next;
                return;
            }
            if (dy === 0) return;
            const maxL = el.scrollWidth - el.clientWidth;
            const next = Math.max(0, Math.min(maxL, el.scrollLeft + dy));
            if (next === el.scrollLeft) return;
            e.preventDefault();
            el.scrollLeft = next;
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [viewMode, currentDate, planningEvents.length, chaines.length]);

    useEffect(() => {
        const handle = () => setContextMenu(null);
        window.addEventListener('click', handle);
        return () => window.removeEventListener('click', handle);
    }, []);

    const todayOffset = useMemo(() => {
        const today = new Date();
        const first = timelineDates[0];
        const origin = new Date(first.getFullYear(), first.getMonth(), first.getDate(), 12, 0, 0, 0);
        const t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
        const diff = (t.getTime() - origin.getTime()) / (1000 * 3600 * 24);
        return diff * DAY_WIDTH;
    }, [timelineDates, DAY_WIDTH]);

    const getEventStyle = (ev: PlanningEvent) => {
        const start = ev.startDate || ev.dateLancement;
        if (!start) return { display: 'none' } as React.CSSProperties;
        const model = models.find(m => m.id === ev.modelId);
        const chaine = chaines.find(c => c.id === ev.chaineId);
        const qty = ev.totalQuantity ?? ev.qteTotal ?? 0;
        const storedEnd = ev.estimatedEndDate || ev.dateExport;
        let endIso = storedEnd;
        if (model && qty > 0) {
            const rawSam = Number(model.meta_data?.total_temps);
            const samMin = Number.isFinite(rawSam) && rawSam > 0 ? rawSam : 15;
            endIso = calculateEndDate(start, qty, samMin, chaine?.efficiency ?? 0.85, settings);
        }
        if (!endIso) return { display: 'none' } as React.CSSProperties;

        const first = timelineDates[0];
        const origin = new Date(first.getFullYear(), first.getMonth(), first.getDate(), 12, 0, 0, 0);
        const spanStart = parsePlanningDateAtNoon(start);
        const spanEnd = parsePlanningDateAtNoon(endIso);
        const offsetDays = (spanStart.getTime() - origin.getTime()) / (1000 * 3600 * 24);
        const durationDays = Math.max(0.5, (spanEnd.getTime() - spanStart.getTime()) / (1000 * 3600 * 24));
        return { left: `${Math.max(0, offsetDays * DAY_WIDTH)}px`, width: `${durationDays * DAY_WIDTH}px` } as React.CSSProperties;
    };

    /** Même logique de fin que le rendu / largeur de barre (SAM + efficacité + jours ouvrés). */
    const getPlannedEndIso = (ev: PlanningEvent): string => {
        const start = ev.startDate || ev.dateLancement;
        if (!start) return ev.estimatedEndDate || ev.dateExport || '';
        const model = models.find(m => m.id === ev.modelId);
        const chaine = chaines.find(c => c.id === ev.chaineId);
        const qty = ev.totalQuantity ?? ev.qteTotal ?? 0;
        let endIso = ev.estimatedEndDate || ev.dateExport || '';
        if (model && qty > 0) {
            const rawSam = Number(model.meta_data?.total_temps);
            const samMin = Number.isFinite(rawSam) && rawSam > 0 ? rawSam : 15;
            endIso = calculateEndDate(start, qty, samMin, chaine?.efficiency ?? 0.85, settings);
        }
        return endIso;
    };

    const buildEventHoverTitle = (ev: PlanningEvent): string => {
        const m = models.find(x => x.id === ev.modelId);
        const ch = chaines.find(c => c.id === ev.chaineId);
        const name = ev.modelName || m?.meta_data?.nom_modele || 'Ordre';
        const client = ev.clientName || m?.ficheData?.client;
        const qty = ev.totalQuantity ?? ev.qteTotal ?? 0;
        const prod = ev.producedQuantity ?? ev.qteProduite ?? 0;
        const startIso = ev.startDate || ev.dateLancement || '';
        const endIso = getPlannedEndIso(ev);
        const cfg = STATUS_CONFIG[ev.status] || STATUS_CONFIG.ON_TRACK;
        const pct = qty > 0 ? Math.min(100, Math.round((prod / qty) * 100)) : 0;
        const lines: string[] = [`OF — ${name}`];
        if (client) lines.push(`Client : ${client}`);
        lines.push(`Ligne : ${ch?.name || '—'}`);
        lines.push(`Statut : ${cfg.label}`);
        lines.push(`Quantité : ${prod} / ${qty} pcs (${pct} %)`);
        if (startIso) lines.push(`Début planifié : ${formatPlanningTooltipLine(startIso)}`);
        lines.push(`Fin prévue : ${formatPlanningTooltipLine(endIso)}`);
        if (ev.strictDeadline_DDS) lines.push(`DDS (échéance) : ${formatPlanningTooltipLine(ev.strictDeadline_DDS)}`);
        if (ev.fournisseurDate) lines.push(`Réception fournisseur : ${formatPlanningTooltipLine(ev.fournisseurDate)}`);
        const sam = m?.meta_data?.total_temps;
        if (sam != null && Number(sam) > 0) lines.push(`SAM modèle : ${sam} min / pièce`);
        if (ev.blockedReason) lines.push(`Blocage : ${ev.blockedReason}`);
        lines.push(`Réf. : ${ev.id}`);
        return lines.join('\n');
    };

    /** Pièces produites : totalHeure (suivi) = heures machine, pas des pièces — ne pas l’utiliser ici. */
    const getRealProduction = (ev: PlanningEvent): number =>
        Number(ev.producedQuantity ?? ev.qteProduite ?? 0);

    const getProgress = (ev: PlanningEvent) => {
        const qty  = ev.totalQuantity  || ev.qteTotal     || 1;
        const prod = getRealProduction(ev);
        return Math.min(100, Math.round((prod / qty) * 100));
    };

    const isAtRisk = (ev: PlanningEvent) => {
        if (ev.status === 'BLOCKED_STOCK') return true;
        const end = ev.estimatedEndDate || ev.dateExport;
        const dds = ev.strictDeadline_DDS;
        return !!(end && dds && parsePlanningDateAtNoon(end).getTime() > parsePlanningDateAtNoon(dds).getTime());
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData('eventId', id);
        e.dataTransfer.effectAllowed = 'move';
        setDraggingEventId(id);
        try {
            e.dataTransfer.setData('text/plain', id);
        } catch {
            /* ignore */
        }
    };
    const handleDragOver = (e: React.DragEvent, chaineId: string, dateKey: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverInfo({ chaineId, dateKey });
    };
    const handleDrop = (e: React.DragEvent, chaineId: string, dateKey: string) => {
        e.preventDefault();
        setDragOverInfo(null);
        setDraggingEventId(null);
        const id = e.dataTransfer.getData('eventId') || e.dataTransfer.getData('text/plain');
        if (!id) return;
        const ev = planningEvents.find(x => x.id === id);
        if (!ev) return;
        const chaine = chaines.find(c => c.id === chaineId);
        const model  = models.find(m => m.id === ev.modelId);
        const sam    = model?.meta_data.total_temps || 15;
        const qty    = ev.totalQuantity || ev.qteTotal || 0;
        const eff    = chaine?.efficiency ?? 0.85;
        const endIso = calculateEndDate(dateKey, qty, sam, eff, settings);
        const updated: PlanningEvent = {
            ...ev,
            chaineId,
            startDate: dateKey,
            dateLancement: dateKey,
            estimatedEndDate: endIso,
            dateExport: endIso,
        };
        const stocked = applyMaterialStock(updated, qty);
        const next   = planningEvents.map(x => (x.id === id ? stocked : x));
        const cap    = getChainDailyCapacity(settings.chainCapacityPerDay, chaineId, 1000);
        const endDay = (endIso || '').split('T')[0];
        const maxR   = maxDayLoadRatioInSpan(next, chaineId, cap, dateKey, endDay);

        const applyDrop = () => {
            if (maxR > 1.0001) {
                setCapacityConfirm({
                    title: 'Dépassement de capacité',
                    message:
                        `Charge ~${Math.round(maxR * 100)} % (${cap} pcs/j) sur au moins un jour. Déplacer quand même ?` +
                        formatOverloadDaysHint(next, chaineId, cap, dateKey, endDay),
                    onProceed: () => {
                        setPlanningEvents(p => p.map(x => (x.id === id ? stocked : x)));
                    },
                });
                return;
            }
            setPlanningEvents(prev => prev.map(x => (x.id === id ? stocked : x)));
        };

        const ops = model?.gamme_operatoire ?? [];
        const chainIds = getChainMachineIds(chaineId, settings, machines);
        const mc = validateMachineCoverage(ops, machines, chainIds);
        if (!mc.ok) {
            setMachineConfirm({
                title: 'Couverture machines',
                message:
                    `Classes sans machine sur ${chaineId} : ${mc.missingClasses.join(', ')}. Déplacer l’OF quand même ?`,
                onProceed: () => {
                    applyDrop();
                },
            });
            return;
        }
        applyDrop();
    };

    const commitSplit = () => {
        if (!splitModal) return;
        const origQty = splitModal.totalQuantity || splitModal.qteTotal || 1;
        if (splitQty <= 0 || splitQty >= origQty) { alert('Quantité invalide'); return; }
        const remQty  = origQty - splitQty;
        const chaine  = chaines.find(c => c.id === splitModal.chaineId);
        const model   = models.find(m => m.id === splitModal.modelId);
        const sam     = model?.meta_data.total_temps || 15;
        const startRaw = splitModal.startDate || splitModal.dateLancement || new Date().toISOString();
        const startYmd = startRaw.split('T')[0];
        const eff     = chaine?.efficiency ?? 0.85;
        const newOrigEnd  = calculateEndDate(startRaw, remQty,  sam, eff, settings);
        const newSplitEnd = calculateEndDate(startRaw, splitQty, sam, eff, settings);
        const updatedOrig: PlanningEvent = {
            ...splitModal,
            totalQuantity: remQty,
            qteTotal: remQty,
            estimatedEndDate: newOrigEnd,
            dateExport: newOrigEnd,
        };
        const cloned: PlanningEvent = {
            ...splitModal,
            id: `event_${Date.now()}`,
            totalQuantity: splitQty,
            qteTotal: splitQty,
            producedQuantity: 0,
            qteProduite: 0,
            status: 'READY',
            estimatedEndDate: newSplitEnd,
            dateExport: newSplitEnd,
        };
        const stockedOrig = applyMaterialStock(updatedOrig, remQty);
        const stockedClone = applyMaterialStock(cloned, splitQty);
        const next = [...planningEvents.map(ev => (ev.id === splitModal.id ? stockedOrig : ev)), stockedClone];
        const chainId = splitModal.chaineId;
        const cap = getChainDailyCapacity(settings.chainCapacityPerDay, chainId, 1000);
        const endYmd =
            parsePlanningDateAtNoon(newOrigEnd.split('T')[0]).getTime() >= parsePlanningDateAtNoon(newSplitEnd.split('T')[0]).getTime()
                ? newOrigEnd.split('T')[0]
                : newSplitEnd.split('T')[0];
        const maxR = maxDayLoadRatioInSpan(next, chainId, cap, startYmd, endYmd);

        const applySplit = () => {
            setPlanningEvents(prev => [...prev.map(ev => (ev.id === splitModal.id ? stockedOrig : ev)), stockedClone]);
            setSplitModal(null);
            setSplitQty(0);
        };

        const trySplitCapacity = () => {
            if (maxR > 1.0001) {
                setCapacityConfirm({
                    title: 'Dépassement de capacité',
                    message:
                        `Après division, charge ~${Math.round(maxR * 100)} % (${cap} pcs/j) sur au moins un jour. Continuer ?` +
                        formatOverloadDaysHint(next, chainId, cap, startYmd, endYmd),
                    onProceed: () => {
                        applySplit();
                    },
                });
                return;
            }
            applySplit();
        };

        const opsSplit = model?.gamme_operatoire ?? [];
        const mIdsSplit = getChainMachineIds(chainId, settings, machines);
        const mcSplit = validateMachineCoverage(opsSplit, machines, mIdsSplit);
        if (!mcSplit.ok) {
            setMachineConfirm({
                title: 'Couverture machines',
                message:
                    `La ligne « ${chaine?.name ?? chainId} » ne couvre pas : ${mcSplit.missingClasses.join(', ')}. Fractionner quand même ?`,
                onProceed: () => {
                    trySplitCapacity();
                },
            });
            return;
        }
        trySplitCapacity();
    };

    const commitAddEvent = () => {
        if (!newEv.modelId || newEv.quantity <= 0) { alert('Modèle et quantité requis'); return; }
        const model  = models.find(m => m.id === newEv.modelId);
        const chaine = chaines.find(c => c.id === newEv.chaineId);
        const sam    = model?.meta_data.total_temps || 15;
        const eff    = chaine?.efficiency ?? 0.85;
        const endIso = calculateEndDate(newEv.startDate, newEv.quantity, sam, eff, settings);
        const splitEnabled = !!model?.ficheData?.sectionSplitEnabled;
        const baseEv: PlanningEvent = {
            id: `event_${Date.now()}`,
            modelId: newEv.modelId, chaineId: newEv.chaineId,
            dateLancement: newEv.startDate, startDate: newEv.startDate,
            dateExport: endIso, estimatedEndDate: endIso,
            qteTotal: newEv.quantity, totalQuantity: newEv.quantity,
            qteProduite: 0, producedQuantity: 0, status: 'READY',
            modelName: model?.meta_data.nom_modele || 'Nouveau',
            clientName: newEv.clientName || model?.ficheData?.client || '',
            strictDeadline_DDS: newEv.strictDeadline_DDS || undefined,
            color: newEv.color,
            sectionSplitEnabled: splitEnabled,
            fournisseurDate: newEv.fournisseurDate || undefined,
        };
        const stockedBase = applyMaterialStock(baseEv, newEv.quantity);
        const next = [...planningEvents, stockedBase];
        const cap  = getChainDailyCapacity(settings.chainCapacityPerDay, newEv.chaineId, 1000);
        const endDay = (endIso || '').split('T')[0];
        const maxR = maxDayLoadRatioInSpan(next, newEv.chaineId, cap, newEv.startDate, endDay);
        const closeAdd = () => {
            setAddModal(false);
            setNewEv({ modelId: '', chaineId: 'CHAINE 1', startDate: new Date().toISOString().split('T')[0], quantity: 0, clientName: '', strictDeadline_DDS: '', fournisseurDate: '', color: '#2149C1' });
        };

        const tryCapacity = () => {
            if (maxR > 1.0001) {
                setCapacityConfirm({
                    title: 'Dépassement de capacité',
                    message: `Charge ~${Math.round(maxR * 100)} % (${cap} pcs/j) sur au moins un jour. Créer l’OF quand même ?`,
                    onProceed: () => {
                        setPlanningEvents(prev => [...prev, stockedBase]);
                        closeAdd();
                    },
                });
                return;
            }
            setPlanningEvents(prev => [...prev, stockedBase]);
            closeAdd();
        };

        const ops = model?.gamme_operatoire ?? [];
        const chainIds = getChainMachineIds(newEv.chaineId, settings, machines);
        const mc = validateMachineCoverage(ops, machines, chainIds);
        if (!mc.ok) {
            setMachineConfirm({
                title: 'Couverture machines',
                message:
                    `Classes sans machine sur ${newEv.chaineId} : ${mc.missingClasses.join(', ')}. Créer l’OF quand même ?`,
                onProceed: () => {
                    setMachineConfirm(null);
                    tryCapacity();
                },
            });
            return;
        }
        tryCapacity();
    };

    const stats = useMemo(() => {
        const total   = planningEvents.length;
        const inProg  = planningEvents.filter(e => e.status === 'IN_PROGRESS' || e.status === 'ON_TRACK').length;
        const done    = planningEvents.filter(e => e.status === 'DONE').length;
        const atRisk  = planningEvents.filter(e => isAtRisk(e)).length;
        const ready   = planningEvents.filter(e => e.status === 'READY').length;
        return { total, inProg, done, atRisk, ready };
    }, [planningEvents]);

    /** Vue logistique (OF non terminés) : magasin, sous-traitance, dates fournisseur, lots. */
    const logisticsSnapshot = useMemo(() => {
        const today = parsePlanningDateAtNoon(planningLocalDateKey(new Date()));
        const open = planningEvents.filter(e => e.status !== 'DONE');
        const blockedStock = open.filter(e => e.status === 'BLOCKED_STOCK').length;
        const external = open.filter(e => e.status === 'EXTERNAL_PROCESS').length;
        let fournPlanned = 0;
        let fournLate = 0;
        for (const e of open) {
            const fd = e.fournisseurDate?.trim();
            if (!fd) continue;
            fournPlanned++;
            if (parsePlanningDateAtNoon(fd).getTime() < today.getTime()) fournLate++;
        }
        const lotsOpen = open.filter(
            e => Array.isArray(e.lots_data) && e.lots_data.some(l => l.status !== 'DELIVERED'),
        ).length;
        const anySignal = blockedStock > 0 || external > 0 || fournPlanned > 0 || lotsOpen > 0;
        return { blockedStock, external, fournPlanned, fournLate, lotsOpen, anySignal };
    }, [planningEvents]);

    const evDisplayName = (ev: PlanningEvent) =>
        ev.modelName || models.find(m => m.id === ev.modelId)?.meta_data.nom_modele || 'Ordre';
    const evClient = (ev: PlanningEvent) =>
        (ev.clientName || models.find(m => m.id === ev.modelId)?.ficheData?.client || '').trim() || '—';

    const ofHeaderLists = useMemo(() => {
        const sortList = (list: PlanningEvent[]) => {
            const arr = [...list];
            arr.sort((a, b) => {
                if (ofHeaderSort === 'client') {
                    return evClient(a).localeCompare(evClient(b), 'fr', { sensitivity: 'base' });
                }
                if (ofHeaderSort === 'modele') {
                    return evDisplayName(a).localeCompare(evDisplayName(b), 'fr', { sensitivity: 'base' });
                }
                const da = new Date(a.startDate || a.dateLancement || 0).getTime();
                const db = new Date(b.startDate || b.dateLancement || 0).getTime();
                return da - db;
            });
            return arr;
        };
        return {
            termines: sortList(planningEvents.filter(e => e.status === 'DONE')),
            encours: sortList(planningEvents.filter(e => e.status !== 'DONE')),
        };
    }, [planningEvents, ofHeaderSort, models]);

    const statBuckets = useMemo(() => ({
        total: planningEvents,
        ready: planningEvents.filter(e => e.status === 'READY'),
        inProg: planningEvents.filter(e => e.status === 'IN_PROGRESS' || e.status === 'ON_TRACK'),
        atRisk: planningEvents.filter(e => {
            if (e.status === 'BLOCKED_STOCK') return true;
            const end = e.estimatedEndDate || e.dateExport;
            const dds = e.strictDeadline_DDS;
            return !!(end && dds && parsePlanningDateAtNoon(end).getTime() > parsePlanningDateAtNoon(dds).getTime());
        }),
        done: planningEvents.filter(e => e.status === 'DONE'),
    }), [planningEvents]);

    const logisticsLists = useMemo(() => {
        const open = planningEvents.filter(e => e.status !== 'DONE');
        const today = parsePlanningDateAtNoon(planningLocalDateKey(new Date()));
        const fournLate = (e: PlanningEvent) => {
            const fd = e.fournisseurDate?.trim();
            if (!fd) return false;
            return parsePlanningDateAtNoon(fd).getTime() < today.getTime();
        };
        return {
            blocked: open.filter(e => e.status === 'BLOCKED_STOCK'),
            external: open.filter(e => e.status === 'EXTERNAL_PROCESS'),
            fourn: open.filter(e => !!e.fournisseurDate?.trim()),
            fournLateList: open.filter(fournLate),
            lots: open.filter(e => Array.isArray(e.lots_data) && e.lots_data.some(l => l.status !== 'DELIVERED')),
        };
    }, [planningEvents]);

    const logisticsConcernedCount = useMemo(() => {
        const ids = new Set<string>();
        for (const e of planningEvents) {
            if (e.status === 'DONE') continue;
            if (
                e.status === 'BLOCKED_STOCK' ||
                e.status === 'EXTERNAL_PROCESS' ||
                e.fournisseurDate?.trim() ||
                (Array.isArray(e.lots_data) && e.lots_data.some(l => l.status !== 'DELIVERED'))
            ) {
                ids.add(e.id);
            }
        }
        return ids.size;
    }, [planningEvents]);

    useEffect(() => {
        if (!capacityConfirm && !machineConfirm) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            setCapacityConfirm(null);
            setMachineConfirm(null);
        };
        document.addEventListener('keydown', onEsc);
        return () => document.removeEventListener('keydown', onEsc);
    }, [capacityConfirm, machineConfirm]);

    useEffect(() => {
        if (!draggingEventId) return;
        const onDragEnd = () => setDraggingEventId(null);
        window.addEventListener('dragend', onDragEnd);
        return () => window.removeEventListener('dragend', onDragEnd);
    }, [draggingEventId]);

    useEffect(() => {
        if (!headerPopover) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (headerPopoverRef.current?.contains(t)) return;
            if ((e.target as HTMLElement).closest('[data-header-popover-trigger]')) return;
            setHeaderPopover(null);
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setHeaderPopover(null);
        };
        document.addEventListener('mousedown', onDoc, true);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDoc, true);
            document.removeEventListener('keydown', onEsc);
        };
    }, [headerPopover]);

    const toggleHeaderPopover = (kind: HeaderPopoverKind, e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        if (headerPopover?.kind === kind) {
            setHeaderPopover(null);
            return;
        }
        const r = e.currentTarget.getBoundingClientRect();
        const w = Math.min(320, window.innerWidth - 16);
        const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
        setHeaderPopover({ kind, top: r.bottom + 8, left, width: w });
    };

    // ── RENDER ───────────────────────────────────────────────────────────────
    const ROW_H = 'h-[78px]';
    const RIBBON_H = 'h-[6px]';
    const HDR_H = 'h-9';

    return (
        <div className="h-full flex flex-col bg-[#eef1f6] font-sans overflow-hidden select-none text-slate-800">

            {/* ── HEADER : synthèse au-dessus du titre (avant l’icône) · contrôles à droite ── */}
            <header className="shrink-0 bg-white border-b border-slate-200/90 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                <div className="px-3 py-1.5 sm:px-4 sm:py-2 space-y-1">
                    <div className="flex flex-col gap-1.5 min-w-0 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
                        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 lg:gap-3">
                            <div className="flex min-w-0 items-center gap-2 shrink-0">
                                <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-[#2149C1] to-[#163691] flex items-center justify-center shadow-sm shadow-[#2149C1]/15 ring-1 ring-white/15">
                                    <Calendar className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                                </div>
                                <div className="min-w-0 flex-1 leading-tight">
                                    <h1 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight truncate">
                                        Planning production
                                    </h1>
                                    <p
                                        className="text-[9px] sm:text-[10px] text-slate-500 font-medium mt-0 leading-snug truncate max-w-[min(100%,28rem)]"
                                        title={`Gantt · ${chaines.length} ligne${chaines.length !== 1 ? 's' : ''} · ${viewMode === 'daily' ? 'Jour' : viewMode === 'weekly' ? 'Semaine' : 'Mois'}`}
                                    >
                                        <span className="text-slate-400 uppercase tracking-wide font-semibold">Gantt</span>
                                        {' · '}{chaines.length} ligne{chaines.length !== 1 ? 's' : ''}
                                        <span className="text-slate-400"> · </span>
                                        {viewMode === 'daily' ? 'Jour' : viewMode === 'weekly' ? 'Semaine' : 'Mois'}
                                    </p>
                                </div>
                            </div>
                            {/* Résumé cliquable : logistique + compteurs statut (même ligne que le titre dès sm) */}
                            {planningEvents.length > 0 && (
                                <div
                                    role="toolbar"
                                    aria-label="Synthèse — cliquer pour le détail"
                                    className="flex flex-wrap items-center gap-0.5 sm:gap-1 min-w-0"
                                >
                                    <button
                                        type="button"
                                        data-header-popover-trigger
                                        onClick={e => toggleHeaderPopover('logistics', e)}
                                        className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset shadow-sm transition-colors shrink-0 ${
                                            logisticsSnapshot.anySignal
                                                ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/95 to-orange-50/40 text-amber-950 ring-amber-100 hover:bg-amber-50'
                                                : 'border-slate-200/80 bg-slate-50/90 text-slate-600 ring-slate-100 hover:bg-slate-100'
                                        }`}
                                        title="Synthèse logistique — clic pour le détail des OF"
                                    >
                                        <Truck className="h-2.5 w-2.5 shrink-0 opacity-80" aria-hidden />
                                        <span className="sm:hidden">Log.</span>
                                        <span className="hidden sm:inline">Logistique</span>
                                        {logisticsSnapshot.anySignal ? (
                                            <span className="tabular-nums font-bold">{logisticsConcernedCount}</span>
                                        ) : (
                                            <span className="text-[8px] font-bold text-emerald-700">OK</span>
                                        )}
                                    </button>
                                    {([
                                        { kind: 'total' as const, label: 'Total', short: 'T', val: stats.total, bg: 'bg-slate-50/90', text: 'text-slate-800', dot: 'bg-slate-500', ring: 'ring-slate-200' },
                                        { kind: 'ready' as const, label: 'Prêts', short: 'P', val: stats.ready, bg: 'bg-emerald-50/90', text: 'text-emerald-800', dot: 'bg-emerald-700', ring: 'ring-emerald-100' },
                                        { kind: 'inProg' as const, label: 'Cours', short: '▶', val: stats.inProg, bg: 'bg-blue-50/90', text: 'text-[#1a3ba5]', dot: 'bg-[#2149C1]', ring: 'ring-blue-100' },
                                        { kind: 'atRisk' as const, label: 'Risque', short: '⚠', val: stats.atRisk, bg: 'bg-amber-50/90', text: 'text-amber-900', dot: 'bg-amber-500', ring: 'ring-amber-100' },
                                        { kind: 'done' as const, label: 'OK', short: '✓', val: stats.done, bg: 'bg-emerald-50/90', text: 'text-emerald-900', dot: 'bg-emerald-700', ring: 'ring-emerald-100' },
                                    ]).map(s => (
                                        <button
                                            key={s.kind}
                                            type="button"
                                            data-header-popover-trigger
                                            onClick={e => toggleHeaderPopover(s.kind, e)}
                                            className={`inline-flex items-center gap-0.5 pl-1 pr-1.5 py-0.5 rounded-md text-[9px] font-semibold ring-1 ${s.ring} ring-inset shadow-sm shrink-0 sm:pl-1.5 sm:pr-2 ${s.bg} ${s.text} hover:brightness-[0.97] transition-[filter]`}
                                            title={`${s.label} : ${s.val} — clic pour la liste`}
                                        >
                                            <span className={`w-1 h-1 rounded-full shrink-0 sm:w-1.5 sm:h-1.5 ${s.dot}`} />
                                            <span className="text-slate-600/90 hidden sm:inline">{s.label}</span>
                                            <span className="text-slate-600/90 sm:hidden" aria-hidden>{s.short}</span>
                                            <span className="font-bold tabular-nums text-slate-900">{s.val}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end sm:shrink-0">
                        <div className="inline-flex rounded-lg border border-slate-200/80 bg-slate-50/80 p-0.5 shadow-sm">
                            {(['daily', 'weekly', 'monthly'] as const).map(v => (
                                <button key={v} type="button" onClick={() => setViewMode(v)}
                                    className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${viewMode === v ? 'bg-white text-[#2149C1] shadow-sm ring-1 ring-slate-200/80' : 'text-slate-500 hover:text-slate-800'}`}>
                                    {v === 'daily' ? 'Jour' : v === 'weekly' ? 'Semaine' : 'Mois'}
                                </button>
                            ))}
                        </div>

                        <div className="inline-flex items-center rounded-lg border border-slate-200/80 bg-white p-0.5 shadow-sm shrink-0">
                            <button type="button" onClick={() => setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}
                                className="p-1 rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors shrink-0" aria-label="Mois précédent">
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[10px] font-semibold text-slate-800 px-1 min-w-0 sm:min-w-[6rem] text-center capitalize tabular-nums truncate max-w-[7rem] sm:max-w-none">
                                {currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                            </span>
                            <button type="button" onClick={() => setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}
                                className="p-1 rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors shrink-0" aria-label="Mois suivant">
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                            <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" aria-hidden />
                            <button
                                type="button"
                                onClick={() => setCurrentDate(new Date())}
                                className="px-1.5 py-1 rounded-md text-[10px] font-semibold text-[#2149C1] hover:bg-[#2149C1]/5 transition-colors shrink-0"
                                title="Aujourd&apos;hui — revenir à la date du jour"
                            >
                                <span className="sm:hidden">Auj.</span>
                                <span className="hidden sm:inline">Aujourd&apos;hui</span>
                            </button>
                        </div>

                        <button type="button" onClick={() => setAddModal(true)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#2149C1] hover:bg-[#1a3ba5] text-white text-[10px] font-semibold shadow-sm shadow-[#2149C1]/20 transition-colors">
                            <Plus className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                            Planifier
                        </button>
                        </div>
                    </div>

                    {capacityGlobalOverload.length > 0 && (
                        <div
                            className="flex items-start gap-2 rounded-lg border border-red-200/90 bg-gradient-to-r from-red-50 via-red-50/90 to-amber-50/50 px-2.5 py-1.5 text-[10px] text-red-950 shadow-sm"
                            role="alert"
                        >
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600 mt-0.5" strokeWidth={2.25} aria-hidden />
                            <div className="min-w-0 flex-1 leading-snug">
                                <span className="font-black uppercase tracking-wide text-red-800 text-[9px]">Surcharge capacité (vue calendrier)</span>
                                <span className="block font-semibold text-red-900/95 mt-0.5">
                                    {capacityGlobalOverload.map(o => `${o.name} · pic ~${Math.round(o.maxR * 100)} % (${o.cap} pcs/j)`).join(' — ')}
                                </span>
                                <span className="block text-[9px] font-medium text-red-800/85 mt-0.5">
                                    Le ruban coloré par jour et la jauge ligne indiquent les dépassements. Ajustez les dates ou validez explicitement au glisser-déposer.
                                </span>
                            </div>
                        </div>
                    )}

                    {planningEvents.length > 0 && (
                        <div className="border-t border-slate-100/80 pt-1">
                            <button
                                type="button"
                                data-header-popover-trigger
                                onClick={() => setHeaderOrdresExpanded(v => !v)}
                                className="flex w-full min-w-0 items-center justify-between gap-1.5 rounded-md border border-slate-200/70 bg-slate-50/50 px-2 py-1 text-left text-[10px] font-semibold text-slate-700 hover:bg-slate-100/80 transition-colors"
                                aria-expanded={headerOrdresExpanded}
                            >
                                <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                                    <Eye className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                                    <span className="shrink-0">Ordres</span>
                                    <span className="min-w-0 truncate font-normal text-slate-500">
                                        {planningEvents.length} OF · {ofHeaderLists.termines.length} terminés · {ofHeaderLists.encours.length} actifs
                                    </span>
                                </span>
                                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${headerOrdresExpanded ? 'rotate-180' : ''}`} aria-hidden />
                            </button>
                            {headerOrdresExpanded && (
                                <div className="mt-1.5 space-y-1.5">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                                            Tri aperçu
                                        </span>
                                        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/90 p-0.5">
                                            {([
                                                { id: 'client' as const, label: 'Client', Icon: User },
                                                { id: 'modele' as const, label: 'Modèle', Icon: Package },
                                                { id: 'date' as const, label: 'Date lancement', Icon: Calendar },
                                            ]).map(({ id, label, Icon }) => (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    onClick={() => setOfHeaderSort(id)}
                                                    title={`Trier par ${label.toLowerCase()}`}
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                                                        ofHeaderSort === id
                                                            ? 'bg-white text-[#2149C1] shadow-sm ring-1 ring-slate-200/80'
                                                            : 'text-slate-500 hover:text-slate-800'
                                                    }`}
                                                >
                                                    <Icon className="w-3 h-3 shrink-0 opacity-80" />
                                                    <span className="hidden min-[380px]:inline">{label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                <div className="min-w-0 rounded-xl border border-slate-200/70 bg-slate-50/50 p-2.5">
                                    <div className="mb-2 flex items-center gap-1.5">
                                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                        <span className="text-[11px] font-semibold text-slate-700">Terminés</span>
                                        <span className="tabular-nums text-[10px] text-slate-400">({ofHeaderLists.termines.length})</span>
                                    </div>
                                    <div className="flex max-h-[5.5rem] flex-wrap gap-1.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
                                        {ofHeaderLists.termines.length === 0 ? (
                                            <p className="py-1 text-[10px] italic text-slate-400">Aucun OF terminé</p>
                                        ) : (
                                            ofHeaderLists.termines.map(ev => {
                                                const model = models.find(m => m.id === ev.modelId);
                                                const thumb = model?.images?.front || model?.image || null;
                                                return (
                                                    <button
                                                        key={ev.id}
                                                        type="button"
                                                        onClick={() => setSelectedEvent(ev)}
                                                        className={`group flex max-w-[11rem] shrink-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left transition-colors ${
                                                            selectedEvent?.id === ev.id
                                                                ? 'border-[#2149C1] bg-[#2149C1]/10 ring-2 ring-[#2149C1]/25'
                                                                : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        {thumb ? (
                                                            <img src={thumb} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover ring-1 ring-slate-200/80" />
                                                        ) : (
                                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-200/80 ring-1 ring-slate-200/80">
                                                                <Package className="h-3.5 w-3.5 text-slate-500" />
                                                            </div>
                                                        )}
                                                        <span className="flex min-w-0 flex-1 flex-col leading-tight">
                                                            <span className="truncate text-[10px] font-semibold text-slate-800">{evDisplayName(ev)}</span>
                                                            <span className="truncate text-[9px] text-slate-500">{evClient(ev)}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                                <div className="min-w-0 rounded-xl border border-blue-100/80 bg-blue-50/30 p-2.5">
                                    <div className="mb-2 flex items-center gap-1.5">
                                        <Activity className="h-3.5 w-3.5 shrink-0 text-[#2149C1]" />
                                        <span className="text-[11px] font-semibold text-slate-800">En cours & autres</span>
                                        <span className="tabular-nums text-[10px] text-slate-400">({ofHeaderLists.encours.length})</span>
                                    </div>
                                    <div className="flex max-h-[5.5rem] flex-wrap gap-1.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
                                        {ofHeaderLists.encours.length === 0 ? (
                                            <p className="py-1 text-[10px] italic text-slate-400">Tous les OF sont terminés</p>
                                        ) : (
                                            ofHeaderLists.encours.map(ev => {
                                                const model = models.find(m => m.id === ev.modelId);
                                                const thumb = model?.images?.front || model?.image || null;
                                                return (
                                                    <button
                                                        key={ev.id}
                                                        type="button"
                                                        onClick={() => setSelectedEvent(ev)}
                                                        className={`group flex max-w-[11rem] shrink-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left transition-colors ${
                                                            selectedEvent?.id === ev.id
                                                                ? 'border-[#2149C1] bg-[#2149C1]/10 ring-2 ring-[#2149C1]/25'
                                                                : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        {thumb ? (
                                                            <img src={thumb} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover ring-1 ring-slate-200/80" />
                                                        ) : (
                                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-200/80 ring-1 ring-slate-200/80">
                                                                <Package className="h-3.5 w-3.5 text-slate-500" />
                                                            </div>
                                                        )}
                                                        <span className="flex min-w-0 flex-1 flex-col leading-tight">
                                                            <span className="truncate text-[10px] font-semibold text-slate-800">{evDisplayName(ev)}</span>
                                                            <span className="truncate text-[9px] text-slate-500">{evClient(ev)}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* ── MAIN BOARD ──
                Single vertical scroll so chain labels stay aligned with Gantt rows;
                horizontal scroll only on the timeline strip. */}
            <div className="flex-1 flex min-h-0 overflow-hidden p-2 sm:p-3">
                <div className="flex flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden items-stretch rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                {/* Sidebar — même hauteur d’en-tête / ligne que le Gantt */}
                <div className={`shrink-0 flex flex-col z-10 transition-all duration-300 border-r border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[inset_-1px_0_0_rgba(15,23,42,0.04)] ${sidebarOpen ? 'w-52' : 'w-10'}`}>
                    <div className={`${HDR_H} shrink-0 border-b border-slate-200/80 flex items-center justify-between px-2 bg-white/95 backdrop-blur-sm`}>
                        {sidebarOpen && <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest pl-1">Lignes</span>}
                        <button type="button" onClick={() => setSidebarOpen(v => !v)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#2149C1] transition-colors ml-auto" aria-label={sidebarOpen ? 'Replier la liste des lignes' : 'Déplier la liste des lignes'}>
                            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                        </button>
                    </div>
                    <div className="flex flex-col shrink-0">
                        {chaines.map(ch => {
                            const evCount  = planningEvents.filter(e => e.chaineId === ch.id).length;
                            const activeEvs = planningEvents.filter(e => e.chaineId === ch.id && (e.status === 'IN_PROGRESS' || e.status === 'ON_TRACK'));
                            const activeEv = activeEvs.length;
                            // Chain progress: average progress of all active events
                            const chainProgress = activeEvs.length > 0
                                ? Math.round(activeEvs.reduce((acc, ev) => acc + getProgress(ev), 0) / activeEvs.length)
                                : 0;
                            const mainModel = activeEvs[0]
                                ? (models.find(m => m.id === activeEvs[0].modelId)?.meta_data.nom_modele || activeEvs[0].modelName || '—')
                                : null;
                            const peakInWin = timelineWindowYmd
                                ? maxDayLoadRatioInSpan(planningEvents, ch.id, ch.capacityPerDay, timelineWindowYmd.lo, timelineWindowYmd.hi)
                                : 0;
                            const ribbonGaugeW = Math.min(100, Math.round(peakInWin * 100));
                            const ribbonBarCls =
                                peakInWin > 1 ? 'bg-red-500' : peakInWin >= 0.8 ? 'bg-amber-500' : peakInWin >= 0.5 ? 'bg-emerald-600' : 'bg-emerald-600/70';
                            const ribbonTitle =
                                peakInWin > 1 && timelineWindowYmd
                                    ? `Surcharge — ${overloadDaysInSpan(planningEvents, ch.id, ch.capacityPerDay, timelineWindowYmd.lo, timelineWindowYmd.hi, 6)
                                          .map(d => `${d.dateKey} ~${Math.round(d.ratio * 100)}%`)
                                          .join(' · ')}`
                                    : `Pic charge sur la fenêtre : ~${Math.round(peakInWin * 100)} % (${ch.capacityPerDay} pcs/j)`;
                            return (
                                <div
                                    key={ch.id}
                                    className={`${ROW_H} px-2.5 flex flex-col border-b border-slate-100/90 transition-colors cursor-default
                                        ${activeEv > 0 ? 'bg-[#2149C1]/5 border-l-[3px] border-l-[#2149C1]' : 'border-l-[3px] border-l-transparent'}
                                        hover:bg-slate-50/90`}
                                >
                                    <div
                                        className={`${RIBBON_H} shrink-0 -mx-2.5 border-b border-slate-100/80 bg-slate-200/60 overflow-hidden`}
                                        title={ribbonTitle}
                                        role="presentation"
                                    >
                                        <div className={`h-full ${ribbonBarCls} transition-all duration-300`} style={{ width: `${ribbonGaugeW}%` }} />
                                    </div>
                                    <div className="flex flex-1 min-h-0 flex-col justify-center py-0.5">
                                    {sidebarOpen ? (
                                        <>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeEv > 0 ? 'bg-[#2149C1]' : evCount > 0 ? 'bg-emerald-700' : 'bg-slate-300'}`} />
                                                <h3 className="font-semibold text-slate-800 text-xs truncate leading-snug">{ch.name}</h3>
                                            </div>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-1" title="Efficacité (suivis) et capacité plancher (réglages)">
                                                <span className="inline-flex items-center rounded border border-emerald-200/90 bg-emerald-50/90 px-1 py-0.5 text-[8px] font-black tabular-nums text-emerald-900">
                                                    Eff {Math.round((ch.efficiency ?? 0.85) * 100)}%
                                                    {ch.efficiencySampleSize != null && ch.efficiencySampleSize > 0 ? (
                                                        <span className="ml-0.5 font-semibold text-emerald-700/90">· n={ch.efficiencySampleSize}</span>
                                                    ) : null}
                                                </span>
                                                <span className="inline-flex items-center rounded border border-slate-200/90 bg-slate-100/90 px-1 py-0.5 text-[8px] font-black tabular-nums text-slate-700">
                                                    {ch.capacityPerDay}/j
                                                </span>
                                            </div>
                                            {evCount > 0 ? (
                                                <div className="mt-1 space-y-0.5">
                                                    {mainModel && <p className="text-[9px] text-slate-500 font-semibold truncate">{mainModel}</p>}
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                                                            <div className="h-full bg-[#2149C1] transition-all" style={{ width: `${chainProgress}%` }} />
                                                        </div>
                                                        <span className="text-[8px] font-black text-[#2149C1]">{chainProgress}%</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[9px] bg-blue-100 text-[#2149C1] font-black px-1.5 py-0.5 rounded-full">{evCount} OF</span>
                                                        {activeEv > 0 && <span className="text-[9px] bg-emerald-100 text-emerald-700 font-black px-1.5 py-0.5 rounded-full">▶ {activeEv}</span>}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-slate-400 font-medium mt-1">Libre</span>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1 justify-center flex-1">
                                            <span className={`w-1.5 h-1.5 rounded-full ${activeEv > 0 ? 'bg-[#2149C1]' : evCount > 0 ? 'bg-emerald-700' : 'bg-slate-300'}`} />
                                            {!sidebarOpen && peakInWin > 1 && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 ring-1 ring-white" title={ribbonTitle} />
                                            )}
                                            {evCount > 0 && <span className="text-[8px] text-[#2149C1] font-black">{evCount}</span>}
                                            {chainProgress > 0 && <span className="text-[7px] text-slate-400 font-black">{chainProgress}%</span>}
                                        </div>
                                    )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Timeline area (horizontal scroll only; vertical uses parent above) */}
                <div
                    ref={timelineRef}
                    tabIndex={0}
                    role="region"
                    aria-label="Chronologie Gantt — molette pour défiler horizontalement, flèches gauche et droite lorsque la zone est au focus"
                    title="Molette : défilement horizontal · Ctrl+molette : zoom page · Touch : glisser H/V · Glisser-déposer OF sur une case jour (fuseau local)"
                    className="flex-1 min-w-0 min-h-0 overflow-x-auto overflow-y-auto relative bg-[#f6f8fc] [touch-action:pan-x_pan-y_pinch-zoom] overscroll-x-contain outline-none [-webkit-overflow-scrolling:touch] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2149C1]/25 rounded-r-lg"
                    onKeyDown={e => {
                        const el = timelineRef.current;
                        if (!el || el.scrollWidth <= el.clientWidth + 2) return;
                        const step = Math.max(DAY_WIDTH * 3, Math.floor(el.clientWidth * 0.35));
                        if (e.key === 'ArrowRight') {
                            e.preventDefault();
                            el.scrollLeft += e.shiftKey ? el.clientWidth : step;
                        } else if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            el.scrollLeft -= e.shiftKey ? el.clientWidth : step;
                        } else if (e.key === 'Home') {
                            e.preventDefault();
                            el.scrollLeft = 0;
                        } else if (e.key === 'End') {
                            e.preventDefault();
                            el.scrollLeft = el.scrollWidth;
                        }
                    }}
                >
                    <div style={{ width: timelineDates.length * DAY_WIDTH, minWidth: '100%' }} className="min-h-full">

                        {/* Date header */}
                        <div className={`${HDR_H} flex sticky top-0 z-20 border-b border-slate-200/90 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/75 shadow-[0_1px_0_rgba(15,23,42,0.06)]`}>
                            {timelineDates.map(date => {
                                const isWeekend = !isPlanningWorkingDay(date, settings);
                                const isToday   = date.toDateString() === new Date().toDateString();
                                return (
                                    <div key={date.toISOString()} style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                                        className={`shrink-0 border-r flex flex-col items-center justify-center transition-colors
                                            ${isToday   ? 'bg-[#2149C1]/8 border-[#2149C1]/25' :
                                              isWeekend ? 'bg-slate-100/60 border-slate-200/50 text-slate-400' :
                                                          'border-slate-100 text-slate-500'}`}>
                                        <span className="text-[9px] uppercase font-semibold tracking-wide text-slate-500">
                                            {date.toLocaleDateString('fr-FR', { weekday: viewMode === 'daily' ? 'short' : 'narrow' })}
                                        </span>
                                        <span className={`font-bold text-xs tabular-nums leading-none ${isToday ? 'text-[#2149C1]' : isWeekend ? 'text-slate-400' : 'text-slate-700'}`}>
                                            {date.getDate()}{viewMode !== 'daily' && date.getDate() === 1 ? ` ${date.toLocaleDateString('fr-FR', { month: 'short' })}` : ''}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Grid rows */}
                        <div className="relative">
                            {/* Grid lines */}
                            <div className="absolute inset-0 flex pointer-events-none">
                                {timelineDates.map(date => {
                                    const isWeekend = !isPlanningWorkingDay(date, settings);
                                    return (
                                        <div key={'g' + date.toISOString()} style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                                            className={`shrink-0 h-full border-r ${isWeekend ? 'bg-slate-100/35 border-slate-200/40' : 'border-slate-200/35'}`} />
                                    );
                                })}
                            </div>

                            {/* Today line */}
                            <div className="absolute top-0 bottom-0 w-0.5 bg-[#2149C1]/50 z-10 pointer-events-none"
                                style={{ left: todayOffset + DAY_WIDTH / 2 }}>
                                <div className="w-2.5 h-2.5 rounded-full bg-[#2149C1] border-2 border-white shadow -translate-x-[4px] -translate-y-[1px]" />
                            </div>

                            {/* Chaine rows */}
                            {chaines.map(ch => {
                                const chaineEvents = planningEvents.filter(e => e.chaineId === ch.id);
                                return (
                                    <div key={ch.id} className={`${ROW_H} relative border-b border-slate-100/90 flex flex-col transition-colors group hover:bg-slate-50/50`}>
                                        <div className={`${RIBBON_H} shrink-0 w-full z-[2]`}>
                                            <CapacityRibbon
                                                timelineDates={timelineDates}
                                                chainId={ch.id}
                                                events={planningEvents}
                                                settings={settings}
                                                dayWidth={DAY_WIDTH}
                                            />
                                        </div>
                                        <div className="relative flex-1 min-h-0 w-full flex">
                                        {/* Drop zones */}
                                        {timelineDates.map(date => {
                                            const dk = planningLocalDateKey(date);
                                            const isDropCell =
                                                Boolean(draggingEventId) &&
                                                dragOverInfo?.chaineId === ch.id &&
                                                dragOverInfo?.dateKey === dk;
                                            const miss = previewDrop.machineMissing;
                                            const isDropPreviewMachine =
                                                isDropCell && Array.isArray(miss) && miss.length > 0;
                                            const isDropPreviewOverload =
                                                isDropCell &&
                                                previewDrop.maxRatio != null &&
                                                previewDrop.maxRatio > 1.0001;
                                            const isDropPreviewStock =
                                                isDropCell && previewDrop.stockShortage;
                                            const dropTitleParts: string[] = [];
                                            if (isDropPreviewMachine) {
                                                dropTitleParts.push(
                                                    `Classes machines manquantes : ${miss!.join(', ')}`,
                                                );
                                            }
                                            if (isDropPreviewOverload) {
                                                dropTitleParts.push(
                                                    `Dépassement capacité (~${Math.round((previewDrop.maxRatio ?? 0) * 100)} %)`,
                                                );
                                            }
                                            if (isDropPreviewStock) {
                                                dropTitleParts.push('Stock matières insuffisant (magasin)');
                                            }
                                            const dropTitle =
                                                dropTitleParts.length > 0
                                                    ? `${dropTitleParts.join(' · ')} — ${ch.name} — ${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`
                                                    : `${ch.name} — ${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · glisser un OF ici pour planifier ce jour`;
                                            const dropStress =
                                                (isDropPreviewMachine ? 1 : 0) +
                                                (isDropPreviewOverload ? 1 : 0) +
                                                (isDropPreviewStock ? 1 : 0);
                                            return (
                                            <div key={`dz-${ch.id}-${dk}`}
                                                style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                                                title={dropTitle}
                                                className={`shrink-0 h-full transition-colors ${
                                                    dropStress >= 2
                                                        ? 'bg-gradient-to-br from-amber-500/18 to-red-500/18 ring-1 ring-inset ring-amber-500/40 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.35)]'
                                                        : isDropPreviewMachine
                                                            ? 'bg-amber-500/15 ring-1 ring-inset ring-amber-500/50'
                                                            : isDropPreviewOverload
                                                                ? 'bg-red-500/15 ring-1 ring-inset ring-red-400/45'
                                                                : isDropPreviewStock
                                                                    ? 'bg-rose-500/12 ring-1 ring-inset ring-rose-400/40'
                                                                    : dragOverInfo?.chaineId === ch.id && dragOverInfo?.dateKey === dk
                                                                        ? 'bg-[#2149C1]/10 ring-1 ring-inset ring-[#2149C1]/30'
                                                                        : ''
                                                }`}
                                                onDragOver={e => handleDragOver(e, ch.id, dk)}
                                                onDragLeave={() => setDragOverInfo(null)}
                                                onDrop={e => handleDrop(e, ch.id, dk)}
                                            />
                                            );
                                        })}

                                        {/* Event bars */}
                                        {chaineEvents.map(ev => {
                                            const cfg      = STATUS_CONFIG[ev.status] || STATUS_CONFIG.ON_TRACK;
                                            const progress = getProgress(ev);
                                            const risk     = isAtRisk(ev);
                                            const qty      = ev.totalQuantity  || ev.qteTotal    || 0;
                                            const prod     = ev.producedQuantity || ev.qteProduite || 0;
                                            const name     = ev.modelName || models.find(m => m.id === ev.modelId)?.meta_data.nom_modele || 'Ordre';
                                            const client   = ev.clientName || models.find(m => m.id === ev.modelId)?.ficheData?.client || '';
                                            const barColor = ev.color || '#2149C1';
                                            const startIso = ev.startDate || ev.dateLancement || '';
                                            const endIso   = getPlannedEndIso(ev);

                                            return (
                                                <div key={ev.id} draggable
                                                    title={buildEventHoverTitle(ev)}
                                                    onDragStart={e => handleDragStart(e, ev.id)}
                                                    onDragEnd={() => setDraggingEventId(null)}
                                                    onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                                                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, eventId: ev.id }); }}
                                                    style={getEventStyle(ev)}
                                                    className={`absolute top-2 bottom-2 rounded-xl border cursor-grab active:cursor-grabbing
                                                        flex flex-col p-2 overflow-hidden text-xs transition-shadow hover:shadow-md hover:z-10
                                                        ${cfg.bg} ${cfg.border}
                                                        ${risk ? 'ring-2 ring-red-400/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'shadow-sm'}`}>
                                                    {/* Color stripe */}
                                                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl pointer-events-none" style={{ backgroundColor: barColor }} />
                                                    <div className="pl-1.5 flex items-start justify-between gap-1 min-w-0">
                                                        <span className={`font-bold truncate leading-tight text-xs min-w-0 ${cfg.textColor}`} title={name}>{name}</span>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            {risk && <AlertTriangle className="w-3 h-3 text-red-400" />}
                                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>{cfg.label}</span>
                                                        </div>
                                                    </div>
                                                    {client && <div className={`text-[9px] ${cfg.textColor} opacity-60 truncate pl-1.5`}>{client}</div>}
                                                    {(startIso || endIso) && (
                                                        <div className={`text-[8px] font-semibold tabular-nums pl-1.5 truncate ${cfg.textColor} opacity-80`} title={`Début → fin (calcul planning)`}>
                                                            {startIso ? formatGanttShortDate(startIso) : '—'} → {endIso ? formatGanttShortDate(endIso) : '—'}
                                                        </div>
                                                    )}

                                                    {/* Section split bar */}
                                                    {(() => {
                                                        const m = models.find(mm => mm.id === ev.modelId);
                                                        if (!m?.ficheData?.sectionSplitEnabled && !ev.sectionSplitEnabled) return null;
                                                        const dates = calculateSectionDates(ev, m, settings);
                                                        const start = new Date(ev.startDate || ev.dateLancement || dates.prepStart || '').getTime();
                                                        const end   = new Date(ev.estimatedEndDate || ev.dateExport || dates.montageEnd || '').getTime();
                                                        const span  = Math.max(1, end - start);
                                                        const pct   = (iso?: string) => iso ? Math.max(0, Math.min(100, ((new Date(iso).getTime() - start) / span) * 100)) : 0;
                                                        const conflict = dates.warnings.some(w => w.includes('fournisseur'));
                                                        const pPrepEnd = pct(dates.prepEnd);
                                                        const pMontage = pct(dates.montageStart);
                                                        const waitW = Math.max(0, pMontage - pPrepEnd);
                                                        const showWait = waitW > 0.5;
                                                        return (
                                                            <div className="relative h-1 mx-1.5 mt-1 bg-slate-200/60 rounded-full overflow-hidden">
                                                                <div className="absolute h-full bg-blue-400 rounded-l" style={{ left: `${pct(dates.prepStart)}%`, width: `${Math.max(0, pPrepEnd - pct(dates.prepStart))}%` }} />
                                                                {showWait && (
                                                                    <div
                                                                        className="absolute h-full top-0"
                                                                        style={{
                                                                            left: `${pPrepEnd}%`,
                                                                            width: `${waitW}%`,
                                                                            background:
                                                                                'repeating-linear-gradient(-45deg, rgba(251,146,60,0.92), rgba(251,146,60,0.92) 2px, rgba(255,237,213,0.95) 2px, rgba(255,237,213,0.95) 5px)',
                                                                        }}
                                                                        title="Attente matière / fournisseur (prépa terminée → début montage)"
                                                                    />
                                                                )}
                                                                <div className={`absolute h-full ${conflict ? 'bg-red-400' : 'bg-emerald-400'} rounded-r`} style={{ left: `${pMontage}%`, width: `${Math.max(0, pct(dates.montageEnd) - pMontage)}%` }} />
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Progress + Suivi button */}
                                                    <div className="mt-auto pl-1.5">
                                                        <div className={`flex justify-between text-[9px] font-bold ${cfg.textColor} opacity-70 mb-0.5`}>
                                                            <span>{prod}/{qty} pcs</span>
                                                            <div className="flex items-center gap-1">
                                                                <span>{progress}%</span>
                                                                {onOpenSuivi && (
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); onOpenSuivi(ev.id); }}
                                                                        className="px-1.5 py-0.5 bg-[#2149C1] text-white text-[8px] font-black rounded opacity-90 hover:opacity-100 transition-opacity"
                                                                        title="Ouvrir le suivi"
                                                                    >▶ Suivi</button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
                                                            <div className={`h-full ${cfg.bar} transition-all`} style={{ width: `${progress}%` }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Empty state */}
                            {planningEvents.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 gap-5 text-center px-6">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/80 flex items-center justify-center shadow-inner">
                                        <Calendar className="w-7 h-7 text-slate-400" strokeWidth={1.5} />
                                    </div>
                                    <div className="max-w-sm">
                                        <p className="text-slate-700 font-semibold text-base">Aucun ordre planifié</p>
                                        <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
                                            Créez un ordre avec le bouton <span className="font-medium text-slate-700">Planifier</span> pour alimenter le Gantt.
                                        </p>
                                    </div>
                                    <button type="button" onClick={() => setAddModal(true)}
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2149C1] hover:bg-[#1a3ba5] text-white font-semibold text-sm shadow-md shadow-[#2149C1]/20 transition-colors">
                                        <Plus className="w-4 h-4" strokeWidth={2.5} /> Planifier un ordre
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                </div>
            </div>

            {/* ══ MODALS ══════════════════════════════════════════════════════════ */}

            {/* 1. Detail Modal */}
            <AnimatePresence>
                {selectedEvent && (() => {
                    const ev     = selectedEvent;
                    const cfg    = STATUS_CONFIG[ev.status] || STATUS_CONFIG.ON_TRACK;
                    const qty    = ev.totalQuantity    || ev.qteTotal     || 0;
                    const prod   = ev.producedQuantity || ev.qteProduite  || 0;
                    const prog   = getProgress(ev);
                    const chain  = chaines.find(c => c.id === ev.chaineId);
                    const model  = models.find(m => m.id === ev.modelId);
                    const name   = ev.modelName   || model?.meta_data.nom_modele || 'Ordre';
                    const client = ev.clientName  || model?.ficheData?.client    || '—';
                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                            onClick={() => setSelectedEvent(null)}>
                            <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200"
                                onClick={e => e.stopPropagation()}>
                                {/* Top color bar */}
                                <div className={`h-1.5 w-full ${cfg.bar}`} />
                                <div className="p-6">
                                    <div className="flex items-start justify-between mb-5">
                                        <div>
                                            <h2 className="text-xl font-black text-slate-800">{name}</h2>
                                            <p className="text-sm text-slate-500 mt-0.5">{client}</p>
                                            <span className={`inline-flex items-center gap-1 mt-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                                            </span>
                                        </div>
                                        <button onClick={() => setSelectedEvent(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 mb-4 sm:grid-cols-4">
                                        <button type="button" onClick={() => setEventDetailTab('resume')} className={`rounded-lg py-2 text-[10px] font-black transition sm:text-[11px] ${eventDetailTab === 'resume' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Résumé</button>
                                        <button type="button" onClick={() => setEventDetailTab('lots')} className={`rounded-lg py-2 text-[10px] font-black transition sm:text-[11px] ${eventDetailTab === 'lots' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Lots</button>
                                        <button type="button" onClick={() => setEventDetailTab('materials')} className={`rounded-lg py-2 text-[10px] font-black transition inline-flex items-center justify-center gap-1 sm:text-[11px] ${eventDetailTab === 'materials' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
                                            <Package className="h-3.5 w-3.5 shrink-0" aria-hidden /> Matières
                                        </button>
                                        <button type="button" onClick={() => setEventDetailTab('machines')} className={`rounded-lg py-2 text-[10px] font-black transition inline-flex items-center justify-center gap-1 sm:text-[11px] ${eventDetailTab === 'machines' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
                                            <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden /> Machines
                                        </button>
                                    </div>

                                    {eventDetailTab === 'lots' ? (
                                        <LotsEditor
                                            lots={ev.lots_data ?? EMPTY_LOTS}
                                            onChange={nextLots => {
                                                setPlanningEvents(p => p.map(e => (e.id === ev.id ? { ...e, lots_data: nextLots } : e)));
                                                setSelectedEvent(cur => (cur && cur.id === ev.id ? { ...cur, lots_data: nextLots } : cur));
                                            }}
                                            settings={settings}
                                            defaultDeadline={(ev.strictDeadline_DDS || ev.dateExport || '').split('T')[0]}
                                            model={model}
                                            orderQty={qty}
                                        />
                                    ) : eventDetailTab === 'materials' ? (
                                        <div className="max-h-[min(52vh,420px)] overflow-y-auto pr-0.5 -mr-1 space-y-4">
                                            {magasinStock?.products?.length ? (
                                                <div className="rounded-xl border border-slate-200 overflow-hidden">
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-3 py-2 bg-slate-50 border-b border-slate-200">
                                                        Besoins vs stock magasin
                                                    </p>
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="bg-slate-50 text-left text-[10px] font-bold text-slate-600">
                                                                <th className="px-3 py-2">Matière</th>
                                                                <th className="px-2 py-2 text-right">Besoin</th>
                                                                <th className="px-2 py-2 text-right">Dispo</th>
                                                                <th className="px-3 py-2">État</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {materialStockRowsForDisplay(model, qty, magasinStock.products, magasinStock.lots ?? []).map((row, i) => (
                                                                <tr key={i} className={row.ok ? 'bg-white border-b border-slate-100' : 'bg-rose-50 border-b border-rose-100'}>
                                                                    <td className="px-3 py-1.5 font-medium text-slate-800">{row.name}</td>
                                                                    <td className="px-2 py-1.5 text-right tabular-nums">{row.required} {row.unit}</td>
                                                                    <td className="px-2 py-1.5 text-right tabular-nums">
                                                                        {row.unmatched ? (
                                                                            <span className="text-amber-700 font-semibold">—</span>
                                                                        ) : (
                                                                            row.available
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-[10px] font-bold">
                                                                        {row.unmatched ? (
                                                                            <span className="text-amber-700">Non référencé</span>
                                                                        ) : row.ok ? (
                                                                            <span className="text-emerald-700">OK</span>
                                                                        ) : (
                                                                            <span className="text-rose-700">Manque</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-slate-500">Catalogue magasin indisponible ou vide — synchronisez le magasin pour comparer les stocks.</p>
                                            )}
                                            <MaterialArrivalTimeline
                                                model={model}
                                                orderQty={qty}
                                                event={ev}
                                                settings={settings}
                                                catalogProducts={magasinStock?.products ?? []}
                                                onApplyWorstSupplierDate={ymd => {
                                                    const patched = applyFournisseurDateToEvent(ev, ymd, model);
                                                    setPlanningEvents(p => p.map(e => (e.id === ev.id ? patched : e)));
                                                    setSelectedEvent(cur =>
                                                        cur && cur.id === ev.id ? patched : cur,
                                                    );
                                                }}
                                                onAppendDraftPurchaseOrders={drafts => {
                                                    setPlanningEvents(p =>
                                                        p.map(e => (e.id === ev.id ? { ...e, purchaseOrdersDraft: drafts } : e)),
                                                    );
                                                    setSelectedEvent(cur =>
                                                        cur && cur.id === ev.id ? { ...cur, purchaseOrdersDraft: drafts } : cur,
                                                    );
                                                }}
                                            />
                                        </div>
                                    ) : eventDetailTab === 'machines' ? (
                                        <div className="max-h-[min(52vh,420px)] overflow-y-auto pr-0.5 -mr-1">
                                            <MachineCoverageTable
                                                operations={model?.gamme_operatoire ?? []}
                                                machines={machines}
                                                chainId={ev.chaineId}
                                                settings={settings}
                                                chainLabel={chain?.name || ev.chaineId}
                                            />
                                        </div>
                                    ) : (
                                        <>
                                    {/* Progress */}
                                    <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-200">
                                        <div className="flex justify-between items-end mb-2">
                                            <div>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Avancement</p>
                                                <p className="text-3xl font-black text-slate-800 mt-0.5">{prog}<span className="text-slate-400 text-base">%</span></p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-slate-500 font-bold uppercase">Produit / Objectif</p>
                                                <p className="text-sm font-bold text-slate-700 mt-0.5">
                                                    <span className="text-emerald-600">{prod}</span> / {qty} pcs
                                                </p>
                                            </div>
                                        </div>
                                        <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                            <div className={`h-full ${cfg.bar} transition-all rounded-full`} style={{ width: `${prog}%` }} />
                                        </div>
                                    </div>

                                    {/* Info grid */}
                                    <div className="space-y-1 text-sm">
                                        {[
                                            { label: 'Ligne',      val: chain?.name || ev.chaineId },
                                            { label: 'Lancement',  val: (ev.startDate || ev.dateLancement || '—').split('T')[0] },
                                            { label: 'Fin estimée',val: (ev.estimatedEndDate || ev.dateExport || '—').split('T')[0] },
                                            { label: 'DDS',        val: ev.strictDeadline_DDS || 'Non défini' },
                                            {
                                                label: 'Matières (fourn.)',
                                                val: ev.fournisseurDate?.trim()
                                                    ? (ev.fournisseurDate.split('T')[0] || '—')
                                                    : '—',
                                            },
                                        ].map(row => (
                                            <div key={row.label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                                                <span className="text-slate-500">{row.label}</span>
                                                <span className="text-slate-800 font-bold">{row.val}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Fiche details */}
                                    {(() => {
                                        const fd   = model?.ficheData;
                                        const mats = fd?.materials || [];
                                        const sizes = fd?.sizes || model?.meta_data.sizes || [];
                                        if (!fd && !mats.length && !sizes.length) return null;
                                        return (
                                            <div className="mt-3 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                                                <div className="px-4 py-2 border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fiche Technique</div>
                                                <div className="p-3 space-y-2">
                                                    {sizes.length > 0 && (
                                                        <div className="flex items-start gap-2">
                                                            <Ruler className="w-3.5 h-3.5 text-[#2149C1] mt-0.5 shrink-0" />
                                                            <div className="flex flex-wrap gap-1">
                                                                {sizes.map((s: string) => (
                                                                    <span key={s} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-md">{s}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {mats.length > 0 && (
                                                        <div className="flex items-start gap-2">
                                                            <Package className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                                                            <div className="flex-1 space-y-1">
                                                                {mats.slice(0, 4).map((m: any) => (
                                                                    <div key={m.id} className="flex justify-between items-center">
                                                                        <span className="text-[10px] text-slate-600 font-semibold truncate max-w-[160px]">{m.name}</span>
                                                                        <span className="text-[10px] text-amber-600 font-black ml-2">{m.qty} {m.unit}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                        </>
                                    )}
                                </div>
                                {/* Actions */}
                                <div className="bg-slate-50 px-6 py-4 flex gap-3 border-t border-slate-100">
                                    <button onClick={() => { setCurrentView('suivi'); setSelectedEvent(null); }}
                                        className="flex-1 flex items-center justify-center gap-2 bg-[#2149C1] hover:bg-[#1a3ba5] text-white font-bold py-2.5 rounded-xl text-sm transition-colors shadow-md shadow-[#2149C1]/20">
                                        <Eye className="w-4 h-4" /> Voir Suivi
                                    </button>
                                    <button onClick={() => { openEditModal(ev); setSelectedEvent(null); }}
                                        className="flex items-center justify-center gap-2 px-4 border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold py-2.5 rounded-xl text-sm transition-colors">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => { setSplitModal(ev); setSelectedEvent(null); }}
                                        className="flex items-center justify-center gap-2 px-4 border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold py-2.5 rounded-xl text-sm transition-colors">
                                        <Split className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setDeleteConfirmId(ev.id)}
                                        className="flex items-center justify-center gap-2 px-4 border border-red-200 hover:bg-red-50 text-red-500 font-bold py-2.5 rounded-xl text-sm transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* 2. Context Menu */}
            <AnimatePresence>
                {contextMenu && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                        className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 w-52 text-sm"
                        style={{ left: Math.min(contextMenu.x, window.innerWidth - 210), top: Math.min(contextMenu.y, window.innerHeight - 220) }}
                        onClick={e => e.stopPropagation()}>
                        <div className="px-3 pb-1.5 mb-1 border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest">Actions rapides</div>
                        {([
                            { label: 'Marquer Prêt',      status: 'READY',           dot: 'bg-emerald-700', hover: 'hover:bg-emerald-50 hover:text-emerald-700' },
                            { label: 'En cours',           status: 'IN_PROGRESS',     dot: 'bg-[#2149C1]',   hover: 'hover:bg-blue-50 hover:text-[#2149C1]'      },
                            { label: 'Bloquer (Stock)',    status: 'BLOCKED_STOCK',   dot: 'bg-red-500',     hover: 'hover:bg-red-50 hover:text-red-700'          },
                            { label: 'Sous-traitance',     status: 'EXTERNAL_PROCESS',dot: 'bg-orange-500',  hover: 'hover:bg-orange-50 hover:text-orange-700'    },
                            { label: 'Terminé ✓',          status: 'DONE',            dot: 'bg-emerald-700', hover: 'hover:bg-emerald-50 hover:text-emerald-800'   },
                        ] as const).map(item => (
                            <button key={item.status}
                                className={`w-full text-left px-3 py-2 text-slate-600 flex items-center gap-2.5 transition-colors ${item.hover}`}
                                onClick={() => { setPlanningEvents(p => p.map(e => e.id === contextMenu.eventId ? { ...e, status: item.status } : e)); setContextMenu(null); }}>
                                <span className={`w-2 h-2 rounded-full shrink-0 ${item.dot}`} />
                                <span className="text-xs font-semibold">{item.label}</span>
                            </button>
                        ))}
                        <div className="h-px bg-slate-100 my-1" />
                        <button className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                            onClick={() => { const ev = planningEvents.find(e => e.id === contextMenu.eventId); if (ev) setSplitModal(ev); setContextMenu(null); }}>
                            <Split className="w-3.5 h-3.5 text-[#2149C1]" />
                            <span className="text-xs font-semibold">Fractionner l'ordre</span>
                        </button>
                        <button className="w-full text-left px-3 py-2 text-[#2149C1] hover:bg-blue-50 flex items-center gap-2.5 font-bold transition-colors"
                            onClick={() => { setCurrentView('suivi'); setContextMenu(null); }}>
                            <ArrowRightCircle className="w-3.5 h-3.5" />
                            <span className="text-xs font-semibold">Voir dans Suivi</span>
                        </button>
                        <div className="h-px bg-slate-100 my-1" />
                        <button className="w-full text-left px-3 py-2 text-red-500 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                            onClick={() => { setDeleteConfirmId(contextMenu.eventId); setContextMenu(null); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="text-xs font-semibold">Supprimer</span>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 3. Split Modal */}
            <AnimatePresence>
                {splitModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setSplitModal(null)}>
                        <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94 }}
                            className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-slate-200"
                            onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                                    <Split className="w-5 h-5 text-[#2149C1]" />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800">Fractionner l'ordre</h3>
                                    <p className="text-xs text-slate-500">{splitModal.modelName || 'Ordre'} — {splitModal.totalQuantity || splitModal.qteTotal} pcs total</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-500 mb-3">Combien de pièces voulez-vous extraire dans un nouveau lot ?</p>
                            <input type="number" min={1} max={(splitModal.totalQuantity || splitModal.qteTotal || 1) - 1}
                                className={inputCls + ' font-mono text-xl mb-2'}
                                placeholder={`1 – ${(splitModal.totalQuantity || splitModal.qteTotal || 2) - 1}`}
                                value={splitQty || ''}
                                onChange={e => setSplitQty(parseInt(e.target.value) || 0)} />
                            {splitQty > 0 && (
                                <div className="flex gap-3 text-xs font-bold text-slate-500 mb-4 bg-slate-50 rounded-lg p-3">
                                    <span>Lot A: <strong className="text-slate-800">{(splitModal.totalQuantity || splitModal.qteTotal || 0) - splitQty} pcs</strong></span>
                                    <span className="text-slate-300">|</span>
                                    <span>Lot B: <strong className="text-[#2149C1]">{splitQty} pcs</strong></span>
                                </div>
                            )}
                            <div className="flex gap-3">
                                <button onClick={() => { setSplitModal(null); setSplitQty(0); }}
                                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-bold text-sm transition-colors">Annuler</button>
                                <button onClick={commitSplit}
                                    className="flex-1 bg-[#2149C1] hover:bg-[#1a3ba5] text-white py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                                    <Check className="w-4 h-4" /> Confirmer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 4. Add Event Modal */}
            <AnimatePresence>
                {addModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setAddModal(false)}>
                        <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94 }}
                            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col"
                            onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-[#2149C1] flex items-center justify-center">
                                        <Plus className="w-4 h-4 text-white" />
                                    </div>
                                    <h3 className="font-black text-slate-800">Planifier un ordre de fabrication</h3>
                                </div>
                                <button onClick={() => setAddModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            {/* Body */}
                            <div className="p-5 space-y-4 overflow-y-auto flex-1">
                                {/* Model */}
                                <div>
                                    <label className={labelCls}>Modèle *</label>
                                    <select className={inputCls} value={newEv.modelId}
                                        onChange={e => {
                                            const m = models.find(mod => mod.id === e.target.value);
                                            setNewEv(p => ({ ...p, modelId: e.target.value, clientName: m?.ficheData?.client || '', quantity: m?.ficheData?.quantity || m?.meta_data.quantity || 0 }));
                                        }}>
                                        <option value="">-- Choisir un modèle --</option>
                                        {models.map(m => <option key={m.id} value={m.id}>{m.meta_data.nom_modele}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelCls}>Ligne *</label>
                                        <select className={inputCls} value={newEv.chaineId}
                                            onChange={e => setNewEv(p => ({ ...p, chaineId: e.target.value }))}>
                                            {chaines.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Quantité *</label>
                                        <input type="number" min={1} className={inputCls} placeholder="ex: 2500"
                                            value={newEv.quantity || ''}
                                            onChange={e => setNewEv(p => ({ ...p, quantity: parseInt(e.target.value) || 0 }))} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelCls}>Date Lancement *</label>
                                        <DateTimePicker
                                            value={newEv.startDate || ''}
                                            onChange={iso => setNewEv(p => ({ ...p, startDate: iso.split('T')[0] }))}
                                            mode="date"
                                            settings={settings}
                                            inputClassName={inputCls}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelCls}>DDS (Deadline)</label>
                                        <DateTimePicker
                                            value={newEv.strictDeadline_DDS || ''}
                                            onChange={iso => setNewEv(p => ({ ...p, strictDeadline_DDS: iso.split('T')[0] }))}
                                            mode="date"
                                            settings={settings}
                                            inputClassName={inputCls}
                                        />
                                    </div>
                                </div>

                                {(() => {
                                    const m = models.find(mm => mm.id === newEv.modelId);
                                    if (!m?.ficheData?.sectionSplitEnabled) return null;
                                    return (
                                        <div>
                                            <label className="text-[10px] font-black text-amber-600 uppercase tracking-wider block mb-1.5">📦 Date Fournisseur (L) — Section Split</label>
                                            <DateTimePicker
                                                value={newEv.fournisseurDate || ''}
                                                onChange={iso => setNewEv(p => ({ ...p, fournisseurDate: iso.split('T')[0] }))}
                                                mode="date"
                                                settings={settings}
                                                inputClassName={inputCls.replace('border-slate-200', 'border-amber-300').replace('focus:border-[#2149C1]', 'focus:border-amber-500')}
                                            />
                                            <p className="text-[10px] text-slate-400 mt-1">Le Montage ne démarrera pas avant cette date.</p>
                                        </div>
                                    );
                                })()}

                                <div>
                                    <label className={labelCls}>Client</label>
                                    <input type="text" className={inputCls} placeholder="Nom du client"
                                        value={newEv.clientName}
                                        onChange={e => setNewEv(p => ({ ...p, clientName: e.target.value }))} />
                                </div>

                                {/* Color */}
                                <div>
                                    <label className={labelCls}>Couleur OF</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {MODEL_COLORS.map(c => (
                                            <button key={c} type="button"
                                                onClick={() => setNewEv(p => ({ ...p, color: c }))}
                                                className={`w-7 h-7 rounded-full transition-all border-2 ${newEv.color === c ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                                style={{ backgroundColor: c }} />
                                        ))}
                                    </div>
                                </div>

                                {/* Model preview */}
                                {newEv.modelId && (() => {
                                    const m = models.find(mod => mod.id === newEv.modelId);
                                    if (!m) return null;
                                    const sam = m.meta_data.total_temps || 15;
                                    const ch  = chaines.find(c => c.id === newEv.chaineId);
                                    const eff = ch?.efficiency ?? 0.85;
                                    const hoursPerDay = getNetWorkHours(settings);
                                    const endIso = newEv.quantity > 0 ? calculateEndDate(newEv.startDate, newEv.quantity, sam, eff, settings) : null;
                                    const totalHrs = newEv.quantity > 0 ? (newEv.quantity * sam / 60) / eff : 0;
                                    const daysNeeded = totalHrs > 0 ? Math.ceil(totalHrs / hoursPerDay) : 0;
                                    const ops = m.gamme_operatoire || [];
                                    const prepOps = ops.filter(op => op.section === 'PREPARATION');
                                    const montOps = ops.filter(op => op.section === 'MONTAGE');
                                    return (
                                        <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
                                            <div className="px-4 py-2 border-b border-blue-100 flex items-center justify-between">
                                                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Aperçu Modèle</span>
                                                <span className="text-[10px] font-bold text-[#2149C1]">SAM: {sam} min</span>
                                            </div>
                                            <div className="p-3 space-y-2">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-500">Effectif estimé</span>
                                                    <span className="font-black text-[#2149C1]">{m.meta_data.effectif || '—'} ouvriers</span>
                                                </div>
                                                {daysNeeded > 0 && (
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">Jours de production</span>
                                                        <span className="font-black text-emerald-600">{daysNeeded} j ouvrés</span>
                                                    </div>
                                                )}
                                                {endIso && (
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">Date fin estimée</span>
                                                        <span className="font-black text-slate-800">{endIso.split('T')[0]}</span>
                                                    </div>
                                                )}
                                                {(prepOps.length > 0 || montOps.length > 0) && (
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {prepOps.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Prép: {prepOps.length} ops</span>}
                                                        {montOps.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Mont: {montOps.length} ops</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                            {/* Footer */}
                            <div className="p-4 bg-slate-50 flex gap-3 border-t border-slate-100 shrink-0">
                                <button onClick={() => setAddModal(false)}
                                    className="flex-1 bg-white hover:bg-slate-100 text-slate-700 py-2.5 rounded-xl font-bold text-sm transition-colors border border-slate-200">Annuler</button>
                                <button onClick={commitAddEvent}
                                    className="flex-1 bg-[#2149C1] hover:bg-[#1a3ba5] text-white py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-md shadow-[#2149C1]/20">
                                    <Plus className="w-4 h-4" /> Créer l'ordre
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 5. Edit Modal */}
            <AnimatePresence>
                {editModal && (() => {
                    const model  = models.find(m => m.id === editModal.modelId);
                    const sam    = model?.meta_data.total_temps || 15;
                    const ch     = chaines.find(c => c.id === editForm.chaineId);
                    const previewEnd = editForm.startDate && editForm.quantity > 0
                        ? calculateEndDate(editForm.startDate, editForm.quantity, sam, ch?.efficiency ?? 0.85, settings).split('T')[0]
                        : null;
                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                            onClick={() => setEditModal(null)}>
                            <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94 }}
                                className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200"
                                onClick={e => e.stopPropagation()}>
                                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                                            <Edit2 className="w-4 h-4 text-slate-600" />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-slate-800 text-sm">Modifier l'ordre</h3>
                                            <p className="text-[10px] text-slate-500">{editModal.modelName || model?.meta_data.nom_modele}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setEditModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelCls}>Ligne (Chaîne)</label>
                                            <select className={inputCls} value={editForm.chaineId}
                                                onChange={e => setEditForm(p => ({ ...p, chaineId: e.target.value }))}>
                                                {chaines.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelCls}>Quantité</label>
                                            <input type="number" min={1} className={inputCls}
                                                value={editForm.quantity || ''}
                                                onChange={e => setEditForm(p => ({ ...p, quantity: parseInt(e.target.value) || 0 }))} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelCls}>Date Lancement</label>
                                            <DateTimePicker
                                                value={editForm.startDate || ''}
                                                onChange={iso => setEditForm(p => ({ ...p, startDate: iso.split('T')[0] }))}
                                                mode="date"
                                                settings={settings}
                                                inputClassName={inputCls}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCls}>DDS (Deadline)</label>
                                            <DateTimePicker
                                                value={editForm.strictDeadline_DDS || ''}
                                                onChange={iso => setEditForm(p => ({ ...p, strictDeadline_DDS: iso.split('T')[0] }))}
                                                mode="date"
                                                settings={settings}
                                                inputClassName={inputCls}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Client</label>
                                        <input type="text" className={inputCls} value={editForm.clientName}
                                            onChange={e => setEditForm(p => ({ ...p, clientName: e.target.value }))} />
                                    </div>
                                    {previewEnd && (
                                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
                                            <span className="text-xs text-blue-700 font-bold">Fin estimée</span>
                                            <span className="text-xs text-[#2149C1] font-black">{previewEnd}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 bg-slate-50 flex gap-3 border-t border-slate-100">
                                    <button onClick={() => setEditModal(null)}
                                        className="flex-1 bg-white hover:bg-slate-100 text-slate-700 py-2.5 rounded-xl font-bold text-sm transition-colors border border-slate-200">Annuler</button>
                                    <button onClick={commitEdit}
                                        className="flex-1 bg-[#2149C1] hover:bg-[#1a3ba5] text-white py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                                        <Check className="w-4 h-4" /> Enregistrer
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {headerPopover && createPortal(
                <div
                    ref={headerPopoverRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="header-popover-title"
                    className="fixed z-[240] max-h-[min(72vh,440px)] overflow-y-auto rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xl ring-1 ring-black/10 [scrollbar-width:thin]"
                    style={{ top: headerPopover.top, left: headerPopover.left, width: headerPopover.width }}
                >
                    <div className="mb-2 flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                        <h2 id="header-popover-title" className="text-xs font-bold text-slate-900 leading-tight pr-2">
                            {headerPopover.kind === 'logistics' && 'Détail logistique'}
                            {headerPopover.kind === 'total' && 'Tous les ordres'}
                            {headerPopover.kind === 'ready' && 'Prêts au lancement'}
                            {headerPopover.kind === 'inProg' && 'En cours'}
                            {headerPopover.kind === 'atRisk' && 'À risque ou bloqués'}
                            {headerPopover.kind === 'done' && 'Terminés'}
                        </h2>
                        <button
                            type="button"
                            onClick={() => setHeaderPopover(null)}
                            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Fermer"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    {headerPopover.kind === 'logistics' ? (
                        <div className="space-y-3 text-left">
                            <p className="text-[10px] text-slate-500">Cliquez un OF pour l’ouvrir dans le panneau de détail.</p>
                            {!logisticsSnapshot.anySignal && (
                                <p className="text-[11px] text-slate-600">Aucun signal logistique sur les OF non terminés.</p>
                            )}
                            {logisticsLists.blocked.length > 0 && (
                                <section>
                                    <h3 className="mb-1 flex items-center gap-1 text-[10px] font-bold text-red-800">
                                        <Warehouse className="h-3 w-3 shrink-0" aria-hidden />
                                        Magasin (bloqués stock) · {logisticsLists.blocked.length}
                                    </h3>
                                    <div className="flex max-h-36 flex-col gap-1 overflow-y-auto pr-0.5">
                                        {logisticsLists.blocked.map(ev => {
                                            const model = models.find(m => m.id === ev.modelId);
                                            const thumb = model?.images?.front || model?.image || null;
                                            return (
                                                <button
                                                    key={ev.id}
                                                    type="button"
                                                    onClick={() => { setSelectedEvent(ev); setHeaderPopover(null); }}
                                                    className="flex min-w-0 items-center gap-2 rounded-lg border border-red-100/80 bg-red-50/40 px-2 py-1.5 text-left hover:bg-red-50/80"
                                                >
                                                    {thumb ? (
                                                        <img src={thumb} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-slate-200/80" />
                                                    ) : (
                                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-200/80">
                                                            <Package className="h-4 w-4 text-slate-500" />
                                                        </div>
                                                    )}
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[11px] font-semibold text-slate-900">{evDisplayName(ev)}</span>
                                                        <span className="block truncate text-[10px] text-slate-600">{evClient(ev)}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}
                            {logisticsLists.external.length > 0 && (
                                <section>
                                    <h3 className="mb-1 flex items-center gap-1 text-[10px] font-bold text-orange-900">
                                        <Shirt className="h-3 w-3 shrink-0" aria-hidden />
                                        Sous-traitance · {logisticsLists.external.length}
                                    </h3>
                                    <div className="flex max-h-36 flex-col gap-1 overflow-y-auto pr-0.5">
                                        {logisticsLists.external.map(ev => {
                                            const model = models.find(m => m.id === ev.modelId);
                                            const thumb = model?.images?.front || model?.image || null;
                                            return (
                                                <button
                                                    key={ev.id}
                                                    type="button"
                                                    onClick={() => { setSelectedEvent(ev); setHeaderPopover(null); }}
                                                    className="flex min-w-0 items-center gap-2 rounded-lg border border-orange-100/80 bg-orange-50/40 px-2 py-1.5 text-left hover:bg-orange-50/80"
                                                >
                                                    {thumb ? (
                                                        <img src={thumb} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-slate-200/80" />
                                                    ) : (
                                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-200/80">
                                                            <Package className="h-4 w-4 text-slate-500" />
                                                        </div>
                                                    )}
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[11px] font-semibold text-slate-900">{evDisplayName(ev)}</span>
                                                        <span className="block truncate text-[10px] text-slate-600">{evClient(ev)}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}
                            {logisticsLists.fourn.length > 0 && (
                                <section>
                                    <h3 className="mb-1 flex items-center gap-1 text-[10px] font-bold text-slate-800">
                                        <Truck className="h-3 w-3 shrink-0" aria-hidden />
                                        Réception fournisseur · {logisticsLists.fourn.length}
                                        {logisticsSnapshot.fournLate > 0 && (
                                            <span className="ml-1 rounded bg-amber-600 px-1 py-px text-[9px] font-bold text-white">
                                                {logisticsSnapshot.fournLate} en retard
                                            </span>
                                        )}
                                    </h3>
                                    <div className="flex max-h-36 flex-col gap-1 overflow-y-auto pr-0.5">
                                        {logisticsLists.fourn.map(ev => {
                                            const model = models.find(m => m.id === ev.modelId);
                                            const thumb = model?.images?.front || model?.image || null;
                                            return (
                                                <button
                                                    key={ev.id}
                                                    type="button"
                                                    onClick={() => { setSelectedEvent(ev); setHeaderPopover(null); }}
                                                    className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-1.5 text-left hover:bg-slate-100/80"
                                                >
                                                    {thumb ? (
                                                        <img src={thumb} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-slate-200/80" />
                                                    ) : (
                                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-200/80">
                                                            <Package className="h-4 w-4 text-slate-500" />
                                                        </div>
                                                    )}
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[11px] font-semibold text-slate-900">{evDisplayName(ev)}</span>
                                                        <span className="block truncate text-[10px] text-slate-600">{evClient(ev)}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}
                            {logisticsLists.lots.length > 0 && (
                                <section>
                                    <h3 className="mb-1 flex items-center gap-1 text-[10px] font-bold text-violet-900">
                                        <Layers className="h-3 w-3 shrink-0" aria-hidden />
                                        Lots ouverts · {logisticsLists.lots.length}
                                    </h3>
                                    <div className="flex max-h-36 flex-col gap-1 overflow-y-auto pr-0.5">
                                        {logisticsLists.lots.map(ev => {
                                            const model = models.find(m => m.id === ev.modelId);
                                            const thumb = model?.images?.front || model?.image || null;
                                            return (
                                                <button
                                                    key={ev.id}
                                                    type="button"
                                                    onClick={() => { setSelectedEvent(ev); setHeaderPopover(null); }}
                                                    className="flex min-w-0 items-center gap-2 rounded-lg border border-violet-100/80 bg-violet-50/40 px-2 py-1.5 text-left hover:bg-violet-50/80"
                                                >
                                                    {thumb ? (
                                                        <img src={thumb} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-slate-200/80" />
                                                    ) : (
                                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-200/80">
                                                            <Package className="h-4 w-4 text-slate-500" />
                                                        </div>
                                                    )}
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[11px] font-semibold text-slate-900">{evDisplayName(ev)}</span>
                                                        <span className="block truncate text-[10px] text-slate-600">{evClient(ev)}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}
                        </div>
                    ) : (
                        <>
                            <p className="mb-2 text-[10px] text-slate-500">
                                {statBuckets[headerPopover.kind].length} ordre(s) — clic pour ouvrir le détail.
                            </p>
                            <div className="flex flex-col gap-1">
                                {statBuckets[headerPopover.kind].length === 0 ? (
                                    <p className="py-2 text-center text-[11px] italic text-slate-400">Aucun OF dans cette catégorie</p>
                                ) : (
                                    statBuckets[headerPopover.kind].map(ev => {
                                        const model = models.find(m => m.id === ev.modelId);
                                        const thumb = model?.images?.front || model?.image || null;
                                        return (
                                            <button
                                                key={ev.id}
                                                type="button"
                                                onClick={() => { setSelectedEvent(ev); setHeaderPopover(null); }}
                                                className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/50 px-2 py-1.5 text-left hover:bg-slate-100/80"
                                            >
                                                {thumb ? (
                                                    <img src={thumb} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-slate-200/80" />
                                                ) : (
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-200/80">
                                                        <Package className="h-4 w-4 text-slate-500" />
                                                    </div>
                                                )}
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[11px] font-semibold text-slate-900">{evDisplayName(ev)}</span>
                                                    <span className="block truncate text-[10px] text-slate-600">{evClient(ev)}</span>
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    )}
                </div>,
                document.body,
            )}
            <BlockingConfirm
                open={deleteConfirmId !== null}
                title="Supprimer cet ordre ?"
                message="L'ordre sera retiré du planning. Vérifiez les suivis liés si nécessaire."
                variant="danger"
                confirmLabel="Supprimer"
                onCancel={() => setDeleteConfirmId(null)}
                onConfirm={() => {
                    if (!deleteConfirmId) return;
                    setPlanningEvents(p => p.filter(e => e.id !== deleteConfirmId));
                    setSelectedEvent(null);
                    setDeleteConfirmId(null);
                }}
            />
            <BlockingConfirm
                open={machineConfirm !== null}
                title={machineConfirm?.title ?? ''}
                message={machineConfirm?.message ?? ''}
                variant="warning"
                confirmLabel="Continuer"
                cancelLabel="Annuler"
                onCancel={() => setMachineConfirm(null)}
                onConfirm={() => {
                    const run = machineConfirm?.onProceed;
                    setMachineConfirm(null);
                    run?.();
                }}
            />
            <BlockingConfirm
                open={capacityConfirm !== null}
                title={capacityConfirm?.title ?? ''}
                message={capacityConfirm?.message ?? ''}
                variant="warning"
                confirmLabel="Continuer"
                cancelLabel="Annuler"
                onCancel={() => setCapacityConfirm(null)}
                onConfirm={() => {
                    const run = capacityConfirm?.onProceed;
                    setCapacityConfirm(null);
                    run?.();
                }}
            />
        </div>
    );
}
