import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from './db';

/**
 * ACHAT DE MARCHANDISE FINIE.
 *
 * L'atelier ne fabrique pas tout ce qu'il vend : il achète aussi des pièces
 * déjà finies pour les revendre. Jusqu'ici la seule porte d'entrée du stock
 * était une commande de sous-traitance, ce qui obligeait à inventer une fausse
 * commande — avec un « sous-traitant » qui est en réalité un fournisseur, des
 * jalons (proto, bon d'envoi, défauts) qui n'ont aucun sens pour de la
 * marchandise achetée, et des statistiques de production faussées.
 *
 * Deux objets, volontairement séparés de `models` :
 *   `st_articles` — l'article : nom, photo, grille tailles × couleurs. Pas de
 *                   gamme, pas de chrono, pas d'équilibrage : ce n'est pas un
 *                   modèle et il n'a rien à faire dans la bibliothèque, ni dans
 *                   l'ingénierie, la coupe ou le planning.
 *   `st_achats`   — l'achat : le fournisseur, la date, le prix payé à la pièce.
 *                   Le prix payé EST le prix de revient : il n'y a ni matière
 *                   ni main-d'œuvre à additionner.
 *
 * Les entrées en stock produites portent `source = 'ACHAT'` et rangent
 * l'identifiant de l'achat dans `order_id`. Le reste du programme (grille de
 * stock, sorties, étiquettes, factures) travaille sur cet identifiant sans
 * savoir d'où il vient, donc sans code en double.
 */

const parseJson = <T>(raw: unknown, fallback: T): T => {
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
};

const ARTICLE_SELECT = `
    SELECT id, owner_id, nom, reference, photo, colors_json, sizes_json, notes, variant_codes_json, created_at, updated_at
    FROM st_articles
`;

/** Sort un article dans la forme attendue côté client : les grilles décodées,
 *  pour que l'appelant n'ait pas à connaître le stockage JSON. */
const hydrateArticle = (row: any) => ({
    id: row.id,
    nom: row.nom,
    reference: row.reference ?? null,
    photo: row.photo ?? null,
    colors: parseJson<Array<{ id: string; name: string }>>(row.colors_json, []),
    sizes: parseJson<string[]>(row.sizes_json, []),
    notes: row.notes ?? null,
    // Carte code-barres -> (taille, couleur) : le lecteur la consulte pour
    // remplir la grille de sortie sans deviner d'après l'ordre de la fiche.
    variantCodes: parseJson<Record<string, { taille: string; couleur: string }>>(row.variant_codes_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
});

// ════════════════════════════════════════════════════════════════════════════
// ARTICLES
// ════════════════════════════════════════════════════════════════════════════

// GET /api/subcontract/articles
export const getArticles = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const rows = db.prepare(`${ARTICLE_SELECT} WHERE owner_id = ? ORDER BY nom COLLATE NOCASE`).all(companyId) as any[];
        res.json(rows.map(hydrateArticle));
    } catch (error) {
        console.error('Get articles error:', error);
        res.status(500).json({ message: 'Error fetching articles' });
    }
};

