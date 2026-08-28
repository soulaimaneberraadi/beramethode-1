/**
 * CONTRAT d'une boutique en ligne.
 *
 * Le reste du serveur (controller, worker) ne connaît QUE cette interface :
 * il ignore si derrière il y a Shopify, WooCommerce ou un site développé sur
 * mesure chez un prestataire. C'est ce qui permet à l'atelier de changer de
 * plateforme sans réécrire la logique de stock — la seule partie qu'il ne faut
 * jamais toucher, parce que c'est celle qui décide combien de pièces sont
 * vendables.
 *
 * ⚠️ QUATRE opérations obligatoires, pas cinq. Chaque opération supplémentaire
 * est une fonctionnalité qu'il faudra réimplémenter pour CHAQUE plateforme. Tout
 * ce qui peut se calculer côté BERAMETHODE reste côté BERAMETHODE. Les deux
 * opérations facultatives (`publishModel`, `pushPrice`) sont déclarées
 * optionnelles justement pour qu'une plateforme puisse ne pas les offrir sans
 * qu'on ait à écrire une implémentation qui ment.
 */

/** Une ligne du pont : la cellule locale et ses identifiants distants. */
export interface StoreMappingRow {
    id: string;
    owner_id: number | string;
    store_id: string;
    modelId: string;
    couleur: string | null;
    taille: string | null;
    sku: string | null;
    external_product_id: string | null;
    external_variant_id: string | null;
    external_inventory_item_id: string | null;
    derniere_qte_poussee: number | null;
    statut: 'OK' | 'PENDING' | 'ERROR' | string;
    derniere_erreur: string | null;
}

/** Configuration d'une boutique telle qu'elle est stockée (`st_store_config`). */
export interface StoreConfigRow {
    id: string;
    owner_id: number | string;
    plateforme: 'SHOPIFY' | 'WOO' | 'CUSTOM' | string;
    nom: string | null;
    boutique_url: string | null;
    /** ⚠️ En clair côté serveur UNIQUEMENT. Jamais renvoyé au navigateur. */
    token: string | null;
    location_id: string | null;
    actif: number;
    marge_securite: number;
    derniere_sync: string | null;
    derniere_erreur: string | null;
    orders_cursor: string | null;
}

/** Commande lue chez la plateforme, réduite à ce dont le stock a besoin. */
export interface ExternalOrder {
    /** Référence stable côté boutique — clé d'idempotence des sorties de stock. */
    ref: string;
    date: string;
    client_nom: string | null;
    client_email: string | null;
    lignes: Array<{ sku: string; quantite: number; prix_unitaire: number }>;
}

/** Résultat, ligne par ligne, d'une écriture de stock distante. */
export interface WriteStockResult {
    sku: string;
    ok: boolean;
    erreur?: string;
}

/** Description d'un produit à créer côté boutique (opération optionnelle). */
export interface PublishInput {
    titre: string;
    /** Une variante par cellule couleur × taille — c'est ainsi que la boutique compte. */
    variantes: Array<{ sku: string; couleur: string | null; taille: string | null; prix: number | null }>;
    /** Identifiant distant déjà connu : on met à jour au lieu de dupliquer. */
    external_product_id?: string | null;
}

export interface PublishResult {
    external_product_id: string;
    variantes: Array<{
        sku: string;
        external_variant_id: string;
        external_inventory_item_id: string | null;
    }>;
}

export interface StoreAdapter {
    /** Vérifie que l'URL et le token répondent. Ne modifie rien. */
    testConnection(): Promise<{ ok: boolean; nom?: string; message?: string }>;

    /** Lit la quantité que la boutique CROIT avoir, pour comparaison / audit. */
    readStock(skus: string[]): Promise<Array<{ sku: string; quantite: number }>>;

    /**
     * Pose la quantité disponible de chaque cellule.
     * ⚠️ Valeur ABSOLUE, jamais un delta (cf. commentaire de `shopify.ts`).
     */
    writeStock(items: Array<{ mapping: StoreMappingRow; quantite: number }>): Promise<WriteStockResult[]>;

    /** Commandes créées depuis le curseur ; renvoie le curseur suivant. */
    pullOrders(since: string | null): Promise<{ commandes: ExternalOrder[]; cursor: string | null }>;

    /**
     * Création / mise à jour du produit et de ses variantes.
     * OPTIONNEL : toutes les plateformes ne l'exposent pas, et beaucoup d'ateliers
     * préfèrent créer leurs fiches produit à la main (photos, descriptions, SEO).
     */
    publishModel?(input: PublishInput): Promise<PublishResult>;

    /**
     * Pose le PRIX DE VENTE des variantes déjà publiées.
     * OPTIONNEL, au même titre que `publishModel` : une boutique maison peut très
     * bien gérer ses prix elle-même.
     *
     * ⚠️ Comme pour le stock, la valeur est ABSOLUE : « le prix vaut 180 », jamais
     * « augmente de 10 ». Un rejeu de la file d'attente doit être inoffensif.
     */
    pushPrice?(items: Array<{ mapping: StoreMappingRow; prix: number }>): Promise<WriteStockResult[]>;
}

/** Erreur d'adaptateur portant l'indication « ça vaut la peine de réessayer ». */
export class StoreAdapterError extends Error {
    /** `true` pour une coupure réseau, un 5xx ou un rate limit : le backoff a du sens. */
    readonly retryable: boolean;
    constructor(message: string, retryable = false) {
        super(message);
        this.name = 'StoreAdapterError';
        this.retryable = retryable;
    }
}
