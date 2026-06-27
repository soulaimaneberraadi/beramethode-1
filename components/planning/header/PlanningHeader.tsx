import React, { useState } from 'react';
import { Plus, Sparkles, Printer, Search, ChevronLeft, ChevronRight, SlidersHorizontal, Brain, MoreHorizontal, X, Undo2, Redo2 } from 'lucide-react';
import { fmtMonthYear } from '../shared/dateFmt';
import { useIsMobile } from '../shared/useIsMobile';
import type { ViewKind } from './ViewSwitcher';
import ZoomSwitcher, { type ZoomLevel } from './ZoomSwitcher';
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

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
    activeFilterCount?: number;
    onOptimizePlanning?: () => void;
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
    { id: 'simulation', label: 'Simulateur' },
];

const VIEW_LABELS: Record<string, {fr:string;ar:string;en:string;es:string;pt:string;tr:string}> = {
    gantt: {fr:"Gantt",ar:"مخطط جانت",en:"Gantt",es:"Gantt",pt:"Gantt",tr:"Gantt"},
    calendar: {fr:"Calendrier",ar:"تقويم",en:"Calendar",es:"Calendario",pt:"Calendário",tr:"Takvim"},
    cards: {fr:"Cartes",ar:"بطاقات",en:"Cards",es:"Tarjetas",pt:"Cartões",tr:"Kartlar"},
    simulation: {fr:"Simulateur",ar:"محاكي",en:"Simulator",es:"Simulador",pt:"Simulador",tr:"Simülatör"},
};


