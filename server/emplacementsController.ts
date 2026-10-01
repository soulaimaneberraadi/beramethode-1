import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from './db';

/**
 * EMPLACEMENTS DE STOCK (dépôts, boutiques) et TRANSFERTS entre eux.
 *
 * Règle de fond : le « Dépôt principal » n'est PAS un emplacement en base, c'est
 * l'ABSENCE d'emplacement (`emplacement_id IS NULL` sur les mouvements). Toutes
 * les lignes qui existaient avant cette fonction lui appartiennent donc déjà,
 * sans migration de données — et une entreprise qui ne crée jamais
 * d'emplacement ne voit aucune différence : tous ses mouvements restent à NULL.
 *
 * Un transfert ne crée ni ne détruit une pièce. Il écrit, pour chaque case
 * couleur × taille, DEUX entrées de stock (source = 'TRANSFERT') :
 *   −q à l'emplacement de départ, +q à l'emplacement d'arrivée.
 * Ce sont des ENTRÉES (une négative, une positive), jamais des sorties : le
 * stock total est inchangé et les statistiques de vente, qui ne lisent que
 * `st_stock_sorties`, ne bougent pas.
 */

const TYPES = new Set(['DEPOT', 'BOUTIQUE']);
const SOURCE_TRANSFERT = 'TRANSFERT';
const NOM_PRINCIPAL = 'Dépôt principal';

/** Identifiant d'emplacement reçu du client : vide = Dépôt principal (NULL). */
export const normaliserEmplacement = (raw: unknown): string | null => {
    const s = String(raw ?? '').trim();
    return s || null;
};

type EmplacementRow = { id: string; nom: string; type: string; actif: number };

/** L'emplacement, seulement s'il appartient à cette entreprise. */
export const emplacementDe = (companyId: number | string, id: string): EmplacementRow | undefined =>
    db.prepare('SELECT id, nom, type, actif FROM st_emplacements WHERE id = ? AND owner_id = ?').get(id, companyId) as EmplacementRow | undefined;

/** Vrai si l'entreprise a créé au moins un emplacement (actif ou non). */
export const aDesEmplacements = (companyId: number | string): boolean =>
    !!db.prepare('SELECT 1 FROM st_emplacements WHERE owner_id = ? LIMIT 1').get(companyId);

/** Noms des boutiques en ligne servies par cet emplacement (vide = aucune).
 *  Une boutique en ligne publie le stock de SON lieu : désactiver ou supprimer ce
 *  lieu la ferait publier un stock qui n'existe plus. */
export const boutiquesServies = (companyId: number | string, emplacementId: string): string[] => {
    try {
        return (db.prepare("SELECT COALESCE(NULLIF(TRIM(nom), ''), plateforme) AS nom FROM st_store_config WHERE owner_id = ? AND emplacement_id = ?")
            .all(companyId, emplacementId) as Array<{ nom: string }>).map(r => String(r.nom));
    } catch {
        return []; // table boutique absente (base très ancienne) : aucun lien possible
    }
};

/** Vrai si l'entreprise a déjà transféré du stock : c'est la seule situation où
 *  le stock d'un emplacement peut s'écarter du stock total. */
export const aDesTransferts = (companyId: number | string): boolean =>
    !!db.prepare('SELECT 1 FROM st_transferts WHERE owner_id = ? LIMIT 1').get(companyId);

/** Nom lisible d'un emplacement (NULL = Dépôt principal). */
export const nomEmplacement = (companyId: number | string, id: string | null): string => {
    if (!id) return NOM_PRINCIPAL;
    return emplacementDe(companyId, id)?.nom ?? id;
};

/** Clé d'une case, identique à celle de l'écran : `modèle|couleur|taille`. */
export const cleCellule = (modelId: unknown, couleur: unknown, taille: unknown): string =>
    `${String(modelId ?? '')}|${String(couleur ?? '')}|${String(taille ?? '')}`;

