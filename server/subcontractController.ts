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
        status, sizes_json, colors_json, grid_json, notes,
        tissuStatus, fournituresStatus, ficheTechniqueSent,
        qtyAccepted, qtyToRepair, qtyRejected,
        subcontractorPhone, subcontractorRating, subcontractorAvailabilityDate,
        prestationType, tissuFournisseur, fournituresFournisseur, conditionnementFournisseur,
        protoRequired, protoStatus, paymentTerms, defectRateAccepted,
        stitchingDetails, specifications_json, materials_fournisseur_json
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
                sizes_json, colors_json, grid_json, notes,
                tissuStatus, fournituresStatus, ficheTechniqueSent,
                qtyAccepted, qtyToRepair, qtyRejected,
                subcontractorPhone, subcontractorRating, subcontractorAvailabilityDate,
                prestationType, tissuFournisseur, fournituresFournisseur, conditionnementFournisseur,
                protoRequired, protoStatus, paymentTerms, defectRateAccepted,
                stitchingDetails, specifications_json, materials_fournisseur_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            grid_json || null,
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
            specifications_json || null,
            materials_fournisseur_json || null
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
        status, sizes_json, colors_json, grid_json, notes,
        tissuStatus, fournituresStatus, ficheTechniqueSent,
        qtyAccepted, qtyToRepair, qtyRejected,
        subcontractorPhone, subcontractorRating, subcontractorAvailabilityDate,
        prestationType, tissuFournisseur, fournituresFournisseur, conditionnementFournisseur,
        protoRequired, protoStatus, paymentTerms, defectRateAccepted,
        stitchingDetails, specifications_json, materials_fournisseur_json
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
                grid_json = COALESCE(?, grid_json),
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
                materials_fournisseur_json = COALESCE(?, materials_fournisseur_json),
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
            grid_json || null,
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
            materials_fournisseur_json || null,
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

// --- Journal des entrées/sorties (carte de commande) ---
// Endpoints à plat (/api/subcontract/entries) pour rester compatibles avec
// l'apiShim du mode statique (Vercel), qui résout un store par nom de chemin
// (2 segments max) sans routage imbriqué. Le filtrage par commande se fait
// via ?orderId= côté serveur, et côté client pour le mode statique.

// Get entries — optionally filtered by ?orderId=
export const getSubcontractEntries = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { orderId } = req.query as { orderId?: string };
    try {
        if (orderId) {
            const owned = db.prepare('SELECT id FROM subcontract_orders WHERE id = ? AND owner_id = ?').get(orderId, companyId);
            if (!owned) return res.status(404).json({ message: 'Subcontract order not found or unauthorized' });
            const stmt = db.prepare('SELECT * FROM subcontract_entries WHERE order_id = ? ORDER BY entry_date ASC, created_at ASC');
            return res.json(stmt.all(orderId));
        }
        const stmt = db.prepare(`
            SELECT e.* FROM subcontract_entries e
            JOIN subcontract_orders o ON o.id = e.order_id
            WHERE o.owner_id = ?
            ORDER BY e.entry_date ASC, e.created_at ASC
        `);
        res.json(stmt.all(companyId));
    } catch (error) {
        console.error('Get subcontract entries error:', error);
        res.status(500).json({ message: 'Error fetching subcontract entries' });
    }
};

// Create an entry (order id passed as order_id in the body)
export const createSubcontractEntry = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { order_id, direction, couleur, taille, quantite, entry_date, notes } = req.body;

    if (!order_id || !direction || !entry_date || quantite === undefined || quantite === null) {
        return res.status(400).json({ message: 'Required fields are missing' });
    }

    try {
        const owned = db.prepare('SELECT id FROM subcontract_orders WHERE id = ? AND owner_id = ?').get(order_id, companyId);
        if (!owned) return res.status(404).json({ message: 'Subcontract order not found or unauthorized' });

        const id = randomUUID();
        db.prepare(`
            INSERT INTO subcontract_entries (id, order_id, direction, couleur, taille, quantite, entry_date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, order_id, direction, couleur || null, taille || null, Number(quantite) || 0, entry_date, notes || null);

        res.status(201).json({ message: 'Entry created successfully', id });
    } catch (error) {
        console.error('Create subcontract entry error:', error);
        res.status(500).json({ message: 'Error creating subcontract entry' });
    }
};

// Update an entry
export const updateSubcontractEntry = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;
    const { direction, couleur, taille, quantite, entry_date, notes } = req.body;

    try {
        const owned = db.prepare(`
            SELECT e.id FROM subcontract_entries e
            JOIN subcontract_orders o ON o.id = e.order_id
            WHERE e.id = ? AND o.owner_id = ?
        `).get(id, companyId);
        if (!owned) return res.status(404).json({ message: 'Entry not found or unauthorized' });

        db.prepare(`
            UPDATE subcontract_entries
            SET direction = COALESCE(?, direction),
                couleur = COALESCE(?, couleur),
                taille = COALESCE(?, taille),
                quantite = COALESCE(?, quantite),
                entry_date = COALESCE(?, entry_date),
                notes = COALESCE(?, notes),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(direction || null, couleur || null, taille || null, quantite !== undefined ? Number(quantite) : null, entry_date || null, notes || null, id);

        res.json({ message: 'Entry updated successfully' });
    } catch (error) {
        console.error('Update subcontract entry error:', error);
        res.status(500).json({ message: 'Error updating subcontract entry' });
    }
};

