/**
 * Lancer: node --import tsx lib/rendementEngine.test.ts
 *
 * Rendement de la page Rendement : presence comptee une fois par chaine et par
 * jour, cible d'un OF comptee une fois, horaire du jour reel, arrets comptes
 * une seule fois dans le TRS.
 */
import assert from 'node:assert/strict';
import type { AppSettings, ModelData, PlanningEvent, SuiviData } from '../types';
import { computeRendement, minutesTravailJour } from './rendementEngine';

// 08:00 -> 12:00 du lundi au samedi, vendredi 08:00 -> 10:00 : 240 min, 120 le vendredi.
const settings = {
    workingHoursStart: '08:00', workingHoursEnd: '12:00', pauses: [], workingDays: [1, 2, 3, 4, 5, 6],
    dayScheduleOverrides: { 5: { end: '10:00' } },
} as unknown as AppSettings;
const maintenant = new Date('2026-10-05T20:00:00');

assert.equal(minutesTravailJour(settings, '2026-09-28', maintenant), 240, 'lundi');
assert.equal(minutesTravailJour(settings, '2026-10-02', maintenant), 120, 'vendredi court');
assert.equal(minutesTravailJour(settings, '2026-10-05', new Date('2026-10-05T10:00:00')), 120, "aujourd'hui : temps ecoule seulement");

const models = [
    { id: 'A', filename: 'a', meta_data: { nom_modele: 'A', total_temps: 2 } },
    { id: 'B', filename: 'b', meta_data: { nom_modele: 'B', total_temps: 4 } },
] as unknown as ModelData[];
const planningEvents = [
    { id: 'OF-A', modelId: 'A', chaineId: 'CHAINE 1', qteTotal: 1000 },
    { id: 'OF-B', modelId: 'B', chaineId: 'CHAINE 1', qteTotal: 500 },
] as unknown as PlanningEvent[];
const s = (id: string, planningId: string, date: string, sorties: Record<string, number>, extra: Partial<SuiviData> = {}): SuiviData =>
    ({ id, planningId, chaineId: 'CHAINE 1', date, sorties, totalWorkers: 10, ...extra } as unknown as SuiviData);

{
    // Lundi : A sur 08h-10h, B sur 10h-12h, 10 ouvriers, 240 min -> presence 2400 minutes-personne, une seule fois.
    // Gagnees : A 300 x 2 = 600, B 150 x 4 = 600 -> 1200 / 2400 = 50 %.
    // Mardi : A seul, 600 pieces x 2 = 1200 / 2400 = 50 %. La cible de A ne compte qu'une fois.
    const root = computeRendement({
        models, planningEvents, settings, maintenant,
        suivis: [
            s('1', 'OF-A', '2026-09-28', { h0800: 150, h0900: 150 }),
            s('2', 'OF-B', '2026-09-28', { h1000: 75, h1100: 75 }),
            s('3', 'OF-A', '2026-09-29', { h0800: 150, h0900: 150, h1000: 150, h1100: 150 }),
        ],
    });
    const chaine = root.children![0].children![0];
    assert.equal(chaine.presenceMinutes, 4800, 'deux jours x 10 x 240, pas de double comptage');
    assert.equal(chaine.rPercent, 50);
    assert.equal(chaine.target, 1500, 'cible de A une fois + cible de B');
    assert.equal(chaine.effectif, 10, 'effectif moyen par jour, pas la somme des lignes');
    const A = chaine.children!.find(c => c.label === 'A')!;
    const B = chaine.children!.find(c => c.label === 'B')!;
    assert.equal(A.target, 1000);
    assert.equal(A.presenceMinutes, 1200 + 2400, 'la moitie du lundi + tout le mardi');
    assert.equal(B.presenceMinutes, 1200);
    assert.equal(A.rPercent, 50);
    assert.equal(B.rPercent, 50);
}

{
    // Un creneau en panne (M = 30 min) sur 240 : dispo 87,5 %, performance mesuree sur 210 min.
    const root = computeRendement({
        models, planningEvents, settings, maintenant,
        suivis: [s('1', 'OF-A', '2026-09-28', { h0800: 105, h0900: 105, h1000: 105, h1100: 105 }, { downtimes: { h0900: 'M' } } as any)],
    });
    const n = root.children![0].children![0];
    assert.equal(n.availability, 87.5);
    assert.equal(n.rPercent, 40, '840 / (10 x 210)');
    assert.equal(n.trs, 35, 'TRS = 840 / 2400 : l arret n est compte qu une fois');
}

{
    // Sans effectif dans Effectifs : le pointage RH de la chaine prend le relais.
    const rh = {
        workers: [{ id: 1, chaine_id: 'CHAINE 1' }, { id: 2, chaine_id: 'CHAINE 1' }],
        pointages: [{ worker_id: 1, date: '2026-09-28', statut: 'PRESENT' }, { worker_id: 2, date: '2026-09-28', statut: 'PRESENT' }],
    };
    const root = computeRendement({
        models, planningEvents, settings, maintenant, rh,
        suivis: [s('1', 'OF-A', '2026-09-28', { h0800: 60, h0900: 60 }, { totalWorkers: 0 } as any)],
    });
    const n = root.children![0].children![0];
    assert.equal(n.presenceMinutes, 2 * 240);
    assert.equal(n.rPercent, 50, '240 / 480');
}

console.log('rendementEngine : OK');
