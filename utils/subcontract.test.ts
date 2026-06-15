/**
 * Lancer: npx tsx utils/subcontract.test.ts
 */
import assert from 'node:assert/strict';
import { suggestSubcontractWindow } from './subcontract';

const w = suggestSubcontractWindow('2026-06-01');
assert.equal(w.startYmd, '2026-06-01');
assert.equal(w.endYmd, '2026-06-01');

console.log('subcontract.test.ts OK');
