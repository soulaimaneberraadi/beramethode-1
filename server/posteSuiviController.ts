import { Request, Response } from 'express';
import db from './db';

// Get suivi data per poste
export const getPosteSuivi = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const planningId = req.query.planningId as string;
    
    try {
        const query = planningId 
          ? 'SELECT * FROM poste_suivi WHERE owner_id = ? AND planningId = ? ORDER BY date DESC'
          : 'SELECT * FROM poste_suivi WHERE owner_id = ? ORDER BY date DESC';
          
        const stmt = db.prepare(query);
        const rows = planningId ? stmt.all(userId, planningId) : stmt.all(userId);
        
        const suivis = (rows as any[]).map(r => ({
            ...r,
            problemes: r.problemes ? JSON.parse(r.problemes) : []
        }));
        res.json(suivis);
    } catch (error) {
        console.error('Get poste_suivi data error:', error);
        res.status(500).json({ message: 'Error fetching poste_suivi data' });
    }
};

// Batch upsert
export const savePosteSuivi = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { suivis } = req.body;

    if (!Array.isArray(suivis)) {
        return res.status(400).json({ message: 'suivis array is required' });
    }

    try {
        const transaction = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO poste_suivi 
                (id, owner_id, planningId, modelId, posteId, workerId, date, heure_debut, heure_fin, pieces_entrees, pieces_sorties, pieces_defaut, temps_reel_par_piece, temps_prevu_par_piece, notes, problemes, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(planningId, posteId, date) DO UPDATE SET
                workerId=excluded.workerId, heure_debut=excluded.heure_debut, heure_fin=excluded.heure_fin, pieces_entrees=excluded.pieces_entrees, pieces_sorties=excluded.pieces_sorties, pieces_defaut=excluded.pieces_defaut, temps_reel_par_piece=excluded.temps_reel_par_piece, temps_prevu_par_piece=excluded.temps_prevu_par_piece, notes=excluded.notes, problemes=excluded.problemes, updated_at=CURRENT_TIMESTAMP
            `);

            for (const s of suivis) {
                if (!s.id || !s.planningId || !s.posteId || !s.date || !s.modelId) continue;
                stmt.run(
                    s.id, userId, s.planningId, s.modelId, s.posteId, s.workerId || null, s.date, s.heure_debut || null, s.heure_fin || null, s.pieces_entrees || 0, s.pieces_sorties || 0, s.pieces_defaut || 0, s.temps_reel_par_piece || null, s.temps_prevu_par_piece || null, s.notes || null, JSON.stringify(s.problemes || [])
                );
            }
        });

        transaction();
        res.json({ message: 'Poste Suivis saved successfully' });
    } catch (error) {
        console.error('Save poste_suivi data error:', error);
        res.status(500).json({ message: 'Error saving poste_suivi data' });
    }
};

// Delete
export const deletePosteSuivi = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const id = req.params.id;

    try {
        const stmt = db.prepare('DELETE FROM poste_suivi WHERE id = ? AND owner_id = ?');
        stmt.run(id, userId);
        res.json({ message: 'Poste_suivi deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting poste_suivi' });
    }
};
