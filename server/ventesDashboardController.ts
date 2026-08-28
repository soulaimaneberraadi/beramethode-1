import { Request, Response } from 'express';
import db from './db';

/**
 * Tableau de bord des ventes — ce qui part, ce qui dort, et qui paie.
 *
 * Il ne calcule RIEN à partir des tarifs affichés ni des quantités prévues :
 * tout vient des mouvements réellement enregistrés (entrées de stock acceptées
 * et sorties). Un modèle « lancé à 200 pièces » ne compte que par ce qui est
 * entré en stock, et sa vente que par ce qui en est sorti — c'est la seule
 * lecture qui ne ment pas quand la production a livré 180 au lieu de 200.
 *
 * Les décisions attendues sont au nombre de trois, et la page ne sert qu'à
 * les rendre évidentes :
 *   1. relancer un modèle qui part vite,
 *   2. arrêter (ou solder) un modèle qui dort,
 *   3. savoir qui doit de l'argent avant de le resservir.
 */

/** Fenêtre d'analyse, bornée : au-delà d'un an la « vitesse de vente » ne veut
 *  plus rien dire, et en deçà d'une semaine le hasard domine. */
const fenetre = (v: unknown): number => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return 30;
    return Math.min(365, Math.max(7, n));
};

const jourISO = (d: Date) => d.toISOString().split('T')[0];

/** Seuils de lecture d'un modèle. Ils sont ici, nommés, plutôt que dispersés
 *  dans des `if` : c'est la politique commerciale, elle se relit. */
const SEUIL_TOP = 60;      // % écoulé → le modèle marche, on relance
const SEUIL_LENT = 20;     // % écoulé au-delà du délai → il dort
const DELAI_JUGEMENT = 15; // jours avant de qualifier un modèle de « lent »

