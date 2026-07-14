import 'dotenv/config';
import { shouldUseHelmet, SECRET_KEY, isCookieSecure } from './server/jwtConfig';
import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { register, login, logout, me, requestPasswordReset, verifyResetCode, resetPassword, supabaseSessionLogin } from './server/authController';
import { logAudit } from './server/auditLogger';
import { getSetupStatus, initSetup } from './server/setupController';
import { listWorkspaces, createWorkspace, switchWorkspace } from './server/workspacesController';
import { verifyLicenseProxy } from './server/licenseController';
import { reportError, getReports, resolveReport } from './server/errorController';
import { getAllUsers, updateUserRole, deleteUser, isAdmin } from './server/userController';
import {
  getMyPermissions, listRoles, createRole, deleteRole,
  getRolePermissions, setRolePermissions, setOverride,
  listMembers, addMember, removeMember,
  getCompanyInfo, updateCompanyInfo,
} from './server/permissionsController';
import { getMyProfile, updateMyProfile } from './server/profileController';
import { getModels, saveModel, deleteModel } from './server/modelController';
import {
  getMagasinProducts,
  saveMagasinProduct,
  deleteMagasinProduct,
  getMagasinLots,
  getMagasinMouvements,
  registerMouvement,
  updateMagasinMouvement,
  deleteMagasinMouvement,
  getMagasinCommandes,
  saveMagasinCommande,
  deleteMagasinCommande,
  getMagasinDemandes,
  saveMagasinDemande,
  deleteMagasinDemande,
  getMagasinDechets,
  saveMagasinDechet,
  deleteMagasinDechet,
  getMaterialReceipts,
  saveMaterialReceipt,
  deleteMaterialReceipt,
  getInventoryMovements,
  saveInventoryMovement,
  deleteInventoryMovement,
  saveMaterialInvoice,
  getMaterialInvoices,
  serveMaterialInvoice,
  deleteMaterialInvoice,
} from './server/magasinController';
import {
  getFinishedGoods,
  saveFinishedGood,
  deleteFinishedGood,
  createFromCloture,
  getFinishedGoodMovements,
  getAllFinishedGoodMovements,
  saveFinishedGoodMovement,
  deleteFinishedGoodMovement,
} from './server/finishedGoodsController';
import { getSettings, saveSettings } from './server/settingsController';
import { getPlanningEvents, savePlanningEvents, deletePlanningEvent, getReservations, saveReservations, deductReservations, releaseReservations } from './server/planningController';
import {
  getSubcontractOrders,
  createSubcontractOrder,
  updateSubcontractOrder,
  deleteSubcontractOrder,
  getSubcontractorGroups,
  saveSubcontractorGroup,
  deleteSubcontractorGroup
} from './server/subcontractController';
import { getSuiviData, saveSuiviData, getSuiviStats } from './server/suiviController';
import { getPosteSuivi, savePosteSuivi, deletePosteSuivi } from './server/posteSuiviController';
import { getDemandesAppro, saveDemandesAppro, updateDemandeApproStatut } from './server/demandesApproController';
import { getWorkers, saveWorker, deleteWorker, bulkImportWorkers } from './server/workersController';
import { getWorkerSkills, saveWorkerSkill, deleteWorkerSkill, updateSkillFromSuivi } from './server/workerSkillsController';
import { getPointage, savePointage, bulkSavePointage, deletePointage, getWorkerActivity, exportPointageMensuel } from './server/workerPointageController';
import {
  getHRWorkers, getHRWorkerDossier, getHRWorkerById, saveHRWorker, deleteHRWorker,
  getHRPointage, saveHRPointage, validateHRPointage,
  getHRProduction, saveHRProduction,
  getHRAvances, saveHRAvance, updateHRAvanceStatut,
  getWorkerByCin, getWorkerPointageToday, getWorkerProductionToday,
  getHRClaimPreview, postHRClaimFromGuest,
  postHRWorkerPin,
  postWorkerPinVerify,
  getHRTransportLignes, saveHRTransportLigne, deleteHRTransportLigne,
} from './server/hrController';
import {
  impersonateUser,
  suspendUser,
  activateUser,
  getMasterAuditLogs,
  requireLocalhost
} from './server/masterController';
import {
  getHRInvitations,
  postHRInvitation,
  postHRInvitationRespond,
  getHRInvitationByToken,
} from './server/hrIdentityController';
import { getSageExports, generateSageExport, previewSageExport } from './server/hrSageController';
import { 
  getFactures, getFactureById, saveFacture, deleteFacture,
  getBonsLivraison, saveBonLivraison, deleteBonLivraison,
  getPaiementsParFacture, savePaiement, deletePaiement
} from './server/facturationController';
import * as invoiceController from './server/invoiceController';
import { getDashboardKPIs, streamDashboardKPIs } from './server/dashboardController';
import { authenticateToken, requirePermission, clearAuthCookie } from './server/middleware';
import { postAnalyzeTextile, postSuggestVocabulary, postGenerateOperations, postOptimizePlanning } from './server/geminiController';
import { forcePushNow, supabaseSyncMiddleware, logSupabaseSyncStatus, startSupabaseSync } from './server/supabaseSync';
import { dataChangeNotifier } from './server/eventBus';
import {
  getActivityRates, saveActivityRate,
  getLearningCurves, saveLearningCurve, deleteLearningCurve,
  getCrisisAlerts, saveCrisisAlert, updateCrisisAlert,
  updateAllCR
} from './server/schedulingController';
import {
  getChronoSessions,
  createChronoSession,
  updateChronoSession,
  deleteChronoSession,
  batchSaveChronoSessions
} from './server/chronoController';
import {
  getCatalogEntries,
  syncCatalog,
  pinCatalogEntry,
  deleteCatalogEntry,
  updateCatalogEntry,
  confirmCatalogEntry,
} from './server/catalogController';

