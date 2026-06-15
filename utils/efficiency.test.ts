/**
 * Lancer: npx tsx utils/efficiency.test.ts
 */
import assert from 'node:assert/strict';
import type { AppSettings, ModelData, PlanningEvent, SuiviData } from '../types';
import { computeChainEfficiency } from './efficiency';

const settings: AppSettings = {
    workingDays: [1, 2, 3, 4, 5],
    workingHoursStart: '08:00',
    workingHoursEnd: '17:00',
    pauses: [],
    calendarExceptions: {},
} as AppSettings;

const ev: PlanningEvent = {
    id: 'p1',
    modelId: 'm1',
    chaineId: 'CHAINE 1',
    dateLancement: '2026-01-01',
    dateExport: '2026-01-10',
    qteTotal: 100,
    status: 'IN_PROGRESS',
};

const model: ModelData = {
    id: 'm1',
    filename: 'f',
    meta_data: { nom_modele: 'T', total_temps: 60, quantity: 100, date_creation: '', effectif: 1 },
    gamme_operatoire: [],
} as ModelData;

const s: SuiviData = {
    id: 's1',
    planningId: 'p1',
    date: new Date().toISOString(),
    entrer: 0,
    sorties: { '08': 10 },
    totalHeure: 0,
    pJournaliere: 0,
    enCour: 0,
    resteEntrer: 0,
    resteSortie: 0,
    totalWorkers: 2,
};

const { eff, n } = computeChainEfficiency([s], [ev], [model], 'CHAINE 1', settings);
assert.equal(n, 1);
assert.ok(eff >= 0.4 && eff <= 1.2);

const empty = computeChainEfficiency([], [], [], 'CHAINE 2', settings);
assert.equal(empty.n, 0);
assert.ok(empty.eff === 0.85);

console.log('efficiency.test.ts OK');
