import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Lang } from '../../app/constants';
import { pkey } from '../../lib/storageKeys';

const SUPPORTED: Lang[] = ['fr', 'ar', 'en', 'es', 'pt', 'tr'];

interface LanguageContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const LanguageContext = createContext<LanguageContextType>({ lang: 'fr', setLang: () => {} });

/**
 * Fournit la langue active à toute l'application (sans prop-drilling).
 * Persistée dans localStorage `bera_lang` scopée par utilisateur via pkey(). Applique `dir=rtl` pour l'arabe.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(pkey('bera_lang')) || localStorage.getItem('bera_lang');
      return saved && (SUPPORTED as string[]).includes(saved) ? (saved as Lang) : 'fr';
    } catch { return 'fr'; }
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(pkey('bera_lang'), l); } catch {}
  }, []);

  // Sync language when the user switches account
  useEffect(() => {
    const handleUserChanged = () => {
      try {
        const saved = localStorage.getItem(pkey('bera_lang')) || localStorage.getItem('bera_lang');
        if (saved && (SUPPORTED as string[]).includes(saved)) {
          setLangState(saved as Lang);
        }
      } catch {}
    };
    window.addEventListener('bera_user_changed', handleUserChanged);
    return () => window.removeEventListener('bera_user_changed', handleUserChanged);
  }, []);

  // RTL uniquement pour l'arabe ; les 5 autres langues sont LTR.
  useEffect(() => {
    try {
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    } catch { /* SSR / environnement sans document */ }
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Hook : `const { lang, setLang } = useLang();` accessible dans tout composant. */
export function useLang(): LanguageContextType {
  return useContext(LanguageContext);
}
