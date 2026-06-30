/**
 * electron/preload.ts — BERAMETHODE Preload Script
 *
 * Exécuté dans le contexte du renderer AVANT que la page se charge.
 * contextIsolation: true → on expose uniquement ce qui est nécessaire via contextBridge.
 * nodeIntegration: false → le renderer n'a pas accès direct à Node.js.
 *
 * Phase 1.7 — minimal : expose uniquement la version de l'app.
 * Phase 2+ : exposer des canaux IPC sécurisés (ex: mise à jour, chemin DB, etc.)
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('beraElectron', {
  /** Version de l'application (injectée depuis package.json via electron-builder) */
  version: process.env.npm_package_version ?? '1.0.0',

  /** Indique qu'on est dans le contexte Electron Desktop */
  isDesktop: true,

  /** Platform : 'win32' | 'darwin' | 'linux' */
  platform: process.platform,
});
