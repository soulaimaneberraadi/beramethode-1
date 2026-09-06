/**
 * Moteur de primes de rendement — confection / textile.
 *
 * ─── Pourquoi un moteur, et pas un seuil ────────────────────────────────────
 * Un atelier de confection ne paie pas la prime « au-dessus de 80 % ». Il paie
 * par PALIERS (70-79, 80-89, 90-99, 100 et plus), il retient sur la QUALITÉ
 * (une pièce reprise coûte deux fois), il récompense l'ASSIDUITÉ (une chaîne
 * ne tient pas si les postes bougent tous les matins) et la POLYVALENCE (un
 * ouvrier qui tient trois postes sauve une journée quand quelqu'un manque).
 * Ce fichier calcule ces quatre parts, et rien d'autre.
 *
 * ─── Le rendement, formule d'atelier ────────────────────────────────────────
 *      Rendement = temps produit / temps de présence × 100
 *      temps produit   = Σ (pièces × temps standard de l'opération)
 *      temps présence  = Σ (durée des créneaux où l'ouvrier a été relevé)
 *
 * C'est la définition utilisée en confection : on compare ce que le travail
 * VALAIT en temps standard à ce qu'il a COÛTÉ en temps réel. Elle est
 * volontairement identique, dans ses termes, au score du relevé — pour qu'un
 * ouvrier ne lise pas deux chiffres différents de la même journée.
 *
 * ─── Règles de prudence (l'argent des gens) ─────────────────────────────────
 * • Sans configuration décidée, AUCUNE prime n'est calculée. Jamais de défaut
 *   « raisonnable » : un montant que personne n'a fixé n'existe pas.
 * • Sans temps standard sur l'opération, le relevé ne compte pas dans le
 *   rendement — on ne devine pas la référence.
 * • Une part manquante (pas de règle qualité, par exemple) vaut zéro, pas une
 *   estimation.
 * • Tous les montants sont rendus arrondis au centime, dans la devise du
 *   réglage : c'est un bulletin, pas une moyenne.
 */

import type { PosteSuiviData } from '../types';

/** Un palier de rendement : à partir de `min` %, l'ouvrier touche `montant`. */
export type PalierPrime = {
    /** Rendement minimum (%) pour toucher ce palier. */
    min: number;
    /** Montant de la prime, dans la devise du réglage. */
    montant: number;
};

export type ConfigPrime = {
    /** Période de calcul : la prime se décide par jour, par semaine ou par mois. */
    periode: 'jour' | 'semaine' | 'mois';
    /** Paliers de rendement, dans n'importe quel ordre : on les trie ici. */
    paliers: PalierPrime[];
    /** Retenue qualité : au-delà de `tauxMax` % de défauts, on retient `retenue` % de la prime. */
    qualite?: { tauxMax: number; retenue: number };
    /** Prime d'assiduité : versée si l'ouvrier a été relevé sur `joursMin` jours de la période. */
    assiduite?: { joursMin: number; montant: number };
    /** Prime de polyvalence : versée par poste tenu au-delà du premier, jusqu'à `plafond` postes. */
    polyvalence?: { montantParPoste: number; plafond: number; rendementMin: number };
};

/** Ce qu'un ouvrier a produit sur la période, et ce que ça lui vaut. */
export type BulletinPrime = {
    /** Identifiant RH, ou `nom:<nom>` pour un ouvrier sans fiche. */
    cle: string;
    nom: string;
    /** Rendement de la période (%), null si aucun temps standard n'était connu. */
    rendement: number | null;
    piecesBonnes: number;
    piecesDefaut: number;
    /** Taux de défauts (%) sur les pièces déclarées. */
    tauxDefaut: number;
    /** Minutes de temps standard produites. */
    minutesProduites: number;
    /** Minutes de présence relevées. */
    minutesPresence: number;
    joursReleves: number;
    /** Postes tenus, avec leur rendement propre — le meilleur d'abord. */
    postes: { posteId: string; rendement: number | null; pieces: number }[];
    /** Palier atteint, s'il y en a un. */
    palier: PalierPrime | null;
    /** Détail du calcul, ligne par ligne : c'est ce qui rend une prime discutable. */
    lignes: { libelle: string; montant: number }[];
    /** Total versé, retenues comprises. */
    total: number;
};

/** Minutes réellement productives d'un créneau, fournies par la grille du jour. */
export type DureeCreneau = (heureKey: string | undefined, date: string) => number;

