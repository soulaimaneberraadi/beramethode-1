/**
 * electron/main.ts — BERAMETHODE Desktop Entry Point
 *
 * Phase 1.7 + 1.8 (BERAMETHODE_ARCHITECTURE.md)
 *
 * Responsabilités :
 *  - C1 : génère/lit un JWT_SECRET persistant dans userData/.secret
 *  - Fork du serveur Express (server.ts via tsx en dev, build tsup en prod — TODO Phase 2)
 *  - Trouve un port libre dynamiquement
 *  - Ouvre BrowserWindow avec preload + contextIsolation
 *  - Poll jusqu'à ce que le serveur soit prêt avant de charger l'URL
 *  - Ferme proprement le processus serveur à la fermeture de la fenêtre
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import * as crypto from 'crypto';
import * as child_process from 'child_process';
import * as http from 'http';

// ─── C1 : JWT_SECRET persistant ─────────────────────────────────────────────

function getOrCreateSecret(userDataPath: string): string {
  const secretFile = path.join(userDataPath, '.secret');
  if (fs.existsSync(secretFile)) {
    const secret = fs.readFileSync(secretFile, 'utf8').trim();
    if (secret.length >= 32) return secret;
  }
  // Génère un secret fort (48 octets → 64 chars base64)
  const newSecret = crypto.randomBytes(48).toString('base64');
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(secretFile, newSecret, { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    console.error('[BERA] Impossible d\'écrire .secret :', err);
  }
  return newSecret;
}

// ─── Port libre ──────────────────────────────────────────────────────────────

function findFreePort(preferred = 7000): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => {
      // preferred occupé → OS choisit un port libre
      const srv2 = net.createServer();
      srv2.unref();
      srv2.listen(0, '127.0.0.1', () => {
        const addr = srv2.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        srv2.close(() => resolve(port));
      });
      srv2.on('error', reject);
    });
    srv.listen(preferred, '127.0.0.1', () => {
      srv.close(() => resolve(preferred));
    });
  });
}

// ─── Poll : attendre que le serveur réponde ──────────────────────────────────

function waitForServer(port: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function attempt() {
      const req = http.get(`http://127.0.0.1:${port}/api/setup/status`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`[BERA] Serveur introuvable sur port ${port} après ${timeoutMs}ms`));
          return;
        }
        setTimeout(attempt, 500);
      });
      req.setTimeout(1000, () => req.destroy());
    }
    attempt();
  });
}

// ─── Processus serveur ───────────────────────────────────────────────────────

let serverProcess: child_process.ChildProcess | null = null;

function startExpressServer(port: number, jwtSecret: string, dbPath: string): child_process.ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    JWT_SECRET: jwtSecret,
    BERA_DB_PATH: dbPath,
    ELECTRON_MODE: 'true',
    PORT: String(port),
    NODE_ENV: app.isPackaged ? 'production' : 'development',
  };

  if (app.isPackaged) {
    // TODO Phase 2 : utiliser le build tsup (server.cjs dans resources/)
    // const serverEntry = path.join(process.resourcesPath, 'server', 'server.cjs');
    // return child_process.fork(serverEntry, [], { env, silent: true });
    console.warn('[BERA] Mode packagé non encore implémenté (Phase 2). Utilisation de tsx en fallback.');
  }

  // Dev (et fallback prod temporaire) : tsx server.ts
  const tsxBin = path.join(
    app.getAppPath(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
  );
  const serverEntry = path.join(app.getAppPath(), 'server.ts');

  return child_process.spawn(tsxBin, [serverEntry], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
}

// ─── Fenêtre principale ──────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

async function createWindow(port: number) {
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'BERAMETHODE',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // DevTools uniquement en développement
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    const userDataPath = app.getPath('userData');
    const jwtSecret = getOrCreateSecret(userDataPath);
    const dbPath = path.join(userDataPath, 'database.sqlite');
    const port = await findFreePort(7000);

    console.log(`[BERA] Démarrage du serveur sur le port ${port}…`);

    serverProcess = startExpressServer(port, jwtSecret, dbPath);

    // Pipe stdout/stderr pour le débogage
    serverProcess.stdout?.on('data', (d: Buffer) => process.stdout.write(`[server] ${d}`));
    serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(`[server:err] ${d}`));

    serverProcess.on('exit', (code) => {
      console.warn(`[BERA] Serveur arrêté avec code ${code}`);
    });

    // Attendre que le serveur soit prêt
    await waitForServer(port);
    console.log(`[BERA] Serveur prêt sur http://127.0.0.1:${port}`);

    await createWindow(port);
  } catch (err) {
    console.error('[BERA] Erreur au démarrage :', err);
    app.quit();
  }
});

// ─── Fermeture propre ────────────────────────────────────────────────────────

app.on('window-all-closed', () => {
  if (serverProcess && !serverProcess.killed) {
    console.log('[BERA] Arrêt du serveur Express…');
    serverProcess.kill('SIGTERM');
    // Forcer le kill après 3 secondes
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }, 3000);
  }
  // Sur macOS on ne quitte pas l'app à la fermeture des fenêtres (convention)
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  // macOS : recréer la fenêtre si l'app est activée sans fenêtre ouverte
  if (mainWindow === null && serverProcess) {
    // Retrouver le port depuis l'env du processus serveur
    const port = parseInt(String(serverProcess.spawnargs.find((_, i, arr) =>
      arr[i - 1] === 'PORT'
    ) || process.env.PORT || '7000'), 10);
    await createWindow(port);
  }
});
