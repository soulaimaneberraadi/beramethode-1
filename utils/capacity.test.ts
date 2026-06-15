/**
 * Lancer: npx tsx utils/capacity.test.ts
 */
import assert from 'node:assert/strict';
import type { PlanningEvent } from '../types';
import { dayLoadRatio, maxDayLoadRatioInSpan, getChainDailyCapacity, overloadDaysInSpan } from './capacity';

const events: PlanningEvent[] = [
    {
        id: '1',
        modelId: 'm',
        chaineId: 'C1',
        dateLancement: '2026-05-01',
        dateExport: '2026-05-03',
        startDate: '2026-05-01',
        estimatedEndDate: '2026-05-03',
        qteTotal: 300,
        status: 'IN_PROGRESS',
    },
];

const r = dayLoadRatio('2026-05-02', events, 'C1', 100);
assert.ok(r > 0);

const peak = maxDayLoadRatioInSpan(events, 'C1', 100, '2026-05-01', '2026-05-03');
assert.ok(peak >= r);

assert.equal(getChainDailyCapacity({ 'CHAINE 1': 500 }, 'CHAINE 1', 1000), 500);
assert.equal(getChainDailyCapacity(undefined, 'CHAINE 1', 1000), 1000);

const heavy: PlanningEvent[] = [
    {
        id: 'h1',
        modelId: 'm',
        chaineId: 'CX',
        dateLancement: '2026-06-01',
        dateExport: '2026-06-01',
        startDate: '2026-06-01',
        estimatedEndDate: '2026-06-01',
        qteTotal: 500,
        status: 'READY',
    },
];
const badDays = overloadDaysInSpan(heavy, 'CX', 100, '2026-06-01', '2026-06-01');
assert.equal(badDays.length, 1);
assert.ok(badDays[0].ratio > 1);

console.log('capacity.test.ts OK');
