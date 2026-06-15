import React from 'react';
import type { AppSettings } from '../../types';
import { isPlanningWorkingDay, planningLocalDateKey } from '../../utils/planning';

export interface MonthGridProps {
    monthAnchor: Date;
    selectedDateStr: string;
    onSelectDate: (yyyyMmDd: string) => void;
    settings: AppSettings;
    minDate?: string;
    maxDate?: string;
    /** S’ajoute aux jours non ouvrés (ex. lot deadline). */
    extraDisabled?: (d: Date) => boolean;
    onPrevMonth: () => void;
    onNextMonth: () => void;
}

const FR_MONTHS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const FR_DOW = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function parseYmd(s: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').split('T')[0]);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0).getTime();
}

export default function MonthGrid({
    monthAnchor,
    selectedDateStr,
    onSelectDate,
    settings,
    minDate,
    maxDate,
    extraDisabled,
    onPrevMonth,
    onNextMonth,
}: MonthGridProps) {
    const y = monthAnchor.getFullYear();
    const mo = monthAnchor.getMonth();
    const first = new Date(y, mo, 1, 12, 0, 0, 0);
    const startPad = first.getDay(); // 0 Sun
    const daysInMonth = new Date(y, mo + 1, 0, 12, 0, 0, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push(new Date(y, mo, d, 12, 0, 0, 0));
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const selKey = (selectedDateStr || '').split('T')[0];
    const todayKey = planningLocalDateKey(new Date());
    const minT = minDate ? parseYmd(minDate) : null;
    const maxT = maxDate ? parseYmd(maxDate) : null;

    const isDisabled = (d: Date) => {
        const t = d.getTime();
        if (minT != null && t < minT) return true;
        if (maxT != null && t > maxT) return true;
        if (!isPlanningWorkingDay(d, settings)) return true;
        if (extraDisabled?.(d)) return true;
        return false;
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
                <button
                    type="button"
                    onClick={onPrevMonth}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    aria-label="Mois précédent"
                >
                    ‹
                </button>
                <div className="text-sm font-black text-slate-800">
                    {FR_MONTHS[mo]} {y}
                </div>
                <button
                    type="button"
                    onClick={onNextMonth}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    aria-label="Mois suivant"
                >
                    ›
                </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {FR_DOW.map(d => (
                    <div key={d} className="py-1">
                        {d}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {cells.map((d, idx) => {
                    if (!d) return <div key={`e-${idx}`} className="h-9" />;
                    const key = planningLocalDateKey(d);
                    const selected = key === selKey;
                    const isToday = key === todayKey;
                    const dis = isDisabled(d);
                    return (
                        <button
                            key={key}
                            type="button"
                            disabled={dis}
                            onClick={() => !dis && onSelectDate(key)}
                            className={[
                                'h-9 rounded-lg text-xs font-bold transition-colors',
                                dis ? 'cursor-not-allowed bg-slate-100 text-slate-300' : 'text-slate-800 hover:bg-slate-50',
                                selected && !dis ? 'bg-emerald-700 text-white hover:bg-emerald-800' : '',
                                !selected && !dis && isToday ? 'ring-2 ring-emerald-700 ring-offset-1' : '',
                            ].filter(Boolean).join(' ')}
                        >
                            {d.getDate()}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
