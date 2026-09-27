/**
 * Lancer: node --import tsx lib/serieEtiquetage.test.ts
 *
 * La feuille « SERIE » de l'atelier : S*2 sur 82 plis donne deux paquets de S,
 * 1-82 puis 83-164, et la serie continue sur le matelas suivant.
 */
import assert from 'node:assert/strict';
import type { MatelasLine } from '../types';
import { avancementSerie, figerSerie, lireSerieExcel, paquetsSerie, piecesParChaine, saisiesDepuisSerie } from './serieEtiquetage';

const T = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const m = (id: string, numero: string, plis: number, ratios: Record<string, number>, extra: Partial<MatelasLine> = {}): MatelasLine =>
    ({ id, numero, plis, longTracee: 3.6, ratios, ...extra });

{
    const p = paquetsSerie([
        m('b', '2', 82, { M: 2 }),
        m('a', '1', 82, { S: 2 }),
        m('v', '3', 40, { S: 1 }, { tissu: 'vlieseline' }),
        m('c', '4', 86, { XS: 1, L: 1 }, { fait: true }),
        m('z', '5', 0, { S: 2 }),
    ], T);
    assert.deepEqual(p.map(x => [x.paquet, x.taille, x.debut, x.fin]), [
        ['1', 'S', 1, 82],
        ['1', 'S', 83, 164],
        ['2', 'M', 165, 246],
        ['2', 'M', 247, 328],
        ['4', 'XS', 329, 414],
        ['4', 'L', 415, 500],
    ], 'ordre des numeros, tailles dans l ordre de la commande, serie continue');
    assert.ok(p.every(x => x.plis === x.fin - x.debut + 1));
    assert.equal(p[4].fait, true);
    assert.equal(new Set(p.map(x => x.cle)).size, p.length, 'cles uniques');

    // Depart choisi.
    assert.equal(paquetsSerie([m('a', '1', 10, { S: 1 })], T, 501)[0].debut, 501);

    // Pieces par chaine (avec les pieces en plus/moins).
    const s = { saisies: { [p[0].cle]: { chaine: 'CHAINE 1' }, [p[1].cle]: { chaine: 'CHAINE 1', pieces: -2 }, [p[2].cle]: { chaine: 'CHAINE 2' } } };
    assert.deepEqual(piecesParChaine(p, s), { 'CHAINE 1': 162, 'CHAINE 2': 82 });
}

// Matelas coupe : ses etiquettes sont collees, ses plages ne bougent plus.
{
    const avant = [m('a', '22', 100, { M: 2 }), m('b', '25', 100, { S: 1 })];
    const coupe = avant.map(l => (l.id === 'a' ? { ...l, fait: true } : l));
    const serie = figerSerie(undefined, coupe, T, ['a'], true);
    assert.deepEqual(serie.figes, { 'a:M:0': { debut: 1, fin: 100 }, 'a:M:1': { debut: 101, fin: 200 } });

    // On ajoute ensuite des XL numerotes avant (1, 2) : le 22 garde 1-200, les autres sautent sa plage.
    const apres = [m('x', '1', 100, { XL: 1 }), m('y', '2', 50, { XL: 1 }), ...coupe];
    const p = paquetsSerie(apres, T, 1, serie.figes);
    assert.deepEqual(p.map(x => [x.paquet, x.taille, x.debut, x.fin, !!x.fige]), [
        ['1', 'XL', 201, 300, false],
        ['2', 'XL', 301, 350, false],
        ['22', 'M', 1, 100, true],
        ['22', 'M', 101, 200, true],
        ['25', 'S', 351, 450, false],
    ], 'plages figees intactes, jamais chevauchees');

    // Une plage libre assez grande avant la plage figee reste utilisee.
    const petit = paquetsSerie([m('x', '1', 100, { XL: 1 }), ...coupe], T, 1, { 'a:M:0': { debut: 301, fin: 400 }, 'a:M:1': { debut: 401, fin: 500 } });
    assert.deepEqual(petit.map(x => [x.debut, x.fin]), [[1, 100], [301, 400], [401, 500], [501, 600]]);

    // Decoupe (erreur de clic) : la plage est relachee.
    assert.deepEqual(figerSerie(serie, coupe, T, ['a'], false).figes, {});
}

