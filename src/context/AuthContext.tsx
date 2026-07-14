import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { startCloudSync, stopCloudSync, pullSnapshotFromCloud, pushSnapshotToCloud, ensureLocalDataOwner, clearLocalAppData, isCloudSyncUserId } from '../lib/cloudSync';

interface User {
  id: number | string;
  cloudUserId?: string | null;
  email: string;
  name: string;
  role: 'user' | 'admin';
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  loading: boolean;
  staticLogin?: (email: string, password: string) => Promise<{ ok: boolean; user?: User; message?: string }>;
  signup?: (email: string, password: string, name?: string) => Promise<{ ok: boolean; user?: User; message?: string; requiresConfirmation?: boolean }>;
  signInWithGoogle?: () => Promise<{ ok: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

/**
 * Borne le temps d'attente d'une promesse. Si Supabase Auth est lent ou
 * injoignable (ex. 522 Cloudflare, service en panne), la requête de connexion
 * peut rester en attente indéfiniment et figer le bouton « Sign in ».
 * On rejette après `ms` pour rendre la main à l'utilisateur avec un message clair.
 */
class TimeoutError extends Error {
  constructor() {
    super('timeout');
    this.name = 'TimeoutError';
  }
}
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new TimeoutError()), ms)),
  ]);

const mapSupabaseUser = (su: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null): User | null => {
  if (!su || !su.email) return null;
  const meta = su.user_metadata || {};
  const name = (meta.name as string) || (meta.full_name as string) || su.email.split('@')[0];
  const role: 'user' | 'admin' = (meta.role as 'user' | 'admin') || (su.email === 'soulaimaneberraadi@gmail.com' ? 'admin' : 'user');
  return { id: su.id, email: su.email, name, role };
};

const oauthRedirectUrl = (): string =>
  typeof window === 'undefined'
    ? ''
    : `${window.location.origin}${window.location.pathname}`;

const loginLocalServerWithSupabaseSession = async (): Promise<User | null> => {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.access_token) return null;

  const res = await fetch('/api/auth/supabase-session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    }),
  });

  if (!res.ok) return null;
  const payload = await res.json().catch(() => null) as { user?: User } | null;
  return payload?.user || null;
};

const getSupabaseCloudUserId = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
};

const cloudOwnerFor = async (userData: Pick<User, 'id' | 'cloudUserId'>): Promise<string> => {
  if (userData.cloudUserId && isCloudSyncUserId(userData.cloudUserId)) return userData.cloudUserId;
  const cloudId = await getSupabaseCloudUserId().catch(() => null);
  return cloudId || String(userData.id);
};

