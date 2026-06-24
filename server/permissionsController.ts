import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from './db';
import {
  buildContext, can, PermissionContext, RolePermRow, OverrideRow, ResourceType, PermAction,
} from './permissions/resolver';
import { ROLE_PRESETS, presetToPermissions, PROTECTED_PAGES, PROTECTED_FIELDS, RolePresetKey } from './permissions/presets';

const uid = (req: Request) => (req as any).user?.id as number;
const urole = (req: Request) => (req as any).user?.role as string | undefined;

interface ResolvedMeta {
  ctx: PermissionContext;
  ownerId: number;   // société (= id patron)
  roleId: string | null;
  isSuper: boolean;
}

/**
 * Construit le contexte de permissions d'un utilisateur (réutilisé par le middleware).
 * Sans adhésion => utilisateur solo = patron de sa propre société (accès total à ses données).
 */
export function loadUserContext(userId: number, globalRole?: string): ResolvedMeta {
  const member = db
    .prepare(`SELECT * FROM company_members WHERE user_id = ? AND status = 'active'`)
    .get(userId) as any;

  if (!member) {
    // Solo : sa propre société, accès total à ses propres données.
    const ctx = buildContext({ isSuper: true, roleChain: [], rolePerms: [], overrides: [] });
    return { ctx, ownerId: userId, roleId: null, isSuper: true };
  }

  const ownerId = member.owner_id as number;
  const role = db.prepare(`SELECT * FROM company_roles WHERE id = ?`).get(member.role_id) as any;
  const isPatron = userId === ownerId || (role && role.is_system === 1 && role.level === 0);
  const isSuper = globalRole === 'admin' || !!isPatron;

  // Chaîne de rôles (propre -> parents) pour l'héritage.
  const roleChain: string[] = [];
  let cur = role;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    roleChain.push(cur.id);
    cur = cur.parent_role_id
      ? db.prepare(`SELECT * FROM company_roles WHERE id = ?`).get(cur.parent_role_id)
      : null;
  }

  const rolePerms = roleChain.length
    ? (db
        .prepare(
          `SELECT role_id, resource_type, resource_key, can_view, can_edit
           FROM role_permissions WHERE role_id IN (${roleChain.map(() => '?').join(',')})`
        )
        .all(...roleChain) as RolePermRow[])
    : [];

  const overrides = db
    .prepare(
      `SELECT resource_type, resource_key, can_view, can_edit
       FROM member_permission_overrides WHERE owner_id = ? AND user_id = ?`
    )
    .all(ownerId, userId) as OverrideRow[];

  const ctx = buildContext({ isSuper, roleChain, rolePerms, overrides });
  return { ctx, ownerId, roleId: member.role_id, isSuper };
}

/** GET /api/permissions/me — contexte résolu pour le frontend (gating pages + champs). */
export const getMyPermissions = (req: Request, res: Response) => {
  try {
    const meta = loadUserContext(uid(req), urole(req));
    const pages: Record<string, { view: boolean; edit: boolean }> = {};
    for (const p of PROTECTED_PAGES) {
      pages[p] = { view: can(meta.ctx, 'page', p, 'view'), edit: can(meta.ctx, 'page', p, 'edit') };
    }
    const fields: Record<string, { view: boolean; edit: boolean }> = {};
    for (const f of PROTECTED_FIELDS) {
      fields[f] = { view: can(meta.ctx, 'field', f, 'view'), edit: can(meta.ctx, 'field', f, 'edit') };
    }
    const hiddenPages = PROTECTED_PAGES.filter((p) => !pages[p].view);
    // Type de compte de l'espace de travail (onboarding) → adapte les modules
    // visibles côté frontend. Défaut 'societe' si colonne/ligne absente.
    let accountType = 'societe';
    try {
      const row = db
        .prepare('SELECT account_type FROM company_settings WHERE id = 1')
        .get() as { account_type?: string } | undefined;
      if (row?.account_type) accountType = row.account_type;
    } catch { /* colonne absente (ancienne base) => societe */ }
    res.json({
      ok: true,
      isSuper: meta.isSuper,
      ownerId: meta.ownerId,
      roleId: meta.roleId,
      pages, fields, hiddenPages, accountType,
    });
  } catch (e) {
    console.error('getMyPermissions error:', e);
    res.status(500).json({ ok: false, error: 'Resolve failed' });
  }
};

/** GET /api/permissions/roles */
export const listRoles = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  const rows = db
    .prepare(`SELECT * FROM company_roles WHERE owner_id = ? ORDER BY level, name`)
    .all(meta.ownerId);
  res.json({ ok: true, data: rows });
};

/** POST /api/permissions/roles  { name, level?, parent_role_id?, preset? } */
export const createRole = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  if (!meta.isSuper) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });

  const { name, level, parent_role_id, preset } = req.body as {
    name?: string; level?: number; parent_role_id?: string; preset?: RolePresetKey;
  };
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });

  const id = `role-${randomUUID()}`;
  const presetDef = preset ? ROLE_PRESETS[preset] : null;
  const lvl = level ?? presetDef?.level ?? 1;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO company_roles (id, owner_id, name, level, parent_role_id) VALUES (?, ?, ?, ?, ?)`
    ).run(id, meta.ownerId, name, lvl, parent_role_id || null);

    if (presetDef) {
      const ins = db.prepare(
        `INSERT INTO role_permissions (id, owner_id, role_id, resource_type, resource_key, can_view, can_edit)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const p of presetToPermissions(presetDef)) {
        ins.run(`rp-${randomUUID()}`, meta.ownerId, id, p.resource_type, p.resource_key, p.can_view, p.can_edit);
      }
    }
  });
  tx();
  res.status(201).json({ ok: true, id });
};

