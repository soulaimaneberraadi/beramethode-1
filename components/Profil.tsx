import React, { useState, useEffect } from 'react';
import DiagnosticSync from './DiagnosticSync';
import { Mail, Shield, ChevronRight, Lock, Check, Briefcase, Phone, Eye, Pencil, KeyRound } from 'lucide-react';
import { useAuth } from '../src/context/AuthContext';
import { usePermissions } from '../src/context/PermissionsContext';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';
import PermissionsManager from './PermissionsManager';
import { PROTECTED_PAGES, pageLabel, fieldLabel } from '../app/permissionCatalog';

type MyAccessResp = {
  ok: boolean;
  isSuper?: boolean;
  roleId?: string | null;
  pages?: Record<string, { view?: boolean; edit?: boolean }>;
  fields?: Record<string, { view?: boolean; edit?: boolean }>;
  hiddenPages?: string[];
  accountType?: string;
  level?: number;
  roleName?: string | null;
  parentRoleId?: string | null;
  overrides?: { resource_type: 'page' | 'field'; resource_key: string; can_view: 0 | 1; can_edit: 0 | 1 }[];
};

const ACCENT = '#2149C1';

/**
 * Page Profil — style Minimalist SaaS (langage Planning).
 * - Infos personnelles de l'utilisateur connecté.
 * - Pour admin/patron (isSuper) : section « Équipe & Permissions » (PermissionsManager).
 * - Carte Abonnement/Workspace : placeholder BETA (intégration BERA MASTER différée).
 */
