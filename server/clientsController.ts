import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from './db';
import { verifierVenteSousCout } from './commercialPolicy';
import { generateNumero } from './facturationController';

/**
 * Clients de l'atelier (acheteurs des pièces finies).
 *
 * Ils étaient auparavant saisis en texte libre sur chaque facture de vente :
 * aucune réutilisation, aucun historique, et un même client orthographié de
 * plusieurs façons devenait plusieurs clients. Une fiche par client, rattachée
 * à l'entreprise (`owner_id` = companyId), réutilisée à chaque sortie de stock.
 */

const TYPES = new Set(['GROS', 'DETAIL', 'BOUTIQUE']);

/** Sens de la relation. Voir la migration `st_clients.role` : la même entreprise
 *  peut nous acheter ET nous vendre, et deux registres séparés obligeaient à
 *  saisir deux fois la même ICE. 'CLIENT' reste le défaut, donc aucune fiche
 *  existante ne change de sens. */
const ROLES = new Set(['CLIENT', 'FOURNISSEUR', 'LES_DEUX']);
const normRole = (v: unknown): string => {
    const r = String(v ?? '').trim().toUpperCase();
    return ROLES.has(r) ? r : 'CLIENT';
};

/** Canal de vente d'une sortie. NULL est accepté et vaut 'ATELIER' : toutes les
 *  sorties saisies avant l'arrivée de la boutique en ligne n'en portent aucun,
 *  et les requalifier après coup inventerait une information. */
const CANAUX = new Set(['ATELIER', 'MAGASIN', 'ONLINE']);

/** `doc_recto`/`doc_verso` restent en snake_case en base (comme le reste de la
 *  table) mais sortent en camelCase pour coller à `AtelierClient` côté client. */
const CLIENT_SELECT = 'SELECT id, owner_id, nom, type, COALESCE(role, \'CLIENT\') AS role, ice, rc, tel, email, adresse, ville, notes, photo, doc_recto AS docRecto, doc_verso AS docVerso, created_at, updated_at FROM st_clients';

export const getClients = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    // Filtre facultatif par rôle. `?role=FOURNISSEUR` rend les fiches qui nous
    // vendent, y compris celles qui font les deux — un tiers mixte doit
    // apparaître dans les deux listes, sinon on le croit absent et on en crée
    // un doublon.
    const roleFiltre = String((req.query as any).role ?? '').trim().toUpperCase();
    try {
        const filtre = ROLES.has(roleFiltre) && roleFiltre !== 'LES_DEUX'
            ? " AND (COALESCE(role, 'CLIENT') = ? OR COALESCE(role, 'CLIENT') = 'LES_DEUX')"
            : '';
        const params: any[] = filtre ? [companyId, roleFiltre] : [companyId];
        const rows = db
            .prepare(`${CLIENT_SELECT} WHERE owner_id = ?${filtre} ORDER BY nom COLLATE NOCASE`)
            .all(...params);
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
            INSERT INTO st_clients (id, owner_id, nom, type, role, ice, rc, tel, email, adresse, ville, notes, photo, doc_recto, doc_verso)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                nom = excluded.nom,
                type = excluded.type,
                role = excluded.role,
                ice = excluded.ice,
                rc = excluded.rc,
                tel = excluded.tel,
                email = excluded.email,
                adresse = excluded.adresse,
                ville = excluded.ville,
                notes = excluded.notes,
                photo = excluded.photo,
                doc_recto = excluded.doc_recto,
                doc_verso = excluded.doc_verso,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            id,
            companyId,
            nom,
            TYPES.has(c.type) ? c.type : 'DETAIL',
            normRole(c.role),
            c.ice || null,
            c.rc || null,
            c.tel || null,
            c.email || null,
            c.adresse || null,
            c.ville || null,
            c.notes || null,
            c.photo || null,
            c.docRecto || null,
            c.docVerso || null,
        );

        const saved = db.prepare(`${CLIENT_SELECT} WHERE id = ? AND owner_id = ?`).get(id, companyId);
        res.json(saved);
    } catch (error) {
        console.error('Save client error:', error);
        res.status(500).json({ message: 'Error saving client' });
    }
};

