// =====================================================================
// methodesEngine.ts — Moteur de calcul centralisé (Méthodes industrielles)
// Source unique pour M.R%, cadence théorique, OEE, ETA.
// Supporte l'effectif horaire (arrivée / départ mi-heure).
// =====================================================================

import type {
  ModelData,
  SuiviData,
  SuiviEffectifHoraire,
  OEEBreakdown,
  DowntimeEvent,
  PosteType,
} from '../types';

const MAJORATION = 1.15; // facteur standard AJANIF / méthodes

/** Minutes effectives d'un ouvrier sur une heure donnée (0..60). */
export function workerMinutesInHour(eff: SuiviEffectifHoraire): number {
  if (!eff.is_present) return 0;
  const join = Math.max(0, Math.min(60, eff.join_minute ?? 0));
  const leave = Math.max(0, Math.min(60, eff.leave_minute ?? 60));
  return Math.max(0, leave - join);
}

/** Total minutes-présence sur une heure (somme de tous les ouvriers modèle). */
export function presenceMinutesForHour(effs: SuiviEffectifHoraire[]): number {
  return effs.reduce((acc, e) => acc + workerMinutesInHour(e), 0);
}

/** SAM majoré (minutes par pièce, après majoration méthodes). */
export function samMajore(model: ModelData): number {
  const raw = Number(model?.meta_data?.total_temps ?? 0);
  if (!raw || raw <= 0) return 0;
  return raw * MAJORATION;
}

/** Cadence théorique horaire : pièces attendues sur une heure pour un effectif donné. */
export function computeCadenceTheoriqueHoraire(
  model: ModelData,
  effectifHoraire: SuiviEffectifHoraire[],
): number {
  const sam = samMajore(model);
  if (sam <= 0) return 0;
  const minutes = presenceMinutesForHour(effectifHoraire);
  return minutes / sam;
}

/** M.R% = (earned_minutes / presence_minutes) × 100 */
export function computeMR(validPieces: number, sam: number, presenceMinutes: number): number {
  if (presenceMinutes <= 0) return 0;
  const earned = validPieces * sam;
  return (earned / presenceMinutes) * 100;
}

/** Compose OEE = Disponibilité × Performance × Qualité. */
export function computeOEE(opts: {
  plannedMinutes: number;
  downtimeMinutes: number;
  produced: number;
  theoretical: number;
  good: number;
}): OEEBreakdown {
  const { plannedMinutes, downtimeMinutes, produced, theoretical, good } = opts;
  const runMinutes = Math.max(0, plannedMinutes - downtimeMinutes);
  const disponibilite = plannedMinutes > 0 ? runMinutes / plannedMinutes : 0;
  const performance = theoretical > 0 ? Math.min(1, produced / theoretical) : 0;
  const qualite = produced > 0 ? good / produced : 0;
  const oee = disponibilite * performance * qualite;
  return {
    disponibilite, performance, qualite, oee,
    plannedMinutes, runMinutes, downtimeMinutes,
    produced, theoretical, good,
  };
}

/** ETA : date estimée de fin à partir du reste à produire et de la cadence actuelle. */
export function computeETA(
  resteAProduire: number,
  cadencePiecesParHeure: number,
  netWorkHoursPerDay: number,
  fromDate: Date = new Date(),
): Date | null {
  if (resteAProduire <= 0) return fromDate;
  if (cadencePiecesParHeure <= 0 || netWorkHoursPerDay <= 0) return null;
  const heures = resteAProduire / cadencePiecesParHeure;
  const jours = heures / netWorkHoursPerDay;
  const eta = new Date(fromDate);
  eta.setDate(eta.getDate() + Math.ceil(jours));
  return eta;
}

/** Agrégat jour à partir de tous les suivis d'une chaîne + date. */
export function aggregateDaily(suivis: SuiviData[]): {
  produced: number;
  defauts: number;
  totalWorkers: number;
  mrAvg: number;
} {
  if (suivis.length === 0) return { produced: 0, defauts: 0, totalWorkers: 0, mrAvg: 0 };
  let produced = 0, defauts = 0, totalWorkers = 0, mrSum = 0, mrCount = 0;
  for (const s of suivis) {
    produced += s.totalHeure ?? 0;
    defauts += (s.defauts ?? []).reduce((a, d) => a + (d.quantity ?? 0), 0);
    totalWorkers += s.totalWorkers ?? 0;
    if (typeof s.pJournaliere === 'number' && s.pJournaliere > 0) {
      mrSum += s.pJournaliere;
      mrCount += 1;
    }
  }
  return { produced, defauts, totalWorkers, mrAvg: mrCount > 0 ? mrSum / mrCount : 0 };
}

/** Filtre des suivis par chaîne / modèle / plage de dates. */
export function filterSuivis(
  suivis: SuiviData[],
  opts: { chaineId?: string; modelId?: string; from?: string; to?: string },
): SuiviData[] {
  return suivis.filter((s) => {
    if (opts.chaineId && s.chaineId !== opts.chaineId) return false;
    if (opts.modelId && s.modelId !== opts.modelId) return false;
    if (opts.from && s.date < opts.from) return false;
    if (opts.to && s.date > opts.to) return false;
    return true;
  });
}

/** Rendement chaîne sur plage. */
export const computeRendementChaine = (suivis: SuiviData[], chaineId: string, from?: string, to?: string) =>
  aggregateDaily(filterSuivis(suivis, { chaineId, from, to }));

/** Rendement modèle sur plage. */
export const computeRendementModele = (suivis: SuiviData[], modelId: string, from?: string, to?: string) =>
  aggregateDaily(filterSuivis(suivis, { modelId, from, to }));

/** Rendement atelier global sur plage. */
export const computeRendementAtelier = (suivis: SuiviData[], from?: string, to?: string) =>
  aggregateDaily(filterSuivis(suivis, { from, to }));

/** Total minutes d'arrêt (pour OEE). */
export function totalDowntimeMinutes(events: DowntimeEvent[] | undefined): number {
  if (!events) return 0;
  return events.reduce((acc, e) => acc + (e.minutes ?? 0), 0);
}

/** Helpers pour compter les ouvriers par type dans l'effectif horaire. */
export function countByType(effs: SuiviEffectifHoraire[]): Record<PosteType, number> {
  const out: Record<PosteType, number> = { MACHINISTE: 0, MANUEL: 0, AUX: 0 };
  for (const e of effs) if (e.is_present) out[e.type_poste] = (out[e.type_poste] ?? 0) + 1;
  return out;
}

export const __CONSTANTS__ = { MAJORATION };
