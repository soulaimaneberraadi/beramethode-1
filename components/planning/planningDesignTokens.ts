/**
 * Jetons visuels — PLANNING_MASTER_PLAN §3.1 (unité Planning).
 * Référence pour audits et pour classes Tailwind répétées (purge : garder les chaînes complètes ici).
 */
export const PLANNING_DESIGN = {
    brandHex: '#2149C1',
    /** §3.1 : actif calendrier, DONE / Prêt */
    emeraldStrong: 'emerald-700',
    blocked: 'red-500',
    atRisk: 'amber-500',
    external: 'orange-500',
    weekendDisabled: 'slate-100',
} as const;

/** Segments ruban capacité — alignés §3.1 + CapacityRibbon */
export const CAPACITY_RIBBON_SEGMENT_CLASS = {
    underHalf: 'bg-emerald-700/45',
    under80: 'bg-emerald-700/55',
    amber: 'bg-amber-500/80',
    red: 'bg-red-500/85',
} as const;

/** Surfaces Gantt / pastilles statut OF — même grain que `Planning.tsx` STATUS_CONFIG */
export const PLANNING_STATUS_EMERALD_SURFACE = {
    bar: 'bg-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    dot: 'bg-emerald-700',
} as const;

export const PLANNING_STATUS_BRAND_SURFACE = {
    bar: 'bg-[#2149C1]',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    dot: 'bg-[#2149C1]',
    textColor: 'text-blue-900',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700',
} as const;

export const PLANNING_STATUS_RED_SURFACE = {
    bar: 'bg-red-500',
    bg: 'bg-red-50',
    border: 'border-red-300',
    dot: 'bg-red-500',
    textColor: 'text-red-800',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
} as const;

export const PLANNING_STATUS_ORANGE_SURFACE = {
    bar: 'bg-orange-500',
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    dot: 'bg-orange-500',
    textColor: 'text-orange-800',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-700',
} as const;

export const PLANNING_STATUS_AMBER_SURFACE = {
    bar: 'bg-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    dot: 'bg-amber-500',
    textColor: 'text-amber-900',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-700',
} as const;
