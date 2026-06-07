import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://jiscgwioxwsulaopsivc.supabase.co';
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_KEY as string) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2Nnd2lveHdzdWxhb3BzaXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTcwNTgsImV4cCI6MjA5MTU3MzA1OH0.-jRI1RlbjxecLyN2b83xmjuJCKhs7ti_7_-RWXNCNgk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'beramethode_supabase_session',
    // Désactive le verrou Web Locks de Supabase : un refresh de token bloqué
    // (ex. session périmée en cache) ne doit jamais geler signInWithPassword.
    // On exécute simplement la fonction sans sérialisation cross-onglets.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
});

export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY);
