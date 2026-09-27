/**
 * electron/main.ts — BERAMETHODE Desktop Entry Point
 *
 * Phase 1.7 + 1.8 + 2 (BERAMETHODE_ARCHITECTURE.md)
 *
 * Responsabilités :
 *  - C1 : génère/lit un JWT_SECRET persistant dans userData/.secret
 *  - Splash screen frameless affiché immédiatement au démarrage
 *  - Fork du serveur Express :
 *      • dev       → tsx server.ts
 *      • packaged  → node dist-server/server.cjs (via resources/)
 *  - Trouve un port libre dynamiquement
 *  - Ouvre BrowserWindow avec preload + contextIsolation
 *  - Poll jusqu'à ce que le serveur soit prêt avant de charger l'URL
 *  - Ferme splash → affiche app une fois le serveur prêt
 *  - Ferme proprement le processus serveur à la fermeture de la fenêtre
 */

import { app, BrowserWindow, Menu, ipcMain, nativeImage } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';
import * as crypto from 'crypto';
import * as child_process from 'child_process';
import * as http from 'http';
import { createRequire } from 'node:module';

// Journal de démarrage dans un emplacement TOUJOURS inscriptible (tmp), pour
// diagnostiquer les échecs de boot de l'EXE empaqueté (pas de console visible).
const STARTUP_LOG = path.join(os.tmpdir(), 'bera-startup.log');
function logBoot(msg: string): void {
  try { fs.appendFileSync(STARTUP_LOG, `[${new Date().toISOString()}] ${msg}\n`); } catch { /* ignore */ }
  console.log(msg);
}

// ─── Édition : BERAMETHODE (par défaut) ou BERACOUPE ────────────────────────
//
// BERACOUPE est produit à partir du MÊME code, empaqueté avec
// electron-builder.coupe.json dont `extraMetadata` pose `beraEdition: "coupe"`
// dans le package.json packagé. En dev, `BERA_EDITION=coupe` (variable
// d'environnement) permet de tester le switch sans empaqueter.
//
// Détecté et figé AVANT app.whenReady() : tout ce qui dépend du nom de l'app
// (app.getPath('userData'), donc la base SQLite + les secrets) doit voir le
// bon nom dès le premier accès.
type Edition = 'beramethode' | 'coupe';

function detectEdition(): Edition {
  if (process.env.BERA_EDITION === 'coupe') return 'coupe';
  if (process.env.BERA_EDITION === 'beramethode') return 'beramethode';
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { beraEdition?: string };
    if (pkg.beraEdition === 'coupe') return 'coupe';
  } catch { /* package.json illisible → édition par défaut */ }
  return 'beramethode';
}

const EDITION: Edition = detectEdition();
const IS_COUPE = EDITION === 'coupe';
const PRODUCT_NAME = IS_COUPE ? 'BERACOUPE' : 'BERAMETHODE';

if (IS_COUPE) {
  // app.setName() AVANT tout app.getPath('userData') (appelé plus bas dans
  // whenReady) → userData devient %APPDATA%\BERACOUPE, séparé de BERAMETHODE.
  app.setName('BERACOUPE');
  // Propagé au serveur Express, en process (packagé) comme en spawn (dev) :
  // server.ts lit BERA_EDITION pour lier 0.0.0.0 + activer les routes LAN.
  process.env.BERA_EDITION = 'coupe';
  // middleware.ts re-signe le cookie de session toutes les 30 min avec
  // secure=true dès NODE_ENV=production (jwtConfig.ts) — casserait les
  // sessions en http sur le LAN de l'atelier. Et pas de sync serveur→Supabase
  // pour cette édition locale-only (supabaseSync.ts / supabaseRealtime.ts).
  // Posés ici, AVANT require du serveur in-process / spawn dev, pour que le
  // bloc `if (key && !process.env[key])` du chargement du .env packagé
  // (plus bas) ne les écrase pas.
  process.env.COOKIE_SECURE = 'false';
  process.env.SUPABASE_SERVER_SYNC = 'false';
}

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

// ─── MASTER_KEY persistant ──────────────────────────────────────────────────

