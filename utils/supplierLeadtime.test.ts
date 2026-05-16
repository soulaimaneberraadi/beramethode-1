/**
 * Lancer: npx tsx utils/supplierLeadtime.test.ts
 */
import assert from 'node:assert/strict';
import type { AppSettings } from '../types';
import type { ModelData } from '../types';
import { aggregateMaterialNeeds } from './materialNeeds';
import { computeMaterialArrivalPlan, materialReadyDate } from './supplierLeadtime';

const settings = {
    workingDays: [1, 2, 3, 4, 5],
    workingHoursStart: '08:00',
    workingHoursEnd: '17:00',
    pauses: [],
    calendarExceptions: {},
} as AppSettings;

const d = materialReadyDate('2026-05-04', 2, settings);
assert.match(d, /^\d{4}-\d{2}-\d{2}$/);

const model = {
    id: 'm',
    filename: 'x',
    meta_data: { nom_modele: 'X', date_creation: '', effectif: 1, total_temps: 60, quantity: 100 },
    gamme_operatoire: [],
    ficheData: {
        quantity: 100,
        materials: [
            { name: 'Fil bleu', qty: 10, unit: 'm', id: '1' },
            { name: 'Bouton 12', qty: 2, unit: 'u', id: '2' },
        ],
    },
} as unknown as ModelData;

const lines = aggregateMaterialNeeds(model, 100);
const catalog = [
    {
        id: 'p1',
        designation: 'Fil bleu',
        reference: 'FB-01',
        fournisseurNom: 'Tex',
        fournisseurDelaiLivraisonJours: 3,
    },
    {
        id: 'p2',
        designation: 'Bouton 12',
        fournisseurNom: 'Bout SA',
        fournisseurDelaiLivraisonJours: 10,
    },
];

const plan = computeMaterialArrivalPlan(lines, catalog, '2026-05-04', settings, 7);
assert.equal(plan.rows.length, 2);
assert.equal(plan.rows[0].matched, true);
assert.equal(plan.rows[1].matched, true);
assert.ok(plan.worstArrivalYmd);
assert.equal(plan.criticalMaterialName, 'Bouton 12');
const bRow = plan.rows.find(r => r.name === 'Bouton 12');
const fRow = plan.rows.find(r => r.name === 'Fil bleu');
assert.ok(bRow && fRow);
assert.ok(bRow!.estimatedArrivalYmd >= fRow!.estimatedArrivalYmd);

console.log('supplierLeadtime.test.ts OK');