/**
 * Retrouve un client, ou crée sa fiche s'il est inconnu.
 *
 * Utilisé par la synchronisation boutique : une commande en ligne arrive avec un
 * nom et un email, pas avec un identifiant BERAMETHODE. Sans cette réconciliation,
 * chaque vente en ligne créerait une fiche de plus et le même acheteur se
 * retrouverait éclaté en dix clients — ses statistiques (CA, fidélité, tarifs
 * négociés) deviendraient illisibles.
 *
 * Réconciliation, du plus fiable au moins fiable :
 *   1. l'email — unique par nature, c'est la vraie clé d'un acheteur en ligne ;
 *   2. le nom, comparé sans tenir compte de la casse ;
 *   3. sinon, création.
 *
 * ⚠️ Isolation : toujours borné à `owner_id`.
 */
export const findOrCreateClient = (
    companyId: number | string,
    infos: { nom: string; email?: string | null; tel?: string | null; type?: string | null },
): { id: string; nom: string } => {
    const nom = String(infos.nom ?? '').trim() || 'Client';
    const email = String(infos.email ?? '').trim();

    if (email) {
        const parEmail = db.prepare('SELECT id, nom FROM st_clients WHERE owner_id = ? AND email = ? COLLATE NOCASE LIMIT 1')
            .get(companyId, email) as any;
        if (parEmail) return { id: String(parEmail.id), nom: String(parEmail.nom) };
    }

    const parNom = db.prepare('SELECT id, nom FROM st_clients WHERE owner_id = ? AND nom = ? COLLATE NOCASE LIMIT 1')
        .get(companyId, nom) as any;
    if (parNom) return { id: String(parNom.id), nom: String(parNom.nom) };

    const id = randomUUID();
    db.prepare('INSERT INTO st_clients (id, owner_id, nom, type, email) VALUES (?, ?, ?, ?, ?)')
        .run(id, companyId, nom, TYPES.has(String(infos.type)) ? String(infos.type) : 'DETAIL', email || null);
    return { id, nom };
};

export const deleteClient = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        // Les factures déjà émises gardent le nom recopié : supprimer une fiche
        // client ne doit jamais réécrire l'historique comptable.
        //
        // En revanche les TARIFS NÉGOCIÉS avec ce client (`st_prix.client_id`)
        // partent avec lui, dans la MÊME transaction : ils ne s'appliqueraient
        // plus à personne mais resteraient affichés dans la grille tarifaire,
        // où ils feraient croire à un accord commercial encore en vigueur. La
        // transaction évite l'état intermédiaire « client supprimé, tarifs
        // orphelins » si l'une des deux écritures échoue.
        let supprime = 0;
        let tarifs = 0;
        db.transaction(() => {
            supprime = db.prepare('DELETE FROM st_clients WHERE id = ? AND owner_id = ?').run(req.params.id, companyId).changes;
            if (supprime > 0) {
                tarifs = db.prepare('DELETE FROM st_prix WHERE owner_id = ? AND client_id = ?').run(companyId, req.params.id).changes;
            }
        })();
        if (supprime === 0) return res.status(404).json({ message: 'Client introuvable' });
        res.json({ message: 'Client supprimé', tarifs_supprimes: tarifs });
    } catch (error) {
        console.error('Delete client error:', error);
        res.status(500).json({ message: 'Error deleting client' });
    }
};

/**
 * Dossier complet d'un client : sa fiche, ce qu'il a acheté, et à quel prix.
 *
 * Un commercial qui reçoit un client au téléphone a besoin de trois choses en un
 * seul écran : combien il pèse (CA, volume), ce qu'il achète habituellement, et
 * quels prix ont été négociés avec lui. Éclatés sur trois écrans, ces chiffres
 * ne sont jamais regardés — d'où cet agrégat unique.
 */
