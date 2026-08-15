import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import db from './db';
import { logAudit } from './auditLogger';

/** Maximum de sociétés (workspaces) gérables par un même compte humain. */
export const MAX_WORKSPACES_PER_ACCOUNT = 2;

/** Taille max acceptée pour un `importData` (JSON stringifié), en octets. */
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/**
 * Multi-workspace : un compte humain peut gérer plusieurs sociétés isolées.
 * Un workspace = un `owner_id` (clé de cloisonnement déjà appliquée par tous les
 * controllers). Chaque workspace est ancré par une ligne `users` non-connectable
 * (is_workspace_anchor=1, mot de passe aléatoire) ; le compte humain y adhère via
 * `company_members`. Le workspace actif est `users.active_owner_id`.
 */

const uid = (req: Request) => (req as any).user?.id as number;

interface WorkspaceRow {
  owner_id: number;
  account_user_id: number;
  name: string;
  logo: string | null;
  specialty: string | null;
}

/**
 * Garantit que le workspace « primaire » du compte (owner_id === userId) existe
 * en base (ligne workspaces + rôle patron + adhésion). Indispensable pour qu'un
 * utilisateur solo historique puisse REVENIR sur ses données d'origine après
 * avoir basculé sur un autre workspace. Idempotent.
 */
/** Un nœud d'appartenance : soit racine (colonne owner_id), soit rattaché à un parent via une FK. */
type WorkspaceTableVia = 'owner' | { parent: string; fk: string; parentKey: string };
interface WorkspaceTableNode {
  table: string;
  via: WorkspaceTableVia;
}

const PRAGMA_TABLE_INFO_CACHE = new Map<string, { name: string; type: string; pk: number }[]>();
function pragmaTableInfo(table: string): { name: string; type: string; pk: number }[] {
  if (!PRAGMA_TABLE_INFO_CACHE.has(table)) {
    try {
      PRAGMA_TABLE_INFO_CACHE.set(table, db.prepare(`PRAGMA table_info("${table}")`).all() as any);
    } catch {
      PRAGMA_TABLE_INFO_CACHE.set(table, []);
    }
  }
  return PRAGMA_TABLE_INFO_CACHE.get(table)!;
}

const PRAGMA_FK_CACHE = new Map<string, { table: string; from: string; to: string }[]>();
function pragmaForeignKeyList(table: string): { table: string; from: string; to: string }[] {
  if (!PRAGMA_FK_CACHE.has(table)) {
    try {
      PRAGMA_FK_CACHE.set(table, db.prepare(`PRAGMA foreign_key_list("${table}")`).all() as any);
    } catch {
      PRAGMA_FK_CACHE.set(table, []);
    }
  }
  return PRAGMA_FK_CACHE.get(table)!;
}

/**
 * Fermeture transitive du cloisonnement par société. AUCUNE liste en dur : le
 * schéma évolue sans arrêt (nouvelles tables métier) et une table oubliée ici =
 * fuite de données entre sociétés (export incomplet, DELETE incomplet, ou pire,
 * import qui rattache un enfant au mauvais parent).
 *
 * Racines : toute table portant une colonne `owner_id` (hors `workspaces`/`users`).
 * Puis, par point fixe : toute table possédant une clé étrangère (PRAGMA
 * foreign_key_list) vers une table déjà retenue rejoint la fermeture, rattachée
 * à CE parent précis (une table déjà retenue n'est jamais retraitée -> pas de
 * cycle possible). Le résultat est déjà en ordre topologique (racines d'abord)
 * puisqu'un enfant n'est ajouté qu'après que son parent soit dans `included`.
 */
function workspaceTables(): WorkspaceTableNode[] {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'`)
    .all() as { name: string }[];

  const result: WorkspaceTableNode[] = [];
  const included = new Set<string>();

  for (const t of tables) {
    if (t.name === 'workspaces' || t.name === 'users') continue;
    if (pragmaTableInfo(t.name).some((c) => c.name === 'owner_id')) {
      result.push({ table: t.name, via: 'owner' });
      included.add(t.name);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tables) {
      if (t.name === 'workspaces' || t.name === 'users') continue;
      if (included.has(t.name)) continue; // déjà retenue -> jamais retraitée (anti-cycle)
      for (const fk of pragmaForeignKeyList(t.name)) {
        if (fk.table === t.name) continue; // auto-référence -> ignorée
        if (included.has(fk.table)) {
          result.push({ table: t.name, via: { parent: fk.table, fk: fk.from, parentKey: fk.to } });
          included.add(t.name);
          changed = true;
          break;
        }
      }
    }
  }

  return result;
}

