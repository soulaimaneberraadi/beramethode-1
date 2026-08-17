import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from './db';

/**
 * Clients de l'atelier (acheteurs des pièces finies).
 *
 * Ils étaient auparavant saisis en texte libre sur chaque facture de vente :
 * aucune réutilisation, aucun historique, et un même client orthographié de
 * plusieurs façons devenait plusieurs clients. Une fiche par client, rattachée
 * à l'entreprise (`owner_id` = companyId), réutilisée à chaque sortie de stock.
 */

const TYPES = new Set(['GROS', 'DETAIL', 'BOUTIQUE']);

export const getClients = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const rows = db
            .prepare('SELECT * FROM st_clients WHERE owner_id = ? ORDER BY nom COLLATE NOCASE')
            .all(companyId);
        res.json(rows);
    } catch (error) {
        console.error('Get clients error:', error);
        res.status(500).json({ message: 'Error fetching clients' });
    }
};

export const saveClient = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const c = req.body || {};
    const nom = String(c.nom ?? '').trim();

    // Un client sans nom ne serait jamais retrouvable : c'est la seule donnée
    // réellement obligatoire, tout le reste peut être complété plus tard.
    if (!nom) return res.status(400).json({ message: 'Le nom du client est obligatoire' });

    try {
        const id = c.id || randomUUID();
        db.prepare(`
            INSERT INTO st_clients (id, owner_id, nom, type, ice, rc, tel, email, adresse, ville, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                nom = excluded.nom,
                type = excluded.type,
                ice = excluded.ice,
                rc = excluded.rc,
                tel = excluded.tel,
                email = excluded.email,
                adresse = excluded.adresse,
                ville = excluded.ville,
                notes = excluded.notes,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            id,
            companyId,
            nom,
            TYPES.has(c.type) ? c.type : 'DETAIL',
            c.ice || null,
            c.rc || null,
            c.tel || null,
            c.email || null,
            c.adresse || null,
            c.ville || null,
            c.notes || null,
        );

        const saved = db.prepare('SELECT * FROM st_clients WHERE id = ? AND owner_id = ?').get(id, companyId);
        res.json(saved);
    } catch (error) {
        console.error('Save client error:', error);
        res.status(500).json({ message: 'Error saving client' });
    }
};

export const deleteClient = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        // Les factures déjà émises gardent le nom recopié : supprimer une fiche
        // client ne doit jamais réécrire l'historique comptable.
        const info = db.prepare('DELETE FROM st_clients WHERE id = ? AND owner_id = ?').run(req.params.id, companyId);
        if (info.changes === 0) return res.status(404).json({ message: 'Client introuvable' });
        res.json({ message: 'Client supprimé' });
    } catch (error) {
        console.error('Delete client error:', error);
        res.status(500).json({ message: 'Error deleting client' });
    }
};

/**
 * Entrées en stock des pièces finies d'une commande de sous-traitance.
 *
 * Une entrée = une ligne datée (couleur, taille, quantité, qualité). Les
 * compteurs de la commande (qtyAccepted / qtyToRepair / qtyRejected) restent la
 * SOMME de ces lignes : ils continuent d'alimenter l'onglet Stock & Ventes, mais
 * ils cessent d'être une saisie manuelle qu'on ne peut ni dater ni corriger.
 */

const QUALITES = new Set(['ACCEPTED', 'REPAIR', 'REJECTED']);

/** Recalcule les totaux de la commande à partir des lignes, dans la foulée de
 *  toute écriture : deux chiffres pour la même réalité ne doivent jamais
 *  pouvoir diverger. */
const syncOrderTotals = (companyId: number, orderId: string) => {
    const rows = db
        .prepare('SELECT qualite, SUM(quantite) AS total FROM st_stock_entries WHERE owner_id = ? AND order_id = ? GROUP BY qualite')
        .all(companyId, orderId) as Array<{ qualite: string; total: number }>;
    const byQualite = (q: string) => rows.find(r => r.qualite === q)?.total || 0;
    db.prepare('UPDATE subcontract_orders SET qtyAccepted = ?, qtyToRepair = ?, qtyRejected = ? WHERE id = ? AND owner_id = ?')
        .run(byQualite('ACCEPTED'), byQualite('REPAIR'), byQualite('REJECTED'), orderId, companyId);
    return {
        qtyAccepted: byQualite('ACCEPTED'),
        qtyToRepair: byQualite('REPAIR'),
        qtyRejected: byQualite('REJECTED'),
    };
};

export const getStockEntries = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const { orderId } = req.query as { orderId?: string };
    try {
        const rows = orderId
            ? db.prepare('SELECT * FROM st_stock_entries WHERE owner_id = ? AND order_id = ? ORDER BY date_entree DESC, created_at DESC').all(companyId, orderId)
            : db.prepare('SELECT * FROM st_stock_entries WHERE owner_id = ? ORDER BY date_entree DESC, created_at DESC').all(companyId);
        res.json(rows);
    } catch (error) {
        console.error('Get stock entries error:', error);
        res.status(500).json({ message: 'Error fetching stock entries' });
    }
};

export const createStockEntry = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const e = req.body || {};
    const quantite = Math.floor(Number(e.quantite) || 0);

    if (!e.order_id) return res.status(400).json({ message: 'order_id est obligatoire' });
    // Une entrée nulle ou négative ne veut rien dire : pour retirer des pièces,
    // on supprime la ligne fautive, ce qui laisse une trace lisible.
    if (quantite <= 0) return res.status(400).json({ message: 'La quantité doit être supérieure à zéro' });

    try {
        const order = db.prepare('SELECT id, modelId, totalQuantity FROM subcontract_orders WHERE id = ? AND owner_id = ?')
            .get(e.order_id, companyId) as any;
        if (!order) return res.status(404).json({ message: 'Commande introuvable' });

        const already = db.prepare('SELECT COALESCE(SUM(quantite), 0) AS total FROM st_stock_entries WHERE owner_id = ? AND order_id = ?')
            .get(companyId, e.order_id) as any;
        // Recevoir plus que commandé trahit une erreur de saisie, et gonflerait
        // un stock qui sert ensuite de base aux ventes.
        if ((already.total || 0) + quantite > order.totalQuantity) {
            return res.status(400).json({
                message: `Total reçu (${(already.total || 0) + quantite}) supérieur à la quantité commandée (${order.totalQuantity})`,
            });
        }

        const id = randomUUID();
        db.prepare(`
            INSERT INTO st_stock_entries (id, owner_id, order_id, modelId, couleur, taille, quantite, qualite, note, date_entree)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, companyId, e.order_id, order.modelId,
            e.couleur || null, e.taille || null, quantite,
            QUALITES.has(e.qualite) ? e.qualite : 'ACCEPTED',
            e.note || null,
            e.date_entree || new Date().toISOString().split('T')[0],
        );

        const totals = syncOrderTotals(companyId, e.order_id);
        res.json({ entry: db.prepare('SELECT * FROM st_stock_entries WHERE id = ?').get(id), totals });
    } catch (error) {
        console.error('Create stock entry error:', error);
        res.status(500).json({ message: 'Error creating stock entry' });
    }
};

export const deleteStockEntry = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const row = db.prepare('SELECT order_id FROM st_stock_entries WHERE id = ? AND owner_id = ?')
            .get(req.params.id, companyId) as any;
        if (!row) return res.status(404).json({ message: 'Entrée introuvable' });

        db.prepare('DELETE FROM st_stock_entries WHERE id = ? AND owner_id = ?').run(req.params.id, companyId);
        const totals = syncOrderTotals(companyId, row.order_id);
        res.json({ message: 'Entrée supprimée', totals });
    } catch (error) {
        console.error('Delete stock entry error:', error);
        res.status(500).json({ message: 'Error deleting stock entry' });
    }
};
