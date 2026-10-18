/**
 * Lancer: node --import tsx lib/coupeChaines.test.ts
 */
import assert from 'node:assert/strict';
import type { AppSettings, MatelasLine, ModelData, PlanningEvent, SuiviData } from '../types';
import { chainesDeCoupe, rythmeCoupe, totauxPlanJour } from './coupeChaines';
import { vuePlan } from './coupeChainesVue';
import { equilibrerOrdre } from './equilibreMatieres';

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

// --- Chaines reglees a la main : alias de la serie, cadence, modele donne a la main ---
{
    const lignes = Array.from({ length: 4 }, (_, i) => ligne(String(i + 1), 100, { S: 1, M: 1 }));
    const m = modele('F', lignes, 800);
    const saisies: Record<string, { chaine: string }> = {};
    for (const l of lignes) for (const t of ['S', 'M']) saisies[`${l.id}:${t}:0`] = { chaine: 'STAR1+2' };
    (m.ordreCoupe as any).serie = { saisies };
    const sansEvenement = modele('G', [ligne('1', 100, { S: 1, M: 1 })], 200);
    const regl = {
        ...reglages,
        chainesCoupe: [
            { id: 'A', nom: 'Star 1+2', alias: ['star1+2', 'CHAINE 1'], cadence: 300, cadences: { F: 100 } },
            { id: 'B', nom: 'Star 3', modeles: ['G'] },
        ],
    } as unknown as AppSettings;
    const [a1, b1] = chainesDeCoupe({ models: [m, sansEvenement], evenements: [], suivis: [], settings: regl, joursAvance: 1, aujourdhui: '2026-10-05' });
    assert.deepEqual([a1.id, a1.nom, a1.reglee], ['A', 'Star 1+2', true], 'seules les chaines reglees existent');
    assert.equal(a1.modeles[0].commande, 800, 'le nom brut « STAR1+2 » de la serie va a la chaine A');
    assert.equal(a1.modeles[0].cadence, 100, 'cadence a la main pour ce modele');
    assert.equal(a1.modeles[0].sourceCadence, 'manuel');
    assert.equal(a1.modeles[0].aCouperPieces, 100);
    assert.deepEqual(a1.modeles[0].parTaille.map(t => t.taille).sort(), ['M', 'S']);
    assert.equal(a1.modeles[0].aCouperTous.length, 4, 'tous les matelas restants, dans l’ordre de la serie');
    assert.equal(a1.modeles[0].aCouperTous.filter(x => x.choisi).length, 1);
    assert.equal(b1.modeles[0].modelId, 'G', 'modele donne a la main : present sans OF ni paquet de serie attribue');
    // Cadence de la chaine, sans cadence propre au modele.
    const [a2] = chainesDeCoupe({ models: [m], evenements: [], suivis: [], settings: { ...regl, chainesCoupe: [{ id: 'A', nom: 'A', alias: ['STAR1+2'], cadence: 300 }] } as unknown as AppSettings, joursAvance: 1, aujourdhui: '2026-10-05' });
    assert.equal(a2.modeles[0].cadence, 300);
}

/* ------------------------------------------------------------------ */
/* Une ligne par modele et par chaine, pedidos, pause, plan du jour    */
/* ------------------------------------------------------------------ */

const avecCadence = (cadence: number) => ({
    ...reglages,
    chainesCoupe: [{ id: 'CHAINE 1', nom: 'C1', cadence }, { id: 'CHAINE 2', nom: 'C2' }],
} as unknown as AppSettings);
// 10 matelas de 100 plis x (S + M) = 200 pieces chacun ; les `faits` premiers sont coupes.
const dixMatelas = (faits = 0, extra: (i: number) => Partial<MatelasLine> = () => ({})) =>
    Array.from({ length: 10 }, (_, i) => ligne(String(i + 1), 100, { S: 1, M: 1 }, { fait: i < faits, ...extra(i) }));

