import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

// في الإنتاج (Electron): يمرّر main.ts هذا المسار عبر env variable BERA_DB_PATH
// في التطوير: يستخدم process.cwd() كاحتياطي
const dbPath = process.env.BERA_DB_PATH || path.join(process.cwd(), 'database.sqlite');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

// ⚡ OPTIMISATIONS SQLITE (Performances & Intégrité)
db.pragma('journal_mode = WAL'); // Write-Ahead Logging (Meilleure concurrence)
db.pragma('synchronous = NORMAL'); // Équilibre entre sécurité et rapidité
db.pragma('foreign_keys = ON'); // Activation obligatoire des contraintes de clés étrangères
db.pragma('cache_size = -10000'); // Un cache de 10Mo environ

// Create users table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

try {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
} catch (e) {
  // column already exists
}

// Impersonation / BERA MASTER audit table (security & compliance).
// IMPORTANT : table SÉPARÉE de `system_audit_logs` (défini plus bas, schéma
// "AI-ready" : table_name/record_id/old_data...). Les deux portaient le même
// nom → sur une DB NEUVE, ce CREATE gagnait puis l'index `idx_audit_table` sur
// `table_name` (colonne absente de ce schéma) plantait l'init → Setup wizard
// cassé. Renommé en `impersonation_audit_logs` pour lever la collision.
db.exec(`
  CREATE TABLE IF NOT EXISTS impersonation_audit_logs (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    target_user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    via_impersonation INTEGER DEFAULT 0,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Default guest account — created only if it doesn't exist.
// ⚠️ SECURITY: Password is NOT forced/reset on startup to prevent overriding admin changes.
try {
  const GUEST_PASSWORD_HASH =
    '$2b$10$GcezDlouVCyPOWHj3UHnf.tNKX8HjlcUA7yO33Tb1aAvkmMUwzGna';
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, password, name, role) VALUES (1, 'guest@local', ?, 'Guest', 'user')`
  ).run(GUEST_PASSWORD_HASH);
  // Ensure guest is never admin (safety net)
  db.prepare(`UPDATE users SET role = 'user' WHERE email = 'guest@local' AND role = 'admin'`).run();
} catch (e) {}

// Create models table
db.exec(`
  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  )
`);

// Create verification_codes table
db.exec(`
  CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create Magasin Tables (Centralized Inventory)
db.exec(`
  CREATE TABLE IF NOT EXISTS magasin_products (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    reference TEXT NOT NULL,
    designation TEXT NOT NULL,
    categorie TEXT NOT NULL,
    unite TEXT NOT NULL,
    photo TEXT,
    fournisseurNom TEXT,
    fournisseurTel TEXT,
    fournisseurEmail TEXT,
    chaineExclusive TEXT,
    emplacement TEXT,
    prixUnitaire REAL DEFAULT 0,
    cump REAL DEFAULT 0,
    stockAlerte INTEGER DEFAULT 0,
    fournisseurAdresse TEXT,
    fournisseurIce TEXT,
    fournisseurRc TEXT,
    fournisseurConditionsPaiement TEXT,
    fournisseurDelaiLivraisonJours INTEGER,
    fournisseurMoq REAL,
    fournisseurDevise TEXT,
    fournisseurContact TEXT,
    fournisseurNotes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS magasin_lots (
    id TEXT PRIMARY KEY,
    productId TEXT NOT NULL,
    quantiteRestante REAL NOT NULL,
    quantiteInitiale REAL NOT NULL,
    prixUnitaire REAL NOT NULL,
    dateEntree TEXT NOT NULL,
    fournisseur TEXT,
    numBain TEXT,
    dateExpiration TEXT,
    variante TEXT,
    etat TEXT DEFAULT 'disponible',
    FOREIGN KEY (productId) REFERENCES magasin_products (id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS magasin_mouvements (
    id TEXT PRIMARY KEY,
    productId TEXT NOT NULL,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    destination TEXT NOT NULL,
    quantite REAL NOT NULL,
    prixUnitaire REAL,
    fournisseurId TEXT,
    chaineId TEXT,
    modeleRef TEXT,
    date TEXT NOT NULL,
    operateurNom TEXT,
    notes TEXT,
    lotId TEXT,
    bain TEXT,
    documentRef TEXT,
    pieceJointe TEXT,
    FOREIGN KEY (productId) REFERENCES magasin_products (id) ON DELETE CASCADE
  )
`);

// MIGRATIONS
try { db.prepare("ALTER TABLE magasin_mouvements ADD COLUMN documentRef TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE magasin_mouvements ADD COLUMN pieceJointe TEXT").run(); } catch(e) {}

try { db.prepare("ALTER TABLE magasin_products ADD COLUMN fournisseurAdresse TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE magasin_products ADD COLUMN fournisseurIce TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE magasin_products ADD COLUMN fournisseurRc TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE magasin_products ADD COLUMN fournisseurConditionsPaiement TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE magasin_products ADD COLUMN fournisseurDelaiLivraisonJours INTEGER").run(); } catch(e) {}
try { db.prepare("ALTER TABLE magasin_products ADD COLUMN fournisseurMoq REAL").run(); } catch(e) {}
try { db.prepare("ALTER TABLE magasin_products ADD COLUMN fournisseurDevise TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE magasin_products ADD COLUMN fournisseurContact TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE magasin_products ADD COLUMN fournisseurNotes TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE magasin_products ADD COLUMN fournisseurLogo TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE magasin_lots ADD COLUMN quantiteReservee REAL DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE planning_events ADD COLUMN isSubcontracted INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE planning_events ADD COLUMN subcontractorName TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE planning_events ADD COLUMN subcontractStatus TEXT DEFAULT 'PENDING'").run(); } catch(e) {}

// CREATE SETTINGS TABLE (multi-tenant: composite PK)
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    owner_id INTEGER NOT NULL DEFAULT 1,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (owner_id, key),
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
  )
`);

// Migrate legacy app_settings (single-column PK on key) → composite (owner_id, key)
try {
  const meta = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='app_settings'`)
    .get() as { sql: string } | undefined;
  if (meta?.sql && !/PRIMARY\s+KEY\s*\(\s*owner_id\s*,\s*key\s*\)/i.test(meta.sql)) {
    const tx = db.transaction(() => {
      db.exec(`
        CREATE TABLE app_settings__new (
          owner_id INTEGER NOT NULL DEFAULT 1,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (owner_id, key),
          FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);
      db.prepare(
        `INSERT OR REPLACE INTO app_settings__new (owner_id, key, value) SELECT COALESCE(owner_id, 1), key, value FROM app_settings`
      ).run();
      db.exec(`DROP TABLE app_settings`);
      db.exec(`ALTER TABLE app_settings__new RENAME TO app_settings`);
    });
    tx();
  }
} catch (e) {
  console.error('app_settings migration:', e);
}

// Create Magasin: Bons de Commande Table
db.exec(`
  CREATE TABLE IF NOT EXISTS magasin_commandes (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    numero TEXT NOT NULL,
    fournisseurNom TEXT NOT NULL,
    dateCreation TEXT NOT NULL,
    dateLivraisonPrevue TEXT,
    total REAL,
    statut TEXT NOT NULL,
    lignes TEXT, -- JSON array of items
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
  )
`);

// Create Magasin: Demandes Atelier Table
db.exec(`
  CREATE TABLE IF NOT EXISTS magasin_demandes (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    modelId TEXT NOT NULL,
    chaineId TEXT,
    produitDesignation TEXT NOT NULL,
    quantiteDemandee REAL NOT NULL,
    notes TEXT,
    dateDemande TEXT NOT NULL,
    demandeur TEXT NOT NULL,
    statut TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
  )
`);

