import { Request, Response } from 'express';
import db from './db';
import { randomUUID } from 'crypto';

// Get all chrono sessions for a model
export const getChronoSessions = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { modelId } = req.query;

    try {
        let stmt;
        if (modelId) {
            stmt = db.prepare('SELECT * FROM chrono_sessions WHERE owner_id = ? AND model_id = ? ORDER BY created_at ASC');
            const rows = stmt.all(userId, modelId) as any[];
            const sessions = rows.map(r => ({
                id: r.id,
                label: r.label,
                createdAt: new Date(r.created_at).getTime(),
                entries: JSON.parse(r.entries || '{}'),
                opNames: JSON.parse(r.op_names || '{}'),
                totalTempMajore: r.total_temp_majore || 0,
                gammeType: r.gamme_type || 'default',
                orderSource: r.order_source || 'gamme',
                modelId: r.model_id,
            }));
            return res.json(sessions);
        } else {
            stmt = db.prepare('SELECT * FROM chrono_sessions WHERE owner_id = ? ORDER BY created_at ASC');
            const rows = stmt.all(userId) as any[];
            const sessions = rows.map(r => ({
                id: r.id,
                label: r.label,
                createdAt: new Date(r.created_at).getTime(),
                entries: JSON.parse(r.entries || '{}'),
                opNames: JSON.parse(r.op_names || '{}'),
                totalTempMajore: r.total_temp_majore || 0,
                gammeType: r.gamme_type || 'default',
                orderSource: r.order_source || 'gamme',
                modelId: r.model_id,
            }));
            return res.json(sessions);
        }
    } catch (error) {
        console.error('Get chrono sessions error:', error);
        res.status(500).json({ message: 'Error fetching chrono sessions' });
    }
};

// Create a new chrono session
export const createChronoSession = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { modelId, label, entries, opNames, totalTempMajore, gammeType, orderSource } = req.body;

    if (!modelId || !label) {
        return res.status(400).json({ message: 'modelId and label are required' });
    }

    try {
        const id = `CS-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const stmt = db.prepare(`
            INSERT INTO chrono_sessions (id, owner_id, model_id, label, entries, op_names, total_temp_majore, gamme_type, order_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            id,
            userId,
            modelId,
            label,
            JSON.stringify(entries || {}),
            JSON.stringify(opNames || {}),
            totalTempMajore || 0,
            gammeType || 'default',
            orderSource || 'gamme'
        );

        res.json({
            id,
            label,
            createdAt: Date.now(),
            entries: entries || {},
            opNames: opNames || {},
            totalTempMajore: totalTempMajore || 0,
            gammeType: gammeType || 'default',
            orderSource: orderSource || 'gamme',
            modelId,
        });
    } catch (error) {
        console.error('Create chrono session error:', error);
        res.status(500).json({ message: 'Error creating chrono session' });
    }
};

// Update a chrono session (rename, update entries)
export const updateChronoSession = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { label, entries, opNames, totalTempMajore } = req.body;

    try {
        const existing = db.prepare('SELECT * FROM chrono_sessions WHERE id = ? AND owner_id = ?').get(id, userId) as any;
        if (!existing) {
            return res.status(404).json({ message: 'Session not found' });
        }

        const stmt = db.prepare(`
            UPDATE chrono_sessions 
            SET label = COALESCE(?, label),
                entries = COALESCE(?, entries),
                op_names = COALESCE(?, op_names),
                total_temp_majore = COALESCE(?, total_temp_majore)
            WHERE id = ? AND owner_id = ?
        `);
        stmt.run(
            label || null,
            entries ? JSON.stringify(entries) : null,
            opNames ? JSON.stringify(opNames) : null,
            totalTempMajore !== undefined ? totalTempMajore : null,
            id,
            userId
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update chrono session error:', error);
        res.status(500).json({ message: 'Error updating chrono session' });
    }
};

// Delete a chrono session
export const deleteChronoSession = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;

    try {
        const stmt = db.prepare('DELETE FROM chrono_sessions WHERE id = ? AND owner_id = ?');
        const result = stmt.run(id, userId);

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Session not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Delete chrono session error:', error);
        res.status(500).json({ message: 'Error deleting chrono session' });
    }
};

// Batch save all sessions for a model (replaces all)
export const batchSaveChronoSessions = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { modelId, sessions } = req.body;

    if (!modelId || !Array.isArray(sessions)) {
        return res.status(400).json({ message: 'modelId and sessions array are required' });
    }

    try {
        const transaction = db.transaction(() => {
            // Delete existing sessions for this model
            db.prepare('DELETE FROM chrono_sessions WHERE owner_id = ? AND model_id = ?').run(userId, modelId);

            // Insert new sessions
            const stmt = db.prepare(`
                INSERT INTO chrono_sessions (id, owner_id, model_id, label, entries, op_names, total_temp_majore, gamme_type, order_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const s of sessions) {
                stmt.run(
                    s.id || `CS-${Date.now()}-${randomUUID().slice(0, 8)}`,
                    userId,
                    modelId,
                    s.label,
                    JSON.stringify(s.entries || {}),
                    JSON.stringify(s.opNames || {}),
                    s.totalTempMajore || 0,
                    s.gammeType || 'default',
                    s.orderSource || 'gamme'
                );
            }
        });

        transaction();
        res.json({ success: true, count: sessions.length });
    } catch (error) {
        console.error('Batch save chrono sessions error:', error);
        res.status(500).json({ message: 'Error batch saving chrono sessions' });
    }
};
