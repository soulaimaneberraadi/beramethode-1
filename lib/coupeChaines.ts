/**
 * La coupe vue depuis les chaines de montage.
 *
 * Une chaine coud chaque jour un certain nombre de pieces ; la coupe doit lui
 * garder une avance (des pieces coupees, toutes matieres comprises, pas encore
 * entrees en chaine). Cette page repond a la question de la salle de coupe :
 * « combien de matelas du modele X dois-je couper, et lesquels ? »
 *
 * Pour chaque modele sur une chaine, quatre choses ensemble :
 *  - le modele (Planning : chaine, lancement, DDS, quantite) ;
 *  - son suivi, resume (Suivi de production : pieces entrees, sorties, cadence reelle) ;
 *  - sa serie : les paquets que la serie d'etiquetage a donnes a CETTE chaine
 *    (ceux sans chaine vont a celle du Planning), de tel numero a tel numero ;
 *  - l'ordre de coupe : les matelas de ces paquets a couper, dans l'ordre de la
 *    serie, c'est-a-dire dans l'ordre ou la chaine les coudra, et les matelas
 *    des autres matieres qui leur font face.
 *
 * Sans sortie au Suivi, la cadence est la capacite du Planning
 * (`capaciteJournaliereChaine`, meme performance que la barre du Gantt) : la
 * coupe et le Planning disent alors le meme nombre.
 *
 * Aucune dependance a React : ce calcul se verifie par un test.
 * Lancer : node --import tsx lib/coupeChaines.test.ts
 */
import type { AppSettings, ModelData, PlanningEvent, ReglageChaineCoupe, SuiviData } from '../types';
import { capaciteJournaliereChaine } from '../utils/planning';
import { estOuvert, lignesUtiles, piecesLigne, resumerOrdre } from './coupeAtelier';
import { equilibrerOrdre, type EquilibreOrdre } from './equilibreMatieres';
import { paquetsSerie, saisieDe, type PaquetSerie } from './serieEtiquetage';

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
    /** Pieces de cette chaine : ses paquets de serie ; a defaut, la quantite du Planning. */
    commande: number;
    /** Tissu principal coupe, pour cette chaine. */
    coupe: number;
    /** Vetements dont toutes les matieres sont coupees : ce qui peut entrer en chaine. */
    prets: number;
    /** Entre en chaine (Suivi, colonne Entree). */
    entre: number;
    /** Sorti de chaine (Suivi, sorties heure par heure ; a defaut, la quantite produite du Planning). */
    sorti: number;
    /** Pieces/jour : moyenne des derniers jours produits au Suivi, sinon capacite du Planning. */
    cadence: number;
    sourceCadence: 'manuel' | 'suivi' | 'planning';
    /** Derniers jours saisis au Suivi pour cette chaine : entrees et sorties. */
    jours: { date: string; entre: number; sorti: number }[];
    /** Les paquets de la chaine, taille par taille. */
    parTaille: { taille: string; pieces: number; coupees: number }[];
    /** Tous les matelas encore a couper pour cette chaine, dans l'ordre de la serie ; `choisi` : a couper maintenant. */
    aCouperTous: { id: string; numero: string; pieces: number; debut: number | null; fin: number | null; choisi: boolean }[];
    /** Pret et pas encore entre en chaine. */
    enAttente: number;
    /** Jours de couture que l'attente represente. */
    joursAvance: number | null;
    /** Pieces a couper pour remonter a l'avance voulue (jamais plus que ce qui reste a couper). */
    aCouperPieces: number;
    /** Matelas de tissu a couper pour ca, dans l'ordre de la serie. */
    matelas: { id: string; numero: string; pieces: number }[];
    /** Matelas des autres matieres en face de ceux-la, pas encore coupes : un lot ne part pas sans eux. */
    autres: { code: string; nom: string; numeros: string[] }[];
    /** Tissu encore a couper pour cette chaine. */
    resteACouper: number;
    /** La serie de cette chaine : de tel numero a tel numero, paquets entres et sortis (feuille SERIE). */
    serie: { debut: number; fin: number; paquets: number; entres: number; sortis: number } | null;
    /** Les numeros de serie des matelas a couper. */
    serieACouper: { debut: number; fin: number } | null;
    /** La serie existe mais aucun paquet n'est donne a cette chaine : la coupe ne sait pas lesquels couper. */
    serieAbsente: boolean;
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
    /** Reglee a la main dans La Coupe (sinon : celle du Planning ou de la serie). */
    reglee: boolean;
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