// --- Deux pedidos du meme modele sur la meme chaine : une seule ligne, comptee une fois ---
{
    const m = modele('H', dixMatelas(4), 2000);
    const evA = evenement('evA', 'H', 'CHAINE 1', '2026-10-01', { modelName: 'H — L1', qteTotal: 1000 });
    const evB = evenement('evB', 'H', 'CHAINE 1', '2026-10-10', { modelName: 'H — L2', qteTotal: 1000, strictDeadline_DDS: '2026-11-15' });
    // Le Suivi de L1 un jour, celui de L2 un autre : 300 pieces entrees et sorties chaque jour.
    const suivis = [suivi('evA', '2026-10-01', 300, 300), suivi('evB', '2026-10-02', 300, 300)];
    const [c1] = chainesDeCoupe({ models: [m], evenements: [evB, evA], suivis, settings: reglages, joursAvance: 2, aujourdhui: '2026-10-05' });
    assert.equal(c1.modeles.length, 1, 'un modele = une ligne par chaine');
    const x = c1.modeles[0];
    assert.equal(x.commande, 2000, 'les deux pedidos, une fois');
    assert.equal(x.coupe, 800, 'le tissu coupe ne se double pas');
    assert.equal(x.entre, 600, 'les entrees des deux pedidos s’additionnent');
    assert.equal(x.sorti, 600);
    assert.equal(x.cadence, 300, 'moyenne des jours produits, tous pedidos confondus');
    assert.equal(x.jours.length, 2);
    // Meme besoin qu'avec un seul pedido (voir la premiere serie de tests) : 400 pieces, 2 matelas — pas 800.
    assert.equal(x.aCouperPieces, 400);
    assert.deepEqual(x.matelas.map(l => l.numero), ['5', '6']);
    assert.equal(c1.matelasACouper, 2);
    assert.equal(c1.piecesACouper, 400);
    assert.equal(x.nom, 'H', 'plusieurs pedidos : le nom de l’article, sans le lot');
    // Les pedidos : du plus tot au plus tard, avec leur lot, quantite, lancement et livraison.
    assert.deepEqual(x.pedidos.map(p => [p.eventId, p.code, p.quantite, p.debut, p.export, p.enPause, p.verrouille]), [
        ['evA', 'L1', 1000, '2026-10-01', undefined, false, false],
        ['evB', 'L2', 1000, '2026-10-10', '2026-11-15', false, false],
    ]);
    assert.equal(x.eventId, 'evA');
    assert.equal(x.lancement, '2026-10-01');
    assert.equal(x.dds, '2026-11-15', 'la livraison est la DDS saisie, pas la fin calculee (dateExport)');
    assert.equal(x.enPause, false);
}

