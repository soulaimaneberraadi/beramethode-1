/**
 * Classeur Excel d'un ordre de coupe : UNE SEULE feuille "Ordre de coupe" qui
 * s'enchaine de haut en bas comme la page de l'appli — titre, repartition
 * couleur x taille, puis pour chaque matiere : bandeau, placements PLT,
 * matelas (avec colonnes Sigma cumulees par couleur), totaux/commande/ecart.
 * Avant, chaque matiere avait sa propre feuille et l'atelier ne regardait que
 * la premiere : il croyait les matelas absents.
 *
 * Le nom de fichier est stable (construireClasseurCoupe + nomFichierExcel
 * de la meme commande donnent toujours le meme nom) : ecrit via dossierLocal.ts,
 * le classeur se remplace a chaque sauvegarde au lieu de s'empiler.
 *
 * Marche en navigateur et en Node (tests) : import dynamique d'exceljs, comme
 * components/CostCalculator.tsx.
 *
 * Lancer les tests : node --import tsx lib/coupeExcel.test.ts
 */
// Import de type seulement : efface a la compilation, n'alourdit pas le bundle
// (la valeur reelle est chargee en dynamique dans construireClasseurCoupe).
import type ExcelJS from 'exceljs';

export interface DonneesExcelCoupe {
    entreprise?: string;
    modele: string;
    reference?: string;
    client?: string;
    /** Type de vetement : Jupe, Sweat... */
    type?: string;
    /** Libelle humain du statut. */
    statut?: string;
    /** ISO ou date affichable. */
    date: string;
    /** Ordre des colonnes tailles, ex. ['XS','S','M','XL']. */
    tailles: string[];
    /** Commande par couleur x taille. */
    repartition: { couleur: string; quantites: Record<string, number> }[];
    tissus: {
        /** 'Tissu', 'Vlieseline', 'Doublure'... */
        nom: string;
        /** Tissu recu (m). */
        recuM?: number;
        placements: {
            /** 'M-XL', 'XS×2'... */
            nom: string;
            /** Pieces par pli, par taille. */
            ratios: Record<string, number>;
            /** Nom du fichier PLT. */
            fichier?: string;
            /** Longueur du trace par pli (m). */
            longueurM?: number;
            laizeCm?: number;
            /** % */
            efficience?: number;
            maxPlis?: number;
        }[];
        matelas: {
            /** N° ecrit sur les pieces, ex. '77'. */
            numero: string;
            placement: string;
            couleur: string;
            plis: number;
            /** Pieces par taille pour ce matelas (plis x ratio). */
            pieces: Record<string, number>;
            total: number;
            cumul: number;
            consoM: number;
            fait: boolean;
            groupe?: string;
            /** 'HH:MM' deja formate. */
            debut?: string;
            fin?: string;
            /** Nom du fichier trace numerote. */
            fichierSortie?: string;
        }[];
    }[];
}

/* ------------------------------------------------------------------ */
/* Palette (slate / indigo, calme — pas de couleurs criardes)          */
/* ------------------------------------------------------------------ */

const COULEUR_ENTETE = 'FF1E293B';     // slate-800 : bandeau titre + en-tetes de table
const COULEUR_ENTETE_TEXTE = 'FFFFFFFF';
const COULEUR_SOUS_ENTETE = 'FFE0E7FF'; // indigo-100 : titres de section (Placements/Matelas)
const COULEUR_SOUS_ENTETE_TEXTE = 'FF3730A3'; // indigo-800
const COULEUR_ZEBRA = 'FFF8FAFC';       // slate-50
const COULEUR_BORDURE = 'FFCBD5E1';     // slate-300
const COULEUR_LABEL = 'FF475569';       // slate-600
const COULEUR_TEXTE = 'FF0F172A';       // slate-900
const COULEUR_TOTAL_FOND = 'FFE2E8F0';  // slate-200
const COULEUR_FAIT_FOND = 'FFDCFCE7';   // green-100
const COULEUR_VERT_TEXTE = 'FF16A34A';  // green-600 : ✓ / ecart nul / sigma atteint
const COULEUR_ECART_NEG_FOND = 'FFFEE2E2'; // red-100
const COULEUR_ECART_NEG_TEXTE = 'FFB91C1C'; // red-700
const COULEUR_ECART_POS_FOND = 'FFFEF3C7'; // amber-100
const COULEUR_ECART_POS_TEXTE = 'FFB45309'; // amber-700
const COULEUR_SIGMA_TEXTE = 'FF94A3B8'; // slate-400 : colonnes Sigma (cumul), discretes

