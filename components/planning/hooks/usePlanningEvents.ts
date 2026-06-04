import { useCallback, useMemo } from 'react';
import type { AppSettings, Lot, Machine, ModelData, PlanningEvent } from '../../../types';
import { calculateEndDate, rollPlanningEvents } from '../../../utils/planning';
import { evaluateStockForPlanning, formatStockBlockedReason } from '../../../utils/materialNeeds';
import type { MagasinStock } from './usePlanningStock';
import type { PlanningChain } from './usePlanningChains';
import { evQty, evStartYmd } from '../shared/eventAccessors';
import { getClientColor } from '../shared/clientColors';

interface Args {
    planningEvents: PlanningEvent[];
    setPlanningEvents: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    models: ModelData[];
    chains: PlanningChain[];
    settings: AppSettings;
    stock: MagasinStock | null;
}

export interface NewEventInput {
    modelId: string;
    chaineId: string;
    startDate: string;
    quantity: number;
    clientName?: string;
    strictDeadline_DDS?: string;
    fournisseurDate?: string;
    color?: string;
    isSubcontracted?: boolean;
    subcontractorName?: string;
    subcontractStatus?: 'PENDING' | 'SENT' | 'COMPLETED';
    subcontractorPhone?: string;
    subcontractorRating?: number;
    subcontractorAvailabilityDate?: string;
    subcontractPricePerPiece?: number;
    subcontractSizeColorDistribution?: Record<string, Record<string, number>>;
    sizeColorDistribution?: Record<string, Record<string, number>>;
}

function scaleDistribution(
    dist: Record<string, Record<string, number>> | undefined,
    targetQty: number,
    totalQty: number
): { scaled: Record<string, Record<string, number>>; remaining: Record<string, Record<string, number>> } | undefined {
    if (!dist || totalQty <= 0 || targetQty <= 0) return undefined;
    
    const scaled: Record<string, Record<string, number>> = {};
    const remaining: Record<string, Record<string, number>> = {};
    
    let scaledSum = 0;
    const flatList: { colorId: string; size: string; qty: number }[] = [];
    
    Object.keys(dist).forEach(colorId => {
        scaled[colorId] = {};
        remaining[colorId] = {};
        Object.keys(dist[colorId]).forEach(size => {
            const qty = dist[colorId][size] || 0;
            const factor = targetQty / totalQty;
            const sQty = Math.round(qty * factor);
            scaled[colorId][size] = sQty;
            scaledSum += sQty;
            flatList.push({ colorId, size, qty });
        });
    });
    
    let diff = targetQty - scaledSum;
    if (diff !== 0 && flatList.length > 0) {
        flatList.sort((a, b) => b.qty - a.qty);
        let idx = 0;
        let safety = 0;
        while (diff !== 0 && safety < 10000) {
            safety++;
            const item = flatList[idx % flatList.length];
            const currentScaled = scaled[item.colorId][item.size];
            if (diff > 0) {
                if (currentScaled < item.qty) {
                    scaled[item.colorId][item.size]++;
                    diff--;
                }
            } else {
                if (currentScaled > 0) {
                    scaled[item.colorId][item.size]--;
                    diff++;
                }
            }
            idx++;
        }
    }
    
    Object.keys(dist).forEach(colorId => {
        Object.keys(dist[colorId]).forEach(size => {
            const origQty = dist[colorId][size] || 0;
            const sQty = scaled[colorId][size] || 0;
            remaining[colorId][size] = Math.max(0, origQty - sQty);
        });
    });
    
    return { scaled, remaining };
}

