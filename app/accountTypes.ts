// Types de compte choisis à l'onboarding (Setup wizard, étape 2).
// Chaque type adapte les modules visibles via la même mécanique `hidden`
// que la licence et les permissions (fusionnés dans App.tsx).

export type AccountType = 'societe' | 'client' | 'personnel';

export const ACCOUNT_TYPES: AccountType[] = ['societe', 'client', 'personnel'];

/** Valeur par défaut (compat ascendante : installs existantes = société complète). */
export const DEFAULT_ACCOUNT_TYPE: AccountType = 'societe';

export function normalizeAccountType(v: unknown): AccountType {
  return v === 'client' || v === 'personnel' ? v : DEFAULT_ACCOUNT_TYPE;
}

/**
 * Modules MASQUÉS pour chaque type de compte.
 * Les clés correspondent à `defaultNavOrder` (app/constants.ts).
 * - societe   : rien de masqué (ERP complet).
 * - client    : suivi des commandes uniquement (catalogue, stock, planning,
 *               sous-traitance, facturation). Sans suivi production ni RH.
 * - personnel : méthodes & chrono uniquement (étude modèle, temps,
 *               équilibrage, rendement). Sans RH ni logistique.
 */
export const ACCOUNT_TYPE_HIDDEN: Record<AccountType, string[]> = {
  societe: [],
  client: [
    'catalogTemps', 'effectifs', 'suivi', 'coupe', 'rendement',
    'pageMachine', 'machin', 'gestionRh', 'objectifs', 'atelierProd', 'atelier',
  ],
  personnel: [
    'coupe', 'gestionRh', 'planning', 'suivi', 'magasin', 'export',
    'facturation', 'pageMachine', 'sousTraitance', 'objectifs', 'atelierProd', 'atelier',
  ],
};
