
import React from 'react';
import { Package, Plus, Trash2, Info, TrendingUp, Percent, ShoppingCart, Banknote, Clock, Settings, Coins } from 'lucide-react';
import { Material, AppSettings, PurchasingData } from '../types';
import { fmt } from '../constants';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';

// --- MATERIALS LIST COMPONENT ---
export const MaterialsList = ({ 
  t, currency, materials, addMaterial, updateMaterial, deleteMaterial, totalMaterials 
}: any) => {
  const { lang } = useLang();
  return (
    <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-dk-border flex justify-between items-center bg-slate-50 dark:bg-dk-bg">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-500 dark:text-dk-muted" />
          <h2 className="font-bold text-slate-700 dark:text-dk-text-soft text-sm">{t.materials}</h2>
        </div>
        <button onClick={addMaterial} className="text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition shadow-sm dark:shadow-dk-sm">
          <Plus className="w-3 h-3" /> {t.addMat}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted uppercase tracking-wider border-b border-slate-200 dark:border-dk-border">
            <tr>
              <th className="px-4 py-2 font-semibold">{t.matName}</th>
              <th className="px-4 py-2 font-semibold w-24">{t.price}</th>
              <th className="px-4 py-2 font-semibold w-40 text-center">{t.qtyUnit}</th>
              <th className="px-4 py-2 font-semibold w-24 text-right">{t.total}</th>
              <th className="px-4 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
            {materials.map((item: Material) => (
              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors group">
                <td className="p-2">
                  <input type="text" value={item.name} onChange={(e) => updateMaterial(item.id, 'name', e.target.value)} className="w-full rounded border border-slate-200 dark:border-dk-border px-2 py-1 outline-none focus:border-blue-500" placeholder={tx(lang, {fr:'Nomâ€¦',ar:'Ø§Ù„Ø§Ø³Ù…â€¦',en:'Nameâ€¦',es:'Nombreâ€¦',pt:'Nomeâ€¦',tr:'Adâ€¦'})} />
                </td>
                <td className="p-2">
                  <input type="number" min="0" value={item.unitPrice} onChange={(e) => updateMaterial(item.id, 'unitPrice', e.target.value)} className="w-full rounded border border-slate-200 dark:border-dk-border px-2 py-1 text-center outline-none focus:border-blue-500" />
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" step="0.01" value={item.qty} onChange={(e) => updateMaterial(item.id, 'qty', e.target.value)} className="w-16 rounded border border-slate-200 dark:border-dk-border px-2 py-1 text-center outline-none focus:border-blue-500" />
                    <select value={item.unit} onChange={(e) => updateMaterial(item.id, 'unit', e.target.value)} className="w-16 rounded border border-slate-200 dark:border-dk-border px-1 py-1 text-xs outline-none bg-white dark:bg-dk-surface">
                        <option value="m">m</option><option value="pc">pc</option><option value="kg">kg</option><option value="g">g</option><option value="bobine">bobine</option>
                    </select>
                  </div>
                </td>
                <td className="p-2 text-right font-bold text-slate-700 dark:text-dk-text-soft">
                   {fmt(item.unitPrice * item.qty)} <span className="text-[9px] text-slate-400 dark:text-dk-muted">{currency}</span>
                </td>
                <td className="p-2 text-center">
                  <button onClick={() => deleteMaterial(item.id)} className="text-slate-300 dark:text-dk-muted hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 dark:bg-dk-bg border-t border-slate-200 dark:border-dk-border font-bold text-slate-700 dark:text-dk-text-soft">
            <tr>
              <td colSpan={3} className="px-4 py-2 text-right text-xs uppercase">{t.totalMat}:</td>
              <td className="px-4 py-2 text-right bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 border-l border-emerald-100">{fmt(totalMaterials)} {currency}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// --- ORDER SIMULATION COMPONENT ---
export const OrderSimulation = ({ 
  t, currency, orderQty, setOrderQty, wasteRate, setWasteRate, purchasingData, totalPurchasingMatCost, laborCost 
}: any) => {
  const totalProjectCost = totalPurchasingMatCost + (laborCost * orderQty);
  return (
    <div className="bg-white dark:bg-dk-surface rounded-xl border border-indigo-100 shadow-sm dark:shadow-dk-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/50 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" />
          <h2 className="font-bold text-indigo-900 text-sm">{t.needs}</h2>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-dk-surface px-2 py-1 rounded border border-indigo-100 shadow-sm dark:shadow-dk-sm">
            <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{t.waste}</span>
            <input type="number" min="0" value={wasteRate} onChange={(e) => setWasteRate(Math.max(0, parseFloat(e.target.value) || 0))} className="w-10 text-center font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text outline-none text-xs" />
            <Percent className="w-3 h-3 text-indigo-400" />
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-dk-surface px-2 py-1 rounded border border-indigo-100 shadow-sm dark:shadow-dk-sm">
            <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{t.orderQty}</span>
            <input type="number" min="1" value={orderQty} onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 0))} className="w-14 text-center font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text outline-none text-xs" />
            <ShoppingCart className="w-3 h-3 text-indigo-400" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-dk-border">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted font-medium">
                <tr>
                  <th className="px-3 py-2 text-left">{t.matName}</th>
                  <th className="px-3 py-2 text-center">{t.price}</th>
                  <th className="px-3 py-2 text-center font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text">{t.qtyToBuy}</th>
                  <th className="px-3 py-2 text-right">{t.totalLine}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-dk-border">
                {purchasingData.map((m: PurchasingData) => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                    <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-dk-text-soft">{m.name}</td>
                    <td className="px-3 py-1.5 text-center text-slate-500 dark:text-dk-muted">{m.unitPrice}</td>
                    <td className="px-3 py-1.5 text-center font-bold text-indigo-700 dark:text-dk-accent-text bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/50">{fmt(m.qtyToBuy)} {m.unit}</td>
                    <td className="px-3 py-1.5 text-right font-bold text-slate-700 dark:text-dk-text-soft">{fmt(m.lineCost)} {currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{t.realBudget}</span>
                <div className="flex items-center justify-between mt-1">
                     <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(totalPurchasingMatCost)} <span className="text-xs">{currency}</span></span>
                     <Banknote className="w-4 h-4 text-emerald-400" />
                </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{t.laborCost} (Total)</span>
                <div className="flex items-center justify-between mt-1">
                     <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{fmt(laborCost * orderQty)} <span className="text-xs">{currency}</span></span>
                     <Clock className="w-4 h-4 text-blue-400" />
                </div>
            </div>
            <div className="p-3 rounded-lg bg-indigo-600 dark:bg-dk-accent text-white shadow-md dark:shadow-dk-md flex flex-col justify-between">
                <span className="text-[10px] font-bold text-indigo-200 uppercase">{t.totalBudget}</span>
                <div className="flex items-center justify-between mt-1">
                    <span className="text-2xl font-black">{fmt(totalProjectCost)} <span className="text-xs">{currency}</span></span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

// --- SETTINGS PANEL COMPONENT ---
export const SettingsPanel = ({ t, settings, handleChange }: any) => {
  return (
    <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-dk-border flex items-center gap-2 bg-slate-50 dark:bg-dk-bg">
        <Settings className="w-4 h-4 text-slate-500 dark:text-dk-muted" />
        <h2 className="font-bold text-slate-700 dark:text-dk-text-soft text-sm">{t.settings}</h2>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
            { label: t.margeAtelier, name: 'marginAtelier', value: settings.marginAtelier, icon: Percent },
            { label: t.tva, name: 'tva', value: settings.tva, icon: Percent },
            { label: t.margeBoutique, name: 'marginBoutique', value: settings.marginBoutique, icon: Percent },
        ].map((field) => (
            <div key={field.name} className="relative group">
                <label className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-1 block">{field.label}</label>
                <div className="relative">
                    <input name={field.name} type="number" min="0" value={field.value} onChange={handleChange} className="w-full border rounded-lg p-2 pr-8 outline-none focus:border-blue-500 font-bold text-slate-700 dark:text-dk-text-soft text-sm" />
                    <field.icon className="w-3 h-3 text-slate-400 dark:text-dk-muted absolute right-3 top-3 group-focus-within:text-blue-500" />
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};
