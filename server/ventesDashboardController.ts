import { Request, Response } from 'express';
import db from './db';
import { emetteurDe } from './clientsController';

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

/** Un filtre commun à TOUTES les agrégations : sans cela, le total en haut
 *  de page et le détail en dessous répondraient à deux questions
 *  différentes — et c'est de l'argent. */
const construireFiltre = (q: any, companyId: number | string) => {
    const jours = fenetre(q.jours);
    const iso = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
    const du = iso(q.du) || jourISO(new Date(Date.now() - jours * 86400000));
    const au = iso(q.au);
    const clientId = q.clientId ? String(q.clientId) : null;
    const canal = ['MAGASIN', 'ONLINE', 'ATELIER'].includes(String(q.canal || '').toUpperCase())
        ? String(q.canal).toUpperCase() : null;
    const segment = ['BOUTIQUE', 'DETAIL', 'GROS'].includes(String(q.segment || '').toUpperCase())
        ? String(q.segment).toUpperCase() : null;

    const clauses = ['s.owner_id = ?', 's.date_sortie >= ?'];
    const params: any[] = [companyId, du];
    if (au) { clauses.push('s.date_sortie <= ?'); params.push(au); }
    if (clientId) { clauses.push('s.client_id = ?'); params.push(clientId); }
    if (canal) { clauses.push('s.canal = ?'); params.push(canal); }
    if (segment) { clauses.push('s.type_vente = ?'); params.push(segment); }

    return { jours, du, au, clientId, canal, segment, where: clauses.join(' AND '), params };
};

/**
 * La MÊME fenêtre, décalée juste avant : c'est ce qui transforme « 145 000 »
 * en « 145 000, en hausse de 12 % ». Un chiffre sans comparaison ne dit pas
 * si l'atelier va bien — il dit seulement qu'il a vendu.
 */
const fenetrePrecedente = (du: string, au: string | null) => {
    const debut = new Date(`${du}T00:00:00`).getTime();
    const fin = au ? new Date(`${au}T00:00:00`).getTime() : Date.now();
    const duree = Math.max(86400000, fin - debut);
    return {
        du: jourISO(new Date(debut - duree)),
        au: jourISO(new Date(debut - 86400000)),
    };
};

