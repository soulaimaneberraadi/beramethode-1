import { randomUUID } from 'crypto';
import db from './db';
import { getAdapter } from './storeAdapters';
import type { StoreConfigRow, StoreMappingRow } from './storeAdapters/types';
import { stockLocalParCellule, quantitePoussee, cellKey, prixOnlineModele, publierModele } from './storeSyncController';
import { dechiffrerConfig } from './storeSecrets';
import { findOrCreateClient } from './clientsController';

/**
 * WORKER de synchronisation boutique.
 *
 * Deux passes, à chaque tour :
 *   1. VIDER LA FILE  — pousser vers la boutique les quantités en attente ;
 *   2. TIRER LES COMMANDES — transformer les ventes en ligne en sorties de stock.
 *
 * Il tourne en tâche de fond parce que les deux opérations dépendent d'un réseau
 * qui tombe : les faire pendant la requête HTTP de l'utilisateur reviendrait à
 * bloquer une saisie de stock sur la disponibilité d'internet.
 *
 * ⚠️ Si aucune boutique n'est active, chaque tour se réduit à deux SELECT sur
 * des index : le worker ne coûte rien à un atelier qui ne vend pas en ligne.
 */

/** Intervalle du tour de boucle. Assez court pour que le stock en ligne suive
 *  la journée d'atelier, assez long pour ne jamais approcher les quotas d'API. */
const INTERVALLE_MS = 60_000;

/** Au-delà, la tâche reste en 'ERROR' et attend une reprise MANUELLE.
 *  Elle ne disparaît jamais : une quantité jamais arrivée en ligne doit rester
 *  visible, sinon la boutique vend sur un stock faux sans que personne ne le sache. */
const MAX_TENTATIVES = 6;

/** Backoff exponentiel plafonné : 1, 2, 4, 8, 16, 30 minutes. Marteler une API
 *  en panne la fait répondre plus lentement encore, et épuise le quota. */
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;

/** Tâches traitées par tour : borne le temps passé et le nombre d'appels réseau. */
const LOT_MAX = 20;

const nowIso = () => new Date().toISOString();

const prochaineTentative = (tentatives: number): string => {
    const delai = Math.min(BACKOFF_BASE_MS * Math.pow(2, Math.max(0, tentatives - 1)), BACKOFF_MAX_MS);
    return new Date(Date.now() + delai).toISOString();
};

/** Un seul tour à la fois : un tour lent (réseau très dégradé) ne doit pas se
 *  superposer au suivant et pousser deux fois les mêmes quantités. */
let enCours = false;

// ─────────────────────────────────────────────────────────────────────────────
// PASSE 1 — vider la file d'attente
// ─────────────────────────────────────────────────────────────────────────────

