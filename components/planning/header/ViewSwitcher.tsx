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
    'Calendrier': { fr: 'Calendrier', ar: 'ØªÙ‚ÙˆÙŠÙ…', en: 'Calendar', es: 'Calendario', pt: 'CalendÃ¡rio', tr: 'Takvim' },
    'Cartes': { fr: 'Cartes', ar: 'Ø¨Ø·Ø§Ù‚Ø§Øª', en: 'Cards', es: 'Tarjetas', pt: 'CartÃµes', tr: 'Kartlar' },
    'Simulateur': { fr: 'Simulateur', ar: 'Ù…Ø­Ø§ÙƒÙŠ', en: 'Simulator', es: 'Simulador', pt: 'Simulador', tr: 'SimÃ¼latÃ¶r' },
};

export default function ViewSwitcher({ value, onChange }: Props) {
    const { lang } = useLang();
    return (
        <div className="inline-flex rounded-xl border border-slate-200/50 dark:border-dk-border/50 bg-slate-100/50 dark:bg-dk-elevated/50 p-0.5 backdrop-blur-sm shadow-sm dark:shadow-dk-sm">
            {OPTIONS.map(({ id, label }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => onChange(id)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all duration-200 active:scale-95 ${
                        value === id
                            ? 'bg-white dark:bg-slate-700 text-indigo-650 dark:text-dk-accent-text dark:text-indigo-300 shadow-[0_2px_8px_rgba(99,102,241,0.12)] ring-1 ring-slate-200/30 dark:ring-slate-600/40'
                            : 'text-slate-500 dark:text-dk-muted hover:text-slate-800 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-dk-elevated/60'
                    }`}
                >
                    {tx(lang, VIEW_LABEL_TX[label])}
                </button>
            ))}
        </div>
    );
}