// PHASE 1 New Tables (planning, suivi, demandes)
db.exec(`
CREATE TABLE IF NOT EXISTS planning_events (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  modelId TEXT NOT NULL,
  chaineId TEXT NOT NULL,
  dateLancement TEXT NOT NULL,
  dateExport TEXT NOT NULL,
  qteTotal INTEGER NOT NULL,
  qteProduite INTEGER DEFAULT 0,
  status TEXT NOT NULL,
  blockedReason TEXT,
  superviseur TEXT,
  strictDeadline_DDS TEXT,
  clientName TEXT,
  estimatedEndDate TEXT,
  modelName TEXT,
  sectionSplitEnabled INTEGER DEFAULT 0,
  fournisseurId TEXT,
  fournisseurDate TEXT,
  prepStart TEXT,
  prepEnd TEXT,
  montageStart TEXT,
  montageEnd TEXT,
  lots_data TEXT,
  raw_data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS suivi_data (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  planningId TEXT NOT NULL,
  modelId TEXT,
  chaineId TEXT,
  date TEXT NOT NULL,
  entrer INTEGER DEFAULT 0,
  sorties_json TEXT,
  totalHeure INTEGER DEFAULT 0,
  pJournaliere INTEGER DEFAULT 400,
  enCour INTEGER DEFAULT 0,
  resteEntrer INTEGER DEFAULT 0,
  resteSortie INTEGER DEFAULT 0,
  totalWorkers INTEGER DEFAULT 0,
  absent INTEGER DEFAULT 0,
  trs REAL,
  activeSection TEXT,
  created_by TEXT,
  source TEXT DEFAULT 'PLANNING',
  raw_data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (planningId) REFERENCES planning_events(id) ON DELETE CASCADE,
  UNIQUE(planningId, date)
);

CREATE TABLE IF NOT EXISTS demandes_appro (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  dateDemande TEXT NOT NULL,
  modelId TEXT NOT NULL,
  chaineId TEXT NOT NULL,
  produitDesignation TEXT NOT NULL,
  quantiteDemandee REAL NOT NULL,
  demandeur TEXT,
  notes TEXT,
  statut TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS planning_reservations (
  id TEXT PRIMARY KEY,
  planningId TEXT NOT NULL,
  productId TEXT NOT NULL,
  lotId TEXT NOT NULL,
  quantite REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (planningId) REFERENCES planning_events(id) ON DELETE CASCADE,
  FOREIGN KEY (lotId) REFERENCES magasin_lots(id) ON DELETE CASCADE
);
`);

// PHASE 4 — Suivi Redesign + Postes Tracking
db.exec(`
CREATE TABLE IF NOT EXISTS poste_suivi (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  planningId TEXT NOT NULL,
  modelId TEXT NOT NULL,
  posteId TEXT NOT NULL,
  workerId TEXT,
  date TEXT NOT NULL,
  heure_debut TEXT,
  heure_fin TEXT,
  pieces_entrees INTEGER DEFAULT 0,
  pieces_sorties INTEGER DEFAULT 0,
  pieces_defaut INTEGER DEFAULT 0,
  temps_reel_par_piece REAL,
  temps_prevu_par_piece REAL,
  notes TEXT,
  problemes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(planningId, posteId, date)
);
`);

// PHASE 5 — Effectifs: Workers + Skills + Pointage
db.exec(`
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  matricule TEXT NOT NULL,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  cin TEXT,
  cnss TEXT,
  phone TEXT,
  date_naissance TEXT,
  adresse TEXT,
  photo TEXT,
  date_embauche TEXT NOT NULL,
  type_contrat TEXT DEFAULT 'CDI',
  date_fin_contrat TEXT,
  is_active INTEGER DEFAULT 1,
  hidden_from_societes TEXT,
  notes TEXT,
  comments TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(owner_id, matricule)
);

CREATE TABLE IF NOT EXISTS worker_skills (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  worker_id TEXT NOT NULL,
  poste_keyword TEXT NOT NULL,
  fabric_type TEXT,
  level TEXT NOT NULL,
  source TEXT DEFAULT 'AUTO',
  pieces_total INTEGER DEFAULT 0,
  pieces_per_hour_avg REAL,
  quality_rate REAL,
  last_worked_date TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  UNIQUE(worker_id, poste_keyword, fabric_type)
);

CREATE TABLE IF NOT EXISTS worker_pointage (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  worker_id TEXT NOT NULL,
  date TEXT NOT NULL,
  chaine TEXT,
  poste_assigned TEXT,
  status TEXT DEFAULT 'PRESENT',
  heure_entree TEXT,
  heure_sortie TEXT,
  heures_travaillees REAL,
  heures_supp_25 REAL DEFAULT 0,
  heures_supp_50 REAL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  UNIQUE(worker_id, date)
);
`);

// PHASE 6 — Suivi Next-Gen: hourly effectif, downtime codes, scrap, comments
db.exec(`
CREATE TABLE IF NOT EXISTS suivi_effectif_horaire (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  suivi_id TEXT NOT NULL,
  chaineId TEXT NOT NULL,
  modelId TEXT,
  date TEXT NOT NULL,
  heure_debut TEXT NOT NULL,
  heure_fin TEXT NOT NULL,
  worker_id TEXT,
  poste TEXT,
  type_poste TEXT NOT NULL DEFAULT 'MANUEL',
  is_present INTEGER NOT NULL DEFAULT 1,
  join_minute INTEGER,
  leave_minute INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(suivi_id, worker_id, heure_debut)
);
CREATE INDEX IF NOT EXISTS idx_seh_lookup ON suivi_effectif_horaire(chaineId, date);
CREATE INDEX IF NOT EXISTS idx_seh_model ON suivi_effectif_horaire(modelId, date);

CREATE TABLE IF NOT EXISTS downtime_codes (
  code TEXT PRIMARY KEY,
  label_fr TEXT NOT NULL,
  label_ar TEXT,
  color TEXT DEFAULT '#ef4444',
  is_planned INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

INSERT OR IGNORE INTO downtime_codes (code, label_fr, label_ar, color, is_planned) VALUES
  ('PANNE_MACHINE', 'Panne machine', 'عطل آلة', '#dc2626', 0),
  ('MANQUE_MATIERE', 'Manque matière', 'نقص المادة', '#f59e0b', 0),
  ('PAUSE', 'Pause planifiée', 'استراحة', '#64748b', 1),
  ('CHANGEMENT_SERIE', 'Changement de série', 'تغيير الموديل', '#8b5cf6', 1),
  ('QUALITE', 'Problème qualité', 'مشكل جودة', '#ec4899', 0),
  ('ABSENCE', 'Absence ouvrier', 'غياب عامل', '#ef4444', 0),
  ('FORMATION', 'Formation', 'تكوين', '#06b6d4', 1),
  ('AUTRE', 'Autre', 'أخرى', '#475569', 0);
`);

// ── TABLES SUIVI ──────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS suivi_sorties_horaires (
  id TEXT PRIMARY KEY,
  suivi_id TEXT NOT NULL,
  heure_key TEXT NOT NULL,
  quantite INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (suivi_id) REFERENCES suivi_data(id) ON DELETE CASCADE,
  UNIQUE(suivi_id, heure_key)
);

