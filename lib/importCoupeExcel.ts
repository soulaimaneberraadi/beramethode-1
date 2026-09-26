/**
 * Import d'un classeur Excel envoye par un client (donneur d'ordre) pour un
 * ordre de coupe. Deux formats reels rencontres chez les faconniers :
 *
 *  - 'repartos' : la feuille de repartition du client (une commande par
 *    taille, puis un bloc par matiere avec ses "marcadores"/placements et
 *    leurs ratios, ex. ' REPARTO LANOCORTE', 'MELO SANTOS',
 *    'REPARTO MARCADAS MARRUECOS'). Mise en page libre, texte en espagnol.
 *  - 'atelier' : la feuille interne de l'atelier (reperee par l'en-tete
 *    B='Colchon' C='ordre'), une feuille par matiere (nom de feuille =
 *    'Tissu'/'FO'/'EN'...), avec les matelas deja etales et leurs ratios
 *    ecrits en formule (ex. 'D16*2').
 *
 * Lecture pure (aucun DOM, aucun etat) : lireClasseurCoupe prend un buffer et
 * rend la liste des feuilles importables. Marche en navigateur et en Node
 * (tests) via import dynamique d'exceljs, comme lib/coupeExcel.ts.
 *
 * Lancer les tests : node --import tsx lib/importCoupeExcel.test.ts
 */
import type ExcelJS from 'exceljs';

/* ------------------------------------------------------------------ */
/* Types publics                                                       */
/* ------------------------------------------------------------------ */

export interface PlacementImporte {
    /** Code du marqueur, ex. 'TE-01', 'FO-05', 'EN-01', 'CO-02', 'C1-03' (aussi le suffixe du fichier PLT). */
    code: string;
    /** Tel qu'ecrit dans le classeur : 'XS A L', 'XS-M', 'S - M', 'M-M', 'S'. */
    taillesTexte: string;
    /** Tel qu'ecrit : '1 DE CADA', '2+2+2', '6', '45', ''. */
    ratiosTexte: string;
    /** Pieces par pli, par taille (cles = tailles de la commande). null si illisible. */
    ratios: Record<string, number> | null;
    /** Longueur du marqueur par pli, en metres (colonne C). */
    longueurM?: number;
    /** Nombre de plis a couper (colonne I). */
    plis?: number;
    /** Message en francais quand la lecture est ambigue. */
    aVerifier?: string;
}

export interface MatelasImporte {
    notation: string;
    ratios: Record<string, number> | null;
    numero?: string;
    plis: number;
    longueurM?: number;
}

export interface MatiereImportee {
    /** 'TELA', 'FORRO', 'ENTRETELA', 'COMBINADO', 'Tissu'... */
    nom: string;
    /** Reference tissu ecrite a cote, ex. '3-156/605', '3550-800', '2916 NEGRA'. */
    ref?: string;
    /** Prefixe de ses marqueurs : 'TE', 'FO', 'EN', 'CO', 'C1'. */
    code?: string;
    /** true pour la matiere principale (feuille/bloc TELA/TEJIDO/'Tissu', ou la premiere si aucune). */
    principal: boolean;
    placements: PlacementImporte[];
    /** Rempli seulement par le format 'atelier'. */
    matelas: MatelasImporte[];
}

export interface FeuilleImportee {
    /** Nom de la feuille Excel. */
    feuille: string;
    format: 'repartos' | 'atelier';
    client?: string;
    atelier?: string;
    modele?: string;
    pedido?: string;
    corte?: string;
    date?: string;
    /** Tailles de la commande, dans l'ordre des colonnes. */
    tailles: string[];
    /** Quantite commandee par taille. */
    quantites: Record<string, number>;
    matieres: MatiereImportee[];
    /** Messages en francais (notes libres, ambiguites). */
    alertes: string[];
}

/* ------------------------------------------------------------------ */
/* Lecture de cellule : nombre, texte, rich text, formule, formule       */
/* partagee -- exceljs peut rendre value sous n'importe laquelle de ces  */
/* formes selon comment le classeur a ete ecrit.                        */
/* ------------------------------------------------------------------ */

type Cellule = ExcelJS.Cell;