/** Sous-ensemble des tables racines (colonne owner_id directe), pour les opérations qui n'en ont besoin que là. */
function rootOwnerTables(): string[] {
  return workspaceTables()
    .filter((n) => n.via === 'owner')
    .map((n) => n.table);
}

/**
 * Un compte est « patron » d'un workspace si :
 *  - c'est son workspace primaire historique (owner_id === userId), ou
 *  - il est membre actif de ce workspace via un rôle système (Patron), ou
 *  - son rôle plateforme global est 'admin' ET il est membre actif de ce workspace.
 */
function isPatronOfWorkspace(userId: number, ownerId: number): boolean {
  if (ownerId === userId) return true;

  const patronRole = db
    .prepare(
      `SELECT 1 FROM company_members m
       JOIN company_roles r ON r.id = m.role_id
       WHERE m.owner_id = ? AND m.user_id = ? AND m.status = 'active' AND r.is_system = 1`
    )
    .get(ownerId, userId);
  if (patronRole) return true;

  const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role?: string } | undefined;
  if (userRow?.role === 'admin') {
    const member = db
      .prepare(`SELECT 1 FROM company_members WHERE owner_id = ? AND user_id = ? AND status = 'active'`)
      .get(ownerId, userId);
    if (member) return true;
  }
  return false;
}

/** Colonnes jamais exposées dans un export (secrets). */
const SENSITIVE_COLUMN = /password|token|secret/i;

/**
 * Tables d'échafaudage RBAC : elles portent bien `owner_id` (donc apparaissent
 * dans l'export, ce qui est correct — c'est un filet de sécurité complet) mais
 * ne doivent JAMAIS être réinjectées à l'import. `createWorkspace` provisionne
 * déjà un rôle Patron + une adhésion propres pour le NOUVEAU workspace ; réimporter
 * les lignes de la société d'origine lierait de vrais comptes utilisateurs
 * (potentiellement étrangers au nouveau propriétaire) à la nouvelle société.
 */
const RBAC_SCAFFOLDING_TABLES = new Set([
  'company_roles',
  'company_members',
  'role_permissions',
  'member_permission_overrides',
]);

function ensurePrimaryWorkspace(userId: number): void {
  const existing = db.prepare('SELECT owner_id FROM workspaces WHERE owner_id = ?').get(userId);
  if (existing) return;

  // Le workspace primaire n'est provisionné que pour un compte qui n'en a AUCUN.
  // Sinon, supprimer sa société d'origine la ferait ressusciter (vide) à la
  // première lecture, et elle continuerait à consommer le quota.
  const anyWorkspace = db
    .prepare(
      `SELECT 1 FROM workspaces w
       LEFT JOIN company_members m ON m.owner_id = w.owner_id AND m.user_id = ? AND m.status = 'active'
       WHERE w.account_user_id = ? OR m.user_id IS NOT NULL
       LIMIT 1`
    )
    .get(userId, userId);
  if (anyWorkspace) return;

  const company = db.prepare('SELECT name, logo, specialty, account_type FROM company_settings WHERE id = 1').get() as {
    name?: string;
    logo?: string | null;
    specialty?: string | null;
    account_type?: string;
  } | undefined;

  const primaryName = company?.name || 'Workspace 1';
  const primaryLogo = company?.logo || null;
  const primarySpecialty = company?.specialty || null;
  const primaryAccountType = company?.account_type || 'societe';

  db.transaction(() => {
    const patronRoleId = `role-patron-${userId}`;
    db.prepare(
      `INSERT OR IGNORE INTO company_roles (id, owner_id, name, level, parent_role_id, is_system)
       VALUES (?, ?, 'Patron', 0, NULL, 1)`
    ).run(patronRoleId, userId);
    db.prepare(
      `INSERT OR IGNORE INTO company_members (id, owner_id, user_id, role_id, status)
       VALUES (?, ?, ?, ?, 'active')`
    ).run(`member-${userId}`, userId, userId, patronRoleId);
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (owner_id, account_user_id, name, logo, specialty, account_type) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, userId, primaryName, primaryLogo, primarySpecialty, primaryAccountType);
  })();
}

