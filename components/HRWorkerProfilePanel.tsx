import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  User, Edit3, Calendar, Clock, Factory, DollarSign, Award, FileText, AlertTriangle, ChevronLeft, Key, Phone,
} from 'lucide-react';
import { HRWorker, HRWorkerRole, HRPointageStatus, AppSettings } from '../types';
import { tx, type TxMap } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';
import { useIsDark } from '../src/context/ThemeContext';

const uid = () => `hr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type PtgDraft = {
  id: string;
  date: string;
  heure_entree: string;
  heure_sortie: string;
  pause_debut: string;
  pause_fin: string;
  heures_normales: string;
  heures_supp_25: string;
  heures_supp_50: string;
  statut: string;
  motif_absence: string;
};

const API = (path: string, opts?: RequestInit) =>
  fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });

/** Évite le message brut « Unexpected token '<' » quand on reçoit du HTML (SPA, proxy, vieux serveur sans la route dossier). */
function parseApiJsonBody(raw: string, lang: string): unknown {
  const lead = raw.trimStart();
  if (lead.startsWith('<!') || lead.toLowerCase().startsWith('<html')) {
    const page = typeof window !== 'undefined' ? window.location.origin : '';
    throw new Error(
      `L’adresse actuelle (${page || '?'}) renvoie du HTML pour l’API au lieu de JSON. ` +
        'Solution : ouvrez http://localhost:8000 après la commande « npm run dev » dans le dossier du projet (API + interface sur le même port). ' +
        'Si vous utilisez Vite seul (port 5173) ou « vite preview » (4173), lancez en parallèle « npm run dev » sur le port 8000 : le proxy transmet /api vers le backend.'
    );
  }
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(tx(lang, {fr:'Réponse du serveur illisible (JSON attendu).',ar:'استجابة الخادم غير قابلة للقراءة (JSON متوقع).',en:'Unreadable server response (JSON expected).',es:'Respuesta del servidor ilegible (JSON esperado).',pt:'Resposta do servidor ilegível (JSON esperado).',tr:'Okunamayan sunucu yanıtı (JSON bekleniyor).'}));
  }
}

/** Recouvre le viewport (évite l’apparition au-dessus d’une seule bande en flex) */
const overlayRoot: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 };

const ALL_ROLES: HRWorkerRole[] = ['OPERATOR', 'SUPERVISOR', 'MECHANIC', 'ADMIN', 'QC', 'IRON', 'CUTTER', 'PACKER'];
const ROLE_LABELS_FR: Record<HRWorkerRole, string> = {
  OPERATOR: 'Opérateur', SUPERVISOR: 'Superviseur', MECHANIC: 'Mécanicien',
  ADMIN: 'Admin', QC: 'Contrôle Q.', IRON: 'Repassage', CUTTER: 'Coupeur', PACKER: 'Emballage',
};
const ROLE_LABELS = (lang: string): Record<HRWorkerRole, string> => ({
  OPERATOR: tx(lang, {fr:'Opérateur',ar:'مشغل',en:'Operator',es:'Operador',pt:'Operador',tr:'Operatör'}),
  SUPERVISOR: tx(lang, {fr:'Superviseur',ar:'مشرف',en:'Supervisor',es:'Supervisor',pt:'Supervisor',tr:'Süpervizör'}),
  MECHANIC: tx(lang, {fr:'Mécanicien',ar:'ميكانيكي',en:'Mechanic',es:'Mecánico',pt:'Mecânico',tr:'Mekanik'}),
  ADMIN: tx(lang, {fr:'Admin',ar:'مدير',en:'Admin',es:'Admin',pt:'Admin',tr:'Admin'}),
  QC: tx(lang, {fr:'Contrôle Q.',ar:'مراقبة جودة',en:'QC',es:'Control Q.',pt:'Controle Q.',tr:'Kalite Kontrol'}),
  IRON: tx(lang, {fr:'Repassage',ar:'كي',en:'Ironing',es:'Planchado',pt:'Passadoria',tr:'Ütü'}),
  CUTTER: tx(lang, {fr:'Coupeur',ar:'قصّاص',en:'Cutter',es:'Cortador',pt:'Cortador',tr:'Kesici'}),
  PACKER: tx(lang, {fr:'Emballage',ar:'تغليف',en:'Packing',es:'Empaque',pt:'Embalagem',tr:'Paketleme'}),
});

const STATUS_COLORS: Record<HRPointageStatus, { color: string; bg: string }> = {
  PRESENT:  { color: '#065F46', bg: '#D1FAE5' },
  RETARD:   { color: '#92400E', bg: '#FEF3C7' },
  ABSENT:   { color: '#991B1B', bg: '#FEE2E2' },
  CONGE:    { color: '#1E40AF', bg: '#DBEAFE' },
  MALADIE:  { color: '#6B21A8', bg: '#F3E8FF' },
  MISSION:  { color: '#0F766E', bg: '#CCFBF1' },
  FERIE:    { color: '#374151', bg: '#F3F4F6' },
};
const STATUS = (lang: string): Record<HRPointageStatus, { label: string; color: string; bg: string }> => {
  const c = STATUS_COLORS;
  return {
    PRESENT:  { label: tx(lang, {fr:'Présent',ar:'حاضر',en:'Present',es:'Presente',pt:'Presente',tr:'Mevcut'}), ...c.PRESENT },
    RETARD:   { label: tx(lang, {fr:'Retard',ar:'متأخر',en:'Late',es:'Tarde',pt:'Atrasado',tr:'Geç'}), ...c.RETARD },
    ABSENT:   { label: tx(lang, {fr:'Absent',ar:'غائب',en:'Absent',es:'Ausente',pt:'Ausente',tr:'Yok'}), ...c.ABSENT },
    CONGE:    { label: tx(lang, {fr:'Congé',ar:'إجازة',en:'Leave',es:'Permiso',pt:'Férias',tr:'İzin'}), ...c.CONGE },
    MALADIE:  { label: tx(lang, {fr:'Maladie',ar:'مرض',en:'Sick',es:'Enfermedad',pt:'Doença',tr:'Hastalık'}), ...c.MALADIE },
    MISSION:  { label: tx(lang, {fr:'Mission',ar:'مهمة',en:'Mission',es:'Misión',pt:'Missão',tr:'Görev'}), ...c.MISSION },
    FERIE:    { label: tx(lang, {fr:'Férié',ar:'عطلة رسمية',en:'Holiday',es:'Festivo',pt:'Feriado',tr:'Resmî tatil'}), ...c.FERIE },
  };
};

const subTabsDefs = [
  { id: 'synthese' as const, key: 'Synthèse', icon: User },
  { id: 'pointage' as const, key: 'Pointage', icon: Clock },
  { id: 'production' as const, key: 'Production', icon: Factory },
  { id: 'avances' as const, key: 'Avances', icon: DollarSign },
  { id: 'sage' as const, key: 'Aperçu paie (mois)', icon: FileText },
  { id: 'competences' as const, key: 'Compétences', icon: Award },
];
const TAB_LABELS: Record<string, {fr:string;ar:string;en:string;es:string;pt:string;tr:string}> = {
  'Synthèse': {fr:'Synthèse',ar:'ملخص',en:'Summary',es:'Resumen',pt:'Resumo',tr:'Özet'},
  'Pointage': {fr:'Pointage',ar:'تسجيل الحضور',en:'Attendance',es:'Asistencia',pt:'Ponto',tr:'Yoklama'},
  'Production': {fr:'Production',ar:'الإنتاج',en:'Production',es:'Producción',pt:'Produção',tr:'Üretim'},
  'Avances': {fr:'Avances',ar:'السلف',en:'Advances',es:'Anticipos',pt:'Adiantamentos',tr:'Avanslar'},
  'Aperçu paie (mois)': {fr:'Aperçu paie (mois)',ar:'ملخص الراتب (شهر)',en:'Pay preview (month)',es:'Resumen de nómina (mes)',pt:'Pré-visualização salarial (mês)',tr:'Maaş önizleme (ay)'},
  'Compétences': {fr:'Compétences',ar:'المهارات',en:'Skills',es:'Competencias',pt:'Competências',tr:'Yetenekler'},
};

export interface DossierPayload {
  worker: HRWorker;
  pointage: any[];
  production: any[];
  avances: any[];
  sage_preview: { mois: string; matricule: string; nom: string; cin: string | null; nb_jours: number; total_brut: number; net_a_payer: number };
  skills: any[];
  skills_matched: boolean;
  skills_note: string;
  meta: { pointage_mois: string; date_from: string; date_to: string };
}

type Props = {
  workerId: string;
  onClose: () => void;
  onEdit: (w: HRWorker) => void;
  settings?: AppSettings;
};

export function HRWorkerProfilePanel({ workerId, onClose, onEdit, settings }: Props) {
  const { lang } = useLang();
  const isDark = useIsDark();
  const _ = useCallback((m: TxMap) => tx(lang, m), [lang]);
  const [mois, setMois] = useState(() => new Date().toISOString().slice(0, 7));
  const [sub, setSub] = useState<(typeof subTabsDefs)[number]['id']>('synthese');
  const [dossier, setDossier] = useState<DossierPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, PtgDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const autoRecalcHeures = settings?.hrAutoOvertime !== false;
  const comptaRef = settings?.hrComptaPointageRef === 'normales_paie' ? 'normales_paie' : 'pointees';
  const styles = useMemo(() => ({
    styles.labelStyle: { display: 'block', fontSize: 11, fontWeight: 600, color: isDark ? '#9DB5AB' : '#64748B', marginBottom: 2 } as React.CSSProperties,
    styles.inputStyle: { border: `1px solid ${isDark ? '#2E463C' : '#E2E8F0'}`, borderRadius: 8, padding: '6px 10px', fontSize: 13, color: isDark ? '#EAF1ED' : '#0F172A', background: isDark ? '#1D2E28' : '#fff' } as React.CSSProperties,
    styles.btnPrimary: { display: 'inline-flex', alignItems: 'center', padding: '8px 16px', background: '#2F9E64', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 } as React.CSSProperties,
    card: { background: isDark ? '#1D2E28' : '#fff', borderRadius: 12, border: `1px solid ${isDark ? '#2E463C' : '#E2E8F0'}`, padding: 16, marginBottom: 14 } as React.CSSProperties,
    th: { padding: '8px 10px', textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: isDark ? '#9DB5AB' : '#64748B', borderBottom: `1px solid ${isDark ? '#2E463C' : '#E2E8F0'}` } as React.CSSProperties,
    td: { padding: '8px 10px', fontSize: 12, borderBottom: `1px solid ${isDark ? '#243A31' : '#F1F5F9'}`, color: isDark ? '#C2D2CA' : undefined } as React.CSSProperties,
  }), [isDark]);

  useEffect(() => {
    if (!dossier) {
      setDrafts({});
      return;
    }
    const d: Record<string, PtgDraft> = {};
    for (const p of (dossier.pointage || []) as any[]) {
      d[p.id] = {
        id: p.id,
        date: String(p.date || ''),
        heure_entree: p.heure_entree != null ? String(p.heure_entree) : '',
        heure_sortie: p.heure_sortie != null ? String(p.heure_sortie) : '',
        pause_debut: p.pause_debut != null ? String(p.pause_debut) : '',
        pause_fin: p.pause_fin != null ? String(p.pause_fin) : '',
        heures_normales: p.heures_normales != null ? String(p.heures_normales) : '',
        heures_supp_25: p.heures_supp_25 != null ? String(p.heures_supp_25) : '',
        heures_supp_50: p.heures_supp_50 != null ? String(p.heures_supp_50) : '',
        statut: String(p.statut || 'PRESENT'),
        motif_absence: p.motif_absence != null ? String(p.motif_absence) : '',
      };
    }
    setDrafts(d);
  }, [dossier]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const u = new URLSearchParams();
      u.set('pointage_mois', mois);
      const r = await API(`/api/hr/workers/${encodeURIComponent(workerId)}/dossier?${u.toString()}`);
      const raw = await r.text();
      const body = parseApiJsonBody(raw, lang) as Record<string, unknown> | null;
      const apiMsg = typeof body?.message === 'string' ? body.message : null;
      if (r.status === 404) {
        setErr(apiMsg || 'Fiche introuvable ou accès refusé.');
        setDossier(null);
      } else if (!r.ok) {
        setErr(apiMsg || `Erreur ${r.status}`);
        setDossier(null);
      } else if (!body || typeof body !== 'object' || !('worker' in body)) {
        setErr('Réponse dossier invalide (structure inattendue).');
        setDossier(null);
      } else {
        setDossier(body as unknown as DossierPayload);
      }
    } catch (e) {
      setDossier(null);
      setErr(e instanceof Error ? e.message : 'Erreur réseau ou réponse invalide.');
    } finally {
      setLoading(false);
    }
  }, [workerId, mois]);

  useEffect(() => { load(); }, [load]);

  const w0 = dossier?.worker;
  const roleK: HRWorkerRole =
    w0?.role && ALL_ROLES.includes(w0.role as HRWorkerRole) ? (w0.role as HRWorkerRole) : 'OPERATOR';

  const daysPresent = useMemo(() => {
    const s = new Set<string>();
    (dossier?.pointage || []).forEach((p: any) => {
      if (p.statut === 'PRESENT' || p.statut === 'RETARD') s.add(p.date);
    });
    return s;
  }, [dossier?.pointage]);

  if (loading && !dossier) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ ...overlayRoot, background: isDark ? 'rgba(20,33,28,0.95)' : 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ color: isDark ? '#9DB5AB' : '#64748B', fontSize: 14 }}>{_({fr:'Chargement du dossier…',ar:'جاري تحميل الملف…',en:'Loading file…',es:'Cargando expediente…',pt:'Carregando dossiê…',tr:'Dosya yükleniyor…'})}</div>
      </motion.div>
    );
  }

  if (err || !dossier) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        style={{ ...overlayRoot, background: isDark ? '#14211C' : '#F8F9FA', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, background: isDark ? '#1D2E28' : '#fff', borderBottom: `1px solid ${isDark ? '#2E463C' : '#E2E8F0'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: isDark ? '#2F9E64' : '#2149C1', fontWeight: 600, cursor: 'pointer' }}>
            <ChevronLeft size={18} /> {_({fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}
          </button>
        </div>
        <div style={{ padding: 24, color: '#EF4444', fontWeight: 600 }}>{err || _({fr:'Aucune donnée',ar:'لا توجد بيانات',en:'No data',es:'Sin datos',pt:'Sem dados',tr:'Veri yok'})}</div>
      </motion.div>
    );
  }

  const w = dossier.worker;
  const hasPin = !!(w as { has_pin?: number | boolean }).has_pin;

  const patchDraft = (id: string, field: keyof PtgDraft, value: string) => {
    setDrafts(prev => ({
      ...prev,
      [id]: { ...(prev[id] || ({} as PtgDraft)), id, [field]: value } as PtgDraft,
    }));
  };

  const addPointageDraftRow = () => {
    const tempId = `new-${uid()}`;
    setDrafts(prev => ({
      ...prev,
      [tempId]: {
        id: tempId,
        date: `${mois}-01`,
        heure_entree: '08:00',
        heure_sortie: '17:00',
        pause_debut: '12:00',
        pause_fin: '13:00',
        heures_normales: '8',
        heures_supp_25: '0',
        heures_supp_50: '0',
        statut: 'PRESENT',
        motif_absence: '',
      },
    }));
  };

  const savePointageDraft = async (pid: string) => {
    const row = drafts[pid];
    if (!row?.date) {
      alert(_({fr:'Indiquez une date.',ar:'حدد تاريخاً.',en:'Enter a date.',es:'Indique una fecha.',pt:'Indique uma data.',tr:'Bir tarih belirtin.'}));
      return;
    }
    setSavingId(pid);
    try {
      const num = (v: string) => {
        if (v === '' || v == null) return 0;
        const n = Number(String(v).replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
      };
      const isNew = String(row.id).startsWith('new-');
      const hn = num(row.heures_normales);
      const s25 = num(row.heures_supp_25);
      const s50 = num(row.heures_supp_50);
      const trav = hn + s25 + s50;
      const payload: Record<string, unknown> = {
        worker_id: workerId,
        date: row.date,
        heure_entree: row.heure_entree?.trim() || null,
        heure_sortie: row.heure_sortie?.trim() || null,
        pause_debut: row.pause_debut?.trim() || null,
        pause_fin: row.pause_fin?.trim() || null,
        heures_travaillees: trav,
        heures_normales: hn,
        heures_supp_25: s25,
        heures_supp_50: s50,
        statut: row.statut || 'PRESENT',
        motif_absence: row.motif_absence?.trim() || null,
      };
      if (!isNew) payload.id = row.id;
      const r = await API('/api/hr/pointage', { method: 'POST', body: JSON.stringify(payload) });
      const raw = await r.text();
      if (!r.ok) {
        let msg = `Erreur ${r.status}`;
        try {
          const b = parseApiJsonBody(raw, lang) as { message?: string };
          if (b && typeof b === 'object' && typeof b.message === 'string') msg = b.message;
        } catch {
          /* ignore */
        }
        alert(msg);
        return;
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setSavingId(null);
    }
  };

  const savePin = async () => {
    if (!/^\d{4,8}$/.test(pin1)) {
      alert(_({fr:'PIN : 4 à 8 chiffres.',ar:'رقم التعريف الشخصي: 4 إلى 8 أرقام.',en:'PIN: 4 to 8 digits.',es:'PIN: 4 a 8 dígitos.',pt:'PIN: 4 a 8 dígitos.',tr:'PIN: 4 ila 8 hane.'}));
      return;
    }
    if (pin1 !== pin2) {
      alert(_({fr:'Confirmation PIN différente.',ar:'تأكيد رقم التعريف غير متطابق.',en:'PIN confirmation does not match.',es:'La confirmación del PIN no coincide.',pt:'A confirmação do PIN não corresponde.',tr:'PIN onayı eşleşmiyor.'}));
      return;
    }
    setPinBusy(true);
    try {
      const r = await API(`/api/hr/workers/${encodeURIComponent(workerId)}/pin`, {
        method: 'POST',
        body: JSON.stringify({ pin: pin1 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert((d as { message?: string }).message || 'Erreur');
        return;
      }
      setPin1('');
      setPin2('');
      await load();
      alert(_({fr:'PIN enregistré.',ar:'تم حفظ رقم التعريف الشخصي.',en:'PIN saved.',es:'PIN guardado.',pt:'PIN salvo.',tr:'PIN kaydedildi.'}));
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      style={{ ...overlayRoot, background: isDark ? '#14211C' : '#F8F9FA', display: 'flex', flexDirection: 'column' }}
    >
      {/* Top bar */}
      <div style={{ background: isDark ? '#1D2E28' : '#fff', borderBottom: `1px solid ${isDark ? '#2E463C' : '#E2E8F0'}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: isDark ? '#2F9E64' : '#2149C1', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            <ChevronLeft size={18} /> {_({fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} color="#64748B" />
            <input type="month" value={mois} onChange={e => setMois(e.target.value)} style={{ ...styles.inputStyle, width: 150 }} title={tx(lang, {fr:'Période pointage / production',ar:'فترة الحضور / الإنتاج',en:'Attendance / Production period',es:'Período de asistencia / producción',pt:'Período de ponto / produção',tr:'Devam / Üretim dönemi'})} />
          </div>
          <button type="button" onClick={() => onEdit(w)} style={styles.btnPrimary}>
            <Edit3 size={15} style={{ marginRight: 6 }} /> {_({fr:'Modifier la fiche',ar:'تعديل الملف',en:'Edit file',es:'Editar ficha',pt:'Editar ficha',tr:'Dosyayı düzenle'})}
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ background: isDark ? '#1D2E28' : '#fff', borderBottom: `1px solid ${isDark ? '#2E463C' : '#E2E8F0'}`, display: 'flex', gap: 2, padding: '0 16px', flexWrap: 'wrap' }}>
        {subTabsDefs.map(t => {
          const lbl = _(TAB_LABELS[t.key] || {fr:t.key,ar:t.key,en:t.key,es:t.key,pt:t.key,tr:t.key});
          return (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: sub === t.id ? (isDark ? '#6EE7B7' : '#2149C1') : (isDark ? '#9DB5AB' : '#64748B'),
              borderBottom: sub === t.id ? `2px solid ${isDark ? '#2F9E64' : '#2149C1'}` : '2px solid transparent',
            }}
          >
            <t.icon size={14} />{lbl}
          </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20, color: isDark ? '#EAF1ED' : undefined }}>
        {sub === 'synthese' && (
          <>
            <div style={{ ...styles.card, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: w.photo ? 'transparent' : (isDark ? '#26392F' : '#EEF2FF'), border: `2px solid ${isDark ? '#2F9E64' : '#2149C1'}`, overflow: 'hidden' }}>
                {w.photo
                  ? <img src={w.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: isDark ? '#6EE7B7' : '#2149C1' }}>{(w.full_name || '?')[0]}</div>}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h2 style={{ margin: '0 0 4px 0', fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{w.full_name}</h2>
                <div style={{ fontSize: 13, color: '#64748B', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                  <span>{w.matricule}</span>
                  <span>•</span>
                  <span>{w.cin || _({fr:'CIN —',ar:'— البطاقة الوطنية',en:'ID —',es:'Cédula —',pt:'CIN —',tr:'Kimlik —'})}</span>
                  {w.phone && (
                    <>
                      <span>•</span>
                      <a href={`tel:${w.phone}`} style={{ color: '#2149C1', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={12} /> {w.phone}
                      </a>
                    </>
                  )}
                </div>
                {(w as { person_id?: string }).person_id && (
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
                    {_({fr:'Person ID :',ar:'معرف الشخص :',en:'Person ID :',es:'ID Persona :',pt:'ID Pessoa :',tr:'Kişi Kimliği :'})} {(w as { person_id?: string }).person_id}
                  </div>
                )}
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#2149C1', background: '#EEF2FF', padding: '2px 10px', borderRadius: 8 }}>{_({fr:'Chaîne:',ar:'الخط:',en:'Line:',es:'Línea:',pt:'Linha:',tr:'Hat:'})} {w.chaine_id || '—'}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', background: '#F1F5F9', padding: '2px 10px', borderRadius: 8 }}>{ROLE_LABELS(lang)[roleK]}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: w.is_active ? '#065F46' : '#991B1B', background: w.is_active ? '#D1FAE5' : '#FEE2E2', padding: '2px 10px', borderRadius: 8 }}>{w.is_active ? _({fr:'Actif',ar:'نشط',en:'Active',es:'Activo',pt:'Ativo',tr:'Aktif'}) : _({fr:'Inactif',ar:'غير نشط',en:'Inactive',es:'Inactivo',pt:'Inativo',tr:'Pasif'})}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: hasPin ? '#065F46' : '#92400E', background: hasPin ? '#D1FAE5' : '#FEF3C7', padding: '2px 10px', borderRadius: 8 }}>
                    PIN BERAOUVIER : {hasPin ? _({fr:'défini',ar:'محدد',en:'set',es:'definido',pt:'definido',tr:'tanımlanmış'}) : _({fr:'non défini',ar:'غير محدد',en:'not set',es:'no definido',pt:'não definido',tr:'tanımlanmamış'})}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ ...styles.card, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Key size={16} color="#2149C1" />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>{_({fr:'Définir / changer le PIN (app ouvrier)',ar:'تعيين / تغيير رقم التعريف الشخصي (تطبيق العامل)',en:'Set / change PIN (worker app)',es:'Establecer / cambiar PIN (app trabajador)',pt:'Definir / alterar PIN (app trabalhador)',tr:'PIN belirle/değiştir (işçi uygulaması)'})}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 400 }}>
                <div>
                  <div style={styles.labelStyle}>{_({fr:'Nouveau PIN',ar:'رقم التعريف الجديد',en:'New PIN',es:'Nuevo PIN',pt:'Novo PIN',tr:'Yeni PIN'})}</div>
                  <input type="password" value={pin1} onChange={e => setPin1(e.target.value)} style={{ ...styles.inputStyle, width: '100%' }} placeholder={_({fr:'4–8 chiffres',ar:'4-8 أرقام',en:'4–8 digits',es:'4–8 dígitos',pt:'4–8 dígitos',tr:'4-8 hane'})} />
                </div>
                <div>
                  <div style={styles.labelStyle}>{_({fr:'Confirmer',ar:'تأكيد',en:'Confirm',es:'Confirmar',pt:'Confirmar',tr:'Onayla'})}</div>
                  <input type="password" value={pin2} onChange={e => setPin2(e.target.value)} style={{ ...styles.inputStyle, width: '100%' }} />
                </div>
              </div>
              <button type="button" onClick={savePin} disabled={pinBusy} style={{ ...styles.btnPrimary, marginTop: 10 }}>
                {pinBusy ? '…' : _({fr:'Enregistrer le PIN',ar:'حفظ رقم التعريف',en:'Save PIN',es:'Guardar PIN',pt:'Salvar PIN',tr:'PIN\'i kaydet'})}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
              {[
                [_({fr:'Poste',ar:'المنصب',en:'Position',es:'Puesto',pt:'Cargo',tr:'Pozisyon'}), w.poste || '—'],
                [_({fr:'Spécialité',ar:'التخصص',en:'Specialty',es:'Especialidad',pt:'Especialidade',tr:'Uzmanlık'}), w.specialite || '—'],
                [_({fr:'Parda / Équipe',ar:'الوِرد / الفريق',en:'Shift / Team',es:'Turno / Equipo',pt:'Turno / Equipa',tr:'Vardiya / Ekip'}), (w as any).equipe || '—'],
                [_({fr:'Quartier (Ligne)',ar:'الحي (الخط)',en:'District (Line)',es:'Distrito (Línea)',pt:'Bairro (Linha)',tr:'Bölge (Hat)'}), (w as any).transport_ligne_quartier || (w as any).transport_ligne_nom ? `${(w as any).transport_ligne_quartier || '—'} (${(w as any).transport_ligne_nom || '—'})` : '—'],
                [_({fr:'Salaire base (MAD)',ar:'الراتب الأساسي (MAD)',en:'Base salary (MAD)',es:'Salario base (MAD)',pt:'Salário base (MAD)',tr:'Taban maaş (MAD)'}), w.salaire_base != null ? String(w.salaire_base) : '—'],
                [_({fr:'Taux horaire',ar:'السعر بالساعة',en:'Hourly rate',es:'Tarifa por hora',pt:'Taxa horária',tr:'Saatlik ücret'}), w.taux_horaire != null ? `${w.taux_horaire} MAD` : '—'],
                [_({fr:'Primes A/T',ar:'مكافآت الحضور/النقل',en:'Attendance/Transport bonuses',es:'Bonos asistencia/transporte',pt:'Bónus assiduidade/transporte',tr:'Devamlılık/Ulaşım primleri'}), `${w.prime_assiduite ?? 0} / ${w.prime_transport ?? 0} MAD`],
                [_({fr:'Période dossier',ar:'فترة الملف',en:'File period',es:'Período del expediente',pt:'Período do dossiê',tr:'Dosya dönemi'}), `${dossier.meta.date_from} → ${dossier.meta.date_to}`],
                [_({fr:'Jours pointage (lignes)',ar:'أيام التسجيل (أسطر)',en:'Attendance days (rows)',es:'Días de asistencia (filas)',pt:'Dias de ponto (linhas)',tr:'Yoklama günleri (satırlar)'}), String(dossier.pointage.length)],
                [_({fr:'Jours pointés (présent+retard)',ar:'أيام الحضور (حاضر+متأخر)',en:'Days worked (present+late)',es:'Días trabajados (presente+retardo)',pt:'Dias trabalhados (presente+atrasado)',tr:'Çalışılan günler (mevcut+geç)'}), String(daysPresent.size)],
              ].map(([a, b]) => (
                <div key={a} style={styles.card as React.CSSProperties}>
                  <div style={styles.labelStyle}>{a}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{b}</div>
                </div>
              ))}
            </div>

            <div style={{ ...styles.card, marginTop: 14 }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Award size={16} color="#2149C1" />
                {_({fr:'Compétences & Points Forts (Wa3ir fihom)',ar:'المهارات والنقاط القوية',en:'Skills & Strengths',es:'Competencias y Fortalezas',pt:'Competências e Pontos Fortes',tr:'Beceriler ve Güçlü Yönler'})}
              </h3>
              {dossier.skills && dossier.skills.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                  {dossier.skills.map((s: any) => (
                    <div key={s.id} style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 12px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#1E293B', fontSize: 13 }}>{s.poste_keyword}</div>
                        {s.fabric_type && <div style={{ fontSize: 11, color: '#64748B' }}>{_({fr:'Tissu:',ar:'القماش:',en:'Fabric:',es:'Tela:',pt:'Tecido:',tr:'Kumaş:'})} {s.fabric_type}</div>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, background: '#EEF2FF', color: '#2149C1', padding: '2px 8px', borderRadius: 12 }}>
                        {s.level}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#64748B', fontStyle: 'italic' }}>
                  {_({fr:"Aucune compétence enregistrée. Modifiez l'ancien effectifs ou ajoutez des opérations.",ar:"لا توجد مهارات مسجلة. عدّل الفريق القديم أو أضف عمليات.",en:"No skills recorded. Edit the old team or add operations.",es:"No hay competencias registradas. Edite el equipo anterior o añada operaciones.",pt:"Nenhuma competência registada. Edite a equipa anterior ou adicione operações.",tr:"Kayıtlı beceri yok. Eski ekibi düzenleyin veya operasyon ekleyin."})}
                </div>
              )}
            </div>
          </>
        )}

        {sub === 'pointage' && (
          <div style={styles.card}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>
              {_({fr:'Jours avec présence dans la période :',ar:'أيام الحضور في الفترة :',en:'Days with presence in the period:',es:'Días con presencia en el período:',pt:'Dias com presença no período:',tr:'Dönemde mevcut olunan günler:'})} {daysPresent.size} {_({fr:daysPresent.size !== 1 ? 'jours' : 'jour',ar:daysPresent.size !== 1 ? 'أيام' : 'يوم',en:daysPresent.size !== 1 ? 'days' : 'day',es:daysPresent.size !== 1 ? 'días' : 'día',pt:daysPresent.size !== 1 ? 'dias' : 'dia',tr:daysPresent.size !== 1 ? 'gün' : 'gün'})}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#475569',
                background: '#F1F5F9',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 12,
                lineHeight: 1.45,
              }}
            >
              <strong>{_({fr:'Édition ici :',ar:'التعديل هنا :',en:'Edit here:',es:'Editar aquí:',pt:'Editar aqui:',tr:'Buradan düzenleyin:'})}</strong> {_({fr:"une ligne par jour (contrainte base). Pour deux blocs le même jour (ex. 8h–10h puis 12h–18h), indiquez entrée / sortie globales et une pause couvrant l'écart (ex. pause 10:00–12:00).",ar:"سطر واحد لكل يوم (قيود قاعدة البيانات). لكتلتين في نفس اليوم (مثلاً 8-10 ثم 12-18)، حدد الدخول/الخروج الإجمالي واستراحة تغطي الفجوة (مثلاً استراحة 10:00-12:00).",en:"one line per day (database constraint). For two blocks on the same day (e.g. 8am–10am then 12pm–6pm), enter global entry/exit and a break covering the gap (e.g. break 10:00–12:00).",es:"una línea por día (restricción de base de datos). Para dos bloques el mismo día (ej. 8h–10h luego 12h–18h), indique entrada/salida global y una pausa que cubra el intervalo (ej. pausa 10:00–12:00).",pt:"uma linha por dia (restrição da base de dados). Para dois blocos no mesmo dia (ex. 8h–10h depois 12h–18h), indique entrada/saída global e uma pausa a cobrir o intervalo (ex. pausa 10:00–12:00).",tr:"günde bir satır (veritabanı kısıtlaması). Aynı günde iki blok için (örn. 08:00–10:00 ve 12:00–18:00), genel giriş/çıkış ve boşluğu kapsayan bir mola girin (örn. mola 10:00–12:00)."})}{' '}
              {autoRecalcHeures ? (
                <>{_({fr:"Le serveur recalcule H.N. et heures sup. à partir des horaires (paramètre « recalcul auto » activé).",ar:"يقوم الخادم بإعادة حساب الساعات العادية والإضافية من الجدول الزمني (خيار إعادة الحساب التلقائي مفعل).",en:"The server recalculates regular and overtime hours from the schedule (auto recalculate setting enabled).",es:"El servidor recalcula horas normales y extras desde el horario (opción recálculo auto activada).",pt:"O servidor recalcula horas normais e extras a partir do horário (opção de recálculo automático ativada).",tr:"Sunucu, normal ve fazla mesai saatlerini programdan yeniden hesaplar (otomatik yeniden hesaplama ayarı etkin)."})}</>
              ) : (
                <>{_({fr:'Recalcul auto désactivé : les champs H.N. / sup. ci-dessous sont enregistrés tels quels.',ar:'إعادة الحساب التلقائي معطلة: حقول الساعات العادية/الإضافية أدناه تُحفظ كما هي.',en:'Auto recalculate disabled: regular/overtime fields below are saved as-is.',es:'Recálculo auto desactivado: los campos de horas normales/extras se guardan tal cual.',pt:'Recálculo automático desativado: os campos de horas normais/extras são guardados como estão.',tr:'Otomatik yeniden hesaplama devre dışı: normal/fazla mesai alanları olduğu gibi kaydedilir.'})}</>
              )}{' '}
              {_({fr:'Réf. compta (paramètres) :',ar:'مرجع المحاسبة (الإعدادات) :',en:'Accounting ref. (settings):',es:'Ref. contable (configuración):',pt:'Ref. contabilidade (configurações):',tr:'Muhasebe referansı (ayarlar):'})} {comptaRef === 'normales_paie' ? _( {fr:'heures normales paie',ar:'ساعات عادية للراتب',en:'regular pay hours',es:'horas normales de nómina',pt:'horas normais de pagamento',tr:'normal maaş saatleri'} ) : _( {fr:'heures pointées',ar:'ساعات مسجلة',en:'clocked hours',es:'horas registradas',pt:'horas registadas',tr:'kaydedilen saatler'} )}.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <button type="button" onClick={addPointageDraftRow} style={{ ...styles.btnPrimary, fontSize: 12 }}>
                {_({fr:'+ Ligne jour',ar:'+ سطر يوم',en:'+ Day row',es:'+ Fila día',pt:'+ Linha dia',tr:'+ Gün satırı'})}
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    {[
                      _({fr:'Date',ar:'التاريخ',en:'Date',es:'Fecha',pt:'Data',tr:'Tarih'}),
                      _({fr:'Entrée',ar:'دخول',en:'Entry',es:'Entrada',pt:'Entrada',tr:'Giriş'}),
                      _({fr:'Sortie',ar:'خروج',en:'Exit',es:'Salida',pt:'Saída',tr:'Çıkış'}),
                      _({fr:'Pause début',ar:'بداية الاستراحة',en:'Break start',es:'Inicio pausa',pt:'Início pausa',tr:'Mola başlangıcı'}),
                      _({fr:'Pause fin',ar:'نهاية الاستراحة',en:'Break end',es:'Fin pausa',pt:'Fim pausa',tr:'Mola bitişi'}),
                      _({fr:'H.N.',ar:'س.ع.',en:'Reg.H.',es:'H.N.',pt:'H.N.',tr:'N.S.'}),
                      _({fr:'Sup.25',ar:'إض.25',en:'OT.25',es:'Ext.25',pt:'HE.25',tr:'Faz.25'}),
                      _({fr:'Sup.50',ar:'إض.50',en:'OT.50',es:'Ext.50',pt:'HE.50',tr:'Faz.50'}),
                      _({fr:'Statut',ar:'الحالة',en:'Status',es:'Estado',pt:'Estado',tr:'Durum'}),
                      ''
                    ].map((h, i) => (
                      <th key={`ptg-h-${i}`} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(drafts).length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ ...styles.td, color: '#94A3B8', textAlign: 'center' }}>
                        {_({fr:'Aucun pointage sur la période — utilisez « Ligne jour » pour ajouter.',ar:'لا يوجد تسجيل حضور في الفترة — استخدم "سطر يوم" للإضافة.',en:'No attendance records for this period — use "Day row" to add.',es:'Sin registros de asistencia en el período — use "Fila día" para añadir.',pt:'Nenhum registo de ponto no período — use "Linha dia" para adicionar.',tr:'Bu dönemde yoklama kaydı yok — eklemek için "Gün satırı"nı kullanın.'})}
                      </td>
                    </tr>
                  )}
                  {Object.keys(drafts)
                    .sort((a, b) => (drafts[b].date || '').localeCompare(drafts[a].date || ''))
                    .map(pid => {
                      const drow = drafts[pid];
                      if (!drow) return null;
                      const inp: React.CSSProperties = { ...styles.inputStyle, width: '100%', maxWidth: 96, padding: '4px 6px', fontSize: 12 };
                      const inpNum: React.CSSProperties = {
                        ...inp,
                        maxWidth: 56,
                        opacity: autoRecalcHeures ? 0.55 : 1,
                      };
                      return (
                        <tr key={pid}>
                          <td style={styles.td}>
                            <input type="date" value={drow.date} onChange={e => patchDraft(pid, 'date', e.target.value)} style={{ ...inp, maxWidth: 132 }} />
                          </td>
                          <td style={styles.td}>
                            <input type="time" value={drow.heure_entree} onChange={e => patchDraft(pid, 'heure_entree', e.target.value)} style={inp} />
                          </td>
                          <td style={styles.td}>
                            <input type="time" value={drow.heure_sortie} onChange={e => patchDraft(pid, 'heure_sortie', e.target.value)} style={inp} />
                          </td>
                          <td style={styles.td}>
                            <input type="time" value={drow.pause_debut} onChange={e => patchDraft(pid, 'pause_debut', e.target.value)} style={inp} />
                          </td>
                          <td style={styles.td}>
                            <input type="time" value={drow.pause_fin} onChange={e => patchDraft(pid, 'pause_fin', e.target.value)} style={inp} />
                          </td>
                          <td style={styles.td}>
                            <input
                              type="number"
                              step={0.25}
                              min={0}
                              value={drow.heures_normales}
                              onChange={e => patchDraft(pid, 'heures_normales', e.target.value)}
                              style={inpNum}
                              readOnly={autoRecalcHeures}
                              title={autoRecalcHeures ? _( {fr:'Recalcul auto : modifiez entrée/sortie/pause',ar:'إعادة حساب تلقائي: عدّل الدخول/الخروج/الاستراحة',en:'Auto recalc: edit entry/exit/break',es:'Recálculo auto: editar entrada/salida/pausa',pt:'Recálculo auto: editar entrada/saída/pausa',tr:'Otomatik yeniden hesaplama: giriş/çıkış/mola düzenle'} ) : _( {fr:'Heures normales',ar:'ساعات عادية',en:'Regular hours',es:'Horas normales',pt:'Horas normais',tr:'Normal saatler'} )}
                            />
                          </td>
                          <td style={styles.td}>
                            <input
                              type="number"
                              step={0.25}
                              min={0}
                              value={drow.heures_supp_25}
                              onChange={e => patchDraft(pid, 'heures_supp_25', e.target.value)}
                              style={inpNum}
                              readOnly={autoRecalcHeures}
                            />
                          </td>
                          <td style={styles.td}>
                            <input
                              type="number"
                              step={0.25}
                              min={0}
                              value={drow.heures_supp_50}
                              onChange={e => patchDraft(pid, 'heures_supp_50', e.target.value)}
                              style={inpNum}
                              readOnly={autoRecalcHeures}
                            />
                          </td>
                          <td style={styles.td}>
                            <select
                              value={drow.statut}
                              onChange={e => patchDraft(pid, 'statut', e.target.value)}
                              style={{ ...inp, maxWidth: 120 }}
                            >
                              {(Object.keys(STATUS) as HRPointageStatus[]).map(k => (
                                <option key={k} value={k}>{STATUS(lang)[k].label}</option>
                              ))}
                            </select>
                          </td>
                          <td style={styles.td}>
                            <button
                              type="button"
                              disabled={savingId === pid}
                              onClick={() => savePointageDraft(pid)}
                              style={{ ...styles.btnPrimary, fontSize: 11, padding: '6px 10px' }}
                            >
                              {savingId === pid ? '…' : _({fr:'Enregistrer',ar:'حفظ',en:'Save',es:'Guardar',pt:'Salvar',tr:'Kaydet'})}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sub === 'production' && (
          <div style={styles.card}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      {k:'Date', v:_({fr:'Date',ar:'التاريخ',en:'Date',es:'Fecha',pt:'Data',tr:'Tarih'})},
                      {k:'Modèle', v:_({fr:'Modèle',ar:'الموديل',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})},
                      {k:'Pièces', v:_({fr:'Pièces',ar:'القطع',en:'Pieces',es:'Piezas',pt:'Peças',tr:'Parçalar'})},
                      {k:'Défauts', v:_({fr:'Défauts',ar:'العيوب',en:'Defects',es:'Defectos',pt:'Defeitos',tr:'Kusurlar'})},
                      {k:'Retouche', v:_({fr:'Retouche',ar:'الإصلاح',en:'Rework',es:'Retoque',pt:'Retoque',tr:'Rötuş'})},
                      {k:'Qualité %', v:_({fr:'Qualité %',ar:'الجودة %',en:'Quality %',es:'Calidad %',pt:'Qualidade %',tr:'Kalite %'})},
                      {k:'Rend. %', v:_({fr:'Rend. %',ar:'الإنتاجية %',en:'Yield %',es:'Rend. %',pt:'Rend. %',tr:'Verim %'})},
                    ].map(h => <th key={h.k} style={styles.th}>{h.v}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {dossier.production.length === 0 && (
                    <tr><td colSpan={7} style={{ ...styles.td, color: '#94A3B8', textAlign: 'center' }}>{_({fr:'Aucune ligne de production',ar:'لا يوجد خط إنتاج',en:'No production lines',es:'Sin líneas de producción',pt:'Nenhuma linha de produção',tr:'Üretim hattı yok'})}</td></tr>
                  )}
                  {dossier.production.map((p: any) => (
                    <tr key={p.id}>
                      <td style={styles.td}>{p.date}</td>
                      <td style={styles.td}>{p.model_ref || '—'}</td>
                      <td style={styles.td}>{p.pieces_produites ?? '—'}</td>
                      <td style={styles.td}>{p.pieces_defaut ?? '—'}</td>
                      <td style={styles.td}>{p.pieces_retouchees ?? '—'}</td>
                      <td style={styles.td}>{p.taux_qualite != null ? `${p.taux_qualite.toFixed(1)}%` : '—'}</td>
                      <td style={styles.td}>{p.rendement != null ? `${p.rendement.toFixed(0)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sub === 'avances' && (
          <div style={styles.card}>
            {dossier.avances.length === 0
              ? <div style={{ color: '#94A3B8' }}>{_({fr:'Aucune avance',ar:'لا يوجد سلف',en:'No advances',es:'Sin anticipos',pt:'Nenhum adiantamento',tr:'Avans yok'})}</div>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {[
                          {k:'Date', v:_({fr:'Date',ar:'التاريخ',en:'Date',es:'Fecha',pt:'Data',tr:'Tarih'})},
                          {k:'Montant', v:_({fr:'Montant',ar:'المبلغ',en:'Amount',es:'Monto',pt:'Valor',tr:'Tutar'})},
                          {k:'Solde', v:_({fr:'Solde',ar:'الرصيد',en:'Balance',es:'Saldo',pt:'Saldo',tr:'Bakiye'})},
                          {k:'Statut', v:_({fr:'Statut',ar:'الحالة',en:'Status',es:'Estado',pt:'Estado',tr:'Durum'})},
                          {k:'vs salaire base', v:_({fr:'vs salaire base',ar:'مقابل الراتب الأساسي',en:'vs base salary',es:'vs salario base',pt:'vs salário base',tr:'taban maaşa karşı'})},
                        ].map(h => <th key={h.k} style={styles.th}>{h.v}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {dossier.avances.map((a: any) => {
                        const sb = Number(a.salaire_base) || 0;
                        const m = Number(a.montant) || 0;
                        const pct = sb > 0 ? ((m / sb) * 100).toFixed(0) : '—';
                        return (
                          <tr key={a.id}>
                            <td style={styles.td}>{a.date_demande}</td>
                            <td style={styles.td}><strong>{m.toLocaleString()} MAD</strong></td>
                            <td style={styles.td}>{a.solde_restant != null ? `${a.solde_restant.toLocaleString()} MAD` : '—'}</td>
                            <td style={styles.td}>{a.statut}</td>
                            <td style={styles.td}>{sb > 0 ? <span style={{ color: m > sb * 0.1 ? '#EF4444' : '#10B981' }}>{pct}%</span> : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            <div style={{ marginTop: 12, padding: 10, background: '#FEF3C7', borderRadius: 8, display: 'flex', gap: 8, fontSize: 12, color: '#92400E' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              {_({fr:'Rappel Art. 385 : déduction mensuelle plafonnée (affichage indicatif, déjà géré ailleurs selon règles).',ar:'تذكير المادة 385: الخصم الشهري محدود (عرض إرشادي، تتم إدارته بالفعل في مكان آخر وفقاً للقواعد).',en:'Reminder Art. 385: capped monthly deduction (indicative display, already handled elsewhere per rules).',es:'Recordatorio Art. 385: deducción mensual limitada (visualización indicativa, ya gestionada en otro lugar según las reglas).',pt:'Lembrete Art. 385: dedução mensal limitada (exibição indicativa, já tratada noutro local conforme as regras).',tr:'Hatırlatma Madde 385: aylık kesinti sınırlıdır (bilgilendirme amaçlı gösterim, kurallara göre başka yerde zaten yönetilir).'})}
            </div>
          </div>
        )}

        {sub === 'sage' && (
          <div style={styles.card}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>{_({fr:'Mois Sage :',ar:'شهر Sage :',en:'Sage month:',es:'Mes Sage:',pt:'Mês Sage:',tr:'Sage ayı:'})} {dossier.sage_preview.mois}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {[
                [_({fr:'Jours (présent)',ar:'أيام (حاضر)',en:'Days (present)',es:'Días (presente)',pt:'Dias (presente)',tr:'Günler (mevcut)'}), String(dossier.sage_preview.nb_jours)],
                [_({fr:'Total brut (MAD)',ar:'الإجمالي الخام (MAD)',en:'Gross total (MAD)',es:'Total bruto (MAD)',pt:'Total bruto (MAD)',tr:'Brüt toplam (MAD)'}), dossier.sage_preview.total_brut.toFixed(2)],
                [_({fr:'Net à payer (MAD)',ar:'الصافي للدفع (MAD)',en:'Net to pay (MAD)',es:'Neto a pagar (MAD)',pt:'Líquido a pagar (MAD)',tr:'Ödenecek net (MAD)'}), dossier.sage_preview.net_a_payer.toFixed(2)],
              ].map(([a, b]) => (
                <div key={a}><div style={styles.labelStyle}>{a}</div><div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{b}</div></div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 12, marginBottom: 0 }}>{_({fr:'Même formule que la prévisu mensuelle (heures × taux, sup., primes).',ar:'نفس معادلة المعاينة الشهرية (ساعات × سعر، إضافي، مكافآت).',en:'Same formula as the monthly preview (hours × rate, OT, bonuses).',es:'Misma fórmula que la previsualización mensual (horas × tarifa, extras, bonos).',pt:'Mesma fórmula da pré-visualização mensal (horas × taxa, HE, bónus).',tr:'Aylık önizleme ile aynı formül (saat × ücret, fazla mesai, primler).'})}</p>
          </div>
        )}

        {sub === 'competences' && (
          <div style={styles.card}>
            <p style={{ fontSize: 12, color: '#64748B', marginTop: 0 }}>{dossier.skills_note || _({fr:'Note sur les compétences',ar:'ملاحظة حول المهارات',en:'Skills note',es:'Nota de competencias',pt:'Nota de competências',tr:'Beceri notu'})}</p>
            {dossier.skills_matched && dossier.skills.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {dossier.skills.map((s: any) => (
                  <div key={s.id} style={{ padding: 10, background: '#F8FAFC', borderRadius: 8, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div><strong>{s.poste_keyword}</strong> {s.fabric_type ? `· ${s.fabric_type}` : ''}</div>
                    <div style={{ fontSize: 12, color: '#2149C1', fontWeight: 600 }}>{s.level}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#94A3B8' }}>{_({fr:'Aucune compétence listée',ar:'لا توجد مهارات مدرجة',en:'No skills listed',es:'Sin competencias listadas',pt:'Nenhuma competência listada',tr:'Beceri listelenmemiş'})}{!dossier.skills_matched ? _( {fr:' (matricule sans doublon effectifs classique).',ar:' (رقم تسجيل بدون ازدواجية في الفريق الكلاسيكي).',en:' (ID without classic duplicate in team).',es:' (matrícula sin duplicado en efectivos clásico).',pt:' (matrícula sem duplicado no quadro clássico).',tr:' (klasik ekipte kopyasız kayıt numarası).'} ) : '.'}</div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