export default function Profil() {
  const [diagnosticOuvert, setDiagnosticOuvert] = React.useState(false);
  const { user } = useAuth();
  const { lang } = useLang();
  const { isSuper, roleId } = usePermissions();
  const [showAccess, setShowAccess] = useState(false);

  // Mes accès (lecture seule) — chargé directement via /api/permissions/me
  const [myAccess, setMyAccess] = useState<MyAccessResp | null>(null);
  const [myAccessLoading, setMyAccessLoading] = useState(true);
  useEffect(() => {
    fetch('/api/permissions/me', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d?.ok) setMyAccess(d); })
      .catch(() => {})
      .finally(() => setMyAccessLoading(false));
  }, []);

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
        : tx(lang, { fr: 'Indépendant', ar: 'مستقل', en: 'Independent', es: 'Independiente', pt: 'Independiente', tr: 'Bağımsız' })));

  return (
    <div className="h-full w-full overflow-y-auto p-4 md:p-8 custom-scrollbar" dir="ltr">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Profil — en-tête */}
        <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border p-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center text-white text-[18px] font-semibold shrink-0" style={{ background: ACCENT }}>
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold text-slate-900 dark:text-dk-text truncate">{form.name || user?.name || tx(lang, { fr: 'Mon profil', ar: 'ملفي الشخصي', en: 'My profile', es: 'Mi perfil', pt: 'Meu perfil', tr: 'Profilim' })}{form.metier && <span className="text-[12px] font-normal text-slate-400 dark:text-dk-muted"> · {form.metier}</span>}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border border-indigo-200 dark:border-dk-border bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text">
                  <Shield size={11} strokeWidth={1.75} /> {roleLabel}
                </span>
                {user?.email && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-dk-muted">
                    <Mail size={11} strokeWidth={1.75} /> {user.email}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SYNCHRONISATION — le diagnostic, ICI et pas dans une page a part.
            Sur iPhone, l'application ajoutee a l'ecran d'accueil ne partage pas
            son stockage avec Safari : une page ouverte dans le navigateur ne
            voit pas la session de l'application et conclut « pas connecte »,
            sur un telephone pourtant connecte. Lance depuis l'application, le
            diagnostic lit forcement le bon coffre. */}
        <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border p-5">
          <h2 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text mb-1">{tx(lang, { fr: 'Synchronisation entre appareils', ar: 'المزامنة بين الأجهزة', en: 'Sync between devices', es: 'Sincronización entre dispositivos', pt: 'Sincronização entre aparelhos', tr: 'Cihazlar arasi esitleme' })}</h2>
          <p className="text-[12px] text-slate-500 dark:text-dk-muted mb-3">{tx(lang, {
            fr: "Vos données n'arrivent pas sur l'autre téléphone ? Lancez le diagnostic sur les deux : il interroge le serveur et montre lequel des deux est en cause.",
            ar: 'بياناتك لا تصل إلى الهاتف الآخر؟ شغّل التشخيص على الاثنين: يسأل الخادم ويُظهر أين الخلل.',
            en: "Data not reaching the other phone? Run the diagnostic on both: it queries the server and shows which side is at fault.",
            es: '¿Los datos no llegan al otro teléfono? Ejecute el diagnóstico en ambos: consulta el servidor y muestra dónde está el fallo.',
            pt: 'Os dados não chegam ao outro telemóvel? Execute o diagnóstico nos dois: interroga o servidor e mostra onde está a falha.',
            tr: 'Veriler diger telefona ulasmiyor mu? Tanilamayi ikisinde de calistirin: sunucuya sorar ve hangisinin sorunlu oldugunu gosterir.',
          })}</p>
          <button
            type="button"
            onClick={() => setDiagnosticOuvert(true)}
            className="h-9 px-4 rounded-lg bg-slate-900 dark:bg-dk-elevated text-white text-[12px] font-bold"
          >
            {tx(lang, { fr: 'Lancer le diagnostic', ar: 'شغّل التشخيص', en: 'Run the diagnostic', es: 'Ejecutar el diagnóstico', pt: 'Executar o diagnóstico', tr: 'Tanilamayi calistir' })}
          </button>
        </div>

        {/* Mes informations — profil personnel (persiste au-delà de la société) */}
        <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border p-5">
          <h2 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text mb-3">{tx(lang, { fr: 'Mes informations', ar: 'معلوماتي', en: 'My information', es: 'Mi información', pt: 'Minhas informações', tr: 'Bilgilerim' })}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500 dark:text-dk-text-soft">{tx(lang, { fr: 'Nom complet', ar: 'الاسم الكامل', en: 'Full name', es: 'Nombre completo', pt: 'Nome completo', tr: 'Ad Soyad' })}</span>
              <input value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                className="mt-1 w-full px-2.5 h-8 rounded-md border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/60 dark:bg-dk-bg/60 focus:bg-white dark:focus:bg-dk-surface focus:outline-none focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-border text-[13px] text-slate-700 dark:text-dk-text" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500 dark:text-dk-text-soft inline-flex items-center gap-1"><Briefcase size={11} strokeWidth={1.75} /> {tx(lang, { fr: 'Métier', ar: 'المهنة', en: 'Job role', es: 'Profesión', pt: 'Profissão', tr: 'Meslek' })}</span>
              <input value={form.metier} onChange={e => setForm(s => ({ ...s, metier: e.target.value }))} placeholder={tx(lang, { fr: 'Méthode, Commercial…', ar: 'هندسة الطرق، تجاري…', en: 'Methods, Sales…', es: 'Métodos, Comercial…', pt: 'Métodos, Comercial…', tr: 'Yöntemler, Satış…' })}
                className="mt-1 w-full px-2.5 h-8 rounded-md border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/60 dark:bg-dk-bg/60 focus:bg-white dark:focus:bg-dk-surface focus:outline-none focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-border text-[13px] text-slate-700 dark:text-dk-text" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500 dark:text-dk-text-soft inline-flex items-center gap-1"><Phone size={11} strokeWidth={1.75} /> {tx(lang, { fr: 'Téléphone', ar: 'الهاتف', en: 'Phone', es: 'Teléfono', pt: 'Telefone', tr: 'Telefon' })}</span>
              <input value={form.phone} onChange={e => setForm(s => ({ ...s, phone: e.target.value }))} placeholder={tx(lang, { fr: '06 …', ar: '06 …', en: '06 …', es: '06 …', pt: '06 …', tr: '06 …' })}
                className="mt-1 w-full px-2.5 h-8 rounded-md border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/60 dark:bg-dk-bg/60 focus:bg-white dark:focus:bg-dk-surface focus:outline-none focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-border text-[13px] text-slate-700 dark:text-dk-text" />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={saveProfile} disabled={saving} className="h-8 px-3 rounded-md text-white text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50" style={{ background: ACCENT }}>
              <Check size={14} strokeWidth={2} /> {saving ? tx(lang, { fr: 'Enregistrement…', ar: 'جارٍ الحفظ…', en: 'Saving…', es: 'Guardando…', pt: 'Salvando…', tr: 'Kaydediliyor…' }) : tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Salvar', tr: 'Kaydet' })}
            </button>
            {saved && <span className="text-[12px] text-emerald-600 dark:text-emerald-400 dark:text-green-300 inline-flex items-center gap-1"><Check size={13} strokeWidth={2} /> {tx(lang, { fr: 'Enregistré', ar: 'تم الحفظ', en: 'Saved', es: 'Guardado', pt: 'Salvo', tr: 'Kaydedildi' })}</span>}
          </div>
        </div>

        {/* Mes accès — lecture seule, visible par tous */}
        <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border p-5">
          <h2 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text mb-3 flex items-center gap-2">
            <KeyRound size={14} strokeWidth={1.75} className="text-slate-400 dark:text-dk-muted" />
            {tx(lang, { fr: 'Mes accès', ar: 'صلاحياتي', en: 'My access', es: 'Mis accesos', pt: 'Meus acessos', tr: 'Erişimlerim' })}
          </h2>

          {myAccessLoading ? (
            <p className="text-[12px] text-slate-400 dark:text-dk-muted">
              {tx(lang, { fr: 'Chargement…', ar: 'جارٍ التحميل…', en: 'Loading…', es: 'Cargando…', pt: 'Carregando…', tr: 'Yükleniyor…' })}
            </p>
          ) : !myAccess ? (
            <p className="text-[12px] text-slate-400 dark:text-dk-muted">
              {tx(lang, { fr: 'Informations d’accès indisponibles pour le moment.', ar: 'معلومات الصلاحيات غير متوفرة حالياً.', en: 'Access information is currently unavailable.', es: 'Información de accesos no disponible por el momento.', pt: 'Informações de acesso indisponíveis no momento.', tr: 'Erişim bilgileri şu anda kullanılamıyor.' })}
            </p>
          ) : myAccess.isSuper ? (
            <p className="text-[12px] text-slate-500 dark:text-dk-text-soft leading-relaxed">
              {tx(lang, { fr: 'Vous avez un accès complet à cette société.', ar: 'لديك صلاحية كاملة على هذه الشركة.', en: 'You have full access to this company.', es: 'Tiene acceso completo a esta empresa.', pt: 'Você tem acesso total a esta empresa.', tr: 'Bu şirkete tam erişiminiz var.' })}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border border-indigo-200 dark:border-dk-border bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text">
                  <Shield size={11} strokeWidth={1.75} />
                  {myAccess.roleName || tx(lang, { fr: 'Aucun rôle assigné', ar: 'لا يوجد دور مسند', en: 'No role assigned', es: 'Sin rol asignado', pt: 'Nenhum papel atribuído', tr: 'Atanmış rol yok' })}
                </span>
                {typeof myAccess.level === 'number' && myAccess.level >= 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/60 text-slate-500 dark:text-dk-text-soft">
                    {tx(lang, { fr: 'Niveau', ar: 'المستوى', en: 'Level', es: 'Nivel', pt: 'Nível', tr: 'Seviye' })} {myAccess.level}
                  </span>
                )}
              </div>

              {/* Pages accessibles */}
              <div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-dk-text-soft">
                  {tx(lang, { fr: 'Pages accessibles', ar: 'الصفحات المتاحة', en: 'Accessible pages', es: 'Páginas accesibles', pt: 'Páginas acessíveis', tr: 'Erişilebilir sayfalar' })}
                </span>
                <div className="mt-2 space-y-0.5">
                  {PROTECTED_PAGES.filter(pg => myAccess.pages?.[pg]?.view).map(pg => {
                    const p = myAccess.pages![pg];
                    return (
                      <div key={pg} className="flex items-center justify-between py-0.5">
                        <span className="text-[13px] text-slate-600 dark:text-dk-text-soft">{pageLabel(pg, lang)}</span>
                        <div className="flex items-center gap-2 text-slate-400 dark:text-dk-muted">
                          <Eye size={13} strokeWidth={1.75} className="text-emerald-500 dark:text-emerald-400" />
                          {p?.edit && <Pencil size={13} strokeWidth={1.75} className="text-indigo-500 dark:text-indigo-400" />}
                        </div>
                      </div>
                    );
                  })}
                  {PROTECTED_PAGES.filter(pg => myAccess.pages?.[pg]?.view).length === 0 && (
                    <p className="text-[12px] text-slate-400 dark:text-dk-muted">
                      {tx(lang, { fr: 'Aucune page accessible.', ar: 'لا توجد صفحة متاحة.', en: 'No accessible pages.', es: 'Ninguna página accesible.', pt: 'Nenhuma página acessível.', tr: 'Erişilebilir sayfa yok.' })}
                    </p>
                  )}
                </div>
              </div>

              {/* Exceptions personnelles */}
              {myAccess.overrides && myAccess.overrides.length > 0 && (
                <div>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-dk-text-soft">
                    {tx(lang, { fr: 'Exceptions personnelles', ar: 'استثناءات شخصية', en: 'Personal exceptions', es: 'Excepciones personales', pt: 'Exceções pessoais', tr: 'Kişisel istisnalar' })}
                  </span>
                  <p className="text-[11px] text-slate-400 dark:text-dk-muted mt-0.5">
                    {tx(lang, { fr: 'Ces exceptions priment sur votre rôle.', ar: 'هذه الاستثناءات لها الأولوية على دورك.', en: 'These exceptions take priority over your role.', es: 'Estas excepciones tienen prioridad sobre su rol.', pt: 'Essas exceções têm prioridade sobre seu papel.', tr: 'Bu istisnalar rolünüzden önceliklidir.' })}
                  </p>
                  <div className="mt-2 space-y-1">
                    {myAccess.overrides.map((ov, i) => (
                      <div key={`${ov.resource_type}-${ov.resource_key}-${i}`} className="flex items-center justify-between py-0.5">
                        <span className="text-[13px] text-slate-600 dark:text-dk-text-soft">
                          {ov.resource_type === 'page' ? pageLabel(ov.resource_key, lang) : fieldLabel(ov.resource_key, lang)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${ov.can_view ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700'}`}>
                            <Eye size={9} strokeWidth={2} className="inline -mt-0.5 mr-0.5" />
                            {ov.can_view
                              ? tx(lang, { fr: 'Autorisé', ar: 'مسموح', en: 'Allowed', es: 'Permitido', pt: 'Permitido', tr: 'İzinli' })
                              : tx(lang, { fr: 'Interdit', ar: 'ممنوع', en: 'Denied', es: 'Denegado', pt: 'Negado', tr: 'Reddedildi' })}
                          </span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${ov.can_edit ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700'}`}>
                            <Pencil size={9} strokeWidth={2} className="inline -mt-0.5 mr-0.5" />
                            {ov.can_edit
                              ? tx(lang, { fr: 'Autorisé', ar: 'مسموح', en: 'Allowed', es: 'Permitido', pt: 'Permitido', tr: 'İzinli' })
                              : tx(lang, { fr: 'Interdit', ar: 'ممنوع', en: 'Denied', es: 'Denegado', pt: 'Negado', tr: 'Reddedildi' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Équipe & Permissions — admin/patron uniquement */}
        {isSuper && (
          <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border overflow-hidden">
            <button onClick={() => setShowAccess(s => !s)} className="w-full flex items-center justify-between px-5 h-12 hover:bg-slate-50/60 dark:hover:bg-dk-elevated/60">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-900 dark:text-dk-text">
                <Shield size={14} strokeWidth={1.75} className="text-slate-400 dark:text-dk-muted" /> {tx(lang, { fr: 'Équipe & Permissions', ar: 'الفريق والصلاحيات', en: 'Team & Permissions', es: 'Equipo y Permisos', pt: 'Equipe e Permissões', tr: 'Ekip ve İzinler' })}
              </span>
              <ChevronRight size={15} strokeWidth={1.75} className={`text-slate-400 dark:text-dk-muted transition-transform ${showAccess ? 'rotate-90' : ''}`} />
            </button>
            {!showAccess && (
              <p className="px-5 pb-4 -mt-1 text-[11px] text-slate-400 dark:text-dk-muted">
                {tx(lang, { fr: 'Invitez des membres, organisez la hiérarchie, définissez ce que chacun voit et modifie (pages + champs sensibles).', ar: 'دعوة الأعضاء، تنظيم التسلسل الهرمي، وتحديد ما يراه ويعدّله كل واحد (صفحات + حقول حساسة).', en: 'Invite members, organize the hierarchy, and define what each person can see and edit (pages + sensitive fields).', es: 'Invite miembros, organice la jerarquía y defina lo que cada uno ve y modifica (páginas + campos sensibles).', pt: 'Convide membros, organize a hierarquia e defina o que cada um vê e modifica (páginas + campos sensíveis).', tr: 'Üyeleri davet edin, hiyerarşiyi düzenleyin ve her kişinin neyi görüp düzenleyebileceğini tanımlayın (sayfalar + hassas alanlar).' })}
              </p>
            )}
            {showAccess && (
              <div className="border-t border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/30 dark:bg-dk-bg">
                <PermissionsManager />
              </div>
            )}
          </div>
        )}

        {/* Abonnement / Workspace — BETA (différé : intégration BERA MASTER) */}
        <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text flex items-center gap-2">
              <Lock size={14} strokeWidth={1.75} className="text-slate-400 dark:text-dk-muted" /> {tx(lang, { fr: 'Abonnement & Workspace', ar: 'الاشتراك ومساحة العمل', en: 'Subscription & Workspace', es: 'Suscripción y Workspace', pt: 'Assinatura e Workspace', tr: 'Abonelik ve Workspace' })}
            </h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 dark:text-amber-300 border border-amber-200 dark:border-amber-700">BETA</span>
          </div>
          <p className="text-[12px] text-slate-500 dark:text-dk-text-soft leading-relaxed">
            {tx(lang, { fr: 'La gestion de l’abonnement (statut, paiement, formule) sera pilotée depuis', ar: 'إدارة الاشتراك (الحالة، الدفع، الصيغة) سيتم التحكم فيها من', en: 'Subscription management (status, payment, plan) will be handled from', es: 'La gestión de la suscripción (estado, pago, plan) se gestionará desde', pt: 'A gestão da assinatura (status, pagamento, plano) será feita a partir de', tr: 'Abonelik yönetimi (durum, ödeme, plan)' })} <span className="font-medium text-slate-700 dark:text-dk-text">BERA MASTER</span>.
            {' '}{tx(lang, { fr: 'Chaque société = un workspace dédié. Cette section est en cours de préparation.', ar: 'كل شركة = مساحة عمل مخصّصة. هذا القسم قيد التحضير.', en: 'Each company = a dedicated workspace. This section is being prepared.', es: 'Cada empresa = un workspace dedicado. Esta sección está en preparación.', pt: 'Cada empresa = um workspace dedicado. Esta seção está em preparação.', tr: 'üzerinden yönetilecektir. Her şirket = ayrılmış bir workspace. Bu bölüm hazırlanmaktadır.' })}
          </p>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400 dark:text-dk-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-dk-muted" /> {tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum' })} : <span className="tabular-nums">{tx(lang, { fr: 'en développement', ar: 'قيد التطوير', en: 'in development', es: 'en desarrollo', pt: 'em desenvolvimento', tr: 'geliştirme aşamasında' })}</span>
          </div>
        </div>

      </div>

      {diagnosticOuvert && <DiagnosticSync onClose={() => setDiagnosticOuvert(false)} />}
    </div>
  );
}
