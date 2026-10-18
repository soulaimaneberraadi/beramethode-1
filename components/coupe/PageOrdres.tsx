/**
 * Ordres en cours : les ordres de coupe pas encore soldes, a filtrer et a trier.
 *
 * Un seul sens pour « a couper » : commande - coupe (jamais negatif). L'ecart du plan (planifie - commande,
 * par taille) se lit a part, en puces : ambre = pieces planifiees en trop, rose = pieces sans matelas.
 * Les chiffres du haut suivent les filtres. Les calculs vivent dans `lib/coupeOrdres.ts` (teste) ; ici, l'affichage.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Building2, ChevronDown, Clock, Factory, Pause, Scissors, Search, X } from 'lucide-react';
import type { ModelData, PlanningEvent } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import type { ChaineCoupe } from '../../lib/coupeChaines';
import {
    FILTRES_ORDRE, JOURS_ANCIEN, compterFiltres, filtrerOrdres, kpisOrdres, lignesOrdres, trierOrdres,
    type FiltreOrdre, type LigneOrdre, type StatutOrdre, type TriOrdre,
} from '../../lib/coupeOrdres';
import { EnTetePage, Onglets } from './AccueilCoupe';
import { LignePlanChaine } from './PlanJourChaine';

const fmtN = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
/** « 24/10 » depuis AAAA-MM-JJ, sans passer par un fuseau. */
const jjmm = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

type Traduire = (fr: string, ar: string, en: string) => string;
function useL(): Traduire {
    const { lang } = useLang();
    return (fr, ar, en) => tx(lang, { fr, ar, en });
}

