/**
 * Lancer: node --import tsx lib/equilibreMatieres.test.ts
 */
import assert from 'node:assert/strict';
import type { MatelasLine, OrdreCoupe } from '../types';
import { corrigerPlisFiges, equilibrerOrdre, proposerAjustement } from './equilibreMatieres';

const TAILLES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
let n = 0;
const ligne = (tissu: string, numero: string, plis: number, ratios: Record<string, number>, extra: Partial<MatelasLine> = {}): MatelasLine =>
    ({ id: `${tissu}-${numero}-${n++}`, tissu, numero, plis, longTracee: 1, ratios, ...extra });
const ordre = (lignes: MatelasLine[]): OrdreCoupe => ({
    refModele: 'X', longueurMatelas: 0, consommation: 0, nbrFeuilles: 0, nbrMatelas: 0, qteTotale: 0, status: 'EN_COURS',
    tissus: [{ id: 'principal', nom: 'Tissu' }, { id: 'VL', nom: 'Vlieseline', code: 'VL' }, { id: 'FO', nom: 'Doublure (foro)', code: 'FO' }],
    matelasLines: lignes,
});
const numeros = (xs: { numero: string }[]) => xs.map(x => x.numero);

// --- Le cahier de l'atelier (modele 7887) : deux lots, chaque matiere en face ---
{
    const lignes = [
        ligne('principal', '1', 50, { S: 1 }), ligne('principal', '2', 50, { M: 1 }), ligne('principal', '3', 50, { L: 1 }),
        ligne('principal', '4', 120, { XL: 1 }), ligne('principal', '5', 120, { S: 1 }),
        ligne('VL', '1', 50, { S: 1, M: 1 }), ligne('VL', '2', 50, { L: 1 }), ligne('VL', '3', 120, { XL: 1, S: 1 }),
        ligne('FO', '1', 50, { S: 1, M: 1, L: 1 }), ligne('FO', '2', 120, { XL: 1, S: 1 }),
    ];
    const eq = equilibrerOrdre(ordre(lignes), TAILLES);
    assert.equal(eq.lots.length, 2);
    const [a, b] = eq.lots;
    assert.deepEqual(numeros(a.matelas.principal), ['1', '2', '3']);
    assert.deepEqual(numeros(a.matelas.VL), ['1', '2']);
    assert.deepEqual(numeros(a.matelas.FO), ['1']);
    assert.equal(a.vetements, 150);
    assert.deepEqual(numeros(b.matelas.principal), ['4', '5']);
    assert.deepEqual(numeros(b.matelas.VL), ['3']);
    assert.deepEqual(numeros(b.matelas.FO), ['2']);
    assert.equal(b.vetements, 240);
    assert.equal(a.manque.length + b.manque.length, 0, 'plan equilibre');
    assert.equal(eq.vetements, 390);
    assert.equal(eq.ecartsPlan.length, 0);
    assert.equal(a.etat, 'a_faire');
    assert.deepEqual(a.retard, []);

    // Le tissu du lot 1 est coupe, pas la vlieseline ni le foro : ils sont en retard, rien n'est pret.
    for (const l of lignes.filter(x => x.tissu === 'principal' && ['1', '2', '3'].includes(x.numero!))) l.fait = true;
    const eq2 = equilibrerOrdre(ordre(lignes), TAILLES);
    assert.equal(eq2.lots[0].etat, 'en_cours');
    assert.deepEqual(eq2.lots[0].retard, ['VL', 'FO']);
    assert.deepEqual(eq2.lots[0].attente, { VL: { numeros: ['1', '2'], autres: [] }, FO: { numeros: ['1'], autres: [] } });
    assert.equal(eq2.lots[0].prets, 0);
    assert.equal(eq2.vetementsCoupes, 150);
    assert.equal(eq2.prets, 0);

    // Tout le lot 1 coupe : 150 vetements prets pour la production.
    for (const l of lignes.filter(x => x.tissu !== 'principal' && x.numero === '1' || x.tissu === 'VL' && x.numero === '2')) l.fait = true;
    const eq3 = equilibrerOrdre(ordre(lignes), TAILLES);
    assert.equal(eq3.lots[0].etat, 'coupe');
    assert.deepEqual(eq3.lots[0].retard, []);
    assert.equal(eq3.lots[0].prets, 150);
    assert.equal(eq3.prets, 150);
    assert.equal(eq3.parMatiere.VL.nbCoupes, 2);
    assert.equal(eq3.parMatiere.FO.nbCoupes, 1);
}

