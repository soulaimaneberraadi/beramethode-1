import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Trash2, Shield, User, Search, AlertCircle, Download, GitMerge, Database,
  Building2, Factory, Users, ImageUp, Check, ChevronRight, KeyRound, SlidersHorizontal,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { tx } from '../../lib/i18n';
import { useLang } from '../context/LanguageContext';
import { usePermissions } from '../context/PermissionsContext';
import PermissionsManager from '../../components/PermissionsManager';
import LicenseActivation from '../../components/LicenseActivation';
import { CompanyParamsSection, StructureSection } from '../../components/admin/AdminConfigSections';
import { clearLocalAppData } from '../lib/cloudSync';
import type { AppSettings, Machine } from '../../types';

interface UserData {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  created_at: string;
}

type AccountType = 'societe' | 'client' | 'personnel';
interface CompanyInfo {
  store: 'workspace' | 'company_settings';
  canEdit: boolean;
  name: string;
  logo: string | null;
  specialty: string;
  accountType: AccountType;
  profileMeta: Record<string, any> | null;
}

type Tab = 'company' | 'team' | 'users' | 'data' | 'license';

interface AdminDashboardProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  machines: Machine[];
  lang?: any;
}

// ── Étiquettes des types de compte (multilingue) ────────────────────────────
const TYPE_LABEL = (t: AccountType, lang: any) => ({
  societe: tx(lang, { fr: 'Société', ar: 'شركة', en: 'Company', es: 'Empresa', pt: 'Empresa', tr: 'Şirket' }),
  client: tx(lang, { fr: 'Client', ar: 'عميل', en: 'Client', es: 'Cliente', pt: 'Cliente', tr: 'Müşteri' }),
  personnel: tx(lang, { fr: 'Indépendant', ar: 'شخصي / مستقل', en: 'Independent', es: 'Independiente', pt: 'Independente', tr: 'Bağımsız' }),
}[t]);
const TYPE_DESC = (t: AccountType, lang: any) => ({
  societe: tx(lang, { fr: 'ERP complet : production, RH, stock, équipe & rôles.', ar: 'نظام كامل: الإنتاج، الموارد البشرية، المخزون، الفريق والأدوار.', en: 'Full ERP: production, HR, stock, team & roles.', es: 'ERP completo: producción, RRHH, stock, equipo y roles.', pt: 'ERP completo: produção, RH, stock, equipa e funções.', tr: 'Tam ERP: üretim, İK, stok, ekip ve roller.' }),
  client: tx(lang, { fr: 'Suivi des commandes uniquement (catalogue, stock, facturation).', ar: 'متابعة الطلبات فقط (الكتالوج، المخزون، الفوترة).', en: 'Order tracking only (catalog, stock, invoicing).', es: 'Solo seguimiento de pedidos (catálogo, stock, facturación).', pt: 'Apenas acompanhamento de pedidos (catálogo, stock, faturação).', tr: 'Yalnızca sipariş takibi (katalog, stok, faturalandırma).' }),
  personnel: tx(lang, { fr: 'Méthodes & chronométrage (étude modèle, temps, rendement).', ar: 'الطرق والتوقيت (دراسة النموذج، الأوقات، المردود).', en: 'Methods & timing (model study, times, yield).', es: 'Métodos y cronometraje (estudio de modelo, tiempos, rendimiento).', pt: 'Métodos e cronometragem (estudo de modelo, tempos, rendimento).', tr: 'Metotlar ve zamanlama (model etüdü, süreler, verim).' }),
}[t]);

const api = (url: string, opts?: RequestInit) =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts }).then(r => r.json());

