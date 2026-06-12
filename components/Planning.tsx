// v2
import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent, SuiviData } from '../types';

import PlanningHeader from './planning/header/PlanningHeader';
import QuickFilters from './planning/header/QuickFilters';
import type { ViewKind } from './planning/header/ViewSwitcher';
import { ZOOM_DEFAULT, type ZoomLevel } from './planning/header/ZoomSwitcher';

import IssuesPanel from './planning/panels/IssuesPanel';
import EventDetailPanel from './planning/panels/EventDetailPanel';
import ContextMenu from './planning/panels/ContextMenu';

import EventEditor from './planning/modals/EventEditor';
import SplitModal from './planning/modals/SplitModal';
import SplitResultModal from './planning/modals/SplitResultModal';
import AutoScheduleSuggestion from './planning/modals/AutoScheduleSuggestion';
import CommandPalette, { type CommandAction } from './planning/modals/CommandPalette';
import AIOptimizationModal from './planning/modals/AIOptimizationModal';
import BatchOrderModal, { type BatchOrderResult } from './planning/modals/BatchOrderModal';
import ShortcutsHint from './planning/shared/ShortcutsHint';
import PlanningAnimations from './planning/shared/PlanningAnimations';
import FocusBanner from './planning/shared/FocusBanner';
import { evClientName as evClientNameUtil, evModelName as evModelNameUtil, evQty } from './planning/shared/eventAccessors';
import { useIsMobile } from './planning/shared/useIsMobile';
import { Plus, Sparkles, Calendar as CalIcon, LayoutGrid, Rows, Printer as PrinterIcon, Filter as FilterIcon, Eye, X as XIcon, Flame, Minimize2, Maximize2, Zap, Check, AlertCircle, Layers } from 'lucide-react';

import GanttView from './planning/views/gantt/GanttView';
import CalendarView from './planning/views/CalendarView';
import CardsView from './planning/views/CardsView';

import { usePlanningChains } from './planning/hooks/usePlanningChains';
import { usePlanningStock } from './planning/hooks/usePlanningStock';
import { usePlanningEvents } from './planning/hooks/usePlanningEvents';
import { usePlanningHistory } from './planning/hooks/usePlanningHistory';
import { usePlanningValidation, checkEventDraft } from './planning/hooks/usePlanningValidation';
import { usePlanningFilters } from './planning/hooks/usePlanningFilters';
import { useAutoSchedule } from './planning/hooks/useAutoSchedule';
import { usePlanningPrint } from './planning/hooks/usePlanningPrint';
import { delayOf } from './planning/hooks/useDelayIndicator';
import { toWorkStatus } from './planning/shared/statusConfig';

import { useCriticalRatio } from './planning/hooks/useCriticalRatio';
import CrisisAlertPanel from './planning/panels/CrisisAlertPanel';

interface PlanningProps {
    models: ModelData[];
    planningEvents: PlanningEvent[];
    suivis: SuiviData[];
    setPlanningEvents: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    setModels: React.Dispatch<React.SetStateAction<ModelData[]>>;
    setSuivis: React.Dispatch<React.SetStateAction<SuiviData[]>>;
    setCurrentView: (view: any) => void;
    settings: AppSettings;
    machines: Machine[];
    onOpenSuivi?: (planningEventId: string) => void;
    onOpenInIngenierie?: (modelId: string) => void;
}

