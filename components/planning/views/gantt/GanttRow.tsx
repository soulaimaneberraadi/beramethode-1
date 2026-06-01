import React from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent } from '../../../../types';
import type { PlanningChain } from '../../hooks/usePlanningChains';
import EventBar from './EventBar';
import { evEndYmd, evStartYmd, evQty, evModelName, evProgressPct } from '../../shared/eventAccessors';
import { parsePlanningDateAtNoon, planningLocalDateKey, calculateEndDate, calculateRollingEndDate, isPlanningWorkingDay } from '../../../../utils/planning';
import { getModelColor } from '../../shared/modelColors';

interface Props {
    index?: number;
    chain: PlanningChain;
    events: PlanningEvent[];
    models: ModelData[];
    settings: AppSettings;
    timelineDates: Date[];
    dayWidth: number;
    selectedId: string | null;
    selectedIds?: Set<string>;
    focusedId: string | null;
    dragOverDateKey: string | null;
    soloChainId: string | null;
    onToggleSolo: (chaineId: string) => void;
    showHeatMap?: boolean;
    showCRColors?: boolean;
    rowHeight?: number;
    onSelectEvent: (id: string, modifiers?: { ctrl?: boolean; shift?: boolean }) => void;
    onEditEvent: (id: string) => void;
    onContextMenu: (e: React.MouseEvent, id: string) => void;
    sidebarCollapsed?: boolean;
    sidebarW?: number;
    onDragStart: (id: string) => void;
    onDragOverCell: (chaineId: string, dateKey: string) => void;
    onDropOnCell: (chaineId: string, dateKey: string) => void;
    onDragEnd: () => void;
    onChainContextMenu?: (e: React.MouseEvent, chaineId: string) => void;
    machines: Machine[];
}

