/**
 * Saisie « comme Excel » dans un tableau de champs : fleches, Entree et Tab
 * passent d'une case a l'autre, et un bloc copie depuis Excel (lignes et
 * colonnes separees par retours et tabulations) se colle d'un coup a partir
 * de la case ou l'on est.
 */
import type React from 'react';

export interface CelluleGrille {
    'data-grille': string;
    'data-l': number;
    'data-c': number;
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
}

/**
 * `nom` isole la grille (deux tableaux sur la page ne se melangent pas).
 * `coller(ligne, colonne, bloc)` recoit le bloc colle ; rendre false laisse
 * le navigateur coller normalement (une seule valeur).
 */
export function grilleClavier(nom: string, coller: (ligne: number, colonne: number, bloc: string[][]) => boolean) {
    const aller = (depuis: HTMLElement, l: number, c: number) => {
        const racine = depuis.closest('table') || document;
        const cible = racine.querySelector<HTMLInputElement>(`[data-grille="${nom}"][data-l="${l}"][data-c="${c}"]`);
        if (cible) { cible.focus(); cible.select?.(); return true; }
        return false;
    };

    return (ligne: number, colonne: number): CelluleGrille => ({
        'data-grille': nom,
        'data-l': ligne,
        'data-c': colonne,
        onFocus: e => e.currentTarget.select?.(),
        onKeyDown: e => {
            const el = e.currentTarget;
            const debut = (el.selectionStart ?? 0) === 0 && (el.selectionEnd ?? 0) === 0;
            const fin = (el.selectionStart ?? 0) >= el.value.length;
            const toutSelectionne = (el.selectionStart ?? 0) === 0 && (el.selectionEnd ?? 0) === el.value.length;
            let fait = false;
            if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) fait = aller(el, ligne + 1, colonne);
            else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) fait = aller(el, ligne - 1, colonne);
            else if (e.key === 'ArrowRight' && (fin || toutSelectionne)) fait = aller(el, ligne, colonne + 1);
            else if (e.key === 'ArrowLeft' && (debut || toutSelectionne)) fait = aller(el, ligne, colonne - 1);
            else if (e.key === 'Tab') fait = aller(el, ligne, colonne + (e.shiftKey ? -1 : 1));
            if (fait) e.preventDefault();
            // Les fleches ne doivent pas changer la valeur d'un champ numerique.
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && el.type === 'number') e.preventDefault();
        },
        onPaste: e => {
            const texte = e.clipboardData.getData('text/plain');
            if (!/[\t\n]/.test(texte.trim())) return;
            const bloc = texte.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(r => r.split('\t'));
            if (coller(ligne, colonne, bloc)) e.preventDefault();
        },
    });
}
