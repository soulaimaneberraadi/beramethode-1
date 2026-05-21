import 'dotenv/config';
import { shouldUseHelmet } from './server/jwtConfig';
import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { register, login, logout, me, requestPasswordReset, verifyResetCode, resetPassword } from './server/authController';
import { getAllUsers, updateUserRole, deleteUser, isAdmin } from './server/userController';
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
} from './server/magasinController';
import { getSettings, saveSettings } from './server/settingsController';
import { getPlanningEvents, savePlanningEvents, deletePlanningEvent, getReservations, saveReservations, deductReservations, releaseReservations } from './server/planningController';
import {
  getSubcontractOrders,
  createSubcontractOrder,
  updateSubcontractOrder,
  deleteSubcontractOrder
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
} from './server/hrController';
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
import { getDashboardKPIs } from './server/dashboardController';
import { authenticateToken } from './server/middleware';
import { postAnalyzeTextile, postSuggestVocabulary, postGenerateOperations, postOptimizePlanning } from './server/geminiController';
import { supabaseSyncMiddleware, logSupabaseSyncStatus } from './server/supabaseSync';
import { startSupabaseRealtime } from './server/supabaseRealtime';

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '8000', 10);

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

  const isProd = process.env.NODE_ENV === 'production';

  // En dev : pas de plafond global (HMR, proxy Vite, React StrictMode, rafraîchissements → faux positifs 429).
  // En prod : plafond large pour une appli riche (plusieurs modules + boot) sans ouvrir l’abus.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !isProd,
    handler: (_req, res) => {
      res.status(429).json({ message: 'Trop de requêtes. Réessayez dans 15 minutes.' });
    },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !isProd,
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
    skip: () => !isProd,
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
    skip: () => !isProd,
    keyGenerator: (req) => `${req.ip ?? 'unknown'}:${(req.params as { cin?: string }).cin ?? ''}`,
    handler: (_req, res) => {
      res.status(429).json({ message: 'Trop de requêtes. Réessayez plus tard.' });
    },
  });

  const networkInfoLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !isProd,
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());
  app.use('/api/', apiLimiter);
  app.use('/api/auth/', authLimiter);
  app.use(supabaseSyncMiddleware);

  app.post('/api/auth/register', register);
  app.post('/api/auth/login', login);
  app.post('/api/auth/logout', logout);
  app.get('/api/auth/me', me);

  app.post('/api/auth/forgot-password', passwordResetByEmailLimiter, requestPasswordReset);
  app.post('/api/auth/verify-code', passwordResetByEmailLimiter, verifyResetCode);
  app.post('/api/auth/reset-password', resetPassword);

  app.get('/api/models', authenticateToken, getModels);
  app.post('/api/models', authenticateToken, saveModel);
  app.delete('/api/models/:id', authenticateToken, deleteModel);

  app.get('/api/magasin/products', authenticateToken, getMagasinProducts);
  app.post('/api/magasin/products', authenticateToken, saveMagasinProduct);
  app.delete('/api/magasin/products/:id', authenticateToken, deleteMagasinProduct);
  app.get('/api/magasin/lots', authenticateToken, getMagasinLots);
  app.get('/api/magasin/mouvements', authenticateToken, getMagasinMouvements);
  app.put('/api/magasin/mouvements/:id', authenticateToken, updateMagasinMouvement);
  app.delete('/api/magasin/mouvements/:id', authenticateToken, deleteMagasinMouvement);
  app.post('/api/magasin/mvt', authenticateToken, registerMouvement);

  app.get('/api/magasin/commandes', authenticateToken, getMagasinCommandes);
  app.post('/api/magasin/commandes', authenticateToken, saveMagasinCommande);
  app.delete('/api/magasin/commandes/:id', authenticateToken, deleteMagasinCommande);

  app.get('/api/magasin/demandes', authenticateToken, getMagasinDemandes);
  app.post('/api/magasin/demandes', authenticateToken, saveMagasinDemande);
  app.delete('/api/magasin/demandes/:id', authenticateToken, deleteMagasinDemande);

  app.get('/api/magasin/dechets', authenticateToken, getMagasinDechets);
  app.post('/api/magasin/dechets', authenticateToken, saveMagasinDechet);
  app.delete('/api/magasin/dechets/:id', authenticateToken, deleteMagasinDechet);

  app.get('/api/settings', authenticateToken, getSettings);
  app.post('/api/settings', authenticateToken, saveSettings);

  app.get('/api/users', authenticateToken, isAdmin, getAllUsers);
  app.put('/api/users/:id/role', authenticateToken, isAdmin, updateUserRole);
  app.delete('/api/users/:id', authenticateToken, isAdmin, deleteUser);

  app.get('/api/planning', authenticateToken, getPlanningEvents);
  app.post('/api/planning', authenticateToken, savePlanningEvents);
  app.delete('/api/planning/:id', authenticateToken, deletePlanningEvent);

  app.get('/api/planning/reservations/:planningId', authenticateToken, getReservations);
  app.post('/api/planning/reservations/:planningId', authenticateToken, saveReservations);
  app.post('/api/planning/reservations/:planningId/deduct', authenticateToken, deductReservations);
  app.delete('/api/planning/reservations/:planningId', authenticateToken, releaseReservations);

  // Subcontracting Routes
  app.get('/api/subcontract', authenticateToken, getSubcontractOrders);
  app.post('/api/subcontract', authenticateToken, createSubcontractOrder);
  app.put('/api/subcontract/:id', authenticateToken, updateSubcontractOrder);
  app.delete('/api/subcontract/:id', authenticateToken, deleteSubcontractOrder);

  app.get('/api/suivi', authenticateToken, getSuiviData);
  app.post('/api/suivi', authenticateToken, saveSuiviData);
  app.get('/api/suivi/stats', authenticateToken, getSuiviStats);

  app.get('/api/poste-suivi', authenticateToken, getPosteSuivi);
  app.post('/api/poste-suivi', authenticateToken, savePosteSuivi);
  app.delete('/api/poste-suivi/:id', authenticateToken, deletePosteSuivi);

  app.get('/api/demandes-appro', authenticateToken, getDemandesAppro);
  app.post('/api/demandes-appro', authenticateToken, saveDemandesAppro);
  app.put('/api/demandes-appro/:id/statut', authenticateToken, updateDemandeApproStatut);

  // Phase 5 — Effectifs
  app.get('/api/workers', authenticateToken, getWorkers);
  app.post('/api/workers', authenticateToken, saveWorker);
  app.delete('/api/workers/:id', authenticateToken, deleteWorker);
  app.post('/api/workers/bulk-import', authenticateToken, bulkImportWorkers);

  app.get('/api/worker-skills', authenticateToken, getWorkerSkills);
  app.post('/api/worker-skills', authenticateToken, saveWorkerSkill);
  app.delete('/api/worker-skills/:id', authenticateToken, deleteWorkerSkill);
  app.post('/api/worker-skills/auto-update', authenticateToken, updateSkillFromSuivi);

  app.get('/api/worker-pointage', authenticateToken, getPointage);
  app.get('/api/worker-pointage/export', authenticateToken, exportPointageMensuel);
  app.get('/api/worker-pointage/activity', authenticateToken, getWorkerActivity);
  app.post('/api/worker-pointage', authenticateToken, savePointage);
  app.post('/api/worker-pointage/bulk', authenticateToken, bulkSavePointage);
  app.delete('/api/worker-pointage/:id', authenticateToken, deletePointage);

  // Phase 5 — HR Full Module
  app.get('/api/hr/workers', authenticateToken, getHRWorkers);
  app.get('/api/hr/claim-legacy-preview', authenticateToken, getHRClaimPreview);
  app.post('/api/hr/claim-legacy', authenticateToken, postHRClaimFromGuest);
  app.get('/api/hr/workers/:id/dossier', authenticateToken, getHRWorkerDossier);
  app.get('/api/hr/workers/:id', authenticateToken, getHRWorkerById);
  app.post('/api/hr/workers', authenticateToken, saveHRWorker);
  app.post('/api/hr/workers/:id/pin', authenticateToken, postHRWorkerPin);
  app.delete('/api/hr/workers/:id', authenticateToken, deleteHRWorker);

  app.get('/api/hr/pointage', authenticateToken, getHRPointage);
  app.post('/api/hr/pointage', authenticateToken, saveHRPointage);
  app.post('/api/hr/pointage/validate', authenticateToken, validateHRPointage);

  app.get('/api/hr/production', authenticateToken, getHRProduction);
  app.post('/api/hr/production', authenticateToken, saveHRProduction);

  app.get('/api/hr/avances', authenticateToken, getHRAvances);
  app.post('/api/hr/avances', authenticateToken, saveHRAvance);
  app.put('/api/hr/avances/:id/statut', authenticateToken, updateHRAvanceStatut);

  app.get('/api/hr/sage-exports', authenticateToken, getSageExports);
  app.get('/api/hr/sage-preview/:mois', authenticateToken, previewSageExport);
  app.get('/api/hr/sage-export/:mois', authenticateToken, generateSageExport);

  // Section 23 — Identité plateforme + invitations
  app.get('/api/hr/invitations', authenticateToken, getHRInvitations);
  app.post('/api/hr/invitations', authenticateToken, postHRInvitation);
  app.post('/api/hr/invitations/respond', beraouvierPublicLimiter, postHRInvitationRespond);
  app.get('/api/hr/invitations/preview/:token', beraouvierPublicLimiter, getHRInvitationByToken);

  // Phase 6 — Dashboard KPIs
  app.get('/api/dashboard/kpis', authenticateToken, getDashboardKPIs);

  // Phase: Facturation (Achat, Vente, Devis, BL)
  app.get('/api/facturation/factures', authenticateToken, getFactures);
  app.get('/api/facturation/factures/:id', authenticateToken, getFactureById);
  app.post('/api/facturation/factures', authenticateToken, saveFacture);
  app.delete('/api/facturation/factures/:id', authenticateToken, deleteFacture);

  app.get('/api/facturation/bl', authenticateToken, getBonsLivraison);
  app.post('/api/facturation/bl', authenticateToken, saveBonLivraison);
  app.delete('/api/facturation/bl/:id', authenticateToken, deleteBonLivraison);

  app.get('/api/facturation/paiements/:facture_id', authenticateToken, getPaiementsParFacture);
  app.post('/api/facturation/paiements', authenticateToken, savePaiement);
  app.delete('/api/facturation/paiements/:facture_id/:id', authenticateToken, deletePaiement);

  // Gemini / IA — API key server-side only
  app.post('/api/ai/analyze-textile', authenticateToken, postAnalyzeTextile);
  app.post('/api/ai/suggest-vocabulary', authenticateToken, postSuggestVocabulary);
  app.post('/api/ai/generate-operations', authenticateToken, postGenerateOperations);
  app.post('/api/ai/optimize-planning', authenticateToken, postOptimizePlanning);

  // BERAOUVIER — Read-Only (no financial data); rate-limited, minimal fields
  app.get('/api/worker/:cin', beraouvierPublicLimiter, getWorkerByCin);
  app.post('/api/worker/:cin/pin-verify', beraouvierPublicLimiter, postWorkerPinVerify);
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
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
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
      httpServer.listen(port, '0.0.0.0', () => {
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
