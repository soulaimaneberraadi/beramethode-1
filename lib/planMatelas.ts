/**
 * Plan de matelas : comment couper une repartition par tailles.
 *
 * Le vocabulaire est celui de l'atelier :
 *  - un PLACEMENT est un melange de tailles par pli (« M-XL », « XS×2 »).
 *    Chaque placement, c'est un trace PLT a faire dans Optitex, avec sa
 *    propre consommation de tissu.
 *  - un MATELAS, c'est un placement etale sur un nombre de plis. Le meme
 *    placement peut servir a plusieurs matelas.
 *
 * Exemple du cahier (Zara RF7887) : XS 50, S 30, M 20, XL 20, deux pieces par
 * pli, 15 plis au plus. L'atelier coupe :
 *    M-XL  10 + 10 plis   ->  M 20, XL 20
 *    XS-S  15 + 15 plis   ->  XS 30, S 30
 *    XS×2  10 plis        ->  XS 20
 * soit 3 traces et 5 matelas. L'ancien calcul donnait 4 traces et 6 matelas,
 * dont deux a une seule piece par pli.
 *
 * Ce qui compte, dans l'ordre :
 *  1. la quantite exacte, taille par taille (ni plus, ni moins) ;
 *  2. le moins de placements possible (chaque trace coute du travail) ;
 *  3. le moins de matelas ;
 *  4. les plus gros placements d'abord, puis des tailles voisines ensemble.
 */

export interface OptionsPlan {
    /** Pieces au plus par pli (« Max bundle ») : la largeur de la table le decide. */
    maxPiecesParPli: number;
    /** Plis au plus par matelas. */
    maxPlisParMatelas: number;
}

export interface Placement {
    /** Pieces par pli, par taille. Les tailles absentes valent 0. */
    ratios: Record<string, number>;
    /** Plis de ce placement, tous matelas confondus. */
    plis: number;
}

export interface MatelasPlanifie {
    ratios: Record<string, number>;
    plis: number;
    /** Nom du placement, commun a tous les matelas qui partagent le meme trace. */
    placement: string;
}

/** « M-XL », « XS×2 », « S×2-M » : l'ecriture de l'atelier. */
export const nomPlacement = (ratios: Record<string, number>, tailles: string[]): string =>
    tailles.filter(t => (ratios[t] || 0) > 0).map(t => (ratios[t] > 1 ? `${t}×${ratios[t]}` : t)).join('-');

/** Plis repartis a parts egales : 20 plis en matelas de 15 au plus -> 10 + 10, pas 15 + 5. */
export const repartirPlis = (plis: number, maxParMatelas: number): number[] => {
    const max = Math.max(1, Math.floor(maxParMatelas));
    const n = Math.max(1, Math.ceil(plis / max));
    const base = Math.floor(plis / n);
    const reste = plis % n;
    return Array.from({ length: n }, (_, i) => base + (i < reste ? 1 : 0));
};

type Pas = { r: number[]; p: number };
type Etat = { reste: number[]; pas: Pas[]; matelas: number };

const LARGEUR_FAISCEAU = 40;
const PROFONDEUR_MAX = 30;
const CANDIDATS_PAR_PLI = 40;

/**
 * Pieces par pli possibles a `p` plis : au plus q_s de chaque taille, `somme`
 * pieces en tout. Les tailles qui tombent juste passent devant, pour que le
 * placement vide des tailles entieres.
 */
function* repartitions(q: number[], somme: number, ordre: number[]): Generator<number[]> {
    const r = new Array(q.length).fill(0);
    function* suite(k: number, restant: number): Generator<number[]> {
        if (restant === 0) { yield r.slice(); return; }
        if (k >= ordre.length) return;
        const i = ordre[k];
        for (let v = Math.min(q[i], restant); v >= 0; v--) {
            r[i] = v;
            yield* suite(k + 1, restant - v);
        }
        r[i] = 0;
    }
    yield* suite(0, somme);
}

function candidats(reste: number[], B: number): Pas[] {
    const n = reste.length;
    const plisPossibles = new Set<number>();
    for (let s = 0; s < n; s++) {
        if (reste[s] <= 0) continue;
        for (let k = 1; k <= B; k++) {
            const v = Math.floor(reste[s] / k);
            if (v >= 1) plisPossibles.add(v);
        }
    }
    const vus = new Set<string>();
    const out: Pas[] = [];
    const ajouter = (r: number[], p: number) => {
        const cle = `${r.join(',')}|${p}`;
        if (p < 1 || vus.has(cle)) return;
        vus.add(cle);
        out.push({ r, p });
    };
    for (const p0 of plisPossibles) {
        const q = reste.map(x => Math.min(B, Math.floor(x / p0)));
        const total = q.reduce((a, b) => a + b, 0);
        if (total === 0) continue;
        const ordre = [...Array(n).keys()]
            .filter(i => q[i] > 0)
            .sort((a, b) => Number(reste[b] % p0 === 0) - Number(reste[a] % p0 === 0) || reste[b] - reste[a] || a - b);
        let compte = 0;
        for (const r of repartitions(q, Math.min(B, total), ordre)) {
            if (++compte > CANDIDATS_PAR_PLI) break;
            // Le plus de plis que ce melange permet...
            let pmax = Infinity;
            for (let i = 0; i < n; i++) if (r[i] > 0) pmax = Math.min(pmax, Math.floor(reste[i] / r[i]));
            if (!Number.isFinite(pmax) || pmax < 1) continue;
            ajouter(r, pmax);
            // ... et chaque nombre de plis qui solde exactement une taille.
            for (let i = 0; i < n; i++) {
                if (r[i] > 0 && reste[i] % r[i] === 0 && reste[i] / r[i] <= pmax) ajouter(r, reste[i] / r[i]);
            }
        }
    }
    return out;
}

