/**
 * Lancer: node --import tsx lib/appliquerImport.test.ts
 */
import assert from 'node:assert/strict';
import type { OrdreCoupe } from '../types';
import { appliquerImport } from './appliquerImport';
import type { FeuilleImportee } from './importCoupeExcel';

const vide: OrdreCoupe = { refModele: '', longueurMatelas: 0, consommation: 0, nbrFeuilles: 0, nbrMatelas: 0, qteTotale: 0, status: 'EN_PREPARATION' };

const repartos: FeuilleImportee = {
    feuille: 'REPARTO LANOCORTE', format: 'repartos', client: 'HAMPTON', modele: '8264/156/605', pedido: '65531',
    tailles: ['XS', 'S', 'M', 'L', 'XL'],
    quantites: { XS: 1105, S: 1265, M: 1105, L: 630, XL: 0 },
    matieres: [
        {
            nom: 'TELA', code: 'TE', principal: true, matelas: [], placements: [
                { code: 'TE-01', taillesTexte: 'XS A L', ratiosTexte: '1 DE CADA', ratios: { XS: 1, S: 1, M: 1, L: 1 }, longueurM: 4.0473, plis: 630 },
                { code: 'TE-02', taillesTexte: 'XS-M', ratiosTexte: '2 DE CADA', ratios: { XS: 2, M: 2 }, longueurM: 3.9476, plis: 238 },
                { code: 'TE-04', taillesTexte: 'S - M', ratiosTexte: '3 DE CADA', ratios: { S: 3, M: 3 }, longueurM: 3.77, plis: 0 },
            ],
        },
        {
            nom: 'FORRO ', code: 'FO', principal: false, matelas: [], placements: [
                { code: 'FO-01', taillesTexte: 'XS', ratiosTexte: '10', ratios: { XS: 10 }, longueurM: 1.39, plis: 110 },
                { code: 'FO-09', taillesTexte: 'XXS', ratiosTexte: '', ratios: null, aVerifier: 'taille inconnue' },
            ],
        },
    ],
    alertes: [],
};

{
    const r = appliquerImport(vide, repartos, { tailles: ['S', 'M'], couleur: 'Rouge', remplacer: false, maxPlis: 100 });
    assert.deepEqual(r.tailles, ['S', 'M', 'XS', 'L', 'XL'], 'tailles du modele gardees, nouvelles ajoutees');
    assert.equal(r.quantites.XS, 1105);
    assert.equal(r.ordre.pedido, '65531');
    assert.equal(r.ordre.refModele, '8264/156/605');
    assert.equal(r.ordre.tissus!.length, 2);
    assert.equal(r.ordre.tissus![0].code, 'TE');
    assert.equal(r.ordre.tissus![1].nom, 'Doublure (foro)');
    assert.equal(r.ordre.tissus![1].code, 'FO');
    const pls = r.ordre.placements!;
    assert.equal(pls.length, 5);
    assert.deepEqual(pls.map(p => p.code), ['TE-01', 'TE-02', 'TE-04', 'FO-01', 'FO-09']);
    assert.deepEqual(pls[1].ratios, { XS: 2, M: 2 });
    assert.equal(pls[4].nom, 'XXS', 'illisible : on garde le texte, a completer');
    // 630 plis sous 100 -> 7 matelas ; 238 -> 3 ; 0 -> aucun ; FO 110 -> 2.
    const lignes = r.ordre.matelasLines!;
    const de = (code: string) => lignes.filter(l => l.placementId === pls.find(p => p.code === code)!.id);
    assert.equal(de('TE-01').length, 7);
    assert.equal(de('TE-01').reduce((s, l) => s + l.plis, 0), 630, 'aucun pli perdu');
    assert.equal(de('TE-02').reduce((s, l) => s + l.plis, 0), 238);
    assert.equal(de('TE-04').length, 0);
    assert.equal(de('FO-01').reduce((s, l) => s + l.plis, 0), 110);
    assert.ok(lignes.every(l => l.couleur === 'Rouge'));
    assert.equal(new Set(lignes.map(l => l.id)).size, lignes.length, 'ids uniques');
    // Numeros qui se suivent par matiere.
    const numsTE = lignes.filter(l => !l.tissu).map(l => Number(l.numero));
    assert.deepEqual(numsTE, numsTE.map((_, i) => i + 1));
    assert.ok(de('FO-01').every(l => l.tissu === r.ordre.tissus![1].id));
    assert.ok(r.alertes.some(a => a.startsWith('FO-09')));
    assert.equal(r.resume.matelas, lignes.length);

    // Re-import avec « remplacer » : pas de doublon, et un matelas coupe reste.
    const coupe = { ...r.ordre, matelasLines: r.ordre.matelasLines!.map((l, i) => (i === 0 ? { ...l, fait: true } : l)) };
    const r2 = appliquerImport(coupe, repartos, { tailles: r.tailles, couleur: 'Rouge', remplacer: true, maxPlis: 100 });
    assert.equal(r2.ordre.placements!.filter(p => p.code === 'TE-01').length, 1, 'meme code : mis a jour, pas double');
    assert.ok(r2.ordre.matelasLines!.some(l => l.fait), 'le matelas coupe reste');
    assert.equal(r2.ordre.tissus!.length, 2, 'meme matieres');
}

