import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
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
    // Filtre facultatif par caissier : la cloture de journee se fait souvent
    // caissier par caissier quand le comptoir est tenu a plusieurs.
    const vendeurFiltre = String((req.query as any).vendeurId ?? '').trim();
    try {
        const lignes = db.prepare(`
            SELECT ${CLE_TICKET} AS ticket,
                   s.id, s.modelId, s.couleur, s.taille, s.quantite, s.prix_unitaire,
                   s.client_id, s.client_nom, s.mode_paiement, s.type_vente, s.note,
                   s.facture_id, s.date_sortie, s.created_at, s.retour_de,
                   s.vendeur_id, s.vendeur_nom,
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
                    vendeurId: l.vendeur_id != null ? String(l.vendeur_id) : null,
                    vendeurNom: l.vendeur_nom ?? null,
                    // Un ticket qui ne porte QUE des lignes de retour (retour
                    // rejoue un autre jour que la vente d'origine) reste un
                    // ticket a part entiere dans la journee ou il tombe.
                    aDesRetours: false,
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
            if (l.retour_de) t.aDesRetours = true;
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
            if (!t.vendeurNom && l.vendeur_nom) { t.vendeurNom = l.vendeur_nom; t.vendeurId = l.vendeur_id != null ? String(l.vendeur_id) : null; }
            t.lignes.push({
                id: l.id,
                modelId: l.modelId,
                modelNom: l.model_nom || l.modelId,
                couleur: l.couleur,
                taille: l.taille,
                quantite: qte,
                prixUnitaire: pu,
                retour: !!l.retour_de,
            });
        }

        let tickets = [...parTicket.values()].map(t => ({ ...t, total: Number(t.total.toFixed(2)) }));
        if (vendeurFiltre) tickets = tickets.filter(t => (t.vendeurId || 'NON_ATTRIBUE') === vendeurFiltre);

        const parMode: Record<string, { pieces: number; total: number; tickets: number }> = {};
        // Par caissier, puis par mode DANS le caissier : c'est exactement la
        // question de la cloture a plusieurs postes — « qui a encaisse quoi,
        // et dans quel moyen de paiement ? ». Le total « tous modes » du
        // caissier vient s'ajouter a cote, pour l'annonce rapide.
        const parVendeur: Record<string, { nom: string; pieces: number; total: number; tickets: number; parMode: Record<string, { pieces: number; total: number; tickets: number }> }> = {};
        for (const t of tickets) {
            // Une vente d'avant la colonne `mode_paiement` n'en porte aucun :
            // elle est comptee a part plutot que rangee d'office en especes,
            // ce qui ferait un fond de caisse faux.
            const mode = t.modePaiement || 'AUTRE';
            const acc = parMode[mode] || (parMode[mode] = { pieces: 0, total: 0, tickets: 0 });
            acc.pieces += t.pieces;
            acc.total = Number((acc.total + t.total).toFixed(2));
            acc.tickets += 1;

            // Vente anterieure a la colonne `vendeur_id`, ou canal jamais
            // attribue : rangee a part, jamais devinee sur un caissier.
            const vKey = t.vendeurId || 'NON_ATTRIBUE';
            const vAcc = parVendeur[vKey] || (parVendeur[vKey] = { nom: t.vendeurNom || 'Non attribué', pieces: 0, total: 0, tickets: 0, parMode: {} });
            vAcc.pieces += t.pieces;
            vAcc.total = Number((vAcc.total + t.total).toFixed(2));
            vAcc.tickets += 1;
            const vModeAcc = vAcc.parMode[mode] || (vAcc.parMode[mode] = { pieces: 0, total: 0, tickets: 0 });
            vModeAcc.pieces += t.pieces;
            vModeAcc.total = Number((vModeAcc.total + t.total).toFixed(2));
            vModeAcc.tickets += 1;
        }

        res.json({
            date,
            tickets,
            parMode,
            parVendeur,
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

/**
 * Un ticket, quel que soit le jour ou il est tombe — contrairement au
 * journal (borne a une journee), c'est ce qu'il faut pour retrouver une
 * vente de la semaine derniere au moment ou le client revient avec sa pièce.
 *
 * Chaque ligne d'origine (retour_de IS NULL) porte le « restant » encore
 * retournable : la quantite vendue moins tout ce qui a deja ete retourne
 * dessus. C'est ce chiffre, calcule ICI et nulle part cote client, qui
 * empeche de retourner deux fois la meme piece.
 */
export const getCaisseTicket = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const ticket = String(req.params.ticket || '').trim();
    if (!ticket) return res.status(400).json({ message: 'Ticket manquant' });

    try {
        const lignes = db.prepare(`
            SELECT s.id, s.modelId, s.couleur, s.taille, s.quantite, s.prix_unitaire,
                   s.client_id, s.client_nom, s.mode_paiement, s.type_vente, s.retour_de,
                   s.vendeur_nom, s.date_sortie, s.created_at,
                   COALESCE(json_extract(m.data, '$.meta_data.nom_modele'), json_extract(m.data, '$.filename')) AS model_nom
            FROM st_stock_sorties s
            LEFT JOIN models m ON m.id = s.modelId AND m.user_id = s.owner_id
            WHERE s.owner_id = ? AND s.canal = 'MAGASIN' AND ${CLE_TICKET} = ?
            ORDER BY s.created_at ASC, s.id ASC
        `).all(companyId, ticket) as any[];

        if (lignes.length === 0) return res.status(404).json({ message: 'Ticket introuvable' });

        // Deja retourne, par ligne d'origine : la somme (negative) des retours
        // qui la pointent.
        const dejaRetourne = new Map<string, number>();
        for (const l of lignes) {
            if (!l.retour_de) continue;
            const cle = String(l.retour_de);
            dejaRetourne.set(cle, (dejaRetourne.get(cle) || 0) + (Number(l.quantite) || 0));
        }

        const origines = lignes.filter(l => !l.retour_de && Number(l.quantite) > 0);
        const premiere = lignes[0];

        res.json({
            ticket,
            clientId: premiere.client_id ?? null,
            clientNom: premiere.client_nom ?? null,
            modePaiement: premiere.mode_paiement ?? null,
            typeVente: premiere.type_vente ?? null,
            vendeurNom: premiere.vendeur_nom ?? null,
            dateSortie: premiere.date_sortie ?? null,
            lignes: origines.map(l => {
                const qte = Number(l.quantite) || 0;
                const retourne = Math.abs(dejaRetourne.get(String(l.id)) || 0);
                return {
                    sortieId: String(l.id),
                    modelId: l.modelId,
                    modelNom: l.model_nom || l.modelId,
                    couleur: l.couleur,
                    taille: l.taille,
                    quantite: qte,
                    prixUnitaire: Number(l.prix_unitaire) || 0,
                    dejaRetourne: retourne,
                    restant: Math.max(0, qte - retourne),
                };
            }),
        });
    } catch (error) {
        console.error('Get caisse ticket error:', error);
        res.status(500).json({ message: 'Error fetching ticket' });
    }
};

/**
 * Retour (partiel ou total) d'un ticket : le client rapporte une ou
 * plusieurs pieces, et une piece rapportee doit redevenir vendable SANS
 * jamais toucher a la vente d'origine — c'est elle qui reste la preuve de ce
 * qui a ete vendu, a qui, et a quel prix.
 *
 * Chaque ligne de retour est une sortie a quantite NEGATIVE, copiee de la
 * ligne d'origine (modele, couleur, taille, prix, segment, client), avec
 * `retour_de` pointant vers elle. La matrice de stock (entrees - sorties)
 * la remet donc en stock automatiquement, et le chiffre d'affaires du jour
 * en tient compte des qu'elle est ecrite — aucun second calcul a maintenir.
 */
export const retournerTicketCaisse = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const body = req.body || {};
    const ticket = String(body.ticket_ref || '').trim();
    const demandes: Array<{ sortieId: string; quantite: number }> = (Array.isArray(body.lignes) ? body.lignes : [])
        .map((l: any) => ({ sortieId: String(l.sortie_id || l.sortieId || ''), quantite: Math.floor(Number(l.quantite) || 0) }))
        .filter((l: any) => l.sortieId && l.quantite > 0);

    if (!ticket) return res.status(400).json({ message: 'Ticket manquant' });
    if (demandes.length === 0) return res.status(400).json({ message: 'Aucune quantité à retourner' });

    const motif = String(body.motif || '').trim() || null;
    const vendeurId = (req as any).user?.id ?? null;
    const vendeurNom = (req as any).user?.name ?? null;

    try {
        // Chaque ligne d'origine visee, avec ce qu'elle a deja rendu — la
        // MEME requete que la lecture du ticket, pour ne jamais autoriser un
        // retour que l'ecran de lecture n'aurait pas laisse voir.
        const ids = demandes.map(d => d.sortieId);
        const placeholders = ids.map(() => '?').join(',');
        const origines = db.prepare(`
            SELECT s.* FROM st_stock_sorties s
            WHERE s.owner_id = ? AND s.canal = 'MAGASIN' AND s.retour_de IS NULL
              AND ${CLE_TICKET} = ? AND s.id IN (${placeholders})
        `).all(companyId, ticket, ...ids) as any[];

        const parId = new Map(origines.map(o => [String(o.id), o]));
        for (const d of demandes) {
            const o = parId.get(d.sortieId);
            if (!o) return res.status(404).json({ message: `Ligne ${d.sortieId} introuvable sur ce ticket` });
        }

        const dejaParId = new Map<string, number>();
        if (ids.length > 0) {
            const rows = db.prepare(`
                SELECT retour_de, COALESCE(SUM(quantite), 0) AS total FROM st_stock_sorties
                WHERE owner_id = ? AND retour_de IN (${placeholders}) GROUP BY retour_de
            `).all(companyId, ...ids) as any[];
            for (const r of rows) dejaParId.set(String(r.retour_de), Math.abs(Number(r.total) || 0));
        }

        for (const d of demandes) {
            const o = parId.get(d.sortieId)!;
            const restant = (Number(o.quantite) || 0) - (dejaParId.get(d.sortieId) || 0);
            if (d.quantite > restant) {
                return res.status(400).json({
                    message: `${o.couleur || '—'} / ${o.taille || '—'} : ${restant} pièce(s) encore retournable(s), ${d.quantite} demandée(s)`,
                });
            }
        }

        const date = new Date().toISOString().split('T')[0];
        const insert = db.prepare(`
            INSERT INTO st_stock_sorties (
                id, owner_id, modelId, client_id, client_nom, couleur, taille, quantite, prix_unitaire,
                batch_id, note, date_sortie, canal, mode_paiement, type_vente, ticket_ref, retour_de,
                vendeur_id, vendeur_nom, emplacement_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const batchId = randomUUID();
        let montant = 0;
        const lignesRetournees: any[] = [];
        db.transaction(() => {
            for (const d of demandes) {
                const o = parId.get(d.sortieId)!;
                const pu = Number(o.prix_unitaire) || 0;
                const qteNeg = -Math.abs(d.quantite);
                const id = randomUUID();
                insert.run(
                    id, companyId, o.modelId, o.client_id || null, o.client_nom || null,
                    o.couleur, o.taille, qteNeg, pu, batchId,
                    motif ? `RETOUR ${ticket} : ${motif}` : `RETOUR ${ticket}`,
                    date, 'MAGASIN', o.mode_paiement || null, o.type_vente || null, ticket, d.sortieId,
                    vendeurId, vendeurNom,
                    // La pièce revient là d'où elle est partie : l'emplacement de
                    // la vente d'origine (NULL = Dépôt principal, comme avant).
                    o.emplacement_id || null,
                );
                montant += Math.abs(d.quantite) * pu;
                lignesRetournees.push({
                    id, sortieId: d.sortieId, modelId: o.modelId, couleur: o.couleur, taille: o.taille,
                    quantite: qteNeg, prixUnitaire: pu,
                });
            }
        })();

        res.json({
            ticket,
            batchId,
            montant: Number(montant.toFixed(2)),
            lignes: lignesRetournees,
        });
    } catch (error) {
        console.error('Caisse retour error:', error);
        res.status(500).json({ message: 'Error recording return' });
    }
};