const FMT_ENTIER = '#,##0';
const FMT_METRES = '#,##0.00';
const FMT_POURCENT = '0"%"';
const FMT_RATIO = '[=0]"";"×"0';

/* ------------------------------------------------------------------ */
/* Utilitaires generiques                                              */
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

/** 'COUPE-<client>-<modele>[-<reference>].xlsx' — stable d'une sauvegarde a l'autre. */
export function nomFichierExcel(d: Pick<DonneesExcelCoupe, 'modele' | 'reference' | 'client'>): string {
    const parties = [d.client, d.modele, d.reference].map(nettoyerSegmentFichier).filter(Boolean);
    const base = parties.length > 0 ? `COUPE-${parties.join('-')}` : 'COUPE-ordre';
    return `${base}.xlsx`;
}

/** Commande totale par taille, toutes couleurs confondues. */
function commandeParTaille(d: DonneesExcelCoupe): Record<string, number> {
    const out: Record<string, number> = {};
    for (const taille of d.tailles) {
        out[taille] = d.repartition.reduce((s, r) => s + (Number(r.quantites[taille]) || 0), 0);
    }
    return out;
}

/** Commande d'une couleur precise (0 si la couleur n'est pas dans la repartition). */
function commandeCouleurTaille(d: DonneesExcelCoupe, couleur: string, taille: string): number {
    const ligne = d.repartition.find(r => r.couleur === couleur);
    return ligne ? (Number(ligne.quantites[taille]) || 0) : 0;
}

/* ------------------------------------------------------------------ */
/* Styles de cellule                                                   */
/* ------------------------------------------------------------------ */

type Cellule = ExcelJS.Cell;
type Feuille = ExcelJS.Worksheet;
type Classeur = ExcelJS.Workbook;

const bordureFine = { style: 'thin' as const, color: { argb: COULEUR_BORDURE } };
const toutesBordures = { top: bordureFine, left: bordureFine, bottom: bordureFine, right: bordureFine };

function styleBandeauTitre(c: Cellule) {
    c.font = { bold: true, size: 14, color: { argb: COULEUR_ENTETE_TEXTE }, name: 'Calibri' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ENTETE } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
}

function styleBandeauMatiere(c: Cellule) {
    c.font = { bold: true, size: 12, color: { argb: COULEUR_ENTETE_TEXTE }, name: 'Calibri' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ENTETE } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
}

function styleSousEnteteSection(c: Cellule) {
    c.font = { bold: true, size: 11, color: { argb: COULEUR_SOUS_ENTETE_TEXTE }, name: 'Calibri' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_SOUS_ENTETE } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
}

function styleEntete(c: Cellule) {
    c.font = { bold: true, size: 10, color: { argb: COULEUR_ENTETE_TEXTE }, name: 'Calibri' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ENTETE } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = toutesBordures;
}

function styleDonnee(c: Cellule, zebra: boolean) {
    c.font = { size: 10, color: { argb: COULEUR_TEXTE }, name: 'Calibri' };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    c.border = toutesBordures;
    if (zebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ZEBRA } };
}

function styleTotal(c: Cellule) {
    c.font = { bold: true, size: 10, color: { argb: COULEUR_TEXTE }, name: 'Calibri' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_TOTAL_FOND } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    c.border = toutesBordures;
}

function styleLabel(c: Cellule, texte: string) {
    c.value = texte;
    c.font = { bold: true, size: 10, color: { argb: COULEUR_LABEL }, name: 'Calibri' };
    c.alignment = { vertical: 'middle' };
}

function styleValeur(c: Cellule, valeur: string | number) {
    c.value = valeur;
    c.font = { size: 10, color: { argb: COULEUR_TEXTE }, name: 'Calibri' };
    c.alignment = { vertical: 'middle' };
}

