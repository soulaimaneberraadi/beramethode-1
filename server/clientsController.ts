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
