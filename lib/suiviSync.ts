/**
 * Ecrivain UNIQUE du suivi de production.
 *
 * Plusieurs ecrans postent l'etat des suivis : la grille (SuiviProduction),
 * l'export/finition (StockExport), l'auto-save d'App.tsx. Ces envois partaient
 * en parallele et pouvaient arriver dans le desordre : une requete partie en
 * premier avec un etat plus ancien ecrasait, en base, une saisie plus recente.
 * Aucune erreur n'etait visible — la donnee revenait simplement en arriere au
 * rechargement suivant.
 *
 * Ici tout passe par une file : un seul POST en vol, dans l'ordre d'emission.
 * Et si plusieurs envois s'empilent pendant qu'une requete est en cours, seul
 * le DERNIER part (les precedents sont deja perimes) — sans jamais reordonner.
 */

import { lsGet, lsSet } from './storageKeys';

export type SuiviSyncResult = { ok: boolean; skipped?: boolean; error?: unknown };

/**
 * L'enveloppe d'un envoi complet, prise pour un suivi.
 *
 * `saveSuivis` poste `{ suivis: [...], full: true }` : le serveur SQLite le lit
 * comme l'etat COMPLET du compte, mais le relais statique du telephone ne
 * connaissait que l'upsert d'un element et rangeait cette enveloppe dans la
 * liste, avec un identifiant tire de l'horloge. Chaque enregistrement ajoutait
 * ainsi un faux suivi contenant une copie de tous les autres.
 *
 * Un vrai suivi n'a jamais de tableau `suivis` : la reconnaissance est sure.
 */
export const estEnveloppeSuivis = (x: unknown): boolean =>
  !!x && typeof x === 'object' && Array.isArray((x as { suivis?: unknown }).suivis);

/**
 * Ecarte du stockage les faux suivis laisses par les versions precedentes.
 *
 * A faire dans LES DEUX modes, et pas seulement la ou le defaut est ne. Un
 * poste relie au serveur local n'a jamais fabrique ces enveloppes, mais il les
 * recoit par la synchronisation cloud — et, s'il ne les nettoie pas, il les
 * renvoie au telephone qui vient de s'en debarrasser. Une seule machine qui
 * garde les copies suffit a les rendre a tout le monde.
 *
 * @returns le nombre de fausses entrees ecartees.
 */
export function purgerFauxSuivis(): number {
  try {
    const brut = lsGet('beramethode_suivis');
    if (!brut) return 0;
    const liste = JSON.parse(brut);
    if (!Array.isArray(liste)) return 0;
    const propres = liste.filter(x => !estEnveloppeSuivis(x));
    if (propres.length === liste.length) return 0;
    lsSet('beramethode_suivis', JSON.stringify(propres));
    return liste.length - propres.length;
  } catch {
    return 0;
  }
}

let chaine: Promise<SuiviSyncResult> = Promise.resolve({ ok: true });
/** Numero d'ordre du dernier envoi demande. */
let dernierNumero = 0;

/**
 * Envoie l'etat complet des suivis au serveur.
 *
 * @param suivis etat COMPLET (le serveur supprime ce qui n'y figure plus).
 * @returns le resultat ; `skipped` quand un envoi plus recent l'a rendu inutile.
 */
export function saveSuivis(suivis: any[]): Promise<SuiviSyncResult> {
    const numero = ++dernierNumero;
    // On fige la reference du tableau : l'appelant peut muter le sien ensuite.
    const charge = Array.isArray(suivis) ? suivis.slice() : [];

    chaine = chaine.then(async () => {
        // Perime : un envoi plus recent attend derriere, inutile de poster celui-ci.
        if (numero !== dernierNumero) return { ok: true, skipped: true };
        try {
            const res = await fetch('/api/suivi', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suivis: charge, full: true }),
            });
            return { ok: res.ok };
        } catch (error) {
            return { ok: false, error };
        }
    });

    return chaine;
}