// --- Excel ZINTURA 7887 : 8 matelas de tissu S×2 face a un seul foro S×8 ---
{
    const lignes = [
        ...Array.from({ length: 8 }, (_, i) => ligne('principal', String(i + 1), 70, { S: 2 })),
        ...Array.from({ length: 4 }, (_, i) => ligne('principal', String(i + 9), 70, { M: 2 })),
        ligne('FO', '1', 140, { S: 8 }), ligne('FO', '2', 70, { M: 8 }),
    ];
    const eq = equilibrerOrdre(ordre(lignes), TAILLES);
    assert.equal(eq.lots.length, 2);
    assert.equal(eq.lots[0].matelas.principal.length, 8);
    assert.deepEqual(numeros(eq.lots[0].matelas.FO), ['1']);
    assert.equal(eq.lots[0].vetements, 1120);
    assert.equal(eq.lots[1].matelas.principal.length, 4);
    assert.deepEqual(numeros(eq.lots[1].matelas.FO), ['2']);
    assert.equal(eq.lots[1].vetements, 560);
    assert.equal(eq.lots[0].matelas.VL.length, 0, 'pas de vlieseline dans cet ordre');
}

// --- Un matelas coupe court : son reste (numero suivant) ferme le lot ouvert ---
{
    const lignes = [
        ligne('principal', '1', 80, { S: 2 }, { fait: true }),
        ligne('principal', '2', 82, { M: 2 }),
        ligne('principal', '3', 82, { L: 2 }),
        ligne('FO', '1', 82, { S: 2, M: 2 }),
        ligne('FO', '2', 82, { L: 2 }),
        ligne('principal', '4', 2, { S: 2 }), // le reste des 2 plis
    ];
    const eq = equilibrerOrdre(ordre(lignes), TAILLES);
    assert.equal(eq.lots.length, 2);
    assert.deepEqual(numeros(eq.lots[0].matelas.principal), ['1', '2']);
    assert.deepEqual(numeros(eq.lots[0].matelas.FO), ['1']);
    assert.deepEqual(numeros(eq.lots[1].matelas.principal), ['3', '4']);
    assert.deepEqual(numeros(eq.lots[1].matelas.FO), ['2']);
    assert.equal(eq.ecartsPlan.length, 0, 'avec le reste, le plan tombe juste');
}

// --- Ecart : 80 plis de tissu au lieu de 82, sans reste ---
{
    // Doublure S-M : on ne peut pas la corriger sans casser M -> pas de proposition.
    const a = [ligne('principal', '1', 80, { S: 2 }, { fait: true }), ligne('principal', '2', 82, { M: 2 }), ligne('FO', '1', 82, { S: 2, M: 2 })];
    const eqA = equilibrerOrdre(ordre(a), TAILLES);
    assert.equal(eqA.lots.length, 1);
    assert.deepEqual(eqA.ecartsPlan.map(e => [e.matiere, e.taille, e.delta]), [['FO', 'S', 4]]);
    assert.equal(eqA.lots[0].manque.length, 0, 'la doublure couvre (4 de trop), rien ne manque');
    assert.equal(proposerAjustement(eqA, 'FO'), null);

    // Doublure du meme melange : elle passe a 80 plis, plus d'ecart.
    const b = [ligne('principal', '1', 80, { S: 1, M: 1 }, { fait: true }), ligne('FO', '1', 82, { S: 1, M: 1 })];
    const eqB = equilibrerOrdre(ordre(b), TAILLES);
    assert.deepEqual(eqB.ecartsPlan.map(e => [e.taille, e.delta]), [['S', 2], ['M', 2]]);
    assert.deepEqual(eqB.lots[0].retard, ['FO']);
    const aj = proposerAjustement(eqB, 'FO');
    assert.ok(aj);
    assert.equal(aj!.plisAvant, 82);
    assert.equal(aj!.plisApres, 80);
    assert.deepEqual(aj!.reste, []);

    // Une doublure deja coupee ne se propose pas.
    const c = [ligne('principal', '1', 80, { S: 1 }, { fait: true }), ligne('FO', '1', 82, { S: 1 }, { fait: true })];
    assert.equal(proposerAjustement(equilibrerOrdre(ordre(c), TAILLES), 'FO'), null);
}

