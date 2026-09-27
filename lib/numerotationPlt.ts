/**
 * Numerotation d'un trace, sans ecran : lire le PLT, poser le numero dans
 * chaque piece, rendre le fichier. La fenetre d'apercu et les boutons de
 * chaque matelas (telecharger, traceur, glisser vers Optitex) passent tous
 * par ici, avec les memes reglages : ce que l'apercu montre est ce qui sort.
 *
 * Les deux regles de `hpgl.ts` et `placementNumero.ts` tiennent toujours :
 * le trace d'origine n'est jamais redessine, le numero ne sort pas de sa piece
 * (sauf pose a la main, signalee « force »).
 */
import type { MatelasFichier, ReglagesNumero } from '../types';
import {
    decoderOctets, encoderOctets, insererNumerosDansPieces, lireHpgl,
    type EtiquetteAAjouter, type EtiquetteHpgl, type LectureHpgl,
} from './hpgl';
import { cadreTexte, contourContenant, contourDuTexte, contoursDePieces, placerNumeros, type Contour, type Placement } from './placementNumero';

/**
 * Un numero se lit de loin, a la table : grand par defaut. La transparence ne
 * concerne que l'apercu (le traceur ecrit toujours plein).
 */
export const REGLAGES_NUMERO_DEFAUT: ReglagesNumero = {
    hauteurCm: 4, largeurCm: 2.8, ecartMm: 10, repetitions: 1,
    format: 'nu', gras: false, inclinaison: 0, opacite: 60, modele: '{n}',
};

/**
 * Ce qui s'ecrit dans la piece, a partir du numero : « 77 », « 77 TE »,
 * « 77 VSLIN ». {n} = numero d'ordre du matelas, {code} = code de la matiere
 * (TE pour le tissu, VSLIN pour la vlieseline...), {pl} = le placement (« XS-M »).
 */
export const MODELES_TEXTE = ['{n}', '{n} {code}', '{code} {n}', '{n}-{code}'];

/** Reglages complets : ceux du trace, completes par ceux de l'entreprise, puis par les valeurs d'usine. */
export const reglagesAvecDefaut = (r?: ReglagesNumero, defaut?: ReglagesNumero): ReglagesNumero => ({
    ...REGLAGES_NUMERO_DEFAUT,
    ...(defaut || {}),
    ...(r || {}),
});

/** Ce que le numero ajoute autour de lui : la matiere et le placement du matelas. */
export interface ContexteNumero {
    /** Code court de la matiere : « TE », « VSLIN », « FO ». */
    code?: string;
    /** Nom du placement : « XS-M ». */
    placement?: string;
}

/** « 77 » tel que le traceur l'ecrira : (77), [77], N°77, -77-, puis « 77 TE » selon le modele. */
export function texteNumero(numero: string, r: Pick<ReglagesNumero, 'format' | 'modele'>, ctx: ContexteNumero = {}): string {
    const n = numero.trim();
    if (!n) return n;
    let seul: string;
    switch (r.format) {
        case 'parentheses': seul = `(${n})`; break;
        case 'crochets': seul = `[${n}]`; break;
        case 'no': seul = `N${'\u00b0'}${n}`; break;
        case 'tirets': seul = `-${n}-`; break;
        default: seul = n;
    }
    const brut = (r.modele || '{n}').trim() || '{n}';
    const modele = brut.includes('{n}') ? brut : `{n} ${brut}`;
    return modele
        .replace(/\{n\}/g, seul)
        .replace(/\{code\}/g, (ctx.code || '').trim())
        .replace(/\{pl\}/g, (ctx.placement || '').trim())
        // Un code absent ne laisse ni tiret ni espace orphelin.
        .replace(/^[\s-]+|[\s-]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/-{2,}/g, '-')
        // Le traceur ne connait que les caracteres d'un octet (latin-1).
        .replace(/[^\x20-\xff]/g, '');
}

