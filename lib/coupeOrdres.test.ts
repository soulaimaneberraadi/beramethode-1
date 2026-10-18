/**
 * Lancer: node --import tsx lib/coupeOrdres.test.ts
 */
import assert from 'node:assert/strict';
import type { AppSettings, MatelasLine, ModelData, PlanningEvent } from '../types';
import { chainesDeCoupe } from './coupeChaines';
import { resumerOrdre } from './coupeAtelier';
import { ecartsPlan } from './coupeVues';
import {
    compterFiltres, filtrerOrdres, kpisOrdres, lignesOrdres, pedidosParModele, trierOrdres,
    type CriteresOrdres, type LigneOrdre,
} from './coupeOrdres';

const JOUR = '2026-10-18';
const reglages = { chainsCount: 2, chainNames: { 'CHAINE 1': 'STAR1+2' }, chainCapacityPerDay: { 'CHAINE 1': 800, 'CHAINE 2': 500 } } as unknown as AppSettings;

let n = 0;
const ligne = (plis: number, ratios: Record<string, number>, extra: Partial<MatelasLine> = {}): MatelasLine =>
    ({ id: `l${n++}`, numero: String(n), plis, longTracee: 1, ratios, ...extra });
const modele = (id: string, lignes: MatelasLine[], fiche: any = {}, status: any = 'EN_COURS', extra: any = {}): ModelData => ({
    id, filename: id,
    meta_data: { nom_modele: id, date_creation: '2026-08-01', total_temps: 0, effectif: 0 },
    gamme_operatoire: [],
    ficheData: fiche,
    ordreCoupe: { refModele: id, longueurMatelas: 0, consommation: 0, nbrFeuilles: 0, nbrMatelas: 0, qteTotale: 99999, status, matelasLines: lignes, ...extra },
} as unknown as ModelData);
const evenement = (id: string, modelId: string, extra: Partial<PlanningEvent> = {}): PlanningEvent =>
    ({ id, modelId, modelName: `${modelId} — L1`, chaineId: 'CHAINE 1', dateLancement: '2026-10-10', qteTotal: 300, status: 'IN_PROGRESS', ...extra } as PlanningEvent);
const par = (lignes: LigneOrdre[], id: string) => lignes.find(l => l.m.id === id)!;
const tous = (c: Partial<CriteresOrdres> = {}): CriteresOrdres => ({ filtre: 'tous', statut: null, chaine: null, q: '', ...c });

// --- Une seule definition de « a couper », et l'ecart du plan sans borne ---
{
    // Commande 300 (XS 100, M 200). Plan : XS 50 + M 100 coupes, M 130 pas encore coupes.
    const m = modele('A', [
        ligne(10, { XS: 5, M: 10 }, { fait: true, fin: '2026-10-17T10:00:00' }),
        ligne(10, { M: 13 }),
        ligne(5, { XS: 9 }, { tissu: 'vlies' }),
    ], { sizes: ['XS', 'M'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 100, n_1: 200 } });
    const e = ecartsPlan(m);
    assert.deepEqual(e.map(x => [x.taille, x.commande, x.planifie, x.ecart]), [['XS', 100, 50, -50], ['M', 200, 230, 30]], 'planifie - commande, la vlieseline ne compte pas');
    assert.equal(e[0].couleur, '', 'matelas sans couleur : taille par taille');
    const l = lignesOrdres([m], [], [], JOUR)[0];
    assert.equal(l.b.commande, 300);
    assert.equal(l.b.coupe, 150);
    assert.equal(l.b.reste, 150, 'commande - coupe, pas les matelas qui restent (130)');
    assert.equal(resumerOrdre(m).aCouper, 130, 'l’ancien chiffre « planifie pas coupe » differe : la page ne l’utilise plus');
    assert.deepEqual(l.ecarts, e);
    assert.equal(l.etat, 'en_cours');
}

