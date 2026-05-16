import React from 'react';
import { AppSettings, Material } from '../types';
import { fmt } from '../constants';
import { Scissors, Package, Tag, ArrowDown, ChevronDown } from 'lucide-react';

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
}

const TicketView: React.FC<TicketViewProps> = ({
    t, currency, darkMode, productName, displayDate, totalMaterials,
    totalTime, laborCost, costPrice, settings, productImage,
    textPrimary, textSecondary, materials, cutTime, packTime,
    sellPriceHT, sellPriceTTC, boutiquePrice
}) => {
    const baseTime = totalTime - cutTime - packTime;

    return (
        <div className="print-container">
            {/* Receipt Header Style */}
            <div className="bg-slate-900 text-white p-6 relative overflow-hidden">
                <div className="flex justify-between items-start z-10 relative">
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">{t.ticketTitle}</h2>
                        <h1 className="text-2xl font-bold text-white mb-2">{productName}</h1>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">{t.ref}: #{Math.floor(Math.random() * 1000)}</div>
                    </div>
                    <div className="text-right">
                        <div className="bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/20 text-center shadow-lg inline-block">
                            <span className="block text-[10px] text-slate-300 uppercase tracking-wider mb-0.5">{t.date}</span>
                            <span className="text-sm font-mono font-bold text-white tracking-wide">{displayDate}</span>
                        </div>
                    </div>
                </div>

                {/* Decorative Circle */}
                <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
            </div>

            <div className={`p-6 space-y-8 relative ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>

                {/* SECTION 1: MATERIALS */}
                <div>
                    <h3 className={`text-xs font-bold uppercase tracking-wider border-b pb-2 mb-3 flex items-center gap-2 ${darkMode ? 'border-gray-700 text-gray-400' : 'border-slate-200 text-slate-400'}`}>
                        <Package className="w-3 h-3" /> PRIX MATIÈRE PREMIÈRE
                    </h3>
                    <div className="space-y-2 text-sm">
                        {materials.map((m) => (
                            <div key={m.id} className="flex justify-between items-center text-xs">
                                <span className={`${darkMode ? 'text-gray-300' : 'text-slate-600'}`}>
                                    {m.name} <span className="opacity-50 text-[10px]">({fmt(m.qty)} {m.unit} × {m.unitPrice})</span>
                                </span>
                                <span className={`font-mono ${textPrimary}`}>{fmt(m.qty * m.unitPrice)}</span>
                            </div>
                        ))}
                    </div>
                    <div className={`mt-3 pt-2 border-t border-dashed flex justify-between items-end ${darkMode ? 'border-gray-600' : 'border-slate-300'}`}>
                        <span className={`text-xs font-bold ${textSecondary}`}>{t.totalMat}</span>
                        <div className="text-right">
                            <span className={`block font-bold text-lg ${textPrimary}`}>{fmt(totalMaterials)} <span className="text-xs font-normal opacity-50">{currency}</span></span>
                        </div>
                    </div>
                </div>

                {/* SECTION 2: LABOR (FAÇON) */}
                <div className={`rounded-lg p-4 border ${darkMode ? 'bg-gray-900/50 border-gray-700' : 'bg-slate-50 border-slate-200'}`}>
                    <h3 className={`text-xs font-bold uppercase tracking-wider border-b pb-2 mb-3 flex items-center gap-2 ${darkMode ? 'border-gray-700 text-blue-400' : 'border-slate-200 text-blue-600'}`}>
                        <Scissors className="w-3 h-3" /> PRIX FAÇON (LABOR)
                    </h3>

                    <div className="space-y-3 text-sm">
                        {/* Breakdown */}
                        <div className="flex justify-between items-center text-xs">
                            <span className={`${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Couture</span>
                            <span className="font-mono">{fmt(baseTime)} min</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className={`${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Coupe ({settings.cutRate}%)</span>
                            <span className="font-mono">{fmt(cutTime)} min</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className={`${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Emballage ({settings.packRate}%)</span>
                            <span className="font-mono">{fmt(packTime)} min</span>
                        </div>

                        {/* Total Time */}
                        <div className={`flex justify-between items-center pt-2 border-t border-dashed ${darkMode ? 'border-gray-700' : 'border-slate-300'}`}>
                            <span className="font-bold text-xs">TOTAL TEMPS</span>
                            <span className={`font-bold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>{fmt(totalTime)} min</span>
                        </div>
                    </div>

                    {/* Labor Total */}
                    <div className={`mt-3 pt-2 border-t-2 flex justify-between items-end ${darkMode ? 'border-blue-900' : 'border-blue-100'}`}>
                        <div className="flex flex-col">
                            <span className={`text-xs font-bold ${textSecondary}`}>{t.labor}</span>
                            <span className="text-[9px] text-slate-400">{fmt(totalTime)} × {settings.costMinute}</span>
                        </div>
                        <span className={`block font-bold text-lg ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{fmt(laborCost)} <span className="text-xs font-normal opacity-50">{currency}</span></span>
                    </div>
                </div>

                {/* SECTION 3: PRICING LADDER (REDESIGNED) */}
                <div>
                    <h3 className={`text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2 ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        <Tag className="w-4 h-4" /> PRIX DE REVIENT & VENTE
                    </h3>

                    <div className="space-y-3">

                        {/* P.R (Cost Price) */}
                        <div className={`relative p-4 rounded-xl border-l-4 shadow-sm flex justify-between items-center overflow-hidden group ${darkMode ? 'bg-gray-700 border-l-slate-400' : 'bg-slate-50 border-l-slate-500'}`}>
                            <div className="z-10">
                                <span className={`text-xs font-bold uppercase tracking-wider opacity-70 ${textPrimary}`}>P.R ({t.costPrice})</span>
                                <div className="text-[10px] text-slate-400 mt-0.5">Matière + Façon</div>
                            </div>
                            <div className={`text-2xl font-black z-10 ${textPrimary}`}>
                                {fmt(costPrice)} <span className="text-xs font-normal opacity-50">{currency}</span>
                            </div>
                            {/* Subtle BG Icon */}
                            <div className="absolute right-0 bottom-0 opacity-5 transform translate-x-1/4 translate-y-1/4">
                                <Tag className="w-24 h-24" />
                            </div>
                        </div>

                        {/* Arrow Connector */}
                        <div className="flex justify-center -my-1">
                            <div className={`p-1 rounded-full ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-slate-100 text-slate-400'}`}>
                                <ArrowDown className="w-4 h-4" />
                            </div>
                        </div>

                        {/* Selling Prices Container */}
                        <div className={`rounded-xl border p-4 ${darkMode ? 'bg-gray-700/30 border-gray-700' : 'bg-white border-slate-200 shadow-sm'}`}>

                            {/* HT & TTC Row */}
                            <div className="flex gap-4 mb-4">
                                {/* HT */}
                                <div className="flex-1">
                                    <span className={`block text-[10px] uppercase font-bold text-slate-400 mb-1`}>Prix Vente HT (+{settings.marginAtelier}%)</span>
                                    <div className={`text-lg font-bold ${textPrimary}`}>{fmt(sellPriceHT)} <span className="text-[10px] font-normal opacity-50">{currency}</span></div>
                                </div>

                                {/* Separator */}
                                <div className={`w-px ${darkMode ? 'bg-gray-600' : 'bg-slate-200'}`}></div>

                                {/* TTC */}
                                <div className="flex-1 text-right">
                                    <span className={`block text-[10px] uppercase font-bold text-slate-400 mb-1`}>Prix Vente TTC (+{settings.tva}%)</span>
                                    <div className={`text-lg font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>{fmt(sellPriceTTC)} <span className="text-[10px] font-normal opacity-50">{currency}</span></div>
                                </div>
                            </div>

                            {/* Final Boutique Price Card */}
                            <div className={`rounded-lg p-4 flex justify-between items-center relative overflow-hidden ${darkMode ? 'bg-emerald-900/40 border border-emerald-800' : 'bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100'}`}>
                                <div>
                                    <span className={`block text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>{t.shopPrice}</span>
                                    <span className={`text-[10px] font-medium ${darkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>Marge Boutique: +{settings.marginBoutique}%</span>
                                </div>
                                <div className={`text-3xl font-black ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                    {fmt(boutiquePrice)} <span className="text-sm font-normal opacity-60">{currency}</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Product Image Footer */}
                {productImage && (
                    <div className="mt-6 pt-6 border-t border-dashed flex justify-center">
                        <img src={productImage} alt="Product" className="max-h-48 rounded-lg shadow-sm" />
                    </div>
                )}

            </div>

            {/* Serrated Edge Effect */}
            <div className={`h-4 w-full bg-[linear-gradient(45deg,transparent_33.333%,${darkMode ? '#1f2937' : '#ffffff'}_33.333%,${darkMode ? '#1f2937' : '#ffffff'}_66.667%,transparent_66.667%),linear-gradient(-45deg,transparent_33.333%,${darkMode ? '#1f2937' : '#ffffff'}_33.333%,${darkMode ? '#1f2937' : '#ffffff'}_66.667%,transparent_66.667%)] bg-[length:20px_40px] rotate-180`}></div>
        </div>
    );
};

export default TicketView;
