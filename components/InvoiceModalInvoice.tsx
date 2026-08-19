import React, { useState } from 'react';
import { Plus, Trash2, Save, Receipt } from 'lucide-react';
import SheetModal, { useSheetFullscreen } from './shared/SheetModal';


type FormType = 'VENTE' | 'ACHAT' | 'PRODUCTION' | 'TRANSFERT';

interface InvoiceContext {
    sourceModule: string;
    sourceId: string | number;
    productId?: string | number;
    productLabel?: string;
}

interface InvoiceModalInvoiceProps {
    context: InvoiceContext;
    onClose: () => void;
    onSaved: (facture: any) => void;
}

interface InvoiceFormLine {
    // Rattache la ligne au produit du contexte : c'est ce champ que la fiche
    // produit interroge pour retrouver ses factures. Sans lui, la liste
    // « Factures liées » reste vide quoi qu'on enregistre.
    product_id?: string;
    designation: string;
    quantite: number;
    prix_unitaire: number;
    total: number;
}

const DEFAULT_LINE: InvoiceFormLine = { designation: '', quantite: 1, prix_unitaire: 0, total: 0 };

export default function InvoiceModalInvoice({ context, onClose, onSaved }: InvoiceModalInvoiceProps) {
    const today = new Date().toISOString().split('T')[0];
    const productId = context.productId != null ? String(context.productId) : undefined;
    const newLine = (): InvoiceFormLine => ({
        ...DEFAULT_LINE,
        product_id: productId,
        designation: context.productLabel || '',
    });
    const [form, setForm] = useState({
        type: 'VENTE' as FormType,
        tiers_nom: context.productLabel || '',
        date_invoice: today,
        taux_tva: 20,
        notes: '',
    });
    const [lines, setLines] = useState<InvoiceFormLine[]>([newLine()]);
    const [saving, setSaving] = useState(false);
    /* Fenetre a contenu dense (tableau de lignes) : bouton plein ecran, avec la
       preference partagee par tout le programme. */
    const [sheetFullscreen, toggleSheetFullscreen] = useSheetFullscreen();

    const updateLine = (idx: number, field: keyof InvoiceFormLine, value: string | number) => {
        setLines(prev => {
            const copy = prev.map(l => ({ ...l }));
            (copy[idx] as any)[field] = value;
            if (field === 'quantite' || field === 'prix_unitaire') {
                copy[idx].total = (copy[idx].quantite || 0) * (copy[idx].prix_unitaire || 0);
            }
            return copy;
        });
    };

    const addLine = () => setLines(prev => [...prev, newLine()]);
    const removeLine = (idx: number) => {
        if (lines.length <= 1) return;
        setLines(prev => prev.filter((_, i) => i !== idx));
    };

    const totalHT = lines.reduce((s, l) => s + (l.total || 0), 0);
    const totalTVA = totalHT * (form.taux_tva / 100);
    const totalTTC = totalHT + totalTVA;

    const handleSave = async () => {
        setSaving(true);
        try {
            const body = {
                type: form.type,
                tiers_nom: form.tiers_nom,
                date_facture: form.date_invoice,
                taux_tva: form.taux_tva,
                notes: form.notes,
                source_module: context.sourceModule.toUpperCase(),
                source_id: String(context.sourceId),
                // `product_id` reste porté par chaque ligne : c'est lui qui permet
                // de retrouver la facture depuis la fiche produit.
                lignes: lines,
                total_ht: totalHT,
                total_tva: totalTVA,
                total_ttc: totalTTC,
            };
            const res = await fetch('/api/facturation/factures', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Erreur sauvegarde');
            const saved = await res.json();
            onSaved(saved);
            onClose();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        /* Saisie de facture : le fond ne ferme pas — une facture a demi saisie
           perdue d'un clic distrait, c'est une demi-journee de ressaisie. */
        <SheetModal
            onClose={onClose}
            title={`Nouvelle facture (contexte ${context.sourceModule})`}
            icon={<Receipt className="w-4 h-4 text-indigo-600 dark:text-dk-accent shrink-0" />}
            size="xl"
            zClass="z-50"
            fullscreen={sheetFullscreen}
            onToggleFullscreen={toggleSheetFullscreen}
            closeOnBackdrop={false}
            bodyClassName="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 space-y-4"
            footer={
                <div className="w-full grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3 sm:items-center sm:justify-end">
                    <button onClick={onClose}
                        className="h-9 px-3 text-[12px] font-medium text-slate-700 dark:text-dk-text-soft bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors flex items-center justify-center sm:justify-start">
                        Annuler
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="h-9 px-3 bg-slate-900 dark:bg-dk-accent hover:bg-slate-800 dark:hover:bg-dk-accent/90 text-white text-[12px] font-medium rounded-md flex items-center justify-center sm:justify-start gap-1.5 transition-colors disabled:opacity-50">
                        <Save className="w-3.5" strokeWidth={1.75} />
                        {saving ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                </div>
            }
        >
                <>
                    {/* Deux champs texte : une seule colonne sur telephone, sinon
                        les intitules se coupent et debordent sur le champ voisin. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex-1">
                            <label className="text-[11px] font-medium text-slate-500 dark:text-dk-muted mb-1.5 block">Type</label>
                            <select
                                value={form.type}
                                onChange={e => setForm(f => ({ ...f, type: e.target.value as FormType }))}
                                className="w-full h-8 bg-slate-50/60 dark:bg-dk-bg/60 border border-slate-200 dark:border-dk-border rounded-md px-2.5 text-[12px] text-slate-700 dark:text-dk-text-soft focus:bg-white dark:focus:bg-dk-surface focus:border-slate-300 focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-border outline-none"
                            >
                                <option value="VENTE">Vente</option>
                                <option value="ACHAT">Achat</option>
                                <option value="PRODUCTION">Production</option>
                                <option value="TRANSFERT">Transfert</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="text-[11px] font-medium text-slate-500 dark:text-dk-muted mb-1.5 block">Tiers</label>
                            <input
                                value={form.tiers_nom}
                                onChange={e => setForm(f => ({ ...f, tiers_nom: e.target.value }))}
                                className="w-full h-8 bg-slate-50/60 dark:bg-dk-bg/60 border border-slate-200 dark:border-dk-border rounded-md px-2.5 text-[12px] text-slate-700 dark:text-dk-text-soft focus:bg-white dark:focus:bg-dk-surface focus:border-slate-300 focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-border outline-none"
                                placeholder="Nom du tiers"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[11px] font-medium text-slate-500 dark:text-dk-muted mb-1.5 block">Date facture</label>
                                <input type="date" value={form.date_invoice}
                                onChange={e => setForm(f => ({ ...f, date_invoice: e.target.value }))}
                                className="w-full h-8 bg-slate-50/60 dark:bg-dk-bg/60 border border-slate-200 dark:border-dk-border rounded-md px-2.5 text-[12px] text-slate-700 dark:text-dk-text-soft focus:bg-white dark:focus:bg-dk-surface focus:border-slate-300 focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-border outline-none" />
                        </div>
                        <div className="w-32">
                            <label className="text-[11px] font-medium text-slate-500 dark:text-dk-muted mb-1.5 block">TVA (%)</label>
                            <input type="number" value={form.taux_tva}
                                onChange={e => setForm(f => ({ ...f, taux_tva: Number(e.target.value) }))}
                                className="w-full h-8 bg-slate-50/60 dark:bg-dk-bg/60 border border-slate-200 dark:border-dk-border rounded-md px-2.5 text-[12px] text-slate-700 dark:text-dk-text-soft focus:bg-white dark:focus:bg-dk-surface focus:border-slate-300 focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-border outline-none tabular-nums" />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[11px] font-medium text-slate-500 dark:text-dk-muted">Lignes</label>
                                    <button onClick={addLine} className="h-7 px-2.5 bg-slate-900 dark:bg-dk-accent text-white text-[11px] font-medium rounded-md flex items-center gap-1 hover:bg-slate-800 dark:hover:bg-dk-accent/90 transition-colors">
                                <Plus className="w-3" strokeWidth={2} />
                                Ajouter
                            </button>
                        </div>
                        {/* Le tableau defile dans son propre conteneur : jamais la page. */}
                        <div className="border border-slate-200 dark:border-dk-border rounded-lg overflow-hidden overflow-x-auto">
                            <table className="w-full min-w-[520px] text-sm">
                                <thead className="bg-slate-50/60 dark:bg-dk-bg/60 border-b border-slate-100 dark:border-dk-border">
                                    <tr>
                                        <th className="px-3 py-2 text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide text-left">Désignation</th>
                                        <th className="px-3 py-2 text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide text-right w-20">Qté</th>
                                        <th className="px-3 py-2 text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide text-right w-28">Prix unit.</th>
                                        <th className="px-3 py-2 text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide text-right w-28">Total</th>
                                        <th className="px-3 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {lines.map((l, i) => (
                                        <tr key={i}>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    value={l.designation}
                                                    onChange={e => updateLine(i, 'designation', e.target.value)}
                                                    className="w-full h-7 bg-transparent border-none text-[12px] text-slate-700 dark:text-dk-text-soft outline-none focus:bg-slate-50/60 dark:focus:bg-dk-bg/60 rounded px-1"
                                                    placeholder="Désignation"
                                                />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input type="number" value={l.quantite}
                                                    onChange={e => updateLine(i, 'quantite', Number(e.target.value))}
                                                    className="w-full h-7 bg-transparent border-none text-[12px] text-slate-900 dark:text-dk-text tabular-nums text-right outline-none focus:bg-slate-50/60 dark:focus:bg-dk-bg/60 rounded px-1" min={0} step={1} />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input type="number" value={l.prix_unitaire}
                                                    onChange={e => updateLine(i, 'prix_unitaire', Number(e.target.value))}
                                                    className="w-full h-7 bg-transparent border-none text-[12px] text-slate-900 dark:text-dk-text tabular-nums text-right outline-none focus:bg-slate-50/60 dark:focus:bg-dk-bg/60 rounded px-1" min={0} step={0.01} />
                                            </td>
                                            <td className="px-3 py-1.5 text-[12px] font-semibold text-slate-900 dark:text-dk-text tabular-nums text-right">
                                                {l.total?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <button onClick={() => removeLine(i)}
                                                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 dark:text-dk-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                                                    <Trash2 className="w-3" strokeWidth={1.75} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 dark:border-dk-border pt-3 flex flex-col items-end gap-1">
                        <div className="flex items-center gap-4 text-[12px]">
                            <span className="text-slate-500 dark:text-dk-muted">Total HT</span>
                            <span className="font-semibold text-slate-900 dark:text-dk-text tabular-nums w-28 text-right">{totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD</span>
                        </div>
                        <div className="flex items-center gap-4 text-[12px]">
                            <span className="text-slate-500 dark:text-dk-muted">TVA ({form.taux_tva}%)</span>
                            <span className="font-semibold text-slate-900 dark:text-dk-text tabular-nums w-28 text-right">{totalTVA.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD</span>
                        </div>
                        <div className="flex items-center gap-4 text-[13px] font-semibold text-slate-900 dark:text-dk-text border-t border-slate-200 dark:border-dk-border pt-1 mt-1">
                            <span className="text-slate-700 dark:text-dk-text-soft">Total TTC</span>
                            <span className="tabular-nums w-28 text-right">{totalTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD</span>
                        </div>
                    </div>

                    <div>
                        <label className="text-[11px] font-medium text-slate-500 dark:text-dk-muted mb-1.5 block">Notes</label>
                        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            className="w-full h-16 bg-slate-50/60 dark:bg-dk-bg/60 border border-slate-200 dark:border-dk-border rounded-md px-2.5 py-1.5 text-[12px] text-slate-700 dark:text-dk-text-soft focus:bg-white dark:focus:bg-dk-surface focus:border-slate-300 focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-border outline-none resize-none" />
                    </div>
                </>
        </SheetModal>
    );
}
