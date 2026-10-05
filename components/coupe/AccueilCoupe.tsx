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
    RefreshCw, Trophy, Clock, Building2, ChevronRight, AlertTriangle, Factory, CalendarDays, Activity,
} from 'lucide-react';
import type { AppSettings, GroupeCoupe, ModelData, OuvrierCoupe, PlanningEvent, PointageCoupe, ReglageChaineCoupe, SuiviData } from '../../types';
import SheetModal from '../shared/SheetModal';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import {
    aujourdhui, consoTissu, estAuTravail, estOuvert, matelasExecutes, presenceAtelier, presenceGroupes,
    resumerOrdre, statsGroupes, tempsStandard, minutesPrevues, texteDuree, type OuvrierRh, type PointageRh, type PresenceGroupe, type StatutPresence,
} from '../../lib/coupeAtelier';
import { equilibrerOrdre } from '../../lib/equilibreMatieres';
import { chainesDeCoupe, type ChaineCoupe, type EtatChaine, type ModeleSurChaine } from '../../lib/coupeChaines';

export type PageAccueil = 'ordres' | 'groupes' | 'tissu' | 'chaines';

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

/**
 * Ouvriers et presence de la salle de coupe, saisis dans La Coupe meme : la
 * coupe ne depend plus de la RH. Meme forme que `useRhDuJour`, plus de quoi
 * ajouter un ouvrier et le pointer.
 */
export interface AtelierCoupe {
    ouvriers: OuvrierRh[];
    pointage: PointageRh[];
    etat: EtatRh;
    date: string;
    recharger: () => void;
    liste: OuvrierCoupe[];
    ajouter: (nom: string) => void;
    retirer: (id: string) => void;
    /** null : retire le pointage du jour. */
    pointer: (ids: string[], statut: PointageCoupe['statut'] | null) => void;
}