// --- Pause : un pedido en pause ne lance rien ; tous en pause, rien a couper ---
{
    const evActif = evenement('evL1', 'I', 'CHAINE 1', '2026-10-01', { modelName: 'I — L1', qteTotal: 500 });
    const evPause = evenement('evL2', 'I', 'CHAINE 1', '2026-09-25', { modelName: 'I — L2', qteTotal: 1500, status: 'BLOCKED_STOCK', isLocked: true });
    const entree = (m: ModelData, evenements: PlanningEvent[]) =>
        chainesDeCoupe({ models: [m], evenements, suivis: [], settings: avecCadence(1000), joursAvance: 2, aujourdhui: '2026-10-05' })[0];

    // Un actif (500) et un en pause (1500) : on ne coupe pas plus que les 500 de l'actif.
    const lignes = dixMatelas();
    const m = modele('I', lignes, 2000);
    const c = entree(m, [evPause, evActif]);
    const x = c.modeles[0];
    assert.equal(x.enPause, false);
    assert.equal(x.lancement, '2026-10-01', 'le lancement est celui du pedido actif, pas du pedido en pause plus ancien');
    assert.equal(x.eventId, 'evL1');
    assert.deepEqual(x.pedidos.map(p => [p.code, p.enPause, p.verrouille]), [['L2', true, true], ['L1', false, false]]);
    assert.equal(x.aCouperPieces, 500, 'plafonne a la quantite du pedido actif');
    assert.equal(x.matelas.length, 3, 'matelas entiers : 3 x 200 pour couvrir 500');
    assert.equal(x.planJour.pieces, 600);
    assert.equal(x.planJour.statut, 'manque', 'l’objectif (2000) n’est pas atteignable : seul le pedido actif est coupable');
    assert.equal(x.planJour.manque, 1500, 'voulu 2000 - coupable 500');
    assert.equal(x.planJour.attenteReprise, 1500, 'l’ordre fournirait 2000 : 1500 attendent la reprise du pedido en pause');
    assert.equal(c.etat, 'arret', 'rien de pret pour la chaine : elle va s’arreter, elle n’est pas en pause');

    // Deja 400 coupes pour ce modele sur la chaine : il ne reste que 100 a couper pour le pedido actif.
    lignes[0].fait = true; lignes[1].fait = true;
    const x2 = entree(m, [evPause, evActif]).modeles[0];
    assert.equal(x2.coupe, 400);
    assert.equal(x2.aCouperPieces, 100);
    assert.equal(x2.matelas.length, 1);
    // Plus que ce que le pedido actif demande : jamais negatif, rien a couper.
    lignes[2].fait = true;
    const x3 = entree(m, [evPause, evActif]).modeles[0];
    assert.equal(x3.aCouperPieces, 0);
    assert.equal(x3.matelas.length, 0);
    assert.equal(x3.planJour.statut, 'manque');
    assert.equal(x3.planJour.manque, 1400, '2000 voulus - 600 deja pret');
    assert.equal(x3.planJour.attenteReprise, 1400, 'tout ce qui reste attend la reprise');

    // Tous en pause : rien a proposer, la chaine est « en pause », pas « va s'arreter ».
    const toutes = dixMatelas();
    const c4 = entree(modele('I', toutes, 2000), [evPause, { ...evActif, status: 'BLOCKED_STOCK' } as PlanningEvent]);
    const y = c4.modeles[0];
    assert.equal(y.enPause, true);
    assert.equal(y.aCouperPieces, 0);
    assert.deepEqual(y.matelas, []);
    assert.equal(y.planJour.statut, 'pause');
    assert.equal(y.planJour.couvreJusqua, undefined);
    assert.equal(y.lancement, '2026-09-25', 'tous en pause : le plus ancien lancement, faute de mieux');
    assert.equal(c4.etat, 'pause');
    assert.equal(c4.piecesACouper, 0);
}

// --- L'etat d'une chaine est celui du modele qu'elle coud, pas d'un modele en pause ---
{
    const pause = modele('P', dixMatelas(), 2000);
    const actif = modele('Q', dixMatelas(4), 2000);
    const evP = evenement('evP', 'P', 'CHAINE 1', '2026-09-20', { status: 'BLOCKED_STOCK' });
    const evQ = evenement('evQ', 'Q', 'CHAINE 1', '2026-10-01');
    const base = { suivis: [], settings: avecCadence(300), joursAvance: 2, aujourdhui: '2026-10-05' };
    const [c] = chainesDeCoupe({ ...base, models: [pause, actif], evenements: [evP, evQ] });
    assert.equal(c.modeles.length, 2);
    assert.equal(c.etat, 'couverte', '800 pieces coupees / 300 par jour : 2,7 jours, objectif 2');
    const [seul] = chainesDeCoupe({ ...base, models: [pause], evenements: [evP] });
    assert.equal(seul.etat, 'pause');
}

