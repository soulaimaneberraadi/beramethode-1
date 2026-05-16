import 'dotenv/config';
import express from 'express';
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
import { getPlanningEvents, savePlanningEvents, deletePlanningEvent } from './server/planningController';
import { getSuiviData, saveSuiviData, getSuiviStats } from './server/suiviController';
import { getPosteSuivi, savePosteSuivi, deletePosteSuivi } from './server/posteSuiviController';
import { getDemandesAppro, saveDemandesAppro, updateDemandeApproStatut } from './server/demandesApproController';
import { getWorkers, saveWorker, deleteWorker, bulkImportWorkers } from './server/workersController';
import { getWorkerSkills, saveWorkerSkill, deleteWorkerSkill, updateSkillFromSuivi } from './server/workerSkillsController';
import { getPointage, savePointage, bulkSavePointage, deletePointage, getWorkerActivity } from './server/workerPointageController';
import {
  getHRWorkers, getHRWorkerById, saveHRWorker, deleteHRWorker,
  getHRPointage, saveHRPointage, validateHRPointage,
  getHRProduction, saveHRProduction,
  getHRAvances, saveHRAvance, updateHRAvanceStatut,
  getWorkerByCin, getWorkerPointageToday, getWorkerProductionToday,
} from './server/hrController';
import { getSageExports, generateSageExport, previewSageExport } from './server/hrSageController';
import { getDashboardKPIs } from './server/dashboardController';
import { authenticateToken } from './server/middleware';

async function startServer() {
  const app = express();
  const PORT = 8000;

  if (process.env.NODE_ENV === 'production') {
    app.use(helmet());
  }

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ message: 'Trop de requêtes. Réessayez dans 15 minutes.' });
    },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,  // 50 tentatives par 15 min (suffisant pour les tests)
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ message: 'Trop de tentatives de connexion. Attendez 15 minutes.' });
    },
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());
  app.use('/api/', apiLimiter);
  app.use('/api/auth/', authLimiter);

  app.post('/api/auth/register', register);
  app.post('/api/auth/login', login);
  app.post('/api/auth/logout', logout);
  app.get('/api/auth/me', me);

  app.post('/api/auth/forgot-password', requestPasswordReset);
  app.post('/api/auth/verify-code', verifyResetCode);
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

  app.get('/api/users', isAdmin, getAllUsers);
  app.put('/api/users/:id/role', isAdmin, updateUserRole);
  app.delete('/api/users/:id', isAdmin, deleteUser);

  app.get('/api/planning', authenticateToken, getPlanningEvents);
  app.post('/api/planning', authenticateToken, savePlanningEvents);
  app.delete('/api/planning/:id', authenticateToken, deletePlanningEvent);

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
  app.post('/api/worker-pointage', authenticateToken, savePointage);
  app.post('/api/worker-pointage/bulk', authenticateToken, bulkSavePointage);
  app.delete('/api/worker-pointage/:id', authenticateToken, deletePointage);
  app.get('/api/worker-pointage/activity', authenticateToken, getWorkerActivity);

  // Phase 5 — HR Full Module
  app.get('/api/hr/workers', authenticateToken, getHRWorkers);
  app.get('/api/hr/workers/:id', authenticateToken, getHRWorkerById);
  app.post('/api/hr/workers', authenticateToken, saveHRWorker);
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

  // Phase 6 — Dashboard KPIs
  app.get('/api/dashboard/kpis', authenticateToken, getDashboardKPIs);

  // BERAOUVIER — Read-Only (no financial data)
  app.get('/api/worker/:cin', getWorkerByCin);
  app.get('/api/worker/:cin/pointage', getWorkerPointageToday);
  app.get('/api/worker/:cin/production', getWorkerProductionToday);

  // BERAOUVIER standalone app
  app.get('/beraouvier', (_req, res) => res.sendFile('public/beraouvier.html', { root: process.cwd() }));

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
  app.get('/api/network-info', (_req, res) => {
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    const nets = os.networkInterfaces();
    console.log(`\n  🟢 BERAMETHODE Server running`);
    console.log(`  ├─ Local:   http://localhost:${PORT}`);
    for (const iface of Object.values(nets)) {
      if (!iface) continue;
      for (const net of iface) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  ├─ Network: http://${net.address}:${PORT}`);
        }
      }
    }
    console.log(`  └─ Mode:    ${process.env.NODE_ENV || 'development'}\n`);
  });
}

startServer();
