import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from './db';
import { getAdapter, PLATEFORMES } from './storeAdapters';
import type { StoreConfigRow, StoreMappingRow } from './storeAdapters/types';
import { chiffrerToken, dechiffrerToken, dechiffrerConfig } from './storeSecrets';

/**
 * Synchronisation avec une BOUTIQUE EN LIGNE.
 *
 * L'atelier tient son stock à la maille couleur × taille ; une boutique en ligne
 * ne connaît que des VARIANTES. Ce controller est le traducteur entre les deux —
 * et il ne fait QUE cela : il ne calcule aucun coût, ne touche à aucun prix de
 * revient, et n'écrit jamais directement chez la plateforme. Toute écriture
 * distante passe par la file d'attente (`st_sync_outbox`), parce que dans un
 * atelier l'internet tombe et qu'un envoi perdu ferait dériver le stock en
 * silence.
 *
 * ⚠️ Isolation : `owner_id = companyId` sur CHAQUE requête, sans exception.
 * Deux entreprises partagent la même base ; une requête sans filtre ferait
 * pousser le stock d'un atelier sur la boutique d'un autre.
 *
 * ⚠️ Le token de la boutique ne sort JAMAIS d'ici : il est renvoyé masqué, et il
 * est CHIFFRÉ au repos (cf. `storeSecrets.ts`). Toute lecture destinée à appeler
 * la plateforme passe par `lireConfig`, qui déchiffre.
 */

/** Marqueur des valeurs masquées : sa présence signifie « l'écran n'a pas
 *  re-saisi le token, garde l'ancien ». */
const MASQUE = '••••';

const nowIso = () => new Date().toISOString();

/** `shpat_abcdef…9f3c` → `shpat_••••9f3c`. Assez pour reconnaître QUEL token est
 *  configuré, trop peu pour s'en servir. */
const masquerToken = (token: string | null): string | null => {
    const t = String(token ?? '');
    if (!t) return null;
    if (t.length <= 8) return MASQUE;
    const prefixe = t.includes('_') ? `${t.slice(0, t.indexOf('_') + 1)}` : '';
    return `${prefixe}${MASQUE}${t.slice(-4)}`;
};

/** Forme renvoyée au navigateur : tout sauf le secret.
 *  Le masque est calculé sur le jeton DÉCHIFFRÉ : masquer la forme stockée
 *  afficherait « encv1_•••• » et empêcherait de reconnaître quel jeton est en
 *  place, ce qui est justement le seul intérêt du masque. */
const publicConfig = (row: any) => ({
    id: row.id,
    plateforme: row.plateforme,
    nom: row.nom,
    boutique_url: row.boutique_url,
    token_masque: masquerToken(dechiffrerToken(row.token)),
    location_id: row.location_id,
    actif: Number(row.actif) ? 1 : 0,
    marge_securite: Number(row.marge_securite) || 0,
    derniere_sync: row.derniere_sync,
    derniere_erreur: row.derniere_erreur,
});

/** Lecture interne d'une boutique, TOKEN COMPRIS et DÉCHIFFRÉ. Réservée au
 *  serveur : c'est la seule porte d'entrée vers un adaptateur. */
export const lireConfig = (companyId: number | string, storeId: string): StoreConfigRow | null =>
    dechiffrerConfig(db.prepare('SELECT * FROM st_store_config WHERE id = ? AND owner_id = ?')
        .get(storeId, companyId) as StoreConfigRow | undefined);

/** Clé de cellule, unique dans toute la couche : couleur|taille normalisées. */
export const cellKey = (couleur: any, taille: any) => `${String(couleur ?? '')}|${String(taille ?? '')}`;

/**
 * STOCK LOCAL par cellule, pour un modèle.
 *
 *   stock_local_cellule = Σ entrées ACCEPTED (couleur, taille)
 *                       − Σ sorties        (couleur, taille)
 *
 * Seules les entrées ACCEPTED comptent : les pièces en REPAIR ou REJECTED
 * existent physiquement mais ne sont PAS vendables — les mettre en ligne
 * reviendrait à vendre un article défectueux.
 */
