import db from './db';

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
export const isLicenseWritable = (ownerId: number | undefined | null): boolean => {
  if (process.env.VITE_LICENSE_ENFORCE !== 'true') return true;
  if (ownerId == null) return true;
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE owner_id = ? AND key = 'bera_license'")
      .get(ownerId) as { value: string } | undefined;
    if (!row?.value) return true;
    const lic = JSON.parse(row.value) as {
      source?: string; expired?: boolean; status?: string;
    };
    if (!lic || lic.source === 'none') return true;
    const readOnly = lic.expired === true || lic.status === 'suspended' || lic.status === 'revoked';
    return !readOnly;
  } catch {
    return true; // fail-open
  }
};

/** Préfixes de chemins exemptés du mode lecture seule (récupération licence,
 *  auth, onboarding, contrôle MASTER) — sinon impossible de ré-activer. */
export const isReadOnlyExemptPath = (path: string): boolean =>
  /^\/api\/(settings|license|auth|setup|master)\b/.test(path);