/** Bornes [début, fin] d'une période, en `YYYY-MM-DD`. */
export function bornesPeriode(date: string, periode: ConfigPrime['periode']): [string, string] {
    const ref = new Date(date);
    if (periode === 'jour') return [date, date];
    if (periode === 'semaine') {
        // Semaine ISO : lundi → dimanche. Un atelier compte sa semaine ainsi.
        const dow = ref.getDay() === 0 ? 7 : ref.getDay();
        const lundi = new Date(ref);
        lundi.setDate(ref.getDate() - (dow - 1));
        const dimanche = new Date(lundi);
        dimanche.setDate(lundi.getDate() + 6);
        return [lundi.toISOString().split('T')[0], dimanche.toISOString().split('T')[0]];
    }
    const premier = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const dernier = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return [premier.toISOString().split('T')[0], dernier.toISOString().split('T')[0]];
}

/** Palier atteint par un rendement, ou null s'il n'atteint pas le premier. */
export function palierAtteint(paliers: PalierPrime[], rendement: number | null): PalierPrime | null {
    if (rendement === null) return null;
    // Le palier le plus haut atteint gagne : on trie décroissant et on prend le premier.
    const tries = [...paliers].filter(p => Number.isFinite(p.min)).sort((a, b) => b.min - a.min);
    return tries.find(p => rendement >= p.min) || null;
}

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcule un bulletin par ouvrier sur la période contenant `date`.
 *
 * @param releves    tout l'historique chargé — on filtre ici sur la période.
 * @param nomDe      nom lisible d'une clé d'ouvrier (fiche RH ou nom libre).
 * @param dureeDe    durée productive d'un créneau : vient de la grille horaire
 *                   du jour, pauses déduites, pour qu'un créneau raccourci ne
 *                   soit pas compté comme une heure pleine.
 */