// ── Agent 3: UUID Generation (prevents sequential ID enumeration) ──
function generateUUID(): string {
  const chars = '0123456789abcdef';
  const sections = [8, 4, 4, 4, 12];
  return sections.map(len => {
    let section = '';
    for (let i = 0; i < len; i++) section += chars[Math.floor(Math.random() * 16)];
    return section;
  }).join('-');
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '7000', 10);

  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  if (shouldUseHelmet()) {
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
              "'self'",
              "'unsafe-inline'",
              "'unsafe-eval'",
              'https://cdn.tailwindcss.com',
              'https://cdnjs.cloudflare.com',
            ],
            styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
            fontSrc: ["'self'", 'https:', 'data:'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https:'],
          },
        },
        crossOriginEmbedderPolicy: false,
        referrerPolicy: { policy: 'same-origin' },
        dnsPrefetchControl: { allow: false },
      })
    );
  }

  // HTTPS redirect: in production behind a reverse proxy, redirect HTTP → HTTPS
  if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
      const proto = req.headers['x-forwarded-proto'];
      if (proto && proto !== 'https') {
        return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
      }
      next();
    });
  }

  // Rate limiting is ON by default — only disabled in explicit development mode
  const isDev = process.env.NODE_ENV === 'development';
  const isLoopbackRequest = (req: express.Request): boolean => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const host = (req.hostname || req.headers.host || '').split(':')[0];
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  };

  // En dev : pas de plafond global (HMR, proxy Vite, React StrictMode, rafraîchissements → faux positifs 429).
  // En prod : plafond large pour une appli riche (plusieurs modules + boot) sans ouvrir l’abus.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8000,
    standardHeaders: true,
    legacyHeaders: false,
    // Skip the SSE stream (one long-lived connection per dashboard tab —
    // counting it against the request budget would penalize live users)
    // and skip entirely in dev.
    skip: (req) => isDev || req.path === '/api/dashboard/kpis/stream',
    handler: (_req, res) => {
      res.status(429).json({ message: 'Trop de requêtes. Réessayez dans 15 minutes.' });
    },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isDev || isLoopbackRequest(req),
    handler: (req, res) => {
      trackViolation(req.ip ?? req.socket.remoteAddress ?? 'unknown');
      res.status(429).json({ message: 'Trop de tentatives de connexion. Attendez 15 minutes.' });
    },
  });

  const passwordResetByEmailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    skip: () => isDev,
    keyGenerator: (req) => {
      const email = typeof (req.body as { email?: string })?.email === 'string'
        ? (req.body as { email: string }).email.trim().toLowerCase()
        : '';
      return `${req.ip ?? 'unknown'}:${email}`;
    },
    handler: (_req, res) => {
      res.status(429).json({ message: 'Trop de demandes pour ce compte. Réessayez plus tard.' });
    },
  });

  const beraouvierPublicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    skip: () => isDev,
    keyGenerator: (req) => `${req.ip ?? 'unknown'}:${(req.params as { cin?: string }).cin ?? ''}`,
    handler: (_req, res) => {
      res.status(429).json({ message: 'Trop de requêtes. Réessayez plus tard.' });
    },
  });

  // H2 hardening : limiteur dédié et plus strict pour la vérification du PIN
  // ouvrier (anti brute-force), clé = ip + cin. Plus restrictif que le
  // beraouvierPublicLimiter partagé (40/15min).
  const pinVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    skip: () => isDev,
    keyGenerator: (req) => `${req.ip ?? 'unknown'}:${(req.params as { cin?: string }).cin ?? ''}`,
    handler: (_req, res) => {
      res.status(429).json({ message: 'Trop de tentatives de code PIN. Réessayez dans 15 minutes.' });
    },
  });

  const networkInfoLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isDev,
  });

  const usersLookupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    skip: () => isDev,
    keyGenerator: (req) => req.ip ?? 'unknown',
    handler: (_req, res) => {
      res.status(429).json({ message: 'Trop de requêtes sur la gestion des utilisateurs. Réessayez dans une heure.' });
    },
  });

  const masterLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      trackViolation(req.ip ?? req.socket.remoteAddress ?? 'unknown');
      res.status(429).json({ message: 'Too many master API attempts. Try again in 15 minutes.' });
    },
  });

  // ── IP Violation Tracking (Anti-Brute Force) ──
  const ipViolations = new Map<string, { count: number; blockedUntil: number; lastViolation: number }>();

  function trackViolation(ip: string): void {
    const now = Date.now();
    const record = ipViolations.get(ip) ?? { count: 0, blockedUntil: 0, lastViolation: now };
    if (record.blockedUntil > now) return;
    record.count++;
    record.lastViolation = now;
    if (record.count >= 5) {
      record.blockedUntil = now + 30 * 60 * 1000;
      console.warn(`  🔒 IP ${ip} bloquée pour 30 min (${record.count} violations)`);
    }
    ipViolations.set(ip, record);
  }

  function ipBlockCheck(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (isDev) { next(); return; }
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const record = ipViolations.get(ip);
    if (record && record.blockedUntil > Date.now()) {
      const remaining = Math.ceil((record.blockedUntil - Date.now()) / 60000);
      res.status(429).json({
        message: `IP bloquée pour ${remaining} minutes suite à des violations répétées.`,
      });
      return;
    }
    next();
  }

  // ── Agent 2: IDOR Ownership Guard ──
  // Verifies that a resource identified by req.params.id belongs to the
  // requesting user's company (ownerId). Uses a DB lookup against the given
  // table & column. Admins bypass (need to manage all company data).
  function ownershipGuard(table: string, scopeColumn: string) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const user = (req as any).user as { id: number; role?: string } | undefined;
      const companyId = (req as any).companyId as number | undefined;
      const resourceId = req.params.id;

      if (!user || !companyId) {
        return res.status(401).json({ message: 'Authentification requise.' });
      }

      // Admin bypass — admins need to manage data across all companies
      if (user.role === 'admin') return next();

      if (!resourceId) {
        return res.status(400).json({ message: 'Identifiant ressource requis.' });
      }

      try {
        const db: typeof import('better-sqlite3').Database = require('./server/db').default;
        const row = db.prepare(`SELECT ${scopeColumn} FROM ${table} WHERE id = ?`).get(resourceId) as
          { [key: string]: number } | undefined;

        if (!row) {
          return res.status(404).json({ message: 'Ressource introuvable.' });
        }

        if (row[scopeColumn] !== companyId) {
          trackViolation(req.ip ?? req.socket.remoteAddress ?? 'unknown');
          logAudit({ userId: user.id, action: 'IDOR_ATTEMPT', resource: table, resourceId, detail: `scope=${scopeColumn} expected=${companyId} actual=${row[scopeColumn]}`, ip: req.ip ?? req.socket.remoteAddress ?? 'unknown' });
          return res.status(403).json({ message: 'Accès refusé à cette ressource.' });
        }

        next();
      } catch (err) {
        console.error('IDOR guard error:', err);
        return res.status(500).json({ message: 'Erreur interne.' });
      }
    };
  }

  // ── Agent 2: No Direct User Access ──
  // Blocks non-admin users from accessing other users' data via /api/users/:id.
  async function noDirectUserAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = (req as any).user as { id: number; role?: string } | undefined;
    const targetId = parseInt(req.params.id, 10);

    if (!user) {
      return res.status(401).json({ message: 'Authentification requise.' });
    }

    // Admin can access any user
    if (user.role === 'admin') return next();

    // Users can only access their own data
    if (targetId !== user.id) {
      trackViolation(req.ip ?? req.socket.remoteAddress ?? 'unknown');
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    next();
  }

  // Nettoie les entrées expirées toutes les 60 secondes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipViolations) {
      if (record.blockedUntil > 0 && record.blockedUntil < now) {
        record.blockedUntil = 0;
        record.count = 0;
      }
      if (record.blockedUntil === 0 && now - record.lastViolation > 3600000) {
        ipViolations.delete(ip);
      }
    }
  }, 60000);

  // ── Session Activity Tracking ──────────────────────────────────────
  const userActivity = new Map<number, { lastActivity: number }>();
  const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 60 min inactivity → logout

  // Cleanup stale entries every 5 minutes
  setInterval(() => {
    const cutoff = Date.now() - SESSION_TIMEOUT_MS;
    for (const [uid, record] of userActivity) {
      if (record.lastActivity < cutoff) userActivity.delete(uid);
    }
  }, 5 * 60 * 1000).unref();

  app.use(express.json({ limit: '24mb' }));
  app.use(cookieParser());

  // ── Active IP block check: blocks IPs with 5+ violations for 30 minutes ──
  app.use(ipBlockCheck);

  // ── CSRF Protection: Same-Origin check ──
  // For all non-GET/HEAD/OPTIONS requests in production, verify the Origin header
  // matches the server's host. This prevents Cross-Site Request Forgery by blocking
  // forged cross-origin writes while allowing same-origin requests, direct API calls
  // (curl/Postman), and server-to-server communication.
  app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') return next();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!origin) {
      // Browsers always send Origin on cross-origin POST/PUT/DELETE.
      // No Origin → same-origin or direct API call (curl, Postman, server-to-server).
      return next();
    }
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return res.status(403).json({ message: 'Requête refusée : origine non autorisée.' });
      }
    } catch {
      return res.status(403).json({ message: 'Requête refusée : en-tête Origin invalide.' });
    }
    next();
  });

  app.use('/api/', ipBlockCheck, apiLimiter);
  app.use('/api/auth/', authLimiter);
  app.use(supabaseSyncMiddleware);
  // Emits an in-process event after every successful write so SSE clients
  // can push the new snapshot instantly (no polling).
  app.use(dataChangeNotifier);

  // Agent 3 — UUID & Path Security: validate route params + track violations
  app.use('/api', (req, res, next) => {
    const SAFE_PARAM_PATTERN = /^[a-zA-Z0-9_\-]+$/;
    const SQL_INJECTION_PATTERN = /['";\-\-]|\b(?:union|select|insert|drop|delete|exec|alter|truncate|update|set)\b/i;
    for (const [key, value] of Object.entries(req.params)) {
      if (typeof value !== 'string' || value.length === 0) continue;
      if (!SAFE_PARAM_PATTERN.test(value) || SQL_INJECTION_PATTERN.test(value)) {
        trackViolation(req.ip ?? req.socket.remoteAddress ?? 'unknown');
        return res.status(400).json({ message: 'Invalid request parameter' });
      }
    }
    next();
  });

  app.post('/api/auth/register', register);
  app.post('/api/auth/login', login);
  app.post('/api/auth/supabase-session', supabaseSessionLogin);
  app.post('/api/auth/logout', logout);
  app.get('/api/auth/me', me);

  app.post('/api/auth/forgot-password', passwordResetByEmailLimiter, requestPasswordReset);
  app.post('/api/auth/verify-code', passwordResetByEmailLimiter, verifyResetCode);
  app.post('/api/auth/reset-password', resetPassword);

  // ── Session timeout check ─────────────────────────────────────────────
  // Applied globally AFTER public auth routes. Reads JWT directly from
  // cookie. Does NOT apply to GET /api/auth/me (the "still here" check).
  const sessionTimeoutCheck: express.RequestHandler = (req, res, next) => {
    if (req.method === 'GET' && req.path === '/api/auth/me') return next();
    const token = req.cookies?.token;
    if (!token) return next();
    try {
      const decoded = jwt.verify(token, SECRET_KEY) as any;
      const record = userActivity.get(decoded.id);
      if (record && Date.now() - record.lastActivity > SESSION_TIMEOUT_MS) {
        userActivity.delete(decoded.id);
        clearAuthCookie(res);
        return res.status(401).json({ message: 'Session expirée. Veuillez vous reconnecter.' });
      }
    } catch {
      // Invalid / expired token — authenticateToken will reject it later
    }
    next();
  };

  // ── Session activity tracker ──────────────────────────────────────────
  // Updates lastActivity timestamp on every request with a valid JWT.
  const sessionActivityTracker: express.RequestHandler = (req, _res, next) => {
    const userId = (req as any).user?.id;
    if (userId) {
      userActivity.set(userId, { lastActivity: Date.now() });
    } else {
      const token = req.cookies?.token;
      if (token) {
        try {
          const decoded = jwt.verify(token, SECRET_KEY) as any;
          if (decoded?.id) {
            userActivity.set(decoded.id, { lastActivity: Date.now() });
          }
        } catch { /* ignore */ }
      }
    }
    next();
  };

  app.use(sessionTimeoutCheck);
  app.use(sessionActivityTracker);

  // ── Setup initial (Desktop Foundation) ──
  app.get('/api/setup/status', getSetupStatus);
  app.post('/api/setup/init', initSetup);

  // ── Licence (proxy vers l'Edge Function Supabase verify-license) ──
  // Public : appelé durant le boot, avant l'authentification.
  app.post('/api/license/verify', verifyLicenseProxy);

  app.post('/api/sync/push-now', authenticateToken, async (req, res) => {
    const localUserId = Number((req as any).user?.id);
    if (!localUserId) {
      return res.status(401).json({ ok: false, message: 'Session utilisateur introuvable.' });
    }

    const result = await forcePushNow(localUserId);
    return res.status(result.ok ? 200 : 409).json(result);
  });

  // ── Master / Admin Central (Bera Master Integration) ──
  app.post('/api/master/impersonate/:userId', requireLocalhost, masterLimiter, impersonateUser);
  app.post('/api/master/users/:id/suspend', requireLocalhost, masterLimiter, suspendUser);
  app.post('/api/master/users/:id/activate', requireLocalhost, masterLimiter, activateUser);
  app.get('/api/master/audit-logs', requireLocalhost, masterLimiter, getMasterAuditLogs);

  // ── Rapports de crash (Desktop Foundation) ──
  app.post('/api/errors/report', reportError);
  app.get('/api/errors/reports', authenticateToken, (req, res, next) => {
    if ((req as any).user?.role !== 'admin') {
      return res.status(403).json({ message: 'Réservé aux administrateurs' });
    }
    next();
  }, getReports);
  app.put('/api/errors/reports/:id/resolve', authenticateToken, (req, res, next) => {
    if ((req as any).user?.role !== 'admin') {
      return res.status(403).json({ message: 'Réservé aux administrateurs' });
    }
    next();
  }, resolveReport);

  app.get('/api/models', authenticateToken, requirePermission('page', 'ingenierie', 'view'), getModels);
  app.post('/api/models', authenticateToken, requirePermission('page', 'ingenierie', 'edit'), saveModel);
  app.delete('/api/models/:id', authenticateToken, requirePermission('page', 'ingenierie', 'edit'), ownershipGuard('models', 'user_id'), deleteModel);

  app.get('/api/magasin/products', authenticateToken, requirePermission('page', 'magasin', 'view'), getMagasinProducts);
  app.post('/api/magasin/products', authenticateToken, requirePermission('page', 'magasin', 'edit'), saveMagasinProduct);
  app.delete('/api/magasin/products/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), ownershipGuard('magasin_products', 'owner_id'), deleteMagasinProduct);
  app.get('/api/magasin/lots', authenticateToken, requirePermission('page', 'magasin', 'view'), getMagasinLots);
  app.get('/api/magasin/mouvements', authenticateToken, requirePermission('page', 'magasin', 'view'), getMagasinMouvements);
  app.put('/api/magasin/mouvements/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), updateMagasinMouvement);
  app.delete('/api/magasin/mouvements/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), ownershipGuard('magasin_mouvements', 'owner_id'), deleteMagasinMouvement);
  app.post('/api/magasin/mvt', authenticateToken, requirePermission('page', 'magasin', 'edit'), registerMouvement);

  app.get('/api/material-receipts', authenticateToken, requirePermission('page', 'magasin', 'view'), getMaterialReceipts);
  app.post('/api/material-receipts', authenticateToken, requirePermission('page', 'magasin', 'edit'), saveMaterialReceipt);
  app.delete('/api/material-receipts/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), ownershipGuard('material_receipts', 'owner_id'), deleteMaterialReceipt);
  app.delete('/api/material-invoices/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), ownershipGuard('material_invoices', 'owner_id'), deleteMaterialInvoice);
  app.delete('/api/inventory-movements/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), ownershipGuard('inventory_movements', 'owner_id'), deleteInventoryMovement);
  app.delete('/api/magasin/commandes/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), ownershipGuard('magasin_commandes', 'owner_id'), deleteMagasinCommande);
  app.delete('/api/magasin/demandes/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), ownershipGuard('magasin_demandes', 'owner_id'), deleteMagasinDemande);
  app.delete('/api/magasin/dechets/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), ownershipGuard('magasin_dechets', 'owner_id'), deleteMagasinDechet);

  // ── Stock Produit Fini ──
  app.get('/api/finished-goods', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'view'), getFinishedGoods);
  app.post('/api/finished-goods', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'edit'), saveFinishedGood);
  app.post('/api/finished-goods/cloture', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'edit'), createFromCloture);
  app.get('/api/finished-goods/mouvements', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'view'), getAllFinishedGoodMovements);
  app.post('/api/finished-goods/mouvements', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'edit'), saveFinishedGoodMovement);
  app.get('/api/finished-goods/:fgId/mouvements', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'view'), getFinishedGoodMovements);
  app.delete('/api/finished-goods/mouvements/:id', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'edit'), ownershipGuard('finished_goods_movements', 'owner_id'), deleteFinishedGoodMovement);
  app.delete('/api/finished-goods/:id', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'edit'), ownershipGuard('finished_goods_stock', 'owner_id'), deleteFinishedGood);

  app.get('/api/settings', authenticateToken, requirePermission('page', 'config', 'view'), getSettings);
  app.post('/api/settings', authenticateToken, requirePermission('page', 'config', 'edit'), saveSettings);

  app.get('/api/users', authenticateToken, isAdmin, usersLookupLimiter, getAllUsers);
  app.put('/api/users/:id/role', authenticateToken, isAdmin, noDirectUserAccess, usersLookupLimiter, updateUserRole);
  app.delete('/api/users/:id', authenticateToken, isAdmin, noDirectUserAccess, usersLookupLimiter, deleteUser);

  // ── Profil personnel (Epic 2) ──
  app.get('/api/profile/me', authenticateToken, getMyProfile);
  app.put('/api/profile/me', authenticateToken, updateMyProfile);

  // ── Permissions hiérarchiques (Epic 2) ──
  app.get('/api/permissions/me', authenticateToken, getMyPermissions);
  app.get('/api/permissions/roles', authenticateToken, listRoles);
  app.post('/api/permissions/roles', authenticateToken, createRole);
  app.delete('/api/permissions/roles/:id', authenticateToken, deleteRole);
  app.get('/api/permissions/roles/:id/perms', authenticateToken, getRolePermissions);
  app.put('/api/permissions/roles/:id/perms', authenticateToken, setRolePermissions);
  app.put('/api/permissions/overrides/:userId', authenticateToken, setOverride);
  app.get('/api/permissions/members', authenticateToken, listMembers);
  app.post('/api/permissions/members', authenticateToken, addMember);
  app.delete('/api/permissions/members/:userId', authenticateToken, removeMember);
  app.get('/api/permissions/company', authenticateToken, getCompanyInfo);
  app.put('/api/permissions/company', authenticateToken, updateCompanyInfo);

  // ── Multi-workspace : plusieurs sociétés isolées par compte ──
  app.get('/api/workspaces', authenticateToken, listWorkspaces);
  app.post('/api/workspaces', authenticateToken, isAdmin, createWorkspace);
  app.post('/api/workspaces/switch', authenticateToken, switchWorkspace);

  app.get('/api/planning', authenticateToken, requirePermission('page', 'planning', 'view'), getPlanningEvents);
  app.post('/api/planning', authenticateToken, requirePermission('page', 'planning', 'edit'), savePlanningEvents);
  app.delete('/api/planning/:id', authenticateToken, requirePermission('page', 'planning', 'edit'), ownershipGuard('planning_events', 'owner_id'), deletePlanningEvent);

  app.get('/api/planning/reservations/:planningId', authenticateToken, requirePermission('page', 'planning', 'view'), getReservations);
  app.post('/api/planning/reservations/:planningId', authenticateToken, requirePermission('page', 'planning', 'edit'), saveReservations);
  app.post('/api/planning/reservations/:planningId/deduct', authenticateToken, requirePermission('page', 'planning', 'edit'), deductReservations);
  app.delete('/api/planning/reservations/:planningId', authenticateToken, requirePermission('page', 'planning', 'edit'), releaseReservations);

  // Subcontracting Routes
  app.get('/api/subcontract', authenticateToken, requirePermission('page', 'sousTraitance', 'view'), getSubcontractOrders);
  app.post('/api/subcontract', authenticateToken, requirePermission('page', 'sousTraitance', 'edit'), createSubcontractOrder);
  app.put('/api/subcontract/:id', authenticateToken, requirePermission('page', 'sousTraitance', 'edit'), updateSubcontractOrder);
  app.delete('/api/subcontract/:id', authenticateToken, requirePermission('page', 'sousTraitance', 'edit'), ownershipGuard('subcontract_orders', 'owner_id'), deleteSubcontractOrder);
  app.get('/api/subcontract/groups', authenticateToken, requirePermission('page', 'sousTraitance', 'view'), getSubcontractorGroups);
  app.post('/api/subcontract/groups', authenticateToken, requirePermission('page', 'sousTraitance', 'edit'), saveSubcontractorGroup);
  app.delete('/api/subcontract/groups/:id', authenticateToken, requirePermission('page', 'sousTraitance', 'edit'), ownershipGuard('subcontractor_groups', 'owner_id'), deleteSubcontractorGroup);

  app.get('/api/suivi', authenticateToken, requirePermission('page', 'suivi', 'view'), getSuiviData);
  app.post('/api/suivi', authenticateToken, requirePermission('page', 'suivi', 'edit'), saveSuiviData);
  app.get('/api/suivi/stats', authenticateToken, requirePermission('page', 'suivi', 'view'), getSuiviStats);

  app.get('/api/poste-suivi', authenticateToken, requirePermission('page', 'suivi', 'view'), getPosteSuivi);
  app.post('/api/poste-suivi', authenticateToken, requirePermission('page', 'suivi', 'edit'), savePosteSuivi);
  app.delete('/api/poste-suivi/:id', authenticateToken, requirePermission('page', 'suivi', 'edit'), ownershipGuard('poste_suivi', 'owner_id'), deletePosteSuivi);

  app.get('/api/demandes-appro', authenticateToken, requirePermission('page', 'magasin', 'view'), getDemandesAppro);
  app.post('/api/demandes-appro', authenticateToken, requirePermission('page', 'magasin', 'edit'), saveDemandesAppro);
  app.put('/api/demandes-appro/:id/statut', authenticateToken, requirePermission('page', 'magasin', 'edit'), updateDemandeApproStatut);

  // Phase 5 — Effectifs
  app.get('/api/workers', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getWorkers);
  app.post('/api/workers', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), saveWorker);
  app.delete('/api/workers/:id', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), ownershipGuard('workers', 'owner_id'), deleteWorker);
  app.post('/api/workers/bulk-import', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), bulkImportWorkers);

  app.get('/api/worker-skills', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getWorkerSkills);
  app.post('/api/worker-skills', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), saveWorkerSkill);
  app.delete('/api/worker-skills/:id', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), ownershipGuard('worker_skills', 'owner_id'), deleteWorkerSkill);
  app.post('/api/worker-skills/auto-update', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), updateSkillFromSuivi);

  app.get('/api/worker-pointage', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getPointage);
  app.get('/api/worker-pointage/export', authenticateToken, requirePermission('page', 'gestionRh', 'view'), exportPointageMensuel);
  app.get('/api/worker-pointage/activity', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getWorkerActivity);
  app.post('/api/worker-pointage', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), savePointage);
  app.post('/api/worker-pointage/bulk', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), bulkSavePointage);
  app.delete('/api/worker-pointage/:id', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), ownershipGuard('worker_pointage', 'owner_id'), deletePointage);

  // Phase 5 — HR Full Module
  app.get('/api/hr/workers', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getHRWorkers);
  app.get('/api/hr/claim-legacy-preview', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getHRClaimPreview);
  app.post('/api/hr/claim-legacy', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), postHRClaimFromGuest);
  app.get('/api/hr/workers/:id/dossier', authenticateToken, requirePermission('page', 'gestionRh', 'view'), ownershipGuard('hr_workers', 'owner_id'), getHRWorkerDossier);
  app.get('/api/hr/workers/:id', authenticateToken, requirePermission('page', 'gestionRh', 'view'), ownershipGuard('hr_workers', 'owner_id'), getHRWorkerById);
  app.post('/api/hr/workers', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), saveHRWorker);
  app.post('/api/hr/workers/:id/pin', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), ownershipGuard('hr_workers', 'owner_id'), postHRWorkerPin);
  app.delete('/api/hr/workers/:id', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), ownershipGuard('hr_workers', 'owner_id'), deleteHRWorker);

  app.get('/api/hr/pointage', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getHRPointage);
  app.post('/api/hr/pointage', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), saveHRPointage);
  app.post('/api/hr/pointage/validate', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), validateHRPointage);

  app.get('/api/hr/production', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getHRProduction);
  app.post('/api/hr/production', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), saveHRProduction);

  app.get('/api/hr/avances', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getHRAvances);
  app.post('/api/hr/avances', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), saveHRAvance);
  app.put('/api/hr/avances/:id/statut', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), updateHRAvanceStatut);

  app.get('/api/hr/sage-exports', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getSageExports);
  app.get('/api/hr/sage-preview/:mois', authenticateToken, requirePermission('page', 'gestionRh', 'view'), previewSageExport);
  app.get('/api/hr/sage-export/:mois', authenticateToken, requirePermission('page', 'gestionRh', 'view'), generateSageExport);

  app.get('/api/hr/transport-lignes', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getHRTransportLignes);
  app.post('/api/hr/transport-lignes', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), saveHRTransportLigne);
  app.delete('/api/hr/transport-lignes/:id', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), ownershipGuard('hr_transport_lignes', 'owner_id'), deleteHRTransportLigne);

  // Section 23 — Identité plateforme + invitations
  app.get('/api/hr/invitations', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getHRInvitations);
  app.post('/api/hr/invitations', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), postHRInvitation);
  app.post('/api/hr/invitations/respond', beraouvierPublicLimiter, postHRInvitationRespond);
  app.get('/api/hr/invitations/preview/:token', beraouvierPublicLimiter, getHRInvitationByToken);

  // Phase 6 — Dashboard KPIs
  app.get('/api/dashboard/kpis', authenticateToken, requirePermission('page', ['dashboard', 'vuegenerale'], 'view'), getDashboardKPIs);
  // SSE — instant push updates (WhatsApp-style, no 30s polling banner)
  app.get('/api/dashboard/kpis/stream', authenticateToken, requirePermission('page', ['dashboard', 'vuegenerale'], 'view'), streamDashboardKPIs);

  // Phase: Facturation (Achat, Vente, Devis, BL)
  app.get('/api/facturation/factures', authenticateToken, requirePermission('page', 'facturation', 'view'), getFactures);
  app.get('/api/facturation/factures/:id', authenticateToken, requirePermission('page', 'facturation', 'view'), getFactureById);
  app.post('/api/facturation/factures', authenticateToken, requirePermission('page', 'facturation', 'edit'), saveFacture);
  app.delete('/api/facturation/factures/:id', authenticateToken, requirePermission('page', 'facturation', 'edit'), ownershipGuard('factures', 'owner_id'), deleteFacture);

  app.get('/api/facturation/bl', authenticateToken, requirePermission('page', 'facturation', 'view'), getBonsLivraison);
  app.post('/api/facturation/bl', authenticateToken, requirePermission('page', 'facturation', 'edit'), saveBonLivraison);
  app.delete('/api/facturation/bl/:id', authenticateToken, requirePermission('page', 'facturation', 'edit'), ownershipGuard('bons_livraison', 'owner_id'), deleteBonLivraison);

  app.get('/api/facturation/paiements/:facture_id', authenticateToken, requirePermission('page', 'facturation', 'view'), getPaiementsParFacture);
  app.post('/api/facturation/paiements', authenticateToken, requirePermission('page', 'facturation', 'edit'), savePaiement);
  app.delete('/api/facturation/paiements/:facture_id/:id', authenticateToken, requirePermission('page', 'facturation', 'edit'), deletePaiement);

  // Invoices
  app.get('/api/invoices', authenticateToken, invoiceController.getInvoices);
  app.get('/api/invoices/:id', authenticateToken, invoiceController.getInvoiceById);
  app.get('/api/invoices/product/:productId', authenticateToken, invoiceController.getInvoicesByProduct);
  app.post('/api/invoices', authenticateToken, invoiceController.saveInvoice);
  app.delete('/api/invoices/:id', authenticateToken, invoiceController.deleteInvoice);
  app.post('/api/invoices/:id/publish', authenticateToken, invoiceController.publishInvoice);

  // Gemini / IA — API key server-side only
  app.post('/api/ai/analyze-textile', authenticateToken, requirePermission('page', 'ingenierie', 'view'), postAnalyzeTextile);
  app.post('/api/ai/suggest-vocabulary', authenticateToken, requirePermission('page', 'ingenierie', 'view'), postSuggestVocabulary);
  app.post('/api/ai/generate-operations', authenticateToken, requirePermission('page', 'ingenierie', 'view'), postGenerateOperations);
  app.post('/api/ai/optimize-planning', authenticateToken, requirePermission('page', ['planning', 'ingenierie'], 'view'), postOptimizePlanning);

  // APS — Advanced Planning & Scheduling (Blueprint Engine) 🧠
  app.get('/api/scheduling/activity-rates', authenticateToken, requirePermission('page', 'planning', 'view'), getActivityRates);
  app.post('/api/scheduling/activity-rates', authenticateToken, requirePermission('page', 'planning', 'edit'), saveActivityRate);
  app.get('/api/scheduling/learning-curves', authenticateToken, requirePermission('page', 'planning', 'view'), getLearningCurves);
  app.post('/api/scheduling/learning-curves', authenticateToken, requirePermission('page', 'planning', 'edit'), saveLearningCurve);
  app.delete('/api/scheduling/learning-curves/:id', authenticateToken, requirePermission('page', 'planning', 'edit'), ownershipGuard('learning_curve_profiles', 'owner_id'), deleteLearningCurve);
  app.get('/api/scheduling/crisis-alerts', authenticateToken, requirePermission('page', 'planning', 'view'), getCrisisAlerts);
  app.post('/api/scheduling/crisis-alerts', authenticateToken, requirePermission('page', 'planning', 'edit'), saveCrisisAlert);
  app.put('/api/scheduling/crisis-alerts/:id', authenticateToken, requirePermission('page', 'planning', 'edit'), updateCrisisAlert);
  app.post('/api/scheduling/update-cr', authenticateToken, requirePermission('page', 'planning', 'edit'), updateAllCR);

  // Chrono Sessions — Séances de chronométrage
  app.get('/api/chrono/sessions', authenticateToken, requirePermission('page', 'ingenierie', 'view'), getChronoSessions);
  app.post('/api/chrono/sessions', authenticateToken, requirePermission('page', 'ingenierie', 'edit'), createChronoSession);
  app.put('/api/chrono/sessions/:id', authenticateToken, requirePermission('page', 'ingenierie', 'edit'), updateChronoSession);
  app.delete('/api/chrono/sessions/:id', authenticateToken, requirePermission('page', 'ingenierie', 'edit'), ownershipGuard('chrono_sessions', 'owner_id'), deleteChronoSession);
  app.post('/api/chrono/sessions/batch', authenticateToken, requirePermission('page', 'ingenierie', 'edit'), batchSaveChronoSessions);

  // Catalogue de Temps
  app.get('/api/catalog/entries', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'view'), getCatalogEntries);
  app.post('/api/catalog/sync', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'edit'), syncCatalog);
  app.put('/api/catalog/:id', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'edit'), updateCatalogEntry);
  app.put('/api/catalog/:id/pin', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'edit'), pinCatalogEntry);
  app.post('/api/catalog/:id/confirm', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'edit'), confirmCatalogEntry);
  app.delete('/api/catalog/:id', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'edit'), ownershipGuard('time_catalog_entries', 'owner_id'), deleteCatalogEntry);

  // BERAOUVIER — Read-Only (no financial data); rate-limited, minimal fields
  app.get('/api/worker/:cin', beraouvierPublicLimiter, getWorkerByCin);
  app.post('/api/worker/:cin/pin-verify', pinVerifyLimiter, postWorkerPinVerify);
  app.get('/api/worker/:cin/pointage', beraouvierPublicLimiter, getWorkerPointageToday);
  app.get('/api/worker/:cin/production', beraouvierPublicLimiter, getWorkerProductionToday);

  // BERAOUVIER standalone app
  app.get('/beraouvier', (_req, res) => res.sendFile('public/beraouvier.html', { root: process.cwd() }));
  app.get('/sync-to-cloud', (_req, res) => res.sendFile('public/sync-to-cloud.html', { root: process.cwd() }));

  // Admin: Export ALL data from ALL users as JSON (for migration / consolidation)
  app.get('/api/admin/export-all-data', authenticateToken, isAdmin, (_req, res) => {
    try {
      const db = require('./server/db').default;
      const users = db.prepare('SELECT id, email, name, role, created_at FROM users').all();
      const models = db.prepare('SELECT * FROM models').all();
      const planning = db.prepare("SELECT * FROM app_settings WHERE key = 'planning_events'").all();
      const suivis = db.prepare("SELECT * FROM app_settings WHERE key LIKE 'suivi%'").all();
      const settings = db.prepare('SELECT * FROM app_settings').all();
      const workers = db.prepare('SELECT * FROM hr_workers').all();
      const magasinProducts = db.prepare('SELECT * FROM magasin_products').all();
      const timestamp = new Date().toISOString();
      res.json({
        exportDate: timestamp,
        users,
        models: models.map((m: any) => ({ ...m, data: (() => { try { return JSON.parse(m.data); } catch { return m.data; } })() })),
        planning,
        suivis,
        settings,
        workers,
        magasinProducts,
      });
    } catch (err) {
      console.error('Export all data error:', err);
      res.status(500).json({ message: 'Export failed' });
    }
  });

  // Admin: Merge all users data into target email account
  app.post('/api/admin/merge-to-user', authenticateToken, isAdmin, (req, res) => {
    try {
      const { targetEmail } = req.body as { targetEmail: string };
      if (!targetEmail) return res.status(400).json({ message: 'targetEmail required' });
      const db = require('./server/db').default;
      const targetUser = db.prepare('SELECT id FROM users WHERE email = ?').get(targetEmail);
      if (!targetUser) return res.status(404).json({ message: `User with email ${targetEmail} not found` });
      const targetId = (targetUser as any).id;
      // Merge models from all other users
      const modelsUpdated = db.prepare('UPDATE models SET user_id = ? WHERE user_id != ?').run(targetId, targetId);
      // Merge magasin products
      const productsUpdated = db.prepare('UPDATE magasin_products SET owner_id = ? WHERE owner_id != ?').run(targetId, targetId);
      // Merge HR workers
      const workersUpdated = db.prepare('UPDATE hr_workers SET owner_id = ? WHERE owner_id != ?').run(targetId, targetId);
      // Merge app settings (planning, suivis, etc.) — keep target's keys, add missing
      const otherSettings = db.prepare('SELECT owner_id, key, value FROM app_settings WHERE owner_id != ?').all(targetId);
      const targetKeys = new Set(
        (db.prepare('SELECT key FROM app_settings WHERE owner_id = ?').all(targetId) as any[]).map((r: any) => r.key)
      );
      const insertStmt = db.prepare('INSERT OR IGNORE INTO app_settings (owner_id, key, value) VALUES (?, ?, ?)');
      for (const row of otherSettings as any[]) {
        if (!targetKeys.has(row.key)) {
          insertStmt.run(targetId, row.key, row.value);
          targetKeys.add(row.key);
        }
      }
      res.json({
        message: `Merged all data into ${targetEmail}`,
        modelsUpdated: modelsUpdated.changes,
        productsUpdated: productsUpdated.changes,
        workersUpdated: workersUpdated.changes,
        settingsCopied: otherSettings.length,
      });
    } catch (err) {
      console.error('Merge data error:', err);
      res.status(500).json({ message: 'Merge failed' });
    }
  });

  // Admin: Download database backup
  app.get('/api/admin/download-db', authenticateToken, isAdmin, (_req, res) => {
    const dbPath = path.resolve(process.cwd(), 'database.sqlite');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.download(dbPath, `beramethode-backup-${timestamp}.sqlite`, (err) => {
      if (err) {
        console.error('DB download error:', err);
        if (!res.headersSent) res.status(500).json({ message: 'Download failed' });
      }
    });
  });

  // Network info endpoint (public, used by login page)
  app.get('/api/network-info', networkInfoLimiter, (_req, res) => {
    const nets = os.networkInterfaces();
    const addresses: string[] = [];
    for (const iface of Object.values(nets)) {
      if (!iface) continue;
      for (const net of iface) {
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push(net.address);
        }
      }
    }
    res.json({ addresses, port: PORT });
  });

  // Health check for Railway
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'Not found' });
  });

  // Un seul serveur HTTP : le WebSocket HMR de Vite se branche dessus (évite
  // « WebSocket server error: Port is already in use » sur 24678 et rechargements instables).
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    // BERAMETHODE_NO_HMR=1 : désactive le rechargement à chaud (diagnostic si la page
    // « se relance » en boucle : HMR / WebSocket instable sur certains postes).
    const hmrOff =
      process.env.BERAMETHODE_NO_HMR === '1' ||
      process.env.BERAMETHODE_NO_HMR === 'true';
    // Import dynamique : vite est exclu du bundle prod (voir tsup.config).
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      clearScreen: false,
      server: {
        middlewareMode: true,
        hmr: hmrOff ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // En production (EXE Electron), le cwd n'est pas le dossier du projet :
    // on utilise un chemin ABSOLU fourni par electron/main (BERA_DIST_PATH),
    // sinon 'dist' relatif (build statique classique).
    const distPath = process.env.BERA_DIST_PATH || path.resolve('dist');
    // Disable directory listing: return 404 for any path ending with '/' (except root)
    app.use((req, res, next) => {
      if (req.path.length > 1 && req.path.endsWith('/')) {
        return res.status(404).json({ message: 'Not found' });
      }
      next();
    });
    app.use(express.static(distPath, {
      index: false,
      dotfiles: 'deny',
      setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.html') {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
        if (['.js', '.css', '.html', '.json'].includes(ext)) {
          const type = res.getHeader('Content-Type');
          if (type && typeof type === 'string' && !type.includes('charset')) {
            res.setHeader('Content-Type', `${type}; charset=utf-8`);
          }
        }
      }
    }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  });

  await new Promise<void>((resolve, reject) => {
    const tryListen = (port: number) => {
      httpServer.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && port < PORT + 10) {
          console.warn(`  ⚠️  Port ${port} occupé, essai sur ${port + 1}...`);
          httpServer.removeAllListeners('error');
          tryListen(port + 1);
        } else {
          reject(err);
        }
      });
      // En mode Electron (EXE local), n'écouter que sur la loopback pour ne PAS
      // exposer l'API sur le réseau (M3 — sécurité Desktop). En web/dev, 0.0.0.0
      // garde l'accès LAN (téléphones sur le même WiFi).
      const host = process.env.ELECTRON_MODE === 'true' ? '127.0.0.1' : '0.0.0.0';
      httpServer.listen(port, host, () => {
        const usedPort = (httpServer.address() as any)?.port ?? port;
        const nets = os.networkInterfaces();
        console.log(`\n  🟢 BERAMETHODE Server running`);
        console.log(`  ├─ Local:   http://localhost:${usedPort}`);
        for (const iface of Object.values(nets)) {
          if (!iface) continue;
          for (const net of iface) {
            if (net.family === 'IPv4' && !net.internal) {
              console.log(`  ├─ Network: http://${net.address}:${usedPort}`);
            }
          }
        }
        console.log(`  └─ Mode:    ${process.env.NODE_ENV || 'development'}`);
        console.log(`  └─ CWD:    ${process.cwd()} (database.sqlite doit être ici)\n`);
        logSupabaseSyncStatus();
        // Start realtime listener (Vercel/phone → PC) — fire and forget
        void startSupabaseSync();
        resolve();
      });
    };
    tryListen(PORT);
  });
}

startServer();