// --- Plan du jour : des autres matieres, seulement les matelas utiles, pas tout le lot ---
{
    // Tissu : 2 matelas de 200 pieces. Doublure : un de 300 pieces (150 x 2) et un de 100.
    // Elles tombent dans le meme lot que les deux matelas de tissu.
    const f1 = ligne('1', 100, { S: 1, M: 1 }), f2 = ligne('2', 100, { S: 1, M: 1 });
    const g1 = ligne('1', 150, { S: 1, M: 1 }, { tissu: 'FO' }), g2 = ligne('2', 50, { S: 1, M: 1 }, { tissu: 'FO' });
    const m = modele('J', [f1, f2, g1, g2], 400);
    (m.ordreCoupe as any).tissus = [{ id: 'principal', nom: 'Tissu' }, { id: 'FO', nom: 'Doublure (foro)', code: 'FO' }];
    const eq = equilibrerOrdre(m.ordreCoupe, ['S', 'M']);
    assert.ok(eq.lots.some(l => l.matelas.FO.length === 2), 'les deux doublures sont dans le meme lot');
    const ev = evenement('evJ', 'J', 'CHAINE 1', '2026-10-01', { qteTotal: 400 });
    // 200 pieces par jour, 1 jour d'avance : le matelas de tissu 1 seul (200 pieces).
    const [c1] = chainesDeCoupe({ models: [m], evenements: [ev], suivis: [], settings: avecCadence(200), joursAvance: 1, aujourdhui: '2026-10-05' });
    const x = c1.modeles[0];
    assert.deepEqual(x.planJour.matelas.map(l => l.numero), ['1']);
    assert.equal(x.planJour.pieces, 200);
    assert.ok(Math.abs(x.planJour.metres - 103) < 1e-9, '100 plis x (1 m + 3 cm d’amorce)');
    assert.equal(x.planJour.minutes, undefined, 'aucun matelas chronometre : pas de temps standard, donc pas de minutes');
    assert.equal(x.planJour.sansLongueur, 0);
    assert.equal(x.planJour.autres.length, 1);
    assert.deepEqual([x.planJour.autres[0].code, x.planJour.autres[0].numeros], ['FO', ['1']], 'la doublure 1 (300 pieces) couvre le tissu 1 ; la 2 n’est pas utile aujourd’hui');
    assert.equal(x.planJour.statut, 'a_couper');
    assert.deepEqual(x.autres, x.planJour.autres, 'l’ancien champ `autres` suit le plan du jour');
    assert.deepEqual(x.matelas, x.planJour.matelas);

    // Le tissu 1 coupe et la doublure 1 aussi : au tissu 2, la doublure 2 (100 pieces) comble le reste.
    f1.fait = true; g1.fait = true;
    const [c2] = chainesDeCoupe({ models: [m], evenements: [ev], suivis: [], settings: avecCadence(200), joursAvance: 2, aujourdhui: '2026-10-05' });
    const y = c2.modeles[0];
    assert.deepEqual(y.planJour.matelas.map(l => l.numero), ['2']);
    assert.deepEqual(y.planJour.autres.map(a => [a.code, a.numeros]), [['FO', ['2']]]);
}

// --- Jusqu'a quand la chaine est couverte : jours ouvres, dimanches sautes ---
{
    // 2026-10-03 est un samedi, 2026-10-04 un dimanche.
    const m = modele('K', dixMatelas(), 2000);
    const ev = evenement('evK', 'K', 'CHAINE 1', '2026-10-01');
    const cherche = (aujourdhui: string, lancement: string, cadence = 200) =>
        chainesDeCoupe({ models: [m], evenements: [{ ...ev, dateLancement: lancement }], suivis: [], settings: avecCadence(cadence), joursAvance: 2, aujourdhui })[0].modeles[0];
    // 200/jour, 2 jours d'avance : 2 matelas (400 pieces) = 2 jours de couture ; samedi + 2 jours ouvres = mardi.
    const x = cherche('2026-10-03', '2026-10-01');
    assert.equal(x.planJour.pieces, 400);
    assert.equal(x.planJour.couvreJusqua, '2026-10-06', 'samedi 3 -> lundi 5 -> mardi 6 (le dimanche 4 saute)');
    assert.equal(cherche('2026-10-05', '2026-10-01').planJour.couvreJusqua, '2026-10-07', 'lundi + 2 jours ouvres = mercredi');
    // Un lancement lointain : rien a couper, le compte part du lancement (20/10), pas d'aujourd'hui.
    const loin = cherche('2026-10-05', '2026-10-20');
    assert.equal(loin.plusTard, true);
    assert.equal(loin.planJour.matelas.length, 0);
    assert.equal(loin.planJour.statut, 'rien');
    assert.equal(loin.planJour.couvreJusqua, '2026-10-20');
    // Sans cadence (ni reglage, ni Suivi, ni capacite du Planning) : pas de date.
    const [c0] = chainesDeCoupe({ models: [m], evenements: [ev], suivis: [], joursAvance: 2, aujourdhui: '2026-10-05' });
    assert.equal(c0.modeles[0].cadence, 0);
    assert.equal(c0.modeles[0].planJour.couvreJusqua, undefined);
    assert.equal(c0.modeles[0].planJour.statut, 'rien');
}

