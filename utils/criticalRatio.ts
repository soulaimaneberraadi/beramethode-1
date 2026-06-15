import type { AppSettings, PlanningEvent, ModelData } from '../types';
import { isPlanningWorkingDay, parsePlanningDateAtNoon, getWorkMinutesPerDay, planningLocalDateKey } from './planning';

// ═══════════════════════════════════════════════════════════════════
// 🚦 Critical Ratio (CR) — محرك الأولوية والترتيب
//
// CR = الوقت المتبقي / وقت الإنتاج المطلوب
//
//   CR < 0.8  → 🔴 CRITICAL  — خطر حرج، أولوية قصوى
//   CR < 1.0  → 🟠 AT_RISK   — خطر، قد يتأخر
//   CR < 1.3  → 🟢 ON_TRACK  — في الوقت
//   CR ≥ 1.3  → 🔵 AHEAD    — متقدم
// ═══════════════════════════════════════════════════════════════════

export type CRStatus = 'CRITICAL' | 'AT_RISK' | 'ON_TRACK' | 'AHEAD';

export interface CriticalRatioResult {
    /** Valeur du Critical Ratio */
    cr: number;
    /** Statut coloré (rouge / orange / vert / bleu) */
    status: CRStatus;
    /** Jours ouvrés restants jusqu'au DDS */
    daysRemaining: number;
    /** Jours ouvrés nécessaires pour finir la quantité restante */
    daysNeeded: number;
    /** Pièces en retard (0 si on track) */
    deficit: number;
    /** Quantité restante à produire */
    remainingQty: number;
    /** Capacité journalière utilisée pour le calcul (pcs/jour) */
    dailyCapacity: number;
}

export interface PlanningEventWithCR extends PlanningEvent {
    crResult: CriticalRatioResult;
}

/**
 * Compte les jours ouvrés entre deux dates (from exclusif, to inclusif).
 * Retourne 0 si from ≥ to.
 */
export function countWorkingDaysBetween(
    fromYmd: string,
    toYmd: string,
    settings: AppSettings
): number {
    const from = parsePlanningDateAtNoon(fromYmd);
    const to = parsePlanningDateAtNoon(toYmd);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) return 0;
    if (from.getTime() >= to.getTime()) return 0;

    let count = 0;
    const d = new Date(from);
    d.setDate(d.getDate() + 1); // from exclusif

    let safety = 0;
    while (d.getTime() <= to.getTime() && safety < 10000) {
        safety++;
        if (isPlanningWorkingDay(d, settings)) count++;
        d.setDate(d.getDate() + 1);
    }

    return count;
}

/**
 * Calcule le Critical Ratio pour un OF.
 * 
 * CR = jours_restants / jours_nécessaires
 * 
 * @param todayYmd — Date du jour (YYYY-MM-DD)
 * @param ddsYmd — Date de sortie / deadline (YYYY-MM-DD)
 * @param qteTotal — Quantité totale de la commande
 * @param qteProduite — Quantité déjà produite
 * @param samMinutes — SAM par pièce (minutes)
 * @param operators — Nombre d'opérateurs sur la chaîne
 * @param workMinutesPerDay — Minutes nettes de travail / jour
 * @param efficiency — Rendement chaîne (0.4–1.2)
 * @param activityRate — Coefficient Q (0.5–1.0)
 */
export function computeCriticalRatio(
    todayYmd: string,
    ddsYmd: string,
    qteTotal: number,
    qteProduite: number,
    samMinutes: number,
    operators: number,
    workMinutesPerDay: number,
    efficiency: number,
    activityRate: number,
    settings: AppSettings
): CriticalRatioResult {
    const remainingQty = Math.max(0, qteTotal - (qteProduite || 0));

    // Si terminé
    if (remainingQty === 0) {
        return {
            cr: 999, status: 'AHEAD', daysRemaining: 0,
            daysNeeded: 0, deficit: 0, remainingQty: 0, dailyCapacity: 0,
        };
    }

    const daysRemaining = countWorkingDaysBetween(todayYmd, ddsYmd, settings);

    // Capacité journalière = (opérateurs × minutes × efficacité × Q) / SAM
    const dailyCapacity = samMinutes > 0
        ? (operators * workMinutesPerDay * efficiency * activityRate) / samMinutes
        : 1;

    const effectiveDailyCap = Math.max(1, dailyCapacity);
    const daysNeeded = Math.ceil(remainingQty / effectiveDailyCap);

    // CR
    let cr: number;
    if (daysRemaining <= 0) {
        cr = 0; // Deadline dépassée
    } else {
        cr = daysRemaining / Math.max(1, daysNeeded);
    }

    // Statut
    let status: CRStatus;
    if (cr < 0.8) status = 'CRITICAL';
    else if (cr < 1.0) status = 'AT_RISK';
    else if (cr < 1.3) status = 'ON_TRACK';
    else status = 'AHEAD';

    // Déficit en pièces
    const deficit = daysNeeded > daysRemaining
        ? Math.ceil((daysNeeded - daysRemaining) * effectiveDailyCap)
        : 0;

    return {
        cr: Math.round(cr * 100) / 100,
        status,
        daysRemaining,
        daysNeeded,
        deficit,
        remainingQty,
        dailyCapacity: Math.round(effectiveDailyCap),
    };
}

/**
 * Calcule le CR pour un ensemble d'OFs.
 * 
 * Cherche le SAM du modèle, les opérateurs et l'efficacité de la chaîne,
 * puis calcule le CR de chaque OF.
 */
