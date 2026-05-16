import React, { useMemo } from 'react';
import { Package, Truck, Sparkles, ClipboardList } from 'lucide-react';
import type { AppSettings, ModelData, PlanningEvent, PlanningPurchaseDraft } from '../../types';
import { aggregateMaterialNeeds } from '../../utils/materialNeeds';
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
    catalogProducts = [],
    defaultSupplierLeadWorkingDays = DEFAULT_LEAD_WORKING_DAYS,
    onApplyWorstSupplierDate,
    onAppendDraftPurchaseOrders,
    className = '',
}: MaterialArrivalTimelineProps) {
    const lines = aggregateMaterialNeeds(model, orderQty);
    const launchYmd = (event.startDate || event.dateLancement || '').split('T')[0];
    const fournYmd = event.fournisseurDate?.trim()?.split('T')[0];
    const hasFourn = !!fournYmd;

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

    if (lines.length === 0) {
        return (
            <p className={`text-sm text-slate-500 py-2 ${className}`}>
                Aucune matière renseignée sur la fiche technique de ce modèle.
            </p>
        );
    }

    return (
        <div className={`space-y-3 ${className}`}>
            {hasFourn ? (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200/90 bg-emerald-50/90 px-3 py-2.5">
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
                    <div className="rounded-xl border border-amber-200/90 bg-amber-50/80 px-3 py-2.5 text-[11px] leading-snug text-amber-950">
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
                <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 text-[11px] text-slate-800">
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
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
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
                <p className="text-[10px] text-amber-800/90 rounded-lg bg-amber-50/80 border border-amber-100 px-2 py-1.5">
                    Catalogue magasin non chargé : les délais utilisent la valeur par défaut ({lead} j. ouvrés) pour chaque
                    matière. Ouvrez le module Magasin une fois connecté pour alimenter les délais fournisseur.
                </p>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
                    <Package className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        ETA par matière ({launchYmd ? plan.rows.length : lines.length})
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] text-left text-xs">
                        <thead>
                            <tr className="border-b border-slate-100 bg-white text-[10px] font-black uppercase tracking-wider text-slate-500">
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
                                    <tr key={`${row.name}-${i}`} className="border-t border-slate-100 first:border-t-0 bg-white">
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
