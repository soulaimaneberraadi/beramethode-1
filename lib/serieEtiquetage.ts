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
 * Une fois le matelas coupe, ses plages se figent : ses etiquettes sont collees.
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
    /** Plage figee a la coupe : elle ne bouge plus. */
    fige?: boolean;
}

const numeroTri = (l: MatelasLine) => {
    const n = parseInt(String(l.numero ?? ''), 10);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

/**
 * Paquets du tissu principal, dans l'ordre des numeros de matelas, avec leurs plages.
 * Un paquet fige (matelas deja coupe) garde sa plage ; les autres suivent en
 * sautant les plages figees, sans jamais les chevaucher.
 */
export function paquetsSerie(lignes: MatelasLine[], tailles: string[], depart = 1, figes?: SerieEtiquetage['figes']): PaquetSerie[] {
    const bloquees = Object.values(figes || {}).filter(f => Number.isFinite(f?.debut) && Number.isFinite(f?.fin)).sort((a, b) => a.debut - b.debut);
    const libre = (n: number, plis: number) => {
        for (let bouge = true; bouge;) {
            bouge = false;
            for (const f of bloquees) if (f.debut <= n + plis - 1 && f.fin >= n) { n = f.fin + 1; bouge = true; }
        }
        return n;
    };
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
                const cle = `${l.id}:${taille}:${k}`;
                const fige = figes?.[cle];
                const debut = fige ? fige.debut : libre(n, plis);
                const fin = fige ? fige.fin : debut + plis - 1;
                out.push({ cle, matelasId: l.id, paquet: l.numero || String(rang + 1), plis, debut, fin, taille, couleur: l.couleur, fait: !!l.fait, fige: !!fige });
                n = Math.max(n, fin + 1);
            }
        }
    }
    return out;
}

/**
 * Coupe (ou decoupe) des matelas : leurs paquets figent la plage qu'ils ont a
 * cet instant, ou la relachent. `lignes` = les matelas APRES le changement
 * (les plis reellement coupes font la plage).
 */
