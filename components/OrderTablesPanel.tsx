import React from 'react';
import { Palette, Layers } from 'lucide-react';
import { FicheData, AppSettings } from '../types';
import { fmt } from '../constants';

interface OrderTablesPanelProps {
    ficheData: FicheData;
    setFicheData: React.Dispatch<React.SetStateAction<FicheData>>;
    currency: string;
    settings: AppSettings;
    laborCost: number;
    costPrice: number;
    sellPriceHT: number;
    sellPriceTTC: number;
    boutiquePrice: number;
    totalPurchasingMatCost: number;
    /** Coûts par couleur (PR/HT/TTC/boutique) selon les matières affectées. */
    colorCosts?: Record<string, { matCost: number; pr: number; ht: number; ttc: number; boutique: number }>;
    isExport?: boolean;
}

const DOT_COLORS = ['bg-rose-400', 'bg-sky-400', 'bg-amber-400', 'bg-emerald-400', 'bg-violet-400', 'bg-orange-400', 'bg-cyan-400', 'bg-pink-400'];

/**
 * Tables récupérées de l'ancienne page « Ordre de production » et intégrées à la
 * Fiche de Coût : la grille couleurs × tailles avec coûts, et le « sellem » des prix.
 * Design aligné sur le langage calme de l'app (style Planning : slate, compact, sans dégradés).
 */
