/**
 * Adaptateur SHOPIFY — GraphQL Admin API.
 *
 * Authentification : header `X-Shopify-Access-Token` avec un token d'application
 * privée (`shpat_…`). Le token ne circule qu'ici, côté serveur.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DÉCISION DE CONCEPTION LA PLUS IMPORTANTE DU FICHIER :
 * ON POSE DES QUANTITÉS ABSOLUES, JAMAIS DES DELTAS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Shopify offre deux mutations d'inventaire :
 *   • `inventoryAdjustQuantities` — « ajoute -3 »  (DELTA)
 *   • `inventorySetQuantities`    — « la quantité vaut 12 » (ABSOLU)
 *
 * Nous utilisons EXCLUSIVEMENT la seconde. Raison :
 * le réseau d'un atelier tombe au milieu d'un appel. Quand la requête part mais
 * que la réponse se perd, Shopify a DÉJÀ appliqué le changement alors que nous
 * croyons l'envoi raté. La file d'attente rejoue alors la tâche :
 *   – avec un delta, « -3 » est compté DEUX fois : il manque 3 pièces en ligne,
 *     personne ne le voit, et l'écart grandit à chaque coupure ;
 *   – avec une valeur absolue, « pose 12 » rejouée pose encore 12. Le rejeu est
 *     INOFFENSIF par construction.
 *
 * C'est aussi ce qui rend la file d'attente sûre : une tâche peut être rejouée
 * autant de fois que nécessaire sans jamais corrompre le stock.
 *
 * `compareQuantity` est renseigné quand nous connaissons la dernière quantité
 * acceptée : Shopify refuse alors l'écriture si quelqu'un a modifié le stock
 * entre-temps. C'est un détecteur de divergence, pas un verrou — le stock de
 * l'atelier reste la source de vérité, donc en cas de conflit nous réécrivons
 * en signalant la divergence plutôt que d'abandonner la vente.
 */

import type {
    StoreAdapter, StoreConfigRow, StoreMappingRow, ExternalOrder,
    WriteStockResult, PublishInput, PublishResult,
} from './types';
import { StoreAdapterError } from './types';

/** Version d'API épinglée. Shopify retire les versions au bout de ~12 mois :
 *  une version figée ici casse bruyamment le jour de la mise à jour, au lieu de
 *  changer de comportement silencieusement sous nos pieds. */
export const SHOPIFY_API_VERSION = '2025-07';

/** Motif d'ajustement exigé par Shopify sur toute écriture d'inventaire. */
const INVENTORY_REASON = 'correction';

/** Nombre maximal de tentatives sur un throttle / 5xx AVANT de rendre la main
 *  à la file d'attente (qui, elle, a son propre backoff plus long). */
const MAX_RETRIES = 3;

/** Shopify limite les recherches par lot ; 40 SKU par requête reste confortable. */
const SKU_BATCH = 40;

/** Commandes lues par page. Shopify plafonne à 250, mais chaque commande porte
 *  ses lignes : 50 garde le coût de la requête sous le seuil de throttle. */
const ORDERS_PAGE_SIZE = 50;

/**
 * Pages de commandes lues par TOUR de worker.
 *
 * Après une longue coupure, des centaines de commandes attendent. Sans plafond,
 * un seul tour monopoliserait le worker (le stock n'est plus poussé pendant ce
 * temps) et épuiserait le quota d'API. Avec ce plafond, le rattrapage se fait en
 * plusieurs tours : le curseur avance à chaque tour, donc rien n'est perdu — et
 * relire une commande est sans effet grâce à l'idempotence par
 * `external_order_ref`. 10 pages = jusqu'à 500 commandes par minute.
 */
const ORDERS_MAX_PAGES = 10;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** `https://xxx.myshopify.com` — on tolère une saisie sans protocole ou avec un
 *  slash final, parce que c'est copié-collé depuis la barre d'adresse. */
const normaliseUrl = (raw: string | null): string => {
    let url = String(raw ?? '').trim().replace(/\/+$/, '');
    if (!url) throw new StoreAdapterError('URL de la boutique Shopify manquante');
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    return url;
};

export class ShopifyAdapter implements StoreAdapter {
    private readonly endpoint: string;
    private readonly token: string;
    private readonly locationId: string | null;