/** Exécute une tâche PUSH_STOCK : pousse les quantités d'UN modèle sur UNE boutique. */
const executerPushStock = async (config: StoreConfigRow, payload: any): Promise<void> => {
    const modelId = String(payload?.modelId ?? '').trim();
    if (!modelId) throw new Error('Tâche PUSH_STOCK sans modelId');

    const mappings = db.prepare(
        'SELECT * FROM st_store_mapping WHERE owner_id = ? AND store_id = ? AND modelId = ?'
    ).all(config.owner_id, config.id, modelId) as StoreMappingRow[];

    const utilisables = mappings.filter(m => m.sku);
    if (utilisables.length === 0) return; // rien à pousser : tâche considérée faite

    const stock = stockLocalParCellule(config.owner_id, modelId);
    const items = utilisables.map(mapping => ({
        mapping,
        // Formule documentée dans `storeSyncController.ts` :
        // max(0, stock_local_cellule − marge_securite).
        quantite: quantitePoussee(stock.get(cellKey(mapping.couleur, mapping.taille)) ?? 0, Number(config.marge_securite) || 0),
    }));

    const resultats = await getAdapter(config).writeStock(items);

    const majOk = db.prepare(
        "UPDATE st_store_mapping SET statut = 'OK', derniere_qte_poussee = ?, derniere_erreur = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?"
    );
    const majErr = db.prepare(
        "UPDATE st_store_mapping SET statut = 'ERROR', derniere_erreur = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?"
    );

    const echecs: string[] = [];
    db.transaction(() => {
        for (const item of items) {
            const r = resultats.find(x => x.sku === item.mapping.sku);
            if (r?.ok) {
                // `derniere_qte_poussee` n'est écrite qu'APRÈS acceptation : c'est
                // la valeur de comparaison du prochain envoi. L'écrire d'avance
                // ferait croire à une variante à jour alors que rien n'est parti.
                majOk.run(item.quantite, item.mapping.id, config.owner_id);
            } else {
                const msg = r?.erreur || 'Aucune réponse de la plateforme pour ce SKU';
                majErr.run(msg, item.mapping.id, config.owner_id);
                echecs.push(`${item.mapping.sku} : ${msg}`);
            }
        }
    })();

    // Un seul SKU en échec fait échouer la tâche entière : elle sera rejouée.
    // Le rejeu repousse aussi les cellules déjà réussies, ce qui est SANS DANGER
    // — les quantités sont absolues (cf. `shopify.ts`), les réappliquer ne change
    // rien. On préfère cette redondance à un suivi partiel forcément faillible.
    if (echecs.length > 0) throw new Error(echecs.slice(0, 5).join(' ; '));
};

/**
 * Exécute une tâche PUSH_PRICE : pousse le prix de vente en ligne d'UN modèle.
 *
 * Le prix vient de `prixOnlineModele` — la MÊME chaîne de résolution que la
 * publication (tarif 'ONLINE' → tarif tous canaux → `ficheData.clientPrice`).
 * Une seconde chaîne de résolution ferait publier un prix et en pousser un autre.
 *
 * ⚠️ Aucun prix décidé (`null`) ⇒ on ne pousse RIEN et la tâche est réussie.
 * Envoyer 0, le coût de revient ou le dernier prix vu mettrait en vitrine un
 * montant que personne n'a choisi — sur une boutique publique, l'erreur est
 * immédiatement monétisée par le premier acheteur.
 *
 * Comme pour le stock, la valeur poussée est ABSOLUE : rejouer la tâche repose
 * le même prix, donc le rejeu est inoffensif.
 */
const executerPushPrice = async (config: StoreConfigRow, payload: any): Promise<void> => {
    const modelId = String(payload?.modelId ?? '').trim();
    if (!modelId) throw new Error('Tâche PUSH_PRICE sans modelId');

    const adapter = getAdapter(config);
    if (!adapter.pushPrice) {
        // La plateforme ne gère pas les prix depuis BERAMETHODE : ce n'est pas une
        // panne, il n'y a rien à réparer. Laisser la tâche en 'ERROR' remplirait
        // le bandeau de rouge permanent et masquerait les vraies pannes de stock.
        console.log(`[storeSync] ${config.nom || config.id} : prix non pris en charge par cette plateforme, tâche sans effet`);
        return;
    }

    const prix = prixOnlineModele(config.owner_id, modelId);
    if (prix == null) {
        console.log(`[storeSync] ${config.nom || config.id} : aucun tarif en ligne pour le modèle ${modelId}, prix non poussé`);
        return;
    }

    const mappings = (db.prepare(
        'SELECT * FROM st_store_mapping WHERE owner_id = ? AND store_id = ? AND modelId = ?'
    ).all(config.owner_id, config.id, modelId) as StoreMappingRow[]).filter(m => m.sku);
    if (mappings.length === 0) return;

    const resultats = await adapter.pushPrice(mappings.map(mapping => ({ mapping, prix })));

    // Le prix n'a pas de colonne de suivi dans le pont : `statut` et
    // `derniere_qte_poussee` décrivent le lien de STOCK et ne doivent pas être
    // réécrits ici, sous peine de faire croire à un stock poussé. Les échecs
    // remontent donc uniquement par l'erreur de la tâche.
    const echecs = mappings
        .map(m => ({ sku: m.sku, r: resultats.find(x => x.sku === m.sku) }))
        .filter(x => !x.r?.ok)
        .map(x => `${x.sku} : ${x.r?.erreur || 'aucune réponse de la plateforme pour ce SKU'}`);

    if (echecs.length > 0) throw new Error(echecs.slice(0, 5).join(' ; '));
};

