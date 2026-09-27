/**
 * Classeur Excel d'un ordre de coupe, calqué EXACTEMENT sur la disposition
 * que l'atelier utilise déjà dans Excel (fichier "ZINTURA", en-têtes en
 * espagnol) : une feuille par matière (la matière principale s'appelle
 * "Tissu"), une feuille "SERIE - Tissu" pour la numérotation d'étiquetage
 * juste après, et une feuille "TRACES" listant tous les placements PLT en fin
 * de classeur.
 *
 * Le nom de fichier est stable (construireClasseurCoupe + nomFichierExcel
 * de la même commande donnent toujours le même nom) : écrit via dossierLocal.ts,
 * le classeur se remplace à chaque sauvegarde au lieu de s'empiler.
 *
 * Marche en navigateur et en Node (tests) : import dynamique d'exceljs, comme
 * components/CostCalculator.tsx.
 *
 * Lancer les tests : node --import tsx lib/coupeExcel.test.ts
 */
// Import de type seulement : effacé à la compilation, n'alourdit pas le bundle
// (la valeur réelle est chargée en dynamique dans construireClasseurCoupe).
import type ExcelJS from 'exceljs';

export interface DonneesExcelCoupe {
    entreprise?: string;
    modele: string;
    reference?: string;
    client?: string;
    /** Type de vêtement : Jupe, Sweat... */
    type?: string;
    /** Libellé humain du statut. */
    statut?: string;
    /** ISO ou date affichable, déjà formatée 'dd/mm/yyyy'. */
    date: string;
    /** N° de commande client -> cellule 'PEDIDO' (écrit en nombre si tout chiffres). */
    pedido?: string;
    /** 'Ref proveedor'. */
    refFournisseur?: string;
    /** Ordre des colonnes tailles, ex. ['XS','S','M','XL']. */
    tailles: string[];
    /** Commande par couleur x taille. */
    repartition: { couleur: string; quantites: Record<string, number> }[];
    tissus: {
        /** 'Tissu', 'Vlieseline', 'Doublure'... */
        nom: string;
        /** Code court : 'TE', 'FO', 'EN', 'VSLIN'... */
        code?: string;
        /** true pour la matière principale (la première). */
        principal?: boolean;
        /** Tissu reçu (m). */
        recuM?: number;
        laizeCm?: number;
        placements: {
            /** 'M-XL', 'XS×2'... */
            nom: string;
            code?: string;
            /** Pièces par pli, par taille. */
            ratios: Record<string, number>;
            /** Nom du fichier PLT. */
            fichier?: string;
            /** Longueur du tracé par pli (m). */
            longueurM?: number;
            laizeCm?: number;
            /** % */
            efficience?: number;
            maxPlis?: number;
        }[];
        matelas: {
            /** N° écrit sur les pièces, ex. '77'. */
            numero: string;
            placement: string;
            /** Notation atelier du tracé, ex. 'S*2', 'S-M*2', 'M*26'. */
            notation?: string;
            couleur: string;
            /** Index 1-based de la couleur dans `repartition`. */
            couleurIndex?: number;
            /** Pièces PAR PLI, par taille (le ratio du tracé). */
            ratios?: Record<string, number>;
            /** Longueur du tracé (m) par pli. */
            longueurM?: number;
            plis: number;
            /** Pièces par taille pour ce matelas (plis x ratio). */
            pieces: Record<string, number>;
            total: number;
            cumul: number;
            consoM: number;
            fait: boolean;
            /** Fichier déjà envoyé à la table de coupe (pas encore confirmé coupé). */
            envoye?: boolean;
            groupe?: string;
            /** 'HH:MM' déjà formaté. */
            debut?: string;
            fin?: string;
            /** Nom du fichier tracé numéroté. */
            fichierSortie?: string;
        }[];
    }[];
    /** Série de numérotation (étiquetage) de la matière principale. */
    serie?: {
        lignes: {
            date?: string;
            paquet: string;
            plis: number;
            debut: number;
            fin: number;
            taille: string;
            pieces?: number;
            n?: string;
            entree?: string;
            lote?: string;
            sortie?: string;
            chaine?: string;
        }[];
    };
}

/* ------------------------------------------------------------------ */
/* Palette / styles globaux                                            */
/* ------------------------------------------------------------------ */

const FONT_NOIR = 'FF000000';
const COULEUR_BLEU = 'FF0000FF';
const COULEUR_ROUGE = 'FFFF0000';
const FOND_FAIT = 'FFE2EFDA';   // vert clair
const FOND_ENVOYE = 'FFDDEBF7'; // bleu clair