/** Nom d'un modèle ou d'un article acheté, pour des messages lisibles. */
export const nomModele = (companyId: number | string, modelId: string): string => {
    try {
        const article = db.prepare('SELECT nom FROM st_articles WHERE id = ? AND owner_id = ?').get(modelId, companyId) as { nom?: string } | undefined;
        if (article?.nom) return article.nom;
        const m = db.prepare(`
            SELECT COALESCE(json_extract(data, '$.meta_data.nom_modele'), json_extract(data, '$.filename')) AS nom
            FROM models WHERE id = ? AND (owner_id = ? OR (owner_id IS NULL AND user_id = ?))
        `).get(modelId, companyId, companyId) as { nom?: string } | undefined;
        return m?.nom || modelId;
    } catch {
        return modelId;
    }
};

/**
 * Stock disponible, case par case, à UN emplacement (NULL = Dépôt principal)
 * pour les modèles demandés : entrées ACCEPTÉES − sorties. Même formule que
 * l'écran (`stockMatrixByModel`), restreinte à l'emplacement.
 */
export const stockParCellule = (companyId: number | string, emplacementId: string | null, modelIds: string[]): Map<string, number> => {
    const dispo = new Map<string, number>();
    if (modelIds.length === 0) return dispo;
    const ph = modelIds.map(() => '?').join(',');
    const emp = emplacementId ?? '';
    const entrees = db.prepare(`
        SELECT modelId, couleur, taille, COALESCE(SUM(quantite), 0) AS q FROM st_stock_entries
        WHERE owner_id = ? AND qualite = 'ACCEPTED' AND COALESCE(emplacement_id, '') = ? AND modelId IN (${ph})
        GROUP BY modelId, couleur, taille
    `).all(companyId, emp, ...modelIds) as any[];
    const sorties = db.prepare(`
        SELECT modelId, couleur, taille, COALESCE(SUM(quantite), 0) AS q FROM st_stock_sorties
        WHERE owner_id = ? AND COALESCE(emplacement_id, '') = ? AND modelId IN (${ph})
        GROUP BY modelId, couleur, taille
    `).all(companyId, emp, ...modelIds) as any[];
    entrees.forEach(r => { const k = cleCellule(r.modelId, r.couleur, r.taille); dispo.set(k, (dispo.get(k) || 0) + Number(r.q)); });
    sorties.forEach(r => { const k = cleCellule(r.modelId, r.couleur, r.taille); dispo.set(k, (dispo.get(k) || 0) - Number(r.q)); });
    return dispo;
};

/** Pièces en stock à un emplacement (tous modèles), pour l'afficher et pour
 *  refuser de désactiver un lieu qui n'est pas vide. */
const piecesParEmplacement = (companyId: number | string): Map<string, number> => {
    const out = new Map<string, number>();
    const entrees = db.prepare(`
        SELECT emplacement_id AS eid, COALESCE(SUM(quantite), 0) AS q FROM st_stock_entries
        WHERE owner_id = ? AND qualite = 'ACCEPTED' AND emplacement_id IS NOT NULL GROUP BY emplacement_id
    `).all(companyId) as any[];
    const sorties = db.prepare(`
        SELECT emplacement_id AS eid, COALESCE(SUM(quantite), 0) AS q FROM st_stock_sorties
        WHERE owner_id = ? AND emplacement_id IS NOT NULL GROUP BY emplacement_id
    `).all(companyId) as any[];
    entrees.forEach(r => out.set(String(r.eid), (out.get(String(r.eid)) || 0) + Number(r.q)));
    sorties.forEach(r => out.set(String(r.eid), (out.get(String(r.eid)) || 0) - Number(r.q)));
    return out;
};

