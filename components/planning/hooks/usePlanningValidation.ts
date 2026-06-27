import { useMemo } from 'react';
import { tx } from '../../../lib/i18n';
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
    lang: string,
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
    if (!model) {
        return { color: 'none', emoji: '⚪', label: tx(lang, { fr: 'Modèle introuvable', ar: 'النموذج غير موجود', en: 'Model not found' }), details: [] };
    }
    const materials = model.ficheData?.materials || [];
    if (materials.length === 0 || receipts.length === 0) {
        return { color: 'none', emoji: '⚪', label: tx(lang, { fr: 'Pas de BOM/BR', ar: 'لا توجد BOM/BR', en: 'No BOM/BR' }), details: [] };
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

    if (allCovered) return { color: 'green', emoji: '🟢', label: tx(lang, { fr: 'Stock complet', ar: 'المخزون كامل', en: 'Full stock' }), details };
    if (lotCovered) return { color: 'yellow', emoji: '🟡', label: tx(lang, { fr: 'Lot couvert', ar: 'الدفعة مغطاة', en: 'Lot covered' }), details };
    return { color: 'red', emoji: '🔴', label: tx(lang, { fr: 'Rupture stock', ar: 'نفاد المخزون', en: 'Stockout' }), details };
}

interface Args {
    lang: string;
    planningEvents: PlanningEvent[];
    models: ModelData[];
    machines: Machine[];
    settings: AppSettings;
    chains?: PlanningChain[];
}

