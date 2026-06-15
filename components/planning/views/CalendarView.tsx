import React, { useMemo } from 'react';
import type { ModelData, PlanningEvent } from '../../../types';
import { evClientName, evEndYmd, evModelName, evStartYmd } from '../shared/eventAccessors';
import { getClientColor } from '../shared/clientColors';
import { getModelColor } from '../shared/modelColors';
import { parsePlanningDateAtNoon, planningLocalDateKey } from '../../../utils/planning';
import { fmtMonthYear } from '../shared/dateFmt';

interface Props {
    events: PlanningEvent[];
    models: ModelData[];
    currentDate: Date;
    pulseToday?: number;
    onSelectEvent: (id: string) => void;
}

const WEEK_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const WEEK_DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getMonthMatrix(d: Date): Date[] {
    const year = d.getFullYear();
    const month = d.getMonth();
    const first = new Date(year, month, 1);
    const dayOfWeek = first.getDay() === 0 ? 7 : first.getDay(); // Mon=1..Sun=7
    const start = new Date(year, month, 1 - (dayOfWeek - 1));
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
        cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    return cells;
}

export default function CalendarView({ events, models, currentDate, pulseToday, onSelectEvent }: Props) {
    const cells = useMemo(() => getMonthMatrix(currentDate), [currentDate]);
    const todayKey = planningLocalDateKey(new Date());
    const [pulsing, setPulsing] = React.useState(false);
    React.useEffect(() => {
        if (!pulseToday) return;
        setPulsing(true);
        const t = setTimeout(() => setPulsing(false), 2200);
        return () => clearTimeout(t);
    }, [pulseToday]);

    // bucket events par jour (présent dans la plage)
    const byDay = useMemo(() => {
        const map = new Map<string, PlanningEvent[]>();
        for (const ev of events) {
            const start = evStartYmd(ev);
            const end = evEndYmd(ev) || start;
            if (!start) continue;
            const s = parsePlanningDateAtNoon(start).getTime();
            const e = parsePlanningDateAtNoon(end).getTime();
            if (Number.isNaN(s) || Number.isNaN(e) || e < s) continue;
            // Cap at 1000 days to avoid freeze on massive date intervals
            const limit = Math.min(e, s + 1000 * 86400000);
            for (let t = s; t <= limit; t += 86400000) {
                const k = planningLocalDateKey(new Date(t));
                if (!map.has(k)) map.set(k, []);
                map.get(k)!.push(ev);
            }
        }
        return map;
    }, [events]);

    return (
        <div className="bg-white p-3 sm:p-6 min-h-full">
            <style>{`
                @keyframes planning-today-cell-pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249,115,22,0.7); }
                    50% { transform: scale(1.18); box-shadow: 0 0 0 14px rgba(249,115,22,0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249,115,22,0); }
                }
                .planning-today-cell-pulse {
                    animation: planning-today-cell-pulse 1.1s ease-out 2;
                }
            `}</style>
            {/* Title */}
            <div className="mb-4">
                <h2 className="text-[15px] sm:text-[18px] font-semibold text-slate-900 tracking-tight capitalize">
                    {fmtMonthYear(currentDate)}
                </h2>
            </div>

            {/* Week header */}
            <div className="grid grid-cols-7 mb-2">
                {WEEK_DAYS.map((d, i) => (
                    <div key={d} className="text-[9px] sm:text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 sm:px-2 py-1 text-center sm:text-left">
                        <span className="sm:hidden">{WEEK_DAYS_SHORT[i]}</span>
                        <span className="hidden sm:inline">{d}</span>
                    </div>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 grid-rows-6 border border-slate-100 rounded-lg overflow-hidden">
                {cells.map((d, i) => {
                    const key = planningLocalDateKey(d);
                    const isToday = key === todayKey;
                    const isCurrentMonth = d.getMonth() === currentDate.getMonth();
                    const dayEvents = byDay.get(key) || [];

                    return (
                        <div
                            key={i}
                            className={`relative min-h-[64px] sm:min-h-[110px] p-1 sm:p-2 border-r border-b border-slate-100 last:border-r-0 [&:nth-child(7n)]:border-r-0 ${
                                isCurrentMonth ? 'bg-white' : 'bg-slate-50/40'
                            } ${i >= 35 ? 'border-b-0' : ''}`}
                        >
                            <div className={`text-[12px] mb-1 tabular-nums ${
                                isToday
                                    ? `inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-500 text-white font-bold ${pulsing ? 'planning-today-cell-pulse' : ''}`
                                    : isCurrentMonth ? 'text-slate-700 font-medium' :
                                    'text-slate-300'
                            }`}>
                                {d.getDate()}
                            </div>

                            <div className="space-y-1">
                                {dayEvents.slice(0, 3).map(ev => {
                                    const client = evClientName(ev, models);
                                    const modelName = evModelName(ev, models);
                                    const modelKey = ev.modelId || modelName || client;
                                    const accent = (ev.modelId || modelName) ? getModelColor(ev.modelId || modelName) : (ev.color || getModelColor(modelKey));
                                    return (
                                        <button
                                            key={ev.id}
                                            type="button"
                                            onClick={() => onSelectEvent(ev.id)}
                                            className={`w-full px-1.5 py-0.5 rounded text-[10px] text-left truncate transition-colors hover:bg-slate-100 flex items-center gap-1.5 ${
                                                ev.isSubcontracted ? 'border border-dashed border-indigo-400 bg-indigo-50/20' : ''
                                            }`}
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />
                                            <span className="truncate text-slate-700">{client}</span>
                                            {ev.isSubcontracted && (
                                                <span className="text-[7px] font-semibold bg-indigo-100 text-indigo-700 px-1 rounded shrink-0">S-T</span>
                                            )}
                                        </button>
                                    );
                                })}
                                {dayEvents.length > 3 && (
                                    <div className="text-[10px] text-slate-400 px-1.5">
                                        +{dayEvents.length - 3} de plus
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
