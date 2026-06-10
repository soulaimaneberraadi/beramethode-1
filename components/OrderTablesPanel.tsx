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

const BADGE_COLORS = [
    { dot: 'bg-rose-500' },
    { dot: 'bg-sky-500' },
    { dot: 'bg-amber-500' },
    { dot: 'bg-emerald-500' },
    { dot: 'bg-violet-500' },
    { dot: 'bg-orange-500' },
    { dot: 'bg-cyan-500' },
    { dot: 'bg-pink-500' },
];

/**
 * Tables récupérées de l'ancienne page « Ordre de production » et intégrées à la
 * Fiche de Coût : la grille couleurs × tailles avec coûts, et le « sellem » des prix.
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

    return (
        <div dir="rtl" className="space-y-6">

            {/* ── جدول التوزيع وتكلفة القياسات ── */}
            {colors.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                        <div className="bg-violet-100 p-2 rounded-lg">
                            <Palette className="w-5 h-5 text-violet-600" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 text-base">جدول التوزيع وتكلفة القياسات</h3>
                            <p className="text-xs text-slate-500">توزيع الكميات والتكاليف المحسوبة (تتحدّث تلقائياً مع الفيش تكنيك)</p>
                        </div>
                    </div>

                    <div className="p-4 overflow-x-auto">
                        <table className="w-full text-sm border-collapse rounded-xl overflow-hidden border border-slate-200">
                            <thead>
                                <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-xs uppercase tracking-wider">
                                    <th className="py-4 px-4 text-right font-black border-l border-slate-200 min-w-[140px]">اللون \ القياس</th>
                                    {sizes.length === 0 && (
                                        <th className="py-4 px-4 text-center font-normal italic text-slate-400 border-l border-slate-200">
                                            لم يتم تحديد قياسات
                                        </th>
                                    )}
                                    {sizes.map((s, i) => (
                                        <th key={i} className="py-4 px-3 text-center font-black border-l border-slate-200 text-indigo-700 min-w-[90px]">
                                            {s}
                                        </th>
                                    ))}
                                    <th className="py-4 px-4 text-center font-black bg-slate-200 text-slate-800 w-24">المجموع</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {colors.map((c, cIdx) => {
                                    const rowTotalCost = (matrixStats.rowTotals[c.id] || 0) * prFor(c.id);
                                    const cHex = c.id && c.id.startsWith('#') ? c.id : null;
                                    const palette = BADGE_COLORS[cIdx % BADGE_COLORS.length];
                                    return (
                                        <tr key={`${c.id}-${cIdx}`} className="hover:bg-indigo-50/20 group">
                                            <td className="py-3 px-4 border-l border-slate-200 font-bold text-slate-800">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className={`w-3 h-3 rounded-full shadow-sm ${cHex ? '' : palette.dot}`}
                                                        style={cHex ? { backgroundColor: cHex } : undefined}
                                                    />
                                                    <span className="truncate max-w-[120px]">{c.name}</span>
                                                </div>
                                            </td>
                                            {sizes.length === 0 && (
                                                <td className="py-3 px-4 border-l border-slate-100 bg-slate-50/50 text-center text-slate-400 text-xl font-light">-</td>
                                            )}
                                            {sizes.map((_, sIdx) => {
                                                const key = `${c.id}_${sIdx}`;
                                                const val = gridQuantities[key] || '';
                                                const qty = Number(val) || 0;
                                                const cost = qty * prFor(c.id);
                                                return (
                                                    <td key={sIdx} className="p-0 border-l border-slate-100 bg-white hover:bg-indigo-50/50 transition-colors relative">
                                                        <input
                                                            type="number" min="0"
                                                            className="w-full text-center py-3 bg-transparent outline-none focus:text-indigo-700 font-bold text-base placeholder:text-slate-200"
                                                            placeholder="0"
                                                            value={val}
                                                            onChange={(e) => updateQuantity(c.id, sIdx, e.target.value)}
                                                        />
                                                        {qty > 0 && (
                                                            <div className="absolute bottom-1 left-0 right-0 text-center pointer-events-none">
                                                                <span className="text-[9px] font-bold text-slate-400 bg-white/80 px-1 rounded-sm">
                                                                    {fmt(cost)} {currency}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="py-3 px-4 text-center border-l border-slate-200 bg-slate-50 relative group-hover:bg-slate-100 transition-colors">
                                                <div className="font-black text-slate-800 text-lg">{matrixStats.rowTotals[c.id] || 0}</div>
                                                {(matrixStats.rowTotals[c.id] || 0) > 0 && (
                                                    <div className="text-[10px] font-bold text-indigo-500 mt-0.5">
                                                        {fmt(rowTotalCost)} {currency}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t border-slate-200 bg-slate-50">
                                <tr>
                                    <td className="py-4 px-4 text-left font-black text-slate-600 border-l border-slate-200">
                                        الإجمالي
                                    </td>
                                    {sizes.length === 0 && (
                                        <td className="py-3 px-4 text-center text-slate-400 border-l border-slate-200">-</td>
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
                                            <td key={sIdx} className="py-3 px-3 text-center border-l border-slate-200">
                                                <div className="font-black text-slate-700">{colTotal}</div>
                                                {colTotal > 0 && (
                                                    <div className="text-[9px] font-bold text-slate-500">{fmt(colCost)} {currency}</div>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="py-3 px-4 text-center bg-indigo-600 text-white shadow-inner relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-full h-full bg-indigo-500/30 transform -skew-x-12 translate-x-4"></div>
                                        <div className="relative z-10 font-black text-xl">{matrixStats.grandTotal}</div>
                                        <div className="relative z-10 text-[10px] text-indigo-200 font-bold tracking-wider uppercase mt-1">القطع</div>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* ── سلم الأسعار ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                    <div className="bg-indigo-100 p-2 rounded-lg">
                        <Layers className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h3 className="font-black text-slate-800 text-base">سلم الأسعار</h3>
                </div>
                <div className="p-5">
                    {colors.length > 0 && hasColorCosts ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                        <th className="py-2 px-3 text-right font-black">اللون</th>
                                        <th className="py-2 px-3 text-center font-bold">PR</th>
                                        <th className="py-2 px-3 text-center font-bold text-blue-700">HT +{settings.marginAtelier}%</th>
                                        <th className="py-2 px-3 text-center font-bold text-indigo-700">TTC +{settings.tva}%</th>
                                        <th className="py-2 px-3 text-center font-bold text-violet-700">المحل +{settings.marginBoutique}%</th>
                                        <th className="py-2 px-3 text-center font-bold text-emerald-700">ربح/قطعة</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(() => {
                                        const seenL = new Set<string>();
                                        return colors.filter(c => { if (seenL.has(c.id)) return false; seenL.add(c.id); return true; }).map((c, cIdx) => {
                                            const cc = colorCosts![c.id] || { pr: costPrice, ht: sellPriceHT, ttc: sellPriceTTC, boutique: boutiquePrice };
                                            const cHex = c.id && c.id.startsWith('#') ? c.id : null;
                                            const palette = BADGE_COLORS[cIdx % BADGE_COLORS.length];
                                            return (
                                                <tr key={c.id} className="hover:bg-slate-50">
                                                    <td className="py-2.5 px-3 font-bold text-slate-800">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-3 h-3 rounded-full shadow-sm ${cHex ? '' : palette.dot}`} style={cHex ? { backgroundColor: cHex } : undefined} />
                                                            <span className="truncate max-w-[120px]">{c.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center font-black text-slate-800">{fmt(cc.pr)}</td>
                                                    <td className="py-2.5 px-3 text-center font-bold text-blue-700">{fmt(cc.ht)}</td>
                                                    <td className="py-2.5 px-3 text-center font-bold text-indigo-700">{fmt(cc.ttc)}</td>
                                                    <td className="py-2.5 px-3 text-center font-bold text-violet-700">{fmt(cc.boutique)}</td>
                                                    <td className="py-2.5 px-3 text-center font-black text-emerald-700">{fmt(cc.ht - cc.pr)}</td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                            <p className="text-[10px] text-slate-400 mt-2">Prix en {currency}. Chaque couleur reflète ses matières affectées (ex: dentelle).</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {[
                                { label: 'سعر التكلفة (PR)', value: costPrice, color: 'text-slate-800' },
                                { label: `سعر البيع HT (+${settings.marginAtelier}%)`, value: sellPriceHT, color: 'text-blue-700' },
                                { label: `سعر البيع TTC (+${settings.tva}%)`, value: sellPriceTTC, color: 'text-indigo-700' },
                                { label: `سعر المحل (+${settings.marginBoutique}%)`, value: boutiquePrice, color: 'text-violet-700' },
                                { label: 'ربح المصنع / قطعة', value: sellPriceHT - costPrice, color: 'text-emerald-700' },
                            ].map((item, i) => (
                                <div key={i} className="text-center p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-white hover:border-slate-200 hover:shadow-sm transition-all">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{item.label}</p>
                                    <p className={`text-xl font-black ${item.color}`}>{fmt(item.value)} <span className="text-[10px] text-slate-400">{currency}</span></p>
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
