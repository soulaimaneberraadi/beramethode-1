/**
 * Equilibre des matieres d'un ordre de coupe.
 *
 * Un vetement se coupe dans plusieurs matieres : le tissu, la vlieseline, la
 * doublure (foro)... Chaque matiere a ses propres matelas, groupes autrement
 * (le tissu en « S×2 » puis « M×2 », la doublure en « S-M×2 » d'un coup). En
 * salle, le danger est de lancer en production un matelas de tissu dont la
 * doublure n'est pas encore coupee.
 *
 * On suit le tissu dans son ordre de coupe (ses numeros). Pour chaque matelas
 * de tissu, chaque autre matiere doit couvrir les memes pieces, taille par
 * taille (et couleur par couleur quand chaque matiere a ses couleurs) : elle
 * prend les matelas qui comblent le mieux ce qui manque, et chacun se place en
 * face du matelas de tissu dont il coupe le plus de pieces. Cela forme des
 * LOTS, comme sur la feuille de l'atelier :
 *
 *     lot   Tissu        Vlieseline    Foro        vetements
 *      1    1 S          1 S-M         1 S a L        150
 *           2 M          2 L
 *           3 L
 *      2    4 XL, 5 S    3 XL-S        2 XL-S         240
 *
 * Des matelas de tissu restent dans le meme lot tant que ce qui est en face
 * d'eux deborde nettement sur le suivant ; quand les plis ne tombent jamais
 * juste (100 plis de tissu, 99 de vlieseline), chaque matelas de tissu fait
 * son lot avec les matelas qui le couvrent.
 *
 * Quand une matiere est tracee sur la serie du tissu (feuille ZINTURA : la
 * doublure 5 « XS-XL×2 » = serie 1229-1516 = tissus 9 et 10), c'est la serie
 * qui la met en face, et chaque matelas montre sa plage « de ... a ... ».
 *
 * Un lot est pret pour la production quand son tissu et tout ce qui le couvre
 * est coupe ; tissu coupe et doublure pas encore = matiere en retard.
 *
 * Aucune dependance a React : ce calcul se verifie par un test.
 * Lancer les tests : node --import tsx lib/equilibreMatieres.test.ts
 */
import type { MatelasLine, OrdreCoupe, SerieEtiquetage, TissuCoupe } from '../types';
import { TISSU_PRINCIPAL, codeMatiere, tissuDe } from './ordreCoupe';
import { nomPlacement } from './planMatelas';
import { paquetsSerie } from './serieEtiquetage';

export type EtatMatelas = 'a_faire' | 'envoye' | 'coupe';

/** Gris : a faire. Bleu : trace imprime / envoye au traceur. Vert : coupe et confirme. */
export const etatMatelas = (l: Pick<MatelasLine, 'fait' | 'envoyeLe'>): EtatMatelas =>
    (l.fait ? 'coupe' : l.envoyeLe ? 'envoye' : 'a_faire');

/** Pieces par cle (taille, ou couleur + taille). */
type Vecteur = Record<string, number>;

export interface MatiereEquilibre {
    id: string;
    nom: string;
    code: string;
    principal: boolean;
}

export interface MatelasEquilibre {
    id: string;
    matiere: string;
    /** Numero ecrit sur les pieces (« 77 ») ; a defaut, le rang dans le tableau. */
    numero: string;
    /** Nom du placement (« S-M », « XS×2 »). */
    nom: string;
    couleur?: string;
    plis: number;
    /** Pieces du matelas, par cle. */
    pieces: Vecteur;
    /** Pieces d'un seul pli, par cle : ce que change un pli de plus ou de moins. */
    parPli: Vecteur;
    total: number;
    etat: EtatMatelas;
    ligne: MatelasLine;
    /**
     * Plage de la serie couverte par le matelas, comme la feuille « SERIE » : la serie court
     * dans chaque matiere, matelas apres matelas, dans l'ordre des numeros. Le tissu 10
     * (XL×2) = 1373-1516 ; la doublure 5 (XS-XL×2) = 1229-1516 : elle coupe ses pieces.
     */
    serie?: { debut: number; fin: number; paquets: { taille: string; debut: number; fin: number }[] };
}

