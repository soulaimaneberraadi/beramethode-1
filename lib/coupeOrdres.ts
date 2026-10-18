/**
 * Ordres en cours : ce que la salle de coupe lit sur chaque ordre ouvert, et comment elle les trie.
 *
 * Un seul sens pour « a couper » sur toute la page :
 *   a couper = max(0, commande - coupe)   (bilanOrdre.reste)
 * La commande est la repartition couleur x taille du modele, le coupe les pieces des matelas du tissu
 * principal cochés « coupe ». L'ecart du plan (planifie - commande, `ecartsPlan`) est dit a part : un
 * plan trop court ou trop long ne change pas ce que la commande demande encore.
 *
 * Les echeances viennent des pedidos du Planning (date d'export = strictDeadline_DDS, jamais la fin
 * calculee du Planning) ; a defaut d'export, leur lancement.
 *
 * Aucune dependance a React : ce calcul se verifie par un test.
 * Lancer : node --import tsx lib/coupeOrdres.test.ts
 */
import type { ModelData, PlanningEvent } from '../types';
import { evDeadlineYmd, evQty, evStartYmd } from '../components/planning/shared/eventAccessors';
import { aujourdhui, estOuvert } from './coupeAtelier';
import { codeLot, type ChaineCoupe, type ModeleSurChaine } from './coupeChaines';
import { bilanOrdre, ecartsPlan, jourDe, joursEntre, type BilanOrdre, type EcartPlan } from './coupeVues';
import { equilibrerOrdre } from './equilibreMatieres';

/** Sans coupe depuis ce nombre de jours, un ordre est « ancien ». */
export const JOURS_ANCIEN = 14;
/** « Presque fini » : au moins cette part de la commande est coupee. */
export const SEUIL_PRESQUE = 0.9;

