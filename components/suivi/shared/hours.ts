import type { AppSettings } from '../../../types';
import { creneauxDuJour, type CreneauJour } from '../../../lib/horaires';

export interface HourBlock {
    /** Clé de stockage du créneau : "h0800". */
    key: string;
    /** Étiquette du début : "08:00". */
    start: string;
    /** Étiquette de la fin réelle : "09:00" (ou "13:30" si la pause coupe le créneau). */
    end: string;
    /** Étiquette complète affichée dans la grille : "08:00/09:00". */
    label: string;
    /** Durée réelle en minutes (60, ou moins si la pause / la fin du jour coupe le créneau). */
    duration: number;
    startMin: number;
    endMin: number;
}

const FALLBACK: CreneauJour[] = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'].map(h => {
    const [hh, mm] = h.split(':').map(Number);
    const startMin = hh * 60 + mm;
    const endMin = startMin + 60;
    return {
        label: h,
        endLabel: `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`,
        key: `h${h.replace(':', '')}`,
        startMin,
        endMin,
        duration: 60,
    };
});

/**
 * Dérive la grille horaire à partir des settings.
 *
 * Passe par `lib/horaires.ts` (source unique de vérité) : si un jour est
 * fourni, l'exception de CE jour (ex. vendredi) est appliquée ; sinon on
 * retombe sur le réglage global. Les créneaux sont COUPÉS par les pauses :
 * un créneau ne chevauche jamais une pause et sa `duration` dit sa vraie
 * longueur (une pause de 30 min ne fait plus disparaître une heure entière).
 */
export function deriveHourGrid(settings: AppSettings, dateOrDay?: Date | number): { hours: string[]; keys: string[]; blocks: HourBlock[] } {
    const creneaux = creneauxDuJour(settings, dateOrDay);
    const source = creneaux.length > 0 ? creneaux : FALLBACK;

    const blocks: HourBlock[] = source.map(c => ({
        key: c.key,
        start: c.label,
        end: c.endLabel,
        label: `${c.label}/${c.endLabel}`,
        duration: c.duration,
        startMin: c.startMin,
        endMin: c.endMin,
    }));

    return {
        hours: blocks.map(b => b.start),
        keys: blocks.map(b => b.key),
        blocks,
    };
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