export const getVentesDashboard = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const f = construireFiltre(req.query || {}, companyId);
    const jours = f.jours;
    const depuis = f.du;

    try {
        // ── Ce qui est sorti sur la période, par modèle ───────────────────
        const ventes = db.prepare(`
            SELECT s.modelId,
                   COALESCE(json_extract(m.data, '$.meta_data.nom_modele'), json_extract(m.data, '$.filename')) AS nom,
                   json_extract(m.data, '$.meta_data.reference') AS reference,
                   json_extract(m.data, '$.image') AS image,
                   SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   MIN(s.date_sortie) AS premiere,
                   MAX(s.date_sortie) AS derniere,
                   COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets
            FROM st_stock_sorties s
            LEFT JOIN models m ON m.id = s.modelId AND m.user_id = s.owner_id
            WHERE ${f.where}
            GROUP BY s.modelId
        `).all(...f.params) as any[];

        // ── Où chaque modèle se vend le mieux ────────────────────────────
        // Le même vêtement ne marche pas partout : celui qui part en ligne
        // n'est pas celui qui part au comptoir. Sans ce détail, on réassortit
        // le mauvais canal et la pièce dort là où personne ne la demande.
        const ventesParCanal = db.prepare(`
            SELECT s.modelId,
                   COALESCE(s.canal, 'NON_PRECISE') AS canal,
                   SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca
            FROM st_stock_sorties s
            WHERE ${f.where}
            GROUP BY s.modelId, COALESCE(s.canal, 'NON_PRECISE')
        `).all(...f.params) as any[];

        const canauxParModele = new Map<string, Array<{ canal: string; pieces: number; ca: number }>>();
        for (const r of ventesParCanal) {
            const cle = String(r.modelId);
            const liste = canauxParModele.get(cle) || [];
            liste.push({ canal: String(r.canal), pieces: Number(r.pieces) || 0, ca: Number((Number(r.ca) || 0).toFixed(2)) });
            canauxParModele.set(cle, liste);
        }

        // ── Ce qui est entré en stock, tous temps confondus ───────────────
        // La vitesse d'écoulement se mesure contre la QUANTITÉ PRODUITE, pas
        // contre le stock restant : sinon un modèle presque épuisé afficherait
        // toujours 100 %, qu'il ait mis deux jours ou six mois.
        const entrees = db.prepare(`
            SELECT e.modelId,
                   COALESCE(json_extract(m.data, '$.meta_data.nom_modele'), json_extract(m.data, '$.filename')) AS nom,
                   json_extract(m.data, '$.meta_data.reference') AS reference,
                   json_extract(m.data, '$.image') AS image,
                   SUM(e.quantite) AS produit,
                   MIN(e.date_entree) AS premiereEntree
            FROM st_stock_entries e
            LEFT JOIN models m ON m.id = e.modelId AND m.user_id = e.owner_id
            WHERE e.owner_id = ? AND e.qualite = 'ACCEPTED'
            GROUP BY e.modelId
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

            // Canal dominant : celui qui prend la plus grosse part des pièces
            // vendues. La PART compte autant que le classement — « 51 % en
            // ligne » ne se décide pas comme « 95 % en ligne ».
            const canaux = (canauxParModele.get(modelId) || []).sort((a, b) => b.pieces - a.pieces);
            const totalCanaux = canaux.reduce((a, c) => a + c.pieces, 0);
            const dominant = canaux[0] || null;

            return {
                modelId,
                nom: v?.nom || e?.nom || modelId,
                canaux,
                canalFort: dominant ? dominant.canal : null,
                partCanalFort: dominant && totalCanaux > 0 ? Number(((dominant.pieces / totalCanaux) * 100).toFixed(1)) : null,
                reference: v?.reference || e?.reference || null,
                image: v?.image || e?.image || null,
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

        // ── Ce que le marché demande : tailles et couleurs ───────────────
        // Un atelier ne coupe pas « 200 pièces », il coupe une répartition.
        // La demande réelle, taille par taille, est ce qui empêche de refaire
        // le même lot avec les mêmes invendus en S.
        const tailles = db.prepare(`
            SELECT COALESCE(NULLIF(TRIM(taille), ''), '—') AS taille,
                   SUM(quantite) AS pieces,
                   SUM(quantite * prix_unitaire) AS ca
            FROM st_stock_sorties s WHERE ${f.where}
            GROUP BY COALESCE(NULLIF(TRIM(taille), ''), '—')
            ORDER BY pieces DESC
        `).all(...f.params) as any[];

        const couleurs = db.prepare(`
            SELECT COALESCE(NULLIF(TRIM(couleur), ''), '—') AS couleur,
                   SUM(quantite) AS pieces,
                   SUM(quantite * prix_unitaire) AS ca
            FROM st_stock_sorties s WHERE ${f.where}
            GROUP BY COALESCE(NULLIF(TRIM(couleur), ''), '—')
            ORDER BY pieces DESC
        `).all(...f.params) as any[];

        // ── Qualité : ce qui est sorti de l'atelier, et dans quel état ───
        // Le taux de défaut se lit sur les ENTRÉES, pas sur les ventes : une
        // pièce à retoucher n'a jamais atteint le rayon, et c'est justement
        // ce qu'on veut corriger avant de relancer 1 000 pièces.
        const qualite = db.prepare(`
            SELECT COALESCE(qualite, 'ACCEPTED') AS qualite, SUM(quantite) AS pieces
            FROM st_stock_entries WHERE owner_id = ? AND date_entree >= ?
            GROUP BY COALESCE(qualite, 'ACCEPTED')
        `).all(companyId, depuis) as any[];

        const defautsParModele = db.prepare(`
            SELECT e.modelId,
                   COALESCE(json_extract(m.data, '$.meta_data.nom_modele'), json_extract(m.data, '$.filename')) AS nom,
                   SUM(CASE WHEN COALESCE(e.qualite, 'ACCEPTED') = 'ACCEPTED' THEN e.quantite ELSE 0 END) AS ok,
                   SUM(CASE WHEN COALESCE(e.qualite, 'ACCEPTED') != 'ACCEPTED' THEN e.quantite ELSE 0 END) AS defauts
            FROM st_stock_entries e
            LEFT JOIN models m ON m.id = e.modelId AND m.user_id = e.owner_id
            WHERE e.owner_id = ?
            GROUP BY e.modelId
            HAVING defauts > 0
            ORDER BY defauts DESC
            LIMIT 20
        `).all(companyId) as any[];

        // ── Répartition par canal et par segment ─────────────────────────
        const parCanal = db.prepare(`
            SELECT COALESCE(canal, 'NON_PRECISE') AS canal,
                   SUM(quantite) AS pieces,
                   SUM(quantite * prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(ticket_ref, batch_id, id)) AS tickets
            FROM st_stock_sorties s WHERE ${f.where}
            GROUP BY COALESCE(s.canal, 'NON_PRECISE')
        `).all(...f.params) as any[];

        const parSegment = db.prepare(`
            SELECT COALESCE(type_vente, 'NON_PRECISE') AS segment,
                   SUM(quantite) AS pieces,
                   SUM(quantite * prix_unitaire) AS ca
            FROM st_stock_sorties s WHERE ${f.where}
            GROUP BY COALESCE(s.type_vente, 'NON_PRECISE')
        `).all(...f.params) as any[];

        const parPaiement = db.prepare(`
            SELECT COALESCE(mode_paiement, 'NON_PRECISE') AS mode,
                   SUM(quantite * prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(ticket_ref, batch_id, id)) AS tickets
            FROM st_stock_sorties s WHERE ${f.where}
            GROUP BY COALESCE(s.mode_paiement, 'NON_PRECISE')
        `).all(...f.params) as any[];

        // ── La courbe : sans elle, un tableau de bord est aveugle ────────
        // Un total dit combien ; la série dit si ça monte, si ça retombe, et
        // quel jour. C'est la première chose qu'on regarde le lundi matin.
        const serie = db.prepare(`
            SELECT s.date_sortie AS jour,
                   SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets
            FROM st_stock_sorties s
            WHERE ${f.where}
            GROUP BY s.date_sortie
            ORDER BY s.date_sortie
        `).all(...f.params) as any[];

        // ── Le même filtre, une fenêtre plus tôt ─────────────────────────
        const p = fenetrePrecedente(f.du, f.au);
        const clausesP = ['s.owner_id = ?', 's.date_sortie >= ?', 's.date_sortie <= ?'];
        const paramsP: any[] = [companyId, p.du, p.au];
        if (f.clientId) { clausesP.push('s.client_id = ?'); paramsP.push(f.clientId); }
        if (f.canal) { clausesP.push('s.canal = ?'); paramsP.push(f.canal); }
        if (f.segment) { clausesP.push('s.type_vente = ?'); paramsP.push(f.segment); }
        const avant = db.prepare(`
            SELECT SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets
            FROM st_stock_sorties s WHERE ${clausesP.join(' AND ')}
        `).get(...paramsP) as any;

        // ── Le rythme de la semaine ──────────────────────────────────────
        // Savoir que le samedi fait trois fois le mardi change les horaires
        // du comptoir et la date des livraisons, pas seulement un graphique.
        const parJourSemaine = db.prepare(`
            SELECT CAST(strftime('%w', s.date_sortie) AS INTEGER) AS jour,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   SUM(s.quantite) AS pieces
            FROM st_stock_sorties s
            WHERE ${f.where}
            GROUP BY CAST(strftime('%w', s.date_sortie) AS INTEGER)
        `).all(...f.params) as any[];

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
                SELECT s.client_id AS client_id,
                       SUM(s.quantite) AS pieces,
                       SUM(s.quantite * s.prix_unitaire) AS ca,
                       COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets,
                       MAX(s.date_sortie) AS derniere
                FROM st_stock_sorties s WHERE ${f.where} AND s.client_id IS NOT NULL
                GROUP BY s.client_id
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
        `).all(...f.params, companyId, companyId) as any[];

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

        // Concentration : la part du chiffre faite par les trois premiers
        // clients. Au-delà de 60 %, perdre un client ne se rattrape pas en un
        // mois — c'est un risque, pas une performance.
        const caClients = clientsClasses.reduce((a, c) => a + c.ca, 0);
        const caTop3 = clientsClasses.slice(0, 3).reduce((a, c) => a + c.ca, 0);

        const totalCa = parCanal.reduce((a, c) => a + (Number(c.ca) || 0), 0);
        const totalPieces = parCanal.reduce((a, c) => a + (Number(c.pieces) || 0), 0);
        const totalTickets = parCanal.reduce((a, c) => a + (Number(c.tickets) || 0), 0);

        res.json({
            jours,
            depuis,
            filtre: { du: f.du, au: f.au, clientId: f.clientId, canal: f.canal, segment: f.segment },
            kpis: {
                ca: Number(totalCa.toFixed(2)),
                pieces: totalPieces,
                tickets: totalTickets,
                panierMoyen: totalTickets > 0 ? Number((totalCa / totalTickets).toFixed(2)) : 0,
                encoursTotal: Number(clientsClasses.reduce((a, c) => a + c.encours, 0).toFixed(2)),
            },
            serie: serie.map(j => ({
                jour: j.jour,
                pieces: Number(j.pieces) || 0,
                ca: Number((Number(j.ca) || 0).toFixed(2)),
                tickets: Number(j.tickets) || 0,
            })),
            precedent: {
                du: p.du,
                au: p.au,
                ca: Number((Number(avant?.ca) || 0).toFixed(2)),
                pieces: Number(avant?.pieces) || 0,
                tickets: Number(avant?.tickets) || 0,
            },
            parJourSemaine: parJourSemaine.map(j => ({
                jour: Number(j.jour),
                ca: Number((Number(j.ca) || 0).toFixed(2)),
                pieces: Number(j.pieces) || 0,
            })),
            concentration: {
                partTop3: caClients > 0 ? Number(((caTop3 / caClients) * 100).toFixed(1)) : 0,
                clientsActifs: clientsClasses.filter(c => c.ca > 0).length,
            },
            parCanal: parCanal.map(c => ({ ...c, ca: Number((Number(c.ca) || 0).toFixed(2)) })),
            parSegment: parSegment.map(s => ({ ...s, ca: Number((Number(s.ca) || 0).toFixed(2)) })),
            parPaiement: parPaiement.map(p => ({ ...p, ca: Number((Number(p.ca) || 0).toFixed(2)) })),
            tailles: tailles.map(t => ({ ...t, ca: Number((Number(t.ca) || 0).toFixed(2)) })),
            couleurs: couleurs.map(c => ({ ...c, ca: Number((Number(c.ca) || 0).toFixed(2)) })),
            qualite: {
                parEtat: qualite,
                // Un taux global lu sur la période : c'est lui qui dit si
                // l'atelier tient sa qualité, modèle par modèle ensuite.
                tauxDefaut: (() => {
                    const total = qualite.reduce((a, q) => a + (Number(q.pieces) || 0), 0);
                    const mauvais = qualite.filter(q => q.qualite !== 'ACCEPTED')
                        .reduce((a, q) => a + (Number(q.pieces) || 0), 0);
                    return total > 0 ? Number(((mauvais / total) * 100).toFixed(1)) : 0;
                })(),
                parModele: defautsParModele.map(d => ({
                    modelId: d.modelId,
                    nom: d.nom || d.modelId,
                    ok: Number(d.ok) || 0,
                    defauts: Number(d.defauts) || 0,
                    taux: Number((((Number(d.defauts) || 0) / Math.max(1, (Number(d.ok) || 0) + (Number(d.defauts) || 0))) * 100).toFixed(1)),
                })),
            },
            modeles,
            clients: clientsClasses,
        });
    } catch (error) {
        console.error('Ventes dashboard error:', error);
        res.status(500).json({ message: 'Error building sales dashboard' });
    }
};