/** Nombre de mouvements (entrées, sorties, transferts) qui touchent un emplacement. */
const nbMouvements = (companyId: number | string, id: string): number => {
    const r = db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM st_stock_entries WHERE owner_id = ? AND emplacement_id = ?) +
            (SELECT COUNT(*) FROM st_stock_sorties WHERE owner_id = ? AND emplacement_id = ?) +
            (SELECT COUNT(*) FROM st_transferts WHERE owner_id = ? AND (de = ? OR vers = ?)) AS n
    `).get(companyId, id, companyId, id, companyId, id, id) as { n: number };
    return Number(r?.n) || 0;
};

// ─────────────────────────────────────────────────────────────────────────
// EMPLACEMENTS
// ─────────────────────────────────────────────────────────────────────────

// GET /api/subcontract/emplacements — tous les emplacements de l'entreprise
// (actifs ou non : un lieu désactivé garde son historique lisible), avec le
// stock qu'ils portent. Le Dépôt principal n'y figure pas : il n'est pas en base.
export const getEmplacements = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const rows = db.prepare(`
            SELECT id, nom, type, actif, created_at AS createdAt
            FROM st_emplacements WHERE owner_id = ?
            ORDER BY actif DESC, LOWER(nom) ASC
        `).all(companyId) as any[];
        const pieces = piecesParEmplacement(companyId);
        res.json(rows.map(r => ({
            id: r.id,
            nom: r.nom,
            type: r.type,
            actif: Number(r.actif) === 1,
            createdAt: r.createdAt,
            pieces: pieces.get(String(r.id)) || 0,
            nbMouvements: nbMouvements(companyId, String(r.id)),
            boutiquesEnLigne: boutiquesServies(companyId, String(r.id)),
        })));
    } catch (error) {
        console.error('Get emplacements error:', error);
        res.status(500).json({ message: 'Error fetching locations' });
    }
};

// POST /api/subcontract/emplacements — crée (sans `id`) ou met à jour (avec
// `id` : renommer, changer de type, désactiver / réactiver).
export const saveEmplacement = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const body = req.body || {};
    const id = normaliserEmplacement(body.id);

    const nomDemande = body.nom !== undefined ? String(body.nom).trim().slice(0, 80) : undefined;
    const typeDemande = body.type !== undefined ? String(body.type).trim().toUpperCase() : undefined;
    if (typeDemande !== undefined && !TYPES.has(typeDemande)) {
        return res.status(400).json({ message: 'Type d\'emplacement invalide (DEPOT ou BOUTIQUE).' });
    }

    try {
        // Deux lieux du même nom rendraient le sélecteur ambigu, et « Dépôt
        // principal » est déjà pris par le stock historique.
        const nomPris = (nom: string, sauf?: string) => {
            if (nom.toLowerCase() === NOM_PRINCIPAL.toLowerCase()) return true;
            const autre = db.prepare('SELECT id FROM st_emplacements WHERE owner_id = ? AND LOWER(nom) = LOWER(?)').get(companyId, nom) as { id: string } | undefined;
            return !!autre && autre.id !== sauf;
        };

        if (!id) {
            if (!nomDemande) return res.status(400).json({ message: 'Le nom de l\'emplacement est obligatoire.' });
            if (nomPris(nomDemande)) return res.status(409).json({ message: 'Un emplacement porte déjà ce nom.' });
            const nouveau = `emp-${randomUUID()}`;
            db.prepare('INSERT INTO st_emplacements (id, owner_id, nom, type, actif) VALUES (?, ?, ?, ?, 1)')
                .run(nouveau, companyId, nomDemande, typeDemande || 'BOUTIQUE');
            return res.json({ id: nouveau, nom: nomDemande, type: typeDemande || 'BOUTIQUE', actif: true });
        }

        const existant = emplacementDe(companyId, id);
        if (!existant) return res.status(404).json({ message: 'Emplacement introuvable.' });

        const nom = nomDemande !== undefined ? nomDemande : existant.nom;
        if (!nom) return res.status(400).json({ message: 'Le nom de l\'emplacement est obligatoire.' });
        if (nom !== existant.nom && nomPris(nom, id)) return res.status(409).json({ message: 'Un emplacement porte déjà ce nom.' });
        const type = typeDemande ?? existant.type;
        const actif = body.actif === undefined ? Number(existant.actif) : (body.actif ? 1 : 0);

        // Désactiver un lieu qui porte encore des pièces les ferait disparaître
        // des sélecteurs tout en les comptant dans le stock total : on demande
        // de les transférer d'abord.
        if (actif === 0 && Number(existant.actif) === 1) {
            const servies = boutiquesServies(companyId, id);
            if (servies.length > 0) {
                return res.status(409).json({ message: `Cet emplacement sert la boutique en ligne « ${servies.join(', ')} » : choisissez un autre emplacement pour la boutique (Réglages) avant de le désactiver.` });
            }
            const restant = piecesParEmplacement(companyId).get(id) || 0;
            if (restant > 0) {
                return res.status(409).json({ message: `Cet emplacement porte encore ${restant} pièce(s) : transférez-les d'abord ailleurs avant de le désactiver.` });
            }
        }

        db.prepare('UPDATE st_emplacements SET nom = ?, type = ?, actif = ? WHERE id = ? AND owner_id = ?')
            .run(nom, type, actif, id, companyId);
        res.json({ id, nom, type, actif: actif === 1 });
    } catch (error) {
        console.error('Save emplacement error:', error);
        res.status(500).json({ message: 'Error saving location' });
    }
};