const STATUTS: Record<string, { fr: string; ar: string; en: string; cls: string }> = {
    EN_PREPARATION: { fr: 'Préparation', ar: 'تحضير', en: 'Preparation', cls: 'bg-slate-100 text-slate-600 dark:bg-dk-elevated dark:text-dk-muted' },
    EN_COURS: { fr: 'En cours', ar: 'قيد التنفيذ', en: 'In progress', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    SOUS_TRAITANCE: { fr: 'Sous-traitance', ar: 'مناولة', en: 'Subcontract', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
};

const AMBRE = 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-200';
const ROSE = 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/25 dark:text-rose-300';
const ARDOISE = 'border-slate-200 bg-slate-50 text-slate-600 dark:border-dk-border dark:bg-dk-elevated dark:text-dk-text-soft';

const nomFiltre = (f: FiltreOrdre, L: Traduire): string => ({
    tous: L('Tous', 'الكل', 'All'),
    nouveaux: L('Nouveaux', 'جديدة', 'New'),
    enCours: L('En cours', 'جارية', 'In progress'),
    presque: L('Presque finis', 'شبه منتهية', 'Almost done'),
    anciens: L('Anciens', 'قديمة', 'Old'),
    ecarts: L('Écarts', 'فروقات', 'Gaps'),
    pause: L('En pause', 'متوقفة', 'Paused'),
    retard: L('Lots en retard', 'دفعات متأخرة', 'Late lots'),
}[f]);

const aideFiltre = (f: FiltreOrdre, L: Traduire): string => ({
    tous: '',
    nouveaux: L('Rien de coupé pour l’instant', 'لم يُقصّ شيء بعد', 'Nothing cut yet'),
    enCours: L('Déjà commencés, moins de 90 % coupés', 'بدأ القص، أقل من 90٪', 'Started, under 90% cut'),
    presque: L('90 % de la commande coupés ou plus', '90٪ من الطلبية أو أكثر مقصوص', '90% of the order cut or more'),
    anciens: L(`Sans coupe depuis ${JOURS_ANCIEN} jours, ou export dépassé`, `بلا قص منذ ${JOURS_ANCIEN} يوماً، أو تجاوز تاريخ التصدير`, `No cutting for ${JOURS_ANCIEN} days, or export date passed`),
    ecarts: L('Le plan de coupe ne tombe pas juste sur la commande', 'مخطط القص لا يطابق الطلبية', 'The cutting plan does not match the order'),
    pause: L('Tous les pedidos sont en pause au Planning', 'كل الـ pedidos متوقفة في التخطيط', 'Every pedido is paused in Planning'),
    retard: L('Un lot est parti sans une de ses matières', 'دفعة خرجت بدون إحدى موادها', 'A lot left without one of its materials'),
}[f]);

/* ------------------------------------------------------------------ */
/* Briques                                                              */
/* ------------------------------------------------------------------ */

type Ton = 'neutre' | 'rose' | 'ambre';

function Puce({ actif, onClick, ton = 'neutre', title, children }: { actif: boolean; onClick: () => void; ton?: Ton; title?: string; children: React.ReactNode }) {
    const etat = actif
        ? 'border-slate-900 bg-slate-900 text-white dark:bg-dk-accent dark:border-dk-accent'
        : ton === 'rose' ? 'border-rose-200 dark:border-rose-800 bg-white dark:bg-dk-surface text-rose-600 dark:text-rose-400'
            : ton === 'ambre' ? 'border-amber-200 dark:border-amber-800 bg-white dark:bg-dk-surface text-amber-700 dark:text-amber-400'
                : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft';
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={actif}
            title={title || undefined}
            className={`h-9 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-lg border text-[12px] font-semibold whitespace-nowrap transition-colors ${etat}`}
        >
            {children}
        </button>
    );
}

/** Une rangee de puces : defile a l'horizontale sur telephone, passe a la ligne sur grand ecran. */
function RangeePuces({ children }: { children: React.ReactNode }) {
    return <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible">{children}</div>;
}

function Kpi({ label, valeur, ton }: { label: string; valeur: string; ton: string }) {
    return (
        <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border px-3 py-2.5 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted truncate">{label}</p>
            <p className={`text-[18px] font-bold tabular-nums truncate ${ton}`}>{valeur}</p>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Carte d'un ordre                                                     */
/* ------------------------------------------------------------------ */

/** « L1 · export 24/10 · CHAINE 3 » : le prochain pedido, et ce qui presse (export proche ou depasse, ordre sans coupe depuis longtemps). */
function LignePedido({ l }: { l: LigneOrdre }) {
    const L = useL();
    const p = l.prochain || l.pedidos[0] || null;
    const inactif = l.ancien && !l.exportDepasse && l.joursInactif !== null;
    if (!p && !inactif) return null;
    const j = l.joursExport;
    const date = p ? (p.export ? { mot: L('export', 'تصدير', 'export'), jour: p.export } : p.debut ? { mot: L('lancement', 'انطلاق', 'start'), jour: p.debut } : null) : null;
    const reste = l.pedidos.length - 1;
    const parts: React.ReactNode[] = [];
    if (p?.code) parts.push(<b key="code" className="text-slate-800 dark:text-dk-text">{p.code}</b>);
    if (date) parts.push(<span key="date">{date.mot} <b className="text-slate-800 dark:text-dk-text">{jjmm(date.jour)}</b></span>);
    if (p?.chaine) parts.push(<span key="chaine" className="inline-flex items-center gap-1"><Factory className="w-3 h-3 opacity-60" />{p.chaine}</span>);
    return (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-500 dark:text-dk-muted tabular-nums">
            {parts.map((x, i) => <React.Fragment key={i}>{i > 0 && <span className="text-slate-300 dark:text-dk-border">·</span>}{x}</React.Fragment>)}
            {p && p === l.prochain && j !== null && j < 0 && (
                <span className={`px-1.5 h-5 inline-flex items-center gap-1 rounded border text-[10px] font-bold ${ROSE}`}><AlertTriangle className="w-3 h-3" />{L(`dépassé de ${-j} j`, `تأخر ${-j} يوم`, `${-j} d overdue`)}</span>
            )}
            {p && p === l.prochain && j !== null && j >= 0 && j <= 3 && (
                <span className={`px-1.5 h-5 inline-flex items-center rounded border text-[10px] font-bold ${AMBRE}`}>{j === 0 ? L('aujourd’hui', 'اليوم', 'today') : L(`dans ${j} j`, `بعد ${j} يوم`, `in ${j} d`)}</span>
            )}
            {p?.enPause && (
                <span className={`px-1.5 h-5 inline-flex items-center gap-1 rounded border text-[10px] font-bold ${ARDOISE}`}><Pause className="w-3 h-3" />{L('en pause', 'متوقف', 'paused')}</span>
            )}
            {reste > 0 && (
                <span title={l.pedidos.map(x => `${x.code || '—'} ${jjmm(x.export || x.debut)}`).join(' · ')} className="px-1.5 h-5 inline-flex items-center rounded border border-slate-200 dark:border-dk-border text-[10px] font-bold">+{reste}</span>
            )}
            {inactif && (
                <span className={`px-1.5 h-5 inline-flex items-center gap-1 rounded border text-[10px] font-bold ${AMBRE}`}><Clock className="w-3 h-3" />{L(`sans coupe depuis ${l.joursInactif} j`, `بلا قص منذ ${l.joursInactif} يوم`, `no cutting for ${l.joursInactif} d`)}</span>
            )}
        </p>
    );
}

/** « +120 M » ambre (planifie en trop), « −80 XS » rose (pieces sans matelas) ; rien quand le plan tombe juste. */
function EcartsPlan({ l }: { l: LigneOrdre }) {
    const L = useL();
    const [tout, setTout] = useState(false);
    const MAX = 6;
    if (l.ecarts.length === 0) {
        if (l.b.nbMatelas > 0 || l.b.commande <= 0) return null;
        return (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={`px-1.5 h-5 inline-flex items-center rounded border text-[10px] font-bold ${ARDOISE}`}>{L('aucun matelas planifié', 'لا مفرشات مخططة', 'no lays planned')}</span>
            </div>
        );
    }
    const liste = tout ? l.ecarts : l.ecarts.slice(0, MAX);
    return (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-0.5">{L('Écart plan', 'فرق المخطط', 'Plan gap')}</span>
            {liste.map(e => {
                const plus = e.ecart > 0;
                const couleur = l.nbCouleurs > 1 ? e.couleur : '';
                return (
                    <span
                        key={`${e.couleur}|${e.taille}`}
                        title={plus
                            ? L(`${fmtN(e.ecart)} pcs ${e.taille}${e.couleur ? ` ${e.couleur}` : ''} planifiées en trop (commande ${fmtN(e.commande)}, plan ${fmtN(e.planifie)})`, `${fmtN(e.ecart)} قطعة ${e.taille}${e.couleur ? ` ${e.couleur}` : ''} زيادة في المخطط (طلبية ${fmtN(e.commande)}، مخطط ${fmtN(e.planifie)})`, `${fmtN(e.ecart)} pcs ${e.taille}${e.couleur ? ` ${e.couleur}` : ''} planned too many (order ${fmtN(e.commande)}, plan ${fmtN(e.planifie)})`)
                            : L(`${fmtN(-e.ecart)} pcs ${e.taille}${e.couleur ? ` ${e.couleur}` : ''} sans matelas (commande ${fmtN(e.commande)}, plan ${fmtN(e.planifie)})`, `${fmtN(-e.ecart)} قطعة ${e.taille}${e.couleur ? ` ${e.couleur}` : ''} بدون مفرشة (طلبية ${fmtN(e.commande)}، مخطط ${fmtN(e.planifie)})`, `${fmtN(-e.ecart)} pcs ${e.taille}${e.couleur ? ` ${e.couleur}` : ''} without a lay (order ${fmtN(e.commande)}, plan ${fmtN(e.planifie)})`)}
                        className={`px-1.5 h-5 inline-flex items-center gap-1 rounded border text-[10px] font-bold tabular-nums ${plus ? AMBRE : ROSE}`}
                    >
                        {plus ? '+' : '−'}{fmtN(Math.abs(e.ecart))} {e.taille}
                        {couleur && <span className="font-medium opacity-80 max-w-[72px] truncate">{couleur}</span>}
                    </span>
                );
            })}
            {l.ecarts.length > MAX && (
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setTout(v => !v); }}
                    aria-expanded={tout}
                    className="px-2 h-7 min-w-[32px] inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[11px] font-bold text-slate-600 dark:text-dk-text-soft"
                >
                    {tout ? '−' : `+${l.ecarts.length - MAX}`}
                </button>
            )}
        </div>
    );
}

/** Les matieres cote a cote (TE 6/223...), les vetements prets, les lots en retard ; le detail par taille s'ouvre au toucher. */
function LigneMatieres({ l }: { l: LigneOrdre }) {
    const L = useL();
    const [tailles, setTailles] = useState(false);
    if (l.matieres.length === 0 && l.retards === 0) return null;
    return (
        <>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold tabular-nums">
                {l.matieres.map(x => (
                    <span key={x.id} className={`px-1.5 h-5 inline-flex items-center gap-1 rounded ${x.faits === x.total ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-dk-elevated dark:text-dk-text-soft'}`}>
                        {x.code}<span className="font-semibold">{x.faits}/{x.total}</span>
                    </span>
                ))}
                {l.prets !== null && <span className="text-emerald-600 dark:text-emerald-400">{fmtN(l.prets)} {L('prêts', 'جاهزة', 'ready')}</span>}
                {l.retards > 0 && (
                    <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <AlertTriangle className="w-3 h-3" />{l.retards} {L('lot(s) en retard', 'دفعة متأخرة', 'late lot(s)')}
                    </span>
                )}
                {l.tailles.length > 0 && (
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setTailles(v => !v); }}
                        aria-expanded={tailles}
                        className="h-7 px-2 inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft"
                    >
                        {L('Par taille', 'حسب المقاس', 'By size')}
                        <ChevronDown className={`w-3 h-3 transition-transform ${tailles ? 'rotate-180' : ''}`} />
                    </button>
                )}
            </div>
            {tailles && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] tabular-nums">
                    <span className="font-bold uppercase tracking-wide text-slate-400 mr-0.5">{L('Prêt pour la chaîne', 'جاهز للسلسلة', 'Ready for the line')}</span>
                    {l.tailles.map(t => {
                        const plein = t.prets >= t.prevu;
                        return (
                            <span
                                key={t.taille}
                                title={t.limite.length ? L(`Retenu par ${t.limite.join(', ')}`, `تحبسه ${t.limite.join('، ')}`, `Held by ${t.limite.join(', ')}`) : undefined}
                                className={`px-1.5 h-5 inline-flex items-center gap-1 rounded border ${plein ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : t.prets > 0 ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-500 dark:border-dk-border dark:bg-dk-surface dark:text-dk-muted'}`}
                            >
                                <b>{t.taille}</b>{fmtN(t.prets)}/{fmtN(t.prevu)}
                                {t.limite.length > 0 && <span className="font-bold text-rose-600 dark:text-rose-400">{t.limite.join('·')}</span>}
                            </span>
                        );
                    })}
                </div>
            )}
        </>
    );
}

