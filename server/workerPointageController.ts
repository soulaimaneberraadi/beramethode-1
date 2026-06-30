import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import db from './db';

export const getPointage = (req: Request, res: Response) => {
    const userId = (req as any).companyId ?? (req as any).user.id;
    const { from, to, workerId } = req.query as any;
    try {
        const clauses = ['owner_id = ?'];
        const params: any[] = [userId];
        if (workerId) { clauses.push('worker_id = ?'); params.push(workerId); }
        if (from) { clauses.push('date >= ?'); params.push(from); }
        if (to) { clauses.push('date <= ?'); params.push(to); }
        const sql = `SELECT * FROM worker_pointage WHERE ${clauses.join(' AND ')} ORDER BY date DESC, worker_id ASC`;
        const rows = db.prepare(sql).all(...params);
        res.json(rows);
    } catch (error) {
        console.error('Get pointage error:', error);
        res.status(500).json({ message: 'Error fetching pointage' });
    }
};

export const savePointage = (req: Request, res: Response) => {
    const userId = (req as any).companyId ?? (req as any).user.id;
    const p = req.body;

    if (!p?.id || !p?.worker_id || !p?.date) {
        return res.status(400).json({ message: 'id, worker_id, date required' });
    }

    try {
        db.prepare(`
            INSERT INTO worker_pointage
            (id, owner_id, worker_id, date, chaine, poste_assigned, status, heure_entree, heure_sortie, heures_travaillees, heures_supp_25, heures_supp_50, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(worker_id, date) DO UPDATE SET
              chaine=excluded.chaine, poste_assigned=excluded.poste_assigned, status=excluded.status,
              heure_entree=excluded.heure_entree, heure_sortie=excluded.heure_sortie,
              heures_travaillees=excluded.heures_travaillees,
              heures_supp_25=excluded.heures_supp_25, heures_supp_50=excluded.heures_supp_50,
              notes=excluded.notes
        `).run(
            p.id, userId, p.worker_id, p.date,
            p.chaine || null, p.poste_assigned || null,
            p.status || 'PRESENT',
            p.heure_entree || null, p.heure_sortie || null,
            p.heures_travaillees ?? null,
            p.heures_supp_25 || 0, p.heures_supp_50 || 0,
            p.notes || null
        );
        res.json({ message: 'Pointage saved', id: p.id });
    } catch (error) {
        console.error('Save pointage error:', error);
        res.status(500).json({ message: 'Error saving pointage' });
    }
};

export const bulkSavePointage = (req: Request, res: Response) => {
    const userId = (req as any).companyId ?? (req as any).user.id;
    const { entries } = req.body;
    if (!Array.isArray(entries)) {
        return res.status(400).json({ message: 'entries array required' });
    }
    try {
        const stmt = db.prepare(`
            INSERT INTO worker_pointage
            (id, owner_id, worker_id, date, chaine, poste_assigned, status, heure_entree, heure_sortie, heures_travaillees, heures_supp_25, heures_supp_50, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(worker_id, date) DO UPDATE SET
              chaine=excluded.chaine, poste_assigned=excluded.poste_assigned, status=excluded.status,
              heure_entree=excluded.heure_entree, heure_sortie=excluded.heure_sortie,
              heures_travaillees=excluded.heures_travaillees,
              heures_supp_25=excluded.heures_supp_25, heures_supp_50=excluded.heures_supp_50,
              notes=excluded.notes
        `);
        const tx = db.transaction(() => {
            for (const p of entries) {
                if (!p.id || !p.worker_id || !p.date) continue;
                stmt.run(
                    p.id, userId, p.worker_id, p.date,
                    p.chaine || null, p.poste_assigned || null,
                    p.status || 'PRESENT',
                    p.heure_entree || null, p.heure_sortie || null,
                    p.heures_travaillees ?? null,
                    p.heures_supp_25 || 0, p.heures_supp_50 || 0,
                    p.notes || null
                );
            }
        });
        tx();
        res.json({ message: 'Bulk pointage saved', count: entries.length });
    } catch (error) {
        console.error('Bulk pointage error:', error);
        res.status(500).json({ message: 'Error bulk saving pointage' });
    }
};

export const deletePointage = (req: Request, res: Response) => {
    const userId = (req as any).companyId ?? (req as any).user.id;
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM worker_pointage WHERE id = ? AND owner_id = ?').run(id, userId);
        res.json({ message: 'Pointage deleted' });
    } catch (error) {
        console.error('Delete pointage error:', error);
        res.status(500).json({ message: 'Error deleting pointage' });
    }
};

