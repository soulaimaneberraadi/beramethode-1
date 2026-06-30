import React, { useState } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';


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
    designation: string;
    quantite: number;
    prix_unitaire: number;
    total: number;
}

const DEFAULT_LINE: InvoiceFormLine = { designation: '', quantite: 1, prix_unitaire: 0, total: 0 };

export default function InvoiceModalInvoice({ context, onClose, onSaved }: InvoiceModalInvoiceProps) {
    const today = new Date().toISOString().split('T')[0];
    const [form, setForm] = useState({
        type: 'VENTE' as FormType,
        tiers_nom: context.productLabel || '',
        date_invoice: today,
        taux_tva: 20,
        notes: '',
    });
    const [lines, setLines] = useState<InvoiceFormLine[]>([{ ...DEFAULT_LINE }]);
    const [saving, setSaving] = useState(false);

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

    const addLine = () => setLines(prev => [...prev, { ...DEFAULT_LINE }]);
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
                date_invoice: form.date_invoice,
                taux_tva: form.taux_tva,
                notes: form.notes,
                source_module: context.sourceModule.toUpperCase(),
                source_id: String(context.sourceId),
                lines,
                total_ht: totalHT,
                total_tva: totalTVA,
                total_ttc: totalTTC,
            };
            const res = await fetch('/api/invoices', {
                method: 'POST',
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40">
            <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border w-full max-w-3xl max-h-[90vh] flex flex-col shadow-sm">
                <div className="flex items-center justify-between px-5 h-12 border-b border-slate-100 dark:border-dk-border">
                    <h2 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text">Nouvelle facture (contexte {context.sourceModule})</h2>
                    <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 dark:text-dk-muted hover:text-slate-900 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors">
                        <X className="w-3.5" strokeWidth={1.75} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="flex gap-3">
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
                        <div className="border border-slate-200 dark:border-dk-border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
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
                </div>

                <div className="flex items-center justify-end gap-2 px-5 h-12 border-t border-slate-100 dark:border-dk-border">
                    <button onClick={onClose}
                        className="h-8 px-3 text-[12px] font-medium text-slate-700 dark:text-dk-text-soft bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors">
                        Annuler
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="h-8 px-3 bg-slate-900 dark:bg-dk-accent hover:bg-slate-800 dark:hover:bg-dk-accent/90 text-white text-[12px] font-medium rounded-md flex items-center gap-1.5 transition-colors disabled:opacity-50">
                        <Save className="w-3.5" strokeWidth={1.75} />
                        {saving ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                </div>
            </div>
        </div>
    );
}
