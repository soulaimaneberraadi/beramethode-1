import React from 'react';
import { ShoppingCart, Percent, Banknote, Clock, Package, TrendingUp, Info } from 'lucide-react';
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

    return (
        <div className={`rounded-xl shadow-lg border overflow-hidden ${darkMode ? 'bg-gray-800 border-indigo-900' : 'bg-white border-indigo-100'}`}>

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
                            onChange={(e) => setWasteRate(Math.max(0, parseFloat(e.target.value) || 0))}
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
                            onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 0))}
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
                        <thead className={`${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-white text-slate-500'} font-medium border-b ${darkMode ? 'border-gray-700' : 'border-slate-100'}`}>
                            <tr>
                                <th className="px-4 py-3 text-right">{t.matName}</th>
                                <th className="px-4 py-3 text-center">{t.price}</th>
                                <th className="px-4 py-3 text-center">Besoin Unitaire (+{wasteRate}%)</th>
                                <th className="px-4 py-3 text-center font-bold text-indigo-600">{t.qtyToBuy}</th>
                                <th className="px-4 py-3 text-center font-bold">{t.total}</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${darkMode ? 'divide-gray-800' : 'divide-slate-100'}`}>
                            {purchasingData.map((m) => (
                                <tr key={m.id} className={`${darkMode ? 'hover:bg-gray-800' : 'hover:bg-indigo-50/30'} transition-colors`}>
                                    <td className={`px-4 py-3 font-medium ${textPrimary}`}>
                                        {m.name}
                                        {m.unit === 'bobine' && <span className="text-[10px] text-slate-400 block font-normal">({m.threadMeters}m / bobine)</span>}
                                    </td>
                                    <td className={`px-4 py-3 text-center text-xs ${textSecondary}`}>{m.unitPrice} {currency}</td>
                                    <td className={`px-4 py-3 text-center text-xs ${textSecondary}`}>
                                        <span title={`(${m.qty} × ${orderQty}) + ${wasteRate}%`}>{fmt(m.totalWithWaste)} {m.unit}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${darkMode ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}`}>
                                            {fmt(m.qtyToBuy)} {m.unit}
                                        </span>
                                    </td>
                                    <td className={`px-4 py-3 text-center font-bold ${textPrimary}`}>
                                        <div className="flex items-center justify-center gap-1 cursor-help" title={`${m.qtyToBuy} × ${m.unitPrice} = ${fmt(m.lineCost)}`}>
                                            {fmt(m.lineCost)} {currency}
                                        </div>
                                    </td>
                                </tr>
                            ))}
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
