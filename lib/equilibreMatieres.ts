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
 * taille (et couleur par couleur quand chaque matiere a ses couleurs) : on lui
 * rattache les matelas qu'il faut en plus pour ca, dans l'ordre de leurs
 * numeros. Les matelas rattaches forment des LOTS, comme sur la feuille de
 * l'atelier :
 *
 *     lot   Tissu        Vlieseline    Foro        vetements
 *      1    1 S          1 S-M         1 S a L        150
 *           2 M          2 L
 *           3 L
 *      2    4 XL, 5 S    3 XL-S        2 XL-S         240
 *
 * Un matelas de tissu deja couvert par ce qui est rattache au lot reste dans
 * le lot ; un lot se ferme quand toutes les matieres tombent juste. Quand les
 * plis ne tombent jamais juste (100 plis de tissu, 99 de vlieseline), chaque
 * matelas de tissu fait son lot avec les matelas qui le couvrent.
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
     * lot : les numeros de ce lot, et combien d'autres matelas (pris plus haut).
     */
    attente: Record<string, { numeros: string[]; ailleurs: number }>;
}

export interface BilanMatiere {
    nbMatelas: number;
    nbCoupes: number;
    nbEnvoyes: number;
    pieces: number;
    piecesCoupees: number;
}

export interface EquilibreOrdre {
    matieres: MatiereEquilibre[];
    lots: LotEquilibre[];
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
    // Ordre de coupe : le numero, puis l'ordre du tableau. Ce qui est deja coupe passe d'abord :
    // en salle, n'importe quel matelas du meme placement fait l'affaire, et les pieces deja
    // coupees servent les premiers vetements.
    const rangDe = new Map(lignes.map(x => [x.l.id, x.rang]));
    const parNumero = (a: MatelasEquilibre, b: MatelasEquilibre) => numeroTri(a.numero) - numeroTri(b.numero) || (rangDe.get(a.id) || 0) - (rangDe.get(b.id) || 0);
    const RANG_ETAT: Record<EtatMatelas, number> = { coupe: 0, envoye: 1, a_faire: 2 };
    for (const id of ids) parMat[id].sort((a, b) => (id === P ? (a.etat === 'coupe' ? 0 : 1) - (b.etat === 'coupe' ? 0 : 1) : RANG_ETAT[a.etat] - RANG_ETAT[b.etat]) || parNumero(a, b));

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

    /* ---- Couverture : pour chaque matelas de tissu, ce que les autres matieres doivent couper ---- */
    // Matelas d'une matiere qui portent une cle, dans l'ordre de leurs numeros.
    const porteurs: Record<string, Record<string, number[]>> = {};
    for (const id of autres) {
        porteurs[id] = {};
        parMat[id].forEach((x, j) => { for (const k in x.pieces) (porteurs[id][k] ||= []).push(j); });
    }
    const pris: Record<string, boolean[]> = {};
    const prochain: Record<string, Record<string, number>> = {};
    const couvert: Record<string, Vecteur> = {};
    for (const id of autres) { pris[id] = parMat[id].map(() => false); prochain[id] = {}; couvert[id] = {}; }
    const demande: Vecteur = {};

    interface Etape { x: MatelasEquilibre; nouveaux: Record<string, number[]>; avant: Vecteur; apres: Vecteur; requis: Record<string, Set<number>>; juste: boolean }
    const etapes: Etape[] = [];
    const requisCumul: Record<string, Set<number>> = {};
    for (const id of autres) requisCumul[id] = new Set();
    for (const x of parMat[P]) {
        const avant = { ...demande };
        ajouter(demande, x.pieces);
        const nouveaux: Record<string, number[]> = {};
        for (const id of autres) {
            nouveaux[id] = [];
            for (const k in x.pieces) {
                if (!concerne(id, k)) continue;
                const liste = porteurs[id][k] || [];
                let i = prochain[id][k] || 0;
                while ((couvert[id][k] || 0) < demande[k] && i < liste.length) {
                    const j = liste[i++];
                    if (pris[id][j]) continue;
                    pris[id][j] = true;
                    nouveaux[id].push(j);
                    requisCumul[id].add(j);
                    ajouter(couvert[id], parMat[id][j].pieces);
                }
                prochain[id][k] = i;
            }
        }
        // Toutes les matieres tombent juste ici : un lot peut se fermer.
        const juste = autres.every(id => {
            const cles = new Set([...Object.keys(demande), ...Object.keys(couvert[id])]);
            for (const k of cles) if (concerne(id, k) && (couvert[id][k] || 0) !== (demande[k] || 0)) return false;
            return true;
        });
        const requis: Record<string, Set<number>> = {};
        for (const id of autres) requis[id] = new Set(requisCumul[id]);
        etapes.push({ x, nouveaux, avant, apres: { ...demande }, requis, juste });
    }

