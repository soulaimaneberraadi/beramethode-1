import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Shield, Plus, Trash2, Check, UserPlus, Eye, Pencil, X, Users } from 'lucide-react';
import { PROTECTED_PAGES, PROTECTED_FIELDS, ROLE_PRESETS, RolePresetKey } from '../server/permissions/presets';
import { useLang } from '../src/context/LanguageContext';
import { useIsDark } from '../src/context/ThemeContext';
import { tx } from '../lib/i18n';

/**
 * Gestionnaire de permissions — arbre type « Device Manager ».
 * Style : Minimalist SaaS (langage Planning) — slate, accent #2149C1,
 * rounded-md/lg, font-medium/semibold, icônes fines text-slate-400 dark:text-dk-muted, pas de gradients.
 */

interface Role { id: string; name: string; level: number; parent_role_id: string | null; is_system: number; }
interface Member { id: string; user_id: number; role_id: string; status: string; email: string; name: string; role_name: string; level: number; }
interface PermRow { resource_type: 'page' | 'field'; resource_key: string; can_view: number; can_edit: number; }

const ACCENT = '#2149C1';

const PAGE_LABELS: Record<string, string> = {
  dashboard: 'Tableau de bord', ingenierie: 'Ingénierie', atelier: 'Chef Atelier',
  atelierProd: 'Atelier Prod', library: 'Bibliothèque', coupe: 'La Coupe', effectifs: 'Effectifs',
  gestionRh: 'Gestion RH', planning: '{tx(lang, {fr:"Planning",ar:"التخطيط",en:"Planning",es:"Planificación",pt:"Planejamento",tr:"Planlama"})}', suivi: '{tx(lang, {fr:"Suivi",ar:"المتابعة",en:"Tracking",es:"Seguimiento",pt:"Acompanhamento",tr:"Takip"})}', rendement: 'Rendement', magasin: 'Magasin',
  export: 'Export', facturation: 'Facturation', config: 'Paramètres', pageMachine: 'Page Machine',
  machin: 'Machines', objectifs: 'Objectifs', sousTraitance: '{tx(lang, {fr:"Sous-traitance",ar:"المقاولة من الباطن",en:"Subcontracting",es:"Subcontratación",pt:"Subcontratação",tr:"Taşeronluk"})}',
};
const FIELD_LABELS: Record<string, string> = {
  'model.cout_minute': 'Coût / minute', 'model.prix_revient': 'Prix de revient',
  'hr.salaire': 'Salaires', 'hr.avances': 'Avances', 'facturation.marge': 'Marge',
};

const api = (url: string, opts?: RequestInit) =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts }).then(r => r.json());

