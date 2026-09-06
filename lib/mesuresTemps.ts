/**
 * Signal « une mesure de temps vient d'etre enregistree ».
 *
 * Le Catalogue de Temps lit des mesures prises ailleurs (Suivi par poste,
 * seances de Chronometrage). Sans ce signal il fallait quitter la page et y
 * revenir pour les voir : l'ecran qui enregistre previent, le catalogue se
 * rafraichit sur-le-champ.
 */
export const EVT_MESURE_TEMPS = 'beramethode:mesure-temps';

export function signalerMesureTemps(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(EVT_MESURE_TEMPS));
}
