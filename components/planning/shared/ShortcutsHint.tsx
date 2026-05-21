import React, { useState } from 'react';
import { Keyboard } from 'lucide-react';

const SHORTCUTS: { key: string; label: string }[] = [
    { key: 'N', label: 'Nouvel ordre' },
    { key: 'A', label: 'Jdwala automatique' },
    { key: 'F', label: 'Mode focus sur l\'OF sélectionné' },
    { key: '/', label: 'Recherche' },
    { key: '⌘K', label: 'Palette de commandes' },
    { key: '⌘P', label: 'Imprimer / Exporter PDF' },
    { key: 'Esc', label: 'Désélectionner / Fermer' },
];

export default function ShortcutsHint() {
    const [open, setOpen] = useState(false);

    return (
        <div className="fixed bottom-4 right-4 z-30">
            {open && (
                <div className="absolute bottom-12 right-0 w-72 bg-white rounded-xl shadow-[0_8px_32px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/60 p-3 mb-2 animate-[planning-fade-up_140ms_ease-out]">
                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2 px-1">
                        Raccourcis clavier
                    </div>
                    <ul className="space-y-0.5">
                        {SHORTCUTS.map(s => (
                            <li key={s.key} className="flex items-center justify-between gap-3 px-1.5 py-1 rounded hover:bg-slate-50">
                                <span className="text-[12px] text-slate-700">{s.label}</span>
                                <kbd className="text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shrink-0 tabular-nums">
                                    {s.key}
                                </kbd>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${
                    open
                        ? 'bg-slate-900 text-white shadow-[0_4px_16px_rgba(15,23,42,0.20)]'
                        : 'bg-white text-slate-500 hover:text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.08)] ring-1 ring-slate-200'
                }`}
                title="Raccourcis clavier"
                aria-label="Raccourcis"
            >
                <Keyboard className="w-4 h-4" strokeWidth={1.75} />
            </button>
        </div>
    );
}
