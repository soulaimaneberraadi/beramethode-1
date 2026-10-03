/**
 * Tailles en lettres (XS, S, M...) et en nombres (34, 36, 38...).
 *
 * Un client ecrit ses traces et ses feuilles en lettres, le modele de l'atelier
 * est en nombres (ou l'inverse). Sans table de correspondance, une taille « XS »
 * d'un fichier n'est pas reconnue dans un modele en « 34 » : elle s'ajoute comme
 * une colonne en plus, et la commande se retrouve avec deux jeux de tailles.
 *
 * La table est a l'usine (elle change d'un client a l'autre : parfois S = 36,
 * parfois S = 38) et se regle dans la Configuration. Ici : seulement des
 * fonctions pures, sans React, testees. Rien n'est jamais devine : une taille
 * sans equivalent reste telle quelle et se signale.
 *
 * Lancer les tests : node --import tsx lib/correspondanceTailles.test.ts
 */

/** Une ligne de la table : « S = 36 ». */
export interface PaireTaille {
    lettre: string;
    nombre: string;
}

export type NotationTailles = 'lettres' | 'nombres';

/** Table d'usage en Europe (femme/homme prets-a-porter) : modifiable dans la Configuration. */
export const CORRESPONDANCE_DEFAUT: PaireTaille[] = [
    { lettre: 'XXS', nombre: '32' },
    { lettre: 'XS', nombre: '34' },
    { lettre: 'S', nombre: '36' },
    { lettre: 'M', nombre: '38' },
    { lettre: 'L', nombre: '40' },
    { lettre: 'XL', nombre: '42' },
    { lettre: 'XXL', nombre: '44' },
    { lettre: '3XL', nombre: '46' },
    { lettre: '4XL', nombre: '48' },
];

/** « XXXL » et « 3XL » sont la meme taille ; « 2XL » aussi que « XXL ». */
export function formeLettre(t: string): string {
    const x = t.trim().toUpperCase().replace(/\s+/g, '');
    const m = /^(X{2,})(L|S)$/.exec(x);
    if (m) {
        const n = m[1].length;
        // XXL = 2XL, XXXL = 3XL ; XXS = 2XS... : on garde « XXL » et « XXS », on ecrit les suivants en « 3XL ».
        return n === 2 ? x : `${n}X${m[2]}`;
    }
    const k = /^(2)(X)(L|S)$/.exec(x);
    if (k) return `XX${k[3]}`;
    return x;
}

const estNombre = (t: string) => /^\d+([.,]\d+)?$/.test(t.trim());
const cleNombre = (t: string) => String(Number(t.trim().replace(',', '.')));

/** Cle de comparaison d'une taille : « s » = « S », « 03 » = « 3 », « XXXL » = « 3XL ». */
export function cleTailleComparable(t: string): string {
    return estNombre(t) ? cleNombre(t) : formeLettre(t);
}

export function estEnNombres(t: string): boolean { return estNombre(t); }

/** Table nettoyee : sans ligne vide ni doublon, tailles normalisees. */
export function nettoyerTable(table: PaireTaille[] | undefined | null): PaireTaille[] {
    const src = table && table.length ? table : CORRESPONDANCE_DEFAUT;
    const vuLettre = new Set<string>(), vuNombre = new Set<string>();
    const out: PaireTaille[] = [];
    for (const p of src) {
        const lettre = formeLettre(String(p?.lettre ?? ''));
        const nombre = String(p?.nombre ?? '').trim();
        if (!lettre || !nombre || !estNombre(nombre)) continue;
        const n = cleNombre(nombre);
        if (vuLettre.has(lettre) || vuNombre.has(n)) continue; // une lettre = un nombre
        vuLettre.add(lettre); vuNombre.add(n);
        out.push({ lettre, nombre: n });
    }
    return out;
}

/** Notation d'une taille seule. */
export const notationDe = (t: string): NotationTailles => (estNombre(t) ? 'nombres' : 'lettres');

/**
 * Notation d'une liste de tailles : celle qui domine ; `null` si elle est vide.
 * Une egalite (deux lettres, deux nombres) compte comme melangee.
 */
