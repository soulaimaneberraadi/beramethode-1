/**
 * Le plan de coupe du jour, montre sur la page Chaines (et sur les ordres en cours).
 *
 *  - `PlanDuJour` : pour un modele sur une chaine, ce qu'il faut couper aujourd'hui (matelas, pieces,
 *    metres, minutes), jusqu'a quand ca couvre la chaine, et les matelas de chaque matiere ;
 *  - `PedidosChips` : les pedidos (L1, L2...) du modele sur la chaine, avec quantite et date d'export ;
 *  - `RythmeBloc` : ce que la salle coupe par jour face a ce que la chaine coud, et l'avance en jours ;
 *  - `LignePlanChaine` : le plan du jour en une ligne, pour la liste des ordres.
 *
 * Les decisions (quel etat, quel verdict) vivent dans `lib/coupeChainesVue.ts` (teste) ; ici, l'affichage.
 */
import React, { useState } from 'react';
import { AlertTriangle, Check, Factory, Pause, Scissors } from 'lucide-react';
import type { AppSettings } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import type { ChaineCoupe, MatiereJour, ModeleSurChaine, PedidoSurChaine } from '../../lib/coupeChaines';
import { heuresParJour, modeleEnCours, numerosVisibles, verdictAvance, vuePlan } from '../../lib/coupeChainesVue';
import { fmtN, jjmm, localeDe } from '../../lib/coupeFormat';

const fmtM = (n: number) => `${fmtN(n, n < 100 ? 1 : 0)} m`;

const PANNEAU = {
    orange: 'bg-orange-50 text-orange-900 border border-orange-200 dark:bg-orange-900/25 dark:text-orange-100 dark:border-orange-800',
    rose: 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-900/25 dark:text-rose-200 dark:border-rose-800',
    emeraude: 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-200 dark:border-emerald-800',
    ardoise: 'bg-slate-50 text-slate-600 border border-slate-200 dark:bg-dk-elevated dark:text-dk-text-soft dark:border-dk-border',
} as const;

/** Hook local : la langue, la fonction de traduction a trois langues et la locale des dates. */
function useTextes() {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const locale = localeDe(lang);
    /** « mer. 22/10 » : le jour de la semaine aide a se repérer. */
    const jourSemaine = (iso?: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }) : '');
    const jourCourt = (iso?: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: 'short' }) : '');
    return { L, jourSemaine, jourCourt };
}

/* ------------------------------------------------------------------ */
/* Pedidos                                                              */
/* ------------------------------------------------------------------ */

/** « L1 · 2 400 pcs · export 24/10 » : un pedido par puce ; en pause, barre et grisee. */
export function PedidosChips({ pedidos }: { pedidos: PedidoSurChaine[] }) {
    const { L } = useTextes();
    if (pedidos.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-1">
            {pedidos.map(p => {
                const date = jjmm(p.export);
                return (
                    <span
                        key={p.eventId}
                        className={`px-1.5 h-6 inline-flex items-center gap-1 rounded-md border text-[11px] tabular-nums ${p.enPause
                            ? 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-dk-bg dark:border-dk-border dark:text-dk-muted'
                            : 'bg-white border-slate-200 text-slate-600 dark:bg-dk-surface dark:border-dk-border dark:text-dk-text-soft'}`}
                    >
                        <span className={`inline-flex items-center gap-1 ${p.enPause ? 'line-through' : ''}`}>
                            {p.code && <b className={p.enPause ? '' : 'text-slate-800 dark:text-dk-text'}>{p.code}</b>}
                            {p.code && ' · '}{fmtN(p.quantite)} {L('pcs', 'ق', 'pcs')}
                            {date && <> · {L('export', 'تصدير', 'export')} {date}</>}
                        </span>
                        {p.enPause && <span className="inline-flex items-center gap-0.5 font-bold text-amber-700 dark:text-amber-400"><Pause className="w-3 h-3" />{L('pause', 'إيقاف', 'paused')}</span>}
                    </span>
                );
            })}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Plan du jour                                                         */
/* ------------------------------------------------------------------ */

/** Numeros de matelas : les premiers, puis « +N » qui ouvre le reste au toucher. */
function Numeros({ liste }: { liste: string[] }) {
    const [ouvert, setOuvert] = useState(false);
    const { visibles, reste, longue } = numerosVisibles(liste, ouvert);
    return (
        <span className="tabular-nums">
            {visibles.join(', ')}
            {longue && (
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setOuvert(v => !v); }}
                    aria-expanded={ouvert}
                    className="ml-1.5 px-2 h-7 min-w-[32px] inline-flex items-center justify-center rounded-md bg-white dark:bg-dk-bg border border-slate-300/70 dark:border-dk-border text-[11px] font-bold"
                >
                    {ouvert ? '−' : `+${reste}`}
                </button>
            )}
        </span>
    );
}

