import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtMonthYear } from '../shared/dateFmt';

interface Props {
    currentDate: Date;
    onChange: (d: Date) => void;
    onToday: () => void;
}

export default function DateNavigator({ currentDate, onChange, onToday }: Props) {
    const shift = (delta: number) => {
        const n = new Date(currentDate);
        n.setMonth(n.getMonth() + delta);
        onChange(n);
    };
    return (
        <div className="inline-flex items-center rounded-xl border border-slate-200/50 bg-slate-100/50 p-0.5 backdrop-blur-sm shadow-sm">
            <button
                type="button"
                onClick={() => shift(-1)}
                className="p-1 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                aria-label="Mois précédent"
            >
                <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-bold text-slate-700 px-2 min-w-[6.5rem] text-center capitalize tabular-nums">
                {fmtMonthYear(currentDate)}
            </span>
            <button
                type="button"
                onClick={() => shift(1)}
                className="p-1 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                aria-label="Mois suivant"
            >
                <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <span className="mx-1 h-3.5 w-px bg-slate-200/65" aria-hidden />
            <button
                type="button"
                onClick={onToday}
                className="px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-650 hover:bg-white hover:text-indigo-700 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                title="Aujourd'hui"
            >
                Aujourd'hui
            </button>
        </div>
    );
}
