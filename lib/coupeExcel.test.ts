/**
 * Lancer: node --import tsx lib/coupeExcel.test.ts
 *
 * Construit un classeur a partir de l'exemple du cahier de l'atelier (commande
 * Zara RF7887.600.81), le relit avec exceljs et verifie : une seule feuille
 * "Ordre de coupe", repartition, bandeaux de matiere, table Placements, table
 * Matelas avec ses colonnes Sigma (formule SUMIFS + resultat en cache), lignes
 * TOTAL/Commande/Ecart/Reçu-Reste. Ecrit aussi une copie sur disque pour
 * inspection visuelle.
 */
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { construireClasseurCoupe, nomFichierExcel, type DonneesExcelCoupe } from './coupeExcel';

const presque = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} != ${b}`);

/* ------------------------------------------------------------------ */
/* Donnees de reference : commande Zara RF7887.600.81                  */
/* ------------------------------------------------------------------ */

const donnees: DonneesExcelCoupe = {
    entreprise: 'BERAMETHODE',
    modele: 'Jupe Zara',
    reference: 'RF7887.600.81',
    client: 'Zara',
    type: 'Jupe',
    statut: 'En cours',
    date: '2026-09-25',
    tailles: ['XS', 'S', 'M', 'XL'],
    repartition: [{ couleur: 'Noir', quantites: { XS: 50, S: 30, M: 20, XL: 20 } }],
    tissus: [
        {
            nom: 'Tissu',
            recuM: 70,
            placements: [
                { nom: 'M-XL', ratios: { M: 1, XL: 1 }, fichier: 'MXL.plt', longueurM: 1.2, laizeCm: 150, efficience: 85, maxPlis: 40 },
                { nom: 'XS-S', ratios: { XS: 1, S: 1 }, fichier: 'XSS.plt', longueurM: 1.1, laizeCm: 150, efficience: 88, maxPlis: 40 },
                { nom: 'XS×2', ratios: { XS: 2 }, fichier: 'XS2.plt', longueurM: 1.0, laizeCm: 150, efficience: 80, maxPlis: 30 },
            ],
            // Cumuls Sigma attendus (meme couleur 'Noir' du debut a la fin) :
            // XS : 0, 0, 15, 30, 50  |  M : 10, 20, 20, 20, 20
            matelas: [
                { numero: '1', placement: 'M-XL', couleur: 'Noir', plis: 10, pieces: { M: 10, XL: 10 }, total: 20, cumul: 20, consoM: 12.0, fait: true, groupe: 'G1', debut: '08:00', fin: '08:40', fichierSortie: '77-1.plt' },
                { numero: '2', placement: 'M-XL', couleur: 'Noir', plis: 10, pieces: { M: 10, XL: 10 }, total: 20, cumul: 40, consoM: 12.0, fait: true, groupe: 'G1', debut: '08:40', fin: '09:20', fichierSortie: '77-2.plt' },
                { numero: '3', placement: 'XS-S', couleur: 'Noir', plis: 15, pieces: { XS: 15, S: 15 }, total: 30, cumul: 70, consoM: 16.5, fait: true, groupe: 'G2', debut: '08:00', fin: '08:50', fichierSortie: '77-3.plt' },
                { numero: '4', placement: 'XS-S', couleur: 'Noir', plis: 15, pieces: { XS: 15, S: 15 }, total: 30, cumul: 100, consoM: 16.5, fait: false, groupe: 'G2' },
                { numero: '5', placement: 'XS×2', couleur: 'Noir', plis: 10, pieces: { XS: 20 }, total: 20, cumul: 120, consoM: 10.0, fait: false },
            ],
        },
        // Deuxieme matiere, sans recu, couleur 'Blanc' absente de la repartition
        // (commande = 0) : verifie que les plages Sigma repartent a zero a la
        // premiere ligne de CETTE matiere (et non a la suite de 'Tissu'), et
        // que Sigma > commande (0) colore en ambre des que des pieces existent.
        {
            nom: 'Vlieseline',
            placements: [{ nom: 'Unique', ratios: { XS: 1, S: 1 } }],
            matelas: [
                { numero: '1', placement: 'Unique', couleur: 'Blanc', plis: 5, pieces: { XS: 5, S: 0 }, total: 5, cumul: 5, consoM: 3, fait: true },
                { numero: '2', placement: 'Unique', couleur: 'Blanc', plis: 5, pieces: { XS: 5, S: 0 }, total: 5, cumul: 10, consoM: 3, fait: false },
            ],
        },
        // Troisieme matiere sans aucun matelas (teste la branche 0 litteral
        // de la ligne TOTAL, sans formule SUM puisqu'il n'y a aucune ligne).
        { nom: 'Molleton', placements: [], matelas: [] },
    ],
};

async function main() {
    const buf = await construireClasseurCoupe(donnees);
    assert.ok(buf instanceof ArrayBuffer, 'construireClasseurCoupe rend un ArrayBuffer');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    // --- Une seule feuille ---
    const noms = wb.worksheets.map(ws => ws.name);
    assert.deepEqual(noms, ['Ordre de coupe'], 'une seule feuille, plus de feuille par matiere');
    const ws = wb.getWorksheet('Ordre de coupe')!;

    /* ------------------------------------------------------------------ */
    /* Bandeau titre + bloc meta                                           */
    /* ------------------------------------------------------------------ */
    assert.ok(String(ws.getCell(1, 1).value).includes('Ordre de coupe'));
    assert.ok(String(ws.getCell(1, 1).value).includes('BERAMETHODE'));
    assert.equal(ws.getCell(2, 1).value, 'Modèle');
    assert.equal(ws.getCell(2, 2).value, 'Jupe Zara');
    assert.equal(ws.getCell(3, 2).value, 'RF7887.600.81');
    assert.equal(ws.getCell(4, 2).value, 'Zara');
    assert.equal(ws.getCell(7, 1).value, 'Date');
    assert.equal(ws.getCell(7, 2).value, '2026-09-25');

    /* ------------------------------------------------------------------ */
    /* Section Répartition (lignes 9-12)                                   */
    /* ------------------------------------------------------------------ */
    assert.equal(ws.getCell(9, 1).value, 'Répartition');
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6].map(c => ws.getCell(10, c).value),
        ['Couleur', 'XS', 'S', 'M', 'XL', 'Total'],
    );
    assert.equal(ws.getCell(11, 1).value, 'Noir');
    assert.deepEqual([2, 3, 4, 5].map(c => ws.getCell(11, c).value), [50, 30, 20, 20]);
    const totalLigneNoir = ws.getCell(11, 6);
    assert.equal(totalLigneNoir.formula, 'SUM(B11:E11)');
    assert.equal(totalLigneNoir.result, 120);
    assert.equal(ws.getCell(12, 1).value, 'TOTAL');
    assert.equal(ws.getCell(12, 2).result, 50);
    assert.equal(ws.getCell(12, 6).result, 120);

    /* ------------------------------------------------------------------ */
    /* Matiere "Tissu" : bandeau (ligne 14) avec le reçu                    */
    /* ------------------------------------------------------------------ */
    const bandeauTissu = String(ws.getCell(14, 1).value);
    assert.ok(bandeauTissu.includes('Matière : Tissu'), 'bandeau matiere : nom');
    assert.ok(bandeauTissu.includes('Reçu 70 m'), 'bandeau matiere : reçu');

    // --- Placements (ligne 16 = en-tete, 17-19 = donnees) ---
    assert.equal(ws.getCell(15, 1).value, 'Placements (tracés PLT)');
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6].map(c => ws.getCell(16, c).value),
        ['Placement', 'XS', 'S', 'M', 'XL', 'Pièces/pli'],
    );
    assert.equal(ws.getCell(17, 1).value, 'M-XL');
    assert.equal(ws.getCell(17, 2).value, 0); // XS
    assert.equal(ws.getCell(17, 4).value, 1); // M
    assert.equal(ws.getCell(17, 5).value, 1); // XL
    assert.equal(ws.getCell(17, 6).value, 2); // Pieces/pli = 1+1

    /* ------------------------------------------------------------------ */
    /* Matelas (ligne 21 = titre section, 22 = en-tete, 23-27 = lignes)     */
    /* ------------------------------------------------------------------ */
    assert.equal(ws.getCell(21, 1).value, 'Matelas');
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(c => ws.getCell(22, c).value),
        ['✓', 'N°', 'Placement', 'Couleur', 'Plis', 'XS', 'Σ XS', 'S', 'Σ S', 'M', 'Σ M', 'XL', 'Σ XL', 'Total', 'Cumul', 'Conso (m)', 'Groupe', 'Début', 'Fin', 'Fichier numéroté'],
    );

    // Matelas n°1 (ligne 23) : M-XL, 10 plis, M=10 XL=10, total formule=20
    assert.equal(ws.getCell(23, 1).value, '✓');
    assert.equal(ws.getCell(23, 2).value, '1');
    assert.equal(ws.getCell(23, 3).value, 'M-XL');
    assert.equal(ws.getCell(23, 4).value, 'Noir');
    assert.equal(ws.getCell(23, 5).value, 10);
    assert.equal(ws.getCell(23, 10).value, 10); // M (piece)
    assert.equal(ws.getCell(23, 12).value, 10); // XL (piece)
    const cTotalM1 = ws.getCell(23, 14);
    assert.equal(cTotalM1.formula, 'SUM(F23:L23)');
    assert.equal(cTotalM1.result, 20);
    assert.equal(ws.getCell(23, 20).value, '77-1.plt');

    // Matelas n°4 (ligne 26) : pas fait -> pas de ✓, fichier numerote absent -> '-'
    assert.equal(ws.getCell(26, 1).value, '');
    assert.equal(ws.getCell(26, 20).value, '-');

    // --- Colonnes Sigma : formule SUMIFS (reference la colonne Couleur = D) + resultat en cache ---
    const sigmaXS = [23, 24, 25, 26, 27].map(r => ws.getCell(r, 7));
    assert.deepEqual(sigmaXS.map(c => c.result), [0, 0, 15, 30, 50], 'cumul Sigma XS par matelas');
    const sigmaM = [23, 24, 25, 26, 27].map(r => ws.getCell(r, 11));
    assert.deepEqual(sigmaM.map(c => c.result), [10, 20, 20, 20, 20], 'cumul Sigma M par matelas');
    assert.match(sigmaXS[0].formula!, /^SUMIFS\(F\$23:F23, D\$23:D23, D23\)$/, 'SUMIFS reference la colonne Couleur (D)');
    assert.match(sigmaXS[4].formula!, /^SUMIFS\(F\$23:F27, D\$23:D27, D27\)$/, 'la plage part de la 1re ligne de CETTE matiere');

    // --- Coloration Sigma : vert gras des que ca atteint la commande de la couleur ---
    const commandeNoirXS = 50, commandeNoirM = 20;
    presque(sigmaXS[4].result as number, commandeNoirXS); // 50 == commande -> vert gras
    assert.equal((ws.getCell(27, 7).font as any).color?.argb, 'FF16A34A');
    assert.equal((ws.getCell(27, 7).font as any).bold, true);
    presque(sigmaM[1].result as number, commandeNoirM); // ligne 24 : M atteint 20 des la 2e ligne
    assert.equal((ws.getCell(24, 11).font as any).color?.argb, 'FF16A34A');
    // Avant d'atteindre la commande : gris clair, pas de vert
    assert.equal((ws.getCell(23, 11).font as any).color?.argb, 'FF94A3B8');

    /* ------------------------------------------------------------------ */
    /* TOTAL (28) / Commande (29) / Écart (30) / Reçu-Reste (31)            */
    /* ------------------------------------------------------------------ */
    assert.equal(ws.getCell(28, 3).value, 'TOTAL');
    const cPlisTotal = ws.getCell(28, 5);
    assert.equal(cPlisTotal.formula, 'SUM(E23:E27)');
    assert.equal(cPlisTotal.result, 60);
    const totauxAttendus: Record<number, number> = { 6: 50, 8: 30, 10: 20, 12: 20 }; // XS,S,M,XL (colonnes valeur)
    for (const [col, attendu] of Object.entries(totauxAttendus)) {
        const c = ws.getCell(28, Number(col));
        assert.equal(c.result, attendu);
    }
    assert.equal(ws.getCell(28, 14).result, 120); // Total general
    const cConsoTotal = ws.getCell(28, 16);
    assert.equal(cConsoTotal.formula, 'SUM(P23:P27)');
    presque(Number(cConsoTotal.result), 67.0);
    // Colonnes Sigma vides sur la ligne TOTAL
    assert.equal(ws.getCell(28, 7).value, '');
    assert.equal(ws.getCell(28, 11).value, '');

    assert.equal(ws.getCell(29, 3).value, 'Commande');
    assert.deepEqual([6, 8, 10, 12].map(c => ws.getCell(29, c).value), [50, 30, 20, 20]);

    assert.equal(ws.getCell(30, 3).value, 'Écart');
    for (const col of [6, 8, 10, 12, 14]) {
        assert.equal(ws.getCell(30, col).result, 0, `ecart nul colonne ${col}`);
        // vert "style ✓" quand l'ecart est nul
        assert.equal((ws.getCell(30, col).fill as ExcelJS.FillPattern).fgColor?.argb, 'FFDCFCE7');
        assert.equal((ws.getCell(30, col).font as any).color?.argb, 'FF16A34A');
    }
    assert.equal(ws.getCell(30, 6).formula, 'F28-F29');

    assert.equal(ws.getCell(31, 3).value, 'Reçu / Reste (m)');
    assert.equal(ws.getCell(31, 16).value, 70); // Reçu
    const cReste = ws.getCell(31, 17);
    assert.equal(cReste.formula, 'P31-P28');
    presque(Number(cReste.result), 70 - 67, 'reste = recu - conso totale');

    /* ------------------------------------------------------------------ */
    /* Matiere "Vlieseline" (bandeau ligne 32, sans reçu) : Sigma reparti   */
    /* de zero a sa propre 1re ligne (39), pas a la suite de 'Tissu'.       */
    /* ------------------------------------------------------------------ */
    const bandeauVli = String(ws.getCell(32, 1).value);
    assert.ok(bandeauVli.includes('Matière : Vlieseline'));
    assert.ok(!bandeauVli.includes('Reçu'), 'pas de reçu pour cette matiere');

    const sigmaXSVli = [39, 40].map(r => ws.getCell(r, 7));
    assert.deepEqual(sigmaXSVli.map(c => c.result), [5, 10], 'ne reprend pas le cumul de Tissu (qui finissait a 50)');
    assert.match(sigmaXSVli[0].formula!, /^SUMIFS\(F\$39:F39, D\$39:D39, D39\)$/);
    // Commande 'Blanc' absente de la repartition -> 0 -> Sigma > 0 est toujours en depassement (ambre)
    assert.equal((sigmaXSVli[0].font as any).color?.argb, 'FFB45309');
    assert.equal((sigmaXSVli[0].font as any).bold, undefined);

    assert.equal(ws.getCell(43, 3).value, 'Écart');
    assert.equal(ws.getCell(43, 6).result, -40); // 10 (total XS Vlieseline) - 50 (commande XS toutes couleurs)
    assert.equal((ws.getCell(43, 6).fill as ExcelJS.FillPattern).fgColor?.argb, 'FFFEE2E2', 'ecart negatif : fond rouge');

    // Pas de Reçu/Reste pour cette matiere (pas de recuM) : la ligne suivante est le bandeau Molleton
    assert.equal(ws.getCell(44, 1).value, 'Matière : Molleton');

    /* ------------------------------------------------------------------ */
    /* Matiere "Molleton" : aucun placement ni matelas -> TOTAL litteral 0  */
    /* ------------------------------------------------------------------ */
    assert.equal(ws.getCell(50, 3).value, 'TOTAL');
    assert.equal(ws.getCell(50, 5).value, 0); // plis, litteral (pas de formule, aucun matelas)
    assert.equal(ws.getCell(52, 3).value, 'Écart');
    assert.equal(ws.getCell(52, 6).result, -50); // 0 - commande(50)

    /* ------------------------------------------------------------------ */
    /* Mise en page : gel uniquement sur les lignes de titre               */
    /* ------------------------------------------------------------------ */
    const vue = ws.views?.[0] as ExcelJS.WorksheetViewFrozen;
    assert.equal(vue.state, 'frozen');
    assert.equal(vue.ySplit, 7);
    assert.equal(ws.pageSetup.printTitlesRow, '1:7');
    assert.equal(ws.pageSetup.orientation, 'landscape');
    assert.equal(ws.pageSetup.fitToWidth, 1);

    /* ------------------------------------------------------------------ */
    /* nomFichierExcel : stable, assaini, avec extension                   */
    /* ------------------------------------------------------------------ */
    const nom1 = nomFichierExcel(donnees);
    const nom2 = nomFichierExcel(donnees);
    assert.equal(nom1, nom2, 'meme commande => meme nom de fichier');
    assert.equal(nom1, 'COUPE-Zara-Jupe Zara-RF7887.600.81.xlsx');

    const nomSale = nomFichierExcel({ modele: 'A/B', reference: 'R:1?', client: 'C<>D' });
    assert.ok(!/[\\/:*?"<>|]/.test(nomSale.slice(0, -5)), 'caracteres interdits retires du nom (hors extension)');
    assert.ok(nomSale.endsWith('.xlsx'));

    /* ------------------------------------------------------------------ */
    /* Copie sur disque pour inspection visuelle                           */
    /* ------------------------------------------------------------------ */
    const dossierSortie = 'C:\\Users\\HP\\AppData\\Local\\Temp\\claude\\C--Users-HP-3D-Objects-BERAMETHODE-1\\848a85fd-ab1a-4653-837b-253c5265b302\\scratchpad';
    await mkdir(dossierSortie, { recursive: true });
    await writeFile(path.join(dossierSortie, 'exemple-coupe.xlsx'), Buffer.from(buf));

    console.log('coupeExcel: OK');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
