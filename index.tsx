import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './src/context/AuthContext';
import { LicenseProvider } from './src/context/LicenseContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClickToComponent } from 'click-to-react-component';
import { installApiShim } from './src/lib/apiShim';
import { APP_VERSION } from './src/lib/dataVersion';
import { initDiagnostics } from './src/lib/diagnostics';

// Capture des breadcrumbs (console + erreurs) le plus tôt possible, pour les
// joindre aux réclamations en cas de bug.
initDiagnostics();

// En static mode (Vercel), on intercepte les /api/* pour les servir depuis
// le snapshot cloud localStorage. Aucun serveur backend n'est requis.
if (import.meta.env.VITE_STATIC_MODE === 'true') {
  installApiShim();
  console.log(`%cBERAMETHODE ${APP_VERSION} (static + Supabase sync)`, 'color:#10b981;font-weight:bold');
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
        <App />
        <ClickToComponent />
      </LicenseProvider>
    </AuthProvider>
  </ErrorBoundary>
);
