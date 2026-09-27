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

  /**
   * Glisser plusieurs traces PLT numerotes hors de l'application (vers Optitex,
   * un dossier Windows...), comme une selection de fichiers dans l'Explorateur.
   * Le navigateur ne sait en glisser qu'un ; ici le processus principal les
   * ecrit dans un dossier temporaire et lance le glisser du systeme.
   * A appeler depuis un `dragstart` apres `preventDefault()`.
   */
  glisserTraces: (fichiers: { nom: string; octets: Uint8Array }[]) => ipcRenderer.send('bera:glisser-traces', fichiers),
});
