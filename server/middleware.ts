import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from './db';
import { SECRET_KEY } from './jwtConfig';
import { loadUserContext } from './permissionsController';
import { can, ResourceType, PermAction } from './permissions/resolver';
import { isLicenseWritable, isReadOnlyExemptPath } from './licenseGuard';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY) as { id: number; email?: string; role?: string; imp_by?: string };
    const row = db.prepare('SELECT id, email, name, role, status FROM users WHERE id = ?').get(decoded.id) as
      | { id: number; email: string; name: string; role: string; status: string }
      | undefined;
    if (!row) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (row.status === 'suspended') {
      return res.status(401).json({ message: 'Compte suspendu' });
    }
    (req as any).user = { id: row.id, email: row.email, name: row.name, role: row.role };
    if (decoded.imp_by === 'BERA_MASTER') {
      (req as any).viaImpersonation = true;
    }
    // Société (= owner_id du patron) injectée pour TOUS les controllers tenant-scopés.
    const meta = loadUserContext(row.id, row.role);
    (req as any).companyId = meta.ownerId;

    // Enforcement « lecture seule » : bloque les écritures si licence
    // expirée/suspendue (et enforcement actif). Dormant par défaut
    // (VITE_LICENSE_ENFORCE !== 'true' → isLicenseWritable = true). Chemins de
    // récupération (settings/license/auth/setup/master) exemptés.
    const httpMethod = req.method.toUpperCase();
    const isWrite = httpMethod === 'POST' || httpMethod === 'PUT' || httpMethod === 'DELETE' || httpMethod === 'PATCH';
    if (isWrite && !isReadOnlyExemptPath(req.path) && !isLicenseWritable(meta.ownerId)) {
      return res.status(403).json({ ok: false, code: 'LICENSE_READ_ONLY', message: 'Licence expirée ou suspendue : mode lecture seule.' });
    }

    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

/**
 * Garde de permission (à utiliser APRÈS authenticateToken).
 * Force la permission côté serveur — ne jamais se fier au seul gating frontend.
 */
export const requirePermission = (type: ResourceType, key: string | string[], action: PermAction) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ ok: false, message: 'Authentication required' });
      const meta = loadUserContext(userId, (req as any).user?.role);
      // Multi-clés = OR : la permission passe si l'une des pages/champs l'autorise.
      const keys = Array.isArray(key) ? key : [key];
      if (keys.some(k => can(meta.ctx, type, k, action))) return next();
      return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
    } catch (e) {
      console.error('requirePermission error:', e);
      return res.status(500).json({ ok: false, error: 'permission check failed' });
    }
  };
