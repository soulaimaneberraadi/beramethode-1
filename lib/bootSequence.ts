/**
 * Real boot sequence for BERAMETHODE V2.
 *
 * 1) Session (auth) — one round-trip.
 * 2) Toutes les données métier en parallèle : durée totale ≈ l’appel le plus lent,
 *    et non la somme des durées (évite blocages longs + sensation de « rafraîchissement »
 *    si HMR/abort se déclenche pendant l’attente).
 */

export type BootStepId =
  | 'auth'
  | 'data'
  | 'settings'
  | 'workers'
  | 'magasin'
  | 'dashboard';

export interface BootStep {
  id: BootStepId;
  label: string;
  weight: number;
  run: (signal: AbortSignal) => Promise<unknown>;
}

export interface BootProgress {
  progress: number;
  currentLabel: string;
  completedSteps: BootStepId[];
}

export interface BootResult {
  ok: boolean;
  error?: { stepId: BootStepId; message: string };
  cache: Partial<Record<BootStepId, unknown>>;
  durationMs: number;
}

const fetchJSON = async (url: string, signal: AbortSignal) => {
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) {
    if (res.status === 401 && url.endsWith('/api/auth/me')) return null;
    throw new Error(`${url} → HTTP ${res.status}`);
  }
  return res.json();
};

/** Étie les promesses en ajoutant un contexte d’erreur lisible. */
const named =
  (label: string) =>
  (p: Promise<unknown>) =>
    p.catch((e: unknown) => {
      const m = e instanceof Error ? e.message : String(e);
      throw new Error(`${label} : ${m}`);
    });

/**
 * Poids : 15 % session, 85 % chargement parallèle (l’utilisateur garde un pourcentage cohérent).
 * Les étiquettes d’API (settings, workers, …) restent dans le cache — pas d’`id: 'data'` clé côté consommateurs.
 */
export const BOOT_STEPS: BootStep[] = [
  {
    id: 'auth',
    label: 'Vérification de la session...',
    weight: 15,
    run: (signal) => fetchJSON('/api/auth/me', signal),
  },
  {
    id: 'data',
    label: 'Chargement des données (parallèle)...',
    weight: 85,
    run: async (signal) => {
      const s = (label: string, p: Promise<unknown>) => named(label)(p);
      const [settings, workers, products, lots, mouvements, kpis] = await Promise.all([
        s('paramètres', fetchJSON('/api/settings', signal)),
        s('effectifs RH', fetchJSON('/api/hr/workers', signal)),
        s('magasin — produits', fetchJSON('/api/magasin/products', signal)),
        s('magasin — lots', fetchJSON('/api/magasin/lots', signal)),
        s('magasin — mouvements', fetchJSON('/api/magasin/mouvements', signal)),
        s('tableau de bord', fetchJSON('/api/dashboard/kpis', signal)),
      ]);
      return { settings, workers, magasin: { products, lots, mouvements }, dashboard: kpis };
    },
  },
];

const bootCache: Partial<Record<BootStepId, unknown>> = {};

export const getBootCache = () => bootCache;

const cacheKeysToFillFromData = ['settings', 'workers', 'magasin', 'dashboard'] as const;

/**
 * Remplit le cache hérité (paramètres, effectifs, magasin, tableaux) à partir du bundle `data`.
 */
const applyDataBundle = (b: { settings: unknown; workers: unknown; magasin: unknown; dashboard: unknown }) => {
  bootCache.settings = b.settings;
  bootCache.workers = b.workers;
  bootCache.magasin = b.magasin;
  bootCache.dashboard = b.dashboard;
};

export const runBootSequence = async (
  onProgress: (p: BootProgress) => void,
  signal: AbortSignal,
): Promise<BootResult> => {
  const startedAt = performance.now();
  const [authStep, dataStep] = BOOT_STEPS;

  const allDone: BootStepId[] = ['auth', ...cacheKeysToFillFromData];

  onProgress({ progress: 0, currentLabel: authStep.label, completedSteps: [] });

  if (signal.aborted) {
    return { ok: false, error: { stepId: 'auth', message: 'Annulé' }, cache: bootCache, durationMs: performance.now() - startedAt };
  }

  try {
    const authData = await authStep.run(signal);
    bootCache.auth = authData;
    onProgress({ progress: 15, currentLabel: authStep.label, completedSteps: ['auth'] });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError' && signal.aborted) {
      return { ok: false, error: { stepId: 'auth', message: 'Annulé' }, cache: bootCache, durationMs: performance.now() - startedAt };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { stepId: 'auth', message }, cache: bootCache, durationMs: performance.now() - startedAt };
  }

  if (signal.aborted) {
    return { ok: false, error: { stepId: 'data', message: 'Annulé' }, cache: bootCache, durationMs: performance.now() - startedAt };
  }

  onProgress({ progress: 15, currentLabel: dataStep.label, completedSteps: ['auth'] });

  try {
    const bundle = (await dataStep.run(signal)) as {
      settings: unknown;
      workers: unknown;
      magasin: unknown;
      dashboard: unknown;
    };
    applyDataBundle(bundle);
    onProgress({ progress: 100, currentLabel: 'Prêt.', completedSteps: [...allDone] });
    return { ok: true, cache: bootCache, durationMs: performance.now() - startedAt };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError' && signal.aborted) {
      return { ok: false, error: { stepId: 'data', message: 'Annulé' }, cache: bootCache, durationMs: performance.now() - startedAt };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { stepId: 'data', message }, cache: bootCache, durationMs: performance.now() - startedAt };
  }
};
