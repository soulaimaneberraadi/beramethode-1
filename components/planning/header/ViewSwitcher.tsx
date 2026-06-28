import React from 'react';
import { tx } from '../../../lib/i18n';
import type { TxMap } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

export type ViewKind = 'gantt' | 'calendar' | 'cards' | 'simulation';

interface Props {
    value: ViewKind;
    onChange: (v: ViewKind) => void;
}

const OPTIONS: { id: ViewKind; label: string }[] = [
    { id: 'gantt', label: 'Gantt' },
    { id: 'calendar', label: 'Calendrier' },
    { id: 'cards', label: 'Cartes' },
    { id: 'simulation', label: 'Simulateur' },
];

const VIEW_LABEL_TX: Record<string, TxMap> = {
    'Gantt': { fr: 'Gantt', ar: 'Gantt', en: 'Gantt', es: 'Gantt', pt: 'Gantt', tr: 'Gantt' },
    'Calendrier': { fr: 'Calendrier', ar: 'تقويم', en: 'Calendar', es: 'Calendario', pt: 'Calendário', tr: 'Takvim' },
    'Cartes': { fr: 'Cartes', ar: 'بطاقات', en: 'Cards', es: 'Tarjetas', pt: 'Cartões', tr: 'Kartlar' },
    'Simulateur': { fr: 'Simulateur', ar: 'محاكي', en: 'Simulator', es: 'Simulador', pt: 'Simulador', tr: 'Simülatör' },
};

export default function ViewSwitcher({ value, onChange }: Props) {
    const { lang } = useLang();
    return (
        <div className="inline-flex rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-slate-100/50 dark:bg-slate-800/50 p-0.5 backdrop-blur-sm shadow-sm">
            {OPTIONS.map(({ id, label }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => onChange(id)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all duration-200 active:scale-95 ${
                        value === id
                            ? 'bg-white dark:bg-slate-700 text-indigo-650 dark:text-indigo-300 shadow-[0_2px_8px_rgba(99,102,241,0.12)] ring-1 ring-slate-200/30 dark:ring-slate-600/40'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-white/40 dark:hover:bg-slate-700/40'
                    }`}
                >
                    {tx(lang, VIEW_LABEL_TX[label])}
                </button>
            ))}
        </div>
    );
}
