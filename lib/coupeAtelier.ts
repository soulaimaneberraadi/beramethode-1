/**
 * Chiffres de l'accueil de La Coupe : ordres encore ouverts, groupes presents,
 * consommation de tissu. Tout part des matelas saisis dans chaque ordre.
 *
 * Aucune dependance a React : ce que l'atelier voit doit pouvoir se verifier
 * par un test, parce qu'un metre de tissu mal compte se paie.
 */
import type { GroupeCoupe, MatelasLine, ModelData } from '../types';

/**
 * Longueur perdue en bout de chaque pli (amorce/coupe de lisiere), en metres.
 * Elle entre dans la consommation de chaque matelas.
 */
export const AMORCE_PAR_PLI_M = 0.03;

/** Au-dela, un debut et une fin ne decrivent plus un matelas mais un oubli de pointage. */
const DUREE_MAX_MIN = 12 * 60;

export const sommeRatios = (l: MatelasLine): number =>
    Object.values(l.ratios || {}).reduce((s, r) => s + (Number(r) || 0), 0);

export const piecesLigne = (l: MatelasLine): number => (l.plis || 0) * sommeRatios(l);

/** Un matelas sans aucune taille ne s'etale pas : il ne consomme rien. */
export const metresLigne = (l: MatelasLine): number =>
    sommeRatios(l) > 0 ? (l.plis || 0) * ((l.longTracee || 0) + AMORCE_PAR_PLI_M) : 0;

/** Minutes entre debut et fin, ou null si l'une manque ou si l'ecart est absurde. */
export const dureeMinutes = (l: Pick<MatelasLine, 'debut' | 'fin'>): number | null => {
    if (!l.debut || !l.fin) return null;
    const d = (Date.parse(l.fin) - Date.parse(l.debut)) / 60000;
    return Number.isFinite(d) && d > 0 && d <= DUREE_MAX_MIN ? d : null;
};

const statutDe = (m: ModelData) => m.ordreCoupe?.status || 'EN_PREPARATION';

/** Ouvert = pas encore solde. Un ordre valide ou rejete ne laisse plus rien a couper. */
export const estOuvert = (m: ModelData): boolean => {
    const st = statutDe(m);
    return st !== 'VALIDE' && st !== 'REJETE';
};

/**
 * Pieces du vetement = matelas du tissu principal. La vlieseline, la doublure
 * se coupent en plus : les compter doublerait la quantite coupee.
 */
const lignesUtiles = (m: ModelData) => (m.ordreCoupe?.matelasLines || []).filter(l => sommeRatios(l) > 0 && !l.tissu);

const clientDe = (m: ModelData) => (m.ficheData?.client || '').trim();
const typeDe = (m: ModelData) => (m.ficheData?.category || m.meta_data?.category || '').trim();

/* ------------------------------------------------------------------ */
/* Ordres                                                               */
/* ------------------------------------------------------------------ */

export interface ResumeOrdre {
    id: string;
    nom: string;
    client: string;
    type: string;
    statut: string;
    /** Quantite commandee. */
    qte: number;
    /** Pieces des matelas coches « coupe ». */
    coupees: number;
    /**
     * Ce qui reste : les matelas pas encore coupes ; sans matelas saisi, la
     * quantite entiere. Jamais negatif.
     */
    aCouper: number;
    nbMatelas: number;
    nbFaits: number;
    /** 0..1, sur la quantite commandee quand elle est connue. */
    avancement: number;
}

export const resumerOrdre = (m: ModelData): ResumeOrdre => {
    const lignes = lignesUtiles(m);
    const qte = m.ordreCoupe?.qteTotale || m.meta_data?.quantity || 0;
    let coupees = 0, restant = 0, nbFaits = 0;
    for (const l of lignes) {
        if (l.fait) { coupees += piecesLigne(l); nbFaits++; }
        else restant += piecesLigne(l);
    }
    const aCouper = !estOuvert(m) ? 0 : lignes.length === 0 ? qte : restant;
    const base = qte > 0 ? qte : coupees + restant;
    return {
        id: m.id,
        nom: m.ordreCoupe?.refModele || m.meta_data?.nom_modele || '',
        client: clientDe(m),
        type: typeDe(m),
        statut: statutDe(m),
        qte,
        coupees,
        aCouper: Math.max(0, aCouper),
        nbMatelas: lignes.length,
        nbFaits,
        avancement: base > 0 ? Math.min(1, coupees / base) : 0,
    };
};