export const stockLocalParCellule = (companyId: number | string, modelId: string): Map<string, number> => {
    const dispo = new Map<string, number>();
    const entrees = db.prepare(
        "SELECT couleur, taille, COALESCE(SUM(quantite),0) AS q FROM st_stock_entries WHERE owner_id = ? AND modelId = ? AND qualite = 'ACCEPTED' GROUP BY couleur, taille"
    ).all(companyId, modelId) as any[];
    const sorties = db.prepare(
        'SELECT couleur, taille, COALESCE(SUM(quantite),0) AS q FROM st_stock_sorties WHERE owner_id = ? AND modelId = ? GROUP BY couleur, taille'
    ).all(companyId, modelId) as any[];

    for (const r of entrees) dispo.set(cellKey(r.couleur, r.taille), (dispo.get(cellKey(r.couleur, r.taille)) || 0) + Number(r.q));
    for (const r of sorties) dispo.set(cellKey(r.couleur, r.taille), (dispo.get(cellKey(r.couleur, r.taille)) || 0) - Number(r.q));
    return dispo;
};

/**
 * QUANTITÉ POUSSÉE EN LIGNE — la formule où l'argent se perd si elle est fausse.
 *
 *     quantite_poussee = max(0, stock_local_cellule − marge_securite)
 *
 * • `max(0, …)` : une quantité négative n'a aucun sens en ligne. Un stock local
 *   négatif (saisie en retard) doit fermer la vente, pas la rouvrir.
 * • `marge_securite` : pièces volontairement gardées hors ligne. Le magasin
 *   physique et la boutique puisent dans le MÊME stock. Sans marge, la dernière
 *   pièce est vendue deux fois — une fois au comptoir, une fois en ligne — et
 *   c'est l'atelier qui annule la commande et perd le client.
 */
export const quantitePoussee = (stockLocal: number, margeSecurite: number): number =>
    Math.max(0, Math.floor(stockLocal) - Math.max(0, Math.floor(margeSecurite || 0)));

/** Translittération ASCII majuscule : les SKU voyagent dans des CSV, des URL et
 *  des étiquettes code-barres qui ne supportent ni accent ni espace. */
const slug = (texte: any, taille: number): string => {
    const base = String(texte ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // é → e
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '')
        .slice(0, taille);
    return base || 'X';
};

/** Nom lisible du modèle, pour le SKU et le titre du produit publié. */
const nomModele = (companyId: number | string, modelId: string): string => {
    const row = db.prepare(
        "SELECT COALESCE(json_extract(data, '$.meta_data.nom_modele'), json_extract(data, '$.filename')) AS nom FROM models WHERE id = ? AND user_id = ?"
    ).get(modelId, companyId) as any;
    return String(row?.nom ?? '').trim() || String(modelId);
};

/**
 * Cellules couleur × taille d'un modèle.
 *
 * Deux sources RÉUNIES, volontairement :
 *   • la fiche modèle (couleurs et tailles déclarées) — ce qui est prévu ;
 *   • les entrées de stock réelles — ce qui existe VRAIMENT en magasin.
 * Ne prendre que la fiche laisserait invendable une couleur reçue mais non
 * déclarée ; ne prendre que le stock empêcherait de publier avant la première
 * livraison.
 */
const cellulesDuModele = (companyId: number | string, modelId: string): Array<{ couleur: string | null; taille: string | null }> => {
    const vues = new Map<string, { couleur: string | null; taille: string | null }>();

    const row = db.prepare('SELECT data FROM models WHERE id = ? AND user_id = ?').get(modelId, companyId) as any;
    if (row?.data) {
        try {
            const data = JSON.parse(row.data);
            const couleurs: string[] = (data?.meta_data?.colors ?? data?.ficheData?.colors ?? [])
                .map((c: any) => (typeof c === 'string' ? c : c?.name)).filter(Boolean);
            const tailles: string[] = (data?.meta_data?.sizes ?? data?.ficheData?.sizes ?? []).filter(Boolean);
            for (const c of couleurs) for (const t of tailles) vues.set(cellKey(c, t), { couleur: c, taille: t });
        } catch { /* fiche illisible : on se rabat sur le stock réel */ }
    }

    const reelles = db.prepare(
        'SELECT DISTINCT couleur, taille FROM st_stock_entries WHERE owner_id = ? AND modelId = ?'
    ).all(companyId, modelId) as any[];
    for (const r of reelles) vues.set(cellKey(r.couleur, r.taille), { couleur: r.couleur ?? null, taille: r.taille ?? null });

    return Array.from(vues.values());
};

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION DES BOUTIQUES
// ─────────────────────────────────────────────────────────────────────────────

