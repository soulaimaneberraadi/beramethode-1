/**
 * Donner un modele a une chaine depuis La Coupe, en ecrivant au Planning.
 *
 * La coupe ne tient pas de liste de modeles par chaine : c'est le Planning qui dit
 * quel pedido (OF « Article — L1 ») tourne sur quelle chaine, depuis quand. Choisir
 * un modele pour une chaine revient donc a ecrire dans le pedido sa chaine et ses
 * dates, et a FIGER la date (`isLocked`) : le recalcul du Planning ne la deplace plus.
 *
 * Ici, le calcul seul (teste) : quel identifiant de chaine ecrire, la liste des pedidos
 * d'un modele, ce qu'il reste a planifier, les erreurs de saisie, l'OF modifie ou cree.
 * L'ecriture elle-meme passe par `setPlanningEvents` (l'etat de App.tsx), dans le composant.
 *
 * Aucune dependance a React.
 * Lancer : node --import tsx lib/coupeChoixModele.test.ts
 */
import type { AppSettings, ModelData, PlanningEvent, ReglageChaineCoupe } from '../types';
import { evDeadlineYmd, evProduced, evQty, evStartYmd } from '../components/planning/shared/eventAccessors';
import { calculateEndDate } from '../utils/planning';
import { commandeDe } from './coupeAtelier';
import { codeLot } from './coupeChaines';
import { normNom } from './coupeFormat';

