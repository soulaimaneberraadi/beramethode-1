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
       fournisseurAdresse, fournisseurIce, fournisseurRc, fournisseurConditionsPaiement, fournisseurDelaiLivraisonJours, fournisseurMoq, fournisseurDevise, fournisseurContact, fournisseurNotes, fournisseurLogo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
      reference = excluded.reference, designation = excluded.designation, categorie = excluded.categorie, unite = excluded.unite, photo = excluded.photo,
      fournisseurNom = excluded.fournisseurNom, fournisseurTel = excluded.fournisseurTel, fournisseurEmail = excluded.fournisseurEmail,
      chaineExclusive = excluded.chaineExclusive, emplacement = excluded.emplacement, prixUnitaire = excluded.prixUnitaire, cump = excluded.cump, stockAlerte = excluded.stockAlerte,
      fournisseurAdresse = excluded.fournisseurAdresse, fournisseurIce = excluded.fournisseurIce, fournisseurRc = excluded.fournisseurRc,
      fournisseurConditionsPaiement = excluded.fournisseurConditionsPaiement, fournisseurDelaiLivraisonJours = excluded.fournisseurDelaiLivraisonJours,
      fournisseurMoq = excluded.fournisseurMoq, fournisseurDevise = excluded.fournisseurDevise, fournisseurContact = excluded.fournisseurContact, fournisseurNotes = excluded.fournisseurNotes, fournisseurLogo = excluded.fournisseurLogo
    `);

        stmt.run(
            p.id, userId, p.reference, p.designation, p.categorie || 'tissu', p.unite || 'm', p.photo || null,
            p.fournisseurNom || null, p.fournisseurTel || null, p.fournisseurEmail || null, p.chaineExclusive || null, p.emplacement || null,
            p.prixUnitaire || 0, p.cump || 0, p.stockAlerte || 0,
            p.fournisseurAdresse || null, p.fournisseurIce || null, p.fournisseurRc || null,
            p.fournisseurConditionsPaiement || null,
            p.fournisseurDelaiLivraisonJours != null && p.fournisseurDelaiLivraisonJours !== '' ? Number(p.fournisseurDelaiLivraisonJours) : null,
            p.fournisseurMoq != null && p.fournisseurMoq !== '' ? Number(p.fournisseurMoq) : null,
            p.fournisseurDevise || null, p.fournisseurContact || null, p.fournisseurNotes || null, p.fournisseurLogo || null
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
          INSERT INTO magasin_lots (id, productId, quantiteRestante, quantiteInitiale, prixUnitaire, dateEntree, fournisseur, numBain, dateExpiration, variante, etat, quantiteReservee)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET quantiteRestante = excluded.quantiteRestante, etat = excluded.etat, quantiteReservee = excluded.quantiteReservee
        `);
                for (const lot of lotsUpdate) {
                    lotStmt.run(
                        lot.id, 
                        lot.productId, 
                        lot.quantiteRestante ?? 0, 
                        lot.quantiteInitiale ?? 0, 
                        lot.prixUnitaire ?? 0, 
                        lot.dateEntree ?? new Date().toISOString(), 
                        lot.fournisseur || null, 
                        lot.numBain || null, 
                        lot.dateExpiration || null, 
                        lot.variante || null, 
                        lot.etat || 'disponible',
                        lot.quantiteReservee ?? 0
                    );
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

export const updateMagasinMouvement = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const m = req.body;

    try {
        const existing = db.prepare(`
          SELECT m.* FROM magasin_mouvements m
          JOIN magasin_products p ON m.productId = p.id
          WHERE m.id = ? AND p.owner_id = ?
        `).get(id, userId);

        if (!existing) {
            return res.status(404).json({ message: 'Mouvement non trouvé' });
        }

        db.prepare(`
          UPDATE magasin_mouvements SET
            type = ?, source = ?, destination = ?, quantite = ?, prixUnitaire = ?, fournisseurId = ?, chaineId = ?, modeleRef = ?,
            operateurNom = ?, notes = ?, lotId = ?, bain = ?, documentRef = ?, pieceJointe = ?, date = ?
          WHERE id = ?
        `).run(
            m.type, m.source, m.destination, m.quantite, m.prixUnitaire || null, m.fournisseurId || null,
            m.chaineId || null, m.modeleRef || null, m.operateurNom || null, m.notes || null,
            m.lotId || null, m.bain || null, m.documentRef || null, m.pieceJointe || null,
            m.date, id
        );

        res.json({ message: 'Mouvement mis à jour' });
    } catch (error: any) {
        console.error('Update mouvement error:', error);
        res.status(500).json({ message: error.message || 'Error updating mouvement' });
    }
};

