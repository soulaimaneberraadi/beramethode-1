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
 * Union par `id` : la version du STOCKAGE gagne en cas de conflit (elle sort de
 * la fusion cloud, qui a déjà tranché par horodatage), mais tout ce que seul
 * l'état en mémoire connaît est conservé.
 */
export function fusionnerParId<T extends AvecId>(enMemoire: T[], duStockage: T[], type?: string): T[] {
    if (!Array.isArray(duStockage)) return enMemoire;
    if (!Array.isArray(enMemoire) || enMemoire.length === 0) return duStockage;

    const connus = new Set(duStockage.map(x => (x && x.id != null ? String(x.id) : null)).filter(Boolean));
    const supprimes = type ? idsSupprimes(type) : null;
    const seulementEnMemoire = enMemoire.filter(x => {
        if (!x || x.id == null) return false;   // sans id, impossible de dédoublonner
        const id = String(x.id);
        if (connus.has(id)) return false;
        return !(supprimes && supprimes.has(id));
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
