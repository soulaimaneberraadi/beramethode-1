import React from 'react';
import { Settings, Percent, Info, TrendingUp, Receipt, PercentIcon } from 'lucide-react';
import { AppSettings } from '../types';
import { fmt } from '../constants';

interface SettingsPanelProps {
    t: any;
    darkMode: boolean;
    settings: AppSettings;
    handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    bgCard: string;
    bgCardHeader: string;
    textPrimary: string;
    textSecondary: string;
    inputBg: string;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
    t, darkMode, settings, handleChange,
    bgCard, bgCardHeader, textPrimary, textSecondary, inputBg
}) => {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header - Planning Style */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                        <Settings className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-slate-800 tracking-tight">{t.settings}</h2>
                        <p className="text-[11px] text-slate-400 font-medium">Marges & Taxes</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
                {/* Margin Atelier */}
                <div className="group">
                    <label className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {t.margeAtelier}
                        </span>
                        <Info className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </label>
                    <div className="relative">
                        <input
                            name="marginAtelier"
                            type="number"
                            min="0"
                            value={settings.marginAtelier}
                            onChange={handleChange}
                            className="w-full h-11 pl-3 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <Percent className="w-3.5 h-3.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                        </div>
                    </div>
                </div>

                {/* TVA */}
                <div className="group">
                    <label className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {t.tva}
                        </span>
                        <Info className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </label>
                    <div className="relative">
                        <input
                            name="tva"
                            type="number"
                            min="0"
                            value={settings.tva}
                            onChange={handleChange}
                            className="w-full h-11 pl-3 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <Percent className="w-3.5 h-3.5 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                        </div>
                    </div>
                </div>

                {/* Margin Boutique */}
                <div className="group">
                    <label className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {t.margeBoutique}
                        </span>
                        <Info className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </label>
                    <div className="relative">
                        <input
                            name="marginBoutique"
                            type="number"
                            min="0"
                            value={settings.marginBoutique}
                            onChange={handleChange}
                            className="w-full h-11 pl-3 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <Percent className="w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                    </div>
                </div>

                {/* Visual Summary */}
                <div className="pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                            <TrendingUp className="w-3 h-3 text-emerald-500" />
                            <span className="font-semibold text-slate-500">Marge Totale</span>
                        </div>
                        <span className="font-bold text-emerald-600">{settings.marginAtelier + settings.tva + settings.marginBoutique}%</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPanel;
