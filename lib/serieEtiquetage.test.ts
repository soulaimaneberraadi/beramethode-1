/**
 * Lancer: node --import tsx lib/serieEtiquetage.test.ts
 *
 * La feuille « SERIE » de l'atelier : S*2 sur 82 plis donne deux paquets de S,
 * 1-82 puis 83-164, et la serie continue sur le matelas suivant.
 */
import assert from 'node:assert/strict';
import type { MatelasLine } from '../types';
import { lireSerieExcel, paquetsSerie, piecesParChaine, saisiesDepuisSerie } from './serieEtiquetage';

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
    console.log('serieEtiquetage: OK');
})().catch(e => { console.error(e); process.exit(1); });
