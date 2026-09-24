/**
 * Lecture et annotation des traces de coupe (.plt / HPGL).
 *
 * Le client envoie un trace deja fini. On n'a pas le droit de le redessiner :
 * une piece deplacee d'un millimetre, c'est un matelas entier perdu. Tout ce
 * module est donc construit autour d'une seule regle — on LIT la geometrie,
 * on n'y TOUCHE jamais. L'annotation est ajoutee en bloc, a la fin, et les
 * octets d'origine ressortent identiques (voir `injecterEtiquettes`).
 */

/** Terminateur de label par defaut en HPGL (ETX). Modifiable par la commande DT. */
const ETX = '\x03';

/** 1 unite tracante = 0,025 mm. Sert a convertir vers les millimetres. */
export const UNITES_PAR_MM = 40;

export interface EtiquetteHpgl {
    /** Index du 'L' de la commande LB dans la source. */
    debut: number;
    /** Index juste apres le terminateur. */
    fin: number;
    /** Texte ecrit, terminateur exclu. */
    texte: string;
    /** Position du crayon au moment de l'ecriture, en unites tracantes. */
    x: number;
    y: number;
    /** Taille de caractere active (SI, en cm) si elle a ete declaree. */
    largeurCm: number | null;
    hauteurCm: number | null;
    /**
     * Direction d'ecriture active (DI). Une piece posee retournee dans le
     * placement porte un texte a -1,0 : le numero ajoute doit suivre la meme
     * orientation, sinon il sort a l'envers par rapport au reste de la piece.
     */
    directionX: number;
    directionY: number;
    /**
     * Plume active (SP). Le traceur associe un outil et une vitesse a chaque
     * plume : ecrire le numero avec une autre plume que le texte d'origine et
     * la machine ne le traite plus comme du marquage.
     */
    plume: number;
    /**
     * Origine du texte (LO). Les traces de placement ecrivent en LO5, c'est-a-dire
     * CENTRE sur le point vise — pas cale en bas a gauche comme le defaut LO1.
     * Confondre les deux decale chaque mesure d'une demi-longueur de texte, et
     * l'encombrement calcule tombe a cote de la piece.
     */
    origine: number;
}

export interface Polyligne {
    points: Array<[number, number]>;
}

