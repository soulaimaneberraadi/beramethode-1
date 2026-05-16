import { Request, Response } from 'express';
import db from './db';

// PRODUCTS
export const getMagasinProducts = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const stmt = db.prepare('SELECT * FROM magasin_products WHERE owner_id = ? ORDER BY created_at DESC');
        const products = stmt.all(userId);
        res.json(products);
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ message: 'Error fetching products' });
    }
};

export const saveMagasinProduct = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const p = req.body;

    if (!p.id || !p.reference || !p.designation) {
        return res.status(400).json({ message: 'ID, reference, and designation are required' });
    }

    try {
        const stmt = db.prepare(`
      INSERT INTO magasin_products 
      (id, owner_id, reference, designation, categorie, unite, photo, fournisseurNom, fournisseurTel, fournisseurEmail, chaineExclusive, emplacement, prixUnitaire, cump, stockAlerte,
       fournisseurAdresse, fournisseurIce, fournisseurRc, fournisseurConditionsPaiement, fournisseurDelaiLivraisonJours, fournisseurMoq, fournisseurDevise, fournisseurContact, fournisseurNotes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
      reference = excluded.reference, designation = excluded.designation, categorie = excluded.categorie, unite = excluded.unite, photo = excluded.photo,
      fournisseurNom = excluded.fournisseurNom, fournisseurTel = excluded.fournisseurTel, fournisseurEmail = excluded.fournisseurEmail,
      chaineExclusive = excluded.chaineExclusive, emplacement = excluded.emplacement, prixUnitaire = excluded.prixUnitaire, cump = excluded.cump, stockAlerte = excluded.stockAlerte,
      fournisseurAdresse = excluded.fournisseurAdresse, fournisseurIce = excluded.fournisseurIce, fournisseurRc = excluded.fournisseurRc,
      fournisseurConditionsPaiement = excluded.fournisseurConditionsPaiement, fournisseurDelaiLivraisonJours = excluded.fournisseurDelaiLivraisonJours,
      fournisseurMoq = excluded.fournisseurMoq, fournisseurDevise = excluded.fournisseurDevise, fournisseurContact = excluded.fournisseurContact, fournisseurNotes = excluded.fournisseurNotes
    `);

        stmt.run(
            p.id, userId, p.reference, p.designation, p.categorie || 'tissu', p.unite || 'm', p.photo || null,
            p.fournisseurNom || null, p.fournisseurTel || null, p.fournisseurEmail || null, p.chaineExclusive || null, p.emplacement || null,
            p.prixUnitaire || 0, p.cump || 0, p.stockAlerte || 0,
            p.fournisseurAdresse || null, p.fournisseurIce || null, p.fournisseurRc || null,
            p.fournisseurConditionsPaiement || null,
            p.fournisseurDelaiLivraisonJours != null && p.fournisseurDelaiLivraisonJours !== '' ? Number(p.fournisseurDelaiLivraisonJours) : null,
            p.fournisseurMoq != null && p.fournisseurMoq !== '' ? Number(p.fournisseurMoq) : null,
            p.fournisseurDevise || null, p.fournisseurContact || null, p.fournisseurNotes || null
        );
        res.json({ message: 'Product saved successfully' });
    } catch (error) {
        console.error('Save product error:', error);
        res.status(500).json({ message: 'Error saving product' });
    }
};

export const deleteMagasinProduct = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;

    try {
        db.prepare('DELETE FROM magasin_products WHERE id = ? AND owner_id = ?').run(id, userId);
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ message: 'Error deleting product' });
    }
};

// LOTS
export const getMagasinLots = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const stmt = db.prepare(`
      SELECT l.* FROM magasin_lots l
      JOIN magasin_products p ON l.productId = p.id
      WHERE p.owner_id = ?
    `);
        const lots = stmt.all(userId);
        res.json(lots);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching lots' });
    }
};

// MOUVEMENTS
export const getMagasinMouvements = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const stmt = db.prepare(`
      SELECT m.* FROM magasin_mouvements m
      JOIN magasin_products p ON m.productId = p.id
      WHERE p.owner_id = ? ORDER BY date DESC
    `);
        const mvts = stmt.all(userId);
        res.json(mvts);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching mouvements' });
    }
};

// ATOMIC SYNCHRONIZE OPERATION
// Since the frontend performs batched movements (adding a lot + calculating CUMP + recording movement), 
// it's safest to provide an atomic strictly-bound transaction endpoint for "Register Movement".
export const registerMouvement = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { mouvement, lotsUpdate, productUpdate } = req.body;

    try {
        const transaction = db.transaction(() => {
            // 1. Verify product ownership
            const checkId = productUpdate?.id || mouvement?.productId || (lotsUpdate && lotsUpdate.length > 0 ? lotsUpdate[0].productId : null);
            if (!checkId) throw new Error("No product ID provided in transaction");

            const prodCheck = db.prepare('SELECT id FROM magasin_products WHERE id = ? AND owner_id = ?').get(checkId, userId);
            if (!prodCheck) throw new Error("Product not found or unauthorized.");

            // 2. Insert Movement
            if (mouvement) {
        db.prepare(`
          INSERT INTO magasin_mouvements (id, productId, type, source, destination, quantite, prixUnitaire, fournisseurId, chaineId, modeleRef, date, operateurNom, notes, lotId, bain, documentRef, pieceJointe)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          mouvement.id, mouvement.productId, mouvement.type, mouvement.source, mouvement.destination, mouvement.quantite, 
          mouvement.prixUnitaire || null, mouvement.fournisseurId || null, mouvement.chaineId || null, mouvement.modeleRef || null, 
          mouvement.date, mouvement.operateurNom || null, mouvement.notes || null, mouvement.lotId || null, mouvement.bain || null,
          mouvement.documentRef || null, mouvement.pieceJointe || null
        );
            }

            // 3. Update Lots
            if (lotsUpdate && Array.isArray(lotsUpdate)) {
                const lotStmt = db.prepare(`
          INSERT INTO magasin_lots (id, productId, quantiteRestante, quantiteInitiale, prixUnitaire, dateEntree, fournisseur, numBain, dateExpiration, variante, etat)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET quantiteRestante = excluded.quantiteRestante, etat = excluded.etat
        `);
                for (const lot of lotsUpdate) {
                    lotStmt.run(lot.id, lot.productId, lot.quantiteRestante, lot.quantiteInitiale, lot.prixUnitaire, lot.dateEntree, lot.fournisseur || null, lot.numBain || null, lot.dateExpiration || null, lot.variante || null, lot.etat || 'disponible');
                }
            }

            // 4. Update Product CUMP
            if (productUpdate && productUpdate.cump !== undefined) {
                db.prepare('UPDATE magasin_products SET cump = ? WHERE id = ?').run(productUpdate.cump, productUpdate.id);
            }
        });

        transaction();
        res.json({ message: 'Mouvement registered atomically' });
    } catch (error: any) {
        console.error('Register mouvement error:', error);
        res.status(500).json({ message: error.message || 'Error processing transaction' });
    }
};
