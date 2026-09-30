import React, { useState } from 'react';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import { tx } from '../../lib/i18n';
import type { Lang } from '../../app/constants';
import type { ModelData } from '../../types';
import SheetModal from '../shared/SheetModal';

/**
 * SEUILS DE STOCK BAS.
 *
 * Reflet de `st_stock_seuils` : un seuil au niveau MODÈLE (couleur et taille
 * NULL) couvre toutes ses cases ; un seuil au niveau CELLULE prime sur lui
 * pour cette case précise — une couleur qui tourne fort peut avoir un seuil
 * plus haut que le reste du modèle sans dupliquer un réglage sur chaque
 * taille.
 */
export interface StockSeuil {
    id: string;
    modelId: string;
    couleur: string | null;
    taille: string | null;
    seuil: number;
}

const cellKey = (couleur: string | null, taille: string | null) => `${couleur ?? ''}|${taille ?? ''}`;

/** Le seuil applicable à UNE case précise : elle-même si réglée, sinon celui
 *  du modèle entier. `null` = aucune alerte réglée pour cette case. */
export const resolveSeuil = (seuils: StockSeuil[], modelId: string, couleur: string | null, taille: string | null): number | null => {
    const cell = seuils.find(s => s.modelId === modelId && cellKey(s.couleur, s.taille) === cellKey(couleur, taille));
    if (cell) return cell.seuil;
    if (couleur == null && taille == null) return null;
    const model = seuils.find(s => s.modelId === modelId && s.couleur == null && s.taille == null);
    return model ? model.seuil : null;
};

/** Vrai si AU MOINS une case du modèle est à son seuil ou en dessous. Un
 *  modèle sans aucun seuil réglé n'est jamais « bas » — l'alerte est un choix
 *  explicite de l'atelier, jamais une valeur devinée. */
export const isModelLowStock = (
    modelId: string,
    seuils: StockSeuil[],
    matrix: Map<string, number> | undefined,
    colors: Array<{ name: string }>,
    sizes: string[],
    remainingTotal: number,
): boolean => {
    const modelSeuils = seuils.filter(s => s.modelId === modelId);
    if (modelSeuils.length === 0) return false;
    if (!colors.length || !sizes.length) {
        const s = resolveSeuil(seuils, modelId, null, null);
        return s != null && remainingTotal <= s;
    }
    for (const c of colors) {
        for (const sz of sizes) {
            const s = resolveSeuil(seuils, modelId, c.name, sz);
            if (s == null) continue;
            const qty = matrix?.get(`${c.name}|${sz}`) || 0;
            if (qty <= s) return true;
        }
    }
    return false;
};

/** Icône cloche de l'en-tête d'une carte : pleine + accent dès qu'un seuil
 *  existe pour ce modèle (réglé ou déclenché), vide sinon — pour repérer d'un
 *  coup d'œil les modèles déjà surveillés sans ouvrir chaque fiche. */
