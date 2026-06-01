import type { PlanningEvent, AppSettings } from '../types';
import { parsePlanningDateAtNoon, planningLocalDateKey, getWorkMinutesPerDay } from './planning';

/** Capacité journalière (pcs/j) pour une chaîne, depuis les réglages ou défaut. */
export function getChainDailyCapacity(
    chainCapacityPerDay: Record<string, number> | undefined,
    chainId: string,
    fallback = 1000
): number {
    const v = chainCapacityPerDay?.[chainId];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Capacité dynamique : Opérateurs × Minutes × η × Q × Lc / SAM.
 * 
 * Formule industrielle complète :
 *   Cap = (Operators × WorkMinutes × Efficiency × ActivityRate × LearningFactor) / SAM
 * 
 * @param operators — Nombre d'opérateurs sur la ligne
 * @param workMinutesPerDay — Minutes nettes de travail par jour (pauses déduites)
 * @param efficiency — Rendement de la chaîne (0.40 – 1.20)
 * @param samMinutes — SAM en minutes par pièce (Standard Allowed Minutes)
 * @param activityRate — Coefficient Q d'activité (0.50 – 1.00, défaut 0.85)
 * @param learningFactor — Facteur Lc de courbe d'apprentissage (0.55 – 1.00)
 * @returns Nombre de pièces/jour (arrondi à l'entier inférieur)
 */
export function computeDynamicCapacity(
    operators: number,
    workMinutesPerDay: number,
    efficiency: number,
    samMinutes: number,
    activityRate: number = 0.85,
    learningFactor: number = 1.0
): number {
    if (samMinutes <= 0 || operators <= 0) return 0;
    return Math.floor(
        (operators * workMinutesPerDay * efficiency * activityRate * learningFactor) / samMinutes
    );
}

/**
 * Capacité effective : choisit entre mode STATIC et DYNAMIC.
 * 
 * En mode STATIC : utilise `chainCapacityPerDay[chainId]` (valeur fixe).
 * En mode DYNAMIC : calcule Operators × Minutes × η × Q × Lc / SAM.
 * 
 * @param settings — Paramètres application
 * @param chainId — Identifiant chaîne
 * @param samMinutes — SAM du modèle en cours (requis pour DYNAMIC)
 * @param chainEfficiency — Efficacité de la chaîne (0.40–1.20)
 * @param activityRate — Taux Q (0.50–1.00, défaut 0.85)
 * @param learningFactor — Facteur Lc (0.55–1.00, défaut 1.0)
 * @returns Capacité en pièces/jour
 */
export function getEffectiveCapacity(
    settings: AppSettings,
    chainId: string,
    samMinutes: number,
    chainEfficiency: number = 0.85,
    activityRate: number = 0.85,
    learningFactor: number = 1.0
): number {
    if (settings.capacityMode === 'DYNAMIC') {
        const operators = settings.chainOperators?.[chainId] ?? 30;
        const workMin = getWorkMinutesPerDay(settings);
        return computeDynamicCapacity(operators, workMin, chainEfficiency, samMinutes, activityRate, learningFactor);
    }
    // Mode STATIC (défaut) — valeur fixe depuis les paramètres
    return getChainDailyCapacity(settings.chainCapacityPerDay, chainId);
}

/** Charge relative (0+) : somme des OF actifs ce jour / capacité journalière. */
export function dayLoadRatio(
    dateKeyYmd: string,
    events: PlanningEvent[],
    chainId: string,
    capacityPerDay: number,
    preFilteredEvents?: PlanningEvent[]
): number {
    if (capacityPerDay <= 0) return 0;
    const d = parsePlanningDateAtNoon(dateKeyYmd).getTime();
    if (Number.isNaN(d)) return 0;
    const chainEvents = preFilteredEvents ?? events.filter(e => e.chaineId === chainId);
    let planned = 0;
    for (const ev of chainEvents) {
        const startRaw = (ev.startDate || ev.dateLancement || '').split('T')[0];
        const endRaw = (ev.estimatedEndDate || ev.dateExport || ev.strictDeadline_DDS || '').split('T')[0];
        if (!startRaw || !endRaw) continue;
        const start = parsePlanningDateAtNoon(startRaw).getTime();
        const end = parsePlanningDateAtNoon(endRaw).getTime();
        if (Number.isNaN(start) || Number.isNaN(end)) continue;
        if (d < start || d > end) continue;
        const spanDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
        const qty = ev.qteTotal || ev.totalQuantity || 0;
        planned += qty / spanDays;
    }
    return planned / capacityPerDay;
}

/** Pic de charge relative sur la plage [startYmd, endYmd] (inclus), pour une chaîne donnée. */
export function maxDayLoadRatioInSpan(
    events: PlanningEvent[],
    chainId: string,
    capacityPerDay: number,
    spanStartYmd: string,
    spanEndYmd: string
): number {
    const t0 = parsePlanningDateAtNoon(spanStartYmd).getTime();
    const t1 = parsePlanningDateAtNoon(spanEndYmd).getTime();
    if (Number.isNaN(t0) || Number.isNaN(t1)) return 0;
    const chainEvents = events.filter(e => e.chaineId === chainId);
    let max = 0;
    for (let t = t0; t <= t1; t += 86400000) {
        const key = planningLocalDateKey(new Date(t));
        max = Math.max(max, dayLoadRatio(key, events, chainId, capacityPerDay, chainEvents));
    }
    return max;
}

/** Jours du créneau où la charge dépasse 100 % (tri ratio décroissant, tronqué à `limit`). */
export function overloadDaysInSpan(
    events: PlanningEvent[],
    chainId: string,
    capacityPerDay: number,
    spanStartYmd: string,
    spanEndYmd: string,
    limit = 12
): { dateKey: string; ratio: number }[] {
    const t0 = parsePlanningDateAtNoon(spanStartYmd).getTime();
    const t1 = parsePlanningDateAtNoon(spanEndYmd).getTime();
    if (Number.isNaN(t0) || Number.isNaN(t1) || capacityPerDay <= 0) return [];
    const chainEvents = events.filter(e => e.chaineId === chainId);
    const out: { dateKey: string; ratio: number }[] = [];
    for (let t = t0; t <= t1; t += 86400000) {
        const key = planningLocalDateKey(new Date(t));
        const r = dayLoadRatio(key, events, chainId, capacityPerDay, chainEvents);
        if (r > 1.0001) out.push({ dateKey: key, ratio: r });
    }
    out.sort((a, b) => b.ratio - a.ratio);
    return out.slice(0, limit);
}