const ymd = (s: string | undefined | null): string => {
    const x = String(s ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '';
};

/* ------------------------------------------------------------------ */
/* Pedidos                                                              */
/* ------------------------------------------------------------------ */

/** Un pedido (OF du Planning) d'un modele : son lot, sa quantite, ses dates, sa chaine. */
export interface PedidoOrdre {
    eventId: string;
    /** « L1 », lu apres « — » dans le nom de l'OF ; vide sans code. */
    code: string;
    quantite: number;
    /** AAAA-MM-JJ du lancement ; vide sans date. */
    debut: string;
    /** AAAA-MM-JJ de livraison au client (DDS saisie) ; vide sans date. */
    export: string;
    /** Stock bloque (BLOCKED_STOCK) : le Planning dit « En pause ». */
    enPause: boolean;
    /** Nom de la chaine ; vide sans chaine. */
    chaine: string;
}

/** Les pedidos par echeance : ceux qui ont un export d'abord (le plus proche en tete), puis par lancement. */
const parEcheance = (a: PedidoOrdre, b: PedidoOrdre) =>
    (a.export ? 0 : 1) - (b.export ? 0 : 1)
    || a.export.localeCompare(b.export)
    || (a.debut || '9999').localeCompare(b.debut || '9999')
    || a.code.localeCompare(b.code);

/** Les pedidos en cours (pas DONE) de chaque modele, du plus proche au plus lointain. */
export function pedidosParModele(evenements: PlanningEvent[], chaines: ChaineCoupe[] = []): Map<string, PedidoOrdre[]> {
    // Le nom lisible de la chaine d'un OF : celui des chaines de La Coupe (reglages, alias), a defaut l'id brut du Planning.
    const nomChaine = new Map<string, string>();
    for (const c of chaines) for (const x of c.modeles) for (const p of x.pedidos) nomChaine.set(p.eventId, c.nom);
    const out = new Map<string, PedidoOrdre[]>();
    for (const ev of evenements) {
        if (!ev.modelId || ev.status === 'DONE') continue;
        const p: PedidoOrdre = {
            eventId: ev.id,
            code: codeLot(ev.modelName),
            quantite: evQty(ev) || 0,
            debut: ymd(evStartYmd(ev)),
            export: ymd(evDeadlineYmd(ev)),
            enPause: ev.status === 'BLOCKED_STOCK',
            chaine: nomChaine.get(ev.id) || String(ev.chaineId ?? '').trim(),
        };
        (out.get(ev.modelId) || out.set(ev.modelId, []).get(ev.modelId)!).push(p);
    }
    for (const l of out.values()) l.sort(parEcheance);
    return out;
}

/** Pour chaque modele, ce que chaque chaine attend de la coupe (Planning + Suivi + serie). */
export function chainesParModele(chaines: ChaineCoupe[] = []): Map<string, { chaine: ChaineCoupe; x: ModeleSurChaine }[]> {
    const t = new Map<string, { chaine: ChaineCoupe; x: ModeleSurChaine }[]>();
    for (const c of chaines) for (const x of c.modeles) (t.get(x.modelId) || t.set(x.modelId, []).get(x.modelId)!).push({ chaine: c, x });
    return t;
}

/* ------------------------------------------------------------------ */
/* Une ligne par ordre ouvert                                           */
/* ------------------------------------------------------------------ */

export interface MatiereOrdre { id: string; code: string; faits: number; total: number }
/** Pret pour la chaine, taille par taille (couleurs additionnees) : le moins coupe de toutes les matieres. */
export interface TailleOrdre { taille: string; prevu: number; prets: number; limite: string[] }

/** `nouveau` : rien de coupe ; `presque` : au moins `SEUIL_PRESQUE` de la commande ; `en_cours` : entre les deux. */
export type EtatOrdre = 'nouveau' | 'en_cours' | 'presque';

export interface LigneOrdre {
    m: ModelData;
    nom: string;
    /** Les chiffres de l'ordre : commande, coupe, reste (= a couper), avancement... */
    b: BilanOrdre;
    /** Ecart du plan couleur x taille, sans les cases a 0. > 0 surplus planifie, < 0 pieces sans matelas. */
    ecarts: EcartPlan[];
    nbCouleurs: number;
    pedidos: PedidoOrdre[];
    /** Le pedido le plus proche parmi ceux qui ne sont pas en pause. */
    prochain: PedidoOrdre | null;
    /** AAAA-MM-JJ : export du prochain pedido, a defaut son lancement ; null sans Planning. Cle du tri par export. */
    echeance: string | null;
    /** Jours jusqu'a l'export du prochain pedido (negatif : depasse) ; null sans export. */
    joursExport: number | null;
    /** L'export du prochain pedido est passe alors qu'il reste a couper. */
    exportDepasse: boolean;
    /** Jours depuis la derniere coupe (a defaut, depuis le dernier enregistrement de l'ordre) ; null si inconnu. */
    joursInactif: number | null;
    /** Reste a couper et : export depasse, ou sans coupe depuis `JOURS_ANCIEN` jours. */
    ancien: boolean;
    /** Tous les pedidos sont en pause (au moins un). */
    enPause: boolean;
    etat: EtatOrdre;
    chaines: { chaine: ChaineCoupe; x: ModeleSurChaine }[];
    /** Plusieurs matieres : leur avancement cote a cote ; vide pour une seule. */
    matieres: MatiereOrdre[];
    /** Lots dont le tissu est parti sans une autre matiere. */
    retards: number;
    /** Vetements dont toutes les matieres sont coupees ; null pour une seule matiere. */
    prets: number | null;
    tailles: TailleOrdre[];
}

/** Matieres, lots en retard et pret par taille : l'equilibre de l'ordre. */
function lireEquilibre(m: ModelData) {
    const eq = equilibrerOrdre(m.ordreCoupe, m.ficheData?.sizes || m.meta_data?.sizes || []);
    const utiles = eq.matieres.filter(x => eq.parMatiere[x.id]?.nbMatelas > 0);
    const plusieurs = utiles.length > 1;
    const matieres: MatiereOrdre[] = plusieurs ? utiles.map(x => ({ id: x.id, code: x.code, faits: eq.parMatiere[x.id].nbCoupes, total: eq.parMatiere[x.id].nbMatelas })) : [];
    const parTaille = new Map<string, { taille: string; prevu: number; prets: number; limite: Set<string> }>();
    if (plusieurs) {
        for (const t of eq.parTaille) {
            const x = parTaille.get(t.taille) || { taille: t.taille, prevu: 0, prets: 0, limite: new Set<string>() };
            x.prevu += t.prevu; x.prets += t.prets;
            t.limite.forEach(id => { const code = eq.matieres.find(mt => mt.id === id)?.code; if (code) x.limite.add(code); });
            parTaille.set(t.taille, x);
        }
    }
    return {
        matieres,
        retards: eq.lots.filter(l => l.retard.length > 0).length,
        prets: plusieurs ? eq.prets : null,
        tailles: [...parTaille.values()].filter(x => x.prevu > 0).map(x => ({ taille: x.taille, prevu: x.prevu, prets: x.prets, limite: [...x.limite] })),
    };
}

export function ligneOrdre(m: ModelData, pedidos: PedidoOrdre[], chaines: { chaine: ChaineCoupe; x: ModeleSurChaine }[], jour: string): LigneOrdre {
    // Sans Planning ici : les dates viennent des pedidos (bilanOrdre lirait la fin calculee du Planning).
    const b = bilanOrdre(m, [], jour);
    const actifs = pedidos.filter(p => !p.enPause);
    const prochain = actifs[0] || null;
    const echeance = prochain ? prochain.export || prochain.debut || null : null;
    const joursExport = prochain?.export ? joursEntre(jour, prochain.export) : null;
    const exportDepasse = b.reste > 0 && joursExport !== null && joursExport < 0;
    // Derniere activite : la derniere coupe ; un ordre jamais coupe a pour age son dernier enregistrement. Sans l'un
    // ni l'autre on ne sait pas : la date de creation du modele ne dit rien de l'ordre, on ne le dit pas ancien.
    const repere = b.derniereCoupe ? jourDe(b.derniereCoupe) : jourDe(m.ordreCoupe?.majLe);
    const joursInactif = repere ? Math.max(0, joursEntre(repere, jour)) : null;
    const etat: EtatOrdre = b.coupe <= 0 ? 'nouveau' : b.avancement >= SEUIL_PRESQUE ? 'presque' : 'en_cours';
    return {
        m,
        nom: m.ordreCoupe?.refModele || m.meta_data?.nom_modele || '',
        b,
        ecarts: ecartsPlan(m),
        nbCouleurs: ((m.ficheData as any)?.colors || (m.meta_data as any)?.colors || []).length,
        pedidos, prochain, echeance, joursExport, exportDepasse, joursInactif,
        ancien: b.reste > 0 && (exportDepasse || (joursInactif !== null && joursInactif >= JOURS_ANCIEN)),
        enPause: pedidos.length > 0 && actifs.length === 0,
        etat,
        chaines,
        ...lireEquilibre(m),
    };
}

/** Les ordres ouverts, une ligne chacun, avec leurs pedidos et ce que chaque chaine attend d'eux. */
export function lignesOrdres(models: ModelData[], evenements: PlanningEvent[], chaines: ChaineCoupe[] = [], jour: string = aujourdhui()): LigneOrdre[] {
    const peds = pedidosParModele(evenements, chaines);
    const parModele = chainesParModele(chaines);
    return models.filter(estOuvert).map(m => ligneOrdre(m, peds.get(m.id) || [], parModele.get(m.id) || [], jour));
}

/* ------------------------------------------------------------------ */
/* Filtres, tri, chiffres                                               */
/* ------------------------------------------------------------------ */

export type FiltreOrdre = 'tous' | 'nouveaux' | 'enCours' | 'presque' | 'anciens' | 'ecarts' | 'pause' | 'retard';
export const FILTRES_ORDRE: FiltreOrdre[] = ['tous', 'nouveaux', 'enCours', 'presque', 'anciens', 'ecarts', 'pause', 'retard'];
/** Statut de l'ordre dans La Coupe (les ordres soldes ne sont pas dans la page). */
export type StatutOrdre = 'EN_PREPARATION' | 'SOUS_TRAITANCE';
export type TriOrdre = 'export' | 'aCouper' | 'avancement' | 'retard';

export interface CriteresOrdres {
    filtre: FiltreOrdre;
    /** Un statut precis, ou null pour tous. */
    statut: StatutOrdre | null;
    /** Id d'une chaine : les ordres qu'elle attend ; null pour toutes. */
    chaine: string | null;
    /** Recherche libre : modele, client, type. */
    q: string;
}

const correspond = (l: LigneOrdre, f: FiltreOrdre): boolean => {
    switch (f) {
        case 'nouveaux': return l.etat === 'nouveau';
        case 'enCours': return l.etat === 'en_cours';
        case 'presque': return l.etat === 'presque';
        case 'anciens': return l.ancien;
        case 'ecarts': return l.ecarts.length > 0;
        case 'pause': return l.enPause;
        case 'retard': return l.retards > 0;
        default: return true;
    }
};

const texteDe = (l: LigneOrdre) => `${l.nom} ${l.b.nom} ${l.b.client} ${l.b.type}`.toLowerCase();

/** Les lignes qui passent tous les criteres (filtre, statut, chaine, recherche). */
export function filtrerOrdres(lignes: LigneOrdre[], c: CriteresOrdres): LigneOrdre[] {
    const q = c.q.trim().toLowerCase();
    return lignes.filter(l =>
        correspond(l, c.filtre)
        && (!c.statut || l.b.statut === c.statut)
        && (!c.chaine || l.chaines.some(e => e.chaine.id === c.chaine))
        && (!q || texteDe(l).includes(q)));
}

/** Combien d'ordres chaque filtre donnerait, les autres criteres restant ce qu'ils sont. */
export function compterFiltres(lignes: LigneOrdre[], c: CriteresOrdres): Record<FiltreOrdre, number> {
    const out = {} as Record<FiltreOrdre, number>;
    for (const f of FILTRES_ORDRE) out[f] = filtrerOrdres(lignes, { ...c, filtre: f }).length;
    return out;
}

export function trierOrdres(lignes: LigneOrdre[], tri: TriOrdre): LigneOrdre[] {
    const parReste = (a: LigneOrdre, b: LigneOrdre) => b.b.reste - a.b.reste;
    return [...lignes].sort((a, b) =>
        tri === 'export' ? (a.echeance || '9999-12-31').localeCompare(b.echeance || '9999-12-31') || parReste(a, b)
        : tri === 'retard' ? (b.retards - a.retards) || parReste(a, b)
        : tri === 'avancement' ? (a.b.avancement - b.b.avancement) || parReste(a, b)
        : parReste(a, b));
}

export interface KpisOrdres {
    ordres: number;
    /** Somme des « a couper » : max(0, commande - coupe) par ordre. */
    aCouper: number;
    coupees: number;
    /** Ordres dont le plan s'ecarte de la commande. */
    ecarts: number;
}

export const kpisOrdres = (lignes: LigneOrdre[]): KpisOrdres => ({
    ordres: lignes.length,
    aCouper: lignes.reduce((s, l) => s + l.b.reste, 0),
    coupees: lignes.reduce((s, l) => s + l.b.coupe, 0),
    ecarts: lignes.filter(l => l.ecarts.length > 0).length,
});
