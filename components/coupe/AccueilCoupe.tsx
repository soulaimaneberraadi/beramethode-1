/**
 * Accueil de La Coupe : trois cartes, et derriere chacune une page.
 *
 *  - Ordres en cours : les ordres de coupe pas encore soldes.
 *  - Groupes presents : les groupes de coupe, leur presence (pointage RH),
 *    ce qu'ils ont coupe, en combien de temps, et leur classement. Chaque
 *    matelas chronometre alimente une base de temps qui servira plus tard
 *    de catalogue de temps des matelas.
 *  - Tissu : prevu, consomme, recu, pour n'importe quel modele.
 *
 * Les calculs vivent dans `lib/coupeAtelier.ts` (testes) ; ici, l'affichage.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft, Scissors, Users, Layers, Search, Plus, Trash2, Edit3, Check, X,
    RefreshCw, Trophy, Clock, Building2, ChevronRight, AlertTriangle,
} from 'lucide-react';
import type { GroupeCoupe, ModelData } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import {
    aujourdhui, consoTissu, estAuTravail, estOuvert, matelasExecutes, presenceGroupes,
    resumerOrdre, statsGroupes, type OuvrierRh, type PointageRh, type PresenceGroupe, type StatutPresence,
} from '../../lib/coupeAtelier';

export type PageAccueil = 'ordres' | 'groupes' | 'tissu';

/* ------------------------------------------------------------------ */
/* Formats                                                              */
/* ------------------------------------------------------------------ */

const fmtN = (n: number, dec = 0) => n.toLocaleString(undefined, { maximumFractionDigits: dec, minimumFractionDigits: 0 });
const fmtM = (n: number) => `${fmtN(n, n < 100 ? 1 : 0)} m`;
const heureDe = (iso: string | null | undefined) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const jourDe = (iso: string | null | undefined) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const fmtDuree = (min: number | null) => {
    if (min === null) return '—';
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
};

/* ------------------------------------------------------------------ */
/* Pointage RH du jour                                                  */
/* ------------------------------------------------------------------ */

export type EtatRh = 'chargement' | 'ok' | 'refuse' | 'erreur';

/**
 * Ouvriers et pointage du jour. Meme appel en local et sur Vercel : en mode
 * statique, l'intercepteur repond depuis le cache (et ignore le filtre de
 * date, d'ou le filtrage refait dans `presenceGroupes`).
 */
export function useRhDuJour() {
    const [ouvriers, setOuvriers] = useState<OuvrierRh[]>([]);
    const [pointage, setPointage] = useState<PointageRh[]>([]);
    const [etat, setEtat] = useState<EtatRh>('chargement');
    const date = aujourdhui();

    const charger = useCallback(async () => {
        setEtat('chargement');
        try {
            const [rw, rp] = await Promise.all([
                fetch('/api/hr/workers', { credentials: 'include' }),
                fetch(`/api/hr/pointage?date=${date}`, { credentials: 'include' }),
            ]);
            if (rw.status === 401 || rw.status === 403 || rp.status === 401 || rp.status === 403) { setEtat('refuse'); return; }
            if (!rw.ok || !rp.ok) { setEtat('erreur'); return; }
            const w = await rw.json();
            const p = await rp.json();
            setOuvriers((Array.isArray(w) ? w : []).filter((o: OuvrierRh) => o && o.is_active !== false && o.is_active !== 0));
            setPointage(Array.isArray(p) ? p : []);
            setEtat('ok');
        } catch {
            setEtat('erreur');
        }
    }, [date]);

    useEffect(() => { charger(); }, [charger]);
    return { ouvriers, pointage, etat, date, recharger: charger };
}

/* ------------------------------------------------------------------ */
/* Petits morceaux reutilises                                           */
/* ------------------------------------------------------------------ */

/** Heure HH:MM tapee au clavier numerique, sans le selecteur du navigateur. */
export function ChampHeure({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
    const { lang } = useLang();
    const saisir = (brut: string) => {
        const chiffres = brut.replace(/\D/g, '').slice(0, 4);
        onChange(chiffres.length > 2 ? `${chiffres.slice(0, 2)}:${chiffres.slice(2)}` : chiffres);
    };
    const maintenant = () => onChange(heureDe(new Date().toISOString()));
    return (
        <div className="flex-1 min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted mb-1">{label}</span>
            <div className="flex items-center gap-1 h-10 px-2 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg focus-within:border-indigo-400 focus-within:bg-white dark:focus-within:bg-dk-surface transition-colors">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                    type="text"
                    inputMode="numeric"
                    value={value}
                    onChange={e => saisir(e.target.value)}
                    placeholder="08:30"
                    className="w-full min-w-0 bg-transparent text-[14px] font-semibold tabular-nums text-slate-800 dark:text-dk-text outline-none placeholder:text-slate-300"
                />
                <button type="button" onClick={maintenant} className="shrink-0 h-7 px-2 rounded-md text-[10px] font-bold text-indigo-600 dark:text-dk-accent-text hover:bg-indigo-50 dark:hover:bg-dk-accent/20">
                    {tx(lang, { fr: 'Maint.', ar: 'الآن', en: 'Now', es: 'Ahora' })}
                </button>
            </div>
        </div>
    );
}

/** HH:MM valide -> ISO a la date de `jour` (heure locale). null si la saisie est incomplete. */
export const isoDepuisHeure = (hhmm: string, jour: Date = new Date()): string | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    const d = new Date(jour);
    d.setHours(h, mi, 0, 0);
    return d.toISOString();
};

export const heureLocale = heureDe;

