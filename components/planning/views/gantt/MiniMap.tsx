import React, { useMemo, useRef } from 'react';
import type { PlanningEvent, ModelData } from '../../../../types';
import { evClientName, evEndYmd, evStartYmd } from '../../shared/eventAccessors';
import { getClientColor } from '../../shared/clientColors';
import { parsePlanningDateAtNoon, planningLocalDateKey } from '../../../../utils/planning';
import type { PlanningChain } from '../../hooks/usePlanningChains';

interface Props {
    chains: PlanningChain[];
    events: PlanningEvent[];
    models: ModelData[];
    timelineDates: Date[];
    dayWidth: number;
    scrollLeft: number;
    viewportWidth: number;
    contentWidth: number;
    onJumpTo: (scrollLeft: number) => void;
}

/** Mini-map en bas du Gantt — vue d'oiseau du planning. */
export default function MiniMap({
    chains, events, models, timelineDates, dayWidth,
    scrollLeft, viewportWidth, contentWidth, onJumpTo,
}: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const MAP_HEIGHT = 36;

    const first = timelineDates[0];
    const last = timelineDates[timelineDates.length - 1];
    const totalMs = (last && first) ? (last.getTime() - first.getTime()) : 1;

    // Position relative de la fenêtre visible (sur 100%)
    const viewportRatio = contentWidth > 0 ? viewportWidth / contentWidth : 1;
    const scrollRatio = contentWidth > 0 ? scrollLeft / contentWidth : 0;

    const todayKey = planningLocalDateKey(new Date());
    const todayPos = useMemo(() => {
        for (let i = 0; i < timelineDates.length; i++) {
            if (planningLocalDateKey(timelineDates[i]) === todayKey) {
                return i / timelineDates.length;
            }
        }
        return -1;
    }, [timelineDates, todayKey]);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = x / rect.width;
        // centrer la vue sur ce point
        onJumpTo(Math.max(0, ratio * contentWidth - viewportWidth / 2));
    };

    return (
        <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-2">
            <div className="flex items-center gap-3">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider shrink-0">
                    Vue d'ensemble
                </span>
                <div
                    ref={ref}
                    onClick={handleClick}
                    className="relative flex-1 bg-slate-50 rounded-md cursor-pointer overflow-hidden"
                    style={{ height: MAP_HEIGHT }}
                    title="Cliquez pour naviguer"
                >
                    {/* Lignes de chaînes en arrière-plan */}
                    {chains.map((_, i) => (
                        <div
                            key={i}
                            className="absolute left-0 right-0 border-b border-slate-100/50"
                            style={{ top: ((i + 1) / chains.length) * MAP_HEIGHT }}
                        />
                    ))}

                    {/* Barres OF — chacune positionnée selon son timestamp */}
                    {events.map(ev => {
                        const start = evStartYmd(ev);
                        const end = evEndYmd(ev) || start;
                        if (!start || !first || !last) return null;
                        const s = parsePlanningDateAtNoon(start).getTime();
                        const e = parsePlanningDateAtNoon(end).getTime();
                        if (e < first.getTime() || s > last.getTime()) return null;
                        const leftRatio = Math.max(0, (s - first.getTime()) / totalMs);
                        const widthRatio = Math.max(0.005, (e - s) / totalMs);
                        const chainIdx = chains.findIndex(c => c.id === ev.chaineId);
                        if (chainIdx < 0) return null;
                        const color = ev.color || getClientColor(evClientName(ev, models));
                        const topRatio = chainIdx / chains.length;
                        return (
                            <div
                                key={ev.id}
                                className="absolute rounded-[1px]"
                                style={{
                                    left: `${leftRatio * 100}%`,
                                    width: `${widthRatio * 100}%`,
                                    top: `${topRatio * 100}%`,
                                    height: `${(1 / chains.length) * MAP_HEIGHT - 1}px`,
                                    background: color,
                                    opacity: 0.7,
                                }}
                            />
                        );
                    })}

                    {/* Ligne aujourd'hui */}
                    {todayPos >= 0 && (
                        <div
                            className="absolute top-0 bottom-0 w-px bg-orange-500"
                            style={{ left: `${todayPos * 100}%` }}
                        />
                    )}

                    {/* Viewport indicator */}
                    <div
                        className="absolute top-0 bottom-0 border-2 border-slate-900/70 rounded-md bg-white/20 pointer-events-none"
                        style={{
                            left: `${scrollRatio * 100}%`,
                            width: `${Math.min(100, viewportRatio * 100)}%`,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
