/**
 * Lancer: npx tsx utils/materialNeeds.test.ts
 */
import assert from 'node:assert/strict';
import type { ModelData } from '../types';
import {
    aggregateMaterialNeeds,
    evaluateStockForPlanning,
    formatStockBlockedReason,
    materialStockRowsForDisplay,
} from './materialNeeds';

const model = {
    id: 'm',
    filename: 'x',
    meta_data: { nom_modele: 'X', date_creation: '', effectif: 1, total_temps: 60, quantity: 100 },
    gamme_operatoire: [],
    ficheData: {
        quantity: 100,
        materials: [{ name: 'Fil', qty: 10, unit: 'm', id: '1' }],
    },
} as unknown as ModelData;

// m.qty (=10) est PAR PIÈCE → besoin pour 50 pièces = 500.
const lines = aggregateMaterialNeeds(model, 50);
assert.equal(lines[0].qty, 500);

const products = [{ id: 'p1', designation: 'Fil', reference: 'F-01' }];
const lotsOk = [{ productId: 'p1', quantiteRestante: 600, quantiteReservee: 0 }];
const evOk = evaluateStockForPlanning(model, 50, products, lotsOk);
assert.equal(evOk.ok, true);
assert.equal(evOk.shortages.length, 0);

const lotsShort = [{ productId: 'p1', quantiteRestante: 100, quantiteReservee: 0 }];
const evShort = evaluateStockForPlanning(model, 50, products, lotsShort);
assert.equal(evShort.ok, false);
assert.ok(evShort.shortages.length >= 1);

const reason = formatStockBlockedReason(evShort.shortages);
assert.ok(reason.length > 0);

const rows = materialStockRowsForDisplay(model, 50, products, lotsShort);
assert.equal(rows.length, 1);
assert.equal(rows[0].ok, false);

console.log('materialNeeds.test.ts OK');