export default function PlanningHeader({
    active, blocked, late,
    view, onView,
    zoom, onZoom,
    currentDate, onDateChange, onToday,
    onAddEvent, onAutoSchedule, onPrint,
    searchText, onSearch,
    filtersOpen, onToggleFilters, hasActiveFilters, activeFilterCount = 0,
    onOptimizePlanning,
    canUndo, canRedo, onUndo, onRedo,
}: Props) {

    const { lang } = useLang();

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
            <header className="shrink-0 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/45 dark:border-slate-700/60 backdrop-blur-md shadow-sm">
                {/* ROW 1 — title + primary actions */}
                <div className="px-3 h-12 flex items-center gap-2">
                    <h1 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 tracking-tight">{tx(lang,{fr:"Planning",ar:"التخطيط",en:"Planning",es:"Planificación",pt:"Planejamento",tr:"Planlama"})}</h1>

                    {/* Stat dots compact */}
                    <div className="flex items-center gap-2 ml-1">
                        {blocked > 0 && <StatDotInline value={blocked} color="bg-red-500" />}
                        {late > 0 && <StatDotInline value={late} color="bg-amber-500" />}
                    </div>

                    <div className="flex-1" />

                    {onUndo && (
                        <IconButton onClick={onUndo} title={tx(lang,{fr:"Annuler",ar:"تراجع",en:"Undo",es:"Deshacer",pt:"Desfazer",tr:"Geri al"})} disabled={!canUndo}>
                            <Undo2 className="w-4 h-4" strokeWidth={2} />
                        </IconButton>
                    )}

                    <IconButton
                        active={mobileSearchOpen}
                        onClick={() => setMobileSearchOpen(v => !v)}
                        title={tx(lang,{fr:"Rechercher",ar:"بحث",en:"Search",es:"Buscar",pt:"Buscar",tr:"Ara"})}
                    >
                        <Search className="w-4 h-4" strokeWidth={2} />
                    </IconButton>

                    <IconButton
                        active={filtersOpen || hasActiveFilters}
                        onClick={onToggleFilters}
                        title={tx(lang,{fr:"Filtres",ar:"مرشحات",en:"Filters",es:"Filtros",pt:"Filtros",tr:"Filtreler"})}
                    >
                        <SlidersHorizontal className="w-4 h-4" strokeWidth={2} />
                        {activeFilterCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[9px] font-bold tabular-nums leading-none shadow-sm">
                                {activeFilterCount}
                            </span>
                        )}
                    </IconButton>

                    <IconButton onClick={() => setMobileMenuOpen(v => !v)} title={tx(lang,{fr:"Plus",ar:"المزيد",en:"More",es:"Más",pt:"Mais",tr:"Daha fazla"})} active={mobileMenuOpen}>
                        <MoreHorizontal className="w-4 h-4" strokeWidth={2} />
                    </IconButton>

                    <button
                        type="button"
                        onClick={onAddEvent}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all duration-200 active:scale-95 shadow-sm"
                        aria-label={tx(lang,{fr:"Nouvel ordre",ar:"أمر جديد",en:"New order",es:"Nuevo pedido",pt:"Novo pedido",tr:"Yeni sipariş"})}
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
                            placeholder={tx(lang,{fr:"Rechercher un OF, un client…",ar:"البحث عن أمر تصنيع، عميل…",en:"Search for a WO, a client…",es:"Buscar OF, cliente…",pt:"Procurar OF, cliente…",tr:"İş emri, müşteri ara…"})}
                            className="w-full h-9 pl-9 pr-9 text-[13px] text-slate-700 placeholder:text-slate-450 bg-slate-100/40 focus:bg-white border border-slate-200/40 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 focus:shadow-sm rounded-xl outline-none transition-all duration-300 backdrop-blur-sm"
                        />
                        {searchText && (
                            <button
                                type="button"
                                onClick={() => onSearch('')}
                                className="absolute right-5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                                aria-label={tx(lang,{fr:"Effacer",ar:"مسح",en:"Clear",es:"Limpiar",pt:"Limpar",tr:"Temizle"})}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                {/* Mobile menu — secondary actions */}
                {mobileMenuOpen && (
                    <div className="px-3 pb-2 grid grid-cols-3 gap-1.5">
                        <MobileMenuBtn icon={Sparkles} label={tx(lang,{fr:"Auto",ar:"تلقائي",en:"Auto",es:"Auto",pt:"Auto",tr:"Otomatik"})} onClick={() => { setMobileMenuOpen(false); onAutoSchedule(); }} />
                        {onOptimizePlanning && (
                            <MobileMenuBtn icon={Brain} label={tx(lang,{fr:"IA",ar:"ذكاء اصطناعي",en:"AI",es:"IA",pt:"IA",tr:"YZ"})} accent="text-purple-600" onClick={() => { setMobileMenuOpen(false); onOptimizePlanning(); }} />
                        )}
                        {onPrint && (
                            <MobileMenuBtn icon={Printer} label={tx(lang,{fr:"Imprimer",ar:"طباعة",en:"Print",es:"Imprimir",pt:"Imprimir",tr:"Yazdır"})} onClick={() => { setMobileMenuOpen(false); onPrint(); }} />
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
                            aria-label={tx(lang,{fr:"Mois précédent",ar:"الشهر السابق",en:"Previous month",es:"Mes anterior",pt:"Mês anterior",tr:"Önceki ay"})}
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
                            aria-label={tx(lang,{fr:"Mois suivant",ar:"الشهر التالي",en:"Next month",es:"Mes siguiente",pt:"Próximo mês",tr:"Sonraki ay"})}
                        >
                            <ChevronRight className="w-4 h-4" strokeWidth={2} />
                        </button>
                        <span className="mx-1 h-3.5 w-px bg-slate-200/65" aria-hidden />
                        <button
                            type="button"
                            onClick={onToday}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-655 hover:bg-white hover:text-indigo-700 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                        >
                            {tx(lang,{fr:"Auj.",ar:"اليوم",en:"Today",es:"Hoy",pt:"Hoje",tr:"Bugün"})}
                        </button>
                    </div>

                    <div className="w-px h-4 bg-slate-200/60 shrink-0" />

                    <Segmented options={VIEW_OPTIONS.map(o => ({ ...o, label: tx(lang, VIEW_LABELS[o.id]) }))} value={view} onChange={onView} />

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
        <header className="shrink-0 bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/45 dark:border-slate-700/60 backdrop-blur-md sticky top-0 z-40 shadow-sm">
            {/* ROW 1 — Brand + actions */}
            <div className="px-6 h-14 flex items-center gap-4">

                {/* Title */}
                <div className="flex items-baseline gap-2 shrink-0">
                    <h1 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 tracking-tight">{tx(lang,{fr:"Planning",ar:"التخطيط",en:"Planning",es:"Planificación",pt:"Planejamento",tr:"Planlama"})}</h1>
                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{tx(lang,{fr:"Production",ar:"الإنتاج",en:"Production",es:"Producción",pt:"Produção",tr:"Üretim"})}</span>
                </div>

                {/* Inline stats — minimaliste */}
                <div className="hidden md:flex items-center gap-1.5 ml-2">
                    <Stat label={tx(lang,{fr:"Actifs",ar:"نشط",en:"Active",es:"Activos",pt:"Ativos",tr:"Aktif"})} value={active} color="bg-slate-400" />
                    <Stat label={tx(lang,{fr:"Bloqués",ar:"محظور",en:"Blocked",es:"Bloqueados",pt:"Bloqueados",tr:"Engellendi"})} value={blocked} color="bg-red-500" emphasize={blocked > 0} />
                    <Stat label={tx(lang,{fr:"Retards",ar:"متأخر",en:"Late",es:"Retrasos",pt:"Atrasados",tr:"Gecikmiş"})} value={late} color="bg-amber-500" emphasize={late > 0} />
                </div>

                {/* Search — flex-grow */}
                <div className="flex-1 max-w-md mx-auto relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
                    <input
                        type="text"
                        value={searchText}
                        onChange={(e) => onSearch(e.target.value)}
                        placeholder={tx(lang,{fr:"Rechercher un OF, un client…",ar:"البحث عن أمر تصنيع، عميل…",en:"Search for a WO, a client…",es:"Buscar OF, cliente…",pt:"Procurar OF, cliente…",tr:"İş emri, müşteri ara…"})}
                        className="w-full h-8 pl-9 pr-3 text-[12px] text-slate-700 placeholder:text-slate-450 bg-slate-100/40 hover:bg-slate-100/70 focus:bg-white/85 border border-slate-200/40 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 focus:shadow-md rounded-xl outline-none transition-all duration-300 backdrop-blur-sm"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    {onUndo && (
                        <IconButton
                            onClick={onUndo}
                            title={tx(lang,{fr:"Annuler (Ctrl+Z)",ar:"تراجع (Ctrl+Z)",en:"Undo (Ctrl+Z)",es:"Deshacer (Ctrl+Z)",pt:"Desfazer (Ctrl+Z)",tr:"Geri al (Ctrl+Z)"})}
                            disabled={!canUndo}
                        >
                            <Undo2 className="w-3.5 h-3.5" strokeWidth={2} />
                        </IconButton>
                    )}
                    {onRedo && (
                        <IconButton
                            onClick={onRedo}
                            title={tx(lang,{fr:"Rétablir (Ctrl+Y)",ar:"إعادة (Ctrl+Y)",en:"Redo (Ctrl+Y)",es:"Rehacer (Ctrl+Y)",pt:"Refazer (Ctrl+Y)",tr:"Yinele (Ctrl+Y)"})}
                            disabled={!canRedo}
                        >
                            <Redo2 className="w-3.5 h-3.5" strokeWidth={2} />
                        </IconButton>
                    )}
                    {(onUndo || onRedo) && <div className="w-px h-5 bg-slate-200/50 mx-0.5" />}

                    <button
                        type="button"
                        onClick={onToggleFilters}
                        title={tx(lang,{fr:"Filtres",ar:"مرشحات",en:"Filters",es:"Filtros",pt:"Filtros",tr:"Filtreler"})}
                        className={`relative inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-[12px] font-bold transition-all duration-200 active:scale-95 border ${
                            filtersOpen || hasActiveFilters
                                ? 'bg-white text-indigo-650 border-slate-200/50 shadow-sm'
                                : 'text-slate-500 border-transparent hover:text-slate-850 hover:bg-white/75 hover:border-slate-200/40 hover:shadow-sm'
                        }`}
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="hidden lg:inline">{tx(lang,{fr:"Filtres",ar:"مرشحات",en:"Filters",es:"Filtros",pt:"Filtros",tr:"Filtreler"})}</span>
                        {activeFilterCount > 0 && (
                            <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[9px] font-bold tabular-nums leading-none">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>

                    {onPrint && (
                        <IconButton onClick={onPrint} title={tx(lang,{fr:"Imprimer (Ctrl+P)",ar:"طباعة (Ctrl+P)",en:"Print (Ctrl+P)",es:"Imprimir (Ctrl+P)",pt:"Imprimir (Ctrl+P)",tr:"Yazdır (Ctrl+P)"})}>
                            <Printer className="w-3.5 h-3.5" strokeWidth={2} />
                        </IconButton>
                    )}

                    <div className="w-px h-5 bg-slate-200/50 mx-1" />

                    <button
                        type="button"
                        onClick={onAddEvent}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-bold transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                    >
                        <Plus className="w-3.5 h-3.5" strokeWidth={2.25} />
                        {tx(lang,{fr:"Nouvel ordre",ar:"أمر جديد",en:"New order",es:"Nuevo pedido",pt:"Novo pedido",tr:"Yeni sipariş"})}
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
                        aria-label={tx(lang,{fr:"Mois précédent",ar:"الشهر السابق",en:"Previous month",es:"Mes anterior",pt:"Mês anterior",tr:"Önceki ay"})}
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
                        aria-label={tx(lang,{fr:"Mois suivant",ar:"الشهر التالي",en:"Next month",es:"Mes siguiente",pt:"Próximo mês",tr:"Sonraki ay"})}
                    >
                        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                    <span className="mx-1 h-3.5 w-px bg-slate-200/65" aria-hidden />
                    <button
                        type="button"
                        onClick={onToday}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-650 hover:bg-white hover:text-indigo-700 hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 active:scale-95"
                    >
                        {tx(lang,{fr:"Aujourd'hui",ar:"اليوم",en:"Today",es:"Hoy",pt:"Hoje",tr:"Bugün"})}
                    </button>
                </div>

                <div className="w-px h-4 bg-slate-200/60" />

                {/* View switcher — segmented */}
                <Segmented options={VIEW_OPTIONS.map(o => ({ ...o, label: tx(lang, VIEW_LABELS[o.id]) }))} value={view} onChange={onView} />

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
