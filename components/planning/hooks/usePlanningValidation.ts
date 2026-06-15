import { useMemo } from 'react';
import type { AppSettings, Machine, ModelData, PlanningEvent, MaterialReceipt } from '../../../types';
import { getChainDailyCapacity, maxDayLoadRatioInSpan, getEffectiveCapacity } from '../../../utils/capacity';
import { getChainMachineIds, validateMachineCoverage } from '../../../utils/machineMatch';
import { evEndYmd, evQty, evStartYmd } from '../shared/eventAccessors';
import { delayOf } from './useDelayIndicator';
import { parsePlanningDateAtNoon, planningLocalDateKey } from '../../../utils/planning';
import type { PlanningChain } from './usePlanningChains';

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

// ═══════════════════════════════════════════════════════════
// LOGISTICS MRP: Material Availability Color Indicators
// 🟢 Total Availability | 🟡 Lot Covered Only | 🔴 Rupture
// ═══════════════════════════════════════════════════════════

export type MaterialAvailabilityColor = 'green' | 'yellow' | 'red' | 'none';

export interface MaterialAvailabilityResult {
    color: MaterialAvailabilityColor;
    emoji: '🟢' | '🟡' | '🔴' | '⚪';
    label: string;
    details: { materialName: string; received: number; needed: number; covered: boolean }[];
}

/** Compute material availability status for a planning event based on BR receipts. */
export function getMaterialAvailability(
    modelId: string,
    models: ModelData[],
    totalQty: number,
    lotQty?: number,
): MaterialAvailabilityResult {
    let receipts: MaterialReceipt[] = [];
    try {
        const raw = localStorage.getItem('beramethode_receptions');
        if (raw) receipts = JSON.parse(raw);
    } catch (_) { /* ignore */ }

    const model = models.find(m => m.id === modelId);
    const materials = model?.ficheData?.materials || [];
    if (materials.length === 0 || receipts.length === 0) {
        return { color: 'none', emoji: '⚪', label: 'Pas de BOM/BR', details: [] };
    }

    const details: MaterialAvailabilityResult['details'] = [];
    let allCovered = true;
    let lotCovered = true;
    const activeLotQty = lotQty || totalQty;

    materials.forEach(mat => {
        const matReceipts = receipts.filter(
            (r) => r.modelId === modelId && r.materialName?.toLowerCase().trim() === mat.name?.toLowerCase().trim()
        );
        const totalReceived = matReceipts.reduce((s, r) => s + (r.qtyReceived || 0), 0);
        const totalNeeded = totalQty * (mat.qty || 0);
        const lotNeeded = activeLotQty * (mat.qty || 0);

        const coveredTotal = totalReceived >= totalNeeded;
        const coveredLot = totalReceived >= lotNeeded;

        if (!coveredTotal) allCovered = false;
        if (!coveredLot) lotCovered = false;

        details.push({
            materialName: mat.name,
            received: totalReceived,
            needed: totalNeeded,
            covered: coveredTotal,
        });
    });

    if (allCovered) return { color: 'green', emoji: '🟢', label: 'Stock complet', details };
    if (lotCovered) return { color: 'yellow', emoji: '🟡', label: 'Lot couvert', details };
    return { color: 'red', emoji: '🔴', label: 'Rupture stock', details };
}

interface Args {
    planningEvents: PlanningEvent[];
    models: ModelData[];
    machines: Machine[];
    settings: AppSettings;
    chains?: PlanningChain[];
}

export function usePlanningValidation({ planningEvents, models, machines, settings, chains }: Args): Issue[] {
    return useMemo(() => {
        const issues: Issue[] = [];
        const chainEffMap = new Map(chains?.map(c => [c.id, c.efficiency]) ?? []);

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

            const model = modelsMap.get(ev.modelId);

            // 1. Stock magasin
            const isLocal = model?.ficheData?.typeMarche !== 'Export';
            if (isLocal && (ev.status === 'BLOCKED_STOCK' || ev.materialShortages?.length)) {
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

            // 2. Couverture machines — désactivable globalement (Configuration → alertes machines)
            if (model && settings.machineAlertsEnabled !== false) {
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
                const model = modelsMap.get(ev.modelId);
                const sam = model?.meta_data?.total_temps || 15;
                const eff = chainEffMap.get(ev.chaineId) ?? 0.85;
                const cap = getEffectiveCapacity(settings, ev.chaineId, sam, eff);
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

            // 5. Material Receipt Availability (BR-based 🟢🟡🔴)
            if (model?.ficheData?.materials?.length) {
                const availability = getMaterialAvailability(
                    ev.modelId,
                    models,
                    evQty(ev),
                    ev.lots_data?.[0]?.quantite,
                );

                if (availability.color === 'red') {
                    const uncovered = availability.details
                        .filter(d => !d.covered)
                        .map(d => `${d.materialName} (${d.received}/${Math.round(d.needed)})`)
                        .join(', ');
                    issues.push({
                        id: `${ev.id}-material-br`,
                        eventId: ev.id,
                        severity: 'error',
                        type: 'stock',
                        title: '🔴 Rupture fournitures (BR)',
                        detail: `Réceptions insuffisantes : ${uncovered}`,
                        suggestion: 'Relancer le fournisseur ou le client Export — [PAUSE / BLOCKED - FURNITURE]',
                    });
                } else if (availability.color === 'yellow') {
                    const partial = availability.details
                        .filter(d => !d.covered)
                        .map(d => d.materialName)
                        .join(', ');
                    issues.push({
                        id: `${ev.id}-material-br-partial`,
                        eventId: ev.id,
                        severity: 'warning',
                        type: 'stock',
                        title: '🟡 Stock partiel (Lot couvert)',
                        detail: `Seul le lot actif est couvert. Manque pour total : ${partial}`,
                        suggestion: 'Planifier la réception suivante avant fin du lot actuel',
                    });
                }
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

    // Machines — désactivable globalement (Configuration → alertes machines)
    if (model && settings.machineAlertsEnabled !== false) {
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
    const sam = model?.meta_data?.total_temps || 15;
    const cap = getEffectiveCapacity(settings, draft.chaineId, sam, 0.85);
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
        let dds = draft.strictDeadline_DDS.split('T')[0];
        if (model?.ficheData?.typeMarche === 'Export') {
            const raw = (dds || '').split('T')[0];
            const [y, m, d] = raw.split('-').map(Number);
            if (y && m && d) {
                const dateObj = new Date(y, m - 1, d);
                dateObj.setDate(dateObj.getDate() - 3);
                const ny = dateObj.getFullYear();
                const nm = String(dateObj.getMonth() + 1).padStart(2, '0');
                const nd = String(dateObj.getDate()).padStart(2, '0');
                dds = `${ny}-${nm}-${nd}`;
            }
        }
        if (endYmd > dds) {
            issues.push({
                id: 'draft-deadline',
                eventId: 'draft',
                severity: 'error',
                type: 'deadline',
                title: 'Hors délai',
                detail: `Fin estimée ${endYmd} > DDS ${dds}${model?.ficheData?.typeMarche === 'Export' ? ' (Ajusté Export -3j)' : ''}`,
            });
        }
    }

    return issues;
}
