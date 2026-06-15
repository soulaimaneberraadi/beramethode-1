import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Sparkles, Calendar, LayoutGrid, Rows, Eye, Printer, Filter, X } from 'lucide-react';

export interface CommandAction {
    id: string;
    label: string;
    hint?: string;
    keywords?: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    onRun: () => void;
    shortcut?: string;
    group?: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    actions: CommandAction[];
}

export default function CommandPalette({ open, onClose, actions }: Props) {
    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIdx(0);
            setTimeout(() => inputRef.current?.focus(), 30);
        }
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return actions;
        return actions.filter(a =>
            a.label.toLowerCase().includes(q) ||
            (a.keywords || '').toLowerCase().includes(q)
        );
    }, [query, actions]);

    // group
    const groups = useMemo(() => {
        const map = new Map<string, CommandAction[]>();
        for (const a of filtered) {
            const g = a.group || 'Actions';
            if (!map.has(g)) map.set(g, []);
            map.get(g)!.push(a);
        }
        return Array.from(map.entries());
    }, [filtered]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx(i => Math.min(filtered.length - 1, i + 1));
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx(i => Math.max(0, i - 1));
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const a = filtered[activeIdx];
                if (a) { a.onRun(); onClose(); }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, filtered, activeIdx, onClose]);

    useEffect(() => {
        // scroll active into view
        const el = listRef.current?.querySelector(`[data-cmd-idx="${activeIdx}"]`) as HTMLElement | null;
        el?.scrollIntoView({ block: 'nearest' });
    }, [activeIdx]);

    if (!open) return null;

    let flatIdx = -1;

    return createPortal(
        <div
            className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4 bg-slate-950/30 backdrop-blur-[3px] animate-[planning-fade-in_140ms_ease-out]"
            onClick={onClose}
        >
            <div
                className="w-full max-w-xl bg-white rounded-xl shadow-[0_24px_64px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/60 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search */}
                <div className="flex items-center gap-2 px-4 h-12 border-b border-slate-100">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={1.75} />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                        placeholder="Tapez une commande ou recherchez…"
                        className="flex-1 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none bg-transparent"
                    />
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* List */}
                <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
                    {filtered.length === 0 && (
                        <div className="px-4 py-8 text-center text-[12px] text-slate-400">
                            Aucune commande
                        </div>
                    )}
                    {groups.map(([group, items]) => (
                        <div key={group} className="py-1">
                            <div className="px-4 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                {group}
                            </div>
                            {items.map(a => {
                                flatIdx++;
                                const isActive = flatIdx === activeIdx;
                                const idx = flatIdx;
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        data-cmd-idx={idx}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                        onClick={() => { a.onRun(); onClose(); }}
                                        className={`group w-full px-4 h-9 flex items-center gap-3 text-left transition-colors ${
                                            isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
                                        }`}
                                    >
                                        <a.icon className="w-3.5 h-3.5 text-slate-500 shrink-0" strokeWidth={1.75} />
                                        <span className="text-[13px] text-slate-800 flex-1 truncate">{a.label}</span>
                                        {a.hint && <span className="text-[11px] text-slate-400 shrink-0">{a.hint}</span>}
                                        {a.shortcut && (
                                            <kbd className="text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                                                {a.shortcut}
                                            </kbd>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Footer hints */}
                <div className="flex items-center justify-between px-4 h-8 border-t border-slate-100 bg-slate-50/40 text-[10px] text-slate-400">
                    <div className="flex items-center gap-3">
                        <span>↑↓ Naviguer</span>
                        <span>↵ Sélectionner</span>
                        <span>Esc Fermer</span>
                    </div>
                    <span>⌘K</span>
                </div>
            </div>
        </div>,
        document.body
    );
}

export { Plus, Sparkles, Calendar, LayoutGrid, Rows, Eye, Printer, Filter };
