/** Traduction de la grille couleur × taille entre une commande de sous-traitance
 *  et la fiche de coût du modèle.
 *
 *  Les deux côtés stockent la MÊME information dans deux formats différents :
 *   - commande : `grid_json` = Record<nom couleur, Record<nom taille, qté>>
 *   - modèle   : `gridQuantities` = Record<`${colorId}_${sizeIndex}`, qté>
 *                avec `colors: {id,name}[]` et `sizes: string[]`
 *
 *  Un simple copier-coller est donc impossible : il faut apparier les NOMS.
 *  L'appariement est tolérant (casse, espaces, accents) mais ne devine rien :
 *  ce qui ne s'apparie pas est signalé, jamais supprimé ni inventé. */

export type OrderGrid = Record<string, Record<string, number>>;
export type ModelColor = { id: string; name: string };

/** Normalise un libellé de couleur/taille pour l'appariement : minuscules, sans
 *  accents, sans espaces superflus. « Bleu Marine » et « bleu  marine » sont la
 *  même couleur ; on ne va pas plus loin (pas de synonymes devinés). */
export const normalizeLabel = (label: string): string =>
  String(label ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export type GridConversion = {
  /** Grille au format modèle, prête à écrire dans `ficheData.gridQuantities`. */
  gridQuantities: Record<string, number>;
  /** Couleurs de la commande absentes du modèle (quantités NON reportées). */
  unmatchedColors: string[];
  /** Tailles de la commande absentes du modèle (quantités NON reportées). */
  unmatchedSizes: string[];
  /** Total effectivement reporté. */
  matchedTotal: number;
  /** Total présent dans la commande, apparié ou non. */
  orderTotal: number;
};

/** Commande → Modèle. Ne produit QUE les cellules appariées : une couleur ou une
 *  taille inconnue du modèle remonte dans `unmatched*` pour que l'appelant
 *  décide (l'écart entre `matchedTotal` et `orderTotal` le chiffre). */
export const orderGridToModel = (
  grid: OrderGrid | null | undefined,
  colors: ModelColor[],
  sizes: string[],
): GridConversion => {
  const result: GridConversion = {
    gridQuantities: {},
    unmatchedColors: [],
    unmatchedSizes: [],
    matchedTotal: 0,
    orderTotal: 0,
  };
  if (!grid || typeof grid !== 'object') return result;

  const colorByName = new Map(colors.map(c => [normalizeLabel(c.name), c.id]));
  const sizeIndexByName = new Map(sizes.map((s, i) => [normalizeLabel(s), i]));
  const unmatchedColors = new Set<string>();
  const unmatchedSizes = new Set<string>();

  Object.entries(grid).forEach(([colorName, sizesObj]) => {
    if (!sizesObj || typeof sizesObj !== 'object') return;
    const colorId = colorByName.get(normalizeLabel(colorName));

    Object.entries(sizesObj).forEach(([sizeName, rawQty]) => {
      const qty = Number(rawQty) || 0;
      if (qty <= 0) return;
      result.orderTotal += qty;

      const sizeIndex = sizeIndexByName.get(normalizeLabel(sizeName));
      if (colorId === undefined) unmatchedColors.add(colorName);
      if (sizeIndex === undefined) unmatchedSizes.add(sizeName);
      if (colorId === undefined || sizeIndex === undefined) return;

      const key = `${colorId}_${sizeIndex}`;
      result.gridQuantities[key] = (result.gridQuantities[key] || 0) + qty;
      result.matchedTotal += qty;
    });
  });

  result.unmatchedColors = [...unmatchedColors];
  result.unmatchedSizes = [...unmatchedSizes];
  return result;
};

/** Modèle → Commande (format `grid_json`). Utile pour pré-remplir une commande
 *  depuis la grille déjà saisie dans la fiche de coût. */
export const modelGridToOrder = (
  gridQuantities: Record<string, number> | null | undefined,
  colors: ModelColor[],
  sizes: string[],
): OrderGrid => {
  const grid: OrderGrid = {};
  if (!gridQuantities) return grid;

  colors.forEach(color => {
    sizes.forEach((size, index) => {
      const qty = Number(gridQuantities[`${color.id}_${index}`]) || 0;
      if (qty <= 0) return;
      if (!grid[color.name]) grid[color.name] = {};
      grid[color.name][size] = (grid[color.name][size] || 0) + qty;
    });
  });
  return grid;
};

/** Somme d'une grille au format modèle. */
export const sumModelGrid = (gridQuantities: Record<string, number> | null | undefined): number =>
  Object.values(gridQuantities || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);

/** Somme d'une grille au format commande. */
export const sumOrderGrid = (grid: OrderGrid | null | undefined): number =>
  Object.values(grid || {}).reduce(
    (acc, sizesObj) =>
      acc + Object.values(sizesObj || {}).reduce((a, v) => a + (Number(v) || 0), 0),
    0,
  );

export type GridDiff = {
  /** Vrai si la grille du modèle diffère de celle de la commande (cellule à
   *  cellule, pas seulement en total). */
  differs: boolean;
  orderTotal: number;
  modelTotal: number;
  /** modelTotal - orderTotal : négatif = le modèle facture moins de pièces que
   *  ce qui est réellement commandé (sous-évaluation du prix de revient). */
  delta: number;
  unmatchedColors: string[];
  unmatchedSizes: string[];
  /** Grille au format modèle correspondant à la commande — à écrire tel quel si
   *  l'utilisateur confirme l'alignement. */
  proposed: Record<string, number>;
};

/** Compare la grille d'une commande à celle du modèle. Aucune écriture : c'est
 *  la base de l'alerte affichée à l'utilisateur, qui seul décide d'aligner. */
export const diffOrderVsModelGrid = (
  orderGrid: OrderGrid | null | undefined,
  modelGridQuantities: Record<string, number> | null | undefined,
  colors: ModelColor[],
  sizes: string[],
): GridDiff => {
  const conv = orderGridToModel(orderGrid, colors, sizes);
  const current = modelGridQuantities || {};
  const modelTotal = sumModelGrid(current);

  const keys = new Set([...Object.keys(conv.gridQuantities), ...Object.keys(current)]);
  let differs = false;
  keys.forEach(k => {
    if ((Number(conv.gridQuantities[k]) || 0) !== (Number(current[k]) || 0)) differs = true;
  });

  return {
    differs: differs || conv.unmatchedColors.length > 0 || conv.unmatchedSizes.length > 0,
    orderTotal: conv.orderTotal,
    modelTotal,
    delta: modelTotal - conv.orderTotal,
    unmatchedColors: conv.unmatchedColors,
    unmatchedSizes: conv.unmatchedSizes,
    proposed: conv.gridQuantities,
  };
};
