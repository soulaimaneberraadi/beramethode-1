import { useMemo } from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent, SuiviData } from '../../../types';
import { computeChainEfficiency } from '../../../utils/efficiency';
import { getChainDailyCapacity } from '../../../utils/capacity';

export interface PlanningChain {
    id: string;
    name: string;
    capacityPerDay: number;
    efficiency: number;
    efficiencySource?: 'COMPUTED';
    efficiencySampleSize: number;
    isActive: boolean;
}

interface Args {
    settings: AppSettings;
    suivis: SuiviData[];
    planningEvents: PlanningEvent[];
    models: ModelData[];
}

export function usePlanningChains({ settings, suivis, planningEvents, models }: Args): PlanningChain[] {
    return useMemo(() => {
        const count = settings.chainsCount || 12;
        return Array.from({ length: count }, (_, i) => {
            const id = `CHAINE ${i + 1}`;
            const { eff, n } = computeChainEfficiency(suivis, planningEvents, models, id, settings);
            return {
                id,
                name: settings.chainNames?.[id] || id,
                capacityPerDay: getChainDailyCapacity(settings.chainCapacityPerDay, id, 1000),
                efficiency: eff,
                efficiencySource: n > 0 ? ('COMPUTED' as const) : undefined,
                efficiencySampleSize: n,
                isActive: true,
            };
        });
    }, [settings, suivis, planningEvents, models]);
}
