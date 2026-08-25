/**
 * Générateur ZPL pour l'étiquette tiki — imprimante réseau pilotée en
 * ZPL/EPL direct (port 9100), quand le rendu HTML (`@page` à la taille
 * exacte) ne convient pas au pilote de l'imprimante.
 *
 * Portée volontairement réduite au texte et au code-barres EAN-13. Le logo
 * n'est PAS converti ici : encoder un bitmap ZPL (`^GF`) à l'aveugle, sans
 * imprimante sous la main pour vérifier chaque octet, produirait des
 * étiquettes corrompues plutôt qu'un logo simplement absent. Le mode HTML
 * reste la voie à utiliser pour le logo.
 *
 * `^PQ<n>` fait imprimer N copies d'UNE étiquette envoyée une seule fois :
 * pour 460 pièces réparties en quelques cellules couleur × taille, ça évite
 * de renvoyer les mêmes données des centaines de fois.
 */

export interface ZplCell {
  /** Code EAN-13 complet (13 chiffres, avec la clé de contrôle). */
  code: string;
  ref: string;
  taille: string;
  couleur: string;
  /** Déjà formaté (« 350 MAD ») — le formatage monétaire reste au niveau
   *  de l'appelant, qui connaît la devise et la locale. */
  prix?: string;
  qty: number;
}

export interface ZplLabelOptions {
  widthMm: number;
  heightMm: number;
  /** Résolution de l'imprimante en points par pouce. 203 dpi est le standard
   *  des imprimantes de bureau (Zebra GK/GC, etc.) ; 300 dpi équipe les
   *  modèles industriels. */
  dpi: number;
  brand: string;
  fields: { marque: boolean; ref: boolean; taille: boolean; couleur: boolean; prix: boolean; code: boolean };
}

const mmToDots = (v: number, dpi: number): number => Math.round((v / 25.4) * dpi);

/** `^FD` interprète `^` et `~` comme des débuts de commande : un texte qui en
 *  contient casserait le flux ZPL. On les retire plutôt que de les échapper —
 *  ni l'un ni l'autre n'a de sens dans un nom de modèle ou une couleur. */
const zplSafe = (s: string): string => s.replace(/[\^~]/g, '');

/** Un EAN-13 complet contient déjà sa clé de contrôle (chiffre 13). `^BE`
 *  attend les 12 premiers chiffres et calcule la clé lui-même — la logique
 *  est la même que celle qui a produit notre code, donc les deux
 *  s'accordent. Fournir les 13 chiffres ferait dépendre le résultat d'un
 *  réglage de firmware qui varie d'un modèle d'imprimante à l'autre. */
const ean13Payload = (code: string): string => code.replace(/\D/g, '').slice(0, 12);

/**
 * Construit le flux ZPL pour une liste de cellules (couleur × taille), déjà
 * triées dans l'ordre de sortie voulu par l'appelant. Une étiquette par
 * cellule DISTINCTE, répétée `qty` fois via `^PQ` — pas une étiquette par
 * pièce physique.
 */
export function buildZplForCells(cells: ZplCell[], opts: ZplLabelOptions): string {
  const { dpi } = opts;
  const w = mmToDots(opts.widthMm, dpi);
  const h = mmToDots(opts.heightMm, dpi);
  const padX = mmToDots(1.8, dpi);
  const topY = mmToDots(2, dpi);
  const lineH = mmToDots(3.3, dpi);
  const brandH = mmToDots(3.6, dpi);
  const barcodeH = Math.max(mmToDots(6, dpi), Math.round(h * 0.28));
  const brand = zplSafe((opts.brand || '').trim().toUpperCase());

  let out = '';
  for (const cell of cells) {
    const qty = Math.max(0, Math.floor(cell.qty));
    if (qty <= 0) continue;

    let y = topY;
    let z = '^XA\n';
    z += `^PW${w}\n^LL${h}\n`;
    // ^CI28 : UTF-8, pour que les accents (é, è, à) sortent lisibles au lieu
    // d'octets bruts — le firmware Zebra moderne le supporte nativement.
    z += '^CI28\n';

    if (opts.fields.marque && brand) {
      z += `^FO${padX},${y}^A0N,${brandH},${brandH}^FD${brand}^FS\n`;
      y += brandH + mmToDots(0.8, dpi);
    }

    const row = (label: string, value: string) => {
      const fontH = Math.round(lineH * 0.72);
      z += `^FO${padX},${y}^A0N,${fontH},${fontH}^FD${zplSafe(label)}: ${zplSafe(value)}^FS\n`;
      y += lineH;
    };
    if (opts.fields.ref && cell.ref) row('REF', cell.ref);
    if (opts.fields.taille && cell.taille) row('TAILLE', cell.taille);
    if (opts.fields.couleur && cell.couleur) row('COULEUR', cell.couleur);
    if (opts.fields.prix && cell.prix) row('PRIX', cell.prix);

    // Le code-barres colle au bas de l'étiquette, comme en HTML.
    const bcY = Math.max(y, h - barcodeH - mmToDots(4, dpi));
    const printLine = opts.fields.code ? 'Y' : 'N';
    z += `^FO${padX},${bcY}^BY2,2.5,${barcodeH}\n`;
    z += `^BEN,${barcodeH},${printLine},N\n`;
    z += `^FD${ean13Payload(cell.code)}^FS\n`;

    z += `^PQ${qty}\n^XZ\n`;
    out += z;
  }
  return out;
}

/** Petite étiquette de test — un texte, pas de code-barres — pour vérifier la
 *  connexion et le cadrage sans consommer une cellule réelle de la grille. */
export function buildZplTestLabel(widthMm: number, heightMm: number, dpi: number): string {
  const w = mmToDots(widthMm, dpi);
  const h = mmToDots(heightMm, dpi);
  const fontH = mmToDots(3, dpi);
  return (
    '^XA\n' +
    `^PW${w}\n^LL${h}\n^CI28\n` +
    `^FO${mmToDots(2, dpi)},${mmToDots(2, dpi)}^A0N,${fontH},${fontH}^FDTEST OK^FS\n` +
    `^FO${mmToDots(2, dpi)},${mmToDots(2, dpi) + fontH + mmToDots(1, dpi)}^A0N,${Math.round(fontH * 0.5)},${Math.round(fontH * 0.5)}^FD${widthMm}x${heightMm}mm - ${dpi}dpi^FS\n` +
    '^PQ1\n^XZ\n'
  );
}
