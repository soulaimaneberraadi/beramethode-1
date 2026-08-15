import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, Shield, Plus, Trash2, Check, UserPlus, Eye, Pencil, X, Users, Settings, Activity, Minus, Ban } from 'lucide-react';
import { PROTECTED_PAGES, PROTECTED_FIELDS, ROLE_PRESETS, RolePresetKey } from '../server/permissions/presets';
import { pageLabel, fieldLabel, FIELDS_BY_MODULE } from '../app/permissionCatalog';
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
interface OverrideRow { resource_type: 'page' | 'field'; resource_key: string; can_view: number | null; can_edit: number | null; }
interface ActivityRow { id: string | number; table_name: string; action: string; record_id?: string; detail?: string; timestamp: string; user_id?: number; email?: string; name?: string; }

const ACCENT = '#2149C1';

const api = (url: string, opts?: RequestInit) =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts }).then(r => r.json());

// Pages qui regroupent des champs sensibles (voir FIELDS_BY_MODULE) — les autres
// pages protégées n'ont pas de champs dédiés et s'affichent seules.
const MODULE_KEYS = Object.keys(FIELDS_BY_MODULE);

type TriValue = 0 | 1 | null; // null = hérité du rôle

export default function PermissionsManager() {
  const { lang } = useLang();
  const isDark = useIsDark();
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [perms, setPerms] = useState<Record<string, PermRow>>({});
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<null | (() => void)>(null);
  const [confirmText, setConfirmText] = useState('');
  const [newRole, setNewRole] = useState<{ name: string; preset: RolePresetKey | '' }>({ name: '', preset: '' });
  const [newMember, setNewMember] = useState({ email: '', name: '', password: '', role_id: '' });
  const [inviteInfo, setInviteInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // édition inline d'un rôle
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; level: number; parent_role_id: string }>({ name: '', level: 0, parent_role_id: '' });

  // panneau exceptions par membre
  const [overridesUserId, setOverridesUserId] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { can_view: TriValue; can_edit: TriValue }>>({});
  const [overridesDirty, setOverridesDirty] = useState(false);

  // onglet activité
  const [tab, setTab] = useState<'roles' | 'activity'>('roles');
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const ACTIVITY_LIMIT = 30;

  const errorFromCode = useCallback((res: any): string | null => {
    if (!res || res.ok !== false) return null;
    if (res.code === 'PERMISSION_DENIED') {
      return tx(lang, { fr: 'Vous ne pouvez pas gérer ce rôle.', ar: 'لا يمكنك إدارة هذا الدور.', en: 'You cannot manage this role.', es: 'No puede gestionar este rol.', pt: 'Você não pode gerenciar esta função.', tr: 'Bu rolü yönetemezsiniz.' });
    }
    if (res.code === 'ROLE_CYCLE') {
      return tx(lang, { fr: 'Cette affectation créerait une boucle hiérarchique.', ar: 'هذا التعيين سيُنشئ حلقة هرمية.', en: 'This assignment would create a hierarchy loop.', es: 'Esta asignación crearía un bucle jerárquico.', pt: 'Esta atribuição criaria um loop hierárquico.', tr: 'Bu atama bir hiyerarşi döngüsü oluşturur.' });
    }
    return res.error || tx(lang, { fr: 'Une erreur est survenue.', ar: 'حدث خطأ.', en: 'An error occurred.', es: 'Ocurrió un error.', pt: 'Ocorreu um erro.', tr: 'Bir hata oluştu.' });
  }, [lang]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [r, m] = await Promise.all([api('/api/permissions/roles'), api('/api/permissions/members')]);
    setRoles(r.data || []); setMembers(m.data || []); setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const loadActivity = useCallback(async (offset: number, append: boolean) => {
    setActivityLoading(true);
    const res = await api(`/api/permissions/activity?limit=${ACTIVITY_LIMIT}&offset=${offset}`);
    const rows: ActivityRow[] = res.data || [];
    setActivity(prev => append ? [...prev, ...rows] : rows);
    setActivityHasMore(rows.length >= ACTIVITY_LIMIT);
    setActivityOffset(offset + rows.length);
    setActivityLoading(false);
  }, []);

  useEffect(() => { if (tab === 'activity' && activity.length === 0) void loadActivity(0, false); }, [tab, activity.length, loadActivity]);

  const rolesById = useMemo(() => {
    const map: Record<string, Role> = {};
    roles.forEach(r => { map[r.id] = r; });
    return map;
  }, [roles]);

  const childrenOf = useMemo(() => {
    const map: Record<string, Role[]> = {};
    roles.forEach(r => {
      const key = r.parent_role_id || '__root__';
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [roles]);

  const membersByRole = useMemo(() => {
    const map: Record<string, Member[]> = {};
    members.forEach(m => {
      if (!map[m.role_id]) map[m.role_id] = [];
      map[m.role_id].push(m);
    });
    return map;
  }, [members]);

  // ensemble des descendants d'un rôle (pour interdire de le choisir comme parent)
  const descendantsOf = useCallback((roleId: string): Set<string> => {
    const out = new Set<string>();
    const walk = (id: string) => {
      (childrenOf[id] || []).forEach(c => { out.add(c.id); walk(c.id); });
    };
    walk(roleId);
    return out;
  }, [childrenOf]);

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
    setConfirmText(tx(lang, { fr: 'Enregistrer les permissions de ce rôle ?', ar: 'حفظ صلاحيات هذا الدور؟', en: 'Save permissions for this role?', es: '¿Guardar los permisos de este rol?', pt: 'Salvar permissões desta função?', tr: 'Bu rolün izinlerini kaydet?' }));
    setConfirm(() => async () => {
      const list = Object.values(perms).filter(p => p.can_view || p.can_edit);
      const res = await api(`/api/permissions/roles/${openRole}/perms`, { method: 'PUT', body: JSON.stringify({ perms: list }) });
      const err = errorFromCode(res);
      if (err) setErrorMsg(err); else setDirty(false);
      setConfirm(null);
    });
  };

  const createRole = async () => {
    if (!newRole.name) return;
    const res = await api('/api/permissions/roles', { method: 'POST', body: JSON.stringify({ name: newRole.name, preset: newRole.preset || undefined }) });
    const err = errorFromCode(res);
    if (err) { setErrorMsg(err); return; }
    setNewRole({ name: '', preset: '' }); void reload();
  };

  const delRole = (id: string) => {
    setConfirmText(tx(lang, { fr: 'Supprimer ce rôle ?', ar: 'حذف هذا الدور؟', en: 'Delete this role?', es: '¿Eliminar este rol?', pt: 'Excluir esta função?', tr: 'Bu rolü sil?' }));
    setConfirm(() => async () => {
      const res = await api(`/api/permissions/roles/${id}`, { method: 'DELETE' });
      const err = errorFromCode(res);
      if (err) setErrorMsg(err);
      setConfirm(null); void reload();
    });
  };

  const startEditRole = (role: Role) => {
    setEditingRole(role.id);
    setEditForm({ name: role.name, level: role.level, parent_role_id: role.parent_role_id || '' });
  };

  const saveEditRole = (id: string) => {
    setConfirmText(tx(lang, { fr: 'Enregistrer les modifications de ce rôle ?', ar: 'حفظ تعديلات هذا الدور؟', en: 'Save changes to this role?', es: '¿Guardar los cambios de este rol?', pt: 'Salvar alterações desta função?', tr: 'Bu roldeki değişiklikleri kaydet?' }));
    setConfirm(() => async () => {
      const res = await api(`/api/permissions/roles/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editForm.name, level: Number(editForm.level), parent_role_id: editForm.parent_role_id || null }),
      });
      const err = errorFromCode(res);
      if (err) { setErrorMsg(err); } else { setEditingRole(null); void reload(); }
      setConfirm(null);
    });
  };

  const addMember = async () => {
    if (!newMember.email || !newMember.role_id) return;
    const res = await api('/api/permissions/members', { method: 'POST', body: JSON.stringify(newMember) });
    const err = errorFromCode(res);
    if (err) { setErrorMsg(err); return; }
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
    setConfirmText(tx(lang, { fr: 'Retirer ce membre ? (garde son profil, perd l’accès aux données)', ar: 'إزالة هذا العضو؟ (يبقى ملفه لكنه يفقد الوصول إلى البيانات)', en: 'Remove this member? (keeps their profile, loses data access)', es: '¿Quitar a este miembro? (mantiene su perfil, pierde acceso a los datos)', pt: 'Remover este membro? (mantém o perfil, perde acesso aos dados)', tr: 'Bu üyeyi kaldır? (profili kalır, veri erişimini kaybeder)' }));
    setConfirm(() => async () => { await api(`/api/permissions/members/${userId}`, { method: 'DELETE' }); setConfirm(null); void reload(); });
  };

  const openOverrides = async (userId: number) => {
    if (overridesUserId === userId) { setOverridesUserId(null); return; }
    setOverridesUserId(userId);
    const res = await api(`/api/permissions/members/${userId}/overrides`);
    const map: Record<string, { can_view: TriValue; can_edit: TriValue }> = {};
    (res.data || []).forEach((o: OverrideRow) => {
      map[`${o.resource_type}|${o.resource_key}`] = { can_view: (o.can_view ?? null) as TriValue, can_edit: (o.can_edit ?? null) as TriValue };
    });
    setOverrides(map); setOverridesDirty(false);
  };

  const setOverrideValue = (type: 'page' | 'field', key: string, field: 'can_view' | 'can_edit', value: TriValue) => {
    const k = `${type}|${key}`;
    setOverrides(prev => {
      const cur = prev[k] || { can_view: null, can_edit: null };
      const next = { ...cur, [field]: value };
      // Invariant : on n'autorise jamais explicitement l'édition sans autoriser
      // explicitement la vue. Sans ce garde-fou, "Modifier=Autorisé" suivi de
      // "Voir=Hérité" laisserait can_edit=1 alors que la vue retombe sur le rôle
      // (qui peut la refuser) — un membre éditerait alors une page qu'il ne peut
      // pas voir. On aligne donc can_edit sur can_view dès que ce dernier
      // n'est plus explicitement autorisé (0 ou hérité).
      if (field === 'can_view' && value !== 1 && next.can_edit === 1) next.can_edit = value;
      if (field === 'can_edit' && value === 1) next.can_view = 1;
      return { ...prev, [k]: next };
    });
    setOverridesDirty(true);
  };

  const saveOverrides = () => {
    setConfirmText(tx(lang, { fr: 'Enregistrer les exceptions de ce membre ?', ar: 'حفظ استثناءات هذا العضو؟', en: 'Save this member’s exceptions?', es: '¿Guardar las excepciones de este miembro?', pt: 'Salvar as exceções deste membro?', tr: 'Bu üyenin istisnalarını kaydet?' }));
    setConfirm(() => async () => {
      const list: OverrideRow[] = [];
      Object.entries(overrides).forEach(([k, v]) => {
        if (v.can_view === null && v.can_edit === null) return;
        const [resource_type, resource_key] = k.split('|') as ['page' | 'field', string];
        list.push({ resource_type, resource_key, can_view: v.can_view, can_edit: v.can_edit });
      });
      const res = await api(`/api/permissions/members/${overridesUserId}/overrides`, { method: 'PUT', body: JSON.stringify({ overrides: list }) });
      const err = errorFromCode(res);
      if (err) setErrorMsg(err); else setOverridesDirty(false);
      setConfirm(null);
    });
  };

  const resetOverrides = () => {
    setConfirmText(tx(lang, { fr: 'Réinitialiser toutes les exceptions de ce membre ? Il retombera entièrement sur les permissions de son rôle.', ar: 'إعادة ضبط جميع استثناءات هذا العضو؟ سيعتمد بالكامل على صلاحيات دوره.', en: 'Reset all exceptions for this member? They will fully fall back to their role’s permissions.', es: '¿Restablecer todas las excepciones de este miembro? Volverá por completo a los permisos de su rol.', pt: 'Redefinir todas as exceções deste membro? Ele voltará totalmente às permissões da sua função.', tr: 'Bu üyenin tüm istisnaları sıfırlansın mı? Tamamen rolünün izinlerine dönecek.' }));
    setConfirm(() => async () => {
      await api(`/api/permissions/members/${overridesUserId}/overrides`, { method: 'DELETE' });
      setOverrides({}); setOverridesDirty(false); setConfirm(null);
    });
  };

  const toggleExpand = (roleId: string) => setExpanded(prev => ({ ...prev, [roleId]: !prev[roleId] }));

  const Toggle = ({ on, onClick, icon: Icon }: { on: boolean; onClick: () => void; icon: any }) => (
    <button onClick={onClick}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors ${on ? '' : isDark ? 'bg-dk-bg border-dk-border text-dk-muted' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
      style={on ? { background: ACCENT, borderColor: ACCENT, color: '#fff' } : undefined}>
      {on ? <Check size={13} strokeWidth={2} /> : <Icon size={13} strokeWidth={1.75} />}
    </button>
  );

  // Contrôle à 3 états : hérité (null) / autorisé (1) / interdit (0)
  const TriState = ({ value, onChange, label }: { value: TriValue; onChange: (v: TriValue) => void; label: string }) => (
    <div className={`inline-flex items-center rounded-md border overflow-hidden ${isDark ? 'border-dk-border' : 'border-slate-200'}`} title={label}>
      <button onClick={() => onChange(null)}
        className={`w-7 h-7 inline-flex items-center justify-center ${value === null ? '' : isDark ? 'text-dk-muted hover:bg-dk-bg' : 'text-slate-400 hover:bg-slate-50'}`}
        style={value === null ? { background: isDark ? '#334155' : '#e2e8f0', color: isDark ? '#e2e8f0' : '#334155' } : undefined}>
        <Minus size={12} strokeWidth={2} />
      </button>
      <button onClick={() => onChange(1)}
        className={`w-7 h-7 inline-flex items-center justify-center border-l ${isDark ? 'border-dk-border' : 'border-slate-200'} ${value === 1 ? '' : isDark ? 'text-dk-muted hover:bg-dk-bg' : 'text-slate-400 hover:bg-slate-50'}`}
        style={value === 1 ? { background: '#16a34a', color: '#fff' } : undefined}>
        <Check size={12} strokeWidth={2} />
      </button>
      <button onClick={() => onChange(0)}
        className={`w-7 h-7 inline-flex items-center justify-center border-l ${isDark ? 'border-dk-border' : 'border-slate-200'} ${value === 0 ? '' : isDark ? 'text-dk-muted hover:bg-dk-bg' : 'text-slate-400 hover:bg-slate-50'}`}
        style={value === 0 ? { background: '#dc2626', color: '#fff' } : undefined}>
        <Ban size={12} strokeWidth={2} />
      </button>
    </div>
  );

  const inputCls = `px-2.5 h-8 rounded-md border focus:outline-none focus:ring-2 text-[13px] ${isDark ? 'bg-dk-bg border-dk-border text-dk-text focus:bg-dk-surface focus:ring-dk-border' : 'bg-slate-50 border-slate-200 text-slate-700 focus:bg-white focus:ring-slate-100'}`;

  const ACTIVITY_ICON: Record<string, any> = { CREATE: Plus, UPDATE: Pencil, DELETE: Trash2, LOGIN_FAILED: Ban };

  const fmtDate = (iso: string) => {
    try { return new Intl.DateTimeFormat(lang || 'fr', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); }
    catch { return iso; }
  };

  const renderRoleFields = (roleId: string) => {
    // Pages qui n'appartiennent à aucun module de champs regroupés
    const standalonePages = PROTECTED_PAGES.filter(pg => !MODULE_KEYS.includes(pg));
    return (
      <div className="space-y-3">
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 mt-2 ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Pages', ar: 'الصفحات', en: 'Pages', es: 'Páginas', pt: 'Páginas', tr: 'Sayfalar' })}</p>
          {PROTECTED_PAGES.map(pg => {
            const p = perms[`page|${pg}`] || { can_view: 0, can_edit: 0 };
            const fields = FIELDS_BY_MODULE[pg];
            return (
              <div key={pg} className={`py-1 ${fields ? `rounded-md px-2 -mx-2 ${isDark ? 'bg-dk-bg/40' : 'bg-slate-50/60'}` : ''}`}>
                <div className="flex items-center justify-between py-0.5">
                  <span className={`text-[13px] ${isDark ? 'text-dk-text' : 'text-slate-600'}`}>{pageLabel(pg, lang)}</span>
                  <div className="flex gap-1.5">
                    <Toggle on={!!p.can_view} onClick={() => toggle('page', pg, 'view')} icon={Eye} />
                    <Toggle on={!!p.can_edit} onClick={() => toggle('page', pg, 'edit')} icon={Pencil} />
                  </div>
                </div>
                {fields && (
                  <div className="pl-4 mt-1 space-y-0.5">
                    {fields.map(fd => {
                      const fp = perms[`field|${fd}`] || { can_view: 0, can_edit: 0 };
                      return (
                        <div key={fd} className="flex items-center justify-between py-0.5">
                          <span className={`text-[12px] ${isDark ? 'text-dk-muted' : 'text-slate-500'}`}>{'🔒'} {fieldLabel(fd, lang)}</span>
                          <div className="flex gap-1.5">
                            <Toggle on={!!fp.can_view} onClick={() => toggle('field', fd, 'view')} icon={Eye} />
                            <Toggle on={!!fp.can_edit} onClick={() => toggle('field', fd, 'edit')} icon={Pencil} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Champs sensibles non rattachés à une page listée (filet de sécurité) */}
        {PROTECTED_FIELDS.filter(fd => !Object.values(FIELDS_BY_MODULE).some(list => list.includes(fd))).length > 0 && (
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Autres champs sensibles', ar: 'حقول حساسة أخرى', en: 'Other sensitive fields', es: 'Otros campos sensibles', pt: 'Outros campos sensíveis', tr: 'Diğer hassas alanlar' })}</p>
            {PROTECTED_FIELDS.filter(fd => !Object.values(FIELDS_BY_MODULE).some(list => list.includes(fd))).map(fd => {
              const p = perms[`field|${fd}`] || { can_view: 0, can_edit: 0 };
              return (
                <div key={fd} className="flex items-center justify-between py-0.5">
                  <span className={`text-[13px] ${isDark ? 'text-dk-text' : 'text-slate-600'}`}>{'🔒'} {fieldLabel(fd, lang)}</span>
                  <Toggle on={!!p.can_view} onClick={() => toggle('field', fd, 'view')} icon={Eye} />
                </div>
              );
            })}
          </div>
        )}
        {dirty && (
          <button onClick={saveRolePerms} className="w-full h-8 rounded-md text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5" style={{ background: ACCENT }}>
            <Check size={14} strokeWidth={2} /> {tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Salvar', tr: 'Kaydet' })}
          </button>
        )}
      </div>
    );
  };

  const renderMemberRow = (m: Member) => (
    <div key={m.id} className={`rounded-md ${isDark ? 'border border-dk-border' : 'border border-slate-100'}`}>
      <div className="flex items-center justify-between px-2.5 h-9">
        <div className="min-w-0">
          <p className={`text-[12.5px] font-medium truncate ${isDark ? 'text-dk-text' : 'text-slate-700'}`}>{m.name || m.email} {m.status === 'removed' && <span className={`text-[10px] ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>({tx(lang, { fr: 'retiré', ar: 'مُزال', en: 'removed', es: 'eliminado', pt: 'removido', tr: 'kaldırıldı' })})</span>}</p>
          <p className={`text-[10.5px] truncate ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{m.email}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => openOverrides(m.user_id)} title={tx(lang, { fr: 'Exceptions', ar: 'استثناءات', en: 'Exceptions', es: 'Excepciones', pt: 'Exceções', tr: 'İstisnalar' })}
            className={`w-7 h-7 inline-flex items-center justify-center rounded-md ${overridesUserId === m.user_id ? '' : isDark ? 'text-dk-muted hover:bg-dk-bg' : 'text-slate-400 hover:bg-slate-50'}`}
            style={overridesUserId === m.user_id ? { background: ACCENT, color: '#fff' } : undefined}>
            <Settings size={13} strokeWidth={1.75} />
          </button>
          {m.status === 'active' && (
            <button onClick={() => removeMember(m.user_id)} className={`${isDark ? 'text-dk-muted hover:text-dk-text' : 'text-slate-300 hover:text-slate-600'}`}><Trash2 size={13} strokeWidth={1.75} /></button>
          )}
        </div>
      </div>
      {overridesUserId === m.user_id && (
        <div className={`px-2.5 pb-3 pt-1 space-y-2 border-t ${isDark ? 'border-dk-border' : 'border-slate-50'}`}>
          <p className={`text-[10px] ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>
            {tx(lang, { fr: 'Hérité = suit le rôle · Autorisé/Interdit = exception pour ce membre', ar: 'موروث = يتبع الدور · مسموح/ممنوع = استثناء لهذا العضو', en: 'Inherited = follows the role · Allowed/Denied = exception for this member', es: 'Heredado = sigue al rol · Permitido/Denegado = excepción para este miembro', pt: 'Herdado = segue a função · Permitido/Negado = exceção para este membro', tr: 'Miras = rolü izler · İzinli/Reddedildi = bu üye için istisna' })}
          </p>
          <div className="space-y-1">
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Pages', ar: 'الصفحات', en: 'Pages', es: 'Páginas', pt: 'Páginas', tr: 'Sayfalar' })}</p>
            {PROTECTED_PAGES.map(pg => {
              const o = overrides[`page|${pg}`] || { can_view: null, can_edit: null };
              return (
                <div key={pg} className="flex items-center justify-between py-0.5 gap-2">
                  <span className={`text-[12px] truncate ${isDark ? 'text-dk-text' : 'text-slate-600'}`}>{pageLabel(pg, lang)}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] uppercase ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Voir', ar: 'عرض', en: 'View', es: 'Ver', pt: 'Ver', tr: 'Görüntüle' })}</span>
                    <TriState value={o.can_view} onChange={v => setOverrideValue('page', pg, 'can_view', v)} label="can_view" />
                    <span className={`text-[9px] uppercase ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })}</span>
                    <TriState value={o.can_edit} onChange={v => setOverrideValue('page', pg, 'can_edit', v)} label="can_edit" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="space-y-1">
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Champs sensibles', ar: 'الحقول الحساسة', en: 'Sensitive fields', es: 'Campos sensibles', pt: 'Campos sensíveis', tr: 'Hassas alanlar' })}</p>
            {PROTECTED_FIELDS.map(fd => {
              const o = overrides[`field|${fd}`] || { can_view: null, can_edit: null };
              return (
                <div key={fd} className="flex items-center justify-between py-0.5 gap-2">
                  <span className={`text-[12px] truncate ${isDark ? 'text-dk-text' : 'text-slate-600'}`}>{'🔒'} {fieldLabel(fd, lang)}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] uppercase ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Voir', ar: 'عرض', en: 'View', es: 'Ver', pt: 'Ver', tr: 'Görüntüle' })}</span>
                    <TriState value={o.can_view} onChange={v => setOverrideValue('field', fd, 'can_view', v)} label="can_view" />
                    <span className={`text-[9px] uppercase ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })}</span>
                    <TriState value={o.can_edit} onChange={v => setOverrideValue('field', fd, 'can_edit', v)} label="can_edit" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 pt-1">
            {overridesDirty && (
              <button onClick={saveOverrides} className="flex-1 h-8 rounded-md text-white text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5" style={{ background: ACCENT }}>
                <Check size={13} strokeWidth={2} /> {tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Salvar', tr: 'Kaydet' })}
              </button>
            )}
            <button onClick={resetOverrides} className={`h-8 px-3 rounded-md border text-[12.5px] font-medium ${isDark ? 'border-dk-border text-dk-muted hover:bg-dk-bg' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              {tx(lang, { fr: 'Réinitialiser tout', ar: 'إعادة ضبط الكل', en: 'Reset all', es: 'Restablecer todo', pt: 'Redefinir tudo', tr: 'Tümünü sıfırla' })}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderRoleNode = (role: Role, depth: number): React.ReactNode => {
    const kids = childrenOf[role.id] || [];
    const roleMembers = membersByRole[role.id] || [];
    const isExpanded = !!expanded[role.id];
    const forbiddenParents = descendantsOf(role.id);
    return (
      <div key={role.id} style={{ marginLeft: depth * 16 }}>
        <div className={`rounded-md mb-1.5 overflow-hidden ${isDark ? 'border border-dk-border' : 'border border-slate-100'}`}>
          <div className={`flex items-center justify-between px-3 h-9 cursor-pointer ${isDark ? 'hover:bg-dk-bg/50' : 'hover:bg-slate-50/60'}`} onClick={() => toggleExpand(role.id)}>
            <div className={`flex items-center gap-2 text-[13px] font-medium ${isDark ? 'text-dk-text' : 'text-slate-700'}`}>
              {isExpanded ? <ChevronDown size={14} strokeWidth={1.75} className="text-slate-400" /> : <ChevronRight size={14} strokeWidth={1.75} className="text-slate-400" />}
              {role.name}
              {!!role.is_system && <Shield size={11} strokeWidth={1.75} className="text-slate-300" />}
              <span className={`text-[10px] tabular-nums ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'niv.', ar: 'مستوى', en: 'lvl', es: 'niv.', pt: 'nív.', tr: 'sv.' })} {role.level}</span>
              <span className={`text-[10px] ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>· {roleMembers.length} {tx(lang, { fr: 'membre(s)', ar: 'عضو (أعضاء)', en: 'member(s)', es: 'miembro(s)', pt: 'membro(s)', tr: 'üye' })}</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={e => { e.stopPropagation(); startEditRole(role); }} className={`${isDark ? 'text-dk-muted hover:text-dk-text' : 'text-slate-300 hover:text-slate-600'}`}><Pencil size={13} strokeWidth={1.75} /></button>
              {!role.is_system && <button onClick={e => { e.stopPropagation(); delRole(role.id); }} className={`${isDark ? 'text-dk-muted hover:text-dk-text' : 'text-slate-300 hover:text-slate-600'}`}><Trash2 size={13} strokeWidth={1.75} /></button>}
            </div>
          </div>

          {editingRole === role.id && (
            <div className={`px-3 py-2 space-y-2 border-t ${isDark ? 'border-dk-border' : 'border-slate-50'}`}>
              <div className="flex flex-wrap gap-2">
                <input value={editForm.name} onChange={e => setEditForm(s => ({ ...s, name: e.target.value }))} placeholder={tx(lang, { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' })} className={`flex-1 min-w-[120px] ${inputCls}`} />
                <input type="number" value={editForm.level} onChange={e => setEditForm(s => ({ ...s, level: Number(e.target.value) }))} placeholder={tx(lang, { fr: 'Niveau', ar: 'المستوى', en: 'Level', es: 'Nivel', pt: 'Nível', tr: 'Seviye' })} className={`w-24 ${inputCls}`} />
                <select value={editForm.parent_role_id} onChange={e => setEditForm(s => ({ ...s, parent_role_id: e.target.value }))} className={`${inputCls} bg-white dark:bg-dk-surface`}>
                  <option value="">{tx(lang, { fr: 'Aucun (racine)', ar: 'بدون (جذر)', en: 'None (root)', es: 'Ninguno (raíz)', pt: 'Nenhum (raiz)', tr: 'Yok (kök)' })}</option>
                  {roles.filter(r => r.id !== role.id && !forbiddenParents.has(r.id)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditingRole(null)} className={`h-8 px-3 rounded-md border text-[12.5px] font-medium ${isDark ? 'border-dk-border text-dk-muted hover:bg-dk-bg' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}</button>
                <button onClick={() => saveEditRole(role.id)} className="h-8 px-3 rounded-md text-white text-[12.5px] font-medium" style={{ background: ACCENT }}>{tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Salvar', tr: 'Kaydet' })}</button>
              </div>
            </div>
          )}

          {isExpanded && (
            <div className={`px-3 pb-3 pt-1 space-y-3 border-t ${isDark ? 'border-dk-border' : 'border-slate-50'}`}>
              {roleMembers.length > 0 && (
                <div className="space-y-1.5">
                  <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 mt-2 ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Membres', ar: 'الأعضاء', en: 'Members', es: 'Miembros', pt: 'Membros', tr: 'Üyeler' })}</p>
                  {roleMembers.map(m => renderMemberRow(m))}
                </div>
              )}
              <div>
                <button onClick={() => openRolePerms(role.id)} className={`text-[11.5px] font-medium inline-flex items-center gap-1 mb-1 ${isDark ? 'text-dk-accent' : ''}`} style={!isDark ? { color: ACCENT } : undefined}>
                  {openRole === role.id ? <ChevronDown size={12} strokeWidth={1.75} /> : <ChevronRight size={12} strokeWidth={1.75} />}
                  {tx(lang, { fr: 'Permissions du rôle', ar: 'صلاحيات الدور', en: 'Role permissions', es: 'Permisos del rol', pt: 'Permissões da função', tr: 'Rol izinleri' })}
                </button>
                {openRole === role.id && renderRoleFields(role.id)}
              </div>
            </div>
          )}
        </div>
        {isExpanded && kids.map(child => renderRoleNode(child, depth + 1))}
      </div>
    );
  };

  if (loading) return <div className={`p-8 text-[13px] ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Chargement…', ar: 'جارٍ التحميل…', en: 'Loading…', es: 'Cargando…', pt: 'Carregando…', tr: 'Yükleniyor…' })}</div>;

  const rootRoles = childrenOf['__root__'] || [];

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5" dir="ltr">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield size={16} strokeWidth={1.75} className="text-slate-400" />
          <div>
            <h2 className={`text-[15px] font-semibold ${isDark ? 'text-dk-text' : 'text-slate-900'}`}>{tx(lang, { fr: 'Permissions & Hiérarchie', ar: 'الصلاحيات والتسلسل الهرمي', en: 'Permissions & Hierarchy', es: 'Permisos y Jerarquía', pt: 'Permissões e Hierarquia', tr: 'İzinler ve Hiyerarşi' })}</h2>
            <p className={`text-[11px] ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Gérez les rôles, ce que chacun voit et modifie.', ar: 'إدارة الأدوار، وما يراه ويعدله كل شخص.', en: 'Manage roles, what each person sees and edits.', es: 'Gestione roles, lo que cada uno ve y modifica.', pt: 'Gerencie funções, o que cada um vê e modifica.', tr: 'Rolleri, herkesin ne gördüğünü ve düzenlediğini yönetin.' })}</p>
          </div>
        </div>
        <div className={`inline-flex rounded-md border overflow-hidden ${isDark ? 'border-dk-border' : 'border-slate-200'}`}>
          <button onClick={() => setTab('roles')} className={`h-8 px-3 text-[12.5px] font-medium inline-flex items-center gap-1.5 ${tab === 'roles' ? '' : isDark ? 'text-dk-muted hover:bg-dk-bg' : 'text-slate-400 hover:bg-slate-50'}`} style={tab === 'roles' ? { background: ACCENT, color: '#fff' } : undefined}>
            <Users size={13} strokeWidth={1.75} /> {tx(lang, { fr: 'Rôles', ar: 'الأدوار', en: 'Roles', es: 'Roles', pt: 'Funções', tr: 'Roller' })}
          </button>
          <button onClick={() => setTab('activity')} className={`h-8 px-3 text-[12.5px] font-medium inline-flex items-center gap-1.5 border-l ${isDark ? 'border-dk-border' : 'border-slate-200'} ${tab === 'activity' ? '' : isDark ? 'text-dk-muted hover:bg-dk-bg' : 'text-slate-400 hover:bg-slate-50'}`} style={tab === 'activity' ? { background: ACCENT, color: '#fff' } : undefined}>
            <Activity size={13} strokeWidth={1.75} /> {tx(lang, { fr: 'Activité', ar: 'النشاط', en: 'Activity', es: 'Actividad', pt: 'Atividade', tr: 'Etkinlik' })}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className={`flex items-start justify-between gap-2 text-[12px] rounded-md px-3 py-2 ${isDark ? 'bg-red-900/20 text-red-300' : 'bg-red-50 text-red-700'}`}>
          <span className="font-medium">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} strokeWidth={1.75} /></button>
        </div>
      )}

      {tab === 'roles' && (
        <>
          {/* Arbre des rôles */}
          <div className={`rounded-lg border p-4 ${isDark ? 'bg-dk-surface border-dk-border' : 'bg-white border-slate-200'}`}>
            <h3 className={`text-[13px] font-semibold mb-3 ${isDark ? 'text-dk-text' : 'text-slate-900'}`}>{tx(lang, { fr: 'Rôles', ar: 'الأدوار', en: 'Roles', es: 'Roles', pt: 'Funções', tr: 'Roller' })}</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              <input value={newRole.name} onChange={e => setNewRole(s => ({ ...s, name: e.target.value }))} placeholder={tx(lang, { fr: 'Nom du rôle', ar: 'اسم الدور', en: 'Role name', es: 'Nombre del rol', pt: 'Nome da função', tr: 'Rol adı' })} className={`flex-1 min-w-[140px] ${inputCls}`} />
              <select value={newRole.preset} onChange={e => setNewRole(s => ({ ...s, preset: e.target.value as RolePresetKey }))} className={`${inputCls} bg-white dark:bg-dk-surface`}>
                <option value="">{tx(lang, { fr: 'Sans preset', ar: 'بدون قالب', en: 'No preset', es: 'Sin plantilla', pt: 'Sem predefinição', tr: 'Ön ayar yok' })}</option>
                {Object.keys(ROLE_PRESETS).map(k => <option key={k} value={k}>{ROLE_PRESETS[k as RolePresetKey].name}</option>)}
              </select>
              <button onClick={createRole} className="h-8 px-3 rounded-md bg-slate-900 text-white text-[13px] font-medium inline-flex items-center gap-1 hover:bg-slate-800"><Plus size={14} strokeWidth={1.75} /> {tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}</button>
            </div>

            {roles.length === 0 && <p className={`text-[13px] py-3 text-center ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Aucun rôle. Créez-en un (avec preset pour démarrer vite).', ar: 'لا توجد أدوار. أنشئ واحداً (باستخدام قالب للبدء بسرعة).', en: 'No roles. Create one (with a preset to start quickly).', es: 'Sin roles. Cree uno (con una plantilla para empezar rápido).', pt: 'Nenhuma função. Crie uma (com uma predefinição para começar rapidamente).', tr: 'Rol yok. Hızlı başlamak için bir ön ayar ile oluşturun.' })}</p>}

            {rootRoles.map(r => renderRoleNode(r, 0))}
          </div>

          {/* Ajout de membre */}
          <div className={`rounded-lg border p-4 ${isDark ? 'bg-dk-surface border-dk-border' : 'bg-white border-slate-200'}`}>
            <h3 className={`text-[13px] font-semibold mb-3 flex items-center gap-1.5 ${isDark ? 'text-dk-text' : 'text-slate-900'}`}><UserPlus size={14} strokeWidth={1.75} className="text-slate-400" /> {tx(lang, { fr: 'Ajouter un membre', ar: 'إضافة عضو', en: 'Add a member', es: 'Añadir un miembro', pt: 'Adicionar um membro', tr: 'Üye ekle' })}</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              <input value={newMember.name} onChange={e => setNewMember(s => ({ ...s, name: e.target.value }))} placeholder={tx(lang, { fr: 'Nom (optionnel)', ar: 'الاسم (اختياري)', en: 'Name (optional)', es: 'Nombre (opcional)', pt: 'Nome (opcional)', tr: 'Ad (isteğe bağlı)' })} className={`flex-1 min-w-[120px] ${inputCls}`} />
              <input value={newMember.email} onChange={e => setNewMember(s => ({ ...s, email: e.target.value }))} placeholder={tx(lang, { fr: 'E-mail du membre', ar: 'البريد الإلكتروني للعضو', en: 'Member email', es: 'Correo del miembro', pt: 'E-mail do membro', tr: 'Üye e-posta' })} className={`flex-1 min-w-[160px] ${inputCls}`} />
              <input type="text" value={newMember.password} onChange={e => setNewMember(s => ({ ...s, password: e.target.value }))} placeholder={tx(lang, { fr: 'Mot de passe (auto si vide)', ar: 'كلمة السر (تلقائية إن تُركت)', en: 'Password (auto if empty)', es: 'Contraseña (auto si vacío)', pt: 'Palavra-passe (auto se vazio)', tr: 'Şifre (boşsa otomatik)' })} className={`flex-1 min-w-[140px] ${inputCls}`} />
              <select value={newMember.role_id} onChange={e => setNewMember(s => ({ ...s, role_id: e.target.value }))} className={`${inputCls} bg-white dark:bg-dk-surface`}>
                <option value="">{tx(lang, { fr: 'Rôle…', ar: 'الدور…', en: 'Role…', es: 'Rol…', pt: 'Função…', tr: 'Rol…' })}</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button onClick={addMember} className="h-8 px-3 rounded-md bg-slate-900 text-white text-[13px] font-medium inline-flex items-center gap-1 hover:bg-slate-800"><UserPlus size={14} strokeWidth={1.75} /> {tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}</button>
            </div>
            {inviteInfo && (
              <div className={`flex items-start justify-between gap-2 text-[12px] rounded-md px-3 py-2 ${isDark ? 'bg-dk-accent/15 text-dk-text' : 'bg-emerald-50 text-emerald-800'}`}>
                <span className="font-medium break-all">{inviteInfo}</span>
                <button onClick={() => setInviteInfo(null)} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} strokeWidth={1.75} /></button>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'activity' && (
        <div className={`rounded-lg border p-4 ${isDark ? 'bg-dk-surface border-dk-border' : 'bg-white border-slate-200'}`}>
          <h3 className={`text-[13px] font-semibold mb-3 flex items-center gap-1.5 ${isDark ? 'text-dk-text' : 'text-slate-900'}`}><Activity size={14} strokeWidth={1.75} className="text-slate-400" /> {tx(lang, { fr: 'Journal d’activité', ar: 'سجل النشاط', en: 'Activity log', es: 'Registro de actividad', pt: 'Registro de atividade', tr: 'Etkinlik günlüğü' })}</h3>
          {activity.length === 0 && !activityLoading && <p className={`text-[13px] py-3 text-center ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{tx(lang, { fr: 'Aucune activité.', ar: 'لا نشاط.', en: 'No activity.', es: 'Sin actividad.', pt: 'Nenhuma atividade.', tr: 'Etkinlik yok.' })}</p>}
          <div className="space-y-1.5">
            {activity.map(a => {
              const Icon = ACTIVITY_ICON[a.action] || Activity;
              return (
                <div key={a.id} className={`flex items-start gap-2 py-1.5 border-b last:border-0 ${isDark ? 'border-dk-border' : 'border-slate-50'}`}>
                  <Icon size={13} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${isDark ? 'text-dk-muted' : 'text-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[12.5px] ${isDark ? 'text-dk-text' : 'text-slate-700'}`}>{a.detail || `${a.action} · ${a.table_name}`}</p>
                    <p className={`text-[10.5px] ${isDark ? 'text-dk-muted' : 'text-slate-400'}`}>{a.name || a.email || '—'} · {fmtDate(a.timestamp)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {activityHasMore && (
            <button onClick={() => void loadActivity(activityOffset, true)} disabled={activityLoading}
              className={`w-full h-8 mt-3 rounded-md border text-[12.5px] font-medium ${isDark ? 'border-dk-border text-dk-muted hover:bg-dk-bg' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              {activityLoading ? tx(lang, { fr: 'Chargement…', ar: 'جارٍ التحميل…', en: 'Loading…', es: 'Cargando…', pt: 'Carregando…', tr: 'Yükleniyor…' }) : tx(lang, { fr: 'Charger plus', ar: 'تحميل المزيد', en: 'Load more', es: 'Cargar más', pt: 'Carregar mais', tr: 'Daha fazla yükle' })}
            </button>
          )}
        </div>
      )}

      {/* Confirmation */}
      {confirm && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirm(null)}>
          <div className={`rounded-lg border shadow-lg dark:shadow-dk-lg p-5 max-w-sm w-full ${isDark ? 'bg-dk-surface border-dk-border' : 'bg-white border-slate-200'}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h4 className={`text-[13px] font-semibold ${isDark ? 'text-dk-text' : 'text-slate-900'}`}>{tx(lang, { fr: 'Confirmation', ar: 'تأكيد', en: 'Confirmation', es: 'Confirmación', pt: 'Confirmação', tr: 'Onay' })}</h4>
              <button onClick={() => setConfirm(null)} className={`${isDark ? 'text-dk-muted hover:text-dk-text' : 'text-slate-400 hover:text-slate-600'}`}><X size={16} strokeWidth={1.75} /></button>
            </div>
            <p className={`text-[13px] mb-4 ${isDark ? 'text-dk-muted' : 'text-slate-500'}`}>{confirmText}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)} className={`h-8 px-3 rounded-md border text-[13px] font-medium ${isDark ? 'border-dk-border text-dk-muted hover:bg-dk-bg' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}</button>
              <button onClick={() => confirm()} className="h-8 px-3 rounded-md text-white text-[13px] font-medium" style={{ background: ACCENT }}>{tx(lang, { fr: 'Confirmer', ar: 'تأكيد', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' })}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
