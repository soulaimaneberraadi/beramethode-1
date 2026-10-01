/**
 * STOCK PAR EMPLACEMENT (dépôts, boutiques) — calculs communs à l'écran.
 *
 * Le « Dépôt principal » n'est pas un emplacement en base : c'est l'ABSENCE
 * d'emplacement (`emplacement_id` vide sur le mouvement). Tout le stock
 * historique lui appartient donc déjà, et une entreprise qui ne crée jamais
 * d'emplacement a tous ses mouvements au principal — exactement comme avant.
 *
 * Trois façons de regarder le même stock, selon `FiltreEmplacement` :
 *   undefined → TOUS les emplacements (le total, le comportement historique)
 *   null      → le Dépôt principal seulement
 *   'emp-…'   → cet emplacement seulement
 */

export interface Emplacement {
  id: string;
  nom: string;
  type: 'DEPOT' | 'BOUTIQUE';
  actif: boolean;
  /** Pièces portées par ce lieu (calculé par le serveur). */
  pieces?: number;
  /** Mouvements qui le touchent : > 0 interdit de le supprimer. */
  nbMouvements?: number;
  /** Noms des boutiques en ligne servies par ce lieu (calculé par le serveur) :
   *  son stock est celui qui est publié sur la plateforme, donc il ne peut être
   *  ni désactivé ni supprimé tant qu'il sert une boutique. */
  boutiquesEnLigne?: string[];
}

export type FiltreEmplacement = undefined | null | string;

/** Valeur du sélecteur « Tous / Dépôt principal / lieux » de l'écran. */
export const CHOIX_TOUS = 'ALL';
export const CHOIX_PRINCIPAL = 'PRINCIPAL';

/** Traduit le choix du sélecteur en filtre de calcul. */
export const filtreDepuisChoix = (choix: string): FiltreEmplacement => {
  if (choix === CHOIX_TOUS) return undefined;
  if (choix === CHOIX_PRINCIPAL) return null;
  return choix;
};

/** Le mouvement appartient-il à ce filtre ? (`emplacement_id` vide = principal.) */
export const mouvementDans = (row: { emplacement_id?: string | null }, filtre: FiltreEmplacement): boolean => {
  if (filtre === undefined) return true;
  const eid = row.emplacement_id || null;
  return eid === filtre;
};

const cle = (couleur: unknown, taille: unknown) => `${String(couleur ?? '')}|${String(taille ?? '')}`;

/**
 * Stock disponible par modèle, cellule par cellule : entrées ACCEPTÉES moins
 * sorties, restreintes au filtre. Avec `undefined` c'est EXACTEMENT le calcul
 * historique de `stockMatrixByModel`.
 */
export const construireMatriceStock = (
  entrees: any[],
  sorties: any[],
  filtre: FiltreEmplacement,
): Map<string, Map<string, number>> => {
  const map = new Map<string, Map<string, number>>();
  entrees.forEach(en => {
    if (en.qualite !== 'ACCEPTED' || !en.modelId || !mouvementDans(en, filtre)) return;
    const m = map.get(en.modelId) || new Map<string, number>();
    const k = cle(en.couleur, en.taille);
    m.set(k, (m.get(k) || 0) + (Number(en.quantite) || 0));
    map.set(en.modelId, m);
  });
  sorties.forEach(so => {
    if (!so.modelId || !mouvementDans(so, filtre)) return;
    const m = map.get(so.modelId) || new Map<string, number>();
    const k = cle(so.couleur, so.taille);
    m.set(k, (m.get(k) || 0) - (Number(so.quantite) || 0));
    map.set(so.modelId, m);
  });
  return map;
};

/** Ce que l'écran doit savoir d'un modèle pour l'afficher à un emplacement. */
export interface StatModeleLieu {
  model: { id: string };
  producedQty: number;
  soldQty: number;
  exitedQty: number;
  invoicedQty: number;
  remainingStock: number;
  stockSource: 'DETAIL' | 'FALLBACK';
  sortiesCount: number;
}