// --- Ecart couleur par couleur quand chaque matelas dit la sienne ---
{
    const m = modele('B', [
        ligne(10, { S: 1 }, { couleur: 'Noir' }),
        ligne(10, { S: 1 }, { couleur: 'rouge ' }),
    ], { sizes: ['S'], colors: [{ id: 'n', name: 'Noir' }, { id: 'r', name: 'Rouge' }], gridQuantities: { n_0: 10, r_0: 4 } });
    const e = ecartsPlan(m);
    assert.deepEqual(e.map(x => [x.couleur, x.taille, x.ecart]), [['Rouge', 'S', 6]], 'Noir tombe juste ; Rouge (casse et espaces ignores) a 6 de trop');
}

// --- Une taille que seuls les matelas portent ; une couleur dite sur une partie des matelas seulement ---
{
    const hors = modele('H', [ligne(10, { S: 1, XL: 1 })], { sizes: ['S'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 10 } });
    assert.deepEqual(ecartsPlan(hors).map(x => [x.taille, x.ecart]), [['XL', 10]], 'XL n’est pas commande : tout est en surplus');
    const mixte = modele('I', [ligne(10, { S: 1 }, { couleur: 'Noir' }), ligne(5, { S: 1 })], { sizes: ['S'], colors: [{ id: 'n', name: 'Noir' }, { id: 'r', name: 'Rouge' }], gridQuantities: { n_0: 10, r_0: 5 } });
    assert.deepEqual(ecartsPlan(mixte), [], 'un matelas sans couleur : on compare taille par taille (15 pour 15)');
}

// --- Rien a comparer : commande en bloc, ou pas de matelas ---
{
    assert.deepEqual(ecartsPlan(modele('C', [ligne(10, { S: 1 })], { sizes: ['S'], quantity: 100 })), [], 'commande sans repartition');
    assert.deepEqual(ecartsPlan(modele('D', [], { sizes: ['S'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 50 } })), [], 'pas encore de plan : pas d’ecart');
    assert.deepEqual(ecartsPlan(modele('E', [ligne(10, { S: 1 }, { couleur: 'Noir' })], { sizes: ['S'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 10 } })), [], 'plan juste');
}

// --- Pedidos : export le plus proche, pause, termines ecartes, nom de la chaine ---
{
    const m = modele('P', [ligne(100, { S: 1 })], { sizes: ['S'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 100 } });
    const evs = [
        evenement('e1', 'P', { modelName: 'P — L2', strictDeadline_DDS: '2026-11-20' }),
        evenement('e2', 'P', { modelName: 'P — L1', strictDeadline_DDS: '2026-11-05' }),
        evenement('e3', 'P', { modelName: 'P — L3', strictDeadline_DDS: '2026-10-25', status: 'BLOCKED_STOCK' }),
        evenement('e4', 'P', { modelName: 'P — L0', strictDeadline_DDS: '2026-09-01', status: 'DONE' }),
        evenement('e5', 'P', { modelName: 'P — L4', dateExport: '2026-10-01' }), // fin calculee du Planning : jamais un export
    ];
    const chaines = chainesDeCoupe({ models: [m], evenements: evs, suivis: [], settings: reglages, joursAvance: 2, aujourdhui: JOUR });
    const p = pedidosParModele(evs, chaines).get('P')!;
    assert.deepEqual(p.map(x => x.code), ['L3', 'L1', 'L2', 'L4'], 'export le plus proche d’abord, sans export a la fin, DONE ecarte');
    assert.equal(p[0].chaine, 'STAR1+2', 'le nom de la chaine de La Coupe');
    assert.equal(p[3].export, '', 'dateExport n’est pas la date du client');
    const l = lignesOrdres([m], evs, chaines, JOUR)[0];
    assert.equal(l.prochain?.code, 'L1', 'le pedido en pause ne donne pas la prochaine echeance');
    assert.equal(l.echeance, '2026-11-05');
    assert.equal(l.joursExport, 18);
    assert.equal(l.exportDepasse, false);
    assert.equal(l.enPause, false);
    assert.equal(l.chaines.length, 1);
}

