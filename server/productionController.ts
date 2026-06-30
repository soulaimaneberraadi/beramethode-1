import { Request, Response } from 'express';
import db from './db';

// Cloisonnement par workspace (= owner_id société active, injecté par authenticateToken).
const ownerOf = (req: Request) => (req as any).companyId ?? (req as any).user?.id;

/** Réamorce des lignes démo pour un workspace qui n'en a pas encore (SuiviLive). */
const seedDemoLines = (ownerId: number) => {
  const ins = db.prepare(
    "INSERT INTO production_lines (owner_id, name, status, progress, efficiency, model, operator, alert, alertMsg) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const rows: [string, string, number, number, string, number, number, string][] = [
    ['CHAINE A', 'prod', 78, 94, 'POLO M/C', 12, 0, ''],
    ['CHAINE B', 'prod', 45, 88, 'VESTE SLIM', 18, 1, 'Rupture Fil'],
    ['CHAINE C', 'prod', 92, 97, 'CHEMISE CL', 10, 0, ''],
    ['CHAINE D', 'stop', 0, 0, '---', 0, 0, ''],
    ['CHAINE E', 'setup', 15, 55, 'JUPE MIDI', 8, 0, ''],
    ['CHAINE F', 'prod', 62, 91, 'VESTE JEAN', 15, 0, ''],
  ];
  const tx = db.transaction(() => { for (const r of rows) ins.run(ownerId, ...r); });
  tx();
};

// Get all production lines for SuiviLive
export const getProductionLines = (req: Request, res: Response) => {
  try {
    const ownerId = ownerOf(req);
    let lines = db.prepare('SELECT * FROM production_lines WHERE owner_id = ? ORDER BY id ASC').all(ownerId);
    if (lines.length === 0) {
      // Nouveau workspace : amorce les lignes démo pour CE workspace uniquement.
      seedDemoLines(ownerId);
      lines = db.prepare('SELECT * FROM production_lines WHERE owner_id = ? ORDER BY id ASC').all(ownerId);
    }
    // Convert alert from 0/1 to boolean to match frontend expectation
    const formattedLines = lines.map((line: any) => ({
      ...line,
      alert: line.alert === 1
    }));
    res.json(formattedLines);
  } catch (error) {
    console.error('Error fetching production lines:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// Update a production line status (if requested later)
export const updateProductionLine = (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, progress, efficiency, alert, alertMsg } = req.body;
  const ownerId = ownerOf(req);

  try {
    // owner_id dans le WHERE : on ne modifie que les lignes du workspace actif.
    const stmt = db.prepare(`
      UPDATE production_lines
      SET status = ?, progress = ?, efficiency = ?, alert = ?, alertMsg = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_id = ?
    `);

    const info = stmt.run(status, progress, efficiency, alert ? 1 : 0, alertMsg, id, ownerId);
    
    if (info.changes === 0) {
      return res.status(404).json({ message: 'Line not found' });
    }
    
    res.json({ message: 'Line updated successfully' });
  } catch (error) {
    console.error('Error updating production line:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// Get daily production statistics for Analysis
const seedDemoDaily = (ownerId: number) => {
  const ins = db.prepare('INSERT INTO production_daily (owner_id, date, name, output, target, efficiency) VALUES (?, ?, ?, ?, ?, ?)');
  const rows: [string, string, number, number, number][] = [
    ['2026-04-06', 'Lun', 400, 500, 80], ['2026-04-07', 'Mar', 520, 500, 104],
    ['2026-04-08', 'Mer', 480, 500, 96], ['2026-04-09', 'Jeu', 610, 500, 122],
    ['2026-04-10', 'Ven', 550, 500, 110], ['2026-04-11', 'Sam', 300, 400, 75],
  ];
  const tx = db.transaction(() => { for (const r of rows) ins.run(ownerId, ...r); });
  tx();
};

export const getProductionDaily = (req: Request, res: Response) => {
  try {
    const ownerId = ownerOf(req);
    let data = db.prepare('SELECT * FROM production_daily WHERE owner_id = ? ORDER BY date ASC LIMIT 7').all(ownerId);
    if (data.length === 0) {
      seedDemoDaily(ownerId);
      data = db.prepare('SELECT * FROM production_daily WHERE owner_id = ? ORDER BY date ASC LIMIT 7').all(ownerId);
    }
    res.json(data);
  } catch (error) {
    console.error('Error fetching daily production:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
