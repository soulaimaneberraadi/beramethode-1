/**
 * Les trois vues de la liste La Coupe, pensees pour un atelier qui a
 * beaucoup de modeles en meme temps :
 *
 *   Tableau    colonnes par statut, cartes compactes (pas de grande photo) :
 *              coupe / commande, matelas, echeance du Planning, alertes.
 *              Les ordres en retard et les lancements proches passent devant.
 *   Journal    le calendrier de ce qui a ete COUPE chaque jour (pieces,
 *              metres, matelas) et des lancements couture a tenir ; un jour
 *              choisi donne son detail.
 *   Bilan      ce que la coupe doit encore, le tissu, l'efficience des traces,
 *              la cadence des 14 derniers jours, par client, puis tous les
 *              ordres dans un tableau triable.
 *
 * Tous les chiffres viennent de lib/coupeVues.ts (matelas + repartition).
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, ChevronLeft, ChevronRight, MoreVertical, Ruler, Scissors, Send } from 'lucide-react';
import type { ModelData, PlanningEvent } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { aujourdhui } from '../../lib/coupeAtelier';
import { bilanOrdre, journalCoupe, type BilanOrdre } from '../../lib/coupeVues';

const STATUTS = ['EN_PREPARATION', 'EN_COURS', 'SOUS_TRAITANCE', 'VALIDE', 'REJETE'] as const;
const PASTILLE: Record<string, string> = {
    EN_PREPARATION: 'bg-slate-400', EN_COURS: 'bg-blue-500', SOUS_TRAITANCE: 'bg-violet-500', VALIDE: 'bg-emerald-500', REJETE: 'bg-rose-500',
};
const ferme = (st: string) => st === 'VALIDE' || st === 'REJETE';

export const libelleStatut = (lang: string, st: string): string => ({
    EN_PREPARATION: tx(lang, { fr: 'Préparation', ar: 'تحضير', en: 'Preparation' }),
    EN_COURS: tx(lang, { fr: 'En cours', ar: 'قيد التنفيذ', en: 'In progress' }),
    SOUS_TRAITANCE: tx(lang, { fr: 'Extériorisé', ar: 'مقاول خارجي', en: 'Subcontracted' }),
    VALIDE: tx(lang, { fr: 'Validé', ar: 'تم التحقق', en: 'Validated' }),
    REJETE: tx(lang, { fr: 'Rejeté', ar: 'مرفوض', en: 'Rejected' }),
} as Record<string, string>)[st] || st;

const nb = (n: number) => Math.round(n).toLocaleString('fr-FR');
const court = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : String(Math.round(n)));
const m1 = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: n >= 100 ? 0 : 1 });
const jjmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** En retard d'abord, puis le lancement le plus proche, puis le plus ancien. */
const priorite = (a: BilanOrdre, b: BilanOrdre) => {
    if (a.enRetard !== b.enRetard) return a.enRetard ? -1 : 1;
    const ja = a.joursAvantLancement ?? 1e6, jb = b.joursAvantLancement ?? 1e6;
    if (ja !== jb) return ja - jb;
    return (a.creeLe || '').localeCompare(b.creeLe || '');
};

const useBilans = (models: ModelData[], evenements: PlanningEvent[]) =>
    useMemo(() => models.map(m => bilanOrdre(m, evenements)), [models, evenements]);

function Avancement({ v, className = '' }: { v: number; className?: string }) {
    return (
        <div className={`h-1.5 rounded-full bg-slate-100 dark:bg-dk-elevated overflow-hidden ${className}`}>
            <div className={`h-full rounded-full ${v >= 1 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, Math.round(v * 100))}%` }} />
        </div>
    );
}

function Vignette({ b, taille = 'w-10 h-10' }: { b: BilanOrdre; taille?: string }) {
    return b.image
        ? <img src={b.image} alt="" loading="lazy" draggable={false} className={`${taille} rounded-md object-cover shrink-0 bg-slate-100 dark:bg-dk-elevated`} />
        : <div className={`${taille} rounded-md bg-slate-100 dark:bg-dk-elevated flex items-center justify-center shrink-0`}><Scissors className="w-4 h-4 text-slate-300 dark:text-dk-muted" /></div>;
}

