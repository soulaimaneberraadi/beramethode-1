/**
 * Lancer: npx tsx lib/hpgl.test.ts
 *
 * L'enjeu de ces tests n'est pas la lecture — c'est la garantie de
 * non-alteration. Un trace client modifie par erreur, c'est un matelas perdu.
 */
import assert from 'node:assert/strict';
import {
    lireHpgl,
    injecterEtiquettes,
    trouverPointInsertion,
    decoderOctets,
    encoderOctets,
    UNITES_PAR_MM,
} from './hpgl';

const ETX = '\x03';

const TRACE =
    'IN;SP1;\n' +
    'PU;PA1000,1000;PD;PA5000,1000;PA5000,4000;PA1000,4000;PA1000,1000;PU;\n' +
    `PA2000,2000;SI0.3,0.5;LBDOS 9MIJA 4555 42${ETX};\n` +
    'PU;PA7000,1000;PD;PA9000,1000;PA9000,3000;PA7000,1000;PU;\n' +
    `PA7500,1800;LBMANCHE 42${ETX};\n` +
    'SP0;PG;';

// --- Lecture : les labels et leur position reelle ---
{
    const lu = lireHpgl(TRACE);
    assert.equal(lu.etiquettes.length, 2, 'deux pieces, deux labels');

    assert.equal(lu.etiquettes[0].texte, 'DOS 9MIJA 4555 42');
    assert.equal(lu.etiquettes[0].x, 2000);
    assert.equal(lu.etiquettes[0].y, 2000);
    assert.equal(lu.etiquettes[0].hauteurCm, 0.5);
    assert.equal(lu.etiquettes[0].largeurCm, 0.3);

    assert.equal(lu.etiquettes[1].texte, 'MANCHE 42');
    assert.equal(lu.etiquettes[1].x, 7500);
    assert.equal(lu.etiquettes[1].y, 1800);
    // SI reste actif tant qu'il n'est pas redefini.
    assert.equal(lu.etiquettes[1].hauteurCm, 0.5);
}

// --- Lecture : la geometrie, pour la previsualisation ---
{
    const lu = lireHpgl(TRACE);
    assert.equal(lu.polylignes.length, 2, 'deux contours fermes par PU');
    assert.equal(lu.cadre.minX, 1000);
    assert.equal(lu.cadre.maxX, 9000);
    assert.equal(lu.cadre.maxY, 4000);
}

// --- Mode relatif : PR deplace depuis la position courante ---
{
    const lu = lireHpgl(`PA100,100;PR;PD;PR50,50;PU;PA0,0;PR;LBX${ETX};`);
    // PA100,100 puis PR50,50 -> 150,150 ; puis PA0,0 remet a l'origine.
    assert.equal(lu.etiquettes[0].x, 0);
    assert.equal(lu.etiquettes[0].y, 0);
}

// --- DT : un terminateur different ne doit pas casser la lecture ---
{
    const lu = lireHpgl('DT#;PA10,20;LBPIECE A#;PU;');
    assert.equal(lu.etiquettes.length, 1);
    assert.equal(lu.etiquettes[0].texte, 'PIECE A');
    assert.equal(lu.etiquettes[0].x, 10);
}

// --- Le point d'insertion tombe avant la finalisation de page ---
{
    const p = trouverPointInsertion(TRACE);
    assert.equal(TRACE.slice(p), 'SP0;PG;', 'on insere avant SP0;PG;');
}

// --- LA garantie : aucun octet d'origine n'est touche ---
{
    const resultat = injecterEtiquettes(TRACE, [
        { x: 2000, y: 1500, texte: '66', hauteurCm: 2, largeurCm: 1.4 },
        { x: 7500, y: 1300, texte: '66', hauteurCm: 2, largeurCm: 1.4 },
    ]);

    const p = trouverPointInsertion(TRACE);
    assert.equal(resultat.slice(0, p), TRACE.slice(0, p), 'la tete du fichier est intacte');
    assert.equal(
        resultat.slice(resultat.length - (TRACE.length - p)),
        TRACE.slice(p),
        'la queue du fichier est intacte',
    );
    // Le fichier d'origine se reconstitue exactement en retirant le bloc ajoute.
    const bloc = resultat.slice(p, resultat.length - (TRACE.length - p));
    assert.equal(resultat.replace(bloc, ''), TRACE, 'le trace d\'origine est reconstituable');

    assert.ok(bloc.includes(`LB66${ETX}`), 'le numero est bien ecrit');
    assert.ok(bloc.includes('SI1.4,2'), 'la taille de caractere demandee est appliquee');
}

