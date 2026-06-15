import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'vite-plugin-javascript-obfuscator';

export default defineConfig(({ mode }) => ({
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
      ...(mode !== 'static' ? [obfuscator({
        include: ['src/**/*.ts', 'src/**/*.tsx', 'components/**/*.ts', 'components/**/*.tsx', 'App.tsx'],
        exclude: [/node_modules/],
        apply: 'build',
        debugger: true,
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
    }
  }));