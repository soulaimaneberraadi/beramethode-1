import React from 'react';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, Activity } from 'lucide-react';
import { useLang } from '../../../src/context/LanguageContext';
import { tx } from '../../../lib/i18n';

interface Props {
    date: string;
    onDateChange: (d: string) => void;
    currentHourLabel: string;
    searchText: string;
    onSearch: (s: string) => void;
    activeChainsCount: number;
    totalPieces: number;
    conflictsCount: number;
    filtersOpen: boolean;
    onToggleFilters: () => void;
    hasActiveFilters: boolean;
}

function shiftDate(ymd: string, deltaDays: number): string {
    const d = new Date(ymd);
    d.setDate(d.getDate() + deltaDays);
    return d.toISOString().split('T')[0];
}

function todayYmd(): string {
    return new Date().toISOString().split('T')[0];
}

function fmtLong(ymd: string): string {
    const d = new Date(ymd);
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export default function SuiviHeader({
    date, onDateChange, currentHourLabel,
    searchText, onSearch,
    activeChainsCount, totalPieces, conflictsCount,
    filtersOpen, onToggleFilters, hasActiveFilters,
}: Props) {
    const { lang } = useLang();
    const isToday = date === todayYmd();
    return (
        <header className="shrink-0 bg-white border-b border-slate-100">
            <div className="px-6 h-14 flex items-center gap-4">
                <div className="flex items-baseline gap-3 shrink-0">
                    <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">{tx(lang, {fr:"Suivi",ar:"المتابعة",en:"Tracking",es:"Seguimiento",pt:"Acompanhamento",tr:"Takip"})}</h1>
                    <span className="text-[12px] text-slate-400">{tx(lang, {fr:"Production",ar:"الإنتاج",en:"Production",es:"Producción",pt:"Produção",tr:"Üretim"})}</span>
                </div>

                <div className="hidden md:flex items-center gap-4 ml-2">
                    <Stat label="Chaînes" value={activeChainsCount} dot="bg-emerald-500" />
                    <Stat label="Pièces" value={totalPieces} dot="bg-indigo-500" emphasize />
                    {conflictsCount > 0 && (
                        <Stat label="Conflits" value={conflictsCount} dot="bg-amber-500" emphasize />
                    )}
                </div>

                <div className="flex-1 max-w-md mx-auto relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
                    <input
                        type="text"
                        value={searchText}
                        onChange={(e) => onSearch(e.target.value)}
                        placeholder={tx(lang, {fr:"Rechercher un modèle, un client…",ar:"البحث عن نموذج، عميل…",en:"Search for a model, client…",es:"Buscar modelo, cliente…",pt:"Procurar modelo, cliente…",tr:"Model, müşteri ara…"})}
                        className="w-full h-8 pl-9 pr-3 text-[12px] text-slate-700 placeholder:text-slate-400 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-transparent focus:border-slate-200 focus:ring-2 focus:ring-slate-100 rounded-md outline-none transition-all"
                    />
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <IconButton onClick={onToggleFilters} active={filtersOpen || hasActiveFilters} title={tx(lang, {fr:"Filtres",ar:"مرشحات",en:"Filters",es:"Filtros",pt:"Filtros",tr:"Filtreler"})}>
                        <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.75} />
                        {hasActiveFilters && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#2149C1]" />}
                    </IconButton>
                    <div className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-red-50 text-red-700 text-[12px] font-medium">
                        <Activity className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="tabular-nums">{currentHourLabel}</span>
                    </div>
                </div>
            </div>

            <div className="px-6 h-10 flex items-center gap-3 border-t border-slate-100">
                <div className="flex items-center gap-0.5">
                    <button
                        type="button"
                        onClick={() => onDateChange(shiftDate(date, -1))}
                        className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        aria-label={tx(lang, {fr:"Jour précédent",ar:"اليوم السابق",en:"Previous day",es:"Día anterior",pt:"Dia anterior",tr:"Önceki gün"})}
                    >
                        <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                    <span className="text-[12px] font-medium text-slate-700 px-2 capitalize tabular-nums min-w-[14rem] text-center">
                        {fmtLong(date)}
                    </span>
                    <button
                        type="button"
                        onClick={() => onDateChange(shiftDate(date, 1))}
                        className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        aria-label={tx(lang, {fr:"Jour suivant",ar:"اليوم التالي",en:"Next day",es:"Día siguiente",pt:"Próximo dia",tr:"Sonraki gün"})}
                    >
                        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                    {!isToday && (
                        <button
                            type="button"
                            onClick={() => onDateChange(todayYmd())}
                            className="text-[11px] font-medium text-slate-500 hover:text-slate-900 px-2 h-6 rounded hover:bg-slate-100 transition-colors ml-1"
                        >
                            Aujourd'hui
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}

function Stat({ label, value, dot, emphasize }: { label: string; value: number; dot: string; emphasize?: boolean }) {
    return (
        <div className="inline-flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dot} ${emphasize && value > 0 ? 'animate-pulse' : ''}`} />
            <span className="text-[12px] text-slate-500">{label}</span>
            <span className={`text-[12px] font-semibold tabular-nums ${emphasize && value > 0 ? 'text-slate-900' : 'text-slate-700'}`}>{value}</span>
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
                active ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
        >
            {children}
        </button>
    );
}
