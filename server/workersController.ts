import { Request, Response } from 'express';
import db from './db';

export const getWorkers = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const rows = db.prepare('SELECT * FROM workers WHERE owner_id = ? ORDER BY matricule ASC').all(userId) as any[];
        const workers = rows.map(r => ({
            ...r,
            is_active: !!r.is_active,
            hidden_from_societes: r.hidden_from_societes ? JSON.parse(r.hidden_from_societes) : [],
        }));
        res.json(workers);
    } catch (error) {
        console.error('Get workers error:', error);
        res.status(500).json({ message: 'Error fetching workers' });
    }
};

export const saveWorker = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const w = req.body;

    if (!w?.id || !w?.matricule || !w?.nom || !w?.prenom || !w?.date_embauche) {
        return res.status(400).json({ message: 'id, matricule, nom, prenom, date_embauche required' });
    }

    try {
        const stmt = db.prepare(`
            INSERT INTO workers
            (id, owner_id, matricule, nom, prenom, cin, cnss, phone, date_naissance, adresse, photo, date_embauche, type_contrat, date_fin_contrat, is_active, hidden_from_societes, notes, comments, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              matricule=excluded.matricule, nom=excluded.nom, prenom=excluded.prenom,
              cin=excluded.cin, cnss=excluded.cnss, phone=excluded.phone,
              date_naissance=excluded.date_naissance, adresse=excluded.adresse, photo=excluded.photo,
              date_embauche=excluded.date_embauche, type_contrat=excluded.type_contrat,
              date_fin_contrat=excluded.date_fin_contrat, is_active=excluded.is_active,
              hidden_from_societes=excluded.hidden_from_societes,
              notes=excluded.notes, comments=excluded.comments, updated_at=CURRENT_TIMESTAMP
        `);
        stmt.run(
            w.id, userId, w.matricule, w.nom, w.prenom,
            w.cin || null, w.cnss || null, w.phone || null,
            w.date_naissance || null, w.adresse || null, w.photo || null,
            w.date_embauche, w.type_contrat || 'CDI', w.date_fin_contrat || null,
            w.is_active === false ? 0 : 1,
            Array.isArray(w.hidden_from_societes) ? JSON.stringify(w.hidden_from_societes) : null,
            w.notes || null, w.comments || null
        );
        res.json({ message: 'Worker saved', id: w.id });
    } catch (error: any) {
        if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'Matricule déjà existant' });
        }
        console.error('Save worker error:', error);
        res.status(500).json({ message: 'Error saving worker' });
    }
};

export const deleteWorker = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM workers WHERE id = ? AND owner_id = ?').run(id, userId);
        res.json({ message: 'Worker deleted' });
    } catch (error) {
        console.error('Delete worker error:', error);
        res.status(500).json({ message: 'Error deleting worker' });
    }
};

export const bulkImportWorkers = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { workers } = req.body;
    if (!Array.isArray(workers)) {
        return res.status(400).json({ message: 'workers array required' });
    }
    try {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO workers
            (id, owner_id, matricule, nom, prenom, cin, cnss, phone, date_naissance, adresse, photo, date_embauche, type_contrat, date_fin_contrat, is_active, hidden_from_societes, notes, comments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        let inserted = 0;
        const tx = db.transaction(() => {
            for (const w of workers) {
                if (!w.id || !w.matricule || !w.nom || !w.prenom || !w.date_embauche) continue;
                const info = stmt.run(
                    w.id, userId, w.matricule, w.nom, w.prenom,
                    w.cin || null, w.cnss || null, w.phone || null,
                    w.date_naissance || null, w.adresse || null, w.photo || null,
                    w.date_embauche, w.type_contrat || 'CDI', w.date_fin_contrat || null,
                    w.is_active === false ? 0 : 1,
                    Array.isArray(w.hidden_from_societes) ? JSON.stringify(w.hidden_from_societes) : null,
                    w.notes || null, w.comments || null
                );
                if (info.changes > 0) inserted++;
            }
        });
        tx();
        res.json({ message: 'Bulk import done', inserted, skipped: workers.length - inserted });
    } catch (error) {
        console.error('Bulk import workers error:', error);
        res.status(500).json({ message: 'Error importing workers' });
    }
};