CREATE TABLE IF NOT EXISTS suivi_effectifs (
  id TEXT PRIMARY KEY,
  suivi_id TEXT NOT NULL,
  role TEXT NOT NULL,
  nombre INTEGER DEFAULT 0,
  tag_texte TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (suivi_id) REFERENCES suivi_data(id) ON DELETE CASCADE,
  UNIQUE(suivi_id, role)
);

CREATE TABLE IF NOT EXISTS suivi_defauts (
  id TEXT PRIMARY KEY,
  suivi_id TEXT NOT NULL,
  heure TEXT NOT NULL,
  type TEXT NOT NULL,
  quantite INTEGER NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (suivi_id) REFERENCES suivi_data(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS suivi_downtimes (
  id TEXT PRIMARY KEY,
  suivi_id TEXT NOT NULL,
  code TEXT NOT NULL,
  duree_minutes INTEGER DEFAULT 0,
  heure_debut TEXT,
  heure_fin TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (suivi_id) REFERENCES suivi_data(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS suivi_comments (
  id TEXT PRIMARY KEY,
  suivi_id TEXT NOT NULL,
  auteur TEXT,
  texte TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (suivi_id) REFERENCES suivi_data(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS suivi_sections (
  id TEXT PRIMARY KEY,
  suivi_id TEXT NOT NULL,
  section TEXT NOT NULL,
  effectif INTEGER DEFAULT 0,
  output INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (suivi_id) REFERENCES suivi_data(id) ON DELETE CASCADE,
  UNIQUE(suivi_id, section)
);
`);

// Extend suivi_data with scrap / downtime / comments / metadata (idempotent)
const suiviExtraCols: Array<[string, string]> = [
  ['scrap_details', 'TEXT'],
  ['downtime_events', 'TEXT'],
  ['comments', 'TEXT'],
  ['created_by', 'TEXT'],
  ['modelId', 'TEXT'],
  ['chaineId', 'TEXT'],
  ['source', 'TEXT'],
];
for (const [col, type] of suiviExtraCols) {
  try {
    db.prepare(`ALTER TABLE suivi_data ADD COLUMN ${col} ${type}`).run();
  } catch (e) { /* column exists — ignore */ }
}

// Create Magasin: Déchets Table
db.exec(`
  CREATE TABLE IF NOT EXISTS magasin_dechets (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    type_dechet TEXT NOT NULL,
    quantite REAL NOT NULL,
    unite TEXT NOT NULL,
    source TEXT NOT NULL,
    date_declaration TEXT NOT NULL,
    valeur_estimee REAL NOT NULL,
    notes TEXT,
    statut TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
  )
`);


// PHASE 5 — HR Full Module (RH Complet + Sage Paie)
db.exec(`
CREATE TABLE IF NOT EXISTS hr_workers (
  id TEXT PRIMARY KEY,
  matricule TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  cin TEXT UNIQUE,
  cnss TEXT,
  phone TEXT,
  date_naissance TEXT,
  adresse TEXT,
  photo TEXT,
  sexe TEXT DEFAULT 'M',
  role TEXT NOT NULL DEFAULT 'OPERATOR',
  chaine_id TEXT,
  poste TEXT,
  specialite TEXT,
  equipe TEXT,
  date_embauche TEXT NOT NULL,
  type_contrat TEXT DEFAULT 'CDI',
  date_fin_contrat TEXT,
  date_renouvellement TEXT,
  is_active INTEGER DEFAULT 1,
  contact_urgence_nom TEXT,
  contact_urgence_tel TEXT,
  contact_urgence_lien TEXT,
  pointeuse_id TEXT,
  pointeuse_device TEXT,
  pointeuse_type TEXT DEFAULT 'MANUAL',
  salaire_base REAL DEFAULT 0,
  taux_horaire REAL DEFAULT 0,
  taux_piece REAL DEFAULT 0,
  prime_assiduite REAL DEFAULT 0,
  prime_transport REAL DEFAULT 0,
  mode_paiement TEXT DEFAULT 'VIREMENT',
  notes TEXT,
  owner_id INTEGER NOT NULL DEFAULT 1,
  hidden_from_societes TEXT,
  synced_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hr_pointage (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  date TEXT NOT NULL,
  heure_entree TEXT,
  heure_sortie TEXT,
  pause_debut TEXT,
  pause_fin TEXT,
  source TEXT DEFAULT 'MANUAL',
  heures_travaillees REAL DEFAULT 0,
  heures_normales REAL DEFAULT 0,
  heures_supp_25 REAL DEFAULT 0,
  heures_supp_50 REAL DEFAULT 0,
  statut TEXT DEFAULT 'PRESENT',
  motif_absence TEXT,
  is_validated INTEGER DEFAULT 0,
  validated_by TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (worker_id) REFERENCES hr_workers (id) ON DELETE CASCADE,
  UNIQUE(worker_id, date)
);

CREATE TABLE IF NOT EXISTS hr_production (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  date TEXT NOT NULL,
  chaine_id TEXT,
  model_ref TEXT,
  pieces_produites INTEGER DEFAULT 0,
  pieces_defaut INTEGER DEFAULT 0,
  pieces_retouchees INTEGER DEFAULT 0,
  taux_qualite REAL,
  rendement REAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (worker_id) REFERENCES hr_workers (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hr_avances (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  date_demande TEXT NOT NULL,
  montant REAL NOT NULL,
  montant_approuve REAL,
  montant_rembourse REAL DEFAULT 0,
  solde_restant REAL DEFAULT 0,
  nb_echeances INTEGER DEFAULT 1,
  mois_debut_deduction TEXT,
  statut TEXT DEFAULT 'DEMANDE',
  approuve_par TEXT,
  date_approbation TEXT,
  motif TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (worker_id) REFERENCES hr_workers (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hr_sage_exports (
  id TEXT PRIMARY KEY,
  mois TEXT NOT NULL,
  date_export TEXT NOT NULL,
  nb_salaries INTEGER,
  total_salaire_base REAL,
  total_heures_supp REAL,
  total_primes REAL,
  total_avances REAL,
  total_brut REAL,
  total_net REAL,
  fichier_nom TEXT,
  fichier_data TEXT,
  owner_id INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_transport_lignes (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  chauffeur_nom TEXT,
  chauffeur_tel TEXT,
  matricule_vehicule TEXT,
  capacite INTEGER DEFAULT 0,
  notes TEXT,
  owner_id INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// HR — bases créées avant l’ajout de colonnes : CREATE IF NOT EXISTS ne met pas à jour le schéma.
// Sans cela, getHRWorkerDossier / pointage peuvent lever SQLITE_ERROR au démarrage des requêtes.
const hrAddCol = (sql: string) => {
  try {
    db.prepare(sql).run();
  } catch {
    /* colonne déjà présente ou table absente */
  }
};
hrAddCol('ALTER TABLE hr_workers ADD COLUMN hidden_from_societes TEXT');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN synced_at DATETIME');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN pointeuse_device TEXT');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN pointeuse_type TEXT DEFAULT \'MANUAL\'');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN taux_piece REAL DEFAULT 0');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN mode_paiement TEXT DEFAULT \'VIREMENT\'');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN notes TEXT');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN contact_urgence_nom TEXT');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN contact_urgence_tel TEXT');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN contact_urgence_lien TEXT');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN pointeuse_id TEXT');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN pin_hash TEXT');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN equipe TEXT');
hrAddCol('ALTER TABLE hr_workers ADD COLUMN transport_ligne_id TEXT');
hrAddCol('ALTER TABLE hr_transport_lignes ADD COLUMN code_ligne TEXT');
hrAddCol('ALTER TABLE hr_transport_lignes ADD COLUMN quartier TEXT');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN heure_entree TEXT');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN heure_sortie TEXT');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN pause_debut TEXT');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN pause_fin TEXT');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN source TEXT DEFAULT \'MANUAL\'');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN heures_travaillees REAL DEFAULT 0');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN heures_normales REAL DEFAULT 0');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN heures_supp_25 REAL DEFAULT 0');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN heures_supp_50 REAL DEFAULT 0');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN statut TEXT DEFAULT \'PRESENT\'');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN motif_absence TEXT');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN is_validated INTEGER DEFAULT 0');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN validated_by TEXT');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN notes TEXT');
hrAddCol('ALTER TABLE hr_pointage ADD COLUMN grille_presence TEXT');
hrAddCol('ALTER TABLE hr_production ADD COLUMN chaine_id TEXT');
hrAddCol('ALTER TABLE hr_production ADD COLUMN model_ref TEXT');
hrAddCol('ALTER TABLE hr_production ADD COLUMN pieces_produites INTEGER DEFAULT 0');
hrAddCol('ALTER TABLE hr_production ADD COLUMN pieces_defaut INTEGER DEFAULT 0');
hrAddCol('ALTER TABLE hr_production ADD COLUMN pieces_retouchees INTEGER DEFAULT 0');
hrAddCol('ALTER TABLE hr_production ADD COLUMN taux_qualite REAL');
hrAddCol('ALTER TABLE hr_production ADD COLUMN rendement REAL');
hrAddCol('ALTER TABLE hr_production ADD COLUMN notes TEXT');
hrAddCol('ALTER TABLE hr_avances ADD COLUMN montant_approuve REAL');
hrAddCol('ALTER TABLE hr_avances ADD COLUMN montant_rembourse REAL DEFAULT 0');
hrAddCol('ALTER TABLE hr_avances ADD COLUMN solde_restant REAL DEFAULT 0');
hrAddCol('ALTER TABLE hr_avances ADD COLUMN nb_echeances INTEGER DEFAULT 1');
hrAddCol('ALTER TABLE hr_avances ADD COLUMN mois_debut_deduction TEXT');
hrAddCol('ALTER TABLE hr_avances ADD COLUMN statut TEXT DEFAULT \'DEMANDE\'');
hrAddCol('ALTER TABLE hr_avances ADD COLUMN approuve_par TEXT');
hrAddCol('ALTER TABLE hr_avances ADD COLUMN date_approbation TEXT');
hrAddCol('ALTER TABLE hr_avances ADD COLUMN motif TEXT');
hrAddCol('ALTER TABLE hr_avances ADD COLUMN notes TEXT');
hrAddCol('ALTER TABLE hr_sage_exports ADD COLUMN owner_id INTEGER NOT NULL DEFAULT 1');

