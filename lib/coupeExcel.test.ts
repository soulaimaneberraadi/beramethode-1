/**
 * Lancer: node --import tsx lib/coupeExcel.test.ts
 *
 * Construit un classeur calqué sur le gabarit atelier "ZINTURA" (une feuille
 * par matière, "SERIE - Tissu" juste après la matière principale, "TRACES"
 * en dernier), le relit avec exceljs et vérifie la disposition : bandeaux,
 * bloc TALLAS/répartition, bloc TEJIDO, table Colchon (matelas) avec ses
 * colonnes valeur/TOTAL-taille et ses formules en cascade, ligne TOTAL CUT,
 * ligne ECART, feuille SERIE, feuille TRACES. Écrit aussi une copie sur
 * disque pour inspection visuelle.
 *
 * Note sur les colonnes : la disposition demandée place la dernière colonne
 * ("TOTAL" général) à 7+2*n où n = tailles.length. Avec les 5 tailles de ce
 * fixture (XS,S,M,L,XL) cette colonne tombe en Q (17), pas en S (19, qui ne
 * vaudrait que pour 6 tailles) : les tests calculent donc cette colonne via
 * colDerniere(n) au lieu de coder en dur une lettre, pour rester corrects
 * quel que soit n.
 */
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { construireClasseurCoupe, nomFichierExcel, type DonneesExcelCoupe } from './coupeExcel';