// --- Plan du jour : l'avance couvre l'objectif ; l'ordre ne suffit pas ; minutes prevues ---
{
    // 4 matelas coupes, chronometres (60 min chacun) : le temps standard de la salle existe.
    const m = modele('L', dixMatelas(4, i => (i < 4 ? { groupe: 'g1', debut: `2026-09-2${i + 1}T08:00:00`, fin: `2026-09-2${i + 1}T09:00:00` } : {})), 2000);
    const ev = evenement('evL', 'L', 'CHAINE 1', '2026-10-01');
    const base = { models: [m], evenements: [ev], suivis: [], joursAvance: 2, aujourdhui: '2026-10-05' };
    // 600/jour : 800 prets, 1200 voulus, 400 a couper = 2 matelas ; chacun 103 m = 60 min.
    const x = chainesDeCoupe({ ...base, settings: avecCadence(600) })[0].modeles[0];
    assert.equal(x.planJour.statut, 'a_couper');
    assert.equal(x.planJour.manque, undefined, 'rien ne manque quand le plan tient l’objectif');
    assert.equal(x.planJour.matelas.length, 2);
    assert.ok(Math.abs(x.planJour.metres - 206) < 1e-9);
    assert.ok(Math.abs((x.planJour.minutes || 0) - 120) < 1e-6, 'deux matelas de 60 min');
    assert.equal(x.planJour.couvreJusqua, '2026-10-07', '(800 + 400) / 600 = 2 jours : lundi + 2 jours ouvres');
    // 300/jour : 800 prets = 2,7 jours, objectif 2 : rien a couper.
    const y = chainesDeCoupe({ ...base, settings: avecCadence(300) })[0].modeles[0];
    assert.equal(y.planJour.statut, 'rien');
    assert.deepEqual(y.planJour.matelas, []);
    assert.equal(y.planJour.minutes, undefined);
    // 2000/jour : 4000 pieces voulues, mais le pedido n'en a que 2000 a coudre : la chaine ne peut pas en demander plus.
    // Tout ce qui reste (1200) se coupe, et rien ne « manque » : il n'y a pas d'autre travail pour la chaine.
    const z = chainesDeCoupe({ ...base, settings: avecCadence(2000) })[0].modeles[0];
    assert.equal(z.planJour.statut, 'a_couper');
    assert.equal(z.planJour.matelas.length, 6, 'tout ce qui reste');
    assert.equal(z.planJour.manque, undefined, 'voulu = 2000 a coudre - 800 prets = 1200 = tout ce qui reste');
    // Le pedido porte 3000 pieces mais l'ordre n'en planifie que 2000 : cette fois l'ordre est trop court.
    const court = chainesDeCoupe({ ...base, evenements: [{ ...ev, qteTotal: 3000 }], settings: avecCadence(2000) })[0].modeles[0];
    assert.equal(court.planJour.statut, 'manque');
    assert.equal(court.planJour.matelas.length, 6, 'tout ce qui reste');
    assert.equal(court.planJour.manque, 1000, '3000 a coudre - 800 prets = 2200 voulus - 1200 coupables');
    assert.equal(court.planJour.attenteReprise, 0, 'ici c’est l’ordre qui est trop court, pas une pause');
    // Longueur de trace inconnue : les metres ne sont pas comptes, les minutes non plus.
    for (const l of m.ordreCoupe!.matelasLines.filter(x => !x.fait).slice(0, 2)) l.longTracee = 0;
    const w = chainesDeCoupe({ ...base, settings: avecCadence(600) })[0].modeles[0];
    assert.equal(w.planJour.sansLongueur, 2);
    assert.equal(w.planJour.metres, 0);
    assert.equal(w.planJour.minutes, undefined);
}

