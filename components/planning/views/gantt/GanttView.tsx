import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent } from '../../../../types';
import type { PlanningChain } from '../../hooks/usePlanningChains';
import GanttTimeline from './GanttTimeline';
import GanttRow from './GanttRow';
import TodayLine from './TodayLine';
import DragPreview from './DragPreview';
import MiniMap from './MiniMap';
import { calculateEndDate } from '../../../../utils/planning';
import { getChainDailyCapacity, maxDayLoadRatioInSpan } from '../../../../utils/capacity';
import { evQty, evStartYmd, evEndYmd } from '../../shared/eventAccessors';
import EmptyState from '../../shared/EmptyState';
import { useIsMobile } from '../../shared/useIsMobile';
import { Layers, SearchX } from 'lucide-react';

import { ZOOM_MIN, ZOOM_MAX } from '../../header/ZoomSwitcher';

const SIDEBAR_W_DESKTOP = 192; // w-48
const SIDEBAR_W_MOBILE = 96;   // w-24

interface Props {
    chains: PlanningChain[];
    events: PlanningEvent[];
    totalEvents: number; // avant filtres — pour distinguer "vide" vs "no-match"
    models: ModelData[];
    settings: AppSettings;
    currentDate: Date;
    zoom: number;
    onZoomChange?: (z: number) => void;
    pulseToday?: number; // timestamp, déclenche un flash sur la today-line
    selectedId: string | null;
    selectedIds?: Set<string>;
    focusedId: string | null;
    onSelectEvent: (id: string, modifiers?: { ctrl?: boolean; shift?: boolean }) => void;
    onEditEvent: (id: string) => void;
    onContextMenu: (e: React.MouseEvent, id: string) => void;
    onChainContextMenu?: (e: React.MouseEvent, chaineId: string) => void;
    onMoveEvent: (id: string, chaineId: string, dateKey: string) => void;
    onAddEvent?: () => void;
    onResetFilters?: () => void;
    soloChainId?: string | null;
    onToggleSolo?: (chaineId: string) => void;
    showHeatMap?: boolean;
    density?: 'comfortable' | 'compact';
    showMiniMap?: boolean;
    machines: Machine[];
}