/* ------------------------------------------------------------------ */
/* Tissu                                                                */
/* ------------------------------------------------------------------ */

export interface ConsoModele {
    id: string;
    nom: string;
    client: string;
    type: string;
    statut: string;
    /** Tissu de tous les matelas de l'ordre. */
    prevuM: number;
    /** Tissu des matelas deja coupes. */
    consommeM: number;
    resteM: number;
    /** Tissu recu declare dans l'ordre, ou null s'il n'a pas ete saisi. */
    recuM: number | null;
    /** Recu moins prevu : negatif = il manque du tissu pour finir. */
    ecartRecuM: number | null;
    piecesCoupees: number;
    /** Metres reellement consommes par piece coupee. */
    mParPiece: number | null;
}

export const consoTissu = (m: ModelData): ConsoModele => {
    const lignes = lignesUtiles(m);
    let prevuM = 0, consommeM = 0, piecesCoupees = 0;
    for (const l of lignes) {
        const mt = metresLigne(l);
        prevuM += mt;
        // Mesure au rouleau quand elle existe : c'est elle qui dit ce qui est parti.
        if (l.fait) { consommeM += l.metresReels && l.metresReels > 0 ? l.metresReels : mt; piecesCoupees += piecesLigne(l); }
    }
    const recu = m.ordreCoupe?.tissus?.find(t => t.id === 'principal')?.recuM ?? m.ordreCoupe?.tissuRecu;
    const recuM = typeof recu === 'number' && recu > 0 ? recu : null;
    return {
        id: m.id,
        nom: m.ordreCoupe?.refModele || m.meta_data?.nom_modele || '',
        client: clientDe(m),
        type: typeDe(m),
        statut: statutDe(m),
        prevuM,
        consommeM,
        resteM: Math.max(0, prevuM - consommeM),
        recuM,
        ecartRecuM: recuM === null ? null : recuM - prevuM,
        piecesCoupees,
        mParPiece: piecesCoupees > 0 ? consommeM / piecesCoupees : null,
    };
};

/* ------------------------------------------------------------------ */
/* Groupes : ce qu'ils ont coupe, et en combien de temps                */
/* ------------------------------------------------------------------ */

export interface MatelasExecute {
    modelId: string;
    modele: string;
    client: string;
    /** N° de la ligne dans l'ordre (1, 2, ...), celui ecrit sur le trace. */
    numero: number;
    groupeId: string;
    couleur: string;
    plis: number;
    longueurM: number;
    /** Tissu etale (plis x longueur, amorce comprise). */
    metres: number;
    pieces: number;
    debut: string | null;
    fin: string | null;
    minutes: number | null;
}

/** Matelas coupes et attribues a un groupe, du plus recent au plus ancien. */
export const matelasExecutes = (models: ModelData[]): MatelasExecute[] => {
    const out: MatelasExecute[] = [];
    for (const m of models) {
        (m.ordreCoupe?.matelasLines || []).forEach((l, i) => {
            if (!l.fait || !l.groupe) return;
            out.push({
                modelId: m.id,
                modele: m.ordreCoupe?.refModele || m.meta_data?.nom_modele || '',
                client: clientDe(m),
                numero: parseInt(String(l.numero ?? ''), 10) || i + 1,
                groupeId: l.groupe,
                couleur: l.couleur || '',
                plis: l.plis || 0,
                longueurM: l.longTracee || 0,
                metres: metresLigne(l),
                pieces: piecesLigne(l),
                debut: l.debut || null,
                fin: l.fin || null,
                minutes: dureeMinutes(l),
            });
        });
    }
    const cle = (x: MatelasExecute) => Date.parse(x.fin || x.debut || '') || 0;
    return out.sort((a, b) => cle(b) - cle(a));
};

export interface StatGroupe {
    groupeId: string;
    nb: number;
    metres: number;
    pieces: number;
    /** Matelas dont on connait debut ET fin : seuls eux comptent dans les moyennes. */
    nbChronometres: number;
    minutes: number;
    minParMatelas: number | null;
    /** Tissu etale par heure : la mesure qui ne penalise pas le groupe qui prend les grands matelas. */
    metresParHeure: number | null;
    /** 1 = meilleur. null tant qu'aucun matelas n'est chronometre. */
    rang: number | null;
}

