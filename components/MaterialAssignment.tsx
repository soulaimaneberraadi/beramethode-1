import React, { useState, useMemo } from 'react';
import { X, Search, RotateCcw, Package, Palette, Ruler, Layers, Check } from 'lucide-react';
import { Material, FicheData } from '../types';
import { fmt } from '../constants';

interface MaterialAssignmentProps {
    materials: Material[];
    setMaterialScope: (id: number, scope: Material['scope']) => void;
    ficheData: FicheData;
    currency: string;
    onClose: () => void;
}

/**
 * « Affectation des Matières » — même esprit que Calcul Fil, avec des filtres à la
 * Catalogue de Temps. Permet d'affecter chaque matière à des couleurs / tailles
 * précises de la commande et de vérifier quelle matière entre dans quelle couleur.
 */
const MaterialAssignment: React.FC<MaterialAssignmentProps> = ({
    materials, setMaterialScope, ficheData, currency, onClose,
}) => {
    const colors = ficheData.colors || [];
    const sizes = ficheData.sizes || [];
    const gq = ficheData.gridQuantities || {};

    const [colorFilter, setColorFilter] = useState<string | null>(null); // id couleur
    const [sizeFilter, setSizeFilter] = useState<number | null>(null);
    const [unitFilter, setUnitFilter] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    const units = useMemo(() => Array.from(new Set(materials.map(m => m.unit).filter(Boolean))), [materials]);

    // La matière s'applique-t-elle à cette couleur / taille ? (scope vide = toutes)
    const appliesToColor = (m: Material, cid: string) => !m.scope?.colors?.length || m.scope.colors.includes(cid);
    const appliesToSize = (m: Material, si: number) => !m.scope?.sizes?.length || m.scope.sizes.includes(si);

    // Quantité de commande couverte par le scope d'une matière (pour l'aperçu).
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
        if (next.length === colors.length) next = []; // toutes les couleurs → « Toutes »
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
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-colors ${active
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
        >
            {hex !== undefined && hex && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />}
            {children}
            {active && <Check className="w-3 h-3" strokeWidth={2.5} />}
        </button>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-950/40 backdrop-blur-[3px] p-0 md:p-4">
            <div className="bg-white w-full max-h-[92vh] md:max-w-4xl md:max-h-[90vh] rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col">

                {/* Header — style Calcul Fil */}
                <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-lg"><Package className="w-5 h-5 text-white" /></div>
                        <div>
                            <h2 className="text-white font-black text-base leading-tight">Affectation des Matières</h2>
                            <p className="text-indigo-100 text-[11px]">Quelle matière entre dans quelle couleur / taille</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white p-1.5 hover:bg-white/10 rounded-lg transition"><X className="w-5 h-5" /></button>
                </div>

                {/* Filtres — style Catalogue de Temps */}
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2 shrink-0">
                    <div className="relative flex-1 min-w-[160px]">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                        <input
                            value={query} onChange={e => setQuery(e.target.value)}
                            placeholder="Rechercher une matière..."
                            className="w-full pl-8 pr-2 py-1.5 text-[12px] bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100"
                        />
                    </div>
                    <select value={unitFilter || ''} onChange={e => setUnitFilter(e.target.value || null)} className="py-1.5 px-2 text-[12px] bg-white border border-slate-200 rounded-lg outline-none">
                        <option value="">Toutes unités</option>
                        {units.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <select value={colorFilter || ''} onChange={e => setColorFilter(e.target.value || null)} className="py-1.5 px-2 text-[12px] bg-white border border-slate-200 rounded-lg outline-none">
                        <option value="">Toutes couleurs</option>
                        {colors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={sizeFilter ?? ''} onChange={e => setSizeFilter(e.target.value === '' ? null : Number(e.target.value))} className="py-1.5 px-2 text-[12px] bg-white border border-slate-200 rounded-lg outline-none">
                        <option value="">Toutes tailles</option>
                        {sizes.map((s, i) => <option key={i} value={i}>{s}</option>)}
                    </select>
                    {hasFilters && (
                        <button onClick={resetFilters} className="inline-flex items-center gap-1 py-1.5 px-2 text-[11px] font-semibold text-slate-500 hover:text-slate-700">
                            <RotateCcw className="w-3 h-3" /> Réinitialiser
                        </button>
                    )}
                    {colorFilter && (
                        <span className="text-[11px] text-indigo-600 font-semibold ml-auto">
                            {filtered.length} matière(s) dans « {colors.find(c => c.id === colorFilter)?.name} »
                        </span>
                    )}
                </div>

                {/* Liste des matières */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {filtered.length === 0 && (
                        <div className="text-center text-slate-400 text-sm py-10">Aucune matière ne correspond aux filtres.</div>
                    )}
                    {filtered.map(m => {
                        const allColors = !m.scope?.colors?.length;
                        const allSizes = !m.scope?.sizes?.length;
                        return (
                            <div key={m.id} className="border border-slate-200 rounded-xl p-3 bg-white">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="min-w-0">
                                        <div className="font-bold text-slate-800 text-[13px] truncate">{m.name || '—'}</div>
                                        <div className="text-[11px] text-slate-400">
                                            {fmt(m.qty)} {m.unit} / pièce · s'applique à <span className="font-semibold text-slate-600">{fmt(scopeQty(m))}</span> pièces
                                        </div>
                                    </div>
                                    {(!allColors || !allSizes) && (
                                        <button onClick={() => resetMaterial(m)} className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 shrink-0">Toutes</button>
                                    )}
                                </div>

                                {/* Couleurs */}
                                {colors.length > 0 && (
                                    <div className="mb-2">
                                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1"><Palette className="w-3 h-3" /> Couleurs</div>
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

                                {/* Tailles */}
                                {sizes.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1"><Ruler className="w-3 h-3" /> Tailles</div>
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

                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1"><Layers className="w-3 h-3" /> Les changements sont appliqués en direct</span>
                    <button onClick={onClose} className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-semibold transition-colors">Terminé</button>
                </div>
            </div>
        </div>
    );
};

export default MaterialAssignment;
