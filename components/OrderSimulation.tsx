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
}

const OrderSimulation: React.FC<OrderSimulationProps> = ({
    t, currency, darkMode, orderQty, setOrderQty, wasteRate, setWasteRate,
    deductStock,
    purchasingData, totalPurchasingMatCost, laborCost,
    textSecondary, textPrimary, bgCard
}) => {
    const activeQtyToSimulate = orderQty;
    const totalProjectCost = totalPurchasingMatCost + (laborCost * activeQtyToSimulate);

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
        <div className={`rounded-xl shadow-lg border overflow-hidden relative ${darkMode ? 'bg-gray-800 border-indigo-900' : 'bg-white border-indigo-100'}`}>

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
            <div className={`px-6 py-5 border-b flex flex-col md:flex-row justify-between items-center gap-4 ${darkMode ? 'bg-indigo-950/30 border-indigo-800' : 'bg-gradient-to-r from-indigo-50 to-white border-indigo-100'}`}>
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-md shadow-indigo-200 dark:shadow-none">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className={`text-lg font-bold ${darkMode ? 'text-indigo-300' : 'text-indigo-900'}`}>{t.needs}</h2>
                        <p className={`text-xs ${darkMode ? 'text-indigo-400' : 'text-indigo-500'}`}>Estimation des coûts globaux pour la production</p>
                    </div>
                </div>

                <div className="flex gap-4">
                    {/* Waste Input */}
                    <div className={`flex items-center gap-2 rounded-xl p-1 pr-3 pl-3 shadow-sm border transition-all focus-within:ring-2 focus-within:ring-indigo-400 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-indigo-200'}`}>
                        <span className={`text-xs font-bold uppercase tracking-wide ${textSecondary}`}>{t.waste}</span>
                        <div className="h-4 w-px bg-gray-300 dark:bg-gray-700 mx-1"></div>
                        <input
                            type="number"
                            min="0"
                            value={wasteRate}
                            onChange={(e) => setWasteRate(Math.max(0, parseFloat(e.target.value.replace(/-/g, '')) || 0))}
                            className={`w-12 text-center font-bold text-indigo-600 bg-transparent outline-none ${darkMode ? 'text-indigo-400' : ''}`}
                        />
                        <Percent className="w-3 h-3 text-indigo-400" />
                    </div>

                    <div className={`flex items-center gap-2 rounded-xl p-1 pr-3 pl-3 shadow-sm border transition-all focus-within:ring-2 focus-within:ring-indigo-400 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-indigo-200'}`}>
                        <span className={`text-xs font-bold uppercase tracking-wide ${textSecondary}`}>Qté Totale</span>
                        <div className="h-4 w-px bg-gray-300 dark:bg-gray-700 mx-1"></div>
                        <input
                            type="number"
                            min="1"
                            value={orderQty}
                            onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value.replace(/-/g, '')) || 0))}
                            className={`w-16 text-center font-bold text-indigo-600 bg-transparent outline-none ${darkMode ? 'text-indigo-400' : ''}`}
                        />
                        <ShoppingCart className="w-3 h-3 text-indigo-400" />
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-8">

                {/* Purchasing Table */}
                <div className={`rounded-xl border overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-slate-200 shadow-sm'}`}>
                    <div className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b ${darkMode ? 'bg-gray-800 text-indigo-400 border-gray-700' : 'bg-slate-50 text-indigo-600 border-slate-200'}`}>
                        Détail des Achats (Matière Première)
                    </div>
                    <table className="w-full text-sm">
                        <thead className={`${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-white text-slate-500'} font-medium border-b ${darkMode ? 'border-gray-700' : 'border-slate-100'} text-xs`}>
                            <tr>
                                <th className="px-4 py-3 text-left">{t.matName}</th>
                                <th className="px-4 py-3 text-center">{t.price}</th>
                                <th className="px-4 py-3 text-center">Besoin Total</th>
                                <th className="px-4 py-3 text-center border-l bg-slate-50/50">En Stock</th>
                                <th className="px-4 py-3 text-center bg-slate-50/50">Manque</th>
                                <th className="px-4 py-3 text-center bg-slate-50/50">Fournisseur / Délais</th>
                                <th className="px-4 py-3 text-right font-bold text-indigo-600 border-l">{t.total}</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y text-xs ${darkMode ? 'divide-gray-800' : 'divide-slate-100'}`}>
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
                                        <tr className={`${darkMode ? 'hover:bg-gray-800' : 'hover:bg-indigo-50/30'} transition-colors ${rowSubs.length > 0 ? 'bg-indigo-50/10' : ''}`}>
                                            <td className={`px-4 py-3 font-medium ${textPrimary}`}>
                                                {m.name}
                                                {m.unit === 'bobine' && <span className="text-[10px] text-slate-400 block font-normal">({m.threadMeters}m / bobine)</span>}
                                            </td>
                                            <td className={`px-4 py-3 text-center ${textSecondary}`}>{m.unitPrice} {currency}</td>
                                            <td className={`px-4 py-3 text-center ${textSecondary}`}>
                                                <span title={`(${m.qty} × ${orderQty}) + ${wasteRate}%`} className="font-bold">
                                                    {fmt(m.qtyToBuy)} {m.unit}
                                                </span>
                                            </td>
                                            <td className={`px-4 py-3 text-center border-l ${originalStockActuel > 0 ? 'text-emerald-600' : 'text-slate-400'} font-bold bg-slate-50/30`}>
                                                {fmt(originalStockActuel)} {m.unit}
                                            </td>
                                            <td className={`px-4 py-3 text-center font-bold bg-slate-50/30 ${hasAlert ? 'text-rose-600' : 'text-slate-300'}`}>
                                                <div className="flex flex-col items-center justify-center gap-1">
                                                    <div className="flex items-center gap-1">
                                                        {hasAlert && <AlertTriangle className="w-3 h-3" />}
                                                        {fmt(manque)} {m.unit}
                                                    </div>
                                                    {hasAlert && (
                                                        <button onClick={() => setSubModal({ open: true, matId: m.id, matName: m.name, manque })} className="mt-0.5 text-[9px] px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded hover:bg-rose-200 uppercase tracking-widest font-black transition-colors active:scale-95 shadow-sm">
                                                            + Substitut
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className={`px-4 py-3 text-center bg-slate-50/30`}>
                                                {fournisseur ? (
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded uppercase tracking-wider">{fournisseur}</span>
                                                        {delai != null && <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-1"><Truck className="w-3 h-3" /> {delai} jours</span>}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-bold ${textPrimary} border-l`}>
                                                <div className="flex items-center justify-end gap-1 cursor-help" title={`${m.qtyToBuy} × ${m.unitPrice} = ${fmt(m.lineCost)}`}>
                                                    {fmt(m.lineCost)} {currency}
                                                </div>
                                            </td>
                                        </tr>
                                        {rowSubs.map((sub, idx) => (
                                            <tr key={`${m.id}-sub-${idx}`} className="bg-amber-50/60 border-t border-dashed border-amber-200">
                                                <td className="px-4 py-2 text-[11px] text-amber-800 px-4 flex items-center gap-2 font-bold">
                                                    <div className="w-3 h-3 border-l-2 border-b-2 border-amber-400 ml-4 rounded-bl"></div>
                                                    Substitut: {sub.subName}
                                                </td>
                                                <td className="px-4 py-2 text-center text-amber-600/70">—</td>
                                                <td className="px-4 py-2 text-center font-bold text-amber-600">+{fmt(sub.qty)} {m.unit}</td>
                                                <td className="px-4 py-2 border-l bg-slate-50/10"></td>
                                                <td className="px-4 py-2 bg-slate-50/10"></td>
                                                <td className="px-4 py-2 bg-slate-50/10"></td>
                                                <td className="px-4 py-2 border-l text-right">
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

                {/* Summary Dashboard Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Card 1: Total Material */}
                    <div className={`p-4 rounded-xl border flex flex-col justify-between relative overflow-hidden group ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200 shadow-sm hover:border-indigo-300'}`}>
                        <div className="flex justify-between items-start z-10">
                            <div>
                                <span className={`text-xs font-bold uppercase tracking-wider mb-1 block ${textSecondary}`}>{t.realBudget}</span>
                                <div className="flex items-baseline gap-1">
                                    <h3 className={`text-2xl font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                        {fmt(totalPurchasingMatCost)}
                                    </h3>
                                    <span className="text-xs font-bold text-slate-400">{currency}</span>
                                </div>
                            </div>
                            <div className={`p-2 rounded-lg ${darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                                <Banknote className="w-5 h-5" />
                            </div>
                        </div>
                        <div className={`mt-4 pt-3 border-t text-xs flex justify-between ${darkMode ? 'border-gray-700 text-gray-500' : 'border-slate-100 text-slate-500'}`}>
                            <span>Nombre d'articles: {purchasingData.length}</span>
                            <span title="Formula: Sum(QtyToBuy * Price)">Calculé sur achats réels</span>
                        </div>
                    </div>

                    {/* Card 2: Total Labor */}
                    <div className={`p-4 rounded-xl border flex flex-col justify-between relative overflow-hidden group ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200 shadow-sm hover:border-indigo-300'}`}>
                        <div className="flex justify-between items-start z-10">
                            <div>
                                <span className={`text-xs font-bold uppercase tracking-wider mb-1 block ${textSecondary}`}>{t.laborCost} (Total)</span>
                                <div className="flex items-baseline gap-1">
                                    <h3 className={`text-2xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                        {fmt(laborCost * orderQty)}
                                    </h3>
                                    <span className="text-xs font-bold text-slate-400">{currency}</span>
                                </div>
                            </div>
                            <div className={`p-2 rounded-lg ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                                <Clock className="w-5 h-5" />
                            </div>
                        </div>
                        <div className={`mt-4 pt-3 border-t text-xs flex justify-between ${darkMode ? 'border-gray-700 text-gray-500' : 'border-slate-100 text-slate-500'}`}>
                            <span>{orderQty} pcs × {fmt(laborCost)}/pc</span>
                            <span title={`Formula: ${laborCost} * ${orderQty}`}>Coût Main d'œuvre</span>
                        </div>
                    </div>

                    {/* Card 3: Grand Total */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg shadow-indigo-200 dark:shadow-none flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Package className="w-24 h-24 transform rotate-12" />
                        </div>
                        <div className="relative z-10">
                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-100 mb-1 block">{t.totalBudget}</span>
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-3xl font-black tracking-tight">{fmt(totalProjectCost)}</h3>
                                <span className="text-sm font-medium text-indigo-200">{currency}</span>
                            </div>
                        </div>
                        <div className="relative z-10 mt-4 pt-3 border-t border-indigo-500/30 flex justify-between items-center text-xs text-indigo-100">
                            <span className="font-medium">Coût de revient par pièce:</span>
                            <span className="bg-white/20 px-2 py-1 rounded font-bold">{fmt(totalProjectCost / orderQty)} {currency}</span>
                        </div>
                    </div>

                </div>

                {/* Confirm & Deduct Action */}
                <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-gray-800">
                    <button
                        onClick={deductStock}
                        className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
                    >
                        <ShoppingCart className="w-4 h-4" />
                        Confirmer Commandes & Déduire Stock
                    </button>
                </div>
            </div>
        </div >
    );
};

export default OrderSimulation;