export interface CadreHpgl {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface LectureHpgl {
    etiquettes: EtiquetteHpgl[];
    polylignes: Polyligne[];
    cadre: CadreHpgl;
    /**
     * Combien d'unites du fichier valent un millimetre reel. Les traces de
     * placement declarent presque toujours une echelle (IP + SC), donc les
     * coordonnees ne sont PAS des unites tracantes : sans cette conversion,
     * un decalage demande en millimetres tomberait 39 fois trop court.
     */
    unitesParMm: number;
}

const estLettre = (c: string) => c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z';
const estChiffreOuSep = (c: string) =>
    (c >= '0' && c <= '9') || c === '-' || c === '+' || c === '.' || c === ',' || c === ' ' || c === '\t' || c === '\r' || c === '\n';

/** Les sequences d'echappement pilotent l'imprimante, pas le dessin : on les saute. */
function sauterEchappement(source: string, i: number): number {
    let j = i + 1;
    if (source[j] === '.') {
        j++;
        // Une sequence ESC. se termine au premier ':' ou a la premiere lettre de commande.
        while (j < source.length && source[j] !== ':' && !estLettre(source[j])) j++;
        return Math.min(source.length, j + 1);
    }
    return Math.min(source.length, j + 1);
}

function lireParametres(source: string, depart: number): { valeurs: number[]; suite: number } {
    let j = depart;
    let brut = '';
    while (j < source.length) {
        const c = source[j];
        if (c === ';') { j++; break; }
        if (c === '\x1b' || estLettre(c)) break;
        if (!estChiffreOuSep(c)) { j++; continue; }
        brut += c;
        j++;
    }
    const valeurs = brut
        .split(',')
        .map(v => v.trim())
        .filter(v => v !== '')
        .map(Number)
        .filter(v => Number.isFinite(v));
    return { valeurs, suite: j };
}

/**
 * Parcourt le fichier et restitue les labels (avec leur position reelle) et
 * les polylignes tracees. La position d'un label depend de tout ce qui
 * precede : il faut rejouer PA/PR/PU/PD pour savoir ou le crayon se trouvait.
 */
export function lireHpgl(source: string): LectureHpgl {
    const etiquettes: EtiquetteHpgl[] = [];
    const polylignes: Polyligne[] = [];

    let terminateur = ETX;
    let x = 0;
    let y = 0;
    let absolu = true;
    let crayonBas = false;
    let largeurCm: number | null = null;
    let hauteurCm: number | null = null;
    let directionX = 1;
    let directionY = 0;
    let courante: Array<[number, number]> | null = null;
    let ip: number[] | null = null;
    let sc: number[] | null = null;
    let plume = 1;
    let origine = 1;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const noter = (px: number, py: number) => {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
    };

    const fermerPolyligne = () => {
        if (courante && courante.length > 1) polylignes.push({ points: courante });
        courante = null;
    };

    const deplacer = (valeurs: number[]) => {
        for (let k = 0; k + 1 < valeurs.length; k += 2) {
            const nx = absolu ? valeurs[k] : x + valeurs[k];
            const ny = absolu ? valeurs[k + 1] : y + valeurs[k + 1];
            if (crayonBas) {
                if (!courante) courante = [[x, y]];
                courante.push([nx, ny]);
                noter(x, y);
                noter(nx, ny);
            }
            x = nx;
            y = ny;
        }
    };

    let i = 0;
    const n = source.length;

    while (i < n) {
        const c = source[i];
        if (c === '\x1b') { i = sauterEchappement(source, i); continue; }
        if (!estLettre(c)) { i++; continue; }
        if (i + 1 >= n || !estLettre(source[i + 1])) { i++; continue; }

        const mnemo = (source[i] + source[i + 1]).toUpperCase();

        if (mnemo === 'LB') {
            const debut = i;
            let j = i + 2;
            let texte = '';
            while (j < n && source[j] !== terminateur) { texte += source[j]; j++; }
            // Le cadre ne retient que la geometrie tracee : les lignes
            // d'en-tete du placement sont ecrites hors matiere, et les inclure
            // ferait passer le bord du tissu au-dessus de sa laize reelle.
            etiquettes.push({
                debut,
                fin: j < n ? j + 1 : n,
                texte,
                x,
                y,
                largeurCm,
                hauteurCm,
                directionX,
                directionY,
                plume,
                origine,
            });
            i = j < n ? j + 1 : n;
            continue;
        }

        // DT prend un caractere litteral, pas un nombre : il doit passer avant
        // la lecture generique, sinon le terminateur est avale comme parametre.
        if (mnemo === 'DT') {
            const brut = source[i + 2];
            if (brut !== undefined && brut !== ';') terminateur = brut;
            let j = i + 2;
            while (j < n && source[j] !== ';' && !estLettre(source[j])) j++;
            i = source[j] === ';' ? j + 1 : j;
            continue;
        }

        const { valeurs, suite } = lireParametres(source, i + 2);
        i = suite;

        switch (mnemo) {
            case 'PA':
                absolu = true;
                deplacer(valeurs);
                break;
            case 'PR':
                absolu = false;
                deplacer(valeurs);
                break;
            case 'PU':
                fermerPolyligne();
                crayonBas = false;
                deplacer(valeurs);
                break;
            case 'PD':
                crayonBas = true;
                deplacer(valeurs);
                break;
            case 'SI':
                largeurCm = valeurs[0] ?? largeurCm;
                hauteurCm = valeurs[1] ?? hauteurCm;
                break;
            case 'DI':
                directionX = valeurs[0] ?? 1;
                directionY = valeurs[1] ?? 0;
                break;
            case 'SP':
                if (valeurs.length >= 1 && valeurs[0] > 0) plume = valeurs[0];
                break;
            case 'LO':
                origine = valeurs[0] ?? 1;
                break;
            case 'IP':
                if (valeurs.length >= 4) ip = valeurs;
                break;
            case 'SC':
                sc = valeurs.length >= 4 ? valeurs : null;
                break;
            case 'IN':
            case 'DF':
                absolu = true;
                largeurCm = null;
                hauteurCm = null;
                directionX = 1;
                directionY = 0;
                origine = 1;
                terminateur = ETX;
                break;
            default:
                break;
        }
    }

    fermerPolyligne();

    const cadre: CadreHpgl = Number.isFinite(minX)
        ? { minX, minY, maxX, maxY }
        : { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    // Sans SC actif, les coordonnees sont deja des unites tracantes.
    let unitesParMm = UNITES_PAR_MM;
    if (ip && sc) {
        const tracantesParUnite = (ip[2] - ip[0]) / (sc[1] - sc[0]);
        if (Number.isFinite(tracantesParUnite) && tracantesParUnite > 0) {
            unitesParMm = UNITES_PAR_MM / tracantesParUnite;
        }
    }

    return { etiquettes, polylignes, cadre, unitesParMm };
}

/**
 * Un .plt n'est pas de l'UTF-8. Le lire comme tel remplace tout octet au-dessus
 * de 127 par un caractere de remplacement, et le fichier reecrit sort corrompu.
 * On travaille donc en latin-1, ou un caractere vaut exactement un octet : le
 * couple decoder/encoder est alors une identite parfaite.
 *
 * La conversion est faite a la main : `TextDecoder('latin1')` applique en
 * realite windows-1252, qui remappe les octets 0x80 a 0x9F vers d'autres
 * points de code — l'aller-retour n'y survit pas (teste).
 */
export function decoderOctets(buffer: ArrayBuffer): string {
    const octets = new Uint8Array(buffer);
    const PAS = 0x8000;
    let out = '';
    for (let i = 0; i < octets.length; i += PAS) {
        out += String.fromCharCode(...octets.subarray(i, i + PAS));
    }
    return out;
}

export function encoderOctets(texte: string): Uint8Array<ArrayBuffer> {
    const tampon = new ArrayBuffer(texte.length);
    const octets = new Uint8Array(tampon);
    for (let i = 0; i < texte.length; i++) octets[i] = texte.charCodeAt(i) & 0xff;
    return octets;
}

export interface EtiquetteAAjouter {
    /** CENTRE du numero (le bloc injecte ecrit en LO5). */
    x: number;
    y: number;
    texte: string;
    /** Hauteur de caractere en centimetres — c'est elle qui rend le numero lisible de loin. */
    hauteurCm: number;
    /** Largeur de caractere en centimetres. */
    largeurCm: number;
    /** Orientation, reprise de l'etiquette d'origine de la piece. Defaut : 1,0. */
    directionX?: number;
    directionY?: number;
    /** Plume, reprise de l'etiquette d'origine pour que le traceur marque pareil. */
    plume?: number;
}

/**
 * Commandes de fin de page. Le bloc d'annotation doit passer AVANT elles,
 * sinon le traceur a deja ejecte la feuille quand il recoit les numeros.
 */
const FINALISATIONS = ['SP0', 'PG', 'EC1', 'EC'];

/** Trouve ou inserer sans rien deplacer : juste avant la finalisation de fin de fichier. */
export function trouverPointInsertion(source: string): number {
    const queue = source.slice(Math.max(0, source.length - 200));
    const decalage = Math.max(0, source.length - 200);
    let meilleur = source.length;
    for (const cmd of FINALISATIONS) {
        const idx = queue.lastIndexOf(cmd);
        if (idx >= 0 && decalage + idx < meilleur) meilleur = decalage + idx;
    }
    return meilleur;
}

/**
 * Ajoute les numeros d'ordre sans reecrire une seule ligne du trace d'origine.
 *
 * La garantie tient a la forme de l'operation : on decoupe la source en deux
 * et on glisse un bloc entre les deux moities. Aucun octet existant n'est
 * relu, reformate ni reordonne — `source.slice(0, p) + bloc + source.slice(p)`.
 */
export function injecterEtiquettes(
    source: string,
    etiquettes: EtiquetteAAjouter[],
    options: { terminateur?: string } = {},
): string {
    if (etiquettes.length === 0) return source;

    const terminateur = options.terminateur ?? ETX;

    const lignes = etiquettes.map(e => {
        const x = Math.round(e.x);
        const y = Math.round(e.y);
        const l = Number(e.largeurCm.toFixed(3));
        const h = Number(e.hauteurCm.toFixed(3));
        const dx = e.directionX ?? 1;
        const dy = e.directionY ?? 0;
        return `SP${e.plume ?? 1};DI${dx},${dy};PU${x},${y};SI${l},${h};LB${e.texte}${terminateur}`;
    });

    // LO5 centre le texte sur le point vise, horizontalement et verticalement.
    // C'est la convention des traces de placement, et surtout la seule qui
    // rende `x,y` utilisable tel quel comme centre du numero.
    const bloc = `;LO5;${lignes.join('')};PU;LO1;DI1,0;`;
    const point = trouverPointInsertion(source);
    return source.slice(0, point) + bloc + source.slice(point);
}
