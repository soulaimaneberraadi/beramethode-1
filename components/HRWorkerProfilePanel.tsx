import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  User, Edit3, Calendar, Clock, Factory, DollarSign, Award, FileText, AlertTriangle, ChevronLeft, Key,
} from 'lucide-react';
import { HRWorker, HRWorkerRole, HRPointageStatus, AppSettings } from '../types';

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
function parseApiJsonBody(raw: string): unknown {
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
    throw new Error('Réponse du serveur illisible (JSON attendu).');
  }
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 2 };
const inputStyle: React.CSSProperties = { border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#0F172A', background: '#fff' };
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '8px 16px', background: '#2149C1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const card: React.CSSProperties = { background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, marginBottom: 14 };
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: '#64748B', borderBottom: '1px solid #E2E8F0' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12, borderBottom: '1px solid #F1F5F9' };
/** Recouvre le viewport (évite l’apparition au-dessus d’une seule bande en flex) */
const overlayRoot: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 };

const ALL_ROLES: HRWorkerRole[] = ['OPERATOR', 'SUPERVISOR', 'MECHANIC', 'ADMIN', 'QC', 'IRON', 'CUTTER', 'PACKER'];
const ROLE_LABELS: Record<HRWorkerRole, string> = {
  OPERATOR: 'Opérateur', SUPERVISOR: 'Superviseur', MECHANIC: 'Mécanicien',
  ADMIN: 'Admin', QC: 'Contrôle Q.', IRON: 'Repassage', CUTTER: 'Coupeur', PACKER: 'Emballage',
};

const STATUS: Record<HRPointageStatus, { label: string; color: string; bg: string }> = {
  PRESENT:  { label: 'Présent',  color: '#065F46', bg: '#D1FAE5' },
  RETARD:   { label: 'Retard',   color: '#92400E', bg: '#FEF3C7' },
  ABSENT:   { label: 'Absent',   color: '#991B1B', bg: '#FEE2E2' },
  CONGE:    { label: 'Congé',    color: '#1E40AF', bg: '#DBEAFE' },
  MALADIE:  { label: 'Maladie',  color: '#6B21A8', bg: '#F3E8FF' },
  MISSION:  { label: 'Mission',  color: '#0F766E', bg: '#CCFBF1' },
  FERIE:    { label: 'Férié',    color: '#374151', bg: '#F3F4F6' },
};

