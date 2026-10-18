/**
 * Lancer: node --import tsx lib/coupeChoixModele.test.ts
 */
import assert from 'node:assert/strict';
import type { AppSettings, MatelasLine, ModelData, PlanningEvent, ReglageChaineCoupe } from '../types';
import {
    affecterPedido, basculerPause, categorieStatut, chaineDuPlanning, codeLotDe, commencerCoupeLe, creerPedido, erreurAffectation,
    pedidosDuModele, prochainCodeLot, quantitePlanifiee, resteAPlanifier, trouverChaine,
} from './coupeChoixModele';
import { chainesDeCoupe } from './coupeChaines';

const settings = { chainsCount: 3, chainNames: { 'CHAINE 1': 'STAR1+2' }, chainCapacityPerDay: { 'CHAINE 1': 800, 'CHAINE 2': 500, 'CHAINE 3': 400 } } as unknown as AppSettings;

const ligne = (id: string, fait = false): MatelasLine => ({ id, numero: id, plis: 100, longTracee: 1, ratios: { S: 1, M: 1 }, fait } as unknown as MatelasLine);
const modele = (id: string, quantite = 2000): ModelData => ({
    id, meta_data: { nom_modele: `Art ${id}`, sizes: ['S', 'M'], total_temps: 12 },
    ficheData: { sizes: ['S', 'M'], client: 'Zara', gridQuantities: { c_0: quantite / 2, c_1: quantite / 2 } },
    ordreCoupe: { refModele: id, longueurMatelas: 0, consommation: 0, nbrFeuilles: 0, nbrMatelas: 0, qteTotale: 0, status: 'EN_COURS', matelasLines: [ligne('1'), ligne('2'), ligne('3')] },
} as unknown as ModelData);
const evenement = (id: string, modelId: string, extra: Partial<PlanningEvent> = {}): PlanningEvent =>
    ({ id, modelId, chaineId: 'CHAINE 1', dateLancement: '2026-10-05', dateExport: '2026-11-20', qteTotal: 1000, status: 'READY', modelName: 'Art A — L1', ...extra } as PlanningEvent);

// --- Chaine : quel identifiant ecrire au Planning ---
{
    // L'id « CHAINE n » du Planning est ecrit tel quel ; le nom d'usage (chainNames) y ramene aussi.
    assert.deepEqual(chaineDuPlanning({ id: 'CHAINE 2', nom: 'CHAINE 2' }, settings), { id: 'CHAINE 2', connue: true });
    assert.deepEqual(chaineDuPlanning({ id: 'CHAINE 1', nom: 'STAR1+2' }, settings), { id: 'CHAINE 1', connue: true });
    const regl: ReglageChaineCoupe[] = [{ id: 'COUPE 1', nom: 'Salle B', alias: ['star1+2'] }];
    assert.deepEqual(chaineDuPlanning({ id: 'COUPE 1', nom: 'Salle B', alias: ['star1+2'] }, settings, regl), { id: 'Salle B', connue: false },
        'CHAINE 1 ne ramene pas a COUPE 1 une fois relu : on ecrit le nom, que la coupe sait relire');
    // Un alias « CHAINE 3 » : la chaine de la coupe est celle du Planning, et CHAINE 3 se relit sur elle.
    const reglAlias: ReglageChaineCoupe[] = [{ id: 'COUPE 2', nom: 'Salle C', alias: ['CHAINE 3'] }];
    assert.deepEqual(chaineDuPlanning({ id: 'COUPE 2', nom: 'Salle C', alias: ['CHAINE 3'] }, settings, reglAlias), { id: 'CHAINE 3', connue: true });
    // Chaine propre a la coupe : son nom, inconnu du Planning.
    assert.deepEqual(chaineDuPlanning({ id: 'COUPE 3', nom: ' Chaîne 9 ' }, settings), { id: 'Chaîne 9', connue: false });
    // Les accents ne comptent pas : « Chaîne 3 » (chaine ajoutee dans La Coupe) est « CHAINE 3 » du Planning.
    const reglAjout: ReglageChaineCoupe[] = [{ id: 'COUPE 5', nom: 'Chaîne 3' }];
    assert.deepEqual(chaineDuPlanning({ id: 'COUPE 5', nom: 'Chaîne 3' }, settings, reglAjout), { id: 'CHAINE 3', connue: true });
    assert.equal(trouverChaine('CHAINE 3', reglAjout)?.id, 'COUPE 5', 'la coupe relit le « CHAINE 3 » ecrit sur sa chaine');
    // Hors des chaines du Planning (chainsCount = 3) : inconnue.
    assert.equal(chaineDuPlanning({ id: 'CHAINE 7', nom: 'CHAINE 7' }, settings).connue, false);
    // Sans reglages du tout : 4 chaines par defaut, comme le reste de l'application.
    assert.equal(chaineDuPlanning({ id: 'CHAINE 4', nom: 'CHAINE 4' }).connue, true);

    assert.equal(trouverChaine('star1+2', [{ id: 'CHAINE 1', nom: 'STAR1+2' }])?.id, 'CHAINE 1');
    assert.equal(trouverChaine('chaine 1', [{ id: 'C', nom: 'x', alias: ['CHAINE 1'] }])?.id, 'C');
    assert.equal(trouverChaine('', [{ id: 'C', nom: 'x' }]), undefined);
}

