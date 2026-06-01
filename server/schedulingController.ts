import { Request, Response } from 'express';
import db from './db';
import { randomUUID } from 'crypto';

// ════════════════════════════════════════════════════════════════════════════════
// 🧠 APS Scheduling Controller — Critical Ratio, Activity Rates, Learning Curves
// ════════════════════════════════════════════════════════════════════════════════

// ─── Activity Rates (Q Factor per Chain) ────────────────────────────────────

/** GET /api/scheduling/activity-rates */
export function getActivityRates(req: Request, res: Response) {
    try {
        const userId = (req as any).userId;
        const rows = db.prepare('SELECT * FROM chain_activity_rates WHERE owner_id = ?').all(userId);
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

/** POST /api/scheduling/activity-rates */
export function saveActivityRate(req: Request, res: Response) {
    try {
        const userId = (req as any).userId;
        const { chainId, rate, source, sampleDate, totalObservations, activeObservations } = req.body;

        if (!chainId || typeof rate !== 'number') {
            return res.status(400).json({ error: 'chainId and rate are required' });
        }

        const id = `ar-${randomUUID()}`;
        db.prepare(`
            INSERT INTO chain_activity_rates (id, owner_id, chain_id, rate, source, sample_date, total_observations, active_observations)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(owner_id, chain_id) DO UPDATE SET
                rate = excluded.rate,
                source = excluded.source,
                sample_date = excluded.sample_date,
                total_observations = excluded.total_observations,
                active_observations = excluded.active_observations
        `).run(id, userId, chainId, Math.max(0.5, Math.min(1.0, rate)), source || 'MANUAL', sampleDate || null, totalObservations || null, activeObservations || null);

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// ─── Learning Curve Profiles ────────────────────────────────────────────────

/** GET /api/scheduling/learning-curves */
export function getLearningCurves(req: Request, res: Response) {
    try {
        const userId = (req as any).userId;
        const rows = db.prepare('SELECT * FROM learning_curve_profiles WHERE owner_id = ?').all(userId);
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

/** POST /api/scheduling/learning-curves */
export function saveLearningCurve(req: Request, res: Response) {
    try {
        const userId = (req as any).userId;
        const { id: existingId, name, day1, day2, day3, day4, day5Plus } = req.body;

        const id = existingId || `lc-${randomUUID()}`;
        db.prepare(`
            INSERT INTO learning_curve_profiles (id, owner_id, name, day1, day2, day3, day4, day5_plus)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                day1 = excluded.day1,
                day2 = excluded.day2,
                day3 = excluded.day3,
                day4 = excluded.day4,
                day5_plus = excluded.day5_plus
        `).run(id, userId, name || 'Standard Textile', day1 ?? 0.55, day2 ?? 0.75, day3 ?? 0.90, day4 ?? 0.95, day5Plus ?? 1.00);

        res.json({ success: true, id });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

/** DELETE /api/scheduling/learning-curves/:id */
export function deleteLearningCurve(req: Request, res: Response) {
    try {
        db.prepare('DELETE FROM learning_curve_profiles WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// ─── Crisis Alerts ──────────────────────────────────────────────────────────

/** GET /api/scheduling/crisis-alerts */
export function getCrisisAlerts(req: Request, res: Response) {
    try {
        const userId = (req as any).userId;
        const status = req.query.status || 'PENDING';
        const rows = db.prepare(
            'SELECT * FROM crisis_alerts WHERE owner_id = ? AND status = ? ORDER BY created_at DESC'
        ).all(userId, status);

        // Parse proposed_action JSON
        const parsed = (rows as any[]).map(r => ({
            ...r,
            proposed_action: r.proposed_action ? JSON.parse(r.proposed_action) : null,
        }));

        res.json(parsed);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

/** POST /api/scheduling/crisis-alerts */
export function saveCrisisAlert(req: Request, res: Response) {
    try {
        const userId = (req as any).userId;
        const { planningId, alertType, severity, crValue, deficitPieces, proposedAction } = req.body;

        if (!planningId || !alertType || !severity) {
            return res.status(400).json({ error: 'planningId, alertType, severity required' });
        }

        const id = `ca-${randomUUID()}`;
        db.prepare(`
            INSERT INTO crisis_alerts (id, owner_id, planning_id, alert_type, severity, cr_value, deficit_pieces, proposed_action)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, userId, planningId, alertType, severity, crValue ?? null, deficitPieces ?? null, proposedAction ? JSON.stringify(proposedAction) : null);

        res.json({ success: true, id });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

/** PUT /api/scheduling/crisis-alerts/:id */
export function updateCrisisAlert(req: Request, res: Response) {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'status required' });

        const resolvedAt = status === 'ACCEPTED' || status === 'DISMISSED'
            ? new Date().toISOString()
            : null;

        db.prepare(
            'UPDATE crisis_alerts SET status = ?, resolved_at = ? WHERE id = ?'
        ).run(status, resolvedAt, req.params.id);

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}

// ─── CR Batch Update (after Suivi save) ─────────────────────────────────────

/** POST /api/scheduling/update-cr — Updates CR for all active planning events */
export function updateAllCR(req: Request, res: Response) {
    try {
        const userId = (req as any).userId;

        // Fetch all active events
        const events = db.prepare(
            `SELECT id, cr_value, cr_status, accumulated_deficit FROM planning_events 
             WHERE owner_id = ? AND status NOT IN ('DONE')`
        ).all(userId) as any[];

        // CR values come from frontend calculation (passed in body)
        const { updates } = req.body as {
            updates: Array<{
                id: string;
                crValue: number;
                crStatus: string;
                accumulatedDeficit: number;
            }>;
        };

        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({ error: 'updates array required' });
        }

        const updateStmt = db.prepare(
            `UPDATE planning_events SET cr_value = ?, cr_status = ?, accumulated_deficit = ? WHERE id = ?`
        );

        const tx = db.transaction(() => {
            for (const u of updates) {
                updateStmt.run(u.crValue, u.crStatus, u.accumulatedDeficit || 0, u.id);
            }
        });
        tx();

        res.json({ success: true, updated: updates.length });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
