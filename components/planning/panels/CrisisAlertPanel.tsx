import React, { useState, useMemo } from 'react';
import { ChevronDown, AlertTriangle, AlertCircle, Clock, Shuffle, ExternalLink, Check, Zap } from 'lucide-react';
import type { PlanningEventWithCR } from '../hooks/useCriticalRatio';
import type { ModelData, AppSettings } from '../../../types';
import { evClientName, evModelName } from '../shared/eventAccessors';
import { resolveCrisis, CrisisProposal } from '../../../utils/crisisResolver';

interface Props {
    crisisEvents: PlanningEventWithCR[];
    eventsWithCR: PlanningEventWithCR[];
    models: ModelData[];
    settings: AppSettings;
    onUpdateEvent: (id: string, patch: any) => void;
    onAddEvent: (input: any) => void;
    onJumpToEvent: (id: string) => void;
    showToast: (text: string, type?: 'success' | 'error') => void;
}

export default function CrisisAlertPanel({
    crisisEvents,
    eventsWithCR,
    models,
    settings,
    onUpdateEvent,
    onAddEvent,
    onJumpToEvent,
    showToast,
}: Props) {
    const [expanded, setExpanded] = useState(false);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [actioningId, setActioningId] = useState<string | null>(null);

    const criticalCount = useMemo(
        () => crisisEvents.filter(e => e.crResult?.status === 'CRITICAL').length,
        [crisisEvents]
    );
    const atRiskCount = useMemo(
        () => crisisEvents.filter(e => e.crResult?.status === 'AT_RISK').length,
        [crisisEvents]
    );

    // Convert list of events to a record of CR values for the crisis resolver
    const chainCRs = useMemo(() => {
        const map: Record<string, number> = {};
        for (const ev of eventsWithCR) {
            if (ev.crResult) {
                // Keep the lowest CR per chain to be conservative
                map[ev.chaineId] = Math.min(map[ev.chaineId] ?? 999, ev.crResult.cr);
            }
        }
        return map;
    }, [eventsWithCR]);

    // Map chains to machine list
    const chainMachines = useMemo(() => {
        return settings.chainMachines || {};
    }, [settings.chainMachines]);

    if (crisisEvents.length === 0) return null;

    const handleApplyOvertime = async (ev: PlanningEventWithCR, proposal: CrisisProposal) => {
        setActioningId(`${ev.id}-overtime`);
        try {
            const res = await fetch('/api/scheduling/crisis-alerts', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planningId: ev.id,
                    alertType: 'OVERTIME',
                    severity: ev.crResult.status,
                    crValue: ev.crResult.cr,
                    deficitPieces: ev.crResult.deficit,
                    proposedAction: proposal.details,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                const alertId = data.id;
                if (alertId) {
                    await fetch(`/api/scheduling/crisis-alerts/${alertId}`, {
                        method: 'PUT',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'ACCEPTED' }),
                    });
                }

                // Resolves the delay by updating the estimated end date to match the target DDS / planned export date
                const targetEnd = ev.strictDeadline_DDS || ev.dateExport || new Date().toISOString().split('T')[0];
                onUpdateEvent(ev.id, {
                    estimatedEndDate: targetEnd,
                    dateExport: targetEnd,
                });

                showToast(
                    `Heures supplémentaires (${(proposal.details as any).requiredHours}h) validées pour la ${ev.chaineId}.`,
                    'success'
                );
            } else {
                showToast("Erreur lors de la validation des heures supplémentaires.", 'error');
            }
        } catch {
            showToast("Erreur réseau.", 'error');
        } finally {
            setActioningId(null);
        }
    };

    const handleApplyLoadBalance = async (ev: PlanningEventWithCR, proposal: CrisisProposal) => {
        setActioningId(`${ev.id}-loadbalance`);
        const details = proposal.details as any;
        const targetChainId = details.targetChainId;
        const qty = details.piecesToTransfer;

        try {
            const origQty = ev.totalQuantity || ev.qteTotal || 0;
            const remQty = origQty - qty;

            if (remQty <= 0) {
                // Move entire event
                onUpdateEvent(ev.id, { chaineId: targetChainId });
            } else {
                // Split and move
                onUpdateEvent(ev.id, { totalQuantity: remQty, qteTotal: remQty });
                onAddEvent({
                    modelId: ev.modelId,
                    chaineId: targetChainId,
                    startDate: ev.startDate || ev.dateLancement || new Date().toISOString().split('T')[0],
                    quantity: qty,
                    clientName: ev.clientName || '',
                    strictDeadline_DDS: ev.strictDeadline_DDS || undefined,
                    color: ev.color,
                });
            }

            // Persist action
            const res = await fetch('/api/scheduling/crisis-alerts', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planningId: ev.id,
                    alertType: 'LOAD_BALANCE',
                    severity: ev.crResult.status,
                    crValue: ev.crResult.cr,
                    deficitPieces: qty,
                    proposedAction: details,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                const alertId = data.id;
                if (alertId) {
                    await fetch(`/api/scheduling/crisis-alerts/${alertId}`, {
                        method: 'PUT',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'ACCEPTED' }),
                    });
                }
            }

            showToast(`Transfert de ${qty} pièces vers ${targetChainId} effectué.`, 'success');
        } catch {
            showToast("Erreur lors de la répartition de charge.", 'error');
        } finally {
            setActioningId(null);
        }
    };

    const handleApplyOutsource = async (ev: PlanningEventWithCR, proposal: CrisisProposal) => {
        setActioningId(`${ev.id}-outsource`);
        const details = proposal.details as any;
        const qty = details.quantity;
        const delDate = details.suggestedDeliveryDate;

        try {
            const origQty = ev.totalQuantity || ev.qteTotal || 0;
            const remQty = origQty - qty;

            if (remQty <= 0) {
                // Outsource whole event
                onUpdateEvent(ev.id, {
                    isSubcontracted: true,
                    subcontractorName: 'Externe (Sous-traitance)',
                    subcontractStatus: 'PENDING',
                    strictDeadline_DDS: delDate,
                });
            } else {
                // Split and outsource
                onUpdateEvent(ev.id, { totalQuantity: remQty, qteTotal: remQty });
                onAddEvent({
                    modelId: ev.modelId,
                    chaineId: ev.chaineId,
                    startDate: ev.startDate || ev.dateLancement || new Date().toISOString().split('T')[0],
                    quantity: qty,
                    clientName: ev.clientName || '',
                    strictDeadline_DDS: delDate,
                    color: ev.color,
                    isSubcontracted: true,
                    subcontractorName: 'Externe (Sous-traitance)',
                    subcontractStatus: 'PENDING',
                });
            }

            // Persist action
            const res = await fetch('/api/scheduling/crisis-alerts', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planningId: ev.id,
                    alertType: 'OUTSOURCE',
                    severity: ev.crResult.status,
                    crValue: ev.crResult.cr,
                    deficitPieces: qty,
                    proposedAction: details,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                const alertId = data.id;
                if (alertId) {
                    await fetch(`/api/scheduling/crisis-alerts/${alertId}`, {
                        method: 'PUT',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'ACCEPTED' }),
                    });
                }
            }

            showToast(`Sous-traitance de ${qty} pièces créée avec succès.`, 'success');
        } catch {
            showToast("Erreur lors de la création de la sous-traitance.", 'error');
        } finally {
            setActioningId(null);
        }
    };

    return (
        <div className="shrink-0 border-b border-red-100 bg-red-50/20">
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full h-10 px-6 flex items-center justify-between gap-3 hover:bg-red-50/40 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                    </span>
                    <span className="text-[12px] font-semibold text-red-900 tracking-wide uppercase">
                        Protocoles d'Urgence APS
                    </span>
                    <div className="h-4 w-px bg-red-200" />
                    <div className="flex items-center gap-2">
                        {criticalCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                                <AlertCircle className="w-3 h-3 text-red-600" />
                                <span className="font-bold">{criticalCount}</span> critique{criticalCount > 1 ? 's' : ''}
                            </span>
                        )}
                        {atRiskCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3 text-orange-600" />
                                <span className="font-bold">{atRiskCount}</span> à risque
                            </span>
                        )}
                    </div>
                </div>
                <ChevronDown
                    className={`w-4 h-4 text-red-700 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    strokeWidth={2.5}
                />
            </button>

            {expanded && (
                <div className="max-h-[380px] overflow-y-auto border-t border-red-100 divide-y divide-red-100/60 bg-white">
                    {crisisEvents.map(ev => {
                        const model = models.find(m => m.id === ev.modelId);
                        const requiredMachineClasses = model?.gamme_operatoire
                            ? Array.from(new Set(model.gamme_operatoire.map(o => o.machineId).filter(Boolean)))
                            : [];

                        // Resolve proposals for this delayed OF
                        const proposals = resolveCrisis(
                            ev.crResult.deficit,
                            ev.chaineId,
                            ev.strictDeadline_DDS || ev.dateExport || '',
                            chainCRs,
                            chainMachines,
                            requiredMachineClasses,
                            model?.meta_data?.total_temps || 15,
                            settings.chainOperators?.[ev.chaineId] ?? 30,
                            ev.activityRateOverride ?? settings.chainActivityRate?.[ev.chaineId] ?? 0.85,
                            settings,
                            {
                                overtimePerHour: settings.overtimeCostPerHour,
                                subcontractPerPiece: settings.subcontractDefaultCostPerPiece,
                            },
                            settings.chainNames
                        );

                        const isSelected = selectedEventId === ev.id;
                        const client = evClientName(ev, models);
                        const mName = evModelName(ev, models);

                        return (
                            <div key={ev.id} className="p-3 sm:p-4 transition-colors hover:bg-slate-50/40">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                                ev.crResult.status === 'CRITICAL' ? 'bg-red-500 text-white animate-pulse' : 'bg-orange-500 text-white'
                                            }`}>
                                                CR {ev.crResult.cr.toFixed(2)}
                                            </span>
                                            <h4 className="text-[12px] font-bold text-slate-900 truncate">
                                                {client} · {mName}
                                            </h4>
                                            <span className="text-[10px] text-slate-400 font-medium">
                                                ({ev.chaineId})
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-600 mt-1">
                                            Retard de <span className="font-semibold text-red-600">{ev.crResult.deficit} pièces</span> sur la date d'export. Jours restants : <span className="font-medium text-slate-900">{ev.crResult.daysRemaining} j</span> (Requis: {ev.crResult.daysNeeded} j).
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => onJumpToEvent(ev.id)}
                                            className="px-2 py-1 text-[10px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 transition-all"
                                        >
                                            Localiser
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedEventId(isSelected ? null : ev.id)}
                                            className="px-3 py-1 text-[10px] font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-all flex items-center gap-1"
                                        >
                                            Solutions
                                            <ChevronDown className={`w-3 h-3 transition-transform ${isSelected ? 'rotate-180' : ''}`} />
                                        </button>
                                    </div>
                                </div>

                                {isSelected && (
                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100 animate-[planning-fade-up_120ms_ease-out]">
                                        {proposals.map((prop, idx) => {
                                            const Icon = prop.type === 'OVERTIME' ? Clock : prop.type === 'LOAD_BALANCE' ? Shuffle : ExternalLink;
                                            const isActioning = actioningId === `${ev.id}-${prop.type.toLowerCase()}`;

                                            const btnHandler = () => {
                                                if (prop.type === 'OVERTIME') handleApplyOvertime(ev, prop);
                                                else if (prop.type === 'LOAD_BALANCE') handleApplyLoadBalance(ev, prop);
                                                else if (prop.type === 'OUTSOURCE') handleApplyOutsource(ev, prop);
                                            };

                                            return (
                                                <div
                                                    key={idx}
                                                    className="flex flex-col justify-between border border-slate-100 rounded-xl p-3.5 bg-slate-50 hover:border-red-200 hover:bg-red-50/10 transition-all shadow-sm"
                                                >
                                                    <div>
                                                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                                                            <div className="p-1.5 bg-white rounded-lg shadow-sm text-slate-700 border border-slate-100">
                                                                <Icon className="w-3.5 h-3.5" />
                                                            </div>
                                                            Option {prop.level} : {prop.type}
                                                        </div>
                                                        <p className="text-[11px] text-slate-600 mt-2.5 leading-relaxed">
                                                            {prop.description_fr}
                                                        </p>
                                                        {prop.type === 'OVERTIME' && (
                                                            <div className="mt-2 text-[9px] font-mono text-slate-400 bg-slate-100/50 p-1.5 rounded border border-slate-100">
                                                                Calcul: {(prop.details as any).formula}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                                                        <span className="text-[11px] font-black text-slate-900">
                                                            {prop.estimatedCost ? `${prop.estimatedCost} MAD` : 'Sans surcoût'}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            disabled={isActioning}
                                                            onClick={btnHandler}
                                                            className="px-2.5 py-1 text-[10px] font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg transition-colors flex items-center gap-1 shadow-sm active:scale-95 duration-75"
                                                        >
                                                            {isActioning ? (
                                                                "Application..."
                                                            ) : (
                                                                <>
                                                                    Appliquer
                                                                    <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
