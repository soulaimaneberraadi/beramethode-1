/**
 * Lancer : node --import tsx lib/importCoupeExcel.test.ts
 *
 * Reconstruit en memoire (via exceljs) des classeurs qui reproduisent les
 * exemples reels donnes par l'atelier :
 *  - ' REPARTO LANOCORTE' (format 'repartos') : marqueur avec donnees sur la
 *    meme ligne que le code (variante rare) vs sur la ligne suivante (cas
 *    courant), ligne modele vide 'TE-', bloc FORRO, bloc ENTRETELA, fin de
 *    matiere par 'TOTAL METROS'.
 *  - 'MELO SANTOS' (format 'repartos') : bloc ENTRETELA sans ligne d'en-tete
 *    (le prefixe change tout seul), bloc COMBINADO 'C1' avec en-tete explicite,
 *    note libre -> alerte.
 *  - 'Tissu' (format 'atelier') : table matelas avec ratios en formule
 *    ('D16*2') et en valeur brute (valeur / plis).
 *  - 'SERIE - Tissu' : doit etre completement ignoree (prefixe 'SERIE').
 */
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
    lireClasseurCoupe,
    lireFeuilles,
    lireRatios,
    texteCellule,
    nombreCellule,
} from './importCoupeExcel';

/* ------------------------------------------------------------------ */
/* lireRatios : tous les cas de figure demandes                        */
/* ------------------------------------------------------------------ */

function testerLireRatios() {
    const taillesXS_XL = ['XS', 'S', 'M', 'L', 'XL'];
    const taillesSML = ['S', 'M', 'L'];

    // 'XS A L' + '1 DE CADA' -> une piece par taille de XS a L (XL exclu)
    {
        const { ratios, aVerifier } = lireRatios('XS A L', '1 DE CADA', taillesXS_XL);
        assert.deepEqual(ratios, { XS: 1, S: 1, M: 1, L: 1 }, 'XS A L / 1 DE CADA');
        assert.equal(aVerifier, undefined);
    }

    // 'XS-M' + '2 DE CADA' -> liste (pas plage) : seulement XS et M
    {
        const { ratios } = lireRatios('XS-M', '2 DE CADA', taillesXS_XL);
        assert.deepEqual(ratios, { XS: 2, M: 2 }, 'XS-M / 2 DE CADA');
    }

    // 'S - M' + '3 DE CADA'
    {
        const { ratios } = lireRatios('S - M', '3 DE CADA', taillesXS_XL);
        assert.deepEqual(ratios, { S: 3, M: 3 }, 'S - M / 3 DE CADA');
    }

    // 'XS A M' + '2+2+2' -> plage XS,S,M position par position
    {
        const { ratios, aVerifier } = lireRatios('XS A M', '2+2+2', taillesXS_XL);
        assert.deepEqual(ratios, { XS: 2, S: 2, M: 2 }, 'XS A M / 2+2+2');
        assert.equal(aVerifier, undefined);
    }

    // 'S-M' + '3+3' -> liste S,M position par position
    {
        const { ratios } = lireRatios('S-M', '3+3', taillesSML);
        assert.deepEqual(ratios, { S: 3, M: 3 }, 'S-M / 3+3');
    }

    // 'M-M' + '6' -> une seule taille distincte (M) -> M:6
    {
        const { ratios, aVerifier } = lireRatios('M-M', '6', taillesSML);
        assert.deepEqual(ratios, { M: 6 }, 'M-M / 6');
        assert.equal(aVerifier, undefined, 'une seule taille distincte : pas d\'alerte');
    }

    // 'S' + '4'
    {
        const { ratios } = lireRatios('S', '4', taillesSML);
        assert.deepEqual(ratios, { S: 4 }, 'S / 4');
    }

    // 'XS' + '45'
    {
        const { ratios } = lireRatios('XS', '45', taillesXS_XL);
        assert.deepEqual(ratios, { XS: 45 }, 'XS / 45');
    }

    // 'XS A L' + '1+1+1' -> 3 valeurs pour 4 tailles etalees -> illisible
    {
        const { ratios, aVerifier } = lireRatios('XS A L', '1+1+1', taillesXS_XL);
        assert.equal(ratios, null, 'XS A L / 1+1+1 : compte ne correspond pas -> null');
        assert.ok(aVerifier && aVerifier.length > 0, 'doit expliquer l\'ambiguite');
    }

    // Taille inconnue -> null
    {
        const { ratios, aVerifier } = lireRatios('ZZ', '5', taillesXS_XL);
        assert.equal(ratios, null, 'taille inconnue -> null');
        assert.ok(aVerifier);
    }

    // Ratio vide -> chaque taille listee x1 + a verifier
    {
        const { ratios, aVerifier } = lireRatios('S - M', '', taillesXS_XL);
        assert.deepEqual(ratios, { S: 1, M: 1 });
        assert.ok(aVerifier);
    }

    // Plusieurs tailles distinctes + ratio simple -> chaque x N + a verifier
    {
        const { ratios, aVerifier } = lireRatios('XS-M', '7', taillesXS_XL);
        assert.deepEqual(ratios, { XS: 7, M: 7 });
        assert.ok(aVerifier);
    }

    console.log('lireRatios: OK');
}

