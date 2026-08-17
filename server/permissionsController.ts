import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import db from './db';
import { logAudit, listAudit } from './auditLogger';
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
  // Workspace actif : si le compte gère plusieurs sociétés, on cible l'adhésion
  // correspondant à `active_owner_id`. Sinon (NULL ou adhésion absente) on retombe
  // sur la 1ʳᵉ adhésion active => comportement historique strictement inchangé.
  const activeOwnerId = (
    db.prepare('SELECT active_owner_id FROM users WHERE id = ?').get(userId) as { active_owner_id?: number } | undefined
  )?.active_owner_id;

  let member = activeOwnerId
    ? (db
        .prepare(`SELECT * FROM company_members WHERE user_id = ? AND owner_id = ? AND status = 'active'`)
        .get(userId, activeOwnerId) as any)
    : null;
  if (!member) {
    member = db
      .prepare(`SELECT * FROM company_members WHERE user_id = ? AND status = 'active'`)
      .get(userId) as any;
  }

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
          // owner_id explicite : défense en profondeur. Même si un
          // parent_role_id pointait vers une autre société, ses permissions ne
          // seraient jamais chargées ici.
          `SELECT role_id, resource_type, resource_key, can_view, can_edit
           FROM role_permissions
           WHERE owner_id = ? AND role_id IN (${roleChain.map(() => '?').join(',')})`
        )
        .all(ownerId, ...roleChain) as RolePermRow[])
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

/**
 * Niveau hiérarchique de l'appelant (0=patron, plus grand = plus bas).
 * -1 pour patron/solo (isSuper sans rôle explicite dans company_roles).
 */
function getCallerLevel(meta: ResolvedMeta): number {
  if (!meta.roleId) return -1;
  const row = db.prepare(`SELECT level FROM company_roles WHERE id = ?`).get(meta.roleId) as
    | { level?: number }
    | undefined;
  return row?.level ?? -1;
}

/**
 * Garde hiérarchique : un chef intermédiaire ne peut agir que sur ce qui est
 * STRICTEMENT en dessous de lui (jamais son propre niveau ni au-dessus).
 * `isSuper` (admin global ou patron) passe toujours.
 */
function canManageRole(meta: ResolvedMeta, targetRole: { level: number }): boolean {
  if (meta.isSuper) return true;
  const callerLevel = getCallerLevel(meta);
  return callerLevel < targetRole.level;
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
      // Par workspace actif (meta.ownerId) ; repli sur le singleton pour le primaire/legacy.
      const wsRow = db
        .prepare('SELECT account_type FROM workspaces WHERE owner_id = ?')
        .get(meta.ownerId) as { account_type?: string } | undefined;
      if (wsRow?.account_type) {
        accountType = wsRow.account_type;
      } else {
        const row = db
          .prepare('SELECT account_type FROM company_settings WHERE id = 1')
          .get() as { account_type?: string } | undefined;
        if (row?.account_type) accountType = row.account_type;
      }
    } catch { /* colonne absente (ancienne base) => societe */ }

    // Infos hiérarchie + exceptions personnelles de l'appelant (page « Mes accès »).
    let level = -1;
    let roleName: string | null = null;
    let parentRoleId: string | null = null;
    if (meta.roleId) {
      const roleRow = db
        .prepare(`SELECT level, name, parent_role_id FROM company_roles WHERE id = ?`)
        .get(meta.roleId) as { level?: number; name?: string; parent_role_id?: string } | undefined;
      if (roleRow) {
        level = roleRow.level ?? -1;
        roleName = roleRow.name ?? null;
        parentRoleId = roleRow.parent_role_id ?? null;
      }
    }
    const overrides = db
      .prepare(
        `SELECT resource_type, resource_key, can_view, can_edit
         FROM member_permission_overrides WHERE owner_id = ? AND user_id = ?`
      )
      .all(meta.ownerId, uid(req));

    res.json({
      ok: true,
      isSuper: meta.isSuper,
      ownerId: meta.ownerId,
      roleId: meta.roleId,
      pages, fields, hiddenPages, accountType,
      level, roleName, parentRoleId, overrides,
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

  const { name, level, parent_role_id, preset } = req.body as {
    name?: string; level?: number; parent_role_id?: string; preset?: RolePresetKey;
  };
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });

  const id = `role-${randomUUID()}`;
  const presetDef = preset ? ROLE_PRESETS[preset] : null;
  const lvl = level ?? presetDef?.level ?? 1;

  if (!canManageRole(meta, { level: lvl })) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });

  // Le parent DOIT appartenir à cette société. Sans ce contrôle, un
  // parent_role_id pointant vers une autre société ferait hériter ses
  // permissions : `loadUserContext` remonte la chaîne des parents sans filtre
  // owner_id — c'est une brèche d'isolation entre sociétés.
  if (parent_role_id) {
    const parentOk = db
      .prepare(`SELECT 1 FROM company_roles WHERE id = ? AND owner_id = ?`)
      .get(parent_role_id, meta.ownerId);
    if (!parentOk) return res.status(400).json({ ok: false, error: 'parent_role_id invalide pour cette société' });
  }

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
  const role = db.prepare(`SELECT * FROM company_roles WHERE id = ? AND owner_id = ?`).get(req.params.id, meta.ownerId) as any;
  if (!role) return res.status(404).json({ ok: false, error: 'not found' });
  if (role.is_system) return res.status(403).json({ ok: false, error: 'system role protected' });
  if (!canManageRole(meta, role)) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
  db.prepare(`DELETE FROM company_roles WHERE id = ?`).run(req.params.id);
  logAudit({ userId: uid(req), ownerId: meta.ownerId, action: 'DELETE', resource: 'company_roles', resourceId: req.params.id, detail: `role deleted (${role.name})`, ip: req.ip });
  res.json({ ok: true });
};

