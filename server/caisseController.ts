import { Request, Response } from 'express';
import db from './db';

/**
 * Journee de caisse — le compagnon de l'ecran de vente au comptoir.
 *
 * Deux gestes, et rien de plus :
 *   1. LIRE la journee : quels tickets sont passes, et combien a-t-on encaisse
 *      dans chaque mode de reglement. C'est la question qu'on se pose le soir,
 *      la caisse dans les mains.
 *   2. ANNULER un ticket : les pieces reviennent au stock, la facture qui le
 *      couvrait est annulee. Une erreur au comptoir se corrige au comptoir.
 *
 * Aucune table nouvelle : un ticket est un ensemble de sorties de stock qui
 * partagent une `ticket_ref`. Le stock vendable reste « entrees acceptees
 * moins sorties », donc supprimer les sorties d'un ticket SUFFIT a rendre la
 * marchandise — il n'y a pas de second compteur a remettre d'aplomb, et donc
 * pas de second compteur qui puisse mentir.
 */

/** Un ticket sans reference (ventes anterieures a la colonne `ticket_ref`)
 *  retombe sur son lot : c'etait alors la meilleure cle disponible. */
const CLE_TICKET = "COALESCE(s.ticket_ref, s.batch_id, s.id)";

const jourValide = (v: unknown): string => {
    const d = String(v ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().slice(0, 10);
};

/**
 * Tickets d'une journee, du plus recent au plus ancien, avec leurs lignes.
 *
 * Les totaux par mode de reglement sont calcules ici, sur la MEME lecture que
 * les lignes affichees : un total de cloture qui viendrait d'un second calcul
 * pourrait diverger de la liste sous les yeux du gerant, et c'est de l'argent.
 */
export const getCaisseJournal = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const date = jourValide((req.query as any).date);
    try {
        const lignes = db.prepare(`
            SELECT ${CLE_TICKET} AS ticket,
                   s.id, s.modelId, s.couleur, s.taille, s.quantite, s.prix_unitaire,
                   s.client_id, s.client_nom, s.mode_paiement, s.type_vente, s.note,
                   s.facture_id, s.date_sortie, s.created_at,
                   COALESCE(json_extract(m.data, '$.meta_data.nom_modele'), json_extract(m.data, '$.filename')) AS model_nom,
                   f.numero AS facture_numero, f.statut AS facture_statut
            FROM st_stock_sorties s
            LEFT JOIN models m ON m.id = s.modelId AND m.user_id = s.owner_id
            LEFT JOIN factures f ON f.id = s.facture_id AND f.owner_id = s.owner_id
            WHERE s.owner_id = ? AND s.canal = 'MAGASIN' AND s.date_sortie = ?
            ORDER BY s.created_at DESC, s.id DESC
        `).all(companyId, date) as any[];

        const parTicket = new Map<string, any>();
        for (const l of lignes) {
            const cle = String(l.ticket);
            let t = parTicket.get(cle);
            if (!t) {
                t = {
                    ticket: cle,
                    heure: l.created_at,
                    clientId: l.client_id ?? null,
                    clientNom: l.client_nom ?? null,
                    modePaiement: l.mode_paiement ?? null,
                    typeVente: l.type_vente ?? null,
                    factureId: l.facture_id ?? null,
                    factureNumero: l.facture_numero ?? null,
                    factureStatut: l.facture_statut ?? null,
                    pieces: 0,
                    total: 0,
                    lignes: [] as any[],
                };
                parTicket.set(cle, t);
            }
            const qte = Number(l.quantite) || 0;
            const pu = Number(l.prix_unitaire) || 0;
            t.pieces += qte;
            t.total += qte * pu;
            // La facture peut n'etre portee que par une partie des lignes :
            // des qu'une ligne en a une, le ticket est facture.
            if (!t.factureId && l.facture_id) {
                t.factureId = l.facture_id;
                t.factureNumero = l.facture_numero ?? null;
                t.factureStatut = l.facture_statut ?? null;
            }
            // On prend la premiere valeur NON VIDE plutot que celle de la
            // premiere ligne : une vente anterieure a ces colonnes les a
            // nulles, et une seule ligne renseignee suffit a qualifier le
            // ticket.
            if (!t.modePaiement && l.mode_paiement) t.modePaiement = l.mode_paiement;
            if (!t.typeVente && l.type_vente) t.typeVente = l.type_vente;
            if (!t.clientNom && l.client_nom) t.clientNom = l.client_nom;
            t.lignes.push({
                id: l.id,
                modelId: l.modelId,
                modelNom: l.model_nom || l.modelId,
                couleur: l.couleur,
                taille: l.taille,
                quantite: qte,
                prixUnitaire: pu,
            });
        }

        const tickets = [...parTicket.values()].map(t => ({ ...t, total: Number(t.total.toFixed(2)) }));

        const parMode: Record<string, { pieces: number; total: number; tickets: number }> = {};
        for (const t of tickets) {
            // Une vente d'avant la colonne `mode_paiement` n'en porte aucun :
            // elle est comptee a part plutot que rangee d'office en especes,
            // ce qui ferait un fond de caisse faux.
            const mode = t.modePaiement || 'AUTRE';
            const acc = parMode[mode] || (parMode[mode] = { pieces: 0, total: 0, tickets: 0 });
            acc.pieces += t.pieces;
            acc.total = Number((acc.total + t.total).toFixed(2));
            acc.tickets += 1;
        }

        res.json({
            date,
            tickets,
            parMode,
            totaux: {
                tickets: tickets.length,
                pieces: tickets.reduce((a, t) => a + t.pieces, 0),
                total: Number(tickets.reduce((a, t) => a + t.total, 0).toFixed(2)),
            },
        });
    } catch (error) {
        console.error('Get caisse journal error:', error);
        res.status(500).json({ message: 'Error fetching cash journal' });
    }
};