/** GET /api/workspaces — liste des workspaces gérés par le compte + workspace actif. */
export const listWorkspaces = (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    ensurePrimaryWorkspace(userId);

    const rows = db
      .prepare(
        `SELECT w.owner_id, w.account_user_id, w.name, w.logo, w.specialty
         FROM workspaces w
         JOIN company_members m ON m.owner_id = w.owner_id AND m.user_id = ? AND m.status = 'active'
         ORDER BY w.created_at ASC`
      )
      .all(userId) as WorkspaceRow[];

    const activeOwnerId =
      (db.prepare('SELECT active_owner_id FROM users WHERE id = ?').get(userId) as { active_owner_id?: number } | undefined)
        ?.active_owner_id ?? (rows[0]?.owner_id ?? userId);

    const ownedCount = (
      db.prepare('SELECT COUNT(*) AS n FROM workspaces WHERE account_user_id = ?').get(userId) as { n: number }
    ).n;

    res.json({
      ok: true,
      activeOwnerId,
      max: MAX_WORKSPACES_PER_ACCOUNT,
      canCreate: ownedCount < MAX_WORKSPACES_PER_ACCOUNT,
      workspaces: rows.map((w) => ({
        ownerId: w.owner_id,
        name: w.name,
        logo: w.logo,
        specialty: w.specialty,
        isActive: w.owner_id === activeOwnerId,
      })),
    });
  } catch (e) {
    console.error('listWorkspaces error:', e);
    res.status(500).json({ ok: false, error: 'list failed' });
  }
};