export interface EcartEquilibre {
    matiere: string;
    cle: string;
    taille: string;
    couleur?: string;
    /** Pieces de la matiere moins pieces du tissu principal : negatif = il en manque. */
    delta: number;
}

export interface LotEquilibre {
    /** 1, 2, 3... dans l'ordre de coupe du tissu principal. */
    rang: number;
    /** Matelas du lot, par matiere (id), dans l'ordre de leurs numeros. */
    matelas: Record<string, MatelasEquilibre[]>;
    /** Vetements du lot : les pieces de son tissu principal. */
    vetements: number;
    /** Vetements du lot dont toutes les matieres sont coupees. */
    prets: number;
    /** Pieces du lot qu'aucun matelas d'une autre matiere ne couvre (plan incomplet). */
    manque: EcartEquilibre[];
    etat: 'a_faire' | 'en_cours' | 'coupe';
    /** Matieres en retard : du tissu du lot est coupe, pas tout ce qui le couvre. */
    retard: string[];
    /**
     * Ce qu'il faut encore couper, par matiere, pour lancer le tissu coupe du
     * lot : les numeros en face de ce lot, et ceux en face d'un autre lot.
     */
    attente: Record<string, { numeros: string[]; autres: string[] }>;
}

export interface BilanMatiere {
    nbMatelas: number;
    nbCoupes: number;
    nbEnvoyes: number;
    pieces: number;
    piecesCoupees: number;
}

/**
 * Ce que la chaine peut coudre, taille par taille (et couleur par couleur) : un
 * vetement ne se coud que si toutes ses matieres sont coupees, donc le pret est
 * le plus petit de ce qui est coupe, matiere par matiere.
 */
export interface LigneTaille {
    cle: string;
    taille: string;
    couleur?: string;
    /** Pieces prevues de cette taille (tissu principal). */
    prevu: number;
    /** Pieces coupees par matiere (id) — seulement les matieres qui coupent cette taille. */
    coupe: Record<string, number>;
    /** Pieces prevues par matiere (id). */
    prevuMat: Record<string, number>;
    /** Vetements complets : le moins coupe de toutes les matieres. */
    prets: number;
    /** Matieres qui retiennent la chaine : moins coupees que les autres. Vide si rien ne bloque. */
    limite: string[];
}

export interface EquilibreOrdre {
    matieres: MatiereEquilibre[];
    lots: LotEquilibre[];
    /** Par taille : ce qui est coupe dans chaque matiere et ce qui peut partir en chaine. */
    parTaille: LigneTaille[];
    /** Matelas des autres matieres dont aucun matelas de tissu n'a besoin (coupes en trop). */
    enPlus: Record<string, MatelasEquilibre[]>;
    /** Les cles portent la couleur (chaque matiere a ses matelas par couleur). */
    parCouleur: boolean;
    /** Vetements prevus (pieces du tissu principal) et deja coupes. */
    vetements: number;
    vetementsCoupes: number;
    /** Vetements dont toutes les matieres sont coupees : ce qui peut partir en production. */
    prets: number;
    parMatiere: Record<string, BilanMatiere>;
    /** Ecarts du plan entier, matiere par matiere, face au tissu principal. */
    ecartsPlan: EcartEquilibre[];
}

const SEP = '\u001f';
const ajouter = (a: Vecteur, b: Vecteur) => { for (const k in b) a[k] = (a[k] || 0) + b[k]; };
const somme = (v: Vecteur) => Object.values(v).reduce((s, x) => s + x, 0);
const sommeRatios = (l: MatelasLine) => Object.values(l.ratios || {}).reduce((s, r) => s + (Number(r) || 0), 0);
const numeroTri = (n: string) => { const x = parseInt(n, 10); return Number.isFinite(x) ? x : Number.MAX_SAFE_INTEGER; };
const decouperCle = (k: string): { taille: string; couleur?: string } => {
    const i = k.indexOf(SEP);
    return i < 0 ? { taille: k } : { couleur: k.slice(0, i), taille: k.slice(i + 1) };
};