// Feuille SERIE de l'atelier relue depuis Excel, reposee sur les paquets.
(async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('SERIE - Tissu');
    ws.getCell('B1').value = 'STAR STYLE';
    ['DATE', 'N\u00b0 PAQ', 'PLI', 'SERIE', 'SERIE2', 'TAILLE', 'PIECES (-/+)', 'N', 'ENTREE', 'LOTE', 'SORTE', 'CHAINE']
        .forEach((t, i) => { ws.getCell(4, i + 1).value = t; });
    const lignesXl: unknown[][] = [
        ['25/09/2026', 1, 82, 1, { formula: 'D5+C5-1', result: 82 }, 'S', -2, '', '26/09', 'L1', '', 'STAR1+2'],
        ['', 1, 82, { formula: 'E5+1', result: 83 }, { formula: 'D6+C6-1', result: 164 }, 'S', '', '', '', '', '', 'Chaine 1'],
        ['', 2, 82, 165, 246, 'M', '', '', '', '', '28/09', ''],
        ['', 9, 10, 900, 909, 'XL', '', '', '', '', '', 'X'],
    ];
    lignesXl.forEach((l, r) => l.forEach((v, c) => { ws.getCell(5 + r, c + 1).value = v as never; }));
    const buffer = await wb.xlsx.writeBuffer();
    const lues = await lireSerieExcel(buffer as ArrayBuffer);
    assert.equal(lues.length, 4);
    assert.deepEqual([lues[0].paquet, lues[0].taille, lues[0].debut, lues[0].pieces, lues[0].chaine], ['1', 'S', 1, -2, 'STAR1+2']);
    assert.equal(lues[1].debut, 83, 'resultat de la formule');

    const paquets = paquetsSerie([m('a', '1', 82, { S: 2 }), m('b', '2', 82, { M: 2 })], T);
    const r = saisiesDepuisSerie(paquets, lues, [{ id: 'CHAINE 1', name: 'Chaine 1' }]);
    assert.equal(r.reprises, 3);
    assert.equal(r.sansPaquet, 1, 'le paquet 9 n existe pas ici');
    assert.deepEqual(r.saisies[paquets[0].cle], { date: '25/09/2026', pieces: -2, entree: '26/09', lote: 'L1', chaine: 'STAR1+2' });
    assert.equal(r.saisies[paquets[1].cle].chaine, 'CHAINE 1', 'nom connu du Planning -> son id');
    assert.equal(r.saisies[paquets[2].cle].sortie, '28/09');
    {
    // Avancement vu du Planning : coupe, entre en chaine, sorti.
    const ls = [m('a', '1', 10, { S: 1, M: 1 }, { fait: true }), m('b', '2', 5, { M: 1 })];
    const ps = paquetsSerie(ls, ['S', 'M'], 1);
    const serie = { saisies: { [ps[0].cle]: { entree: '27/09/2026', chaine: 'CHAINE 1', pieces: -1 }, [ps[1].cle]: { entree: '27/09/2026', sortie: '28/09/2026', chaine: 'CHAINE 2' } } };
    const a = avancementSerie(ls, ['S', 'M'], serie)!;
    assert.deepEqual(a.total, { paquets: 3, pieces: 24 });
    assert.deepEqual(a.coupes, { paquets: 2, pieces: 19 });
    assert.deepEqual(a.entres, { paquets: 2, pieces: 19 });
    assert.deepEqual(a.sortis, { paquets: 1, pieces: 10 });
    assert.deepEqual(a.parChaine, { 'CHAINE 1': 9, 'CHAINE 2': 10 });
    assert.equal(avancementSerie([], ['S'], undefined), null);
}

console.log('serieEtiquetage: OK');
})().catch(e => { console.error(e); process.exit(1); });
