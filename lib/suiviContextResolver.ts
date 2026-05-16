import type { PlanningEvent, SuiviData } from '../types';

export type SuiviContextResolverInput = {
  contextDate: string;
  hourKey: string;
  suivis: SuiviData[];
  planningEvents: PlanningEvent[];
  filterChaine: string;
  filterModele: string;
};

export type SuiviContextResolverResult = {
  /** Distinct planning IDs with saisie ≥ 0 on this hour slot */
  suggestedPlanningIds: string[];
  suggestedModelId: string | null;
  suggestedChaineId: string | null;
  conflict: boolean;
  /** One representative suivi row id when unambiguous */
  primarySuiviId: string | null;
};

function hourKeyToMinutes(key: string): number | null {
  const m = /^h(\d{2})(\d{2})$/.exec(key);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Wall-clock hour → key `hHH00` aligned with configured grid if possible */
export function alignHourKeyToGrid(hourKey: string, hourKeys: string[]): string | null {
  if (hourKeys.includes(hourKey)) return hourKey;
  const target = hourKeyToMinutes(hourKey);
  if (target == null || hourKeys.length === 0) return null;
  let best: string | null = null;
  let bestDelta = Infinity;
  for (const k of hourKeys) {
    const t = hourKeyToMinutes(k);
    if (t == null) continue;
    const d = Math.abs(t - target);
    if (d < bestDelta) {
      bestDelta = d;
      best = k;
    }
  }
  return best;
}

function hasHourData(s: SuiviData, key: string): boolean {
  const v = s.sorties[key];
  return v !== undefined && v !== null && !Number.isNaN(Number(v)) && Number(v) >= 0;
}

/**
 * Pour une date et un créneau horaire, trouve les OF (planning) avec saisie suivi active.
 */
export function resolveSuiviContext(input: SuiviContextResolverInput): SuiviContextResolverResult {
  const { contextDate, hourKey, suivis, planningEvents, filterChaine, filterModele } = input;

  const dayRows = suivis.filter(s => s.date === contextDate);
  const alignedKey = hourKey;

  const matches: SuiviData[] = [];
  for (const s of dayRows) {
    if (!hasHourData(s, alignedKey)) continue;
    const plan = planningEvents.find(p => p.id === s.planningId);
    const modelId = plan?.modelId ?? s.modelId;
    if (!modelId) continue;
    if (filterChaine !== 'ALL') {
      const cid = plan?.chaineId ?? s.chaineId;
      if (cid !== filterChaine) continue;
    }
    if (filterModele !== 'ALL' && modelId !== filterModele) continue;
    matches.push(s);
  }

  const planningIds = [...new Set(matches.map(m => m.planningId).filter(Boolean))];
  const conflict = planningIds.length > 1;
  const primary = matches[0] ?? null;
  const firstPlan = primary ? planningEvents.find(p => p.id === primary.planningId) : undefined;
  const suggestedModelId = firstPlan?.modelId ?? primary?.modelId ?? null;
  const suggestedChaineId = firstPlan?.chaineId ?? primary?.chaineId ?? null;

  return {
    suggestedPlanningIds: planningIds,
    suggestedModelId,
    suggestedChaineId,
    conflict,
    primarySuiviId: primary?.id ?? null,
  };
}