/** Matieres de l'ordre, tissu principal en tete. */
export function matieresDe(o: OrdreCoupe | undefined): TissuCoupe[] {
    const liste: TissuCoupe[] = o?.tissus?.length ? o.tissus : [{ id: TISSU_PRINCIPAL, nom: 'Tissu' }];
    const principal = liste.filter(t => t.id === TISSU_PRINCIPAL);
    return [...(principal.length ? principal : [{ id: TISSU_PRINCIPAL, nom: 'Tissu' }]), ...liste.filter(t => t.id !== TISSU_PRINCIPAL)];
}

export function equilibrerOrdre(o: OrdreCoupe | undefined, tailles: string[]): EquilibreOrdre {
    const tissus = matieresDe(o);
    const placements = new Map((o?.placements || []).map(p => [p.id, p]));
    const lignes = (o?.matelasLines || [])
        .map((l, rang) => ({ l, rang }))
        .filter(({ l }) => (Number(l.plis) || 0) > 0 && sommeRatios(l) > 0);

    // Une matiere sans couleur (vlieseline blanche pour toutes) se compare taille par taille.
    const estP = (l: MatelasLine) => tissuDe(l) === TISSU_PRINCIPAL;
    const couleursP = new Set(lignes.filter(x => estP(x.l)).map(x => (x.l.couleur || '').trim()));
    const parCouleur = lignes.length > 0
        && lignes.every(x => (x.l.couleur || '').trim() !== '')
        && lignes.every(x => estP(x.l) || couleursP.has((x.l.couleur || '').trim()));
    const cle = (couleur: string | undefined, taille: string) => (parCouleur ? `${(couleur || '').trim()}${SEP}${taille}` : taille);

    // Matieres : celles de l'ordre, plus une matiere inconnue si une ligne en porte une.
    const matieres: MatiereEquilibre[] = tissus.map(t => ({ id: t.id, nom: t.nom, code: codeMatiere(t), principal: t.id === TISSU_PRINCIPAL }));
    for (const { l } of lignes) {
        const id = tissuDe(l);
        if (!matieres.some(m => m.id === id)) matieres.push({ id, nom: id, code: id.slice(0, 4).toUpperCase(), principal: false });
    }
    const P = TISSU_PRINCIPAL;
    const ids = matieres.map(m => m.id);
    const autres = ids.filter(id => id !== P);

    const parMat: Record<string, MatelasEquilibre[]> = {};
    for (const id of ids) parMat[id] = [];
    for (const { l, rang } of lignes) {
        const id = tissuDe(l);
        const pieces: Vecteur = {}, parPli: Vecteur = {};
        const plis = Math.floor(Number(l.plis) || 0);
        for (const [t, r] of Object.entries(l.ratios || {})) {
            const n = Math.max(0, Math.floor(Number(r) || 0));
            if (!n) continue;
            const k = cle(l.couleur, t);
            parPli[k] = (parPli[k] || 0) + n;
            pieces[k] = (pieces[k] || 0) + n * plis;
        }
        const p = l.placementId ? placements.get(l.placementId) : undefined;
        parMat[id].push({
            id: l.id, matiere: id, numero: (l.numero || '').trim() || String(rang + 1),
            nom: (p?.nom || '').trim() || nomPlacement(l.ratios || {}, tailles.length ? tailles : Object.keys(l.ratios || {})),
            couleur: l.couleur, plis, pieces, parPli, total: somme(pieces), etat: etatMatelas(l), ligne: l,
        });
    }
    // Ordre de coupe : le numero, puis l'ordre du tableau, pour toutes les matieres. Jamais
    // l'etat : confirmer un matelas ne le deplace pas d'un lot a l'autre (le 23 coupe reste au
    // lot 3, avec sa doublure et son entretoile en face) ; couper hors de l'ordre se lit comme
    // un retard du lot, pas comme un nouveau plan.
    const rangDe = new Map(lignes.map(x => [x.l.id, x.rang]));
    const parNumero = (a: MatelasEquilibre, b: MatelasEquilibre) => numeroTri(a.numero) - numeroTri(b.numero) || (rangDe.get(a.id) || 0) - (rangDe.get(b.id) || 0);
    for (const id of ids) parMat[id].sort(parNumero);

    // La serie de chaque matiere : celle du tissu garde son depart et ses plages figees.
    const taillesSerie = [...tailles, ...[...new Set(lignes.flatMap(x => Object.keys(x.l.ratios || {})))].filter(t => !tailles.includes(t))];
    for (const id of ids) {
        const paquets = paquetsSerie(lignes.map(x => x.l), taillesSerie, id === P ? (o?.serie?.depart || 1) : 1, id === P ? o?.serie?.figes : undefined, id);
        const parId = new Map<string, typeof paquets>();
        for (const q of paquets) { const a = parId.get(q.matelasId) || []; a.push(q); parId.set(q.matelasId, a); }
        for (const x of parMat[id]) {
            const qs = parId.get(x.id);
            if (!qs?.length) continue;
            x.serie = {
                debut: Math.min(...qs.map(q => q.debut)), fin: Math.max(...qs.map(q => q.fin)),
                paquets: qs.map(q => ({ taille: q.taille, debut: q.debut, fin: q.fin })),
            };
        }
    }

    const total: Record<string, Vecteur> = {}, coupe: Record<string, Vecteur> = {};
    const parMatiere: Record<string, BilanMatiere> = {};
    for (const id of ids) {
        total[id] = {}; coupe[id] = {};
        const b: BilanMatiere = { nbMatelas: 0, nbCoupes: 0, nbEnvoyes: 0, pieces: 0, piecesCoupees: 0 };
        for (const x of parMat[id]) {
            ajouter(total[id], x.pieces);
            b.nbMatelas++; b.pieces += x.total;
            if (x.etat === 'coupe') { ajouter(coupe[id], x.pieces); b.nbCoupes++; b.piecesCoupees += x.total; }
            else if (x.etat === 'envoye') b.nbEnvoyes++;
        }
        parMatiere[id] = b;
    }
    // Une matiere ne compte que pour les pieces qu'elle coupe quelque part dans l'ordre.
    const concerne = (id: string, k: string) => (total[id][k] || 0) > 0;
    const ordreTailles = (k: string) => { const i = tailles.indexOf(decouperCle(k).taille); return i < 0 ? tailles.length : i; };
    const trierCles = (ks: Iterable<string>) => [...ks].sort((a, b) => (decouperCle(a).couleur || '').localeCompare(decouperCle(b).couleur || '') || ordreTailles(a) - ordreTailles(b) || a.localeCompare(b));
    const ecart = (matiere: string, k: string, delta: number): EcartEquilibre => ({ matiere, cle: k, ...decouperCle(k), delta });

    /* ---- Ordre de coupe des autres matieres ---- */
    // Pour chaque matelas de tissu, dans son ordre de coupe, chaque autre matiere prend les
    // matelas qui couvrent le mieux ce qui manque (sans regarder s'ils sont coupes : le plan ne
    // bouge pas quand on confirme) ; celui qui apporte le plus de pieces utiles (38-40 +
    // 42×2 + 42-44 face a « 38-40-42×3-44 », pas quatre 42-44). Un matelas qui deborderait
    // surtout sur la suite attend qu'elle en ait besoin : quelques pieces qui manquent (100
    // plis de tissu, 99 de vlieseline) passent au matelas de tissu suivant au lieu d'appeler
    // un matelas entier. Au dernier matelas de tissu, tout ce qui manque se couvre.
    const princ = parMat[P];
    const n = princ.length;
    const cumul: Vecteur[] = [];
    { const d: Vecteur = {}; for (const x of princ) { ajouter(d, x.pieces); cumul.push({ ...d }); } }
    const avantRangee = (j: number): Vecteur => (j > 0 ? cumul[j - 1] : {});
    const sequence: Record<string, number[]> = {};
    for (const id of autres) {
        const liste = parMat[id];
        const utilise = liste.map(() => false);
        const seq: number[] = [];
        const C: Vecteur = {};
        for (let j = 0; j < n; j++) {
            const cible = cumul[j], horizon = cumul[Math.min(j + 1, n - 1)];
            const dernier = j === n - 1;
            for (let garde = 0; garde < liste.length; garde++) {
                const D: Vecteur = {};
                for (const k in cible) if (concerne(id, k) && cible[k] > (C[k] || 0)) D[k] = cible[k] - (C[k] || 0);
                if (!Object.keys(D).length) break;
                let choix = -1, meilleur = -Infinity;
                liste.forEach((x, i) => {
                    if (utilise[i]) return;
                    let utile = 0, deborde = 0;
                    for (const k in x.pieces) {
                        utile += Math.min(x.pieces[k], D[k] || 0);
                        deborde += Math.max(0, x.pieces[k] - Math.max(0, (horizon[k] || 0) - (C[k] || 0)));
                    }
                    if (utile <= 0 || (!dernier && utile < deborde)) return;
                    const note = dernier ? utile * 1e6 - deborde : utile - deborde;
                    if (note > meilleur) { meilleur = note; choix = i; }
                });
                if (choix < 0) break;
                utilise[choix] = true;
                seq.push(choix);
                ajouter(C, liste[choix].pieces);
            }
        }
        sequence[id] = seq;
    }

    /* ---- Matieres tracees sur la serie du tissu ---- */
    // Sur la feuille de l'atelier, la doublure suit la serie du tissu : chacun de ses matelas
    // finit la ou finit un matelas de tissu (doublure 5 = tissu 9 + 10, 1229-1516). Une telle
    // matiere se met en face par la serie : chaque matelas en face du matelas de tissu dont il
    // recouvre le plus de numeros (le dernier a egalite, la ou il finit). Les autres
    // (l'entretoile en « M×26 » pour tout l'ordre) restent rangees taille par taille.
    // Couleur par couleur quand chaque matiere a ses couleurs : une fin ne compte que face au tissu de sa couleur.
    const teinte = (x: MatelasEquilibre) => (parCouleur ? (x.couleur || '').trim() : '');
    const finsP = new Set(princ.filter(x => x.serie).map(x => `${teinte(x)}${SEP}${x.serie!.fin}`));
    const surSerie: Record<string, boolean> = {};
    for (const id of autres) {
        const liste = parMat[id].filter(x => x.serie);
        const alignes = liste.filter(x => finsP.has(`${teinte(x)}${SEP}${x.serie!.fin}`)).length;
        surSerie[id] = liste.length > 0 && alignes >= 0.7 * liste.length;
        if (surSerie[id]) sequence[id] = parMat[id].map((_, i) => i);
    }

    /* ---- Chaque matelas en face du matelas de tissu dont il coupe le plus de pieces ---- */
    const rangee: Record<string, number[]> = {};
    for (const id of autres) {
        rangee[id] = parMat[id].map(() => -1);
        const C: Vecteur = {};
        for (const i of sequence[id]) {
            const x = parMat[id][i];
            const avant = { ...C };
            ajouter(C, x.pieces);
            let mieux = -1, max = 0;
            for (let j = 0; j < n; j++) {
                const bas = avantRangee(j), haut = cumul[j];
                let commun = 0;
                for (const k in x.pieces) commun += Math.max(0, Math.min(C[k], haut[k] || 0) - Math.max(avant[k] || 0, bas[k] || 0));
                if (commun > max) { max = commun; mieux = j; }
            }
            rangee[id][i] = mieux;
        }
        if (!surSerie[id]) continue;
        parMat[id].forEach((x, i) => {
            if (!x.serie) return;
            let mieux = -1, max = 0;
            princ.forEach((t, j) => {
                if (!t.serie || teinte(t) !== teinte(x)) return;
                const commun = Math.min(x.serie!.fin, t.serie.fin) - Math.max(x.serie!.debut, t.serie.debut) + 1;
                if (commun > 0 && commun >= max) { max = commun; mieux = j; }
            });
            rangee[id][i] = mieux;
        });
    }

    /* ---- Lots ---- */
    // Des matelas de tissu restent ensemble tant que ce qui est en face d'eux deborde nettement
    // sur le suivant (une doublure « S a L » face a S, M et L) ; un lot se ferme quand les
    // matieres retombent a peu pres juste.
    const rattache: Record<string, Vecteur[]> = {};
    for (const id of autres) {
        const parRangee: Vecteur[] = Array.from({ length: n }, () => ({}));
        parMat[id].forEach((x, i) => { if (rangee[id][i] >= 0) ajouter(parRangee[rangee[id][i]], x.pieces); });
        const cum: Vecteur = {};
        rattache[id] = parRangee.map(v => { ajouter(cum, v); return { ...cum }; });
    }
    // Une matiere sur la serie ferme les lots la ou les fins tombent juste ; une matiere en
    // grands matelas (une taille pour tout l'ordre) ne tombe jamais juste et ne compte pas.
    const pourLots = autres.some(id => surSerie[id]) ? autres.filter(id => surSerie[id]) : autres;
    const decalage = (j: number) => {
        let max = 0;
        for (const id of pourLots) {
            let e = 0;
            for (const k of new Set([...Object.keys(cumul[j]), ...Object.keys(rattache[id][j])])) {
                if (concerne(id, k)) e += Math.abs((rattache[id][j][k] || 0) - (cumul[j][k] || 0));
            }
            max = Math.max(max, e);
        }
        return max;
    };
    const LOT_MAX = 12;
    const groupes: number[][] = [];
    let groupe: number[] = [];
    for (let j = 0; j < n; j++) {
        groupe.push(j);
        const suivant = j + 1 < n ? princ[j + 1].total : 0;
        if (j + 1 >= n || groupe.length >= LOT_MAX || decalage(j) < 0.25 * suivant) { groupes.push(groupe); groupe = []; }
    }

    const coupeAutre = (id: string, i: number) => parMat[id][i].etat === 'coupe';
    // Pieces couvertes par les matelas deja coupes de chaque matiere.
    const couvCoupe: Record<string, Vecteur> = {};
    for (const id of autres) couvCoupe[id] = coupe[id];

    const lots: LotEquilibre[] = groupes.map((g, num) => {
        const dans = new Set(g);
        const matelas: Record<string, MatelasEquilibre[]> = { [P]: g.map(j => princ[j]) };
        for (const id of autres) matelas[id] = parMat[id].filter((_, i) => dans.has(rangee[id][i])).sort(parNumero);
        const debut = avantRangee(g[0]), fin = cumul[g[g.length - 1]];
        const vetements = g.reduce((s, j) => s + princ[j].total, 0);

        // Pret : pieces du lot coupees en tissu, et couvertes par ce qui est coupe des autres matieres.
        const coupeLot: Vecteur = {};
        for (const j of g) if (princ[j].etat === 'coupe') ajouter(coupeLot, princ[j].pieces);
        let prets = 0;
        for (const k in coupeLot) {
            let v = coupeLot[k];
            for (const id of autres) if (concerne(id, k)) v = Math.min(v, Math.max(0, (couvCoupe[id][k] || 0) - (debut[k] || 0)));
            prets += v;
        }

        // Manque : pieces du lot au-dela de tout ce que la matiere coupe sur l'ordre.
        const manque: EcartEquilibre[] = [];
        for (const id of autres) {
            for (const k of trierCles(Object.keys(fin))) {
                if (!concerne(id, k)) continue;
                const m = (fin[k] || 0) - Math.max(total[id][k] || 0, debut[k] || 0);
                if (m > 0) manque.push(ecart(id, k, -m));
            }
        }

        // Retard : les pieces du tissu coupe du lot que les matelas coupes des autres matieres ne
        // couvrent pas encore, et les matelas a couper pour ca, dans leur ordre de coupe.
        const dernierCoupe = [...g].reverse().find(j => princ[j].etat === 'coupe');
        const attente: Record<string, { numeros: string[]; autres: string[] }> = {};
        if (dernierCoupe !== undefined) {
            for (const id of autres) {
                const reste: Vecteur = {};
                for (const k in cumul[dernierCoupe]) {
                    if (!concerne(id, k)) continue;
                    const d = cumul[dernierCoupe][k] - (couvCoupe[id][k] || 0);
                    if (d > 0) reste[k] = d;
                }
                if (!Object.keys(reste).length) continue;
                const ordre = [...sequence[id], ...parMat[id].map((_, i) => i).filter(i => !sequence[id].includes(i))];
                const numeros: string[] = [], ailleurs: string[] = [];
                for (const i of ordre) {
                    if (!Object.keys(reste).length) break;
                    const x = parMat[id][i];
                    if (coupeAutre(id, i) || !Object.keys(reste).some(k => (x.pieces[k] || 0) > 0)) continue;
                    for (const k in x.pieces) if (reste[k] !== undefined) { reste[k] -= x.pieces[k]; if (reste[k] <= 0) delete reste[k]; }
                    (dans.has(rangee[id][i]) ? numeros : ailleurs).push(x.numero);
                }
                attente[id] = { numeros, autres: ailleurs };
            }
        }
        const tous = ids.flatMap(id => matelas[id]);
        const etat: LotEquilibre['etat'] = tous.every(x => x.etat === 'coupe') ? 'coupe'
            : tous.every(x => x.etat === 'a_faire') ? 'a_faire' : 'en_cours';
        return { rang: num + 1, matelas, vetements, prets, manque, etat, retard: Object.keys(attente), attente };
    });

    const enPlus: Record<string, MatelasEquilibre[]> = {};
    for (const id of autres) {
        const reste = parMat[id].filter((_, i) => rangee[id][i] < 0);
        if (reste.length) enPlus[id] = reste.sort(parNumero);
    }

    /* ---- Ordre entier ---- */
    let prets = 0;
    for (const k in total[P]) {
        let min = coupe[P][k] || 0;
        for (const id of autres) if (concerne(id, k)) min = Math.min(min, coupe[id][k] || 0);
        prets += min;
    }
    const ecartsPlan: EcartEquilibre[] = [];
    for (const id of autres) {
        if (!parMat[id].length) continue;
        for (const k of trierCles(new Set([...Object.keys(total[P]), ...Object.keys(total[id])]))) {
            const delta = (total[id][k] || 0) - (total[P][k] || 0);
            if (delta !== 0) ecartsPlan.push(ecart(id, k, delta));
        }
    }

    const parTaille: LigneTaille[] = trierCles(Object.keys(total[P])).map(k => {
        const concernees = ids.filter(id => id === P || concerne(id, k));
        const coupeMat: Record<string, number> = {}, prevuMat: Record<string, number> = {};
        for (const id of concernees) { coupeMat[id] = coupe[id][k] || 0; prevuMat[id] = total[id][k] || 0; }
        const valeurs = concernees.map(id => coupeMat[id]);
        const pretsK = Math.min(...valeurs);
        const plusHaut = Math.max(...valeurs);
        return {
            cle: k, ...decouperCle(k), prevu: total[P][k] || 0, coupe: coupeMat, prevuMat, prets: pretsK,
            limite: plusHaut > pretsK ? concernees.filter(id => coupeMat[id] === pretsK) : [],
        };
    });

    return {
        matieres, lots, parTaille, enPlus, parCouleur,
        vetements: somme(total[P]),
        vetementsCoupes: somme(coupe[P]),
        prets,
        parMatiere,
        ecartsPlan,
    };
}

