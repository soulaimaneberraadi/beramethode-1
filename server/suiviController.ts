import { Request, Response } from 'express';
import db from './db';

// Get suivi data
export const getSuiviData = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const planningId = req.query.planningId as string;
    
    try {
        const query = planningId 
          ? 'SELECT * FROM suivi_data WHERE owner_id = ? AND planningId = ? ORDER BY date DESC'
          : 'SELECT * FROM suivi_data WHERE owner_id = ? ORDER BY date DESC';
          
        const stmt = db.prepare(query);
        const rows = planningId ? stmt.all(companyId, planningId) : stmt.all(companyId);
        
        const suivis = (rows as any[]).map(r => JSON.parse(r.raw_data));
        res.json(suivis);
    } catch (error) {
        console.error('Get suivi data error:', error);
        res.status(500).json({ message: 'Error fetching suivi data' });
    }
};

// Batch upsert
export const saveSuiviData = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { suivis } = req.body;

    if (!Array.isArray(suivis)) {
        return res.status(400).json({ message: 'suivis array is required' });
    }

    try {
        const transaction = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO suivi_data 
                (id, owner_id, planningId, modelId, chaineId, date, entrer, totalHeure, pJournaliere, totalWorkers, trs, raw_data, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(planningId, date) DO UPDATE SET
                modelId=excluded.modelId, chaineId=excluded.chaineId, entrer=excluded.entrer,
                totalHeure=excluded.totalHeure, pJournaliere=excluded.pJournaliere, totalWorkers=excluded.totalWorkers, trs=excluded.trs,
                raw_data=excluded.raw_data, updated_at=CURRENT_TIMESTAMP
            `);

            for (const s of suivis) {
                if (!s.id || !s.planningId || !s.date) continue;
                // On the frontend, totalHeure represents the sum of hourly outputs (pieces produced).
                // We save it to pJournaliere and totalHeure columns so database queries work correctly.
                const actualProd = s.totalHeure || s.pJournaliere || 0;
                stmt.run(
                    s.id, companyId, s.planningId, s.modelId || null, s.chaineId || null, s.date, s.entrer || 0,
                    actualProd, actualProd, s.totalWorkers || 0, s.trs || 0,
                    JSON.stringify(s)
                );

                // Auto-sync progress to Plan Master (planning_events)
                const rows = db.prepare(`SELECT raw_data FROM suivi_data WHERE planningId = ?`).all(s.planningId);
                let totalProduced = 0;
                for (const r of rows) {
                    try {
                        const parsed = JSON.parse((r as any).raw_data);
                        totalProduced += parsed.totalHeure || parsed.pJournaliere || 0;
                    } catch(e) {}
                }

                const planRow = db.prepare(`SELECT status, qteTotal, raw_data FROM planning_events WHERE id = ?`).get(s.planningId) as { status: string, qteTotal: number, raw_data: string } | undefined;
                if (planRow) {
                    const status = totalProduced >= planRow.qteTotal ? 'DONE' : (totalProduced > 0 ? 'IN_PROGRESS' : planRow.status);
                    
                    try {
                        const rawData = JSON.parse(planRow.raw_data);
                        rawData.qteProduite = totalProduced;
                        rawData.status = status;
                        db.prepare(`UPDATE planning_events SET qteProduite = ?, status = ?, raw_data = ? WHERE id = ?`)
                          .run(totalProduced, status, JSON.stringify(rawData), s.planningId);
                    } catch(e) {
                        db.prepare(`UPDATE planning_events SET qteProduite = ?, status = ? WHERE id = ?`)
                          .run(totalProduced, status, s.planningId);
                    }
                }
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
    const companyId = (req as any).companyId;
    // Just a placeholder for P1
    res.json({ message: "Stats endpoint available" });
};