export const getStoreConfig = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const rows = db.prepare('SELECT * FROM st_store_config WHERE owner_id = ? ORDER BY created_at ASC').all(companyId) as any[];
        res.json(rows.map(publicConfig));
    } catch (error) {
        console.error('Get store config error:', error);
        res.status(500).json({ message: 'Error fetching store configuration' });
    }
};

export const saveStoreConfig = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const p = req.body || {};
    const plateforme = String(p.plateforme || 'SHOPIFY').toUpperCase();

    if (!PLATEFORMES.includes(plateforme as any)) {
        return res.status(400).json({ message: `Plateforme inconnue : ${plateforme}` });
    }
    if (!String(p.boutique_url ?? '').trim()) {
        return res.status(400).json({ message: 'URL de la boutique obligatoire' });
    }

    try {
        const id = String(p.id || '').trim() || randomUUID();
        const existant = db.prepare('SELECT * FROM st_store_config WHERE id = ? AND owner_id = ?').get(id, companyId) as any;

        // ⚠️ Conservation du secret : l'écran ne reçoit que la version masquée et
        // la renvoie telle quelle quand l'utilisateur ne l'a pas retapée. Écrire
        // cette valeur masquée en base détruirait le token — le pire scénario,
        // parce qu'il ne se voit qu'à la synchronisation suivante.
        const tokenEntrant = p.token == null ? '' : String(p.token).trim();
        const tokenValide = tokenEntrant && !tokenEntrant.includes(MASQUE) ? tokenEntrant : null;
        // Le jeton conservé est relu DÉCHIFFRÉ puis re-chiffré : c'est ce qui
        // migre silencieusement une installation existante dont le jeton est
        // encore en clair, sans jamais toucher aux lignes qu'on ne réécrit pas.
        const tokenClair = tokenValide ?? dechiffrerToken(existant?.token ?? null);
        const token = chiffrerToken(tokenClair);

        db.prepare(`
            INSERT INTO st_store_config (id, owner_id, plateforme, nom, boutique_url, token, location_id, actif, marge_securite)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                plateforme = excluded.plateforme,
                nom = excluded.nom,
                boutique_url = excluded.boutique_url,
                token = excluded.token,
                location_id = excluded.location_id,
                actif = excluded.actif,
                marge_securite = excluded.marge_securite,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            id,
            companyId,
            plateforme,
            p.nom ? String(p.nom) : null,
            String(p.boutique_url).trim(),
            token,
            p.location_id ? String(p.location_id).trim() : (existant?.location_id ?? null),
            p.actif ? 1 : 0,
            Math.max(0, Math.floor(Number(p.marge_securite) || 0)),
        );

        const saved = db.prepare('SELECT * FROM st_store_config WHERE id = ? AND owner_id = ?').get(id, companyId);
        res.json(publicConfig(saved));
    } catch (error) {
        console.error('Save store config error:', error);
        res.status(500).json({ message: 'Error saving store configuration' });
    }
};

export const deleteStoreConfig = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const info = db.prepare('DELETE FROM st_store_config WHERE id = ? AND owner_id = ?').run(req.params.id, companyId);
        if (info.changes === 0) return res.status(404).json({ message: 'Boutique introuvable' });
        // Le pont et la file n'ont plus d'objet une fois la boutique supprimée :
        // les laisser ferait tourner le worker sur une configuration absente.
        db.prepare('DELETE FROM st_store_mapping WHERE store_id = ? AND owner_id = ?').run(req.params.id, companyId);
        db.prepare('DELETE FROM st_sync_outbox WHERE store_id = ? AND owner_id = ?').run(req.params.id, companyId);
        res.json({ message: 'Boutique supprimée' });
    } catch (error) {
        console.error('Delete store config error:', error);
        res.status(500).json({ message: 'Error deleting store configuration' });
    }
};

export const testStoreConnection = async (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const config = lireConfig(companyId, req.params.id);
        if (!config) return res.status(404).json({ message: 'Boutique introuvable' });

        const resultat = await getAdapter(config).testConnection();
        // Le test est aussi un diagnostic : on garde la trace de l'échec pour que
        // le bandeau de statut dise POURQUOI la boutique ne répond plus.
        db.prepare('UPDATE st_store_config SET derniere_erreur = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?')
            .run(resultat.ok ? null : (resultat.message ?? 'Échec de connexion'), config.id, companyId);
        res.json({ ok: resultat.ok, nom: resultat.nom ?? null, message: resultat.message ?? null });
    } catch (error: any) {
        console.error('Test store connection error:', error);
        res.json({ ok: false, nom: null, message: error?.message || 'Erreur de connexion' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// LE PONT (mapping cellule ↔ variante)
// ─────────────────────────────────────────────────────────────────────────────

export const getStoreMapping = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const { modelId, storeId } = req.query as { modelId?: string; storeId?: string };
    try {
        const where: string[] = ['owner_id = ?'];
        const params: any[] = [companyId];
        if (storeId) { where.push('store_id = ?'); params.push(storeId); }
        if (modelId) { where.push('modelId = ?'); params.push(modelId); }

        const rows = db.prepare(
            `SELECT * FROM st_store_mapping WHERE ${where.join(' AND ')} ORDER BY modelId, couleur, taille`
        ).all(...params) as any[];

        // `qte_locale` est recalculée à la lecture, jamais stockée : une quantité
        // figée en base se périmerait à la première entrée de stock et l'écran
        // afficherait un chiffre faux avec l'aplomb d'un chiffre vrai.
        const stocks = new Map<string, Map<string, number>>();
        const stockDe = (mid: string) => {
            if (!stocks.has(mid)) stocks.set(mid, stockLocalParCellule(companyId, mid));
            return stocks.get(mid)!;
        };

        res.json(rows.map(r => ({
            id: r.id,
            modelId: r.modelId,
            couleur: r.couleur,
            taille: r.taille,
            sku: r.sku,
            external_variant_id: r.external_variant_id,
            external_inventory_item_id: r.external_inventory_item_id,
            statut: r.statut,
            derniere_erreur: r.derniere_erreur,
            derniere_qte_poussee: r.derniere_qte_poussee,
            qte_locale: stockDe(r.modelId).get(cellKey(r.couleur, r.taille)) ?? 0,
        })));
    } catch (error) {
        console.error('Get store mapping error:', error);
        res.status(500).json({ message: 'Error fetching store mapping' });
    }
};

/**
 * Génère les SKU manquants pour toutes les cellules d'un modèle.
 *
 * ⚠️ LE SKU EST GÉNÉRÉ, JAMAIS SAISI À LA MAIN. Un SKU tapé se retrouve écrit
 * de trois façons pour la même variante — et le pont ne repose plus sur rien.
 * Format : `<MODELE>-<COULEUR>-<TAILLE>`, ASCII majuscule, sans accent ni espace.
 *
 * ⚠️ Un SKU DÉJÀ LIÉ à une variante distante n'est jamais régénéré : le
 * renommer couperait le pont avec la boutique et le stock de cette variante
 * cesserait d'être mis à jour, sans erreur visible.
 */
export const generateStoreMapping = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const modelId = String(req.body?.modelId ?? '').trim();
    const storeId = String(req.body?.storeId ?? '').trim();

    if (!modelId || !storeId) return res.status(400).json({ message: 'modelId et storeId sont obligatoires' });

    try {
        if (!lireConfig(companyId, storeId)) return res.status(404).json({ message: 'Boutique introuvable' });

        const cellules = cellulesDuModele(companyId, modelId);
        if (cellules.length === 0) {
            return res.status(400).json({ message: 'Ce modèle n\'a ni couleurs/tailles déclarées ni entrée en stock : rien à mapper' });
        }

        const existantes = db.prepare('SELECT * FROM st_store_mapping WHERE owner_id = ? AND store_id = ? AND modelId = ?')
            .all(companyId, storeId, modelId) as any[];
        const parCellule = new Map(existantes.map(r => [cellKey(r.couleur, r.taille), r]));

        // Unicité garantie sur TOUTE la boutique, pas seulement sur ce modèle :
        // deux modèles aux noms proches produiraient sinon le même SKU et le
        // stock de l'un écraserait celui de l'autre.
        const skusPris = new Set(
            (db.prepare('SELECT sku FROM st_store_mapping WHERE owner_id = ? AND store_id = ? AND sku IS NOT NULL')
                .all(companyId, storeId) as any[]).map(r => String(r.sku))
        );

        const base = slug(nomModele(companyId, modelId), 12);
        const insert = db.prepare(`
            INSERT INTO st_store_mapping (id, owner_id, store_id, modelId, couleur, taille, sku, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);
        const majSku = db.prepare('UPDATE st_store_mapping SET sku = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?');

        let crees = 0;
        let complétés = 0;

        db.transaction(() => {
            for (const cell of cellules) {
                const ligne = parCellule.get(cellKey(cell.couleur, cell.taille));
                // Cellule déjà liée à la boutique : on n'y touche pas.
                if (ligne?.sku && (ligne.external_variant_id || ligne.external_inventory_item_id)) continue;
                if (ligne?.sku) continue; // SKU déjà généré, rien à refaire

                let candidat = `${base}-${slug(cell.couleur, 6)}-${slug(cell.taille, 4)}`;
                let suffixe = 1;
                while (skusPris.has(candidat)) {
                    suffixe++;
                    candidat = `${base}-${slug(cell.couleur, 6)}-${slug(cell.taille, 4)}-${suffixe}`;
                }
                skusPris.add(candidat);

                if (ligne) { majSku.run(candidat, ligne.id, companyId); complétés++; }
                else { insert.run(randomUUID(), companyId, storeId, modelId, cell.couleur, cell.taille, candidat); crees++; }
            }
        })();

        const rows = db.prepare('SELECT * FROM st_store_mapping WHERE owner_id = ? AND store_id = ? AND modelId = ? ORDER BY couleur, taille')
            .all(companyId, storeId, modelId) as any[];
        const stock = stockLocalParCellule(companyId, modelId);

        res.json({
            crees,
            completes: complétés,
            mapping: rows.map(r => ({
                id: r.id,
                modelId: r.modelId,
                couleur: r.couleur,
                taille: r.taille,
                sku: r.sku,
                external_variant_id: r.external_variant_id,
                external_inventory_item_id: r.external_inventory_item_id,
                statut: r.statut,
                derniere_erreur: r.derniere_erreur,
                derniere_qte_poussee: r.derniere_qte_poussee,
                qte_locale: stock.get(cellKey(r.couleur, r.taille)) ?? 0,
            })),
        });
    } catch (error) {
        console.error('Generate store mapping error:', error);
        res.status(500).json({ message: 'Error generating store mapping' });
    }
};

