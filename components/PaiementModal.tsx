import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, DollarSign } from 'lucide-react';
import { Paiement, Facture } from '../types';

interface PaiementModalProps {
    facture: Facture;
    onClose: () => void;
    onUpdated: (montant_paye: number, statut: string) => void;
}

const MODES = ['VIREMENT', 'CHEQUE', 'ESPECES', 'LCN'] as const;

export default function PaiementModal({ facture, onClose, onUpdated }: PaiementModalProps) {
    const [paiements, setPaiements] = useState<Paiement[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPaiements();
    }, []);

    const fetchPaiements = async () => {
        try {
            const res = await fetch(`/api/facturation/paiements/${facture.id}`);
            if (!res.ok) throw new Error('Erreur chargement');
            const data = await res.json();
            setPaiements(data);
        } catch (e: any) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const totalPaye = paiements.reduce((s, p) => s + (p.montant || 0), 0);
    const reste = (facture.total_ttc || 0) - totalPaye;

    const handleAdd = async () => {
        const montant = prompt('Montant du paiement:');
        if (!montant) return;
        const val = parseFloat(montant);
        if (isNaN(val) || val <= 0) return;
        const mode = prompt('Mode (VIREMENT/CHEQUE/ESPECES/LCN):', 'VIREMENT') || 'VIREMENT';
        if (!MODES.includes(mode as any)) return;

        try {
            const res = await fetch('/api/facturation/paiements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    facture_id: facture.id,
                    date_paiement: new Date().toISOString().split('T')[0],
                    montant: val,
                    mode,
                }),
            });
            if (!res.ok) throw new Error('Erreur');
            const data = await res.json();
            onUpdated(data.montant_paye, data.statut);
            await fetchPaiements();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleDelete = async (p: Paiement) => {
        try {
            const res = await fetch(`/api/facturation/paiements/${p.facture_id}/${p.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Erreur');
            const data = await res.json();
            onUpdated(data.montant_paye, data.statut);
            await fetchPaiements();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const formatCurr = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2 });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className="bg-white rounded-lg border border-slate-200 w-full max-w-md shadow-sm">
                <div className="flex items-center justify-between px-5 h-12 border-b border-slate-100">
                    <h2 className="text-[13px] font-semibold text-slate-900">
                        Paiements — {facture.numero}
                    </h2>
                    <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                        <X className="w-3.5" strokeWidth={1.75} />
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    {/* Résumé */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-50/60 rounded-md p-3 text-center">
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Total TTC</p>
                            <p className="text-[13px] font-semibold text-slate-900 tabular-nums mt-1">{formatCurr(facture.total_ttc || 0)}</p>
                        </div>
                        <div className="bg-emerald-50/60 rounded-md p-3 text-center">
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Payé</p>
                            <p className="text-[13px] font-semibold text-emerald-700 tabular-nums mt-1">{formatCurr(totalPaye)}</p>
                        </div>
                        <div className={`rounded-md p-3 text-center ${reste > 0 ? 'bg-amber-50/60' : 'bg-emerald-50/60'}`}>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Reste</p>
                            <p className={`text-[13px] font-semibold tabular-nums mt-1 ${reste > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>{formatCurr(Math.max(0, reste))}</p>
                        </div>
                    </div>

                    {/* Liste paiements */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60 border-b border-slate-100">
                                <tr>
                                    <th className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide text-left">Date</th>
                                    <th className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide text-left">Mode</th>
                                    <th className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide text-right">Montant</th>
                                    <th className="px-3 py-2 w-8"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={4} className="px-3 py-6 text-center text-[12px] text-slate-400">Chargement...</td></tr>
                                ) : paiements.length === 0 ? (
                                    <tr><td colSpan={4} className="px-3 py-6 text-center text-[12px] text-slate-400">Aucun paiement</td></tr>
                                ) : paiements.map(p => (
                                    <tr key={p.id} className="hover:bg-slate-50/50">
                                        <td className="px-3 py-2 text-[12px] text-slate-700 tabular-nums">
                                            {p.date_paiement ? new Date(p.date_paiement).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="px-3 py-2 text-[12px] text-slate-500">{p.mode}</td>
                                        <td className="px-3 py-2 text-[12px] font-semibold text-slate-900 tabular-nums text-right">
                                            {formatCurr(p.montant || 0)}
                                        </td>
                                        <td className="px-3 py-2">
                                            <button onClick={() => handleDelete(p)}
                                                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                                <Trash2 className="w-3" strokeWidth={1.75} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {reste > 0 && (
                        <button onClick={handleAdd}
                            className="w-full h-8 bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors">
                            <Plus className="w-3.5" strokeWidth={1.75} />
                            Ajouter un paiement
                        </button>
                    )}
                </div>

                <div className="flex items-center justify-end px-5 h-12 border-t border-slate-100">
                    <button onClick={onClose}
                        className="h-8 px-3 text-[12px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
}
