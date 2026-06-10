import React, { useState } from 'react';
import { Shirt, Clock, Coins, Scissors, Package, CheckSquare, ImageIcon, X, Upload, Trash2, Camera, Check, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AppSettings } from '../types';
import { fmt } from '../constants';

interface ModelInfoProps {
    t: any;
    currency: string;
    darkMode: boolean;
    productName: string;
    setProductName: (v: string) => void;
    baseTime: number;
    setBaseTime: (v: number) => void;
    totalTime: number;
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    tempSettings: AppSettings;
    setTempSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    productImage: string | null;
    setProductImage: (v: string | null) => void;
    applyCostMinute: () => void;
    handleInstantSettingChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleTempSettingChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    inputBg: string;
    textPrimary: string;
    textSecondary: string;
    bgCard: string;
    bgCardHeader: string;
}

const ModelInfo: React.FC<ModelInfoProps> = ({
    t, currency, darkMode, productName, setProductName,
    baseTime, setBaseTime, totalTime, settings,
    tempSettings, productImage, setProductImage,
    applyCostMinute, handleInstantSettingChange, handleTempSettingChange,
    inputBg, textPrimary, textSecondary, bgCard, bgCardHeader
}) => {
    const [isImageHovered, setIsImageHovered] = useState(false);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProductImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const cutTime = baseTime * (settings.cutRate / 100);
    const packTime = baseTime * (settings.packRate / 100);
    const costPrice = totalTime * settings.costMinute;

    return (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {/* Header - Planning Style */}
            <div className="px-3 sm:px-5 h-auto sm:h-12 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 py-2 sm:py-0">
                <div className="flex items-center gap-2">
                    <Shirt className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    <div>
                        <h2 className="text-[13px] font-semibold text-slate-900 tracking-tight">Fiche de Coût</h2>
                        <p className="text-[11px] text-slate-400">Modèle &amp; paramètres</p>
                    </div>
                </div>

                {/* Inline stats - Planning Style */}
                <div className="flex items-center gap-3 sm:gap-4">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        <span className="text-[11px] sm:text-[12px] text-slate-500">Temps</span>
                        <span className="text-[11px] sm:text-[12px] font-semibold text-slate-900 tabular-nums">{fmt(totalTime)} min</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#2149C1]" />
                        <span className="text-[11px] sm:text-[12px] text-slate-500">Coût</span>
                        <span className="text-[11px] sm:text-[12px] font-semibold text-slate-900 tabular-nums">{fmt(costPrice)} {currency}</span>
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="p-3 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                {/* Left Column - Inputs */}
                <div className="md:col-span-2 space-y-3 sm:space-y-4 order-2 md:order-1">
                    {/* Model Name */}
                    <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                            Nom du Modèle
                        </label>
                        <input
                            type="text"
                            value={productName}
                            onChange={(e) => setProductName(e.target.value)}
                            className="w-full h-9 px-3 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-slate-300 rounded-md text-[13px] font-medium text-slate-700 focus:ring-2 focus:ring-slate-100 outline-none transition-all"
                            placeholder="Ex: 76-34-tf"
                        />
                    </div>

                    {/* Time & Cost Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        {/* Sewing Time */}
                        <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                                Temps Couture (min)
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={baseTime}
                                    onChange={(e) => setBaseTime(Math.max(0, parseFloat(e.target.value) || 0))}
                                    className="w-full h-9 pl-9 pr-3 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-slate-300 rounded-md text-[13px] font-semibold text-slate-700 focus:ring-2 focus:ring-slate-100 outline-none transition-all tabular-nums"
                                />
                                <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
                            </div>
                        </div>

                        {/* Cost Minute */}
                        <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                                Coût Minute ({currency})
                            </label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <input
                                        name="costMinute"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={tempSettings.costMinute}
                                        onChange={handleTempSettingChange}
                                        className="w-full h-9 pl-9 pr-3 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-slate-300 rounded-md text-[13px] font-semibold text-slate-700 focus:ring-2 focus:ring-slate-100 outline-none transition-all tabular-nums"
                                    />
                                    <Coins className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
                                </div>
                                <button
                                    onClick={applyCostMinute}
                                    className="h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors flex items-center justify-center"
                                    title={t.apply}
                                >
                                    <CheckSquare className="w-3.5 h-3.5" strokeWidth={1.75} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Cut & Pack Rates - Compact Style */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-slate-50/60 border border-slate-200 rounded-md">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <Scissors className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500">Coupe (%)</span>
                            <input
                                type="number"
                                min="0"
                                name="cutRate"
                                value={settings.cutRate}
                                onChange={handleInstantSettingChange}
                                className="w-10 sm:w-12 h-6 sm:h-7 px-1 bg-white border border-slate-200 rounded text-center text-[11px] sm:text-[12px] font-semibold text-slate-700 focus:ring-2 focus:ring-slate-100 focus:border-slate-300 outline-none transition-all tabular-nums"
                            />
                        </div>

                        <div className="w-px h-4 sm:h-5 bg-slate-200" />

                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <Package className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500">Emballage (%)</span>
                            <input
                                type="number"
                                min="0"
                                name="packRate"
                                value={settings.packRate}
                                onChange={handleInstantSettingChange}
                                className="w-10 sm:w-12 h-6 sm:h-7 px-1 bg-white border border-slate-200 rounded text-center text-[11px] sm:text-[12px] font-semibold text-slate-700 focus:ring-2 focus:ring-slate-100 focus:border-slate-300 outline-none transition-all tabular-nums"
                            />
                        </div>

                        <div className="flex-1" />

                        <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 h-7 sm:h-8 bg-slate-900 rounded-md">
                            <span className="text-[10px] sm:text-[11px] font-medium text-slate-300">Total</span>
                            <span className="text-[12px] sm:text-[13px] font-semibold text-white tabular-nums">{fmt(totalTime)} min</span>
                        </div>
                    </div>

                    {/* Cost Breakdown - Visual */}
                    <div className="p-3 sm:p-4 bg-slate-50/60 border border-slate-200 rounded-md">
                        <h4 className="text-[10px] sm:text-[11px] font-medium text-slate-500 mb-2 sm:mb-3">
                            Répartition du Temps
                        </h4>

                        {/* Progress Bar */}
                        <div className="h-1.5 sm:h-2 bg-slate-200 rounded-full overflow-hidden flex mb-2 sm:mb-3">
                            <div
                                className="bg-[#2149C1] transition-all duration-500"
                                style={{ width: `${(baseTime / totalTime) * 100}%` }}
                                title={`Couture: ${baseTime} min`}
                            />
                            <div
                                className="bg-slate-400 transition-all duration-500"
                                style={{ width: `${(cutTime / totalTime) * 100}%` }}
                                title={`Coupe: ${cutTime.toFixed(1)} min`}
                            />
                            <div
                                className="bg-slate-300 transition-all duration-500"
                                style={{ width: `${(packTime / totalTime) * 100}%` }}
                                title={`Emballage: ${packTime.toFixed(1)} min`}
                            />
                        </div>

                        {/* Legend */}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-[11px]">
                            <div className="flex items-center gap-1 sm:gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#2149C1]" />
                                <span className="text-slate-500">Couture ({((baseTime / totalTime) * 100).toFixed(0)}%)</span>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                <span className="text-slate-500">Coupe ({((cutTime / totalTime) * 100).toFixed(0)}%)</span>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                <span className="text-slate-500">Emballage ({((packTime / totalTime) * 100).toFixed(0)}%)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column - Image (en haut sur mobile, à côté sur desktop — comme la Fiche Technique) */}
                <div className="md:col-span-1 order-1 md:order-2">
                    <div
                        className={`relative w-full h-[320px] sm:h-[320px] rounded-md border border-dashed transition-all duration-300 flex flex-col items-center justify-center overflow-hidden cursor-pointer
                            ${darkMode
                                ? 'border-gray-600 bg-gray-800/50 hover:bg-gray-800 hover:border-slate-500'
                                : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-400'
                            }`}
                        onMouseEnter={() => setIsImageHovered(true)}
                        onMouseLeave={() => setIsImageHovered(false)}
                    >
                        {productImage ? (
                            <div className="relative w-full h-full">
                                <img 
                                    src={productImage} 
                                    alt="Product" 
                                    className="w-full h-full object-cover transition-transform duration-700 hover:scale-110" 
                                />
                                <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 flex items-center justify-center ${isImageHovered ? 'opacity-100' : 'opacity-0'}`}>
                                    <button
                                        onClick={(e) => { e.preventDefault(); setProductImage(null); }}
                                        className="transform scale-90 hover:scale-100 transition-all duration-200 bg-red-500 hover:bg-red-600 text-white p-2 sm:p-2.5 rounded-full shadow-lg flex items-center gap-1 sm:gap-1.5"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        <span className="text-[9px] sm:text-[10px] font-bold">Supprimer</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center">
                                <div className={`p-2 sm:p-2.5 rounded-md mb-1.5 sm:mb-2 inline-flex ${darkMode ? 'bg-gray-700 text-slate-400' : 'bg-white text-slate-400 border border-slate-200'}`}>
                                    <Camera className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={1.75} />
                                </div>
                                <span className="text-[11px] sm:text-[12px] font-medium text-slate-600 block mb-0.5">Ajouter Photo</span>
                                <span className="text-[10px] sm:text-[11px] text-slate-400">JPG, PNG</span>
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    onChange={handleImageUpload} 
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ModelInfo;
