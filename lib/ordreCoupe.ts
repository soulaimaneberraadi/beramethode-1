/**
 * Ordre de coupe organise comme a l'atelier :
 *
 *   matiere (tissu, vlieseline, doublure...)
 *     └─ placements : « XS-M », « XS×2 » — un trace PLT, une consommation
 *          └─ matelas : un placement etale sur N plis, avec son numero (« 77 »)
 *
 * Le numero est celui que le traceur ecrira au milieu de chaque piece.
 * Tout ici est pur et teste : un pli de trop, c'est du tissu coupe pour rien.
 */
import type { LaizeCoupe, MatelasFichier, MatelasLine, OrdreCoupe, PlacementCoupe, TissuCoupe, TraceLaize } from '../types';
import { nomPlacement, repartirPlis } from './planMatelas';
import { trouverTaille, type PaireTaille } from './correspondanceTailles';

export const TISSU_PRINCIPAL = 'principal';

/** Les matieres que l'atelier ajoute le plus souvent au tissu principal. */
export const TISSUS_PROPOSES = ['Vlieseline', 'Doublure (foro)', 'Organza', 'Thermocollant', 'Molleton'];

export const tissuDe = (x: { tissu?: string }) => x.tissu || TISSU_PRINCIPAL;

/**
 * Code court d'une matiere, ecrit a cote du numero (« 77 TE », « 77 VSLIN »)
 * et nom de sa feuille Excel : celui saisi, sinon celui de l'atelier.
 */
export function codeMatiere(t: { id: string; nom: string; code?: string }): string {
    if (t.code && t.code.trim()) return t.code.trim().toUpperCase();
    if (t.id === TISSU_PRINCIPAL) return 'TE';
    const n = t.nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    if (/VLIES|VSLIN|VLIZ/.test(n)) return 'VSLIN';
    if (/FORO|FORRO|DOUBL/.test(n)) return 'FO';
    if (/ENTRE|THERMO|ENTOIL|FUSIBL/.test(n)) return 'EN';
    if (/ORGAN/.test(n)) return 'ORG';
    if (/COMBIN/.test(n)) return 'CO';
    if (/MOLLET/.test(n)) return 'MOL';
    return n.replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'MAT';
}

/**
 * Seules les pieces du tissu principal font des vetements : la vlieseline et
 * la doublure se coupent en plus, elles ne doivent jamais gonfler la quantite.
 */
export const estPrincipal = (x: { tissu?: string }) => tissuDe(x) === TISSU_PRINCIPAL;


