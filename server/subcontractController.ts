import { Request, Response } from 'express';
import db from './db';
import { randomUUID } from 'crypto';
import { generateNumero } from './facturationController';

/** Statuts autorisés d'une commande de sous-traitance. */
const ORDER_STATUSES = ['PENDING', 'IN_COUPE', 'IN_COUTURE', 'IN_FINITION', 'LIVRE_PARTIEL', 'COMPLETED'] as const;

const isNum = (v: any): boolean => v !== null && v !== '' && Number.isFinite(Number(v));

/**
 * Validations métier communes create/update.
 * `existing` = ligne actuelle en base (update) pour valider les champs non fournis.
 * Retourne un message d'erreur, ou null si tout est valide.
 */
const validateOrderPayload = (body: any, existing?: any): string | null => {
    const pick = (key: string) => (body[key] !== undefined ? body[key] : existing?.[key]);

    const totalQuantity = pick('totalQuantity');
    if (totalQuantity !== undefined && totalQuantity !== null) {
        if (!isNum(totalQuantity) || Number(totalQuantity) <= 0) {
            return 'totalQuantity doit être un nombre strictement positif';
        }
    }

    const pricePerPiece = pick('pricePerPiece');
    if (pricePerPiece !== undefined && pricePerPiece !== null && pricePerPiece !== '') {
        if (!isNum(pricePerPiece) || Number(pricePerPiece) < 0) {
            return 'pricePerPiece doit être un nombre supérieur ou égal à 0';
        }
    }

    const status = body.status;
    if (status !== undefined && status !== null && status !== '') {
        if (!ORDER_STATUSES.includes(status)) {
            return `status invalide : attendu l'une de ${ORDER_STATUSES.join(', ')}`;
        }
    }

    const qty = (key: string) => {
        const v = pick(key);
        return isNum(v) ? Number(v) : 0;
    };
    const total = isNum(totalQuantity) ? Number(totalQuantity) : null;
    // La garde-fou ne s'applique QUE si l'utilisateur envoie lui-même les
    // quantités contrôlées (saisie manuelle, où un zéro en trop doit sauter).
    // Lorsqu'elles sont absentes du corps, elles viennent de `existing` — c'est-à-
    // dire de la SOMME des entrées en stock (syncOrderTotals), qui tolère un
    // écart de livraison (le sous-traitant rend parfois plus de pièces que la
    // commande). Refuser cet écart au moment de la CLÔTURE bloquait des
    // commandes parfaitement légitimes avec « La clôture a échoué ».
    const qtyProvided = ['qtyAccepted', 'qtyToRepair', 'qtyRejected'].some(k => body[k] !== undefined);
    if (total !== null && qtyProvided) {
        const sum = qty('qtyAccepted') + qty('qtyToRepair') + qty('qtyRejected');
        if (sum > total) {
            return `La somme des quantités contrôlées (${sum}) dépasse totalQuantity (${total})`;
        }
    }

    return null;
};

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
        stitchingDetails, specifications_json, materials_fournisseur_json,
        coupeLocation, custom_milestones_json, st_mode
    } = req.body;

    if (!modelId || !totalQuantity || !subcontractorName || !deliveryDate) {
        return res.status(400).json({ message: 'Required fields are missing' });
    }

    const validationError = validateOrderPayload(req.body);
    if (validationError) {
        return res.status(400).json({ message: validationError });
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
                stitchingDetails, specifications_json, materials_fournisseur_json,
                coupeLocation, custom_milestones_json, st_mode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            materials_fournisseur_json || null,
            coupeLocation || 'SUBCONTRACTOR',
            custom_milestones_json || null,
            st_mode || null
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
        stitchingDetails, specifications_json, materials_fournisseur_json,
        coupeLocation, custom_milestones_json, st_mode
    } = req.body;

    try {
        const existing = db.prepare('SELECT * FROM subcontract_orders WHERE id = ? AND owner_id = ?').get(id, companyId) as any;
        if (!existing) {
            return res.status(404).json({ message: 'Subcontract order not found or unauthorized' });
        }

        const validationError = validateOrderPayload(req.body, existing);
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

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
                st_mode = COALESCE(?, st_mode),
                protoRequired = COALESCE(?, protoRequired),
                protoStatus = COALESCE(?, protoStatus),
                paymentTerms = COALESCE(?, paymentTerms),
                defectRateAccepted = COALESCE(?, defectRateAccepted),
                stitchingDetails = COALESCE(?, stitchingDetails),
                specifications_json = COALESCE(?, specifications_json),
                materials_fournisseur_json = COALESCE(?, materials_fournisseur_json),
                coupeLocation = COALESCE(?, coupeLocation),
                custom_milestones_json = COALESCE(?, custom_milestones_json),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND owner_id = ?
        `);

        // ⚠️ `x || null` combiné à COALESCE rendait impossible l'enregistrement de
        // pricePerPiece = 0, totalQuantity = 0, ou la remise à vide de notes /
        // clientName : l'ancienne valeur était conservée silencieusement (impact
        // financier direct). On distingue désormais « champ absent » (undefined →
        // NULL → COALESCE garde l'existant) de « valeur fournie » (0 / '' respectés).
        // (les booléens sont convertis en 0/1 : better-sqlite3 refuse de binder un boolean)
        const v = (x: any) => (x === undefined ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x);

        const result = stmt.run(
            v(modelId),
            v(modelName),
            v(clientName),
            v(totalQuantity),
            v(subcontractorName),
            v(pricePerPiece),
            v(deliveryDate),
            v(status),
            v(sizes_json),
            v(colors_json),
            v(grid_json),
            v(notes),
            v(tissuStatus),
            v(fournituresStatus),
            v(ficheTechniqueSent),
            v(qtyAccepted),
            v(qtyToRepair),
            v(qtyRejected),
            v(subcontractorPhone),
            v(subcontractorRating),
            v(subcontractorAvailabilityDate),
            v(prestationType),
            v(tissuFournisseur),
            v(fournituresFournisseur),
            v(conditionnementFournisseur),
            v(st_mode),
            v(protoRequired),
            v(protoStatus),
            v(paymentTerms),
            v(defectRateAccepted),
            v(stitchingDetails),
            v(specifications_json),
            v(materials_fournisseur_json),
            v(coupeLocation),
            v(custom_milestones_json),
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

/**
 * Prochain numéro de facture (aperçu) pour la vente issue de la sous-traitance.
 * Réutilise la séquence officielle de facturationController (FV-<année>-<0000>,
 * calculée par owner_id à partir du max existant) au lieu d'un numéro aléatoire.
 * NB : le numéro définitif reste attribué par saveFacture au moment de
 * l'enregistrement — cet endpoint sert à pré-remplir le formulaire.
 */
export const getNextSubcontractInvoiceNumber = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    try {
        res.json({ number: generateNumero('VENTE', companyId) });
    } catch (error) {
        console.error('Next subcontract invoice number error:', error);
        res.status(500).json({ message: 'Error generating invoice number' });
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

// ════════════════════════════════════════════════════════════════════════════
// FRAIS ADDITIONNELS DE COMMANDE (subcontract_expenses)
// ════════════════════════════════════════════════════════════════════════════
// Libellé libre saisi par l'utilisateur (« Transport », « Patronage », ...),
// montant = TOTAL en dirhams, et portée optionnelle :
//   quantityScope = null  → le frais couvre TOUTE la commande
//   quantityScope = N     → le frais ne couvre que N pièces sur totalQuantity
// La portée est décisive pour le prix de revient : diviser par quantityScope
// quand il est renseigné, jamais par totalQuantity.

/** Projection camelCase renvoyée par toutes les routes de frais. */
const EXPENSE_COLUMNS = `
    id,
    order_id AS orderId,
    label,
    amount,
    quantity_scope AS quantityScope,
    tiers_id AS tiersId,
    (SELECT nom FROM st_clients c WHERE c.id = subcontract_expenses.tiers_id) AS tiersNom,
    COALESCE(montant_paye, 0) AS montantPaye,
    facture_ref AS factureRef,
    date_facture AS dateFacture,
    created_at,
    updated_at
`;

/** Charge la commande si — et seulement si — elle appartient au workspace appelant. */
const findOwnedOrder = (orderId: string, companyId: number): any =>
    db.prepare('SELECT id, totalQuantity FROM subcontract_orders WHERE id = ? AND owner_id = ?').get(orderId, companyId);

/**
 * Validation d'un frais. `existing` = ligne actuelle (update) pour les champs
 * non fournis. `totalQuantity` = quantité de la commande porteuse.
 * Retourne un message d'erreur, ou null si tout est valide.
 */
const validateExpensePayload = (body: any, totalQuantity: any, existing?: any): string | null => {
    const label = body.label !== undefined ? body.label : existing?.label;
    if (typeof label !== 'string' || !label.trim()) {
        return 'label est requis et ne peut pas être vide';
    }

    const amount = body.amount !== undefined ? body.amount : existing?.amount;
    if (!isNum(amount) || Number(amount) < 0) {
        return 'amount doit être un nombre supérieur ou égal à 0';
    }

    // `undefined` = champ absent (on garde l'existant) ; `null` = portée effacée
    // volontairement (le frais couvre toute la commande).
    const scopeProvided = body.quantityScope !== undefined;
    const scope = scopeProvided ? body.quantityScope : existing?.quantity_scope;
    if (scope !== undefined && scope !== null && scope !== '') {
        if (!isNum(scope) || !Number.isInteger(Number(scope)) || Number(scope) <= 0) {
            return 'quantityScope doit être un nombre entier strictement positif';
        }
        const total = isNum(totalQuantity) ? Number(totalQuantity) : null;
        if (total !== null && Number(scope) > total) {
            return `quantityScope (${Number(scope)}) dépasse la quantité de la commande (${total})`;
        }
    }

    return null;
};

/** Normalise la portée pour le binding SQLite : NULL, ou entier positif. */
const normalizeScope = (scope: any): number | null =>
    scope === undefined || scope === null || scope === '' ? null : Number(scope);

/** Un identifiant de tiers vide vaut « aucun fournisseur rattaché » : on range
 *  NULL plutôt qu'une chaîne vide, sinon la jointure sur le nom renverrait une
 *  ligne fantôme. Le tiers doit appartenir à l'entreprise — sans ce contrôle on
 *  pourrait rattacher un frais au fournisseur d'un autre atelier. */
const normalizeTiers = (tiersId: any, companyId: any): string | null => {
    const id = String(tiersId ?? '').trim();
    if (!id) return null;
    const found = db.prepare('SELECT id FROM st_clients WHERE id = ? AND owner_id = ?').get(id, companyId);
    return found ? id : null;
};

/** Montant déjà réglé. Jamais deviné : absent = zéro, c'est-à-dire « rien de
 *  payé », et jamais supérieur au montant dû — un frais payé au-delà de son
 *  montant est une faute de saisie, pas une avance. */
const normalizePaye = (paye: any, amount: number): number => {
    const v = Number(paye);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.min(v, Number(amount) || 0);
};

// GET /api/subcontract/:orderId/expenses
export const getSubcontractExpenses = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { orderId } = req.params;

    try {
        if (!findOwnedOrder(orderId, companyId)) {
            return res.status(404).json({ message: 'Subcontract order not found or unauthorized' });
        }

        const rows = db.prepare(
            `SELECT ${EXPENSE_COLUMNS} FROM subcontract_expenses WHERE order_id = ? ORDER BY created_at ASC`
        ).all(orderId) as any[];

        res.json(rows);
    } catch (error) {
        console.error('Get subcontract expenses error:', error);
        res.status(500).json({ message: 'Error fetching subcontract expenses' });
    }
};

// POST /api/subcontract/:orderId/expenses
export const createSubcontractExpense = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { orderId } = req.params;
    const { label, amount, quantityScope } = req.body;

    try {
        const order = findOwnedOrder(orderId, companyId);
        if (!order) {
            return res.status(404).json({ message: 'Subcontract order not found or unauthorized' });
        }

        const validationError = validateExpensePayload(req.body, order.totalQuantity);
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        const id = randomUUID();
        db.prepare(`
            INSERT INTO subcontract_expenses
                (id, order_id, label, amount, quantity_scope, tiers_id, montant_paye, facture_ref, date_facture)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            orderId,
            String(label).trim(),
            Number(amount),
            normalizeScope(quantityScope),
            normalizeTiers(req.body?.tiersId, companyId),
            normalizePaye(req.body?.montantPaye, Number(amount)),
            String(req.body?.factureRef ?? '').trim() || null,
            String(req.body?.dateFacture ?? '').trim() || null,
        );

        const expense = db.prepare(`SELECT ${EXPENSE_COLUMNS} FROM subcontract_expenses WHERE id = ?`).get(id);
        res.status(201).json({ message: 'Subcontract expense created successfully', id, expense });
    } catch (error) {
        console.error('Create subcontract expense error:', error);
        res.status(500).json({ message: 'Error creating subcontract expense' });
    }
};

