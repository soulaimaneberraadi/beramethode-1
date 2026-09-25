/**
 * Classeur Excel d'un ordre de coupe : une feuille "Ordre" (repartition
 * couleur x taille) + une feuille par tissu (placements PLT puis matelas,
 * avec commande/ecart pour verifier d'un coup d'oeil qu'on a assez trace).
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
const COULEUR_ECART_NEG_FOND = 'FFFEE2E2'; // red-100
const COULEUR_ECART_NEG_TEXTE = 'FFB91C1C'; // red-700
const COULEUR_ECART_POS_FOND = 'FFFEF3C7'; // amber-100
const COULEUR_ECART_POS_TEXTE = 'FFB45309'; // amber-700

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

/** Caracteres interdits dans un nom de feuille Excel. */
const CARACTERES_INTERDITS_FEUILLE = /[\\/?*[\]:]/g;

/** Nom de feuille valide (<=31 car., unique) a partir d'un nom de tissu quelconque. */
function nomFeuilleUnique(nomTissu: string, dejaUtilises: Set<string>): string {
    const base = (nomTissu || 'Tissu').replace(CARACTERES_INTERDITS_FEUILLE, ' ').trim().slice(0, 31) || 'Tissu';
    let candidat = base;
    let n = 2;
    while (dejaUtilises.has(candidat.toLowerCase())) {
        const suffixe = ` (${n})`;
        candidat = base.slice(0, 31 - suffixe.length) + suffixe;
        n++;
    }
    dejaUtilises.add(candidat.toLowerCase());
    return candidat;
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
/* Feuille "Ordre"                                                     */
/* ------------------------------------------------------------------ */

function construireFeuilleOrdre(wb: Classeur, d: DonneesExcelCoupe): void {
    const nTailles = d.tailles.length;
    const nbCols = 2 + nTailles; // Couleur + tailles + Total

    const ws: Feuille = wb.addWorksheet('Ordre', {
        pageSetup: {
            orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
        },
        views: [{ showGridLines: false }],
    });

    ws.columns = [
        { width: 22 },
        ...Array.from({ length: nTailles }, () => ({ width: 11 })),
        { width: 14 },
    ];

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
    r++; // ligne vide

    // --- Table repartition couleur x taille ---
    const ligneEntete = r;
    const entetes = ['Couleur', ...d.tailles, 'Total'];
    entetes.forEach((label, i) => styleEntete(Object.assign(ws.getCell(ligneEntete, i + 1), { value: label })));
    ws.getRow(ligneEntete).height = 22;
    r++;

    const premiereLigneData = r;
    d.repartition.forEach((ligne, idx) => {
        const zebra = idx % 2 === 1;
        const cCouleur = ws.getCell(r, 1);
        cCouleur.value = ligne.couleur;
        styleDonnee(cCouleur, zebra);
        cCouleur.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        d.tailles.forEach((taille, i) => {
            const c = ws.getCell(r, 2 + i);
            c.value = Number(ligne.quantites[taille]) || 0;
            c.numFmt = FMT_ENTIER;
            styleDonnee(c, zebra);
        });

        const cTotal = ws.getCell(r, 2 + nTailles);
        const totalLigne = d.tailles.reduce((s, t) => s + (Number(ligne.quantites[t]) || 0), 0);
        cTotal.value = { formula: `SUM(${colLetter(2)}${r}:${colLetter(1 + nTailles)}${r})`, result: totalLigne };
        cTotal.numFmt = FMT_ENTIER;
        styleDonnee(cTotal, zebra);
        cTotal.font = { ...cTotal.font, bold: true };
        r++;
    });
    const derniereLigneData = r - 1;

    // --- Ligne TOTAL + grand total ---
    const ligneTotal = r;
    const cLabelTotal = ws.getCell(ligneTotal, 1);
    cLabelTotal.value = 'TOTAL';
    styleTotal(cLabelTotal);
    cLabelTotal.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    const commande = commandeParTaille(d);
    d.tailles.forEach((taille, i) => {
        const col = 2 + i;
        const c = ws.getCell(ligneTotal, col);
        c.value = {
            formula: `SUM(${colLetter(col)}${premiereLigneData}:${colLetter(col)}${derniereLigneData})`,
            result: commande[taille],
        };
        c.numFmt = FMT_ENTIER;
        styleTotal(c);
    });
    const grandTotal = d.tailles.reduce((s, t) => s + commande[t], 0);
    const cGrandTotal = ws.getCell(ligneTotal, 2 + nTailles);
    cGrandTotal.value = {
        formula: `SUM(${colLetter(2)}${ligneTotal}:${colLetter(1 + nTailles)}${ligneTotal})`,
        result: grandTotal,
    };
    cGrandTotal.numFmt = FMT_ENTIER;
    styleTotal(cGrandTotal);

    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: ligneEntete }];
    ws.pageSetup.printTitlesRow = `${ligneEntete}:${ligneEntete}`;
}

