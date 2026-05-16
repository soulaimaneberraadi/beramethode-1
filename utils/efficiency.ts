import type { AppSettings, ModelData, PlanningEvent, SuiviData } from '../types';
import { getWorkMinutesPerDay } from './planning';

function sumHourlyPieces(s: SuiviData): number {
    return Object.values(s.sorties || {}).reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
}

/**
 * Efficacité chaîne sur fenêtre glissante (même esprit que RendementBoard, minutes alignées `getWorkMinutesPerDay`).
 */
export function computeChainEfficiency(
    suivis: SuiviData[],
    events: PlanningEvent[],
    models: ModelData[],
    chainId: string,
    settings: AppSettings,
    windowDays: number = 14
): { eff: number; n: number } {
    const cutoff = Date.now() - windowDays * 86400000;
    const relevantSuivis = suivis.filter(s => {
        const ev = events.find(e => e.id === s.planningId);
        if (!ev || ev.chaineId !== chainId) return false;
        const t = new Date(s.date).getTime();
        return t >= cutoff;
    });

    const minutesPerWorkerDay = getWorkMinutesPerDay(settings);

    let totalProducedMin = 0;
    let totalPresenceMin = 0;
    for (const s of relevantSuivis) {
        const ev = events.find(e => e.id === s.planningId);
        const m = models.find(mm => mm.id === ev?.modelId);
        const sam = m?.meta_data?.total_temps || 15;
        const produced = sumHourlyPieces(s);
        totalProducedMin += produced * sam;
        totalPresenceMin += (s.totalWorkers || 0) * minutesPerWorkerDay;
    }

    const raw = totalPresenceMin > 0 ? totalProducedMin / totalPresenceMin : 0.85;
    const eff = Math.max(0.4, Math.min(1.2, raw));
    return { eff, n: relevantSuivis.length };
}
