/**
 * Saisie assistee des descriptions de gamme.
 *
 * La base, ce sont les gammes DEJA ecrites dans tous les modeles de l'atelier :
 * a 100 modeles, chaque operation courante (« Assembler epaules »,
 * « Surpiquer col 1 mm ») a deja ete tapee des dizaines de fois. On en tire :
 *  - les phrases entieres, pour retrouver une operation d'un seul geste ;
 *  - les mots, ranges par frequence ;
 *  - le mot qui suit habituellement un autre (« Assembler » -> « epaules »,
 *    « cotes », « manches »), pour proposer la suite des qu'on tape un espace.
 * Un socle technique (verbes de couture x parties du vetement) prend le relais
 * tant que l'historique est vide, avec un poids faible pour que l'usage reel
 * de l'atelier passe toujours devant.
 *
 * Fichier pur : aucune dependance a React.
 */

export interface PropositionSaisie {
    label: string;
    /** Portion du texte remplacee : [from, to). */
    from: number;
    to: number;
    /** 0 = suite de l'operation tapee, 1 = suite du mot, 3 = correction de faute. */
    rang: number;
    /** Mot SUIVANT predit (rien n'est encore tape) : Tab ne le valide pas. */
    prochain?: boolean;
}

export const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const MOTS_RE = /[A-Za-zÀ-ÿ0-9'’-]+/g;

// --- Socle technique -------------------------------------------------------
const VERBES = [
    'Assembler', 'Monter', 'Surpiquer', 'Piquer', 'Poser', 'Ourler', 'Surjeter', 'Fermer', 'Rabattre',
    'Border', 'Coulisser', 'Plaquer', 'Retourner', 'Nervurer', 'Rentrer', 'Bâtir', 'Préparer', 'Dégarnir',
    'Cranter', 'Remplier', 'Conformer', 'Préformer', 'Froncer', 'Doubler', 'Thermocoller', 'Brider',
    'Repasser', 'Plier', 'Emballer', 'Contrôler', 'Couper', 'Marquer', 'Ganser', 'Parer', 'Recouvrir',
];
const PARTIES = [
    'épaules', 'côtés', 'manches', 'col', 'pied de col', 'ceinture', 'poche', 'poches', 'bas', 'emmanchures',
    'empiècement', 'patte', 'braguette', 'fourche', 'entrejambe', 'dos', 'devant', 'capuche', 'poignets',
    'bord-côte', 'étiquette', 'passants', 'parementure', 'fente', 'biais', 'zip', 'encolure', 'ourlet',
    'rabat', 'sous-pont', 'pont', 'sac de poche', 'nervure', 'bande', 'dentelle', 'rivets', 'boutons',
];
/** Suites techniques plausibles (verbe -> parties) : poids faible, l'usage reel domine. */
const POIDS_SOCLE = 0.2;

interface Entree { texte: string; n: number }

export interface CorpusGamme {
    phrases: Map<string, Entree>;
    mots: Map<string, Entree>;
    /** mot precedent (normalise) -> mot suivant (normalise) -> entree */
    suivants: Map<string, Map<string, Entree>>;
}

const ajouter = (m: Map<string, Entree>, cle: string, texte: string, poids: number) => {
    const e = m.get(cle);
    if (e) e.n += poids;
    else m.set(cle, { texte, n: poids });
};

const nettoyer = (s: string) => (s || '').replace(/\s+/g, ' ').trim();

/**
 * @param descriptions descriptions de gamme de TOUS les modeles (repetitions comprises : c'est la frequence)
 * @param base vocabulaire de base (phrases ou mots) ; les entrees de glossaire « X (Y) » sont ignorees
 */
export function construireCorpus(descriptions: string[], base: string[] = []): CorpusGamme {
    const corpus: CorpusGamme = { phrases: new Map(), mots: new Map(), suivants: new Map() };

    const apprendre = (brut: string, poids: number, commePhrase: boolean) => {
        const texte = nettoyer(brut);
        if (texte.length < 2) return;
        const mots = texte.match(MOTS_RE) || [];
        if (mots.length === 0) return;
        if (commePhrase && mots.length >= 2) ajouter(corpus.phrases, sansAccents(texte), texte, poids);
        mots.forEach((mot, i) => {
            if (mot.length >= 2 && !/^\d+$/.test(mot)) ajouter(corpus.mots, sansAccents(mot), mot, poids);
            const suivant = mots[i + 1];
            if (suivant) {
                const cle = sansAccents(mot);
                let m = corpus.suivants.get(cle);
                if (!m) { m = new Map(); corpus.suivants.set(cle, m); }
                ajouter(m, sansAccents(suivant), suivant, poids);
            }
        });
    };

    for (const d of descriptions) apprendre(d, 1, true);
    for (const b of base) if (!/[()]/.test(b)) apprendre(b, POIDS_SOCLE, true);
    for (const v of VERBES) {
        ajouter(corpus.mots, sansAccents(v), v, POIDS_SOCLE);
        let m = corpus.suivants.get(sansAccents(v));
        if (!m) { m = new Map(); corpus.suivants.set(sansAccents(v), m); }
        for (const p of PARTIES) {
            const premier = p.split(' ')[0];
            ajouter(m, sansAccents(premier), premier, POIDS_SOCLE / 2);
        }
    }
    for (const p of PARTIES) p.split(' ').forEach(w => { if (w.length >= 2) ajouter(corpus.mots, sansAccents(w), w, POIDS_SOCLE); });
    return corpus;
}

/** Distance d'edition (Levenshtein), pour pardonner UNE faute de frappe. */
function distance(a: string, b: string): number {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[n];
}

/**
 * Propositions pour le texte `texte` avec le curseur en `caret`.
 * Ordre : la meilleure suite du mot, puis les operations deja ecrites qui
 * commencent comme ce qui est tape, puis les autres mots ; les corrections de
 * faute viennent en dernier et ne sont jamais preselectionnees.
 */
export function proposerSaisie(corpus: CorpusGamme, texte: string, caret: number, max = 6): PropositionSaisie[] {
    const avant = texte.slice(0, caret);
    const mot = avant.match(/(\S*)$/)?.[1] ?? '';
    const debutMot = caret - mot.length;
    const finMot = caret + (texte.slice(caret).match(/^\S*/)?.[0].length ?? 0);
    const phrase = avant.trimStart();
    const debutPhrase = avant.length - phrase.length;
    const phraseN = sansAccents(phrase);
    const motsAvant = avant.trimEnd().match(MOTS_RE) || [];
    const precedent = mot ? motsAvant[motsAvant.length - 2] : motsAvant[motsAvant.length - 1];
    const contexte = precedent ? corpus.suivants.get(sansAccents(precedent)) : undefined;

    const sortie: PropositionSaisie[] = [];
    const vus = new Set<string>();
    const garder = (p: PropositionSaisie) => {
        const cle = sansAccents(texte.slice(0, p.from) + p.label);
        if (vus.has(cle)) return;
        vus.add(cle);
        sortie.push(p);
    };

    // Operations deja ecrites qui prolongent tout ce qui est tape
    const phrases = phraseN.length >= 2
        ? [...corpus.phrases.entries()]
            .filter(([cle]) => cle.startsWith(phraseN) && cle !== phraseN.trimEnd())
            .sort((a, b) => b[1].n - a[1].n || a[1].texte.length - b[1].texte.length)
            .slice(0, max)
            .map(([, e]) => ({ label: e.texte, from: debutPhrase, to: finMot, rang: 0, prochain: !mot } as PropositionSaisie))
        : [];

    if (!mot) {
        // Rien de commence : on predit la suite (operation connue, sinon mot suivant habituel)
        phrases.forEach(garder);
        if (contexte) {
            [...contexte.values()]
                .sort((a, b) => b.n - a.n)
                .slice(0, max)
                .forEach(e => garder({ label: e.texte, from: caret, to: caret, rang: 1, prochain: true }));
        }
        return sortie.slice(0, max);
    }

    const motN = sansAccents(mot);
    const bonus = (cle: string) => (contexte?.get(cle)?.n ?? 0) * 3;
    const mots = [...corpus.mots.entries()]
        .filter(([cle]) => cle.startsWith(motN) && cle !== motN)
        .map(([cle, e]) => ({ e, score: e.n + bonus(cle) }))
        .sort((a, b) => b.score - a.score || a.e.texte.length - b.e.texte.length)
        .map(({ e }) => ({ label: e.texte, from: debutMot, to: finMot, rang: 1 } as PropositionSaisie));

    if (mots[0]) garder(mots[0]);
    phrases.slice(0, 3).forEach(garder);
    mots.slice(1).forEach(garder);

    if (sortie.length < max && motN.length >= 4 && !corpus.mots.has(motN)) {
        [...corpus.mots.entries()]
            .filter(([cle]) => !cle.startsWith(motN) && distance(motN, cle.slice(0, motN.length)) <= 1)
            .sort((a, b) => b[1].n - a[1].n)
            .slice(0, 3)
            .forEach(([, e]) => garder({ label: e.texte, from: debutMot, to: finMot, rang: 3 }));
    }
    return sortie.slice(0, max);
}