export default function GanttView({
    chains, events, totalEvents, models, settings,
    currentDate, zoom, onZoomChange, pulseToday,
    selectedId, selectedIds, focusedId,
    onSelectEvent, onEditEvent, onContextMenu, onChainContextMenu, onMoveEvent,
    onAddEvent, onResetFilters,
    soloChainId, onToggleSolo,
    showHeatMap, density = 'comfortable', showMiniMap = true,
    machines = [],
}: Props) {
    const isMobile = useIsMobile();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const rowHeight = isMobile ? (density === 'compact' ? 44 : 64) : (density === 'compact' ? 48 : 80);
    const SIDEBAR_W_FULL = isMobile ? SIDEBAR_W_MOBILE : SIDEBAR_W_DESKTOP;
    const SIDEBAR_W = sidebarCollapsed ? 28 : SIDEBAR_W_FULL;
    const visibleChains = soloChainId ? chains.filter(c => c.id === soloChainId) : chains;
    const dayWidth = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));

    // Plage temporelle adaptative selon le zoom : plus on dézoome, plus on couvre.
    const dates = useMemo(() => {
        const spanMonths =
            dayWidth >= 200 ? 2 :
            dayWidth >= 60 ? 4 :
            dayWidth >= 25 ? 8 :
            dayWidth >= 12 ? 14 :
            24;
        const half = Math.floor(spanMonths / 2);
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth() - half, 1);
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + (spanMonths - half), 0);
        const out: Date[] = [];
        for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            out.push(new Date(d));
        }
        return out;
    }, [currentDate, dayWidth]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<{ chaineId: string; dateKey: string } | null>(null);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
    const [scrollState, setScrollState] = useState({ left: 0, width: 0, content: 0 });
    const arrowLeftRef = useRef<HTMLButtonElement>(null);
    const arrowRightRef = useRef<HTMLButtonElement>(null);
    const todayOffsetRef = useRef(0);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        let raf = 0;
        const update = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                setScrollState({ left: el.scrollLeft, width: el.clientWidth, content: el.scrollWidth });
                // Update arrow indicators directly via DOM (no re-render)
                const t = todayOffsetRef.current;
                if (arrowLeftRef.current) {
                    arrowLeftRef.current.style.opacity = t < el.scrollLeft - 10 ? '1' : '0';
                }
                if (arrowRightRef.current) {
                    arrowRightRef.current.style.opacity = t > el.scrollLeft + el.clientWidth + 10 ? '1' : '0';
                }
            });
        };
        update();
        el.addEventListener('scroll', update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => {
            el.removeEventListener('scroll', update);
            ro.disconnect();
            if (raf) cancelAnimationFrame(raf);
        };
    }, [dates, chains.length, dayWidth]);

    // Track cursor during drag (browser native dragOver gives coords)
    useEffect(() => {
        if (!dragging) {
            setCursorPos(null);
            return;
        }
        const onMove = (e: DragEvent) => {
            if (e.clientX || e.clientY) {
                setCursorPos({ x: e.clientX, y: e.clientY });
            }
        };
        document.addEventListener('dragover', onMove);
        return () => document.removeEventListener('dragover', onMove);
    }, [dragging]);

    // Compute drop preview
    const dropPreview = useMemo(() => {
        if (!dragging || !dragOver) return null;
        const ev = events.find(e => e.id === dragging);
        if (!ev) return null;
        const chain = chains.find(c => c.id === dragOver.chaineId);
        if (!chain) return null;
        const model = models.find(m => m.id === ev.modelId);
        const sam = Number(model?.meta_data?.total_temps) || 15;
        const qty = evQty(ev);
        const endIso = calculateEndDate(dragOver.dateKey, qty, sam, chain.efficiency, settings);
        const endYmd = endIso.split('T')[0];
        // simulate move
        const simulated = events.map(x => x.id === dragging
            ? { ...x, chaineId: dragOver.chaineId, dateLancement: dragOver.dateKey, startDate: dragOver.dateKey, dateExport: endIso, estimatedEndDate: endIso }
            : x);
        const cap = getChainDailyCapacity(settings.chainCapacityPerDay, dragOver.chaineId, 1000);
        const maxR = maxDayLoadRatioInSpan(simulated, dragOver.chaineId, cap, dragOver.dateKey, endYmd);
        return {
            startDate: dragOver.dateKey,
            endDate: endYmd,
            chainName: chain.name,
            overload: maxR,
        };
    }, [dragging, dragOver, events, chains, models, settings]);

    const todayOffset = useMemo(() => {
        const today = new Date();
        const first = dates[0];
        if (!first) return 0;
        const origin = new Date(first.getFullYear(), first.getMonth(), first.getDate(), 12, 0, 0, 0);
        const t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
        const diff = (t.getTime() - origin.getTime()) / 86400000;
        return diff * dayWidth + SIDEBAR_W + dayWidth / 2;
    }, [dates, dayWidth]);

    const currentDateOffset = useMemo(() => {
        const first = dates[0];
        if (!first) return 0;
        const origin = new Date(first.getFullYear(), first.getMonth(), first.getDate(), 12, 0, 0, 0);
        const target = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 12, 0, 0, 0);
        const diff = (target.getTime() - origin.getTime()) / 86400000;
        return diff * dayWidth + SIDEBAR_W;
    }, [dates, dayWidth, currentDate]);

    // Sync todayOffset into ref for the scroll handler
    useEffect(() => {
        todayOffsetRef.current = todayOffset;
    }, [todayOffset]);

    // wheel → scroll horizontal · Ctrl+wheel → zoom (centré sur le curseur)
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            // Ctrl/Cmd + wheel = zoom
            if ((e.ctrlKey || e.metaKey) && onZoomChange) {
                e.preventDefault();
                const factor = e.deltaY > 0 ? 0.9 : 1.111;
                const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, dayWidth * factor));
                if (Math.abs(newZoom - dayWidth) > 0.5) {
                    // Garder le point sous le curseur stable
                    const rect = el.getBoundingClientRect();
                    const cursorX = e.clientX - rect.left + el.scrollLeft;
                    const ratio = cursorX / (el.scrollWidth);
                    onZoomChange(newZoom);
                    // Le re-render ajustera scrollLeft via useEffect plus bas
                    requestAnimationFrame(() => {
                        if (el && Number.isFinite(ratio)) {
                            el.scrollLeft = el.scrollWidth * ratio - (e.clientX - rect.left);
                        }
                    });
                }
                return;
            }
            const hasVerticalOverflow = el.scrollHeight > el.clientHeight;
            const shouldScrollHorizontally = e.shiftKey || !hasVerticalOverflow;

            if (shouldScrollHorizontally) {
                if (el.scrollWidth <= el.clientWidth + 2) return;
                if (Math.abs(e.deltaX) >= Math.abs(e.deltaY) && Math.abs(e.deltaX) > 0) return;
                if (e.deltaY === 0) return;
                const maxL = el.scrollWidth - el.clientWidth;
                const next = Math.max(0, Math.min(maxL, el.scrollLeft + e.deltaY));
                if (next === el.scrollLeft) return;
                e.preventDefault();
                el.scrollLeft = next;
            }
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [dayWidth, onZoomChange]);

    // Auto-scroll vers aujourd'hui — au montage
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const t = setTimeout(() => {
            el.scrollLeft = Math.max(0, todayOffset - el.clientWidth / 3);
        }, 50);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Animation : sur clic "Aujourd'hui", scroll smooth + flash sur today line
    useEffect(() => {
        if (!pulseToday) return;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ left: Math.max(0, todayOffset - el.clientWidth / 3), behavior: 'smooth' });
    }, [pulseToday, todayOffset]);

    const isMountedRef = useRef(false);
    const prevMonthYearRef = useRef('');

    // Scroll to selected month when currentDate changes
    useEffect(() => {
        const currentKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
        if (prevMonthYearRef.current === currentKey) {
            return;
        }
        prevMonthYearRef.current = currentKey;

        if (!isMountedRef.current) {
            isMountedRef.current = true;
            return;
        }

        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ left: Math.max(0, currentDateOffset), behavior: 'smooth' });
    }, [currentDate, currentDateOffset]);

    const handleDrop = useCallback((chaineId: string, dateKey: string) => {
        if (!dragging) return;
        onMoveEvent(dragging, chaineId, dateKey);
        setDragging(null);
        setDragOver(null);
    }, [dragging, onMoveEvent]);

    const handleToggleSolo = useCallback((id: string) => {
        onToggleSolo?.(id);
    }, [onToggleSolo]);

    const handleDragStart = useCallback((id: string) => {
        setDragging(id);
    }, []);

    const handleDragOverCell = useCallback((chaineId: string, dateKey: string) => {
        setDragOver({ chaineId, dateKey });
    }, []);

    const handleDragEnd = useCallback(() => {
        setDragging(null);
        setDragOver(null);
    }, []);

    const totalHeight = useMemo(() => {
        let h = 36 + 36; // timeline height
        for (const chain of visibleChains) {
            const chainEvents = events.filter(e => e.chaineId === chain.id);
            const sorted = [...chainEvents].sort((a, b) => {
                const sa = evStartYmd(a);
                const sb = evStartYmd(b);
                if (sa !== sb) return sa.localeCompare(sb);
                return evEndYmd(a).localeCompare(evEndYmd(b));
            });

            const lanes: string[] = [];
            for (const ev of sorted) {
                const start = evStartYmd(ev);
                const end = evEndYmd(ev);
                if (!start || !end) continue;

                let assignedLane = -1;
                for (let i = 0; i < lanes.length; i++) {
                    if (start > lanes[i]) {
                        assignedLane = i;
                        lanes[i] = end;
                        break;
                    }
                }

                if (assignedLane === -1) {
                    lanes.push(end);
                }
            }
            const laneCount = Math.max(1, lanes.length);
            h += rowHeight * laneCount;
        }
        return h + 24;
    }, [visibleChains, events, rowHeight]);

    if (events.length === 0) {
        if (totalEvents === 0) {
            return (
                <EmptyState
                    icon={Layers}
                    title="Aucun ordre planifié"
                    description="Commencez par planifier votre premier ordre de fabrication ou utilisez la planification automatique."
                    action={onAddEvent ? { label: 'Planifier un ordre', onClick: onAddEvent } : undefined}
                />
            );
        }
        return (
            <EmptyState
                icon={SearchX}
                title="Aucun résultat"
                description="Aucun OF ne correspond aux filtres actuels. Essayez d'élargir vos critères."
                action={onResetFilters ? { label: 'Effacer les filtres', onClick: onResetFilters } : undefined}
            />
        );
    }

    return (
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div ref={scrollRef} className="flex-1 overflow-auto bg-white relative">
            <div style={{ minWidth: SIDEBAR_W + dates.length * dayWidth }}>
                {/* Header timeline */}
                <div className="flex">
                    <div className="shrink-0 sticky left-0 z-[31] bg-white border-r border-slate-100 relative" style={{ width: SIDEBAR_W }}>
                        <div className="h-[64px] flex items-center justify-between border-b border-slate-100 overflow-hidden">
                            {!sidebarCollapsed && (
                                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-3 whitespace-nowrap">
                                    Chaînes · {chains.length}
                                </span>
                            )}
                            {/* Toggle button - integrated in header */}
                            <button
                                type="button"
                                onClick={() => setSidebarCollapsed(v => !v)}
                                title={sidebarCollapsed ? 'Afficher les chaînes' : 'Réduire la colonne'}
                                className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-1.5'} text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-all flex items-center justify-center text-[12px] font-bold`}
                            >
                                {sidebarCollapsed ? '›' : '‹'}
                            </button>
                        </div>
                    </div>
                    <div className="flex-1">
                        <GanttTimeline dates={dates} dayWidth={dayWidth} settings={settings} />
                    </div>
                </div>

                {/* Rows */}
                <div className="relative">
                    {visibleChains.map((chain, idx) => (
                        <GanttRow
                            key={chain.id}
                            index={idx}
                            chain={chain}
                            soloChainId={soloChainId ?? null}
                            onToggleSolo={handleToggleSolo}
                            showHeatMap={showHeatMap}
                            sidebarCollapsed={sidebarCollapsed}
                            rowHeight={rowHeight}
                            events={events}
                            models={models}
                            settings={settings}
                            timelineDates={dates}
                            dayWidth={dayWidth}
                            selectedId={selectedId}
                            selectedIds={selectedIds}
                            focusedId={focusedId}
                            dragOverDateKey={dragOver?.chaineId === chain.id ? dragOver.dateKey : null}
                            onSelectEvent={onSelectEvent}
                            onEditEvent={onEditEvent}
                            onContextMenu={onContextMenu}
                            onChainContextMenu={onChainContextMenu}
                            sidebarW={SIDEBAR_W}
                            onDragStart={handleDragStart}
                            onDragOverCell={handleDragOverCell}
                            onDropOnCell={handleDrop}
                            onDragEnd={handleDragEnd}
                            machines={machines}
                        />
                    ))}
                </div>

                <TodayLine offsetPx={todayOffset} height={totalHeight} pulseKey={pulseToday} />
            </div>

            {dropPreview && cursorPos && (
                <DragPreview
                    visible
                    x={cursorPos.x}
                    y={cursorPos.y}
                    startDate={dropPreview.startDate}
                    endDate={dropPreview.endDate}
                    chainName={dropPreview.chainName}
                    overload={dropPreview.overload}
                />
            )}
        </div>

        {/* Flèches indicatrices quand aujourd'hui est hors écran — mise à jour DOM directe, zéro re-render */}
        <button
            ref={arrowLeftRef}
            type="button"
            onClick={() => {
                const el = scrollRef.current;
                if (el) el.scrollTo({ left: Math.max(0, todayOffset - el.clientWidth / 3), behavior: 'smooth' });
            }}
            style={{ opacity: 0, transition: 'opacity 0.15s' }}
            className="absolute top-1/2 -translate-y-1/2 left-2 z-[35] flex items-center gap-1 px-2 py-1 rounded-full bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg hover:bg-red-600 cursor-pointer"
            aria-label="Aujourd'hui est à gauche"
        >
            <span className="text-[14px] rotate-180">›</span>
        </button>
        <button
            ref={arrowRightRef}
            type="button"
            onClick={() => {
                const el = scrollRef.current;
                if (el) el.scrollTo({ left: Math.max(0, todayOffset - el.clientWidth / 3), behavior: 'smooth' });
            }}
            style={{ opacity: 0, transition: 'opacity 0.15s' }}
            className="absolute top-1/2 -translate-y-1/2 right-2 z-[35] flex items-center gap-1 px-2 py-1 rounded-full bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg hover:bg-red-600 cursor-pointer"
            aria-label="Aujourd'hui est à droite"
        >
            <span className="text-[14px]">›</span>
        </button>

        {showMiniMap && !isMobile && (
            <MiniMap
                chains={visibleChains}
                events={events}
                models={models}
                timelineDates={dates}
                dayWidth={dayWidth}
                scrollLeft={scrollState.left}
                viewportWidth={scrollState.width}
                contentWidth={scrollState.content}
                onJumpTo={(left) => {
                    const el = scrollRef.current;
                    if (el) el.scrollTo({ left, behavior: 'smooth' });
                }}
            />
        )}
      </div>
    );
}