// DELETE /api/subcontract/emplacements/:id — uniquement un emplacement SANS
// aucun mouvement (créé par erreur). Dès qu'il a une histoire, on le désactive.
export const deleteEmplacement = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const id = req.params.id;
    try {
        if (!emplacementDe(companyId, id)) return res.status(404).json({ message: 'Emplacement introuvable.' });
        const servies = boutiquesServies(companyId, id);
        if (servies.length > 0) {
            return res.status(409).json({ message: `Cet emplacement sert la boutique en ligne « ${servies.join(', ')} » : choisissez un autre emplacement pour la boutique (Réglages) avant de le supprimer.` });
        }
        if (nbMouvements(companyId, id) > 0) {
            return res.status(409).json({ message: 'Cet emplacement a des mouvements de stock : on ne peut que le désactiver, pour garder son historique lisible.' });
        }
        db.prepare('DELETE FROM st_emplacements WHERE id = ? AND owner_id = ?').run(id, companyId);
        res.json({ message: 'Emplacement supprimé' });
    } catch (error) {
        console.error('Delete emplacement error:', error);
        res.status(500).json({ message: 'Error deleting location' });
    }
};

// ─────────────────────────────────────────────────────────────────────────
// TRANSFERTS
// ─────────────────────────────────────────────────────────────────────────

/** Refus métier : remonte du corps de la transaction jusqu'à la réponse 4xx,
 *  en annulant tout ce qui avait déjà été écrit. */
class RefusTransfert extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

// GET /api/subcontract/transferts — l'historique, le plus récent d'abord, avec
// les lignes de chaque transfert (les entrées POSITIVES : ce qui est arrivé).
export const getTransferts = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const heads = db.prepare(`
            SELECT id, de, vers, note, nb_pieces AS nbPieces, created_by AS createdBy, created_at AS createdAt
            FROM st_transferts WHERE owner_id = ?
            ORDER BY created_at DESC, rowid DESC
            LIMIT 200
        `).all(companyId) as any[];

        // Seulement les lignes des transferts affichés : l'historique complet
        // d'une entreprise active ne doit pas être relu à chaque ouverture.
        const lignes = heads.length === 0 ? [] : db.prepare(`
            SELECT order_id AS transfertId, modelId, couleur, taille, quantite
            FROM st_stock_entries
            WHERE owner_id = ? AND source = ? AND quantite > 0 AND order_id IN (${heads.map(() => '?').join(',')})
        `).all(companyId, SOURCE_TRANSFERT, ...heads.map(h => h.id)) as any[];
        const parTransfert = new Map<string, any[]>();
        lignes.forEach(l => {
            const arr = parTransfert.get(String(l.transfertId)) || [];
            arr.push({ modelId: l.modelId, couleur: l.couleur, taille: l.taille, quantite: Number(l.quantite) || 0 });
            parTransfert.set(String(l.transfertId), arr);
        });

        res.json(heads.map((h, i) => ({
            ...h,
            // Seul le DERNIER transfert peut être annulé (voir deleteTransfert).
            derniere: i === 0,
            lignes: parTransfert.get(String(h.id)) || [],
        })));
    } catch (error) {
        console.error('Get transferts error:', error);
        res.status(500).json({ message: 'Error fetching transfers' });
    }
};

