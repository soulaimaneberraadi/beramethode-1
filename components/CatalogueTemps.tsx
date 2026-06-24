import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from './planning/shared/useIsMobile';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';
import type { ModelData, AppSettings, ChronoData, Operation } from '../types';
import {
    Search, X, Layers, Boxes, Cpu, Gauge, TrendingUp,
    Database, Sparkles, ArrowUpDown, ShieldCheck, CircleAlert, Shirt, User, Ruler,
    ChevronDown, Plus, Check, ArrowUpRight,
} from 'lucide-react';

const CUSTOM_CAT_KEY = 'catalogue_temps_custom_categories_v1';

interface CatalogueTempsProps {
    models: ModelData[];
    settings?: AppSettings;
    /** Ouvre le profil d'un opérateur dans Gestion RH. */
    onOpenWorker?: (name: string) => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// CATALOGUE DE TEMPS — bâti à partir des TEMPS RÉELS mesurés au Chronométrage
// (temps moyen brut = tempMajore / majoration, en minutes, indépendant de l'unité).
// Les opérations sont regroupées par un algorithme de similarité (fuzzy) :
// "Assembler épaules" ≈ "assembli les epol" ≈ "ass les epoul" → même entrée.
// La désambiguïsation utilise la machine + la longueur (length) de la gamme.
// ──────────────────────────────────────────────────────────────────────────────

type Measure = {
    modelId: string;
    modelName: string;
    reference: string;
    client: string;         // Client (Fiche Technique)
    category: string;       // Catégorie (Fiche Technique)
    matiere: string;        // Matière principale / désignation
    operationDesc: string;  // libellé original de l'opération
    machine: string;        // libellé machine
    machineKey: string;     // machine normalisée (301, 514…)
    section?: string;
    operator?: string;      // nom du poste / opérateur
    length?: number;        // longueur de couture (gamme)
    timeMin: number;        // temps brut, minutes
    measured: boolean;      // true = relevé chrono réel, false = TS gamme (estimé)
};

type CatalogEntry = {
    key: string;
    description: string;        // libellé représentatif
    variants: string[];         // libellés fusionnés
    machine: string;
    machineKey: string;
    section?: string;
    avg: number; min: number; max: number; count: number;
    measuredCount: number;     // nb de relevés chrono réels
    categories: string[];
    matieres: string[];
    operators: string[];
    clients: string[];
    sources: Measure[];
};

// ── Normalisation / similarité ────────────────────────────────────────────────
const deaccent = (s: string) => s.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');

const STOP = new Set(['de', 'la', 'le', 'les', 'des', 'du', 'avec', 'et', 'en', 'sur', 'a', 'l', 'd', 'au', 'aux', 'un', 'une']);

// Dictionnaire de stems → forme canonique (textile FR / darija).
// Les stems "longs" matchent par PRÉFIXE ; les stems "courts/ambigus" par exact.
const STEM_PREFIX: [RegExp, string][] = [
    [/^(assembl|asambl|asembl|ass)/, 'assembler'],
    [/^(montag|monter|mont)/, 'montage'],
    [/^(prepar|pripar|prip|prepa)/, 'preparation'],
    [/^(coul|cout|coud)/, 'couture'],
    [/^(manch)/, 'manche'],
    [/^(epaul|epol|epoul)/, 'epaule'],
    [/^(surfil|surfl)/, 'surfiler'],
    [/^(ourl)/, 'ourlet'],
    [/^(glac|glaci)/, 'glacer'],
    [/^(dentil|dentell|dentel)/, 'dentelle'],
    [/^(francag|francais|franc)/, 'francais'],
    [/^(bouton|boutonn)/, 'boutonniere'],
    [/^(bord|border)/, 'bordure'],
    [/^(doubl)/, 'double'],
    [/^(tiki|etiq|etiquet|marka|marque)/, 'etiquette'],
    [/^(fermetur|snsl)/, 'fermeture'],
    [/^(poch)/, 'poche'],
    [/^(pinc)/, 'pince'],
    [/^(piec)/, 'piece'],
    [/^(empicem|empiecement)/, 'empiecement'],
    [/^(mech)/, 'mechwar'],
];
// stems courts/ambigus → match EXACT uniquement
const STEM_EXACT: Record<string, string> = {
    m: 'montage', ghli: 'ourlet', bt: 'boutonniere', br: 'bordure',
    dov: 'double', dou: 'double', zip: 'fermeture', col: 'col', bas: 'bas',
};

const canonTokens = (s: string): string[] => {
    const raw = deaccent((s || '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
    const out: string[] = [];
    for (let tok of raw) {
        if (!tok || STOP.has(tok)) continue;
        if (tok.length > 3 && tok.endsWith('s')) tok = tok.slice(0, -1); // pluriel
        if (STEM_EXACT[tok]) { out.push(STEM_EXACT[tok]); continue; }
        for (const [re, canon] of STEM_PREFIX) { if (re.test(tok)) { tok = canon; break; } }
        out.push(tok);
    }
    return out;
};

const jaccard = (a: Set<string>, b: Set<string>) => {
    if (!a.size && !b.size) return 1;
    let inter = 0;
    a.forEach(x => { if (b.has(x)) inter++; });
    return inter / (a.size + b.size - inter);
};

const lev = (a: string, b: string): number => {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
        let cur = [i, ...new Array(n).fill(0)];
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = cur;
    }
    return prev[n];
};
const levRatio = (a: string, b: string) => {
    const L = Math.max(a.length, b.length);
    return L === 0 ? 1 : 1 - lev(a, b) / L;
};

// Score de similarité combiné entre deux signatures
const similarity = (ta: string[], tb: string[]) => {
    const sa = new Set(ta), sb = new Set(tb);
    const j = jaccard(sa, sb);
    const la = [...ta].sort().join(' '), lb = [...tb].sort().join(' ');
    const r = levRatio(la, lb);
    return 0.6 * j + 0.4 * r;
};

const normMachine = (m: string): string => {
    const s = deaccent((m || '').toLowerCase());
    const digits = s.match(/\b(301|302|514|516|504|602|316|406|605)\b/);
    if (digits) return digits[1];
    return s.replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'machine';
};

const SIM_THRESHOLD = 0.7;
function sectionLabelFor(lang: import('../app/constants').Lang | string | null | undefined, key: string): string {
    const map: Record<string, ReturnType<typeof tx>> = {
        PREPARATION: tx(lang, { fr: 'Préparation', ar: 'تحضير', en: 'Preparation', es: 'Preparación', pt: 'Preparação', tr: 'Hazırlık' }),
        MONTAGE: tx(lang, { fr: 'Montage', ar: 'تركيب', en: 'Assembly', es: 'Montaje', pt: 'Montagem', tr: 'Montaj' }),
        GLOBAL: tx(lang, { fr: 'Global', ar: 'عام', en: 'Global', es: 'Global', pt: 'Global', tr: 'Genel' }),
    };
    return map[key] || key;
}

// ── Extraction du temps réel mesuré (minutes), indépendant de l'unité ──────────
function measuredTimeMin(cd: ChronoData | undefined): number | null {
    if (!cd) return null;
    const maj = cd.majoration || 1.15;
    if (cd.tempMajore && cd.tempMajore > 0) return cd.tempMajore / maj; // tm brut en minutes
    return null; // pas de mesure réelle
}

// trouve les ChronoData d'une opération (clé = opId ou stId__opId)
function chronoForOp(chronoData: Record<string, ChronoData> | undefined, opId: string): ChronoData[] {
    if (!chronoData) return [];
    const out: ChronoData[] = [];
    for (const k of Object.keys(chronoData)) {
        if (k === opId || k.endsWith(`__${opId}`)) out.push(chronoData[k]);
    }
    return out;
}

export default function CatalogueTemps({ models, onOpenWorker }: CatalogueTempsProps) {
    const { lang } = useLang();
    const [query, setQuery] = useState('');
    const [machineFilter, setMachineFilter] = useState<string | null>(null);
    const [matiereFilter, setMatiereFilter] = useState<string | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [clientFilter, setClientFilter] = useState<string | null>(null);
    const [operatorFilter, setOperatorFilter] = useState<string | null>(null);
    const [sectionFilter, setSectionFilter] = useState<string | null>(null);
    const [unit, setUnit] = useState<'min' | 'sec'>('sec');
    const [sortBy, setSortBy] = useState<'count' | 'time' | 'alpha'>('count');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [customCategories, setCustomCategories] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem(CUSTOM_CAT_KEY) || '[]'); } catch { return []; }
    });
    const addCustomCategory = (name: string) => {
        const v = name.trim();
        if (!v) return;
        setCustomCategories(prev => {
            if (prev.includes(v)) return prev;
            const next = [...prev, v];
            try { localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(next)); } catch {}
            return next;
        });
        setCategoryFilter(v);
    };

    // — 1) Collecte des mesures RÉELLES —
    const { measures, modelCount } = useMemo(() => {
        const list: Measure[] = [];
        const modelSet = new Set<string>();

        for (const m of models) {
            const ops: Operation[] = m.gamme_operatoire || [];
            if (!ops.length) continue;
            const modelName = m.meta_data?.nom_modele || m.filename || 'Modèle';
            const reference = m.meta_data?.reference || m.ficheData?.designation || '';
            const category = m.ficheData?.category || m.meta_data?.category || '—';
            const matiere = m.ficheData?.designation || '—';
            const client = m.ficheData?.client || '—';

            // opId → opérateur (depuis stations chrono)
            const opOperator = new Map<string, string>();
            (m.chronoCustomStations || []).forEach(st => {
                if (st.linkedOperationId && (st.operatorName || st.name)) {
                    opOperator.set(st.linkedOperationId, (st.operatorName || st.name)!);
                }
            });

            for (const op of ops) {
                if (!op.description) continue;
                // Priorité au relevé chrono réel ; sinon TS de la gamme (op.time, = colonne TS du Chrono)
                const cds = chronoForOp(m.chronoData, op.id);
                const realTimes = cds.map(measuredTimeMin).filter((x): x is number => x != null && x > 0);
                let timeMin: number;
                let measured: boolean;
                if (realTimes.length) {
                    timeMin = realTimes.reduce((a, b) => a + b, 0) / realTimes.length;
                    measured = true;
                } else if ((op.time || 0) > 0) {
                    timeMin = op.time;
                    measured = false;
                } else {
                    continue; // aucune donnée de temps
                }

                const machine = (op.machineName || op.machineClass || op.machineId || 'Machine').toString();
                modelSet.add(m.id);
                list.push({
                    modelId: m.id, modelName, reference, client, category, matiere,
                    operationDesc: op.description.trim(),
                    machine, machineKey: normMachine(machine),
                    section: op.section,
                    operator: opOperator.get(op.id),
                    length: op.length,
                    timeMin, measured,
                });
            }
        }

        return { measures: list, modelCount: modelSet.size };
    }, [models]);

    // — Facettes en cascade : chaque liste ne montre que les valeurs compatibles
    //   avec les AUTRES filtres actifs (filtrage croisé / dépendant). —
    const facets = useMemo(() => {
        const pass = (m: Measure, except: string) => {
            if (except !== 'machine' && machineFilter && m.machine !== machineFilter) return false;
            if (except !== 'matiere' && matiereFilter && m.matiere !== matiereFilter) return false;
            if (except !== 'category' && categoryFilter && m.category !== categoryFilter) return false;
            if (except !== 'client' && clientFilter && m.client !== clientFilter) return false;
            if (except !== 'operator' && operatorFilter && m.operator !== operatorFilter) return false;
            if (except !== 'section' && sectionFilter && (m.section || 'GLOBAL') !== sectionFilter) return false;
            return true;
        };
        const facet = (except: string, get: (m: Measure) => string | undefined) => {
            const mp = new Map<string, number>();
            for (const m of measures) {
                if (!pass(m, except)) continue;
                const v = get(m);
                if (!v || v === '—') continue;
                mp.set(v, (mp.get(v) || 0) + 1);
            }
            return Array.from(mp.entries()).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
        };
        return {
            machines: facet('machine', m => m.machine),
            matieres: facet('matiere', m => m.matiere),
            categories: facet('category', m => m.category),
            clients: facet('client', m => m.client),
            operators: facet('operator', m => m.operator),
            sections: facet('section', m => m.section || 'GLOBAL'),
        };
    }, [measures, machineFilter, matiereFilter, categoryFilter, clientFilter, operatorFilter, sectionFilter]);

    // — 2) Clustering fuzzy des mesures en entrées de catalogue —
    const entries = useMemo(() => {
        type Cluster = CatalogEntry & { _tokens: string[] };
        const clusters: Cluster[] = [];

        for (const mz of measures) {
            const toks = canonTokens(mz.operationDesc);
            if (!toks.length) continue;

            // candidats : même machine + similarité suffisante
            let best: Cluster | null = null;
            let bestScore = 0;
            for (const c of clusters) {
                if (c.machineKey !== mz.machineKey) continue;
                const score = similarity(toks, c._tokens);
                if (score < SIM_THRESHOLD) continue;
                // désambiguïsation par longueur si écart de temps important
                const ratio = c.avg > 0 ? Math.abs(mz.timeMin - c.avg) / c.avg : 0;
                if (ratio > 0.6 && mz.length && c.sources[0]?.length) {
                    const lr = Math.max(mz.length, c.sources[0].length!) / Math.max(1, Math.min(mz.length, c.sources[0].length!));
                    if (lr > 2) continue; // longueurs trop éloignées → opérations différentes
                }
                if (score > bestScore) { best = c; bestScore = score; }
            }

            if (best) {
                best.sources.push(mz);
                best.count++;
                if (mz.measured) best.measuredCount++;
                best.min = Math.min(best.min, mz.timeMin);
                best.max = Math.max(best.max, mz.timeMin);
                if (!best.variants.includes(mz.operationDesc)) best.variants.push(mz.operationDesc);
                if (mz.category !== '—' && !best.categories.includes(mz.category)) best.categories.push(mz.category);
                if (mz.matiere !== '—' && !best.matieres.includes(mz.matiere)) best.matieres.push(mz.matiere);
                if (mz.operator && !best.operators.includes(mz.operator)) best.operators.push(mz.operator);
                if (mz.client !== '—' && !best.clients.includes(mz.client)) best.clients.push(mz.client);
            } else {
                clusters.push({
                    key: `${clusters.length}-${mz.machineKey}`,
                    description: mz.operationDesc,
                    variants: [mz.operationDesc],
                    machine: mz.machine, machineKey: mz.machineKey,
                    section: mz.section,
                    avg: 0, min: mz.timeMin, max: mz.timeMin, count: 1,
                    measuredCount: mz.measured ? 1 : 0,
                    categories: mz.category !== '—' ? [mz.category] : [],
                    matieres: mz.matiere !== '—' ? [mz.matiere] : [],
                    operators: mz.operator ? [mz.operator] : [],
                    clients: mz.client !== '—' ? [mz.client] : [],
                    sources: [mz],
                    _tokens: toks,
                });
            }
        }

        // finalisation : moyenne + libellé représentatif (le plus fréquent)
        return clusters.map(c => {
            c.avg = c.sources.reduce((s, m) => s + m.timeMin, 0) / c.sources.length;
            const freq = new Map<string, number>();
            c.sources.forEach(m => freq.set(m.operationDesc, (freq.get(m.operationDesc) || 0) + 1));
            c.description = Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
            const { _tokens, ...rest } = c;
            return rest as CatalogEntry;
        });
    }, [measures]);

    // — 3) Filtres + tri —
    const visible = useMemo(() => {
        const q = deaccent(query.toLowerCase()).trim();
        let list = entries.filter(e => {
            if (machineFilter && e.machine !== machineFilter) return false;
            if (matiereFilter && !e.matieres.includes(matiereFilter)) return false;
            if (categoryFilter && !e.categories.includes(categoryFilter)) return false;
            if (clientFilter && !e.clients.includes(clientFilter)) return false;
            if (operatorFilter && !e.operators.includes(operatorFilter)) return false;
            if (sectionFilter && e.section !== sectionFilter) return false;
            if (!q) return true;
            return deaccent(e.description.toLowerCase()).includes(q)
                || e.variants.some(v => deaccent(v.toLowerCase()).includes(q))
                || deaccent(e.machine.toLowerCase()).includes(q)
                || e.operators.some(o => deaccent(o.toLowerCase()).includes(q))
                || e.clients.some(o => deaccent(o.toLowerCase()).includes(q));
        });
        list = list.sort((a, b) => {
            if (sortBy === 'alpha') return a.description.localeCompare(b.description);
            if (sortBy === 'time') return b.avg - a.avg;
            return b.count - a.count || b.avg - a.avg;
        });
        return list;
    }, [entries, query, machineFilter, matiereFilter, categoryFilter, clientFilter, operatorFilter, sectionFilter, sortBy]);

    const selected = useMemo(() => entries.find(e => e.key === selectedKey) || null, [entries, selectedKey]);

    const fmtTime = (min: number) => unit === 'sec' ? (min * 60).toFixed(1) : min.toFixed(3);
    const unitSuffix = unit === 'sec' ? 's' : 'min';

    const reliability = (count: number) =>
        count >= 3 ? { label: tx(lang, { fr: 'Fiable', ar: 'موثوق', en: 'Reliable', es: 'Confiable', pt: 'Confiável', tr: 'Güvenilir' }), cls: 'text-emerald-600 bg-emerald-50 ring-emerald-100', dot: 'bg-emerald-500' }
        : count === 2 ? { label: tx(lang, { fr: 'Moyen', ar: 'متوسط', en: 'Medium', es: 'Medio', pt: 'Médio', tr: 'Orta' }), cls: 'text-blue-600 bg-blue-50 ring-blue-100', dot: 'bg-blue-500' }
        : { label: tx(lang, { fr: '1 mesure', ar: 'قياس واحد', en: '1 measurement', es: '1 medición', pt: '1 medição', tr: '1 ölçüm' }), cls: 'text-amber-600 bg-amber-50 ring-amber-100', dot: 'bg-amber-500' };

    const totalObs = measures.length;
    const hasActiveFilters = !!(machineFilter || matiereFilter || categoryFilter || clientFilter || operatorFilter || sectionFilter);
    const resetFilters = () => { setMachineFilter(null); setMatiereFilter(null); setCategoryFilter(null); setClientFilter(null); setOperatorFilter(null); setSectionFilter(null); };

    return (
        <div className="h-full flex flex-col font-sans text-slate-800 antialiased relative overflow-hidden">
            {/* Fond sobre */}
            <div className="absolute inset-0 -z-10 bg-[#f7f8fb]" />

            {/* ── HEADER (glass) ── */}
            <header className="shrink-0 sticky top-0 z-20 bg-white/65 backdrop-blur-xl border-b border-white/60 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_8px_30px_-18px_rgba(15,23,42,0.25)]">
                <div className="px-3 sm:px-6 h-12 sm:h-14 flex items-center gap-2 sm:gap-4">
                    <div className="flex items-baseline gap-2 shrink-0">
                        <h1 className="text-[14px] sm:text-[15px] font-semibold text-slate-900 tracking-tight whitespace-nowrap">{tx(lang, { fr: "Catalogue de Temps", ar: "كتالوج الأوقات", en: "Time Catalogue", es: "Catálogo de Tiempos", pt: "Catálogo de Tempos", tr: "Süre Kataloğu" })}</h1>
                        <span className="hidden sm:inline text-[12px] text-slate-400">{tx(lang, { fr: "Temps réels · Chrono", ar: "أوقات حقيقية · Chrono", en: "Real times · Chrono", es: "Tiempos reales · Chrono", pt: "Tempos reais · Chrono", tr: "Gerçek süreler · Chrono" })}</span>
                    </div>

                    <div className="hidden md:flex items-center gap-4 ml-1">
                        <Stat icon={Boxes} label={tx(lang, { fr: "Opérations", ar: "العمليات", en: "Operations", es: "Operaciones", pt: "Operações", tr: "Operasyonlar" })} value={entries.length} />
                        <Stat icon={Database} label={tx(lang, { fr: "Mesures", ar: "القياسات", en: "Measurements", es: "Mediciones", pt: "Medições", tr: "Ölçümler" })} value={totalObs} />
                        <Stat icon={Layers} label={tx(lang, { fr: "Modèles", ar: "النماذج", en: "Models", es: "Modelos", pt: "Modelos", tr: "Modeller" })} value={modelCount} />
                    </div>

                    <div className="flex-1 min-w-0 max-w-md mx-auto relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={tx(lang, {
                                fr: "Rechercher une opération, machine, opérateur…",
                                ar: "البحث عن عملية، آلة، عامل…",
                                en: "Search an operation, machine, operator…",
                                es: "Buscar una operación, máquina, operador…",
                                pt: "Pesquisar uma operação, máquina, operador…",
                                tr: "Bir operasyon, makine, operatör ara…",
                            })}
                            className="w-full h-9 pl-9 pr-9 text-[12px] text-slate-700 placeholder:text-slate-400 bg-white/70 hover:bg-white/90 focus:bg-white border border-white/70 focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100 rounded-xl outline-none transition-all shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                        />
                        {query && (
                            <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <Segmented options={[{ id: 'sec', label: 'sec' }, { id: 'min', label: 'min' }]} value={unit} onChange={(v) => setUnit(v as 'min' | 'sec')} />
                </div>

                {/* ── Filtres : listes déroulantes compactes ── */}
                <div className="px-3 sm:px-6 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible border-t border-white/50 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                    <FilterSelect icon={Cpu} label={tx(lang, { fr: "Machine", ar: "الآلة", en: "Machine", es: "Máquina", pt: "Máquina", tr: "Makine" })} allLabel={tx(lang, { fr: "Toutes machines", ar: "جميع الآلات", en: "All machines", es: "Todas las máquinas", pt: "Todas as máquinas", tr: "Tüm makineler" })}
                        value={machineFilter} options={facets.machines} onChange={setMachineFilter} />
                    <FilterSelect icon={Shirt} label={tx(lang, { fr: "Matière", ar: "المادة", en: "Material", es: "Material", pt: "Material", tr: "Malzeme" })} allLabel={tx(lang, { fr: "Toutes matières", ar: "جميع المواد", en: "All materials", es: "Todos los materiales", pt: "Todos os materiais", tr: "Tüm malzemeler" })}
                        value={matiereFilter} options={facets.matieres} onChange={setMatiereFilter} />
                    <FilterSelect icon={Boxes} label={tx(lang, { fr: "Type modèle", ar: "نوع النموذج", en: "Model type", es: "Tipo de modelo", pt: "Tipo de modelo", tr: "Model türü" })} allLabel={tx(lang, { fr: "Tous types", ar: "جميع الأنواع", en: "All types", es: "Todos los tipos", pt: "Todos os tipos", tr: "Tüm türler" })}
                        value={categoryFilter}
                        options={[
                            ...facets.categories,
                            ...customCategories.filter(c => !facets.categories.some(x => x.name === c)).map(name => ({ name, n: 0 })),
                        ]}
                        onChange={setCategoryFilter}
                        onAdd={addCustomCategory}
                        addPlaceholder={tx(lang, {
                            fr: "Nouvelle catégorie (ex: Pyjama)…",
                            ar: "فئة جديدة (مثال: Pyjama)…",
                            en: "New category (e.g. Pyjama)…",
                            es: "Nueva categoría (ej: Pyjama)…",
                            pt: "Nova categoria (ex: Pyjama)…",
                            tr: "Yeni kategori (örn: Pyjama)…",
                        })} />
                    <FilterSelect icon={Boxes} label={tx(lang, { fr: "Client", ar: "العميل", en: "Client", es: "Cliente", pt: "Cliente", tr: "Müşteri" })} allLabel={tx(lang, { fr: "Tous clients", ar: "جميع العملاء", en: "All clients", es: "Todos los clientes", pt: "Todos os clientes", tr: "Tüm müşteriler" })}
                        value={clientFilter} options={facets.clients} onChange={setClientFilter} />
                    <FilterSelect icon={User} label={tx(lang, { fr: "Opérateur", ar: "العامل", en: "Operator", es: "Operador", pt: "Operador", tr: "Operatör" })} allLabel={tx(lang, { fr: "Tous opérateurs", ar: "جميع العمال", en: "All operators", es: "Todos los operadores", pt: "Todos os operadores", tr: "Tüm operatörler" })}
                        value={operatorFilter} options={facets.operators} onChange={setOperatorFilter} />
                    <FilterSelect icon={Layers} label={tx(lang, { fr: "Poste", ar: "المحطة", en: "Station", es: "Puesto", pt: "Posto", tr: "İstasyon" })} allLabel={tx(lang, { fr: "Tous postes", ar: "جميع المحطات", en: "All stations", es: "Todos los puestos", pt: "Todos os postos", tr: "Tüm istasyonlar" })}
                        value={sectionFilter}
                        options={facets.sections}
                        display={(v) => sectionLabelFor(lang, v)}
                        onChange={setSectionFilter} />

                    <div className="hidden sm:block sm:flex-1" />

                    {hasActiveFilters && (
                        <button type="button" onClick={resetFilters}
                            className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-medium text-rose-600 bg-rose-50/70 hover:bg-rose-100 transition-colors">
                            <X className="w-3 h-3" /> {tx(lang, { fr: "Réinitialiser", ar: "إعادة تعيين", en: "Reset", es: "Restablecer", pt: "Redefinir", tr: "Sıfırla" })}
                        </button>
                    )}
                    <button type="button" onClick={() => setSortBy(s => s === 'count' ? 'time' : s === 'time' ? 'alpha' : 'count')}
                        className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] font-medium text-slate-600 bg-white/60 hover:bg-white/90 border border-white/70 transition-colors">
                        <ArrowUpDown className="w-3 h-3" strokeWidth={2} />
                        {sortBy === 'count' ? tx(lang, { fr: 'Fréquence', ar: 'التكرار', en: 'Frequency', es: 'Frecuencia', pt: 'Frequência', tr: 'Sıklık' })
                            : sortBy === 'time' ? tx(lang, { fr: 'Temps', ar: 'الوقت', en: 'Time', es: 'Tiempo', pt: 'Tempo', tr: 'Süre' })
                            : 'A → Z'}
                    </button>
                </div>
            </header>

            {/* ── CONTENU ── */}
            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-auto min-w-0 px-3 sm:px-6 py-4">
                    {visible.length === 0 ? (
                        <EmptyState hasData={entries.length > 0} />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {visible.map(e => {
                                const rel = reliability(e.count);
                                const isSel = e.key === selectedKey;
                                const spread = e.max > e.min ? ((e.max - e.min) / e.max) * 100 : 0;
                                return (
                                    <button key={e.key} type="button" onClick={() => setSelectedKey(isSel ? null : e.key)}
                                        className={`group text-left rounded-2xl p-3.5 transition-all duration-200 border backdrop-blur-md ${
                                            isSel ? 'bg-white/95 border-indigo-200 ring-2 ring-indigo-100 shadow-[0_12px_40px_-18px_rgba(79,70,229,0.45)]'
                                                : 'bg-white/65 border-white/70 hover:bg-white/90 shadow-[0_6px_24px_-18px_rgba(15,23,42,0.4)] hover:shadow-[0_12px_36px_-18px_rgba(15,23,42,0.45)] hover:-translate-y-0.5'
                                        }`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-[13px] font-semibold text-slate-900 leading-snug line-clamp-2">{e.description}</p>
                                            <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ring-1 ${rel.cls}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${rel.dot}`} />{e.count}
                                            </span>
                                        </div>

                                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                            <Tag icon={Cpu}>{e.machine}</Tag>
                                            {e.section && <Tag>{sectionLabelFor(lang, e.section)}</Tag>}
                                            {e.variants.length > 1 && <Tag>≈ {e.variants.length} {tx(lang, { fr: "variantes", ar: "نسخ", en: "variants", es: "variantes", pt: "variantes", tr: "varyant" })}</Tag>}
                                        </div>

                                        <div className="mt-3 flex items-end justify-between">
                                            <div>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-[22px] font-black text-slate-900 tabular-nums leading-none">{fmtTime(e.avg)}</span>
                                                    <span className="text-[11px] font-medium text-slate-400">{unitSuffix}</span>
                                                </div>
                                                <span className="text-[10px] text-slate-400">
                                                    {e.measuredCount > 0 ? tx(lang, {
                                                        fr: `temps moyen · ${e.measuredCount}/${e.count} mesuré`,
                                                        ar: `الوقت المتوسط · ${e.measuredCount}/${e.count} مقاس`,
                                                        en: `average time · ${e.measuredCount}/${e.count} measured`,
                                                        es: `tiempo medio · ${e.measuredCount}/${e.count} medido`,
                                                        pt: `tempo médio · ${e.measuredCount}/${e.count} medido`,
                                                        tr: `ortalama süre · ${e.measuredCount}/${e.count} ölçüldü`,
                                                    }) : tx(lang, {
                                                        fr: 'TS gamme (estimé)',
                                                        ar: 'TS الغامة (تقديري)',
                                                        en: 'TS routing (estimated)',
                                                        es: 'TS de gama (estimado)',
                                                        pt: 'TS da gama (estimado)',
                                                        tr: 'TS rotası (tahmini)',
                                                    })}
                                                </span>
                                            </div>
                                            <div className="text-right text-[10px] text-slate-500 tabular-nums">
                                                <div>{tx(lang, { fr: "min", ar: "أدنى", en: "min", es: "mín", pt: "mín", tr: "min" })} <span className="font-semibold text-slate-700">{fmtTime(e.min)}</span></div>
                                                <div>{tx(lang, { fr: "max", ar: "أعلى", en: "max", es: "máx", pt: "máx", tr: "maks" })} <span className="font-semibold text-slate-700">{fmtTime(e.max)}</span></div>
                                            </div>
                                        </div>

                                        <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400" style={{ width: `${Math.max(6, Math.min(100, spread))}%` }} />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {selected && (
                    <DetailPanel entry={selected} fmt={fmtTime} unitSuffix={unitSuffix} reliability={reliability(selected.count)} onClose={() => setSelectedKey(null)} onOpenWorker={onOpenWorker} />
                )}
            </div>
        </div>
    );
}

// ── Panneau détail ─────────────────────────────────────────────────────────────
function DetailPanel({ entry, fmt, unitSuffix, reliability, onClose, onOpenWorker }: {
    entry: CatalogEntry; fmt: (m: number) => string; unitSuffix: string;
    reliability: { label: string; cls: string; dot: string }; onClose: () => void;
    onOpenWorker?: (name: string) => void;
}) {
    const { lang } = useLang();
    const isMobile = useIsMobile();
    const sorted = [...entry.sources].sort((a, b) => b.timeMin - a.timeMin);

    const titleBlock = (
        <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-900 leading-snug">{entry.description}</p>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <Tag icon={Cpu}>{entry.machine}</Tag>
                {entry.section && <Tag>{sectionLabelFor(lang, entry.section)}</Tag>}
            </div>
        </div>
    );

    const body = (
        <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
                <KpiCard icon={Gauge} label={tx(lang, { fr: "Moyen", ar: "متوسط", en: "Average", es: "Media", pt: "Médio", tr: "Ortalama" })} value={fmt(entry.avg)} suffix={unitSuffix} accent="from-indigo-500 to-violet-500" />
                <KpiCard icon={TrendingUp} label={tx(lang, { fr: "Min", ar: "أدنى", en: "Min", es: "Mín", pt: "Mín", tr: "Min" })} value={fmt(entry.min)} suffix={unitSuffix} accent="from-emerald-500 to-teal-500" />
                <KpiCard icon={TrendingUp} label={tx(lang, { fr: "Max", ar: "أعلى", en: "Max", es: "Máx", pt: "Máx", tr: "Maks" })} value={fmt(entry.max)} suffix={unitSuffix} accent="from-rose-500 to-orange-500" />
            </div>

            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ring-1 ${reliability.cls}`}>
                {entry.count >= 3 ? <ShieldCheck className="w-4 h-4" /> : <CircleAlert className="w-4 h-4" />}
                <span className="text-[12px] font-semibold">{reliability.label}</span>
                <span className="text-[11px] opacity-70">· {entry.count} {tx(lang, {
                    fr: `mesure${entry.count > 1 ? 's' : ''} réelle${entry.count > 1 ? 's' : ''}`,
                    ar: 'قياس حقيقي',
                    en: `real measurement${entry.count > 1 ? 's' : ''}`,
                    es: `medición${entry.count > 1 ? 'es' : ''} real${entry.count > 1 ? 'es' : ''}`,
                    pt: `medição${entry.count > 1 ? 'ões' : ''} real${entry.count > 1 ? 'is' : ''}`,
                    tr: 'gerçek ölçüm',
                })}</span>
            </div>

            {entry.variants.length > 1 && (
                <Section title={tx(lang, { fr: "Libellés fusionnés (≈)", ar: "تسميات مدمجة (≈)", en: "Merged labels (≈)", es: "Etiquetas combinadas (≈)", pt: "Rótulos combinados (≈)", tr: "Birleştirilmiş etiketler (≈)" })}>
                    <div className="flex items-center gap-1.5 flex-wrap">{entry.variants.map(v => <Tag key={v}>{v}</Tag>)}</div>
                </Section>
            )}
            {entry.matieres.length > 0 && (
                <Section title={tx(lang, { fr: "Matières", ar: "المواد", en: "Materials", es: "Materiales", pt: "Materiais", tr: "Malzemeler" })}><div className="flex items-center gap-1.5 flex-wrap">{entry.matieres.map(c => <Tag key={c} icon={Shirt}>{c}</Tag>)}</div></Section>
            )}
            {entry.categories.length > 0 && (
                <Section title={tx(lang, { fr: "Types de modèle", ar: "أنواع النموذج", en: "Model types", es: "Tipos de modelo", pt: "Tipos de modelo", tr: "Model türleri" })}><div className="flex items-center gap-1.5 flex-wrap">{entry.categories.map(c => <Tag key={c}>{c}</Tag>)}</div></Section>
            )}
            {entry.operators.length > 0 && (
                <Section title={tx(lang, { fr: "Opérateurs", ar: "العمال", en: "Operators", es: "Operadores", pt: "Operadores", tr: "Operatörler" })}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {entry.operators.map(c => onOpenWorker ? (
                            <button key={c} type="button" onClick={() => onOpenWorker(c)}
                                title={tx(lang, {
                                    fr: `Voir le profil de ${c} dans Gestion RH`,
                                    ar: `عرض ملف ${c} في إدارة الموارد البشرية`,
                                    en: `View ${c}'s profile in HR Management`,
                                    es: `Ver el perfil de ${c} en Gestión de RH`,
                                    pt: `Ver o perfil de ${c} em Gestão de RH`,
                                    tr: `${c} profilini İK Yönetiminde görüntüle`,
                                })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 ring-1 ring-sky-100 text-[11px] font-medium transition-colors">
                                <User className="w-2.5 h-2.5" />{c}<ArrowUpRight className="w-2.5 h-2.5 opacity-60" />
                            </button>
                        ) : <Tag key={c} icon={User}>{c}</Tag>)}
                    </div>
                </Section>
            )}
            {entry.clients.length > 0 && (
                <Section title={tx(lang, { fr: "Clients", ar: "العملاء", en: "Clients", es: "Clientes", pt: "Clientes", tr: "Müşteriler" })}><div className="flex items-center gap-1.5 flex-wrap">{entry.clients.map(c => <Tag key={c}>{c}</Tag>)}</div></Section>
            )}

            <Section title={tx(lang, { fr: "Mesures par modèle", ar: "القياسات حسب النموذج", en: "Measurements by model", es: "Mediciones por modelo", pt: "Medições por modelo", tr: "Modele göre ölçümler" })}>
                <div className="space-y-1">
                    {sorted.map((s, i) => {
                        const pct = entry.max > 0 ? (s.timeMin / entry.max) * 100 : 0;
                        return (
                            <div key={`${s.modelId}-${i}`} className="relative rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 overflow-hidden">
                                <div className="absolute inset-y-0 left-0 bg-indigo-50/70" style={{ width: `${pct}%` }} />
                                <div className="relative flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-[12px] font-medium text-slate-800 truncate">
                                            {s.modelName}
                                            {s.client !== '—' && <span className="text-slate-400 font-normal"> · {s.client}</span>}
                                        </p>
                                        <p className="text-[10px] text-slate-400 truncate flex items-center gap-1.5">
                                            <span className="truncate">{s.matiere}</span>
                                            {s.operator && (onOpenWorker ? (
                                                <button type="button" onClick={(e) => { e.stopPropagation(); onOpenWorker(s.operator!); }}
                                                    className="inline-flex items-center gap-0.5 text-sky-600 hover:underline font-medium">
                                                    <User className="w-2.5 h-2.5" />{s.operator}
                                                </button>
                                            ) : <span className="inline-flex items-center gap-0.5"><User className="w-2.5 h-2.5" />{s.operator}</span>)}
                                            {s.length ? <span className="inline-flex items-center gap-0.5"><Ruler className="w-2.5 h-2.5" />{s.length}</span> : null}
                                        </p>
                                    </div>
                                    <span className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-slate-900 tabular-nums">
                                        <span className={`w-1.5 h-1.5 rounded-full ${s.measured ? 'bg-emerald-500' : 'bg-slate-300'}`} title={s.measured ? tx(lang, {
                                            fr: "Relevé chrono réel",
                                            ar: "قياس حقيقي بالكرونومتر",
                                            en: "Real chrono reading",
                                            es: "Lectura real de cronómetro",
                                            pt: "Leitura real do cronômetro",
                                            tr: "Gerçek kronometre okuması",
                                        }) : tx(lang, {
                                            fr: "TS gamme (estimé)",
                                            ar: "TS الغامة (تقديري)",
                                            en: "TS routing (estimated)",
                                            es: "TS de gama (estimado)",
                                            pt: "TS da gama (estimado)",
                                            tr: "TS rotası (tahmini)",
                                        })} />
                                        {fmt(s.timeMin)}<span className="text-[9px] font-normal text-slate-400 ml-0.5">{unitSuffix}</span>
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Section>
        </div>
    );

    // ── Mobile : bottom-sheet (même style que la modale "Nouvel ordre") ──
    if (isMobile) {
        return createPortal(
            <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/30 backdrop-blur-[3px] animate-[catSheetFade_140ms_ease-out]" onClick={onClose}>
                <style>{`@keyframes catSheetFade{from{opacity:0}to{opacity:1}}@keyframes catSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
                <div className="relative w-full max-h-[88vh] bg-white rounded-t-2xl shadow-[0_-12px_40px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/60 overflow-hidden flex flex-col animate-[catSheetUp_200ms_cubic-bezier(0.22,1,0.36,1)]" onClick={(e) => e.stopPropagation()}>
                    <div className="pt-2 pb-1 flex items-center justify-center shrink-0">
                        <span className="w-10 h-1 rounded-full bg-slate-300" />
                    </div>
                    <header className="px-4 pt-1 pb-3 flex items-start justify-between gap-3 shrink-0 border-b border-slate-100">
                        {titleBlock}
                        <button type="button" onClick={onClose} className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" aria-label={tx(lang, { fr: "Fermer", ar: "إغلاق", en: "Close", es: "Cerrar", pt: "Fechar", tr: "Kapat" })}>
                            <X className="w-4 h-4" />
                        </button>
                    </header>
                    <div className="overflow-y-auto flex-1 min-h-0">{body}</div>
                </div>
            </div>,
            document.body
        );
    }

    // ── Desktop : panneau latéral ──
    return (
        <aside className="w-[380px] shrink-0 border-l border-slate-200/70 bg-white overflow-auto shadow-[-12px_0_40px_-24px_rgba(15,23,42,0.4)] animate-[catfade_160ms_ease-out]">
            <style>{`@keyframes catfade{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}`}</style>
            <div className="sticky top-0 z-10 bg-white/85 backdrop-blur-xl px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-2">
                {titleBlock}
                <button type="button" onClick={onClose} className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100/60"><X className="w-4 h-4" /></button>
            </div>
            {body}
        </aside>
    );
}

// ── UI atoms ────────────────────────────────────────────────────────────────
function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
    return (
        <div className="inline-flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
            <span className="text-[12px] text-slate-500">{label}</span>
            <span className="text-[12px] font-semibold tabular-nums text-slate-800">{value}</span>
        </div>
    );
}

function FilterSelect({
    icon: Icon, label, allLabel, value, options, onChange, display, onAdd, addPlaceholder,
}: {
    icon: any; label: string; allLabel: string;
    value: string | null; options: { name: string; n: number }[];
    onChange: (v: string | null) => void;
    display?: (v: string) => string;
    onAdd?: (name: string) => void;
    addPlaceholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const openMenu = () => {
        const el = btnRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const width = Math.min(256, window.innerWidth - 16);
        const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
        setCoords({ top: r.bottom + 6, left, width });
        setOpen(true);
    };

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onScrollResize = () => setOpen(false);
        document.addEventListener('mousedown', onDoc);
        window.addEventListener('resize', onScrollResize);
        return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('resize', onScrollResize); };
    }, [open]);

    const shown = value ? (display ? display(value) : value) : label;

    return (
        <div className="relative shrink-0">
            <button ref={btnRef} type="button" onClick={() => open ? setOpen(false) : openMenu()}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] font-medium transition-all border max-w-[180px] ${
                    value ? 'bg-slate-900 text-white border-slate-900 shadow-[0_4px_12px_-4px_rgba(15,23,42,0.5)]'
                        : 'bg-white/60 text-slate-600 border-white/70 hover:bg-white/90'
                }`}>
                <Icon className="w-3 h-3 shrink-0" strokeWidth={2} />
                <span className="truncate">{shown}</span>
                <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${value ? 'opacity-70' : 'opacity-50'}`} />
            </button>

            {open && coords && createPortal(
                <div ref={panelRef}
                    style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
                    className="z-[300] max-h-[60vh] overflow-auto rounded-xl bg-white border border-slate-200 shadow-[0_16px_48px_-12px_rgba(15,23,42,0.45)] p-1 animate-[catfade_120ms_ease-out]">
                    <button type="button" onClick={() => { onChange(null); setOpen(false); }}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[12px] transition-colors ${!value ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}>
                        <span>{allLabel}</span>{!value && <Check className="w-3.5 h-3.5" />}
                    </button>
                    {options.map(o => {
                        const active = value === o.name;
                        return (
                            <button key={o.name} type="button" onClick={() => { onChange(active ? null : o.name); setOpen(false); }}
                                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[12px] transition-colors ${active ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}>
                                <span className="truncate text-left">{display ? display(o.name) : o.name}</span>
                                <span className="shrink-0 inline-flex items-center gap-1.5">
                                    {o.n > 0 && <span className="text-[10px] text-slate-400 tabular-nums">{o.n}</span>}
                                    {active && <Check className="w-3.5 h-3.5" />}
                                </span>
                            </button>
                        );
                    })}
                    {onAdd && (
                        <div className="mt-1 pt-1 border-t border-slate-100 flex items-center gap-1 px-1">
                            <input value={draft} onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { onAdd(draft); setDraft(''); setOpen(false); } }}
                                placeholder={addPlaceholder || 'Ajouter…'}
                                className="flex-1 h-8 px-2 text-[11px] bg-slate-50 border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-indigo-100" />
                            <button type="button" onClick={() => { onAdd(draft); setDraft(''); setOpen(false); }}
                                className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-md bg-slate-900 text-white hover:bg-slate-800">
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}

function Tag({ children, icon: Icon }: { children: React.ReactNode; icon?: any }) {
    return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100/80 text-slate-600 text-[10px] font-medium max-w-full truncate">
            {Icon && <Icon className="w-2.5 h-2.5 shrink-0" strokeWidth={2} />}<span className="truncate">{children}</span>
        </span>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{title}</p>
            {children}
        </div>
    );
}

function KpiCard({ icon: Icon, label, value, suffix, accent }: { icon: any; label: string; value: string; suffix: string; accent: string }) {
    return (
        <div className="rounded-xl bg-white/70 border border-white/70 p-2 shadow-[0_4px_16px_-12px_rgba(15,23,42,0.4)]">
            <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${accent} flex items-center justify-center mb-1`}>
                <Icon className="w-3 h-3 text-white" strokeWidth={2.2} />
            </div>
            <p className="text-[9px] text-slate-400 uppercase tracking-wide font-bold">{label}</p>
            <p className="text-[15px] font-black text-slate-900 tabular-nums leading-tight">{value}<span className="text-[9px] font-normal text-slate-400 ml-0.5">{suffix}</span></p>
        </div>
    );
}

function EmptyState({ hasData }: { hasData: boolean }) {
    const { lang } = useLang();
    return (
        <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-[0_12px_30px_-10px_rgba(99,102,241,0.6)] ring-1 ring-white/40 mb-4">
                <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-[15px] font-semibold text-slate-900">
                {hasData ? tx(lang, {
                    fr: 'Aucune opération ne correspond',
                    ar: 'لا توجد عملية مطابقة',
                    en: 'No matching operation',
                    es: 'Ninguna operación coincide',
                    pt: 'Nenhuma operação corresponde',
                    tr: 'Eşleşen operasyon yok',
                }) : tx(lang, {
                    fr: 'Aucune mesure de chrono trouvée',
                    ar: 'لم يتم العثور على أي قياس بالكرونومتر',
                    en: 'No chrono measurement found',
                    es: 'No se encontró ninguna medición de cronómetro',
                    pt: 'Nenhuma medição de cronômetro encontrada',
                    tr: 'Kronometre ölçümü bulunamadı',
                })}
            </h3>
            <p className="text-[12px] text-slate-500 mt-1 max-w-sm">
                {hasData
                    ? tx(lang, {
                        fr: 'Essayez un autre terme de recherche ou ajustez les filtres.',
                        ar: 'جرّب كلمة بحث أخرى أو عدّل الفلاتر.',
                        en: 'Try a different search term or adjust the filters.',
                        es: 'Intente con otro término de búsqueda o ajuste los filtros.',
                        pt: 'Tente outro termo de pesquisa ou ajuste os filtros.',
                        tr: 'Başka bir arama terimi deneyin veya filtreleri ayarlayın.',
                    })
                    : tx(lang, {
                        fr: 'Le catalogue se construit uniquement à partir des temps réellement mesurés au Chronométrage. Saisissez des relevés (TR) pour l’alimenter.',
                        ar: 'يُبنى الكتالوج فقط من الأوقات المقاسة فعلياً في Chronométrage. أدخل قياسات (TR) لتغذيته.',
                        en: 'The catalogue is built only from times actually measured in Chronométrage. Enter readings (TR) to populate it.',
                        es: 'El catálogo se construye únicamente a partir de los tiempos realmente medidos en Chronométrage. Introduzca lecturas (TR) para alimentarlo.',
                        pt: 'O catálogo é construído apenas a partir dos tempos realmente medidos no Chronométrage. Insira leituras (TR) para alimentá-lo.',
                        tr: 'Katalog yalnızca Chronométrage\'da gerçekten ölçülen sürelerden oluşturulur. Beslemek için ölçüm (TR) girin.',
                    })}
            </p>
        </div>
    );
}

function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
    return (
        <div className="shrink-0 inline-flex p-0.5 bg-white/60 border border-white/70 rounded-lg backdrop-blur-md">
            {options.map(({ id, label }) => (
                <button key={id} type="button" onClick={() => onChange(id)}
                    className={`px-2.5 h-6 text-[11px] font-medium rounded-md transition-all ${value === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    {label}
                </button>
            ))}
        </div>
    );
}
