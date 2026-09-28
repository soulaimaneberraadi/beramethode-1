/**
 * Lancer: node --import tsx lib/coupeVues.test.ts
 */
import assert from 'node:assert/strict';
import type { MatelasLine, ModelData, PlanningEvent } from '../types';
import { bilanOrdre, commandeDe, detailCouleurTaille, journalCoupe } from './coupeVues';
import { AMORCE_PAR_PLI_M } from './coupeAtelier';

const presque = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} != ${b}`);
const ligne = (x: Partial<MatelasLine>): MatelasLine => ({ id: Math.random().toString(36), plis: 0, longTracee: 0, ratios: {}, ...x });
const modele = (id: string, status: any, lignes: MatelasLine[], fiche: any = {}, extra: any = {}): ModelData => ({
    id, filename: id,
    meta_data: { nom_modele: id, date_creation: '2026-09-01', total_temps: 0, effectif: 0 },
    gamme_operatoire: [],
    ficheData: fiche,
    ordreCoupe: { refModele: id, longueurMatelas: 0, consommation: 0, nbrFeuilles: 0, nbrMatelas: 0, qteTotale: 99999, status, matelasLines: lignes, ...extra },
} as ModelData);

// --- Commande : la grille du modele, pas qteTotale (qui a pu garder les pieces planifiees) ---
{
    const m = modele('A', 'EN_COURS', [], { sizes: ['S', 'M'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 100, n_1: 50 } });
    assert.equal(commandeDe(m), 150);
    assert.equal(commandeDe(modele('B', 'EN_COURS', [], { quantity: 40 })), 40, 'sans grille : la quantite saisie');
}

// --- Bilan : commande, planifie, coupe, reste, metres ---
{
    const lignes = [
        ligne({ plis: 10, longTracee: 4, ratios: { S: 2, M: 1 }, couleur: 'Noir', fait: true, fin: '2026-09-20T10:00:00', placementId: 'p1' }),
        ligne({ plis: 10, longTracee: 4, ratios: { S: 2, M: 1 }, couleur: 'Noir', envoyeLe: '2026-09-21T08:00:00', placementId: 'p1' }),
        ligne({ plis: 5, longTracee: 2, ratios: { S: 1 }, tissu: 'vlies', fait: true, fin: '2026-09-20T11:00:00' }),
    ];
    const m = modele('C', 'EN_COURS', lignes, { sizes: ['S', 'M'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 50, n_1: 25 } },
        { placements: [{ id: 'p1', nom: '2S 1M', ratios: { S: 2, M: 1 }, efficience: 80 }] });
    const evts = [{ modelId: 'C', dateLancement: '2026-09-25', dateExport: '2026-10-10' } as PlanningEvent];
    const b = bilanOrdre(m, evts, '2026-09-28');
    assert.equal(b.commande, 75);
    assert.equal(b.planifie, 60, 'la vlieseline ne fait pas de pieces');
    assert.equal(b.coupe, 30);
    assert.equal(b.reste, 45);
    assert.equal(b.nonPlanifie, 15);
    assert.equal(b.nbMatelas, 2);
    assert.equal(b.nbFaits, 1);
    assert.equal(b.nbEnvoyes, 1);
    presque(b.prevuM, 2 * 10 * (4 + AMORCE_PAR_PLI_M));
    presque(b.consommeM, 10 * (4 + AMORCE_PAR_PLI_M));
    assert.equal(b.efficience, 80);
    assert.equal(b.lancement, '2026-09-25');
    assert.equal(b.joursAvantLancement, -3);
    assert.equal(b.enRetard, true, 'lancement passe, reste a couper');
    const v = bilanOrdre({ ...m, ordreCoupe: { ...m.ordreCoupe!, status: 'VALIDE' } }, evts, '2026-09-28');
    assert.equal(v.reste, 0);
    assert.equal(v.enRetard, false, 'ordre clos : jamais en retard');
}

// --- Journal : par jour de fin, sans la vlieseline ---
{
    const m1 = modele('D', 'EN_COURS', [
        ligne({ plis: 10, longTracee: 3, ratios: { S: 1 }, fait: true, fin: '2026-09-20T09:00:00' }),
        ligne({ plis: 20, longTracee: 3, ratios: { S: 1 }, fait: true, fin: '2026-09-20T15:00:00', metresReels: 70 }),
        ligne({ plis: 5, longTracee: 3, ratios: { S: 1 }, fait: false }),
        ligne({ plis: 5, longTracee: 3, ratios: { S: 1 }, tissu: 'vlies', fait: true, fin: '2026-09-20T15:00:00' }),
    ]);
    const j = journalCoupe([m1]).get('2026-09-20')!;
    assert.equal(j.pieces, 30);
    assert.equal(j.matelas, 2);
    presque(j.metres, 10 * (3 + AMORCE_PAR_PLI_M) + 70, 'la mesure au rouleau prime');
    assert.equal(j.ordres[0].id, 'D');
}

// --- Detail couleur x taille ---
{
    const m = modele('E', 'EN_COURS', [
        ligne({ plis: 10, ratios: { S: 1, M: 2 }, couleur: 'Noir', fait: true }),
        ligne({ plis: 4, ratios: { S: 1 }, couleur: 'Rouge' }),
    ], { sizes: ['S', 'M'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 12, n_1: 20 } });
    const d = detailCouleurTaille(m);
    assert.deepEqual(d.find(x => x.couleur === 'Noir' && x.taille === 'M'), { couleur: 'Noir', taille: 'M', commande: 20, planifie: 20, coupe: 20, reste: 0 });
    assert.deepEqual(d.find(x => x.couleur === 'Noir' && x.taille === 'S'), { couleur: 'Noir', taille: 'S', commande: 12, planifie: 10, coupe: 10, reste: 2 });
    assert.ok(d.some(x => x.couleur === 'Rouge' && x.planifie === 4), 'une couleur hors repartition reste visible');
}

console.log('coupeVues : ok');
