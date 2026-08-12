import { Request, Response } from 'express';
import db from './db';
import { randomUUID } from 'crypto';

// Get all subcontract orders
export const getSubcontractOrders = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    try {
        const stmt = db.prepare('SELECT * FROM subcontract_orders WHERE owner_id = ? ORDER BY created_at DESC');
        const rows = stmt.all(companyId) as any[];
        res.json(rows);
    } catch (error) {
        console.error('Get subcontract orders error:', error);
        res.status(500).json({ message: 'Error fetching subcontract orders' });
    }
};

// Create a subcontract order
export const createSubcontractOrder = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const {
        modelId, modelName, clientName, totalQuantity,
        subcontractorName, pricePerPiece, deliveryDate,
        status, sizes_json, colors_json, notes,
        tissuStatus, fournituresStatus, ficheTechniqueSent,
        qtyAccepted, qtyToRepair, qtyRejected,
        subcontractorPhone, subcontractorRating, subcontractorAvailabilityDate,
        prestationType, tissuFournisseur, fournituresFournisseur, conditionnementFournisseur,
        protoRequired, protoStatus, paymentTerms, defectRateAccepted,
        stitchingDetails, specifications_json
    } = req.body;

    if (!modelId || !totalQuantity || !subcontractorName || !deliveryDate) {
        return res.status(400).json({ message: 'Required fields are missing' });
    }

    try {
        const id = randomUUID();
        const stmt = db.prepare(`
            INSERT INTO subcontract_orders (
                id, owner_id, modelId, modelName, clientName, totalQuantity,
                subcontractorName, pricePerPiece, deliveryDate, status,
                sizes_json, colors_json, notes,
                tissuStatus, fournituresStatus, ficheTechniqueSent,
                qtyAccepted, qtyToRepair, qtyRejected,
                subcontractorPhone, subcontractorRating, subcontractorAvailabilityDate,
                prestationType, tissuFournisseur, fournituresFournisseur, conditionnementFournisseur,
                protoRequired, protoStatus, paymentTerms, defectRateAccepted,
                stitchingDetails, specifications_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            id,
            companyId,
            modelId,
            modelName || null,
            clientName || null,
            totalQuantity,
            subcontractorName,
            pricePerPiece || 0,
            deliveryDate,
            status || 'PENDING',
            sizes_json || null,
            colors_json || null,
            notes || null,
            tissuStatus || 'PENDING',
            fournituresStatus || 'PENDING',
            ficheTechniqueSent !== undefined ? ficheTechniqueSent : 0,
            qtyAccepted !== undefined ? qtyAccepted : 0,
            qtyToRepair !== undefined ? qtyToRepair : 0,
            qtyRejected !== undefined ? qtyRejected : 0,
            subcontractorPhone || null,
            subcontractorRating !== undefined ? subcontractorRating : 5,
            subcontractorAvailabilityDate || null,
            prestationType || 'CMT',
            tissuFournisseur || 'CLIENT',
            fournituresFournisseur || 'CLIENT',
            conditionnementFournisseur || 'CLIENT',
            protoRequired !== undefined ? protoRequired : 1,
            protoStatus || 'PENDING',
            paymentTerms || 'AVANCE_RECEPTION',
            defectRateAccepted !== undefined ? defectRateAccepted : 1.5,
            stitchingDetails || null,
            specifications_json || null
        );

        res.status(201).json({ message: 'Subcontract order created successfully', id });
    } catch (error) {
        console.error('Create subcontract order error:', error);
        res.status(500).json({ message: 'Error creating subcontract order' });
    }
};

// Update subcontract order
export const updateSubcontractOrder = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;

    // Whitelist of updatable columns → DB column name
    const textColumns: Record<string, string> = {
        modelId: 'modelId',
        modelName: 'modelName',
        clientName: 'clientName',
        subcontractorName: 'subcontractorName',
        deliveryDate: 'deliveryDate',
        status: 'status',
        sizes_json: 'sizes_json',
        colors_json: 'colors_json',
        notes: 'notes',
        tissuStatus: 'tissuStatus',
        fournituresStatus: 'fournituresStatus',
        subcontractorPhone: 'subcontractorPhone',
        subcontractorAvailabilityDate: 'subcontractorAvailabilityDate',
        prestationType: 'prestationType',
        tissuFournisseur: 'tissuFournisseur',
        fournituresFournisseur: 'fournituresFournisseur',
        conditionnementFournisseur: 'conditionnementFournisseur',
        protoStatus: 'protoStatus',
        paymentTerms: 'paymentTerms',
        stitchingDetails: 'stitchingDetails',
        specifications_json: 'specifications_json'
    };

    const numberColumns: Record<string, string> = {
        totalQuantity: 'totalQuantity',
        pricePerPiece: 'pricePerPiece',
        ficheTechniqueSent: 'ficheTechniqueSent',
        qtyAccepted: 'qtyAccepted',
        qtyToRepair: 'qtyToRepair',
        qtyRejected: 'qtyRejected',
        subcontractorRating: 'subcontractorRating',
        protoRequired: 'protoRequired',
        defectRateAccepted: 'defectRateAccepted'
    };

    const sets: string[] = [];
    const values: any[] = [];

    Object.entries(textColumns).forEach(([key, column]) => {
        if (req.body[key] !== undefined) {
            sets.push(`${column} = ?`);
            // Empty string clears the field (set to NULL); otherwise keep the value
            values.push(req.body[key] === '' ? null : req.body[key]);
        }
    });

    Object.entries(numberColumns).forEach(([key, column]) => {
        if (req.body[key] !== undefined && req.body[key] !== null) {
            sets.push(`${column} = ?`);
            values.push(req.body[key]);
        }
    });

    if (sets.length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
    }

    try {
        const stmt = db.prepare(`
            UPDATE subcontract_orders 
            SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND owner_id = ?
        `);

        const result = stmt.run(...values, id, companyId);

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Subcontract order not found or unauthorized' });
        }

        res.json({ message: 'Subcontract order updated successfully' });
    } catch (error) {
        console.error('Update subcontract order error:', error);
        res.status(500).json({ message: 'Error updating subcontract order' });
    }
};

// Delete subcontract order
export const deleteSubcontractOrder = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;

    try {
        const result = db.prepare('DELETE FROM subcontract_orders WHERE id = ? AND owner_id = ?').run(id, companyId);

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Subcontract order not found or unauthorized' });
        }

        res.json({ message: 'Subcontract order deleted successfully' });
    } catch (error) {
        console.error('Delete subcontract order error:', error);
        res.status(500).json({ message: 'Error deleting subcontract order' });
    }
};

// Get all subcontractor groups
export const getSubcontractorGroups = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    try {
        const stmt = db.prepare('SELECT * FROM subcontractor_groups WHERE owner_id = ? ORDER BY created_at DESC');
        const rows = stmt.all(companyId) as any[];
        res.json(rows.map(r => ({
            ...r,
            subcontractor_names: JSON.parse(r.subcontractor_names || '[]')
        })));
    } catch (error) {
        console.error('Get subcontractor groups error:', error);
        res.status(500).json({ message: 'Error fetching subcontractor groups' });
    }
};

// Create or update subcontractor group
export const saveSubcontractorGroup = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id, group_name, subcontractor_names } = req.body;

    if (!group_name) {
        return res.status(400).json({ message: 'Group name is required' });
    }

    try {
        const groupId = id || randomUUID();
        const namesJson = JSON.stringify(subcontractor_names || []);
        
        const stmt = db.prepare(`
            INSERT INTO subcontractor_groups (id, owner_id, group_name, subcontractor_names)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                group_name = excluded.group_name,
                subcontractor_names = excluded.subcontractor_names,
                updated_at = CURRENT_TIMESTAMP
        `);
        
        stmt.run(groupId, companyId, group_name, namesJson);
        res.json({ message: 'Subcontractor group saved successfully', id: groupId });
    } catch (error) {
        console.error('Save subcontractor group error:', error);
        res.status(500).json({ message: 'Error saving subcontractor group' });
    }
};

// Delete subcontractor group
export const deleteSubcontractorGroup = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;

    try {
        const result = db.prepare('DELETE FROM subcontractor_groups WHERE id = ? AND owner_id = ?').run(id, companyId);
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Subcontractor group not found or unauthorized' });
        }
        res.json({ message: 'Subcontractor group deleted successfully' });
    } catch (error) {
        console.error('Delete subcontractor group error:', error);
        res.status(500).json({ message: 'Error deleting subcontractor group' });
    }
};

// Get all subcontractor profiles
export const getSubcontractorProfiles = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    try {
        const stmt = db.prepare('SELECT * FROM subcontractor_profiles WHERE owner_id = ? ORDER BY name ASC');
        const rows = stmt.all(companyId) as any[];
        res.json(rows);
    } catch (error) {
        console.error('Get subcontractor profiles error:', error);
        res.status(500).json({ message: 'Error fetching subcontractor profiles' });
    }
};

// Create subcontractor profile
export const createSubcontractorProfile = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const {
        name, phone, address, serviceType, photo,
        ifNumber, rcNumber, iceNumber, rating, availabilityDate, notes
    } = req.body;

    if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'Le nom du sous-traitant est requis' });
    }

    try {
        const id = randomUUID();
        db.prepare(`
            INSERT INTO subcontractor_profiles (
                id, owner_id, name, phone, address, serviceType, photo,
                ifNumber, rcNumber, iceNumber, rating, availabilityDate, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, companyId, name.trim(),
            phone || null, address || null, serviceType || null, photo || null,
            ifNumber || null, rcNumber || null, iceNumber || null,
            rating !== undefined && rating !== null ? rating : 5,
            availabilityDate || null, notes || null
        );

        res.status(201).json({ message: 'Sous-traitant créé avec succès', id });
    } catch (error) {
        console.error('Create subcontractor profile error:', error);
        res.status(500).json({ message: 'Error creating subcontractor profile' });
    }
};

