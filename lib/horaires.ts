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

/** Minutes depuis minuit -> "HH:MM". */
function minToHHMM(m: number): string {
  const hh = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
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
  return chevauchementMinutes(
    (pauses || []).map(p => ({ start: toMin(p.start), end: toMin(p.end) })),
    blockStartMin,
    blockEndMin,
  );
}

/** Minutes communes entre [blockStart, blockEnd[ et une liste d'intervalles en minutes. */
function chevauchementMinutes(intervalles: Array<{ start: number; end: number }>, blockStartMin: number, blockEndMin: number): number {
  let overlap = 0;
  for (const p of intervalles) {
    const oStart = Math.max(blockStartMin, p.start);
    const oEnd = Math.min(blockEndMin, p.end);
    if (oEnd > oStart) overlap += oEnd - oStart;
  }
  return overlap;
}

export interface CreneauJour {
  /** Étiquette "HH:MM" du début du créneau. */
  label: string;
  /** Étiquette "HH:MM" de la fin du créneau (fin d'horloge, pas déduction faite des pauses courtes). */
  endLabel: string;
  /** Clé style `deriveHourGrid` : "h0800". */
  key: string;
  /** Début du créneau en minutes depuis minuit. */
  startMin: number;
  /** Fin du créneau en minutes depuis minuit. */
  endMin: number;
  /** Minutes réellement produites : (fin - début) - pause courte qui tombe dedans. */
  duration: number;
  /** Minutes de pause courte incluses dans ce créneau (0 la plupart du temps). */
  pauseMin: number;
}

/** Minutes de production visées par créneau : un créneau = une heure de travail. */
const MINUTES_PAR_CRENEAU = 60;

/** Durée minimale d'un créneau conservé (un reliquat plus court n'est pas une heure de production). */
const MIN_CRENEAU_MIN = 5;

interface Intervalle { start: number; end: number }

/** Pauses du jour, rognées aux bornes du jour, triées et fusionnées si elles se chevauchent. */
function pausesDuJourNormalisees(pauses: Pause[], dayStart: number, dayEnd: number): Intervalle[] {
  const clipped = (pauses || [])
    .map(p => ({ start: Math.max(dayStart, toMin(p.start)), end: Math.min(dayEnd, toMin(p.end)) }))
    .filter(p => p.end > p.start)
    .sort((a, b) => a.start - b.start);

  const merged: Intervalle[] = [];
  for (const p of clipped) {
    const last = merged[merged.length - 1];
    if (last && p.start <= last.end) last.end = Math.max(last.end, p.end);
    else merged.push({ ...p });
  }
  return merged;
}

/**
 * Plages de travail continues du jour : [début, fin] moins les pauses.
 * Sert aux écrans qui ont besoin du temps travaillé brut (capacité, pointage) ;
 * la grille de Suivi, elle, passe par `creneauxDuJour`.
 */
export function plagesTravailleesDuJour(settings: AppSettings, dateOrDay?: Date | number): Intervalle[] {
  const h = horairesDuJour(settings, dateOrDay);
  if (h.closed) return [];
  const dayStart = toMin(h.start) || 480;
  const dayEnd = toMin(h.end) || 1080;
  if (dayEnd <= dayStart) return []; // horaire incohérent (ou vide) : aucune plage

  const pauses = pausesDuJourNormalisees(h.pauses, dayStart, dayEnd);
  const plages: Intervalle[] = [];
  let cursor = dayStart;
  for (const p of pauses) {
    if (p.start > cursor) plages.push({ start: cursor, end: p.start });
    cursor = Math.max(cursor, p.end);
  }
  if (cursor < dayEnd) plages.push({ start: cursor, end: dayEnd });
  return plages;
}

/**
 * Créneaux du jour, mêmes conventions de clés que `deriveHourGrid`
 * (components/suivi/shared/hours.ts) : une clé 'h0800' par créneau.
 *
 * RÈGLE : un créneau = UNE HEURE DE PRODUCTION. La pause n'ampute pas le
 * créneau, elle DÉCALE l'horloge — la fenêtre du créneau s'allonge d'autant.
 * L'atelier compte ainsi une heure pleine dans chaque case, quel que soit
 * l'endroit où tombe la coupure ; seul le dernier créneau de la journée peut
 * être plus court, avec ce qui reste avant la fermeture.
 *
 * Vendredi 06:30-17:00, rabouz 09:00-09:15, déjeuner + prière 13:30-14:30 :
 *   06:30/07:30 · 07:30/08:30 · 08:30/09:45 (60 min de travail + 15 de pause)
 *   09:45/10:45 · 10:45/11:45 · 11:45/12:45
 *   12:45/14:45 (60 de travail + 60 de pause) · 14:45/15:45 · 15:45/16:45
 *   16:45/17:00 (15 min)
 *   -> 10 créneaux, 555 min = 9 h 15 de production nette.
 */
export function creneauxDuJour(settings: AppSettings, dateOrDay?: Date | number): CreneauJour[] {
  const h = horairesDuJour(settings, dateOrDay);
  if (h.closed) return [];
  const dayStart = toMin(h.start) || 480;
  const dayEnd = toMin(h.end) || 1080;
  if (dayEnd <= dayStart) return [];

  const pauses = pausesDuJourNormalisees(h.pauses, dayStart, dayEnd);
  /** La pause qui couvre cet instant, s'il y en a une. */
  const pauseÀ = (m: number): Intervalle | undefined => pauses.find(p => m >= p.start && m < p.end);
  /** Le début de la prochaine pause après cet instant (fin du jour à défaut). */
  const prochainePause = (m: number): number => {
    for (const p of pauses) if (p.start > m) return p.start;
    return dayEnd;
  };

  const out: CreneauJour[] = [];
  let cursor = dayStart;

  while (cursor < dayEnd) {
    // Un créneau ne commence jamais dans une pause : on la franchit d'abord.
    let enPause = pauseÀ(cursor);
    while (enPause && cursor < dayEnd) { cursor = enPause.end; enPause = pauseÀ(cursor); }
    if (cursor >= dayEnd) break;

    const start = cursor;
    let restant = MINUTES_PAR_CRENEAU;

    // On consomme l'horloge, mais seules les minutes hors pause comptent.
    while (restant > 0 && cursor < dayEnd) {
      const p = pauseÀ(cursor);
      if (p) { cursor = Math.min(p.end, dayEnd); continue; }
      const borne = Math.min(dayEnd, prochainePause(cursor), cursor + restant);
      restant -= borne - cursor;
      cursor = borne;
    }

    /* L'heure de production est faite : on absorbe la pause qui commence
       pile ici, pour que le créneau suivant démarre sur du temps productif
       et que les fenêtres restent jointives (… 08:30/09:45, 09:45/10:45 …). */
    let collee = pauses.find(p => p.start === cursor);
    while (collee && cursor < dayEnd) { cursor = Math.min(collee.end, dayEnd); collee = pauses.find(p => p.start === cursor); }

    const end = cursor;
    const duration = MINUTES_PAR_CRENEAU - restant;
    if (duration < MIN_CRENEAU_MIN) break; // reliquat trop court pour être une case de saisie
    out.push({
      label: minToHHMM(start),
      endLabel: minToHHMM(end),
      key: `h${minToHHMM(start).replace(':', '')}`,
      startMin: start,
      endMin: end,
      duration,
      pauseMin: (end - start) - duration,
    });
  }

  return out;
}
