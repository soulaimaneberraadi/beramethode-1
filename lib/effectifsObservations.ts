/**
 * Données « observations / notes » du module Effectifs (persistance locale).
 *
 * Raccords pour d’autres modules :
 * - `SuiviData` : même champ `date` (ISO `YYYY-MM-DD`). Les totaux journaliers
 *   par chaîne (`chaineId`) peuvent être croisés avec `anchor.kind === 'grid_column'`
 *   (`colId` / `colLabel` = identifiant / libellé de colonne dans la grille).
 * - Planning : `PlanningEvent.chaineId` aligné sur les ids de colonnes chaîne.
 * - Export / API : lire `loadEffectifsUserObservations()`, enrichir, puis
 *   `persistEffectifsUserObservations()` si vous gardez le localStorage comme SOT.
 */

export type EffectifsObservationAnchor =
  | { kind: 'grid_column'; date: string; category: string; colId: string; colLabel: string }
  | { kind: 'chart_day'; date: string };

export interface EffectifsUserObservation {
  id: string;
  text: string;
  createdAt: number;
  anchor: EffectifsObservationAnchor;
}

/** Clé localStorage — ne pas renommer (données utilisateur existantes). */
export const EFFECTIFS_USER_OBSERVATIONS_STORAGE_KEY = 'BERA_EFFECTIFS_USER_OBSERVATIONS';

export function createEffectifsObservationId(): string {
  return `eff_obs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function loadEffectifsUserObservations(): EffectifsUserObservation[] {
  try {
    const raw = localStorage.getItem(EFFECTIFS_USER_OBSERVATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is EffectifsUserObservation =>
        row &&
        typeof row === 'object' &&
        typeof (row as EffectifsUserObservation).id === 'string' &&
        typeof (row as EffectifsUserObservation).text === 'string' &&
        typeof (row as EffectifsUserObservation).createdAt === 'number' &&
        (row as EffectifsUserObservation).anchor &&
        typeof (row as EffectifsUserObservation).anchor === 'object'
    );
  } catch {
    return [];
  }
}

export function persistEffectifsUserObservations(notes: EffectifsUserObservation[]): void {
  try {
    localStorage.setItem(EFFECTIFS_USER_OBSERVATIONS_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Texte initial (français) lié à la date et à l’emplacement (colonne ou point courbe). */
export function defaultObservationTextForAnchor(anchor: EffectifsObservationAnchor): string {
  const d = new Date(anchor.date).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (anchor.kind === 'chart_day') {
    return `Observation du ${d} — point sur la courbe des effectifs : `;
  }
  return `Observation du ${d} — colonne « ${anchor.colLabel} » — section « ${anchor.category} » : `;
}

export function observationAnchorTitle(anchor: EffectifsObservationAnchor): string {
  const d = new Date(anchor.date).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (anchor.kind === 'chart_day') {
    return `Courbe des effectifs · ${d}`;
  }
  return `Colonne « ${anchor.colLabel} » · ${anchor.category} · ${d}`;
}

/** Libellé court pour les listes (détails complets via `observationAnchorTitle`). */
export function observationAnchorSummary(anchor: EffectifsObservationAnchor): string {
  const d = new Date(anchor.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  if (anchor.kind === 'chart_day') return d;
  return `${anchor.colLabel} · ${d}`;
}

/** Retire le préfixe généré si le texte enregistré le reprend (affichage carte). */
export function observationNoteDisplayBody(full: string, anchor: EffectifsObservationAnchor): string {
  const prefix = defaultObservationTextForAnchor(anchor).trimEnd();
  const t = full.trimStart();
  if (t.startsWith(prefix)) {
    const rest = t.slice(prefix.length).replace(/^[\s:·]+/, '').trim();
    return rest || full.trim();
  }
  return full.trim();
}

/** Notes dont la date d’ancrage est dans l’ensemble donné (ex. jours du graphique). */
export function filterObservationsByDates(
  notes: EffectifsUserObservation[],
  dates: Set<string> | readonly string[]
): EffectifsUserObservation[] {
  const set = dates instanceof Set ? dates : new Set(dates);
  return notes.filter(n => set.has(n.anchor.date));
}

/** Notes ancrées sur une cellule de grille (même jour, catégorie, colonne). */
export function filterObservationsForGridColumn(
  notes: EffectifsUserObservation[],
  params: { date: string; category: string; colId: string }
): EffectifsUserObservation[] {
  return notes.filter(
    n =>
      n.anchor.kind === 'grid_column' &&
      n.anchor.date === params.date &&
      n.anchor.category === params.category &&
      n.anchor.colId === params.colId
  );
}

/** Notes liées à une chaîne pour un jour (colonne grille = id chaîne, ex. `CHAINE 1`). */
export function filterObservationsForChainColumn(
  notes: EffectifsUserObservation[],
  chainColId: string,
  date: string
): EffectifsUserObservation[] {
  return notes.filter(
    n =>
      n.anchor.kind === 'grid_column' &&
      n.anchor.date === date &&
      n.anchor.colId === chainColId
  );
}

/** Notes ancrées sur le point courbe d’un jour donné. */
export function filterObservationsForChartDay(
  notes: EffectifsUserObservation[],
  date: string
): EffectifsUserObservation[] {
  return notes.filter(n => n.anchor.kind === 'chart_day' && n.anchor.date === date);
}