/* ------------------------------------------------------------------ */
/* Rattraper un ecart                                                   */
/* ------------------------------------------------------------------ */

export interface Ajustement {
    matiere: string;
    ligneId: string;
    numero: string;
    nom: string;
    plisAvant: number;
    plisApres: number;
    /** Ce qui resterait d'ecart apres ce changement (vide = equilibre exact). */
    reste: EcartEquilibre[];
}

/**
 * Un matelas pas encore coupe de la matiere `matiere` dont on change les plis
 * pour que la matiere coupe exactement les pieces du tissu (un matelassier a
 * mis 80 plis au lieu de 82 sur le tissu : la doublure passe a 80). Le
 * changement qui laisse le moins d'ecart, en preferant les derniers matelas
 * (coupes plus tard) ; null s'il n'ameliore rien.
 */
export function proposerAjustement(eq: EquilibreOrdre, matiere: string): Ajustement | null {
    const ecarts = eq.ecartsPlan.filter(e => e.matiere === matiere);
    if (!ecarts.length) return null;
    // Manque a combler, cle par cle (positif = la matiere doit couper plus).
    const d: Vecteur = {};
    for (const e of ecarts) d[e.cle] = -e.delta;
    const residu = (delta: number, parPli: Vecteur) => {
        let r = 0;
        for (const k of new Set([...Object.keys(d), ...Object.keys(parPli)])) r += Math.abs((d[k] || 0) - delta * (parPli[k] || 0));
        return r;
    };
    const depart = Object.values(d).reduce((s, x) => s + Math.abs(x), 0);
    const candidats = [...eq.lots.flatMap(l => l.matelas[matiere] || []), ...(eq.enPlus[matiere] || [])]
        .filter(x => x.etat !== 'coupe')
        .reverse();
    let meilleur: { x: MatelasEquilibre; delta: number; r: number } | null = null;
    for (const x of candidats) {
        const deltas = new Set<number>();
        for (const k in x.parPli) if (x.parPli[k] > 0 && d[k]) deltas.add(Math.round(d[k] / x.parPli[k]));
        for (const delta of deltas) {
            if (delta === 0 || x.plis + delta < 0) continue;
            const r = residu(delta, x.parPli);
            if (!meilleur || r < meilleur.r || (r === meilleur.r && Math.abs(delta) < Math.abs(meilleur.delta))) meilleur = { x, delta, r };
        }
    }
    if (!meilleur || meilleur.r >= depart) return null;
    const { x, delta } = meilleur;
    const apres: Vecteur = { ...d };
    for (const k in x.parPli) apres[k] = (apres[k] || 0) - delta * x.parPli[k];
    const reste = Object.entries(apres).filter(([, v]) => v !== 0).map(([k, v]) => ({ matiere, cle: k, ...decouperCle(k), delta: -v }));
    return { matiere, ligneId: x.id, numero: x.numero, nom: x.nom, plisAvant: x.plis, plisApres: x.plis + delta, reste };
}

