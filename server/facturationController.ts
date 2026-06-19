import { Request, Response } from 'express';
import db from './db';

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
    
    if (!payload.id) {
        payload.id = 'FAC_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }

    const {
        id, numero, type,
        tiers_nom, tiers_ice, tiers_rc, tiers_if, tiers_adresse, tiers_tel, tiers_email,
        date_facture, date_echeance,
        total_ht, taux_tva, total_tva, total_ttc, montant_paye,
        devis_id, planning_id, commande_id,
        statut, notes, lignes
    } = payload;

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

    db.prepare(query).run(
        id, ownerId, numero, type,
        tiers_nom, tiers_ice || null, tiers_rc || null, tiers_if || null, tiers_adresse || null, tiers_tel || null, tiers_email || null,
        date_facture, date_echeance || null,
        total_ht || 0, taux_tva || 0, total_tva || 0, total_ttc || 0, montant_paye || 0,
        devis_id || null, planning_id || null, commande_id || null,
        statut || 'BROUILLON', notes || null, JSON.stringify(lignes || [])
    );

    res.json({ success: true, id });
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
    
    if (!payload.id) {
        payload.id = 'BL_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }

    const {
        id, numero, facture_id, tiers_nom, date_livraison, adresse_livraison, transporteur, lignes, statut, notes
    } = payload;

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

    res.json({ success: true, id });
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

        // Recalculate total payments for this invoice
        const totalPaidRes = db.prepare('SELECT SUM(montant) as total FROM paiements WHERE facture_id = ?').get(facture_id) as { total: number };
        const totalPaid = totalPaidRes.total || 0;

        db.prepare('UPDATE factures SET montant_paye = ? WHERE id = ?').run(totalPaid, facture_id);
    });

    tx();
    res.json({ success: true, id });
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

        // Recalculate total payments for this invoice
        const totalPaidRes = db.prepare('SELECT SUM(montant) as total FROM paiements WHERE facture_id = ?').get(facture_id) as { total: number };
        const totalPaid = totalPaidRes?.total || 0;

        db.prepare('UPDATE factures SET montant_paye = ? WHERE id = ?').run(totalPaid, facture_id);
    });

    tx();
    res.json({ success: true });
  } catch (error: any) {
    console.error('deletePaiement error:', error);
    res.status(500).json({ error: error.message });
  }
};