const FMT_ENTIER = '#,##0';
const FMT_METRES = '0.00';

const HAUTEUR_LIGNE = 17.1;

/* ------------------------------------------------------------------ */
/* Utilitaires génériques                                               */
/* ------------------------------------------------------------------ */

function colLetter(n: number): string {
    let s = '';
    let i = n;
    while (i > 0) {
        const m = (i - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        i = Math.floor((i - 1) / 26);
    }
    return s;
}

const CARACTERES_INTERDITS_FICHIER = /[\\/:*?"<>|\x00-\x1f]/g;

function nettoyerSegmentFichier(s?: string): string {
    return (s || '').replace(CARACTERES_INTERDITS_FICHIER, '').trim().replace(/\s+/g, ' ');
}

/** 'COUPE-<client>-<modele>[-<reference>].xlsx' — stable d'une sauvegarde à l'autre. */
export function nomFichierExcel(d: Pick<DonneesExcelCoupe, 'modele' | 'reference' | 'client'>): string {
    const parties = [d.client, d.modele, d.reference].map(nettoyerSegmentFichier).filter(Boolean);
    const base = parties.length > 0 ? `COUPE-${parties.join('-')}` : 'COUPE-ordre';
    return `${base}.xlsx`;
}

/** Nombre si la chaîne est composée uniquement de chiffres, sinon la chaîne telle quelle. */
function numOuTexte(s?: string): string | number {
    if (s === undefined || s === null || s === '') return '';
    return /^\d+$/.test(s) ? Number(s) : s;
}

/* Noms de feuille : caractères interdits par Excel retirés, 31 caractères max, uniques. */
const CARACTERES_INTERDITS_FEUILLE = /[\[\]:*?/\\]/g;

function nettoyerNomFeuille(s: string): string {
    const nettoye = (s || '').replace(CARACTERES_INTERDITS_FEUILLE, '').trim();
    const base = nettoye || 'Feuille';
    return base.length > 31 ? base.slice(0, 31) : base;
}

function nomFeuilleUnique(base: string, utilises: Set<string>): string {
    const nettoye = nettoyerNomFeuille(base);
    if (!utilises.has(nettoye)) {
        utilises.add(nettoye);
        return nettoye;
    }
    let i = 2;
    let candidat: string;
    do {
        const suffixe = ` ${i}`;
        candidat = nettoye.slice(0, Math.max(1, 31 - suffixe.length)) + suffixe;
        i++;
    } while (utilises.has(candidat));
    utilises.add(candidat);
    return candidat;
}

/* ------------------------------------------------------------------ */
/* Disposition des colonnes de la table Matelas                        */
/* ------------------------------------------------------------------ */

/** Colonne "quantité" (bloc Répartition/TALLAS) de la taille d'index k (0-based) : C, D, E... */
function colQuantiteTaille(k: number): number { return 3 + k; }
/** Colonne "valeur" (table Matelas) de la taille d'index k : G, I, K... */
function colValeurTaille(k: number): number { return 7 + 2 * k; }
/** Colonne "TOTAL <taille>" (cumul) associée : H, J, L... */
function colPaireTaille(k: number): number { return 8 + 2 * k; }
/** Dernière colonne du tableau ("TOTAL" général). */
function colDerniere(n: number): number { return 7 + 2 * n; }

/* ------------------------------------------------------------------ */
/* Styles de cellule                                                    */
/* ------------------------------------------------------------------ */

type Cellule = ExcelJS.Cell;
type Feuille = ExcelJS.Worksheet;
type Classeur = ExcelJS.Workbook;
type ValeurCellule = ExcelJS.CellValue;

type TissuCoupe = DonneesExcelCoupe['tissus'][number];
type MatelasCoupe = TissuCoupe['matelas'][number];
type SerieCoupe = NonNullable<DonneesExcelCoupe['serie']>;

const bordureFine = { style: 'thin' as const };
const toutesBordures = { top: bordureFine, left: bordureFine, bottom: bordureFine, right: bordureFine };

interface OptionsCellule {
    bold?: boolean;
    color?: string;
    align?: 'left' | 'center';
    /** false = pas de bordure (lignes 1-3 du gabarit). */
    border?: boolean;
    fill?: string;
    numFmt?: string;
    /** Texte plus long que la colonne : Excel le reduit pour qu'il tienne (date, client). */
    reduire?: boolean;
}

/** Écrit une cellule avec le style commun à tout le classeur (Calibri 11, centré, bordures fines). */
function ecrire(ws: Feuille, r: number, c: number, valeur: ValeurCellule, opts: OptionsCellule = {}): Cellule {
    const cell = ws.getCell(r, c);
    cell.value = valeur;
    cell.font = { name: 'Calibri', size: 11, bold: !!opts.bold, color: { argb: opts.color || FONT_NOIR } };
    cell.alignment = { vertical: 'middle', horizontal: opts.align || 'center', ...(opts.reduire ? { shrinkToFit: true } : {}) };
    if (opts.border !== false) cell.border = toutesBordures;
    if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
    if (opts.numFmt) cell.numFmt = opts.numFmt;
    return cell;
}

/** Bandeau B1 : nom d'entreprise, gras taille 14, aligné à gauche, sans bordure. */
function ecrireTitre(ws: Feuille, entreprise: string | undefined) {
    ws.getRow(1).height = HAUTEUR_LIGNE;
    const c = ws.getCell(1, 2);
    c.value = entreprise || '';
    c.font = { name: 'Calibri', size: 14, bold: true, color: { argb: FONT_NOIR } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
}

const PAGE_SETUP: Partial<ExcelJS.PageSetup> = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
};

/* ------------------------------------------------------------------ */
/* Notation atelier du tracé ('S*2', 'S-M*2', 'M*26'...)                */
/* ------------------------------------------------------------------ */

/** Ratio par pli, par taille : celui fourni sinon dérivé de pieces/plis. */
function ratioParPli(m: MatelasCoupe, tailles: string[]): Record<string, number> {
    if (m.ratios) return m.ratios;
    const out: Record<string, number> = {};
    for (const t of tailles) {
        out[t] = m.plis > 0 ? (Number(m.pieces[t]) || 0) / m.plis : 0;
    }
    return out;
}

/** Construit la notation ('S-M*2', 'M*26', 'XS*1-M*2'...) quand elle n'est pas fournie. */
function construireNotation(m: MatelasCoupe, tailles: string[]): string {
    if (m.notation) return m.notation;
    const ratios = ratioParPli(m, tailles);
    const actives = tailles.filter(t => (Number(ratios[t]) || 0) > 0);
    if (actives.length === 0) return '';
    const valeurs = actives.map(t => ratios[t]);
    const identiques = valeurs.every(v => v === valeurs[0]);
    if (identiques) return `${actives.join("-").toUpperCase()}*${valeurs[0]}`;
    return actives.map(t => `${t.toUpperCase()}*${ratios[t]}`).join('-');
}

/* ------------------------------------------------------------------ */
/* Feuille "matière" (une par tissu)                                    */
/* ------------------------------------------------------------------ */

function construireFeuilleMatiere(wb: Classeur, d: DonneesExcelCoupe, tissu: TissuCoupe, nomFeuille: string): void {
    const tailles = d.tailles;
    const n = tailles.length;
    const last = colDerniere(n);

    const ws: Feuille = wb.addWorksheet(nomFeuille, { pageSetup: { ...PAGE_SETUP } });
    ws.properties.defaultRowHeight = HAUTEUR_LIGNE;

    /* --- Largeurs de colonnes --- */
    const largeurs: number[] = new Array(last).fill(10);
    largeurs[0] = 4;  // A
    largeurs[1] = 18; // B
    largeurs[2] = 12; // C
    largeurs[3] = 15; // D
    largeurs[4] = 10; // E
    largeurs[5] = 12; // F
    for (let k = 0; k < n; k++) {
        largeurs[colValeurTaille(k) - 1] = 10;
        largeurs[colPaireTaille(k) - 1] = 9;
    }
    largeurs[last - 1] = 12;
    ws.columns = largeurs.map(width => ({ width }));

    /* --- Répartition (bloc TALLAS) : positions des lignes --- */
    const premiereCouleur = 5;
    const nLignesCouleur = Math.max(4, d.repartition.length);
    const derniereCouleur = premiereCouleur + nLignesCouleur - 1;
    const Q = derniereCouleur + 1; // ligne 'QTE, TOTAL'

    const totalParTailleQ: number[] = tailles.map(t =>
        d.repartition.reduce((s, l) => s + (Number(l.quantites[t]) || 0), 0));
    const totalGeneralQ = totalParTailleQ.reduce((s, v) => s + v, 0);

    const rTejHead = Q + 2;
    const rTejData = Q + 3;
    const H = Q + 6; // en-tête de la table Matelas ("Colchon")
    const nMatelas = tissu.matelas.length;
    const T = H + nMatelas + 1; // ligne TOTAL CUT

    /* --- Calculs des lignes Matelas (avant écriture, pour connaître les totaux à l'avance) --- */
    interface CalcMatelas {
        m: MatelasCoupe;
        notation: string;
        ratios: Record<string, number>;
        D: number; E: number; F: number;
        valeurs: number[]; paires: number[]; L: number;
    }
    const calc: CalcMatelas[] = [];
    const cumulRunning: number[] = new Array(n).fill(0);
    let cumulTotal = 0;
    tissu.matelas.forEach(m => {
        const ratios = ratioParPli(m, tailles);
        const notation = construireNotation(m, tailles);
        const D = m.plis || 0;
        const E = typeof m.longueurM === 'number' ? m.longueurM : 0;
        const F = D * E;
        const valeurs = tailles.map(t => D * (Number(ratios[t]) || 0));
        const paires = valeurs.map((v, k) => { cumulRunning[k] += v; return cumulRunning[k]; });
        const sommeLigne = valeurs.reduce((s, v) => s + v, 0);
        cumulTotal += sommeLigne;
        calc.push({ m, notation, ratios, D, E, F, valeurs, paires, L: cumulTotal });
    });
    const sommeD = calc.reduce((s, c) => s + c.D, 0);
    const sommeF = calc.reduce((s, c) => s + c.F, 0);
    const sommeValeursParTaille = tailles.map((_, k) => calc.reduce((s, c) => s + c.valeurs[k], 0));
    const sommeTotaleT = sommeValeursParTaille.reduce((s, v) => s + v, 0);

    /* ---------------------------------------------------------------- */
    /* Écriture                                                          */
    /* ---------------------------------------------------------------- */

    // Ligne 1 : bandeau entreprise
    ecrireTitre(ws, d.entreprise);

    // Lignes 2-3 : méta (sans bordure)
    ws.getRow(2).height = HAUTEUR_LIGNE;
    ws.getRow(3).height = HAUTEUR_LIGNE;
    ecrire(ws, 2, 2, 'Fecha', { bold: true, border: false });
    ecrire(ws, 2, 3, 'Cliente', { bold: true, border: false });
    ws.mergeCells(2, 4, 2, 5);
    ecrire(ws, 2, 4, 'Articulo', { bold: true, border: false });
    ecrire(ws, 2, 6, 'Ref proveedor', { bold: true, border: false });
    ecrire(ws, 2, last, 'PEDIDO', { bold: true, border: false });

    ecrire(ws, 3, 2, d.date || '', { bold: true, border: false });
    ecrire(ws, 3, 3, d.client || '', { bold: true, border: false });
    ws.mergeCells(3, 4, 3, 5);
    const articulo = d.modele + (d.reference ? ' ' + d.reference : '');
    ecrire(ws, 3, 4, articulo, { bold: true, border: false });
    ecrire(ws, 3, 6, d.refFournisseur || '', { bold: true, border: false });
    ecrire(ws, 3, last, numOuTexte(d.pedido), { bold: true, border: false });

    // Ligne 4 : en-tête bloc TALLAS
    ws.getRow(4).height = HAUTEUR_LIGNE;
    ecrire(ws, 4, 2, 'TALLAS', { bold: true });
    tailles.forEach((t, k) => ecrire(ws, 4, colQuantiteTaille(k), t.toUpperCase(), { bold: true, color: COULEUR_BLEU }));
    ecrire(ws, 4, last, 'TOTAL', { bold: true });

    // Lignes 5..derniereCouleur : une par couleur (padding à 4 lignes minimum)
    for (let idx = 0; idx < nLignesCouleur; idx++) {
        const r = premiereCouleur + idx;
        ws.getRow(r).height = HAUTEUR_LIGNE;
        const ligne = d.repartition[idx];
        ecrire(ws, r, 2, ligne ? ligne.couleur : undefined);
        tailles.forEach((t, k) => {
            const val = ligne ? (Number(ligne.quantites[t]) || 0) : undefined;
            ecrire(ws, r, colQuantiteTaille(k), val, { numFmt: val !== undefined ? FMT_ENTIER : undefined });
        });
        const totalLigne = ligne ? tailles.reduce((s, t) => s + (Number(ligne.quantites[t]) || 0), 0) : 0;
        ecrire(ws, r, last, { formula: `SUM(${colLetter(3)}${r}:${colLetter(2 + n)}${r})`, result: totalLigne }, { bold: true });
    }

    // Ligne Q : QTE, TOTAL
    ws.getRow(Q).height = HAUTEUR_LIGNE;
    ecrire(ws, Q, 2, 'QTE, TOTAL', { bold: true });
    tailles.forEach((t, k) => {
        const c = colQuantiteTaille(k);
        ecrire(ws, Q, c, { formula: `SUM(${colLetter(c)}${premiereCouleur}:${colLetter(c)}${derniereCouleur})`, result: totalParTailleQ[k] }, { bold: true, color: COULEUR_BLEU });
    });
    ecrire(ws, Q, last, { formula: `SUM(${colLetter(3)}${Q}:${colLetter(2 + n)}${Q})`, result: totalGeneralQ }, { bold: true });

    // Bloc TEJIDO (Q+2 en-têtes, Q+3 données) ; Q+1 reste une ligne vide.
    ws.mergeCells(rTejHead, 2, rTejData, 2);
    ws.getRow(rTejHead).height = HAUTEUR_LIGNE;
    ws.getRow(rTejData).height = HAUTEUR_LIGNE;
    ecrire(ws, rTejHead, 2, 'TEJIDO', { bold: true });
    // 2e moitié de la fusion : bordure seulement (ne pas réécrire .value, partagé avec le maître).
    ws.getCell(rTejData, 2).border = toutesBordures;
    ecrire(ws, rTejHead, 3, 'Te, recibi', { bold: true });
    ecrire(ws, rTejHead, 4, 'Te, necesari', { bold: true });
    ecrire(ws, rTejHead, 5, 'Total vivo', { bold: true });
    ecrire(ws, rTejHead, 6, '(-/+) Mtrs', { bold: true });
    ecrire(ws, rTejHead, 7, 'Ancho', { bold: true });
    ecrire(ws, rTejHead, 9, 'Cons, vivo', { bold: true });
    ecrire(ws, rTejHead, 11, 'Valor', { bold: true });
    ecrire(ws, rTejHead, last, 'Cons CLIENTE', { bold: true });

    ecrire(ws, rTejData, 3, typeof tissu.recuM === 'number' ? tissu.recuM : undefined, { numFmt: FMT_METRES });
    ecrire(ws, rTejData, 4, { formula: `${colLetter(6)}${T}`, result: sommeF }, { color: COULEUR_BLEU, numFmt: FMT_METRES });
    ecrire(ws, rTejData, 5, undefined); // 'Total vivo' : saisie manuelle atelier
    ecrire(ws, rTejData, 6, { formula: `${colLetter(5)}${rTejData}-${colLetter(4)}${rTejData}`, result: -sommeF }, { numFmt: FMT_METRES });
    ecrire(ws, rTejData, 7, typeof tissu.laizeCm === 'number' ? tissu.laizeCm : undefined, { numFmt: FMT_ENTIER });
    const consCliente = sommeTotaleT > 0 ? sommeF / sommeTotaleT : 0;
    ecrire(ws, rTejData, last, { formula: `IF(${colLetter(last)}${T}>0, ${colLetter(4)}${rTejData}/${colLetter(last)}${T}, 0)`, result: consCliente }, { bold: true });

    // Ligne H : en-tête table Matelas ("Colchon")
    ws.getRow(H).height = HAUTEUR_LIGNE;
    ecrire(ws, H, 2, 'Colchon', { bold: true });
    ecrire(ws, H, 3, 'ordre', { bold: true });
    ecrire(ws, H, 4, 'Hojas', { bold: true });
    ecrire(ws, H, 5, 'Largo', { bold: true });
    ecrire(ws, H, 6, 'M.Gastado', { bold: true });
    tailles.forEach((t, k) => {
        ecrire(ws, H, colValeurTaille(k), t.toUpperCase(), { bold: true, color: COULEUR_BLEU });
        ecrire(ws, H, colPaireTaille(k), `TOTAL ${t.toUpperCase()}`, { bold: true });
    });
    ecrire(ws, H, last, 'TOTAL', { bold: true });

    // Lignes de données Matelas
    tissu.matelas.forEach((m, idx) => {
        const r = H + 1 + idx;
        const c = calc[idx];
        ws.getRow(r).height = HAUTEUR_LIGNE;
        const fond = m.fait ? FOND_FAIT : (m.envoye ? FOND_ENVOYE : undefined);
        const ec = (col: number, valeur: ValeurCellule, opts: OptionsCellule = {}) => ecrire(ws, r, col, valeur, { ...opts, fill: fond });

        ec(1, typeof m.couleurIndex === 'number' ? m.couleurIndex : undefined, { bold: true });
        ec(2, c.notation);
        ec(3, numOuTexte(m.numero));
        ec(4, c.D, { numFmt: FMT_ENTIER });
        ec(5, c.E, { numFmt: FMT_METRES });
        ec(6, { formula: `${colLetter(4)}${r}*${colLetter(5)}${r}`, result: c.F }, { numFmt: FMT_METRES });

        tailles.forEach((t, k) => {
            const ratio = Number(c.ratios[t]) || 0;
            const colVal = colValeurTaille(k);
            ec(colVal, { formula: `${colLetter(4)}${r}*${ratio}`, result: c.valeurs[k] }, { numFmt: FMT_ENTIER });

            const colPaire = colPaireTaille(k);
            const formulePaire = idx === 0
                ? `${colLetter(colVal)}${r}`
                : `${colLetter(colPaire)}${r - 1}+${colLetter(colVal)}${r}`;
            ec(colPaire, { formula: formulePaire, result: c.paires[k] }, { numFmt: FMT_ENTIER });
        });

        const sommeColsValeur = tailles.map((_, k) => colLetter(colValeurTaille(k)) + r).join('+');
        const formuleL = idx === 0 ? sommeColsValeur : `${colLetter(last)}${r - 1}+${sommeColsValeur}`;
        ec(last, { formula: formuleL, result: c.L }, { bold: true, numFmt: FMT_ENTIER });
    });

    // Ligne T : TOTAL CUT (rouge, gras)
    ws.getRow(T).height = HAUTEUR_LIGNE;
    for (let col = 1; col <= last; col++) ecrire(ws, T, col, undefined, { bold: true, color: COULEUR_ROUGE });
    ecrire(ws, T, 2, 'TOTAL CUT', { bold: true, color: COULEUR_ROUGE });
    const finData = nMatelas > 0 ? T - 1 : T;
    ecrire(ws, T, 4, { formula: `SUM(${colLetter(4)}${H + 1}:${colLetter(4)}${finData})`, result: sommeD }, { bold: true, color: COULEUR_ROUGE, numFmt: FMT_ENTIER });
    ecrire(ws, T, 6, { formula: `SUM(${colLetter(6)}${H + 1}:${colLetter(6)}${finData})`, result: sommeF }, { bold: true, color: COULEUR_ROUGE, numFmt: FMT_METRES });
    tailles.forEach((t, k) => {
        const col = colValeurTaille(k);
        ecrire(ws, T, col, { formula: `SUM(${colLetter(col)}${H + 1}:${colLetter(col)}${finData})`, result: sommeValeursParTaille[k] }, { bold: true, color: COULEUR_ROUGE, numFmt: FMT_ENTIER });
    });
    const argsSommeL = tailles.map((_, k) => colLetter(colValeurTaille(k)) + T).join(',');
    ecrire(ws, T, last, { formula: `SUM(${argsSommeL})`, result: sommeTotaleT }, { bold: true, color: COULEUR_ROUGE, numFmt: FMT_ENTIER });

    // Ligne T+1 : ECART (cut - commande)
    const rEcart = T + 1;
    ws.getRow(rEcart).height = HAUTEUR_LIGNE;
    for (let col = 1; col <= last; col++) ecrire(ws, rEcart, col, undefined, { bold: true });
    ecrire(ws, rEcart, 2, 'ECART', { bold: true });
    tailles.forEach((t, k) => {
        const col = colValeurTaille(k);
        const qCol = colQuantiteTaille(k);
        const ecart = sommeValeursParTaille[k] - totalParTailleQ[k];
        ecrire(ws, rEcart, col, { formula: `${colLetter(col)}${T}-${colLetter(qCol)}${Q}`, result: ecart }, { bold: true, numFmt: FMT_ENTIER });
    });
    const ecartGeneral = sommeTotaleT - totalGeneralQ;
    ecrire(ws, rEcart, last, { formula: `${colLetter(last)}${T}-${colLetter(last)}${Q}`, result: ecartGeneral }, { bold: true, numFmt: FMT_ENTIER });

    // Gel des volets juste sous l'en-tête Matelas
    ws.views = [{ state: 'frozen', ySplit: H }];
}

/* ------------------------------------------------------------------ */
/* Feuille "SERIE - Tissu" (numérotation d'étiquetage)                  */
/* ------------------------------------------------------------------ */

function construireFeuilleSerie(wb: Classeur, d: DonneesExcelCoupe, serie: SerieCoupe, nomFeuille: string): void {
    const ws: Feuille = wb.addWorksheet(nomFeuille, { pageSetup: { ...PAGE_SETUP, orientation: 'portrait', paperSize: 9 } });
    ws.properties.defaultRowHeight = HAUTEUR_LIGNE;

    // Largeurs relevees sur la feuille SERIE de l'atelier (ZINTURA).
    const largeurs = [10, 8, 8, 10, 10, 8, 13, 5, 10, 8, 10, 10];
    ws.columns = largeurs.map(width => ({ width }));

    ecrireTitre(ws, d.entreprise);

    ws.getRow(2).height = HAUTEUR_LIGNE;
    ws.getRow(3).height = HAUTEUR_LIGNE;
    ecrire(ws, 2, 2, 'Fecha', { bold: true, border: false });
    ecrire(ws, 2, 3, 'Cliente', { bold: true, border: false });
    ws.mergeCells(2, 4, 2, 5);
    ecrire(ws, 2, 4, 'Articulo', { bold: true, border: false });
    // « Ref proveedor » deborde de sa colonne : F et G reunies, sinon Excel le coupe.
    ws.mergeCells(2, 6, 2, 7);
    ecrire(ws, 2, 6, 'Ref proveedor', { bold: true, border: false });
    ecrire(ws, 2, 12, 'PEDIDO', { bold: true, border: false });

    ecrire(ws, 3, 2, d.date || '', { bold: true, border: false, reduire: true });
    ecrire(ws, 3, 3, d.client || '', { bold: true, border: false, reduire: true });
    ws.mergeCells(3, 4, 3, 5);
    ecrire(ws, 3, 4, d.modele || d.reference || '', { bold: true, border: false, reduire: true });
    ws.mergeCells(3, 6, 3, 7);
    ecrire(ws, 3, 6, d.refFournisseur || '', { bold: true, border: false, reduire: true });
    ecrire(ws, 3, 12, numOuTexte(d.pedido), { bold: true, border: false, reduire: true });

    ws.getRow(4).height = HAUTEUR_LIGNE;
    const entetes = ['DATE', 'N° PAQ', 'PLI', 'SERIE', 'SERIE2', 'TAILLE', 'PIECES (-/+)', 'N', 'ENTREE', 'LOTE', 'SORTE', 'CHAINE'];
    entetes.forEach((label, i) => ecrire(ws, 4, i + 1, label, { bold: true, color: COULEUR_BLEU }));

    let precedente: { debut: number; fin: number } | null = null;
    serie.lignes.forEach((ligne, idx) => {
        const r = 5 + idx;
        ws.getRow(r).height = HAUTEUR_LIGNE;
        ecrire(ws, r, 1, ligne.date || undefined);
        ecrire(ws, r, 2, numOuTexte(ligne.paquet));
        ecrire(ws, r, 3, ligne.plis);

        const contigu = idx > 0 && !!precedente && ligne.debut === precedente.fin + 1;
        if (contigu) {
            ecrire(ws, r, 4, { formula: `${colLetter(5)}${r - 1}+1`, result: ligne.debut });
        } else {
            ecrire(ws, r, 4, ligne.debut);
        }
        ecrire(ws, r, 5, { formula: `${colLetter(4)}${r}+${colLetter(3)}${r}-1`, result: ligne.fin });

        ecrire(ws, r, 6, String(ligne.taille).toUpperCase());
        ecrire(ws, r, 7, typeof ligne.pieces === 'number' ? ligne.pieces : undefined);
        ecrire(ws, r, 8, ligne.n || undefined);
        ecrire(ws, r, 9, ligne.entree || undefined);
        ecrire(ws, r, 10, ligne.lote || undefined);
        ecrire(ws, r, 11, ligne.sortie || undefined);
        ecrire(ws, r, 12, ligne.chaine || undefined);

        precedente = { debut: ligne.debut, fin: ligne.fin };
    });

    ws.views = [{ state: 'frozen', ySplit: 4 }];
}

/* ------------------------------------------------------------------ */
/* Feuille "TRACES" (tous les placements PLT, toutes matières)          */
/* ------------------------------------------------------------------ */

function construireFeuilleTraces(wb: Classeur, d: DonneesExcelCoupe, nomFeuille: string): void {
    const ws: Feuille = wb.addWorksheet(nomFeuille, { pageSetup: { ...PAGE_SETUP } });
    ws.properties.defaultRowHeight = HAUTEUR_LIGNE;

    const largeurs = [16, 10, 20, 22, 12, 12, 10, 10];
    ws.columns = largeurs.map(width => ({ width }));

    ws.getRow(1).height = HAUTEUR_LIGNE;
    const entetes = ['Matiere', 'Code', 'Placement', 'Fichier PLT', 'Largo (m)', 'Ancho (cm)', 'Efic. %', 'Hojas max'];
    entetes.forEach((label, i) => ecrire(ws, 1, i + 1, label, { bold: true }));

    let r = 2;
    for (const tissu of d.tissus) {
        for (const pl of tissu.placements) {
            ws.getRow(r).height = HAUTEUR_LIGNE;
            ecrire(ws, r, 1, tissu.nom);
            ecrire(ws, r, 2, tissu.code || undefined);
            ecrire(ws, r, 3, pl.nom);
            ecrire(ws, r, 4, pl.fichier || undefined);
            ecrire(ws, r, 5, typeof pl.longueurM === 'number' ? pl.longueurM : undefined, { numFmt: FMT_METRES });
            ecrire(ws, r, 6, typeof pl.laizeCm === 'number' ? pl.laizeCm : undefined, { numFmt: FMT_ENTIER });
            ecrire(ws, r, 7, typeof pl.efficience === 'number' ? pl.efficience : undefined, { numFmt: FMT_ENTIER });
            ecrire(ws, r, 8, typeof pl.maxPlis === 'number' ? pl.maxPlis : undefined, { numFmt: FMT_ENTIER });
            r++;
        }
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];
}

/* ------------------------------------------------------------------ */
/* Construction du classeur                                             */
/* ------------------------------------------------------------------ */

/**
 * Dossier d'un modele : « 2560-207-251_ZINTURA (76237) », comme les classeurs
 * de l'atelier (article_client (commande)). Dedans, l'ordre de coupe et la serie.
 */
export function nomDossierModele(d: Pick<DonneesExcelCoupe, 'modele' | 'reference' | 'client' | 'pedido'>): string {
    const article = nettoyerSegmentFichier(d.modele) || nettoyerSegmentFichier(d.reference) || 'Modele';
    const client = nettoyerSegmentFichier(d.client);
    const pedido = nettoyerSegmentFichier(d.pedido);
    return `${article}${client ? `_${client}` : ''}${pedido ? ` (${pedido})` : ''}`.slice(0, 120);
}

/** Les deux classeurs d'un modele, dans son dossier. */
export function nomsFichiersModele(d: Pick<DonneesExcelCoupe, 'modele' | 'reference' | 'client' | 'pedido'>): { dossier: string; ordre: string; serie: string } {
    const dossier = nomDossierModele(d);
    return { dossier, ordre: `ORDRE DE COUPE ${dossier}.xlsx`, serie: `SERIE ${dossier}.xlsx` };
}

/**
 * `partie` : 'ordre' = feuilles des matieres + TRACES ; 'serie' = la feuille
 * SERIE seule (etiquetage) ; 'tout' = un seul classeur avec tout.
 */
export async function construireClasseurCoupe(d: DonneesExcelCoupe, partie: 'tout' | 'ordre' | 'serie' = 'tout'): Promise<ArrayBuffer> {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = d.entreprise || 'BERAMETHODE';
    wb.created = new Date();

    const auSerie = partie !== 'ordre' && !!(d.serie && d.serie.lignes && d.serie.lignes.length > 0);

    if (partie === 'serie') {
        construireFeuilleSerie(wb, d, (auSerie ? d.serie : { lignes: [] }) as SerieCoupe, 'SERIE - Tissu');
        const brut = await wb.xlsx.writeBuffer();
        const o = brut instanceof Uint8Array ? brut : new Uint8Array(brut as unknown as ArrayBufferLike);
        return o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer;
    }
    const nomFeuilleSerie = 'SERIE - Tissu';
    const nomFeuilleTraces = 'TRACES';

    const utilises = new Set<string>();
    if (auSerie) utilises.add(nomFeuilleSerie);
    utilises.add(nomFeuilleTraces);

    let indexPrincipal = d.tissus.findIndex(t => t.principal === true);
    if (indexPrincipal === -1) indexPrincipal = 0;

    d.tissus.forEach((tissu, i) => {
        const base = i === indexPrincipal ? 'Tissu' : (tissu.code || tissu.nom || `Matiere ${i + 1}`);
        const nom = nomFeuilleUnique(base, utilises);
        construireFeuilleMatiere(wb, d, tissu, nom);
        if (i === indexPrincipal && auSerie) {
            construireFeuilleSerie(wb, d, d.serie as SerieCoupe, nomFeuilleSerie);
        }
    });

    construireFeuilleTraces(wb, d, nomFeuilleTraces);

    const donnees = await wb.xlsx.writeBuffer();
    const octets = donnees instanceof Uint8Array ? donnees : new Uint8Array(donnees as unknown as ArrayBufferLike);
    return octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer;
}
