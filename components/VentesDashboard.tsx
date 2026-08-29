/**
 * Tableau de bord des ventes.
 *
 * Trois décisions, et rien d'autre :
 *   1. quel modèle relancer en production,
 *   2. quel modèle solder avant qu'il ne dorme au dépôt,
 *   3. qui doit de l'argent avant qu'on le resserve.
 *
 * Tout vient des mouvements réellement enregistrés (`/api/ventes/dashboard`) :
 * aucune moyenne n'est calculée ici, pour qu'un chiffre à l'écran soit
 * exactement celui de la base — c'est de l'argent, il ne se recalcule pas en
 * deux endroits.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    TrendingUp, PackageX, AlertTriangle, RefreshCw, Users, Wallet, Boxes, Search, Filter, Receipt, ArrowUpRight, ArrowDownRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { tx } from '../lib/i18n';
import EncoursDetail from './ventes/EncoursDetail';

/** Sans serveur (deploiement statique), il n'y a ni sorties de stock ni
 *  clients a agreger : le tableau de bord le DIT, au lieu d'afficher une
 *  erreur reseau qui laisse croire a une panne. */
const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Le champ date natif affiche mm/dd/yyyy des que le navigateur est en
 *  anglais, et n'ouvre l'agenda que sur la petite icone. Ici la date se lit
 *  en jj/mm/aaaa et le champ entier ouvre l'agenda. */
type OptionListe = {
    valeur: string; texte: string;
    /** Ce qui distingue deux homonymes : telephone, ville. */
    sous?: string;
    /** Le seul chiffre qui compte au moment de choisir. */
    droite?: string; alerte?: boolean;
    /** Texte cherchable mais non affiche (ICE, ancien nom...). */
    recherche?: string;
};

/** Le select natif ouvre une liste dessinee par le systeme : police,
 *  couleurs et surlignage bleu n'ont rien a voir avec le reste. Ici la
 *  liste est a nous, et se filtre des qu'elle devient longue. */
