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
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50/60 p-0.5">
            {OPTIONS.map(({ id, label }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => onChange(id)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                        value === id
                            ? 'bg-white text-[#2149C1] shadow-sm ring-1 ring-slate-200'
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
