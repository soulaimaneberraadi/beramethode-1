import { calculerHeures, type HeuresResult } from '../lib/calculerHeuresPointage';
import { getSageTimesForHeuresCalc } from '../lib/sageTimeRules';
import { getSageRulesForUser } from './sageConfig';

export type { HeuresResult } from '../lib/calculerHeuresPointage';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Brut (MAD) = HN×TH + HS25×1,25 + HS50×1,5 + primes fixes. */
export function sageGrossMAD(
    agg: HeuresResult,
    w: { taux_horaire: number; prime_assiduite: number; prime_transport: number },
): number {
    const th = Number(w.taux_horaire) || 0;
    return (
        agg.normales * th +
        agg.supp25 * th * 1.25 +
        agg.supp50 * th * 1.5 +
        (Number(w.prime_assiduite) || 0) +
        (Number(w.prime_transport) || 0)
    );
}

export function heuresSagePourLigne(
    ownerId: number,
    row: {
        heure_entree: string | null;
        heure_sortie: string | null;
        pause_debut?: string | null;
        pause_fin?: string | null;
        date: string;
        statut?: string | null;
        heures_normales?: number | null;
        heures_supp_25?: number | null;
        heures_supp_50?: number | null;
        heures_travaillees?: number | null;
    },
): HeuresResult {
    if (row.statut && row.statut !== 'PRESENT') {
        return { normales: 0, supp25: 0, supp50: 0, travaillees: 0 };
    }
    if (!row.heure_entree || !row.heure_sortie) {
        return {
            normales: r2(Number(row.heures_normales) || 0),
            supp25: r2(Number(row.heures_supp_25) || 0),
            supp50: r2(Number(row.heures_supp_50) || 0),
            travaillees: r2(Number(row.heures_travaillees) || 0),
        };
    }
    const rules = getSageRulesForUser(ownerId);
    const t = getSageTimesForHeuresCalc(
        row.heure_entree,
        row.heure_sortie,
        row.pause_debut ?? null,
        row.pause_fin ?? null,
        rules,
    );
    return calculerHeures(t.entree, t.sortie, t.pauseDebut, t.pauseFin, row.date);
}

export function heuresSageAgrumules(
    ownerId: number,
    pointages: Array<{
        heure_entree: string | null;
        heure_sortie: string | null;
        pause_debut?: string | null;
        pause_fin?: string | null;
        date: string;
        statut?: string | null;
        heures_normales?: number | null;
        heures_supp_25?: number | null;
        heures_supp_50?: number | null;
        heures_travaillees?: number | null;
    }>,
) {
    let normales = 0;
    let supp25 = 0;
    let supp50 = 0;
    let travaillees = 0;
    for (const p of pointages) {
        const h = heuresSagePourLigne(ownerId, p);
        normales += h.normales;
        supp25 += h.supp25;
        supp50 += h.supp50;
        travaillees += h.travaillees;
    }
    return { normales: r2(normales), supp25: r2(supp25), supp50: r2(supp50), travaillees: r2(travaillees) };
}
