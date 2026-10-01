/**
 * Effectif d'une chaine pour un jour : le denominateur du rendement.
 *
 * Sans effectif il n'y a pas de rendement (minutes gagnees / minutes de
 * presence). La page Suivi ne le lisait QUE dans la page Effectifs : une chaine
 * qui pointait ses ouvriers dans la RH, sans ressaisir le chiffre dans
 * Effectifs, restait a « — » toute la semaine, production saisie ou non.
 *
 * On prend donc la premiere source qui dit quelque chose, de la plus sure a la
 * plus approximative, et on DIT laquelle a servi :
 *   1. effectifs   — le chiffre saisi dans la page Effectifs pour ce jour ;
 *   2. rh          — les ouvriers de la chaine pointes presents (ou en retard) ;
 *   3. equilibrage — l'effectif prevu a l'equilibrage du modele produit ce jour
 *                    (theorique : a afficher comme tel).
 *
 * Lancer les tests : node --import tsx lib/effectifChaine.test.ts
 */
import type { ModelData, PlanningEvent, SuiviData } from '../types';

export type SourceEffectif = 'effectifs' | 'rh' | 'equilibrage';

export interface EffectifResolu {
    n: number;
    source: SourceEffectif | null;
}

export interface OuvrierRH { id: string | number; chaine_id?: string | null }
export interface PointageRH { worker_id: string | number; date: string; statut?: string | null }
export interface DonneesRH { workers: OuvrierRH[]; pointages: PointageRH[] }

/** « Chaîne 1 », « CHAINE 1 », « chaine1 » designent la meme chaine. */
export const cleChaine = (s?: string | null): string =>
    String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toUpperCase();

const STATUTS_PRESENTS = new Set(['PRESENT', 'RETARD']);

/** Chaine reelle d'une saisie : celle de son OF au Planning, sinon la sienne (meme regle que la page Effectifs). */
export const chaineDeSaisie = (s: SuiviData, planningEvents: PlanningEvent[]): string => {
    const plan = s.planningId ? planningEvents.find(p => p.id === s.planningId) : undefined;
    return plan?.chaineId || s.chaineId || '';
};

/** Ouvriers de la chaine pointes presents ce jour. */
export function presentsRH(rh: DonneesRH | null | undefined, chaineId: string, date: string): number {
    if (!rh) return 0;
    const cle = cleChaine(chaineId);
    const surLaChaine = new Set(rh.workers.filter(w => cleChaine(w.chaine_id) === cle).map(w => String(w.id)));
    if (!surLaChaine.size) return 0;
    const presents = new Set<string>();
    for (const p of rh.pointages) {
        if (p.date !== date || !surLaChaine.has(String(p.worker_id))) continue;
        if (STATUTS_PRESENTS.has(String(p.statut || 'PRESENT').toUpperCase())) presents.add(String(p.worker_id));
    }
    return presents.size;
}

export function effectifChaineJour(args: {
    chaineId: string;
    date: string;
    suivis: SuiviData[];
    planningEvents: PlanningEvent[];
    models: ModelData[];
    rh?: DonneesRH | null;
}): EffectifResolu {
    const { chaineId, date, suivis, planningEvents, models, rh } = args;
    const cle = cleChaine(chaineId);
    const duJour = suivis.filter(s => s.date === date && cleChaine(chaineDeSaisie(s, planningEvents)) === cle);

    // 1. Page Effectifs : plusieurs OF le meme jour portent le meme effectif de chaine -> le plus grand.
    const saisi = duJour.reduce((max, s) => Math.max(max, typeof s.totalWorkers === 'number' ? s.totalWorkers : 0), 0);
    if (saisi > 0) return { n: saisi, source: 'effectifs' };

    // 2. Pointage RH.
    const rhN = presentsRH(rh, chaineId, date);
    if (rhN > 0) return { n: rhN, source: 'rh' };

    // 3. Effectif prevu a l'equilibrage des modeles reellement produits ce jour.
    let prevu = 0;
    for (const s of duJour) {
        if (!(Number(s.totalHeure) > 0)) continue;
        const plan = s.planningId ? planningEvents.find(p => p.id === s.planningId) : undefined;
        const m = models.find(x => x.id === (s.modelId || plan?.modelId));
        prevu = Math.max(prevu, Number(m?.meta_data?.effectif) || 0);
    }
    if (prevu > 0) return { n: prevu, source: 'equilibrage' };

    return { n: 0, source: null };
}
