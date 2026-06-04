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
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header - Planning Style */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                        <Shirt className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-slate-800 tracking-tight">Fiche de Coût</h2>
                        <p className="text-[11px] text-slate-400 font-medium">Modèle & Paramètres</p>
                    </div>
                </div>
                
                {/* Stat Dots - Planning Style */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] font-bold text-emerald-700">{fmt(totalTime)} min</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 rounded-full border border-blue-100">
                        <Coins className="w-3 h-3 text-blue-500" />
                        <span className="text-[10px] font-bold text-blue-700">{fmt(costPrice)} {currency}</span>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column - Inputs */}
                <div className="md:col-span-2 space-y-4">
                    {/* Model Name */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                            Nom du Modèle
                        </label>
                        <input 
                            type="text" 
                            value={productName} 
                            onChange={(e) => setProductName(e.target.value)} 
                            className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="Ex: 76-34-tf"
                        />
                    </div>

                    {/* Time & Cost Inputs */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Sewing Time */}
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                Temps Couture (min)
                            </label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    min="0" 
                                    step="0.01"
                                    value={baseTime} 
                                    onChange={(e) => setBaseTime(Math.max(0, parseFloat(e.target.value) || 0))} 
                                    className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                />
                                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            </div>
                        </div>

                        {/* Cost Minute */}
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
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
                                        className="w-full h-10 pl-9 pr-3 bg-blue-50 border border-blue-200 rounded-lg text-sm font-bold text-blue-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    />
                                    <Coins className="w-4 h-4 text-blue-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                </div>
                                <button 
                                    onClick={applyCostMinute} 
                                    className="h-10 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all active:scale-95 flex items-center justify-center"
                                    title={t.apply}
                                >
                                    <CheckSquare className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Cut & Pack Rates - Compact Style */}
                    <div className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-rose-100 flex items-center justify-center">
                                <Scissors className="w-3 h-3 text-rose-600" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-600">Coupe (%):</span>
                            <input 
                                type="number" 
                                min="0" 
                                name="cutRate" 
                                value={settings.cutRate} 
                                onChange={handleInstantSettingChange} 
                                className="w-14 h-7 px-1 bg-white border border-slate-200 rounded text-center text-xs font-bold text-slate-700 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all"
                            />
                        </div>
                        
                        <div className="w-px h-6 bg-slate-200" />
                        
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-amber-100 flex items-center justify-center">
                                <Package className="w-3 h-3 text-amber-600" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-600">Emballage (%):</span>
                            <input 
                                type="number" 
                                min="0" 
                                name="packRate" 
                                value={settings.packRate} 
                                onChange={handleInstantSettingChange} 
                                className="w-14 h-7 px-1 bg-white border border-slate-200 rounded text-center text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                            />
                        </div>
                        
                        <div className="w-px h-6 bg-slate-200" />
                        
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg">
                            <TrendingUp className="w-3.5 h-3.5 text-white" />
                            <span className="text-[11px] font-bold text-white">Total:</span>
                            <span className="text-sm font-black text-white">{fmt(totalTime)} min</span>
                        </div>
                    </div>

                    {/* Cost Breakdown - Visual */}
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-lg">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
                            Répartition du Temps
                        </h4>
                        
                        {/* Progress Bar */}
                        <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden flex mb-3">
                            <div 
                                className="bg-blue-500 transition-all duration-500"
                                style={{ width: `${(baseTime / totalTime) * 100}%` }}
                                title={`Couture: ${baseTime} min`}
                            />
                            <div 
                                className="bg-rose-500 transition-all duration-500"
                                style={{ width: `${(cutTime / totalTime) * 100}%` }}
                                title={`Coupe: ${cutTime.toFixed(1)} min`}
                            />
                            <div 
                                className="bg-amber-500 transition-all duration-500"
                                style={{ width: `${(packTime / totalTime) * 100}%` }}
                                title={`Emballage: ${packTime.toFixed(1)} min`}
                            />
                        </div>
                        
                        {/* Legend */}
                        <div className="flex items-center gap-4 text-[10px]">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <span className="font-semibold text-slate-600">Couture ({((baseTime / totalTime) * 100).toFixed(0)}%)</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-rose-500" />
                                <span className="font-semibold text-slate-600">Coupe ({((cutTime / totalTime) * 100).toFixed(0)}%)</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-amber-500" />
                                <span className="font-semibold text-slate-600">Emballage ({((packTime / totalTime) * 100).toFixed(0)}%)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column - Image */}
                <div className="md:col-span-1">
                    <div 
                        className={`relative w-full h-[200px] rounded-xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center overflow-hidden cursor-pointer
                            ${darkMode 
                                ? 'border-gray-500 bg-gray-800/50 hover:bg-gray-800 hover:border-blue-500' 
                                : 'border-slate-300 bg-slate-50 hover:bg-blue-50/50 hover:border-blue-500'
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
                                        className="transform scale-90 hover:scale-100 transition-all duration-200 bg-red-500 hover:bg-red-600 text-white p-2.5 rounded-full shadow-lg flex items-center gap-1.5"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        <span className="text-[10px] font-bold">Supprimer</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center">
                                <div className={`p-3 rounded-full mb-2 transition-transform duration-500 hover:scale-110 hover:rotate-6 ${darkMode ? 'bg-gray-700 text-blue-400' : 'bg-white text-blue-500 shadow-sm'}`}>
                                    <Camera className="w-6 h-6" />
                                </div>
                                <span className="text-xs font-bold text-slate-600 block mb-0.5">Ajouter Photo</span>
                                <span className="text-[10px] text-slate-400">JPG, PNG</span>
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
