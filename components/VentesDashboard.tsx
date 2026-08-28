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
    TrendingUp, PackageX, AlertTriangle, RefreshCw, Users, Wallet, Boxes, Search,
} from 'lucide-react';
import { tx } from '../lib/i18n';

interface Props {
    lang: string;
    currency?: string;
}

type Modele = {
    modelId: string; nom: string; reference: string | null;
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
    const [data, setData] = useState<Donnees | null>(null);
    const [chargement, setChargement] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);
    const [recherche, setRecherche] = useState('');
    const [filtreModele, setFiltreModele] = useState<'TOUS' | Modele['statut']>('TOUS');

    const charger = useCallback(async (n: number) => {
        setChargement(true);
        setErreur(null);
        try {
            const res = await fetch(`/api/ventes/dashboard?jours=${n}`, { credentials: 'include' });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
            setData(body as Donnees);
        } catch (e: any) {
            setData(null);
            setErreur(e?.message || String(e));
        } finally {
            setChargement(false);
        }
    }, []);

    useEffect(() => { void charger(jours); }, [jours, charger]);

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
        retard: tx(lang, { fr: 'facture(s) en retard', ar: 'فاتورة متأخّرة', en: 'overdue invoice(s)', es: 'factura(s) vencida(s)', pt: 'fatura(s) vencida(s)', tr: 'gecikmis fatura' }),
    };

    const modelesFiltres = useMemo(() => {
        if (!data) return [];
        const q = recherche.trim().toLowerCase();
        return data.modeles.filter(m => {
            if (filtreModele !== 'TOUS' && m.statut !== filtreModele) return false;
            if (!q) return true;
            return `${m.nom} ${m.reference || ''}`.toLowerCase().includes(q);
        });
    }, [data, recherche, filtreModele]);

    const clientsFiltres = useMemo(() => {
        if (!data) return [];
        const q = recherche.trim().toLowerCase();
        if (!q) return data.clients.slice(0, 25);
        return data.clients.filter(c => `${c.nom} ${c.tel || ''} ${c.ville || ''}`.toLowerCase().includes(q)).slice(0, 25);
    }, [data, recherche]);

    const carte = (titre: string, valeur: string, icone: React.ReactNode, teinte = 'text-slate-900 dark:text-dk-text') => (
        <div className="border border-slate-200 dark:border-dk-border rounded-xl p-4 bg-white dark:bg-dk-surface">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-dk-muted">
                {icone} {titre}
            </span>
            <p className={`text-lg font-black tabular-nums mt-1 ${teinte}`}>{valeur}</p>
        </div>
    );

    const repartition = (titre: string, lignes: Array<{ cle: string; ca: number; detail: string }>) => {
        const total = lignes.reduce((a, l) => a + l.ca, 0) || 1;
        return (
            <div className="border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-dk-border">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-dk-muted">{titre}</span>
                </div>
                <div className="p-3 space-y-2">
                    {lignes.length === 0 && <p className="text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</p>}
                    {lignes.map(l => (
                        <div key={l.cle}>
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-700 dark:text-dk-text-soft truncate">{l.cle}</span>
                                <span className="tabular-nums font-black text-slate-800 dark:text-dk-text shrink-0">{nf(l.ca)} {currency}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-dk-elevated mt-1 overflow-hidden">
                                <div className="h-full bg-slate-800 dark:bg-dk-accent" style={{ width: `${Math.max(2, (l.ca / total) * 100)}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400 dark:text-dk-muted">{l.detail}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-black text-slate-900 dark:text-dk-text">{T.titre}</h2>
                <div className="bg-slate-100/70 dark:bg-dk-elevated rounded-lg p-0.5 inline-flex">
                    {[7, 30, 90].map(n => (
                        <button
                            key={n}
                            onClick={() => setJours(n)}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors ${jours === n
                                ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm'
                                : 'text-slate-500 dark:text-dk-muted'}`}
                        >
                            {n} {T.jours}
                        </button>
                    ))}
                </div>
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={recherche}
                        onChange={e => setRecherche(e.target.value)}
                        placeholder={T.chercher}
                        className="w-full h-8 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-[12px] text-slate-700 dark:text-dk-text placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-300/40"
                    />
                </div>
                <button
                    onClick={() => charger(jours)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-elevated"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${chargement ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {erreur && (
                <p className="text-[12px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> {erreur}
                </p>
            )}

            {data && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
                        {carte(T.ca, `${nf(data.kpis.ca)} ${currency}`, <TrendingUp className="w-3.5 h-3.5" />)}
                        {carte(T.pieces, nf(data.kpis.pieces), <Boxes className="w-3.5 h-3.5" />)}
                        {carte(T.tickets, nf(data.kpis.tickets), <Wallet className="w-3.5 h-3.5" />)}
                        {carte(T.panier, `${nf(data.kpis.panierMoyen)} ${currency}`, <Wallet className="w-3.5 h-3.5" />)}
                        {carte(T.encours, `${nf(data.kpis.encoursTotal)} ${currency}`, <Users className="w-3.5 h-3.5" />,
                            data.kpis.encoursTotal > 0 ? 'text-amber-600 dark:text-amber-400' : undefined)}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                        {repartition(T.parCanal, data.parCanal.map(c => ({ cle: c.canal, ca: c.ca, detail: `${nf(c.pieces)} ${T.pieces.toLowerCase()} · ${nf(c.tickets)} ${T.tickets.toLowerCase()}` })))}
                        {repartition(T.parSegment, data.parSegment.map(s => ({ cle: s.segment, ca: s.ca, detail: `${nf(s.pieces)} ${T.pieces.toLowerCase()}` })))}
                        {repartition(T.parPaiement, data.parPaiement.map(p => ({ cle: p.mode, ca: p.ca, detail: `${nf(p.tickets)} ${T.tickets.toLowerCase()}` })))}
                    </div>

                    {/* Les modeles : ce qui part vite se relance, ce qui dort se solde. */}
                    <div className="border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-dk-border flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-dk-muted">{T.modeles}</span>
                            <div className="flex gap-1 flex-wrap">
                                {(['TOUS', 'TOP', 'LENT', 'MORT', 'NEUF'] as const).map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setFiltreModele(f)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${filtreModele === f
                                            ? 'bg-slate-900 dark:bg-dk-accent text-white border-transparent'
                                            : 'bg-slate-50 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border'}`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12px]">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-dk-muted">
                                        <th className="text-left font-bold px-4 py-2">{T.modeles}</th>
                                        <th className="text-right font-bold px-3 py-2">{T.ecoule}</th>
                                        <th className="text-right font-bold px-3 py-2">{T.stock}</th>
                                        <th className="text-right font-bold px-3 py-2">{T.rupture}</th>
                                        <th className="text-right font-bold px-4 py-2">{T.ca}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {modelesFiltres.length === 0 && (
                                        <tr><td colSpan={5} className="px-4 py-6 text-center text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</td></tr>
                                    )}
                                    {modelesFiltres.slice(0, 40).map(m => (
                                        <tr key={m.modelId} className="hover:bg-slate-50/60 dark:hover:bg-dk-elevated/50">
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black border ${TEINTE_STATUT[m.statut]}`}>{m.statut}</span>
                                                    <span className="min-w-0">
                                                        <span className="block font-bold text-slate-800 dark:text-dk-text truncate">{m.nom}</span>
                                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted truncate">
                                                            {[m.reference, m.ageJours ? `${m.ageJours} ${T.jours}` : null, `${nf(m.parJour)}/${T.jours.slice(0, 1)}`].filter(Boolean).join(' · ')}
                                                        </span>
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                <span className="font-black text-slate-800 dark:text-dk-text">{nf(m.ecoule)} %</span>
                                                <span className="block text-[10px] text-slate-400 dark:text-dk-muted">{nf(m.vendu)}/{nf(m.produit)}</span>
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-700 dark:text-dk-text-soft">{nf(m.stock)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {m.joursAvantRupture == null
                                                    ? <span className="text-slate-300 dark:text-dk-muted">—</span>
                                                    : <span className={m.joursAvantRupture <= 7 ? 'font-black text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-dk-text-soft'}>
                                                        {m.joursAvantRupture} {T.jours}
                                                      </span>}
                                            </td>
                                            <td className="px-4 py-2 text-right tabular-nums font-black text-slate-800 dark:text-dk-text">{nf(m.caPeriode)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Les clients : d'abord ceux qui doivent. */}
                    <div className="border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-dk-border flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-dk-muted">{T.clients}</span>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-dk-border">
                            {clientsFiltres.length === 0 && (
                                <p className="px-4 py-6 text-center text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</p>
                            )}
                            {clientsFiltres.map(c => (
                                <div key={c.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-dk-elevated/50">
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black border shrink-0 ${TEINTE_CLIENT[c.statut]}`}>{c.statut}</span>
                                    <div className="min-w-0 flex-1">
                                        <span className="block text-[12px] font-bold text-slate-800 dark:text-dk-text truncate">{c.nom}</span>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted truncate">
                                            {[c.type, c.ville, c.tel].filter(Boolean).join(' · ')}
                                            {c.facturesEnRetard > 0 ? ` · ${c.facturesEnRetard} ${T.retard}` : ''}
                                        </span>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className="block text-[12px] font-black tabular-nums text-slate-800 dark:text-dk-text">{nf(c.ca)} {currency}</span>
                                        {c.encours > 0 && (
                                            <span className="block text-[10px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
                                                {nf(c.encours)} {currency}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {!data && !chargement && !erreur && (
                <p className="text-[12px] text-slate-400 dark:text-dk-muted flex items-center gap-1.5">
                    <PackageX className="w-4 h-4" /> {T.rien}
                </p>
            )}
        </div>
    );
}