/* ------------------------------------------------------------------ */
/* Feuille par tissu                                                   */
/* ------------------------------------------------------------------ */

function construireFeuilleTissu(
    wb: Classeur,
    tissu: DonneesExcelCoupe['tissus'][number],
    d: DonneesExcelCoupe,
    dejaUtilises: Set<string>,
): void {
    const tailles = d.tailles;
    const nTailles = tailles.length;
    // Colonnes de la table Matelas (la plus large) ; la table Placements
    // partage les memes colonnes, ce qui laisse quelques largeurs approximatives
    // pour elle mais rien n'est jamais tronque (juste un peu d'air en trop).
    const colFait = 1, colNumero = 2, colPlacement = 3, colCouleur = 4, colPlis = 5;
    const colTailleDebut = 6;
    const colTotal = colTailleDebut + nTailles;
    const colCumul = colTotal + 1;
    const colConso = colCumul + 1;
    const colGroupe = colConso + 1;
    const colDebut = colGroupe + 1;
    const colFin = colDebut + 1;
    const colFichierSortie = colFin + 1;
    const nbCols = colFichierSortie;

    const nomFeuille = nomFeuilleUnique(tissu.nom, dejaUtilises);
    const ws: Feuille = wb.addWorksheet(nomFeuille, {
        pageSetup: {
            orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
        },
        views: [{ showGridLines: false }],
    });

    ws.columns = [
        { width: 6 }, { width: 9 }, { width: 18 }, { width: 13 }, { width: 8 },
        ...Array.from({ length: nTailles }, () => ({ width: 9 })),
        { width: 10 }, { width: 10 }, { width: 11 }, { width: 12 }, { width: 9 }, { width: 9 }, { width: 20 },
    ];

    // --- Bandeau titre ---
    ws.mergeCells(1, 1, 1, nbCols);
    const titre = ws.getCell(1, 1);
    titre.value = tissu.nom;
    styleBandeauTitre(titre);
    ws.getRow(1).height = 28;

    let r = 2;

    // --- Recu / reste (seulement si recu connu ; "reste" pointe vers la ligne
    // de total Conso ecrite plus bas — la reference avant coup n'est pas un
    // probleme pour Excel) ---
    let ligneRecu: number | null = null;
    if (typeof tissu.recuM === 'number') {
        ligneRecu = r;
        styleLabel(ws.getCell(r, 1), 'Reçu (m)');
        const cRecu = ws.getCell(r, 2);
        cRecu.value = tissu.recuM;
        cRecu.numFmt = FMT_METRES;
        cRecu.font = { size: 10, color: { argb: COULEUR_TEXTE } };
        styleLabel(ws.getCell(r, 4), 'Reste (m)');
        // La formule est completee apres avoir ecrit la ligne de totaux (voir plus bas).
        r++;
        r++; // ligne vide
    }

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
    entetesMatelas[colFait - 1] = '✓';
    entetesMatelas[colNumero - 1] = 'N°';
    entetesMatelas[colPlacement - 1] = 'Placement';
    entetesMatelas[colCouleur - 1] = 'Couleur';
    entetesMatelas[colPlis - 1] = 'Plis';
    tailles.forEach((t, i) => { entetesMatelas[colTailleDebut - 1 + i] = t; });
    entetesMatelas[colTotal - 1] = 'Total';
    entetesMatelas[colCumul - 1] = 'Cumul';
    entetesMatelas[colConso - 1] = 'Conso (m)';
    entetesMatelas[colGroupe - 1] = 'Groupe';
    entetesMatelas[colDebut - 1] = 'Début';
    entetesMatelas[colFin - 1] = 'Fin';
    entetesMatelas[colFichierSortie - 1] = 'Fichier numéroté';
    entetesMatelas.forEach((label, i) => styleEntete(Object.assign(ws.getCell(r, i + 1), { value: label })));
    ws.getRow(r).height = 20;
    r++;

    const premiereLigneMatelas = r;
    tissu.matelas.forEach((m, idx) => {
        const zebra = idx % 2 === 1;
        const fondFait = m.fait ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: COULEUR_FAIT_FOND } } : undefined;
        const applique = (c: Cellule) => { styleDonnee(c, zebra); if (fondFait) c.fill = fondFait; };

        const cFait = ws.getCell(r, colFait);
        cFait.value = m.fait ? '✓' : '';
        applique(cFait);
        cFait.font = { ...cFait.font, bold: true, color: { argb: 'FF16A34A' } };

        const cNumero = ws.getCell(r, colNumero);
        cNumero.value = m.numero;
        applique(cNumero);
        cNumero.font = { ...cNumero.font, bold: true };

        const cPlacement = ws.getCell(r, colPlacement);
        cPlacement.value = m.placement;
        applique(cPlacement);
        cPlacement.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        const cCouleur = ws.getCell(r, colCouleur);
        cCouleur.value = m.couleur;
        applique(cCouleur);

        const cPlis = ws.getCell(r, colPlis);
        cPlis.value = m.plis || 0;
        cPlis.numFmt = FMT_ENTIER;
        applique(cPlis);

        tailles.forEach((taille, i) => {
            const c = ws.getCell(r, colTailleDebut + i);
            c.value = Number(m.pieces[taille]) || 0;
            c.numFmt = FMT_ENTIER;
            applique(c);
        });

        const cTotal = ws.getCell(r, colTotal);
        cTotal.value = {
            formula: `SUM(${colLetter(colTailleDebut)}${r}:${colLetter(colTailleDebut + nTailles - 1)}${r})`,
            result: m.total,
        };
        cTotal.numFmt = FMT_ENTIER;
        applique(cTotal);
        cTotal.font = { ...cTotal.font, bold: true };

        const cCumul = ws.getCell(r, colCumul);
        cCumul.value = m.cumul || 0;
        cCumul.numFmt = FMT_ENTIER;
        applique(cCumul);

        const cConso = ws.getCell(r, colConso);
        cConso.value = m.consoM || 0;
        cConso.numFmt = FMT_METRES;
        applique(cConso);

        const cGroupe = ws.getCell(r, colGroupe);
        cGroupe.value = m.groupe || '-';
        applique(cGroupe);

        const cDebut = ws.getCell(r, colDebut);
        cDebut.value = m.debut || '-';
        applique(cDebut);

        const cFin = ws.getCell(r, colFin);
        cFin.value = m.fin || '-';
        applique(cFin);

        const cFichierSortie = ws.getCell(r, colFichierSortie);
        cFichierSortie.value = m.fichierSortie || '-';
        applique(cFichierSortie);
        cFichierSortie.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        r++;
    });
    const derniereLigneMatelas = r - 1;
    const aDesMatelas = tissu.matelas.length > 0;

    // --- Ligne de totaux (formules SUM avec resultat en cache) ---
    const ligneTotaux = r;
    styleTotal(Object.assign(ws.getCell(r, colFait), { value: '' }));
    styleTotal(Object.assign(ws.getCell(r, colNumero), { value: '' }));
    const cLabelTotaux = ws.getCell(r, colPlacement);
    cLabelTotaux.value = 'TOTAL';
    styleTotal(cLabelTotaux);
    cLabelTotaux.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    styleTotal(Object.assign(ws.getCell(r, colCouleur), { value: '' }));

    const sumRange = (col: number) => `${colLetter(col)}${premiereLigneMatelas}:${colLetter(col)}${derniereLigneMatelas}`;
    const sommeCol = (col: number, extract: (m: (typeof tissu.matelas)[number]) => number) =>
        tissu.matelas.reduce((s, m) => s + (extract(m) || 0), 0);

    const cPlisTotal = ws.getCell(r, colPlis);
    cPlisTotal.value = aDesMatelas
        ? { formula: `SUM(${sumRange(colPlis)})`, result: sommeCol(colPlis, m => m.plis) }
        : 0;
    cPlisTotal.numFmt = FMT_ENTIER;
    styleTotal(cPlisTotal);

    const totalParTaille: Record<string, number> = {};
    tailles.forEach((taille, i) => {
        const col = colTailleDebut + i;
        const total = sommeCol(col, m => Number(m.pieces[taille]) || 0);
        totalParTaille[taille] = total;
        const c = ws.getCell(r, col);
        c.value = aDesMatelas ? { formula: `SUM(${sumRange(col)})`, result: total } : 0;
        c.numFmt = FMT_ENTIER;
        styleTotal(c);
    });

    const totalGeneral = tailles.reduce((s, t) => s + totalParTaille[t], 0);
    const cTotalTotal = ws.getCell(r, colTotal);
    cTotalTotal.value = aDesMatelas
        ? { formula: `SUM(${sumRange(colTotal)})`, result: totalGeneral }
        : 0;
    cTotalTotal.numFmt = FMT_ENTIER;
    styleTotal(cTotalTotal);

    styleTotal(Object.assign(ws.getCell(r, colCumul), { value: '' }));

    const consoTotal = sommeCol(colConso, m => m.consoM);
    const cConsoTotal = ws.getCell(r, colConso);
    cConsoTotal.value = aDesMatelas ? { formula: `SUM(${sumRange(colConso)})`, result: consoTotal } : 0;
    cConsoTotal.numFmt = FMT_METRES;
    styleTotal(cConsoTotal);

    for (const col of [colGroupe, colDebut, colFin, colFichierSortie]) {
        styleTotal(Object.assign(ws.getCell(r, col), { value: '' }));
    }
    r++;

    // Complete la formule "Reste (m)" laissee en attente plus haut, maintenant
    // que la cellule Conso totale existe.
    if (ligneRecu !== null) {
        const cReste = ws.getCell(ligneRecu, 5);
        const cRecuAddr = `${colLetter(2)}${ligneRecu}`;
        const cConsoTotalAddr = `${colLetter(colConso)}${ligneTotaux}`;
        cReste.value = { formula: `${cRecuAddr}-${cConsoTotalAddr}`, result: (tissu.recuM || 0) - consoTotal };
        cReste.numFmt = FMT_METRES;
        cReste.font = { size: 10, color: { argb: COULEUR_TEXTE } };
    }

    // --- Ligne Commande (repartition, toutes couleurs) ---
    const ligneCommande = r;
    const commande = commandeParTaille(d);
    const cLabelCommande = ws.getCell(r, colPlacement);
    cLabelCommande.value = 'Commande';
    styleDonnee(cLabelCommande, false);
    cLabelCommande.font = { ...cLabelCommande.font, bold: true };
    cLabelCommande.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    tailles.forEach((taille, i) => {
        const col = colTailleDebut + i;
        const c = ws.getCell(r, col);
        c.value = commande[taille];
        c.numFmt = FMT_ENTIER;
        styleDonnee(c, false);
    });
    const commandeTotale = tailles.reduce((s, t) => s + commande[t], 0);
    const cCommandeTotal = ws.getCell(r, colTotal);
    cCommandeTotal.value = {
        formula: `SUM(${colLetter(colTailleDebut)}${ligneCommande}:${colLetter(colTailleDebut + nTailles - 1)}${ligneCommande})`,
        result: commandeTotale,
    };
    cCommandeTotal.numFmt = FMT_ENTIER;
    styleDonnee(cCommandeTotal, false);
    cCommandeTotal.font = { ...cCommandeTotal.font, bold: true };
    r++;

    // --- Ligne Ecart (prevu - commande, formule, couleur selon le signe) ---
    const ligneEcart = r;
    const cLabelEcart = ws.getCell(r, colPlacement);
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
        }
    };

    tailles.forEach((taille, i) => {
        const col = colTailleDebut + i;
        const ecart = totalParTaille[taille] - commande[taille];
        const c = ws.getCell(r, col);
        c.value = { formula: `${colLetter(col)}${ligneTotaux}-${colLetter(col)}${ligneCommande}`, result: ecart };
        styleDonnee(c, false);
        styleEcart(c, ecart);
    });
    const ecartTotal = totalGeneral - commandeTotale;
    const cEcartTotal = ws.getCell(r, colTotal);
    cEcartTotal.value = { formula: `${colLetter(colTotal)}${ligneTotaux}-${colLetter(colTotal)}${ligneCommande}`, result: ecartTotal };
    styleDonnee(cEcartTotal, false);
    styleEcart(cEcartTotal, ecartTotal);
    r++;

    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: enteteMatelas }];
    ws.pageSetup.printTitlesRow = `${enteteMatelas}:${enteteMatelas}`;
}

/* ------------------------------------------------------------------ */
/* Construction du classeur                                            */
/* ------------------------------------------------------------------ */

export async function construireClasseurCoupe(d: DonneesExcelCoupe): Promise<ArrayBuffer> {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = d.entreprise || 'BERAMETHODE';
    wb.created = new Date();

    construireFeuilleOrdre(wb, d);

    const dejaUtilises = new Set<string>();
    for (const tissu of d.tissus) {
        construireFeuilleTissu(wb, tissu, d, dejaUtilises);
    }

    const donnees = await wb.xlsx.writeBuffer();
    const octets = donnees instanceof Uint8Array ? donnees : new Uint8Array(donnees as unknown as ArrayBufferLike);
    return octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer;
}
