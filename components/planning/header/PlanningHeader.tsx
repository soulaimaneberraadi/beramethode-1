import React, { useState } from 'react';
import { Plus, Sparkles, Printer, Search, ChevronLeft, ChevronRight, SlidersHorizontal, Brain, MoreHorizontal, X, Undo2, Redo2, Layers, Trash2 } from 'lucide-react';
import { fmtMonthYear } from '../shared/dateFmt';
import { useIsMobile } from '../shared/useIsMobile';
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
    onBatchSchedule?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    onClearPlanning?: () => void;
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
    onOptimizePlanning, onBatchSchedule,
    canUndo, canRedo, onUndo, onRedo,
    onClearPlanning,
}: Props) {

    const shift = (delta: number) => {
        const n = new Date(currentDate);
        n.setMonth(n.getMonth() + delta);
        onDateChange(n);
    };

    const isMobile = useIsMobile();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

    if (isMobile) {
        return (
            <header className="shrink-0 bg-white/80 border-b border-slate-200/45 backdrop-blur-md shadow-sm">
                {/* ROW 1 — title + primary actions */}
                <div className="px-3 h-12 flex items-center gap-2">
                    <h1 className="text-[15px] font-bold text-slate-900 tracking-tight">Planning</h1>

                    {/* Stat dots compact */}
                    <div className="flex items-center gap-2 ml-1">
                        {blocked > 0 && <StatDotInline value={blocked} color="bg-red-500" />}
                        {late > 0 && <StatDotInline value={late} color="bg-amber-500" />}
                    </div>

                    <div className="flex-1" />

                    {onUndo && (
                        <IconButton onClick={onUndo} title="Annuler" disabled={!canUndo}>
                            <Undo2 className="w-4 h-4" strokeWidth={2} />
                        </IconButton>
                    )}

                    <IconButton
                        active={mobileSearchOpen}
                        onClick={() => setMobileSearchOpen(v => !v)}
                        title="Rechercher"
                    >
                        <Search className="w-4 h-4" strokeWidth={2} />
                    </IconButton>

                    <IconButton
                        active={filtersOpen || hasActiveFilters}
                        onClick={onToggleFilters}
                        title="Filtres"
                    >
                        <SlidersHorizontal className="w-4 h-4" strokeWidth={2} />
                        {hasActiveFilters && (
                            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-650" />
                        )}
                    </IconButton>

                    <IconButton onClick={() => setMobileMenuOpen(v => !v)} title="Plus" active={mobileMenuOpen}>
                        <MoreHorizontal className="w-4 h-4" strokeWidth={2} />
                    </IconButton>

                    <button
                        type="button"
                        onClick={onAddEvent}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900 text-white transition-all duration-200 active:scale-95 shadow-sm"
                        aria-label="Planifier"
                    >
                        <Plus className="w-4 h-4" strokeWidth={2.25} />
                    </button>
                </div>

                {/* Mobile search row */}
                {mobileSearchOpen && (
                    <div className="px-3 pb-2 relative">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
                        <input
                            type="text"
                            autoFocus
                            value={searchText}
                            onChange={(e) => onSearch(e.target.value)}
                            placeholder="Rechercher un OF, un client…"
                            className="w-full h-9 pl-9 pr-9 text-[13px] text-slate-700 placeholder:text-slate-450 bg-slate-100/40 focus:bg-white border border-slate-200/40 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 focus:shadow-sm rounded-xl outline-none transition-all duration-300 backdrop-blur-sm"
                        />
                        {searchText && (
                            <button
                                type="button"
                                onClick={() => onSearch('')}
                                className="absolute right-5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                                aria-label="Effacer"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                {/* Mobile menu — secondary actions */}
                {mobileMenuOpen && (
                    <div className="px-3 pb-2 grid grid-cols-3 gap-1.5">
                        <MobileMenuBtn icon={Sparkles} label="Auto" onClick={() => { setMobileMenuOpen(false); onAutoSchedule(); }} />
                        {onBatchSchedule && (
                            <MobileMenuBtn icon={Layers} label="Lot" accent="text-indigo-650" onClick={() => { setMobileMenuOpen(false); onBatchSchedule(); }} />
                        )}
                        {onOptimizePlanning && (
                            <MobileMenuBtn icon={Brain} label="IA" accent="text-purple-600" onClick={() => { setMobileMenuOpen(false); onOptimizePlanning(); }} />
                        )}
                        {onPrint && (
                            <MobileMenuBtn icon={Printer} label="Imprimer" onClick={() => { setMobileMenuOpen(false); onPrint(); }} />
                        )}
                    </div>
                )}

                {/* ROW 2 — date nav + view switcher */}
                <div className="px-3 h-11 flex items-center gap-2 border-t border-slate-200/35 overflow-x-auto">
                    <div className="flex items-center rounded-xl border border-slate-200/50 bg-slate-100/50 p-0.5 backdrop-blur-sm shadow-sm shrink-0">
                        <button
                            type="button"
                            onClick={() => shift(-1)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                            aria-label="Mois précédent"
                        >
                            <ChevronLeft className="w-4 h-4" strokeWidth={2} />
                        </button>
                        <span className="text-[10px] font-bold text-slate-700 px-1 capitalize tabular-nums min-w-[6.5rem] text-center">
                            {fmtMonthYear(currentDate)}
                        </span>
                        <button
                            type="button"
                            onClick={() => shift(1)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                            aria-label="Mois suivant"
                        >
                            <ChevronRight className="w-4 h-4" strokeWidth={2} />
                        </button>
                        <span className="mx-1 h-3.5 w-px bg-slate-200/65" aria-hidden />
                        <button
                            type="button"
                            onClick={onToday}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-655 hover:bg-white hover:text-indigo-700 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                        >
                            Auj.
                        </button>
                    </div>

                    <div className="w-px h-4 bg-slate-200/60 shrink-0" />

                    <Segmented options={VIEW_OPTIONS} value={view} onChange={onView} />

                    {view === 'gantt' && (
                        <>
                            <div className="w-px h-4 bg-slate-200/60 shrink-0" />
                            <ZoomSwitcher value={zoom} onChange={onZoom} />
                        </>
                    )}
                </div>
            </header>
        );
    }

    return (
        <header className="shrink-0 bg-white/70 border-b border-slate-200/45 backdrop-blur-md sticky top-0 z-40 shadow-sm">
            {/* ROW 1 — Brand + actions */}
            <div className="px-6 h-14 flex items-center gap-4">

                {/* Title */}
                <div className="flex items-baseline gap-2 shrink-0">
                    <h1 className="text-[15px] font-bold text-slate-900 tracking-tight">Planning</h1>
                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Production</span>
                </div>

                {/* Inline stats — minimaliste */}
                <div className="hidden md:flex items-center gap-1.5 ml-2">
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
                        className="w-full h-8.5 pl-9 pr-3 text-[12px] text-slate-700 placeholder:text-slate-450 bg-slate-100/40 hover:bg-slate-100/70 focus:bg-white/85 border border-slate-200/40 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 focus:shadow-md rounded-xl outline-none transition-all duration-300 backdrop-blur-sm"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    {onUndo && (
                        <IconButton
                            onClick={onUndo}
                            title="Annuler (Ctrl+Z)"
                            disabled={!canUndo}
                        >
                            <Undo2 className="w-3.5 h-3.5" strokeWidth={2} />
                        </IconButton>
                    )}
                    {onRedo && (
                        <IconButton
                            onClick={onRedo}
                            title="Rétablir (Ctrl+Y)"
                            disabled={!canRedo}
                        >
                            <Redo2 className="w-3.5 h-3.5" strokeWidth={2} />
                        </IconButton>
                    )}
                    {(onUndo || onRedo) && <div className="w-px h-5 bg-slate-200/50 mx-0.5" />}

                    <IconButton
                        active={filtersOpen || hasActiveFilters}
                        onClick={onToggleFilters}
                        title="Filtres"
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2} />
                        {hasActiveFilters && (
                            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-650" />
                        )}
                    </IconButton>

                    {onPrint && (
                        <IconButton onClick={onPrint} title="Imprimer (Ctrl+P)">
                            <Printer className="w-3.5 h-3.5" strokeWidth={2} />
                        </IconButton>
                    )}

                    <IconButton onClick={onAutoSchedule} title="Planification automatique (A)">
                        <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                    </IconButton>

                    {onOptimizePlanning && (
                        <IconButton onClick={onOptimizePlanning} title="Optimiser le planning par IA">
                            <Brain className="w-3.5 h-3.5 text-purple-600 animate-pulse" strokeWidth={2} />
                        </IconButton>
                    )}

                    {onClearPlanning && (
                        <button
                            type="button"
                            onClick={onClearPlanning}
                            title="Vider tout le planning"
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50/70 border border-transparent hover:border-red-100/55 transition-all duration-200 active:scale-95"
                        >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>
                    )}

                    <div className="w-px h-5 bg-slate-200/50 mx-1" />

                    {onBatchSchedule && (
                        <button
                            type="button"
                            onClick={onBatchSchedule}
                            className="inline-flex items-center gap-1.5 h-8.5 px-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 text-[12px] font-bold transition-all duration-200 border border-indigo-500/20 shadow-sm active:scale-95"
                            title="Planifier plusieurs modèles en lot"
                        >
                            <Layers className="w-3.5 h-3.5" strokeWidth={2} />
                            Lot
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={onAddEvent}
                        className="inline-flex items-center gap-1.5 h-8.5 px-3 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900 text-white text-[12px] font-bold transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                    >
                        <Plus className="w-3.5 h-3.5" strokeWidth={2.25} />
                        Planifier
                    </button>
                </div>
            </div>

            {/* ROW 2 — date nav + view switcher */}
            <div className="px-6 h-10.5 flex items-center gap-3 border-t border-slate-200/35">

                {/* Date navigation */}
                <div className="flex items-center rounded-xl border border-slate-200/50 bg-slate-100/50 p-0.5 backdrop-blur-sm shadow-sm shrink-0">
                    <button
                        type="button"
                        onClick={() => shift(-1)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                        aria-label="Mois précédent"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                    <span className="text-[10px] font-bold text-slate-700 px-2 min-w-[7rem] text-center capitalize tabular-nums">
                        {fmtMonthYear(currentDate)}
                    </span>
                    <button
                        type="button"
                        onClick={() => shift(1)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                        aria-label="Mois suivant"
                    >
                        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                    <span className="mx-1 h-3.5 w-px bg-slate-200/65" aria-hidden />
                    <button
                        type="button"
                        onClick={onToday}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-650 hover:bg-white hover:text-indigo-700 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                    >
                        Aujourd'hui
                    </button>
                </div>

                <div className="w-px h-4 bg-slate-200/60" />

                {/* View switcher — segmented */}
                <Segmented options={VIEW_OPTIONS} value={view} onChange={onView} />

                {view === 'gantt' && (
                    <>
                        <div className="w-px h-4 bg-slate-200/60" />
                        <ZoomSwitcher value={zoom} onChange={onZoom} />
                    </>
                )}
            </div>
        </header>
    );
}

function StatDotInline({ value, color }: { value: number; color: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${color} animate-pulse`} />
            <span className="text-[11px] font-bold tabular-nums text-slate-750">{value}</span>
        </span>
    );
}

function MobileMenuBtn({
    icon: Icon, label, onClick, accent,
}: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; onClick: () => void; accent?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex flex-col items-center justify-center gap-1 h-14 rounded-xl bg-slate-100/50 hover:bg-white text-slate-700 border border-slate-200/40 shadow-sm transition-all duration-200 active:scale-95"
        >
            <Icon className={`w-4 h-4 ${accent || ''}`} strokeWidth={2} />
            <span className="text-[10px] font-bold">{label}</span>
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

function Stat({ label, value, color, emphasize }: { label: string; value: number; color: string; emphasize?: boolean }) {
    return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/50 border border-slate-200/10 backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.01)] text-[11px] font-medium text-slate-650">
            <span className={`w-1.5 h-1.5 rounded-full ${color} ${emphasize && value > 0 ? 'animate-pulse' : ''}`} />
            <span className="text-[11px] text-slate-500 font-bold">{label}</span>
            <span className={`text-[11px] font-extrabold tabular-nums ${emphasize && value > 0 ? 'text-slate-900' : 'text-slate-700'}`}>
                {value}
            </span>
        </div>
    );
}

function IconButton({
    children, onClick, active, title, disabled,
}: { children: React.ReactNode; onClick: () => void; active?: boolean; title?: string; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            disabled={disabled}
            className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-200 active:scale-95 border border-transparent ${
                disabled
                    ? 'text-slate-300 cursor-not-allowed opacity-50'
                    : active
                        ? 'bg-white text-indigo-650 border-slate-200/50 shadow-sm'
                        : 'text-slate-500 hover:text-slate-850 hover:bg-white/75 hover:border-slate-200/40 hover:shadow-sm'
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
        <div className="inline-flex p-0.5 bg-slate-100/50 border border-slate-200/50 rounded-xl backdrop-blur-sm shadow-sm">
            {options.map(({ id, label }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => onChange(id)}
                    className={`px-3 h-6 text-[10px] font-bold rounded-lg transition-all duration-205 active:scale-95 ${
                        value === id
                            ? 'bg-white text-indigo-650 shadow-[0_2px_6px_rgba(99,102,241,0.12)] ring-1 ring-slate-200/30'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
