/**
 * Identité des données BERAMETHODE — brouillon local vs compte serveur.
 *
 * Aujourd’hui (SQLite + JWT) : toutes les tables métier côté serveur sont déjà
 * rattachées à `user_id` / `owner_id` ; l’email du compte sert d’identifiant
 * logique unique (normalisé côté auth).
 *
 * Objectif produit (à compléter progressivement) :
 * 1. **Sans email** (invité API indispo, `user.id === 0`) : données sensibles
 *    dans le navigateur étiquetées par `localDraftSessionId` (UUID stable) pour
 *    pouvoir plus tard les **fusionner** vers un compte email après login.
 * 2. **Avec email** : session serveur ; fusion / export admin déjà possibles côté API.
 * 3. **Hors ligne puis Wi‑Fi** : file de mutations + reprise (non implémentée ici ;
 *    ce module fournit les clés et hooks pour ne pas mélanger les brouillons).
 */

const LS_DRAFT = 'beramethode:localDraftSessionId';
const LS_PENDING_ATTACH = 'beramethode:pendingAttachDraftToEmail';

export type DataOwnerMode = 'none' | 'server' | 'local_draft';

export interface DataOwnerSnapshot {
  mode: DataOwnerMode;
  serverUserId: number | null;
  email: string | null;
  /** Présent uniquement en mode `local_draft` (invité sans cookie API). */
  localDraftSessionId: string | null;
}

function normalizeEmail(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').trim().toLowerCase();
  return s || null;
}

/** UUID stable par navigateur pour regrouper le « brouillon » sans compte. */
export function getOrCreateLocalDraftSessionId(): string {
  try {
    let id = localStorage.getItem(LS_DRAFT);
    if (id && /^[0-9a-f-]{36}$/i.test(id)) return id;
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(LS_DRAFT, id);
    return id;
  } catch {
    return `mem-${Date.now()}`;
  }
}

export function clearLocalDraftSessionId(): void {
  try {
    localStorage.removeItem(LS_DRAFT);
  } catch {
    /* ignore */
  }
}

/** Indique qu’un brouillon local a déjà été créé (ex. après « Continue as Guest » hors API). */
export function hasLocalDraftMarker(): boolean {
  try {
    return Boolean(localStorage.getItem(LS_DRAFT));
  } catch {
    return false;
  }
}

/** Après login / register réussi (id serveur > 0), on libère l’étiquette brouillon et la file d’attache. */
export function notifyServerSessionEstablished(serverUserId: number): void {
  if (serverUserId > 0) {
    clearLocalDraftSessionId();
    clearPendingDraftAttach();
  }
}

/**
 * Marque l’intention de rattacher le brouillon courant à un email après prochaine
 * connexion réussie (pour futur flux « merge » côté client ou serveur).
 */
export function markPendingDraftAttachToEmail(email: string): void {
  try {
    const norm = normalizeEmail(email);
    if (!norm) return;
    const draft = localStorage.getItem(LS_DRAFT) || getOrCreateLocalDraftSessionId();
    localStorage.setItem(LS_PENDING_ATTACH, JSON.stringify({ draftSessionId: draft, email: norm, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function getPendingDraftAttach(): { draftSessionId: string; email: string; at: number } | null {
  try {
    const raw = localStorage.getItem(LS_PENDING_ATTACH);
    if (!raw) return null;
    const o = JSON.parse(raw) as { draftSessionId?: string; email?: string; at?: number };
    if (!o.draftSessionId || !o.email) return null;
    return { draftSessionId: o.draftSessionId, email: o.email, at: o.at ?? 0 };
  } catch {
    return null;
  }
}

export function clearPendingDraftAttach(): void {
  try {
    localStorage.removeItem(LS_PENDING_ATTACH);
  } catch {
    /* ignore */
  }
}

/** Préfixe logique pour futurs `localStorage` / IndexedDB par propriétaire. */
export function namespacedStorageKey(baseKey: string, ctx: DataOwnerSnapshot): string {
  if (ctx.mode === 'local_draft' && ctx.localDraftSessionId) {
    return `${baseKey}::draft:${ctx.localDraftSessionId}`;
  }
  if (ctx.mode === 'server' && ctx.serverUserId != null && ctx.serverUserId > 0) {
    return `${baseKey}::user:${ctx.serverUserId}`;
  }
  return baseKey;
}

export function buildDataOwnerSnapshot(
  user: { id: number; email: string } | null,
  isGuestFlag: boolean,
): DataOwnerSnapshot {
  if (!user) {
    return { mode: 'none', serverUserId: null, email: null, localDraftSessionId: null };
  }
  if (user.id === 0 && isGuestFlag) {
    return {
      mode: 'local_draft',
      serverUserId: null,
      email: null,
      localDraftSessionId: getOrCreateLocalDraftSessionId(),
    };
  }
  return {
    mode: 'server',
    serverUserId: user.id,
    email: normalizeEmail(user.email),
    localDraftSessionId: null,
  };
}