/**
 * Le detail de l'encours : la tuile dit 62 049 MAD, elle ne dit pas QUI doit,
 * DEPUIS QUAND, ni sur quelle facture. Cette route repond a ces trois-la, car
 * c'est ce qu'il faut avoir sous les yeux pour decrocher le telephone.
 *
 * Une facture n'est ici que si elle est de VENTE, non annulee, et qu'il reste
 * quelque chose a payer : un encours ne se lit pas au milieu des factures
 * soldees.
 */
export const getVentesEncours = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const lignes = db.prepare(`
            SELECT f.id, f.numero, f.date_facture, f.date_echeance,
                   f.total_ttc, COALESCE(f.montant_paye, 0) AS montant_paye,
                   f.statut, f.source_id AS client_id, f.lignes AS lignes_json,
                   COALESCE(c.nom, f.tiers_nom) AS client_nom,
                   c.tel AS client_tel, c.ville AS client_ville, c.type AS client_type,
                   (SELECT MAX(p.date_paiement) FROM paiements p
                     WHERE p.facture_id = f.id AND p.owner_id = f.owner_id) AS dernier_paiement
            FROM factures f
            LEFT JOIN st_clients c ON c.id = f.source_id AND c.owner_id = f.owner_id
            WHERE f.owner_id = ?
              AND f.type = 'VENTE'
              AND COALESCE(f.statut, '') != 'ANNULEE'
              AND f.total_ttc - COALESCE(f.montant_paye, 0) > 0.009
            ORDER BY COALESCE(f.date_echeance, f.date_facture) ASC
        `).all(companyId) as any[];

        const articles = articlesDesFactures(companyId, lignes.map(l => ({ id: String(l.id), lignesJson: l.lignes_json })));

        const jour = 86400000;
        const aujourdhui = jourISO(new Date());

        const factures = lignes.map(l => {
            const reste = Number((Number(l.total_ttc) - Number(l.montant_paye)).toFixed(2));
            const echeance = l.date_echeance || null;
            // Sans echeance, une facture n'est jamais "en retard" : on ne peut pas
            // reclamer un delai qu'on n'a jamais fixe.
            const retardJours = echeance && echeance < aujourdhui
                ? Math.round((new Date(`${aujourdhui}T00:00:00`).getTime() - new Date(`${echeance}T00:00:00`).getTime()) / jour)
                : 0;
            return {
                id: String(l.id),
                numero: String(l.numero || ''),
                clientId: l.client_id ? String(l.client_id) : null,
                clientNom: String(l.client_nom || '—'),
                clientTel: l.client_tel || null,
                clientVille: l.client_ville || null,
                clientType: l.client_type || null,
                dateFacture: l.date_facture || null,
                dateEcheance: echeance,
                dernierPaiement: l.dernier_paiement || null,
                totalTtc: Number(Number(l.total_ttc).toFixed(2)),
                montantPaye: Number(Number(l.montant_paye).toFixed(2)),
                reste,
                retardJours,
                // Partiellement paye : le distinguer compte, c'est un client qui
                // paye mais lentement, pas un client qui ne paye pas.
                entame: Number(l.montant_paye) > 0.009,
                // Ce qui est du se reconnait a la photo avant la reference.
                articles: articles.get(String(l.id)) || [],
            };
        });

        const parClient = new Map<string, any>();
        for (const f of factures) {
            const cle = f.clientId || `NOM:${f.clientNom}`;
            if (!parClient.has(cle)) {
                parClient.set(cle, {
                    cle,
                    clientId: f.clientId,
                    nom: f.clientNom,
                    tel: f.clientTel,
                    ville: f.clientVille,
                    type: f.clientType,
                    encours: 0,
                    enRetard: 0,
                    montantRetard: 0,
                    plusVieilleEcheance: null as string | null,
                    factures: [] as any[],
                });
            }
            const c = parClient.get(cle);
            c.encours += f.reste;
            if (f.retardJours > 0) { c.enRetard += 1; c.montantRetard += f.reste; }
            if (f.dateEcheance && (!c.plusVieilleEcheance || f.dateEcheance < c.plusVieilleEcheance)) {
                c.plusVieilleEcheance = f.dateEcheance;
            }
            c.factures.push(f);
        }

        const clients = [...parClient.values()]
            .map(c => ({
                ...c,
                encours: Number(c.encours.toFixed(2)),
                montantRetard: Number(c.montantRetard.toFixed(2)),
                retardMax: Math.max(0, ...c.factures.map((f: any) => f.retardJours)),
            }))
            // Le plus en retard d'abord : c'est l'ordre des appels a passer.
            .sort((a, b) => b.montantRetard - a.montantRetard || b.encours - a.encours);

        res.json({
            total: Number(factures.reduce((a, f) => a + f.reste, 0).toFixed(2)),
            totalRetard: Number(clients.reduce((a, c) => a + c.montantRetard, 0).toFixed(2)),
            nbFactures: factures.length,
            nbClients: clients.length,
            clients,
        });
    } catch (error) {
        console.error('Ventes encours error:', error);
        res.status(500).json({ message: 'Error building receivables detail' });
    }
};