// --- Plan incomplet : la doublure n'a pas de XL ---
{
    const lignes = [ligne('principal', '1', 10, { S: 1 }), ligne('principal', '2', 10, { XL: 1 }), ligne('FO', '1', 10, { S: 1 })];
    const eq = equilibrerOrdre(ordre(lignes), TAILLES);
    assert.deepEqual(eq.ecartsPlan.map(e => [e.matiere, e.taille, e.delta]), [['FO', 'XL', -10]]);
    // Le XL n'empeche pas le lot S de se fermer.
    assert.equal(eq.lots.length, 2);
    assert.equal(eq.lots[0].manque.length + eq.lots[1].manque.length, 0, 'le foro ne coupe pas de XL : rien ne lui manque');
    // Un XL coupe compte pret : la doublure ne coupe pas de XL.
    lignes[1].fait = true;
    assert.equal(equilibrerOrdre(ordre(lignes), TAILLES).prets, 10);
}

// --- Les plis ne tombent jamais juste (WA33 : 100 plis de tissu, 99 de vlieseline) ---
{
    const lignes = [
        ...['1', '2', '3'].map(n => ligne('principal', n, 100, { '38': 1, '40': 1, '42': 3, '44': 1 })),
        ...['1', '2', '3'].map(n => ligne('VL', n, 100, { '38': 1, '40': 1 })),
        ...['4', '5', '6', '7'].map(n => ligne('VL', n, 99, { '42': 1, '44': 1 })),
        ...['8', '9', '10', '11', '12'].map(n => ligne('VL', n, 98, { '42': 2 })),
    ];
    const eq = equilibrerOrdre(ordre(lignes), ['38', '40', '42', '44']);
    assert.equal(eq.lots.length, 3, 'chaque matelas de tissu, avec ce qui le couvre');
    // Comme l'atelier l'a prevu : 38-40 + 42×2 + 42-44 face a chaque « 38-40-42×3-44 ».
    assert.deepEqual(numeros(eq.lots[0].matelas.VL), ['1', '4', '8']);
    assert.deepEqual(numeros(eq.lots[1].matelas.VL), ['2', '5', '9']);
    assert.deepEqual(numeros(eq.lots[2].matelas.VL), ['3', '6', '7', '10']);
    assert.deepEqual(numeros(eq.enPlus.VL), ['11', '12'], 'vlieseline dont le tissu n a pas besoin');
    assert.equal(eq.lots.every(l => l.manque.length === 0), true);
    // Tissu 1 coupe, sa vlieseline 1 et 4 aussi : il attend la 8 (en face) et la 5 (6 pieces, en face du lot 2).
    lignes[0].fait = true;
    for (const l of lignes.filter(x => x.tissu === 'VL' && ['1', '4'].includes(x.numero!))) l.fait = true;
    const eq2 = equilibrerOrdre(ordre(lignes), ['38', '40', '42', '44']);
    assert.deepEqual(eq2.lots[0].attente, { VL: { numeros: ['8'], autres: ['5'] } });
    assert.equal(eq2.lots[0].prets, 100 + 100 + 99 + 99, '38 et 40 complets, 99 en 42 et en 44');
}

// --- En salle, n'importe quel matelas du meme placement fait l'affaire : les coupes servent d'abord ---
{
    const lignes = [
        ligne('principal', '1', 10, { S: 1 }, { fait: true }), ligne('principal', '2', 10, { S: 1 }),
        ligne('FO', '1', 10, { S: 1 }), ligne('FO', '2', 10, { S: 1 }, { fait: true }),
    ];
    const eq = equilibrerOrdre(ordre(lignes), TAILLES);
    assert.deepEqual(numeros(eq.lots[0].matelas.FO), ['2'], 'le foro 2, deja coupe, couvre le tissu 1');
    assert.deepEqual(eq.lots[0].retard, []);
    assert.equal(eq.lots[0].prets, 10);
    // Tissu 2 coupe a son tour : il attend le foro 1 (son lot).
    lignes[1].fait = true;
    const eq2 = equilibrerOrdre(ordre(lignes), TAILLES);
    assert.deepEqual(eq2.lots[1].attente, { FO: { numeros: ['1'], autres: [] } });
}