function getOrCreateMasterKey(userDataPath: string): string {
  const keyFile = path.join(userDataPath, '.master_key');
  if (fs.existsSync(keyFile)) {
    const key = fs.readFileSync(keyFile, 'utf8').trim();
    if (key.length >= 32) return key;
  }
  const newKey = crypto.randomBytes(48).toString('base64');
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(keyFile, newKey, { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    console.error('[BERA] Impossible d\'écrire .master_key :', err);
  }
  return newKey;
}

// ─── Port libre ──────────────────────────────────────────────────────────────

function findFreePort(preferred = 7000, host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => {
      // preferred occupé → OS choisit un port libre
      const srv2 = net.createServer();
      srv2.unref();
      srv2.listen(0, host, () => {
        const addr = srv2.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        srv2.close(() => resolve(port));
      });
      srv2.on('error', reject);
    });
    srv.listen(preferred, host, () => {
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

function startExpressServer(port: number, jwtSecret: string, dbPath: string, userDataPath: string): child_process.ChildProcess | null {
  if (app.isPackaged) {
    // Mode production : on lance Express EN PROCESS (même process que le main
    // Electron). Avantages décisifs :
    //  - better-sqlite3 (compilé pour l'ABI Electron) se charge sans conflit ;
    //  - require() résout node_modules depuis l'asar (better-sqlite3 unpacké) ;
    //  - pas de fork (qui relancerait Electron au lieu de Node).
    // Charger le fichier .env depuis l'ASAR pour injecter les variables s'il existe
    const envPath = path.join(app.getAppPath(), '.env');
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const index = trimmed.indexOf('=');
            if (index !== -1) {
              const key = trimmed.substring(0, index).trim();
              const value = trimmed.substring(index + 1).trim().replace(/^['"]|['"]$/g, '');
              if (key && !process.env[key]) {
                process.env[key] = value;
              }
            }
          }
        });
        logBoot('[BERA] Fichier .env charge dans le process package.');
      } catch (err) {
        logBoot(`[BERA] Impossible de charger le fichier .env: ${err}`);
      }
    }

    process.env.JWT_SECRET = jwtSecret;
    process.env.MASTER_KEY = getOrCreateMasterKey(userDataPath);
    process.env.BERA_DB_PATH = dbPath;
    process.env.ELECTRON_MODE = 'true';
    process.env.PORT = String(port);
    process.env.NODE_ENV = 'production';
    // Chemin ABSOLU du build frontend (server.ts sert dist/ via BERA_DIST_PATH).
    process.env.BERA_DIST_PATH = path.join(app.getAppPath(), 'dist');
    const serverEntry = path.join(app.getAppPath(), 'dist-server', 'server.cjs');
    logBoot(`[BERA] require serveur in-process: ${serverEntry}`);
    logBoot(`[BERA] BERA_DIST_PATH=${process.env.BERA_DIST_PATH} | appPath=${app.getAppPath()}`);
    // createRequire → vrai require natif (esbuild ne remplace PAS par son shim
    // "Dynamic require not supported" qui ferait planter le boot).
    const nodeRequire = createRequire(__filename);
    nodeRequire(serverEntry);
    logBoot('[BERA] serveur in-process chargé OK');
    return null;
  }

  // Dev : tsx server.ts (processus séparé)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    JWT_SECRET: jwtSecret,
    MASTER_KEY: getOrCreateMasterKey(userDataPath),
    BERA_DB_PATH: dbPath,
    ELECTRON_MODE: 'true',
    PORT: String(port),
    NODE_ENV: 'development',
  };
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

// ─── Splash screen ───────────────────────────────────────────────────────────

let splashWindow: BrowserWindow | null = null;

function createSplash(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const splashPath = path.join(__dirname, 'splash.html');
  splash.loadFile(splashPath, IS_COUPE ? { query: { edition: 'coupe' } } : undefined);

  return splash;
}

// ─── Fenêtre principale ──────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

/* ------------------------------------------------------------------ */
/* Glisser des traces PLT hors de l'application                         */
/* ------------------------------------------------------------------ */

const DOSSIER_GLISSER = path.join(os.tmpdir(), 'beramethode-traces');

