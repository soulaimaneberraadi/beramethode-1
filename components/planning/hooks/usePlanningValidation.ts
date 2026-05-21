import { useMemo } from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent } from '../../../types';
import { getChainDailyCapacity, maxDayLoadRatioInSpan, overloadDaysInSpan } from '../../../utils/capacity';
import { getChainMachineIds, validateMachineCoverage } from '../../../utils/machineMatch';
import { evEndYmd, evQty, evStartYmd } from '../shared/eventAccessors';
import { delayOf } from './useDelayIndicator';

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
            const model = models.find(m => m.id === ev.modelId);
            if (model) {
                const ops = model.gamme_operatoire ?? [];
                const ids = getChainMachineIds(ev.chaineId, settings, machines);
                const mc = validateMachineCoverage(ops, machines, ids);
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

            // 3. Capacité
            const start = evStartYmd(ev);
            const end = evEndYmd(ev);
            if (start && end) {
                const cap = getChainDailyCapacity(settings.chainCapacityPerDay, ev.chaineId, 1000);
                const maxR = maxDayLoadRatioInSpan(planningEvents, ev.chaineId, cap, start, end);
                if (maxR > 1.0001) {
                    const overloaded = overloadDaysInSpan(planningEvents, ev.chaineId, cap, start, end, 3);
                    issues.push({
                        id: `${ev.id}-capacity`,
                        eventId: ev.id,
                        severity: 'warning',
                        type: 'capacity',
                        title: 'Capacité dépassée',
                        detail: `Pic ~${Math.round(maxR * 100)} % (${cap} pcs/j) — ${overloaded.length} jour(s) en surcharge`,
                        suggestion: 'Réduire la quantité, fractionner, ou changer de chaîne',
                    });
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
