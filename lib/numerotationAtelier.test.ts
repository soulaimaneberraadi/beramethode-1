/**
 * Lancer: node --import tsx lib/numerotationAtelier.test.ts
 *
 * Les traces tels que le client les envoie : deux ou trois lignes de texte
 * dans chaque piece (« XS A » puis « 4-57PHRTE-BAJDE »), un en-tete coupe en
 * deux labels (« LA= » + « 148.00CM »), plusieurs modeles dans la liste des
 * tailles. Trois regles :
 *   - UN numero par piece, jamais un par ligne de texte ;
 *   - chaque numero est ecrit dans le flux de sa piece, pas en bloc a la fin ;
 *   - le trace d'origine ressort octet pour octet, dans l'ordre, et ses textes
 *     s'ecrivent a la meme place et a la meme taille qu'avant.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decoderOctets, lireHpgl } from './hpgl';
import { REGLAGES_NUMERO_DEFAUT, alertesPoses, analyserOctets, analyserTexte, numeroterPlt, posesNumero, texteNumero } from './numerotationPlt';
import { lireEntete } from './ordreCoupe';

const ETX = '\x03';

// Cadre du placement, deux pieces carrees, deux lignes de texte par piece, en-tete coupe.
const TRACE =
    'IN;\nIP0,0,1016,1016;\nSC0,1000,0,1000;\n' +
    'SP1;PU0,0;PD30000,0,30000,20000,0,20000,0,0;PU;\n' +
    `DI1.000,0.000;SI0.422,0.633;LO5;PU5000,10000;LBXS A${ETX}PU5000,9600;LB4-57PHRTE-BAJDE BAJDE${ETX}\n` +
    'PU1000,1000;PD9000,1000,9000,19000,1000,19000,1000,1000;PU;\n' +
    'PU11000,1000;PD29000,1000,29000,19000,11000,19000,11000,1000;PU;\n' +
    `DI-1.000,0.000;PU20000,10000;LBL D${ETX}PU20000,10400;LB4-57PHRTE-FORES FORES${ETX}\n` +
    `DI1.000,0.000;SI0.299,0.448;LO1;PU12,20400;LBHAMPTON . MODELE:TAIL/QTE:1384-CO-XS:XS/1,1384-CO-L:L/1;. LA=${ETX}LB148.00CM . LO=6${ETX}LBM 41.15CM . E=21.28%. DATE${ETX}\n` +
    'PU29000,20400;';

// --- Un numero par piece ---
const a = analyserTexte(TRACE);
assert.equal(a.candidats.length, 2, 'deux pieces : deux numeros, pas quatre');
assert.deepEqual(a.candidats.map(c => c.etiquette.texte), ['XS A', 'L D'], 'la ligne de la taille porte le numero');

// --- En-tete recolle, toutes les tailles lues ---
const e = lireEntete(a.entete);
assert.deepEqual(e.tailles, { XS: 1, L: 1 }, 'les deux modeles de la liste comptent');
assert.equal(e.laizeCm, 148, 'LA= puis 148.00CM dans deux labels');
assert.ok(Math.abs(e.longueurM! - 6.4115) < 1e-9, String(e.longueurM));
assert.equal(e.efficience, 21.28);
assert.deepEqual(lireEntete(['MODELE:TAIL/QTE:4-56RNZ:S/10,4-56RNZ:S/10,4-56RNZ:S/4,.']).tailles, { S: 24 });
assert.deepEqual(lireEntete(['MODELE:TAIL/QTE:4-57PHR:XS/1,S/1,M/1,L/1,XL/1;']).tailles, { XS: 1, S: 1, M: 1, L: 1, XL: 1 });

// --- Texte ecrit : numero + code matiere ---
assert.equal(texteNumero('77', { format: 'nu', modele: '{n} {code}' }, { code: 'TE' }), '77 TE');
assert.equal(texteNumero('77', { format: 'nu', modele: '{n} {code}' }, { code: 'VSLIN' }), '77 VSLIN');
assert.equal(texteNumero('77', { format: 'nu', modele: '{n} {code}' }, {}), '77', 'sans code : pas d espace orphelin');
assert.equal(texteNumero('77', { format: 'parentheses', modele: '{code}-{n}' }, { code: 'FO' }), 'FO-(77)');
assert.equal(texteNumero('77', { format: 'nu' }), '77', 'modele absent = le numero seul');

// --- Sortie : numeros dans le flux de chaque piece, original intact ---
const r = { ...REGLAGES_NUMERO_DEFAUT, modele: '{n} {code}' };
const sortie = numeroterPlt(a, '77', r, { code: 'TE' })!;
assert.ok(sortie, 'un fichier sort');
const texte = decoderOctets(sortie.buffer);
assert.equal(texte.split(`LB77 TE${ETX}`).length - 1, 2, 'deux numeros, un par piece');

// Chaque numero precede le texte de sa piece (et non un bloc apres la derniere piece).
const posNumeros = [...texte.matchAll(/LB77 TE/g)].map(m => m.index!);
assert.ok(posNumeros[0] < texte.indexOf('LBXS A'), 'numero de la 1re piece ecrit avant son texte');
assert.ok(posNumeros[1] < texte.indexOf('LBL D') && posNumeros[1] > texte.indexOf('LBXS A'), 'numero de la 2e piece dans son flux');
assert.ok(posNumeros[1] < texte.indexOf('LBHAMPTON'), 'rien apres l en-tete');
assert.ok(!texte.includes(';;'), 'pas de commande vide');
assert.ok(!/SL/.test(texte), 'pas de SL quand le numero est droit');

// Tout l'original, dans l'ordre (seules des commandes sont inserees entre les siennes).
let k = 0;
for (let i = 0; i < texte.length && k < TRACE.length; i++) if (texte[i] === TRACE[k]) k++;
assert.equal(k, TRACE.length, 'chaque octet d origine est la, dans l ordre');

// Les textes d'origine s'ecrivent exactement comme avant : meme place, meme taille, meme sens, meme origine.
const avant = lireHpgl(TRACE).etiquettes;
const apres = lireHpgl(texte).etiquettes.filter(x => !x.texte.startsWith('77'));
assert.equal(apres.length, avant.length);
for (let i = 0; i < avant.length; i++) {
    for (const cle of ['texte', 'x', 'y', 'largeurCm', 'hauteurCm', 'directionX', 'directionY', 'origine', 'plume'] as const) {
        assert.equal(apres[i][cle], avant[i][cle], `${avant[i].texte} : ${cle} inchange`);
    }
}
// Et le numero, lui, a sa propre taille, dans le sens de sa piece, centre (LO5).
const numeros = lireHpgl(texte).etiquettes.filter(x => x.texte === '77 TE');
assert.equal(numeros.length, 2);
assert.ok(numeros.every(x => (x.hauteurCm ?? 0) > 0 && (x.hauteurCm ?? 0) <= r.hauteurCm), 'taille du numero, pas celle du texte d origine');
assert.equal(numeros[1].directionX, -1, 'piece retournee : numero retourne aussi');
assert.ok(numeros.every(x => x.origine === 5));

// Gras : deux passages, toujours dans la piece.
const gras = decoderOctets(numeroterPlt(a, '77', { ...r, gras: true }, { code: 'TE' })!.buffer);
assert.equal(gras.split(`LB77 TE${ETX}`).length - 1, 4);

// --- Piece en V (nom pose au centre, dans le vide entre les bras) et piece tracee en morceaux ---
{
    const V =
        'IN;IP0,0,1016,1016;SC0,1000,0,1000;SP1;PU0,0;PD90000,0,90000,40000,0,40000,0,0;PU;\n' +
        // V : deux bras de ~10 cm, le centre (40000,20000) est dans le vide
        'PU2000,20000;PD80000,38000,80000,30000,12000,20000,80000,10000,80000,2000,2000,20000;PU;\n' +
        `DI1.000,0.000;SI0.3,0.45;LO5;PU40000,20000;LBL1 BRAS${ETX}\n` +
        // carre trace en deux morceaux, crayon leve entre les deux (bouts a 0,2 mm)
        'PU82000,5000;PD89000,5000,89000,15000;PU89000,15008;PD82000,15000,82000,5000;PU;\n' +
        `PU85500,10000;LBS A${ETX}PU85500,9600;LBS${ETX}PU85500,9200;LBA${ETX}\n`;
    const av = analyserTexte(V);
    assert.equal(av.candidats.length, 2, 'une piece en V + un carre en morceaux');
    const petit = { ...REGLAGES_NUMERO_DEFAUT, hauteurCm: 1.5, largeurCm: 1 };
    const poses = posesNumero(av, '185', petit);
    assert.equal(poses.length, 2);
    assert.ok(poses.every(p => p.placement.statut !== 'force'), 'aucun numero pose a l aveugle');
    // Le numero de la piece en V est dans un bras, pas dans le vide ou etait son nom.
    const brasV = poses.find(p => p.etiquette.texte === 'L1 BRAS')!.placement;
    assert.ok(Math.abs(brasV.y - 20000) > 3000 || brasV.x > 70000, `numero du V hors du vide (${Math.round(brasV.x)},${Math.round(brasV.y)})`);
    // Le carre en morceaux est reconnu comme une piece.
    assert.ok(av.contours.some(c => c.points.some(([x, y]) => x === 89000 && y === 15000)), 'contour recolle');
}

// --- Petite piece : le numero seul plutot que tout le texte qui deborde ---
{
    const P = 'IN;IP0,0,1016,1016;SC0,1000,0,1000;SP1;PU0,0;PD20000,0,20000,10000,0,10000,0,0;PU;\n' +
        'PU1000,1000;PD2400,1000,2400,1500,1000,1500,1000,1000;PU;\n' +
        `DI1.000,0.000;SI0.1,0.15;LO5;PU1700,1250;LBXS${ETX}\n`;
    const ap = analyserTexte(P);
    const [pose] = posesNumero(ap, '185', { ...REGLAGES_NUMERO_DEFAUT, format: 'parentheses', modele: '{n}-{code}' }, { code: 'TE' });
    assert.equal(pose.placement.texte, '185', 'piece de 3,5 cm : « 185 » au lieu de « (185)-TE »');
    const sortie = decoderOctets(numeroterPlt(ap, '185', { ...REGLAGES_NUMERO_DEFAUT, format: 'parentheses', modele: '{n}-{code}' }, { code: 'TE' })!.buffer);
    assert.ok(sortie.includes(`LB185${ETX}`) && !sortie.includes('(185)-TE'), 'le fichier porte le texte court');
}

// --- Vrais traces de l'atelier, s'ils sont sur ce poste (jamais copies dans le depot) ---
const DOSSIER = 'C:/Users/HP/Desktop/New folder';
if (fs.existsSync(DOSSIER)) {
    let fichiers = 0;
    for (const nom of fs.readdirSync(DOSSIER).filter(f => /\.plt$/i.test(f))) {
        const b = fs.readFileSync(`${DOSSIER}/${nom}`);
        const buffer = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
        const an = analyserOctets(buffer);
        const tete = lireEntete(an.entete);
        assert.ok(tete.tailles && Object.keys(tete.tailles).length > 0, `${nom} : tailles lues`);
        assert.ok(tete.laizeCm && tete.laizeCm > 100, `${nom} : laize lue (${tete.laizeCm})`);
        const poses = posesNumero(an, '77', r, { code: 'TE' });
        const parPiece = new Set(poses.map(p => p.index));
        assert.equal(parPiece.size, an.candidats.length, `${nom} : un numero par piece`);
        assert.equal(alertesPoses(poses).force, 0, `${nom} : aucun numero pose hors de sa piece`);
        const out = numeroterPlt(an, '77', r, { code: 'TE' });
        if (out) {
            const txt = decoderOctets(out.buffer);
            let j = 0;
            for (let i = 0; i < txt.length && j < an.source.length; i++) if (txt[i] === an.source[j]) j++;
            assert.equal(j, an.source.length, `${nom} : trace d origine intact`);
        }
        fichiers++;
    }
    console.log(`numerotationAtelier: ${fichiers} traces reels verifies`);
}

console.log('numerotationAtelier: OK');
