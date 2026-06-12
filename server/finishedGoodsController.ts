import { Request, Response } from 'express';
import db from './db';
import { randomUUID } from 'crypto';

// GET all finished goods stock entries for this user
export const getFinishedGoods = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const rows = db.prepare('SELECT * FROM finished_goods_stock WHERE owner_id = ? ORDER BY created_at DESC').all(userId);
        res.json(rows);
    } catch (error) {
        console.error('Get finished goods error:', error);
        res.status(500).json({ message: 'Error fetching finished goods' });
    }
};

// CREATE or UPDATE a finished goods stock entry
export const saveFinishedGood = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const fg = req.body;

    if (!fg.id || !fg.modelId) {
        return res.status(400).json({ message: 'id and modelId are required' });
    }

    try {
        db.prepare(`
            INSERT INTO finished_goods_stock
            (id, owner_id, modelId, planningId, reference, designation, clientName, chaineId,
             quantiteProduite, quantiteDefaut, quantiteExpediee, quantiteRestante,
             statut, dateProduction, dateExportPrevue, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
            modelId = excluded.modelId, planningId = excluded.planningId, reference = excluded.reference,
            designation = excluded.designation, clientName = excluded.clientName, chaineId = excluded.chaineId,
            quantiteProduite = excluded.quantiteProduite, quantiteDefaut = excluded.quantiteDefaut,
            quantiteExpediee = excluded.quantiteExpediee, quantiteRestante = excluded.quantiteRestante,
            statut = excluded.statut, dateProduction = excluded.dateProduction,
            dateExportPrevue = excluded.dateExportPrevue, notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
        `).run(
            fg.id, userId, fg.modelId, fg.planningId || null,
            fg.reference || null, fg.designation || null, fg.clientName || null, fg.chaineId || null,
            fg.quantiteProduite || 0, fg.quantiteDefaut || 0, fg.quantiteExpediee || 0, fg.quantiteRestante || 0,
            fg.statut || 'disponible', fg.dateProduction || new Date().toISOString().split('T')[0],
            fg.dateExportPrevue || null, fg.notes || null
        );
        res.json({ message: 'Finished good saved successfully' });
    } catch (error) {
        console.error('Save finished good error:', error);
        res.status(500).json({ message: 'Error saving finished good' });
    }
};

// DELETE a finished goods stock entry
export const deleteFinishedGood = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM finished_goods_stock WHERE id = ? AND owner_id = ?').run(id, userId);
        res.json({ message: 'Finished good deleted successfully' });
    } catch (error) {
        console.error('Delete finished good error:', error);
        res.status(500).json({ message: 'Error deleting finished good' });
    }
};

// CREATE a finished goods entry from a closed OF (auto-trigger)
export const createFromCloture = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { planningId, modelId, reference, designation, clientName, chaineId,
            quantiteProduite, quantiteDefaut, dateExportPrevue, notes } = req.body;

    if (!modelId || !quantiteProduite) {
        return res.status(400).json({ message: 'modelId and quantiteProduite are required' });
    }

    try {
        const id = `FG-${randomUUID().slice(0, 8)}`;
        const dateProduction = new Date().toISOString().split('T')[0];
        const quantiteRestante = Math.max(0, (quantiteProduite || 0) - (quantiteDefaut || 0));

        db.prepare(`
            INSERT INTO finished_goods_stock
            (id, owner_id, modelId, planningId, reference, designation, clientName, chaineId,
             quantiteProduite, quantiteDefaut, quantiteExpediee, quantiteRestante,
             statut, dateProduction, dateExportPrevue, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'disponible', ?, ?, ?)
        `).run(
            id, userId, modelId, planningId || null,
            reference || null, designation || null, clientName || null, chaineId || null,
            quantiteProduite, quantiteDefaut || 0, quantiteRestante,
            dateProduction, dateExportPrevue || null, notes || null
        );

        res.json({ id, message: 'Finished good created from OF closure' });
    } catch (error) {
        console.error('Create from cloture error:', error);
        res.status(500).json({ message: 'Error creating finished good from OF closure' });
    }
};

// GET all movements for a finished good
export const getFinishedGoodMovements = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { fgId } = req.params;
    try {
        const rows = db.prepare('SELECT * FROM finished_goods_movements WHERE owner_id = ? AND fgId = ? ORDER BY date DESC').all(userId, fgId);
        res.json(rows);
    } catch (error) {
        console.error('Get fg movements error:', error);
        res.status(500).json({ message: 'Error fetching movements' });
    }
};

// GET all movements for this user
export const getAllFinishedGoodMovements = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const rows = db.prepare('SELECT * FROM finished_goods_movements WHERE owner_id = ? ORDER BY date DESC').all(userId);
        res.json(rows);
    } catch (error) {
        console.error('Get all fg movements error:', error);
        res.status(500).json({ message: 'Error fetching movements' });
    }
};

// CREATE a movement (expedition, retour, regularisation)
export const saveFinishedGoodMovement = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const mvt = req.body;

    if (!mvt.fgId || !mvt.type || !mvt.quantite) {
        return res.status(400).json({ message: 'fgId, type and quantite are required' });
    }

    try {
        const transaction = db.transaction(() => {
            // 1. Insert the movement
            const mvtId = mvt.id || `FGM-${randomUUID().slice(0, 8)}`;
            db.prepare(`
                INSERT INTO finished_goods_movements
                (id, owner_id, fgId, type, quantite, date, clientNom, bonLivraisonRef, factureRef, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                mvtId, userId, mvt.fgId, mvt.type, mvt.quantite,
                mvt.date || new Date().toISOString(),
                mvt.clientNom || null, mvt.bonLivraisonRef || null,
                mvt.factureRef || null, mvt.notes || null
            );

            // 2. Update the finished goods stock
            const fg = db.prepare('SELECT * FROM finished_goods_stock WHERE id = ? AND owner_id = ?').get(mvt.fgId, userId) as any;
            if (fg) {
                let newExpediee = fg.quantiteExpediee;
                let newRestante = fg.quantiteRestante;
                let newStatut = fg.statut;

                if (mvt.type === 'expedition') {
                    newExpediee = fg.quantiteExpediee + mvt.quantite;
                    newRestante = Math.max(0, fg.quantiteRestante - mvt.quantite);
                } else if (mvt.type === 'retour') {
                    newExpediee = Math.max(0, fg.quantiteExpediee - mvt.quantite);
                    newRestante = fg.quantiteRestante + mvt.quantite;
                }

                if (newRestante <= 0) newStatut = 'expediee';
                else if (newExpediee > 0) newStatut = 'partielle';
                else newStatut = 'disponible';

                db.prepare(`
                    UPDATE finished_goods_stock
                    SET quantiteExpediee = ?, quantiteRestante = ?, statut = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(newExpediee, newRestante, newStatut, mvt.fgId);
            }
        });

        transaction();
        res.json({ message: 'Movement saved successfully' });
    } catch (error) {
        console.error('Save fg movement error:', error);
        res.status(500).json({ message: 'Error saving movement' });
    }
};

// DELETE a movement
export const deleteFinishedGoodMovement = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM finished_goods_movements WHERE id = ? AND owner_id = ?').run(id, userId);
        res.json({ message: 'Movement deleted successfully' });
    } catch (error) {
        console.error('Delete fg movement error:', error);
        res.status(500).json({ message: 'Error deleting movement' });
    }
};
