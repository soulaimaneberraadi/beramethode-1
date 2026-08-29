import { Request, Response } from 'express';
import db from './db';

/**
 * Les garanties : cheques et effets laisses par le client a la vente.
 *
 * Rien ici n'est un encaissement. Le cheque de garantie couvre la dette
 * entiere mais aucun dirham n'est entre : le confondre avec un reglement
 * soldait le client des le premier jour. Il se restitue quand le solde
 * tombe a zero, et ne s'encaisse que si le credit casse.
 *
 * Reserve legale, dite une fois : au Maroc le cheque est un instrument de
 * paiement a vue, et le « cheque de garantie » n'a pas de statut legal —
 * l'effet de commerce, lui, est fait pour le terme. L'ecran le rappelle ;
 * le choix reste au commercant.
 */

const STATUTS = ['EN_GARDE', 'RESTITUEE', 'ENCAISSEE', 'IMPAYEE'] as const;
const TYPES = ['CHEQUE', 'EFFET'] as const;
const jourISO = (d: Date) => d.toISOString().split('T')[0];
const iso = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

export const getGaranties = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const clientId = req.query.clientId ? String(req.query.clientId) : null;
    const statut = STATUTS.includes(String(req.query.statut) as any) ? String(req.query.statut) : null;

    try {
        const clauses = ['g.owner_id = ?'];
        const params: any[] = [companyId];
        if (clientId) { clauses.push('g.client_id = ?'); params.push(clientId); }
        if (statut) { clauses.push('g.statut = ?'); params.push(statut); }

        const lignes = db.prepare(`
            SELECT g.*, COALESCE(c.nom, '—') AS client_nom, c.tel AS client_tel, c.ville AS client_ville
            FROM garanties g
            LEFT JOIN st_clients c ON c.id = g.client_id AND c.owner_id = g.owner_id
            WHERE ${clauses.join(' AND ')}
            ORDER BY (g.statut = 'EN_GARDE') DESC, COALESCE(g.date_echeance, g.date_remise) ASC
        `).all(...params) as any[];

        const aujourdhui = jourISO(new Date());
        res.json({
            garanties: lignes.map(g => ({
                id: String(g.id),
                clientId: String(g.client_id),
                clientNom: g.client_nom,
                clientTel: g.client_tel || null,
                clientVille: g.client_ville || null,
                type: g.type,
                numero: g.numero || null,
                banque: g.banque || null,
                montant: Number(Number(g.montant).toFixed(2)),
                dateRemise: g.date_remise,
                dateEcheance: g.date_echeance || null,
                statut: g.statut,
                dateSortie: g.date_sortie || null,
                notes: g.notes || null,
                // Une echeance passee sur une piece encore en main : c'est le
                // jour ou elle peut etre presentee, pas une alerte de retard.
                echue: Boolean(g.statut === 'EN_GARDE' && g.date_echeance && g.date_echeance <= aujourdhui),
            })),
            totalEnGarde: Number(lignes
                .filter(g => g.statut === 'EN_GARDE')
                .reduce((a, g) => a + (Number(g.montant) || 0), 0)
                .toFixed(2)),
        });
    } catch (error) {
        console.error('getGaranties error:', error);
        res.status(500).json({ message: 'Error listing guarantees' });
    }
};

export const saveGarantie = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const b = req.body || {};

    const clientId = b.clientId ? String(b.clientId) : null;
    if (!clientId) return res.status(400).json({ message: 'Client manquant' });

    const montant = Number(b.montant);
    if (!Number.isFinite(montant) || montant <= 0) return res.status(400).json({ message: 'Montant invalide' });

    const type = TYPES.includes(String(b.type) as any) ? String(b.type) : 'CHEQUE';
    const id = b.id ? String(b.id) : 'GAR_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    try {
        // Anti-IDOR : le client doit appartenir au workspace actif.
        const owns = db.prepare('SELECT 1 FROM st_clients WHERE id = ? AND owner_id = ?').get(clientId, companyId);
        if (!owns) return res.status(404).json({ message: 'Client introuvable' });

        db.prepare(`
            INSERT INTO garanties (id, owner_id, client_id, type, numero, banque, montant, date_remise, date_echeance, statut, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'EN_GARDE'), ?)
            ON CONFLICT(id) DO UPDATE SET
                type = excluded.type, numero = excluded.numero, banque = excluded.banque,
                montant = excluded.montant, date_remise = excluded.date_remise,
                date_echeance = excluded.date_echeance, notes = excluded.notes
        `).run(
            id, companyId, clientId, type,
            b.numero ? String(b.numero) : null,
            b.banque ? String(b.banque) : null,
            Number(montant.toFixed(2)),
            iso(b.dateRemise) || jourISO(new Date()),
            iso(b.dateEcheance),
            STATUTS.includes(String(b.statut) as any) ? String(b.statut) : null,
            b.notes ? String(b.notes) : null,
        );

        res.json({ success: true, id });
    } catch (error: any) {
        console.error('saveGarantie error:', error);
        res.status(500).json({ message: error.message });
    }
};

/** Restituer, encaisser, ou constater l'impaye : la piece change de main. */
export const changerStatutGarantie = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const id = String(req.params.id || '');
    const statut = String(req.body?.statut || '');
    if (!STATUTS.includes(statut as any)) return res.status(400).json({ message: 'Statut invalide' });

    try {
        const sortie = statut === 'EN_GARDE' ? null : (iso(req.body?.date) || jourISO(new Date()));
        const info = db.prepare(`
            UPDATE garanties SET statut = ?, date_sortie = ?
            WHERE id = ? AND owner_id = ?
        `).run(statut, sortie, id, companyId);

        if (info.changes === 0) return res.status(404).json({ message: 'Garantie introuvable' });
        res.json({ success: true, id, statut, dateSortie: sortie });
    } catch (error: any) {
        console.error('changerStatutGarantie error:', error);
        res.status(500).json({ message: error.message });
    }
};

export const deleteGarantie = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const id = String(req.params.id || '');
    try {
        const info = db.prepare('DELETE FROM garanties WHERE id = ? AND owner_id = ?').run(id, companyId);
        if (info.changes === 0) return res.status(404).json({ message: 'Garantie introuvable' });
        res.json({ success: true });
    } catch (error: any) {
        console.error('deleteGarantie error:', error);
        res.status(500).json({ message: error.message });
    }
};