/* ------------------------------------------------------------------ */
/* texteCellule / nombreCellule : formes de valeur exceljs              */
/* ------------------------------------------------------------------ */

function testerHelpersCellule() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('helpers');

    ws.getCell(1, 1).value = 'PÁJAROS  '; // texte avec accent + espace de bord
    assert.equal(texteCellule(ws.getCell(1, 1)), 'PÁJAROS');

    ws.getCell(1, 2).value = 42;
    assert.equal(nombreCellule(ws.getCell(1, 2)), 42);
    assert.equal(texteCellule(ws.getCell(1, 2)), '42');

    ws.getCell(1, 3).value = { richText: [{ text: 'CAMPA' }, { text: 'ÑA' }] };
    assert.equal(texteCellule(ws.getCell(1, 3)), 'CAMPAÑA');

    ws.getCell(1, 4).value = { formula: 'A1&"x"', result: 'resultat' };
    assert.equal(texteCellule(ws.getCell(1, 4)), 'resultat', 'formule : utilise result');
    assert.equal(nombreCellule(ws.getCell(1, 4)), undefined);

    ws.getCell(1, 5).value = { formula: 'B1*2', result: 84 };
    assert.equal(nombreCellule(ws.getCell(1, 5)), 84);

    assert.equal(texteCellule(ws.getCell(1, 6)), '', 'cellule vide -> chaine vide');
    assert.equal(nombreCellule(ws.getCell(1, 6)), undefined, 'cellule vide -> undefined');

    console.log('helpers cellule: OK');
}

/* ------------------------------------------------------------------ */
/* Construction du classeur synthetique                                 */
/* ------------------------------------------------------------------ */

