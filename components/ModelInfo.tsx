import React from 'react';
import { Shirt, Clock, Coins, Scissors, Package, CheckSquare, ImageIcon, X, Upload, Trash2, Camera, Check } from 'lucide-react';
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

    return (
        <div className={`rounded-xl shadow-sm border overflow-hidden ${bgCard}`}>
            <div className={`px-4 py-3 border-b flex items-center gap-2 ${bgCardHeader}`}>
                <Shirt className={`w-5 h-5 ${textSecondary}`} />
                <h2 className={`font-semibold ${textPrimary}`}>{t.modelInfo}</h2>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-4">
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${textSecondary}`}>{t.modelName}</label>
                        <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} className={`w-full rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border ${inputBg}`} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={`block text-sm font-medium mb-1 ${textSecondary}`}>{t.sewingTime}</label>
                            <div className="relative">
                                <input type="number" min="0" value={baseTime} onChange={(e) => setBaseTime(Math.max(0, parseFloat(e.target.value) || 0))} className={`w-full rounded-lg p-2 pl-10 focus:ring-2 focus:ring-blue-500 outline-none font-bold border ${inputBg}`} />
                                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                            </div>
                        </div>

                        {/* Cost Minute */}
                        <div>
                            <label className="block text-sm font-medium mb-1 text-blue-500">{t.costMinute} ({currency})</label>
                            <div className="flex gap-2">
                                <div className="relative w-full">
                                    <input name="costMinute" type="number" min="0" step="0.01" value={tempSettings.costMinute} onChange={handleTempSettingChange} className={`w-full rounded-lg p-2 pl-8 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-600 border ${darkMode ? 'bg-gray-900 border-blue-900' : 'bg-blue-50 border-blue-200'}`} />
                                    <Coins className="w-4 h-4 text-blue-500 absolute left-3 top-3" />
                                </div>
                                <button onClick={applyCostMinute} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 shadow-sm transition active:scale-95 flex items-center justify-center" title={t.apply}>
                                    <CheckSquare className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={`flex flex-wrap gap-4 text-sm p-3 rounded-lg border items-center mt-2 ${darkMode ? 'bg-gray-900 border-gray-600 text-gray-400' : 'bg-slate-50 border-slate-300 text-slate-500'}`}>
                        <div className="flex items-center gap-2">
                            <Scissors className="w-4 h-4" />
                            <span className="text-xs">{t.cutting} (%):</span>
                            <input type="number" min="0" name="cutRate" value={settings.cutRate} onChange={handleInstantSettingChange} className={`w-14 rounded-md px-1 py-0.5 text-center focus:ring-2 focus:ring-blue-500 outline-none font-bold border ${inputBg}`} />
                        </div>
                        <div className="flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            <span className="text-xs">{t.packing} (%):</span>
                            <input type="number" min="0" name="packRate" value={settings.packRate} onChange={handleInstantSettingChange} className={`w-14 rounded-md px-1 py-0.5 text-center focus:ring-2 focus:ring-blue-500 outline-none font-bold border ${inputBg}`} />
                        </div>
                        <div className={`mr-auto flex items-center gap-2 px-3 py-1 rounded-lg border ${darkMode ? 'bg-blue-900/30 border-blue-800 text-blue-300' : 'bg-blue-100 border-blue-200 text-blue-700'}`}>
                            <span className="font-bold text-xs">{t.totalTime}:</span>
                            <span className="font-bold text-base">{fmt(totalTime)} min</span>
                        </div>
                    </div>
                </div>

                <div className="md:col-span-1 flex flex-col h-full">
                    <div className={`group relative w-full flex-1 min-h-[160px] rounded-xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center overflow-hidden cursor-pointer mt-6 md:mt-0 ${darkMode
                        ? 'border-gray-500 bg-gray-800/50 hover:bg-gray-800 hover:border-blue-500'
                        : 'border-slate-400 bg-slate-50 hover:bg-blue-50/50 hover:border-blue-500'
                        }`}>

                        {productImage ? (
                            <div className="relative w-full h-full group/image">
                                <img src={productImage} alt="Product" className="w-full h-full object-cover transition-transform duration-700 group-hover/image:scale-110" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                    <button
                                        onClick={(e) => { e.preventDefault(); setProductImage(null); }}
                                        className="transform scale-90 hover:scale-100 transition-all duration-200 bg-red-500 hover:bg-red-600 text-white p-3 rounded-full shadow-lg flex items-center gap-2"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                        <span className="text-xs font-bold">Delete</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className={`p-4 rounded-full mb-3 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6 ${darkMode ? 'bg-gray-700 text-blue-400' : 'bg-white text-blue-500 shadow-sm'}`}>
                                    <Camera className="w-8 h-8" />
                                </div>
                                <span className={`text-sm font-bold mb-1 group-hover:text-blue-500 transition-colors ${textPrimary}`}>Click to Upload</span>
                                <span className={`text-xs ${textSecondary}`}>JPG, PNG</span>
                                <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ModelInfo;