export function useAtelierCoupe(
    liste: OuvrierCoupe[] | undefined,
    pointageTout: AppSettings['pointageCoupe'],
    maj: (f: (prev: AppSettings) => AppSettings) => void,
): AtelierCoupe {
    const date = aujourdhui();
    const { ouvriers, pointage } = useMemo(() => presenceAtelier(liste, pointageTout, date), [liste, pointageTout, date]);
    const heure = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    return {
        ouvriers, pointage, etat: 'ok', date, recharger: () => { /* local : rien a relire */ },
        liste: liste || [],
        ajouter: nom => {
            const n = nom.trim();
            if (!n) return;
            maj(prev => ({ ...prev, ouvriersCoupe: [...(prev.ouvriersCoupe || []), { id: `OC-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`, nom: n }] }));
        },
        retirer: id => maj(prev => ({
            ...prev,
            ouvriersCoupe: (prev.ouvriersCoupe || []).filter(o => o.id !== id),
            groupesCoupe: (prev.groupesCoupe || []).map(g => ({ ...g, membres: g.membres.filter(m => m !== id) })),
        })),
        pointer: (ids, statut) => maj(prev => {
            const jour = { ...(prev.pointageCoupe?.[date] || {}) };
            for (const id of ids) {
                if (statut === null) delete jour[id];
                else jour[id] = { statut, entree: statut === 'ABSENT' ? undefined : (jour[id]?.entree || heure()) };
            }
            return { ...prev, pointageCoupe: { ...(prev.pointageCoupe || {}), [date]: jour } };
        }),
    };
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

export function CartesAccueil({ models, groupes, presence, etatRh, onOuvrir, chaines }: {
    models: ModelData[];
    groupes: GroupeCoupe[];
    presence: PresenceGroupe[];
    etatRh: EtatRh;
    onOuvrir: (p: PageAccueil) => void;
    /** Ce que chaque chaine attend de la coupe (Planning + Suivi) : la quatrieme carte. */
    chaines?: ChaineCoupe[];
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

    const actives = (chaines || []).filter(c => c.etat !== 'libre');
    const enRisque = actives.filter(c => c.etat === 'arret').length;
    const matelasChaines = actives.reduce((s, c) => s + c.matelasACouper, 0);

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
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
            <Carte
                label={tx(lang, { fr: 'Chaînes', ar: 'السلاسل', en: 'Sewing lines', es: 'Líneas' })}
                valeur={actives.length === 0 ? '—' : `${fmtN(matelasChaines)} ${tx(lang, { fr: 'mat.', ar: 'مفرشة', en: 'lays' })}`}
                sous={actives.length === 0
                    ? tx(lang, { fr: 'Rien au Planning', ar: 'لا شيء في التخطيط', en: 'Nothing planned' })
                    : enRisque > 0
                        ? `${enRisque} ${tx(lang, { fr: 'chaîne(s) en risque', ar: 'سلسلة مهدّدة', en: 'line(s) at risk' })}`
                        : `${actives.length} ${tx(lang, { fr: 'chaîne(s) couvertes', ar: 'سلسلة مغطّاة', en: 'line(s) covered' })}`}
                icon={Factory} couleur={enRisque > 0 ? 'bg-rose-600' : 'bg-amber-500'}
                onClick={() => onOuvrir('chaines')}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Page : ordres en cours                                               */
/* ------------------------------------------------------------------ */

export function PageOrdres({ models, onBack, onOpen, chaines }: { models: ModelData[]; onBack: () => void; onOpen: (m: ModelData) => void; chaines?: ChaineCoupe[] }) {
    const { lang } = useLang();
    /** Pour chaque modele, ce que chaque chaine attend de la coupe (Planning + Suivi + serie). */
    const parModele = useMemo(() => {
        const t = new Map<string, { chaine: ChaineCoupe; x: ModeleSurChaine }[]>();
        for (const c of chaines || []) for (const x of c.modeles) (t.get(x.modelId) || t.set(x.modelId, []).get(x.modelId)!).push({ chaine: c, x });
        return t;
    }, [chaines]);
    const [filtre, setFiltre] = useState<'TOUS' | 'EN_PREPARATION' | 'EN_COURS' | 'SOUS_TRAITANCE'>('TOUS');
    const [q, setQ] = useState('');
    /** Ordre de la liste : le plus a couper, le plus en retard face aux autres matieres, ou le moins avance. */
    const [tri, setTri] = useState<'aCouper' | 'retard' | 'avancement'>('aCouper');
    const [seulRetard, setSeulRetard] = useState(false);

    const lignes = useMemo(() => models.filter(estOuvert).map(m => {
        // Plusieurs matieres : leur avancement cote a cote, et les lots dont le tissu est parti sans elles.
        const eq = equilibrerOrdre(m.ordreCoupe, m.ficheData?.sizes || m.meta_data?.sizes || []);
        const matieres = eq.matieres.filter(x => eq.parMatiere[x.id]?.nbMatelas > 0);
        return {
            m, r: resumerOrdre(m),
            matieres: matieres.length > 1 ? matieres.map(x => ({ id: x.id, code: x.code, faits: eq.parMatiere[x.id].nbCoupes, total: eq.parMatiere[x.id].nbMatelas })) : [],
            retards: eq.lots.filter(l => l.retard.length > 0).length,
            prets: matieres.length > 1 ? eq.prets : null,
            // Pret pour la chaine, taille par taille (couleurs additionnees) : le moins coupe de toutes les matieres.
            tailles: matieres.length > 1 ? Object.values(eq.parTaille.reduce<Record<string, { taille: string; prevu: number; prets: number; limite: Set<string> }>>((acc, t) => {
                const x = acc[t.taille] || (acc[t.taille] = { taille: t.taille, prevu: 0, prets: 0, limite: new Set() });
                x.prevu += t.prevu; x.prets += t.prets;
                t.limite.forEach(id => x.limite.add(eq.matieres.find(mt => mt.id === id)?.code || ''));
                return acc;
            }, {})).filter(x => x.prevu > 0) : [],
        };
    }), [models]);
    const nbEnRetard = lignes.filter(x => x.retards > 0).length;
    const visibles = lignes
        .filter(x => filtre === 'TOUS' || x.r.statut === filtre)
        .filter(x => !seulRetard || x.retards > 0)
        .filter(x => !q.trim() || `${x.r.nom} ${x.r.client} ${x.r.type}`.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) =>
            tri === 'retard' ? (b.retards - a.retards) || (b.r.aCouper - a.r.aCouper)
            : tri === 'avancement' ? (a.r.avancement - b.r.avancement) || (b.r.aCouper - a.r.aCouper)
            : b.r.aCouper - a.r.aCouper);
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
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{tx(lang, { fr: 'Trier', ar: 'ترتيب', en: 'Sort' })}</span>
                <Onglets valeur={tri} onChange={setTri} options={[
                    { id: 'aCouper', label: tx(lang, { fr: 'Plus à couper', ar: 'الأكثر للقص', en: 'Most to cut' }) },
                    { id: 'retard', label: tx(lang, { fr: 'Lots en retard', ar: 'الدفعات المتأخرة', en: 'Late lots' }) },
                    { id: 'avancement', label: tx(lang, { fr: 'Moins avancé', ar: 'الأقل تقدّماً', en: 'Least advanced' }) },
                ]} />
                {nbEnRetard > 0 && (
                    <button
                        type="button"
                        onClick={() => setSeulRetard(v => !v)}
                        aria-pressed={seulRetard}
                        className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border text-[12px] font-bold ${seulRetard ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white dark:bg-dk-surface border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400'}`}
                    >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {tx(lang, { fr: 'Seulement en retard', ar: 'المتأخرة فقط', en: 'Late only' })} · {nbEnRetard}
                    </button>
                )}
            </div>

            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border divide-y divide-slate-100 dark:divide-dk-border overflow-hidden">
                {visibles.length === 0 && (
                    <p className="text-center text-[12px] text-slate-400 py-10">{tx(lang, { fr: 'Aucun ordre ouvert', ar: 'لا توجد أوامر جارية', en: 'No open order' })}</p>
                )}
                {visibles.map(({ m, r, matieres, retards, prets, tailles }) => {
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
                            {matieres.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold tabular-nums">
                                    {matieres.map(x => (
                                        <span key={x.id} className={`px-1.5 h-5 inline-flex items-center gap-1 rounded ${x.faits === x.total ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-dk-elevated dark:text-dk-text-soft'}`}>
                                            {x.code}<span className="font-semibold">{x.faits}/{x.total}</span>
                                        </span>
                                    ))}
                                    {prets !== null && (
                                        <span className="text-emerald-600 dark:text-emerald-400">{fmtN(prets)} {tx(lang, { fr: 'prêts', ar: 'جاهزة', en: 'ready' })}</span>
                                    )}
                                    {retards > 0 && (
                                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                                            <AlertTriangle className="w-3 h-3" />
                                            {retards} {tx(lang, { fr: 'lot(s) en retard', ar: 'دفعة متأخرة', en: 'late lot(s)' })}
                                        </span>
                                    )}
                                </div>
                            )}
                            {(parModele.get(m.id) || []).filter(e => e.x.matelas.length > 0).length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold tabular-nums">
                                    <span className="font-bold uppercase tracking-wide text-slate-400">{tx(lang, { fr: 'À couper', ar: 'للقص', en: 'To cut' })}</span>
                                    {(parModele.get(m.id) || []).filter(e => e.x.matelas.length > 0).map(e => (
                                        <span key={e.chaine.id} className={`px-1.5 h-5 inline-flex items-center gap-1 rounded ${ORANGE_PLEIN}`}>
                                            <Factory className="w-3 h-3" />{e.chaine.nom} · {e.x.matelas.length} {tx(lang, { fr: 'mat.', ar: 'مفرشة', en: 'lays' })} · N° {plageNumeros(e.x.matelas.map(l => l.numero || '?'))}
                                            {e.x.autres.map(a => <span key={a.code} className="opacity-90">· {a.code} {plageNumeros(a.numeros)}</span>)}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {tailles.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] tabular-nums">
                                    <span className="font-bold uppercase tracking-wide text-slate-400 mr-0.5">{tx(lang, { fr: 'Chaîne', ar: 'للسلسلة', en: 'Line' })}</span>
                                    {tailles.map(t => {
                                        const plein = t.prets >= t.prevu;
                                        const bloque = [...t.limite].filter(Boolean);
                                        return (
                                            <span
                                                key={t.taille}
                                                title={bloque.length ? tx(lang, { fr: `Retenu par ${bloque.join(', ')}`, ar: `تحبسه ${bloque.join('، ')}`, en: `Held by ${bloque.join(', ')}` }) : undefined}
                                                className={`px-1.5 h-5 inline-flex items-center gap-1 rounded border ${plein ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : t.prets > 0 ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-500 dark:border-dk-border dark:bg-dk-surface dark:text-dk-muted'}`}
                                            >
                                                <b>{t.taille}</b>{fmtN(t.prets)}/{fmtN(t.prevu)}
                                                {bloque.length > 0 && <span className="font-bold text-rose-600 dark:text-rose-400">{bloque.join('·')}</span>}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Page : chaines                                                       */
/* ------------------------------------------------------------------ */

const ETATS_CHAINE: Record<EtatChaine, { fr: string; ar: string; en: string; cls: string; barre: string }> = {
    arret: { fr: 'Va s’arrêter', ar: 'ستتوقف', en: 'Will stop', cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/25 dark:text-rose-300 dark:border-rose-800', barre: 'bg-rose-500' },
    juste: { fr: 'Juste', ar: 'على الحدّ', en: 'Tight', cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/25 dark:text-amber-300 dark:border-amber-800', barre: 'bg-amber-500' },
    couverte: { fr: 'Couverte', ar: 'مغطّاة', en: 'Covered', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-300 dark:border-emerald-800', barre: 'bg-emerald-500' },
    horsCoupe: { fr: 'Sans ordre de coupe', ar: 'بلا أمر قص', en: 'No cutting order', cls: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-dk-elevated dark:text-dk-text-soft dark:border-dk-border', barre: 'bg-slate-400' },
    libre: { fr: 'Sans modèle', ar: 'بلا موديل', en: 'No model', cls: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-dk-elevated dark:text-dk-muted dark:border-dk-border', barre: 'bg-slate-300' },
};

/** Orange partout : ce que la coupe doit couper. */
const ORANGE_PLEIN = 'bg-orange-500 text-white border border-orange-500';
const ORANGE_DOUX = 'bg-orange-50 text-orange-800 border border-orange-200 dark:bg-orange-900/25 dark:text-orange-200 dark:border-orange-800';

/** « 5 → 9 » quand les numeros se suivent, sinon la liste. */
const plageNumeros = (ns: string[]) => {
    const v = ns.map(n => parseInt(n, 10));
    if (v.length > 2 && v.every((x, i) => Number.isFinite(x) && (i === 0 || x === v[i - 1] + 1))) return `${ns[0]} → ${ns[ns.length - 1]}`;
    return ns.join(', ');
};

/** Ce qu'il faut couper pour un modele sur une chaine : orange, numeros, serie, matieres en face. */
function ACouper({ x, L, jour, large }: { x: ModeleSurChaine; L: (fr: string, ar: string, en: string) => string; jour: (iso: string | null) => string; large?: boolean }) {
    if (!x.aUnOrdre) return <span className="inline-flex items-center h-7 px-2 rounded-lg bg-slate-100 dark:bg-dk-elevated text-[11px] font-semibold text-slate-500">{L('Pas d’ordre de coupe pour ce modèle', 'لا أمر قص لهذا الموديل', 'No cutting order for this model')}</span>;
    if (x.plusTard) return <span className="inline-flex items-center h-7 px-2 rounded-lg bg-slate-100 dark:bg-dk-elevated text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft">{L('Rien avant le', 'لا شيء قبل', 'Nothing before')} {jour(x.commencerLe)}</span>;
    if (x.serieAbsente) return <span className={`inline-flex items-center h-7 px-2 rounded-lg text-[11px] font-semibold ${ORANGE_DOUX}`}>{L('Attribuez des paquets à cette chaîne', 'أعطِ حزماً لهذه السلسلة', 'Assign bundles to this line')}</span>;
    if (x.sansMatelas) return <span className={`inline-flex items-center h-7 px-2 rounded-lg text-[11px] font-bold ${ORANGE_DOUX}`}>{fmtN(x.aCouperPieces)} {L('pcs à couper · pas de matelas calculés', 'ق للقص · لا مفرشات محسوبة', 'pcs to cut · no lays')}</span>;
    if (x.matelas.length === 0) return <span className="inline-flex items-center gap-1 h-7 px-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/25 text-[11px] font-bold text-emerald-700 dark:text-emerald-300"><Check className="w-3 h-3" />{x.resteACouper === 0 ? L('Tout coupé pour cette chaîne', 'كل شيء مقصوص لهذه السلسلة', 'All cut for this line') : L('Avance suffisante : rien à couper', 'التقدّم كافٍ: لا شيء للقص', 'Enough buffer: nothing to cut')}</span>;
    return (
        <div className={`flex flex-wrap items-center gap-1.5 text-[11px] ${large ? 'text-[12px]' : ''}`}>
            <span className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg font-bold ${ORANGE_PLEIN}`}>
                <Scissors className="w-3.5 h-3.5" />
                {L(`${x.matelas.length} matelas`, `${x.matelas.length} مفرشة`, `${x.matelas.length} lays`)} · N° {plageNumeros(x.matelas.map(l => l.numero || '?'))}
                <span className="font-semibold opacity-90">· {fmtN(x.matelas.reduce((t, l) => t + l.pieces, 0))} {L('pcs', 'ق', 'pcs')}</span>
            </span>
            {x.serieACouper && <span className={`inline-flex items-center h-8 px-2 rounded-lg font-semibold tabular-nums ${ORANGE_DOUX}`}>{L('série', 'سيري', 'series')} {fmtN(x.serieACouper.debut)}–{fmtN(x.serieACouper.fin)}</span>}
            {x.autres.map(a => (
                <span key={a.code} title={a.nom} className={`inline-flex items-center h-8 px-2 rounded-lg font-semibold tabular-nums ${ORANGE_DOUX}`}>
                    <b className="mr-1">{a.code}</b>N° {plageNumeros(a.numeros)}
                </span>
            ))}
        </div>
    );
}

export function PageChaines({ models, evenements, suivis, settings, joursAvance, setJoursAvance, reglages, setReglages, onBack, onOpen, onNavigate }: {
    models: ModelData[];
    evenements: PlanningEvent[];
    suivis: SuiviData[];
    settings?: AppSettings;
    joursAvance: number;
    setJoursAvance: (j: number) => void;
    /** Chaines reglees a la main (dans La Coupe seulement) ; vide : celles du Planning. */
    reglages: ReglageChaineCoupe[];
    setReglages: (r: ReglageChaineCoupe[]) => void;
    onBack: () => void;
    onOpen: (m: ModelData) => void;
    onNavigate?: (view: string) => void;
}) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    /** Chaine choisie dans le bandeau (null : toutes celles qui ont un modele). */
    const [choix, setChoix] = useState<string | null>(null);
    /** Chaine dont on lit tout le detail. */
    const [ouverte, setOuverte] = useState<string | null>(null);
    const [editeur, setEditeur] = useState(false);

    const chaines = useMemo(
        () => chainesDeCoupe({ models, evenements, suivis, settings: settings ? { ...settings, chainesCoupe: reglages } : ({ chainesCoupe: reglages } as AppSettings), joursAvance, aujourdhui: aujourdhui() }),
        [models, evenements, suivis, settings, reglages, joursAvance],
    );
    const ordre: Record<EtatChaine, number> = { arret: 0, juste: 1, couverte: 2, horsCoupe: 3, libre: 4 };
    const triees = [...chaines].sort((a, b) => ordre[a.etat] - ordre[b.etat] || a.id.localeCompare(b.id, undefined, { numeric: true }));
    const visibles = choix ? triees.filter(c => c.id === choix) : triees.filter(c => c.etat !== 'libre');
    const matelas = chaines.reduce((s, c) => s + c.matelasACouper, 0);
    const pieces = chaines.reduce((s, c) => s + c.piecesACouper, 0);
    const enRisque = chaines.filter(c => c.etat === 'arret').length;
    const modeleDe = (id: string) => models.find(m => m.id === id);
    const locale = lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'fr-FR';
    const jour = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: 'short' }) : '—');

    /** Les reglages a modifier : si rien n'est regle, on part des chaines affichees (aucune ne disparait). */
    const reglagesCompletes = (): ReglageChaineCoupe[] => (reglages.length ? reglages : chaines.map(c => ({ id: c.id, nom: c.nom })));
    const majChaine = (id: string, f: (c: ReglageChaineCoupe) => ReglageChaineCoupe) =>
        setReglages(reglagesCompletes().map(c => (c.id === id ? f(c) : c)));
    const fixerCadence = (id: string, modelId: string, valeur: number | undefined) => majChaine(id, c => {
        const cadences = { ...(c.cadences || {}) };
        if (valeur && valeur > 0) cadences[modelId] = valeur; else delete cadences[modelId];
        return { ...c, cadences };
    });
    const retirerModele = (id: string, modelId: string) => majChaine(id, c => ({ ...c, modeles: (c.modeles || []).filter(x => x !== modelId) }));

    const ouvertes = models.filter(m => m.ordreCoupe && estOuvert(m));
    const chaineOuverte = ouverte ? chaines.find(c => c.id === ouverte) : undefined;

    const editeurModal = editeur && (
        <EditeurChaines
            depart={reglagesCompletes()}
            modeles={ouvertes}
            onFermer={() => setEditeur(false)}
            onEnregistrer={r => { setReglages(r); setEditeur(false); }}
            onRevenir={reglages.length ? () => { setReglages([]); setEditeur(false); setChoix(null); setOuverte(null); } : undefined}
        />
    );

    if (chaineOuverte) {
        return (
            <div>
                <EnTetePage
                    titre={chaineOuverte.nom}
                    sousTitre={L('Tout ce que la coupe sait de cette chaîne', 'كل ما يعرفه القص عن هذه السلسلة', 'Everything cutting knows about this line')}
                    onBack={() => setOuverte(null)}
                    actions={<button type="button" onClick={() => setEditeur(true)} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft hover:border-indigo-300"><Edit3 className="w-3.5 h-3.5" />{L('Régler', 'ضبط', 'Edit')}</button>}
                />
                <DetailChaine
                    chaine={chaineOuverte}
                    reglage={reglages.find(r => r.id === chaineOuverte.id)}
                    joursAvance={joursAvance}
                    modeleDe={modeleDe}
                    jour={jour}
                    L={L}
                    onOpen={onOpen}
                    onCadence={(modelId, v) => fixerCadence(chaineOuverte.id, modelId, v)}
                    onRetirer={modelId => retirerModele(chaineOuverte.id, modelId)}
                />
                {editeurModal}
            </div>
        );
    }

    return (
        <div>
            <EnTetePage
                titre={L('Chaînes', 'السلاسل', 'Sewing lines')}
                sousTitre={L('Ce que chaque chaîne attend de la coupe : Planning + Suivi de production', 'ما تنتظره كل سلسلة من القص: التخطيط + متابعة الإنتاج', 'What each line needs from cutting: Planning + production follow-up')}
                onBack={onBack}
                actions={(
                    <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setEditeur(true)} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft hover:border-indigo-300"><Edit3 className="w-3.5 h-3.5" /><span className="hidden sm:inline">{L('Régler les chaînes', 'ضبط السلاسل', 'Set lines')}</span></button>
                        {onNavigate && (
                            <>
                                <button type="button" onClick={() => onNavigate('planning')} className="hidden sm:inline-flex h-9 px-3 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft hover:border-indigo-300"><CalendarDays className="w-3.5 h-3.5" />{L('Planning', 'التخطيط', 'Planning')}</button>
                                <button type="button" onClick={() => onNavigate('suivi')} className="hidden sm:inline-flex h-9 px-3 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft hover:border-indigo-300"><Activity className="w-3.5 h-3.5" />{L('Suivi', 'المتابعة', 'Follow-up')}</button>
                            </>
                        )}
                    </div>
                )}
            />
            <Resume items={[
                { label: L('Matelas à couper', 'مفرشات للقص', 'Lays to cut'), valeur: fmtN(matelas), ton: matelas > 0 ? 'text-orange-600 dark:text-orange-400' : undefined },
                { label: L('Pièces', 'قطع', 'Pieces'), valeur: fmtN(pieces) },
                { label: L('Chaînes en risque', 'سلاسل مهدّدة', 'Lines at risk'), valeur: fmtN(enRisque), ton: enRisque > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400' },
            ]} />

            {/* Les chaines qui existent : une puce chacune, sa couleur dit ou la coupe est attendue */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <button type="button" onClick={() => setChoix(null)} className={`h-8 px-3 rounded-lg border text-[12px] font-semibold ${choix === null ? 'border-slate-900 bg-slate-900 text-white dark:bg-dk-accent dark:border-dk-accent' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft'}`}>
                    {L('Toutes', 'الكل', 'All')}
                </button>
                {triees.map(c => {
                    const st = ETATS_CHAINE[c.etat];
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => setChoix(choix === c.id ? null : c.id)}
                            title={tx(lang, st)}
                            className={`h-8 pl-2 pr-2.5 inline-flex items-center gap-1.5 rounded-lg border text-[12px] font-semibold ${choix === c.id ? 'border-slate-900 dark:border-dk-accent ring-1 ring-slate-900 dark:ring-dk-accent' : 'border-slate-200 dark:border-dk-border'} ${c.etat === 'libre' ? 'bg-slate-50 dark:bg-dk-bg text-slate-400' : 'bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text-soft'}`}
                        >
                            <span className={`w-2 h-2 rounded-full ${st.barre}`} />
                            {c.nom}
                            <span className="tabular-nums text-[11px] text-slate-400">{c.modeles.length > 0 ? `${c.modeles.length} ${L('mod.', 'موديل', 'mod.')}` : '—'}{c.matelasACouper > 0 ? ` · ${c.matelasACouper} ${L('mat.', 'مفرشة', 'lays')}` : ''}</span>
                        </button>
                    );
                })}
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{L('Avance voulue', 'التقدّم المطلوب', 'Buffer')}</span>
                <Onglets
                    valeur={String(joursAvance)}
                    onChange={v => setJoursAvance(Number(v))}
                    options={['1', '2', '3', '5'].map(j => ({ id: j, label: `${j} ${L(j === '1' ? 'jour' : 'jours', j === '1' ? 'يوم' : 'أيام', j === '1' ? 'day' : 'days')}` }))}
                />
            </div>

            {visibles.length === 0 && (
                <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border px-4 py-10 text-center">
                    <p className="text-[13px] text-slate-500 dark:text-dk-muted">{choix ? L('Aucun modèle sur cette chaîne.', 'لا يوجد موديل على هذه السلسلة.', 'No model on this line.') : L('Aucun modèle planifié sur une chaîne.', 'لا يوجد موديل مبرمج على أي سلسلة.', 'No model planned on a line.')}</p>
                    <div className="mt-3 flex items-center justify-center gap-2">
                        <button type="button" onClick={() => setEditeur(true)} className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-dk-accent text-white text-[12px] font-bold"><Edit3 className="w-4 h-4" />{L('Régler les chaînes', 'ضبط السلاسل', 'Set lines')}</button>
                        {onNavigate && <button type="button" onClick={() => onNavigate('planning')} className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft"><CalendarDays className="w-4 h-4" />{L('Ouvrir le Planning', 'فتح التخطيط', 'Open Planning')}</button>}
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {visibles.map(c => {
                    const st = ETATS_CHAINE[c.etat];
                    return (
                        <div key={c.id} className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden">
                            {/* Toucher la chaine : tout son detail */}
                            <button type="button" onClick={() => setOuverte(c.id)} className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-slate-100 dark:border-dk-border text-left hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                <span className={`w-1.5 h-6 rounded-full ${st.barre}`} />
                                <Factory className="w-4 h-4 text-slate-400 shrink-0" />
                                <span className="text-[14px] font-bold text-slate-900 dark:text-dk-text truncate flex-1 min-w-0">{c.nom}</span>
                                {c.matelasACouper > 0 && (
                                    <span className={`h-7 px-2 inline-flex items-center gap-1 rounded-lg text-[11px] font-bold tabular-nums shrink-0 ${ORANGE_PLEIN}`}>
                                        <Scissors className="w-3 h-3" />{c.matelasACouper}
                                    </span>
                                )}
                                <span className={`h-7 px-2 inline-flex items-center rounded-lg border text-[11px] font-bold shrink-0 ${st.cls}`}>{tx(lang, st)}</span>
                                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                            </button>

                            {c.modeles.length === 0 && (
                                <p className="px-4 py-2.5 text-[12px] text-slate-400">{L('Aucun modèle planifié sur cette chaîne.', 'لا يوجد موديل مبرمج على هذه السلسلة.', 'No model planned on this line.')}</p>
                            )}

                            <div className="divide-y divide-slate-100 dark:divide-dk-border">
                                {c.modeles.map(x => {
                                    const m = modeleDe(x.modelId);
                                    const lance = x.joursAvantLancement === null || x.joursAvantLancement <= 0;
                                    const avance = x.joursAvance === null ? null : Math.round(x.joursAvance * 10) / 10;
                                    const partAvance = x.joursAvance === null || joursAvance <= 0 ? 0 : Math.min(1, x.joursAvance / joursAvance);
                                    return (
                                        <div key={x.eventId} className="px-3 sm:px-4 py-2.5 space-y-1.5">
                                            {/* 1. Le modele */}
                                            <button type="button" disabled={!m || !x.aUnOrdre} onClick={() => m && onOpen(m)} className="w-full flex items-center gap-2.5 text-left disabled:cursor-default">
                                                <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 dark:bg-dk-elevated shrink-0 flex items-center justify-center">
                                                    {x.image ? <img src={x.image} alt="" className="w-full h-full object-cover" /> : <Scissors className="w-3.5 h-3.5 text-slate-300" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-semibold text-slate-800 dark:text-dk-text truncate">{x.nom}</p>
                                                    <p className="text-[11px] text-slate-500 dark:text-dk-muted truncate">{[x.client, !x.lancement ? '' : lance ? `${L('lancé', 'انطلق', 'started')} ${jour(x.lancement)}` : `${L('lancement', 'الانطلاق', 'start')} ${jour(x.lancement)} (${L('dans', 'بعد', 'in')} ${x.joursAvantLancement} ${L('j', 'ي', 'd')})`, x.dds ? `DDS ${jour(x.dds)}` : '', `${fmtN(x.commande)} ${L('pcs', 'قطعة', 'pcs')}`].filter(Boolean).join(' · ')}</p>
                                                </div>
                                                {m && x.aUnOrdre && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
                                            </button>

                                            <div className="grid grid-cols-[52px_1fr] gap-x-2 gap-y-1 items-center text-[11px]">
                                                {/* 2. Son suivi, resume */}
                                                <span className="font-bold uppercase tracking-wide text-slate-400 text-[9px]">{L('Suivi', 'المتابعة', 'Follow')}</span>
                                                <div className="min-w-0">
                                                    <p className="text-slate-500 dark:text-dk-muted tabular-nums truncate">
                                                        {L('entré', 'دخل', 'in')} <b className="text-slate-700 dark:text-dk-text-soft">{fmtN(x.entre)}</b> · {L('sorti', 'خرج', 'out')} <b className="text-slate-700 dark:text-dk-text-soft">{fmtN(x.sorti)}</b>
                                                        {x.cadence > 0 && <> · <b className="text-slate-700 dark:text-dk-text-soft">{fmtN(x.cadence)}</b> {x.sourceCadence === 'manuel' ? L('pcs/j (réglé)', 'ق/يوم (مضبوط)', 'pcs/d (set)') : x.sourceCadence === 'suivi' ? L('pcs/j réel', 'ق/يوم فعلي', 'pcs/d actual') : L('pcs/j plan', 'ق/يوم مخطط', 'pcs/d plan')}</>}
                                                        {x.aUnOrdre && <> · {L('prêts', 'جاهزة', 'ready')} <b className="text-slate-700 dark:text-dk-text-soft">{fmtN(x.prets)}</b></>}
                                                    </p>
                                                    {x.aUnOrdre && !x.plusTard && (
                                                        <div className="mt-1 flex items-center gap-2">
                                                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-dk-elevated overflow-hidden">
                                                                <div className={`h-full rounded-full ${partAvance < 0.5 ? 'bg-rose-500' : partAvance < 1 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.round(partAvance * 100)}%` }} />
                                                            </div>
                                                            <span className="text-[10px] tabular-nums text-slate-500 dark:text-dk-muted shrink-0">{L('avance', 'تقدّم', 'buffer')} {avance !== null ? `${avance} ${L('j', 'ي', 'd')}` : '—'} / {joursAvance} {L('j', 'ي', 'd')}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 3. Sa serie : les paquets que la serie donne a cette chaine */}
                                                <span className="font-bold uppercase tracking-wide text-slate-400 text-[9px]">{L('Série', 'السيري', 'Series')}</span>
                                                <p className="text-slate-500 dark:text-dk-muted tabular-nums truncate">
                                                    {x.serie
                                                        ? <><b className="text-slate-700 dark:text-dk-text-soft">{fmtN(x.serie.debut)} → {fmtN(x.serie.fin)}</b> · {x.serie.paquets} {L('paquets', 'حزمة', 'bundles')} · {L('entrés', 'دخلت', 'in')} {x.serie.entres} · {L('sortis', 'خرجت', 'out')} {x.serie.sortis}</>
                                                        : x.serieAbsente ? <span className="text-orange-700 dark:text-orange-300">{L('aucun paquet donné à cette chaîne', 'لم تُعطَ أي حزمة لهذه السلسلة', 'no bundle given to this line')}</span>
                                                            : '—'}
                                                </p>

                                                {/* 4. L'ordre de coupe : quoi couper, dans l'ordre de la production */}
                                                <span className="font-bold uppercase tracking-wide text-slate-400 text-[9px]">{L('Coupe', 'القص', 'Cut')}</span>
                                                <ACouper x={x} L={L} jour={jour} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            {onNavigate && (
                <div className="sm:hidden mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => onNavigate('planning')} className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft"><CalendarDays className="w-4 h-4" />{L('Planning', 'التخطيط', 'Planning')}</button>
                    <button type="button" onClick={() => onNavigate('suivi')} className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft"><Activity className="w-4 h-4" />{L('Suivi de production', 'متابعة الإنتاج', 'Production follow-up')}</button>
                </div>
            )}
            {editeurModal}
        </div>
    );
}

/** Toute la chaine : pour chaque modele, son suivi des derniers jours, sa serie par taille, et chaque matelas a couper. */
function DetailChaine({ chaine, reglage, joursAvance, modeleDe, jour, L, onOpen, onCadence, onRetirer }: {
    chaine: ChaineCoupe;
    reglage?: ReglageChaineCoupe;
    joursAvance: number;
    modeleDe: (id: string) => ModelData | undefined;
    jour: (iso: string | null) => string;
    L: (fr: string, ar: string, en: string) => string;
    onOpen: (m: ModelData) => void;
    onCadence: (modelId: string, v: number | undefined) => void;
    onRetirer: (modelId: string) => void;
}) {
    const { lang } = useLang();
    const st = ETATS_CHAINE[chaine.etat];
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                    { l: L('État', 'الحالة', 'Status'), v: tx(lang, st), cls: st.cls },
                    { l: L('Modèles', 'موديلات', 'Models'), v: String(chaine.modeles.length) },
                    { l: L('Matelas à couper', 'مفرشات للقص', 'Lays to cut'), v: fmtN(chaine.matelasACouper), cls: chaine.matelasACouper > 0 ? ORANGE_DOUX : undefined },
                    { l: L('Pièces à couper', 'قطع للقص', 'Pieces to cut'), v: fmtN(chaine.piecesACouper), cls: chaine.piecesACouper > 0 ? ORANGE_DOUX : undefined },
                ].map(k => (
                    <div key={k.l} className={`rounded-xl px-3 py-2 min-w-0 ${k.cls || 'bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border'}`}>
                        <p className="text-[9px] font-bold uppercase tracking-wide opacity-70 truncate">{k.l}</p>
                        <p className="text-[16px] font-bold tabular-nums truncate">{k.v}</p>
                    </div>
                ))}
            </div>

            {chaine.modeles.length === 0 && (
                <p className="px-4 py-6 text-center text-[12px] text-slate-400 bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border">{L('Aucun modèle sur cette chaîne. Donnez-lui un modèle avec « Régler ».', 'لا موديل على هذه السلسلة. أعطها موديلاً عبر «ضبط».', 'No model on this line. Give it one with Edit.')}</p>
            )}

            {chaine.modeles.map(x => {
                const m = modeleDe(x.modelId);
                const donneAMain = (reglage?.modeles || []).includes(x.modelId);
                const jours = x.jours;
                return (
                    <section key={x.eventId} className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden">
                        <header className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 border-b border-slate-100 dark:border-dk-border">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-dk-elevated shrink-0 flex items-center justify-center">
                                {x.image ? <img src={x.image} alt="" className="w-full h-full object-cover" /> : <Scissors className="w-4 h-4 text-slate-300" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold text-slate-900 dark:text-dk-text truncate">{x.nom}</p>
                                <p className="text-[11px] text-slate-500 dark:text-dk-muted truncate">{[x.client, x.lancement ? `${L('lancement', 'الانطلاق', 'start')} ${jour(x.lancement)}` : '', x.dds ? `DDS ${jour(x.dds)}` : '', `${fmtN(x.commande)} ${L('pcs', 'قطعة', 'pcs')}`].filter(Boolean).join(' · ')}</p>
                            </div>
                            {donneAMain && <button type="button" onClick={() => onRetirer(x.modelId)} title={L('Retirer ce modèle de la chaîne', 'إزالة الموديل من السلسلة', 'Remove from the line')} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><X className="w-4 h-4" /></button>}
                            {m && x.aUnOrdre && <button type="button" onClick={() => onOpen(m)} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft hover:border-indigo-300 shrink-0">{L('Ouvrir l’ordre', 'فتح الأمر', 'Open order')}<ChevronRight className="w-3.5 h-3.5" /></button>}
                        </header>

                        <div className="p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 text-[12px]">
                            {/* Suivi */}
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{L('Suivi de production', 'متابعة الإنتاج', 'Production follow-up')}</p>
                                <div className="grid grid-cols-3 gap-1.5 text-center mb-2">
                                    {[
                                        { l: L('Prêts', 'جاهزة', 'Ready'), v: fmtN(x.prets) },
                                        { l: L('Entré', 'دخل', 'In'), v: fmtN(x.entre) },
                                        { l: L('Sorti', 'خرج', 'Out'), v: fmtN(x.sorti) },
                                    ].map(k => (
                                        <div key={k.l} className="rounded-lg bg-slate-50 dark:bg-dk-bg py-1.5">
                                            <p className="text-[9px] font-bold uppercase text-slate-400">{k.l}</p>
                                            <p className="text-[14px] font-bold tabular-nums text-slate-800 dark:text-dk-text">{k.v}</p>
                                        </div>
                                    ))}
                                </div>
                                {/* Cadence : celle du Suivi ou du Planning, ou celle qu'on fixe a la main */}
                                <label className="flex items-center gap-2 mb-2">
                                    <span className="text-slate-500 dark:text-dk-muted shrink-0">{L('Cadence pcs/j', 'الوتيرة ق/يوم', 'Rate pcs/d')}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={reglage?.cadences?.[x.modelId] || ''}
                                        onChange={e => onCadence(x.modelId, e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)))}
                                        placeholder={String(x.cadence || '')}
                                        className="h-8 w-24 px-2 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-bg text-[12px] font-bold tabular-nums outline-none focus:border-orange-400"
                                    />
                                    <span className="text-[10px] text-slate-400">{x.sourceCadence === 'manuel' ? L('réglé', 'مضبوط', 'set') : x.sourceCadence === 'suivi' ? L('réel (Suivi)', 'فعلي (المتابعة)', 'actual') : L('plan (Planning)', 'مخطط (التخطيط)', 'planned')}</span>
                                </label>
                                {jours.length > 0 ? (
                                    <table className="w-full tabular-nums text-[11px]">
                                        <thead><tr className="text-slate-400 text-left"><th className="font-semibold py-0.5">{L('Jour', 'اليوم', 'Day')}</th><th className="font-semibold text-right">{L('Entré', 'دخل', 'In')}</th><th className="font-semibold text-right">{L('Sorti', 'خرج', 'Out')}</th></tr></thead>
                                        <tbody>{jours.map(j => <tr key={j.date} className="border-t border-slate-100 dark:border-dk-border"><td className="py-0.5">{jour(j.date)}</td><td className="text-right">{fmtN(j.entre)}</td><td className="text-right font-semibold">{fmtN(j.sorti)}</td></tr>)}</tbody>
                                    </table>
                                ) : <p className="text-slate-400">{L('Aucune saisie au Suivi pour cette chaîne.', 'لا تسجيل في المتابعة لهذه السلسلة.', 'No follow-up entries yet.')}</p>}
                                {x.aUnOrdre && !x.plusTard && (
                                    <p className="mt-2 text-slate-500 dark:text-dk-muted">{L('Avance de la coupe', 'تقدّم القص', 'Cutting buffer')} : <b className="text-slate-700 dark:text-dk-text-soft tabular-nums">{fmtN(x.enAttente)} {L('pcs', 'ق', 'pcs')}{x.joursAvance !== null ? ` · ${Math.round(x.joursAvance * 10) / 10} ${L('j', 'ي', 'd')}` : ''}</b> / {joursAvance} {L('j', 'ي', 'd')}</p>
                                )}
                            </div>

                            {/* Serie */}
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{L('Série de la chaîne', 'سيري السلسلة', 'Series of this line')}</p>
                                {x.serie ? (
                                    <>
                                        <p className="text-[15px] font-bold tabular-nums text-slate-800 dark:text-dk-text">{fmtN(x.serie.debut)} → {fmtN(x.serie.fin)}</p>
                                        <p className="text-slate-500 dark:text-dk-muted mb-2">{x.serie.paquets} {L('paquets', 'حزمة', 'bundles')} · {L('entrés', 'دخلت', 'in')} {x.serie.entres} · {L('sortis', 'خرجت', 'out')} {x.serie.sortis}</p>
                                        <div className="flex flex-wrap gap-1">
                                            {x.parTaille.map(t => (
                                                <span key={t.taille} className="px-1.5 h-6 inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-dk-elevated tabular-nums text-[11px] text-slate-600 dark:text-dk-text-soft">
                                                    <b className="uppercase text-slate-800 dark:text-dk-text">{t.taille}</b>{fmtN(t.coupees)}/{fmtN(t.pieces)}
                                                </span>
                                            ))}
                                        </div>
                                    </>
                                ) : x.serieAbsente
                                    ? <p className="text-orange-700 dark:text-orange-300">{L('La série existe mais aucun paquet n’est donné à cette chaîne : donnez-lui des paquets dans la page Série de l’ordre.', 'السيري موجود لكن لا حزمة معطاة لهذه السلسلة: أعطها حزماً من صفحة السيري في الأمر.', 'No bundle is given to this line.')}</p>
                                    : <p className="text-slate-400">{L('Pas de série pour ce modèle.', 'لا سيري لهذا الموديل.', 'No series for this model.')}</p>}
                            </div>

                            {/* Coupe */}
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{L('Ordre de coupe', 'أمر القص', 'Cutting order')}</p>
                                <ACouper x={x} L={L} jour={jour} large />
                                {x.aCouperTous.length > 0 && (
                                    <div className="mt-2">
                                        <p className="text-slate-500 dark:text-dk-muted mb-1">{L('Tous les matelas restants, dans l’ordre de la série', 'كل المفرشات المتبقية بترتيب السيري', 'All remaining lays, in series order')} ({x.aCouperTous.length})</p>
                                        <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                                            {x.aCouperTous.map(c => (
                                                <span key={c.id} title={c.debut !== null ? `${L('série', 'سيري', 'series')} ${c.debut}–${c.fin}` : undefined} className={`px-1.5 h-6 inline-flex items-center gap-1 rounded-md tabular-nums text-[11px] ${c.choisi ? `font-bold ${ORANGE_PLEIN}` : 'bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted'}`}>
                                                    {c.numero || '?'}<span className="opacity-70 font-normal">{fmtN(c.pieces)}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

/** Regler les chaines de la coupe : nom, autres noms, cadence, modeles. Le Planning ne bouge pas. */
function EditeurChaines({ depart, modeles, onFermer, onEnregistrer, onRevenir }: {
    depart: ReglageChaineCoupe[];
    modeles: ModelData[];
    onFermer: () => void;
    onEnregistrer: (r: ReglageChaineCoupe[]) => void;
    onRevenir?: () => void;
}) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const [liste, setListe] = useState<ReglageChaineCoupe[]>(() => depart.map(c => ({ ...c })));
    const maj = (i: number, p: Partial<ReglageChaineCoupe>) => setListe(l => l.map((c, k) => (k === i ? { ...c, ...p } : c)));
    const nomModele = (id: string) => { const m = modeles.find(x => x.id === id); return m?.ordreCoupe?.refModele || m?.meta_data?.nom_modele || id; };
    const ajouter = () => setListe(l => {
        let n = l.length + 1;
        while (l.some(c => c.id === `COUPE ${n}`)) n++;
        return [...l, { id: `COUPE ${n}`, nom: `${L('Chaîne', 'سلسلة', 'Line')} ${l.length + 1}` }];
    });
    const champ = 'h-9 px-2.5 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-bg text-[13px] outline-none focus:border-indigo-400';
    return (
        <SheetModal
            onClose={onFermer}
            size="md"
            zClass="z-[95]"
            title={L('Régler les chaînes de la coupe', 'ضبط سلاسل القص', 'Set the cutting lines')}
            subtitle={L('Seulement dans La Coupe : le Planning et le Suivi ne changent pas.', 'داخل القص فقط: التخطيط والمتابعة لا يتغيّران.', 'Cutting only: Planning and Follow-up do not change.')}
            bodyClassName="flex-1 overflow-y-auto min-h-0 p-4 space-y-3"
        >
            {liste.map((c, i) => (
                <div key={c.id} className="rounded-xl border border-slate-200 dark:border-dk-border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                        <input value={c.nom} onChange={e => maj(i, { nom: e.target.value })} placeholder={L('Nom', 'الاسم', 'Name')} className={`${champ} flex-1 min-w-0 font-semibold`} />
                        <button type="button" onClick={() => setListe(l => l.filter((_, k) => k !== i))} title={L('Supprimer cette chaîne', 'حذف السلسلة', 'Delete line')} className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-2">
                        <label className="block min-w-0">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{L('Autres noms (séparés par une virgule)', 'أسماء أخرى (بفاصلة)', 'Other names (comma separated)')}</span>
                            <input value={(c.alias || []).join(', ')} onChange={e => maj(i, { alias: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} placeholder="STAR1+2, CHAINE 1" className={`${champ} w-full`} />
                        </label>
                        <label className="block">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{L('Cadence pcs/j', 'الوتيرة ق/يوم', 'Rate pcs/d')}</span>
                            <input type="number" min="0" value={c.cadence || ''} onChange={e => maj(i, { cadence: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} placeholder={L('auto', 'تلقائي', 'auto')} className={`${champ} w-full tabular-nums`} />
                        </label>
                    </div>
                    <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{L('Modèles donnés à cette chaîne', 'موديلات معطاة لهذه السلسلة', 'Models given to this line')}</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {(c.modeles || []).map(id => (
                                <span key={id} className="h-7 pl-2 pr-1 inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-dk-elevated text-[12px] font-semibold text-slate-700 dark:text-dk-text-soft">
                                    {nomModele(id)}
                                    <button type="button" onClick={() => maj(i, { modeles: (c.modeles || []).filter(x => x !== id) })} className="h-5 w-5 inline-flex items-center justify-center rounded text-slate-400 hover:text-rose-600"><X className="w-3 h-3" /></button>
                                </span>
                            ))}
                            <select
                                value=""
                                onChange={e => { if (e.target.value) maj(i, { modeles: [...(c.modeles || []), e.target.value] }); }}
                                className="h-7 px-2 rounded-lg border border-dashed border-slate-300 dark:border-dk-border bg-transparent text-[12px] text-slate-500 outline-none"
                            >
                                <option value="">+ {L('Ajouter un modèle', 'إضافة موديل', 'Add a model')}</option>
                                {modeles.filter(m => !(c.modeles || []).includes(m.id)).map(m => <option key={m.id} value={m.id}>{nomModele(m.id)}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            ))}
            <button type="button" onClick={ajouter} className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 dark:border-dk-border text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft hover:border-indigo-300"><Plus className="w-4 h-4" />{L('Ajouter une chaîne', 'إضافة سلسلة', 'Add a line')}</button>
            <div className="flex items-center justify-between gap-2 pt-1">
                {onRevenir ? <button type="button" onClick={onRevenir} className="h-10 px-3 rounded-lg text-[12px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-dk-elevated">{L('Revenir aux chaînes du Planning', 'الرجوع لسلاسل التخطيط', 'Back to Planning lines')}</button> : <span />}
                <div className="flex gap-2">
                    <button type="button" onClick={onFermer} className="h-10 px-4 rounded-lg border border-slate-200 dark:border-dk-border text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft">{L('Annuler', 'إلغاء', 'Cancel')}</button>
                    <button type="button" onClick={() => onEnregistrer(liste.filter(c => c.nom.trim()).map(c => ({ ...c, nom: c.nom.trim() })))} className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-dk-accent text-white text-[12px] font-bold"><Check className="w-4 h-4" />{L('Enregistrer', 'حفظ', 'Save')}</button>
                </div>
            </div>
        </SheetModal>
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
                        <p className="text-[11px] text-slate-400 text-center py-4">{tx(lang, { fr: 'Ajoutez d\'abord les ouvriers de coupe (au-dessus).', ar: 'أضف أولاً عمّال القص (في الأعلى).', en: 'Add the cutting workers first (above).' })}</p>
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
    rh: AtelierCoupe;
    onBack: () => void;
}) {
    const { lang } = useLang();
    const [nouvelOuvrier, setNouvelOuvrier] = useState('');
    const ajouterOuvrier = () => { rh.ajouter(nouvelOuvrier); setNouvelOuvrier(''); };
    const [ouvrierASupprimer, setOuvrierASupprimer] = useState<OuvrierCoupe | null>(null);
    /** Ordres en cours ou le groupe a coupe, avec ses matelas et ses metres. */
    const ordresDuGroupe = (id: string) => {
        const ouverts = new Map(models.filter(estOuvert).map(m => [m.id, m]));
        const par = new Map<string, { nom: string; nb: number; metres: number }>();
        for (const x of executes) {
            if (x.groupeId !== id || !ouverts.has(x.modelId)) continue;
            const c = par.get(x.modelId) || { nom: x.modele || '—', nb: 0, metres: 0 };
            c.nb++; c.metres += x.metres;
            par.set(x.modelId, c);
        }
        return [...par.values()].sort((a, b) => b.nb - a.nb);
    };
    const [edition, setEdition] = useState<GroupeCoupe | 'nouveau' | null>(null);
    const [aSupprimer, setASupprimer] = useState<GroupeCoupe | null>(null);
    const [periode, setPeriode] = useState<Periode>('7j');
    const [filtreGroupe, setFiltreGroupe] = useState<string | null>(null);
    const [limite, setLimite] = useState(50);

    const presence = useMemo(() => presenceGroupes(groupes, rh.ouvriers, rh.pointage, rh.date), [groupes, rh.ouvriers, rh.pointage, rh.date]);
    const executes = useMemo(() => matelasExecutes(models), [models]);
    const depuis = debutPeriode(periode);
    const stats = useMemo(() => statsGroupes(executes, groupes, depuis), [executes, groupes, depuis]);
    /** Temps standard, appris de tout l'historique chronometre (pas seulement la periode affichee). */
    const standard = useMemo(() => tempsStandard(executes), [executes]);
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
                sousTitre={`${tx(lang, { fr: 'Présence du', ar: 'حضور يوم', en: 'Attendance of' })} ${rh.date.split('-').reverse().join('/')}`}
                onBack={onBack}
            />

            <Resume items={[
                { label: tx(lang, { fr: 'Groupes', ar: 'المجموعات', en: 'Groups' }), valeur: fmtN(groupes.length) },
                { label: tx(lang, { fr: 'Présents', ar: 'الحاضرة', en: 'Present' }), valeur: `${presence.filter(p => p.estPresent).length}`, ton: 'text-emerald-600 dark:text-emerald-400' },
                { label: tx(lang, { fr: 'Ouvriers', ar: 'العمّال', en: 'Workers' }), valeur: `${presentsTotal}/${groupes.reduce((s, g) => s + g.membres.length, 0)}` },
            ]} />

            {/* Ouvriers de la salle de coupe : saisis ici, sans la RH */}
            <div className="mb-4 bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-[13px] font-semibold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Ouvriers de coupe', ar: 'عمّال القص', en: 'Cutting workers' })} <span className="text-[11px] font-normal text-slate-400">· {rh.liste.length}</span></h3>
                </div>
                <div className="flex gap-2 mb-2">
                    <input
                        value={nouvelOuvrier}
                        onChange={e => setNouvelOuvrier(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') ajouterOuvrier(); }}
                        placeholder={tx(lang, { fr: 'Nom de l\'ouvrier', ar: 'اسم العامل', en: 'Worker name' })}
                        className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg text-[13px] outline-none focus:border-indigo-400"
                    />
                    <button type="button" disabled={!nouvelOuvrier.trim()} onClick={ajouterOuvrier} className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-dk-accent text-white text-[12px] font-semibold disabled:opacity-40 shrink-0">
                        <Plus className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add' })}
                    </button>
                </div>
                {rh.liste.length === 0 ? (
                    <p className="text-[11px] text-slate-400">{tx(lang, { fr: 'Ajoutez les ouvriers qui étalent et coupent, puis formez les groupes.', ar: 'أضف العمّال الذين يفرشون ويقصّون، ثم كوّن المجموعات.', en: 'Add the workers who spread and cut, then build the groups.' })}</p>
                ) : (
                    <div className="flex flex-wrap gap-1">
                        {rh.liste.map(o => (
                            <span key={o.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-slate-100 dark:bg-dk-elevated text-[11px] font-medium text-slate-700 dark:text-dk-text">
                                <span className="truncate max-w-[140px]">{o.nom}</span>
                                <button type="button" onClick={() => setOuvrierASupprimer(o)} className="w-5 h-5 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50" title={tx(lang, { fr: 'Retirer', ar: 'حذف', en: 'Remove' })}>
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

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
                    <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">{tx(lang, { fr: 'Créez un groupe et choisissez ses ouvriers ; pointez-les ici chaque jour en cliquant sur leur nom.', ar: 'أنشئ مجموعة واختر عمّالها، ثم سجّل حضورهم هنا كل يوم بالنقر على أسمائهم.', en: 'Create a group, pick its workers, and mark them here each day by clicking their name.' })}</p>
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
                                    // Un clic pointe l'ouvrier : present, puis absent, puis present...
                                    const suivant = estAuTravail(mb.statut) ? 'ABSENT' : 'PRESENT';
                                    return (
                                        <button
                                            key={mb.id}
                                            type="button"
                                            disabled={mb.inconnu}
                                            onClick={() => rh.pointer([mb.id], suivant)}
                                            title={`${tx(lang, s)}${mb.entree ? ` · ${mb.entree}` : ''} — ${tx(lang, { fr: 'cliquez pour pointer', ar: 'انقر للتسجيل', en: 'click to mark' })}`}
                                            className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors ${estAuTravail(mb.statut) ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' : mb.statut === 'ABSENT' ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 line-through' : 'bg-slate-50 dark:bg-dk-elevated border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted'}`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${s.point}`} />
                                            <span className="truncate max-w-[110px]">{mb.nom}</span>
                                            {mb.entree && estAuTravail(mb.statut) && <span className="text-[9px] opacity-70 tabular-nums">{mb.entree}</span>}
                                            {mb.inconnu && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                                        </button>
                                    );
                                })}
                                {(p?.membres || []).some(mb => !mb.inconnu && !estAuTravail(mb.statut)) && (
                                    <button type="button" onClick={() => rh.pointer((p?.membres || []).filter(mb => !mb.inconnu && mb.statut !== 'ABSENT').map(mb => mb.id), 'PRESENT')} className="h-7 px-2 rounded-full text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                                        {tx(lang, { fr: 'Tous présents', ar: 'الكل حاضر', en: 'All present' })}
                                    </button>
                                )}
                            </div>
                            {(() => {
                                const absents = (p?.membres || []).filter(mb => mb.statut === 'ABSENT').length;
                                const encours = ordresDuGroupe(g.id);
                                return (
                                    <>
                                        {absents > 0 && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 mb-1.5">{absents} {tx(lang, { fr: 'absent(s) aujourd\'hui', ar: 'غائب اليوم', en: 'absent today' })}</p>}
                                        {encours.length > 0 && (
                                            <div className="mb-2">
                                                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{tx(lang, { fr: 'Ordres en cours coupés', ar: 'طلبات جارية قصّتها', en: 'Open orders cut' })}</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {encours.map(o => (
                                                        <span key={o.nom} className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-indigo-50 dark:bg-indigo-900/20 text-[10px] text-indigo-800 dark:text-indigo-300">
                                                            <b className="truncate max-w-[120px]">{o.nom}</b> · {o.nb} {tx(lang, { fr: 'mat.', ar: 'مفرشة', en: 'lays' })} · {fmtM(o.metres)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
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

            {/* Temps standard : ce que la base des matelas chronometres permet de prevoir */}
            <div className="mb-5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg text-[12px] text-slate-600 dark:text-dk-muted">
                <span className="font-semibold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Temps standard d’un matelas', ar: 'الوقت المعياري للمفرشة', en: 'Standard lay time' })} : </span>
                {standard ? (
                    <>
                        {standard.fixeMin > 0 && <>{Math.round(standard.fixeMin)} min + </>}
                        {standard.minParMetre.toFixed(2)} min/m
                        <span className="text-slate-400"> · {tx(lang, { fr: 'ex. 100 m ≈', ar: 'مثلاً 100 م ≈', en: 'e.g. 100 m ≈' })} {texteDuree(minutesPrevues(standard, 100))} · {standard.n} {tx(lang, { fr: 'matelas chronométrés', ar: 'مفرشة موقّتة', en: 'timed lays' })}</span>
                    </>
                ) : (
                    <span className="text-slate-400">{tx(lang, { fr: 'il faut au moins 3 matelas avec début et fin pointés.', ar: 'يلزم 3 مفرشات على الأقل سُجّلت بدايتها ونهايتها.', en: 'needs at least 3 lays with start and end.' })}</span>
                )}
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

            {ouvrierASupprimer && (
                <div className="fixed inset-0 z-[95] bg-slate-900/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOuvrierASupprimer(null)}>
                    <div className="w-full sm:max-w-sm bg-white dark:bg-dk-surface rounded-t-2xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-[14px] font-semibold text-slate-900 dark:text-dk-text">{tx(lang, { fr: 'Retirer', ar: 'حذف', en: 'Remove' })} « {ouvrierASupprimer.nom} » ?</h3>
                        <p className="text-[12px] text-slate-500 mt-1">{tx(lang, { fr: 'Il sort de son groupe. Les matelas deja coupes par le groupe ne changent pas.', ar: 'يخرج من مجموعته. المفرشات التي قصّتها المجموعة لا تتغيّر.', en: 'Leaves their group. Lays already cut do not change.' })}</p>
                        <div className="flex justify-end gap-2 mt-5">
                            <button type="button" onClick={() => setOuvrierASupprimer(null)} className="h-10 px-4 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-100">{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel' })}</button>
                            <button type="button" onClick={() => { rh.retirer(ouvrierASupprimer.id); setOuvrierASupprimer(null); }} className="h-10 px-4 rounded-lg text-[12px] font-semibold bg-rose-600 text-white">{tx(lang, { fr: 'Retirer', ar: 'حذف', en: 'Remove' })}</button>
                        </div>
                    </div>
                </div>
            )}
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