/**
 * Correction manuelle d'une ligne du pont.
 *
 * Sert quand la variante a été recréée à la main côté boutique : les
 * identifiants distants ont changé, le SKU non. Sans cette porte de sortie, la
 * seule issue serait de republier le produit et de créer un doublon.
 */
export const saveStoreMapping = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const p = req.body || {};
    const id = String(p.id ?? '').trim();

    if (!id) return res.status(400).json({ message: 'id de la ligne de mapping obligatoire' });

    try {
        const ligne = db.prepare('SELECT * FROM st_store_mapping WHERE id = ? AND owner_id = ?').get(id, companyId) as any;
        if (!ligne) return res.status(404).json({ message: 'Ligne de mapping introuvable' });

        const sku = p.sku != null ? String(p.sku).trim().toUpperCase() : ligne.sku;
        if (sku && sku !== ligne.sku) {
            const collision = db.prepare('SELECT id FROM st_store_mapping WHERE owner_id = ? AND store_id = ? AND sku = ? AND id <> ?')
                .get(companyId, ligne.store_id, sku, id) as any;
            if (collision) return res.status(400).json({ message: `SKU déjà utilisé sur cette boutique : ${sku}` });
        }

        const variantId = p.external_variant_id !== undefined ? (String(p.external_variant_id).trim() || null) : ligne.external_variant_id;
        const itemId = p.external_inventory_item_id !== undefined ? (String(p.external_inventory_item_id).trim() || null) : ligne.external_inventory_item_id;

        db.prepare(`
            UPDATE st_store_mapping
            SET sku = ?, external_product_id = ?, external_variant_id = ?, external_inventory_item_id = ?,
                statut = ?, derniere_erreur = NULL,
                -- La quantité de référence est remise à zéro : elle décrivait
                -- l'ANCIENNE variante. La conserver ferait échouer la prochaine
                -- comparaison, ou pire, la ferait réussir à tort.
                derniere_qte_poussee = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND owner_id = ?
        `).run(
            sku || null,
            p.external_product_id !== undefined ? (String(p.external_product_id).trim() || null) : ligne.external_product_id,
            variantId,
            itemId,
            itemId ? 'OK' : 'PENDING',
            id,
            companyId,
        );

        res.json(db.prepare('SELECT * FROM st_store_mapping WHERE id = ? AND owner_id = ?').get(id, companyId));
    } catch (error) {
        console.error('Save store mapping error:', error);
        res.status(500).json({ message: 'Error saving store mapping' });
    }
};

