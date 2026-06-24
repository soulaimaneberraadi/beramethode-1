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
  const wDays = settings.workingDays && settings.workingDays.length > 0 ? settings.workingDays : [1, 2, 3, 4, 5];
  return wDays.includes(dow);
};

export const addWorkingDays = (start: Date, days: number, settings: AppSettings): Date => {
  const d = new Date(start);
  let remaining = Math.max(0, Math.ceil(days));
  let safety = 0;
  while (remaining > 0 && safety < 10000) {
    safety++;
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d, settings)) remaining--;
  }
  return d;
};

const workMinutesPerDay = (settings: AppSettings): number => {
  const [sh, sm] = (settings.workingHoursStart || '08:00').split(':').map(Number);
  const [eh, em] = (settings.workingHoursEnd || '18:00').split(':').map(Number);
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
  const wDays = settings.workingDays && settings.workingDays.length > 0 ? settings.workingDays : [1, 2, 3, 4, 5];
  return wDays.includes(converted);
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
  let safety = 0;
  while (remaining > 0 && safety < 10000) {
    safety++;
    d.setDate(d.getDate() + 1);
    if (isPlanningWorkingDay(d, settings)) remaining--;
  }
  return d;
}

/** Fin estimée OF : SAM (min/pièce) × quantité / (Nombre d'ouvriers * Minutes/jour * Performance %) + jours ouvrés. */
export function calculateEndDate(
  startIso: string,
  quantity: number,
  sam: number,
  efficiency: number,
  settings: AppSettings,
  chainId?: string,
  setupMins?: number
): string {
  // 1. Get Nombre d'ouvriers (from settings or fallback to 30)
  const operators = chainId ? (settings.chainOperators?.[chainId] ?? 30) : 30;

  // 2. Get Minutes de travail par jour (net of pauses)
  const workMins = getWorkMinutesPerDay(settings);

  // 3. Performance % is efficiency
  const performance = Math.max(0.01, efficiency);

  // 4. Temps de l'article is sam in minutes
  const samMins = Math.max(0.1, sam);

  // 5. Capacité Journalière (pieces per day)
  const capacity = (operators * workMins * performance) / samMins;

  // 6. Durée in days (including setup time buffer)
  const setupDays = setupMins ? (setupMins / workMins) : 0;
  const productionDays = capacity > 0 ? (quantity / capacity) : 1;
  const daysNeeded = Math.ceil(productionDays + setupDays);

  // 7. Add working days starting from startIso
  const end = addWorkingDaysFromLaunchIso(startIso, Math.max(1, daysNeeded), settings);
  return end.toISOString();
}

// ═══════════════════════════════════════════════════════════════════
// APS — Contraintes multi-matériaux pour date de démarrage
// ═══════════════════════════════════════════════════════════════════

export interface ConstrainedStartResult {
  /** Date de démarrage effective (après application de toutes les contraintes) */
  startDate: string;
  /** True si la date a été décalée par rapport à la date libre du ligne */
  isDelayed: boolean;
  /** Raison du décalage (matière critique, fournisseur, etc.) */
  delayReason?: string;
  /** Nombre de jours ouvrés de retard */
  delayDays: number;
}

/**
 * Date de démarrage contrainte :
 *   Earliest Start = max(Line Free Date, worst Material Arrival, fournisseurDate)
 * 
 * Si un fournisseur ou une matière retarde la production, le système
 * décale automatiquement le démarrage et signale la raison.
 * 
 * @param lineFreeDate — Date où la ligne sera disponible (YYYY-MM-DD)
 * @param worstMaterialArrivalYmd — Date d'arrivée de la matière la plus tardive (ou null)
 * @param criticalMaterialName — Nom de la matière critique (ou null)
 * @param fournisseurDate — Date d'arrivée fournisseur principal (ou undefined)
 * @returns Résultat avec date effective, décalage et raison
 */
export function computeConstrainedStartDate(
    lineFreeDate: string,
    worstMaterialArrivalYmd: string | null,
    criticalMaterialName: string | null,
    fournisseurDate?: string
): ConstrainedStartResult {
    const candidates: { date: string; source: string }[] = [
        { date: lineFreeDate, source: 'ligne' },
    ];

    if (worstMaterialArrivalYmd) {
        candidates.push({ date: worstMaterialArrivalYmd, source: criticalMaterialName || 'matière' });
    }
    if (fournisseurDate) {
        candidates.push({ date: fournisseurDate, source: 'fournisseur' });
    }

    // Tri par date décroissante → la plus tardive en premier
    candidates.sort((a, b) => b.date.localeCompare(a.date));
    const latest = candidates[0];

    const isDelayed = latest.date > lineFreeDate;
    let delayDays = 0;
    if (isDelayed) {
        const lineDate = parsePlanningDateAtNoon(lineFreeDate);
        const latestDate = parsePlanningDateAtNoon(latest.date);
        delayDays = Math.max(0, Math.round((latestDate.getTime() - lineDate.getTime()) / 86400000));
    }

    return {
        startDate: latest.date,
        isDelayed,
        delayReason: isDelayed ? `Retardé par : ${latest.source} (+${delayDays}j)` : undefined,
        delayDays,
    };
}

