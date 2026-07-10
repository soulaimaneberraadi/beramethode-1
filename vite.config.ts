import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'vite-plugin-javascript-obfuscator';

export default defineConfig(({ mode }) => {
  // base './' uniquement pour le build Electron (fichiers chargés via file://)
  // En mode web (dev Vite + Vercel), on garde '/' pour que le routing absolu fonctionne.
  const isElectronBuild = process.env.ELECTRON_BUILD === 'true';

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
        '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      },
    },
    plugins: [
      react(),
      // Pas d'obfuscation en mode 'static' (Vercel) NI 'electron' (EXE) :
      // l'obfuscation (controlFlowFlattening + deadCodeInjection) casse les
      // imports dynamiques (React.lazy) → "Failed to fetch dynamically imported".
      ...(mode !== 'static' && mode !== 'electron' ? [obfuscator({
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
