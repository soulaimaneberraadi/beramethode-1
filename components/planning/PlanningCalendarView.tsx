import React, { useState, useMemo } from 'react';
import { PlanningEvent, ModelData } from '../../types';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

interface PlanningCalendarViewProps {
    planningEvents: PlanningEvent[];
    models: ModelData[];
    chaines: { id: string; name: string }[];
    statusConfig: Record<string, { label: string; bar: string; bg: string; border: string; dot: string }>;
    onSelectedEvent: (ev: PlanningEvent) => void;
}

export default function PlanningCalendarView({
    planningEvents,
    models,
    chaines,
    statusConfig,
    onSelectedEvent,
}: PlanningCalendarViewProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const daysInMonth = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const date = new Date(year, month, 1);
        const days: Date[] = [];
        
        // Add padding days for the first row
        const firstDay = date.getDay(); // 0 is Sunday
        const paddingDays = firstDay === 0 ? 6 : firstDay - 1; // Assuming Monday is 1st day
        
        const prevMonth = new Date(year, month, 0);
        for (let i = paddingDays; i > 0; i--) {
            days.push(new Date(year, month - 1, prevMonth.getDate() - i + 1));
        }
        
        // Add all days of current month
        while (date.getMonth() === month) {
            days.push(new Date(date));
            date.setDate(date.getDate() + 1);
        }
        
        // Add padding days for the last row
        const paddingEnd = 42 - days.length; // 6 rows * 7 days
        const nextMonth = new Date(year, month + 1, 1);
        for (let i = 0; i < paddingEnd; i++) {
            days.push(new Date(year, month + 1, nextMonth.getDate() + i));
        }

        return days;
    }, [currentMonth]);

    const isAtRisk = (ev: PlanningEvent) => {
        if (ev.status === 'BLOCKED_STOCK') return true;
        const end = ev.estimatedEndDate || ev.dateExport;
        const dds = ev.strictDeadline_DDS;
        return !!(end && dds && new Date(end) > new Date(dds));
    };

    const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    const today = () => setCurrentMonth(new Date());

    return (
        <div className="flex-1 flex flex-col bg-gray-950 p-4">
            
            {/* Header controls inside Calendar view */}
            <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-xl font-black text-white capitalize">
                    {currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex items-center gap-2">
                    <button onClick={today} className="px-3 py-1.5 bg-gray-900 border border-gray-700 text-gray-300 text-sm font-bold rounded hover:bg-gray-800">
                        Aujourd'hui
                    </button>
                    <div className="flex rounded border border-gray-700 overflow-hidden">
                        <button onClick={prevMonth} className="p-1.5 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white border-r border-gray-700">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button onClick={nextMonth} className="p-1.5 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 border border-gray-800 rounded-xl overflow-hidden flex flex-col bg-gray-900">
                {/* Days header */}
                <div className="grid grid-cols-7 border-b border-gray-800 bg-gray-950 shrink-0">
                    {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map(day => (
                        <div key={day} className="py-2 text-center text-xs font-bold text-gray-500 uppercase tracking-widest border-r border-gray-800 last:border-0">
                            {day}
                        </div>
                    ))}
                </div>
                
                {/* Days */}
                <div className="flex-1 grid grid-cols-7 grid-rows-6">
                    {daysInMonth.map((date, idx) => {
                        const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
                        const isToday = date.toDateString() === new Date().toDateString();
                        const dateStr = date.toISOString().split('T')[0];

                        // Get events that overlap with this date
                        const dayEvents = planningEvents.filter(ev => {
                            const start = (ev.startDate || ev.dateLancement)?.split('T')[0];
                            const end = (ev.estimatedEndDate || ev.dateExport)?.split('T')[0];
                            if (!start || !end) return false;
                            return dateStr >= start && dateStr <= end;
                        });

                        return (
                            <div 
                                key={idx} 
                                className={`border-r border-b border-gray-800 last:border-r-0 p-1.5 flex flex-col ${!isCurrentMonth ? 'bg-gray-950/50 opacity-50' : ''}`}
                            >
                                <div className={`text-right mb-1`}>
                                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>
                                        {date.getDate()}
                                    </span>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-1 hide-scrollbar">
                                    {dayEvents.map(ev => {
                                        const cfg = statusConfig[ev.status] || statusConfig['ON_TRACK'];
                                        const name = ev.modelName || models.find(m => m.id === ev.modelId)?.meta_data.nom_modele || 'Ordre';
                                        const chain = chaines.find(c => c.id === ev.chaineId)?.name || ev.chaineId;
                                        const risk = isAtRisk(ev);
                                        const isStart = (ev.startDate || ev.dateLancement)?.split('T')[0] === dateStr;
                                        const isEnd = (ev.estimatedEndDate || ev.dateExport)?.split('T')[0] === dateStr;

                                        return (
                                            <div 
                                                key={ev.id}
                                                onClick={() => onSelectedEvent(ev)}
                                                className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer truncate font-bold flex items-center justify-between ${cfg.bg} border-l-2 ${cfg.border} text-white/90 hover:brightness-110`}
                                                title={`${name} - ${chain}`}
                                            >
                                                <span className="truncate">
                                                    {isStart && '▶️ '}{isEnd && '⏹️ '}{name}
                                                </span>
                                                {risk && <AlertTriangle className="w-2.5 h-2.5 text-red-500 shrink-0 ml-1" />}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <style dangerouslySetInnerHTML={{__html: `
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
}
