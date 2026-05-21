import { useCallback, useMemo } from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent } from '../../../types';
import { calculateEndDate } from '../../../utils/planning';
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
}

export function usePlanningEvents({
    planningEvents,
    setPlanningEvents,
    models,
    chains,
    settings,
    stock,
}: Args) {

    /** Applique les contraintes stock magasin → status BLOCKED + raison. */
    const applyStock = useCallback(<T extends PlanningEvent>(ev: T, qty: number): T => {
        if (!stock?.products?.length) return ev;
        const model = models.find(m => m.id === ev.modelId);
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
            const eff = chain?.efficiency ?? 0.85;
            return calculateEndDate(startDate, quantity, sam, eff, settings);
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
        };
        const stocked = applyStock(baseEv, input.quantity);
        setPlanningEvents(prev => [...prev, stocked]);
    }, [models, computeEndDate, applyStock, setPlanningEvents]);

    /** Met à jour un OF — accepte un objet partiel. */
    const updateEvent = useCallback((id: string, patch: Partial<PlanningEvent>) => {
        setPlanningEvents(prev => prev.map(ev => {
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
    }, [setPlanningEvents, computeEndDate, applyStock]);

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

        const updatedOrig: PlanningEvent = {
            ...orig,
            totalQuantity: remQty,
            qteTotal: remQty,
            estimatedEndDate: newOrigEnd,
            dateExport: newOrigEnd,
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
        };
        const stockedOrig = applyStock(updatedOrig, remQty);
        const stockedClone = applyStock(cloned, splitQty);
        setPlanningEvents(prev => [...prev.map(e => e.id === id ? stockedOrig : e), stockedClone]);
    }, [planningEvents, computeEndDate, applyStock, setPlanningEvents]);

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
        setPlanningEvents(prev => [...prev, cloned]);
    }, [planningEvents, setPlanningEvents]);

    const deleteEvent = useCallback((id: string) => {
        setPlanningEvents(prev => prev.filter(e => e.id !== id));
    }, [setPlanningEvents]);

    const setStatus = useCallback((id: string, status: PlanningEvent['status']) => {
        setPlanningEvents(prev => prev.map(e => e.id === id ? { ...e, status } : e));
    }, [setPlanningEvents]);

    return {
        events: planningEvents,
        addEvent,
        updateEvent,
        moveEvent,
        splitEvent,
        duplicateEvent,
        deleteEvent,
        setStatus,
        computeEndDate,
        applyStock,
    };
}
