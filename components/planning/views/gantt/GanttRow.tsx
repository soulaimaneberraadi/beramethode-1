import React from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent } from '../../../../types';
import type { PlanningChain } from '../../hooks/usePlanningChains';
import EventBar from './EventBar';
import { evEndYmd, evStartYmd, evQty } from '../../shared/eventAccessors';
import { parsePlanningDateAtNoon, planningLocalDateKey, calculateEndDate, isPlanningWorkingDay } from '../../../../utils/planning';
import { dayLoadRatio } from '../../../../utils/capacity';

interface Props {
    index?: number;
    chain: PlanningChain;
    events: PlanningEvent[];
    models: ModelData[];
    settings: AppSettings;
    timelineDates: Date[];
    dayWidth: number;
    selectedId: string | null;
    focusedId: string | null;
    dragOverDateKey: string | null;
    soloChainId: string | null;
    onToggleSolo: (chaineId: string) => void;
    showHeatMap?: boolean;
    rowHeight?: number;
    onSelectEvent: (id: string) => void;
    onEditEvent: (id: string) => void;
    onContextMenu: (e: React.MouseEvent, id: string) => void;
    onDragStart: (id: string) => void;
    onDragOverCell: (chaineId: string, dateKey: string) => void;
    onDropOnCell: (chaineId: string, dateKey: string) => void;
    onDragEnd: () => void;
    machines: Machine[];
}

export default function GanttRow({
    index = 0, chain, events, models, settings,
    timelineDates, dayWidth,
    selectedId, focusedId, dragOverDateKey,
    soloChainId, onToggleSolo,
    showHeatMap, rowHeight = 80,
    onSelectEvent, onEditEvent, onContextMenu,
    onDragStart, onDragOverCell, onDropOnCell, onDragEnd,
    machines = [],
}: Props) {
    const isSolo = soloChainId === chain.id;
    const cap = chain.capacityPerDay;
    const effPct = Math.round(chain.efficiency * 100);
    const loadColor =
        chain.efficiency >= 0.85 ? 'bg-emerald-400' :
        chain.efficiency >= 0.7 ? 'bg-amber-400' : 'bg-red-400';

    const first = timelineDates[0];
    const origin = first ? new Date(first.getFullYear(), first.getMonth(), first.getDate(), 12, 0, 0, 0) : new Date();

    const computeBarStyle = (ev: PlanningEvent): React.CSSProperties => {
        const start = evStartYmd(ev);
        if (!start) return { display: 'none' };
        const model = models.find(m => m.id === ev.modelId);
        const qty = evQty(ev);
        const storedEnd = evEndYmd(ev);
        let endIso = storedEnd;
        if (model && qty > 0) {
            const sam = Number(model.meta_data?.total_temps) || 15;
            endIso = calculateEndDate(start, qty, sam, chain.efficiency, settings).split('T')[0];
        }
        if (!endIso) return { display: 'none' };
        const spanStart = parsePlanningDateAtNoon(start);
        const spanEnd = parsePlanningDateAtNoon(endIso);
        const offsetDays = (spanStart.getTime() - origin.getTime()) / 86400000;
        const durationDays = Math.max(0.7, (spanEnd.getTime() - spanStart.getTime()) / 86400000 + 1);
        return {
            left: `${Math.max(0, offsetDays * dayWidth) + 4}px`,
            width: `${durationDays * dayWidth - 8}px`,
        };
    };

    const chainEvents = events.filter(e => e.chaineId === chain.id);

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

            {/* Sidebar : nom de chaîne — cliquable pour isoler */}
            <button
                type="button"
                onClick={() => onToggleSolo(chain.id)}
                title={isSolo ? 'Désisoler' : 'Isoler cette chaîne'}
                className={`shrink-0 w-48 px-4 border-r border-slate-100 sticky left-0 z-10 flex flex-col justify-center gap-1 text-left transition-colors ${
                    isSolo ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/60'
                }`}
                style={{ minHeight: rowHeight }}
            >
                <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${loadColor}`} />
                    <span className="text-[12px] font-medium truncate text-slate-900">{chain.name}</span>
                    {isSolo && <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-slate-500">Solo</span>}
                </div>
                {rowHeight >= 60 && (
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 ml-3.5">
                        <span className="tabular-nums">{chain.capacityPerDay} pcs/j</span>
                        <span className="tabular-nums">η {effPct}%</span>
                    </div>
                )}
            </button>

            {/* Timeline cells */}
            <div className="flex-1 relative" style={{ height: rowHeight }}>
                <div className="absolute inset-0 flex">
                    {timelineDates.map((d, i) => {
                        const key = planningLocalDateKey(d);
                        const isWeekend = !isPlanningWorkingDay(d, settings);
                        const isDragOver = focusedId && dragOverDateKey === key;
                        // Heat map : couleur de fond proportionnelle à la charge du jour
                        let heatStyle: React.CSSProperties | undefined;
                        if (showHeatMap && !isWeekend) {
                            const r = dayLoadRatio(key, events, chain.id, cap);
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
                        selected={selectedId === ev.id}
                        dimmed={!!focusedId && focusedId !== ev.id}
                        compact={rowHeight < 60}
                        onClick={() => onSelectEvent(ev.id)}
                        onDoubleClick={() => onEditEvent(ev.id)}
                        onContextMenu={(e) => onContextMenu(e, ev.id)}
                        onDragStart={(e) => {
                            e.dataTransfer.setData('eventId', ev.id);
                            e.dataTransfer.effectAllowed = 'move';
                            onDragStart(ev.id);
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
