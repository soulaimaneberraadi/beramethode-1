/**
 * Lancer: node --import tsx lib/coupeChaines.test.ts
 */
import assert from 'node:assert/strict';
import type { AppSettings, MatelasLine, ModelData, PlanningEvent, SuiviData } from '../types';
import { chainesDeCoupe } from './coupeChaines';

const reglages = { chainsCount: 2, chainNames: { 'CHAINE 1': 'STAR1+2' }, chainCapacityPerDay: { 'CHAINE 1': 800, 'CHAINE 2': 500 } } as unknown as AppSettings;

let n = 0;
const ligne = (numero: string, plis: number, ratios: Record<string, number>, extra: Partial<MatelasLine> = {}): MatelasLine =>
    ({ id: `l${n++}`, numero, plis, longTracee: 1, ratios, ...extra });
const modele = (id: string, lignes: MatelasLine[], quantite = 2000): ModelData => ({
    id, meta_data: { nom_modele: id, sizes: ['S', 'M'] },
    ficheData: { sizes: ['S', 'M'], gridQuantities: { c_0: quantite / 2, c_1: quantite / 2 } },
    ordreCoupe: { refModele: id, longueurMatelas: 0, consommation: 0, nbrFeuilles: 0, nbrMatelas: 0, qteTotale: 0, status: 'EN_COURS', matelasLines: lignes },
} as unknown as ModelData);
const evenement = (id: string, modelId: string, chaineId: string, lancement: string, extra: Partial<PlanningEvent> = {}): PlanningEvent =>
    ({ id, modelId, chaineId, dateLancement: lancement, dateExport: '2026-11-30', qteTotal: 2000, status: 'IN_PROGRESS', ...extra } as PlanningEvent);
const suivi = (planningId: string, date: string, entrer: number, sorti: number): SuiviData =>
    ({ id: `${planningId}-${date}`, planningId, date, entrer, sorties: { h1: sorti }, totalHeure: 0, pJournaliere: 0, enCour: 0, resteEntrer: 0, resteSortie: 0 } as unknown as SuiviData);

// --- Une chaine en cours : cadence du Suivi, avance, matelas a couper dans l'ordre ---
{
    // 10 matelas de 200 pieces : 4 coupes (800), 6 a couper.
    const lignes = Array.from({ length: 10 }, (_, i) => ligne(String(i + 1), 100, { S: 1, M: 1 }, { fait: i < 4 }));
    const m = modele('A', lignes);
    const ev = evenement('ev1', 'A', 'CHAINE 1', '2026-10-01');
    // La chaine a recu 600 pieces et en sort 300 par jour.
    const suivis = [suivi('ev1', '2026-10-01', 300, 300), suivi('ev1', '2026-10-02', 300, 300)];
    const [c1, c2] = chainesDeCoupe({ models: [m], evenements: [ev], suivis, settings: reglages, joursAvance: 2, aujourdhui: '2026-10-05' });
    assert.equal(c1.nom, 'STAR1+2');
    const x = c1.modeles[0];
    assert.equal(x.cadence, 300, 'cadence : la moyenne des jours produits au Suivi');
    assert.equal(x.sourceCadence, 'suivi');
    assert.equal(x.prets, 800);
    assert.equal(x.enAttente, 200, '800 coupees, 600 entrees');
    assert.ok(Math.abs((x.joursAvance || 0) - 200 / 300) < 1e-9);
    assert.equal(c1.etat, 'arret', 'moins d’un jour d’avance : la chaine va s’arreter');
    // Avance voulue 2 jours = 600 pieces ; il en attend 200 : 400 a couper = 2 matelas, les numeros 5 et 6.
    assert.equal(x.aCouperPieces, 400);
    assert.deepEqual(x.matelas.map(l => l.numero), ['5', '6']);
    assert.equal(c1.matelasACouper, 2);
    assert.equal(c2.etat, 'libre', 'chaine sans modele');
}

// --- Sans Suivi : la capacite du Planning ---
{
    const m = modele('B', [ligne('1', 100, { S: 1, M: 1 }), ligne('2', 100, { S: 1, M: 1 })]);
    const ev = evenement('ev2', 'B', 'CHAINE 2', '2026-10-05');
    const [, c2] = chainesDeCoupe({ models: [m], evenements: [ev], suivis: [], settings: reglages, joursAvance: 1, aujourdhui: '2026-10-05' });
    const x = c2.modeles[0];
    assert.equal(x.sourceCadence, 'planning');
    assert.equal(x.cadence, 500, 'capacite reglee de la chaine');
    assert.equal(x.aCouperPieces, 400, 'pas plus que ce qui reste a couper');
    assert.deepEqual(x.matelas.map(l => l.numero), ['1', '2']);
}