/** Prochain code de trace d'une matiere : FO-01, FO-02... (apres le plus grand deja pris). */
export function codeTraceSuivant(prefixe: string, codes: (string | undefined)[]): string {
    const p = prefixe.toUpperCase();
    let max = 0;
    for (const c of codes) {
        const brut = (c || '').trim().toUpperCase();
        if (!brut.startsWith(`${p}-`)) continue;
        const n = Number(brut.slice(p.length + 1));
        if (Number.isInteger(n)) max = Math.max(max, n);
    }
    return `${p}-${String(max + 1).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Ecriture de l'atelier : « XS-M », « XS a M », « XS×2 »               */
/* ------------------------------------------------------------------ */

/**
 * « XS-M »      -> XS et M seulement
 * « XS a M »    -> de XS a M : XS, S, M (aussi « XS-a-M », « XS à M »)
 * « XS×2 »      -> deux XS par pli (aussi « XS*2 », « XSx2 »)
 * « S-M×2-L »   -> un S, deux M, un L
 * Rend null si une taille n'existe pas dans la commande.
 */
export function lireNotation(texte: string, tailles: string[], table?: PaireTaille[]): Record<string, number> | null {
    // Une taille de la notation qui n'est pas dans la commande mais dont l'equivalent y est (« S » dans un
    // modele en 36...) est lue comme cette taille : la commande n'a qu'une colonne par taille.
    const position = (t: string): number | undefined => {
        const cible = trouverTaille(t, tailles, table);
        return cible === undefined ? undefined : tailles.indexOf(cible);
    };
    const brut = texte.trim()
        .replace(/\s*-\s*[aà]\s*-\s*/gi, ' à ')
        .replace(/\s+[aà]\s+/gi, ' à ');
    if (!brut) return null;
    const ratios: Record<string, number> = {};
    const ajouter = (t: string, n: number) => { ratios[t] = (ratios[t] || 0) + n; };

    const sansParentheses = (s: string) => s.replace(/[()]/g, '').trim();
    for (const morceau of brut.split(/\s*[-,+]\s*/).filter(Boolean)) {
        // « XS×2 » : un multiple n'est reconnu que si ce qui precede est une taille
        // (ou un intervalle) — « XXL » ou « 3XL » restent des tailles entieres.
        const m = /^(.*?)\s*[×x*]\s*(\d+)$/i.exec(morceau);
        const avant = m ? sansParentheses(m[1]) : '';
        const estMultiple = !!m && (position(avant) !== undefined || avant.includes(' à '));
        const corps = estMultiple ? avant : sansParentheses(morceau);
        const fois = estMultiple ? Number(m![2]) : 1;
        if (fois < 1) return null;

        const intervalle = corps.split(' à ');
        if (intervalle.length === 2) {
            const i = position(intervalle[0]);
            const j = position(intervalle[1]);
            if (i === undefined || j === undefined) return null;
            for (let k = Math.min(i, j); k <= Math.max(i, j); k++) ajouter(tailles[k], fois);
            continue;
        }
        const i = position(corps);
        if (i === undefined) return null;
        ajouter(tailles[i], fois);
    }
    return Object.keys(ratios).length ? ratios : null;
}

/* ------------------------------------------------------------------ */
/* En-tete Optitex d'un trace                                           */
/* ------------------------------------------------------------------ */

export interface EnteteTrace {
    modele?: string;
    /** Tailles du trace et pieces par pli, telles qu'ecrites dans le fichier. */
    tailles?: Record<string, number>;
    laizeCm?: number;
    longueurM?: number;
    efficience?: number;
}

const nombre = (s: string) => Number(s.replace(',', '.'));

/**
 * Optitex ecrit hors matiere :
 *   « MODELE:TAIL/QTE:LADIES-BLOUSE:10/1,12/2,14/2,16/1; »
 *   « LA=139.70CM LO=7M 5.96CM E=87.77% »
 * On y lit les tailles du placement, la laize, la longueur et l'efficience.
 */
export function lireEntete(textes: string[]): EnteteTrace {
    const tout = textes.join(' ');
    const out: EnteteTrace = {};

    const qte = /MODELE\s*:\s*TAIL\s*\/\s*QTE\s*:\s*([^;]*)/i.exec(tout);
    if (qte) {
        /*
         * Chaque element peut repeter le modele : « 4-56RNZ:S/10,4-56RNZ:S/4 »
         * (24 S), « CO-XS:XS/1,CO-L:L/1 » (un XS, un L). Lire seulement apres le
         * dernier « : » de toute la liste ne gardait que la derniere taille.
         */
        const tailles: Record<string, number> = {};
        for (const item of qte[1].split(',')) {
            const brut = item.trim();
            if (!brut) continue;
            const deuxPoints = brut.lastIndexOf(':');
            if (deuxPoints > 0 && !out.modele) out.modele = brut.slice(0, deuxPoints).trim();
            const m = /^\s*([^/]+?)\s*\/\s*(\d+)\s*$/.exec(deuxPoints >= 0 ? brut.slice(deuxPoints + 1) : brut);
            if (m) tailles[m[1]] = (tailles[m[1]] || 0) + Number(m[2]);
        }
        if (Object.keys(tailles).length) out.tailles = tailles;
    }
    const la = /LA\s*=\s*([\d.,]+)\s*CM/i.exec(tout);
    if (la) out.laizeCm = nombre(la[1]);
    const lo = /LO\s*=\s*(?:(\d+)\s*M)?\s*([\d.,]+)\s*CM/i.exec(tout);
    if (lo) out.longueurM = (lo[1] ? Number(lo[1]) : 0) + nombre(lo[2]) / 100;
    const e = /\bE\s*=\s*([\d.,]+)\s*%/i.exec(tout);
    if (e) out.efficience = nombre(e[1]);
    return out;
}

/**
 * Tailles du fichier -> tailles de la commande (« s » et « S » sont la meme ; « XS » et « 34 »
 * aussi quand la table de correspondance de l'usine le dit).
 * `inconnues` : tailles du trace absentes de la commande — a signaler, jamais a ignorer.
 */
export function associerTailles(duFichier: Record<string, number>, tailles: string[], table?: PaireTaille[]): { ratios: Record<string, number>; inconnues: string[] } {
    const ratios: Record<string, number> = {};
    const inconnues: string[] = [];
    for (const [t, n] of Object.entries(duFichier)) {
        // La meme ecriture d'abord, puis l'equivalent de la table (« XS » -> « 34 »).
        const cible = trouverTaille(t, tailles, table);
        if (cible) ratios[cible] = (ratios[cible] || 0) + n;
        else inconnues.push(t);
    }
    return { ratios, inconnues };
}

/* ------------------------------------------------------------------ */
/* Plis d'une liste de placements pour une couleur                      */
/* ------------------------------------------------------------------ */

export interface PlisCalcules {
    /** Plis par placement (id). */
    plis: Record<string, number>;
    /** Coupe moins commande, par taille : 0 partout = exact ; negatif = il manque. */
    ecart: Record<string, number>;
    exact: boolean;
}

/**
 * Plis de chaque placement choisi par l'atelier pour couvrir une commande,
 * sans jamais couper plus que commande. D'abord ce qui est force (une taille
 * servie par un seul placement), puis une recherche bornee sur le reste.
 */
export function plisPourPlacements(placements: Pick<PlacementCoupe, 'id' | 'ratios'>[], cibles: Record<string, number>, tailles: string[]): PlisCalcules {
    const r = placements.map(p => tailles.map(t => Math.max(0, Math.floor(Number(p.ratios[t]) || 0))));
    const reste = tailles.map(t => Math.max(0, Math.floor(Number(cibles[t]) || 0)));
    const plis = placements.map(() => 0);
    const libre = placements.map((_, k) => r[k].some(v => v > 0));

    const plafond = (k: number) => {
        let m = Infinity;
        r[k].forEach((v, s) => { if (v > 0) m = Math.min(m, Math.floor(reste[s] / v)); });
        return Number.isFinite(m) ? m : 0;
    };
    const poser = (k: number, p: number) => {
        plis[k] += p;
        r[k].forEach((v, s) => { reste[s] -= v * p; });
        libre[k] = false;
    };

    // 1. Une taille servie par un seul placement libre fixe ses plis.
    for (let tour = 0; tour < placements.length; tour++) {
        let avance = false;
        for (let s = 0; s < tailles.length; s++) {
            if (reste[s] <= 0) continue;
            const servants = placements.map((_, k) => k).filter(k => libre[k] && r[k][s] > 0);
            if (servants.length !== 1) continue;
            const k = servants[0];
            poser(k, Math.min(Math.floor(reste[s] / r[k][s]), plafond(k)));
            avance = true;
        }
        if (!avance) break;
    }

    // 2. Le reste : recherche bornee, au plus pres de la commande.
    const libres = placements.map((_, k) => k).filter(k => libre[k]);
    if (libres.length > 0) {
        let meilleur = { manque: reste.reduce((a, b) => a + b, 0), choix: libres.map(() => 0) };
        let essais = 0;
        const choix = libres.map(() => 0);
        const explorer = (i: number) => {
            if (++essais > 200000) return;
            if (i === libres.length) {
                const manque = reste.reduce((a, b) => a + b, 0);
                if (manque < meilleur.manque) meilleur = { manque, choix: [...choix] };
                return;
            }
            const k = libres[i];
            for (let p = plafond(k); p >= 0; p--) {
                choix[i] = p;
                r[k].forEach((v, s) => { reste[s] -= v * p; });
                explorer(i + 1);
                r[k].forEach((v, s) => { reste[s] += v * p; });
                if (meilleur.manque === 0 || essais > 200000) return;
            }
        };
        explorer(0);
        libres.forEach((k, i) => poser(k, meilleur.choix[i]));
    }

    const ecart: Record<string, number> = {};
    tailles.forEach((t, s) => { ecart[t] = reste[s] === 0 ? 0 : -reste[s]; });
    const out: Record<string, number> = {};
    placements.forEach((p, k) => { out[p.id] = plis[k]; });
    return { plis: out, ecart, exact: reste.every(x => x === 0) };
}

/* ------------------------------------------------------------------ */
/* Numeros d'ordre                                                      */
/* ------------------------------------------------------------------ */

export type SensNumerotation = 'grand' | 'petit' | 'tableau';

const piecesDe = (l: MatelasLine) => (l.plis || 0) * Object.values(l.ratios || {}).reduce((s, v) => s + (Number(v) || 0), 0);

/**
 * Numerote les matelas d'une matiere a partir de `depart`. La plupart des
 * clients commencent par le plus gros matelas, certains par le plus petit ;
 * « tableau » garde l'ordre des lignes. Les matelas deja coupes gardent leur numero.
 */
export function renumeroter(lignes: MatelasLine[], tissu: string, depart: number, sens: SensNumerotation): MatelasLine[] {
    const concernes = lignes.map((l, i) => ({ l, i })).filter(x => tissuDe(x.l) === tissu && !x.l.fait);
    const pris = new Set(lignes.filter(l => tissuDe(l) === tissu && l.fait && l.numero).map(l => String(l.numero)));
    if (sens !== 'tableau') concernes.sort((a, b) => (sens === 'grand' ? piecesDe(b.l) - piecesDe(a.l) : piecesDe(a.l) - piecesDe(b.l)) || a.i - b.i);
    const numeros = new Map<number, string>();
    let n = Math.max(0, Math.floor(depart));
    for (const x of concernes) {
        while (pris.has(String(n))) n++;
        numeros.set(x.i, String(n));
        n++;
    }
    return lignes.map((l, i) => (numeros.has(i) ? { ...l, numero: numeros.get(i) } : l));
}

/** Prochain numero libre d'une matiere : apres le plus grand deja donne. */
export const numeroSuivant = (lignes: MatelasLine[], tissu: string): number => {
    const nums = lignes.filter(l => tissuDe(l) === tissu).map(l => parseInt(String(l.numero ?? ''), 10)).filter(Number.isFinite);
    return nums.length ? Math.max(...nums) + 1 : 1;
};

/* ------------------------------------------------------------------ */
/* Placements et matelas                                                */
/* ------------------------------------------------------------------ */

/**
 * Un placement modifie (tailles, longueur) se reporte sur ses matelas pas
 * encore coupes. Un matelas coupe garde ce qu'il a reellement consomme.
 */
export function appliquerPlacement(lignes: MatelasLine[], p: PlacementCoupe): MatelasLine[] {
    return lignes.map(l => (l.placementId === p.id && !l.fait
        ? { ...l, ratios: { ...p.ratios }, longTracee: p.longueurM ?? l.longTracee ?? 0, tissu: p.tissu }
        : l));
}

/** Matelas d'un placement pour une couleur : plis repartis a parts egales sous le maximum. */
export function matelasDuPlacement(p: PlacementCoupe, couleur: string | undefined, plisTotal: number, maxParDefaut: number, premierNumero: number): MatelasLine[] {
    return repartirPlis(plisTotal, p.maxPlis || maxParDefaut).filter(n => n > 0).map((plis, i) => ({
        id: `MAT-${p.id}-${couleur || 'X'}-${Date.now().toString(36)}-${i}`,
        couleur,
        plis,
        longTracee: p.longueurM || 0,
        ratios: { ...p.ratios },
        placementId: p.id,
        tissu: p.tissu,
        numero: String(premierNumero + i),
    }));
}

/** « 201-SHIRT-40000.plt » + Tissu + 77 + XS-M -> « 201-SHIRT-40000-Tissu-77-XS-M.plt ». */
export function nomFichierMatelas(p: Pick<PlacementCoupe, 'nom' | 'fichier'>, tissuNom: string, numero: string): string {
    const base = (p.fichier?.nom || p.nom || 'trace').replace(/\.(plt|hpgl|hgl|prn)$/i, '');
    return `${base}-${tissuNom}-${numero}-${p.nom}`
        .replace(/[×]/g, 'x')
        .replace(/[<>:"/\\|?*\s]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 150) + '.plt';
}

/* ------------------------------------------------------------------ */
/* Ordres enregistres avant les placements                              */
/* ------------------------------------------------------------------ */

/**
 * Un ordre d'avant : des lignes qui portaient chacune leurs tailles, leur
 * longueur et leur fichier. On regroupe les lignes identiques en placements,
 * on numerote dans l'ordre du tableau (le numero qu'elles avaient deja), et
 * le metrage recu devient celui du tissu principal. Rien n'est supprime.
 */
/**
 * Placements enregistres avant les codes : ils n'affichaient qu'un exemple
 * grise (« TE-01 ») que rien ne portait — ni le rattachement des traces par nom
 * de fichier, ni la feuille TRACES de l'Excel. On leur donne ce code-la, dans
 * l'ordre du tableau, apres ceux deja pris.
 */
export function avecCodes(tissus: TissuCoupe[], placements: PlacementCoupe[]): PlacementCoupe[] {
    if (placements.every(p => p.code)) return placements;
    const pris = new Map<string, (string | undefined)[]>();
    for (const p of placements) pris.set(tissuDe(p), [...(pris.get(tissuDe(p)) || []), p.code]);
    return placements.map(p => {
        if (p.code) return p;
        const t = tissus.find(x => x.id === tissuDe(p)) || { id: tissuDe(p), nom: 'Tissu' };
        const codes = pris.get(tissuDe(p)) || [];
        const code = codeTraceSuivant(codeMatiere(t), codes);
        codes.push(code);
        return { ...p, code };
    });
}

export function migrerOrdre(o: OrdreCoupe, tailles: string[]): OrdreCoupe {
    const tissus: TissuCoupe[] = o.tissus && o.tissus.length
        ? o.tissus
        : [{ id: TISSU_PRINCIPAL, nom: 'Tissu', recuM: o.tissuRecu || undefined }];
    const placements: PlacementCoupe[] = [...(o.placements || [])];
    const lignes = o.matelasLines || [];
    if (lignes.every(l => l.placementId || !Object.values(l.ratios || {}).some(v => Number(v) > 0)) && o.tissus && o.placements) {
        return { ...o, tissus, placements: avecCodes(tissus, placements), matelasLines: lignes.map((l, i) => (l.numero ? l : { ...l, numero: String(i + 1) })) };
    }

    const parCle = new Map<string, PlacementCoupe>();
    const fichierPar = new Map<string, MatelasFichier>();
    const nouvelles = lignes.map((l, i) => {
        const numero = l.numero || String(i + 1);
        const somme = Object.values(l.ratios || {}).reduce((s, v) => s + (Number(v) || 0), 0);
        if (l.placementId || somme <= 0) return { ...l, numero };
        const nom = nomPlacement(l.ratios || {}, tailles) || 'Placement';
        const cle = [tissuDe(l), nom, (l.matiere || '').trim().toLowerCase(), l.longTracee || 0, l.fichier?.id || ''].join('|');
        let p = parCle.get(cle);
        if (!p) {
            const homonymes = [...parCle.values()].filter(x => x.nom === nom || x.nom.startsWith(`${nom} (`)).length;
            p = {
                id: `PLC-${Date.now().toString(36)}-${parCle.size}`,
                tissu: tissuDe(l),
                nom: homonymes ? `${nom} (${homonymes + 1})` : nom,
                ratios: { ...(l.ratios || {}) },
                longueurM: l.longTracee || undefined,
            };
            parCle.set(cle, p);
            placements.push(p);
        }
        if (l.fichier) {
            if (l.fichier.data) fichierPar.set(p.id, l.fichier);
            else if (!fichierPar.has(p.id)) fichierPar.set(p.id, l.fichier);
        }
        return { ...l, numero, placementId: p.id, tissu: tissuDe(l) === TISSU_PRINCIPAL ? undefined : l.tissu };
    });
    for (const p of placements) if (!p.fichier && fichierPar.has(p.id)) p.fichier = fichierPar.get(p.id);
    return { ...o, tissus, placements: avecCodes(tissus, placements), matelasLines: nouvelles };
}

/* ------------------------------------------------------------------ */
/* Laize du tissu qui change en cours d'ordre                           */
/* ------------------------------------------------------------------ */

/** Champs d'un placement qui dependent de la laize (le trace et ce qu'on en lit). */
export const CHAMPS_TRACE = ['fichier', 'longueurM', 'laizeCm', 'efficience', 'taillesTrace', 'taillesFichier', 'ecartAccepte', 'numerotation'] as const;

const extraireTrace = (p: PlacementCoupe): TraceLaize => {
    const t: TraceLaize = {};
    for (const k of CHAMPS_TRACE) if (p[k] !== undefined) (t as any)[k] = p[k];
    return t;
};

const sansTrace = (p: PlacementCoupe): PlacementCoupe => {
    const q = { ...p };
    for (const k of CHAMPS_TRACE) delete (q as any)[k];
    return q;
};

/** Laize la plus frequente des traces deja deposes (cm), pour nommer la premiere laize. */
const laizeDesTraces = (placements: PlacementCoupe[]): number | undefined => {
    const compte = new Map<number, number>();
    for (const p of placements) if ((p.laizeCm || 0) > 0) compte.set(Math.round(p.laizeCm!), (compte.get(Math.round(p.laizeCm!)) || 0) + 1);
    return [...compte.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** Laizes de la matiere : au moins une, celle du tissu (ou des traces) tant qu'aucune n'a ete creee. */
export function laizesDe(t: TissuCoupe, placements: PlacementCoupe[]): { laizes: LaizeCoupe[]; active: string | undefined; implicite: boolean } {
    if (t.laizes && t.laizes.length) return { laizes: t.laizes, active: t.laizeActive || t.laizes[0].id, implicite: false };
    const cm = Number(t.laizeCm) > 0 ? Number(t.laizeCm) : laizeDesTraces(placements.filter(p => p.tissu === t.id));
    return { laizes: cm ? [{ id: 'L1', cm, creeLe: '' }] : [], active: cm ? 'L1' : undefined, implicite: true };
}

const lignesDuTissu = (o: OrdreCoupe, tissuId: string) => (l: MatelasLine) => tissuDe(l) === tissuId;

/**
 * Nouvelle laize pour la matiere (le tissu arrive a `cm`). La premiere fois, la
 * laize d'origine est d'abord inscrite et tous les matelas existants y sont
 * rattaches : les coupes gardent ainsi leur trace. La nouvelle n'est pas encore
 * active — il faut la choisir (et confirmer).
 */
export function creerLaize(o: OrdreCoupe, tissuId: string, cm: number, maintenant = new Date().toISOString()): { ordre: OrdreCoupe; id: string } {
    const tissus = o.tissus && o.tissus.length ? o.tissus : [{ id: TISSU_PRINCIPAL, nom: 'Tissu' } as TissuCoupe];
    const t = tissus.find(x => x.id === tissuId);
    if (!t) return { ordre: o, id: '' };
    const { laizes, active, implicite } = laizesDe(t, o.placements || []);
    let liste = [...laizes];
    let lignes = o.matelasLines || [];
    let actif = active;
    if (implicite) {
        const origine: LaizeCoupe = liste[0] ? { ...liste[0], id: 'L1', creeLe: maintenant } : { id: 'L1', cm: Number(t.laizeCm) || cm, creeLe: maintenant };
        liste = [origine];
        actif = origine.id;
        const dans = lignesDuTissu(o, tissuId);
        lignes = lignes.map(l => (dans(l) && !l.laizeId ? { ...l, laizeId: origine.id } : l));
    }
    const existe = liste.find(x => Math.abs(x.cm - cm) < 0.05);
    if (existe) {
        const tissusMaj = tissus.map(x => (x.id === tissuId ? { ...x, laizes: liste, laizeActive: actif, laizeCm: x.laizeCm ?? liste[0].cm } : x));
        return { ordre: { ...o, tissus: tissusMaj, matelasLines: lignes }, id: existe.id };
    }
    const id = `L${liste.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0) + 1}`;
    liste.push({ id, cm, creeLe: maintenant });
    const tissusMaj = tissus.map(x => (x.id === tissuId ? { ...x, laizes: liste, laizeActive: actif, laizeCm: x.laizeCm ?? liste[0].cm } : x));
    return { ordre: { ...o, tissus: tissusMaj, matelasLines: lignes }, id };
}

/**
 * Passe la matiere sur une autre laize : chaque placement range le trace de la
 * laize quittee et ressort celui de la nouvelle (rien si elle n'en a pas encore :
 * « Deposer le .plt »). Les matelas coupes gardent leur laize ; ceux qui restent
 * a couper passent sur la nouvelle, avec sa longueur (0 tant que son trace
 * manque : leur tissu s'affiche « — », jamais un chiffre faux).
 */
export function changerLaize(o: OrdreCoupe, tissuId: string, laizeId: string): OrdreCoupe {
    const tissus = o.tissus || [];
    const t = tissus.find(x => x.id === tissuId);
    if (!t || !t.laizes?.some(x => x.id === laizeId)) return o;
    const quittee = t.laizeActive || t.laizes[0].id;
    if (quittee === laizeId) return o;
    const cible = t.laizes.find(x => x.id === laizeId)!;
    const placements = (o.placements || []).map(p => {
        if (p.tissu !== tissuId) return p;
        const archives = { ...(p.tracesLaize || {}), [quittee]: extraireTrace(p) };
        const ressort = archives[laizeId] || {};
        delete archives[laizeId];
        return { ...sansTrace(p), ...ressort, tracesLaize: archives };
    });
    const dans = lignesDuTissu(o, tissuId);
    const longueur = new Map(placements.map(p => [p.id, p.longueurM || 0]));
    const matelasLines = (o.matelasLines || []).map(l => {
        if (!dans(l)) return l;
        if (l.fait) return l.laizeId ? l : { ...l, laizeId: quittee };
        return { ...l, laizeId, longTracee: l.placementId ? (longueur.get(l.placementId) ?? 0) : l.longTracee };
    });
    return {
        ...o,
        placements,
        matelasLines,
        tissus: tissus.map(x => (x.id === tissuId ? { ...x, laizeActive: laizeId, laizeCm: cible.cm } : x)),
    };
}

/** Le placement tel que le matelas l'a coupe : avec le trace de sa laize s'il n'est pas celui en cours. */
export function placementPourLigne(p: PlacementCoupe, l: Pick<MatelasLine, 'laizeId'>, laizeActive?: string): PlacementCoupe {
    if (!l.laizeId || !laizeActive || l.laizeId === laizeActive) return p;
    const t = p.tracesLaize?.[l.laizeId];
    return t ? { ...sansTrace(p), ...t } : sansTrace(p);
}
