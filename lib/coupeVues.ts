/**
 * Chiffres des vues de la liste La Coupe (Tableau, Calendrier, Stats) et de
 * l'export : tout est relu dans les matelas, jamais dans les anciens champs
 * de l'ordre (longueurMatelas, consommation, nbrFeuilles, nbrMatelas), qui ne
 * sont plus remplis et donnaient des 0 partout.
 *
 *   commande  = la repartition couleur x taille du modele (ce que le client veut)
 *   planifie  = pieces des matelas du tissu principal (ce qui sera coupe)
 *   coupe     = pieces des matelas coches « coupe »
 *   reste     = commande - coupe (ordre ouvert), sinon 0
 *
 * La vlieseline, la doublure... se coupent en plus : elles ne comptent ni en
 * pieces ni en metres ici, comme dans resumerOrdre / consoTissu.
 *
 * Lancer les tests : node --import tsx lib/coupeVues.test.ts
 */
import type { MatelasLine, ModelData, PlanningEvent } from '../types';
import { aujourdhui, commandeDe, metresLigne, piecesLigne, sommeRatios } from './coupeAtelier';

const statutDe = (m: ModelData) => m.ordreCoupe?.status || 'EN_PREPARATION';
const ouvert = (m: ModelData) => { const s = statutDe(m); return s !== 'VALIDE' && s !== 'REJETE'; };
/** Matelas qui font des vetements : tissu principal, au moins une taille. */
const lignesPieces = (m: ModelData): MatelasLine[] =>
    (m.ordreCoupe?.matelasLines || []).filter(l => !l.tissu && sommeRatios(l) > 0);
const nomCouleur = (c: any): string => (typeof c === 'string' ? c : c?.name || c?.id || '');
const idCouleur = (c: any): string => (typeof c === 'string' ? c : c?.id || c?.name || '');

/** Jour local AAAA-MM-JJ d'une date ISO (null si illisible). */
export const jourDe = (iso?: string | null): string | null => {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? aujourdhui(new Date(t)) : null;
};

export { commandeDe };

export interface BilanOrdre {
    id: string;
    nom: string;
    reference: string;
    client: string;
    type: string;
    statut: string;
    image?: string;
    commande: number;
    planifie: number;
    coupe: number;
    /** Encore a couper pour servir la commande (0 si l'ordre est clos). */
    reste: number;
    /** Commande sans matelas pour la couper. */
    nonPlanifie: number;
    /** 0..1 : coupe / commande (ou / planifie sans commande). */
    avancement: number;
    nbMatelas: number;
    nbFaits: number;
    /** Envoyes au traceur, pas encore confirmes coupes. */
    nbEnvoyes: number;
    /** Matelas dont la longueur du trace manque : leurs metres ne sont pas comptes. */
    nbSansLongueur: number;
    prevuM: number;
    consommeM: number;
    recuM: number | null;
    /** Metres qui manquent pour finir (recu < prevu), 0 sinon ou si rien n'est declare recu. */
    manqueM: number;
    /** Efficience des traces etales (%), ponderee par les metres ; null sans trace lu. */
    efficience: number | null;
    /** Metres par piece : reels sur ce qui est coupe, sinon prevus. */
    mParPiece: number | null;
    creeLe: string | null;
    derniereCoupe: string | null;
    /** Debut de la couture au Planning : la coupe doit etre finie avant. */
    lancement: string | null;
    /** Date de livraison (DDS) au Planning. */
    dds: string | null;
    /** Ouvert, encore des pieces a couper, et le lancement est passe. */
    enRetard: boolean;
    /** Jours avant le lancement (negatif = depasse) ; null sans Planning. */
    joursAvantLancement: number | null;
}

const joursEntre = (de: string, a: string) => Math.round((Date.parse(a + 'T00:00:00') - Date.parse(de + 'T00:00:00')) / 86400000);