/** Les fichiers attaches sont gardes en dataURL base64 : on revient aux octets. */
export function octetsDepuisDataUrl(data: string): ArrayBuffer | null {
    const virgule = data.indexOf(',');
    if (virgule < 0 || !data.slice(0, virgule).includes(';base64')) return null;
    try {
        const binaire = atob(data.slice(virgule + 1));
        const octets = new Uint8Array(binaire.length);
        for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
        return octets.buffer;
    } catch {
        return null;
    }
}

export const enBase64 = (octets: Uint8Array): string => {
    let binaire = '';
    const PAS = 0x8000;
    for (let i = 0; i < octets.length; i += PAS) binaire += String.fromCharCode(...octets.subarray(i, i + PAS));
    return btoa(binaire);
};

export interface AnalysePlt {
    source: string;
    lecture: LectureHpgl;
    contours: Contour[];
    /** Etiquettes posees dans la matiere : une par piece a numeroter. */
    candidats: Array<{ index: number; etiquette: EtiquetteHpgl }>;
    /** En-tete Optitex (modele, tailles, laize, longueur), ecrit hors matiere. */
    entete: string[];
}

export function analyserTexte(source: string): AnalysePlt {
    const lecture = lireHpgl(source);
    const { minX, minY, maxX, maxY } = lecture.cadre;
    const dedans = (e: EtiquetteHpgl) => e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY;
    const contours = contoursDePieces(lecture.polylignes, lecture.unitesParMm);
    /*
     * UN numero par piece. Les traces du client ecrivent deux ou trois lignes
     * dans chaque piece (« XS A », « 4-57PHRTE-BAJDE », « L1 REMATADOS »...) :
     * un numero par ligne sortait deux ou trois fois dans la meme piece. On
     * garde la premiere ligne de chaque piece (celle de la taille).
     */
    const pieceVue = new Set<Contour>();
    const u = lecture.unitesParMm;
    /**
     * Meme bloc de texte : la ligne suit directement la precedente, a la meme
     * abscisse, une ligne plus bas (« L1 REMATADOS » / « L » / « A »). Sert
     * quand le contour de la piece est trace en plusieurs morceaux et ne se
     * referme pas : on ne peut pas savoir quelle piece contient le texte.
     */
    const memeBloc = (e: EtiquetteHpgl, p: EtiquetteHpgl | undefined) => {
        if (!p) return false;
        const interligne = 3 * 10 * u * Math.max(e.hauteurCm ?? 0.4, p.hauteurCm ?? 0.4);
        return Math.abs(e.x - p.x) <= 2 && Math.abs(e.y - p.y) <= interligne;
    };
    // Le bloc se rattache a la piece de sa PREMIERE ligne : sa derniere ligne
    // peut deborder sur la piece voisine et la priver de son propre numero.
    const candidats = lecture.etiquettes
        .map((etiquette, index) => ({ index, etiquette }))
        .filter(c => dedans(c.etiquette))
        .filter(c => !memeBloc(c.etiquette, lecture.etiquettes[c.index - 1]))
        .filter(c => {
            const piece = contourContenant(contours, c.etiquette.x, c.etiquette.y);
            if (!piece) return true;
            if (pieceVue.has(piece)) return false;
            pieceVue.add(piece);
            return true;
        });
    // Une ligne d'en-tete est parfois coupee en deux labels colles
    // (« LA= » puis « 148.00CM ») : on les recolle pour la relire en entier.
    const entete: string[] = [];
    let precedent: EtiquetteHpgl | null = null;
    for (const e of lecture.etiquettes) {
        if (dedans(e)) { precedent = null; continue; }
        if (precedent && e.debut === precedent.fin && entete.length) entete[entete.length - 1] += e.texte;
        else entete.push(e.texte);
        precedent = e;
    }
    return { source, lecture, contours, candidats, entete };
}

export const analyserOctets = (buffer: ArrayBuffer): AnalysePlt => analyserTexte(decoderOctets(buffer));

/**
 * Un meme trace sert a plusieurs matelas : on ne le relit pas a chaque bouton.
 * Cle = id du fichier (un fichier remplace change d'id).
 */