// --- Ce que la chaine peut coudre, taille par taille ---
{
    const lignes = [
        ligne('principal', '1', 100, { S: 1, M: 1 }, { fait: true }), ligne('principal', '2', 100, { L: 1 }, { fait: true }),
        ligne('principal', '3', 50, { S: 1 }),
        ligne('VL', '1', 100, { S: 1 }, { fait: true }), ligne('VL', '2', 60, { M: 1 }, { fait: true }), ligne('VL', '3', 100, { L: 1 }),
        ligne('VL', '4', 50, { S: 1 }),
    ];
    const eq = equilibrerOrdre(ordre(lignes), TAILLES);
    const de = (t: string) => eq.parTaille.find(x => x.taille === t)!;
    assert.deepEqual(eq.parTaille.map(x => x.taille), ['S', 'M', 'L']);
    assert.equal(de('S').prevu, 150);
    assert.equal(de('S').coupe.principal, 100);
    assert.equal(de('S').prets, 100, 'tissu 100, vlieseline 100');
    assert.deepEqual(de('S').limite, [], 'rien ne retient la chaine : tissu et vlieseline au meme niveau');
    assert.equal(de('M').prets, 60, 'tissu M 100, vlieseline M 60 : la chaine ne coud que 60');
    assert.deepEqual(de('M').limite, ['VL'], 'la vlieseline retient le M');
    assert.equal(de('L').prets, 0, 'le tissu L est coupe, pas sa vlieseline');
    assert.deepEqual(de('L').limite, ['VL']);
    assert.equal(eq.prets, 100 + 60 + 0, 'le total des prets est la somme des tailles');
    assert.equal(de('S').coupe.FO, undefined, 'une matiere absente de l\'ordre n\'est pas comptee');
}

// --- Couleurs : comparees seulement si chaque matiere a les siennes ---
{
    const sansCouleurFO = [
        ligne('principal', '1', 10, { S: 1 }, { couleur: 'Rouge' }), ligne('principal', '2', 10, { S: 1 }, { couleur: 'Bleu' }),
        ligne('FO', '1', 20, { S: 1 }),
    ];
    const eq = equilibrerOrdre(ordre(sansCouleurFO), TAILLES);
    assert.equal(eq.parCouleur, false);
    assert.equal(eq.lots.length, 1, 'la doublure sans couleur couvre les deux couleurs');

    const avecCouleurs = [
        ligne('principal', '1', 10, { S: 1 }, { couleur: 'Rouge' }), ligne('principal', '2', 10, { S: 1 }, { couleur: 'Bleu' }),
        ligne('FO', '1', 10, { S: 1 }, { couleur: 'Bleu' }), ligne('FO', '2', 10, { S: 1 }, { couleur: 'Rouge' }),
    ];
    const eq2 = equilibrerOrdre(ordre(avecCouleurs), TAILLES);
    assert.equal(eq2.parCouleur, true);
    assert.equal(eq2.lots.length, 2);
    assert.deepEqual(numeros(eq2.lots[0].matelas.FO), ['2'], 'le foro rouge face au tissu rouge');
}

// --- Un matelas sans plis ou sans taille n'entre dans aucun lot ---
{
    const eq = equilibrerOrdre(ordre([ligne('principal', '1', 0, { S: 1 }), ligne('principal', '2', 5, {})]), TAILLES);
    assert.equal(eq.lots.length, 0);
    assert.equal(eq.vetements, 0);
}

// --- Plis corriges apres la coupe : la plage figee suit, sans chevaucher ---
{
    const serie = { figes: { 'a:S:0': { debut: 1, fin: 82 }, 'b:S:0': { debut: 83, fin: 164 } } };
    const moins = corrigerPlisFiges(serie, 'a', 80);
    assert.equal(moins.conflit, false);
    assert.deepEqual(moins.serie!.figes!['a:S:0'], { debut: 1, fin: 80 });
    assert.deepEqual(moins.serie!.figes!['b:S:0'], { debut: 83, fin: 164 });
    const plus = corrigerPlisFiges(serie, 'a', 84);
    assert.equal(plus.conflit, true);
    assert.deepEqual(plus.serie!.figes!['a:S:0'], { debut: 1, fin: 82 }, 'la plage ne mord pas sur celle du matelas suivant');
    const libre = corrigerPlisFiges(serie, 'b', 90);
    assert.equal(libre.conflit, false);
    assert.deepEqual(libre.serie!.figes!['b:S:0'], { debut: 83, fin: 172 });
}

console.log('equilibreMatieres : OK');
