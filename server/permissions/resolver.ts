/**
 * Cœur du système de permissions — fonctions PURES (aucune dépendance Node/DB).
 * Utilisable côté serveur ET côté client (source de vérité unique).
 *
 * Hiérarchie : admin (global) et patron (= société) ont accès total (bypass).
 * Autres rôles : DENY par défaut, sauf permission explicite (rôle ou héritée du parent),
 * les overrides par personne ayant priorité absolue.
 */

export type PermAction = 'view' | 'edit';
export type ResourceType = 'page' | 'field';

export interface RolePermRow {
  role_id: string;
  resource_type: ResourceType;
  resource_key: string;
  can_view: number; // 0|1
  can_edit: number; // 0|1
}

export interface OverrideRow {
  resource_type: ResourceType;
  resource_key: string;
  can_view: number | null;
  can_edit: number | null;
}

export interface PermissionContext {
  /** true => accès total (admin global ou patron de la société). */
  isSuper: boolean;
  /** Chaîne de rôles, du rôle propre vers les parents (pour l'héritage). */
  roleChain: string[];
  /** Permissions de rôle indexées : `${roleId}|${type}|${key}`. */
  rolePerms: Map<string, RolePermRow>;
  /** Overrides personnels indexés : `${type}|${key}`. */
  overrides: Map<string, OverrideRow>;
}

const key = (type: ResourceType, k: string) => `${type}|${k}`;
const roleKey = (roleId: string, type: ResourceType, k: string) => `${roleId}|${type}|${k}`;

/**
 * Résout une permission. Ordre : super → override → rôle (propre→parents) → défaut(DENY).
 */
export function can(
  ctx: PermissionContext,
  type: ResourceType,
  resourceKey: string,
  action: PermAction
): boolean {
  if (ctx.isSuper) return true;

  // 1) Override personnel (prioritaire)
  const ov = ctx.overrides.get(key(type, resourceKey));
  if (ov) {
    const v = action === 'view' ? ov.can_view : ov.can_edit;
    if (v !== null && v !== undefined) return v === 1;
  }

  // 2) Rôle propre puis parents (héritage)
  for (const roleId of ctx.roleChain) {
    const rp = ctx.rolePerms.get(roleKey(roleId, type, resourceKey));
    if (rp) {
      return (action === 'view' ? rp.can_view : rp.can_edit) === 1;
    }
  }

  // 3) Défaut : DENY (least privilege)
  return false;
}

/** Raccourcis pratiques. */
export const canView = (ctx: PermissionContext, type: ResourceType, k: string) => can(ctx, type, k, 'view');
export const canEdit = (ctx: PermissionContext, type: ResourceType, k: string) => can(ctx, type, k, 'edit');

/** Construit les Map à partir des lignes brutes (DB ou réseau). */
export function buildContext(params: {
  isSuper: boolean;
  roleChain: string[];
  rolePerms: RolePermRow[];
  overrides: OverrideRow[];
}): PermissionContext {
  const rolePerms = new Map<string, RolePermRow>();
  for (const rp of params.rolePerms) {
    rolePerms.set(roleKey(rp.role_id, rp.resource_type, rp.resource_key), rp);
  }
  const overrides = new Map<string, OverrideRow>();
  for (const ov of params.overrides) {
    overrides.set(key(ov.resource_type, ov.resource_key), ov);
  }
  return { isSuper: params.isSuper, roleChain: params.roleChain, rolePerms, overrides };
}