function valeurBrute(cell: Cellule | undefined | null): unknown {
    if (!cell) return undefined;
    const v: any = cell.value;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
        if (Array.isArray(v.richText)) return v.richText.map((rt: any) => (rt && rt.text) || '').join('');
        if ('result' in v && v.result !== undefined && v.result !== null) return v.result;
        // Formule/formule partagee sans resultat en cache dans la valeur brute :
        // on retombe sur le getter pratique d'exceljs, qui sait resoudre les
        // formules partagees a partir de la formule maitresse.
        if ('formula' in v || 'sharedFormula' in v) {
            const r = cell.result;
            if (r !== undefined && r !== null) return r;
        }
    }
    return v;
}

/** Texte affichable d'une cellule, quel que soit son type de valeur. Jamais null/undefined. */
export function texteCellule(cell: Cellule | undefined | null): string {
    const v: any = valeurBrute(cell);
    if (v === undefined || v === null) return '';
    if (v instanceof Date) return v.toISOString();
    return String(v).trim();
}

/** Valeur numerique d'une cellule, ou undefined si absente/illisible. */
export function nombreCellule(cell: Cellule | undefined | null): number | undefined {
    const v: any = valeurBrute(cell);
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string') {
        const s = v.trim().replace(',', '.');
        if (s === '') return undefined;
        const n = Number(s);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

/** Texte de la formule d'une cellule (formule directe ou partagee resolue), sinon undefined. */
function formuleCellule(cell: Cellule | undefined | null): string | undefined {
    if (!cell) return undefined;
    const v: any = cell.value;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
        if (typeof v.formula === 'string' && v.formula) return v.formula;
        if (typeof v.sharedFormula === 'string' && v.sharedFormula) {
            const f = cell.formula;
            if (typeof f === 'string' && f) return f;
        }
    }
    return undefined;
}

/** '(A) : chaine sans accents, en minuscules, sans espaces de bord. Sert aux comparaisons souples. */
function normaliserTexte(s: string): string {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/* lireRatios : coeur de la lecture des ratios "1 DE CADA" / "2+2+2"...  */
/* ------------------------------------------------------------------ */

/** Etale taillesTexte en liste ORDONNEE de tailles (doublons conserves), ou null si une taille est inconnue. */
function etalerTailles(taillesTexte: string, tailles: string[]): string[] | null {
    const texte = (taillesTexte || '').trim();
    if (!texte) return null;

    const trouver = (mot: string): string | undefined => {
        const norm = mot.trim().toUpperCase();
        return tailles.find(t => t.trim().toUpperCase() === norm);
    };

    // Plage inclusive : 'XS A L' / 'XS À L'
    const plage = texte.match(/^(.+?)\s+(?:A|À)\s+(.+)$/i);
    if (plage) {
        const de = trouver(plage[1]);
        const a = trouver(plage[2]);
        if (!de || !a) return null;
        const iDe = tailles.indexOf(de);
        const iA = tailles.indexOf(a);
        const [lo, hi] = iDe <= iA ? [iDe, iA] : [iA, iDe];
        return tailles.slice(lo, hi + 1);
    }

    // Liste : 'S - M' / 'M-M' / 'XS-M' / 'XS,S'
    const parties = texte.split(/[-,]/).map(s => s.trim()).filter(Boolean);
    if (parties.length === 0) return null;
    const out: string[] = [];
    for (const p of parties) {
        const t = trouver(p);
        if (!t) return null;
        out.push(t);
    }
    return out;
}

function garderPositifs(r: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(r)) if (v > 0) out[k] = v;
    return out;
}

/**
 * Lit les ratios pieces/pli par taille a partir du texte des tailles et du
 * texte des ratios, tel qu'ecrits dans le classeur du client.
 */
