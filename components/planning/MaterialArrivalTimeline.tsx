import React, { useMemo } from 'react';
import { Package, Truck, Sparkles, ClipboardList, CheckCircle2, AlertCircle, AlertTriangle, Ban, RefreshCw, Trash2 } from 'lucide-react';
import type { AppSettings, ModelData, PlanningEvent, PlanningPurchaseDraft } from '../../types';
import { aggregateMaterialNeeds, allocateFIFO, maxPiecesFromStock } from '../../utils/materialNeeds';
import { computeMaterialArrivalPlan, materialReadyDate, type CatalogProductForEta } from '../../utils/supplierLeadtime';

const DEFAULT_LEAD_WORKING_DAYS = 7;

function uid() {
    return `po-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface MaterialArrivalTimelineProps {
    model: ModelData | undefined;
    orderQty: number;
    event: PlanningEvent;
    settings: AppSettings;
    /** Produits magasin (délai + fournisseur) — optionnel ; sinon délai par défaut pour toutes les lignes. */
    catalogProducts?: CatalogProductForEta[];
    catalogLots?: any[];
    onReloadStock?: () => void;
    /** Jours ouvrés après commande au lancement si pas de délai sur le produit magasin. */
    defaultSupplierLeadWorkingDays?: number;
    /** Renseigne `fournisseurDate` sur l’OF avec la pire date d’arrivée estimée. */
    onApplyWorstSupplierDate?: (ymd: string) => void;
    /** Ajoute des lignes BC brouillon sur l’OF (`purchaseOrdersDraft`). */
    onAppendDraftPurchaseOrders?: (drafts: PlanningPurchaseDraft[]) => void;
    className?: string;
}

/**
 * Synthèse besoins matières (fiche × quantité OF) + ETA par ligne (catalogue magasin) + actions Phase 6.
 */
export default function MaterialArrivalTimeline({
    model,
    orderQty,
    event,
    settings,
    catalogProducts: catalogProductsRaw,
    catalogLots: catalogLotsRaw,
    onReloadStock,
    defaultSupplierLeadWorkingDays = DEFAULT_LEAD_WORKING_DAYS,
    onApplyWorstSupplierDate,
    onAppendDraftPurchaseOrders,
    className = '',
}: MaterialArrivalTimelineProps) {
    const catalogProducts = catalogProductsRaw ?? [];
    const catalogLots = catalogLotsRaw ?? [];
    const lines = aggregateMaterialNeeds(model, orderQty);

    // Combien de pièces de cet OF le stock réel (lots) couvre — matière limitante.
    const coverage = useMemo(
        () => maxPiecesFromStock(model, orderQty, catalogProducts as any, catalogLots, 5),
        [model, orderQty, catalogProducts, catalogLots],
    );
    const fullyCovered = coverage.maxPieces >= orderQty;

    const launchYmd = (event.startDate || event.dateLancement || '').split('T')[0];
    const fournYmd = event.fournisseurDate?.trim()?.split('T')[0];
    const hasFourn = !!fournYmd;

    const [reservations, setReservations] = React.useState<any[]>([]);
    const [loadingRes, setLoadingRes] = React.useState(false);
    const [actionError, setActionError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!event.id) return;
        let active = true;
        const fetchRes = async () => {
            setLoadingRes(true);
            setActionError(null);
            try {
                const res = await fetch(`/api/planning/reservations/${event.id}`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    if (active) setReservations(data);
                }
            } catch (err: any) {
                console.error(err);
            } finally {
                if (active) setLoadingRes(false);
            }
        };
        fetchRes();
        return () => { active = false; };
    }, [event.id]);

    const handleReserveFIFO = async () => {
        if (!catalogLots || !catalogProducts) {
            setActionError("Les données de stock ne sont pas chargées.");
            return;
        }
        setActionError(null);
        setLoadingRes(true);
        try {
            const allocations = allocateFIFO(lines, catalogProducts, catalogLots);
            if (allocations.length === 0) {
                setActionError("Aucune matière correspondante trouvée en stock à réserver (FIFO).");
                setLoadingRes(false);
                return;
            }
            
            const res = await fetch(`/api/planning/reservations/${event.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allocations }),
                credentials: 'include'
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || "Erreur lors de la réservation");
            }
            // Refresh reservations
            const freshRes = await fetch(`/api/planning/reservations/${event.id}`, { credentials: 'include' });
            if (freshRes.ok) {
                const data = await freshRes.json();
                setReservations(data);
            }
            // Reload stock globally
            onReloadStock?.();
        } catch (err: any) {
            setActionError(err.message || "Une erreur est survenue lors de la réservation.");
        } finally {
            setLoadingRes(false);
        }
    };

    const handleReleaseReservations = async () => {
        setActionError(null);
        setLoadingRes(true);
        try {
            const res = await fetch(`/api/planning/reservations/${event.id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || "Erreur lors de la libération");
            }
            setReservations([]);
            onReloadStock?.();
        } catch (err: any) {
            setActionError(err.message || "Une erreur est survenue lors de la libération.");
        } finally {
            setLoadingRes(false);
        }
    };

    const handleDeductReservations = async () => {
        if (!confirm("Voulez-vous vraiment déduire ces matières du stock physique ? Cette action enregistrera un mouvement de sortie.")) {
            return;
        }
        setActionError(null);
        setLoadingRes(true);
        try {
            const res = await fetch(`/api/planning/reservations/${event.id}/deduct`, {
                method: 'POST',
                credentials: 'include'
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || "Erreur lors de la déduction");
            }
            setReservations([]);
            onReloadStock?.();
        } catch (err: any) {
            setActionError(err.message || "Une erreur est survenue lors de la déduction.");
        } finally {
            setLoadingRes(false);
        }
    };

    const plan = useMemo(
        () =>
            launchYmd && lines.length
                ? computeMaterialArrivalPlan(lines, catalogProducts, launchYmd, settings, defaultSupplierLeadWorkingDays)
                : { rows: [], worstArrivalYmd: null, criticalMaterialName: null },
        [lines, catalogProducts, launchYmd, settings, defaultSupplierLeadWorkingDays],
    );

    const lead = Math.max(0, defaultSupplierLeadWorkingDays);
    const hypotheticalReady =
        launchYmd && lead > 0 && lines.length ? materialReadyDate(launchYmd, lead, settings) : null;

    const handleApplyWorst = () => {
        if (plan.worstArrivalYmd && onApplyWorstSupplierDate) onApplyWorstSupplierDate(plan.worstArrivalYmd);
    };

    const handleDraftBCs = () => {
        if (!onAppendDraftPurchaseOrders || !launchYmd || !plan.rows.length) return;
        const drafts: PlanningPurchaseDraft[] = plan.rows.map(row => ({
            id: uid(),
            productId: row.productId || `unmatched:${row.name}`,
            productName: row.name,
            qty: row.qty,
            supplierName: row.supplierName,
            orderDateYmd: launchYmd,
            expectedArrivalYmd: row.estimatedArrivalYmd,
            status: 'DRAFT' as const,
        }));
        onAppendDraftPurchaseOrders(drafts);
    };

    if (!model) {
        return (
            <div className={`p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-slate-700 space-y-2 ${className}`}>
                <div className="flex items-center gap-2 text-[12px] font-bold text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    Modèle introuvable dans la bibliothèque
                </div>
                <p className="text-[11px] leading-normal text-amber-700 font-medium">
                    Ce modèle a été supprimé ou n'existe pas. Les besoins en matières ne peuvent pas être évalués.
                </p>
            </div>
        );
    }

    if (lines.length === 0) {
        return (
            <p className={`text-sm text-slate-500 py-2 ${className}`}>
                Aucune matière renseignée sur la fiche technique de ce modèle.
            </p>
        );
    }

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Stock Reservation card */}
            <div className="rounded-xl border border-white/20 bg-white/50 backdrop-blur-md p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-slate-700" />
                        <h4 className="text-[12px] font-bold text-slate-900 uppercase tracking-wider">Réservation de stock</h4>
                    </div>
                    {loadingRes && <RefreshCw className="h-3.5 w-3.5 text-slate-400 animate-spin" />}
                </div>

                {actionError && (
                    <div className="flex items-start gap-1.5 rounded-lg bg-red-50 p-2.5 text-[11px] text-red-800 border border-red-100">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <div>{actionError}</div>
                    </div>
                )}

                {reservations.length > 0 ? (
                    <div className="space-y-3">
                        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm p-2.5 text-[11px] text-emerald-800">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                            <div>
                                <span className="font-bold">Stock réservé avec succès :</span>
                                <p className="mt-0.5 text-slate-600">Ces matières sont verrouillées pour cet OF. Vous pouvez les déduire physiquement lors du lancement de la production.</p>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-lg border border-white/20 bg-white/30 backdrop-blur-md text-[11px] shadow-sm">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-white/20 bg-white/40 font-semibold text-slate-600 backdrop-blur-sm">
                                        <th className="px-2.5 py-1.5">Matière</th>
                                        <th className="px-2.5 py-1.5">Bain / Var.</th>
                                        <th className="px-2.5 py-1.5 text-right">Qté Rés.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reservations.map((r, i) => (
                                        <tr key={i} className="border-b border-slate-100 last:border-0">
                                            <td className="px-2.5 py-1.5 font-medium text-slate-800">{r.productName || `ID: ${r.productId}`}</td>
                                            <td className="px-2.5 py-1.5 text-slate-500 font-mono">
                                                {r.numBain ? `B:${r.numBain}` : ''} {r.variante ? `V:${r.variante}` : ''} {!r.numBain && !r.variante ? '—' : ''}
                                            </td>
                                            <td className="px-2.5 py-1.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                                                {r.quantite}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleDeductReservations}
                                disabled={loadingRes}
                                className="flex-1 h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Déduire
                            </button>
                            <button
                                type="button"
                                onClick={handleReleaseReservations}
                                disabled={loadingRes}
                                className="h-8 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                <Ban className="h-3.5 w-3.5 text-slate-400" />
                                Libérer
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-[11px] text-slate-500 leading-normal">
                            Aucune réservation physique de stock n'a été effectuée pour cet OF. Vous pouvez réserver automatiquement les matières disponibles selon la règle FIFO.
                        </p>
                        <button
                            type="button"
                            onClick={handleReserveFIFO}
                            disabled={loadingRes || !catalogLots.length}
                            className="w-full h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                            Réserver via FIFO
                        </button>
                    </div>
                )}
            </div>

            {/* Couverture stock réel : combien de pièces sont couvertes par le stock dispo. */}
            {catalogProducts.length > 0 && coverage.rows.length > 0 && (
                <div className={`rounded-xl border backdrop-blur-md px-3 py-2.5 ${fullyCovered ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-amber-500/20 bg-amber-500/10'}`}>
                    <div className="flex items-center gap-2">
                        {fullyCovered ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" /> : <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />}
                        <p className={`text-[11px] font-black uppercase tracking-wide ${fullyCovered ? 'text-emerald-900' : 'text-amber-900'}`}>
                            Couverture stock
                        </p>
                    </div>
                    <p className={`mt-1 text-[13px] font-bold ${fullyCovered ? 'text-emerald-950' : 'text-amber-950'}`}>
                        Le stock disponible couvre <span className="tabular-nums">{coverage.maxPieces}</span> / <span className="tabular-nums">{orderQty}</span> pcs
                        {fullyCovered ? ' ✓' : ` (${Math.round((coverage.maxPieces / Math.max(1, orderQty)) * 100)}%)`}
                    </p>
                    {!fullyCovered && coverage.limiting && (
                        <p className="mt-0.5 text-[10px] text-amber-800/90">
                            Matière limitante : <span className="font-bold">{coverage.limiting}</span>
                        </p>
                    )}
                </div>
            )}

            {hasFourn ? (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 backdrop-blur-md px-3 py-2.5">
                    <Truck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">Arrivée fournisseur (OF)</p>
                        <p className="font-mono text-sm font-bold text-emerald-950">{fournYmd}</p>
                        <p className="mt-1 text-[10px] leading-snug text-emerald-800/90">
                            Utilisée pour le calage montage (max prépa / date matière). Les lignes ci-dessous restent indicatives
                            tant que le stock n’est pas réceptionné.
                        </p>
                    </div>
                </div>
            ) : (
                launchYmd &&
                hypotheticalReady && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 backdrop-blur-md px-3 py-2.5 text-[11px] leading-snug text-amber-950">
                        <span className="font-black uppercase tracking-wide text-amber-900">Estimation globale</span>
                        {' — '}
                        Si commande au lancement ({launchYmd}), délai indicatif{' '}
                        <span className="font-bold tabular-nums">{lead} j. ouvrés</span> → matière prête vers le{' '}
                        <span className="font-mono font-bold">{hypotheticalReady}</span>
                        . Utilisez le tableau des ETA par ligne ou le bouton pour renseigner la date fournisseur.
                    </div>
                )
            )}

            {plan.worstArrivalYmd && plan.criticalMaterialName && (
                <div className="rounded-xl border border-white/20 bg-white/40 backdrop-blur-md px-3 py-2 text-[11px] text-slate-800 shadow-xs">
                    <span className="font-black uppercase tracking-wide text-slate-600">Chemin critique (estim.)</span>
                    <p className="mt-1">
                        Matière la plus tardive : <span className="font-bold">{plan.criticalMaterialName}</span> →{' '}
                        <span className="font-mono font-bold">{plan.worstArrivalYmd}</span>
                    </p>
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                {onApplyWorstSupplierDate && plan.worstArrivalYmd && (
                    <button
                        type="button"
                        onClick={handleApplyWorst}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#2149C1] px-3 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-[#1a3ba5] transition-colors"
                    >
                        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Appliquer date fournisseur ({plan.worstArrivalYmd})
                    </button>
                )}
                {onAppendDraftPurchaseOrders && plan.rows.length > 0 && (
                    <button
                        type="button"
                        onClick={handleDraftBCs}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Créer BC brouillon (toutes les lignes)
                    </button>
                )}
            </div>

            {!!event.purchaseOrdersDraft?.length && (
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 backdrop-blur-md px-3 py-2 shadow-xs">
                    <p className="text-[10px] font-black uppercase tracking-wide text-indigo-800">BC brouillon sur l’OF</p>
                    <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[10px] text-indigo-950">
                        {event.purchaseOrdersDraft.map(d => (
                            <li key={d.id} className="flex justify-between gap-2 font-mono">
                                <span className="truncate">{d.productName}</span>
                                <span className="shrink-0 tabular-nums">
                                    {d.qty} → {d.expectedArrivalYmd}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {!catalogProducts.length && (
                <p className="text-[10px] text-amber-800/90 rounded-lg bg-amber-500/10 border border-amber-500/20 backdrop-blur-md px-2 py-1.5">
                    Catalogue magasin non chargé : les délais utilisent la valeur par défaut ({lead} j. ouvrés) pour chaque
                    matière. Ouvrez le module Magasin une fois connecté pour alimenter les délais fournisseur.
                </p>
            )}

            <div className="overflow-hidden rounded-xl border border-white/20 bg-white/30 backdrop-blur-md shadow-sm">
                <div className="flex items-center gap-2 border-b border-white/10 bg-white/40 px-3 py-2 backdrop-blur-sm">
                    <Package className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        ETA par matière ({launchYmd ? plan.rows.length : lines.length})
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] text-left text-xs">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/20 text-[10px] font-black uppercase tracking-wider text-slate-500 backdrop-blur-xs">
                                <th className="px-3 py-2">Matière</th>
                                <th className="px-3 py-2 text-right">Qté</th>
                                <th className="px-3 py-2">Fournisseur</th>
                                <th className="px-3 py-2 text-right">Délai (j)</th>
                                <th className="px-3 py-2 font-mono">Arrivée</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!launchYmd ? (
                                <tr>
                                    <td colSpan={5} className="px-3 py-3 text-center text-[11px] text-amber-800">
                                        Définissez la date de lancement de l’OF pour calculer les dates d’arrivée fournisseur.
                                    </td>
                                </tr>
                            ) : (
                                plan.rows.map((row, i) => (
                                    <tr key={`${row.name}-${i}`} className="border-t border-white/10 first:border-t-0 bg-white/20 hover:bg-white/40 transition-colors">
                                        <td className="max-w-[140px] truncate px-3 py-2 font-semibold text-slate-800">
                                            {row.name}
                                            {!row.matched && catalogProducts.length > 0 && (
                                                <span className="ml-1 text-[9px] font-normal text-amber-600" title="Pas de correspondance catalogue">
                                                    ○
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                                            {row.qty} <span className="text-[10px] text-slate-500">{row.unit}</span>
                                        </td>
                                        <td className="max-w-[100px] truncate px-3 py-2 text-slate-600">{row.supplierName || '—'}</td>
                                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{row.leadWorkingDays}</td>
                                        <td className="px-3 py-2 font-mono text-[11px] font-bold text-slate-900">{row.estimatedArrivalYmd}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
