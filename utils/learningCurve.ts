import type { AppSettings } from '../types';
import { parsePlanningDateAtNoon, planningLocalDateKey, isPlanningWorkingDay } from './planning';

// ═══════════════════════════════════════════════════════════════════
// 📈 Courbe d'apprentissage (Learning Curve) — Facteur Lc
// 
// Modélise la montée en cadence des opérateurs lors du lancement
// d'un nouveau modèle. Standards industriels textile marocain.
// ═══════════════════════════════════════════════════════════════════

/** Profil de courbe d'apprentissage personnalisable. */
export interface LearningCurveProfile {
    id: string;
    name: string;
    day1: number;     // ex: 0.55
    day2: number;     // ex: 0.75
    day3: number;     // ex: 0.90
    day4: number;     // ex: 0.95
    day5Plus: number; // ex: 1.00
}

/**
 * Courbe d'apprentissage standard textile.
 * 
 * Jour 1 → 55% de la capacité nominale (les ouvrières découvrent le modèle)
 * Jour 2 → 75% (maîtrise partielle, les gestes se stabilisent)
 * Jour 3 → 90% (cadence proche du nominal)
 * Jour 4 → 95% (ajustements fins)
 * Jour 5+ → 100% (pleine cadence)
 */
export const DEFAULT_LEARNING_CURVE: Record<number, number> = {
    1: 0.55,
    2: 0.75,
    3: 0.90,
    4: 0.95,
};

/** Profil standard par défaut. */
export const DEFAULT_PROFILE: LearningCurveProfile = {
    id: 'standard-textile',
    name: 'Standard Textile',
    day1: 0.55,
    day2: 0.75,
    day3: 0.90,
    day4: 0.95,
    day5Plus: 1.00,
};

/** Convertit un profil en dictionnaire jour → facteur. */
export function profileToCurve(profile: LearningCurveProfile): Record<number, number> {
    return {
        1: profile.day1,
        2: profile.day2,
        3: profile.day3,
        4: profile.day4,
    };
}

/**
 * Facteur Lc pour un jour donné de production du modèle.
 * 
 * @param dayNumber — Numéro du jour ouvré (1 = premier jour du modèle)
 * @param customCurve — Courbe personnalisée (optionnel, sinon standard)
 * @returns Facteur 0.0 – 1.0 (ex: 0.55 pour le jour 1)
 */
export function getLearningFactor(
    dayNumber: number,
    customCurve?: Record<number, number>
): number {
    if (dayNumber <= 0) return 0;
    if (dayNumber >= 5) return 1.0;
    const curve = customCurve || DEFAULT_LEARNING_CURVE;
    return curve[dayNumber] ?? 1.0;
}

/**
 * Calcule le numéro du jour ouvré dans le modèle en cours.
 * 
 * Jour 1 = dateLancement (si c'est un jour ouvré).
 * Les jours non-ouvrés (weekends, fériés) ne comptent pas.
 * 
 * @param currentDateYmd — Date courante (YYYY-MM-DD)
 * @param launchDateYmd — Date de lancement du modèle (YYYY-MM-DD)
 * @param settings — Paramètres de l'application (calendrier)
 * @returns Numéro du jour ouvré (1-indexé), 0 si avant le lancement
 */
export function getModelDayNumber(
    currentDateYmd: string,
    launchDateYmd: string,
    settings: AppSettings
): number {
    const current = parsePlanningDateAtNoon(currentDateYmd);
    const launch = parsePlanningDateAtNoon(launchDateYmd);

    if (isNaN(current.getTime()) || isNaN(launch.getTime())) return 1;
    if (current.getTime() < launch.getTime()) return 0;

    let count = 0;
    const d = new Date(launch);
    while (d.getTime() <= current.getTime()) {
        if (isPlanningWorkingDay(d, settings)) {
            count++;
        }
        d.setDate(d.getDate() + 1);
    }

    return Math.max(1, count);
}

/**
 * Ajuste la capacité de base avec le facteur d'apprentissage.
 * 
 * @param baseCapacity — Capacité nominale (pièces/jour)
 * @param dayNumber — Numéro du jour ouvré dans le modèle
 * @param customCurve — Courbe personnalisée (optionnel)
 * @returns Capacité ajustée (arrondie à l'entier inférieur)
 */
export function adjustCapacityForLearning(
    baseCapacity: number,
    dayNumber: number,
    customCurve?: Record<number, number>
): number {
    return Math.floor(baseCapacity * getLearningFactor(dayNumber, customCurve));
}