// --- Rythme : ce que la salle coupe par jour, face a ce que la chaine coud ---
{
    // Matelas de 200 pieces coupes, un jour donne (date de fin) ; ceux dont la date est dans le futur sont ignores.
    const coupes = (jour: string, n: number) => Array.from({ length: n }, () => ligne('x', 100, { S: 1, M: 1 }, { fait: true, fin: `${jour}T10:00:00` }));
    const lignes = [
        ...coupes('2026-09-28', 5), // le plus ancien des 6 jours actifs : hors des 5 derniers
        ...coupes('2026-09-29', 1), ...coupes('2026-09-30', 3), ...coupes('2026-10-01', 1), ...coupes('2026-10-02', 2), ...coupes('2026-10-03', 1),
        ...coupes('2026-10-09', 4), // dans le futur
        ligne('y', 100, { S: 1, M: 1 }),
    ];
    const m = modele('R', lignes, 4000);
    const autre = modele('Z', Array.from({ length: 5 }, () => ligne('x', 100, { S: 1, M: 1 }, { fait: true, fin: '2026-10-03T10:00:00' })), 2000);
    const evR = evenement('evR', 'R', 'CHAINE 1', '2026-10-01');
    const evZ = evenement('evZ', 'Z', 'CHAINE 2', '2026-10-01');
    const sans = { models: [m, autre], suivis: [], joursAvance: 2, aujourdhui: '2026-10-05' };
    const [c1, c2] = chainesDeCoupe({ ...sans, evenements: [evR, evZ], settings: avecCadence(300) });
    // 5 derniers jours actifs : 03/10 (200), 02/10 (400), 01/10 (200), 30/09 (600), 29/09 (200) = 1600 / 5.
    assert.equal(c1.rythme.coupeParJour, 320, 'moyenne par jour actif sur les 5 derniers jours ; le futur et le 28/09 ne comptent pas');
    assert.equal(c1.rythme.chaineParJour, 300);
    assert.equal(c1.rythme.source, 'manuel');
    assert.equal(c1.rythme.ecartJours, c1.modeles[0].joursAvance);
    assert.equal(c1.rythme.modelId, 'R', 'le modele dont parlent cadence et avance');
    // La chaine 2 ne compte que ses modeles : 1000 pieces le 03/10, un seul jour actif.
    assert.equal(c2.rythme.coupeParJour, 1000);
    // Une chaine sans modele : rien a comparer.
    const [, libre] = chainesDeCoupe({ ...sans, evenements: [evR], settings: avecCadence(300) });
    assert.deepEqual(libre.rythme, { coupeParJour: undefined, chaineParJour: 0, source: 'planning', ecartJours: null });

    // Pour toute la salle.
    const salle = rythmeCoupe([m, autre], 5, '2026-10-05')!;
    assert.deepEqual([salle.jours, salle.pieces, salle.matelas], [5, 2600, 13]);
    assert.equal(salle.parJour, 520);
    assert.equal(rythmeCoupe([m], 7, '2026-10-05')!.jours, 6, 'moins de jours que demande : ceux qui existent');
    assert.equal(rythmeCoupe([m], 5, '2026-09-26'), null, 'aucune coupe avant cette date');
    assert.equal(rythmeCoupe([], 5, '2026-10-05'), null);
}

/* ------------------------------------------------------------------ */
/* Revue : la demande ne depasse pas ce qui reste a coudre             */
/* ------------------------------------------------------------------ */

const base5 = { suivis: [] as SuiviData[], joursAvance: 2, aujourdhui: '2026-10-05' };

// --- Tout est coupe, la chaine a presque tout fait entrer : rien ne manque, il n'y a plus de travail ---
{
    const m = modele('S1', dixMatelas(10), 2000);
    const ev = evenement('evS1', 'S1', 'CHAINE 1', '2026-10-01');
    // 1500 entrees, 1300 sorties : il reste 500 pieces a faire entrer, et elles sont deja coupees.
    const suivis = [suivi('evS1', '2026-10-01', 750, 650), suivi('evS1', '2026-10-02', 750, 650)];
    const x = chainesDeCoupe({ ...base5, models: [m], evenements: [ev], suivis, settings: reglages })[0].modeles[0];
    assert.equal(x.enAttente, 500);
    assert.equal(x.cadence, 650);
    assert.equal(x.planJour.statut, 'rien', 'plus rien a faire entrer au-dela de ce qui est pret');
    assert.equal(x.planJour.manque, undefined);
    assert.equal(vuePlan(x), 'toutCoupe');

    // Rien de cousu : tout est coupe, la commande entiere attend (1,3 jour de travail a 1500/jour) : rien ne manque.
    const y = chainesDeCoupe({ ...base5, models: [m], evenements: [ev], settings: avecCadence(1500) })[0].modeles[0];
    assert.equal(y.enAttente, 2000);
    assert.equal(y.planJour.statut, 'rien');
    assert.equal(y.planJour.manque, undefined);
    assert.equal(vuePlan(y), 'toutCoupe');
}

