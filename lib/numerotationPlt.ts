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
    decoderOctets, encoderOctets, injecterEtiquettes, lireHpgl,
    type EtiquetteHpgl, type LectureHpgl,
} from './hpgl';
import { contourContenant, contoursDePieces, placerNumeros, type Contour, type Placement } from './placementNumero';

export const REGLAGES_NUMERO_DEFAUT: ReglagesNumero = { hauteurCm: 3, largeurCm: 2, ecartMm: 10, repetitions: 1 };

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
    const candidats = lecture.etiquettes.map((etiquette, index) => ({ index, etiquette })).filter(c => dedans(c.etiquette));
    return {
        source,
        lecture,
        contours: contoursDePieces(lecture.polylignes),
        candidats,
        entete: lecture.etiquettes.filter(e => !dedans(e)).map(e => e.texte),
    };
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
export function posesNumero(a: AnalysePlt, numero: string, r: ReglagesNumero): PoseNumero[] {
    if (r.hauteurCm <= 0 || r.largeurCm <= 0) return [];
    const exclus = new Set(r.exclus || []);
    const texte = numero.trim() || '0';
    return a.candidats
        .filter(c => !exclus.has(c.index))
        .flatMap(({ index, etiquette }) => {
            const aj = r.ajustements?.[String(index)];
            // Une hauteur propre a la piece garde la proportion largeur/hauteur.
            const hauteurCm = aj?.hauteurCm && aj.hauteurCm > 0 ? aj.hauteurCm : r.hauteurCm;
            const largeurCm = r.largeurCm * (hauteurCm / r.hauteurCm);
            return placerNumeros({
                etiquette,
                contour: contourContenant(a.contours, etiquette.x, etiquette.y),
                texte,
                hauteurCm,
                largeurCm,
                decalageMm: r.ecartMm,
                unitesParMm: a.lecture.unitesParMm,
                ajustementXmm: aj?.x ?? 0,
                ajustementYmm: aj?.y ?? 0,
                positionLibre: !!aj?.libre,
            }, r.repetitions || 1).map((placement, rang) => ({ index, rang, etiquette, placement }));
        });
}

/** Le trace d'origine plus le bloc de numeros. null s'il n'y a rien a numeroter. */
export function numeroterPlt(a: AnalysePlt, numero: string, r: ReglagesNumero): Uint8Array<ArrayBuffer> | null {
    const texte = numero.trim();
    if (!texte) return null;
    const poses = posesNumero(a, texte, r);
    if (poses.length === 0) return null;
    return encoderOctets(injecterEtiquettes(a.source, poses.map(({ etiquette, placement }) => ({
        x: placement.x,
        y: placement.y,
        texte,
        hauteurCm: placement.hauteurCm,
        largeurCm: placement.largeurCm,
        directionX: etiquette.directionX,
        directionY: etiquette.directionY,
        plume: etiquette.plume,
    }))));
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
