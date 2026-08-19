/**
 * Adaptateur BOUTIQUE MAISON (plateforme = 'CUSTOM').
 *
 * Pour un site e-commerce développé sur mesure — typiquement un site PHP ou
 * Node hébergé chez Hostinger, écrit par un prestataire local. BERAMETHODE ne
 * peut rien deviner d'une telle boutique : il faut un contrat, et le voici.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SPÉCIFICATION À REMETTRE AU DÉVELOPPEUR DE LA BOUTIQUE
 * ═══════════════════════════════════════════════════════════════════════════
 * Quatre routes, une authentification, aucune surprise.
 *
 * Authentification — TOUTES les requêtes portent :
 *     Authorization: Bearer <token>
 * Le token est celui saisi dans BERAMETHODE. Toute requête sans ce header, ou
 * avec un token inconnu, doit répondre 401.
 *
 * 1) GET {url}/api/ping
 *    → 200 { "ok": true, "nom": "Ma Boutique" }
 *    Sert au bouton « Tester la connexion ». Ne modifie rien.
 *
 * 2) GET {url}/api/stock?sku=ABC-RGE-M
 *    → 200 { "sku": "ABC-RGE-M", "quantite": 12 }
 *    SKU inconnu → 404 (et non un 200 avec quantite 0 : « inconnu » et
 *    « épuisé » ne veulent pas dire la même chose côté atelier).
 *
 * 3) POST {url}/api/stock
 *    Corps : { "sku": "ABC-RGE-M", "quantite": 12 }
 *    → 200 { "ok": true }   |   erreur → { "ok": false, "erreur": "…" }
 *
 *    ⚠️ RÈGLE ABSOLUE : `quantite` est une valeur ABSOLUE, jamais un écart.
 *    « quantite: 12 » signifie « après cet appel, il doit rester 12 pièces
 *    vendables », PAS « ajoute 12 ». BERAMETHODE peut rejouer le même appel
 *    plusieurs fois (coupure réseau, réponse perdue) : avec une valeur absolue
 *    le rejeu est sans effet, avec un écart il fausserait le stock à chaque fois.
 *
 * 4) GET {url}/api/orders?since=2026-01-01T00:00:00Z
 *    → 200 {
 *        "commandes": [{
 *          "ref": "CMD-1042",              // référence STABLE et unique
 *          "date": "2026-01-04T10:12:00Z",
 *          "client_nom": "Fatima B.",
 *          "client_email": "f.b@example.ma",
 *          "lignes": [{ "sku": "ABC-RGE-M", "quantite": 2, "prix_unitaire": 180 }]
 *        }],
 *        "cursor": "2026-01-04T10:12:00Z"  // à renvoyer tel quel au prochain appel
 *      }
 *    `ref` doit être STABLE dans le temps : c'est sur elle que BERAMETHODE
 *    garantit de ne pas décompter deux fois la même commande du stock. Une
 *    référence qui change (ou qui se réutilise) ferait sortir des pièces jamais
 *    vendues.
 *    `since` absent → renvoyer les commandes des 30 derniers jours.
 *
 *    PAGINATION (facultative, mais recommandée) : si la réponse contient
 *      "has_next": true
 *    BERAMETHODE rappellera immédiatement la même route avec le `cursor` renvoyé,
 *    jusqu'à `ORDERS_MAX_PAGES` pages par tour. Sans ce champ, une seule page est
 *    lue par tour — c'est le comportement historique, et il reste correct : le
 *    curseur avance, le rattrapage se fait simplement plus lentement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROUTE SUPPLÉMENTAIRE OPTIONNELLE — prix de vente
 * ─────────────────────────────────────────────────────────────────────────────
 * 5) POST {url}/api/price          (facultative)
 *    Corps : { "sku": "ABC-RGE-M", "prix": 180 }
 *    → 200 { "ok": true }   |   erreur → { "ok": false, "erreur": "…" }
 *
 *    ⚠️ Même règle que le stock : `prix` est une valeur ABSOLUE, jamais une
 *    variation. « prix: 180 » signifie « après cet appel, l'article se vend
 *    180 », pas « ajoute 180 ».
 *
 *    Cette route N'EST PAS obligatoire. Une boutique qui ne l'expose pas répond
 *    404, et BERAMETHODE considère alors la tâche comme RÉUSSIE SANS EFFET : la
 *    boutique gère ses prix elle-même, ce n'est pas une panne. La traiter comme
 *    une erreur remplirait la file d'attente de tâches rouges permanentes et
 *    finirait par masquer les vraies pannes de stock.
 *
 * La création de produit n'est PAS au contrat : `publishModel` n'est pas
 * implémenté ici. Sur une boutique maison, les fiches produit (photos, textes,
 * SEO) sont créées à la main et seul le stock est synchronisé.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type {
    StoreAdapter, StoreConfigRow, StoreMappingRow, ExternalOrder, WriteStockResult,
} from './types';
import { StoreAdapterError } from './types';

/** Au-delà, on rend la main à la file d'attente et à son backoff. */
const MAX_RETRIES = 2;
/** Une boutique mutualisée peut être lente ; au-delà elle est considérée en panne. */
const TIMEOUT_MS = 15000;

