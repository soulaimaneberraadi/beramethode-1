import React, { forwardRef } from 'react';
import { Building2, Package, Scissors, Tag, ArrowDown, FileText } from 'lucide-react';
import { Material, PurchasingData, AppSettings } from '../types';
import { fmt } from '../constants';
import SensitiveValue from './ui/SensitiveValue';

interface CompactCostSheetProps {
    t: any;
    currency: string;
    productName: string;
    displayDate: string;
    docRef: string;
    companyName: string;
    companyAddress: string;
    baseTime: number;
    cutTime: number;
    packTime: number;
    totalTime: number;
    settings: AppSettings;
    materials: Material[];
    laborCost: number;
    costPrice: number;
    sellPriceHT: number;
    sellPriceTTC: number;
    boutiquePrice: number;
    orderQty: number;
    wasteRate: number;
    purchasingData: PurchasingData[];
    totalPurchasingMatCost: number;
    productImage: string | null;
    soustraitanceActive?: boolean;
    stPrix?: number;
    stMode?: string;
    colors?: { id: string; name: string }[];
    gridQuantities?: Record<string, number>;
    sizes?: string[];
}

const CompactCostSheet = forwardRef<HTMLDivElement, CompactCostSheetProps>(({
    t, currency, productName, displayDate, docRef,
    companyName, companyAddress,
    baseTime, cutTime, packTime, totalTime, settings,
    materials, laborCost, costPrice, sellPriceHT, sellPriceTTC, boutiquePrice,
    orderQty, wasteRate, purchasingData, totalPurchasingMatCost,
    productImage, soustraitanceActive = false, stPrix = 0, stMode,
    colors = [], gridQuantities = {}, sizes = []
}, ref) => {

    const totalMaterials = materials.reduce((acc, m) => acc + m.unitPrice * m.qty, 0);

    const threadMats = materials.filter(m => m.unit === 'bobine');
    const otherMats = materials.filter(m => m.unit !== 'bobine');

    const pididoBreakdown = React.useMemo(() => {
        if (!colors.length || !materials.length) return [];
        const sizeCount = sizes.length;
        const commandeTotal = Object.values(gridQuantities).reduce((acc: number, v) => acc + (Number(v) || 0), 0);
        const factor = commandeTotal > 0 ? (orderQty / commandeTotal) : 1;
        const seen = new Set<string>();
        return colors.map(c => {
            if (seen.has(c.id)) return null;
            seen.add(c.id);
            let raw = 0;
            for (let s = 0; s < sizeCount; s++) raw += Number(gridQuantities[`${c.id}_${s}`] || 0);
            if (raw <= 0) return null;
            const scaled = raw * factor;
            const pieces = Math.round(scaled);
            const mats = materials.filter(m => {
                if (m.scope?.colors?.length) return m.scope.colors.includes(c.id);
                if (m.threadColor) return m.threadColor === c.name;
                return true;
            }).map(m => {
                const withWaste = m.qty * scaled * (1 + wasteRate / 100);
                const buyQty = (m.unit === 'bobine' || m.unit === 'pc') ? Math.ceil(withWaste) : parseFloat(withWaste.toFixed(2));
                return { id: m.id, name: m.name, unit: m.unit, buyQty, cost: buyQty * m.unitPrice };
            });
            const colorTotal = mats.reduce((s, m) => s + m.cost, 0);
            return { colorId: c.id, colorName: c.name, pieces, materials: mats, colorTotal };
        }).filter(Boolean) as Array<{ colorId: string; colorName: string; pieces: number; materials: Array<{ id: any; name: string; unit: string; buyQty: number; cost: number }>; colorTotal: number }>;
    }, [colors, gridQuantities, sizes, materials, orderQty, wasteRate]);

    const pididoGrandTotal = pididoBreakdown.reduce((s, p) => s + p.colorTotal, 0);

    const isMultiPage = orderQty > 0 && (purchasingData.length > 0 || pididoBreakdown.length > 0);

    const renderHeader = () => (
        <div className="flex justify-between items-start pb-4 mb-4 border-b-4 border-slate-900">
            <div className="flex gap-3 items-start">
                <div className="w-10 h-10 bg-slate-900 flex items-center justify-center rounded shrink-0">
                    <Building2 className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="text-md font-black text-slate-900 tracking-tight uppercase">
                        {companyName || 'BERAMETHODE SARL'}
                    </h1>
                    {companyAddress && (
                        <p className="text-[9px] text-slate-500 mt-0.5">{companyAddress}</p>
                    )}
                </div>
            </div>
            <div className="text-right">
                <div className="inline-block bg-slate-900 text-white px-4 py-1.5 rounded-lg mb-1.5">
                    <h2 className="text-xs font-black tracking-wider uppercase">Fiche de Coût</h2>
                </div>
                <div className="space-y-1">
                    <div className="flex justify-end gap-2.5 items-center">
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Date</span>
                        <span className="font-bold text-slate-700 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{displayDate}</span>
                    </div>
                    <div className="flex justify-end gap-2.5 items-center">
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Réf</span>
                        <span className="font-mono font-bold text-slate-800 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{docRef}</span>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderProductInfo = () => (
        <div className="flex gap-4 mb-4">
            <div className="flex-1 border border-slate-200 rounded-xl p-3 bg-slate-50 relative">
                <span className="absolute -top-2.5 left-3 bg-slate-50 px-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Désignation</span>
                <p className="font-black text-slate-900 text-xs">{productName || 'Article Non Défini'}</p>
                <div className="flex gap-3 mt-1.5">
                    <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-sm">
                        <span className="text-[7px] font-bold text-slate-400 uppercase block">Temps Total</span>
                        <span className="text-[10px] font-black text-slate-800">{fmt(totalTime)} min</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-sm">
                        <span className="text-[7px] font-bold text-slate-400 uppercase block">{soustraitanceActive ? 'Façon/pc' : 'Coût/Min'}</span>
                        <span className="text-[10px] font-black text-slate-800">{soustraitanceActive ? fmt(stPrix) : fmt(settings.costMinute)} {currency}</span>
                    </div>
                    {orderQty > 0 && (
                        <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-sm">
                            <span className="text-[7px] font-bold text-slate-400 uppercase block">Ordre</span>
                            <span className="text-[10px] font-black text-slate-800">{orderQty} pcs</span>
                        </div>
                    )}
                </div>
            </div>
            {productImage && (
                <div className="w-16 h-16 shrink-0 border border-slate-200 rounded-xl p-1 bg-white flex items-center justify-center">
                    <img src={productImage} alt="Modèle" className="w-full h-full object-contain rounded" />
                </div>
            )}
        </div>
    );

    const renderNomenclature = () => (
        <div className="mb-4">
            <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-900 mb-1.5 flex items-center gap-1.5">
                <Package className="w-3 h-3 text-slate-400" /> Nomenclature
            </h3>
            <table className="w-full border-collapse" style={{ borderSpacing: 0 }}>
                <thead>
                    <tr className="bg-slate-900 text-white">
                        <th className="p-2 text-left font-black text-[8px] uppercase tracking-wider rounded-tl-lg">Composant</th>
                        <th className="p-2 text-center font-black text-[8px] uppercase tracking-wider">Fournisseur</th>
                        <th className="p-2 text-center font-black text-[8px] uppercase tracking-wider">Prix U.</th>
                        <th className="p-2 text-center font-black text-[8px] uppercase tracking-wider">Qté</th>
                        <th className="p-2 text-right font-black text-[8px] uppercase tracking-wider rounded-tr-lg">Montant</th>
                    </tr>
                </thead>
                <tbody>
                    {otherMats.length > 0 && (
                        <>
                            <tr className="bg-slate-100">
                                <td colSpan={5} className="px-2 py-0.5 text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                                    Matières Premières
                                </td>
                            </tr>
                            {otherMats.map((m, i) => (
                                <tr key={m.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                    <td className="p-2 font-bold text-slate-800">{m.name || '-'}</td>
                                    <td className="p-2 text-center text-[9px] text-slate-500">{m.fournisseur || '—'}</td>
                                    <td className="p-2 text-center text-[9px]">{m.unitPrice.toFixed(2)}</td>
                                    <td className="p-2 text-center font-mono text-[9px]">{fmt(m.qty)} <span className="text-[8px] text-slate-400">{m.unit}</span></td>
                                    <td className="p-2 text-right font-bold text-slate-800">{fmt(m.unitPrice * m.qty)}</td>
                                </tr>
                            ))}
                        </>
                    )}

                    {threadMats.length > 0 && (
                        <>
                            <tr className="bg-slate-100">
                                <td colSpan={5} className="px-2 py-0.5 text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                                    Fils
                                </td>
                            </tr>
                            {threadMats.map((m, i) => (
                                <tr key={m.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                    <td className="p-2 font-bold text-slate-800">
                                        {m.name || '-'}
                                        {m.threadColor && <span className="text-[8px] text-slate-400 ml-1">({m.threadColor})</span>}
                                    </td>
                                    <td className="p-2 text-center text-[9px] text-slate-500">{m.fournisseur || '—'}</td>
                                    <td className="p-2 text-center text-[9px]">{m.unitPrice.toFixed(2)}</td>
                                    <td className="p-2 text-center font-mono text-[9px]">{fmt(m.qty)} <span className="text-[8px] text-slate-400">{m.unit}</span></td>
                                    <td className="p-2 text-right font-bold text-slate-800">{fmt(m.unitPrice * m.qty)}</td>
                                </tr>
                            ))}
                        </>
                    )}

                    <tr className="bg-blue-50 border-b border-blue-200">
                        <td className="p-2 font-bold text-blue-800" colSpan={3}>
                            <div className="flex items-center gap-1">
                                <Scissors className="w-3 h-3" />
                                <span>{soustraitanceActive ? `Sous-traitance (${stMode === 'complet' ? 'Tout compris' : 'Façon'})` : `Main d'Œuvre (${fmt(totalTime)} × ${settings.costMinute})`}</span>
                            </div>
                        </td>
                        <td className="p-2 text-center text-[9px] text-blue-600">
                            {!soustraitanceActive && (
                                <span>{fmt(baseTime)}+{fmt(cutTime)}+{fmt(packTime)} min</span>
                            )}
                        </td>
                        <td className="p-2 text-right font-black text-blue-800">{fmt(laborCost)} {currency}</td>
                    </tr>

                    <tr className="bg-slate-900 text-white">
                        <td className="p-2 font-black text-[9px] uppercase tracking-wider rounded-bl-lg" colSpan={4}>Total Nomenclature</td>
                        <td className="p-2 text-right font-black text-xs rounded-br-lg">{fmt(totalMaterials + laborCost)} {currency}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );

    const renderPricingSummary = () => (
        <div className="flex gap-4 mb-4">
            <div className="flex-1 border-2 border-slate-900 rounded-xl overflow-hidden">
                <div className="bg-slate-900 text-white px-3.5 py-2 flex justify-between items-center">
                    <span className="font-black uppercase tracking-widest text-[8px] text-slate-400">Coût de Revient</span>
                    <span className="text-sm font-black tabular-nums"><SensitiveValue field="model.prix_revient">{fmt(costPrice)} <span className="text-[8px] opacity-50">{currency}</span></SensitiveValue></span>
                </div>
                <div className="bg-white px-3.5 py-2.5 space-y-1.5">
                    <div className="flex justify-between items-center pb-1.5 border-b border-slate-100">
                        <span className="text-[9px] font-bold uppercase text-slate-600">Prix Vente HT <span className="text-slate-400">+{settings.marginAtelier}%</span></span>
                        <span className="font-bold text-xs text-slate-800">{fmt(sellPriceHT)} {currency}</span>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-slate-100">
                        <span className="text-[9px] font-bold uppercase text-slate-600">Prix Vente TTC <span className="text-slate-400">+{settings.tva}%</span></span>
                        <span className="font-bold text-xs text-slate-900">{fmt(sellPriceTTC)} {currency}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[8px] font-bold uppercase text-slate-400">Prix Boutique <span className="text-slate-300">+{settings.marginBoutique}%</span></span>
                        <span className="font-black text-xs text-slate-400">{fmt(boutiquePrice)} {currency}</span>
                    </div>
                </div>
            </div>

            <div className="w-44 border border-slate-200 rounded-xl p-3 bg-slate-50">
                <h4 className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-2 text-center">Répartition PR</h4>
                <div className="space-y-1.5">
                    <div>
                        <div className="flex justify-between text-[9px] mb-0.5">
                            <span className="text-slate-600 font-medium">Matières</span>
                            <span className="font-bold text-slate-800">{fmt(totalMaterials)}</span>
                        </div>
                        <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${costPrice > 0 ? (totalMaterials / costPrice) * 100 : 0}%` }} />
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between text-[9px] mb-0.5">
                            <span className="text-slate-600 font-medium">{soustraitanceActive ? 'Façon' : 'Main d\'œuvre'}</span>
                            <span className="font-bold text-slate-800">{fmt(laborCost)}</span>
                        </div>
                        <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-slate-400 rounded-full" style={{ width: `${costPrice > 0 ? (laborCost / costPrice) * 100 : 0}%` }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderSignatures = () => (
        <div className="mt-5 pt-3 border-t border-slate-200 flex justify-between">
            <div className="w-[35%] text-center">
                <div className="border-t border-slate-300 pt-1.5">
                    <span className="text-[8px] font-bold uppercase text-slate-400">Responsable</span>
                </div>
            </div>
            <div className="w-[35%] text-center">
                <div className="border-t border-slate-300 pt-1.5">
                    <span className="text-[8px] font-bold uppercase text-slate-400">Direction</span>
                </div>
            </div>
        </div>
    );

    const renderPageFooter = (pageStr: string) => (
        <div className="mt-auto pt-2 border-t border-slate-100 flex justify-between items-center text-[8px] font-bold tracking-widest text-slate-300 uppercase">
            <span>BeraMethode ERP — {displayDate}</span>
            <span>{pageStr}</span>
        </div>
    );

    return (
        <div
            ref={ref}
            className="compact-cost-sheet w-full max-w-[210mm] mx-auto bg-white text-slate-800"
            style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px' }}
        >
            <style>{`
                .compact-cost-sheet-page {
                    box-sizing: border-box;
                    width: 100%;
                    min-height: 1123px; /* Standard A4 height */
                    padding: 40px 50px;
                    position: relative;
                    background-color: white;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }
                .page-break {
                    page-break-before: always !important;
                    break-before: page !important;
                }
                @media screen {
                    /* Only display the active page when in the preview modal */
                    .active-page-1 .compact-cost-sheet-page.sheet-page-2 {
                        display: none !important;
                    }
                    .active-page-2 .compact-cost-sheet-page.sheet-page-1 {
                        display: none !important;
                    }
                }
                @media print {
                    .compact-cost-sheet-page {
                        min-height: 0 !important;
                        height: 297mm !important;
                        padding: 0 !important;
                    }
                    .compact-cost-sheet-page + .compact-cost-sheet-page {
                        border-top: none !important;
                        margin-top: 0 !important;
                        padding-top: 0 !important;
                    }
                }
            `}</style>

            {!isMultiPage ? (
                /* ── SINGLE PAGE LAYOUT (1/1) ── */
                <div className="compact-cost-sheet-page sheet-page-1">
                    <div>
                        {renderHeader()}
                        {renderProductInfo()}
                        {renderNomenclature()}
                        {renderPricingSummary()}
                        {renderSignatures()}
                    </div>
                    {renderPageFooter('Page 1/1')}
                </div>
            ) : (
                /* ── MULTI PAGE LAYOUT (1/2 & 2/2) ── */
                <>
                    {/* PAGE 1/2 */}
                    <div className="compact-cost-sheet-page sheet-page-1">
                        <div>
                            {renderHeader()}
                            {renderProductInfo()}
                            {renderNomenclature()}
                            {renderPricingSummary()}
                        </div>
                        {renderPageFooter('Page 1/2')}
                    </div>

                    {/* PAGE 2/2 */}
                    <div className="compact-cost-sheet-page sheet-page-2 page-break">
                        <div>
                            {/* Simple Page 2 Header */}
                            <div className="flex justify-between items-center pb-2 mb-4 border-b border-slate-200">
                                <div className="flex items-center gap-1">
                                    <Building2 className="w-3 h-3 text-slate-400" />
                                    <span className="font-black text-[8px] uppercase tracking-wider text-slate-400">{companyName || 'BERAMETHODE SARL'}</span>
                                </div>
                                <span className="font-bold text-slate-700 text-[9px] uppercase">Fiche de Coût — Détails d'Achat ({docRef})</span>
                                <span className="font-mono text-slate-500 text-[8px]">{displayDate}</span>
                            </div>

                            {/* PRÉVISIONS ACHAT */}
                            {purchasingData.length > 0 && (
                                <div className="mb-4">
                                    <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-900 mb-1.5 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                            <Package className="w-3 h-3 text-slate-400" /> Prévisions Achat
                                        </span>
                                        <div className="flex gap-2 font-semibold text-[8px] tracking-normal">
                                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Ordre: {orderQty}</span>
                                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Déchet: {wasteRate}%</span>
                                        </div>
                                    </h3>
                                    <table className="w-full border-collapse" style={{ borderSpacing: 0 }}>
                                        <thead>
                                            <tr className="bg-slate-200">
                                                <th className="p-1.5 text-left font-black text-[8px] uppercase tracking-wider text-slate-600 rounded-tl-lg">Matière</th>
                                                <th className="p-1.5 text-center font-black text-[8px] uppercase tracking-wider text-slate-600">Unité</th>
                                                <th className="p-1.5 text-center font-black text-[8px] uppercase tracking-wider text-slate-600">Qté/Pièce</th>
                                                <th className="p-1.5 text-center font-black text-[8px] uppercase tracking-wider text-slate-600">Qté À Acheter</th>
                                                <th className="p-1.5 text-right font-black text-[8px] uppercase tracking-wider text-slate-600 rounded-tr-lg">Budget</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {purchasingData.map((m, i) => (
                                                <tr key={m.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                    <td className="p-1.5 font-bold text-slate-800">{m.name}</td>
                                                    <td className="p-1.5 text-center text-[9px] text-slate-500">{m.unit}</td>
                                                    <td className="p-1.5 text-center font-mono text-[9px]">{fmt(m.qty)}</td>
                                                    <td className="p-1.5 text-center font-mono text-[9px] font-bold">{fmt(m.qtyToBuy)}</td>
                                                    <td className="p-1.5 text-right font-bold text-slate-800">{fmt(m.lineCost)} {currency}</td>
                                                </tr>
                                            ))}
                                            <tr className="bg-slate-900 text-white">
                                                <td colSpan={4} className="p-1.5 text-right font-black text-[8px] uppercase tracking-wider rounded-bl-lg">Budget Total:</td>
                                                <td className="p-1.5 text-right font-black text-xs rounded-br-lg">{fmt(totalPurchasingMatCost)} {currency}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* ACHATS PAR PIDIDO */}
                            {pididoBreakdown.length > 0 && (
                                <div className="mb-4">
                                    <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-900 mb-1.5 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                            <Tag className="w-3 h-3 text-slate-400" /> Achats par PIDIDO
                                        </span>
                                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold text-[8px] tracking-normal">{pididoBreakdown.length} couleurs</span>
                                    </h3>

                                    <div className="grid grid-cols-1 gap-2">
                                        {pididoBreakdown.map(pg => {
                                            const hex = pg.colorId && pg.colorId.startsWith('#') ? pg.colorId : null;
                                            return (
                                                <div key={pg.colorId} className="border border-slate-200 rounded-lg overflow-hidden" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                                    <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border-b border-slate-200">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="w-2 h-2 rounded-full border border-slate-300" style={hex ? { backgroundColor: hex } : { backgroundColor: '#94a3b8' }} />
                                                            <span className="font-bold text-slate-800 text-[10px]">{pg.colorName}</span>
                                                            <span className="text-[8px] text-slate-400">· {pg.pieces} pcs</span>
                                                        </div>
                                                        <span className="font-black text-slate-800 text-[10px] tabular-nums">{fmt(pg.colorTotal)} {currency}</span>
                                                    </div>
                                                    <table className="w-full border-collapse" style={{ borderSpacing: 0 }}>
                                                        <tbody>
                                                            {pg.materials.map((m, i) => (
                                                                <tr key={m.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                                                                    <td className="px-2.5 py-1 font-medium text-slate-700 text-[9px]">{m.name || '-'}</td>
                                                                    <td className="px-2 py-1 text-center text-[8px] text-slate-400">{m.unit}</td>
                                                                    <td className="px-2 py-1 text-center font-mono text-[9px] text-slate-600">{fmt(m.buyQty)}</td>
                                                                    <td className="px-2.5 py-1 text-right font-bold text-slate-800 text-[9px] tabular-nums">{fmt(m.cost)} {currency}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            );
                                        })}

                                        <div className="flex justify-between items-center bg-slate-900 text-white px-2.5 py-1.5 rounded-lg" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                            <span className="font-black text-[8px] uppercase tracking-wider">Budget total (par PIDIDO)</span>
                                            <span className="font-black text-xs tabular-nums">{fmt(pididoGrandTotal)} {currency}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {renderSignatures()}
                        </div>
                        {renderPageFooter('Page 2/2')}
                    </div>
                </>
            )}
        </div>
    );
});

CompactCostSheet.displayName = 'CompactCostSheet';
export default CompactCostSheet;
