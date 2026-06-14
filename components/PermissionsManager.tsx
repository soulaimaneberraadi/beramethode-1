import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Shield, Plus, Trash2, Check, UserPlus, Eye, Pencil, X, Users } from 'lucide-react';
import { PROTECTED_PAGES, PROTECTED_FIELDS, ROLE_PRESETS, RolePresetKey } from '../server/permissions/presets';

/**
 * Gestionnaire de permissions — arbre type « Device Manager ».
 * Style : Minimalist SaaS (langage Planning) — slate, accent #2149C1,
 * rounded-md/lg, font-medium/semibold, icônes fines text-slate-400, pas de gradients.
 */

interface Role { id: string; name: string; level: number; parent_role_id: string | null; is_system: number; }
interface Member { id: string; user_id: number; role_id: string; status: string; email: string; name: string; role_name: string; level: number; }
interface PermRow { resource_type: 'page' | 'field'; resource_key: string; can_view: number; can_edit: number; }

const ACCENT = '#2149C1';

const PAGE_LABELS: Record<string, string> = {
  dashboard: 'Tableau de bord', ingenierie: 'Ingénierie', atelier: 'Chef Atelier',
  atelierProd: 'Atelier Prod', library: 'Bibliothèque', coupe: 'La Coupe', effectifs: 'Effectifs',
  gestionRh: 'Gestion RH', planning: 'Planning', suivi: 'Suivi', rendement: 'Rendement', magasin: 'Magasin',
  export: 'Export', facturation: 'Facturation', config: 'Paramètres', pageMachine: 'Page Machine',
  machin: 'Machines', objectifs: 'Objectifs', sousTraitance: 'Sous-traitance',
};
const FIELD_LABELS: Record<string, string> = {
  'model.cout_minute': 'Coût / minute', 'model.prix_revient': 'Prix de revient',
  'hr.salaire': 'Salaires', 'hr.avances': 'Avances', 'facturation.marge': 'Marge',
};

const api = (url: string, opts?: RequestInit) =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts }).then(r => r.json());

