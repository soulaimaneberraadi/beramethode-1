const CHUNKS = [
  () => import('../src/components/Login'),
  () => import('../src/components/Signup'),
  () => import('../components/Setup'),
  () => import('../src/components/AdminDashboard'),
  () => import('../components/Dashboard'),
  () => import('../components/Planning'),
  () => import('../components/Magasin'),
  () => import('../components/GESTION-RH'),
  () => import('../components/Facturation'),
  () => import('../components/Configuration'),
  () => import('../components/ModelWorkflow'),
  () => import('../components/Library'),
  () => import('../components/LaCoupe'),
  () => import('../components/Effectifs'),
  () => import('../components/Profil'),
  () => import('../components/SuiviProduction'),
  () => import('../components/RendementBoard'),
  () => import('../components/StockExport'),
  () => import('../components/Machin'),
  () => import('../components/PageMachine'),
  () => import('../components/Atelier'),
  () => import('../components/SousTraitance'),
  () => import('../components/CatalogueTemps'),
  () => import('../components/VueGenerale'),
];

let preloaded = false;

export const preloadAllChunks = async () => {
  if (preloaded) return;
  preloaded = true;
  const results = await Promise.allSettled(CHUNKS.map(fn => fn()));
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) console.warn(`[preloader] ${failed}/${CHUNKS.length} chunks failed`);
};