/** POST /api/workspaces — crée une nouvelle société isolée et bascule dessus. */
export const createWorkspace = async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ ok: false, error: 'corps de requête invalide' });
    }
    const { name, specialty, logo, accountType, importData } = req.body as {
      name?: unknown;
      specialty?: unknown;
      logo?: unknown;
      accountType?: unknown;
      importData?: unknown;
    };
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'name requis' });
    }

    // Protège contre un payload d'import démesuré avant même de le manipuler.
    if (importData !== undefined) {
      if (typeof importData !== 'object' || importData === null || Array.isArray(importData)) {
        return res.status(400).json({ ok: false, error: 'importData invalide' });
      }
      const size = Buffer.byteLength(JSON.stringify(importData), 'utf8');
      if (size > MAX_IMPORT_BYTES) {
        return res.status(413).json({ ok: false, code: 'IMPORT_TOO_LARGE', maxBytes: MAX_IMPORT_BYTES });
      }
      const importVersion = (importData as any).version;
      if (importVersion !== undefined && importVersion !== 1 && importVersion !== 2) {
        return res.status(400).json({ ok: false, code: 'UNSUPPORTED_EXPORT_VERSION', received: importVersion });
      }
    }

    const wsName = name.trim();
    const specialtyValue = typeof specialty === 'string' && specialty.trim() ? specialty.trim() : null;
    const logoValue = typeof logo === 'string' && logo.startsWith('data:image/') ? logo : null;
    const accountTypeValue = accountType === 'client' || accountType === 'personnel' ? accountType : 'societe';

    // Le primaire doit exister pour pouvoir y revenir après basculement.
    ensurePrimaryWorkspace(userId);

    // Limite produit : 2 sociétés max par compte humain.
    const ownedCount = (
      db.prepare('SELECT COUNT(*) AS n FROM workspaces WHERE account_user_id = ?').get(userId) as { n: number }
    ).n;
    if (ownedCount >= MAX_WORKSPACES_PER_ACCOUNT) {
      return res.status(403).json({ ok: false, code: 'WORKSPACE_LIMIT', max: MAX_WORKSPACES_PER_ACCOUNT });
    }

    // Mot de passe verrouillé : l'ancre ne doit jamais pouvoir se connecter.
    const lockedHash = await bcrypt.hash(randomUUID() + randomUUID(), 10);
    const anchorEmail = `ws-${randomUUID()}@workspace.local`;

    const nodesAll = workspaceTables();
    const nodeByTable = new Map(nodesAll.map((n) => [n.table, n] as const));
    const knownTables = new Set(nodesAll.map((n) => n.table));

    const created = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO users (email, password, name, role, is_workspace_anchor) VALUES (?, ?, ?, 'admin', 1)`
        )
        .run(anchorEmail, lockedHash, wsName);
      const ownerId = info.lastInsertRowid as number;

      const patronRoleId = `role-patron-${ownerId}`;
      db.prepare(
        `INSERT INTO company_roles (id, owner_id, name, level, parent_role_id, is_system)
         VALUES (?, ?, 'Patron', 0, NULL, 1)`
      ).run(patronRoleId, ownerId);

      // Le compte humain devient patron du nouveau workspace.
      db.prepare(
        `INSERT INTO company_members (id, owner_id, user_id, role_id, status)
         VALUES (?, ?, ?, ?, 'active')`
      ).run(`member-${ownerId}-${userId}`, ownerId, userId, patronRoleId);

      db.prepare(
        `INSERT INTO workspaces (owner_id, account_user_id, name, logo, specialty, account_type) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(ownerId, userId, wsName, logoValue, specialtyValue, accountTypeValue);

      // Bascule immédiate sur le nouveau workspace.
      db.prepare('UPDATE users SET active_owner_id = ? WHERE id = ?').run(ownerId, userId);

      // Réimport optionnel d'un export précédent (§2/§3). Tout se passe dans la
      // même transaction : si une ligne casse une contrainte, elle est ignorée
      // (best-effort) mais le workspace lui-même n'est jamais laissé à moitié créé.
      const importTables =
        importData && typeof (importData as any).tables === 'object' && (importData as any).tables !== null
          ? ((importData as any).tables as Record<string, unknown[]>)
          : null;

      const imported: Record<string, number> = {};
      const skipped: Record<string, number> = {};
      let rowsOffered = 0;      // lignes présentes dans le fichier d'export
      let uniqueConflicts = 0;  // rejets dus à une contrainte UNIQUE globale

      if (importTables) {
        // Ordre de réinsertion : celui déclaré par l'export (meta.tableOrder) si
        // présent et exploitable, sinon l'ordre topologique recalculé localement
        // (compat ascendante avec un export v1 sans meta). Les parents DOIVENT
        // être insérés avant leurs enfants pour que la correspondance d'id existe.
        const declaredOrder = (importData as any)?.meta?.tableOrder;
        const orderToUse: string[] =
          Array.isArray(declaredOrder) && declaredOrder.every((n: unknown) => typeof n === 'string')
            ? (declaredOrder as string[])
            : nodesAll.map((n) => n.table);

        // Correspondance ancien id -> nouvel id, par table parente. Un enfant dont
        // le parent référencé est absent de cette table (parent non importé, ou
        // ligne parente elle-même ignorée) est TOUJOURS écarté : mieux vaut un
        // enfant manquant qu'un enfant rattaché au mauvais parent.
        const idMap = new Map<string, Map<string, unknown>>();

        for (const tableName of orderToUse) {
          if (!knownTables.has(tableName)) continue; // table inconnue (export d'une version différente) -> ignorée
          if (RBAC_SCAFFOLDING_TABLES.has(tableName)) continue; // déjà provisionnées ci-dessus pour CE workspace ; réimporter lierait de vrais comptes utilisateurs étrangers à la nouvelle société
          const rows = importTables[tableName];
          if (!Array.isArray(rows) || rows.length === 0) continue;

          const node = nodeByTable.get(tableName);
          if (!node) continue;

          const pragma = pragmaTableInfo(tableName);
          if (pragma.length === 0) continue;
          const colTypes = new Map(pragma.map((c) => [c.name, c] as const));
          const pkCol = pragma.find((c) => c.pk === 1)?.name;
          const pkIsOwnerId = pkCol === 'owner_id'; // ex: app_settings (PK = owner_id lui-même)
          const isIntPk = !!pkCol && !pkIsOwnerId && /INT/i.test(colTypes.get(pkCol)?.type || '');
          // La quasi-totalité des tables métier utilisent un id TEXT (UUID/horodatage), PAS
          // un entier autoincrémenté. Réutiliser cette valeur telle quelle collisionnerait
          // avec la ligne d'origine (l'export ne supprime pas la société source) : on génère
          // donc un id neuf pour toute PK TEXT, comme pour un INTEGER autoincrement.
          const needsFreshTextId = !!pkCol && !pkIsOwnerId && !isIntPk;

          const localIdMap = new Map<string, unknown>();
          idMap.set(tableName, localIdMap);

          let importedCount = 0;
          let skippedCount = 0;

          for (const row of rows) {
            if (!row || typeof row !== 'object' || Array.isArray(row)) {
              skippedCount++;
              continue;
            }
            const insertCols: string[] = [];
            const values: unknown[] = [];
            let skipRow = false;
            const freshPkValue = needsFreshTextId ? randomUUID() : undefined;

            for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
              if (pkCol && k === pkCol && (isIntPk || needsFreshTextId || pkIsOwnerId)) continue; // réattribué explicitement plus bas
              if (k === 'owner_id') continue; // recalculé ci-dessous (racines) ou absent (enfants)
              if (!colTypes.has(k)) continue; // colonne inconnue -> ignorée

              if (node.via !== 'owner' && k === node.via.fk) {
                // Réécrit la FK vers le NOUVEL id du parent (jamais l'ancien).
                const parentMap = idMap.get(node.via.parent);
                const newParentId = parentMap ? parentMap.get(String(v)) : undefined;
                if (newParentId === undefined) {
                  skipRow = true;
                  break;
                }
                insertCols.push(k);
                values.push(newParentId);
                continue;
              }

              insertCols.push(k);
              values.push(v);
            }

            if (skipRow) {
              skippedCount++;
              continue;
            }

            if (needsFreshTextId && pkCol) {
              insertCols.push(pkCol);
              values.push(freshPkValue);
            }

            if (node.via === 'owner') {
              insertCols.push('owner_id');
              values.push(ownerId);
            }

            if (insertCols.length === 0) {
              skippedCount++;
              continue;
            }

            const colList = insertCols.map((c) => `"${c}"`).join(', ');
            const placeholders = insertCols.map(() => '?').join(', ');
            try {
              const insertInfo = db
                .prepare(`INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders})`)
                .run(...(values as any[]));
              importedCount++;
              if (pkCol) {
                const oldIdRaw = (row as Record<string, unknown>)[pkCol];
                if (oldIdRaw !== undefined && oldIdRaw !== null) {
                  const newId = isIntPk ? insertInfo.lastInsertRowid : pkIsOwnerId ? ownerId : freshPkValue;
                  localIdMap.set(String(oldIdRaw), newId);
                }
              }
            } catch (rowErr) {
              // Ligne incompatible (contrainte NOT NULL/UNIQUE manquante côté cible...) :
              // on l'ignore pour ne pas faire échouer tout l'import.
              skippedCount++;
              if ((rowErr as { code?: string })?.code === 'SQLITE_CONSTRAINT_UNIQUE') uniqueConflicts++;
              console.warn(`[createWorkspace:import] ligne ignorée dans ${tableName}:`, rowErr);
            }
          }

          if (importedCount > 0) imported[tableName] = importedCount;
          if (skippedCount > 0) skipped[tableName] = skippedCount;
          rowsOffered += rows.length;
        }
      }

      // Un import qui n'a RIEN pu réinsérer alors que le fichier contenait des
      // lignes laisserait une société vide en donnant l'illusion du succès :
      // c'est la pire issue possible pour une restauration. On annule tout
      // (le throw fait reculer la transaction) et on explique la cause.
      if (rowsOffered > 0 && Object.keys(imported).length === 0) {
        const err = new Error('IMPORT_CONFLICT') as Error & { importMeta?: unknown };
        err.importMeta = { rowsOffered, uniqueConflicts, skipped };
        throw err;
      }

      return { ownerId, imported, skipped, rowsOffered, uniqueConflicts };
    })();

    const totalSkipped = Object.values(created.skipped as Record<string, number>)
      .reduce((a: number, b: number) => a + b, 0);
    res.status(201).json({
      ok: true,
      ownerId: created.ownerId,
      name: wsName,
      imported: created.imported,
      skipped: created.skipped,
      // Message honnête destiné à l'UI : ne jamais laisser croire à un import
      // complet quand des lignes sont tombées.
      warning: totalSkipped > 0
        ? (created.uniqueConflicts > 0
          ? 'PARTIAL_IMPORT_DUPLICATES'  // doublons : la société d'origine existe encore
          : 'PARTIAL_IMPORT')
        : null,
      skippedTotal: totalSkipped,
    });
  } catch (e) {
    if ((e as Error)?.message === 'IMPORT_CONFLICT') {
      const meta = (e as Error & { importMeta?: any }).importMeta || {};
      return res.status(409).json({
        ok: false,
        code: 'IMPORT_CONFLICT',
        // Cas typique : on réimporte un export dont la société source n'a pas
        // encore été supprimée (matricules, CIN… sont uniques globalement).
        detail: meta.uniqueConflicts > 0 ? 'DUPLICATES' : 'INCOMPATIBLE',
        rowsOffered: meta.rowsOffered ?? 0,
        skipped: meta.skipped ?? {},
      });
    }
    console.error('createWorkspace error:', e);
    res.status(500).json({ ok: false, error: 'create failed' });
  }
};