const cache = new Map<string, AnalysePlt>();
export function analyserFichier(f: MatelasFichier): AnalysePlt | null {
    const deja = cache.get(f.id);
    if (deja) return deja;
    if (!f.data) return null;
    const buffer = octetsDepuisDataUrl(f.data);
    if (!buffer) return null;
    const a = analyserOctets(buffer);
    if (cache.size > 20) cache.delete(cache.keys().next().value as string);
    cache.set(f.id, a);
    return a;
}

export interface PoseNumero {
    index: number;
    rang: number;
    etiquette: EtiquetteHpgl;
    placement: Placement;
}

/** Ou va le numero dans chaque piece, avec les reglages et les retouches piece par piece. */
export function posesNumero(a: AnalysePlt, numero: string, r: ReglagesNumero, ctx: ContexteNumero = {}): PoseNumero[] {
    if (r.hauteurCm <= 0 || r.largeurCm <= 0) return [];
    const exclus = new Set(r.exclus || []);
    const texte = texteNumero(numero.trim() || '0', r, ctx);
    const texteCourt = texteNumero(numero.trim() || '0', { format: 'nu' });
    return a.candidats
        .filter(c => !exclus.has(c.index))
        .flatMap(({ index, etiquette }) => {
            const aj = r.ajustements?.[String(index)];
            // Une hauteur propre a la piece garde la proportion largeur/hauteur.
            const hauteurCm = aj?.hauteurCm && aj.hauteurCm > 0 ? aj.hauteurCm : r.hauteurCm;
            const largeurCm = r.largeurCm * (hauteurCm / r.hauteurCm);
            return placerNumeros({
                etiquette,
                contour: contourDuTexte(a.contours, etiquette.x, etiquette.y),
                texte,
                hauteurCm,
                largeurCm,
                decalageMm: r.ecartMm,
                unitesParMm: a.lecture.unitesParMm,
                ajustementXmm: aj?.x ?? 0,
                ajustementYmm: aj?.y ?? 0,
                positionLibre: !!aj?.libre,
                texteCourt,
                cercle: !!r.cercle,
            }, r.repetitions || 1).map((placement, rang) => ({ index, rang, etiquette, placement }));
        });
}

/** Le trace d'origine, un numero glisse dans chaque piece. null s'il n'y a rien a numeroter. */
export function numeroterPlt(a: AnalysePlt, numero: string, r: ReglagesNumero, ctx: ContexteNumero = {}): Uint8Array<ArrayBuffer> | null {
    if (!numero.trim()) return null;
    const texte = texteNumero(numero, r, ctx);
    const poses = posesNumero(a, numero, r, ctx);
    if (poses.length === 0) return null;
    const u = a.lecture.unitesParMm;
    const insertions = poses.map(({ etiquette, placement }) => {
        const base: EtiquetteAAjouter = {
            x: placement.x,
            y: placement.y,
            texte: placement.texte ?? texte,
            hauteurCm: placement.hauteurCm,
            largeurCm: placement.largeurCm,
            directionX: etiquette.directionX,
            directionY: etiquette.directionY,
            plume: etiquette.plume,
            inclinaison: r.inclinaison || 0,
            cadre: r.cercle && !placement.sansCadre ? cadreTexte((placement.texte ?? texte).length, placement.largeurCm, placement.hauteurCm, u) : undefined,
        };
        // Gras : le meme numero repasse avec un decalage d'un trait de plume (~0,4 mm).
        // Optitex, lui, y lit deux textes : a eviter pour un fichier qui y repasse.
        const etiquettes = r.gras ? [base, { ...base, x: base.x + 0.4 * u, y: base.y + 0.2 * u, cadre: undefined }] : [base];
        return { ancre: etiquette, etiquettes };
    });
    return encoderOctets(insererNumerosDansPieces(a.source, insertions));
}

/** Pieces a verifier : numero reduit faute de place, ou pose sans place sure. */
export function alertesPoses(poses: PoseNumero[]): { reduit: number; force: number } {
    const parPiece = new Map<number, Placement>();
    for (const p of poses) if (!parPiece.has(p.index)) parPiece.set(p.index, p.placement);
    let reduit = 0, force = 0;
    for (const p of parPiece.values()) {
        if (p.statut === 'reduit') reduit++;
        if (p.statut === 'force') force++;
    }
    return { reduit, force };
}