/**
 * Classement par metres etales a l'heure, sur les seuls matelas chronometres.
 * `depuis` (ms) limite a une periode ; les groupes sans rien restent listes.
 */
export const statsGroupes = (executes: MatelasExecute[], groupes: GroupeCoupe[], depuis?: number): StatGroupe[] => {
    const parGroupe = new Map<string, StatGroupe>();
    const vide = (id: string): StatGroupe => ({
        groupeId: id, nb: 0, metres: 0, pieces: 0, nbChronometres: 0, minutes: 0,
        minParMatelas: null, metresParHeure: null, rang: null,
    });
    for (const g of groupes) parGroupe.set(g.id, vide(g.id));
    const metresChrono = new Map<string, number>();

    for (const x of executes) {
        const quand = Date.parse(x.fin || x.debut || '');
        if (depuis !== undefined && !(quand >= depuis)) continue;
        const s = parGroupe.get(x.groupeId) || vide(x.groupeId);
        parGroupe.set(x.groupeId, s);
        s.nb++;
        s.metres += x.metres;
        s.pieces += x.pieces;
        if (x.minutes !== null) {
            s.nbChronometres++;
            s.minutes += x.minutes;
            metresChrono.set(x.groupeId, (metresChrono.get(x.groupeId) || 0) + x.metres);
        }
    }

    const stats = [...parGroupe.values()];
    for (const s of stats) {
        if (s.nbChronometres > 0 && s.minutes > 0) {
            s.minParMatelas = s.minutes / s.nbChronometres;
            s.metresParHeure = (metresChrono.get(s.groupeId) || 0) / (s.minutes / 60);
        }
    }
    stats.sort((a, b) => (b.metresParHeure ?? -1) - (a.metresParHeure ?? -1) || b.metres - a.metres);
    let rang = 0;
    for (const s of stats) if (s.metresParHeure !== null) s.rang = ++rang;
    return stats;
};

/* ------------------------------------------------------------------ */
/* Presence : lue dans le pointage RH                                   */
/* ------------------------------------------------------------------ */

export interface OuvrierRh { id: string; full_name?: string; matricule?: string; role?: string; is_active?: boolean | number }
export interface PointageRh { worker_id: string; date: string; statut?: string; heure_entree?: string | null }

export type StatutPresence = 'PRESENT' | 'RETARD' | 'ABSENT' | 'CONGE' | 'MALADIE' | 'MISSION' | 'FERIE' | 'NON_POINTE';

/** Seuls ceux qui sont a l'atelier comptent : en mission, on n'etale pas de matelas. */
export const estAuTravail = (s: StatutPresence) => s === 'PRESENT' || s === 'RETARD';

export interface MembrePresence { id: string; nom: string; matricule: string; statut: StatutPresence; entree: string | null; inconnu: boolean }
export interface PresenceGroupe { groupeId: string; membres: MembrePresence[]; presents: number; estPresent: boolean }

export const presenceGroupes = (
    groupes: GroupeCoupe[], ouvriers: OuvrierRh[], pointage: PointageRh[], date: string,
): PresenceGroupe[] => {
    const ouvrierPar = new Map(ouvriers.map(o => [String(o.id), o]));
    // Le mode en ligne filtre deja par date ; le mode Vercel renvoie tout.
    const pointagePar = new Map(pointage.filter(p => p.date === date).map(p => [String(p.worker_id), p]));
    return groupes.map(g => {
        const membres: MembrePresence[] = g.membres.map(id => {
            const o = ouvrierPar.get(String(id));
            const p = pointagePar.get(String(id));
            const statut = (p?.statut as StatutPresence) || 'NON_POINTE';
            return {
                id: String(id),
                nom: o?.full_name || String(id),
                matricule: o?.matricule || '',
                statut,
                entree: p?.heure_entree || null,
                inconnu: !o,
            };
        });
        const presents = membres.filter(x => estAuTravail(x.statut)).length;
        return { groupeId: g.id, membres, presents, estPresent: presents > 0 };
    });
};

/** Date du jour AAAA-MM-JJ en heure locale : c'est la date ecrite dans le pointage. */
export const aujourdhui = (d = new Date()): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
