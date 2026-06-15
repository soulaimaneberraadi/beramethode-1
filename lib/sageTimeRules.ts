/**
 * Règles d’ajustement « SAGE / paie » (arrondi, ancrage début de journée) sur des HH:MM.
 * Les heures **affichées** en fiche restent brutes côté API ; on applique ceci seulement pour
 * le calcul de `calculerHeures` (H.N. / H.S. / travail) et miroirs d’affichage cohérents.
 */

export type SageRoundingMode = 'nearest' | 'floor' | 'ceil';

export interface SageTimeRulesOptions {
    /** Ex. 15 = quart d’heure, 5 = 5 min. */
    roundMinutes: number;
    mode: SageRoundingMode;
    /** Début de journée d’usine (ex. 06:00) — pousse l’entrée (jour seul, pas nuit) au plafond de cette borne. */
    workdayStart: string;
    /** Désactiver toute règle SAGE (identité, comme avant). */
    disabled?: boolean;
}

const DEFAULT: SageTimeRulesOptions = {
    roundMinutes: 15,
    mode: 'nearest',
    workdayStart: '06:00',
    disabled: false,
};

function normalizeHHMM(t: string | null | undefined): string | null {
    if (t == null || String(t).trim() === '') return null;
    const m = String(t).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Minutes depuis minuit, 0..1440 (1440 = minuit suivant, traité par arrondi comme 0 le lendemain — évité ici). */
export function toMinutes0(t: string | null | undefined): number | null {
    const n = normalizeHHMM(t);
    if (n == null) return null;
    const [h, m] = n.split(':').map(Number);
    return h * 60 + m;
}

function fmtMin(m: number): string {
    let v = m;
    while (v < 0) v += 24 * 60;
    while (v >= 24 * 60) v -= 24 * 60;
    const h = Math.floor(v / 60);
    const mm = v % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function roundBlock(totalMin: number, roundMin: number, mode: SageRoundingMode): number {
    const n = roundMin <= 0 ? 1 : Math.min(60, roundMin);
    if (n === 1) return totalMin;
    if (mode === 'floor') return Math.floor(totalMin / n) * n;
    if (mode === 'ceil') return Math.ceil(totalMin / n) * n;
    return Math.round(totalMin / n) * n;
}

/**
 * Arrondi d’une heure (HH:MM) « à N minutes » — même tranche 0h–24h.
 */
export function roundSageHeure(
    t: string | null | undefined,
    roundMinutes: number,
    mode: SageRoundingMode = 'nearest',
): string | null {
    const n = toMinutes0(t);
    if (n === null) return null;
    const r = roundBlock(n, roundMinutes, mode);
    return fmtMin(r);
}

/**
 * Même plage 0h–24h : la paire est « nuit » ssi sortie < entrée (horloge) comme `calculerHeures`.
 */
export function isNightPair(entree: string | null, sortie: string | null): boolean {
    const a = toMinutes0(entree);
    const b = toMinutes0(sortie);
    if (a == null || b == null) return false;
    return b < a;
}

/**
 * Ancrage entrée le matin (jour) : si pas de nuit, et entrée (après arrondi) < début de journée,
 * l’entrée vaut au minimum `workdayStart`.
 */
export function ancrageJourneeEntree(
    heureEntree: string,
    heureSortie: string,
    workdayStart: string,
    alreadyRounded = true,
): string {
    const w = toMinutes0(workdayStart) ?? 6 * 60;
    let e = toMinutes0(heureEntree) ?? 0;
    if (!alreadyRounded) {
        /* caller should have rounded; kept for future */
    }
    if (isNightPair(heureEntree, heureSortie)) return heureEntree;
    if (e < w) e = w;
    return fmtMin(e);
}

export interface SageTimesForCalc {
    entree: string | null;
    sortie: string | null;
    pauseDebut: string | null;
    pauseFin: string | null;
}

/**
 * Passe d’heures brutes d’enregistrement aux heures injectées dans `calculerHeures` (SAGE).
 */
export function getSageTimesForHeuresCalc(
    hEnt: string | null | undefined,
    hSor: string | null | undefined,
    pD: string | null | undefined,
    pF: string | null | undefined,
    opts: Partial<SageTimeRulesOptions> = {},
): SageTimesForCalc {
    const o = { ...DEFAULT, ...opts };
    if (o.disabled) {
        return {
            entree: normalizeHHMM(hEnt) ?? hEnt?.trim() ?? null,
            sortie: normalizeHHMM(hSor) ?? hSor?.trim() ?? null,
            pauseDebut: pD == null || String(pD).trim() === '' ? null : normalizeHHMM(pD) ?? pD,
            pauseFin: pF == null || String(pF).trim() === '' ? null : normalizeHHMM(pF) ?? pF,
        };
    }
    const rm = o.roundMinutes;
    const mode = o.mode;

    let e = hEnt;
    let s = hSor;
    e = e ? roundSageHeure(e, rm, mode) : null;
    s = s ? roundSageHeure(s, rm, mode) : null;
    let p1 = pD == null || String(pD).trim() === '' ? null : roundSageHeure(String(pD), rm, mode);
    let p2 = pF == null || String(pF).trim() === '' ? null : roundSageHeure(String(pF), rm, mode);

    if (e && s) {
        e = ancrageJourneeEntree(e, s, o.workdayStart, true);
    }

    return { entree: e, sortie: s, pauseDebut: p1, pauseFin: p2 };
}

/**
 * Avertissement : l’arrondi change le sens « jour / nuit » (intersection tranches) par rapport à la fiche réelle.
 */
export function sageCreneauWarning(
    rawEnt: string | null,
    rawSor: string | null,
    sageEnt: string | null,
    sageSor: string | null,
): boolean {
    if (!rawEnt || !rawSor || !sageEnt || !sageSor) return false;
    return isNightPair(rawEnt, rawSor) !== isNightPair(sageEnt, sageSor);
}

export function getDefaultSageTimeOptions(): SageTimeRulesOptions {
    return { ...DEFAULT };
}