// --- Lancement lointain : rien a couper avant la date ; OF termine : disparait ---
{
    const m = modele('C', [ligne('1', 100, { S: 1, M: 1 })]);
    const loin = evenement('ev3', 'C', 'CHAINE 1', '2026-10-20');
    const fini = evenement('ev4', 'C', 'CHAINE 2', '2026-09-01', { producedQuantity: 2000 });
    const [c1, c2] = chainesDeCoupe({ models: [m], evenements: [loin, fini], suivis: [], settings: reglages, joursAvance: 2, aujourdhui: '2026-10-05' });
    assert.equal(c1.modeles[0].plusTard, true);
    assert.equal(c1.modeles[0].commencerLe, '2026-10-18');
    assert.equal(c1.modeles[0].matelas.length, 0);
    assert.equal(c1.etat, 'couverte');
    assert.equal(c2.modeles.length, 0, 'OF termine');
}

// --- Modele planifie sans ordre de coupe ---
{
    const sansOrdre = { id: 'D', meta_data: { nom_modele: 'D' } } as unknown as ModelData;
    const [c1] = chainesDeCoupe({ models: [sansOrdre], evenements: [evenement('ev5', 'D', 'CHAINE 1', '2026-10-01')], suivis: [], settings: reglages, joursAvance: 2, aujourdhui: '2026-10-05' });
    assert.equal(c1.modeles[0].aUnOrdre, false);
    assert.equal(c1.modeles[0].aCouperPieces, 0);
    assert.equal(c1.etat, 'horsCoupe', 'pas « va s\u2019arreter » : la coupe ne connait pas ce modele');
}

// --- La serie donne des paquets a deux chaines : chacune ne coupe que les siens, dans l'ordre de la serie ---
{
    const lignes = Array.from({ length: 6 }, (_, i) => ligne(String(i + 1), 100, { S: 1, M: 1 }));
    const m = modele('E', lignes, 1200);
    // Serie : chaque matelas = 2 paquets (S, M) de 100 ; les matelas 1-3 vont a CHAINE 1, 4-6 a CHAINE 2.
    const saisies: Record<string, { chaine: string }> = {};
    for (const [i, l] of lignes.entries()) for (const t of ['S', 'M']) saisies[`${l.id}:${t}:0`] = { chaine: i < 3 ? 'CHAINE 1' : 'CHAINE 2' };
    (m.ordreCoupe as any).serie = { saisies };
    const ev = evenement('ev6', 'E', 'CHAINE 1', '2026-10-01');
    const [c1, c2] = chainesDeCoupe({ models: [m], evenements: [ev], suivis: [], settings: reglages, joursAvance: 1, aujourdhui: '2026-10-05' });
    const x1 = c1.modeles[0], x2 = c2.modeles[0];
    assert.equal(x1.commande, 600, 'les paquets de la chaine 1');
    assert.equal(x2.commande, 600, 'la chaine 2 a aussi un modele, sans evenement du Planning');
    assert.deepEqual(x1.serie, { debut: 1, fin: 600, paquets: 6, entres: 0, sortis: 0 });
    assert.deepEqual(x2.serie && [x2.serie.debut, x2.serie.fin], [601, 1200]);
    // Chaine 1 : capacite 800/jour, avance 1 jour : tout ce qui lui reste (600) ; ses matelas 1, 2, 3.
    assert.deepEqual(x1.matelas.map(l => l.numero), ['1', '2', '3']);
    assert.deepEqual(x1.serieACouper, { debut: 1, fin: 600 });
    // Chaine 2 : capacite 500/jour : 500 pieces = 3 matelas (200 chacun), les numeros 4, 5, 6 de SA serie.
    assert.deepEqual(x2.matelas.map(l => l.numero), ['4', '5', '6']);
    assert.deepEqual(x2.serieACouper, { debut: 601, fin: 1200 });

    // Les premiers matelas de la chaine 1 coupes : ils ne comptent plus, et rien de la chaine 2 ne bouge.
    lignes[0].fait = true;
    const [d1, d2] = chainesDeCoupe({ models: [m], evenements: [ev], suivis: [], settings: reglages, joursAvance: 1, aujourdhui: '2026-10-05' });
    assert.equal(d1.modeles[0].coupe, 200);
    assert.deepEqual(d1.modeles[0].matelas.map(l => l.numero), ['2', '3']);
    assert.deepEqual(d2.modeles[0].matelas.map(l => l.numero), ['4', '5', '6']);
}

console.log('coupeChaines : OK');
