import { useMemo } from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent } from '../../../types';
import { getChainDailyCapacity, maxDayLoadRatioInSpan } from '../../../utils/capacity';
import { getChainMachineIds, validateMachineCoverage } from '../../../utils/machineMatch';
import { evEndYmd, evQty, evStartYmd } from '../shared/eventAccessors';
import { delayOf } from './useDelayIndicator';
import { parsePlanningDateAtNoon, planningLocalDateKey } from '../../../utils/planning';

export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueType = 'capacity' | 'machines' | 'stock' | 'deadline';

export interface Issue {
    id: string;
    eventId: string;
    severity: IssueSeverity;
    type: IssueType;
    title: string;
    detail: string;
    suggestion?: string;
}

interface Args {
    planningEvents: PlanningEvent[];
    models: ModelData[];
    machines: Machine[];
    settings: AppSettings;
}

export function usePlanningValidation({ planningEvents, models, machines, settings }: Args): Issue[] {
    return useMemo(() => {
        const issues: Issue[] = [];

        // ⚡ Pre-index: build per-chain per-day load map ONCE → O(N×D) instead of O(N²×D)
        const chainDayLoad = new Map<string, Map<string, number>>();
        for (const ev of planningEvents) {
            const startRaw = (ev.startDate || ev.dateLancement || '').split('T')[0];
            const endRaw = (ev.estimatedEndDate || ev.dateExport || ev.strictDeadline_DDS || '').split('T')[0];
            if (!startRaw || !endRaw) continue;
            const sT = parsePlanningDateAtNoon(startRaw).getTime();
            const eT = parsePlanningDateAtNoon(endRaw).getTime();
            if (Number.isNaN(sT) || Number.isNaN(eT) || eT < sT) continue;
            const spanDays = Math.max(1, Math.round((eT - sT) / 86400000) + 1);
            const qty = ev.qteTotal || ev.totalQuantity || 0;
            const perDay = qty / spanDays;
            let chainMap = chainDayLoad.get(ev.chaineId);
            if (!chainMap) { chainMap = new Map(); chainDayLoad.set(ev.chaineId, chainMap); }
            const limit = Math.min(eT, sT + 1000 * 86400000);
            for (let t = sT; t <= limit; t += 86400000) {
                const key = planningLocalDateKey(new Date(t));
                chainMap.set(key, (chainMap.get(key) ?? 0) + perDay);
            }
        }

        // ⚡ Pre-index models by id → O(1) lookup instead of O(M)
        const modelsMap = new Map(models.map(m => [m.id, m]));

        // ⚡ Cache machine coverage per chain (same chain → same result)
        const machineCoverageCache = new Map<string, ReturnType<typeof validateMachineCoverage>>();

        for (const ev of planningEvents) {
            if (ev.status === 'DONE') continue;

            // 1. Stock magasin
            if (ev.status === 'BLOCKED_STOCK' || ev.materialShortages?.length) {
                const missing = (ev.materialShortages || []).map(s => `${s.name} (-${s.missing}${s.unit || ''})`).join(', ');
                issues.push({
                    id: `${ev.id}-stock`,
                    eventId: ev.id,
                    severity: 'error',
                    type: 'stock',
                    title: 'Stock insuffisant',
                    detail: missing || ev.blockedReason || 'Matières manquantes',
                    suggestion: 'Vérifier le magasin ou créer un bon de commande',
                });
            }

            // 2. Couverture machines
            const model = modelsMap.get(ev.modelId);
            if (model) {
                const ops = model.gamme_operatoire ?? [];
                const cacheKey = `${ev.chaineId}::${ev.modelId}`;
                let mc = machineCoverageCache.get(cacheKey);
                if (!mc) {
                    const ids = getChainMachineIds(ev.chaineId, settings, machines);
                    mc = validateMachineCoverage(ops, machines, ids);
                    machineCoverageCache.set(cacheKey, mc);
                }
                if (!mc.ok && mc.missingClasses.length) {
                    issues.push({
                        id: `${ev.id}-machines`,
                        eventId: ev.id,
                        severity: 'warning',
                        type: 'machines',
                        title: 'Couverture machines incomplète',
                        detail: `Classes manquantes sur ${ev.chaineId} : ${mc.missingClasses.join(', ')}`,
                        suggestion: 'Affecter les machines à la ligne ou changer de chaîne',
                    });
                }
            }

            // 3. Capacité (utilise l'index pré-calculé → O(D) au lieu de O(N×D))
            const start = evStartYmd(ev);
            const end = evEndYmd(ev);
            if (start && end) {
                const cap = getChainDailyCapacity(settings.chainCapacityPerDay, ev.chaineId, 1000);
                const chainMap = chainDayLoad.get(ev.chaineId);
                if (chainMap && cap > 0) {
                    const sT = parsePlanningDateAtNoon(start).getTime();
                    const eT = parsePlanningDateAtNoon(end).getTime();
                    let maxLoad = 0;
                    let overCount = 0;
                    if (!Number.isNaN(sT) && !Number.isNaN(eT)) {
                        for (let t = sT; t <= eT; t += 86400000) {
                            const key = planningLocalDateKey(new Date(t));
                            const load = chainMap.get(key) ?? 0;
                            if (load > maxLoad) maxLoad = load;
                            if (load / cap > 1.0001) overCount++;
                        }
                    }
                    const maxR = maxLoad / cap;
                    if (maxR > 1.0001) {
                        issues.push({
                            id: `${ev.id}-capacity`,
                            eventId: ev.id,
                            severity: 'warning',
                            type: 'capacity',
                            title: 'Capacité dépassée',
                            detail: `Pic ~${Math.round(maxR * 100)} % (${cap} pcs/j) — ${overCount} jour(s) en surcharge`,
                            suggestion: 'Réduire la quantité, fractionner, ou changer de chaîne',
                        });
                    }
                }
            }

            // 4. Délai
            const delay = delayOf(ev);
            if (delay === 'LATE') {
                issues.push({
                    id: `${ev.id}-deadline`,
                    eventId: ev.id,
                    severity: 'error',
                    type: 'deadline',
                    title: 'Hors délai',
                    detail: 'La fin estimée dépasse le DDS',
                    suggestion: 'Avancer la date, accélérer ou prévenir le client',
                });
            } else if (delay === 'AT_RISK') {
                issues.push({
                    id: `${ev.id}-deadline-risk`,
                    eventId: ev.id,
                    severity: 'warning',
                    type: 'deadline',
                    title: 'Délai serré',
                    detail: 'La fin est très proche du DDS',
                });
            }
        }

        // Tri : erreurs avant avertissements
        const order = { error: 0, warning: 1, info: 2 };
        issues.sort((a, b) => order[a.severity] - order[b.severity]);
        return issues;
    }, [planningEvents, models, machines, settings]);
}

