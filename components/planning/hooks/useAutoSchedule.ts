import { useCallback } from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent } from '../../../types';
import { getChainDailyCapacity, maxDayLoadRatioInSpan } from '../../../utils/capacity';
import { getChainMachineIds, validateMachineCoverage } from '../../../utils/machineMatch';
import { isPlanningWorkingDay, planningLocalDateKey, calculateEndDate } from '../../../utils/planning';
import type { PlanningChain } from './usePlanningChains';
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

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
    const { lang } = useLang();

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

            // Filtre 1 : couverture machines — désactivable globalement (Configuration → alertes machines)
            if (settings.machineAlertsEnabled !== false) {
                const ops = model.gamme_operatoire ?? [];
                const ids = getChainMachineIds(chain.id, settings, machines);
                const mc = validateMachineCoverage(ops, machines, ids);
                if (!mc.ok) {
                    score -= 30;
                    reasoning.push(`⚠ Couverture incomplète (${mc.missingClasses.join(', ')})`);
                } else {
                    reasoning.push('✓ Couverture machines OK');
                }
            }

            // Calcul fin
            const sam = model.meta_data?.total_temps || 15;
            
            // Model planning efficiency
            const modelEff = model.ficheData?.targetEfficiency ?? 85;
            const safetyFactor = model.ficheData?.facteurPlanning ?? 60;
            const effToUse = (modelEff * safetyFactor) / 10000;

            // Launch buffer
            const setupMins = model.ficheData?.bufferLancement !== undefined 
                ? model.ficheData.bufferLancement 
                : (settings.changeoverDurationMins ?? 120);

            const endIso = calculateEndDate(todayYmd, input.quantity, sam, effToUse, settings, chain.id, setupMins);
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
                const isExport = model.ficheData?.typeMarche === 'Export';
                let adjustedDDS = new Date(input.deadlineDDS);
                if (isExport) {
                    adjustedDDS.setDate(adjustedDDS.getDate() - 3);
                }
                const ddsYmd = adjustedDDS.toISOString().split('T')[0];

                if (endYmd > ddsYmd) {
                    score -= 50;
                    reasoning.push(isExport ? tx(lang, {fr:'✗ Dépasse le DDS (Transit -3j inclus)',ar:'✗ تجاوز DDS (ترانزيت -3أيام شامل)',en:'✗ Exceeds DDS (Transit -3d included)',es:'✗ Supera DDS (Tránsito -3d incluido)',pt:'✗ Excede DDS (Trânsito -3d incluído)',tr:'✗ DDS\'yi aşıyor (Transit -3g dahil)'}) : tx(lang, {fr:'✗ Dépasse le DDS',ar:'✗ تجاوز DDS',en:'✗ Exceeds DDS',es:'✗ Supera DDS',pt:'✗ Excede DDS',tr:'✗ DDS\'yi aşıyor'}));
                } else {
                    const buffer = Math.round((adjustedDDS.getTime() - new Date(endYmd).getTime()) / 86400000);
                    if (buffer >= 5) {
                        score += 5;
                        reasoning.push(`✓ Marge ${buffer} j avant DDS${isExport ? ' (Transit -3j inclus)' : ''}`);
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
    }, [chains, planningEvents, models, machines, settings, lang]);

    return { suggest };
}
