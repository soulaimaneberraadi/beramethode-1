import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ClipboardList, ScanLine, Search, Loader2, AlertTriangle, Check, ChevronDown, ChevronUp,
    History, Undo2, Info,
} from 'lucide-react';
import { tx } from '../../lib/i18n';
import type { Lang } from '../../app/constants';
import { fmt } from '../../app/constants';
import type { ModelData } from '../../types';
import { resolveScan, variantAxes } from '../../lib/scanner';
import SheetModal, { useSheetFullscreen } from '../shared/SheetModal';

/**
 * INVENTAIRE — comptage physique du stock fini.
 *
 * L'opérateur choisit un périmètre (un modèle, ou tout le stock), puis compte
 * chaque case couleur × taille — au scanner (chaque tiki lu = +1 sur sa case)
 * ou en tapant directement les quantités trouvées. L'écran compare au
 * THÉORIQUE (`stockMatrixByModel`, le même calcul que partout ailleurs dans
 * l'onglet) et, à la validation, n'écrit que les CASES QUI DIVERGENT — pas de
 * ligne pour une case comptée identique au théorique, qui ne raconterait rien.
 *
 * Le brouillon (périmètre + comptes déjà saisis) est gardé en `sessionStorage`
 * à chaque changement : une fermeture accidentelle de l'onglet ne doit pas
 * effacer un comptage à moitié fait — recompter 40 modèles à la main est une
 * demi-journée perdue.
 */

export interface InventaireItem {
    model: ModelData;
    /** Stock restant tel que calculé par l'écran (fallback compris). */
    remainingStock: number;
    /** Prix de revient, pour valoriser l'écart — `null` si aucun n'est fiable. */
    price: number | null;
}

interface InventaireHistoryRow {
    id: string;
    date: string;
    note: string | null;
    nbLignes: number;
    ecartPieces: number;
    createdAt: string;
}

interface InventaireProps {
    onClose: () => void;
    lang: Lang;
    currency: string;
    dateLocale: string;
    canSeeCost: boolean;
    items: InventaireItem[];
    /** Même Map que le reste de l'onglet : modelId → (couleur|taille → quantité). */
    stockMatrixByModel: Map<string, Map<string, number>>;
    /** Le stock a changé (validation ou annulation) : le parent recharge ses mouvements. */
    onValidated: () => void;
}

/** Cellule d'un modèle SANS grille couleur × taille : une seule case globale. */
const GLOBAL_CELL = '';

type CountsState = Record<string, Record<string, number | ''>>;

interface Draft {
    scope: 'ALL' | string | null;
    counts: CountsState;
    date: string;
    note: string;
}

const DRAFT_KEY = 'bera_inventaire_draft_v1';

const todayISO = () => new Date().toISOString().split('T')[0];

const readDraft = (): Draft | null => {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || typeof d !== 'object') return null;
        return { scope: d.scope ?? null, counts: d.counts ?? {}, date: d.date || todayISO(), note: d.note || '' };
    } catch {
        return null;
    }
};

const writeDraft = (d: Draft) => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* sessionStorage indisponible : le brouillon reste en mémoire seulement */ }
};

const clearDraftStorage = () => {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* rien à faire */ }
};

const draftHasContent = (d: Draft | null): boolean =>
    !!d && Object.values(d.counts).some(cells => Object.values(cells).some(v => v !== ''));

const hasGridOf = (model: ModelData): boolean => {
    const fiche: any = model.ficheData || {};
    return (fiche.colors || []).length > 0 && (fiche.sizes || []).length > 0;
};