/* ------------------------------------------------------------------ */
/* Disposition des colonnes de la table Matelas (la plus large) —      */
/* Repartition et Placements reutilisent juste les premieres colonnes. */
/* ------------------------------------------------------------------ */

interface Colonnes {
    fait: number; numero: number; placement: number; couleur: number; plis: number;
    tailleDebut: number; // paire (valeur, sigma) par taille, a partir d'ici
    total: number; cumul: number; conso: number; groupe: number; debut: number; fin: number; fichierSortie: number;
    nbCols: number;
}

function calculerColonnes(nTailles: number): Colonnes {
    const fait = 1, numero = 2, placement = 3, couleur = 4, plis = 5;
    const tailleDebut = 6;
    const total = tailleDebut + nTailles * 2;
    const cumul = total + 1;
    const conso = cumul + 1;
    const groupe = conso + 1;
    const debut = groupe + 1;
    const fin = debut + 1;
    const fichierSortie = fin + 1;
    return { fait, numero, placement, couleur, plis, tailleDebut, total, cumul, conso, groupe, debut, fin, fichierSortie, nbCols: fichierSortie };
}

function colValeurTaille(col: Colonnes, i: number): number { return col.tailleDebut + i * 2; }
function colSigmaTaille(col: Colonnes, i: number): number { return col.tailleDebut + i * 2 + 1; }

/* ------------------------------------------------------------------ */
/* Construction de la feuille unique                                   */
/* ------------------------------------------------------------------ */

