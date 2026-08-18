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

/**
 * Enregistre UNE saisie = une grille entière (plusieurs cellules couleur ×
 * taille). Les cellules partagent un `batch_id` : c'est ce qui permet de
 * réafficher l'entrée sous la forme du tableau qu'elle était, et de la
 * supprimer d'un seul geste au lieu de ligne à ligne.
 */
export const createStockEntry = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const body = req.body || {};
    const orderId = body.order_id;

    // Format historique (une seule cellule) accepté tel quel : il devient un lot
    // d'une ligne, pour que tout passe par le même chemin.
    const rawLines: any[] = Array.isArray(body.lignes) && body.lignes.length > 0
        ? body.lignes
        : [{ couleur: body.couleur, taille: body.taille, quantite: body.quantite }];

    if (!orderId) return res.status(400).json({ message: 'order_id est obligatoire' });

    const lignes = rawLines
        .map(l => ({
            couleur: l.couleur || null,
            taille: l.taille || null,
            quantite: Math.floor(Number(l.quantite) || 0),
        }))
        .filter(l => l.quantite > 0);

    // Une saisie entièrement vide ne veut rien dire : pour retirer des pièces on
    // supprime l'entrée fautive, ce qui laisse une trace lisible.
    if (lignes.length === 0) return res.status(400).json({ message: 'Aucune quantité saisie' });

    try {
        const order = db.prepare('SELECT id, modelId, totalQuantity FROM subcontract_orders WHERE id = ? AND owner_id = ?')
            .get(orderId, companyId) as any;
        if (!order) return res.status(404).json({ message: 'Commande introuvable' });

        const already = db.prepare('SELECT COALESCE(SUM(quantite), 0) AS total FROM st_stock_entries WHERE owner_id = ? AND order_id = ?')
            .get(companyId, orderId) as any;
        const ajout = lignes.reduce((a, l) => a + l.quantite, 0);
        const cumul = (already.total || 0) + ajout;

        // Un sous-traitant livre rarement au chiffre exact : il rend parfois
        // quelques pièces de plus, parfois moins. Refuser l'écart obligeait à
        // mentir sur la saisie — or c'est le REÇU qui doit servir de base à la
        // facture et au stock, pas la commande. On accepte donc l'écart.
        //
        // Seul garde-fou conservé : un cumul supérieur au TRIPLE de la commande
        // ne peut être qu'une faute de frappe (un zéro en trop), et gonflerait un
        // stock qui sert ensuite de base aux ventes.
        if (order.totalQuantity > 0 && cumul > order.totalQuantity * 3) {
            return res.status(400).json({
                message: `Total reçu (${cumul}) plus de trois fois supérieur à la quantité commandée (${order.totalQuantity}) — vérifiez la saisie`,
            });
        }

        const batchId = randomUUID();
        const qualite = QUALITES.has(body.qualite) ? body.qualite : 'ACCEPTED';
        const date = body.date_entree || new Date().toISOString().split('T')[0];

        const insert = db.prepare(`
            INSERT INTO st_stock_entries (id, owner_id, order_id, modelId, couleur, taille, quantite, qualite, note, date_entree, batch_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        // Transaction : une grille est un tout. La moitié des cellules écrites
        // laisserait un stock faux sans que rien ne le signale.
        db.transaction(() => {
            for (const l of lignes) {
                insert.run(randomUUID(), companyId, orderId, order.modelId, l.couleur, l.taille, l.quantite, qualite, body.note || null, date, batchId);
            }
        })();

        const totals = syncOrderTotals(companyId, orderId);
        res.json({ batch_id: batchId, count: lignes.length, totals });
    } catch (error) {
        console.error('Create stock entry error:', error);
        res.status(500).json({ message: 'Error creating stock entry' });
    }
};

/** Supprime tout un lot (la grille saisie d'un coup). */
export const deleteStockBatch = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const row = db.prepare('SELECT order_id FROM st_stock_entries WHERE batch_id = ? AND owner_id = ? LIMIT 1')
            .get(req.params.batchId, companyId) as any;
        if (!row) return res.status(404).json({ message: 'Entrée introuvable' });

        db.prepare('DELETE FROM st_stock_entries WHERE batch_id = ? AND owner_id = ?').run(req.params.batchId, companyId);
        const totals = syncOrderTotals(companyId, row.order_id);
        res.json({ message: 'Entrée supprimée', totals });
    } catch (error) {
        console.error('Delete stock batch error:', error);
        res.status(500).json({ message: 'Error deleting stock batch' });
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

/**
 * Sorties de stock fini (ventes / livraisons client).
 *
 * Le stock vendable se lit à la maille couleur × taille : « il reste 134 pièces »
 * ne dit pas s'il reste des XL en bleu. Chaque sortie est donc détaillée, datée,
 * et rattachée à un client du registre — le nom seul se réécrit de trois façons.
 */

export const getStockSorties = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const { modelId } = req.query as { modelId?: string };
    try {
        const rows = modelId
            ? db.prepare('SELECT * FROM st_stock_sorties WHERE owner_id = ? AND modelId = ? ORDER BY date_sortie DESC, created_at DESC').all(companyId, modelId)
            : db.prepare('SELECT * FROM st_stock_sorties WHERE owner_id = ? ORDER BY date_sortie DESC, created_at DESC').all(companyId);
        res.json(rows);
    } catch (error) {
        console.error('Get stock sorties error:', error);
        res.status(500).json({ message: 'Error fetching stock exits' });
    }
};

export const createStockSortie = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const body = req.body || {};
    const modelId = body.modelId;

    if (!modelId) return res.status(400).json({ message: 'modelId est obligatoire' });

    const lignes = (Array.isArray(body.lignes) ? body.lignes : [])
        .map((l: any) => ({
            couleur: l.couleur || null,
            taille: l.taille || null,
            quantite: Math.floor(Number(l.quantite) || 0),
            prix_unitaire: Number(l.prix_unitaire ?? body.prix_unitaire) || 0,
        }))
        .filter((l: any) => l.quantite > 0);

    if (lignes.length === 0) return res.status(400).json({ message: 'Aucune quantité saisie' });

    try {
        // Stock disponible, cellule par cellule : on refuse de sortir ce qui
        // n'existe pas, sinon le stock passerait en négatif sans que rien ne le
        // signale — et c'est ce stock qui sert de base aux ventes suivantes.
        const entrees = db.prepare(
            "SELECT couleur, taille, COALESCE(SUM(quantite),0) AS q FROM st_stock_entries WHERE owner_id = ? AND modelId = ? AND qualite = 'ACCEPTED' GROUP BY couleur, taille"
        ).all(companyId, modelId) as any[];
        const sorties = db.prepare(
            'SELECT couleur, taille, COALESCE(SUM(quantite),0) AS q FROM st_stock_sorties WHERE owner_id = ? AND modelId = ? GROUP BY couleur, taille'
        ).all(companyId, modelId) as any[];

        const key = (c: any, t: any) => `${String(c ?? '')}|${String(t ?? '')}`;
        const dispo = new Map<string, number>();
        entrees.forEach(r => dispo.set(key(r.couleur, r.taille), (dispo.get(key(r.couleur, r.taille)) || 0) + Number(r.q)));
        sorties.forEach(r => dispo.set(key(r.couleur, r.taille), (dispo.get(key(r.couleur, r.taille)) || 0) - Number(r.q)));

        const insuffisant = lignes.find((l: any) => (dispo.get(key(l.couleur, l.taille)) || 0) < l.quantite);
        if (insuffisant) {
            return res.status(400).json({
                message: `Stock insuffisant pour ${insuffisant.couleur || '—'} / ${insuffisant.taille || '—'} : ${dispo.get(key(insuffisant.couleur, insuffisant.taille)) || 0} disponible(s), ${insuffisant.quantite} demandée(s)`,
            });
        }

        const batchId = randomUUID();
        const date = body.date_sortie || new Date().toISOString().split('T')[0];
        const insert = db.prepare(`
            INSERT INTO st_stock_sorties (id, owner_id, modelId, client_id, client_nom, couleur, taille, quantite, prix_unitaire, batch_id, facture_id, note, date_sortie)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        // Transaction : une sortie est un tout. La moitié des cellules écrites
        // laisserait un stock faux sans que rien ne le signale.
        db.transaction(() => {
            for (const l of lignes) {
                insert.run(randomUUID(), companyId, modelId, body.client_id || null, body.client_nom || null,
                    l.couleur, l.taille, l.quantite, l.prix_unitaire, batchId, body.facture_id || null, body.note || null, date);
            }
        })();

        res.json({ batch_id: batchId, count: lignes.length });
    } catch (error) {
        console.error('Create stock sortie error:', error);
        res.status(500).json({ message: 'Error creating stock exit' });
    }
};

/** Annule une sortie entière : les pièces reviennent au stock disponible. */
export const deleteStockSortieBatch = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const info = db.prepare('DELETE FROM st_stock_sorties WHERE batch_id = ? AND owner_id = ?').run(req.params.batchId, companyId);
        if (info.changes === 0) return res.status(404).json({ message: 'Sortie introuvable' });
        res.json({ message: 'Sortie annulée' });
    } catch (error) {
        console.error('Delete stock sortie error:', error);
        res.status(500).json({ message: 'Error deleting stock exit' });
    }
};
