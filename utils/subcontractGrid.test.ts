/**
 * Lancer: npx tsx utils/subcontractGrid.test.ts
 */
import assert from 'node:assert/strict';
import {
  orderGridToModel,
  modelGridToOrder,
  diffOrderVsModelGrid,
  sumOrderGrid,
  sumModelGrid,
} from './subcontractGrid';

const colors = [{ id: 'c0', name: 'Bleu Marine' }, { id: 'c1', name: 'Blanc' }];
const sizes = ['S', 'M', 'L'];

// 1. Conversion nominale commande → modèle
const conv = orderGridToModel({ 'Bleu Marine': { S: 10, M: 20 }, Blanc: { L: 5 } }, colors, sizes);
assert.deepEqual(conv.gridQuantities, { c0_0: 10, c0_1: 20, c1_2: 5 });
assert.equal(conv.matchedTotal, 35);
assert.equal(conv.orderTotal, 35);
assert.deepEqual(conv.unmatchedColors, []);

// 2. Appariement tolérant (casse, espaces, accents)
const loose = orderGridToModel({ '  bleu   marine ': { s: 7 } }, colors, sizes);
assert.deepEqual(loose.gridQuantities, { c0_0: 7 });

// 3. Ce qui n'est pas apparié n'est JAMAIS reporté, mais toujours signalé
const partial = orderGridToModel({ Rouge: { S: 9 }, Blanc: { XXL: 4 } }, colors, sizes);
assert.deepEqual(partial.gridQuantities, {});
assert.equal(partial.matchedTotal, 0);
assert.equal(partial.orderTotal, 13);
assert.deepEqual(partial.unmatchedColors, ['Rouge']);
assert.deepEqual(partial.unmatchedSizes, ['XXL']);

// 4. Aller-retour modèle → commande → modèle
const back = modelGridToOrder({ c0_0: 10, c0_1: 20, c1_2: 5 }, colors, sizes);
assert.deepEqual(back, { 'Bleu Marine': { S: 10, M: 20 }, Blanc: { L: 5 } });
assert.deepEqual(orderGridToModel(back, colors, sizes).gridQuantities, { c0_0: 10, c0_1: 20, c1_2: 5 });

// 5. Totaux
assert.equal(sumOrderGrid(back), 35);
assert.equal(sumModelGrid({ c0_0: 10, c0_1: 20, c1_2: 5 }), 35);

// 6. Diff : grilles identiques
const same = diffOrderVsModelGrid(back, { c0_0: 10, c0_1: 20, c1_2: 5 }, colors, sizes);
assert.equal(same.differs, false);
assert.equal(same.delta, 0);

// 7. Diff : le modèle sous-évalue (delta négatif = prix de revient trop bas)
const under = diffOrderVsModelGrid(back, { c0_0: 10 }, colors, sizes);
assert.equal(under.differs, true);
assert.equal(under.orderTotal, 35);
assert.equal(under.modelTotal, 10);
assert.equal(under.delta, -25);
assert.deepEqual(under.proposed, { c0_0: 10, c0_1: 20, c1_2: 5 });

// 8. Grille de commande absente : rien à proposer, aucun plantage
const none = diffOrderVsModelGrid(null, { c0_0: 10 }, colors, sizes);
assert.equal(none.orderTotal, 0);
assert.deepEqual(none.proposed, {});

// 9. Deux libellés qui se normalisent pareil s'additionnent au lieu de s'écraser
const merged = orderGridToModel({ Blanc: { S: 3 }, ' blanc ': { S: 4 } }, colors, sizes);
assert.deepEqual(merged.gridQuantities, { c1_0: 7 });

console.log('subcontractGrid: 9 cas OK');
