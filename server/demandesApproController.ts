import { Request, Response } from 'express';
import db from './db';

// Get demandes appro
export const getDemandesAppro = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const stmt = db.prepare('SELECT * FROM demandes_appro WHERE owner_id = ? ORDER BY dateDemande DESC');
        const rows = stmt.all(userId) as any[];
        // Return matching format as previous local storage
        const demandes = rows.map(r => ({
           ...r,
           // map fields appropriately 
        }));
        
        // Wait, since we are doing full migration, we return JSON mapped or we map properly in DB.
        // Let's just return what's in DB as the fields match DemandeAppro interface.
        res.json(rows);
    } catch (error) {
        console.error('Get demandes appro error:', error);
        res.status(500).json({ message: 'Error fetching demandes appro' });
    }
};

// Batch Upsert
export const saveDemandesAppro = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { demandes } = req.body;

    if (!Array.isArray(demandes)) {
        return res.status(400).json({ message: 'demandes array is required' });
    }

    try {
        const transaction = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO demandes_appro 
                (id, owner_id, dateDemande, modelId, chaineId, produitDesignation, quantiteDemandee, demandeur, notes, statut)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                dateDemande=excluded.dateDemande, modelId=excluded.modelId, chaineId=excluded.chaineId,
                produitDesignation=excluded.produitDesignation, quantiteDemandee=excluded.quantiteDemandee,
                demandeur=excluded.demandeur, notes=excluded.notes, statut=excluded.statut
            `);

            for (const d of demandes) {
                if (!d.id) continue;
                stmt.run(
                    d.id, userId, d.dateDemande || '', d.modelId || '', d.chaineId || '', d.produitDesignation || '',
                    d.quantiteDemandee || 0, d.demandeur || '', d.notes || null, d.statut || 'attente'
                );
            }
        });

        transaction();
        res.json({ message: 'Demandes appro saved successfully' });
    } catch (error) {
        console.error('Save demandes appro error:', error);
        res.status(500).json({ message: 'Error saving demandes appro' });
    }
};

// Update status
export const updateDemandeApproStatut = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { statut } = req.body;
    
    try {
        db.prepare('UPDATE demandes_appro SET statut = ? WHERE id = ? AND owner_id = ?').run(statut, id, userId);
        res.json({ message: 'Status updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating statut' });
    }
};
