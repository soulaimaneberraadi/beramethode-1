import React from 'react';
import { planningLocalDateKey, isPlanningWorkingDay } from '../../../../utils/planning';
import type { AppSettings } from '../../../../types';

interface Props {
    dates: Date[];
    dayWidth: number;
    settings: AppSettings;
}

const FR_DAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const FR_MONTHS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const FR_MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

export default function GanttTimeline({ dates, dayWidth, settings }: Props) {
    const todayKey = planningLocalDateKey(new Date());

    // Régimes selon le zoom (largeur de jour en pixels)
    const showHours = dayWidth >= 400;         // chaque jour assez large pour afficher les heures
    const showDays = dayWidth >= 18;           // jour individuel visible
    const showMonths = true;                   // toujours
    const showYears = dayWidth < 20;           // année en bande supérieure quand on dézoome

    // Regrouper par mois pour la bande supérieure
    const months: { label: string; span: number; year: number; month: number }[] = [];
    for (const d of dates) {
        const useShort = dayWidth < 80;
        const label = `${useShort ? FR_MONTHS_SHORT[d.getMonth()] : FR_MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
        const last = months[months.length - 1];
        if (last && last.label === label) last.span++;
        else months.push({ label, span: 1, year: d.getFullYear(), month: d.getMonth() });
    }

    // Regrouper par année pour zoom très éloigné
    const years: { label: string; span: number }[] = [];
    for (const d of dates) {
        const label = String(d.getFullYear());
        const last = years[years.length - 1];
        if (last && last.label === label) last.span++;
        else years.push({ label, span: 1 });
    }

    return (
        <div className="sticky top-0 z-[29] bg-white">
            {/* Bande année (uniquement si très dézoomé) */}
            {showYears && (
                <div className="flex h-5 border-b border-slate-100">
                    {years.map((y, i) => (
                        <div
                            key={i}
                            className="flex items-center px-2 text-[10px] font-semibold text-slate-700 border-r border-slate-100 last:border-r-0"
                            style={{ width: y.span * dayWidth }}
                        >
                            {y.label}
                        </div>
                    ))}
                </div>
            )}

            {/* Bande mois */}
            {showMonths && (
                <div className="flex h-7 border-b border-slate-100">
                    {months.map((m, i) => (
                        <div
                            key={i}
                            className="flex items-center px-3 text-[11px] font-medium text-slate-700 border-r border-slate-100 last:border-r-0"
                            style={{ width: m.span * dayWidth }}
                        >
                            <span className="capitalize truncate">{m.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Bande jours (uniquement si zoom suffisant) */}
            {showDays && (
                <div className="flex h-9 border-b border-slate-100">
                    {dates.map((d, i) => {
                        const key = planningLocalDateKey(d);
                        const isToday = key === todayKey;
                        const isWeekend = !isPlanningWorkingDay(d, settings);
                        const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
                        const isFirstOfWeek = dow === 0;
                        // Densité adaptative : à zoom moyen, on n'affiche que les lundis ou jours pairs
                        const compact = dayWidth < 35;
                        if (compact && !isFirstOfWeek && !isToday) {
                            return (
                                <div
                                    key={i}
                                    className={`border-r border-slate-50 last:border-r-0 ${isWeekend ? 'bg-slate-50/40' : ''}`}
                                    style={{ width: dayWidth, minWidth: dayWidth }}
                                />
                            );
                        }
                        return (
                            <div
                                key={i}
                                className={`relative flex flex-col items-center justify-center border-r border-slate-50 last:border-r-0 transition-colors ${
                                    isWeekend ? 'bg-slate-50/40' : ''
                                }`}
                                style={{ width: dayWidth, minWidth: dayWidth }}
                            >
                                {dayWidth >= 50 && (
                                    <span className={`text-[9px] uppercase tracking-wider font-medium ${
                                        isToday ? 'text-slate-900' : 'text-slate-400'
                                    }`}>
                                        {FR_DAYS[dow]}
                                    </span>
                                )}
                                <span className={`text-[12px] tabular-nums font-medium ${
                                    isToday ? 'text-slate-900 font-bold' : isWeekend ? 'text-slate-400' : 'text-slate-700'
                                }`}>
                                    {d.getDate()}
                                </span>
                                {isToday && (
                                    <span className="absolute -bottom-px left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500" />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Bande heures (uniquement si très zoomé) */}
            {showHours && (
                <div className="flex h-5 border-b border-slate-100">
                    {dates.map((d, i) => {
                        const isToday = planningLocalDateKey(d) === todayKey;
                        return (
                            <div
                                key={i}
                                className="flex items-center border-r border-slate-50 last:border-r-0"
                                style={{ width: dayWidth, minWidth: dayWidth }}
                            >
                                {/* 4 graduations 8h / 12h / 14h / 18h */}
                                {['8h', '12h', '14h', '18h'].map((h, k) => (
                                    <span
                                        key={k}
                                        className={`flex-1 text-center text-[9px] font-medium tabular-nums ${
                                            isToday ? 'text-slate-700' : 'text-slate-400'
                                        }`}
                                    >
                                        {h}
                                    </span>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
