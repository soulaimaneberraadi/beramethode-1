import { Request, Response } from 'express';
import db from './db';

// Get suivi data
export const getSuiviData = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const planningId = req.query.planningId as string;
    
    try {
        const query = planningId 
          ? 'SELECT * FROM suivi_data WHERE owner_id = ? AND planningId = ? ORDER BY date DESC'
          : 'SELECT * FROM suivi_data WHERE owner_id = ? ORDER BY date DESC';
          
        const stmt = db.prepare(query);
        const rows = planningId ? stmt.all(userId, planningId) : stmt.all(userId);
        
        const suivis = (rows as any[]).map(r => JSON.parse(r.raw_data));
        res.json(suivis);
    } catch (error) {
        console.error('Get suivi data error:', error);
        res.status(500).json({ message: 'Error fetching suivi data' });
    }
};

// Batch upsert
export const saveSuiviData = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { suivis } = req.body;

    if (!Array.isArray(suivis)) {
        return res.status(400).json({ message: 'suivis array is required' });
    }

    try {
        const transaction = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO suivi_data 
                (id, owner_id, planningId, date, pJournaliere, totalWorkers, trs, raw_data, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(planningId, date) DO UPDATE SET
                pJournaliere=excluded.pJournaliere, totalWorkers=excluded.totalWorkers, trs=excluded.trs,
                raw_data=excluded.raw_data, updated_at=CURRENT_TIMESTAMP
            `);

            for (const s of suivis) {
                if (!s.id || !s.planningId || !s.date) continue;
                stmt.run(
                    s.id, userId, s.planningId, s.date, s.pJournaliere || 0, s.totalWorkers || 0, s.trs || 0,
                    JSON.stringify(s)
                );
            }
        });

        transaction();
        res.json({ message: 'Suivis saved successfully' });
    } catch (error) {
        console.error('Save suivi data error:', error);
        res.status(500).json({ message: 'Error saving suivi data' });
    }
};

// Simple Stats 
export const getSuiviStats = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    // Just a placeholder for P1
    res.json({ message: "Stats endpoint available" });
};
