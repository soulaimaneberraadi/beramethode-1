import { useMemo } from 'react';
import type { ModelData, PlanningEvent } from '../../../types';
import { getClientColor } from '../../planning/shared/clientColors';

export interface ActiveModelInfo {
    planningId: string;
    modelId: string;
    model: ModelData | undefined;
    color: string;
    modelName: string;
    clientName: string;
}

export interface ChainActiveContext {
    chaineId: string;
    activeModels: ActiveModelInfo[];
    /** True when more than one OF overlaps this date/chain. */
    conflict: boolean;
    /** Primary = first by startDate. */
    primary: ActiveModelInfo | null;
}

interface Args {
    date: string;
    planningEvents: PlanningEvent[];
    models: ModelData[];
}

/**
 * Pour chaque chaîne, détermine les modèles "actifs" à la date donnée.
 * Actif = startDate ≤ date ≤ estimatedEndDate (inclusive).
 */
export function useSuiviActiveContext({ date, planningEvents, models }: Args): Map<string, ChainActiveContext> {
    return useMemo(() => {
        const byChain = new Map<string, ChainActiveContext>();
        const target = date;

        for (const ev of planningEvents) {
            const start = (ev.startDate || ev.dateLancement || '').split('T')[0];
            const end = (ev.estimatedEndDate || ev.dateExport || start).split('T')[0];
            if (!start) continue;
            if (target < start || target > end) continue;

            const chaineId = ev.chaineId || 'UNKNOWN';
            const model = models.find(m => m.id === ev.modelId);
            const clientName = ev.clientName || model?.ficheData?.client || '';
            const color = ev.color || getClientColor(clientName);

            const info: ActiveModelInfo = {
                planningId: ev.id,
                modelId: ev.modelId,
                model,
                color,
                modelName: ev.modelName || model?.meta_data?.nom_modele || ev.modelId,
                clientName,
            };

            const existing = byChain.get(chaineId);
            if (existing) {
                existing.activeModels.push(info);
                existing.conflict = existing.activeModels.length > 1;
            } else {
                byChain.set(chaineId, {
                    chaineId,
                    activeModels: [info],
                    conflict: false,
                    primary: info,
                });
            }
        }

        // Sort active models per chain by start date (earliest first) and update primary.
        for (const ctx of byChain.values()) {
            ctx.activeModels.sort((a, b) => {
                const ea = planningEvents.find(e => e.id === a.planningId);
                const eb = planningEvents.find(e => e.id === b.planningId);
                const sa = (ea?.startDate || ea?.dateLancement || '').split('T')[0];
                const sb = (eb?.startDate || eb?.dateLancement || '').split('T')[0];
                return sa.localeCompare(sb);
            });
            ctx.primary = ctx.activeModels[0] || null;
        }

        return byChain;
    }, [date, planningEvents, models]);
}