// POST /api/subcontract/transferts { de, vers, note, lignes: [{ modelId, couleur, taille, quantite }] }
// `de` / `vers` vides = Dépôt principal. Tout se passe dans UNE transaction :
// un transfert à moitié écrit ferait disparaître (ou apparaître) des pièces.
export const createTransfert = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const userId = (req as any).user?.id ?? null;
    const body = req.body || {};

    const de = normaliserEmplacement(body.de);
    const vers = normaliserEmplacement(body.vers);
    if (de === vers) return res.status(400).json({ message: 'Le départ et l\'arrivée doivent être deux emplacements différents.' });

    // Une même case peut arriver en plusieurs lignes : le contrôle de stock se
    // fait sur la SOMME demandée par case, pas ligne par ligne.
    const demande = new Map<string, { modelId: string; couleur: string | null; taille: string | null; quantite: number }>();
    for (const l of (Array.isArray(body.lignes) ? body.lignes : [])) {
        const modelId = String(l?.modelId || '').trim();
        const brut = Number(l?.quantite);
        const quantite = Math.floor(brut || 0);
        if (!modelId) return res.status(400).json({ message: 'Chaque ligne doit désigner un modèle.' });
        // Une quantité négative n'est pas une case vide : ce serait un transfert
        // à l'envers déguisé. On la refuse au lieu de l'ignorer en silence.
        if (Number.isFinite(brut) && brut < 0) return res.status(400).json({ message: 'Une quantité à transférer ne peut pas être négative.' });
        if (!(quantite > 0)) continue; // case laissée vide : rien à déplacer
        const couleur = l?.couleur ? String(l.couleur) : null;
        const taille = l?.taille ? String(l.taille) : null;
        const k = cleCellule(modelId, couleur, taille);
        const d = demande.get(k) || { modelId, couleur, taille, quantite: 0 };
        d.quantite += quantite;
        demande.set(k, d);
    }
    if (demande.size === 0) return res.status(400).json({ message: 'Aucune quantité à transférer.' });

    const note = body.note ? String(body.note).trim().slice(0, 500) : null;
    const transfertId = `tr-${randomUUID()}`;
    const date = new Date().toISOString().split('T')[0];

    try {
        db.transaction(() => {
            // Les deux extrémités appartiennent à l'entreprise ; l'arrivée doit
            // être active (on ne range plus rien dans un lieu fermé), le départ
            // peut être fermé — c'est même ainsi qu'on le vide.
            if (de && !emplacementDe(companyId, de)) throw new RefusTransfert('Emplacement de départ introuvable.');
            if (vers) {
                const arrivee = emplacementDe(companyId, vers);
                if (!arrivee) throw new RefusTransfert('Emplacement d\'arrivée introuvable.');
                if (Number(arrivee.actif) !== 1) throw new RefusTransfert(`L'emplacement « ${arrivee.nom} » est désactivé : réactivez-le avant d'y transférer du stock.`);
            }

            // Stock disponible AU DÉPART, case par case : on ne déplace pas ce
            // qui n'y est pas, sinon le lieu passerait en négatif sans que rien
            // ne le signale.
            const modelIds = [...new Set([...demande.values()].map(d => d.modelId))];
            const dispo = stockParCellule(companyId, de, modelIds);
            for (const [k, d] of demande) {
                const reste = dispo.get(k) || 0;
                if (reste < d.quantite) {
                    throw new RefusTransfert(
                        `Stock insuffisant à « ${nomEmplacement(companyId, de)} » pour ${nomModele(companyId, d.modelId)} ${d.couleur || '—'} / ${d.taille || '—'} : ${Math.max(0, reste)} disponible(s), ${d.quantite} demandée(s).`
                    );
                }
            }

            const nbPieces = [...demande.values()].reduce((a, d) => a + d.quantite, 0);
            db.prepare(`
                INSERT INTO st_transferts (id, owner_id, de, vers, note, nb_pieces, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(transfertId, companyId, de, vers, note, nbPieces, userId);

            const noteLigne = note || 'Transfert de stock';
            const insert = db.prepare(`
                INSERT INTO st_stock_entries (id, owner_id, order_id, modelId, couleur, taille, quantite, qualite, note, date_entree, batch_id, source, emplacement_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'ACCEPTED', ?, ?, ?, '${SOURCE_TRANSFERT}', ?)
            `);
            for (const d of demande.values()) {
                insert.run(randomUUID(), companyId, transfertId, d.modelId, d.couleur, d.taille, -d.quantite, noteLigne, date, transfertId, de);
                insert.run(randomUUID(), companyId, transfertId, d.modelId, d.couleur, d.taille, d.quantite, noteLigne, date, transfertId, vers);
            }
        })();
        res.json({ id: transfertId, nbLignes: demande.size, nbPieces: [...demande.values()].reduce((a, d) => a + d.quantite, 0) });
    } catch (error) {
        if (error instanceof RefusTransfert) return res.status(error.status).json({ message: error.message });
        console.error('Create transfert error:', error);
        res.status(500).json({ message: 'Error creating transfer' });
    }
};

// DELETE /api/subcontract/transferts/:id — annule un transfert, à deux
// conditions : c'est le DERNIER (un transfert ancien a servi de base aux
// suivants), et les pièces arrivées sont encore là (sinon les retirer
// creuserait le lieu d'arrivée en négatif).
export const deleteTransfert = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const id = req.params.id;
    try {
        db.transaction(() => {
            const head = db.prepare('SELECT id, de, vers FROM st_transferts WHERE id = ? AND owner_id = ?').get(id, companyId) as { id: string; de: string | null; vers: string | null } | undefined;
            if (!head) throw new RefusTransfert('Transfert introuvable.', 404);

            const dernier = db.prepare('SELECT id FROM st_transferts WHERE owner_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(companyId) as { id: string } | undefined;
            if (dernier?.id !== id) {
                throw new RefusTransfert('Seul le dernier transfert peut être annulé : les suivants sont partis de son résultat. Annulez-les d\'abord.', 409);
            }

            // Ce qui est ARRIVÉ (entrées positives) doit encore être présent à
            // l'arrivée pour pouvoir en repartir.
            const arrivees = db.prepare(`
                SELECT modelId, couleur, taille, SUM(quantite) AS q FROM st_stock_entries
                WHERE owner_id = ? AND order_id = ? AND source = ? AND quantite > 0
                GROUP BY modelId, couleur, taille
            `).all(companyId, id, SOURCE_TRANSFERT) as any[];
            const modelIds = [...new Set(arrivees.map(a => String(a.modelId)))];
            const dispo = stockParCellule(companyId, head.vers, modelIds);
            for (const a of arrivees) {
                const reste = dispo.get(cleCellule(a.modelId, a.couleur, a.taille)) || 0;
                if (reste < Number(a.q)) {
                    throw new RefusTransfert(
                        `Annulation impossible : ${nomModele(companyId, String(a.modelId))} ${a.couleur || '—'} / ${a.taille || '—'} n'a plus que ${Math.max(0, reste)} pièce(s) à « ${nomEmplacement(companyId, head.vers)} » (${Number(a.q)} étaient arrivées) — elles ont été vendues ou déplacées depuis.`,
                        409,
                    );
                }
            }

            db.prepare('DELETE FROM st_stock_entries WHERE owner_id = ? AND order_id = ? AND source = ?').run(companyId, id, SOURCE_TRANSFERT);
            db.prepare('DELETE FROM st_transferts WHERE id = ? AND owner_id = ?').run(id, companyId);
        })();
        res.json({ message: 'Transfert annulé' });
    } catch (error) {
        if (error instanceof RefusTransfert) return res.status(error.status).json({ message: error.message });
        console.error('Delete transfert error:', error);
        res.status(500).json({ message: 'Error deleting transfer' });
    }
};