/**
 * Ce qu'il y a DANS la facture : sans les articles, « FV-2026-0011 · 279 MAD »
 * ne se verifie pas au telephone. La photo du modele fait le reste — on
 * reconnait un vetement avant d'en lire la reference.
 *
 * Les lignes sont un JSON dans `factures.lignes` ; les images vivent dans
 * `models.data`. On ne charge les images qu'une fois, par modele.
 */
const articlesDesFactures = (companyId: number | string, factures: Array<{ id: string; lignesJson: string | null }>) => {
    const parFacture = new Map<string, any[]>();
    const modelIds = new Set<string>();

    for (const f of factures) {
        let brut: any[] = [];
        try { brut = JSON.parse(f.lignesJson || '[]'); } catch { brut = []; }
        const lignes = (Array.isArray(brut) ? brut : []).map((l: any) => {
            const modelId = l.modelId ? String(l.modelId) : null;
            if (modelId) modelIds.add(modelId);
            return {
                designation: String(l.designation || '—'),
                quantite: Number(l.quantite) || 0,
                prixUnitaire: Number(l.prix_unitaire) || 0,
                total: Number(l.total) || 0,
                modelId,
                image: null as string | null,
            };
        });
        parFacture.set(f.id, lignes);
    }

    if (modelIds.size > 0) {
        const trous = [...modelIds].map(() => '?').join(',');
        const images = db.prepare(`
            SELECT id, json_extract(data, '$.image') AS image
            FROM models WHERE user_id = ? AND id IN (${trous})
        `).all(companyId, ...modelIds) as any[];
        const parModele = new Map(images.map(m => [String(m.id), m.image || null]));
        for (const lignes of parFacture.values()) {
            for (const l of lignes) if (l.modelId) l.image = parModele.get(l.modelId) || null;
        }
    }

    return parFacture;
};

