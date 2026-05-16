import { Request, Response } from 'express';
import db from './db';
import crypto from 'crypto';
import { buildSageMoisCsv, computeSageMoisForOwner } from './sageMonthPay';

export const getSageExports = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const exports = db.prepare('SELECT * FROM hr_sage_exports WHERE owner_id = ? ORDER BY mois DESC').all(userId);
        res.json(exports);
    } catch (e) {
        res.status(500).json({ message: 'Erreur' });
    }
};

function paramString(v: string | string[] | undefined): string {
    if (v === undefined) return '';
    return Array.isArray(v) ? (v[0] ?? '') : v;
}

export const previewSageExport = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const mois = paramString(req.params.mois);
    try {
        const data = computeSageMoisForOwner(userId, mois);
        if (!data) {
            return res.status(400).json({ message: 'Mois invalide (attendu YYYY-MM)' });
        }
        res.json({ mois: data.mois, rows: data.rows });
    } catch (error) {
        res.status(500).json({ message: 'Erreur' });
    }
};

export const generateSageExport = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const mois = paramString(req.params.mois);
    try {
        const data = computeSageMoisForOwner(userId, mois);
        if (!data) {
            return res.status(400).json({ message: 'Mois invalide (attendu YYYY-MM)' });
        }
        const csv = buildSageMoisCsv(data.rows);
        const body = '\ufeff' + csv;
        db.prepare('INSERT INTO hr_sage_exports (id, mois, date_export, owner_id) VALUES (?, ?, ?, ?)').run(
            crypto.randomUUID(),
            mois,
            new Date().toISOString(),
            userId,
        );
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="SAGE_PAIE_BERAMETHODE_${mois}.csv"`);
        res.status(200).send(Buffer.from(body, 'utf8'));
    } catch (e) {
        res.status(500).json({ message: 'Erreur' });
    }
};
