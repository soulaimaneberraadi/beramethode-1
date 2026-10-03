/**
 * Lancer: node --import tsx lib/convertirTaillesOrdre.test.ts
 */
import assert from 'node:assert/strict';
import type { MatelasLine, OrdreCoupe, PlacementCoupe } from '../types';
import { convertirTaillesOrdre } from './convertirTaillesOrdre';

const ligne = (id: string, ratios: Record<string, number>, extra: Partial<MatelasLine> = {}): MatelasLine => ({ id, plis: 10, longTracee: 1, ratios, ...extra });
const placement = (id: string, nom: string, ratios: Record<string, number>, extra: Partial<PlacementCoupe> = {}): PlacementCoupe => ({ id, tissu: 'principal', nom, ratios, ...extra });

// Le modele WA33-Q apres l'import d'un fichier en lettres : « 38 40 42 44 XS S M L XL XXL ».
const MELANGE = ['38', '40', '42', '44', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
const ordre = (extra: Partial<OrdreCoupe> = {}): OrdreCoupe => ({
    refModele: 'WA33-Q', longueurMatelas: 0, consommation: 0, nbrFeuilles: 0, nbrMatelas: 0, qteTotale: 0, status: 'EN_COURS', ...extra,
});

{
    const o = ordre({
        placements: [
            placement('P1', '38-40', { '38': 1, '40': 1 }),
            placement('P2', 'XS-M', { XS: 1, M: 1 }, { taillesTrace: { XS: 1, M: 1 }, taillesFichier: { XS: 1, M: 1 }, ecartAccepte: 'XS1,M1|XS1,M1' }),
            placement('P3', 'XXS', {}),
        ],
        matelasLines: [ligne('A', { '38': 1, '40': 1 }), ligne('B', { XS: 1, M: 1 }), ligne('C', { '38': 1, M: 1 })],
        suiviManuel: { Rouge__M: { cut: 5, rem: 1 }, Rouge__38: { cut: 10 } },
    });
    const fiche = {
        sizes: MELANGE,
        // Rouge (id c1) : 38 -> 100, XS -> 50, M -> 25, XXL -> 7 ; Bleu (c2) : 40 -> 10, L -> 4.
        gridQuantities: { c1_0: 100, c1_4: 50, c1_6: 25, c1_9: 7, c2_1: 10, c2_7: 4 },
        materials: [{ scope: { sizes: [0, 6] } }, { scope: { sizes: [4, 5] } }, {}],
    };
    const r = convertirTaillesOrdre({ ordre: o, fiche, meta: { sizes: MELANGE }, vers: 'nombres' });
    if (!r.ok) throw new Error(r.erreur);
    assert.deepEqual(r.fiche.sizes, ['34', '36', '38', '40', '42', '44']);
    assert.deepEqual(r.meta!.sizes, ['34', '36', '38', '40', '42', '44']);
    // Grille : « 38 » + « M » = 125 sous l'index de 38 (2) ; XS -> 34 (0) ; XXL -> 44 (5) ; 40 + L = 14 (3).
    assert.deepEqual(r.fiche.gridQuantities, { c1_2: 125, c1_0: 50, c1_5: 7, c2_3: 14 });
    const total = (g: Record<string, number>) => Object.values(g).reduce((s, v) => s + v, 0);
    assert.equal(total(r.fiche.gridQuantities!), total(fiche.gridQuantities), 'aucune piece perdue ni creee');
    // Portee des matieres (index) : [38, M] -> [2], [XS, S] -> [0, 1].
    assert.deepEqual(r.fiche.materials!.map(m => m.scope?.sizes), [[2], [0, 1], undefined]);
    // Placements.
    const p = r.ordre.placements!;
    assert.deepEqual(p[0].ratios, { '38': 1, '40': 1 });
    assert.equal(p[0].nom, '38-40');
    assert.deepEqual(p[1].ratios, { '34': 1, '38': 1 });
    assert.equal(p[1].nom, '34-38', 'XS-M devient 34-38');
    assert.deepEqual(p[1].taillesTrace, { '34': 1, '38': 1 });
    assert.deepEqual(p[1].taillesFichier, { XS: 1, M: 1 }, 'l en-tete du fichier reste tel que le fichier l a ecrit');
    assert.equal(p[2].nom, 'XXS', 'un placement sans taille garde son texte');
    // Matelas.
    assert.deepEqual(r.ordre.matelasLines!.map(l => l.ratios), [{ '38': 1, '40': 1 }, { '34': 1, '38': 1 }, { '38': 2 }], '38 et M dans un meme matelas = 2 pieces de 38');
    // Corrections du suivi.
    assert.deepEqual(r.ordre.suiviManuel, { Rouge__38: { cut: 15, rem: 1 } });
    // Le plan dit ce qui se fond.
    assert.equal(r.plan.fusions.length, 4);
}

// Serie d'etiquetage : les cles suivent le matelas, la taille et le passage.
{
    const o = ordre({
        matelasLines: [ligne('B', { XS: 1, M: 1 }), ligne('C', { '38': 1, M: 1 })],
        serie: {
            saisies: { 'B:XS:0': { lote: 'L1' }, 'B:M:0': { lote: 'L2' }, 'C:38:0': { lote: 'L3' }, 'C:M:0': { lote: 'L4' } },
            figes: { 'B:XS:0': { debut: 1, fin: 10 }, 'C:M:0': { debut: 11, fin: 20 } },
        },
    });
    const r = convertirTaillesOrdre({ ordre: o, fiche: { sizes: ['38', 'XS', 'M'] }, vers: 'nombres' });
    if (!r.ok) throw new Error(r.erreur);
    assert.deepEqual(r.ordre.serie!.saisies, { 'B:34:0': { lote: 'L1' }, 'B:38:0': { lote: 'L2' }, 'C:38:0': { lote: 'L3' }, 'C:38:1': { lote: 'L4' } },
        'C a deux paquets de 38 : celui de 38 d abord, celui de M ensuite');
    assert.deepEqual(r.ordre.serie!.figes, { 'B:34:0': { debut: 1, fin: 10 }, 'C:38:1': { debut: 11, fin: 20 } });
}

// Vers les lettres, depuis un modele en nombres.
{
    const o = ordre({ matelasLines: [ligne('A', { '36': 1, '38': 2 })], placements: [placement('P', '36-38×2', { '36': 1, '38': 2 })] });
    const r = convertirTaillesOrdre({ ordre: o, fiche: { sizes: ['36', '38', '40'], gridQuantities: { c_0: 5, c_1: 6, c_2: 7 } }, vers: 'lettres' });
    if (!r.ok) throw new Error(r.erreur);
    assert.deepEqual(r.fiche.sizes, ['S', 'M', 'L']);
    assert.deepEqual(r.fiche.gridQuantities, { c_0: 5, c_1: 6, c_2: 7 }, 'memes colonnes, seulement renommees');
    assert.equal(r.ordre.placements![0].nom, 'S-M×2');
    assert.deepEqual(r.ordre.matelasLines![0].ratios, { S: 1, M: 2 });
}

// Deja dans la bonne notation : rien ne change.
{
    const o = ordre({ matelasLines: [ligne('A', { '38': 1 })] });
    const r = convertirTaillesOrdre({ ordre: o, fiche: { sizes: ['34', '36', '38'], gridQuantities: { c_0: 1, c_2: 3 } }, vers: 'nombres' });
    if (!r.ok) throw new Error(r.erreur);
    assert.deepEqual(r.fiche.sizes, ['34', '36', '38']);
    assert.deepEqual(r.fiche.gridQuantities, { c_0: 1, c_2: 3 });
    assert.deepEqual(r.plan.fusions, []);
}

// Refus : une taille sans equivalent, des codes-barres deja crees.
{
    const o = ordre({ matelasLines: [ligne('A', { '37': 1, S: 1 })] });
    const r = convertirTaillesOrdre({ ordre: o, fiche: { sizes: ['37', 'S'] }, vers: 'lettres' });
    assert.equal(r.ok, false);
    if (r.ok) throw new Error('refus attendu');
    assert.ok(r.erreur.includes('37'));
    assert.deepEqual(r.plan!.sansEquivalent, ['37']);

    const codes = convertirTaillesOrdre({ ordre: ordre(), fiche: { sizes: ['S', 'M'] }, meta: { variantCodes: { '6111': { taille: 'S', couleur: 'Rouge' } } }, vers: 'nombres' });
    assert.equal(codes.ok, false);
    if (!codes.ok) assert.ok(codes.erreur.includes('codes-barres'));
    // Sans codes-barres, la meme conversion passe.
    assert.equal(convertirTaillesOrdre({ ordre: ordre(), fiche: { sizes: ['S', 'M'] }, meta: { variantCodes: {} }, vers: 'nombres' }).ok, true);
}

// Une taille de l'ordre absente de la fiche est renommee aussi (jamais laissee en lettres).
{
    const o = ordre({ matelasLines: [ligne('A', { XL: 1 })] });
    const r = convertirTaillesOrdre({ ordre: o, fiche: { sizes: ['38', '40'] }, vers: 'nombres' });
    if (!r.ok) throw new Error(r.erreur);
    assert.deepEqual(r.fiche.sizes, ['38', '40']);
    assert.deepEqual(r.ordre.matelasLines![0].ratios, { '42': 1 });
}

console.log('convertirTaillesOrdre : OK');
