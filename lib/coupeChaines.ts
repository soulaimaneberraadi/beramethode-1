/**
 * La coupe vue depuis les chaines de montage.
 *
 * Une chaine coud chaque jour un certain nombre de pieces ; la coupe doit lui
 * garder une avance (des pieces coupees, toutes matieres comprises, pas encore
 * entrees en chaine). Cette page repond a la question de la salle de coupe :
 * « combien de matelas du modele X dois-je couper, et lesquels ? »
 *
 * Trois sources, aucune saisie de plus :
 *  - le Planning : quel modele sur quelle chaine, lancement, DDS, quantite ;
 *  - le Suivi de production : pieces entrees en chaine (`entrer`) et sorties
 *    heure par heure, par OF et par jour — la cadence reelle de la chaine ;
 *  - La Coupe : matelas coupes, et ce qui est pret toutes matieres comprises.
 *
 * Sans sortie au Suivi, la cadence est la capacite du Planning
 * (`capaciteJournaliereChaine`, meme performance que la barre du Gantt) : la
 * coupe et le Planning disent alors le meme nombre.
 *
 * Aucune dependance a React : ce calcul se verifie par un test.
 * Lancer : node --import tsx lib/coupeChaines.test.ts
 */
import type { AppSettings, ModelData, PlanningEvent, SuiviData } from '../types';
import { capaciteJournaliereChaine } from '../utils/planning';
import { estOuvert, lignesUtiles, piecesLigne, resumerOrdre } from './coupeAtelier';
import { equilibrerOrdre } from './equilibreMatieres';

/** `horsCoupe` : le modele en chaine n'a pas d'ordre ouvert dans La Coupe, on ne sait pas ce qui l'attend. */
export type EtatChaine = 'arret' | 'juste' | 'couverte' | 'horsCoupe' | 'libre';

export interface ModeleSurChaine {
    eventId: string;
    modelId: string;
    nom: string;
    client: string;
    image?: string;
    /** Le modele a un ordre de coupe ouvert dans La Coupe. */
    aUnOrdre: boolean;
    lancement: string | null;
    dds: string | null;
    /** Jours avant le lancement (negatif ou 0 : lance). */
    joursAvantLancement: number | null;
    commande: number;
    /** Tissu principal coupe. */
    coupe: number;
    /** Vetements dont toutes les matieres sont coupees : ce qui peut entrer en chaine. */
    prets: number;
    /** Entre en chaine (Suivi, colonne Entree). */
    entre: number;
    /** Sorti de chaine (Suivi, sorties heure par heure ; a defaut, la quantite produite du Planning). */
    sorti: number;
    /** Pieces/jour : moyenne des derniers jours produits au Suivi, sinon capacite du Planning. */
    cadence: number;
    sourceCadence: 'suivi' | 'planning';
    /** Pret et pas encore entre en chaine. */
    enAttente: number;
    /** Jours de couture que l'attente represente. */
    joursAvance: number | null;
    /** Pieces a couper pour remonter a l'avance voulue (jamais plus que ce qui reste a couper). */
    aCouperPieces: number;
    /** Matelas de tissu a couper pour ca, dans l'ordre des numeros. */
    matelas: { id: string; numero: string; pieces: number }[];
    /** Tissu encore a couper sur tout l'ordre. */
    resteACouper: number;
    /** Il faut couper mais l'ordre n'a pas de matelas calcules. */
    sansMatelas: boolean;
    /** Lancement trop loin : rien a couper avant `commencerLe`. */
    plusTard: boolean;
    commencerLe: string | null;
}

export interface ChaineCoupe {
    id: string;
    nom: string;
    etat: EtatChaine;
    /** Le modele en cours (le premier lance), puis les suivants. */
    modeles: ModeleSurChaine[];
    matelasACouper: number;
    piecesACouper: number;
}

export interface EntreeChaines {
    models: ModelData[];
    evenements: PlanningEvent[];
    suivis: SuiviData[];
    settings?: AppSettings;
    /** Jours de couture d'avance que la coupe doit garder a chaque chaine. */
    joursAvance: number;
    /** AAAA-MM-JJ. */
    aujourdhui: string;
}

const JOUR_MS = 86400000;
const jourDe = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const s = String(iso).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const joursEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / JOUR_MS);
const ajouterJours = (a: string, n: number) => new Date(Date.parse(`${a}T12:00:00`) + n * JOUR_MS).toISOString().slice(0, 10);
const sortiesDuJour = (s: SuiviData) => Object.values(s.sorties || {}).reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
const numeroTri = (n?: string) => { const x = parseInt(String(n ?? ''), 10); return Number.isFinite(x) ? x : Number.MAX_SAFE_INTEGER; };

/** Jours produits retenus pour la cadence : assez pour lisser, assez peu pour suivre la chaine. */
const JOURS_CADENCE = 5;

/**
 * Performance du Planning pour un modele, comme la barre du Gantt (EventBar) :
 * efficience visee du modele x facteur de planning. Les deux pages doivent
 * annoncer la meme capacite.
 */
const performancePlanning = (m: ModelData | undefined) =>
    ((m?.ficheData?.targetEfficiency ?? 85) * (m?.ficheData?.facteurPlanning ?? 60)) / 10000;

