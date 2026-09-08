/**
 * Relecture du stockage local APRÈS une fusion cloud, sans rien perdre.
 *
 * En mode statique (Vercel), `localStorage` est la source de vérité et
 * l'application se relit entièrement à chaque événement
 * `beramethode:cloud-sync-applied`. Cette relecture REMPLAÇAIT l'état React :
 *
 *  • une liste absente du stockage (clé lue sous une autre portée de compte,
 *    écriture refusée faute de place) vidait l'écran — « les modèles ont
 *    disparu » ;
 *  • un élément qui n'existait ENCORE que dans l'état React (modèle créé il y a
 *    deux secondes, dont l'écriture passe par IndexedDB donc de façon
 *    asynchrone) était effacé par la relecture.
 *
 * Ces deux fonctions appliquent la même règle que la fusion cloud : on ne
 * supprime jamais par relecture. Les suppressions passent par une action
 * explicite de l'utilisateur.
 */

import { lsGet } from './storageKeys';

type AvecId = { id?: string | number };

/** Doit rester alignée sur `TOMBSTONE_KEEP_MS` (`apiShim.ts`, `cloudSync.ts`). */
const TOMBSTONE_KEEP_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Identifiants supprimés EXPLICITEMENT par l'utilisateur, ici ou sur un autre
 * appareil (les pierres tombales font partie des clés synchronisées).
 *
 * Sans ce filtre, l'union ci-dessous ferait revenir un élément supprimé
 * ailleurs : le pull l'a bien retiré du stockage, mais l'état React de CET
 * appareil le porte encore, et on le réinstallerait.
 *
 * @param type 'models' | 'planning' | 'suivi' | 'demandes-appro' (cf. `CLE_VERS_TYPE`).
 */
export function idsSupprimes(type: string): Set<string> {
    const ids = new Set<string>();
    try {
        const raw = lsGet('beramethode_tombstones');
        const ts = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(ts)) return ids;
        const now = Date.now();
        for (const t of ts) {
            if (!t || t.type !== type) continue;
            const d = new Date(t.deleted_at).getTime();
            if (!d || now - d >= TOMBSTONE_KEEP_MS) continue;
            ids.add(String(t.id));
        }
    } catch { /* illisible : aucune suppression opposable */ }
    return ids;
}

/**
 * Identité d'un élément. Un élément SANS `id` est reconnu par son contenu :
 * le rejeter — ce que faisait la première version — revenait à jeter très
 * exactement les lignes anciennes que le reste de ce correctif s'emploie à
 * garder.
 */
function identite(x: AvecId): string {
    if (x && x.id != null && x.id !== '') return `id:${String(x.id)}`;
    try { return `sig:${JSON.stringify(x)}`; } catch { return `sig:${String(x)}`; }
}

/**
 * Union : la version du STOCKAGE gagne en cas de conflit (elle sort de la fusion
 * cloud, qui a déjà tranché par horodatage), mais tout ce que seul l'état en
 * mémoire connaît est conservé.
 */
export function fusionnerParId<T extends AvecId>(enMemoire: T[], duStockage: T[], type?: string): T[] {
    if (!Array.isArray(duStockage)) return enMemoire;
    if (!Array.isArray(enMemoire) || enMemoire.length === 0) return duStockage;

    const connus = new Set(duStockage.map(identite));
    const supprimes = type ? idsSupprimes(type) : null;
    const seulementEnMemoire = enMemoire.filter(x => {
        if (!x) return false;
        if (connus.has(identite(x))) return false;
        // Supprimé explicitement (ici ou sur un autre appareil) : ne pas le réinstaller.
        return !(supprimes && x.id != null && supprimes.has(String(x.id)));
    });

    return seulementEnMemoire.length > 0 ? [...duStockage, ...seulementEnMemoire] : duStockage;
}

/**
 * Relecture non destructrice : une lecture vide ou illisible laisse l'état
 * courant intact au lieu de le remplacer par une liste vide.
 */
export function relireSansPerdre<T extends AvecId>(brut: string | null, enMemoire: T[], type?: string): T[] | null {
    if (brut == null) return null;                   // rien en stockage → on garde l'état
    try {
        const lu = JSON.parse(brut);
        if (!Array.isArray(lu)) return null;
        if (lu.length === 0 && enMemoire.length > 0) return null;   // ne jamais vider par relecture
        return fusionnerParId(enMemoire, lu, type);
    } catch {
        return null;
    }
}

/**
 * Relecture SERVEUR de la bibliothèque, sans rien perdre.
 *
 * `GET /api/models` remplaçait l'état entier (`setModels(data)`), et cette
 * lecture se rejoue à CHAQUE `focus` de la fenêtre — donc en permanence sur
 * téléphone, où l'on quitte et revient sans cesse. Deux pertes en découlaient,
 * toutes deux vécues comme « ça disparaît » :
 *
 *  • un modèle que seul cet appareil connaît encore (créé il y a deux secondes,
 *    ou dont l'enregistrement est encore en vol) était effacé de l'écran ;
 *  • une lecture PARTIE AVANT une écriture pouvait revenir APRÈS elle et
 *    réinstaller la version d'avant : les postes qu'on venait d'ajouter au
 *    relevé s'effaçaient tout seuls quelques secondes plus tard.
 *
 * On unit donc les deux listes au lieu de remplacer : à identifiant égal, la
 * version la plus fraîche (`updatedAt`) gagne — c'est elle qui porte le
 * travail le plus récent, d'où qu'il vienne. Ce que seule la mémoire connaît
 * est conservé, sauf ce que l'utilisateur a explicitement supprimé.
 */
export function fusionnerModelesServeur<T extends AvecId & { updatedAt?: string }>(
    enMemoire: T[],
    duServeur: T[],
): T[] {
    if (!Array.isArray(duServeur)) return enMemoire;
    if (!Array.isArray(enMemoire) || enMemoire.length === 0) return duServeur;

    const supprimes = idsSupprimes('models');
    const dateDe = (x: T): number => Date.parse(x?.updatedAt || '') || 0;

    const restants = new Map<string, T>();
    for (const m of enMemoire) if (m && m.id != null) restants.set(String(m.id), m);

    const sortie: T[] = [];
    for (const distant of duServeur) {
        if (!distant) continue;
        const cle = distant.id != null ? String(distant.id) : '';
        if (cle && supprimes.has(cle)) continue;
        const local = cle ? restants.get(cle) : undefined;
        if (cle) restants.delete(cle);
        // A egalite d'horodatage on garde le serveur : sans preuve qu'on est plus
        // frais, la source partagee fait foi.
        sortie.push(local && dateDe(local) > dateDe(distant) ? local : distant);
    }
    for (const seulEnMemoire of restants.values()) {
        if (seulEnMemoire.id != null && supprimes.has(String(seulEnMemoire.id))) continue;
        sortie.push(seulEnMemoire);
    }
    return sortie;
}