// Feuille de l'atelier : les matelas sont repris tels quels.
{
    const atelier: FeuilleImportee = {
        feuille: 'Tissu', format: 'atelier', pedido: '76237', modele: '2560-207-251', tailles: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
        quantites: { XS: 1315, S: 1814, M: 1693, L: 1025, XL: 463, XXL: 0 },
        matieres: [{
            nom: 'Tissu', code: 'TE', principal: true, placements: [], matelas: [
                { notation: 'S*2', ratios: { S: 2 }, numero: '1', plis: 82, longueurM: 3.6 },
                { notation: 'M*2', ratios: { M: 2 }, numero: '2', plis: 82, longueurM: 3.65 },
                { notation: 'S*2', ratios: { S: 2 }, numero: '3', plis: 82, longueurM: 3.6 },
            ],
        }],
        alertes: [],
    };
    const r = appliquerImport(vide, atelier, { tailles: [], remplacer: false, maxPlis: 100 });
    assert.equal(r.ordre.placements!.length, 2, 'un placement par melange');
    assert.deepEqual(r.ordre.matelasLines!.map(l => [l.numero, l.plis]), [['1', 82], ['2', 82], ['3', 82]]);
    assert.equal(r.ordre.matelasLines![0].placementId, r.ordre.matelasLines![2].placementId);
}

// Plusieurs feuilles a la suite (tissu, FO, EN) : aucune matiere, aucun placement, aucun matelas ne partage un id.
{
    const feuille = (nom: string, code: string, principal: boolean): FeuilleImportee => ({
        feuille: nom, format: 'atelier', modele: 'ZINTURA', tailles: ['S', 'M'], quantites: { S: 10, M: 10 }, alertes: [],
        matieres: [{ nom, code, principal, placements: [], matelas: [{ notation: 'S*2', ratios: { S: 2 }, numero: '1', plis: 5, longueurM: 1 }, { notation: 'M*2', ratios: { M: 2 }, numero: '2', plis: 5, longueurM: 1 }] }],
    });
    let r = appliquerImport(vide, feuille('Tissu', 'TE', true), { tailles: ['S', 'M'], couleur: 'Rouge', remplacer: false, maxPlis: 100 });
    for (const f of [feuille('FO', 'FO', false), feuille('EN', 'EN', false)]) r = appliquerImport(r.ordre, f, { tailles: r.tailles, couleur: 'Rouge', remplacer: false, maxPlis: 100 });
    assert.equal(r.ordre.tissus!.length, 3, 'trois matieres distinctes');
    assert.equal(new Set(r.ordre.tissus!.map(t => t.id)).size, 3, 'ids de matiere uniques');
    assert.equal(new Set(r.ordre.placements!.map(p => p.id)).size, r.ordre.placements!.length, 'ids de placement uniques');
    assert.equal(new Set(r.ordre.matelasLines!.map(l => l.id)).size, r.ordre.matelasLines!.length, 'ids de matelas uniques');
    assert.equal(r.ordre.matelasLines!.length, 6);
    assert.deepEqual(r.ordre.tissus!.map(t => t.code), ['TE', 'FO', 'EN']);
}