// ─────────────────────────────────────────────────────────────────────────
// GARDE-FOU DES SUPPRESSIONS D'ENTRÉES
// ─────────────────────────────────────────────────────────────────────────
// Supprimer une réception (commande, achat, inventaire, lot d'entrée) retire
// des pièces du lieu où elles ÉTAIENT — le principal, pour toutes les entrées
// historiques. Si ces pièces ont été transférées ailleurs depuis, le total reste
// juste (les deux lignes du transfert se compensent) mais le principal passerait
// en négatif et le lieu d'arrivée garderait des pièces sorties de nulle part.

class RefusSuppression extends Error {}

/** Cellules dont le stock est NÉGATIF quelque part, pour ces modèles :
 *  clé `emplacement|modèle|couleur|taille` → quantité. */
const cellulesNegatives = (companyId: number | string, modelIds: string[]): Map<string, number> => {
    const out = new Map<string, number>();
    if (modelIds.length === 0) return out;
    const ph = modelIds.map(() => '?').join(',');
    const rows = db.prepare(`
        SELECT emp, modelId, coul, tail, SUM(q) AS q FROM (
            SELECT COALESCE(emplacement_id, '') AS emp, modelId, COALESCE(couleur, '') AS coul, COALESCE(taille, '') AS tail, quantite AS q
            FROM st_stock_entries WHERE owner_id = ? AND qualite = 'ACCEPTED' AND modelId IN (${ph})
            UNION ALL
            SELECT COALESCE(emplacement_id, ''), modelId, COALESCE(couleur, ''), COALESCE(taille, ''), -quantite
            FROM st_stock_sorties WHERE owner_id = ? AND modelId IN (${ph})
        ) GROUP BY emp, modelId, coul, tail HAVING q < 0
    `).all(companyId, ...modelIds, companyId, ...modelIds) as any[];
    rows.forEach(r => out.set(`${r.emp}|${r.modelId}|${r.coul}|${r.tail}`, Number(r.q)));
    return out;
};

