import db from './db';

export type AuditAction =
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED'
  | 'CREATE' | 'UPDATE' | 'DELETE'
  | 'EXPORT' | 'IMPORT' | 'DOWNLOAD'
  | 'PERMISSION_DENIED' | 'IDOR_ATTEMPT' | 'RATE_LIMIT'
  | 'PASSWORD_RESET' | 'USER_SUSPEND' | 'USER_ACTIVATE';

export function logAudit(params: {
  userId?: number;
  action: AuditAction;
  resource?: string;
  resourceId?: string | number;
  detail?: string;
  ip?: string;
  ownerId?: number;
}): void {
  try {
    db.prepare(
      `INSERT INTO system_audit_logs (user_id, table_name, action, record_id, detail, ip, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.userId ?? null,
      params.resource ?? 'system',
      params.action,
      params.resourceId ? String(params.resourceId) : '0',
      params.detail ?? null,
      params.ip ?? null,
      params.ownerId ?? null
    );
  } catch (err) {
    console.error('[Audit] Failed to log:', err);
  }
}

export interface AuditRow {
  id: number;
  table_name: string;
  action: string;
  record_id: string;
  old_data: string | null;
  new_data: string | null;
  changed_by: string;
  timestamp: string;
  user_id: number | null;
  detail: string | null;
  ip: string | null;
  owner_id: number | null;
  email: string | null;
  name: string | null;
}

/**
 * Retourne l'historique d'audit d'un workspace (owner_id), joint à `users` pour
 * afficher l'email/nom de l'auteur. Filtrage optionnel par sous-ensemble d'utilisateurs.
 */
export function listAudit(params: {
  ownerId: number;
  userIds?: number[];
  limit?: number;
  offset?: number;
}): AuditRow[] {
  const { ownerId, userIds } = params;
  if (userIds && userIds.length === 0) return [];

  // Bornage défensif : les valeurs viennent d'une query string, donc NaN/négatif
  // possible → better-sqlite3 refuserait le binding et on perdrait l'historique.
  const toInt = (v: unknown, fallback: number) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? n : fallback;
  };
  const limit = Math.min(Math.max(toInt(params.limit, 100), 1), 500);
  const offset = Math.max(toInt(params.offset, 0), 0);

  let sql = `
    SELECT
      a.id, a.table_name, a.action, a.record_id, a.old_data, a.new_data,
      a.changed_by, a.timestamp, a.user_id, a.detail, a.ip, a.owner_id,
      u.email AS email, u.name AS name
    FROM system_audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.owner_id = ?
  `;
  const args: any[] = [ownerId];

  if (userIds && userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(', ');
    sql += ` AND a.user_id IN (${placeholders})`;
    args.push(...userIds);
  }

  sql += ` ORDER BY a.timestamp DESC LIMIT ? OFFSET ?`;
  args.push(limit, offset);

  try {
    return db.prepare(sql).all(...args) as AuditRow[];
  } catch (err) {
    console.error('[Audit] Failed to list:', err);
    return [];
  }
}