// Modele en nombres, classeur en lettres : les tailles se rangent dans les colonnes du modele (WA33-Q : 38 40 42 44).
{
    const r = appliquerImport(vide, repartos, { tailles: ['38', '40', '42', '44'], couleur: 'Rouge', remplacer: false, maxPlis: 100 });
    // M=38, L=40, XL=42 retombent sur le modele ; XS=34 et S=36 manquent : ajoutes en nombres, jamais en lettres.
    assert.deepEqual(r.tailles, ['38', '40', '42', '44', '34', '36'], 'aucune lettre ne s\'ajoute a un modele en nombres');
    assert.equal(r.quantites['38'], 1105, 'M -> 38');
    assert.equal(r.quantites['40'], 630, 'L -> 40');
    assert.equal(r.quantites['34'], 1105, 'XS -> 34');
    assert.equal(r.quantites['36'], 1265, 'S -> 36');
    assert.equal(r.quantites['XS'], undefined);
    const te01 = r.ordre.placements!.find(p => p.code === 'TE-01')!;
    assert.deepEqual(te01.ratios, { '34': 1, '36': 1, '38': 1, '40': 1 });
    assert.equal(te01.nom, '38-40-34-36', 'nom ecrit dans l ordre des tailles du modele');
    assert.deepEqual(r.conversions.map(c => `${c.de}>${c.vers}`), ['XS>34', 'S>36', 'M>38', 'L>40', 'XL>42']);
    assert.ok(r.alertes.some(a => a.includes('XS → 34')));

    // Une table de l'usine differente : S = 38 (XS = 36).
    const italie = [{ lettre: 'XS', nombre: '36' }, { lettre: 'S', nombre: '38' }, { lettre: 'M', nombre: '40' }, { lettre: 'L', nombre: '42' }, { lettre: 'XL', nombre: '44' }];
    const r2 = appliquerImport(vide, repartos, { tailles: ['38', '40', '42', '44'], couleur: 'Rouge', remplacer: false, maxPlis: 100, table: italie });
    assert.deepEqual(r2.tailles, ['38', '40', '42', '44', '36']);
    assert.equal(r2.quantites['38'], 1265, 'S -> 38 chez ce client');
    assert.equal(r2.quantites['44'], 0, 'XL -> 44');

    // Le modele force « en lettres » : un fichier en nombres s'y range.
    const nombres: FeuilleImportee = { ...repartos, tailles: ['36', '38', '40'], quantites: { '36': 10, '38': 20, '40': 30 }, matieres: [] };
    const r3 = appliquerImport(vide, nombres, { tailles: ['S', 'M'], couleur: 'Rouge', remplacer: false, maxPlis: 100 });
    assert.deepEqual(r3.tailles, ['S', 'M', 'L'], '36 -> S, 38 -> M, 40 -> L en lettres');
    assert.deepEqual(r3.quantites, { S: 10, M: 20, L: 30 });

    // Modele sans taille : il prend l'ecriture du classeur.
    const r4 = appliquerImport(vide, repartos, { tailles: [], couleur: 'Rouge', remplacer: false, maxPlis: 100 });
    assert.deepEqual(r4.tailles, ['XS', 'S', 'M', 'L', 'XL']);
    assert.deepEqual(r4.conversions, []);
    // ... ou celle qu'on lui impose.
    const r5 = appliquerImport(vide, repartos, { tailles: [], couleur: 'Rouge', remplacer: false, maxPlis: 100, notation: 'nombres' });
    assert.deepEqual(r5.tailles, ['34', '36', '38', '40', '42']);
}

console.log('appliquerImport: OK');
