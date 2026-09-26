/**
 * Lancer: node --import tsx lib/serieEtiquetage.test.ts
 *
 * La feuille « SERIE » de l'atelier : S*2 sur 82 plis donne deux paquets de S,
 * 1-82 puis 83-164, et la serie continue sur le matelas suivant.
 */
import assert from 'node:assert/strict';
import type { MatelasLine } from '../types';
import { paquetsSerie, piecesParChaine } from './serieEtiquetage';

const T = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const m = (id: string, numero: string, plis: number, ratios: Record<string, number>, extra: Partial<MatelasLine> = {}): MatelasLine =>
    ({ id, numero, plis, longTracee: 3.6, ratios, ...extra });

{
    const p = paquetsSerie([
        m('b', '2', 82, { M: 2 }),
        m('a', '1', 82, { S: 2 }),
        m('v', '3', 40, { S: 1 }, { tissu: 'vlieseline' }),
        m('c', '4', 86, { XS: 1, L: 1 }, { fait: true }),
        m('z', '5', 0, { S: 2 }),
    ], T);
    assert.deepEqual(p.map(x => [x.paquet, x.taille, x.debut, x.fin]), [
        ['1', 'S', 1, 82],
        ['1', 'S', 83, 164],
        ['2', 'M', 165, 246],
        ['2', 'M', 247, 328],
        ['4', 'XS', 329, 414],
        ['4', 'L', 415, 500],
    ], 'ordre des numeros, tailles dans l ordre de la commande, serie continue');
    assert.ok(p.every(x => x.plis === x.fin - x.debut + 1));
    assert.equal(p[4].fait, true);
    assert.equal(new Set(p.map(x => x.cle)).size, p.length, 'cles uniques');

    // Depart choisi.
    assert.equal(paquetsSerie([m('a', '1', 10, { S: 1 })], T, 501)[0].debut, 501);

    // Pieces par chaine (avec les pieces en plus/moins).
    const s = { saisies: { [p[0].cle]: { chaine: 'CHAINE 1' }, [p[1].cle]: { chaine: 'CHAINE 1', pieces: -2 }, [p[2].cle]: { chaine: 'CHAINE 2' } } };
    assert.deepEqual(piecesParChaine(p, s), { 'CHAINE 1': 162, 'CHAINE 2': 82 });
}

console.log('serieEtiquetage: OK');