/**
 * Export pointage mensuel → fichier Excel.
 * Query: ?mois=2026-05  (obligatoire, format YYYY-MM)
 *        &chaine=C1      (optionnel)
 */
export const exportPointageMensuel = async (req: Request, res: Response) => {
    const userId = (req as any).companyId ?? (req as any).user.id;
    const { mois, chaine } = req.query as { mois?: string; chaine?: string };

    if (!mois || !/^\d{4}-\d{2}$/.test(mois)) {
        return res.status(400).json({ message: 'Paramètre mois requis (format YYYY-MM)' });
    }

    const from = `${mois}-01`;
    const to = `${mois}-31`;

    try {
        const clauses = ['p.owner_id = ?', 'p.date >= ?', 'p.date <= ?'];
        const params: any[] = [userId, from, to];
        if (chaine) { clauses.push('p.chaine = ?'); params.push(chaine); }

        const rows = db.prepare(`
            SELECT
              w.matricule, w.nom, w.prenom,
              p.date, p.chaine, p.poste_assigned, p.status,
              p.heure_entree, p.heure_sortie,
              p.heures_travaillees, p.heures_supp_25, p.heures_supp_50, p.notes
            FROM worker_pointage p
            LEFT JOIN workers w ON p.worker_id = w.id AND w.owner_id = p.owner_id
            WHERE ${clauses.join(' AND ')}
            ORDER BY w.matricule ASC, p.date ASC
        `).all(...params) as any[];

        // Agréger par ouvrier
        const byWorker = new Map<string, {
            matricule: string; nom: string; prenom: string;
            present: number; absent: number; conge: number; maladie: number; retard: number;
            heures: number; hs25: number; hs50: number;
            details: { date: string; status: string; heures: number | null }[];
        }>();

        for (const r of rows) {
            const key = r.matricule || `${r.nom} ${r.prenom}`;
            if (!byWorker.has(key)) {
                byWorker.set(key, {
                    matricule: r.matricule || '', nom: r.nom || '', prenom: r.prenom || '',
                    present: 0, absent: 0, conge: 0, maladie: 0, retard: 0,
                    heures: 0, hs25: 0, hs50: 0, details: [],
                });
            }
            const w = byWorker.get(key)!;
            const s = (r.status || 'PRESENT').toUpperCase();
            if (s === 'PRESENT') w.present++;
            else if (s === 'ABSENT') w.absent++;
            else if (s === 'CONGE') w.conge++;
            else if (s === 'MALADIE') w.maladie++;
            else if (s === 'RETARD') { w.retard++; w.present++; }
            w.heures += r.heures_travaillees || 0;
            w.hs25 += r.heures_supp_25 || 0;
            w.hs50 += r.heures_supp_50 || 0;
            w.details.push({ date: r.date, status: s, heures: r.heures_travaillees });
        }

        const wb = new ExcelJS.Workbook();
        wb.creator = 'BERAMETHODE';
        wb.created = new Date();

        // ─── Feuille Résumé ───────────────────────────────────────────────
        const ws = wb.addWorksheet('Résumé', {
            views: [{ state: 'frozen', ySplit: 2 }],
        });

        const labelFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2149C1' } };
        const subFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe8edf8' } };
        const thin = { style: 'thin' as const, color: { argb: 'FFcbd5e1' } };
        const border = { top: thin, left: thin, bottom: thin, right: thin };

        // Titre
        ws.mergeCells('A1:L1');
        const title = ws.getCell('A1');
        title.value = `Pointage mensuel — ${mois}${chaine ? ` — ${chaine}` : ''}`;
        title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
        title.fill = labelFill;
        title.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(1).height = 28;

        // En-têtes colonnes
        const headers = [
            'Matricule', 'Nom', 'Prénom',
            'Présents', 'Absents', 'Congés', 'Maladies', 'Retards',
            'H. Travaillées', 'H. Supp 25%', 'H. Supp 50%', 'Total H. Supp',
        ];
        const hRow = ws.getRow(2);
        headers.forEach((h, i) => {
            const cell = hRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, size: 10, color: { argb: 'FF1e3a8a' } };
            cell.fill = subFill;
            cell.border = border;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
        hRow.height = 32;
        ws.columns = [
            { width: 12 }, { width: 18 }, { width: 18 },
            { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 },
            { width: 14 }, { width: 13 }, { width: 13 }, { width: 13 },
        ];

        let rowIdx = 3;
        for (const w of byWorker.values()) {
            const row = ws.getRow(rowIdx++);
            const vals = [
                w.matricule, w.nom, w.prenom,
                w.present, w.absent, w.conge, w.maladie, w.retard,
                +w.heures.toFixed(2), +w.hs25.toFixed(2), +w.hs50.toFixed(2),
                +(w.hs25 + w.hs50).toFixed(2),
            ];
            vals.forEach((v, i) => {
                const cell = row.getCell(i + 1);
                cell.value = v;
                cell.border = border;
                cell.alignment = { horizontal: i < 3 ? 'left' : 'center', vertical: 'middle' };
                if (typeof v === 'number' && i >= 3) {
                    cell.numFmt = i >= 8 ? '0.00' : '0';
                }
            });
            row.height = 20;
        }

        // Ligne TOTAUX
        if (byWorker.size > 0) {
            const totalRow = ws.getRow(rowIdx);
            totalRow.getCell(1).value = 'TOTAL';
            totalRow.getCell(1).font = { bold: true };
            [4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(col => {
                const cell = totalRow.getCell(col);
                cell.value = { formula: `SUM(${ws.getColumn(col).letter}3:${ws.getColumn(col).letter}${rowIdx - 1})` };
                cell.font = { bold: true };
                cell.numFmt = col >= 9 ? '0.00' : '0';
                cell.border = border;
                cell.fill = subFill;
            });
            totalRow.getCell(1).border = border;
            totalRow.getCell(1).fill = subFill;
            totalRow.height = 22;
        }

        // ─── Feuille Détail (1 ligne par jour par ouvrier) ──────────────
        const wsDet = wb.addWorksheet('Détail jours', {
            views: [{ state: 'frozen', ySplit: 1 }],
        });
        wsDet.columns = [
            { header: 'Matricule', key: 'mat', width: 12 },
            { header: 'Nom', key: 'nom', width: 16 },
            { header: 'Prénom', key: 'prenom', width: 16 },
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Statut', key: 'status', width: 12 },
            { header: 'Heures', key: 'heures', width: 10 },
        ];
        const detHRow = wsDet.getRow(1);
        detHRow.eachCell(c => {
            c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            c.fill = labelFill;
            c.border = border;
            c.alignment = { horizontal: 'center' };
        });
        detHRow.height = 24;

        for (const w of byWorker.values()) {
            for (const d of w.details) {
                const r = wsDet.addRow({
                    mat: w.matricule, nom: w.nom, prenom: w.prenom,
                    date: d.date, status: d.status,
                    heures: d.heures != null ? +d.heures.toFixed(2) : '',
                });
                r.eachCell(c => { c.border = border; c.alignment = { vertical: 'middle' }; });
            }
        }

        const filename = `pointage_${mois}${chaine ? `_${chaine}` : ''}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Export pointage error:', error);
        res.status(500).json({ message: 'Error exporting Excel' });
    }
};

/**
 * Summary: presence stats for a worker over N days.
 * Query: ?workerId=xxx&days=30
 */
export const getWorkerActivity = (req: Request, res: Response) => {
    const userId = (req as any).companyId ?? (req as any).user.id;
    const { workerId, days } = req.query as any;
    if (!workerId) return res.status(400).json({ message: 'workerId required' });

    const n = Math.min(parseInt(days || '30', 10) || 30, 365);
    const since = new Date();
    since.setDate(since.getDate() - n);
    const sinceIso = since.toISOString().slice(0, 10);

    try {
        const stats = db.prepare(`
            SELECT
              SUM(CASE WHEN status='PRESENT' THEN 1 ELSE 0 END) as present,
              SUM(CASE WHEN status='ABSENT' THEN 1 ELSE 0 END) as absent,
              SUM(CASE WHEN status='CONGE' THEN 1 ELSE 0 END) as conge,
              SUM(CASE WHEN status='MALADIE' THEN 1 ELSE 0 END) as maladie,
              SUM(CASE WHEN status='RETARD' THEN 1 ELSE 0 END) as retard,
              SUM(COALESCE(heures_travaillees,0)) as total_hours,
              SUM(COALESCE(heures_supp_25,0)) as hs_25,
              SUM(COALESCE(heures_supp_50,0)) as hs_50
            FROM worker_pointage
            WHERE owner_id = ? AND worker_id = ? AND date >= ?
        `).get(userId, workerId, sinceIso);
        res.json({ days: n, since: sinceIso, ...(stats as any) });
    } catch (error) {
        console.error('Activity error:', error);
        res.status(500).json({ message: 'Error computing activity' });
    }
};
