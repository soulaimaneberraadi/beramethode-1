import { tx } from '../../../lib/i18n';
import type { PlanningStatus } from '../../../types';

/** Statut de travail simplifié — 4 valeurs. */
export type WorkStatus = 'READY' | 'BLOCKED' | 'IN_PROGRESS' | 'DONE';

/** Indicateur de retard — calculé, jamais saisi. */
export type DelayState = 'ON_TIME' | 'AT_RISK' | 'LATE';

export const STATUS_META: Record<WorkStatus, {
    label: string;
    dot: string;
    text: string;
    bg: string;
    border: string;
    softBg: string;
}> = {
    READY: {
        label: 'Prêt',
        dot: 'bg-emerald-500',
        text: 'text-emerald-700 dark:text-emerald-400',
        bg: 'bg-emerald-50 dark:bg-emerald-900/30',
        border: 'border-emerald-200 dark:border-emerald-800',
        softBg: 'bg-emerald-50/60 dark:bg-emerald-900/20',
    },
    BLOCKED: {
        label: 'Bloqué',
        dot: 'bg-red-500',
        text: 'text-red-700 dark:text-red-400',
        bg: 'bg-red-50 dark:bg-red-900/30',
        border: 'border-red-200 dark:border-red-800',
        softBg: 'bg-red-50/60 dark:bg-red-900/20',
    },
    IN_PROGRESS: {
        label: 'En cours',
        dot: 'bg-[#2149C1]',
        text: 'text-[#1a3ba5] dark:text-blue-400',
        bg: 'bg-blue-50 dark:bg-blue-900/30',
        border: 'border-blue-200 dark:border-blue-800',
        softBg: 'bg-blue-50/60 dark:bg-blue-900/20',
    },
    DONE: {
        label: 'Terminé',
        dot: 'bg-slate-400 dark:bg-dk-muted',
        text: 'text-slate-600 dark:text-dk-muted',
        bg: 'bg-slate-50 dark:bg-dk-bg',
        border: 'border-slate-200 dark:border-dk-border',
        softBg: 'bg-slate-50/60 dark:bg-dk-bg/50',
    },
};

export const DELAY_META: Record<DelayState, {
    label: string;
    dot: string;
    text: string;
}> = {
    ON_TIME: { label: 'À temps', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
    AT_RISK: { label: 'À risque', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
    LATE: { label: 'En retard', dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400' },
};

export function getStatusLabel(lang: string, status: WorkStatus): string {
  const map: Record<WorkStatus, { fr: string; ar: string; en: string }> = {
    READY: { fr: 'Prêt', ar: 'جاهز', en: 'Ready' },
    BLOCKED: { fr: 'Bloqué', ar: 'محظور', en: 'Blocked' },
    IN_PROGRESS: { fr: 'En cours', ar: 'قيد التنفيذ', en: 'In Progress' },
    DONE: { fr: 'Terminé', ar: 'منتهي', en: 'Completed' },
  };
  return tx(lang, map[status]);
}

export function getDelayLabel(lang: string, state: DelayState): string {
  const map: Record<DelayState, { fr: string; ar: string; en: string }> = {
    ON_TIME: { fr: 'À temps', ar: 'في الوقت المحدد', en: 'On Time' },
    AT_RISK: { fr: 'À risque', ar: 'في خطر', en: 'At Risk' },
    LATE: { fr: 'En retard', ar: 'متأخر', en: 'Late' },
  };
  return tx(lang, map[state]);
}

/** Normalise un statut legacy (8 valeurs) vers WorkStatus (4 valeurs). */
export function toWorkStatus(status: PlanningStatus | string | undefined): WorkStatus {
    if (status === 'DONE') return 'DONE';
    if (status === 'BLOCKED_STOCK') return 'BLOCKED';
    if (status === 'READY') return 'READY';
    // IN_PROGRESS, ON_TRACK, AT_RISK, OFF_TRACK, EXTERNAL_PROCESS → en cours
    if (status === 'IN_PROGRESS' || status === 'ON_TRACK' || status === 'AT_RISK' || status === 'OFF_TRACK') {
        return 'IN_PROGRESS';
    }
    if (status === 'EXTERNAL_PROCESS') return 'IN_PROGRESS';
    return 'READY';
}