/* ------------------------------------------------------------------ */
/* Plis corriges sur un matelas deja coupe                              */
/* ------------------------------------------------------------------ */

/**
 * Les plages de la serie d'un matelas coupe sont figees (ses etiquettes sont
 * collees). Corriger ses plis apres coup les raccourcit ou les allonge sur
 * place — jamais par-dessus la plage figee d'un autre matelas. `conflit` :
 * l'allongement chevaucherait une autre plage ; la plage reste alors telle
 * quelle et l'ecart se note en « pieces (+/-) » dans la serie.
 */
export function corrigerPlisFiges(serie: SerieEtiquetage | undefined, ligneId: string, plis: number): { serie: SerieEtiquetage | undefined; conflit: boolean } {
    const figes = serie?.figes;
    if (!figes) return { serie, conflit: false };
    const prefixe = `${ligneId}:`;
    const miennes = Object.keys(figes).filter(k => k.startsWith(prefixe));
    if (!miennes.length) return { serie, conflit: false };
    const autres = Object.entries(figes).filter(([k]) => !k.startsWith(prefixe)).map(([, f]) => f);
    const nouveaux = { ...figes };
    let conflit = false;
    for (const k of miennes) {
        const f = figes[k];
        const fin = f.debut + Math.max(1, Math.floor(plis)) - 1;
        if (fin > f.fin && autres.some(a => a.debut <= fin && a.fin >= f.debut)) { conflit = true; continue; }
        nouveaux[k] = { debut: f.debut, fin };
    }
    return { serie: { ...(serie || {}), figes: nouveaux }, conflit };
}
