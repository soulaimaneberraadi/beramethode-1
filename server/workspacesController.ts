import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import db from './db';

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
function ensurePrimaryWorkspace(userId: number): void {
  const existing = db.prepare('SELECT owner_id FROM workspaces WHERE owner_id = ?').get(userId);
  if (existing) return;

  const primaryName =
    (db.prepare('SELECT name FROM company_settings WHERE id = 1').get() as { name?: string } | undefined)?.name ||
    'Workspace 1';

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
      `INSERT OR IGNORE INTO workspaces (owner_id, account_user_id, name) VALUES (?, ?, ?)`
    ).run(userId, userId, primaryName);
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

    res.json({
      ok: true,
      activeOwnerId,
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
    const { name, specialty, logo, accountType } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'name requis' });
    }
    const wsName = name.trim();
    const specialtyValue = typeof specialty === 'string' && specialty.trim() ? specialty.trim() : null;
    const logoValue = typeof logo === 'string' && logo.startsWith('data:image/') ? logo : null;
    const accountTypeValue = accountType === 'client' || accountType === 'personnel' ? accountType : 'societe';

    // Le primaire doit exister pour pouvoir y revenir après basculement.
    ensurePrimaryWorkspace(userId);

    // Mot de passe verrouillé : l'ancre ne doit jamais pouvoir se connecter.
    const lockedHash = await bcrypt.hash(randomUUID() + randomUUID(), 10);
    const anchorEmail = `ws-${randomUUID()}@workspace.local`;

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

      return ownerId;
    })();

    res.status(201).json({ ok: true, ownerId: created, name: wsName });
  } catch (e) {
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
