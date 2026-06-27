import React, { useState } from 'react';
import type { AppSettings } from '../../types';
import MonthGrid from './MonthGrid';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';

export interface DateRangePickerProps {
    from: string;
    to: string;
    onChange: (range: { from: string; to: string }) => void;
    settings: AppSettings;
    className?: string;
}

/**
 * Deux mois côte à côte + sélection from/to (YYYY-MM-DD).
 * À brancher sur les vues capacité / sous-traitance (phases 3 & 7).
 */
export default function DateRangePicker({ from, to, onChange, settings, className = '' }: DateRangePickerProps) {
    const { lang } = useLang();
    const [leftMonth, setLeftMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12, 0, 0, 0));
    const rightMonth = new Date(leftMonth.getFullYear(), leftMonth.getMonth() + 1, 1, 12, 0, 0, 0);
    const [picking, setPicking] = useState<'from' | 'to'>('from');

    const apply = (ymd: string) => {
        if (picking === 'from') {
            onChange({ from: ymd, to: to < ymd ? ymd : to });
            setPicking('to');
        } else {
            onChange({ from: from > ymd ? ymd : from, to: ymd });
        }
    };

    return (
        <div className={`flex flex-col gap-3 ${className}`}>
            <div className="flex gap-2 text-xs font-bold">
                <button
                    type="button"
                    className={`rounded-lg px-3 py-1 ${picking === 'from' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}
                    onClick={() => setPicking('from')}
                >
                    Début {from || '—'}
                </button>
                <button
                    type="button"
                    className={`rounded-lg px-3 py-1 ${picking === 'to' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}
                    onClick={() => setPicking('to')}
                >
                    Fin {to || '—'}
                </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <MonthGrid
                    monthAnchor={leftMonth}
                    selectedDateStr={picking === 'from' ? from : to}
                    onSelectDate={apply}
                    settings={settings}
                    onPrevMonth={() => setLeftMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1, 12, 0, 0, 0))}
                    onNextMonth={() => setLeftMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1, 12, 0, 0, 0))}
                />
                <MonthGrid
                    monthAnchor={rightMonth}
                    selectedDateStr={picking === 'from' ? from : to}
                    onSelectDate={apply}
                    settings={settings}
                    onPrevMonth={() => setLeftMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1, 12, 0, 0, 0))}
                    onNextMonth={() => setLeftMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1, 12, 0, 0, 0))}
                />
            </div>
        </div>
    );
}
