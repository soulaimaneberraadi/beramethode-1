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
    // Bundler TOUT (express + ses deps transitives, helmet, supabase…) DANS
    // server.cjs → l'EXE ne dépend plus de node_modules (electron-builder élague
    // parfois des deps transitives → "Cannot find module 'call-bind-apply-helpers'").
    // Exceptions :
    //  - better-sqlite3 : addon natif (.node), résolu depuis l'asar (unpacké) ;
    //  - electron / vite : non requis côté serveur en production.
    external: ['better-sqlite3', 'electron', 'vite'],
    // Bundler tout SAUF les 3 ci-dessus. NB: dans tsup, noExternal l'emporte sur
    // external — donc on EXCLUT explicitement better-sqlite3/electron/vite du
    // noExternal (sinon better-sqlite3 natif serait bundlé → bindings introuvable).
    noExternal: [/^(?!better-sqlite3|electron|vite)/],
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
