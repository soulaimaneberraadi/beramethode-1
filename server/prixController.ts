import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from './db';

/**
 * Tarification de VENTE des pièces finies.
 *
 * Le prix de vente vivait dans `model.ficheData.clientPrice` : UN seul prix pour
 * tous les acheteurs. C'est faux dans un atelier réel — le grossiste, la boutique
 * et le client historique n'achètent pas au même prix, et un gros volume se
 * négocie. Chaque tarif est donc une ligne autonome (`st_prix`), et le prix
 * proposé à la sortie est le résultat d'une RÉSOLUTION, pas d'un champ écrasé.
 *
 * ⚠️ Rien ici ne touche au coût de revient : uniquement le prix de vente.
 */

const TYPES = new Set(['GROS', 'DETAIL', 'BOUTIQUE']);

/** Date du jour au format ISO court, pour comparer aux `valid_from`. */
const today = () => new Date().toISOString().split('T')[0];

export const getPrix = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const { modelId, clientId } = req.query as { modelId?: string; clientId?: string };
    try {
        const where: string[] = ['owner_id = ?'];
        const params: any[] = [companyId];
        if (modelId) { where.push('modelId = ?'); params.push(modelId); }
        if (clientId) { where.push('client_id = ?'); params.push(clientId); }

        // Tri du plus spécifique au plus général puis par palier décroissant :
        // c'est l'ordre dans lequel l'utilisateur raisonne quand il relit sa
        // grille tarifaire.
        const rows = db.prepare(`
            SELECT * FROM st_prix
            WHERE ${where.join(' AND ')}
            ORDER BY (client_id IS NULL), (type_client IS NULL), qty_min DESC, created_at DESC
        `).all(...params);
        res.json(rows);
    } catch (error) {
        console.error('Get prix error:', error);
        res.status(500).json({ message: 'Error fetching prices' });
    }
};