const OrderTablesPanel: React.FC<OrderTablesPanelProps> = ({
    ficheData, setFicheData, currency, settings,
    laborCost, costPrice, sellPriceHT, sellPriceTTC, boutiquePrice,
    totalPurchasingMatCost, colorCosts, isExport = false,
}) => {
    const orderQty = ficheData.quantity > 0 ? ficheData.quantity : 1;
    const totalProjectCost = isExport ? (laborCost * orderQty) : totalPurchasingMatCost + (laborCost * orderQty);
    const costPerPiece = orderQty > 0 ? totalProjectCost / orderQty : 0;

    const sizes = ficheData.sizes || [];
    const colors = ficheData.colors || [];
    const gridQuantities = ficheData.gridQuantities || {};

    // Coût de revient d'UNE pièce de cette couleur (matières affectées + main
    // d'œuvre). Fallback sur le coût moyen si aucun détail par couleur.
    const prFor = (colorId: string): number => colorCosts?.[colorId]?.pr ?? costPerPiece;
    const hasColorCosts = !!colorCosts && Object.keys(colorCosts).length > 0;

    // Statistiques de la grille. On ignore les couleurs en double (même id → même
    // grille) pour ne pas compter deux fois la même quantité.
    const matrixStats = React.useMemo(() => {
        let grandTotal = 0;
        const rowTotals: Record<string, number> = {};
        const colTotals: number[] = new Array(sizes.length).fill(0);
        const seen = new Set<string>();

        colors.forEach(c => {
            if (seen.has(c.id)) return;
            seen.add(c.id);
            let rowSum = 0;
            sizes.forEach((_, sIdx) => {
                const q = gridQuantities[`${c.id}_${sIdx}`] || 0;
                rowSum += q;
                colTotals[sIdx] += q;
                grandTotal += q;
            });
            rowTotals[c.id] = rowSum;
        });
        return { grandTotal, rowTotals, colTotals };
    }, [sizes, colors, gridQuantities]);

    const updateQuantity = (colorId: string, sizeIndex: number, value: string) => {
        const numValue = value === '' ? 0 : parseInt(value);
        if (isNaN(numValue)) return;
        setFicheData(prev => {
            const newQs = { ...(prev.gridQuantities || {}), [`${colorId}_${sizeIndex}`]: numValue };
            let newTotal = 0;
            Object.values(newQs).forEach(v => newTotal += Number(v));
            return { ...prev, gridQuantities: newQs, quantity: newTotal > 0 ? newTotal : 1 };
        });
    };

    // Un zéro « vide » ne s'affiche pas en chiffre : on met un tiret discret.
    const dash = <span className="text-slate-300">—</span>;

    return (
        <div className="space-y-6">

            {/* ── Répartition et coût des tailles ── */}
            {colors.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-3 sm:px-5 h-auto sm:h-12 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 py-2 sm:py-0">
                        <Palette className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={1.75} />
                        <div>
                            <h3 className="text-[13px] font-semibold text-slate-900 tracking-tight">Répartition et coût des tailles</h3>
                            <p className="text-[11px] text-slate-400">Répartition des quantités et des coûts (synchronisé avec la fiche technique)</p>
                        </div>
                    </div>

                    <div className="p-3 sm:p-4 overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50/60 text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-200">
                                    <th className="py-2.5 px-3 text-left font-semibold border-r border-slate-100 min-w-[140px]">Couleur \ Taille</th>
                                    {sizes.length === 0 && (
                                        <th className="py-2.5 px-3 text-center font-normal italic text-slate-400 border-r border-slate-100">
                                            Aucune taille définie
                                        </th>
                                    )}
                                    {sizes.map((s, i) => (
                                        <th key={i} className="py-2.5 px-3 text-center font-semibold border-r border-slate-100 text-slate-700 min-w-[80px]">
                                            {s}
                                        </th>
                                    ))}
                                    <th className="py-2.5 px-3 text-center font-semibold text-slate-700 bg-slate-100/60 w-24">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {colors.map((c, cIdx) => {
                                    const rowTotal = matrixStats.rowTotals[c.id] || 0;
                                    const rowTotalCost = rowTotal * prFor(c.id);
                                    const cHex = c.id && c.id.startsWith('#') ? c.id : null;
                                    const dot = DOT_COLORS[cIdx % DOT_COLORS.length];
                                    return (
                                        <tr key={`${c.id}-${cIdx}`} className="hover:bg-slate-50/50 group">
                                            <td className="py-2.5 px-3 border-r border-slate-100 font-medium text-slate-700 text-[12px]">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className={`w-2.5 h-2.5 rounded-full ${cHex ? '' : dot}`}
                                                        style={cHex ? { backgroundColor: cHex } : undefined}
                                                    />
                                                    <span className="truncate max-w-[120px]">{c.name}</span>
                                                </div>
                                            </td>
                                            {sizes.length === 0 && (
                                                <td className="py-2.5 px-3 border-r border-slate-100 bg-slate-50/40 text-center text-slate-300">—</td>
                                            )}
                                            {sizes.map((_, sIdx) => {
                                                const key = `${c.id}_${sIdx}`;
                                                const val = gridQuantities[key] || '';
                                                const qty = Number(val) || 0;
                                                const cost = qty * prFor(c.id);
                                                return (
                                                    <td key={sIdx} className="p-0 border-r border-slate-100 hover:bg-slate-50 transition-colors relative">
                                                        <input
                                                            type="number" min="0"
                                                            className="w-full text-center py-2.5 bg-transparent outline-none focus:text-[#2149C1] font-semibold text-[13px] text-slate-700 placeholder:text-slate-300 tabular-nums"
                                                            placeholder="—"
                                                            value={val}
                                                            onChange={(e) => updateQuantity(c.id, sIdx, e.target.value)}
                                                        />
                                                        {qty > 0 && (
                                                            <div className="absolute bottom-0.5 left-0 right-0 text-center pointer-events-none">
                                                                <span className="text-[9px] font-medium text-slate-400 tabular-nums">
                                                                    {fmt(cost)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="py-2.5 px-3 text-center border-r border-slate-100 bg-slate-50/60 group-hover:bg-slate-100/60 transition-colors">
                                                <div className="font-semibold text-slate-800 text-[14px] tabular-nums">{rowTotal > 0 ? rowTotal : dash}</div>
                                                {rowTotal > 0 && (
                                                    <div className="text-[10px] font-medium text-slate-400 mt-0.5 tabular-nums">
                                                        {fmt(rowTotalCost)} {currency}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t border-slate-200 bg-slate-50/60">
                                <tr>
                                    <td className="py-2.5 px-3 text-left font-semibold text-slate-500 text-[11px] uppercase tracking-wider border-r border-slate-100">
                                        Total général
                                    </td>
                                    {sizes.length === 0 && (
                                        <td className="py-2.5 px-3 text-center text-slate-300 border-r border-slate-100">—</td>
                                    )}
                                    {sizes.map((_, sIdx) => {
                                        const colTotal = matrixStats.colTotals[sIdx] || 0;
                                        const seenC = new Set<string>();
                                        const colCost = colors.reduce((s, col) => {
                                            if (seenC.has(col.id)) return s;
                                            seenC.add(col.id);
                                            const q = Number(gridQuantities[`${col.id}_${sIdx}`] || 0);
                                            return s + q * prFor(col.id);
                                        }, 0);
                                        return (
                                            <td key={sIdx} className="py-2.5 px-3 text-center border-r border-slate-100">
                                                <div className="font-semibold text-slate-700 text-[13px] tabular-nums">{colTotal > 0 ? colTotal : dash}</div>
                                                {colTotal > 0 && (
                                                    <div className="text-[9px] font-medium text-slate-400 tabular-nums">{fmt(colCost)}</div>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="py-2.5 px-3 text-center bg-slate-900">
                                        <div className="font-semibold text-white text-[15px] tabular-nums">{matrixStats.grandTotal > 0 ? matrixStats.grandTotal : '—'}</div>
                                        <div className="text-[9px] text-slate-400 font-medium tracking-wider uppercase mt-0.5">pièces</div>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Grille tarifaire ── */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-3 sm:px-5 h-12 border-b border-slate-100 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    <h3 className="text-[13px] font-semibold text-slate-900 tracking-tight">Grille tarifaire</h3>
                </div>
                <div className="p-3 sm:p-5">
                    {colors.length > 0 && hasColorCosts ? (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                        <th className="py-2 px-3 text-left font-semibold">Couleur</th>
                                        <th className="py-2 px-3 text-center font-semibold">PR</th>
                                        <th className="py-2 px-3 text-center font-semibold text-[#2149C1]">HT +{settings.marginAtelier}%</th>
                                        <th className="py-2 px-3 text-center font-semibold text-indigo-600">TTC +{settings.tva}%</th>
                                        <th className="py-2 px-3 text-center font-semibold text-violet-600">Boutique +{settings.marginBoutique}%</th>
                                        <th className="py-2 px-3 text-center font-semibold text-emerald-600">Marge/pièce</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(() => {
                                        const seenL = new Set<string>();
                                        return colors.filter(c => { if (seenL.has(c.id)) return false; seenL.add(c.id); return true; }).map((c, cIdx) => {
                                            const cc = colorCosts![c.id] || { pr: costPrice, ht: sellPriceHT, ttc: sellPriceTTC, boutique: boutiquePrice };
                                            const cHex = c.id && c.id.startsWith('#') ? c.id : null;
                                            const dot = DOT_COLORS[cIdx % DOT_COLORS.length];
                                            return (
                                                <tr key={c.id} className="hover:bg-slate-50/50">
                                                    <td className="py-2.5 px-3 font-medium text-slate-700 text-[12px]">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-2.5 h-2.5 rounded-full ${cHex ? '' : dot}`} style={cHex ? { backgroundColor: cHex } : undefined} />
                                                            <span className="truncate max-w-[120px]">{c.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center font-semibold text-slate-800 tabular-nums">{fmt(cc.pr)}</td>
                                                    <td className="py-2.5 px-3 text-center font-medium text-[#2149C1] tabular-nums">{fmt(cc.ht)}</td>
                                                    <td className="py-2.5 px-3 text-center font-medium text-indigo-600 tabular-nums">{fmt(cc.ttc)}</td>
                                                    <td className="py-2.5 px-3 text-center font-medium text-violet-600 tabular-nums">{fmt(cc.boutique)}</td>
                                                    <td className="py-2.5 px-3 text-center font-semibold text-emerald-600 tabular-nums">{fmt(cc.ht - cc.pr)}</td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                            <p className="text-[10px] text-slate-400 mt-2.5">Prix en {currency}. Chaque couleur reflète ses matières affectées (ex: dentelle).</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {[
                                { label: 'Prix de revient (PR)', value: costPrice, color: 'text-slate-800' },
                                { label: `Prix de vente HT (+${settings.marginAtelier}%)`, value: sellPriceHT, color: 'text-[#2149C1]' },
                                { label: `Prix de vente TTC (+${settings.tva}%)`, value: sellPriceTTC, color: 'text-indigo-600' },
                                { label: `Prix boutique (+${settings.marginBoutique}%)`, value: boutiquePrice, color: 'text-violet-600' },
                                { label: 'Marge usine / pièce', value: sellPriceHT - costPrice, color: 'text-emerald-600' },
                            ].map((item, i) => (
                                <div key={i} className="text-center p-3 rounded-md bg-slate-50/60 border border-slate-200 hover:bg-white hover:border-slate-300 transition-all">
                                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">{item.label}</p>
                                    <p className={`text-[16px] font-semibold ${item.color} tabular-nums`}>{fmt(item.value)} <span className="text-[10px] text-slate-400">{currency}</span></p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OrderTablesPanel;
