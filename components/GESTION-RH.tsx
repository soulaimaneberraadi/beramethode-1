import React, { useEffect, useState, useCallback, useRef, useMemo, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, Clock, BarChart2, DollarSign, FileText,
  Search, X, Check, AlertCircle, ChevronDown, ChevronLeft, Download,
  Camera, Edit3, Trash2, Eye, EyeOff, Phone, Calendar,
  Shield, Star, Plus, Save, RefreshCw, Filter,
  TrendingUp,   Award, AlertTriangle, CheckCircle, Factory, PieChart, IdCard,
  Mail, Key, Copy, LayoutGrid, Table2, Truck, Navigation,
} from 'lucide-react';
import { HRWorkerProfilePanel } from './HRWorkerProfilePanel';
import * as XLSX from 'xlsx';
import { HRWorker, HRPointage, HRAvance, HRWorkerRole, HRContractType, HRPointageStatus, SuiviData, PlanningEvent, AppSettings, HRTransportLigne } from '../types';
import { getSageTimesForHeuresCalc, sageCreneauWarning } from '../lib/sageTimeRules';
import {
  getDefaultPointageTranches,
  parsePointageTranchesFromSettings,
  deriveGrilleFromTimes,
  parseGrillePresence,
  serializeGrillePresence,
  toggleGrilleSlot,
  grilleToEntreeSortiePause,
  type PointageTranchesConfig,
  tranchesHeaderColCount,
} from '../lib/pointageGrille';

/** Hauteur 1re ligne d’en-tête (px) — offset sticky pour la ligne des libellés de tranches */
const POINTAGE_THEAD_R1_H = 36;

const ANNUAIRE_VIEW_KEY = 'beramethode_effectifs_annuaire_view';

// ─── CONSTANTS ────────────────────────────────────────────
const ROLES: HRWorkerRole[] = ['OPERATOR', 'SUPERVISOR', 'MECHANIC', 'ADMIN', 'QC', 'IRON', 'CUTTER', 'PACKER'];
const ROLE_LABELS: Record<HRWorkerRole, string> = {
  OPERATOR: 'Opérateur', SUPERVISOR: 'Superviseur', MECHANIC: 'Mécanicien',
  ADMIN: 'Admin', QC: 'Contrôle Q.', IRON: 'Repassage', CUTTER: 'Coupeur', PACKER: 'Emballage'
};
const ROLE_COLORS: Record<HRWorkerRole, string> = {
  OPERATOR: '#3B82F6', SUPERVISOR: '#8B5CF6', MECHANIC: '#F59E0B',
  ADMIN: '#EF4444', QC: '#10B981', IRON: '#EC4899', CUTTER: '#F97316', PACKER: '#6366F1'
};
const STATUS_CONFIG: Record<HRPointageStatus, { label: string; color: string; bg: string }> = {
  PRESENT:  { label: 'Présent',  color: '#059669', bg: '#ecfdf5' },
  RETARD:   { label: 'Retard',   color: '#d97706', bg: '#fffbeb' },
  ABSENT:   { label: 'Absent',   color: '#dc2626', bg: '#fef2f2' },
  CONGE:    { label: 'Congé',    color: '#2563eb', bg: '#eff6ff' },
  MALADIE:  { label: 'Maladie',  color: '#7c3aed', bg: '#f5f3ff' },
  MISSION:  { label: 'Mission',  color: '#0d9488', bg: '#f0fdfa' },
  FERIE:    { label: 'Férié',    color: '#4b5563', bg: '#f9fafb' },
};
const AVANCE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  DEMANDE:   { label: 'En attente', color: '#d97706', bg: '#fffbeb' },
  APPROUVE:  { label: 'Approuvé',  color: '#059669', bg: '#ecfdf5' },
  EN_COURS:  { label: 'En cours',  color: '#2563eb', bg: '#eff6ff' },
  REMBOURSE: { label: 'Remboursé', color: '#4b5563', bg: '#f9fafb' },
  REFUSE:    { label: 'Refusé',    color: '#dc2626', bg: '#fef2f2' },
};

const ABSENCE_LIKE: HRPointageStatus[] = ['CONGE', 'MALADIE', 'MISSION', 'FERIE'];

/** Cohérence saisie entrée / sortie (même logique base : sortie < entrée = nuit, traité côté serveur). */
function getPointageEntreeSortieHint(
  heureEntre: string | null | undefined,
  heureSort: string | null | undefined,
  statut: HRPointageStatus | string | undefined,
): { level: 'ok' | 'warn' | 'mute'; label: string } {
  const st = (statut as HRPointageStatus) || 'PRESENT';
  if (st === 'ABSENT' || ABSENCE_LIKE.includes(st as HRPointageStatus)) {
    if (heureEntre || heureSort) {
      return { level: 'warn', label: 'Horaires saisis mais statut absence' };
    }
    return { level: 'mute', label: '—' };
  }
  if (!heureEntre && !heureSort) {
    return { level: 'warn', label: 'Aucun pointage' };
  }
  if (heureEntre && !heureSort) {
    return { level: 'warn', label: 'Sortie manquante' };
  }
  if (!heureEntre && heureSort) {
    return { level: 'warn', label: 'Sortie sans entrée — erreur de pointeuse / ordre' };
  }
  const toMin = (t: string) => {
    const [a, b] = t.split(':').map(Number);
    return (a || 0) * 60 + (b || 0);
  };
  const e = toMin(String(heureEntre));
  const s = toMin(String(heureSort));
  if (s < e) {
    return { level: 'ok', label: 'Nuit (sortie < entrée) — calcul 24h ok' };
  }
  return { level: 'ok', label: 'Entrée → sortie' };
}

const API = (path: string, opts?: RequestInit) =>
  fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });

const uid = () => `hr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStr = () => new Date().toISOString().slice(0, 7);
/** Délai jusqu’à la prochaine heure exacte (…:00:00) — pour sync auto pointage. */
const msUntilNextClockHour = (): number => {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return Math.max(0, d.getTime() - Date.now());
};

/** Valeur `HH:MM` pour `<input type="time" />` depuis fiche. */
function normalizeTimeForInput(s: string | null | undefined): string {
  if (!s) return '';
  const m = String(s).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${String(Math.min(23, Math.max(0, parseInt(m[1], 10) || 0))).padStart(2, '0')}:${m[2]}`;
}

/** Durée décimale (API) → libellé FR : `8` → `8h`, `7.5` → `7h30` (totaux / colonnes pointage). */
function formatDureeHeuresFR(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0h';
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  const totalMin = Math.round(abs * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (mm === 0) return `${sign}${hh}h`;
  return `${sign}${hh}h${String(mm).padStart(2, '0')}`;
}

function formatDureeCellulePointage(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return formatDureeHeuresFR(n);
}

/** Retire les champs joints par `SELECT p.*, w.full_name…` avant POST pointage. */
function sanitizePointageRowForSave(row: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!row) return {};
  const omit = new Set(['full_name', 'matricule', 'role']);
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!omit.has(k)) o[k] = v;
  }
  return o;
}

// ─── STYLE HELPERS ────────────────────────────────────────
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 };
const inputStyle: React.CSSProperties = { border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#0F172A', background: '#fff', outline: 'none', fontFamily: 'inherit', width: '100%' };
const btnPrimary: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '10px 20px', background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)', transition: 'all 0.2s' };
const btnSecondary: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s' };
const btnDanger: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#fff1f2', color: '#e11d48', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s' };

function Field({ label, value, onChange, type = 'text', placeholder, required }: { label: string; value?: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <label style={labelStyle}>{label}{required && <span style={{ color: '#EF4444' }}> *</span>}</label>
      <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={inputStyle} />
    </div>
  );
}

// ─── TYPES ────────────────────────────────────────────────
type Tab = 'annuaire' | 'pointage' | 'statistiques' | 'production' | 'avances' | 'sage' | 'invitations' | 'transport';

// Post categories shown in the stats tab
const POST_CATEGORIES = [
  { key: 'surge_piqueuse', label: 'Surgé / Piqueuse', roles: ['OPERATOR'] as HRWorkerRole[], postes: ['SURGE','PIQUEUSE','SURJETEUSE','PIQUEUSE PLATE','PIQUEUR','SURJETEUSE 5 FILS','SURJETEUSE 4 FILS'] },
  { key: 'chef', label: 'Chef Chaîne', roles: ['SUPERVISOR'] as HRWorkerRole[], postes: ['CHEF','SUPERVISOR','CHEF DE CHAINE','CHEF CHAINE'] },
  { key: 'trouseuse', label: 'Boutonnière / Bouton', roles: ['OPERATOR'] as HRWorkerRole[], postes: ['TROUSEUSE','BOUTONNIERE','BOUTON','BRIDEUSE'] },
  { key: 'presse', label: 'Repassage / Presse', roles: ['IRON'] as HRWorkerRole[], postes: ['PRESSE','REPASSAGE','FER','IRON'] },
  { key: 'recouvrement', label: 'Recouvreuse', roles: ['OPERATOR'] as HRWorkerRole[], postes: ['RECOUVREMENT','COLLETEUSE','RECOUVREUSE'] },
];

// ─── WORKER MODAL ─────────────────────────────────────────
const EMPTY_WORKER: Partial<HRWorker> = {
  sexe: 'M', role: 'OPERATOR', type_contrat: 'CDI', is_active: true,
  salaire_base: 0, taux_horaire: 0, taux_piece: 0,
  prime_assiduite: 0, prime_transport: 0, mode_paiement: 'VIREMENT',
};