    /* ---- Lots ---- */
    // Un matelas de tissu rejoint le lot ouvert s'il ne demande rien de nouveau (deja couvert),
    // ou si, avec ce qu'il demande, toutes les matieres tombent juste. Un lot juste est ferme.
    const groupes: Etape[][] = [];
    let ouvert: Etape[] | null = null;
    for (const e of etapes) {
        const rien = autres.every(id => e.nouveaux[id].length === 0);
        if (ouvert && (rien || e.juste)) ouvert.push(e);
        else { ouvert = [e]; groupes.push(ouvert); }
        if (e.juste) ouvert = null;
    }

    const coupeAutre = (id: string, j: number) => parMat[id][j].etat === 'coupe';
    // Pieces couvertes par les matelas deja coupes de chaque matiere.
    const couvCoupe: Record<string, Vecteur> = {};
    for (const id of autres) couvCoupe[id] = coupe[id];

    const lots: LotEquilibre[] = groupes.map((g, n) => {
        const matelas: Record<string, MatelasEquilibre[]> = {};
        matelas[P] = g.map(e => e.x);
        for (const id of autres) matelas[id] = g.flatMap(e => e.nouveaux[id]).map(j => parMat[id][j]).sort(parNumero);
        const debut = g[0].avant, fin = g[g.length - 1].apres;
        const vetements = g.reduce((s, e) => s + e.x.total, 0);

        // Pret : pieces du lot coupees en tissu, et couvertes par ce qui est coupe des autres matieres.
        const coupeLot: Vecteur = {};
        for (const e of g) if (e.x.etat === 'coupe') ajouter(coupeLot, e.x.pieces);
        let prets = 0;
        for (const k in coupeLot) {
            let n = coupeLot[k];
            for (const id of autres) if (concerne(id, k)) n = Math.min(n, Math.max(0, (couvCoupe[id][k] || 0) - (debut[k] || 0)));
            prets += n;
        }

        // Manque : pieces du lot qu'aucun matelas de la matiere ne couvre.
        const manque: EcartEquilibre[] = [];
        for (const id of autres) {
            const couv: Vecteur = {};
            for (const j of g[g.length - 1].requis[id]) ajouter(couv, parMat[id][j].pieces);
            for (const k of trierCles(Object.keys(fin))) {
                if (!concerne(id, k)) continue;
                const m = (fin[k] || 0) - Math.max(couv[k] || 0, debut[k] || 0);
                if (m > 0) manque.push(ecart(id, k, -m));
            }
        }

        // Retard : les pieces du tissu coupe du lot que les matelas coupes des autres matieres
        // ne couvrent pas encore, et les matelas a couper pour ca (dans l'ordre de coupe).
        const dernierCoupe = [...g].reverse().find(e => e.x.etat === 'coupe');
        const attente: Record<string, { numeros: string[]; ailleurs: number }> = {};
        if (dernierCoupe) {
            for (const id of autres) {
                const manqueCoupe: Vecteur = {};
                for (const k in dernierCoupe.apres) {
                    if (!concerne(id, k)) continue;
                    const d = dernierCoupe.apres[k] - (couvCoupe[id][k] || 0);
                    if (d > 0) manqueCoupe[k] = d;
                }
                if (!Object.keys(manqueCoupe).length) continue;
                const ici = new Set(matelas[id].map(x => x.id));
                const numeros: string[] = [];
                let ailleurs = 0;
                for (let j = 0; j < parMat[id].length && Object.keys(manqueCoupe).length; j++) {
                    const x = parMat[id][j];
                    if (coupeAutre(id, j) || !Object.keys(manqueCoupe).some(k => (x.pieces[k] || 0) > 0)) continue;
                    for (const k in x.pieces) if (manqueCoupe[k] !== undefined) { manqueCoupe[k] -= x.pieces[k]; if (manqueCoupe[k] <= 0) delete manqueCoupe[k]; }
                    if (ici.has(x.id)) numeros.push(x.numero); else ailleurs++;
                }
                attente[id] = { numeros, ailleurs };
            }
        }
        const tous = ids.flatMap(id => matelas[id]);
        const etat: LotEquilibre['etat'] = tous.every(x => x.etat === 'coupe') ? 'coupe'
            : tous.every(x => x.etat === 'a_faire') ? 'a_faire' : 'en_cours';
        return { rang: n + 1, matelas, vetements, prets, manque, etat, retard: Object.keys(attente), attente };
    });

    const enPlus: Record<string, MatelasEquilibre[]> = {};
    for (const id of autres) {
        const reste = parMat[id].filter((_, j) => !pris[id][j]);
        if (reste.length) enPlus[id] = reste;
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

    return {
        matieres, lots, enPlus, parCouleur,
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
