import React from 'react';
import { Plus, Sparkles, Printer, Search, ChevronLeft, ChevronRight, SlidersHorizontal, Brain } from 'lucide-react';
import { fmtMonthYear } from '../shared/dateFmt';
import type { ViewKind } from './ViewSwitcher';
import ZoomSwitcher, { type ZoomLevel } from './ZoomSwitcher';

interface Props {
    active: number;
    blocked: number;
    late: number;
    view: ViewKind;
    onView: (v: ViewKind) => void;
    zoom: ZoomLevel;
    onZoom: (z: ZoomLevel) => void;
    currentDate: Date;
    onDateChange: (d: Date) => void;
    onToday: () => void;
    onAddEvent: () => void;
    onAutoSchedule: () => void;
    onPrint?: () => void;
    searchText: string;
    onSearch: (s: string) => void;
    filtersOpen: boolean;
    onToggleFilters: () => void;
    hasActiveFilters: boolean;
    onOptimizePlanning?: () => void;
}

const VIEW_OPTIONS: { id: ViewKind; label: string }[] = [
    { id: 'gantt', label: 'Gantt' },
    { id: 'calendar', label: 'Calendrier' },
    { id: 'cards', label: 'Cartes' },
];


export default function PlanningHeader({
    active, blocked, late,
    view, onView,
    zoom, onZoom,
    currentDate, onDateChange, onToday,
    onAddEvent, onAutoSchedule, onPrint,
    searchText, onSearch,
    filtersOpen, onToggleFilters, hasActiveFilters,
    onOptimizePlanning,
}: Props) {

    const shift = (delta: number) => {
        const n = new Date(currentDate);
        n.setMonth(n.getMonth() + delta);
        onDateChange(n);
    };

    return (
        <header className="shrink-0 bg-white border-b border-slate-100">
            {/* ROW 1 — Brand + actions */}
            <div className="px-6 h-14 flex items-center gap-4">

                {/* Title */}
                <div className="flex items-baseline gap-3 shrink-0">
                    <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Planning</h1>
                    <span className="text-[12px] text-slate-400">Production</span>
                </div>

                {/* Inline stats — minimaliste */}
                <div className="hidden md:flex items-center gap-4 ml-2">
                    <Stat label="Actifs" value={active} color="bg-slate-400" />
                    <Stat label="Bloqués" value={blocked} color="bg-red-500" emphasize={blocked > 0} />
                    <Stat label="Retards" value={late} color="bg-amber-500" emphasize={late > 0} />
                </div>

                {/* Search — flex-grow */}
                <div className="flex-1 max-w-md mx-auto relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
                    <input
                        type="text"
                        value={searchText}
                        onChange={(e) => onSearch(e.target.value)}
                        placeholder="Rechercher un OF, un client…"
                        className="w-full h-8 pl-9 pr-3 text-[12px] text-slate-700 placeholder:text-slate-400 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-transparent focus:border-slate-200 focus:ring-2 focus:ring-slate-100 rounded-md outline-none transition-all"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    <IconButton
                        active={filtersOpen || hasActiveFilters}
                        onClick={onToggleFilters}
                        title="Filtres"
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.75} />
                        {hasActiveFilters && (
                            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#2149C1]" />
                        )}
                    </IconButton>

                    {onPrint && (
                        <IconButton onClick={onPrint} title="Imprimer (Ctrl+P)">
                            <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </IconButton>
                    )}

                    <IconButton onClick={onAutoSchedule} title="Auto-jdwala (A)">
                        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </IconButton>

                    {onOptimizePlanning && (
                        <IconButton onClick={onOptimizePlanning} title="Optimiser le planning par IA">
                            <Brain className="w-3.5 h-3.5 text-purple-600 animate-pulse" strokeWidth={1.75} />
                        </IconButton>
                    )}

                    <div className="w-px h-5 bg-slate-100 mx-1" />

                    <button
                        type="button"
                        onClick={onAddEvent}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" strokeWidth={2.25} />
                        Planifier
                    </button>
                </div>
            </div>

            {/* ROW 2 — date nav + view switcher */}
            <div className="px-6 h-10 flex items-center gap-3 border-t border-slate-100">

                {/* Date navigation */}
                <div className="flex items-center gap-0.5">
                    <button
                        type="button"
                        onClick={() => shift(-1)}
                        className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        aria-label="Mois précédent"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                    <span className="text-[12px] font-medium text-slate-700 px-2 capitalize tabular-nums min-w-[7rem] text-center">
                        {fmtMonthYear(currentDate)}
                    </span>
                    <button
                        type="button"
                        onClick={() => shift(1)}
                        className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        aria-label="Mois suivant"
                    >
                        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={onToday}
                        className="text-[11px] font-medium text-slate-500 hover:text-slate-900 px-2 h-6 rounded hover:bg-slate-100 transition-colors ml-1"
                    >
                        Aujourd'hui
                    </button>
                </div>

                <div className="w-px h-4 bg-slate-100" />

                {/* View switcher — segmented */}
                <Segmented options={VIEW_OPTIONS} value={view} onChange={onView} />

                {view === 'gantt' && (
                    <>
                        <div className="w-px h-4 bg-slate-100" />
                        <ZoomSwitcher value={zoom} onChange={onZoom} />
                    </>
                )}
            </div>
        </header>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

function Stat({ label, value, color, emphasize }: { label: string; value: number; color: string; emphasize?: boolean }) {
    return (
        <div className="inline-flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${color} ${emphasize && value > 0 ? 'animate-pulse' : ''}`} />
            <span className="text-[12px] text-slate-500">{label}</span>
            <span className={`text-[12px] font-semibold tabular-nums ${emphasize && value > 0 ? 'text-slate-900' : 'text-slate-700'}`}>
                {value}
            </span>
        </div>
    );
}

function IconButton({
    children, onClick, active, title,
}: { children: React.ReactNode; onClick: () => void; active?: boolean; title?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`relative w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                active
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
        >
            {children}
        </button>
    );
}

function Segmented<T extends string>({
    options, value, onChange,
}: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
    return (
        <div className="inline-flex p-0.5 bg-slate-100/60 rounded-md">
            {options.map(({ id, label }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => onChange(id)}
                    className={`px-2.5 h-6 text-[11px] font-medium rounded transition-all ${
                        value === id
                            ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
