import type { AppSettings } from '../../../types';
import { creneauxDuJour } from '../../../lib/horaires';

/**
 * Dérive la grille horaire à partir des settings.
 * Saute les heures dont la pause occupe ≥ 30 min.
 *
 * Passe désormais par `lib/horaires.ts` (source unique de vérité) : si un
 * jour est fourni, l'exception de CE jour (ex. vendredi) est appliquée ;
 * sinon on retombe sur le réglage global, comme avant.
 */
export function deriveHourGrid(settings: AppSettings, dateOrDay?: Date | number): { hours: string[]; keys: string[] } {
    const creneaux = creneauxDuJour(settings, dateOrDay);

    const hours = creneaux.map(c => c.label);
    const keys = creneaux.map(c => c.key);

    if (hours.length === 0) {
        return {
            hours: ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
            keys: ['h0800', 'h0900', 'h1000', 'h1100', 'h1400', 'h1500', 'h1600', 'h1700'],
        };
    }
    return { hours, keys };
}

export function currentHourKey(date = new Date()): string {
    const h = date.getHours().toString().padStart(2, '0');
    return `h${h}00`;
}

export function currentHourLabel(date = new Date()): string {
    const h = date.getHours().toString().padStart(2, '0');
    return `${h}:00`;
}

export function todayYmd(): string {
    return new Date().toISOString().split('T')[0];
}
