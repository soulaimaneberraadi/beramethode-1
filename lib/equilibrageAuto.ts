/**
 * Regroupement automatique des operations en postes (Equilibrage).
 *
 * L'ancien regroupement lisait la gamme d'un seul trait et ouvrait un poste
 * neuf a CHAQUE changement de machine. Une gamme reelle alterne sans cesse
 * (piqueuse, surjeteuse, piqueuse, surjeteuse...) : on obtenait une file de
 * postes a 20-30 % de charge, chacun avec son ouvrier, et un effectif gonfle.
 * Un agent de methodes ne travaille pas ainsi. Il :
 *  1. suit la gamme, mais renvoie une operation vers une piqueuse (ou
 *     surjeteuse...) toute proche qui a encore de la place — un court retour
 *     du paquet plutot qu'un ouvrier de plus ;
 *  2. regroupe deux postes voisins de la meme machine qui tiennent ensemble
 *     dans un seul ;
 *  3. lisse la charge entre postes voisins (100 % / 30 % devient 65 % / 65 %),
 *     pour que le goulot soit le plus bas possible.
 * La regle de l'atelier reste intacte : un ouvrier = une machine. Seules les
 * operations manuelles (MAN) se glissent chez n'importe quelle machine.
 *
 * Fonction pure, sans React : `limite` est la charge maxi d'un poste, dans
 * la meme unite que `time` (minutes de gamme).
 */

export const MACHINE_MANUELLE = 'MAN';

export interface OpAGrouper {
    id: string;
    /** Temps de gamme (minutes). 0 = temps pas encore connu. */
    time: number;
    /** Machine normalisee (majuscules, « MAN » pour le manuel). */
    machine: string;
}

export interface PosteGroupe {
    machine: string;
    /** Operations du poste, dans l'ordre de la gamme. */
    opIds: string[];
    time: number;
}

/** Nombre de postes en arriere vers lesquels un paquet peut revenir. A 3, un
 *  court retour du paquet evite un ouvrier de plus (gamme polo testee :
 *  8 ouvriers vises -> 10 postes au lieu de 11). */
const FENETRE_RETOUR = 3;
const EPS = 1e-9;

const compatibles = (a: string, b: string) =>
    a === b || a === MACHINE_MANUELLE || b === MACHINE_MANUELLE;