function GanttRow({
    index = 0, chain, events, models, settings,
    timelineDates, dayWidth,
    selectedId, selectedIds, focusedId, dragOverDateKey,
    soloChainId, onToggleSolo,
    showHeatMap, showCRColors, rowHeight = 80,
    onSelectEvent, onEditEvent, onContextMenu,
    onDragStart, onDragOverCell, onDropOnCell, onDragEnd,
    onChainContextMenu, sidebarCollapsed = false, sidebarW,
    machines = [],
}: Props) {
    const isSolo = soloChainId === chain.id;
    const cap = chain.capacityPerDay;
    const effPct = Math.round(chain.efficiency * 100);
    const loadColor =
        chain.efficiency >= 0.85 ? 'bg-emerald-400' :
        chain.efficiency >= 0.7 ? 'bg-amber-400' : 'bg-red-400';
    const chainShort = React.useMemo(() => {
        const num = (chain.name || chain.id).replace(/[^0-9]/g, '');
        return num || String(index + 1);
    }, [chain.name, chain.id, index]);

    // Gradient et ombre selon l'efficacité
    const sidebarBg = React.useMemo(() => {
        if (isSolo) {
            return 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)';
        }
        if (chain.efficiency >= 0.85) {
            return 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 60%, #ECFDF5 100%)';
        }
        if (chain.efficiency >= 0.7) {
            return 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 60%, #FFFBEB 100%)';
        }
        return 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 60%, #FEF2F2 100%)';
    }, [isSolo, chain.efficiency]);

    const first = timelineDates[0];
    const origin = first ? new Date(first.getFullYear(), first.getMonth(), first.getDate(), 12, 0, 0, 0) : new Date();

    const chainEvents = React.useMemo(
        () => events.filter(e => e.chaineId === chain.id),
        [events, chain.id]
    );

    // ⚡ Pre-index models by id (used in calculations below)
    const modelsMap = React.useMemo(
        () => new Map(models.map(m => [m.id, m])),
        [models]
    );

    const activeEventToday = React.useMemo(() => {
        const todayStr = new Date().toLocaleDateString('en-CA');
        return chainEvents.find(ev => {
            if (ev.status === 'DONE') return false;
            const start = evStartYmd(ev);
            const model = modelsMap.get(ev.modelId);
            const qty = evQty(ev);
            let end = evEndYmd(ev);
            if (model && qty > 0) {
                const sam = Number(model.meta_data?.total_temps) || 15;
                end = calculateRollingEndDate(ev, sam, chain.efficiency, settings).split('T')[0];
            }
            if (!start || !end) return false;
            return todayStr >= start && todayStr <= end;
        });
    }, [chainEvents, modelsMap, chain.efficiency, settings]);

    const placedEvents = React.useMemo(() => {
        const getEnd = (ev: PlanningEvent) => {
            const model = modelsMap.get(ev.modelId);
            const qty = evQty(ev);
            if (model && qty > 0) {
                const sam = Number(model.meta_data?.total_temps) || 15;
                return calculateRollingEndDate(ev, sam, chain.efficiency, settings).split('T')[0];
            }
            return evEndYmd(ev);
        };

        const sorted = [...chainEvents].sort((a, b) => {
            const sa = evStartYmd(a);
            const sb = evStartYmd(b);
            if (sa !== sb) return sa.localeCompare(sb);
            return getEnd(a).localeCompare(getEnd(b));
        });

        const lanes: string[] = [];
        const result: { event: PlanningEvent; lane: number }[] = [];

        for (const ev of sorted) {
            const start = evStartYmd(ev);
            const end = getEnd(ev);
            if (!start || !end) {
                result.push({ event: ev, lane: 0 });
                continue;
            }

            let assignedLane = -1;
            for (let i = 0; i < lanes.length; i++) {
                if (start > lanes[i]) {
                    assignedLane = i;
                    lanes[i] = end;
                    break;
                }
            }

            if (assignedLane === -1) {
                assignedLane = lanes.length;
                lanes.push(end);
            }

            result.push({ event: ev, lane: assignedLane });
        }

        return {
            placed: result,
            laneCount: Math.max(1, lanes.length),
        };
    }, [chainEvents, modelsMap, chain.efficiency, settings]);

    const computeBarStyle = (ev: PlanningEvent): React.CSSProperties => {
        const start = evStartYmd(ev);
        if (!start) return { display: 'none' };
        const model = modelsMap.get(ev.modelId);
        const qty = evQty(ev);
        const storedEnd = evEndYmd(ev);
        let endIso = storedEnd;
        if (model && qty > 0) {
            const sam = Number(model.meta_data?.total_temps) || 15;
            endIso = calculateRollingEndDate(ev, sam, chain.efficiency, settings).split('T')[0];
        }
        if (!endIso) return { display: 'none' };
        const spanStart = parsePlanningDateAtNoon(start);
        const spanEnd = parsePlanningDateAtNoon(endIso);
        const offsetDays = (spanStart.getTime() - origin.getTime()) / 86400000;
        const durationDays = Math.max(0.7, (spanEnd.getTime() - spanStart.getTime()) / 86400000 + 1);
        
        const lane = placedEvents.placed.find(p => p.event.id === ev.id)?.lane ?? 0;
        const compact = rowHeight < 60;
        const barHeight = compact ? 32 : 56;
        const topOffset = lane * rowHeight + (rowHeight - barHeight) / 2;

        return {
            left: `${Math.max(0, offsetDays * dayWidth) + 4}px`,
            width: `${durationDays * dayWidth - 8}px`,
            top: `${topOffset}px`,
            transform: 'none',
        };
    };

    // ⚡ Pre-compute heatmap loads ONCE per render (was O(cells × events) per cell)
    const heatmapLoads = React.useMemo(() => {
        if (!showHeatMap) return null;
        const map = new Map<string, number>();
        for (const ev of chainEvents) {
            const startRaw = (ev.startDate || ev.dateLancement || '').split('T')[0];
            const endRaw = (ev.estimatedEndDate || ev.dateExport || ev.strictDeadline_DDS || '').split('T')[0];
            if (!startRaw || !endRaw) continue;
            const sT = parsePlanningDateAtNoon(startRaw).getTime();
            const eT = parsePlanningDateAtNoon(endRaw).getTime();
            if (Number.isNaN(sT) || Number.isNaN(eT)) continue;
            const spanDays = Math.max(1, Math.round((eT - sT) / 86400000) + 1);
            const qty = ev.qteTotal || ev.totalQuantity || 0;
            const perDay = qty / spanDays;
            for (let t = sT; t <= eT; t += 86400000) {
                const key = planningLocalDateKey(new Date(t));
                map.set(key, (map.get(key) ?? 0) + perDay);
            }
        }
        return map;
    }, [showHeatMap, chainEvents]);

    const downtimeInfo = React.useMemo(() => {
        return machines.filter(m =>
            m.chainId === chain.id &&
            (m.status === 'PANNE' || m.status === 'MAINT') &&
            m.downtimeStartYmd &&
            m.downtimeEndYmd
        );
    }, [machines, chain.id]);

    return (
        <div
            className="planning-row flex border-b border-slate-50 group/row hover:bg-slate-50/30 transition-colors"
            style={{ animationDelay: `${Math.min(index * 30, 240)}ms` }}
        >

            {/* Sidebar : nom de chaîne — cliquable pour isoler, clic droit pour options */}
            <button
                type="button"
                onClick={() => onToggleSolo(chain.id)}
                onContextMenu={onChainContextMenu ? (e) => { e.preventDefault(); onChainContextMenu(e, chain.id); } : undefined}
                title={isSolo ? 'Désisoler · Clic droit: options' : 'Isoler · Clic droit: options'}
                className={`shrink-0 border-r border-slate-100 sticky left-0 z-[28] flex flex-col justify-center gap-1 text-left overflow-hidden hover:brightness-[1.02] ${
                    sidebarCollapsed ? 'items-center justify-center' : 'px-2 sm:px-4'
                }`}
                style={{
                    minHeight: rowHeight * placedEvents.laneCount,
                    width: sidebarCollapsed ? 28 : (sidebarW ?? 192),
                    minWidth: sidebarCollapsed ? 28 : (sidebarW ?? 192),
                    maxWidth: sidebarCollapsed ? 28 : (sidebarW ?? 192),
                    background: sidebarBg,
                    boxShadow: isSolo
                        ? 'inset 3px 0 0 #6366F1, 2px 0 8px -2px rgba(99,102,241,0.15)'
                        : 'inset 1px 0 0 rgba(0,0,0,0.02)',
                }}
            >
                {sidebarCollapsed ? (
                    <div className="flex flex-col items-center justify-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${loadColor}`} />
                        <span className={`text-[12px] font-black tabular-nums leading-none ${
                            isSolo ? 'text-indigo-600' : 'text-slate-700'
                        }`}>
                            {chainShort}
                        </span>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${loadColor}`} />
                            <span className="text-[12px] font-medium truncate text-slate-900">{chain.name}</span>
                            {isSolo && <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-slate-500">Solo</span>}
                        </div>
                        {rowHeight >= 60 && (
                            <div className="flex flex-col ml-3.5 text-[10px] text-slate-400 leading-normal max-w-[170px] min-w-0">
                                {activeEventToday ? (
                                    <>
                                        <span className="font-semibold text-slate-700 truncate flex items-center gap-1" title={evModelName(activeEventToday, models)}>
                                            <span 
                                                className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" 
                                                style={{ background: getModelColor(activeEventToday.modelId || evModelName(activeEventToday, models)) }}
                                            />
                                            {evModelName(activeEventToday, models)}
                                        </span>
                                        <span className="tabular-nums text-slate-500 font-medium pl-2.5">
                                            Reste {100 - evProgressPct(activeEventToday)}%
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className="font-medium text-slate-400 truncate flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-transparent" />
                                            {chain.capacityPerDay} pcs/j
                                        </span>
                                        <span className="tabular-nums text-slate-400 font-medium pl-2.5">
                                            Rendement {effPct}%
                                        </span>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
            </button>

            {/* Timeline cells */}
            <div className="flex-1 relative" style={{ height: rowHeight * placedEvents.laneCount }}>
                <div className="absolute inset-0 flex">
                    {timelineDates.map((d, i) => {
                        const key = planningLocalDateKey(d);
                        const isWeekend = !isPlanningWorkingDay(d, settings);
                        const isDragOver = focusedId && dragOverDateKey === key;
                        // Heat map : couleur de fond proportionnelle à la charge du jour
                        let heatStyle: React.CSSProperties | undefined;
                        if (showHeatMap && !isWeekend && heatmapLoads && cap > 0) {
                            const r = (heatmapLoads.get(key) ?? 0) / cap;
                            if (r > 0) {
                                // 0 → blanc, 0.5 → vert pâle, 1 → ambre, >1 → rouge
                                let bg: string;
                                if (r >= 1) {
                                    const a = Math.min(0.35, 0.18 + (r - 1) * 0.18);
                                    bg = `rgba(239,68,68,${a.toFixed(3)})`;
                                } else if (r >= 0.7) {
                                    const a = 0.12 + (r - 0.7) * 0.3;
                                    bg = `rgba(245,158,11,${a.toFixed(3)})`;
                                } else {
                                    const a = 0.05 + r * 0.14;
                                    bg = `rgba(16,185,129,${a.toFixed(3)})`;
                                }
                                heatStyle = { background: bg };
                            }
                        }
                        const downMachine = downtimeInfo.find(m => key >= m.downtimeStartYmd! && key <= m.downtimeEndYmd!);
                        const tooltip = downMachine
                            ? `${downMachine.status === 'PANNE' ? 'Panne' : 'Maintenance'}: ${downMachine.name || 'Machine'} (${downMachine.matricule || 'Sans matricule'}) du ${downMachine.downtimeStartYmd} au ${downMachine.downtimeEndYmd}`
                            : undefined;
                        let cellStyle: React.CSSProperties = { width: dayWidth, minWidth: dayWidth, ...heatStyle };
                        if (downMachine) {
                            cellStyle = {
                                ...cellStyle,
                                background: downMachine.status === 'PANNE'
                                    ? 'repeating-linear-gradient(45deg, rgba(239,68,68,0.12), rgba(239,68,68,0.12) 8px, rgba(239,68,68,0.22) 8px, rgba(239,68,68,0.22) 16px)'
                                    : 'repeating-linear-gradient(45deg, rgba(245,158,11,0.12), rgba(245,158,11,0.12) 8px, rgba(245,158,11,0.22) 8px, rgba(245,158,11,0.22) 16px)',
                                cursor: 'not-allowed'
                            };
                        }
                        return (
                            <div
                                key={i}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                    onDragOverCell(chain.id, key);
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    onDropOnCell(chain.id, key);
                                    onDragEnd();
                                }}
                                title={tooltip}
                                className={`border-r border-slate-50 last:border-r-0 transition-colors ${
                                    isWeekend ? 'bg-slate-50/40' : ''
                                } ${isDragOver ? '!bg-slate-100' : ''}`}
                                style={cellStyle}
                            />
                        );
                    })}
                </div>

                 {/* Barres OF */}
                {chainEvents.map(ev => (
                    <EventBar
                        key={ev.id}
                        event={ev}
                        models={models}
                        style={computeBarStyle(ev)}
                        selected={selectedId === ev.id || !!selectedIds?.has(ev.id)}
                        dimmed={!!focusedId && focusedId !== ev.id}
                        compact={rowHeight < 60}
                        showCRColors={showCRColors}
                        onClick={(e) => onSelectEvent(ev.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
                        onDoubleClick={() => onEditEvent(ev.id)}
                        onContextMenu={(e) => onContextMenu(e, ev.id)}
                        onDragStart={(e) => {
                            e.dataTransfer.setData('eventId', ev.id);
                            e.dataTransfer.effectAllowed = 'move';
                            onDragStart(ev.id);
                        }}
                        onDragEnd={onDragEnd}
                    />
                ))}
            </div>
        </div>
    );
}

export default React.memo(GanttRow);