/** Lancement couture du Planning : la coupe doit etre finie avant. */
function Echeance({ b }: { b: BilanOrdre }) {
    const { lang } = useLang();
    if (b.joursAvantLancement === null || ferme(b.statut)) return null;
    const j = b.joursAvantLancement;
    const cls = b.reste === 0
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
        : j < 0 ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
            : j <= 2 ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-slate-100 text-slate-600 dark:bg-dk-elevated dark:text-dk-text-soft';
    const texte = j < 0
        ? tx(lang, { fr: `Retard ${-j} j`, ar: `تأخير ${-j} ي`, en: `${-j} d late` })
        : j === 0 ? tx(lang, { fr: "Aujourd'hui", ar: 'اليوم', en: 'Today' }) : `J-${j}`;
    return (
        <span
            title={`${tx(lang, { fr: 'Lancement couture le', ar: 'انطلاق الخياطة يوم', en: 'Sewing starts on' })} ${jjmm(b.lancement)}`}
            className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-bold whitespace-nowrap ${cls}`}
        >
            <CalendarClock className="w-3 h-3" />{texte}
        </span>
    );
}

/** Ce qui bloque ou manque, en petites etiquettes. */
function Alertes({ b }: { b: BilanOrdre }) {
    const { lang } = useLang();
    const out: React.ReactNode[] = [];
    if (b.nonPlanifie > 0) out.push(
        <span key="np" className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">
            {nb(b.nonPlanifie)} {tx(lang, { fr: 'pcs sans matelas', ar: 'قطعة بلا مفرشة', en: 'pcs without lay' })}
        </span>);
    if (b.manqueM > 0) out.push(
        <span key="mq" className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 whitespace-nowrap">
            <Ruler className="w-3 h-3" />{tx(lang, { fr: `manque ${m1(b.manqueM)} m`, ar: `ينقص ${m1(b.manqueM)} م`, en: `${m1(b.manqueM)} m short` })}
        </span>);
    if (b.nbSansLongueur > 0) out.push(
        <span key="sl" className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-dk-elevated dark:text-dk-text-soft whitespace-nowrap">
            {b.nbSansLongueur} {tx(lang, { fr: 'sans longueur', ar: 'بلا طول', en: 'no length' })}
        </span>);
    if (b.nbEnvoyes > 0) out.push(
        <span key="ev" className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 whitespace-nowrap">
            <Send className="w-3 h-3" />{b.nbEnvoyes} {tx(lang, { fr: 'au traceur', ar: 'في الراسم', en: 'at plotter' })}
        </span>);
    return out.length ? <>{out}</> : null;
}

/* ================================================================== */
/* Tableau                                                              */
/* ================================================================== */

export function TableauCoupe({ models, evenements, onOpen, onChangerStatut, onQuickAction }: {
    models: ModelData[];
    evenements: PlanningEvent[];
    onOpen: (m: ModelData) => void;
    onChangerStatut: (id: string, statut: string) => void;
    onQuickAction: (id: string, x: number, y: number) => void;
}) {
    const { lang } = useLang();
    const bilans = useBilans(models, evenements);
    const parId = useMemo(() => new Map(models.map(m => [m.id, m])), [models]);
    const [glisse, setGlisse] = useState<string | null>(null);
    const [survol, setSurvol] = useState<string | null>(null);
    const colonnes = STATUTS.filter(s => s !== 'REJETE' || bilans.some(b => b.statut === 'REJETE'));

    return (
        <div className="h-full min-h-0 overflow-x-auto overflow-y-hidden bg-slate-50 dark:bg-dk-bg snap-x snap-mandatory md:snap-none">
            <div className="h-full flex gap-3 p-3 md:p-4">
                {colonnes.map(st => {
                    const liste = bilans.filter(b => b.statut === st).sort(priorite);
                    const reste = liste.reduce((a, b) => a + b.reste, 0);
                    const retards = liste.filter(b => b.enRetard).length;
                    return (
                        <section
                            key={st}
                            onDragOver={e => { e.preventDefault(); if (survol !== st) setSurvol(st); }}
                            onDragLeave={() => setSurvol(null)}
                            onDrop={() => { if (glisse && parId.get(glisse)?.ordreCoupe?.status !== st) onChangerStatut(glisse, st); setGlisse(null); setSurvol(null); }}
                            className={`w-[86vw] shrink-0 snap-start md:w-auto md:flex-1 md:basis-0 md:min-w-[250px] flex flex-col min-h-0 rounded-xl border bg-white dark:bg-dk-surface transition-colors ${survol === st ? 'border-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-900' : 'border-slate-200 dark:border-dk-border'}`}
                        >
                            <header className="px-3 py-2.5 border-b border-slate-100 dark:border-dk-border flex items-center gap-2 min-w-0">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${PASTILLE[st]}`} />
                                <h3 className="text-[12px] font-bold text-slate-800 dark:text-dk-text truncate">{libelleStatut(lang, st)}</h3>
                                <span className="text-[11px] font-semibold text-slate-400 dark:text-dk-muted tabular-nums">{liste.length}</span>
                                {retards > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400" title={tx(lang, { fr: 'Ordres en retard', ar: 'أوامر متأخرة', en: 'Late orders' })}>
                                        <AlertTriangle className="w-3 h-3" />{retards}
                                    </span>
                                )}
                                {!ferme(st) && reste > 0 && (
                                    <span className="ml-auto text-[10px] font-semibold text-slate-500 dark:text-dk-muted tabular-nums whitespace-nowrap">
                                        {nb(reste)} {tx(lang, { fr: 'pcs à couper', ar: 'قطعة للقص', en: 'pcs to cut' })}
                                    </span>
                                )}
                            </header>
                            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
                                {liste.map(b => {
                                    const m = parId.get(b.id);
                                    return (
                                        <article
                                            key={b.id}
                                            draggable
                                            onDragStart={e => { setGlisse(b.id); e.dataTransfer.effectAllowed = 'move'; }}
                                            onDragEnd={() => { setGlisse(null); setSurvol(null); }}
                                            onClick={() => m && onOpen(m)}
                                            className={`rounded-lg border bg-white dark:bg-dk-surface p-2.5 cursor-pointer transition-all hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-600 ${glisse === b.id ? 'opacity-40' : ''} ${b.enRetard ? 'border-rose-200 dark:border-rose-800' : 'border-slate-200 dark:border-dk-border'}`}
                                        >
                                            <div className="flex items-start gap-2.5">
                                                <Vignette b={b} />
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="text-[12.5px] font-bold text-slate-800 dark:text-dk-text truncate leading-tight">{b.nom || '—'}</h4>
                                                    <p className="text-[10.5px] text-slate-500 dark:text-dk-muted truncate mt-0.5">
                                                        {[b.reference && b.reference !== b.nom ? b.reference : '', b.client].filter(Boolean).join(' · ') || '—'}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={e => { e.stopPropagation(); onQuickAction(b.id, e.clientX, e.clientY); }}
                                                    className="w-7 h-7 -mr-1 -mt-1 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-dk-elevated shrink-0"
                                                    title={tx(lang, { fr: 'Actions', ar: 'إجراءات', en: 'Actions' })}
                                                >
                                                    <MoreVertical className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <div className="mt-2 flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
                                                <span className="font-bold text-slate-800 dark:text-dk-text">
                                                    {nb(b.coupe)}
                                                    <span className="font-medium text-slate-400 dark:text-dk-muted"> / {b.commande > 0 ? nb(b.commande) : '—'} pcs</span>
                                                </span>
                                                <span className="text-slate-500 dark:text-dk-muted whitespace-nowrap">
                                                    {b.nbMatelas
                                                        ? `${b.nbFaits}/${b.nbMatelas} ${tx(lang, { fr: 'mat.', ar: 'مفرشة', en: 'lays' })}`
                                                        : tx(lang, { fr: 'Aucun matelas', ar: 'بلا مفرشات', en: 'No lays' })}
                                                </span>
                                            </div>
                                            <Avancement v={b.avancement} className="mt-1.5" />
                                            {(b.joursAvantLancement !== null || b.nonPlanifie > 0 || b.manqueM > 0 || b.nbEnvoyes > 0 || b.nbSansLongueur > 0) && !ferme(b.statut) && (
                                                <div className="mt-2 flex flex-wrap gap-1"><Echeance b={b} /><Alertes b={b} /></div>
                                            )}
                                        </article>
                                    );
                                })}
                                {!liste.length && (
                                    <p className="py-8 text-center text-[11px] text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Aucun ordre', ar: 'لا يوجد أمر', en: 'No orders' })}</p>
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

/* ================================================================== */
/* Journal de coupe (calendrier)                                        */
/* ================================================================== */

export function CalendrierCoupe({ models, evenements, onOpen }: {
    models: ModelData[];
    evenements: PlanningEvent[];
    onOpen: (m: ModelData) => void;
}) {
    const { lang } = useLang();
    const locale = lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : 'fr-FR';
    const [mois, setMois] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
    const [choisi, setChoisi] = useState<string>(() => aujourdhui());
    const journal = useMemo(() => journalCoupe(models), [models]);
    const bilans = useBilans(models, evenements);
    const parId = useMemo(() => new Map(models.map(m => [m.id, m])), [models]);
    const lancements = useMemo(() => {
        const map = new Map<string, BilanOrdre[]>();
        for (const b of bilans) {
            if (!b.lancement || b.statut === 'REJETE') continue;
            const l = map.get(b.lancement) || [];
            l.push(b);
            map.set(b.lancement, l);
        }
        return map;
    }, [bilans]);

    const an = mois.getFullYear(), mo = mois.getMonth();
    const nbJours = new Date(an, mo + 1, 0).getDate();
    const decalage = (new Date(an, mo, 1).getDay() + 6) % 7; // la semaine commence lundi
    const cle = (j: number) => aujourdhui(new Date(an, mo, j));
    const cases: (number | null)[] = [...Array(decalage).fill(null), ...Array.from({ length: nbJours }, (_, i) => i + 1)];
    while (cases.length % 7) cases.push(null);
    const auj = aujourdhui();

    let piecesMois = 0, metresMois = 0, joursTravailles = 0, meilleur = 0;
    for (let j = 1; j <= nbJours; j++) {
        const x = journal.get(cle(j));
        if (x) { piecesMois += x.pieces; metresMois += x.metres; joursTravailles++; meilleur = Math.max(meilleur, x.pieces); }
    }
    const jour = journal.get(choisi);
    const dus = (lancements.get(choisi) || []).slice().sort((a, b) => b.reste - a.reste);
    const joursSemaine = lang === 'ar'
        ? ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح']
        : lang === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const allerA = (delta: number) => setMois(new Date(an, mo + delta, 1));

    return (
        <div className="p-3 md:p-5 w-full max-w-[1600px] mx-auto">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden min-w-0">
                    <div className="px-3 md:px-4 py-3 border-b border-slate-100 dark:border-dk-border flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="flex items-center gap-1">
                            <button type="button" onClick={() => allerA(-1)} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-dk-elevated text-slate-600 dark:text-dk-text-soft"><ChevronLeft className="w-4 h-4 rtl:rotate-180" /></button>
                            <h3 className="min-w-[130px] text-center text-[14px] font-semibold text-slate-800 dark:text-dk-text capitalize">{mois.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h3>
                            <button type="button" onClick={() => allerA(1)} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-dk-elevated text-slate-600 dark:text-dk-text-soft"><ChevronRight className="w-4 h-4 rtl:rotate-180" /></button>
                            <button type="button" onClick={() => { const d = new Date(); setMois(new Date(d.getFullYear(), d.getMonth(), 1)); setChoisi(aujourdhui()); }} className="h-8 px-2.5 text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-md">
                                {tx(lang, { fr: "Aujourd'hui", ar: 'اليوم', en: 'Today' })}
                            </button>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-dk-muted tabular-nums">
                            <span><b className="text-[13px] text-slate-800 dark:text-dk-text">{nb(piecesMois)}</b> {tx(lang, { fr: 'pcs coupées', ar: 'قطعة مقصوصة', en: 'pcs cut' })}</span>
                            <span><b className="text-slate-800 dark:text-dk-text">{m1(metresMois)}</b> m</span>
                            <span><b className="text-slate-800 dark:text-dk-text">{joursTravailles}</b> {tx(lang, { fr: 'jours de coupe', ar: 'أيام قص', en: 'cutting days' })}</span>
                            {joursTravailles > 0 && <span>{tx(lang, { fr: 'moyenne', ar: 'المعدل', en: 'avg' })} <b className="text-slate-800 dark:text-dk-text">{nb(piecesMois / joursTravailles)}</b> {tx(lang, { fr: 'pcs/jour', ar: 'قطعة/يوم', en: 'pcs/day' })}</span>}
                        </div>
                    </div>
                    <div className="grid grid-cols-7 bg-slate-50 dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border">
                        {joursSemaine.map(d => <div key={d} className="py-1.5 text-center text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7">
                        {cases.map((j, i) => {
                            if (j === null) return <div key={i} className="h-16 md:h-24 border-r border-b border-slate-100 dark:border-dk-border bg-slate-50/60 dark:bg-dk-bg/40" />;
                            const k = cle(j);
                            const x = journal.get(k);
                            const dusJour = lancements.get(k) || [];
                            const enRetard = dusJour.some(b => b.reste > 0 && !ferme(b.statut) && k <= auj);
                            const aTenir = dusJour.some(b => b.reste > 0 && !ferme(b.statut));
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setChoisi(k)}
                                    className={`relative h-16 md:h-24 p-1 md:p-1.5 text-left rtl:text-right border-r border-b border-slate-100 dark:border-dk-border flex flex-col overflow-hidden transition-colors ${k === choisi ? 'bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-inset ring-indigo-400' : 'bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}
                                >
                                    <div className="flex items-center justify-between gap-1">
                                        <span className={`text-[10px] md:text-[11px] font-bold tabular-nums ${k === auj ? 'px-1 rounded bg-indigo-600 text-white' : 'text-slate-500 dark:text-dk-muted'}`}>{j}</span>
                                        {dusJour.length > 0 && (
                                            <span
                                                title={tx(lang, { fr: 'Lancements couture ce jour', ar: 'انطلاق الخياطة هذا اليوم', en: 'Sewing starts this day' })}
                                                className={`inline-flex items-center gap-0.5 h-4 px-1 rounded text-[9px] font-bold ${enRetard ? 'bg-rose-500 text-white' : aTenir ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}
                                            >
                                                <CalendarClock className="w-2.5 h-2.5" />{dusJour.length}
                                            </span>
                                        )}
                                    </div>
                                    {x && (
                                        <div className="mt-auto">
                                            <div className="text-[11px] md:text-[14px] font-extrabold text-slate-800 dark:text-dk-text tabular-nums leading-none">
                                                {court(x.pieces)}<span className="hidden md:inline text-[10px] font-semibold text-slate-400"> pcs</span>
                                            </div>
                                            <div className="hidden md:block mt-0.5 text-[10px] text-slate-400 dark:text-dk-muted tabular-nums truncate">{m1(x.metres)} m · {x.matelas} {tx(lang, { fr: 'mat.', ar: 'مفرشة', en: 'lays' })}</div>
                                        </div>
                                    )}
                                    {x && <span className="absolute left-0 bottom-0 h-1 bg-emerald-400" style={{ width: `${Math.max(8, Math.round((x.pieces / (meilleur || 1)) * 100))}%` }} />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Detail du jour choisi */}
                <aside className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-4 space-y-4 min-w-0 self-start">
                    <h4 className="text-[13px] font-bold text-slate-800 dark:text-dk-text capitalize">
                        {new Date(choisi + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h4>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted mb-1.5">{tx(lang, { fr: 'Coupé ce jour', ar: 'المقصوص هذا اليوم', en: 'Cut this day' })}</p>
                        {jour ? (
                            <>
                                <p className="text-[12px] text-slate-600 dark:text-dk-text-soft tabular-nums mb-2">
                                    <b className="text-[18px] text-slate-900 dark:text-dk-text">{nb(jour.pieces)}</b> pcs · {m1(jour.metres)} m · {jour.matelas} {tx(lang, { fr: 'matelas', ar: 'مفرشة', en: 'lays' })}
                                </p>
                                <ul className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {jour.ordres.map(od => (
                                        <li key={od.id}>
                                            <button type="button" onClick={() => { const m = parId.get(od.id); if (m) onOpen(m); }} className="w-full py-1.5 flex items-center justify-between gap-2 text-left rtl:text-right hover:text-indigo-600">
                                                <span className="text-[12px] font-semibold text-slate-700 dark:text-dk-text-soft truncate">{od.nom || '—'}</span>
                                                <span className="text-[11px] text-slate-500 dark:text-dk-muted tabular-nums whitespace-nowrap">{nb(od.pieces)} pcs · {od.matelas} {tx(lang, { fr: 'mat.', ar: 'مفرشة', en: 'lays' })}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <p className="text-[12px] text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Aucun matelas confirmé coupé ce jour.', ar: 'لا مفرشة مؤكَّدة القص هذا اليوم.', en: 'No lay confirmed cut this day.' })}</p>
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted mb-1.5">{tx(lang, { fr: 'Lancement couture ce jour', ar: 'انطلاق الخياطة هذا اليوم', en: 'Sewing starts this day' })}</p>
                        {dus.length ? (
                            <ul className="space-y-2">
                                {dus.map(b => (
                                    <li key={b.id}>
                                        <button type="button" onClick={() => { const m = parId.get(b.id); if (m) onOpen(m); }} className="w-full text-left rtl:text-right">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[12px] font-semibold text-slate-700 dark:text-dk-text-soft truncate">{b.nom || '—'}</span>
                                                <span className={`text-[11px] font-bold tabular-nums whitespace-nowrap ${b.reste > 0 && !ferme(b.statut) ? (choisi <= auj ? 'text-rose-600' : 'text-amber-600') : 'text-emerald-600'}`}>
                                                    {b.reste > 0 && !ferme(b.statut) ? `${tx(lang, { fr: 'reste', ar: 'باقي', en: 'left' })} ${nb(b.reste)}` : tx(lang, { fr: 'coupé', ar: 'مقصوص', en: 'cut' })}
                                                </span>
                                            </div>
                                            <Avancement v={b.avancement} className="mt-1" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-[12px] text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Aucun lancement prévu au Planning.', ar: 'لا انطلاق مبرمج في التخطيط.', en: 'No start planned.' })}</p>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

/* ================================================================== */
/* Bilan (stats)                                                        */
/* ================================================================== */

type Tri = 'priorite' | 'nom' | 'lancement' | 'commande' | 'coupe' | 'reste' | 'avancement' | 'tissu' | 'efficience';

function Tuile({ label, valeur, sous, ton = 'neutre' }: { label: string; valeur: string; sous?: React.ReactNode; ton?: 'neutre' | 'alerte' | 'bon' | 'attention' }) {
    const couleur = ton === 'alerte' ? 'text-rose-600 dark:text-rose-400' : ton === 'bon' ? 'text-emerald-600 dark:text-emerald-400' : ton === 'attention' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-dk-text';
    return (
        <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border px-3.5 py-3 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted truncate">{label}</p>
            <p className={`mt-1 text-[20px] md:text-[22px] font-extrabold tabular-nums leading-tight truncate ${couleur}`}>{valeur}</p>
            {sous && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-dk-muted truncate">{sous}</p>}
        </div>
    );
}

export function StatsCoupe({ models, evenements, onOpen }: {
    models: ModelData[];
    evenements: PlanningEvent[];
    onOpen: (m: ModelData) => void;
}) {
    const { lang } = useLang();
    const bilans = useBilans(models, evenements);
    const parId = useMemo(() => new Map(models.map(m => [m.id, m])), [models]);
    const journal = useMemo(() => journalCoupe(models), [models]);
    const [tri, setTri] = useState<Tri>('priorite');
    const [desc, setDesc] = useState(false);

    const t = useMemo(() => {
        const actifs = bilans.filter(b => b.statut !== 'REJETE');
        const ouverts = actifs.filter(b => !ferme(b.statut));
        let effPoids = 0, effSomme = 0; const effs: number[] = [];
        for (const b of actifs) {
            if (b.efficience === null) continue;
            effs.push(b.efficience);
            if (b.prevuM > 0) { effSomme += b.efficience * b.prevuM; effPoids += b.prevuM; }
        }
        const efficience = effPoids > 0 ? effSomme / effPoids : effs.length ? effs.reduce((a, c) => a + c, 0) / effs.length : null;
        const somme = (l: BilanOrdre[], f: (b: BilanOrdre) => number) => l.reduce((a, b) => a + f(b), 0);
        return {
            nbOuverts: ouverts.length,
            commande: somme(actifs, b => b.commande),
            coupe: somme(actifs, b => b.coupe),
            reste: somme(ouverts, b => b.reste),
            nonPlanifie: somme(ouverts, b => b.nonPlanifie),
            prevuM: somme(actifs, b => b.prevuM),
            consommeM: somme(actifs, b => b.consommeM),
            manques: ouverts.filter(b => b.manqueM > 0).length,
            retards: ouverts.filter(b => b.enRetard).length,
            efficience,
        };
    }, [bilans]);

    // Cadence : les 14 derniers jours, aujourd'hui compris.
    const cadence = useMemo(() => {
        const out: { jour: string; pieces: number; metres: number }[] = [];
        const d = new Date();
        for (let i = 13; i >= 0; i--) {
            const k = aujourdhui(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i));
            const x = journal.get(k);
            out.push({ jour: k, pieces: x?.pieces || 0, metres: x?.metres || 0 });
        }
        return out;
    }, [journal]);
    const maxCadence = Math.max(1, ...cadence.map(c => c.pieces));
    const joursActifs = cadence.filter(c => c.pieces > 0);
    const moyenne = joursActifs.length ? joursActifs.reduce((a, c) => a + c.pieces, 0) / joursActifs.length : 0;

    const clients = useMemo(() => {
        const map = new Map<string, { client: string; ordres: number; commande: number; coupe: number; reste: number }>();
        for (const b of bilans) {
            if (b.statut === 'REJETE') continue;
            const k = b.client || '';
            const c = map.get(k) || { client: k, ordres: 0, commande: 0, coupe: 0, reste: 0 };
            c.ordres++; c.commande += b.commande; c.coupe += b.coupe; c.reste += b.reste;
            map.set(k, c);
        }
        return [...map.values()].sort((a, b) => b.reste - a.reste || b.commande - a.commande);
    }, [bilans]);

    const tries = useMemo(() => {
        const v = (b: BilanOrdre): number | string => {
            switch (tri) {
                case 'nom': return (b.nom || '').toLowerCase();
                case 'lancement': return b.lancement || '9999';
                case 'commande': return b.commande;
                case 'coupe': return b.coupe;
                case 'reste': return b.reste;
                case 'avancement': return b.avancement;
                case 'tissu': return b.prevuM;
                case 'efficience': return b.efficience ?? -1;
                default: return 0;
            }
        };
        const l = bilans.slice();
        if (tri === 'priorite') { l.sort(priorite); return desc ? l.reverse() : l; }
        l.sort((a, b) => { const x = v(a), y = v(b); const r = x < y ? -1 : x > y ? 1 : 0; return desc ? -r : r; });
        return l;
    }, [bilans, tri, desc]);

    const trier = (k: Tri) => {
        if (tri === k) setDesc(d => !d);
        else { setTri(k); setDesc(k === 'commande' || k === 'coupe' || k === 'reste' || k === 'tissu' || k === 'efficience'); }
    };
    const Th = ({ k, children, droite }: { k: Tri; children: React.ReactNode; droite?: boolean }) => (
        <th className={`px-2.5 py-2 font-bold whitespace-nowrap ${droite ? 'text-right rtl:text-left' : 'text-left rtl:text-right'}`}>
            <button type="button" onClick={() => trier(k)} className={`inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-dk-text ${tri === k ? 'text-slate-800 dark:text-dk-text' : ''}`}>
                {children}
                {tri === k && (desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
            </button>
        </th>
    );
    const ouvrir = (id: string) => { const m = parId.get(id); if (m) onOpen(m); };

    return (
        <div className="p-3 md:p-5 w-full max-w-[1600px] mx-auto space-y-4 min-w-0">
            {/* Chiffres cles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
                <Tuile
                    label={tx(lang, { fr: 'Commandé', ar: 'المطلوب', en: 'Ordered' })}
                    valeur={nb(t.commande)}
                    sous={`${t.nbOuverts} ${tx(lang, { fr: 'ordres ouverts', ar: 'أوامر مفتوحة', en: 'open orders' })}`}
                />
                <Tuile
                    label={tx(lang, { fr: 'Coupé', ar: 'المقصوص', en: 'Cut' })}
                    valeur={nb(t.coupe)}
                    sous={t.commande > 0 ? `${pct(Math.min(1, t.coupe / t.commande))} ${tx(lang, { fr: 'de la commande', ar: 'من الطلب', en: 'of the order' })}` : undefined}
                    ton="bon"
                />
                <Tuile
                    label={tx(lang, { fr: 'Reste à couper', ar: 'الباقي للقص', en: 'Left to cut' })}
                    valeur={nb(t.reste)}
                    sous={t.nonPlanifie > 0 ? `${nb(t.nonPlanifie)} ${tx(lang, { fr: 'pcs sans matelas', ar: 'قطعة بلا مفرشة', en: 'pcs without lay' })}` : tx(lang, { fr: 'tout est planifié', ar: 'كل شيء مبرمج', en: 'all planned' })}
                    ton={t.reste > 0 ? 'attention' : 'neutre'}
                />
                <Tuile
                    label={tx(lang, { fr: 'Tissu consommé', ar: 'القماش المستهلك', en: 'Fabric used' })}
                    valeur={`${m1(t.consommeM)} m`}
                    sous={<>{tx(lang, { fr: 'prévu', ar: 'المتوقع', en: 'planned' })} {m1(t.prevuM)} m{t.manques > 0 && <span className="text-rose-600 font-semibold"> · {t.manques} {tx(lang, { fr: 'en manque', ar: 'ناقص', en: 'short' })}</span>}</>}
                />
                <Tuile
                    label={tx(lang, { fr: 'Efficience tracés', ar: 'كفاءة الرسم', en: 'Marker efficiency' })}
                    valeur={t.efficience === null ? '—' : `${t.efficience.toFixed(1).replace('.', ',')} %`}
                    sous={t.efficience === null
                        ? tx(lang, { fr: 'lue dans les PLT (E=…%)', ar: 'تُقرأ من ملفات PLT', en: 'read from PLT files' })
                        : `${tx(lang, { fr: 'chute', ar: 'الفاقد', en: 'waste' })} ${(100 - t.efficience).toFixed(1).replace('.', ',')} %`}
                    ton={t.efficience === null ? 'neutre' : t.efficience >= 80 ? 'bon' : t.efficience >= 70 ? 'attention' : 'alerte'}
                />
                <Tuile
                    label={tx(lang, { fr: 'En retard', ar: 'متأخر', en: 'Late' })}
                    valeur={String(t.retards)}
                    sous={tx(lang, { fr: 'lancement couture dépassé', ar: 'تجاوز موعد الخياطة', en: 'sewing start passed' })}
                    ton={t.retards > 0 ? 'alerte' : 'neutre'}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                {/* Cadence */}
                <section className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-4 min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                        <h3 className="text-[13px] font-bold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Cadence — 14 derniers jours', ar: 'الوتيرة — آخر 14 يوماً', en: 'Pace — last 14 days' })}</h3>
                        <span className="text-[11px] text-slate-500 dark:text-dk-muted tabular-nums">
                            {joursActifs.length
                                ? <>{tx(lang, { fr: 'moyenne', ar: 'المعدل', en: 'avg' })} <b className="text-slate-800 dark:text-dk-text">{nb(moyenne)}</b> {tx(lang, { fr: 'pcs par jour de coupe', ar: 'قطعة في يوم القص', en: 'pcs per cutting day' })}</>
                                : tx(lang, { fr: 'aucun matelas confirmé coupé', ar: 'لا مفرشة مؤكَّدة القص', en: 'no lay confirmed cut' })}
                        </span>
                    </div>
                    <div className="h-36 flex items-end gap-1 md:gap-1.5">
                        {cadence.map(c => {
                            const d = new Date(c.jour + 'T12:00:00');
                            const weekend = d.getDay() === 0;
                            return (
                                <div key={c.jour} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1" title={`${jjmm(c.jour)} : ${nb(c.pieces)} pcs · ${m1(c.metres)} m`}>
                                    {c.pieces > 0 && <span className="hidden sm:block text-[9px] font-bold text-slate-500 dark:text-dk-muted tabular-nums">{court(c.pieces)}</span>}
                                    <div className={`w-full rounded-t ${c.pieces > 0 ? 'bg-emerald-500' : 'bg-slate-100 dark:bg-dk-elevated'}`} style={{ height: c.pieces > 0 ? `${Math.max(4, (c.pieces / maxCadence) * 100)}%` : '3px' }} />
                                    <span className={`text-[9px] tabular-nums ${c.jour === aujourdhui() ? 'font-bold text-indigo-600' : weekend ? 'text-slate-300' : 'text-slate-400 dark:text-dk-muted'}`}>{c.jour.slice(8, 10)}</span>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Par client */}
                <section className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-4 min-w-0">
                    <h3 className="text-[13px] font-bold text-slate-800 dark:text-dk-text mb-2">{tx(lang, { fr: 'Par client', ar: 'حسب الزبون', en: 'By client' })}</h3>
                    {clients.length ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12px] tabular-nums">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-dk-muted">
                                        <th className="py-1.5 text-left rtl:text-right font-bold">{tx(lang, { fr: 'Client', ar: 'الزبون', en: 'Client' })}</th>
                                        <th className="py-1.5 text-right rtl:text-left font-bold">{tx(lang, { fr: 'Ordres', ar: 'أوامر', en: 'Orders' })}</th>
                                        <th className="py-1.5 text-right rtl:text-left font-bold">{tx(lang, { fr: 'Commandé', ar: 'المطلوب', en: 'Ordered' })}</th>
                                        <th className="py-1.5 text-right rtl:text-left font-bold">{tx(lang, { fr: 'Reste', ar: 'الباقي', en: 'Left' })}</th>
                                        <th className="py-1.5 pl-3 rtl:pl-0 rtl:pr-3 font-bold w-24"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {clients.slice(0, 8).map(c => {
                                        const av = c.commande > 0 ? Math.min(1, c.coupe / c.commande) : 0;
                                        return (
                                            <tr key={c.client || '—'}>
                                                <td className="py-1.5 font-semibold text-slate-700 dark:text-dk-text-soft truncate max-w-[140px]">{c.client || tx(lang, { fr: 'Sans client', ar: 'بلا زبون', en: 'No client' })}</td>
                                                <td className="py-1.5 text-right rtl:text-left text-slate-500">{c.ordres}</td>
                                                <td className="py-1.5 text-right rtl:text-left text-slate-700 dark:text-dk-text-soft">{nb(c.commande)}</td>
                                                <td className={`py-1.5 text-right rtl:text-left font-bold ${c.reste > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{nb(c.reste)}</td>
                                                <td className="py-1.5 pl-3 rtl:pl-0 rtl:pr-3"><Avancement v={av} /></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : <p className="text-[12px] text-slate-400">—</p>}
                </section>
            </div>

            {/* Tous les ordres */}
            <section className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border min-w-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-2">
                    <h3 className="text-[13px] font-bold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Ordres', ar: 'الأوامر', en: 'Orders' })} <span className="text-slate-400 font-semibold tabular-nums">{bilans.length}</span></h3>
                    <button type="button" onClick={() => { setTri('priorite'); setDesc(false); }} className={`h-7 px-2.5 rounded-md text-[11px] font-semibold ${tri === 'priorite' ? 'bg-slate-900 text-white dark:bg-dk-accent' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-dk-elevated'}`}>
                        {tx(lang, { fr: 'Priorité', ar: 'الأولوية', en: 'Priority' })}
                    </button>
                </div>

                {/* Telephone : une ligne par ordre */}
                <ul className="md:hidden divide-y divide-slate-100 dark:divide-dk-border">
                    {tries.map(b => (
                        <li key={b.id}>
                            <button type="button" onClick={() => ouvrir(b.id)} className="w-full px-3 py-2.5 text-left rtl:text-right">
                                <div className="flex items-center gap-2.5">
                                    <Vignette b={b} taille="w-9 h-9" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PASTILLE[b.statut]}`} />
                                            <span className="text-[12.5px] font-bold text-slate-800 dark:text-dk-text truncate">{b.nom || '—'}</span>
                                        </div>
                                        <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-slate-500 dark:text-dk-muted">
                                            <span className="truncate">{b.client || '—'}</span>
                                            <span className="whitespace-nowrap"><b className="text-slate-800 dark:text-dk-text">{nb(b.coupe)}</b> / {b.commande > 0 ? nb(b.commande) : '—'}</span>
                                        </div>
                                        <Avancement v={b.avancement} className="mt-1" />
                                    </div>
                                </div>
                                {!ferme(b.statut) && <div className="mt-1.5 pl-[46px] rtl:pl-0 rtl:pr-[46px] flex flex-wrap gap-1"><Echeance b={b} /><Alertes b={b} /></div>}
                            </button>
                        </li>
                    ))}
                </ul>

                {/* Ordinateur : tableau triable */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-[12px] tabular-nums">
                        <thead className="bg-slate-50 dark:bg-dk-bg text-[10px] uppercase tracking-wide text-slate-500 dark:text-dk-muted">
                            <tr>
                                <Th k="nom">{tx(lang, { fr: 'Modèle', ar: 'النموذج', en: 'Model' })}</Th>
                                <th className="px-2.5 py-2 text-left rtl:text-right font-bold">{tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status' })}</th>
                                <Th k="lancement">{tx(lang, { fr: 'Lancement', ar: 'الانطلاق', en: 'Start' })}</Th>
                                <Th k="commande" droite>{tx(lang, { fr: 'Commandé', ar: 'المطلوب', en: 'Ordered' })}</Th>
                                <Th k="coupe" droite>{tx(lang, { fr: 'Coupé', ar: 'المقصوص', en: 'Cut' })}</Th>
                                <Th k="reste" droite>{tx(lang, { fr: 'Reste', ar: 'الباقي', en: 'Left' })}</Th>
                                <Th k="avancement">{tx(lang, { fr: 'Avancement', ar: 'التقدم', en: 'Progress' })}</Th>
                                <th className="px-2.5 py-2 text-right rtl:text-left font-bold">{tx(lang, { fr: 'Matelas', ar: 'المفرشات', en: 'Lays' })}</th>
                                <Th k="tissu" droite>{tx(lang, { fr: 'Tissu (m)', ar: 'القماش (م)', en: 'Fabric (m)' })}</Th>
                                <th className="px-2.5 py-2 text-right rtl:text-left font-bold">m/pc</th>
                                <Th k="efficience" droite>{tx(lang, { fr: 'Effic.', ar: 'الكفاءة', en: 'Effic.' })}</Th>
                                <th className="px-2.5 py-2 text-left rtl:text-right font-bold">{tx(lang, { fr: 'À vérifier', ar: 'للتحقق', en: 'Check' })}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                            {tries.map(b => (
                                <tr key={b.id} onClick={() => ouvrir(b.id)} className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-dk-elevated/50 ${b.enRetard ? 'bg-rose-50/40 dark:bg-rose-900/10' : ''}`}>
                                    <td className="px-2.5 py-2 max-w-[260px]">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Vignette b={b} taille="w-8 h-8" />
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-800 dark:text-dk-text truncate">{b.nom || '—'}</div>
                                                <div className="text-[10.5px] text-slate-500 dark:text-dk-muted truncate">{[b.reference && b.reference !== b.nom ? b.reference : '', b.client].filter(Boolean).join(' · ') || '—'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-2.5 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-dk-text-soft"><span className={`w-1.5 h-1.5 rounded-full ${PASTILLE[b.statut]}`} />{libelleStatut(lang, b.statut)}</span></td>
                                    <td className="px-2.5 py-2 whitespace-nowrap">{b.lancement ? <span className="inline-flex items-center gap-1.5"><span className="text-slate-600 dark:text-dk-text-soft">{jjmm(b.lancement)}</span><Echeance b={b} /></span> : <span className="text-slate-300">—</span>}</td>
                                    <td className="px-2.5 py-2 text-right rtl:text-left text-slate-700 dark:text-dk-text-soft">{b.commande > 0 ? nb(b.commande) : '—'}</td>
                                    <td className="px-2.5 py-2 text-right rtl:text-left font-semibold text-slate-800 dark:text-dk-text">{nb(b.coupe)}</td>
                                    <td className={`px-2.5 py-2 text-right rtl:text-left font-bold ${b.reste > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-300'}`}>{nb(b.reste)}</td>
                                    <td className="px-2.5 py-2"><div className="flex items-center gap-2 w-28"><Avancement v={b.avancement} className="flex-1" /><span className="text-[10px] text-slate-500 w-8 text-right rtl:text-left">{pct(b.avancement)}</span></div></td>
                                    <td className="px-2.5 py-2 text-right rtl:text-left text-slate-600 dark:text-dk-text-soft whitespace-nowrap">{b.nbMatelas ? `${b.nbFaits}/${b.nbMatelas}` : '—'}</td>
                                    <td className="px-2.5 py-2 text-right rtl:text-left whitespace-nowrap">
                                        <span className="text-slate-800 dark:text-dk-text font-semibold">{m1(b.consommeM)}</span>
                                        <span className="text-slate-400"> / {m1(b.prevuM)}</span>
                                        {b.manqueM > 0 && <div className="text-[10px] font-bold text-rose-600">−{m1(b.manqueM)} m</div>}
                                    </td>
                                    <td className="px-2.5 py-2 text-right rtl:text-left text-slate-600 dark:text-dk-text-soft">{b.mParPiece === null ? '—' : b.mParPiece.toFixed(3).replace('.', ',')}</td>
                                    <td className="px-2.5 py-2 text-right rtl:text-left text-slate-600 dark:text-dk-text-soft" title={b.efficience === null ? '' : `${tx(lang, { fr: 'chute', ar: 'الفاقد', en: 'waste' })} ${(100 - b.efficience).toFixed(1)} %`}>{b.efficience === null ? '—' : `${b.efficience.toFixed(1).replace('.', ',')}%`}</td>
                                    <td className="px-2.5 py-2"><div className="flex flex-wrap gap-1">{!ferme(b.statut) && <Alertes b={b} />}</div></td>
                                </tr>
                            ))}
                        </tbody>
                        {bilans.length > 0 && (
                            <tfoot className="bg-slate-50 dark:bg-dk-bg font-bold text-slate-800 dark:text-dk-text">
                                <tr>
                                    <td className="px-2.5 py-2" colSpan={3}>{tx(lang, { fr: 'Total (hors rejetés)', ar: 'المجموع (بدون المرفوض)', en: 'Total (excl. rejected)' })}</td>
                                    <td className="px-2.5 py-2 text-right rtl:text-left">{nb(t.commande)}</td>
                                    <td className="px-2.5 py-2 text-right rtl:text-left">{nb(t.coupe)}</td>
                                    <td className="px-2.5 py-2 text-right rtl:text-left text-amber-600">{nb(t.reste)}</td>
                                    <td className="px-2.5 py-2 text-[11px] text-slate-500">{t.commande > 0 ? pct(Math.min(1, t.coupe / t.commande)) : ''}</td>
                                    <td></td>
                                    <td className="px-2.5 py-2 text-right rtl:text-left whitespace-nowrap">{m1(t.consommeM)} <span className="text-slate-400 font-semibold">/ {m1(t.prevuM)}</span></td>
                                    <td colSpan={3}></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
                {!bilans.length && <p className="px-4 py-10 text-center text-[12px] text-slate-400">{tx(lang, { fr: 'Aucun ordre pour ce filtre.', ar: 'لا أمر لهذا المرشح.', en: 'No order for this filter.' })}</p>}
            </section>
        </div>
    );
}