export function usePlanningValidation({ lang, planningEvents, models, machines, settings, chains }: Args): Issue[] {
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

            if (!model) {
                issues.push({
                    id: `${ev.id}-missing-model`,
                    eventId: ev.id,
                    severity: 'error',
                    type: 'machines',
                    title: tx(lang, { fr: 'Modèle introuvable', ar: 'النموذج غير موجود', en: 'Model not found' }),
                    detail: tx(lang, { fr: "Le modèle spécifié pour cet ordre de fabrication n'existe pas dans la bibliothèque.", ar: 'النموذج المحدد لأمر التصنيع هذا غير موجود في المكتبة.', en: "The model specified for this manufacturing order does not exist in the library." }),
                    suggestion: tx(lang, { fr: 'Vérifier si le modèle a été supprimé ou recréer le modèle.', ar: 'تحقق مما إذا كان النموذج قد تم حذفه أو أعد إنشاء النموذج.', en: 'Check if the model was deleted or recreate the model.' }),
                });
                continue;
            }

            // 1. Stock magasin
            const isLocal = model?.ficheData?.typeMarche !== 'Export';
            if (isLocal && (ev.status === 'BLOCKED_STOCK' || ev.materialShortages?.length)) {
                const missing = (ev.materialShortages || []).map(s => `${s.name} (-${s.missing}${s.unit || ''})`).join(', ');
                issues.push({
                    id: `${ev.id}-stock`,
                    eventId: ev.id,
                    severity: 'error',
                    type: 'stock',
                    title: tx(lang, { fr: 'Stock insuffisant', ar: 'مخزون غير كافٍ', en: 'Insufficient stock' }),
                    detail: missing || ev.blockedReason || tx(lang, { fr: 'Matières manquantes', ar: 'مواد ناقصة', en: 'Missing materials' }),
                    suggestion: tx(lang, { fr: 'Vérifier le magasin ou créer un bon de commande', ar: 'تحقق من المخزون أو أنشئ أمر شراء', en: 'Check the store or create a purchase order' }),
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
                        title: tx(lang, { fr: 'Couverture machines incomplète', ar: 'تغطية الآلات غير مكتملة', en: 'Incomplete machine coverage' }),
                        detail: tx(lang, { fr: `Classes manquantes sur ${ev.chaineId} : ${mc.missingClasses.join(', ')}`, ar: `الفئات المفقودة في ${ev.chaineId} : ${mc.missingClasses.join(', ')}`, en: `Missing classes on ${ev.chaineId} : ${mc.missingClasses.join(', ')}` }),
                        suggestion: tx(lang, { fr: 'Affecter les machines à la ligne ou changer de chaîne', ar: 'تعيين الآلات للخط أو تغيير السلسلة', en: 'Assign machines to the line or change the chain' }),
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
                            title: tx(lang, { fr: 'Capacité dépassée', ar: 'السعة تجاوزت الحد', en: 'Capacity exceeded' }),
                            detail: tx(lang, { fr: `Pic ~${Math.round(maxR * 100)} % (${cap} pcs/j) — ${overCount} jour(s) en surcharge`, ar: `الذروة ~${Math.round(maxR * 100)} % (${cap} قطعة/يوم) — ${overCount} يوم في التحميل الزائد`, en: `Peak ~${Math.round(maxR * 100)} % (${cap} pcs/d) — ${overCount} day(s) overloaded` }),
                            suggestion: tx(lang, { fr: 'Réduire la quantité, fractionner, ou changer de chaîne', ar: 'قلل الكمية، قسّم، أو غيّر السلسلة', en: 'Reduce quantity, split, or change the chain' }),
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
                    title: tx(lang, { fr: 'Hors délai', ar: 'متجاوز الموعد النهائي', en: 'Past deadline' }),
                    detail: tx(lang, { fr: 'La fin estimée dépasse le DDS', ar: 'النهاية المقدرة تتجاوز DDS', en: 'Estimated end exceeds DDS' }),
                    suggestion: tx(lang, { fr: 'Avancer la date, accélérer ou prévenir le client', ar: 'قدم التاريخ، سرّع، أو أبلغ العميل', en: 'Advance the date, speed up, or notify the client' }),
                });
            } else if (delay === 'AT_RISK') {
                issues.push({
                    id: `${ev.id}-deadline-risk`,
                    eventId: ev.id,
                    severity: 'warning',
                    type: 'deadline',
                    title: tx(lang, { fr: 'Délai serré', ar: 'موعد ضيق', en: 'Tight deadline' }),
                    detail: tx(lang, { fr: 'La fin est très proche du DDS', ar: 'النهاية قريبة جداً من DDS', en: 'The end is very close to DDS' }),
                });
            }

            // 5. Material Receipt Availability (BR-based 🟢🟡🔴)
            if (model?.ficheData?.materials?.length) {
                const availability = getMaterialAvailability(
                    lang,
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
                        title: tx(lang, { fr: '🔴 Rupture fournitures (BR)', ar: '🔴 نقص التجهيزات (BR)', en: '🔴 Supply shortage (BR)' }),
                        detail: tx(lang, { fr: `Réceptions insuffisantes : ${uncovered}`, ar: `استلام غير كافٍ : ${uncovered}`, en: `Insufficient receipts : ${uncovered}` }),
                        suggestion: tx(lang, { fr: 'Relancer le fournisseur ou le client Export — [PAUSE / BLOCKED - FURNITURE]', ar: 'تواصل مع المورد أو عميل Export — [PAUSE / BLOCKED - FURNITURE]', en: 'Contact the supplier or Export client — [PAUSE / BLOCKED - FURNITURE]' }),
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
                        title: tx(lang, { fr: '🟡 Stock partiel (Lot couvert)', ar: '🟡 مخزون جزئي (الدفعة مغطاة)', en: '🟡 Partial stock (Lot covered)' }),
                        detail: tx(lang, { fr: `Seul le lot actif est couvert. Manque pour total : ${partial}`, ar: `فقط الدفعة النشطة مغطاة. النقص للكل : ${partial}`, en: `Only the active lot is covered. Missing for total : ${partial}` }),
                        suggestion: tx(lang, { fr: 'Planifier la réception suivante avant fin du lot actuel', ar: 'خطط للاستلام التالي قبل نهاية الدفعة الحالية', en: 'Plan the next receipt before the end of the current lot' }),
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
    lang: string,
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
                title: tx(lang, { fr: 'Couverture machines incomplète', ar: 'تغطية الآلات غير مكتملة', en: 'Incomplete machine coverage' }),
                detail: tx(lang, { fr: `Classes manquantes sur ${draft.chaineId} : ${mc.missingClasses.join(', ')}`, ar: `الفئات المفقودة في ${draft.chaineId} : ${mc.missingClasses.join(', ')}`, en: `Missing classes on ${draft.chaineId} : ${mc.missingClasses.join(', ')}` }),
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
            title: tx(lang, { fr: 'Capacité dépassée', ar: 'السعة تجاوزت الحد', en: 'Capacity exceeded' }),
            detail: tx(lang, { fr: `Pic ~${Math.round(maxR * 100)} % (${cap} pcs/j)`, ar: `الذروة ~${Math.round(maxR * 100)} % (${cap} قطعة/يوم)`, en: `Peak ~${Math.round(maxR * 100)} % (${cap} pcs/d)` }),
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
                title: tx(lang, { fr: 'Hors délai', ar: 'متجاوز الموعد النهائي', en: 'Past deadline' }),
                detail: tx(lang, { fr: `Fin estimée ${endYmd} > DDS ${dds}${model?.ficheData?.typeMarche === 'Export' ? ' (Ajusté Export -3j)' : ''}`, ar: `النهاية المقدرة ${endYmd} > DDS ${dds}${model?.ficheData?.typeMarche === 'Export' ? ' (تعديل Export -3j)' : ''}`, en: `Estimated end ${endYmd} > DDS ${dds}${model?.ficheData?.typeMarche === 'Export' ? ' (Export adjusted -3d)' : ''}` }),
            });
        }
    }

    return issues;
}