/** DELETE /api/permissions/roles/:id */
export const deleteRole = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  if (!meta.isSuper) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
  const role = db.prepare(`SELECT * FROM company_roles WHERE id = ? AND owner_id = ?`).get(req.params.id, meta.ownerId) as any;
  if (!role) return res.status(404).json({ ok: false, error: 'not found' });
  if (role.is_system) return res.status(403).json({ ok: false, error: 'system role protected' });
  db.prepare(`DELETE FROM company_roles WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
};

/** GET /api/permissions/roles/:id/perms */
export const getRolePermissions = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  const rows = db
    .prepare(`SELECT resource_type, resource_key, can_view, can_edit FROM role_permissions WHERE owner_id = ? AND role_id = ?`)
    .all(meta.ownerId, req.params.id);
  res.json({ ok: true, data: rows });
};

/** PUT /api/permissions/roles/:id/perms  { perms: [{resource_type, resource_key, can_view, can_edit}] } */
export const setRolePermissions = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  if (!meta.isSuper) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
  const roleId = req.params.id;
  const perms = (req.body?.perms || []) as Array<{ resource_type: ResourceType; resource_key: string; can_view: number; can_edit: number }>;

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM role_permissions WHERE owner_id = ? AND role_id = ?`).run(meta.ownerId, roleId);
    const ins = db.prepare(
      `INSERT INTO role_permissions (id, owner_id, role_id, resource_type, resource_key, can_view, can_edit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of perms) {
      ins.run(`rp-${randomUUID()}`, meta.ownerId, roleId, p.resource_type, p.resource_key, p.can_view ? 1 : 0, p.can_edit ? 1 : 0);
    }
  });
  tx();
  res.json({ ok: true, count: perms.length });
};

/** PUT /api/permissions/overrides/:userId  { resource_type, resource_key, can_view, can_edit } (exception) */
export const setOverride = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  if (!meta.isSuper) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
  const targetUser = parseInt(req.params.userId, 10);
  const { resource_type, resource_key, can_view, can_edit } = req.body as {
    resource_type: ResourceType; resource_key: string; can_view: number | null; can_edit: number | null;
  };
  db.prepare(
    `INSERT INTO member_permission_overrides (id, owner_id, user_id, resource_type, resource_key, can_view, can_edit)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, user_id, resource_type, resource_key)
     DO UPDATE SET can_view = excluded.can_view, can_edit = excluded.can_edit`
  ).run(`ov-${randomUUID()}`, meta.ownerId, targetUser, resource_type, resource_key, can_view, can_edit);
  res.json({ ok: true });
};

/** GET /api/permissions/members */
export const listMembers = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  const rows = db
    .prepare(
      `SELECT m.id, m.user_id, m.role_id, m.status, m.joined_at, u.email, u.name, r.name AS role_name, r.level
       FROM company_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN company_roles r ON r.id = m.role_id
       WHERE m.owner_id = ? ORDER BY r.level, u.name`
    )
    .all(meta.ownerId);
  res.json({ ok: true, data: rows });
};

/** POST /api/permissions/members  { email, role_id } — ajoute un membre existant par email */
export const addMember = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  if (!meta.isSuper) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
  const { email, role_id } = req.body as { email?: string; role_id?: string };
  if (!email || !role_id) return res.status(400).json({ ok: false, error: 'email & role_id required' });
  const u = db.prepare(`SELECT id FROM users WHERE LOWER(TRIM(email)) = ?`).get(String(email).trim().toLowerCase()) as any;
  if (!u) return res.status(404).json({ ok: false, error: 'user not found' });
  // Le rôle doit appartenir à CETTE société (évite d'attacher un membre à un
  // rôle d'un autre tenant — intégrité + isolation).
  const roleOk = db.prepare(`SELECT 1 FROM company_roles WHERE id = ? AND owner_id = ?`).get(role_id, meta.ownerId);
  if (!roleOk) return res.status(400).json({ ok: false, error: 'role_id invalide pour cette société' });
  db.prepare(
    `INSERT INTO company_members (id, owner_id, user_id, role_id, status)
     VALUES (?, ?, ?, ?, 'active')
     ON CONFLICT(owner_id, user_id) DO UPDATE SET role_id = excluded.role_id, status = 'active', removed_at = NULL`
  ).run(`mem-${randomUUID()}`, meta.ownerId, u.id, role_id);
  res.status(201).json({ ok: true });
};

/** DELETE /api/permissions/members/:userId — retire (soft) : coupe l'accès, garde le profil */
export const removeMember = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  if (!meta.isSuper) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
  db.prepare(
    `UPDATE company_members SET status = 'removed', removed_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND user_id = ?`
  ).run(meta.ownerId, parseInt(req.params.userId, 10));
  res.json({ ok: true });
};