/**
 * L'historique complet d'un client : toutes ses factures, payees comprises,
 * et chaque reglement encaisse. Un encours ne se conteste pas sur le solde
 * seul — le client rappelle un versement, il faut pouvoir le retrouver.
 */
export const getClientHistorique = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const clientId = String(req.params.id || '');
    if (!clientId) return res.status(400).json({ message: 'Client manquant' });

    try {
        const factures = db.prepare(`
            SELECT f.id, f.numero, f.date_facture, f.date_echeance, f.statut,
                   f.total_ttc, COALESCE(f.montant_paye, 0) AS montant_paye, f.lignes
            FROM factures f
            WHERE f.owner_id = ? AND f.type = 'VENTE' AND f.source_id = ?
            ORDER BY f.date_facture DESC, f.numero DESC
        `).all(companyId, clientId) as any[];

        const articles = articlesDesFactures(companyId, factures.map(f => ({ id: String(f.id), lignesJson: f.lignes })));

        const ids = factures.map(f => String(f.id));
        const paiements = ids.length
            ? db.prepare(`
                SELECT id, facture_id, date_paiement, montant, mode, reference, notes
                FROM paiements
                WHERE owner_id = ? AND facture_id IN (${ids.map(() => '?').join(',')})
                ORDER BY date_paiement DESC
            `).all(companyId, ...ids) as any[]
            : [];

        const parFacture = new Map<string, any[]>();
        for (const p of paiements) {
            const cle = String(p.facture_id);
            if (!parFacture.has(cle)) parFacture.set(cle, []);
            parFacture.get(cle)!.push({
                id: String(p.id),
                factureId: cle,
                date: p.date_paiement,
                montant: Number(p.montant) || 0,
                mode: p.mode || null,
                reference: p.reference || null,
                notes: p.notes || null,
            });
        }

        res.json({
            clientId,
            // L en-tete de la societe : le releve s imprime depuis cet ecran.
            emetteur: emetteurDe(companyId),
            factures: factures.map(f => {
                const paye = Number(f.montant_paye) || 0;
                const ttc = Number(f.total_ttc) || 0;
                return {
                    id: String(f.id),
                    numero: String(f.numero || ''),
                    dateFacture: f.date_facture || null,
                    dateEcheance: f.date_echeance || null,
                    statut: f.statut || null,
                    totalTtc: Number(ttc.toFixed(2)),
                    montantPaye: Number(paye.toFixed(2)),
                    reste: Number(Math.max(0, ttc - paye).toFixed(2)),
                    articles: articles.get(String(f.id)) || [],
                    paiements: parFacture.get(String(f.id)) || [],
                };
            }),
            totalFacture: Number(factures.reduce((a, f) => a + (Number(f.total_ttc) || 0), 0).toFixed(2)),
            totalPaye: Number(factures.reduce((a, f) => a + (Number(f.montant_paye) || 0), 0).toFixed(2)),
        });
    } catch (error) {
        console.error('Client historique error:', error);
        res.status(500).json({ message: 'Error building client history' });
    }
};

