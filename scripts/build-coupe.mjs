// Construit l'installateur BERACOUPE sans toucher au better-sqlite3 du depot.
//
// L'ancien chemin (native-electron.mjs) remplacait le binaire de
// node_modules/better-sqlite3 par celui d'Electron : impossible tant que le
// serveur local (port 7000) le tient ouvert (EBUSY sous Windows), et casse
// ensuite `npm run dev:app`. Ici on prepare un dossier de travail a part, avec
// SA copie du module, passee a l'ABI Electron, et electron-builder part de la.
//
//   node scripts/build-coupe.mjs            (ou npm run electron:build:coupe)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const racine = process.cwd();
const scene = path.join(os.tmpdir(), 'beracoupe-build');
const lance = (cmd, cwd = racine) => { console.log(`\n> ${cmd}`); execSync(cmd, { cwd, stdio: 'inherit' }); };

// 1. Bundles : serveur + Electron (tsup), interface en edition coupe (vite).
lance('npx tsup');
lance('npx vite build --mode coupe');

// 2. Dossier de travail propre.
rmSync(scene, { recursive: true, force: true });
mkdirSync(path.join(scene, 'node_modules'), { recursive: true });
mkdirSync(path.join(scene, 'electron'), { recursive: true });
mkdirSync(path.join(scene, 'build'), { recursive: true });
for (const d of ['dist', 'dist-server']) cpSync(path.join(racine, d), path.join(scene, d), { recursive: true });
for (const f of ['main.js', 'preload.js', 'splash.html', 'icon-coupe.ico', 'icon-coupe.png', 'icon.ico', 'icon.png']) {
    const src = path.join(racine, 'electron', f);
    if (existsSync(src)) cpSync(src, path.join(scene, 'electron', f));
}
for (const f of ['icon-coupe.ico', 'license-coupe.txt']) cpSync(path.join(racine, 'build', f), path.join(scene, 'build', f));
// Seul module natif hors du bundle serveur : better-sqlite3 (+ ses deux dependances).
for (const m of ['better-sqlite3', 'bindings', 'file-uri-to-path']) {
    cpSync(path.join(racine, 'node_modules', m), path.join(scene, 'node_modules', m), { recursive: true });
}

// 3. package.json minimal + config (chemins relatifs au dossier de travail).
const pkg = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(readFileSync(path.join(racine, 'node_modules/electron/package.json'), 'utf8')).version;
writeFileSync(path.join(scene, 'package.json'), JSON.stringify({
    name: 'beracoupe', productName: 'BERACOUPE', version: pkg.version,
    description: 'BERACOUPE — la salle de coupe, issue de BERAMETHODE', author: 'Soulaimane Berraadi',
    main: 'electron/main.js', beraEdition: 'coupe',
    dependencies: { 'better-sqlite3': pkg.dependencies['better-sqlite3'] },
}, null, 2));
const config = JSON.parse(readFileSync(path.join(racine, 'electron-builder.coupe.json'), 'utf8'));
config.electronVersion = electronVersion;
writeFileSync(path.join(scene, 'electron-builder.coupe.json'), JSON.stringify(config, null, 2));

// 4. better-sqlite3 de la copie -> ABI Electron (prebuild, aucune compilation).
lance(`npx --prefix "${racine}" prebuild-install -r electron -t ${electronVersion} --arch x64`, path.join(scene, 'node_modules', 'better-sqlite3'));

// 5. Installateur.
lance(`node "${path.join(racine, 'node_modules/electron-builder/cli.js')}" --win --projectDir "${scene}" --config "${path.join(scene, 'electron-builder.coupe.json')}"`);
console.log(`\nBERACOUPE pret dans ${config.directories.output}`);