// Update subcontractor profile
export const updateSubcontractorProfile = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;

    const columns: Record<string, string> = {
        name: 'name', phone: 'phone', address: 'address', serviceType: 'serviceType',
        photo: 'photo', ifNumber: 'ifNumber', rcNumber: 'rcNumber', iceNumber: 'iceNumber',
        rating: 'rating', availabilityDate: 'availabilityDate', notes: 'notes'
    };

    const sets: string[] = [];
    const values: any[] = [];

    Object.entries(columns).forEach(([key, column]) => {
        if (req.body[key] !== undefined) {
            sets.push(`${column} = ?`);
            values.push(req.body[key] === '' ? null : req.body[key]);
        }
    });

    if (sets.length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
    }

    try {
        const result = db.prepare(`
            UPDATE subcontractor_profiles
            SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND owner_id = ?
        `).run(...values, id, companyId);

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Subcontractor profile not found or unauthorized' });
        }

        res.json({ message: 'Sous-traitant mis à jour avec succès' });
    } catch (error) {
        console.error('Update subcontractor profile error:', error);
        res.status(500).json({ message: 'Error updating subcontractor profile' });
    }
};

// Delete subcontractor profile
export const deleteSubcontractorProfile = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;

    try {
        const result = db.prepare('DELETE FROM subcontractor_profiles WHERE id = ? AND owner_id = ?').run(id, companyId);
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Subcontractor profile not found or unauthorized' });
        }
        res.json({ message: 'Sous-traitant supprimé avec succès' });
    } catch (error) {
        console.error('Delete subcontractor profile error:', error);
        res.status(500).json({ message: 'Error deleting subcontractor profile' });
    }
};
