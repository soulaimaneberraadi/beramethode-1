/**
 * Lancer: npx tsx lib/suggestionTempsCatalogue.test.ts
 */
import assert from 'node:assert/strict';
import type { ModelData, Machine } from '../types';
import { mean, suggestSimilarModelsForTemps } from './suggestionTempsCatalogue';

assert.equal(mean([2, 4, 6]), 4);
assert.equal(mean([]), 0);

const machines: Machine[] = [{ id: 'mac1', name: 'Juki', classe: 'A', speed: 1, speedMajor: 1, cofs: 1, active: true }];

const target: ModelData = {
    id: 't1',
    filename: 't.json',
    meta_data: {
        nom_modele: 'Robe lin',
        category: 'Robe',
        date_creation: '2026-01-01',
        total_temps: 120,
        effectif: 1,
    },
    gamme_operatoire: [
        { id: 'o1', order: 1, description: 'couture lin basique', machineId: 'mac1', machineName: 'Juki', time: 10 },
    ],
    ficheData: {
        date: '2026-01-01',
        client: 'X',
        category: 'Robe',
        designation: 'lin naturel',
        color: 'naturel',
        quantity: 1,
        chaine: '1',
        targetEfficiency: 80,
        unitCost: 0,
        clientPrice: 0,
        observations: '',
        costMinute: 0,
    },
};

const similar: ModelData = {
    id: 's1',
    filename: 's.json',
    meta_data: {
        nom_modele: 'Autre lin',
        category: 'Robe',
        date_creation: '2026-01-01',
        total_temps: 100,
        effectif: 1,
    },
    gamme_operatoire: [
        { id: 'o2', order: 1, description: 'couture lin', machineId: 'mac1', time: 8 },
    ],
    ficheData: {
        date: '2026-01-01',
        client: 'Y',
        category: 'Robe',
        designation: 'tissu lin',
        color: 'blanc',
        quantity: 1,
        chaine: '1',
        targetEfficiency: 80,
        unitCost: 0,
        clientPrice: 0,
        observations: '',
        costMinute: 0,
    },
};

const unrelated: ModelData = {
    id: 'u1',
    filename: 'u.json',
    meta_data: {
        nom_modele: 'Jean',
        category: 'Pantalon',
        date_creation: '2026-01-01',
        total_temps: 200,
        effectif: 1,
    },
    gamme_operatoire: [{ id: 'o3', order: 1, description: 'ourlet jean', machineId: 'mac1', time: 5 }],
    ficheData: {
        date: '2026-01-01',
        client: 'Z',
        category: 'Pantalon',
        designation: 'denim',
        color: 'bleu',
        quantity: 1,
        chaine: '1',
        targetEfficiency: 80,
        unitCost: 0,
        clientPrice: 0,
        observations: '',
        costMinute: 0,
    },
};

const rows = suggestSimilarModelsForTemps(target, [similar, unrelated], machines, { limit: 5, minScore: 1 });
assert.ok(rows.length >= 1);
assert.equal(rows[0].modelId, 's1');

// eslint-disable-next-line no-console
console.log('suggestionTempsCatalogue.test.ts OK');
