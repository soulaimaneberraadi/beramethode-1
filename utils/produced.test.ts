/**
 * Lancer: npx tsx utils/produced.test.ts
 */
import assert from 'node:assert/strict';
import type { SuiviData } from '../types';
import { sumPiecesFromSuiviForPlanning } from './produced';

const suivis: SuiviData[] = [
    {
        id: 'a',
        planningId: 'OF1',
        date: '2026-01-01',
        entrer: 0,
        sorties: { '08': 3, '09': 2 },
        totalHeure: 0,
        pJournaliere: 0,
        enCour: 0,
        resteEntrer: 0,
        resteSortie: 0,
        totalWorkers: 1,
    },
    {
        id: 'b',
        planningId: 'OF1',
        date: '2026-01-02',
        entrer: 0,
        sorties: { '10': 7 },
        totalHeure: 0,
        pJournaliere: 0,
        enCour: 0,
        resteEntrer: 0,
        resteSortie: 0,
        totalWorkers: 1,
    },
];

assert.equal(sumPiecesFromSuiviForPlanning('OF1', suivis), 12);
assert.equal(sumPiecesFromSuiviForPlanning('MISSING', suivis), 0);

console.log('produced.test.ts OK');