export function lireRatios(
    taillesTexte: string,
    ratiosTexte: string,
    tailles: string[],
): { ratios: Record<string, number> | null; aVerifier?: string } {
    const etalees = etalerTailles(taillesTexte, tailles);
    if (etalees === null) {
        return { ratios: null, aVerifier: `Taille non reconnue : "${taillesTexte}"` };
    }
    const distinctes = [...new Set(etalees)];
    const texte = (ratiosTexte || '').trim();

    // '(N) DE CADA' -> chaque taille distincte x N
    const deCada = texte.match(/^(\d+)\s*DE\s*CADA$/i);
    if (deCada) {
        const n = Number(deCada[1]);
        const ratios: Record<string, number> = {};
        for (const t of distinctes) ratios[t] = n;
        return { ratios: garderPositifs(ratios) };
    }

    // 'N+N+N...' -> position par position sur la liste etalee (doublons compris)
    if (/^\d+(\s*\+\s*\d+)+$/.test(texte)) {
        const nombres = texte.split('+').map(s => Number(s.trim()));
        if (nombres.length !== etalees.length) {
            return {
                ratios: null,
                aVerifier: `"${ratiosTexte}" a ${nombres.length} valeur(s) mais "${taillesTexte}" liste ${etalees.length} taille(s)`,
            };
        }
        const ratios: Record<string, number> = {};
        etalees.forEach((t, i) => { ratios[t] = (ratios[t] || 0) + nombres[i]; });
        return { ratios: garderPositifs(ratios) };
    }

    // 'N' seul -> une seule taille distincte : elle recoit N ; sinon chaque taille distincte x N + a verifier
    if (/^\d+$/.test(texte)) {
        const n = Number(texte);
        if (distinctes.length === 1) {
            return { ratios: garderPositifs({ [distinctes[0]]: n }) };
        }
        const ratios: Record<string, number> = {};
        for (const t of distinctes) ratios[t] = n;
        return {
            ratios: garderPositifs(ratios),
            aVerifier: `Ratio "${texte}" applique a chaque taille (${distinctes.join(', ')}) pour "${taillesTexte}" : a verifier`,
        };
    }

    // Vide -> chaque taille listee (doublons comptes) x 1
    if (texte === '') {
        const ratios: Record<string, number> = {};
        for (const t of etalees) ratios[t] = (ratios[t] || 0) + 1;
        return {
            ratios: garderPositifs(ratios),
            aVerifier: `Ratio manquant pour "${taillesTexte}" : 1 piece par taille suppose`,
        };
    }

    return { ratios: null, aVerifier: `Ratio illisible : "${ratiosTexte}" pour "${taillesTexte}"` };
}

/* ------------------------------------------------------------------ */
/* Format 'repartos'                                                    */
/* ------------------------------------------------------------------ */

const REGEX_TAILLE = /^(X{0,4}S|M|X{0,4}L|\dXL|\d{1,3}|TU|T\d)$/i;
const REGEX_MARQUEUR = /^([A-Z][A-Z0-9]{0,3})-(\d{1,3})$/;
const REGEX_MARQUEUR_VIDE = /^[A-Z][A-Z0-9]{0,3}-$/;
const MOTS_MATIERE = ['TELA', 'TEJIDO', 'FORRO', 'ENTRETELA', 'COMBINADO', 'CUERPO', 'BOLSILLO'];

function motMatiere(normalise: string): string | null {
    for (const mot of MOTS_MATIERE) {
        const m = mot.toLowerCase();
        if (normalise === m || normalise.startsWith(m)) return mot;
    }
    return null;
}

function nomMatiereDepuisPrefixe(prefixe: string): string {
    const p = prefixe.toUpperCase();
    if (p === 'TE') return 'TELA';
    if (p === 'FO') return 'FORRO';
    if (p === 'EN') return 'ENTRETELA';
    if (p === 'CO' || /^C\d/.test(p)) return 'COMBINADO';
    return p;
}

function estStructurel(texte: string): boolean {
    if (!texte) return false;
    const norm = normaliserTexte(texte);
    if (/^total\s*metros/.test(norm)) return true;
    if (motMatiere(norm)) return true;
    const up = texte.trim().toUpperCase();
    if (REGEX_MARQUEUR.test(up) || REGEX_MARQUEUR_VIDE.test(up)) return true;
    return false;
}

/** Cherche (lignes 1..maxLigne incluse) une cellule dont le texte normalise verifie `predicat`. */
function chercherEtiquette(
    ws: ExcelJS.Worksheet, maxLigne: number, predicat: (normalise: string) => boolean,
): { ligne: number; colonne: number } | null {
    const maxCol = Math.max(ws.columnCount || 0, 15);
    for (let r = 1; r <= maxLigne; r++) {
        const ligne = ws.getRow(r);
        for (let c = 1; c <= maxCol; c++) {
            const t = texteCellule(ligne.getCell(c));
            if (t && predicat(normaliserTexte(t))) return { ligne: r, colonne: c };
        }
    }
    return null;
}

/** Trouve la ligne d'en-tete (celle qui contient 'PEDIDO') et sa colonne, dans les lignes 1..15. */
function trouverEnteteRepartos(ws: ExcelJS.Worksheet): { ligne: number; colPedido: number } | null {
    const maxLigne = Math.min(ws.rowCount || 15, 15);
    const maxCol = Math.max(ws.columnCount || 0, 30);
    for (let r = 1; r <= maxLigne; r++) {
        const ligne = ws.getRow(r);
        for (let c = 1; c <= maxCol; c++) {
            if (texteCellule(ligne.getCell(c)).toUpperCase() === 'PEDIDO') return { ligne: r, colPedido: c };
        }
    }
    return null;
}

