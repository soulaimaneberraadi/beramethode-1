import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './App';
import { AuthProvider } from './src/context/AuthContext';
import { LicenseProvider } from './src/context/LicenseContext';
import { PermissionsProvider } from './src/context/PermissionsContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClickToComponent } from 'click-to-react-component';
import { installApiShim } from './src/lib/apiShim';
import { apiOrigine, installerRedirectionApi } from './src/lib/apiOrigin';
import { APP_VERSION } from './src/lib/dataVersion';
import { initDiagnostics } from './src/lib/diagnostics';

// Capture des breadcrumbs (console + erreurs) le plus tôt possible, pour les
// joindre aux réclamations en cas de bug.
initDiagnostics();

// Une API distante est configurée : les /api/* partent vers ce serveur, avec
// les cookies. Elle prime sur le mode statique — un vrai serveur répond mieux
// qu'un instantané localStorage.
installerRedirectionApi();

// En static mode (Vercel) SANS API distante, on intercepte les /api/* pour les
// servir depuis le snapshot cloud localStorage. Aucun serveur backend requis.
if (import.meta.env.VITE_STATIC_MODE === 'true' && !apiOrigine) {
  installApiShim();
  console.log(`%cBERAMETHODE ${APP_VERSION} (static + Supabase sync)`, 'color:#10b981;font-weight:bold');
}

// Register service worker for offline support (production only)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed — app works anyway
    });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <ErrorBoundary>
    <AuthProvider>
      <LicenseProvider>
        <PermissionsProvider>
          <ThemeProvider>
            <LanguageProvider>
              <App />
              <ClickToComponent />
            </LanguageProvider>
          </ThemeProvider>
        </PermissionsProvider>
      </LicenseProvider>
    </AuthProvider>
  </ErrorBoundary>
);
