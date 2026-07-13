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
}): void {
  try {
    db.prepare(
      `INSERT INTO system_audit_logs (user_id, table_name, action, record_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      params.userId ?? null,
      params.resource ?? 'system',
      params.action,
      params.resourceId ? String(params.resourceId) : '0',
      params.detail ?? null,
      params.ip ?? null
    );
  } catch (err) {
    console.error('[Audit] Failed to log:', err);
  }
}
