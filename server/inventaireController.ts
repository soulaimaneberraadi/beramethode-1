import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from './db';
import { normaliserEmplacement, emplacementDe, supprimerEntreesSansCreuser } from './emplacementsController';

/**
 * INVENTAIRE (comptage physique du stock fini).
 *
 * Compare le THÉORIQUE (entrées ACCEPTED − sorties, à la maille couleur ×
 * taille — le même calcul que `stockMatrixByModel` côté écran) au COMPTE réel
 * saisi par l'opérateur, et écrit l'écart comme une entrée de stock à part.
 *
 * Ces lignes ne désignent NI une commande de sous-traitance NI un achat :
 * `order_id` pointe l'inventaire lui-même (`st_inventaires`), et
 * `source = 'INVENTAIRE'` le dit explicitement — au contrôle d'intégrité du
 * stock (qui doit les ignorer, pas les signaler comme orphelines) comme à
 * tout futur lecteur de la table.
 *
 * Ce que ces lignes NE font JAMAIS :
 *   - toucher `subcontract_orders` (pas d'appel à un équivalent de
 *     `syncOrderTotals` — ces commandes n'existent pas pour un inventaire) ;
 *   - apparaître comme une vente : ce sont des ENTRÉES (même négatives), la
 *     table des sorties n'est jamais écrite ici.
 */

const QUALITE = 'ACCEPTED';
const SOURCE = 'INVENTAIRE';

type Ligne = { modelId: string; couleur: string | null; taille: string | null; theorique: number; compte: number };

const parseLignes = (raw: unknown): Ligne[] => {
    const arr = Array.isArray(raw) ? raw : [];
    return arr
        .map((l: any) => ({
            modelId: String(l?.modelId || ''),
            couleur: l?.couleur || null,
            taille: l?.taille || null,
            theorique: Math.floor(Number(l?.theorique) || 0),
            compte: Math.floor(Number(l?.compte) || 0),
        }))
        // Seuls les VRAIS écarts s'écrivent : une case comptée identique au
        // théorique ne raconte rien, l'écrire polluerait `st_stock_entries`
        // de lignes à quantité 0 sans aucune information nouvelle.
        .filter(l => l.modelId && l.compte !== l.theorique);
};

// GET /api/subcontract/inventaire — historique des comptages.
export const getInventaires = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const rows = db.prepare(`
            SELECT id, date, note, nb_lignes AS nbLignes, ecart_pieces AS ecartPieces,
                   emplacement_id AS emplacementId,
                   created_by AS createdBy, created_at AS createdAt
            FROM st_inventaires
            WHERE owner_id = ?
            ORDER BY date DESC, created_at DESC
        `).all(companyId);
        res.json(rows);
    } catch (error) {
        console.error('Get inventaires error:', error);
        res.status(500).json({ message: 'Error fetching inventories' });
    }
};

