import React from 'react';
import { AppSettings, Material } from '../types';
import { fmt } from '../constants';
import { Scissors, Package, Tag, ArrowDown } from 'lucide-react';

interface TicketViewProps {
    t: any;
    currency: string;
    darkMode: boolean;
    productName: string;
    displayDate: string;
    totalMaterials: number;
    totalTime: number;
    laborCost: number;
    costPrice: number;
    settings: AppSettings;
    productImage: string | null;
    textPrimary: string;
    textSecondary: string;
    materials: Material[];
    cutTime: number;
    packTime: number;
    sellPriceHT: number;
    sellPriceTTC: number;
    boutiquePrice: number;
    soustraitanceActive?: boolean;
    materialsHidden?: boolean;
}

const TicketView: React.FC<TicketViewProps> = ({
    t, currency, darkMode, productName, displayDate, totalMaterials,
    totalTime, laborCost, costPrice, settings, productImage,
    textPrimary, textSecondary, materials, cutTime, packTime,
    sellPriceHT, sellPriceTTC, boutiquePrice,
    soustraitanceActive = false, materialsHidden = false
}) => {
    const baseTime = totalTime - cutTime - packTime;

    return (
        <div className="print-container max-w-[400px] mx-auto">
            {/* Header */}
            <div className="bg-slate-900 text-white p-3 relative overflow-hidden">
                <div className="flex justify-between items-start z-10 relative">
                    <div>
                        <h2 className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-0.5">{t.ticketTitle}</h2>
                        <h1 className="text-base font-bold text-white mb-0.5">{productName}</h1>
                        <div className="text-[8px] text-slate-400 uppercase tracking-wider">{t.ref}: #{Math.floor(Math.random() * 1000)}</div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm px-2 py-1 rounded border border-white/20 text-center">
                        <span className="block text-[7px] text-slate-300 uppercase tracking-wider mb-0.5">{t.date}</span>
                        <span className="text-[9px] font-mono font-bold text-white">{displayDate}</span>
                    </div>
                </div>
            </div>

            <div className={`p-3 space-y-3 relative ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>

                {/* MATERIALS — masqué en sous-traitance « tout compris » */}
                {!materialsHidden && (
                <div>
                    <h3 className={`text-[8px] font-bold uppercase tracking-wider border-b pb-1 mb-1.5 flex items-center gap-1 ${darkMode ? 'border-gray-700 text-gray-400' : 'border-slate-200 text-slate-400'}`}>
                        <Package className="w-2 h-2" /> MATIÈRE PREMIÈRE
                    </h3>
                    <div className="space-y-0.5 text-[9px]">
                        {materials.slice(0, 5).map((m) => (
                            <div key={m.id} className="flex justify-between items-center py-0.5">
                                <span className={`${darkMode ? 'text-gray-300' : 'text-slate-600'} truncate`}>
                                    {m.name} <span className="opacity-50 text-[7px]">({fmt(m.qty)} {m.unit} × {m.unitPrice})</span>
                                </span>
                                <span className={`font-mono ml-2 ${textPrimary}`}>{fmt(m.qty * m.unitPrice)}</span>
                            </div>
                        ))}
                        {materials.length > 5 && (
                            <div className="text-center text-[7px] text-slate-400 py-0.5">+{materials.length - 5} autres</div>
                        )}
                    </div>
                    <div className={`mt-1 pt-1 border-t border-dashed flex justify-between items-end ${darkMode ? 'border-gray-600' : 'border-slate-300'}`}>
                        <span className={`text-[8px] font-bold ${textSecondary}`}>{t.totalMat}</span>
                        <span className={`font-bold text-xs ${textPrimary}`}>{fmt(totalMaterials)} <span className="text-[7px] font-normal opacity-50">{currency}</span></span>
                    </div>
                </div>
                )}

                {/* LABOR */}
                <div className={`rounded p-2 border ${darkMode ? 'bg-gray-900/50 border-gray-700' : 'bg-slate-50 border-slate-200'}`}>
                    <h3 className={`text-[8px] font-bold uppercase tracking-wider border-b pb-1 mb-1.5 flex items-center gap-1 ${darkMode ? 'border-gray-700 text-blue-400' : 'border-slate-200 text-blue-600'}`}>
                        <Scissors className="w-2 h-2" /> PRIX FAÇON
                    </h3>
                    {soustraitanceActive ? (
                        <div className="text-[9px] py-0.5">
                            <div className="flex justify-between items-center">
                                <span className={`${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Sous-traitance / pièce</span>
                                <span className="font-mono">{fmt(laborCost)} {currency}</span>
                            </div>
                        </div>
                    ) : (
                    <div className="space-y-0.5 text-[9px]">
                        <div className="flex justify-between items-center py-0.5">
                            <span className={`${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Couture</span>
                            <span className="font-mono">{fmt(baseTime)} min</span>
                        </div>
                        <div className="flex justify-between items-center py-0.5">
                            <span className={`${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Coupe ({settings.cutRate}%)</span>
                            <span className="font-mono">{fmt(cutTime)} min</span>
                        </div>
                        <div className="flex justify-between items-center py-0.5">
                            <span className={`${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Emballage ({settings.packRate}%)</span>
                            <span className="font-mono">{fmt(packTime)} min</span>
                        </div>
                        <div className={`flex justify-between items-center pt-1 border-t border-dashed ${darkMode ? 'border-gray-700' : 'border-slate-300'}`}>
                            <span className="font-bold text-[8px]">TOTAL TEMPS</span>
                            <span className={`font-bold text-[9px] ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>{fmt(totalTime)} min</span>
                        </div>
                    </div>
                    )}
                    <div className={`mt-1 pt-1 border-t flex justify-between items-end ${darkMode ? 'border-blue-900' : 'border-blue-100'}`}>
                        <span className={`text-[8px] font-bold ${textSecondary}`}>{t.labor}</span>
                        <span className={`font-bold text-xs ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{fmt(laborCost)} <span className="text-[7px] font-normal opacity-50">{currency}</span></span>
                    </div>
                </div>

                {/* PRICING */}
                <div>
                    <h3 className={`text-[8px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        <Tag className="w-2.5 h-2.5" /> PRIX DE REVIENT & VENTE
                    </h3>

                    {/* P.R */}
                    <div className={`relative p-2 rounded border-l-2 flex justify-between items-center ${darkMode ? 'bg-gray-700 border-l-slate-400' : 'bg-slate-50 border-l-slate-500'}`}>
                        <div>
                            <span className={`text-[8px] font-bold uppercase tracking-wider opacity-70 ${textPrimary}`}>P.R</span>
                            <div className="text-[7px] text-slate-400">{materialsHidden ? 'Façon (tout compris)' : 'Matière + Façon'}</div>
                        </div>
                        <div className={`text-base font-black ${textPrimary}`}>
                            {fmt(costPrice)} <span className="text-[7px] font-normal opacity-50">{currency}</span>
                        </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center -my-1">
                        <div className={`p-0.5 rounded-full ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-slate-100 text-slate-400'}`}>
                            <ArrowDown className="w-2.5 h-2.5" />
                        </div>
                    </div>

                    {/* Selling Prices */}
                    <div className={`rounded border p-2 ${darkMode ? 'bg-gray-700/30 border-gray-700' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className="flex gap-2 mb-2">
                            <div className="flex-1">
                                <span className="block text-[7px] uppercase font-bold text-slate-400 mb-0.5">HT (+{settings.marginAtelier}%)</span>
                                <div className={`text-xs font-bold ${textPrimary}`}>{fmt(sellPriceHT)} <span className="text-[7px] font-normal opacity-50">{currency}</span></div>
                            </div>
                            <div className={`w-px ${darkMode ? 'bg-gray-600' : 'bg-slate-200'}`}></div>
                            <div className="flex-1 text-right">
                                <span className="block text-[7px] uppercase font-bold text-slate-400 mb-0.5">TTC (+{settings.tva}%)</span>
                                <div className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>{fmt(sellPriceTTC)} <span className="text-[7px] font-normal opacity-50">{currency}</span></div>
                            </div>
                        </div>

                        {/* Boutique */}
                        <div className={`rounded p-2 flex justify-between items-center ${darkMode ? 'bg-emerald-900/40 border border-emerald-800' : 'bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100'}`}>
                            <div>
                                <span className={`text-[8px] font-bold uppercase tracking-wider ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>{t.shopPrice}</span>
                                <span className={`text-[7px] font-medium ${darkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>+{settings.marginBoutique}%</span>
                            </div>
                            <div className={`text-lg font-black ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                {fmt(boutiquePrice)} <span className="text-[7px] font-normal opacity-60">{currency}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Image */}
                {productImage && (
                    <div className="mt-2 pt-2 border-t border-dashed flex justify-center">
                        <img src={productImage} alt="Product" className="max-h-20 rounded shadow-sm" />
                    </div>
                )}
            </div>

            {/* Serrated Edge */}
            <div className={`h-2 w-full bg-[linear-gradient(45deg,transparent_33.333%,${darkMode ? '#1f2937' : '#ffffff'}_33.333%,${darkMode ? '#1f2937' : '#ffffff'}_66.667%,transparent_66.667%),linear-gradient(-45deg,transparent_33.333%,${darkMode ? '#1f2937' : '#ffffff'}_33.333%,${darkMode ? '#1f2937' : '#ffffff'}_66.667%,transparent_66.667%)] bg-[length:20px_40px] rotate-180`}></div>
        </div>
    );
};

export default TicketView;
