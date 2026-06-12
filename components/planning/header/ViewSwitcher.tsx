import React from 'react';

export type ViewKind = 'gantt' | 'calendar' | 'cards';

interface Props {
    value: ViewKind;
    onChange: (v: ViewKind) => void;
}

const OPTIONS: { id: ViewKind; label: string }[] = [
    { id: 'gantt', label: 'Gantt' },
    { id: 'calendar', label: 'Calendrier' },
    { id: 'cards', label: 'Cartes' },
];

export default function ViewSwitcher({ value, onChange }: Props) {
    return (
        <div className="inline-flex rounded-xl border border-slate-200/50 bg-slate-100/50 p-0.5 backdrop-blur-sm shadow-sm">
            {OPTIONS.map(({ id, label }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => onChange(id)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all duration-200 active:scale-95 ${
                        value === id
                            ? 'bg-white text-indigo-650 shadow-[0_2px_8px_rgba(99,102,241,0.12)] ring-1 ring-slate-200/30'
                            : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