/** POST /api/workspaces/switch — bascule le workspace actif du compte. */
export const switchWorkspace = (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const targetRaw = req.body?.ownerId;
    const target = Number(targetRaw);
    if (!Number.isInteger(target) || target <= 0) {
      return res.status(400).json({ ok: false, error: 'ownerId invalide' });
    }

    ensurePrimaryWorkspace(userId);

    // Sécurité : on ne bascule QUE sur un workspace dont le compte est membre actif.
    const member = db
      .prepare(`SELECT 1 FROM company_members WHERE user_id = ? AND owner_id = ? AND status = 'active'`)
      .get(userId, target);
    if (!member) {
      return res.status(403).json({ ok: false, error: 'workspace non autorisé' });
    }

    db.prepare('UPDATE users SET active_owner_id = ? WHERE id = ?').run(target, userId);
    res.json({ ok: true, activeOwnerId: target });
  } catch (e) {
    console.error('switchWorkspace error:', e);
    res.status(500).json({ ok: false, error: 'switch failed' });
  }
};

/**
 * GET /api/workspaces/:ownerId/export — export JSON complet d'une société
 * (toutes les tables cloisonnées par owner_id), pour sauvegarde avant suppression
 * ou pour réimport ultérieur via `createWorkspace({ importData })`.
 */