/** Pastilles de choix du groupe : grandes cibles pour le doigt, pas de liste deroulante. */
export function ChoixGroupe({ groupes, value, onChange }: { groupes: GroupeCoupe[]; value: string | undefined; onChange: (id: string) => void }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {groupes.map(g => (
                <button
                    key={g.id}
                    type="button"
                    onClick={() => onChange(g.id)}
                    className={`h-10 px-2 rounded-lg border text-[12px] font-semibold truncate transition-colors ${value === g.id
                        ? 'bg-slate-900 dark:bg-dk-accent border-slate-900 dark:border-dk-accent text-white'
                        : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-700 dark:text-dk-text-soft hover:border-slate-400'}`}
                >
                    {g.nom}
                </button>
            ))}
        </div>
    );
}

const STATUTS: Record<StatutPresence, { fr: string; ar: string; en: string; point: string }> = {
    PRESENT: { fr: 'Présent', ar: 'حاضر', en: 'Present', point: 'bg-emerald-500' },
    RETARD: { fr: 'Retard', ar: 'متأخر', en: 'Late', point: 'bg-amber-500' },
    ABSENT: { fr: 'Absent', ar: 'غائب', en: 'Absent', point: 'bg-rose-500' },
    CONGE: { fr: 'Congé', ar: 'عطلة', en: 'Leave', point: 'bg-sky-500' },
    MALADIE: { fr: 'Maladie', ar: 'مرض', en: 'Sick', point: 'bg-violet-500' },
    MISSION: { fr: 'Mission', ar: 'مهمة', en: 'Mission', point: 'bg-slate-400' },
    FERIE: { fr: 'Férié', ar: 'عطلة رسمية', en: 'Holiday', point: 'bg-slate-400' },
    NON_POINTE: { fr: 'Non pointé', ar: 'لم يُسجَّل', en: 'Not clocked', point: 'bg-slate-300' },
};