function construireFeuilleOrdreDeCoupe(wb: Classeur, d: DonneesExcelCoupe): void {
    const tailles = d.tailles;
    const nTailles = tailles.length;
    const col = calculerColonnes(nTailles);
    const nbCols = col.nbCols;

    const ws: Feuille = wb.addWorksheet('Ordre de coupe', {
        pageSetup: {
            orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
        },
        views: [{ showGridLines: false }],
    });

    const largeurs: number[] = new Array(nbCols).fill(9);
    largeurs[col.fait - 1] = 6;
    largeurs[col.numero - 1] = 9;
    largeurs[col.placement - 1] = 18;
    largeurs[col.couleur - 1] = 13;
    largeurs[col.plis - 1] = 8;
    tailles.forEach((_, i) => {
        largeurs[colValeurTaille(col, i) - 1] = 9;
        largeurs[colSigmaTaille(col, i) - 1] = 10;
    });
    largeurs[col.total - 1] = 10;
    largeurs[col.cumul - 1] = 10;
    largeurs[col.conso - 1] = 11;
    largeurs[col.groupe - 1] = 12;
    largeurs[col.debut - 1] = 9;
    largeurs[col.fin - 1] = 9;
    largeurs[col.fichierSortie - 1] = 20;
    ws.columns = largeurs.map(width => ({ width }));

    // --- Bandeau titre ---
    ws.mergeCells(1, 1, 1, nbCols);
    const titre = ws.getCell(1, 1);
    titre.value = `${d.entreprise ? d.entreprise + ' — ' : ''}Ordre de coupe`;
    styleBandeauTitre(titre);
    ws.getRow(1).height = 30;

    // --- Bloc meta (une info par ligne, label en col A, valeur fusionnee sur le reste) ---
    const meta: [string, string][] = [
        ['Modèle', d.modele || '-'],
        ['Référence', d.reference || '-'],
        ['Client', d.client || '-'],
        ['Type', d.type || '-'],
        ['Statut', d.statut || '-'],
        ['Date', d.date || '-'],
    ];
    let r = 2;
    for (const [label, valeur] of meta) {
        styleLabel(ws.getCell(r, 1), label);
        ws.mergeCells(r, 2, r, nbCols);
        styleValeur(ws.getCell(r, 2), valeur);
        r++;
    }
    const derniereLigneMeta = r - 1;
    r++; // ligne vide

    /* ---------------------------------------------------------------- */
    /* Section Repartition (couleur x taille)                            */
    /* ---------------------------------------------------------------- */
    ws.mergeCells(r, 1, r, nbCols);
    styleSousEnteteSection(Object.assign(ws.getCell(r, 1), { value: 'Répartition' }));
    r++;

    const ligneEnteteRepart = r;
    const entetesRepart = ['Couleur', ...tailles, 'Total'];
    entetesRepart.forEach((label, i) => styleEntete(Object.assign(ws.getCell(r, i + 1), { value: label })));
    ws.getRow(r).height = 22;
    r++;

    const premiereLigneRepart = r;
    d.repartition.forEach((ligne, idx) => {
        const zebra = idx % 2 === 1;
        const cCouleur = ws.getCell(r, 1);
        cCouleur.value = ligne.couleur;
        styleDonnee(cCouleur, zebra);
        cCouleur.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        tailles.forEach((taille, i) => {
            const c = ws.getCell(r, 2 + i);
            c.value = Number(ligne.quantites[taille]) || 0;
            c.numFmt = FMT_ENTIER;
            styleDonnee(c, zebra);
        });

        const cTotal = ws.getCell(r, 2 + nTailles);
        const totalLigne = tailles.reduce((s, t) => s + (Number(ligne.quantites[t]) || 0), 0);
        cTotal.value = { formula: `SUM(${colLetter(2)}${r}:${colLetter(1 + nTailles)}${r})`, result: totalLigne };
        cTotal.numFmt = FMT_ENTIER;
        styleDonnee(cTotal, zebra);
        cTotal.font = { ...cTotal.font, bold: true };
        r++;
    });
    const derniereLigneRepart = r - 1;

    const ligneTotalRepart = r;
    const cLabelTotalRepart = ws.getCell(r, 1);
    cLabelTotalRepart.value = 'TOTAL';
    styleTotal(cLabelTotalRepart);
    cLabelTotalRepart.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    const commandeGlobale = commandeParTaille(d);
    tailles.forEach((taille, i) => {
        const c2 = 2 + i;
        const c = ws.getCell(ligneTotalRepart, c2);
        c.value = {
            formula: `SUM(${colLetter(c2)}${premiereLigneRepart}:${colLetter(c2)}${derniereLigneRepart})`,
            result: commandeGlobale[taille],
        };
        c.numFmt = FMT_ENTIER;
        styleTotal(c);
    });
    const grandTotalRepart = tailles.reduce((s, t) => s + commandeGlobale[t], 0);
    const cGrandTotalRepart = ws.getCell(ligneTotalRepart, 2 + nTailles);
    cGrandTotalRepart.value = {
        formula: `SUM(${colLetter(2)}${ligneTotalRepart}:${colLetter(1 + nTailles)}${ligneTotalRepart})`,
        result: grandTotalRepart,
    };
    cGrandTotalRepart.numFmt = FMT_ENTIER;
    styleTotal(cGrandTotalRepart);
    r++;
    r++; // ligne vide avant la premiere matiere

    /* ---------------------------------------------------------------- */
    /* Une section par matiere                                          */
    /* ---------------------------------------------------------------- */
    for (const tissu of d.tissus) {
        r = construireSectionMatiere(ws, tissu, d, col, r);
        r++; // ligne vide entre matieres
    }

    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: derniereLigneMeta }];
    ws.pageSetup.printTitlesRow = `1:${derniereLigneMeta}`;
}