// Delete an entry
export const deleteSubcontractEntry = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;

    try {
        const result = db.prepare(`
            DELETE FROM subcontract_entries
            WHERE id = ? AND order_id IN (SELECT id FROM subcontract_orders WHERE owner_id = ?)
        `).run(id, companyId);

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Entry not found or unauthorized' });
        }
        res.json({ message: 'Entry deleted successfully' });
    } catch (error) {
        console.error('Delete subcontract entry error:', error);
        res.status(500).json({ message: 'Error deleting subcontract entry' });
    }
};

// --- Frais additionnels de la commande ---

export const getSubcontractExpenses = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { orderId } = req.query as { orderId?: string };
    try {
        if (orderId) {
            const owned = db.prepare('SELECT id FROM subcontract_orders WHERE id = ? AND owner_id = ?').get(orderId, companyId);
            if (!owned) return res.status(404).json({ message: 'Subcontract order not found or unauthorized' });
            const stmt = db.prepare('SELECT * FROM subcontract_expenses WHERE order_id = ? ORDER BY created_at ASC');
            return res.json(stmt.all(orderId));
        }
        const stmt = db.prepare(`
            SELECT ex.* FROM subcontract_expenses ex
            JOIN subcontract_orders o ON o.id = ex.order_id
            WHERE o.owner_id = ?
            ORDER BY ex.created_at ASC
        `);
        res.json(stmt.all(companyId));
    } catch (error) {
        console.error('Get subcontract expenses error:', error);
        res.status(500).json({ message: 'Error fetching subcontract expenses' });
    }
};

export const createSubcontractExpense = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { order_id, label, amount } = req.body;

    if (!order_id || !label || !label.trim() || amount === undefined || amount === null) {
        return res.status(400).json({ message: 'Required fields are missing' });
    }

    try {
        const owned = db.prepare('SELECT id FROM subcontract_orders WHERE id = ? AND owner_id = ?').get(order_id, companyId);
        if (!owned) return res.status(404).json({ message: 'Subcontract order not found or unauthorized' });

        const id = randomUUID();
        db.prepare(`INSERT INTO subcontract_expenses (id, order_id, label, amount) VALUES (?, ?, ?, ?)`)
          .run(id, order_id, label.trim(), Number(amount) || 0);

        res.status(201).json({ message: 'Expense created successfully', id });
    } catch (error) {
        console.error('Create subcontract expense error:', error);
        res.status(500).json({ message: 'Error creating subcontract expense' });
    }
};

export const updateSubcontractExpense = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;
    const { label, amount } = req.body;

    try {
        const owned = db.prepare(`
            SELECT ex.id FROM subcontract_expenses ex
            JOIN subcontract_orders o ON o.id = ex.order_id
            WHERE ex.id = ? AND o.owner_id = ?
        `).get(id, companyId);
        if (!owned) return res.status(404).json({ message: 'Expense not found or unauthorized' });

        db.prepare(`
            UPDATE subcontract_expenses
            SET label = COALESCE(?, label), amount = COALESCE(?, amount), updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(label || null, amount !== undefined ? Number(amount) : null, id);

        res.json({ message: 'Expense updated successfully' });
    } catch (error) {
        console.error('Update subcontract expense error:', error);
        res.status(500).json({ message: 'Error updating subcontract expense' });
    }
};

export const deleteSubcontractExpense = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;

    try {
        const result = db.prepare(`
            DELETE FROM subcontract_expenses
            WHERE id = ? AND order_id IN (SELECT id FROM subcontract_orders WHERE owner_id = ?)
        `).run(id, companyId);

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Expense not found or unauthorized' });
        }
        res.json({ message: 'Expense deleted successfully' });
    } catch (error) {
        console.error('Delete subcontract expense error:', error);
        res.status(500).json({ message: 'Error deleting subcontract expense' });
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

// Create or update a subcontractor profile
export const saveSubcontractorProfile = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id, name, contactName, phone, cin, address, ice, rc, rating, notes, photo, cinRectoPhoto, cinVersoPhoto } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Subcontractor name is required' });
    }

    try {
        const profileId = id || randomUUID();
        const stmt = db.prepare(`
            INSERT INTO subcontractor_profiles (id, owner_id, name, contactName, phone, cin, address, ice, rc, rating, notes, photo, cinRectoPhoto, cinVersoPhoto)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                contactName = excluded.contactName,
                phone = excluded.phone,
                cin = excluded.cin,
                address = excluded.address,
                ice = excluded.ice,
                rc = excluded.rc,
                rating = excluded.rating,
                notes = excluded.notes,
                photo = excluded.photo,
                cinRectoPhoto = excluded.cinRectoPhoto,
                cinVersoPhoto = excluded.cinVersoPhoto,
                updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(profileId, companyId, name.trim(), contactName || null, phone || null, cin || null, address || null, ice || null, rc || null, rating ?? 5, notes || null, photo || null, cinRectoPhoto || null, cinVersoPhoto || null);
        res.json({ message: 'Subcontractor profile saved successfully', id: profileId });
    } catch (error) {
        console.error('Save subcontractor profile error:', error);
        res.status(500).json({ message: 'Error saving subcontractor profile' });
    }
};

// Delete a subcontractor profile
export const deleteSubcontractorProfile = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;

    try {
        const result = db.prepare('DELETE FROM subcontractor_profiles WHERE id = ? AND owner_id = ?').run(id, companyId);
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Subcontractor profile not found or unauthorized' });
        }
        res.json({ message: 'Subcontractor profile deleted successfully' });
    } catch (error) {
        console.error('Delete subcontractor profile error:', error);
        res.status(500).json({ message: 'Error deleting subcontractor profile' });
    }
};