export const savePrix = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const p = req.body || {};
    const modelId = String(p.modelId ?? '').trim();
    const prix = Number(p.prix);

    // Un tarif sans modèle ne s'applique à rien ; un tarif sans prix chiffrable
    // ferait proposer « 0 DH » à la vente, ce qui passerait inaperçu.
    if (!modelId) return res.status(400).json({ message: 'modelId est obligatoire' });
    if (!Number.isFinite(prix) || prix < 0) return res.status(400).json({ message: 'Prix invalide' });

    try {
        const id = p.id || randomUUID();
        // Un tarif visant un client précis n'a pas besoin de type : le type se
        // déduit de la fiche client, et le stocker en double le ferait diverger.
        const clientId = p.client_id || null;
        const typeClient = clientId ? null : (TYPES.has(p.type_client) ? p.type_client : null);

        db.prepare(`
            INSERT INTO st_prix (id, owner_id, modelId, client_id, type_client, qty_min, prix, devise, valid_from, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                modelId = excluded.modelId,
                client_id = excluded.client_id,
                type_client = excluded.type_client,
                qty_min = excluded.qty_min,
                prix = excluded.prix,
                devise = excluded.devise,
                valid_from = excluded.valid_from,
                note = excluded.note,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            id,
            companyId,
            modelId,
            clientId,
            typeClient,
            Math.max(0, Math.floor(Number(p.qty_min) || 0)),
            prix,
            p.devise || null,
            p.valid_from || null,
            p.note || null,
        );

        const saved = db.prepare('SELECT * FROM st_prix WHERE id = ? AND owner_id = ?').get(id, companyId);
        res.json(saved);
    } catch (error) {
        console.error('Save prix error:', error);
        res.status(500).json({ message: 'Error saving price' });
    }
};

export const deletePrix = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        // Les sorties déjà enregistrées gardent leur `prix_unitaire` recopié :
        // supprimer un tarif ne réécrit jamais les ventes passées.
        const info = db.prepare('DELETE FROM st_prix WHERE id = ? AND owner_id = ?').run(req.params.id, companyId);
        if (info.changes === 0) return res.status(404).json({ message: 'Tarif introuvable' });
        res.json({ message: 'Tarif supprimé' });
    } catch (error) {
        console.error('Delete prix error:', error);
        res.status(500).json({ message: 'Error deleting price' });
    }
};

/**
 * Cœur du moteur : quel prix proposer pour CE modèle, à CE client, pour CETTE
 * quantité ?
 *
 * Résolution stricte du plus spécifique au plus général :
 *   1. tarif négocié avec le client exact
 *   2. tarif du segment auquel appartient ce client (GROS / DETAIL / BOUTIQUE)
 *   3. tarif catalogue (ni client ni type)
 *   4. aucun tarif → `prix: null`
 *
 * `null` est une réponse VALIDE et attendue : inventer un prix par défaut (le
 * coût de revient, le dernier prix vu…) ferait vendre à un montant que personne
 * n'a décidé. L'UI doit demander une saisie manuelle dans ce cas.
 */
export const resolvePrix = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const { modelId, clientId } = req.query as { modelId?: string; clientId?: string };
    const qty = Math.max(0, Math.floor(Number((req.query as any).qty) || 0));

    if (!modelId) return res.status(400).json({ message: 'modelId est obligatoire' });

    try {
        // Le type ne vient JAMAIS de la requête : il se lit sur la fiche client,
        // sinon l'appelant pourrait s'attribuer un tarif GROS de son choix.
        let typeClient: string | null = null;
        if (clientId) {
            const client = db.prepare('SELECT type FROM st_clients WHERE id = ? AND owner_id = ?')
                .get(clientId, companyId) as any;
            typeClient = client?.type ?? null;
        }

        const now = today();
        // Un tarif daté dans le futur n'est pas encore en vigueur ; un tarif dont
        // le palier dépasse la quantité demandée ne s'applique pas non plus.
        // À portée égale, on retient le palier le plus élevé qui reste atteint
        // (c'est le tarif volume le plus avantageux effectivement mérité), puis
        // le plus récemment saisi.
        const pick = (clause: string, params: any[]) => db.prepare(`
            SELECT * FROM st_prix
            WHERE owner_id = ? AND modelId = ?
              AND ${clause}
              AND qty_min <= ?
              AND (valid_from IS NULL OR valid_from = '' OR valid_from <= ?)
            ORDER BY qty_min DESC, COALESCE(valid_from, '') DESC, updated_at DESC
            LIMIT 1
        `).get(companyId, modelId, ...params, qty, now) as any;

        let tarif: any = null;
        let source: 'CLIENT' | 'TYPE' | 'CATALOGUE' | 'NONE' = 'NONE';

        if (clientId) {
            tarif = pick('client_id = ?', [clientId]);
            if (tarif) source = 'CLIENT';
        }
        if (!tarif && typeClient) {
            tarif = pick('client_id IS NULL AND type_client = ?', [typeClient]);
            if (tarif) source = 'TYPE';
        }
        if (!tarif) {
            tarif = pick('client_id IS NULL AND type_client IS NULL', []);
            if (tarif) source = 'CATALOGUE';
        }

        res.json({
            prix: tarif ? Number(tarif.prix) : null,
            source,
            tarifId: tarif?.id ?? null,
            devise: tarif?.devise ?? null,
            qty_min: tarif ? Number(tarif.qty_min) : null,
            type_client: typeClient,
        });
    } catch (error) {
        console.error('Resolve prix error:', error);
        res.status(500).json({ message: 'Error resolving price' });
    }
};

/**
 * Intelligence prix : le « marché intérieur » de l'atelier.
 *
 * Tout est calculé depuis les sorties réellement enregistrées (`st_stock_sorties`),
 * jamais depuis les tarifs théoriques : ce qui aide à décider d'un prix, c'est
 * ce qui s'est VENDU, pas ce qui était affiché.
 *
 * ⚠️ Choix documenté : les lignes à `prix_unitaire = 0` (dons, échantillons,
 * régularisations, casse) sont EXCLUES de toutes les moyennes et des min/max —
 * sinon un seul échantillon offert écraserait la moyenne et ferait croire à un
 * effondrement du prix. Elles restent comptées dans `qteVendue`, parce que les
 * pièces ont bien quitté le stock.
 */
export const getPrixStats = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const { modelId } = req.query as { modelId?: string };

    if (!modelId) return res.status(400).json({ message: 'modelId est obligatoire' });

    try {
        // Agrégats sur les lignes valorisées uniquement.
        const agg = db.prepare(`
            SELECT
                MIN(prix_unitaire) AS prixMin,
                MAX(prix_unitaire) AS prixMax,
                SUM(prix_unitaire * quantite) AS caTotal,
                SUM(quantite) AS qteValorisee
            FROM st_stock_sorties
            WHERE owner_id = ? AND modelId = ? AND prix_unitaire > 0
        `).get(companyId, modelId) as any;

        // Quantité totale sortie, dons compris : c'est le mouvement de stock réel.
        const totalQte = db.prepare(
            'SELECT COALESCE(SUM(quantite), 0) AS q FROM st_stock_sorties WHERE owner_id = ? AND modelId = ?'
        ).get(companyId, modelId) as any;

        const dernier = db.prepare(`
            SELECT prix_unitaire, client_nom, client_id, date_sortie
            FROM st_stock_sorties
            WHERE owner_id = ? AND modelId = ? AND prix_unitaire > 0
            ORDER BY date_sortie DESC, created_at DESC
            LIMIT 1
        `).get(companyId, modelId) as any;

        const parClient = db.prepare(`
            SELECT
                client_id,
                COALESCE(client_nom, '—') AS client_nom,
                SUM(quantite) AS qte,
                SUM(prix_unitaire * quantite) AS caTotal,
                SUM(prix_unitaire * quantite) / NULLIF(SUM(quantite), 0) AS prixMoyen
            FROM st_stock_sorties
            WHERE owner_id = ? AND modelId = ? AND prix_unitaire > 0
            GROUP BY client_id, client_nom
            ORDER BY caTotal DESC
        `).all(companyId, modelId) as any[];

        // 30 dernières sorties valorisées, pour tracer la courbe du prix dans le
        // temps ; renvoyées en ordre chronologique, sens de lecture d'un graphe.
        const historique = (db.prepare(`
            SELECT date_sortie AS date, prix_unitaire, quantite, COALESCE(client_nom, '—') AS client_nom
            FROM st_stock_sorties
            WHERE owner_id = ? AND modelId = ? AND prix_unitaire > 0
            ORDER BY date_sortie DESC, created_at DESC
            LIMIT 30
        `).all(companyId, modelId) as any[]).reverse();

        const qteValorisee = Number(agg?.qteValorisee) || 0;
        const caTotal = Number(agg?.caTotal) || 0;

        res.json({
            // Moyenne PONDÉRÉE par les quantités : une vente de 500 pièces ne
            // doit pas peser autant qu'une vente de 2 pièces.
            prixMoyenPondere: qteValorisee > 0 ? caTotal / qteValorisee : null,
            prixMin: agg?.prixMin ?? null,
            prixMax: agg?.prixMax ?? null,
            dernierPrix: dernier ? Number(dernier.prix_unitaire) : null,
            dernierClient: dernier?.client_nom ?? null,
            dernierClientId: dernier?.client_id ?? null,
            derniereDate: dernier?.date_sortie ?? null,
            qteVendue: Number(totalQte?.q) || 0,
            qteValorisee,
            caTotal,
            parClient: parClient.map(r => ({
                client_id: r.client_id ?? null,
                client_nom: r.client_nom,
                qte: Number(r.qte) || 0,
                prixMoyen: r.prixMoyen === null ? null : Number(r.prixMoyen),
                caTotal: Number(r.caTotal) || 0,
            })),
            historique: historique.map(h => ({
                date: h.date ?? null,
                prix_unitaire: Number(h.prix_unitaire) || 0,
                quantite: Number(h.quantite) || 0,
                client_nom: h.client_nom,
            })),
        });
    } catch (error) {
        console.error('Get prix stats error:', error);
        res.status(500).json({ message: 'Error computing price statistics' });
    }
};
