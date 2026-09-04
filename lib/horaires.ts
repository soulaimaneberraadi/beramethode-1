/**
 * Source UNIQUE de vérité pour les horaires de travail.
 *
 * POURQUOI ce fichier : avant, `workingHoursStart` / `workingHoursEnd` /
 * `pauses` étaient lus (et parfois recalculés à la main) directement depuis
 * `AppSettings` dans plusieurs écrans (grille horaire de Suivi, capacité,
 * grille de pointage, score par créneau...). Chacun avait sa propre petite
 * logique de conversion HH:MM -> minutes et de soustraction des pauses, avec
 * de petits écarts d'un fichier à l'autre. En ajoutant la possibilité de
 * personnaliser un jour précis (ex. vendredi au Maroc, pause de midi plus
 * longue), il fallait UN SEUL endroit qui sache résoudre "l'horaire du jour"
 * pour que tous les écrans restent cohérents entre eux.
 *
 * Toute nouvelle fonctionnalité qui a besoin d'un horaire de travail doit
 * passer par les fonctions ci-dessous plutôt que de relire
 * `settings.workingHoursStart/workingHoursEnd/pauses` directement.
 */
import type { AppSettings, Pause } from '../types';

export interface HorairesJour {
  /** Heure de début "HH:MM". */
  start: string;
  /** Heure de fin "HH:MM". */
  end: string;
  /** Pauses effectives de ce jour (globales, sauf si remplacées par l'exception du jour). */
  pauses: Pause[];
  /** Jour non travaillé (absent de `workingDays`, ou exception `closed: true`). */
  closed: boolean;
}

function toMin(t: string | undefined | null): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (Number.isFinite(h) ? h * 60 : 0) + (Number.isFinite(m) ? m : 0);
}

/** Numéro de jour (1=lundi ... 7=dimanche) à partir d'une Date JS (0=dimanche). */
export function dayNumberFromDate(date: Date): number {
  const js = date.getDay(); // 0..6, 0=dimanche
  return js === 0 ? 7 : js;
}

/**
 * Résout l'horaire effectif d'un jour donné : applique l'exception de
 * `dayScheduleOverrides[jour]` PAR-DESSUS le réglage global, champ par champ
 * (un champ absent de l'exception hérite du réglage global). Un jour absent
 * de `workingDays` est fermé, sauf s'il est explicitement rouvert par
 * `closed: false` dans son exception (cas rare mais permis).
 *
 * @param dateOrDay Une Date, ou directement un numéro de jour (1=lundi..7=dimanche).
 *                  Omis = horaire "générique" (réglage global, sans résoudre de jour précis).
 */
export function horairesDuJour(settings: AppSettings, dateOrDay?: Date | number): HorairesJour {
  const dayNumber = dateOrDay instanceof Date
    ? dayNumberFromDate(dateOrDay)
    : (typeof dateOrDay === 'number' ? dateOrDay : undefined);

  const globalStart = settings.workingHoursStart || '08:00';
  const globalEnd = settings.workingHoursEnd || '18:00';
  const globalPauses = settings.pauses || [];

  if (dayNumber == null) {
    return { start: globalStart, end: globalEnd, pauses: globalPauses, closed: false };
  }

  const override = settings.dayScheduleOverrides?.[dayNumber];
  const workingDays = settings.workingDays || [];
  const closedByDefault = workingDays.length > 0 && !workingDays.includes(dayNumber);
  const closed = override?.closed !== undefined ? override.closed : closedByDefault;

  return {
    start: override?.start || globalStart,
    end: override?.end || globalEnd,
    pauses: override?.pauses || globalPauses,
    closed,
  };
}

/** Minutes nettes travaillées d'un jour : (fin - début) - somme des pauses. Jour fermé = 0. */
export function minutesTravailleesDuJour(settings: AppSettings, dateOrDay?: Date | number): number {
  const h = horairesDuJour(settings, dateOrDay);
  if (h.closed) return 0;
  const start = toMin(h.start);
  let end = toMin(h.end);
  if (end < start) end += 24 * 60; // horaire à cheval sur minuit, cas limite
  const pauseMin = (h.pauses || []).reduce((acc, p) => acc + Math.max(0, toMin(p.end) - toMin(p.start)), 0);
  return Math.max(0, (end - start) - pauseMin);
}

/**
 * Minutes de chevauchement entre un créneau [blockStartMin, blockEndMin[ et
 * les pauses du jour — sert à ne pas surévaluer l'objectif d'un créneau
 * coupé par une pause (ex. `SuiviPostes.tsx`, score du créneau 12h-13h).
 */
