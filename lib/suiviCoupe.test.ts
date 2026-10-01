/**
 * Lancer: node --import tsx lib/suiviCoupe.test.ts
 *
 * Encours par taille relu dans la serie de coupe, et effectif de chaine
 * resolu de la source la plus sure a la plus approximative.
 */
import assert from 'node:assert/strict';
import type { MatelasLine, ModelData, PlanningEvent, SuiviData } from '../types';
import { wipCoupe } from './suiviCoupe';
import { cleChaine, effectifChaineJour, presentsRH } from './effectifChaine';

const ligne = (id: string, numero: string, plis: number, ratios: Record<string, number>, extra: Partial<MatelasLine> = {}): MatelasLine =>
    ({ id, numero, plis, longTracee: 3, ratios, ...extra });

const modele = (lignes: MatelasLine[], saisies: Record<string, any> = {}): ModelData => ({
    id: 'M1', filename: 'x',
    meta_data: { nom_modele: 'X', date_creation: '', total_temps: 3, effectif: 25, sizes: ['S', 'M'] } as any,
    ficheData: { sizes: ['S', 'M'], colors: [{ id: 'c1', name: 'Noir' }], gridQuantities: { c1_0: 100, c1_1: 50 } } as any,
    ordreCoupe: { matelasLines: lignes, serie: { saisies } } as any,
} as any);

{
    // Paquets : a:S:0 (40 plis, coupe), a:M:0 (40 plis, coupe), b:S:0 (30 plis, non coupe).
    const m = modele(
        [ligne('a', '1', 40, { S: 1, M: 1 }, { fait: true, couleur: 'Noir' }), ligne('b', '2', 30, { S: 1 }, { couleur: 'Noir' })],
        {
            'a:S:0': { entree: '28/09/2026', chaine: 'CHAINE 1', sortie: '29/09/2026', pieces: -2 },
            'a:M:0': { entree: '28/09/2026', chaine: 'Chaîne 1' },
        },
    );
    const w = wipCoupe(m, 'CHAINE 1', ['CHAINE 1', 'CHAINE 2'])!;
    const S = w.lignes.find(l => l.taille === 'S')!;
    const M = w.lignes.find(l => l.taille === 'M')!;
    assert.deepEqual([S.commande, S.coupe, S.entre, S.sorti, S.encours], [100, 38, 38, 38, 0], 'S : correction -2, sorti');
    assert.deepEqual([M.commande, M.coupe, M.entre, M.sorti, M.encours], [50, 40, 40, 0, 40], 'M : entree sur « Chaîne 1 » (meme chaine)');
    assert.equal(w.total.encours, 40);
    assert.equal(w.sansChaine, 0);
    assert.equal(wipCoupe(m, 'CHAINE 2', ['CHAINE 1', 'CHAINE 2'])!.total.entre, 0, 'rien n est entre sur la chaine 2');
}

{
    // Entree sans chaine notee : attribuee seulement si le modele n'a qu'une chaine.
    const m = modele([ligne('a', '1', 40, { S: 1 }, { fait: true, couleur: 'Noir' })], { 'a:S:0': { entree: '28/09/2026' } });
    assert.equal(wipCoupe(m, 'CHAINE 1', ['CHAINE 1'])!.total.entre, 40, 'une seule chaine : on sait ou il est entre');
    const deux = wipCoupe(m, 'CHAINE 1', ['CHAINE 1', 'CHAINE 2'])!;
    assert.equal(deux.total.entre, 0, 'deux chaines : on ne devine pas');
    assert.equal(deux.sansChaine, 40);
}

{
    // Un paquet sorti sans date d'entree notee est entre : pas d'encours negatif.
    const m = modele([ligne('a', '1', 40, { S: 1 }, { fait: true })], { 'a:S:0': { sortie: '29/09/2026', chaine: 'CHAINE 1' } });
    const w = wipCoupe(m, 'CHAINE 1', ['CHAINE 1'])!;
    assert.deepEqual([w.total.entre, w.total.sorti, w.total.encours], [40, 40, 0]);
}

assert.equal(wipCoupe(modele([]), 'CHAINE 1', []), null, 'sans matelas : pas de serie');

{
    const plan: PlanningEvent[] = [{ id: 'OF1', modelId: 'M1', chaineId: 'CHAINE 1' } as any];
    const m = modele([]);
    const s = (extra: Partial<SuiviData>): SuiviData => ({ id: 'x', planningId: 'OF1', modelId: 'M1', chaineId: 'CHAINE 9', date: '2026-09-28', totalHeure: 100, ...extra } as any);
    const rh = {
        workers: [{ id: 1, chaine_id: 'Chaîne 1' }, { id: 2, chaine_id: 'CHAINE 1' }, { id: 3, chaine_id: 'CHAINE 1' }, { id: 4, chaine_id: 'CHAINE 2' }],
        pointages: [
            { worker_id: 1, date: '2026-09-28', statut: 'PRESENT' },
            { worker_id: 2, date: '2026-09-28', statut: 'RETARD' },
            { worker_id: 3, date: '2026-09-28', statut: 'ABSENT' },
            { worker_id: 4, date: '2026-09-28', statut: 'PRESENT' },
        ],
    };
    assert.equal(cleChaine('Chaîne 1'), cleChaine('CHAINE1'));
    assert.equal(presentsRH(rh, 'CHAINE 1', '2026-09-28'), 2, 'present + retard, absent exclu, autre chaine exclue');

    const base = { chaineId: 'CHAINE 1', date: '2026-09-28', planningEvents: plan, models: [m] };
    // La chaine de l'OF au Planning prime sur celle de la saisie.
    assert.deepEqual(effectifChaineJour({ ...base, suivis: [s({ totalWorkers: 30 })], rh }), { n: 30, source: 'effectifs' });
    assert.deepEqual(effectifChaineJour({ ...base, suivis: [s({ totalWorkers: 0 })], rh }), { n: 2, source: 'rh' });
    assert.deepEqual(effectifChaineJour({ ...base, suivis: [s({ totalWorkers: 0 })], rh: null }), { n: 25, source: 'equilibrage' });
    assert.deepEqual(effectifChaineJour({ ...base, suivis: [s({ totalWorkers: 0, totalHeure: 0 })], rh: null }), { n: 0, source: null }, 'rien produit : pas d effectif theorique');
}

console.log('suiviCoupe + effectifChaine : OK');
