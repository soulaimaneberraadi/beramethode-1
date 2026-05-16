import { Request, Response } from 'express';
import db from './db';

// Get all planning events for user
export const getPlanningEvents = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const stmt = db.prepare('SELECT * FROM planning_events WHERE owner_id = ? ORDER BY created_at DESC');
        const rows = stmt.all(userId) as any[];
        const planningEvents = rows.map(r => JSON.parse(r.raw_data));
        res.json(planningEvents);
    } catch (error) {
        console.error('Get planning events error:', error);
        res.status(500).json({ message: 'Error fetching planning events' });
    }
};

// Batch upsert planning events
export const savePlanningEvents = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { events } = req.body;

    if (!Array.isArray(events)) {
        return res.status(400).json({ message: 'events array is required' });
    }

    try {
        const transaction = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO planning_events 
                (id, owner_id, modelId, chaineId, dateLancement, dateExport, qteTotal, qteProduite, status, blockedReason, superviseur, strictDeadline_DDS, clientName, estimatedEndDate, modelName, sectionSplitEnabled, fournisseurId, fournisseurDate, prepStart, prepEnd, montageStart, montageEnd, lots_data, raw_data, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                modelId=excluded.modelId, chaineId=excluded.chaineId, dateLancement=excluded.dateLancement, dateExport=excluded.dateExport,
                qteTotal=excluded.qteTotal, qteProduite=excluded.qteProduite, status=excluded.status, blockedReason=excluded.blockedReason,
                superviseur=excluded.superviseur, strictDeadline_DDS=excluded.strictDeadline_DDS, clientName=excluded.clientName,
                estimatedEndDate=excluded.estimatedEndDate, modelName=excluded.modelName, sectionSplitEnabled=excluded.sectionSplitEnabled,
                fournisseurId=excluded.fournisseurId, fournisseurDate=excluded.fournisseurDate, prepStart=excluded.prepStart, prepEnd=excluded.prepEnd,
                montageStart=excluded.montageStart, montageEnd=excluded.montageEnd, lots_data=excluded.lots_data, raw_data=excluded.raw_data, updated_at=CURRENT_TIMESTAMP
            `);

            for (const ev of events) {
                if (!ev.id) continue;
                stmt.run(
                    ev.id, userId, ev.modelId || '', ev.chaineId || '', ev.dateLancement || '', ev.dateExport || '', ev.qteTotal || 0, ev.qteProduite || 0,
                    ev.status || 'ON_TRACK', ev.blockedReason || null, ev.superviseur || null, ev.strictDeadline_DDS || null,
                    ev.clientName || null, ev.estimatedEndDate || null, ev.modelName || null, ev.sectionSplitEnabled ? 1 : 0,
                    ev.fournisseurId || null, ev.fournisseurDate || null, ev.prepStart || null, ev.prepEnd || null, ev.montageStart || null, ev.montageEnd || null,
                    ev.lots_data ? JSON.stringify(ev.lots_data) : null,
                    JSON.stringify(ev)
                );
            }
        });

        transaction();
        res.json({ message: 'Planning events saved successfully' });
    } catch (error) {
        console.error('Save planning events error:', error);
        res.status(500).json({ message: 'Error saving planning events' });
    }
};

export const deletePlanningEvent = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;

    try {
        db.prepare('DELETE FROM planning_events WHERE id = ? AND owner_id = ?').run(id, userId);
        res.json({ message: 'Planning event deleted successfully' });
    } catch (error) {
        console.error('Delete planning error:', error);
        res.status(500).json({ message: 'Error deleting planning event' });
    }
};
