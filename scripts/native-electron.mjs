// Place better-sqlite3 sur le BON ABI Electron AVANT de packager l'EXE.
//
// Contexte : la machine tourne sous Node (ex. v24 = ABI 137) mais Electron 33
// utilise l'ABI 130. Sans MSVC on ne peut pas compiler → on télécharge le
// PREBUILD Electron de better-sqlite3 (aucune compilation requise).
// electron-builder est en `npmRebuild:false` → il ne réécrase pas ce binaire.
//
// ⚠️ Après un build EXE, better-sqlite3 est en ABI Electron → `npm run dev:app`
//    (Node) échouera. Pour revenir au dev : `npm rebuild better-sqlite3`.
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

const electronVersion = JSON.parse(
  readFileSync('node_modules/electron/package.json', 'utf8'),
).version;
const bsDir = path.resolve('node_modules/better-sqlite3');

console.log(`[native] better-sqlite3 → prebuild Electron ${electronVersion} (x64)…`);
execSync(`npx prebuild-install -r electron -t ${electronVersion} --arch x64`, {
  cwd: bsDir,
  stdio: 'inherit',
});
console.log('[native] OK — better-sqlite3 prêt pour Electron.');