/**
 * Exécute une tâche PUBLISH : crée (ou met à jour) le produit sur la boutique.
 *
 * Appelle exactement le même code que la route synchrone `POST /api/store/publish`
 * (`publierModele`) : c'est ce qui garantit qu'une publication différée donne la
 * même vitrine qu'une publication immédiate. `publierModele` est IDEMPOTENT —
 * un rejeu met à jour le produit existant au lieu d'en créer un second.
 */
const executerPublish = async (config: StoreConfigRow, payload: any): Promise<void> => {
    const modelId = String(payload?.modelId ?? '').trim();
    if (!modelId) throw new Error('Tâche PUBLISH sans modelId');
    await publierModele(config.owner_id, config.id, modelId);
};

const viderFile = async (): Promise<void> => {
    // Jointure sur la configuration : une tâche visant une boutique désactivée
    // ou supprimée n'est pas tentée — elle attend, plutôt que de consommer ses
    // tentatives contre un mur et de finir en 'ERROR' pour rien.
    const taches = db.prepare(`
        SELECT o.* FROM st_sync_outbox o
        JOIN st_store_config c ON c.id = o.store_id AND c.owner_id = o.owner_id
        WHERE o.statut = 'QUEUED'
          AND c.actif = 1
          AND (o.prochaine_tentative IS NULL OR o.prochaine_tentative <= ?)
        ORDER BY o.created_at ASC
        LIMIT ${LOT_MAX}
    `).all(nowIso()) as any[];

    for (const tache of taches) {
        // ⚠️ `dechiffrerConfig` : le jeton est chiffré au repos. Sans ce passage,
        // l'adaptateur enverrait la chaîne `encv1:…` comme jeton et la boutique
        // répondrait 401 sans qu'on comprenne pourquoi.
        const config = dechiffrerConfig(db.prepare('SELECT * FROM st_store_config WHERE id = ? AND owner_id = ?')
            .get(tache.store_id, tache.owner_id) as StoreConfigRow | undefined);
        if (!config) continue;

        const tentatives = Number(tache.tentatives) + 1;
        try {
            const payload = tache.payload ? JSON.parse(tache.payload) : {};
            switch (tache.type) {
                case 'PUSH_STOCK':
                    await executerPushStock(config, payload);
                    break;
                case 'PUSH_PRICE':
                    await executerPushPrice(config, payload);
                    break;
                case 'PUBLISH':
                    await executerPublish(config, payload);
                    break;
                default:
                    // Un type inconnu ne doit JAMAIS passer en 'SENT' : ce serait
                    // affirmer un envoi qui n'a pas eu lieu.
                    throw new Error(`Type de tâche non pris en charge par le worker : ${tache.type}`);
            }

            db.prepare("UPDATE st_sync_outbox SET statut = 'SENT', tentatives = ?, sent_at = ?, derniere_erreur = NULL WHERE id = ?")
                .run(tentatives, nowIso(), tache.id);
            db.prepare('UPDATE st_store_config SET derniere_sync = ?, derniere_erreur = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?')
                .run(nowIso(), config.id, config.owner_id);
        } catch (e: any) {
            const message = String(e?.message || e).slice(0, 500);
            const epuisee = tentatives >= MAX_TENTATIVES;
            db.prepare(`
                UPDATE st_sync_outbox
                SET statut = ?, tentatives = ?, prochaine_tentative = ?, derniere_erreur = ?
                WHERE id = ?
            `).run(
                epuisee ? 'ERROR' : 'QUEUED',
                tentatives,
                epuisee ? null : prochaineTentative(tentatives),
                message,
                tache.id,
            );
            db.prepare('UPDATE st_store_config SET derniere_erreur = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?')
                .run(message, config.id, config.owner_id);
            console.warn(`[storeSync] tâche ${tache.type} ${tache.id} en échec (${tentatives}/${MAX_TENTATIVES}) : ${message}`);
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PASSE 2 — tirer les commandes en ligne
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforme UNE commande en ligne en sorties de stock.
 *
 * ⚠️ IDEMPOTENCE — la garantie la plus importante de tout ce fichier.
 * Avant toute écriture, on vérifie qu'aucune sortie ne porte déjà
 * `external_order_ref = ref`. La vérification ET l'insertion sont dans la MÊME
 * transaction : un contrôle hors transaction laisserait passer un doublon si
 * deux tours se chevauchaient. Un doublon ici retirerait du stock qui n'a jamais
 * été vendu — le magasin croirait avoir moins de pièces qu'il n'en a, et
 * refuserait des ventes réelles.
 *
 * Note : on ne REFUSE jamais une sortie pour stock insuffisant. La vente en
 * ligne a DÉJÀ eu lieu ; la nier ne la fait pas disparaître, elle rendrait
 * seulement le stock faux. Un stock négatif est un signal visible, pas un bug.
 *
 * @returns nombre de lignes réellement écrites (0 si la commande était déjà connue)
 */
const enregistrerCommande = (config: StoreConfigRow, commande: any): number => {
    const ref = String(commande?.ref ?? '').trim();
    if (!ref) return 0;

    // Résolution SKU → cellule locale, hors transaction (lecture seule).
    const lignes: Array<{ modelId: string; couleur: string | null; taille: string | null; quantite: number; prix: number }> = [];
    for (const l of commande.lignes ?? []) {
        const mapping = db.prepare('SELECT * FROM st_store_mapping WHERE owner_id = ? AND store_id = ? AND sku = ?')
            .get(config.owner_id, config.id, String(l.sku)) as any;
        if (!mapping) {
            // SKU vendu en ligne mais inconnu du pont : décider « au hasard » de
            // quel modèle décompter serait pire que de ne rien faire.
            console.warn(`[storeSync] commande ${ref} : SKU inconnu « ${l.sku} », ligne ignorée`);
            continue;
        }
        lignes.push({
            modelId: mapping.modelId,
            couleur: mapping.couleur,
            taille: mapping.taille,
            quantite: Math.floor(Number(l.quantite) || 0),
            prix: Number(l.prix_unitaire) || 0,
        });
    }
    if (lignes.length === 0) return 0;

    // Le client vient AVANT la transaction d'écriture : une vente en ligne doit
    // nourrir les mêmes statistiques (CA, fiche client, historique) qu'une vente
    // au comptoir, sinon la moitié du chiffre d'affaires devient invisible.
    const client = findOrCreateClient(config.owner_id, {
        nom: commande.client_nom || commande.client_email || `Client en ligne ${ref}`,
        email: commande.client_email ?? null,
        type: 'DETAIL',
    });

    const batchId = randomUUID();
    const date = String(commande.date ?? '').slice(0, 10) || nowIso().slice(0, 10);
    const insert = db.prepare(`
        INSERT INTO st_stock_sorties
            (id, owner_id, modelId, client_id, client_nom, couleur, taille, quantite, prix_unitaire, batch_id, note, date_sortie, canal, external_order_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ONLINE', ?)
    `);

    let ecrites = 0;
    db.transaction(() => {
        const deja = db.prepare('SELECT id FROM st_stock_sorties WHERE owner_id = ? AND external_order_ref = ? LIMIT 1')
            .get(config.owner_id, ref) as any;
        if (deja) return; // commande déjà enregistrée : on ne touche à rien

        for (const l of lignes) {
            insert.run(
                randomUUID(), config.owner_id, l.modelId,
                client?.id ?? null, client?.nom ?? commande.client_nom ?? null,
                l.couleur, l.taille, l.quantite, l.prix, batchId,
                `Commande en ligne ${ref}${config.nom ? ` (${config.nom})` : ''}`,
                date, ref,
            );
            ecrites++;
        }
    })();

    return ecrites;
};

const tirerCommandes = async (): Promise<void> => {
    // Jeton déchiffré en mémoire uniquement (cf. `storeSecrets.ts`).
    const boutiques = (db.prepare('SELECT * FROM st_store_config WHERE actif = 1').all() as StoreConfigRow[])
        .map(b => dechiffrerConfig(b)!)
        .filter(Boolean);
    if (boutiques.length === 0) return;

    for (const config of boutiques) {
        try {
            const { commandes, cursor } = await getAdapter(config).pullOrders(config.orders_cursor);

            let total = 0;
            for (const commande of commandes) total += enregistrerCommande(config, commande);

            // Le curseur n'avance qu'après un traitement complet et sans exception :
            // l'avancer trop tôt ferait sauter définitivement des commandes, donc
            // des pièces sorties du stock en ligne mais jamais décomptées ici.
            db.prepare('UPDATE st_store_config SET orders_cursor = ?, derniere_sync = ?, derniere_erreur = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?')
                .run(cursor ?? config.orders_cursor, nowIso(), config.id, config.owner_id);

            if (total > 0) {
                console.log(`[storeSync] ${config.nom || config.id} : ${total} ligne(s) de vente en ligne enregistrée(s)`);
                // Une vente en ligne change le stock : il faut le repousser, sinon
                // la boutique continuerait d'afficher l'ancienne quantité.
                const modeles = db.prepare('SELECT DISTINCT modelId FROM st_store_mapping WHERE owner_id = ? AND store_id = ?')
                    .all(config.owner_id, config.id) as any[];
                const enfiler = db.prepare(`
                    INSERT INTO st_sync_outbox (id, owner_id, store_id, type, payload, statut, tentatives, prochaine_tentative)
                    VALUES (?, ?, ?, 'PUSH_STOCK', ?, 'QUEUED', 0, ?)
                `);
                db.transaction(() => {
                    for (const m of modeles) {
                        enfiler.run(randomUUID(), config.owner_id, config.id, JSON.stringify({ modelId: String(m.modelId) }), nowIso());
                    }
                })();
            }
        } catch (e: any) {
            const message = String(e?.message || e).slice(0, 500);
            db.prepare('UPDATE st_store_config SET derniere_erreur = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?')
                .run(message, config.id, config.owner_id);
            console.warn(`[storeSync] lecture des commandes impossible (${config.nom || config.id}) : ${message}`);
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────

const tour = async (): Promise<void> => {
    if (enCours) return;
    enCours = true;
    try {
        await viderFile();
        await tirerCommandes();
    } catch (e) {
        // Filet de dernier recours : le worker ne doit jamais faire tomber le
        // processus serveur. Une synchronisation ratée est un incident, pas une
        // panne d'ERP.
        console.error('[storeSync] tour interrompu :', e);
    } finally {
        enCours = false;
    }
};

/**
 * Démarre la boucle. Appelé depuis `server.ts` ; tout échec est journalisé et
 * absorbé — le serveur doit démarrer même si la couche boutique est cassée.
 */
export const startStoreSyncWorker = (): void => {
    try {
        const timer = setInterval(() => { void tour(); }, INTERVALLE_MS);
        // `unref` : ce minuteur ne doit pas maintenir le processus en vie à lui
        // seul (arrêt propre du serveur, tests, mode Electron).
        timer.unref?.();
        console.log(`  └─ Sync boutique : worker actif (toutes les ${INTERVALLE_MS / 1000}s)`);
    } catch (e) {
        console.error('[storeSync] démarrage du worker impossible :', e);
    }
};