function CarteOrdre({ l, onOpen }: { l: LigneOrdre; onOpen: (m: ModelData) => void }) {
    const L = useL();
    const { m, b } = l;
    const st = STATUTS[b.statut] || STATUTS.EN_PREPARATION;
    const base = b.commande > 0 ? b.commande : b.planifie;
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(m)}
            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(m); } }}
            className="w-full text-left px-3 sm:px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-dk-elevated/60 focus:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-dk-elevated/60 transition-colors"
        >
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-dk-elevated shrink-0 flex items-center justify-center">
                    {b.image ? <img src={b.image} alt="" className="w-full h-full object-cover" /> : <Scissors className="w-4 h-4 text-slate-300" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13px] font-semibold text-slate-800 dark:text-dk-text truncate">{l.nom}</span>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${st.cls}`}>{L(st.fr, st.ar, st.en)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-dk-muted min-w-0">
                        {b.client && <><Building2 className="w-3 h-3 shrink-0 opacity-60" /><span className="truncate">{b.client}</span></>}
                        {b.type && <span className="shrink-0 px-1 rounded bg-slate-100 dark:bg-dk-elevated text-[9px] font-bold uppercase">{b.type}</span>}
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className={`text-[16px] font-bold tabular-nums ${b.reste > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{fmtN(b.reste)}</p>
                    <p className="text-[9px] text-slate-400 uppercase font-bold">{L('à couper', 'للقص', 'to cut')}</p>
                </div>
            </div>

            <LignePedido l={l} />

            <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round(b.avancement * 100)}%` }} />
                </div>
                <span className="text-[10px] tabular-nums text-slate-500 dark:text-dk-muted shrink-0">
                    {Math.round(b.avancement * 100)} % · {L('coupé', 'مقصوص', 'cut')} {fmtN(b.coupe)} / {fmtN(base)} · {b.nbFaits}/{b.nbMatelas} {L('mat.', 'مفرشة', 'lays')}
                </span>
            </div>

            {l.chaines.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{L('Aujourd’hui', 'اليوم', 'Today')}</span>
                    {l.chaines.map(e => <LignePlanChaine key={e.chaine.id} chaine={e.chaine} x={e.x} />)}
                </div>
            )}
            <LigneMatieres l={l} />
            <EcartsPlan l={l} />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export function PageOrdres({ models, evenements, onBack, onOpen, chaines }: {
    models: ModelData[];
    /** Le Planning : les pedidos de chaque ordre (export, lancement, pause). */
    evenements: PlanningEvent[];
    onBack: () => void;
    onOpen: (m: ModelData) => void;
    /** Ce que chaque chaine attend de la coupe (Planning + Suivi) : le plan du jour de chaque ordre, et le filtre par chaine. */
    chaines: ChaineCoupe[];
}) {
    const L = useL();
    const [filtre, setFiltre] = useState<FiltreOrdre>('tous');
    const [statut, setStatut] = useState<StatutOrdre | null>(null);
    const [chaineChoisie, setChaineChoisie] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const [tri, setTri] = useState<TriOrdre>('export');

    const lignes = useMemo(() => lignesOrdres(models, evenements, chaines), [models, evenements, chaines]);
    // Les chaines qui attendent au moins un ordre ouvert.
    const chainesUtiles = useMemo(() => chaines.filter(c => lignes.some(l => l.chaines.some(e => e.chaine.id === c.id))), [chaines, lignes]);
    const chaine = chaineChoisie && chainesUtiles.some(c => c.id === chaineChoisie) ? chaineChoisie : null;

    const visibles = useMemo(() => trierOrdres(filtrerOrdres(lignes, { filtre, statut, chaine, q }), tri), [lignes, filtre, statut, chaine, q, tri]);
    // Chaque puce annonce ce qu'elle donnerait, les autres criteres restant ce qu'ils sont.
    const compte = useMemo(() => compterFiltres(lignes, { filtre: 'tous', statut, chaine, q }), [lignes, statut, chaine, q]);
    const kpis = kpisOrdres(visibles);
    const filtreActif = filtre !== 'tous' || statut !== null || chaine !== null || q.trim() !== '';
    const toutAfficher = () => { setFiltre('tous'); setStatut(null); setChaineChoisie(null); setQ(''); };

    return (
        <div>
            <EnTetePage
                titre={L('Ordres en cours', 'الأوامر الجارية', 'Open orders')}
                sousTitre={L('Tous les ordres de coupe pas encore soldés', 'كل أوامر القص التي لم تُصفَّ بعد', 'Every cutting order not closed yet')}
                onBack={onBack}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <Kpi label={L('Ordres', 'أوامر', 'Orders')} valeur={fmtN(kpis.ordres)} ton="text-slate-800 dark:text-dk-text" />
                <Kpi label={L('À couper', 'للقص', 'To cut')} valeur={fmtN(kpis.aCouper)} ton="text-rose-600 dark:text-rose-400" />
                <Kpi label={L('Coupées', 'مقصوصة', 'Cut')} valeur={fmtN(kpis.coupees)} ton="text-emerald-600 dark:text-emerald-400" />
                <Kpi label={L('Écarts', 'فروقات', 'Gaps')} valeur={fmtN(kpis.ecarts)} ton={kpis.ecarts > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-dk-text'} />
            </div>

            <label className="flex items-center gap-2 h-10 px-3 mb-2 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={L('Modèle, client, type…', 'موديل، زبون، نوع…', 'Model, client, type…')} className="flex-1 min-w-0 bg-transparent text-[12px] outline-none" />
                {q && (
                    <button type="button" onClick={() => setQ('')} aria-label={L('Effacer', 'مسح', 'Clear')} className="w-7 h-7 -mr-1 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-dk-elevated">
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </label>

            <div className="space-y-1.5 mb-3">
                <RangeePuces>
                    {FILTRES_ORDRE.map(f => (
                        <Puce key={f} actif={filtre === f} onClick={() => setFiltre(f)} ton={f === 'retard' ? 'rose' : f === 'anciens' || f === 'ecarts' ? 'ambre' : 'neutre'} title={aideFiltre(f, L)}>
                            {nomFiltre(f, L)}<span className="tabular-nums opacity-70">{compte[f]}</span>
                        </Puce>
                    ))}
                </RangeePuces>
                <RangeePuces>
                    {(['EN_PREPARATION', 'SOUS_TRAITANCE'] as const).map(s => (
                        <Puce key={s} actif={statut === s} onClick={() => setStatut(v => (v === s ? null : s))}>{L(STATUTS[s].fr, STATUTS[s].ar, STATUTS[s].en)}</Puce>
                    ))}
                    {chainesUtiles.length > 0 && <span className="w-px h-5 bg-slate-200 dark:bg-dk-border shrink-0" />}
                    {chainesUtiles.map(c => (
                        <Puce key={c.id} actif={chaine === c.id} onClick={() => setChaineChoisie(v => (v === c.id ? null : c.id))}>
                            <Factory className="w-3.5 h-3.5 opacity-70" /><span className="max-w-[140px] truncate">{c.nom}</span>
                        </Puce>
                    ))}
                </RangeePuces>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0">{L('Trier', 'ترتيب', 'Sort')}</span>
                    <div className="min-w-0 flex-1">
                        <Onglets valeur={tri} onChange={setTri} options={[
                            { id: 'export', label: L('Export le plus proche', 'أقرب تصدير', 'Nearest export') },
                            { id: 'aCouper', label: L('Plus à couper', 'الأكثر للقص', 'Most to cut') },
                            { id: 'avancement', label: L('Moins avancé', 'الأقل تقدّماً', 'Least advanced') },
                            { id: 'retard', label: L('Lots en retard', 'الدفعات المتأخرة', 'Late lots') },
                        ]} />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border divide-y divide-slate-100 dark:divide-dk-border overflow-hidden">
                {visibles.length === 0 && (
                    <div className="text-center py-10 px-4">
                        <p className="text-[12px] text-slate-400">{lignes.length === 0 ? L('Aucun ordre ouvert', 'لا توجد أوامر جارية', 'No open order') : L('Aucun ordre ne correspond', 'لا أمر يطابق الاختيار', 'No order matches')}</p>
                        {lignes.length > 0 && filtreActif && (
                            <button type="button" onClick={toutAfficher} className="mt-2 h-9 px-3 rounded-lg border border-slate-200 dark:border-dk-border text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft">
                                {L('Tout afficher', 'عرض الكل', 'Show all')}
                            </button>
                        )}
                    </div>
                )}
                {visibles.map(l => <CarteOrdre key={l.m.id} l={l} onOpen={onOpen} />)}
            </div>
        </div>
    );
}