/**
 * PUT /api/permissions/roles/:id  { name?, level?, parent_role_id? }
 * Modifie un rôle existant. Empêche les cycles dans la chaîne de parenté
 * (`:id` ne doit jamais réapparaître en remontant depuis le nouveau parent).
 */
export const updateRole = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  const roleId = req.params.id;
  const role = db.prepare(`SELECT * FROM company_roles WHERE id = ? AND owner_id = ?`).get(roleId, meta.ownerId) as any;
  if (!role) return res.status(404).json({ ok: false, error: 'not found' });
  if (role.is_system) return res.status(403).json({ ok: false, error: 'system role protected' });
  if (!canManageRole(meta, role)) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });

  const { name, level, parent_role_id } = req.body as {
    name?: string; level?: number; parent_role_id?: string | null;
  };

  // Le NOUVEAU niveau doit lui aussi rester strictement sous l'appelant.
  // Sinon : un chef de niveau 1 prend un rôle qu'il gère (niveau 2), le remonte
  // au niveau 0, et le membre déjà rattaché devient patron → escalade.
  if (level !== undefined && !canManageRole(meta, { level })) {
    return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
  }

  if (parent_role_id !== undefined && parent_role_id !== null) {
    if (parent_role_id === roleId) {
      return res.status(400).json({ ok: false, code: 'ROLE_CYCLE' });
    }
    const parentRole = db
      .prepare(`SELECT * FROM company_roles WHERE id = ? AND owner_id = ?`)
      .get(parent_role_id, meta.ownerId) as any;
    if (!parentRole) return res.status(400).json({ ok: false, error: 'parent_role_id invalide pour cette société' });

    // Remonte la chaîne des parents depuis le nouveau parent : si `roleId`
    // réapparaît, l'affectation créerait un cycle.
    let cur: any = parentRole;
    const guard = new Set<string>();
    while (cur) {
      if (cur.id === roleId) return res.status(400).json({ ok: false, code: 'ROLE_CYCLE' });
      if (guard.has(cur.id)) break;
      guard.add(cur.id);
      cur = cur.parent_role_id
        ? db.prepare(`SELECT * FROM company_roles WHERE id = ?`).get(cur.parent_role_id)
        : null;
    }
  }

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (name !== undefined) { sets.push('name = ?'); vals.push(String(name).trim()); }
  if (level !== undefined) { sets.push('level = ?'); vals.push(level); }
  if (parent_role_id !== undefined) { sets.push('parent_role_id = ?'); vals.push(parent_role_id || null); }
  if (!sets.length) return res.json({ ok: true });

  db.prepare(`UPDATE company_roles SET ${sets.join(', ')} WHERE id = ? AND owner_id = ?`).run(...vals, roleId, meta.ownerId);
  logAudit({ userId: uid(req), ownerId: meta.ownerId, action: 'UPDATE', resource: 'company_roles', resourceId: roleId, detail: 'role updated', ip: req.ip });
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
  const roleId = req.params.id;
  const role = db.prepare(`SELECT * FROM company_roles WHERE id = ? AND owner_id = ?`).get(roleId, meta.ownerId) as any;
  if (!role) return res.status(404).json({ ok: false, error: 'not found' });
  if (!canManageRole(meta, role)) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
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
  logAudit({ userId: uid(req), ownerId: meta.ownerId, action: 'UPDATE', resource: 'role_permissions', resourceId: roleId, detail: `role perms updated (${perms.length})`, ip: req.ip });
  res.json({ ok: true, count: perms.length });
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
export const addMember = async (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  const { email, role_id, name, password } = req.body as {
    email?: string; role_id?: string; name?: string; password?: string;
  };
  if (!email || !role_id) return res.status(400).json({ ok: false, error: 'email & role_id required' });
  const normEmail = String(email).trim().toLowerCase();

  // Le rôle doit appartenir à CETTE société (évite d'attacher un membre à un
  // rôle d'un autre tenant — intégrité + isolation).
  const roleForAssign = db.prepare(`SELECT * FROM company_roles WHERE id = ? AND owner_id = ?`).get(role_id, meta.ownerId) as any;
  if (!roleForAssign) return res.status(400).json({ ok: false, error: 'role_id invalide pour cette société' });
  if (!canManageRole(meta, roleForAssign)) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });

  // Crée le compte login à la volée s'il n'existe pas encore (flux « ajouter un
  // employé » en une étape). Mot de passe fourni, sinon temporaire à partager.
  let u = db.prepare(`SELECT id FROM users WHERE LOWER(TRIM(email)) = ?`).get(normEmail) as any;
  let createdAccount = false;
  let tempPassword: string | null = null;
  const providedPwd = typeof password === 'string' && password.length >= 4;
  if (!u) {
    tempPassword = providedPwd ? String(password) : randomUUID().replace(/-/g, '').slice(0, 10);
    const hash = await bcrypt.hash(tempPassword, 10);
    const info = db
      .prepare(`INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, 'user')`)
      .run(normEmail, hash, String(name || '').trim());
    u = { id: info.lastInsertRowid as number };
    createdAccount = true;
  }

  db.prepare(
    `INSERT INTO company_members (id, owner_id, user_id, role_id, status)
     VALUES (?, ?, ?, ?, 'active')
     ON CONFLICT(owner_id, user_id) DO UPDATE SET role_id = excluded.role_id, status = 'active', removed_at = NULL`
  ).run(`mem-${randomUUID()}`, meta.ownerId, u.id, role_id);

  logAudit({
    userId: uid(req), ownerId: meta.ownerId, action: 'CREATE', resource: 'company_members', resourceId: u.id,
    detail: `add member ${normEmail}${createdAccount ? ' (+compte créé)' : ''}`, ip: req.ip,
  });

  // tempPassword renvoyé uniquement si généré côté serveur (à communiquer une fois).
  res.status(201).json({
    ok: true, created: createdAccount, userId: u.id,
    tempPassword: createdAccount && !providedPwd ? tempPassword : null,
  });
};

