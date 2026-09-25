/**
 * Lancer: node --import tsx lib/dossierLocal.test.ts
 *
 * Le reste du module a besoin d'un vrai navigateur (File System Access API +
 * IndexedDB) : ce test verifie juste que Node degrade proprement, sans jeter.
 */
import assert from 'node:assert/strict';
import { estSupporte } from './dossierLocal';

assert.equal(estSupporte(), false, 'Node n a ni window ni showDirectoryPicker : jamais supporte');

console.log('dossierLocal: OK');