function lireFeuilleRepartos(ws: ExcelJS.Worksheet): FeuilleImportee | null {
    const entete = trouverEnteteRepartos(ws);
    if (!entete) return null;
    const { ligne: rowPedido, colPedido } = entete;
    const ligneEntete = ws.getRow(rowPedido);
    const maxCol = Math.max(ws.columnCount || 0, 30);

    let colCorte: number | undefined;
    for (let c = 1; c <= maxCol; c++) {
        if (texteCellule(ligneEntete.getCell(c)).toUpperCase() === 'CORTE') { colCorte = c; break; }
    }

    const etModele = chercherEtiquette(ws, rowPedido, n => n.startsWith('modelo'));
    const modele = etModele ? (texteCellule(ws.getRow(etModele.ligne).getCell(etModele.colonne + 1)) || undefined) : undefined;

    const etAtelier = chercherEtiquette(ws, rowPedido, n => n.startsWith('para') || n.startsWith('fabricante'));
    const atelier = etAtelier ? (texteCellule(ws.getRow(etAtelier.ligne).getCell(etAtelier.colonne + 1)) || undefined) : undefined;

    const client = texteCellule(ws.getRow(2).getCell(2)) || texteCellule(ws.getRow(2).getCell(1)) || undefined;

    const tailles: string[] = [];
    const colTailles: number[] = [];
    for (let c = 1; c < colPedido; c++) {
        const brut = texteCellule(ligneEntete.getCell(c));
        if (!brut) continue;
        const norm = normaliserTexte(brut);
        if (norm === 'total' || norm.startsWith('modelo')) continue;
        if (modele && brut.trim() === modele.trim()) continue;
        if (REGEX_TAILLE.test(brut.trim())) { tailles.push(brut.trim()); colTailles.push(c); }
    }

    const ligneQte = ws.getRow(rowPedido + 1);
    const quantites: Record<string, number> = {};
    tailles.forEach((t, i) => { quantites[t] = nombreCellule(ligneQte.getCell(colTailles[i])) || 0; });

    const pedido = texteCellule(ligneQte.getCell(colPedido)) || undefined;
    const corte = colCorte !== undefined ? (texteCellule(ligneQte.getCell(colCorte)) || undefined) : undefined;

    const matieres: MatiereImportee[] = [];
    const alertes: string[] = [];
    let idxActuel = -1;

    const maxRow = ws.rowCount || rowPedido + 200;
    let r = rowPedido + 2;
    while (r <= maxRow) {
        const fila = ws.getRow(r);
        const colA = texteCellule(fila.getCell(1));
        if (!colA) { r++; continue; }
        const norm = normaliserTexte(colA);

        if (/^total\s*metros/.test(norm)) {
            idxActuel = -1;
            r++;
            continue;
        }

        const motMat = motMatiere(norm);
        if (motMat) {
            // B (voire C) peut n'etre que l'echo du bandeau matiere fusionne
            // (ex. A14:B14 fusionnees, toutes deux = 'COMBINADO') : ce n'est
            // pas une reference, on l'ignore et on prend la premiere valeur
            // differente du nom de la matiere.
            const candidats = [texteCellule(fila.getCell(2)), texteCellule(fila.getCell(3))];
            const ref = candidats.find(t => t && normaliserTexte(t) !== normaliserTexte(motMat)) || undefined;
            matieres.push({ nom: motMat, ref, code: undefined, principal: false, placements: [], matelas: [] });
            idxActuel = matieres.length - 1;
            r++;
            continue;
        }

        const up = colA.toUpperCase();
        if (REGEX_MARQUEUR_VIDE.test(up)) { r++; continue; } // 'TE-' seul : ligne modele vide, on ignore

        const mMarqueur = up.match(REGEX_MARQUEUR);
        if (mMarqueur) {
            const prefixe = mMarqueur[1];
            const matiereActuelle = idxActuel !== -1 ? matieres[idxActuel] : undefined;
            if (!matiereActuelle || (matiereActuelle.code && matiereActuelle.code !== prefixe)) {
                matieres.push({ nom: nomMatiereDepuisPrefixe(prefixe), ref: undefined, code: prefixe, principal: false, placements: [], matelas: [] });
                idxActuel = matieres.length - 1;
            } else if (!matiereActuelle.code) {
                matiereActuelle.code = prefixe;
            }

            const taillesTexte = texteCellule(fila.getCell(2));
            const filaSuivante = ws.getRow(r + 1);
            const colASuivante = texteCellule(filaSuivante.getCell(1));
            const suivanteEstStructurelle = estStructurel(colASuivante);

            let ratiosTexte = '';
            let ligneConsommee = false;
            if (!suivanteEstStructurelle) {
                const bSuivant = texteCellule(filaSuivante.getCell(2));
                if (bSuivant) { ratiosTexte = bSuivant; ligneConsommee = true; }
            }

            const longueurM = nombreCellule(fila.getCell(3))
                ?? (!suivanteEstStructurelle ? nombreCellule(filaSuivante.getCell(3)) : undefined);
            const plis = nombreCellule(fila.getCell(9))
                ?? (!suivanteEstStructurelle ? nombreCellule(filaSuivante.getCell(9)) : undefined);

            const { ratios, aVerifier } = lireRatios(taillesTexte, ratiosTexte, tailles);

            matieres[idxActuel].placements.push({
                code: colA.trim(), taillesTexte, ratiosTexte, ratios, longueurM, plis, aVerifier,
            });

            r += ligneConsommee ? 2 : 1;
            continue;
        }

        // Texte libre (pas matiere, pas marqueur, pas TOTAL) : note a verifier par l'atelier
        alertes.push(colA);
        r++;
    }

    if (matieres.length > 0) {
        const iPrincipal = matieres.findIndex(m => m.code === 'TE' || /^(TELA|TEJIDO)$/i.test(m.nom));
        const choisi = iPrincipal !== -1 ? iPrincipal : 0;
        matieres.forEach((m, i) => { m.principal = i === choisi; });
    }

    return {
        feuille: ws.name,
        format: 'repartos',
        client,
        atelier,
        modele,
        pedido,
        corte,
        date: undefined,
        tailles,
        quantites,
        matieres,
        alertes,
    };
}

