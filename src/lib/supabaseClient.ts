import { createClient } from '@supabase/supabase-js';
import { libererDeLaPlace, signalerStockagePlein } from '../../lib/stockageLocal';

/**
 * Le stockage du jeton de session, avec une place garantie.
 *
 * `localStorage` plafonne autour de 5 Mo sur téléphone, et les photos des
 * modèles l'occupent presque entièrement. Quand il déborde, `setItem` lève —
 * y compris pour les quelques kilo-octets du jeton, que le client réécrit à
 * chaque rotation (toutes les heures environ). Le jeton renouvelé n'était alors
 * enregistré nulle part, et l'ouverture suivante ramenait l'écran de connexion.
 *
 * Ici, un refus n'est pas une fatalité : on sacrifie des vignettes — présentes
 * dans le cloud, et que le prochain envoi rendra — pour garder la session.
 * L'adaptateur ne lève jamais : au pire il prévient l'interface.
 */
const stockageSession = {
  getItem: (cle: string): string | null => {
    try { return localStorage.getItem(cle); } catch { return null; }
  },
  setItem: (cle: string, valeur: string): void => {
    try {
      localStorage.setItem(cle, valeur);
    } catch (e) {
      if (!libererDeLaPlace()) { signalerStockagePlein(cle, e); return; }
      try { localStorage.setItem(cle, valeur); } catch (e2) { signalerStockagePlein(cle, e2); }
    }
  },
  removeItem: (cle: string): void => {
    try { localStorage.removeItem(cle); } catch { /* ignore */ }
  },
};

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://utrojjhscyatppgcszrt.supabase.co';
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_KEY as string) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cm9qamhzY3lhdHBwZ2NzenJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjUwNDEsImV4cCI6MjA5NzIwMTA0MX0.Nu6MQJe6YTN-TH7kBLHqStaFSrvXpuGuzr6wp28XFlk';

export { SUPABASE_URL, SUPABASE_KEY as SUPABASE_ANON_KEY };

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'beramethode_supabase_session',
    // Voir `stockageSession` : la session passe avant les vignettes.
    storage: stockageSession,
    // Désactive le verrou Web Locks de Supabase : un refresh de token bloqué
    // (ex. session périmée en cache) ne doit jamais geler signInWithPassword.
    // On exécute simplement la fonction sans sérialisation cross-onglets.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
  realtime: {
    // Backoff de reconnexion progressif plafonné à 5 min. Le défaut du client
    // (`[1,2,5,10]s`, plafond 10 s) martèle toutes les 10 s lors d'une panne
    // prolongée (ex. projet restreint 402) → des dizaines de milliers de
    // tentatives WebSocket et autant de lignes de console (≈50 000 observées),
    // plus des handshakes d'egress inutiles. Ici : 2,4,8,16,32,64s… → 5 min max.
    reconnectAfterMs: (tries: number) => Math.min(1000 * 2 ** tries, 5 * 60 * 1000),
  },
});

export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY);
