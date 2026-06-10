import React, { useState, useEffect } from 'react';
import { ShoppingCart, Percent, Banknote, Clock, Package, TrendingUp, Info, AlertTriangle, Truck, PlusCircle, Search, X } from 'lucide-react';
import { PurchasingData } from '../types';
import { fmt } from '../constants';

interface OrderSimulationProps {
    t: any;
    currency: string;
    darkMode: boolean;
    orderQty: number;
    setOrderQty: (v: number) => void;
    wasteRate: number;
    setWasteRate: (v: number) => void;
    deductStock: () => void;
    purchasingData: PurchasingData[];
    totalPurchasingMatCost: number;
    laborCost: number;
    textSecondary: string;
    textPrimary: string;
    bgCard: string;
    isExport?: boolean;
}

const OrderSimulation: React.FC<OrderSimulationProps> = ({
    t, currency, darkMode, orderQty, setOrderQty, wasteRate, setWasteRate,
    deductStock,
    purchasingData, totalPurchasingMatCost, laborCost,
    textSecondary, textPrimary, bgCard,
    isExport = false
}) => {
    const activeQtyToSimulate = orderQty;
    const totalProjectCost = isExport ? (laborCost * activeQtyToSimulate) : totalPurchasingMatCost + (laborCost * activeQtyToSimulate);

    const [magasinData, setMagasinData] = useState<any[]>([]);

    // Task 2: Substitute states
    const [substitutes, setSubstitutes] = useState<Array<{ originalMatId: number, subId: string, qty: number, subName: string }>>([]);
    const [subModal, setSubModal] = useState<{ open: boolean, matId: number | null, matName: string | null, manque: number }>({ open: false, matId: null, matName: null, manque: 0 });
    const [subSearch, setSubSearch] = useState('');

    useEffect(() => {
        try {
            const data = localStorage.getItem('beramethode_magasin');
            if (data) setMagasinData(JSON.parse(data));
        } catch (e) {
            console.error(e);
        }
    }, []);

    return (
        <div className={`rounded-lg border overflow-hidden relative ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>

            {/* Substitute Modal */}
            {subModal.open && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                                <PlusCircle className="w-5 h-5 text-indigo-500" /> Ajouter un substitut
                            </h3>
                            <button onClick={() => setSubModal({ open: false, matId: null, matName: null, manque: 0 })} className="p-2 hover:bg-slate-100 rounded-full">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="mb-2 text-sm text-slate-600 font-bold px-1">
                            Manque constaté pour <span className="text-indigo-600">{subModal.matName}</span> : {subModal.manque}
                        </div>
                        <div className="mb-4">
                            <label className="text-xs font-bold text-slate-500 uppercase">Rechercher dans le Magasin</label>
                            <div className="relative mt-1">
                                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                                <input className="w-full pl-9 pr-3 py-2 bg-slate-50 border rounded-lg text-sm" placeholder="Nom ou référence..." value={subSearch} onChange={e => setSubSearch(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto min-h-[200px] border rounded-lg divide-y bg-slate-50">
                            {magasinData.filter(m => (m.nom || m.designation || '').toLowerCase().includes(subSearch.toLowerCase()) && m.stockActuel > 0).map(mItem => (
                                <div key={mItem.id} className="p-3 bg-white hover:bg-slate-50 flex justify-between items-center text-sm cursor-pointer transition-colors" onClick={() => {
                                    const qtyStr = prompt(`Quelle quantité prélever de "${mItem.nom || mItem.designation}" en stock (${mItem.stockActuel || 0}) ?\n(Nécessaire : ${subModal.manque})`, subModal.manque.toString());
                                    if (qtyStr) {
                                        const q = parseFloat(qtyStr.replace(/-/g, ''));
                                        if (!isNaN(q) && q > 0) {
                                            setSubstitutes(prev => [...prev, { originalMatId: subModal.matId!, subId: mItem.id, qty: q, subName: mItem.nom || mItem.designation }]);
                                            setSubModal({ open: false, matId: null, matName: null, manque: 0 });
                                        }
                                    }
                                }}>
                                    <div>
                                        <div className="font-bold text-slate-800">{mItem.nom || mItem.designation}</div>
                                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">Ref: {mItem.reference} | Categ: {mItem.categorie}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-indigo-600 font-black">{mItem.stockActuel || 0} <span className="text-xs font-medium">{mItem.unite || ''}</span></div>
                                        <div className="text-[10px] font-bold text-slate-400">En stock</div>
                                    </div>
                                </div>
                            ))}
                            {magasinData.length === 0 && <div className="p-4 text-center text-xs text-slate-400 font-bold">Aucun produit dans le magasin</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* Header Section */}
            <div className={`px-5 min-h-[3rem] py-2.5 border-b flex flex-col md:flex-row justify-between items-center gap-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100'}`}>
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    <div>
                        <h2 className={`text-[13px] font-semibold tracking-tight ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>{t.needs}</h2>
                        <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Estimation des coûts globaux</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {/* Waste Input */}
                    <div className={`flex items-center gap-2 h-8 rounded-md px-2.5 border transition-all focus-within:ring-2 focus-within:ring-slate-100 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-slate-50/60 border-slate-200'}`}>
                        <span className={`text-[11px] font-medium ${textSecondary}`}>{t.waste}</span>
                        <div className="h-4 w-px bg-slate-200 dark:bg-gray-700"></div>
                        <input
                            type="number"
                            min="0"
                            value={wasteRate}
                            onChange={(e) => setWasteRate(Math.max(0, parseFloat(e.target.value.replace(/-/g, '')) || 0))}
                            className={`w-10 text-center text-[13px] font-semibold tabular-nums text-slate-900 bg-transparent outline-none ${darkMode ? 'text-slate-200' : ''}`}
                        />
                        <Percent className="w-3 h-3 text-slate-400" strokeWidth={1.75} />
                    </div>

                    <div className={`flex items-center gap-2 h-8 rounded-md px-2.5 border transition-all focus-within:ring-2 focus-within:ring-slate-100 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-slate-50/60 border-slate-200'}`}>
                        <span className={`text-[11px] font-medium ${textSecondary}`}>Qté Totale</span>
                        <div className="h-4 w-px bg-slate-200 dark:bg-gray-700"></div>
                        <input
                            type="number"
                            min="1"
                            value={orderQty}
                            onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value.replace(/-/g, '')) || 0))}
                            className={`w-14 text-center text-[13px] font-semibold tabular-nums text-slate-900 bg-transparent outline-none ${darkMode ? 'text-slate-200' : ''}`}
                        />
                        <ShoppingCart className="w-3 h-3 text-slate-400" strokeWidth={1.75} />
                    </div>
                </div>
            </div>

            <div className="p-5 space-y-5">

                {/* Purchasing Table */}
                <div className={`rounded-lg border overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-slate-200'}`}>
                    <div className={`px-4 h-9 flex items-center text-[11px] font-medium uppercase tracking-wide border-b ${darkMode ? 'bg-gray-800 text-slate-400 border-gray-700' : 'bg-slate-50/60 text-slate-500 border-slate-100'}`}>
                        Détail des Achats (Matière Première)
                    </div>
                    <div className="md:overflow-x-auto">
                    <table className="w-full block md:table text-[13px]">
                        <thead className={`hidden md:table-header-group ${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-white text-slate-500'} font-medium border-b ${darkMode ? 'border-gray-700' : 'border-slate-100'} text-[11px] uppercase tracking-wide`}>
                            <tr>
                                <th className="px-4 py-2.5 text-left font-medium">{t.matName}</th>
                                <th className="px-4 py-2.5 text-center font-medium">{t.price}</th>
                                <th className="px-4 py-2.5 text-center font-medium">Besoin Total</th>
                                <th className="px-4 py-2.5 text-center font-medium border-l border-slate-100 bg-slate-50/40">En Stock</th>
                                <th className="px-4 py-2.5 text-center font-medium bg-slate-50/40">Manque</th>
                                <th className="px-4 py-2.5 text-center font-medium bg-slate-50/40">Fournisseur / Délais</th>
                                <th className="px-4 py-2.5 text-right font-medium text-slate-700 border-l border-slate-100">{t.total}</th>
                            </tr>
                        </thead>
                        <tbody className={`block md:table-row-group md:divide-y text-xs ${darkMode ? 'divide-gray-800' : 'divide-slate-100'}`}>
                            {purchasingData.map((m) => {
                                const mItem = magasinData.find(x => x.nom === m.name || x.designation === m.name);
                                const originalStockActuel = mItem ? (mItem.stockActuel || 0) : 0;
                                const qtyRequired = m.qtyToBuy;
                                
                                // Handling substitutes
                                const rowSubs = substitutes.filter(s => s.originalMatId === m.id);
                                const totalSubQty = rowSubs.reduce((acc, s) => acc + s.qty, 0);
                                
                                const manque = Math.max(0, qtyRequired - originalStockActuel - totalSubQty);
                                const fournisseur = mItem ? (mItem.fournisseurNom || mItem.fournisseur) : null;
                                const delai = mItem ? (mItem.fournisseurDelaiLivraisonJours || mItem.delaiLivraison) : null;
                                const hasAlert = manque > 0;

                                return (
                                    <React.Fragment key={m.id}>
                                        <tr className={`block md:table-row border border-slate-200 rounded-xl mb-3 p-2 md:p-0 md:mb-0 md:border-0 md:rounded-none ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-indigo-50/30'} transition-colors ${rowSubs.length > 0 ? 'md:bg-indigo-50/10' : ''}`}>
                                            <td className={`block md:table-cell px-4 py-2 md:py-3 font-semibold md:font-medium text-[13px] md:text-xs ${textPrimary}`}>
                                                {m.name}
                                                {m.unit === 'bobine' && <span className="text-[10px] text-slate-400 block font-normal">({m.threadMeters}m / bobine)</span>}
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center ${textSecondary}`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.price}</span>
                                                <span>{isExport ? '0 (Fourni)' : `${m.unitPrice} ${currency}`}</span>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center ${textSecondary}`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">Besoin Total</span>
                                                <span title={`(${m.qty} × ${orderQty}) + ${wasteRate}%`} className="font-bold">
                                                    {fmt(m.qtyToBuy)} {m.unit}
                                                </span>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center md:border-l ${originalStockActuel > 0 ? 'text-emerald-600' : 'text-slate-400'} font-bold md:bg-slate-50/30`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">En Stock</span>
                                                <span>{fmt(originalStockActuel)} {m.unit}</span>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center font-bold md:bg-slate-50/30 ${hasAlert ? 'text-rose-600' : 'text-slate-300'}`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">Manque</span>
                                                <div className="flex flex-row md:flex-col items-center justify-end md:justify-center gap-1">
                                                    <div className="flex items-center gap-1">
                                                        {hasAlert && <AlertTriangle className="w-3 h-3" />}
                                                        {fmt(manque)} {m.unit}
                                                    </div>
                                                    {hasAlert && (
                                                        <button onClick={() => setSubModal({ open: true, matId: m.id, matName: m.name, manque })} className="md:mt-0.5 text-[9px] px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded hover:bg-rose-200 uppercase tracking-widest font-black transition-colors active:scale-95 shadow-sm">
                                                            + Substitut
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center md:bg-slate-50/30`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">Fournisseur</span>
                                                {fournisseur ? (
                                                    <div className="flex flex-row md:flex-col items-center gap-1">
                                                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded uppercase tracking-wider">{fournisseur}</span>
                                                        {delai != null && <span className="text-[10px] text-slate-500 flex items-center gap-1 md:mt-1"><Truck className="w-3 h-3" /> {delai} jours</span>}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 mt-1 pt-2 md:mt-0 md:pt-3 border-t md:border-t-0 border-slate-100 md:text-right font-bold ${textPrimary} md:border-l`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.total}</span>
                                                <div className="flex items-center justify-end gap-1 cursor-help" title={isExport ? "Fourni par le client (0 DH)" : `${m.qtyToBuy} × ${m.unitPrice} = ${fmt(m.lineCost)}`}>
                                                    {isExport ? 0 : fmt(m.lineCost)} {currency}
                                                </div>
                                            </td>
                                        </tr>
                                        {rowSubs.map((sub, idx) => (
                                            <tr key={`${m.id}-sub-${idx}`} className="block md:table-row bg-amber-50/60 border border-dashed md:border-0 md:border-t border-amber-200 rounded-xl md:rounded-none mb-3 md:mb-0 p-2 md:p-0">
                                                <td className="block md:table-cell px-4 py-2 text-[11px] text-amber-800 flex items-center gap-2 font-bold">
                                                    <div className="w-3 h-3 border-l-2 border-b-2 border-amber-400 md:ml-4 rounded-bl"></div>
                                                    Substitut: {sub.subName}
                                                </td>
                                                <td className="hidden md:table-cell px-4 py-2 text-center text-amber-600/70">—</td>
                                                <td className="flex md:table-cell items-center justify-between px-4 py-1.5 md:py-2 md:text-center font-bold text-amber-600">
                                                    <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-amber-700/60">Besoin Total</span>
                                                    <span>+{fmt(sub.qty)} {m.unit}</span>
                                                </td>
                                                <td className="hidden md:table-cell px-4 py-2 border-l bg-slate-50/10"></td>
                                                <td className="hidden md:table-cell px-4 py-2 bg-slate-50/10"></td>
                                                <td className="hidden md:table-cell px-4 py-2 bg-slate-50/10"></td>
                                                <td className="flex md:table-cell items-center justify-end px-4 py-1.5 md:py-2 md:border-l md:text-right">
                                                    <button onClick={() => setSubstitutes(prev => prev.filter(x => x !== sub))} className="text-[10px] font-bold text-rose-500 hover:text-rose-700 px-2 py-0.5 bg-rose-50 hover:bg-rose-100 rounded transition-colors shadow-sm">Retirer</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                    </div>
                </div>

                {/* Summary Dashboard Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

                    {/* Card 1: Total Material */}
                    <div className={`p-4 rounded-lg border flex flex-col justify-between ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <span className={`text-[11px] font-medium mb-1 block ${textSecondary}`}>{t.realBudget}</span>
                                <div className="flex items-baseline gap-1">
                                    <h3 className={`text-[22px] font-semibold tabular-nums ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                                        {fmt(totalPurchasingMatCost)}
                                    </h3>
                                    <span className="text-[11px] font-normal text-slate-400">{currency}</span>
                                </div>
                            </div>
                            <Banknote className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                        </div>
                        <div className={`mt-3 pt-3 border-t text-[11px] flex justify-between ${darkMode ? 'border-gray-700 text-gray-500' : 'border-slate-100 text-slate-400'}`}>
                            <span>Articles : {purchasingData.length}</span>
                            <span title="Formula: Sum(QtyToBuy * Price)">Achats réels</span>
                        </div>
                    </div>

                    {/* Card 2: Total Labor */}
                    <div className={`p-4 rounded-lg border flex flex-col justify-between ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <span className={`text-[11px] font-medium mb-1 block ${textSecondary}`}>{t.laborCost} (Total)</span>
                                <div className="flex items-baseline gap-1">
                                    <h3 className={`text-[22px] font-semibold tabular-nums ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                                        {fmt(laborCost * orderQty)}
                                    </h3>
                                    <span className="text-[11px] font-normal text-slate-400">{currency}</span>
                                </div>
                            </div>
                            <Clock className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                        </div>
                        <div className={`mt-3 pt-3 border-t text-[11px] flex justify-between ${darkMode ? 'border-gray-700 text-gray-500' : 'border-slate-100 text-slate-400'}`}>
                            <span>{orderQty} pcs × {fmt(laborCost)}/pc</span>
                            <span title={`Formula: ${laborCost} * ${orderQty}`}>Main d'œuvre</span>
                        </div>
                    </div>

                    {/* Card 3: Grand Total */}
                    <div className="p-4 rounded-lg bg-slate-900 text-white flex flex-col justify-between">
                        <div>
                            <span className="text-[11px] font-medium text-slate-400 mb-1 block">{t.totalBudget}</span>
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-[24px] font-semibold tracking-tight tabular-nums">{fmt(totalProjectCost)}</h3>
                                <span className="text-[12px] font-normal text-slate-400">{currency}</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center text-[11px] text-slate-300">
                            <span>Coût de revient / pièce</span>
                            <span className="bg-white/10 px-2 py-0.5 rounded font-medium tabular-nums">{fmt(totalProjectCost / orderQty)} {currency}</span>
                        </div>
                    </div>

                </div>

                {/* Confirm & Deduct Action */}
                <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-gray-800">
                    <button
                        onClick={deductStock}
                        className="inline-flex items-center gap-1.5 h-9 px-4 bg-slate-900 text-white text-[12px] font-medium rounded-md hover:bg-slate-800 transition-colors"
                    >
                        <ShoppingCart className="w-3.5 h-3.5" strokeWidth={1.75} />
                        Confirmer & Déduire Stock
                    </button>
                </div>
            </div>
        </div >
    );
};

export default OrderSimulation;
