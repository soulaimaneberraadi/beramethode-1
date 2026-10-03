/**
 * Un ordre de coupe d'une notation de tailles a l'autre : « se fier aux nombres »
 * (XS -> 34, S -> 36...) ou « se fier aux lettres ».
 *
 * Il sert surtout aux modeles qui ont recu les deux ecritures (« 38 40 42 44 XS S M
 * L XL XXL ») : chaque taille est rangee sous une seule ecriture, les quantites
 * des tailles qui se rejoignent s'additionnent (« 38 » et « M » deviennent « 38 »),
 * et tout ce qui porte une taille suit — repartition, placements, matelas, serie
 * d'etiquetage, corrections du suivi, portee des matieres.
 *
 * Pur et teste. Il REFUSE plutot que de deviner : une taille sans equivalent dans
 * la table, ou des codes-barres deja crees (ils portent le nom de la taille).
 *
 * Ce que ce module ne peut pas voir : les ecritures deja faites cote serveur par
 * taille (stock fini, ventes, boutique en ligne). L'ecran le dit avant de convertir.
 *
 * Lancer les tests : node --import tsx lib/convertirTaillesOrdre.test.ts
 */
import type { MatelasLine, OrdreCoupe, PlacementCoupe, SerieEtiquetage } from '../types';
import { cleTailleComparable, planifierConversion, type NotationTailles, type PaireTaille, type PlanConversion } from './correspondanceTailles';
import { nomPlacement } from './planMatelas';

/** Ce que la fiche du modele porte comme taille : liste, grille couleur x taille, portee des matieres. */
export interface FicheTailles {
    sizes?: string[];
    gridQuantities?: Record<string, number>;
    materials?: { scope?: { colors?: string[]; sizes?: number[] } }[];
    [autre: string]: unknown;
}

export interface EntreeConversion {
    ordre: OrdreCoupe;
    fiche: FicheTailles;
    /** `meta_data` du modele : ses tailles, et ses codes-barres (`variantCodes`, qui portent le nom des tailles). */
    meta?: { sizes?: string[]; variantCodes?: Record<string, unknown>; [autre: string]: unknown };
    vers: NotationTailles;
    table?: PaireTaille[];
}

/**
 * `ok` vrai : `ordre`, `fiche`, `meta` et `plan` sont la. `ok` faux : `erreur` dit pourquoi
 * (et `plan` ce qui a bloque). A plat plutot qu'en union : le projet ne compile pas en
 * strict, ou une union sur `ok` ne se restreint pas.
 */
export interface SortieConversion {
    ok: boolean;
    erreur?: string;
    plan?: PlanConversion;
    ordre?: OrdreCoupe;
    fiche?: FicheTailles;
    meta?: EntreeConversion['meta'];
}

type Ratios = Record<string, number>;

const renommerRatios = (r: Ratios | undefined, nom: (t: string) => string): Ratios | undefined => {
    if (!r) return r;
    const out: Ratios = {};
    for (const [t, v] of Object.entries(r)) { const c = nom(t); out[c] = (out[c] || 0) + (Number(v) || 0); }
    return out;
};

/** Toutes les ecritures de taille que l'ordre porte (hors en-tetes bruts des fichiers de traces). */
function taillesDeLOrdre(o: OrdreCoupe): string[] {
    const vus: string[] = [];
    const voir = (r?: Ratios) => { for (const t of Object.keys(r || {})) if (!vus.includes(t)) vus.push(t); };
    for (const p of o.placements || []) {
        voir(p.ratios); voir(p.taillesTrace);
        for (const t of Object.values(p.tracesLaize || {})) voir(t?.taillesTrace);
    }
    for (const l of o.matelasLines || []) voir(l.ratios);
    for (const cle of Object.keys(o.suiviManuel || {})) { const i = cle.lastIndexOf('__'); if (i >= 0 && !vus.includes(cle.slice(i + 2))) vus.push(cle.slice(i + 2)); }
    return vus;
}

