/**
 * Grille journalière « Tranches (créneaux) » — pointage.
 * Définition par défaut + parsing depuis `app_settings.hr_pointage_tranches`.
 * Stockée par jour : `hr_pointage.grille_presence` (JSON boolé[], même longueur que les tranches).
 */
import type { AppSettings } from '../types';

export type PointageTrancheSlot = { label: string; start: string; end: string };

export type PointageTranchesConfig = {
  slots: PointageTrancheSlot[];
  /** Colonne « pause » insérée avant le créneau d’index `sepAfterIndex + 1`. -1 = pas de colonne pause. */
  sepAfterIndex: number;
};

const DEFAULT_SLOTS: PointageTrancheSlot[] = [
  { label: '6:30/7:30', start: '06:30', end: '07:30' },
  { label: '7:30/8:30', start: '07:30', end: '08:30' },
  { label: '8:30/9:30', start: '08:30', end: '09:30' },
  { label: '9:30/10:30', start: '09:30', end: '10:30' },
  { label: '11:00/12:00', start: '11:00', end: '12:00' },
  { label: '12:00/13:00', start: '12:00', end: '13:00' },
  { label: '13:00/14:00', start: '13:00', end: '14:00' },
  { label: '14:00/15:00', start: '14:00', end: '15:00' },
  { label: '15:00/15:30', start: '15:00', end: '15:30' },
];

const DEFAULT_SEP = 3;

/** @deprecated Utiliser `getDefaultPointageTranches().slots` */
export const POINTAGE_GRILLE_SLOTS: readonly PointageTrancheSlot[] = DEFAULT_SLOTS;

/** @deprecated Utiliser `getDefaultPointageTranches().sepAfterIndex` */
export const POINTAGE_GRILLE_SEP_AFTER_INDEX = DEFAULT_SEP;

/** @deprecated longueur = slots courants */
export const POINTAGE_GRILLE_NB = DEFAULT_SLOTS.length;

export function getDefaultPointageTranches(): PointageTranchesConfig {
  return {
    slots: DEFAULT_SLOTS.map(s => ({ ...s })),
    sepAfterIndex: DEFAULT_SEP,
  };
}

