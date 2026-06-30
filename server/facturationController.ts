import { Request, Response } from 'express';
import db from './db';

const DEFAULT_PREFIXES: Record<string, string> = {
  ACHAT: 'FA', VENTE: 'FV', DEVIS: 'DEV', PROFORMA: 'FP', AVOIR: 'AV'
};

const NUMERO_RETRIES = 5;

function generateNumero(
  type: string,
  ownerId: number,
  table: 'factures' | 'bons_livraison' = 'factures',
  prefixMap?: Record<string, string>,
): string {
  const year = new Date().getFullYear().toString();
  const pfx = prefixMap?.[type] || DEFAULT_PREFIXES[type] || 'DOC';

  for (let attempt = 0; attempt < NUMERO_RETRIES; attempt++) {
    let row: { maxSeq: number };
    if (table === 'bons_livraison') {
      row = db.prepare(`
        SELECT COALESCE(MAX(CAST(SUBSTR(numero, -4) AS INTEGER)), 0) AS maxSeq
        FROM bons_livraison
        WHERE owner_id = ? AND numero LIKE ?
      `).get(ownerId, `${pfx}-${year}-%`) as { maxSeq: number };
    } else {
      row = db.prepare(`
        SELECT COALESCE(MAX(CAST(SUBSTR(numero, -4) AS INTEGER)), 0) AS maxSeq
        FROM factures
        WHERE owner_id = ? AND type = ? AND numero LIKE ?
      `).get(ownerId, type, `${pfx}-${year}-%`) as { maxSeq: number };
    }

    const seq = (row.maxSeq + 1).toString().padStart(4, '0');
    const candidate = `${pfx}-${year}-${seq}`;

    try {
      const exists = db.prepare(`SELECT 1 FROM ${table} WHERE numero = ? AND owner_id = ?`).get(candidate, ownerId);
      if (!exists) return candidate;
    } catch {
      return candidate;
    }
  }

  return `${pfx}-${year}-${Date.now().toString().slice(-4)}`;
}

function generateBLNumero(ownerId: number): string {
  return generateNumero('BL', ownerId, 'bons_livraison', { BL: 'BL' });
}

function updateStatutApresPaiement(factureId: string, ownerId: number): void {
  const f = db.prepare('SELECT total_ttc, montant_paye FROM factures WHERE id = ? AND owner_id = ?').get(factureId, ownerId) as any;
  if (!f) return;
  let nouveauStatut: string;
  if (f.montant_paye <= 0) {
    nouveauStatut = 'ENVOYEE';
  } else if (f.montant_paye >= f.total_ttc) {
    nouveauStatut = 'PAYEE';
  } else {
    nouveauStatut = 'PARTIELLEMENT';
  }
  db.prepare('UPDATE factures SET statut = ? WHERE id = ? AND owner_id = ?').run(nouveauStatut, factureId, ownerId);
}

// --------------------------------------------------------------------------------
// FACTURES (ACHAT, VENTE, DEVIS, PROFORMA, AVOIR)
// --------------------------------------------------------------------------------