// --- Pedidos d'un modele : tries, avec code de lot, statut, DDS ---
{
    const evs = [
        evenement('b', 'A', { modelName: 'Art A — L2', dateLancement: '2026-10-20', strictDeadline_DDS: '2026-12-01', status: 'BLOCKED_STOCK', qteTotal: 600 }),
        evenement('a', 'A', { modelName: 'Art A — L1', dateLancement: '2026-10-05', strictDeadline_DDS: '2026-11-15', status: 'IN_PROGRESS', producedQuantity: 200, isLocked: true }),
        evenement('x', 'AUTRE', { qteTotal: 99 }),
        evenement('c', 'A', { modelName: 'Art A', dateLancement: '', startDate: '', status: 'DONE', qteTotal: 300 }),
    ];
    const p = pedidosDuModele(evs, 'A');
    assert.deepEqual(p.map(x => x.eventId), ['a', 'b', 'c'], 'du plus tot au plus tard ; sans date en dernier');
    assert.deepEqual(p.map(x => x.code), ['L1', 'L2', '']);
    assert.deepEqual(p.map(x => x.statut), ['en_cours', 'pause', 'termine']);
    assert.equal(p[0].export, '2026-11-15', 'la DDS, jamais la fin calculee (dateExport)');
    assert.equal(p[2].export, '', 'sans DDS : vide');
    assert.equal(p[0].verrouille, true);
    assert.equal(p[0].produit, 200);
    assert.equal(codeLotDe('Robe — Zara — L3'), 'L3');
    assert.equal(categorieStatut('EXTERNAL_PROCESS'), 'externe');
    assert.equal(categorieStatut('READY'), 'pret');

    assert.equal(prochainCodeLot(p), 'L3');
    assert.equal(prochainCodeLot([]), 'L1');
    assert.equal(prochainCodeLot([{ code: 'l7' }, { code: 'L 2' }, { code: 'ZARA' }]), 'L8');

    // Quantites : les pedidos de TOUS les statuts comptent (1000 + 600 + 300 hors autre modele).
    assert.equal(quantitePlanifiee(evs, 'A'), 1000 + 600 + 300);
    // Commande de 2000 : il reste 100 a planifier ; 2000 pieces deja planifiees : rien.
    assert.equal(resteAPlanifier(modele('A', 2000), evs), 100);
    assert.equal(resteAPlanifier(modele('A', 1500), evs), 0, 'jamais negatif');
    assert.equal(resteAPlanifier(modele('Z', 800), evs), 800, 'modele sans pedido : toute la commande');
}

// --- Debut de coupe conseille ---
{
    assert.equal(commencerCoupeLe('2026-10-20', 2), '2026-10-18');
    assert.equal(commencerCoupeLe('2026-03-01', 2), '2026-02-27', 'passe par-dessus la fin de mois');
    assert.equal(commencerCoupeLe('2026-10-20', 1.2), '2026-10-18', 'arrondi au-dessus, comme la page Chaines');
    assert.equal(commencerCoupeLe('2026-10-20', 0), '2026-10-20');
    assert.equal(commencerCoupeLe('', 2), null);
    assert.equal(commencerCoupeLe('20/10/2026', 2), null);
}

// --- Erreurs de saisie ---
{
    const ok = { chaineId: 'CHAINE 2', debut: '2026-10-20', export: '2026-11-20' };
    assert.equal(erreurAffectation(ok, false), null);
    assert.equal(erreurAffectation({ ...ok, export: '' }, false), null, 'export facultatif');
    assert.equal(erreurAffectation({ ...ok, chaineId: ' ' }, false), 'chaine');
    assert.equal(erreurAffectation({ ...ok, debut: '' }, false), 'debut');
    assert.equal(erreurAffectation({ ...ok, export: '2026-10-19' }, false), 'export', 'export avant le debut');
    assert.equal(erreurAffectation({ ...ok, export: '2026-10-20' }, false), null, 'le meme jour passe');
    assert.equal(erreurAffectation(ok, true), 'quantite', 'nouvelle commande sans quantite');
    assert.equal(erreurAffectation({ ...ok, quantite: '' }, true), 'quantite');
    assert.equal(erreurAffectation({ ...ok, quantite: 0 }, true), 'quantite');
    assert.equal(erreurAffectation({ ...ok, quantite: 12.5 }, true), 'quantite', 'des pieces entieres');
    assert.equal(erreurAffectation({ ...ok, quantite: 500 }, true), null);
    // Une chaine inconnue du Planning : l'OF n'aurait pas de ligne au Gantt, on refuse.
    assert.equal(erreurAffectation({ ...ok, chaineConnue: false }, false), 'chaine');
    assert.equal(erreurAffectation({ ...ok, chaineConnue: true }, false), null);
}

