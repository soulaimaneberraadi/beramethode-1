import React, { useState } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { Facture, FactureLigne, FactureType, FactureStatut } from '../types';

interface FactureModalProps {
    facture: Partial<Facture>;
    onClose: () => void;
    onSaved: () => void;
}

const DEFAULT_LIGNE: FactureLigne = { designation: '', quantite: 1, prix_unitaire: 0, total: 0 };

export default function FactureModal({ facture, onClose, onSaved }: FactureModalProps) {
    const isNew = !facture.id;
    const [form, setForm] = useState({
        type: facture.type || 'VENTE',
        tiers_nom: facture.tiers_nom || '',
        tiers_ice: facture.tiers_ice || '',
        tiers_rc: facture.tiers_rc || '',
        tiers_if: facture.tiers_if || '',
        tiers_adresse: facture.tiers_adresse || '',
        tiers_tel: facture.tiers_tel || '',
        tiers_email: facture.tiers_email || '',
        date_facture: facture.date_facture || new Date().toISOString().split('T')[0],
        date_echeance: facture.date_echeance || '',
        taux_tva: facture.taux_tva ?? 20,
        notes: facture.notes || '',
        statut: facture.statut || 'BROUILLON',
    });
    const [lignes, setLignes] = useState<FactureLigne[]>(facture.lignes || [{ ...DEFAULT_LIGNE }]);
    const [saving, setSaving] = useState(false);

    const updateLigne = (idx: number, field: keyof FactureLigne, value: string | number) => {
        setLignes(prev => {
            const copy = prev.map(l => ({ ...l }));
            (copy[idx] as any)[field] = value;
            if (field === 'quantite' || field === 'prix_unitaire') {
                copy[idx].total = (copy[idx].quantite || 0) * (copy[idx].prix_unitaire || 0);
            }
            return copy;
        });
    };

    const addLigne = () => setLignes(prev => [...prev, { ...DEFAULT_LIGNE }]);
    const removeLigne = (idx: number) => {
        if (lignes.length <= 1) return;
        setLignes(prev => prev.filter((_, i) => i !== idx));
    };

    const totalHT = lignes.reduce((s, l) => s + (l.total || 0), 0);
    const totalTVA = totalHT * (form.taux_tva / 100);
    const totalTTC = totalHT + totalTVA;

    const handleSave = async () => {
        setSaving(true);
        try {
            const body = {
                ...facture,
                ...form,
                lignes,
                total_ht: totalHT,
                total_tva: totalTVA,
                total_ttc: totalTTC,
                id: isNew ? undefined : facture.id,
            };
            const res = await fetch('/api/facturation/factures', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Erreur sauvegarde');
            onSaved();
            onClose();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className="bg-white rounded-lg border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between px-5 h-12 border-b border-slate-100">
                    <h2 className="text-[13px] font-semibold text-slate-900">
                        {isNew ? 'Nouvelle Facture' : `Modifier ${facture.numero || ''}`}
                    </h2>
                    <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                        <X className="w-3.5" strokeWidth={1.75} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Type + Statut */}
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">Type</label>
                            <select
                                value={form.type}
                                onChange={e => setForm(f => ({ ...f, type: e.target.value as FactureType }))}
                                className="w-full h-8 bg-slate-50/60 border border-slate-200 rounded-md px-2.5 text-[12px] text-slate-700 focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none"
                            >
                                <option value="VENTE">Facture Vente</option>
                                <option value="ACHAT">Facture Achat</option>
                                <option value="DEVIS">Devis</option>
                                <option value="PROFORMA">Proforma</option>
                                <option value="AVOIR">Avoir</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">Statut</label>
                            <select
                                value={form.statut}
                                onChange={e => setForm(f => ({ ...f, statut: e.target.value as FactureStatut }))}
                                className="w-full h-8 bg-slate-50/60 border border-slate-200 rounded-md px-2.5 text-[12px] text-slate-700 focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none"
                            >
                                <option value="BROUILLON">Brouillon</option>
                                <option value="ENVOYEE">Envoyée</option>
                                <option value="PAYEE">Payée</option>
                                <option value="ANNULEE">Annulée</option>
                            </select>
                        </div>
                    </div>

                    {/* Client / Fournisseur */}
                    <div>
                        <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">
                            {form.type === 'ACHAT' ? 'Fournisseur' : 'Client'}
                        </label>
                        <input
                            value={form.tiers_nom}
                            onChange={e => setForm(f => ({ ...f, tiers_nom: e.target.value }))}
                            className="w-full h-8 bg-slate-50/60 border border-slate-200 rounded-md px-2.5 text-[12px] text-slate-700 focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none"
                            placeholder="Nom du tiers"
                        />
                    </div>

                    {/* ICE / RC / IF */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">ICE</label>
                            <input value={form.tiers_ice} onChange={e => setForm(f => ({ ...f, tiers_ice: e.target.value }))}
                                className="w-full h-8 bg-slate-50/60 border border-slate-200 rounded-md px-2.5 text-[12px] focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none" />
                        </div>
                        <div>
                            <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">RC</label>
                            <input value={form.tiers_rc} onChange={e => setForm(f => ({ ...f, tiers_rc: e.target.value }))}
                                className="w-full h-8 bg-slate-50/60 border border-slate-200 rounded-md px-2.5 text-[12px] focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none" />
                        </div>
                        <div>
                            <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">IF</label>
                            <input value={form.tiers_if} onChange={e => setForm(f => ({ ...f, tiers_if: e.target.value }))}
                                className="w-full h-8 bg-slate-50/60 border border-slate-200 rounded-md px-2.5 text-[12px] focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none" />
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">Date facture</label>
                            <input type="date" value={form.date_facture} onChange={e => setForm(f => ({ ...f, date_facture: e.target.value }))}
                                className="w-full h-8 bg-slate-50/60 border border-slate-200 rounded-md px-2.5 text-[12px] focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none" />
                        </div>
                        <div>
                            <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">Échéance</label>
                            <input type="date" value={form.date_echeance} onChange={e => setForm(f => ({ ...f, date_echeance: e.target.value }))}
                                className="w-full h-8 bg-slate-50/60 border border-slate-200 rounded-md px-2.5 text-[12px] focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none" />
                        </div>
                    </div>

                    {/* TVA */}
                    <div className="w-32">
                        <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">TVA (%)</label>
                        <input type="number" value={form.taux_tva} onChange={e => setForm(f => ({ ...f, taux_tva: Number(e.target.value) }))}
                            className="w-full h-8 bg-slate-50/60 border border-slate-200 rounded-md px-2.5 text-[12px] focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none tabular-nums" />
                    </div>

                    {/* Lignes */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[11px] font-medium text-slate-500">Lignes</label>
                            <button onClick={addLigne} className="h-7 px-2.5 bg-slate-900 text-white text-[11px] font-medium rounded-md flex items-center gap-1 hover:bg-slate-800 transition-colors">
                                <Plus className="w-3" strokeWidth={2} />
                                Ajouter
                            </button>
                        </div>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/60 border-b border-slate-100">
                                    <tr>
                                        <th className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide text-left">Désignation</th>
                                        <th className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide text-right w-20">Qté</th>
                                        <th className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide text-right w-28">Prix unit.</th>
                                        <th className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide text-right w-28">Total</th>
                                        <th className="px-3 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {lignes.map((l, i) => (
                                        <tr key={i}>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    value={l.designation}
                                                    onChange={e => updateLigne(i, 'designation', e.target.value)}
                                                    className="w-full h-7 bg-transparent border-none text-[12px] text-slate-700 outline-none focus:bg-slate-50/60 rounded px-1"
                                                    placeholder="Désignation"
                                                />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input type="number" value={l.quantite}
                                                    onChange={e => updateLigne(i, 'quantite', Number(e.target.value))}
                                                    className="w-full h-7 bg-transparent border-none text-[12px] text-slate-900 tabular-nums text-right outline-none focus:bg-slate-50/60 rounded px-1" min={0} step={1} />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input type="number" value={l.prix_unitaire}
                                                    onChange={e => updateLigne(i, 'prix_unitaire', Number(e.target.value))}
                                                    className="w-full h-7 bg-transparent border-none text-[12px] text-slate-900 tabular-nums text-right outline-none focus:bg-slate-50/60 rounded px-1" min={0} step={0.01} />
                                            </td>
                                            <td className="px-3 py-1.5 text-[12px] font-semibold text-slate-900 tabular-nums text-right">
                                                {l.total?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <button onClick={() => removeLigne(i)}
                                                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                                    <Trash2 className="w-3" strokeWidth={1.75} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Totaux */}
                    <div className="border-t border-slate-100 pt-3 flex flex-col items-end gap-1">
                        <div className="flex items-center gap-4 text-[12px]">
                            <span className="text-slate-500">Total HT</span>
                            <span className="font-semibold text-slate-900 tabular-nums w-28 text-right">{totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD</span>
                        </div>
                        <div className="flex items-center gap-4 text-[12px]">
                            <span className="text-slate-500">TVA ({form.taux_tva}%)</span>
                            <span className="font-semibold text-slate-900 tabular-nums w-28 text-right">{totalTVA.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD</span>
                        </div>
                        <div className="flex items-center gap-4 text-[13px] font-semibold text-slate-900 border-t border-slate-200 pt-1 mt-1">
                            <span className="text-slate-700">Total TTC</span>
                            <span className="tabular-nums w-28 text-right">{totalTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD</span>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">Notes</label>
                        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            className="w-full h-16 bg-slate-50/60 border border-slate-200 rounded-md px-2.5 py-1.5 text-[12px] text-slate-700 focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 outline-none resize-none" />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 h-12 border-t border-slate-100">
                    <button onClick={onClose}
                        className="h-8 px-3 text-[12px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">
                        Annuler
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium rounded-md flex items-center gap-1.5 transition-colors disabled:opacity-50">
                        <Save className="w-3.5" strokeWidth={1.75} />
                        {saving ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                </div>
            </div>
        </div>
    );
}