/** Vérifie un OF avant insertion/modif (utile au modal de création). */
export function checkEventDraft(
    draft: { modelId: string; chaineId: string; startDate: string; quantity: number; strictDeadline_DDS?: string },
    context: { planningEvents: PlanningEvent[]; models: ModelData[]; machines: Machine[]; settings: AppSettings; computeEndDate: (modelId: string, chaineId: string, start: string, qty: number) => string }
): Issue[] {
    const issues: Issue[] = [];
    const { planningEvents, models, machines, settings, computeEndDate } = context;
    if (!draft.modelId || draft.quantity <= 0) return issues;

    const model = models.find(m => m.id === draft.modelId);
    const endIso = computeEndDate(draft.modelId, draft.chaineId, draft.startDate, draft.quantity);
    const endYmd = endIso.split('T')[0];

    // Machines
    if (model) {
        const ops = model.gamme_operatoire ?? [];
        const ids = getChainMachineIds(draft.chaineId, settings, machines);
        const mc = validateMachineCoverage(ops, machines, ids);
        if (!mc.ok && mc.missingClasses.length) {
            issues.push({
                id: 'draft-machines',
                eventId: 'draft',
                severity: 'warning',
                type: 'machines',
                title: 'Couverture machines incomplète',
                detail: `Classes manquantes sur ${draft.chaineId} : ${mc.missingClasses.join(', ')}`,
            });
        }
    }

    // Capacité — simule l'ajout
    const simulated: PlanningEvent = {
        id: '__draft__',
        modelId: draft.modelId,
        chaineId: draft.chaineId,
        dateLancement: draft.startDate,
        startDate: draft.startDate,
        dateExport: endIso,
        estimatedEndDate: endIso,
        qteTotal: draft.quantity,
        totalQuantity: draft.quantity,
        status: 'READY',
    };
    const cap = getChainDailyCapacity(settings.chainCapacityPerDay, draft.chaineId, 1000);
    const maxR = maxDayLoadRatioInSpan([...planningEvents, simulated], draft.chaineId, cap, draft.startDate, endYmd);
    if (maxR > 1.0001) {
        issues.push({
            id: 'draft-capacity',
            eventId: 'draft',
            severity: 'warning',
            type: 'capacity',
            title: 'Capacité dépassée',
            detail: `Pic ~${Math.round(maxR * 100)} % (${cap} pcs/j)`,
        });
    }

    // Délai
    if (draft.strictDeadline_DDS) {
        const dds = draft.strictDeadline_DDS.split('T')[0];
        if (endYmd > dds) {
            issues.push({
                id: 'draft-deadline',
                eventId: 'draft',
                severity: 'error',
                type: 'deadline',
                title: 'Hors délai',
                detail: `Fin estimée ${endYmd} > DDS ${dds}`,
            });
        }
    }

    return issues;
}
