const SEP = '__';
const LAST_USER_KEY = 'beramethode_last_sync_user';

export function getCurrentEmail(): string | null {
  try { return localStorage.getItem(LAST_USER_KEY); } catch { return null; }
}

export function pkey(base: string, emailOverride?: string): string {
  const email = emailOverride ?? getCurrentEmail();
  if (!email) return base;
  return `${base}${SEP}${email}`;
}

export function lsGet(key: string): string | null {
  return localStorage.getItem(pkey(key));
}

/**
 * Lecture avec MIGRATION des anciennes données non-scopées.
 *
 * - Clé scopée présente → on la retourne.
 * - Sinon, s'il existe une donnée sur la clé de BASE (héritée d'avant
 *   l'isolation par compte) :
 *     • si un compte est actif → on MIGRE cette donnée vers la clé scopée du
 *       compte courant PUIS on efface la clé de base. Ainsi on ne PERD PAS les
 *       données pré-isolation (récupération), et comme la base est effacée juste
 *       après, elle ne peut plus fuiter vers un autre compte ensuite.
 *     • si aucun compte actif → on retourne simplement la base (lecture legacy).
 *
 * La migration est idempotente : une fois faite, `lsGet` renvoie la clé scopée
 * et on ne repasse plus par la base.
 */
export function lsGetMig(key: string): string | null {
  const scoped = lsGet(key);
  if (scoped != null) return scoped;
  try {
    const base = localStorage.getItem(key);
    if (base == null) return null;
    // Compte actif : recopier base → scopé (pour que cloudSync le pousse), MAIS
    // GARDER la clé de base comme filet de sécurité. Ne jamais l'effacer ici :
    // si la clé scopée est vidée par une course de synchro, la base permet de
    // récupérer les données. La base est purgée uniquement au changement de
    // compte (clearLocalAppData), ce qui évite la fuite inter-comptes.
    if (getCurrentEmail()) {
      try { lsSet(key, base); } catch { /* ignore */ }
    }
    return base;
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: string): void {
  localStorage.setItem(pkey(key), value);
}

export function lsRemove(key: string): void {
  localStorage.removeItem(pkey(key));
}

export function isSyncKey(key: string, syncBases: readonly string[]): boolean {
  return syncBases.some(base => key === base || key.startsWith(base + SEP)) || getBaseKey(key, syncBases) !== null;
}

export function getBaseKey(prefixedKey: string, syncBases: readonly string[]): string | null {
  for (const base of syncBases) {
    if (prefixedKey === base) return base;
    if (prefixedKey.startsWith(base + SEP)) return base;
  }
  return null;
}
