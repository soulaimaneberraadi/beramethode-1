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
 * Lecture avec repli de migration : clé scopée d'abord, puis clé de base
 * UNIQUEMENT si aucun compte n'est actif (migration d'anciennes données
 * mono-compte). Si un compte est actif, on NE lit JAMAIS la clé de base : elle
 * peut contenir des données partagées héritées d'une ancienne version → fuite
 * inter-comptes sur le même appareil.
 */
export function lsGetMig(key: string): string | null {
  const scoped = lsGet(key);
  if (scoped != null) return scoped;
  try {
    if (getCurrentEmail()) return null;
    return localStorage.getItem(key);
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
  return syncBases.some(base => key === base || key.startsWith(base + SEP));
}

export function getBaseKey(prefixedKey: string, syncBases: readonly string[]): string | null {
  for (const base of syncBases) {
    if (prefixedKey === base) return base;
    if (prefixedKey.startsWith(base + SEP)) return base;
  }
  return null;
}
