import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'vite-plugin-javascript-obfuscator';

/**
 * La liste de TOUT ce que l'application a besoin pour s'ouvrir sans reseau.
 *
 * Le service worker mettait de cote la coquille et les scripts cites dans
 * `index.html` — onze fichiers sur cinquante-sept. Tout le reste (chaque ecran
 * charge en `lazy` : le planning, le magasin, la facturation...) n'arrivait
 * qu'au moment ou on l'ouvrait, donc seulement si le reseau etait la. Couper le
 * Wi-Fi avant d'avoir visite un ecran, et cet ecran n'existait plus : import
 * dynamique en echec, page NOIRE.
 *
 * On ecrit donc la liste complete a la construction, et le worker la precharge
 * d'un bloc. L'atelier peut alors ouvrir n'importe quel ecran hors reseau, y
 * compris un ecran qu'il n'avait jamais ouvert.
 */
const listePrechargement = () => ({
  name: 'bera-liste-prechargement',
  apply: 'build' as const,
  writeBundle(_options: unknown, bundle: Record<string, unknown>) {
    const fichiers = Object.keys(bundle)
      .filter((f) => /\.(js|css)$/.test(f))
      .map((f) => '/' + f);
    // DANS `assets/`, et pas a la racine. Sur Vercel, `vercel.json` reecrit
    // vers index.html tout ce qui ne commence pas par `/assets/` : une liste
    // posee a la racine risquait de revenir en HTML, le worker n'y aurait rien
    // compris, et le prechargement serait retombe en silence sur la coquille
    // seule — c'est-a-dire sur la page noire qu'on vient de corriger.
    fs.writeFileSync(
      path.resolve('dist', 'assets', 'sw-precache.json'),
      JSON.stringify({ genere: Date.now(), fichiers }, null, 2),
    );
    console.log(`  📦 sw-precache.json : ${fichiers.length} fichiers a garder hors ligne`);
  },
});

export default defineConfig(({ mode }) => {
  // base './' uniquement pour le build Electron (fichiers chargés via file://)
  // En mode web (dev Vite + Vercel), on garde '/' pour que le routing absolu fonctionne.
  const isElectronBuild = process.env.ELECTRON_BUILD === 'true';
  const shouldObfuscate = process.env.VITE_OBFUSCATE === 'true';

  return {
    base: isElectronBuild ? './' : '/',
    // « npx vite » / « vite preview » : le port est ≠ 7000 pour laisser **npm run dev** (Express + API) sur 7000.
    // Le proxy envoie /api vers le backend — sans ça, /api renvoie index.html → erreur « HTML au lieu de JSON ».
    server: {
      port: 5173,
      strictPort: false,
      host: '0.0.0.0',
      proxy: {
        '/api': { target: 'http://127.0.0.1:7000', changeOrigin: true },
      },
      watch: {
        // Évite rebuild/HMR en boucle si la DB ou des fichiers temporaires changent souvent
        ignored: [
          '**/database.sqlite*',
          '**/*.sqlite',
          '**/*.sqlite-shm',
          '**/*.sqlite-wal',
          '**/.git/**',
          '**/node_modules/**',
        ],
      }
    },
    preview: {
      port: 4173,
      strictPort: false,
      host: '0.0.0.0',
      proxy: {
        // Même port que `npm run dev:app` (7000). Le 8000 qui traînait ici
        // datait d'avant : `npm run preview` ne trouvait donc aucune API et
        // recevait du HTML à la place du JSON attendu.
        '/api': { target: 'http://127.0.0.1:7000', changeOrigin: true },
      },
    },
    plugins: [
      react(),
      listePrechargement(),
      // Pas d'obfuscation en mode 'static' (Vercel) NI 'electron' (EXE) :
      // l'obfuscation (controlFlowFlattening + deadCodeInjection) casse les
      // imports dynamiques (React.lazy) → "Failed to fetch dynamically imported".
      ...(shouldObfuscate && mode !== 'static' && mode !== 'electron' ? [obfuscator({
        include: ['src/**/*.ts', 'src/**/*.tsx', 'components/**/*.ts', 'components/**/*.tsx', 'App.tsx'],
        exclude: [/node_modules/],
        apply: 'build',
        debugger: false,
        options: {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.4,
          identifierNamesGenerator: 'hexadecimal',
          selfDefending: true,
          stringArray: true,
          stringArrayEncoding: ['base64'],
        }
      })] : [])
    ],
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'framer-motion',
        'lucide-react',
        'recharts',
        'xlsx',
        'react-qr-code'
      ]
    },
    resolve: {
      alias: {
        '@': path.resolve('.'),
      }
    },
    build: {
      chunkSizeWarningLimit: 600,
      sourcemap: false,
      minify: 'esbuild',
      target: 'es2020',
      cssMinify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/context/') || id.includes('\\context\\')) return 'context';
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react')) return 'vendor-react';
            if (id.includes('node_modules/framer-motion')) return 'vendor-animation';
            if (id.includes('node_modules/recharts')) return 'vendor-charts';
            if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
            if (id.includes('node_modules/xlsx')) return 'vendor-xlsx';
            if (id.includes('/node_modules/')) return 'vendor';
          },
        },
      },
      modulePreload: {
        polyfill: false,
      },
    }
  };
});
