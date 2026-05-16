import type { PlanningEvent } from '../types';
import { parsePlanningDateAtNoon, planningLocalDateKey } from './planning';

/** Capacité journalière (pcs/j) pour une chaîne, depuis les réglages ou défaut. */
export function getChainDailyCapacity(
    chainCapacityPerDay: Record<string, number> | undefined,
    chainId: string,
    fallback = 1000
): number {
    const v = chainCapacityPerDay?.[chainId];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Charge relative (0+) : somme des OF actifs ce jour / capacité journalière. */
export function dayLoadRatio(
    dateKeyYmd: string,
    events: PlanningEvent[],
    chainId: string,
    capacityPerDay: number
): number {
    if (capacityPerDay <= 0) return 0;
    const d = parsePlanningDateAtNoon(dateKeyYmd).getTime();
    if (Number.isNaN(d)) return 0;
    let planned = 0;
    for (const ev of events) {
        if (ev.chaineId !== chainId) continue;
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
    let max = 0;
    for (let t = t0; t <= t1; t += 86400000) {
        const key = planningLocalDateKey(new Date(t));
        max = Math.max(max, dayLoadRatio(key, events, chainId, capacityPerDay));
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
    const out: { dateKey: string; ratio: number }[] = [];
    for (let t = t0; t <= t1; t += 86400000) {
        const key = planningLocalDateKey(new Date(t));
        const r = dayLoadRatio(key, events, chainId, capacityPerDay);
        if (r > 1.0001) out.push({ dateKey: key, ratio: r });
    }
    out.sort((a, b) => b.ratio - a.ratio);
    return out.slice(0, limit);
}
