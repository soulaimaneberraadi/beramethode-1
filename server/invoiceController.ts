import { Request, Response } from 'express';
import db from './db';

const TYPE_PREFIXES: Record<string, string> = {
  VENTE: 'FV', ACHAT: 'FA', PRODUCTION: 'FP', TRANSFERT: 'FT'
};

const MODULE_PREFIXES = ['MODE', 'ATEL', 'MAGA', 'COUP', 'STRA', 'MODEL'];
const NUMERO_RETRIES = 5;

function generateInvoiceNumero(type: string, sourceModule: string, ownerId: number): string {
  const year = new Date().getFullYear().toString();
  const typePrefix = TYPE_PREFIXES[type] || 'INV';
  const modPrefix = MODULE_PREFIXES.includes(sourceModule) ? sourceModule : 'GEN';

  for (let attempt = 0; attempt < NUMERO_RETRIES; attempt++) {
    const row = db.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(numero, -4) AS INTEGER)), 0) AS maxSeq
      FROM invoices
      WHERE owner_id = ? AND numero LIKE ?
    `).get(ownerId, `${typePrefix}-${modPrefix}-${year}-%`) as { maxSeq: number };

    const seq = (row.maxSeq + 1).toString().padStart(4, '0');
    const candidate = `${typePrefix}-${modPrefix}-${year}-${seq}`;

    try {
      const exists = db.prepare('SELECT 1 FROM invoices WHERE numero = ? AND owner_id = ?').get(candidate, ownerId);
      if (!exists) return candidate;
    } catch {
      return candidate;
    }
  }

  return `${typePrefix}-${modPrefix}-${year}-${Date.now().toString().slice(-4)}`;
}

function generateId(prefix: string = 'INV'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function nowISO(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// GET /api/invoices
export const getInvoices = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const { type, source_module, source_id, statut } = req.query;

    let query = 'SELECT i.*, COUNT(il.id) as line_count FROM invoices i LEFT JOIN invoice_lines il ON il.invoice_id = i.id WHERE i.owner_id = ?';
    const params: any[] = [ownerId];

    if (type) {
      query += ' AND i.type = ?';
      params.push(type);
    }
    if (source_module) {
      query += ' AND i.source_module = ?';
      params.push(source_module);
    }
    if (source_id) {
      query += ' AND i.source_id = ?';
      params.push(source_id);
    }
    if (statut) {
      query += ' AND i.statut = ?';
      params.push(statut);
    }

    query += ' GROUP BY i.id ORDER BY i.created_at DESC';

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error: any) {
    console.error('getInvoices error:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/invoices/:id
export const getInvoiceById = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const invoice = db.prepare('SELECT * FROM invoices WHERE owner_id = ? AND id = ?').get(ownerId, req.params.id) as any;
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const lines = db.prepare(
      'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY created_at ASC'
    ).all(invoice.id);

    res.json({ ...invoice, lines });
  } catch (error: any) {
    console.error('getInvoiceById error:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/invoices/product/:productId
export const getInvoicesByProduct = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const { productId } = req.params;

    const rows = db.prepare(`
      SELECT DISTINCT i.*
      FROM invoices i
      JOIN invoice_lines il ON il.invoice_id = i.id
      WHERE i.owner_id = ? AND il.product_id = ?
      ORDER BY i.created_at DESC
    `).all(ownerId, productId);

    res.json(rows);
  } catch (error: any) {
    console.error('getInvoicesByProduct error:', error);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/invoices
export const saveInvoice = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const payload = req.body;
    const isNew = !payload.id;

    const id = isNew ? generateId() : payload.id;
    const {
      type, source_module, source_id,
      tiers_nom, tiers_ice, tiers_adresse, tiers_tel, tiers_email,
      date_invoice, date_echeance,
      taux_tva, statut, notes, lines
    } = payload;

    if (!type || !source_module) {
      return res.status(400).json({ error: 'type and source_module are required' });
    }

    const numero = isNew ? generateInvoiceNumero(type, source_module, ownerId) : (payload.numero || generateInvoiceNumero(type, source_module, ownerId));

    const linesArr: any[] = lines || [];
    let computedHt = 0;
    if (linesArr.length > 0) {
      computedHt = linesArr.reduce((s: number, l: any) => s + (l.total ?? (l.prix_unitaire ?? 0) * (l.quantite ?? 0)), 0);
    } else if (payload.total_ht) {
      computedHt = payload.total_ht;
    }
    const tvaRate = taux_tva ?? 0;
    const computedTva = computedHt * (tvaRate / 100);
    const computedTtc = computedHt + computedTva;

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO invoices (
          id, owner_id, numero, type, source_module, source_id,
          tiers_nom, tiers_ice, tiers_adresse, tiers_tel, tiers_email,
          date_invoice, date_echeance,
          total_ht, taux_tva, total_tva, total_ttc,
          statut, notes, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          numero = excluded.numero,
          type = excluded.type,
          source_module = excluded.source_module,
          source_id = excluded.source_id,
          tiers_nom = excluded.tiers_nom,
          tiers_ice = excluded.tiers_ice,
          tiers_adresse = excluded.tiers_adresse,
          tiers_tel = excluded.tiers_tel,
          tiers_email = excluded.tiers_email,
          date_invoice = excluded.date_invoice,
          date_echeance = excluded.date_echeance,
          total_ht = excluded.total_ht,
          taux_tva = excluded.taux_tva,
          total_tva = excluded.total_tva,
          total_ttc = excluded.total_ttc,
          statut = excluded.statut,
          notes = excluded.notes,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        id, ownerId, numero, type, source_module, source_id || null,
        tiers_nom || null, tiers_ice || null, tiers_adresse || null, tiers_tel || null, tiers_email || null,
        date_invoice, date_echeance || null,
        computedHt, tvaRate, computedTva, computedTtc,
        statut || 'BROUILLON', notes || null, nowISO()
      );

      if (linesArr.length > 0) {
        db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(id);

        for (const line of linesArr) {
          const lineId = line.id || generateId('IVL');
          const qte = line.quantite ?? 1;
          const pu = line.prix_unitaire ?? 0;
          const total = line.total ?? (qte * pu);
          db.prepare(`
            INSERT INTO invoice_lines (id, invoice_id, product_id, designation, quantite, prix_unitaire, total)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(lineId, id, line.product_id || null, line.designation || line.product_label || '', qte, pu, total);
        }
      }
    });

    tx();

    const saved = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    const savedLines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ?').all(id);

    res.json({ success: true, ...saved, lines: savedLines });
  } catch (error: any) {
    console.error('saveInvoice error:', error);
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/invoices/:id
export const deleteInvoice = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const { id } = req.params;

    const existing = db.prepare('SELECT id FROM invoices WHERE owner_id = ? AND id = ?').get(ownerId, id);
    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(id);
      db.prepare('DELETE FROM invoices WHERE owner_id = ? AND id = ?').run(ownerId, id);
    });

    tx();
    res.json({ success: true });
  } catch (error: any) {
    console.error('deleteInvoice error:', error);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/invoices/:id/publish
export const publishInvoice = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const { id } = req.params;

    const invoice = db.prepare('SELECT * FROM invoices WHERE owner_id = ? AND id = ?').get(ownerId, id) as any;
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (invoice.statut !== 'BROUILLON') {
      return res.status(400).json({ error: `Cannot publish invoice with status ${invoice.statut}` });
    }

    db.prepare("UPDATE invoices SET statut = 'VALIDEE', updated_at = ? WHERE id = ? AND owner_id = ?")
      .run(nowISO(), id, ownerId);

    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    const lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ?').all(id);

    res.json({ success: true, ...updated, lines });
  } catch (error: any) {
    console.error('publishInvoice error:', error);
    res.status(500).json({ error: error.message });
  }
};