/* ------------------------------------------------------------------ */
/* Format 'atelier'                                                     */
/* ------------------------------------------------------------------ */

/** Rend la ligne d'en-tete matelas (celle avec B='Colchon' et C='ordre'), ou null si la feuille n'est pas au format atelier. */
function detecterEnteteAtelier(ws: ExcelJS.Worksheet): number | null {
    const maxLigne = Math.min(ws.rowCount || 30, 30);
    for (let r = 1; r <= maxLigne; r++) {
        const ligne = ws.getRow(r);
        const b = texteCellule(ligne.getCell(2)).toLowerCase();
        const c = texteCellule(ligne.getCell(3)).toLowerCase();
        if (b === 'colchon' && c === 'ordre') return r;
    }
    return null;
}

/** Ratio pieces/pli d'une cellule de la table matelas : lit le multiplicateur dans la formule ('D16*2' -> 2), sinon divise la valeur par le nombre de plis. */
function ratioColonneAtelier(cell: Cellule, plis: number | undefined): number | undefined {
    const formule = formuleCellule(cell);
    if (formule) {
        const f = formule.replace(/^=/, '');
        const m = f.match(/\*\s*([0-9]+(?:\.[0-9]+)?)/) || f.match(/([0-9]+(?:\.[0-9]+)?)\s*\*/);
        if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n)) return n;
        }
    }
    const val = nombreCellule(cell);
    if (val === undefined) return undefined;
    if (plis && plis > 0) return val / plis;
    return undefined;
}