function normalizeHHMM(s: string): string | null {
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function isValidSlot(s: unknown): s is PointageTrancheSlot {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  const label = typeof o.label === 'string' && o.label.trim().length > 0 && o.label.trim().length <= 48;
  const st = normalizeHHMM(String(o.start ?? ''));
  const en = normalizeHHMM(String(o.end ?? ''));
  if (!label || !st || !en) return false;
  const a = timeToMin(st);
  const b = timeToMin(en);
  return b > a;
}

/** Valide et normalise la config API ; sinon tranches générées depuis les horaires atelier (si dispo) ou défaut historique. */
export function parsePointageTranchesFromSettings(
  raw: unknown,
  appSettings?: AppSettings | null,
): PointageTranchesConfig {
  const fromAtelier = () => (appSettings != null ? buildPointageTranchesFromAppSettings(appSettings) : getDefaultPointageTranches());
  let obj: unknown = raw;
  if (obj == null) return fromAtelier();
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return fromAtelier();
    }
  }
  if (!obj || typeof obj !== 'object') return fromAtelier();
  const o = obj as Record<string, unknown>;
  const arr = o.slots;
  if (!Array.isArray(arr) || arr.length < 2 || arr.length > 24) return fromAtelier();
  const slots: PointageTrancheSlot[] = [];
  for (const row of arr) {
    if (!isValidSlot(row)) return fromAtelier();
    const r = row as PointageTrancheSlot;
    slots.push({
      label: r.label.trim(),
      start: normalizeHHMM(r.start)!,
      end: normalizeHHMM(r.end)!,
    });
  }
  let sep = typeof o.sepAfterIndex === 'number' && Number.isFinite(o.sepAfterIndex) ? Math.floor(o.sepAfterIndex) : DEFAULT_SEP;
  if (sep < -1) sep = -1;
  if (sep > slots.length - 2) sep = Math.max(-1, slots.length - 2);
  return { slots, sepAfterIndex: sep };
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minToTime(m: number): string {
  const x = ((m % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(x / 60);
  const mm = x % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function mergeIntervals(intervals: { a: number; b: number }[]): { a: number; b: number }[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((x, y) => x.a - y.a);
  const out: { a: number; b: number }[] = [];
  let cur = { ...sorted[0] };
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    if (n.a <= cur.b) cur.b = Math.max(cur.b, n.b);
    else {
      out.push(cur);
      cur = { ...n };
    }
  }
  out.push(cur);
  return out;
}

function timeLabelHhMm(s: string): string {
  const t = normalizeHHMM(s) || s;
  const p = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!p) return t;
  return `${parseInt(p[1], 10)}:${p[2]}`;
}

/** Découpe [E, S) en excluant les plages de pause, puis tronque dans la journée. */
function workSegmentsForAtelier(
  e: number,
  s: number,
  pauseMins: { a: number; b: number }[],
): { a: number; b: number }[] {
  if (e >= s) return [];
  const clipped: { a: number; b: number }[] = pauseMins
    .map(p => ({ a: Math.max(e, p.a), b: Math.min(s, p.b) }))
    .filter(p => p.b > p.a);
  if (clipped.length === 0) return [{ a: e, b: s }];
  const m = mergeIntervals(clipped);
  const out: { a: number; b: number }[] = [];
  let x = e;
  for (const b of m) {
    if (b.a > x) out.push({ a: x, b: b.a });
    x = Math.max(x, b.b);
  }
  if (x < s) out.push({ a: x, b: s });
  return out;
}

/**
 * Génère les tranches (créneaux) de la grille pointage à partir de
 * `workingHoursStart` / `workingHoursEnd` et des pauses — même source qu’en Configuration (horaires atelier).
 */
export function buildPointageTranchesFromAppSettings(settings: AppSettings | null | undefined): PointageTranchesConfig {
  const def = getDefaultPointageTranches();
  if (!settings) return def;
  const a = normalizeHHMM(String(settings.workingHoursStart || ''));
  const b0 = normalizeHHMM(String(settings.workingHoursEnd || ''));
  if (!a || !b0) return def;
  let e = timeToMin(a);
  const s0 = timeToMin(b0);
  if (s0 <= e || s0 > 24 * 60) return def;
  const s = s0;

  const dayPauses: { a: number; b: number }[] = [];
  for (const p of settings.pauses || []) {
    const aP = normalizeHHMM(String(p.start));
    const aQ = normalizeHHMM(String(p.end));
    if (!aP || !aQ) continue;
    const pA = timeToMin(aP);
    const pB = timeToMin(aQ);
    if (pB <= pA) continue;
    if (pB <= e || pA >= s) continue;
    dayPauses.push({ a: pA, b: pB });
  }

  const segs = workSegmentsForAtelier(e, s, dayPauses);
  if (segs.length === 0) return def;
  const totalM = segs.reduce((acc, g) => acc + (g.b - g.a), 0);
  if (totalM < 2 * 60) return def;

  const makeSlots = (step: number) => {
    const slots: PointageTrancheSlot[] = [];
    for (const g of segs) {
      let t = g.a;
      while (t < g.b) {
        const endT = Math.min(t + step, g.b);
        if (endT <= t) break;
        const st = minToTime(t);
        const en = minToTime(endT);
        slots.push({ start: st, end: en, label: `${timeLabelHhMm(st)}/${timeLabelHhMm(en)}` });
        t = endT;
      }
    }
    return slots;
  };

  let step = 60;
  let slots = makeSlots(step);
  while (slots.length > 24 && step < 4 * 60) {
    step += 15;
    slots = makeSlots(step);
  }
  if (slots.length < 2 || slots.length > 24) return def;

  let sep = -1;
  if (segs.length >= 2) {
    const firstB = segs[0].b;
    const idx = slots.findIndex(sl => timeToMin(sl.start) >= firstB);
    if (idx >= 1) sep = idx - 1;
  }
  if (sep > slots.length - 2) sep = -1;
  if (sep < -1) sep = -1;

  return { slots, sepAfterIndex: sep };
}

function subtractPauseFromSegment(e: number, s: number, pd: number, pf: number): { a: number; b: number }[] {
  const lo = Math.max(e, pd);
  const hi = Math.min(s, pf);
  if (hi <= lo) return e < s ? [{ a: e, b: s }] : [];
  const parts: { a: number; b: number }[] = [];
  if (e < lo) parts.push({ a: e, b: lo });
  if (hi < s) parts.push({ a: hi, b: s });
  return parts.filter(x => x.b > x.a);
}

export function workSegmentsFromTimes(
  heure_entree: string | null | undefined,
  heure_sortie: string | null | undefined,
  pause_debut: string | null | undefined,
  pause_fin: string | null | undefined,
): { a: number; b: number }[] {
  if (!heure_entree || !heure_sortie) return [];
  let E = timeToMin(String(heure_entree));
  let S = timeToMin(String(heure_sortie));
  if (S < E) S += 24 * 60;
  let segs: { a: number; b: number }[] = [{ a: E, b: S }];
  if (pause_debut && pause_fin) {
    let PD = timeToMin(String(pause_debut));
    let PF = timeToMin(String(pause_fin));
    if (PF < PD) PF += 24 * 60;
    const next: { a: number; b: number }[] = [];
    for (const seg of segs) {
      next.push(...subtractPauseFromSegment(seg.a, seg.b, PD, PF));
    }
    segs = next;
  }
  return segs;
}

function slotOverlapsSegment(slotStart: number, slotEnd: number, seg: { a: number; b: number }): boolean {
  return Math.max(slotStart, seg.a) < Math.min(slotEnd, seg.b);
}

export function deriveGrilleFromTimes(
  slots: readonly PointageTrancheSlot[],
  heure_entree: string | null | undefined,
  heure_sortie: string | null | undefined,
  pause_debut: string | null | undefined,
  pause_fin: string | null | undefined,
): boolean[] {
  const segs = workSegmentsFromTimes(heure_entree, heure_sortie, pause_debut, pause_fin);
  return slots.map(slot => {
    const a = timeToMin(slot.start);
    const b = timeToMin(slot.end);
    return segs.some(seg => slotOverlapsSegment(a, b, seg));
  });
}

export function parseGrillePresence(raw: string | null | undefined, slotCount: number): boolean[] | null {
  if (raw == null || raw === '' || slotCount < 1) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j) || j.length !== slotCount) return null;
    const g = j.map(x => x === true || x === 1 || x === '1');
    return g as boolean[];
  } catch {
    return null;
  }
}

