/**
 * Exporte les données SQLite locales vers Supabase pour soulaimaneberraadi@gmail.com.
 * Lit chaque table pertinente et la transforme en clés localStorage que cloudSync attend.
 * Usage: node scripts/export-to-supabase.mjs
 */
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const SUPABASE_URL = 'https://jiscgwioxwsulaopsivc.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2Nnd2lveHdzdWxhb3BzaXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTcwNTgsImV4cCI6MjA5MTU3MzA1OH0.-jRI1RlbjxecLyN2b83xmjuJCKhs7ti_7_-RWXNCNgk';
const EMAIL = 'soulaimaneberraadi@gmail.com';
const PASSWORD = 'Admin123!';

const db = new Database(DB_PATH, { readonly: true });

const safe = (sql) => {
  try { return db.prepare(sql).all(); } catch (e) { return []; }
};

const tables = safe(`SELECT name FROM sqlite_master WHERE type='table'`).map(r => r.name);
console.log(`📦 Tables disponibles: ${tables.join(', ')}\n`);

// Charger toutes les tables intéressantes
const models = safe('SELECT * FROM models');
const planningEvents = safe('SELECT * FROM planning_events');
const suiviData = safe('SELECT * FROM suivi_data');
const posteSuivi = safe('SELECT * FROM poste_suivi');
const workers = safe('SELECT * FROM workers');
const workerSkills = safe('SELECT * FROM worker_skills');
const workerPointage = safe('SELECT * FROM worker_pointage');
const magasinProducts = safe('SELECT * FROM magasin_products');
const magasinLots = safe('SELECT * FROM magasin_lots');
const magasinMouvements = safe('SELECT * FROM magasin_mouvements');
const magasinCommandes = safe('SELECT * FROM magasin_commandes');
const magasinDemandes = safe('SELECT * FROM magasin_demandes');
const demandesAppro = safe('SELECT * FROM demandes_appro');
const appSettings = safe('SELECT * FROM app_settings');
const hrWorkers = safe('SELECT * FROM hr_workers');
const hrPointage = safe('SELECT * FROM hr_pointage');
const hrProduction = safe('SELECT * FROM hr_production');
const hrAvances = safe('SELECT * FROM hr_avances');

console.log('📊 Counts:');
const counts = {
  models: models.length,
  planningEvents: planningEvents.length,
  suiviData: suiviData.length,
  posteSuivi: posteSuivi.length,
  workers: workers.length,
  workerSkills: workerSkills.length,
  workerPointage: workerPointage.length,
  magasinProducts: magasinProducts.length,
  magasinLots: magasinLots.length,
  magasinMouvements: magasinMouvements.length,
  magasinCommandes: magasinCommandes.length,
  magasinDemandes: magasinDemandes.length,
  demandesAppro: demandesAppro.length,
  appSettings: appSettings.length,
  hrWorkers: hrWorkers.length,
  hrPointage: hrPointage.length,
  hrProduction: hrProduction.length,
  hrAvances: hrAvances.length,
};
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(20)} ${v}`);

// Helper: parse JSON fields if present
const parseJsonFields = (row) => {
  if (!row) return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
      try { out[k] = JSON.parse(v); } catch {}
    }
  }
  return out;
};

const extractModelData = (rows) =>
  rows.map((row) => {
    if (!row) return row;
    const raw = row.data;
    if (typeof raw === 'string' && raw.length > 0) {
      try { return JSON.parse(raw); } catch {}
    }
    return parseJsonFields(row);
  });

const extractRawData = (rows) =>
  rows.map((row) => {
    if (!row) return row;
    const raw = row.raw_data;
    if (typeof raw === 'string' && raw.length > 0) {
      try { return JSON.parse(raw); } catch {}
    }
    return parseJsonFields(row);
  });

// Construire le snapshot localStorage attendu par l'app
const snapshot = {
  beramethode_library: extractModelData(models),
  beramethode_planning: extractRawData(planningEvents),
  beramethode_suivis: extractRawData(suiviData),
  beramethode_demandesAppro: demandesAppro.map(parseJsonFields),
  beramethode_settings: appSettings.length === 1 ? parseJsonFields(appSettings[0]) : appSettings.map(parseJsonFields),
  // Données serveur converties en arrays pour usage côté client
  __sqlite_export__: {
    exported_at: new Date().toISOString(),
    counts,
    workers: workers.map(parseJsonFields),
    workerSkills: workerSkills.map(parseJsonFields),
    workerPointage: workerPointage.map(parseJsonFields),
    posteSuivi: posteSuivi.map(parseJsonFields),
    magasin: {
      products: magasinProducts.map(parseJsonFields),
      lots: magasinLots.map(parseJsonFields),
      mouvements: magasinMouvements.map(parseJsonFields),
      commandes: magasinCommandes.map(parseJsonFields),
      demandes: magasinDemandes.map(parseJsonFields),
    },
    hr: {
      workers: hrWorkers.map(parseJsonFields),
      pointage: hrPointage.map(parseJsonFields),
      production: hrProduction.map(parseJsonFields),
      avances: hrAvances.map(parseJsonFields),
    },
  },
};

db.close();

// ─── Login + upsert vers Supabase ───────────────────────────────────────────
console.log('\n🔐 Login Supabase...');
const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error('❌ Login failed:', loginRes.status, await loginRes.text());
  process.exit(1);
}
const { access_token, user } = await loginRes.json();
console.log(`✅ Logged in as ${user.email} (id=${user.id})`);

console.log(`\n☁️  Pushing snapshot to Supabase... (${JSON.stringify(snapshot).length.toLocaleString()} chars)`);
const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${access_token}`,
    Prefer: 'resolution=merge-duplicates',
  },
  body: JSON.stringify({ user_id: user.id, data: snapshot, updated_at: new Date().toISOString() }),
});
if (!upsertRes.ok) {
  console.error('❌ Upsert failed:', upsertRes.status, await upsertRes.text());
  process.exit(1);
}
console.log('✅ Snapshot synced to Supabase!');
console.log(`\n🌐 Ouvre https://beramethode-1.vercel.app et reconnecte-toi — les données suivront.`);
