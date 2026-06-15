import React from 'react';
import { Settings, Percent, Info, TrendingUp, Receipt, PercentIcon } from 'lucide-react';
import { AppSettings } from '../types';
import { fmt } from '../constants';
import NumberInput from './ui/NumberInput';

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
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {/* Header - Planning Style */}
            <div className="px-5 h-12 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    <div>
                        <h2 className="text-[13px] font-semibold text-slate-900 tracking-tight">{t.settings}</h2>
                        <p className="text-[11px] text-slate-400">Marges &amp; taxes</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
                {/* Margin Atelier */}
                <div className="group">
                    <label className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-medium text-slate-500">
                            {t.margeAtelier}
                        </span>
                        <Info className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </label>
                    <div className="relative">
                        <NumberInput
                            name="marginAtelier"
                            min={0}
                            value={settings.marginAtelier}
                            onChange={handleChange}
                            className="w-full h-9 pl-3 pr-10 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-slate-300 rounded-md text-[13px] font-semibold text-slate-700 focus:ring-2 focus:ring-slate-100 outline-none transition-all tabular-nums"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <Percent className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                        </div>
                    </div>
                </div>

                {/* TVA */}
                <div className="group">
                    <label className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-medium text-slate-500">
                            {t.tva}
                        </span>
                        <Info className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </label>
                    <div className="relative">
                        <NumberInput
                            name="tva"
                            min={0}
                            value={settings.tva}
                            onChange={handleChange}
                            className="w-full h-9 pl-3 pr-10 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-slate-300 rounded-md text-[13px] font-semibold text-slate-700 focus:ring-2 focus:ring-slate-100 outline-none transition-all tabular-nums"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <Percent className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                        </div>
                    </div>
                </div>

                {/* Margin Boutique */}
                <div className="group">
                    <label className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-medium text-slate-500">
                            {t.margeBoutique}
                        </span>
                        <Info className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </label>
                    <div className="relative">
                        <NumberInput
                            name="marginBoutique"
                            min={0}
                            value={settings.marginBoutique}
                            onChange={handleChange}
                            className="w-full h-9 pl-3 pr-10 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-slate-300 rounded-md text-[13px] font-semibold text-slate-700 focus:ring-2 focus:ring-slate-100 outline-none transition-all tabular-nums"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <Percent className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                        </div>
                    </div>
                </div>

                {/* Visual Summary */}
                <div className="pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2149C1]" />
                            <span className="text-[12px] text-slate-500">Marge Totale</span>
                        </div>
                        <span className="text-[13px] font-semibold text-slate-900 tabular-nums">{settings.marginAtelier + settings.tva + settings.marginBoutique}%</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPanel;
