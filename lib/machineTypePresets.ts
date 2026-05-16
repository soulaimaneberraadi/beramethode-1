import type { Machine } from '../types';

/** Types « famille » proposés par défaut (saisie libre toujours possible). */
export const BASE_MACHINE_TYPE_PRESETS: readonly string[] = [
  'Piqueuse',
  'Surjeteuse',
  'Colleteuse',
  'Point invisible',
  'ZigZag',
  'Brideuse',
  'Pose bouton / Boutonnière',
  'Manuel',
  'Repassage',
];

/**
 * Suggestions pour un champ « type / famille » (ex. `machineCategory`) :
 * préréglages + libellés déjà utilisés sur le parc (`machineCategory` non vide).
 * Déduplication insensible à la casse, tri FR.
 */
export function machineTypeDatalistOptions(machines: Machine[]): string[] {
  const seen = new Map<string, string>();
  for (const t of BASE_MACHINE_TYPE_PRESETS) {
    const k = t.toLowerCase();
    if (!seen.has(k)) seen.set(k, t);
  }
  for (const m of machines) {
    const cat = (m.machineCategory || '').trim();
    if (!cat) continue;
    const k = cat.toLowerCase();
    if (!seen.has(k)) seen.set(k, cat);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

/**
 * Suggestions pour un champ « machine » type guide (ex. `Guide.machineType`) :
 * unités `nom (classe)` + familles / catégories du parc + préréglages.
 */
export function machineGuideDatalistOptions(machines: Machine[]): string[] {
  const seen = new Map<string, string>();
  for (const x of machineTypeDatalistOptions(machines)) {
    seen.set(x.toLowerCase(), x);
  }
  for (const m of machines) {
    const nm = (m.name || '').trim();
    const cl = (m.classe || '').trim();
    if (nm && cl) {
      const v = `${nm} (${cl})`;
      seen.set(v.toLowerCase(), v);
    } else if (nm) {
      seen.set(nm.toLowerCase(), nm);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}