const presque = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} != ${b}`);

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
function colValeurTaille(k: number): number { return 7 + 2 * k; }
function colPaireTaille(k: number): number { return 8 + 2 * k; }
function colDerniere(n: number): number { return 7 + 2 * n; }

/* ------------------------------------------------------------------ */
/* Données de référence                                                 */
/* ------------------------------------------------------------------ */

const tailles = ['XS', 'S', 'M', 'L', 'XL'];
const n = tailles.length;
const last = colDerniere(n); // = 17 = Q

const donnees: DonneesExcelCoupe = {
    entreprise: 'STAR STYLE',
    modele: 'Jupe Zara',
    reference: 'RF7887.600.81',
    client: 'Zara',
    type: 'Jupe',
    statut: 'En cours',
    date: '25/09/2026',
    pedido: '458963',
    refFournisseur: 'PRV-01',
    tailles,
    repartition: [
        { couleur: 'Ecru', quantites: { XS: 1315, S: 1814, M: 1693, L: 1025, XL: 463 } },
    ],
    tissus: [
        {
            nom: 'Tissu',
            code: 'TE',
            principal: true,
            recuM: 900,
            laizeCm: 150,
            placements: [
                { nom: 'S-M', code: 'PA', ratios: { S: 2, M: 2 }, fichier: 'SM.plt', longueurM: 3.6, laizeCm: 150, efficience: 85, maxPlis: 90 },
                { nom: 'XS-L', code: 'PB', ratios: { XS: 2, L: 2 }, fichier: 'XSL.plt', longueurM: 3.5, laizeCm: 150, efficience: 87, maxPlis: 90 },
            ],
            matelas: [
                { numero: '1', placement: 'S-M', notation: 'S*2', couleur: 'Ecru', couleurIndex: 1, plis: 82, longueurM: 3.6, pieces: { S: 164 }, total: 164, cumul: 164, consoM: 295.2, fait: true },
                { numero: '2', placement: 'S-M', notation: 'M*2', couleur: 'Ecru', couleurIndex: 1, plis: 82, longueurM: 3.65, pieces: { M: 164 }, total: 164, cumul: 328, consoM: 299.3, fait: false, envoye: true },
                { numero: '3', placement: 'XS-L', notation: 'XS-L*2', couleur: 'Ecru', couleurIndex: 1, plis: 86, pieces: { XS: 172, L: 172 }, total: 344, cumul: 672, consoM: 0, fait: false },
            ],
        },
        {
            nom: 'Doublure',
            code: 'FO',
            placements: [],
            matelas: [
                // Pas de `notation` fournie : doit être reconstruite ('XS*1').
                { numero: '1', placement: 'Unique', couleur: 'Ecru', couleurIndex: 1, plis: 50, pieces: { XS: 50 }, total: 50, cumul: 50, consoM: 20, fait: true },
            ],
        },
    ],
    serie: {
        lignes: [
            { paquet: '1', plis: 82, debut: 1, fin: 82, taille: 'S' },
            { paquet: '2', plis: 82, debut: 83, fin: 164, taille: 'S' }, // contigu (83 = 82+1)
            { paquet: '3', plis: 86, debut: 165, fin: 250, taille: 'XS' }, // contigu (165 = 164+1)
            { paquet: '4', plis: 86, debut: 1, fin: 86, taille: 'L' }, // non contigu -> valeur littérale
        ],
    },
};

async function main() {
    const buf = await construireClasseurCoupe(donnees);
    assert.ok(buf instanceof ArrayBuffer, 'construireClasseurCoupe rend un ArrayBuffer');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    /* ------------------------------------------------------------------ */
    /* Feuilles : ordre et noms                                             */
    /* ------------------------------------------------------------------ */
    const noms = wb.worksheets.map(ws => ws.name);
    assert.deepEqual(noms, ['Tissu', 'SERIE - Tissu', 'FO', 'TRACES'], 'ordre des feuilles');

    const ws = wb.getWorksheet('Tissu')!;

    /* ------------------------------------------------------------------ */
    /* Bandeau B1 + méta (lignes 2-3, fusions)                             */
    /* ------------------------------------------------------------------ */
    assert.equal(ws.getCell(1, 2).value, 'STAR STYLE', 'B1 = entreprise');
    assert.ok(ws.model.merges.includes('D2:E2'), 'Articulo fusionné ligne 2');
    assert.ok(ws.model.merges.includes('D3:E3'), 'Articulo fusionné ligne 3');
    assert.equal(ws.getCell(2, 4).value, 'Articulo');
    assert.equal(ws.getCell(3, 4).value, 'Jupe Zara RF7887.600.81');
    assert.equal(ws.getCell(3, 3).value, 'Zara');
    assert.equal(ws.getCell(3, last).value, 458963, 'PEDIDO écrit en nombre');

    /* ------------------------------------------------------------------ */
    /* Ligne 4 : TALLAS                                                    */
    /* ------------------------------------------------------------------ */
    assert.equal(ws.getCell(4, 2).value, 'TALLAS');
    assert.equal(ws.getCell(4, 3).value, 'XS');
    assert.equal((ws.getCell(4, 3).font as any).color?.argb, 'FF0000FF', "taille XS en bleu");
    assert.equal(ws.getCell(4, last).value, 'TOTAL');

    /* ------------------------------------------------------------------ */
    /* Répartition (lignes 5-8, padding à 4) + ligne 9 QTE, TOTAL           */
    /* ------------------------------------------------------------------ */
    assert.equal(ws.getCell(5, 2).value, 'Ecru');
    assert.equal(ws.getCell(5, 3).value, 1315);
    assert.equal(ws.getCell(6, 2).value, null, 'ligne de padding vide (une seule couleur)');

    const Q = 9;
    assert.equal(ws.getCell(Q, 2).value, 'QTE, TOTAL');
    const cQteXS = ws.getCell(Q, 3);
    assert.equal(cQteXS.formula, 'SUM(C5:C8)');
    assert.equal(cQteXS.result, 1315);

    /* ------------------------------------------------------------------ */
    /* Bloc TEJIDO (Q+2=11, Q+3=12)                                        */
    /* ------------------------------------------------------------------ */
    const T = 15 + 3 + 1; // H=15, 3 matelas -> T=19 (vérifié plus bas aussi)
    assert.equal(ws.getCell(Q + 2, 2).value, 'TEJIDO');
    assert.equal(ws.getCell(Q + 3, 3).value, 900, 'Te, recibi = recuM');
    const cD = ws.getCell(Q + 3, 4);
    assert.equal(cD.formula, `F${T}`);
    const cF = ws.getCell(Q + 3, 6);
    assert.equal(cF.formula, `E${Q + 3}-D${Q + 3}`);
    const cL = ws.getCell(Q + 3, last);
    assert.match(cL.formula!, new RegExp(`^IF\\(${colLetter(last)}${T}>0, D${Q + 3}/${colLetter(last)}${T}, 0\\)$`));

    /* ------------------------------------------------------------------ */
    /* En-tête Colchon (ligne H = Q+6 = 15)                                 */
    /* ------------------------------------------------------------------ */
    const H = Q + 6;
    assert.equal(H, 15, 'H tombe en ligne 15 (indépendant du nombre de tailles)');
    assert.equal(ws.getCell(H, 2).value, 'Colchon');
    assert.equal(ws.getCell(H, 8).value, 'TOTAL XS', "TOTAL XS en H (pair col taille 0)");
    assert.equal(ws.getCell(H, last).value, 'TOTAL', 'en-tête TOTAL général en dernière colonne');

    /* ------------------------------------------------------------------ */
    /* Lignes de données Matelas (16, 17, 18)                               */
    /* ------------------------------------------------------------------ */
    const r1 = H + 1, r2 = H + 2, r3 = H + 3;
    assert.equal(r1, 16);

    assert.equal(ws.getCell(r1, 1).value, 1, 'couleurIndex');
    assert.equal(ws.getCell(r1, 2).value, 'S*2', 'notation fournie');
    assert.equal(ws.getCell(r1, 3).value, 1, "numero '1' -> nombre");
    assert.equal(ws.getCell(r1, 4).value, 82);
    assert.equal(ws.getCell(r1, 6).formula, `D${r1}*E${r1}`);

    const colXS = colValeurTaille(0), colS = colValeurTaille(1);
    assert.equal(ws.getCell(r1, colXS).formula, `D${r1}*0`, 'ratio XS = 0 sur ce matelas');
    assert.equal(ws.getCell(r1, colS).formula, `D${r1}*2`, 'ratio S = 2 (notation S*2)');

    const pairXS = colPaireTaille(0);
    assert.equal(ws.getCell(r1, pairXS).formula, `${colLetter(colXS)}${r1}`, 'premiere ligne : pair = valeur de la ligne');
    assert.equal(ws.getCell(r2, pairXS).formula, `${colLetter(pairXS)}${r1}+${colLetter(colXS)}${r2}`, 'cumul en cascade');

    assert.equal(ws.getCell(r1, last).formula, tailles.map((_, k) => colLetter(colValeurTaille(k)) + r1).join('+'));
    assert.equal(ws.getCell(r2, last).formula, `${colLetter(last)}${r1}+${tailles.map((_, k) => colLetter(colValeurTaille(k)) + r2).join('+')}`);

    /* ------------------------------------------------------------------ */
    /* Remplissage statut : fait -> vert, envoyé -> bleu                    */
    /* ------------------------------------------------------------------ */
    assert.equal((ws.getCell(r1, 2).fill as ExcelJS.FillPattern).fgColor?.argb, 'FFE2EFDA', 'matelas fait : fond vert');
    assert.equal((ws.getCell(r2, 2).fill as ExcelJS.FillPattern).fgColor?.argb, 'FFDDEBF7', 'matelas envoyé : fond bleu');
    assert.equal((ws.getCell(r3, 2).fill as ExcelJS.FillPattern)?.fgColor, undefined, 'ni fait ni envoyé : pas de fond');

    /* ------------------------------------------------------------------ */
    /* TOTAL CUT (ligne T=19) + ECART (ligne 20)                            */
    /* ------------------------------------------------------------------ */
    assert.equal(ws.getCell(T, 2).value, 'TOTAL CUT');
    assert.equal((ws.getCell(T, 2).font as any).color?.argb, 'FFFF0000', 'TOTAL CUT en rouge');
    assert.equal(ws.getCell(T, 4).formula, `SUM(D${r1}:D${r3})`);
    assert.equal(ws.getCell(T, 4).result, 82 + 82 + 86);
    assert.equal(ws.getCell(T, colXS).formula, `SUM(${colLetter(colXS)}${r1}:${colLetter(colXS)}${r3})`);
    assert.equal(ws.getCell(T, colXS).result, 0 + 0 + 172); // XS : matelas 3 seulement
    assert.equal(ws.getCell(T, colS).result, 164 + 0 + 0); // S : matelas 1 seulement
    assert.equal(ws.getCell(T, last).formula, `SUM(${tailles.map((_, k) => colLetter(colValeurTaille(k)) + T).join(',')})`);
    presque(Number(ws.getCell(T, last).result), 164 + 164 + 172 + 172);

    const rEcart = T + 1;
    assert.equal(ws.getCell(rEcart, 2).value, 'ECART');
    assert.equal(ws.getCell(rEcart, colXS).formula, `${colLetter(colXS)}${T}-${colLetter(3)}${Q}`);
    presque(Number(ws.getCell(rEcart, colXS).result), 172 - 1315);
    assert.equal(ws.getCell(rEcart, last).formula, `${colLetter(last)}${T}-${colLetter(last)}${Q}`);

    /* ------------------------------------------------------------------ */
    /* Gel des volets                                                       */
    /* ------------------------------------------------------------------ */
    const vue = ws.views?.[0] as ExcelJS.WorksheetViewFrozen;
    assert.equal(vue.state, 'frozen');
    assert.equal(vue.ySplit, H);
    assert.equal(ws.pageSetup.orientation, 'landscape');
    assert.equal(ws.pageSetup.fitToWidth, 1);
    assert.equal(ws.pageSetup.fitToHeight, 0);

    /* ------------------------------------------------------------------ */
    /* Feuille FO (Doublure) : notation reconstruite quand absente          */
    /* ------------------------------------------------------------------ */
    const wsFo = wb.getWorksheet('FO')!;
    // H identique (dépend seulement du nb de couleurs, pas de la matière)
    assert.equal(wsFo.getCell(H, 2).value, 'Colchon');
    assert.equal(wsFo.getCell(H + 1, 2).value, 'XS*1', "notation reconstruite depuis pieces/plis (ratio XS=1)");

    /* ------------------------------------------------------------------ */
    /* Feuille SERIE - Tissu                                                */
    /* ------------------------------------------------------------------ */
    const wsSerie = wb.getWorksheet('SERIE - Tissu')!;
    assert.equal(wsSerie.getCell(1, 2).value, 'STAR STYLE');
    assert.equal(wsSerie.getCell(4, 1).value, 'DATE');
    assert.equal(wsSerie.getCell(4, 4).value, 'SERIE');

    assert.equal(wsSerie.getCell(5, 4).value, 1, 'D5 : valeur littérale (pas de ligne précédente)');
    assert.equal(wsSerie.getCell(5, 5).formula, 'D5+C5-1');
    assert.equal(wsSerie.getCell(5, 5).result, 82);

    assert.equal(wsSerie.getCell(6, 4).formula, 'E5+1', 'D6 : contigu -> formule');
    assert.equal(wsSerie.getCell(6, 4).result, 83);
    assert.equal(wsSerie.getCell(6, 5).result, 164);

    assert.equal(wsSerie.getCell(7, 4).formula, 'E6+1', 'D7 : contigu (165 = 164+1)');

    assert.equal(wsSerie.getCell(8, 4).value, 1, 'D8 : non contigu -> valeur littérale, pas de formule');
    assert.equal(wsSerie.getCell(8, 4).formula, undefined);

    /* ------------------------------------------------------------------ */
    /* Feuille TRACES : tous les placements, toutes matières                */
    /* ------------------------------------------------------------------ */
    const wsTraces = wb.getWorksheet('TRACES')!;
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6, 7, 8].map(c => wsTraces.getCell(1, c).value),
        ['Matiere', 'Code', 'Placement', 'Fichier PLT', 'Largo (m)', 'Ancho (cm)', 'Efic. %', 'Hojas max'],
    );
    assert.equal(wsTraces.getCell(2, 1).value, 'Tissu');
    assert.equal(wsTraces.getCell(2, 3).value, 'S-M');
    assert.equal(wsTraces.getCell(3, 3).value, 'XS-L');

    /* ------------------------------------------------------------------ */
    /* nomFichierExcel : stable, assaini, avec extension                   */
    /* ------------------------------------------------------------------ */
    const nom1 = nomFichierExcel(donnees);
    const nom2 = nomFichierExcel(donnees);
    assert.equal(nom1, nom2, 'même commande => même nom de fichier');
    assert.equal(nom1, 'COUPE-Zara-Jupe Zara-RF7887.600.81.xlsx');

    const nomSale = nomFichierExcel({ modele: 'A/B', reference: 'R:1?', client: 'C<>D' });
    assert.ok(!/[\\/:*?"<>|]/.test(nomSale.slice(0, -5)), 'caractères interdits retirés du nom (hors extension)');
    assert.ok(nomSale.endsWith('.xlsx'));

    /* ------------------------------------------------------------------ */
    /* Copie sur disque pour inspection visuelle                           */
    /* ------------------------------------------------------------------ */
    const dossierSortie = 'C:\\Users\\HP\\AppData\\Local\\Temp\\claude\\C--Users-HP-3D-Objects-BERAMETHODE-1\\848a85fd-ab1a-4653-837b-253c5265b302\\scratchpad';
    await mkdir(dossierSortie, { recursive: true });
    await writeFile(path.join(dossierSortie, 'exemple-coupe-zintura.xlsx'), Buffer.from(buf));

    console.log('coupeExcel: OK');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
