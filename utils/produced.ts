import type { SuiviData } from '../types';

/** Pièces déclarées (sorties horaires) pour un OF, toutes lignes Suivi confondues. */
export function sumPiecesFromSuiviForPlanning(planningId: string, suivis: SuiviData[]): number {
    return suivis
        .filter(s => s.planningId === planningId)
        .reduce((acc, s) => {
            const row = Object.values(s.sorties || {}).reduce<number>((a, v) => a + (Number(v) || 0), 0);
            return acc + row;
        }, 0);
}
