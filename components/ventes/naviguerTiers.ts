/**
 * Aller a l onglet Tiers avec une recherche deja posee.
 *
 * Le detail de l encours vit dans un panneau, l annuaire dans un autre onglet
 * du meme ecran : passer une prop de l un a l autre traverserait trois
 * composants qui n ont rien a voir avec ce geste. Un evenement suffit — celui
 * qui sait ouvrir l onglet l ecoute, celui qui sait fermer le panneau aussi.
 */
export const EVENEMENT_TIERS = 'bera:tiers-recherche';

/**
 * Le terme survit a l evenement.
 *
 * L annuaire n est pas encore monte quand le clic part : l onglet bascule
 * APRES, et l ecouteur qui devait recevoir le terme n existait pas encore —
 * la recherche restait donc vide. On depose le terme ici, et l annuaire le
 * ramasse a son premier rendu.
 */
let termeEnAttente: string | null = null;

export const prendreTermeEnAttente = () => {
    const t = termeEnAttente;
    termeEnAttente = null;
    return t;
};

export const ouvrirTiers = (terme: string) => {
    if (!terme) return;
    termeEnAttente = terme;
    window.dispatchEvent(new CustomEvent(EVENEMENT_TIERS, { detail: { terme } }));
};

/**
 * Le chemin du retour.
 *
 * Une navigation qui ne se rembobine pas est un cul-de-sac : parti de
 * l'encours vers l'annuaire, il fallait refaire tout le trajet a la main pour
 * revenir. Le meme canal ramene donc a l'ecran d'ou l'on vient.
 */
export const EVENEMENT_RETOUR = 'bera:retour-encours';

export const retourEncours = () => {
    window.dispatchEvent(new CustomEvent(EVENEMENT_RETOUR));
};
