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
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
            <button
                type="button"
                onClick={() => shift(-1)}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                aria-label="Mois précédent"
            >
                <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-semibold text-slate-800 px-2 min-w-[6rem] text-center capitalize tabular-nums">
                {fmtMonthYear(currentDate)}
            </span>
            <button
                type="button"
                onClick={() => shift(1)}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                aria-label="Mois suivant"
            >
                <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <span className="mx-0.5 h-3.5 w-px bg-slate-200" aria-hidden />
            <button
                type="button"
                onClick={onToday}
                className="px-1.5 py-1 rounded-md text-[10px] font-semibold text-[#2149C1] hover:bg-[#2149C1]/5 transition-colors"
                title="Aujourd'hui"
            >
                Aujourd'hui
            </button>
        </div>
    );
}