export const bilanOrdre = (m: ModelData, evenements: PlanningEvent[] = [], jour = aujourdhui()): BilanOrdre => {
    const o = m.ordreCoupe;
    const lignes = lignesPieces(m);
    let planifie = 0, coupe = 0, prevuM = 0, consommeM = 0, nbFaits = 0, nbEnvoyes = 0, nbSansLongueur = 0;
    let derniere: number | null = null;
    let effM = 0, effSomme = 0;
    const placements = new Map((o?.placements || []).map(p => [p.id, p]));
    for (const l of lignes) {
        const pcs = piecesLigne(l);
        const mt = metresLigne(l);
        planifie += pcs;
        prevuM += mt;
        if (!(l.longTracee > 0) && (l.plis || 0) > 0) nbSansLongueur++;
        if (l.fait) {
            coupe += pcs;
            nbFaits++;
            consommeM += l.metresReels && l.metresReels > 0 ? l.metresReels : mt;
            const t = Date.parse(l.fin || '');
            if (Number.isFinite(t) && (derniere === null || t > derniere)) derniere = t;
        } else if (l.envoyeLe) nbEnvoyes++;
        const p = l.placementId ? placements.get(l.placementId) : undefined;
        if (p?.efficience && p.efficience > 0 && mt > 0) { effSomme += p.efficience * mt; effM += mt; }
    }
    // Pas encore de matelas etale : l'efficience des traces charges du tissu principal.
    let efficience: number | null = effM > 0 ? effSomme / effM : null;
    if (efficience === null) {
        const effs = (o?.placements || []).filter(p => (!p.tissu || p.tissu === 'principal') && p.efficience && p.efficience > 0).map(p => p.efficience as number);
        if (effs.length) efficience = effs.reduce((a, b) => a + b, 0) / effs.length;
    }
    const commande = commandeDe(m);
    const estOuvert = ouvert(m);
    const reste = !estOuvert ? 0 : commande > 0 ? Math.max(0, commande - coupe) : Math.max(0, planifie - coupe);
    const base = commande > 0 ? commande : planifie;
    const recu = o?.tissus?.find(t => t.id === 'principal')?.recuM ?? o?.tissuRecu;
    const recuM = typeof recu === 'number' && recu > 0 ? recu : null;
    const evt = evenements.find(e => e.modelId === m.id);
    const lancement = jourDe(evt?.dateLancement || evt?.startDate || null);
    const dds = jourDe(evt?.dateExport || evt?.strictDeadline_DDS || null);
    const joursAvantLancement = lancement ? joursEntre(jour, lancement) : null;
    return {
        id: m.id,
        nom: m.meta_data?.nom_modele || o?.refModele || '',
        reference: o?.refModele || m.meta_data?.reference || '',
        client: ((m.ficheData as any)?.client || '').trim(),
        type: ((m.ficheData as any)?.category || m.meta_data?.category || '').trim(),
        statut: statutDe(m),
        image: m.image || m.images?.front || undefined,
        commande,
        planifie,
        coupe,
        reste,
        nonPlanifie: estOuvert ? Math.max(0, commande - planifie) : 0,
        avancement: base > 0 ? Math.min(1, coupe / base) : 0,
        nbMatelas: lignes.length,
        nbFaits,
        nbEnvoyes,
        nbSansLongueur,
        prevuM,
        consommeM,
        recuM,
        manqueM: recuM === null ? 0 : Math.max(0, prevuM - recuM),
        efficience,
        mParPiece: coupe > 0 && consommeM > 0 ? consommeM / coupe : planifie > 0 && prevuM > 0 ? prevuM / planifie : null,
        creeLe: jourDe(m.meta_data?.date_creation),
        derniereCoupe: derniere === null ? null : new Date(derniere).toISOString(),
        lancement,
        dds,
        enRetard: estOuvert && reste > 0 && joursAvantLancement !== null && joursAvantLancement < 0,
        joursAvantLancement,
    };
};

/* ------------------------------------------------------------------ */
/* Journal : ce qui a ete coupe, jour par jour                          */
/* ------------------------------------------------------------------ */

export interface JourCoupe {
    jour: string;
    pieces: number;
    metres: number;
    matelas: number;
    ordres: { id: string; nom: string; pieces: number; matelas: number }[];
}

/** Matelas coupes (date de fin) regroupes par jour local. */
export const journalCoupe = (models: ModelData[]): Map<string, JourCoupe> => {
    const out = new Map<string, JourCoupe>();
    for (const m of models) {
        const nom = m.meta_data?.nom_modele || m.ordreCoupe?.refModele || '';
        for (const l of lignesPieces(m)) {
            if (!l.fait) continue;
            const jour = jourDe(l.fin);
            if (!jour) continue;
            let j = out.get(jour);
            if (!j) { j = { jour, pieces: 0, metres: 0, matelas: 0, ordres: [] }; out.set(jour, j); }
            const pcs = piecesLigne(l);
            j.pieces += pcs;
            j.metres += l.metresReels && l.metresReels > 0 ? l.metresReels : metresLigne(l);
            j.matelas++;
            let od = j.ordres.find(x => x.id === m.id);
            if (!od) { od = { id: m.id, nom, pieces: 0, matelas: 0 }; j.ordres.push(od); }
            od.pieces += pcs;
            od.matelas++;
        }
    }
    for (const j of out.values()) j.ordres.sort((a, b) => b.pieces - a.pieces);
    return out;
};

/* ------------------------------------------------------------------ */
/* Detail couleur x taille (export)                                     */
/* ------------------------------------------------------------------ */

export interface LigneCouleurTaille { couleur: string; taille: string; commande: number; planifie: number; coupe: number; reste: number }

export const detailCouleurTaille = (m: ModelData): LigneCouleurTaille[] => {
    const fiche: any = m.ficheData || {};
    const tailles: string[] = fiche.sizes || (m.meta_data as any)?.sizes || [];
    const couleurs: any[] = fiche.colors || (m.meta_data as any)?.colors || [];
    const grille: Record<string, number> = fiche.gridQuantities || {};
    const lignes = lignesPieces(m);
    const noms = couleurs.map(nomCouleur);
    const cles = [...noms];
    // Matelas dont la couleur n'est pas (ou plus) dans la repartition : on les montre quand meme.
    for (const l of lignes) { const c = l.couleur || ''; if (!cles.includes(c)) cles.push(c); }
    const out: LigneCouleurTaille[] = [];
    cles.forEach((c) => {
        const ci = noms.indexOf(c);
        const cid = ci >= 0 ? idCouleur(couleurs[ci]) : null;
        tailles.forEach((t, ti) => {
            const commande = cid !== null ? Number(grille[`${cid}_${ti}`]) || 0 : 0;
            let planifie = 0, coupe = 0;
            for (const l of lignes) {
                if ((l.couleur || '') !== c) continue;
                const n = (Number(l.ratios?.[t]) || 0) * (l.plis || 0);
                planifie += n;
                if (l.fait) coupe += n;
            }
            if (!commande && !planifie) return;
            out.push({ couleur: c, taille: t, commande, planifie, coupe, reste: ouvert(m) ? Math.max(0, commande - coupe) : 0 });
        });
    });
    return out;
};
