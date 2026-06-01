import { useCallback } from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent } from '../../../types';
import { getChainDailyCapacity, maxDayLoadRatioInSpan } from '../../../utils/capacity';
import { getChainMachineIds, validateMachineCoverage } from '../../../utils/machineMatch';
import { isPlanningWorkingDay, planningLocalDateKey, calculateEndDate } from '../../../utils/planning';
import type { PlanningChain } from './usePlanningChains';

export interface ScheduleSuggestion {
    chaineId: string;
    chainName: string;
    startDate: string;
    endDate: string;
    score: number;
    reasoning: string[];
}

interface Args {
    chains: PlanningChain[];
    planningEvents: PlanningEvent[];
    models: ModelData[];
    machines: Machine[];
    settings: AppSettings;
}

/** Trouve le prochain jour ouvré ≥ from. */
function nextWorkingDay(from: Date, settings: AppSettings): Date {
    const d = new Date(from);
    let safety = 0;
    while (!isPlanningWorkingDay(d, settings) && safety < 10000) {
        safety++;
        d.setDate(d.getDate() + 1);
    }
    return d;
}

export function useAutoSchedule({ chains, planningEvents, models, machines, settings }: Args) {

    const suggest = useCallback((input: {
        modelId: string;
        quantity: number;
        deadlineDDS?: string;
    }): ScheduleSuggestion | null => {
        const model = models.find(m => m.id === input.modelId);
        if (!model || input.quantity <= 0) return null;

        const today = nextWorkingDay(new Date(), settings);
        const todayYmd = planningLocalDateKey(today);
        const candidates: ScheduleSuggestion[] = [];

        for (const chain of chains) {
            const reasoning: string[] = [];
            let score = 100;

            // Filtre 1 : couverture machines
            const ops = model.gamme_operatoire ?? [];
            const ids = getChainMachineIds(chain.id, settings, machines);
            const mc = validateMachineCoverage(ops, machines, ids);
            if (!mc.ok) {
                score -= 30;
                reasoning.push(`⚠ Couverture incomplète (${mc.missingClasses.join(', ')})`);
            } else {
                reasoning.push('✓ Couverture machines OK');
            }

            // Calcul fin
            const sam = model.meta_data?.total_temps || 15;
            const endIso = calculateEndDate(todayYmd, input.quantity, sam, chain.efficiency, settings);
            const endYmd = endIso.split('T')[0];

            // Filtre 2 : capacité
            const cap = chain.capacityPerDay;
            const maxR = maxDayLoadRatioInSpan(planningEvents, chain.id, cap, todayYmd, endYmd);
            if (maxR > 1.0) {
                score -= Math.round((maxR - 1) * 50);
                reasoning.push(`⚠ Shin chargée (${Math.round(maxR * 100)} %)`);
            } else if (maxR < 0.3) {
                score += 15;
                reasoning.push(`✓ Capacité libre (${Math.round(maxR * 100)} %)`);
            } else {
                reasoning.push(`✓ Capacité disponible (${Math.round(maxR * 100)} %)`);
            }

            // Filtre 3 : efficacité
            if (chain.efficiency >= 0.85) {
                score += 10;
                reasoning.push(`✓ Bonne efficacité (${Math.round(chain.efficiency * 100)} %)`);
            } else if (chain.efficiency < 0.7) {
                score -= 10;
                reasoning.push(`~ Efficacité moyenne (${Math.round(chain.efficiency * 100)} %)`);
            }

            // Filtre 4 : DDS
            if (input.deadlineDDS) {
                const dds = input.deadlineDDS.split('T')[0];
                if (endYmd > dds) {
                    score -= 50;
                    reasoning.push('✗ Dépasse le DDS');
                } else {
                    const buffer = Math.round((new Date(dds).getTime() - new Date(endYmd).getTime()) / 86400000);
                    if (buffer >= 5) {
                        score += 5;
                        reasoning.push(`✓ Marge ${buffer} j avant DDS`);
                    }
                }
            }

            candidates.push({
                chaineId: chain.id,
                chainName: chain.name,
                startDate: todayYmd,
                endDate: endYmd,
                score,
                reasoning,
            });
        }

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        if (!best || best.score < 30) return null;
        return best;
    }, [chains, planningEvents, models, machines, settings]);

    return { suggest };
}
