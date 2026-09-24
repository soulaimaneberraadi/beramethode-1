/**
 * Ou poser le numero d'ordre dans une piece.
 *
 * Le numero doit etre gros — c'est tout son interet, il se lit d'un bout a
 * l'autre de la table. Mais une petite piece (poignet, col, pattes) n'a pas la
 * place : ecrit tel quel, le numero deborde sur la matiere voisine ou recouvre
 * le nom de la piece, et l'atelier perd l'information au lieu d'en gagner.
 *
 * Ce module cherche donc, pour chaque piece, la plus grande taille qui tient
 * vraiment a l'interieur du contour sans toucher au texte d'origine. Il ne
 * decide jamais a la place de l'operateur : il propose, signale ce qu'il a du
 * reduire, et laisse reprendre la main piece par piece.
 */
import type { EtiquetteHpgl, Polyligne } from './hpgl';

export interface Contour {
    points: Array<[number, number]>;
    aire: number;
}

export interface Rectangle {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export type StatutPlacement = 'ok' | 'reduit' | 'deplace' | 'force';

export interface Placement {
    x: number;
    y: number;
    hauteurCm: number;
    largeurCm: number;
    statut: StatutPlacement;
}

/**
 * En HPGL, SI donne la taille du caractere, mais l'avance d'un caractere au
 * suivant vaut une fois et demie sa largeur. Ignorer ce facteur ferait croire
 * qu'un numero tient alors qu'il depasse d'un tiers.
 */
const AVANCE = 1.5;

/** Paliers de reduction essayes avant d'abandonner la taille demandee. */
const PALIERS = [1, 0.85, 0.7, 0.6, 0.5, 0.4, 0.3, 0.22];

const aireSignee = (points: Array<[number, number]>): number => {
    let s = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        s += (points[j][0] * points[i][1]) - (points[i][0] * points[j][1]);
    }
    return s / 2;
};

/**
 * Retient les polylignes refermees sur elles-memes : ce sont les pieces. Le
 * plus grand contour est le bord du tissu, pas une piece — on l'ecarte.
 */
export function contoursDePieces(polylignes: Polyligne[]): Contour[] {
    const fermes: Contour[] = [];
    for (const p of polylignes) {
        const pts = p.points;
        if (pts.length < 4) continue;
        let perimetre = 0;
        for (let k = 1; k < pts.length; k++) {
            perimetre += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        }
        if (perimetre <= 0) continue;
        const ecart = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]);
        if (ecart > perimetre * 0.02) continue;
        fermes.push({ points: pts, aire: Math.abs(aireSignee(pts)) });
    }
    if (fermes.length <= 1) return fermes;
    const maxAire = Math.max(...fermes.map(c => c.aire));
    return fermes.filter(c => c.aire < maxAire);
}

export function pointDansContour(contour: Contour, x: number, y: number): boolean {
    const pts = contour.points;
    let dedans = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
}

/** La piece la plus petite qui contient ce point : une piece peut en chevaucher une autre. */
export function contourContenant(contours: Contour[], x: number, y: number): Contour | null {
    let trouve: Contour | null = null;
    for (const c of contours) {
        if (!pointDansContour(c, x, y)) continue;
        if (!trouve || c.aire < trouve.aire) trouve = c;
    }
    return trouve;
}