// --- Echeance : l'export, a defaut le lancement ; pause totale ; export depasse ---
{
    const m1 = modele('Q1', [ligne(100, { S: 1 })], { sizes: ['S'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 100 } });
    const m2 = modele('Q2', [ligne(100, { S: 1 })], { sizes: ['S'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 100 } });
    const m3 = modele('Q3', [ligne(100, { S: 1 })], { sizes: ['S'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 100 } });
    const m4 = modele('Q4', [ligne(100, { S: 1 })], { sizes: ['S'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 100 } });
    const evs = [
        evenement('q1', 'Q1', { dateLancement: '2026-10-22' }), // pas de DDS : le lancement
        evenement('q2', 'Q2', { strictDeadline_DDS: '2026-10-10' }), // depasse
        evenement('q3', 'Q3', { status: 'BLOCKED_STOCK', strictDeadline_DDS: '2026-10-01' }),
    ];
    const lignes = lignesOrdres([m1, m2, m3, m4], evs, [], JOUR);
    assert.equal(par(lignes, 'Q1').echeance, '2026-10-22');
    assert.equal(par(lignes, 'Q1').joursExport, null);
    assert.equal(par(lignes, 'Q2').exportDepasse, true);
    assert.equal(par(lignes, 'Q2').joursExport, -8);
    assert.equal(par(lignes, 'Q3').enPause, true);
    assert.equal(par(lignes, 'Q3').echeance, null, 'tout en pause : pas d’echeance');
    assert.equal(par(lignes, 'Q3').exportDepasse, false, 'un pedido en pause n’est pas en retard d’export');
    assert.equal(par(lignes, 'Q4').echeance, null, 'sans Planning');
    // Tri par export : le plus proche (meme depasse), puis le lancement, puis les sans-date.
    assert.deepEqual(trierOrdres(lignes, 'export').map(l => l.m.id), ['Q2', 'Q1', 'Q3', 'Q4']);
}

