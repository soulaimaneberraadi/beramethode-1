import type { ModelData, PlanningEvent, AppSettings, Operation, ModelSectionSettings } from '../types';

const DEFAULT_WORK_MIN_PER_DAY = 8 * 60;

export interface SectionDates {
  prepStart?: string;
  prepEnd?: string;
  montageStart?: string;
  montageEnd?: string;
  fournisseurDate?: string;
  warnings: string[];
}

const toDate = (s?: string): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const toISO = (d: Date) => d.toISOString().slice(0, 10);

const isWorkingDay = (d: Date, settings: AppSettings): boolean => {
  const iso = toISO(d);
  const exc = settings.calendarExceptions?.[iso];
  if (exc) return exc.isWorking;
  const dow = d.getDay() === 0 ? 7 : d.getDay(); // ISO: Mon=1..Sun=7
  return (settings.workingDays || [1, 2, 3, 4, 5]).includes(dow);
};

export const addWorkingDays = (start: Date, days: number, settings: AppSettings): Date => {
  const d = new Date(start);
  let remaining = Math.max(0, Math.ceil(days));
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d, settings)) remaining--;
  }
  return d;
};

const workMinutesPerDay = (settings: AppSettings): number => {
  const [sh, sm] = (settings.workingHoursStart || '08:00').split(':').map(Number);
  const [eh, em] = (settings.workingHoursEnd || '17:00').split(':').map(Number);
  const total = (eh * 60 + em) - (sh * 60 + sm);
  const pauses = (settings.pauses || []).reduce((acc, p) => acc + (p.durationMin || 0), 0);
  const v = total - pauses;
  return v > 0 ? v : DEFAULT_WORK_MIN_PER_DAY;
};

const sumSAM = (ops: Operation[], section?: 'PREPARATION' | 'MONTAGE'): number => {
  return ops
    .filter(o => !section || (o.section ?? 'GLOBAL') === section || (o.section ?? 'GLOBAL') === 'GLOBAL')
    .reduce((acc, o) => acc + (o.time || 0), 0);
};

export const calculateSectionDates = (
  event: PlanningEvent,
  model: ModelData | undefined,
  settings: AppSettings
): SectionDates => {
  const warnings: string[] = [];
  const splitEnabled = event.sectionSplitEnabled ?? model?.ficheData?.sectionSplitEnabled ?? false;

  if (!splitEnabled || !model) {
    return {
      prepStart: event.dateLancement,
      prepEnd: event.dateExport,
      montageStart: event.dateLancement,
      montageEnd: event.dateExport,
      fournisseurDate: event.fournisseurDate,
      warnings,
    };
  }

  const sec: ModelSectionSettings = model.ficheData?.sectionSettings || {
    global: { efficiency: 1, numWorkers: 1 },
    preparation: { efficiency: 1, numWorkers: 1 },
    montage: { efficiency: 1, numWorkers: 1 },
  };

  const wmin = workMinutesPerDay(settings);
  const ops = model.gamme_operatoire || [];
  const samPrep = sumSAM(ops, 'PREPARATION');
  const samMontage = sumSAM(ops, 'MONTAGE');

  const qty = event.qteTotal || 0;
  const capPrep = Math.max(1, sec.preparation.numWorkers) * Math.max(0.01, sec.preparation.efficiency) * wmin;
  const capMontage = Math.max(1, sec.montage.numWorkers) * Math.max(0.01, sec.montage.efficiency) * wmin;

  const daysPrep = capPrep > 0 ? Math.ceil((qty * samPrep) / capPrep) : 0;
  const daysMontage = capMontage > 0 ? Math.ceil((qty * samMontage) / capMontage) : 0;

  const prepStartDate = toDate(event.prepStart || event.dateLancement);
  if (!prepStartDate) {
    warnings.push('prepStart manquant');
    return { fournisseurDate: event.fournisseurDate, warnings };
  }

  const prepEndDate = addWorkingDays(prepStartDate, daysPrep, settings);
  const fournDate = toDate(event.fournisseurDate);
  let montageStartDate = prepEndDate;
  if (fournDate && fournDate > montageStartDate) {
    montageStartDate = fournDate;
    warnings.push('Montage retardé en attente du fournisseur');
  }
  const montageEndDate = addWorkingDays(montageStartDate, daysMontage, settings);

  return {
    prepStart: toISO(prepStartDate),
    prepEnd: toISO(prepEndDate),
    montageStart: toISO(montageStartDate),
    montageEnd: toISO(montageEndDate),
    fournisseurDate: event.fournisseurDate,
    warnings,
  };
};