// Create Production Tables for SuiviLive and Analysis
db.exec(`
  CREATE TABLE IF NOT EXISTS production_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'stop',
    progress INTEGER DEFAULT 0,
    efficiency INTEGER DEFAULT 0,
    model TEXT DEFAULT '---',
    operator INTEGER DEFAULT 0,
    alert BOOLEAN DEFAULT 0,
    alertMsg TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS production_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    name TEXT NOT NULL, 
    output INTEGER DEFAULT 0,
    target INTEGER DEFAULT 0,
    efficiency INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Insert default lines if empty
try {
  const lineCount = db.prepare('SELECT COUNT(*) as count FROM production_lines').get() as { count: number };
  if (lineCount.count === 0) {
    db.prepare("INSERT INTO production_lines (name, status, progress, efficiency, model, operator, alert, alertMsg) VALUES ('CHAINE A', 'prod', 78, 94, 'POLO M/C', 12, 0, '')").run();
    db.prepare("INSERT INTO production_lines (name, status, progress, efficiency, model, operator, alert, alertMsg) VALUES ('CHAINE B', 'prod', 45, 88, 'VESTE SLIM', 18, 1, 'Rupture Fil')").run();
    db.prepare("INSERT INTO production_lines (name, status, progress, efficiency, model, operator, alert, alertMsg) VALUES ('CHAINE C', 'prod', 92, 97, 'CHEMISE CL', 10, 0, '')").run();
    db.prepare("INSERT INTO production_lines (name, status, progress, efficiency, model, operator, alert, alertMsg) VALUES ('CHAINE D', 'stop', 0, 0, '---', 0, 0, '')").run();
    db.prepare("INSERT INTO production_lines (name, status, progress, efficiency, model, operator, alert, alertMsg) VALUES ('CHAINE E', 'setup', 15, 55, 'JUPE MIDI', 8, 0, '')").run();
    db.prepare("INSERT INTO production_lines (name, status, progress, efficiency, model, operator, alert, alertMsg) VALUES ('CHAINE F', 'prod', 62, 91, 'VESTE JEAN', 15, 0, '')").run();
    
    // Seed some daily data
    db.prepare("INSERT INTO production_daily (date, name, output, target, efficiency) VALUES ('2026-04-06', 'Lun', 400, 500, 80)").run();
    db.prepare("INSERT INTO production_daily (date, name, output, target, efficiency) VALUES ('2026-04-07', 'Mar', 520, 500, 104)").run();
    db.prepare("INSERT INTO production_daily (date, name, output, target, efficiency) VALUES ('2026-04-08', 'Mer', 480, 500, 96)").run();
    db.prepare("INSERT INTO production_daily (date, name, output, target, efficiency) VALUES ('2026-04-09', 'Jeu', 610, 500, 122)").run();
    db.prepare("INSERT INTO production_daily (date, name, output, target, efficiency) VALUES ('2026-04-10', 'Ven', 550, 500, 110)").run();
    db.prepare("INSERT INTO production_daily (date, name, output, target, efficiency) VALUES ('2026-04-11', 'Sam', 300, 400, 75)").run();
  }
} catch(e) {}

// CREATE SUBCONTRACT ORDERS TABLE
db.exec(`
  CREATE TABLE IF NOT EXISTS subcontract_orders (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    modelId TEXT NOT NULL,
    modelName TEXT,
    clientName TEXT,
    totalQuantity INTEGER NOT NULL,
    subcontractorName TEXT NOT NULL,
    pricePerPiece REAL DEFAULT 0,
    deliveryDate TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    sizes_json TEXT,
    colors_json TEXT,
    notes TEXT,
    subcontractorPhone TEXT,
    subcontractorRating REAL DEFAULT 5,
    subcontractorAvailabilityDate TEXT,
    prestationType TEXT DEFAULT 'CMT',
    tissuFournisseur TEXT DEFAULT 'CLIENT',
    fournituresFournisseur TEXT DEFAULT 'CLIENT',
    conditionnementFournisseur TEXT DEFAULT 'CLIENT',
    protoRequired INTEGER DEFAULT 1,
    protoStatus TEXT DEFAULT 'PENDING',
    paymentTerms TEXT DEFAULT 'AVANCE_RECEPTION',
    defectRateAccepted REAL DEFAULT 1.5,
    stitchingDetails TEXT,
    specifications_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS subcontractor_groups (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    group_name TEXT NOT NULL,
    subcontractor_names TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// 🚀 CRÉATION DES INDEX POUR OPTIMISER LES PERFORMANCES (Lectures / Jointures)
db.exec(`
  -- Index généraux
  CREATE INDEX IF NOT EXISTS idx_models_user ON models(user_id);
  
  -- Index Magasin
  CREATE INDEX IF NOT EXISTS idx_magasin_products_owner ON magasin_products(owner_id);
  CREATE INDEX IF NOT EXISTS idx_magasin_lots_product ON magasin_lots(productId);
  CREATE INDEX IF NOT EXISTS idx_magasin_mouv_product ON magasin_mouvements(productId);
  CREATE INDEX IF NOT EXISTS idx_magasin_mouv_date ON magasin_mouvements(date);

  -- Index Production & Planification
  CREATE INDEX IF NOT EXISTS idx_planning_events_owner ON planning_events(owner_id);
  CREATE INDEX IF NOT EXISTS idx_suivi_data_planning ON suivi_data(planningId, date);
  CREATE INDEX IF NOT EXISTS idx_suivi_data_owner ON suivi_data(owner_id);
  CREATE INDEX IF NOT EXISTS idx_suivi_data_date ON suivi_data(date);
  CREATE INDEX IF NOT EXISTS idx_suivi_data_model ON suivi_data(modelId, date);
  CREATE INDEX IF NOT EXISTS idx_suivi_data_chaine ON suivi_data(chaineId, date);
  CREATE INDEX IF NOT EXISTS idx_poste_suivi_planning ON poste_suivi(planningId, posteId, date);

  -- Index Suivi Tables
  CREATE INDEX IF NOT EXISTS idx_suivi_sorties_suivi ON suivi_sorties_horaires(suivi_id);
  CREATE INDEX IF NOT EXISTS idx_suivi_effectifs_suivi ON suivi_effectifs(suivi_id);
  CREATE INDEX IF NOT EXISTS idx_suivi_defauts_suivi ON suivi_defauts(suivi_id);
  CREATE INDEX IF NOT EXISTS idx_suivi_downtimes_suivi ON suivi_downtimes(suivi_id);
  CREATE INDEX IF NOT EXISTS idx_suivi_comments_suivi ON suivi_comments(suivi_id);
  CREATE INDEX IF NOT EXISTS idx_suivi_sections_suivi ON suivi_sections(suivi_id);

  -- Index Workers (Standard)
  CREATE INDEX IF NOT EXISTS idx_workers_owner ON workers(owner_id);
  CREATE INDEX IF NOT EXISTS idx_worker_pointage_lookup ON worker_pointage(worker_id, date);

  -- Index HR (Avancé)
  CREATE INDEX IF NOT EXISTS idx_hr_workers_matricule ON hr_workers(matricule);
  CREATE INDEX IF NOT EXISTS idx_hr_workers_cin ON hr_workers(cin);
  CREATE INDEX IF NOT EXISTS idx_hr_workers_chaine ON hr_workers(chaine_id);
  CREATE INDEX IF NOT EXISTS idx_hr_pointage_worker_date ON hr_pointage(worker_id, date);
  CREATE INDEX IF NOT EXISTS idx_hr_production_worker_date ON hr_production(worker_id, date);
  CREATE INDEX IF NOT EXISTS idx_hr_avances_worker ON hr_avances(worker_id);
  CREATE INDEX IF NOT EXISTS idx_hr_sage_owner ON hr_sage_exports(owner_id, mois);
`);

// ============================================================================
// SECTION 23 — Identité plateforme (person_id) + invitations (T23.1 / T23.2)
// ============================================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS platform_person (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS hr_worker_person (
    person_id TEXT NOT NULL,
    hr_worker_id TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (hr_worker_id),
    FOREIGN KEY (person_id) REFERENCES platform_person(id) ON DELETE RESTRICT,
    FOREIGN KEY (hr_worker_id) REFERENCES hr_workers(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_hr_worker_person_person ON hr_worker_person(person_id);
  CREATE INDEX IF NOT EXISTS idx_hr_worker_person_owner ON hr_worker_person(owner_id);

  CREATE TABLE IF NOT EXISTS hr_invitation (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    person_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    proposed_matricule TEXT NOT NULL,
    proposed_full_name TEXT NOT NULL,
    proposed_cin TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES platform_person(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_hr_invitation_token ON hr_invitation(token);
  CREATE INDEX IF NOT EXISTS idx_hr_invitation_owner_status ON hr_invitation(owner_id, status);
`);

try {
  const orphans = db
    .prepare(
      `SELECT w.id AS wid, w.owner_id AS oid
       FROM hr_workers w
       WHERE NOT EXISTS (SELECT 1 FROM hr_worker_person p WHERE p.hr_worker_id = w.id)`
    )
    .all() as { wid: string; oid: number }[];
  if (orphans.length > 0) {
    const insPerson = db.prepare(`INSERT INTO platform_person (id) VALUES (?)`);
    const insLink = db.prepare(
      `INSERT OR IGNORE INTO hr_worker_person (person_id, hr_worker_id, owner_id) VALUES (?, ?, ?)`
    );
    const tx = db.transaction(() => {
      for (const row of orphans) {
        const pid = `per-${randomUUID()}`;
        insPerson.run(pid);
        insLink.run(pid, row.wid, row.oid);
      }
    });
    tx();
    console.log(`[beramethode db] platform_person backfill: ${orphans.length} lien(s) RH créé(s).`);
  }
} catch (e) {
  console.warn('[beramethode db] backfill hr_worker_person:', e);
}

// ============================================================================
// 🧠 ARCHITECTURE D'INTELLIGENCE ARTIFICIELLE (AI-READY ENVIRONMENT)
// ============================================================================

db.exec(`
  -- 1. 🛡️ AUDIT LOGS (Le cerveau de la mémoire pour l'IA)
  -- Enregistre tout ce qui se passe dans la DB (Traçabilité absolue / Data Pipelines)
  CREATE TABLE IF NOT EXISTS system_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
      record_id TEXT NOT NULL,
      old_data TEXT, -- Format JSON pour l'IA
      new_data TEXT, -- Format JSON pour l'IA
      changed_by TEXT DEFAULT 'SYSTEM',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_audit_table ON system_audit_logs(table_name, action);

  -- 2. 🤖 AI VIEWS (Vues pré-digérées pour que l'LLM puisse requêter facilement)
  -- Vue 1 : Profil de performance des employés (Idéal pour l'IA RH)
  CREATE VIEW IF NOT EXISTS ai_worker_performance_view AS
  SELECT 
      w.id AS worker_id,
      w.matricule,
      w.full_name,
      w.chaine_id,
      w.poste,
      COUNT(DISTINCT p.date) as days_present,
      SUM(p.heures_travaillees) as total_hours,
      SUM(prod.pieces_produites) as total_pieces,
      SUM(prod.pieces_defaut) as total_defects,
      CASE WHEN SUM(prod.pieces_produites) > 0 THEN 
          CAST((SUM(prod.pieces_defaut) * 100.0 / SUM(prod.pieces_produites)) AS REAL) 
      ELSE 0 END as defect_rate_percentage
  FROM hr_workers w
  LEFT JOIN hr_pointage p ON w.id = p.worker_id AND p.statut = 'PRESENT'
  LEFT JOIN hr_production prod ON w.id = prod.worker_id
  GROUP BY w.id;

  -- Vue 2 : Pipeline d'analyse de la production
  CREATE VIEW IF NOT EXISTS ai_production_overview_view AS
  SELECT 
      date,
      name as line_name,
      output as actual_output,
      target as target_output,
      efficiency,
      CASE WHEN output < target THEN 'UNDERPERFORMING_ALERT'
           WHEN output >= target THEN 'EXCEEDING_TARGET'
           ELSE 'NORMAL_FLOW' END as ai_status_flag
  FROM production_daily;

  -- 3. 🚨 SÉCURITÉ ET TRIGGERS (Smart Safeguards)
  -- Empêche formellement l'insertion de salaires négatifs
  CREATE TRIGGER IF NOT EXISTS trg_prevent_negative_salary
  BEFORE INSERT ON hr_workers
  FOR EACH ROW
  WHEN NEW.salaire_base < 0
  BEGIN
      SELECT RAISE(ABORT, 'AI_SECURITY_LOCK: Salaire de base ne peut pas etre negatif');
  END;

  -- Empêche formellement de pointer plus de 24h/jour
  CREATE TRIGGER IF NOT EXISTS trg_prevent_impossible_hours
  BEFORE INSERT ON hr_pointage
  FOR EACH ROW
  WHEN NEW.heures_travaillees > 24 OR NEW.heures_travaillees < 0
  BEGIN
      SELECT RAISE(ABORT, 'AI_ANOMALY_DETECTION: Heures travaillees invalides (>24 ou <0)');
  END;

  -- Audit au moment de la suppression d'un employé (Le système garde sa mémoire)
  CREATE TRIGGER IF NOT EXISTS trg_audit_worker_delete
  AFTER DELETE ON hr_workers
  FOR EACH ROW
  BEGIN
      INSERT INTO system_audit_logs (table_name, action, record_id, old_data, changed_by)
      VALUES ('hr_workers', 'DELETE', OLD.id, 
              '{"matricule":"' || OLD.matricule || '", "name":"' || OLD.full_name || '"}', 
              'SYSTEM_TRIGGER');
  END;
`);

// Colonnes pour l'audit applicatif (authController, middleware, etc.)
// Ajoutées via ALTER pour compatibilité avec la base existante.
try { db.exec("ALTER TABLE system_audit_logs ADD COLUMN user_id INTEGER REFERENCES users(id)"); } catch { /* colonne déjà présente */ }
try { db.exec("ALTER TABLE system_audit_logs ADD COLUMN detail TEXT"); } catch { /* colonne déjà présente */ }
try { db.exec("ALTER TABLE system_audit_logs ADD COLUMN ip TEXT"); } catch { /* colonne déjà présente */ }

// ============================================================================
// PHASE: FACTURATION (Achat, Vente, Devis, BL)
// ============================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS factures (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    numero TEXT NOT NULL UNIQUE,        
    type TEXT NOT NULL,                  -- ACHAT | VENTE | PROFORMA | AVOIR | DEVIS
    
    tiers_nom TEXT NOT NULL,
    tiers_ice TEXT,
    tiers_rc TEXT,
    tiers_if TEXT,
    tiers_adresse TEXT,
    tiers_tel TEXT,
    tiers_email TEXT,
    
    date_facture TEXT NOT NULL,
    date_echeance TEXT,
    
    total_ht REAL NOT NULL DEFAULT 0,
    taux_tva REAL DEFAULT 0,             -- TVA is optional
    total_tva REAL DEFAULT 0,
    total_ttc REAL NOT NULL DEFAULT 0,
    montant_paye REAL DEFAULT 0,
    
    devis_id TEXT,                       
    planning_id TEXT,                    
    commande_id TEXT,                    
    
    statut TEXT DEFAULT 'BROUILLON',    -- BROUILLON | ENVOYEE | PAYEE | PARTIELLEMENT | ANNULEE
    notes TEXT,
    lignes TEXT NOT NULL,                -- JSON: [{designation, qte, prix_unitaire, total}]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bons_livraison (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    numero TEXT NOT NULL UNIQUE,        
    facture_id TEXT,
    tiers_nom TEXT NOT NULL,
    date_livraison TEXT NOT NULL,
    adresse_livraison TEXT,
    transporteur TEXT,
    lignes TEXT NOT NULL,                -- JSON
    statut TEXT DEFAULT 'PREPARE',      -- PREPARE | EXPEDIE | LIVRE | RETOUR
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS paiements (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    facture_id TEXT NOT NULL,
    date_paiement TEXT NOT NULL,
    montant REAL NOT NULL,
    mode TEXT DEFAULT 'VIREMENT',       -- VIREMENT | CHEQUE | ESPECES | LCN
    reference TEXT,                      
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE
  );
  
  CREATE INDEX IF NOT EXISTS idx_factures_owner ON factures(owner_id);
  CREATE INDEX IF NOT EXISTS idx_factures_type ON factures(type);
`);

// ============================================================================
// MIGRATIONS FOR SUBCONTRACT ORDERS ADVANCED FIELDS
// ============================================================================
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN tissuStatus TEXT DEFAULT 'PENDING'");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN fournituresStatus TEXT DEFAULT 'PENDING'");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN ficheTechniqueSent INTEGER DEFAULT 0");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN qtyAccepted INTEGER DEFAULT 0");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN qtyToRepair INTEGER DEFAULT 0");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN qtyRejected INTEGER DEFAULT 0");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN subcontractorPhone TEXT");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN subcontractorRating REAL DEFAULT 5");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN subcontractorAvailabilityDate TEXT");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN prestationType TEXT DEFAULT 'CMT'");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN tissuFournisseur TEXT DEFAULT 'CLIENT'");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN fournituresFournisseur TEXT DEFAULT 'CLIENT'");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN conditionnementFournisseur TEXT DEFAULT 'CLIENT'");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN protoRequired INTEGER DEFAULT 1");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN protoStatus TEXT DEFAULT 'PENDING'");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN paymentTerms TEXT DEFAULT 'AVANCE_RECEPTION'");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN defectRateAccepted REAL DEFAULT 1.5");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN stitchingDetails TEXT");
} catch(e) {}
try {
  db.exec("ALTER TABLE subcontract_orders ADD COLUMN specifications_json TEXT");
} catch(e) {}