export default function PermissionsManager() {
  const { lang } = useLang();
  const isDark = useIsDark();
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [perms, setPerms] = useState<Record<string, PermRow>>({});
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<null | (() => void)>(null);
  const [confirmText, setConfirmText] = useState('');
  const [newRole, setNewRole] = useState<{ name: string; preset: RolePresetKey | '' }>({ name: '', preset: '' });
  const [newMember, setNewMember] = useState({ email: '', name: '', password: '', role_id: '' });
  const [inviteInfo, setInviteInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [r, m] = await Promise.all([api('/api/permissions/roles'), api('/api/permissions/members')]);
    setRoles(r.data || []); setMembers(m.data || []); setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const openRolePerms = async (roleId: string) => {
    if (openRole === roleId) { setOpenRole(null); return; }
    setOpenRole(roleId);
    const res = await api(`/api/permissions/roles/${roleId}/perms`);
    const map: Record<string, PermRow> = {};
    (res.data || []).forEach((p: PermRow) => { map[`${p.resource_type}|${p.resource_key}`] = p; });
    setPerms(map); setDirty(false);
  };

  const toggle = (type: 'page' | 'field', key: string, action: 'view' | 'edit') => {
    const k = `${type}|${key}`;
    setPerms(prev => {
      const cur = prev[k] || { resource_type: type, resource_key: key, can_view: 0, can_edit: 0 };
      const next = { ...cur, [action === 'view' ? 'can_view' : 'can_edit']: (action === 'view' ? cur.can_view : cur.can_edit) ? 0 : 1 };
      if (action === 'view' && next.can_view === 0) next.can_edit = 0;
      if (action === 'edit' && next.can_edit === 1) next.can_view = 1;
      return { ...prev, [k]: next };
    });
    setDirty(true);
  };

  const saveRolePerms = () => {
    setConfirmText(tx(lang, {fr:'Enregistrer les permissions de ce rôle ?',ar:'حفظ صلاحيات هذا الدور؟',en:'Save permissions for this role?',es:'¿Guardar los permisos de este rol?',pt:'Salvar permissões desta função?',tr:'Bu rolün izinlerini kaydet?'}));
    setConfirm(() => async () => {
      const list = Object.values(perms).filter(p => p.can_view || p.can_edit);
      await api(`/api/permissions/roles/${openRole}/perms`, { method: 'PUT', body: JSON.stringify({ perms: list }) });
      setDirty(false); setConfirm(null);
    });
  };

  const createRole = async () => {
    if (!newRole.name) return;
    await api('/api/permissions/roles', { method: 'POST', body: JSON.stringify({ name: newRole.name, preset: newRole.preset || undefined }) });
    setNewRole({ name: '', preset: '' }); void reload();
  };

  const delRole = (id: string) => {
    setConfirmText(tx(lang, {fr:'Supprimer ce rôle ?',ar:'حذف هذا الدور؟',en:'Delete this role?',es:'¿Eliminar este rol?',pt:'Excluir esta função?',tr:'Bu rolü sil?'}));
    setConfirm(() => async () => { await api(`/api/permissions/roles/${id}`, { method: 'DELETE' }); setConfirm(null); void reload(); });
  };

  const addMember = async () => {
    if (!newMember.email || !newMember.role_id) return;
    const res = await api('/api/permissions/members', { method: 'POST', body: JSON.stringify(newMember) });
    if (res?.created && res?.tempPassword) {
      setInviteInfo(tx(lang, {
        fr: `Compte créé. Mot de passe temporaire : ${res.tempPassword} — à communiquer au membre.`,
        ar: `تم إنشاء الحساب. كلمة سر مؤقتة: ${res.tempPassword} — بلّغها للعضو.`,
        en: `Account created. Temporary password: ${res.tempPassword} — share it with the member.`,
        es: `Cuenta creada. Contraseña temporal: ${res.tempPassword} — compártala con el miembro.`,
        pt: `Conta criada. Palavra-passe temporária: ${res.tempPassword} — partilhe com o membro.`,
        tr: `Hesap oluşturuldu. Geçici şifre: ${res.tempPassword} — üyeyle paylaşın.`,
      }));
    } else {
      setInviteInfo(null);
    }
    setNewMember({ email: '', name: '', password: '', role_id: '' }); void reload();
  };

  const removeMember = (userId: number) => {
    setConfirmText('Retirer ce membre ? (garde son profil, perd l’accès aux données)');
    setConfirm(() => async () => { await api(`/api/permissions/members/${userId}`, { method: 'DELETE' }); setConfirm(null); void reload(); });
  };

  const Toggle = ({ on, onClick, icon: Icon }: { on: boolean; onClick: () => void; icon: any }) => (
    <button onClick={onClick}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors ${on ? '' : isDark ? 'bg-dk-bg border-dk-border text-dk-muted' : 'bg-slate-50 dark:bg-dk-bg border-slate-200 dark:border-dk-border text-slate-400 dark:text-dk-muted'}`}
      style={on ? { background: ACCENT, borderColor: ACCENT, color: '#fff' } : undefined}>
      {on ? <Check size={13} strokeWidth={2} /> : <Icon size={13} strokeWidth={1.75} />}
    </button>
  );

  const inputCls = `px-2.5 h-8 rounded-md border focus:outline-none focus:ring-2 text-[13px] ${isDark ? 'bg-dk-bg border-dk-border text-dk-text focus:bg-dk-surface focus:ring-dk-border' : 'bg-slate-50 dark:bg-dk-bg/60 border-slate-200 dark:border-dk-border text-slate-700 dark:text-dk-text-soft focus:bg-white focus:ring-slate-100'}`;

  if (loading) return <div className={`p-8 text-[13px] ${isDark ? 'text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>Chargement…</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5" dir="ltr">
      {/* En-tête */}
      <div className="flex items-center gap-2">
        <Shield size={16} strokeWidth={1.75} className="text-slate-400 dark:text-dk-muted" />
        <div>
          <h2 className={`text-[15px] font-semibold ${isDark ? 'text-dk-text' : 'text-slate-900 dark:text-dk-text'}`}>Permissions & Hiérarchie</h2>
          <p className={`text-[11px] ${isDark ? 'text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>{tx(lang, {fr:"Gérez les rôles, ce que chacun voit et modifie.",ar:"إدارة الأدوار، وما يراه ويعدله كل شخص.",en:"Manage roles, what each person sees and edits.",es:"Gestione roles, lo que cada uno ve y modifica.",pt:"Gerencie funções, o que cada um vê e modifica.",tr:"Rolleri, herkesin ne gördüğünü ve düzenlediğini yönetin."})}</p>
        </div>
      </div>

      {/* Rôles */}
      <div className={`rounded-lg border p-4 ${isDark ? 'bg-dk-surface border-dk-border' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>
        <h3 className={`text-[13px] font-semibold mb-3 ${isDark ? 'text-dk-text' : 'text-slate-900 dark:text-dk-text'}`}>{tx(lang, {fr:"Rôles",ar:"الأدوار",en:"Roles",es:"Roles",pt:"Funções",tr:"Roller"})}</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={newRole.name} onChange={e => setNewRole(s => ({ ...s, name: e.target.value }))} placeholder={tx(lang, {fr:'Nom du rôle',ar:'اسم الدور',en:'Role name',es:'Nombre del rol',pt:'Nome da função',tr:'Rol adı'})} className={`flex-1 min-w-[140px] ${inputCls}`} />
          <select value={newRole.preset} onChange={e => setNewRole(s => ({ ...s, preset: e.target.value as RolePresetKey }))} className={`${inputCls} bg-white dark:bg-dk-surface`}>
            <option value="">{tx(lang, {fr:"Sans preset",ar:"بدون قالب",en:"No preset",es:"Sin plantilla",pt:"Sem predefinição",tr:"Ön ayar yok"})}</option>
            {Object.keys(ROLE_PRESETS).map(k => <option key={k} value={k}>{ROLE_PRESETS[k as RolePresetKey].name}</option>)}
          </select>
          <button onClick={createRole} className="h-8 px-3 rounded-md bg-slate-900 text-white text-[13px] font-medium inline-flex items-center gap-1 hover:bg-slate-800"><Plus size={14} strokeWidth={1.75} /> {tx(lang, {fr:"Ajouter",ar:"إضافة",en:"Add",es:"Añadir",pt:"Adicionar",tr:"Ekle"})}</button>
        </div>

        {roles.length === 0 && <p className={`text-[13px] py-3 text-center ${isDark ? 'text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>{tx(lang, {fr:'Aucun rôle. Créez-en un (avec preset pour démarrer vite).',ar:'لا توجد أدوار. أنشئ واحداً (باستخدام قالب للبدء بسرعة).',en:'No roles. Create one (with a preset to start quickly).',es:'Sin roles. Cree uno (con una plantilla para empezar rápido).',pt:'Nenhuma função. Crie uma (com uma predefinição para começar rapidamente).',tr:'Rol yok. Hızlı başlamak için bir ön ayar ile oluşturun.'})}</p>}

          {roles.map(role => (
          <div key={role.id} className={`rounded-md mb-1.5 overflow-hidden ${isDark ? 'border border-dk-border' : 'border border-slate-100 dark:border-dk-border'}`}>
            <div className={`flex items-center justify-between px-3 h-9 cursor-pointer ${isDark ? 'hover:bg-dk-bg/50' : 'hover:bg-slate-50/60'}`} onClick={() => openRolePerms(role.id)}>
              <div className={`flex items-center gap-2 text-[13px] font-medium ${isDark ? 'text-dk-text' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                {openRole === role.id ? <ChevronDown size={14} strokeWidth={1.75} className="text-slate-400 dark:text-dk-muted" /> : <ChevronRight size={14} strokeWidth={1.75} className="text-slate-400 dark:text-dk-muted" />}
                {role.name}
                <span className={`text-[10px] tabular-nums ${isDark ? 'text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>niv. {role.level}</span>
              </div>
              {!role.is_system && <button onClick={e => { e.stopPropagation(); delRole(role.id); }} className={`${isDark ? 'text-dk-muted hover:text-dk-text' : 'text-slate-300 hover:text-slate-600'}`}><Trash2 size={13} strokeWidth={1.75} /></button>}
            </div>

            {openRole === role.id && (
              <div className={`px-3 pb-3 pt-1 space-y-3 border-t ${isDark ? 'border-dk-border' : 'border-slate-50'}`}>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 mt-2 ${isDark ? 'text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>{tx(lang, {fr:"Pages",ar:"الصفحات",en:"Pages",es:"Páginas",pt:"Páginas",tr:"Sayfalar"})}</p>
                  {PROTECTED_PAGES.map(pg => {
                    const p = perms[`page|${pg}`] || { can_view: 0, can_edit: 0 };
                    return (
                      <div key={pg} className="flex items-center justify-between py-0.5">
                        <span className={`text-[13px] ${isDark ? 'text-dk-text' : 'text-slate-600 dark:text-dk-text-soft'}`}>{PAGE_LABELS[pg] || pg}</span>
                        <div className="flex gap-1.5">
                          <Toggle on={!!p.can_view} onClick={() => toggle('page', pg, 'view')} icon={Eye} />
                          <Toggle on={!!p.can_edit} onClick={() => toggle('page', pg, 'edit')} icon={Pencil} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>{tx(lang, {fr:"Champs sensibles",ar:"الحقول الحساسة",en:"Sensitive fields",es:"Campos sensibles",pt:"Campos sensíveis",tr:"Hassas alanlar"})}</p>
                  {PROTECTED_FIELDS.map(fd => {
                    const p = perms[`field|${fd}`] || { can_view: 0, can_edit: 0 };
                    return (
                      <div key={fd} className="flex items-center justify-between py-0.5">
                        <span className={`text-[13px] ${isDark ? 'text-dk-text' : 'text-slate-600 dark:text-dk-text-soft'}`}>🔒 {FIELD_LABELS[fd] || fd}</span>
                        <Toggle on={!!p.can_view} onClick={() => toggle('field', fd, 'view')} icon={Eye} />
                      </div>
                    );
                  })}
                </div>
                {dirty && (
                  <button onClick={saveRolePerms} className="w-full h-8 rounded-md text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5" style={{ background: ACCENT }}>
                    <Check size={14} strokeWidth={2} /> {tx(lang, {fr:"Enregistrer",ar:"حفظ",en:"Save",es:"Guardar",pt:"Salvar",tr:"Kaydet"})}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Membres */}
      <div className={`rounded-lg border p-4 ${isDark ? 'bg-dk-surface border-dk-border' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>
        <h3 className={`text-[13px] font-semibold mb-3 flex items-center gap-1.5 ${isDark ? 'text-dk-text' : 'text-slate-900 dark:text-dk-text'}`}><Users size={14} strokeWidth={1.75} className="text-slate-400 dark:text-dk-muted" /> {tx(lang, {fr:"Membres",ar:"الأعضاء",en:"Members",es:"Miembros",pt:"Membros",tr:"Üyeler"})}</h3>
        <div className="flex flex-wrap gap-2 mb-2">
          <input value={newMember.name} onChange={e => setNewMember(s => ({ ...s, name: e.target.value }))} placeholder={tx(lang, {fr:'Nom (optionnel)',ar:'الاسم (اختياري)',en:'Name (optional)',es:'Nombre (opcional)',pt:'Nome (opcional)',tr:'Ad (isteğe bağlı)'})} className={`flex-1 min-w-[120px] ${inputCls}`} />
          <input value={newMember.email} onChange={e => setNewMember(s => ({ ...s, email: e.target.value }))} placeholder={tx(lang, {fr:'E-mail du membre',ar:'البريد الإلكتروني للعضو',en:'Member email',es:'Correo del miembro',pt:'E-mail do membro',tr:'Üye e-posta'})} className={`flex-1 min-w-[160px] ${inputCls}`} />
          <input type="text" value={newMember.password} onChange={e => setNewMember(s => ({ ...s, password: e.target.value }))} placeholder={tx(lang, {fr:'Mot de passe (auto si vide)',ar:'كلمة السر (تلقائية إن تُركت)',en:'Password (auto if empty)',es:'Contraseña (auto si vacío)',pt:'Palavra-passe (auto se vazio)',tr:'Şifre (boşsa otomatik)'})} className={`flex-1 min-w-[140px] ${inputCls}`} />
          <select value={newMember.role_id} onChange={e => setNewMember(s => ({ ...s, role_id: e.target.value }))} className={`${inputCls} bg-white dark:bg-dk-surface`}>
            <option value="">Rôle…</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={addMember} className="h-8 px-3 rounded-md bg-slate-900 text-white text-[13px] font-medium inline-flex items-center gap-1 hover:bg-slate-800"><UserPlus size={14} strokeWidth={1.75} /> {tx(lang, {fr:"Ajouter",ar:"إضافة",en:"Add",es:"Añadir",pt:"Adicionar",tr:"Ekle"})}</button>
        </div>
        {inviteInfo && (
          <div className={`flex items-start justify-between gap-2 text-[12px] rounded-md px-3 py-2 mb-3 ${isDark ? 'bg-dk-accent/15 text-dk-text' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800'}`}>
            <span className="font-medium break-all">{inviteInfo}</span>
            <button onClick={() => setInviteInfo(null)} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} strokeWidth={1.75} /></button>
          </div>
        )}
        {members.length === 0 && <p className={`text-[13px] py-2 text-center ${isDark ? 'text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>{tx(lang, {fr:'Aucun membre.',ar:'لا يوجد أعضاء.',en:'No members.',es:'Sin miembros.',pt:'Nenhum membro.',tr:'Üye yok.'})}</p>}
        {members.map(m => (
          <div key={m.id} className={`flex items-center justify-between py-2 border-b last:border-0 ${isDark ? 'border-dk-border' : 'border-slate-50'}`}>
            <div>
              <p className={`text-[13px] font-medium ${isDark ? 'text-dk-text' : 'text-slate-700 dark:text-dk-text-soft'}`}>{m.name || m.email} {m.status === 'removed' && <span className={`text-[10px] ${isDark ? 'text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>(retiré)</span>}</p>
              <p className={`text-[11px] ${isDark ? 'text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>{m.email} · {m.role_name || '—'}</p>
            </div>
            {m.status === 'active' && <button onClick={() => removeMember(m.user_id)} className={`${isDark ? 'text-dk-muted hover:text-dk-text' : 'text-slate-300 hover:text-slate-600'}`}><Trash2 size={13} strokeWidth={1.75} /></button>}
          </div>
        ))}
      </div>

      {/* Confirmation */}
      {confirm && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirm(null)}>
          <div className={`rounded-lg border shadow-lg dark:shadow-dk-lg p-5 max-w-sm w-full ${isDark ? 'bg-dk-surface border-dk-border' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h4 className={`text-[13px] font-semibold ${isDark ? 'text-dk-text' : 'text-slate-900 dark:text-dk-text'}`}>{tx(lang, {fr:"Confirmation",ar:"تأكيد",en:"Confirmation",es:"Confirmación",pt:"Confirmação",tr:"Onay"})}</h4>
              <button onClick={() => setConfirm(null)} className={`${isDark ? 'text-dk-muted hover:text-dk-text' : 'text-slate-400 dark:text-dk-muted hover:text-slate-600'}`}><X size={16} strokeWidth={1.75} /></button>
            </div>
            <p className={`text-[13px] mb-4 ${isDark ? 'text-dk-muted' : 'text-slate-500 dark:text-dk-muted'}`}>{confirmText}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)} className={`h-8 px-3 rounded-md border text-[13px] font-medium ${isDark ? 'border-dk-border text-dk-muted hover:bg-dk-bg' : 'border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}>{tx(lang, {fr:"Annuler",ar:"إلغاء",en:"Cancel",es:"Cancelar",pt:"Cancelar",tr:"İptal"})}</button>
              <button onClick={() => confirm()} className="h-8 px-3 rounded-md text-white text-[13px] font-medium" style={{ background: ACCENT }}>{tx(lang, {fr:"Confirmer",ar:"تأكيد",en:"Confirm",es:"Confirmar",pt:"Confirmar",tr:"Onayla"})}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