const piecesDe = (x: Pas) => x.p * x.r.reduce((a, b) => a + b, 0);
const etendue = (r: number[]) => {
    const idx = r.map((v, i) => (v > 0 ? i : -1)).filter(i => i >= 0);
    return idx.length ? idx[idx.length - 1] - idx[0] : 0;
};

/** a meilleur que b ? (meme nombre de placements) */
const compare = (a: Etat, b: Etat): number => {
    if (a.matelas !== b.matelas) return a.matelas - b.matelas;
    const pa = a.pas.map(piecesDe).sort((x, y) => y - x);
    const pb = b.pas.map(piecesDe).sort((x, y) => y - x);
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
    const ea = a.pas.reduce((s, x) => s + etendue(x.r), 0);
    const eb = b.pas.reduce((s, x) => s + etendue(x.r), 0);
    if (ea !== eb) return ea - eb;
    return a.pas.reduce((s, x) => s + x.p, 0) - b.pas.reduce((s, x) => s + x.p, 0);
};

/**
 * Placements d'une repartition. Recherche en faisceau : a chaque etage, on
 * garde les etats les plus avances ; le premier etage qui solde tout donne le
 * plus petit nombre de placements trouve. Rend null si rien n'est trouve (le
 * cas echeant, l'appelant garde l'ancien calcul).
 */
export function planifierPlacements(tailles: string[], cibles: Record<string, number>, opts: OptionsPlan): Placement[] | null {
    const B = Math.max(1, Math.floor(opts.maxPiecesParPli) || 1);
    const P = Math.max(1, Math.floor(opts.maxPlisParMatelas) || 1);
    const depart = tailles.map(t => Math.max(0, Math.floor(Number(cibles[t]) || 0)));
    if (depart.every(x => x === 0)) return [];

    let etage: Etat[] = [{ reste: depart, pas: [], matelas: 0 }];
    const soldes: Etat[] = [];
    for (let prof = 1; prof <= PROFONDEUR_MAX && etage.length > 0; prof++) {
        const suivants = new Map<string, Etat>();
        for (const e of etage) {
            for (const c of candidats(e.reste, B)) {
                const reste = e.reste.map((x, i) => x - c.r[i] * c.p);
                const suivant: Etat = { reste, pas: [...e.pas, c], matelas: e.matelas + Math.ceil(c.p / P) };
                if (reste.every(x => x === 0)) { soldes.push(suivant); continue; }
                const cle = reste.join(',');
                const deja = suivants.get(cle);
                if (!deja || compare(suivant, deja) < 0) suivants.set(cle, suivant);
            }
        }
        if (soldes.length > 0) break;
        const restantes = (e: Etat) => e.reste.filter(x => x > 0).length;
        const somme = (e: Etat) => e.reste.reduce((a, b) => a + b, 0);
        etage = [...suivants.values()]
            .sort((a, b) => restantes(a) - restantes(b) || somme(a) - somme(b) || compare(a, b))
            .slice(0, LARGEUR_FAISCEAU);
    }
    if (soldes.length === 0) return null;

    const meilleur = soldes.sort(compare)[0];
    // Un meme melange trouve deux fois devient un seul placement : c'est le meme trace.
    const parMelange = new Map<string, Placement>();
    for (const x of meilleur.pas) {
        const cle = x.r.join(',');
        const ratios: Record<string, number> = {};
        tailles.forEach((t, i) => { if (x.r[i] > 0) ratios[t] = x.r[i]; });
        const deja = parMelange.get(cle);
        if (deja) deja.plis += x.p; else parMelange.set(cle, { ratios, plis: x.p });
    }
    const pieces = (pl: Placement) => pl.plis * Object.values(pl.ratios).reduce((a, b) => a + b, 0);
    return [...parMelange.values()].sort((a, b) => pieces(b) - pieces(a));
}

/** Placements -> matelas, plis repartis a parts egales sous le maximum. */
export function decouperEnMatelas(placements: Placement[], tailles: string[], maxPlisParMatelas: number): MatelasPlanifie[] {
    const out: MatelasPlanifie[] = [];
    for (const pl of placements) {
        const nom = nomPlacement(pl.ratios, tailles);
        for (const plis of repartirPlis(pl.plis, maxPlisParMatelas)) out.push({ ratios: { ...pl.ratios }, plis, placement: nom });
    }
    return out;
}

/** Ce que le plan produit, taille par taille. */
export const produitParTaille = (matelas: { ratios: Record<string, number>; plis: number }[], tailles: string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const t of tailles) out[t] = matelas.reduce((s, m) => s + (m.ratios[t] || 0) * m.plis, 0);
    return out;
};
