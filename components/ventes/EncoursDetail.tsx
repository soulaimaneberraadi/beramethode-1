import React from 'react';
import { AlertTriangle, Phone, MapPin, RefreshCw, Check, Search, ChevronDown } from 'lucide-react';
import PanneauDetail from './PanneauDetail';

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const jjmmaaaa = (v?: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');

type Facture = {
    id: string; numero: string;
    clientId: string | null; clientNom: string;
    dateFacture: string | null; dateEcheance: string | null; dernierPaiement: string | null;
    totalTtc: number; montantPaye: number; reste: number;
    retardJours: number; entame: boolean;
};

type ClientEncours = {
    cle: string; clientId: string | null; nom: string;
    tel: string | null; ville: string | null; type: string | null;
    encours: number; enRetard: number; montantRetard: number;
    plusVieilleEcheance: string | null; retardMax: number;
    factures: Facture[];
};

type Reponse = {
    total: number; totalRetard: number; nbFactures: number; nbClients: number;
    clients: ClientEncours[];
};

const MODES = ['ESPECES', 'VIREMENT', 'CHEQUE', 'CARTE', 'EFFET'] as const;

/**
 * Ce que la tuile ne disait pas : QUI doit, sur quelle facture, depuis quand,
 * et comment solder sans quitter la page.
 *
 * Un encaissement est une ecriture comptable : le bouton « Tout » ne part pas
 * sans confirmation, et le partiel refuse un montant superieur au reste — une
 * facture ne peut pas etre payee deux fois.
 */
const EncoursDetail: React.FC<{ onFermer: () => void; devise: string }> = ({ onFermer, devise }) => {
    const [data, setData] = React.useState<Reponse | null>(null);
    const [chargement, setChargement] = React.useState(true);
    const [erreur, setErreur] = React.useState<string | null>(null);
    const [q, setQ] = React.useState('');
    const [seulementRetard, setSeulementRetard] = React.useState(false);
    const [ouverts, setOuverts] = React.useState<Record<string, boolean>>({});
    const [saisie, setSaisie] = React.useState<Record<string, { montant: number | ''; date: string; mode: string }>>({});
    const [enCours, setEnCours] = React.useState<string | null>(null);

    const charger = React.useCallback(async () => {
        setChargement(true);
        setErreur(null);
        try {
            const res = await fetch('/api/ventes/encours', { credentials: 'include' });
            const body = await res.json().catch(() => ({}));
            // 404 ici ne veut pas dire « aucun impaye » mais « cette route
            // n'existe pas encore » : le serveur tourne sur du code d'avant.
            if (res.status === 404) throw new Error('Route /api/ventes/encours absente : redemarrer le serveur (npm run dev:app).');
            if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
            setData(body as Reponse);
        } catch (e: any) {
            setErreur(e?.message || String(e));
            setData(null);
        } finally {
            setChargement(false);
        }
    }, []);

    React.useEffect(() => { void charger(); }, [charger]);

    const encaisser = async (f: Facture, montant: number, date: string, mode: string) => {
        if (!(montant > 0)) return;
        setEnCours(f.id);
        try {
            const res = await fetch('/api/facturation/paiements', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    facture_id: f.id,
                    date_paiement: date || aujourdhui(),
                    montant,
                    mode,
                    notes: 'Encaissement depuis l’encours client',
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
            setSaisie(s => { const c = { ...s }; delete c[f.id]; return c; });
            await charger();
        } catch (e: any) {
            setErreur(e?.message || String(e));
        } finally {
            setEnCours(null);
        }
    };

    const terme = q.trim().toLowerCase();
    const clients = (data?.clients || [])
        .filter(c => !seulementRetard || c.enRetard > 0)
        .filter(c => !terme || `${c.nom} ${c.tel || ''} ${c.ville || ''}`.toLowerCase().includes(terme));

    const totalAffiche = clients.reduce((a, c) => a + c.encours, 0);

    const barre = (
        <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[150px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Client, telephone, ville..."
                    className="w-full h-9 sm:h-8 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-[12px] text-slate-700 dark:text-dk-text placeholder:text-slate-400 outline-none"
                />
            </div>
            <button
                type="button"
                onClick={() => setSeulementRetard(v => !v)}
                className={`h-9 sm:h-8 px-3 rounded-lg text-[11px] font-bold border transition-colors ${seulementRetard
                    ? 'bg-rose-600 text-white border-transparent'
                    : 'bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border'}`}
            >
                En retard{data ? ` · ${nf(data.totalRetard)}` : ''}
            </button>
            <button
                type="button"
                onClick={() => void charger()}
                className="w-9 h-9 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-400 hover:text-slate-900"
            >
                <RefreshCw className={`w-3.5 h-3.5 ${chargement ? 'animate-spin' : ''}`} />
            </button>
        </div>
    );

    return (
        <PanneauDetail
            titre="Encours client"
            valeur={`${nf(totalAffiche)} ${devise}`}
            alerte={totalAffiche > 0}
            sous={data ? `${clients.length} client(s) · ${clients.reduce((a, c) => a + c.factures.length, 0)} facture(s) impayee(s)` : undefined}
            onFermer={onFermer}
            barre={barre}
        >
            {erreur && (
                <p className="flex items-start gap-1.5 text-[12px] text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 rounded-xl bg-white dark:bg-dk-surface p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {erreur}
                </p>
            )}
            {!chargement && clients.length === 0 && !erreur && (
                <p className="text-center text-[12px] text-slate-400 dark:text-dk-muted py-10">Rien a recouvrer.</p>
            )}

            {clients.map(c => {
                const ouvert = ouverts[c.cle] !== false;
                return (
                    <section key={c.cle} className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setOuverts(o => ({ ...o, [c.cle]: !ouvert }))}
                            className="w-full text-left px-3.5 py-2.5 flex items-start gap-3 hover:bg-slate-50/60 dark:hover:bg-dk-elevated/40"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-black text-slate-900 dark:text-dk-text truncate">{c.nom}</p>
                                <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-400 dark:text-dk-muted mt-0.5">
                                    {c.tel && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{c.tel}</span>}
                                    {c.ville && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{c.ville}</span>}
                                    <span>{c.factures.length} facture(s)</span>
                                    {/* Le plus vieux delai depasse dit l'urgence mieux qu'un montant. */}
                                    {c.retardMax > 0 && <span className="font-bold text-rose-600 dark:text-rose-400">{c.retardMax} j de retard</span>}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <span className="block text-[15px] font-black tabular-nums text-amber-600 dark:text-amber-400">{nf(c.encours)}</span>
                                {c.montantRetard > 0 && (
                                    <span className="block text-[10px] font-bold tabular-nums text-rose-600 dark:text-rose-400">
                                        dont {nf(c.montantRetard)} en retard
                                    </span>
                                )}
                            </div>
                            <ChevronDown className={`w-4 h-4 shrink-0 mt-1 text-slate-300 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
                        </button>

                        {ouvert && (
                            <div className="divide-y divide-slate-100 dark:divide-dk-border border-t border-slate-100 dark:border-dk-border">
                                {c.factures.map(f => {
                                    const s = saisie[f.id] || { montant: '' as number | '', date: aujourdhui(), mode: 'ESPECES' };
                                    const occupe = enCours === f.id;
                                    return (
                                        <div key={f.id} className="px-3.5 py-3 bg-slate-50/40 dark:bg-dk-elevated/20">
                                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                                <span className="text-[12px] font-black text-slate-700 dark:text-dk-text">{f.numero}</span>
                                                <span className="text-[10px] text-slate-400 dark:text-dk-muted">Emise {jjmmaaaa(f.dateFacture)}</span>
                                                <span className={`text-[10px] font-bold ${f.retardJours > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-dk-muted'}`}>
                                                    Echeance {jjmmaaaa(f.dateEcheance)}
                                                    {f.retardJours > 0 && ` · +${f.retardJours} j`}
                                                    {!f.dateEcheance && ' (non fixee)'}
                                                </span>
                                                {f.dernierPaiement && (
                                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                                        Dernier paiement {jjmmaaaa(f.dernierPaiement)}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-[11px] tabular-nums text-slate-500 dark:text-dk-muted">
                                                <span>Total {nf(f.totalTtc)}</span>
                                                <span>Paye {nf(f.montantPaye)}</span>
                                                <span className="text-[13px] font-black text-amber-600 dark:text-amber-400">Reste {nf(f.reste)}</span>
                                                {f.entame && <span className="text-[10px] font-bold text-slate-400">partiellement regle</span>}
                                            </div>

                                            {/* Encaisser : tout d'un coup, ou le montant reellement recu. */}
                                            <div className="mt-2 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-1.5">
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={0}
                                                    max={f.reste}
                                                    value={s.montant}
                                                    onChange={e => setSaisie(x => ({ ...x, [f.id]: { ...s, montant: e.target.value === '' ? '' : Number(e.target.value) } }))}
                                                    placeholder={`Montant (max ${nf(f.reste)})`}
                                                    className="col-span-2 sm:col-span-1 h-9 sm:h-8 px-2.5 sm:w-[150px] rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[12px] font-bold tabular-nums text-slate-700 dark:text-dk-text outline-none"
                                                />
                                                <input
                                                    type="date"
                                                    value={s.date}
                                                    max={aujourdhui()}
                                                    onChange={e => setSaisie(x => ({ ...x, [f.id]: { ...s, date: e.target.value } }))}
                                                    className="h-9 sm:h-8 px-2 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[11px] font-bold text-slate-700 dark:text-dk-text outline-none"
                                                />
                                                <select
                                                    value={s.mode}
                                                    onChange={e => setSaisie(x => ({ ...x, [f.id]: { ...s, mode: e.target.value } }))}
                                                    className="h-9 sm:h-8 px-2 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[11px] font-bold text-slate-700 dark:text-dk-text outline-none"
                                                >
                                                    {MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                                <button
                                                    type="button"
                                                    disabled={occupe || !(Number(s.montant) > 0) || Number(s.montant) > f.reste + 0.009}
                                                    onClick={() => void encaisser(f, Number(s.montant), s.date, s.mode)}
                                                    className="h-9 sm:h-8 px-3 rounded-lg text-[11px] font-bold border border-slate-300 dark:border-dk-border text-slate-700 dark:text-dk-text-soft disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-dk-elevated"
                                                >
                                                    Encaisser
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={occupe}
                                                    onClick={() => {
                                                        if (!window.confirm(`Solder ${f.numero} : ${nf(f.reste)} ${devise} recus le ${jjmmaaaa(s.date)} en ${s.mode} ?`)) return;
                                                        void encaisser(f, f.reste, s.date, s.mode);
                                                    }}
                                                    className="h-9 sm:h-8 px-3 rounded-lg text-[11px] font-black bg-slate-900 dark:bg-dk-accent text-white inline-flex items-center gap-1.5 disabled:opacity-40"
                                                >
                                                    <Check className="w-3.5 h-3.5" /> Tout ({nf(f.reste)})
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                );
            })}
        </PanneauDetail>
    );
};

export default EncoursDetail;
