import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  loading: boolean;
  staticLogin?: (email: string, password: string) => { ok: boolean; user?: User; message?: string };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';
const STORAGE_KEY = 'beramethode_local_user';

// Local admin credentials for static deployment (Vercel build)
const LOCAL_ACCOUNTS: Array<User & { password: string }> = [
  {
    id: 1,
    email: 'soulaimaneberraadi@gmail.com',
    password: 'Admin123!',
    name: 'Soulaimane Berraadi',
    role: 'admin',
  },
];

const loadStoredUser = (): User | null => {
  if (!IS_STATIC) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(loadStoredUser);
  const [loading, setLoading] = useState(!IS_STATIC);

  useEffect(() => {
    if (IS_STATIC) return;
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
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    if (IS_STATIC) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userData)); } catch {}
    }
  };

  const logout = async () => {
    if (IS_STATIC) {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
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

  const staticLogin = (email: string, password: string) => {
    const match = LOCAL_ACCOUNTS.find(
      a => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password
    );
    if (!match) {
      return { ok: false, message: 'E-mail ou mot de passe incorrect.' };
    }
    const { password: _pwd, ...userData } = match;
    setUser(userData);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userData)); } catch {}
    return { ok: true, user: userData };
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, staticLogin: IS_STATIC ? staticLogin : undefined }}>
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
