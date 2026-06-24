import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { AccountType, normalizeAccountType, DEFAULT_ACCOUNT_TYPE } from '../../app/accountTypes';

/**
 * Contexte de permissions hiérarchiques (Epic 2).
 * Récupère /api/permissions/me et expose le gating pages + champs.
 *
 * NON-BREAKING : par défaut (avant chargement, en static, ou si erreur) =>
 * accès total (isSuper). Les installs mono-utilisateur restent inchangées
 * (l'utilisateur solo est de toute façon « super » côté serveur).
 */

type PermMap = Record<string, { view: boolean; edit: boolean }>;

interface PermissionsState {
  loading: boolean;
  isSuper: boolean;
  ownerId: number | null;
  roleId: string | null;
  pages: PermMap;
  fields: PermMap;
  hiddenPages: string[];
  accountType: AccountType;
}

interface PermissionsContextType extends PermissionsState {
  /** Peut voir/éditer une page. */
  canPage: (key: string, action?: 'view' | 'edit') => boolean;
  /** Peut voir/éditer un champ sensible (ex: 'model.cout_minute'). */
  canField: (key: string, action?: 'view' | 'edit') => boolean;
  refresh: () => void;
}

const DEFAULT: PermissionsState = {
  loading: true, isSuper: true, ownerId: null, roleId: null,
  pages: {}, fields: {}, hiddenPages: [], accountType: DEFAULT_ACCOUNT_TYPE,
};

const Ctx = createContext<PermissionsContextType | undefined>(undefined);

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<PermissionsState>(DEFAULT);

  const load = useCallback(async () => {
    // Static mode ou pas connecté => super par défaut (non-breaking).
    if (IS_STATIC || !user) {
      setState({ ...DEFAULT, loading: false });
      return;
    }
    try {
      const r = await fetch('/api/permissions/me', { credentials: 'include' });
      if (!r.ok) throw new Error('perm fetch failed');
      const d = await r.json();
      setState({
        loading: false,
        isSuper: !!d.isSuper,
        ownerId: d.ownerId ?? null,
        roleId: d.roleId ?? null,
        pages: d.pages || {},
        fields: d.fields || {},
        hiddenPages: d.hiddenPages || [],
        accountType: normalizeAccountType(d.accountType),
      });
    } catch {
      // Échec réseau => ne rien casser : accès total.
      setState({ ...DEFAULT, loading: false });
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const canPage = useCallback((key: string, action: 'view' | 'edit' = 'view') => {
    if (state.isSuper) return true;
    const p = state.pages[key];
    if (!p) return action === 'view' ? !state.hiddenPages.includes(key) : false;
    return action === 'view' ? p.view : p.edit;
  }, [state]);

  const canField = useCallback((key: string, action: 'view' | 'edit' = 'view') => {
    if (state.isSuper) return true;
    const f = state.fields[key];
    if (!f) return false; // champ sensible => DENY par défaut
    return action === 'view' ? f.view : f.edit;
  }, [state]);

  return (
    <Ctx.Provider value={{ ...state, canPage, canField, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePermissions(): PermissionsContextType {
  const c = useContext(Ctx);
  if (!c) {
    // Fallback hors provider : accès total (non-breaking).
    return {
      ...DEFAULT, loading: false,
      canPage: () => true, canField: () => true, refresh: () => {},
    };
  }
  return c;
}