/**
 * Exécute `suppression` (qui retire des entrées de stock) dans une transaction,
 * et l'annule si elle creuse un emplacement en négatif. Renvoie le message de
 * refus, ou `null` si tout est passé.
 *
 * Ne change RIEN pour une entreprise sans emplacement : sans lieu, le stock ne
 * peut pas diverger du total, que les contrôles historiques vérifient déjà.
 */
export const supprimerEntreesSansCreuser = (companyId: number | string, modelIds: Array<string | null | undefined>, suppression: () => void): string | null => {
    const ids = [...new Set(modelIds.filter((m): m is string => !!m).map(String))];
    // Un lieu peut diverger du total dès qu'on a créé un emplacement : par un
    // transfert, mais aussi par une réception ou un achat rangé directement dans
    // un lieu (`emplacement_id` choisi à la saisie). Surveiller seulement les
    // transferts laisserait supprimer une réception dont les pièces sont déjà
    // sorties de ce lieu. Sans aucun emplacement : rien n'est surveillé, comme avant.
    const surveille = (aDesTransferts(companyId) || aDesEmplacements(companyId)) && ids.length > 0;
    try {
        db.transaction(() => {
            const avant = surveille ? cellulesNegatives(companyId, ids) : null;
            suppression();
            if (avant) {
                for (const [k, q] of cellulesNegatives(companyId, ids)) {
                    // Nouvelle case négative, ou case déjà négative qui s'aggrave.
                    if (q < (avant.get(k) ?? 0)) throw new RefusSuppression();
                }
            }
        })();
        return null;
    } catch (e) {
        if (e instanceof RefusSuppression) {
            return 'Suppression refusée : des pièces de cette réception ont été transférées vers un autre emplacement (ou vendues depuis) — la retirer laisserait un emplacement en stock négatif. Annulez d\'abord le transfert concerné.';
        }
        throw e;
    }
};