// POST /api/subcontract/articles
export const saveArticle = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const a = req.body || {};
    const nom = String(a.nom ?? '').trim();

    // Sans nom, l'article serait introuvable dans la liste du stock : c'est la
    // seule donnée réellement obligatoire, tout le reste peut venir après.
    if (!nom) return res.status(400).json({ message: "Le nom de l'article est obligatoire" });

    try {
        const id = a.id || randomUUID();
        // Les couleurs arrivent soit en objets {id, name}, soit en simples
        // libellés : on normalise ici pour que la grille du stock retrouve
        // toujours la même forme que celle d'un modèle.
        const colors = (Array.isArray(a.colors) ? a.colors : [])
            .map((c: any) => (typeof c === 'string' ? { id: c, name: c } : { id: String(c?.id ?? c?.name ?? ''), name: String(c?.name ?? c?.id ?? '') }))
            .filter((c: any) => c.name);
        const sizes = (Array.isArray(a.sizes) ? a.sizes : [])
            .map((t: any) => String(t ?? '').trim())
            .filter(Boolean);

        // `variantCodes` absent du corps = inchangé (le PATCH du lecteur ne
        // renvoie qu'un code à la fois) ; fourni = remplace intégralement.
        // Sans cette règle, sauvegarder l'article depuis l'écran d'achat
        // écraserait silencieusement la carte déjà apprise par le lecteur.
        let variantCodesJson: string | null = null;
        if (a.variantCodes !== undefined) {
            variantCodesJson = JSON.stringify(a.variantCodes || {});
        } else {
            const existing = db.prepare('SELECT variant_codes_json FROM st_articles WHERE id = ? AND owner_id = ?').get(id, companyId) as any;
            variantCodesJson = existing?.variant_codes_json ?? null;
        }

        db.prepare(`
            INSERT INTO st_articles (id, owner_id, nom, reference, photo, colors_json, sizes_json, notes, variant_codes_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                nom = excluded.nom,
                reference = excluded.reference,
                photo = excluded.photo,
                colors_json = excluded.colors_json,
                sizes_json = excluded.sizes_json,
                notes = excluded.notes,
                variant_codes_json = excluded.variant_codes_json,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            id,
            companyId,
            nom,
            String(a.reference ?? '').trim() || null,
            a.photo || null,
            JSON.stringify(colors),
            JSON.stringify(sizes),
            String(a.notes ?? '').trim() || null,
            variantCodesJson,
        );

        const saved = db.prepare(`${ARTICLE_SELECT} WHERE id = ? AND owner_id = ?`).get(id, companyId) as any;
        res.json(hydrateArticle(saved));
    } catch (error) {
        console.error('Save article error:', error);
        res.status(500).json({ message: 'Error saving article' });
    }
};

// DELETE /api/subcontract/articles/:id
export const deleteArticle = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const { id } = req.params;
    try {
        // Un article qui a bougé en stock ne se supprime pas : ses entrées et
        // ses sorties deviendraient orphelines et la valeur du stock passé
        // serait fausse. On le dit, au lieu de supprimer en silence.
        const mouvements = db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM st_stock_entries WHERE owner_id = ? AND modelId = ?) AS entrees,
                (SELECT COUNT(*) FROM st_stock_sorties WHERE owner_id = ? AND modelId = ?) AS sorties
        `).get(companyId, id, companyId, id) as any;

        if ((mouvements?.entrees || 0) > 0 || (mouvements?.sorties || 0) > 0) {
            return res.status(409).json({
                message: "Cet article a des mouvements de stock : supprimez-les d'abord, sinon l'historique deviendrait faux.",
                entrees: mouvements.entrees,
                sorties: mouvements.sorties,
            });
        }

        const info = db.prepare('DELETE FROM st_articles WHERE id = ? AND owner_id = ?').run(id, companyId);
        if (info.changes === 0) return res.status(404).json({ message: 'Article introuvable' });
        db.prepare('DELETE FROM st_achats WHERE article_id = ? AND owner_id = ?').run(id, companyId);
        res.json({ message: 'Article supprimé' });
    } catch (error) {
        console.error('Delete article error:', error);
        res.status(500).json({ message: 'Error deleting article' });
    }
};

// ════════════════════════════════════════════════════════════════════════════
// ACHATS
// ════════════════════════════════════════════════════════════════════════════

// GET /api/subcontract/achats
export const getAchats = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const rows = db.prepare(`
            SELECT a.id, a.article_id AS articleId, a.tiers_id AS tiersId,
                   (SELECT nom FROM st_clients c WHERE c.id = a.tiers_id) AS tiersNom,
                   a.date_achat AS dateAchat, a.prix_achat AS prixAchat,
                   a.facture_ref AS factureRef, COALESCE(a.montant_paye, 0) AS montantPaye,
                   a.note, a.created_at,
                   (SELECT COALESCE(SUM(quantite), 0) FROM st_stock_entries e
                     WHERE e.owner_id = a.owner_id AND e.order_id = a.id) AS quantite
            FROM st_achats a
            WHERE a.owner_id = ?
            ORDER BY COALESCE(a.date_achat, a.created_at) DESC
        `).all(companyId);
        res.json(rows);
    } catch (error) {
        console.error('Get achats error:', error);
        res.status(500).json({ message: 'Error fetching purchases' });
    }
};