const ChampListe: React.FC<{
    label: string; value: string; onChange: (v: string) => void;
    options: OptionListe[];
    placeholderRecherche?: string;
    largeur?: string;
    rechercheToujours?: boolean;
    classe?: string;
}> = ({ label, value, onChange, options, placeholderRecherche, largeur = 'sm:min-w-[150px]', rechercheToujours, classe = '' }) => {
    const [ouvert, setOuvert] = React.useState(false);
    const [q, setQ] = React.useState('');
    const boite = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!ouvert) return;
        const dehors = (e: MouseEvent) => { if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false); };
        const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
        document.addEventListener('mousedown', dehors);
        document.addEventListener('keydown', echap);
        return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap); };
    }, [ouvert]);
    const filtrable = rechercheToujours || options.length > 8;
    const terme = q.trim().toLowerCase();
    const visibles = filtrable && terme
        ? options.filter(o => `${o.texte} ${o.sous || ''} ${o.recherche || ''}`.toLowerCase().includes(terme))
        : options;
    const courant = options.find(o => o.valeur === value) || options[0];
    return (
        <div className={`flex flex-col gap-1 min-w-0 ${classe}`} ref={boite}>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted">{label}</span>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => { setOuvert(v => !v); setQ(''); }}
                    className={`h-8 pl-2.5 pr-7 ${largeur} w-full rounded-lg border text-[11px] font-bold text-left truncate transition-colors ${value
                        ? 'bg-slate-900 dark:bg-dk-accent text-white border-transparent'
                        : 'bg-slate-50 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border hover:border-slate-400'}`}
                >
                    {courant?.texte}
                    <ChevronDown className={`w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 transition-transform ${ouvert ? 'rotate-180' : ''} ${value ? 'text-white/70' : 'text-slate-400'}`} />
                </button>
                {ouvert && (
                    <div className="absolute z-30 mt-1 left-0 right-0 sm:right-auto sm:min-w-full sm:w-max sm:max-w-[240px] rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-lg overflow-hidden">
                        {filtrable && (
                            <input
                                autoFocus
                                value={q}
                                onChange={e => setQ(e.target.value)}
                                placeholder={placeholderRecherche}
                                className="w-full h-10 sm:h-8 px-2.5 text-[11px] border-b border-slate-100 dark:border-dk-border bg-transparent text-slate-700 dark:text-dk-text placeholder:text-slate-400 outline-none"
                            />
                        )}
                        <div className="max-h-[45vh] sm:max-h-56 overflow-y-auto overscroll-contain py-1">
                            {visibles.length === 0 && (
                                <p className="px-2.5 py-2 text-[11px] text-slate-400 dark:text-dk-muted">—</p>
                            )}
                            {visibles.map(o => (
                                <button
                                    key={o.valeur || '__tous'}
                                    type="button"
                                    onClick={() => { onChange(o.valeur); setOuvert(false); }}
                                    className={`w-full text-left px-2.5 py-2.5 sm:py-1.5 text-[11px] font-bold truncate transition-colors ${o.valeur === value
                                        ? 'bg-slate-100 dark:bg-dk-elevated text-slate-900 dark:text-dk-text'
                                        : 'text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate">{o.texte}</span>
                                            {o.sous && <span className="block truncate text-[10px] font-medium text-slate-400 dark:text-dk-muted">{o.sous}</span>}
                                        </span>
                                        {o.droite && (
                                            <span className={`shrink-0 text-[10px] font-black tabular-nums ${o.alerte ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-dk-muted'}`}>
                                                {o.droite}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

/** L'agenda natif est dessine par le navigateur : mois en anglais, semaine
 *  qui commence dimanche, boutons bleus. On dessine le notre — semaine du
 *  lundi, bornes respectees, et des cibles qu'un doigt atteint. */
const Agenda: React.FC<{
    value: string; min?: string; max?: string;
    onPick: (v: string) => void; labels: { mois: string[]; jours: string[]; aujourdhui: string; effacer: string };
}> = ({ value, min, max, onPick, labels }) => {
    const base = value || aujourdhui();
    const [curseur, setCurseur] = React.useState(() => new Date(base.slice(0, 7) + '-01T00:00:00'));
    const annee = curseur.getFullYear();
    const mois = curseur.getMonth();
    const premier = new Date(annee, mois, 1);
    // getDay() met dimanche a 0 : ici la semaine commence lundi.
    const decalage = (premier.getDay() + 6) % 7;
    const nbJours = new Date(annee, mois + 1, 0).getDate();
    const iso = (d: number) => `${annee}-${String(mois + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const bloque = (k: string) => Boolean((min && k < min) || (max && k > max));
    const cases: Array<number | null> = [
        ...Array(decalage).fill(null),
        ...Array.from({ length: nbJours }, (_, n) => n + 1),
    ];
    return (
        <div className="p-2.5 w-[248px]">
            <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setCurseur(new Date(annee, mois - 1, 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-dk-elevated">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-black uppercase tracking-[0.06em] text-slate-700 dark:text-dk-text">
                    {labels.mois[mois]} {annee}
                </span>
                <button type="button" onClick={() => setCurseur(new Date(annee, mois + 1, 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-dk-elevated">
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
                {labels.jours.map(d => (
                    <span key={d} className="h-5 flex items-center justify-center text-[9px] font-black text-slate-400 dark:text-dk-muted">{d}</span>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
                {cases.map((n, idx) => {
                    if (n == null) return <span key={`vide-${idx}`} />;
                    const k = iso(n);
                    const off = bloque(k);
                    const choisi = k === value;
                    const cejour = k === aujourdhui();
                    return (
                        <button
                            key={k}
                            type="button"
                            disabled={off}
                            onClick={() => onPick(k)}
                            className={`h-8 rounded-lg text-[11px] font-bold tabular-nums transition-colors ${choisi
                                ? 'bg-slate-900 dark:bg-dk-accent text-white'
                                : off
                                    ? 'text-slate-200 dark:text-dk-border cursor-not-allowed'
                                    : cejour
                                        ? 'text-slate-900 dark:text-dk-text ring-1 ring-slate-300 dark:ring-dk-border hover:bg-slate-100 dark:hover:bg-dk-elevated'
                                        : 'text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:hover:bg-dk-elevated'}`}
                        >
                            {n}
                        </button>
                    );
                })}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-dk-border">
                <button type="button" onClick={() => onPick('')}
                    className="text-[10px] font-bold text-slate-400 dark:text-dk-muted hover:text-rose-600">{labels.effacer}</button>
                <button type="button" onClick={() => { if (!bloque(aujourdhui())) onPick(aujourdhui()); }}
                    className="text-[10px] font-bold text-slate-600 dark:text-dk-text-soft hover:text-slate-900">{labels.aujourdhui}</button>
            </div>
        </div>
    );
};

const ChampDate: React.FC<{
    label: string; value: string; onChange: (v: string) => void;
    min?: string; max?: string; vide: string; classe?: string;
    labels: { mois: string[]; jours: string[]; aujourdhui: string; effacer: string };
}> = ({ label, value, onChange, min, max, vide, classe = '', labels }) => {
    const [ouvert, setOuvert] = React.useState(false);
    const boite = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!ouvert) return;
        const dehors = (e: MouseEvent) => { if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false); };
        const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
        document.addEventListener('mousedown', dehors);
        document.addEventListener('keydown', echap);
        return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap); };
    }, [ouvert]);
    const lisible = value ? value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4) : vide;
    return (
        <div className={`flex flex-col gap-1 min-w-0 ${classe}`} ref={boite}>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted">{label}</span>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOuvert(v => !v)}
                    className={`relative w-full h-9 sm:h-8 pl-7 pr-2 sm:min-w-[128px] rounded-lg border text-[11px] font-bold text-left tabular-nums transition-colors ${value
                        ? 'bg-slate-900 dark:bg-dk-accent text-white border-transparent'
                        : 'bg-slate-50 dark:bg-dk-elevated border-slate-200 dark:border-dk-border text-slate-400 dark:text-dk-muted'} hover:border-slate-400`}
                >
                    <CalendarDays className={`w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 ${value ? 'text-white/70' : 'text-slate-400'}`} />
                    {lisible}
                </button>
                {ouvert && (
                    <div className="absolute z-30 mt-1 left-0 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-lg">
                        <Agenda
                            value={value}
                            min={min}
                            max={max}
                            labels={labels}
                            onPick={v => { onChange(v); setOuvert(false); }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

interface Props {
    lang: string;
    currency?: string;
}

type Modele = {
    modelId: string; nom: string; reference: string | null; image: string | null;
    canaux: Array<{ canal: string; pieces: number; ca: number }>;
    canalFort: string | null; partCanalFort: number | null;
    produit: number; vendu: number; stock: number;
    piecesPeriode: number; caPeriode: number; ticketsPeriode: number;
    ageJours: number | null; ecoule: number; parJour: number;
    joursAvantRupture: number | null;
    statut: 'TOP' | 'OK' | 'LENT' | 'MORT' | 'NEUF';
};

type ClientLigne = {
    id: string; nom: string; type: string | null; tel: string | null; ville: string | null;
    pieces: number; ca: number; tickets: number; derniere: string | null;
    encours: number; facturesEnRetard: number;
    statut: 'RETARD' | 'ENCOURS' | 'ACTIF' | 'DORMANT';
};

type Donnees = {
    jours: number; depuis: string;
    serie: Array<{ jour: string; ca: number; pieces: number; tickets: number }>;
    precedent: { du: string; au: string; ca: number; pieces: number; tickets: number };
    parJourSemaine: Array<{ jour: number; ca: number; pieces: number }>;
    concentration: { partTop3: number; clientsActifs: number };
    tailles: Array<{ taille: string; pieces: number; ca: number }>;
    couleurs: Array<{ couleur: string; pieces: number; ca: number }>;
    qualite: {
        tauxDefaut: number;
        parEtat: Array<{ qualite: string; pieces: number }>;
        parModele: Array<{ modelId: string; nom: string; ok: number; defauts: number; taux: number }>;
    };
    kpis: { ca: number; pieces: number; tickets: number; panierMoyen: number; encoursTotal: number };
    parCanal: Array<{ canal: string; pieces: number; ca: number; tickets: number }>;
    parSegment: Array<{ segment: string; pieces: number; ca: number }>;
    parPaiement: Array<{ mode: string; ca: number; tickets: number }>;
    modeles: Modele[];
    clients: ClientLigne[];
};

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

const TEINTE_STATUT: Record<Modele['statut'], string> = {
    TOP: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/50',
    OK: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-dk-elevated dark:text-dk-muted dark:border-dk-border',
    LENT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/50',
    MORT: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/50',
    NEUF: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800/50',
};

const TEINTE_CLIENT: Record<ClientLigne['statut'], string> = {
    RETARD: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/50',
    ENCOURS: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/50',
    ACTIF: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/50',
    DORMANT: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-dk-elevated dark:text-dk-muted dark:border-dk-border',
};

export default function VentesDashboard({ lang, currency = 'MAD' }: Props) {
    const [jours, setJours] = useState(30);
    /* Filtres : la même question posée à toute la page. Un total en haut qui
     * ne répondrait pas au même filtre que le détail en dessous serait un
     * chiffre faux, pas une nuance. */
    const [du, setDu] = useState('');
    const [au, setAu] = useState('');
    const [canal, setCanal] = useState('');
    const [segment, setSegment] = useState('');
    const [clientId, setClientId] = useState('');
    /** Liste des clients pour le filtre : figée au premier chargement sans
     *  filtre client, sinon choisir un client viderait la liste où on l'a pris. */
    const [annuaire, setAnnuaire] = useState<ClientLigne[]>([]);
    const [data, setData] = useState<Donnees | null>(null);
    const [chargement, setChargement] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);
    const [recherche, setRecherche] = useState('');
    const [filtreModele, setFiltreModele] = useState<'TOUS' | Modele['statut']>('TOUS');
    const [filtresOuverts, setFiltresOuverts] = useState(false);
    // Une tuile ne dit qu un total : le detail s ouvre par-dessus la page.
    const [detail, setDetail] = useState<null | 'encours'>(null);

    const charger = useCallback(async (n: number) => {
        if (IS_STATIC) { setData(null); setErreur(null); return; }
        setChargement(true);
        setErreur(null);
        try {
            const p = new URLSearchParams({ jours: String(n) });
            if (du) p.set('du', du);
            if (au) p.set('au', au);
            if (canal) p.set('canal', canal);
            if (segment) p.set('segment', segment);
            if (clientId) p.set('clientId', clientId);
            const res = await fetch(`/api/ventes/dashboard?${p.toString()}`, { credentials: 'include' });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
            if (!body || !Array.isArray(body.modeles) || !Array.isArray(body.clients)) {
                throw new Error('Reponse inattendue du serveur.');
            }
            setData({
                ...body,
                serie: Array.isArray(body.serie) ? body.serie : [],
                precedent: body.precedent || { du: '', au: '', ca: 0, pieces: 0, tickets: 0 },
                parJourSemaine: Array.isArray(body.parJourSemaine) ? body.parJourSemaine : [],
                concentration: body.concentration || { partTop3: 0, clientsActifs: 0 },
                kpis: body.kpis || { ca: 0, pieces: 0, tickets: 0, panierMoyen: 0, encoursTotal: 0 },
                parCanal: Array.isArray(body.parCanal) ? body.parCanal : [],
                parSegment: Array.isArray(body.parSegment) ? body.parSegment : [],
                parPaiement: Array.isArray(body.parPaiement) ? body.parPaiement : [],
            } as Donnees);
        } catch (e: any) {
            setData(null);
            setErreur(e?.message || String(e));
        } finally {
            setChargement(false);
        }
    }, [du, au, canal, segment, clientId]);

    useEffect(() => { void charger(jours); }, [jours, charger]);
    useEffect(() => {
        if (data && !clientId && annuaire.length === 0 && data.clients.length > 0) setAnnuaire(data.clients);
    }, [data, clientId, annuaire.length]);

    const T = {
        titre: tx(lang, { fr: 'Ventes', ar: 'المبيعات', en: 'Sales', es: 'Ventas', pt: 'Vendas', tr: 'Satislar' }),
        ca: tx(lang, { fr: "Chiffre d'affaires", ar: 'رقم المعاملات', en: 'Revenue', es: 'Facturacion', pt: 'Faturacao', tr: 'Ciro' }),
        pieces: tx(lang, { fr: 'Pieces vendues', ar: 'القطع المبيوعة', en: 'Items sold', es: 'Piezas vendidas', pt: 'Pecas vendidas', tr: 'Satilan parca' }),
        tickets: tx(lang, { fr: 'Ventes', ar: 'البيعات', en: 'Sales', es: 'Ventas', pt: 'Vendas', tr: 'Satis' }),
        panier: tx(lang, { fr: 'Panier moyen', ar: 'معدّل السلّة', en: 'Average sale', es: 'Ticket medio', pt: 'Venda media', tr: 'Ortalama sepet' }),
        encours: tx(lang, { fr: 'Encours client', ar: 'ما بقا فذمّة الزبناء', en: 'Outstanding', es: 'Pendiente', pt: 'Em divida', tr: 'Acik hesap' }),
        parCanal: tx(lang, { fr: 'Par canal', ar: 'حسب القناة', en: 'By channel', es: 'Por canal', pt: 'Por canal', tr: 'Kanala gore' }),
        parSegment: tx(lang, { fr: 'Par segment', ar: 'حسب الصنف', en: 'By segment', es: 'Por segmento', pt: 'Por segmento', tr: 'Segmente gore' }),
        parPaiement: tx(lang, { fr: 'Par reglement', ar: 'حسب الأداء', en: 'By payment', es: 'Por pago', pt: 'Por pagamento', tr: 'Odemeye gore' }),
        modeles: tx(lang, { fr: 'Modeles', ar: 'الموديلات', en: 'Models', es: 'Modelos', pt: 'Modelos', tr: 'Modeller' }),
        clients: tx(lang, { fr: 'Clients', ar: 'الزبناء', en: 'Customers', es: 'Clientes', pt: 'Clientes', tr: 'Musteriler' }),
        chercher: tx(lang, { fr: 'Chercher…', ar: 'قلّب…', en: 'Search…', es: 'Buscar…', pt: 'Procurar…', tr: 'Ara…' }),
        aRelancer: tx(lang, { fr: 'A relancer', ar: 'خاصو يعاود يتصنع', en: 'Reorder', es: 'Reponer', pt: 'Repor', tr: 'Yeniden uret' }),
        dort: tx(lang, { fr: 'Dort au depot', ar: 'نعسان فالمخزن', en: 'Sitting in stock', es: 'Parado en stock', pt: 'Parado em stock', tr: 'Stokta bekliyor' }),
        rien: tx(lang, { fr: 'Aucun mouvement sur la periode.', ar: 'ما كاين حتى حركة فهاد المدّة.', en: 'No movement in this period.', es: 'Sin movimientos en el periodo.', pt: 'Sem movimentos no periodo.', tr: 'Bu donemde hareket yok.' }),
        ecoule: tx(lang, { fr: 'Ecoule', ar: 'اللي تباع', en: 'Sold through', es: 'Vendido', pt: 'Vendido', tr: 'Satilan' }),
        stock: tx(lang, { fr: 'Stock', ar: 'الستوك', en: 'Stock', es: 'Stock', pt: 'Stock', tr: 'Stok' }),
        rupture: tx(lang, { fr: 'Rupture dans', ar: 'غادي يسالي فـ', en: 'Runs out in', es: 'Se agota en', pt: 'Acaba em', tr: 'Bitis' }),
        jours: tx(lang, { fr: 'jours', ar: 'يوم', en: 'days', es: 'dias', pt: 'dias', tr: 'gun' }),
        statique: tx(lang, {
            fr: "Cette version en ligne n'a pas de serveur : les ventes, le stock et les clients vivent dans l'installation locale. Ouvrez le tableau de bord depuis le poste ou tourne BERAMETHODE.",
            ar: 'هاد النسخة اللي أونلاين ما عندهاش سيرفر: البيعات والستوك والزبناء كاينين فالتنصيب المحلي. حلّ الداشبورد من الجهاز اللي خدّام فيه BERAMETHODE.',
            en: 'This online build has no server: sales, stock and customers live in the local installation. Open the dashboard from the machine running BERAMETHODE.',
            es: 'Esta version en linea no tiene servidor: las ventas y el stock estan en la instalacion local.',
            pt: 'Esta versao online nao tem servidor: as vendas e o stock estao na instalacao local.',
            tr: 'Bu cevrimici surumde sunucu yok: satislar ve stok yerel kurulumda.',
        }),
        du: tx(lang, { fr: 'Du', ar: 'من', en: 'From', es: 'Desde', pt: 'De', tr: 'Baslangic' }),
        au: tx(lang, { fr: 'Au', ar: 'إلى', en: 'To', es: 'Hasta', pt: 'Ate', tr: 'Bitis' }),
        tousCanaux: tx(lang, { fr: 'Tous canaux', ar: 'كل القنوات', en: 'All channels', es: 'Todos los canales', pt: 'Todos os canais', tr: 'Tum kanallar' }),
        tousSegments: tx(lang, { fr: 'Tous segments', ar: 'كل الأصناف', en: 'All segments', es: 'Todos los segmentos', pt: 'Todos os segmentos', tr: 'Tum segmentler' }),
        tousClients: tx(lang, { fr: 'Tous clients', ar: 'كل الزبناء', en: 'All customers', es: 'Todos los clientes', pt: 'Todos os clientes', tr: 'Tum musteriler' }),
        effacer: tx(lang, { fr: 'Effacer', ar: 'مسح', en: 'Clear', es: 'Borrar', pt: 'Limpar', tr: 'Temizle' }),
        tailles: tx(lang, { fr: 'Tailles demandees', ar: 'المقاسات المطلوبة', en: 'Sizes in demand', es: 'Tallas demandadas', pt: 'Tamanhos pedidos', tr: 'Talep edilen bedenler' }),
        couleurs: tx(lang, { fr: 'Couleurs demandees', ar: 'الألوان المطلوبة', en: 'Colours in demand', es: 'Colores demandados', pt: 'Cores pedidas', tr: 'Talep edilen renkler' }),
        qualite: tx(lang, { fr: 'Qualite atelier', ar: 'جودة الورشة', en: 'Workshop quality', es: 'Calidad del taller', pt: 'Qualidade da oficina', tr: 'Atolye kalitesi' }),
        tauxDefaut: tx(lang, { fr: 'Taux de defaut', ar: 'نسبة العيوب', en: 'Defect rate', es: 'Tasa de defectos', pt: 'Taxa de defeitos', tr: 'Hata orani' }),
        canalFort: tx(lang, { fr: 'Part du canal principal', ar: 'حصّة القناة الأولى', en: 'Main channel share', es: 'Cuota del canal principal', pt: 'Quota do canal principal', tr: 'Ana kanal payi' }),
        tendance: tx(lang, { fr: 'Tendance', ar: 'المنحنى', en: 'Trend', es: 'Tendencia', pt: 'Tendencia', tr: 'Egilim' }),
        joursAvecVente: tx(lang, { fr: 'jours avec vente', ar: 'أيام فيها بيع', en: 'days with sales', es: 'dias con venta', pt: 'dias com venda', tr: 'satisli gun' }),
        meilleurJour: tx(lang, { fr: 'Meilleur jour', ar: 'أحسن نهار', en: 'Best day', es: 'Mejor dia', pt: 'Melhor dia', tr: 'En iyi gun' }),
        rythme: tx(lang, { fr: 'Rythme de la semaine', ar: 'إيقاع الأسبوع', en: 'Weekly rhythm', es: 'Ritmo semanal', pt: 'Ritmo da semana', tr: 'Haftalik ritim' }),
        joursSemaine: (lang === 'ar' ? ['إث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'] : ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']),
        concentration: tx(lang, { fr: 'Top 3 =', ar: 'أوّل 3 =', en: 'Top 3 =', es: 'Top 3 =', pt: 'Top 3 =', tr: 'Ilk 3 =' }),
        actifs: tx(lang, { fr: 'actifs', ar: 'نشيطين', en: 'active', es: 'activos', pt: 'ativos', tr: 'aktif' }),
        filtres: tx(lang, { fr: 'Filtres', ar: 'فلاتر', en: 'Filters', es: 'Filtros', pt: 'Filtros', tr: 'Filtreler' }),
        actualiser: tx(lang, { fr: 'Actualiser', ar: 'تحديث', en: 'Refresh', es: 'Actualizar', pt: 'Atualizar', tr: 'Yenile' }),
        nonRenseigne: tx(lang, { fr: 'Non renseigne', ar: 'غير محدّد', en: 'Not recorded', es: 'Sin indicar', pt: 'Nao indicado', tr: 'Belirtilmemis' }),
        piecesCourt: tx(lang, { fr: 'pcs', ar: 'قطعة', en: 'pcs', es: 'uds', pt: 'pcs', tr: 'adet' }),
        ventesCourt: tx(lang, { fr: 'ventes', ar: 'بيعة', en: 'sales', es: 'ventas', pt: 'vendas', tr: 'satis' }),
        parJourCourt: tx(lang, { fr: '/jour', ar: '/يوم', en: '/day', es: '/dia', pt: '/dia', tr: '/gun' }),
        aucunDefaut: tx(lang, { fr: 'Aucun defaut releve.', ar: 'ما تسجّل حتى عيب.', en: 'No defect recorded.', es: 'Ningun defecto.', pt: 'Nenhum defeito.', tr: 'Hata kaydi yok.' }),
        doit: tx(lang, { fr: 'doit', ar: 'عليه', en: 'owes', es: 'debe', pt: 'deve', tr: 'borclu' }),
        moisNoms: (lang === "ar"
            ? ["يناير","فبراير","مارس","أبريل","ماي","يونيو","يوليوز","غشت","شتنبر","أكتوبر","نونبر","دجنبر"]
            : ["Janvier","Fevrier","Mars","Avril","Mai","Juin","Juillet","Aout","Septembre","Octobre","Novembre","Decembre"]),
        periodePrecedente: tx(lang, { fr: 'Periode precedente', ar: 'المدّة السابقة', en: 'Previous period', es: 'Periodo anterior', pt: 'Periodo anterior', tr: 'Onceki donem' }),
        aujourdhuiCourt: tx(lang, { fr: "Auj.", ar: "اليوم", en: "Today", es: "Hoy", pt: "Hoje", tr: "Bugun" }),
        aujourdhui: tx(lang, { fr: "Aujourd hui", ar: "اليوم", en: "Today", es: "Hoy", pt: "Hoje", tr: "Bugun" }),
        choisir: tx(lang, { fr: 'jj/mm/aaaa', ar: 'يوم/شهر/عام', en: 'dd/mm/yyyy', es: 'dd/mm/aaaa', pt: 'dd/mm/aaaa', tr: 'gg/aa/yyyy' }),
        retard: tx(lang, { fr: 'facture(s) en retard', ar: 'فاتورة متأخّرة', en: 'overdue invoice(s)', es: 'factura(s) vencida(s)', pt: 'fatura(s) vencida(s)', tr: 'gecikmis fatura' }),
    };

    const agendaLabels = { mois: T.moisNoms, jours: T.joursSemaine, aujourdhui: T.aujourdhui, effacer: T.effacer };

    // La courbe doit couvrir toute la periode, pas seulement les jours
    // ou il y a eu une vente : 4 barres sur 30 jours ne sont pas une
    // tendance, ce sont 4 blocs. On remplit les trous a zero.
    const serieComplete = useMemo(() => {
        type Pt = { jour: string; ca: number; pieces: number; tickets: number; vide: boolean };
        if (!data) return [] as Pt[];
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        const debut = du || data.depuis || data.serie[0]?.jour;
        const fin = au || iso(new Date());
        if (!debut) return [] as Pt[];
        const parJour = new Map(data.serie.map(x => [x.jour, x]));
        const out: Pt[] = [];
        const curseur = new Date(debut + 'T00:00:00');
        const stop = new Date(fin + 'T00:00:00');
        let garde = 0;
        while (curseur <= stop && garde++ < 400) {
            const k = iso(curseur);
            const v = parJour.get(k);
            out.push({ jour: k, ca: v?.ca || 0, pieces: v?.pieces || 0, tickets: v?.tickets || 0, vide: !v });
            curseur.setDate(curseur.getDate() + 1);
        }
        return out.length ? out : data.serie.map(x => ({ ...x, vide: false }));
    }, [data, du, au]);

    const modelesFiltres = useMemo(() => {
        if (!data) return [];
        const q = recherche.trim().toLowerCase();
        return (data.modeles || []).filter(m => {
            if (filtreModele !== 'TOUS' && m.statut !== filtreModele) return false;
            if (!q) return true;
            return `${m.nom} ${m.reference || ''}`.toLowerCase().includes(q);
        });
    }, [data, recherche, filtreModele]);

    const clientsFiltres = useMemo(() => {
        if (!data) return [];
        const q = recherche.trim().toLowerCase();
        if (!q) return (data.clients || []).slice(0, 25);
        return (data.clients || []).filter(c => `${c.nom} ${c.tel || ''} ${c.ville || ''}`.toLowerCase().includes(q)).slice(0, 25);
    }, [data, recherche]);

    /* ── Vocabulaire visuel ───────────────────────────────────────────────
     * Une seule carte, un seul en-tete, une seule facon d'aligner un chiffre.
     * Un tableau de bord ou chaque bloc a son style se lit comme trois
     * documents differents poses l'un sur l'autre.
     */
    const Carte: React.FC<{ titre: string; droite?: React.ReactNode; children: React.ReactNode; className?: string }> =
        ({ titre, droite, children, className = '' }) => (
            <section className={`border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface overflow-hidden ${className}`}>
                <header className="h-9 px-3.5 flex items-center justify-between gap-2 border-b border-slate-100 dark:border-dk-border">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted truncate">{titre}</span>
                    {droite}
                </header>
                {children}
            </section>
        );

    /** « NON_PRECISE » vient des ventes anterieures au suivi du canal : on le
     *  nomme au lieu de laisser un mot de base de donnees a l'ecran. */
    const libelle = (v: string) => (v === 'NON_PRECISE' || v === '—' ? T.nonRenseigne : v);

    /** Une variation par rapport à la même durée, juste avant. Sans elle,
     *  « 145 000 » ne dit pas si l'atelier monte ou retombe. Une période
     *  précédente vide ne produit AUCUN pourcentage : « +∞ % » n'informe
     *  personne, et un premier mois n'est pas une progression. */
    const Delta = ({ actuel, avant }: { actuel: number; avant: number }) => {
        if (!avant) return null;
        const pct = ((actuel - avant) / avant) * 100;
        const monte = pct >= 0;
        return (
            <span
                title={`${T.periodePrecedente} : ${nf(avant)}`}
                className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-black tabular-nums ${monte ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
            >
                {monte ? <ArrowUpRight className="w-3 h-3 shrink-0" /> : <ArrowDownRight className="w-3 h-3 shrink-0" />}
                {/* Deux decimales sur un ecart de 97 % ne changent aucune
                    decision : elles cassent la ligne en deux, c'est tout. */}
                {Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : nf(Math.abs(pct))}&nbsp;%
            </span>
        );
    };

    const Tuile = ({ titre, valeur, icone, alerte = false, delta, onOuvrir }: { titre: string; valeur: string; icone: React.ReactNode; alerte?: boolean; delta?: React.ReactNode; onOuvrir?: () => void }) => (
        <div
            onClick={onOuvrir}
            role={onOuvrir ? 'button' : undefined}
            tabIndex={onOuvrir ? 0 : undefined}
            onKeyDown={onOuvrir ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir(); } } : undefined}
            className={`border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface px-3.5 py-3 ${onOuvrir ? 'cursor-pointer transition-colors hover:border-slate-400 dark:hover:border-dk-muted' : ''}`}
        >
            <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted">
                {icone}<span className="truncate">{titre}</span>
            </span>
            {/* Le montant garde sa ligne : mis cote a cote, « 145 794,47 MAD »
                et son ecart se coupaient tous les deux en deux morceaux. */}
            <p className={`mt-1 text-[17px] font-black tabular-nums leading-tight whitespace-nowrap overflow-hidden text-ellipsis ${alerte ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-dk-text'}`}>
                {valeur}
            </p>
            {delta && <p className="mt-0.5 leading-none">{delta}</p>}
        </div>
    );

    /** Une repartition : le libelle, la part, et une barre fine. La part en
     *  POURCENTAGE d'abord — « 142 297 MAD » ne dit pas si c'est beaucoup.
     *
     *  `mesure` dit sur QUOI la part se calcule. L'argent pour les canaux (on
     *  veut savoir d'ou vient le chiffre), les PIECES pour les tailles et les
     *  couleurs : une taille sortie 30 fois a prix nul est la plus demandee,
     *  pas la moins — la mesurer en argent la faisait afficher « 0 % ». */
    const Repartition = ({ titre, lignes, unite }: { titre: string; lignes: Array<{ cle: string; ca: number; valeur?: number; detail: string }>; unite?: string }) => {
        const valeurDe = (l: { ca: number; valeur?: number }) => (l.valeur == null ? l.ca : l.valeur);
        const total = lignes.reduce((a, l) => a + valeurDe(l), 0);
        return (
            <Carte titre={titre}>
                <div className="p-3.5 space-y-2.5">
                    {lignes.length === 0 && <p className="text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</p>}
                    {lignes.map(l => {
                        const part = total > 0 ? (valeurDe(l) / total) * 100 : 0;
                        const flou = l.cle === 'NON_PRECISE' || l.cle === '—';
                        return (
                            <div key={l.cle}>
                                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                                    <span className={`font-bold truncate ${flou ? 'text-slate-400 dark:text-dk-muted italic' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                                        {libelle(l.cle)}
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                        <span className="font-black text-slate-800 dark:text-dk-text">{nf(part)} %</span>
                                        <span className="ml-1.5 text-[10px] text-slate-400 dark:text-dk-muted">
                                            {nf(valeurDe(l))}{unite ? ` ${unite}` : ''}
                                        </span>
                                    </span>
                                </div>
                                <div className="h-1 rounded-full bg-slate-100 dark:bg-dk-elevated mt-1 overflow-hidden">
                                    <div className={`h-full rounded-full ${flou ? 'bg-slate-300 dark:bg-dk-border' : 'bg-slate-800 dark:bg-dk-accent'}`} style={{ width: `${Math.max(1.5, part)}%` }} />
                                </div>
                                <span className="block mt-0.5 text-[10px] text-slate-400 dark:text-dk-muted">{l.detail}</span>
                            </div>
                        );
                    })}
                </div>
            </Carte>
        );
    };

    const filtresActifs = [du, au, canal, segment, clientId].filter(Boolean).length;

    return (
        <div className="space-y-3">
            {/* Barre unique : la periode a gauche, le reste derriere un bouton.
                Huit contrôles alignes de front donnent une barre qu'on ne lit
                plus — et un filtre qu'on ne lit pas est un chiffre mal
                interprete. */}
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[13px] font-black uppercase tracking-[0.08em] text-slate-900 dark:text-dk-text mr-1">{T.titre}</h2>

                <div className="bg-slate-100/70 dark:bg-dk-elevated rounded-lg p-0.5 inline-flex">
                    {/* Le serveur ne descend pas sous 7 jours : aujourd'hui passe
                        donc par les bornes de date, pas par la fenetre. */}
                    <button
                        onClick={() => { setDu(aujourdhui()); setAu(aujourdhui()); }}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors ${du === aujourdhui() && au === aujourdhui()
                            ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm'
                            : 'text-slate-500 dark:text-dk-muted hover:text-slate-700'}`}
                    >
                        {T.aujourdhuiCourt}
                    </button>
                    {[7, 30, 90].map(n => (
                        <button
                            key={n}
                            onClick={() => { setDu(''); setAu(''); setJours(n); }}
                            className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors ${jours === n && !du && !au
                                ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm'
                                : 'text-slate-500 dark:text-dk-muted hover:text-slate-700'}`}
                        >
                            {n}{T.jours.slice(0, 1)}
                        </button>
                    ))}
                </div>

                <button
                    onClick={() => setFiltresOuverts(v => !v)}
                    className={`h-8 px-2.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1.5 transition-colors ${filtresOuverts || filtresActifs
                        ? 'bg-slate-900 dark:bg-dk-accent text-white border-transparent'
                        : 'bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border'}`}
                >
                    <Filter className="w-3.5 h-3.5" />
                    {T.filtres}
                    {filtresActifs > 0 && <span className="px-1.5 rounded-full bg-white/20 tabular-nums">{filtresActifs}</span>}
                </button>

                <div className="relative order-last sm:order-none w-full sm:w-auto sm:flex-1 sm:min-w-[160px] sm:max-w-[260px]">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={recherche}
                        onChange={e => setRecherche(e.target.value)}
                        placeholder={T.chercher}
                        className="w-full h-8 pl-8 pr-3 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[12px] text-slate-700 dark:text-dk-text placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-dk-border"
                    />
                </div>

                <button
                    onClick={() => charger(jours)}
                    title={T.actualiser}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-400 hover:text-slate-900 dark:hover:text-dk-text"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${chargement ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {filtresOuverts && (
                <div className="border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface p-3 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
                    {/* Choisir DU tout seul ne veut rien dire : la periode se
                        ferme d'elle-meme a aujourd'hui, et AU ne peut jamais
                        remonter avant DU. */}
                    <ChampDate
                        label={T.du}
                        value={du}
                        vide={T.choisir}
                        labels={agendaLabels}
                        max={au || aujourdhui()}
                        onChange={v => { setDu(v); if (v && (!au || au < v)) setAu(aujourdhui() >= v ? aujourdhui() : v); }}
                    />
                    <ChampDate
                        label={T.au}
                        value={au}
                        vide={T.choisir}
                        labels={agendaLabels}
                        min={du || undefined}
                        max={aujourdhui()}
                        onChange={v => { setAu(v); if (v && du && du > v) setDu(v); }}
                    />
                    <ChampListe
                        label={T.parCanal}
                        value={canal}
                        onChange={setCanal}
                        options={[{ valeur: '', texte: T.tousCanaux }, { valeur: 'MAGASIN', texte: 'MAGASIN' }, { valeur: 'ONLINE', texte: 'ONLINE' }, { valeur: 'ATELIER', texte: 'ATELIER' }]}
                    />
                    <ChampListe
                        label={T.parSegment}
                        value={segment}
                        onChange={setSegment}
                        options={[{ valeur: '', texte: T.tousSegments }, { valeur: 'BOUTIQUE', texte: 'BOUTIQUE' }, { valeur: 'DETAIL', texte: 'DETAIL' }, { valeur: 'GROS', texte: 'GROS' }]}
                    />
                    <ChampListe
                        label={T.clients}
                        value={clientId}
                        onChange={setClientId}
                        largeur="sm:min-w-[190px] sm:max-w-[220px]"
                        classe="col-span-2 sm:col-span-1"
                        placeholderRecherche={T.chercher}
                        rechercheToujours
                        options={[
                            { valeur: '', texte: T.tousClients },
                            // Trois clients portent le meme prenom : ce qui les
                            // separe, c'est le telephone et ce qu'ils doivent.
                            ...[...annuaire]
                                .sort((a, b) => b.encours - a.encours || b.ca - a.ca)
                                .map(c => ({
                                    valeur: c.id,
                                    texte: c.nom,
                                    sous: [c.tel, c.ville].filter(Boolean).join(' · ') || undefined,
                                    droite: c.encours > 0 ? `${nf(c.encours)} ${currency}` : (c.ca > 0 ? `${nf(c.ca)} ${currency}` : undefined),
                                    alerte: c.encours > 0,
                                    recherche: c.type || undefined,
                                })),
                        ]}
                    />
                    {filtresActifs > 0 && (
                        <button
                            onClick={() => { setDu(''); setAu(''); setCanal(''); setSegment(''); setClientId(''); }}
                            className="col-span-2 sm:col-span-1 h-9 sm:h-8 px-3 rounded-lg text-[11px] font-bold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50"
                        >
                            {T.effacer}
                        </button>
                    )}
                </div>
            )}

            {IS_STATIC && (
                <p className="text-[12px] text-slate-500 dark:text-dk-muted flex items-start gap-1.5 border border-slate-200 dark:border-dk-border rounded-xl p-3 bg-white dark:bg-dk-surface">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-amber-500" />
                    <span>{T.statique}</span>
                </p>
            )}

            {erreur && (
                <p className="text-[12px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 border border-rose-200 dark:border-rose-800/50 rounded-xl p-3 bg-rose-50/50 dark:bg-rose-950/20">
                    <AlertTriangle className="w-4 h-4" /> {erreur}
                </p>
            )}

            {data && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                        <Tuile titre={T.ca} valeur={`${nf(data.kpis.ca)} ${currency}`} icone={<TrendingUp className="w-3.5 h-3.5" />}
                            delta={<Delta actuel={data.kpis.ca} avant={data.precedent.ca} />} />
                        <Tuile titre={T.pieces} valeur={nf(data.kpis.pieces)} icone={<Boxes className="w-3.5 h-3.5" />}
                            delta={<Delta actuel={data.kpis.pieces} avant={data.precedent.pieces} />} />
                        <Tuile titre={T.tickets} valeur={nf(data.kpis.tickets)} icone={<Receipt className="w-3.5 h-3.5" />}
                            delta={<Delta actuel={data.kpis.tickets} avant={data.precedent.tickets} />} />
                        <Tuile titre={T.panier} valeur={`${nf(data.kpis.panierMoyen)} ${currency}`} icone={<Wallet className="w-3.5 h-3.5" />} />
                        <Tuile titre={T.encours} valeur={`${nf(data.kpis.encoursTotal)} ${currency}`} icone={<Users className="w-3.5 h-3.5" />} alerte={data.kpis.encoursTotal > 0}
                            onOuvrir={() => setDetail('encours')} />
                    </div>

                    {/* La courbe AVANT tout le reste : un total dit combien, la
                        courbe dit si ca monte, si ca retombe, et quel jour. */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                        <Carte
                            titre={T.tendance}
                            className="lg:col-span-2"
                            droite={
                                <span className="text-[10px] text-slate-400 dark:text-dk-muted tabular-nums">
                                    {data.serie.length} {T.joursAvecVente}
                                </span>
                            }
                        >
                            <div className="p-3.5">
                                {serieComplete.length === 0 ? (
                                    <p className="text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</p>
                                ) : (
                                    <>
                                        <div className="flex items-end gap-[2px] h-24">
                                            {(() => {
                                                const max = Math.max(...serieComplete.map(x => x.ca), 1);
                                                return serieComplete.map(p => {
                                                    const h = p.vide ? 2 : Math.max(4, (p.ca / max) * 100);
                                                    return (
                                                        <div
                                                            key={p.jour}
                                                            title={p.vide ? `${p.jour} · —` : `${p.jour} · ${nf(p.ca)} ${currency} · ${nf(p.pieces)} ${T.piecesCourt}`}
                                                            className={`flex-1 min-w-[2px] max-w-[22px] rounded-t transition-colors ${p.vide
                                                                ? 'bg-slate-100 dark:bg-dk-elevated'
                                                                : 'bg-slate-800 dark:bg-dk-accent hover:bg-slate-600'}`}
                                                            style={{ height: `${h}%` }}
                                                        />
                                                    );
                                                });
                                            })()}
                                        </div>
                                        <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400 dark:text-dk-muted tabular-nums">
                                            <span>{serieComplete[0]?.jour}</span>
                                            <span>{T.meilleurJour} : {(() => {
                                                const best = [...data.serie].sort((a, b) => b.ca - a.ca)[0];
                                                return best ? `${best.jour} · ${nf(best.ca)} ${currency}` : '—';
                                            })()}</span>
                                            <span>{serieComplete[serieComplete.length - 1]?.jour}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </Carte>

                        {/* Le rythme de la semaine : il change des horaires, pas
                            seulement un graphique. */}
                        <Carte titre={T.rythme}>
                            <div className="p-3.5">
                                <div className="flex items-end justify-between gap-1.5 h-24">
                                    {[1, 2, 3, 4, 5, 6, 0].map(n => {
                                        const j = data.parJourSemaine.find(x => x.jour === n);
                                        const max = Math.max(...data.parJourSemaine.map(x => x.ca), 1);
                                        const h = j ? Math.max(3, (j.ca / max) * 100) : 2;
                                        return (
                                            <div key={n} className="flex-1 flex flex-col items-center gap-1 justify-end h-full">
                                                <div
                                                    title={j ? `${nf(j.ca)} ${currency}` : '—'}
                                                    className={`w-full max-w-[26px] rounded-t ${j ? 'bg-slate-800 dark:bg-dk-accent' : 'bg-slate-100 dark:bg-dk-elevated'}`}
                                                    style={{ height: `${h}%` }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex items-end justify-between gap-1.5 mt-1.5">
                                    {T.joursSemaine.map(lbl => (
                                        <span key={lbl} className="flex-1 text-center text-[9px] font-bold text-slate-400 dark:text-dk-muted">{lbl}</span>
                                    ))}
                                </div>
                            </div>
                        </Carte>
                    </div>

                    {/* Les modeles d'abord : c'est la seule zone qui declenche une
                        decision de production. Le reste explique, elle decide. */}
                    <Carte
                        titre={T.modeles}
                        droite={
                            <div className="flex gap-1 flex-wrap">
                                {(['TOUS', 'TOP', 'LENT', 'MORT', 'NEUF'] as const).map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setFiltreModele(f)}
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${filtreModele === f
                                            ? 'bg-slate-900 dark:bg-dk-accent text-white'
                                            : 'text-slate-400 dark:text-dk-muted hover:text-slate-700'}`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        <div className="divide-y divide-slate-100 dark:divide-dk-border">
                            {modelesFiltres.length === 0 && (
                                <p className="px-4 py-6 text-center text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</p>
                            )}
                            {modelesFiltres.slice(0, 40).map(m => (
                                <div key={m.modelId} className="px-3.5 py-2.5 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-dk-elevated/40">
                                    {m.image
                                        ? <img src={m.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-none border border-slate-200 dark:border-dk-border" />
                                        : <span className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-dk-elevated flex-none flex items-center justify-center text-[9px] font-black text-slate-300">{m.nom.slice(0, 2).toUpperCase()}</span>}

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-[12px] font-bold text-slate-800 dark:text-dk-text truncate">{m.nom}</span>
                                            <span className={`px-1.5 py-px rounded-full text-[9px] font-black border shrink-0 ${TEINTE_STATUT[m.statut]}`}>{m.statut}</span>
                                        </div>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted truncate">
                                            {[m.reference, m.ageJours ? `${m.ageJours} ${T.jours}` : null, `${nf(m.parJour)} ${T.parJourCourt}`,
                                              m.canalFort ? `${libelle(m.canalFort)} ${nf(m.partCanalFort || 0)} %` : null].filter(Boolean).join(' · ')}
                                        </span>
                                        {/* L'ecoulement se LIT, il ne se calcule pas de tete. */}
                                        <div className="h-1 rounded-full bg-slate-100 dark:bg-dk-elevated mt-1.5 overflow-hidden max-w-[220px]">
                                            <div
                                                className={`h-full rounded-full ${m.ecoule >= 60 ? 'bg-emerald-500' : m.ecoule >= 20 ? 'bg-slate-800 dark:bg-dk-accent' : 'bg-amber-500'}`}
                                                style={{ width: `${Math.min(100, Math.max(1.5, m.ecoule))}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="hidden sm:block text-right shrink-0 w-[74px]">
                                        <span className="block text-[12px] font-black tabular-nums text-slate-800 dark:text-dk-text">{nf(m.ecoule)} %</span>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted tabular-nums">{nf(m.vendu)}/{nf(m.produit)}</span>
                                    </div>
                                    <div className="hidden md:block text-right shrink-0 w-[64px]">
                                        <span className="block text-[12px] font-bold tabular-nums text-slate-700 dark:text-dk-text-soft">{nf(m.stock)}</span>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted">{T.stock}</span>
                                    </div>
                                    <div className="hidden md:block text-right shrink-0 w-[78px]">
                                        {m.joursAvantRupture == null
                                            ? <span className="text-[12px] text-slate-300 dark:text-dk-muted">—</span>
                                            : <span className={`block text-[12px] font-black tabular-nums ${m.joursAvantRupture <= 7 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                                                {m.joursAvantRupture} {T.jours}
                                              </span>}
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted">{T.rupture}</span>
                                    </div>
                                    <div className="text-right shrink-0 w-[96px]">
                                        <span className="block text-[12px] font-black tabular-nums text-slate-900 dark:text-dk-text">{nf(m.caPeriode)}</span>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted">{currency}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Carte>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                        <Repartition titre={T.parCanal} lignes={data.parCanal.map(c => ({ cle: c.canal, ca: c.ca, detail: `${nf(c.pieces)} ${T.piecesCourt} · ${nf(c.tickets)} ${T.ventesCourt}` }))} />
                        <Repartition titre={T.parSegment} lignes={data.parSegment.map(s => ({ cle: s.segment, ca: s.ca, detail: `${nf(s.pieces)} ${T.piecesCourt}` }))} />
                        <Repartition titre={T.parPaiement} lignes={data.parPaiement.map(p => ({ cle: p.mode, ca: p.ca, detail: `${nf(p.tickets)} ${T.ventesCourt}` }))} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                        <Repartition
                            titre={T.tailles}
                            unite={T.piecesCourt}
                            lignes={(data.tailles || []).slice(0, 8).map(t => ({ cle: t.taille, ca: t.ca, valeur: t.pieces, detail: `${nf(t.ca)} ${currency}` }))}
                        />
                        <Repartition
                            titre={T.couleurs}
                            unite={T.piecesCourt}
                            lignes={(data.couleurs || []).slice(0, 8).map(c => ({ cle: c.couleur, ca: c.ca, valeur: c.pieces, detail: `${nf(c.ca)} ${currency}` }))}
                        />
                        <Carte
                            titre={T.qualite}
                            droite={
                                <span className={`text-[12px] font-black tabular-nums ${(data.qualite?.tauxDefaut || 0) > 5 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    {nf(data.qualite?.tauxDefaut || 0)} %
                                </span>
                            }
                        >
                            <div className="p-3.5 space-y-2">
                                {(data.qualite?.parModele || []).length === 0 && (
                                    <p className="text-[11px] text-slate-400 dark:text-dk-muted">{T.aucunDefaut}</p>
                                )}
                                {(data.qualite?.parModele || []).slice(0, 6).map(d => (
                                    <div key={d.modelId} className="flex items-baseline justify-between gap-2 text-[11px]">
                                        <span className="font-bold text-slate-700 dark:text-dk-text-soft truncate">{d.nom}</span>
                                        <span className="shrink-0 tabular-nums">
                                            <span className="font-black text-rose-600 dark:text-rose-400">{nf(d.taux)} %</span>
                                            <span className="ml-1.5 text-[10px] text-slate-400 dark:text-dk-muted">{nf(d.defauts)}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Carte>
                    </div>

                    {/* Les clients : d'abord ceux qui doivent. */}
                    <Carte
                        titre={T.clients}
                        droite={
                            <span className="text-[10px] tabular-nums text-slate-400 dark:text-dk-muted">
                                {T.concentration} <b className={data.concentration.partTop3 > 60 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-dk-text-soft'}>
                                    {nf(data.concentration.partTop3)} %
                                </b> · {data.concentration.clientsActifs} {T.actifs}
                            </span>
                        }
                    >
                        <div className="divide-y divide-slate-100 dark:divide-dk-border">
                            {clientsFiltres.length === 0 && (
                                <p className="px-4 py-6 text-center text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</p>
                            )}
                            {clientsFiltres.map(c => (
                                <div key={c.id} className="px-3.5 py-2.5 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-dk-elevated/40">
                                    <span className={`px-1.5 py-px rounded-full text-[9px] font-black border shrink-0 ${TEINTE_CLIENT[c.statut]}`}>{c.statut}</span>
                                    <div className="min-w-0 flex-1">
                                        <span className="block text-[12px] font-bold text-slate-800 dark:text-dk-text truncate">{c.nom}</span>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted truncate">
                                            {[c.type, c.ville, c.tel].filter(Boolean).join(' · ')}
                                            {c.facturesEnRetard > 0 ? ` · ${c.facturesEnRetard} ${T.retard}` : ''}
                                        </span>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className="block text-[12px] font-black tabular-nums text-slate-900 dark:text-dk-text">{nf(c.ca)} {currency}</span>
                                        {c.encours > 0 && (
                                            <span className="block text-[10px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
                                                {T.doit} {nf(c.encours)} {currency}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Carte>
                </>
            )}

            {!data && !chargement && !erreur && !IS_STATIC && (
                <p className="text-[12px] text-slate-400 dark:text-dk-muted flex items-center gap-1.5">
                    <PackageX className="w-4 h-4" /> {T.rien}
                </p>
            )}

            {/* En refermant, on recharge : un encaissement fait dans le detail
                change l'encours affiche sur la tuile. */}
            {detail === 'encours' && (
                <EncoursDetail devise={currency} onFermer={() => { setDetail(null); void charger(jours); }} />
            )}
        </div>
    );
}