const subTabs = [
  { id: 'synthese' as const, label: 'Synthèse', icon: User },
  { id: 'pointage' as const, label: 'Pointage', icon: Clock },
  { id: 'production' as const, label: 'Production', icon: Factory },
  { id: 'avances' as const, label: 'Avances', icon: DollarSign },
  { id: 'sage' as const, label: 'Aperçu paie (mois)', icon: FileText },
  { id: 'competences' as const, label: 'Compétences', icon: Award },
];

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
  const [mois, setMois] = useState(() => new Date().toISOString().slice(0, 7));
  const [sub, setSub] = useState<(typeof subTabs)[number]['id']>('synthese');
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
      const body = parseApiJsonBody(raw) as Record<string, unknown> | null;
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
        style={{ ...overlayRoot, background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ color: '#64748B', fontSize: 14 }}>Chargement du dossier…</div>
      </motion.div>
    );
  }

  if (err || !dossier) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        style={{ ...overlayRoot, background: '#F8F9FA', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, background: '#fff', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#2149C1', fontWeight: 600, cursor: 'pointer' }}>
            <ChevronLeft size={18} /> Retour
          </button>
        </div>
        <div style={{ padding: 24, color: '#EF4444', fontWeight: 600 }}>{err || 'Aucune donnée'}</div>
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
      alert('Indiquez une date.');
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
          const b = parseApiJsonBody(raw) as { message?: string };
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
      alert('PIN : 4 à 8 chiffres.');
      return;
    }
    if (pin1 !== pin2) {
      alert('Confirmation PIN différente.');
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
      alert('PIN enregistré.');
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      style={{ ...overlayRoot, background: '#F8F9FA', display: 'flex', flexDirection: 'column' }}
    >
      {/* Top bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#2149C1', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            <ChevronLeft size={18} /> Retour
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} color="#64748B" />
            <input type="month" value={mois} onChange={e => setMois(e.target.value)} style={{ ...inputStyle, width: 150 }} title="Période pointage / production" />
          </div>
          <button type="button" onClick={() => onEdit(w)} style={btnPrimary}>
            <Edit3 size={15} style={{ marginRight: 6 }} /> Modifier la fiche
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 2, padding: '0 16px', flexWrap: 'wrap' }}>
        {subTabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: sub === t.id ? '#2149C1' : '#64748B',
              borderBottom: sub === t.id ? '2px solid #2149C1' : '2px solid transparent',
            }}
          >
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {sub === 'synthese' && (
          <>
            <div style={{ ...card, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: w.photo ? 'transparent' : '#EEF2FF', border: '2px solid #2149C1', overflow: 'hidden' }}>
                {w.photo
                  ? <img src={w.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#2149C1' }}>{(w.full_name || '?')[0]}</div>}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h2 style={{ margin: '0 0 4px 0', fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{w.full_name}</h2>
                <div style={{ fontSize: 13, color: '#64748B' }}>{w.matricule} · {w.cin || 'CIN —'}</div>
                {(w as { person_id?: string }).person_id && (
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
                    Person ID : {(w as { person_id?: string }).person_id}
                  </div>
                )}
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#2149C1', background: '#EEF2FF', padding: '2px 10px', borderRadius: 8 }}>Chaîne: {w.chaine_id || '—'}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', background: '#F1F5F9', padding: '2px 10px', borderRadius: 8 }}>{ROLE_LABELS[roleK]}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: w.is_active ? '#065F46' : '#991B1B', background: w.is_active ? '#D1FAE5' : '#FEE2E2', padding: '2px 10px', borderRadius: 8 }}>{w.is_active ? 'Actif' : 'Inactif'}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: hasPin ? '#065F46' : '#92400E', background: hasPin ? '#D1FAE5' : '#FEF3C7', padding: '2px 10px', borderRadius: 8 }}>
                    PIN BERAOUVIER : {hasPin ? 'défini' : 'non défini'}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ ...card, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Key size={16} color="#2149C1" />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>Définir / changer le PIN (app ouvrier)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 400 }}>
                <div>
                  <div style={labelStyle}>Nouveau PIN</div>
                  <input type="password" value={pin1} onChange={e => setPin1(e.target.value)} style={{ ...inputStyle, width: '100%' }} placeholder="4–8 chiffres" />
                </div>
                <div>
                  <div style={labelStyle}>Confirmer</div>
                  <input type="password" value={pin2} onChange={e => setPin2(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                </div>
              </div>
              <button type="button" onClick={savePin} disabled={pinBusy} style={{ ...btnPrimary, marginTop: 10 }}>
                {pinBusy ? '…' : 'Enregistrer le PIN'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
              {[
                ['Poste', w.poste || '—'],
                ['Spécialité', w.specialite || '—'],
                ['Salaire base (MAD)', w.salaire_base != null ? String(w.salaire_base) : '—'],
                ['Taux horaire', w.taux_horaire != null ? `${w.taux_horaire} MAD` : '—'],
                ['Primes A/T', `${w.prime_assiduite ?? 0} / ${w.prime_transport ?? 0} MAD`],
                ['Période dossier', `${dossier.meta.date_from} → ${dossier.meta.date_to}`],
                ['Jours pointage (lignes)', String(dossier.pointage.length)],
                ['Jours pointés (présent+retard)', String(daysPresent.size)],
              ].map(([a, b]) => (
                <div key={a} style={card as React.CSSProperties}>
                  <div style={labelStyle}>{a}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{b}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {sub === 'pointage' && (
          <div style={card}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>
              Jours avec présence dans la période : {daysPresent.size} jour{daysPresent.size !== 1 ? 's' : ''}
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
              <strong>Édition ici :</strong> une ligne par jour (contrainte base). Pour deux blocs le même jour (ex. 8h–10h puis 12h–18h),
              indiquez entrée / sortie globales et une pause couvrant l’écart (ex. pause 10:00–12:00).{' '}
              {autoRecalcHeures ? (
                <>Le serveur recalcule H.N. et heures sup. à partir des horaires (paramètre « recalcul auto » activé).</>
              ) : (
                <>Recalcul auto désactivé : les champs H.N. / sup. ci-dessous sont enregistrés tels quels.</>
              )}{' '}
              Réf. compta (paramètres) : {comptaRef === 'normales_paie' ? 'heures normales paie' : 'heures pointées'}.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <button type="button" onClick={addPointageDraftRow} style={{ ...btnPrimary, fontSize: 12 }}>
                + Ligne jour
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    {['Date', 'Entrée', 'Sortie', 'Pause début', 'Pause fin', 'H.N.', 'Sup.25', 'Sup.50', 'Statut', ''].map((h, i) => (
                      <th key={`ptg-h-${i}`} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(drafts).length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ ...td, color: '#94A3B8', textAlign: 'center' }}>
                        Aucun pointage sur la période — utilisez « Ligne jour » pour ajouter.
                      </td>
                    </tr>
                  )}
                  {Object.keys(drafts)
                    .sort((a, b) => (drafts[b].date || '').localeCompare(drafts[a].date || ''))
                    .map(pid => {
                      const drow = drafts[pid];
                      if (!drow) return null;
                      const inp: React.CSSProperties = { ...inputStyle, width: '100%', maxWidth: 96, padding: '4px 6px', fontSize: 12 };
                      const inpNum: React.CSSProperties = {
                        ...inp,
                        maxWidth: 56,
                        opacity: autoRecalcHeures ? 0.55 : 1,
                      };
                      return (
                        <tr key={pid}>
                          <td style={td}>
                            <input type="date" value={drow.date} onChange={e => patchDraft(pid, 'date', e.target.value)} style={{ ...inp, maxWidth: 132 }} />
                          </td>
                          <td style={td}>
                            <input type="time" value={drow.heure_entree} onChange={e => patchDraft(pid, 'heure_entree', e.target.value)} style={inp} />
                          </td>
                          <td style={td}>
                            <input type="time" value={drow.heure_sortie} onChange={e => patchDraft(pid, 'heure_sortie', e.target.value)} style={inp} />
                          </td>
                          <td style={td}>
                            <input type="time" value={drow.pause_debut} onChange={e => patchDraft(pid, 'pause_debut', e.target.value)} style={inp} />
                          </td>
                          <td style={td}>
                            <input type="time" value={drow.pause_fin} onChange={e => patchDraft(pid, 'pause_fin', e.target.value)} style={inp} />
                          </td>
                          <td style={td}>
                            <input
                              type="number"
                              step={0.25}
                              min={0}
                              value={drow.heures_normales}
                              onChange={e => patchDraft(pid, 'heures_normales', e.target.value)}
                              style={inpNum}
                              readOnly={autoRecalcHeures}
                              title={autoRecalcHeures ? 'Recalcul auto : modifiez entrée/sortie/pause' : 'Heures normales'}
                            />
                          </td>
                          <td style={td}>
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
                          <td style={td}>
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
                          <td style={td}>
                            <select
                              value={drow.statut}
                              onChange={e => patchDraft(pid, 'statut', e.target.value)}
                              style={{ ...inp, maxWidth: 120 }}
                            >
                              {(Object.keys(STATUS) as HRPointageStatus[]).map(k => (
                                <option key={k} value={k}>{STATUS[k].label}</option>
                              ))}
                            </select>
                          </td>
                          <td style={td}>
                            <button
                              type="button"
                              disabled={savingId === pid}
                              onClick={() => savePointageDraft(pid)}
                              style={{ ...btnPrimary, fontSize: 11, padding: '6px 10px' }}
                            >
                              {savingId === pid ? '…' : 'Enregistrer'}
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
          <div style={card}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Modèle', 'Pièces', 'Défauts', 'Retouche', 'Qualité %', 'Rend. %'].map(h => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {dossier.production.length === 0 && (
                    <tr><td colSpan={7} style={{ ...td, color: '#94A3B8', textAlign: 'center' }}>Aucune ligne de production</td></tr>
                  )}
                  {dossier.production.map((p: any) => (
                    <tr key={p.id}>
                      <td style={td}>{p.date}</td>
                      <td style={td}>{p.model_ref || '—'}</td>
                      <td style={td}>{p.pieces_produites ?? '—'}</td>
                      <td style={td}>{p.pieces_defaut ?? '—'}</td>
                      <td style={td}>{p.pieces_retouchees ?? '—'}</td>
                      <td style={td}>{p.taux_qualite != null ? `${p.taux_qualite.toFixed(1)}%` : '—'}</td>
                      <td style={td}>{p.rendement != null ? `${p.rendement.toFixed(0)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sub === 'avances' && (
          <div style={card}>
            {dossier.avances.length === 0
              ? <div style={{ color: '#94A3B8' }}>Aucune avance</div>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Date', 'Montant', 'Solde', 'Statut', 'vs salaire base'].map(h => <th key={h} style={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {dossier.avances.map((a: any) => {
                        const sb = Number(a.salaire_base) || 0;
                        const m = Number(a.montant) || 0;
                        const pct = sb > 0 ? ((m / sb) * 100).toFixed(0) : '—';
                        return (
                          <tr key={a.id}>
                            <td style={td}>{a.date_demande}</td>
                            <td style={td}><strong>{m.toLocaleString()} MAD</strong></td>
                            <td style={td}>{a.solde_restant != null ? `${a.solde_restant.toLocaleString()} MAD` : '—'}</td>
                            <td style={td}>{a.statut}</td>
                            <td style={td}>{sb > 0 ? <span style={{ color: m > sb * 0.1 ? '#EF4444' : '#10B981' }}>{pct}%</span> : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            <div style={{ marginTop: 12, padding: 10, background: '#FEF3C7', borderRadius: 8, display: 'flex', gap: 8, fontSize: 12, color: '#92400E' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              Rappel Art. 385 : déduction mensuelle plafonnée (affichage indicatif, déjà géré ailleurs selon règles).
            </div>
          </div>
        )}

        {sub === 'sage' && (
          <div style={card}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>Mois Sage : {dossier.sage_preview.mois}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {[
                ['Jours (présent)', String(dossier.sage_preview.nb_jours)],
                ['Total brut (MAD)', dossier.sage_preview.total_brut.toFixed(2)],
                ['Net à payer (MAD)', dossier.sage_preview.net_a_payer.toFixed(2)],
              ].map(([a, b]) => (
                <div key={a}><div style={labelStyle}>{a}</div><div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{b}</div></div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 12, marginBottom: 0 }}>Même formule que la prévisu mensuelle (heures × taux, sup., primes).</p>
          </div>
        )}

        {sub === 'competences' && (
          <div style={card}>
            <p style={{ fontSize: 12, color: '#64748B', marginTop: 0 }}>{dossier.skills_note}</p>
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
              <div style={{ color: '#94A3B8' }}>Aucune compétence listée{!dossier.skills_matched ? ' (matricule sans doublon effectifs classique).' : '.'}</div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