const STATUTS_ORDRE: Record<string, { fr: string; ar: string; en: string; cls: string }> = {
    EN_PREPARATION: { fr: 'Préparation', ar: 'تحضير', en: 'Preparation', cls: 'bg-slate-100 text-slate-600 dark:bg-dk-elevated dark:text-dk-muted' },
    EN_COURS: { fr: 'En cours', ar: 'قيد التنفيذ', en: 'In progress', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    SOUS_TRAITANCE: { fr: 'Sous-traitance', ar: 'مناولة', en: 'Subcontract', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    VALIDE: { fr: 'Soldé', ar: 'منتهٍ', en: 'Closed', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    REJETE: { fr: 'Rejeté', ar: 'مرفوض', en: 'Rejected', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
};

function EnTetePage({ titre, sousTitre, onBack, actions }: { titre: string; sousTitre?: string; onBack: () => void; actions?: React.ReactNode }) {
    const { lang } = useLang();
    return (
        <div className="flex items-center gap-2 mb-4">
            <button
                type="button"
                onClick={onBack}
                className="h-10 pl-2 pr-3 inline-flex items-center gap-1.5 rounded-lg text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:hover:bg-dk-elevated shrink-0"
            >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{tx(lang, { fr: 'Accueil', ar: 'الرئيسية', en: 'Home', es: 'Inicio' })}</span>
            </button>
            <div className="w-px h-6 bg-slate-200 dark:bg-dk-border shrink-0" />
            <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-semibold text-slate-900 dark:text-dk-text truncate">{titre}</h2>
                {sousTitre && <p className="text-[11px] text-slate-500 dark:text-dk-muted truncate">{sousTitre}</p>}
            </div>
            {actions}
        </div>
    );
}

function Resume({ items }: { items: { label: string; valeur: string; ton?: string }[] }) {
    return (
        <div className="grid grid-cols-3 gap-2 mb-4">
            {items.map(it => (
                <div key={it.label} className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border px-3 py-2.5 min-w-0">
                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted truncate">{it.label}</p>
                    <p className={`text-[15px] sm:text-[18px] font-bold tabular-nums truncate ${it.ton || 'text-slate-800 dark:text-dk-text'}`}>{it.valeur}</p>
                </div>
            ))}
        </div>
    );
}

function Onglets<T extends string>({ valeur, options, onChange }: { valeur: T; options: { id: NoInfer<T>; label: string }[]; onChange: (v: NoInfer<T>) => void }) {
    return (
        <div className="flex items-center bg-slate-100 dark:bg-dk-elevated rounded-lg p-0.5 gap-0.5 overflow-x-auto no-scrollbar">
            {options.map(o => (
                <button
                    key={o.id}
                    type="button"
                    onClick={() => onChange(o.id)}
                    className={`h-8 px-3 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors ${valeur === o.id ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Cartes                                                               */
/* ------------------------------------------------------------------ */

function Carte({ label, valeur, sous, icon: Icon, couleur, onClick }: {
    label: string; valeur: string; sous: string; icon: any; couleur: string; onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="text-left bg-white dark:bg-dk-surface rounded-lg sm:rounded-xl border border-slate-200 dark:border-dk-border p-2.5 sm:p-4 hover:border-slate-300 hover:shadow-md dark:hover:shadow-dk-md transition-all group min-w-0"
        >
            <div className="flex items-center justify-between mb-1.5 sm:mb-2 gap-1">
                <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide truncate">{label}</span>
                <div className={`w-6 h-6 sm:w-8 sm:h-8 shrink-0 ${couleur} rounded-md sm:rounded-lg flex items-center justify-center`}>
                    <Icon className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                </div>
            </div>
            <div className="text-base sm:text-2xl font-bold text-slate-800 dark:text-dk-text tabular-nums truncate">{valeur}</div>
            <div className="flex items-center justify-between gap-1 mt-0.5">
                <span className="text-[9px] sm:text-[11px] text-slate-500 dark:text-dk-muted truncate">{sous}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 shrink-0 hidden sm:block" />
            </div>
        </button>
    );
}

export function CartesAccueil({ models, groupes, presence, etatRh, onOuvrir }: {
    models: ModelData[];
    groupes: GroupeCoupe[];
    presence: PresenceGroupe[];
    etatRh: EtatRh;
    onOuvrir: (p: PageAccueil) => void;
}) {
    const { lang } = useLang();
    const ouverts = models.filter(estOuvert);
    const aCouper = ouverts.reduce((s, m) => s + resumerOrdre(m).aCouper, 0);
    const conso = ouverts.map(consoTissu);
    const consomme = conso.reduce((s, c) => s + c.consommeM, 0);
    const prevu = conso.reduce((s, c) => s + c.prevuM, 0);
    const presents = presence.filter(p => p.estPresent).length;
    const ouvriersPresents = presence.reduce((s, p) => s + p.presents, 0);

    const sousGroupes = groupes.length === 0
        ? tx(lang, { fr: 'Créer les groupes', ar: 'أنشئ المجموعات', en: 'Create groups' })
        : etatRh === 'refuse' ? tx(lang, { fr: 'Accès RH requis', ar: 'يلزم إذن الموارد البشرية', en: 'HR access needed' })
            : etatRh === 'chargement' ? '…'
                : `${ouvriersPresents} ${tx(lang, { fr: 'ouvriers au travail', ar: 'عامل حاضر', en: 'workers in' })}`;

    return (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Carte
                label={tx(lang, { fr: 'Ordres en cours', ar: 'أوامر جارية', en: 'Open orders', es: 'Órdenes abiertas' })}
                valeur={fmtN(ouverts.length)}
                sous={`${fmtN(aCouper)} ${tx(lang, { fr: 'pcs à couper', ar: 'قطعة للقص', en: 'pcs to cut' })}`}
                icon={Scissors} couleur="bg-rose-500"
                onClick={() => onOuvrir('ordres')}
            />
            <Carte
                label={tx(lang, { fr: 'Groupes présents', ar: 'المجموعات الحاضرة', en: 'Groups present', es: 'Grupos presentes' })}
                valeur={groupes.length === 0 ? '—' : `${presents}/${groupes.length}`}
                sous={sousGroupes}
                icon={Users} couleur="bg-emerald-500"
                onClick={() => onOuvrir('groupes')}
            />
            <Carte
                label={tx(lang, { fr: 'Tissu consommé', ar: 'الثوب المستهلك', en: 'Fabric used', es: 'Tejido consumido' })}
                valeur={fmtM(consomme)}
                sous={`${tx(lang, { fr: 'sur', ar: 'من', en: 'of' })} ${fmtM(prevu)} ${tx(lang, { fr: 'prévus', ar: 'مقرّرة', en: 'planned' })}`}
                icon={Layers} couleur="bg-indigo-500"
                onClick={() => onOuvrir('tissu')}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Page : ordres en cours                                               */
/* ------------------------------------------------------------------ */

export function PageOrdres({ models, onBack, onOpen }: { models: ModelData[]; onBack: () => void; onOpen: (m: ModelData) => void }) {
    const { lang } = useLang();
    const [filtre, setFiltre] = useState<'TOUS' | 'EN_PREPARATION' | 'EN_COURS' | 'SOUS_TRAITANCE'>('TOUS');
    const [q, setQ] = useState('');

    const lignes = useMemo(() => models.filter(estOuvert).map(m => ({ m, r: resumerOrdre(m) })), [models]);
    const visibles = lignes
        .filter(x => filtre === 'TOUS' || x.r.statut === filtre)
        .filter(x => !q.trim() || `${x.r.nom} ${x.r.client} ${x.r.type}`.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => b.r.aCouper - a.r.aCouper);
    const totalACouper = lignes.reduce((s, x) => s + x.r.aCouper, 0);
    const totalCoupees = lignes.reduce((s, x) => s + x.r.coupees, 0);

    return (
        <div>
            <EnTetePage
                titre={tx(lang, { fr: 'Ordres en cours', ar: 'الأوامر الجارية', en: 'Open orders' })}
                sousTitre={tx(lang, { fr: 'Tous les ordres de coupe pas encore soldés', ar: 'كل أوامر القص التي لم تُصفَّ بعد', en: 'Every cutting order not closed yet' })}
                onBack={onBack}
            />
            <Resume items={[
                { label: tx(lang, { fr: 'Ordres', ar: 'أوامر', en: 'Orders' }), valeur: fmtN(lignes.length) },
                { label: tx(lang, { fr: 'À couper', ar: 'للقص', en: 'To cut' }), valeur: fmtN(totalACouper), ton: 'text-rose-600 dark:text-rose-400' },
                { label: tx(lang, { fr: 'Coupées', ar: 'مقصوصة', en: 'Cut' }), valeur: fmtN(totalCoupees), ton: 'text-emerald-600 dark:text-emerald-400' },
            ]} />
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <Onglets valeur={filtre} onChange={setFiltre} options={[
                    { id: 'TOUS', label: tx(lang, { fr: 'Tous', ar: 'الكل', en: 'All' }) },
                    { id: 'EN_PREPARATION', label: tx(lang, STATUTS_ORDRE.EN_PREPARATION) },
                    { id: 'EN_COURS', label: tx(lang, STATUTS_ORDRE.EN_COURS) },
                    { id: 'SOUS_TRAITANCE', label: tx(lang, STATUTS_ORDRE.SOUS_TRAITANCE) },
                ]} />
                <label className="flex-1 flex items-center gap-2 h-9 px-3 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder={tx(lang, { fr: 'Modèle, client, type…', ar: 'موديل، زبون، نوع…', en: 'Model, client, type…' })} className="flex-1 min-w-0 bg-transparent text-[12px] outline-none" />
                </label>
            </div>

            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border divide-y divide-slate-100 dark:divide-dk-border overflow-hidden">
                {visibles.length === 0 && (
                    <p className="text-center text-[12px] text-slate-400 py-10">{tx(lang, { fr: 'Aucun ordre ouvert', ar: 'لا توجد أوامر جارية', en: 'No open order' })}</p>
                )}
                {visibles.map(({ m, r }) => {
                    const st = STATUTS_ORDRE[r.statut] || STATUTS_ORDRE.EN_PREPARATION;
                    return (
                        <button key={m.id} type="button" onClick={() => onOpen(m)} className="w-full text-left px-3 sm:px-4 py-3 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-dk-elevated shrink-0 flex items-center justify-center">
                                    {m.image || m.images?.front
                                        ? <img src={m.image || m.images?.front || ''} alt="" className="w-full h-full object-cover" />
                                        : <Scissors className="w-4 h-4 text-slate-300" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-[13px] font-semibold text-slate-800 dark:text-dk-text truncate">{r.nom}</span>
                                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${st.cls}`}>{tx(lang, st)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-dk-muted min-w-0">
                                        {r.client && <><Building2 className="w-3 h-3 shrink-0 opacity-60" /><span className="truncate">{r.client}</span></>}
                                        {r.type && <span className="shrink-0 px-1 rounded bg-slate-100 dark:bg-dk-elevated text-[9px] font-bold uppercase">{r.type}</span>}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[14px] font-bold tabular-nums text-rose-600 dark:text-rose-400">{fmtN(r.aCouper)}</p>
                                    <p className="text-[9px] text-slate-400 uppercase font-bold">{tx(lang, { fr: 'à couper', ar: 'للقص', en: 'to cut' })}</p>
                                </div>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round(r.avancement * 100)}%` }} />
                                </div>
                                <span className="text-[10px] tabular-nums text-slate-500 dark:text-dk-muted shrink-0">
                                    {fmtN(r.coupees)} / {fmtN(r.qte || r.coupees + r.aCouper)} · {r.nbFaits}/{r.nbMatelas} {tx(lang, { fr: 'matelas', ar: 'مفرشة', en: 'lays' })}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Page : tissu                                                         */
/* ------------------------------------------------------------------ */

export function PageTissu({ models, onBack, onOpen }: { models: ModelData[]; onBack: () => void; onOpen: (m: ModelData) => void }) {
    const { lang } = useLang();
    const [portee, setPortee] = useState<'ouverts' | 'tous'>('ouverts');
    const [q, setQ] = useState('');

    const lignes = useMemo(() =>
        models.filter(m => portee === 'tous' || estOuvert(m)).map(m => ({ m, c: consoTissu(m) })),
    [models, portee]);
    const visibles = lignes
        .filter(x => !q.trim() || `${x.c.nom} ${x.c.client} ${x.c.type}`.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => b.c.prevuM - a.c.prevuM);
    const prevu = lignes.reduce((s, x) => s + x.c.prevuM, 0);
    const consomme = lignes.reduce((s, x) => s + x.c.consommeM, 0);

    return (
        <div>
            <EnTetePage
                titre={tx(lang, { fr: 'Consommation tissu', ar: 'استهلاك الثوب', en: 'Fabric consumption' })}
                sousTitre={tx(lang, { fr: 'Calculée sur les matelas : plis × longueur tracée + amorce', ar: 'محسوبة من المفرشات: الطيات × الطول المرسوم + الهامش', en: 'From the lays: plies × traced length + allowance' })}
                onBack={onBack}
            />
            <Resume items={[
                { label: tx(lang, { fr: 'Prévu', ar: 'المقرّر', en: 'Planned' }), valeur: fmtM(prevu) },
                { label: tx(lang, { fr: 'Consommé', ar: 'المستهلك', en: 'Used' }), valeur: fmtM(consomme), ton: 'text-indigo-600 dark:text-indigo-400' },
                { label: tx(lang, { fr: 'Reste', ar: 'الباقي', en: 'Left' }), valeur: fmtM(Math.max(0, prevu - consomme)) },
            ]} />
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <Onglets valeur={portee} onChange={setPortee} options={[
                    { id: 'ouverts', label: tx(lang, { fr: 'Ordres en cours', ar: 'الجارية', en: 'Open' }) },
                    { id: 'tous', label: tx(lang, { fr: 'Tous les modèles', ar: 'كل الموديلات', en: 'All models' }) },
                ]} />
                <label className="flex-1 flex items-center gap-2 h-9 px-3 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder={tx(lang, { fr: 'Chercher un modèle…', ar: 'ابحث عن موديل…', en: 'Find a model…' })} className="flex-1 min-w-0 bg-transparent text-[12px] outline-none" />
                </label>
            </div>

            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border divide-y divide-slate-100 dark:divide-dk-border overflow-hidden">
                {visibles.length === 0 && (
                    <p className="text-center text-[12px] text-slate-400 py-10">{tx(lang, { fr: 'Aucun modèle', ar: 'لا توجد موديلات', en: 'No model' })}</p>
                )}
                {visibles.map(({ m, c }) => {
                    const part = c.prevuM > 0 ? Math.min(1, c.consommeM / c.prevuM) : 0;
                    const manque = c.ecartRecuM !== null && c.ecartRecuM < 0;
                    return (
                        <button key={m.id} type="button" onClick={() => onOpen(m)} className="w-full text-left px-3 sm:px-4 py-3 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-slate-800 dark:text-dk-text truncate">{c.nom}</p>
                                    <p className="text-[11px] text-slate-500 dark:text-dk-muted truncate">{[c.client, c.type].filter(Boolean).join(' · ') || '—'}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[14px] font-bold tabular-nums text-slate-800 dark:text-dk-text">{fmtM(c.consommeM)}</p>
                                    <p className="text-[10px] text-slate-400 tabular-nums">/ {fmtM(c.prevuM)}</p>
                                </div>
                            </div>
                            <div className="mt-2 h-1.5 bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round(part * 100)}%` }} />
                            </div>
                            <div className="mt-1.5 grid grid-cols-3 gap-2 text-[10px] tabular-nums">
                                <span className="text-slate-500 dark:text-dk-muted">
                                    {tx(lang, { fr: 'Reçu', ar: 'المستلم', en: 'Received' })}: <b className="text-slate-700 dark:text-dk-text-soft">{c.recuM === null ? '—' : fmtM(c.recuM)}</b>
                                </span>
                                <span className={manque ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-500 dark:text-dk-muted'}>
                                    {c.ecartRecuM === null ? '' : manque
                                        ? `${tx(lang, { fr: 'Manque', ar: 'ناقص', en: 'Short' })} ${fmtM(-c.ecartRecuM)}`
                                        : `${tx(lang, { fr: 'Surplus', ar: 'فائض', en: 'Surplus' })} ${fmtM(c.ecartRecuM)}`}
                                </span>
                                <span className="text-right text-slate-500 dark:text-dk-muted">
                                    {c.mParPiece === null ? '' : `${fmtN(c.mParPiece * 100, 1)} cm/${tx(lang, { fr: 'pc', ar: 'قطعة', en: 'pc' })}`}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Page : groupes                                                       */
/* ------------------------------------------------------------------ */

type Periode = 'jour' | '7j' | '30j' | 'tout';
const debutPeriode = (p: Periode): number | undefined => {
    if (p === 'tout') return undefined;
    const d = new Date();
    if (p === 'jour') { d.setHours(0, 0, 0, 0); return d.getTime(); }
    return Date.now() - (p === '7j' ? 7 : 30) * 24 * 3600 * 1000;
};

function EditeurGroupe({ initial, ouvriers, autres, onSave, onCancel }: {
    initial: GroupeCoupe | null;
    ouvriers: OuvrierRh[];
    /** Membres deja pris par un autre groupe : un ouvrier n'etale que dans un groupe. */
    autres: Map<string, string>;
    onSave: (g: GroupeCoupe) => void;
    onCancel: () => void;
}) {
    const { lang } = useLang();
    const [nom, setNom] = useState(initial?.nom || '');
    const [membres, setMembres] = useState<string[]>(initial?.membres || []);
    const [q, setQ] = useState('');
    const tries = useMemo(() => [...ouvriers].sort((a, b) =>
        Number(b.role === 'CUTTER') - Number(a.role === 'CUTTER') || String(a.full_name || '').localeCompare(String(b.full_name || ''))), [ouvriers]);
    const visibles = tries.filter(o => !q.trim() || `${o.full_name} ${o.matricule}`.toLowerCase().includes(q.trim().toLowerCase()));
    const basculer = (id: string) => setMembres(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    return (
        <div className="bg-white dark:bg-dk-surface rounded-xl border-2 border-indigo-200 dark:border-dk-accent/40 p-3 sm:p-4 space-y-3">
            <input
                autoFocus
                value={nom}
                onChange={e => setNom(e.target.value)}
                placeholder={tx(lang, { fr: 'Nom du groupe (ex : Groupe 1)', ar: 'اسم المجموعة (مثال: المجموعة 1)', en: 'Group name (e.g. Group 1)' })}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg text-[13px] font-semibold outline-none focus:border-indigo-400"
            />
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{tx(lang, { fr: 'Membres', ar: 'الأعضاء', en: 'Members' })} · {membres.length}</span>
                </div>
                <label className="flex items-center gap-2 h-9 px-3 mb-1.5 rounded-lg bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder={tx(lang, { fr: 'Chercher un ouvrier…', ar: 'ابحث عن عامل…', en: 'Find a worker…' })} className="flex-1 min-w-0 bg-transparent text-[12px] outline-none" />
                </label>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 dark:border-dk-border divide-y divide-slate-100 dark:divide-dk-border">
                    {visibles.length === 0 && (
                        <p className="text-[11px] text-slate-400 text-center py-4">{tx(lang, { fr: 'Aucun ouvrier dans la RH', ar: 'لا يوجد عمّال في الموارد البشرية', en: 'No worker in HR' })}</p>
                    )}
                    {visibles.map(o => {
                        const id = String(o.id);
                        const pris = autres.get(id);
                        const coche = membres.includes(id);
                        return (
                            <button key={id} type="button" onClick={() => basculer(id)} className="w-full flex items-center gap-2.5 h-10 px-2.5 text-left hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                <span className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center shrink-0 ${coche ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-dk-border'}`}>
                                    {coche && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                </span>
                                <span className="flex-1 min-w-0 text-[12px] font-medium text-slate-700 dark:text-dk-text truncate">{o.full_name || id}</span>
                                {o.role === 'CUTTER' && <span className="shrink-0 px-1.5 rounded bg-orange-50 dark:bg-orange-900/30 text-orange-600 text-[9px] font-bold">{tx(lang, { fr: 'Coupeur', ar: 'قصّاص', en: 'Cutter' })}</span>}
                                {pris && !coche && <span className="shrink-0 text-[9px] text-amber-600 truncate max-w-[90px]">{pris}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="h-9 px-4 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-dk-elevated">{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel' })}</button>
                <button
                    type="button"
                    disabled={!nom.trim()}
                    onClick={() => onSave({ id: initial?.id || `grp_${Date.now().toString(36)}`, nom: nom.trim(), membres })}
                    className="h-9 px-4 rounded-lg text-[12px] font-semibold bg-slate-900 dark:bg-dk-accent text-white disabled:opacity-40"
                >
                    {tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save' })}
                </button>
            </div>
        </div>
    );
}

export function PageGroupes({ models, groupes, setGroupes, rh, onBack }: {
    models: ModelData[];
    groupes: GroupeCoupe[];
    setGroupes: (g: GroupeCoupe[]) => void;
    rh: ReturnType<typeof useRhDuJour>;
    onBack: () => void;
}) {
    const { lang } = useLang();
    const [edition, setEdition] = useState<GroupeCoupe | 'nouveau' | null>(null);
    const [aSupprimer, setASupprimer] = useState<GroupeCoupe | null>(null);
    const [periode, setPeriode] = useState<Periode>('7j');
    const [filtreGroupe, setFiltreGroupe] = useState<string | null>(null);
    const [limite, setLimite] = useState(50);

    const presence = useMemo(() => presenceGroupes(groupes, rh.ouvriers, rh.pointage, rh.date), [groupes, rh.ouvriers, rh.pointage, rh.date]);
    const executes = useMemo(() => matelasExecutes(models), [models]);
    const depuis = debutPeriode(periode);
    const stats = useMemo(() => statsGroupes(executes, groupes, depuis), [executes, groupes, depuis]);
    const nomGroupe = (id: string) => groupes.find(g => g.id === id)?.nom || tx(lang, { fr: 'Groupe supprimé', ar: 'مجموعة محذوفة', en: 'Deleted group' });

    const debutJour = debutPeriode('jour')!;
    const duJour = (id: string) => executes.filter(x => x.groupeId === id && Date.parse(x.fin || x.debut || '') >= debutJour);

    const journal = executes
        .filter(x => depuis === undefined || Date.parse(x.fin || x.debut || '') >= depuis)
        .filter(x => !filtreGroupe || x.groupeId === filtreGroupe);

    const prisPar = (sauf: string | null) => {
        const m = new Map<string, string>();
        for (const g of groupes) if (g.id !== sauf) for (const id of g.membres) m.set(id, g.nom);
        return m;
    };

    const enregistrer = (g: GroupeCoupe) => {
        const existe = groupes.some(x => x.id === g.id);
        setGroupes(existe ? groupes.map(x => x.id === g.id ? g : x) : [...groupes, g]);
        setEdition(null);
    };

    const presentsTotal = presence.reduce((s, p) => s + p.presents, 0);

    return (
        <div>
            <EnTetePage
                titre={tx(lang, { fr: 'Groupes de coupe', ar: 'مجموعات القص', en: 'Cutting groups' })}
                sousTitre={`${tx(lang, { fr: 'Pointage du', ar: 'حضور يوم', en: 'Attendance of' })} ${rh.date.split('-').reverse().join('/')}`}
                onBack={onBack}
                actions={
                    <button type="button" onClick={rh.recharger} title={tx(lang, { fr: 'Actualiser le pointage', ar: 'تحديث الحضور', en: 'Refresh attendance' })} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-dk-elevated shrink-0">
                        <RefreshCw className={`w-4 h-4 ${rh.etat === 'chargement' ? 'animate-spin' : ''}`} />
                    </button>
                }
            />

            {rh.etat === 'refuse' && (
                <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[12px] text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    {tx(lang, { fr: 'Votre compte n\'a pas accès à la RH : la présence ne peut pas être lue. Demandez l\'accès « Gestion RH ».', ar: 'حسابك لا يملك صلاحية الموارد البشرية، فلا يمكن قراءة الحضور. اطلب صلاحية «Gestion RH».', en: 'Your account cannot read HR, so attendance is unavailable.' })}
                </div>
            )}
            {rh.etat === 'erreur' && (
                <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-[12px] text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    {tx(lang, { fr: 'Le pointage n\'a pas pu être lu. Réessayez avec le bouton d\'actualisation.', ar: 'تعذّرت قراءة الحضور. أعد المحاولة بزر التحديث.', en: 'Attendance could not be read. Try refreshing.' })}
                </div>
            )}

            <Resume items={[
                { label: tx(lang, { fr: 'Groupes', ar: 'المجموعات', en: 'Groups' }), valeur: fmtN(groupes.length) },
                { label: tx(lang, { fr: 'Présents', ar: 'الحاضرة', en: 'Present' }), valeur: `${presence.filter(p => p.estPresent).length}`, ton: 'text-emerald-600 dark:text-emerald-400' },
                { label: tx(lang, { fr: 'Ouvriers', ar: 'العمّال', en: 'Workers' }), valeur: `${presentsTotal}/${groupes.reduce((s, g) => s + g.membres.length, 0)}` },
            ]} />

            {/* Groupes et presence */}
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-[13px] font-semibold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Présence du jour', ar: 'حضور اليوم', en: 'Today\'s attendance' })}</h3>
                {edition === null && (
                    <button type="button" onClick={() => setEdition('nouveau')} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-dk-accent text-white text-[12px] font-semibold">
                        <Plus className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Nouveau groupe', ar: 'مجموعة جديدة', en: 'New group' })}
                    </button>
                )}
            </div>

            {edition === 'nouveau' && (
                <div className="mb-3">
                    <EditeurGroupe initial={null} ouvriers={rh.ouvriers} autres={prisPar(null)} onSave={enregistrer} onCancel={() => setEdition(null)} />
                </div>
            )}

            {groupes.length === 0 && edition === null && (
                <div className="text-center py-8 px-4 bg-white dark:bg-dk-surface rounded-xl border border-dashed border-slate-200 dark:border-dk-border mb-4">
                    <Users className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                    <p className="text-[13px] font-semibold text-slate-600 dark:text-dk-text-soft">{tx(lang, { fr: 'Aucun groupe de coupe', ar: 'لا توجد مجموعات قص', en: 'No cutting group' })}</p>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">{tx(lang, { fr: 'Créez un groupe et choisissez ses ouvriers dans la RH : leur présence viendra du pointage.', ar: 'أنشئ مجموعة واختر عمّالها من الموارد البشرية، وسيُقرأ حضورهم من التوقيت.', en: 'Create a group and pick its workers from HR; attendance comes from clock-ins.' })}</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-5">
                {groupes.map(g => {
                    if (edition !== null && edition !== 'nouveau' && edition.id === g.id) {
                        return <div key={g.id} className="md:col-span-2"><EditeurGroupe initial={g} ouvriers={rh.ouvriers} autres={prisPar(g.id)} onSave={enregistrer} onCancel={() => setEdition(null)} /></div>;
                    }
                    const p = presence.find(x => x.groupeId === g.id);
                    const jour = duJour(g.id);
                    const mJour = jour.reduce((s, x) => s + x.metres, 0);
                    return (
                        <div key={g.id} className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${p?.estPresent ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                <h4 className="flex-1 min-w-0 text-[14px] font-semibold text-slate-800 dark:text-dk-text truncate">{g.nom}</h4>
                                <span className="text-[11px] tabular-nums text-slate-500 shrink-0">{p?.presents ?? 0}/{g.membres.length}</span>
                                <button type="button" onClick={() => setEdition(g)} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-dk-elevated" title={tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit' })}>
                                    <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button type="button" onClick={() => setASupprimer(g)} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50" title={tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete' })}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1 mb-2">
                                {(p?.membres || []).length === 0 && <span className="text-[11px] text-slate-400">{tx(lang, { fr: 'Aucun membre', ar: 'لا أعضاء', en: 'No member' })}</span>}
                                {(p?.membres || []).map(mb => {
                                    const s = STATUTS[mb.statut] || STATUTS.NON_POINTE;
                                    return (
                                        <span key={mb.id} title={`${tx(lang, s)}${mb.entree ? ` · ${mb.entree}` : ''}`} className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-medium ${estAuTravail(mb.statut) ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300' : 'bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${s.point}`} />
                                            <span className="truncate max-w-[110px]">{mb.nom}</span>
                                            {mb.inconnu && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                                        </span>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-dk-muted border-t border-slate-100 dark:border-dk-border pt-2">
                                <span>{tx(lang, { fr: 'Aujourd\'hui', ar: 'اليوم', en: 'Today' })}:</span>
                                <span><b className="text-slate-700 dark:text-dk-text-soft tabular-nums">{jour.length}</b> {tx(lang, { fr: 'matelas', ar: 'مفرشة', en: 'lays' })}</span>
                                <span><b className="text-slate-700 dark:text-dk-text-soft tabular-nums">{fmtM(mJour)}</b></span>
                                <button type="button" onClick={() => setFiltreGroupe(filtreGroupe === g.id ? null : g.id)} className={`ml-auto h-7 px-2 rounded-md text-[10px] font-semibold ${filtreGroupe === g.id ? 'bg-indigo-600 text-white' : 'text-indigo-600 dark:text-dk-accent-text hover:bg-indigo-50 dark:hover:bg-dk-accent/20'}`}>
                                    {tx(lang, { fr: 'Son journal', ar: 'سجلّها', en: 'Its log' })}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Classement */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <h3 className="text-[13px] font-semibold text-slate-800 dark:text-dk-text inline-flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-500" /> {tx(lang, { fr: 'Classement', ar: 'الترتيب', en: 'Ranking' })}
                </h3>
                <Onglets valeur={periode} onChange={setPeriode} options={[
                    { id: 'jour', label: tx(lang, { fr: 'Aujourd\'hui', ar: 'اليوم', en: 'Today' }) },
                    { id: '7j', label: tx(lang, { fr: '7 jours', ar: '7 أيام', en: '7 days' }) },
                    { id: '30j', label: tx(lang, { fr: '30 jours', ar: '30 يوماً', en: '30 days' }) },
                    { id: 'tout', label: tx(lang, { fr: 'Tout', ar: 'الكل', en: 'All' }) },
                ]} />
            </div>
            <p className="text-[10px] text-slate-400 mb-2">{tx(lang, { fr: 'Rang au mètre de tissu étalé par heure, sur les seuls matelas dont le début et la fin sont pointés.', ar: 'الترتيب حسب أمتار الثوب المفروشة في الساعة، على المفرشات التي سُجّلت بدايتها ونهايتها فقط.', en: 'Ranked by metres spread per hour, on lays with both start and end recorded.' })}</p>
            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border overflow-x-auto mb-5">
                <table className="w-full text-[12px] min-w-[520px]">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-dk-border">
                            <th className="py-2 px-3 text-left w-10">#</th>
                            <th className="py-2 px-3 text-left">{tx(lang, { fr: 'Groupe', ar: 'المجموعة', en: 'Group' })}</th>
                            <th className="py-2 px-3 text-right">{tx(lang, { fr: 'Matelas', ar: 'مفرشات', en: 'Lays' })}</th>
                            <th className="py-2 px-3 text-right">{tx(lang, { fr: 'Mètres', ar: 'أمتار', en: 'Metres' })}</th>
                            <th className="py-2 px-3 text-right">{tx(lang, { fr: 'Pièces', ar: 'قطع', en: 'Pieces' })}</th>
                            <th className="py-2 px-3 text-right">{tx(lang, { fr: 'Moy./matelas', ar: 'المعدّل/مفرشة', en: 'Avg/lay' })}</th>
                            <th className="py-2 px-3 text-right">m/h</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-dk-border">
                        {stats.length === 0 && (
                            <tr><td colSpan={7} className="py-6 text-center text-slate-400">{tx(lang, { fr: 'Aucun groupe', ar: 'لا توجد مجموعات', en: 'No group' })}</td></tr>
                        )}
                        {stats.map(s => (
                            <tr key={s.groupeId} className={s.rang === 1 ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}>
                                <td className="py-2 px-3 font-bold tabular-nums text-slate-500">{s.rang ?? '—'}</td>
                                <td className="py-2 px-3 font-semibold text-slate-800 dark:text-dk-text">{nomGroupe(s.groupeId)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{s.nb}{s.nbChronometres < s.nb && <span className="text-slate-400 text-[10px]"> ({s.nbChronometres}⏱)</span>}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{fmtM(s.metres)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{fmtN(s.pieces)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{fmtDuree(s.minParMatelas)}</td>
                                <td className="py-2 px-3 text-right tabular-nums font-bold text-slate-800 dark:text-dk-text">{s.metresParHeure === null ? '—' : fmtN(s.metresParHeure, 1)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Journal : la base de temps des matelas */}
            <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-[13px] font-semibold text-slate-800 dark:text-dk-text inline-flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-400" /> {tx(lang, { fr: 'Journal des matelas', ar: 'سجلّ المفرشات', en: 'Lay log' })}
                    <span className="text-[11px] font-normal text-slate-400">· {journal.length}</span>
                </h3>
                {filtreGroupe && (
                    <button type="button" onClick={() => setFiltreGroupe(null)} className="h-7 px-2 inline-flex items-center gap-1 rounded-md bg-indigo-50 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text text-[11px] font-semibold">
                        {nomGroupe(filtreGroupe)} <X className="w-3 h-3" />
                    </button>
                )}
            </div>
            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border divide-y divide-slate-100 dark:divide-dk-border overflow-hidden">
                {journal.length === 0 && (
                    <p className="text-center text-[12px] text-slate-400 py-8 px-4">
                        {tx(lang, { fr: 'Rien sur cette période. Un matelas entre ici quand on le coche « coupé » avec son groupe et ses heures.', ar: 'لا شيء في هذه المدّة. تدخل المفرشة هنا حين تُعلَّم «مقصوصة» مع مجموعتها وساعاتها.', en: 'Nothing in this period. A lay appears here once marked cut with its group and times.' })}
                    </p>
                )}
                {journal.slice(0, limite).map((x, i) => (
                    <div key={`${x.modelId}-${x.numero}-${i}`} className="px-3 sm:px-4 py-2.5 flex items-center gap-3">
                        <div className="w-11 shrink-0 text-center">
                            <p className="text-[11px] font-bold tabular-nums text-slate-700 dark:text-dk-text-soft">{jourDe(x.fin || x.debut)}</p>
                            <p className="text-[9px] text-slate-400 truncate">{nomGroupe(x.groupeId)}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-slate-800 dark:text-dk-text truncate">
                                {x.modele} <span className="text-slate-400 font-normal">· N°{x.numero}</span>{x.couleur ? <span className="text-slate-400 font-normal"> · {x.couleur}</span> : null}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-dk-muted tabular-nums truncate">
                                {x.plis} {tx(lang, { fr: 'plis', ar: 'طيّة', en: 'plies' })} × {fmtN(x.longueurM, 2)} m · {fmtM(x.metres)} · {fmtN(x.pieces)} pcs
                            </p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-[12px] font-bold tabular-nums text-slate-800 dark:text-dk-text">{fmtDuree(x.minutes)}</p>
                            <p className="text-[10px] text-slate-400 tabular-nums">{x.debut || x.fin ? `${heureDe(x.debut) || '?'} → ${heureDe(x.fin) || '?'}` : ''}</p>
                        </div>
                    </div>
                ))}
                {journal.length > limite && (
                    <button type="button" onClick={() => setLimite(l => l + 50)} className="w-full h-10 text-[12px] font-semibold text-indigo-600 dark:text-dk-accent-text hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                        {tx(lang, { fr: 'Afficher plus', ar: 'عرض المزيد', en: 'Show more' })} ({journal.length - limite})
                    </button>
                )}
            </div>

            {aSupprimer && (
                <div className="fixed inset-0 z-[95] bg-slate-900/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setASupprimer(null)}>
                    <div className="w-full sm:max-w-sm bg-white dark:bg-dk-surface rounded-t-2xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-[14px] font-semibold text-slate-900 dark:text-dk-text">{tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete' })} « {aSupprimer.nom} » ?</h3>
                        <p className="text-[12px] text-slate-500 mt-1">{tx(lang, { fr: 'Les matelas déjà coupés gardent leur historique, affiché comme « Groupe supprimé ».', ar: 'المفرشات المقصوصة تحتفظ بتاريخها، وتظهر باسم «مجموعة محذوفة».', en: 'Lays already cut keep their history, shown as "Deleted group".' })}</p>
                        <div className="flex justify-end gap-2 mt-5">
                            <button type="button" onClick={() => setASupprimer(null)} className="h-10 px-4 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-100">{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel' })}</button>
                            <button type="button" onClick={() => { setGroupes(groupes.filter(x => x.id !== aSupprimer.id)); setASupprimer(null); }} className="h-10 px-4 rounded-lg text-[12px] font-semibold bg-rose-600 text-white">{tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete' })}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