// --- L1 tout produit mais pas termine, L2 loin : on lit le lancement de L2, rien a couper avant ---
{
    const m = modele('S2', dixMatelas(5), 2000);
    const l1 = evenement('evS2a', 'S2', 'CHAINE 1', '2026-09-20', { modelName: 'S2 — L1', qteTotal: 1000, producedQuantity: 1000 });
    const l2 = evenement('evS2b', 'S2', 'CHAINE 1', '2026-11-04', { modelName: 'S2 — L2', qteTotal: 1000, status: 'READY' });
    const x = chainesDeCoupe({ ...base5, models: [m], evenements: [l1, l2], settings: avecCadence(800) })[0].modeles[0];
    assert.equal(x.lancement, '2026-11-04', 'L1 est tout produit : le lancement est celui de L2');
    assert.equal(x.joursAvantLancement, 30);
    assert.equal(x.plusTard, true);
    assert.equal(x.commencerLe, '2026-11-02');
    assert.equal(x.aCouperPieces, 0);
    assert.equal(vuePlan(x), 'plusTard');
    // L1 pas tout produit : son lancement reste le bon.
    const l1b = { ...l1, producedQuantity: 600 };
    const y = chainesDeCoupe({ ...base5, models: [m], evenements: [l1b, l2], settings: avecCadence(800) })[0].modeles[0];
    assert.equal(y.lancement, '2026-09-20');
    assert.equal(y.plusTard, false);
}

// --- Un OF termine (DONE) n'est pas une avance pour le suivant ---
{
    const m = modele('S3', dixMatelas(5), 2000); // 1000 pieces coupees, toutes pour L1
    const l1 = evenement('evS3a', 'S3', 'CHAINE 1', '2026-09-15', { modelName: 'S3 — L1', qteTotal: 1000, producedQuantity: 1000, status: 'DONE' });
    const l2 = evenement('evS3b', 'S3', 'CHAINE 1', '2026-10-01', { modelName: 'S3 — L2', qteTotal: 1000, status: 'READY' });
    const c = chainesDeCoupe({ ...base5, models: [m], evenements: [l1, l2], settings: avecCadence(800) })[0];
    const x = c.modeles[0];
    assert.equal(x.coupe, 1000);
    assert.equal(x.enAttente, 0, 'les 1000 pieces coupees ont deja ete cousues (L1 termine)');
    assert.equal(x.joursAvance, 0);
    assert.equal(c.etat, 'arret', 'rien de pret pour L2 : la chaine va s’arreter');
    // L2 demande 1000 pieces (pas 1600 : la chaine n'a que 1000 a coudre) : les 5 matelas restants.
    assert.equal(x.aCouperPieces, 1000);
    assert.equal(x.matelas.length, 5);
    assert.equal(x.planJour.statut, 'a_couper');
}

// --- Rythme de coupe : seuls les matelas des paquets de la chaine comptent ---
{
    const lignes = Array.from({ length: 6 }, (_, i) => ligne(String(i + 1), 100, { S: 1, M: 1 }, i >= 3 ? { fait: true, fin: '2026-10-03T10:00:00' } : {}));
    const m = modele('S4', lignes, 1200);
    const saisies: Record<string, { chaine: string }> = {};
    for (const [i, l] of lignes.entries()) for (const t of ['S', 'M']) saisies[`${l.id}:${t}:0`] = { chaine: i < 3 ? 'CHAINE 1' : 'CHAINE 2' };
    (m.ordreCoupe as any).serie = { saisies };
    const ev = evenement('evS4', 'S4', 'CHAINE 1', '2026-10-01');
    const [c1, c2] = chainesDeCoupe({ ...base5, models: [m], evenements: [ev], settings: avecCadence(800) });
    assert.equal(c2.rythme.coupeParJour, 600, 'la chaine 2 a vu couper ses trois matelas (3 x 200 pieces)');
    assert.equal(c1.rythme.coupeParJour, undefined, 'la chaine 1 n’a rien vu couper : les matelas 4 a 6 sont ceux de la chaine 2');
}