/** Construit le bloc d'une matiere (bandeau + placements + matelas + totaux) a partir de la ligne `r0` ; rend la derniere ligne ecrite. */
function construireSectionMatiere(
    ws: Feuille,
    tissu: DonneesExcelCoupe['tissus'][number],
    d: DonneesExcelCoupe,
    col: Colonnes,
    r0: number,
): number {
    const tailles = d.tailles;
    const nTailles = tailles.length;
    const nbCols = col.nbCols;
    let r = r0;

    // --- Bandeau matiere (nom + recu eventuel, en un seul bandeau plein largeur) ---
    ws.mergeCells(r, 1, r, nbCols);
    const texteBandeau = typeof tissu.recuM === 'number'
        ? `Matière : ${tissu.nom}  —  Reçu ${tissu.recuM} m`
        : `Matière : ${tissu.nom}`;
    styleBandeauMatiere(Object.assign(ws.getCell(r, 1), { value: texteBandeau }));
    ws.getRow(r).height = 24;
    r++;

    // --- Section Placements (tracés PLT) ---
    ws.mergeCells(r, 1, r, nbCols);
    styleSousEnteteSection(Object.assign(ws.getCell(r, 1), { value: 'Placements (tracés PLT)' }));
    r++;

    const entetesPlacements = [
        'Placement', ...tailles, 'Pièces/pli', 'Fichier PLT', 'Longueur (m)', 'Laize (cm)', 'Efficience %', 'Plis max',
    ];
    entetesPlacements.forEach((label, i) => styleEntete(Object.assign(ws.getCell(r, i + 1), { value: label })));
    ws.getRow(r).height = 20;
    r++;

    tissu.placements.forEach((pl, idx) => {
        const zebra = idx % 2 === 1;
        const cNom = ws.getCell(r, 1);
        cNom.value = pl.nom;
        styleDonnee(cNom, zebra);
        cNom.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        let piecesParPli = 0;
        tailles.forEach((taille, i) => {
            const ratio = Number(pl.ratios[taille]) || 0;
            piecesParPli += ratio;
            const c = ws.getCell(r, 2 + i);
            c.value = ratio;
            c.numFmt = FMT_RATIO;
            styleDonnee(c, zebra);
        });

        const cPieces = ws.getCell(r, 2 + nTailles);
        cPieces.value = piecesParPli;
        cPieces.numFmt = FMT_ENTIER;
        styleDonnee(cPieces, zebra);
        cPieces.font = { ...cPieces.font, bold: true };

        const cFichier = ws.getCell(r, 3 + nTailles);
        cFichier.value = pl.fichier || '-';
        styleDonnee(cFichier, zebra);

        const cLongueur = ws.getCell(r, 4 + nTailles);
        cLongueur.value = typeof pl.longueurM === 'number' ? pl.longueurM : 0;
        cLongueur.numFmt = FMT_METRES;
        styleDonnee(cLongueur, zebra);

        const cLaize = ws.getCell(r, 5 + nTailles);
        cLaize.value = typeof pl.laizeCm === 'number' ? pl.laizeCm : 0;
        cLaize.numFmt = FMT_ENTIER;
        styleDonnee(cLaize, zebra);

        const cEff = ws.getCell(r, 6 + nTailles);
        cEff.value = typeof pl.efficience === 'number' ? pl.efficience : 0;
        cEff.numFmt = FMT_POURCENT;
        styleDonnee(cEff, zebra);

        const cMaxPlis = ws.getCell(r, 7 + nTailles);
        cMaxPlis.value = typeof pl.maxPlis === 'number' ? pl.maxPlis : 0;
        cMaxPlis.numFmt = FMT_ENTIER;
        styleDonnee(cMaxPlis, zebra);

        r++;
    });
    r++; // ligne vide

    // --- Section Matelas ---
    ws.mergeCells(r, 1, r, nbCols);
    styleSousEnteteSection(Object.assign(ws.getCell(r, 1), { value: 'Matelas' }));
    r++;

    const enteteMatelas = r;
    const entetesMatelas: string[] = [];
    entetesMatelas[col.fait - 1] = '✓';
    entetesMatelas[col.numero - 1] = 'N°';
    entetesMatelas[col.placement - 1] = 'Placement';
    entetesMatelas[col.couleur - 1] = 'Couleur';
    entetesMatelas[col.plis - 1] = 'Plis';
    tailles.forEach((t, i) => {
        entetesMatelas[colValeurTaille(col, i) - 1] = t;
        entetesMatelas[colSigmaTaille(col, i) - 1] = `Σ ${t}`;
    });
    entetesMatelas[col.total - 1] = 'Total';
    entetesMatelas[col.cumul - 1] = 'Cumul';
    entetesMatelas[col.conso - 1] = 'Conso (m)';
    entetesMatelas[col.groupe - 1] = 'Groupe';
    entetesMatelas[col.debut - 1] = 'Début';
    entetesMatelas[col.fin - 1] = 'Fin';
    entetesMatelas[col.fichierSortie - 1] = 'Fichier numéroté';
    entetesMatelas.forEach((label, i) => styleEntete(Object.assign(ws.getCell(r, i + 1), { value: label })));
    ws.getRow(r).height = 20;
    r++;

    const premiereLigneMatelas = r;
    // Cumul par couleur (Sigma), remis a zero a chaque matiere — c'est le
    // "depuis le premier matelas de CETTE matiere" demande.
    const cumulCouleur = new Map<string, Record<string, number>>();

    tissu.matelas.forEach((m, idx) => {
        const zebra = idx % 2 === 1;
        const fondFait = m.fait ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: COULEUR_FAIT_FOND } } : undefined;
        const applique = (c: Cellule) => { styleDonnee(c, zebra); if (fondFait) c.fill = fondFait; };

        const cFait = ws.getCell(r, col.fait);
        cFait.value = m.fait ? '✓' : '';
        applique(cFait);
        cFait.font = { ...cFait.font, bold: true, color: { argb: COULEUR_VERT_TEXTE } };

        const cNumero = ws.getCell(r, col.numero);
        cNumero.value = m.numero;
        applique(cNumero);
        cNumero.font = { ...cNumero.font, bold: true };

        const cPlacement = ws.getCell(r, col.placement);
        cPlacement.value = m.placement;
        applique(cPlacement);
        cPlacement.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        const cCouleur = ws.getCell(r, col.couleur);
        cCouleur.value = m.couleur;
        applique(cCouleur);

        const cPlis = ws.getCell(r, col.plis);
        cPlis.value = m.plis || 0;
        cPlis.numFmt = FMT_ENTIER;
        applique(cPlis);

        if (!cumulCouleur.has(m.couleur)) cumulCouleur.set(m.couleur, {});
        const cumulTailleCouleur = cumulCouleur.get(m.couleur)!;

        tailles.forEach((taille, i) => {
            const pieces = Number(m.pieces[taille]) || 0;
            const cVal = ws.getCell(r, colValeurTaille(col, i));
            cVal.value = pieces;
            cVal.numFmt = FMT_ENTIER;
            applique(cVal);

            const sigmaAvant = cumulTailleCouleur[taille] || 0;
            const sigma = sigmaAvant + pieces;
            cumulTailleCouleur[taille] = sigma;

            const colVal = colValeurTaille(col, i);
            const colSig = colSigmaTaille(col, i);
            const cSigma = ws.getCell(r, colSig);
            cSigma.value = {
                formula: `SUMIFS(${colLetter(colVal)}$${premiereLigneMatelas}:${colLetter(colVal)}${r}, ${colLetter(col.couleur)}$${premiereLigneMatelas}:${colLetter(col.couleur)}${r}, ${colLetter(col.couleur)}${r})`,
                result: sigma,
            };
            cSigma.numFmt = FMT_ENTIER;
            applique(cSigma);
            cSigma.font = { ...cSigma.font, color: { argb: COULEUR_SIGMA_TEXTE } };

            const commandeCouleur = commandeCouleurTaille(d, m.couleur, taille);
            if (commandeCouleur > 0 || sigma > 0) {
                if (sigma === commandeCouleur) {
                    cSigma.font = { ...cSigma.font, bold: true, color: { argb: COULEUR_VERT_TEXTE } };
                } else if (sigma > commandeCouleur) {
                    cSigma.font = { ...cSigma.font, color: { argb: COULEUR_ECART_POS_TEXTE } };
                }
            }
        });

        const cTotal = ws.getCell(r, col.total);
        cTotal.value = {
            formula: `SUM(${colLetter(colValeurTaille(col, 0))}${r}:${colLetter(colValeurTaille(col, nTailles - 1))}${r})`,
            result: m.total,
        };
        cTotal.numFmt = FMT_ENTIER;
        applique(cTotal);
        cTotal.font = { ...cTotal.font, bold: true };

        const cCumul = ws.getCell(r, col.cumul);
        cCumul.value = m.cumul || 0;
        cCumul.numFmt = FMT_ENTIER;
        applique(cCumul);

        const cConso = ws.getCell(r, col.conso);
        cConso.value = m.consoM || 0;
        cConso.numFmt = FMT_METRES;
        applique(cConso);

        const cGroupe = ws.getCell(r, col.groupe);
        cGroupe.value = m.groupe || '-';
        applique(cGroupe);

        const cDebut = ws.getCell(r, col.debut);
        cDebut.value = m.debut || '-';
        applique(cDebut);

        const cFin = ws.getCell(r, col.fin);
        cFin.value = m.fin || '-';
        applique(cFin);

        const cFichierSortie = ws.getCell(r, col.fichierSortie);
        cFichierSortie.value = m.fichierSortie || '-';
        applique(cFichierSortie);
        cFichierSortie.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        r++;
    });
    const derniereLigneMatelas = r - 1;
    const aDesMatelas = tissu.matelas.length > 0;

    // --- Ligne de totaux (formules SUM avec resultat en cache ; colonnes Sigma vides) ---
    const ligneTotaux = r;
    styleTotal(Object.assign(ws.getCell(r, col.fait), { value: '' }));
    styleTotal(Object.assign(ws.getCell(r, col.numero), { value: '' }));
    const cLabelTotaux = ws.getCell(r, col.placement);
    cLabelTotaux.value = 'TOTAL';
    styleTotal(cLabelTotaux);
    cLabelTotaux.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    styleTotal(Object.assign(ws.getCell(r, col.couleur), { value: '' }));

    const sumRange = (c: number) => `${colLetter(c)}${premiereLigneMatelas}:${colLetter(c)}${derniereLigneMatelas}`;
    const sommeCol = (extract: (m: (typeof tissu.matelas)[number]) => number) =>
        tissu.matelas.reduce((s, m) => s + (extract(m) || 0), 0);

    const cPlisTotal = ws.getCell(r, col.plis);
    cPlisTotal.value = aDesMatelas
        ? { formula: `SUM(${sumRange(col.plis)})`, result: sommeCol(m => m.plis) }
        : 0;
    cPlisTotal.numFmt = FMT_ENTIER;
    styleTotal(cPlisTotal);

    const totalParTaille: Record<string, number> = {};
    tailles.forEach((taille, i) => {
        const colVal = colValeurTaille(col, i);
        const colSig = colSigmaTaille(col, i);
        const total = sommeCol(m => Number(m.pieces[taille]) || 0);
        totalParTaille[taille] = total;
        const c = ws.getCell(r, colVal);
        c.value = aDesMatelas ? { formula: `SUM(${sumRange(colVal)})`, result: total } : 0;
        c.numFmt = FMT_ENTIER;
        styleTotal(c);
        styleTotal(Object.assign(ws.getCell(r, colSig), { value: '' }));
    });

    const totalGeneral = tailles.reduce((s, t) => s + totalParTaille[t], 0);
    const cTotalTotal = ws.getCell(r, col.total);
    cTotalTotal.value = aDesMatelas
        ? { formula: `SUM(${sumRange(col.total)})`, result: totalGeneral }
        : 0;
    cTotalTotal.numFmt = FMT_ENTIER;
    styleTotal(cTotalTotal);

    styleTotal(Object.assign(ws.getCell(r, col.cumul), { value: '' }));

    const consoTotal = sommeCol(m => m.consoM);
    const cConsoTotal = ws.getCell(r, col.conso);
    cConsoTotal.value = aDesMatelas ? { formula: `SUM(${sumRange(col.conso)})`, result: consoTotal } : 0;
    cConsoTotal.numFmt = FMT_METRES;
    styleTotal(cConsoTotal);

    for (const c of [col.groupe, col.debut, col.fin, col.fichierSortie]) {
        styleTotal(Object.assign(ws.getCell(r, c), { value: '' }));
    }
    r++;

    // --- Ligne Commande (repartition, toutes couleurs) ---
    const ligneCommande = r;
    const commande = commandeParTaille(d);
    const cLabelCommande = ws.getCell(r, col.placement);
    cLabelCommande.value = 'Commande';
    styleDonnee(cLabelCommande, false);
    cLabelCommande.font = { ...cLabelCommande.font, bold: true };
    cLabelCommande.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    tailles.forEach((taille, i) => {
        const colVal = colValeurTaille(col, i);
        const c = ws.getCell(r, colVal);
        c.value = commande[taille];
        c.numFmt = FMT_ENTIER;
        styleDonnee(c, false);
    });
    const commandeTotale = tailles.reduce((s, t) => s + commande[t], 0);
    const cCommandeTotal = ws.getCell(r, col.total);
    cCommandeTotal.value = {
        formula: `SUM(${colLetter(colValeurTaille(col, 0))}${ligneCommande}:${colLetter(colValeurTaille(col, nTailles - 1))}${ligneCommande})`,
        result: commandeTotale,
    };
    cCommandeTotal.numFmt = FMT_ENTIER;
    styleDonnee(cCommandeTotal, false);
    cCommandeTotal.font = { ...cCommandeTotal.font, bold: true };
    r++;

    // --- Ligne Ecart (prevu - commande, formule, couleur selon le signe ; vert si nul) ---
    const ligneEcart = r;
    const cLabelEcart = ws.getCell(r, col.placement);
    cLabelEcart.value = 'Écart';
    styleDonnee(cLabelEcart, false);
    cLabelEcart.font = { ...cLabelEcart.font, bold: true };
    cLabelEcart.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    const styleEcart = (c: Cellule, valeur: number) => {
        c.numFmt = FMT_ENTIER;
        c.font = { ...c.font, bold: true };
        if (valeur < 0) {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ECART_NEG_FOND } };
            c.font = { ...c.font, color: { argb: COULEUR_ECART_NEG_TEXTE } };
        } else if (valeur > 0) {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ECART_POS_FOND } };
            c.font = { ...c.font, color: { argb: COULEUR_ECART_POS_TEXTE } };
        } else {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_FAIT_FOND } };
            c.font = { ...c.font, color: { argb: COULEUR_VERT_TEXTE } };
        }
    };

    tailles.forEach((taille, i) => {
        const colVal = colValeurTaille(col, i);
        const ecart = totalParTaille[taille] - commande[taille];
        const c = ws.getCell(r, colVal);
        c.value = { formula: `${colLetter(colVal)}${ligneTotaux}-${colLetter(colVal)}${ligneCommande}`, result: ecart };
        styleDonnee(c, false);
        styleEcart(c, ecart);
    });
    const ecartTotal = totalGeneral - commandeTotale;
    const cEcartTotal = ws.getCell(r, col.total);
    cEcartTotal.value = { formula: `${colLetter(col.total)}${ligneTotaux}-${colLetter(col.total)}${ligneCommande}`, result: ecartTotal };
    styleDonnee(cEcartTotal, false);
    styleEcart(cEcartTotal, ecartTotal);
    r++;

    // --- Ligne Reçu / Reste (m), seulement si recu connu ---
    if (typeof tissu.recuM === 'number') {
        const ligneRecu = r;
        const cLabel = ws.getCell(r, col.placement);
        cLabel.value = 'Reçu / Reste (m)';
        styleDonnee(cLabel, false);
        cLabel.font = { ...cLabel.font, bold: true };
        cLabel.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        const cRecu = ws.getCell(r, col.conso);
        cRecu.value = tissu.recuM;
        cRecu.numFmt = FMT_METRES;
        styleDonnee(cRecu, false);

        const cResteAddr = `${colLetter(col.conso)}${ligneRecu}`;
        const cConsoTotalAddr = `${colLetter(col.conso)}${ligneTotaux}`;
        const cReste = ws.getCell(r, col.groupe);
        cReste.value = { formula: `${cResteAddr}-${cConsoTotalAddr}`, result: (tissu.recuM || 0) - consoTotal };
        cReste.numFmt = FMT_METRES;
        styleDonnee(cReste, false);
        r++;
    }

    return r - 1;
}

/* ------------------------------------------------------------------ */
/* Construction du classeur                                            */
/* ------------------------------------------------------------------ */

export async function construireClasseurCoupe(d: DonneesExcelCoupe): Promise<ArrayBuffer> {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = d.entreprise || 'BERAMETHODE';
    wb.created = new Date();

    construireFeuilleOrdreDeCoupe(wb, d);

    const donnees = await wb.xlsx.writeBuffer();
    const octets = donnees instanceof Uint8Array ? donnees : new Uint8Array(donnees as unknown as ArrayBufferLike);
    return octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer;
}
