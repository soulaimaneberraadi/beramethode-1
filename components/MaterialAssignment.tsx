import React, { useState, useMemo } from 'react';
import { X, Search, RotateCcw, Package, Palette, Ruler, Layers, Check } from 'lucide-react';
import { Material, FicheData } from '../types';
import { fmt } from '../constants';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';

interface MaterialAssignmentProps {
    materials: Material[];
    setMaterialScope: (id: number, scope: Material['scope']) => void;
    ficheData: FicheData;
    currency: string;
    onClose: () => void;
}

const MaterialAssignment: React.FC<MaterialAssignmentProps> = ({
    materials, setMaterialScope, ficheData, currency, onClose,
}) => {
    const { lang } = useLang();
    const colors = ficheData.colors || [];
    const sizes = ficheData.sizes || [];
    const gq = ficheData.gridQuantities || {};

    const [colorFilter, setColorFilter] = useState<string | null>(null);
    const [sizeFilter, setSizeFilter] = useState<number | null>(null);
    const [unitFilter, setUnitFilter] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    const units = useMemo(() => Array.from(new Set(materials.map(m => m.unit).filter(Boolean))), [materials]);

    const appliesToColor = (m: Material, cid: string) => !m.scope?.colors?.length || m.scope.colors.includes(cid);
    const appliesToSize = (m: Material, si: number) => !m.scope?.sizes?.length || m.scope.sizes.includes(si);

    const scopeQty = (m: Material): number => {
        const colIds = m.scope?.colors?.length ? m.scope.colors : colors.map(c => c.id);
        const sizeIdx = m.scope?.sizes?.length ? m.scope.sizes : sizes.map((_, i) => i);
        const seen = new Set<string>();
        let sum = 0;
        colIds.forEach(cid => {
            if (seen.has(cid)) return;
            seen.add(cid);
            sizeIdx.forEach(si => { sum += Number(gq[`${cid}_${si}`] || 0); });
        });
        return sum;
    };

    const filtered = materials.filter(m => {
        if (query && !(m.name || '').toLowerCase().includes(query.toLowerCase())) return false;
        if (unitFilter && m.unit !== unitFilter) return false;
        if (colorFilter && !appliesToColor(m, colorFilter)) return false;
        if (sizeFilter != null && !appliesToSize(m, sizeFilter)) return false;
        return true;
    });

    const toggleColor = (m: Material, cid: string) => {
        const cur = m.scope?.colors || [];
        let next = cur.includes(cid) ? cur.filter(x => x !== cid) : [...cur, cid];
        if (next.length === colors.length) next = [];
        setMaterialScope(m.id, { ...m.scope, colors: next });
    };
    const toggleSize = (m: Material, si: number) => {
        const cur = m.scope?.sizes || [];
        let next = cur.includes(si) ? cur.filter(x => x !== si) : [...cur, si];
        if (next.length === sizes.length) next = [];
        setMaterialScope(m.id, { ...m.scope, sizes: next });
    };
    const resetMaterial = (m: Material) => setMaterialScope(m.id, undefined);

    const hasFilters = !!(colorFilter || sizeFilter != null || unitFilter || query);
    const resetFilters = () => { setColorFilter(null); setSizeFilter(null); setUnitFilter(null); setQuery(''); };

    const colorHex = (cid: string) => (cid && cid.startsWith('#') ? cid : null);

    const Chip = ({ active, onClick, children, hex }: { active: boolean; onClick: () => void; children: React.ReactNode; hex?: string | null }) => (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150 ${active
                ? 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text ring-1 ring-indigo-200'
                : 'bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted hover:bg-slate-100 hover:text-slate-700'}`}
        >
            {hex && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />}
            {children}
            {active && <Check className="w-3 h-3" strokeWidth={2.5} />}
        </button>
    );

    const FilterSelect = ({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
        <select value={value} onChange={e => onChange(e.target.value)}
            className="h-9 px-3 text-[12px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all cursor-pointer appearance-none pr-7 bg-no-repeat bg-[right_0.5rem_center] bg-[length:1rem]"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2394a3b8'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E")` }}>
            {children}
        </select>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-950/30 backdrop-blur-sm p-0 md:p-4">
            <div className="bg-white dark:bg-dk-surface w-full max-h-[92vh] md:max-w-3xl md:max-h-[88vh] rounded-t-2xl md:rounded-2xl shadow-2xl dark:shadow-dk-elevated dark:shadow-dk-lg overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">

                {/* Header — Clean flat */}
                <div className="px-6 py-4 flex items-center justify-between shrink-0 border-b border-slate-100 dark:border-dk-border">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 flex items-center justify-center">
                            <Package className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" />
                        </div>
                        <div>
                            <h2 className="text-slate-900 dark:text-dk-text font-semibold text-[15px] leading-tight">Affectation des Matières</h2>
                            <p className="text-slate-400 dark:text-dk-muted text-[11px] mt-0.5">Quelle matière entre dans quelle couleur / taille</p>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 dark:text-dk-muted hover:text-slate-600 hover:bg-slate-100 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Filters — Minimal bar */}
                <div className="px-5 py-3 border-b border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface flex flex-wrap items-center gap-2 shrink-0">
                    <div className="relative flex-1 min-w-[180px]">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-dk-muted" />
                        <input
                            value={query} onChange={e => setQuery(e.target.value)}
                            placeholder={tx(lang, {fr:'Rechercher une matière…',ar:'بحث عن مادة…',en:'Search for a material…',es:'Buscar un material…',pt:'Procurar um material…',tr:'Malzeme ara…'})}
                            className="w-full h-9 pl-9 pr-3 text-[12px] bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all placeholder:text-slate-400"
                        />
                    </div>
                    <FilterSelect value={unitFilter || ''} onChange={v => setUnitFilter(v || null)}>
                        <option value="">Toutes unités</option>
                        {units.map(u => <option key={u} value={u}>{u}</option>)}
                    </FilterSelect>
                    <FilterSelect value={colorFilter || ''} onChange={v => setColorFilter(v || null)}>
                        <option value="">Toutes couleurs</option>
                        {colors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </FilterSelect>
                    <FilterSelect value={sizeFilter != null ? String(sizeFilter) : ''} onChange={v => setSizeFilter(v === '' ? null : Number(v))}>
                        <option value="">Toutes tailles</option>
                        {sizes.map((s, i) => <option key={i} value={i}>{s}</option>)}
                    </FilterSelect>
                    {hasFilters && (
                        <button onClick={resetFilters}
                            className="inline-flex items-center gap-1 h-9 px-3 text-[11px] font-medium text-slate-500 dark:text-dk-muted hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                            <RotateCcw className="w-3 h-3" /> {tx(lang, {fr:'Réinitialiser',ar:'إعادة تعيين',en:'Reset',es:'Restablecer',pt:'Repor',tr:'Sıfırla'})}
                        </button>
                    )}
                </div>

                {/* Materials List */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                    {filtered.length === 0 && (
                        <div className="text-center text-slate-400 dark:text-dk-muted text-[13px] py-12">
                            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            Aucune matière ne correspond aux filtres.
                        </div>
                    )}
                    {filtered.map(m => {
                        const allColors = !m.scope?.colors?.length;
                        const allSizes = !m.scope?.sizes?.length;
                        const isAssigned = !allColors || !allSizes;
                        return (
                            <div key={m.id}
                                className={`border rounded-xl p-4 transition-all duration-150 ${isAssigned
                                    ? 'border-indigo-100 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/30'
                                    : 'border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface hover:border-slate-200'}`}>

                                {/* Material Header */}
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-800 dark:text-dk-text text-[13px] truncate">{m.name || '—'}</span>
                                            {isAssigned && (
                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:text-dk-accent-text text-[9px] font-bold uppercase tracking-wide">
                                                    <Layers className="w-2.5 h-2.5" /> Scope
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-slate-400 dark:text-dk-muted mt-0.5">
                                            {fmt(m.qty)} {m.unit} / pièce · s'applique à <span className="font-medium text-slate-600 dark:text-dk-text-soft">{fmt(scopeQty(m))}</span> pièces
                                        </div>
                                    </div>
                                    {isAssigned && (
                                        <button onClick={() => resetMaterial(m)}
                                            className="text-[10px] font-medium text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:text-dk-accent-text hover:bg-indigo-50 dark:bg-dk-accent/20 px-2 py-1 rounded-md transition-colors shrink-0">
                                            {tx(lang, {fr:'Réinitialiser',ar:'إعادة تعيين',en:'Reset',es:'Restablecer',pt:'Repor',tr:'Sıfırla'})}
                                        </button>
                                    )}
                                </div>

                                {/* Colors */}
                                {colors.length > 0 && (
                                    <div className="mb-2.5">
                                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-dk-muted mb-1.5">
                                            <Palette className="w-3 h-3" /> Couleurs
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            <Chip active={allColors} onClick={() => setMaterialScope(m.id, { ...m.scope, colors: [] })}>Toutes</Chip>
                                            {colors.map(c => (
                                                <Chip key={c.id} active={!allColors && (m.scope?.colors || []).includes(c.id)} onClick={() => toggleColor(m, c.id)} hex={colorHex(c.id)}>
                                                    {c.name}
                                                </Chip>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Sizes */}
                                {sizes.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-dk-muted mb-1.5">
                                            <Ruler className="w-3 h-3" /> Tailles
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            <Chip active={allSizes} onClick={() => setMaterialScope(m.id, { ...m.scope, sizes: [] })}>Toutes</Chip>
                                            {sizes.map((s, i) => (
                                                <Chip key={i} active={!allSizes && (m.scope?.sizes || []).includes(i)} onClick={() => toggleSize(m, i)}>{s}</Chip>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer — Clean */}
                <div className="px-5 py-3 border-t border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface flex items-center justify-between shrink-0">
                    <span className="text-[11px] text-slate-400 dark:text-dk-muted flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Les changements sont appliqués en direct
                    </span>
                    <button onClick={onClose}
                        className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-semibold transition-colors shadow-sm dark:shadow-dk-sm">
                        Terminé
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MaterialAssignment;
