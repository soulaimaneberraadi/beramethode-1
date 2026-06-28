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
import { tx, type TxMap } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';
import { useIsDark } from '../src/context/ThemeContext';

/** Hauteur 1re ligne d'en-tête (px) — offset sticky pour la ligne des libellés de tranches */
const POINTAGE_THEAD_R1_H = 36;

const ANNUAIRE_VIEW_KEY = 'beramethode_effectifs_annuaire_view';

// ─── CONSTANTS ────────────────────────────────────────────
const ROLES: HRWorkerRole[] = ['OPERATOR', 'SUPERVISOR', 'MECHANIC', 'ADMIN', 'QC', 'IRON', 'CUTTER', 'PACKER'];
const ROLE_LABELS: Record<HRWorkerRole, TxMap> = {
  OPERATOR: { fr: 'Opérateur', ar: 'مشغل', en: 'Operator', es: 'Operario', pt: 'Operador', tr: 'Operatör' },
  SUPERVISOR: { fr: 'Superviseur', ar: 'مشرف', en: 'Supervisor', es: 'Supervisor', pt: 'Supervisor', tr: 'Denetçi' },
  MECHANIC: { fr: 'Mécanicien', ar: 'ميكانيكي', en: 'Mechanic', es: 'Mecánico', pt: 'Mecânico', tr: 'Tamirci' },
  ADMIN: { fr: 'Admin', ar: 'إداري', en: 'Admin', es: 'Admin', pt: 'Admin', tr: 'Yönetici' },
  QC: { fr: 'Contrôle Q.', ar: 'مراقب جودة', en: 'QC', es: 'Control Q.', pt: 'Controle Q.', tr: 'Kalite Kontrol' },
  IRON: { fr: 'Repassage', ar: 'كي', en: 'Ironing', es: 'Planchado', pt: 'Passadoria', tr: 'Ütü' },
  CUTTER: { fr: 'Coupeur', ar: 'قصّاص', en: 'Cutter', es: 'Cortador', pt: 'Cortador', tr: 'Kesici' },
  PACKER: { fr: 'Emballage', ar: 'تعبئة', en: 'Packer', es: 'Empaquetador', pt: 'Empacotador', tr: 'Paketçi' },
};
const ROLE_COLORS: Record<HRWorkerRole, string> = {
  OPERATOR: '#3B82F6', SUPERVISOR: '#8B5CF6', MECHANIC: '#F59E0B',
  ADMIN: '#EF4444', QC: '#10B981', IRON: '#EC4899', CUTTER: '#F97316', PACKER: '#6366F1'
};
const STATUS_CONFIG: Record<HRPointageStatus, { label: TxMap; color: string; bg: string }> = {
  PRESENT:  { label: { fr: 'Présent',  ar: 'حاضر', en: 'Present', es: 'Presente', pt: 'Presente', tr: 'Mevcut' },  color: '#059669', bg: '#ecfdf5' },
  RETARD:   { label: { fr: 'Retard',   ar: 'متأخر', en: 'Late', es: 'Tarde', pt: 'Atrasado', tr: 'Geç' },   color: '#d97706', bg: '#fffbeb' },
  ABSENT:   { label: { fr: 'Absent',   ar: 'غائب', en: 'Absent', es: 'Ausente', pt: 'Ausente', tr: 'Yok' },   color: '#dc2626', bg: '#fef2f2' },
  CONGE:    { label: { fr: 'Congé',    ar: 'عطلة', en: 'Leave', es: 'Vacaciones', pt: 'Férias', tr: 'İzin' },    color: '#2563eb', bg: '#eff6ff' },
  MALADIE:  { label: { fr: 'Maladie',  ar: 'مرض', en: 'Sick', es: 'Enfermedad', pt: 'Doente', tr: 'Hasta' },  color: '#7c3aed', bg: '#f5f3ff' },
  MISSION:  { label: { fr: 'Mission',  ar: 'مهمة', en: 'Mission', es: 'Misión', pt: 'Missão', tr: 'Görev' },  color: '#0d9488', bg: '#f0fdfa' },
  FERIE:    { label: { fr: 'Férié',    ar: 'عطلة رسمية', en: 'Holiday', es: 'Festivo', pt: 'Feriado', tr: 'Tatil' },    color: '#4b5563', bg: '#f9fafb' },
};
const AVANCE_STATUS: Record<string, { label: TxMap; color: string; bg: string }> = {
  DEMANDE:   { label: { fr: 'En attente', ar: 'قيد الانتظار', en: 'Pending', es: 'Pendiente', pt: 'Pendente', tr: 'Beklemede' }, color: '#d97706', bg: '#fffbeb' },
  APPROUVE:  { label: { fr: 'Approuvé',  ar: 'موافق عليه', en: 'Approved', es: 'Aprobado', pt: 'Aprovado', tr: 'Onaylandı' },  color: '#059669', bg: '#ecfdf5' },
  EN_COURS:  { label: { fr: 'En cours',  ar: 'قيد التنفيذ', en: 'In progress', es: 'En curso', pt: 'Em andamento', tr: 'Devam ediyor' },  color: '#2563eb', bg: '#eff6ff' },
  REMBOURSE: { label: { fr: 'Remboursé', ar: 'مردود', en: 'Reimbursed', es: 'Reembolsado', pt: 'Reembolsado', tr: 'Geri ödendi' }, color: '#4b5563', bg: '#f9fafb' },
  REFUSE:    { label: { fr: 'Refusé',    ar: 'مرفوض', en: 'Refused', es: 'Rechazado', pt: 'Recusado', tr: 'Reddedildi' },    color: '#dc2626', bg: '#fef2f2' },
};

const ABSENCE_LIKE: HRPointageStatus[] = ['CONGE', 'MALADIE', 'MISSION', 'FERIE'];

