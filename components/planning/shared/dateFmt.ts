import { parsePlanningDateAtNoon } from '../../../utils/planning';

const yNow = () => new Date().getFullYear();

/** « 12 mai » ou « 12 mai 2027 » si année ≠ courante. */
export function fmtShort(iso: string | undefined): string {
    if (!iso) return '—';
    const d = parsePlanningDateAtNoon(iso);
    return d.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        ...(d.getFullYear() !== yNow() ? { year: 'numeric' as const } : {}),
    });
}

/** « lundi 12 mai 2026 ». */
export function fmtLong(iso: string | undefined): string {
    if (!iso) return '—';
    const d = parsePlanningDateAtNoon(iso);
    return d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

/** « mai 2026 ». */
export function fmtMonthYear(d: Date): string {
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/** Différence en jours (positive = après, négative = avant). */
export function daysBetween(a: string, b: string): number {
    const da = parsePlanningDateAtNoon(a).getTime();
    const db = parsePlanningDateAtNoon(b).getTime();
    return Math.round((db - da) / 86400000);
}

/** YYYY-MM-DD pour today. */
export function todayYmd(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