export function convertirTaillesOrdre(e: EntreeConversion): SortieConversion {
    const { ordre, fiche, meta, vers, table } = e;
    const tailleFiche = fiche.sizes || [];
    const toutes = [...tailleFiche];
    for (const t of taillesDeLOrdre(ordre)) if (!toutes.some(x => cleTailleComparable(x) === cleTailleComparable(t))) toutes.push(t);

    const plan = planifierConversion(toutes, vers, table);
    if (plan.sansEquivalent.length) {
        return { ok: false, plan, erreur: `Pas d'equivalent dans la table pour : ${plan.sansEquivalent.join(', ')}. Ajoutez-le dans Configuration > Systemes de tailles.` };
    }
    if (meta?.variantCodes && Object.keys(meta.variantCodes).length) {
        return { ok: false, plan, erreur: 'Des codes-barres existent deja pour ce modele (ils portent le nom des tailles) : convertissez avant de les creer.' };
    }
    const nom = (t: string): string => {
        const direct = plan.renommage[t];
        if (direct !== undefined) return direct;
        const cle = cleTailleComparable(t);
        const trouve = Object.keys(plan.renommage).find(k => cleTailleComparable(k) === cle);
        return trouve !== undefined ? plan.renommage[trouve] : t;
    };

    /* ---- Fiche : liste des tailles, grille couleur x taille, portee des matieres ---- */
    const nouvelles: string[] = [];
    for (const t of tailleFiche) { const c = nom(t); if (!nouvelles.some(x => cleTailleComparable(x) === cleTailleComparable(c))) nouvelles.push(c); }
    const ordreNouvelles = plan.tailles.filter(t => nouvelles.some(x => cleTailleComparable(x) === cleTailleComparable(t)));
    const indexNouveau = (t: string) => ordreNouvelles.findIndex(x => cleTailleComparable(x) === cleTailleComparable(nom(t)));

    const grille: Record<string, number> = {};
    for (const [cle, v] of Object.entries(fiche.gridQuantities || {})) {
        const i = cle.lastIndexOf('_');
        const idx = i >= 0 ? Number(cle.slice(i + 1)) : NaN;
        const ancienne = Number.isInteger(idx) ? tailleFiche[idx] : undefined;
        if (ancienne === undefined) { grille[cle] = (grille[cle] || 0) + (Number(v) || 0); continue; } // case que la liste ne decrit pas : gardee telle quelle
        const k = `${cle.slice(0, i)}_${indexNouveau(ancienne)}`;
        grille[k] = (grille[k] || 0) + (Number(v) || 0);
    }
    const materials = fiche.materials?.map(m => {
        const anciens = m.scope?.sizes;
        if (!anciens?.length) return m;
        const nouveaux = [...new Set(anciens.map(i => (tailleFiche[i] === undefined ? i : indexNouveau(tailleFiche[i]))))].sort((a, b) => a - b);
        return { ...m, scope: { ...m.scope, sizes: nouveaux } };
    });
    const nouvelleFiche: FicheTailles = { ...fiche, sizes: ordreNouvelles, gridQuantities: grille, ...(materials ? { materials } : {}) };
    const nouvelleMeta = meta?.sizes ? { ...meta, sizes: ordreNouvelles } : meta;

    /* ---- Ordre : placements, matelas, serie, suivi ---- */
    const placements: PlacementCoupe[] | undefined = ordre.placements?.map(p => {
        const ratios = renommerRatios(p.ratios, nom) || {};
        const aDesTailles = Object.values(ratios).some(v => v > 0);
        const tracesLaize = p.tracesLaize
            ? Object.fromEntries(Object.entries(p.tracesLaize).map(([id, t]) => [id, t ? { ...t, taillesTrace: renommerRatios(t.taillesTrace, nom) } : t]))
            : undefined;
        return {
            ...p,
            ratios,
            ...(aDesTailles ? { nom: nomPlacement(ratios, ordreNouvelles) } : {}),
            ...(p.taillesTrace ? { taillesTrace: renommerRatios(p.taillesTrace, nom) } : {}),
            ...(tracesLaize ? { tracesLaize } : {}),
        };
    });
    const lignes: MatelasLine[] | undefined = ordre.matelasLines?.map(l => ({ ...l, ratios: renommerRatios(l.ratios, nom) || {} }));

    // Serie d'etiquetage : une cle par matelas, taille et passage ; une taille qui se fond dans une autre repasse a la suite.
    const serie = renommerSerie(ordre.serie, ordre.matelasLines || [], tailleFiche, nom);

    const suiviManuel = ordre.suiviManuel
        ? Object.entries(ordre.suiviManuel).reduce<NonNullable<OrdreCoupe['suiviManuel']>>((acc, [cle, v]) => {
            const i = cle.lastIndexOf('__');
            const k = i >= 0 ? `${cle.slice(0, i)}__${nom(cle.slice(i + 2))}` : cle;
            const a = acc[k] || {};
            acc[k] = {
                ...(a.cut !== undefined || v.cut !== undefined ? { cut: (a.cut || 0) + (v.cut || 0) } : {}),
                ...(a.rem !== undefined || v.rem !== undefined ? { rem: (a.rem || 0) + (v.rem || 0) } : {}),
            };
            return acc;
        }, {})
        : undefined;

    return {
        ok: true,
        plan,
        fiche: nouvelleFiche,
        meta: nouvelleMeta,
        ordre: {
            ...ordre,
            ...(placements ? { placements } : {}),
            ...(lignes ? { matelasLines: lignes } : {}),
            ...(serie ? { serie } : {}),
            ...(suiviManuel ? { suiviManuel } : {}),
        },
    };
}

function renommerSerie(serie: SerieEtiquetage | undefined, lignes: MatelasLine[], tailles: string[], nom: (t: string) => string): SerieEtiquetage | undefined {
    if (!serie || (!serie.saisies && !serie.figes)) return serie;
    // Pour chaque matelas, les paquets dans l'ordre de la serie (taille de la fiche, puis passage) : leur nouveau rang suit.
    const cles = new Map<string, string>();
    for (const l of lignes) {
        const compte = new Map<string, number>();
        const rangs = [...new Set([...tailles, ...Object.keys(l.ratios || {})])];
        for (const t of rangs) {
            const fois = Math.max(0, Math.floor(Number(l.ratios?.[t]) || 0));
            for (let k = 0; k < fois; k++) {
                const cible = nom(t);
                const n = compte.get(cible) || 0;
                compte.set(cible, n + 1);
                cles.set(`${l.id}:${t}:${k}`, `${l.id}:${cible}:${n}`);
            }
        }
    }
    const traduire = <V>(src?: Record<string, V>): Record<string, V> | undefined => {
        if (!src) return src;
        const out: Record<string, V> = {};
        for (const [k, v] of Object.entries(src)) out[cles.get(k) ?? k] = v;
        return out;
    };
    return { ...serie, ...(serie.saisies ? { saisies: traduire(serie.saisies) } : {}), ...(serie.figes ? { figes: traduire(serie.figes) } : {}) };
}