export const getVentesDashboard = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const jours = fenetre((req.query as any).jours);
    const depuis = jourISO(new Date(Date.now() - jours * 86400000));

    try {
        // ── Ce qui est sorti sur la période, par modèle ───────────────────
        const ventes = db.prepare(`
            SELECT s.modelId,
                   COALESCE(json_extract(m.data, '$.meta_data.nom_modele'), json_extract(m.data, '$.filename')) AS nom,
                   json_extract(m.data, '$.meta_data.reference') AS reference,
                   SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   MIN(s.date_sortie) AS premiere,
                   MAX(s.date_sortie) AS derniere,
                   COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets
            FROM st_stock_sorties s
            LEFT JOIN models m ON m.id = s.modelId AND m.user_id = s.owner_id
            WHERE s.owner_id = ? AND s.date_sortie >= ?
            GROUP BY s.modelId
        `).all(companyId, depuis) as any[];

        // ── Ce qui est entré en stock, tous temps confondus ───────────────
        // La vitesse d'écoulement se mesure contre la QUANTITÉ PRODUITE, pas
        // contre le stock restant : sinon un modèle presque épuisé afficherait
        // toujours 100 %, qu'il ait mis deux jours ou six mois.
        const entrees = db.prepare(`
            SELECT modelId,
                   SUM(quantite) AS produit,
                   MIN(date_entree) AS premiereEntree
            FROM st_stock_entries
            WHERE owner_id = ? AND qualite = 'ACCEPTED'
            GROUP BY modelId
        `).all(companyId) as any[];

        const sortiesTotales = db.prepare(`
            SELECT modelId, SUM(quantite) AS sorti FROM st_stock_sorties WHERE owner_id = ? GROUP BY modelId
        `).all(companyId) as any[];

        const parEntree = new Map(entrees.map(e => [String(e.modelId), e]));
        const parSortie = new Map(sortiesTotales.map(s => [String(s.modelId), Number(s.sorti) || 0]));
        const parVente = new Map(ventes.map(v => [String(v.modelId), v]));

        const aujourdHui = Date.now();
        const modeles = [...new Set([...parEntree.keys(), ...parVente.keys()])].map(modelId => {
            const e = parEntree.get(modelId);
            const v = parVente.get(modelId);
            const produit = Number(e?.produit) || 0;
            const sortiTotal = parSortie.get(modelId) || 0;
            const stock = Math.max(0, produit - sortiTotal);
            const pieces = Number(v?.pieces) || 0;
            const ca = Number(v?.ca) || 0;

            // Âge du lot : depuis sa première entrée en stock, pas depuis sa
            // première vente — un modèle qui n'a jamais été vendu est
            // justement celui qu'on cherche.
            const debut = e?.premiereEntree || v?.premiere || null;
            const ageJours = debut
                ? Math.max(1, Math.round((aujourdHui - new Date(`${debut}T00:00:00`).getTime()) / 86400000))
                : null;

            const ecoule = produit > 0 ? (sortiTotal / produit) * 100 : 0;
            const parJour = ageJours ? sortiTotal / ageJours : 0;
            // Jours restants avant rupture au rythme actuel : c'est ce chiffre
            // qui dit s'il faut relancer la production MAINTENANT.
            const joursAvantRupture = parJour > 0 ? Math.round(stock / parJour) : null;

            let statut: 'TOP' | 'OK' | 'LENT' | 'MORT' | 'NEUF';
            if (ageJours == null || ageJours < 3) statut = 'NEUF';
            else if (ecoule >= SEUIL_TOP) statut = 'TOP';
            else if (ageJours >= DELAI_JUGEMENT && ecoule < SEUIL_LENT) statut = sortiTotal === 0 ? 'MORT' : 'LENT';
            else statut = 'OK';

            return {
                modelId,
                nom: v?.nom || e?.nom || modelId,
                reference: v?.reference || null,
                produit,
                vendu: sortiTotal,
                stock,
                piecesPeriode: pieces,
                caPeriode: Number(ca.toFixed(2)),
                ticketsPeriode: Number(v?.tickets) || 0,
                ageJours,
                ecoule: Number(ecoule.toFixed(1)),
                parJour: Number(parJour.toFixed(2)),
                joursAvantRupture,
                statut,
            };
        }).sort((a, b) => b.caPeriode - a.caPeriode || b.vendu - a.vendu);

        // ── Répartition par canal et par segment ─────────────────────────
        const parCanal = db.prepare(`
            SELECT COALESCE(canal, 'NON_PRECISE') AS canal,
                   SUM(quantite) AS pieces,
                   SUM(quantite * prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(ticket_ref, batch_id, id)) AS tickets
            FROM st_stock_sorties WHERE owner_id = ? AND date_sortie >= ?
            GROUP BY COALESCE(canal, 'NON_PRECISE')
        `).all(companyId, depuis) as any[];

        const parSegment = db.prepare(`
            SELECT COALESCE(type_vente, 'NON_PRECISE') AS segment,
                   SUM(quantite) AS pieces,
                   SUM(quantite * prix_unitaire) AS ca
            FROM st_stock_sorties WHERE owner_id = ? AND date_sortie >= ?
            GROUP BY COALESCE(type_vente, 'NON_PRECISE')
        `).all(companyId, depuis) as any[];

        const parPaiement = db.prepare(`
            SELECT COALESCE(mode_paiement, 'NON_PRECISE') AS mode,
                   SUM(quantite * prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(ticket_ref, batch_id, id)) AS tickets
            FROM st_stock_sorties WHERE owner_id = ? AND date_sortie >= ?
            GROUP BY COALESCE(mode_paiement, 'NON_PRECISE')
        `).all(companyId, depuis) as any[];

        // ── Les clients : ce qu'ils achètent, ce qu'ils doivent ──────────
        // L'encours vient des FACTURES, pas des sorties : une vente comptant
        // n'est pas une dette, et une facture réglée à moitié en est une.
        const clients = db.prepare(`
            SELECT c.id, c.nom, c.type, c.tel, c.ville, c.role,
                   COALESCE(v.pieces, 0) AS pieces,
                   COALESCE(v.ca, 0) AS ca,
                   COALESCE(v.tickets, 0) AS tickets,
                   v.derniere,
                   COALESCE(f.encours, 0) AS encours,
                   COALESCE(f.enRetard, 0) AS enRetard
            FROM st_clients c
            LEFT JOIN (
                SELECT client_id,
                       SUM(quantite) AS pieces,
                       SUM(quantite * prix_unitaire) AS ca,
                       COUNT(DISTINCT COALESCE(ticket_ref, batch_id, id)) AS tickets,
                       MAX(date_sortie) AS derniere
                FROM st_stock_sorties WHERE owner_id = ? AND date_sortie >= ? AND client_id IS NOT NULL
                GROUP BY client_id
            ) v ON v.client_id = c.id
            LEFT JOIN (
                SELECT source_id AS client_id,
                       SUM(MAX(0, total_ttc - COALESCE(montant_paye, 0))) AS encours,
                       SUM(CASE WHEN date_echeance IS NOT NULL AND date_echeance < DATE('now')
                                 AND total_ttc - COALESCE(montant_paye, 0) > 0 THEN 1 ELSE 0 END) AS enRetard
                FROM factures
                WHERE owner_id = ? AND type = 'VENTE' AND statut != 'ANNULEE' AND source_id IS NOT NULL
                GROUP BY source_id
            ) f ON f.client_id = c.id
            WHERE c.owner_id = ?
        `).all(companyId, depuis, companyId, companyId) as any[];

        const clientsClasses = clients.map(c => {
            const ca = Number(c.ca) || 0;
            const encours = Number(c.encours) || 0;
            const enRetard = Number(c.enRetard) || 0;
            // Un impayé échu prime sur le chiffre d'affaires : un bon client
            // qui ne paie plus reste un risque, pas un VIP.
            const statut = enRetard > 0 ? 'RETARD' : encours > 0 ? 'ENCOURS' : ca > 0 ? 'ACTIF' : 'DORMANT';
            return {
                id: c.id, nom: c.nom, type: c.type, tel: c.tel, ville: c.ville, role: c.role,
                pieces: Number(c.pieces) || 0,
                ca: Number(ca.toFixed(2)),
                tickets: Number(c.tickets) || 0,
                derniere: c.derniere || null,
                encours: Number(encours.toFixed(2)),
                facturesEnRetard: enRetard,
                statut,
            };
        }).sort((a, b) => b.ca - a.ca || b.encours - a.encours);

        const totalCa = parCanal.reduce((a, c) => a + (Number(c.ca) || 0), 0);
        const totalPieces = parCanal.reduce((a, c) => a + (Number(c.pieces) || 0), 0);
        const totalTickets = parCanal.reduce((a, c) => a + (Number(c.tickets) || 0), 0);

        res.json({
            jours,
            depuis,
            kpis: {
                ca: Number(totalCa.toFixed(2)),
                pieces: totalPieces,
                tickets: totalTickets,
                panierMoyen: totalTickets > 0 ? Number((totalCa / totalTickets).toFixed(2)) : 0,
                encoursTotal: Number(clientsClasses.reduce((a, c) => a + c.encours, 0).toFixed(2)),
            },
            parCanal: parCanal.map(c => ({ ...c, ca: Number((Number(c.ca) || 0).toFixed(2)) })),
            parSegment: parSegment.map(s => ({ ...s, ca: Number((Number(s.ca) || 0).toFixed(2)) })),
            parPaiement: parPaiement.map(p => ({ ...p, ca: Number((Number(p.ca) || 0).toFixed(2)) })),
            modeles,
            clients: clientsClasses,
        });
    } catch (error) {
        console.error('Ventes dashboard error:', error);
        res.status(500).json({ message: 'Error building sales dashboard' });
    }
};