/**
 * PRIX DE VENTE EN LIGNE d'un modèle.
 *
 * Chaîne de résolution UNIQUE, utilisée par la publication ET par la tâche
 * `PUSH_PRICE` du worker : deux chaînes différentes finiraient par publier un
 * prix et en pousser un autre, sans que rien ne le signale.
 *
 *   1. tarif catalogue de canal 'ONLINE'  (le prix décidé POUR la boutique)
 *   2. tarif catalogue tous canaux
 *   3. `ficheData.clientPrice` du modèle   (le prix historique, avant `st_prix`)
 *   4. `null` — aucun prix décidé
 *
 * ⚠️ Seuls les tarifs CATALOGUE entrent ici (ni client ni segment) : une
 * boutique en ligne vend au public, lui pousser un prix négocié avec un
 * grossiste afficherait ce prix à tout le monde.
 *
 * `null` est une réponse valide : la plateforme garde alors son prix actuel.
 * Inventer un montant (coût de revient, dernier prix vu) ferait vendre à un prix
 * que personne n'a décidé.
 */
export const prixOnlineModele = (companyId: number | string, modelId: string): number | null => {
    const tarif = db.prepare(`
        SELECT prix FROM st_prix
        WHERE owner_id = ? AND modelId = ? AND client_id IS NULL AND type_client IS NULL
          AND (canal = 'ONLINE' OR canal IS NULL)
        ORDER BY (canal = 'ONLINE') DESC, qty_min ASC, updated_at DESC
        LIMIT 1
    `).get(companyId, modelId) as any;
    if (tarif?.prix != null && Number.isFinite(Number(tarif.prix))) return Number(tarif.prix);

    // Repli historique : les ateliers qui n'ont pas encore saisi de grille
    // tarifaire ont leur prix de vente dans la fiche du modèle.
    const row = db.prepare(
        "SELECT json_extract(data, '$.ficheData.clientPrice') AS prix FROM models WHERE id = ? AND user_id = ?"
    ).get(modelId, companyId) as any;
    const clientPrice = Number(row?.prix);
    return Number.isFinite(clientPrice) && clientPrice > 0 ? clientPrice : null;
};

