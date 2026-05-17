/**
 * Intercepteur fetch pour static mode: traduit les appels /api/* en lectures
 * depuis le snapshot localStorage (synchronisé depuis Supabase).
 *
 * Versioning: /api/v1/* est mappé vers les mêmes données. Si on change la
 * forme dans v2, on garde v1 fonctionnel et on ajoute /api/v2/* qui lit le
 * même snapshot avec une couche de transformation.
 */

const SNAPSHOT_EXTRA_KEY = '__sqlite_export__';

const readJson = (key: string): any => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
};

const readExtra = (path: string[]): any => {
  // beramethode_settings contient parfois les données serveur sérialisées
  // mais surtout on lit depuis le snapshot cloud __sqlite_export__
  let node: any = readJson('beramethode_settings');
  // Le seed importé met __sqlite_export__ dans beramethode_settings (1 ligne app_settings)
  // mais en réalité on l'a placé directement comme clé top-level snapshot.
  // On lit donc via __export_data__ dans localStorage si présent.
  node = readJson('__bera_sqlite_export__');
  for (const p of path) {
    if (!node) return null;
    node = node[p];
  }
  return node;
};

const ROUTES: Array<{ test: RegExp; resolve: (url: URL) => any }> = [
  // Auth — handled by Supabase elsewhere; return safe defaults if hit
  { test: /\/api\/auth\/me$/, resolve: () => ({ user: null }) },
  { test: /\/api\/network-info$/, resolve: () => ({ ip: '127.0.0.1', host: 'static' }) },

  // Models
  { test: /\/api\/models(\?|$)/, resolve: () => readJson('beramethode_library') || [] },

  // Planning
  { test: /\/api\/planning(\?|$)/, resolve: () => readJson('beramethode_planning') || [] },

  // Suivi
  { test: /\/api\/suivi(\?|$)/, resolve: () => readJson('beramethode_suivis') || [] },

  // Settings
  { test: /\/api\/settings(\?|$)/, resolve: () => readJson('beramethode_settings') || {} },

  // Dashboard KPIs — compute from local data
  { test: /\/api\/dashboard\/kpis$/, resolve: () => {
      const planning = readJson('beramethode_planning') || [];
      const models = readJson('beramethode_library') || [];
      const enCours = planning.filter((p: any) => p.status === 'IN_PROGRESS' || p.status === 'READY').length;
      const totalOF = planning.length;
      return {
        of_en_cours: enCours,
        of_total: totalOF,
        modeles_actifs: models.length,
        effectif_present_today: 0,
        valeur_stock: 0,
        avances_en_cours: 0,
        trs_global: 0,
        production_journaliere: 0,
      };
    }
  },

  // Demandes appro
  { test: /\/api\/demandes-appro(\?|$)/, resolve: () => readJson('beramethode_demandesAppro') || [] },

  // Workers
  { test: /\/api\/workers(\?|$)/, resolve: () => readExtra(['workers']) || [] },
  { test: /\/api\/worker-skills(\?|$)/, resolve: () => readExtra(['workerSkills']) || [] },
  { test: /\/api\/worker-pointage(\?|$)/, resolve: () => readExtra(['workerPointage']) || [] },
  { test: /\/api\/poste-suivi(\?|$)/, resolve: () => readExtra(['posteSuivi']) || [] },

  // Magasin
  { test: /\/api\/magasin\/products(\?|$)/, resolve: () => readExtra(['magasin', 'products']) || [] },
  { test: /\/api\/magasin\/lots(\?|$)/, resolve: () => readExtra(['magasin', 'lots']) || [] },
  { test: /\/api\/magasin\/mouvements(\?|$)/, resolve: () => readExtra(['magasin', 'mouvements']) || [] },
  { test: /\/api\/magasin\/commandes(\?|$)/, resolve: () => readExtra(['magasin', 'commandes']) || [] },
  { test: /\/api\/magasin\/demandes(\?|$)/, resolve: () => readExtra(['magasin', 'demandes']) || [] },

  // HR
  { test: /\/api\/hr\/workers(\?|$)/, resolve: () => readExtra(['hr', 'workers']) || [] },
  { test: /\/api\/hr\/pointage(\?|$)/, resolve: () => readExtra(['hr', 'pointage']) || [] },
  { test: /\/api\/hr\/production(\?|$)/, resolve: () => readExtra(['hr', 'production']) || [] },
  { test: /\/api\/hr\/avances(\?|$)/, resolve: () => readExtra(['hr', 'avances']) || [] },
];

const installed = { v: false };

export const installApiShim = () => {
  if (installed.v) return;
  installed.v = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? new URL(input, location.origin)
      : input instanceof URL ? input : new URL((input as Request).url, location.origin);

    // Only intercept /api/* on our own origin
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      // For writes, accept and store nothing locally (data already flows via cloud sync from localStorage)
      if (method !== 'GET' && method !== 'HEAD') {
        return new Response(JSON.stringify({ ok: true, static: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      const route = ROUTES.find(r => r.test.test(url.pathname + url.search));
      const body = route ? route.resolve(url) : [];
      return new Response(JSON.stringify(body), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input as any, init);
  };
};