/** Les dossiers de glisser de plus d'un jour ne servent plus : on les retire au demarrage. */
function nettoyerGlisser() {
  try {
    if (!fs.existsSync(DOSSIER_GLISSER)) return;
    const limite = Date.now() - 24 * 3600 * 1000;
    for (const nom of fs.readdirSync(DOSSIER_GLISSER)) {
      const chemin = path.join(DOSSIER_GLISSER, nom);
      try { if (fs.statSync(chemin).mtimeMs < limite) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* en cours d'usage */ }
    }
  } catch { /* rien a nettoyer */ }
}

/**
 * Le renderer envoie les traces numerotes (nom + octets) au debut d'un glisser :
 * on les ecrit dans un dossier temporaire, dans l'ordre recu, puis le systeme
 * les porte comme une selection de fichiers de l'Explorateur.
 */
ipcMain.on('bera:glisser-traces', (event, fichiers: { nom: string; octets: Uint8Array }[]) => {
  try {
    if (!Array.isArray(fichiers) || fichiers.length === 0 || fichiers.length > 1000) return;
    const dossier = path.join(DOSSIER_GLISSER, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    fs.mkdirSync(dossier, { recursive: true });
    const pris = new Set<string>();
    const chemins = fichiers.map((f, i) => {
      let nom = path.basename(String(f?.nom || '')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || `trace-${i + 1}.plt`;
      if (!/\.(plt|hpgl|hgl|prn)$/i.test(nom)) nom += '.plt';
      while (pris.has(nom.toLowerCase())) nom = nom.replace(/(\.[^.]+)$/, `-${i + 1}$1`);
      pris.add(nom.toLowerCase());
      const chemin = path.join(dossier, nom);
      fs.writeFileSync(chemin, Buffer.from(f.octets));
      return chemin;
    });
    const iconePath = path.join(__dirname, IS_COUPE ? 'icon-coupe.png' : 'icon.png');
    let icone = fs.existsSync(iconePath) ? nativeImage.createFromPath(iconePath) : nativeImage.createEmpty();
    if (!icone.isEmpty()) icone = icone.resize({ width: 32, height: 32 });
    event.sender.startDrag({ file: chemins[0], files: chemins, icon: icone });
  } catch (err) {
    console.error('[glisser-traces]', err);
  }
});

async function createWindow(port: number) {
  const preloadPath = path.join(__dirname, 'preload.js');
  const iconFile = process.platform === 'win32'
    ? (IS_COUPE ? 'icon-coupe.ico' : 'icon.ico')
    : (IS_COUPE ? 'icon-coupe.png' : 'icon.png');
  const iconPath = path.join(__dirname, iconFile);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: PRODUCT_NAME,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    // Caché jusqu'à ce que la page soit chargée (évite la flash blanche)
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenu(null);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // DevTools uniquement en développement
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // Fenêtre prête : fermer splash et afficher l'app
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
  mainWindow.show();
  mainWindow.focus();
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Désactiver le menu natif pour un look premium et moderne
  Menu.setApplicationMenu(null);
  nettoyerGlisser();

  // Afficher le splash immédiatement
  splashWindow = createSplash();

  try {
    logBoot(`[BERA] whenReady — packaged=${app.isPackaged} | userData=${app.getPath('userData')}`);
    const userDataPath = app.getPath('userData');
    const jwtSecret = getOrCreateSecret(userDataPath);
    const dbPath = path.join(userDataPath, 'database.sqlite');
    // BERACOUPE écoute sur 0.0.0.0 (atelier en LAN) → on sonde aussi sur
    // 0.0.0.0 pour détecter un conflit de port côté réseau, pas seulement en
    // local. BERAMETHODE reste sondé sur 127.0.0.1 (comportement inchangé).
    const port = await findFreePort(7000, IS_COUPE ? '0.0.0.0' : '127.0.0.1');

    logBoot(`[BERA] Démarrage du serveur sur le port ${port}…`);

    serverProcess = startExpressServer(port, jwtSecret, dbPath, userDataPath);

    // En mode dev (processus séparé) : pipe stdout/stderr pour le débogage.
    // En mode packagé (in-process), serverProcess est null → rien à piper.
    if (serverProcess) {
      serverProcess.stdout?.on('data', (d: Buffer) => process.stdout.write(`[server] ${d}`));
      serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(`[server:err] ${d}`));
      serverProcess.on('exit', (code) => {
        console.warn(`[BERA] Serveur arrêté avec code ${code}`);
      });
    }

    // Attendre que le serveur soit prêt
    await waitForServer(port);
    logBoot(`[BERA] Serveur prêt sur http://127.0.0.1:${port}`);

    // Charger l'app (ferme le splash à l'intérieur)
    await createWindow(port);

    // Initialiser les mises à jour automatiques en production — pas pour
    // BERACOUPE : pas de serveur de publication configuré pour cette édition,
    // checkForUpdatesAndNotify() échouerait (ou pire, tenterait de résoudre
    // la config de publish de BERAMETHODE).
    if (app.isPackaged && !IS_COUPE) {
      logBoot('[BERA] Initialisation de autoUpdater...');
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        logBoot(`[BERA] Erreur autoUpdater: ${err}`);
      });
    }
  } catch (err) {
    logBoot(`[BERA] ERREUR démarrage: ${(err as Error)?.stack || String(err)}`);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
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