// --- Totaux de la page : un matelas partage entre deux chaines ne compte qu'une fois ---
{
    const partage = modele('S5', [ligne('1', 100, { S: 1, M: 1 })], 200);
    const l0 = partage.ordreCoupe!.matelasLines[0];
    (partage.ordreCoupe as any).serie = { saisies: { [`${l0.id}:S:0`]: { chaine: 'CHAINE 1' }, [`${l0.id}:M:0`]: { chaine: 'CHAINE 2' } } };
    const ev5 = evenement('evS5', 'S5', 'CHAINE 1', '2026-10-01', { qteTotal: 200 });
    const [p1, p2] = chainesDeCoupe({ ...base5, models: [partage], evenements: [ev5], settings: avecCadence(800) });
    assert.equal(p1.matelasACouper + p2.matelasACouper, 2, 'chaque chaine voit le matelas dans son plan');
    assert.deepEqual(totauxPlanJour([p1, p2]), { matelas: 1, pieces: 200 }, 'un seul matelas, ses 200 pieces (100 + 100)');
}

// --- Jours ouvres : la semaine de travail et les exceptions du Planning ---
{
    const m = modele('S6', dixMatelas(), 2000);
    const ev = evenement('evS6', 'S6', 'CHAINE 1', '2026-10-01');
    const cherche = (aujourdhui: string, extra: Partial<AppSettings> = {}) =>
        chainesDeCoupe({ models: [m], evenements: [ev], suivis: [], settings: { ...avecCadence(200), ...extra } as AppSettings, joursAvance: 2, aujourdhui })[0].modeles[0].planJour.couvreJusqua;
    // Jeudi 15/10 + 2 jours ouvres : lundi 19 (samedi et dimanche ne travaillent pas par defaut).
    assert.equal(cherche('2026-10-15'), '2026-10-19');
    // Samedi travaille : vendredi 16, samedi 17.
    assert.equal(cherche('2026-10-15', { workingDays: [1, 2, 3, 4, 5, 6] }), '2026-10-17');
    // Dimanche travaille, samedi non : vendredi 16 (1), samedi saute, dimanche 18 (2).
    assert.equal(cherche('2026-10-15', { workingDays: [1, 2, 3, 4, 5, 7] }), '2026-10-18');
    // Vendredi 16 ferme (exception) : lundi 19 (1), mardi 20 (2).
    assert.equal(cherche('2026-10-15', { calendarExceptions: { '2026-10-16': { isWorking: false } } as any }), '2026-10-20');
}

// --- Chaine par defaut des paquets : le premier OF qui n'est pas en pause ---
{
    const m = modele('S7', dixMatelas(), 2000);
    const pause = evenement('evS7a', 'S7', 'CHAINE 1', '2026-10-01', { modelName: 'S7 — L1', status: 'BLOCKED_STOCK', qteTotal: 1000 });
    const actif = evenement('evS7b', 'S7', 'CHAINE 2', '2026-10-10', { modelName: 'S7 — L2', qteTotal: 1000, status: 'READY' });
    const [c1, c2] = chainesDeCoupe({ ...base5, models: [m], evenements: [pause, actif], settings: avecCadence(300) });
    const y = c2.modeles[0];
    assert.equal(y.serieAbsente, false, 'les paquets sans chaine vont a la chaine de l’OF actif');
    assert.equal(y.serie !== null, true);
    assert.equal(y.commande, 2000);
    assert.equal(c1.modeles[0].serieAbsente, true, 'la chaine de l’OF en pause n’a aucun paquet');
}

console.log('coupeChaines : OK');
