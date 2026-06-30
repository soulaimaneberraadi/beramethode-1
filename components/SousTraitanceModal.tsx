import React, { useState } from 'react';
import { X, Factory, Scissors, Package, Coins, Check } from 'lucide-react';
import { fmt } from '../constants';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';

export type SousTraitance = {
    active: boolean;
    mode: 'facon' | 'complet';
    prix: number;
};

interface SousTraitanceModalProps {
    currency: string;
    value?: SousTraitance;
    onApply: (value: SousTraitance) => void;
    onClose: () => void;
}

const SousTraitanceModal: React.FC<SousTraitanceModalProps> = ({ currency, value, onApply, onClose }) => {
    const { lang } = useLang();
    const [active, setActive] = useState<boolean>(value?.active ?? false);
    const [mode, setMode] = useState<'facon' | 'complet'>(value?.mode ?? 'facon');
    const [prixStr, setPrixStr] = useState<string>(value?.prix ? String(value.prix) : '');

    const apply = () => {
        onApply({ active, mode, prix: Math.max(0, parseFloat(prixStr) || 0) });
        onClose();
    };

    const modes: { id: 'facon' | 'complet'; icon: React.ReactNode; title: string; desc: string }[] = [
        {
            id: 'facon',
            icon: <Scissors className="w-4 h-4" strokeWidth={1.75} />,
            title: 'Façon',
            desc: 'Le sous-traitant coud seulement. Vous fournissez la matière → Coût = Matières + Prix façon.',
        },
        {
            id: 'complet',
            icon: <Package className="w-4 h-4" strokeWidth={1.75} />,
            title: 'Tout compris',
            desc: 'Le sous-traitant fournit tout (matière + façon) → Coût = Prix sous-traitance seul.',
        },
    ];

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm dark:backdrop-blur-md animate-in fade-in duration-200" dir="ltr">
            <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-xl dark:shadow-dk-elevated w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                <div className="px-5 h-14 border-b border-slate-100 dark:border-dk-border flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Factory className="w-4 h-4 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                        <div>
                            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text tracking-tight">{tx(lang, {fr:"Sous-traitance",ar:"المقاولة من الباطن",en:"Subcontracting",es:"Subcontratación",pt:"Subcontratação",tr:"Taşeronluk"})}</h3>
                            <p className="text-[11px] text-slate-400 dark:text-dk-muted">Modèle confié à un façonnier</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors">
                        <X className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-md bg-slate-50 dark:bg-dk-bg/60 dark:bg-dk-bg/60 border border-slate-200 dark:border-dk-border">
                        <div>
                            <p className="text-[12px] font-semibold text-slate-800 dark:text-dk-text">{tx(lang, {fr:"Activer la sous-traitance",ar:"تفعيل المقاولة من الباطن",en:"Activate subcontracting",es:"Activar subcontratación",pt:"Ativar subcontratação",tr:"Taşeronluğu etkinleştir"})}</p>
                            <p className="text-[11px] text-slate-400 dark:text-dk-muted">Remplace le calcul du temps par un prix fixe / pièce</p>
                        </div>
                        <button
                            onClick={() => setActive(a => !a)}
                            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${active ? 'bg-slate-900 dark:bg-dk-accent' : 'bg-slate-300 dark:bg-slate-600'}`}
                            aria-pressed={active}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-dk-surface rounded-full shadow dark:shadow-dk-elevated transition-transform ${active ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>

                    <div className={`space-y-3 transition-opacity ${active ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {modes.map(m => {
                                const selected = mode === m.id;
                                return (
                                    <button
                                        key={m.id}
                                        onClick={() => setMode(m.id)}
                                        className={`text-left p-3 rounded-md border transition-all ${selected ? 'border-slate-900 dark:border-dk-accent bg-slate-50 dark:bg-dk-bg dark:bg-dk-elevated/60 ring-1 ring-slate-900 dark:ring-dk-accent' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${selected ? 'text-slate-900 dark:text-dk-text dark:text-dk-accent' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                                                {m.icon} {m.title}
                                            </span>
                                            {selected && <Check className="w-3.5 h-3.5 text-slate-900 dark:text-dk-text dark:text-dk-accent" strokeWidth={2.5} />}
                                        </div>
                                        <p className="text-[10.5px] leading-snug text-slate-500 dark:text-dk-muted dark:text-dk-text-soft">{m.desc}</p>
                                    </button>
                                );
                            })}
                        </div>

                        <div>
                            <label className="block text-[11px] font-medium text-slate-500 dark:text-dk-muted dark:text-dk-text-soft mb-1.5">
                                Prix sous-traitance / pièce ({currency})
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={prixStr}
                                    onChange={(e) => setPrixStr(e.target.value)}
                                    className="w-full h-9 pl-9 pr-3 bg-slate-50 dark:bg-dk-bg/60 dark:bg-dk-bg/60 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 focus:bg-white dark:focus:bg-dk-surface border border-slate-200 dark:border-dk-border focus:border-slate-300 dark:focus:border-dk-accent rounded-md text-[13px] font-semibold text-slate-700 dark:text-dk-text-soft dark:text-dk-text focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-border outline-none transition-all tabular-nums"
                                    placeholder="0.00"
                                />
                                <Coins className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
                            </div>
                            <p className="text-[10.5px] text-slate-400 dark:text-dk-muted mt-1.5">
                                {mode === 'facon'
                                    ? 'Le temps des ouvriers (couture / coupe / emballage) sera masqué.'
                                    : 'Le temps des ouvriers ET les matières premières seront masqués.'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 dark:bg-dk-bg px-5 py-4 flex justify-end gap-2.5 border-t border-slate-100 dark:border-dk-border">
                    <button
                        onClick={onClose}
                        className="px-4 h-9 text-[12px] font-medium text-slate-600 dark:text-dk-text-soft bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated transition-colors"
                    >
                        {tx(lang, {fr:"Annuler",ar:"إلغاء",en:"Cancel",es:"Cancelar",pt:"Cancelar",tr:"İptal"})}
                    </button>
                    <button
                        onClick={apply}
                        className="inline-flex items-center gap-1.5 px-4 h-9 text-[12px] font-medium text-white dark:text-white bg-slate-900 dark:bg-dk-accent hover:bg-slate-800 dark:hover:bg-dk-accent/80 rounded-md transition-colors"
                    >
                        <Check className="w-3.5 h-3.5" strokeWidth={2} /> {tx(lang, {fr:"Appliquer",ar:"تطبيق",en:"Apply",es:"Aplicar",pt:"Aplicar",tr:"Uygula"})}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SousTraitanceModal;
