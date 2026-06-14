// ════════════════════════════════════════════════════════════════════════════
// LicenseContext — يوفّر حالة ترخيص المصنع لكل التطبيق.
// آمن تماماً: إذا كان الإنفاذ مطفأ (الافتراضي) أو لا يوجد ترخيص، يسلك التطبيق
// كما كان دون أي تقييد. لا يقفل المستخدم أبداً ما لم يُفعَّل VITE_LICENSE_ENFORCE.
// ════════════════════════════════════════════════════════════════════════════

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  LicenseState, verifyLicense, getCachedLicense, isReadOnly, LICENSE_ENFORCED,
} from '../lib/licenseClient';

interface LicenseCtx {
  license: LicenseState;
  enforced: boolean;
  readOnly: boolean;
  /** الوحدات المخفية المحسوبة من باقة الترخيص (فارغة إذا لا إنفاذ/لا ترخيص). */
  hiddenModules: string[];
  /** سقف عدد العمال (0 = غير محدّد). */
  maxWorkers: number;
  refresh: () => Promise<void>;
}

const Ctx = createContext<LicenseCtx | undefined>(undefined);

// كل وحدات BERAMETHODE — لحساب المخفي = الكل ناقص المسموح.
const ALL_MODULES = [
  'dashboard', 'ingenierie', 'atelierProd', 'library', 'coupe',
  'effectifs', 'gestionRh', 'planning', 'suivi', 'rendement', 'magasin', 'export',
  'facturation', 'config', 'pageMachine', 'machin', 'objectifs', 'sousTraitance',
  'admin', 'profil', 'atelier',
];

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [license, setLicense] = useState<LicenseState>(() => getCachedLicense());

  const refresh = useCallback(async () => {
    if (!user?.email) return;
    const state = await verifyLicense({ email: user.email });
    setLicense(state);
  }, [user?.email]);

  useEffect(() => {
    // تحقق عند الدخول وعند عودة الاتصال.
    if (user?.email) refresh();
    const onOnline = () => { if (user?.email) refresh(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [user?.email, refresh]);

  // حساب القيم المشتقّة — كلها محايدة إذا لا إنفاذ/لا ترخيص.
  const enforced = LICENSE_ENFORCED && license.source !== 'none';
  const readOnly = isReadOnly(license);
  const hiddenModules = enforced && license.modules.length
    ? ALL_MODULES.filter((m) => !license.modules.includes(m) && m !== 'profil')
    : [];
  const maxWorkers = enforced ? license.max_workers : 0;

  return (
    <Ctx.Provider value={{ license, enforced, readOnly, hiddenModules, maxWorkers, refresh }}>
      {children}
    </Ctx.Provider>
  );
};

export const useLicense = (): LicenseCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // احتياط: إذا استُعمل خارج المزوّد، ارجع حالة محايدة بدل رمي خطأ يكسر التطبيق.
    return {
      license: getCachedLicense(),
      enforced: false, readOnly: false, hiddenModules: [], maxWorkers: 0,
      refresh: async () => {},
    };
  }
  return ctx;
};
