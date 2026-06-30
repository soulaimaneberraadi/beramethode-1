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

    try {
        const stmt = db.prepare(`
            UPDATE subcontract_orders 
            SET 
                modelId = COALESCE(?, modelId),
                modelName = COALESCE(?, modelName),
                clientName = COALESCE(?, clientName),
                totalQuantity = COALESCE(?, totalQuantity),
                subcontractorName = COALESCE(?, subcontractorName),
                pricePerPiece = COALESCE(?, pricePerPiece),
                deliveryDate = COALESCE(?, deliveryDate),
                status = COALESCE(?, status),
                sizes_json = COALESCE(?, sizes_json),
                colors_json = COALESCE(?, colors_json),
                notes = COALESCE(?, notes),
                tissuStatus = COALESCE(?, tissuStatus),
                fournituresStatus = COALESCE(?, fournituresStatus),
                ficheTechniqueSent = COALESCE(?, ficheTechniqueSent),
                qtyAccepted = COALESCE(?, qtyAccepted),
                qtyToRepair = COALESCE(?, qtyToRepair),
                qtyRejected = COALESCE(?, qtyRejected),
                subcontractorPhone = COALESCE(?, subcontractorPhone),
                subcontractorRating = COALESCE(?, subcontractorRating),
                subcontractorAvailabilityDate = COALESCE(?, subcontractorAvailabilityDate),
                prestationType = COALESCE(?, prestationType),
                tissuFournisseur = COALESCE(?, tissuFournisseur),
                fournituresFournisseur = COALESCE(?, fournituresFournisseur),
                conditionnementFournisseur = COALESCE(?, conditionnementFournisseur),
                protoRequired = COALESCE(?, protoRequired),
                protoStatus = COALESCE(?, protoStatus),
                paymentTerms = COALESCE(?, paymentTerms),
                defectRateAccepted = COALESCE(?, defectRateAccepted),
                stitchingDetails = COALESCE(?, stitchingDetails),
                specifications_json = COALESCE(?, specifications_json),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND owner_id = ?
        `);

        const result = stmt.run(
            modelId || null,
            modelName || null,
            clientName || null,
            totalQuantity || null,
            subcontractorName || null,
            pricePerPiece || null,
            deliveryDate || null,
            status || null,
            sizes_json || null,
            colors_json || null,
            notes || null,
            tissuStatus || null,
            fournituresStatus || null,
            ficheTechniqueSent !== undefined ? ficheTechniqueSent : null,
            qtyAccepted !== undefined ? qtyAccepted : null,
            qtyToRepair !== undefined ? qtyToRepair : null,
            qtyRejected !== undefined ? qtyRejected : null,
            subcontractorPhone || null,
            subcontractorRating !== undefined ? subcontractorRating : null,
            subcontractorAvailabilityDate || null,
            prestationType || null,
            tissuFournisseur || null,
            fournituresFournisseur || null,
            conditionnementFournisseur || null,
            protoRequired !== undefined ? protoRequired : null,
            protoStatus || null,
            paymentTerms || null,
            defectRateAccepted !== undefined ? defectRateAccepted : null,
            stitchingDetails || null,
            specifications_json || null,
            id,
            companyId
        );

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
