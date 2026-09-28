/**
 * Lancer: node --import tsx lib/exportOrdresCoupe.test.ts
 */
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import type { ModelData } from '../types';
import { classeurOrdresCoupe } from './exportOrdresCoupe';

const m = {
    id: 'A', filename: 'A',
    meta_data: { nom_modele: 'Jupe 12', date_creation: '2026-09-01', total_temps: 0, effectif: 0 },
    gamme_operatoire: [],
    ficheData: { client: 'ZARA', sizes: ['S', 'M'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 40, n_1: 20 } },
    ordreCoupe: {
        refModele: 'J12', longueurMatelas: 0, consommation: 0, nbrFeuilles: 0, nbrMatelas: 0, qteTotale: 16016, status: 'EN_COURS',
        placements: [{ id: 'p', code: 'TE-01', nom: '2S 1M', ratios: { S: 2, M: 1 }, longueurM: 3, efficience: 84 }],
        matelasLines: [
            { id: '1', plis: 10, longTracee: 3, ratios: { S: 2, M: 1 }, couleur: 'Noir', placementId: 'p', fait: true, fin: '2026-09-20T10:00:00' },
            { id: '2', plis: 10, longTracee: 3, ratios: { S: 2, M: 1 }, couleur: 'Noir', placementId: 'p' },
        ],
    },
} as unknown as ModelData;

(async () => {
    const buf = await classeurOrdresCoupe([m]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    assert.deepEqual(wb.worksheets.map(w => w.name), ['Ordres', 'Couleur x Taille', 'Matelas']);
    const o = wb.getWorksheet('Ordres')!;
    const tete = (o.getRow(1).values as any[]).slice(1);
    const val = (titre: string) => o.getRow(2).getCell(tete.indexOf(titre) + 1).value;
    assert.equal(val('Commandé (pcs)'), 60, 'la grille, pas qteTotale');
    assert.equal(val('Coupé (pcs)'), 30);
    assert.equal(val('Reste à couper'), 30);
    assert.equal(val('Matelas'), 2);
    assert.equal(val('Efficience tracé'), 84);
    assert.ok(Number(val('Tissu prévu (m)')) > 60, 'les metres viennent des matelas');
    assert.equal(wb.getWorksheet('Matelas')!.rowCount, 3);
    console.log('exportOrdresCoupe : ok');
})().catch(e => { console.error(e); process.exit(1); });