/** Les quatre coins du rectangle sont dans la piece — suffisant a cette echelle. */
function rectangleDansContour(contour: Contour, r: Rectangle): boolean {
    return (
        pointDansContour(contour, r.minX, r.minY) &&
        pointDansContour(contour, r.maxX, r.minY) &&
        pointDansContour(contour, r.minX, r.maxY) &&
        pointDansContour(contour, r.maxX, r.maxY) &&
        pointDansContour(contour, (r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2)
    );
}

function seChevauchent(a: Rectangle, b: Rectangle): boolean {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Encombrement d'un texte HPGL, en unites du fichier.
 *
 * `origine` est la valeur LO active : 4,5,6 centrent horizontalement et
 * 2,5,8 verticalement. Les traces de placement ecrivent en LO5 — le point
 * vise est donc le MILIEU du texte, pas son coin. Traiter un LO5 comme un LO1
 * decale l'encombrement d'une demi-longueur et le controle de debordement
 * porte alors a cote de la piece.
 */
export function empriseTexte(
    x: number,
    y: number,
    nbCaracteres: number,
    largeurCm: number,
    hauteurCm: number,
    directionX: number,
    unitesParMm: number,
    origine = 1,
): Rectangle {
    const l = nbCaracteres * largeurCm * AVANCE * 10 * unitesParMm;
    const h = hauteurCm * 10 * unitesParMm;
    const sens = directionX < 0 ? -1 : 1;

    const col = ((origine - 1) % 9) % 3; // 0 gauche, 1 centre, 2 droite
    const rang = Math.floor((((origine - 1) % 9)) / 3); // 0 bas, 1 milieu, 2 haut

    const departX = col === 1 ? x - sens * (l / 2) : col === 2 ? x - sens * l : x;
    const departY = rang === 1 ? y - sens * (h / 2) : rang === 2 ? y - sens * h : y;

    const finX = departX + sens * l;
    const finY = departY + sens * h;

    return {
        minX: Math.min(departX, finX),
        maxX: Math.max(departX, finX),
        minY: Math.min(departY, finY),
        maxY: Math.max(departY, finY),
    };
}

export interface DemandePlacement {
    etiquette: EtiquetteHpgl;
    contour: Contour | null;
    texte: string;
    /** Taille voulue par l'operateur — on n'ira jamais au-dessus. */
    hauteurCm: number;
    largeurCm: number;
    /** Decalage voulu, en millimetres, compte depuis le texte d'origine. */
    decalageMm: number;
    unitesParMm: number;
    /** Decalage supplementaire saisi a la main pour cette piece precise. */
    ajustementXmm?: number;
    ajustementYmm?: number;
}

/**
 * Cherche la meilleure place, en partant de ce qui a ete demande et en cedant
 * le moins possible : d'abord l'autre cote du texte, puis plus loin, et
 * seulement en dernier recours une taille plus petite.
 */
export function placerNumero(d: DemandePlacement): Placement {
    const { etiquette: e, contour, texte, unitesParMm } = d;
    const nb = Math.max(1, texte.length);
    const sens = e.directionX < 0 ? -1 : 1;
    const pas = d.decalageMm * unitesParMm;
    const ajX = (d.ajustementXmm ?? 0) * unitesParMm;
    const ajY = (d.ajustementYmm ?? 0) * unitesParMm;

    // Sans contour identifie on ne peut rien verifier : on pose ou c'etait demande.
    if (!contour) {
        return {
            x: e.x + ajX,
            y: e.y + sens * pas + ajY,
            hauteurCm: d.hauteurCm,
            largeurCm: d.largeurCm,
            statut: 'force',
        };
    }

    const empriseOrigine = empriseTexte(
        e.x, e.y, e.texte.length,
        e.largeurCm ?? 0.4, e.hauteurCm ?? 0.6,
        e.directionX, unitesParMm, e.origine,
    );

    const demiOrigine = ((e.hauteurCm ?? 0.6) * 10 * unitesParMm) / 2;
    const jeu = Math.abs(pas);

    /**
     * L'ecart demande separe les deux textes BORD A BORD. Le mesurer depuis le
     * point vise serait faux : les deux textes sont centres sur le leur, et un
     * chiffre de 3 cm deborderait de moitie sur le nom de la piece.
     */
    const candidatsY = (hNum: number): number[] => {
        const base = demiOrigine + hNum / 2;
        return [
            e.y - sens * (base + jeu),
            e.y + sens * (base + jeu),
            e.y - sens * (base + jeu * 2.2),
            e.y + sens * (base + jeu * 2.2),
            e.y - sens * (base + jeu * 3.4),
            e.y + sens * (base + jeu * 3.4),
        ];
    };

    let repli: Placement | null = null;

    for (const facteur of PALIERS) {
        const hauteurCm = Number((d.hauteurCm * facteur).toFixed(3));
        const largeurCm = Number((d.largeurCm * facteur).toFixed(3));
        // Le numero est injecte en LO5 : x,y est son centre, aligne sur celui
        // du texte d'origine.
        const x = e.x + ajX;
        const hNum = hauteurCm * 10 * unitesParMm;
        const positions = candidatsY(hNum);

        for (let i = 0; i < positions.length; i++) {
            const y = positions[i] + ajY;
            const emprise = empriseTexte(x, y, nb, largeurCm, hauteurCm, e.directionX, unitesParMm, 5);

            if (!rectangleDansContour(contour, emprise)) continue;
            if (seChevauchent(emprise, empriseOrigine)) continue;

            const statut: StatutPlacement = facteur === 1
                ? (i === 0 ? 'ok' : 'deplace')
                : 'reduit';
            return { x, y, hauteurCm, largeurCm, statut };
        }

        // Memorise la plus grande taille qui tient dans la piece, quitte a
        // frôler le texte d'origine : lisible vaut mieux qu'absent.
        if (!repli) {
            for (const brut of positions) {
                const y = brut + ajY;
                const emprise = empriseTexte(x, y, nb, largeurCm, hauteurCm, e.directionX, unitesParMm, 5);
                if (rectangleDansContour(contour, emprise)) {
                    repli = { x, y, hauteurCm, largeurCm, statut: 'reduit' };
                    break;
                }
            }
        }
    }

    if (repli) return repli;

    // Rien ne tient : on pose au plus petit, a l'endroit demande, et on le dit.
    const facteur = PALIERS[PALIERS.length - 1];
    return {
        x: e.x + ajX,
        y: e.y + sens * pas + ajY,
        hauteurCm: Number((d.hauteurCm * facteur).toFixed(3)),
        largeurCm: Number((d.largeurCm * facteur).toFixed(3)),
        statut: 'force',
    };
}

/**
 * Repete le numero dans une meme piece. Sur un dos ou un devant, un seul
 * numero au centre disparait des que le paquet est plie : en poser plusieurs
 * le rend lisible quel que soit le cote visible. Les copies qui ne tiennent
 * pas ne sont pas posees — mieux vaut deux numeros propres que quatre a
 * cheval sur le bord.
 */
export function placerNumeros(d: DemandePlacement, repetitions: number): Placement[] {
    const premier = placerNumero(d);
    const voulu = Math.max(1, Math.floor(repetitions) || 1);
    if (voulu === 1 || !d.contour) return [premier];

    const { etiquette: e, contour, texte, unitesParMm } = d;
    const nb = Math.max(1, texte.length);
    const sens = e.directionX < 0 ? -1 : 1;
    const jeu = Math.abs(d.decalageMm * unitesParMm);
    const hNum = premier.hauteurCm * 10 * unitesParMm;

    const poses: Placement[] = [premier];
    const emprises: Rectangle[] = [
        empriseTexte(premier.x, premier.y, nb, premier.largeurCm, premier.hauteurCm, e.directionX, unitesParMm, 5),
        empriseTexte(e.x, e.y, e.texte.length, e.largeurCm ?? 0.4, e.hauteurCm ?? 0.6, e.directionX, unitesParMm, e.origine),
    ];

    for (let k = 1; k < voulu && poses.length < voulu; k++) {
        const essais = [
            premier.y - sens * (hNum + jeu) * k,
            premier.y + sens * (hNum + jeu) * k,
        ];
        for (const y of essais) {
            const emprise = empriseTexte(premier.x, y, nb, premier.largeurCm, premier.hauteurCm, e.directionX, unitesParMm, 5);
            if (!rectangleDansContour(contour, emprise)) continue;
            if (emprises.some(r => seChevauchent(emprise, r))) continue;
            poses.push({ ...premier, y, statut: premier.statut });
            emprises.push(emprise);
            break;
        }
    }

    return poses;
}
