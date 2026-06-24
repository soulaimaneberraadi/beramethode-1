import React, { useState, useEffect } from 'react';
import { Mail, Shield, ChevronRight, Lock, Check, Briefcase, Phone } from 'lucide-react';
import { useAuth } from '../src/context/AuthContext';
import { usePermissions } from '../src/context/PermissionsContext';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';
import PermissionsManager from './PermissionsManager';

const ACCENT = '#2149C1';

/**
 * Page Profil — style Minimalist SaaS (langage Planning).
 * - Infos personnelles de l'utilisateur connecté.
 * - Pour admin/patron (isSuper) : section « Équipe & Permissions » (PermissionsManager).
 * - Carte Abonnement/Workspace : placeholder BETA (intégration BERA MASTER différée).
 */
export default function Profil() {
  const { user } = useAuth();
  const { lang } = useLang();
  const { isSuper, roleId } = usePermissions();
  const [showAccess, setShowAccess] = useState(false);

  // Profil personnel (user_profiles) — chargé/sauvegardé via /api/profile/me
  const [form, setForm] = useState({ name: '', phone: '', metier: '' });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch('/api/profile/me', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok) setForm({ name: d.account?.name || '', phone: d.profile?.phone || '', metier: d.profile?.metier || '' }); })
      .catch(() => {});
  }, []);
  const saveProfile = async () => {
    setSaving(true); setSaved(false);
    try {
      await fetch('/api/profile/me', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const initials = (form.name || user?.name) ? (form.name || user!.name).substring(0, 2).toUpperCase() : (user?.email?.[0]?.toUpperCase() || '?');
  const roleLabel = user?.role === 'admin'
    ? tx(lang, { fr: 'Administrateur', ar: 'مسؤول', en: 'Administrator', es: 'Administrador', pt: 'Administrador', tr: 'Yönetici' })
    : (isSuper
      ? tx(lang, { fr: 'Patron', ar: 'المسؤول الأول', en: 'Owner', es: 'Jefe', pt: 'Chefe', tr: 'Patron' })
      : (roleId
        ? tx(lang, { fr: 'Membre', ar: 'عضو', en: 'Member', es: 'Miembro', pt: 'Membro', tr: 'Üye' })
        : tx(lang, { fr: 'Indépendant', ar: 'مستقل', en: 'Independent', es: 'Independiente', pt: 'Independente', tr: 'Bağımsız' })));

  return (
    <div className="h-full w-full overflow-y-auto p-4 md:p-8 custom-scrollbar" dir="ltr">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Profil — en-tête */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center text-white text-[18px] font-semibold shrink-0" style={{ background: ACCENT }}>
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold text-slate-900 truncate">{form.name || user?.name || tx(lang, { fr: 'Mon profil', ar: 'ملفي الشخصي', en: 'My profile', es: 'Mi perfil', pt: 'Meu perfil', tr: 'Profilim' })}{form.metier && <span className="text-[12px] font-normal text-slate-400"> · {form.metier}</span>}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border" style={{ color: ACCENT, borderColor: '#c7d2fe', background: '#eef2ff' }}>
                  <Shield size={11} strokeWidth={1.75} /> {roleLabel}
                </span>
                {user?.email && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <Mail size={11} strokeWidth={1.75} /> {user.email}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mes informations — profil personnel (persiste au-delà de la société) */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-[13px] font-semibold text-slate-900 mb-3">{tx(lang, { fr: 'Mes informations', ar: 'معلوماتي', en: 'My information', es: 'Mi información', pt: 'Minhas informações', tr: 'Bilgilerim' })}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500">{tx(lang, { fr: 'Nom complet', ar: 'الاسم الكامل', en: 'Full name', es: 'Nombre completo', pt: 'Nome completo', tr: 'Ad Soyad' })}</span>
              <input value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                className="mt-1 w-full px-2.5 h-8 rounded-md border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100 text-[13px] text-slate-700" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500 inline-flex items-center gap-1"><Briefcase size={11} strokeWidth={1.75} /> {tx(lang, { fr: 'Métier', ar: 'المهنة', en: 'Job role', es: 'Profesión', pt: 'Profissão', tr: 'Meslek' })}</span>
              <input value={form.metier} onChange={e => setForm(s => ({ ...s, metier: e.target.value }))} placeholder={tx(lang, { fr: 'Méthode, Commercial…', ar: 'هندسة الطرق، تجاري…', en: 'Methods, Sales…', es: 'Métodos, Comercial…', pt: 'Métodos, Comercial…', tr: 'Yöntemler, Satış…' })}
                className="mt-1 w-full px-2.5 h-8 rounded-md border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100 text-[13px] text-slate-700" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500 inline-flex items-center gap-1"><Phone size={11} strokeWidth={1.75} /> {tx(lang, { fr: 'Téléphone', ar: 'الهاتف', en: 'Phone', es: 'Teléfono', pt: 'Telefone', tr: 'Telefon' })}</span>
              <input value={form.phone} onChange={e => setForm(s => ({ ...s, phone: e.target.value }))} placeholder={tx(lang, { fr: '06 …', ar: '06 …', en: '06 …', es: '06 …', pt: '06 …', tr: '06 …' })}
                className="mt-1 w-full px-2.5 h-8 rounded-md border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100 text-[13px] text-slate-700" />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={saveProfile} disabled={saving} className="h-8 px-3 rounded-md text-white text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50" style={{ background: ACCENT }}>
              <Check size={14} strokeWidth={2} /> {saving ? tx(lang, { fr: 'Enregistrement…', ar: 'جارٍ الحفظ…', en: 'Saving…', es: 'Guardando…', pt: 'Salvando…', tr: 'Kaydediliyor…' }) : tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Salvar', tr: 'Kaydet' })}
            </button>
            {saved && <span className="text-[12px] text-emerald-600 inline-flex items-center gap-1"><Check size={13} strokeWidth={2} /> {tx(lang, { fr: 'Enregistré', ar: 'تم الحفظ', en: 'Saved', es: 'Guardado', pt: 'Salvo', tr: 'Kaydedildi' })}</span>}
          </div>
        </div>

        {/* Équipe & Permissions — admin/patron uniquement */}
        {isSuper && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <button onClick={() => setShowAccess(s => !s)} className="w-full flex items-center justify-between px-5 h-12 hover:bg-slate-50/60">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                <Shield size={14} strokeWidth={1.75} className="text-slate-400" /> {tx(lang, { fr: 'Équipe & Permissions', ar: 'الفريق والصلاحيات', en: 'Team & Permissions', es: 'Equipo y Permisos', pt: 'Equipe e Permissões', tr: 'Ekip ve İzinler' })}
              </span>
              <ChevronRight size={15} strokeWidth={1.75} className={`text-slate-400 transition-transform ${showAccess ? 'rotate-90' : ''}`} />
            </button>
            {!showAccess && (
              <p className="px-5 pb-4 -mt-1 text-[11px] text-slate-400">
                {tx(lang, { fr: 'Invitez des membres, organisez la hiérarchie, définissez ce que chacun voit et modifie (pages + champs sensibles).', ar: 'دعوة الأعضاء، تنظيم التسلسل الهرمي، وتحديد ما يراه ويعدّله كل واحد (صفحات + حقول حساسة).', en: 'Invite members, organize the hierarchy, and define what each person can see and edit (pages + sensitive fields).', es: 'Invite miembros, organice la jerarquía y defina lo que cada uno ve y modifica (páginas + campos sensibles).', pt: 'Convide membros, organize a hierarquia e defina o que cada um vê e modifica (páginas + campos sensíveis).', tr: 'Üyeleri davet edin, hiyerarşiyi düzenleyin ve her kişinin neyi görüp düzenleyebileceğini tanımlayın (sayfalar + hassas alanlar).' })}
              </p>
            )}
            {showAccess && (
              <div className="border-t border-slate-100 bg-slate-50/30">
                <PermissionsManager />
              </div>
            )}
          </div>
        )}

        {/* Abonnement / Workspace — BETA (différé : intégration BERA MASTER) */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-slate-900 flex items-center gap-2">
              <Lock size={14} strokeWidth={1.75} className="text-slate-400" /> {tx(lang, { fr: 'Abonnement & Workspace', ar: 'الاشتراك ومساحة العمل', en: 'Subscription & Workspace', es: 'Suscripción y Workspace', pt: 'Assinatura e Workspace', tr: 'Abonelik ve Workspace' })}
            </h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200">BETA</span>
          </div>
          <p className="text-[12px] text-slate-500 leading-relaxed">
            {tx(lang, { fr: 'La gestion de l’abonnement (statut, paiement, formule) sera pilotée depuis', ar: 'إدارة الاشتراك (الحالة، الدفع، الصيغة) سيتم التحكم فيها من', en: 'Subscription management (status, payment, plan) will be handled from', es: 'La gestión de la suscripción (estado, pago, plan) se gestionará desde', pt: 'A gestão da assinatura (status, pagamento, plano) será feita a partir de', tr: 'Abonelik yönetimi (durum, ödeme, plan)' })} <span className="font-medium text-slate-700">BERA MASTER</span>.
            {' '}{tx(lang, { fr: 'Chaque société = un workspace dédié. Cette section est en cours de préparation.', ar: 'كل شركة = مساحة عمل مخصّصة. هذا القسم قيد التحضير.', en: 'Each company = a dedicated workspace. This section is being prepared.', es: 'Cada empresa = un workspace dedicado. Esta sección está en preparación.', pt: 'Cada empresa = um workspace dedicado. Esta seção está em preparação.', tr: 'üzerinden yönetilecektir. Her şirket = ayrılmış bir workspace. Bu bölüm hazırlanmaktadır.' })}
          </p>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> {tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum' })} : <span className="tabular-nums">{tx(lang, { fr: 'en développement', ar: 'قيد التطوير', en: 'in development', es: 'en desarrollo', pt: 'em desenvolvimento', tr: 'geliştirme aşamasında' })}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
