import React from 'react';
import { X, Printer, Edit, Trash2, DollarSign, Download, Mail } from 'lucide-react';
import { Facture } from '../types';

interface FactureDetailProps {
    facture: Facture;
    onClose: () => void;
    onEdit: () => void;
    onPaiement: () => void;
    onDelete: () => void;
    onRefresh: () => void;
}

export default function FactureDetail({ facture, onClose, onEdit, onPaiement, onDelete, onRefresh }: FactureDetailProps) {
    const formatCurr = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2 });
    const lignes = facture.lignes || [];
    const restant = (facture.total_ttc || 0) - (facture.montant_paye || 0);

    const StatusDot = ({ status }: { status: string }) => (
        <span className={`inline-block w-2 h-2 rounded-full ${
            { BROUILLON: 'bg-slate-400', ENVOYEE: 'bg-[#2149C1]', PAYEE: 'bg-emerald-700', PARTIELLEMENT: 'bg-amber-500', ANNULEE: 'bg-red-500' }[status] || 'bg-slate-400'
        }`} />
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className="bg-white rounded-lg border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between px-5 h-12 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <h2 className="text-[13px] font-semibold text-slate-900">{facture.numero}</h2>
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
                            <StatusDot status={facture.statut} />
                            {facture.statut}
                        </span>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                        <X className="w-3.5" strokeWidth={1.75} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Info tiers */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1">
                                {facture.type === 'ACHAT' ? 'Fournisseur' : 'Client'}
                            </p>
                            <p className="text-[13px] font-medium text-slate-900">{facture.tiers_nom}</p>
                            {facture.tiers_ice && <p className="text-[12px] text-slate-500">ICE: {facture.tiers_ice}</p>}
                            {facture.tiers_rc && <p className="text-[12px] text-slate-500">RC: {facture.tiers_rc}</p>}
                            {facture.tiers_if && <p className="text-[12px] text-slate-500">IF: {facture.tiers_if}</p>}
                        </div>
                        <div className="text-right">
                            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1">Dates</p>
                            <p className="text-[12px] text-slate-700">
                                Facture: {facture.date_facture ? new Date(facture.date_facture).toLocaleDateString() : '-'}
                            </p>
                            {facture.date_echeance && (
                                <p className="text-[12px] text-slate-700">
                                    Échéance: {new Date(facture.date_echeance).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Lignes */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60 border-b border-slate-100">
                                <tr>
                                    <th className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide text-left">Désignation</th>
                                    <th className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide text-right w-16">Qté</th>
                                    <th className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide text-right w-24">Prix unit.</th>
                                    <th className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide text-right w-24">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {lignes.length === 0 ? (
                                    <tr><td colSpan={4} className="px-3 py-6 text-center text-[12px] text-slate-400">Aucune ligne</td></tr>
                                ) : lignes.map((l, i) => (
                                    <tr key={i}>
                                        <td className="px-3 py-2 text-[12px] text-slate-700">{l.designation}</td>
                                        <td className="px-3 py-2 text-[12px] text-slate-900 tabular-nums text-right">{l.quantite}</td>
                                        <td className="px-3 py-2 text-[12px] text-slate-900 tabular-nums text-right">
                                            {formatCurr(l.prix_unitaire || 0)}
                                        </td>
                                        <td className="px-3 py-2 text-[12px] font-semibold text-slate-900 tabular-nums text-right">
                                            {formatCurr(l.total || 0)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Totaux */}
                    <div className="border-t border-slate-100 pt-3 flex flex-col items-end gap-1">
                        <div className="flex items-center gap-4 text-[12px]">
                            <span className="text-slate-500">Total HT</span>
                            <span className="font-semibold text-slate-900 tabular-nums w-28 text-right">{formatCurr(facture.total_ht || 0)} MAD</span>
                        </div>
                        <div className="flex items-center gap-4 text-[12px]">
                            <span className="text-slate-500">TVA ({facture.taux_tva || 0}%)</span>
                            <span className="font-semibold text-slate-900 tabular-nums w-28 text-right">{formatCurr(facture.total_tva || 0)} MAD</span>
                        </div>
                        <div className="flex items-center gap-4 text-[13px] font-semibold text-slate-900 border-t border-slate-200 pt-1 mt-1">
                            <span className="text-slate-700">Total TTC</span>
                            <span className="tabular-nums w-28 text-right">{formatCurr(facture.total_ttc || 0)} MAD</span>
                        </div>
                        <div className="flex items-center gap-4 text-[12px] mt-1">
                            <span className="text-slate-500">Payé</span>
                            <span className="font-semibold text-emerald-700 tabular-nums w-28 text-right">{formatCurr(facture.montant_paye || 0)} MAD</span>
                        </div>
                        {restant > 0 && (
                            <div className="flex items-center gap-4 text-[12px]">
                                <span className="text-slate-500">Reste</span>
                                <span className="font-semibold text-amber-600 tabular-nums w-28 text-right">{formatCurr(restant)} MAD</span>
                            </div>
                        )}
                    </div>

                    {facture.notes && (
                        <div className="bg-slate-50/60 rounded-md p-3">
                            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1">Notes</p>
                            <p className="text-[12px] text-slate-700">{facture.notes}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 h-12 border-t border-slate-100">
                    <button onClick={onDelete}
                        className="h-8 px-3 text-[12px] font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 transition-colors flex items-center gap-1.5">
                        <Trash2 className="w-3.5" strokeWidth={1.75} />
                        Supprimer
                    </button>
                    <div className="flex items-center gap-2">
                        <button onClick={onEdit}
                            className="h-8 px-3 text-[12px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1.5">
                            <Edit className="w-3.5" strokeWidth={1.75} />
                            Modifier
                        </button>
                        {restant > 0 && (
                            <button onClick={onPaiement}
                                className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium rounded-md flex items-center gap-1.5 transition-colors">
                                <DollarSign className="w-3.5" strokeWidth={1.75} />
                                Paiement
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