export const getClientDossier = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const clientId = req.params.id;
    try {
        const client = db.prepare('SELECT * FROM st_clients WHERE id = ? AND owner_id = ?').get(clientId, companyId);
        if (!client) return res.status(404).json({ message: 'Client introuvable' });

        // Le nom du modèle vit dans le JSON de `models` : la jointure est LEFT,
        // un modèle supprimé ne doit pas faire disparaître ses ventes passées.
        const sorties = db.prepare(`
            SELECT s.*,
                   COALESCE(json_extract(m.data, '$.meta_data.nom_modele'), json_extract(m.data, '$.filename')) AS model_nom,
                   f.statut AS facture_statut, f.date_echeance AS facture_echeance,
                   f.montant_paye AS facture_montant_paye, f.total_ttc AS facture_total_ttc
            FROM st_stock_sorties s
            LEFT JOIN models m ON m.id = s.modelId AND m.user_id = s.owner_id
            LEFT JOIN factures f ON f.id = s.facture_id AND f.owner_id = s.owner_id
            WHERE s.owner_id = ? AND s.client_id = ?
            ORDER BY s.date_sortie DESC, s.created_at DESC
        `).all(companyId, clientId) as any[];

        // Les lignes à prix 0 (échantillons, gestes commerciaux) comptent en
        // pièces mais pas en chiffre d'affaires : mélanger les deux ferait
        // croire à une remise généralisée.
        const caTotal = sorties.reduce((a, s) => a + (Number(s.prix_unitaire) || 0) * (Number(s.quantite) || 0), 0);
        const piecesAchetees = sorties.reduce((a, s) => a + (Number(s.quantite) || 0), 0);
        const dernierAchat = sorties[0]?.date_sortie ?? null;

        const parModeleMap = new Map<string, { modelId: string; model_nom: string | null; qte: number; caTotal: number }>();
        for (const s of sorties) {
            const key = String(s.modelId ?? '');
            const cur = parModeleMap.get(key) || { modelId: key, model_nom: s.model_nom ?? null, qte: 0, caTotal: 0 };
            cur.qte += Number(s.quantite) || 0;
            cur.caTotal += (Number(s.prix_unitaire) || 0) * (Number(s.quantite) || 0);
            parModeleMap.set(key, cur);
        }
        const parModele = Array.from(parModeleMap.values()).sort((a, b) => b.caTotal - a.caTotal);

        // Tarifs négociés : ceux qui visent nommément ce client, plus ceux de son
        // segment — les deux s'appliquent à lui lors d'une vente.
        const tarifs = db.prepare(`
            SELECT * FROM st_prix
            WHERE owner_id = ? AND (client_id = ? OR (client_id IS NULL AND type_client = ?))
            ORDER BY (client_id IS NULL), qty_min DESC, created_at DESC
        `).all(companyId, clientId, (client as any).type ?? null);

        // ── Volet FOURNISSEUR ────────────────────────────────────────────────
        // Le même tiers peut nous vendre. Ce qu'il nous facture arrive de deux
        // endroits qu'il faut additionner, sinon le total ment :
        //   1. les frais additionnels de commande qui lui sont rattachés
        //      (transport, patronage, repassage...) ;
        //   2. les factures d'ACHAT enregistrées à son nom.
        // « Reste dû » = facturé − payé, jamais négatif : un trop-payé est une
        // erreur de saisie, pas une créance sur le fournisseur.
        const frais = db.prepare(`
            SELECT e.id, e.order_id AS orderId, e.label, e.amount,
                   COALESCE(e.montant_paye, 0) AS montantPaye,
                   e.facture_ref AS factureRef, e.date_facture AS dateFacture,
                   e.created_at,
                   o.modelName, o.subcontractorName
            FROM subcontract_expenses e
            JOIN subcontract_orders o ON o.id = e.order_id
            WHERE o.owner_id = ? AND e.tiers_id = ?
            ORDER BY COALESCE(e.date_facture, e.created_at) DESC
        `).all(companyId, clientId) as any[];

        // Les factures d'achat sont rapprochées par le NOM du tiers : elles ont
        // été saisies avant l'existence du registre et ne portent pas son
        // identifiant. Comparaison insensible à la casse, comme partout ailleurs.
        const facturesAchat = db.prepare(`
            SELECT id, numero, date_facture, date_echeance, total_ttc, montant_paye, statut
            FROM factures
            WHERE owner_id = ? AND type = 'ACHAT' AND LOWER(TRIM(tiers_nom)) = LOWER(TRIM(?))
            ORDER BY date_facture DESC
        `).all(companyId, (client as any).nom ?? '') as any[];

        const fraisFacture = frais.reduce((a, f) => a + (Number(f.amount) || 0), 0);
        const fraisPaye = frais.reduce((a, f) => a + (Number(f.montantPaye) || 0), 0);
        const achatsFacture = facturesAchat.reduce((a, f) => a + (Number(f.total_ttc) || 0), 0);
        const achatsPaye = facturesAchat.reduce((a, f) => a + (Number(f.montant_paye) || 0), 0);

        const fournisseur = {
            frais,
            facturesAchat,
            totalFacture: fraisFacture + achatsFacture,
            totalPaye: fraisPaye + achatsPaye,
            resteDu: Math.max(0, (fraisFacture + achatsFacture) - (fraisPaye + achatsPaye)),
            derniereFacture: facturesAchat[0]?.date_facture ?? frais[0]?.dateFacture ?? null,
        };

        res.json({ client, sorties, caTotal, piecesAchetees, dernierAchat, parModele, tarifs, fournisseur });
    } catch (error) {
        console.error('Get client dossier error:', error);
        res.status(500).json({ message: 'Error fetching client dossier' });
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
    // Jointure vers la facture qui couvre cette sortie : sans elle, la fiche
    // client ne pourrait jamais répondre « ce client a-t-il payé ? ».
    const select = `
        SELECT s.*, f.statut AS facture_statut, f.date_echeance AS facture_echeance,
               f.montant_paye AS facture_montant_paye, f.total_ttc AS facture_total_ttc
        FROM st_stock_sorties s
        LEFT JOIN factures f ON f.id = s.facture_id AND f.owner_id = s.owner_id
        WHERE s.owner_id = ?`;
    try {
        const rows = modelId
            ? db.prepare(`${select} AND s.modelId = ? ORDER BY s.date_sortie DESC, s.created_at DESC`).all(companyId, modelId)
            : db.prepare(`${select} ORDER BY s.date_sortie DESC, s.created_at DESC`).all(companyId);
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

    // Garde-fou « vente à perte », rejoué ici parce que celui de l'écran est
    // contournable par un appel direct à cette route. Même formule de coût et
    // mêmes réglages que l'interface ; silencieux si le coût est incalculable.
    const verdict = verifierVenteSousCout(companyId, modelId, lignes, body.note);
    if (verdict.refuse) {
        return res.status(400).json({ message: verdict.message, code: 'VENTE_SOUS_COUT', policy: verdict.policy });
    }

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
        // Le canal est saisi ici uniquement pour les ventes humaines (comptoir,
        // magasin). Les ventes 'ONLINE' ne passent JAMAIS par cette route : elles
        // sont écrites par le worker de synchronisation, seul détenteur de la
        // référence de commande qui garantit l'absence de doublon.
        const canalDemande = String(body.canal ?? '').trim().toUpperCase();
        const canal = canalDemande === 'MAGASIN' ? 'MAGASIN' : (CANAUX.has(canalDemande) && canalDemande !== 'ONLINE' ? canalDemande : null);

        const insert = db.prepare(`
            INSERT INTO st_stock_sorties (id, owner_id, modelId, client_id, client_nom, couleur, taille, quantite, prix_unitaire, batch_id, facture_id, note, date_sortie, canal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        // Transaction : une sortie est un tout. La moitié des cellules écrites
        // laisserait un stock faux sans que rien ne le signale.
        db.transaction(() => {
            for (const l of lignes) {
                insert.run(randomUUID(), companyId, modelId, body.client_id || null, body.client_nom || null,
                    l.couleur, l.taille, l.quantite, l.prix_unitaire, batchId, body.facture_id || null, body.note || null, date, canal);
            }
        })();

        res.json({ batch_id: batchId, count: lignes.length });
    } catch (error) {
        console.error('Create stock sortie error:', error);
        res.status(500).json({ message: 'Error creating stock exit' });
    }
};

/**
 * Commande « normale » : plusieurs modèles sur UNE seule commande de vente,
 * un seul client, une seule transaction.
 *
 * Chaque modèle porte SA grille couleur × taille (comme la sortie classique) :
 * le contrôle de stock se fait donc cellule par cellule, et un batch par
 * modèle garde le geste « un modèle = une sortie » cohérent avec la
 * suppression par lot.
 */
export const createCommandeNormale = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const body = req.body || {};

    const modelLignes = (Array.isArray(body.lignes) ? body.lignes : [])
        .map((ml: any) => ({
            modelId: String(ml.modelId || ''),
            prix_unitaire: Number(ml.prix_unitaire) || 0,
            cells: (Array.isArray(ml.cells) ? ml.cells : [])
                .map((c: any) => ({
                    couleur: c.couleur || null,
                    taille: c.taille || null,
                    quantite: Math.floor(Number(c.quantite) || 0),
                }))
                .filter(c => c.quantite > 0),
        }))
        .filter(ml => ml.modelId && ml.cells.length > 0);

    if (modelLignes.length === 0) return res.status(400).json({ message: 'Aucune quantité saisie' });
    if (!body.client_id && !body.client_nom) return res.status(400).json({ message: 'Choisissez un client' });

    // Garde-fou « vente à perte » rejoué modèle par modèle — même règle que la
    // sortie classique, contournable sinon par un appel direct à cette route.
    for (const ml of modelLignes) {
        const verdict = verifierVenteSousCout(companyId, ml.modelId, [{ prix_unitaire: ml.prix_unitaire }], body.note);
        if (verdict.refuse) {
            return res.status(400).json({ message: verdict.message, code: 'VENTE_SOUS_COUT', policy: verdict.policy });
        }
    }

    try {
        // Stock disponible, cellule par cellule (modèle × couleur × taille) : on
        // refuse de sortir ce qui n'existe pas, sinon le stock passerait en
        // négatif sans que rien ne le signale.
        const entrees = db.prepare(
            "SELECT modelId, couleur, taille, COALESCE(SUM(quantite),0) AS q FROM st_stock_entries WHERE owner_id = ? AND qualite = 'ACCEPTED' GROUP BY modelId, couleur, taille"
        ).all(companyId) as any[];
        const sorties = db.prepare(
            'SELECT modelId, couleur, taille, COALESCE(SUM(quantite),0) AS q FROM st_stock_sorties WHERE owner_id = ? GROUP BY modelId, couleur, taille'
        ).all(companyId) as any[];
        const key = (m: any, c: any, t: any) => `${String(m ?? '')}|${String(c ?? '')}|${String(t ?? '')}`;
        const dispo = new Map<string, number>();
        entrees.forEach(r => dispo.set(key(r.modelId, r.couleur, r.taille), (dispo.get(key(r.modelId, r.couleur, r.taille)) || 0) + Number(r.q)));
        sorties.forEach(r => dispo.set(key(r.modelId, r.couleur, r.taille), (dispo.get(key(r.modelId, r.couleur, r.taille)) || 0) - Number(r.q)));

        for (const ml of modelLignes) {
            const insuffisant = ml.cells.find(c => (dispo.get(key(ml.modelId, c.couleur, c.taille)) || 0) < c.quantite);
            if (insuffisant) {
                return res.status(400).json({
                    message: `Stock insuffisant pour ${insuffisant.couleur || '—'} / ${insuffisant.taille || '—'} : ${dispo.get(key(ml.modelId, insuffisant.couleur, insuffisant.taille)) || 0} disponible(s), ${insuffisant.quantite} demandée(s)`,
                });
            }
        }

        const date = body.date_sortie || new Date().toISOString().split('T')[0];
        const insert = db.prepare(`
            INSERT INTO st_stock_sorties (id, owner_id, modelId, client_id, client_nom, couleur, taille, quantite, prix_unitaire, batch_id, facture_id, note, date_sortie, canal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        // Transaction : un tout — la moitié des lignes écrites laisserait un
        // stock faux sans que rien ne le signale.
        const count = db.transaction(() => {
            let n = 0;
            for (const ml of modelLignes) {
                const batchId = randomUUID();
                for (const c of ml.cells) {
                    insert.run(randomUUID(), companyId, ml.modelId, body.client_id || null, body.client_nom || null,
                        c.couleur, c.taille, c.quantite, ml.prix_unitaire, batchId, body.facture_id || null, body.note || null, date, null);
                    n += 1;
                }
            }
            return n;
        })();

        res.json({ count, models: modelLignes.length });
    } catch (error) {
        console.error('Create commande normale error:', error);
        res.status(500).json({ message: 'Error creating order' });
    }
};

/**
 * Facture de VENTE construite à partir de sorties de stock déjà réalisées.
 *
 * Le module savait sortir des pièces (st_stock_sorties) et savait imprimer une
 * facture de vente, mais les deux ne se parlaient jamais : une facture pouvait
 * être émise sans qu'aucune sortie n'y soit rattachée, ce qui rendait le statut
 * de paiement d'une vente invérifiable depuis la fiche client. Ici, la facture
 * naît DES sorties choisies, et ces sorties portent ensuite son id — c'est ce
 * lien qui permet à la fiche client de savoir « payé / impayé » ligne par ligne.
 */
export const createClientInvoice = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const body = req.body || {};
    const sortieIds: string[] = Array.isArray(body.sortieIds) ? body.sortieIds.map(String) : [];

    if (sortieIds.length === 0) return res.status(400).json({ message: 'Aucune sortie sélectionnée' });

    try {
        const client = db.prepare('SELECT * FROM st_clients WHERE id = ? AND owner_id = ?').get(body.clientId, companyId) as any;

        const placeholders = sortieIds.map(() => '?').join(',');
        // Seules les sorties de CE client, encore NON facturées, entrent dans le
        // calcul : une sortie déjà facturée ne doit jamais se retrouver sur deux
        // factures, et une sortie d'un autre client ne doit jamais s'y glisser.
        const sorties = db.prepare(`
            SELECT s.*, COALESCE(json_extract(m.data, '$.meta_data.nom_modele'), json_extract(m.data, '$.filename')) AS model_nom
            FROM st_stock_sorties s
            LEFT JOIN models m ON m.id = s.modelId AND m.user_id = s.owner_id
            WHERE s.owner_id = ? AND s.id IN (${placeholders}) AND s.facture_id IS NULL
        `).all(companyId, ...sortieIds) as any[];

        if (sorties.length === 0) return res.status(400).json({ message: 'Ces sorties sont introuvables ou déjà facturées' });

        const mismatched = body.clientId && sorties.some(s => s.client_id && String(s.client_id) !== String(body.clientId));
        if (mismatched) return res.status(400).json({ message: "Une sortie n'appartient pas à ce client" });

        const totalBrut = sorties.reduce((a, s) => a + (Number(s.quantite) || 0) * (Number(s.prix_unitaire) || 0), 0);
        // La remise arrive déjà calculée en montant (le client choisit % ou
        // montant fixe côté écran) : le serveur ne fait que la borner, pour
        // qu'un montant fantaisiste ne puisse jamais rendre le HT négatif.
        const discount = Math.max(0, Math.min(totalBrut, Number(body.discount) || 0));
        const totalHt = totalBrut - discount;
        const exonere = body.exonere === true;
        const tauxTva = exonere ? 0 : (Number(body.taux_tva) || 0);
        const totalTva = totalHt * (tauxTva / 100);
        const totalTtc = totalHt + totalTva;
        const statut = ['BROUILLON', 'ENVOYEE', 'PAYEE'].includes(body.statut) ? body.statut : 'ENVOYEE';
        // L'acompte est un RÈGLEMENT déjà perçu : il alimente montant_paye et
        // laisse le TTC intact, sinon la facture serait sous-évaluée. Un statut
        // "Payée" vaut réglage total, quel que soit l'acompte saisi.
        const montantPaye = statut === 'PAYEE' ? totalTtc : Math.max(0, Math.min(totalTtc, Number(body.montant_paye) || 0));

        const lignes: any[] = sorties.map(s => ({
            designation: `${s.model_nom || s.modelId || '—'}${[s.couleur, s.taille].filter(Boolean).length ? ' — ' + [s.couleur, s.taille].filter(Boolean).join(' / ') : ''}`,
            quantite: Number(s.quantite) || 0,
            prix_unitaire: Number(s.prix_unitaire) || 0,
            total: (Number(s.quantite) || 0) * (Number(s.prix_unitaire) || 0),
            modelId: s.modelId,
        }));
        if (discount > 0) {
            lignes.push({ designation: 'Remise commerciale', quantite: 1, prix_unitaire: -discount, total: -discount });
        }

        const id = 'FAC_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const numero = generateNumero('VENTE', companyId);
        const dateFacture = /^\d{4}-\d{2}-\d{2}$/.test(body.date_facture) ? body.date_facture : new Date().toISOString().split('T')[0];

        db.transaction(() => {
            db.prepare(`
                INSERT INTO factures (
                    id, owner_id, numero, type, tiers_nom, tiers_ice, tiers_rc, tiers_adresse, tiers_tel, tiers_email,
                    date_facture, date_echeance, total_ht, taux_tva, total_tva, total_ttc, montant_paye,
                    source_module, source_id, statut, notes, lignes
                ) VALUES (?, ?, ?, 'VENTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                id, companyId, numero,
                client?.nom || sorties[0]?.client_nom || '—',
                client?.ice || null, client?.rc || null, client?.adresse || null, client?.tel || null, client?.email || null,
                dateFacture, body.date_echeance || null,
                totalHt, tauxTva, totalTva, totalTtc, montantPaye,
                'SOUSTRAITANCE_VENTE', body.clientId || null,
                statut, body.notes || null, JSON.stringify(lignes),
            );

            const setFacture = db.prepare('UPDATE st_stock_sorties SET facture_id = ? WHERE id = ? AND owner_id = ? AND facture_id IS NULL');
            for (const s of sorties) setFacture.run(id, s.id, companyId);
        })();

        const facture = db.prepare('SELECT * FROM factures WHERE id = ? AND owner_id = ?').get(id, companyId);
        res.json({ ...(facture as any), lignes: JSON.parse((facture as any).lignes || '[]'), sortiesFacturees: sorties.length });
    } catch (error) {
        console.error('Create client invoice error:', error);
        res.status(500).json({ message: 'Error creating invoice' });
    }
};

/**
 * Annule une facture de VENTE émise depuis la fiche client.
 *
 * Une facture annulée ne doit plus bloquer ses sorties : elles redeviennent
 * facturables, comme si elles n'avaient jamais été prises dans une facture.
 * La facture elle-même n'est pas supprimée (elle garde son numéro pour la
 * traçabilité comptable) — seul son statut passe à ANNULEE.
 */
export const cancelClientInvoice = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const { id } = req.params;
    try {
        const facture = db.prepare("SELECT id FROM factures WHERE id = ? AND owner_id = ? AND source_module = 'SOUSTRAITANCE_VENTE'").get(id, companyId);
        if (!facture) return res.status(404).json({ message: 'Facture introuvable' });

        db.transaction(() => {
            db.prepare("UPDATE factures SET statut = 'ANNULEE', montant_paye = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").run(id, companyId);
            // Les sorties reviennent au pool « non facturé » : c'est ce qui permet
            // de les reprendre dans une nouvelle facture.
            db.prepare('UPDATE st_stock_sorties SET facture_id = NULL WHERE facture_id = ? AND owner_id = ?').run(id, companyId);
        })();

        res.json({ message: 'Facture annulée' });
    } catch (error) {
        console.error('Cancel client invoice error:', error);
        res.status(500).json({ message: 'Error cancelling invoice' });
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
