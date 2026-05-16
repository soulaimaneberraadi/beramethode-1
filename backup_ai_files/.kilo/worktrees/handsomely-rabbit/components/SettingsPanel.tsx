import React from 'react';
import { Settings, Percent, Info } from 'lucide-react';
import { AppSettings } from '../types';

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
        <div className={`rounded-xl shadow-sm border overflow-hidden ${bgCard}`}>
            <div className={`px-4 py-3 border-b flex items-center justify-between ${bgCardHeader}`}>
                <div className="flex items-center gap-2">
                    <div className="bg-slate-200 dark:bg-slate-700 p-1.5 rounded-md">
                        <Settings className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </div>
                    <h2 className={`font-semibold ${textPrimary}`}>{t.settings}</h2>
                </div>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
                <div>
                    <label className={`flex items-center gap-1 mb-2 font-bold text-xs uppercase tracking-wide ${textSecondary}`} title="Applied to Cost Price to get Sell Price HT">
                        {t.margeAtelier} <Info className="w-3 h-3 opacity-50 cursor-help" />
                    </label>
                    <div className="relative group">
                        <input
                            name="marginAtelier"
                            type="number"
                            min="0"
                            value={settings.marginAtelier}
                            onChange={handleChange}
                            className={`w-full border-2 rounded-lg p-2.5 pr-8 focus:border-blue-500 outline-none transition-all font-bold text-lg ${inputBg}`}
                        />
                        <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 group-focus-within:text-blue-500" />
                    </div>
                </div>
                <div>
                    <label className={`flex items-center gap-1 mb-2 font-bold text-xs uppercase tracking-wide ${textSecondary}`} title="Applied to Sell Price HT">
                        {t.tva} <Info className="w-3 h-3 opacity-50 cursor-help" />
                    </label>
                    <div className="relative group">
                        <input
                            name="tva"
                            type="number"
                            min="0"
                            value={settings.tva}
                            onChange={handleChange}
                            className={`w-full border-2 rounded-lg p-2.5 pr-8 focus:border-blue-500 outline-none transition-all font-bold text-lg ${inputBg}`}
                        />
                        <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 group-focus-within:text-blue-500" />
                    </div>
                </div>
                <div>
                    <label className={`flex items-center gap-1 mb-2 font-bold text-xs uppercase tracking-wide ${textSecondary}`} title="Applied to Sell Price TTC">
                        {t.margeBoutique} <Info className="w-3 h-3 opacity-50 cursor-help" />
                    </label>
                    <div className="relative group">
                        <input
                            name="marginBoutique"
                            type="number"
                            min="0"
                            value={settings.marginBoutique}
                            onChange={handleChange}
                            className={`w-full border-2 rounded-lg p-2.5 pr-8 focus:border-blue-500 outline-none transition-all font-bold text-lg ${inputBg}`}
                        />
                        <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 group-focus-within:text-blue-500" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPanel;
