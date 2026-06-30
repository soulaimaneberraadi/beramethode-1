import type { Lang } from '../app/constants';

export type { Lang };

/**
 * Carte de traduction inline. `fr` est obligatoire (source + fallback).
 * Les autres langues sont optionnelles : si manquante → repli sur `fr`.
 */
export type TxMap = { fr: string } & Partial<Record<Exclude<Lang, 'fr'>, string>>;

/**
 * Traduction inline multilingue avec repli français.
 *
 * Remplace le motif binaire `lang === 'ar' ? AR : FR` par :
 *   tx(lang, { fr: FR, ar: AR, en: EN, es: ES, pt: PT, tr: TR })
 *
 * Règle pro : les TERMES TECHNIQUES ne se traduisent pas (TVA, API, SAM, CPM…)
 * → on garde la même chaîne dans toutes les langues.
 */
export function tx(lang: Lang | string | null | undefined, map: TxMap): string {
  const l = (lang || 'fr') as Lang;
  const v = (map as Record<string, string | undefined>)[l];
  return v != null ? v : map.fr;
}

/**
 * Repli sûr pour les tables `TRANSLATIONS[lang]` locales (fr/ar uniquement) :
 *   const t = pickT(TRANSLATIONS, lang);  // jamais undefined → fallback fr
 */
export function pickT<T extends Record<string, any>>(table: Record<string, T>, lang: Lang | string | null | undefined): T {
  const l = (lang || 'fr') as string;
  return table[l] ?? table.fr ?? (Object.values(table)[0] as T);
}
