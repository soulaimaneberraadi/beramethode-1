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
import { installerEnteteAppareil } from './src/lib/deviceId';
import { APP_VERSION } from './src/lib/dataVersion';
import { initDiagnostics } from './src/lib/diagnostics';
import { demarrerRelaisPlantages } from './src/lib/crashRelay';

// Capture des breadcrumbs (console + erreurs) le plus tôt possible, pour les
// joindre aux réclamations en cas de bug.
initDiagnostics();

// Reprend l'envoi des plantages mis en file pendant une coupure réseau : le
// programme tourne en local, un rapport peut attendre des heures avant de
// pouvoir sortir.
demarrerRelaisPlantages();

// Une API distante est configurée : les /api/* partent vers ce serveur, avec
// les cookies. Elle prime sur le mode statique — un vrai serveur répond mieux
// qu'un instantané localStorage.
installerRedirectionApi();

// Marque chaque appel avec l'identifiant de CET appareil. Posé APRÈS la
// redirection : l'enveloppe la plus récente s'exécute en premier, et il faut
// voir l'adresse encore relative (`/api/...`) pour reconnaître nos routes —
// une fois réécrite vers un serveur distant, elle ne s'en distingue plus.
installerEnteteAppareil();

// En static mode (Vercel) SANS API distante, on intercepte les /api/* pour les
// servir depuis le snapshot cloud localStorage. Aucun serveur backend requis.
if (import.meta.env.VITE_STATIC_MODE === 'true' && !apiOrigine) {
  installApiShim();
  console.log(`%cBERAMETHODE ${APP_VERSION} (static + Supabase sync)`, 'color:#10b981;font-weight:bold');
}

/**
 * Sortie de secours : `?sw=reset` desinstalle le service worker et vide ses
 * caches, puis recharge.
 *
 * Un service worker fautif peut rendre le site impossible a ouvrir, et la seule
 * reparation connue passait alors par les reglages d'iOS — inaccessible a
 * quelqu'un qui est devant sa machine a coudre. Une adresse a taper suffit
 * desormais. La reparation vaut aussi quand le worker est sain : elle ne
 * detruit que des copies, jamais des donnees (les modeles, les photos et les
 * reglages vivent dans localStorage et IndexedDB, auxquels on ne touche pas).
 */
const reinitialiserServiceWorker = async (): Promise<void> => {
  try {
    if ('serviceWorker' in navigator) {
      const enregistrements = await navigator.serviceWorker.getRegistrations();
      await Promise.all(enregistrements.map(r => r.unregister().catch(() => false)));
    }
    if (typeof caches !== 'undefined') {
      const noms = await caches.keys();
      await Promise.all(noms.map(n => caches.delete(n).catch(() => false)));
    }
  } catch { /* on recharge quand meme : au pire rien n'a change */ }
  const propre = new URL(window.location.href);
  propre.searchParams.delete('sw');
  window.location.replace(propre.toString());
};

if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sw') === 'reset') {
  void reinitialiserServiceWorker();
}

// Register service worker for offline support (production only)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // `updateViaCache: 'none'` : sans lui, Safari peut servir `/sw.js` depuis
    // son cache HTTP pendant 24 h. Un correctif du worker — y compris un
    // correctif qui repare un worker cassé — mettrait donc jusqu'a une journee
    // a atteindre l'appareil. On force la relecture, et on demande en plus une
    // verification de mise a jour a chaque demarrage.
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(enregistrement => { void enregistrement.update().catch(() => undefined); })
      .catch(() => {
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