/** Une autre matiere (doublure, entretoile...) : « FO N° 1, 2 · 18 m · ~12 min ». */
function LigneMatiere({ a }: { a: MatiereJour }) {
    const { L } = useTextes();
    return (
        <p className="leading-relaxed" title={a.nom}>
            <b>{a.code}</b> {L('N°', 'رقم', 'No.')} <Numeros liste={a.numeros} />
            {a.metres > 0 && <span className="opacity-80"> · {fmtM(a.metres)}</span>}
            {a.minutes !== undefined && <span className="opacity-80"> · ~{fmtN(a.minutes)} min</span>}
        </p>
    );
}

/** Ce qu'il faut couper aujourd'hui pour un modele sur une chaine. `objectif` : les jours d'avance voulus. */
export function PlanDuJour({ x, objectif }: { x: ModeleSurChaine; objectif: number }) {
    const { L, jourSemaine } = useTextes();
    const vue = vuePlan(x);
    const p = x.planJour;
    const base = 'rounded-lg px-2.5 py-2 text-[12px]';
    const note = (cls: string, texte: React.ReactNode, icone?: React.ReactNode) => (
        <div className={`${base} ${cls} font-semibold flex items-start gap-1.5`}>{icone}<span className="min-w-0">{texte}</span></div>
    );

    if (vue === 'horsCoupe') return note(PANNEAU.ardoise, L('Pas d’ordre de coupe pour ce modèle', 'لا أمر قص لهذا الموديل', 'No cutting order for this model'));
    if (vue === 'pause') {
        const codes = x.pedidos.filter(d => d.enPause).map(d => d.code).filter(Boolean);
        return note(PANNEAU.ardoise, <>{L('En pause', 'إيقاف مؤقت', 'Paused')}{codes.length > 0 && <span className="font-normal"> · {codes.join(', ')}</span>}</>, <Pause className="w-3.5 h-3.5 shrink-0" />);
    }
    if (vue === 'plusTard') return note(PANNEAU.ardoise, <>{L('Rien avant le', 'لا شيء قبل', 'Nothing before')} {jourSemaine(x.commencerLe)}</>);
    if (vue === 'serieAbsente') return note(PANNEAU.orange, L('Attribuez des paquets à cette chaîne', 'أعطِ حزماً لهذه السلسلة', 'Assign bundles to this line'), <AlertTriangle className="w-3.5 h-3.5 shrink-0" />);
    if (vue === 'sansMatelas') return note(PANNEAU.orange, <>{fmtN(x.aCouperPieces)} {L('pcs à couper · pas de matelas calculés', 'ق للقص · لا مفرشات محسوبة', 'pcs to cut · no lays')}</>, <Scissors className="w-3.5 h-3.5 shrink-0" />);
    if (vue === 'toutCoupe') return note(PANNEAU.emeraude, L('Tout coupé pour cette chaîne', 'كل شيء مقصوص لهذه السلسلة', 'All cut for this line'), <Check className="w-3.5 h-3.5 shrink-0" />);
    if (vue === 'rien') {
        return note(PANNEAU.emeraude, <>
            {L('Rien à couper aujourd’hui', 'لا شيء للقص اليوم', 'Nothing to cut today')}
            {p.couvreJusqua && <span className="font-normal"> · {L('couverte jusqu’au', 'مغطّاة حتى', 'covered until')} {jourSemaine(p.couvreJusqua)}</span>}
        </>, <Check className="w-3.5 h-3.5 shrink-0" />);
    }

    // a_couper, ou manque : le plan existe (matelas, pieces...) et le manque s'ajoute en tete
    const manque = vue === 'manque';
    const n = p.matelas.length;
    const entete = [
        L('Aujourd’hui', 'اليوم', 'Today'),
        n > 0 ? L(`${n} matelas`, `${n} مفرشة`, `${n} lays`) : '',
        n > 0 ? `${fmtN(p.pieces)} ${L('pcs', 'ق', 'pcs')}` : '',
        p.metres > 0 ? `${p.sansLongueur > 0 ? '≥ ' : ''}${fmtM(p.metres)}` : '',
        p.minutes !== undefined ? `~${fmtN(p.minutes)} min` : '',
    ].filter(Boolean).join(' · ');
    return (
        <div className={`${base} ${manque ? PANNEAU.rose : PANNEAU.orange} space-y-1`}>
            {manque && (
                <p className="font-bold flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                        {(p.attenteReprise || 0) > 0
                            ? <>
                                {L(`Il manque ${fmtN(p.manque || 0)} pcs pour tenir ${fmtN(objectif, 1)} j`, `ينقص ${fmtN(p.manque || 0)} قطعة لتغطية ${fmtN(objectif, 1)} يوم`, `${fmtN(p.manque || 0)} pcs missing to hold ${fmtN(objectif, 1)} d`)}
                                <span className="font-normal"> · {L(`dont ${fmtN(p.attenteReprise || 0)} attendent la reprise du pedido en pause`, `منها ${fmtN(p.attenteReprise || 0)} تنتظر استئناف الـ pedido الموقوف`, `${fmtN(p.attenteReprise || 0)} of them wait for the paused pedido to resume`)}</span>
                            </>
                            : L(`Il manque ${fmtN(p.manque || 0)} pcs dans l’ordre pour tenir ${fmtN(objectif, 1)} j`, `ينقص ${fmtN(p.manque || 0)} قطعة في الأمر لتغطية ${fmtN(objectif, 1)} يوم`, `${fmtN(p.manque || 0)} pcs missing in the order to hold ${fmtN(objectif, 1)} d`)}
                    </span>
                </p>
            )}
            {n > 0 && (
                <>
                    <p className="font-bold flex items-start gap-1.5">
                        <Scissors className="w-3.5 h-3.5 shrink-0 mt-0.5" />{entete}
                    </p>
                    {p.couvreJusqua && <p className="opacity-80">{L('couvre jusqu’au', 'تكفي حتى', 'covers until')} {jourSemaine(p.couvreJusqua)}</p>}
                    <p className="leading-relaxed"><b>{L('Tissu', 'القماش', 'Fabric')}</b> {L('N°', 'رقم', 'No.')} <Numeros liste={p.matelas.map(l => l.numero)} /></p>
                    {p.autres.map(a => <LigneMatiere key={a.id} a={a} />)}
                </>
            )}
            {manque && n === 0 && p.couvreJusqua && <p className="opacity-80">{L('couvre jusqu’au', 'تكفي حتى', 'covers until')} {jourSemaine(p.couvreJusqua)}</p>}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Rythme et avance                                                     */
/* ------------------------------------------------------------------ */

const VERDICT = {
    avance: { texte: 'text-emerald-700 dark:text-emerald-400', barre: 'bg-emerald-500' },
    juste: { texte: 'text-amber-700 dark:text-amber-400', barre: 'bg-amber-500' },
    arret: { texte: 'text-rose-700 dark:text-rose-400', barre: 'bg-rose-500' },
} as const;

/**
 * Sous l'entete d'une chaine : « Coupe 420 p/j · Chaîne 500 p/j (réel) », l'alerte si la coupe est plus lente,
 * et l'avance de la coupe en jours face a l'objectif. Rien si la chaine n'a pas de modele coupable.
 * `encadre` : seul, dans sa propre carte (page de detail) ; sinon il se glisse sous l'entete d'une carte de chaine.
 */
export function RythmeBloc({ chaine, joursAvance, settings, encadre }: { chaine: ChaineCoupe; joursAvance: number; settings?: AppSettings; encadre?: boolean }) {
    const { L, jourCourt } = useTextes();
    const x = modeleEnCours(chaine);
    const r = chaine.rythme;
    if (!x || !x.aUnOrdre || x.enPause) return null;
    if (!(r.chaineParJour > 0) && r.coupeParJour === undefined) return null;

    const source = r.source === 'manuel' ? L('réglé', 'مضبوط', 'set') : r.source === 'suivi' ? L('réel', 'فعلي', 'actual') : L('plan', 'مخطط', 'plan');
    const plusLente = r.coupeParJour !== undefined && r.chaineParJour > 0 && r.coupeParJour < r.chaineParJour;
    const v = x.plusTard ? null : verdictAvance(x.joursAvance, joursAvance, heuresParJour(settings));
    const lance = x.joursAvantLancement === null || x.joursAvantLancement <= 0;

    let mots = '';
    if (v) {
        if (v.niveau === 'avance') mots = L(`Coupe en avance de ${fmtN(v.jours, 1)} j`, `القص متقدّم بـ ${fmtN(v.jours, 1)} يوم`, `Cutting ${fmtN(v.jours, 1)} d ahead`);
        else if (v.niveau === 'juste') mots = lance ? L('Juste', 'على الحدّ', 'Tight') : L('Juste pour le lancement', 'على الحدّ للانطلاق', 'Tight for the start');
        else if (!lance) mots = L(`Pas assez coupé pour le lancement du ${jourCourt(x.lancement)}`, `المقصوص لا يكفي لانطلاق ${jourCourt(x.lancement)}`, `Not enough cut for the ${jourCourt(x.lancement)} start`);
        else if (v.heures <= 0) mots = L('La chaîne n’a plus de pièces coupées', 'لا قطع مقصوصة للسلسلة', 'The line has no cut pieces left');
        else if (v.heures < 1) mots = L('La chaîne s’arrête dans moins d’1 h', 'ستتوقف السلسلة خلال أقل من ساعة', 'The line stops in under 1 h');
        else { const h = Math.round(v.heures); mots = L(`La chaîne s’arrête dans ${h} h`, `ستتوقف السلسلة خلال ${h} ساعة`, `The line stops in ${h} h`); }
    }

    return (
        <div className={`px-3 sm:px-4 py-2 space-y-1.5 ${encadre ? 'bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border' : 'border-b border-slate-100 dark:border-dk-border'}`}>
            <p className="text-[11px] text-slate-500 dark:text-dk-muted tabular-nums">
                {L('Coupe', 'القص', 'Cut')} <b className="text-slate-700 dark:text-dk-text-soft">{r.coupeParJour !== undefined ? `${fmtN(r.coupeParJour)} ${L('p/j', 'ق/يوم', 'p/d')}` : '—'}</b>
                {' · '}{L('Chaîne', 'السلسلة', 'Line')} <b className="text-slate-700 dark:text-dk-text-soft">{r.chaineParJour > 0 ? `${fmtN(r.chaineParJour)} ${L('p/j', 'ق/يوم', 'p/d')}` : '—'}</b>
                {r.chaineParJour > 0 && <> ({source})</>}
            </p>
            {plusLente && (
                <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />{L('La coupe va moins vite que la chaîne', 'القص أبطأ من السلسلة', 'Cutting is slower than the line')}
                </p>
            )}
            {v && (
                <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-[12px] font-bold ${VERDICT[v.niveau].texte}`}>{mots}</span>
                        <span className="text-[10px] tabular-nums text-slate-500 dark:text-dk-muted shrink-0">{fmtN(v.jours, 1)} / {fmtN(joursAvance, 1)} {L('j', 'ي', 'd')}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-dk-elevated overflow-hidden">
                        <div className={`h-full rounded-full ${VERDICT[v.niveau].barre}`} style={{ width: `${Math.round(v.part * 100)}%` }} />
                    </div>
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Une ligne pour la liste des ordres                                   */
/* ------------------------------------------------------------------ */

/** « CHAINE 1 · aujourd'hui 3 mat. · 480 pcs » : le plan du jour d'une chaine, sur une ligne, sans liste de numeros. */
export function LignePlanChaine({ chaine, x }: { chaine: ChaineCoupe; x: ModeleSurChaine }) {
    const { L, jourCourt } = useTextes();
    const vue = vuePlan(x);
    const p = x.planJour;
    const n = p.matelas.length;
    const coupe = `${L('aujourd’hui', 'اليوم', 'today')} ${n} ${L('mat.', 'مفرشة', 'lays')} · ${fmtN(p.pieces)} ${L('pcs', 'ق', 'pcs')}`;

    let cls: string = PANNEAU.ardoise;
    let texte = '';
    let icone = <Factory className="w-3 h-3 shrink-0" />;
    if (vue === 'a_couper') { cls = PANNEAU.orange; texte = coupe; icone = <Scissors className="w-3 h-3 shrink-0" />; }
    else if (vue === 'manque') {
        cls = PANNEAU.rose; icone = <AlertTriangle className="w-3 h-3 shrink-0" />;
        texte = `${n > 0 ? `${coupe} · ` : ''}${L('manque', 'ينقص', 'short')} ${fmtN(p.manque || 0)} ${L('pcs', 'ق', 'pcs')}`;
    }
    else if (vue === 'rien') { cls = PANNEAU.emeraude; texte = L('rien aujourd’hui', 'لا شيء اليوم', 'nothing today'); icone = <Check className="w-3 h-3 shrink-0" />; }
    else if (vue === 'toutCoupe') { cls = PANNEAU.emeraude; texte = L('tout coupé', 'كل شيء مقصوص', 'all cut'); icone = <Check className="w-3 h-3 shrink-0" />; }
    else if (vue === 'pause') { texte = L('en pause', 'إيقاف مؤقت', 'paused'); icone = <Pause className="w-3 h-3 shrink-0" />; }
    else if (vue === 'plusTard') texte = `${L('rien avant le', 'لا شيء قبل', 'nothing before')} ${jourCourt(x.commencerLe)}`;
    else if (vue === 'serieAbsente') { cls = PANNEAU.orange; texte = L('paquets non attribués', 'حزم غير معطاة', 'bundles not assigned'); icone = <AlertTriangle className="w-3 h-3 shrink-0" />; }
    else if (vue === 'sansMatelas') { cls = PANNEAU.orange; texte = `${fmtN(x.aCouperPieces)} ${L('pcs · pas de matelas', 'ق · لا مفرشات', 'pcs · no lays')}`; icone = <Scissors className="w-3 h-3 shrink-0" />; }
    else texte = L('sans ordre de coupe', 'بلا أمر قص', 'no cutting order');

    return (
        <span className={`px-1.5 min-h-[20px] py-0.5 inline-flex items-center gap-1 rounded text-[10px] font-bold tabular-nums ${cls}`}>
            {icone}<span className="min-w-0">{chaine.nom} · {texte}</span>
        </span>
    );
}