export function grouperOperations(ops: OpAGrouper[], limite: number): PosteGroupe[] {
    const rang = new Map<string, number>();
    const infos = new Map<string, OpAGrouper>();
    ops.forEach((op, i) => { rang.set(op.id, i); infos.set(op.id, op); });
    const tempsDe = (id: string) => Math.max(0, infos.get(id)?.time || 0);
    const machineDe = (id: string) => infos.get(id)?.machine || MACHINE_MANUELLE;

    // Machine d'un poste = celle de sa premiere operation non manuelle.
    const machineDuPoste = (opIds: string[]) =>
        opIds.map(machineDe).find(m => m !== MACHINE_MANUELLE) || MACHINE_MANUELLE;
    const recalculer = (p: PosteGroupe) => {
        p.opIds.sort((a, b) => (rang.get(a)! - rang.get(b)!));
        p.time = p.opIds.reduce((s, id) => s + tempsDe(id), 0);
        p.machine = machineDuPoste(p.opIds);
    };

    // --- 1. Lecture de la gamme, avec retour court vers la meme machine ---
    const postes: PosteGroupe[] = [];
    for (const op of ops) {
        const t = Math.max(0, op.time || 0);
        const courant = postes[postes.length - 1];
        if (courant && compatibles(courant.machine, op.machine) && courant.time + t <= limite + EPS) {
            courant.opIds.push(op.id);
            courant.time += t;
            if (courant.machine === MACHINE_MANUELLE) courant.machine = op.machine;
            continue;
        }
        // Changement de machine : une piqueuse toute proche a-t-elle encore la place ?
        if (courant && op.machine !== MACHINE_MANUELLE && !compatibles(courant.machine, op.machine)) {
            const bas = Math.max(0, postes.length - 1 - FENETRE_RETOUR);
            let place = -1;
            for (let k = postes.length - 2; k >= bas; k--) {
                if (postes[k].machine === op.machine && postes[k].time + t <= limite + EPS) { place = k; break; }
            }
            if (place >= 0) {
                postes[place].opIds.push(op.id);
                postes[place].time += t;
                continue;
            }
        }
        postes.push({ machine: op.machine, opIds: [op.id], time: t });
    }

    // --- 2. Deux postes voisins de meme machine qui tiennent en un seul ---
    let fusion = true;
    while (fusion) {
        fusion = false;
        for (let i = 0; i < postes.length && !fusion; i++) {
            for (let j = i + 1; j <= Math.min(postes.length - 1, i + FENETRE_RETOUR); j++) {
                const a = postes[i], b = postes[j];
                if (!compatibles(a.machine, b.machine) || a.time + b.time > limite + EPS) continue;
                // Deux machines reelles differentes ne partagent jamais un poste
                if (a.machine !== MACHINE_MANUELLE && b.machine !== MACHINE_MANUELLE && a.machine !== b.machine) continue;
                a.opIds.push(...b.opIds);
                recalculer(a);
                postes.splice(j, 1);
                fusion = true;
                break;
            }
        }
    }

    // --- 3. Lissage de la charge entre postes consecutifs ---
    // On deplace une operation de bord (la derniere du poste amont, ou la
    // premiere du poste aval) tant que cela abaisse le plus charge des deux.
    for (let tour = 0; tour < 500; tour++) {
        let ameliore = false;
        for (let i = 0; i + 1 < postes.length; i++) {
            const a = postes[i], b = postes[i + 1];
            const pic = Math.max(a.time, b.time);
            const essais: { de: PosteGroupe; vers: PosteGroupe; id: string }[] = [];
            if (a.opIds.length > 1) essais.push({ de: a, vers: b, id: a.opIds[a.opIds.length - 1] });
            if (b.opIds.length > 1) essais.push({ de: b, vers: a, id: b.opIds[0] });
            for (const e of essais) {
                const t = tempsDe(e.id);
                if (t <= 0) continue;
                const m = machineDe(e.id);
                // L'operation doit pouvoir se faire sur la machine du poste d'accueil
                if (m !== MACHINE_MANUELLE && m !== e.vers.machine) continue;
                // Le poste de depart ne doit pas perdre sa seule operation machine
                const resteDe = e.de.opIds.filter(id => id !== e.id);
                if (e.de.machine !== MACHINE_MANUELLE && machineDuPoste(resteDe) !== e.de.machine) continue;
                const nouveauDe = e.de.time - t;
                const nouveauVers = e.vers.time + t;
                if (nouveauVers > limite + EPS) continue;
                if (Math.max(nouveauDe, nouveauVers) + EPS < pic) {
                    e.de.opIds = resteDe;
                    e.vers.opIds.push(e.id);
                    recalculer(e.de);
                    recalculer(e.vers);
                    ameliore = true;
                    break;
                }
            }
        }
        if (!ameliore) break;
    }

    postes.forEach(recalculer);
    // Ordre des postes = ordre de leur premiere operation dans la gamme
    postes.sort((a, b) => (rang.get(a.opIds[0])! - rang.get(b.opIds[0])!));
    return postes;
}

/**
 * Nombre de postes identiques pour un poste qui depasse le temps de base.
 * Si une operation a elle seule depasse la part d'un ouvrier, on ne peut
 * pas la couper en morceaux : les ouvriers travaillent EN PARALLELE sur tout
 * le poste (doublage). Sinon on decoupe les operations dans l'ordre.
 */
export function decouperPoste(
    ops: { id: string; time: number }[],
    nombre: number
): string[][] {
    if (!Number.isFinite(nombre) || nombre <= 1 || ops.length === 0) return [ops.map(o => o.id)];
    const total = ops.reduce((s, o) => s + Math.max(0, o.time || 0), 0);
    const part = total / nombre;
    const plusLongue = Math.max(...ops.map(o => Math.max(0, o.time || 0)));
    if (ops.length < nombre || plusLongue > part + EPS) {
        // Doublage : chaque ouvrier fait tout le poste, le temps se partage
        return Array.from({ length: nombre }, () => ops.map(o => o.id));
    }
    const groupes: string[][] = Array.from({ length: nombre }, () => []);
    let g = 0, charge = 0;
    for (const o of ops) {
        const t = Math.max(0, o.time || 0);
        if (g < nombre - 1 && charge > 0 && charge + t / 2 > part) { g++; charge = 0; }
        groupes[g].push(o.id);
        charge += t;
    }
    return groupes.filter(x => x.length > 0);
}