/** DELETE /api/permissions/members/:userId — retire (soft) : coupe l'accès, garde le profil */
export const removeMember = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  const targetUserId = parseInt(req.params.userId, 10);
  const member = db.prepare(`SELECT * FROM company_members WHERE owner_id = ? AND user_id = ?`).get(meta.ownerId, targetUserId) as any;
  if (!member) return res.status(404).json({ ok: false, error: 'not found' });
  const targetRole = member.role_id
    ? (db.prepare(`SELECT * FROM company_roles WHERE id = ?`).get(member.role_id) as any)
    : null;
  if (!canManageRole(meta, { level: targetRole?.level ?? 0 })) {
    return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
  }

  db.prepare(
    `UPDATE company_members SET status = 'removed', removed_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND user_id = ?`
  ).run(meta.ownerId, targetUserId);
  // Le membre retiré ne doit plus pointer vers ce workspace comme actif.
  db.prepare(`UPDATE users SET active_owner_id = NULL WHERE id = ? AND active_owner_id = ?`).run(targetUserId, meta.ownerId);
  logAudit({ userId: uid(req), ownerId: meta.ownerId, action: 'DELETE', resource: 'company_members', resourceId: targetUserId, detail: 'remove member', ip: req.ip });
  res.json({ ok: true });
};

