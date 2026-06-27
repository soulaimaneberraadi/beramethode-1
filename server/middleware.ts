import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from './db';
import { SECRET_KEY, isCookieSecure } from './jwtConfig';
import { loadUserContext } from './permissionsController';
import { can, ResourceType, PermAction } from './permissions/resolver';
import { isLicenseWritable, isReadOnlyExemptPath } from './licenseGuard';
import { isValidSafeId } from './uuidUtils';
import { logAudit } from './auditLogger';

// ── Session Activity Tracking ──────────────────────────────────────────────
// Session timeout enforcement and activity Map live in server.ts (startServer)
// to keep all session-management middleware co-located. Only the sliding
// token refresh stays here since it's tightly coupled to JWT verification.
const TOKEN_REFRESH_MS = 30 * 60 * 1000; // 30 min → issue fresh sliding token

function setTokenCookie(res: Response, token: string): void {
  res.cookie('token', token, {
    httpOnly: true,
    secure: isCookieSecure(),
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie('token', {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: isCookieSecure(),
  });
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY) as { id: number; email?: string; role?: string; imp_by?: string; iat?: number };

    // ── Sliding token refresh (30 min) ───────────────────────────────────
    const now = Date.now();
    const tokenAge = decoded.iat ? (now / 1000 - decoded.iat) : 0;
    if (tokenAge > TOKEN_REFRESH_MS / 1000) {
      const newToken = jwt.sign(
        { id: decoded.id, email: decoded.email, role: decoded.role },
        SECRET_KEY,
        { expiresIn: '24h' }
      );
      setTokenCookie(res, newToken);
    }

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
      logAudit({ userId, action: 'PERMISSION_DENIED', resource: type, detail: `action=${action} keys=${keys.join(',')}`, ip: req.ip });
      return res.status(403).json({ ok: false, code: 'PERMISSION_DENIED' });
    } catch (e) {
      console.error('requirePermission error:', e);
      return res.status(500).json({ ok: false, error: 'permission check failed' });
    }
  };

const SQL_INJECTION_PATTERN = /['";\-\-]|\b(?:union|select|insert|drop|delete|exec|xp_|alter|truncate|update|set)\b/i;

function hasSqlInjection(value: string): boolean {
  return SQL_INJECTION_PATTERN.test(value);
}

export function sanitizeIdParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const value = req.params[paramName];
    if (value === undefined) return next();

    if (hasSqlInjection(value)) {
      return res.status(400).json({ message: `Invalid ${paramName} format` });
    }

    if (!isValidSafeId(value)) {
      return res.status(400).json({ message: `Invalid ${paramName} format` });
    }

    next();
  };
}

export function sanitizeRouteParams(req: Request, res: Response, next: NextFunction) {
  for (const [key, value] of Object.entries(req.params)) {
    if (typeof value !== 'string' || value.length === 0) continue;

    if (hasSqlInjection(value)) {
      return res.status(400).json({ message: `Invalid parameter: ${key}` });
    }

    if (!isValidSafeId(value)) {
      return res.status(400).json({ message: `Invalid parameter format: ${key}` });
    }
  }
  next();
}

export function errorSanitizer(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;

  const statusCode = (err as any).status || (err as any).statusCode || 500;

  if (statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);
  }

  res.status(statusCode).json({
    message: statusCode >= 500 ? 'Internal server error' : (err.message || 'Unknown error'),
  });
}
