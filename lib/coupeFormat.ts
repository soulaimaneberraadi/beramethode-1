/**
 * Formats et noms communs aux pages de La Coupe : un seul endroit, pour que deux ecrans ne
 * disent pas deux choses (nombres, jours, locale des dates, nom de chaine).
 *
 * Aucune dependance a React.
 */

/** Nombre arrondi a `dec` decimales (0 par defaut), separateurs de la locale du navigateur. */
export const fmtN = (n: number, dec = 0): string =>
    n.toLocaleString(undefined, { maximumFractionDigits: dec, minimumFractionDigits: 0 });

/** « 24/10 » depuis AAAA-MM-JJ, sans passer par un fuseau. */
export const jjmm = (iso?: string | null): string =>
    (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

/** Locale des dates pour une langue de l'application (pt et tr compris). */
export const localeDe = (lang: string | null | undefined): string =>
    lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : lang === 'tr' ? 'tr-TR' : 'fr-FR';

/**
 * Nom de chaine pour comparer : sans espaces autour, sans casse, sans accents
 * (« Chaîne 3 » et « CHAINE 3 » sont la meme chaine).
 */
export const normNom = (s: unknown): string =>
    String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