export const getActiveSection = (
  isoDate: string,
  dates: SectionDates
): 'PREPARATION' | 'MONTAGE' | 'BOTH' | 'NONE' => {
  const inPrep = dates.prepStart && dates.prepEnd && isoDate >= dates.prepStart && isoDate <= dates.prepEnd;
  const inMontage = dates.montageStart && dates.montageEnd && isoDate >= dates.montageStart && isoDate <= dates.montageEnd;
  if (inPrep && inMontage) return 'BOTH';
  if (inPrep) return 'PREPARATION';
  if (inMontage) return 'MONTAGE';
  return 'NONE';
};

/** Minutes de travail net par jour (pauses déduites) — même logique que `calculateSectionDates`. */
export const getWorkMinutesPerDay = (settings: AppSettings): number => workMinutesPerDay(settings);

// ── Planning / Gantt : jour civil à midi local + jours ouvrés (aligné `components/Planning.tsx`) ──

export function planningLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD (ou ISO) à midi local — évite dérive UTC sur les dates OF. */
export function parsePlanningDateAtNoon(iso: string): Date {
  const raw = (iso || '').split('T')[0];
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return new Date(iso);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Jour ouvré pour le module Planning (exceptions = clés locales YYYY-MM-DD). */
export function isPlanningWorkingDay(date: Date, settings: AppSettings): boolean {
  const iso = planningLocalDateKey(date);
  const exception = settings.calendarExceptions?.[iso];
  if (exception) return exception.isWorking;
  const converted = date.getDay() === 0 ? 7 : date.getDay();
  return (settings.workingDays || [1, 2, 3, 4, 5]).includes(converted);
}

/** Heures nettes par jour pour calcul fin OF (défaut fin 18:00 — aligné Planning). */
export function getNetWorkHours(settings: AppSettings): number {
  const [sh, sm] = (settings.workingHoursStart || '08:00').split(':').map(Number);
  const [eh, em] = (settings.workingHoursEnd || '18:00').split(':').map(Number);
  const totalMins = (eh * 60 + em) - (sh * 60 + sm);
  const pauseMins = (settings.pauses || []).reduce((acc, p) => acc + (p.durationMin || 0), 0);
  return Math.max(1, (totalMins - pauseMins) / 60);
}

/** Avance d’`daysNeeded` jours ouvrés à partir du jour civil `startIso` (comportement identique à l’ancien Planning). */
export function addWorkingDaysFromLaunchIso(startIso: string, daysNeeded: number, settings: AppSettings): Date {
  const d = parsePlanningDateAtNoon(startIso);
  let remaining = daysNeeded;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isPlanningWorkingDay(d, settings)) remaining--;
  }
  return d;
}

/** Fin estimée OF : SAM (min/pièce) × quantité / efficacité / heures jour + jours ouvrés. */
export function calculateEndDate(
  startIso: string,
  quantity: number,
  sam: number,
  efficiency: number,
  settings: AppSettings
): string {
  const hoursPerDay = getNetWorkHours(settings);
  const baseTimeHrs = quantity * (sam / 60);
  const adjustedHrs = baseTimeHrs / Math.max(0.01, efficiency);
  const daysNeeded = Math.ceil(adjustedHrs / hoursPerDay);
  const end = addWorkingDaysFromLaunchIso(startIso, Math.max(1, daysNeeded), settings);
  return end.toISOString();
}
