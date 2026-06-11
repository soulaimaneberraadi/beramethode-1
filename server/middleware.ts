import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from './db';
import { SECRET_KEY } from './jwtConfig';
import { loadUserContext } from './permissionsController';
import { can, ResourceType, PermAction } from './permissions/resolver';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY) as { id: number; email?: string; role?: string };
    const row = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(decoded.id) as
      | { id: number; email: string; name: string; role: string }
      | undefined;
    if (!row) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    (req as any).user = { id: row.id, email: row.email, name: row.name, role: row.role };
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

/**
 * Garde de permission (à utiliser APRÈS authenticateToken).
 * Force la permission côté serveur — ne jamais se fier au seul gating frontend.
 */
export const requirePermission = (type: ResourceType, key: string, action: PermAction) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ ok: false, message: 'Authentication required' });
      const meta = loadUserContext(userId, (req as any).user?.role);
      if (can(meta.ctx, type, key, action)) return next();
      return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
    } catch (e) {
      console.error('requirePermission error:', e);
      return res.status(500).json({ ok: false, error: 'permission check failed' });
    }
  };
