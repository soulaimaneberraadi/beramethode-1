// ═══════════════════════════════════════════════════════════════════
// 📊 Taux d'activité Q (Activity Rate) — Work Sampling
//
// Le coefficient Q représente la proportion du temps effectivement
// productif par rapport au temps de présence. Issu d'études
// d'observation instantanée (Momentanaufnahme / Work Sampling).
// ═══════════════════════════════════════════════════════════════════

/** Taux d'activité par défaut (85%) — standard AJANIF textile. */
export const DEFAULT_ACTIVITY_RATE = 0.85;

/** Échantillon d'observation instantanée (Work Sampling). */
export interface ActivitySample {
    date: string;
    chainId: string;
    /** Nombre total d'observations effectuées */
    totalObservations: number;
    /** Nombre d'observations où l'opérateur était en activité productive */
    activeObservations: number;
}

/**
 * Calcule le taux d'activité Q à partir d'un ensemble d'échantillons.
 * 
 * Q = Σ(observations actives) / Σ(observations totales)
 * 
 * Borné à [0.50, 1.00] — en dessous de 50% le résultat n'est pas fiable.
 * Retourne DEFAULT_ACTIVITY_RATE (0.85) si aucun échantillon.
 * 
 * @param samples — Tableau d'échantillons d'observation
 * @returns Taux Q ∈ [0.50, 1.00]
 */
export function computeActivityRate(samples: ActivitySample[]): number {
    if (!samples.length) return DEFAULT_ACTIVITY_RATE;

    let totalObs = 0;
    let activeObs = 0;
    for (const s of samples) {
        if (s.totalObservations > 0) {
            totalObs += s.totalObservations;
            activeObs += Math.min(s.activeObservations, s.totalObservations);
        }
    }

    if (totalObs === 0) return DEFAULT_ACTIVITY_RATE;

    const raw = activeObs / totalObs;
    return Math.max(0.50, Math.min(1.00, raw));
}

/**
 * Estime le taux Q à partir des données de suivi de production.
 * 
 * Formule inverse :
 *   Produced × SAM = Operators × WorkMinutes × Efficiency × Q
 *   Q ≈ (Produced × SAM) / (Operators × WorkMinutes)
 * 
 * Note: Ce Q estimé combine efficacité et activité — à utiliser
 * comme approximation quand aucune étude Work Sampling n'existe.
 * 
 * @param totalProduced — Pièces produites
 * @param samMinutes — SAM en minutes par pièce
 * @param operators — Nombre d'opérateurs
 * @param workMinutes — Minutes de travail net dans la période
 * @returns Q estimé ∈ [0.50, 1.00]
 */
export function estimateQFromSuivi(
    totalProduced: number,
    samMinutes: number,
    operators: number,
    workMinutes: number
): number {
    if (operators <= 0 || workMinutes <= 0 || samMinutes <= 0) return DEFAULT_ACTIVITY_RATE;

    const raw = (totalProduced * samMinutes) / (operators * workMinutes);
    return Math.max(0.50, Math.min(1.00, raw));
}

/**
 * Récupère le taux Q pour une chaîne, avec fallback sur la valeur par défaut.
 * 
 * @param chainId — Identifiant de la chaîne (ex: "CHAINE 1")
 * @param chainActivityRates — Map chainId → Q (optionnel)
 * @returns Q ∈ [0.50, 1.00]
 */
export function getChainActivityRate(
    chainId: string,
    chainActivityRates?: Record<string, number>
): number {
    const v = chainActivityRates?.[chainId];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        return Math.max(0.50, Math.min(1.00, v));
    }
    return DEFAULT_ACTIVITY_RATE;
}
