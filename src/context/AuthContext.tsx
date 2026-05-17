import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { startCloudSync, stopCloudSync, pullSnapshotFromCloud, pushSnapshotToCloud } from '../lib/cloudSync';

interface User {
  id: number | string;
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
  signup?: (email: string, password: string, name?: string) => Promise<{ ok: boolean; user?: User; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

const mapSupabaseUser = (su: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null): User | null => {
  if (!su || !su.email) return null;
  const meta = su.user_metadata || {};
  const name = (meta.name as string) || (meta.full_name as string) || su.email.split('@')[0];
  const role: 'user' | 'admin' = (meta.role as 'user' | 'admin') || (su.email === 'soulaimaneberraadi@gmail.com' ? 'admin' : 'user');
  return { id: su.id, email: su.email, name, role };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!IS_STATIC) {
      // Legacy backend auth
      const checkAuth = async () => {
        try {
          const res = await fetch('/api/auth/me', { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
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

    // Supabase auth (static mode) — never block loading on cloud sync
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = mapSupabaseUser(data.session?.user as never);
      setUser(u);
      setLoading(false);
      if (u) {
        // Pull et sync en arrière-plan (non bloquant)
        pullSnapshotFromCloud(String(u.id)).catch(() => {});
        startCloudSync(String(u.id));
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = mapSupabaseUser(session?.user as never);
      setUser(u);
      if (u) {
        pullSnapshotFromCloud(String(u.id)).catch(() => {});
        startCloudSync(String(u.id));
      } else {
        stopCloudSync();
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      stopCloudSync();
    };
  }, []);

  const login = (userData: User) => {
    setUser(userData);
  };

  const logout = async () => {
    if (IS_STATIC) {
      stopCloudSync();
      await supabase.auth.signOut();
      setUser(null);
      return;
    }
    try {
      await fetch('/api/auth/logout', { credentials: 'include', method: 'POST' });
      setUser(null);
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const staticLogin = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.user) {
      // Si compte n'existe pas → auto-signup pour le compte admin (1ère utilisation)
      if (email.trim().toLowerCase() === 'soulaimaneberraadi@gmail.com' && password === 'Admin123!') {
        const { data: signupData, error: signupError } = await supabase.auth.signUp({
          email: 'soulaimaneberraadi@gmail.com',
          password: 'Admin123!',
          options: { data: { name: 'Soulaimane Berraadi', role: 'admin' } },
        });
        if (signupError || !signupData.user) {
          return { ok: false, message: signupError?.message || 'Échec inscription.' };
        }
        const u = mapSupabaseUser(signupData.user as never);
        if (u) {
          await pushSnapshotToCloud(String(u.id));
        }
        return { ok: true, user: u || undefined };
      }
      return { ok: false, message: error?.message || 'E-mail ou mot de passe incorrect.' };
    }
    const u = mapSupabaseUser(data.user as never);
    return { ok: true, user: u || undefined };
  };

  const signup = async (email: string, password: string, name?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name: name || email.split('@')[0] } },
    });
    if (error || !data.user) {
      return { ok: false, message: error?.message || 'Échec inscription.' };
    }
    const u = mapSupabaseUser(data.user as never);
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