/**
 * Les mêmes cartes de stock, recalculées pour UN emplacement (null = principal).
 *
 *   - « produit » devient ce qui est ENTRÉ net à ce lieu (réceptions, transferts
 *     reçus moins transferts partis, inventaires) ;
 *   - « sorti » = les sorties de CE lieu ;
 *   - « facturé » = les pièces sorties de ce lieu qui sont couvertes par une
 *     facture (`facture_id`) : les lignes de facture, elles, ne disent pas d'où
 *     la pièce est partie, donc on ne les réattribue pas à un lieu ;
 *   - « restant » = entré − sorti, jamais négatif à l'affichage.
 *
 * Un modèle SANS détail couleur × taille (`FALLBACK`) vit sur des compteurs de
 * commande qui ne disent rien de l'endroit : on les garde tels quels au
 * principal et on affiche zéro ailleurs, plutôt que d'inventer une répartition.
 */
export const statsAuLieu = <T extends StatModeleLieu>(
  stats: T[],
  entrees: any[],
  sorties: any[],
  emplacementId: string | null,
): T[] => {
  const parModele = new Map<string, { entre: number; sorti: number; facture: number; lots: Set<string> }>();
  const agg = (id: string) => {
    let a = parModele.get(id);
    if (!a) { a = { entre: 0, sorti: 0, facture: 0, lots: new Set<string>() }; parModele.set(id, a); }
    return a;
  };
  entrees.forEach(en => {
    if (en.qualite !== 'ACCEPTED' || !en.modelId || !mouvementDans(en, emplacementId)) return;
    agg(String(en.modelId)).entre += Number(en.quantite) || 0;
  });
  sorties.forEach(so => {
    if (!so.modelId || !mouvementDans(so, emplacementId)) return;
    const a = agg(String(so.modelId));
    const q = Number(so.quantite) || 0;
    a.sorti += q;
    if (so.facture_id) a.facture += q;
    a.lots.add(String(so.batch_id || so.id));
  });

  return stats.map(it => {
    if (it.stockSource === 'FALLBACK') {
      if (emplacementId === null) return it;
      return { ...it, producedQty: 0, soldQty: 0, exitedQty: 0, invoicedQty: 0, remainingStock: 0, sortiesCount: 0 };
    }
    const a = parModele.get(String(it.model.id));
    const entre = a?.entre ?? 0;
    const sorti = a?.sorti ?? 0;
    return {
      ...it,
      producedQty: entre,
      soldQty: sorti,
      exitedQty: sorti,
      invoicedQty: a?.facture ?? 0,
      remainingStock: Math.max(0, entre - sorti),
      sortiesCount: a?.lots.size ?? 0,
    };
  });
};

// ── Emplacement de CETTE caisse (préférence du poste) ────────────────────────
// Un poste de caisse est physiquement dans UNE boutique : ce choix vaut pour
// l'appareil, pas pour le compte — deux caisses du même compte n'ont pas le
// même lieu. D'où le stockage local (et non les réglages de l'entreprise).
const CLE_EMPLACEMENT_CAISSE = 'bera_caisse_emplacement';

/** L'emplacement enregistré pour cette caisse (null = Dépôt principal). */
export const lireEmplacementCaisse = (): string | null => {
  try {
    return localStorage.getItem(CLE_EMPLACEMENT_CAISSE) || null;
  } catch {
    return null; // stockage refusé : le principal, donc le comportement d'avant
  }
};

export const ecrireEmplacementCaisse = (id: string | null): void => {
  try {
    if (id) localStorage.setItem(CLE_EMPLACEMENT_CAISSE, id);
    else localStorage.removeItem(CLE_EMPLACEMENT_CAISSE);
  } catch { /* le choix vaut alors pour cette session seulement */ }
};
