import type { AppSettings } from '../../../types';

/**
 * Dérive la grille horaire à partir des settings.
 * Saute les heures dont la pause occupe ≥ 30 min.
 */
export function deriveHourGrid(settings: AppSettings): { hours: string[]; keys: string[] } {
    const startStr = settings.workingHoursStart || '08:00';
    const endStr = settings.workingHoursEnd || '18:00';
    const pauses = settings.pauses || [];

    const toMin = (s: string) => {
        const [h, m] = s.split(':').map(Number);
        return (Number.isFinite(h) ? h * 60 : 0) + (Number.isFinite(m) ? m : 0);
    };

    const startMin = toMin(startStr) || 480;
    const endMin = toMin(endStr) || 1080;

    const hours: string[] = [];
    const keys: string[] = [];

    for (let m = startMin; m < endMin; m += 60) {
        const blockEnd = m + 60;
        let overlap = 0;
        for (const p of pauses) {
            const pStart = toMin(p.start);
            const pEnd = toMin(p.end);
            const oStart = Math.max(m, pStart);
            const oEnd = Math.min(blockEnd, pEnd);
            if (oEnd > oStart) overlap += oEnd - oStart;
        }
        if (overlap < 30) {
            const hStart = Math.floor(m / 60).toString().padStart(2, '0');
            const mStart = (m % 60).toString().padStart(2, '0');
            hours.push(`${hStart}:${mStart}`);
            keys.push(`h${hStart}${mStart}`);
        }
    }

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
