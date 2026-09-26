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

/**
 * Plus petite taille acceptable, en fraction de la taille demandee. En dessous
 * le numero ne se lit plus a la table : on le pose quand meme, mais on le dit.
 */
const FACTEUR_MIN = 0.2;
/** Pas de la recherche de taille : 5 % de la taille demandee. */
const PAS_FACTEUR = 0.05;
/** Grille de recherche d'une place ailleurs dans la piece. */
const GRILLE = 11;

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

/**
 * Le rectangle est dans la piece : ses quatre coins, le milieu de ses quatre
 * cotes et son centre. Les coins seuls laissaient passer un numero a cheval
 * sur l'echancrure d'une piece concave (encolure, emmanchure).
 */
function rectangleDansContour(contour: Contour, r: Rectangle): boolean {
    const mx = (r.minX + r.maxX) / 2;
    const my = (r.minY + r.maxY) / 2;
    return (
        pointDansContour(contour, r.minX, r.minY) &&
        pointDansContour(contour, r.maxX, r.minY) &&
        pointDansContour(contour, r.minX, r.maxY) &&
        pointDansContour(contour, r.maxX, r.maxY) &&
        pointDansContour(contour, mx, my) &&
        pointDansContour(contour, mx, r.minY) &&
        pointDansContour(contour, mx, r.maxY) &&
        pointDansContour(contour, r.minX, my) &&
        pointDansContour(contour, r.maxX, my)
    );
}

/** Points d'une grille posee sur la piece, gardes s'ils sont dedans, du plus proche au plus loin du point donne. */
function grilleDansPiece(contour: Contour, versX: number, versY: number): Array<[number, number]> {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of contour.points) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const pts: Array<[number, number]> = [];
    for (let i = 1; i < GRILLE; i++) {
        for (let j = 1; j < GRILLE; j++) {
            const x = minX + ((maxX - minX) * i) / GRILLE;
            const y = minY + ((maxY - minY) * j) / GRILLE;
            if (pointDansContour(contour, x, y)) pts.push([x, y]);
        }
    }
    return pts.sort((a, b) => Math.hypot(a[0] - versX, a[1] - versY) - Math.hypot(b[0] - versX, b[1] - versY));
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
    /**
     * Pose a la main : le numero va exactement au point d'ancrage + ajustement,
     * sans chercher d'autre place. Le statut dit seulement s'il tient dans la piece.
     */
    positionLibre?: boolean;
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

    if (d.positionLibre) {
        const x = e.x + ajX, y = e.y + ajY;
        const tient = !!contour && rectangleDansContour(contour, empriseTexte(x, y, nb, d.largeurCm, d.hauteurCm, e.directionX, unitesParMm, 5));
        return { x, y, hauteurCm: d.hauteurCm, largeurCm: d.largeurCm, statut: tient ? 'ok' : 'force' };
    }

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

    const taille = (f: number) => ({
        hauteurCm: Number((d.hauteurCm * f).toFixed(3)),
        largeurCm: Number((d.largeurCm * f).toFixed(3)),
    });
    /** Le numero de taille `f`, centre en x,y, tient dans la piece (et evite le texte d'origine). */
    const tient = (x: number, y: number, f: number, eviterTexte: boolean) => {
        const t = taille(f);
        const r = empriseTexte(x, y, nb, t.largeurCm, t.hauteurCm, e.directionX, unitesParMm, 5);
        return rectangleDansContour(contour, r) && (!eviterTexte || !seChevauchent(r, empriseOrigine));
    };

    /**
     * Pres du texte d'origine : au-dessous puis au-dessus, de plus en plus loin.
     * L'ecart demande separe les deux textes BORD A BORD. Le mesurer depuis le
     * point vise serait faux : les deux textes sont centres sur le leur, et un
     * chiffre de 3 cm deborderait de moitie sur le nom de la piece.
     */
    const presDuTexte = (f: number): Array<[number, number]> => {
        const base = demiOrigine + (d.hauteurCm * f * 10 * unitesParMm) / 2;
        return [1, 2.2, 3.4].flatMap(k => [
            [e.x + ajX, e.y - sens * (base + jeu * k) + ajY],
            [e.x + ajX, e.y + sens * (base + jeu * k) + ajY],
        ] as Array<[number, number]>);
    };

    // 1. A la taille demandee, pres du texte : la place habituelle.
    const pres = presDuTexte(1);
    for (let i = 0; i < pres.length; i++) {
        const [x, y] = pres[i];
        if (tient(x, y, 1, true)) return { x, y, ...taille(1), statut: i === 0 ? 'ok' : 'deplace' };
    }

    // 2. A la taille demandee, ailleurs dans la piece : un grand numero bien pose
    //    vaut mieux qu'un petit numero colle au texte.
    const grille = grilleDansPiece(contour, e.x, e.y).map(([x, y]) => [x + ajX, y + ajY] as [number, number]);
    for (const [x, y] of grille) {
        if (tient(x, y, 1, true)) return { x, y, ...taille(1), statut: 'deplace' };
    }

    // 3. La plus grande taille qui tienne vraiment, par pas de 5 %, pres du texte d'abord.
    for (let f = 1 - PAS_FACTEUR; f >= FACTEUR_MIN - 1e-9; f -= PAS_FACTEUR) {
        for (const [x, y] of [...presDuTexte(f), ...grille]) {
            if (tient(x, y, f, true)) return { x, y, ...taille(f), statut: 'reduit' };
        }
    }

    // 4. Rien ne tient sans toucher le texte d'origine : lisible vaut mieux qu'absent.
    for (let f = 1; f >= FACTEUR_MIN - 1e-9; f -= PAS_FACTEUR) {
        for (const [x, y] of [...presDuTexte(f), ...grille]) {
            if (tient(x, y, f, false)) return { x, y, ...taille(f), statut: 'reduit' };
        }
    }

    // 5. Rien ne tient : on pose au plus petit, a l'endroit demande, et on le dit.
    return {
        x: e.x + ajX,
        y: e.y + sens * pas + ajY,
        ...taille(FACTEUR_MIN),
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