/** Fin estimée roulante OF : prend en compte la quantité restante à produire à partir d'aujourd'hui. */
export function calculateRollingEndDate(
  event: PlanningEvent,
  sam: number,
  efficiency: number,
  settings: AppSettings,
  setupMins?: number
): string {
  const start = (event.startDate || event.dateLancement || '').split('T')[0];
  const qty = Number(event.totalQuantity ?? event.qteTotal ?? 0);
  const produced = Number(event.producedQuantity ?? event.qteProduite ?? 0);
  const done = event.status === 'DONE';

  if (done || produced >= qty) {
    return calculateEndDate(start, qty, sam, efficiency, settings, event.chaineId, setupMins);
  }

  const todayStr = planningLocalDateKey(new Date());
  if (start && start < todayStr) {
    const remQty = Math.max(0, qty - produced);
    return calculateEndDate(todayStr, remQty, sam, efficiency, settings, event.chaineId, setupMins);
  }

  return calculateEndDate(start, qty, sam, efficiency, settings, event.chaineId, setupMins);
}

/**
 * Sequential dynamic rolling for planning events per chain.
 * Delays or pushes in preceding events push subsequent ones.
 */
export function rollPlanningEvents(
  events: PlanningEvent[],
  models: ModelData[],
  settings: AppSettings,
  chainEfficiencies: Record<string, number>
): PlanningEvent[] {
  const modelsMap = new Map(models.map(m => [m.id, m]));

  // Group events by chain
  const chainEventsMap = new Map<string, PlanningEvent[]>();
  for (const ev of events) {
    let list = chainEventsMap.get(ev.chaineId);
    if (!list) {
      list = [];
      chainEventsMap.set(ev.chaineId, list);
    }
    list.push(ev);
  }

  const rolledEvents: PlanningEvent[] = [];

  for (const [chainId, chainEvs] of chainEventsMap.entries()) {
    // Sort events by starting sequence: we use startDate or dateLancement
    const sorted = [...chainEvs].sort((a, b) => {
      const startA = a.startDate || a.dateLancement || '';
      const startB = b.startDate || b.dateLancement || '';
      return startA.localeCompare(startB);
    });

    let nextAvailableDate: string | null = null;
    const defaultEff = settings.chainActivityRate?.[chainId] ?? 0.60;
    const eff = (chainEfficiencies[chainId] !== undefined && chainEfficiencies[chainId] > 0) ? chainEfficiencies[chainId] : defaultEff;

    let prevModelId: string | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      const model = modelsMap.get(ev.modelId);
      const sam = model?.meta_data?.total_temps || 15;
      const qty = Number(ev.totalQuantity ?? ev.qteTotal ?? 0);

      let start = ev.startDate || ev.dateLancement || '';

      // Shift subsequent events if they are not DONE and not locked
      if (ev.status !== 'DONE' && nextAvailableDate && !ev.isLocked) {
        if (nextAvailableDate > start) {
          start = nextAvailableDate;
        }
      }

      // Check if setup/changeover time is needed (different model or first model on chain)
      const changeoverMins = (prevModelId === null || ev.modelId !== prevModelId)
        ? (model?.ficheData?.bufferLancement !== undefined ? model.ficheData.bufferLancement : (settings.changeoverDurationMins ?? 120))
        : 0;

      // Calculate planning efficiency based on targetEfficiency and facteurPlanning
      const modelEff = model?.ficheData?.targetEfficiency ?? 85;
      const safetyFactor = model?.ficheData?.facteurPlanning ?? 60;
      const effToUse = model ? (modelEff * safetyFactor) / 10000 : eff;

      // Recalculate end date based on start date and actual performance
      const endIso = calculateRollingEndDate(
        { ...ev, startDate: start, dateLancement: start },
        sam,
        effToUse,
        settings,
        changeoverMins
      );
      const endYmd = endIso.split('T')[0];

      const updatedEvent: PlanningEvent = {
        ...ev,
        startDate: start.split('T')[0],
        dateLancement: start.split('T')[0],
        estimatedEndDate: endIso,
        dateExport: endIso,
        typeMarche: model?.ficheData?.typeMarche ?? 'Local',
        facteurPlanning: model?.ficheData?.facteurPlanning ?? 60,
        bufferLancement: model?.ficheData?.bufferLancement ?? 120,
      };

      rolledEvents.push(updatedEvent);

      // Compute next available date: next working day after this event ends
      const nextWorkDay = addWorkingDaysFromLaunchIso(endYmd, 1, settings);
      nextAvailableDate = planningLocalDateKey(nextWorkDay);

      prevModelId = ev.modelId;
    }
  }

  // Preserve any events that didn't have a chain ID (defensive)
  const rolledIds = new Set(rolledEvents.map(e => e.id));
  const remaining = events.filter(e => !rolledIds.has(e.id));
  return [...rolledEvents, ...remaining];
}

