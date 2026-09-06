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

export type SuiviSyncResult = { ok: boolean; skipped?: boolean; error?: unknown };

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
