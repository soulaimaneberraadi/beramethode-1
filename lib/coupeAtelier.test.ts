/**
 * Lancer: node --import tsx lib/coupeAtelier.test.ts
 */
import assert from 'node:assert/strict';
import type { GroupeCoupe, MatelasLine, ModelData } from '../types';
import {
    AMORCE_PAR_PLI_M, consoTissu, dureeMinutes, estOuvert, matelasExecutes, metresLigne,
    piecesLigne, presenceGroupes, resumerOrdre, statsGroupes,
} from './coupeAtelier';

const presque = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} != ${b}`);

const ligne = (x: Partial<MatelasLine>): MatelasLine => ({ id: Math.random().toString(36), plis: 0, longTracee: 0, ratios: {}, ...x });
const modele = (id: string, status: any, lignes: MatelasLine[], extra: Partial<ModelData> = {}): ModelData => ({
    id, filename: id,
    meta_data: { nom_modele: id, date_creation: '2026-09-01', total_temps: 0, effectif: 0 },
    gamme_operatoire: [],
    ordreCoupe: { refModele: id, longueurMatelas: 0, consommation: 0, nbrFeuilles: 0, nbrMatelas: 0, qteTotale: 0, status, matelasLines: lignes },
    ...extra,
} as ModelData);

// --- Pieces et metres d'un matelas ---
{
    const l = ligne({ plis: 40, longTracee: 5, ratios: { S: 1, M: 2, L: 1 } });
    assert.equal(piecesLigne(l), 160);
    presque(metresLigne(l), 40 * (5 + AMORCE_PAR_PLI_M));
    assert.equal(metresLigne(ligne({ plis: 40, longTracee: 5, ratios: {} })), 0, 'sans taille : rien n est etale');
}

// --- Duree : il faut les deux bornes, et un ecart plausible ---
{
    assert.equal(dureeMinutes({ debut: '2026-09-25T08:00:00Z', fin: '2026-09-25T08:45:00Z' }), 45);
    assert.equal(dureeMinutes({ debut: '2026-09-25T08:00:00Z' }), null);
    assert.equal(dureeMinutes({ debut: '2026-09-25T09:00:00Z', fin: '2026-09-25T08:00:00Z' }), null, 'fin avant debut');
    assert.equal(dureeMinutes({ debut: '2026-09-24T08:00:00Z', fin: '2026-09-25T09:00:00Z' }), null, 'pointage oublie');
}

// --- Ordres : ouvert tant qu'il n'est pas solde ---
{
    assert.ok(estOuvert(modele('a', 'EN_PREPARATION', [])));
    assert.ok(estOuvert(modele('a', 'SOUS_TRAITANCE', [])));
    assert.ok(!estOuvert(modele('a', 'VALIDE', [])));
    assert.ok(!estOuvert(modele('a', 'REJETE', [])));

    const m = modele('b', 'EN_COURS', [
        ligne({ plis: 10, longTracee: 2, ratios: { S: 2 }, fait: true }),
        ligne({ plis: 10, longTracee: 2, ratios: { S: 3 } }),
    ]);
    m.ordreCoupe!.qteTotale = 50;
    const r = resumerOrdre(m);
    assert.equal(r.coupees, 20);
    assert.equal(r.aCouper, 30);
    assert.equal(r.nbFaits, 1);
    presque(r.avancement, 0.4);

    const sansMatelas = modele('c', 'EN_PREPARATION', []);
    sansMatelas.ordreCoupe!.qteTotale = 300;
    assert.equal(resumerOrdre(sansMatelas).aCouper, 300, 'sans matelas : la quantite entiere reste a couper');

    const solde = modele('d', 'VALIDE', [ligne({ plis: 10, longTracee: 2, ratios: { S: 3 } })]);
    assert.equal(resumerOrdre(solde).aCouper, 0, 'un ordre solde ne laisse rien a couper');
}

// --- Tissu : prevu, consomme, recu ---
{
    const m = modele('t', 'EN_COURS', [
        ligne({ plis: 20, longTracee: 3, ratios: { M: 2 }, fait: true }),
        ligne({ plis: 10, longTracee: 3, ratios: { M: 2 } }),
    ]);
    m.ordreCoupe!.tissuRecu = 50;
    const c = consoTissu(m);
    presque(c.consommeM, 20 * 3.03);
    presque(c.prevuM, 30 * 3.03);
    presque(c.resteM, 10 * 3.03);
    presque(c.ecartRecuM!, 50 - 30 * 3.03);
    assert.equal(c.piecesCoupees, 40);
    presque(c.mParPiece!, (20 * 3.03) / 40);
    assert.equal(consoTissu(modele('x', 'EN_COURS', [])).recuM, null, 'recu non saisi : pas un zero');
}

// --- Groupes : seuls les matelas coupes ET attribues comptent ---
const groupes: GroupeCoupe[] = [
    { id: 'A', nom: 'Groupe A', membres: ['w1', 'w2'] },
    { id: 'B', nom: 'Groupe B', membres: ['w3'] },
    { id: 'C', nom: 'Groupe C', membres: [] },
];
{
    const m = modele('g', 'EN_COURS', [
        // A : 60 m en 30 min -> 120 m/h
        ligne({ plis: 20, longTracee: 3 - AMORCE_PAR_PLI_M, ratios: { S: 1 }, fait: true, groupe: 'A', debut: '2026-09-25T08:00:00Z', fin: '2026-09-25T08:30:00Z' }),
        // B : 60 m en 60 min -> 60 m/h
        ligne({ plis: 20, longTracee: 3 - AMORCE_PAR_PLI_M, ratios: { S: 1 }, fait: true, groupe: 'B', debut: '2026-09-25T09:00:00Z', fin: '2026-09-25T10:00:00Z' }),
        // B sans chrono : compte en volume, pas dans la moyenne
        ligne({ plis: 10, longTracee: 3 - AMORCE_PAR_PLI_M, ratios: { S: 1 }, fait: true, groupe: 'B' }),
        // pas coupe : ignore
        ligne({ plis: 99, longTracee: 9, ratios: { S: 1 }, groupe: 'A' }),
        // coupe sans groupe : ignore
        ligne({ plis: 99, longTracee: 9, ratios: { S: 1 }, fait: true }),
    ]);
    const ex = matelasExecutes([m]);
    assert.equal(ex.length, 3);
    assert.deepEqual(ex.map(x => x.numero), [2, 1, 3], 'du plus recent au plus ancien, n° de ligne conserve');

    const s = statsGroupes(ex, groupes);
    const par = Object.fromEntries(s.map(x => [x.groupeId, x]));
    presque(par.A.metresParHeure!, 120);
    presque(par.B.metresParHeure!, 60, 'le matelas non chronometre ne fausse pas la cadence');
    assert.equal(par.B.nb, 2);
    presque(par.B.metres, 90);
    assert.equal(par.A.rang, 1);
    assert.equal(par.B.rang, 2);
    assert.equal(par.C.rang, null, 'rien de chronometre : pas de rang');
    assert.equal(s[s.length - 1].groupeId, 'C');

    const depuis = Date.parse('2026-09-25T08:45:00Z');
    assert.equal(statsGroupes(ex, groupes, depuis).find(x => x.groupeId === 'A')!.nb, 0, 'periode respectee');
}

// --- Presence : pointage du jour, par groupe ---
{
    const ouvriers = [
        { id: 'w1', full_name: 'Ahmed', matricule: 'M1' },
        { id: 'w2', full_name: 'Fatima', matricule: 'M2' },
        { id: 'w3', full_name: 'Said', matricule: 'M3' },
    ];
    const pointage = [
        { worker_id: 'w1', date: '2026-09-25', statut: 'PRESENT', heure_entree: '07:58' },
        { worker_id: 'w2', date: '2026-09-25', statut: 'ABSENT' },
        { worker_id: 'w3', date: '2026-09-24', statut: 'PRESENT' }, // la veille : ne compte pas
    ];
    const p = presenceGroupes(groupes, ouvriers, pointage, '2026-09-25');
    const par = Object.fromEntries(p.map(x => [x.groupeId, x]));
    assert.equal(par.A.presents, 1);
    assert.ok(par.A.estPresent);
    assert.equal(par.A.membres[0].entree, '07:58');
    assert.equal(par.B.membres[0].statut, 'NON_POINTE', 'pointage d un autre jour ignore');
    assert.ok(!par.B.estPresent);
    assert.ok(!par.C.estPresent);
}

console.log('coupeAtelier: OK');
