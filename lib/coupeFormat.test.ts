/**
 * Lancer: node --import tsx lib/coupeFormat.test.ts
 */
import assert from 'node:assert/strict';
import { jjmm, localeDe, normNom } from './coupeFormat';

// --- Jour court, sans fuseau ---
assert.equal(jjmm('2026-10-24'), '24/10');
assert.equal(jjmm('2026-10-24T09:30:00'), '24/10');
assert.equal(jjmm(''), '');
assert.equal(jjmm(undefined), '');
assert.equal(jjmm('24/10/2026'), '', 'seul le format AAAA-MM-JJ est lu');

// --- Locale des dates : toutes les langues de l'application ---
assert.equal(localeDe('fr'), 'fr-FR');
assert.equal(localeDe('ar'), 'ar-MA');
assert.equal(localeDe('en'), 'en-GB');
assert.equal(localeDe('es'), 'es-ES');
assert.equal(localeDe('pt'), 'pt-PT');
assert.equal(localeDe('tr'), 'tr-TR');
assert.equal(localeDe(undefined), 'fr-FR');

// --- Nom de chaine : ni casse, ni accents, ni espaces autour ---
assert.equal(normNom('  Chaîne 3 '), 'chaine 3');
assert.equal(normNom('CHAINE 3'), normNom('Chaîne 3'));
assert.equal(normNom(undefined), '');
assert.equal(normNom(null), '');
assert.notEqual(normNom('CHAINE 3'), normNom('CHAINE 30'));

console.log('coupeFormat : OK');