// POST /api/subcontract/achats
export const createAchat = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const body = req.body || {};

    const articleId = String(body.articleId ?? '').trim();
    const prixAchat = Number(body.prixAchat);
    const lignes: any[] = Array.isArray(body.lignes) ? body.lignes : [];

    if (!articleId) return res.status(400).json({ message: "L'article est obligatoire" });

    // Un prix d'achat manquant rendrait la valeur du stock fausse dès la
    // première pièce : c'est le seul chiffre de coût que porte un article
    // acheté, on ne le devine pas.
    if (!Number.isFinite(prixAchat) || prixAchat < 0) {
        return res.status(400).json({ message: "Le prix d'achat doit être un montant positif" });
    }

    const normalisees = lignes
        .map(l => ({
            couleur: String(l?.couleur ?? '').trim() || null,
            taille: String(l?.taille ?? '').trim() || null,
            quantite: Math.floor(Number(l?.quantite) || 0),
        }))
        .filter(l => l.quantite > 0);

    if (normalisees.length === 0) {
        return res.status(400).json({ message: 'Aucune quantité saisie' });
    }

    try {
        const article = db.prepare('SELECT id FROM st_articles WHERE id = ? AND owner_id = ?').get(articleId, companyId);
        if (!article) return res.status(404).json({ message: 'Article introuvable' });

        // Le fournisseur doit appartenir à l'entreprise : sans ce contrôle on
        // rattacherait un achat au fournisseur d'un autre atelier.
        let tiersId: string | null = null;
        const demande = String(body.tiersId ?? '').trim();
        if (demande) {
            const tiers = db.prepare('SELECT id FROM st_clients WHERE id = ? AND owner_id = ?').get(demande, companyId);
            tiersId = tiers ? demande : null;
        }

        const totalQty = normalisees.reduce((a, l) => a + l.quantite, 0);
        const montantDu = totalQty * prixAchat;
        // Jamais plus payé que dû : un trop-payé est une faute de frappe, pas
        // une avance au fournisseur.
        const montantPaye = Math.min(Math.max(0, Number(body.montantPaye) || 0), montantDu);

        const achatId = randomUUID();
        const dateAchat = String(body.dateAchat ?? '').trim() || new Date().toISOString().split('T')[0];

        // L'achat et ses entrées en stock forment un tout : si une ligne échoue,
        // rien ne doit rester à moitié écrit.
        const run = db.transaction(() => {
            db.prepare(`
                INSERT INTO st_achats (id, owner_id, article_id, tiers_id, date_achat, prix_achat, facture_ref, montant_paye, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                achatId,
                companyId,
                articleId,
                tiersId,
                dateAchat,
                prixAchat,
                String(body.factureRef ?? '').trim() || null,
                montantPaye,
                String(body.note ?? '').trim() || null,
            );

            const batchId = randomUUID();
            const insert = db.prepare(`
                INSERT INTO st_stock_entries
                    (id, owner_id, order_id, modelId, couleur, taille, quantite, qualite, note, date_entree, batch_id, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'ACCEPTED', ?, ?, ?, 'ACHAT')
            `);
            for (const l of normalisees) {
                insert.run(
                    randomUUID(),
                    companyId,
                    achatId,
                    articleId,
                    l.couleur,
                    l.taille,
                    l.quantite,
                    String(body.note ?? '').trim() || null,
                    dateAchat,
                    batchId,
                );
            }
        });
        run();

        res.status(201).json({ message: 'Achat enregistré', id: achatId, quantite: totalQty, montantDu });
    } catch (error) {
        console.error('Create achat error:', error);
        res.status(500).json({ message: 'Error creating purchase' });
    }
};

// DELETE /api/subcontract/achats/:id
export const deleteAchat = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const { id } = req.params;
    try {
        const achat = db.prepare('SELECT id, article_id FROM st_achats WHERE id = ? AND owner_id = ?').get(id, companyId) as any;
        if (!achat) return res.status(404).json({ message: 'Achat introuvable' });

        // Les pièces de cet achat peuvent déjà être vendues. Les retirer du
        // stock rendrait le disponible négatif et la valeur du stock fausse :
        // on refuse et on dit pourquoi, plutôt que de laisser un trou.
        const vendues = db.prepare(`
            SELECT COALESCE(SUM(quantite), 0) AS q FROM st_stock_sorties
            WHERE owner_id = ? AND modelId = ?
        `).get(companyId, achat.article_id) as any;
        const entrees = db.prepare(`
            SELECT COALESCE(SUM(quantite), 0) AS q FROM st_stock_entries
            WHERE owner_id = ? AND modelId = ?
        `).get(companyId, achat.article_id) as any;
        const cet = db.prepare(`
            SELECT COALESCE(SUM(quantite), 0) AS q FROM st_stock_entries
            WHERE owner_id = ? AND order_id = ?
        `).get(companyId, id) as any;

        if ((entrees.q || 0) - (cet.q || 0) < (vendues.q || 0)) {
            return res.status(409).json({
                message: 'Une partie de cet achat est déjà vendue : le retirer rendrait le stock négatif.',
            });
        }

        const run = db.transaction(() => {
            db.prepare('DELETE FROM st_stock_entries WHERE owner_id = ? AND order_id = ?').run(companyId, id);
            db.prepare('DELETE FROM st_achats WHERE id = ? AND owner_id = ?').run(id, companyId);
        });
        run();

        res.json({ message: 'Achat supprimé' });
    } catch (error) {
        console.error('Delete achat error:', error);
        res.status(500).json({ message: 'Error deleting purchase' });
    }
};