export const deleteMagasinMouvement = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;

    try {
        const stmt = db.prepare(`
          DELETE FROM magasin_mouvements WHERE id = ? AND productId IN (
            SELECT id FROM magasin_products WHERE owner_id = ?
          )
        `);
        const info = stmt.run(id, userId);

        if (info.changes === 0) {
            return res.status(404).json({ message: 'Mouvement non trouvé ou غير مصرح' });
        }

        res.json({ message: 'Mouvement supprimé' });
    } catch (error: any) {
        console.error('Delete mouvement error:', error);
        res.status(500).json({ message: error.message || 'Error deleting mouvement' });
    }
};

// COMMANDES
export const getMagasinCommandes = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const stmt = db.prepare('SELECT * FROM magasin_commandes WHERE owner_id = ? ORDER BY dateCreation DESC');
        const commandes = stmt.all(userId).map((c: any) => ({...c, lignes: JSON.parse(c.lignes || '[]')}));
        res.json(commandes);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching commandes' });
    }
};

export const saveMagasinCommande = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const c = req.body;
    try {
        const stmt = db.prepare(`
            INSERT INTO magasin_commandes (id, owner_id, numero, fournisseurNom, dateCreation, dateLivraisonPrevue, total, statut, lignes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
            numero=excluded.numero, fournisseurNom=excluded.fournisseurNom, dateCreation=excluded.dateCreation,
            dateLivraisonPrevue=excluded.dateLivraisonPrevue, total=excluded.total, statut=excluded.statut, lignes=excluded.lignes
        `);
        stmt.run(c.id, userId, c.numero, c.fournisseurNom, c.dateCreation, c.dateLivraisonPrevue || null, c.total || 0, c.statut, JSON.stringify(c.lignes || []));
        res.json({ message: 'Commande saved successfully' });
    } catch (error) {
        console.error('Save commande error:', error);
        res.status(500).json({ message: 'Error saving commande' });
    }
};

export const deleteMagasinCommande = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        db.prepare('DELETE FROM magasin_commandes WHERE id = ? AND owner_id = ?').run(req.params.id, userId);
        res.json({ message: 'Commande deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting commande' });
    }
};

// DEMANDES
export const getMagasinDemandes = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const stmt = db.prepare('SELECT * FROM magasin_demandes WHERE owner_id = ? ORDER BY dateDemande DESC');
        const demandes = stmt.all(userId);
        res.json(demandes);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching demandes' });
    }
};

export const saveMagasinDemande = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const d = req.body;
    try {
        const stmt = db.prepare(`
            INSERT INTO magasin_demandes (id, owner_id, modelId, chaineId, produitDesignation, quantiteDemandee, notes, dateDemande, demandeur, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
            modelId=excluded.modelId, chaineId=excluded.chaineId, produitDesignation=excluded.produitDesignation,
            quantiteDemandee=excluded.quantiteDemandee, notes=excluded.notes, dateDemande=excluded.dateDemande, demandeur=excluded.demandeur, statut=excluded.statut
        `);
        stmt.run(d.id, userId, d.modelId, d.chaineId || null, d.produitDesignation, d.quantiteDemandee, d.notes || null, d.dateDemande, d.demandeur, d.statut);
        res.json({ message: 'Demande saved successfully' });
    } catch (error) {
        console.error('Save demande error:', error);
        res.status(500).json({ message: 'Error saving demande' });
    }
};

export const deleteMagasinDemande = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        db.prepare('DELETE FROM magasin_demandes WHERE id = ? AND owner_id = ?').run(req.params.id, userId);
        res.json({ message: 'Demande deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting demande' });
    }
};

// DECHETS
export const getMagasinDechets = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const stmt = db.prepare('SELECT * FROM magasin_dechets WHERE owner_id = ? ORDER BY date_declaration DESC');
        const dechets = stmt.all(userId);
        res.json(dechets);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching dechets' });
    }
};

export const saveMagasinDechet = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const d = req.body;
    try {
        const stmt = db.prepare(`
            INSERT INTO magasin_dechets (id, owner_id, type_dechet, quantite, unite, source, date_declaration, valeur_estimee, notes, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
            type_dechet=excluded.type_dechet, quantite=excluded.quantite, unite=excluded.unite, source=excluded.source,
            date_declaration=excluded.date_declaration, valeur_estimee=excluded.valeur_estimee, notes=excluded.notes, statut=excluded.statut
        `);
        stmt.run(d.id, userId, d.type_dechet, d.quantite, d.unite, d.source, d.date_declaration, d.valeur_estimee, d.notes || null, d.statut);
        res.json({ message: 'Dechet saved successfully' });
    } catch (error) {
        console.error('Save dechet error:', error);
        res.status(500).json({ message: 'Error saving dechet' });
    }
};

export const deleteMagasinDechet = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        db.prepare('DELETE FROM magasin_dechets WHERE id = ? AND owner_id = ?').run(req.params.id, userId);
        res.json({ message: 'Dechet deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting dechet' });
    }
};