export default function AdminDashboard({ settings, setSettings, machines }: AdminDashboardProps) {
  const { user } = useAuth();
  const { lang } = useLang();
  const { accountType: ctxAccountType, refresh: refreshPermissions } = usePermissions();

  const [tab, setTab] = useState<Tab>('company');

  // ── Tab Company ────────────────────────────────────────────────────────────
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyMsg, setCompanyMsg] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaceMsg, setWorkspaceMsg] = useState<string | null>(null);

  const loadCompany = useCallback(async () => {
    try {
      const d = await api('/api/permissions/company');
      if (d?.ok) setCompany({
        store: d.store, canEdit: !!d.canEdit, name: d.name || '', logo: d.logo || null,
        specialty: d.specialty || '', accountType: d.accountType || 'societe', profileMeta: d.profileMeta || null,
      });
    } catch { /* réseau : laissé null → message d'erreur via UI */ }
  }, []);
  useEffect(() => { void loadCompany(); }, [loadCompany]);

  const createWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name || creatingWorkspace) return;
    setCreatingWorkspace(true);
    setWorkspaceMsg(null);
    try {
      const d = await api('/api/workspaces', { method: 'POST', body: JSON.stringify({ name }) });
      if (!d?.ok) throw new Error(d?.error || 'create failed');
      clearLocalAppData();
      window.location.reload();
    } catch {
      setWorkspaceMsg(tx(lang, { fr: 'Échec de la création.', ar: 'فشل إنشاء الشركة.', en: 'Creation failed.', es: 'Error de creación.', pt: 'Falha na criação.', tr: 'Oluşturma başarısız.' }));
      setCreatingWorkspace(false);
    }
  };

  const setMeta = (key: string, val: string) =>
    setCompany(c => c ? { ...c, profileMeta: { ...(c.profileMeta || {}), [key]: val } } : c);

  const onLogoFile = (file: File) => {
    setLogoError(null);
    if (!file.type.startsWith('image/')) { setLogoError(tx(lang, { fr: 'Veuillez choisir une image.', ar: 'الرجاء اختيار صورة.', en: 'Please choose an image.', es: 'Elija una imagen.', pt: 'Escolha uma imagem.', tr: 'Bir resim seçin.' })); return; }
    if (file.size > 12 * 1024 * 1024) { setLogoError(tx(lang, { fr: 'Image trop volumineuse (max 12 Mo).', ar: 'الصورة كبيرة جدًا (الحد 12 ميغا).', en: 'Image too large (max 12 MB).', es: 'Imagen demasiado grande (máx 12 MB).', pt: 'Imagem muito grande (máx 12 MB).', tr: 'Resim çok büyük (maks 12 MB).' })); return; }
    const reader = new FileReader();
    reader.onload = () => setCompany(c => c ? { ...c, logo: String(reader.result || '') || null } : c);
    reader.readAsDataURL(file);
  };

  const saveCompany = async () => {
    if (!company) return;
    if (!company.name.trim()) { setCompanyMsg('❌ ' + tx(lang, { fr: 'Le nom est requis.', ar: 'الاسم مطلوب.', en: 'Name is required.', es: 'El nombre es obligatorio.', pt: 'O nome é obrigatório.', tr: 'Ad gereklidir.' })); return; }
    setSavingCompany(true); setCompanyMsg(null);
    try {
      const d = await api('/api/permissions/company', {
        method: 'PUT',
        body: JSON.stringify({
          name: company.name.trim(),
          logo: company.logo,
          specialty: company.specialty,
          accountType: company.accountType,
          profileMeta: company.store === 'company_settings' ? (company.profileMeta || null) : undefined,
        }),
      });
      if (!d?.ok) throw new Error(d?.error || 'fail');
      setCompany(c => c ? { ...c, ...d } : c);
      setCompanyMsg('✅ ' + tx(lang, { fr: 'Enregistré.', ar: 'تم الحفظ.', en: 'Saved.', es: 'Guardado.', pt: 'Guardado.', tr: 'Kaydedildi.' }));
      // Le type de compte change les modules visibles → rafraîchir le contexte.
      await refreshPermissions();
    } catch {
      setCompanyMsg('❌ ' + tx(lang, { fr: 'Échec de l\'enregistrement.', ar: 'فشل الحفظ.', en: 'Save failed.', es: 'Error al guardar.', pt: 'Falha ao guardar.', tr: 'Kaydetme başarısız.' }));
    } finally { setSavingCompany(false); }
  };

  // ── Tab Users (système legacy) ──────────────────────────────────────────────
  const [users, setUsers] = useState<UserData[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'user' });

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      setUsers(await res.json());
    } catch (err: any) { setError(err.message); } finally { setLoadingUsers(false); }
  }, []);
  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/register', {
        credentials: 'include', method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to create user'); }
      void fetchUsers();
      setShowCreateModal(false);
      setNewUser({ email: '', password: '', name: '', role: 'user' });
    } catch (err: any) { alert(err.message); }
  };

  const handleRoleUpdate = async (userId: number, newRole: 'user' | 'admin') => {
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) { alert(err.message); }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm(tx(lang, { fr: 'Supprimer ce compte ? Action irréversible.', ar: 'حذف هذا الحساب؟ إجراء لا رجعة فيه.', en: 'Delete this account? Irreversible.', es: '¿Eliminar esta cuenta? Irreversible.', pt: 'Eliminar esta conta? Irreversível.', tr: 'Bu hesap silinsin mi? Geri alınamaz.' }))) return;
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to delete user'); }
      setUsers(users.filter(u => u.id !== userId));
    } catch (err: any) { alert(err.message); }
  };

  // ── Tab Data ────────────────────────────────────────────────────────────────
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);

  const handleExportAllData = async () => {
    try {
      const res = await fetch('/api/admin/export-all-data', { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `beramethode-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) { alert('Export error: ' + err.message); }
  };

  const handleMergeToUser = async () => {
    if (!mergeTarget) return alert(tx(lang, { fr: 'Entrez un email cible', ar: 'أدخل البريد المستهدف', en: 'Enter target email', es: 'Ingrese el correo objetivo', pt: 'Insira o e-mail alvo', tr: 'Hedef e-postayı girin' }));
    if (!confirm(tx(lang, { fr: `Fusionner TOUTES les données vers ${mergeTarget} ? Irréversible.`, ar: `دمج جميع البيانات إلى ${mergeTarget}؟ لا رجعة فيه.`, en: `Merge ALL data to ${mergeTarget}? Irreversible.`, es: `¿Fusionar TODOS los datos a ${mergeTarget}? Irreversible.`, pt: `Mesclar TODOS os dados para ${mergeTarget}? Irreversível.`, tr: `TÜM veriler ${mergeTarget} adresine birleştirilsin mi? Geri alınamaz.` }))) return;
    setMergeLoading(true); setMergeResult(null);
    try {
      const res = await fetch('/api/admin/merge-to-user', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetEmail: mergeTarget }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMergeResult(`✅ ${data.message} — ` + tx(lang, { fr: `Modèles: ${data.modelsUpdated}, Produits: ${data.productsUpdated}, Ouvriers: ${data.workersUpdated}, Paramètres: ${data.settingsCopied}`, ar: `النماذج: ${data.modelsUpdated}، المنتجات: ${data.productsUpdated}، العمال: ${data.workersUpdated}، الإعدادات: ${data.settingsCopied}`, en: `Models: ${data.modelsUpdated}, Products: ${data.productsUpdated}, Workers: ${data.workersUpdated}, Settings: ${data.settingsCopied}`, es: `Modelos: ${data.modelsUpdated}, Productos: ${data.productsUpdated}, Trabajadores: ${data.workersUpdated}, Ajustes: ${data.settingsCopied}`, pt: `Modelos: ${data.modelsUpdated}, Produtos: ${data.productsUpdated}, Trabalhadores: ${data.workersUpdated}, Definições: ${data.settingsCopied}`, tr: `Modeller: ${data.modelsUpdated}, Ürünler: ${data.productsUpdated}, İşçiler: ${data.workersUpdated}, Ayarlar: ${data.settingsCopied}` }));
    } catch (err: any) {
      setMergeResult(`❌ ${err.message}`);
    } finally { setMergeLoading(false); }
  };

  const filteredUsers = users.filter(u =>
    (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isSociete = (company?.accountType || ctxAccountType) === 'societe';

  // Onglets visibles selon le type de compte (RBAC d'équipe : société uniquement).
  const TABS: { key: Tab; label: string; icon: any; show: boolean }[] = [
    { key: 'company', label: tx(lang, { fr: 'Entreprise', ar: 'الشركة', en: 'Company', es: 'Empresa', pt: 'Empresa', tr: 'Şirket' }), icon: Building2, show: true },
    { key: 'team', label: tx(lang, { fr: 'Équipe & rôles', ar: 'الفريق والصلاحيات', en: 'Team & roles', es: 'Equipo y roles', pt: 'Equipa e funções', tr: 'Ekip ve roller' }), icon: Shield, show: isSociete },
    { key: 'users', label: tx(lang, { fr: 'Comptes', ar: 'الحسابات', en: 'Accounts', es: 'Cuentas', pt: 'Contas', tr: 'Hesaplar' }), icon: Users, show: true },
    { key: 'data', label: tx(lang, { fr: 'Données', ar: 'البيانات', en: 'Data', es: 'Datos', pt: 'Dados', tr: 'Veri' }), icon: Database, show: true },
    { key: 'license', label: tx(lang, { fr: 'Licence', ar: 'الترخيص', en: 'License', es: 'Licencia', pt: 'Licença', tr: 'Lisans' }), icon: KeyRound, show: true },
  ];
  const visibleTabs = TABS.filter(t => t.show);
  const activeTab = visibleTabs.some(t => t.key === tab) ? tab : 'company';

  const inputCls = 'w-full px-3 py-2.5 text-sm rounded-xl border bg-slate-50 dark:bg-dk-bg border-slate-200 dark:border-dk-border text-slate-700 dark:text-dk-text outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition-all';

  return (
    <div className="flex-1 bg-slate-50 dark:bg-dk-bg p-6 sm:p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Administration', ar: 'الإدارة', en: 'Administration', es: 'Administración', pt: 'Administração', tr: 'Yönetim' })}</h1>
            <p className="text-sm text-slate-500 dark:text-dk-muted mt-0.5">{tx(lang, { fr: 'Entreprise, équipe, comptes et données.', ar: 'الشركة، الفريق، الحسابات والبيانات.', en: 'Company, team, accounts and data.', es: 'Empresa, equipo, cuentas y datos.', pt: 'Empresa, equipa, contas e dados.', tr: 'Şirket, ekip, hesaplar ve veri.' })}</p>
          </div>
          <button type="button" onClick={() => setShowNewWorkspace(v => !v)} className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm">
            <Factory className="w-4 h-4" />
            {tx(lang, { fr: 'Nouvelle société', ar: 'شركة جديدة', en: 'New company', es: 'Nueva empresa', pt: 'Nova empresa', tr: 'Yeni şirket' })}
          </button>
        </div>

        {showNewWorkspace && (
          <div className="mb-6 flex flex-wrap items-center gap-2 p-4 bg-white dark:bg-dk-surface rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-sm">
            <input autoFocus value={newWorkspaceName} onChange={e => setNewWorkspaceName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void createWorkspace(); }} placeholder={tx(lang, { fr: 'Nom de la société', ar: 'اسم الشركة', en: 'Company name', es: 'Nombre de la empresa', pt: 'Nome da empresa', tr: 'Şirket adı' })} className="flex-1 min-w-[220px] px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg text-slate-700 dark:text-dk-text outline-none focus:border-emerald-500" />
            <button type="button" onClick={() => void createWorkspace()} disabled={creatingWorkspace || !newWorkspaceName.trim()} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">{tx(lang, { fr: 'Créer', ar: 'إنشاء', en: 'Create', es: 'Crear', pt: 'Criar', tr: 'Oluştur' })}</button>
            {workspaceMsg && <span className="w-full text-sm text-red-600 dark:text-red-400">{workspaceMsg}</span>}
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5 mb-6 border-b border-slate-200 dark:border-dk-border">
          {visibleTabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold rounded-t-lg -mb-px border-b-2 transition-colors ${activeTab === t.key ? 'border-emerald-600 text-emerald-700 dark:text-dk-accent-text' : 'border-transparent text-slate-500 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text'}`}>
              <t.icon className="w-4 h-4" strokeWidth={1.75} /> {t.label}
            </button>
          ))}
        </div>

        {/* ── COMPANY TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'company' && (
          <div className="space-y-5">
            {!company ? (
              <div className="p-8 text-center text-slate-400 dark:text-dk-muted text-sm">{tx(lang, { fr: 'Chargement…', ar: 'جارٍ التحميل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yükleniyor…' })}</div>
            ) : (
              <>
                {/* Identité */}
                <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm p-5 sm:p-6 space-y-5">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                    <h2 className="text-sm font-bold text-slate-700 dark:text-dk-text uppercase tracking-wide">{tx(lang, { fr: 'Identité', ar: 'الهوية', en: 'Identity', es: 'Identidad', pt: 'Identidade', tr: 'Kimlik' })}</h2>
                  </div>

                  {/* Logo + Nom */}
                  <div className="flex flex-col sm:flex-row gap-5 items-start">
                    <div className="shrink-0">
                      <div className="w-24 h-24 rounded-2xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg overflow-hidden flex items-center justify-center">
                        {company.logo
                          ? <img src={company.logo} alt="logo" className="w-full h-full object-contain" />
                          : <Building2 className="w-8 h-8 text-slate-300 dark:text-dk-muted" />}
                      </div>
                      {company.canEdit && (
                        <div className="flex items-center gap-2 mt-2">
                          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-dk-accent-text cursor-pointer hover:underline">
                            <ImageUp className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Changer', ar: 'تغيير', en: 'Change', es: 'Cambiar', pt: 'Mudar', tr: 'Değiştir' })}
                            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onLogoFile(f); }} />
                          </label>
                          {company.logo && (
                            <button onClick={() => setCompany(c => c ? { ...c, logo: null } : c)} className="text-xs font-semibold text-slate-400 dark:text-dk-muted hover:text-rose-500">{tx(lang, { fr: 'Retirer', ar: 'إزالة', en: 'Remove', es: 'Quitar', pt: 'Remover', tr: 'Kaldır' })}</button>
                          )}
                        </div>
                      )}
                      {logoError && <p className="text-[11px] text-rose-500 mt-1 max-w-[8rem]">{logoError}</p>}
                    </div>
                    <div className="flex-1 w-full space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-dk-muted uppercase mb-1.5">{tx(lang, { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' })}</label>
                        <input className={inputCls} disabled={!company.canEdit} value={company.name} onChange={e => setCompany(c => c ? { ...c, name: e.target.value } : c)} />
                      </div>
                      {company.accountType !== 'client' && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-dk-muted uppercase mb-1.5">{tx(lang, { fr: 'Spécialité', ar: 'التخصّص', en: 'Specialty', es: 'Especialidad', pt: 'Especialidade', tr: 'Uzmanlık' })}</label>
                          <input className={inputCls} disabled={!company.canEdit} value={company.specialty} onChange={e => setCompany(c => c ? { ...c, specialty: e.target.value } : c)} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Champs spécifiques au type (stockés dans profile_meta) */}
                  {company.store === 'company_settings' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {company.accountType === 'client' && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-dk-muted uppercase mb-1.5">{tx(lang, { fr: 'Région', ar: 'المنطقة', en: 'Region', es: 'Región', pt: 'Região', tr: 'Bölge' })}</label>
                          <input className={inputCls} disabled={!company.canEdit} value={company.profileMeta?.region || ''} onChange={e => setMeta('region', e.target.value)} />
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-dk-muted uppercase mb-1.5">{tx(lang, { fr: 'Téléphone', ar: 'الهاتف', en: 'Phone', es: 'Teléfono', pt: 'Telefone', tr: 'Telefon' })}</label>
                        <input className={inputCls} disabled={!company.canEdit} value={company.profileMeta?.companyPhone || company.profileMeta?.adminPhone || ''} onChange={e => setMeta('companyPhone', e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Type de compte + صلاحية الترقية */}
                <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm p-5 sm:p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                    <h2 className="text-sm font-bold text-slate-700 dark:text-dk-text uppercase tracking-wide">{tx(lang, { fr: 'Type de compte', ar: 'نوع الحساب', en: 'Account type', es: 'Tipo de cuenta', pt: 'Tipo de conta', tr: 'Hesap türü' })}</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(['societe', 'client', 'personnel'] as AccountType[]).map(t => {
                      const active = company.accountType === t;
                      return (
                        <button key={t} disabled={!company.canEdit}
                          onClick={() => setCompany(c => c ? { ...c, accountType: t } : c)}
                          className={`text-start p-3.5 rounded-xl border-2 transition-all disabled:cursor-not-allowed ${active ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 dark:bg-dk-accent/15' : 'border-slate-200 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-muted'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-sm font-bold ${active ? 'text-emerald-700 dark:text-dk-accent-text' : 'text-slate-700 dark:text-dk-text'}`}>{TYPE_LABEL(t, lang)}</span>
                            {active && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />}
                          </div>
                          <p className="text-[11px] leading-snug text-slate-500 dark:text-dk-muted">{TYPE_DESC(t, lang)}</p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Le type de compte adapte les modules visibles dans le menu.', ar: 'نوع الحساب يحدّد الوحدات الظاهرة في القائمة.', en: 'Account type adjusts which modules appear in the menu.', es: 'El tipo de cuenta ajusta los módulos visibles en el menú.', pt: 'O tipo de conta ajusta os módulos visíveis no menu.', tr: 'Hesap türü menüde görünen modülleri ayarlar.' })}</p>
                </div>

                {company.canEdit && (
                  <div className="flex items-center gap-3">
                    <button onClick={saveCompany} disabled={savingCompany}
                      className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60 inline-flex items-center gap-2">
                      <Check className="w-4 h-4" /> {savingCompany ? tx(lang, { fr: 'Enregistrement…', ar: 'جارٍ الحفظ…', en: 'Saving…', es: 'Guardando…', pt: 'A guardar…', tr: 'Kaydediliyor…' }) : tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}
                    </button>
                    {companyMsg && <span className={`text-xs font-medium ${companyMsg.startsWith('✅') ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>{companyMsg}</span>}
                  </div>
                )}
              </>
            )}

            {/* Paramètres de production de l'entreprise (devise, coût minute, horaires) */}
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-3">
                <SlidersHorizontal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                <h2 className="text-sm font-bold text-slate-700 dark:text-dk-text uppercase tracking-wide">{tx(lang, { fr: 'Paramètres de production', ar: 'إعدادات الإنتاج', en: 'Production settings', es: 'Ajustes de producción', pt: 'Definições de produção', tr: 'Üretim ayarları' })}</h2>
              </div>
              <CompanyParamsSection settings={settings} setSettings={setSettings} lang={lang} />
            </div>
          </div>
        )}

        {/* ── TEAM TAB (société) ──────────────────────────────────────────── */}
        {activeTab === 'team' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm">
              <PermissionsManager />
            </div>
            {/* Structure & encadrement (organigramme, chaînes, machines par chaîne) */}
            <StructureSection settings={settings} setSettings={setSettings} lang={lang} machines={machines} />
          </div>
        )}

        {/* ── USERS TAB (comptes login legacy) ────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-dk-muted" />
                <input type="text" placeholder={tx(lang, { fr: 'Rechercher…', ar: 'بحث…', en: 'Search…', es: 'Buscar…', pt: 'Pesquisar…', tr: 'Ara…' })} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={`${inputCls} pl-10`} />
              </div>
              <button onClick={() => setShowCreateModal(true)} className="px-4 py-2.5 bg-emerald-600 text-white text-sm rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-sm shrink-0">
                {tx(lang, { fr: '+ Nouveau compte', ar: '+ حساب جديد', en: '+ New account', es: '+ Nueva cuenta', pt: '+ Nova conta', tr: '+ Yeni hesap' })}
              </button>
            </div>

            {error && (
              <div className="p-4 bg-rose-50 dark:bg-rose-900/30 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/40 rounded-xl flex items-center gap-3 text-rose-700 dark:text-rose-300 text-sm">
                <AlertCircle className="w-5 h-5" /> {error}
              </div>
            )}

            <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dk-border overflow-hidden">
              <div className="overflow-x-auto">
                {loadingUsers ? (
                  <div className="p-8 text-center text-slate-400 dark:text-dk-muted text-sm">{tx(lang, { fr: 'Chargement…', ar: 'جارٍ التحميل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yükleniyor…' })}</div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border">
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider">{tx(lang, { fr: 'Compte', ar: 'الحساب', en: 'Account', es: 'Cuenta', pt: 'Conta', tr: 'Hesap' })}</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider">{tx(lang, { fr: 'Rôle', ar: 'الدور', en: 'Role', es: 'Rol', pt: 'Função', tr: 'Rol' })}</th>
                        <th className="px-6 py-3.5 text-xs font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider text-end">{tx(lang, { fr: 'Actions', ar: 'إجراءات', en: 'Actions', es: 'Acciones', pt: 'Ações', tr: 'İşlemler' })}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                      {filteredUsers.map(u => (
                        <motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-slate-50/50 dark:hover:bg-dk-bg/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-dk-elevated flex items-center justify-center text-slate-600 dark:text-dk-text font-bold">{(u.name || u.email).charAt(0).toUpperCase()}</div>
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-dk-text text-sm">{u.name || '—'}</div>
                                <div className="text-xs text-slate-500 dark:text-dk-muted">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'}`}>
                              {u.role === 'admin' ? <Shield className="w-3 h-3 mr-1" /> : <User className="w-3 h-3 mr-1" />}
                              {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-end">
                            <div className="flex items-center justify-end gap-2">
                              <select value={u.role} onChange={e => handleRoleUpdate(u.id, e.target.value as 'user' | 'admin')} disabled={u.id === user?.id}
                                className="text-sm rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-bg text-slate-700 dark:text-dk-text focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 px-2 py-1">
                                <option value="user">user</option>
                                <option value="admin">admin</option>
                              </select>
                              <button onClick={() => handleDeleteUser(u.id)} disabled={u.id === user?.id} className="p-2 text-slate-400 dark:text-dk-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {!loadingUsers && filteredUsers.length === 0 && (
                <div className="p-8 text-center text-slate-500 dark:text-dk-muted text-sm">{tx(lang, { fr: 'Aucun compte trouvé.', ar: 'لا توجد حسابات.', en: 'No accounts found.', es: 'No se encontraron cuentas.', pt: 'Nenhuma conta encontrada.', tr: 'Hesap bulunamadı.' })}</div>
              )}
            </div>
          </div>
        )}

        {/* ── DATA TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'data' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-slate-800 dark:text-dk-text text-sm">{tx(lang, { fr: 'Exporter toutes les données', ar: 'تصدير جميع البيانات', en: 'Export all data', es: 'Exportar todos los datos', pt: 'Exportar todos os dados', tr: 'Tüm verileri dışa aktar' })}</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-dk-muted mb-4">{tx(lang, { fr: 'Fichier JSON complet : utilisateurs, modèles, stock, paramètres.', ar: 'ملف JSON كامل: المستخدمون، النماذج، المخزون، الإعدادات.', en: 'Complete JSON file: users, models, stock, settings.', es: 'Archivo JSON completo: usuarios, modelos, stock, ajustes.', pt: 'Ficheiro JSON completo: utilizadores, modelos, stock, definições.', tr: 'Tam JSON dosyası: kullanıcılar, modeller, stok, ayarlar.' })}</p>
              <button onClick={handleExportAllData} className="w-full py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> {tx(lang, { fr: 'Télécharger JSON', ar: 'تنزيل JSON', en: 'Download JSON', es: 'Descargar JSON', pt: 'Baixar JSON', tr: 'JSON indir' })}
              </button>
            </div>

            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <GitMerge className="w-4 h-4 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" />
                <h3 className="font-bold text-slate-800 dark:text-dk-text text-sm">{tx(lang, { fr: 'Fusionner vers un compte', ar: 'دمج إلى حساب', en: 'Merge to an account', es: 'Fusionar a una cuenta', pt: 'Mesclar para uma conta', tr: 'Bir hesaba birleştir' })}</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-dk-muted mb-3">{tx(lang, { fr: 'Consolider toutes les données dans un seul compte email.', ar: 'دمج جميع البيانات في حساب بريد واحد.', en: 'Consolidate all data into a single email account.', es: 'Consolidar todos los datos en una sola cuenta.', pt: 'Consolidar todos os dados numa única conta.', tr: 'Tüm verileri tek bir hesapta birleştir.' })}</p>
              <div className="space-y-3">
                <input type="email" value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} placeholder={tx(lang, { fr: 'email cible', ar: 'البريد المستهدف', en: 'target email', es: 'correo objetivo', pt: 'e-mail alvo', tr: 'hedef e-posta' })} className={inputCls} />
                <button onClick={handleMergeToUser} disabled={mergeLoading} className="w-full py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  <GitMerge className="w-4 h-4" /> {mergeLoading ? tx(lang, { fr: 'Fusion…', ar: 'جارٍ الدمج…', en: 'Merging…', es: 'Fusionando…', pt: 'A mesclar…', tr: 'Birleştiriliyor…' }) : tx(lang, { fr: 'Fusionner', ar: 'دمج', en: 'Merge', es: 'Fusionar', pt: 'Mesclar', tr: 'Birleştir' })}
                </button>
                {mergeResult && <div className={`text-xs font-medium p-3 rounded-lg ${mergeResult.startsWith('✅') ? 'bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-900/30 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'}`}>{mergeResult}</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── LICENSE TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'license' && (
          <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm p-5 sm:p-6 space-y-4 max-w-2xl">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
              <h2 className="text-sm font-bold text-slate-700 dark:text-dk-text uppercase tracking-wide">{tx(lang, { fr: 'Licence / Abonnement', ar: 'الترخيص / الاشتراك', en: 'License / Subscription', es: 'Licencia / Suscripción', pt: 'Licença / Subscrição', tr: 'Lisans / Abonelik' })}</h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-dk-muted">{tx(lang, { fr: 'Activez BERAMETHODE avec votre clé de licence.', ar: 'فعّل BERAMETHODE باستعمال مفتاح الترخيص الخاص بك.', en: 'Activate BERAMETHODE with your license key.', es: 'Active BERAMETHODE con su clave de licencia.', pt: 'Ative o BERAMETHODE com a sua chave de licença.', tr: 'BERAMETHODE’u lisans anahtarınızla etkinleştirin.' })}</p>
            <LicenseActivation lang={lang === 'ar' ? 'ar' : 'fr'} />
          </div>
        )}

        {/* CREATE USER MODAL */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
            <div className="bg-white dark:bg-dk-surface rounded-2xl p-6 w-full max-w-md shadow-2xl dark:shadow-dk-elevated" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4 text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Créer un compte', ar: 'إنشاء حساب', en: 'Create an account', es: 'Crear una cuenta', pt: 'Criar uma conta', tr: 'Hesap oluştur' })}</h2>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-dk-muted uppercase mb-1.5">{tx(lang, { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' })}</label>
                  <input type="text" required className={inputCls} value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-dk-muted uppercase mb-1.5">{tx(lang, { fr: 'Email', ar: 'البريد الإلكتروني', en: 'Email', es: 'Correo', pt: 'E-mail', tr: 'E-posta' })}</label>
                  <input type="email" required className={inputCls} value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-dk-muted uppercase mb-1.5">{tx(lang, { fr: 'Mot de passe', ar: 'كلمة السر', en: 'Password', es: 'Contraseña', pt: 'Palavra-passe', tr: 'Şifre' })}</label>
                  <input type="password" required className={inputCls} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-slate-600 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-bg rounded-lg font-medium text-sm">{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}</button>
                  <button type="submit" className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg font-bold hover:bg-emerald-700">{tx(lang, { fr: 'Créer', ar: 'إنشاء', en: 'Create', es: 'Crear', pt: 'Criar', tr: 'Oluştur' })}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
