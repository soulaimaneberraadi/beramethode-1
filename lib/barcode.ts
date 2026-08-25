/**
 * Code-barres minimaliste, sans dépendance ni police externe :
 *   - EAN-13  : identifiant numérique fiable d'un modèle (référence unique).
 *   - CODE-39 : étiquette « produit » qui transporte modèle + taille + couleur,
 *               lisible par n'importe quel scanner laser (les plus courants).
 *
 * Format des étiquettes :  REF%TAILLE%COULEUR  (séparateur `%`, valeurs en
 * majuscules, encadré des `*` de démarrage/arrêt du CODE-39).
 */

const C39: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
  '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100',
};

/** Encode un texte en CODE-39 (majuscules, caractères autorisés seulement,
 *  entouré de `*`). Les caractères interdits sont silencieusement ignorés. */
export function code39Encode(data: string): string {
  let out = '*';
  for (const ch of data.toUpperCase()) {
    if (C39[ch]) out += ch;
  }
  return out + '*';
}

/** Code EAN-13 : les caractères autorisés (REF%TAILLE%COULEUR) y étant absents,
 *  on garde CODE-39 pour les étiquettes ; EAN-13 sert au code unique du modèle. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(first12[i]) || 0;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** Construit un EAN-13 valide à partir de n'importe quelle valeur numérique
 *  (l'id du modèle, un horodatage, un compteur...) : on garde 12 chiffres et
 *  on calcule la clé de contrôle. Déterministe et unique si la source l'est. */
export function ean13FromDigits(input: string): string {
  const digits = input.replace(/\D/g, '');
  const first12 = (digits + '000000000000').slice(0, 12);
  return first12 + ean13CheckDigit(first12);
}

/** EAN-13 « variante » : un code distinct par taille × couleur, dérivé du
 *  code du modèle (10 premiers chiffres) + index taille + index couleur.
 *  Déterministe et unique par combinaison — c'est ce code que le magasin
 *  lit comme un EAN-13 normal, et que notre programme sait déchiffrer. */
export function ean13Variant(base10: string, si: number, ci: number): string {
  const b = (base10.replace(/\D/g, '') + '0000000000').slice(0, 10);
  const first12 = (b + String(Math.max(0, si)) + String(Math.max(0, ci))).slice(0, 12);
  return first12 + ean13CheckDigit(first12);
}

/* ── Encodage EAN-13 (norme GS1) ─────────────────────────────────────────
 * Utilisé pour le code « boutique » : un EAN-13 par variante taille ×
 * couleur, lisible par n'importe quel point de vente (scanner + base du
 * magasin). Le premier chiffre n'est pas dessiné en barres : il est codé
 * dans la parité (L/G) des 6 chiffres de gauche. */
const EAN_L: string[] = [
  '0001101', '0011001', '0010011', '0111101', '0100011', '0110001',
  '0101111', '0111011', '0110111', '0001011',
];
const EAN_G: string[] = [
  '0100111', '0110011', '0011011', '0100001', '0011101', '0111001',
  '0000101', '0010001', '0001001', '0010111',
];
const EAN_R: string[] = [
  '1110010', '1100110', '1101100', '1000010', '1011100', '1001110',
  '1010000', '1000100', '1001000', '1110100',
];
const EAN_PARITY: string[] = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

/** Dessine un EAN-13 valide (13 chiffres, clé incluse) sur le canvas fourni.
 *  Les chiffres sont imprimés sous les barres comme le veut la norme. */
export function renderEAN13(
  canvas: HTMLCanvasElement,
  ean13: string,
  opts?: { module?: number; height?: number; quiet?: number; drawText?: boolean },
): void {
  const digits = ean13.replace(/\D/g, '').slice(0, 13);
  const module = opts?.module ?? 2;
  const height = opts?.height ?? 48;
  const quiet = opts?.quiet ?? 8;
  const drawText = opts?.drawText ?? true;
  const parity = EAN_PARITY[Number(digits[0]) || 0] || 'LLLLLL';

  const seq: Array<{ bar: boolean; w: number }> = [];
  const push = (pat: string) => { for (const ch of pat) seq.push({ bar: ch === '1', w: module }); };
  push('101');
  for (let i = 1; i <= 6; i++) {
    const d = Number(digits[i]) || 0;
    push(parity[i - 1] === 'L' ? EAN_L[d] : EAN_G[d]);
  }
  push('01010');
  for (let i = 7; i <= 12; i++) push(EAN_R[Number(digits[i]) || 0]);
  push('101');

  const barHeight = drawText ? height - 14 : height;
  const total = quiet * 2 + 95 * module;
  canvas.width = Math.max(1, total);
  canvas.height = Math.max(1, height);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  let x = quiet;
  for (const e of seq) {
    if (e.bar) ctx.fillRect(Math.round(x), 0, Math.round(e.w), barHeight);
    x += e.w;
  }

  if (drawText) {
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const m = module;
    // Premier chiffre (dans la zone de silence) puis groupes de 6.
    ctx.fillText(digits[0], quiet + 2 * m, barHeight + 1);
    for (let i = 0; i < 6; i++) ctx.fillText(digits[1 + i], quiet + (6.5 + 7 * i) * m, barHeight + 1);
    for (let i = 0; i < 6; i++) ctx.fillText(digits[7 + i], quiet + (53.5 + 7 * i) * m, barHeight + 1);
  }
}

/** Dessine un CODE-39 sur le canvas fourni (largeurs narrow/wide configurables).
 *  `data` est le texte à encoder (REF%TAILLE%COULEUR). */
export function renderCode39(
  canvas: HTMLCanvasElement,
  data: string,
  opts?: { narrow?: number; wide?: number; height?: number; quiet?: number },
): void {
  const narrow = opts?.narrow ?? 2;
  const wide = opts?.wide ?? narrow * 3;
  const height = opts?.height ?? 48;
  const quiet = opts?.quiet ?? 10;
  const text = code39Encode(data);

  const elems: Array<{ bar: boolean; w: number }> = [];
  for (const ch of text) {
    const pat = C39[ch] || '000000000';
    for (let i = 0; i < 9; i++) {
      elems.push({ bar: i % 2 === 0, w: pat[i] === '1' ? wide : narrow });
    }
    // Espace inter-caractère (toujours étroit).
    elems.push({ bar: false, w: narrow });
  }

  let total = quiet * 2;
  for (const e of elems) total += e.w;
  canvas.width = Math.max(1, Math.round(total));
  canvas.height = Math.max(1, height);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  let x = quiet;
  for (const e of elems) {
    if (e.bar) ctx.fillRect(Math.round(x), 0, Math.round(e.w), canvas.height);
    x += e.w;
  }
}

/** Parcourt le texte scanné (au format REF%TAILLE%COULEUR, `*` de CODE-39
 *  tolérés) et le découpe. Une simple référence (13 chiffres EAN-13) donne
 *  `{ ref }` sans taille ni couleur. */
export function parseScanCode(text: string): { ref: string; taille?: string; couleur?: string } | null {
  let t = text.trim();
  if (t.startsWith('*')) t = t.slice(1);
  if (t.endsWith('*')) t = t.slice(0, -1);
  const parts = t.split('%');
  if (!parts[0]) return null;
  return {
    ref: parts[0],
    taille: parts[1] || undefined,
    couleur: parts[2] || undefined,
  };
}