// --- Affecter un pedido existant : chaine, dates, date figee ; le reste ne bouge pas ---
{
    const m = modele('A');
    const ev = evenement('a', 'A', { strictDeadline_DDS: '2026-11-15', producedQuantity: 200, sizeColorDistribution: { c: { S: 500, M: 500 } } });
    const avant = JSON.stringify(ev);
    const r = affecterPedido(ev, { chaineId: 'CHAINE 2', debut: '2026-10-12', export: '2026-11-30' }, m, settings);
    assert.equal(JSON.stringify(ev), avant, 'l’OF d’origine n’est pas modifie');
    assert.equal(r.chaineId, 'CHAINE 2');
    assert.equal(r.dateLancement, '2026-10-12');
    assert.equal(r.startDate, '2026-10-12');
    assert.equal(r.strictDeadline_DDS, '2026-11-30');
    assert.equal(r.isLocked, true);
    assert.equal(r.qteTotal, 1000);
    assert.equal(r.producedQuantity, 200);
    assert.deepEqual(r.sizeColorDistribution, ev.sizeColorDistribution, 'la repartition couleur x taille reste');
    assert.equal(r.id, 'a');
    assert.ok(Number.isFinite(Date.parse(String(r.updatedAt))), 'la modification est horodatee (la synchronisation garde la plus recente)');
    assert.equal(affecterPedido(ev, { chaineId: 'CHAINE 2', debut: '2026-10-12' }, m, settings, 1760000000000).updatedAt, new Date(1760000000000).toISOString());
    // La fin calculee suit le nouveau debut (1000 pcs a 500/j environ : pas avant le debut).
    assert.ok(String(r.dateExport) > '2026-10-12', 'fin calculee apres le debut');
    assert.equal(r.estimatedEndDate, r.dateExport);
    // Sans nouvelle date d'export, celle du Planning reste.
    assert.equal(affecterPedido(ev, { chaineId: 'CHAINE 2', debut: '2026-10-12' }, m, settings).strictDeadline_DDS, '2026-11-15');
    // Sans reglages, on n'invente pas de fin.
    assert.equal(affecterPedido(ev, { chaineId: 'CHAINE 2', debut: '2026-10-12' }, m).dateExport, '2026-11-20');
}

// --- Nouvelle commande : memes champs que « Envoyer au Planning », lot suivant, date figee ---
{
    const m = modele('A');
    const existants = pedidosDuModele([evenement('a', 'A', { modelName: 'Art A — L1' }), evenement('b', 'A', { modelName: 'Art A — L2' })], 'A');
    const ev = creerPedido(m, { chaineId: 'CHAINE 3', debut: '2026-10-12', export: '2026-12-01', quantite: 400 }, existants, settings, 1760000000000);
    assert.equal(ev.id, 'plan_A_1760000000000');
    assert.equal(ev.modelName, 'Art A — L3');
    assert.equal(ev.chaineId, 'CHAINE 3');
    assert.equal(ev.dateLancement, '2026-10-12');
    assert.equal(ev.startDate, '2026-10-12');
    assert.equal(ev.strictDeadline_DDS, '2026-12-01');
    assert.equal(ev.qteTotal, 400);
    assert.equal(ev.totalQuantity, 400);
    assert.equal(ev.qteProduite, 0);
    assert.equal(ev.producedQuantity, 0);
    assert.equal(ev.status, 'READY');
    assert.equal(ev.isLocked, true);
    assert.equal(ev.updatedAt, new Date(1760000000000).toISOString());
    assert.equal(ev.clientName, 'Zara');
    assert.equal(ev.typeMarche, 'Local');
    assert.equal(ev.facteurPlanning, 60);
    assert.equal(ev.bufferLancement, 120);
    assert.ok(String(ev.dateExport) >= '2026-10-12');
    // Sans export saisi : pas de DDS inventee.
    assert.equal(creerPedido(m, { chaineId: 'CHAINE 3', debut: '2026-10-12', quantite: 400 }, [], settings, 1).strictDeadline_DDS, undefined);
    assert.equal(creerPedido(m, { chaineId: 'CHAINE 3', debut: '2026-10-12', quantite: 400 }, [], settings, 1).modelName, 'Art A — L1');
}

