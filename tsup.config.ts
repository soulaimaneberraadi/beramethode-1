import { defineConfig } from 'tsup';

// Deux bundles :
//  1) le backend Express → dist-server/server.cjs (lancé par electron/main en prod)
//  2) l'entrée Electron + preload → electron/main.js, electron/preload.js
//     (electron-builder attend electron/main.js comme "main" du package.json)
export default defineConfig([
  {
    entry: { server: 'server.ts' },
    outDir: 'dist-server',
    format: ['cjs'],
    target: 'node20',
    platform: 'node',
    bundle: true,
    sourcemap: false,
    minify: false,
    clean: false,
    // better-sqlite3 = addon natif (.node) → reste dans node_modules (asarUnpack)
    external: ['better-sqlite3', 'electron'],
    // main.ts référence dist-server/server.cjs → forcer l'extension .cjs
    outExtension: () => ({ js: '.cjs' }),
  },
  {
    entry: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
    outDir: 'electron',
    format: ['cjs'],
    target: 'node20',
    platform: 'node',
    bundle: true,
    sourcemap: false,
    minify: false,
    // NE PAS nettoyer electron/ (contient splash.html, build/, les sources .ts)
    clean: false,
    external: ['electron'],
    outExtension: () => ({ js: '.js' }),
  },
]);
