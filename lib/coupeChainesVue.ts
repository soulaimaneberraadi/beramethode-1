/**
 * Ce que la page Chaines dit d'un modele et d'une chaine, decide ici pour que l'ecran n'ait qu'a l'ecrire.
 *
 *  - `vuePlan` : lequel des etats d'un modele sur une chaine il faut montrer (pas d'ordre, pause, a couper...) ;
 *  - `verdictAvance` : l'avance de la coupe face a l'objectif, en trois mots (en avance / juste / va s'arreter) ;
 *  - `heuresParJour` : les heures de travail d'un jour, d'apres les horaires de l'usine ;
 *  - `numerosVisibles` : une liste de numeros de matelas, tronquee quand elle est longue.
 *
 * Aucune dependance a React : ce calcul se verifie par un test.
 * Lancer : node --import tsx lib/coupeChainesVue.test.ts
 */
import type { AppSettings } from '../types';
import { minutesTravailleesDuJour } from './horaires';
import type { ChaineCoupe, ModeleSurChaine } from './coupeChaines';

/**
 * L'etat d'un modele sur une chaine, du plus fort au plus faible :
 * `horsCoupe` pas d'ordre de coupe ; `pause` tous ses pedidos sont en pause ; `plusTard` lancement trop loin ;
 * `serieAbsente` la serie ne donne aucun paquet a la chaine ; `sansMatelas` il faut couper mais aucun matelas n'est calcule ;
 * `manque` l'ordre ne suffit pas pour tenir l'objectif ; `toutCoupe` plus rien a couper pour la chaine ;
 * `rien` l'avance suffit ; `a_couper` des matelas a couper aujourd'hui.
 */
export type VuePlan = 'horsCoupe' | 'pause' | 'plusTard' | 'serieAbsente' | 'sansMatelas' | 'manque' | 'toutCoupe' | 'rien' | 'a_couper';

export function vuePlan(x: ModeleSurChaine): VuePlan {
    if (!x.aUnOrdre) return 'horsCoupe';
    if (x.enPause || x.planJour.statut === 'pause') return 'pause';
    if (x.plusTard) return 'plusTard';
    if (x.serieAbsente) return 'serieAbsente';
    if (x.sansMatelas) return 'sansMatelas';
    if (x.planJour.statut === 'manque') return 'manque';
    if (x.planJour.matelas.length === 0) return x.resteACouper === 0 ? 'toutCoupe' : 'rien';
    return 'a_couper';
}

export type NiveauAvance = 'avance' | 'juste' | 'arret';

export interface VerdictAvance {
    niveau: NiveauAvance;
    /** Jours d'avance de la coupe. */
    jours: number;
    /** Heures de couture que cette avance represente (avance x heures par jour). */
    heures: number;
    /** Part de l'objectif atteinte, entre 0 et 1 : la longueur de la barre. */
    part: number;
}

/**
 * Meme regle que l'etat de la chaine : moins d'un jour d'avance, elle va s'arreter ; sous l'objectif, c'est juste ;
 * a l'objectif ou au-dela, la coupe est en avance. null sans cadence (l'avance n'est pas calculable).
 */
export function verdictAvance(joursAvance: number | null, objectif: number, heuresParJour: number): VerdictAvance | null {
    if (joursAvance === null || !Number.isFinite(joursAvance)) return null;
    const jours = Math.max(0, joursAvance);
    const niveau: NiveauAvance = jours < 1 ? 'arret' : jours < objectif ? 'juste' : 'avance';
    return {
        niveau, jours,
        heures: jours * (heuresParJour > 0 ? heuresParJour : 8),
        part: objectif > 0 ? Math.min(1, jours / objectif) : 1,
    };
}

/**
 * Heures de travail d'un jour : les horaires de l'usine (pauses retirees). Un jour ferme (dimanche...)
 * prend l'horaire general ; sans reglage, 8 h.
 */
export function heuresParJour(settings?: AppSettings, jour: Date = new Date()): number {
    if (!settings) return 8;
    const minutes = minutesTravailleesDuJour(settings, jour) || minutesTravailleesDuJour(settings);
    return minutes > 0 ? minutes / 60 : 8;
}

/** Le modele que la chaine coud : celui dont parlent sa cadence et son avance (`rythme`). */
export function modeleEnCours(c: ChaineCoupe): ModeleSurChaine | undefined {
    const id = c.rythme.modelId;
    return id ? c.modeles.find(x => x.modelId === id) : undefined;
}

/**
 * Les numeros a montrer : tous si `ouvert` ou si la liste est courte, sinon les `max` premiers et le nombre cache.
 * `longue` : la liste depasse `max` (il y a donc quelque chose a ouvrir ou a refermer).
 */
export function numerosVisibles(numeros: string[], ouvert: boolean, max = 8): { visibles: string[]; reste: number; longue: boolean } {
    const propres = numeros.map(n => (n || '?').trim() || '?');
    const longue = propres.length > max;
    if (ouvert || !longue) return { visibles: propres, reste: 0, longue };
    return { visibles: propres.slice(0, max), reste: propres.length - max, longue };
}
