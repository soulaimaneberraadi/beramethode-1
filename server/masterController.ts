import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import db from './db';
import { JWT_SECRET } from './jwtConfig';

// Helper to log master actions to system_audit_logs
export const logMasterAction = (actor: string, targetUserId: number | null, action: string, details: any, viaImpersonation = 0, ip?: string, userAgent?: string) => {
  try {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO impersonation_audit_logs (id, actor, target_user_id, action, details, via_impersonation, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, actor, targetUserId, action, details ? JSON.stringify(details) : null, viaImpersonation, ip || null, userAgent || null);
  } catch (err) {
    console.error('[logMasterAction] Failed to log system audit:', err);
  }
};

/**
 * Middleware or helper to verify MASTER_KEY in request headers
 */
const verifyMasterKey = (req: Request): boolean => {
  const masterKey = process.env.MASTER_KEY;
  if (!masterKey) {
    // MASTER_KEY not configured — refuse ALL master operations
    return false;
  }
  // Accept master key ONLY from header (never query string — logged in URL history/proxies)
  const providedKey = req.headers['x-master-key'];
  return typeof providedKey === 'string' && providedKey === masterKey;
};

/**
 * Middleware: restrict master endpoints to localhost only.
 */
export const requireLocalhost = (req: Request, res: Response, next: Function) => {
  const ip = req.ip || req.socket?.remoteAddress || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLocal) {
    return res.status(403).json({ message: 'Master endpoints are restricted to localhost' });
  }
  next();
};

/**
 * POST /api/master/impersonate/:userId
 * Return a short-lived impersonation token (JWT)
 */
export const impersonateUser = (req: Request, res: Response) => {
  if (!verifyMasterKey(req)) {
    return res.status(401).json({ message: 'Invalid Master Key' });
  }

  const { userId } = req.params;
  try {
    const user = db.prepare('SELECT id, email, name, role, status FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.status === 'suspended') {
      return res.status(400).json({ message: 'Cannot impersonate a suspended user' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, imp_by: 'BERA_MASTER' },
      JWT_SECRET,
      { expiresIn: '30m' }
    );

    logMasterAction('MASTER', user.id, 'impersonate', { email: user.email }, 0, req.ip, req.headers['user-agent'] as string);

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    console.error('impersonateUser error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/master/users/:id/suspend
 */
export const suspendUser = (req: Request, res: Response) => {
  if (!verifyMasterKey(req)) {
    return res.status(401).json({ message: 'Invalid Master Key' });
  }

  const { id } = req.params;
  try {
    const user = db.prepare('SELECT id, email, status FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(id);
    logMasterAction('MASTER', user.id, 'suspend_user', { email: user.email }, 0, req.ip, req.headers['user-agent'] as string);

    res.json({ ok: true, message: 'User suspended successfully' });
  } catch (error) {
    console.error('suspendUser error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/master/users/:id/activate
 */
export const activateUser = (req: Request, res: Response) => {
  if (!verifyMasterKey(req)) {
    return res.status(401).json({ message: 'Invalid Master Key' });
  }

  const { id } = req.params;
  try {
    const user = db.prepare('SELECT id, email, status FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(id);
    logMasterAction('MASTER', user.id, 'activate_user', { email: user.email }, 0, req.ip, req.headers['user-agent'] as string);

    res.json({ ok: true, message: 'User activated successfully' });
  } catch (error) {
    console.error('activateUser error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/master/audit-logs
 */
export const getMasterAuditLogs = (req: Request, res: Response) => {
  if (!verifyMasterKey(req)) {
    return res.status(401).json({ message: 'Invalid Master Key' });
  }

  try {
    const logs = db.prepare('SELECT * FROM impersonation_audit_logs ORDER BY created_at DESC LIMIT 500').all();
    res.json(logs);
  } catch (error) {
    console.error('getMasterAuditLogs error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