function construireClasseurTest(): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();

    /* --- Feuille 1 : ' REPARTO LANOCORTE' (calquee sur l'exemple reel) --- */
    const ws1 = wb.addWorksheet(' REPARTO LANOCORTE');
    ws1.getCell('B2').value = 'HAMPTON';
    ws1.getCell('A3').value = 'PARA :';
    ws1.getCell('B3').value = 'LANOCORTE';
    ws1.getCell('A8').value = 'MODELO :';
    ws1.getCell('B8').value = '8264/156/605';
    ws1.getCell('D8').value = 'XS';
    ws1.getCell('E8').value = 'S';
    ws1.getCell('F8').value = 'M';
    ws1.getCell('G8').value = 'L';
    ws1.getCell('H8').value = 'XL';
    ws1.getCell('I8').value = 'PEDIDO';
    ws1.getCell('J8').value = 'CORTE';
    ws1.getCell('K8').value = 'LOTE';
    ws1.getCell('D9').value = 1105;
    ws1.getCell('E9').value = 1265;
    ws1.getCell('F9').value = 1105;
    ws1.getCell('G9').value = 630;
    ws1.getCell('H9').value = 0;
    ws1.getCell('I9').value = 65531;
    ws1.getCell('J9').value = 19001;
    ws1.getCell('K9').value = 'NO';

    // TELA : TE-01 (donnees sur la ligne suivante), TE-02 (idem), TE-03 (idem), TE-04 (idem), 'TE-' vide, TE-05 (idem)
    ws1.getCell('A15').value = 'TELA';
    ws1.getCell('C15').value = '3-156/605';

    ws1.getCell('A17').value = 'TE-01';
    ws1.getCell('B17').value = 'XS A L';
    ws1.getCell('B18').value = '1 DE CADA';
    ws1.getCell('C18').value = 4.0473;
    ws1.getCell('I18').value = 630;

    ws1.getCell('A21').value = 'TE-02';
    ws1.getCell('B21').value = 'XS-M';
    ws1.getCell('B22').value = '2 DE CADA';
    ws1.getCell('C22').value = 3.9476;
    ws1.getCell('I22').value = 238;

    ws1.getCell('A25').value = 'TE-03';
    ws1.getCell('B25').value = 'S';
    ws1.getCell('B26').value = '4';
    ws1.getCell('C26').value = 3.9892;
    ws1.getCell('I26').value = 159;

    ws1.getCell('A29').value = 'TE-04';
    ws1.getCell('B29').value = 'S - M';
    ws1.getCell('B30').value = '3 DE CADA';
    ws1.getCell('C30').value = 3.7702;
    ws1.getCell('I30').value = 0;

    ws1.getCell('A34').value = 'TE-'; // ligne modele vide -> ignoree

    ws1.getCell('A44').value = 'TE-05';
    ws1.getCell('B44').value = 'M';
    ws1.getCell('B45').value = '6';
    ws1.getCell('C45').value = 3.845;
    ws1.getCell('I45').value = 0;

    ws1.getCell('A49').value = 'TOTAL METROS TEJIDO :';

    // FORRO (sans ref)
    ws1.getCell('A54').value = 'FORRO ';
    ws1.getCell('A58').value = 'FO-01';
    ws1.getCell('B58').value = 'XS';
    ws1.getCell('B59').value = '10';
    ws1.getCell('C59').value = 1.3912;
    ws1.getCell('I59').value = 110;

    ws1.getCell('A62').value = 'FO-02';
    ws1.getCell('B62').value = 'S';
    ws1.getCell('B63').value = '10';
    ws1.getCell('C63').value = 1.4;
    ws1.getCell('I63').value = 90;

    ws1.getCell('A66').value = 'FO-04';
    ws1.getCell('B66').value = 'L';
    ws1.getCell('B67').value = '10';
    ws1.getCell('C67').value = 1.5;
    ws1.getCell('I67').value = 60;

    ws1.getCell('A70').value = 'TOTAL METROS FORRO  :';

    // ENTRETELA (avec ref)
    ws1.getCell('A85').value = 'ENTRETELA';
    ws1.getCell('C85').value = '2916 NEGRA';
    ws1.getCell('A89').value = 'EN-01';
    ws1.getCell('B89').value = 'XS';
    ws1.getCell('B90').value = '20';
    ws1.getCell('C90').value = 2.4211;
    ws1.getCell('I90').value = 56;

    /* --- Feuille 2 : 'MELO SANTOS' --- */
    const ws2 = wb.addWorksheet('MELO SANTOS');
    ws2.getCell('B2').value = 'HAMPTON';
    ws2.getCell('A8').value = 'MODELO :';
    ws2.getCell('B8').value = '2215  - 064 - 044';
    ws2.getCell('D8').value = 'S';
    ws2.getCell('E8').value = 'M';
    ws2.getCell('F8').value = 'L';
    ws2.getCell('I8').value = 'PEDIDO';
    ws2.getCell('J8').value = 'CORTE';
    ws2.getCell('K8').value = 'LOTE';
    ws2.getCell('D9').value = 2651;
    ws2.getCell('E9').value = 2551;
    ws2.getCell('F9').value = 1401;
    ws2.getCell('I9').value = 44364;
    ws2.getCell('J9').value = 18553;
    ws2.getCell('K9').value = 'NO';

    ws2.getCell('A14').value = 'COMBINADO';
    ws2.getCell('C14').value = '1-175/401';

    ws2.getCell('A17').value = 'CO-01';
    ws2.getCell('B17').value = 'S A L';
    ws2.getCell('B18').value = '3 DE CADA';
    ws2.getCell('C18').value = 3.7221;
    ws2.getCell('I18').value = 467;

    // CO-02 : longueur/plis sur LA MEME ligne que le code, ratio sur la ligne suivante
    ws2.getCell('A21').value = 'CO-02';
    ws2.getCell('B21').value = 'S A M';
    ws2.getCell('C21').value = 4.0661;
    ws2.getCell('I21').value = 230;
    ws2.getCell('B22').value = '5 DE CADA';

    ws2.getCell('A25').value = 'CO-03';
    ws2.getCell('B25').value = 'S';
    ws2.getCell('C25').value = 4.0359;
    ws2.getCell('I25').value = 10;
    ws2.getCell('B26').value = '10';

    ws2.getCell('A41').value = 'TOTAL METROS TEJIDO :';
    ws2.getCell('A43').value = 'TENEMOS UNA PEQUEÑA DIFERENCIA DE TELA, AVISAR AL CLIENTE';

    // ENTRETELA sans ligne d'en-tete : le prefixe EN change tout seul apres la fin de COMBINADO
    ws2.getCell('A47').value = 'EN-01';
    ws2.getCell('B47').value = 'XS';
    ws2.getCell('B48').value = '45';
    ws2.getCell('C48').value = 0.24;
    ws2.getCell('I48').value = 6;

    // Deuxieme bloc COMBINADO, prefixe C1, avec en-tete explicite
    ws2.getCell('A74').value = 'COMBINADO';
    ws2.getCell('C74').value = '1-289/712';
    ws2.getCell('A77').value = 'C1-01';
    ws2.getCell('B77').value = 'XS';
    ws2.getCell('B78').value = '30';
    ws2.getCell('C78').value = 2.9754;
    ws2.getCell('I78').value = 11;

    /* --- Feuille 3 : 'Tissu' (format atelier) --- */
    const ws3 = wb.addWorksheet('Tissu');
    ws3.getCell('F2').value = 'PEDIDO';
    ws3.getCell('B3').value = '2026-09-20';
    ws3.getCell('C3').value = 'ClienteX';
    ws3.getCell('D3').value = 'ModeleX';
    ws3.getCell('F3').value = 12345;
    ws3.getCell('B4').value = 'TALLAS';
    ws3.getCell('C4').value = 'XS';
    ws3.getCell('D4').value = 'S';
    ws3.getCell('E4').value = 'M';
    ws3.getCell('F4').value = 'TOTAL';
    ws3.getCell('C5').value = 100;
    ws3.getCell('D5').value = 80;
    ws3.getCell('E5').value = 60;

    ws3.getCell('B15').value = 'Colchon';
    ws3.getCell('C15').value = 'ordre';
    ws3.getCell('D15').value = 'Plis';
    ws3.getCell('E15').value = 'Long';
    ws3.getCell('F15').value = 'XS';
    ws3.getCell('G15').value = 'TOTAL XS';
    ws3.getCell('H15').value = 'S';
    ws3.getCell('I15').value = 'TOTAL S';
    ws3.getCell('J15').value = 'M';
    ws3.getCell('K15').value = 'TOTAL M';

    ws3.getCell('B16').value = 'Matelas 1';
    ws3.getCell('C16').value = 1;
    ws3.getCell('D16').value = 2;
    ws3.getCell('E16').value = 1.5;
    ws3.getCell('F16').value = { formula: 'D16*2', result: 4 };
    ws3.getCell('H16').value = 3; // pas de formule : ratio = valeur / plis = 3/2 = 1.5

    ws3.getCell('B17').value = 'Matelas 2';
    ws3.getCell('C17').value = 2;
    ws3.getCell('D17').value = 3;
    ws3.getCell('E17').value = 1.2;
    ws3.getCell('F17').value = { formula: 'D17*1', result: 3 };
    ws3.getCell('H17').value = 6; // 6/3 = 2
    ws3.getCell('J17').value = { formula: 'D17*0.5', result: 1.5 };

    ws3.getCell('B18').value = 'TOTAL CUT';

    /* --- Feuille 4 : 'SERIE - Tissu' : doit etre entierement ignoree --- */
    const ws4 = wb.addWorksheet('SERIE - Tissu');
    ws4.getCell('B15').value = 'Colchon';
    ws4.getCell('C15').value = 'ordre';
    ws4.getCell('B16').value = 'Serie 1';
    ws4.getCell('C16').value = 1;
    ws4.getCell('D16').value = 5;
    ws4.getCell('E16').value = 1.0;

    return wb;
}