/**
 * Annule un ticket entier : les pieces reviennent au stock disponible et la
 * facture qui le couvrait passe en ANNULEE.
 *
 * Refus si un reglement a deja ete enregistre sur cette facture : effacer la
 * vente laisserait un encaissement orphelin, c'est-a-dire de l'argent recu
 * sans contrepartie. Dans ce cas on passe par un avoir, pas par une
 * suppression silencieuse.
 */
export const annulerTicketCaisse = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const ticket = String(req.params.ticket || '').trim();
    if (!ticket) return res.status(400).json({ message: 'Ticket manquant' });

    try {
        const lignes = db.prepare(`
            SELECT s.id, s.facture_id FROM st_stock_sorties s
            WHERE s.owner_id = ? AND s.canal = 'MAGASIN' AND ${CLE_TICKET} = ?
        `).all(companyId, ticket) as any[];

        if (lignes.length === 0) return res.status(404).json({ message: 'Ticket introuvable' });

        const factureIds = [...new Set(lignes.map(l => l.facture_id).filter(Boolean))] as string[];
        for (const fid of factureIds) {
            const paye = db.prepare('SELECT COALESCE(SUM(montant), 0) AS total FROM paiements WHERE owner_id = ? AND facture_id = ?')
                .get(companyId, fid) as any;
            if ((Number(paye?.total) || 0) > 0) {
                return res.status(400).json({
                    message: "Ce ticket porte une facture deja reglee : annulez le reglement, ou etablissez un avoir.",
                    code: 'FACTURE_REGLEE',
                });
            }
        }

        // Transaction : rendre la moitie des pieces et laisser la facture
        // debout serait pire que ne rien annuler du tout.
        db.transaction(() => {
            for (const fid of factureIds) {
                db.prepare("UPDATE factures SET statut = 'ANNULEE', montant_paye = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
                    .run(fid, companyId);
            }
            db.prepare("DELETE FROM st_stock_sorties WHERE owner_id = ? AND canal = 'MAGASIN' AND COALESCE(ticket_ref, batch_id, id) = ?")
                .run(companyId, ticket);
        })();

        res.json({ message: 'Ticket annule', lignes: lignes.length, facturesAnnulees: factureIds.length });
    } catch (error) {
        console.error('Cancel caisse ticket error:', error);
        res.status(500).json({ message: 'Error cancelling ticket' });
    }
};
