/**
 * Lancer: node --import tsx lib/placementNumero.test.ts
 *
 * Ce qui compte ici : le numero ne doit jamais sortir de sa piece ni recouvrir
 * le nom d'origine. Une piece etroite doit donc le voir retrecir, pas deborder.
 */
import assert from 'node:assert/strict';
import {
    contoursDePieces,
    contourContenant,
    pointDansContour,
    empriseTexte,
    placerNumero,
    type Contour,
} from './placementNumero';
import type { EtiquetteHpgl, Polyligne } from './hpgl';

const UPM = 39.3700787; // unites par mm, echelle reelle des traces recus

const rect = (x0: number, y0: number, x1: number, y1: number): Polyligne => ({
    points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]],
});

const etiquette = (x: number, y: number, texte: string, directionX = 1): EtiquetteHpgl => ({
    debut: 0, fin: 0, texte, x, y,
    largeurCm: 0.423, hauteurCm: 0.635,
    directionX, directionY: 0, plume: 1, origine: 5,
});

const dansContour = (c: Contour, r: { minX: number; minY: number; maxX: number; maxY: number }) =>
    pointDansContour(c, r.minX, r.minY) && pointDansContour(c, r.maxX, r.maxY) &&
    pointDansContour(c, r.minX, r.maxY) && pointDansContour(c, r.maxX, r.minY);

// --- Le bord du tissu n'est pas une piece ---
{
    const contours = contoursDePieces([
        rect(0, 0, 100000, 50000),   // bord matiere, le plus grand
        rect(1000, 1000, 20000, 20000),
        rect(30000, 1000, 40000, 8000),
    ]);
    assert.equal(contours.length, 2, 'le bord matiere est ecarte');
    assert.ok(contours.every(c => c.aire < 100000 * 50000));
}

// --- Une polyligne ouverte (cran, ligne interne) n'est pas une piece ---
{
    const contours = contoursDePieces([
        rect(0, 0, 100000, 50000),
        rect(1000, 1000, 20000, 20000),
        { points: [[5000, 5000], [5000, 9000]] },
    ]);
    assert.equal(contours.length, 1);
}

// --- On retient la plus petite piece contenant le point ---
{
    const contours = contoursDePieces([
        rect(0, 0, 100000, 50000),
        rect(1000, 1000, 40000, 40000),
        rect(2000, 2000, 8000, 8000),
    ]);
    const c = contourContenant(contours, 5000, 5000);
    assert.ok(c);
    assert.equal(c!.aire, 6000 * 6000, 'la plus petite piece l\'emporte');
}

// --- Grande piece : la taille demandee est tenue, sans retouche ---
{
    const grande = contoursDePieces([rect(0, 0, 400000, 400000), rect(0, 0, 200000, 200000)])[0];
    const p = placerNumero({
        etiquette: etiquette(100000, 100000, 'DOS 9MIJA 42'),
        contour: grande,
        texte: '66',
        hauteurCm: 2, largeurCm: 1.4,
        decalageMm: -15,
        unitesParMm: UPM,
    });
    assert.equal(p.statut, 'ok');
    assert.equal(p.hauteurCm, 2, 'aucune reduction sur une grande piece');
}

// --- Petite piece : le numero retrecit au lieu de deborder ---
{
    // Poignet : 60 mm x 40 mm. Un 2 cm de haut n'y tient pas avec sa marge.
    const petite = contoursDePieces([
        rect(0, 0, 400000, 400000),
        rect(0, 0, Math.round(60 * UPM), Math.round(40 * UPM)),
    ])[0];
    const p = placerNumero({
        etiquette: etiquette(Math.round(30 * UPM), Math.round(20 * UPM), 'POIGNET 42'),
        contour: petite,
        texte: '66',
        hauteurCm: 2, largeurCm: 1.4,
        decalageMm: -15,
        unitesParMm: UPM,
    });
    assert.ok(p.hauteurCm < 2, `le numero aurait du retrecir (${p.hauteurCm} cm)`);
    const emprise = empriseTexte(p.x, p.y, 2, p.largeurCm, p.hauteurCm, 1, UPM, 5);
    assert.ok(dansContour(petite, emprise), 'le numero reste dans la piece');
}

// --- Le numero ne recouvre jamais le texte d'origine ---
{
    const piece = contoursDePieces([
        rect(0, 0, 400000, 400000),
        rect(0, 0, Math.round(300 * UPM), Math.round(200 * UPM)),
    ])[0];
    const e = etiquette(Math.round(100 * UPM), Math.round(100 * UPM), 'DOS 9MIJA 42');
    const p = placerNumero({
        etiquette: e,
        contour: piece,
        texte: '66',
        hauteurCm: 2, largeurCm: 1.4,
        decalageMm: -15,
        unitesParMm: UPM,
    });
    const numero = empriseTexte(p.x, p.y, 2, p.largeurCm, p.hauteurCm, 1, UPM, 5);
    const origine = empriseTexte(e.x, e.y, e.texte.length, e.largeurCm!, e.hauteurCm!, 1, UPM, 5);
    const chevauche = !(numero.maxX < origine.minX || numero.minX > origine.maxX ||
        numero.maxY < origine.minY || numero.minY > origine.maxY);
    assert.ok(!chevauche, 'le numero mord sur le nom de la piece');
}

// --- Piece retournee (DI -1,0) : le numero part de l'autre cote ---
{
    const piece = contoursDePieces([
        rect(0, 0, 400000, 400000),
        rect(0, 0, Math.round(300 * UPM), Math.round(200 * UPM)),
    ])[0];
    const e = etiquette(Math.round(150 * UPM), Math.round(100 * UPM), 'DOS 42', -1);
    const p = placerNumero({
        etiquette: e,
        contour: piece,
        texte: '66',
        hauteurCm: 2, largeurCm: 1.4,
        decalageMm: -15,
        unitesParMm: UPM,
    });
    const emprise = empriseTexte(p.x, p.y, 2, p.largeurCm, p.hauteurCm, -1, UPM, 5);
    assert.ok(dansContour(piece, emprise), 'le numero reste dans la piece retournee');
    assert.ok(p.y > e.y, 'sur une piece retournee, le decalage part dans l\'autre sens');
}

// --- Ajustement manuel : l'operateur garde le dernier mot ---
{
    const piece = contoursDePieces([
        rect(0, 0, 400000, 400000),
        rect(0, 0, Math.round(300 * UPM), Math.round(200 * UPM)),
    ])[0];
    const e = etiquette(Math.round(100 * UPM), Math.round(100 * UPM), 'DOS 42');
    const base = placerNumero({
        etiquette: e, contour: piece, texte: '66',
        hauteurCm: 2, largeurCm: 1.4, decalageMm: -15, unitesParMm: UPM,
    });
    const bouge = placerNumero({
        etiquette: e, contour: piece, texte: '66',
        hauteurCm: 2, largeurCm: 1.4, decalageMm: -15, unitesParMm: UPM,
        ajustementXmm: 10, ajustementYmm: -5,
    });
    assert.ok(Math.abs((bouge.x - base.x) - 10 * UPM) < 1, 'le decalage X manuel est applique');
}

// --- Sans contour reconnu, on pose quand meme et on le signale ---
{
    const p = placerNumero({
        etiquette: etiquette(1000, 1000, 'X'),
        contour: null,
        texte: '66',
        hauteurCm: 2, largeurCm: 1.4,
        decalageMm: -15,
        unitesParMm: UPM,
    });
    assert.equal(p.statut, 'force');
    assert.equal(p.hauteurCm, 2);
}

console.log('placementNumero: OK');