export function chainesDeCoupe(e: EntreeChaines): ChaineCoupe[] {
    const modeles = new Map(e.models.map(m => [m.id, m]));
    const nb = e.settings?.chainsCount || 4;
    const ids = Array.from({ length: nb }, (_, i) => `CHAINE ${i + 1}`);
    for (const ev of e.evenements) if (ev.chaineId && !ids.includes(ev.chaineId)) ids.push(ev.chaineId);

    const suivisPar = new Map<string, SuiviData[]>();
    for (const s of e.suivis) (suivisPar.get(s.planningId) || suivisPar.set(s.planningId, []).get(s.planningId)!).push(s);

    const objectif = Math.max(0, e.joursAvance);

    const ligneModele = (ev: PlanningEvent): ModeleSurChaine | null => {
        const m = modeles.get(ev.modelId);
        const suivis = suivisPar.get(ev.id) || [];
        const entre = suivis.reduce((s, x) => s + (Number(x.entrer) || 0), 0);
        const sortiSuivi = suivis.reduce((s, x) => s + sortiesDuJour(x), 0);
        const sorti = sortiSuivi > 0 ? sortiSuivi : Number(ev.producedQuantity ?? ev.qteProduite ?? 0) || 0;
        const aUnOrdre = !!(m?.ordreCoupe && estOuvert(m));
        const r = m ? resumerOrdre(m) : null;
        const commande = Number(ev.qteTotal) || r?.qte || 0;
        if (commande > 0 && sorti >= commande) return null; // OF termine : plus rien a lui couper

        // Pret pour la chaine : toutes matieres coupees quand il y en a plusieurs.
        let prets = r?.coupees || 0;
        if (m?.ordreCoupe) {
            const eq = equilibrerOrdre(m.ordreCoupe, m.ficheData?.sizes || m.meta_data?.sizes || []);
            if (eq.matieres.filter(x => eq.parMatiere[x.id]?.nbMatelas > 0).length > 1) prets = eq.prets;
        }

        // Cadence : les derniers jours ou la chaine a sorti ce modele.
        const produits = suivis.map(s => ({ date: s.date, n: sortiesDuJour(s) })).filter(x => x.n > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, JOURS_CADENCE);
        let cadence = 0, sourceCadence: ModeleSurChaine['sourceCadence'] = 'planning';
        if (produits.length) { cadence = produits.reduce((s, x) => s + x.n, 0) / produits.length; sourceCadence = 'suivi'; }
        else if (e.settings) cadence = capaciteJournaliereChaine(e.settings, ev.chaineId, Math.max(0.1, Number(m?.meta_data?.total_temps) || 15), performancePlanning(m));

        const consomme = Math.max(entre, sorti);
        const enAttente = Math.max(0, prets - consomme);
        const joursAvance = cadence > 0 ? enAttente / cadence : null;

        const lancement = jourDe(ev.dateLancement || ev.startDate);
        const joursAvantLancement = lancement ? joursEntre(e.aujourdhui, lancement) : null;
        // Avant le lancement, la coupe commence « avance » jours plus tot ; avant, rien ne presse.
        const plusTard = joursAvantLancement !== null && joursAvantLancement > Math.ceil(objectif);
        const commencerLe = plusTard && lancement ? ajouterJours(lancement, -Math.ceil(objectif)) : null;

        const restantes = m ? lignesUtiles(m).filter(l => !l.fait && (l.plis || 0) > 0)
            .map((l, rang) => ({ l, rang }))
            .sort((a, b) => numeroTri(a.l.numero) - numeroTri(b.l.numero) || a.rang - b.rang)
            .map(x => x.l) : [];
        const resteACouper = aUnOrdre && r ? r.aCouper : 0;
        const besoin = plusTard || !aUnOrdre ? 0 : Math.max(0, Math.min(Math.ceil(cadence * objectif - enAttente), resteACouper));
        const matelas: ModeleSurChaine['matelas'] = [];
        let cumul = 0;
        for (const l of restantes) {
            if (cumul >= besoin) break;
            const p = piecesLigne(l);
            matelas.push({ id: l.id, numero: (l.numero || '').trim(), pieces: p });
            cumul += p;
        }

        return {
            eventId: ev.id, modelId: ev.modelId,
            nom: ev.modelName || m?.ordreCoupe?.refModele || m?.meta_data?.nom_modele || ev.modelId,
            client: ((m?.ficheData as any)?.client || ev.clientName || '').trim(),
            image: m?.image || m?.images?.front || undefined,
            aUnOrdre, lancement, dds: jourDe(ev.dateExport || ev.strictDeadline_DDS), joursAvantLancement,
            commande, coupe: r?.coupees || 0, prets, entre, sorti,
            cadence: Math.round(cadence), sourceCadence, enAttente, joursAvance,
            aCouperPieces: besoin, matelas, resteACouper,
            sansMatelas: besoin > 0 && restantes.length === 0,
            plusTard, commencerLe,
        };
    };

    return ids.map(id => {
        const evs = e.evenements
            .filter(ev => ev.chaineId === id && ev.status !== 'DONE')
            .sort((a, b) => (jourDe(a.dateLancement || a.startDate) || '9999').localeCompare(jourDe(b.dateLancement || b.startDate) || '9999'));
        const lignes = evs.map(ligneModele).filter((x): x is ModeleSurChaine => !!x);
        // L'etat de la chaine : celui du modele qu'elle coud (le premier lance), sinon du prochain.
        const courant = lignes.find(x => x.joursAvantLancement === null || x.joursAvantLancement <= 0) || lignes[0];
        let etat: EtatChaine = 'libre';
        if (courant) {
            const j = courant.joursAvance;
            etat = !courant.aUnOrdre ? 'horsCoupe'
                : courant.plusTard ? 'couverte'
                : j === null ? 'juste'
                    : j < 1 ? 'arret'
                        : j < objectif ? 'juste' : 'couverte';
        }
        return {
            id,
            nom: e.settings?.chainNames?.[id] || id,
            etat,
            modeles: lignes,
            matelasACouper: lignes.reduce((s, x) => s + x.matelas.length, 0),
            piecesACouper: lignes.reduce((s, x) => s + x.aCouperPieces, 0),
        };
    });
}