/** Cohérence saisie entrée / sortie (même logique base : sortie < entrée = nuit, traité côté serveur). */
function getPointageEntreeSortieHint(
  heureEntre: string | null | undefined,
  heureSort: string | null | undefined,
  statut: HRPointageStatus | string | undefined,
  lang: string = 'fr',
): { level: 'ok' | 'warn' | 'mute'; label: string } {
  const st = (statut as HRPointageStatus) || 'PRESENT';
  if (st === 'ABSENT' || ABSENCE_LIKE.includes(st as HRPointageStatus)) {
    if (heureEntre || heureSort) {
      return { level: 'warn', label: tx(lang, { fr: 'Horaires saisis mais statut absence', ar: 'تم إدخال الأوقات ولكن الحالة غياب', en: 'Times entered but status is absence', es: 'Horarios ingresados pero estado ausencia', pt: 'Horários inseridos mas status ausência', tr: 'Süre girildi ancak durum devamsızlık' }) };
    }
    return { level: 'mute', label: tx(lang, { fr: '—', ar: '—', en: '—', es: '—', pt: '—', tr: '—' }) };
  }
  if (!heureEntre && !heureSort) {
    return { level: 'warn', label: tx(lang, { fr: 'Aucun pointage', ar: 'لا يوجد تسجيل حضور', en: 'No time log', es: 'Sin registro', pt: 'Sem registro', tr: 'Kayıt yok' }) };
  }
  if (heureEntre && !heureSort) {
    return { level: 'warn', label: tx(lang, { fr: 'Sortie manquante', ar: 'خروج مفقود', en: 'Missing exit', es: 'Salida faltante', pt: 'Saída ausente', tr: 'Çıkış eksik' }) };
  }
  if (!heureEntre && heureSort) {
    return { level: 'warn', label: tx(lang, { fr: 'Sortie sans entrée — erreur de pointeuse / ordre', ar: 'خروج بدون دخول — خطأ في الساعة / الأمر', en: 'Exit without entry — clock/order error', es: 'Salida sin entrada — error de reloj/orden', pt: 'Saída sem entrada — erro de relógio/ordem', tr: 'Girişsiz çıkış — saat/sipariş hatası' }) };
  }
  const toMin = (t: string) => {
    const [a, b] = t.split(':').map(Number);
    return (a || 0) * 60 + (b || 0);
  };
  const e = toMin(String(heureEntre));
  const s = toMin(String(heureSort));
  if (s < e) {
    return { level: 'ok', label: tx(lang, { fr: 'Nuit (sortie < entrée) — calcul 24h ok', ar: 'ليل (خروج < دخول) — حساب 24 ساعة', en: 'Night (exit < entry) — 24h calc ok', es: 'Noche (salida < entrada) — cálculo 24h correcto', pt: 'Noite (saída < entrada) — cálculo 24h ok', tr: 'Gece (çıkış < giriş) — 24s hesaplama tamam' }) };
  }
  return { level: 'ok', label: tx(lang, { fr: 'Entrée → sortie', ar: 'دخول → خروج', en: 'Entry → exit', es: 'Entrada → salida', pt: 'Entrada → saída', tr: 'Giriş → çıkış' }) };
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
function labelStyle(isDark: boolean): React.CSSProperties {
  return { display: 'block', fontSize: 12, fontWeight: 600, color: isDark ? '#C2D2CA' : '#374151', marginBottom: 5 };
}
function inputStyle(isDark: boolean): React.CSSProperties {
  var b = isDark ? '#2E463C' : '#E2E8F0';
  return { border: '1px solid ' + b, borderRadius: 8, padding: '8px 10px', fontSize: 13, color: isDark ? '#EAF1ED' : '#0F172A', background: isDark ? '#14211C' : '#fff', outline: 'none', fontFamily: 'inherit', width: '100%' };
}
function btnPrimary(isDark: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', padding: '10px 20px', background: isDark ? 'linear-gradient(135deg, #2F9E64 0%, #37B473 100%)' : 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, boxShadow: isDark ? '0 4px 12px rgba(47, 158, 100, 0.15)' : '0 4px 12px rgba(79, 70, 229, 0.25)', transition: 'all 0.2s' };
}
function btnSecondary(isDark: boolean): React.CSSProperties {
  var b = isDark ? '#2E463C' : '#e2e8f0';
  return { display: 'flex', alignItems: 'center', padding: '10px 16px', background: isDark ? '#1D2E28' : '#fff', color: isDark ? '#C2D2CA' : '#475569', border: '1px solid ' + b, borderRadius: '12px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, boxShadow: isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s' };
}
function btnDanger(isDark: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', padding: '10px 16px', background: isDark ? '#3b0f1a' : '#fff1f2', color: isDark ? '#fb7185' : '#e11d48', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s' };
}

function Field({ label, value, onChange, type = 'text', placeholder, required }: { label: string; value?: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  const isDark = useIsDark();
  return (
    <div>
      <label style={labelStyle(isDark)}>{label}{required && <span style={{ color: isDark ? '#fb7185' : '#EF4444' }}> *</span>}</label>
      <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={inputStyle(isDark)} />
    </div>
  );
}

// ─── TYPES ────────────────────────────────────────────────
type Tab = 'annuaire' | 'pointage' | 'statistiques' | 'production' | 'avances' | 'sage' | 'invitations' | 'transport';

// Post categories shown in the stats tab
const POST_CATEGORIES = [
  { key: 'surge_piqueuse', label: { fr: 'Surgé / Piqueuse', ar: 'سيرج / خياطة', en: 'Overlock / Sewing', es: 'Surgé / Costura', pt: 'Surgé / Costura', tr: 'Overlok / Dikiş' }, roles: ['OPERATOR'] as HRWorkerRole[], postes: ['SURGE','PIQUEUSE','SURJETEUSE','PIQUEUSE PLATE','PIQUEUR','SURJETEUSE 5 FILS','SURJETEUSE 4 FILS'] },
  { key: 'chef', label: { fr: 'Chef Chaîne', ar: 'رئيس خط', en: 'Line Chief', es: 'Jefe de Línea', pt: 'Chefe de Linha', tr: 'Hat Şefi' }, roles: ['SUPERVISOR'] as HRWorkerRole[], postes: ['CHEF','SUPERVISOR','CHEF DE CHAINE','CHEF CHAINE'] },
  { key: 'trouseuse', label: { fr: 'Boutonnière / Bouton', ar: 'عروة / زر', en: 'Buttonhole / Button', es: 'Ojal / Botón', pt: 'Casa / Botão', tr: 'İlik / Düğme' }, roles: ['OPERATOR'] as HRWorkerRole[], postes: ['TROUSEUSE','BOUTONNIERE','BOUTON','BRIDEUSE'] },
  { key: 'presse', label: { fr: 'Repassage / Presse', ar: 'كي / مكواة', en: 'Ironing / Press', es: 'Planchado / Prensa', pt: 'Passadoria / Prensa', tr: 'Ütü / Pres' }, roles: ['IRON'] as HRWorkerRole[], postes: ['PRESSE','REPASSAGE','FER','IRON'] },
  { key: 'recouvrement', label: { fr: 'Recouvreuse', ar: 'تغطية', en: 'Covering', es: 'Cubridora', pt: 'Recobridora', tr: 'Kaplamacı' }, roles: ['OPERATOR'] as HRWorkerRole[], postes: ['RECOUVREMENT','COLLETEUSE','RECOUVREUSE'] },
];

// ─── WORKER MODAL ─────────────────────────────────────────
const EMPTY_WORKER: Partial<HRWorker> = {
  sexe: 'M', role: 'OPERATOR', type_contrat: 'CDI', is_active: true,
  salaire_base: 0, taux_horaire: 0, taux_piece: 0,
  prime_assiduite: 0, prime_transport: 0, mode_paiement: 'VIREMENT',
};

function WorkerModal({ worker, onClose, onSave, transportLignes }: { worker: Partial<HRWorker> | null; onClose: () => void; onSave: () => void; transportLignes: HRTransportLigne[] }) {
  const { lang } = useLang();
  const isDark = useIsDark();
  const _labelStyle = labelStyle(isDark);
  const _inputStyle = inputStyle(isDark);
  const _btnPrimary = btnPrimary(isDark);
  const _btnSecondary = btnSecondary(isDark);
  const _btnDanger = btnDanger(isDark);
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
      alert(tx(lang, { fr: 'Matricule et nom complet sont requis', ar: 'الرقم المهني والاسم الكامل مطلوبان', en: 'Registration number and full name are required', es: 'Matrícula y nombre completo son requeridos', pt: 'Matrícula e nome completo são obrigatórios', tr: 'Kayıt numarası ve tam ad gereklidir' }));
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
          alert(tx(lang, { fr: `Ce CIN existe déjà${n}. Utilisez « Rattacher person_id » ou corrigez le CIN.`, ar: `رقم البطاقة موجود مسبقاً${n}. استخدم "ربط person_id" أو صحّح رقم البطاقة.`, en: `This ID already exists${n}. Use "Attach person_id" or correct the ID.`, es: `Esta cédula ya existe${n}. Use "Vincular person_id" o corrija la cédula.`, pt: `Este CIN já existe${n}. Use "Vincular person_id" ou corrija o CIN.`, tr: `Bu kimlik zaten mevcut${n}. "person_id bağla" kullanın veya kimliği düzeltin.` }));
        } else {
          alert(data.message || tx(lang, { fr: `Erreur ${r.status}`, ar: `خطأ ${r.status}`, en: `Error ${r.status}`, es: `Error ${r.status}`, pt: `Erro ${r.status}`, tr: `Hata ${r.status}` }));
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
      alert(tx(lang, { fr: 'Enregistrez d\'abord la fiche pour définir le PIN.', ar: 'احفظ الملف أولاً لتعريف PIN.', en: 'Save the record first to set the PIN.', es: 'Guarde la ficha primero para definir el PIN.', pt: 'Salve o registro primeiro para definir o PIN.', tr: 'PIN\'i ayarlamak için önce kaydı kaydedin.' }));
      return;
    }
    if (!/^\d{4,8}$/.test(pin1)) {
      alert(tx(lang, { fr: 'PIN : 4 à 8 chiffres.', ar: 'PIN: 4 إلى 8 أرقام.', en: 'PIN: 4 to 8 digits.', es: 'PIN: 4 a 8 dígitos.', pt: 'PIN: 4 a 8 dígitos.', tr: 'PIN: 4 ila 8 hane.' }));
      return;
    }
    if (pin1 !== pin2) {
      alert(tx(lang, { fr: 'Les deux saisies PIN diffèrent.', ar: 'إدخالا PIN غير متطابقين.', en: 'The two PIN entries differ.', es: 'Las dos entradas de PIN difieren.', pt: 'As duas entradas de PIN diferem.', tr: 'İki PIN girişi eşleşmiyor.' }));
      return;
    }
      if (!/^\d{4,8}$/.test(pin1)) {
        alert(tx(lang, { fr: 'PIN : 4 à 8 chiffres.', ar: 'PIN: 4 إلى 8 أرقام.', en: 'PIN: 4 to 8 digits.', es: 'PIN: 4 a 8 dígitos.', pt: 'PIN: 4 a 8 dígitos.', tr: 'PIN: 4 ila 8 hane.' }));
        return;
      }
      if (pin1 !== pin2) {
        alert(tx(lang, { fr: 'Les deux saisies PIN diffèrent.', ar: 'إدخالا PIN غير متطابقين.', en: 'The two PIN entries differ.', es: 'Las dos entradas de PIN difieren.', pt: 'As duas entradas de PIN diferem.', tr: 'İki PIN girişi eşleşmiyor.' }));
        return;
      }
    setPinBusy(true);
    try {
      const r = await API(`/api/hr/workers/${encodeURIComponent(form.id)}/pin`, { method: 'POST', body: JSON.stringify({ pin: pin1 }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert((d as { message?: string }).message || tx(lang, { fr: 'Erreur PIN', ar: 'خطأ في PIN', en: 'PIN Error', es: 'Error PIN', pt: 'Erro PIN', tr: 'PIN Hatası' }));
        return;
      }
      setPin1('');
      setPin2('');
      alert(tx(lang, { fr: 'PIN BERAOUVIER enregistré.', ar: 'تم حفظ PIN BERAOUVIER.', en: 'PIN BERAOUVIER saved.', es: 'PIN BERAOUVIER guardado.', pt: 'PIN BERAOUVIER salvo.', tr: 'PIN BERAOUVIER kaydedildi.' }));
    } finally {
      setPinBusy(false);
    }
  };

  const subTabs = [
    { id: 'identity', label: tx(lang, { fr: '👤 Identité', ar: '👤 الهوية', en: '👤 Identity', es: '👤 Identidad', pt: '👤 Identidade', tr: '👤 Kimlik' }) },
    { id: 'emploi',   label: tx(lang, { fr: '💼 Emploi', ar: '💼 الوظيفة', en: '💼 Employment', es: '💼 Empleo', pt: '💼 Emprego', tr: '💼 İş' }) },
    { id: 'financier', label: tx(lang, { fr: '💰 Financier', ar: '💰 المالية', en: '💰 Financial', es: '💰 Financiero', pt: '💰 Financeiro', tr: '💰 Finansal' }) },
    { id: 'urgence',  label: tx(lang, { fr: '🆘 Urgence', ar: '🆘 طوارئ', en: '🆘 Emergency', es: '🆘 Emergencia', pt: '🆘 Emergência', tr: '🆘 Acil' }) },
  ] as const;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
            {form.id ? `${tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })} — ${form.full_name}` : tx(lang, { fr: 'Nouvel Ouvrier', ar: 'عامل جديد', en: 'New Worker', es: 'Nuevo Operario', pt: 'Novo Operário', tr: 'Yeni İşçi' })}
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
                  <button onClick={() => photoRef.current?.click()} style={{ ..._btnSecondary, fontSize: 12 }}>
                    <Camera size={14} style={{ marginRight: 6 }} />{tx(lang, { fr: 'Choisir photo', ar: 'اختيار صورة', en: 'Choose photo', es: 'Elegir foto', pt: 'Escolher foto', tr: 'Fotoğraf seç' })}
                  </button>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{tx(lang, { fr: 'JPG, PNG — max 2MB', ar: 'JPG، PNG — 2MB كحد أقصى', en: 'JPG, PNG — max 2MB', es: 'JPG, PNG — máx 2MB', pt: 'JPG, PNG — máx 2MB', tr: 'JPG, PNG — maks 2MB' })}</div>
                </div>
              </div>
              <Field label={tx(lang, { fr: 'Matricule', ar: 'الرقم المهني', en: 'Registration No.', es: 'Matrícula', pt: 'Matrícula', tr: 'Kayıt No' })} value={form.matricule} onChange={v => set('matricule', v)} placeholder="MAT-001" required />
              <Field label={tx(lang, { fr: 'Nom Complet', ar: 'الاسم الكامل', en: 'Full Name', es: 'Nombre Completo', pt: 'Nome Completo', tr: 'Tam Ad' })} value={form.full_name} onChange={v => set('full_name', v)} placeholder={tx(lang, { fr: 'Prénom Nom', ar: 'الاسم الأول والنسب', en: 'First Last', es: 'Nombre Apellido', pt: 'Nome Sobrenome', tr: 'Ad Soyad' })} required />
              <Field label={tx(lang, { fr: 'CIN', ar: 'رقم البطاقة الوطنية', en: 'ID No.', es: 'Cédula', pt: 'CIN', tr: 'Kimlik No' })} value={form.cin ?? ''} onChange={v => set('cin', v)} placeholder="AB123456" />
              <Field label={tx(lang, { fr: 'CNSS', ar: 'رقم CNSS', en: 'CNSS No.', es: 'CNSS', pt: 'CNSS', tr: 'CNSS No' })} value={form.cnss ?? ''} onChange={v => set('cnss', v)} placeholder={tx(lang, { fr: 'Numéro CNSS', ar: 'رقم CNSS', en: 'CNSS Number', es: 'Número CNSS', pt: 'Número CNSS', tr: 'CNSS Numarası' })} />
              {form.id && (
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={_labelStyle}>{tx(lang, { fr: 'Person ID (plateforme)', ar: 'معرف الشخص (المنصة)', en: 'Person ID (platform)', es: 'ID Persona (plataforma)', pt: 'ID Pessoa (plataforma)', tr: 'Kişi ID (platform)' })}</label>
                  <div style={{ ...inputStyle, background: '#F8FAFC', color: '#475569', fontSize: 12 }} title={tx(lang, { fr: 'Identifiant stable Section 23', ar: 'معرف ثابت القسم 23', en: 'Stable ID Section 23', es: 'ID estable Sección 23', pt: 'ID estável Seção 23', tr: 'Kararlı ID Bölüm 23' })}>
                    {form.person_id || tx(lang, { fr: '—', ar: '—', en: '—', es: '—', pt: '—', tr: '—' })}
                  </div>
                </div>
              )}
              <div style={{ gridColumn: '1/-1' }}>
                <Field
                  label={tx(lang, { fr: 'Rattacher à un person_id existant (optionnel)', ar: 'ربط بمعرف شخص موجود (اختياري)', en: 'Attach to existing person_id (optional)', es: 'Vincular a person_id existente (opcional)', pt: 'Vincular a person_id existente (opcional)', tr: 'Mevcut person_id\'ye bağla (isteğe bağlı)' })}
                  value={form.link_person_id ?? ''}
                  onChange={v => set('link_person_id', v)}
                  placeholder="per-xxxxxxxx (fusion volontaire)"
                />
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{tx(lang, { fr: 'Laisser vide pour créer / garder le lien automatique. Ne remplir qu\'en cas de fusion RH explicite.', ar: 'اتركه فارغاً لإنشاء / الاحتفاظ بالارتباط التلقائي. املأ فقط في حالة الدمج الصريح للموارد البشرية.', en: 'Leave empty to create / keep automatic link. Only fill in case of explicit HR merge.', es: 'Dejar vacío para crear / mantener enlace automático. Rellenar solo en caso de fusión RH explícita.', pt: 'Deixar vazio para criar / manter link automático. Preencher apenas em caso de fusão RH explícita.', tr: 'Otomatik bağlantı oluşturmak/korumak için boş bırakın. Yalnızca açık İK birleştirme durumunda doldurun.' })}</div>
              </div>
              {form.id && (
                <div style={{ gridColumn: '1/-1', borderTop: '1px solid #E2E8F0', paddingTop: 16, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Key size={16} color="#2149C1" />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>{tx(lang, { fr: 'PIN BERAOUVIER (CIN + PIN)', ar: 'PIN BERAOUVIER (CIN + PIN)', en: 'PIN BERAOUVIER (CIN + PIN)', es: 'PIN BERAOUVIER (CIN + PIN)', pt: 'PIN BERAOUVIER (CIN + PIN)', tr: 'PIN BERAOUVIER (CIN + PIN)' })}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label={tx(lang, { fr: 'Nouveau PIN', ar: 'PIN جديد', en: 'New PIN', es: 'Nuevo PIN', pt: 'Novo PIN', tr: 'Yeni PIN' })} value={pin1} onChange={setPin1} type="password" placeholder={tx(lang, { fr: '4–8 chiffres', ar: '4–8 أرقام', en: '4–8 digits', es: '4–8 dígitos', pt: '4–8 dígitos', tr: '4–8 hane' })} />
                    <Field label={tx(lang, { fr: 'Confirmer PIN', ar: 'تأكيد PIN', en: 'Confirm PIN', es: 'Confirmar PIN', pt: 'Confirmar PIN', tr: 'PIN\'i Onayla' })} value={pin2} onChange={setPin2} type="password" placeholder={tx(lang, { fr: 'répéter', ar: 'أعد الإدخال', en: 'repeat', es: 'repetir', pt: 'repetir', tr: 'tekrarla' })} />
                  </div>
                  <button type="button" onClick={handleSetPin} disabled={pinBusy} style={{ ..._btnSecondary, marginTop: 10 }}>
                    {pinBusy ? tx(lang, { fr: '…', ar: '…', en: '…', es: '…', pt: '…', tr: '…' }) : tx(lang, { fr: 'Enregistrer le PIN', ar: 'حفظ PIN', en: 'Save PIN', es: 'Guardar PIN', pt: 'Salvar PIN', tr: 'PIN\'i Kaydet' })}
                  </button>
                </div>
              )}
              <Field label={tx(lang, { fr: 'Téléphone', ar: 'الهاتف', en: 'Phone', es: 'Teléfono', pt: 'Telefone', tr: 'Telefon' })} value={form.phone ?? ''} onChange={v => set('phone', v)} placeholder="06 XX XX XX" />
              <Field label={tx(lang, { fr: 'Date Naissance', ar: 'تاريخ الميلاد', en: 'Date of Birth', es: 'Fecha de Nacimiento', pt: 'Data de Nascimento', tr: 'Doğum Tarihi' })} value={form.date_naissance ?? ''} onChange={v => set('date_naissance', v)} type="date" />
              <div>
                <label style={_labelStyle}>{tx(lang, { fr: 'Sexe', ar: 'الجنس', en: 'Sex', es: 'Sexo', pt: 'Sexo', tr: 'Cinsiyet' })}</label>
                <select value={form.sexe ?? 'M'} onChange={e => set('sexe', e.target.value)} style={_inputStyle}>
                  <option value="M">{tx(lang, { fr: 'Homme', ar: 'ذكر', en: 'Male', es: 'Hombre', pt: 'Homem', tr: 'Erkek' })}</option>
                  <option value="F">{tx(lang, { fr: 'Femme', ar: 'أنثى', en: 'Female', es: 'Mujer', pt: 'Mulher', tr: 'Kadın' })}</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <Field label={tx(lang, { fr: 'Adresse', ar: 'العنوان', en: 'Address', es: 'Dirección', pt: 'Endereço', tr: 'Adres' })} value={form.adresse ?? ''} onChange={v => set('adresse', v)} placeholder={tx(lang, { fr: 'Adresse complète', ar: 'العنوان الكامل', en: 'Full address', es: 'Dirección completa', pt: 'Endereço completo', tr: 'Tam adres' })} />
              </div>
              </div>
          )}

          {subTab === 'emploi' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={_labelStyle}>{tx(lang, { fr: 'Rôle', ar: 'الدور', en: 'Role', es: 'Rol', pt: 'Função', tr: 'Rol' })}</label>
                <select value={form.role ?? 'OPERATOR'} onChange={e => set('role', e.target.value as HRWorkerRole)} style={_inputStyle}>
                  {ROLES.map(r => <option key={r} value={r}>{tx(lang, ROLE_LABELS[r])}</option>)}
                </select>
              </div>
              <Field label={tx(lang, { fr: 'Chaîne', ar: 'الخط', en: 'Line', es: 'Línea', pt: 'Linha', tr: 'Hat' })} value={form.chaine_id ?? ''} onChange={v => set('chaine_id', v)} placeholder="ex: CHAINE 1" />
              <Field label={tx(lang, { fr: 'Parda / Équipe', ar: 'الوردية / الفريق', en: 'Shift / Team', es: 'Turno / Equipo', pt: 'Turno / Equipe', tr: 'Vardiya / Takım' })} value={form.equipe ?? ''} onChange={v => set('equipe', v)} placeholder={tx(lang, { fr: 'ex: Équipe A / Équipe B', ar: 'مثال: الفريق أ / الفريق ب', en: 'ex: Team A / Team B', es: 'ej: Equipo A / Equipo B', pt: 'ex: Equipe A / Equipe B', tr: 'ör: Takım A / Takım B' })} />
              <Field label={tx(lang, { fr: 'Poste', ar: 'المنصب', en: 'Position', es: 'Puesto', pt: 'Posto', tr: 'Pozisyon' })} value={form.poste ?? ''} onChange={v => set('poste', v)} placeholder={tx(lang, { fr: 'ex: Piqueur', ar: 'مثال: خياط', en: 'ex: Sewer', es: 'ej: Costurero', pt: 'ex: Costureiro', tr: 'ör: Dikişçi' })} />
              <Field label={tx(lang, { fr: 'Spécialité', ar: 'التخصص', en: 'Specialty', es: 'Especialidad', pt: 'Especialidade', tr: 'Uzmanlık' })} value={form.specialite ?? ''} onChange={v => set('specialite', v)} placeholder={tx(lang, { fr: 'ex: Jupe', ar: 'مثال: تنورة', en: 'ex: Skirt', es: 'ej: Falda', pt: 'ex: Saia', tr: 'ör: Etek' })} />
              <Field label={tx(lang, { fr: 'Date Embauche', ar: 'تاريخ التوظيف', en: 'Hire Date', es: 'Fecha de Contratación', pt: 'Data de Contratação', tr: 'İşe Giriş Tarihi' })} value={form.date_embauche ?? ''} onChange={v => set('date_embauche', v)} type="date" required />
              <div>
                <label style={_labelStyle}>{tx(lang, { fr: 'Type Contrat', ar: 'نوع العقد', en: 'Contract Type', es: 'Tipo de Contrato', pt: 'Tipo de Contrato', tr: 'Sözleşme Türü' })}</label>
                <select value={form.type_contrat ?? 'CDI'} onChange={e => set('type_contrat', e.target.value as HRContractType)} style={_inputStyle}>
                  {(['CDI','CDD','ANAPEC','STAGE'] as HRContractType[]).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {form.type_contrat !== 'CDI' && (
                <Field label={tx(lang, { fr: 'Date Fin Contrat', ar: 'تاريخ نهاية العقد', en: 'Contract End Date', es: 'Fecha de Fin de Contrato', pt: 'Data de Fim do Contrato', tr: 'Sözleşme Bitiş Tarihi' })} value={form.date_fin_contrat ?? ''} onChange={v => set('date_fin_contrat', v)} type="date" />
              )}
              <div>
                <label style={_labelStyle}>{tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum' })}</label>
                <select value={form.is_active ? '1' : '0'} onChange={e => set('is_active', e.target.value === '1')} style={_inputStyle}>
                  <option value="1">{tx(lang, { fr: 'Actif', ar: 'نشط', en: 'Active', es: 'Activo', pt: 'Ativo', tr: 'Aktif' })}</option>
                  <option value="0">{tx(lang, { fr: 'Inactif', ar: 'غير نشط', en: 'Inactive', es: 'Inactivo', pt: 'Inativo', tr: 'Pasif' })}</option>
                </select>
              </div>
              <div>
                <label style={_labelStyle}>{tx(lang, { fr: 'Ligne de Transport', ar: 'خط النقل', en: 'Transport Line', es: 'Línea de Transporte', pt: 'Linha de Transporte', tr: 'Ulaşım Hattı' })}</label>
                <select value={form.transport_ligne_id ?? ''} onChange={e => set('transport_ligne_id', e.target.value || null)} style={_inputStyle}>
                  <option value="">{tx(lang, { fr: '-- Sans Transport --', ar: '-- بدون نقل --', en: '-- No Transport --', es: '-- Sin Transporte --', pt: '-- Sem Transporte --', tr: '-- Ulaşım Yok --' })}</option>
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
                {tx(lang, { fr: 'ℹ️ Ces données sont confidentielles — non exposées aux ouvriers via BERAOUVIER', ar: 'ℹ️ هذه البيانات سرية — لا يطلع عليها العمال عبر BERAOUVIER', en: 'ℹ️ This data is confidential — not exposed to workers via BERAOUVIER', es: 'ℹ️ Estos datos son confidenciales — no expuestos a los trabajadores via BERAOUVIER', pt: 'ℹ️ Estes dados são confidenciais — não expostos aos trabalhadores via BERAOUVIER', tr: 'ℹ️ Bu veriler gizlidir — BERAOUVIER üzerinden işçilere gösterilmez' })}
              </div>
              <Field label={tx(lang, { fr: 'Salaire Base (MAD)', ar: 'Salaire Base (MAD)', en: 'Salaire Base (MAD)', es: 'Salaire Base (MAD)', pt: 'Salaire Base (MAD)', tr: 'Salaire Base (MAD)' })} value={form.salaire_base ?? 0} onChange={v => set('salaire_base', parseFloat(v) || 0)} type="number" />
              <Field label={tx(lang, { fr: 'Taux Horaire (MAD/h)', ar: 'Taux Horaire (MAD/h)', en: 'Taux Horaire (MAD/h)', es: 'Taux Horaire (MAD/h)', pt: 'Taux Horaire (MAD/h)', tr: 'Taux Horaire (MAD/h)' })} value={form.taux_horaire ?? 0} onChange={v => set('taux_horaire', parseFloat(v) || 0)} type="number" />
              <Field label={tx(lang, { fr: 'Taux Pièce (MAD)', ar: 'Taux Pièce (MAD)', en: 'Taux Pièce (MAD)', es: 'Taux Pièce (MAD)', pt: 'Taux Pièce (MAD)', tr: 'Taux Pièce (MAD)' })} value={form.taux_piece ?? 0} onChange={v => set('taux_piece', parseFloat(v) || 0)} type="number" />
              <Field label={tx(lang, { fr: 'Prime Assiduité (MAD)', ar: 'Prime Assiduité (MAD)', en: 'Prime Assiduité (MAD)', es: 'Prime Assiduité (MAD)', pt: 'Prime Assiduité (MAD)', tr: 'Prime Assiduité (MAD)' })} value={form.prime_assiduite ?? 0} onChange={v => set('prime_assiduite', parseFloat(v) || 0)} type="number" />
              <Field label={tx(lang, { fr: 'Prime Transport (MAD)', ar: 'Prime Transport (MAD)', en: 'Prime Transport (MAD)', es: 'Prime Transport (MAD)', pt: 'Prime Transport (MAD)', tr: 'Prime Transport (MAD)' })} value={form.prime_transport ?? 0} onChange={v => set('prime_transport', parseFloat(v) || 0)} type="number" />
              <div>
                <label style={_labelStyle}>{tx(lang, { fr: 'Mode Paiement', ar: 'طريقة الدفع', en: 'Payment Method', es: 'Método de Pago', pt: 'Método de Pagamento', tr: 'Ödeme Yöntemi' })}</label>
                <select value={form.mode_paiement ?? 'VIREMENT'} onChange={e => set('mode_paiement', e.target.value)} style={_inputStyle}>
                  <option value="VIREMENT">{tx(lang, { fr: 'Virement bancaire', ar: 'تحويل بنكي', en: 'Bank Transfer', es: 'Transferencia bancaria', pt: 'Transferência bancária', tr: 'Banka Havalesi' })}</option>
                  <option value="ESPECES">{tx(lang, { fr: 'Espèces', ar: 'نقداً', en: 'Cash', es: 'Efectivo', pt: 'Dinheiro', tr: 'Nakit' })}</option>
                  <option value="CHEQUE">{tx(lang, { fr: 'Chèque', ar: 'شيك', en: 'Cheque', es: 'Cheque', pt: 'Cheque', tr: 'Çek' })}</option>
                </select>
              </div>
            </div>
          )}

          {subTab === 'urgence' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label={tx(lang, { fr: 'Nom Contact Urgence', ar: 'اسم جهة الاتصال في الطوارئ', en: 'Emergency Contact Name', es: 'Nombre Contacto Emergencia', pt: 'Nome Contato Emergência', tr: 'Acil Durum İletişim Adı' })} value={form.contact_urgence_nom ?? ''} onChange={v => set('contact_urgence_nom', v)} placeholder={tx(lang, { fr: 'Nom complet', ar: 'الاسم الكامل', en: 'Full name', es: 'Nombre completo', pt: 'Nome completo', tr: 'Tam ad' })} />
              <Field label={tx(lang, { fr: 'Tél Contact Urgence', ar: 'هاتف جهة الاتصال في الطوارئ', en: 'Emergency Contact Phone', es: 'Teléfono Contacto Emergencia', pt: 'Telefone Contato Emergência', tr: 'Acil İletişim Telefonu' })} value={form.contact_urgence_tel ?? ''} onChange={v => set('contact_urgence_tel', v)} placeholder="06 XX XX XX" />
              <div>
                <label style={_labelStyle}>{tx(lang, { fr: 'Lien de parenté', ar: 'صلة القرابة', en: 'Relationship', es: 'Parentesco', pt: 'Parentesco', tr: 'Yakınlık Derecesi' })}</label>
                <select value={form.contact_urgence_lien ?? ''} onChange={e => set('contact_urgence_lien', e.target.value)} style={_inputStyle}>
                  <option value="">{tx(lang, { fr: '-- Sélectionner --', ar: '-- اختر --', en: '-- Select --', es: '-- Seleccionar --', pt: '-- Selecionar --', tr: '-- Seç --' })}</option>
                  {[
                    { fr: 'Père', ar: 'أب', en: 'Father', es: 'Padre', pt: 'Pai', tr: 'Baba' },
                    { fr: 'Mère', ar: 'أم', en: 'Mother', es: 'Madre', pt: 'Mãe', tr: 'Anne' },
                    { fr: 'Conjoint(e)', ar: 'زوج/زوجة', en: 'Spouse', es: 'Cónyuge', pt: 'Cônjuge', tr: 'Eş' },
                    { fr: 'Frère', ar: 'أخ', en: 'Brother', es: 'Hermano', pt: 'Irmão', tr: 'Erkek Kardeş' },
                    { fr: 'Sœur', ar: 'أخت', en: 'Sister', es: 'Hermana', pt: 'Irmã', tr: 'Kız Kardeş' },
                    { fr: 'Autre', ar: 'آخر', en: 'Other', es: 'Otro', pt: 'Outro', tr: 'Diğer' },
                  ].map(l => <option key={l.fr} value={l.fr}>{tx(lang, l)}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={_labelStyle}>{tx(lang, { fr: 'Notes', ar: 'ملاحظات', en: 'Notes', es: 'Notas', pt: 'Notas', tr: 'Notlar' })}</label>
                <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }} placeholder={tx(lang, { fr: 'Notes libres...', ar: 'ملاحظات...', en: 'Free notes...', es: 'Notas libres...', pt: 'Notas livres...', tr: 'Serbest notlar...' })} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={_btnSecondary}>{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}</button>
          <button onClick={handleSave} disabled={saving} style={_btnPrimary}>
            {saving ? tx(lang, { fr: 'Enregistrement...', ar: 'جارٍ الحفظ...', en: 'Saving...', es: 'Guardando...', pt: 'Salvando...', tr: 'Kaydediliyor...' }) : <><Save size={14} style={{ marginRight: 6 }} />{tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Salvar', tr: 'Kaydet' })}</>}
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
  const { lang } = useLang();
  const isDark = useIsDark();
  const _labelStyle = labelStyle(isDark);
  const _inputStyle = inputStyle(isDark);
  const _btnPrimary = btnPrimary(isDark);
  const _btnSecondary = btnSecondary(isDark);
  const _btnDanger = btnDanger(isDark);
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
        <button onClick={onRefresh} style={_btnSecondary}><RefreshCw size={14} style={{ marginRight: 6 }} />{tx(lang, { fr: 'Actualiser', ar: 'تحديث', en: 'Refresh', es: 'Actualizar', pt: 'Atualizar', tr: 'Yenile' })}</button>

        {/* Global KPIs */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {[
            { label: tx(lang, { fr: 'Total Effectif', ar: 'إجمالي العمال', en: 'Total Staff', es: 'Total Efectivo', pt: 'Total Efetivo', tr: 'Toplam Personel' }), val: workers.length, bg: '#EFF6FF', color: '#1D4ED8' },
            { label: tx(lang, { fr: 'Présents', ar: 'حاضرون', en: 'Present', es: 'Presentes', pt: 'Presentes', tr: 'Mevcut' }), val: totalPresents, bg: '#ECFDF5', color: '#065F46' },
            { label: tx(lang, { fr: 'Absents', ar: 'غائبون', en: 'Absent', es: 'Ausentes', pt: 'Ausentes', tr: 'Yok' }), val: totalAbsents, bg: '#FEF2F2', color: '#991B1B' },
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
                        ▶ {ch.activePlan.modelName || tx(lang, { fr: 'Modèle en cours', ar: 'النموذج الحالي', en: 'Current model', es: 'Modelo en curso', pt: 'Modelo em andamento', tr: 'Mevcut model' })}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: presencePct >= 80 ? '#065F46' : presencePct >= 60 ? '#92400E' : '#991B1B' }}>
                    {presencePct}%
                  </div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>{tx(lang, { fr: 'Présence', ar: 'الحضور', en: 'Attendance', es: 'Asistencia', pt: 'Presença', tr: 'Devam' })}</div>
                </div>
              </div>

              {/* Presence bar */}
              <div style={{ height: 6, background: '#F1F5F9', borderRadius: 4, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${presencePct}%`, background: presencePct >= 80 ? '#10B981' : presencePct >= 60 ? '#F59E0B' : '#EF4444', borderRadius: 4, transition: 'width 0.5s' }} />
              </div>

              {/* Counts row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[
                  { label: tx(lang, { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' }), val: ch.total, bg: '#F8FAFC', color: '#374151' },
                  { label: tx(lang, { fr: 'Présents', ar: 'حاضرون', en: 'Present', es: 'Presentes', pt: 'Presentes', tr: 'Mevcut' }), val: ch.presents, bg: '#ECFDF5', color: '#065F46' },
                  { label: tx(lang, { fr: 'Absents', ar: 'غائبون', en: 'Absent', es: 'Ausentes', pt: 'Ausentes', tr: 'Yok' }), val: ch.absents, bg: '#FEF2F2', color: '#991B1B' },
                  ...(ch.todayProduced > 0 ? [{ label: tx(lang, { fr: 'Pcs/jour', ar: 'قطعة/يوم', en: 'Pcs/day', es: 'Pzs/día', pt: 'Peças/dia', tr: 'Adet/gün' }), val: ch.todayProduced, bg: '#EEF2FF', color: '#4F46E5' }] : []),
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
                    <div style={{ fontSize: 11, color: '#64748B', flex: 1, fontWeight: 500 }}>{tx(lang, p.label)}</div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#065F46', background: '#ECFDF5', padding: '1px 6px', borderRadius: 10 }}>{p.presents}✓</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>/{p.total}</span>
                    </div>
                  </div>
                ))}
                {ch.postBreakdown.every(p => p.total === 0) && (
                  <div style={{ fontSize: 11, color: '#CBD5E1', fontStyle: 'italic' }}>{tx(lang, { fr: 'Postes non définis', ar: 'مناصب غير محددة', en: 'Undefined positions', es: 'Puestos no definidos', pt: 'Cargos não definidos', tr: 'Tanımlanmamış pozisyonlar' })}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Emballage + Administration sections */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Emballage */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: isDark ? '1px solid #2E463C' : '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 18 }}>📦</span>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>{tx(lang, { fr: 'Emballage', ar: 'التعبئة', en: 'Packing', es: 'Embalaje', pt: 'Embalagem', tr: 'Paketleme' })}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{tx(lang, { fr: `${emballagePresents.length}/${emballageWorkers.length} présents`, ar: `${emballagePresents.length}/${emballageWorkers.length} حاضر`, en: `${emballagePresents.length}/${emballageWorkers.length} present`, es: `${emballagePresents.length}/${emballageWorkers.length} presentes`, pt: `${emballagePresents.length}/${emballageWorkers.length} presentes`, tr: `${emballagePresents.length}/${emballageWorkers.length} mevcut` })}</div>
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
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: sc.bg, color: sc.color }}>{tx(lang, sc.label)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20, color: '#CBD5E1', fontSize: 12 }}>{tx(lang, { fr: 'Aucun ouvrier emballage', ar: 'لا يوجد عامل تعبئة', en: 'No packing worker', es: 'Ningún operario de embalaje', pt: 'Nenhum operário de embalagem', tr: 'Paketleme işçisi yok' })}</div>
          )}
        </div>

        {/* Administration */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFF5F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 18 }}>🏢</span>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>{tx(lang, { fr: 'Administration', ar: 'الإدارة', en: 'Administration', es: 'Administración', pt: 'Administração', tr: 'Yönetim' })}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{tx(lang, { fr: `${adminPresents.length}/${adminWorkers.length} présents`, ar: `${adminPresents.length}/${adminWorkers.length} حاضر`, en: `${adminPresents.length}/${adminWorkers.length} present`, es: `${adminPresents.length}/${adminWorkers.length} presentes`, pt: `${adminPresents.length}/${adminWorkers.length} presentes`, tr: `${adminPresents.length}/${adminWorkers.length} mevcut` })}</div>
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
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: sc.bg, color: sc.color }}>{tx(lang, sc.label)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20, color: '#CBD5E1', fontSize: 12 }}>{tx(lang, { fr: 'Aucun personnel admin', ar: 'لا يوجد موظف إداري', en: 'No admin staff', es: 'Ningún personal admin', pt: 'Nenhum pessoal administrativo', tr: 'Yönetim personeli yok' })}</div>
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
                        {tx(lang, { fr: `${chainWorkers.length} ouvrier(s) affecté(s)`, ar: `${chainWorkers.length} عامل معين`, en: `${chainWorkers.length} worker(s) assigned`, es: `${chainWorkers.length} operario(s) asignado(s)`, pt: `${chainWorkers.length} operário(s) designado(s)`, tr: `${chainWorkers.length} işçi atandı` })}
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
                                <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: sc.color, border: '2px solid #fff' }} title={tx(lang, sc.label)} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{w.full_name}</div>
                                <div style={{ fontSize: 11, color: '#64748B', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                                  <span>{w.matricule}</span>
                                  <span>•</span>
                                  <span style={{ fontWeight: 600, color: ROLE_COLORS[roleK] }}>{tx(lang, ROLE_LABELS[roleK])}</span>
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
                                  {tx(lang, { fr: 'Parda:', ar: 'الوردية:', en: 'Shift:', es: 'Turno:', pt: 'Turno:', tr: 'Vardiya:' })} <span style={{ color: '#1E293B' }}>{w.equipe || tx(lang, { fr: '—', ar: '—', en: '—', es: '—', pt: '—', tr: '—' })}</span>
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: sc.bg, color: sc.color, marginTop: 4, display: 'inline-block' }}>
                                  {tx(lang, sc.label)}
                                </div>
                              </div>
                              {w.phone ? (
                                <a 
                                  href={`tel:${w.phone}`} 
                                  title={tx(lang, { fr: `Appeler ${w.full_name}`, ar: `اتصال بـ ${w.full_name}`, en: `Call ${w.full_name}`, es: `Llamar a ${w.full_name}`, pt: `Ligar para ${w.full_name}`, tr: `${w.full_name} Ara` })}
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
                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F1F5F9', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }} title={tx(lang, { fr: 'Aucun téléphone', ar: 'لا يوجد هاتف', en: 'No phone', es: 'Sin teléfono', pt: 'Sem telefone', tr: 'Telefon yok' })}>
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
                      <div style={{ fontWeight: 600 }}>{tx(lang, { fr: 'Aucun ouvrier affecté à cette chaîne', ar: 'لا يوجد عامل معين لهذا الخط', en: 'No worker assigned to this line', es: 'Ningún operario asignado a esta línea', pt: 'Nenhum operário designado a esta linha', tr: 'Bu hatta atanmış işçi yok' })}</div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', background: '#F8FAFC', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
                  <button onClick={() => setSelectedChainDetail(null)} style={_btnSecondary}>
                    {tx(lang, { fr: 'Fermer', ar: 'إغلاق', en: 'Close', es: 'Cerrar', pt: 'Fechar', tr: 'Kapat' })}
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
  const { lang } = useLang();
  const isDark = useIsDark();
  const _labelStyle = labelStyle(isDark);
  const _inputStyle = inputStyle(isDark);
  const _btnPrimary = btnPrimary(isDark);
  const _btnSecondary = btnSecondary(isDark);
  const _btnDanger = btnDanger(isDark);
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
      showToast(tx(lang, { fr: 'person_id, matricule et nom requis', ar: 'person_id والرقم المهني والاسم مطلوب', en: 'person_id, registration no. and name required', es: 'person_id, matrícula y nombre requeridos', pt: 'person_id, matrícula e nome obrigatórios', tr: 'person_id, kayıt no ve ad gerekli' }), 'err');
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
      showToast((d as { message?: string }).message || tx(lang, { fr: 'Erreur création', ar: 'خطأ في الإنشاء', en: 'Creation error', es: 'Error de creación', pt: 'Erro de criação', tr: 'Oluşturma hatası' }), 'err');
      return;
    }
    const emailNote = (d as { emailSent?: boolean }).emailSent ? tx(lang, { fr: ' E-mail envoyé.', ar: ' تم إرسال البريد الإلكتروني.', en: ' Email sent.', es: ' Correo enviado.', pt: ' Email enviado.', tr: ' E-posta gönderildi.' }) : '';
    showToast(tx(lang, { fr: `Invitation créée.${emailNote}`, ar: `تم إنشاء الدعوة.${emailNote}`, en: `Invitation created.${emailNote}`, es: `Invitación creada.${emailNote}`, pt: `Convite criado.${emailNote}`, tr: `Davetiye oluşturuldu.${emailNote}` }));
    if ((d as { emailError?: string }).emailError === 'smtp_not_configured' && inviteEmail.trim()) {
      showToast(tx(lang, { fr: 'SMTP non configuré (.env) — lien copiable ci-dessous.', ar: 'SMTP غير مهيأ (.env) — الرابط قابل للنسخ أدناه.', en: 'SMTP not configured (.env) — link can be copied below.', es: 'SMTP no configurado (.env) — enlace copiable abajo.', pt: 'SMTP não configurado (.env) — link copiável abaixo.', tr: 'SMTP yapılandırılmamış (.env) — bağlantı aşağıda kopyalanabilir.' }), 'err');
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
      showToast(tx(lang, { fr: 'Copié dans le presse-papiers', ar: 'تم النسخ إلى الحافظة', en: 'Copied to clipboard', es: 'Copiado al portapapeles', pt: 'Copiado para a área de transferência', tr: 'Panoya kopyalandı' }));
    } catch {
      showToast(tx(lang, { fr: 'Copie impossible', ar: 'تعذر النسخ', en: 'Copy failed', es: 'Copia imposible', pt: 'Cópia impossível', tr: 'Kopyalama başarısız' }), 'err');
    }
  };

  return (
    <div>
      {withPerson.length === 0 && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: '#FEF3C7', color: '#92400E', fontSize: 13 }}>
          {tx(lang, { fr: 'Aucun <strong>person_id</strong> encore : ouvrez chaque fiche depuis l\'annuaire (ou enregistrez un ouvrier) pour générer les liens, puis revenez ici.', ar: 'لا يوجد <strong>person_id</strong> بعد: افتح كل ملف من الدليل (أو سجّل عاملاً) لإنشاء الروابط، ثم عد إلى هنا.', en: 'No <strong>person_id</strong> yet: open each record from the directory (or register a worker) to generate links, then come back here.', es: 'Aún no hay <strong>person_id</strong>: abra cada ficha desde el directorio (o registre un operario) para generar los enlaces, luego vuelva aquí.', pt: 'Nenhum <strong>person_id</strong> ainda: abra cada ficha do diretório (ou registre um operário) para gerar os links, depois volte aqui.', tr: 'Henüz <strong>person_id</strong> yok: bağlantıları oluşturmak için her kaydı rehberden açın (veya bir işçi kaydedin), ardından buraya geri dönün.' })}
        </div>
      )}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0', marginBottom: 20, maxWidth: 720 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{tx(lang, { fr: 'Nouvelle invitation', ar: 'دعوة جديدة', en: 'New invitation', es: 'Nueva invitación', pt: 'Novo convite', tr: 'Yeni davetiye' })}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748B' }}>
          {tx(lang, { fr: 'Choisir un salarié déjà lié à un <strong>person_id</strong>, puis proposer matricule / nom pour la nouvelle fiche (ex. nouvelle usine). Le destinataire répond via le lien ou la page <code style={{ background: \'#F1F5F9\', padding: \'2px 6px\', borderRadius: 4 }}>/hr-invite.html</code>.', ar: 'اختر موظفاً مرتبطاً بالفعل بـ <strong>person_id</strong>، ثم اقترح رقماً مهنياً / اسماً للملف الجديد (مثال: مصنع جديد). يرد المستلم عبر الرابط أو الصفحة <code style={{ background: \'#F1F5F9\', padding: \'2px 6px\', borderRadius: 4 }}>/hr-invite.html</code>.', en: 'Choose an employee already linked to a <strong>person_id</strong>, then propose a registration number / name for the new record (e.g. new factory). The recipient responds via the link or the page <code style={{ background: \'#F1F5F9\', padding: \'2px 6px\', borderRadius: 4 }}>/hr-invite.html</code>.', es: 'Elija un empleado ya vinculado a un <strong>person_id</strong>, luego proponga matrícula / nombre para la nueva ficha (ej. nueva fábrica). El destinatario responde mediante el enlace o la página <code style={{ background: \'#F1F5F9\', padding: \'2px 6px\', borderRadius: 4 }}>/hr-invite.html</code>.', pt: 'Escolha um funcionário já vinculado a um <strong>person_id</strong>, depois proponha matrícula / nome para o novo registro (ex. nova fábrica). O destinatário responde através do link ou da página <code style={{ background: \'#F1F5F9\', padding: \'2px 6px\', borderRadius: 4 }}>/hr-invite.html</code>.', tr: 'Zaten bir <strong>person_id</strong>\'ye bağlı bir çalışan seçin, ardından yeni kayıt için kayıt numarası / ad önerin (örn. yeni fabrika). Alıcı, bağlantı veya <code style={{ background: \'#F1F5F9\', padding: \'2px 6px\', borderRadius: 4 }}>/hr-invite.html</code> sayfası aracılığıyla yanıt verir.' })}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={_labelStyle}>{tx(lang, { fr: 'Person ID (depuis annuaire)', ar: 'Person ID (من الدليل)', en: 'Person ID (from directory)', es: 'Person ID (del directorio)', pt: 'Person ID (do diretório)', tr: 'Person ID (rehberden)' })}</label>
            <select value={personId} onChange={e => setPersonId(e.target.value)} style={_inputStyle}>
              <option value="">{tx(lang, { fr: '— Choisir un ouvrier —', ar: '— اختر عاملاً —', en: '— Choose a worker —', es: '— Elija un operario —', pt: '— Escolha um operário —', tr: '— Bir işçi seçin —' })}</option>
              {withPerson.map(w => (
                <option key={w.id} value={w.person_id || ''}>
                  {w.full_name} · {w.matricule} · {w.person_id}
                </option>
              ))}
            </select>
          </div>
          <Field label={tx(lang, { fr: 'Matricule proposé', ar: 'الرقم المهني المقترح', en: 'Proposed registration no.', es: 'Matrícula propuesta', pt: 'Matrícula proposta', tr: 'Önerilen kayıt no' })} value={mat} onChange={setMat} placeholder="MAT-NEW-01" required />
          <Field label={tx(lang, { fr: 'Nom complet proposé', ar: 'الاسم الكامل المقترح', en: 'Proposed full name', es: 'Nombre completo propuesto', pt: 'Nome completo proposto', tr: 'Önerilen tam ad' })} value={nom} onChange={setNom} placeholder={tx(lang, { fr: 'Prénom Nom', ar: 'الاسم الأول والنسب', en: 'First Last', es: 'Nombre Apellido', pt: 'Nome Sobrenome', tr: 'Ad Soyad' })} required />
          <Field label={tx(lang, { fr: 'CIN (optionnel)', ar: 'رقم البطاقة (اختياري)', en: 'ID No. (optional)', es: 'Cédula (opcional)', pt: 'CIN (opcional)', tr: 'Kimlik No (isteğe bağlı)' })} value={cin} onChange={setCin} placeholder={tx(lang, { fr: 'Si connu', ar: 'إن وجد', en: 'If known', es: 'Si se conoce', pt: 'Se conhecido', tr: 'Biliniyorsa' })} />
          <div style={{ gridColumn: '1/-1' }}>
            <Field label={tx(lang, { fr: 'E-mail destinataire (optionnel, SMTP .env)', ar: 'البريد الإلكتروني للمستلم (اختياري، SMTP .env)', en: 'Recipient email (optional, SMTP .env)', es: 'Correo del destinatario (opcional, SMTP .env)', pt: 'E-mail do destinatário (opcional, SMTP .env)', tr: 'Alıcı e-posta (isteğe bağlı, SMTP .env)' })} value={inviteEmail} onChange={setInviteEmail} placeholder="ouvrier@example.com" />
          </div>
        </div>
        <button type="button" onClick={createInvite} style={{ ..._btnPrimary, marginTop: 16 }}>
          <Mail size={15} style={{ marginRight: 8 }} />{tx(lang, { fr: 'Créer l\'invitation', ar: 'إنشاء الدعوة', en: 'Create invitation', es: 'Crear invitación', pt: 'Criar convite', tr: 'Davetiye oluştur' })}
        </button>
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>{tx(lang, { fr: 'Historique', ar: 'السجل', en: 'History', es: 'Historial', pt: 'Histórico', tr: 'Geçmiş' })}</h3>
      {loading ? (
        <div style={{ color: '#94A3B8' }}>{tx(lang, { fr: 'Chargement…', ar: 'جارٍ التحميل…', en: 'Loading…', es: 'Cargando…', pt: 'Carregando…', tr: 'Yükleniyor…' })}</div>
      ) : list.length === 0 ? (
        <div style={{ color: '#94A3B8', fontSize: 14 }}>{tx(lang, { fr: 'Aucune invitation', ar: 'لا توجد دعوات', en: 'No invitations', es: 'Ninguna invitación', pt: 'Nenhum convite', tr: 'Davetiye yok' })}</div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {[
                  { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' },
                  { fr: 'Matricule', ar: 'الرقم المهني', en: 'Reg. No.', es: 'Matrícula', pt: 'Matrícula', tr: 'Kayıt No' },
                  { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' },
                  { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum' },
                  { fr: 'Jeton / Lien', ar: 'الرمز / الرابط', en: 'Token / Link', es: 'Token / Enlace', pt: 'Token / Link', tr: 'Token / Bağlantı' },
                ].map(h => (
                  <th key={h.fr} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 700 }}>{tx(lang, h)}</th>
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
                        <button type="button" onClick={() => copyText(link)} style={{ ..._btnSecondary, fontSize: 12, padding: '6px 10px' }}>
                          <Copy size={14} style={{ marginRight: 6 }} />{tx(lang, { fr: 'Copier le lien', ar: 'نسخ الرابط', en: 'Copy link', es: 'Copiar enlace', pt: 'Copiar link', tr: 'Bağlantıyı kopyala' })}
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
  const { lang } = useLang();
  const isDark = useIsDark();
  const _labelStyle = labelStyle(isDark);
  const _inputStyle = inputStyle(isDark);
  const _btnPrimary = btnPrimary(isDark);
  const _btnSecondary = btnSecondary(isDark);
  const _btnDanger = btnDanger(isDark);
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
        setLoadError(tx(lang, { fr: 'Session expirée ou non connecté — reconnectez-vous (Profil / Login).', ar: 'انتهت الجلسة أو غير متصل — أعد الاتصال (الملف الشخصي / تسجيل الدخول).', en: 'Session expired or not logged in — reconnect (Profile / Login).', es: 'Sesión expirada o no conectado — reconéctese (Perfil / Iniciar sesión).', pt: 'Sessão expirada ou não conectado — reconecte-se (Perfil / Login).', tr: 'Oturum süresi doldu veya giriş yapılmamış — yeniden bağlanın (Profil / Giriş).' }));
        setWorkers([]);
      } else if (!r.ok) {
        setLoadError(tx(lang, { fr: `Impossible de charger les effectifs (erreur ${r.status}).`, ar: `تعذر تحميل العمال (خطأ ${r.status}).`, en: `Unable to load staff (error ${r.status}).`, es: `No se pudo cargar el personal (error ${r.status}).`, pt: `Não foi possível carregar os efetivos (erro ${r.status}).`, tr: `Personel yüklenemedi (hata ${r.status}).` }));
        setWorkers([]);
      } else {
        setWorkers(await r.json());
        setLoadError(null);
      }
    } catch {
      setLoadError(tx(lang, { fr: 'Réseau indisponible. Vérifiez la connexion au serveur.', ar: 'الشبكة غير متاحة. تحقق من الاتصال بالخادم.', en: 'Network unavailable. Check server connection.', es: 'Red no disponible. Verifique la conexión al servidor.', pt: 'Rede indisponível. Verifique a conexão com o servidor.', tr: 'Ağ kullanılamıyor. Sunucu bağlantısını kontrol edin.' }));
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
    if (!confirm(tx(lang, { fr: `Rattacher ${claimPreview.guestCount} fiche(s) du compte invité local à votre compte actuel ?\n(Impossible d'annuler. Utilisez un compte qui n'a encore aucun ouvrier.)`, ar: `ربط ${claimPreview.guestCount} ملف من حساب الزائر المحلي بحسابك الحالي؟\n(لا يمكن التراجع. استخدم حساباً لا يملك أي عامل بعد.)`, en: `Attach ${claimPreview.guestCount} record(s) from the local guest account to your current account?\n(Cannot be undone. Use an account that has no workers yet.)`, es: `¿Vincular ${claimPreview.guestCount} ficha(s) de la cuenta de invitado local a su cuenta actual?\n(No se puede deshacer. Use una cuenta que aún no tenga operarios.)`, pt: `Vincular ${claimPreview.guestCount} registro(s) da conta convidada local à sua conta atual?\n(Não pode ser desfeito. Use uma conta que ainda não tenha operários.)`, tr: `Yerel misafir hesabındaki ${claimPreview.guestCount} kaydı mevcut hesabınıza bağlasın mı?\n(Geri alınamaz. Henüz işçisi olmayan bir hesap kullanın.)` }))) return;
    setClaiming(true);
    try {
      const r = await API('/api/hr/claim-legacy', { method: 'POST' });
      const data = r.ok ? await r.json() : null;
      if (r.ok && data?.migrated != null) {
        showToast(tx(lang, { fr: `${data.migrated} fiche(s) rattachée(s)`, ar: `تم ربط ${data.migrated} ملف`, en: `${data.migrated} record(s) attached`, es: `${data.migrated} ficha(s) vinculada(s)`, pt: `${data.migrated} registro(s) vinculado(s)`, tr: `${data.migrated} kayıt bağlandı` }));
        await fetchWorkers();
        await fetchClaimPreview();
      } else {
        const err = await r.json().catch(() => ({}));
        showToast((err as { message?: string })?.message || tx(lang, { fr: 'Rattachement impossible', ar: 'تعذر الربط', en: 'Attachment impossible', es: 'Vinculación imposible', pt: 'Vinculação impossível', tr: 'Bağlanamadı' }), 'err');
      }
    } finally {
      setClaiming(false);
    }
  };

  const handleDeleteLigne = async (id: string, name: string) => {
    if (!confirm(tx(lang, { fr: `Supprimer la ligne de transport "${name}" ?\n(Tous les travailleurs liés seront automatiquement désassignés)`, ar: `حذف خط النقل "${name}"؟\n(سيتم إلغاء تعيين جميع العمال المرتبطين بهذا الخط تلقائياً)`, en: `Delete transport line "${name}"?\n(All linked workers will be automatically unassigned)`, es: `¿Eliminar la línea de transporte "${name}"?\n(Todos los trabajadores vinculados serán desasignados automáticamente)`, pt: `Excluir linha de transporte "${name}"?\n(Todos os trabalhadores vinculados serão automaticamente desatribuídos)`, tr: `"${name}" ulaşım hattı silinsin mi?\n(Tüm bağlı işçiler otomatik olarak atamadan çıkarılacak)` }))) return;
    try {
      const r = await API(`/api/hr/transport-lignes/${id}`, { method: 'DELETE' });
      if (r.ok) {
        showToast(tx(lang, { fr: 'Ligne de transport supprimée', ar: 'تم حذف خط النقل بنجاح', en: 'Transport line deleted', es: 'Línea de transporte eliminada', pt: 'Linha de transporte excluída', tr: 'Ulaşım hattı silindi' }));
        fetchTransportLignes();
        fetchWorkers();
      } else {
        showToast(tx(lang, { fr: 'Erreur lors de la suppression', ar: 'حدث خطأ أثناء الحذف', en: 'Error while deleting', es: 'Error al eliminar', pt: 'Erro ao excluir', tr: 'Silme sırasında hata' }), 'err');
      }
    } catch (e) {
      console.error(e);
      showToast(tx(lang, { fr: 'Erreur de connexion au serveur', ar: 'خطأ في الاتصال بالخادم', en: 'Server connection error', es: 'Error de conexión al servidor', pt: 'Erro de conexão com o servidor', tr: 'Sunucu bağlantı hatası' }), 'err');
    }
  };

  const handleSaveLigne = async () => {
    if (!selectedLigne?.nom) {
      alert(tx(lang, { fr: 'Nom de la ligne requis', ar: 'اسم الخط مطلوب', en: 'Line name required', es: 'Nombre de la línea requerido', pt: 'Nome da linha obrigatório', tr: 'Hat adı gerekli' }));
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
        showToast(tx(lang, { fr: 'Ligne de transport enregistrée', ar: 'تم حفظ خط النقل', en: 'Transport line saved', es: 'Línea de transporte guardada', pt: 'Linha de transporte salva', tr: 'Ulaşım hattı kaydedildi' }));
        setShowLigneModal(false);
        fetchTransportLignes();
      } else {
        showToast(tx(lang, { fr: 'Erreur lors de l\'enregistrement', ar: 'خطأ أثناء الحفظ', en: 'Error while saving', es: 'Error al guardar', pt: 'Erro ao salvar', tr: 'Kaydetme hatası' }), 'err');
      }
    } catch (e) {
      console.error(e);
      showToast(tx(lang, { fr: 'Erreur de connexion au serveur', ar: 'خطأ في الاتصال بالخادم', en: 'Server connection error', es: 'Error de conexión al servidor', pt: 'Erro de conexão com o servidor', tr: 'Sunucu bağlantı hatası' }), 'err');
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

    const text = tx(lang, { fr: `*RECENSEMENT TRANSPORT - HEURES SUPPLEMENTAIRES*\nDate: ${filterTransportDate}\n\n*Résumé par Équipe (Parda):*\n${pardaText || 'Aucun.'}\n*Total passagers:* ${selected.length} personnes\n\n*Détail par Ligne de Transport:*${lineText || '\nAucun passager.'}`, ar: `*حصر النقل - ساعات إضافية*\nالتاريخ: ${filterTransportDate}\n\n*ملخص حسب الفريق:*\n${pardaText || 'لا يوجد.'}\n*إجمالي الركاب:* ${selected.length} شخص\n\n*تفاصيل حسب خط النقل:*${lineText || '\nلا يوجد ركاب.'}`, en: `*TRANSPORT CENSUS - OVERTIME*\nDate: ${filterTransportDate}\n\n*Summary by Team (Parda):*\n${pardaText || 'None.'}\n*Total passengers:* ${selected.length} people\n\n*Detail by Transport Line:*${lineText || '\nNo passengers.'}`, es: `*CENSO DE TRANSPORTE - HORAS EXTRAS*\nFecha: ${filterTransportDate}\n\n*Resumen por Equipo (Parda):*\n${pardaText || 'Ninguno.'}\n*Total pasajeros:* ${selected.length} personas\n\n*Detalle por Línea de Transporte:*${lineText || '\nNingún pasajero.'}`, pt: `*RECENSEAMENTO DE TRANSPORTE - HORAS EXTRAS*\nData: ${filterTransportDate}\n\n*Resumo por Equipe (Parda):*\n${pardaText || 'Nenhum.'}\n*Total passageiros:* ${selected.length} pessoas\n\n*Detalhe por Linha de Transporte:*${lineText || '\nNenhum passageiro.'}`, tr: `*ULAŞIM SAYIMI - FAZLA MESAİ*\nTarih: ${filterTransportDate}\n\n*Takıma Göre Özet (Parda):*\n${pardaText || 'Yok.'}\n*Toplam yolcu:* ${selected.length} kişi\n\n*Ulaşım Hattına Göre Detay:*${lineText || '\nYolcu yok.'}` });

    navigator.clipboard.writeText(text);
    showToast(tx(lang, { fr: 'Récapitulatif copié pour WhatsApp !', ar: 'تم نسخ الملخص لـ WhatsApp!', en: 'Summary copied for WhatsApp!', es: '¡Resumen copiado para WhatsApp!', pt: 'Resumo copiado para WhatsApp!', tr: 'Özet WhatsApp için kopyalandı!' }));
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
      showToast(d.message || tx(lang, { fr: `Enregistrement pointage impossible (${r.status})`, ar: `تعذر حفظ تسجيل الحضور (${r.status})`, en: `Cannot save time log (${r.status})`, es: `No se pudo guardar el registro (${r.status})`, pt: `Não foi possível salvar o registro (${r.status})`, tr: `Süre kaydı kaydedilemedi (${r.status})` }), 'err');
    }
  };

  /** Clic sur un créneau : enregistre la grille + recalcule entrée / sortie / pause sur le serveur. */
  const savePointageGrille = useCallback(
    async (workerId: string, currentRow: any | undefined, slotIndex: number) => {
      const st = ((currentRow?.statut as HRPointageStatus) || 'PRESENT') as HRPointageStatus;
      if (st === 'ABSENT' || ABSENCE_LIKE.includes(st)) {
        showToast(tx(lang, { fr: 'Passez le statut à « Présent » ou « Retard » pour modifier la grille horaire.', ar: 'غيّر الحالة إلى "حاضر" أو "متأخر" لتعديل جدول الساعات.', en: 'Change the status to "Present" or "Late" to edit the time grid.', es: 'Cambie el estado a "Presente" o "Tarde" para modificar la cuadrícula horaria.', pt: 'Altere o status para "Presente" ou "Atrasado" para modificar a grade de horários.', tr: 'Saat tablosunu düzenlemek için durumu "Mevcut" veya "Geç" olarak değiştirin.' }), 'err');
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
        showToast(d.message || tx(lang, { fr: `Enregistrement grille impossible (${r.status})`, ar: `تعذر حفظ الجدول (${r.status})`, en: `Cannot save grid (${r.status})`, es: `No se pudo guardar la cuadrícula (${r.status})`, pt: `Não foi possível salvar a grade (${r.status})`, tr: `Tablo kaydedilemedi (${r.status})` }), 'err');
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
      showToast(tx(lang, { fr: 'Export Sage CSV généré avec succès', ar: 'تم إنشاء تصدير Sage CSV بنجاح', en: 'Sage CSV export generated successfully', es: 'Exportación Sage CSV generada con éxito', pt: 'Exportação Sage CSV gerada com sucesso', tr: 'Sage CSV dışa aktarımı başarıyla oluşturuldu' }));
      fetchSage();
    } else {
      showToast(tx(lang, { fr: 'Erreur génération Sage', ar: 'خطأ في إنشاء Sage', en: 'Sage generation error', es: 'Error de generación Sage', pt: 'Erro de geração Sage', tr: 'Sage oluşturma hatası' }), 'err');
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
      if (!previewRes.ok) { showToast(tx(lang, { fr: 'Erreur récupération données', ar: 'خطأ في استرجاع البيانات', en: 'Data retrieval error', es: 'Error al recuperar datos', pt: 'Erro ao recuperar dados', tr: 'Veri alma hatası' }), 'err'); return; }
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
      showToast(tx(lang, { fr: 'Export Excel RH généré avec succès', ar: 'تم إنشاء تصدير Excel للموارد البشرية بنجاح', en: 'HR Excel export generated successfully', es: 'Exportación Excel RH generada con éxito', pt: 'Exportação Excel RH gerada com sucesso', tr: 'İK Excel dışa aktarımı başarıyla oluşturuldu' }));
    } catch { showToast(tx(lang, { fr: 'Erreur export Excel', ar: 'خطأ في تصدير Excel', en: 'Excel export error', es: 'Error de exportación Excel', pt: 'Erro de exportação Excel', tr: 'Excel dışa aktarma hatası' }), 'err'); }
  };

  // ── Avance statut ──
  const handleAvanceStatut = async (id: string, statut: string) => {
    const r = await API(`/api/hr/avances/${id}/statut`, { method: 'PUT', body: JSON.stringify({ statut }) });
    if (r.ok) { showToast(tx(lang, { fr: 'Statut mis à jour', ar: 'تم تحديث الحالة', en: 'Status updated', es: 'Estado actualizado', pt: 'Status atualizado', tr: 'Durum güncellendi' })); fetchAvances(); }
    else showToast(tx(lang, { fr: 'Erreur', ar: 'خطأ', en: 'Error', es: 'Error', pt: 'Erro', tr: 'Hata' }), 'err');
  };

  // ── Delete worker ──
  const handleDeleteWorker = async (id: string, name: string) => {
    if (!confirm(tx(lang, { fr: `Supprimer ${name} ?`, ar: `حذف ${name}؟`, en: `Delete ${name}?`, es: `¿Eliminar ${name}?`, pt: `Excluir ${name}?`, tr: `${name} silinsin mi?` }))) return;
    const r = await API(`/api/hr/workers/${id}`, { method: 'DELETE' });
    if (r.ok) { showToast(tx(lang, { fr: 'Ouvrier supprimé', ar: 'تم حذف العامل', en: 'Worker deleted', es: 'Operario eliminado', pt: 'Operário excluído', tr: 'İşçi silindi' })); fetchWorkers(); }
    else showToast(tx(lang, { fr: 'Erreur suppression', ar: 'خطأ في الحذف', en: 'Deletion error', es: 'Error de eliminación', pt: 'Erro de exclusão', tr: 'Silme hatası' }), 'err');
  };

  const TABS = [
    { id: 'annuaire',      label: tx(lang, { fr: 'Annuaire', ar: 'الدليل', en: 'Directory', es: 'Directorio', pt: 'Diretório', tr: 'Rehber' }),       icon: <Users size={15} /> },
    { id: 'pointage',      label: tx(lang, { fr: 'Pointage', ar: 'تسجيل الحضور', en: 'Time Log', es: 'Registro', pt: 'Registro', tr: 'Süre Kaydı' }),       icon: <Clock size={15} /> },
    { id: 'statistiques',  label: tx(lang, { fr: 'Statistiques', ar: 'إحصائيات', en: 'Statistics', es: 'Estadísticas', pt: 'Estatísticas', tr: 'İstatistikler' }),   icon: <PieChart size={15} /> },
    { id: 'production',    label: tx(lang, { fr: 'Production', ar: 'الإنتاج', en: 'Production', es: 'Producción', pt: 'Produção', tr: 'Üretim' }),     icon: <BarChart2 size={15} /> },
    { id: 'avances',       label: tx(lang, { fr: 'Avances', ar: 'السلف', en: 'Advances', es: 'Anticipos', pt: 'Adiantamentos', tr: 'Avanslar' }),        icon: <DollarSign size={15} /> },
    { id: 'transport',     label: tx(lang, { fr: 'Transport', ar: 'النقل', en: 'Transport', es: 'Transporte', pt: 'Transporte', tr: 'Ulaşım' }),      icon: <Truck size={15} /> },
    { id: 'sage',          label: tx(lang, { fr: 'Sage Paie', ar: 'Sage للرواتب', en: 'Sage Payroll', es: 'Sage Nómina', pt: 'Sage Folha', tr: 'Sage Maaş' }),      icon: <FileText size={15} /> },
    { id: 'invitations',   label: tx(lang, { fr: 'Invitations', ar: 'دعوات', en: 'Invitations', es: 'Invitaciones', pt: 'Convites', tr: 'Davetiyeler' }),    icon: <Mail size={15} /> },
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
            onSave={() => { fetchWorkers(); showToast(tx(lang, { fr: 'Ouvrier sauvegardé', ar: 'تم حفظ العامل', en: 'Worker saved', es: 'Operario guardado', pt: 'Operário salvo', tr: 'İşçi kaydedildi' })); }}
            transportLignes={transportLignes}
          />
        )}
      </AnimatePresence>

      {/* ── HEADER ── */}
      <div className="gestion-rh-head-compact" style={{ background: isDark ? '#1D2E28' : '#fff', borderBottom: isDark ? '1px solid #2E463C' : '1px solid #E2E8F0', padding: '16px 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={tx(lang, { fr: 'Retour au tableau de bord', ar: 'العودة إلى لوحة القيادة', en: 'Back to dashboard', es: 'Volver al panel', pt: 'Voltar ao painel', tr: 'Panoya dön' })}
                title={tx(lang, { fr: 'Retour au tableau de bord', ar: 'العودة إلى لوحة القيادة', en: 'Back to dashboard', es: 'Volver al panel', pt: 'Voltar ao painel', tr: 'Panoya dön' })}
                style={{
                  minHeight: 44,
                  padding: '0 14px 0 10px',
                  borderRadius: 12,
                  border: '1px solid #E2E8F0',
                  background: isDark ? '#14211C' : '#F8FAFC',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  color: isDark ? '#94A3B8' : '#475569',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                <ChevronLeft size={22} strokeWidth={2.5} aria-hidden />
                <span>{tx(lang, { fr: 'Accueil', ar: 'الرئيسية', en: 'Home', es: 'Inicio', pt: 'Início', tr: 'Ana Sayfa' })}</span>
              </button>
            )}
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #2149C1, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={22} color="#fff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: isDark ? '#EAF1ED' : '#0F172A' }}>{tx(lang, { fr: 'Gestion RH', ar: 'إدارة الموارد البشرية', en: 'HR Management', es: 'Gestión RH', pt: 'Gestão RH', tr: 'İK Yönetimi' })}</h1>
              <p style={{ margin: 0, fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>
                {loading
                  ? tx(lang, { fr: 'Chargement des effectifs…', ar: 'جارٍ تحميل العمال…', en: 'Loading staff…', es: 'Cargando personal…', pt: 'Carregando efetivos…', tr: 'Personel yükleniyor…' })
                  : loadError
                    ? tx(lang, { fr: '—', ar: '—', en: '—', es: '—', pt: '—', tr: '—' })
                    : tx(lang, { fr: `${workers.length} ouvrier${workers.length !== 1 ? 's' : ''} enregistré${workers.length !== 1 ? 's' : ''}`, ar: `${workers.length} عامل مسجل`, en: `${workers.length} worker${workers.length !== 1 ? 's' : ''} registered`, es: `${workers.length} operario${workers.length !== 1 ? 's' : ''} registrado${workers.length !== 1 ? 's' : ''}`, pt: `${workers.length} operário${workers.length !== 1 ? 's' : ''} registrado${workers.length !== 1 ? 's' : ''}`, tr: `${workers.length} işçi kayıtlı` })}
              </p>
            </div>
          </div>
          {tab === 'annuaire' && (
            <button onClick={() => { setEditWorker(null); setShowWorkerModal(true); }} style={_btnPrimary}>
              <UserPlus size={15} style={{ marginRight: 8 }} />{tx(lang, { fr: 'Ajouter Ouvrier', ar: 'إضافة عامل', en: 'Add Worker', es: 'Añadir Operario', pt: 'Adicionar Operário', tr: 'İşçi Ekle' })}
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
              {(() => { const msg = tx(lang, { fr: `<strong>${claimPreview.guestCount} ouvrier${claimPreview.guestCount !== 1 ? 's' : ''}</strong> enregistré${claimPreview.guestCount !== 1 ? 's' : ''} sur l’ancien compte invité (fiches locales). Votre compte n’en a pas encore : vous pouvez tout rattacher pour que le comptage soit <strong>réel</strong> ici.`, ar: `<strong>${claimPreview.guestCount} عامل</strong> مسجل على حساب الزائر القديم (ملفات محلية). حسابك لا يملك أي عامل بعد: يمكنك ربط الكل ليكون العدد <strong>حقيقياً</strong> هنا.`, en: `<strong>${claimPreview.guestCount} worker${claimPreview.guestCount !== 1 ? 's' : ''}</strong> recorded on the old guest account (local records). Your account doesn't have any yet: you can attach them all so the count is <strong>real</strong> here.`, es: `<strong>${claimPreview.guestCount} operario${claimPreview.guestCount !== 1 ? 's' : ''}</strong> registrado${claimPreview.guestCount !== 1 ? 's' : ''} en la cuenta de invitado anterior (fichas locales). Su cuenta aún no tiene ninguno: puede vincularlos todos para que el recuento sea <strong>real</strong> aquí.`, pt: `<strong>${claimPreview.guestCount} operário${claimPreview.guestCount !== 1 ? 's' : ''}</strong> registrado${claimPreview.guestCount !== 1 ? 's' : ''} na conta de convidado antiga (registros locais). Sua conta ainda não tem nenhum: você pode vincular todos para que a contagem seja <strong>real</strong> aqui.`, tr: `Eski misafir hesabında kayıtlı <strong>${claimPreview.guestCount} işçi</strong> (yerel kayıtlar). Hesabınızda henüz yok: sayının <strong>gerçek</strong> olması için hepsini bağlayabilirsiniz.` }); return <span dangerouslySetInnerHTML={{ __html: msg }} />; })()}
            </div>
            <button
              type="button"
              onClick={handleClaimFromGuest}
              disabled={claiming}
              style={{ ..._btnPrimary, whiteSpace: 'nowrap', opacity: claiming ? 0.7 : 1 }}
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
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: isDark ? '#64748B' : '#94A3B8' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tx(lang, { fr: 'Chercher par nom, matricule, CIN...', ar: 'ابحث بالاسم، الرقم المهني، رقم البطاقة...', en: 'Search by name, reg. no., ID...', es: 'Buscar por nombre, matrícula, cédula...', pt: 'Pesquisar por nome, matrícula, CIN...', tr: 'İsim, kayıt no, kimlik ile ara...' })}
                      style={{ ..._inputStyle, paddingLeft: 32, width: '100%' }} />
                  </div>
                  <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ ..._inputStyle, width: 160 }}>
                    <option value="">{tx(lang, { fr: 'Tous les rôles', ar: 'جميع الأدوار', en: 'All roles', es: 'Todos los roles', pt: 'Todos os cargos', tr: 'Tüm roller' })}</option>
                    {ROLES.map(r => <option key={r} value={r}>{tx(lang, ROLE_LABELS[r])}</option>)}
                  </select>
                  <select value={filterChaine} onChange={e => setFilterChaine(e.target.value)} style={{ ..._inputStyle, width: 160 }}>
                    <option value="">{tx(lang, { fr: 'Toutes les chaînes', ar: 'جميع الخطوط', en: 'All lines', es: 'Todas las líneas', pt: 'Todas as linhas', tr: 'Tüm hatlar' })}</option>
                    {pointageChaineOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? '#64748B' : '#94A3B8', textTransform: 'uppercase' }}>{tx(lang, { fr: 'Affichage', ar: 'العرض', en: 'View', es: 'Vista', pt: 'Exibição', tr: 'Görünüm' })}</span>
                      <button
                        type="button"
                        onClick={() => setAnnuaireViewPersist('cards')}
                        title={tx(lang, { fr: 'Vue cartes', ar: 'عرض البطاقات', en: 'Card view', es: 'Vista tarjetas', pt: 'Visualização em cartões', tr: 'Kart görünümü' })}
                        style={{
                          ..._btnSecondary,
                          padding: '7px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          background: annuaireView === 'cards' ? '#EEF2FF' : '#fff',
                          borderColor: annuaireView === 'cards' ? '#C7D2FE' : isDark ? '#2E463C' : '#E2E8F0',
                          color: annuaireView === 'cards' ? '#2149C1' : '#64748B',
                        }}
                      >
                        <LayoutGrid size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {tx(lang, { fr: 'Cartes', ar: 'بطاقات', en: 'Cards', es: 'Tarjetas', pt: 'Cartões', tr: 'Kartlar' })}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnnuaireViewPersist('table')}
                        title={tx(lang, { fr: 'Vue liste / tableau', ar: 'عرض القائمة / الجدول', en: 'List / Table view', es: 'Vista lista / tabla', pt: 'Visualização em lista / tabela', tr: 'Liste / Tablo görünümü' })}
                        style={{
                          ..._btnSecondary,
                          padding: '7px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          background: annuaireView === 'table' ? '#EEF2FF' : '#fff',
                          borderColor: annuaireView === 'table' ? '#C7D2FE' : isDark ? '#2E463C' : '#E2E8F0',
                          color: annuaireView === 'table' ? '#2149C1' : '#64748B',
                        }}
                      >
                        <Table2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {tx(lang, { fr: 'Liste', ar: 'قائمة', en: 'List', es: 'Lista', pt: 'Lista', tr: 'Liste' })}
                      </button>
                  </div>
                </div>

                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60, color: isDark ? '#64748B' : '#94A3B8' }}>{tx(lang, { fr: 'Chargement...', ar: 'جارٍ التحميل...', en: 'Loading...', es: 'Cargando...', pt: 'Carregando...', tr: 'Yükleniyor...' })}</div>
                ) : annuaireView === 'table' ? (
                  <div style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 14, border: isDark ? '1px solid #2E463C' : '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 880 }}>
                        <thead>
                          <tr style={{ background: isDark ? '#14211C' : '#F8FAFC', borderBottom: isDark ? '2px solid #2E463C' : '2px solid #E2E8F0' }}>
                            {[
                              { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' },
                              { fr: 'Matricule', ar: 'الرقم المهني', en: 'Reg. No.', es: 'Matrícula', pt: 'Matrícula', tr: 'Kayıt No' },
                              { fr: 'CIN', ar: 'رقم البطاقة', en: 'ID No.', es: 'Cédula', pt: 'CIN', tr: 'Kimlik No' },
                              { fr: 'Rôle', ar: 'الدور', en: 'Role', es: 'Rol', pt: 'Função', tr: 'Rol' },
                              { fr: 'Chaîne', ar: 'الخط', en: 'Line', es: 'Línea', pt: 'Linha', tr: 'Hat' },
                              { fr: 'Parda', ar: 'الوردية', en: 'Shift', es: 'Turno', pt: 'Turno', tr: 'Vardiya' },
                              { fr: 'Quartier', ar: 'الحي', en: 'District', es: 'Barrio', pt: 'Bairro', tr: 'Mahalle' },
                              { fr: 'Poste', ar: 'المنصب', en: 'Position', es: 'Puesto', pt: 'Posto', tr: 'Pozisyon' },
                              { fr: 'Contrat', ar: 'العقد', en: 'Contract', es: 'Contrato', pt: 'Contrato', tr: 'Sözleşme' },
                              { fr: 'Tél.', ar: 'الهاتف', en: 'Phone', es: 'Tel.', pt: 'Tel.', tr: 'Tel' },
                              { fr: 'Actions', ar: 'الإجراءات', en: 'Actions', es: 'Acciones', pt: 'Ações', tr: 'İşlemler' },
                            ].map(h => (
                              <th key={h.fr} style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{tx(lang, h)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredWorkers.map(w => {
                            const roleK = (w.role && ROLES.includes(w.role as HRWorkerRole) ? w.role : 'OPERATOR') as HRWorkerRole;
                            return (
                              <tr key={w.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '10px 12px', fontWeight: 700, color: isDark ? '#EAF1ED' : '#0F172A', maxWidth: 200 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: w.photo ? 'transparent' : ROLE_COLORS[roleK] + '25', border: `1px solid ${ROLE_COLORS[roleK]}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, color: ROLE_COLORS[roleK] }}>
                                      {w.photo ? <img src={w.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (w.full_name || '?')[0]}
                                    </div>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.full_name}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '10px 12px', color: isDark ? '#94A3B8' : '#475569', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{w.matricule}</td>
                                <td style={{ padding: '10px 12px', color: isDark ? '#94A3B8' : '#475569', fontSize: 12 }}>{w.cin || '—'}</td>
                                <td style={{ padding: '10px 12px' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: ROLE_COLORS[roleK] + '18', color: ROLE_COLORS[roleK] }}>{tx(lang, ROLE_LABELS[roleK])}</span>
                                </td>
                                <td style={{ padding: '10px 12px', color: isDark ? '#94A3B8' : '#475569' }}>{w.chaine_id || '—'}</td>
                                <td style={{ padding: '10px 12px', color: isDark ? '#94A3B8' : '#475569' }}>{w.equipe || '—'}</td>
                                <td style={{ padding: '10px 12px', color: isDark ? '#94A3B8' : '#475569' }}>{w.transport_ligne_quartier || w.transport_ligne_nom || '—'}</td>
                                <td style={{ padding: '10px 12px', color: isDark ? '#94A3B8' : '#475569', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.poste || '—'}</td>
                                <td style={{ padding: '10px 12px', color: isDark ? '#94A3B8' : '#475569' }}>{w.type_contrat || '—'}</td>
                                <td style={{ padding: '10px 12px', color: isDark ? '#94A3B8' : '#475569', whiteSpace: 'nowrap' }}>
                                  {w.phone ? (
                                    <a href={`tel:${w.phone}`} style={{ color: isDark ? '#818cf8' : '#2149C1', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      <Phone size={12} />
                                      {w.phone}
                                    </a>
                                  ) : '—'}
                                </td>
                                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                  <button type="button" onClick={() => setProfileWorkerId(w.id)} style={{ ..._btnPrimary, display: 'inline-flex', padding: '5px 10px', fontSize: 11, marginRight: 6 }}><IdCard size={11} style={{ marginRight: 4 }} />{tx(lang, { fr: 'Fiche', ar: 'ملف', en: 'Profile', es: 'Ficha', pt: 'Ficha', tr: 'Profil' })}</button>
                                  <button type="button" onClick={() => { setEditWorker(w); setShowWorkerModal(true); }} style={{ ..._btnSecondary, display: 'inline-flex', padding: '5px 10px', fontSize: 11, marginRight: 6 }}><Edit3 size={11} style={{ marginRight: 4 }} />{tx(lang, { fr: 'Édit.', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })}</button>
                                  <button type="button" onClick={() => handleDeleteWorker(w.id, w.full_name)} style={{ ..._btnDanger, display: 'inline-flex', padding: '5px 8px', fontSize: 11 }}><Trash2 size={11} /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {filteredWorkers.length === 0 && !loadError && (
                      <div style={{ textAlign: 'center', padding: 48, color: isDark ? '#64748B' : '#94A3B8' }}>
                        <Users size={40} style={{ marginBottom: 10, opacity: 0.3 }} />
                        <div style={{ fontWeight: 600 }}>
                          {workers.length > 0 ? tx(lang, { fr: 'Aucun ouvrier ne correspond aux filtres', ar: 'لا يوجد عامل يطابق معايير البحث', en: 'No worker matches the filters', es: 'Ningún operario coincide con los filtros', pt: 'Nenhum operário corresponde aos filtros', tr: 'Filtrelere uygun işçi yok' }) : tx(lang, { fr: 'Aucun ouvrier enregistré pour ce compte', ar: 'لا يوجد عامل مسجل لهذا الحساب', en: 'No worker registered for this account', es: 'Ningún operario registrado para esta cuenta', pt: 'Nenhum operário registrado para esta conta', tr: 'Bu hesap için kayıtlı işçi yok' })}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 4, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                          {workers.length > 0
                            ? tx(lang, { fr: 'Modifiez la recherche ou le filtre « Tous les rôles ».', ar: 'غيّر معايير البحث أو فلتر "جميع الأدوار".', en: 'Change the search or the "All roles" filter.', es: 'Modifique la búsqueda o el filtro "Todos los roles".', pt: 'Modifique a pesquisa ou o filtro "Todos os cargos".', tr: 'Aramayı veya "Tüm roller" filtresini değiştirin.' })
                            : tx(lang, { fr: 'Les fiches sont liées à l\'utilisateur connecté. Connectez-vous avec le compte qui a créé les données, ou cliquez sur « Ajouter Ouvrier ».', ar: 'الملفات مرتبطة بالمستخدم المتصل. سجّل الدخول بالحساب الذي أنشأ البيانات، أو انقر على "إضافة عامل".', en: 'Records are linked to the logged-in user. Log in with the account that created the data, or click "Add Worker".', es: 'Las fichas están vinculadas al usuario conectado. Inicie sesión con la cuenta que creó los datos, o haga clic en "Añadir Operario".', pt: 'Os registros estão vinculados ao usuário conectado. Faça login com a conta que criou os dados, ou clique em "Adicionar Operário".', tr: 'Kayıtlar, giriş yapmış kullanıcıya bağlıdır. Verileri oluşturan hesapla giriş yapın veya "İşçi Ekle"ye tıklayın.' })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                    {filteredWorkers.map(w => {
                      const roleK = (w.role && ROLES.includes(w.role as HRWorkerRole) ? w.role : 'OPERATOR') as HRWorkerRole;
                      return (
                      <div key={w.id} style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #F1F5F9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                          <div style={{ width: 48, height: 48, borderRadius: '50%', background: w.photo ? 'transparent' : ROLE_COLORS[roleK] + '20', border: `2px solid ${ROLE_COLORS[roleK]}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {w.photo
                              ? <img src={w.photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                              : <span style={{ fontSize: 18, fontWeight: 800, color: ROLE_COLORS[roleK] }}>{(w.full_name || '?')[0]}</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: isDark ? '#EAF1ED' : '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.full_name}</div>
                            <div style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8' }}>{w.matricule} • {w.cin || '—'}</div>
                          </div>
                          <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: ROLE_COLORS[roleK] + '20', color: ROLE_COLORS[roleK], flexShrink: 0 }}>
                            {tx(lang, ROLE_LABELS[roleK])}
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
                                <a href={`tel:${w.phone}`} style={{ color: isDark ? '#818cf8' : '#2149C1', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Phone size={11} /> {w.phone}
                                </a>
                              ) : '—',
                              fullWidth: true
                            },
                          ].map(i => (
                            <div key={i.label} style={{ background: isDark ? '#14211C' : '#F8FAFC', borderRadius: 6, padding: '6px 8px', gridColumn: i.fullWidth ? '1 / -1' : undefined }}>
                              <div style={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: 10 }}>{i.label}</div>
                              <div style={{ fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => setProfileWorkerId(w.id)}
                            style={{ ..._btnPrimary, flex: 1, justifyContent: 'center', fontSize: 12, padding: '7px 10px' }}>
                            <IdCard size={12} style={{ marginRight: 4 }} />{tx(lang, { fr: 'Fiche', ar: 'ملف', en: 'Profile', es: 'Ficha', pt: 'Ficha', tr: 'Profil' })}
                          </button>
                          <button onClick={() => { setEditWorker(w); setShowWorkerModal(true); }}
                            style={{ ..._btnSecondary, flex: 1, justifyContent: 'center', fontSize: 12, padding: '7px 10px' }}>
                            <Edit3 size={12} style={{ marginRight: 4 }} />{tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })}
                          </button>
                          <button onClick={() => handleDeleteWorker(w.id, w.full_name)}
                            style={{ ..._btnDanger, padding: '7px 10px', fontSize: 12 }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                    })}
                    {filteredWorkers.length === 0 && !loadError && (
                      <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: isDark ? '#64748B' : '#94A3B8' }}>
                        <Users size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
                        <div style={{ fontWeight: 600 }}>
                          {workers.length > 0 ? tx(lang, { fr: 'Aucun ouvrier ne correspond aux filtres', ar: 'لا يوجد عامل يطابق معايير البحث', en: 'No worker matches the filters', es: 'Ningún trabajador coincide con los filtros', pt: 'Nenhum trabalhador corresponde aos filtros', tr: 'Filtrelere uygun işçi yok' }) : tx(lang, { fr: 'Aucun ouvrier enregistré pour ce compte', ar: 'لا يوجد عامل مسجل لهذا الحساب', en: 'No worker registered for this account', es: 'Ningún trabajador registrado para esta cuenta', pt: 'Nenhum trabalhador registrado para esta conta', tr: 'Bu hesap için kayıtlı işçi yok' })}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 4, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                          {workers.length > 0
                            ? tx(lang, { fr: 'Modifiez la recherche ou le filtre « Tous les rôles ».', ar: 'عدّل البحث أو الفلتر "جميع الأدوار".', en: 'Modify the search or the "All roles" filter.', es: 'Modifique la búsqueda o el filtro "Todos los roles".', pt: 'Modifique a pesquisa ou o filtro "Todos os cargos".', tr: 'Aramayı veya "Tüm Roller" filtresini değiştirin.' })
                            : tx(lang, { fr: 'Les fiches sont liées à l\'utilisateur connecté. Connectez-vous avec le compte qui a créé les données, ou cliquez sur « Ajouter Ouvrier ».', ar: 'الملفات مرتبطة بالمستخدم الحالي. سجّل الدخول بالحساب الذي أنشأ البيانات، أو انقر على "إضافة عامل".', en: 'Records are linked to the logged-in user. Log in with the account that created the data, or click "Add Worker".', es: 'Los registros están vinculados al usuario conectado. Inicie sesión con la cuenta que creó los datos, o haga clic en "Agregar Operario".', pt: 'Os registros estão vinculados ao usuário conectado. Faça login com a conta que criou os dados ou clique em "Adicionar Operário".', tr: 'Kayıtlar, oturum açmış kullanıcıya bağlıdır. Verileri oluşturan hesapla oturum açın veya "İşçi Ekle"ye tıklayın.' })}
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
                    <div title={tx(lang, { fr: 'Journée de pointage', ar: 'يوم التسجيل', en: 'Attendance day', es: 'Día de registro', pt: 'Dia de registo', tr: 'Yoklama günü' })} style={{ background: isDark ? '#1D2E28' : '#fff', padding: '4px 8px', borderRadius: '8px', border: '1px solid #f1f5f9', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '6px', minHeight: 32 }}>
                      <Calendar size={14} color="#4f46e5" style={{ flexShrink: 0 }} />
                      <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                        style={{ border: 'none', padding: 0, fontSize: '12px', fontWeight: 800, color: isDark ? '#EAF1ED' : '#1E293B', width: '100%', minWidth: 0, cursor: 'pointer', outline: 'none' }} />
                      <button type="button" onClick={fetchPointage} style={{ ..._btnSecondary, padding: '4px', borderRadius: '6px', flexShrink: 0 }} title="Actualiser">
                        <RefreshCw size={13} />
                      </button>
                    </div>

                    <div
                      className="kpi-card"
                      title={tx(lang, { fr: `Présents : ${pointageFilterStats.presents} sur ${pointageTableWorkers.length} ouvriers`, ar: `الحاضرون: ${pointageFilterStats.presents} من ${pointageTableWorkers.length} عامل`, en: `Present: ${pointageFilterStats.presents} out of ${pointageTableWorkers.length} workers`, es: `Presentes: ${pointageFilterStats.presents} de ${pointageTableWorkers.length} operarios`, pt: `Presentes: ${pointageFilterStats.presents} de ${pointageTableWorkers.length} operários`, tr: `Mevcut: ${pointageFilterStats.presents}/${pointageTableWorkers.length} işçi` })}
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '4px 8px', borderRadius: '8px', boxShadow: '0 2px 8px -2px rgba(16,185,129,0.35)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', minHeight: 32 }}
                    >
                      <CheckCircle size={15} style={{ flexShrink: 0, opacity: 0.95 }} />
                      <span style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.04em', opacity: 0.92 }}>PRÉS.</span>
                      <span style={{ fontSize: '17px', fontWeight: 900, lineHeight: 1 }}>{pointageFilterStats.presents}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 900, lineHeight: 1 }}>{pointageTableWorkers.length > 0 ? Math.round((pointageFilterStats.presents / pointageTableWorkers.length) * 100) : 0}%</span>
                    </div>

                    <div
                      className="kpi-card"
                      title={tx(lang, { fr: `Absents : ${pointageFilterStats.absents} sur ${pointageTableWorkers.length} ouvriers`, ar: `الغائبون: ${pointageFilterStats.absents} من ${pointageTableWorkers.length} عامل`, en: `Absent: ${pointageFilterStats.absents} out of ${pointageTableWorkers.length} workers`, es: `Ausentes: ${pointageFilterStats.absents} de ${pointageTableWorkers.length} operarios`, pt: `Ausentes: ${pointageFilterStats.absents} de ${pointageTableWorkers.length} operários`, tr: `Yok: ${pointageFilterStats.absents}/${pointageTableWorkers.length} işçi` })}
                      style={{ background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)', padding: '4px 8px', borderRadius: '8px', boxShadow: '0 2px 8px -2px rgba(244,63,94,0.35)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', minHeight: 32 }}
                    >
                      <X size={15} style={{ flexShrink: 0, opacity: 0.95 }} />
                      <span style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.04em', opacity: 0.92 }}>ABS.</span>
                      <span style={{ fontSize: '17px', fontWeight: 900, lineHeight: 1 }}>{pointageFilterStats.absents}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 900, lineHeight: 1 }}>{pointageTableWorkers.length > 0 ? Math.round((pointageFilterStats.absents / pointageTableWorkers.length) * 100) : 0}%</span>
                    </div>

                    <div
                      className="kpi-card"
                      title={tx(lang, { fr: `Retards : ${pointageFilterStats.retards} parmi ${pointageFilterStats.presents} présents`, ar: `المتأخرون: ${pointageFilterStats.retards} من ${pointageFilterStats.presents} حاضر`, en: `Late: ${pointageFilterStats.retards} among ${pointageFilterStats.presents} present`, es: `Tardanzas: ${pointageFilterStats.retards} entre ${pointageFilterStats.presents} presentes`, pt: `Atrasados: ${pointageFilterStats.retards} entre ${pointageFilterStats.presents} presentes`, tr: `Geç: ${pointageFilterStats.retards} mevcut ${pointageFilterStats.presents} arasında` })}
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
                <div style={{ background: isDark ? '#1D2E28' : '#fff', padding: '6px 8px', borderRadius: '8px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', rowGap: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexShrink: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                  <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 0 }}>
                    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: isDark ? '#64748B' : '#94A3B8' }} />
                    <input
                      value={pointageSearch}
                      onChange={e => setPointageSearch(e.target.value)}
                      placeholder={tx(lang, { fr: 'Nom, matricule…', ar: 'الاسم، رقم التسجيل…', en: 'Name, ID…', es: 'Nombre, matrícula…', pt: 'Nome, matrícula…', tr: 'İsim, kimlik…' })}
                      style={{ ..._inputStyle, paddingLeft: '30px', borderRadius: '6px', border: '1px solid #f1f5f9', background: isDark ? '#14211C' : '#F8FAFC', width: '100%', height: '30px', fontSize: '11px' }}
                    />
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, maxWidth: '100%' }}>
                    <LayoutGrid size={13} color="#64748b" style={{ flexShrink: 0 }} />
                    <select
                      value={pointageChaine}
                      onChange={e => setPointageChaine(e.target.value)}
                      style={{ ..._inputStyle, width: 'min(148px, 42vw)', maxWidth: '100%', height: '30px', borderRadius: '6px', background: isDark ? '#14211C' : '#F8FAFC', fontSize: '11px' }}
                    >
                      <option value="">{tx(lang, { fr: 'Toutes les chaînes', ar: 'جميع الخطوط', en: 'All lines', es: 'Todas las líneas', pt: 'Todas as linhas', tr: 'Tüm hatlar' })}</option>
                      {pointageChaineOptions.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ height: '14px', width: '1px', background: isDark ? '#2E463C' : '#E2E8F0', margin: '0 2px', flexShrink: 0 }} />

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
                      title={tx(lang, { fr: 'Afficher les colonnes par tranches (créneaux)', ar: 'عرض الأعمدة حسب الفترات الزمنية', en: 'Show columns by time slots', es: 'Mostrar columnas por franjas horarias', pt: 'Mostrar colunas por intervalos de tempo', tr: 'Sütunları zaman dilimlerine göre göster' })}
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
                              color: isDark ? '#64748B' : '#94A3B8',
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
                      title={tx(lang, { fr: 'Vue simplifiée : Entrée / Sortie uniquement (masquer les tranches)', ar: 'عرض مبسط: دخول/خروج فقط (إخفاء الفترات)', en: 'Simplified view: Entry / Exit only (hide time slots)', es: 'Vista simplificada: Entrada / Salida solamente (ocultar franjas)', pt: 'Vista simplificada: Entrada / Saída apenas (ocultar segmentos)', tr: 'Basitleştirilmiş görünüm: Yalnızca Giriş/Çıkış (dilimleri gizle)' })}
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
                              background: isDark ? '#1D2E28' : '#fff',
                              color: '#334155',
                              boxShadow: '0 1px 2px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,1)',
                            }
                          : {
                              background: 'transparent',
                              color: isDark ? '#64748B' : '#94A3B8',
                            }),
                      }}
                    >
                      <Table2 size={13} style={{ flexShrink: 0, opacity: !showTranches ? 1 : 0.75 }} />
                      Grille
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: 'auto' }} title={tx(lang, { fr: 'Entrée/Sortie même jour · tranches SAGE', ar: 'دخول/خروج نفس اليوم · فترات SAGE', en: 'Same day Entry/Exit · SAGE time slots', es: 'Entrada/Salida mismo día · franjas SAGE', pt: 'Entrada/Saída mesmo dia · segmentos SAGE', tr: 'Aynı gün Giriş/Çıkış · SAGE dilimleri' })}>
                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                    <span style={{ fontSize: '10px', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B' }}>:00</span>
                  </div>
                </div>

                <div
                  lang="fr-FR"
                  title={tx(lang, { fr: 'Entrée/Sortie le même jour. Tranches synchronisées avec le moteur SAGE.', ar: 'دخول/خروج في نفس اليوم. الفترات متزامنة مع محرك SAGE.', en: 'Same day Entry/Exit. Time slots synchronized with the SAGE engine.', es: 'Entrada/Salida el mismo día. Franjas sincronizadas con el motor SAGE.', pt: 'Entrada/Saída no mesmo dia. Segmentos sincronizados com o motor SAGE.', tr: 'Aynı gün Giriş/Çıkış. Dilimler SAGE motoru ile senkronize edilmiştir.' })}
                  style={{
                    background: isDark ? '#1D2E28' : '#fff',
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
                      <thead style={{ position: 'sticky', top: 0, zIndex: 40, background: isDark ? '#1D2E28' : '#fff' }}>
                        <tr style={{ background: isDark ? '#14211C' : '#F8FAFC' }}>
                          {/* Sans 2e ligne d’en-tête (tranches masquées), rowSpan doit être 1 sinon le tableau HTML est invalide / affichage cassé */}
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 6px', textAlign: 'left', fontSize: '9px', fontWeight: 800, color: isDark ? '#94A3B8' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', position: 'sticky', left: 0, zIndex: 50, background: isDark ? '#14211C' : '#F8FAFC', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.06)', minWidth: '168px' }}>{tx(lang, { fr: 'Ouvrier', ar: 'العامل', en: 'Worker', es: 'Operario', pt: 'Operário', tr: 'İşçi' })}</th>
                          {showTranches && (
                            <th colSpan={pointageTrancheColCount} style={{ padding: '3px 4px', textAlign: 'center', fontSize: '8px', fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', background: '#f5f3ff' }}>{tx(lang, { fr: 'Tranches', ar: 'الفترات', en: 'Slots', es: 'Franjas', pt: 'Intervalos', tr: 'Dilimler' })}</th>
                          )}
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 6px', textAlign: 'left', fontSize: '9px', fontWeight: 800, color: isDark ? '#94A3B8' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '92px' }}>{tx(lang, { fr: 'Entrée', ar: 'الدخول', en: 'Entry', es: 'Entrada', pt: 'Entrada', tr: 'Giriş' })}</th>
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 6px', textAlign: 'left', fontSize: '9px', fontWeight: 800, color: isDark ? '#94A3B8' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '92px' }}>{tx(lang, { fr: 'Sortie', ar: 'الخروج', en: 'Exit', es: 'Salida', pt: 'Saída', tr: 'Çıkış' })}</th>
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 4px', textAlign: 'center', fontSize: '9px', fontWeight: 800, color: isDark ? '#94A3B8' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '62px' }}>H.N.</th>
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 4px', textAlign: 'center', fontSize: '9px', fontWeight: 800, color: isDark ? '#94A3B8' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '62px' }}>25%</th>
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 4px', textAlign: 'center', fontSize: '9px', fontWeight: 800, color: isDark ? '#94A3B8' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '62px' }}>50%</th>
                          <th rowSpan={showTranches ? 2 : 1} style={{ padding: '4px 6px', textAlign: 'right', fontSize: '9px', fontWeight: 800, color: isDark ? '#94A3B8' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', width: '108px' }}>{tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum' })}</th>
                        </tr>
                        {showTranches && (
                          <tr style={{ background: isDark ? '#14211C' : '#F8FAFC' }}>
                            {pointageTranches.slots.map((slot, gi) => (
                              <Fragment key={`slot-h-${gi}`}>
                                {pointageTranches.sepAfterIndex >= 0 && gi === pointageTranches.sepAfterIndex + 1 && (
                                  <th style={{ padding: '1px', textAlign: 'center', fontSize: '7px', fontWeight: 900, color: isDark ? '#64748B' : '#94A3B8', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: '22px', zIndex: 40 }}>—</th>
                                )}
                                <th style={{ padding: '1px 2px', textAlign: 'center', fontSize: '7px', fontWeight: 900, color: isDark ? '#94A3B8' : '#64748B', borderBottom: '1px solid #e2e8f0', minWidth: '40px', position: 'sticky', top: '22px', zIndex: 40, background: isDark ? '#14211C' : '#F8FAFC' }}>{slot.label}</th>
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
                                style={{ borderBottom: '1px solid #f1f5f9', background: isDark ? '#1D2E28' : '#fff' }}
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
                                        style={{ fontSize: '11px', fontWeight: 700, color: isDark ? '#EAF1ED' : '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}
                                      >
                                        {w.full_name}
                                      </div>
                                      <div style={{ fontSize: '9px', color: isDark ? '#64748B' : '#94A3B8', fontWeight: 600, lineHeight: 1.2 }}>
                                        {w.matricule} · <span style={{ color: isDark ? '#94A3B8' : '#64748B' }}>{w.chaine_id || 'BUREAU'}</span>{w.equipe ? ` · ${w.equipe}` : ''}{w.phone ? (
                                          <>
                                            {' · '}
                                            <a href={`tel:${w.phone}`} style={{ color: isDark ? '#818cf8' : '#2149C1', fontWeight: 700, textDecoration: 'none' }}>
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
                                          <td style={{ padding: '4px', textAlign: 'center', background: isDark ? '#14211C' : '#F8FAFC' }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isDark ? '#475569' : '#CBD5E1', margin: 'auto' }} />
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
                                    style={{ ..._inputStyle, padding: '3px 6px', borderRadius: '6px', background: gridDisabled ? '#f8fafc' : '#fff', opacity: gridDisabled ? 0.45 : 1, border: gridDisabled ? '1px solid #f1f5f9' : '1px solid #e2e8f0', width: '86px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '11px', color: isDark ? '#EAF1ED' : '#1E293B' }}
                                  />
                                </td>
                                <td style={{ padding: '3px 4px' }}>
                                  <input
                                    type="time"
                                    defaultValue={normalizeTimeForInput(ptg?.heure_sortie as string)}
                                    onBlur={e => savePointageRow(w.id, 'heure_sortie', e.target.value, ptg)}
                                    disabled={gridDisabled}
                                    style={{ ..._inputStyle, padding: '3px 6px', borderRadius: '6px', background: gridDisabled ? '#f8fafc' : '#fff', opacity: gridDisabled ? 0.45 : 1, border: gridDisabled ? '1px solid #f1f5f9' : '1px solid #e2e8f0', width: '86px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '11px', color: isDark ? '#EAF1ED' : '#1E293B' }}
                                  />
                                </td>

                                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 800, color: ptg?.heures_normales ? '#1e293b' : isDark ? '#475569' : '#CBD5E1' }}>
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
                                    <optgroup label={tx(lang, { fr: 'Présence', ar: 'حضور', en: 'Presence', es: 'Presencia', pt: 'Presença', tr: 'Mevcut' })}>
                                      <option value="PRESENT">{tx(lang, { fr: 'Présent', ar: 'حاضر', en: 'Present', es: 'Presente', pt: 'Presente', tr: 'Mevcut' })}</option>
                                      <option value="RETARD">{tx(lang, { fr: 'Retard', ar: 'متأخر', en: 'Late', es: 'Tarde', pt: 'Atrasado', tr: 'Geç' })}</option>
                                    </optgroup>
                                    <optgroup label={tx(lang, { fr: 'Absence / Autre', ar: 'غياب / آخر', en: 'Absence / Other', es: 'Ausencia / Otro', pt: 'Ausência / Outro', tr: 'Devamsızlık / Diğer' })}>
                                      {['ABSENT', 'CONGE', 'MALADIE', 'MISSION', 'FERIE'].map(k => (
                                        <option key={k} value={k}>{tx(lang, STATUS_CONFIG[k as HRPointageStatus]?.label) || k}</option>
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
                  <div style={{ padding: '16px 24px', background: isDark ? '#14211C' : '#F8FAFC', borderTop: isDark ? '1px solid #2E463C' : '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: isDark ? '#64748B' : '#94A3B8', textTransform: 'uppercase' }}>H. Normales</span>
                        <span style={{ fontSize: '16px', fontWeight: 900, color: isDark ? '#EAF1ED' : '#1E293B' }}>{formatDureeHeuresFR(pointageHeuresFiltre.n)}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: isDark ? '#64748B' : '#94A3B8', textTransform: 'uppercase' }}>H.S. 25%</span>
                        <span style={{ fontSize: '16px', fontWeight: 900, color: '#2563eb' }}>{formatDureeHeuresFR(pointageHeuresFiltre.s25)}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: isDark ? '#64748B' : '#94A3B8', textTransform: 'uppercase' }}>H.S. 50%</span>
                        <span style={{ fontSize: '16px', fontWeight: 900, color: '#7c3aed' }}>{formatDureeHeuresFR(pointageHeuresFiltre.s50)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B' }}>{pointageTableWorkers.length} {tx(lang, { fr: 'ouvriers affichés', ar: 'عامل معروض', en: 'workers displayed', es: 'trabajadores mostrados', pt: 'trabalhadores exibidos', tr: 'işçi görüntüleniyor' })}</div>
                      <div style={{ fontSize: '10px', color: isDark ? '#64748B' : '#94A3B8', fontWeight: 500 }}>{tx(lang, { fr: 'Basé sur les filtres actifs', ar: 'بناءً على الفلاتر النشطة', en: 'Based on active filters', es: 'Basado en filtros activos', pt: 'Com base nos filtros ativos', tr: 'Aktif filtrelere göre' })}</div>
                    </div>
                  </div>

                  {pointageTableWorkers.length === 0 && workers.length > 0 && (
                    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: isDark ? '#1E293B' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Search size={24} color="#94a3b8" />
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>{tx(lang, { fr: 'Aucun résultat', ar: 'لا توجد نتائج', en: 'No results', es: 'Sin resultados', pt: 'Nenhum resultado', tr: 'Sonuç yok' })}</div>
                      <div style={{ fontSize: '13px', color: isDark ? '#64748B' : '#94A3B8', fontWeight: 500 }}>{tx(lang, { fr: 'Ajustez la recherche ou le filtre chaîne pour afficher des ouvriers', ar: 'عدّل البحث أو فلتر الخط لعرض العمال', en: 'Adjust the search or line filter to display workers', es: 'Ajuste la búsqueda o el filtro de línea para mostrar operarios', pt: 'Ajuste a pesquisa ou o filtro de linha para exibir trabalhadores', tr: 'İşçileri görüntülemek için aramayı veya hat filtresini ayarlayın' })}</div>
                    </div>
                  )}
                  {workers.length === 0 && (
                    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: isDark ? '#1E293B' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Users size={24} color="#94a3b8" />
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>{tx(lang, { fr: 'Aucun ouvrier enregistré', ar: 'لا يوجد عمال مسجلون', en: 'No registered workers', es: 'Ningún trabajador registrado', pt: 'Nenhum trabalhador registrado', tr: 'Kayıtlı işçi yok' })}</div>
                      <div style={{ fontSize: '13px', color: isDark ? '#64748B' : '#94A3B8', fontWeight: 500 }}>{tx(lang, { fr: 'Ajoutez des ouvriers dans l\'onglet Annuaire pour commencer le pointage', ar: 'أضف عمالاً في علامة التبويب "الدليل" لبدء تسجيل الحضور', en: 'Add workers in the Directory tab to start time tracking', es: 'Agregue operarios en la pestaña Directorio para comenzar el registro', pt: 'Adicione trabalhadores na guia Diretório para iniciar o ponto', tr: 'Puanta j Kaydına başlamak için Rehber sekmesine işçi ekleyin' })}</div>
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
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ ..._inputStyle, width: 160 }} />
                  <button onClick={fetchProduction} style={_btnSecondary}><RefreshCw size={14} style={{ marginRight: 6 }} />{tx(lang, { fr: 'Actualiser', ar: 'تحديث', en: 'Refresh', es: 'Actualizar', pt: 'Atualizar', tr: 'Yenile' })}</button>
                  {productions.length > 0 && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, fontSize: 13 }}>
                      <span>{tx(lang, { fr: 'Total pièces', ar: 'إجمالي القطع', en: 'Total pieces', es: 'Total piezas', pt: 'Total peças', tr: 'Toplam parça' })}: <strong style={{ color: '#10B981' }}>{productions.reduce((a:number, p:any) => a + (p.pieces_produites || 0), 0)}</strong></span>
                      <span style={{ color: '#EF4444' }}>{tx(lang, { fr: 'Défauts', ar: 'العيوب', en: 'Defects', es: 'Defectos', pt: 'Defeitos', tr: 'Kusurlar' })}: <strong>{productions.reduce((a:number, p:any) => a + (p.pieces_defaut || 0), 0)}</strong></span>
                    </div>
                  )}
                </div>
                <div style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: isDark ? '#14211C' : '#F8FAFC' }}>
                          {['Ouvrier', 'Chaîne', 'Pièces ✓', 'Défauts', 'Retouches', 'Taux Qualité', 'Rendement'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, borderBottom: '2px solid #E2E8F0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {workers.map(w => {
                          const prod = productions.find((p:any) => p.worker_id === w.id);
                          return (
                            <tr key={w.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 600, color: isDark ? '#EAF1ED' : '#0F172A' }}>{w.full_name}</div>
                                <div style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8' }}>{w.matricule}</div>
                              </td>
                              <td style={{ padding: '10px 14px', color: isDark ? '#94A3B8' : '#64748B' }}>{w.chaine_id || '—'}</td>
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
                      <div style={{ textAlign: 'center', padding: 40, color: isDark ? '#64748B' : '#94A3B8' }}>{tx(lang, { fr: 'Aucun ouvrier enregistré', ar: 'لا يوجد عمال مسجلون', en: 'No registered workers', es: 'Ningún trabajador registrado', pt: 'Nenhum trabalhador registrado', tr: 'Kayıtlı işçi yok' })}</div>
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
                  <span>{tx(lang, { fr: '<strong>Article 385 — Code du Travail Marocain :</strong> La déduction mensuelle ne peut excéder 1/10ème du salaire net. Plafond appliqué automatiquement.', ar: '<strong>المادة 385 — مدونة الشغل المغربية:</strong> لا يمكن أن يتجاوز الخصم الشهري 1/10 من الراتب الصافي. تم تطبيق الحد الأقصى تلقائياً.', en: '<strong>Article 385 — Moroccan Labor Code:</strong> Monthly deduction cannot exceed 1/10 of net salary. Cap applied automatically.', es: '<strong>Artículo 385 — Código del Trabajo Marroquí:</strong> La deducción mensual no puede exceder 1/10 del salario neto. Límite aplicado automáticamente.', pt: '<strong>Artigo 385 — Código do Trabalho Marroquino:</strong> A dedução mensal não pode exceder 1/10 do salário líquido. Limite aplicado automaticamente.', tr: '<strong>Madde 385 — Fas Çalışma Kanunu:</strong> Aylık kesinti net maaşın 1/10\'unu aşamaz. Sınır otomatik olarak uygulandı.' })}</span>
                </div>
                <div style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: isDark ? '#14211C' : '#F8FAFC' }}>
                          {[tx(lang, { fr: 'Ouvrier', ar: 'العامل', en: 'Worker', es: 'Operario', pt: 'Operário', tr: 'İşçi' }), tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' }), tx(lang, { fr: 'Montant', ar: 'المبلغ', en: 'Amount', es: 'Monto', pt: 'Valor', tr: 'Tutar' }), tx(lang, { fr: 'Solde Restant', ar: 'الرصيد المتبقي', en: 'Remaining Balance', es: 'Saldo Restante', pt: 'Saldo Restante', tr: 'Kalan Bakiye' }), tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum' }), tx(lang, { fr: 'Actions', ar: 'الإجراءات', en: 'Actions', es: 'Acciones', pt: 'Ações', tr: 'İşlemler' })].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, borderBottom: '2px solid #E2E8F0' }}>{h}</th>
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
                                <div style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8' }}>{tx(lang, { fr: 'Salaire', ar: 'الراتب', en: 'Salary', es: 'Salario', pt: 'Salário', tr: 'Maaş' })}: {a.salaire_base?.toLocaleString()} MAD</div>
                              </td>
                              <td style={{ padding: '10px 14px', color: isDark ? '#94A3B8' : '#64748B' }}>{a.date_demande}</td>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: isDark ? '#EAF1ED' : '#0F172A' }}>
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
                                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{tx(lang, sc.label)}</span>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                {a.statut === 'DEMANDE' && (
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => handleAvanceStatut(a.id, 'APPROUVE')}
                                      style={{ padding: '4px 10px', border: 'none', borderRadius: 6, background: '#D1FAE5', color: '#065F46', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>{tx(lang, { fr: '✓ Approuver', ar: '✓ موافقة', en: '✓ Approve', es: '✓ Aprobar', pt: '✓ Aprovar', tr: '✓ Onayla' })}</button>
                                    <button onClick={() => handleAvanceStatut(a.id, 'REFUSE')}
                                      style={{ padding: '4px 10px', border: 'none', borderRadius: 6, background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>{tx(lang, { fr: '✗ Refuser', ar: '✗ رفض', en: '✗ Refuse', es: '✗ Rechazar', pt: '✗ Recusar', tr: '✗ Reddet' })}</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {avances.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 40, color: isDark ? '#64748B' : '#94A3B8' }}>
                        <DollarSign size={40} style={{ marginBottom: 10, opacity: 0.3 }} />
                        <div>{tx(lang, { fr: 'Aucune avance enregistrée', ar: 'لا توجد سلفات مسجلة', en: 'No advances recorded', es: 'Ningún anticipo registrado', pt: 'Nenhum adiantamento registrado', tr: 'Kayıtlı avans yok' })}</div>
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
                    <div style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 16, padding: 20, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: isDark ? '#EAF1ED' : '#0F172A' }}>{tx(lang, { fr: 'Sélection des Passagers HS', ar: 'اختيار الركاب للساعات الإضافية', en: 'OT Passenger Selection', es: 'Selección de Pasajeros HS', pt: 'Seleção de Passageiros HE', tr: 'Fazla Mesai Yolcu Seçimi' })}</h3>
                      
                      {/* Date Filter */}
                      <div style={{ marginBottom: 16 }}>
                        <label style={_labelStyle}>{tx(lang, { fr: 'Date de recensement', ar: 'تاريخ الحصر', en: 'Census Date', es: 'Fecha de censo', pt: 'Data do recenseamento', tr: 'Sayım Tarihi' })}</label>
                        <input type="date" value={filterTransportDate} onChange={e => setFilterTransportDate(e.target.value)} style={_inputStyle} />
                      </div>

                      {/* Quick Add Search */}
                      <div style={{ marginBottom: 20, position: 'relative' }}>
                        <label style={_labelStyle}>{tx(lang, { fr: 'Recherche & Ajout Rapide', ar: 'بحث وإضافة سريعة', en: 'Quick Search & Add', es: 'Búsqueda y Agregado Rápido', pt: 'Pesquisa e Adição Rápida', tr: 'Hızlı Ara ve Ekle' })}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="text" placeholder={tx(lang, { fr: 'Rechercher par nom...', ar: 'بحث بالاسم...', en: 'Search by name...', es: 'Buscar por nombre...', pt: 'Pesquisar por nome...', tr: 'İsimle ara...' })} value={recensementSearch} onChange={e => setRecensementSearch(e.target.value)} style={_inputStyle} />
                          {recensementSearch && (
                            <button onClick={() => setRecensementSearch('')} style={{ padding: 8, background: isDark ? '#1E293B' : '#F1F5F9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                              <X size={16} />
                            </button>
                          )}
                        </div>
                        {/* Suggestions Dropdown */}
                        {recensementSearch.trim() && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: isDark ? '#1D2E28' : '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 100, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                            {workers.filter(w => w.is_active && !recensementWorkers.includes(w.id) && w.full_name.toLowerCase().includes(recensementSearch.toLowerCase())).slice(0, 6).map(w => (
                              <div key={w.id} onClick={() => { setRecensementWorkers(prev => [...prev, w.id]); setRecensementSearch(''); }}
                                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', fontSize: 13, display: 'flex', justifyContent: 'space-between', transition: 'background 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <span style={{ fontWeight: 600 }}>{w.full_name}</span>
                                <span style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>{w.equipe || tx(lang, { fr: 'Sans Équipe', ar: 'بدون فريق', en: 'No Team', es: 'Sin Equipo', pt: 'Sem Equipe', tr: 'Takım Yok' })} • {w.chaine_id || '—'}</span>
                              </div>
                            ))}
                            {workers.filter(w => w.is_active && !recensementWorkers.includes(w.id) && w.full_name.toLowerCase().includes(recensementSearch.toLowerCase())).length === 0 && (
                              <div style={{ padding: '12px 14px', fontSize: 12, color: isDark ? '#64748B' : '#94A3B8', textAlign: 'center' }}>{tx(lang, { fr: 'Aucun ouvrier actif correspondant', ar: 'لا يوجد عامل نشط مطابق', en: 'No matching active worker', es: 'Ningún trabajador activo coincide', pt: 'Nenhum trabalhador ativo correspondente', tr: 'Eşleşen aktif işçi yok' })}</div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Select by Chaine */}
                      <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 16 }}>
                        <label style={_labelStyle}>{tx(lang, { fr: 'Sélection par Chaîne de Production', ar: 'اختيار حسب خط الإنتاج', en: 'Selection by Production Line', es: 'Selección por Línea de Producción', pt: 'Seleção por Linha de Produção', tr: 'Üretim Hattına Göre Seçim' })}</label>
                        <select value={recensementChaine} onChange={e => setRecensementChaine(e.target.value)} style={{ ..._inputStyle, marginBottom: 12 }}>
                          <option value="">{tx(lang, { fr: '-- Sélectionner une chaîne --', ar: '-- اختر خطاً --', en: '-- Select a line --', es: '-- Seleccionar una línea --', pt: '-- Selecionar uma linha --', tr: '-- Bir hat seçin --' })}</option>
                          {pointageChaineOptions.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                        </select>

                        {recensementChaine && (
                          <div>
                            {/* Mass actions */}
                            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                              <button type="button" style={{ ..._btnSecondary, padding: '5px 10px', fontSize: 11 }}
                                onClick={() => {
                                  const chainIds = workers.filter(w => w.is_active && String(w.chaine_id || '') === recensementChaine).map(w => w.id);
                                  setRecensementWorkers(prev => [...new Set([...prev, ...chainIds])]);
                                }}>
                                {tx(lang, { fr: 'Tout cocher', ar: 'تحديد الكل', en: 'Select All', es: 'Seleccionar todo', pt: 'Selecionar tudo', tr: 'Tümünü Seç' })}
                              </button>
                              <button type="button" style={{ ..._btnSecondary, padding: '5px 10px', fontSize: 11, color: '#EF4444', borderColor: '#FCA5A5' }}
                                onClick={() => {
                                  const chainIds = workers.filter(w => w.is_active && String(w.chaine_id || '') === recensementChaine).map(w => w.id);
                                  setRecensementWorkers(prev => prev.filter(id => !chainIds.includes(id)));
                                }}>
                                {tx(lang, { fr: 'Tout décocher', ar: 'إلغاء تحديد الكل', en: 'Deselect All', es: 'Deseleccionar todo', pt: 'Desmarcar tudo', tr: 'Tümünü Kaldır' })}
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
                                      <div style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>{w.matricule} • {w.poste || '—'} {w.equipe ? `(${w.equipe})` : ''}</div>
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
                      <div style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 16, padding: 20, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: isDark ? '#EAF1ED' : '#0F172A' }}>{tx(lang, { fr: 'Fiche Récapitulative', ar: 'بطاقة ملخصة', en: 'Summary Sheet', es: 'Ficha Resumen', pt: 'Ficha Resumo', tr: 'Özet Kartı' })}</h3>
                          <button onClick={handleCopyRecensementWhatsApp} disabled={recensementWorkers.length === 0} style={_btnPrimary}>
                            <Copy size={14} style={{ marginRight: 6 }} /> {tx(lang, { fr: 'Copier WhatsApp', ar: 'نسخ واتساب', en: 'Copy WhatsApp', es: 'Copiar WhatsApp', pt: 'Copiar WhatsApp', tr: 'WhatsApp\'ı Kopyala' })}
                          </button>
                        </div>

                        {/* Breakdown by Shift (Parda) */}
                        <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: isDark ? '#14211C' : '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: isDark ? '#94A3B8' : '#475569' }}>{tx(lang, { fr: 'Équipe (Parda)', ar: 'الفريق (الوردية)', en: 'Team (Parda)', es: 'Equipo (Parda)', pt: 'Equipe (Parda)', tr: 'Takım (Parda)' })}</th>
                                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: isDark ? '#94A3B8' : '#475569' }}>{tx(lang, { fr: 'Nombre', ar: 'العدد', en: 'Count', es: 'Cantidad', pt: 'Quantidade', tr: 'Sayı' })}</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: isDark ? '#94A3B8' : '#475569' }}>{tx(lang, { fr: 'Lignes / Quartiers', ar: 'الخطوط / الأحياء', en: 'Lines / Districts', es: 'Líneas / Barrios', pt: 'Linhas / Bairros', tr: 'Hatlar / Mahalleler' })}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(
                                workers.filter(w => recensementWorkers.includes(w.id)).reduce((acc, w) => {
                                  const eq = w.equipe || tx(lang, { fr: 'Sans Équipe', ar: 'بدون فريق', en: 'No Team', es: 'Sin Equipo', pt: 'Sem Equipe', tr: 'Takım Yok' });
                                  if (!acc[eq]) acc[eq] = { count: 0, lines: new Set<string>() };
                                  acc[eq].count += 1;
                                  acc[eq].lines.add(w.transport_ligne_quartier || w.transport_ligne_nom || tx(lang, { fr: 'Sans Transport', ar: 'بدون نقل', en: 'No Transport', es: 'Sin Transporte', pt: 'Sem Transporte', tr: 'Ulaşım Yok' }));
                                  return acc;
                                }, {} as Record<string, { count: number; lines: Set<string> }>)
                              ).map(([parda, info]) => (
                                <tr key={parda} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                  <td style={{ padding: '8px 12px', fontWeight: 600, color: isDark ? '#EAF1ED' : '#0F172A' }}>{parda}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#6366F1' }}>{info.count}</td>
                                  <td style={{ padding: '8px 12px', color: isDark ? '#94A3B8' : '#64748B', fontSize: 11 }}>{[...info.lines].join(', ')}</td>
                                </tr>
                              ))}
                              <tr style={{ background: isDark ? '#14211C' : '#F8FAFC', fontWeight: 700, borderTop: isDark ? '2px solid #2E463C' : '2px solid #E2E8F0' }}>
                                <td style={{ padding: '10px 12px' }}>{tx(lang, { fr: 'Total passagers', ar: 'إجمالي الركاب', en: 'Total passengers', es: 'Total pasajeros', pt: 'Total passageiros', tr: 'Toplam yolcu' })}</td>
                                <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 14, color: isDark ? '#818cf8' : '#2149C1' }}>{recensementWorkers.length}</td>
                                <td style={{ padding: '10px 12px', color: isDark ? '#64748B' : '#94A3B8', fontSize: 11 }}>{tx(lang, { fr: 'Toutes équipes confondues', ar: 'جميع الفرق مجتمعة', en: 'All teams combined', es: 'Todos los equipos combinados', pt: 'Todas as equipes combinadas', tr: 'Tüm takımlar dahil' })}</td>
                              </tr>
                            </tbody>
                          </table>
                          {recensementWorkers.length === 0 && (
                            <div style={{ textAlign: 'center', padding: 24, color: isDark ? '#64748B' : '#94A3B8', fontSize: 12 }}>{tx(lang, { fr: 'Aucun passager sélectionné', ar: 'لم يتم اختيار أي راكب', en: 'No passenger selected', es: 'Ningún pasajero seleccionado', pt: 'Nenhum passageiro selecionado', tr: 'Yolcu seçilmedi' })}</div>
                          )}
                        </div>

                        {/* List of checked passengers with quick remove */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#94A3B8' : '#475569', marginBottom: 8 }}>{tx(lang, { fr: 'Liste des passagers', ar: 'قائمة الركاب', en: 'Passenger List', es: 'Lista de pasajeros', pt: 'Lista de passageiros', tr: 'Yolcu Listesi' })} ({recensementWorkers.length}) :</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                            {workers.filter(w => recensementWorkers.includes(w.id)).map(w => (
                              <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, border: '1px solid #F1F5F9', background: isDark ? '#14211C' : '#F8FAFC', fontSize: 12 }}>
                                <div>
                                  <span style={{ fontWeight: 600, color: isDark ? '#EAF1ED' : '#1E293B' }}>{w.full_name}</span>
                                  <span style={{ color: isDark ? '#94A3B8' : '#64748B', marginLeft: 8 }}>({w.equipe || '—'} • {w.transport_ligne_quartier || w.transport_ligne_nom || 'Sans Transport'})</span>
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
                        <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#94A3B8' : '#475569' }}>{tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' })} :</span>
                        <input type="date" value={filterTransportDate} onChange={e => setFilterTransportDate(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, outline: 'none' }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#94A3B8' : '#475569' }}>{tx(lang, { fr: 'Équipe (Parda)', ar: 'الفريق (الوردية)', en: 'Team (Parda)', es: 'Equipo (Parda)', pt: 'Equipe (Parda)', tr: 'Takım (Parda)' })} :</span>
                        <input type="text" placeholder="ex: Équipe A" value={filterTransportParda} onChange={e => setFilterTransportParda(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, outline: 'none' }} />
                      </div>
                      <button onClick={() => { fetchTransportLignes(); fetchPointage(); }} style={{ ..._btnSecondary, padding: '8px 12px' }}>
                        <RefreshCw size={14} style={{ marginRight: 6 }} />{tx(lang, { fr: 'Actualiser', ar: 'تحديث', en: 'Refresh', es: 'Actualizar', pt: 'Atualizar', tr: 'Yenile' })}
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

                          const driverText = l.chauffeur_nom ? `${tx(lang, { fr: 'Chauffeur', ar: 'السائق', en: 'Driver', es: 'Conductor', pt: 'Motorista', tr: 'Şoför' })}: ${l.chauffeur_nom} (${l.chauffeur_tel ?? '—'})` : tx(lang, { fr: 'Chauffeur: Non défini', ar: 'السائق: غير محدد', en: 'Driver: Not set', es: 'Conductor: No definido', pt: 'Motorista: Não definido', tr: 'Şoför: Belirtilmemiş' });
                          const vehiculeText = l.matricule_vehicule ? `${tx(lang, { fr: 'Plate/Véhicule', ar: 'لوحة/مركبة', en: 'Plate/Vehicle', es: 'Placa/Vehículo', pt: 'Placa/Veículo', tr: 'Plaka/Araç' })}: ${l.matricule_vehicule}` : '';
                          const codeText = l.code_ligne ? `[${l.code_ligne}] ` : '';
                          const text = `*${tx(lang, { fr: 'Ligne Transport', ar: 'خط النقل', en: 'Transport Line', es: 'Línea de Transporte', pt: 'Linha de Transporte', tr: 'Ulaşım Hattı' })}: ${codeText}${l.nom}*\n${driverText}\n${vehiculeText}\n${tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' })}: ${dateStr}\n\n*${tx(lang, { fr: 'Passagers Présents', ar: 'الركاب الحاضرون', en: 'Present Passengers', es: 'Pasajeros Presentes', pt: 'Passageiros Presentes', tr: 'Mevcut Yolcular' })} (${presentWorkers.length}):*\n${workerListText || tx(lang, { fr: 'Aucun passager présent.', ar: 'لا يوجد ركاب حاضرون.', en: 'No passengers present.', es: 'Ningún pasajero presente.', pt: 'Nenhum passageiro presente.', tr: 'Mevcut yolcu yok.' })}`;

                          navigator.clipboard.writeText(text);
                          showToast(tx(lang, { fr: 'Liste copiée pour WhatsApp !', ar: 'تم نسخ القائمة لواتساب!', en: 'List copied for WhatsApp!', es: '¡Lista copiada para WhatsApp!', pt: 'Lista copiada para WhatsApp!', tr: 'WhatsApp için liste kopyalandı!' }));
                        };

                        return (
                          <div key={l.id} style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0', padding: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', paddingBottom: 12, marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                              <div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isDark ? '#EAF1ED' : '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Navigation size={18} color="#2149C1" /> {l.code_ligne ? `[${l.code_ligne}] ` : ''}{l.nom}
                                  {l.quartier && <span style={{ fontSize: 12, fontWeight: 500, color: isDark ? '#94A3B8' : '#64748B', background: isDark ? '#1E293B' : '#F1F5F9', padding: '2px 8px', borderRadius: 6 }}>{tx(lang, { fr: 'Quartier', ar: 'الحي', en: 'District', es: 'Barrio', pt: 'Bairro', tr: 'Mahalle' })}: {l.quartier}</span>}
                                </h3>
                                <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap', fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>
                                  {l.chauffeur_nom && (
                                    <span>
                                      {tx(lang, { fr: 'Chauffeur', ar: 'السائق', en: 'Driver', es: 'Conductor', pt: 'Motorista', tr: 'Şoför' })}: <strong>{l.chauffeur_nom}</strong>
                                      {l.chauffeur_tel && (
                                        <a href={`tel:${l.chauffeur_tel}`} style={{ marginLeft: 6, color: isDark ? '#818cf8' : '#2149C1', fontWeight: 600 }}>
                                          📞 {l.chauffeur_tel}
                                        </a>
                                      )}
                                    </span>
                                  )}
                                  {l.matricule_vehicule && <span>{tx(lang, { fr: 'Véhicule', ar: 'المركبة', en: 'Vehicle', es: 'Vehículo', pt: 'Veículo', tr: 'Araç' })}: <strong>{l.matricule_vehicule}</strong></span>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ background: '#EEF2FF', color: isDark ? '#818cf8' : '#2149C1', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12 }}>
                                  {tx(lang, { fr: 'Présents', ar: 'الحاضرون', en: 'Present', es: 'Presentes', pt: 'Presentes', tr: 'Mevcut' })}: {presentWorkers.length} / {assignedWorkers.length} ({tx(lang, { fr: 'Capacité', ar: 'السعة', en: 'Capacity', es: 'Capacidad', pt: 'Capacidade', tr: 'Kapasite' })}: {l.capacite || '—'})
                                </span>
                                <button onClick={handleCopyWhatsApp} style={{ ..._btnSecondary, fontSize: 11, padding: '4px 10px' }}>
                                  <Copy size={12} style={{ marginRight: 4 }} /> {tx(lang, { fr: 'Copier WhatsApp', ar: 'نسخ واتساب', en: 'Copy WhatsApp', es: 'Copiar WhatsApp', pt: 'Copiar WhatsApp', tr: 'WhatsApp\'ı Kopyala' })}
                                </button>
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#94A3B8' : '#475569', marginBottom: 10 }}>{tx(lang, { fr: 'Liste des passagers présents aujourd\'hui', ar: 'قائمة الركاب الحاضرين اليوم', en: 'List of passengers present today', es: 'Lista de pasajeros presentes hoy', pt: 'Lista de passageiros presentes hoje', tr: 'Bugün mevcut yolcu listesi' })} :</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                                {presentWorkers.map(w => (
                                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, border: '1px solid #E2E8F0', background: isDark ? '#14211C' : '#F8FAFC' }}>
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: 13, color: isDark ? '#EAF1ED' : '#1E293B' }}>{w.full_name}</div>
                                      <div style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>
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
                                <div style={{ textAlign: 'center', padding: '20px 0', color: isDark ? '#64748B' : '#94A3B8', fontSize: 12 }}>
                                  {tx(lang, { fr: 'Aucun passager présent sur cette ligne aujourd\'hui.', ar: 'لا يوجد ركاب حاضرون على هذا الخط اليوم.', en: 'No passengers present on this line today.', es: 'Ningún pasajero presente en esta línea hoy.', pt: 'Nenhum passageiro presente nesta linha hoje.', tr: 'Bugün bu hatta mevcut yolcu yok.' })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {transportLignes.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, background: isDark ? '#1D2E28' : '#fff', borderRadius: 14, border: '1px dashed #CBD5E1', color: isDark ? '#94A3B8' : '#64748B' }}>
                          {tx(lang, { fr: 'Aucune ligne de transport enregistrée. Rendez-vous sur l\'onglet "Gestion des Lignes" pour en ajouter une.', ar: 'لا يوجد خط نقل مسجل. انتقل إلى علامة التبويب "إدارة الخطوط" لإضافة واحد.', en: 'No transport line registered. Go to the "Line Management" tab to add one.', es: 'Ninguna línea de transporte registrada. Vaya a la pestaña "Gestión de Líneas" para agregar una.', pt: 'Nenhuma linha de transporte registrada. Vá para a guia "Gerenciamento de Linhas" para adicionar uma.', tr: 'Kayıtlı ulaşım hattı yok. Eklemek için "Hat Yönetimi" sekmesine gidin.' })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* VIEW 3: GESTION DES LIGNES */}
                {transportSubTab === 'lignes' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                      <button onClick={() => { setSelectedLigne({ nom: '', code_ligne: '', quartier: '', chauffeur_nom: '', chauffeur_tel: '', matricule_vehicule: '', capacite: 15, notes: '' }); setShowLigneModal(true); }} style={_btnPrimary}>
                        <Plus size={15} style={{ marginRight: 6 }} /> {tx(lang, { fr: 'Ajouter Ligne', ar: 'إضافة خط', en: 'Add Line', es: 'Agregar Línea', pt: 'Adicionar Linha', tr: 'Hat Ekle' })}
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                      {transportLignes.map(l => (
                        <div key={l.id} style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: isDark ? '#EAF1ED' : '#1E293B' }}>
                                {l.code_ligne ? `[${l.code_ligne}] ` : ''}{l.nom}
                              </h4>
                              <span style={{ fontSize: 11, background: '#F0FDF4', color: '#166534', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                                Capacité: {l.capacite || 0}
                              </span>
                            </div>
                            <div style={{ marginTop: 12, fontSize: 13, color: isDark ? '#94A3B8' : '#475569', display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {l.quartier && <div>📍 Quartier (Hay): <strong>{l.quartier}</strong></div>}
                              <div>👤 Chauffeur: <strong>{l.chauffeur_nom || '—'}</strong></div>
                              {l.chauffeur_tel && (
                                <div>📞 Téléphone: <a href={`tel:${l.chauffeur_tel}`} style={{ color: isDark ? '#818cf8' : '#2149C1', fontWeight: 600 }}>{l.chauffeur_tel}</a></div>
                              )}
                              <div>🚗 Véhicule: <strong>{l.matricule_vehicule || '—'}</strong></div>
                              {l.notes && <div style={{ fontSize: 12, color: isDark ? '#64748B' : '#94A3B8', fontStyle: 'italic', marginTop: 4 }}>📝 {l.notes}</div>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #F1F5F9', paddingTop: 12, marginTop: 12, justifyContent: 'flex-end' }}>
                            <button onClick={() => { setSelectedLigne(l); setShowLigneModal(true); }}
                              style={{ ..._btnSecondary, fontSize: 11, padding: '4px 8px' }}>
                              <Edit3 size={12} style={{ marginRight: 4 }} /> {tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })}
                            </button>
                            <button onClick={() => handleDeleteLigne(l.id, l.nom)}
                              style={{ padding: '4px 8px', border: '1px solid #FEE2E2', borderRadius: 6, background: '#FFF5F5', color: '#991B1B', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                              <Trash2 size={12} style={{ marginRight: 4 }} /> {tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' })}
                            </button>
                          </div>
                        </div>
                      ))}
                      {transportLignes.length === 0 && (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: isDark ? '#64748B' : '#94A3B8' }}>
                          {tx(lang, { fr: 'Aucune ligne de transport enregistrée.', ar: 'لا يوجد خط نقل مسجل.', en: 'No transport line registered.', es: 'Ninguna línea de transporte registrada.', pt: 'Nenhuma linha de transporte registrada.', tr: 'Kayıtlı ulaşım hattı yok.' })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Ligne Modal */}
                {showLigneModal && (
                  <div style={{ position: 'fixed', inset: 0, background: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 25px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isDark ? '#EAF1ED' : '#0F172A' }}>
                          {selectedLigne?.id ? tx(lang, { fr: 'Modifier la ligne de transport', ar: 'تعديل خط النقل', en: 'Edit Transport Line', es: 'Editar Línea de Transporte', pt: 'Editar Linha de Transporte', tr: 'Taşıma Hattını Düzenle' }) : tx(lang, { fr: 'Ajouter une ligne de transport', ar: 'إضافة خط نقل', en: 'Add a Transport Line', es: 'Agregar una Línea de Transporte', pt: 'Adicionar uma Linha de Transporte', tr: 'Taşıma Hattı Ekle' })}
                        </h3>
                        <button onClick={() => setShowLigneModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#64748B' : '#94A3B8' }}><X size={18} /></button>
                      </div>
                      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                          <div>
                            <label style={_labelStyle}>{tx(lang, { fr: 'Code Ligne *', ar: 'رمز الخط *', en: 'Line Code *', es: 'Código de Línea *', pt: 'Código da Linha *', tr: 'Hat Kodu *' })}</label>
                            <input type="text" value={selectedLigne?.code_ligne ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, code_ligne: e.target.value }) : null)}
                              placeholder="ex: L1" style={_inputStyle} />
                          </div>
                          <div>
                            <label style={_labelStyle}>{tx(lang, { fr: 'Nom de la ligne *', ar: 'اسم الخط *', en: 'Line Name *', es: 'Nombre de la línea *', pt: 'Nome da linha *', tr: 'Hat Adı *' })}</label>
                            <input type="text" value={selectedLigne?.nom ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, nom: e.target.value }) : null)}
                              placeholder="ex: Ligne 1" style={_inputStyle} />
                          </div>
                        </div>
                        <div>
                          <label style={_labelStyle}>{tx(lang, { fr: 'Quartier / Destination (Hay)', ar: 'الحي / الوجهة', en: 'District / Destination', es: 'Barrio / Destino', pt: 'Bairro / Destino', tr: 'Mahalle / Varış Noktası' })}</label>
                          <input type="text" value={selectedLigne?.quartier ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, quartier: e.target.value }) : null)}
                            placeholder="ex: Hay Mohammadi" style={_inputStyle} />
                        </div>
                        <div>
                          <label style={_labelStyle}>{tx(lang, { fr: 'Nom du Chauffeur', ar: 'اسم السائق', en: 'Driver Name', es: 'Nombre del Conductor', pt: 'Nome do Motorista', tr: 'Şoför Adı' })}</label>
                          <input type="text" value={selectedLigne?.chauffeur_nom ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, chauffeur_nom: e.target.value }) : null)}
                            placeholder="ex: Mohamed" style={_inputStyle} />
                        </div>
                        <div>
                          <label style={_labelStyle}>{tx(lang, { fr: 'Téléphone du Chauffeur', ar: 'هاتف السائق', en: 'Driver Phone', es: 'Teléfono del Conductor', pt: 'Telefone do Motorista', tr: 'Şoför Telefonu' })}</label>
                          <input type="text" value={selectedLigne?.chauffeur_tel ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, chauffeur_tel: e.target.value }) : null)}
                            placeholder="ex: 0612345678" style={_inputStyle} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                          <div>
                            <label style={_labelStyle}>{tx(lang, { fr: 'Matricule du véhicule', ar: 'رقم المركبة', en: 'Vehicle Registration', es: 'Matrícula del vehículo', pt: 'Matrícula do veículo', tr: 'Araç Plakası' })}</label>
                            <input type="text" value={selectedLigne?.matricule_vehicule ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, matricule_vehicule: e.target.value }) : null)}
                              placeholder="ex: 12345-A-6" style={_inputStyle} />
                          </div>
                          <div>
                            <label style={_labelStyle}>{tx(lang, { fr: 'Capacité', ar: 'السعة', en: 'Capacity', es: 'Capacidad', pt: 'Capacidade', tr: 'Kapasite' })}</label>
                            <input type="number" value={selectedLigne?.capacite ?? 0} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, capacite: parseInt(e.target.value) || 0 }) : null)}
                              placeholder="ex: 15" style={_inputStyle} />
                          </div>
                        </div>
                        <div>
                          <label style={_labelStyle}>{tx(lang, { fr: 'Notes', ar: 'ملاحظات', en: 'Notes', es: 'Notas', pt: 'Notas', tr: 'Notlar' })}</label>
                          <textarea value={selectedLigne?.notes ?? ''} onChange={e => setSelectedLigne(prev => prev ? ({ ...prev, notes: e.target.value }) : null)}
                            placeholder={tx(lang, { fr: 'Notes additionnelles...', ar: 'ملاحظات إضافية...', en: 'Additional notes...', es: 'Notas adicionales...', pt: 'Notas adicionais...', tr: 'Ek notlar...' })} rows={3} style={{ ..._inputStyle, resize: 'vertical' }} />
                        </div>
                      </div>
                      <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button onClick={() => setShowLigneModal(false)} style={_btnSecondary}>{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}</button>
                        <button onClick={handleSaveLigne} style={_btnPrimary}>{tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Salvar', tr: 'Kaydet' })}</button>
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
                <div style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 14, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: isDark ? '#EAF1ED' : '#0F172A' }}>{tx(lang, { fr: 'Générer Export Paie', ar: 'توليد تصدير الرواتب', en: 'Generate Payroll Export', es: 'Generar Exportación de Nómina', pt: 'Gerar Exportação de Folha', tr: 'Maaş Bordrosu Dışa Aktar' })}</h3>
                  <div style={{ marginBottom: 16 }}>
                    <label style={_labelStyle}>{tx(lang, { fr: 'Période', ar: 'الفترة', en: 'Period', es: 'Período', pt: 'Período', tr: 'Dönem' })}</label>
                    <input type="month" value={selectedMois} onChange={e => setSelectedMois(e.target.value)}
                      style={{ ..._inputStyle }} />
                  </div>

                  {sagePreview && sagePreview.rows && (
                    <div style={{ background: isDark ? '#14211C' : '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 8 }}>{tx(lang, { fr: 'Aperçu', ar: 'معاينة', en: 'Preview', es: 'Vista previa', pt: 'Visualização', tr: 'Önizleme' })} {selectedMois}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                          { label: tx(lang, { fr: 'Salariés', ar: 'الموظفون', en: 'Employees', es: 'Empleados', pt: 'Funcionários', tr: 'Çalışanlar' }), value: sagePreview.rows.length },
                          { label: tx(lang, { fr: 'Masse brute', ar: 'الكتلة الإجمالية', en: 'Gross mass', es: 'Masa bruta', pt: 'Massa bruta', tr: 'Brüt kütle' }), value: sagePreview.rows.reduce((s: number, r: any) => s + (r.total_brut || 0), 0).toLocaleString() + ' MAD' },
                        ].map(k => (
                          <div key={k.label} style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid #E2E8F0' }}>
                            <div style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8' }}>{k.label}</div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: isDark ? '#EAF1ED' : '#0F172A' }}>{k.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ background: '#FEF3C7', borderRadius: 8, padding: 10, fontSize: 12, color: '#92400E', marginBottom: 16 }}>
                    {tx(lang, { fr: '⚖️ Conforme Art. 385 — Déduction avances plafonnée automatiquement à 1/10ème du salaire net', ar: '⚖️ وفقاً للمادة 385 — خصم السلفات محدود تلقائياً بـ 1/10 من الراتب الصافي', en: '⚖️ Under Art. 385 — Advance deductions automatically capped at 1/10 of net salary', es: '⚖️ Conforme Art. 385 — Deducción de anticipos limitada automáticamente a 1/10 del salario neto', pt: '⚖️ Conforme Art. 385 — Dedução de adiantamentos limitada automaticamente a 1/10 do salário líquido', tr: '⚖️ Madde 385 uyarınca — Avans kesintileri otomatik olarak net maaşın 1/10\'u ile sınırlıdır' })}
                  </div>

                  <button onClick={handleGenerateSage} disabled={generatingSage}
                    style={{ ..._btnPrimary, width: '100%', justifyContent: 'center', marginBottom: 10 }}>
                    <Download size={15} style={{ marginRight: 8 }} />
                    {generatingSage ? tx(lang, { fr: 'Génération...', ar: 'جارٍ التوليد...', en: 'Generating...', es: 'Generando...', pt: 'Gerando...', tr: 'Oluşturuluyor...' }) : tx(lang, { fr: `Télécharger CSV Sage — ${selectedMois}`, ar: `تنزيل CSV Sage — ${selectedMois}`, en: `Download CSV Sage — ${selectedMois}`, es: `Descargar CSV Sage — ${selectedMois}`, pt: `Baixar CSV Sage — ${selectedMois}`, tr: `CSV Sage İndir — ${selectedMois}` })}
                  </button>
                  <div style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8', textAlign: 'center', marginBottom: 16 }}>
                    {tx(lang, { fr: 'Format: UTF-8 BOM • Séparateur: point-virgule • Compatible Excel & Sage', ar: 'التنسيق: UTF-8 BOM • الفاصل: فاصلة منقوطة • متوافق مع Excel & Sage', en: 'Format: UTF-8 BOM • Separator: semicolon • Compatible with Excel & Sage', es: 'Formato: UTF-8 BOM • Separador: punto y coma • Compatible con Excel & Sage', pt: 'Formato: UTF-8 BOM • Separador: ponto e vírgula • Compatível com Excel & Sage', tr: 'Biçim: UTF-8 BOM • Ayırıcı: noktalı virgül • Excel & Sage ile uyumlu' })}
                  </div>

                  <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>{tx(lang, { fr: 'Rapport RH Mensuel Excel', ar: 'تقرير الموارد البشرية الشهري Excel', en: 'Monthly HR Report Excel', es: 'Informe RH Mensual Excel', pt: 'Relatório RH Mensal Excel', tr: 'Aylık İK Raporu Excel' })}</div>
                    <button onClick={handleExportExcelRH}
                      style={{ ..._btnSecondary, width: '100%', justifyContent: 'center', borderColor: '#10B981', color: '#065F46' }}>
                      <Download size={15} style={{ marginRight: 8 }} />
                      {tx(lang, { fr: `Exporter Excel — ${selectedMois}`, ar: `تصدير Excel — ${selectedMois}`, en: `Export Excel — ${selectedMois}`, es: `Exportar Excel — ${selectedMois}`, pt: `Exportar Excel — ${selectedMois}`, tr: `Excel Dışa Aktar — ${selectedMois}` })}
                    </button>
                    <div style={{ marginTop: 6, fontSize: 11, color: isDark ? '#64748B' : '#94A3B8' }}>
                      {tx(lang, { fr: '3 feuilles: Rapport Mensuel • Avances • Résumé', ar: '3 أوراق: التقرير الشهري • السلفات • الملخص', en: '3 sheets: Monthly Report • Advances • Summary', es: '3 hojas: Informe Mensual • Anticipos • Resumen', pt: '3 folhas: Relatório Mensal • Adiantamentos • Resumo', tr: '3 sayfa: Aylık Rapor • Avanslar • Özet' })}
                    </div>
                  </div>
                </div>

                {/* Historique */}
                <div style={{ background: isDark ? '#1D2E28' : '#fff', borderRadius: 14, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: isDark ? '#EAF1ED' : '#0F172A' }}>{tx(lang, { fr: 'Historique des Exports', ar: 'سجل التصدير', en: 'Export History', es: 'Historial de Exportaciones', pt: 'Histórico de Exportações', tr: 'Dışa Aktarım Geçmişi' })}</h3>
                  {sageExports.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 30, color: isDark ? '#64748B' : '#94A3B8' }}>
                      <FileText size={36} style={{ marginBottom: 8, opacity: 0.3 }} />
                      <div>{tx(lang, { fr: 'Aucun export généré', ar: 'لم يتم إنشاء أي تصدير', en: 'No export generated', es: 'Ninguna exportación generada', pt: 'Nenhuma exportação gerada', tr: 'Dışa aktarma oluşturulmadı' })}</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {sageExports.map((e: any) => (
                        <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 10 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: isDark ? '#EAF1ED' : '#0F172A' }}>{e.mois}</div>
                            <div style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8' }}>{new Date(e.date_export).toLocaleDateString('fr-FR')}</div>
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
