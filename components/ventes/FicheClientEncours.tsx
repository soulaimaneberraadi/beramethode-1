import React from 'react';
import { AlertTriangle, Phone, MapPin, RefreshCw, Trash2, Check, X, Printer, FileText } from 'lucide-react';
import { grouperArticles, LigneModele } from './articles';
import ApercuRecu from './ApercuRecu';
import ContactClient from './ContactClient';
import { ouvrirTiers } from './naviguerTiers';
import type { DonneesReleve } from './releveCompte';
import ApercuReleve from './ApercuReleve';
import Garanties from './Garanties';

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
    dateFacture: string | null; dateEcheance: string | null; dateLivraison: string | null; statut: string | null;
    totalTtc: number; montantPaye: number; reste: number;
    articles: Article[]; paiements: Paiement[];
};

type Histo = { clientId: string; emetteur?: any; client?: any; factures: FactureHisto[]; totalFacture: number; totalPaye: number };

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
    // La confirmation est DANS la page : window.confirm est bloque dans certains
    // conteneurs, et le bouton restait sans effet, sans le moindre message.
    const [aConfirmer, setAConfirmer] = React.useState<string | null>(null);
    // Voir avant d imprimer : une feuille gaspillee pour lire un montant, non.
    const [apercu, setApercu] = React.useState<string | null>(null);
    // La situation de compte se regarde et se regle avant de partir.
    const [releve, setReleve] = React.useState<DonneesReleve | null>(null);

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

    const supprimerPaiement = async (p: Paiement) => {
        setAConfirmer(null);
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

    /** La situation de compte : factures avec leur livraison et leur echeance,
     *  versements, garanties, et les jours qui restent avant chaque terme. */
    const imprimerReleve = async () => {
        if (!histo) return;
        try {
            const g = client.clientId
                ? await fetch(`/api/ventes/garanties?clientId=${encodeURIComponent(client.clientId)}`, { credentials: 'include' })
                    .then(r => r.json()).catch(() => ({ garanties: [] }))
                : { garanties: [] };

            setReleve({
                emetteur: histo.emetteur || null,
                client: {
                    nom: fiche?.nom || client.nom,
                    tel: fiche?.tel || client.tel,
                    ville: fiche?.ville || client.ville,
                    adresse: fiche?.adresse || null,
                    ice: fiche?.ice || null,
                    ifFiscal: fiche?.if_fiscal || null,
                    rc: fiche?.rc || null,
                },
                factures: [...histo.factures]
                    .sort((a, b) => (a.dateFacture || '').localeCompare(b.dateFacture || ''))
                    .map(f => ({
                        numero: f.numero,
                        dateFacture: f.dateFacture,
                        dateLivraison: f.dateLivraison || f.dateFacture,
                        dateEcheance: f.dateEcheance,
                        totalTtc: f.totalTtc,
                        montantPaye: f.montantPaye,
                        reste: f.reste,
                        articles: f.articles,
                    })),
                paiements: histo.factures
                    .flatMap(f => f.paiements.map(p => ({
                        date: p.date, montant: p.montant, mode: p.mode, reference: p.reference, facture: f.numero,
                    })))
                    .sort((a, b) => (a.date || '').localeCompare(b.date || '')),
                garanties: (g?.garanties || [])
                    .filter((x: any) => x.statut === 'EN_GARDE')
                    .map((x: any) => ({ type: x.type, numero: x.numero, banque: x.banque, montant: x.montant, dateEcheance: x.dateEcheance })),
            });
        } catch (e: any) {
            setErreur(e?.message || String(e));
        }
    };
    const fiche = histo?.client || null;

    if (releve) {
        return (
            <ApercuReleve
                donnees={releve}
                devise={devise}
                tel={fiche?.tel || client.tel}
                retour={client.nom}
                onFermer={() => setReleve(null)}
            />
        );
    }

    if (apercu) {
        return <ApercuRecu paiementId={apercu} devise={devise} retour={client.nom} onFermer={() => setApercu(null)} />;
    }

    return (
        <div className="space-y-2.5">
            <div className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3.5 py-3">
                {/* L'identite complete : un releve ou une facture sans ICE ni
                    adresse ne s'envoie pas, et il faut la voir d'ici. */}
                {fiche && (
                    <div className="flex items-start gap-3 mb-2.5">
                        {fiche.photo
                            ? <img src={fiche.photo} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-dk-border" />
                            : <span className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-dk-elevated shrink-0 flex items-center justify-center text-[12px] font-black text-slate-300">
                                {(fiche.nom || '—').slice(0, 2).toUpperCase()}
                            </span>}
                        <div className="min-w-0 flex-1 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
                            {([
                                ['Segment', fiche.types || fiche.type],
                                ['ICE', fiche.ice],
                                ['IF', fiche.if_fiscal],
                                ['RC', fiche.rc],
                                ['Email', fiche.email],
                                ['Adresse', [fiche.adresse, fiche.ville].filter(Boolean).join(', ')],
                                ['Client depuis', fiche.created_at ? String(fiche.created_at).slice(0, 10) : null],
                            ] as Array<[string, string | null]>)
                                .filter(([, v]) => v)
                                .map(([k, v]) => (
                                    <span key={k} className="min-w-0">
                                        <span className="block text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted">{k}</span>
                                        {/* L adresse mene a l annuaire filtre : savoir QUI d autre
                                            se trouve a la meme adresse evite de livrer deux fois
                                            au meme endroit — et de relancer le mauvais. */}
                                        {k === 'Adresse' ? (
                                            <button
                                                type="button"
                                                // L'adresse complete plutot que la seule
                                                // ville : « qui d'autre est a CETTE adresse »
                                                // est la question, pas « qui est en ville ».
                                                onClick={() => ouvrirTiers(v || fiche.ville || '')}
                                                title="Voir les clients a cette adresse"
                                                className="block text-[11px] font-bold text-slate-700 dark:text-dk-text-soft truncate max-w-full text-left hover:underline decoration-slate-300 underline-offset-2"
                                            >
                                                {v}
                                            </button>
                                        ) : (
                                            <span className="block text-[11px] font-bold text-slate-700 dark:text-dk-text-soft truncate" title={v || ''}>{v}</span>
                                        )}
                                    </span>
                                ))}
                        </div>
                    </div>
                )}
                {fiche?.notes && (
                    <p className="mb-2 text-[11px] text-slate-500 dark:text-dk-muted border-l-2 border-slate-200 dark:border-dk-border pl-2">{fiche.notes}</p>
                )}
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-dk-muted">
                    <ContactClient
                        tel={fiche?.tel || client.tel}
                        onReleve={() => void imprimerReleve()}
                        relance={{
                            nom: client.nom,
                            encours: histo ? Math.max(0, histo.totalFacture - histo.totalPaye) : client.encours,
                            devise,
                            societe: histo?.emetteur?.nom || null,
                            factures: (histo?.factures || []).filter(f => f.reste > 0.009)
                                .map(f => ({ numero: f.numero, reste: f.reste, dateEcheance: f.dateEcheance })),
                        }}
                    />
                    {(fiche?.ville || client.ville) && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{fiche?.ville || client.ville}</span>}
                    <button type="button" onClick={() => void charger()} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-900">
                        <RefreshCw className={`w-3 h-3 ${chargement ? 'opacity-40' : ''}`} /> Actualiser
                    </button>
                    {/* Le carnet de credit, imprime : c'est ce qu'on signe a deux. */}
                    <button type="button" onClick={() => void imprimerReleve()} className="inline-flex items-center gap-1 font-bold text-slate-500 hover:text-slate-900">
                        <FileText className="w-3 h-3" /> Releve de compte
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

            {/* Les cheques et effets detenus : jamais melanges au solde, mais
                jamais loin de lui non plus. */}
            <Garanties
                clientId={client.clientId}
                resteDu={histo ? histo.totalFacture - histo.totalPaye : client.encours}
                devise={devise}
            />

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
                            /* Quatre versements font quatre lignes pleine largeur
                               pour dire « 10 600 encaisses » : ils tiennent en
                               une bande, chacun avec sa corbeille. */
                            <div className="bg-slate-50/60 dark:bg-dk-elevated/30 border-t border-slate-100 dark:border-dk-border px-3 py-2">
                                <span className="block text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted mb-1">
                                    {f.paiements.length} reglement(s) · {nf(f.paiements.reduce((a, p) => a + p.montant, 0))} {devise}
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    {f.paiements.map(p => (
                                        <span key={p.id}
                                            title={`${jjmmaaaa(p.date)}${p.mode ? ` · ${p.mode}` : ''}${p.reference ? ` · ${p.reference}` : ''}`}
                                            className="inline-flex items-center gap-1.5 pl-2 pr-0.5 py-0.5 rounded-lg bg-white dark:bg-dk-surface border border-emerald-200 dark:border-emerald-800/50">
                                            <span className="text-[11px] font-black tabular-nums text-emerald-700 dark:text-emerald-400">{nf(p.montant)}</span>
                                            <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted whitespace-nowrap">
                                                {jjmmaaaa(p.date).slice(0, 5)}{p.mode ? ` · ${p.mode}` : ''}
                                            </span>
                                            {/* La confirmation remplace la corbeille sur
                                                place : deux gestes, aucune boite du
                                                navigateur qui pourrait etre bloquee. */}
                                            {/* Rejouer le recu : le client perd le sien,
                                                le vendeur doit pouvoir le retirer. */}
                                            <button
                                                type="button"
                                                onClick={() => setApercu(p.id)}
                                                title="Voir le recu"
                                                className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-dk-elevated"
                                            >
                                                <Printer className="w-3 h-3" />
                                            </button>
                                            {aConfirmer === p.id ? (
                                                <span className="inline-flex items-center gap-0.5">
                                                    <button
                                                        type="button"
                                                        disabled={occupe === p.id}
                                                        onClick={() => void supprimerPaiement(p)}
                                                        title="Confirmer la suppression"
                                                        className="h-6 px-1.5 rounded-md text-[9px] font-black bg-rose-600 text-white disabled:opacity-40"
                                                    >
                                                        Supprimer
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAConfirmer(null)}
                                                        title="Annuler"
                                                        className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-dk-elevated"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={occupe === p.id}
                                                    onClick={() => setAConfirmer(p.id)}
                                                    title="Supprimer ce reglement"
                                                    className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-40"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </span>
                                    ))}
                                </div>
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