    constructor(private readonly config: StoreConfigRow) {
        this.endpoint = `${normaliseUrl(config.boutique_url)}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
        this.token = String(config.token ?? '').trim();
        this.locationId = config.location_id ? String(config.location_id) : null;
        if (!this.token) throw new StoreAdapterError('Token Shopify manquant');
    }

    /**
     * Appel GraphQL avec gestion des trois familles d'échec de Shopify :
     *   1. erreur HTTP (401 token révoqué, 5xx panne, 429 quota) ;
     *   2. `errors` GraphQL au niveau requête (dont THROTTLED) ;
     *   3. ⚠️ `userErrors` DANS la réponse : Shopify répond 200 OK avec l'échec
     *      métier à l'intérieur. Les ignorer serait le pire bug possible ici —
     *      nous croirions le stock poussé alors que rien n'a bougé.
     * Les `userErrors` sont remontés par chaque appelant, qui sait à quel SKU
     * les rattacher.
     */
    private async gql(query: string, variables: Record<string, any> = {}): Promise<any> {
        let attempt = 0;
        for (;;) {
            attempt++;
            let response: Response;
            try {
                response = await fetch(this.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': this.token,
                    },
                    body: JSON.stringify({ query, variables }),
                });
            } catch (e: any) {
                // Coupure réseau : typiquement l'ADSL de l'atelier. Toujours rejouable.
                if (attempt <= MAX_RETRIES) { await sleep(500 * attempt); continue; }
                throw new StoreAdapterError(`Réseau injoignable : ${e?.message || e}`, true);
            }

            if (response.status === 429 || response.status >= 500) {
                const retryAfter = Number(response.headers.get('Retry-After')) || attempt * 2;
                if (attempt <= MAX_RETRIES) { await sleep(retryAfter * 1000); continue; }
                throw new StoreAdapterError(`Shopify indisponible (HTTP ${response.status})`, true);
            }
            if (response.status === 401 || response.status === 403) {
                // Token révoqué ou droits insuffisants : rejouer n'y changera rien.
                throw new StoreAdapterError('Token Shopify refusé (401/403) — vérifiez les autorisations de l\'application', false);
            }
            if (!response.ok) {
                const texte = await response.text().catch(() => '');
                throw new StoreAdapterError(`Shopify HTTP ${response.status} : ${texte.slice(0, 300)}`, false);
            }

            const json: any = await response.json().catch(() => null);
            if (!json) throw new StoreAdapterError('Réponse Shopify illisible', true);

            if (Array.isArray(json.errors) && json.errors.length > 0) {
                const throttled = json.errors.some((e: any) => e?.extensions?.code === 'THROTTLED');
                if (throttled && attempt <= MAX_RETRIES) {
                    // Le coût de la requête dépasse le seau de jetons : on attend
                    // qu'il se remplisse plutôt que de marteler l'API.
                    await sleep(1000 * attempt);
                    continue;
                }
                const msg = json.errors.map((e: any) => e?.message || '?').join(' | ');
                throw new StoreAdapterError(`GraphQL : ${msg}`, throttled);
            }
            return json.data;
        }
    }

    /** Agrège les `userErrors` d'une charge utile en un message unique lisible. */
    private static userErrors(payload: any): string | null {
        const errs = payload?.userErrors ?? [];
        if (!Array.isArray(errs) || errs.length === 0) return null;
        return errs.map((e: any) => `${(e.field || []).join('.') || 'général'}: ${e.message}`).join(' | ');
    }

    async testConnection(): Promise<{ ok: boolean; nom?: string; message?: string }> {
        try {
            const data = await this.gql('{ shop { name myshopifyDomain } }');
            const nom = data?.shop?.name;
            if (!nom) return { ok: false, message: 'Réponse inattendue de Shopify' };
            // Un emplacement non renseigné n'empêche pas la connexion mais rend
            // toute écriture de stock impossible : le dire MAINTENANT évite de le
            // découvrir au premier échec de synchronisation.
            if (!this.locationId) {
                return { ok: true, nom, message: 'Connexion établie, mais aucun emplacement (location) n\'est configuré : le stock ne pourra pas être poussé.' };
            }
            return { ok: true, nom, message: 'Connexion établie.' };
        } catch (e: any) {
            return { ok: false, message: e?.message || String(e) };
        }
    }

    async readStock(skus: string[]): Promise<Array<{ sku: string; quantite: number }>> {
        const propres = skus.map(s => String(s || '').trim()).filter(Boolean);
        if (propres.length === 0 || !this.locationId) return [];

        const resultats: Array<{ sku: string; quantite: number }> = [];
        for (let i = 0; i < propres.length; i += SKU_BATCH) {
            const lot = propres.slice(i, i + SKU_BATCH);
            // Les SKU sont générés par nous (ASCII, tirets) : pas de guillemet à
            // échapper, mais on filtre tout de même ce qui pourrait casser la
            // syntaxe de recherche Shopify.
            const recherche = lot.map(s => `sku:${JSON.stringify(s)}`).join(' OR ');
            const data = await this.gql(`
                query($q: String!, $loc: ID!) {
                    productVariants(first: ${SKU_BATCH}, query: $q) {
                        nodes {
                            sku
                            inventoryItem {
                                inventoryLevel(locationId: $loc) {
                                    quantities(names: ["available"]) { name quantity }
                                }
                            }
                        }
                    }
                }
            `, { q: recherche, loc: this.locationId });

            for (const node of data?.productVariants?.nodes ?? []) {
                const dispo = (node?.inventoryItem?.inventoryLevel?.quantities ?? [])
                    .find((q: any) => q?.name === 'available');
                resultats.push({ sku: String(node?.sku ?? ''), quantite: Number(dispo?.quantity) || 0 });
            }
        }
        return resultats;
    }

    /**
     * Pose la quantité disponible de chaque cellule (valeur ABSOLUE, cf. en-tête).
     *
     * Deux envois séparés : les cellules dont nous connaissons la dernière
     * quantité poussée partent avec `compareQuantity` (détection de divergence),
     * les autres avec `ignoreCompareQuantity` — le drapeau est global à la
     * mutation, on ne peut donc pas mélanger les deux.
     */
    async writeStock(items: Array<{ mapping: StoreMappingRow; quantite: number }>): Promise<WriteStockResult[]> {
        const resultats: WriteStockResult[] = [];
        if (items.length === 0) return resultats;

        if (!this.locationId) {
            return items.map(it => ({
                sku: it.mapping.sku ?? '',
                ok: false,
                erreur: 'Aucun emplacement (location_id) configuré pour cette boutique',
            }));
        }

        // Une cellule sans `inventory_item_id` n'est reliée à rien : la pousser
        // écrirait dans le vide. On la signale au lieu de la compter comme envoyée.
        const envoyables = items.filter(it => {
            if (!it.mapping.external_inventory_item_id) {
                resultats.push({
                    sku: it.mapping.sku ?? '',
                    ok: false,
                    erreur: 'Cellule non liée à une variante Shopify (inventory_item_id manquant) — republiez ou corrigez le mapping',
                });
                return false;
            }
            return true;
        });
        if (envoyables.length === 0) return resultats;

        const avecCompare = envoyables.filter(it => Number.isFinite(Number(it.mapping.derniere_qte_poussee)) && it.mapping.derniere_qte_poussee !== null);
        const sansCompare = envoyables.filter(it => !avecCompare.includes(it));

        if (sansCompare.length > 0) resultats.push(...await this.setQuantities(sansCompare, false));
        if (avecCompare.length > 0) {
            const r = await this.setQuantities(avecCompare, true);
            // Divergence détectée : quelqu'un a touché au stock côté boutique
            // (vente non encore tirée, correction manuelle). Le stock de l'atelier
            // fait foi, donc on réécrit — mais on GARDE la trace, sinon la
            // divergence resterait invisible et se reproduirait indéfiniment.
            const conflits = r.filter(x => !x.ok && /compare|conflict|stale/i.test(x.erreur || ''));
            if (conflits.length > 0) {
                const aRejouer = envoyables.filter(it => conflits.some(c => c.sku === it.mapping.sku));
                const rejeu = await this.setQuantities(aRejouer, false);
                for (const res of r) {
                    const forcé = rejeu.find(x => x.sku === res.sku);
                    if (forcé && conflits.some(c => c.sku === res.sku)) {
                        resultats.push(forcé.ok
                            ? { sku: res.sku, ok: true, erreur: 'Divergence détectée côté boutique — quantité de l\'atelier réappliquée' }
                            : forcé);
                    } else {
                        resultats.push(res);
                    }
                }
            } else {
                resultats.push(...r);
            }
        }
        return resultats;
    }

    /** Une passe de `inventorySetQuantities`. `ignoreCompare` vaut `true` quand
     *  nous n'avons pas de quantité de référence fiable. */
    private async setQuantities(
        items: Array<{ mapping: StoreMappingRow; quantite: number }>,
        avecCompare: boolean,
    ): Promise<WriteStockResult[]> {
        const quantities = items.map(it => {
            const q: any = {
                inventoryItemId: it.mapping.external_inventory_item_id,
                locationId: this.locationId,
                quantity: Math.max(0, Math.floor(it.quantite)),
            };
            if (avecCompare) q.compareQuantity = Math.max(0, Math.floor(Number(it.mapping.derniere_qte_poussee) || 0));
            return q;
        });

        let data: any;
        try {
            data = await this.gql(`
                mutation($input: InventorySetQuantitiesInput!) {
                    inventorySetQuantities(input: $input) {
                        inventoryAdjustmentGroup { createdAt }
                        userErrors { field message code }
                    }
                }
            `, {
                input: {
                    name: 'available',
                    reason: INVENTORY_REASON,
                    ignoreCompareQuantity: !avecCompare,
                    quantities,
                },
            });
        } catch (e: any) {
            // Échec global : toutes les lignes du lot échouent avec le même motif.
            return items.map(it => ({ sku: it.mapping.sku ?? '', ok: false, erreur: e?.message || String(e) }));
        }

        // ⚠️ Shopify a répondu 200. Sans cette lecture des `userErrors`, on
        // marquerait « envoyé » un lot entièrement rejeté.
        const erreur = ShopifyAdapter.userErrors(data?.inventorySetQuantities);
        if (erreur) return items.map(it => ({ sku: it.mapping.sku ?? '', ok: false, erreur }));

        return items.map(it => ({ sku: it.mapping.sku ?? '', ok: true }));
    }

    /**
     * Commandes créées depuis le curseur. Le curseur est une DATE (ISO) et non
     * un curseur de pagination Shopify : il survit à un redémarrage du serveur et
     * reste lisible par un humain qui débogue.
     *
     * Le curseur renvoyé est la date de la dernière commande lue. On accepte de
     * relire la commande frontière : l'insertion des sorties est idempotente par
     * `external_order_ref`, donc un doublon de lecture ne coûte rien.
     *
     * PAGINATION : à l'intérieur d'un tour, on suit le curseur relais de Shopify
     * (`pageInfo.endCursor`) jusqu'à `ORDERS_MAX_PAGES`. Sans cela, un atelier
     * coupé du réseau pendant une semaine ne rattrapait que 50 commandes par
     * minute et son stock en ligne restait faux pendant des heures. Le curseur
     * relais ne quitte JAMAIS cette méthode : ce qui est persisté reste la date,
     * lisible par un humain et valable après un redémarrage.
     */
    async pullOrders(since: string | null): Promise<{ commandes: ExternalOrder[]; cursor: string | null }> {
        const depuis = since && String(since).trim() ? String(since).trim() : null;
        const filtre = depuis ? `created_at:>='${depuis}'` : 'created_at:>=-30d';

        const commandes: ExternalOrder[] = [];
        let dernier: string | null = depuis;
        let apres: string | null = null;

        for (let page = 0; page < ORDERS_MAX_PAGES; page++) {
            const data: any = await this.gql(`
                query($q: String!, $after: String) {
                    orders(first: ${ORDERS_PAGE_SIZE}, after: $after, query: $q, sortKey: CREATED_AT) {
                        pageInfo { hasNextPage endCursor }
                        nodes {
                            name
                            createdAt
                            email
                            customer { displayName }
                            lineItems(first: 100) {
                                nodes {
                                    quantity
                                    sku
                                    originalUnitPriceSet { shopMoney { amount } }
                                }
                            }
                        }
                    }
                }
            `, { q: filtre, after: apres });

            for (const o of data?.orders?.nodes ?? []) {
                const lignes = (o?.lineItems?.nodes ?? [])
                    .map((l: any) => ({
                        sku: String(l?.sku ?? '').trim(),
                        quantite: Math.floor(Number(l?.quantity) || 0),
                        prix_unitaire: Number(l?.originalUnitPriceSet?.shopMoney?.amount) || 0,
                    }))
                    // Une ligne sans SKU ne peut être rattachée à aucune cellule de
                    // stock : la sortir « au hasard » fausserait la matrice.
                    .filter((l: any) => l.sku && l.quantite > 0);

                if (lignes.length > 0) {
                    commandes.push({
                        ref: String(o?.name ?? ''),
                        date: String(o?.createdAt ?? ''),
                        client_nom: o?.customer?.displayName ?? null,
                        client_email: o?.email ?? null,
                        lignes,
                    });
                }
                if (o?.createdAt && (!dernier || String(o.createdAt) > dernier)) dernier = String(o.createdAt);
            }

            const info = data?.orders?.pageInfo;
            // Sortie sur `hasNextPage` faux OU sur un curseur vide : une réponse
            // dégradée ne doit pas faire tourner la boucle sur la même page.
            if (!info?.hasNextPage || !info?.endCursor || info.endCursor === apres) break;
            apres = String(info.endCursor);
        }

        return { commandes, cursor: dernier };
    }

    /**
     * Crée (ou met à jour) le produit et ses variantes.
     *
     * `productSet` est IDEMPOTENT par nature : appelé avec un `id`, il aligne le
     * produit existant au lieu d'en créer un second. C'est ce qui évite le
     * doublon classique — « le modèle apparaît deux fois sur la boutique » —
     * quand l'opérateur reclique sur Publier.
     *
     * ⚠️ NOMBRE D'OPTIONS VARIABLE. Tous les modèles n'ont pas couleur ET taille :
     * un bonnet peut n'exister qu'en couleurs, un drap qu'en tailles, un article
     * unique ni l'un ni l'autre. Publier une option « — » pour combler le vide
     * produisait une vitrine où le client voit « Taille : — » dans un menu
     * déroulant : un défaut visible PUBLIQUEMENT, sur la boutique du client.
     * On ne déclare donc que les dimensions réellement renseignées, et un produit
     * à variante unique (sans aucune option) quand il n'y en a aucune.
     */
    async publishModel(input: PublishInput): Promise<PublishResult> {
        const valeurs = (champ: 'couleur' | 'taille') =>
            Array.from(new Set(input.variantes.map(v => String(v[champ] ?? '').trim()).filter(Boolean)));
        const couleurs = valeurs('couleur');
        const tailles = valeurs('taille');

        // Une dimension ne compte que si TOUTES les variantes la renseignent :
        // Shopify exige une valeur d'option par variante, une cellule sans
        // couleur dans un produit à option Couleur ferait échouer la mutation.
        const avecCouleur = couleurs.length > 0 && input.variantes.every(v => String(v.couleur ?? '').trim());
        const avecTaille = tailles.length > 0 && input.variantes.every(v => String(v.taille ?? '').trim());

        const productOptions: any[] = [];
        if (avecCouleur) productOptions.push({ name: 'Couleur', values: couleurs.map(c => ({ name: c })) });
        if (avecTaille) productOptions.push({ name: 'Taille', values: tailles.map(t => ({ name: t })) });

        const optionValues = (v: PublishInput['variantes'][number]) => {
            const ov: any[] = [];
            if (avecCouleur) ov.push({ optionName: 'Couleur', name: String(v.couleur).trim() });
            if (avecTaille) ov.push({ optionName: 'Taille', name: String(v.taille).trim() });
            return ov;
        };

        const produit: any = {
            title: input.titre,
            variants: input.variantes.map(v => ({
                // Produit sans aucune option : Shopify crée la variante unique
                // « Default Title » — on n'envoie donc pas de `optionValues`.
                ...(productOptions.length > 0 ? { optionValues: optionValues(v) } : {}),
                price: v.prix != null ? String(v.prix) : undefined,
                // `tracked: true` est indispensable : sans suivi d'inventaire,
                // Shopify accepte les commandes indéfiniment et le stock poussé
                // n'a plus aucun effet sur ce qui est vendable.
                inventoryItem: { sku: v.sku, tracked: true },
            })),
        };
        if (productOptions.length > 0) produit.productOptions = productOptions;
        if (input.external_product_id) produit.id = input.external_product_id;

        const data = await this.gql(`
            mutation($input: ProductSetInput!) {
                productSet(synchronous: true, input: $input) {
                    product {
                        id
                        variants(first: 250) {
                            nodes { id sku inventoryItem { id } }
                        }
                    }
                    userErrors { field message }
                }
            }
        `, { input: produit });

        const erreur = ShopifyAdapter.userErrors(data?.productSet);
        if (erreur) throw new StoreAdapterError(`Publication refusée par Shopify — ${erreur}`, false);

        const produitId = data?.productSet?.product?.id;
        if (!produitId) throw new StoreAdapterError('Shopify n\'a renvoyé aucun produit', false);

        const variantes = (data?.productSet?.product?.variants?.nodes ?? []).map((n: any) => ({
            sku: String(n?.sku ?? ''),
            external_variant_id: String(n?.id ?? ''),
            external_inventory_item_id: n?.inventoryItem?.id ? String(n.inventoryItem.id) : null,
        }));

        // Activer l'inventaire à l'emplacement : une variante non stockée à cet
        // emplacement REFUSE toute écriture de quantité. Best-effort — un échec
        // ici ne doit pas annuler une publication par ailleurs réussie, il sera
        // visible au premier push sous forme d'erreur de mapping.
        if (this.locationId) {
            for (const v of variantes) {
                if (!v.external_inventory_item_id) continue;
                try {
                    await this.gql(`
                        mutation($item: ID!, $loc: ID!) {
                            inventoryActivate(inventoryItemId: $item, locationId: $loc) {
                                userErrors { field message }
                            }
                        }
                    `, { item: v.external_inventory_item_id, loc: this.locationId });
                } catch { /* déjà activé, ou droits manquants : visible au premier push */ }
            }
        }

        return { external_product_id: String(produitId), variantes };
    }

    /**
     * Pose le PRIX de variantes déjà publiées (valeur ABSOLUE, comme le stock :
     * rejouer la tâche repose le même prix, donc le rejeu est inoffensif).
     *
     * `productVariantsBulkUpdate` travaille produit par produit : on regroupe
     * donc les cellules par `external_product_id`. Une cellule sans identifiant
     * de variante ou de produit n'est reliée à rien — on la signale au lieu de la
     * compter comme envoyée, exactement comme pour le stock.
     */
    async pushPrice(items: Array<{ mapping: StoreMappingRow; prix: number }>): Promise<WriteStockResult[]> {
        const resultats: WriteStockResult[] = [];
        const parProduit = new Map<string, Array<{ mapping: StoreMappingRow; prix: number }>>();

        for (const it of items) {
            const sku = it.mapping.sku ?? '';
            if (!it.mapping.external_variant_id || !it.mapping.external_product_id) {
                resultats.push({
                    sku, ok: false,
                    erreur: 'Cellule non liée à une variante Shopify — publiez le modèle avant de pousser son prix',
                });
                continue;
            }
            const cle = String(it.mapping.external_product_id);
            if (!parProduit.has(cle)) parProduit.set(cle, []);
            parProduit.get(cle)!.push(it);
        }

        for (const [produitId, lot] of parProduit) {
            try {
                const data = await this.gql(`
                    mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                            productVariants { id }
                            userErrors { field message }
                        }
                    }
                `, {
                    productId: produitId,
                    variants: lot.map(it => ({
                        id: it.mapping.external_variant_id,
                        price: String(Math.max(0, Number(it.prix) || 0)),
                    })),
                });

                // ⚠️ Shopify répond 200 même quand il refuse : sans cette lecture
                // on marquerait « prix poussé » un lot entièrement rejeté.
                const erreur = ShopifyAdapter.userErrors(data?.productVariantsBulkUpdate);
                if (erreur) {
                    resultats.push(...lot.map(it => ({ sku: it.mapping.sku ?? '', ok: false, erreur })));
                } else {
                    resultats.push(...lot.map(it => ({ sku: it.mapping.sku ?? '', ok: true })));
                }
            } catch (e: any) {
                resultats.push(...lot.map(it => ({ sku: it.mapping.sku ?? '', ok: false, erreur: e?.message || String(e) })));
            }
        }

        return resultats;
    }
}