// --- Pause <-> reprise ---
{
    const pret = evenement('a', 'A');
    const enPause = basculerPause(pret);
    assert.equal(enPause.status, 'BLOCKED_STOCK');
    assert.equal(basculerPause(enPause).status, 'READY');
    assert.equal(basculerPause(basculerPause(evenement('b', 'A', { status: 'IN_PROGRESS', producedQuantity: 50 }))).status, 'IN_PROGRESS', 'repris : en cours, il a deja produit');
    const fini = evenement('c', 'A', { status: 'DONE' });
    assert.equal(basculerPause(fini), fini, 'un OF termine ne bouge pas');
    assert.ok(Number.isFinite(Date.parse(String(enPause.updatedAt))), 'la pause est horodatee');

    // La reprise rend le statut d'avant la pause.
    for (const statut of ['EXTERNAL_PROCESS', 'ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'IN_PROGRESS', 'READY'] as const) {
        const e = evenement('s', 'A', { status: statut });
        const p = basculerPause(e);
        assert.equal(p.status, 'BLOCKED_STOCK');
        assert.equal(p.pausedFrom, statut);
        const r = basculerPause(p);
        assert.equal(r.status, statut, `${statut} : repris tel quel`);
        assert.equal('pausedFrom' in r, false, 'plus de marque de pause une fois repris');
    }
    // Un vrai blocage de stock (pas de pausedFrom) : repris, sans sa raison ni ses manques de matiere.
    const bloque = evenement('d', 'A', {
        status: 'BLOCKED_STOCK', blockedReason: 'Stock insuffisant : fil',
        materialShortages: [{ name: 'fil', required: 10, available: 2, missing: 8 }],
    });
    const repris = basculerPause(bloque);
    assert.equal(repris.status, 'READY');
    assert.equal(repris.blockedReason, undefined);
    assert.equal(repris.materialShortages, undefined);
}

// --- Aller-retour avec la page Chaines : le pedido affecte apparait sur la chaine choisie ---
{
    const m = modele('A');
    const ev = evenement('a', 'A', { chaineId: 'CHAINE 1', dateLancement: '2026-10-05' });
    const entree = (evs: PlanningEvent[], reglages: ReglageChaineCoupe[] = []) =>
        chainesDeCoupe({ models: [m], evenements: evs, suivis: [], settings: { ...settings, chainesCoupe: reglages } as AppSettings, joursAvance: 2, aujourdhui: '2026-10-06' });

    const apres = affecterPedido(ev, { chaineId: chaineDuPlanning({ id: 'CHAINE 2', nom: 'CHAINE 2' }, settings).id, debut: '2026-10-06' }, m, settings);
    const [c1, c2] = entree([apres]);
    assert.equal(c1.modeles.length, 0, 'plus sur l’ancienne chaine');
    assert.deepEqual(c2.modeles.map(x => x.modelId), ['A']);
    assert.equal(c2.modeles[0].pedidos[0].verrouille, true);

    // Chaine de la coupe a part (COUPE 1, « Salle B ») : le nom ecrit ramene le pedido sur elle.
    const regl: ReglageChaineCoupe[] = [{ id: 'COUPE 1', nom: 'Salle B' }];
    const w = chaineDuPlanning({ id: 'COUPE 1', nom: 'Salle B' }, settings, regl);
    assert.deepEqual(w, { id: 'Salle B', connue: false });
    const sur = chainesDeCoupe({
        models: [m], evenements: [affecterPedido(ev, { chaineId: w.id, debut: '2026-10-06' }, m, settings)], suivis: [],
        settings: { ...settings, chainesCoupe: regl } as AppSettings, joursAvance: 2, aujourdhui: '2026-10-06',
    });
    assert.deepEqual(sur.find(c => c.id === 'COUPE 1')?.modeles.map(x => x.modelId), ['A']);

    // Une nouvelle commande de 400 pcs : une seule ligne par modele et chaine, quantite 400.
    const nouveau = creerPedido(m, { chaineId: 'CHAINE 3', debut: '2026-10-06', quantite: 400 }, pedidosDuModele([apres], 'A'), settings, 7);
    const [, , c3] = entree([apres, nouveau]);
    assert.equal(c3.modeles[0].commande, 400);
    assert.equal(c3.modeles[0].pedidos[0].code, 'L2');
}

console.log('coupeChoixModele : OK');
