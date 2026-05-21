import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent } from '../../../../types';
import type { PlanningChain } from '../../hooks/usePlanningChains';
import GanttTimeline from './GanttTimeline';
import GanttRow from './GanttRow';
import TodayLine from './TodayLine';
import DragPreview from './DragPreview';
import MiniMap from './MiniMap';
import { calculateEndDate } from '../../../../utils/planning';
import { getChainDailyCapacity, maxDayLoadRatioInSpan } from '../../../../utils/capacity';
import { evQty } from '../../shared/eventAccessors';
import EmptyState from '../../shared/EmptyState';
import { Layers, SearchX } from 'lucide-react';

import { ZOOM_MIN, ZOOM_MAX } from '../../header/ZoomSwitcher';

const SIDEBAR_W = 192; // w-48

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
    focusedId: string | null;
    onSelectEvent: (id: string) => void;
    onEditEvent: (id: string) => void;
    onContextMenu: (e: React.MouseEvent, id: string) => void;
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
    selectedId, focusedId,
    onSelectEvent, onEditEvent, onContextMenu, onMoveEvent,
    onAddEvent, onResetFilters,
    soloChainId, onToggleSolo,
    showHeatMap, density = 'comfortable', showMiniMap = true,
    machines = [],
}: Props) {
    const rowHeight = density === 'compact' ? 48 : 80;
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

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const update = () => setScrollState({ left: el.scrollLeft, width: el.clientWidth, content: el.scrollWidth });
        update();
        el.addEventListener('scroll', update);
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => {
            el.removeEventListener('scroll', update);
            ro.disconnect();
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
        return diff * dayWidth + SIDEBAR_W;
    }, [dates, dayWidth]);

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
            if (el.scrollWidth <= el.clientWidth + 2) return;
            if (Math.abs(e.deltaX) >= Math.abs(e.deltaY) && Math.abs(e.deltaX) > 0) return;
            if (e.deltaY === 0) return;
            const maxL = el.scrollWidth - el.clientWidth;
            const next = Math.max(0, Math.min(maxL, el.scrollLeft + e.deltaY));
            if (next === el.scrollLeft) return;
            e.preventDefault();
            el.scrollLeft = next;
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [dayWidth, onZoomChange]);

    // Auto-scroll vers aujourd'hui — au montage initial seulement
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const target = Math.max(0, todayOffset - el.clientWidth / 3);
        el.scrollLeft = target;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Animation : sur clic "Aujourd'hui", scroll smooth + flash sur today line
    useEffect(() => {
        if (!pulseToday) return;
        const el = scrollRef.current;
        if (!el) return;
        const target = Math.max(0, todayOffset - el.clientWidth / 3);
        el.scrollTo({ left: target, behavior: 'smooth' });
    }, [pulseToday, todayOffset]);

    const handleDrop = (chaineId: string, dateKey: string) => {
        if (!dragging) return;
        onMoveEvent(dragging, chaineId, dateKey);
        setDragging(null);
        setDragOver(null);
    };

    if (events.length === 0) {
        if (totalEvents === 0) {
            return (
                <EmptyState
                    icon={Layers}
                    title="Aucun ordre planifié"
                    description="Commencez par planifier votre premier ordre de fabrication ou utilisez la jdwala automatique."
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

    const totalHeight = 36 + 36 /* timeline */ + visibleChains.length * rowHeight + 24;

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-auto bg-white relative">
            <div style={{ minWidth: SIDEBAR_W + dates.length * dayWidth }}>
                {/* Header timeline */}
                <div className="flex">
                    <div className="shrink-0 w-48 sticky left-0 z-30 bg-white border-r border-slate-100">
                        <div className="h-[64px] flex items-end px-4 pb-2 border-b border-slate-100">
                            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                                Chaînes · {chains.length}
                            </span>
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
                            onToggleSolo={(id) => onToggleSolo?.(id)}
                            showHeatMap={showHeatMap}
                            rowHeight={rowHeight}
                            events={events}
                            models={models}
                            settings={settings}
                            timelineDates={dates}
                            dayWidth={dayWidth}
                            selectedId={selectedId}
                            focusedId={focusedId}
                            dragOverDateKey={dragOver?.chaineId === chain.id ? dragOver.dateKey : null}
                            onSelectEvent={onSelectEvent}
                            onEditEvent={onEditEvent}
                            onContextMenu={onContextMenu}
                            onDragStart={(id) => setDragging(id)}
                            onDragOverCell={(chaineId, dateKey) => setDragOver({ chaineId, dateKey })}
                            onDropOnCell={handleDrop}
                            onDragEnd={() => { setDragging(null); setDragOver(null); }}
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

        {showMiniMap && (
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
