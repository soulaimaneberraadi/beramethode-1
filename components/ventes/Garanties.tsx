import React from 'react';
import { ShieldCheck, AlertTriangle, Plus, Undo2, X } from 'lucide-react';
import { ChampDate, ChampListe } from './champs';

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const jjmmaaaa = (v?: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');

const AGENDA = {
    mois: ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'],
    jours: ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'],
    aujourdhui: 'Aujourd hui',
    effacer: 'Effacer',
};

export type Garantie = {
    id: string; clientId: string; clientNom: string;
    type: 'CHEQUE' | 'EFFET'; numero: string | null; banque: string | null;
    montant: number; dateRemise: string; dateEcheance: string | null;
    statut: 'EN_GARDE' | 'RESTITUEE' | 'ENCAISSEE' | 'IMPAYEE';
    dateSortie: string | null; notes: string | null; echue: boolean;
};

const TEINTE: Record<Garantie['statut'], string> = {
    EN_GARDE: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800/50',
    RESTITUEE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/50',
    ENCAISSEE: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-dk-elevated dark:text-dk-muted dark:border-dk-border',
    IMPAYEE: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/50',
};

/**
 * Les garanties d'un client : le cheque ou l'effet laisse a la vente.
 *
 * Ce bloc ne touche jamais au solde. Une garantie n'est pas un encaissement —
 * la confondre avec un reglement solderait le client le jour meme de la vente,
 * alors qu'il n'a rien paye.
 *
 * Quand la dette tombe a zero, le bloc le DIT : c'est le moment de rendre la
 * piece, et c'est l'oubli le plus courant du commerce de gros.
 */
const Garanties: React.FC<{
    clientId: string | null;
    resteDu: number;
    devise: string;
}> = ({ clientId, resteDu, devise }) => {
    const [liste, setListe] = React.useState<Garantie[]>([]);
    const [erreur, setErreur] = React.useState<string | null>(null);
    const [occupe, setOccupe] = React.useState<string | null>(null);
    const [ouvertAjout, setOuvertAjout] = React.useState(false);
    const [form, setForm] = React.useState({
        type: 'CHEQUE', numero: '', banque: '',
        montant: '' as number | '', dateRemise: aujourdhui(), dateEcheance: '',
    });

    const charger = React.useCallback(async () => {
        if (!clientId) return;
        try {
            const res = await fetch(`/api/ventes/garanties?clientId=${encodeURIComponent(clientId)}`, { credentials: 'include' });
            const body = await res.json().catch(() => ({}));
            if (res.status === 404) throw new Error('Route absente : redemarrer le serveur (npm run dev:app).');
            if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
            setListe(body.garanties || []);
        } catch (e: any) {
            setErreur(e?.message || String(e));
        }
    }, [clientId]);

    React.useEffect(() => { void charger(); }, [charger]);

    const enregistrer = async () => {
        if (!clientId || !(Number(form.montant) > 0)) return;
        setOccupe('AJOUT');
        try {
            const res = await fetch('/api/ventes/garanties', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, clientId, montant: Number(form.montant), dateEcheance: form.dateEcheance || null }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
            setOuvertAjout(false);
            setForm({ type: 'CHEQUE', numero: '', banque: '', montant: '', dateRemise: aujourdhui(), dateEcheance: '' });
            await charger();
        } catch (e: any) {
            setErreur(e?.message || String(e));
        } finally {
            setOccupe(null);
        }
    };

    const changerStatut = async (g: Garantie, statut: Garantie['statut']) => {
        setOccupe(g.id);
        try {
            const res = await fetch(`/api/ventes/garanties/${encodeURIComponent(g.id)}/statut`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ statut, date: aujourdhui() }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
            await charger();
        } catch (e: any) {
            setErreur(e?.message || String(e));
        } finally {
            setOccupe(null);
        }
    };

    const enGarde = liste.filter(g => g.statut === 'EN_GARDE');
    const totalEnGarde = enGarde.reduce((a, g) => a + g.montant, 0);
    const aRendre = enGarde.length > 0 && resteDu <= 0.009;

    return (
        <div className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface overflow-hidden">
            <div className="px-3.5 py-2 flex items-center gap-2 border-b border-slate-100 dark:border-dk-border">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted">
                    Garanties detenues
                </span>
                {totalEnGarde > 0 && (
                    <span className="text-[11px] font-black tabular-nums text-indigo-700 dark:text-indigo-400">
                        {nf(totalEnGarde)} {devise}
                    </span>
                )}
                <button
                    type="button"
                    onClick={() => setOuvertAjout(v => !v)}
                    className="ml-auto h-7 px-2 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft inline-flex items-center gap-1 hover:bg-slate-50"
                >
                    {ouvertAjout ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    {ouvertAjout ? 'Annuler' : 'Recevoir'}
                </button>
            </div>

            {/* La dette est eteinte et la piece est encore la : le rappel vaut
                plus qu'une ligne de tableau. */}
            {aRendre && (
                <p className="px-3.5 py-2 flex items-start gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/20">
                    <Undo2 className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Le compte est solde : la garantie doit etre rendue au client.
                </p>
            )}

            {erreur && (
                <p className="px-3.5 py-2 flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erreur}
                </p>
            )}

            {ouvertAjout && (
                <div className="px-3.5 py-2.5 bg-slate-50/70 dark:bg-dk-elevated/30 border-b border-slate-100 dark:border-dk-border">
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-1.5">
                        <ChampListe
                            label="Type"
                            value={form.type}
                            neutre
                            largeur="sm:min-w-[110px]"
                            onChange={v => setForm(f => ({ ...f, type: v }))}
                            options={[{ valeur: 'CHEQUE', texte: 'CHEQUE' }, { valeur: 'EFFET', texte: 'EFFET' }]}
                        />
                        <label className="flex flex-col gap-1 min-w-0">
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted">Numero</span>
                            <input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                                className="h-9 sm:h-8 px-2.5 sm:w-[120px] rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[11px] font-bold text-slate-700 dark:text-dk-text outline-none" />
                        </label>
                        <label className="flex flex-col gap-1 min-w-0">
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted">Banque</span>
                            <input value={form.banque} onChange={e => setForm(f => ({ ...f, banque: e.target.value }))}
                                className="h-9 sm:h-8 px-2.5 sm:w-[130px] rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[11px] font-bold text-slate-700 dark:text-dk-text outline-none" />
                        </label>
                        <label className="flex flex-col gap-1 min-w-0">
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted">Montant</span>
                            <input type="number" inputMode="decimal" min={0} value={form.montant}
                                onChange={e => setForm(f => ({ ...f, montant: e.target.value === '' ? '' : Number(e.target.value) }))}
                                className="h-9 sm:h-8 px-2.5 sm:w-[120px] rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[11px] font-bold tabular-nums text-slate-700 dark:text-dk-text outline-none" />
                        </label>
                        <ChampDate label="Recu le" value={form.dateRemise} vide="jj/mm/aaaa" max={aujourdhui()} labels={AGENDA} neutre
                            onChange={v => setForm(f => ({ ...f, dateRemise: v || aujourdhui() }))} />
                        <ChampDate label="Echeance" value={form.dateEcheance} vide="jj/mm/aaaa" labels={AGENDA}
                            onChange={v => setForm(f => ({ ...f, dateEcheance: v }))} />
                        <button
                            type="button"
                            disabled={occupe === 'AJOUT' || !(Number(form.montant) > 0)}
                            onClick={() => void enregistrer()}
                            className="col-span-2 sm:col-span-1 h-9 sm:h-8 px-3 rounded-lg text-[11px] font-black bg-slate-900 dark:bg-dk-accent text-white disabled:opacity-40"
                        >
                            Enregistrer
                        </button>
                    </div>
                    {form.type === 'CHEQUE' && (
                        <p className="mt-1.5 text-[10px] text-slate-400 dark:text-dk-muted">
                            Au Maroc le cheque est un moyen de paiement a vue : l’effet de commerce est l’instrument prevu pour un terme.
                        </p>
                    )}
                </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-dk-border">
                {liste.length === 0 && (
                    <p className="px-3.5 py-3 text-[11px] text-slate-400 dark:text-dk-muted">Aucune garantie detenue.</p>
                )}
                {liste.map(g => (
                    <div key={g.id} className="px-3.5 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black border ${TEINTE[g.statut]}`}>{g.statut.replace('_', ' ')}</span>
                        <span className="text-[11px] font-black text-slate-700 dark:text-dk-text">{g.type}</span>
                        {g.numero && <span className="text-[10px] font-bold text-slate-500 dark:text-dk-text-soft">N° {g.numero}</span>}
                        {g.banque && <span className="text-[10px] text-slate-400 dark:text-dk-muted">{g.banque}</span>}
                        <span className="text-[10px] text-slate-400 dark:text-dk-muted">Recu {jjmmaaaa(g.dateRemise)}</span>
                        <span className={`text-[10px] font-bold ${g.echue ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-dk-muted'}`}>
                            Echeance {jjmmaaaa(g.dateEcheance)}
                        </span>
                        <span className="ml-auto text-[12px] font-black tabular-nums text-slate-800 dark:text-dk-text">{nf(g.montant)}</span>
                        {g.statut === 'EN_GARDE' && (
                            <span className="flex items-center gap-1">
                                <button type="button" disabled={occupe === g.id} onClick={() => void changerStatut(g, 'RESTITUEE')}
                                    className="h-7 px-2 rounded-lg text-[10px] font-bold border border-emerald-200 text-emerald-700 dark:border-emerald-800/50 dark:text-emerald-400 disabled:opacity-40">
                                    Rendue
                                </button>
                                <button type="button" disabled={occupe === g.id} onClick={() => void changerStatut(g, 'ENCAISSEE')}
                                    className="h-7 px-2 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft disabled:opacity-40">
                                    Encaissee
                                </button>
                                <button type="button" disabled={occupe === g.id} onClick={() => void changerStatut(g, 'IMPAYEE')}
                                    className="h-7 px-2 rounded-lg text-[10px] font-bold border border-rose-200 text-rose-600 dark:border-rose-800/50 dark:text-rose-400 disabled:opacity-40">
                                    Impayee
                                </button>
                            </span>
                        )}
                        {g.dateSortie && <span className="text-[10px] text-slate-400 dark:text-dk-muted">le {jjmmaaaa(g.dateSortie)}</span>}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Garanties;
