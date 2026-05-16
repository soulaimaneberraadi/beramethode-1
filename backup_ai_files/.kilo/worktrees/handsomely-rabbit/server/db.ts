import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'database.sqlite');
const db = new Database(dbPath);

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

// Insert default guest user for bypassing local login
try {
  db.prepare(`INSERT OR IGNORE INTO users (id, email, password, name, role) VALUES (1, 'guest@local', '123', 'Guest', 'admin')`).run();
} catch(e) {}

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

// CREATE SETTINGS TABLE (Invoice generation config etc.)
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    owner_id INTEGER DEFAULT 1
  )
`);

export default db;
