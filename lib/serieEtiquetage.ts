/**
 * Serie d'etiquetage : les numeros colles sur les pieces coupees.
 *
 * Chaque matelas du tissu principal donne un paquet par taille et par passage
 * de cette taille dans le trace (« S*2 » : deux paquets de S). Un paquet
 * rassemble toutes les pieces d'une taille sur tous les plis : il recoit une
 * plage de numeros, et la serie continue d'un paquet a l'autre sur tout
 * l'ordre — 1-82, 83-164, 165-246... exactement comme la feuille « SERIE » de
 * l'atelier.
 *
 * Les plages ne se saisissent pas : elles se recalculent des matelas. Un pli
 * de plus ou de moins dans un matelas, et les etiquettes suivent — c'etait la
 * source des erreurs de numeros en salle quand la feuille etait tenue a la main.
 */
import type { MatelasLine, SaisiePaquet, SerieEtiquetage } from '../types';
import { estPrincipal } from './ordreCoupe';

export interface PaquetSerie {
    /** Cle stable des saisies : `${matelasId}:${taille}:${rang}`. */
    cle: string;
    matelasId: string;
    /** N° du paquet = numero d'ordre du matelas (« 77 »). */
    paquet: string;
    plis: number;
    /** Premier et dernier numero de la plage. */
    debut: number;
    fin: number;
    taille: string;
    couleur?: string;
    /** Le matelas est coupe. */
    fait?: boolean;
}

const numeroTri = (l: MatelasLine) => {
    const n = parseInt(String(l.numero ?? ''), 10);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

/** Paquets du tissu principal, dans l'ordre des numeros de matelas, avec leurs plages. */
export function paquetsSerie(lignes: MatelasLine[], tailles: string[], depart = 1): PaquetSerie[] {
    const principales = lignes
        .map((l, rang) => ({ l, rang }))
        .filter(({ l }) => estPrincipal(l) && (Number(l.plis) || 0) > 0 && Object.values(l.ratios || {}).some(v => Number(v) > 0))
        .sort((a, b) => numeroTri(a.l) - numeroTri(b.l) || a.rang - b.rang);

    const out: PaquetSerie[] = [];
    let n = Math.max(1, Math.floor(depart) || 1);
    for (const { l, rang } of principales) {
        const plis = Math.floor(Number(l.plis) || 0);
        for (const taille of tailles) {
            const fois = Math.max(0, Math.floor(Number(l.ratios?.[taille]) || 0));
            for (let k = 0; k < fois; k++) {
                out.push({
                    cle: `${l.id}:${taille}:${k}`,
                    matelasId: l.id,
                    paquet: l.numero || String(rang + 1),
                    plis,
                    debut: n,
                    fin: n + plis - 1,
                    taille,
                    couleur: l.couleur,
                    fait: !!l.fait,
                });
                n += plis;
            }
        }
    }
    return out;
}

/** Les saisies d'un paquet (vide si rien n'a ete note). */
export const saisieDe = (s: SerieEtiquetage | undefined, cle: string): SaisiePaquet => s?.saisies?.[cle] || {};

/** Nombre de pieces de la serie par chaine : ce que chaque chaine a recu. */
export function piecesParChaine(paquets: PaquetSerie[], s: SerieEtiquetage | undefined): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of paquets) {
        const ch = saisieDe(s, p.cle).chaine;
        if (!ch) continue;
        out[ch] = (out[ch] || 0) + p.plis + (Number(saisieDe(s, p.cle).pieces) || 0);
    }
    return out;
}