/* ------------------------------------------------------------------ */
/* Assertions sur le resultat du parseur                                */
/* ------------------------------------------------------------------ */

function testerFeuilles(feuilles: ReturnType<typeof lireFeuilles>) {
    assert.equal(feuilles.length, 3, 'SERIE - Tissu doit etre ignoree (3 feuilles importables sur 4)');
    assert.ok(!feuilles.some(f => f.feuille === 'SERIE - Tissu'), 'SERIE - Tissu absente du resultat');

    /* ---------------- Feuille 1 ---------------- */
    const f1 = feuilles.find(f => f.feuille === ' REPARTO LANOCORTE')!;
    assert.ok(f1, 'feuille 1 trouvee');
    assert.equal(f1.format, 'repartos');
    assert.equal(f1.client, 'HAMPTON');
    assert.equal(f1.atelier, 'LANOCORTE');
    assert.equal(f1.modele, '8264/156/605');
    assert.equal(f1.pedido, '65531');
    assert.equal(f1.corte, '19001');
    assert.deepEqual(f1.tailles, ['XS', 'S', 'M', 'L', 'XL']);
    assert.deepEqual(f1.quantites, { XS: 1105, S: 1265, M: 1105, L: 630, XL: 0 }, 'XL=0 conserve');

    assert.equal(f1.matieres.length, 3, 'TELA, FORRO, ENTRETELA');
    const [tela, forro, entretela] = f1.matieres;

    assert.equal(tela.nom, 'TELA');
    assert.equal(tela.code, 'TE');
    assert.equal(tela.ref, '3-156/605');
    assert.equal(tela.principal, true);
    assert.equal(tela.placements.length, 5, 'TE-01..TE-04, TE-05 (TE- vide ignoree)');

    const te01 = tela.placements.find(p => p.code === 'TE-01')!;
    assert.equal(te01.taillesTexte, 'XS A L');
    assert.equal(te01.ratiosTexte, '1 DE CADA');
    assert.deepEqual(te01.ratios, { XS: 1, S: 1, M: 1, L: 1 });
    assert.equal(te01.longueurM, 4.0473);
    assert.equal(te01.plis, 630);
    assert.equal(te01.aVerifier, undefined);

    const te02 = tela.placements.find(p => p.code === 'TE-02')!;
    assert.deepEqual(te02.ratios, { XS: 2, M: 2 }, 'XS-M / 2 DE CADA -> liste, pas plage');
    assert.equal(te02.longueurM, 3.9476);
    assert.equal(te02.plis, 238);

    const te04 = tela.placements.find(p => p.code === 'TE-04')!;
    assert.equal(te04.plis, 0, 'plis=0 est conserve (pas confondu avec absent)');

    assert.ok(!tela.placements.some(p => p.code.startsWith('TE-') && p.code === 'TE-'), 'TE- seul absent des placements');

    assert.equal(forro.nom, 'FORRO');
    assert.equal(forro.code, 'FO');
    assert.equal(forro.ref, undefined, 'pas de ref pour FORRO dans cet exemple');
    assert.equal(forro.principal, false);
    assert.equal(forro.placements.length, 3);

    assert.equal(entretela.nom, 'ENTRETELA');
    assert.equal(entretela.code, 'EN');
    assert.equal(entretela.ref, '2916 NEGRA');
    assert.equal(entretela.principal, false);
    assert.equal(entretela.placements.length, 1);
    assert.deepEqual(entretela.placements[0].ratios, { XS: 20 });

    assert.deepEqual(f1.alertes, [], 'aucune note libre dans cette feuille');

    /* ---------------- Feuille 2 ---------------- */
    const f2 = feuilles.find(f => f.feuille === 'MELO SANTOS')!;
    assert.ok(f2, 'feuille 2 trouvee');
    assert.deepEqual(f2.tailles, ['S', 'M', 'L']);
    assert.deepEqual(f2.quantites, { S: 2651, M: 2551, L: 1401 });
    assert.equal(f2.pedido, '44364');
    assert.equal(f2.corte, '18553');
    assert.equal(f2.modele, '2215  - 064 - 044');

    assert.equal(f2.matieres.length, 3, 'COMBINADO(CO), ENTRETELA(EN sans en-tete), COMBINADO(C1)');
    const [combinadoCO, entretelaSansEntete, combinadoC1] = f2.matieres;

    assert.equal(combinadoCO.nom, 'COMBINADO');
    assert.equal(combinadoCO.code, 'CO');
    assert.equal(combinadoCO.ref, '1-175/401');
    assert.equal(combinadoCO.principal, true, 'aucune matiere TE : la premiere devient principale');
    assert.equal(combinadoCO.placements.length, 3);

    const co01 = combinadoCO.placements.find(p => p.code === 'CO-01')!;
    assert.deepEqual(co01.ratios, { S: 3, M: 3, L: 3 }, 'S A L etale sur S,M,L (tailles de cette commande)');

    const co02 = combinadoCO.placements.find(p => p.code === 'CO-02')!;
    assert.equal(co02.longueurM, 4.0661, 'longueur lue sur la ligne du code (meme ligne)');
    assert.equal(co02.plis, 230, 'plis lu sur la ligne du code (meme ligne)');
    assert.deepEqual(co02.ratios, { S: 5, M: 5 });

    const co03 = combinadoCO.placements.find(p => p.code === 'CO-03')!;
    assert.deepEqual(co03.ratios, { S: 10 });

    assert.equal(entretelaSansEntete.nom, 'ENTRETELA');
    assert.equal(entretelaSansEntete.code, 'EN');
    assert.equal(entretelaSansEntete.ref, undefined, 'pas de ligne d\'en-tete pour cette matiere');
    assert.equal(entretelaSansEntete.principal, false);
    assert.equal(entretelaSansEntete.placements.length, 1);
    // Donnee reelle telle quelle : B47='XS' alors que les tailles de la commande
    // sont S/M/L (pas de XS declare en D8:F8) -> taille inconnue -> null + a verifier.
    assert.equal(entretelaSansEntete.placements[0].ratios, null, 'XS inconnu pour cette commande (S/M/L)');
    assert.ok(entretelaSansEntete.placements[0].aVerifier, 'doit signaler la taille inconnue');

    assert.equal(combinadoC1.nom, 'COMBINADO');
    assert.equal(combinadoC1.code, 'C1');
    assert.equal(combinadoC1.ref, '1-289/712');
    assert.equal(combinadoC1.principal, false);
    assert.equal(combinadoC1.placements.length, 1);
    assert.equal(combinadoC1.placements[0].ratios, null, 'XS inconnu ici aussi (meme commande S/M/L)');
    assert.ok(combinadoC1.placements[0].aVerifier);

    assert.deepEqual(f2.alertes, ['TENEMOS UNA PEQUEÑA DIFERENCIA DE TELA, AVISAR AL CLIENTE'], 'note libre capturee');

    /* ---------------- Feuille 3 (atelier) ---------------- */
    const f3 = feuilles.find(f => f.feuille === 'Tissu')!;
    assert.ok(f3, 'feuille atelier trouvee');
    assert.equal(f3.format, 'atelier');
    assert.equal(f3.client, 'ClienteX');
    assert.equal(f3.modele, 'ModeleX');
    assert.equal(f3.date, '2026-09-20');
    assert.equal(f3.pedido, '12345', 'pedido lu via la colonne dont l\'en-tete ligne 2 dit PEDIDO');
    assert.deepEqual(f3.tailles, ['XS', 'S', 'M']);
    assert.deepEqual(f3.quantites, { XS: 100, S: 80, M: 60 });

    assert.equal(f3.matieres.length, 1);
    const tissu = f3.matieres[0];
    assert.equal(tissu.nom, 'Tissu');
    assert.equal(tissu.code, 'TE');
    assert.equal(tissu.principal, true);
    assert.equal(tissu.placements.length, 0, 'format atelier : placements laisses vides, tout est dans matelas');
    assert.equal(tissu.matelas.length, 2);

    const m1 = tissu.matelas[0];
    assert.equal(m1.notation, 'Matelas 1');
    assert.equal(m1.numero, '1');
    assert.equal(m1.plis, 2);
    assert.equal(m1.longueurM, 1.5);
    assert.deepEqual(m1.ratios, { XS: 2, S: 1.5 }, 'XS via formule D16*2, S via valeur/plis = 3/2');

    const m2 = tissu.matelas[1];
    assert.equal(m2.notation, 'Matelas 2');
    assert.equal(m2.plis, 3);
    assert.deepEqual(m2.ratios, { XS: 1, S: 2, M: 0.5 }, 'formule D17*1 / valeur-plis 6/3 / formule D17*0.5');

    console.log('lireFeuilles (classeur synthetique): OK');
}

/* ------------------------------------------------------------------ */
/* Lecture depuis un vrai buffer .xlsx (aller-retour ecriture/lecture)  */
/* ------------------------------------------------------------------ */

async function testerViaBuffer() {
    const wb = construireClasseurTest();
    const buf = await wb.xlsx.writeBuffer();
    const arrayBuffer = buf instanceof ArrayBuffer ? buf : (buf as Uint8Array).buffer;
    const feuilles = await lireClasseurCoupe(arrayBuffer as ArrayBuffer);
    testerFeuilles(feuilles);
}

/* ------------------------------------------------------------------ */

async function main() {
    testerLireRatios();
    testerHelpersCellule();

    const wb = construireClasseurTest();
    testerFeuilles(lireFeuilles(wb));

    await testerViaBuffer();

    console.log('importCoupeExcel: OK');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
