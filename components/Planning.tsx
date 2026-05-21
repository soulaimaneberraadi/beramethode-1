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
import AutoScheduleSuggestion from './planning/modals/AutoScheduleSuggestion';
import CommandPalette, { type CommandAction } from './planning/modals/CommandPalette';
import AIOptimizationModal from './planning/modals/AIOptimizationModal';
import ShortcutsHint from './planning/shared/ShortcutsHint';
import PlanningAnimations from './planning/shared/PlanningAnimations';
import FocusBanner from './planning/shared/FocusBanner';
import { evClientName as evClientNameUtil, evModelName as evModelNameUtil } from './planning/shared/eventAccessors';
import { Plus, Sparkles, Calendar as CalIcon, LayoutGrid, Rows, Printer as PrinterIcon, Filter as FilterIcon, Eye, X as XIcon, Flame, Minimize2, Maximize2 } from 'lucide-react';

import GanttView from './planning/views/gantt/GanttView';
import CalendarView from './planning/views/CalendarView';
import CardsView from './planning/views/CardsView';

import { usePlanningChains } from './planning/hooks/usePlanningChains';
import { usePlanningStock } from './planning/hooks/usePlanningStock';
import { usePlanningEvents } from './planning/hooks/usePlanningEvents';
import { usePlanningValidation, checkEventDraft } from './planning/hooks/usePlanningValidation';
import { usePlanningFilters } from './planning/hooks/usePlanningFilters';
import { useAutoSchedule } from './planning/hooks/useAutoSchedule';
import { usePlanningPrint } from './planning/hooks/usePlanningPrint';
import { delayOf } from './planning/hooks/useDelayIndicator';
import { toWorkStatus } from './planning/shared/statusConfig';

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
}

export default function Planning({
    models, planningEvents, suivis,
    setPlanningEvents, settings, machines,
    onOpenSuivi,
}: PlanningProps) {

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
        try { localStorage.setItem('planning_density', density); } catch {}
    }, [density]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
    const [editorInitial, setEditorInitial] = useState<PlanningEvent | null>(null);
    const [splitOpen, setSplitOpen] = useState<PlanningEvent | null>(null);
    const [autoOpen, setAutoOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [soloChainId, setSoloChainId] = useState<string | null>(null);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [aiOptimizeOpen, setAiOptimizeOpen] = useState(false);

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
    const eventsApi = usePlanningEvents({ planningEvents, setPlanningEvents, models, chains, settings, stock: stock.stock });
    const issues = usePlanningValidation({ planningEvents, models, machines, settings });
    const filtersApi = usePlanningFilters(planningEvents, models);
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
    }, [selectedId, print]);

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
    }) => {
        if (editorMode === 'create') {
            eventsApi.addEvent({
                modelId: data.modelId,
                chaineId: data.chaineId,
                startDate: data.startDate,
                quantity: data.quantity,
                clientName: data.clientName,
                strictDeadline_DDS: data.strictDeadline_DDS,
                fournisseurDate: data.fournisseurDate,
                color: data.color,
                isSubcontracted: data.isSubcontracted,
                subcontractorName: data.subcontractorName,
                subcontractStatus: data.subcontractStatus,
            });
        } else if (editorInitial) {
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
                isSubcontracted: data.isSubcontracted,
                subcontractorName: data.subcontractorName,
                subcontractStatus: data.subcontractStatus,
            });
        }
        setEditorOpen(false);
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

    const handleContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, id });
    };

    const handleDelete = (id: string) => {
        eventsApi.deleteEvent(id);
        setSelectedId(null);
        setDeleteConfirm(null);
    };

    const paletteActions = useMemo<CommandAction[]>(() => {
        const list: CommandAction[] = [
            { id: 'new', label: 'Nouvel ordre', icon: Plus, group: 'Actions', shortcut: 'N', onRun: openCreate },
            { id: 'auto', label: 'Jdwala automatique', icon: Sparkles, group: 'Actions', shortcut: 'A', onRun: () => setAutoOpen(true) },
            { id: 'print', label: 'Imprimer / Exporter PDF', icon: PrinterIcon, group: 'Actions', shortcut: '⌘P', onRun: print },
            { id: 'today', label: 'Aller à aujourd\'hui', icon: CalIcon, group: 'Navigation', onRun: () => setCurrentDate(new Date()) },
            { id: 'view-gantt', label: 'Vue Gantt', icon: Rows, group: 'Vues', onRun: () => setView('gantt') },
            { id: 'view-calendar', label: 'Vue Calendrier', icon: CalIcon, group: 'Vues', onRun: () => setView('calendar') },
            { id: 'view-cards', label: 'Vue Cartes', icon: LayoutGrid, group: 'Vues', onRun: () => setView('cards') },
            { id: 'filters', label: filtersOpen ? 'Masquer les filtres' : 'Afficher les filtres', icon: FilterIcon, group: 'Affichage', onRun: () => setFiltersOpen(v => !v) },
            { id: 'heatmap', label: showHeatMap ? 'Masquer la carte de charge' : 'Afficher la carte de charge', icon: Flame, group: 'Affichage', onRun: () => setShowHeatMap(v => !v) },
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
    }, [filtersOpen, soloChainId, filtersApi, planningEvents, models, print]);

    return (
        <div className="h-full flex flex-col bg-white font-sans select-none text-slate-800 antialiased relative">
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
                onPrint={print}
                searchText={filtersApi.filters.searchText}
                onSearch={filtersApi.setSearchText}
                filtersOpen={filtersOpen}
                onToggleFilters={() => setFiltersOpen(v => !v)}
                hasActiveFilters={filtersApi.hasActiveFilters}
                onOptimizePlanning={() => setAiOptimizeOpen(true)}
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
            />

            <IssuesPanel
                issues={issues}
                events={planningEvents}
                models={models}
                onJumpToEvent={(id) => { setSelectedId(id); setFocusedId(id); }}
            />

            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 relative overflow-hidden min-w-0">
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
                        focusedId={focusedId}
                        onSelectEvent={(id) => setSelectedId(id)}
                        onEditEvent={openEdit}
                        onContextMenu={handleContextMenu}
                        onMoveEvent={eventsApi.moveEvent}
                        onAddEvent={openCreate}
                        onResetFilters={filtersApi.resetFilters}
                        soloChainId={soloChainId}
                        onToggleSolo={(id) => setSoloChainId(prev => prev === id ? null : id)}
                        showHeatMap={showHeatMap}
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
                onClose={() => setEditorOpen(false)}
                onSubmit={handleSubmit}
                checkDraft={(d) => checkEventDraft(d, {
                    planningEvents,
                    models,
                    machines,
                    settings,
                    computeEndDate: eventsApi.computeEndDate,
                })}
            />

            <SplitModal
                open={!!splitOpen}
                event={splitOpen}
                models={models}
                onClose={() => setSplitOpen(null)}
                onSubmit={(qty) => {
                    if (splitOpen) eventsApi.splitEvent(splitOpen.id, qty);
                    setSplitOpen(null);
                }}
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
                />
            )}

            {deleteConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/20 backdrop-blur-[3px]" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-white rounded-xl shadow-[0_12px_40px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/60 p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">Supprimer l'ordre ?</h3>
                        <p className="text-[12px] text-slate-500 mt-1 mb-5">Cette action est définitive. L'ordre sera retiré du planning.</p>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="h-8 px-3 rounded-md text-[12px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDelete(deleteConfirm)}
                                className="h-8 px-3 rounded-md text-[12px] font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
