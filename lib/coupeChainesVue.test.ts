/**
 * Lancer: node --import tsx lib/coupeChainesVue.test.ts
 */
import assert from 'node:assert/strict';
import type { AppSettings } from '../types';
import type { ChaineCoupe, ModeleSurChaine, PlanJour } from './coupeChaines';
import { heuresParJour, modeleEnCours, numerosVisibles, verdictAvance, vuePlan } from './coupeChainesVue';

// --- vuePlan : un modele sur une chaine, du plus fort au plus faible ---
{
    const plan = (o: Partial<PlanJour> = {}): PlanJour => ({ matelas: [], pieces: 0, metres: 0, autres: [], statut: 'rien', sansLongueur: 0, ...o });
    const ligne = (o: Partial<ModeleSurChaine> = {}, p: Partial<PlanJour> = {}) =>
        ({ aUnOrdre: true, enPause: false, plusTard: false, serieAbsente: false, sansMatelas: false, resteACouper: 400, planJour: plan(p), ...o }) as ModeleSurChaine;
    const matelas = [{ id: 'a', numero: '1', pieces: 200, metres: 10 }];

    assert.equal(vuePlan(ligne({ aUnOrdre: false })), 'horsCoupe');
    assert.equal(vuePlan(ligne({ aUnOrdre: false, enPause: true })), 'horsCoupe', 'sans ordre, la pause ne change rien a dire');
    assert.equal(vuePlan(ligne({ enPause: true }, { statut: 'pause' })), 'pause');
    assert.equal(vuePlan(ligne({ enPause: true, plusTard: true })), 'pause', 'la pause passe avant « plus tard »');
    assert.equal(vuePlan(ligne({ plusTard: true })), 'plusTard');
    assert.equal(vuePlan(ligne({ serieAbsente: true })), 'serieAbsente');
    assert.equal(vuePlan(ligne({ sansMatelas: true }, { statut: 'manque' })), 'sansMatelas', 'pas de matelas calcules : on le dit avant le manque');
    assert.equal(vuePlan(ligne({}, { statut: 'manque', manque: 300 })), 'manque');
    assert.equal(vuePlan(ligne({}, { statut: 'manque', manque: 300, matelas })), 'manque', 'le manque garde ses matelas');
    assert.equal(vuePlan(ligne({ resteACouper: 0 })), 'toutCoupe');
    assert.equal(vuePlan(ligne({ resteACouper: 400 })), 'rien');
    assert.equal(vuePlan(ligne({}, { statut: 'a_couper', matelas })), 'a_couper');
}

// --- verdictAvance : memes seuils que l'etat de la chaine ---
{
    assert.equal(verdictAvance(null, 2, 8), null, 'sans cadence, pas d’avance calculable');
    const arret = verdictAvance(0.5, 2, 8)!;
    assert.equal(arret.niveau, 'arret');
    assert.equal(arret.heures, 4, '0,5 jour x 8 h');
    assert.equal(arret.part, 0.25);
    assert.equal(verdictAvance(0, 2, 8)!.heures, 0);
    assert.equal(verdictAvance(1, 2, 8)!.niveau, 'juste', 'un jour pile n’est plus un arret');
    assert.equal(verdictAvance(1.99, 2, 8)!.niveau, 'juste');
    const avance = verdictAvance(2.4, 2, 8)!;
    assert.equal(avance.niveau, 'avance');
    assert.equal(avance.part, 1, 'la barre s’arrete a l’objectif');
    assert.equal(verdictAvance(0.5, 2, 9)!.heures, 4.5, 'les heures suivent la journee de l’usine');
    assert.equal(verdictAvance(0.5, 2, 0)!.heures, 4, 'journee inconnue : 8 h');
    assert.equal(verdictAvance(-1, 2, 8)!.jours, 0, 'jamais negatif');
    assert.equal(verdictAvance(3, 0, 8)!.part, 1, 'objectif nul : barre pleine');
}

// --- heuresParJour : les horaires de l'usine ---
{
    const usine = {
        workingHoursStart: '08:00', workingHoursEnd: '17:00', workingDays: [1, 2, 3, 4, 5],
        pauses: [{ id: 'p', name: 'Midi', start: '12:00', end: '13:00', durationMin: 60 }],
        dayScheduleOverrides: { 5: { end: '12:00', pauses: [] } },
    } as unknown as AppSettings;
    assert.equal(heuresParJour(undefined), 8, 'sans reglage : 8 h');
    assert.equal(heuresParJour(usine, new Date(2026, 9, 5)), 8, 'lundi : 9 h moins la pause');
    assert.equal(heuresParJour(usine, new Date(2026, 9, 2)), 4, 'vendredi : l’exception du jour (8 h-12 h, sans pause)');
    assert.equal(heuresParJour(usine, new Date(2026, 9, 4)), 8, 'dimanche ferme : l’horaire general');
    assert.equal(heuresParJour({ workingHoursStart: '08:00', workingHoursEnd: '08:00' } as unknown as AppSettings), 8, 'horaire vide : 8 h');
}

// --- modeleEnCours ---
{
    const a = { modelId: 'A' } as ModeleSurChaine, b = { modelId: 'B' } as ModeleSurChaine;
    const chaine = (modelId?: string) => ({ modeles: [a, b], rythme: { chaineParJour: 0, source: 'planning', ecartJours: null, ...(modelId ? { modelId } : {}) } }) as unknown as ChaineCoupe;
    assert.equal(modeleEnCours(chaine('B')), b);
    assert.equal(modeleEnCours(chaine()), undefined);
    assert.equal(modeleEnCours(chaine('Z')), undefined);
}

// --- numerosVisibles : les premiers, puis « +N » ---
{
    const n = Array.from({ length: 12 }, (_, i) => String(i + 1));
    assert.deepEqual(numerosVisibles(['4', '5'], false), { visibles: ['4', '5'], reste: 0, longue: false });
    assert.deepEqual(numerosVisibles(n.slice(0, 8), false), { visibles: n.slice(0, 8), reste: 0, longue: false }, 'huit tiennent encore');
    const court = numerosVisibles(n, false);
    assert.deepEqual([court.visibles.length, court.reste, court.longue], [8, 4, true]);
    const ouvert = numerosVisibles(n, true);
    assert.deepEqual([ouvert.visibles.length, ouvert.reste, ouvert.longue], [12, 0, true], 'ouverte : tout, et on peut la refermer');
    assert.deepEqual(numerosVisibles(['', ' 3 '], false).visibles, ['?', '3'], 'numero vide : « ? »');
    assert.deepEqual(numerosVisibles(n, false, 3).visibles, ['1', '2', '3']);
}

console.log('coupeChainesVue : OK');
