/**
 * Lancer: npx tsx lib/sageTimeRules.test.ts
 */
import assert from 'node:assert/strict';
import {
    ancrageJourneeEntree,
    getSageTimesForHeuresCalc,
    isNightPair,
    roundSageHeure,
    sageCreneauWarning,
} from './sageTimeRules';

const eq = (a: string | null, b: string) => assert.equal(a, b, `${a} !== ${b}`);

// 8:05 → 8:00 (arrondi 15)
eq(roundSageHeure('08:05', 15, 'nearest'), '08:00');

// 5:55 → 6:00
eq(roundSageHeure('05:55', 15, 'nearest'), '06:00');

// 22:00 / 06:00 — nuit, pas d’ancrage 6:00 sur l’entrée
{
    const t = getSageTimesForHeuresCalc('22:00', '06:00', null, null, { roundMinutes: 15, workdayStart: '06:00' });
    eq(t.entree, '22:00');
    eq(t.sortie, '06:00');
    assert.equal(isNightPair('22:00', '06:00'), true);
    assert.equal(ancrageJourneeEntree('22:00', '06:00', '06:00'), '22:00');
}

// Jour : 5:40 (quart 15, plus proche → 5:45) + ancrage 6:00
{
    const t = getSageTimesForHeuresCalc('05:40', '14:00', null, null, {
        roundMinutes: 15,
        workdayStart: '06:00',
    });
    eq(t.entree, '06:00');
}

// Cohérence avertisseur topologie
assert.equal(
    sageCreneauWarning('22:00', '06:00', '22:00', '06:00'),
    false,
    'même nuit SAGE / réel',
);
assert.equal(sageCreneauWarning('08:05', '12:00', '08:00', '12:00'), false);

// eslint-disable-next-line no-console
console.log('sageTimeRules.test.ts OK');