// --- Relire le fichier annote : les nouveaux labels sont lisibles et places ---
{
    const resultat = injecterEtiquettes(TRACE, [
        { x: 2000, y: 1500, texte: '66', hauteurCm: 2, largeurCm: 1.4 },
    ]);
    const lu = lireHpgl(resultat);
    const ajoutes = lu.etiquettes.filter(e => e.texte === '66');
    assert.equal(ajoutes.length, 1);
    assert.equal(ajoutes[0].x, 2000);
    assert.equal(ajoutes[0].y, 1500);
    // Les labels d'origine sont toujours la, inchanges.
    assert.equal(lu.etiquettes.filter(e => e.texte === 'DOS 9MIJA 4555 42').length, 1);
}

// --- Rien a injecter : le fichier ressort identique ---
{
    assert.equal(injecterEtiquettes(TRACE, []), TRACE);
}

// --- Les sequences d'echappement pilote ne perturbent pas la lecture ---
{
    const lu = lireHpgl(`\x1b.(;\x1b.I81;;17:IN;PA10,10;LBOK${ETX};`);
    assert.equal(lu.etiquettes.length, 1);
    assert.equal(lu.etiquettes[0].texte, 'OK');
}

// --- Conversion d'unites ---
{
    assert.equal(1000 / UNITES_PAR_MM, 25, '1000 unites = 25 mm');
}

// --- Echelle IP/SC : ce que valent reellement les coordonnees du fichier ---
{
    // En-tete reel des traces de placement recus des clients.
    const lu = lireHpgl('IN;IP0,0,1016,1016;SC0,1000,0,1000;SP1;PU0,0;PD30316,0;PU;');
    // 1016 unites tracantes pour 1000 unites fichier -> 1 unite = 0,0254 mm.
    assert.ok(Math.abs(lu.unitesParMm - 39.3700787) < 1e-4, `echelle inattendue: ${lu.unitesParMm}`);
    // Controle sur le chiffre imprime en en-tete du trace : LO = 77,01 cm.
    const longueurCm = 30316 / lu.unitesParMm / 10;
    assert.ok(Math.abs(longueurCm - 77.0) < 0.05, `longueur inattendue: ${longueurCm}`);
}

// --- Sans SC, les coordonnees sont deja des unites tracantes ---
{
    const lu = lireHpgl('IN;SP1;PU0,0;PD400,0;PU;');
    assert.equal(lu.unitesParMm, UNITES_PAR_MM);
}

// --- DI : l'orientation d'une piece retournee est retenue puis restituee ---
{
    const lu = lireHpgl(`DI-1.000,0.000;PA100,100;LBDOS 42${ETX};`);
    assert.equal(lu.etiquettes[0].directionX, -1);
    assert.equal(lu.etiquettes[0].directionY, 0);

    const sortie = injecterEtiquettes('IN;PU;', [
        { x: 100, y: 80, texte: '66', hauteurCm: 2, largeurCm: 1.4, directionX: -1, directionY: 0 },
    ]);
    assert.ok(sortie.includes('DI-1,0;'), 'le numero suit l\'orientation de la piece');
}

// --- LO : l'origine du texte est retenue (les traces reels ecrivent en LO5) ---
{
    const lu = lireHpgl(`DI-1.000,0.000;SI0.423,0.635;LO5;PU15158,12204;LBDOS 42${ETX};`);
    assert.equal(lu.etiquettes[0].origine, 5, 'le texte d\'origine est centre sur son point');
    assert.equal(lu.etiquettes[0].plume, 1);

    // Le bloc injecte ecrit lui aussi centre, sinon x,y ne serait pas le milieu.
    const sortie = injecterEtiquettes('IN;PU;', [
        { x: 100, y: 80, texte: '66', hauteurCm: 3, largeurCm: 2, plume: 2 },
    ]);
    assert.ok(sortie.includes('LO5;'), 'le numero est centre sur le point vise');
    assert.ok(sortie.includes('SP2;'), 'le numero reprend la plume de la piece');
}

// --- Aller-retour octets : tout octet survit, y compris au-dessus de 127 ---
{
    const brut = new Uint8Array([0x49, 0x4e, 0x3b, 0x00, 0x7f, 0x80, 0xb0, 0xff, 0x03]);
    const texte = decoderOctets(brut.buffer);
    const retour = encoderOctets(texte);
    assert.deepEqual(Array.from(retour), Array.from(brut), 'decoder puis encoder rend les octets exacts');
}

console.log('hpgl: OK');