export function notationListe(tailles: string[]): { notation: NotationTailles | null; melangee: boolean; lettres: number; nombres: number } {
    const nombres = tailles.filter(estNombre).length;
    const lettres = tailles.length - nombres;
    return {
        notation: !tailles.length ? null : nombres > lettres ? 'nombres' : lettres > nombres ? 'lettres' : 'nombres',
        melangee: nombres > 0 && lettres > 0,
        lettres,
        nombres,
    };
}

/**
 * La taille dans l'autre notation (« XS » -> « 34 », « 36 » -> « S »), ou null
 * si la table ne la connait pas.
 */
export function equivalent(t: string, table?: PaireTaille[]): string | null {
    const tab = nettoyerTable(table);
    if (estNombre(t)) {
        const n = cleNombre(t);
        return tab.find(p => p.nombre === n)?.lettre ?? null;
    }
    const l = formeLettre(t);
    return tab.find(p => p.lettre === l)?.nombre ?? null;
}

/** La taille ecrite dans la notation voulue (elle-meme si deja dans cette notation), ou null. */
export function versNotation(t: string, vers: NotationTailles, table?: PaireTaille[]): string | null {
    if (notationDe(t) === vers) return t.trim();
    return equivalent(t, table);
}

/**
 * La taille du modele qui correspond a une taille de fichier : la meme ecriture
 * d'abord (« s » = « S »), puis l'equivalent de la table (« XS » = « 34 »).
 * undefined : le modele n'a rien d'equivalent.
 */
export function trouverTaille(t: string, tailles: string[], table?: PaireTaille[]): string | undefined {
    const cle = cleTailleComparable(t);
    const exacte = tailles.find(x => cleTailleComparable(x) === cle);
    if (exacte !== undefined) return exacte;
    const autre = equivalent(t, table);
    if (autre === null) return undefined;
    const cleAutre = cleTailleComparable(autre);
    return tailles.find(x => cleTailleComparable(x) === cleAutre);
}

/** Une taille de fichier ecrite dans la notation du modele, quand il n'a pas de colonne pour elle. */
export function tailleDansNotation(t: string, notation: NotationTailles | null, table?: PaireTaille[]): string {
    if (!notation) return t.trim();
    return versNotation(t, notation, table) ?? t.trim();
}

/** Plan de conversion d'une liste de tailles : chacune vers la notation voulue, avec celles qui n'ont pas d'equivalent. */
export interface PlanConversion {
    /** ancienne taille -> nouvelle ; les tailles deja dans la bonne notation y figurent a l'identique. */
    renommage: Record<string, string>;
    /** Nouvelle liste, sans doublon, rangee dans l'ordre de la table puis des inconnues. */
    tailles: string[];
    /** Tailles sans equivalent dans la table : la conversion est refusee tant qu'il en reste. */
    sansEquivalent: string[];
    /** Tailles qui se fondent avec une autre (« XS » et « 34 » deviennent « 34 »). */
    fusions: { de: string[]; vers: string }[];
}

export function planifierConversion(tailles: string[], vers: NotationTailles, table?: PaireTaille[]): PlanConversion {
    const tab = nettoyerTable(table);
    const renommage: Record<string, string> = {};
    const sansEquivalent: string[] = [];
    for (const t of tailles) {
        const cible = versNotation(t, vers, tab);
        if (cible === null) { sansEquivalent.push(t); renommage[t] = t; } else renommage[t] = cible;
    }
    const groupes = new Map<string, string[]>();
    for (const t of tailles) {
        const k = cleTailleComparable(renommage[t]);
        groupes.set(k, [...(groupes.get(k) || []), t]);
    }
    const fusions = [...groupes.entries()].filter(([, de]) => de.length > 1).map(([, de]) => ({ de, vers: renommage[de[0]] }));
    const rang = (t: string) => {
        const k = cleTailleComparable(t);
        const i = tab.findIndex(p => (vers === 'nombres' ? p.nombre : p.lettre) === k);
        return i < 0 ? tab.length : i;
    };
    const uniques: string[] = [];
    for (const t of tailles) { const c = renommage[t]; if (!uniques.some(u => cleTailleComparable(u) === cleTailleComparable(c))) uniques.push(c); }
    uniques.sort((a, b) => rang(a) - rang(b) || tailles.indexOf(a) - tailles.indexOf(b));
    return { renommage, tailles: uniques, sansEquivalent, fusions };
}
