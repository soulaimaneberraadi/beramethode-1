import { Request, Response } from 'express';
import db from './db';

export const getModels = (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  try {
    const stmt = db.prepare('SELECT data FROM models WHERE user_id = ? ORDER BY updated_at DESC');
    const rows = stmt.all(userId);
    const models = rows.map((row: any) => JSON.parse(row.data));
    res.json(models);
  } catch (error) {
    console.error('Get models error:', error);
    res.status(500).json({ message: 'Error fetching models' });
  }
};

export const saveModel = (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const model = req.body;
  
  if (!model.id) {
    return res.status(400).json({ message: 'Model ID is required' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO models (id, user_id, data, updated_at) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET 
      data = excluded.data,
      updated_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(model.id, userId, JSON.stringify(model));
    res.json({ message: 'Model saved successfully' });
  } catch (error) {
    console.error('Save model error:', error);
    res.status(500).json({ message: 'Error saving model' });
  }
};

export const deleteModel = (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const stmt = db.prepare('DELETE FROM models WHERE id = ? AND user_id = ?');
    const info = stmt.run(id, userId);

    if (info.changes === 0) {
      return res.status(404).json({ message: 'Model not found' });
    }

    res.json({ message: 'Model deleted successfully' });
  } catch (error) {
    console.error('Delete model error:', error);
    res.status(500).json({ message: 'Error deleting model' });
  }
};