// POST /api/subcontract/inventaire — enregistre un comptage (l'en-tête + une
// entrée de stock par case en écart), en une seule transaction : un comptage
// est un tout, la moitié des écarts écrits laisserait un stock faux sans que
// rien ne le signale.
export const createInventaire = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const userId = (req as any).user?.id ?? null;
    const body = req.body || {};

    const lignes = parseLignes(body.lignes);
    if (lignes.length === 0) {
        return res.status(400).json({ message: 'Aucun écart à enregistrer : le compte correspond au théorique sur toutes les cases.' });
    }

    // Lieu compté (vide = Dépôt principal, donc tout le stock historique). Le
    // « théorique » envoyé par l'écran est celui de CE lieu : l'écart écrit plus
    // bas s'ajoute donc au bon endroit, pas au total.
    const emplacementId = normaliserEmplacement(body.emplacement_id);
    if (emplacementId && !emplacementDe(companyId, emplacementId)) {
        return res.status(400).json({ message: 'Emplacement inconnu.' });
    }

    const date = String(body.date || '').trim() || new Date().toISOString().split('T')[0];
    const note = body.note ? String(body.note).trim().slice(0, 500) : null;
    const inventaireId = `inv-${randomUUID()}`;
    // Somme des écarts en valeur ABSOLUE : un +5 sur une taille et un -5 sur
    // une autre ne s'annulent pas, ce sont dix pièces qui ont vraiment bougé.
    const ecartPieces = lignes.reduce((a, l) => a + Math.abs(l.compte - l.theorique), 0);
    const noteEntree = note || `Inventaire du ${date}`;

    try {
        const insHeader = db.prepare(`
            INSERT INTO st_inventaires (id, owner_id, date, note, nb_lignes, ecart_pieces, created_by, emplacement_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insEntry = db.prepare(`
            INSERT INTO st_stock_entries (id, owner_id, order_id, modelId, couleur, taille, quantite, qualite, note, date_entree, batch_id, source, emplacement_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, '${QUALITE}', ?, ?, ?, '${SOURCE}', ?)
        `);
        db.transaction(() => {
            insHeader.run(inventaireId, companyId, date, note, lignes.length, ecartPieces, userId, emplacementId);
            for (const l of lignes) {
                insEntry.run(randomUUID(), companyId, inventaireId, l.modelId, l.couleur, l.taille, l.compte - l.theorique, noteEntree, date, inventaireId, emplacementId);
            }
        })();
        res.json({ id: inventaireId, nbLignes: lignes.length, ecartPieces });
    } catch (error) {
        console.error('Create inventaire error:', error);
        res.status(500).json({ message: 'Error creating inventory' });
    }
};

// DELETE /api/subcontract/inventaire/:id — annule un comptage : retire ses
// lignes de `st_stock_entries` et son en-tête. L'écran n'expose ce geste que
// sur le DERNIER inventaire (annuler un comptage ancien rendrait faux tous
// les comptages plus récents, qui sont partis de son résultat), mais la route
// elle-même reste générique — comme `deleteStockBatch` et `deleteAchat`.
export const deleteInventaire = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const id = req.params.id;
    try {
        const row = db.prepare('SELECT id FROM st_inventaires WHERE id = ? AND owner_id = ?').get(id, companyId);
        if (!row) return res.status(404).json({ message: 'Inventaire introuvable' });

        // Annuler un comptage qui avait AJOUTÉ des pièces à un lieu peut le
        // creuser en négatif si elles ont été transférées ou vendues depuis.
        const modelIds = (db.prepare("SELECT DISTINCT modelId FROM st_stock_entries WHERE owner_id = ? AND order_id = ? AND source = 'INVENTAIRE'")
            .all(companyId, id) as any[]).map(r => r.modelId);
        const refus = supprimerEntreesSansCreuser(companyId, modelIds, () => {
            db.prepare("DELETE FROM st_stock_entries WHERE owner_id = ? AND order_id = ? AND source = 'INVENTAIRE'").run(companyId, id);
            db.prepare('DELETE FROM st_inventaires WHERE id = ? AND owner_id = ?').run(id, companyId);
        });
        if (refus) return res.status(409).json({ message: refus });
        res.json({ message: 'Inventaire annulé' });
    } catch (error) {
        console.error('Delete inventaire error:', error);
        res.status(500).json({ message: 'Error deleting inventory' });
    }
};

// ─────────────────────────────────────────────────────────────────────────
// SEUILS DE STOCK BAS
// ─────────────────────────────────────────────────────────────────────────
// Un seuil à la maille MODÈLE (couleur et taille NULL) couvre toutes ses
// cases ; un seuil à la maille CELLULE prime sur lui pour cette case-là.

// GET /api/subcontract/seuils
export const getSeuils = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const rows = db.prepare(
            'SELECT id, modelId, couleur, taille, seuil FROM st_stock_seuils WHERE owner_id = ?'
        ).all(companyId);
        res.json(rows);
    } catch (error) {
        console.error('Get seuils error:', error);
        res.status(500).json({ message: 'Error fetching thresholds' });
    }
};

// POST /api/subcontract/seuils — upsert. Un seuil ≤ 0 ou non numérique
// RETIRE l'alerte au lieu de l'enregistrer à 0 : un seuil à 0 déclencherait
// une alerte permanente pour un modèle qui n'en a simplement pas.
export const saveSeuil = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const body = req.body || {};
    const modelId = String(body.modelId || '');
    const couleur = body.couleur || null;
    const taille = body.taille || null;
    const seuil = Math.floor(Number(body.seuil));

    if (!modelId) return res.status(400).json({ message: 'modelId est obligatoire' });

    try {
        const existing = db.prepare(
            "SELECT id FROM st_stock_seuils WHERE owner_id = ? AND modelId = ? AND COALESCE(couleur,'') = COALESCE(?,'') AND COALESCE(taille,'') = COALESCE(?,'')"
        ).get(companyId, modelId, couleur, taille) as any;

        if (!Number.isFinite(seuil) || seuil <= 0) {
            if (existing) db.prepare('DELETE FROM st_stock_seuils WHERE id = ?').run(existing.id);
            return res.json({ deleted: true, modelId, couleur, taille });
        }

        if (existing) {
            db.prepare('UPDATE st_stock_seuils SET seuil = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(seuil, existing.id);
            return res.json({ id: existing.id, modelId, couleur, taille, seuil });
        }

        const id = randomUUID();
        db.prepare('INSERT INTO st_stock_seuils (id, owner_id, modelId, couleur, taille, seuil) VALUES (?, ?, ?, ?, ?, ?)')
            .run(id, companyId, modelId, couleur, taille, seuil);
        res.json({ id, modelId, couleur, taille, seuil });
    } catch (error) {
        console.error('Save seuil error:', error);
        res.status(500).json({ message: 'Error saving threshold' });
    }
};
