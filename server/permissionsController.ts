import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import db from './db';
import { logAudit } from './auditLogger';
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
export const addMember = async (req: Request, res: Response) => {
  const meta = loadUserContext(uid(req), urole(req));
  if (!meta.isSuper) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
  const { email, role_id, name, password } = req.body as {
    email?: string; role_id?: string; name?: string; password?: string;
  };
  if (!email || !role_id) return res.status(400).json({ ok: false, error: 'email & role_id required' });
  const normEmail = String(email).trim().toLowerCase();

  // Le rôle doit appartenir à CETTE société (évite d'attacher un membre à un
  // rôle d'un autre tenant — intégrité + isolation).
  const roleOk = db.prepare(`SELECT 1 FROM company_roles WHERE id = ? AND owner_id = ?`).get(role_id, meta.ownerId);
  if (!roleOk) return res.status(400).json({ ok: false, error: 'role_id invalide pour cette société' });

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
    userId: uid(req), action: 'CREATE', resource: 'company_members', resourceId: u.id,
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
  if (!meta.isSuper) return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
  const targetUserId = parseInt(req.params.userId, 10);
  db.prepare(
    `UPDATE company_members SET status = 'removed', removed_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND user_id = ?`
  ).run(meta.ownerId, targetUserId);
  logAudit({ userId: uid(req), action: 'DELETE', resource: 'company_members', resourceId: targetUserId, detail: 'remove member', ip: req.ip });
  res.json({ ok: true });
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
      row = db
        .prepare('SELECT name, logo, specialty, account_type FROM workspaces WHERE owner_id = ?')
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

    const store = resolveCompanyStore(meta.ownerId);
    if (store === 'workspace') {
      // workspaces n'a pas de colonne profile_meta — profileMeta ignoré ici.
      db.prepare(`UPDATE workspaces SET ${sets.join(', ')} WHERE owner_id = ?`).run(...vals, meta.ownerId);
    } else {
      if (profileMeta !== undefined) {
        let metaJson: string | null = null;
        if (profileMeta && typeof profileMeta === 'object') {
          try { metaJson = JSON.stringify(profileMeta); } catch { metaJson = null; }
        }
        sets.push('profile_meta = ?'); vals.push(metaJson);
      }
      db.prepare(`UPDATE company_settings SET ${sets.join(', ')} WHERE id = 1`).run(...vals);
    }

    logAudit({ userId: uid(req), action: 'UPDATE', resource: store === 'workspace' ? 'workspaces' : 'company_settings', resourceId: meta.ownerId, detail: `company info updated (type=${type})`, ip: req.ip });
    return getCompanyInfo(req, res);
  } catch (e) {
    console.error('updateCompanyInfo error:', e);
    res.status(500).json({ ok: false, error: 'Update failed' });
  }
};
