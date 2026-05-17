/**
 * Système de versioning des données pour migrations propres entre versions de l'app.
 * Chaque user_data contient une `schema_version`. Les migrations s'appliquent
 * automatiquement au chargement si la version locale < version cible.
 *
 * Quand tu changes le format des données: incrémente SCHEMA_VERSION et ajoute
 * une migration dans MIGRATIONS.
 */

export const SCHEMA_VERSION = 1;
export const APP_VERSION = 'v1.0.0';

export type MigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, MigrationFn> = {
  // Exemple pour future migration:
  // 2: (data) => { data.beramethode_new_key = data.beramethode_old_key; delete data.beramethode_old_key; return data; },
};

export const migrateSnapshot = (snapshot: Record<string, unknown>, fromVersion: number): Record<string, unknown> => {
  let v = fromVersion;
  let out = snapshot;
  while (v < SCHEMA_VERSION) {
    const next = v + 1;
    const fn = MIGRATIONS[next];
    if (fn) {
      try {
        out = fn(out);
        console.log(`[migration] v${v} → v${next} appliquée`);
      } catch (e) {
        console.warn(`[migration] v${v} → v${next} échec:`, e);
      }
    }
    v = next;
  }
  return out;
};
