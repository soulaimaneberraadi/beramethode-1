import { Request, Response } from 'express';
import db from './db';

// Get all settings or specific groups (scoped to authenticated owner)
export const getSettings = (req: Request, res: Response) => {
    try {
        // Cloisonnement par workspace : société active (companyId), repli user.id.
        const ownerId = (req as any).companyId ?? (req as any).user?.id;
        if (ownerId == null) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const settings = db.prepare('SELECT key, value FROM app_settings WHERE owner_id = ?').all(ownerId);
        const config: Record<string, any> = {};
        
        for (const row of settings as any[]) {
            // Try to parse JSON values, otherwise keep as string
            try {
                config[row.key] = JSON.parse(row.value);
            } catch {
                config[row.key] = row.value;
            }
        }
        res.json(config);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ message: 'Error fetching settings' });
    }
};

// Save multiple settings at once
export const saveSettings = (req: Request, res: Response) => {
    const payload = req.body; // Expects { key: value, ... }
    const owner_id = (req as any).companyId ?? (req as any).user?.id;
    if (owner_id == null) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    try {
        const transaction = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO app_settings (owner_id, key, value) 
                VALUES (?, ?, ?) 
                ON CONFLICT(owner_id, key) DO UPDATE SET value = excluded.value
            `);
            
            for (const [key, value] of Object.entries(payload)) {
                const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
                stmt.run(owner_id, key, valStr);
            }
        });

        transaction();
        res.json({ message: 'Settings saved successfully' });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ message: 'Error saving settings' });
    }
};
