/**
 * Aller a l'annuaire des tiers avec une recherche deja posee, et pouvoir en
 * revenir exactement d'ou l'on vient.
 *
 * Deux ecrans qui ne se connaissent pas : le detail de l'encours vit dans un
 * panneau, l'annuaire dans un autre onglet. Passer une prop de l'un a l'autre
 * traverserait trois composants etrangers a ce geste.
 *
 * Le passage de main se fait donc par `sessionStorage` et non par une variable
 * de module : changer d'onglet change l'URL, et une navigation peut recharger
 * la page — une variable en memoire disparait alors, et la recherche arrivait
 * vide. Le stockage de session, lui, traverse le rechargement, et se vide a la
 * fermeture de l'onglet.
 */
export const EVENEMENT_TIERS = 'bera:tiers-recherche';
export const EVENEMENT_RETOUR = 'bera:retour-encours';

const CLE_CIBLE = 'bera_tiers_cible';

/** Le champ vise par le clic. Cliquer une VILLE demande « meme ville », pas
 *  « ce mot apparait quelque part » : sans cette precision, « Tanger » ramenait
 *  un client de 5misat dont l'adresse contient « tanger-mers » — un voisin
 *  imaginaire, pire que pas de resultat. */
export type ChampTiers = 'ville' | 'adresse' | 'ice' | 'rc' | 'tel' | 'type' | 'email' | 'cree';

export type CibleTiers = {
    terme: string;
    champ?: ChampTiers;
    /** L'adresse exacte quittee, pour y revenir — pas « la page d'avant » en
     *  general, mais l'onglet et le panneau ouverts a cet instant. */
    origine?: string;
};

const lire = (): CibleTiers | null => {
    try {
        const brut = sessionStorage.getItem(CLE_CIBLE);
        return brut ? JSON.parse(brut) as CibleTiers : null;
    } catch {
        return null;
    }
};

/** Consulte la cible sans la consommer : l'annuaire garde son bandeau de
 *  retour tant qu'on ne l'a pas quitte. */
export const cibleTiers = () => lire();

export const oublierCibleTiers = () => {
    try { sessionStorage.removeItem(CLE_CIBLE); } catch { /* stockage indisponible */ }
};

export const ouvrirTiers = (terme: string, champ?: ChampTiers) => {
    if (!terme) return;
    const cible: CibleTiers = { terme, champ, origine: window.location.hash || undefined };
    try { sessionStorage.setItem(CLE_CIBLE, JSON.stringify(cible)); } catch { /* stockage indisponible */ }
    window.dispatchEvent(new CustomEvent(EVENEMENT_TIERS, { detail: cible }));
};

/**
 * Le chemin du retour.
 *
 * Une navigation qui ne se rembobine pas est un cul-de-sac. On restitue
 * l'adresse exacte quittee quand on la connait — l'onglet ET le panneau —
 * plutot qu'un simple retour au tableau de bord.
 */
export const retourEncours = () => {
    const cible = lire();
    oublierCibleTiers();
    window.dispatchEvent(new CustomEvent(EVENEMENT_RETOUR, { detail: cible }));
    if (cible?.origine) window.location.hash = cible.origine;
};
