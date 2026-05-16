import { Request, Response } from 'express';
import db from './db';

type SkillLevel = 'BEGINNER' | 'AVERAGE' | 'GOOD' | 'EXPERT';

function computeLevel(ratio: number): SkillLevel {
    if (ratio >= 1.2) return 'EXPERT';
    if (ratio >= 1.0) return 'GOOD';
    if (ratio >= 0.8) return 'AVERAGE';
    return 'BEGINNER';
}

export const getWorkerSkills = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { workerId } = req.query;
    try {
        const rows = workerId
            ? db.prepare('SELECT * FROM worker_skills WHERE owner_id = ? AND worker_id = ? ORDER BY level DESC, pieces_per_hour_avg DESC').all(userId, workerId)
            : db.prepare('SELECT * FROM worker_skills WHERE owner_id = ? ORDER BY worker_id, level DESC').all(userId);
        res.json(rows);
    } catch (error) {
        console.error('Get skills error:', error);
        res.status(500).json({ message: 'Error fetching skills' });
    }
};

export const saveWorkerSkill = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const s = req.body;

    if (!s?.id || !s?.worker_id || !s?.poste_keyword || !s?.level) {
        return res.status(400).json({ message: 'id, worker_id, poste_keyword, level required' });
    }

    try {
        db.prepare(`
            INSERT INTO worker_skills
            (id, owner_id, worker_id, poste_keyword, fabric_type, level, source, pieces_total, pieces_per_hour_avg, quality_rate, last_worked_date, notes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(worker_id, poste_keyword, fabric_type) DO UPDATE SET
              level=excluded.level, source=excluded.source, pieces_total=excluded.pieces_total,
              pieces_per_hour_avg=excluded.pieces_per_hour_avg, quality_rate=excluded.quality_rate,
              last_worked_date=excluded.last_worked_date, notes=excluded.notes, updated_at=CURRENT_TIMESTAMP
        `).run(
            s.id, userId, s.worker_id, s.poste_keyword, s.fabric_type || null,
            s.level, s.source || 'MANUAL', s.pieces_total || 0,
            s.pieces_per_hour_avg ?? null, s.quality_rate ?? null,
            s.last_worked_date || null, s.notes || null
        );
        res.json({ message: 'Skill saved', id: s.id });
    } catch (error) {
        console.error('Save skill error:', error);
        res.status(500).json({ message: 'Error saving skill' });
    }
};

export const deleteWorkerSkill = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM worker_skills WHERE id = ? AND owner_id = ?').run(id, userId);
        res.json({ message: 'Skill deleted' });
    } catch (error) {
        console.error('Delete skill error:', error);
        res.status(500).json({ message: 'Error deleting skill' });
    }
};

/**
 * Auto-skill updater — called after a Suivi entry.
 * Body: { worker_id, poste_keyword, fabric_type?, pieces_produced, hours_worked, poste_avg_pieces_per_hour?, defaults? }
 */
export const updateSkillFromSuivi = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { worker_id, poste_keyword, fabric_type, pieces_produced, hours_worked, poste_avg_pieces_per_hour, quality_rate } = req.body;

    if (!worker_id || !poste_keyword || !pieces_produced || !hours_worked) {
        return res.status(400).json({ message: 'worker_id, poste_keyword, pieces_produced, hours_worked required' });
    }
    if (hours_worked <= 0) return res.status(400).json({ message: 'hours_worked must be > 0' });

    try {
        const existing = db.prepare(
            'SELECT * FROM worker_skills WHERE owner_id = ? AND worker_id = ? AND poste_keyword = ? AND COALESCE(fabric_type, "") = COALESCE(?, "")'
        ).get(userId, worker_id, poste_keyword, fabric_type || null) as any;

        const newSessionAvg = pieces_produced / hours_worked;
        const prevTotal = existing?.pieces_total || 0;
        const prevAvg = existing?.pieces_per_hour_avg || 0;
        const newTotal = prevTotal + pieces_produced;
        const weightedAvg = prevTotal > 0
            ? ((prevAvg * prevTotal) + (newSessionAvg * pieces_produced)) / newTotal
            : newSessionAvg;

        const posteAvg = poste_avg_pieces_per_hour || weightedAvg;
        const level = computeLevel(posteAvg > 0 ? weightedAvg / posteAvg : 1);

        const today = new Date().toISOString().slice(0, 10);
        const id = existing?.id || `sk_${worker_id}_${poste_keyword}_${fabric_type || 'all'}_${Date.now()}`;

        db.prepare(`
            INSERT INTO worker_skills
            (id, owner_id, worker_id, poste_keyword, fabric_type, level, source, pieces_total, pieces_per_hour_avg, quality_rate, last_worked_date, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'AUTO', ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(worker_id, poste_keyword, fabric_type) DO UPDATE SET
              level=excluded.level, pieces_total=excluded.pieces_total,
              pieces_per_hour_avg=excluded.pieces_per_hour_avg,
              quality_rate=COALESCE(excluded.quality_rate, worker_skills.quality_rate),
              last_worked_date=excluded.last_worked_date, source='AUTO', updated_at=CURRENT_TIMESTAMP
        `).run(
            id, userId, worker_id, poste_keyword, fabric_type || null,
            level, newTotal, weightedAvg,
            quality_rate ?? null, today
        );

        res.json({ message: 'Skill updated', id, level, pieces_total: newTotal, pieces_per_hour_avg: weightedAvg });
    } catch (error) {
        console.error('Auto skill update error:', error);
        res.status(500).json({ message: 'Error updating skill' });
    }
};
