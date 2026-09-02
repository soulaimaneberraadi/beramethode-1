import db from './db';

/**
 * Registre des suppressions faites côté serveur.
 *
 * La synchronisation ne supprime jamais par différence : un élément absent
 * d'un côté est considéré comme « pas encore reçu », et l'union le réinstalle.
 * C'est ce qui protège le travail fait sur un autre poste — mais cela veut dire
 * qu'une suppression doit être enregistrée explicitement, sinon elle ne voyage
 * pas et l'élément ressuscite au prochain échange.
 *
 * Les `type` reprennent exactement ceux du navigateur (`STORES` d'apiShim et
 * `CLE_VERS_TYPE` de cloudSync) : « models », « planning », « suivi »… Les deux
 * registres se fusionnent alors sans traduction.
 */
export interface Tombstone {
  type: string;
  id: string;
  deleted_at: string;
}

export const recordTombstone = (type: string, id: string | number, ownerId: number | null): void => {
  if (!type || id == null) return;
  try {
    db.prepare(`
      INSERT INTO sync_tombstones (type, id, owner_id, deleted_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(type, id, owner_id) DO UPDATE SET deleted_at = excluded.deleted_at
    `).run(type, String(id), ownerId, new Date().toISOString());
  } catch (e) {
    // Une suppression qui n'a pas pu être enregistrée reste une suppression
    // locale valide : on ne fait pas échouer la requête de l'utilisateur.
    console.warn('[tombstones] enregistrement impossible:', (e as Error).message);
  }
};

/** Durée pendant laquelle une suppression reste opposable. Alignée sur cloudSync/apiShim. */
const TOMBSTONE_KEEP_MS = 365 * 24 * 60 * 60 * 1000;

export const listTombstones = (ownerId: number | null): Tombstone[] => {
  try {
    const limite = new Date(Date.now() - TOMBSTONE_KEEP_MS).toISOString();
    return db
      .prepare('SELECT type, id, deleted_at FROM sync_tombstones WHERE owner_id IS ? AND deleted_at > ?')
      .all(ownerId, limite) as Tombstone[];
  } catch {
    return [];
  }
};
