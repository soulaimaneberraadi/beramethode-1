import 'dotenv/config';
import { shouldUseHelmet } from './server/jwtConfig';
import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import cookieParser from 'cookie-parser';
// vite n'est utilisé qu'en dev (HMR). Importé DYNAMIQUEMENT dans startServer
// pour qu'il soit exclu du bundle de production (EXE) — sinon il alourdit/casse
// le bundle et n'existe pas dans les deps de prod.
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { register, login, logout, me, requestPasswordReset, verifyResetCode, resetPassword } from './server/authController';
import { getSetupStatus, initSetup } from './server/setupController';
import { verifyLicenseProxy } from './server/licenseController';
import { reportError, getReports, resolveReport } from './server/errorController';
import { getAllUsers, updateUserRole, deleteUser, isAdmin } from './server/userController';
import {
  getMyPermissions, listRoles, createRole, deleteRole,
  getRolePermissions, setRolePermissions, setOverride,
  listMembers, addMember, removeMember,
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
import { getDashboardKPIs, streamDashboardKPIs } from './server/dashboardController';
import { authenticateToken, requirePermission } from './server/middleware';
import { postAnalyzeTextile, postSuggestVocabulary, postGenerateOperations, postOptimizePlanning } from './server/geminiController';
import { supabaseSyncMiddleware, logSupabaseSyncStatus } from './server/supabaseSync';
import { dataChangeNotifier } from './server/eventBus';
import { startSupabaseRealtime } from './server/supabaseRealtime';
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

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '7000', 10);

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
      })
    );
  }

  // Rate limiting is ON by default — only disabled in explicit development mode
  const isDev = process.env.NODE_ENV === 'development';

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
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isDev,
    handler: (_req, res) => {
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

  const masterLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ message: 'Too many master API attempts. Try again in 15 minutes.' });
    },
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use('/api/', apiLimiter);
  app.use('/api/auth/', authLimiter);
  app.use(supabaseSyncMiddleware);
  // Emits an in-process event after every successful write so SSE clients
  // can push the new snapshot instantly (no polling).
  app.use(dataChangeNotifier);

  app.post('/api/auth/register', register);
  app.post('/api/auth/login', login);
  app.post('/api/auth/logout', logout);
  app.get('/api/auth/me', me);

  app.post('/api/auth/forgot-password', passwordResetByEmailLimiter, requestPasswordReset);
  app.post('/api/auth/verify-code', passwordResetByEmailLimiter, verifyResetCode);
  app.post('/api/auth/reset-password', resetPassword);

  // ── Setup initial (Desktop Foundation) ──
  app.get('/api/setup/status', getSetupStatus);
  app.post('/api/setup/init', initSetup);

  // ── Licence (proxy vers l'Edge Function Supabase verify-license) ──
  // Public : appelé durant le boot, avant l'authentification.
  app.post('/api/license/verify', verifyLicenseProxy);

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
  app.delete('/api/models/:id', authenticateToken, requirePermission('page', 'ingenierie', 'edit'), deleteModel);

  app.get('/api/magasin/products', authenticateToken, requirePermission('page', 'magasin', 'view'), getMagasinProducts);
  app.post('/api/magasin/products', authenticateToken, requirePermission('page', 'magasin', 'edit'), saveMagasinProduct);
  app.delete('/api/magasin/products/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), deleteMagasinProduct);
  app.get('/api/magasin/lots', authenticateToken, requirePermission('page', 'magasin', 'view'), getMagasinLots);
  app.get('/api/magasin/mouvements', authenticateToken, requirePermission('page', 'magasin', 'view'), getMagasinMouvements);
  app.put('/api/magasin/mouvements/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), updateMagasinMouvement);
  app.delete('/api/magasin/mouvements/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), deleteMagasinMouvement);
  app.post('/api/magasin/mvt', authenticateToken, requirePermission('page', 'magasin', 'edit'), registerMouvement);

  app.get('/api/material-receipts', authenticateToken, requirePermission('page', 'magasin', 'view'), getMaterialReceipts);
  app.post('/api/material-receipts', authenticateToken, requirePermission('page', 'magasin', 'edit'), saveMaterialReceipt);
  app.delete('/api/material-receipts/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), deleteMaterialReceipt);

  app.get('/api/material-invoices', authenticateToken, requirePermission('page', 'magasin', 'view'), getMaterialInvoices);
  app.post('/api/material-invoices', authenticateToken, requirePermission('page', 'magasin', 'edit'), saveMaterialInvoice);
  app.get('/api/material-invoices/:id/file', authenticateToken, requirePermission('page', 'magasin', 'view'), serveMaterialInvoice);
  app.delete('/api/material-invoices/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), deleteMaterialInvoice);

  app.get('/api/inventory-movements', authenticateToken, requirePermission('page', 'magasin', 'view'), getInventoryMovements);
  app.post('/api/inventory-movements', authenticateToken, requirePermission('page', 'magasin', 'edit'), saveInventoryMovement);
  app.delete('/api/inventory-movements/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), deleteInventoryMovement);

  app.get('/api/magasin/commandes', authenticateToken, requirePermission('page', 'magasin', 'view'), getMagasinCommandes);
  app.post('/api/magasin/commandes', authenticateToken, requirePermission('page', 'magasin', 'edit'), saveMagasinCommande);
  app.delete('/api/magasin/commandes/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), deleteMagasinCommande);

  app.get('/api/magasin/demandes', authenticateToken, requirePermission('page', 'magasin', 'view'), getMagasinDemandes);
  app.post('/api/magasin/demandes', authenticateToken, requirePermission('page', 'magasin', 'edit'), saveMagasinDemande);
  app.delete('/api/magasin/demandes/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), deleteMagasinDemande);

  app.get('/api/magasin/dechets', authenticateToken, requirePermission('page', 'magasin', 'view'), getMagasinDechets);
  app.post('/api/magasin/dechets', authenticateToken, requirePermission('page', 'magasin', 'edit'), saveMagasinDechet);
  app.delete('/api/magasin/dechets/:id', authenticateToken, requirePermission('page', 'magasin', 'edit'), deleteMagasinDechet);

  // ── Stock Produit Fini ──
  app.get('/api/finished-goods', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'view'), getFinishedGoods);
  app.post('/api/finished-goods', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'edit'), saveFinishedGood);
  app.post('/api/finished-goods/cloture', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'edit'), createFromCloture);
  app.get('/api/finished-goods/mouvements', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'view'), getAllFinishedGoodMovements);
  app.post('/api/finished-goods/mouvements', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'edit'), saveFinishedGoodMovement);
  app.get('/api/finished-goods/:fgId/mouvements', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'view'), getFinishedGoodMovements);
  app.delete('/api/finished-goods/mouvements/:id', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'edit'), deleteFinishedGoodMovement);
  app.delete('/api/finished-goods/:id', authenticateToken, requirePermission('page', ['magasin', 'atelierProd'], 'edit'), deleteFinishedGood);

  app.get('/api/settings', authenticateToken, requirePermission('page', 'config', 'view'), getSettings);
  app.post('/api/settings', authenticateToken, requirePermission('page', 'config', 'edit'), saveSettings);

  app.get('/api/users', authenticateToken, isAdmin, getAllUsers);
  app.put('/api/users/:id/role', authenticateToken, isAdmin, updateUserRole);
  app.delete('/api/users/:id', authenticateToken, isAdmin, deleteUser);

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

  app.get('/api/planning', authenticateToken, requirePermission('page', 'planning', 'view'), getPlanningEvents);
  app.post('/api/planning', authenticateToken, requirePermission('page', 'planning', 'edit'), savePlanningEvents);
  app.delete('/api/planning/:id', authenticateToken, requirePermission('page', 'planning', 'edit'), deletePlanningEvent);

  app.get('/api/planning/reservations/:planningId', authenticateToken, requirePermission('page', 'planning', 'view'), getReservations);
  app.post('/api/planning/reservations/:planningId', authenticateToken, requirePermission('page', 'planning', 'edit'), saveReservations);
  app.post('/api/planning/reservations/:planningId/deduct', authenticateToken, requirePermission('page', 'planning', 'edit'), deductReservations);
  app.delete('/api/planning/reservations/:planningId', authenticateToken, requirePermission('page', 'planning', 'edit'), releaseReservations);

  // Subcontracting Routes
  app.get('/api/subcontract', authenticateToken, requirePermission('page', 'sousTraitance', 'view'), getSubcontractOrders);
  app.post('/api/subcontract', authenticateToken, requirePermission('page', 'sousTraitance', 'edit'), createSubcontractOrder);
  app.put('/api/subcontract/:id', authenticateToken, requirePermission('page', 'sousTraitance', 'edit'), updateSubcontractOrder);
  app.delete('/api/subcontract/:id', authenticateToken, requirePermission('page', 'sousTraitance', 'edit'), deleteSubcontractOrder);
  app.get('/api/subcontract/groups', authenticateToken, requirePermission('page', 'sousTraitance', 'view'), getSubcontractorGroups);
  app.post('/api/subcontract/groups', authenticateToken, requirePermission('page', 'sousTraitance', 'edit'), saveSubcontractorGroup);
  app.delete('/api/subcontract/groups/:id', authenticateToken, requirePermission('page', 'sousTraitance', 'edit'), deleteSubcontractorGroup);

  app.get('/api/suivi', authenticateToken, requirePermission('page', 'suivi', 'view'), getSuiviData);
  app.post('/api/suivi', authenticateToken, requirePermission('page', 'suivi', 'edit'), saveSuiviData);
  app.get('/api/suivi/stats', authenticateToken, requirePermission('page', 'suivi', 'view'), getSuiviStats);

  app.get('/api/poste-suivi', authenticateToken, requirePermission('page', 'suivi', 'view'), getPosteSuivi);
  app.post('/api/poste-suivi', authenticateToken, requirePermission('page', 'suivi', 'edit'), savePosteSuivi);
  app.delete('/api/poste-suivi/:id', authenticateToken, requirePermission('page', 'suivi', 'edit'), deletePosteSuivi);

  app.get('/api/demandes-appro', authenticateToken, requirePermission('page', 'magasin', 'view'), getDemandesAppro);
  app.post('/api/demandes-appro', authenticateToken, requirePermission('page', 'magasin', 'edit'), saveDemandesAppro);
  app.put('/api/demandes-appro/:id/statut', authenticateToken, requirePermission('page', 'magasin', 'edit'), updateDemandeApproStatut);

  // Phase 5 — Effectifs
  app.get('/api/workers', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getWorkers);
  app.post('/api/workers', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), saveWorker);
  app.delete('/api/workers/:id', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), deleteWorker);
  app.post('/api/workers/bulk-import', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), bulkImportWorkers);

  app.get('/api/worker-skills', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getWorkerSkills);
  app.post('/api/worker-skills', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), saveWorkerSkill);
  app.delete('/api/worker-skills/:id', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), deleteWorkerSkill);
  app.post('/api/worker-skills/auto-update', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), updateSkillFromSuivi);

  app.get('/api/worker-pointage', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getPointage);
  app.get('/api/worker-pointage/export', authenticateToken, requirePermission('page', 'gestionRh', 'view'), exportPointageMensuel);
  app.get('/api/worker-pointage/activity', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getWorkerActivity);
  app.post('/api/worker-pointage', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), savePointage);
  app.post('/api/worker-pointage/bulk', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), bulkSavePointage);
  app.delete('/api/worker-pointage/:id', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), deletePointage);

  // Phase 5 — HR Full Module
  app.get('/api/hr/workers', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getHRWorkers);
  app.get('/api/hr/claim-legacy-preview', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getHRClaimPreview);
  app.post('/api/hr/claim-legacy', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), postHRClaimFromGuest);
  app.get('/api/hr/workers/:id/dossier', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getHRWorkerDossier);
  app.get('/api/hr/workers/:id', authenticateToken, requirePermission('page', 'gestionRh', 'view'), getHRWorkerById);
  app.post('/api/hr/workers', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), saveHRWorker);
  app.post('/api/hr/workers/:id/pin', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), postHRWorkerPin);
  app.delete('/api/hr/workers/:id', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), deleteHRWorker);

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
  app.delete('/api/hr/transport-lignes/:id', authenticateToken, requirePermission('page', 'gestionRh', 'edit'), deleteHRTransportLigne);

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
  app.delete('/api/facturation/factures/:id', authenticateToken, requirePermission('page', 'facturation', 'edit'), deleteFacture);

  app.get('/api/facturation/bl', authenticateToken, requirePermission('page', 'facturation', 'view'), getBonsLivraison);
  app.post('/api/facturation/bl', authenticateToken, requirePermission('page', 'facturation', 'edit'), saveBonLivraison);
  app.delete('/api/facturation/bl/:id', authenticateToken, requirePermission('page', 'facturation', 'edit'), deleteBonLivraison);

  app.get('/api/facturation/paiements/:facture_id', authenticateToken, requirePermission('page', 'facturation', 'view'), getPaiementsParFacture);
  app.post('/api/facturation/paiements', authenticateToken, requirePermission('page', 'facturation', 'edit'), savePaiement);
  app.delete('/api/facturation/paiements/:facture_id/:id', authenticateToken, requirePermission('page', 'facturation', 'edit'), deletePaiement);

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
  app.delete('/api/scheduling/learning-curves/:id', authenticateToken, requirePermission('page', 'planning', 'edit'), deleteLearningCurve);
  app.get('/api/scheduling/crisis-alerts', authenticateToken, requirePermission('page', 'planning', 'view'), getCrisisAlerts);
  app.post('/api/scheduling/crisis-alerts', authenticateToken, requirePermission('page', 'planning', 'edit'), saveCrisisAlert);
  app.put('/api/scheduling/crisis-alerts/:id', authenticateToken, requirePermission('page', 'planning', 'edit'), updateCrisisAlert);
  app.post('/api/scheduling/update-cr', authenticateToken, requirePermission('page', 'planning', 'edit'), updateAllCR);

  // Chrono Sessions — Séances de chronométrage
  app.get('/api/chrono/sessions', authenticateToken, requirePermission('page', 'ingenierie', 'view'), getChronoSessions);
  app.post('/api/chrono/sessions', authenticateToken, requirePermission('page', 'ingenierie', 'edit'), createChronoSession);
  app.put('/api/chrono/sessions/:id', authenticateToken, requirePermission('page', 'ingenierie', 'edit'), updateChronoSession);
  app.delete('/api/chrono/sessions/:id', authenticateToken, requirePermission('page', 'ingenierie', 'edit'), deleteChronoSession);
  app.post('/api/chrono/sessions/batch', authenticateToken, requirePermission('page', 'ingenierie', 'edit'), batchSaveChronoSessions);

  // Catalogue de Temps
  app.get('/api/catalog/entries', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'view'), getCatalogEntries);
  app.post('/api/catalog/sync', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'edit'), syncCatalog);
  app.put('/api/catalog/:id', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'edit'), updateCatalogEntry);
  app.put('/api/catalog/:id/pin', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'edit'), pinCatalogEntry);
  app.post('/api/catalog/:id/confirm', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'edit'), confirmCatalogEntry);
  app.delete('/api/catalog/:id', authenticateToken, requirePermission('page', ['catalogueTemps', 'catalogTemps'], 'edit'), deleteCatalogEntry);

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

  // Toute requête /api non gérée ci-dessus : JSON 404 (évite que Vite ou express.static renvoient du HTML → erreur « Unexpected token '<' » côté client).
  app.use('/api', (req, res) => {
    res.status(404).json({
      message: 'Endpoint API inconnu ou méthode HTTP non prise en charge. Vérifiez la version du serveur (redémarrage après mise à jour).',
      method: req.method,
      path: req.originalUrl,
    });
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
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

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
        void startSupabaseRealtime();
        resolve();
      });
    };
    tryListen(PORT);
  });
}

startServer();