export const exportWorkspace = (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const ownerId = Number(req.params.ownerId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      return res.status(400).json({ ok: false, error: 'ownerId invalide' });
    }

    if (!isPatronOfWorkspace(userId, ownerId)) {
      return res.status(403).json({ ok: false, code: 'FORBIDDEN' });
    }

    const ws = db
      .prepare('SELECT owner_id, name, logo, specialty, account_type, profile_meta FROM workspaces WHERE owner_id = ?')
      .get(ownerId) as
      | { owner_id: number; name: string; logo: string | null; specialty: string | null; account_type: string | null; profile_meta: string | null }
      | undefined;
    if (!ws) return res.status(404).json({ ok: false, error: 'workspace introuvable' });

    const nodes = workspaceTables();
    const tableOrder = nodes.map((n) => n.table);
    const data: Record<string, unknown[]> = {};

    // Colonnes de type "clé référencée par un enfant" (parentKey) à conserver dans
    // les valeurs collectées même si elles ne servent qu'au filtrage en cascade
    // (jamais elles ne sont sensibles en pratique — ce sont des id).
    const neededKeysByTable = new Map<string, Set<string>>();
    for (const n of nodes) {
      if (n.via === 'owner') continue;
      if (!neededKeysByTable.has(n.via.parent)) neededKeysByTable.set(n.via.parent, new Set());
      neededKeysByTable.get(n.via.parent)!.add(n.via.parentKey);
    }
    // valeurs collectées, clé = `${table}::${column}`
    const collectedValues = new Map<string, unknown[]>();

    for (const node of nodes) {
      const t = node.table;
      let pragma: { name: string }[];
      try {
        pragma = db.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[];
      } catch {
        continue;
      }
      const cols = pragma.map((c) => c.name).filter((c) => !SENSITIVE_COLUMN.test(c));
      if (cols.length === 0) {
        data[t] = [];
        continue;
      }
      const colList = cols.map((c) => `"${c}"`).join(', ');

      let rows: any[] = [];
      try {
        if (node.via === 'owner') {
          rows = db.prepare(`SELECT ${colList} FROM "${t}" WHERE owner_id = ?`).all(ownerId);
        } else {
          const parentValues = collectedValues.get(`${node.via.parent}::${node.via.parentKey}`) || [];
          if (parentValues.length > 0) {
            const placeholders = parentValues.map(() => '?').join(', ');
            rows = db
              .prepare(`SELECT ${colList} FROM "${t}" WHERE "${node.via.fk}" IN (${placeholders})`)
              .all(...parentValues);
          }
        }
      } catch (err) {
        console.warn(`[exportWorkspace] lecture ignorée pour ${t}:`, err);
      }
      data[t] = rows;

      const needed = neededKeysByTable.get(t);
      if (needed) {
        for (const keyCol of needed) {
          collectedValues.set(
            `${t}::${keyCol}`,
            rows.map((r) => r[keyCol]).filter((v) => v !== undefined && v !== null)
          );
        }
      }
    }

    logAudit({
      userId,
      action: 'EXPORT',
      resource: 'workspace',
      resourceId: ownerId,
      ownerId,
      detail: `Export société "${ws.name}"`,
      ip: req.ip,
    });

    res.json({
      version: 2,
      exportedAt: new Date().toISOString(),
      workspace: {
        ownerId: ws.owner_id,
        name: ws.name,
        logo: ws.logo,
        specialty: ws.specialty,
        accountType: ws.account_type,
        profileMeta: ws.profile_meta,
      },
      meta: { tableOrder },
      tables: data,
    });
  } catch (e) {
    console.error('exportWorkspace error:', e);
    res.status(500).json({ ok: false, error: 'export failed' });
  }
};

