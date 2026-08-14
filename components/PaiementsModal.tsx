import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Plus, Trash2, Loader2, CreditCard } from 'lucide-react';
import { Facture, Paiement } from '../types';

interface PaiementsModalProps {
    facture: Facture;
    onClose: () => void;
    /** Appelé après tout changement afin que l'appelant recharge ses totaux. */
    onChanged: () => void;
}

const MODES: Paiement['mode'][] = ['VIREMENT', 'CHEQUE', 'ESPECES', 'LCN'];

const formatCurrency = (val: number) =>
    val.toLocaleString('fr-FR', { minimumFractionDigits: 2 });

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function PaiementsModal({ facture, onClose, onChanged }: PaiementsModalProps) {
    const [paiements, setPaiements] = useState<Paiement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [datePaiement, setDatePaiement] = useState(todayISO());
    const [montant, setMontant] = useState('');
    const [mode, setMode] = useState<Paiement['mode']>('VIREMENT');
    const [reference, setReference] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/facturation/paiements/${facture.id}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Chargement des paiements impossible');
            setPaiements(await res.json());
        } catch (e: any) {
            setError(e.message || 'Erreur de chargement');
        } finally {
            setIsLoading(false);
        }
    }, [facture.id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Le serveur reste la source de vérité pour `montant_paye` ; on recalcule
    // localement uniquement pour l'affichage immédiat.
    const totalPaye = useMemo(
        () => paiements.reduce((s, p) => s + (Number(p.montant) || 0), 0),
        [paiements]
    );
    const restant = Math.max(0, (facture.total_ttc || 0) - totalPaye);

    const montantNum = Number(montant.replace(',', '.'));
    const montantValide = montant !== '' && Number.isFinite(montantNum) && montantNum > 0;
    const depassement = montantValide && montantNum > restant + 0.005;

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!montantValide || isSaving) return;
        setIsSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/facturation/paiements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    facture_id: facture.id,
                    date_paiement: datePaiement,
                    montant: montantNum,
                    mode,
                    reference: reference.trim() || null,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Enregistrement du paiement impossible");
            }
            setMontant('');
            setReference('');
            await load();
            onChanged();
        } catch (e: any) {
            setError(e.message || 'Erreur');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (paiementId: string) => {
        setError(null);
        try {
            const res = await fetch(`/api/facturation/paiements/${facture.id}/${paiementId}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Suppression impossible');
            await load();
            onChanged();
        } catch (e: any) {
            setError(e.message || 'Erreur');
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg shadow-xl">

                <div className="px-5 h-14 flex items-center justify-between border-b border-slate-100 dark:border-dk-border flex-shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <CreditCard className="w-4 text-slate-400 flex-shrink-0" strokeWidth={1.75} />
                        <h2 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text truncate">
                            Encaissements — {facture.numero}
                        </h2>
                        <span className="text-[12px] text-slate-500 truncate">{facture.tiers_nom}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors flex-shrink-0"
                        title="Fermer"
                    >
                        <X className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                </div>

                <div className="px-5 py-3 grid grid-cols-3 gap-3 border-b border-slate-100 dark:border-dk-border flex-shrink-0">
                    <div>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide">Total TTC</span>
                        <p className="text-[14px] font-semibold text-slate-900 dark:text-dk-text tabular-nums mt-0.5">
                            {formatCurrency(facture.total_ttc || 0)} <span className="text-[10px] font-normal text-slate-400">MAD</span>
                        </p>
                    </div>
                    <div>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide">Encaissé</span>
                        <p className="text-[14px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                            {formatCurrency(totalPaye)} <span className="text-[10px] font-normal text-slate-400">MAD</span>
                        </p>
                    </div>
                    <div>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide">Restant</span>
                        <p className={`text-[14px] font-semibold tabular-nums mt-0.5 ${restant > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400'}`}>
                            {formatCurrency(restant)} <span className="text-[10px] font-normal text-slate-400">MAD</span>
                        </p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {isLoading ? (
                        <div className="px-5 py-10 flex items-center justify-center text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                        </div>
                    ) : paiements.length === 0 ? (
                        <div className="px-5 py-10 text-center text-slate-400">
                            <CreditCard className="w-6 h-6 mx-auto mb-2 opacity-20" strokeWidth={1.75} />
                            <p className="text-[12px]">Aucun encaissement enregistré</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-dk-border">
                            {paiements.map(p => (
                                <div key={p.id} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-dk-elevated transition-colors group">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-[12px] text-slate-500 tabular-nums flex-shrink-0">{p.date_paiement}</span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium text-slate-500 border border-slate-200 dark:border-dk-border uppercase flex-shrink-0">
                                            {p.mode}
                                        </span>
                                        {p.reference && (
                                            <span className="text-[12px] text-slate-400 truncate">{p.reference}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <span className="text-[13px] font-semibold text-slate-900 dark:text-dk-text tabular-nums">
                                            {formatCurrency(Number(p.montant) || 0)} MAD
                                        </span>
                                        <button
                                            onClick={() => handleDelete(p.id)}
                                            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
                                            title="Supprimer cet encaissement"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <form onSubmit={handleAdd} className="px-5 py-3 border-t border-slate-100 dark:border-dk-border flex-shrink-0 space-y-2.5">
                    {error && (
                        <p className="text-[12px] text-red-700 dark:text-red-400">{error}</p>
                    )}
                    <div className="grid grid-cols-12 gap-2">
                        <input
                            type="date"
                            value={datePaiement}
                            onChange={e => setDatePaiement(e.target.value)}
                            required
                            className="col-span-3 h-9 px-2.5 text-[12px] rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-elevated text-slate-900 dark:text-dk-text focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            placeholder="Montant"
                            value={montant}
                            onChange={e => setMontant(e.target.value)}
                            required
                            className="col-span-3 h-9 px-2.5 text-[12px] tabular-nums rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-elevated text-slate-900 dark:text-dk-text focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                        <select
                            value={mode}
                            onChange={e => setMode(e.target.value as Paiement['mode'])}
                            className="col-span-2 h-9 px-2 text-[12px] rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-elevated text-slate-900 dark:text-dk-text focus:outline-none focus:ring-1 focus:ring-slate-400"
                        >
                            {MODES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <input
                            type="text"
                            placeholder="Référence"
                            value={reference}
                            onChange={e => setReference(e.target.value)}
                            className="col-span-2 h-9 px-2.5 text-[12px] rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-elevated text-slate-900 dark:text-dk-text focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                        <button
                            type="submit"
                            disabled={!montantValide || isSaving}
                            className="col-span-2 h-9 inline-flex items-center justify-center gap-1.5 rounded-md text-[12px] font-medium bg-slate-900 dark:bg-dk-text text-white dark:text-dk-surface hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                        >
                            {isSaving
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                                : <><Plus className="w-3.5 h-3.5" strokeWidth={1.75} />Ajouter</>}
                        </button>
                    </div>
                    {depassement && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                            Ce montant dépasse le restant dû ({formatCurrency(restant)} MAD).
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
}