/** Erreur métier portant le code HTTP à renvoyer : la route et le worker
 *  partagent le même chemin de publication, seul le rendu diffère. */
class PublicationError extends Error {
    constructor(message: string, readonly statut = 400) { super(message); this.name = 'PublicationError'; }
}

/**
 * PUBLICATION D'UN MODÈLE — chemin unique.
 *
 * Appelé par la route synchrone `POST /api/store/publish` ET par la tâche
 * `PUBLISH` de la file d'attente. Un seul corps de code : dupliquer la
 * publication ferait diverger les deux chemins (options de variantes, prix,
 * écriture du pont) et un opérateur ne verrait pas la même vitrine selon qu'il a
 * cliqué ou attendu le worker.
 *
 * IDEMPOTENT : si le pont porte déjà un `external_product_id`, la plateforme est
 * appelée en MISE À JOUR. Un opérateur qui reclique sur « Publier » ne doit pas
 * se retrouver avec le même article deux fois en vitrine.
 */
export const publierModele = async (
    companyId: number | string,
    storeId: string,
    modelId: string,
): Promise<{ external_product_id: string; variantes: number; mis_a_jour: boolean }> => {
    const config = lireConfig(companyId, storeId);
    if (!config) throw new PublicationError('Boutique introuvable', 404);

    const adapter = getAdapter(config);
    if (!adapter.publishModel) {
        throw new PublicationError('Cette plateforme ne permet pas de créer les produits depuis BERAMETHODE : créez la fiche produit sur la boutique, puis générez et corrigez le mapping.', 400);
    }

    const lignes = db.prepare('SELECT * FROM st_store_mapping WHERE owner_id = ? AND store_id = ? AND modelId = ?')
        .all(companyId, storeId, modelId) as any[];
    if (lignes.length === 0) throw new PublicationError('Générez d\'abord le mapping (les SKU) de ce modèle', 400);
    if (lignes.some(l => !l.sku)) throw new PublicationError('Certaines cellules n\'ont pas de SKU : régénérez le mapping', 400);

    const prix = prixOnlineModele(companyId, modelId);
    const dejaPublie = lignes.find(l => l.external_product_id)?.external_product_id ?? null;

    const resultat = await adapter.publishModel({
        titre: nomModele(companyId, modelId),
        external_product_id: dejaPublie,
        variantes: lignes.map(l => ({ sku: String(l.sku), couleur: l.couleur, taille: l.taille, prix })),
    });

    const maj = db.prepare(`
        UPDATE st_store_mapping
        SET external_product_id = ?, external_variant_id = ?, external_inventory_item_id = ?,
            statut = 'OK', derniere_erreur = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE owner_id = ? AND store_id = ? AND sku = ?
    `);
    db.transaction(() => {
        for (const v of resultat.variantes) {
            if (!v.sku) continue;
            maj.run(resultat.external_product_id, v.external_variant_id, v.external_inventory_item_id, companyId, storeId, v.sku);
        }
    })();

    return {
        external_product_id: resultat.external_product_id,
        variantes: resultat.variantes.length,
        mis_a_jour: Boolean(dejaPublie),
    };
};