const Inventaire: React.FC<InventaireProps> = ({ onClose, lang, currency, dateLocale, canSeeCost, items, stockMatrixByModel, onValidated }) => {
    const initialDraft = useRef<Draft | null>(readDraft()).current;
    const draftRestored = draftHasContent(initialDraft);
    const [fullscreen, toggleFullscreen] = useSheetFullscreen();

    const [tab, setTab] = useState<'compter' | 'historique'>('compter');
    const [scope, setScope] = useState<'ALL' | string | null>(initialDraft?.scope ?? null);
    const [counts, setCounts] = useState<CountsState>(initialDraft?.counts ?? {});
    const [date, setDate] = useState(initialDraft?.date || todayISO());
    const [note, setNote] = useState(initialDraft?.note || '');
    const [pickerSearch, setPickerSearch] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [scanValue, setScanValue] = useState('');
    const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<InventaireHistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [dismissedRestoreBanner, setDismissedRestoreBanner] = useState(!draftRestored);

    const scanInputRef = useRef<HTMLInputElement>(null);
    const countsRef = useRef<CountsState>(counts);
    useEffect(() => { countsRef.current = counts; }, [counts]);

    // Brouillon : écrit à chaque changement, jamais effacé par une simple
    // fermeture — seule une validation réussie ou un « recommencer » explicite
    // le vide.
    useEffect(() => {
        writeDraft({ scope, counts, date, note });
    }, [scope, counts, date, note]);

    const itemsById = useMemo(() => new Map(items.map(i => [i.model.id, i])), [items]);

    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch('/api/subcontract/inventaire', { credentials: 'include' });
            const data = res.ok ? await res.json() : [];
            setHistory(Array.isArray(data) ? data : []);
        } catch {
            setHistory([]);
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    useEffect(() => { void loadHistory(); }, [loadHistory]);

    const theoriqueOf = useCallback((item: InventaireItem, cellKey: string): number => {
        if (!hasGridOf(item.model) || cellKey === GLOBAL_CELL) return item.remainingStock;
        return stockMatrixByModel.get(item.model.id)?.get(cellKey) || 0;
    }, [stockMatrixByModel]);

    /** Écrit UNE case et renvoie sa nouvelle valeur — passe par `countsRef`
     *  (pas par l'état React, pas encore à jour au moment de l'appel) pour que
     *  deux scans très rapprochés s'additionnent correctement au lieu de se
     *  marcher dessus. */
    const applyCount = useCallback((modelId: string, cellKey: string, updater: (cur: number) => number): number => {
        const modelCounts = { ...(countsRef.current[modelId] || {}) };
        const cur = modelCounts[cellKey];
        const next = updater(cur === '' || cur == null ? 0 : Number(cur));
        modelCounts[cellKey] = next;
        const nextAll = { ...countsRef.current, [modelId]: modelCounts };
        countsRef.current = nextAll;
        setCounts(nextAll);
        return next;
    }, []);

    const candidats = useMemo((): ModelData[] => {
        if (scope === 'ALL') return items.map(i => i.model);
        if (scope) { const it = itemsById.get(scope); return it ? [it.model] : []; }
        return [];
    }, [scope, items, itemsById]);

    const axesOf = useCallback((m: ModelData) => variantAxes(m, stockMatrixByModel.get(m.id)?.keys()), [stockMatrixByModel]);

    const handleScan = useCallback((raw: string) => {
        const code = raw.trim();
        setScanValue('');
        if (!code) return;
        const hit = resolveScan(candidats, code, axesOf);
        if (!hit) {
            setScanMsg({ ok: false, text: tx(lang, { fr: 'Code inconnu.', ar: 'كود ماشي معروف.', en: 'Unknown code.', es: 'Código desconocido.', pt: 'Código desconhecido.', tr: 'Bilinmeyen kod.' }) });
            return;
        }
        const grid = hasGridOf(hit.model);
        if (grid && (!hit.taille || !hit.couleur)) {
            setScanMsg({ ok: false, text: tx(lang, { fr: 'Tiki sans taille ni couleur — comptez cette case à la main.', ar: 'تيكي بلا مقاس ولا لون — عدّها يدوياً.', en: 'Label without size or color — count this cell by hand.', es: 'Etiqueta sin talla ni color — cuente esta celda a mano.', pt: 'Etiqueta sem tamanho nem cor — conte esta célula à mão.', tr: 'Beden veya renk yok — bu hücreyi elle sayın.' }) });
            return;
        }
        const key = grid ? `${hit.couleur}|${hit.taille}` : GLOBAL_CELL;
        const next = applyCount(hit.model.id, key, v => v + 1);
        setExpanded(prev => (prev.has(hit.model.id) ? prev : new Set(prev).add(hit.model.id)));
        const nom = hit.model.meta_data?.nom_modele || '';
        setScanMsg({ ok: true, text: `${nom}${grid ? ` · ${hit.couleur} / ${hit.taille}` : ''} → ${next}` });
    }, [candidats, axesOf, applyCount, lang]);

    useEffect(() => {
        if (!scanMsg) return;
        const t = setTimeout(() => setScanMsg(null), 3000);
        return () => clearTimeout(t);
    }, [scanMsg]);

    // Le focus part sur le champ scanner dès qu'un périmètre est choisi : un
    // opérateur qui vient d'appuyer sur un modèle doit pouvoir scanner tout de
    // suite, sans reclic.
    useEffect(() => {
        if (scope) scanInputRef.current?.focus();
    }, [scope]);

    const lignesAEcrire = useMemo(() => {
        const out: Array<{ modelId: string; couleur: string | null; taille: string | null; theorique: number; compte: number }> = [];
        for (const [modelId, cells] of Object.entries(counts)) {
            const item = itemsById.get(modelId);
            if (!item) continue;
            for (const [key, val] of Object.entries(cells)) {
                if (val === '' || val == null) continue;
                const compte = Math.floor(Number(val) || 0);
                const theorique = theoriqueOf(item, key);
                if (compte === theorique) continue;
                const [couleur, taille] = key === GLOBAL_CELL ? [null, null] : key.split('|');
                out.push({ modelId, couleur: couleur || null, taille: taille || null, theorique, compte });
            }
        }
        return out;
    }, [counts, itemsById, theoriqueOf]);

    const totalEcartPieces = lignesAEcrire.reduce((a, l) => a + Math.abs(l.compte - l.theorique), 0);
    const totalEcartValue = canSeeCost
        ? lignesAEcrire.reduce((a, l) => {
            const cost = itemsById.get(l.modelId)?.price;
            return a + (cost != null ? (l.compte - l.theorique) * cost : 0);
        }, 0)
        : 0;

    const resetAll = () => {
        setScope(null);
        setCounts({});
        setNote('');
        setDate(todayISO());
        clearDraftStorage();
        setDismissedRestoreBanner(true);
        setConfirming(false);
    };

    const handleValidate = async () => {
        if (lignesAEcrire.length === 0) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/subcontract/inventaire', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, note: note.trim() || undefined, lignes: lignesAEcrire }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.message || '');
            }
            resetAll();
            onValidated();
            await loadHistory();
            setTab('historique');
        } catch (e: any) {
            setError(e?.message || tx(lang, { fr: "L'enregistrement de l'inventaire a échoué.", ar: 'فشل تسجيل الجرد.', en: 'Saving the inventory failed.', es: 'Error al guardar el inventario.', pt: 'Falha ao guardar o inventário.', tr: 'Envanter kaydedilemedi.' }));
        } finally {
            setSaving(false);
        }
    };

    const handleCancelInventaire = async (id: string) => {
        setCancellingId(id);
        try {
            const res = await fetch(`/api/subcontract/inventaire/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error();
            await loadHistory();
            onValidated();
        } catch {
            setError(tx(lang, { fr: "L'annulation a échoué.", ar: 'فشل الإلغاء.', en: 'Cancellation failed.', es: 'Error al cancelar.', pt: 'Falha ao cancelar.', tr: 'İptal başarısız.' }));
        } finally {
            setCancellingId(null);
        }
    };

    const filteredPicker = useMemo(() => {
        const q = pickerSearch.trim().toLowerCase();
        if (!q) return items;
        return items.filter(i => (i.model.meta_data?.nom_modele || '').toLowerCase().includes(q) || (i.model.meta_data?.reference || '').toLowerCase().includes(q));
    }, [items, pickerSearch]);

    const scopeItems = useMemo(() => {
        if (scope === 'ALL') return items;
        if (scope) { const it = itemsById.get(scope); return it ? [it] : []; }
        return [];
    }, [scope, items, itemsById]);

    const scopeLabel = scope === 'ALL'
        ? tx(lang, { fr: 'Tous les modèles', ar: 'جميع الموديلات', en: 'All models', es: 'Todos los modelos', pt: 'Todos os modelos', tr: 'Tüm modeller' })
        : (itemsById.get(scope || '')?.model.meta_data?.nom_modele || '');

    return (
        <SheetModal
            onClose={onClose}
            title={tx(lang, { fr: 'Inventaire', ar: 'الجرد', en: 'Inventory', es: 'Inventario', pt: 'Inventário', tr: 'Envanter' })}
            subtitle={tx(lang, { fr: 'Comptage physique du stock fini', ar: 'جرد فعلي للمخزون الجاهز', en: 'Physical count of finished stock', es: 'Conteo físico del stock terminado', pt: 'Contagem física do stock acabado', tr: 'Bitmiş stok fiziksel sayımı' })}
            icon={<ClipboardList className="w-4 h-4 text-indigo-600 dark:text-dk-accent shrink-0" />}
            size="2xl"
            zClass="z-[220]"
            closeOnBackdrop
            fullscreen={fullscreen}
            onToggleFullscreen={toggleFullscreen}
            bare
        >
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {/* Onglets : compter, ou consulter/annuler l'historique. */}
                <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-100 dark:border-dk-border shrink-0">
                    {([
                        { id: 'compter', label: tx(lang, { fr: 'Compter', ar: 'عدّ', en: 'Count', es: 'Contar', pt: 'Contar', tr: 'Say' }), icon: ClipboardList },
                        { id: 'historique', label: tx(lang, { fr: 'Historique', ar: 'السجل', en: 'History', es: 'Historial', pt: 'Histórico', tr: 'Geçmiş' }), icon: History },
                    ] as const).map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold border-b-2 -mb-px transition-colors ${
                                tab === t.id
                                    ? 'border-indigo-600 dark:border-dk-accent text-indigo-600 dark:text-dk-accent'
                                    : 'border-transparent text-slate-500 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text-soft'
                            }`}
                        >
                            <t.icon className="w-3.5 h-3.5" />
                            {t.label}
                        </button>
                    ))}
                </div>

                {tab === 'historique' ? (
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {historyLoading && (
                            <div className="flex items-center justify-center py-10 text-slate-400 dark:text-dk-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>
                        )}
                        {!historyLoading && history.length === 0 && (
                            <p className="text-[12px] text-slate-400 dark:text-dk-muted text-center py-10">
                                {tx(lang, { fr: 'Aucun inventaire enregistré.', ar: 'ما كاين حتى جرد مسجّل.', en: 'No inventory recorded.', es: 'Ningún inventario registrado.', pt: 'Nenhum inventário registado.', tr: 'Kayıtlı envanter yok.' })}
                            </p>
                        )}
                        {history.map((h, idx) => (
                            <div key={h.id} className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <span className="block font-bold text-slate-800 dark:text-dk-text text-[13px]">{fmtDateLocal(h.date, dateLocale)}</span>
                                    <span className="block text-[10px] text-slate-400 dark:text-dk-muted mt-0.5">
                                        {h.nbLignes} {tx(lang, { fr: 'case(s) en écart', ar: 'حالة(ات) فيها فرق', en: 'cell(s) with a gap', es: 'celda(s) con diferencia', pt: 'célula(s) com diferença', tr: 'farklı hücre' })}
                                        {h.note ? ` · ${h.note}` : ''}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`font-extrabold text-[13px] ${h.ecartPieces > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-dk-muted'}`}>
                                        {h.ecartPieces} {tx(lang, { fr: 'pièce(s)', ar: 'قطعة', en: 'piece(s)', es: 'pieza(s)', pt: 'peça(s)', tr: 'parça' })}
                                    </span>
                                    {idx === 0 && (
                                        <button
                                            type="button"
                                            disabled={cancellingId === h.id}
                                            onClick={() => handleCancelInventaire(h.id)}
                                            title={tx(lang, { fr: 'Annuler ce dernier inventaire (retire ses écarts du stock)', ar: 'إلغاء آخر جرد (كيحيّد الفروقات من المخزون)', en: 'Cancel this last inventory (removes its adjustments from stock)', es: 'Anular este último inventario (retira sus ajustes del stock)', pt: 'Anular este último inventário (retira os ajustes do stock)', tr: 'Bu son envanteri iptal et (düzeltmeleri stoktan kaldırır)' })}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
                                        >
                                            {cancellingId === h.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                                            {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Anular', pt: 'Anular', tr: 'İptal' })}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : scope === null ? (
                    /* ── Étape 1 : choix du périmètre ─────────────────────────── */
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {!dismissedRestoreBanner && (
                            <div className="flex items-center justify-between gap-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 rounded-xl px-3.5 py-2.5">
                                <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" />
                                    {tx(lang, { fr: 'Un comptage était en cours — reprenez où vous en étiez.', ar: 'كان كاين جرد فالطريق — كمّل منين وقفتي.', en: 'A count was in progress — pick up where you left off.', es: 'Había un conteo en curso — continúe donde lo dejó.', pt: 'Havia uma contagem em curso — continue de onde parou.', tr: 'Devam eden bir sayım vardı — kaldığınız yerden devam edin.' })}
                                </span>
                                <button type="button" onClick={() => setDismissedRestoreBanner(true)} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 underline underline-offset-2 shrink-0">
                                    {tx(lang, { fr: 'OK', ar: 'واخا', en: 'OK', es: 'OK', pt: 'OK', tr: 'Tamam' })}
                                </button>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => setScope('ALL')}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl text-left bg-slate-800 dark:bg-dk-accent text-white hover:bg-slate-900 dark:hover:bg-dk-accent/90 transition-colors"
                        >
                            <span className="font-bold text-[13px]">{tx(lang, { fr: 'Tous les modèles', ar: 'جميع الموديلات', en: 'All models', es: 'Todos los modelos', pt: 'Todos os modelos', tr: 'Tüm modeller' })}</span>
                            <ClipboardList className="w-4 h-4 shrink-0" />
                        </button>
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-dk-muted pointer-events-none" />
                            <input
                                type="text"
                                value={pickerSearch}
                                onChange={e => setPickerSearch(e.target.value)}
                                placeholder={tx(lang, { fr: 'Ou choisir un seul modèle…', ar: 'ولا اختار موديل وحد…', en: 'Or pick a single model…', es: 'O elegir un solo modelo…', pt: 'Ou escolher um só modelo…', tr: 'Ya da tek bir model seç…' })}
                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl pl-9 pr-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                            />
                        </div>
                        <div className="space-y-1.5">
                            {filteredPicker.map(it => {
                                const touched = Object.values(counts[it.model.id] || {}).some(v => v !== '');
                                return (
                                    <button
                                        key={it.model.id}
                                        type="button"
                                        onClick={() => setScope(it.model.id)}
                                        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:border-indigo-300 dark:hover:border-dk-accent/50 transition-colors"
                                    >
                                        <span className="min-w-0">
                                            <span className="block font-bold text-slate-800 dark:text-dk-text text-[12.5px] truncate">{it.model.meta_data?.nom_modele || it.model.id.slice(0, 8)}</span>
                                            <span className="block text-[10px] text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Stock', ar: 'المخزون', en: 'Stock', es: 'Stock', pt: 'Stock', tr: 'Stok' })} : {it.remainingStock}</span>
                                        </span>
                                        {touched && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    /* ── Étape 2 : comptage ───────────────────────────────────── */
                    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-dk-border shrink-0 space-y-2.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-bold text-slate-800 dark:text-dk-text text-[13px] truncate">{scopeLabel}</span>
                                    <button type="button" onClick={() => setScope(null)} className="text-[10px] font-bold text-indigo-600 dark:text-dk-accent underline underline-offset-2 shrink-0">
                                        {tx(lang, { fr: 'Changer', ar: 'بدّل', en: 'Change', es: 'Cambiar', pt: 'Mudar', tr: 'Değiştir' })}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-1.5 text-[11px] text-slate-700 dark:text-dk-text-soft outline-none focus:border-indigo-500 dark:focus:border-dk-accent" />
                                </div>
                            </div>
                            <input
                                type="text"
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                placeholder={tx(lang, { fr: 'Note (facultatif)…', ar: 'ملاحظة (اختياري)…', en: 'Note (optional)…', es: 'Nota (opcional)…', pt: 'Nota (opcional)…', tr: 'Not (isteğe bağlı)…' })}
                                className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-3 py-1.5 text-[11px] text-slate-700 dark:text-dk-text-soft outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                            />
                            {/* Champ scanner : reste au clavier tant qu'on ne clique pas ailleurs.
                                Un lecteur code-barres tape très vite et termine par Entrée — la
                                grille de saisie manuelle est un champ SÉPARÉ pour que les deux
                                modes ne se marchent jamais dessus. */}
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <ScanLine className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 dark:text-dk-accent pointer-events-none" />
                                    <input
                                        ref={scanInputRef}
                                        type="text"
                                        value={scanValue}
                                        onChange={e => setScanValue(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScan(scanValue); } }}
                                        placeholder={tx(lang, { fr: 'Scanner un tiki…', ar: 'سكانّي التيكي…', en: 'Scan a label…', es: 'Escanear una etiqueta…', pt: 'Digitalizar uma etiqueta…', tr: 'Etiket tarayın…' })}
                                        className="w-full bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/50 rounded-lg pl-9 pr-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                                    />
                                </div>
                                {scanMsg && (
                                    <span className={`text-[11px] font-bold shrink-0 flex items-center gap-1 ${scanMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {scanMsg.ok ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                        {scanMsg.text}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {scopeItems.map(it => (
                                <ModelCountSection
                                    key={it.model.id}
                                    lang={lang}
                                    item={it}
                                    stockMatrixByModel={stockMatrixByModel}
                                    counts={counts[it.model.id] || {}}
                                    onChangeCell={(cellKey, val) => setCounts(prev => ({ ...prev, [it.model.id]: { ...(prev[it.model.id] || {}), [cellKey]: val } }))}
                                    collapsible={scope === 'ALL'}
                                    expanded={scope !== 'ALL' || expanded.has(it.model.id)}
                                    onToggle={() => setExpanded(prev => {
                                        const next = new Set(prev);
                                        if (next.has(it.model.id)) next.delete(it.model.id); else next.add(it.model.id);
                                        return next;
                                    })}
                                />
                            ))}
                        </div>

                        <div className="px-4 py-3 border-t border-slate-100 dark:border-dk-border shrink-0 space-y-2">
                            {error && <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">{error}</p>}
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="text-[11px] text-slate-500 dark:text-dk-muted">
                                    <span className="font-bold text-slate-700 dark:text-dk-text-soft">{lignesAEcrire.length}</span> {tx(lang, { fr: 'case(s) en écart', ar: 'حالة(ات) فيها فرق', en: 'cell(s) with a gap', es: 'celda(s) con diferencia', pt: 'célula(s) com diferença', tr: 'farklı hücre' })}
                                    {' · '}
                                    <span className="font-bold text-slate-700 dark:text-dk-text-soft">{totalEcartPieces}</span> {tx(lang, { fr: 'pièce(s) d\'écart', ar: 'قطعة(ات) فرق', en: 'piece(s) gap', es: 'pieza(s) de diferencia', pt: 'peça(s) de diferença', tr: 'parça fark' })}
                                    {canSeeCost && totalEcartPieces > 0 && (
                                        <> {' · '}<span className={`font-bold ${totalEcartValue < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{totalEcartValue >= 0 ? '+' : ''}{fmt(totalEcartValue)} {currency}</span></>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={resetAll} className="px-3 py-2 rounded-xl text-[11px] font-bold text-slate-500 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
                                        {tx(lang, { fr: 'Recommencer à zéro', ar: 'بدا من جديد', en: 'Start over', es: 'Empezar de nuevo', pt: 'Recomeçar', tr: 'Baştan başla' })}
                                    </button>
                                    {!confirming ? (
                                        <button
                                            type="button"
                                            disabled={lignesAEcrire.length === 0}
                                            onClick={() => setConfirming(true)}
                                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-dk-accent dark:hover:bg-dk-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ClipboardList className="w-3.5 h-3.5" />
                                            {tx(lang, { fr: "Valider l'inventaire", ar: 'صادق على الجرد', en: 'Validate the inventory', es: 'Validar el inventario', pt: 'Validar o inventário', tr: 'Envanteri onayla' })}
                                        </button>
                                    ) : (
                                        <div className="inline-flex items-center gap-2">
                                            <span className="text-[11px] text-slate-600 dark:text-dk-text-soft font-semibold">{tx(lang, { fr: 'Confirmer ?', ar: 'تأكيد؟', en: 'Confirm?', es: '¿Confirmar?', pt: 'Confirmar?', tr: 'Onaylansın mı?' })}</span>
                                            <button type="button" onClick={() => setConfirming(false)} className="px-3 py-2 rounded-xl text-[11px] font-bold text-slate-500 dark:text-dk-muted border border-slate-200 dark:border-dk-border">
                                                {tx(lang, { fr: 'Non', ar: 'لا', en: 'No', es: 'No', pt: 'Não', tr: 'Hayır' })}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={saving}
                                                onClick={handleValidate}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                                            >
                                                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                {tx(lang, { fr: 'Oui, valider', ar: 'إيه، صادق', en: 'Yes, validate', es: 'Sí, validar', pt: 'Sim, validar', tr: 'Evet, onayla' })}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </SheetModal>
    );
};

const fmtDateLocal = (iso: string, dateLocale: string): string => {
    try { return new Date(iso).toLocaleDateString(dateLocale); } catch { return iso; }
};

/** Une section = un modèle : sa grille couleur × taille (ou sa case unique
 *  s'il n'a pas de grille), théorique / compté / écart. Repliable en mode
 *  « Tous les modèles » pour rester lisible sur une longue liste. */
const ModelCountSection: React.FC<{
    lang: Lang;
    item: InventaireItem;
    stockMatrixByModel: Map<string, Map<string, number>>;
    counts: Record<string, number | ''>;
    onChangeCell: (cellKey: string, val: number | '') => void;
    collapsible: boolean;
    expanded: boolean;
    onToggle: () => void;
}> = ({ lang, item, stockMatrixByModel, counts, onChangeCell, collapsible, expanded, onToggle }) => {
    const fiche: any = item.model.ficheData || {};
    const colors: Array<{ id: string; name: string }> = fiche.colors || [];
    const sizes: string[] = fiche.sizes || [];
    const grid = colors.length > 0 && sizes.length > 0;
    const matrix = stockMatrixByModel.get(item.model.id);
    const nom = item.model.meta_data?.nom_modele || item.model.id.slice(0, 8);

    const touchedCount = Object.values(counts).filter(v => v !== '').length;

    return (
        <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden">
            <button
                type="button"
                onClick={collapsible ? onToggle : undefined}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left ${collapsible ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-dk-elevated/50' : ''}`}
            >
                <span className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-800 dark:text-dk-text text-[12.5px] truncate">{nom}</span>
                    {touchedCount > 0 && (
                        <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300">{touchedCount}</span>
                    )}
                </span>
                {collapsible && (expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />)}
            </button>
            {expanded && (
                <div className="border-t border-slate-100 dark:border-dk-border p-3">
                    {!grid ? (
                        <SingleCell
                            lang={lang}
                            theorique={item.remainingStock}
                            value={counts[GLOBAL_CELL] ?? ''}
                            onChange={v => onChangeCell(GLOBAL_CELL, v)}
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                                <thead className="text-slate-400 dark:text-dk-muted uppercase text-[9px]">
                                    <tr>
                                        <th className="px-2 py-1 text-left font-medium">{tx(lang, { fr: 'Couleur', ar: 'اللون', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' })}</th>
                                        {sizes.map(sz => <th key={sz} className="px-1 py-1 text-center font-medium">{sz}</th>)}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {colors.map(c => (
                                        <tr key={c.id}>
                                            <td className="px-2 py-1 font-semibold text-slate-700 dark:text-dk-text-soft whitespace-nowrap">{c.name}</td>
                                            {sizes.map(sz => {
                                                const key = `${c.name}|${sz}`;
                                                const theorique = matrix?.get(key) || 0;
                                                const val = counts[key] ?? '';
                                                const ecart = val === '' ? 0 : Number(val) - theorique;
                                                return (
                                                    <td key={sz} className="px-1 py-1 text-center">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={val}
                                                            placeholder={String(theorique)}
                                                            onChange={e => onChangeCell(key, e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                                                            title={`${tx(lang, { fr: 'Théorique', ar: 'النظري', en: 'Theoretical', es: 'Teórico', pt: 'Teórico', tr: 'Teorik' })} ${theorique}`}
                                                            className={`w-12 text-center rounded-md px-1 py-1 text-[10px] outline-none border ${
                                                                val === '' ? 'bg-slate-50 dark:bg-dk-bg border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text focus:border-indigo-500 dark:focus:border-dk-accent'
                                                                    : ecart === 0 ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400'
                                                                        : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60 text-amber-700 dark:text-amber-400 font-bold'
                                                            }`}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const SingleCell: React.FC<{ lang: Lang; theorique: number; value: number | ''; onChange: (v: number | '') => void }> = ({ lang, theorique, value, onChange }) => (
    <div className="flex items-center gap-3">
        <span className="text-[11px] text-slate-500 dark:text-dk-muted">{tx(lang, { fr: 'Quantité comptée (théorique : ', ar: 'الكمية المعدودة (النظري: ', en: 'Counted quantity (theoretical: ', es: 'Cantidad contada (teórico: ', pt: 'Quantidade contada (teórico: ', tr: 'Sayılan miktar (teorik: ' })}{theorique})</span>
        <input
            type="number"
            min={0}
            value={value}
            placeholder={String(theorique)}
            onChange={e => onChange(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
            className="w-20 text-center rounded-lg px-2 py-1.5 text-[12px] font-bold bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
        />
    </div>
);

export default Inventaire;
