import React from 'react';
import { AlertTriangle, Phone, MapPin, RefreshCw, Check, Search, ChevronDown } from 'lucide-react';
import PanneauDetail from './PanneauDetail';
import FicheClientEncours, { Article } from './FicheClientEncours';
import { grouperArticles, LigneModele } from './articles';
import { ChampDate, ChampListe } from './champs';
import ApercuRecu from './ApercuRecu';
import ContactClient from './ContactClient';

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const jjmmaaaa = (v?: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');

type Facture = {
    id: string; numero: string;
    clientId: string | null; clientNom: string;
    dateFacture: string | null; dateEcheance: string | null; dernierPaiement: string | null;
    totalTtc: number; montantPaye: number; reste: number;
    retardJours: number; entame: boolean;
    articles: Article[];
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

/** Les libelles de l'agenda maison, en francais : cette feuille n'est pas
 *  traduite pour l'instant, elle ne fait pas semblant de l'etre. */
const AGENDA = {
    mois: ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'],
    jours: ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'],
    aujourdhui: 'Aujourd hui',
    effacer: 'Effacer',
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
    // Le nom du client ouvre sa fiche PAR-DESSUS la liste : la fleche revient
    // a l'encours, elle ne referme pas tout.
    const [fiche, setFiche] = React.useState<ClientEncours | null>(null);
    // Solder demande confirmation SUR PLACE : window.confirm est bloque dans
    // certains conteneurs et le clic restait sans effet ni message.
    const [aSolder, setASolder] = React.useState<string | null>(null);
    // Le recu du versement qui vient d etre saisi : on le lit avant de l imprimer.
    const [apercu, setApercu] = React.useState<string | null>(null);
    // Un client ne paye pas une facture, il pose une somme sur le comptoir :
    // elle s'impute sur les plus anciennes d'abord.
    const [global, setGlobal] = React.useState<Record<string, { montant: number | ''; date: string; mode: string }>>({});

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
            // Un serveur d'une version anterieure renvoie des factures sans
            // articles : l'ecran ne doit pas tomber pour une clef absente.
            const brut = body as Reponse;
            setData({
                ...brut,
                clients: (brut.clients || []).map(c => ({
                    ...c,
                    factures: (c.factures || []).map(fa => ({ ...fa, articles: fa.articles || [] })),
                })),
            });
        } catch (e: any) {
            setErreur(e?.message || String(e));
            setData(null);
        } finally {
            setChargement(false);
        }
    }, []);

    React.useEffect(() => { void charger(); }, [charger]);

    // Partir vers l annuaire n a de sens que si le panneau s efface derriere.
    React.useEffect(() => {
        const partir = () => onFermer();
        window.addEventListener('bera:tiers-recherche', partir);
        return () => window.removeEventListener('bera:tiers-recherche', partir);
    }, [onFermer]);

    /** L'imputation : les factures les plus anciennes d'abord — c'est la regle
     *  comptable usuelle, et celle qui fait tomber les retards en premier. */
    const repartir = (factures: Facture[], montant: number) => {
        let reste = montant;
        const parts: Array<{ f: Facture; part: number }> = [];
        const ordre = [...factures].sort((a, b) =>
            (a.dateEcheance || a.dateFacture || '9999').localeCompare(b.dateEcheance || b.dateFacture || '9999'));
        for (const f of ordre) {
            if (reste <= 0.009) break;
            const part = Math.min(f.reste, reste);
            parts.push({ f, part: Number(part.toFixed(2)) });
            reste = Number((reste - part).toFixed(2));
        }
        return { parts, surplus: reste };
    };

    const encaisserGlobal = async (c: ClientEncours, montant: number, date: string, mode: string) => {
        const { parts } = repartir(c.factures, montant);
        if (parts.length === 0) return;
        setEnCours(c.cle);
        try {
            // Un versement par facture : on reutilise la route de paiement
            // existante plutot que d'ouvrir un second chemin vers l'argent.
            for (const p of parts) {
                const res = await fetch('/api/facturation/paiements', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        facture_id: p.f.id,
                        date_paiement: date || aujourdhui(),
                        montant: p.part,
                        mode,
                        notes: 'Versement global impute par anciennete',
                    }),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(body?.error || body?.message || 'HTTP ' + res.status);
            }
            setGlobal(g => { const n = { ...g }; delete n[c.cle]; return n; });
            await charger();
        } catch (e: any) {
            setErreur(e?.message || String(e));
        } finally {
            setEnCours(null);
        }
    };

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
            // Le recu part dans la foulee : un versement qu'on ne remet pas par
            // ecrit se rediscute le mois suivant.
            if (body?.id) setApercu(String(body.id));
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
                <RefreshCw className={`w-3.5 h-3.5 ${chargement ? 'opacity-40' : ''}`} />
            </button>
        </div>
    );

    if (apercu) {
        return <ApercuRecu paiementId={apercu} devise={devise} retour="Encours client" onFermer={() => setApercu(null)} />;
    }

    if (fiche) {
        return (
            <PanneauDetail
                titre={fiche.nom}
                valeur={`${nf(fiche.encours)} ${devise}`}
                alerte={fiche.encours > 0}
                sous="Historique complet — factures et reglements"
                retour="Encours client"
                onFermer={() => setFiche(null)}
            >
                <FicheClientEncours client={fiche} devise={devise} onChange={() => void charger()} />
            </PanneauDetail>
        );
    }

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
                        <div className="w-full px-3.5 py-2.5 flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                                {/* Le nom ouvre la fiche ; le reste de la ligne
                                    plie ou deplie les factures. */}
                                <button
                                    type="button"
                                    onClick={() => setFiche(c)}
                                    className="text-[13px] font-black text-slate-900 dark:text-dk-text truncate max-w-full text-left hover:underline decoration-slate-300 underline-offset-2"
                                >
                                    {c.nom}
                                </button>
                                <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-400 dark:text-dk-muted mt-0.5">
                                    {c.tel && (
                                        <ContactClient
                                            tel={c.tel}
                                            compact
                                            relance={{
                                                nom: c.nom,
                                                encours: c.encours,
                                                devise,
                                                factures: c.factures.map(f => ({ numero: f.numero, reste: f.reste, dateEcheance: f.dateEcheance, retardJours: f.retardJours })),
                                            }}
                                        />
                                    )}
                                    {c.ville && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{c.ville}</span>}
                                    <span>{c.factures.length} facture(s)</span>
                                    {/* Le plus vieux delai depasse dit l'urgence mieux qu'un montant. */}
                                    {c.retardMax > 0 && <span className="font-bold text-rose-600 dark:text-rose-400">{c.retardMax} j de retard</span>}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOuverts(o => ({ ...o, [c.cle]: !ouvert }))}
                                className="shrink-0 flex items-start gap-2 text-right"
                            >
                                <span>
                                    <span className="block text-[15px] font-black tabular-nums text-amber-600 dark:text-amber-400">{nf(c.encours)}</span>
                                    {c.montantRetard > 0 && (
                                        <span className="block text-[10px] font-bold tabular-nums text-rose-600 dark:text-rose-400">
                                            dont {nf(c.montantRetard)} en retard
                                        </span>
                                    )}
                                </span>
                                <ChevronDown className={`w-4 h-4 shrink-0 mt-1 text-slate-300 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
                            </button>
                        </div>

                        {/* Le comptoir : le client pose une somme, elle tombe sur
                            les plus anciennes factures. On montre le decoupage
                            AVANT d'encaisser — c'est de l'argent. */}
                        {ouvert && c.factures.length > 1 && (() => {
                            const g = global[c.cle] || { montant: '' as number | '', date: aujourdhui(), mode: 'ESPECES' };
                            const saisi = Number(g.montant) || 0;
                            const { parts, surplus } = repartir(c.factures, Math.min(saisi, c.encours));
                            return (
                                <div className="px-3.5 py-2.5 bg-slate-100/60 dark:bg-dk-elevated/40 border-t border-slate-200 dark:border-dk-border">
                                    <span className="block text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted mb-1.5">
                                        Versement sur le compte — impute des plus anciennes
                                    </span>
                                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-1.5">
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            min={0}
                                            max={c.encours}
                                            value={g.montant}
                                            onChange={e => setGlobal(x => ({ ...x, [c.cle]: { ...g, montant: e.target.value === '' ? '' : Number(e.target.value) } }))}
                                            placeholder={`Montant recu (max ${nf(c.encours)})`}
                                            className="col-span-2 sm:col-span-1 h-9 sm:h-8 px-2.5 sm:w-[170px] rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[12px] font-bold tabular-nums text-slate-700 dark:text-dk-text outline-none"
                                        />
                                        <ChampDate
                                            label=""
                                            value={g.date}
                                            vide="jj/mm/aaaa"
                                            max={aujourdhui()}
                                            labels={AGENDA}
                                            neutre
                                            onChange={v => setGlobal(x => ({ ...x, [c.cle]: { ...g, date: v || aujourdhui() } }))}
                                        />
                                        <ChampListe
                                            label=""
                                            value={g.mode}
                                            largeur="sm:min-w-[120px]"
                                            neutre
                                            onChange={v => setGlobal(x => ({ ...x, [c.cle]: { ...g, mode: v } }))}
                                            options={MODES.map(m => ({ valeur: m, texte: m }))}
                                        />
                                        <button
                                            type="button"
                                            disabled={enCours === c.cle || parts.length === 0}
                                            onClick={() => void encaisserGlobal(c, Math.min(saisi, c.encours), g.date, g.mode)}
                                            className="h-9 sm:h-8 px-3 rounded-lg text-[11px] font-black bg-slate-900 dark:bg-dk-accent text-white inline-flex items-center gap-1.5 disabled:text-slate-300 disabled:bg-transparent disabled:border disabled:border-dashed disabled:border-slate-200"
                                        >
                                            <Check className="w-3.5 h-3.5" /> Imputer
                                        </button>
                                    </div>
                                    {parts.length > 0 && (
                                        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-dk-muted">
                                            {parts.map(p => (
                                                <span key={p.f.id} className="whitespace-nowrap">
                                                    <span className="font-black text-slate-700 dark:text-dk-text">{p.f.numero}</span>
                                                    {' '}
                                                    <span className="tabular-nums">{nf(p.part)}</span>
                                                    {p.part >= p.f.reste - 0.009
                                                        ? <span className="ml-1 font-bold text-emerald-600 dark:text-emerald-400">soldee</span>
                                                        : <span className="ml-1 text-slate-400">reste {nf(p.f.reste - p.part)}</span>}
                                                </span>
                                            ))}
                                            {surplus > 0.009 && <span className="font-bold text-amber-600">non impute {nf(surplus)}</span>}
                                        </p>
                                    )}
                                </div>
                            );
                        })()}

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

                                            {/* De quoi il s'agit : la photo du modele
                                                identifie la dette plus vite que son numero. */}
                                            {f.articles.length > 0 && (
                                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border px-2.5 py-1.5">
                                                    {grouperArticles(f.articles).map(g => (
                                                        <LigneModele key={g.cle} g={g} devise={devise} compact />
                                                    ))}
                                                </div>
                                            )}

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
                                                <ChampDate
                                                    label=""
                                                    value={s.date}
                                                    vide="jj/mm/aaaa"
                                                    max={aujourdhui()}
                                                    labels={AGENDA}
                                                    neutre
                                                    onChange={v => setSaisie(x => ({ ...x, [f.id]: { ...s, date: v || aujourdhui() } }))}
                                                />
                                                <ChampListe
                                                    label=""
                                                    value={s.mode}
                                                    largeur="sm:min-w-[120px]"
                                                    neutre
                                                    onChange={v => setSaisie(x => ({ ...x, [f.id]: { ...s, mode: v } }))}
                                                    options={MODES.map(m => ({ valeur: m, texte: m }))}
                                                />
                                                <button
                                                    type="button"
                                                    disabled={occupe || !(Number(s.montant) > 0) || Number(s.montant) > f.reste + 0.009}
                                                    onClick={() => void encaisser(f, Number(s.montant), s.date, s.mode)}
                                                    title="Saisir un montant pour activer"
                                                    className="h-9 sm:h-8 px-3 rounded-lg text-[11px] font-bold border border-slate-300 dark:border-dk-border text-slate-700 dark:text-dk-text-soft disabled:text-slate-300 disabled:border-dashed disabled:border-slate-200 hover:bg-slate-100 dark:hover:bg-dk-elevated"
                                                >
                                                    Encaisser
                                                </button>
                                                {aSolder === f.id ? (
                                                    <span className="col-span-2 sm:col-span-1 inline-flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            disabled={occupe}
                                                            onClick={() => { setASolder(null); void encaisser(f, f.reste, s.date, s.mode); }}
                                                            className="h-9 sm:h-8 px-3 rounded-lg text-[11px] font-black bg-rose-600 text-white inline-flex items-center gap-1.5 disabled:opacity-40"
                                                        >
                                                            <Check className="w-3.5 h-3.5" /> Confirmer {nf(f.reste)}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setASolder(null)}
                                                            className="h-9 sm:h-8 px-2.5 rounded-lg text-[11px] font-bold text-slate-500 border border-slate-200 dark:border-dk-border"
                                                        >
                                                            Annuler
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        disabled={occupe}
                                                        onClick={() => setASolder(f.id)}
                                                        className="h-9 sm:h-8 px-3 rounded-lg text-[11px] font-black bg-slate-900 dark:bg-dk-accent text-white inline-flex items-center gap-1.5 disabled:opacity-40"
                                                    >
                                                        <Check className="w-3.5 h-3.5" /> Tout ({nf(f.reste)})
                                                    </button>
                                                )}
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