export default function PermissionsManager() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [perms, setPerms] = useState<Record<string, PermRow>>({});
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<null | (() => void)>(null);
  const [confirmText, setConfirmText] = useState('');
  const [newRole, setNewRole] = useState<{ name: string; preset: RolePresetKey | '' }>({ name: '', preset: '' });
  const [newMember, setNewMember] = useState({ email: '', role_id: '' });
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
    setConfirmText('Enregistrer les permissions de ce rôle ?');
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
    setConfirmText('Supprimer ce rôle ?');
    setConfirm(() => async () => { await api(`/api/permissions/roles/${id}`, { method: 'DELETE' }); setConfirm(null); void reload(); });
  };

  const addMember = async () => {
    if (!newMember.email || !newMember.role_id) return;
    await api('/api/permissions/members', { method: 'POST', body: JSON.stringify(newMember) });
    setNewMember({ email: '', role_id: '' }); void reload();
  };

  const removeMember = (userId: number) => {
    setConfirmText('Retirer ce membre ? (garde son profil, perd l’accès aux données)');
    setConfirm(() => async () => { await api(`/api/permissions/members/${userId}`, { method: 'DELETE' }); setConfirm(null); void reload(); });
  };

  const Toggle = ({ on, onClick, icon: Icon }: { on: boolean; onClick: () => void; icon: any }) => (
    <button onClick={onClick}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors"
      style={on ? { background: ACCENT, borderColor: ACCENT, color: '#fff' } : { background: '#f8fafc', borderColor: '#e2e8f0', color: '#94a3b8' }}>
      {on ? <Check size={13} strokeWidth={2} /> : <Icon size={13} strokeWidth={1.75} />}
    </button>
  );

  const inputCls = 'px-2.5 h-8 rounded-md border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100 text-[13px] text-slate-700';

  if (loading) return <div className="p-8 text-slate-400 text-[13px]">Chargement…</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5" dir="ltr">
      {/* En-tête */}
      <div className="flex items-center gap-2">
        <Shield size={16} strokeWidth={1.75} className="text-slate-400" />
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">Permissions & Hiérarchie</h2>
          <p className="text-[11px] text-slate-400">Gérez les rôles, ce que chacun voit et modifie.</p>
        </div>
      </div>

      {/* Rôles */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-[13px] font-semibold text-slate-900 mb-3">Rôles</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={newRole.name} onChange={e => setNewRole(s => ({ ...s, name: e.target.value }))} placeholder="Nom du rôle" className={`flex-1 min-w-[140px] ${inputCls}`} />
          <select value={newRole.preset} onChange={e => setNewRole(s => ({ ...s, preset: e.target.value as RolePresetKey }))} className={`${inputCls} bg-white`}>
            <option value="">Sans preset</option>
            {Object.keys(ROLE_PRESETS).map(k => <option key={k} value={k}>{ROLE_PRESETS[k as RolePresetKey].name}</option>)}
          </select>
          <button onClick={createRole} className="h-8 px-3 rounded-md bg-slate-900 text-white text-[13px] font-medium inline-flex items-center gap-1 hover:bg-slate-800"><Plus size={14} strokeWidth={1.75} /> Ajouter</button>
        </div>

        {roles.length === 0 && <p className="text-[13px] text-slate-400 py-3 text-center">Aucun rôle. Créez-en un (avec preset pour démarrer vite).</p>}

        {roles.map(role => (
          <div key={role.id} className="border border-slate-100 rounded-md mb-1.5 overflow-hidden">
            <div className="flex items-center justify-between px-3 h-9 cursor-pointer hover:bg-slate-50/60" onClick={() => openRolePerms(role.id)}>
              <div className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
                {openRole === role.id ? <ChevronDown size={14} strokeWidth={1.75} className="text-slate-400" /> : <ChevronRight size={14} strokeWidth={1.75} className="text-slate-400" />}
                {role.name}
                <span className="text-[10px] text-slate-400 tabular-nums">niv. {role.level}</span>
              </div>
              {!role.is_system && <button onClick={e => { e.stopPropagation(); delRole(role.id); }} className="text-slate-300 hover:text-slate-600"><Trash2 size={13} strokeWidth={1.75} /></button>}
            </div>

            {openRole === role.id && (
              <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-50">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 mt-2">Pages</p>
                  {PROTECTED_PAGES.map(pg => {
                    const p = perms[`page|${pg}`] || { can_view: 0, can_edit: 0 };
                    return (
                      <div key={pg} className="flex items-center justify-between py-0.5">
                        <span className="text-[13px] text-slate-600">{PAGE_LABELS[pg] || pg}</span>
                        <div className="flex gap-1.5">
                          <Toggle on={!!p.can_view} onClick={() => toggle('page', pg, 'view')} icon={Eye} />
                          <Toggle on={!!p.can_edit} onClick={() => toggle('page', pg, 'edit')} icon={Pencil} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Champs sensibles</p>
                  {PROTECTED_FIELDS.map(fd => {
                    const p = perms[`field|${fd}`] || { can_view: 0, can_edit: 0 };
                    return (
                      <div key={fd} className="flex items-center justify-between py-0.5">
                        <span className="text-[13px] text-slate-600">🔒 {FIELD_LABELS[fd] || fd}</span>
                        <Toggle on={!!p.can_view} onClick={() => toggle('field', fd, 'view')} icon={Eye} />
                      </div>
                    );
                  })}
                </div>
                {dirty && (
                  <button onClick={saveRolePerms} className="w-full h-8 rounded-md text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5" style={{ background: ACCENT }}>
                    <Check size={14} strokeWidth={2} /> Enregistrer
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Membres */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-[13px] font-semibold text-slate-900 mb-3 flex items-center gap-1.5"><Users size={14} strokeWidth={1.75} className="text-slate-400" /> Membres</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          <input value={newMember.email} onChange={e => setNewMember(s => ({ ...s, email: e.target.value }))} placeholder="E-mail du membre" className={`flex-1 min-w-[160px] ${inputCls}`} />
          <select value={newMember.role_id} onChange={e => setNewMember(s => ({ ...s, role_id: e.target.value }))} className={`${inputCls} bg-white`}>
            <option value="">Rôle…</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={addMember} className="h-8 px-3 rounded-md bg-slate-900 text-white text-[13px] font-medium inline-flex items-center gap-1 hover:bg-slate-800"><UserPlus size={14} strokeWidth={1.75} /> Inviter</button>
        </div>
        {members.length === 0 && <p className="text-[13px] text-slate-400 py-2 text-center">Aucun membre.</p>}
        {members.map(m => (
          <div key={m.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
            <div>
              <p className="text-[13px] font-medium text-slate-700">{m.name || m.email} {m.status === 'removed' && <span className="text-[10px] text-slate-400">(retiré)</span>}</p>
              <p className="text-[11px] text-slate-400">{m.email} · {m.role_name || '—'}</p>
            </div>
            {m.status === 'active' && <button onClick={() => removeMember(m.user_id)} className="text-slate-300 hover:text-slate-600"><Trash2 size={13} strokeWidth={1.75} /></button>}
          </div>
        ))}
      </div>

      {/* Confirmation */}
      {confirm && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirm(null)}>
          <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[13px] font-semibold text-slate-900">Confirmation</h4>
              <button onClick={() => setConfirm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} strokeWidth={1.75} /></button>
            </div>
            <p className="text-[13px] text-slate-500 mb-4">{confirmText}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)} className="h-8 px-3 rounded-md border border-slate-200 text-[13px] font-medium text-slate-500 hover:bg-slate-50">Annuler</button>
              <button onClick={() => confirm()} className="h-8 px-3 rounded-md text-white text-[13px] font-medium" style={{ background: ACCENT }}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
