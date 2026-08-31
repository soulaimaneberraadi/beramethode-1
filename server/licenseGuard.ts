import { etatLicence } from './licenseState';

/**
 * Enforcement « mode lecture seule » côté serveur (miroir exact de
 * licenseClient.isReadOnly). Retourne TRUE si les écritures sont autorisées.
 *
 * Fail-open volontaire — on n'interdit JAMAIS les écritures sauf preuve
 * formelle d'une licence expirée/suspendue ET enforcement actif :
 *  - VITE_LICENSE_ENFORCE !== 'true'        → writable (dormant par défaut)
 *  - aucune licence enregistrée (app_settings) → writable
 *  - source === 'none' (pas encore activée) → writable
 *  - erreur de lecture/parse                → writable
 *
 * Read-only seulement si : enforcement ON ET licence présente ET
 * (expired === true OU status ∈ {suspended, revoked}).
 */
export const isLicenseWritable = (ownerId: number | undefined | null): boolean =>
  etatLicence(ownerId).inscriptible;

/**
 * Le programme est-il totalement fermé ? (fin d'abonnement ET délai de grâce
 * épuisé, ou licence suspendue/révoquée)
 *
 * Distinct de la lecture seule : en grâce l'entreprise consulte encore tout
 * son travail. Une fois verrouillée, elle ne voit plus que l'écran de
 * réactivation — et le bouton d'export, qui n'est jamais retiré.
 */
export const isLicenseLocked = (ownerId: number | undefined | null): boolean =>
  etatLicence(ownerId).verrouille;

/**
 * Chemins qui restent ouverts même programme verrouillé.
 *
 * L'export en fait partie, et ce n'est pas une faiblesse : ce programme
 * contient la paie et la comptabilité. Une entreprise en retard de paiement
 * qui reçoit un contrôle doit pouvoir sortir ses registres. Couper l'outil met
 * la pression ; retenir les données en otage n'ajoute qu'un risque.
 */
export const isLockedExemptPath = (path: string): boolean =>
  isReadOnlyExemptPath(path) ||
  /^\/api\/(permissions\/me|permissions\/company|admin\/export-all-data|workspaces\/[^/]+\/export|devices)\b/.test(path);

/** Préfixes de chemins exemptés du mode lecture seule (récupération licence,
 *  auth, onboarding, contrôle MASTER) — sinon impossible de ré-activer. */
export const isReadOnlyExemptPath = (path: string): boolean =>
  /^\/api\/(settings|license|auth|setup|master)\b/.test(path);