export function pauseOverlapMinutes(pauses: Pause[], blockStartMin: number, blockEndMin: number): number {
  let overlap = 0;
  for (const p of pauses || []) {
    const pStart = toMin(p.start);
    const pEnd = toMin(p.end);
    const oStart = Math.max(blockStartMin, pStart);
    const oEnd = Math.min(blockEndMin, pEnd);
    if (oEnd > oStart) overlap += oEnd - oStart;
  }
  return overlap;
}

export interface CreneauJour {
  /** Étiquette "HH:MM" du début du créneau. */
  label: string;
  /** Étiquette "HH:MM" de la fin du créneau (fin réelle, coupée par la pause). */
  endLabel: string;
  /** Clé style `deriveHourGrid` : "h0800". */
  key: string;
  /** Début du créneau en minutes depuis minuit. */
  startMin: number;
  /** Fin du créneau en minutes depuis minuit. */
  endMin: number;
  /** Durée réelle du créneau en minutes (60, ou moins s'il est coupé par une pause / la fin du jour). */
  duration: number;
}

/**
 * Plages réellement travaillées du jour : [début, fin] moins les pauses
 * (fusionnées et rognées aux bornes du jour). Utilisé pour découper la
 * grille horaire sans jamais faire chevaucher un créneau et une pause.
 */
export function plagesTravailleesDuJour(settings: AppSettings, dateOrDay?: Date | number): Array<{ startMin: number; endMin: number }> {
  const h = horairesDuJour(settings, dateOrDay);
  if (h.closed) return [];
  const dayStart = toMin(h.start) || 480;
  const dayEnd = toMin(h.end) || 1080;
  if (dayEnd <= dayStart) return []; // horaire incohérent (ou vide) : aucune plage

  // Pauses valides, rognées au jour, triées puis fusionnées si elles se chevauchent.
  const pauses = (h.pauses || [])
    .map(p => ({ start: Math.max(dayStart, toMin(p.start)), end: Math.min(dayEnd, toMin(p.end)) }))
    .filter(p => p.end > p.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const p of pauses) {
    const last = merged[merged.length - 1];
    if (last && p.start <= last.end) last.end = Math.max(last.end, p.end);
    else merged.push({ ...p });
  }

  const plages: Array<{ startMin: number; endMin: number }> = [];
  let cursor = dayStart;
  for (const p of merged) {
    if (p.start > cursor) plages.push({ startMin: cursor, endMin: p.start });
    cursor = Math.max(cursor, p.end);
  }
  if (cursor < dayEnd) plages.push({ startMin: cursor, endMin: dayEnd });
  return plages;
}

/** Durée minimale d'un créneau conservé (un reliquat plus court n'est pas une heure de production). */
const MIN_CRENEAU_MIN = 5;

/**
 * Blocs horaires du jour, mêmes conventions de clés que `deriveHourGrid`
 * (components/suivi/shared/hours.ts) : une clé 'h0800' par créneau.
 *
 * Le découpage suit les plages RÉELLEMENT travaillées : chaque plage est
 * coupée en tranches d'une heure, et la dernière tranche d'une plage garde sa
 * durée réelle (ex. atelier 06:30-17:00 avec pause 13:30-14:00 ->
 * ... 12:30/13:30, puis 14:00/15:00 ...). Auparavant on avançait d'heure en
 * heure depuis le début du jour en SUPPRIMANT l'heure qu'une pause occupait
 * ≥ 30 min : une pause de 30 min faisait disparaître 30 min de production, et
 * une pause qui ne tombait pas sur une heure pleine décalait tous les créneaux
 * suivants (le créneau 13:30/14:30 englobait la pause au lieu d'être coupé).
 */
export function creneauxDuJour(settings: AppSettings, dateOrDay?: Date | number): CreneauJour[] {
  const out: CreneauJour[] = [];
  for (const plage of plagesTravailleesDuJour(settings, dateOrDay)) {
    for (let m = plage.startMin; m < plage.endMin; m += 60) {
      const end = Math.min(m + 60, plage.endMin);
      const duration = end - m;
      if (duration < MIN_CRENEAU_MIN) continue;
      const hh = Math.floor(m / 60).toString().padStart(2, '0');
      const mm = (m % 60).toString().padStart(2, '0');
      out.push({
        label: `${hh}:${mm}`,
        endLabel: `${Math.floor(end / 60).toString().padStart(2, '0')}:${(end % 60).toString().padStart(2, '0')}`,
        key: `h${hh}${mm}`,
        startMin: m,
        endMin: end,
        duration,
      });
    }
  }
  return out;
}
