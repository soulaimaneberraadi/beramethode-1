import { Request, Response } from 'express';
import db from './db';

// Get all production lines for SuiviLive
export const getProductionLines = (req: Request, res: Response) => {
  try {
    const lines = db.prepare('SELECT * FROM production_lines ORDER BY id ASC').all();
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
  
  try {
    const stmt = db.prepare(`
      UPDATE production_lines 
      SET status = ?, progress = ?, efficiency = ?, alert = ?, alertMsg = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const info = stmt.run(status, progress, efficiency, alert ? 1 : 0, alertMsg, id);
    
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
export const getProductionDaily = (req: Request, res: Response) => {
  try {
    const data = db.prepare('SELECT * FROM production_daily ORDER BY date ASC LIMIT 7').all();
    res.json(data);
  } catch (error) {
    console.error('Error fetching daily production:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