// PUT /api/subcontract/expenses/:id
export const updateSubcontractExpense = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;
    const { label, amount, quantityScope } = req.body;

    try {
        // Propriété vérifiée par jointure : un frais n'est accessible que via la
        // commande porteuse, elle-même filtrée sur owner_id.
        const existing = db.prepare(`
            SELECT e.*, o.totalQuantity AS orderTotalQuantity
            FROM subcontract_expenses e
            JOIN subcontract_orders o ON o.id = e.order_id
            WHERE e.id = ? AND o.owner_id = ?
        `).get(id, companyId) as any;

        if (!existing) {
            return res.status(404).json({ message: 'Subcontract expense not found or unauthorized' });
        }

        const validationError = validateExpensePayload(req.body, existing.orderTotalQuantity, existing);
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        const nextLabel = label !== undefined ? String(label).trim() : existing.label;
        const nextAmount = amount !== undefined ? Number(amount) : existing.amount;
        // `quantityScope` absent → portée inchangée ; fourni à null → portée effacée.
        const nextScope = quantityScope !== undefined ? normalizeScope(quantityScope) : existing.quantity_scope;
        // Chaque champ suit la même règle : absent du corps = inchangé. Un PATCH
        // partiel ne doit pas effacer le fournisseur ou le règlement déjà saisis.
        const nextTiers = req.body?.tiersId !== undefined
            ? normalizeTiers(req.body.tiersId, companyId)
            : existing.tiers_id;
        const nextPaye = req.body?.montantPaye !== undefined
            ? normalizePaye(req.body.montantPaye, nextAmount)
            // Le montant a pu baisser sous ce qui était déjà réglé : on replafonne
            // au lieu de laisser un « reste dû » négatif.
            : Math.min(Number(existing.montant_paye) || 0, nextAmount);
        const nextFacture = req.body?.factureRef !== undefined
            ? (String(req.body.factureRef ?? '').trim() || null)
            : existing.facture_ref;
        const nextDate = req.body?.dateFacture !== undefined
            ? (String(req.body.dateFacture ?? '').trim() || null)
            : existing.date_facture;

        db.prepare(`
            UPDATE subcontract_expenses
            SET label = ?, amount = ?, quantity_scope = ?, tiers_id = ?, montant_paye = ?,
                facture_ref = ?, date_facture = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(nextLabel, nextAmount, nextScope, nextTiers, nextPaye, nextFacture, nextDate, id);

        const expense = db.prepare(`SELECT ${EXPENSE_COLUMNS} FROM subcontract_expenses WHERE id = ?`).get(id);
        res.json({ message: 'Subcontract expense updated successfully', expense });
    } catch (error) {
        console.error('Update subcontract expense error:', error);
        res.status(500).json({ message: 'Error updating subcontract expense' });
    }
};

// DELETE /api/subcontract/expenses/:id
export const deleteSubcontractExpense = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id } = req.params;

    try {
        const existing = db.prepare(`
            SELECT e.id
            FROM subcontract_expenses e
            JOIN subcontract_orders o ON o.id = e.order_id
            WHERE e.id = ? AND o.owner_id = ?
        `).get(id, companyId) as any;

        if (!existing) {
            return res.status(404).json({ message: 'Subcontract expense not found or unauthorized' });
        }

        db.prepare('DELETE FROM subcontract_expenses WHERE id = ?').run(id);
        res.json({ message: 'Subcontract expense deleted successfully' });
    } catch (error) {
        console.error('Delete subcontract expense error:', error);
        res.status(500).json({ message: 'Error deleting subcontract expense' });
    }
};
