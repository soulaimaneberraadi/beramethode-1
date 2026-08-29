/**
 * Aller a l onglet Tiers avec une recherche deja posee.
 *
 * Le detail de l encours vit dans un panneau, l annuaire dans un autre onglet
 * du meme ecran : passer une prop de l un a l autre traverserait trois
 * composants qui n ont rien a voir avec ce geste. Un evenement suffit — celui
 * qui sait ouvrir l onglet l ecoute, celui qui sait fermer le panneau aussi.
 */
export const EVENEMENT_TIERS = 'bera:tiers-recherche';

export const ouvrirTiers = (terme: string) => {
    if (!terme) return;
    window.dispatchEvent(new CustomEvent(EVENEMENT_TIERS, { detail: { terme } }));
};
