/**
 * Montant en toutes lettres — mention obligatoire sur une facture marocaine.
 *
 * Le français est la langue de rédaction des factures au Maroc : c'est donc
 * en français que le montant s'écrit, quelle que soit la langue de l'écran.
 * Écrire « mille deux cents » quand le chiffre dit 1 200 est ce qui protège
 * d'un chiffre modifié après signature — c'est la seule raison d'être de
 * cette mention, et donc la seule règle qui compte ici : la lettre doit
 * dire EXACTEMENT ce que dit le chiffre.
 */

const UNITES = [
    'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
    'dix-sept', 'dix-huit', 'dix-neuf',
];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

/** 0–99. Les paliers 70 et 90 comptent en base vingt, comme le veut l'usage. */
const souscent = (n: number): string => {
    if (n < 20) return UNITES[n];
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (d === 7 || d === 9) {
        const reste = UNITES[10 + u];
        return `${DIZAINES[d]}${u === 1 && d === 7 ? '-et-' : '-'}${reste}`;
    }
    if (u === 0) return DIZAINES[d] + (d === 8 ? 's' : '');
    if (u === 1 && d !== 8) return `${DIZAINES[d]}-et-un`;
    return `${DIZAINES[d]}-${UNITES[u]}`;
};

/** 0–999. */
const souscentmille = (n: number): string => {
    if (n < 100) return souscent(n);
    const c = Math.floor(n / 100);
    const r = n % 100;
    const tete = c === 1 ? 'cent' : `${UNITES[c]} cent`;
    if (r === 0) return c === 1 ? 'cent' : `${tete}s`;
    return `${tete} ${souscent(r)}`;
};

/** Entier positif en lettres, jusqu'aux milliards. */
export const entierEnLettres = (n: number): string => {
    if (!Number.isFinite(n) || n < 0) return '';
    const entier = Math.floor(n);
    if (entier === 0) return 'zéro';

    const tranches: Array<[number, string, string]> = [
        [1_000_000_000, 'milliard', 'milliards'],
        [1_000_000, 'million', 'millions'],
        [1_000, 'mille', 'mille'],
    ];
    let reste = entier;
    const mots: string[] = [];
    for (const [valeur, singulier, pluriel] of tranches) {
        const part = Math.floor(reste / valeur);
        if (part > 0) {
            // « mille » est invariable et ne prend pas « un » devant.
            // « cent » et « vingt » restent invariables devant mille, million
            // ou milliard : « deux cent mille », jamais « deux cents mille ».
            const devant = souscentmille(part).replace(/(cent|vingt)s$/, '$1');
            if (valeur === 1_000) mots.push(part === 1 ? 'mille' : `${devant} mille`);
            else mots.push(`${devant} ${part === 1 ? singulier : pluriel}`);
            reste %= valeur;
        }
    }
    if (reste > 0) mots.push(souscentmille(reste));
    return mots.join(' ');
};

/**
 * Montant complet, partie décimale comprise.
 *
 * Les centimes sont ARRONDIS, pas tronqués : la lettre doit dire ce que dit
 * le total imprimé, et le total est lui-même arrondi au centime.
 */
export const montantEnLettres = (montant: number, devise = 'MAD'): string => {
    if (!Number.isFinite(montant)) return '';
    const negatif = montant < 0;
    const total = Math.round(Math.abs(montant) * 100);
    const entier = Math.floor(total / 100);
    const centimes = total % 100;

    const nomDevise = devise === 'MAD' ? 'dirhams' : devise;
    // « un million DE dirhams » : la préposition apparaît quand le montant
    // s'arrête sur un million ou un milliard entier.
    const liaison = entier >= 1_000_000 && entier % 1_000_000 === 0 ? 'de ' : '';
    const parts = [`${entierEnLettres(entier)} ${liaison}${entier === 1 && devise === 'MAD' ? 'dirham' : nomDevise}`];
    if (centimes > 0) parts.push(`${entierEnLettres(centimes)} ${centimes === 1 ? 'centime' : 'centimes'}`);

    const texte = parts.join(' et ');
    return (negatif ? 'moins ' : '') + texte.charAt(0).toUpperCase() + texte.slice(1);
};