export function usePlanningEvents({
    planningEvents,
    setPlanningEvents,
    models,
    chains,
    settings,
    stock,
}: Args) {

    /** State updater wrapper that automatically applies dynamic rolling sequencing */
    const setPlanningEventsWithRolling = useCallback((
        action: React.SetStateAction<PlanningEvent[]>
    ) => {
        setPlanningEvents(prev => {
            const nextRaw = typeof action === 'function' ? (action as (p: PlanningEvent[]) => PlanningEvent[])(prev) : action;
            const efficiencies = Object.fromEntries(chains.map(c => [c.id, c.efficiency]));
            return rollPlanningEvents(nextRaw, models, settings, efficiencies);
        });
    }, [chains, models, settings, setPlanningEvents]);

    /** Applique les contraintes stock magasin → status BLOCKED + raison. */
    const applyStock = useCallback(<T extends PlanningEvent>(ev: T, qty: number): T => {
        if (!stock?.products?.length) return ev;
        const model = models.find(m => m.id === ev.modelId);
        
        // Skip stock block for Export market type models
        if (model?.ficheData?.typeMarche === 'Export') {
            const cleared: T = { ...ev };
            delete (cleared as PlanningEvent).materialShortages;
            if (ev.status === 'BLOCKED_STOCK') {
                (cleared as PlanningEvent).status = 'READY';
                (cleared as PlanningEvent).blockedReason = undefined;
            }
            return cleared;
        }

        const result = evaluateStockForPlanning(model, qty, stock.products, stock.lots ?? []);
        if (!result.ok) {
            const shortRows = result.shortages.map(s => ({
                name: s.name,
                unit: s.unit,
                productId: s.productId,
                required: s.required,
                available: s.available,
                missing: s.missing,
                unmatched: s.unmatched,
            }));
            return {
                ...ev,
                status: 'BLOCKED_STOCK',
                blockedReason: formatStockBlockedReason(result.shortages),
                materialShortages: shortRows,
            };
        }
        // Stock OK → on lève un éventuel blocage stock antérieur.
        const cleared: T = { ...ev };
        delete (cleared as PlanningEvent).materialShortages;
        const br = ev.blockedReason;
        const wasStockBlock =
            ev.status === 'BLOCKED_STOCK' &&
            (!!(ev.materialShortages?.length) ||
                !!(br && /^Stock insuffisant|^Article inconnu/.test(br)));
        if (wasStockBlock) {
            (cleared as PlanningEvent).status = 'READY';
            (cleared as PlanningEvent).blockedReason = undefined;
        }
        return cleared;
    }, [stock, models]);

    const computeEndDate = useCallback(
        (modelId: string, chaineId: string, startDate: string, quantity: number): string => {
            const model = models.find(m => m.id === modelId);
            const chain = chains.find(c => c.id === chaineId);
            const sam = model?.meta_data?.total_temps || 15;
            const defaultEff = chain?.efficiency ?? 0.85;

            // Model planning efficiency
            const modelEff = model?.ficheData?.targetEfficiency ?? 85;
            const safetyFactor = model?.ficheData?.facteurPlanning ?? 60;
            const effToUse = model ? (modelEff * safetyFactor) / 10000 : defaultEff;

            // Launch buffer
            const setupMins = model?.ficheData?.bufferLancement !== undefined 
                ? model.ficheData.bufferLancement 
                : (settings.changeoverDurationMins ?? 120);

            return calculateEndDate(startDate, quantity, sam, effToUse, settings, chaineId, setupMins);
        },
        [models, chains, settings]
    );

    /** Ajoute un OF — pas de validation ici, déléguée au caller. */
    const addEvent = useCallback((input: NewEventInput) => {
        if (!input.modelId || input.quantity <= 0) return;
        const model = models.find(m => m.id === input.modelId);
        const endIso = computeEndDate(input.modelId, input.chaineId, input.startDate, input.quantity);
        const splitEnabled = !!model?.ficheData?.sectionSplitEnabled;
        const baseEv: PlanningEvent = {
            id: `event_${Date.now()}`,
            modelId: input.modelId,
            chaineId: input.chaineId,
            dateLancement: input.startDate,
            startDate: input.startDate,
            dateExport: endIso,
            estimatedEndDate: endIso,
            qteTotal: input.quantity,
            totalQuantity: input.quantity,
            qteProduite: 0,
            producedQuantity: 0,
            status: 'READY',
            modelName: model?.meta_data?.nom_modele || 'Nouveau',
            clientName: input.clientName || model?.ficheData?.client || '',
            strictDeadline_DDS: input.strictDeadline_DDS || undefined,
            color: input.color || getClientColor(input.clientName || model?.ficheData?.client),
            sectionSplitEnabled: splitEnabled,
            fournisseurDate: input.fournisseurDate || undefined,
            isSubcontracted: input.isSubcontracted,
            subcontractorName: input.subcontractorName,
            subcontractStatus: input.subcontractStatus,
            subcontractorPhone: input.subcontractorPhone,
            subcontractorRating: input.subcontractorRating,
            subcontractorAvailabilityDate: input.subcontractorAvailabilityDate,
            subcontractPricePerPiece: input.subcontractPricePerPiece,
            subcontractSizeColorDistribution: input.subcontractSizeColorDistribution,
            sizeColorDistribution: input.sizeColorDistribution,
            // Spec parameters
            typeMarche: model?.ficheData?.typeMarche ?? 'Local',
            facteurPlanning: model?.ficheData?.facteurPlanning ?? 60,
            bufferLancement: model?.ficheData?.bufferLancement ?? 120,
        };
        const stocked = applyStock(baseEv, input.quantity);
        setPlanningEventsWithRolling(prev => [...prev, stocked]);
    }, [models, computeEndDate, applyStock, setPlanningEventsWithRolling]);

    /** Met à jour un OF — accepte un objet partiel. */
    const updateEvent = useCallback((id: string, patch: Partial<PlanningEvent>) => {
        setPlanningEventsWithRolling(prev => prev.map(ev => {
            if (ev.id !== id) return ev;
            const merged: PlanningEvent = { ...ev, ...patch };
            // Recalcule la date de fin si quantité/début/chaîne ont changé.
            const qty = patch.totalQuantity ?? patch.qteTotal ?? merged.totalQuantity ?? merged.qteTotal ?? 0;
            const start = patch.startDate ?? patch.dateLancement ?? merged.startDate ?? merged.dateLancement;
            const chaineId = patch.chaineId ?? merged.chaineId;
            const recalc =
                'totalQuantity' in patch || 'qteTotal' in patch ||
                'startDate' in patch || 'dateLancement' in patch ||
                'chaineId' in patch;
            if (recalc && start && qty > 0) {
                const end = computeEndDate(merged.modelId, chaineId, start.split('T')[0], qty);
                merged.estimatedEndDate = end;
                merged.dateExport = end;
                merged.startDate = start.split('T')[0];
                merged.dateLancement = start.split('T')[0];
                merged.totalQuantity = qty;
                merged.qteTotal = qty;
                merged.chaineId = chaineId;
            }
            return applyStock(merged, qty);
        }));
    }, [setPlanningEventsWithRolling, computeEndDate, applyStock]);

    /** Déplace (drag-drop) — nouvelle chaîne + nouvelle date. */
    const moveEvent = useCallback((id: string, chaineId: string, dateKey: string) => {
        const ev = planningEvents.find(e => e.id === id);
        if (!ev) return;
        updateEvent(id, { chaineId, startDate: dateKey, dateLancement: dateKey });
    }, [planningEvents, updateEvent]);

    /** Fractionne un OF en deux : original avec (qty - splitQty), nouveau avec splitQty. */
    const splitEvent = useCallback((id: string, splitQty: number) => {
        const orig = planningEvents.find(e => e.id === id);
        if (!orig) return;
        const origQty = evQty(orig);
        if (splitQty <= 0 || splitQty >= origQty) return;
        const remQty = origQty - splitQty;
        const startRaw = evStartYmd(orig);

        const newOrigEnd = computeEndDate(orig.modelId, orig.chaineId, startRaw, remQty);
        const newSplitEnd = computeEndDate(orig.modelId, orig.chaineId, startRaw, splitQty);

        let origDist = orig.sizeColorDistribution;
        let splitDist: Record<string, Record<string, number>> | undefined = undefined;
        let remDist: Record<string, Record<string, number>> | undefined = undefined;

        if (origDist) {
            const scaledResult = scaleDistribution(origDist, splitQty, origQty);
            if (scaledResult) {
                splitDist = scaledResult.scaled;
                remDist = scaledResult.remaining;
            }
        }

        const updatedOrig: PlanningEvent = {
            ...orig,
            totalQuantity: remQty,
            qteTotal: remQty,
            estimatedEndDate: newOrigEnd,
            dateExport: newOrigEnd,
            sizeColorDistribution: remDist,
        };
        const cloned: PlanningEvent = {
            ...orig,
            id: `event_${Date.now()}`,
            totalQuantity: splitQty,
            qteTotal: splitQty,
            producedQuantity: 0,
            qteProduite: 0,
            status: 'READY',
            estimatedEndDate: newSplitEnd,
            dateExport: newSplitEnd,
            sizeColorDistribution: splitDist,
        };
        const stockedOrig = applyStock(updatedOrig, remQty);
        const stockedClone = applyStock(cloned, splitQty);
        setPlanningEventsWithRolling(prev => [...prev.map(e => e.id === id ? stockedOrig : e), stockedClone]);
    }, [planningEvents, computeEndDate, applyStock, setPlanningEventsWithRolling]);

    /** Fractionne un OF en plusieurs lots selon les livraisons client. */
    const splitEventWithLots = useCallback((id: string, lots: { 
        id: string; 
        label: string; 
        quantity: number; 
        client: string; 
        deliveryDate: string; 
        status: string;
        sizeColorDistribution?: Record<string, Record<string, number>>;
    }[]) => {
        const orig = planningEvents.find(e => e.id === id);
        if (!orig || lots.length === 0) return;

        const newEvents: PlanningEvent[] = [];
        let remainingQty = evQty(orig);

        let remainingDist: Record<string, Record<string, number>> | undefined = undefined;
        if (orig.sizeColorDistribution) {
            remainingDist = JSON.parse(JSON.stringify(orig.sizeColorDistribution));
        }

        for (const lot of lots) {
            if (lot.quantity <= 0 || lot.quantity > remainingQty) continue;
            const startRaw = evStartYmd(orig);
            const endIso = computeEndDate(orig.modelId, orig.chaineId, startRaw, lot.quantity);

            if (remainingDist && lot.sizeColorDistribution) {
                Object.keys(lot.sizeColorDistribution).forEach(colorId => {
                    if (!remainingDist![colorId]) return;
                    Object.keys(lot.sizeColorDistribution![colorId]).forEach(size => {
                        const qty = lot.sizeColorDistribution![colorId][size] || 0;
                        remainingDist![colorId][size] = Math.max(0, (remainingDist![colorId][size] || 0) - qty);
                    });
                });
            }

            newEvents.push({
                ...orig,
                id: `event_${Date.now()}_${lot.id}`,
                totalQuantity: lot.quantity,
                qteTotal: lot.quantity,
                producedQuantity: 0,
                qteProduite: 0,
                status: 'READY',
                estimatedEndDate: endIso,
                dateExport: endIso,
                clientName: lot.client || orig.clientName,
                strictDeadline_DDS: lot.deliveryDate || orig.strictDeadline_DDS,
                modelName: `${orig.modelName || ''} — ${lot.label}`,
                sizeColorDistribution: lot.sizeColorDistribution,
                lots_data: [{
                    id: lot.id,
                    taille: '',
                    couleur: '',
                    quantite: lot.quantity,
                    deadline: lot.deliveryDate,
                    status: (lot.status === 'DELIVERED' ? 'DELIVERED' : lot.status === 'READY' ? 'READY' : 'PENDING') as Lot['status'],
                }],
            });
            remainingQty -= lot.quantity;
        }

        // Update original with remaining quantity
        if (remainingQty > 0) {
            const startRaw = evStartYmd(orig);
            const endIso = computeEndDate(orig.modelId, orig.chaineId, startRaw, remainingQty);
            const updatedOrig: PlanningEvent = {
                ...orig,
                totalQuantity: remainingQty,
                qteTotal: remainingQty,
                estimatedEndDate: endIso,
                dateExport: endIso,
                sizeColorDistribution: remainingDist,
            };
            const stockedOrig = applyStock(updatedOrig, remainingQty);
            setPlanningEventsWithRolling(prev => [...prev.map(e => e.id === id ? stockedOrig : e), ...newEvents.map(e => applyStock(e, e.totalQuantity || 0))]);
        } else {
            // All quantity distributed to lots, remove original
            setPlanningEventsWithRolling(prev => [...prev.filter(e => e.id !== id), ...newEvents.map(e => applyStock(e, e.totalQuantity || 0))]);
        }
    }, [planningEvents, computeEndDate, applyStock, setPlanningEventsWithRolling]);

    const duplicateEvent = useCallback((id: string) => {
        const orig = planningEvents.find(e => e.id === id);
        if (!orig) return;
        const cloned: PlanningEvent = {
            ...orig,
            id: `event_${Date.now()}`,
            producedQuantity: 0,
            qteProduite: 0,
            status: 'READY',
        };
        setPlanningEventsWithRolling(prev => [...prev, cloned]);
    }, [planningEvents, setPlanningEventsWithRolling]);

    const deleteEvent = useCallback((id: string) => {
        setPlanningEventsWithRolling(prev => prev.filter(e => e.id !== id));
    }, [setPlanningEventsWithRolling]);

    const clearAllEvents = useCallback(() => {
        setPlanningEventsWithRolling([]);
    }, [setPlanningEventsWithRolling]);

    const setStatus = useCallback((id: string, status: PlanningEvent['status']) => {
        setPlanningEventsWithRolling(prev => prev.map(e => e.id === id ? { ...e, status } : e));
    }, [setPlanningEventsWithRolling]);

    return {
        events: planningEvents,
        addEvent,
        updateEvent,
        moveEvent,
        splitEvent,
        splitEventWithLots,
        duplicateEvent,
        deleteEvent,
        clearAllEvents,
        setStatus,
        computeEndDate,
        applyStock,
    };
}

