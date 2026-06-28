import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

interface NavMenuSettingsProps {
    navConfig: { enabled: boolean; order: string[]; hidden: string[] };
    saveNavConfig: (cfg: { enabled: boolean; order: string[]; hidden: string[] }) => void;
    defaultNavOrder: string[];
    navLabels: Record<string, string>;
    isAdmin?: boolean;
}

export default function NavMenuSettings({ navConfig, saveNavConfig, defaultNavOrder, navLabels, isAdmin }: NavMenuSettingsProps) {
    const { lang } = useLang();
    const [draft, setDraft] = useState(navConfig);
    const [showConfirm, setShowConfirm] = useState(false);
    const order = draft.order.length ? draft.order : [...defaultNavOrder];
    const visibleItems = order.filter(v => v !== 'admin' || isAdmin);
    const isDirty = JSON.stringify(draft) !== JSON.stringify(navConfig);

    const move = (idx: number, dir: -1 | 1) => {
        const newOrder = [...order];
        const target = idx + dir;
        if (target < 0 || target >= newOrder.length) return;
        [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
        setDraft({ ...draft, order: newOrder });
    };
    const toggleHidden = (view: string) => {
        const hidden = draft.hidden.includes(view) ? draft.hidden.filter(v => v !== view) : [...draft.hidden, view];
        setDraft({ ...draft, hidden });
    };
    const handleSave = () => setShowConfirm(true);
    const confirmSave = () => { saveNavConfig(draft); setShowConfirm(false); };
    const handleReset = () => setDraft({ enabled: true, order: [], hidden: [] });

    return (
        <div className="mt-10 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                <Menu className="w-5 h-5 text-indigo-500" /> {tx(lang, { fr: 'Navigation & Menu', ar: 'التنقل والقائمة', en: 'Navigation & Menu', es: 'Navegación y Menú', pt: 'Navegação e Menu', tr: 'Navigasyon ve Menü' })}
            </h2>
            <p className="text-sm text-slate-500 mb-5">{tx(lang, { fr: 'Personnalisez le menu hamburger et l\'ordre des modules.', ar: 'قم بتخصيص قائمة الهامبرغر وترتيب الوحدات.', en: 'Customize the hamburger menu and module order.', es: 'Personalice el menú hamburguesa y el orden de los módulos.', pt: 'Personalize o menu hambúrguer e a ordem dos módulos.', tr: 'Hamburger menüyü ve modül sırasını özelleştirin.' })}</p>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 mb-5">
                <div>
                    <span className="text-sm font-bold text-slate-700">{tx(lang, { fr: 'Menu hamburger (☰)', ar: 'قائمة الهامبرغر (☰)', en: 'Hamburger menu (☰)', es: 'Menú hamburguesa (☰)', pt: 'Menu hambúrguer (☰)', tr: 'Hamburger menü (☰)' })}</span>
                    <p className="text-[11px] text-slate-400">{tx(lang, { fr: 'Afficher le bouton menu rapide dans la barre de navigation', ar: 'إظهار زر القائمة السريعة في شريط التنقل', en: 'Show the quick menu button in the navigation bar', es: 'Mostrar el botón de menú rápido en la barra de navegación', pt: 'Mostrar o botão de menu rápido na barra de navegação', tr: 'Gezinme çubuğunda hızlı menü düğmesini göster' })}</p>
                </div>
                <button onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors relative flex items-center ${draft.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${draft.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
            </div>
            <div className="space-y-1.5 mb-5">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{tx(lang, { fr: 'Ordre des modules', ar: 'ترتيب الوحدات', en: 'Module order', es: 'Orden de módulos', pt: 'Ordem dos módulos', tr: 'Modül sırası' })}</span>
                {visibleItems.map((view, idx) => (
                    <div key={view} className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${draft.hidden.includes(view) ? 'bg-slate-50 dark:bg-dk-bg border-slate-100 opacity-50' : 'bg-white border-slate-200'}`}>
                        <div className="flex flex-col gap-0.5">
                            <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-[10px] leading-none">▲</button>
                            <button onClick={() => move(idx, 1)} disabled={idx === visibleItems.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-[10px] leading-none">▼</button>
                        </div>
                        <span className="text-sm font-semibold text-slate-700 flex-1">{navLabels[view] || view}</span>
                        {view !== 'dashboard' && (
                            <button onClick={() => toggleHidden(view)}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${draft.hidden.includes(view) ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 text-emerald-600 dark:text-emerald-400'}`}>
                                {draft.hidden.includes(view) ? tx(lang, { fr: 'Masqué', ar: 'مخفي', en: 'Hidden', es: 'Oculto', pt: 'Oculto', tr: 'Gizli' }) : tx(lang, { fr: 'Visible', ar: 'مرئي', en: 'Visible', es: 'Visible', pt: 'Visível', tr: 'Görünür' })}
                            </button>
                        )}
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-3">
                <button onClick={handleSave} disabled={!isDirty} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}</button>
                <button onClick={handleReset} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors">{tx(lang, { fr: 'Réinitialiser', ar: 'إعادة تعيين', en: 'Reset', es: 'Restablecer', pt: 'Repor', tr: 'Sıfırla' })}</button>
            </div>
            {showConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
                        <h3 className="text-base font-bold text-slate-800 mb-2">{tx(lang, { fr: 'Confirmer les changements', ar: 'تأكيد التغييرات', en: 'Confirm changes', es: 'Confirmar cambios', pt: 'Confirmar alterações', tr: 'Değişiklikleri onayla' })}</h3>
                        <p className="text-sm text-slate-500 mb-5">{tx(lang, { fr: 'Voulez-vous sauvegarder la nouvelle configuration du menu ?', ar: 'هل تريد حفظ تكوين القائمة الجديد؟', en: 'Do you want to save the new menu configuration?', es: '¿Desea guardar la nueva configuración del menú?', pt: 'Deseja guardar a nova configuração do menu?', tr: 'Yeni menü yapılandırmasını kaydetmek istiyor musunuz?' })}</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50">{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}</button>
                            <button onClick={confirmSave} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">{tx(lang, { fr: 'Confirmer', ar: 'تأكيد', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' })}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