export function calculerPrimes(
    releves: PosteSuiviData[],
    config: ConfigPrime | undefined,
    date: string,
    nomDe: (cle: string) => string,
    dureeDe: DureeCreneau,
): { bulletins: BulletinPrime[]; debut: string; fin: string } {
    const periode = config?.periode || 'semaine';
    const [debut, fin] = bornesPeriode(date, periode);

    type Acc = {
        piecesBonnes: number;
        piecesDefaut: number;
        minutesProduites: number;
        minutesPresence: number;
        jours: Set<string>;
        postes: Map<string, { minutesProduites: number; minutesPresence: number; pieces: number }>;
    };
    const parOuvrier = new Map<string, Acc>();

    for (const r of releves) {
        if (!r.date || r.date < debut || r.date > fin) continue;
        /* Un relevé sans personne derrière ne peut pas nourrir une prime. On ne
           le répartit pas « au prorata » : on ne paie que ce qui est attribué. */
        const cle = r.workerId ? String(r.workerId) : (r.workerName ? `nom:${r.workerName.trim()}` : '');
        if (!cle) continue;

        const acc = parOuvrier.get(cle) || {
            piecesBonnes: 0, piecesDefaut: 0, minutesProduites: 0, minutesPresence: 0,
            jours: new Set<string>(), postes: new Map(),
        };

        const pieces = r.pieces_sorties || 0;
        const defauts = r.pieces_defaut || 0;
        acc.piecesBonnes += pieces;
        acc.piecesDefaut += defauts;
        if (pieces > 0 || defauts > 0) acc.jours.add(r.date);

        /* Temps produit : ce que le travail VALAIT en temps standard. Sans temps
           standard sur l'opération il n'y a pas de référence — le relevé compte
           dans les pièces, pas dans le rendement. */
        const ts = r.temps_prevu_par_piece || 0;
        const minutesProduites = ts > 0 ? pieces * ts : 0;
        const minutesPresence = (pieces > 0 || defauts > 0) && ts > 0 ? dureeDe(r.heure_debut, r.date) : 0;
        acc.minutesProduites += minutesProduites;
        acc.minutesPresence += minutesPresence;

        const p = acc.postes.get(r.posteId) || { minutesProduites: 0, minutesPresence: 0, pieces: 0 };
        p.minutesProduites += minutesProduites;
        p.minutesPresence += minutesPresence;
        p.pieces += pieces;
        acc.postes.set(r.posteId, p);

        parOuvrier.set(cle, acc);
    }

    const bulletins: BulletinPrime[] = [];

    parOuvrier.forEach((a, cle) => {
        const rendement = a.minutesPresence > 0 ? Math.round((a.minutesProduites / a.minutesPresence) * 100) : null;
        const declarees = a.piecesBonnes + a.piecesDefaut;
        const tauxDefaut = declarees > 0 ? arrondi2((a.piecesDefaut / declarees) * 100) : 0;

        const postes = Array.from(a.postes.entries())
            .map(([posteId, v]) => ({
                posteId,
                rendement: v.minutesPresence > 0 ? Math.round((v.minutesProduites / v.minutesPresence) * 100) : null,
                pieces: v.pieces,
            }))
            .sort((x, y) => (y.rendement ?? -1) - (x.rendement ?? -1));

        const lignes: BulletinPrime['lignes'] = [];
        let total = 0;
        let palier: PalierPrime | null = null;

        /* Sans configuration, on ne calcule RIEN — le bulletin montre alors la
           production, et la colonne prime reste vide. C'est voulu : une prime
           s'annonce, elle ne se déduit pas. */
        if (config) {
            palier = palierAtteint(config.paliers || [], rendement);
            if (palier && palier.montant > 0) {
                lignes.push({ libelle: `Rendement ≥ ${palier.min}%`, montant: palier.montant });
                total += palier.montant;
            }

            // Assiduité : la régularité vaut autant que la pointe.
            if (config.assiduite && a.jours.size >= config.assiduite.joursMin && config.assiduite.montant > 0) {
                lignes.push({ libelle: `Assiduité ${a.jours.size} j`, montant: config.assiduite.montant });
                total += config.assiduite.montant;
            }

            /* Polyvalence : on ne compte que les postes réellement tenus, c'est-à-dire
               ceux dont le rendement propre atteint le minimum demandé. Toucher à un
               poste une heure n'est pas le tenir. */
            if (config.polyvalence && config.polyvalence.montantParPoste > 0) {
                const tenus = postes.filter(p => p.rendement !== null && p.rendement >= config.polyvalence!.rendementMin).length;
                const comptes = Math.max(0, Math.min(tenus - 1, Math.max(0, config.polyvalence.plafond - 1)));
                if (comptes > 0) {
                    const montant = arrondi2(comptes * config.polyvalence.montantParPoste);
                    lignes.push({ libelle: `Polyvalence ${tenus} postes`, montant });
                    total += montant;
                }
            }

            /* Qualité : une retenue, pas une prime. Elle s'applique sur ce qui a
               été gagné — on ne retient jamais plus que la prime elle-même, et
               on ne descend pas sous zéro (personne ne doit d'argent). */
            if (config.qualite && total > 0 && tauxDefaut > config.qualite.tauxMax) {
                const retenue = arrondi2(-Math.min(total, (total * config.qualite.retenue) / 100));
                lignes.push({ libelle: `Défauts ${tauxDefaut}% > ${config.qualite.tauxMax}%`, montant: retenue });
                total = arrondi2(total + retenue);
            }
        }

        bulletins.push({
            cle,
            nom: nomDe(cle),
            rendement,
            piecesBonnes: a.piecesBonnes,
            piecesDefaut: a.piecesDefaut,
            tauxDefaut,
            minutesProduites: arrondi2(a.minutesProduites),
            minutesPresence: arrondi2(a.minutesPresence),
            joursReleves: a.jours.size,
            postes,
            palier,
            lignes,
            total: arrondi2(Math.max(0, total)),
        });
    });

    // Le meilleur rendement d'abord : c'est la lecture qu'on cherche.
    bulletins.sort((a, b) => (b.rendement ?? -1) - (a.rendement ?? -1));
    return { bulletins, debut, fin };
}

/** Configuration de départ proposée à l'écran — jamais appliquée sans validation. */
export const CONFIG_PRIME_SUGGEREE: ConfigPrime = {
    periode: 'semaine',
    /* Paliers usuels en confection : on ne récompense pas sous 70 %, et le
       saut au-delà de 100 % reconnaît celui qui dépasse le standard. */
    paliers: [
        { min: 70, montant: 0 },
        { min: 80, montant: 0 },
        { min: 90, montant: 0 },
        { min: 100, montant: 0 },
    ],
    qualite: { tauxMax: 3, retenue: 50 },
    assiduite: { joursMin: 5, montant: 0 },
    polyvalence: { montantParPoste: 0, plafond: 4, rendementMin: 80 },
};
