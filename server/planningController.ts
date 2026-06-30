import { Request, Response } from 'express';
import db from './db';

// Get all planning events for user
export const getPlanningEvents = (req: Request, res: Response) => {
    // Cloisonnement par workspace : owner_id = société active (companyId), repli user.id.
    const userId = (req as any).companyId ?? (req as any).user.id;
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
    // Cloisonnement par workspace : owner_id = société active (companyId), repli user.id.
    const userId = (req as any).companyId ?? (req as any).user.id;
    const { events } = req.body;

    if (!Array.isArray(events)) {
        return res.status(400).json({ message: 'events array is required' });
    }

    try {
        const transaction = db.transaction(() => {
            // 1. Sync deletions: find events in database that are NOT in the incoming events list
            const receivedIds = events.map((ev: any) => ev.id).filter(Boolean);
            const existingEvents = db.prepare('SELECT id FROM planning_events WHERE owner_id = ?').all(userId) as { id: string }[];
            const existingIds = existingEvents.map(e => e.id);
            const idsToDelete = existingIds.filter(id => !receivedIds.includes(id));

            for (const id of idsToDelete) {
                // Release reservations first
                const existingReservations = db.prepare('SELECT lotId, quantite FROM planning_reservations WHERE planningId = ?').all(id) as any[];
                for (const r of existingReservations) {
                    db.prepare('UPDATE magasin_lots SET quantiteReservee = MAX(0, quantiteReservee - ?) WHERE id = ?').run(r.quantite, r.lotId);
                }
                // Delete event
                db.prepare('DELETE FROM planning_events WHERE id = ? AND owner_id = ?').run(id, userId);
            }

            // 2. Upsert incoming events
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
    // Cloisonnement par workspace : owner_id = société active (companyId), repli user.id.
    const userId = (req as any).companyId ?? (req as any).user.id;
    const { id } = req.params;

    try {
        const transaction = db.transaction(() => {
            // 1. Release reservations to update magasin_lots.quantiteReservee
            const existing = db.prepare('SELECT lotId, quantite FROM planning_reservations WHERE planningId = ?').all(id) as any[];
            for (const r of existing) {
                db.prepare('UPDATE magasin_lots SET quantiteReservee = MAX(0, quantiteReservee - ?) WHERE id = ?').run(r.quantite, r.lotId);
            }
            // 2. Delete planning event
            db.prepare('DELETE FROM planning_events WHERE id = ? AND owner_id = ?').run(id, userId);
        });

        transaction();
        res.json({ message: 'Planning event deleted successfully' });
    } catch (error) {
        console.error('Delete planning error:', error);
        res.status(500).json({ message: 'Error deleting planning event' });
    }
};

// Get reservations for a planning event
export const getReservations = (req: Request, res: Response) => {
    // Cloisonnement par workspace : owner_id = société active (companyId), repli user.id.
    const userId = (req as any).companyId ?? (req as any).user.id;
    const { planningId } = req.params;

    try {
        const stmt = db.prepare(`
            SELECT r.*, p.designation AS productName, l.numBain, l.variante, l.quantiteRestante
            FROM planning_reservations r
            JOIN planning_events e ON r.planningId = e.id
            JOIN magasin_products p ON r.productId = p.id
            JOIN magasin_lots l ON r.lotId = l.id
            WHERE r.planningId = ? AND e.owner_id = ?
        `);
        const rows = stmt.all(planningId, userId);
        res.json(rows);
    } catch (error) {
        console.error('Get reservations error:', error);
        res.status(500).json({ message: 'Error fetching reservations' });
    }
};

// Create / update reservations for a planning event
export const saveReservations = (req: Request, res: Response) => {
    // Cloisonnement par workspace : owner_id = société active (companyId), repli user.id.
    const userId = (req as any).companyId ?? (req as any).user.id;
    const { planningId } = req.params;
    const { allocations } = req.body; // Array of { productId, lotId, quantite }

    if (!Array.isArray(allocations)) {
        return res.status(400).json({ message: 'allocations array is required' });
    }

    try {
        const transaction = db.transaction(() => {
            // Verify planning event exists and belongs to user
            const ev = db.prepare('SELECT id FROM planning_events WHERE id = ? AND owner_id = ?').get(planningId, userId);
            if (!ev) throw new Error('Planning event not found or unauthorized');

            // 1. Release existing reservations first
            const existing = db.prepare('SELECT lotId, quantite FROM planning_reservations WHERE planningId = ?').all(planningId) as any[];
            for (const r of existing) {
                db.prepare('UPDATE magasin_lots SET quantiteReservee = MAX(0, quantiteReservee - ?) WHERE id = ?').run(r.quantite, r.lotId);
            }
            db.prepare('DELETE FROM planning_reservations WHERE planningId = ?').run(planningId);

            // 2. Insert new reservations & update lot quantiteReservee
            const insertStmt = db.prepare(`
                INSERT INTO planning_reservations (id, planningId, productId, lotId, quantite)
                VALUES (?, ?, ?, ?, ?)
            `);
            const updateLotStmt = db.prepare(`
                UPDATE magasin_lots SET quantiteReservee = quantiteReservee + ? WHERE id = ?
            `);

            for (const alloc of allocations) {
                const id = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                insertStmt.run(id, planningId, alloc.productId, alloc.lotId, alloc.quantite);
                updateLotStmt.run(alloc.quantite, alloc.lotId);
            }
        });

        transaction();
        res.json({ message: 'Reservations saved successfully' });
    } catch (error: any) {
        console.error('Save reservations error:', error);
        res.status(500).json({ message: error.message || 'Error saving reservations' });
    }
};

// Deduct reserved stock (completing or starting production)
export const deductReservations = (req: Request, res: Response) => {
    // Cloisonnement par workspace : owner_id = société active (companyId), repli user.id.
    const userId = (req as any).companyId ?? (req as any).user.id;
    const { planningId } = req.params;

    try {
        const transaction = db.transaction(() => {
            // Get planning event details
            const evRow = db.prepare('SELECT raw_data FROM planning_events WHERE id = ? AND owner_id = ?').get(planningId, userId) as any;
            if (!evRow) throw new Error('Planning event not found or unauthorized');
            const ev = JSON.parse(evRow.raw_data);

            const reservations = db.prepare(`
                SELECT r.*, l.prixUnitaire, l.numBain, l.variante
                FROM planning_reservations r
                JOIN magasin_lots l ON r.lotId = l.id
                WHERE r.planningId = ?
            `).all(planningId) as any[];

            if (reservations.length === 0) {
                throw new Error('Aucune réservation trouvée à déduire pour cet ordre de fabrication.');
            }

            const mvtStmt = db.prepare(`
                INSERT INTO magasin_mouvements (id, productId, type, source, destination, quantite, prixUnitaire, chaineId, modeleRef, date, operateurNom, notes, lotId, bain)
                VALUES (?, ?, 'SORTIE', 'Magasin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const updateLotStmt = db.prepare(`
                UPDATE magasin_lots 
                SET quantiteRestante = MAX(0, quantiteRestante - ?), 
                    quantiteReservee = MAX(0, quantiteReservee - ?) 
                WHERE id = ?
            `);

            const dateStr = new Date().toISOString().split('T')[0];

            for (const r of reservations) {
                const mvtId = `mvt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const destination = ev.chaineId || 'Production';
                const notes = `Déduction automatique via Planning (OF: ${ev.clientName || ''} - ${ev.modelName || ''})`;
                
                // Deduct from lot
                updateLotStmt.run(r.quantite, r.quantite, r.lotId);

                // Add movement
                mvtStmt.run(
                    mvtId, r.productId, destination, r.quantite, r.prixUnitaire, 
                    ev.chaineId || null, ev.modelName || ev.modelId || null, dateStr, 'Planning', notes, r.lotId, r.numBain || null
                );
            }

            // Delete the reservations
            db.prepare('DELETE FROM planning_reservations WHERE planningId = ?').run(planningId);
        });

        transaction();
        res.json({ message: 'Stock deducted successfully' });
    } catch (error: any) {
        console.error('Deduct stock error:', error);
        res.status(500).json({ message: error.message || 'Error deducting stock' });
    }
};

// Release / Cancel reservations
export const releaseReservations = (req: Request, res: Response) => {
    // Cloisonnement par workspace : owner_id = société active (companyId), repli user.id.
    const userId = (req as any).companyId ?? (req as any).user.id;
    const { planningId } = req.params;

    try {
        const transaction = db.transaction(() => {
            // Verify planning event exists and belongs to user
            const ev = db.prepare('SELECT id FROM planning_events WHERE id = ? AND owner_id = ?').get(planningId, userId);
            if (!ev) throw new Error('Planning event not found or unauthorized');

            const existing = db.prepare('SELECT lotId, quantite FROM planning_reservations WHERE planningId = ?').all(planningId) as any[];
            for (const r of existing) {
                db.prepare('UPDATE magasin_lots SET quantiteReservee = MAX(0, quantiteReservee - ?) WHERE id = ?').run(r.quantite, r.lotId);
            }
            db.prepare('DELETE FROM planning_reservations WHERE planningId = ?').run(planningId);
        });

        transaction();
        res.json({ message: 'Reservations released successfully' });
    } catch (error: any) {
        console.error('Release reservations error:', error);
        res.status(500).json({ message: error.message || 'Error releasing reservations' });
    }
};