/**
 * Le recu de versement : la contrepartie du carnet de credit.
 *
 * Il ne dit pas seulement « recu 5 000 » — ca, n'importe quel bout de papier
 * le dit. Il dit « sur une dette de 20 000, reste 15 000 », et c'est cette
 * phrase qui protege les deux parties : le vendeur contre l'oubli, le client
 * contre un encaissement compte deux fois.
 *
 * Le reste a payer est calcule ICI, a l'instant du tirage, jamais envoye par
 * l'ecran : un montant qui engage se lit dans la base.
 */
export const getRecuPaiement = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const paiementId = String(req.params.id || '');

    try {
        const p = db.prepare(`
            SELECT p.id, p.date_paiement, p.montant, p.mode, p.reference, p.notes,
                   f.id AS facture_id, f.numero, f.date_facture, f.total_ttc,
                   COALESCE(f.montant_paye, 0) AS montant_paye,
                   f.source_id AS client_id, f.tiers_nom, f.tiers_tel, f.tiers_adresse, f.tiers_ice
            FROM paiements p
            JOIN factures f ON f.id = p.facture_id AND f.owner_id = p.owner_id
            WHERE p.owner_id = ? AND p.id = ?
        `).get(companyId, paiementId) as any;

        if (!p) return res.status(404).json({ message: 'Reglement introuvable' });

        // La dette du CLIENT, pas seulement celle de la facture : c'est ce
        // chiffre-la qu'il conteste au telephone.
        const global = p.client_id
            ? db.prepare(`
                SELECT SUM(total_ttc) AS du, SUM(COALESCE(montant_paye, 0)) AS paye
                FROM factures
                WHERE owner_id = ? AND type = 'VENTE' AND COALESCE(statut, '') != 'ANNULEE' AND source_id = ?
            `).get(companyId, p.client_id) as any
            : null;

        const client = p.client_id
            ? db.prepare('SELECT nom, tel, ville, adresse, ice FROM st_clients WHERE id = ? AND owner_id = ?').get(p.client_id, companyId) as any
            : null;

        const totalTtc = Number(p.total_ttc) || 0;
        const paye = Number(p.montant_paye) || 0;
        const duGlobal = Number(global?.du) || 0;
        const payeGlobal = Number(global?.paye) || 0;

        res.json({
            emetteur: emetteurDe(companyId),
            paiement: {
                id: String(p.id),
                date: p.date_paiement,
                montant: Number(Number(p.montant).toFixed(2)),
                mode: p.mode || null,
                reference: p.reference || null,
            },
            facture: {
                id: String(p.facture_id),
                numero: String(p.numero || ''),
                date: p.date_facture,
                totalTtc: Number(totalTtc.toFixed(2)),
                montantPaye: Number(paye.toFixed(2)),
                reste: Number(Math.max(0, totalTtc - paye).toFixed(2)),
            },
            client: {
                nom: client?.nom || p.tiers_nom || '—',
                tel: client?.tel || p.tiers_tel || null,
                ville: client?.ville || null,
                adresse: client?.adresse || p.tiers_adresse || null,
                ice: client?.ice || p.tiers_ice || null,
            },
            compte: {
                du: Number(duGlobal.toFixed(2)),
                paye: Number(payeGlobal.toFixed(2)),
                reste: Number(Math.max(0, duGlobal - payeGlobal).toFixed(2)),
            },
        });
    } catch (error) {
        console.error('Recu paiement error:', error);
        res.status(500).json({ message: 'Error building receipt' });
    }
};
