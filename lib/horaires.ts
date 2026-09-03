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
  /** Clé style `deriveHourGrid` : "h0800". */
  key: string;
  /** Début du créneau en minutes depuis minuit. */
  startMin: number;
}

/**
 * Blocs horaires d'une heure du jour, mêmes conventions de clés que
 * `deriveHourGrid` (components/suivi/shared/hours.ts) : une clé 'h0800' par
 * heure pleine, en sautant les heures où une pause occupe ≥ 30 min.
 */
export function creneauxDuJour(settings: AppSettings, dateOrDay?: Date | number): CreneauJour[] {
  const h = horairesDuJour(settings, dateOrDay);
  if (h.closed) return [];
  const startMin = toMin(h.start) || 480;
  const endMin = toMin(h.end) || 1080;
  const out: CreneauJour[] = [];
  for (let m = startMin; m < endMin; m += 60) {
    const overlap = pauseOverlapMinutes(h.pauses, m, m + 60);
    if (overlap < 30) {
      const hh = Math.floor(m / 60).toString().padStart(2, '0');
      const mm = (m % 60).toString().padStart(2, '0');
      out.push({ label: `${hh}:${mm}`, key: `h${hh}${mm}`, startMin: m });
    }
  }
  return out;
}