/** Route synchrone de publication : simple enveloppe HTTP de `publierModele`. */
export const publishStoreModel = async (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const modelId = String(req.body?.modelId ?? '').trim();
    const storeId = String(req.body?.storeId ?? '').trim();

    if (!modelId || !storeId) return res.status(400).json({ message: 'modelId et storeId sont obligatoires' });

    try {
        const resultat = await publierModele(companyId, storeId, modelId);
        res.json({ ok: true, ...resultat });
    } catch (error: any) {
        console.error('Publish store model error:', error);
        res.status(Number(error?.statut) || 500).json({ message: error?.message || 'Erreur lors de la publication' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// FILE D'ATTENTE
// ─────────────────────────────────────────────────────────────────────────────

/** Empile une tâche. Point de passage OBLIGATOIRE de toute écriture distante. */
export const enfilerTache = (
    companyId: number | string,
    storeId: string,
    type: 'PUSH_STOCK' | 'PUSH_PRICE' | 'PUBLISH',
    payload: any,
): string => {
    const id = randomUUID();
    db.prepare(`
        INSERT INTO st_sync_outbox (id, owner_id, store_id, type, payload, statut, tentatives, prochaine_tentative)
        VALUES (?, ?, ?, ?, ?, 'QUEUED', 0, ?)
    `).run(id, companyId, storeId, type, JSON.stringify(payload ?? {}), nowIso());
    return id;
};

/**
 * Demande une synchronisation de stock : une tâche PAR MODÈLE.
 *
 * Une seule tâche « tout le catalogue » serait plus simple mais désastreuse :
 * un modèle en erreur bloquerait tous les autres, et le rejeu repousserait des
 * dizaines de modèles pour une seule cellule fautive.
 */
export const queueStoreSync = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const storeId = String(req.params.storeId ?? '').trim();
    const modelId = req.body?.modelId ? String(req.body.modelId).trim() : null;

    try {
        const config = lireConfig(companyId, storeId);
        if (!config) return res.status(404).json({ message: 'Boutique introuvable' });

        const modeles: string[] = modelId
            ? [modelId]
            : (db.prepare('SELECT DISTINCT modelId FROM st_store_mapping WHERE owner_id = ? AND store_id = ?')
                .all(companyId, storeId) as any[]).map(r => String(r.modelId));

        if (modeles.length === 0) return res.json({ taches: 0, message: 'Aucun modèle mappé sur cette boutique' });

        db.transaction(() => {
            for (const m of modeles) enfilerTache(companyId, storeId, 'PUSH_STOCK', { modelId: m });
        })();

        res.json({ taches: modeles.length });
    } catch (error) {
        console.error('Queue store sync error:', error);
        res.status(500).json({ message: 'Error queueing store sync' });
    }
};

export const getStoreOutbox = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const { statut } = req.query as { statut?: string };
    try {
        const where = ['owner_id = ?'];
        const params: any[] = [companyId];
        if (statut) { where.push('statut = ?'); params.push(String(statut).toUpperCase()); }

        const rows = db.prepare(`
            SELECT id, store_id, type, payload, statut, tentatives, prochaine_tentative, derniere_erreur, created_at, sent_at
            FROM st_sync_outbox
            WHERE ${where.join(' AND ')}
            ORDER BY created_at DESC
            LIMIT 200
        `).all(...params);
        res.json(rows);
    } catch (error) {
        console.error('Get store outbox error:', error);
        res.status(500).json({ message: 'Error fetching sync queue' });
    }
};

/**
 * Réarme une tâche en erreur (ou toutes).
 *
 * Une tâche épuisée reste en 'ERROR' indéfiniment : c'est volontaire. Elle
 * attend qu'un humain corrige la cause (token expiré, variante supprimée) puis
 * relance. Une purge automatique ferait disparaître la preuve qu'un mouvement de
 * stock n'est jamais arrivé en ligne.
 */
export const retryStoreOutbox = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const id = req.body?.id ? String(req.body.id) : null;
    try {
        const info = id
            ? db.prepare("UPDATE st_sync_outbox SET statut = 'QUEUED', tentatives = 0, prochaine_tentative = ?, derniere_erreur = NULL WHERE id = ? AND owner_id = ? AND statut = 'ERROR'").run(nowIso(), id, companyId)
            : db.prepare("UPDATE st_sync_outbox SET statut = 'QUEUED', tentatives = 0, prochaine_tentative = ?, derniere_erreur = NULL WHERE owner_id = ? AND statut = 'ERROR'").run(nowIso(), companyId);
        res.json({ reprises: info.changes });
    } catch (error) {
        console.error('Retry store outbox error:', error);
        res.status(500).json({ message: 'Error retrying sync tasks' });
    }
};

/** Bandeau de statut : ce que l'exploitant doit voir sans cliquer. */
export const getStoreStatus = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const storeId = (req.query as any).storeId ? String((req.query as any).storeId) : null;
    try {
        const filtreStore = storeId ? ' AND store_id = ?' : '';
        const argsStore = storeId ? [storeId] : [];

        const boutiques = storeId
            ? db.prepare('SELECT * FROM st_store_config WHERE owner_id = ? AND id = ?').all(companyId, storeId) as any[]
            : db.prepare('SELECT * FROM st_store_config WHERE owner_id = ?').all(companyId) as any[];

        const actives = boutiques.filter(b => Number(b.actif) === 1);
        const enAttente = db.prepare(`SELECT COUNT(*) AS n FROM st_sync_outbox WHERE owner_id = ? AND statut = 'QUEUED'${filtreStore}`).get(companyId, ...argsStore) as any;
        const enErreur = db.prepare(`SELECT COUNT(*) AS n FROM st_sync_outbox WHERE owner_id = ? AND statut = 'ERROR'${filtreStore}`).get(companyId, ...argsStore) as any;
        const modeles = db.prepare(`SELECT COUNT(DISTINCT modelId) AS n FROM st_store_mapping WHERE owner_id = ?${filtreStore}`).get(companyId, ...argsStore) as any;

        // La synchronisation la plus RÉCENTE parmi les boutiques concernées :
        // c'est la seule réponse utile à « est-ce que ça tourne encore ? ».
        const derniere = actives
            .map(b => b.derniere_sync)
            .filter(Boolean)
            .sort()
            .pop() ?? null;

        res.json({
            actif: actives.length > 0,
            derniere_sync: derniere,
            en_attente: Number(enAttente?.n) || 0,
            en_erreur: Number(enErreur?.n) || 0,
            modeles_mappes: Number(modeles?.n) || 0,
        });
    } catch (error) {
        console.error('Get store status error:', error);
        res.status(500).json({ message: 'Error fetching store status' });
    }
};

/** Réexporté pour le worker, qui a besoin du type exact des lignes du pont. */
export type { StoreMappingRow };