function WorkerModal({ worker, onClose, onSave, transportLignes }: { worker: Partial<HRWorker> | null; onClose: () => void; onSave: () => void; transportLignes: HRTransportLigne[] }) {
  const [form, setForm] = useState<Partial<HRWorker>>(worker ?? EMPTY_WORKER);
  const [saving, setSaving] = useState(false);
  const [subTab, setSubTab] = useState<'identity' | 'emploi' | 'financier' | 'urgence'>('identity');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(worker ?? EMPTY_WORKER);
    setPin1('');
    setPin2('');
    setSubTab('identity');
  }, [worker]);

  const set = (k: keyof HRWorker, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set('photo', ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.matricule || !form.full_name) {
      alert('Matricule et nom complet sont requis');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form, id: form.id || uid() };
      delete payload.person_id;
      delete payload.has_pin;
      const lp = String(payload.link_person_id ?? '').trim();
      if (lp) payload.link_person_id = lp;
      else delete payload.link_person_id;
      const r = await API('/api/hr/workers', { method: 'POST', body: JSON.stringify(payload) });
      const data = (await r.json().catch(() => ({}))) as { message?: string; code?: string; existing?: { full_name?: string }; person_id?: string };
      if (!r.ok) {
        if (data.code === 'CIN_DUPLICATE') {
          const n = data.existing?.full_name ? ` (${data.existing.full_name})` : '';
          alert(`Ce CIN existe déjà${n}. Utilisez « Rattacher person_id » ou corrigez le CIN.`);
        } else {
          alert(data.message || `Erreur ${r.status}`);
        }
        setSaving(false);
        return;
      }
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSetPin = async () => {
    if (!form.id) {
      alert('Enregistrez d’abord la fiche pour définir le PIN.');
      return;
    }
    if (!/^\d{4,8}$/.test(pin1)) {
      alert('PIN : 4 à 8 chiffres.');
      return;
    }
    if (pin1 !== pin2) {
      alert('Les deux saisies PIN diffèrent.');
      return;
    }
    setPinBusy(true);
    try {
      const r = await API(`/api/hr/workers/${encodeURIComponent(form.id)}/pin`, { method: 'POST', body: JSON.stringify({ pin: pin1 }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert((d as { message?: string }).message || 'Erreur PIN');
        return;
      }
      setPin1('');
      setPin2('');
      alert('PIN BERAOUVIER enregistré.');
    } finally {
      setPinBusy(false);
    }
  };

  const subTabs = [
    { id: 'identity', label: '👤 Identité' },
    { id: 'emploi',   label: '💼 Emploi' },
    { id: 'financier', label: '💰 Financier' },
    { id: 'urgence',  label: '🆘 Urgence' },
  ] as const;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
            {form.id ? `Modifier — ${form.full_name}` : 'Nouvel Ouvrier'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={20} /></button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', padding: '0 24px' }}>
          {subTabs.map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              style={{ padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                color: subTab === t.id ? '#2149C1' : '#64748B',
                borderBottom: subTab === t.id ? '2px solid #2149C1' : '2px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {subTab === 'identity' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Photo */}
              <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#F1F5F9', border: '2px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => photoRef.current?.click()}>
                  {form.photo
                    ? <img src={form.photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <Camera size={28} style={{ color: '#94A3B8' }} />}
                </div>
                <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
                <div>
                  <button onClick={() => photoRef.current?.click()} style={{ ...btnSecondary, fontSize: 12 }}>
                    <Camera size={14} style={{ marginRight: 6 }} />Choisir photo
                  </button>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>JPG, PNG — max 2MB</div>
                </div>
              </div>
              <Field label="Matricule" value={form.matricule} onChange={v => set('matricule', v)} placeholder="MAT-001" required />
              <Field label="Nom Complet" value={form.full_name} onChange={v => set('full_name', v)} placeholder="Prénom Nom" required />
              <Field label="CIN" value={form.cin ?? ''} onChange={v => set('cin', v)} placeholder="AB123456" />
              <Field label="CNSS" value={form.cnss ?? ''} onChange={v => set('cnss', v)} placeholder="Numéro CNSS" />
              {form.id && (
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Person ID (plateforme)</label>
                  <div style={{ ...inputStyle, background: '#F8FAFC', color: '#475569', fontSize: 12 }} title="Identifiant stable Section 23">
                    {form.person_id || '—'}
                  </div>
                </div>
              )}
              <div style={{ gridColumn: '1/-1' }}>
                <Field
                  label="Rattacher à un person_id existant (optionnel)"
                  value={form.link_person_id ?? ''}
                  onChange={v => set('link_person_id', v)}
                  placeholder="per-xxxxxxxx (fusion volontaire)"
                />
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Laisser vide pour créer / garder le lien automatique. Ne remplir qu’en cas de fusion RH explicite.</div>
              </div>
              {form.id && (
                <div style={{ gridColumn: '1/-1', borderTop: '1px solid #E2E8F0', paddingTop: 16, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Key size={16} color="#2149C1" />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>PIN BERAOUVIER (CIN + PIN)</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Nouveau PIN" value={pin1} onChange={setPin1} type="password" placeholder="4–8 chiffres" />
                    <Field label="Confirmer PIN" value={pin2} onChange={setPin2} type="password" placeholder="répéter" />
                  </div>
                  <button type="button" onClick={handleSetPin} disabled={pinBusy} style={{ ...btnSecondary, marginTop: 10 }}>
                    {pinBusy ? '…' : 'Enregistrer le PIN'}
                  </button>
                </div>
              )}
              <Field label="Téléphone" value={form.phone ?? ''} onChange={v => set('phone', v)} placeholder="06 XX XX XX" />
              <Field label="Date Naissance" value={form.date_naissance ?? ''} onChange={v => set('date_naissance', v)} type="date" />
              <div>
                <label style={labelStyle}>Sexe</label>
                <select value={form.sexe ?? 'M'} onChange={e => set('sexe', e.target.value)} style={inputStyle}>
                  <option value="M">Homme</option>
                  <option value="F">Femme</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <Field label="Adresse" value={form.adresse ?? ''} onChange={v => set('adresse', v)} placeholder="Adresse complète" />
              </div>
            </div>
          )}

          {subTab === 'emploi' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Rôle</label>
                <select value={form.role ?? 'OPERATOR'} onChange={e => set('role', e.target.value as HRWorkerRole)} style={inputStyle}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <Field label="Chaîne" value={form.chaine_id ?? ''} onChange={v => set('chaine_id', v)} placeholder="ex: CHAINE 1" />
              <Field label="Parda / Équipe" value={form.equipe ?? ''} onChange={v => set('equipe', v)} placeholder="ex: Équipe A / Équipe B" />
              <Field label="Poste" value={form.poste ?? ''} onChange={v => set('poste', v)} placeholder="ex: Piqueur" />
              <Field label="Spécialité" value={form.specialite ?? ''} onChange={v => set('specialite', v)} placeholder="ex: Jupe" />
              <Field label="Date Embauche" value={form.date_embauche ?? ''} onChange={v => set('date_embauche', v)} type="date" required />
              <div>
                <label style={labelStyle}>Type Contrat</label>
                <select value={form.type_contrat ?? 'CDI'} onChange={e => set('type_contrat', e.target.value as HRContractType)} style={inputStyle}>
                  {(['CDI','CDD','ANAPEC','STAGE'] as HRContractType[]).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {form.type_contrat !== 'CDI' && (
                <Field label="Date Fin Contrat" value={form.date_fin_contrat ?? ''} onChange={v => set('date_fin_contrat', v)} type="date" />
              )}
              <div>
                <label style={labelStyle}>Statut</label>
                <select value={form.is_active ? '1' : '0'} onChange={e => set('is_active', e.target.value === '1')} style={inputStyle}>
                  <option value="1">Actif</option>
                  <option value="0">Inactif</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Ligne de Transport</label>
                <select value={form.transport_ligne_id ?? ''} onChange={e => set('transport_ligne_id', e.target.value || null)} style={inputStyle}>
                  <option value="">-- Sans Transport --</option>
                  {transportLignes.map(l => (
                    <option key={l.id} value={l.id}>{l.nom} {l.chauffeur_nom ? `(${l.chauffeur_nom})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {subTab === 'financier' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1/-1', background: '#F0F9FF', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#0369A1' }}>
                ℹ️ Ces données sont confidentielles — non exposées aux ouvriers via BERAOUVIER
              </div>
              <Field label="Salaire Base (MAD)" value={form.salaire_base ?? 0} onChange={v => set('salaire_base', parseFloat(v) || 0)} type="number" />
              <Field label="Taux Horaire (MAD/h)" value={form.taux_horaire ?? 0} onChange={v => set('taux_horaire', parseFloat(v) || 0)} type="number" />
              <Field label="Taux Pièce (MAD)" value={form.taux_piece ?? 0} onChange={v => set('taux_piece', parseFloat(v) || 0)} type="number" />
              <Field label="Prime Assiduité (MAD)" value={form.prime_assiduite ?? 0} onChange={v => set('prime_assiduite', parseFloat(v) || 0)} type="number" />
              <Field label="Prime Transport (MAD)" value={form.prime_transport ?? 0} onChange={v => set('prime_transport', parseFloat(v) || 0)} type="number" />
              <div>
                <label style={labelStyle}>Mode Paiement</label>
                <select value={form.mode_paiement ?? 'VIREMENT'} onChange={e => set('mode_paiement', e.target.value)} style={inputStyle}>
                  <option value="VIREMENT">Virement bancaire</option>
                  <option value="ESPECES">Espèces</option>
                  <option value="CHEQUE">Chèque</option>
                </select>
              </div>
            </div>
          )}

          {subTab === 'urgence' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Nom Contact Urgence" value={form.contact_urgence_nom ?? ''} onChange={v => set('contact_urgence_nom', v)} placeholder="Nom complet" />
              <Field label="Tél Contact Urgence" value={form.contact_urgence_tel ?? ''} onChange={v => set('contact_urgence_tel', v)} placeholder="06 XX XX XX" />
              <div>
                <label style={labelStyle}>Lien de parenté</label>
                <select value={form.contact_urgence_lien ?? ''} onChange={e => set('contact_urgence_lien', e.target.value)} style={inputStyle}>
                  <option value="">-- Sélectionner --</option>
                  {['Père','Mère','Conjoint(e)','Frère','Sœur','Autre'].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }} placeholder="Notes libres..." />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={btnSecondary}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? 'Enregistrement...' : <><Save size={14} style={{ marginRight: 6 }} />Enregistrer</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── STATISTIQUES TAB ─────────────────────────────────────
interface StatsTabProps {
  workers: HRWorker[];
  pointages: any[];
  suivis: SuiviData[];
  planningEvents: PlanningEvent[];
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  onRefresh: () => void;
}

function StatistiquesTab({ workers, pointages, suivis, planningEvents, selectedDate, setSelectedDate, onRefresh }: StatsTabProps) {
  const [selectedChainDetail, setSelectedChainDetail] = useState<string | null>(null);
  const chaineCount = useMemo(() => {
    const ids = new Set<string>();
    workers.forEach(w => { if (w.chaine_id) ids.add(w.chaine_id); });
    planningEvents.forEach(e => ids.add(e.chaineId));
    return Array.from(ids).sort();
  }, [workers, planningEvents]);

  const getPointageStatus = (workerId: string): HRPointageStatus => {
    const p = pointages.find((x: any) => x.worker_id === workerId);
    return (p?.statut as HRPointageStatus) || 'ABSENT';
  };

  const todaySuivis = useMemo(() => suivis.filter(s => s.date === selectedDate), [suivis, selectedDate]);

  const chaineSummary = useMemo(() => {
    return chaineCount.map(chaineId => {
      const chaineWorkers = workers.filter(w => w.chaine_id === chaineId);
      const presents = chaineWorkers.filter(w => {
        const s = getPointageStatus(w.id);
        return s === 'PRESENT' || s === 'RETARD';
      });
      const absents = chaineWorkers.filter(w => {
        const s = getPointageStatus(w.id);
        return s === 'ABSENT' || s === 'MALADIE' || s === 'CONGE';
      });

      // Active planning event for this chain today
      const activePlan = planningEvents.find(e =>
        e.chaineId === chaineId && (e.status === 'IN_PROGRESS' || e.status === 'ON_TRACK' || e.status === 'READY')
      );
      // Today's production for this chain
      const chaineSuivis = todaySuivis.filter(s => {
        const plan = planningEvents.find(p => p.id === s.planningId);
        return plan?.chaineId === chaineId;
      });
      const todayProduced = chaineSuivis.reduce((acc, s) => acc + (s.totalHeure || 0), 0);

      // Post breakdown
      const postBreakdown = POST_CATEGORIES.map(cat => {
        const catWorkers = chaineWorkers.filter(w => {
          const posteUpper = (w.poste || '').toUpperCase();
          return cat.roles.includes(w.role) || cat.postes.some(p => posteUpper.includes(p));
        });
        const catPresents = catWorkers.filter(w => {
          const s = getPointageStatus(w.id);
          return s === 'PRESENT' || s === 'RETARD';
        });
        return { ...cat, total: catWorkers.length, presents: catPresents.length };
      });

      return { chaineId, total: chaineWorkers.length, presents: presents.length, absents: absents.length, activePlan, todayProduced, postBreakdown };
    });
  }, [chaineCount, workers, pointages, planningEvents, todaySuivis]);

  // Emballage workers (PACKER role or poste contains EMBALLAGE)
  const emballageWorkers = useMemo(() =>
    workers.filter(w => w.role === 'PACKER' || (w.poste || '').toUpperCase().includes('EMBALLAG')),
    [workers]);
  const emballagePresents = emballageWorkers.filter(w => {
    const s = getPointageStatus(w.id);
    return s === 'PRESENT' || s === 'RETARD';
  });

  // Admin workers
  const adminWorkers = useMemo(() =>
    workers.filter(w => w.role === 'ADMIN' || (w.poste || '').toUpperCase().includes('ADMIN')),
    [workers]);
  const adminPresents = adminWorkers.filter(w => {
    const s = getPointageStatus(w.id);
    return s === 'PRESENT' || s === 'RETARD';
  });

  const totalPresents = workers.filter(w => {
    const s = getPointageStatus(w.id);
    return s === 'PRESENT' || s === 'RETARD';
  }).length;
  const totalAbsents = workers.length - totalPresents;

  return (
    <div>
      {/* Header controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={16} style={{ color: '#64748B' }} />
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            style={{ ...inputStyle, width: 160 }} />
        </div>
        <button onClick={onRefresh} style={btnSecondary}><RefreshCw size={14} style={{ marginRight: 6 }} />Actualiser</button>

        {/* Global KPIs */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {[
            { label: 'Total Effectif', val: workers.length, bg: '#EFF6FF', color: '#1D4ED8' },
            { label: 'Présents', val: totalPresents, bg: '#ECFDF5', color: '#065F46' },
            { label: 'Absents', val: totalAbsents, bg: '#FEF2F2', color: '#991B1B' },
          ].map(k => (
            <div key={k.label} style={{ padding: '8px 16px', borderRadius: 10, background: k.bg, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.val}</div>
              <div style={{ fontSize: 11, color: k.color, opacity: 0.7, fontWeight: 600 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chain cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        {chaineSummary.map(ch => {
          const presencePct = ch.total > 0 ? Math.round((ch.presents / ch.total) * 100) : 0;
          return (
            <div 
              key={ch.chaineId} 
              onClick={() => setSelectedChainDetail(ch.chaineId)}
              style={{ 
                background: '#fff', 
                borderRadius: 14, 
                padding: 18, 
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)', 
                border: '1px solid #F1F5F9',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)';
              }}
            >
              {/* Chain header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Factory size={18} color="#4F46E5" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>{ch.chaineId}</div>
                    {ch.activePlan && (
                      <div style={{ fontSize: 10, color: '#6366F1', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ▶ {ch.activePlan.modelName || 'Modèle en cours'}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: presencePct >= 80 ? '#065F46' : presencePct >= 60 ? '#92400E' : '#991B1B' }}>
                    {presencePct}%
                  </div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>Présence</div>
                </div>
              </div>

              {/* Presence bar */}
              <div style={{ height: 6, background: '#F1F5F9', borderRadius: 4, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${presencePct}%`, background: presencePct >= 80 ? '#10B981' : presencePct >= 60 ? '#F59E0B' : '#EF4444', borderRadius: 4, transition: 'width 0.5s' }} />
              </div>

              {/* Counts row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Total', val: ch.total, bg: '#F8FAFC', color: '#374151' },
                  { label: 'Présents', val: ch.presents, bg: '#ECFDF5', color: '#065F46' },
                  { label: 'Absents', val: ch.absents, bg: '#FEF2F2', color: '#991B1B' },
                  ...(ch.todayProduced > 0 ? [{ label: 'Pcs/jour', val: ch.todayProduced, bg: '#EEF2FF', color: '#4F46E5' }] : []),
                ].map(k => (
                  <div key={k.label} style={{ flex: 1, padding: '6px 8px', borderRadius: 8, background: k.bg, textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: k.color }}>{k.val}</div>
                    <div style={{ fontSize: 9, color: k.color, opacity: 0.7, fontWeight: 600 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Post breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ch.postBreakdown.filter(p => p.total > 0).map(p => (
                  <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 11, color: '#64748B', flex: 1, fontWeight: 500 }}>{p.label}</div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#065F46', background: '#ECFDF5', padding: '1px 6px', borderRadius: 10 }}>{p.presents}✓</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>/{p.total}</span>
                    </div>
                  </div>
                ))}
                {ch.postBreakdown.every(p => p.total === 0) && (
                  <div style={{ fontSize: 11, color: '#CBD5E1', fontStyle: 'italic' }}>Postes non définis</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Emballage + Administration sections */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Emballage */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 18 }}>📦</span>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>Emballage</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{emballagePresents.length}/{emballageWorkers.length} présents</div>
            </div>
          </div>
          {emballageWorkers.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {emballageWorkers.map(w => {
                const st = getPointageStatus(w.id);
                const sc = STATUS_CONFIG[st];
                return (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{w.full_name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: sc.bg, color: sc.color }}>{sc.label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20, color: '#CBD5E1', fontSize: 12 }}>Aucun ouvrier emballage</div>
          )}
        </div>

        {/* Administration */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFF5F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 18 }}>🏢</span>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>Administration</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{adminPresents.length}/{adminWorkers.length} présents</div>
            </div>
          </div>
          {adminWorkers.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {adminWorkers.map(w => {
                const st = getPointageStatus(w.id);
                const sc = STATUS_CONFIG[st];
                return (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{w.full_name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: sc.bg, color: sc.color }}>{sc.label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20, color: '#CBD5E1', fontSize: 12 }}>Aucun personnel admin</div>
          )}
        </div>
      </div>

      {/* Chain Detail Modal */}
      <AnimatePresence>
        {selectedChainDetail && (() => {
          const chainWorkers = workers.filter(w => String(w.chaine_id || '') === selectedChainDetail);
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.95 }}
                style={{ 
                  background: '#fff', 
                  borderRadius: 16, 
                  width: '100%', 
                  maxWidth: 600, 
                  maxHeight: '85vh', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  boxShadow: '0 25px 60px rgba(0,0,0,0.25)', 
                  border: '1px solid #E2E8F0' 
                }}
              >
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Factory size={18} color="#4F46E5" />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                        {selectedChainDetail}
                      </h3>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                        {chainWorkers.length} ouvrier(s) affecté(s)
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedChainDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#E2E8F0'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <X size={20} />
                  </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                  {chainWorkers.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {chainWorkers.map(w => {
                        const roleK = (w.role && ROLES.includes(w.role as HRWorkerRole) ? w.role : 'OPERATOR') as HRWorkerRole;
                        const st = getPointageStatus(w.id);
                        const sc = STATUS_CONFIG[st] || STATUS_CONFIG.PRESENT;
                        return (
                          <div 
                            key={w.id} 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 12, 
                              padding: '12px 14px', 
                              background: '#F8FAFC', 
                              borderRadius: 10, 
                              border: '1px solid #E2E8F0',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
                              <div style={{ position: 'relative', flexShrink: 0 }}>
                                <div style={{ width: 40, height: 40, borderRadius: '50%', background: w.photo ? 'transparent' : ROLE_COLORS[roleK] + '20', border: `2px solid ${ROLE_COLORS[roleK]}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {w.photo ? <img src={w.photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <span style={{ fontSize: 14, fontWeight: 800, color: ROLE_COLORS[roleK] }}>{(w.full_name || '?')[0]}</span>}
                                </div>
                                <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: sc.color, border: '2px solid #fff' }} title={sc.label} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{w.full_name}</div>
                                <div style={{ fontSize: 11, color: '#64748B', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                                  <span>{w.matricule}</span>
                                  <span>•</span>
                                  <span style={{ fontWeight: 600, color: ROLE_COLORS[roleK] }}>{ROLE_LABELS[roleK]}</span>
                                  {w.poste && (
                                    <>
                                      <span>•</span>
                                      <span>{w.poste}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                                  Parda: <span style={{ color: '#1E293B' }}>{w.equipe || '—'}</span>
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: sc.bg, color: sc.color, marginTop: 4, display: 'inline-block' }}>
                                  {sc.label}
                                </div>
                              </div>
                              {w.phone ? (
                                <a 
                                  href={`tel:${w.phone}`} 
                                  title={`Appeler ${w.full_name}`}
                                  style={{ 
                                    width: 36, 
                                    height: 36, 
                                    borderRadius: '50%', 
                                    background: '#ECFDF5', 
                                    border: '1px solid #A7F3D0', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    color: '#059669', 
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#D1FAE5'}
                                  onMouseLeave={e => e.currentTarget.style.background = '#ECFDF5'}
                                >
                                  <Phone size={16} />
                                </a>
                              ) : (
                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F1F5F9', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }} title="Aucun téléphone">
                                  <Phone size={16} style={{ opacity: 0.5 }} />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
                      <Users size={40} style={{ opacity: 0.4, marginBottom: 8 }} />
                      <div style={{ fontWeight: 600 }}>Aucun ouvrier affecté à cette chaîne</div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', background: '#F8FAFC', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
                  <button onClick={() => setSelectedChainDetail(null)} style={btnSecondary}>
                    Fermer
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

// ─── INVITATIONS (Section 23) ─────────────────────────────
function InvitationsTab({
  workers,
  showToast,
}: {
  workers: HRWorker[];
  showToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [personId, setPersonId] = useState('');
  const [mat, setMat] = useState('');
  const [nom, setNom] = useState('');
  const [cin, setCin] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await API('/api/hr/invitations');
      if (r.ok) setList(await r.json());
      else setList([]);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const withPerson = workers.filter(w => w.person_id);

  const createInvite = async () => {
    if (!personId || !mat.trim() || !nom.trim()) {
      showToast('person_id, matricule et nom requis', 'err');
      return;
    }
    const r = await API('/api/hr/invitations', {
      method: 'POST',
      body: JSON.stringify({
        person_id: personId,
        proposed_matricule: mat.trim(),
        proposed_full_name: nom.trim(),
        proposed_cin: cin.trim() || undefined,
        invite_email: inviteEmail.trim() || undefined,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      showToast((d as { message?: string }).message || 'Erreur création', 'err');
      return;
    }
    const emailNote = (d as { emailSent?: boolean }).emailSent ? ' E-mail envoyé.' : '';
    showToast(`Invitation créée.${emailNote}`);
    if ((d as { emailError?: string }).emailError === 'smtp_not_configured' && inviteEmail.trim()) {
      showToast('SMTP non configuré (.env) — lien copiable ci-dessous.', 'err');
    }
    setMat('');
    setNom('');
    setCin('');
    setInviteEmail('');
    load();
  };

  const copyText = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      showToast('Copié dans le presse-papiers');
    } catch {
      showToast('Copie impossible', 'err');
    }
  };

  return (
    <div>
      {withPerson.length === 0 && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: '#FEF3C7', color: '#92400E', fontSize: 13 }}>
          Aucun <strong>person_id</strong> encore : ouvrez chaque fiche depuis l’annuaire (ou enregistrez un ouvrier) pour générer les liens, puis revenez ici.
        </div>
      )}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0', marginBottom: 20, maxWidth: 720 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Nouvelle invitation</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748B' }}>
          Choisir un salarié déjà lié à un <strong>person_id</strong>, puis proposer matricule / nom pour la nouvelle fiche (ex. nouvelle usine). Le destinataire répond via le lien ou la page <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>/hr-invite.html</code>.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Person ID (depuis annuaire)</label>
            <select value={personId} onChange={e => setPersonId(e.target.value)} style={inputStyle}>
              <option value="">— Choisir un ouvrier —</option>
              {withPerson.map(w => (
                <option key={w.id} value={w.person_id || ''}>
                  {w.full_name} · {w.matricule} · {w.person_id}
                </option>
              ))}
            </select>
          </div>
          <Field label="Matricule proposé" value={mat} onChange={setMat} placeholder="MAT-NEW-01" required />
          <Field label="Nom complet proposé" value={nom} onChange={setNom} placeholder="Prénom Nom" required />
          <Field label="CIN (optionnel)" value={cin} onChange={setCin} placeholder="Si connu" />
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="E-mail destinataire (optionnel, SMTP .env)" value={inviteEmail} onChange={setInviteEmail} placeholder="ouvrier@example.com" />
          </div>
        </div>
        <button type="button" onClick={createInvite} style={{ ...btnPrimary, marginTop: 16 }}>
          <Mail size={15} style={{ marginRight: 8 }} />Créer l’invitation
        </button>
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Historique</h3>
      {loading ? (
        <div style={{ color: '#94A3B8' }}>Chargement…</div>
      ) : list.length === 0 ? (
        <div style={{ color: '#94A3B8', fontSize: 14 }}>Aucune invitation</div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Date', 'Matricule', 'Nom', 'Statut', 'Jeton / Lien'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((inv: any) => {
                const origin = typeof window !== 'undefined' ? window.location.origin : '';
                const link = inv.token ? `${origin}/hr-invite.html?token=${encodeURIComponent(inv.token)}` : '';
                return (
                  <tr key={inv.id}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9' }}>{inv.created_at?.slice?.(0, 19) || inv.id}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9' }}>{inv.proposed_matricule}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9' }}>{inv.proposed_full_name}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9', fontWeight: 600 }}>{inv.status}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9' }}>
                      {inv.status === 'PENDING' && inv.token && (
                        <button type="button" onClick={() => copyText(link)} style={{ ...btnSecondary, fontSize: 12, padding: '6px 10px' }}>
                          <Copy size={14} style={{ marginRight: 6 }} />Copier le lien
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────
interface GestionRHProps {
  suivis?: SuiviData[];
  planningEvents?: PlanningEvent[];
  settings?: AppSettings;
  onBack?: () => void;
  /** Ouvre directement le profil d'un opérateur (par nom) — ex. depuis le Catalogue de Temps. */
  initialWorkerName?: string;
  initialWorkerNonce?: number;
  selectedDate?: string;
  setSelectedDate?: (date: string) => void;
  selectedChaineId?: string;
}

export default function GestionRH({ 
  suivis = [], planningEvents = [], settings, onBack, initialWorkerName, initialWorkerNonce,
  selectedDate: propSelectedDate,
  setSelectedDate: propSetSelectedDate,
  selectedChaineId
}: GestionRHProps) {
  const [tab, setTab] = useState<Tab>('annuaire');
  const [workers, setWorkers] = useState<HRWorker[]>([]);
  const [pointages, setPointages] = useState<any[]>([]);
  const [productions, setProductions] = useState<any[]>([]);
  const [avances, setAvances] = useState<any[]>([]);
  const [sageExports, setSageExports] = useState<any[]>([]);
  const [sagePreview, setSagePreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterChaine, setFilterChaine] = useState('');
  const [pointageSearch, setPointageSearch] = useState('');
  const [pointageChaine, setPointageChaine] = useState('');
  const [sageOpts, setSageOpts] = useState({ round: 15, workday: '06:00', apply: true });
  const [pointageTranches, setPointageTranches] = useState<PointageTranchesConfig>(() => getDefaultPointageTranches());
  
  const [localSelectedDate, localSetSelectedDate] = useState(today());
  const selectedDate = propSelectedDate !== undefined ? propSelectedDate : localSelectedDate;
  const setSelectedDate = propSetSelectedDate !== undefined ? propSetSelectedDate : localSetSelectedDate;

  // Sync selected chain filter on load or change
  useEffect(() => {
    if (selectedChaineId) {
      setFilterChaine(selectedChaineId);
      setPointageChaine(selectedChaineId);
    }
  }, [selectedChaineId]);
  const [selectedMois, setSelectedMois] = useState(monthStr());
  const [showTranches, setShowTranches] = useState(true);
  const [editWorker, setEditWorker] = useState<Partial<HRWorker> | null>(null);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [transportLignes, setTransportLignes] = useState<HRTransportLigne[]>([]);
  const [transportSubTab, setTransportSubTab] = useState<'recensement' | 'membres' | 'lignes'>('recensement');
  const [selectedLigne, setSelectedLigne] = useState<Partial<HRTransportLigne> | null>(null);
  const [showLigneModal, setShowLigneModal] = useState(false);
  const [filterTransportDate, setFilterTransportDate] = useState(today());
  const [filterTransportParda, setFilterTransportParda] = useState('');
  const [recensementWorkers, setRecensementWorkers] = useState<string[]>([]);
  const [recensementChaine, setRecensementChaine] = useState<string>('');
  const [recensementSearch, setRecensementSearch] = useState<string>('');
  const [generatingSage, setGeneratingSage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimPreview, setClaimPreview] = useState<{ myCount: number; guestCount: number; canClaim: boolean } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [profileWorkerId, setProfileWorkerId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [annuaireView, setAnnuaireView] = useState<'cards' | 'table'>(() => {
    if (typeof window === 'undefined') return 'cards';
    try {
      return localStorage.getItem(ANNUAIRE_VIEW_KEY) === 'table' ? 'table' : 'cards';
    } catch {
      return 'cards';
    }
  });

  const setAnnuaireViewPersist = useCallback((v: 'cards' | 'table') => {
    setAnnuaireView(v);
    try {
      localStorage.setItem(ANNUAIRE_VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Ouverture directe du profil d'un opérateur (depuis le Catalogue de Temps)
  const handledWorkerNonce = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!initialWorkerName) return;
    setTab('annuaire');
    setSearch(initialWorkerName);
    if (workers.length && handledWorkerNonce.current !== initialWorkerNonce) {
      const q = initialWorkerName.toLowerCase().trim();
      const match = workers.find(w => (w.full_name || '').toLowerCase().trim() === q)
        || workers.find(w => (w.full_name || '').toLowerCase().includes(q));
      if (match) setProfileWorkerId(match.id);
      handledWorkerNonce.current = initialWorkerNonce;
    }
  }, [initialWorkerName, initialWorkerNonce, workers]);

  useEffect(() => {
    (async () => {
      try {
        const r = await API('/api/settings');
        if (!r.ok) return;
        const d = (await r.json()) as Record<string, unknown>;
        setSageOpts({
          round: Math.min(60, Math.max(1, parseInt(String(d.hr_sage_rounding ?? settings?.hrSageRounding ?? 15), 10) || 15)),
          workday: (() => {
            const w = d.hr_sage_workday_start ?? settings?.hrSageWorkdayStart;
            return w != null && /^\d{1,2}:\d{2}/.test(String(w)) ? String(w).match(/^\d{1,2}:\d{2}/)![0] : '06:00';
          })(),
          apply:
            d.hr_sage_apply == null
              ? settings?.hrSageApply !== false
              : d.hr_sage_apply !== 'false' && d.hr_sage_apply !== false,
        });
        setPointageTranches(parsePointageTranchesFromSettings(d.hr_pointage_tranches, settings));
      } catch { /* keep defaults */ }
    })();
  }, [settings]);

  useEffect(() => {
    if (tab !== 'pointage') return;
    void (async () => {
      try {
        const r = await API('/api/settings');
        if (!r.ok) return;
        const d = (await r.json()) as Record<string, unknown>;
        setPointageTranches(parsePointageTranchesFromSettings(d.hr_pointage_tranches, settings));
        setSageOpts({
          round: Math.min(60, Math.max(1, parseInt(String(d.hr_sage_rounding ?? 15), 10) || 15)),
          workday: (() => {
            const w = d.hr_sage_workday_start;
            return w != null && /^\d{1,2}:\d{2}/.test(String(w)) ? String(w).match(/^\d{1,2}:\d{2}/)![0] : '06:00';
          })(),
          apply: d.hr_sage_apply !== 'false' && d.hr_sage_apply !== false,
        });
      } catch { /* ignore */ }
    })();
  }, [tab, settings]);

  // ── Fetches ──
  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await API('/api/hr/workers');
      if (r.status === 401) {
        setLoadError('Session expirée ou non connecté — reconnectez-vous (Profil / Login).');
        setWorkers([]);
      } else if (!r.ok) {
        setLoadError(`Impossible de charger les effectifs (erreur ${r.status}).`);
        setWorkers([]);
      } else {
        setWorkers(await r.json());
        setLoadError(null);
      }
    } catch {
      setLoadError('Réseau indisponible. Vérifiez la connexion au serveur.');
      setWorkers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTransportLignes = useCallback(async () => {
    try {
      const r = await API('/api/hr/transport-lignes');
      if (r.ok) {
        setTransportLignes(await r.json());
      }
    } catch (e) {
      console.error('[fetchTransportLignes] Error:', e);
    }
  }, []);

  const fetchPointage = useCallback(async () => {
    const r = await API(`/api/hr/pointage?date=${selectedDate}`);
    if (!r.ok) return;
    setPointages(await r.json());
    try {
      const rs = await API('/api/settings');
      if (!rs.ok) return;
      const d = (await rs.json()) as Record<string, unknown>;
      setPointageTranches(parsePointageTranchesFromSettings(d.hr_pointage_tranches));
    } catch {
      /* ignore */
    }
  }, [selectedDate]);

  const fetchProduction = useCallback(async () => {
    const r = await API(`/api/hr/production?date=${selectedDate}`);
    if (r.ok) setProductions(await r.json());
  }, [selectedDate]);

  const fetchAvances = useCallback(async () => {
    const r = await API('/api/hr/avances');
    if (r.ok) setAvances(await r.json());
  }, []);

  const fetchSage = useCallback(async () => {
    const [exportsRes, previewRes] = await Promise.all([
      API('/api/hr/sage-exports'),
      API(`/api/hr/sage-preview/${selectedMois}`),
    ]);
    if (exportsRes.ok) setSageExports(await exportsRes.json());
    if (previewRes.ok) setSagePreview(await previewRes.json());
  }, [selectedMois]);

  const fetchClaimPreview = useCallback(async () => {
    const r = await API('/api/hr/claim-legacy-preview');
    if (r.ok) setClaimPreview(await r.json());
    else setClaimPreview(null);
  }, []);

  const handleClaimFromGuest = async () => {
    if (!claimPreview?.canClaim) return;
    if (!confirm(`Rattacher ${claimPreview.guestCount} fiche(s) du compte invité local à votre compte actuel ?\n(Impossible d’annuler. Utilisez un compte qui n’a encore aucun ouvrier.)`)) return;
    setClaiming(true);
    try {
      const r = await API('/api/hr/claim-legacy', { method: 'POST' });
      const data = r.ok ? await r.json() : null;
      if (r.ok && data?.migrated != null) {
        showToast(`${data.migrated} fiche(s) rattachée(s)`);
        await fetchWorkers();
        await fetchClaimPreview();
      } else {
        const err = await r.json().catch(() => ({}));
        showToast((err as { message?: string })?.message || 'Rattachement impossible', 'err');
      }
    } finally {
      setClaiming(false);
    }
  };

  const handleDeleteLigne = async (id: string, name: string) => {
    if (!confirm(`حذف خط النقل "${name}"؟\n(سيتم إلغاء تعيين جميع العمال المرتبطين بهذا الخط تلقائياً)`)) return;
    try {
      const r = await API(`/api/hr/transport-lignes/${id}`, { method: 'DELETE' });
      if (r.ok) {
        showToast('تم حذف خط النقل بنجاح');
        fetchTransportLignes();
        fetchWorkers();
      } else {
        showToast('حدث خطأ أثناء الحذف', 'err');
      }
    } catch (e) {
      console.error(e);
      showToast('خطأ في الاتصال بالخادم', 'err');
    }
  };

  const handleSaveLigne = async () => {
    if (!selectedLigne?.nom) {
      alert('Nom de la ligne requis');
      return;
    }
    try {
      const payload = {
        id: selectedLigne.id || uid(),
        nom: selectedLigne.nom,
        code_ligne: selectedLigne.code_ligne || '',
        quartier: selectedLigne.quartier || '',
        chauffeur_nom: selectedLigne.chauffeur_nom || '',
        chauffeur_tel: selectedLigne.chauffeur_tel || '',
        matricule_vehicule: selectedLigne.matricule_vehicule || '',
        capacite: Number(selectedLigne.capacite) || 0,
        notes: selectedLigne.notes || '',
      };
      const r = await API('/api/hr/transport-lignes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        showToast('Ligne de transport enregistrée');
        setShowLigneModal(false);
        fetchTransportLignes();
      } else {
        showToast('Erreur lors de l\'enregistrement', 'err');
      }
    } catch (e) {
      console.error(e);
      showToast('Erreur de connexion au serveur', 'err');
    }
  };

  const toggleWorkerRecensement = (workerId: string) => {
    setRecensementWorkers(prev =>
      prev.includes(workerId) ? prev.filter(id => id !== workerId) : [...prev, workerId]
    );
  };

  const handleCopyRecensementWhatsApp = () => {
    const selected = workers.filter(w => recensementWorkers.includes(w.id));
    
    // Group by parda
    const byParda: Record<string, typeof selected> = {};
    for (const w of selected) {
      const p = w.equipe || 'Sans Équipe';
      if (!byParda[p]) byParda[p] = [];
      byParda[p].push(w);
    }

    let pardaText = '';
    for (const [p, list] of Object.entries(byParda)) {
      const lines = [...new Set(list.map(w => w.transport_ligne_quartier || w.transport_ligne_nom || 'Sans Transport'))].join(', ');
      pardaText += `- *${p}:* ${list.length} personnes (${lines})\n`;
    }

    // Group by transport line
    const byLine: Record<string, { line: HRTransportLigne; workers: typeof selected }> = {};
    for (const w of selected) {
      const lineId = w.transport_ligne_id || 'sans-transport';
      if (!byLine[lineId]) {
        const l = transportLignes.find(x => x.id === lineId) || { id: 'sans-transport', nom: 'Sans Transport', capacite: 0 } as any;
        byLine[lineId] = { line: l, workers: [] };
      }
      byLine[lineId].workers.push(w);
    }

    let lineText = '';
    for (const [lineId, item] of Object.entries(byLine)) {
      const l = item.line;
      const chauffeurInfo = l.chauffeur_nom ? ` (Chauffeur: ${l.chauffeur_nom} - ${l.chauffeur_tel ?? ''})` : '';
      const quartierInfo = l.quartier ? ` [Quartier: ${l.quartier}]` : '';
      lineText += `\n*${l.code_ligne || ''} ${l.nom}${quartierInfo}${chauffeurInfo}* (${item.workers.length} pers):\n`;
      item.workers.forEach((w, idx) => {
        lineText += `  ${idx + 1}. ${w.full_name} (${w.equipe || '—'})\n`;
      });
    }

    const text = `*RECENSEMENT TRANSPORT - HEURES SUPPLEMENTAIRES*\nDate: ${filterTransportDate}\n\n*Résumé par Équipe (Parda):*\n${pardaText || 'Aucun.'}\n*Total passagers:* ${selected.length} personnes\n\n*Détail par Ligne de Transport:*${lineText || '\nAucun passager.'}`;

    navigator.clipboard.writeText(text);
    showToast('Récapitulatif copié pour WhatsApp !');
  };

  // Liste RH toujours chargée à l’ouverture (compteur header + onglets)
  useEffect(() => { fetchWorkers(); }, [fetchWorkers]);
  useEffect(() => { fetchTransportLignes(); }, [fetchTransportLignes]);
  useEffect(() => { if (tab === 'transport') { fetchTransportLignes(); fetchPointage(); } }, [tab, fetchTransportLignes, fetchPointage]);
  useEffect(() => {
    if (tab === 'transport') {
      const fetchPointageForTransport = async () => {
        try {
          const r = await API(`/api/hr/pointage?date=${filterTransportDate}`);
          if (r.ok) {
            setPointages(await r.json());
          }
        } catch (e) {
          console.error(e);
        }
      };
      fetchPointageForTransport();
    }
  }, [tab, filterTransportDate]);
  useEffect(() => {
    if (loading || loadError) return;
    fetchClaimPreview();
  }, [loading, loadError, fetchClaimPreview]);
  useEffect(() => { if (tab === 'pointage') fetchPointage(); }, [tab, fetchPointage]);
  // Tout le tableau (jour + tous les enregistrements) : MAJ auto à l’heure pile (:00) puis toutes les heures
  useEffect(() => {
    if (tab !== 'pointage') return;
    let hourly: number | null = null;
    const tick = () => { void fetchPointage(); };
    const first = window.setTimeout(() => {
      tick();
      hourly = window.setInterval(tick, 60 * 60 * 1000);
    }, msUntilNextClockHour());
    return () => {
      window.clearTimeout(first);
      if (hourly) window.clearInterval(hourly);
    };
  }, [tab, fetchPointage, selectedDate]);
  useEffect(() => { if (tab === 'statistiques') { fetchPointage(); } }, [tab, fetchPointage]);
  useEffect(() => { if (tab === 'production') fetchProduction(); }, [tab, fetchProduction]);
  useEffect(() => { if (tab === 'avances') fetchAvances(); }, [tab, fetchAvances]);
  useEffect(() => { if (tab === 'sage') fetchSage(); }, [tab, fetchSage]);

  // ── Save pointage row (même `id` jour pour upsert; erreurs API remontées) ──
  const savePointageRow = async (workerId: string, field: string, value: string, currentRow?: any) => {
    const base = sanitizePointageRowForSave(currentRow) as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      id: (base.id as string) || currentRow?.id || uid(),
      worker_id: workerId,
      date: selectedDate,
      ...base,
      statut: (base.statut as string) || 'PRESENT',
      [field]: value,
    };
    if (field === 'heure_entree' || field === 'heure_sortie') {
      payload.grille_presence = null;
    }
    const r = await API('/api/hr/pointage', { method: 'POST', body: JSON.stringify(payload) });
    if (r.ok) {
      await fetchPointage();
    } else {
      const d = (await r.json().catch(() => ({}))) as { message?: string };
      showToast(d.message || `Enregistrement pointage impossible (${r.status})`, 'err');
    }
  };

  /** Clic sur un créneau : enregistre la grille + recalcule entrée / sortie / pause sur le serveur. */
  const savePointageGrille = useCallback(
    async (workerId: string, currentRow: any | undefined, slotIndex: number) => {
      const st = ((currentRow?.statut as HRPointageStatus) || 'PRESENT') as HRPointageStatus;
      if (st === 'ABSENT' || ABSENCE_LIKE.includes(st)) {
        showToast('Passez le statut à « Présent » ou « Retard » pour modifier la grille horaire.', 'err');
        return;
      }
      const slots = pointageTranches.slots;
      const n = slots.length;
      const stored = parseGrillePresence(currentRow?.grille_presence as string | null | undefined, n);
      const derived = deriveGrilleFromTimes(
        slots,
        currentRow?.heure_entree,
        currentRow?.heure_sortie,
        currentRow?.pause_debut,
        currentRow?.pause_fin,
      );
      const baseGrid = stored ?? derived;
      const next = toggleGrilleSlot(baseGrid, slotIndex);
      const ts = grilleToEntreeSortiePause(slots, next);
      const base = sanitizePointageRowForSave(currentRow) as Record<string, unknown>;
      const payload: Record<string, unknown> = {
        id: (base.id as string) || uid(),
        worker_id: workerId,
        date: selectedDate,
        ...base,
        statut: (base.statut as string) || 'PRESENT',
        grille_presence: serializeGrillePresence(next),
        heure_entree: ts.heure_entree,
        heure_sortie: ts.heure_sortie,
        pause_debut: ts.pause_debut,
        pause_fin: ts.pause_fin,
      };
      const r = await API('/api/hr/pointage', { method: 'POST', body: JSON.stringify(payload) });
      if (r.ok) {
        await fetchPointage();
      } else {
        const d = (await r.json().catch(() => ({}))) as { message?: string };
        showToast(d.message || `Enregistrement grille impossible (${r.status})`, 'err');
      }
    },
    [fetchPointage, selectedDate, pointageTranches],
  );

  // ── Generate Sage CSV ──
  const handleGenerateSage = async () => {
    setGeneratingSage(true);
    const r = await fetch(`/api/hr/sage-export/${selectedMois}`, { credentials: 'include' });
    if (r.ok) {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `SAGE_PAIE_BERAMETHODE_${selectedMois}.csv`; a.click();
      URL.revokeObjectURL(url);
      showToast('Export Sage CSV généré avec succès');
      fetchSage();
    } else {
      showToast('Erreur génération Sage', 'err');
    }
    setGeneratingSage(false);
  };

  // ── Export Excel RH mensuel ──
  const handleExportExcelRH = async () => {
    try {
      const [previewRes, avancesRes, workersRes] = await Promise.all([
        API(`/api/hr/sage-preview/${selectedMois}`),
        API('/api/hr/avances'),
        API('/api/hr/workers'),
      ]);
      if (!previewRes.ok) { showToast('Erreur récupération données', 'err'); return; }
      const preview = await previewRes.json();
      const avancesData = avancesRes.ok ? await avancesRes.json() : [];
      const workersData = workersRes.ok ? await workersRes.json() : [];
      const wb = XLSX.utils.book_new();
      const workerMap: Record<string, any> = {};
      workersData.forEach((w: any) => { workerMap[w.matricule] = w; });
      const mainRows = (preview.rows || []).map((row: any) => {
        const w = workerMap[row.matricule] || {};
        return {
          'Matricule': row.matricule, 'Nom Complet': row.nom, 'CIN': row.cin || '',
          'Type Contrat': w.type_contrat || '', 'Poste': w.poste || '', 'Chaîne': w.chaine_id || '',
          'Jours Présents': row.nb_jours, 'Taux Horaire (MAD)': w.taux_horaire || 0,
          'Salaire Base (MAD)': w.salaire_base || 0, 'Prime Assiduité (MAD)': w.prime_assiduite || 0,
          'Prime Transport (MAD)': w.prime_transport || 0, 'Total Brut (MAD)': row.total_brut,
          'Net à Payer (MAD)': row.net_a_payer,
        };
      });
      if (mainRows.length > 0) {
        const totals: any = { 'Matricule': 'TOTAL', 'Nom Complet': '', 'CIN': '', 'Type Contrat': '', 'Poste': '', 'Chaîne': '' };
        ['Jours Présents','Taux Horaire (MAD)','Salaire Base (MAD)','Prime Assiduité (MAD)','Prime Transport (MAD)','Total Brut (MAD)','Net à Payer (MAD)'].forEach(k => {
          totals[k] = mainRows.reduce((s: number, r: any) => s + (Number(r[k]) || 0), 0);
        });
        mainRows.push(totals);
      }
      const ws1 = XLSX.utils.json_to_sheet(mainRows);
      ws1['!cols'] = [8,20,12,12,12,8,8,10,12,12,12,14,14].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws1, 'Rapport Mensuel');
      const avanceMois = avancesData.filter((a: any) => ['APPROUVE','EN_COURS'].includes(a.statut));
      const avanceRows = avanceMois.map((a: any) => ({
        'Ouvrier': a.full_name, 'Date Demande': a.date_demande, 'Montant Demandé (MAD)': a.montant,
        'Montant Approuvé (MAD)': a.montant_approuve || 0, 'Solde Restant (MAD)': a.solde_restant || 0,
        'Statut': a.statut, 'Nbre Échéances': a.nb_echeances || '', 'Mois Début': a.mois_debut_deduction || '',
      }));
      const ws2 = XLSX.utils.json_to_sheet(avanceRows.length ? avanceRows : [{ 'Info': 'Aucune avance active' }]);
      ws2['!cols'] = [20,12,16,16,14,10,10,10].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws2, 'Avances');
      const totalBrut = (preview.rows || []).reduce((s: number, r: any) => s + (r.total_brut || 0), 0);
      const totalNet = (preview.rows || []).reduce((s: number, r: any) => s + (r.net_a_payer || 0), 0);
      const summaryRows = [
        { 'Indicateur': 'Période', 'Valeur': selectedMois },
        { 'Indicateur': 'Nb Salariés', 'Valeur': (preview.rows || []).length },
        { 'Indicateur': 'Masse Salariale Brute (MAD)', 'Valeur': Math.round(totalBrut * 100) / 100 },
        { 'Indicateur': 'Masse Salariale Nette (MAD)', 'Valeur': Math.round(totalNet * 100) / 100 },
        { 'Indicateur': 'Export généré le', 'Valeur': new Date().toLocaleDateString('fr-FR') },
        { 'Indicateur': 'Conforme', 'Valeur': 'Art. 385 Code du Travail Marocain' },
      ];
      const ws3 = XLSX.utils.json_to_sheet(summaryRows);
      ws3['!cols'] = [{ wch: 28 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Résumé');
      XLSX.writeFile(wb, `RH_MENSUEL_BERAMETHODE_${selectedMois}.xlsx`);
      showToast('Export Excel RH généré avec succès');
    } catch { showToast('Erreur export Excel', 'err'); }
  };

  // ── Avance statut ──
  const handleAvanceStatut = async (id: string, statut: string) => {
    const r = await API(`/api/hr/avances/${id}/statut`, { method: 'PUT', body: JSON.stringify({ statut }) });
    if (r.ok) { showToast('Statut mis à jour'); fetchAvances(); }
    else showToast('Erreur', 'err');
  };

  // ── Delete worker ──
  const handleDeleteWorker = async (id: string, name: string) => {
    if (!confirm(`Supprimer ${name} ?`)) return;
    const r = await API(`/api/hr/workers/${id}`, { method: 'DELETE' });
    if (r.ok) { showToast('Ouvrier supprimé'); fetchWorkers(); }
    else showToast('Erreur suppression', 'err');
  };

  const TABS = [
    { id: 'annuaire',      label: 'Annuaire',       icon: <Users size={15} /> },
    { id: 'pointage',      label: 'Pointage',       icon: <Clock size={15} /> },
    { id: 'statistiques',  label: 'Statistiques',   icon: <PieChart size={15} /> },
    { id: 'production',    label: 'Production',     icon: <BarChart2 size={15} /> },
    { id: 'avances',       label: 'Avances',        icon: <DollarSign size={15} /> },
    { id: 'transport',     label: 'Transport',      icon: <Truck size={15} /> },
    { id: 'sage',          label: 'Sage Paie',      icon: <FileText size={15} /> },
    { id: 'invitations',   label: 'Invitations',    icon: <Mail size={15} /> },
  ] as const;

  const filteredWorkers = workers.filter(w => {
    const q = search.toLowerCase();
    const matchSearch = !search || w.full_name.toLowerCase().includes(q) || (w.matricule || '').toLowerCase().includes(q) || (w.cin || '').toLowerCase().includes(q);
    const matchRole = !filterRole || w.role === filterRole;
    const matchChaine = !filterChaine || String(w.chaine_id || '') === filterChaine;
    return matchSearch && matchRole && matchChaine;
  });

  const pointageChaineOptions = useMemo(() => {
    const s = new Set<string>();
    for (const w of workers) {
      if (w.chaine_id) s.add(String(w.chaine_id));
    }
    return [...s].sort();
  }, [workers]);

  const pointageTableWorkers = useMemo(() => {
    const q = pointageSearch.trim().toLowerCase();
    // Garde-fou : si l’API renvoie le même id deux fois, une seule ligne.
    const byId = new Map<string, HRWorker>();
    for (const w of workers) {
      if (!byId.has(w.id)) byId.set(w.id, w);
    }
    return [...byId.values()].filter(w => {
      const matchQ = !q
        || w.full_name.toLowerCase().includes(q)
        || (w.matricule || '').toLowerCase().includes(q)
        || (w.cin || '').toLowerCase().includes(q);
      const matchCh = !pointageChaine || String(w.chaine_id || '') === pointageChaine;
      return matchQ && matchCh;
    });
  }, [workers, pointageSearch, pointageChaine]);

  const pointageFiltreActif = Boolean(pointageSearch.trim() || pointageChaine);

  /** Compteurs cohérents avec la liste affichée (défaut de ligne = Présent comme le select). */
  const pointageFilterStats = useMemo(() => {
    let presents = 0, abs = 0, rets = 0;
    for (const w of pointageTableWorkers) {
      const p = pointages.find((x: { worker_id: string }) => x.worker_id === w.id) as { statut?: string } | undefined;
      const st = (p?.statut as string) || 'PRESENT';
      if (st === 'PRESENT' || st === 'RETARD') presents += 1;
      if (st === 'ABSENT') abs += 1;
      if (st === 'RETARD') rets += 1;
    }
    return { presents, absents: abs, retards: rets };
  }, [pointageTableWorkers, pointages]);

  const pointageHeuresFiltre = useMemo(() => {
    const ids = new Set(pointageTableWorkers.map(w => w.id));
    return pointages
      .filter((p: { worker_id: string }) => ids.has(p.worker_id))
      .reduce(
        (a, p: { heures_normales?: number; heures_supp_25?: number; heures_supp_50?: number }) => ({
          n: a.n + (Number(p.heures_normales) || 0),
          s25: a.s25 + (Number(p.heures_supp_25) || 0),
          s50: a.s50 + (Number(p.heures_supp_50) || 0),
        }),
        { n: 0, s25: 0, s50: 0 }
      );
  }, [pointageTableWorkers, pointages]);

  const getPtg = (workerId: string) => pointages.find((p: any) => p.worker_id === workerId);

  const pointageTrancheColCount = useMemo(
    () => tranchesHeaderColCount(pointageTranches),
    [pointageTranches],
  );

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#F8F9FA', overflow: 'hidden' }}>

      <AnimatePresence>
        {profileWorkerId && (
          <HRWorkerProfilePanel
            key={profileWorkerId}
            workerId={profileWorkerId}
            settings={settings}
            onClose={() => setProfileWorkerId(null)}
            onEdit={(w) => {
              setEditWorker(w);
              setShowWorkerModal(true);
              setProfileWorkerId(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '12px 20px', borderRadius: 10,
              background: toast.type === 'ok' ? '#10B981' : '#EF4444', color: '#fff', fontWeight: 600, fontSize: 14,
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {toast.type === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Worker Modal */}
      <AnimatePresence>
        {showWorkerModal && (
          <WorkerModal
            worker={editWorker}
            onClose={() => { setShowWorkerModal(false); setEditWorker(null); }}
            onSave={() => { fetchWorkers(); showToast('Ouvrier sauvegardé'); }}
            transportLignes={transportLignes}
          />
        )}
      </AnimatePresence>

      {/* ── HEADER ── */}
      <div className="gestion-rh-head-compact" style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '16px 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Retour au tableau de bord"
                title="Retour au tableau de bord"
                style={{
                  minHeight: 44,
                  padding: '0 14px 0 10px',
                  borderRadius: 12,
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                <ChevronLeft size={22} strokeWidth={2.5} aria-hidden />
                <span>Accueil</span>
              </button>
            )}
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #2149C1, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={22} color="#fff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0F172A' }}>Gestion RH</h1>
              <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>
                {loading
                  ? 'Chargement des effectifs…'
                  : loadError
                    ? '—'
                    : `${workers.length} ouvrier${workers.length !== 1 ? 's' : ''} enregistré${workers.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          {tab === 'annuaire' && (
            <button onClick={() => { setEditWorker(null); setShowWorkerModal(true); }} style={btnPrimary}>
              <UserPlus size={15} style={{ marginRight: 8 }} />Ajouter Ouvrier
            </button>
          )}
        </div>

        {/* Tabs — défilement horizontal sur mobile */}
        <div className="gestion-rh-tabs-scroll">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as Tab)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                background: tab === t.id ? '#2149C1' : 'transparent',
                color: tab === t.id ? '#fff' : '#64748B' }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── BODY ── (Pointage : colonne flex + scroll uniquement dans le tableau → évite le « vide » sur mobile) */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: tab === 'pointage' ? 'hidden' : 'auto',
          overflowX: 'hidden',
          padding: tab === 'pointage' ? '8px 10px' : 20,
          display: tab === 'pointage' ? 'flex' : undefined,
          flexDirection: tab === 'pointage' ? 'column' : undefined,
        }}
      >
        {loadError && (
          <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13, fontWeight: 600 }}>
            {loadError}
          </div>
        )}
        {!loading && !loadError && claimPreview?.canClaim && (
          <div style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 12, background: 'linear-gradient(90deg, #FFFBEB 0%, #FEF3C7 100%)', border: '1px solid #FCD34D', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.4 }}>
              <strong>{claimPreview.guestCount} ouvrier{claimPreview.guestCount !== 1 ? 's' : ''}</strong> enregistré{claimPreview.guestCount !== 1 ? 's' : ''} sur l’ancien compte invité (fiches locales).
              Votre compte n’en a pas encore : vous pouvez tout rattacher pour que le comptage soit <strong>réel</strong> ici.
            </div>
            <button
              type="button"
              onClick={handleClaimFromGuest}
              disabled={claiming}
              style={{ ...btnPrimary, whiteSpace: 'nowrap', opacity: claiming ? 0.7 : 1 }}
            >
              {claiming ? 'Rattachement…' : `Rattacher les ${claimPreview.guestCount} fiche(s) à mon compte`}
            </button>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={tab === 'pointage' ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '100%' } : undefined}
          >

            {/* ═══ ANNUAIRE ═══ */}
            {tab === 'annuaire' && (
              <div>
                {/* Filtres */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chercher par nom, matricule, CIN..."
                      style={{ ...inputStyle, paddingLeft: 32, width: '100%' }} />
                  </div>
                  <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ ...inputStyle, width: 160 }}>
                    <option value="">Tous les rôles</option>
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <select value={filterChaine} onChange={e => setFilterChaine(e.target.value)} style={{ ...inputStyle, width: 160 }}>
                    <option value="">Toutes les chaînes</option>
                    {pointageChaineOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>Affichage</span>
                    <button
                      type="button"
                      onClick={() => setAnnuaireViewPersist('cards')}
                      title="Vue cartes"
                      style={{
                        ...btnSecondary,
                        padding: '7px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: annuaireView === 'cards' ? '#EEF2FF' : '#fff',
                        borderColor: annuaireView === 'cards' ? '#C7D2FE' : '#E2E8F0',
                        color: annuaireView === 'cards' ? '#2149C1' : '#64748B',
                      }}
                    >
                      <LayoutGrid size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                      Cartes
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnnuaireViewPersist('table')}
                      title="Vue liste / tableau"
                      style={{
                        ...btnSecondary,
                        padding: '7px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: annuaireView === 'table' ? '#EEF2FF' : '#fff',
                        borderColor: annuaireView === 'table' ? '#C7D2FE' : '#E2E8F0',
                        color: annuaireView === 'table' ? '#2149C1' : '#64748B',
                      }}
                    >
                      <Table2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                      Liste
                    </button>
                  </div>
                </div>

                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>Chargement...</div>
                ) : annuaireView === 'table' ? (
                  <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 880 }}>
                        <thead>
                          <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                            {['Nom', 'Matricule', 'CIN', 'Rôle', 'Chaîne', 'Parda', 'Quartier', 'Poste', 'Contrat', 'Tél.', 'Actions'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredWorkers.map(w => {
                            const roleK = (w.role && ROLES.includes(w.role as HRWorkerRole) ? w.role : 'OPERATOR') as HRWorkerRole;
                            return (
                              <tr key={w.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0F172A', maxWidth: 200 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: w.photo ? 'transparent' : ROLE_COLORS[roleK] + '25', border: `1px solid ${ROLE_COLORS[roleK]}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, color: ROLE_COLORS[roleK] }}>
                                      {w.photo ? <img src={w.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (w.full_name || '?')[0]}
                                    </div>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.full_name}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '10px 12px', color: '#475569', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{w.matricule}</td>
                                <td style={{ padding: '10px 12px', color: '#475569', fontSize: 12 }}>{w.cin || '—'}</td>
                                <td style={{ padding: '10px 12px' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: ROLE_COLORS[roleK] + '18', color: ROLE_COLORS[roleK] }}>{ROLE_LABELS[roleK]}</span>
                                </td>
                                <td style={{ padding: '10px 12px', color: '#475569' }}>{w.chaine_id || '—'}</td>
                                <td style={{ padding: '10px 12px', color: '#475569' }}>{w.equipe || '—'}</td>
                                <td style={{ padding: '10px 12px', color: '#475569' }}>{w.transport_ligne_quartier || w.transport_ligne_nom || '—'}</td>
                                <td style={{ padding: '10px 12px', color: '#475569', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.poste || '—'}</td>
                                <td style={{ padding: '10px 12px', color: '#475569' }}>{w.type_contrat || '—'}</td>
                                <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                                  {w.phone ? (
                                    <a href={`tel:${w.phone}`} style={{ color: '#2149C1', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      <Phone size={12} />
                                      {w.phone}
                                    </a>
                                  ) : '—'}
                                </td>
                                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                  <button type="button" onClick={() => setProfileWorkerId(w.id)} style={{ ...btnPrimary, display: 'inline-flex', padding: '5px 10px', fontSize: 11, marginRight: 6 }}><IdCard size={11} style={{ marginRight: 4 }} />Fiche</button>
                                  <button type="button" onClick={() => { setEditWorker(w); setShowWorkerModal(true); }} style={{ ...btnSecondary, display: 'inline-flex', padding: '5px 10px', fontSize: 11, marginRight: 6 }}><Edit3 size={11} style={{ marginRight: 4 }} />Édit.</button>
                                  <button type="button" onClick={() => handleDeleteWorker(w.id, w.full_name)} style={{ ...btnDanger, display: 'inline-flex', padding: '5px 8px', fontSize: 11 }}><Trash2 size={11} /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {filteredWorkers.length === 0 && !loadError && (
                      <div style={{ textAlign: 'center', padding: 48, color: '#94A3B8' }}>
                        <Users size={40} style={{ marginBottom: 10, opacity: 0.3 }} />
                        <div style={{ fontWeight: 600 }}>
                          {workers.length > 0 ? 'Aucun ouvrier ne correspond aux filtres' : 'Aucun ouvrier enregistré pour ce compte'}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 4, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                          {workers.length > 0
                            ? 'Modifiez la recherche ou le filtre « Tous les rôles ».'
                            : "Les fiches sont liées à l'utilisateur connecté. Connectez-vous avec le compte qui a créé les données, ou cliquez sur « Ajouter Ouvrier »."}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                    {filteredWorkers.map(w => {
                      const roleK = (w.role && ROLES.includes(w.role as HRWorkerRole) ? w.role : 'OPERATOR') as HRWorkerRole;
                      return (
                      <div key={w.id} style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #F1F5F9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                          <div style={{ width: 48, height: 48, borderRadius: '50%', background: w.photo ? 'transparent' : ROLE_COLORS[roleK] + '20', border: `2px solid ${ROLE_COLORS[roleK]}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {w.photo
                              ? <img src={w.photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                              : <span style={{ fontSize: 18, fontWeight: 800, color: ROLE_COLORS[roleK] }}>{(w.full_name || '?')[0]}</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.full_name}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>{w.matricule} • {w.cin || '—'}</div>
                          </div>
                          <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: ROLE_COLORS[roleK] + '20', color: ROLE_COLORS[roleK], flexShrink: 0 }}>
                            {ROLE_LABELS[roleK]}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, marginBottom: 12 }}>
                          {[
                            { label: 'Chaîne', val: w.chaine_id || '—' },
                            { label: 'Parda / Équipe', val: w.equipe || '—' },
                            { label: 'Poste', val: w.poste || '—' },
                            { label: 'Contrat', val: w.type_contrat || '—' },
                            { label: 'Quartier (Hay)', val: w.transport_ligne_quartier || w.transport_ligne_nom || '—' },
                            {
                              label: 'Tel',
                              val: w.phone ? (
                                <a href={`tel:${w.phone}`} style={{ color: '#2149C1', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Phone size={11} /> {w.phone}
                                </a>
                              ) : '—',
                              fullWidth: true
                            },
                          ].map(i => (
                            <div key={i.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '6px 8px', gridColumn: i.fullWidth ? '1 / -1' : undefined }}>
                              <div style={{ color: '#94A3B8', fontSize: 10 }}>{i.label}</div>
                              <div style={{ fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => setProfileWorkerId(w.id)}
                            style={{ ...btnPrimary, flex: 1, justifyContent: 'center', fontSize: 12, padding: '7px 10px' }}>
                            <IdCard size={12} style={{ marginRight: 4 }} />Fiche
                          </button>
                          <button onClick={() => { setEditWorker(w); setShowWorkerModal(true); }}
                            style={{ ...btnSecondary, flex: 1, justifyContent: 'center', fontSize: 12, padding: '7px 10px' }}>
                            <Edit3 size={12} style={{ marginRight: 4 }} />Modifier
                          </button>
                          <button onClick={() => handleDeleteWorker(w.id, w.full_name)}
                            style={{ ...btnDanger, padding: '7px 10px', fontSize: 12 }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                    })}
                    {filteredWorkers.length === 0 && !loadError && (
                      <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: '#94A3B8' }}>
                        <Users size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
                        <div style={{ fontWeight: 600 }}>
                          {workers.length > 0 ? 'Aucun ouvrier ne correspond aux filtres' : 'Aucun ouvrier enregistré pour ce compte'}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 4, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                          {workers.length > 0
                            ? 'Modifiez la recherche ou le filtre « Tous les rôles ».'
                            : "Les fiches sont liées à l'utilisateur connecté. Connectez-vous avec le compte qui a créé les données, ou cliquez sur « Ajouter Ouvrier »."}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ═══ POINTAGE (Premium Redesign) ═══ */}
            {tab === 'pointage' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                {/* 1. KPI — largeur 100 % (plus de min 508px → plus de bande vide sur téléphone) */}
                <div style={{ overflowX: 'auto', overflowY: 'hidden', width: '100%', maxWidth: '100%', WebkitOverflowScrolling: 'touch', flexShrink: 0, marginBottom: 2 }}>
                  <div className="pointage-kpi-grid">
                    <div title="Journée de pointage" style={{ background: '#fff', padding: '4px 8px', borderRadius: '8px', border: '1px solid #f1f5f9', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '6px', minHeight: 32 }}>
                      <Calendar size={14} color="#4f46e5" style={{ flexShrink: 0 }} />
                      <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                        style={{ border: 'none', padding: 0, fontSize: '12px', fontWeight: 800, color: '#1e293b', width: '100%', minWidth: 0, cursor: 'pointer', outline: 'none' }} />
                      <button type="button" onClick={fetchPointage} style={{ ...btnSecondary, padding: '4px', borderRadius: '6px', flexShrink: 0 }} title="Actualiser">
                        <RefreshCw size={13} />
                      </button>
                    </div>

                    <div
                      className="kpi-card"
                      title={`Présents : ${pointageFilterStats.presents} sur ${pointageTableWorkers.length} ouvriers`}
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '4px 8px', borderRadius: '8px', boxShadow: '0 2px 8px -2px rgba(16,185,129,0.35)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', minHeight: 32 }}
                    >
                      <CheckCircle size={15} style={{ flexShrink: 0, opacity: 0.95 }} />
                      <span style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.04em', opacity: 0.92 }}>PRÉS.</span>
                      <span style={{ fontSize: '17px', fontWeight: 900, lineHeight: 1 }}>{pointageFilterStats.presents}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 900, lineHeight: 1 }}>{pointageTableWorkers.length > 0 ? Math.round((pointageFilterStats.presents / pointageTableWorkers.length) * 100) : 0}%</span>
                    </div>

                    <div
                      className="kpi-card"
                      title={`Absents : ${pointageFilterStats.absents} sur ${pointageTableWorkers.length} ouvriers`}
                      style={{ background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)', padding: '4px 8px', borderRadius: '8px', boxShadow: '0 2px 8px -2px rgba(244,63,94,0.35)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', minHeight: 32 }}
                    >
                      <X size={15} style={{ flexShrink: 0, opacity: 0.95 }} />
                      <span style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.04em', opacity: 0.92 }}>ABS.</span>
                      <span style={{ fontSize: '17px', fontWeight: 900, lineHeight: 1 }}>{pointageFilterStats.absents}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 900, lineHeight: 1 }}>{pointageTableWorkers.length > 0 ? Math.round((pointageFilterStats.absents / pointageTableWorkers.length) * 100) : 0}%</span>
                    </div>

                    <div
                      className="kpi-card"
                      title={`Retards : ${pointageFilterStats.retards} parmi ${pointageFilterStats.presents} présents`}
                      style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '4px 8px', borderRadius: '8px', boxShadow: '0 2px 8px -2px rgba(245,158,11,0.35)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', minHeight: 32 }}
                    >
                      <AlertTriangle size={15} style={{ flexShrink: 0, opacity: 0.95 }} />
                      <span style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.04em', opacity: 0.92 }}>RET.</span>
                      <span style={{ fontSize: '17px', fontWeight: 900, lineHeight: 1 }}>{pointageFilterStats.retards}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 900, lineHeight: 1 }}>{pointageFilterStats.presents > 0 ? Math.round((pointageFilterStats.retards / pointageFilterStats.presents) * 100) : 0}%</span>
                    </div>
                  </div>
                </div>

                {/* 2. Unified Toolbar */}
                <div style={{ background: '#fff', padding: '6px 8px', borderRadius: '8px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', rowGap: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexShrink: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                  <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 0 }}>
                    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      value={pointageSearch}
                      onChange={e => setPointageSearch(e.target.value)}
                      placeholder="Nom, matricule…"
                      style={{ ...inputStyle, paddingLeft: '30px', borderRadius: '6px', border: '1px solid #f1f5f9', background: '#f8fafc', width: '100%', height: '30px', fontSize: '11px' }}
                    />
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, maxWidth: '100%' }}>
                    <LayoutGrid size={13} color="#64748b" style={{ flexShrink: 0 }} />
                    <select
                      value={pointageChaine}
                      onChange={e => setPointageChaine(e.target.value)}
                      style={{ ...inputStyle, width: 'min(148px, 42vw)', maxWidth: '100%', height: '30px', borderRadius: '6px', background: '#f8fafc', fontSize: '11px' }}
                    >
                      <option value="">Toutes les chaînes</option>
                      {pointageChaineOptions.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ height: '14px', width: '1px', background: '#e2e8f0', margin: '0 2px', flexShrink: 0 }} />

                  <div
                    role="group"
                    aria-label="Mode colonnes pointage"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'stretch',
                      height: 30,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                      padding: 2,
                      gap: 2,
                      flexShrink: 0,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 2px rgba(15,23,42,0.04)',
                    }}
                  >
                    <button
                      type="button"
                      aria-pressed={showTranches}
                      onClick={() => setShowTranches(true)}
                      title="Afficher les colonnes par tranches (créneaux)"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                        borderRadius: 6,
                        padding: '0 11px',
                        whiteSpace: 'nowrap',
                        transition: 'background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
                        ...(showTranches
                          ? {
                              background: 'linear-gradient(180deg, #faf5ff 0%, #ede9fe 100%)',
                              color: '#5b21b6',
                              boxShadow: '0 1px 2px rgba(91,33,182,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
                            }
                          : {
                              background: 'transparent',
                              color: '#94a3b8',
                            }),
                      }}
                    >
                      <Clock size={13} style={{ flexShrink: 0, opacity: showTranches ? 1 : 0.75 }} />
                      Tranches
                    </button>
                    <button
                      type="button"
                      aria-pressed={!showTranches}
                      onClick={() => setShowTranches(false)}
                      title="Vue simplifiée : Entrée / Sortie uniquement (masquer les tranches)"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                        borderRadius: 6,
                        padding: '0 11px',
                        whiteSpace: 'nowrap',
                        transition: 'background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
                        ...(!showTranches
                          ? {
                              background: '#fff',
                              color: '#334155',
                              boxShadow: '0 1px 2px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,1)',
                            }
                          : {
                              background: 'transparent',
                              color: '#94a3b8',
                            }),
                      }}
                    >
                      <Table2 size={13} style={{ flexShrink: 0, opacity: !showTranches ? 1 : 0.75 }} />
                      Grille
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: 'auto' }} title="Entrée/Sortie même jour · tranches SAGE">
                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>:00</span>
                  </div>
                </div>

                <div
                  lang="fr-FR"
                  title="Entrée/Sortie le même jour. Tranches synchronisées avec le moteur SAGE."
                  style={{
                    background: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #f1f5f9',
                    overflow: 'hidden',
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    className="pointage-table-scroll"
                    style={{
                      overflow: 'auto',
                      flex: 1,
                      minHeight: 0,
                      position: 'relative',
                      WebkitOverflowScrolling: 'touch',
                      overscrollBehavior: 'contain',
                      touchAction: 'pan-x pan-y',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 'max-content' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 40, background: '#fff' }}>
                        <tr style={{ background: '#f8fafc' }}>
                          {/* Sans 2e ligne d’en-tête (tranches masquées), rowSpan doit être 1 sinon le tableau HTML est invalide / affichage cassé */}
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 6px', textAlign: 'left', fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', position: 'sticky', left: 0, zIndex: 50, background: '#f8fafc', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)', minWidth: '168px' }}>Ouvrier</th>
                          {showTranches && (
                            <th colSpan={pointageTrancheColCount} style={{ padding: '3px 4px', textAlign: 'center', fontSize: '8px', fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', background: '#f5f3ff' }}>Tranches</th>
                          )}
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 6px', textAlign: 'left', fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '92px' }}>Entrée</th>
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 6px', textAlign: 'left', fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '92px' }}>Sortie</th>
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 4px', textAlign: 'center', fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '62px' }}>H.N.</th>
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 4px', textAlign: 'center', fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '62px' }}>25%</th>
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 4px', textAlign: 'center', fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '62px' }}>50%</th>
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 6px', textAlign: 'right', fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '108px' }}>Statut</th>
                        </tr>
                        {showTranches && (
                          <tr style={{ background: '#f8fafc' }}>
                            {pointageTranches.slots.map((slot, gi) => (
                              <Fragment key={`slot-h-${gi}`}>
                                {pointageTranches.sepAfterIndex >= 0 && gi === pointageTranches.sepAfterIndex + 1 && (
                                  <th style={{ padding: '1px', textAlign: 'center', fontSize: '7px', fontWeight: 900, color: '#94a3b8', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: '22px', zIndex: 40 }}>—</th>
                                )}
                                <th style={{ padding: '1px 2px', textAlign: 'center', fontSize: '7px', fontWeight: 900, color: '#64748b', borderBottom: '1px solid #e2e8f0', minWidth: '40px', position: 'sticky', top: '22px', zIndex: 40, background: '#f8fafc' }}>{slot.label}</th>
                              </Fragment>
                            ))}
                          </tr>
                        )}
                      </thead>
                      <tbody>
                        <AnimatePresence mode="popLayout">
                          {pointageTableWorkers.map((w, idx) => {
                            const ptg = getPtg(w.id);
                            const stP = (ptg?.statut as HRPointageStatus) || 'PRESENT';
                            const conf = STATUS_CONFIG[stP as HRPointageStatus] || STATUS_CONFIG.PRESENT;
                            const gridDisabled = stP === 'ABSENT' || ABSENCE_LIKE.includes(stP);
                            const slotN = pointageTranches.slots.length;
                            const grilleStored = parseGrillePresence(ptg?.grille_presence as string | null | undefined, slotN);
                            const displayGrille = grilleStored ?? deriveGrilleFromTimes(
                              pointageTranches.slots,
                              ptg?.heure_entree,
                              ptg?.heure_sortie,
                              ptg?.pause_debut,
                              ptg?.pause_fin,
                            );
                            const hint = getPointageEntreeSortieHint(ptg?.heure_entree, ptg?.heure_sortie, ptg?.statut);

                            return (
                              <motion.tr
                                key={w.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.4) }}
                                className="ptg-row"
                                style={{ borderBottom: '1px solid #f1f5f9', background: '#fff' }}
                              >
                                <td style={{ padding: '4px 6px', position: 'sticky', left: 0, zIndex: 10, background: 'inherit', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.05)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div 
                                      onClick={() => setProfileWorkerId(w.id)}
                                      style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
                                    >
                                      {w.photo ? (
                                        <img src={w.photo} alt="" style={{ width: '28px', height: '28px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #fff', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }} />
                                      ) : (
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, border: '1px solid #fff', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                                          {w.full_name.charAt(0)}
                                        </div>
                                      )}
                                      <div style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '7px', height: '7px', borderRadius: '50%', background: conf.color, border: '1px solid #fff' }} />
                                    </div>
                                    <div style={{ overflow: 'hidden', minWidth: 0 }}>
                                      <div 
                                        onClick={() => setProfileWorkerId(w.id)}
                                        style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}
                                      >
                                        {w.full_name}
                                      </div>
                                      <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600, lineHeight: 1.2 }}>
                                        {w.matricule} · <span style={{ color: '#64748b' }}>{w.chaine_id || 'BUREAU'}</span>{w.equipe ? ` · ${w.equipe}` : ''}{w.phone ? (
                                          <>
                                            {' · '}
                                            <a href={`tel:${w.phone}`} style={{ color: '#2149C1', fontWeight: 700, textDecoration: 'none' }}>
                                              {w.phone}
                                            </a>
                                          </>
                                        ) : ''}
                                      </div>
                                      {hint.level === 'warn' && (
                                        <div style={{ fontSize: '8px', color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', marginTop: '1px', maxWidth: '120px' }} title={hint.label}>
                                          <AlertCircle size={9} style={{ flexShrink: 0 }} />
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint.label}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {showTranches && (
                                  <>
                                    {pointageTranches.slots.map((slot, gi) => (
                                      <Fragment key={`slot-b-${w.id}-${gi}`}>
                                        {pointageTranches.sepAfterIndex >= 0 && gi === pointageTranches.sepAfterIndex + 1 && (
                                          <td style={{ padding: '4px', textAlign: 'center', background: '#f8fafc' }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#cbd5e1', margin: 'auto' }} />
                                          </td>
                                        )}
                                        <td style={{ padding: '2px', textAlign: 'center' }}>
                                          <button
                                            className="tranche-btn"
                                            onClick={() => savePointageGrille(w.id, ptg, gi)}
                                            disabled={gridDisabled}
                                            title={gridDisabled ? 'Statut absence — grille non éditable' : `Créneau ${slot.label} — cliquer pour inverser`}
                                            style={{
                                              width: '24px',
                                              height: '22px',
                                              borderRadius: '5px',
                                              border: displayGrille[gi] ? 'none' : '1px solid #e2e8f0',
                                              background: displayGrille[gi] ? 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)' : '#fafafa',
                                              cursor: gridDisabled ? 'not-allowed' : 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              padding: 0,
                                              opacity: gridDisabled ? 0.25 : 1,
                                              boxShadow: displayGrille[gi] ? '0 1px 4px rgba(79, 70, 229, 0.3)' : 'none',
                                            }}
                                          >
                                            {displayGrille[gi] ? <Check size={11} strokeWidth={3} color="#fff" /> : <span style={{ color: '#d1d5db', fontSize: '8px' }}>—</span>}
                                          </button>
                                        </td>
                                      </Fragment>
                                    ))}
                                  </>
                                )}

                                <td style={{ padding: '3px 4px' }}>
                                  <input
                                    type="time"
                                    defaultValue={normalizeTimeForInput(ptg?.heure_entree as string)}
                                    onBlur={e => savePointageRow(w.id, 'heure_entree', e.target.value, ptg)}
                                    disabled={gridDisabled}
                                    style={{ ...inputStyle, padding: '3px 6px', borderRadius: '6px', background: gridDisabled ? '#f8fafc' : '#fff', opacity: gridDisabled ? 0.45 : 1, border: gridDisabled ? '1px solid #f1f5f9' : '1px solid #e2e8f0', width: '86px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '11px', color: '#1e293b' }}
                                  />
                                </td>
                                <td style={{ padding: '3px 4px' }}>
                                  <input
                                    type="time"
                                    defaultValue={normalizeTimeForInput(ptg?.heure_sortie as string)}
                                    onBlur={e => savePointageRow(w.id, 'heure_sortie', e.target.value, ptg)}
                                    disabled={gridDisabled}
                                    style={{ ...inputStyle, padding: '3px 6px', borderRadius: '6px', background: gridDisabled ? '#f8fafc' : '#fff', opacity: gridDisabled ? 0.45 : 1, border: gridDisabled ? '1px solid #f1f5f9' : '1px solid #e2e8f0', width: '86px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '11px', color: '#1e293b' }}
                                  />
                                </td>

                                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 800, color: ptg?.heures_normales ? '#1e293b' : '#cbd5e1' }}>
                                    {formatDureeCellulePointage(ptg?.heures_normales)}
                                  </span>
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563eb', opacity: ptg?.heures_supp_25 ? 1 : 0.25 }}>
                                    {formatDureeCellulePointage(ptg?.heures_supp_25)}
                                  </span>
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#7c3aed', opacity: ptg?.heures_supp_50 ? 1 : 0.25 }}>
                                    {formatDureeCellulePointage(ptg?.heures_supp_50)}
                                  </span>
                                </td>

                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                  <select
                                    value={ptg?.statut || 'PRESENT'}
                                    onChange={e => savePointageRow(w.id, 'statut', e.target.value, ptg)}
                                    style={{
                                      padding: '3px 6px',
                                      borderRadius: '6px',
                                      fontSize: '10px',
                                      fontWeight: 800,
                                      border: 'none',
                                      background: conf.bg,
                                      color: conf.color,
                                      cursor: 'pointer',
                                      outline: 'none',
                                      width: '102px',
                                      appearance: 'none',
                                      textAlignLast: 'center'
                                    }}
                                  >
                                    <optgroup label="Présence">
                                      <option value="PRESENT">Présent</option>
                                      <option value="RETARD">Retard</option>
                                    </optgroup>
                                    <optgroup label="Absence / Autre">
                                      {['ABSENT', 'CONGE', 'MALADIE', 'MISSION', 'FERIE'].map(k => (
                                        <option key={k} value={k}>{STATUS_CONFIG[k as HRPointageStatus]?.label || k}</option>
                                      ))}
                                    </optgroup>
                                  </select>
                                </td>
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>

                  {/* Footer Totals Banner */}
                  <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>H. Normales</span>
                        <span style={{ fontSize: '16px', fontWeight: 900, color: '#1e293b' }}>{formatDureeHeuresFR(pointageHeuresFiltre.n)}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>H.S. 25%</span>
                        <span style={{ fontSize: '16px', fontWeight: 900, color: '#2563eb' }}>{formatDureeHeuresFR(pointageHeuresFiltre.s25)}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>H.S. 50%</span>
                        <span style={{ fontSize: '16px', fontWeight: 900, color: '#7c3aed' }}>{formatDureeHeuresFR(pointageHeuresFiltre.s50)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>{pointageTableWorkers.length} ouvriers affichés</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>Basé sur les filtres actifs</div>
                    </div>
                  </div>

                  {pointageTableWorkers.length === 0 && workers.length > 0 && (
                    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Search size={24} color="#94a3b8" />
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Aucun résultat</div>
                      <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Ajustez la recherche ou le filtre chaîne pour afficher des ouvriers</div>
                    </div>
                  )}
                  {workers.length === 0 && (
                    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Users size={24} color="#94a3b8" />
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Aucun ouvrier enregistré</div>
                      <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Ajoutez des ouvriers dans l'onglet Annuaire pour commencer le pointage</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ STATISTIQUES ═══ */}
            {tab === 'statistiques' && (
              <StatistiquesTab
                workers={workers}
                pointages={pointages}
                suivis={suivis}
                planningEvents={planningEvents}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                onRefresh={() => { fetchWorkers(); fetchPointage(); }}
              />
            )}

            {/* ═══ PRODUCTION ═══ */}
            {tab === 'production' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ ...inputStyle, width: 160 }} />
                  <button onClick={fetchProduction} style={btnSecondary}><RefreshCw size={14} style={{ marginRight: 6 }} />Actualiser</button>
                  {productions.length > 0 && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, fontSize: 13 }}>
                      <span>Total pièces: <strong style={{ color: '#10B981' }}>{productions.reduce((a:number, p:any) => a + (p.pieces_produites || 0), 0)}</strong></span>
                      <span style={{ color: '#EF4444' }}>Défauts: <strong>{productions.reduce((a:number, p:any) => a + (p.pieces_defaut || 0), 0)}</strong></span>
                    </div>
                  )}
                </div>
                <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          {['Ouvrier', 'Chaîne', 'Pièces ✓', 'Défauts', 'Retouches', 'Taux Qualité', 'Rendement'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#64748B', fontSize: 12, borderBottom: '2px solid #E2E8F0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {workers.map(w => {
                          const prod = productions.find((p:any) => p.worker_id === w.id);
                          return (
                            <tr key={w.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 600, color: '#0F172A' }}>{w.full_name}</div>
                                <div style={{ fontSize: 11, color: '#94A3B8' }}>{w.matricule}</div>
                              </td>
                              <td style={{ padding: '10px 14px', color: '#64748B' }}>{w.chaine_id || '—'}</td>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: '#10B981', textAlign: 'center' }}>{prod?.pieces_produites ?? '—'}</td>
                              <td style={{ padding: '10px 14px', fontWeight: 600, color: '#EF4444', textAlign: 'center' }}>{prod?.pieces_defaut ?? '—'}</td>
                              <td style={{ padding: '10px 14px', color: '#F59E0B', textAlign: 'center' }}>{prod?.pieces_retouchees ?? '—'}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                {prod?.taux_qualite != null ? (
                                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                                    background: prod.taux_qualite >= 95 ? '#D1FAE5' : prod.taux_qualite >= 85 ? '#FEF3C7' : '#FEE2E2',
                                    color: prod.taux_qualite >= 95 ? '#065F46' : prod.taux_qualite >= 85 ? '#92400E' : '#991B1B' }}>
                                    {prod.taux_qualite.toFixed(1)}%
                                  </span>
                                ) : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6366F1', fontWeight: 600 }}>
                                {prod?.rendement != null ? `${prod.rendement.toFixed(0)}%` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {workers.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Aucun ouvrier enregistré</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ AVANCES ═══ */}
            {tab === 'avances' && (
              <div>
                <div style={{ background: '#FEF3C7', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#92400E', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AlertTriangle size={16} />
                  <span><strong>Article 385 — Code du Travail Marocain :</strong> La déduction mensuelle ne peut excéder 1/10ème du salaire net. Plafond appliqué automatiquement.</span>
                </div>
                <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          {['Ouvrier', 'Date', 'Montant', 'Solde Restant', 'Statut', 'Actions'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#64748B', fontSize: 12, borderBottom: '2px solid #E2E8F0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {avances.map((a: any) => {
                          const sc = AVANCE_STATUS[a.statut] || { label: a.statut, color: '#374151', bg: '#F3F4F6' };
                          return (
                            <tr key={a.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 600 }}>{a.full_name}</div>
                                <div style={{ fontSize: 11, color: '#94A3B8' }}>Salaire: {a.salaire_base?.toLocaleString()} MAD</div>
                              </td>
                              <td style={{ padding: '10px 14px', color: '#64748B' }}>{a.date_demande}</td>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                                {a.montant?.toLocaleString()} MAD
                                {a.salaire_base > 0 && (
                                  <div style={{ fontSize: 10, color: a.montant > a.salaire_base * 0.1 ? '#EF4444' : '#10B981' }}>
                                    {((a.montant / a.salaire_base) * 100).toFixed(0)}% salaire
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '10px 14px', fontWeight: 600, color: '#6366F1' }}>
                                {a.solde_restant != null ? `${a.solde_restant?.toLocaleString()} MAD` : '—'}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{sc.label}</span>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                {a.statut === 'DEMANDE' && (
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => handleAvanceStatut(a.id, 'APPROUVE')}
                                      style={{ padding: '4px 10px', border: 'none', borderRadius: 6, background: '#D1FAE5', color: '#065F46', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✓ Approuver</button>
                                    <button onClick={() => handleAvanceStatut(a.id, 'REFUSE')}
                                      style={{ padding: '4px 10px', border: 'none', borderRadius: 6, background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✗ Refuser</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {avances.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>
                        <DollarSign size={40} style={{ marginBottom: 10, opacity: 0.3 }} />
                        <div>Aucune avance enregistrée</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ TRANSPORT ═══ */}
            {tab === 'transport' && (
              <div>
                {/* Header sub-tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => setTransportSubTab('recensement')}
                    style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      color: transportSubTab === 'recensement' ? '#2149C1' : '#64748B',
                      borderBottom: transportSubTab === 'recensement' ? '3px solid #2149C1' : '3px solid transparent' }}>
                    Recensement Heures Supp
                  </button>
                  <button onClick={() => setTransportSubTab('membres')}
                    style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      color: transportSubTab === 'membres' ? '#2149C1' : '#64748B',
                      borderBottom: transportSubTab === 'membres' ? '3px solid #2149C1' : '3px solid transparent' }}>
                    Membres par Ligne
                  </button>
                  <button onClick={() => setTransportSubTab('lignes')}
                    style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      color: transportSubTab === 'lignes' ? '#2149C1' : '#64748B',
                      borderBottom: transportSubTab === 'lignes' ? '3px solid #2149C1' : '3px solid transparent' }}>
                    Gestion des Lignes
                  </button>
                </div>

                {/* VIEW 1: RECENSEMENT HEURES SUPP */}
                {transportSubTab === 'recensement' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }} className="recensement-grid-compact">
                    {/* Left Panel: Selection by Chaine & Quick Add */}
                    <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Sélection des Passagers HS</h3>
                      
                      {/* Date Filter */}
                      <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>Date de recensement</label>
                        <input type="date" value={filterTransportDate} onChange={e => setFilterTransportDate(e.target.value)} style={inputStyle} />
                      </div>

                      {/* Quick Add Search */}
                      <div style={{ marginBottom: 20, position: 'relative' }}>
                        <label style={labelStyle}>Recherche & Ajout Rapide</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="text" placeholder="Rechercher par nom..." value={recensementSearch} onChange={e => setRecensementSearch(e.target.value)} style={inputStyle} />
                          {recensementSearch && (
                            <button onClick={() => setRecensementSearch('')} style={{ padding: 8, background: '#F1F5F9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                              <X size={16} />
                            </button>
                          )}
                        </div>
                        {/* Suggestions Dropdown */}
                        {recensementSearch.trim() && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 100, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                            {workers.filter(w => w.is_active && !recensementWorkers.includes(w.id) && w.full_name.toLowerCase().includes(recensementSearch.toLowerCase())).slice(0, 6).map(w => (
                              <div key={w.id} onClick={() => { setRecensementWorkers(prev => [...prev, w.id]); setRecensementSearch(''); }}
                                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', fontSize: 13, display: 'flex', justifyContent: 'space-between', transition: 'background 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <span style={{ fontWeight: 600 }}>{w.full_name}</span>
                                <span style={{ fontSize: 11, color: '#64748B' }}>{w.equipe || 'Sans Équipe'} • {w.chaine_id || '—'}</span>
                              </div>
                            ))}
                            {workers.filter(w => w.is_active && !recensementWorkers.includes(w.id) && w.full_name.toLowerCase().includes(recensementSearch.toLowerCase())).length === 0 && (
                              <div style={{ padding: '12px 14px', fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>Aucun ouvrier actif correspondant</div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Select by Chaine */}
                      <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 16 }}>
                        <label style={labelStyle}>Sélection par Chaîne de Production</label>
                        <select value={recensementChaine} onChange={e => setRecensementChaine(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }}>
                          <option value="">-- Sélectionner une chaîne --</option>
                          {pointageChaineOptions.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                        </select>

                        {recensementChaine && (
                          <div>
                            {/* Mass actions */}
                            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                              <button type="button" style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11 }}
                                onClick={() => {
                                  const chainIds = workers.filter(w => w.is_active && String(w.chaine_id || '') === recensementChaine).map(w => w.id);
                                  setRecensementWorkers(prev => [...new Set([...prev, ...chainIds])]);
                                }}>
                                Tout cocher
                              </button>
                              <button type="button" style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11, color: '#EF4444', borderColor: '#FCA5A5' }}
                                onClick={() => {
                                  const chainIds = workers.filter(w => w.is_active && String(w.chaine_id || '') === recensementChaine).map(w => w.id);
                                  setRecensementWorkers(prev => prev.filter(id => !chainIds.includes(id)));
                                }}>
                                Tout décocher
                              </button>
                            </div>

                            {/* Workers checkboxes list */}
                            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 10px' }}>
                              {workers.filter(w => w.is_active && String(w.chaine_id || '') === recensementChaine).map(w => {
                                const isChecked = recensementWorkers.includes(w.id);
                                return (
                                  <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
                                    <input type="checkbox" checked={isChecked} onChange={() => toggleWorkerRecensement(w.id)} style={{ width: 16, height: 16 }} />
                                    <div>
                                      <span style={{ fontWeight: isChecked ? 700 : 500, color: isChecked ? '#2149C1' : '#1E293B' }}>{w.full_name}</span>
                                      <div style={{ fontSize: 11, color: '#64748B' }}>{w.matricule} • {w.poste || '—'} {w.equipe ? `(${w.equipe})` : ''}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Panel: Fiche Récapitulative */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      {/* Summary Table Card */}
                      <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Fiche Récapitulative</h3>
                          <button onClick={handleCopyRecensementWhatsApp} disabled={recensementWorkers.length === 0} style={btnPrimary}>
                            <Copy size={14} style={{ marginRight: 6 }} /> Copier WhatsApp
                          </button>
                        </div>

                        {/* Breakdown by Shift (Parda) */}
                        <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Équipe (Parda)</th>
                                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>Nombre</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Lignes / Quartiers</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(
                                workers.filter(w => recensementWorkers.includes(w.id)).reduce((acc, w) => {
                                  const eq = w.equipe || 'Sans Équipe';
                                  if (!acc[eq]) acc[eq] = { count: 0, lines: new Set<string>() };
                                  acc[eq].count += 1;
                                  acc[eq].lines.add(w.transport_ligne_quartier || w.transport_ligne_nom || 'Sans Transport');
                                  return acc;
                                }, {} as Record<string, { count: number; lines: Set<string> }>)
                              ).map(([parda, info]) => (
                                <tr key={parda} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0F172A' }}>{parda}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#6366F1' }}>{info.count}</td>
                                  <td style={{ padding: '8px 12px', color: '#64748B', fontSize: 11 }}>{[...info.lines].join(', ')}</td>
                                </tr>
                              ))}
                              <tr style={{ background: '#F8FAFC', fontWeight: 700, borderTop: '2px solid #E2E8F0' }}>
                                <td style={{ padding: '10px 12px' }}>Total passagers</td>
                                <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 14, color: '#2149C1' }}>{recensementWorkers.length}</td>
                                <td style={{ padding: '10px 12px', color: '#94A3B8', fontSize: 11 }}>Toutes équipes confondues</td>
                              </tr>
                            </tbody>
                          </table>
                          {recensementWorkers.length === 0 && (
                            <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 12 }}>Aucun passager sélectionné</div>
                          )}
                        </div>

                        {/* List of checked passengers with quick remove */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Liste des passagers ({recensementWorkers.length}) :</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                            {workers.filter(w => recensementWorkers.includes(w.id)).map(w => (
                              <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, border: '1px solid #F1F5F9', background: '#F8FAFC', fontSize: 12 }}>
                                <div>
                                  <span style={{ fontWeight: 600, color: '#1E293B' }}>{w.full_name}</span>
                                  <span style={{ color: '#64748B', marginLeft: 8 }}>({w.equipe || '—'} • {w.transport_ligne_quartier || w.transport_ligne_nom || 'Sans Transport'})</span>
                                </div>
                                <button onClick={() => setRecensementWorkers(prev => prev.filter(id => id !== w.id))}
                                  style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}>
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* VIEW 2: MEMBRES PAR LIGNE */}
                {transportSubTab === 'membres' && (
                  <div>
                    {/* Filters */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Date :</span>
                        <input type="date" value={filterTransportDate} onChange={e => setFilterTransportDate(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, outline: 'none' }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Équipe (Parda) :</span>
                        <input type="text" placeholder="ex: Équipe A" value={filterTransportParda} onChange={e => setFilterTransportParda(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, outline: 'none' }} />
                      </div>
                      <button onClick={() => { fetchTransportLignes(); fetchPointage(); }} style={{ ...btnSecondary, padding: '8px 12px' }}>
                        <RefreshCw size={14} style={{ marginRight: 6 }} />Actualiser
                      </button>
                    </div>

                    {/* Cards grouped by route */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
                      {transportLignes.map(l => {
                        const assignedWorkers = workers.filter(w => w.transport_ligne_id === l.id && w.is_active);
                        const pardaFiltered = filterTransportParda
                          ? assignedWorkers.filter(w => (w.equipe || '').toLowerCase().includes(filterTransportParda.toLowerCase()))
                          : assignedWorkers;
                        
                        const presentWorkers = pardaFiltered.filter(w => {
                          const pt = pointages.find(p => p.worker_id === w.id);
                          const status = pt?.statut || 'PRESENT';
                          return status === 'PRESENT' || status === 'RETARD';
                        });

                        const handleCopyWhatsApp = () => {
                          const dateStr = filterTransportDate;
                          const workerListText = presentWorkers.map((w, idx) => {
                            const tel = w.phone ? ` - ${w.phone}` : '';
                            const eq = w.equipe ? ` (${w.equipe})` : '';
                            return `${idx + 1}. ${w.full_name}${eq}${tel}`;
                          }).join('\n');

                          const driverText = l.chauffeur_nom ? `Chauffeur: ${l.chauffeur_nom} (${l.chauffeur_tel ?? '—'})` : 'Chauffeur: Non défini';
                          const vehiculeText = l.matricule_vehicule ? `Plate/Véhicule: ${l.matricule_vehicule}` : '';
                          const codeText = l.code_ligne ? `[${l.code_ligne}] ` : '';
                          const text = `*Ligne Transport: ${codeText}${l.nom}*\n${driverText}\n${vehiculeText}\nDate: ${dateStr}\n\n*Passagers Présents (${presentWorkers.length}):*\n${workerListText || 'Aucun passager présent.'}`;

                          navigator.clipboard.writeText(text);
                          showToast('Liste copiée pour WhatsApp !');
                        };

                        return (
                          <div key={l.id} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0', padding: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', paddingBottom: 12, marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                              <div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Navigation size={18} color="#2149C1" /> {l.code_ligne ? `[${l.code_ligne}] ` : ''}{l.nom}
                                  {l.quartier && <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: 6 }}>Quartier: {l.quartier}</span>}
                                </h3>
                                <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap', fontSize: 12, color: '#64748B' }}>
                                  {l.chauffeur_nom && (
                                    <span>
                                      Chauffeur: <strong>{l.chauffeur_nom}</strong>
                                      {l.chauffeur_tel && (
                                        <a href={`tel:${l.chauffeur_tel}`} style={{ marginLeft: 6, color: '#2149C1', fontWeight: 600 }}>
                                          📞 {l.chauffeur_tel}
                                        </a>
                                      )}
                                    </span>
                                  )}
                                  {l.matricule_vehicule && <span>Véhicule: <strong>{l.matricule_vehicule}</strong></span>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ background: '#EEF2FF', color: '#2149C1', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12 }}>
                                  Présents: {presentWorkers.length} / {assignedWorkers.length} (Capacité: {l.capacite || '—'})
                                </span>
                                <button onClick={handleCopyWhatsApp} style={{ ...btnSecondary, fontSize: 11, padding: '4px 10px' }}>
                                  <Copy size={12} style={{ marginRight: 4 }} /> Copier WhatsApp
                                </button>
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10 }}>Liste des passagers présents aujourd'hui :</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                                {presentWorkers.map(w => (
                                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>{w.full_name}</div>
                                      <div style={{ fontSize: 11, color: '#64748B' }}>
                                        {w.matricule} • {w.poste || '—'} {w.equipe ? `(${w.equipe})` : ''}
                                      </div>
                                    </div>
                                    {w.phone && (
                                      <a href={`tel:${w.phone}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#E0F2FE', color: '#0369A1' }}>
                                        <Phone size={14} />
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {presentWorkers.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: 12 }}>
                                  Aucun passager présent sur cette ligne aujourd'hui.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {transportLignes.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 14, border: '1px dashed #CBD5E1', color: '#64748B' }}>
                          Aucune ligne de transport enregistrée. Rendez-vous sur l'onglet "Gestion des Lignes" pour en ajouter une.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* VIEW 3: GESTION DES LIGNES */}
                {transportSubTab === 'lignes' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                      <button onClick={() => { setSelectedLigne({ nom: '', code_ligne: '', quartier: '', chauffeur_nom: '', chauffeur_tel: '', matricule_vehicule: '', capacite: 15, notes: '' }); setShowLigneModal(true); }} style={btnPrimary}>
                        <Plus size={15} style={{ marginRight: 6 }} /> Ajouter Ligne
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                      {transportLignes.map(l => (
                        <div key={l.id} style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1E293B' }}>
                                {l.code_ligne ? `[${l.code_ligne}] ` : ''}{l.nom}
                              </h4>
                              <span style={{ fontSize: 11, background: '#F0FDF4', color: '#166534', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                                Capacité: {l.capacite || 0}
                              </span>
                            </div>
                            <div style={{ marginTop: 12, fontSize: 13, color: '#475569', display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {l.quartier && <div>📍 Quartier (Hay): <strong>{l.quartier}</strong></div>}
                              <div>👤 Chauffeur: <strong>{l.chauffeur_nom || '—'}</strong></div>
                              {l.chauffeur_tel && (
                                <div>📞 Téléphone: <a href={`tel:${l.chauffeur_tel}`} style={{ color: '#2149C1', fontWeight: 600 }}>{l.chauffeur_tel}</a></div>
                              )}
                              <div>🚗 Véhicule: <strong>{l.matricule_vehicule || '—'}</strong></div>
                              {l.notes && <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginTop: 4 }}>📝 {l.notes}</div>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #F1F5F9', paddingTop: 12, marginTop: 12, justifyContent: 'flex-end' }}>
                            <button onClick={() => { setSelectedLigne(l); setShowLigneModal(true); }}
                              style={{ ...btnSecondary, fontSize: 11, padding: '4px 8px' }}>
                              <Edit3 size={12} style={{ marginRight: 4 }} /> Modifier
                            </button>
                            <button onClick={() => handleDeleteLigne(l.id, l.nom)}
                              style={{ padding: '4px 8px', border: '1px solid #FEE2E2', borderRadius: 6, background: '#FFF5F5', color: '#991B1B', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                              <Trash2 size={12} style={{ marginRight: 4 }} /> Supprimer
                            </button>
                          </div>
                        </div>
                      ))}
                      {transportLignes.length === 0 && (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#94A3B8' }}>
                          Aucune ligne de transport enregistrée.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Ligne Modal */}
                {showLigneModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 25px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                          {selectedLigne?.id ? 'Modifier la ligne de transport' : 'Ajouter une ligne de transport'}
                        </h3>
                        <button onClick={() => setShowLigneModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={18} /></button>
                      </div>
                      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                          <div>
                            <label style={labelStyle}>Code Ligne *</label>
                            <input type="text" value={selectedLigne?.code_ligne ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, code_ligne: e.target.value }) : null)}
                              placeholder="ex: L1" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Nom de la ligne *</label>
                            <input type="text" value={selectedLigne?.nom ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, nom: e.target.value }) : null)}
                              placeholder="ex: Ligne 1" style={inputStyle} />
                          </div>
                        </div>
                        <div>
                          <label style={labelStyle}>Quartier / Destination (Hay)</label>
                          <input type="text" value={selectedLigne?.quartier ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, quartier: e.target.value }) : null)}
                            placeholder="ex: Hay Mohammadi" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Nom du Chauffeur</label>
                          <input type="text" value={selectedLigne?.chauffeur_nom ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, chauffeur_nom: e.target.value }) : null)}
                            placeholder="ex: Mohamed" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Téléphone du Chauffeur</label>
                          <input type="text" value={selectedLigne?.chauffeur_tel ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, chauffeur_tel: e.target.value }) : null)}
                            placeholder="ex: 0612345678" style={inputStyle} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                          <div>
                            <label style={labelStyle}>Matricule du véhicule</label>
                            <input type="text" value={selectedLigne?.matricule_vehicule ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, matricule_vehicule: e.target.value }) : null)}
                              placeholder="ex: 12345-A-6" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Capacité</label>
                            <input type="number" value={selectedLigne?.capacite ?? 0} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, capacite: parseInt(e.target.value) || 0 }) : null)}
                              placeholder="ex: 15" style={inputStyle} />
                          </div>
                        </div>
                        <div>
                          <label style={labelStyle}>Notes</label>
                          <textarea value={selectedLigne?.notes ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, notes: e.target.value }) : null)}
                            placeholder="Notes additionnelles..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                        </div>
                      </div>
                      <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button onClick={() => setShowLigneModal(false)} style={btnSecondary}>Annuler</button>
                        <button onClick={handleSaveLigne} style={btnPrimary}>Enregistrer</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ SAGE PAIE ═══ */}
            {tab === 'sage' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Générateur */}
                <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Générer Export Paie</h3>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Période</label>
                    <input type="month" value={selectedMois} onChange={e => setSelectedMois(e.target.value)}
                      style={{ ...inputStyle }} />
                  </div>

                  {sagePreview && sagePreview.rows && (
                    <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 8 }}>Aperçu {selectedMois}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                          { label: 'Salariés', value: sagePreview.rows.length },
                          { label: 'Masse brute', value: sagePreview.rows.reduce((s: number, r: any) => s + (r.total_brut || 0), 0).toLocaleString() + ' MAD' },
                        ].map(k => (
                          <div key={k.label} style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid #E2E8F0' }}>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>{k.label}</div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>{k.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ background: '#FEF3C7', borderRadius: 8, padding: 10, fontSize: 12, color: '#92400E', marginBottom: 16 }}>
                    ⚖️ Conforme Art. 385 — Déduction avances plafonnée automatiquement à 1/10ème du salaire net
                  </div>

                  <button onClick={handleGenerateSage} disabled={generatingSage}
                    style={{ ...btnPrimary, width: '100%', justifyContent: 'center', marginBottom: 10 }}>
                    <Download size={15} style={{ marginRight: 8 }} />
                    {generatingSage ? 'Génération...' : `Télécharger CSV Sage — ${selectedMois}`}
                  </button>
                  <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', marginBottom: 16 }}>
                    Format: UTF-8 BOM • Séparateur: point-virgule • Compatible Excel & Sage
                  </div>

                  <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Rapport RH Mensuel Excel</div>
                    <button onClick={handleExportExcelRH}
                      style={{ ...btnSecondary, width: '100%', justifyContent: 'center', borderColor: '#10B981', color: '#065F46' }}>
                      <Download size={15} style={{ marginRight: 8 }} />
                      Exporter Excel — {selectedMois}
                    </button>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#94A3B8' }}>
                      3 feuilles: Rapport Mensuel • Avances • Résumé
                    </div>
                  </div>
                </div>

                {/* Historique */}
                <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Historique des Exports</h3>
                  {sageExports.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 30, color: '#94A3B8' }}>
                      <FileText size={36} style={{ marginBottom: 8, opacity: 0.3 }} />
                      <div>Aucun export généré</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {sageExports.map((e: any) => (
                        <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 10 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#0F172A' }}>{e.mois}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>{new Date(e.date_export).toLocaleDateString('fr-FR')}</div>
                          </div>
                          <CheckCircle size={18} style={{ color: '#10B981' }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ INVITATIONS (identité plateforme) ═══ */}
            {tab === 'invitations' && (
              <InvitationsTab workers={workers} showToast={showToast} />
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