export function figerSerie(serie: SerieEtiquetage | undefined, lignes: MatelasLine[], tailles: string[], ids: string[], figer: boolean): SerieEtiquetage {
    const figes = { ...(serie?.figes || {}) };
    const cibles = new Set(ids);
    if (figer) {
        for (const p of paquetsSerie(lignes, tailles, serie?.depart || 1, figes)) {
            if (cibles.has(p.matelasId) && !figes[p.cle]) figes[p.cle] = { debut: p.debut, fin: p.fin };
        }
    } else {
        for (const k of Object.keys(figes)) if (cibles.has(k.slice(0, k.indexOf(':')))) delete figes[k];
    }
    return { ...(serie || {}), figes };
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

/* ------------------------------------------------------------------ */
/* Lire une feuille SERIE d'Excel                                       */
/* ------------------------------------------------------------------ */

/** Une ligne de la feuille « SERIE » de l'atelier. */
export interface LigneSerieLue {
    paquet: string;
    taille: string;
    plis?: number;
    debut?: number;
    date?: string;
    pieces?: number;
    n?: string;
    entree?: string;
    lote?: string;
    sortie?: string;
    chaine?: string;
}

const sansAccents = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Texte d'une cellule exceljs : nombre, texte, date, formule (son resultat), texte riche. */
function texteDe(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toLocaleDateString('fr-FR');
    if (typeof v === 'object') {
        const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
        if (o.richText) return o.richText.map(x => x.text).join('').trim();
        if ('result' in o) return texteDe(o.result);
        if (typeof o.text === 'string') return o.text.trim();
        return '';
    }
    return String(v).trim();
}
const nombreDe = (v: unknown): number | undefined => {
    const t = texteDe(v).replace(',', '.');
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
};

/**
 * Lit les lignes de la feuille « SERIE » d'un classeur (la premiere feuille
 * dont une ligne porte les titres N° PAQ / SERIE / TAILLE). Les colonnes se
 * reperent par leur titre, pas par leur place.
 */
export async function lireSerieExcel(buffer: ArrayBuffer): Promise<LigneSerieLue[]> {
    const mod = await import('exceljs');
    const ExcelJS = (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    for (const ws of wb.worksheets) {
        let entete = 0;
        const col: Record<string, number> = {};
        for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
            const titres: Record<string, number> = {};
            ws.getRow(r).eachCell((c, n) => { const t = sansAccents(texteDe(c.value)); if (t) titres[t] = n; });
            const paq = Object.keys(titres).find(t => /PAQ/.test(t));
            if (paq && titres['TAILLE'] && (titres['SERIE'] || titres['PLI'])) {
                entete = r;
                col.paquet = titres[paq];
                col.taille = titres['TAILLE'];
                col.plis = titres['PLI'] ?? 0;
                col.debut = titres['SERIE'] ?? 0;
                col.date = titres['DATE'] ?? 0;
                col.pieces = Object.entries(titres).find(([t]) => t.startsWith('PIECES'))?.[1] ?? 0;
                col.n = titres['N'] ?? 0;
                col.entree = titres['ENTREE'] ?? 0;
                col.lote = titres['LOTE'] ?? titres['LOT'] ?? 0;
                col.sortie = titres['SORTE'] ?? titres['SORTIE'] ?? 0;
                col.chaine = titres['CHAINE'] ?? 0;
                break;
            }
        }
        if (!entete) continue;
        const lignes: LigneSerieLue[] = [];
        const v = (row: import('exceljs').Row, k: string) => (col[k] ? row.getCell(col[k]).value : null);
        for (let r = entete + 1; r <= ws.rowCount; r++) {
            const row = ws.getRow(r);
            const paquet = texteDe(v(row, 'paquet'));
            const taille = texteDe(v(row, 'taille'));
            if (!paquet || !taille) continue;
            const l: LigneSerieLue = { paquet, taille, plis: nombreDe(v(row, 'plis')), debut: nombreDe(v(row, 'debut')) };
            const date = texteDe(v(row, 'date')); if (date) l.date = date;
            const pieces = nombreDe(v(row, 'pieces')); if (pieces) l.pieces = pieces;
            const n = texteDe(v(row, 'n')); if (n) l.n = n;
            const entree = texteDe(v(row, 'entree')); if (entree) l.entree = entree;
            const lote = texteDe(v(row, 'lote')); if (lote) l.lote = lote;
            const sortie = texteDe(v(row, 'sortie')); if (sortie) l.sortie = sortie;
            const chaine = texteDe(v(row, 'chaine')); if (chaine) l.chaine = chaine;
            lignes.push(l);
        }
        if (lignes.length) return lignes;
    }
    return [];
}

/**
 * Pose les saisies lues dans Excel sur les paquets calcules. Un paquet est
 * retrouve par son N° de paquet, sa taille et son rang (le 2e « 1 / S » va sur
 * le 2e paquet S du matelas 1). La chaine est rendue par son nom au Planning
 * quand il la connait, sinon gardee telle qu'ecrite.
 */
export function saisiesDepuisSerie(
    paquets: PaquetSerie[],
    lignes: LigneSerieLue[],
    chaines: { id: string; name: string }[] = [],
): { saisies: Record<string, SaisiePaquet>; reprises: number; sansPaquet: number } {
    const cle = (paquet: string, taille: string) => `${String(paquet).trim()}|${sansAccents(taille)}`;
    const libres = new Map<string, PaquetSerie[]>();
    for (const p of paquets) {
        const k = cle(p.paquet, p.taille);
        libres.set(k, [...(libres.get(k) || []), p]);
    }
    const chaineId = (t: string) => {
        const n = sansAccents(t);
        return chaines.find(c => sansAccents(c.name) === n || sansAccents(c.id) === n)?.id || t;
    };
    const saisies: Record<string, SaisiePaquet> = {};
    let reprises = 0, sansPaquet = 0;
    for (const l of lignes) {
        const file = libres.get(cle(l.paquet, l.taille));
        const p = file?.shift();
        if (!p) { sansPaquet++; continue; }
        const sa: SaisiePaquet = {};
        if (l.date) sa.date = l.date;
        if (l.pieces) sa.pieces = l.pieces;
        if (l.n) sa.n = l.n;
        if (l.entree) sa.entree = l.entree;
        if (l.lote) sa.lote = l.lote;
        if (l.sortie) sa.sortie = l.sortie;
        if (l.chaine) sa.chaine = chaineId(l.chaine);
        if (Object.keys(sa).length) { saisies[p.cle] = sa; reprises++; }
    }
    return { saisies, reprises, sansPaquet };
}

/* ------------------------------------------------------------------ */
/* Avancement de la serie, vu du Planning                               */
/* ------------------------------------------------------------------ */

export interface CompteSerie { paquets: number; pieces: number }

export interface AvancementSerie {
    total: CompteSerie;
    /** Matelas coupes : les paquets existent. */
    coupes: CompteSerie;
    /** Paquets partis en chaine (ENTREE saisie). */
    entres: CompteSerie;
    /** Paquets revenus de la chaine (SORTE saisie). */
    sortis: CompteSerie;
    /** Pieces entrees, par chaine (id « CHAINE n »). */
    parChaine: Record<string, number>;
}

/**
 * Ce que la serie d'etiquetage dit de l'avancement d'un modele : combien de
 * paquets sont coupes, entres en chaine, sortis. Les pieces d'un paquet sont
 * ses plis, corrigees par la colonne PIECES (-/+) de l'atelier.
 */
export function avancementSerie(lignes: MatelasLine[], tailles: string[], serie: SerieEtiquetage | undefined): AvancementSerie | null {
    const paquets = paquetsSerie(lignes, tailles, serie?.depart || 1, serie?.figes);
    if (!paquets.length) return null;
    const vide = (): CompteSerie => ({ paquets: 0, pieces: 0 });
    const a: AvancementSerie = { total: vide(), coupes: vide(), entres: vide(), sortis: vide(), parChaine: {} };
    const compter = (c: CompteSerie, n: number) => { c.paquets++; c.pieces += n; };
    for (const p of paquets) {
        const s = saisieDe(serie, p.cle);
        const n = Math.max(0, p.plis + (Number(s.pieces) || 0));
        compter(a.total, n);
        if (p.fait) compter(a.coupes, n);
        if (s.entree) {
            compter(a.entres, n);
            if (s.chaine) a.parChaine[s.chaine] = (a.parChaine[s.chaine] || 0) + n;
        }
        if (s.sortie) compter(a.sortis, n);
    }
    return a;
}
