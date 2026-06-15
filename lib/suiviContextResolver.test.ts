/**
 * Lancer: npx tsx lib/suiviContextResolver.test.ts
 */
import assert from 'node:assert/strict';
import type { PlanningEvent, SuiviData } from '../types';
import { alignHourKeyToGrid, resolveSuiviContext } from './suiviContextResolver';

const planA: PlanningEvent = {
    id: 'pA',
    modelId: 'm1',
    chaineId: 'CHAINE 1',
    dateLancement: '2026-01-01',
    dateExport: '2026-02-01',
    qteTotal: 100,
    status: 'IN_PROGRESS',
};
const planB: PlanningEvent = {
    id: 'pB',
    modelId: 'm2',
    chaineId: 'CHAINE 1',
    dateLancement: '2026-01-01',
    dateExport: '2026-02-01',
    qteTotal: 100,
    status: 'IN_PROGRESS',
};

assert.equal(alignHourKeyToGrid('h1000', ['h0800', 'h1000', 'h1100']), 'h1000');
assert.equal(alignHourKeyToGrid('h1030', ['h0800', 'h1000', 'h1100']), 'h1000');

{
    const suivis: SuiviData[] = [
        {
            id: 's1',
            planningId: 'pA',
            date: '2026-04-28',
            entrer: 0,
            sorties: { h1000: 5 },
            totalHeure: 5,
            pJournaliere: 400,
            enCour: 0,
            resteEntrer: 0,
            resteSortie: 0,
            totalWorkers: 2,
        },
    ];
    const r = resolveSuiviContext({
        contextDate: '2026-04-28',
        hourKey: 'h1000',
        suivis,
        planningEvents: [planA],
        filterChaine: 'ALL',
        filterModele: 'ALL',
    });
    assert.deepEqual(r.suggestedPlanningIds, ['pA']);
    assert.equal(r.conflict, false);
    assert.equal(r.suggestedModelId, 'm1');
}

{
    const suivis: SuiviData[] = [
        {
            id: 's1',
            planningId: 'pA',
            date: '2026-04-28',
            entrer: 0,
            sorties: { h1000: 1 },
            totalHeure: 1,
            pJournaliere: 400,
            enCour: 0,
            resteEntrer: 0,
            resteSortie: 0,
            totalWorkers: 1,
        },
        {
            id: 's2',
            planningId: 'pB',
            date: '2026-04-28',
            entrer: 0,
            sorties: { h1000: 2 },
            totalHeure: 2,
            pJournaliere: 400,
            enCour: 0,
            resteEntrer: 0,
            resteSortie: 0,
            totalWorkers: 1,
        },
    ];
    const r = resolveSuiviContext({
        contextDate: '2026-04-28',
        hourKey: 'h1000',
        suivis,
        planningEvents: [planA, planB],
        filterChaine: 'ALL',
        filterModele: 'ALL',
    });
    assert.equal(r.conflict, true);
    assert.equal(r.suggestedPlanningIds.length, 2);
}

{
    const suivis: SuiviData[] = [
        {
            id: 's1',
            planningId: 'pA',
            date: '2026-04-28',
            entrer: 0,
            sorties: { h1000: 1 },
            totalHeure: 1,
            pJournaliere: 400,
            enCour: 0,
            resteEntrer: 0,
            resteSortie: 0,
            totalWorkers: 1,
        },
    ];
    const r = resolveSuiviContext({
        contextDate: '2026-04-28',
        hourKey: 'h1000',
        suivis,
        planningEvents: [planA, planB],
        filterChaine: 'CHAINE 2',
        filterModele: 'ALL',
    });
    assert.deepEqual(r.suggestedPlanningIds, []);
}

// eslint-disable-next-line no-console
console.log('suiviContextResolver.test.ts OK');
