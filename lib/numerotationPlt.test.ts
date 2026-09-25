/**
 * Lancer: node --import tsx lib/numerotationPlt.test.ts
 *
 * Sur un vrai trace de l'atelier quand il est la (sinon ignore) : le
 * fichier sortant commence par le trace d'origine octet pour octet, et une
 * piece posee a la main garde exactement la place donnee.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REGLAGES_NUMERO_DEFAUT, alertesPoses, analyserOctets, numeroterPlt, posesNumero } from './numerotationPlt';
import { lireEntete } from './ordreCoupe';

const CHEMIN = 'C:/Users/HP/Desktop/SOULAIMANE HPGL/201-SHIRT-40000.PLT';

if (!fs.existsSync(CHEMIN)) {
    console.log('numerotationPlt: trace de reference absent, test ignore');
} else {
    const b = fs.readFileSync(CHEMIN);
    const buffer = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const a = analyserOctets(buffer);
    assert.ok(a.candidats.length > 0, 'des pieces a numeroter');

    const entete = lireEntete(a.entete);
    assert.equal(entete.laizeCm, 155, 'la laize se lit dans l en-tete du meme fichier');
    assert.ok(entete.longueurM && entete.longueurM > 0.9 && entete.longueurM < 1.1);

    const r = { ...REGLAGES_NUMERO_DEFAUT };
    const sortie = numeroterPlt(a, '77', r)!;
    assert.ok(sortie, 'un fichier sort');
    const original = new Uint8Array(buffer);
    // Tout l'original se retrouve, dans l'ordre : seul un bloc est insere avant la fin de page.
    let debutCommun = 0;
    while (debutCommun < original.length && original[debutCommun] === sortie[debutCommun]) debutCommun++;
    const finOriginal = original.length - debutCommun;
    assert.deepEqual(
        Array.from(sortie.subarray(sortie.length - finOriginal)),
        Array.from(original.subarray(debutCommun)),
        'la fin du trace d origine est intacte',
    );
    assert.ok(sortie.length > original.length);
    assert.ok(new TextDecoder('latin1').decode(sortie.subarray(debutCommun, sortie.length - finOriginal)).includes('LB77'));

    // Piece posee a la main : exactement a l'ancrage + le deplacement demande.
    const premier = a.candidats[0];
    const libre = { ...r, ajustements: { [String(premier.index)]: { x: 12, y: -8, libre: true } } };
    const pose = posesNumero(a, '77', libre).find(p => p.index === premier.index)!;
    const u = a.lecture.unitesParMm;
    assert.ok(Math.abs(pose.placement.x - (premier.etiquette.x + 12 * u)) < 1e-6);
    assert.ok(Math.abs(pose.placement.y - (premier.etiquette.y - 8 * u)) < 1e-6);

    // Hauteur propre a une piece, et piece exclue.
    const grand = posesNumero(a, '77', { ...r, ajustements: { [String(premier.index)]: { x: 0, y: 0, hauteurCm: 1.5 } } })
        .find(p => p.index === premier.index)!;
    assert.ok(grand.placement.hauteurCm <= 1.5);
    const sans = posesNumero(a, '77', { ...r, exclus: [premier.index] });
    assert.ok(!sans.some(p => p.index === premier.index), 'piece exclue : pas de numero');

    const al = alertesPoses(posesNumero(a, '77', r));
    assert.ok(al.reduit >= 0 && al.force >= 0);
    console.log(`numerotationPlt: OK (${a.candidats.length} pieces)`);
}
