import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtMonthYear } from '../shared/dateFmt';
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

interface Props {
    currentDate: Date;
    onChange: (d: Date) => void;
    onToday: () => void;
}

export default function DateNavigator({ currentDate, onChange, onToday }: Props) {
    const { lang } = useLang();
    const shift = (delta: number) => {
        const n = new Date(currentDate);
        n.setMonth(n.getMonth() + delta);
        onChange(n);
    };
    return (
        <div className="inline-flex items-center rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-slate-100/50 dark:bg-slate-800/50 p-0.5 backdrop-blur-sm shadow-sm">
            <button
                type="button"
                onClick={() => shift(-1)}
                className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                aria-label={tx(lang,{fr:"Mois précédent",ar:"الشهر السابق",en:"Previous month",es:"Mes anterior",pt:"Mês anterior",tr:"Önceki ay"})}
            >
                <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 px-2 min-w-[6.5rem] text-center capitalize tabular-nums">
                {fmtMonthYear(currentDate)}
            </span>
            <button
                type="button"
                onClick={() => shift(1)}
                className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                aria-label={tx(lang,{fr:"Mois suivant",ar:"الشهر التالي",en:"Next month",es:"Mes siguiente",pt:"Próximo mês",tr:"Sonraki ay"})}
            >
                <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <span className="mx-1 h-3.5 w-px bg-slate-200/65 dark:bg-slate-700/65" aria-hidden />
            <button
                type="button"
                onClick={onToday}
                className="px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-650 dark:text-indigo-300 hover:bg-white dark:hover:bg-slate-700 hover:text-indigo-700 dark:hover:text-indigo-200 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                title={tx(lang,{fr:"Aujourd'hui",ar:"اليوم",en:"Today",es:"Hoy",pt:"Hoje",tr:"Bugün"})}
            >
                {tx(lang,{fr:"Aujourd'hui",ar:"اليوم",en:"Today",es:"Hoy",pt:"Hoje",tr:"Bugün"})}
            </button>
        </div>
    );
}
