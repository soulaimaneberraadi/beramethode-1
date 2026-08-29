import React from 'react';
import { AlertTriangle, Phone, MapPin, RefreshCw, Trash2, Check } from 'lucide-react';
import { grouperArticles, LigneModele } from './articles';

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const jjmmaaaa = (v?: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');

export type Article = {
    designation: string; quantite: number; prixUnitaire: number; total: number;
    modelId: string | null; image: string | null;
};

type Paiement = {
    id: string; factureId: string; date: string; montant: number;
    mode: string | null; reference: string | null; notes: string | null;
};

type FactureHisto = {
    id: string; numero: string;
    dateFacture: string | null; dateEcheance: string | null; statut: string | null;
    totalTtc: number; montantPaye: number; reste: number;
    articles: Article[]; paiements: Paiement[];
};

type Histo = { clientId: string; factures: FactureHisto[]; totalFacture: number; totalPaye: number };

/**
 * La fiche d'un client vue depuis l'encours : TOUT ce qui s'est passe avec
 * lui — factures soldees comprises — parce qu'un solde conteste se verifie
 * sur l'historique, pas sur le reste a payer.
 *
 * Un reglement saisi par erreur se supprime ici : sans cette porte, une
 * faute de frappe se corrige en base ou pas du tout.
 */
const FicheClientEncours: React.FC<{
    client: { clientId: string | null; nom: string; tel: string | null; ville: string | null; encours: number };
    devise: string;
    onChange: () => void;
}> = ({ client, devise, onChange }) => {
    const [histo, setHisto] = React.useState<Histo | null>(null);
    const [chargement, setChargement] = React.useState(true);
    const [erreur, setErreur] = React.useState<string | null>(null);
    const [occupe, setOccupe] = React.useState<string | null>(null);

    const charger = React.useCallback(async () => {
        if (!client.clientId) { setChargement(false); setErreur('Ce client n’a pas de fiche : la facture porte un nom libre.'); return; }
        setChargement(true);
        setErreur(null);
        try {
            const res = await fetch(`/api/ventes/clients/${encodeURIComponent(client.clientId)}/historique`, { credentials: 'include' });
            const body = await res.json().catch(() => ({}));
            if (res.status === 404) throw new Error('Route absente : redemarrer le serveur (npm run dev:app).');
            if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
            setHisto(body as Histo);
        } catch (e: any) {
            setErreur(e?.message || String(e));
        } finally {
            setChargement(false);
        }
    }, [client.clientId]);

    React.useEffect(() => { void charger(); }, [charger]);

    const supprimerPaiement = async (p: Paiement, numero: string) => {
        if (!window.confirm(`Supprimer le reglement de ${nf(p.montant)} ${devise} du ${jjmmaaaa(p.date)} sur ${numero} ? Le montant retourne a l’encours.`)) return;
        setOccupe(p.id);
        try {
            const res = await fetch(`/api/facturation/paiements/${encodeURIComponent(p.factureId)}/${encodeURIComponent(p.id)}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
            await charger();
            onChange();
        } catch (e: any) {
            setErreur(e?.message || String(e));
        } finally {
            setOccupe(null);
        }
    };

    return (
        <div className="space-y-2.5">
            <div className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3.5 py-3">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-dk-muted">
                    {client.tel && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{client.tel}</span>}
                    {client.ville && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{client.ville}</span>}
                    <button type="button" onClick={() => void charger()} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-900">
                        <RefreshCw className={`w-3 h-3 ${chargement ? 'animate-spin' : ''}`} /> Actualiser
                    </button>
                </p>
                {histo && (
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        <span className="rounded-lg bg-slate-50 dark:bg-dk-elevated py-1.5">
                            <span className="block text-[9px] font-black uppercase tracking-[0.06em] text-slate-400">Facture</span>
                            <span className="block text-[13px] font-black tabular-nums text-slate-800 dark:text-dk-text">{nf(histo.totalFacture)}</span>
                        </span>
                        <span className="rounded-lg bg-slate-50 dark:bg-dk-elevated py-1.5">
                            <span className="block text-[9px] font-black uppercase tracking-[0.06em] text-slate-400">Paye</span>
                            <span className="block text-[13px] font-black tabular-nums text-emerald-600 dark:text-emerald-400">{nf(histo.totalPaye)}</span>
                        </span>
                        <span className="rounded-lg bg-slate-50 dark:bg-dk-elevated py-1.5">
                            <span className="block text-[9px] font-black uppercase tracking-[0.06em] text-slate-400">Reste</span>
                            <span className="block text-[13px] font-black tabular-nums text-amber-600 dark:text-amber-400">{nf(histo.totalFacture - histo.totalPaye)}</span>
                        </span>
                    </div>
                )}
            </div>

            {erreur && (
                <p className="flex items-start gap-1.5 text-[12px] text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 rounded-xl bg-white dark:bg-dk-surface p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {erreur}
                </p>
            )}

            {histo?.factures.map(f => {
                const soldee = f.reste <= 0.009;
                return (
                    <section key={f.id} className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface overflow-hidden">
                        <div className="px-3.5 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-100 dark:border-dk-border">
                            <span className="text-[12px] font-black text-slate-800 dark:text-dk-text">{f.numero}</span>
                            <span className="text-[10px] text-slate-400 dark:text-dk-muted">{jjmmaaaa(f.dateFacture)}</span>
                            <span className="text-[10px] text-slate-400 dark:text-dk-muted">Echeance {jjmmaaaa(f.dateEcheance)}</span>
                            <span className="ml-auto text-[12px] font-black tabular-nums">
                                {soldee
                                    ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" />{nf(f.totalTtc)}</span>
                                    : <span className="text-amber-600 dark:text-amber-400">Reste {nf(f.reste)} / {nf(f.totalTtc)}</span>}
                            </span>
                        </div>

                        {/* Les articles : on reconnait un vetement a sa photo bien
                            avant d'en lire la reference. */}
                        <div className="divide-y divide-slate-50 dark:divide-dk-border/50">
                            {f.articles.length === 0 && (
                                <p className="px-3.5 py-2 text-[11px] text-slate-400 dark:text-dk-muted">Aucun detail d’article sur cette facture.</p>
                            )}
                            {grouperArticles(f.articles).map(g => (
                                <div key={`${f.id}-${g.cle}`} className="px-3.5 py-1.5">
                                    <LigneModele g={g} devise={devise} />
                                </div>
                            ))}
                        </div>

                        {f.paiements.length > 0 && (
                            <div className="bg-slate-50/60 dark:bg-dk-elevated/30 border-t border-slate-100 dark:border-dk-border divide-y divide-slate-100 dark:divide-dk-border/60">
                                {f.paiements.map(p => (
                                    <div key={p.id} className="px-3.5 py-2 flex items-center gap-2.5">
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                                Regle {nf(p.montant)} {devise}
                                            </span>
                                            <span className="block text-[10px] text-slate-400 dark:text-dk-muted">
                                                {jjmmaaaa(p.date)}{p.mode ? ` · ${p.mode}` : ''}{p.reference ? ` · ${p.reference}` : ''}
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            disabled={occupe === p.id}
                                            onClick={() => void supprimerPaiement(p, f.numero)}
                                            title="Supprimer ce reglement"
                                            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-40"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                );
            })}

            {!chargement && histo && histo.factures.length === 0 && (
                <p className="text-center text-[12px] text-slate-400 dark:text-dk-muted py-10">Aucune facture pour ce client.</p>
            )}
        </div>
    );
};

export default FicheClientEncours;