export const SeuilBell: React.FC<{ has: boolean; low: boolean; onClick: (e: React.MouseEvent) => void; title: string }> = ({ has, low, onClick, title }) => (
    <button
        type="button"
        onClick={e => { e.stopPropagation(); onClick(e); }}
        title={title}
        className={`p-1 rounded-lg transition-colors ${
            low
                ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                : has
                    ? 'text-amber-500 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                    : 'text-slate-300 dark:text-dk-muted hover:text-slate-500 dark:hover:text-dk-text-soft hover:bg-slate-100 dark:hover:bg-dk-elevated'
        }`}
    >
        {has ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
    </button>
);

interface SeuilFormProps {
    lang: Lang;
    model: ModelData;
    displayName: string;
    seuils: StockSeuil[];
    onClose: () => void;
    /** Remonte les lignes modifiées (déjà enregistrées côté serveur) pour que
     *  l'appelant les fusionne dans son état sans tout recharger. */
    onSaved: (rows: StockSeuil[]) => void;
}

/** Petit formulaire : un seuil « modèle » toujours visible, et — si le modèle
 *  a une grille couleur × taille — un détail par case, replié par défaut pour
 *  rester léger dans le cas courant (un seul seuil global). */
const SeuilForm: React.FC<SeuilFormProps> = ({ lang, model, displayName, seuils, onClose, onSaved }) => {
    const fiche: any = model.ficheData || {};
    const colors: Array<{ id: string; name: string }> = fiche.colors || [];
    const sizes: string[] = fiche.sizes || [];
    const hasGrid = colors.length > 0 && sizes.length > 0;

    const modelSeuil = resolveSeuil(seuils, model.id, null, null);
    const [global, setGlobal] = useState<number | ''>(modelSeuil ?? '');
    const [detail, setDetail] = useState(false);
    const [cellValues, setCellValues] = useState<Record<string, number | ''>>(() => {
        const init: Record<string, number | ''> = {};
        if (hasGrid) {
            for (const c of colors) for (const sz of sizes) {
                const cell = seuils.find(s => s.modelId === model.id && s.couleur === c.name && s.taille === sz);
                if (cell) init[`${c.name}|${sz}`] = cell.seuil;
            }
        }
        return init;
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const post = async (couleur: string | null, taille: string | null, seuil: number | '') => {
        const res = await fetch('/api/subcontract/seuils', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId: model.id, couleur, taille, seuil: seuil === '' ? 0 : seuil }),
        });
        if (!res.ok) throw new Error();
        return res.json();
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const rows: StockSeuil[] = [];
            const g = await post(null, null, global);
            if (!g.deleted) rows.push({ id: g.id, modelId: model.id, couleur: null, taille: null, seuil: g.seuil });
            if (hasGrid) {
                for (const c of colors) for (const sz of sizes) {
                    const k = `${c.name}|${sz}`;
                    const before = seuils.find(s => s.modelId === model.id && s.couleur === c.name && s.taille === sz);
                    const now = cellValues[k];
                    // On ne réécrit que ce qui a changé : éviter N requêtes pour
                    // une grille de 30 cases quand une seule a bougé.
                    if ((before?.seuil ?? '') === now) continue;
                    const r = await post(c.name, sz, now);
                    if (!r.deleted) rows.push({ id: r.id, modelId: model.id, couleur: c.name, taille: sz, seuil: r.seuil });
                }
            }
            onSaved(rows);
            onClose();
        } catch {
            setError(tx(lang, { fr: "L'enregistrement a échoué.", ar: 'فشل التسجيل.', en: 'Saving failed.', es: 'Error al guardar.', pt: 'Falha ao guardar.', tr: 'Kaydetme başarısız.' }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SheetModal
            onClose={onClose}
            title={tx(lang, { fr: 'Seuil de stock bas', ar: 'عتبة المخزون المنخفض', en: 'Low-stock threshold', es: 'Umbral de stock bajo', pt: 'Limite de stock baixo', tr: 'Düşük stok eşiği' })}
            subtitle={displayName}
            icon={<Bell className="w-4 h-4 text-amber-500 shrink-0" />}
            size="md"
            zClass="z-[240]"
            closeOnBackdrop
            bare
        >
            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
                <p className="text-[11px] text-slate-500 dark:text-dk-muted leading-relaxed">
                    {tx(lang, {
                        fr: "Le seuil du modèle s'applique à toutes ses cases. Un seuil réglé sur une case précise le remplace pour elle seule.",
                        ar: 'عتبة الموديل كتطبّق على جميع الحالات ديالو. عتبة مضبوطة فحالة معيّنة كتعوّضها فيها بوحدها.',
                        en: 'The model threshold applies to every cell. A threshold set on a specific cell overrides it for that cell only.',
                        es: 'El umbral del modelo se aplica a todas sus celdas. Un umbral en una celda concreta lo sustituye solo en esa celda.',
                        pt: 'O limite do modelo aplica-se a todas as suas células. Um limite numa célula específica substitui-o apenas nela.',
                        tr: 'Model eşiği tüm hücrelere uygulanır. Belirli bir hücreye ayarlanan eşik yalnızca o hücrede geçerlidir.',
                    })}
                </p>

                <div>
                    <label className="block text-[10px] uppercase tracking-wide text-slate-400 dark:text-dk-muted font-semibold mb-1">
                        {tx(lang, { fr: 'Seuil du modèle (toutes cases)', ar: 'عتبة الموديل (كل الحالات)', en: 'Model threshold (all cells)', es: 'Umbral del modelo (todas las celdas)', pt: 'Limite do modelo (todas as células)', tr: 'Model eşiği (tüm hücreler)' })}
                    </label>
                    <input
                        type="number"
                        min={0}
                        value={global}
                        placeholder={tx(lang, { fr: 'Aucun', ar: 'بلا', en: 'None', es: 'Ninguno', pt: 'Nenhum', tr: 'Yok' })}
                        onChange={e => setGlobal(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-32 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-[13px] font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                    />
                </div>

                {hasGrid && (
                    <div>
                        <button
                            type="button"
                            onClick={() => setDetail(v => !v)}
                            className="text-[11px] font-bold text-indigo-600 dark:text-dk-accent hover:underline"
                        >
                            {detail
                                ? tx(lang, { fr: 'Masquer le détail par case', ar: 'خبّي التفصيل بحسب الحالة', en: 'Hide per-cell detail', es: 'Ocultar detalle por celda', pt: 'Ocultar detalhe por célula', tr: 'Hücre bazlı ayrıntıyı gizle' })
                                : tx(lang, { fr: 'Régler des seuils par couleur × taille', ar: 'ضبط عتبات باللون × المقاس', en: 'Set thresholds per color × size', es: 'Ajustar umbrales por color × talla', pt: 'Definir limites por cor × tamanho', tr: 'Renk × beden bazlı eşik ayarla' })}
                        </button>
                        {detail && (
                            <div className="mt-2 overflow-x-auto border border-slate-200 dark:border-dk-border rounded-xl">
                                <table className="w-full text-[11px]">
                                    <thead className="bg-slate-50 dark:bg-dk-bg text-slate-400 dark:text-dk-muted uppercase text-[9px]">
                                        <tr>
                                            <th className="px-2 py-1.5 text-left font-medium">{tx(lang, { fr: 'Couleur', ar: 'اللون', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' })}</th>
                                            {sizes.map(sz => <th key={sz} className="px-1 py-1.5 text-center font-medium">{sz}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                        {colors.map(c => (
                                            <tr key={c.id}>
                                                <td className="px-2 py-1 font-semibold text-slate-700 dark:text-dk-text-soft whitespace-nowrap">{c.name}</td>
                                                {sizes.map(sz => {
                                                    const k = `${c.name}|${sz}`;
                                                    return (
                                                        <td key={sz} className="px-1 py-1 text-center">
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                value={cellValues[k] ?? ''}
                                                                placeholder={global === '' ? '—' : String(global)}
                                                                onChange={e => setCellValues(prev => ({
                                                                    ...prev,
                                                                    [k]: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0),
                                                                }))}
                                                                className="w-12 text-center rounded-md px-1 py-1 text-[10px] bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">{error}</p>
                )}
            </div>
            <div className="p-3 border-t border-slate-100 dark:border-dk-border flex items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl text-[11px] font-bold text-slate-600 dark:text-dk-text-soft bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated">
                    {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}
                </button>
                <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-dk-accent dark:hover:bg-dk-accent/90 disabled:opacity-60"
                >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {tx(lang, { fr: 'Enregistrer', ar: 'تسجيل', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}
                </button>
            </div>
        </SheetModal>
    );
};

export default SeuilForm;