export function computeBatchCR(
    events: PlanningEvent[],
    models: ModelData[],
    chainOperatorsMap: Record<string, number>,
    chainEfficiencyMap: Record<string, number>,
    chainActivityRates: Record<string, number>,
    settings: AppSettings
): PlanningEventWithCR[] {
    const todayYmd = planningLocalDateKey(new Date());
    const workMin = getWorkMinutesPerDay(settings);
    const modelsMap = new Map(models.map(m => [m.id, m]));

    return events.map(ev => {
        // Chercher le SAM du modèle
        const model = modelsMap.get(ev.modelId);
        const sam = model?.meta_data?.total_temps || 15;

        // Paramètres chaîne
        const operators = chainOperatorsMap[ev.chaineId] ?? 30;
        const efficiency = chainEfficiencyMap[ev.chaineId] ?? 0.85;
        const q = ev.activityRateOverride ?? chainActivityRates[ev.chaineId] ?? 0.85;

        // DDS
        const dds = ev.strictDeadline_DDS || ev.dateExport;

        const crResult = computeCriticalRatio(
            todayYmd, dds, ev.qteTotal, ev.qteProduite ?? 0,
            sam, operators, workMin, efficiency, q, settings
        );

        return { ...ev, crResult };
    });
}

/**
 * Trie les OFs par priorité : CR ascendant (le plus critique en premier).
 * Exclut les OFs terminés (DONE).
 */
export function prioritizeByPriority(
    events: PlanningEventWithCR[]
): PlanningEventWithCR[] {
    return events
        .filter(ev => ev.status !== 'DONE')
        .sort((a, b) => {
            // CR ascendant (plus petit = plus urgent)
            const crDiff = a.crResult.cr - b.crResult.cr;
            if (Math.abs(crDiff) > 0.01) return crDiff;
            // À CR égal, DDS le plus proche en premier
            const ddsA = a.strictDeadline_DDS || a.dateExport || '';
            const ddsB = b.strictDeadline_DDS || b.dateExport || '';
            return ddsA.localeCompare(ddsB);
        });
}

/**
 * Regroupement familial : groupe les OFs du même modèle sur la même chaîne.
 * 
 * Si deux expéditions du même modèle sont séparées par ≤ maxGapDays jours
 * sur la même chaîne, on les regroupe pour éviter le temps de changement.
 * 
 * ⚠️ Les OFs CRITICAL (CR < 0.8) ne sont jamais déplacés.
 */
export function applyFamilyGrouping(
    events: PlanningEventWithCR[],
    maxGapDays: number = 3
): PlanningEventWithCR[] {
    const result = [...events];

    // Identifier les groupes par (modelId, chaineId)
    const groups = new Map<string, number[]>();
    result.forEach((ev, idx) => {
        const key = `${ev.modelId}__${ev.chaineId}`;
        const arr = groups.get(key) || [];
        arr.push(idx);
        groups.set(key, arr);
    });

    // Pour chaque groupe de ≥2 OFs du même modèle/chaîne
    for (const [, indices] of groups) {
        if (indices.length < 2) continue;

        // Vérifier si les OFs sont proches dans la timeline
        const sorted = indices.sort((a, b) => {
            const dateA = result[a].dateLancement || '';
            const dateB = result[b].dateLancement || '';
            return dateA.localeCompare(dateB);
        });

        // Vérifier que les OFs ne sont pas trop éloignés
        for (let i = 0; i < sorted.length - 1; i++) {
            const evA = result[sorted[i]];
            const evB = result[sorted[i + 1]];

            // Ne pas déplacer les CRITICAL
            if (evA.crResult.status === 'CRITICAL' || evB.crResult.status === 'CRITICAL') continue;

            const endA = evA.estimatedEndDate || evA.dateExport || '';
            const startB = evB.dateLancement || '';

            if (!endA || !startB) continue;

            const diffMs = parsePlanningDateAtNoon(startB).getTime() - parsePlanningDateAtNoon(endA).getTime();
            const diffDays = Math.round(diffMs / 86400000);

            if (diffDays >= 0 && diffDays <= maxGapDays) {
                // Marquer comme groupe familial (même ordre dans le résultat)
                (evA as any)._familyGroupId = `${evA.modelId}__${evA.chaineId}`;
                (evB as any)._familyGroupId = `${evA.modelId}__${evA.chaineId}`;
            }
        }
    }

    return result;
}

/**
 * Classe CSS Tailwind pour la couleur du badge CR.
 */
export function crStatusColor(status: CRStatus): string {
    switch (status) {
        case 'CRITICAL': return 'bg-red-500 text-white';
        case 'AT_RISK': return 'bg-orange-500 text-white';
        case 'ON_TRACK': return 'bg-emerald-500 text-white';
        case 'AHEAD': return 'bg-blue-400 text-white';
    }
}

/**
 * Classe CSS pour la barre Gantt selon le CR.
 */
export function crGanttBarColor(cr: number, status: string): string {
    if (status === 'DONE') return 'bg-slate-400';
    if (status === 'BLOCKED_STOCK') return 'bg-amber-500';
    if (cr < 0.8) return 'bg-red-500 animate-pulse';
    if (cr < 1.0) return 'bg-orange-500';
    if (cr < 1.3) return 'bg-emerald-500';
    return 'bg-blue-400';
}
