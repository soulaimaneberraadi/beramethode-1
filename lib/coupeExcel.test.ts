/**
 * Lancer: node --import tsx lib/coupeExcel.test.ts
 *
 * Construit un classeur a partir de l'exemple du cahier de l'atelier (commande
 * Zara RF7887.600.81), le relit avec exceljs et verifie feuilles, en-tetes,
 * une ligne de matelas, les formules SUM (avec resultat en cache) et la ligne
 * Ecart. Ecrit aussi une copie sur disque pour inspection visuelle.
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
            matelas: [
                { numero: '1', placement: 'M-XL', couleur: 'Noir', plis: 10, pieces: { M: 10, XL: 10 }, total: 20, cumul: 20, consoM: 12.0, fait: true, groupe: 'G1', debut: '08:00', fin: '08:40', fichierSortie: '77-1.plt' },
                { numero: '2', placement: 'M-XL', couleur: 'Noir', plis: 10, pieces: { M: 10, XL: 10 }, total: 20, cumul: 40, consoM: 12.0, fait: true, groupe: 'G1', debut: '08:40', fin: '09:20', fichierSortie: '77-2.plt' },
                { numero: '3', placement: 'XS-S', couleur: 'Noir', plis: 15, pieces: { XS: 15, S: 15 }, total: 30, cumul: 70, consoM: 16.5, fait: true, groupe: 'G2', debut: '08:00', fin: '08:50', fichierSortie: '77-3.plt' },
                { numero: '4', placement: 'XS-S', couleur: 'Noir', plis: 15, pieces: { XS: 15, S: 15 }, total: 30, cumul: 100, consoM: 16.5, fait: false, groupe: 'G2' },
                { numero: '5', placement: 'XS×2', couleur: 'Noir', plis: 10, pieces: { XS: 20 }, total: 20, cumul: 120, consoM: 10.0, fait: false },
            ],
        },
        // Deuxieme tissu : conso volontairement au-dessus pour S/M/XL et en-dessous
        // pour XS, pour verifier les deux couleurs d'ecart (rouge/ambre).
        {
            nom: 'Doublure',
            placements: [{ nom: 'Unique', ratios: { XS: 1, S: 1, M: 1, XL: 1 } }],
            matelas: [
                { numero: '1', placement: 'Unique', couleur: 'Noir', plis: 40, pieces: { XS: 40, S: 40, M: 40, XL: 40 }, total: 160, cumul: 160, consoM: 32, fait: true, groupe: 'G1' },
            ],
        },
        // Troisieme tissu : meme nom que le precedent (teste le dedoublonnement
        // de nom de feuille) et sans aucun matelas (teste la branche 0 litteral).
        { nom: 'Doublure', placements: [], matelas: [] },
    ],
};

async function main() {
    const buf = await construireClasseurCoupe(donnees);
    assert.ok(buf instanceof ArrayBuffer, 'construireClasseurCoupe rend un ArrayBuffer');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    // --- Feuilles : noms et dedoublonnement ---
    const noms = wb.worksheets.map(ws => ws.name);
    assert.deepEqual(noms, ['Ordre', 'Tissu', 'Doublure', 'Doublure (2)']);

    /* ------------------------------------------------------------------ */
    /* Feuille "Ordre"                                                     */
    /* ------------------------------------------------------------------ */
    const ordre = wb.getWorksheet('Ordre')!;
    assert.ok(String(ordre.getCell(1, 1).value).includes('Ordre de coupe'));
    assert.ok(String(ordre.getCell(1, 1).value).includes('BERAMETHODE'));

    assert.equal(ordre.getCell(2, 1).value, 'Modèle');
    assert.equal(ordre.getCell(2, 2).value, 'Jupe Zara');
    assert.equal(ordre.getCell(3, 1).value, 'Référence');
    assert.equal(ordre.getCell(3, 2).value, 'RF7887.600.81');
    assert.equal(ordre.getCell(4, 1).value, 'Client');
    assert.equal(ordre.getCell(4, 2).value, 'Zara');
    assert.equal(ordre.getCell(7, 1).value, 'Date');
    assert.equal(ordre.getCell(7, 2).value, '2026-09-25');

    // En-tete table (ligne 9) : Couleur | XS | S | M | XL | Total
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6].map(c => ordre.getCell(9, c).value),
        ['Couleur', 'XS', 'S', 'M', 'XL', 'Total'],
    );

    // Ligne de donnees (10) : Noir 50/30/20/20, Total = formule SUM = 120
    assert.equal(ordre.getCell(10, 1).value, 'Noir');
    assert.deepEqual([2, 3, 4, 5].map(c => ordre.getCell(10, c).value), [50, 30, 20, 20]);
    const totalLigneNoir = ordre.getCell(10, 6);
    assert.equal(totalLigneNoir.formula, 'SUM(B10:E10)');
    assert.equal(totalLigneNoir.result, 120);

    // Ligne TOTAL (11) + grand total
    assert.equal(ordre.getCell(11, 1).value, 'TOTAL');
    assert.equal(ordre.getCell(11, 2).result, 50);
    assert.equal(ordre.getCell(11, 5).result, 20);
    assert.equal(ordre.getCell(11, 6).result, 120);

    /* ------------------------------------------------------------------ */
    /* Feuille "Tissu"                                                     */
    /* ------------------------------------------------------------------ */
    const tissu = wb.getWorksheet('Tissu')!;
    assert.equal(tissu.getCell(1, 1).value, 'Tissu');

    // Recu / reste (ligne 2)
    assert.equal(tissu.getCell(2, 1).value, 'Reçu (m)');
    assert.equal(tissu.getCell(2, 2).value, 70);
    assert.equal(tissu.getCell(2, 4).value, 'Reste (m)');
    const cReste = tissu.getCell(2, 5);
    assert.equal(cReste.formula, 'B2-L17');
    presque(Number(cReste.result), 70 - 67, 'reste = recu - conso totale');

    // En-tete Placements (ligne 5)
    assert.deepEqual(
        [1, 2, 3, 4, 5].map(c => tissu.getCell(5, c).value),
        ['Placement', 'XS', 'S', 'M', 'XL'],
    );
    assert.equal(tissu.getCell(5, 10), tissu.getCell(5, 10)); // sanity: colonne stable
    assert.equal(tissu.getCell(5, 6).value, 'Pièces/pli');

    // Ligne de placement M-XL (ligne 6) : ratio ×1 sur M et XL, 0 (donc blanc) sur XS/S
    assert.equal(tissu.getCell(6, 1).value, 'M-XL');
    assert.equal(tissu.getCell(6, 2).value, 0); // XS
    assert.equal(tissu.getCell(6, 4).value, 1); // M
    assert.equal(tissu.getCell(6, 5).value, 1); // XL
    assert.equal(tissu.getCell(6, 6).value, 2); // Pieces/pli = 1+1

    // En-tete Matelas (ligne 11)
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(c => tissu.getCell(11, c).value),
        ['✓', 'N°', 'Placement', 'Couleur', 'Plis', 'XS', 'S', 'M', 'XL', 'Total', 'Cumul', 'Conso (m)', 'Groupe', 'Début', 'Fin', 'Fichier numéroté'],
    );

    // Matelas n°1 (ligne 12) : M-XL, 10 plis, M=10 XL=10, total formule=20, cumul=20
    const r12 = 12;
    assert.equal(tissu.getCell(r12, 1).value, '✓');
    assert.equal(tissu.getCell(r12, 2).value, '1');
    assert.equal(tissu.getCell(r12, 3).value, 'M-XL');
    assert.equal(tissu.getCell(r12, 5).value, 10);
    assert.equal(tissu.getCell(r12, 8).value, 10); // M
    assert.equal(tissu.getCell(r12, 9).value, 10); // XL
    const cTotalM1 = tissu.getCell(r12, 10);
    assert.equal(cTotalM1.formula, 'SUM(F12:I12)');
    assert.equal(cTotalM1.result, 20);
    assert.equal(tissu.getCell(r12, 11).value, 20); // cumul
    assert.equal(tissu.getCell(r12, 16).value, '77-1.plt');

    // Matelas n°4 (ligne 15) : pas fait -> pas de ✓, fichier numerote absent -> '-'
    assert.equal(tissu.getCell(15, 1).value, '');
    assert.equal(tissu.getCell(15, 16).value, '-');

    // Ligne de totaux (17) : SUM par taille + plis + total + conso, avec resultat en cache
    const ligneTotaux = 17;
    assert.equal(tissu.getCell(ligneTotaux, 3).value, 'TOTAL');
    const cPlisTotal = tissu.getCell(ligneTotaux, 5);
    assert.equal(cPlisTotal.formula, 'SUM(E12:E16)');
    assert.equal(cPlisTotal.result, 60); // 10+10+15+15+10

    const totauxAttendus: Record<number, number> = { 6: 50, 7: 30, 8: 20, 9: 20 }; // XS,S,M,XL
    for (const [col, attendu] of Object.entries(totauxAttendus)) {
        const c = tissu.getCell(ligneTotaux, Number(col));
        assert.equal(c.formula, `SUM(${['F', 'G', 'H', 'I'][Number(col) - 6]}12:${['F', 'G', 'H', 'I'][Number(col) - 6]}16)`);
        assert.equal(c.result, attendu);
    }
    const cTotalTotal = tissu.getCell(ligneTotaux, 10);
    assert.equal(cTotalTotal.result, 120);
    const cConsoTotal = tissu.getCell(ligneTotaux, 12);
    assert.equal(cConsoTotal.formula, 'SUM(L12:L16)');
    presque(Number(cConsoTotal.result), 67.0);

    // Ligne Commande (18) : reprise de la repartition, meme pour ce tissu principal
    const ligneCommande = 18;
    assert.equal(tissu.getCell(ligneCommande, 3).value, 'Commande');
    assert.deepEqual([6, 7, 8, 9].map(c => tissu.getCell(ligneCommande, c).value), [50, 30, 20, 20]);
    assert.equal(tissu.getCell(ligneCommande, 10).result, 120);

    // Ligne Ecart (19) : prevu - commande = 0 partout pour ce tissu (exemple du cahier)
    const ligneEcart = 19;
    assert.equal(tissu.getCell(ligneEcart, 3).value, 'Écart');
    for (const col of [6, 7, 8, 9, 10]) {
        const c = tissu.getCell(ligneEcart, col);
        assert.equal(c.result, 0, `ecart nul colonne ${col}`);
    }
    assert.equal(tissu.getCell(ligneEcart, 6).formula, `F${ligneTotaux}-F${ligneCommande}`);

    /* ------------------------------------------------------------------ */
    /* Feuille "Doublure" : ecarts non nuls (rouge / ambre)                */
    /* ------------------------------------------------------------------ */
    // Doublure : pas de recu, 1 placement, 1 matelas -> mise en page plus courte
    // que 'Tissu' (titre=1, placements: titre=2/entete=3/donnees=4, matelas:
    // titre=6/entete=7/donnees=8, totaux=9, commande=10, ecart=11).
    const doublure = wb.getWorksheet('Doublure')!;
    // Totaux : XS=40 (commande 50 -> ecart -10, negatif), S=40 (commande 30 -> +10, positif)
    const ecartXS = doublure.getCell(11, 6);
    const ecartS = doublure.getCell(11, 7);
    assert.equal(ecartXS.result, -10);
    assert.equal(ecartS.result, 10);
    const fondXS = (ecartXS.fill as ExcelJS.FillPattern).fgColor?.argb;
    const fondS = (ecartS.fill as ExcelJS.FillPattern).fgColor?.argb;
    assert.equal(fondXS, 'FFFEE2E2', 'ecart negatif : fond rouge clair');
    assert.equal(fondS, 'FFFEF3C7', 'ecart positif : fond ambre clair');

    // Ligne fait=true (ligne 8, seul matelas) -> fond vert clair sur toute la ligne
    const fondFait = (doublure.getCell(8, 3).fill as ExcelJS.FillPattern).fgColor?.argb;
    assert.equal(fondFait, 'FFDCFCE7');

    /* ------------------------------------------------------------------ */
    /* Feuille "Doublure (2)" : aucun matelas -> totaux litteraux a 0       */
    /* (titre=1, placements: titre=2/entete=3, matelas: titre=5/entete=6,   */
    /* totaux=7, commande=8, ecart=9 — pas de ligne de donnees dans aucune   */
    /* des deux tables). */
    /* ------------------------------------------------------------------ */
    const doublure2 = wb.getWorksheet('Doublure (2)')!;
    assert.equal(doublure2.getCell(7, 5).value, 0); // plis total, sans formule (aucun matelas)
    assert.equal(doublure2.getCell(9, 6).result, -50); // ecart = 0 - commande(50)

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
