import assert from 'node:assert';
import type { AppSettings } from '../types';
import { capaciteJournaliereChaine, calculateEndDate } from './planning';

/**
 * La capacite d'une chaine et la duree d'un OF.
 *
 * Ces tests fixent le point qui a produit des OF s'etalant jusqu'en 2027 : le
 * Gantt affichait « 1000 pcs/j » en en-tete et dessinait la barre d'apres une
 * TOUTE AUTRE capacite, parce que `calculateEndDate` ignorait `capacityMode`.
 */

const base: AppSettings = {
    workingHoursStart: '06:30',
    workingHoursEnd: '17:00',
    pauses: [{ id: 'p1', label: 'pause', start: '09:30', end: '09:45', durationMin: 15 },
             { id: 'p2', label: 'dejeuner', start: '12:45', end: '13:45', durationMin: 60 }],
    workingDays: [1, 2, 3, 4, 5, 6],
    chainsCount: 4,
    chainCapacityPerDay: { 'CHAINE 2': 1000 },
    chainOperators: { 'CHAINE 2': 1 },
} as unknown as AppSettings;

// ── STATIC (defaut) : la capacite REGLEE fait foi ────────────────────────────
assert.equal(
    capaciteJournaliereChaine(base, 'CHAINE 2', 15, 0.51),
    1000,
    'STATIC doit rendre la capacite reglee de la chaine',
);

// Chaine sans reglage : le meme repli que l'en-tete (`getChainDailyCapacity`).
assert.equal(
    capaciteJournaliereChaine(base, 'CHAINE 3', 15, 0.51),
    1000,
    'STATIC sans reglage doit rendre le meme defaut que l en-tete de chaine',
);

// ── DYNAMIC : la capacite est deduite du SAM et de l'effectif ────────────────
const dyn = { ...base, capacityMode: 'DYNAMIC' } as AppSettings;
const capDyn = capaciteJournaliereChaine(dyn, 'CHAINE 2', 15, 0.51);
assert.ok(capDyn > 0 && capDyn < 100, `DYNAMIC avec 1 ouvrier doit rester petit, obtenu ${capDyn}`);
assert.notEqual(capDyn, 1000, 'DYNAMIC ne doit pas rendre la capacite statique');

// ── La duree d'un OF suit la capacite retenue ────────────────────────────────
// 1260 pieces sur une chaine a 1000 pcs/j : deux jours ouvres, pas des mois.
const finStatic = calculateEndDate('2026-09-08', 1260, 15, 0.51, base, 'CHAINE 2', 120).split('T')[0];
const joursStatic = Math.round(
    (Date.parse(`${finStatic}T00:00:00`) - Date.parse('2026-09-08T00:00:00')) / 86400000,
);
assert.ok(joursStatic <= 4, `STATIC : 1260 pcs a 1000/j doit tenir en quelques jours, obtenu ${joursStatic}`);

// Le meme OF en DYNAMIC avec 1 ouvrier prend, lui, des mois : c'est bien la
// capacite qui commande la duree, et non la date de lancement.
const finDyn = calculateEndDate('2026-09-08', 1260, 15, 0.51, dyn, 'CHAINE 2', 120).split('T')[0];
const joursDyn = Math.round(
    (Date.parse(`${finDyn}T00:00:00`) - Date.parse('2026-09-08T00:00:00')) / 86400000,
);
assert.ok(joursDyn > joursStatic * 5, `DYNAMIC a 1 ouvrier doit etre bien plus long, obtenu ${joursDyn}`);

// ── Une quantite nulle ne doit jamais produire une date absurde ──────────────
const finZero = calculateEndDate('2026-09-08', 0, 15, 0.51, base, 'CHAINE 2', 120).split('T')[0];
assert.ok(finZero >= '2026-09-08', 'une quantite nulle ne recule pas la date');

console.log('planningCapacity.test.ts OK');