export function serializeGrillePresence(grid: boolean[]): string {
  return JSON.stringify(grid);
}

export function grilleToEntreeSortiePause(
  slots: readonly PointageTrancheSlot[],
  grid: boolean[],
): {
  heure_entree: string | null;
  heure_sortie: string | null;
  pause_debut: string | null;
  pause_fin: string | null;
} {
  const intervals = grid.flatMap((on, i) =>
    on && slots[i] ? [{ a: timeToMin(slots[i].start), b: timeToMin(slots[i].end) }] : [],
  );
  if (intervals.length === 0) {
    return { heure_entree: null, heure_sortie: null, pause_debut: null, pause_fin: null };
  }
  const merged = mergeIntervals(intervals);
  if (merged.length === 1) {
    return {
      heure_entree: minToTime(merged[0].a),
      heure_sortie: minToTime(merged[0].b),
      pause_debut: null,
      pause_fin: null,
    };
  }
  return {
    heure_entree: minToTime(merged[0].a),
    heure_sortie: minToTime(merged[merged.length - 1].b),
    pause_debut: minToTime(merged[0].b),
    pause_fin: minToTime(merged[1].a),
  };
}

export function toggleGrilleSlot(grid: boolean[], index: number): boolean[] {
  const g = [...grid];
  if (index < 0 || index >= g.length) return g;
  g[index] = !g[index];
  return g;
}

/** Nombre de colonnes créneaux + éventuelle colonne pause (pour colspan en-tête). */
export function tranchesHeaderColCount(cfg: PointageTranchesConfig): number {
  return cfg.slots.length + (cfg.sepAfterIndex >= 0 ? 1 : 0);
}