// --- Etats, anciens, filtres et compteurs ---
{
    const fiche = { sizes: ['S'], colors: [{ id: 'n', name: 'Noir' }], gridQuantities: { n_0: 100 } };
    const neuf = modele('N', [ligne(100, { S: 1 })], fiche, 'EN_PREPARATION');
    const enCours = modele('C', [ligne(40, { S: 1 }, { fait: true, fin: '2026-10-16T09:00:00' }), ligne(60, { S: 1 })], fiche);
    const presque = modele('F', [ligne(92, { S: 1 }, { fait: true, fin: '2026-10-17T09:00:00' }), ligne(8, { S: 1 })], fiche, 'SOUS_TRAITANCE');
    const vieux = modele('V', [ligne(30, { S: 1 }, { fait: true, fin: '2026-09-20T09:00:00' }), ligne(70, { S: 1 })], fiche);
    const depasse = modele('X', [ligne(100, { S: 1 })], fiche, 'EN_PREPARATION', { majLe: '2026-10-17T08:00:00' });
    const plusLeger = modele('L', [ligne(100, { S: 1 })], { ...fiche, gridQuantities: { n_0: 120 } }, 'EN_PREPARATION', { majLe: '2026-10-17T08:00:00' });
    const solde = modele('S', [ligne(100, { S: 1 }, { fait: true })], fiche, 'VALIDE');
    const evs = [
        evenement('f1', 'F', { strictDeadline_DDS: '2026-10-30', chaineId: 'CHAINE 2' }),
        evenement('x1', 'X', { strictDeadline_DDS: '2026-10-01' }),
        evenement('p1', 'C', { status: 'BLOCKED_STOCK' }),
    ];
    const models = [neuf, enCours, presque, vieux, depasse, plusLeger, solde];
    const chaines = chainesDeCoupe({ models, evenements: evs, suivis: [], settings: reglages, joursAvance: 2, aujourdhui: JOUR });
    const lignes = lignesOrdres(models, evs, chaines, JOUR);

    assert.equal(lignes.length, 6, 'un ordre solde n’est pas dans la page');
    assert.deepEqual(['N', 'C', 'F', 'V', 'X', 'L'].map(id => par(lignes, id).etat), ['nouveau', 'en_cours', 'presque', 'en_cours', 'nouveau', 'nouveau']);
    assert.equal(par(lignes, 'V').joursInactif, 28);
    assert.equal(par(lignes, 'V').ancien, true, 'plus de 14 jours sans coupe');
    assert.equal(par(lignes, 'X').ancien, true, 'export depasse');
    assert.equal(par(lignes, 'N').joursInactif, null, 'jamais coupe, jamais enregistre : on ne sait pas');
    assert.equal(par(lignes, 'N').ancien, false, 'la date de creation du modele ne rend pas l’ordre ancien');
    assert.equal(par(lignes, 'C').ancien, false);
    assert.equal(par(lignes, 'L').ancien, false, 'modifie hier');

    const ids = (c: Partial<CriteresOrdres>) => filtrerOrdres(lignes, tous(c)).map(l => l.m.id).sort().join('');
    assert.equal(ids({ filtre: 'nouveaux' }), 'LNX');
    assert.equal(ids({ filtre: 'enCours' }), 'CV');
    assert.equal(ids({ filtre: 'presque' }), 'F');
    assert.equal(ids({ filtre: 'anciens' }), 'VX');
    assert.equal(ids({ filtre: 'ecarts' }), 'L', 'plan 100 pour une commande de 120');
    assert.equal(ids({ filtre: 'pause' }), 'C', 'tous ses pedidos sont en pause');
    assert.equal(ids({ statut: 'SOUS_TRAITANCE' }), 'F');
    assert.equal(ids({ statut: 'EN_PREPARATION' }), 'LNX');
    assert.equal(ids({ chaine: 'CHAINE 2' }), 'F', 'la chaine du pedido');
    assert.equal(ids({ q: 'v' }), 'V');
    assert.equal(ids({ filtre: 'nouveaux', statut: 'EN_PREPARATION', q: 'x' }), 'X', 'les criteres se cumulent');

    const compte = compterFiltres(lignes, tous({ statut: 'EN_PREPARATION' }));
    assert.equal(compte.tous, 3);
    assert.equal(compte.nouveaux, 3);
    assert.equal(compte.enCours, 0, 'les compteurs suivent les autres criteres');
    assert.equal(compte.ecarts, 1);

    // Les chiffres du haut suivent les filtres.
    const k = kpisOrdres(filtrerOrdres(lignes, tous({ filtre: 'nouveaux' })));
    assert.deepEqual(k, { ordres: 3, aCouper: 100 + 100 + 120, coupees: 0, ecarts: 1 });
    const kTout = kpisOrdres(lignes);
    assert.equal(kTout.ordres, 6);
    assert.equal(kTout.coupees, 40 + 92 + 30);
    assert.equal(kTout.aCouper, 100 + 60 + 8 + 70 + 100 + 120);

    // Lots en retard : le filtre lit le nombre de lots dont une matiere manque.
    const retard = lignes.map(l => (l.m.id === 'N' ? { ...l, retards: 2 } : l));
    assert.deepEqual(filtrerOrdres(retard, tous({ filtre: 'retard' })).map(l => l.m.id), ['N']);

    // Tris : plus a couper, moins avance.
    assert.deepEqual(trierOrdres(lignes, 'aCouper').slice(0, 2).map(l => l.m.id), ['L', 'N']);
    assert.equal(trierOrdres(lignes, 'avancement').at(-1)!.m.id, 'F');
    assert.deepEqual(trierOrdres(retard, 'retard')[0].m.id, 'N');
}

console.log('coupeOrdres : ok');
