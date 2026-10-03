/**
 * Table lettres ↔ nombres de l'usine (XS = 34, S = 36...), reglee dans la
 * Configuration. La Coupe s'en sert pour ranger un trace PLT ou un classeur Excel
 * en lettres dans un modele en nombres, et l'inverse (voir lib/correspondanceTailles.ts).
 *
 * Elle change d'un client a l'autre : si l'un ecrit S = 38, on corrige la ligne.
 */
import React from 'react';
import { ArrowLeftRight, Plus, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { CORRESPONDANCE_DEFAUT, formeLettre, type PaireTaille } from '../../lib/correspondanceTailles';

interface Props {
    valeur: PaireTaille[] | undefined;
    onChange: (t: PaireTaille[] | undefined) => void;
}

const nombreOk = (t: string) => /^\d+([.,]\d+)?$/.test(t.trim());

export default function CorrespondanceTailles({ valeur, onChange }: Props) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const lignes = valeur && valeur.length ? valeur : CORRESPONDANCE_DEFAUT;
    const modifiee = !!valeur && JSON.stringify(valeur) !== JSON.stringify(CORRESPONDANCE_DEFAUT);

    const maj = (i: number, patch: Partial<PaireTaille>) => onChange(lignes.map((p, k) => (k === i ? { ...p, ...patch } : p)));
    const lettresVues = new Map<string, number>();
    const nombresVus = new Map<string, number>();
    lignes.forEach(p => {
        const l = formeLettre(p.lettre), n = p.nombre.trim();
        if (l) lettresVues.set(l, (lettresVues.get(l) || 0) + 1);
        if (n) nombresVus.set(n, (nombresVus.get(n) || 0) + 1);
    });

    return (
        <div className="space-y-3 pb-4 mb-1 border-b border-slate-100 dark:border-dk-border">
            <div className="flex items-start gap-2">
                <ArrowLeftRight className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-dk-text">{L('Lettres ↔ nombres', 'الحروف ↔ الأرقام', 'Letters ↔ numbers')}</h3>
                    <p className="text-[12px] text-slate-500 dark:text-dk-muted">
                        {L(
                            'Un trace ou un classeur en lettres (XS, S, M...) se range dans un modèle en nombres (34, 36, 38...), et l’inverse. À régler selon votre client : S = 36 chez l’un, S = 38 chez l’autre.',
                            'ملف أو جدول بالحروف (XS, S, M...) يُوضع في موديل بالأرقام (34, 36, 38...) والعكس. اضبطه حسب زبونك: S = 36 عند واحد و S = 38 عند آخر.',
                            'A marker or workbook in letters is filed into a model in numbers, and the other way round. Set it to your client: S = 36 for one, S = 38 for another.',
                        )}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {lignes.map((p, i) => {
                    const dupL = (lettresVues.get(formeLettre(p.lettre)) || 0) > 1;
                    const dupN = (nombresVus.get(p.nombre.trim()) || 0) > 1;
                    const nombreMauvais = p.nombre.trim() !== '' && !nombreOk(p.nombre);
                    return (
                        <div key={i} className="flex items-center gap-1.5 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border p-1.5">
                            <input
                                value={p.lettre}
                                onChange={e => maj(i, { lettre: e.target.value.toUpperCase() })}
                                placeholder="XS"
                                aria-label={L('Lettre', 'حرف', 'Letter')}
                                className={`w-20 h-10 px-2 text-center rounded-lg border bg-white dark:bg-dk-surface text-[14px] font-bold uppercase outline-none focus:border-indigo-500 ${dupL ? 'border-rose-400' : 'border-slate-200 dark:border-dk-border'}`}
                            />
                            <span className="text-slate-400 font-bold">=</span>
                            <input
                                value={p.nombre}
                                inputMode="numeric"
                                onChange={e => maj(i, { nombre: e.target.value.replace(/[^\d.,]/g, '') })}
                                placeholder="34"
                                aria-label={L('Nombre', 'رقم', 'Number')}
                                className={`flex-1 min-w-0 h-10 px-2 text-center rounded-lg border bg-white dark:bg-dk-surface text-[14px] font-bold tabular-nums outline-none focus:border-indigo-500 ${dupN || nombreMauvais ? 'border-rose-400' : 'border-slate-200 dark:border-dk-border'}`}
                            />
                            <button
                                type="button"
                                onClick={() => onChange(lignes.filter((_, k) => k !== i))}
                                className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                                title={L('Retirer cette ligne', 'إزالة هذا السطر', 'Remove this row')}
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })}
            </div>

            {[...lettresVues.values(), ...nombresVus.values()].some(n => n > 1) && (
                <p className="flex items-start gap-1.5 text-[12px] font-semibold text-rose-600">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                    {L('Une lettre ne peut avoir qu’un nombre, et un nombre qu’une lettre : les lignes en double sont ignorées.', 'لكل حرف رقم واحد ولكل رقم حرف واحد: السطور المكرّرة تُهمل.', 'One number per letter and one letter per number: duplicates are ignored.')}
                </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => onChange([...lignes, { lettre: '', nombre: '' }])}
                    className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-dk-accent/20 text-indigo-600 dark:text-dk-accent-text border border-indigo-100 text-xs font-bold hover:bg-indigo-100"
                >
                    <Plus className="w-3.5 h-3.5" />{L('Ajouter une ligne', 'إضافة سطر', 'Add a row')}
                </button>
                {modifiee && (
                    <button
                        type="button"
                        onClick={() => onChange(undefined)}
                        className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft text-xs font-bold hover:bg-slate-50"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />{L('Remettre la table d’usage', 'إرجاع الجدول المعتاد', 'Restore the usual table')}
                    </button>
                )}
                <span className="text-[11px] text-slate-400">{L('XXXL et 3XL sont la même taille.', 'XXXL و 3XL نفس المقاس.', 'XXXL and 3XL are the same size.')}</span>
            </div>
        </div>
    );
}