function lireFeuilleAtelier(ws: ExcelJS.Worksheet, hRow: number): FeuilleImportee | null {
    const nomHoja = (ws.name || '').trim();
    const nomHojaUp = nomHoja.toUpperCase();
    let nomMatiere: string;
    let code: string;
    let principal: boolean;
    if (nomHojaUp === 'TISSU') { nomMatiere = 'Tissu'; code = 'TE'; principal = true; }
    else if (nomHojaUp === 'FO') { nomMatiere = 'FORRO'; code = 'FO'; principal = false; }
    else if (nomHojaUp === 'EN') { nomMatiere = 'ENTRETELA'; code = 'EN'; principal = false; }
    else { nomMatiere = nomHoja; code = nomHoja.slice(0, 2).toUpperCase(); principal = false; }

    const maxCol = Math.max(ws.columnCount || 0, 25);

    let colPedido: number | undefined;
    const row2 = ws.getRow(2);
    for (let c = 1; c <= maxCol; c++) {
        if (texteCellule(row2.getCell(c)).toUpperCase() === 'PEDIDO') { colPedido = c; break; }
    }

    const row3 = ws.getRow(3);
    const date = texteCellule(row3.getCell(2)) || undefined;
    const client = texteCellule(row3.getCell(3)) || undefined;
    const modele = texteCellule(row3.getCell(4)) || undefined;
    const pedido = colPedido !== undefined ? (texteCellule(row3.getCell(colPedido)) || undefined) : undefined;

    const row4 = ws.getRow(4);
    const tailles: string[] = [];
    const colTailles: number[] = [];
    for (let c = 3; c <= maxCol; c++) {
        const t = texteCellule(row4.getCell(c));
        if (!t || /^total/i.test(t.trim())) break;
        tailles.push(t.trim());
        colTailles.push(c);
    }

    const row5 = ws.getRow(5);
    const quantites: Record<string, number> = {};
    tailles.forEach((t, i) => { quantites[t] = nombreCellule(row5.getCell(colTailles[i])) || 0; });

    const ligneEntete = ws.getRow(hRow);
    const colonneTaille: Record<string, number> = {};
    for (const t of tailles) {
        for (let c = 6; c <= maxCol; c++) {
            if (texteCellule(ligneEntete.getCell(c)).toLowerCase() === t.toLowerCase()) { colonneTaille[t] = c; break; }
        }
    }

    const matelas: MatelasImporte[] = [];
    const maxRow = ws.rowCount || hRow + 500;
    let r = hRow + 1;
    let vides = 0;
    while (r <= maxRow) {
        const fila = ws.getRow(r);
        const notation = texteCellule(fila.getCell(2));
        if (!notation) {
            vides++;
            if (vides > 3) break;
            r++;
            continue;
        }
        vides = 0;
        if (/^total\s*cut$/i.test(notation)) break;

        const numero = texteCellule(fila.getCell(3)) || undefined;
        const plis = nombreCellule(fila.getCell(4)) || 0;
        const longueurM = nombreCellule(fila.getCell(5));

        if (!plis) { r++; continue; }

        const ratios: Record<string, number> = {};
        for (const t of tailles) {
            const c = colonneTaille[t];
            if (!c) continue;
            const ratio = ratioColonneAtelier(fila.getCell(c), plis);
            if (ratio && ratio > 0) ratios[t] = ratio;
        }

        matelas.push({ notation, ratios: Object.keys(ratios).length > 0 ? ratios : null, numero, plis, longueurM });
        r++;
    }

    return {
        feuille: ws.name,
        format: 'atelier',
        client,
        atelier: undefined,
        modele,
        pedido,
        corte: undefined,
        date,
        tailles,
        quantites,
        matieres: [{ nom: nomMatiere, ref: undefined, code, principal, placements: [], matelas }],
        alertes: [],
    };
}

/* ------------------------------------------------------------------ */
/* Entree du module                                                     */
/* ------------------------------------------------------------------ */

/** Lit toutes les feuilles importables d'un classeur deja charge par exceljs. Aide pour les tests (evite un aller-retour buffer). */
export function lireFeuilles(wb: ExcelJS.Workbook): FeuilleImportee[] {
    const feuilles: FeuilleImportee[] = [];
    for (const ws of wb.worksheets) {
        const nom = (ws.name || '').trim();
        if (/^SERIE/i.test(nom)) continue; // feuille de reference de l'atelier, pas une commande

        const hRow = detecterEnteteAtelier(ws);
        const feuille = hRow !== null ? lireFeuilleAtelier(ws, hRow) : lireFeuilleRepartos(ws);
        if (!feuille) continue;

        const aQuelqueChose = feuille.tailles.length > 0
            || feuille.matieres.some(m => m.placements.length > 0 || m.matelas.length > 0);
        if (aQuelqueChose) feuilles.push(feuille);
    }
    return feuilles;
}

/** Lit un classeur Excel (commande client 'repartos' ou feuille 'atelier') et rend ses feuilles importables. */
export async function lireClasseurCoupe(buffer: ArrayBuffer): Promise<FeuilleImportee[]> {
    const mod = await import('exceljs');
    const ExcelJSValeur = (mod as any).default ?? mod;
    const wb = new ExcelJSValeur.Workbook();
    await wb.xlsx.load(buffer as any);
    return lireFeuilles(wb);
}