// ════════════════════════════════════════════════════════════════════════════════
// APS — Advanced Planning & Scheduling (Blueprint Engine) 🧠
// ════════════════════════════════════════════════════════════════════════════════

// Taux d'activité Q par chaîne (Work Sampling)
db.exec(`
  CREATE TABLE IF NOT EXISTS chain_activity_rates (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    chain_id TEXT NOT NULL,
    rate REAL NOT NULL DEFAULT 0.85,
    source TEXT DEFAULT 'MANUAL',
    sample_date TEXT,
    total_observations INTEGER,
    active_observations INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(owner_id, chain_id)
  );
`);

// Profils de courbe d'apprentissage
db.exec(`
  CREATE TABLE IF NOT EXISTS learning_curve_profiles (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'Standard Textile',
    day1 REAL DEFAULT 0.55,
    day2 REAL DEFAULT 0.75,
    day3 REAL DEFAULT 0.90,
    day4 REAL DEFAULT 0.95,
    day5_plus REAL DEFAULT 1.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Alertes et propositions de crise
db.exec(`
  CREATE TABLE IF NOT EXISTS crisis_alerts (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    planning_id TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    cr_value REAL,
    deficit_pieces INTEGER,
    proposed_action TEXT,
    status TEXT DEFAULT 'PENDING',
    resolved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (planning_id) REFERENCES planning_events(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_crisis_alerts_owner ON crisis_alerts(owner_id, status);
  CREATE INDEX IF NOT EXISTS idx_crisis_alerts_planning ON crisis_alerts(planning_id);
`);

// Ajout colonnes APS sur planning_events (idempotent)
const apsAddCol = (sql: string) => {
  try { db.prepare(sql).run(); } catch { /* colonne existe déjà */ }
};
apsAddCol('ALTER TABLE planning_events ADD COLUMN cr_value REAL');
apsAddCol('ALTER TABLE planning_events ADD COLUMN cr_status TEXT');
apsAddCol('ALTER TABLE planning_events ADD COLUMN accumulated_deficit INTEGER DEFAULT 0');
apsAddCol('ALTER TABLE planning_events ADD COLUMN learning_curve_profile_id TEXT');
apsAddCol('ALTER TABLE planning_events ADD COLUMN activity_rate_override REAL');

// Tables pour le Magasin et la logistique avancée
db.exec(`
  CREATE TABLE IF NOT EXISTS material_receipts (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    pedidoId TEXT NOT NULL,
    modelId TEXT NOT NULL,
    materialName TEXT NOT NULL,
    qtyReceived REAL NOT NULL,
    dateReceived TEXT NOT NULL,
    owner TEXT NOT NULL,
    supplierName TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );
  
  CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    ofId TEXT,
    materialName TEXT NOT NULL,
    type TEXT NOT NULL,
    qty REAL NOT NULL,
    date TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS material_invoices (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    modelId TEXT NOT NULL,
    materialName TEXT NOT NULL,
    fileName TEXT NOT NULL,
    mimeType TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_material_receipts_owner ON material_receipts(owner_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_movements_owner ON inventory_movements(owner_id);
  CREATE INDEX IF NOT EXISTS idx_material_invoices_owner ON material_invoices(owner_id);
  CREATE INDEX IF NOT EXISTS idx_material_invoices_model ON material_invoices(modelId, materialName);
`);

// ════════════════════════════════════════════════════════════════════════════════
// STOCK PRODUIT FINI — Suivi des pièces finies après production
// ════════════════════════════════════════════════════════════════════════════════

db.exec(`
  CREATE TABLE IF NOT EXISTS finished_goods_stock (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    modelId TEXT NOT NULL,
    planningId TEXT,
    reference TEXT,
    designation TEXT,
    clientName TEXT,
    chaineId TEXT,
    quantiteProduite INTEGER NOT NULL DEFAULT 0,
    quantiteDefaut INTEGER NOT NULL DEFAULT 0,
    quantiteExpediee INTEGER NOT NULL DEFAULT 0,
    quantiteRestante INTEGER NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'disponible',
    dateProduction TEXT NOT NULL,
    dateExportPrevue TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (planningId) REFERENCES planning_events(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_fg_stock_owner ON finished_goods_stock(owner_id);
  CREATE INDEX IF NOT EXISTS idx_fg_stock_model ON finished_goods_stock(modelId);
  CREATE INDEX IF NOT EXISTS idx_fg_stock_statut ON finished_goods_stock(statut);
  CREATE INDEX IF NOT EXISTS idx_fg_stock_planning ON finished_goods_stock(planningId);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS finished_goods_movements (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    fgId TEXT NOT NULL,
    type TEXT NOT NULL,
    quantite INTEGER NOT NULL,
    date TEXT NOT NULL,
    clientNom TEXT,
    bonLivraisonRef TEXT,
    factureRef TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (fgId) REFERENCES finished_goods_stock(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_fg_mvts_owner ON finished_goods_movements(owner_id);
  CREATE INDEX IF NOT EXISTS idx_fg_mvts_fg ON finished_goods_movements(fgId);
`);

// ════════════════════════════════════════════════════════════════════════════════
// CHRONO SESSIONS — Séances de chronométrage persistées en BDD
// ════════════════════════════════════════════════════════════════════════════════

db.exec(`
  CREATE TABLE IF NOT EXISTS chrono_sessions (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    model_id TEXT NOT NULL,
    label TEXT NOT NULL,
    gamme_type TEXT DEFAULT 'default',
    entries TEXT NOT NULL DEFAULT '{}',
    op_names TEXT NOT NULL DEFAULT '{}',
    total_temp_majore REAL DEFAULT 0,
    order_source TEXT DEFAULT 'gamme',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_chrono_sessions_owner_model ON chrono_sessions(owner_id, model_id);
`);

  // ── Catalogue de Temps (time standards aggregated across models) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_catalog_entries (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      norm_key TEXT NOT NULL,
      description TEXT NOT NULL,
      machine TEXT NOT NULL,
      section TEXT,
      avg_time REAL NOT NULL DEFAULT 0,
      min_time REAL NOT NULL DEFAULT 0,
      max_time REAL NOT NULL DEFAULT 0,
      count INTEGER NOT NULL DEFAULT 0,
      categories TEXT NOT NULL DEFAULT '[]',
      sources TEXT NOT NULL DEFAULT '[]',
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_time_catalog_key ON time_catalog_entries(owner_id, norm_key);
    CREATE INDEX IF NOT EXISTS idx_time_catalog_owner ON time_catalog_entries(owner_id);
  `);

  // ── Catalogue de Temps: add new columns (idempotent) ──
  const catalogNewCols = [
    { name: 'custom_notes', def: 'TEXT' },
    { name: 'confirmed', def: 'INTEGER DEFAULT 0' },
    { name: 'garment_type', def: 'TEXT' },
    { name: 'operation_type', def: 'TEXT' },
    { name: 'confidence', def: 'REAL DEFAULT 1' },
    { name: 'worker_names', def: 'TEXT DEFAULT \'[]\'' },
  ];
  for (const col of catalogNewCols) {
    try { db.exec(`ALTER TABLE time_catalog_entries ADD COLUMN ${col.name} ${col.def}`); } catch { /* already exists */ }
  }

// ════════════════════════════════════════════════════════════════════════════════
// MULTI-TENANT + HIÉRARCHIE + SCOPES (USER → Société → Communauté)
// owner_id = société (= id du patron). created_by = individu (audit "qui a créé").
// ════════════════════════════════════════════════════════════════════════════════
db.exec(`
  -- Profil personnel : suit la personne à vie (même si elle quitte la société)
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    phone TEXT,
    photo_base64 TEXT,
    metier TEXT,
    bio TEXT,
    is_public INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Rôles hiérarchiques personnalisables par société
  CREATE TABLE IF NOT EXISTS company_roles (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,          -- société (= id patron)
    name TEXT NOT NULL,                 -- patron, methode, chrono, commercial...
    level INTEGER NOT NULL DEFAULT 1,   -- profondeur (0=patron)
    parent_role_id TEXT,                -- héritage hiérarchique
    is_system INTEGER DEFAULT 0,        -- patron protégé
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_company_roles_owner ON company_roles(owner_id);

  -- Adhésion : lie un compte user à une société + rôle + portfolio RH
  CREATE TABLE IF NOT EXISTS company_members (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,          -- société (patron)
    user_id INTEGER NOT NULL,           -- compte employé
    role_id TEXT NOT NULL,
    hr_worker_id TEXT,                  -- portfolio RH (nullable)
    status TEXT DEFAULT 'active',       -- active | removed
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    removed_at DATETIME,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES company_roles(id) ON DELETE RESTRICT,
    UNIQUE(owner_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_company_members_user ON company_members(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_company_members_owner ON company_members(owner_id, status);

  -- Permissions par rôle : page ou champ × voir/éditer
  CREATE TABLE IF NOT EXISTS role_permissions (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    role_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,        -- 'page' | 'field'
    resource_key TEXT NOT NULL,         -- 'magasin' | 'model.cout_minute'
    can_view INTEGER DEFAULT 1,
    can_edit INTEGER DEFAULT 0,
    FOREIGN KEY (role_id) REFERENCES company_roles(id) ON DELETE CASCADE,
    UNIQUE(owner_id, role_id, resource_type, resource_key)
  );
  CREATE INDEX IF NOT EXISTS idx_role_perms_role ON role_permissions(role_id);

  -- Exceptions par personne (istisnae)
  CREATE TABLE IF NOT EXISTS member_permission_overrides (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    resource_type TEXT NOT NULL,
    resource_key TEXT NOT NULL,
    can_view INTEGER,                   -- nullable = pas d'override
    can_edit INTEGER,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(owner_id, user_id, resource_type, resource_key)
  );
  CREATE INDEX IF NOT EXISTS idx_member_overrides_user ON member_permission_overrides(user_id);

  -- Communauté : utilisateurs indépendants (hors société) qui partagent entre eux
  CREATE TABLE IF NOT EXISTS communities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL,
    visibility TEXT DEFAULT 'private',  -- private (sur invitation) | public
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS community_members (
    community_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member',         -- owner | moderator | member
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, user_id),
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  -- Partage d'un élément précis (ne pollue pas les tables de données)
  CREATE TABLE IF NOT EXISTS shared_resources (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,        -- 'model' | 'catalogue_temps' | ...
    resource_id TEXT NOT NULL,
    shared_by INTEGER NOT NULL,
    access TEXT DEFAULT 'view',         -- view | copy
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_shared_resources_community ON shared_resources(community_id);
`);

// Audit : created_by / updated_by sur les tables de données (idempotent).
// owner_id reste la société ; created_by identifie l'individu (admin: "qui a créé").
const auditScopedTables = [
  'models', 'magasin_products', 'magasin_mouvements', 'magasin_commandes',
  'planning_events', 'suivi_data', 'factures', 'hr_workers',
  'subcontract_orders', 'time_catalog_entries', 'chrono_sessions',
];
for (const tbl of auditScopedTables) {
  for (const col of ['created_by INTEGER', 'updated_by INTEGER']) {
    try { db.exec(`ALTER TABLE ${tbl} ADD COLUMN ${col}`); } catch { /* already exists / table absent */ }
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// DESKTOP FOUNDATION — Paramètres société + Rapports de crash (Phase 1)
// ════════════════════════════════════════════════════════════════════════════════

// Paramètres de la société (singleton id=1, créé lors du Setup)
db.exec(`
  CREATE TABLE IF NOT EXISTS company_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT,
    logo TEXT,
    specialty TEXT,
    setup_complete INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migrations company_settings : type de compte choisi à l'onboarding + méta JSON
// (région client, spécialisation personnel). DEFAULT 'societe' => compat ascendante.
try { db.exec("ALTER TABLE company_settings ADD COLUMN account_type TEXT DEFAULT 'societe'"); } catch { /* colonne déjà présente */ }
try { db.exec('ALTER TABLE company_settings ADD COLUMN profile_meta TEXT'); } catch { /* colonne déjà présente */ }

// ════════════════════════════════════════════════════════════════════════════════
// MULTI-WORKSPACE — un même compte (humain) peut gérer plusieurs sociétés isolées.
// owner_id reste l'UNIQUE clé de cloisonnement des données (déjà appliquée par tous
// les controllers + verify-tenancy). Un « workspace » = un owner_id. Chaque workspace
// est ancré par une ligne `users` non-connectable (mot de passe verrouillé), et le
// compte humain y adhère via `company_members` (qui autorise déjà N owner_id par user).
// active_owner_id sur `users` = workspace actif choisi par le compte humain.
// ════════════════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    owner_id INTEGER PRIMARY KEY,        -- = clé de cloisonnement (id de l'ancre)
    account_user_id INTEGER NOT NULL,    -- compte humain qui gère ce workspace
    name TEXT NOT NULL,
    logo TEXT,
    specialty TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (account_user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_workspaces_account ON workspaces(account_user_id);
`);
// account_type par workspace (société/client/personnel) → gating des modules par
// workspace actif, au lieu du singleton company_settings(id=1) global.
try { db.exec("ALTER TABLE workspaces ADD COLUMN account_type TEXT DEFAULT 'societe'"); } catch { /* colonne déjà présente */ }
// Workspace actif par compte (NULL => fallback historique : 1ʳᵉ adhésion = comportement inchangé).
try { db.exec('ALTER TABLE users ADD COLUMN active_owner_id INTEGER'); } catch { /* colonne déjà présente */ }
// Ancre non-connectable : marque les lignes `users` créées comme support d'un workspace.
try { db.exec('ALTER TABLE users ADD COLUMN is_workspace_anchor INTEGER DEFAULT 0'); } catch { /* colonne déjà présente */ }

// Backfill idempotent : chaque société existante (patron = membre de sa propre
// société, owner_id === user_id) devient un workspace nommé d'après company_settings.
try {
  const primaryRow = db.prepare('SELECT name, account_type FROM company_settings WHERE id = 1').get() as { name?: string; account_type?: string } | undefined;
  const primaryName = primaryRow?.name || 'Workspace 1';
  const primaryAccountType = primaryRow?.account_type || 'societe';
  const patrons = db
    .prepare(`SELECT owner_id, user_id FROM company_members WHERE owner_id = user_id AND status = 'active'`)
    .all() as { owner_id: number; user_id: number }[];
  const insWs = db.prepare(
    `INSERT OR IGNORE INTO workspaces (owner_id, account_user_id, name, account_type) VALUES (?, ?, ?, ?)`
  );
  const setActive = db.prepare('UPDATE users SET active_owner_id = ? WHERE id = ? AND active_owner_id IS NULL');
  // Aligne l'account_type du workspace primaire sur le singleton (idempotent).
  const syncType = db.prepare("UPDATE workspaces SET account_type = ? WHERE owner_id = ? AND (account_type IS NULL OR account_type = 'societe')");
  for (const p of patrons) {
    insWs.run(p.owner_id, p.user_id, primaryName, primaryAccountType);
    setActive.run(p.owner_id, p.user_id);
    syncType.run(primaryAccountType, p.owner_id);
  }
} catch (e) { console.error('[db] workspaces backfill error:', e); }

// Cloisonnement des modèles par workspace : la table `models` n'avait que
// `user_id` (le compte humain) => les modèles étaient partagés entre TOUS les
// workspaces du même compte. On ajoute `owner_id` (= workspace) et on rétro-remplit
// owner_id = user_id (le workspace primaire a owner_id === user_id), ce qui rattache
// proprement les modèles existants au workspace d'origine.
try { db.exec('ALTER TABLE models ADD COLUMN owner_id INTEGER'); } catch { /* colonne déjà présente */ }
try { db.exec('UPDATE models SET owner_id = user_id WHERE owner_id IS NULL'); } catch (e) { console.error('[db] models owner_id backfill error:', e); }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_models_owner ON models(owner_id)'); } catch { /* ignore */ }

// Rapports de crash envoyés par le frontend (Error Boundary ou window.onerror)
db.exec(`
  CREATE TABLE IF NOT EXISTS crash_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT,
    stack TEXT,
    component_stack TEXT,
    url TEXT,
    user_agent TEXT,
    user_id INTEGER,
    resolved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Table sync_outbox pour la synchronisation locale-first
db.exec(`
  CREATE TABLE IF NOT EXISTS sync_outbox (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending'
  )
`);

export default db;