const debutEvenement = (ev: PlanningEvent) => jourDe(ev.dateLancement || ev.startDate);

/** Un modele regarde une fois : ses paquets de serie et ses lots, tires de l'ordre ouvert. */
interface VueModele {
    paquets: PaquetSerie[];
    ordreParMatelas: Map<string, number>;
    eq: EquilibreOrdre | null;
    /** Chaine du Planning : celle des paquets sans chaine. */
    chaineParDefaut: string;
}

export function chainesDeCoupe(e: EntreeChaines): ChaineCoupe[] {
    const modeles = new Map(e.models.map(m => [m.id, m]));
    const objectif = Math.max(0, e.joursAvance);

    // Chaines reglees a la main dans La Coupe : un nom, ses alias, sa cadence, ses modeles.
    const regl: ReglageChaineCoupe[] = (e.settings?.chainesCoupe || []).filter(c => c && c.id);
    const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
    /** Le nom brut d'une chaine (serie, Planning) rendu a l'id de la chaine reglee qui le porte. */
    const versId = (brut: string | undefined): string => {
        if (!brut) return '';
        const n = norm(brut);
        const r = regl.find(c => norm(c.id) === n || norm(c.nom) === n || (c.alias || []).some(a => norm(a) === n));
        return r ? r.id : brut;
    };
    const reglageDe = (id: string) => regl.find(c => c.id === id);

    const suivisPar = new Map<string, SuiviData[]>();
    for (const s of e.suivis) (suivisPar.get(s.planningId) || suivisPar.set(s.planningId, []).get(s.planningId)!).push(s);

    // Evenements en cours, du plus tot au plus tard : le premier d'un modele donne sa chaine par defaut.
    const evs = e.evenements.filter(ev => ev.status !== 'DONE')
        .sort((a, b) => (debutEvenement(a) || '9999').localeCompare(debutEvenement(b) || '9999'));
    const evParModele = new Map<string, PlanningEvent[]>();
    for (const ev of evs) (evParModele.get(ev.modelId) || evParModele.set(ev.modelId, []).get(ev.modelId)!).push(ev);

    /* ---- Chaque modele a ordre ouvert : ses paquets, par chaine ---- */
    const vues = new Map<string, VueModele>();
    const vueDe = (m: ModelData): VueModele => {
        let v = vues.get(m.id);
        if (v) return v;
        const o = m.ordreCoupe;
        const chaineParDefaut = regl.find(c => (c.modeles || []).includes(m.id))?.id || versId(evParModele.get(m.id)?.[0]?.chaineId);
        const tailles = m.ficheData?.sizes || m.meta_data?.sizes || [];
        const lignes = o?.matelasLines || [];
        const toutes = [...tailles, ...[...new Set(lignes.flatMap(l => Object.keys(l.ratios || {})))].filter(t => !tailles.includes(t))];
        const paquets = o && estOuvert(m) ? paquetsSerie(lignes, toutes, o.serie?.depart || 1, o.serie?.figes) : [];
        const eq = o && estOuvert(m) ? equilibrerOrdre(o, tailles) : null;
        v = { paquets, ordreParMatelas: new Map(), eq, chaineParDefaut };
        vues.set(m.id, v);
        return v;
    };
    const chaineDuPaquet = (m: ModelData, p: PaquetSerie): string =>
        versId(saisieDe(m.ordreCoupe?.serie, p.cle).chaine) || vueDe(m).chaineParDefaut;

    // Chaines connues : celles des reglages, du Planning, et de la serie.
    const nb = e.settings?.chainsCount || 4;
    const ids: string[] = regl.length ? regl.map(c => c.id) : Array.from({ length: nb }, (_, i) => `CHAINE ${i + 1}`);
    const ajouterId = (id: string) => { if (id && !ids.includes(id)) ids.push(id); };
    for (const ev of evs) ajouterId(versId(ev.chaineId));
    for (const m of e.models) if (m.ordreCoupe && estOuvert(m)) for (const p of vueDe(m).paquets) ajouterId(chaineDuPaquet(m, p));

    /**
     * `ev` : l'OF du Planning sur CETTE chaine (son Suivi lui appartient) ; `evDates` :
     * n'importe quel OF du modele, pour les dates quand la serie le met sur une autre chaine.
     */
    const ligneModele = (id: string, m: ModelData | undefined, ev: PlanningEvent | undefined, evDates: PlanningEvent | undefined = ev): ModeleSurChaine | null => {
        const suivis = ev ? suivisPar.get(ev.id) || [] : [];
        const entre = suivis.reduce((s, x) => s + (Number(x.entrer) || 0), 0);
        const sortiSuivi = suivis.reduce((s, x) => s + sortiesDuJour(x), 0);
        const sorti = sortiSuivi > 0 ? sortiSuivi : Number(ev?.producedQuantity ?? ev?.qteProduite ?? 0) || 0;
        const aUnOrdre = !!(m?.ordreCoupe && estOuvert(m));
        const r = m && aUnOrdre ? resumerOrdre(m) : null;
        const vue = m && aUnOrdre ? vueDe(m) : null;

        // Les paquets de la serie donnes a cette chaine.
        const siens = m && vue ? vue.paquets.filter(p => chaineDuPaquet(m, p) === id) : [];
        const piecesPaquet = (p: PaquetSerie) => p.plis + (Number(saisieDe(m?.ordreCoupe?.serie, p.cle).pieces) || 0);
        const avecSerie = siens.length > 0;
        const piecesChaine = siens.reduce((s, p) => s + piecesPaquet(p), 0);
        const coupeChaine = siens.filter(p => p.fait).reduce((s, p) => s + piecesPaquet(p), 0);
        const commande = avecSerie ? piecesChaine : Number(ev?.qteTotal) || r?.qte || 0;
        const commandePlanning = Number(ev?.qteTotal) || commande;
        if (commandePlanning > 0 && sorti >= commandePlanning) return null; // OF termine : plus rien a lui couper

        const coupe = avecSerie ? coupeChaine : r?.coupees || 0;
        // Pret pour la chaine : toutes matieres coupees quand il y en a plusieurs.
        let prets = coupe;
        if (vue?.eq && vue.eq.matieres.filter(x => vue.eq!.parMatiere[x.id]?.nbMatelas > 0).length > 1) prets = Math.min(coupe, vue.eq.prets);

        // Cadence : les derniers jours ou la chaine a sorti ce modele.
        const produits = suivis.map(s => ({ date: s.date, n: sortiesDuJour(s) })).filter(x => x.n > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, JOURS_CADENCE);
        let cadence = 0, sourceCadence: ModeleSurChaine['sourceCadence'] = 'planning';
        const main = reglageDe(id);
        const cadenceMain = Number(m && main?.cadences?.[m.id]) || Number(main?.cadence) || 0;
        if (cadenceMain > 0) { cadence = cadenceMain; sourceCadence = 'manuel'; }
        else if (produits.length) { cadence = produits.reduce((s, x) => s + x.n, 0) / produits.length; sourceCadence = 'suivi'; }
        else if (e.settings) cadence = capaciteJournaliereChaine(e.settings, id, Math.max(0.1, Number(m?.meta_data?.total_temps) || 15), performancePlanning(m));

        const consomme = Math.max(entre, sorti);
        const enAttente = Math.max(0, prets - consomme);
        const joursAvance = cadence > 0 ? enAttente / cadence : null;

        const lancement = evDates ? debutEvenement(evDates) : null;
        const joursAvantLancement = lancement ? joursEntre(e.aujourdhui, lancement) : null;
        // Avant le lancement, la coupe commence « avance » jours plus tot ; avant, rien ne presse.
        const plusTard = joursAvantLancement !== null && joursAvantLancement > Math.ceil(objectif);
        const commencerLe = plusTard && lancement ? ajouterJours(lancement, -Math.ceil(objectif)) : null;

        // Les matelas a couper : ceux des paquets de la chaine, dans l'ordre de la serie ; sans serie, tout l'ordre par numero.
        type Cible = { id: string; numero: string; pieces: number; debut: number; fin: number };
        let restants: Cible[] = [];
        if (m && aUnOrdre) {
            const parLigne = new Map<string, Cible>();
            const lignes = new Map(lignesUtiles(m).map(l => [l.id, l]));
            if (avecSerie) {
                for (const p of siens) {
                    if (p.fait) continue;
                    const l = lignes.get(p.matelasId);
                    const c = parLigne.get(p.matelasId) || { id: p.matelasId, numero: (l?.numero || p.paquet || '').trim(), pieces: 0, debut: Infinity, fin: -Infinity };
                    c.pieces += piecesPaquet(p); c.debut = Math.min(c.debut, p.debut); c.fin = Math.max(c.fin, p.fin);
                    parLigne.set(p.matelasId, c);
                }
                restants = [...parLigne.values()].sort((a, b) => a.debut - b.debut);
            } else if (vue && vue.paquets.length === 0) {
                restants = lignesUtiles(m).filter(l => !l.fait && (l.plis || 0) > 0)
                    .map((l, rang) => ({ l, rang }))
                    .sort((a, b) => numeroTri(a.l.numero) - numeroTri(b.l.numero) || a.rang - b.rang)
                    .map(({ l }) => ({ id: l.id, numero: (l.numero || '').trim(), pieces: piecesLigne(l), debut: NaN, fin: NaN }));
            }
        }
        const resteACouper = aUnOrdre ? (avecSerie ? restants.reduce((s, c) => s + c.pieces, 0) : r?.aCouper || 0) : 0;
        const besoin = plusTard || !aUnOrdre ? 0 : Math.max(0, Math.min(Math.ceil(cadence * objectif - enAttente), resteACouper));
        const choisis: Cible[] = [];
        let cumul = 0;
        for (const c of restants) {
            if (cumul >= besoin) break;
            choisis.push(c);
            cumul += c.pieces;
        }

        // Face a face : les matelas des autres matieres des lots de ces matelas, pas encore coupes.
        const autres: ModeleSurChaine['autres'] = [];
        if (vue?.eq && choisis.length) {
            const eq = vue.eq;
            const voulus = new Set(choisis.map(c => c.id));
            const parMat = new Map<string, Set<string>>();
            for (const lot of eq.lots) {
                const principal = eq.matieres.find(x => x.principal);
                if (!principal || !(lot.matelas[principal.id] || []).some(x => voulus.has(x.id))) continue;
                for (const mat of eq.matieres) {
                    if (mat.principal) continue;
                    for (const x of lot.matelas[mat.id] || []) if (x.etat !== 'coupe') (parMat.get(mat.id) || parMat.set(mat.id, new Set()).get(mat.id)!).add(x.numero);
                }
            }
            for (const [matId, nums] of parMat) {
                const mat = eq.matieres.find(x => x.id === matId)!;
                autres.push({ code: mat.code, nom: mat.nom, numeros: [...nums].sort((a, b) => numeroTri(a) - numeroTri(b)) });
            }
        }

        const debuts = siens.map(p => p.debut), fins = siens.map(p => p.fin);
        const dejaChoisis = new Set(choisis.map(c => c.id));
        const parTaille = new Map<string, { taille: string; pieces: number; coupees: number }>();
        for (const p of siens) {
            const t = parTaille.get(p.taille) || { taille: p.taille, pieces: 0, coupees: 0 };
            t.pieces += piecesPaquet(p); if (p.fait) t.coupees += piecesPaquet(p);
            parTaille.set(p.taille, t);
        }
        const serieChoisie = choisis.filter(c => Number.isFinite(c.debut));
        return {
            eventId: ev?.id || `${id}-${m?.id || ''}`, modelId: m?.id || evDates?.modelId || '',
            nom: evDates?.modelName || m?.ordreCoupe?.refModele || m?.meta_data?.nom_modele || evDates?.modelId || '',
            client: ((m?.ficheData as any)?.client || evDates?.clientName || '').trim(),
            image: m?.image || m?.images?.front || undefined,
            aUnOrdre, lancement, dds: evDates ? jourDe(evDates.dateExport || evDates.strictDeadline_DDS) : null, joursAvantLancement,
            jours: suivis.map(s => ({ date: s.date, entre: Number(s.entrer) || 0, sorti: sortiesDuJour(s) })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7),
            parTaille: [...parTaille.values()],
            aCouperTous: restants.map(c => ({ id: c.id, numero: c.numero, pieces: c.pieces, debut: Number.isFinite(c.debut) ? c.debut : null, fin: Number.isFinite(c.fin) ? c.fin : null, choisi: dejaChoisis.has(c.id) })),
            commande, coupe, prets, entre, sorti,
            cadence: Math.round(cadence), sourceCadence, enAttente, joursAvance,
            aCouperPieces: besoin, matelas: choisis.map(c => ({ id: c.id, numero: c.numero, pieces: c.pieces })), autres, resteACouper,
            serie: avecSerie ? {
                debut: Math.min(...debuts), fin: Math.max(...fins), paquets: siens.length,
                entres: siens.filter(p => !!saisieDe(m?.ordreCoupe?.serie, p.cle).entree).length,
                sortis: siens.filter(p => !!saisieDe(m?.ordreCoupe?.serie, p.cle).sortie).length,
            } : null,
            serieACouper: serieChoisie.length ? { debut: Math.min(...serieChoisie.map(c => c.debut)), fin: Math.max(...serieChoisie.map(c => c.fin)) } : null,
            serieAbsente: aUnOrdre && !!vue && vue.paquets.length > 0 && !avecSerie,
            sansMatelas: besoin > 0 && choisis.length === 0 && !(aUnOrdre && vue && vue.paquets.length > 0 && !avecSerie),
            plusTard, commencerLe,
        };
    };

    return ids.map(id => {
        // Les modeles de la chaine : ceux que le Planning y met, et ceux dont la serie lui donne des paquets.
        const lignes: ModeleSurChaine[] = [];
        const vus = new Set<string>();
        for (const ev of evs.filter(x => versId(x.chaineId) === id)) {
            const l = ligneModele(id, modeles.get(ev.modelId), ev);
            vus.add(ev.modelId); // OF termine (rien a couper) : la serie ne le ramene pas
            if (l) lignes.push(l);
        }
        for (const m of e.models) {
            if (vus.has(m.id) || !m.ordreCoupe || !estOuvert(m)) continue;
            if (!vueDe(m).paquets.some(p => chaineDuPaquet(m, p) === id)) continue;
            const l = ligneModele(id, m, undefined, (evParModele.get(m.id) || [])[0]);
            if (l) { lignes.push(l); vus.add(m.id); }
        }
        // Modeles donnes a la main a cette chaine, meme sans paquet ni OF au Planning.
        for (const mid of reglageDe(id)?.modeles || []) {
            const m = modeles.get(mid);
            if (!m || vus.has(mid) || !m.ordreCoupe || !estOuvert(m)) continue;
            const l = ligneModele(id, m, undefined, (evParModele.get(mid) || [])[0]);
            if (l) { lignes.push(l); vus.add(mid); }
        }
        lignes.sort((a, b) => (a.lancement || '9999').localeCompare(b.lancement || '9999') || b.aCouperPieces - a.aCouperPieces);

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
            nom: reglageDe(id)?.nom || e.settings?.chainNames?.[id] || id,
            reglee: !!reglageDe(id),
            etat,
            modeles: lignes,
            matelasACouper: lignes.reduce((s, x) => s + x.matelas.length, 0),
            piecesACouper: lignes.reduce((s, x) => s + x.aCouperPieces, 0),
        };
    });
}
