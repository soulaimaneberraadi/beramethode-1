import type { ModelData } from '../types';

/**
 * Prix de revient d'un modèle — SOURCE UNIQUE.
 *
 * Cette formule vivait dans `components/SousTraitance.tsx`. Elle est déplacée
 * ici SANS LA MOINDRE MODIFICATION : le garde-fou « vente à perte » doit être
 * appliqué à l'identique par l'écran ET par le serveur, et deux copies d'une
 * formule financière finissent toujours par diverger — le jour où elles
 * divergent, l'un des deux refuse une vente légitime ou en laisse passer une à
 * perte, sans que rien ne le signale.
 *
 * ⚠️ Toute évolution de cette formule doit rester alignée avec
 * `CostCalculator.tsx` (~l.380) et `CompactCostSheet.tsx`, qui affichent le même
 * prix de revient à l'utilisateur.
 */

/** Base de répartition des frais additionnels d'un modèle : la grille couleur ×
 *  taille si elle est remplie, sinon la quantité de la commande de sous-traitance
 *  liée, sinon la quantité du modèle. Même ordre de priorité que `commandeQty`
 *  dans CostCalculator.tsx — les deux doivent donner le même prix de revient. */
export const modelCommandeQty = (fiche: any): number => {
  const gq = fiche?.gridQuantities || {};
  const total = Object.values(gq).reduce<number>((acc, v: any) => acc + (Number(v) || 0), 0);
  if (total > 0) return total;
  return Number(fiche?.soustraitance?.orderQty) || Number(fiche?.quantity) || 0;
};

/** Prix de revient d'un modèle — MÊME formule que CostCalculator.tsx (~l.380) et
 *  CompactCostSheet.tsx : coût = matières + main d'œuvre + frais additionnels, la
 *  main d'œuvre étant le prix du sous-traitant quand `ficheData.soustraitance` est
 *  active, sinon temps total (base + coupe + emballage) × coût minute.
 *  Retourne `null` dès qu'aucune donnée fiable n'existe : on n'invente pas un prix. */
export const computeModelCostPrice = (model: ModelData, settings: any): number | null => {
  const fiche: any = model.ficheData || {};
  const st = fiche.soustraitance;
  const stActive = !!st?.active;
  const stPrix = Number(st?.prix) || 0;
  const stComplet = stActive && st?.mode === 'complet';
  // Matières exclues du coût en Export OU en sous-traitance « tout compris ».
  const materialsExcluded = fiche.typeMarche === 'Export' || stComplet;
  const materials: any[] = fiche.materials || [];
  const totalMaterials = materialsExcluded
    ? 0
    : materials.reduce((acc: number, m: any) => acc + (Number(m?.unitPrice) || 0) * (Number(m?.qty) || 0), 0);

  let laborCost: number;
  if (stActive) {
    if (stPrix <= 0) return null;
    laborCost = stPrix;
  } else {
    const baseTime = Number(model.meta_data?.total_temps) || 0;
    const costMinute = Number(settings?.costMinute) || 0;
    if (baseTime <= 0 || costMinute <= 0) return null;
    const cutRate = Number(settings?.cutRate) || 0;
    const packRate = Number(settings?.packRate) || 0;
    laborCost = baseTime * (1 + cutRate / 100 + packRate / 100) * costMinute;
  }

  // Frais additionnels de la commande, répartis sur la quantité commandée. Comme
  // dans CostCalculator, c'est la MOYENNE qui entre dans le prix de revient : elle
  // seule, multipliée par la quantité, redonne exactement la dépense engagée.
  const qty = modelCommandeQty(fiche);
  const fraisTotal = (st?.frais || []).reduce((acc: number, f: any) => acc + (Number(f?.amount) || 0), 0);
  const fraisPerPiece = qty > 0 ? fraisTotal / qty : 0;

  const cost = totalMaterials + laborCost + fraisPerPiece;
  return cost > 0 ? cost : null;
};

// ════════════════════════════════════════════════════════════════════════════
// GARDE-FOU « VENTE À PERTE » — vocabulaire partagé écran ↔ serveur
// ════════════════════════════════════════════════════════════════════════════

/**
 * Préfixe apposé au motif d'une vente sous le prix plancher, dans la colonne
 * `note` de `st_stock_sorties`. Il sert à DEUX choses :
 *   1. retrouver plus tard toutes les ventes dérogatoires (`note LIKE 'VENTE_SOUS_COUT:%'`),
 *      ce qu'un motif noyé dans du texte libre ne permettrait pas ;
 *   2. donner au serveur un moyen de vérifier qu'un motif a bien été saisi
 *      avant d'accepter la sortie en politique 'CONFIRM'.
 */
export const SOUS_COUT_NOTE_PREFIX = 'VENTE_SOUS_COUT:';

/** Prix plancher = prix de revient majoré de la marge minimale exigée.
 *  `null` quand le coût est inconnu : dans ce cas AUCUN garde-fou ne s'applique,
 *  et l'écran doit le dire — laisser croire à un contrôle qui n'a pas eu lieu
 *  serait pire que pas de contrôle du tout. */
export const prixPlancher = (coutRevient: number | null, margeMinimale: number): number | null => {
  if (coutRevient == null || !(coutRevient > 0)) return null;
  const marge = Number.isFinite(margeMinimale) ? Math.max(0, margeMinimale) : 0;
  return coutRevient * (1 + marge / 100);
};

/** Un prix nul ou négatif n'est pas une vente à perte : c'est un don, un
 *  échantillon ou une régularisation. `prixController` les exclut déjà de toutes
 *  les moyennes ; le garde-fou les ignore pour la même raison. */
export const estSousPlancher = (prix: number, plancher: number | null): boolean =>
  plancher != null && prix > 0 && prix < plancher;