const norm = normNom;
const ymd = (iso: string | null | undefined): string => {
    const s = String(iso ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
};

/* ------------------------------------------------------------------ */
/* Chaine : quel identifiant ecrire au Planning                         */
/* ------------------------------------------------------------------ */

/** Une chaine de la coupe, telle que la page Chaines la connait. */
export interface IdentiteChaine {
    id: string;
    nom: string;
    alias?: string[];
}

/**
 * L'identifiant a ecrire dans `chaineId` du pedido pour mettre un modele sur cette chaine.
 *
 * Le Planning connait ses chaines par `CHAINE 1..n` (`settings.chainsCount`), avec un nom
 * d'usage dans `chainNames`. Une chaine de la coupe est celle du Planning quand son id, son
 * nom ou un de ses alias porte l'un de ces deux textes (sans tenir compte de la casse ni des
 * accents : « Chaîne 3 » est « CHAINE 3 ») : on ecrit alors `CHAINE n`, que le Planning (Gantt,
 * enchainement des OF) comprend. Sinon, on ecrit son nom (`connue: false`) : la coupe le
 * rattache a la bonne chaine par `versId`, mais le Gantt n'a pas de ligne pour lui, l'OF y
 * disparaitrait. L'ecran refuse donc d'affecter vers une chaine `connue: false` (voir
 * `erreurAffectation` et `SaisieAffectation.chaineConnue`).
 *
 * Garde-fou : l'identifiant ecrit doit ramener a la MEME chaine de la coupe une fois relu
 * (meme regle que `versId` de `chainesDeCoupe`). Sinon le modele s'afficherait sur une autre
 * chaine que celle choisie : on retombe sur le nom.
 *
 * @param reglages chaines reglees a la main dans La Coupe ; vide : celles du Planning.
 */
export function chaineDuPlanning(
    chaine: IdentiteChaine,
    settings?: Pick<AppSettings, 'chainsCount' | 'chainNames'>,
    reglages: ReglageChaineCoupe[] = [],
): { id: string; connue: boolean } {
    const nb = settings?.chainsCount || 4;
    const planning = Array.from({ length: nb }, (_, i) => {
        const id = `CHAINE ${i + 1}`;
        return { id, usage: settings?.chainNames?.[id] || id };
    });
    const relu = (brut: string): string => {
        const n = norm(brut);
        const r = reglages.find(c => norm(c.id) === n || norm(c.nom) === n || (c.alias || []).some(a => norm(a) === n));
        return r ? r.id : brut;
    };
    for (const brut of [chaine.id, chaine.nom, ...(chaine.alias || [])]) {
        const n = norm(brut);
        if (!n) continue;
        const p = planning.find(x => norm(x.id) === n || norm(x.usage) === n);
        if (p && relu(p.id) === chaine.id) return { id: p.id, connue: true };
    }
    return { id: (chaine.nom || '').trim() || chaine.id, connue: false };
}

/** La chaine de la coupe qui porte ce nom brut (id, nom ou alias), ou undefined. */
export function trouverChaine<T extends IdentiteChaine>(brut: string | undefined, chaines: T[]): T | undefined {
    const n = norm(brut);
    if (!n) return undefined;
    return chaines.find(c => norm(c.id) === n || norm(c.nom) === n || (c.alias || []).some(a => norm(a) === n));
}

/* ------------------------------------------------------------------ */
/* Pedidos d'un modele                                                  */
/* ------------------------------------------------------------------ */

export type CategorieStatut = 'pause' | 'termine' | 'en_cours' | 'externe' | 'pret';

/** Le Planning dit « En pause » pour un stock bloque ; « En cours » pour tout OF commence. */
export function categorieStatut(status: string | undefined): CategorieStatut {
    if (status === 'BLOCKED_STOCK') return 'pause';
    if (status === 'DONE') return 'termine';
    if (status === 'EXTERNAL_PROCESS') return 'externe';
    if (status === 'IN_PROGRESS' || status === 'ON_TRACK' || status === 'AT_RISK' || status === 'OFF_TRACK') return 'en_cours';
    return 'pret';
}

/** Un OF du Planning pour un modele : son lot, sa chaine, ses dates. */
export interface PedidoPlanning {
    eventId: string;
    /** « L1 », lu apres « — » dans le nom de l'OF ; vide sans code. */
    code: string;
    quantite: number;
    produit: number;
    /** Chaine telle qu'ecrite au Planning (« CHAINE 2 »). */
    chaineId: string;
    /** AAAA-MM-JJ du lancement ; vide si le Planning n'en a pas. */
    debut: string;
    /** Date de livraison du client (DDS). Jamais la fin calculee du Planning. */
    export: string;
    statut: CategorieStatut;
    verrouille: boolean;
}

const SEP_LOT = ' — ';
/** Le code de lot d'un nom d'OF (« Article — L1 » -> « L1 ») : le meme que celui de la page Chaines. */
export const codeLotDe = codeLot;

/**
 * Les pedidos du modele, du plus tot au plus tard (lancement, puis livraison). Les OF termines y figurent
 * (la feuille les montre « Terminé »), contrairement aux pedidos des Ordres en cours et des Chaines.
 */
export function pedidosDuModele(events: PlanningEvent[], modelId: string): PedidoPlanning[] {
    return events
        .filter(e => e.modelId === modelId)
        .map<PedidoPlanning>(e => ({
            eventId: e.id,
            code: codeLotDe(e.modelName),
            quantite: evQty(e) || 0,
            produit: evProduced(e) || 0,
            chaineId: e.chaineId || '',
            debut: ymd(evStartYmd(e)),
            export: ymd(evDeadlineYmd(e)),
            statut: categorieStatut(e.status),
            verrouille: !!e.isLocked,
        }))
        .sort((a, b) => (a.debut || '9999').localeCompare(b.debut || '9999') || (a.export || '9999').localeCompare(b.export || '9999'));
}

/** Prochain code de lot (L1 -> L2 -> ...), comme la page Pedido. */
export function prochainCodeLot(pedidos: { code: string }[]): string {
    let max = 0;
    for (const p of pedidos) {
        const m = p.code.trim().match(/^L\s*(\d+)/i);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `L${max + 1}`;
}

/** Pieces deja portees par les pedidos du modele (tous, y compris en pause ou termines). */
export const quantitePlanifiee = (events: PlanningEvent[], modelId: string): number =>
    events.filter(e => e.modelId === modelId).reduce((s, e) => s + (evQty(e) || 0), 0);

/** Ce que la commande du modele n'a pas encore donne au Planning. Jamais negatif. */
export const resteAPlanifier = (m: ModelData, events: PlanningEvent[]): number =>
    Math.max(0, commandeDe(m) - quantitePlanifiee(events, m.id));

/* ------------------------------------------------------------------ */
/* Dates                                                                */
/* ------------------------------------------------------------------ */

const JOUR_MS = 86400000;

/**
 * Jour ou la coupe doit commencer pour que la chaine qui demarre le `debutChaine` ait
 * `joursAvance` jours d'avance (meme calcul calendaire que « Rien avant le » de la page
 * Chaines). null si la date n'est pas valide.
 */
export function commencerCoupeLe(debutChaine: string, joursAvance: number): string | null {
    const d = ymd(debutChaine);
    if (!d) return null;
    const n = Math.ceil(Math.max(0, Number.isFinite(joursAvance) ? joursAvance : 0));
    return new Date(Date.parse(`${d}T12:00:00Z`) - n * JOUR_MS).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Saisie et ecriture                                                   */
/* ------------------------------------------------------------------ */

export interface SaisieAffectation {
    /** Identifiant ecrit au Planning (voir `chaineDuPlanning`). */
    chaineId: string;
    /** Debut sur la chaine, AAAA-MM-JJ. */
    debut: string;
    /** Date d'export (livraison du client), AAAA-MM-JJ ; facultative. */
    export?: string;
    /** Pieces de la commande : seulement pour une nouvelle commande. */
    quantite?: number | '';
    /** `false` : la chaine n'existe pas au Planning (`chaineDuPlanning`) ; l'OF n'y apparaitrait pas, on refuse. */
    chaineConnue?: boolean;
}

export type ErreurAffectation = 'chaine' | 'debut' | 'export' | 'quantite';

/** Premiere erreur de la saisie, ou null si on peut ecrire. */
export function erreurAffectation(s: SaisieAffectation, nouvelle: boolean): ErreurAffectation | null {
    if (!s.chaineId.trim() || s.chaineConnue === false) return 'chaine';
    if (!ymd(s.debut)) return 'debut';
    if (s.export && (!ymd(s.export) || s.export < s.debut)) return 'export';
    if (nouvelle) {
        const q = Number(s.quantite);
        if (s.quantite === '' || s.quantite === undefined || !Number.isInteger(q) || q <= 0) return 'quantite';
    }
    return null;
}

/**
 * Fin calculee d'un OF, comme la fenetre « Envoyer au Planning » de App.tsx :
 * temps standard du modele, efficience visee x facteur de planning, tampon de lancement.
 * Le Planning la recalcule a son prochain passage ; elle evite seulement une barre absurde
 * d'ici la. undefined sans reglages ou sans quantite.
 */
function finCalculee(m: ModelData | undefined, settings: AppSettings | undefined, chaineId: string, debut: string, quantite: number): string | undefined {
    if (!settings || !(quantite > 0)) return undefined;
    const sam = Number(m?.meta_data?.total_temps) || 15;
    const rendement = ((m?.ficheData?.targetEfficiency ?? 85) * (m?.ficheData?.facteurPlanning ?? 60)) / 10000;
    const tampon = m?.ficheData?.bufferLancement !== undefined ? m.ficheData.bufferLancement : (settings.changeoverDurationMins ?? 120);
    return calculateEndDate(debut, quantite, sam, rendement, settings, chaineId, tampon);
}

/**
 * Un pedido existant mis sur une chaine : sa chaine, son lancement, sa livraison, et la date
 * FIGEE. Sans nouvelle date d'export, celle du Planning reste.
 */
export function affecterPedido(ev: PlanningEvent, s: SaisieAffectation, m: ModelData | undefined, settings?: AppSettings, maintenant: number = Date.now()): PlanningEvent {
    const fin = finCalculee(m, settings, s.chaineId, s.debut, evQty(ev));
    return {
        ...ev,
        chaineId: s.chaineId,
        dateLancement: s.debut,
        startDate: s.debut,
        ...(fin ? { dateExport: fin, estimatedEndDate: fin } : {}),
        strictDeadline_DDS: s.export || ev.strictDeadline_DDS,
        isLocked: true,
        // Horodatage : sans lui, la synchronisation cloud rend la copie d'avant (voir `gagnant` de cloudSync).
        updatedAt: new Date(maintenant).toISOString(),
    };
}

/**
 * Une nouvelle commande du modele, creee comme le fait la fenetre « Envoyer au Planning » de
 * App.tsx (memes champs), avec le code de lot suivant et la date figee.
 * `maintenant` (ms) fait l'identifiant : il se passe en parametre pour rester pur.
 * Pas de controle du stock magasin ici (La Coupe ne le charge pas) : comme l'envoi depuis la Bibliotheque,
 * l'OF part « Pret » et le Planning le bloque au besoin a sa prochaine modification.
 */
export function creerPedido(
    m: ModelData,
    s: SaisieAffectation & { quantite: number },
    existants: { code: string }[],
    settings: AppSettings | undefined,
    maintenant: number,
): PlanningEvent {
    const article = m.meta_data?.nom_modele || m.ordreCoupe?.refModele || 'Sans Nom';
    const facteurPlanning = m.ficheData?.facteurPlanning ?? 60;
    const bufferLancement = m.ficheData?.bufferLancement !== undefined ? m.ficheData.bufferLancement : (settings?.changeoverDurationMins ?? 120);
    const fin = finCalculee(m, settings, s.chaineId, s.debut, s.quantite) || s.debut;
    return {
        id: `plan_${m.id}_${maintenant}`,
        modelId: m.id,
        chaineId: s.chaineId,
        dateLancement: s.debut,
        startDate: s.debut,
        dateExport: fin,
        estimatedEndDate: fin,
        strictDeadline_DDS: s.export || undefined,
        qteTotal: s.quantite,
        totalQuantity: s.quantite,
        qteProduite: 0,
        producedQuantity: 0,
        status: 'READY',
        modelName: `${article}${SEP_LOT}${prochainCodeLot(existants)}`,
        clientName: m.ficheData?.client || '',
        color: '#6366f1',
        sectionSplitEnabled: !!m.ficheData?.sectionSplitEnabled,
        typeMarche: m.ficheData?.typeMarche ?? 'Local',
        facteurPlanning,
        bufferLancement,
        isLocked: true,
        updatedAt: new Date(maintenant).toISOString(),
    };
}

/**
 * Pause <-> reprise d'un pedido. La pause garde le statut d'avant (`pausedFrom`) et la reprise le rend
 * tel quel (un OF « Externe » redevient « Externe »). Un blocage de stock reel n'a pas de `pausedFrom` :
 * a la reprise, « En cours » si des pieces sont deja produites, sinon « Pret ». La reprise efface la raison
 * du blocage et les manques de matiere (le Planning les recalcule a sa prochaine modification).
 * Un OF termine ne change pas.
 */
export function basculerPause(ev: PlanningEvent, maintenant: number = Date.now()): PlanningEvent {
    if (ev.status === 'DONE') return ev;
    const horodate = new Date(maintenant).toISOString();
    if (ev.status === 'BLOCKED_STOCK') {
        const { pausedFrom, ...reste } = ev;
        return {
            ...reste,
            status: pausedFrom && pausedFrom !== 'BLOCKED_STOCK' && pausedFrom !== 'DONE' ? pausedFrom : evProduced(ev) > 0 ? 'IN_PROGRESS' : 'READY',
            blockedReason: undefined,
            materialShortages: undefined,
            updatedAt: horodate,
        };
    }
    return { ...ev, status: 'BLOCKED_STOCK', pausedFrom: ev.status, updatedAt: horodate };
}