export default function Planning({
    models, planningEvents, suivis,
    setPlanningEvents, settings, machines,
    onOpenSuivi, onOpenInIngenierie,
}: PlanningProps) {

    const isMobile = useIsMobile();
    const [view, setView] = useState<ViewKind>('gantt');
    const [zoom, setZoom] = useState<ZoomLevel>(() => {
        try {
            const v = localStorage.getItem('planning_zoom');
            const n = v ? parseFloat(v) : NaN;
            return Number.isFinite(n) && n >= 8 && n <= 800 ? n : ZOOM_DEFAULT;
        } catch {
            return ZOOM_DEFAULT;
        }
    });
    const [pulseToday, setPulseToday] = useState<number>(0);
    const [showHeatMap, setShowHeatMap] = useState<boolean>(() => {
        try { return localStorage.getItem('planning_heatmap') === '1'; } catch { return false; }
    });
    const [showCRColors, setShowCRColors] = useState<boolean>(() => {
        try { return localStorage.getItem('planning_cr_colors') === '1'; } catch { return false; }
    });
    const [toastMessage, setToastMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
    
    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 4000);
    };

    const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
        try { return localStorage.getItem('planning_density') === 'compact' ? 'compact' : 'comfortable'; } catch { return 'comfortable'; }
    });

    useEffect(() => {
        try { localStorage.setItem('planning_zoom', String(zoom)); } catch {}
    }, [zoom]);
    useEffect(() => {
        try { localStorage.setItem('planning_heatmap', showHeatMap ? '1' : '0'); } catch {}
    }, [showHeatMap]);
    useEffect(() => {
        try { localStorage.setItem('planning_cr_colors', showCRColors ? '1' : '0'); } catch {}
    }, [showCRColors]);
    useEffect(() => {
        try { localStorage.setItem('planning_density', density); } catch {}
    }, [density]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [multiIds, setMultiIds] = useState<Set<string>>(new Set());
    const lastAnchorRef = React.useRef<string | null>(null);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
    const [editorInitial, setEditorInitial] = useState<PlanningEvent | null>(null);
    const [splitOpen, setSplitOpen] = useState<PlanningEvent | null>(null);
    const [splitResult, setSplitResult] = useState<{ original: PlanningEvent; newEvents: PlanningEvent[] } | null>(null);
    const [autoOpen, setAutoOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
    const [chainCtxMenu, setChainCtxMenu] = useState<{ x: number; y: number; chainId: string } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [soloChainId, setSoloChainId] = useState<string | null>(null);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [aiOptimizeOpen, setAiOptimizeOpen] = useState(false);
    const [batchOpen, setBatchOpen] = useState(false);

    // Panel width — resizable, persisté
    const [panelWidth, setPanelWidth] = useState<number>(() => {
        try {
            const v = localStorage.getItem('planning_panel_w');
            const n = v ? parseInt(v, 10) : NaN;
            return Number.isFinite(n) && n >= 320 && n <= 720 ? n : 380;
        } catch {
            return 380;
        }
    });

    // Notes par OF — persistées dans localStorage
    const [notesMap, setNotesMap] = useState<Record<string, string>>(() => {
        try {
            const v = localStorage.getItem('planning_notes_v1');
            return v ? JSON.parse(v) : {};
        } catch {
            return {};
        }
    });
    const saveNotes = (eventId: string, value: string) => {
        setNotesMap(prev => {
            const next = { ...prev, [eventId]: value };
            try { localStorage.setItem('planning_notes_v1', JSON.stringify(next)); } catch {}
            return next;
        });
    };

    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = panelWidth;
        const onMove = (ev: MouseEvent) => {
            const dx = startX - ev.clientX;
            const next = Math.max(320, Math.min(720, startW + dx));
            setPanelWidth(next);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            try { localStorage.setItem('planning_panel_w', String(panelWidth)); } catch {}
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    // persiste largeur quand elle change
    useEffect(() => {
        try { localStorage.setItem('planning_panel_w', String(panelWidth)); } catch {}
    }, [panelWidth]);

    const stock = usePlanningStock();
    const chains = usePlanningChains({ settings, suivis, planningEvents, models });
    const history = usePlanningHistory({ planningEvents, setPlanningEvents });
    const eventsApi = usePlanningEvents({ planningEvents, setPlanningEvents: history.setWithHistory, models, chains, settings, stock: stock.stock });
    const issues = usePlanningValidation({ planningEvents, models, machines, settings, chains });
    const { eventsWithCR, crisisEvents } = useCriticalRatio({ planningEvents, models, settings, chains });
    const filtersApi = usePlanningFilters(eventsWithCR, models);
    const { suggest } = useAutoSchedule({ chains, planningEvents, models, machines, settings });
    const print = usePlanningPrint();

    const openCreate = () => {
        setEditorMode('create');
        setEditorInitial(null);
        setEditorOpen(true);
    };
    const openEdit = (id: string) => {
        const ev = planningEvents.find(e => e.id === id);
        if (!ev) return;
        setEditorMode('edit');
        setEditorInitial(ev);
        setEditorOpen(true);
    };

    // Keyboard shortcuts
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
            if (e.key === 'Escape') {
                setSelectedId(null);
                setContextMenu(null);
                setFocusedId(null);
                setMultiIds(new Set());
            }
            if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                openCreate();
            }
            if (e.key === 'a' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setAutoOpen(true);
            }
            if (e.key === 'f' && !e.ctrlKey && !e.metaKey && selectedId) {
                e.preventDefault();
                setFocusedId(prev => prev === selectedId ? null : selectedId);
            }
            if ((e.key === 'p' || e.key === 'P') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                print();
            }
            if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setPaletteOpen(true);
            }
            if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
                e.preventDefault();
                history.undo();
            }
            if (((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey))
                || ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
                e.preventDefault();
                history.redo();
            }
            if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
                const input = document.querySelector('input[placeholder*="Rechercher"]') as HTMLInputElement | null;
                if (input) {
                    e.preventDefault();
                    input.focus();
                }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [selectedId, print, history.undo, history.redo]);

    const stats = useMemo(() => {
        let active = 0, blocked = 0, late = 0;
        for (const ev of planningEvents) {
            const ws = toWorkStatus(ev.status);
            if (ws === 'IN_PROGRESS') active++;
            if (ws === 'BLOCKED') blocked++;
            if (delayOf(ev) === 'LATE' && ws !== 'DONE') late++;
        }
        return { active, blocked, late };
    }, [planningEvents]);

    const selectedEvent = useMemo(
        () => planningEvents.find(e => e.id === selectedId) || null,
        [planningEvents, selectedId]
    );
    const selectedChain = chains.find(c => c.id === selectedEvent?.chaineId);

    const handleSubmit = (data: {
        selectedLotId?: string;
        modelId: string;
        chaineId: string;
        startDate: string;
        quantity: number;
        clientName: string;
        strictDeadline_DDS: string;
        fournisseurDate: string;
        color: string;
        isSubcontracted?: boolean;
        subcontractorName?: string;
        subcontractStatus?: 'PENDING' | 'SENT' | 'COMPLETED';
        subcontractorPhone?: string;
        subcontractorRating?: number;
        subcontractorAvailabilityDate?: string;
        subcontractPricePerPiece?: number;
        subcontractSizeColorDistribution?: Record<string, Record<string, number>>;
        sizeColorDistribution?: Record<string, Record<string, number>>;
        subcontractDeadline?: string;
        subcontractQuantity?: number;
    }) => {
        const hasOutsource = !!(data.isSubcontracted && (
            (data.subcontractSizeColorDistribution && Object.values(data.subcontractSizeColorDistribution).some(colorMap => 
                Object.values(colorMap).some(qty => qty > 0)
            )) || 
            (data.subcontractQuantity && data.subcontractQuantity > 0)
        ));

        let outsourceQty = 0;
        if (hasOutsource) {
            if (data.subcontractSizeColorDistribution) {
                Object.values(data.subcontractSizeColorDistribution).forEach(colorMap => {
                    Object.values(colorMap).forEach(qty => {
                        outsourceQty += qty;
                    });
                });
            } else if (data.subcontractQuantity) {
                outsourceQty = data.subcontractQuantity;
            }
        }

        const hasLocal = data.quantity > 0;

        if (editorMode === 'create') {
            if (data.selectedLotId) {
                if (hasLocal && hasOutsource) {
                    // Split case: Update existing lot event to be local only
                    eventsApi.updateEvent(data.selectedLotId, {
                        modelId: data.modelId,
                        chaineId: data.chaineId,
                        startDate: data.startDate,
                        dateLancement: data.startDate,
                        totalQuantity: data.quantity,
                        qteTotal: data.quantity,
                        clientName: data.clientName,
                        strictDeadline_DDS: data.strictDeadline_DDS || undefined,
                        fournisseurDate: data.fournisseurDate || undefined,
                        color: data.color,
                        isSubcontracted: false,
                        subcontractorName: undefined,
                        subcontractStatus: undefined,
                        subcontractorPhone: undefined,
                        subcontractorRating: undefined,
                        subcontractorAvailabilityDate: undefined,
                        subcontractPricePerPiece: undefined,
                        subcontractSizeColorDistribution: undefined,
                        sizeColorDistribution: data.sizeColorDistribution,
                    });

                    // Create new outsourced event for the split off portion
                    eventsApi.addEvent({
                        modelId: data.modelId,
                        chaineId: data.chaineId,
                        startDate: data.startDate,
                        quantity: outsourceQty,
                        clientName: data.clientName,
                        strictDeadline_DDS: data.subcontractDeadline || data.strictDeadline_DDS || undefined,
                        fournisseurDate: data.fournisseurDate || undefined,
                        color: data.color,
                        isSubcontracted: true,
                        subcontractorName: data.subcontractorName,
                        subcontractStatus: data.subcontractStatus,
                        subcontractorPhone: data.subcontractorPhone,
                        subcontractorRating: data.subcontractorRating,
                        subcontractorAvailabilityDate: data.subcontractorAvailabilityDate,
                        subcontractPricePerPiece: data.subcontractPricePerPiece,
                        sizeColorDistribution: data.subcontractSizeColorDistribution,
                    });
                } else {
                    // Either purely local or purely outsourced (no split needed)
                    eventsApi.updateEvent(data.selectedLotId, {
                        modelId: data.modelId,
                        chaineId: data.chaineId,
                        startDate: data.startDate,
                        dateLancement: data.startDate,
                        totalQuantity: data.quantity > 0 ? data.quantity : outsourceQty,
                        qteTotal: data.quantity > 0 ? data.quantity : outsourceQty,
                        clientName: data.clientName,
                        strictDeadline_DDS: data.isSubcontracted ? (data.subcontractDeadline || data.strictDeadline_DDS || undefined) : (data.strictDeadline_DDS || undefined),
                        fournisseurDate: data.fournisseurDate || undefined,
                        color: data.color,
                        isSubcontracted: data.isSubcontracted,
                        subcontractorName: data.subcontractorName,
                        subcontractStatus: data.subcontractStatus,
                        subcontractorPhone: data.subcontractorPhone,
                        subcontractorRating: data.subcontractorRating,
                        subcontractorAvailabilityDate: data.subcontractorAvailabilityDate,
                        subcontractPricePerPiece: data.subcontractPricePerPiece,
                        subcontractSizeColorDistribution: data.subcontractSizeColorDistribution,
                        sizeColorDistribution: data.isSubcontracted ? data.subcontractSizeColorDistribution : data.sizeColorDistribution,
                    });
                }
            } else {
                if (hasLocal) {
                    eventsApi.addEvent({
                        modelId: data.modelId,
                        chaineId: data.chaineId,
                        startDate: data.startDate,
                        quantity: data.quantity,
                        clientName: data.clientName,
                        strictDeadline_DDS: data.strictDeadline_DDS,
                        fournisseurDate: data.fournisseurDate,
                        color: data.color,
                        isSubcontracted: false,
                        sizeColorDistribution: data.sizeColorDistribution,
                    });
                }
                if (hasOutsource) {
                    eventsApi.addEvent({
                        modelId: data.modelId,
                        chaineId: data.chaineId,
                        startDate: data.startDate,
                        quantity: outsourceQty,
                        clientName: data.clientName,
                        strictDeadline_DDS: data.subcontractDeadline || data.strictDeadline_DDS || undefined,
                        fournisseurDate: data.fournisseurDate || undefined,
                        color: data.color,
                        isSubcontracted: true,
                        subcontractorName: data.subcontractorName,
                        subcontractStatus: data.subcontractStatus,
                        subcontractorPhone: data.subcontractorPhone,
                        subcontractorRating: data.subcontractorRating,
                        subcontractorAvailabilityDate: data.subcontractorAvailabilityDate,
                        subcontractPricePerPiece: data.subcontractPricePerPiece,
                        sizeColorDistribution: data.subcontractSizeColorDistribution,
                    });
                }
            }
        } else if (editorInitial) {
            if (hasLocal && hasOutsource) {
                // Split case: Update original event to be local only
                eventsApi.updateEvent(editorInitial.id, {
                    modelId: data.modelId,
                    chaineId: data.chaineId,
                    startDate: data.startDate,
                    dateLancement: data.startDate,
                    totalQuantity: data.quantity,
                    qteTotal: data.quantity,
                    clientName: data.clientName,
                    strictDeadline_DDS: data.strictDeadline_DDS || undefined,
                    fournisseurDate: data.fournisseurDate || undefined,
                    color: data.color,
                    isSubcontracted: false,
                    subcontractorName: undefined,
                    subcontractStatus: undefined,
                    subcontractorPhone: undefined,
                    subcontractorRating: undefined,
                    subcontractorAvailabilityDate: undefined,
                    subcontractPricePerPiece: undefined,
                    subcontractSizeColorDistribution: undefined,
                    sizeColorDistribution: data.sizeColorDistribution,
                });

                // Create new outsourced event for the split off portion
                eventsApi.addEvent({
                    modelId: data.modelId,
                    chaineId: data.chaineId,
                    startDate: data.startDate,
                    quantity: outsourceQty,
                    clientName: data.clientName,
                    strictDeadline_DDS: data.subcontractDeadline || data.strictDeadline_DDS || undefined,
                    fournisseurDate: data.fournisseurDate || undefined,
                    color: data.color,
                    isSubcontracted: true,
                    subcontractorName: data.subcontractorName,
                    subcontractStatus: data.subcontractStatus,
                    subcontractorPhone: data.subcontractorPhone,
                    subcontractorRating: data.subcontractorRating,
                    subcontractorAvailabilityDate: data.subcontractorAvailabilityDate,
                    subcontractPricePerPiece: data.subcontractPricePerPiece,
                    sizeColorDistribution: data.subcontractSizeColorDistribution,
                });
            } else {
                // Either purely local or purely outsourced (no split needed)
                eventsApi.updateEvent(editorInitial.id, {
                    modelId: data.modelId,
                    chaineId: data.chaineId,
                    startDate: data.startDate,
                    dateLancement: data.startDate,
                    totalQuantity: data.quantity > 0 ? data.quantity : outsourceQty,
                    qteTotal: data.quantity > 0 ? data.quantity : outsourceQty,
                    clientName: data.clientName,
                    strictDeadline_DDS: data.isSubcontracted ? (data.subcontractDeadline || data.strictDeadline_DDS || undefined) : (data.strictDeadline_DDS || undefined),
                    fournisseurDate: data.fournisseurDate || undefined,
                    color: data.color,
                    isSubcontracted: data.isSubcontracted,
                    subcontractorName: data.subcontractorName,
                    subcontractStatus: data.subcontractStatus,
                    subcontractorPhone: data.subcontractorPhone,
                    subcontractorRating: data.subcontractorRating,
                    subcontractorAvailabilityDate: data.subcontractorAvailabilityDate,
                    subcontractPricePerPiece: data.subcontractPricePerPiece,
                    subcontractSizeColorDistribution: data.subcontractSizeColorDistribution,
                    sizeColorDistribution: data.isSubcontracted ? data.subcontractSizeColorDistribution : data.sizeColorDistribution,
                });
            }
        }
        setEditorOpen(false);
    };

    const handleBatchSubmit = (orders: BatchOrderResult[]) => {
        orders.forEach(order => {
            eventsApi.addEvent({
                modelId: order.modelId,
                chaineId: order.chaineId,
                startDate: order.startDate,
                quantity: order.quantity,
                clientName: order.clientName,
                strictDeadline_DDS: order.strictDeadline_DDS || undefined,
                color: order.color,
            });
        });
        setBatchOpen(false);
        showToast(`${orders.length} ordre${orders.length > 1 ? 's' : ''} planifié${orders.length > 1 ? 's' : ''} avec succès !`);
    };

    const handleAutoAccept = (data: { modelId: string; chaineId: string; startDate: string; quantity: number; deadlineDDS?: string }) => {
        eventsApi.addEvent({
            modelId: data.modelId,
            chaineId: data.chaineId,
            startDate: data.startDate,
            quantity: data.quantity,
            strictDeadline_DDS: data.deadlineDDS,
        });
        setAutoOpen(false);
    };

    const handleSelectEvent = (id: string, modifiers?: { ctrl?: boolean; shift?: boolean }) => {
        const ctrl = !!modifiers?.ctrl;
        const shift = !!modifiers?.shift;
        if (!ctrl && !shift) {
            setSelectedId(id);
            setMultiIds(new Set());
            lastAnchorRef.current = id;
            return;
        }
        if (ctrl) {
            setMultiIds(prev => {
                const next = new Set(prev);
                if (selectedId && next.size === 0) next.add(selectedId);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
            lastAnchorRef.current = id;
            setSelectedId(null);
            return;
        }
        if (shift) {
            const anchor = lastAnchorRef.current || selectedId;
            const order = filtersApi.filtered.map(e => e.id);
            if (!anchor || !order.includes(anchor)) {
                setMultiIds(new Set([id]));
                lastAnchorRef.current = id;
                setSelectedId(null);
                return;
            }
            const a = order.indexOf(anchor);
            const b = order.indexOf(id);
            if (b === -1) return;
            const [lo, hi] = a < b ? [a, b] : [b, a];
            setMultiIds(new Set(order.slice(lo, hi + 1)));
            setSelectedId(null);
        }
    };

    const handleBulkDelete = () => {
        const ids = Array.from(multiIds);
        ids.forEach(id => eventsApi.deleteEvent(id));
        setMultiIds(new Set());
    };
    const handleBulkStatus = (status: any) => {
        Array.from(multiIds).forEach(id => eventsApi.setStatus(id, status));
    };
    const handleBulkMove = (chaineId: string) => {
        Array.from(multiIds).forEach(id => {
            const ev = planningEvents.find(e => e.id === id);
            if (ev) eventsApi.updateEvent(id, { chaineId });
        });
    };

    const handleContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, id });
    };

    const handleDelete = (id: string) => {
        eventsApi.deleteEvent(id);
        setSelectedId(null);
        setDeleteConfirm(null);
    };

    const handleClearPlanning = () => {
        if (window.confirm("Êtes-vous sûr de vouloir vider TOUT le planning ? Cette action est irréversible et supprimera toutes les réservations associées.")) {
            eventsApi.clearAllEvents();
        }
    };

    const paletteActions = useMemo<CommandAction[]>(() => {
        const list: CommandAction[] = [
            { id: 'new', label: 'Nouvel ordre', icon: Plus, group: 'Actions', shortcut: 'N', onRun: openCreate },
            { id: 'auto', label: 'Planification automatique', icon: Sparkles, group: 'Actions', shortcut: 'A', onRun: () => setAutoOpen(true) },
            { id: 'print', label: 'Imprimer / Exporter PDF', icon: PrinterIcon, group: 'Actions', shortcut: '⌘P', onRun: print },
            { id: 'today', label: 'Aller à aujourd\'hui', icon: CalIcon, group: 'Navigation', onRun: () => setCurrentDate(new Date()) },
            { id: 'view-gantt', label: 'Vue Gantt', icon: Rows, group: 'Vues', onRun: () => setView('gantt') },
            { id: 'view-calendar', label: 'Vue Calendrier', icon: CalIcon, group: 'Vues', onRun: () => setView('calendar') },
            { id: 'view-cards', label: 'Vue Cartes', icon: LayoutGrid, group: 'Vues', onRun: () => setView('cards') },
            { id: 'filters', label: filtersOpen ? 'Masquer les filtres' : 'Afficher les filtres', icon: FilterIcon, group: 'Affichage', onRun: () => setFiltersOpen(v => !v) },
            { id: 'heatmap', label: showHeatMap ? 'Masquer la carte de charge' : 'Afficher la carte de charge', icon: Flame, group: 'Affichage', onRun: () => setShowHeatMap(v => !v) },
            { id: 'crcolors', label: showCRColors ? 'Masquer les couleurs de taux critique' : 'Afficher les couleurs de taux critique', icon: Zap, group: 'Affichage', onRun: () => setShowCRColors(v => !v) },
            { id: 'density', label: density === 'compact' ? 'Affichage confortable' : 'Affichage compact', icon: density === 'compact' ? Maximize2 : Minimize2, group: 'Affichage', onRun: () => setDensity(d => d === 'compact' ? 'comfortable' : 'compact') },
        ];
        if (soloChainId) {
            list.push({ id: 'unsolo', label: 'Sortir du mode isolé', icon: Eye, group: 'Affichage', onRun: () => setSoloChainId(null) });
        }
        if (filtersApi.hasActiveFilters) {
            list.push({ id: 'reset-filters', label: 'Effacer tous les filtres', icon: XIcon, group: 'Affichage', onRun: filtersApi.resetFilters });
        }
        // Quick-jump to existing events
        for (const ev of planningEvents.slice(0, 20)) {
            const client = ev.clientName || models.find(m => m.id === ev.modelId)?.ficheData?.client || '—';
            const name = ev.modelName || models.find(m => m.id === ev.modelId)?.meta_data?.nom_modele || 'Ordre';
            list.push({
                id: `ev-${ev.id}`,
                label: `${client} · ${name}`,
                hint: ev.chaineId,
                keywords: `${client} ${name} ${ev.chaineId}`,
                icon: Eye,
                group: 'Ordres',
                onRun: () => { setSelectedId(ev.id); setFocusedId(ev.id); },
            });
        }
        return list;
    }, [filtersOpen, soloChainId, filtersApi, planningEvents, models, print, showHeatMap, showCRColors, density]);

    return (
        <div className="h-full flex flex-col bg-gradient-to-tr from-slate-50 via-white to-indigo-50/20 font-sans select-none text-slate-800 antialiased relative">
            <PlanningAnimations />
            <PlanningHeader
                active={stats.active}
                blocked={stats.blocked}
                late={stats.late}
                view={view}
                onView={setView}
                zoom={zoom}
                onZoom={setZoom}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
                onToday={() => { setCurrentDate(new Date()); setPulseToday(Date.now()); }}
                onAddEvent={openCreate}
                onAutoSchedule={() => setAutoOpen(true)}
                onBatchSchedule={() => setBatchOpen(true)}
                onPrint={print}
                searchText={filtersApi.filters.searchText}
                onSearch={filtersApi.setSearchText}
                filtersOpen={filtersOpen}
                onToggleFilters={() => setFiltersOpen(v => !v)}
                hasActiveFilters={filtersApi.hasActiveFilters}
                onOptimizePlanning={() => setAiOptimizeOpen(true)}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                onUndo={history.undo}
                onRedo={history.redo}
                onClearPlanning={handleClearPlanning}
            />

            <QuickFilters
                open={filtersOpen}
                allClients={filtersApi.allClients}
                selectedClients={filtersApi.filters.clients}
                selectedStatuses={filtersApi.filters.statuses}
                hasActive={filtersApi.hasActiveFilters}
                onToggleClient={filtersApi.toggleClient}
                onToggleStatus={filtersApi.toggleStatus}
                onReset={filtersApi.resetFilters}
                showCRColors={showCRColors}
                onToggleCRColors={() => setShowCRColors(v => !v)}
            />

            <IssuesPanel
                issues={issues}
                events={planningEvents}
                models={models}
                onJumpToEvent={(id) => { setSelectedId(id); setFocusedId(id); }}
            />

            <CrisisAlertPanel
                crisisEvents={crisisEvents}
                eventsWithCR={eventsWithCR}
                models={models}
                settings={settings}
                onUpdateEvent={eventsApi.updateEvent}
                onAddEvent={eventsApi.addEvent}
                onJumpToEvent={(id) => { setSelectedId(id); setFocusedId(id); }}
                showToast={showToast}
            />

            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 relative overflow-hidden min-w-0 flex flex-col">
                {view === 'gantt' && (
                    <GanttView
                        chains={chains}
                        events={filtersApi.filtered}
                        totalEvents={planningEvents.length}
                        models={models}
                        settings={settings}
                        currentDate={currentDate}
                        zoom={zoom}
                        onZoomChange={setZoom}
                        pulseToday={pulseToday}
                        selectedId={selectedId}
                        selectedIds={multiIds}
                        focusedId={focusedId}
                        onSelectEvent={handleSelectEvent}
                        onEditEvent={openEdit}
                        onContextMenu={handleContextMenu}
                        onChainContextMenu={(e, chainId) => { e.preventDefault(); setChainCtxMenu({ x: e.clientX, y: e.clientY, chainId }); }}
                        onMoveEvent={eventsApi.moveEvent}
                        onAddEvent={openCreate}
                        onResetFilters={filtersApi.resetFilters}
                        soloChainId={soloChainId}
                        onToggleSolo={(id) => setSoloChainId(prev => prev === id ? null : id)}
                        showHeatMap={showHeatMap}
                        showCRColors={showCRColors}
                        density={density}
                        machines={machines}
                    />
                )}

                {view === 'calendar' && (
                    <div className="absolute inset-0 overflow-auto">
                        <CalendarView
                            events={filtersApi.filtered}
                            models={models}
                            currentDate={currentDate}
                            pulseToday={pulseToday}
                            onSelectEvent={setSelectedId}
                        />
                    </div>
                )}

                {view === 'cards' && (
                    <div className="absolute inset-0 overflow-auto">
                        <CardsView
                            events={filtersApi.filtered}
                            models={models}
                            onSelectEvent={setSelectedId}
                            onEditEvent={openEdit}
                        />
                    </div>
                )}

              </div>

              {selectedEvent && (
                <EventDetailPanel
                    event={selectedEvent}
                    models={models}
                    chainName={selectedChain?.name}
                    chainCapacity={selectedChain?.capacityPerDay}
                    chainEfficiency={selectedChain?.efficiency}
                    width={panelWidth}
                    onResizeStart={startResize}
                    onClose={() => setSelectedId(null)}
                    onEdit={() => openEdit(selectedEvent.id)}
                    onSplit={() => setSplitOpen(selectedEvent)}
                    onDuplicate={() => eventsApi.duplicateEvent(selectedEvent.id)}
                    onDelete={() => setDeleteConfirm(selectedEvent.id)}
                    onChangeStatus={(s) => eventsApi.setStatus(selectedEvent.id, s)}
                    onSetProduced={(delta) => {
                        const cur = Number(selectedEvent.producedQuantity ?? selectedEvent.qteProduite ?? 0);
                        const next = Math.max(0, cur + delta);
                        eventsApi.updateEvent(selectedEvent.id, { producedQuantity: next, qteProduite: next });
                    }}
                    notes={notesMap[selectedEvent.id] || ''}
                    onNotesChange={(v) => saveNotes(selectedEvent.id, v)}
                    settings={settings}
                    stockProducts={stock?.stock?.products}
                    stockLots={stock?.stock?.lots}
                    onReloadStock={stock.reload}
                    onApplyWorstSupplierDate={(ymd) => {
                        eventsApi.updateEvent(selectedEvent.id, { fournisseurDate: ymd });
                    }}
                    onAppendDraftPurchaseOrders={(drafts) => {
                        const cur = selectedEvent.purchaseOrdersDraft || [];
                        eventsApi.updateEvent(selectedEvent.id, { purchaseOrdersDraft: [...cur, ...drafts] });
                    }}
                    onUpdateEvent={(patch) => {
                        eventsApi.updateEvent(selectedEvent.id, patch);
                    }}
                />
              )}
            </div>

            <EventEditor
                open={editorOpen}
                mode={editorMode}
                initial={editorInitial}
                models={models}
                chains={chains}
                planningEvents={planningEvents}
                settings={settings}
                onClose={() => setEditorOpen(false)}
                onSubmit={handleSubmit}
                onOpenInIngenierie={onOpenInIngenierie}
                checkDraft={(d) => checkEventDraft(d, {
                    planningEvents,
                    models,
                    machines,
                    settings,
                    computeEndDate: eventsApi.computeEndDate,
                })}
            />

            <BatchOrderModal
                open={batchOpen}
                models={models}
                chains={chains}
                computeEndDate={eventsApi.computeEndDate}
                onClose={() => setBatchOpen(false)}
                onSubmit={handleBatchSubmit}
            />

            <SplitModal
                open={!!splitOpen}
                event={splitOpen}
                models={models}
                onClose={() => setSplitOpen(null)}
                onSubmit={(qty, lots) => {
                    if (splitOpen) {
                        const origId = splitOpen.id;
                        const origSnapshot = { ...splitOpen };
                        
                        if (lots && lots.length > 0) {
                            eventsApi.splitEventWithLots(origId, lots);
                        } else {
                            eventsApi.splitEvent(origId, qty);
                        }
                        
                        // Find the new events created from the split
                        setTimeout(() => {
                            const newEvts = planningEvents.filter(e => 
                                e.id !== origId && 
                                (e.id.startsWith(`event_${origId.replace('event_', '')}`) || 
                                 e.id.startsWith('event_') && e.id.includes(origId.replace('event_', '')))
                            );
                            
                            if (newEvts.length > 0) {
                                setSplitResult({
                                    original: { ...origSnapshot, totalQuantity: evQty(origSnapshot) - (lots ? lots.reduce((s, l) => s + l.quantity, 0) : qty) },
                                    newEvents: newEvts
                                });
                            }
                        }, 100);
                    }
                    setSplitOpen(null);
                }}
            />

            <SplitResultModal
                open={!!splitResult}
                originalEvent={splitResult?.original || null}
                newEvents={splitResult?.newEvents || []}
                models={models}
                onClose={() => setSplitResult(null)}
            />

            <AutoScheduleSuggestion
                open={autoOpen}
                models={models}
                onClose={() => setAutoOpen(false)}
                suggest={suggest}
                onAccept={handleAutoAccept}
            />

            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                actions={paletteActions}
            />

            <AIOptimizationModal
                open={aiOptimizeOpen}
                onClose={() => setAiOptimizeOpen(false)}
                events={planningEvents}
                machines={machines}
                settings={settings}
                onApply={(actions) => {
                    actions.forEach((act: any) => {
                        if (act.type === 'MOVE_EVENT') {
                            eventsApi.updateEvent(act.eventId, {
                                chaineId: act.targetChainId,
                                ...(act.targetStartDate && { startDate: act.targetStartDate }),
                                ...(act.targetEndDate && { estimatedEndDate: act.targetEndDate })
                            });
                        }
                    });
                }}
            />

            <ShortcutsHint />

            {/* Chain context menu */}
            {chainCtxMenu && (
                <div
                    style={{ position: 'fixed', top: chainCtxMenu.y, left: chainCtxMenu.x, zIndex: 9999 }}
                    className="bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[200px] animate-[planning-fade-up_80ms_ease-out]"
                    onMouseLeave={() => setChainCtxMenu(null)}
                >
                    <div className="px-3 py-1.5 border-b border-slate-100">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            {chainCtxMenu.chainId}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setSoloChainId(prev => prev === chainCtxMenu.chainId ? null : chainCtxMenu.chainId); setChainCtxMenu(null); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                        {soloChainId === chainCtxMenu.chainId ? 'Désactiver isolation' : 'Isoler cette chaîne'}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setSoloChainId(chainCtxMenu.chainId);
                            filtersApi.resetFilters();
                            setChainCtxMenu(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        Voir seule (modèles)
                    </button>
                    {soloChainId && (
                        <button
                            type="button"
                            onClick={() => { setSoloChainId(null); setChainCtxMenu(null); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-500 hover:bg-slate-50 transition-colors border-t border-slate-100"
                        >
                            <XIcon className="w-3.5 h-3.5 text-slate-400" />
                            Tout afficher
                        </button>
                    )}
                </div>
            )}

            {multiIds.size > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 border border-white/10 backdrop-blur-md text-white rounded-2xl shadow-[0_12px_40px_rgba(15,23,42,0.35)] flex items-stretch overflow-hidden animate-[planning-fade-up_180ms_ease-out]">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-r border-white/10 bg-white/5">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/15 text-[11px] font-bold tabular-nums">{multiIds.size}</span>
                        <span className="text-[12px] font-bold">sélectionné{multiIds.size > 1 ? 's' : ''}</span>
                    </div>
                    <select
                        onChange={(e) => { if (e.target.value) { handleBulkMove(e.target.value); e.target.value = ''; } }}
                        defaultValue=""
                        className="px-3 text-[12px] font-bold bg-slate-900 text-white border-r border-white/10 outline-none cursor-pointer hover:bg-white/10"
                    >
                        <option value="" disabled className="text-slate-400">Déplacer vers…</option>
                        {chains.map(c => (
                            <option key={c.id} value={c.id} className="text-slate-400">{c.name}</option>
                        ))}
                    </select>
                    <select
                        onChange={(e) => { if (e.target.value) { handleBulkStatus(e.target.value); e.target.value = ''; } }}
                        defaultValue=""
                        className="px-3 text-[12px] font-bold bg-slate-900 text-white border-r border-white/10 outline-none cursor-pointer hover:bg-white/10"
                    >
                        <option value="" disabled className="text-slate-400">Changer statut…</option>
                        <option value="READY" className="text-slate-400">Prêt</option>
                        <option value="IN_PROGRESS" className="text-slate-400">En cours</option>
                        <option value="BLOCKED_STOCK" className="text-slate-400">Bloqué stock</option>
                        <option value="EXTERNAL_PROCESS" className="text-slate-400">Proc. Externe</option>
                        <option value="DONE" className="text-slate-400">Terminé</option>
                    </select>
                    <button
                        type="button"
                        onClick={handleBulkDelete}
                        className="px-3 text-[12px] font-bold text-red-300 hover:bg-red-650 hover:text-white transition-all duration-200 active:scale-95"
                    >
                        Supprimer
                    </button>
                    <button
                        type="button"
                        onClick={() => setMultiIds(new Set())}
                        className="px-3.5 flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200 active:scale-95"
                        aria-label="Annuler la sélection"
                    >
                        <XIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {focusedId && (() => {
                const ev = planningEvents.find(e => e.id === focusedId);
                if (!ev) return null;
                const client = evClientNameUtil(ev, models);
                const name = evModelNameUtil(ev, models);
                return (
                    <FocusBanner
                        visible
                        label={`${client} · ${name}`}
                        onExit={() => setFocusedId(null)}
                    />
                );
            })()}

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    onView={() => setSelectedId(contextMenu.id)}
                    onEdit={() => openEdit(contextMenu.id)}
                    onSplit={() => {
                        const ev = planningEvents.find(e => e.id === contextMenu.id);
                        if (ev) setSplitOpen(ev);
                    }}
                    onDuplicate={() => eventsApi.duplicateEvent(contextMenu.id)}
                    onDelete={() => setDeleteConfirm(contextMenu.id)}
                    isPaused={planningEvents.find(e => e.id === contextMenu.id)?.status === 'BLOCKED_STOCK'}
                    onTogglePause={() => {
                        const ev = planningEvents.find(e => e.id === contextMenu.id);
                        const isPaused = ev?.status === 'BLOCKED_STOCK';
                        eventsApi.setStatus(contextMenu.id, isPaused ? 'READY' : 'BLOCKED_STOCK');
                    }}
                />
            )}

            {deleteConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-white/80 border border-white/50 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-6 max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-[16px] font-extrabold text-slate-900 tracking-tight">Supprimer l'ordre ?</h3>
                        <p className="text-[12px] text-slate-500 font-medium mt-1 mb-6">Cette action est définitive. L'ordre sera retiré du planning.</p>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="h-8.5 px-3 rounded-xl text-[12px] font-bold text-slate-650 hover:bg-slate-100 transition-all duration-200 active:scale-95"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDelete(deleteConfirm)}
                                className="h-8.5 px-4 rounded-xl text-[12px] font-bold bg-red-650 text-white hover:bg-red-700 shadow-sm transition-all duration-200 active:scale-95"
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toastMessage && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border bg-white border-slate-100 animate-[planning-fade-up_150ms_ease-out]">
                    <div className={`p-1 rounded-full ${toastMessage.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                        {toastMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    </div>
                    <span className="text-xs font-bold text-slate-800">{toastMessage.text}</span>
                </div>
            )}
        </div>
    );
}
