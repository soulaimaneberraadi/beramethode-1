import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface LogEntry { level: string; text: string; at: string; }

interface Reclamation {
  id: string;
  user_id: string | null;
  user_email: string | null;
  kind: 'connexion' | 'page' | string;
  message: string;
  view: string | null;
  url: string | null;
  stack: string | null;
  component_stack: string | null;
  logs: LogEntry[] | null;
  user_agent: string | null;
  screen: string | null;
  status: 'nouveau' | 'en_cours' | 'resolu' | string;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  nouveau: { label: 'Nouveau', cls: 'bg-red-50 text-red-700 border-red-200' },
  en_cours: { label: 'En cours', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  resolu: { label: 'Résolu', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const NEXT_STATUS: Record<string, string> = { nouveau: 'en_cours', en_cours: 'resolu', resolu: 'nouveau' };

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
};

const Reclamations: React.FC = () => {
  const [items, setItems] = useState<Reclamation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'tous' | 'nouveau' | 'en_cours' | 'resolu'>('tous');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('reclamations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      // 42P01 = table inexistante → guide l'admin vers la migration SQL.
      setError(error.message.includes('does not exist') || error.code === '42P01'
        ? "La table « reclamations » n'existe pas encore. Exécutez la migration SQL fournie dans Supabase."
        : error.message);
      setItems([]);
    } else {
      setItems((data as Reclamation[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (rec: Reclamation) => {
    const next = NEXT_STATUS[rec.status] || 'nouveau';
    setItems(prev => prev.map(r => r.id === rec.id ? { ...r, status: next } : r));
    const { error } = await supabase.from('reclamations').update({ status: next }).eq('id', rec.id);
    if (error) { setError(error.message); load(); }
  };

  const counts = {
    tous: items.length,
    nouveau: items.filter(r => r.status === 'nouveau').length,
    en_cours: items.filter(r => r.status === 'en_cours').length,
    resolu: items.filter(r => r.status === 'resolu').length,
  };

  const visible = filter === 'tous' ? items : items.filter(r => r.status === filter);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6 bg-[#fafafa]">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Réclamations</h1>
            <p className="text-sm text-slate-500">Problèmes signalés par les utilisateurs depuis l'application.</p>
          </div>
          <button onClick={load} className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
            Actualiser
          </button>
        </div>

        {/* Filtres */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {(['tous', 'nouveau', 'en_cours', 'resolu'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-lg border transition-all ${filter === f ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
              {f === 'tous' ? 'Tous' : STATUS_META[f].label} ({counts[f]})
            </button>
          ))}
        </div>

        {loading && <div className="text-slate-400 text-sm py-12 text-center">Chargement…</div>}

        {error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-sm">{error}</div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="text-slate-400 text-sm py-12 text-center">Aucune réclamation 🎉</div>
        )}

        <div className="space-y-2">
          {visible.map(rec => {
            const meta = STATUS_META[rec.status] || STATUS_META.nouveau;
            const isOpen = expanded === rec.id;
            return (
              <div key={rec.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <span className="text-lg shrink-0">{rec.kind === 'connexion' ? '📡' : '⚠️'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${meta.cls}`}>{meta.label}</span>
                      {rec.view && <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{rec.view}</span>}
                      <span className="text-xs text-slate-400">{fmtDate(rec.created_at)}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 mt-1 break-words">{rec.message}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{rec.user_email || 'Invité'}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button onClick={() => updateStatus(rec)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 whitespace-nowrap">
                      → {STATUS_META[NEXT_STATUS[rec.status]]?.label || 'Nouveau'}
                    </button>
                    <button onClick={() => setExpanded(isOpen ? null : rec.id)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg text-slate-500 hover:text-slate-800">
                      {isOpen ? 'Masquer' : 'Détails'}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3 text-xs">
                    <Detail label="URL" value={rec.url} />
                    <Detail label="Navigateur" value={rec.user_agent} />
                    <Detail label="Écran" value={rec.screen} />
                    {rec.stack && <Block label="Stack" value={rec.stack} />}
                    {rec.component_stack && <Block label="Composant" value={rec.component_stack} />}
                    {rec.logs && rec.logs.length > 0 && (
                      <div>
                        <div className="font-bold text-slate-600 mb-1">Logs récents ({rec.logs.length})</div>
                        <div className="bg-slate-900 text-slate-100 rounded-lg p-3 max-h-64 overflow-auto font-mono text-[11px] space-y-0.5">
                          {rec.logs.map((l, i) => (
                            <div key={i} className={l.level === 'error' ? 'text-red-300' : l.level === 'warn' ? 'text-amber-300' : 'text-slate-300'}>
                              {l.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const Detail: React.FC<{ label: string; value: string | null }> = ({ label, value }) =>
  value ? (
    <div className="flex gap-2">
      <span className="font-bold text-slate-500 shrink-0">{label}:</span>
      <span className="text-slate-700 break-all">{value}</span>
    </div>
  ) : null;

const Block: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="font-bold text-slate-600 mb-1">{label}</div>
    <pre className="bg-white border border-slate-200 rounded-lg p-2 overflow-auto max-h-48 text-[11px] text-slate-700 whitespace-pre-wrap">{value}</pre>
  </div>
);

export default Reclamations;
