/**
 * Recherche d'operations deja connues de l'atelier.
 *
 * Quand on ajoute un poste au pied de la chaine, on ne veut pas le retaper :
 * la meme operation a presque toujours ete faite ailleurs. On indexe donc
 * TOUTES les gammes de la bibliotheque (plus les curations du catalogue des
 * temps si on les fournit), et on retrouve l'operation a partir d'un mot
 * approchant — sans exiger l'orthographe exacte.
 *
 * Rien n'est impose : ce qui est saisi librement reste tel quel, et devient
 * a son tour une entree connue des la prochaine indexation.
 */

import type { ModelData } from '../types';

export type OperationConnue = {
    /** Libelle affiche (celui de l'occurrence la plus frequente). */
    description: string;
    /** Machine associee, si les gammes s'accordent dessus. */
    machineName?: string;
    machineId?: string;
    /** Temps par piece en MINUTES (mediane des occurrences non nulles). */
    tempsMin?: number;
    section?: string;
    /** Nombre de gammes ou l'operation apparait — sert a classer. */
    occurrences: number;
};

export type ResultatRecherche = OperationConnue & { score: number };

/** Minuscule, sans accents ni ponctuation : « Assêm. Épaule » et « assem epaule » se rejoignent. */
export function normaliser(texte: string): string {
    return (texte || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function mots(texte: string): string[] {
    return normaliser(texte).split(' ').filter(m => m.length > 1);
}

function mediane(valeurs: number[]): number | undefined {
    const v = valeurs.filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    if (v.length === 0) return undefined;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Construit l'index des operations connues a partir des gammes de la bibliotheque.
 * La cle de regroupement est le libelle normalise : deux ecritures de la meme
 * operation ne font qu'une entree.
 */
export function indexerOperations(models: ModelData[], extra: OperationConnue[] = []): OperationConnue[] {
    type Acc = { libelles: Map<string, number>; machines: Map<string, number>; machineIds: Map<string, number>; temps: number[]; sections: Map<string, number>; occurrences: number };
    const par = new Map<string, Acc>();

    const compter = (map: Map<string, number>, cle?: string) => {
        if (!cle) return;
        map.set(cle, (map.get(cle) || 0) + 1);
    };
    const plusFrequent = (map: Map<string, number>): string | undefined => {
        let best: string | undefined; let n = 0;
        map.forEach((v, k) => { if (v > n) { n = v; best = k; } });
        return best;
    };

    const ajouter = (description: string, machineName?: string, machineId?: string, temps?: number, section?: string) => {
        const cle = normaliser(description);
        if (!cle) return;
        const acc = par.get(cle) || { libelles: new Map(), machines: new Map(), machineIds: new Map(), temps: [], sections: new Map(), occurrences: 0 };
        compter(acc.libelles, description.trim());
        compter(acc.machines, machineName);
        compter(acc.machineIds, machineId);
        compter(acc.sections, section);
        if (Number.isFinite(temps) && (temps as number) > 0) acc.temps.push(temps as number);
        acc.occurrences += 1;
        par.set(cle, acc);
    };

    for (const m of models || []) {
        for (const op of m.gamme_operatoire || []) {
            ajouter(op.description || '', op.machineName, op.machineId, Number(op.time) || 0, op.section);
        }
    }
    for (const e of extra) {
        ajouter(e.description, e.machineName, e.machineId, e.tempsMin, e.section);
    }

    const sortie: OperationConnue[] = [];
    par.forEach(acc => {
        sortie.push({
            description: plusFrequent(acc.libelles) || '',
            machineName: plusFrequent(acc.machines),
            machineId: plusFrequent(acc.machineIds),
            tempsMin: mediane(acc.temps),
            section: plusFrequent(acc.sections),
            occurrences: acc.occurrences,
        });
    });
    return sortie.sort((a, b) => b.occurrences - a.occurrences);
}

/** Distance de Levenshtein bornee : au-dela de `max`, on renvoie max + 1 (assez pour rejeter). */
function distance(a: string, b: string, max = 2): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diagonale = prev[0];
        prev[0] = i;
        let minLigne = prev[0];
        for (let j = 1; j <= b.length; j++) {
            const temp = prev[j];
            prev[j] = Math.min(
                prev[j] + 1,
                prev[j - 1] + 1,
                diagonale + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
            diagonale = temp;
            if (prev[j] < minLigne) minLigne = prev[j];
        }
        if (minLigne > max) return max + 1;
    }
    return prev[b.length];
}

/**
 * Cherche dans l'index. La saisie est decoupee en mots : chaque mot doit se
 * retrouver dans le libelle, soit tel quel (debut de mot), soit a une ou deux
 * lettres pres — c'est ce qui rattrape « asemblage » ou « epole ».
 */
export function chercherOperations(index: OperationConnue[], saisie: string, limite = 8): ResultatRecherche[] {
    const demandes = mots(saisie);
    if (demandes.length === 0) return [];

    const resultats: ResultatRecherche[] = [];
    for (const entree of index) {
        const cible = normaliser(entree.description);
        const motsCible = cible.split(' ').filter(Boolean);
        let score = 0;
        let tousTrouves = true;

        for (const d of demandes) {
            if (cible.includes(d)) {
                // Mot exact, et encore mieux s'il ouvre un mot du libelle.
                score += motsCible.some(m => m.startsWith(d)) ? 12 : 8;
                continue;
            }
            // Tolerance orthographique : proportionnee a la longueur du mot tape.
            const marge = d.length <= 4 ? 1 : 2;
            const proche = motsCible.some(m => distance(d, m, marge) <= marge);
            if (proche) { score += 4; continue; }
            tousTrouves = false;
            break;
        }
        if (!tousTrouves) continue;

        // Le libelle qui commence par la saisie passe devant.
        if (cible.startsWith(normaliser(saisie))) score += 6;
        // A egalite, l'operation la plus utilisee dans l'atelier gagne.
        score += Math.min(entree.occurrences, 5);
        // Un libelle court et exact vaut mieux qu'un long qui contient le mot.
        score -= Math.min(motsCible.length, 6) * 0.2;

        resultats.push({ ...entree, score });
    }

    return resultats.sort((a, b) => b.score - a.score).slice(0, limite);
}