export const getFactures = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const type = req.query.type as string; // Optional filter ACHAT/VENTE/DEVIS
    
    let query = 'SELECT * FROM factures WHERE owner_id = ?';
    const params: any[] = [ownerId];
    
    if (type) {
        query += ' AND type = ?';
        params.push(type);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const rows = db.prepare(query).all(...params) as any[];
    
    const parsed = rows.map(r => ({
      ...r,
      lignes: JSON.parse(r.lignes || '[]')
    }));
    
    res.json(parsed);
  } catch (error: any) {
    console.error('getFactures error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getFactureById = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const row = db.prepare('SELECT * FROM factures WHERE owner_id = ? AND id = ?').get(ownerId, req.params.id) as any;
    if (!row) {
        return res.status(404).json({ error: 'Facture not found' });
    }
    res.json({
        ...row,
        lignes: JSON.parse(row.lignes || '[]')
    });
  } catch (error: any) {
    console.error('getFactureById error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const saveFacture = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    let payload = req.body;
    
    const isNew = !payload.id;
    if (isNew) {
        payload.id = 'FAC_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }

    const {
        id, numero: rawNumero, type,
        tiers_nom, tiers_ice, tiers_rc, tiers_if, tiers_adresse, tiers_tel, tiers_email,
        date_facture, date_echeance,
        total_ht, taux_tva, total_tva, total_ttc, montant_paye,
        devis_id, planning_id, commande_id,
        statut, notes, lignes
    } = payload;

    const numero = isNew ? generateNumero(type, ownerId) : rawNumero;

    const lignesArr: { designation?: string; quantite?: number; prix_unitaire?: number; total?: number }[] = lignes || [];
    let computedHt = total_ht ?? 0;
    let computedTva = total_tva ?? 0;
    let computedTtc = total_ttc ?? 0;
    if (computedHt === 0 && lignesArr.length > 0) {
      computedHt = lignesArr.reduce((s, l) => s + (l.total ?? (l.prix_unitaire ?? 0) * (l.quantite ?? 0)), 0);
      const tvaRate = taux_tva ?? 0;
      computedTva = computedHt * (tvaRate / 100);
      computedTtc = computedHt + computedTva;
    }

    const query = `
      INSERT INTO factures (
        id, owner_id, numero, type,
        tiers_nom, tiers_ice, tiers_rc, tiers_if, tiers_adresse, tiers_tel, tiers_email,
        date_facture, date_echeance,
        total_ht, taux_tva, total_tva, total_ttc, montant_paye,
        devis_id, planning_id, commande_id,
        statut, notes, lignes, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        numero = excluded.numero,
        type = excluded.type,
        tiers_nom = excluded.tiers_nom,
        tiers_ice = excluded.tiers_ice,
        tiers_rc = excluded.tiers_rc,
        tiers_if = excluded.tiers_if,
        tiers_adresse = excluded.tiers_adresse,
        tiers_tel = excluded.tiers_tel,
        tiers_email = excluded.tiers_email,
        date_facture = excluded.date_facture,
        date_echeance = excluded.date_echeance,
        total_ht = excluded.total_ht,
        taux_tva = excluded.taux_tva,
        total_tva = excluded.total_tva,
        total_ttc = excluded.total_ttc,
        montant_paye = excluded.montant_paye,
        devis_id = excluded.devis_id,
        planning_id = excluded.planning_id,
        commande_id = excluded.commande_id,
        statut = excluded.statut,
        notes = excluded.notes,
        lignes = excluded.lignes,
        updated_at = CURRENT_TIMESTAMP
    `;

    const finalHt = isNew ? computedHt : (total_ht ?? computedHt);
    const finalTva = isNew ? computedTva : (total_tva ?? computedTva);
    const finalTtc = isNew ? computedTtc : (total_ttc ?? computedTtc);
    const finalTaux = taux_tva ?? (computedHt > 0 && total_ht === 0 ? 0 : taux_tva) ?? 0;

    db.prepare(query).run(
        id, ownerId, numero, type,
        tiers_nom, tiers_ice || null, tiers_rc || null, tiers_if || null, tiers_adresse || null, tiers_tel || null, tiers_email || null,
        date_facture, date_echeance || null,
        finalHt, finalTaux, finalTva, finalTtc, montant_paye || 0,
        devis_id || null, planning_id || null, commande_id || null,
        statut || 'BROUILLON', notes || null, JSON.stringify(lignes || [])
    );

    res.json({ success: true, id, numero });
  } catch (error: any) {
    console.error('saveFacture error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteFacture = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const { id } = req.params;
    
    // Deletion might fail if there are paiements depending on it (due to CASCADE, it should be fine, but we might want to prevent or cascade)
    // Here we rely on CASCADE deleting the paiements
    db.prepare('DELETE FROM factures WHERE owner_id = ? AND id = ?').run(ownerId, id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('deleteFacture error:', error);
    res.status(500).json({ error: error.message });
  }
};


// --------------------------------------------------------------------------------
// BONS DE LIVRAISON
// --------------------------------------------------------------------------------

export const getBonsLivraison = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const rows = db.prepare('SELECT * FROM bons_livraison WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId) as any[];
    const parsed = rows.map(r => ({
      ...r,
      lignes: JSON.parse(r.lignes || '[]')
    }));
    res.json(parsed);
  } catch (error: any) {
    console.error('getBonsLivraison error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const saveBonLivraison = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    let payload = req.body;
    
    const isNew = !payload.id;
    if (isNew) {
        payload.id = 'BL_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }

    const {
        id, numero: rawNumero, facture_id, tiers_nom, date_livraison, adresse_livraison, transporteur, lignes, statut, notes
    } = payload;

    const numero = isNew ? generateBLNumero(ownerId) : rawNumero;

    const query = `
      INSERT INTO bons_livraison (
        id, owner_id, numero, facture_id, tiers_nom, date_livraison, adresse_livraison, transporteur, lignes, statut, notes
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        numero = excluded.numero,
        facture_id = excluded.facture_id,
        tiers_nom = excluded.tiers_nom,
        date_livraison = excluded.date_livraison,
        adresse_livraison = excluded.adresse_livraison,
        transporteur = excluded.transporteur,
        lignes = excluded.lignes,
        statut = excluded.statut,
        notes = excluded.notes
    `;

    db.prepare(query).run(
        id, ownerId, numero, facture_id || null, tiers_nom, date_livraison, adresse_livraison || null, transporteur || null, JSON.stringify(lignes || []), statut || 'PREPARE', notes || null
    );

    res.json({ success: true, id, numero });
  } catch (error: any) {
    console.error('saveBonLivraison error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteBonLivraison = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    db.prepare('DELETE FROM bons_livraison WHERE owner_id = ? AND id = ?').run(ownerId, req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('deleteBonLivraison error:', error);
    res.status(500).json({ error: error.message });
  }
};


// --------------------------------------------------------------------------------
// PAIEMENTS
// --------------------------------------------------------------------------------

export const getPaiementsParFacture = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const { facture_id } = req.params;
    const rows = db.prepare('SELECT * FROM paiements WHERE owner_id = ? AND facture_id = ? ORDER BY date_paiement ASC').all(ownerId, facture_id);
    res.json(rows);
  } catch (error: any) {
    console.error('getPaiementsParFacture error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const savePaiement = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    let payload = req.body;
    
    if (!payload.id) {
        payload.id = 'PAY_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }

    const {
        id, facture_id, date_paiement, montant, mode, reference, notes
    } = payload;

    const tx = db.transaction(() => {
        // Anti-IDOR : la facture DOIT appartenir à la société/workspace active, sinon
        // un facture_id forgé enregistrerait un paiement sur la facture d'un autre tenant.
        const owns = db.prepare('SELECT 1 FROM factures WHERE id = ? AND owner_id = ?').get(facture_id, ownerId);
        if (!owns) throw new Error('FACTURE_NOT_OWNED');

        const query = `
        INSERT INTO paiements (
            id, owner_id, facture_id, date_paiement, montant, mode, reference, notes
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
            date_paiement = excluded.date_paiement,
            montant = excluded.montant,
            mode = excluded.mode,
            reference = excluded.reference,
            notes = excluded.notes
        `;

        db.prepare(query).run(
            id, ownerId, facture_id, date_paiement, montant, mode || 'VIREMENT', reference || null, notes || null
        );

        // Recalculate total payments for this invoice (scopé owner : pas de fuite inter-tenant).
        const totalPaidRes = db.prepare('SELECT SUM(montant) as total FROM paiements WHERE facture_id = ? AND owner_id = ?').get(facture_id, ownerId) as { total: number };
        const totalPaid = totalPaidRes.total || 0;

        db.prepare('UPDATE factures SET montant_paye = ? WHERE id = ? AND owner_id = ?').run(totalPaid, facture_id, ownerId);

        updateStatutApresPaiement(facture_id, ownerId);
    });

    tx();

    const fUpdated = db.prepare('SELECT montant_paye, statut FROM factures WHERE id = ? AND owner_id = ?').get(facture_id, ownerId) as any;
    res.json({ success: true, id, montant_paye: fUpdated?.montant_paye ?? montant, statut: fUpdated?.statut });
  } catch (error: any) {
    console.error('savePaiement error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deletePaiement = (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).companyId as number;
    const { id, facture_id } = req.params;
    
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM paiements WHERE owner_id = ? AND id = ?').run(ownerId, id);

        // Recalculate total payments for this invoice (scopé owner).
        const totalPaidRes = db.prepare('SELECT SUM(montant) as total FROM paiements WHERE facture_id = ? AND owner_id = ?').get(facture_id, ownerId) as { total: number };
        const totalPaid = totalPaidRes?.total || 0;

        db.prepare('UPDATE factures SET montant_paye = ? WHERE id = ? AND owner_id = ?').run(totalPaid, facture_id, ownerId);

        updateStatutApresPaiement(facture_id, ownerId);
    });

    tx();
    const fUpdated = db.prepare('SELECT montant_paye, statut FROM factures WHERE id = ? AND owner_id = ?').get(facture_id, ownerId) as any;
    res.json({ success: true, montant_paye: fUpdated?.montant_paye ?? 0, statut: fUpdated?.statut });
  } catch (error: any) {
    console.error('deletePaiement error:', error);
    res.status(500).json({ error: error.message });
  }
};
