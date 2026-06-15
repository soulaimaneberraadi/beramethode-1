/**
 * Lancer: npx tsx utils/lots.test.ts
 */
import assert from 'node:assert/strict';
import type { ModelData } from '../types';
import { splitLotsFromModelGrid, totalLotsQty } from './lots';

const model = {
    id: 'm',
    filename: 'x',
    meta_data: { nom_modele: 'X', sizes: ['S', 'M'], quantity: 100, date_creation: '', effectif: 1, total_temps: 60 },
    gamme_operatoire: [],
    ficheData: {
        sizes: ['S', 'M'],
        quantity: 100,
        gridQuantities: { c0_0: 40, c0_1: 60 },
    },
} as unknown as ModelData;

const lots = splitLotsFromModelGrid(model, 200, '2026-05-01');
assert.equal(lots.length, 2);
assert.equal(totalLotsQty(lots), 200);

const emptyGrid = splitLotsFromModelGrid(
    { ...(model as ModelData), ficheData: { ...model.ficheData!, gridQuantities: {} } } as unknown as ModelData,
    10,
    '2026-05-01'
);
assert.equal(totalLotsQty(emptyGrid), 10);

console.log('lots.test.ts OK');