/**
 * POST /api/workspaces/:ownerId/delete — suppression définitive et protégée
 * (mot de passe + nom exact) d'une société. Libère un emplacement (max 2/compte).
 */
export const deleteWorkspace = async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const ownerId = Number(req.params.ownerId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      return res.status(400).json({ ok: false, error: 'ownerId invalide' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ ok: false, error: 'corps de requête invalide' });
    }
    const { password, confirmName } = req.body as { password?: unknown; confirmName?: unknown };
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ ok: false, code: 'PASSWORD_REQUIRED' });
    }
    if (typeof confirmName !== 'string' || !confirmName.trim()) {
      return res.status(400).json({ ok: false, code: 'NAME_REQUIRED' });
    }

    if (!isPatronOfWorkspace(userId, ownerId)) {
      return res.status(403).json({ ok: false, code: 'FORBIDDEN' });
    }

    const ws = db.prepare('SELECT owner_id, name FROM workspaces WHERE owner_id = ?').get(ownerId) as
      | { owner_id: number; name: string }
      | undefined;
    if (!ws) return res.status(404).json({ ok: false, error: 'workspace introuvable' });

    if (confirmName.trim().toLowerCase() !== ws.name.trim().toLowerCase()) {
      return res.status(400).json({ ok: false, code: 'NAME_MISMATCH' });
    }

    const caller = db.prepare('SELECT password FROM users WHERE id = ?').get(userId) as { password?: string } | undefined;
    const passOk = caller?.password ? await bcrypt.compare(password, caller.password) : false;
    if (!passOk) {
      logAudit({
        userId,
        action: 'LOGIN_FAILED',
        resource: 'workspace_delete',
        resourceId: ownerId,
        ownerId,
        detail: `Mot de passe erroné lors d'une tentative de suppression de la société "${ws.name}"`,
        ip: req.ip,
      });
      return res.status(401).json({ ok: false, code: 'BAD_PASSWORD' });
    }

    // On ne laisse jamais un compte sans société : refuse si c'est le dernier
    // workspace dont ce compte est membre actif.
    const memberOfCount = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT w.owner_id) AS n
           FROM workspaces w
           JOIN company_members m ON m.owner_id = w.owner_id AND m.user_id = ? AND m.status = 'active'`
        )
        .get(userId) as { n: number }
    ).n;
    if (memberOfCount <= 1) {
      return res.status(400).json({ ok: false, code: 'LAST_WORKSPACE' });
    }

    // On ne se repose PAS sur ON DELETE CASCADE : toutes les relations ne le
    // déclarent pas, et supprimer un parent avant ses enfants fait alors échouer
    // toute l'opération (FOREIGN KEY constraint failed). On supprime donc en
    // ordre topologique INVERSE (enfants d'abord), en résolvant chaque enfant par
    // sous-requête sur son parent — qui existe encore à ce moment-là.
    const nodes = workspaceTables();
    const nodeByTable = new Map(nodes.map((n) => [n.table, n] as const));
    const deleted: Record<string, number> = {};

    /** Sous-requête donnant les clés d'un parent appartenant à ce workspace (récursive). */
    const parentKeys = (table: string, key: string): { sql: string; params: unknown[] } => {
      const n = nodeByTable.get(table);
      if (!n || n.via === 'owner') {
        return { sql: `SELECT "${key}" FROM "${table}" WHERE owner_id = ?`, params: [ownerId] };
      }
      const inner = parentKeys(n.via.parent, n.via.parentKey);
      return {
        sql: `SELECT "${key}" FROM "${table}" WHERE "${n.via.fk}" IN (${inner.sql})`,
        params: inner.params,
      };
    };

    const runDeletion = db.transaction(() => {
      for (const node of [...nodes].reverse()) {
        const t = node.table;
        let info: { changes: number };
        if (node.via === 'owner') {
          info = db.prepare(`DELETE FROM "${t}" WHERE owner_id = ?`).run(ownerId);
        } else {
          const sub = parentKeys(node.via.parent, node.via.parentKey);
          info = db
            .prepare(`DELETE FROM "${t}" WHERE "${node.via.fk}" IN (${sub.sql})`)
            .run(...(sub.params as any[]));
        }
        if (info.changes > 0) deleted[t] = info.changes;
      }
      // Purge explicite du socle RBAC (déjà couvert par rootOwnerTables() ci-dessus
      // puisque ces tables portent owner_id, mais on le garde par sécurité/clarté —
      // ces DELETE supplémentaires sont no-op si déjà vidées).
      db.prepare('DELETE FROM member_permission_overrides WHERE owner_id = ?').run(ownerId);
      db.prepare('DELETE FROM role_permissions WHERE owner_id = ?').run(ownerId);
      db.prepare('DELETE FROM company_members WHERE owner_id = ?').run(ownerId);
      db.prepare('DELETE FROM company_roles WHERE owner_id = ?').run(ownerId);
      db.prepare('DELETE FROM workspaces WHERE owner_id = ?').run(ownerId);

      // Reroute tout compte dont le workspace actif pointait sur celui supprimé,
      // vers un workspace restant dont il est membre actif (sinon NULL).
      const stranded = db.prepare('SELECT id FROM users WHERE active_owner_id = ?').all(ownerId) as { id: number }[];
      for (const u of stranded) {
        const fallback = db
          .prepare(
            `SELECT w.owner_id FROM workspaces w
             JOIN company_members m ON m.owner_id = w.owner_id AND m.user_id = ? AND m.status = 'active'
             ORDER BY w.created_at ASC LIMIT 1`
          )
          .get(u.id) as { owner_id: number } | undefined;
        db.prepare('UPDATE users SET active_owner_id = ? WHERE id = ?').run(fallback ? fallback.owner_id : null, u.id);
      }
    });
    runDeletion();

    logAudit({
      userId,
      action: 'DELETE',
      resource: 'workspace',
      resourceId: ownerId,
      ownerId,
      detail: `Suppression société "${ws.name}" — lignes supprimées: ${JSON.stringify(deleted)}`,
      ip: req.ip,
    });

    res.json({ ok: true, deleted });
  } catch (e) {
    console.error('deleteWorkspace error:', e);
    res.status(500).json({ ok: false, error: 'delete failed' });
  }
};
