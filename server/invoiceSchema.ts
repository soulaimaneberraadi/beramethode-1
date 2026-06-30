import type Database from 'better-sqlite3';

/**
 * إنشاء جداول الفواتير اللامركزية (Invoice Schema)
 * هذه الجداول تسمح لكل موديول (Atelier, Magasin, Coupe, Model, Sous-traitance)
 * بإنشاء فواتير خاصة به دون المرور عبر نظام الفوترة المركزي القديم.
 */
export function createInvoiceSchema(db: Database.Database): void {
  db.exec(`
    -- ════════════════════════════════════════════════════════════════════════════════
    -- INVOICES — الفواتير اللامركزية
    -- ════════════════════════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,                           -- INV_<timestamp>_<random>
      owner_id INTEGER NOT NULL,
      numero TEXT NOT NULL UNIQUE,                   -- رقم تلقائي
      type TEXT NOT NULL CHECK(type IN ('ACHAT', 'VENTE', 'TRANSFERT', 'PRODUCTION')),
      source_module TEXT NOT NULL,                   -- الموديول الذي أنشأ الفاتورة
      source_id TEXT,                                -- المعرف داخل الموديول
      tiers_nom TEXT,                                -- الطرف المقابل
      date_facture TEXT NOT NULL,
      date_echeance TEXT,
      statut TEXT DEFAULT 'BROUILLON' CHECK(statut IN ('BROUILLON', 'VALIDEE', 'PAYEE', 'ANNULEE')),
      total_ht REAL DEFAULT 0,
      taux_tva REAL DEFAULT 20,
      total_tva REAL DEFAULT 0,
      total_ttc REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ════════════════════════════════════════════════════════════════════════════════
    -- INVOICE_LINES — أسطر الفواتير المرتبطة بالمواد
    -- ════════════════════════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS invoice_lines (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      product_id TEXT NOT NULL,                      -- model_id من جدول models
      product_label TEXT NOT NULL,                   -- نسخة من اسم المادة وقت الفاتورة
      quantite REAL NOT NULL DEFAULT 1,
      prix_unitaire REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      unite TEXT DEFAULT 'pcs',
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    -- ════════════════════════════════════════════════════════════════════════════════
    -- INDEXES
    -- ════════════════════════════════════════════════════════════════════════════════
    CREATE INDEX IF NOT EXISTS idx_invoices_owner ON invoices(owner_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_source_module ON invoices(source_module);
    CREATE INDEX IF NOT EXISTS idx_invoices_source_id ON invoices(source_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(type);
    CREATE INDEX IF NOT EXISTS idx_invoices_statut ON invoices(statut);
    CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date_facture);
    CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_lines_product ON invoice_lines(product_id);

    -- ════════════════════════════════════════════════════════════════════════════════
    -- MATERIAL_INVOICES VIEW — يجمع الفواتير + الأسطر + النماذج
    -- ════════════════════════════════════════════════════════════════════════════════
    CREATE VIEW IF NOT EXISTS material_invoices AS
    SELECT
      inv.id AS invoice_id,
      inv.numero,
      inv.type,
      inv.source_module,
      inv.source_id,
      inv.tiers_nom,
      inv.date_facture,
      inv.date_echeance,
      inv.statut,
      inv.total_ht,
      inv.taux_tva,
      inv.total_tva,
      inv.total_ttc,
      inv.notes,
      inv.created_at,
      inv.updated_at,
      il.id AS line_id,
      il.product_id,
      il.product_label,
      il.quantite,
      il.prix_unitaire,
      il.total AS line_total,
      il.unite,
      m.id AS model_id,
      json_extract(m.data, '$.meta_data.nom_modele') AS model_name
    FROM invoices inv
    JOIN invoice_lines il ON il.invoice_id = inv.id
    LEFT JOIN models m ON m.id = il.product_id;
  `);
}