// ── Exceptions individuelles (member_permission_overrides) ─────────────────
// Les overrides priment sur le rôle mais retombent dessus si `null`.

const isValidOverrideResource = (type: ResourceType, resourceKey: string): boolean => {
  if (type === 'page') return (PROTECTED_PAGES as readonly string[]).includes(resourceKey);
  if (type === 'field') return (PROTECTED_FIELDS as readonly string[]).includes(resourceKey);
  return false;
};

/** Charge le membre visé + son rôle, vérifie l'appartenance société + la garde hiérarchique. */
function loadManagedMember(meta: ResolvedMeta, targetUserId: number):
  | { kind: 'ok'; member: any; role: any }
  | { kind: 'error'; status: number; body: { ok: false; error?: string; code?: string } } {
  const member = db
    .prepare(`SELECT * FROM company_members WHERE owner_id = ? AND user_id = ?`)
    .get(meta.ownerId, targetUserId) as any;
  if (!member) return { kind: 'error', status: 404, body: { ok: false, error: 'not found' } };
  const role = member.role_id
    ? (db.prepare(`SELECT * FROM company_roles WHERE id = ?`).get(member.role_id) as any)
    : null;
  if (!canManageRole(meta, { level: role?.level ?? 0 })) {
    return { kind: 'error', status: 403, body: { ok: false, code: 'PERMISSION_DENIED' } };
  }
  return { kind: 'ok', member, role };
}

/** GET /api/permissions/members/:userId/overrides */
export const listMemberOverrides = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  const targetUserId = parseInt(req.params.userId, 10);
  const check = loadManagedMember(meta, targetUserId);
  if (check.kind === 'error') return res.status(check.status).json(check.body);

  const rows = db
    .prepare(
      `SELECT resource_type, resource_key, can_view, can_edit
       FROM member_permission_overrides WHERE owner_id = ? AND user_id = ?`
    )
    .all(meta.ownerId, targetUserId);
  res.json({ ok: true, data: rows });
};

/**
 * PUT /api/permissions/members/:userId/overrides
 * body { overrides: [{ resource_type, resource_key, can_view: 0|1|null, can_edit: 0|1|null }] }
 * Remplace l'ensemble des exceptions du membre en une transaction. `null` =
 * pas d'exception (retombe sur le rôle) => non stocké.
 */
export const setMemberOverrides = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  const targetUserId = parseInt(req.params.userId, 10);
  const check = loadManagedMember(meta, targetUserId);
  if (check.kind === 'error') return res.status(check.status).json(check.body);

  const overrides = (req.body?.overrides || []) as Array<{
    resource_type: ResourceType; resource_key: string; can_view: number | null; can_edit: number | null;
  }>;

  for (const o of overrides) {
    if (o.resource_type !== 'page' && o.resource_type !== 'field') {
      return res.status(400).json({ ok: false, error: 'resource_type invalide' });
    }
    if (!isValidOverrideResource(o.resource_type, o.resource_key)) {
      return res.status(400).json({ ok: false, error: `resource_key invalide: ${o.resource_key}` });
    }
  }

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM member_permission_overrides WHERE owner_id = ? AND user_id = ?`).run(meta.ownerId, targetUserId);
    const ins = db.prepare(
      `INSERT INTO member_permission_overrides (id, owner_id, user_id, resource_type, resource_key, can_view, can_edit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const o of overrides) {
      const cv = o.can_view === null || o.can_view === undefined ? null : (o.can_view ? 1 : 0);
      const ce = o.can_edit === null || o.can_edit === undefined ? null : (o.can_edit ? 1 : 0);
      if (cv === null && ce === null) continue; // rien à mémoriser (retombe sur le rôle)
      ins.run(`ov-${randomUUID()}`, meta.ownerId, targetUserId, o.resource_type, o.resource_key, cv, ce);
    }
  });
  tx();

  logAudit({
    userId: uid(req), ownerId: meta.ownerId, action: 'UPDATE', resource: 'member_permission_overrides',
    resourceId: targetUserId, detail: `overrides set (${overrides.length})`, ip: req.ip,
  });
  res.json({ ok: true, count: overrides.length });
};