/**
 * Pages de commandes lues par TOUR de worker (cf. `has_next` dans la
 * spécification). Un plafond identique à celui de Shopify : le rattrapage après
 * une coupure ne doit jamais monopoliser un cycle du worker, sinon le stock
 * cesse d'être poussé pendant que l'on lit l'historique.
 */
const ORDERS_MAX_PAGES = 10;

/** Sentinelle : la boutique ne connaît pas cette route optionnelle (404). */
const NON_IMPLEMENTE = Symbol('route optionnelle absente');

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const normaliseUrl = (raw: string | null): string => {
    let url = String(raw ?? '').trim().replace(/\/+$/, '');
    if (!url) throw new StoreAdapterError('URL de la boutique manquante');
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    return url;
};

export class CustomStoreAdapter implements StoreAdapter {
    private readonly base: string;
    private readonly token: string;

    constructor(config: StoreConfigRow) {
        this.base = normaliseUrl(config.boutique_url);
        this.token = String(config.token ?? '').trim();
    }

    /** Requête HTTP avec timeout et distinction « rejouable / définitif » :
     *  c'est cette distinction qui décide si la file d'attente doit réessayer.
     *  `tolerer404` sert aux routes OPTIONNELLES du contrat : leur absence est
     *  une information, pas une panne. */
    private async call(chemin: string, init: RequestInit = {}, tolerer404 = false): Promise<any> {
        let attempt = 0;
        for (;;) {
            attempt++;
            const controller = new AbortController();
            const minuteur = setTimeout(() => controller.abort(), TIMEOUT_MS);
            let response: Response;
            try {
                response = await fetch(`${this.base}${chemin}`, {
                    ...init,
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
                        ...(init.headers as Record<string, string> | undefined),
                    },
                });
            } catch (e: any) {
                clearTimeout(minuteur);
                if (attempt <= MAX_RETRIES) { await sleep(500 * attempt); continue; }
                throw new StoreAdapterError(`Boutique injoignable : ${e?.name === 'AbortError' ? 'délai dépassé' : (e?.message || e)}`, true);
            }
            clearTimeout(minuteur);

            if (response.status >= 500 || response.status === 429) {
                if (attempt <= MAX_RETRIES) { await sleep(1000 * attempt); continue; }
                throw new StoreAdapterError(`Boutique en erreur (HTTP ${response.status})`, true);
            }
            if (response.status === 401 || response.status === 403) {
                throw new StoreAdapterError('Token refusé par la boutique (401/403)', false);
            }
            if (response.status === 404) {
                if (tolerer404) return NON_IMPLEMENTE;
                throw new StoreAdapterError('Introuvable (HTTP 404)', false);
            }
            if (!response.ok) {
                const texte = await response.text().catch(() => '');
                throw new StoreAdapterError(`HTTP ${response.status} : ${texte.slice(0, 200)}`, false);
            }

            const json = await response.json().catch(() => null);
            if (json === null) throw new StoreAdapterError('Réponse non-JSON de la boutique', false);
            return json;
        }
    }

    async testConnection(): Promise<{ ok: boolean; nom?: string; message?: string }> {
        try {
            const data = await this.call('/api/ping');
            if (data?.ok !== true) return { ok: false, message: 'La boutique n\'a pas répondu « ok: true » sur /api/ping' };
            return { ok: true, nom: data?.nom ? String(data.nom) : undefined, message: 'Connexion établie.' };
        } catch (e: any) {
            return { ok: false, message: e?.message || String(e) };
        }
    }

    async readStock(skus: string[]): Promise<Array<{ sku: string; quantite: number }>> {
        const resultats: Array<{ sku: string; quantite: number }> = [];
        for (const sku of skus.map(s => String(s || '').trim()).filter(Boolean)) {
            try {
                const data = await this.call(`/api/stock?sku=${encodeURIComponent(sku)}`);
                resultats.push({ sku, quantite: Math.max(0, Math.floor(Number(data?.quantite) || 0)) });
            } catch {
                // SKU inconnu de la boutique : on l'omet plutôt que d'inventer un 0,
                // qui laisserait croire à un article épuisé alors qu'il n'existe pas.
            }
        }
        return resultats;
    }

    async writeStock(items: Array<{ mapping: StoreMappingRow; quantite: number }>): Promise<WriteStockResult[]> {
        const resultats: WriteStockResult[] = [];
        for (const it of items) {
            const sku = it.mapping.sku ?? '';
            if (!sku) {
                resultats.push({ sku, ok: false, erreur: 'Cellule sans SKU — générez le mapping avant de synchroniser' });
                continue;
            }
            try {
                // Valeur ABSOLUE (cf. spécification en tête de fichier).
                const data = await this.call('/api/stock', {
                    method: 'POST',
                    body: JSON.stringify({ sku, quantite: Math.max(0, Math.floor(it.quantite)) }),
                });
                if (data?.ok === false) {
                    resultats.push({ sku, ok: false, erreur: String(data?.erreur || 'refus de la boutique') });
                } else {
                    resultats.push({ sku, ok: true });
                }
            } catch (e: any) {
                resultats.push({ sku, ok: false, erreur: e?.message || String(e) });
            }
        }
        return resultats;
    }

    /**
     * Lit les commandes depuis le curseur, en suivant `has_next` tant que la
     * boutique en propose (cf. spécification en tête de fichier), dans la limite
     * de `ORDERS_MAX_PAGES` par tour.
     *
     * Le curseur n'est renvoyé qu'à la fin : si une page intermédiaire échoue,
     * l'exception remonte et le worker NE fait PAS avancer le curseur. Les
     * commandes déjà lues seront relues au tour suivant — sans conséquence,
     * puisque l'enregistrement est idempotent par `ref`.
     */
    async pullOrders(since: string | null): Promise<{ commandes: ExternalOrder[]; cursor: string | null }> {
        const commandes: ExternalOrder[] = [];
        let curseur: string | null = since;

        for (let page = 0; page < ORDERS_MAX_PAGES; page++) {
            const chemin = curseur ? `/api/orders?since=${encodeURIComponent(curseur)}` : '/api/orders';
            const data = await this.call(chemin);

            const lot: ExternalOrder[] = (Array.isArray(data?.commandes) ? data.commandes : [])
                .map((c: any) => ({
                    ref: String(c?.ref ?? '').trim(),
                    date: String(c?.date ?? ''),
                    client_nom: c?.client_nom ? String(c.client_nom) : null,
                    client_email: c?.client_email ? String(c.client_email) : null,
                    lignes: (Array.isArray(c?.lignes) ? c.lignes : [])
                        .map((l: any) => ({
                            sku: String(l?.sku ?? '').trim(),
                            quantite: Math.floor(Number(l?.quantite) || 0),
                            prix_unitaire: Number(l?.prix_unitaire) || 0,
                        }))
                        .filter((l: any) => l.sku && l.quantite > 0),
                }))
                // Une commande sans référence stable ne peut pas être dédoublonnée :
                // l'ignorer vaut mieux que risquer de décompter deux fois le stock.
                .filter((c: ExternalOrder) => c.ref && c.lignes.length > 0);

            commandes.push(...lot);

            const suivant = data?.cursor != null ? String(data.cursor) : null;
            // Boutique qui n'implémente pas la pagination : `has_next` absent →
            // une seule page, comportement historique inchangé. Un curseur qui
            // n'avance pas arrête aussi la boucle : sinon on relirait la même
            // page jusqu'au plafond, pour rien.
            if (data?.has_next !== true || !suivant || suivant === curseur) {
                curseur = suivant ?? curseur;
                break;
            }
            curseur = suivant;
        }

        return { commandes, cursor: curseur };
    }

    /**
     * Pose le PRIX de vente, via la route OPTIONNELLE `POST /api/price`.
     *
     * Une boutique qui n'expose pas cette route répond 404 : la tâche est alors
     * considérée comme réussie sans effet (cf. spécification en tête de fichier).
     * C'est le seul comportement honnête — la boutique gère ses prix elle-même,
     * il n'y a rien à réparer, donc rien à signaler en rouge indéfiniment.
     */
    async pushPrice(items: Array<{ mapping: StoreMappingRow; prix: number }>): Promise<WriteStockResult[]> {
        const resultats: WriteStockResult[] = [];
        for (const it of items) {
            const sku = it.mapping.sku ?? '';
            if (!sku) {
                resultats.push({ sku, ok: false, erreur: 'Cellule sans SKU — générez le mapping avant de synchroniser' });
                continue;
            }
            try {
                // Valeur ABSOLUE, comme le stock : un rejeu repose le même prix.
                const data = await this.call('/api/price', {
                    method: 'POST',
                    body: JSON.stringify({ sku, prix: Math.max(0, Number(it.prix) || 0) }),
                }, true);

                if (data === NON_IMPLEMENTE) { resultats.push({ sku, ok: true }); continue; }
                if (data?.ok === false) {
                    resultats.push({ sku, ok: false, erreur: String(data?.erreur || 'refus de la boutique') });
                } else {
                    resultats.push({ sku, ok: true });
                }
            } catch (e: any) {
                resultats.push({ sku, ok: false, erreur: e?.message || String(e) });
            }
        }
        return resultats;
    }
}
