import type { AppSettings, ModelData, PlanningEvent, SuiviData, EffectifRoleTagKey } from '../types';
import { getWorkMinutesPerDay } from './planning';

const EFFECTIF_ROLE_KEYS: EffectifRoleTagKey[] = ['chaf', 'recta', 'sujet', 'transp', 'man', 'sp', 'stager'];

function sumHourlyPieces(s: SuiviData): number {
    return Object.values(s.sorties || {}).reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
}

/**
 * Efficacité d'une ligne de suivi (M.R journalier).
 * Formule: (pièces_valides × temps_base × 1.15) / (ouvriers × heures_actives × 60) × 100
 */
export function calcSuiviEfficiency(s: SuiviData, baseTime: number, hourKeys: string[]): number {
    if (!s.totalHeure || baseTime === 0) return 0;
    const workers = EFFECTIF_ROLE_KEYS.reduce((a, k) => a + (Number(s[k]) || 0), 0) || s.totalWorkers || 0;
    if (!workers) return 0;
    const active = hourKeys.filter(k => (s.sorties[k] ?? -1) >= 0).length;
    if (!active) return 0;
    const defauts = s.defauts?.reduce((a, d) => a + d.quantity, 0) || 0;
    const validProd = Math.max(0, s.totalHeure - defauts);
    return Math.round((validProd * baseTime * 1.15) / (workers * active * 60) * 100);
}

/**
 * Efficacité moyenne d'un modèle sur plusieurs jours (M.R moyen).
 */
export function calcModelEfficiency(events: SuiviData[], baseTime: number, hourKeys: string[]): number {
    let earned = 0, presence = 0;
    events.forEach(s => {
        const workers = EFFECTIF_ROLE_KEYS.reduce((a, k) => a + (Number(s[k]) || 0), 0) || s.totalWorkers || 0;
        const active = hourKeys.filter(k => (s.sorties[k] ?? -1) >= 0).length;
        const defauts = s.defauts?.reduce((a, d) => a + d.quantity, 0) || 0;
        earned += Math.max(0, s.totalHeure - defauts) * baseTime * 1.15;
        presence += workers * active * 60;
    });
    return presence > 0 && baseTime > 0 ? Math.round((earned / presence) * 100) : 0;
}

/**
 * Couleur de fond pour l'affichage du M.R.
 * Seuils: ≥95% vert, ≥85% bleu, <85% rouge (standards textile)
 */
export function mrBg(mr: number): string {
    if (mr === 0) return 'text-slate-400';
    if (mr >= 95) return 'text-emerald-700 bg-emerald-50';
    if (mr >= 85) return 'text-blue-700 bg-blue-50';
    return 'text-rose-700 bg-rose-50';
}

/**
 * Couleur de fond compacte (pour badges).
 */
export function mrBadgeBg(mr: number): string {
    if (mr === 0) return 'bg-slate-300';
    if (mr >= 95) return 'bg-emerald-500';
    if (mr >= 85) return 'bg-blue-500';
    return 'bg-rose-500';
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

    const raw = totalPresenceMin > 0 ? totalProducedMin / totalPresenceMin : 0;
    const eff = relevantSuivis.length > 0 ? Math.max(0.4, Math.min(1.2, raw)) : 0;
    return { eff, n: relevantSuivis.length };
}