const activateLocalDataOwner = async (userData: Pick<User, 'id' | 'cloudUserId'>): Promise<void> => {
  const ownerId = await cloudOwnerFor(userData);
  ensureLocalDataOwner(ownerId);
  if (isCloudSyncUserId(ownerId)) {
    await pullSnapshotFromCloud(ownerId).catch(() => {});
    startCloudSync(ownerId);
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!IS_STATIC) {
      // Legacy backend auth
      const checkAuth = async () => {
        try {
          let res = await fetch('/api/auth/me', { credentials: 'include' });

          // Auto-login LOCAL uniquement (confort dev). Piloté par .env.local, qui est
          // gitignoré et N'EST JAMAIS présent dans le build Vercel → la page de login
          // y reste intacte. Ne s'active que sur localhost ET si le flag est posé.
          // Si l'utilisateur vient de se déconnecter (flag dans localStorage), on n'auto-login pas.
          const env = import.meta.env as any;
          const justLoggedOut = typeof window !== 'undefined' && sessionStorage.getItem('bera_just_logged_out') === '1';
          if (justLoggedOut) {
            try { sessionStorage.removeItem('bera_just_logged_out'); } catch {}
          }
          if (!res.ok
              && !justLoggedOut
              && env.VITE_DEV_AUTOLOGIN === '1'
              && env.VITE_DEV_AUTOLOGIN_EMAIL
              && env.VITE_DEV_AUTOLOGIN_PASSWORD
              && typeof window !== 'undefined'
              && window.location.hostname === 'localhost') {
            try {
              const loginRes = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: env.VITE_DEV_AUTOLOGIN_EMAIL,
                  password: env.VITE_DEV_AUTOLOGIN_PASSWORD,
                }),
              });
              if (loginRes.ok) {
                res = await fetch('/api/auth/me', { credentials: 'include' });
              }
            } catch { /* auto-login best-effort : on retombe sur l'écran de connexion */ }
          }

          // Après une déconnexion volontaire, ne JAMAIS restaurer la session même
          // si le cookie a survécu (logout serveur en timeout) : sinon le bouton
          // « déconnexion » paraît cassé car le compte se rouvre au reload.
          if (res.ok && !justLoggedOut) {
            const data = await res.json();
            if (data.user?.id != null) await activateLocalDataOwner(data.user);
            setUser(data.user);
          } else if (!justLoggedOut) {
            const bridgedUser = await withTimeout(loginLocalServerWithSupabaseSession(), 10000).catch(() => null);
            if (bridgedUser?.id != null) {
              await activateLocalDataOwner(bridgedUser);
              setUser(bridgedUser);
            }
          }
        } catch (error) {
          console.error('Auth check failed', error);
        } finally {
          setLoading(false);
        }
      };
      checkAuth();
      return;
    }

    // Supabase auth (static mode)  never block loading on cloud sync
    let mounted = true;

    // Garde-fou : si Supabase est injoignable (ex. 522 Cloudflare), getSession()
    // peut ne jamais se résoudre et figer l'écran de chargement à 0 %.
    // On force la fin du chargement après un délai pour basculer sur l'écran
    // de connexion (l'utilisateur peut alors réessayer ou continuer hors-ligne).
    let settled = false;
    const finishLoading = () => {
      if (mounted && !settled) {
        settled = true;
        setLoading(false);
      }
    };
    const sessionTimeout = setTimeout(finishLoading, 8000);

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      let sessionUser = data.session?.user;

      // Auto-login LOCAL uniquement (confort dev) en mode statique. Piloté par
      // .env.local : gitignoré et ABSENT du build Vercel → la page de login reste
      // intacte en production. Ne s'active que sur localhost ET si le flag est posé.
      const env = import.meta.env as any;
      // Pas d'auto-login juste après une déconnexion volontaire (même garde
      // que le mode legacy) : l'utilisateur doit retrouver l'écran de connexion.
      const justLoggedOutStatic = typeof window !== 'undefined' && sessionStorage.getItem('bera_just_logged_out') === '1';
      if (justLoggedOutStatic) {
        try { sessionStorage.removeItem('bera_just_logged_out'); } catch {}
        // Une session a survécu au signOut (hors-ligne / token resté en cache) :
        // on la purge ici pour que la déconnexion soit DÉFINITIVE après le reload,
        // au lieu de rouvrir l'ancien compte.
        if (sessionUser) {
          try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
          try { localStorage.removeItem('beramethode_supabase_session'); } catch { /* ignore */ }
          sessionUser = undefined;
        }
      }
      if (!sessionUser
          && !justLoggedOutStatic
          && env.VITE_DEV_AUTOLOGIN === '1'
          && env.VITE_DEV_AUTOLOGIN_EMAIL
          && env.VITE_DEV_AUTOLOGIN_PASSWORD
          && typeof window !== 'undefined'
          && window.location.hostname === 'localhost') {
        try {
          const { data: signIn } = await supabase.auth.signInWithPassword({
            email: env.VITE_DEV_AUTOLOGIN_EMAIL,
            password: env.VITE_DEV_AUTOLOGIN_PASSWORD,
          });
          if (signIn?.session?.user) sessionUser = signIn.session.user;
        } catch { /* best effort : on retombe sur l'écran de connexion */ }
      }

      clearTimeout(sessionTimeout);
      const u = mapSupabaseUser(sessionUser as never);
      // ⚠️ ensureLocalDataOwner AVANT setUser : pose la clé d'isolation (pkey) du
      // bon compte avant tout rendu. Sinon les composants lisent les clés scopées
      // de l'ANCIEN compte (fuite de données entre comptes sur le même appareil).
      // ⚠️ ensureLocalDataOwner AVANT le pull : pose la clé d'isolation (pkey) du
      // bon compte pour que pullSnapshotFromCloud lise/écrive les bonnes clés scopées.
      if (u) ensureLocalDataOwner(String(u.id));
      if (u && IS_STATIC) {
        // IMPORTANT: pull doit terminer AVANT setUser ET finishLoading, sinon :
        // 1. Le localStorage vide est pushé et écrase la donnée distante
        // 2. Les composants rendent sans données (localStorage pas encore rempli)
        await pullSnapshotFromCloud(String(u.id)).catch(() => {});
        startCloudSync(String(u.id));
      }
      setUser(u);
      finishLoading();
    }).catch(() => {
      clearTimeout(sessionTimeout);
      finishLoading();
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = mapSupabaseUser(session?.user as never);
      // ensureLocalDataOwner AVANT setUser (cf. ci-dessus : évite la fuite inter-comptes).
      if (u) ensureLocalDataOwner(String(u.id));
      if (u && IS_STATIC) {
        await pullSnapshotFromCloud(String(u.id)).catch(() => {});
        startCloudSync(String(u.id));
      } else {
        stopCloudSync();
      }
      setUser(u);
    });

    return () => {
      mounted = false;
      clearTimeout(sessionTimeout);
      sub.subscription.unsubscribe();
      stopCloudSync();
    };
  }, []);

  const login = (userData: User) => {
    // Purge les données locales si ce compte diffère du précédent sur ce
    // navigateur (même garde anti-fuite qu'en mode statique). Les invités
    // sont étiquetés 'guest' : un invité après un vrai compte ne doit pas
    // voir les données de ce compte (et inversement).
    if (userData?.id != null) {
      const isGuest = userData.id === 0 || userData.id === '0';
      const ownerId = isGuest ? 'guest' : (userData.cloudUserId && isCloudSyncUserId(userData.cloudUserId) ? userData.cloudUserId : String(userData.id));
      ensureLocalDataOwner(ownerId);
      if (!isGuest && isCloudSyncUserId(ownerId)) {
        void pullSnapshotFromCloud(ownerId).catch(() => {}).finally(() => startCloudSync(ownerId));
      }
    }
    setUser(userData);
  };

  const logout = async () => {
    if (IS_STATIC) {
      // Push final AVANT la purge : les éditions des 8 dernières secondes
      // (debounce) ne doivent pas être perdues. Borné à 10 s : si Supabase
      // est injoignable, le bouton ne doit pas rester figé.
      let pushed = false;
      if (user && user.id !== 0 && user.id !== '0') {
        try { pushed = await withTimeout(pushSnapshotToCloud(String(user.id)), 10000); } catch { pushed = false; }
      }
      stopCloudSync();
      // signOut() peut pendre indéfiniment hors-ligne  borné à 5 s. scope 'local'
      // ferme la session côté client sans aller-retour serveur (fiable même si
      // Supabase est injoignable / 522).
      try { await withTimeout(supabase.auth.signOut({ scope: 'local' }), 5000); } catch { /* purge dure ci-dessous */ }
      // Garantie dure : retire le token même si signOut a échoué/timeout, sinon
      // getSession() le rechargerait après le reload → reconnexion fantôme et le
      // bouton « déconnexion » paraît cassé.
      try { localStorage.removeItem('beramethode_supabase_session'); } catch { /* ignore */ }
      // Purge UNIQUEMENT si le push final a réussi : hors-ligne, on garde les
      // données locales (le marqueur last_sync_user protège quand même le
      // prochain compte  purge au login d'un utilisateur différent).
      if (pushed) clearLocalAppData();
      setUser(null);
      try { sessionStorage.setItem('bera_just_logged_out', '1'); } catch {}
      // Reload complet : l'état React (modèles, planning) survit au logout
      // sinon  un effet de persistance pourrait réécrire les données purgées,
      // et le compte suivant verrait l'ancien état en mémoire.
      window.location.reload();
      return;
    }
    try {
      try { await withTimeout(fetch('/api/auth/logout', { credentials: 'include', method: 'POST' }), 5000); } catch { /* le reload ramène à l'écran de connexion */ }
      const ownerId = user?.cloudUserId && isCloudSyncUserId(user.cloudUserId) ? user.cloudUserId : null;
      if (ownerId) {
        try { await withTimeout(pushSnapshotToCloud(ownerId), 10000); } catch { /* keep logout responsive */ }
      }
      stopCloudSync();
      clearLocalAppData();
      setUser(null);
      try { sessionStorage.setItem('bera_just_logged_out', '1'); } catch {}
      window.location.reload();
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const staticLogin = async (email: string, password: string) => {
    // Un échec réseau / service Supabase injoignable (ex. 522 Cloudflare) peut
    // se présenter sous deux formes : soit signInWithPassword() lève une
    // exception, soit il renvoie un `error` au message inexploitable ("{}",
    // "[object Object]", page HTML). Dans ces cas on affiche un message clair
    // au lieu de « E-mail ou mot de passe incorrect » qui induit en erreur.
    const SERVICE_UNREACHABLE =
      'Impossible de joindre le serveur d\'authentification. Vérifiez votre connexion Internet et réessayez dans quelques instants.';
    const isUselessMessage = (m: string): boolean => {
      const s = m.trim();
      return !s || s === '{}' || s === '[object Object]' || s.startsWith('<');
    };

    let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'];
    let error: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['error'];
    try {
      // Timeout de 12 s : le bouton « Sign in » ne reste jamais figé à tourner,
      // même si le service d'authentification ne répond pas.
      ({ data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        }),
        12000,
      ));
    } catch {
      return { ok: false, message: SERVICE_UNREACHABLE };
    }

    if (error || !data.user) {
      const rawMsg = error?.message || '';
      // Message vide ou inexploitable ⇒ service injoignable, pas un mauvais mot de passe.
      if (isUselessMessage(rawMsg)) {
        return { ok: false, message: SERVICE_UNREACHABLE };
      }
      const errMsg = rawMsg;
      // Email exists but not yet confirmed
      if (errMsg.toLowerCase().includes('email not confirmed') || errMsg.toLowerCase().includes('not confirmed')) {
        return { ok: false, message: 'Votre e-mail n\'est pas encore confirmé. Vérifiez votre boîte mail et cliquez sur le lien de confirmation.' };
      }
      // First use: auto-create admin account if it doesn't exist yet
      if (email.trim().toLowerCase() === 'soulaimaneberraadi@gmail.com' && password === 'Admin123!' && errMsg.toLowerCase().includes('invalid')) {
        const { data: signupData, error: signupError } = await supabase.auth.signUp({
          email: 'soulaimaneberraadi@gmail.com',
          password: 'Admin123!',
          options: { 
            data: { name: 'Soulaimane Berraadi', role: 'admin' },
            emailRedirectTo: window.location.origin,
          },
        });
        if (signupError || !signupData.user) {
          if (signupError?.message?.toLowerCase().includes('already registered')) {
            return { ok: false, message: 'E-mail ou mot de passe incorrect. Si vous avez créé ce compte avec Google, cliquez sur « Continuer avec Google ».' };
          }
          return { ok: false, message: signupError?.message || 'Échec inscription.' };
        }
        if (!signupData.session) {
          return { ok: false, message: 'Compte créé. Vérifiez votre boîte mail (soulaimaneberraadi@gmail.com) et confirmez avant de vous connecter.' };
        }
        const u = mapSupabaseUser(signupData.user as never);
        if (u) {
          await pushSnapshotToCloud(String(u.id));
        }
        return { ok: true, user: u || undefined };
      }
      return { ok: false, message: errMsg || 'E-mail ou mot de passe incorrect.' };
    }
    const u = mapSupabaseUser(data.user as never);
    if (u) {
      ensureLocalDataOwner(String(u.id));
      await pullSnapshotFromCloud(String(u.id)).catch(() => {});
      startCloudSync(String(u.id));
    }
    return { ok: true, user: u || undefined };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Retour vers l'application après l'authentification Google.
        // detectSessionInUrl (activé par défaut) capte la session, puis
        // onAuthStateChange déclenche le mapping utilisateur + cloud sync.
        redirectTo: oauthRedirectUrl(),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  };

  const signup = async (email: string, password: string, name?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { 
        data: { name: name || email.split('@')[0] },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error || !data.user) {
      return { ok: false, message: error?.message || 'Échec inscription.' };
    }
    // Session null = Supabase requires email confirmation before login
    if (!data.session) {
      return { ok: true, requiresConfirmation: true };
    }
    const u = mapSupabaseUser(data.user as never);
    if (u) {
      ensureLocalDataOwner(String(u.id));
      await pullSnapshotFromCloud(String(u.id)).catch(() => {});
      startCloudSync(String(u.id));
    }
    return { ok: true, user: u || undefined };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        loading,
        staticLogin: IS_STATIC ? staticLogin : undefined,
        signup: IS_STATIC ? signup : undefined,
        signInWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