/** DELETE /api/permissions/members/:userId/overrides — efface toutes les exceptions du membre. */
export const clearMemberOverrides = (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  const targetUserId = parseInt(req.params.userId, 10);
  const check = loadManagedMember(meta, targetUserId);
  if (check.kind === 'error') return res.status(check.status).json(check.body);

  db.prepare(`DELETE FROM member_permission_overrides WHERE owner_id = ? AND user_id = ?`).run(meta.ownerId, targetUserId);
  logAudit({
    userId: uid(req), ownerId: meta.ownerId, action: 'DELETE', resource: 'member_permission_overrides',
    resourceId: targetUserId, detail: 'overrides cleared', ip: req.ip,
  });
  res.json({ ok: true });
};

// ── Historique d'activité ───────────────────────────────────────────────────

/**
 * GET /api/permissions/activity?userId=&limit=&offset=
 * Patron/admin : toute la société. Chef intermédiaire : uniquement les membres
 * dont le rôle est strictement en dessous du sien + lui-même. Membre sans
 * subordonné : uniquement sa propre activité.
 */
export const getActivity = (req: Request, res: Response) => {
  try {
    const callerId = uid(req);
    const meta = loadUserContext(callerId, urole(req));
    const { userId, limit, offset } = req.query as { userId?: string; limit?: string; offset?: string };

    let allowedUserIds: number[] | undefined; // undefined => pas de restriction (patron/admin)
    if (!meta.isSuper) {
      const callerLevel = getCallerLevel(meta);
      // Rôle introuvable/incohérent (-1 sans être patron) : on ne déduit pas de
      // subordonnés, l'utilisateur ne voit que sa propre activité.
      if (callerLevel < 0) {
        const rows = listAudit({
          ownerId: meta.ownerId,
          userIds: [callerId],
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
        });
        return res.json({ ok: true, data: rows });
      }
      const subs = db
        .prepare(
          `SELECT m.user_id FROM company_members m
           JOIN company_roles r ON r.id = m.role_id
           WHERE m.owner_id = ? AND m.status = 'active' AND r.level > ?`
        )
        .all(meta.ownerId, callerLevel) as { user_id: number }[];
      allowedUserIds = [callerId, ...subs.map((s) => s.user_id)];
    }

    let userIdsFilter: number[] | undefined = allowedUserIds;
    if (userId !== undefined) {
      const requested = parseInt(userId, 10);
      if (allowedUserIds && !allowedUserIds.includes(requested)) {
        return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
      }
      userIdsFilter = [requested];
    }

    const rows = listAudit({
      ownerId: meta.ownerId,
      userIds: userIdsFilter,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('getActivity error:', e);
    res.status(500).json({ ok: false, error: 'Resolve failed' });
  }
};

// ── Informations entreprise (saisies à l'onboarding, éditables côté Admin) ───
// Source canonique : la ligne `workspaces` du propriétaire actif si elle existe
// (multi-workspace), sinon le singleton `company_settings` (id=1, install primaire).
// Même résolution que getMyPermissions pour rester cohérent avec accountType.

type CompanyStore = 'workspace' | 'company_settings';
const VALID_ACCOUNT_TYPES = ['societe', 'client', 'personnel'] as const;
const normalizeType = (v: unknown): string =>
  v === 'client' || v === 'personnel' ? v : 'societe';

/** Localise le store de l'entreprise pour le propriétaire actif. */
function resolveCompanyStore(ownerId: number): CompanyStore {
  const ws = db.prepare('SELECT owner_id FROM workspaces WHERE owner_id = ?').get(ownerId) as
    | { owner_id: number }
    | undefined;
  return ws ? 'workspace' : 'company_settings';
}

/** GET /api/permissions/company — infos entreprise (nom, logo, type, spécialité, méta). */
export const getCompanyInfo = (req: Request, res: Response) => {
  try {
    const meta = loadUserContext(uid(req), urole(req));
    const store = resolveCompanyStore(meta.ownerId);
    let row: any;
    if (store === 'workspace') {
      // `profile_meta` existe aussi sur workspaces (colonne + rattrapage dans
      // db.ts) : ne pas la lire privait les espaces de travail de leurs
      // identifiants légaux, alors qu'ils sont écrits sans problème.
      row = db
        .prepare('SELECT name, logo, specialty, account_type, profile_meta FROM workspaces WHERE owner_id = ?')
        .get(meta.ownerId);
    } else {
      row = db
        .prepare('SELECT name, logo, specialty, account_type, profile_meta FROM company_settings WHERE id = 1')
        .get();
    }
    let profileMeta: Record<string, unknown> | null = null;
    if (row?.profile_meta) {
      try { profileMeta = JSON.parse(row.profile_meta); } catch { profileMeta = null; }
    }
    res.json({
      ok: true,
      store,
      canEdit: meta.isSuper,
      name: row?.name || '',
      logo: row?.logo || null,
      specialty: row?.specialty || '',
      accountType: normalizeType(row?.account_type),
      profileMeta,
    });
  } catch (e) {
    console.error('getCompanyInfo error:', e);
    res.status(500).json({ ok: false, error: 'Resolve failed' });
  }
};

/** PUT /api/permissions/company — met à jour les infos entreprise (super uniquement). */
export const updateCompanyInfo = (req: Request, res: Response) => {
  try {
    const meta = loadUserContext(uid(req), urole(req));
    if (!meta.isSuper) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });

    const { name, logo, specialty, accountType, profileMeta } = req.body as {
      name?: string; logo?: string | null; specialty?: string | null;
      accountType?: string; profileMeta?: Record<string, unknown> | null;
    };

    const cleanName = String(name ?? '').trim();
    if (!cleanName) return res.status(400).json({ ok: false, error: 'name required' });

    // Logo : data URL image acceptée, null pour effacer, undefined pour conserver.
    const logoProvided = logo !== undefined;
    const logoValue =
      typeof logo === 'string' && logo.startsWith('data:image/') ? logo : null;

    const cleanSpecialty = specialty == null ? null : String(specialty).trim() || null;
    const type = normalizeType(accountType);

    // Colonnes mises à jour de façon conditionnelle : on ne touche `logo` /
    // `profile_meta` que s'ils sont explicitement fournis (undefined = conserver).
    const sets: string[] = ['name = ?', 'specialty = ?', 'account_type = ?'];
    const vals: (string | null)[] = [cleanName, cleanSpecialty, type];
    if (logoProvided) { sets.push('logo = ?'); vals.push(logoValue); }
    if (profileMeta !== undefined) {
      let metaJson: string | null = null;
      if (profileMeta && typeof profileMeta === 'object') {
        try { metaJson = JSON.stringify(profileMeta); } catch { metaJson = null; }
      }
      sets.push('profile_meta = ?'); vals.push(metaJson);
    }

    const store = resolveCompanyStore(meta.ownerId);
    if (store === 'workspace') {
      db.prepare(`UPDATE workspaces SET ${sets.join(', ')} WHERE owner_id = ?`).run(...vals, meta.ownerId);
    } else {
      db.prepare(`UPDATE company_settings SET ${sets.join(', ')} WHERE id = 1`).run(...vals);
    }

    logAudit({ userId: uid(req), action: 'UPDATE', resource: store === 'workspace' ? 'workspaces' : 'company_settings', resourceId: meta.ownerId, detail: `company info updated (type=${type})`, ip: req.ip });
    return getCompanyInfo(req, res);
  } catch (e) {
    console.error('updateCompanyInfo error:', e);
    res.status(500).json({ ok: false, error: 'Update failed' });
  }
};
