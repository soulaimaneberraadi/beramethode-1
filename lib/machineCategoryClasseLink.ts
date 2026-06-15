/**
 * Correspondances Type (famille / machineCategory) ↔ Classe (code planning).
 * Saisie libre conservée ; suggestions auto sur blur / pastilles.
 */

const norm = (s: string) => s.trim().toLowerCase();

/** Classes numériques usuelles → libellé famille inventaire. */
const NUMERIC_CLASSE_TO_FAMILY: Record<string, string> = {
  '301': 'Piqueuse',
  '316': 'Piqueuse',
  '504': 'Surjeteuse',
  '514': 'Surjeteuse',
  '516': 'Surjeteuse',
  '602': 'Colleteuse',
  '402': 'Chainette',
  '101': 'Point invisible',
  '107': 'Pose bouton / Boutonnière',
  '304': 'Pose bouton / Boutonnière',
  '404': 'Pose bouton / Boutonnière',
  '256': 'Recouvreuse',
};

const ALPHA_CLASSE_TO_FAMILY: Record<string, string> = {
  BR: 'Brideuse',
  ZIGZAG: 'ZigZag',
  MAN: 'Manuel',
  FER: 'Repassage',
};

/**
 * Depuis une classe saisie (301, 516A, BR, zigzag…) → famille courte pour le champ Type.
 */
export function suggestFamilyFromClasseInput(classeRaw: string): string | null {
  const s = classeRaw.trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (ALPHA_CLASSE_TO_FAMILY[up]) return ALPHA_CLASSE_TO_FAMILY[up];
  const m = s.match(/^(\d+)/);
  if (m && NUMERIC_CLASSE_TO_FAMILY[m[1]]) return NUMERIC_CLASSE_TO_FAMILY[m[1]];
  return null;
}

/**
 * Depuis le type / famille (texte ou « Piqueuse Plate (301) ») → code classe proposé.
 */
export function suggestClasseFromFamilyInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const paren = raw.match(/\(\s*([^)]+?)\s*\)\s*$/);
  if (paren) {
    const code = paren[1].trim().toUpperCase();
    if (code) return code;
  }

  const t = norm(raw);

  if (t.includes('surjeteuse') && (t.includes('5') || t.includes('cinq'))) return '516';
  if (t.includes('surjeteuse') && (t.includes('4') || t.includes('quatre'))) return '514';
  if (t.includes('surjeteuse') && (t.includes('3') || t.includes('trois'))) return '504';
  if (t.includes('surjeteuse')) return '516';

  if (t.includes('piqueuse') && t.includes('double')) return '316';
  if (t.includes('piqueuse')) return '301';

  if (t.includes('colleteuse')) return '602';
  if (t.includes('chainette') || t.includes('chaînette')) return '402';
  if (t.includes('point') && t.includes('invisible')) return '101';
  if (t.includes('bartack')) return '304';
  if (t.includes('boutonnière') || t.includes('boutonniere') || t.includes('boutonniere')) {
    if (t.includes('oeillet') || t.includes('œillet')) return '404';
    return '304';
  }
  if (t.includes('pose') && t.includes('bouton')) return '107';
  if (t.includes('recouvreuse')) return '256';
  if (t.includes('brideuse')) return 'BR';
  if (t.includes('zigzag') || t.includes('zig zag')) return 'ZIGZAG';
  if (t.includes('manuel')) return 'MAN';
  if (t.includes('repass') || t === 'fer' || t.includes('fer à')) return 'FER';

  return null;
}
