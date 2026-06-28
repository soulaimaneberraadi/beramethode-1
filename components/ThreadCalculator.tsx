import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Check, X, Calculator, Package, ChevronDown, ChevronUp, Maximize2, ArrowLeft, Printer, Plus, Copy, Pencil, Trash2 } from 'lucide-react';
import { Operation, Material } from '../types';
import { STITCH_TYPES, MACHINE_THREAD_CONFIG, BOBBIN_SIZES, GARMENT_INDICES, findGarmentIndice, type StitchType, type GarmentIndice } from '../data/threadConsumption';
import { suggestClasseFromFamilyInput } from '../lib/machineCategoryClasseLink';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';
import { useIsDark } from '../src/context/ThemeContext';
import type { TxMap } from '../lib/i18n';

interface ThreadCalculatorProps {
    operations: Operation[];
    setOperations?: React.Dispatch<React.SetStateAction<Operation[]>>;
    orderQty: number;
    colors?: { id: string; name: string }[];
    gridQuantities?: Record<string, number>;
    /** Type de modÃ¨le (catÃ©gorie de la fiche technique) â€” sert d'estimation par Indice. */
    modelCategory?: string;
    onApply: (threadMaterials: Material[]) => void;
    onClose: () => void;
    threadCalcState?: any;
    onSaveState?: (state: any) => void;
}

interface OperationThreadData {
    operation: Operation;
    selected: boolean;
    machineCode: string;
    machineRaw: string;
    machineLabel: string;
    stitchType: StitchType | null;
    /** true = consommation par piÃ¨ce (boutonniÃ¨re, bouton, bride) ; false = par mÃ¨tre de couture */
    isPerPiece: boolean;
    /** Valeur saisie : longueur en cm (par mÃ¨tre) OU nombre de piÃ¨ces (par piÃ¨ce) */
    lengthCm: number;
    consumptionFactor: number;
    threadMetersPerUnit: number;
    /** LibellÃ© libre du type de fil utilisÃ© (ex: "Polyester Tex 27", "Coton NM 50"). Sert Ã  distinguer les modÃ¨les qui utilisent plusieurs types de fil. */
    threadType: string;
    /**
     * Matrice couleur Ã— opÃ©ration : pour chaque couleur de la commande, indique si la
     * couleur est utilisÃ©e dans cette opÃ©ration (active) et quel type de fil lui est
     * associÃ© (threadType vide = hÃ©rite du threadType global de l'opÃ©ration).
     * Couvre les 3 cas : fil par opÃ©ration (mÃªme type pour toutes les couleurs),
     * fil par couleur (type diffÃ©rent par colonne), fil sur certaines couleurs (active=false).
     */
    colorThreads: Record<string, { active: boolean; threadType: string }>;
    /** Mode multi-fils : rÃ©partition manuelle des fils du poste (un cercle par fil). */
    multiThread: boolean;
    /**
     * Affectation de chaque fil du poste (longueur = nb de fils de la machine).
     * '' = fil Â« couleur modÃ¨le Â» (suit chaque couleur de la commande) ;
     * sinon = nom d'un type de fil standard, identique pour toutes les couleurs.
     * La consommation du poste est rÃ©partie Ã€ PARTS Ã‰GALES entre les fils.
     */
    threadSlots: string[];
}

/**
 * Types de points dont la consommation est exprimÃ©e PAR PIÃˆCE (et non par mÃ¨tre) :
 * boutonniÃ¨res, boutons et brides. Pour ceux-ci, la valeur saisie est un NOMBRE
 * de piÃ¨ces, et fil = nombre Ã— facteur (pas de division par 100).
 */
const PER_PIECE_STITCH_CODES = new Set<string>([
    'BOUTONNIERE_2F',
    'BOUTONNIERE_4F',
    'BOUTONNIERE_LINGERIE_N',
    'BOUTONNIERE_LINGERIE_C',
    'BOUTONNIERE_CEILLET',
    'BRIDE_NOUE',
]);

function computeThreadPerUnit(value: number, factor: number, isPerPiece: boolean): number {
    // par piÃ¨ce : value = nb de piÃ¨ces ; par mÃ¨tre : value = longueur en cm â†’ m
    return isPerPiece ? value * factor : (value / 100) * factor;
}

function formatNumberFr(num: number, minimumFractionDigits = 0, maximumFractionDigits = 2): string {
    if (num === undefined || num === null || isNaN(num)) return '0';
    return num.toLocaleString('fr-FR', { minimumFractionDigits, maximumFractionDigits })
              .replace(/[\u202f\u00a0]/g, ' ');
}

function CalcModeToggle({ calcMode, onChange }: { calcMode: 'poste' | 'indice'; onChange: (m: 'poste' | 'indice') => void }) {
    const { lang } = useLang();
    const _ = useCallback((m: TxMap) => tx(lang, m), [lang]);
    const tab = (active: boolean) =>
        `px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${active ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm dark:shadow-dk-sm' : 'text-slate-500 dark:text-dk-muted hover:text-slate-700'}`;
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{_({ fr: 'MÃ©thode de calcul', ar: 'Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø­Ø³Ø§Ø¨', en: 'Calculation method', es: 'MÃ©todo de cÃ¡lculo', pt: 'MÃ©todo de cÃ¡lculo', tr: 'Hesaplama yÃ¶ntemi' })}</span>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-dk-border bg-slate-100 dark:bg-dk-elevated p-0.5">
                <button type="button" onClick={() => onChange('poste')} className={tab(calcMode === 'poste')} aria-pressed={calcMode === 'poste'}>
                    {_({ fr: 'Par poste (prÃ©cis)', ar: 'Ø­Ø³Ø¨ Ø§Ù„Ù…Ø­Ø·Ø© (Ø¯Ù‚ÙŠÙ‚)', en: 'By station (precise)', es: 'Por puesto (preciso)', pt: 'Por posto (preciso)', tr: 'Ä°stasyon bazÄ±nda (hassas)' })}
                </button>
                <button type="button" onClick={() => onChange('indice')} className={tab(calcMode === 'indice')} aria-pressed={calcMode === 'indice'}>
                    {_({ fr: 'Par indice (estimation)', ar: 'Ø­Ø³Ø¨ Ø§Ù„Ù…Ø¤Ø´Ø± (ØªÙ‚Ø¯ÙŠØ±ÙŠ)', en: 'By index (estimate)', es: 'Por Ã­ndice (estimaciÃ³n)', pt: 'Por Ã­ndice (estimativa)', tr: 'Endekse gÃ¶re (tahmini)' })}
                </button>
            </div>
        </div>
    );
}

/**
 * Selecteur de type de modele calme (remplace le <select> natif, dont le
 * menu deroulant de l'OS deborde et parait serre sur mobile). Liste groupee
 * par secteur, hauteur limitee + scroll, fermeture au clic exterieur.
 */
function GarmentSelect({ value, onChange, sectors }: {
    value: string;
    onChange: (key: string) => void;
    sectors: { sec: GarmentIndice['sector']; items: GarmentIndice[] }[];
}) {
    const { lang } = useLang();
    const _ = useCallback((m: TxMap) => tx(lang, m), [lang]);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const selectedName = useMemo(() => {
        for (const { items } of sectors) {
            const found = items.find(g => g.key === value);
            if (found) return found.name;
        }
        return '';
    }, [sectors, value]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const sectorLabel = (sec: string) => {
        const labels: Record<string, TxMap> = {
            Homme: { fr: 'Homme', ar: 'Ø±Ø¬Ø§Ù„ÙŠ', en: 'Men', es: 'Hombre', pt: 'Masculino', tr: 'Erkek' },
            Femme: { fr: 'Femme', ar: 'Ù†Ø³Ø§Ø¦ÙŠ', en: 'Women', es: 'Mujer', pt: 'Feminino', tr: 'KadÄ±n' },
            Lingerie: { fr: 'Lingerie', ar: 'Ù…Ù„Ø§Ø¨Ø³ Ø¯Ø§Ø®Ù„ÙŠØ©', en: 'Lingerie', es: 'LencerÃ­a', pt: 'Lingerie', tr: 'Ä°Ã§ giyim' },
            Chaussures: { fr: 'Chaussures', ar: 'Ø£Ø­Ø°ÙŠØ©', en: 'Shoes', es: 'Zapatos', pt: 'CalÃ§ados', tr: 'AyakkabÄ±' },
        };
        return labels[sec]?.[lang as keyof TxMap] || sec;
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2 text-sm outline-none focus:border-slate-400 transition-colors"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={_({ fr: 'Type de modÃ¨le pour l\'estimation par indice', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ Ù„Ù„ØªÙ‚Ø¯ÙŠØ± Ø­Ø³Ø¨ Ø§Ù„Ù…Ø¤Ø´Ø±', en: 'Model type for index estimation', es: 'Tipo de modelo para estimaciÃ³n por Ã­ndice', pt: 'Tipo de modelo para estimativa por Ã­ndice', tr: 'Endeks tahmini iÃ§in model tÃ¼rÃ¼' })}
            >
                <span className={selectedName ? 'text-slate-700 dark:text-dk-text-soft truncate' : 'text-slate-400 dark:text-dk-muted'}>
                    {selectedName || _({ fr: 'â€” Choisir un modÃ¨le â€”', ar: 'â€” Ø§Ø®ØªØ± Ù†Ù…ÙˆØ°Ø¬Ù‹Ø§ â€”', en: 'â€” Choose a model â€”', es: 'â€” Elegir un modelo â€”', pt: 'â€” Escolher um modelo â€”', tr: 'â€” Bir model seÃ§in â€”' })}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
            </button>
            {open && (
                <div
                    className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-lg dark:shadow-dk-lg ring-1 ring-slate-200/60 py-1"
                    role="listbox"
                >
                    <button
                        type="button"
                        onClick={() => { onChange(''); setOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm text-slate-400 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors"
                    >
                        {_({ fr: 'â€” Choisir un modÃ¨le â€”', ar: 'â€” Ø§Ø®ØªØ± Ù†Ù…ÙˆØ°Ø¬Ù‹Ø§ â€”', en: 'â€” Choose a model â€”', es: 'â€” Elegir un modelo â€”', pt: 'â€” Escolher um modelo â€”', tr: 'â€” Bir model seÃ§in â€”' })}
                    </button>
                    {sectors.map(({ sec, items }) => (
                        <div key={sec}>
                            <div className="sticky top-0 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted bg-slate-50 dark:bg-dk-bg">{sectorLabel(sec)}</div>
                            {items.map(g => {
                                const active = g.key === value;
                                return (
                                    <button
                                        key={g.key}
                                        type="button"
                                        role="option"
                                        aria-selected={active}
                                        onClick={() => { onChange(g.key); setOpen(false); }}
                                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 font-medium' : 'text-slate-700 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}
                                    >
                                        {g.name}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface IndiceEstimatePanelProps {
    autoMatchName?: string | null;
    garmentKey: string;
    garment?: GarmentIndice;
    indiceValue: number;
    surfilage: number | null;
    assemblage: number | null;
    qty: number;
    wastePercent: number;
    bobbinSize: number;
    totalWithWaste: number;
    bobbins: number;
    colorBreakdown: { colorId: string; colorName: string; quantity: number; threadMeters: number; bobbins: number }[];
    onSelectKey: (key: string) => void;
    onIndiceChange: (n: number) => void;
    onResetIndice: () => void;
}

/**
 * Panneau d'estimation PAR INDICE (methode approximative, sans gamme detaillee).
 * Source : "Indices de la consommation de fil a coudre".
 *   Fil/Unite (m) = Indice du type de modele (ajustable dans la Plage)
 *   Total = Indice x Qte x (1 + usure%)  ->  Bobines = arrondi sup(Total / taille bobine)
 * Composant presentationnel : l'etat et les totaux sont geres par le parent ;
 * l'application se fait via le bouton "Appliquer" commun en bas.
 */
function IndiceEstimatePanel({
    autoMatchName,
    garmentKey,
    garment,
    indiceValue,
    surfilage,
    assemblage,
    qty,
    wastePercent,
    bobbinSize,
    totalWithWaste,
    bobbins,
    colorBreakdown,
    onSelectKey,
    onIndiceChange,
    onResetIndice,
}: IndiceEstimatePanelProps) {
    const { lang } = useLang();
    const _ = useCallback((m: TxMap) => tx(lang, m), [lang]);
    const sectors = useMemo(() => {
        const order: GarmentIndice['sector'][] = ['Homme', 'Femme', 'Lingerie', 'Chaussures'];
        return order.map(sec => ({ sec, items: GARMENT_INDICES.filter(g => g.sector === sec) }));
    }, []);

    const totalBobbins = colorBreakdown.length > 0 ? colorBreakdown.reduce((s, c) => s + c.bobbins, 0) : bobbins;

    return (
        <div className="rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-dk-border px-4 py-2.5">
                <Calculator className="h-4 w-4 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                <span className="text-sm font-semibold text-slate-700 dark:text-dk-text-soft">{_({ fr: 'Estimation par indice', ar: 'ØªÙ‚Ø¯ÙŠØ± Ø­Ø³Ø¨ Ø§Ù„Ù…Ø¤Ø´Ø±', en: 'Index estimation', es: 'EstimaciÃ³n por Ã­ndice', pt: 'Estimativa por Ã­ndice', tr: 'Endeks tahmini' })}</span>
                <span className="text-[11px] text-slate-400 dark:text-dk-muted">{_({ fr: 'approximatif', ar: 'ØªÙ‚Ø±ÙŠØ¨ÙŠ', en: 'approximate', es: 'aproximado', pt: 'aproximado', tr: 'yaklaÅŸÄ±k' })}</span>
            </div>

            <div className="space-y-3 p-4">
                <p className="text-xs text-slate-500 dark:text-dk-muted leading-relaxed">
                    {_({ fr: 'Estimation basÃ©e sur le', ar: 'ØªÙ‚Ø¯ÙŠØ± ÙŠØ¹ØªÙ…Ø¯ Ø¹Ù„Ù‰', en: 'Estimation based on', es: 'EstimaciÃ³n basada en el', pt: 'Estimativa baseada no', tr: 'Tahmin ÅŸuna dayanÄ±r' })} <span className="font-semibold text-slate-700 dark:text-dk-text-soft">{_({ fr: 'type de modÃ¨le', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ù†Ù…ÙˆØ°Ø¬', en: 'model type', es: 'tipo de modelo', pt: 'tipo de modelo', tr: 'model tÃ¼rÃ¼' })}</span>.
                    {autoMatchName
                        ? <> {_({ fr: 'Type :', ar: 'Ø§Ù„Ù†ÙˆØ¹ :', en: 'Type:', es: 'Tipo:', pt: 'Tipo:', tr: 'TÃ¼r:' })} <span className="font-semibold text-slate-700 dark:text-dk-text-soft">{autoMatchName}</span>.</>
                        : <> {_({ fr: 'Aucun type dÃ©tectÃ© â€” choisissez-le ci-dessous.', ar: 'Ù„Ù… ÙŠØªÙ… Ø§ÙƒØªØ´Ø§Ù Ù†ÙˆØ¹ â€” Ø§Ø®ØªØ±Ù‡ Ø£Ø¯Ù†Ø§Ù‡.', en: 'No type detected â€” choose one below.', es: 'NingÃºn tipo detectado â€” elÃ­jalo abajo.', pt: 'Nenhum tipo detectado â€” escolha abaixo.', tr: 'HiÃ§bir tÃ¼r algÄ±lanmadÄ± â€” aÅŸaÄŸÄ±dan seÃ§in.' })}</>}
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{_({ fr: 'Type de modÃ¨le', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ù†Ù…ÙˆØ°Ø¬', en: 'Model type', es: 'Tipo de modelo', pt: 'Tipo de modelo', tr: 'Model tÃ¼rÃ¼' })}</label>
                        <GarmentSelect value={garmentKey} onChange={onSelectKey} sectors={sectors} />
                    </div>

                    {garment && (
                        <div>
                            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">
                                {_({ fr: 'Indice :', ar: 'Ø§Ù„Ù…Ø¤Ø´Ø± :', en: 'Index:', es: 'Ãndice:', pt: 'Ãndice:', tr: 'Endeks:' })} <span className="text-slate-700 dark:text-dk-text-soft normal-case">{indiceValue} m</span>
                                <span className="font-normal text-slate-400 dark:text-dk-muted normal-case"> ({garment.plageMin}â€“{garment.plageMax})</span>
                            </label>
                            <input
                                type="range"
                                min={garment.plageMin}
                                max={garment.plageMax}
                                step={1}
                                value={indiceValue}
                                onChange={(e) => onIndiceChange(Number(e.target.value))}
                                className="w-full accent-slate-600"
                                aria-label={_({ fr: 'Ajuster l\'indice dans la plage', ar: 'Ø¶Ø¨Ø· Ø§Ù„Ù…Ø¤Ø´Ø± ÙÙŠ Ø§Ù„Ù†Ø·Ø§Ù‚', en: 'Adjust the index within range', es: 'Ajustar el Ã­ndice en el rango', pt: 'Ajustar o Ã­ndice no intervalo', tr: 'Endeksi aralÄ±kta ayarlayÄ±n' })}
                            />
                            <div className="mt-0.5 flex justify-between text-[10px] text-slate-400 dark:text-dk-muted">
                                <span>{garment.plageMin}</span>
                                <button
                                    type="button"
                                    onClick={onResetIndice}
                                    className="font-semibold text-slate-500 dark:text-dk-muted hover:text-slate-700 transition-colors"
                                >
                                    {_({ fr: 'dÃ©faut', ar: 'Ø§ÙØªØ±Ø§Ø¶ÙŠ', en: 'default', es: 'defecto', pt: 'padrÃ£o', tr: 'varsayÄ±lan' })} ({garment.indice})
                                </button>
                                <span>{garment.plageMax}</span>
                            </div>
                        </div>
                    )}
                </div>

                {garment ? (
                    <>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { label: _({ fr: 'Surfilage', ar: 'ØªØºØ·ÙŠØ©', en: 'Overlock', es: 'Sobrecostura', pt: 'Overloque', tr: 'Overlok' }), value: surfilage != null ? `${surfilage} m` : 'â€”' },
                                { label: _({ fr: 'Assemblage', ar: 'ØªØ¬Ù…ÙŠØ¹', en: 'Assembly', es: 'Ensamblaje', pt: 'Montagem', tr: 'Montaj' }), value: assemblage != null ? `${assemblage} m` : 'â€”' },
                                { label: _({ fr: 'Indice total', ar: 'Ø§Ù„Ù…Ø¤Ø´Ø± Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ', en: 'Total index', es: 'Ãndice total', pt: 'Ãndice total', tr: 'Toplam endeks' }), value: `${indiceValue} m` },
                            ].map((c) => (
                                <div key={c.label} className="rounded-md border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-2 py-1.5 text-center">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{c.label}</p>
                                    <p className="font-semibold text-slate-700 dark:text-dk-text-soft tabular-nums text-sm">{c.value}</p>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{_({ fr: 'Fil/UnitÃ©', ar: 'Ø®ÙŠØ·/ÙˆØ­Ø¯Ø©', en: 'Thread/Unit', es: 'Hilo/Unidad', pt: 'Fio/Unidade', tr: 'Ä°plik/Birim' })}</p>
                                <p className="font-semibold text-slate-800 dark:text-dk-text tabular-nums text-base sm:text-lg">{indiceValue}</p>
                                <p className="text-[10px] text-slate-400 dark:text-dk-muted">{_({ fr: 'mÃ¨tres', ar: 'Ø£Ù…ØªØ§Ø±', en: 'meters', es: 'metros', pt: 'metros', tr: 'metre' })}</p>
                            </div>
                            <div className="rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{_({ fr: 'Total +', ar: 'Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ +', en: 'Total +', es: 'Total +', pt: 'Total +', tr: 'Toplam +' })}{wastePercent}%</p>
                                <p className="font-semibold text-slate-800 dark:text-dk-text tabular-nums text-base sm:text-lg">{formatNumberFr(Math.ceil(totalWithWaste))}</p>
                                <p className="text-[10px] text-slate-400 dark:text-dk-muted">{_({ fr: 'mÃ¨tres', ar: 'Ø£Ù…ØªØ§Ø±', en: 'meters', es: 'metros', pt: 'metros', tr: 'metre' })}</p>
                            </div>
                            <div className="rounded-md border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-3 py-2 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-dk-muted">{_({ fr: 'Bobines', ar: 'Ø¨ÙƒØ±Ø§Øª', en: 'Bobbins', es: 'Bobinas', pt: 'Bobinas', tr: 'Bobinler' })}</p>
                                <p className="font-semibold text-slate-800 dark:text-dk-text tabular-nums text-base sm:text-lg">{formatNumberFr(totalBobbins)}</p>
                                <p className="text-[10px] text-slate-400 dark:text-dk-muted">{bobbinSize}m Â· {formatNumberFr(qty)} {_({ fr: 'pcs', ar: 'Ù‚Ø·Ø¹Ø©', en: 'pcs', es: 'pzas', pt: 'pÃ§', tr: 'adet' })}</p>
                            </div>
                        </div>

                        {colorBreakdown.length > 0 && (
                            <div className="overflow-hidden rounded-md border border-slate-200 dark:border-dk-border">
                                <div className="border-b border-slate-100 dark:border-dk-border px-3 py-2">
                                    <span className="text-xs font-semibold text-slate-500 dark:text-dk-muted uppercase tracking-wide">{_({ fr: 'DÃ©tail par couleur', ar: 'ØªÙØµÙŠÙ„ Ø­Ø³Ø¨ Ø§Ù„Ù„ÙˆÙ†', en: 'Detail by color', es: 'Detalle por color', pt: 'Detalhe por cor', tr: 'Renklere gÃ¶re detay' })}</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs sm:text-sm">
                                        <thead className="bg-slate-50 dark:bg-dk-bg text-[10px] uppercase tracking-wide text-slate-400 dark:text-dk-muted">
                                            <tr>
                                                <th className="px-2 sm:px-3 py-1.5 text-left font-semibold">{_({ fr: 'Couleur', ar: 'Ø§Ù„Ù„ÙˆÙ†', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' })}</th>
                                                <th className="px-2 sm:px-3 py-1.5 text-right font-semibold">{_({ fr: 'QuantitÃ©', ar: 'Ø§Ù„ÙƒÙ…ÙŠØ©', en: 'Quantity', es: 'Cantidad', pt: 'Quantidade', tr: 'Miktar' })}</th>
                                                <th className="px-2 sm:px-3 py-1.5 text-right font-semibold">{_({ fr: 'Fil Total', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø®ÙŠØ·', en: 'Total Thread', es: 'Hilo Total', pt: 'Fio Total', tr: 'Toplam Ä°plik' })}</th>
                                                <th className="px-2 sm:px-3 py-1.5 text-right font-semibold">{_({ fr: 'Bob.', ar: 'Ø¨ÙƒØ±Ø©', en: 'Bob.', es: 'Bob.', pt: 'Bob.', tr: 'Bob.' })}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                            {colorBreakdown.map((color) => (
                                                <tr key={color.colorId} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                                                    <td className="px-2 sm:px-3 py-1.5 font-medium text-slate-700 dark:text-dk-text-soft">{color.colorName}</td>
                                                    <td className="px-2 sm:px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-dk-text-soft">{formatNumberFr(color.quantity)}</td>
                                                    <td className="px-2 sm:px-3 py-1.5 text-right tabular-nums font-medium text-slate-700 dark:text-dk-text-soft">{formatNumberFr(color.threadMeters)} m</td>
                                                    <td className="px-2 sm:px-3 py-1.5 text-right tabular-nums font-semibold text-slate-800 dark:text-dk-text">{formatNumberFr(color.bobbins)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <p className="py-3 text-center text-xs text-slate-400 dark:text-dk-muted">{_({ fr: 'Choisissez un type de modÃ¨le pour estimer la consommation.', ar: 'Ø§Ø®ØªØ± Ù†ÙˆØ¹ Ù†Ù…ÙˆØ°Ø¬ Ù„ØªÙ‚Ø¯ÙŠØ± Ø§Ù„Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ.', en: 'Choose a model type to estimate consumption.', es: 'Elija un tipo de modelo para estimar el consumo.', pt: 'Escolha um tipo de modelo para estimar o consumo.', tr: 'TÃ¼ketimi tahmin etmek iÃ§in bir model tÃ¼rÃ¼ seÃ§in.' })}</p>
                )}
            </div>
        </div>
    );
}

export default function ThreadCalculator({
    operations,
    setOperations,
    orderQty,
    colors = [],
    gridQuantities = {},
    modelCategory,
    onApply,
    onClose,
    threadCalcState,
    onSaveState
}: ThreadCalculatorProps) {
    const { lang } = useLang();
    const isDark = useIsDark();
    const _ = useCallback((m: TxMap) => tx(lang, m), [lang]);
    const [wastePercent, setWastePercent] = useState(() => {
        if (threadCalcState?.wastePercent !== undefined) return threadCalcState.wastePercent;
        try {
            const saved = localStorage.getItem('beramethode_thread_waste');
            return saved ? parseInt(saved, 10) : 10;
        } catch { return 10; }
    });
    const [selectedBobbinSize, setSelectedBobbinSize] = useState(() => {
        if (threadCalcState?.selectedBobbinSize !== undefined) return threadCalcState.selectedBobbinSize;
        try {
            const saved = localStorage.getItem('beramethode_thread_bobbinsize');
            return saved ? parseInt(saved, 10) : 5000;
        } catch { return 5000; }
    });
    const [isExpanded, setIsExpanded] = useState(false);

    // ClÃ© unique pour le cache localStorage basÃ©e sur les IDs des opÃ©rations.
    // Change automatiquement si la gamme change (nouvelles opÃ©rations).
    const cacheKey = React.useMemo(() => {
        const ids = operations.map(o => o.id).join(',');
        return `beramethode_threadcalc_${btoa(ids).slice(0, 32)}`;
    }, [operations]);
    const [availableThreadTypes, setAvailableThreadTypes] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('beramethode_thread_types');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const saveThreadTypes = (list: string[]) => {
        try { localStorage.setItem('beramethode_thread_types', JSON.stringify(list)); } catch { /* noop */ }
    };
    const [threadPrices, setThreadPrices] = useState<Record<string, number>>(() => {
        if (threadCalcState?.threadPrices) return threadCalcState.threadPrices;
        try {
            const saved = localStorage.getItem('beramethode_thread_prices');
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });
    const updateThreadPrice = (type: string, price: number) => {
        const next = { ...threadPrices, [type]: price };
        setThreadPrices(next);
        try { localStorage.setItem('beramethode_thread_prices', JSON.stringify(next)); } catch { /* noop */ }
    };

    // Ajoute un type de fil Ã  la liste (ignorÃ© si vide ou dÃ©jÃ  prÃ©sent).
    const addThreadTypeValue = (value: string) => {
        const v = value.trim();
        if (!v || availableThreadTypes.includes(v)) return;
        const next = [...availableThreadTypes, v];
        setAvailableThreadTypes(next);
        saveThreadTypes(next);
    };

    // Renomme un type de fil ET met Ã  jour toutes les rÃ©fÃ©rences dans les opÃ©rations.
    const renameThreadTypeValue = (oldValue: string, newValue: string) => {
        const v = newValue.trim();
        if (!v || v === oldValue) return;
        const next = Array.from(new Set(availableThreadTypes.map(t => (t === oldValue ? v : t))));
        setAvailableThreadTypes(next);
        saveThreadTypes(next);

        // Update price mapping
        const nextPrices = { ...threadPrices };
        if (nextPrices[oldValue] !== undefined) {
            nextPrices[v] = nextPrices[oldValue];
            delete nextPrices[oldValue];
        }
        setThreadPrices(nextPrices);
        try { localStorage.setItem('beramethode_thread_prices', JSON.stringify(nextPrices)); } catch { /* noop */ }

        setOpsData(prev => prev.map(item => {
            const colorThreads = { ...item.colorThreads };
            Object.keys(colorThreads).forEach(cid => {
                if (colorThreads[cid].threadType === oldValue) colorThreads[cid] = { ...colorThreads[cid], threadType: v };
            });
            return {
                ...item,
                threadType: item.threadType === oldValue ? v : item.threadType,
                colorThreads,
                threadSlots: item.threadSlots.map(s => (s === oldValue ? v : s)),
            };
        }));
    };

    // Supprime un type de fil ET vide toutes les rÃ©fÃ©rences qui l'utilisaient.
    const deleteThreadTypeValue = (value: string) => {
        const next = availableThreadTypes.filter(t => t !== value);
        setAvailableThreadTypes(next);
        saveThreadTypes(next);

        // Update price mapping
        const nextPrices = { ...threadPrices };
        delete nextPrices[value];
        setThreadPrices(nextPrices);
        try { localStorage.setItem('beramethode_thread_prices', JSON.stringify(nextPrices)); } catch { /* noop */ }

        setOpsData(prev => prev.map(item => {
            const colorThreads = { ...item.colorThreads };
            Object.keys(colorThreads).forEach(cid => {
                if (colorThreads[cid].threadType === value) colorThreads[cid] = { ...colorThreads[cid], threadType: '' };
            });
            return {
                ...item,
                threadType: item.threadType === value ? '' : item.threadType,
                colorThreads,
                threadSlots: item.threadSlots.map(s => (s === value ? '' : s)),
            };
        }));
    };

    // Couleurs effectives de la commande, dÃ©dupliquÃ©es par id (corrige le doublon
    // Â« Vert Ã‰meraude Â» qui apparaissait deux fois dans le dÃ©tail couleur).
    const effectiveColors = useMemo(() => {
        const seen = new Set<string>();
        return colors.filter(c => {
            if (!c || !c.id || seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
        });
    }, [colors]);

    // QuantitÃ© par couleur (somme de la grille couleurs Ã— tailles) â€” clÃ© `${colorId}_${sizeIndex}`.
    const colorQtyMap = useMemo<Record<string, number>>(() => {
        const map: Record<string, number> = {};
        effectiveColors.forEach(color => {
            map[color.id] = Object.entries(gridQuantities)
                .filter(([key]) => key.startsWith(`${color.id}_`))
                .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
        });
        return map;
    }, [effectiveColors, gridQuantities]);

    // Map operations to thread data
    const operationsData = useMemo<OperationThreadData[]>(() => {
        const initColorThreads = (): Record<string, { active: boolean; threadType: string }> => {
            const ct: Record<string, { active: boolean; threadType: string }> = {};
            effectiveColors.forEach(c => { ct[c.id] = { active: true, threadType: '' }; });
            return ct;
        };
        return operations.map(op => {
            const machineName = op.machineName || op.machineId || '';
            const machineCode = extractCodeFromClass(machineName) || suggestClasseFromFamilyInput(machineName) || '';
            const stitchType = findStitchTypeByMachineCode(machineCode);
            const isPerPiece = !!stitchType && PER_PIECE_STITCH_CODES.has(stitchType.code);
            // Pour les opÃ©rations par piÃ¨ce (boutonniÃ¨re, bride) : si length=0, on part de 1 piÃ¨ce
            const lengthCm = op.length || (isPerPiece ? 1 : 0);
            const consumptionFactor = stitchType?.consumptionFactor || 0;
            const threadMetersPerUnit = computeThreadPerUnit(lengthCm, consumptionFactor, isPerPiece);

            // Get full machine label from MACHINE_THREAD_CONFIG
            const machineConfig = MACHINE_THREAD_CONFIG.find(m => m.machineCode === machineCode);
            const machineLabel = machineConfig?.machineName || machineConfig?.machineNameAr || machineName || `Machine ${machineCode}`;
            // Nombre de fils du poste â†’ un cercle par fil en mode multi-fils
            const threadCount = stitchType?.threadCount || machineConfig?.threadCount || 1;

            return {
                operation: op,
                // BoutonniÃ¨re/Bride : sÃ©lectionnÃ©es par dÃ©faut mÃªme si threadMeters = 0
                selected: threadMetersPerUnit > 0 || isPerPiece,
                machineCode,
                machineRaw: machineName,
                machineLabel,
                stitchType,
                isPerPiece,
                lengthCm,
                consumptionFactor,
                threadMetersPerUnit,
                threadType: '',
                colorThreads: initColorThreads(),
                multiThread: false,
                threadSlots: Array.from({ length: threadCount }, () => ''),
            };
        });
    }, [operations, effectiveColors]);

    const [opsData, setOpsData] = useState<OperationThreadData[]>(() => {
        // Restaurer depuis le prop ou cache si disponible
        try {
            const raw = threadCalcState || (localStorage.getItem(cacheKey) ? JSON.parse(localStorage.getItem(cacheKey)) : null);
            if (raw) {
                const cache = raw as {
                    opsEdits: Record<string, {
                        selected: boolean;
                        threadType: string;
                        colorThreads: Record<string, { active: boolean; threadType: string }>;
                        multiThread: boolean;
                        threadSlots: string[];
                        lengthCm: number;
                    }>;
                    wastePercent?: number;
                    selectedBobbinSize?: number;
                    calcMode?: 'poste' | 'indice';
                };
                // Fusionner les Ã©ditions sauvegardÃ©es avec operationsData frais
                return operationsData.map(op => {
                    const saved = cache.opsEdits?.[op.operation.id];
                    if (!saved) return op;
                    const lengthCm = saved.lengthCm ?? op.lengthCm;
                    return {
                        ...op,
                        selected: saved.selected ?? op.selected,
                        threadType: saved.threadType ?? op.threadType,
                        colorThreads: saved.colorThreads ?? op.colorThreads,
                        multiThread: saved.multiThread ?? op.multiThread,
                        threadSlots: saved.threadSlots?.length === op.threadSlots.length
                            ? saved.threadSlots
                            : op.threadSlots,
                        lengthCm,
                        threadMetersPerUnit: computeThreadPerUnit(lengthCm, op.consumptionFactor, op.isPerPiece),
                    };
                });
            }
        } catch { /* ignore */ }
        return operationsData;
    });

    // Mode de calcul : "poste" (precis, base sur la gamme) ou "indice" (estimation
    // par type de modele). Sans gamme exploitable, on bascule par defaut sur "indice".
    const hasGammeData = useMemo(() => operationsData.some(o => o.threadMetersPerUnit > 0), [operationsData]);
    const autoGarment = useMemo(() => findGarmentIndice(modelCategory), [modelCategory]);
    const [calcMode, setCalcMode] = useState<'poste' | 'indice'>(() => {
        try {
            if (threadCalcState?.calcMode) return threadCalcState.calcMode;
            const raw = localStorage.getItem(cacheKey);
            if (raw) return (JSON.parse(raw)?.calcMode || 'poste') as 'poste' | 'indice';
        } catch { /* ignore */ }
        return 'poste';
    });
    const [garmentKey, setGarmentKey] = useState<string>(autoGarment?.key || '');
    const [indiceOverride, setIndiceOverride] = useState<number | null>(null);
    const [modeAutoSet, setModeAutoSet] = useState(false);

    // Auto-save Ã  chaque modification de opsData ou paramÃ¨tres
    React.useEffect(() => {
        try {
            const opsEdits: Record<string, object> = {};
            opsData.forEach(op => {
                opsEdits[op.operation.id] = {
                    selected: op.selected,
                    threadType: op.threadType,
                    colorThreads: op.colorThreads,
                    multiThread: op.multiThread,
                    threadSlots: op.threadSlots,
                    lengthCm: op.lengthCm,
                };
            });
            const state = {
                opsEdits,
                wastePercent,
                selectedBobbinSize,
                calcMode,
                threadPrices,
            };
            localStorage.setItem(cacheKey, JSON.stringify(state));
            onSaveState?.(state);
        } catch { /* ignore */ }
    }, [opsData, wastePercent, selectedBobbinSize, calcMode, cacheKey, threadPrices, onSaveState]);

    // Une seule bascule automatique vers "indice" si la gamme n'a aucune donnee.
    React.useEffect(() => {
        if (!modeAutoSet && !hasGammeData) {
            setCalcMode('indice');
            setModeAutoSet(true);
        }
    }, [hasGammeData, modeAutoSet]);

    // Pre-remplit le type de modele depuis la fiche technique tant que rien n'est choisi.
    React.useEffect(() => {
        if (autoGarment && !garmentKey) setGarmentKey(autoGarment.key);
    }, [autoGarment, garmentKey]);

    // Update when operations change â€” preserve user edits (threadType, colorThreads,
    // multiThread, threadSlots, selected) and only refresh structural/computed fields.
    const isFirstRender = React.useRef(true);
    React.useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return; // already initialized via useState
        }
        setOpsData(prev =>
            operationsData.map((newOp, i) => {
                const existing = prev.find(p => p.operation.id === newOp.operation.id);
                if (!existing) return newOp;
                // Keep all user edits, only refresh structural fields
                return {
                    ...newOp,
                    selected: existing.selected,
                    threadType: existing.threadType,
                    colorThreads: existing.colorThreads,
                    multiThread: existing.multiThread,
                    threadSlots: existing.threadSlots.length === newOp.threadSlots.length
                        ? existing.threadSlots
                        : newOp.threadSlots,
                    // Keep user-edited length unless the operation itself changed
                    lengthCm: existing.lengthCm,
                    threadMetersPerUnit: computeThreadPerUnit(
                        existing.lengthCm,
                        newOp.consumptionFactor,
                        newOp.isPerPiece
                    ),
                };
            })
        );
    }, [operationsData]);

    const toggleOperation = (index: number) => {
        setOpsData(prev => prev.map((item, i) =>
            i === index ? { ...item, selected: !item.selected } : item
        ));
    };

    const selectAll = () => {
        setOpsData(prev => prev.map(item => ({
            ...item,
            selected: item.threadMetersPerUnit > 0,
        })));
    };

    const deselectAll = () => {
        setOpsData(prev => prev.map(item => ({ ...item, selected: false })));
    };

    // Escape key handler
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Prevent background body scroll when modal/page is open
    React.useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    // Edit seam length (cm) directly in the table, like the Gamme
    const updateLength = (index: number, cm: number) => {
        const lengthCm = Math.max(0, Math.floor(cm) || 0);
        setOpsData(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const threadMetersPerUnit = computeThreadPerUnit(lengthCm, item.consumptionFactor, item.isPerPiece);
            return {
                ...item,
                lengthCm,
                threadMetersPerUnit,
                // Auto-select once a usable value is entered
                selected: threadMetersPerUnit > 0 ? true : item.selected,
            };
        }));

        // NOTE: on ne synchonise PAS en temps rÃ©el vers la Gamme pour Ã©viter la
        // boucle de reset (operations â†’ operationsData â†’ useEffect â†’ setOpsData).
        // La longueur sera appliquÃ©e Ã  la Gamme uniquement si l'utilisateur clique
        // sur Â« Appliquer Â» (handleApply s'en charge via onApply).
    };

    // Edit bobine count directly: threadMetersPerUnit = bobines Ã— selectedBobbinSize
    const updateBobines = (index: number, bobines: number) => {
        const b = Math.max(0, bobines || 0);
        setOpsData(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const threadMetersPerUnit = b * selectedBobbinSize;
            return {
                ...item,
                threadMetersPerUnit,
                selected: threadMetersPerUnit > 0 ? true : item.selected,
            };
        }));
    };

    // Edit type of thread (libre) used for this operation
    const updateThreadType = (index: number, value: string) => {
        setOpsData(prev => prev.map((item, i) =>
            i === index ? { ...item, threadType: value } : item
        ));
    };

    // --- Matrice couleur Ã— opÃ©ration ---

    // Active/dÃ©sactive une couleur pour une opÃ©ration donnÃ©e (cellule de la matrice).
    const toggleColorActive = (index: number, colorId: string) => {
        setOpsData(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const cur = item.colorThreads[colorId] || { active: true, threadType: '' };
            return { ...item, colorThreads: { ...item.colorThreads, [colorId]: { ...cur, active: !cur.active } } };
        }));
    };

    // DÃ©finit le type de fil d'une couleur pour une opÃ©ration donnÃ©e.
    const setColorThreadType = (index: number, colorId: string, threadType: string) => {
        setOpsData(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const cur = item.colorThreads[colorId] || { active: true, threadType: '' };
            return { ...item, colorThreads: { ...item.colorThreads, [colorId]: { ...cur, threadType } } };
        }));
    };

    // Active/dÃ©sactive le mode multi-fils (rÃ©partition par cercle) d'une opÃ©ration.
    const toggleMultiThread = (index: number) => {
        setOpsData(prev => prev.map((item, i) =>
            i === index ? { ...item, multiThread: !item.multiThread } : item
        ));
    };

    // Affecte un type de fil (ou '' = couleur modÃ¨le) Ã  UN fil prÃ©cis du poste.
    const setThreadSlot = (index: number, slot: number, value: string) => {
        setOpsData(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const threadSlots = [...item.threadSlots];
            threadSlots[slot] = value;
            return { ...item, threadSlots };
        }));
    };

    // Applique le type de fil d'une couleur (depuis l'opÃ©ration `index`) Ã  TOUTES les opÃ©rations.
    const applyColorThreadToAllOps = (index: number, colorId: string) => {
        setOpsData(prev => {
            const source = prev[index]?.colorThreads[colorId];
            if (!source) return prev;
            return prev.map(item => ({
                ...item,
                colorThreads: { ...item.colorThreads, [colorId]: { ...source } },
            }));
        });
    };

    // QuantitÃ© rÃ©elle de la commande : somme de la grille (couleurs Ã— tailles) si elle
    // existe, sinon orderQty. CalculÃ©e comme le dÃ©tail couleur pour rester cohÃ©rent.
    const effectiveQty = useMemo(() => {
        const gridTotal = Object.values(colorQtyMap).reduce((sum, v) => sum + (Number(v) || 0), 0);
        return gridTotal > 0 ? gridTotal : (orderQty || 1);
    }, [colorQtyMap, orderQty]);

    // --- Valeurs derivees du mode "indice" (estimation par type de modele) ---
    const indiceGarment = useMemo(() => GARMENT_INDICES.find(g => g.key === garmentKey), [garmentKey]);
    const indiceValue = indiceOverride ?? indiceGarment?.indice ?? 0;
    const indiceTotalWithWaste = indiceValue * effectiveQty * (1 + wastePercent / 100);
    const indiceBobbins = selectedBobbinSize > 0 ? Math.ceil(indiceTotalWithWaste / selectedBobbinSize) : 0;
    // Repartition indicative Surfilage / Assemblage au prorata de l'indice ajuste.
    const indiceRatio = indiceGarment && indiceGarment.indice > 0 ? indiceValue / indiceGarment.indice : 1;
    const indiceSurfilage = indiceGarment?.surfilage != null ? Math.round(indiceGarment.surfilage * indiceRatio) : null;
    const indiceAssemblage = indiceGarment ? Math.round(indiceGarment.assemblage * indiceRatio) : null;

    // Detail par couleur en mode indice : chaque couleur de la commande consomme
    // (indice x sa quantite). Meme logique que le detail couleur du mode poste.
    const indiceColorBreakdown = useMemo(() => {
        if (!indiceGarment || effectiveColors.length === 0) return [] as { colorId: string; colorName: string; quantity: number; threadMeters: number; bobbins: number }[];
        return effectiveColors
            .map(color => {
                const qty = colorQtyMap[color.id] || 0;
                if (qty <= 0) return null;
                const metersWithWaste = indiceValue * qty * (1 + wastePercent / 100);
                const bobbins = selectedBobbinSize > 0 ? Math.ceil(metersWithWaste / selectedBobbinSize) : 0;
                return {
                    colorId: color.id,
                    colorName: color.name,
                    quantity: qty,
                    threadMeters: Math.round(metersWithWaste * 100) / 100,
                    bobbins,
                };
            })
            .filter((c): c is { colorId: string; colorName: string; quantity: number; threadMeters: number; bobbins: number } => !!c && c.threadMeters > 0);
    }, [indiceGarment, effectiveColors, colorQtyMap, indiceValue, wastePercent, selectedBobbinSize]);

    // Bobines totales du mode indice : somme des couleurs si detail couleur, sinon le calcul global.
    const indiceBobbinsTotal = indiceColorBreakdown.length > 0
        ? indiceColorBreakdown.reduce((s, c) => s + c.bobbins, 0)
        : indiceBobbins;

    // Calculate totals per machine type
    const machineSummary = useMemo(() => {
        const selected = opsData.filter(op => op.selected && op.threadMetersPerUnit > 0);
        const byMachine: Record<string, {
            machineCode: string;
            machineLabel: string;
            threadCount: number;
            threadMetersPerUnit: number;
            totalMeters: number;
            totalBobbins: number;
            operations: string[];
        }> = {};

        selected.forEach(op => {
            const key = op.machineCode || 'UNKNOWN';
            if (!byMachine[key]) {
                byMachine[key] = {
                    machineCode: op.machineCode,
                    machineLabel: op.machineLabel,
                    threadCount: op.stitchType?.threadCount || 1,
                    threadMetersPerUnit: 0,
                    totalMeters: 0,
                    totalBobbins: 0,
                    operations: [],
                };
            }
            byMachine[key].threadMetersPerUnit += op.threadMetersPerUnit;
            byMachine[key].totalMeters += Math.round(op.threadMetersPerUnit * effectiveQty * 100) / 100;
            byMachine[key].operations.push(`Op ${op.operation.order}: ${op.operation.description || op.machineLabel}`);
        });

        // Calculate bobbins
        Object.values(byMachine).forEach(machine => {
            const withWaste = machine.totalMeters * (1 + wastePercent / 100);
            machine.totalBobbins = Math.ceil(withWaste / selectedBobbinSize);
        });

        return Object.values(byMachine);
    }, [opsData, effectiveQty, wastePercent, selectedBobbinSize]);

    // DÃ©tail par (couleur + type de fil) : agrÃ¨ge la consommation en respectant la
    // matrice couleur Ã— opÃ©ration. Une couleur dÃ©sactivÃ©e dans une opÃ©ration n'y
    // consomme rien ; si une couleur utilise plusieurs types de fil selon les
    // opÃ©rations, elle produit plusieurs lignes (une par type).
    const colorBreakdown = useMemo(() => {
        if (effectiveColors.length === 0) return [];

        const buckets: Record<string, {
            colorId: string;
            colorName: string;
            threadType: string;
            quantity: number;
            totalMeters: number;
        }> = {};

        const addMeters = (colorId: string, colorName: string, threadType: string, quantity: number, meters: number) => {
            if (meters <= 0) return;
            const bucketKey = `${colorId}__${threadType}`;
            if (!buckets[bucketKey]) {
                buckets[bucketKey] = { colorId, colorName, threadType, quantity, totalMeters: 0 };
            }
            buckets[bucketKey].totalMeters += meters;
        };

        const selectedOps = opsData.filter(op => op.selected && op.threadMetersPerUnit > 0);

        // Fils Â« couleur modÃ¨le Â» : suivent chaque couleur de la commande.
        effectiveColors.forEach(color => {
            const qty = colorQtyMap[color.id] || 0;
            if (qty <= 0) return;
            selectedOps.forEach(op => {
                const ct = op.colorThreads[color.id];
                // Couleur explicitement dÃ©sactivÃ©e pour cette opÃ©ration â†’ ne consomme rien
                if (ct && ct.active === false) return;
                const threadType = (ct?.threadType || op.threadType || '').trim();
                if (op.multiThread && op.threadSlots.length > 0) {
                    // Mode multi-fils : seule la part des fils Â« couleur modÃ¨le Â» suit la couleur.
                    const perThread = op.threadMetersPerUnit / op.threadSlots.length;
                    const modelSlots = op.threadSlots.filter(s => !s).length;
                    addMeters(color.id, color.name, threadType, qty, perThread * modelSlots * qty);
                } else {
                    addMeters(color.id, color.name, threadType, qty, op.threadMetersPerUnit * qty);
                }
            });
        });

        // Fils Â« standard Â» (mode multi-fils) : mÃªme type pour toutes les couleurs de la
        // commande â†’ comptÃ©s une seule fois sur la quantitÃ© des couleurs actives.
        selectedOps.forEach(op => {
            if (!op.multiThread || op.threadSlots.length === 0) return;
            const perThread = op.threadMetersPerUnit / op.threadSlots.length;
            const slotCounts: Record<string, number> = {};
            op.threadSlots.forEach(s => { if (s) slotCounts[s] = (slotCounts[s] || 0) + 1; });
            if (Object.keys(slotCounts).length === 0) return;
            const activeQty = effectiveColors.reduce((sum, c) => {
                const ct = op.colorThreads[c.id];
                if (ct && ct.active === false) return sum;
                return sum + (colorQtyMap[c.id] || 0);
            }, 0);
            if (activeQty <= 0) return;
            Object.entries(slotCounts).forEach(([type, count]) => {
                addMeters(`__std__${type}`, type, type, effectiveQty, perThread * count * activeQty);
            });
        });

        return Object.values(buckets).map(b => {
            const threadMeters = Math.round(b.totalMeters * 100) / 100;
            const bobbins = Math.ceil((b.totalMeters * (1 + wastePercent / 100)) / selectedBobbinSize);
            return {
                colorName: b.colorName,
                colorId: b.colorId,
                threadType: b.threadType,
                quantity: b.quantity,
                threadMeters,
                bobbins,
            };
        }).filter(c => c.threadMeters > 0);
    }, [effectiveColors, colorQtyMap, opsData, wastePercent, selectedBobbinSize, effectiveQty]);

    // Grand totals : fil/unitÃ© = somme des opÃ©rations sÃ©lectionnÃ©es ; les totaux
    // mÃ¨tres & bobines proviennent du dÃ©tail couleur quand il existe (il respecte
    // les couleurs dÃ©sactivÃ©es), sinon du rÃ©capitulatif machine.
    const grandTotal = useMemo(() => {
        const totalMetersPerUnit = machineSummary.reduce((sum, m) => sum + m.threadMetersPerUnit, 0);
        if (colorBreakdown.length > 0) {
            const totalMeters = colorBreakdown.reduce((s, c) => s + c.threadMeters, 0);
            const totalBobbins = colorBreakdown.reduce((s, c) => s + c.bobbins, 0);
            return { totalMeters, totalBobbins, totalMetersPerUnit };
        }
        const totalMeters = machineSummary.reduce((sum, m) => sum + m.totalMeters, 0);
        const totalBobbins = machineSummary.reduce((sum, m) => sum + m.totalBobbins, 0);
        return { totalMeters, totalBobbins, totalMetersPerUnit };
    }, [machineSummary, colorBreakdown]);

    const handleApply = () => {
        // Mode "indice" : estimation par type de modele. Repartit par couleur de la
        // commande quand elles existent (comme le mode poste), sinon une seule ligne.
        if (calcMode === 'indice') {
            if (!indiceGarment) return;
            // L'indice est dÃ©jÃ  exprimÃ© en mÃ¨tres PAR PIÃˆCE â†’ on l'applique tel quel
            // (la quantitÃ© de la commande et la perte sont gÃ©rÃ©es dans la fiche de coÃ»t).
            const perPiece = Math.round(indiceValue * 100) / 100;
            if (perPiece <= 0) return;
            const perPieceQty = selectedBobbinSize > 0
                ? Math.round((perPiece / selectedBobbinSize) * 100000) / 100000
                : 0;
            if (indiceColorBreakdown.length > 0) {
                let cid = Date.now();
                onApply(indiceColorBreakdown.map(color => ({
                    id: cid++,
                    name: `Fil ${color.colorName} - ${indiceGarment.name} (estimation)`,
                    unitPrice: 0,
                    qty: perPieceQty,
                    unit: 'bobine',
                    threadMeters: perPiece,
                    threadCapacity: selectedBobbinSize,
                    fournisseur: '',
                    threadColor: color.colorName,
                    threadReference: `Indice ${indiceValue} m/pc`,
                })));
                return;
            }
            onApply([{
                id: Date.now(),
                name: `Fil ${indiceGarment.name} (estimation indice)`,
                unitPrice: 0,
                qty: perPieceQty,
                unit: 'bobine',
                threadMeters: perPiece,
                threadCapacity: selectedBobbinSize,
                fournisseur: '',
                threadColor: '',
                threadReference: `Indice ${indiceValue} m/pc`,
            }]);
            return;
        }

        const materials: Material[] = [];
        let id = Date.now();

        if (colorBreakdown.length > 0) {
            colorBreakdown.forEach(color => {
                // Ligne Â« standard Â» (multi-fils) : type identique pour toutes les couleurs.
                const isStandard = color.colorId.startsWith('__std__');
                // Nom = Â« Fil {couleur} â€“ {type} Â» quand un type de fil est prÃ©cisÃ©.
                const typeSuffix = color.threadType ? ` â€“ ${color.threadType}` : '';
                // color.threadMeters = consommation de la commande ENTIÃˆRE pour cette
                // couleur â†’ ramenÃ©e Ã  UNE piÃ¨ce (mÃ¨tres bruts, sans perte ni arrondi).
                const perPiece = color.quantity > 0
                    ? Math.round((color.threadMeters / color.quantity) * 100) / 100
                    : color.threadMeters;
                const perPieceQty = selectedBobbinSize > 0
                    ? Math.round((perPiece / selectedBobbinSize) * 100000) / 100000
                    : 0;
                const price = threadPrices[color.threadType || ''] || 0;
                materials.push({
                    id: id++,
                    name: isStandard ? `Fil ${color.threadType} (standard)` : `Fil ${color.colorName}${typeSuffix}`,
                    unitPrice: price,
                    qty: perPieceQty,
                    unit: 'bobine',
                    threadMeters: perPiece,
                    threadCapacity: selectedBobbinSize,
                    fournisseur: '',
                    threadColor: isStandard ? '' : color.colorName,
                    threadReference: color.threadType || '',
                });
            });
        } else {
            machineSummary.forEach(machine => {
                // RÃ©cupÃ¨re les types de fil saisis pour les opÃ©rations de cette machine
                const threadTypes = Array.from(new Set(
                    opsData
                        .filter(op => op.selected && op.machineCode === machine.machineCode && op.threadType.trim())
                        .map(op => op.threadType.trim())
                ));
                // threadMetersPerUnit = consommation PAR PIÃˆCE (dÃ©jÃ  unitaire, sans perte).
                const perPiece = Math.round(machine.threadMetersPerUnit * 100) / 100;
                const perPieceQty = selectedBobbinSize > 0
                    ? Math.round((perPiece / selectedBobbinSize) * 100000) / 100000
                    : 0;
                const firstType = threadTypes[0] || '';
                const price = threadPrices[firstType] || 0;
                materials.push({
                    id: id++,
                    name: `Fil ${machine.machineLabel} (${machine.machineCode})`,
                    unitPrice: price,
                    qty: perPieceQty,
                    unit: 'bobine',
                    threadMeters: perPiece,
                    threadCapacity: selectedBobbinSize,
                    fournisseur: '',
                    threadColor: '',
                    threadReference: threadTypes.join(', '),
                });
            });
        }

        onApply(materials);
    };

    // Modal mode: popup with dark overlay
    if (!isExpanded) {
        return (
            <>
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 backdrop-blur-[3px] animate-[fadeIn_140ms_ease-out] md:items-center md:p-4 md:bg-slate-950/40">
                    <div className="bg-white dark:bg-dk-surface w-full max-h-[92vh] md:h-auto md:max-w-6xl md:max-h-[90vh] rounded-t-2xl md:rounded-2xl shadow-[0_-12px_40px_rgba(15,23,42,0.18)] md:shadow-2xl ring-1 ring-slate-200/60 md:ring-0 overflow-hidden flex flex-col">
                        {/* PoignÃ©e de glissement (mobile) */}
                        <div className="md:hidden pt-2 pb-1 flex items-center justify-center shrink-0">
                            <span className="w-10 h-1 rounded-full bg-slate-300" />
                        </div>

                        <div className="md:hidden px-5 pt-1 pb-3 flex items-start justify-between gap-3 shrink-0">
                            <div className="min-w-0">
                                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-dk-text tracking-tight">{_({ fr: 'Calcul Fil', ar: 'Ø­Ø³Ø§Ø¨ Ø§Ù„Ø®ÙŠØ·', en: 'Thread Calculation', es: 'CÃ¡lculo de Hilo', pt: 'CÃ¡lculo de Fio', tr: 'Ä°plik Hesaplama' })}</h2>
                                <p className="text-[12px] text-slate-500 dark:text-dk-muted mt-0.5 truncate">{_({ fr: 'Consommation de fil automatique', ar: 'Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ Ø§Ù„Ø®ÙŠØ· Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ', en: 'Automatic thread consumption', es: 'Consumo de hilo automÃ¡tico', pt: 'Consumo de fio automÃ¡tico', tr: 'Otomatik iplik tÃ¼ketimi' })}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => window.print()} className="p-1.5 rounded-md text-slate-400 dark:text-dk-muted hover:text-slate-700 hover:bg-slate-100 transition-colors" title={_({ fr: 'Imprimer le rapport de fil', ar: 'Ø·Ø¨Ø§Ø¹Ø© ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ø®ÙŠØ·', en: 'Print thread report', es: 'Imprimir informe de hilo', pt: 'Imprimir relatÃ³rio de fio', tr: 'Ä°plik raporunu yazdÄ±r' })} aria-label={_({ fr: 'Imprimer', ar: 'Ø·Ø¨Ø§Ø¹Ø©', en: 'Print', es: 'Imprimir', pt: 'Imprimir', tr: 'YazdÄ±r' })}>
                                    <Printer className="w-4 h-4" />
                                </button>
                                <button onClick={() => setIsExpanded(true)} className="p-1.5 rounded-md text-slate-400 dark:text-dk-muted hover:text-slate-700 hover:bg-slate-100 transition-colors" title={_({ fr: 'Agrandir (page complÃ¨te)', ar: 'ØªÙƒØ¨ÙŠØ± (ØµÙØ­Ø© ÙƒØ§Ù…Ù„Ø©)', en: 'Expand (full page)', es: 'Ampliar (pÃ¡gina completa)', pt: 'Ampliar (pÃ¡gina completa)', tr: 'BÃ¼yÃ¼t (tam sayfa)' })} aria-label={_({ fr: 'Agrandir', ar: 'ØªÙƒØ¨ÙŠØ±', en: 'Expand', es: 'Ampliar', pt: 'Ampliar', tr: 'BÃ¼yÃ¼t' })}>
                                    <Maximize2 className="w-4 h-4" />
                                </button>
                                <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 dark:text-dk-muted hover:text-slate-700 hover:bg-slate-100 transition-colors" aria-label={_({ fr: 'Fermer', ar: 'Ø¥ØºÙ„Ø§Ù‚', en: 'Close', es: 'Cerrar', pt: 'Fechar', tr: 'Kapat' })}>
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="hidden md:flex bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-white dark:bg-dk-surface/20 p-2 rounded-xl">
                                    <Scissors className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black">{_({ fr: 'Calcul Fil', ar: 'Ø­Ø³Ø§Ø¨ Ø§Ù„Ø®ÙŠØ·', en: 'Thread Calculation', es: 'CÃ¡lculo de Hilo', pt: 'CÃ¡lculo de Fio', tr: 'Ä°plik Hesaplama' })}</h2>
                                    <p className="text-sm text-blue-100">{_({ fr: 'Calcul automatique de la consommation de fil', ar: 'Ø­Ø³Ø§Ø¨ ØªÙ„Ù‚Ø§Ø¦ÙŠ Ù„Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ Ø§Ù„Ø®ÙŠØ·', en: 'Automatic thread consumption calculation', es: 'CÃ¡lculo automÃ¡tico del consumo de hilo', pt: 'CÃ¡lculo automÃ¡tico do consumo de fio', tr: 'Otomatik iplik tÃ¼ketimi hesaplamasÄ±' })}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => window.print()} className="p-2 hover:bg-white rounded-lg transition-colors" title={_({ fr: 'Imprimer le rapport de fil', ar: 'Ø·Ø¨Ø§Ø¹Ø© ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ø®ÙŠØ·', en: 'Print thread report', es: 'Imprimir informe de hilo', pt: 'Imprimir relatÃ³rio de fio', tr: 'Ä°plik raporunu yazdÄ±r' })}>
                                    <Printer className="w-5 h-5" />
                                </button>
                                <button onClick={() => setIsExpanded(true)} className="p-2 hover:bg-white rounded-lg transition-colors" title={_({ fr: 'Agrandir (page complÃ¨te)', ar: 'ØªÙƒØ¨ÙŠØ± (ØµÙØ­Ø© ÙƒØ§Ù…Ù„Ø©)', en: 'Expand (full page)', es: 'Ampliar (pÃ¡gina completa)', pt: 'Ampliar (pÃ¡gina completa)', tr: 'BÃ¼yÃ¼t (tam sayfa)' })}>
                                    <Maximize2 className="w-5 h-5" />
                                </button>
                                <button onClick={onClose} className="p-2 hover:bg-white rounded-lg transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                <div className="bg-slate-50 dark:bg-dk-bg/60 md:bg-slate-50 border-b border-slate-100 dark:border-dk-border px-5 py-3 md:p-4 flex flex-wrap items-center gap-3 md:gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-dk-muted">{_({ fr: 'QUANTITÃ‰:', ar: 'Ø§Ù„ÙƒÙ…ÙŠØ©:', en: 'QUANTITY:', es: 'CANTIDAD:', pt: 'QUANTIDADE:', tr: 'MÄ°KTAR:' })}</label>
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg font-black text-sm">
                            {formatNumberFr(effectiveQty)} {_({ fr: 'pcs', ar: 'Ù‚Ø·Ø¹Ø©', en: 'pcs', es: 'pzas', pt: 'pÃ§', tr: 'adet' })}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-dk-muted">{_({ fr: 'HUMIDITÃ‰/USURE:', ar: 'Ø§Ù„Ø±Ø·ÙˆØ¨Ø©/Ø§Ù„ØªØ¢ÙƒÙ„:', en: 'HUMIDITY/WASTE:', es: 'HUMEDAD/DESPERDICIO:', pt: 'UMIDADE/DESPERDÃCIO:', tr: 'NEM/ATIK:' })}</label>
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min="0"
                                max="30"
                                value={wastePercent}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    if (!isNaN(val) && val >= 0 && val <= 30) {
                                        setWastePercent(val);
                                    }
                                }}
                                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded-lg text-center font-bold"
                                aria-label={_({ fr: 'Pourcentage d\'humiditÃ© ou d\'usure', ar: 'Ù†Ø³Ø¨Ø© Ø§Ù„Ø±Ø·ÙˆØ¨Ø© Ø£Ùˆ Ø§Ù„ØªØ¢ÙƒÙ„', en: 'Humidity or waste percentage', es: 'Porcentaje de humedad o desperdicio', pt: 'Percentual de umidade ou desperdÃ­cio', tr: 'Nem veya atÄ±k yÃ¼zdesi' })}
                            />
                            <span className="text-sm text-slate-500 dark:text-dk-muted">%</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-dk-muted">{_({ fr: 'TAILLE BOBINE:', ar: 'Ø­Ø¬Ù… Ø§Ù„Ø¨ÙƒØ±Ø©:', en: 'BOBBIN SIZE:', es: 'TAMAÃ‘O BOBINA:', pt: 'TAMANHO BOBINA:', tr: 'BOBÄ°N BOYUTU:' })}</label>
                        <select
                            value={selectedBobbinSize}
                            onChange={(e) => setSelectedBobbinSize(Number(e.target.value))}
                            className="px-3 py-1 text-sm border border-slate-300 rounded-lg font-bold bg-white dark:bg-dk-surface"
                            aria-label={_({ fr: 'Taille de la bobine', ar: 'Ø­Ø¬Ù… Ø§Ù„Ø¨ÙƒØ±Ø©', en: 'Bobbin size', es: 'TamaÃ±o de bobina', pt: 'Tamanho da bobina', tr: 'Bobin boyutu' })}
                        >
                            {BOBBIN_SIZES.map(size => (
                                <option key={size.capacityMeters} value={size.capacityMeters}>
                                    {size.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-dk-muted">{_({ fr: 'TYPE FIL:', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ·:', en: 'THREAD TYPE:', es: 'TIPO HILO:', pt: 'TIPO FIO:', tr: 'Ä°PLÄ°K TÃœRÃœ:' })}</label>
                        <ThreadTypesManager
                            availableThreadTypes={availableThreadTypes}
                            threadPrices={threadPrices}
                            onAdd={addThreadTypeValue}
                            onRename={renameThreadTypeValue}
                            onDelete={deleteThreadTypeValue}
                            onUpdatePrice={updateThreadPrice}
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Selecteur de mode de calcul */}
                    <CalcModeToggle calcMode={calcMode} onChange={setCalcMode} />

                    {calcMode === 'indice' && (
                        <IndiceEstimatePanel
                            autoMatchName={autoGarment?.name}
                            garmentKey={garmentKey}
                            garment={indiceGarment}
                            indiceValue={indiceValue}
                            surfilage={indiceSurfilage}
                            assemblage={indiceAssemblage}
                            qty={effectiveQty}
                            wastePercent={wastePercent}
                            bobbinSize={selectedBobbinSize}
                            totalWithWaste={indiceTotalWithWaste}
                            bobbins={indiceBobbins}
                            colorBreakdown={indiceColorBreakdown}
                            onSelectKey={(k) => { setGarmentKey(k); setIndiceOverride(null); }}
                            onIndiceChange={setIndiceOverride}
                            onResetIndice={() => setIndiceOverride(null)}
                        />
                    )}

                    {calcMode === 'poste' && (<>
                    <div className="border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden">
                        <div className="w-full bg-slate-50 dark:bg-dk-bg p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Calculator className="w-4 h-4 text-blue-500" />
                                <span className="font-black text-sm text-slate-700 dark:text-dk-text-soft">
                                    {_({ fr: 'OPÃ‰RATIONS', ar: 'Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª', en: 'OPERATIONS', es: 'OPERACIONES', pt: 'OPERAÃ‡Ã•ES', tr: 'Ä°ÅžLEMLER' })} ({opsData.filter(op => op.selected).length}/{opsData.length})
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={selectAll}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-bold underline"
                                    aria-label={_({ fr: 'SÃ©lectionner toutes les opÃ©rations', ar: 'ØªØ­Ø¯ÙŠØ¯ ÙƒÙ„ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª', en: 'Select all operations', es: 'Seleccionar todas las operaciones', pt: 'Selecionar todas as operaÃ§Ãµes', tr: 'TÃ¼m iÅŸlemleri seÃ§' })}
                                >
                                    {_({ fr: 'Tout', ar: 'Ø§Ù„ÙƒÙ„', en: 'All', es: 'Todo', pt: 'Tudo', tr: 'TÃ¼mÃ¼' })}
                                </button>
                                <span className="text-slate-300 dark:text-dk-muted">|</span>
                                <button
                                    onClick={deselectAll}
                                    className="text-xs text-red-500 hover:text-red-700 font-bold underline"
                                    aria-label={_({ fr: 'DÃ©sÃ©lectionner toutes les opÃ©rations', ar: 'Ø¥Ù„ØºØ§Ø¡ ØªØ­Ø¯ÙŠØ¯ ÙƒÙ„ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª', en: 'Deselect all operations', es: 'Deseleccionar todas las operaciones', pt: 'Desmarcar todas as operaÃ§Ãµes', tr: 'TÃ¼m iÅŸlemlerin seÃ§imini kaldÄ±r' })}
                                >
                                    {_({ fr: 'Aucun', ar: 'Ù„Ø§ Ø´ÙŠØ¡', en: 'None', es: 'Ninguno', pt: 'Nenhum', tr: 'HiÃ§biri' })}
                                </button>
                            </div>
                        </div>

                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft text-xs uppercase">
                                    <tr>
                                        <th className="p-3 text-left w-10"></th>
                                        <th className="p-3 text-left">NÂ°</th>
                                        <th className="p-3 text-left min-w-[180px]">{_({ fr: 'Description de l\'opÃ©ration', ar: 'ÙˆØµÙ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Operation description', es: 'DescripciÃ³n de la operaciÃ³n', pt: 'DescriÃ§Ã£o da operaÃ§Ã£o', tr: 'Ä°ÅŸlem aÃ§Ä±klamasÄ±' })}</th>
                                        <th className="p-3 text-left">{_({ fr: 'Machine', ar: 'Ø¢Ù„Ø©', en: 'Machine', es: 'MÃ¡quina', pt: 'MÃ¡quina', tr: 'Makine' })}</th>
                                        <th className="p-3 text-left">{_({ fr: 'Type Point', ar: 'Ù†ÙˆØ¹ Ø§Ù„ØºØ±Ø²Ø©', en: 'Stitch Type', es: 'Tipo de Puntada', pt: 'Tipo de Ponto', tr: 'DikiÅŸ TÃ¼rÃ¼' })}</th>
                                        <th className="p-3 text-center text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" title={_({ fr: 'cm pour couture, piÃ¨ces pour boutonniÃ¨re/bouton/bride', ar: 'Ø³Ù… Ù„Ù„Ø®ÙŠØ§Ø·Ø©ØŒ Ù‚Ø·Ø¹ Ù„Ù„Ø¹Ø±ÙˆØ©/Ø§Ù„Ø²Ø±/Ø§Ù„Ø±Ø¨Ø§Ø·', en: 'cm for sewing, pieces for buttonhole/button/tie', es: 'cm para costura, piezas para ojal/botÃ³n/atadura', pt: 'cm para costura, peÃ§as para casa/botÃ£o/amarra', tr: 'dikiÅŸ iÃ§in cm, ilik/dÃ¼ÄŸme/baÄŸ iÃ§in adet' })}>{_({ fr: 'L / QtÃ© (cm/pc)', ar: 'Ø§Ù„Ø·ÙˆÙ„ / Ø§Ù„ÙƒÙ…ÙŠØ© (Ø³Ù…/Ù‚Ø·Ø¹Ø©)', en: 'L / Qty (cm/pc)', es: 'L / Cant (cm/pz)', pt: 'Comp / Qtde (cm/pÃ§)', tr: 'Uzunluk / Miktar (cm/adet)' })}</th>
                                        <th className="p-3 text-right" title={_({ fr: 'MÃ¨tres de fil par mÃ¨tre de couture (ou par piÃ¨ce pour boutonniÃ¨res)', ar: 'Ø£Ù…ØªØ§Ø± Ø§Ù„Ø®ÙŠØ· Ù„ÙƒÙ„ Ù…ØªØ± Ø®ÙŠØ§Ø·Ø© (Ø£Ùˆ Ù„ÙƒÙ„ Ù‚Ø·Ø¹Ø© Ù„Ù„Ø¹Ø±ÙˆØ§Øª)', en: 'Thread meters per meter of seam (or per piece for buttonholes)', es: 'Metros de hilo por metro de costura (o por pieza para ojales)', pt: 'Metros de fio por metro de costura (ou por peÃ§a para casas)', tr: 'Metre dikiÅŸ baÅŸÄ±na iplik metresi (ilikler iÃ§in adet baÅŸÄ±na)' })}>{_({ fr: 'Conso/M', ar: 'Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ/Ù…', en: 'Cons./M', es: 'Cons./M', pt: 'Cons./M', tr: 'TÃ¼k./M' })}</th>
                                        <th className="p-3 text-right">{_({ fr: 'Fil/UnitÃ©', ar: 'Ø®ÙŠØ·/ÙˆØ­Ø¯Ø©', en: 'Thread/Unit', es: 'Hilo/Unidad', pt: 'Fio/Unidade', tr: 'Ä°plik/Birim' })}</th>
                                        <th className="p-3 text-right text-emerald-600 dark:text-emerald-400" title={`${_({ fr: 'Bobines par unitÃ©', ar: 'Ø¨ÙƒØ±Ø§Øª Ù„ÙƒÙ„ ÙˆØ­Ø¯Ø©', en: 'Bobbins per unit', es: 'Bobinas por unidad', pt: 'Bobinas por unidade', tr: 'Birim baÅŸÄ±na bobin' })} (${_({ fr: 'Fil/UnitÃ©', ar: 'Ø®ÙŠØ·/ÙˆØ­Ø¯Ø©', en: 'Thread/Unit', es: 'Hilo/Unidad', pt: 'Fio/Unidade', tr: 'Ä°plik/Birim' })} Ã· ${selectedBobbinSize} m)`}>{_({ fr: 'Bobine', ar: 'Ø¨ÙƒØ±Ø©', en: 'Bobbin', es: 'Bobina', pt: 'Bobina', tr: 'Bobin' })}</th>
                                        <th className="p-3 text-left text-amber-600 dark:text-amber-400" title={_({ fr: 'Type de fil utilisÃ© (ex: Polyester Tex 27, Coton NM 50)', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ· Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… (Ù…Ø«Ø§Ù„: Ø¨ÙˆÙ„ÙŠØ³ØªØ± Tex 27ØŒ Ù‚Ø·Ù† NM 50)', en: 'Thread type used (ex: Polyester Tex 27, Cotton NM 50)', es: 'Tipo de hilo usado (ej: Polyester Tex 27, AlgodÃ³n NM 50)', pt: 'Tipo de fio usado (ex: PoliÃ©ster Tex 27, AlgodÃ£o NM 50)', tr: 'KullanÄ±lan iplik tÃ¼rÃ¼ (Ã¶r: Polyester Tex 27, Pamuk NM 50)' })}>{_({ fr: 'Type Fil', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ·', en: 'Thread Type', es: 'Tipo Hilo', pt: 'Tipo Fio', tr: 'Ä°plik TÃ¼rÃ¼' })}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {opsData.map((op, index) => (
                                        <tr
                                            key={op.operation.id}
                                            className={`${op.selected ? 'bg-blue-50 dark:bg-blue-900/30/50' : 'bg-white dark:bg-dk-surface'} hover:bg-blue-50 transition-colors`}
                                        >
                                            <td className="p-3">
                                                <button
                                                    onClick={() => toggleOperation(index)}
                                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                        op.selected
                                                            ? 'bg-blue-500 border-blue-500 text-white'
                                                            : 'border-slate-300 hover:border-blue-400'
                                                    }`}
                                                    aria-label={op.selected ? `${_({ fr: 'DÃ©sÃ©lectionner opÃ©ration', ar: 'Ø¥Ù„ØºØ§Ø¡ ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Deselect operation', es: 'Deseleccionar operaciÃ³n', pt: 'Desmarcar operaÃ§Ã£o', tr: 'Ä°ÅŸlemin seÃ§imini kaldÄ±r' })} ${op.operation.order}` : `${_({ fr: 'SÃ©lectionner opÃ©ration', ar: 'ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Select operation', es: 'Seleccionar operaciÃ³n', pt: 'Selecionar operaÃ§Ã£o', tr: 'Ä°ÅŸlemi seÃ§' })} ${op.operation.order}`}
                                                    aria-pressed={op.selected}
                                                >
                                                    {op.selected && <Check className="w-3 h-3" />}
                                                </button>
                                            </td>
                                            <td className="p-3 font-bold text-slate-600 dark:text-dk-text-soft">{op.operation.order}</td>
                                            <td className="p-3 text-slate-700 dark:text-dk-text-soft">
                                                {op.operation.description || <span className="text-slate-300 dark:text-dk-muted">â€”</span>}
                                            </td>
                                            <td className="p-3">
                                                <span className="inline-block bg-slate-100/70 border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1 text-xs font-bold text-slate-700 dark:text-dk-text-soft">
                                                    {op.machineRaw || <span className="text-slate-300 dark:text-dk-muted">â€”</span>}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                {op.stitchType ? (
                                                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">
                                                        {op.stitchType.name}
                                                    </span>
                                                ) : (
                                                    <span className="bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted px-2 py-0.5 rounded-full text-xs">
                                                        {_({ fr: 'Non dÃ©fini', ar: 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯', en: 'Undefined', es: 'No definido', pt: 'NÃ£o definido', tr: 'TanÄ±msÄ±z' })}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        value={op.lengthCm === 0 ? '' : op.lengthCm}
                                                        onChange={(e) => updateLength(index, Number(e.target.value))}
                                                        onFocus={(e) => e.target.select()}
                                                        onKeyDown={(e) => ['-', 'e', 'E', '+', '.', ','].includes(e.key) && e.preventDefault()}
                                                        placeholder="-"
                                                        className="w-16 px-1 py-1 text-center text-xs font-mono font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/30 text-indigo-700 dark:text-dk-accent-text border border-indigo-100 rounded-lg outline-none focus:border-indigo-500 transition-colors"
                                                        title={op.isPerPiece ? _({ fr: 'Nombre de piÃ¨ces (boutonniÃ¨re / bouton / bride)', ar: 'Ø¹Ø¯Ø¯ Ø§Ù„Ù‚Ø·Ø¹ (Ø¹Ø±ÙˆØ© / Ø²Ø± / Ø±Ø¨Ø§Ø·)', en: 'Number of pieces (buttonhole / button / tie)', es: 'NÃºmero de piezas (ojal / botÃ³n / atadura)', pt: 'NÃºmero de peÃ§as (casa / botÃ£o / amarra)', tr: 'ParÃ§a sayÄ±sÄ± (ilik / dÃ¼ÄŸme / baÄŸ)' }) : _({ fr: 'Longueur de couture en cm', ar: 'Ø·ÙˆÙ„ Ø§Ù„Ø®ÙŠØ§Ø·Ø© Ø¨Ø§Ù„Ø³Ù†ØªÙŠÙ…ØªØ±', en: 'Seam length in cm', es: 'Longitud de costura en cm', pt: 'Comprimento da costura em cm', tr: 'DikiÅŸ uzunluÄŸu (cm)' })}
                                                        aria-label={op.isPerPiece ? `${_({ fr: 'Nombre de piÃ¨ces pour opÃ©ration', ar: 'Ø¹Ø¯Ø¯ Ø§Ù„Ù‚Ø·Ø¹ Ù„Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Number of pieces for operation', es: 'NÃºmero de piezas para operaciÃ³n', pt: 'NÃºmero de peÃ§as para operaÃ§Ã£o', tr: 'Ä°ÅŸlem iÃ§in parÃ§a sayÄ±sÄ±' })} ${op.operation.order}` : `${_({ fr: 'Longueur de couture en cm pour opÃ©ration', ar: 'Ø·ÙˆÙ„ Ø§Ù„Ø®ÙŠØ§Ø·Ø© Ø¨Ø§Ù„Ø³Ù†ØªÙŠÙ…ØªØ± Ù„Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Seam length in cm for operation', es: 'Longitud de costura en cm para operaciÃ³n', pt: 'Comprimento da costura em cm para operaÃ§Ã£o', tr: 'Ä°ÅŸlem iÃ§in dikiÅŸ uzunluÄŸu (cm)' })} ${op.operation.order}`}
                                                    />
                                                    <span className="text-[10px] text-slate-400 dark:text-dk-muted">{op.isPerPiece ? _({ fr: 'pc', ar: 'Ù‚Ø·Ø¹Ø©', en: 'pc', es: 'pz', pt: 'pÃ§', tr: 'ad' }) : 'cm'}</span>
                                                </div>
                                            </td>
                                            <td className="p-3 text-right font-mono text-slate-600 dark:text-dk-text-soft">
                                                {op.consumptionFactor > 0
                                                    ? `${op.consumptionFactor % 1 === 0 ? op.consumptionFactor.toFixed(0) : op.consumptionFactor.toFixed(2)}${op.isPerPiece ? '/pc' : ''}`
                                                    : '-'}
                                            </td>
                                            <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400">
                                                {op.threadMetersPerUnit > 0 ? `${op.threadMetersPerUnit.toFixed(2)} m` : '-'}
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={op.threadMetersPerUnit > 0 ? (op.threadMetersPerUnit / selectedBobbinSize).toFixed(2) : ''}
                                                        onChange={(e) => updateBobines(index, Number(e.target.value))}
                                                        onFocus={(e) => e.target.select()}
                                                        onKeyDown={(e) => ['-', 'e', 'E', '+', '.'].includes(e.key) && e.preventDefault()}
                                                        placeholder="0.00"
                                                        className="w-16 px-1 py-1 text-center text-xs font-mono font-bold bg-emerald-50 dark:bg-emerald-900/30/30 text-emerald-700 border border-emerald-100 rounded-lg outline-none focus:border-emerald-500 transition-colors placeholder:text-emerald-300 placeholder:font-normal"
                                                        title={`${op.threadMetersPerUnit.toFixed(2)} m Ã· ${selectedBobbinSize} ${_({ fr: 'm/bobine', ar: 'Ù…/Ø¨ÙƒØ±Ø©', en: 'm/bobbin', es: 'm/bobina', pt: 'm/bobina', tr: 'm/bobin' })}`}
                                                        aria-label={`${_({ fr: 'Bobines par unitÃ© pour opÃ©ration', ar: 'Ø¨ÙƒØ±Ø§Øª Ù„ÙƒÙ„ ÙˆØ­Ø¯Ø© Ù„Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Bobbins per unit for operation', es: 'Bobinas por unidad para operaciÃ³n', pt: 'Bobinas por unidade para operaÃ§Ã£o', tr: 'Ä°ÅŸlem iÃ§in birim baÅŸÄ±na bobin' })} ${op.operation.order}`}
                                                    />
                                                    <span className="text-[10px] text-slate-400 dark:text-dk-muted">{_({ fr: 'bob', ar: 'Ø¨ÙƒØ±Ø©', en: 'bob', es: 'bob', pt: 'bob', tr: 'bob' })}</span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <ColorThreadCell
                                                    op={op}
                                                    index={index}
                                                    effectiveColors={effectiveColors}
                                                    availableThreadTypes={availableThreadTypes}
                                                    onToggleColorActive={toggleColorActive}
                                                    onSetColorThreadType={setColorThreadType}
                                                    onApplyToAll={applyColorThreadToAllOps}
                                                    onUpdateThreadType={updateThreadType}
                                                    onToggleMultiThread={toggleMultiThread}
                                                    onSetThreadSlot={setThreadSlot}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="block md:hidden divide-y divide-slate-100 dark:divide-dk-border bg-white dark:bg-dk-surface">
                            {opsData.map((op, index) => (
                                <div key={op.operation.id} className={`p-4 transition-colors ${op.selected ? 'bg-blue-50 dark:bg-blue-900/30/20' : 'bg-white dark:bg-dk-surface'}`}>
                                    <div className="flex items-start gap-3">
                                        <button
                                            onClick={() => toggleOperation(index)}
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                                op.selected
                                                    ? 'bg-blue-500 border-blue-500 text-white'
                                                    : 'border-slate-300'
                                            }`}
                                            aria-label={op.selected ? `${_({ fr: 'DÃ©sÃ©lectionner opÃ©ration', ar: 'Ø¥Ù„ØºØ§Ø¡ ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Deselect operation', es: 'Deseleccionar operaciÃ³n', pt: 'Desmarcar operaÃ§Ã£o', tr: 'Ä°ÅŸlemin seÃ§imini kaldÄ±r' })} ${op.operation.order}` : `${_({ fr: 'SÃ©lectionner opÃ©ration', ar: 'ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Select operation', es: 'Seleccionar operaciÃ³n', pt: 'Selecionar operaÃ§Ã£o', tr: 'Ä°ÅŸlemi seÃ§' })} ${op.operation.order}`}
                                            aria-pressed={op.selected}
                                        >
                                            {op.selected && <Check className="w-3.5 h-3.5" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                                <span className="font-bold text-xs text-slate-500 dark:text-dk-muted">NÂ° {op.operation.order}</span>
                                                <span className="inline-block bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:text-dk-text-soft">
                                                    {op.machineRaw || 'â€”'}
                                                </span>
                                                {op.stitchType ? (
                                                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                                                        {op.stitchType.name}
                                                    </span>
                                                ) : (
                                                    <span className="bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted px-1.5 py-0.5 rounded-full text-[10px]">
                                                        {_({ fr: 'Non dÃ©fini', ar: 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯', en: 'Undefined', es: 'No definido', pt: 'NÃ£o definido', tr: 'TanÄ±msÄ±z' })}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="font-semibold text-slate-800 dark:text-dk-text text-sm">{op.operation.description || <span className="text-slate-300 dark:text-dk-muted">â€”</span>}</p>
                                        </div>
                                    </div>

                                    <div className="mt-3 pl-8 grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-1">{_({ fr: 'L / QtÃ©', ar: 'Ø§Ù„Ø·ÙˆÙ„ / Ø§Ù„ÙƒÙ…ÙŠØ©', en: 'L / Qty', es: 'L / Cant', pt: 'Comp / Qtde', tr: 'Uzun / Miktar' })}</label>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={op.lengthCm === 0 ? '' : op.lengthCm}
                                                    onChange={(e) => updateLength(index, Number(e.target.value))}
                                                    onFocus={(e) => e.target.select()}
                                                    onKeyDown={(e) => ['-', 'e', 'E', '+', '.', ','].includes(e.key) && e.preventDefault()}
                                                    placeholder="-"
                                                    className="w-full px-2 py-1 text-center text-xs font-mono font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/30 text-indigo-700 dark:text-dk-accent-text border border-indigo-100 rounded-lg outline-none focus:border-indigo-500"
                                                />
                                                <span className="text-[10px] text-slate-400 dark:text-dk-muted font-bold">{op.isPerPiece ? _({ fr: 'pc', ar: 'Ù‚Ø·Ø¹Ø©', en: 'pc', es: 'pz', pt: 'pÃ§', tr: 'ad' }) : 'cm'}</span>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-1">{_({ fr: 'Bobine', ar: 'Ø¨ÙƒØ±Ø©', en: 'Bobbin', es: 'Bobina', pt: 'Bobina', tr: 'Bobin' })}</label>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={op.threadMetersPerUnit > 0 ? (op.threadMetersPerUnit / selectedBobbinSize).toFixed(2) : ''}
                                                    onChange={(e) => updateBobines(index, Number(e.target.value))}
                                                    onFocus={(e) => e.target.select()}
                                                    onKeyDown={(e) => ['-', 'e', 'E', '+', '.'].includes(e.key) && e.preventDefault()}
                                                    placeholder="0.00"
                                                    className="w-full px-2 py-1 text-center text-xs font-mono font-bold bg-emerald-50 dark:bg-emerald-900/30/30 text-emerald-700 border border-emerald-100 rounded-lg outline-none focus:border-emerald-500"
                                                />
                                                <span className="text-[10px] text-slate-400 dark:text-dk-muted font-bold">{_({ fr: 'bob', ar: 'Ø¨ÙƒØ±Ø©', en: 'bob', es: 'bob', pt: 'bob', tr: 'bob' })}</span>
                                            </div>
                                        </div>

                                        <div className="col-span-2 flex justify-between items-center bg-slate-50 dark:bg-dk-bg p-2 rounded-lg text-xs">
                                            <div>
                                                <span className="text-slate-400 dark:text-dk-muted">{_({ fr: 'Conso/M:', ar: 'Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ/Ù…:', en: 'Cons./M:', es: 'Cons./M:', pt: 'Cons./M:', tr: 'TÃ¼k./M:' })} </span>
                                                <span className="font-bold text-slate-700 dark:text-dk-text-soft">
                                                    {op.consumptionFactor > 0
                                                        ? `${op.consumptionFactor % 1 === 0 ? op.consumptionFactor.toFixed(0) : op.consumptionFactor.toFixed(2)}${op.isPerPiece ? '/pc' : ''}`
                                                        : '-'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 dark:text-dk-muted">{_({ fr: 'Fil/UnitÃ©:', ar: 'Ø®ÙŠØ·/ÙˆØ­Ø¯Ø©:', en: 'Thread/Unit:', es: 'Hilo/Unidad:', pt: 'Fio/Unidade:', tr: 'Ä°plik/Birim:' })} </span>
                                                <span className="font-bold text-blue-600 dark:text-blue-400">
                                                    {op.threadMetersPerUnit > 0 ? `${op.threadMetersPerUnit.toFixed(2)} m` : '-'}
                                                </span>
                                            </div>
                                        </div>

                                        {op.selected && (
                                            <div className="col-span-2 border-t border-slate-100 dark:border-dk-border pt-2">
                                                <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-1.5">{_({ fr: 'Type Fil', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ·', en: 'Thread Type', es: 'Tipo Hilo', pt: 'Tipo Fio', tr: 'Ä°plik TÃ¼rÃ¼' })}</span>
                                                <ColorThreadCell
                                                    op={op}
                                                    index={index}
                                                    effectiveColors={effectiveColors}
                                                    availableThreadTypes={availableThreadTypes}
                                                    onToggleColorActive={toggleColorActive}
                                                    onSetColorThreadType={setColorThreadType}
                                                    onApplyToAll={applyColorThreadToAllOps}
                                                    onUpdateThreadType={updateThreadType}
                                                    onToggleMultiThread={toggleMultiThread}
                                                    onSetThreadSlot={setThreadSlot}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden">
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 flex items-center gap-2">
                            <Package className="w-4 h-4 text-green-600 dark:text-green-400" />
                            <span className="font-black text-sm text-green-700">{_({ fr: 'RÃ‰SULTATS PAR MACHINE', ar: 'Ø§Ù„Ù†ØªØ§Ø¦Ø¬ Ø­Ø³Ø¨ Ø§Ù„Ø¢Ù„Ø©', en: 'RESULTS BY MACHINE', es: 'RESULTADOS POR MÃQUINA', pt: 'RESULTADOS POR MÃQUINA', tr: 'MAKÄ°NE BAZINDA SONUÃ‡LAR' })}</span>
                        </div>
                        <div className="p-4">
                            {machineSummary.length === 0 ? (
                                <p className="text-center text-slate-400 dark:text-dk-muted py-4">{_({ fr: 'Aucune opÃ©ration sÃ©lectionnÃ©e', ar: 'Ù„Ù… ÙŠØªÙ… ØªØ­Ø¯ÙŠØ¯ Ø£ÙŠ Ø¹Ù…Ù„ÙŠØ©', en: 'No operation selected', es: 'Ninguna operaciÃ³n seleccionada', pt: 'Nenhuma operaÃ§Ã£o selecionada', tr: 'HiÃ§bir iÅŸlem seÃ§ilmedi' })}</p>
                            ) : (
                                <div className="space-y-3">
                                    {machineSummary.map((machine, idx) => (
                                        <div key={idx} className="bg-slate-50 dark:bg-dk-bg rounded-xl p-4 border border-slate-200 dark:border-dk-border">
                                            <div className="flex items-center justify-between mb-2">
                                                <div>
                                                    <span className="font-black text-slate-700 dark:text-dk-text-soft">{machine.machineLabel}</span>
                                                    <span className="ml-2 text-xs text-slate-400 dark:text-dk-muted">({machine.machineCode})</span>
                                                    <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">
                                                        ISO {machine.threadCount} {_({ fr: 'fils', ar: 'Ø®ÙŠÙˆØ·', en: 'threads', es: 'hilos', pt: 'fios', tr: 'iplik' })}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-2xl font-black text-green-600 dark:text-green-400">{formatNumberFr(machine.totalBobbins)}</span>
                                                    <span className="text-sm text-slate-500 dark:text-dk-muted ml-1">{_({ fr: 'bobines', ar: 'Ø¨ÙƒØ±Ø§Øª', en: 'bobbins', es: 'bobinas', pt: 'bobinas', tr: 'bobin' })}</span>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
                                                <div className="flex justify-between sm:block">
                                                    <span className="text-slate-500 dark:text-dk-muted">{_({ fr: 'Fil par unitÃ©:', ar: 'Ø®ÙŠØ· Ù„ÙƒÙ„ ÙˆØ­Ø¯Ø©:', en: 'Thread per unit:', es: 'Hilo por unidad:', pt: 'Fio por unidade:', tr: 'Birim baÅŸÄ±na iplik:' })}</span>
                                                    <span className="sm:ml-2 font-bold text-slate-700 dark:text-dk-text-soft">{machine.threadMetersPerUnit.toFixed(2)} m</span>
                                                </div>
                                                <div className="flex justify-between sm:block">
                                                    <span className="text-slate-500 dark:text-dk-muted">{_({ fr: 'Total:', ar: 'Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ:', en: 'Total:', es: 'Total:', pt: 'Total:', tr: 'Toplam:' })}</span>
                                                    <span className="sm:ml-2 font-bold text-blue-600 dark:text-blue-400">{formatNumberFr(machine.totalMeters)} m</span>
                                                </div>
                                                <div className="flex justify-between sm:block">
                                                    <span className="text-slate-500 dark:text-dk-muted">+ {wastePercent}% {_({ fr: 'usure:', ar: 'ØªØ¢ÙƒÙ„:', en: 'waste:', es: 'desperdicio:', pt: 'desperdÃ­cio:', tr: 'atÄ±k:' })}</span>
                                                    <span className="sm:ml-2 font-bold text-orange-600 dark:text-orange-400">
                                                        {formatNumberFr(Math.ceil(machine.totalMeters * (1 + wastePercent / 100)))} m
                                                    </span>
                                                </div>
                                            </div>
                                            {machine.operations.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-dk-border">
                                                    <span className="text-xs text-slate-400 dark:text-dk-muted">{_({ fr: 'OpÃ©rations:', ar: 'Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª:', en: 'Operations:', es: 'Operaciones:', pt: 'OperaÃ§Ãµes:', tr: 'Ä°ÅŸlemler:' })}</span>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {machine.operations.map((opName, i) => (
                                                            <span key={i} className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border px-2 py-0.5 rounded text-xs text-slate-600 dark:text-dk-text-soft">
                                                                {opName}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl p-4 sm:p-5 text-white">
                        <div className="grid grid-cols-3 gap-2 sm:gap-6 text-center">
                            <div>
                                <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">{_({ fr: 'Total Fil/UnitÃ©', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø®ÙŠØ·/ÙˆØ­Ø¯Ø©', en: 'Total Thread/Unit', es: 'Total Hilo/Unidad', pt: 'Total Fio/Unidade', tr: 'Toplam Ä°plik/Birim' })}</p>
                                <p className="text-lg sm:text-3xl font-black mt-1">{grandTotal.totalMetersPerUnit.toFixed(2)}</p>
                                <p className="text-blue-200 text-[10px] sm:text-xs">{_({ fr: 'mÃ¨tres', ar: 'Ø£Ù…ØªØ§Ø±', en: 'meters', es: 'metros', pt: 'metros', tr: 'metre' })}</p>
                            </div>
                            <div>
                                <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">{_({ fr: 'Total GÃ©nÃ©ral', ar: 'Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹ Ø§Ù„ÙƒÙ„ÙŠ', en: 'Grand Total', es: 'Gran Total', pt: 'Total Geral', tr: 'Genel Toplam' })}</p>
                                <p className="text-lg sm:text-3xl font-black mt-1">{formatNumberFr(grandTotal.totalMeters)}</p>
                                <p className="text-blue-200 text-[10px] sm:text-xs">{_({ fr: 'mÃ¨tres', ar: 'Ø£Ù…ØªØ§Ø±', en: 'meters', es: 'metros', pt: 'metros', tr: 'metre' })}</p>
                            </div>
                            <div>
                                <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">{_({ fr: 'Bobines Totales', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¨ÙƒØ±Ø§Øª', en: 'Total Bobbins', es: 'Bobinas Totales', pt: 'Bobinas Totais', tr: 'Toplam Bobin' })}</p>
                                <p className="text-lg sm:text-3xl font-black mt-1">{formatNumberFr(grandTotal.totalBobbins)}</p>
                                <p className="text-blue-200 text-[10px] sm:text-xs">{_({ fr: 'bobines', ar: 'Ø¨ÙƒØ±Ø§Øª', en: 'bobbins', es: 'bobinas', pt: 'bobinas', tr: 'bobin' })} {selectedBobbinSize}m</p>
                            </div>
                        </div>
                    </div>

                    {colorBreakdown.length > 0 && (
                        <div className="border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden">
                            <div className="bg-purple-50 dark:bg-purple-900/30 p-3 flex items-center gap-2">
                                <span className="font-black text-sm text-purple-700">{_({ fr: 'DÃ‰TAIL PAR COULEUR', ar: 'ØªÙØµÙŠÙ„ Ø­Ø³Ø¨ Ø§Ù„Ù„ÙˆÙ†', en: 'DETAIL BY COLOR', es: 'DETALLE POR COLOR', pt: 'DETALHE POR COR', tr: 'RENKLERE GÃ–RE DETAY' })}</span>
                            </div>
                            <div className="p-4">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs sm:text-sm">
                                        <thead className="bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft text-[10px] sm:text-xs uppercase">
                                            <tr>
                                                <th className="px-1.5 py-1.5 sm:p-2 text-left">{_({ fr: 'Couleur', ar: 'Ø§Ù„Ù„ÙˆÙ†', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' })}</th>
                                                <th className="px-1.5 py-1.5 sm:p-2 text-left">{_({ fr: 'Type', ar: 'Ø§Ù„Ù†ÙˆØ¹', en: 'Type', es: 'Tipo', pt: 'Tipo', tr: 'TÃ¼r' })}</th>
                                                <th className="px-1.5 py-1.5 sm:p-2 text-right">{_({ fr: 'QtÃ©', ar: 'Ø§Ù„ÙƒÙ…ÙŠØ©', en: 'Qty', es: 'Cant', pt: 'Qtde', tr: 'Miktar' })}</th>
                                                <th className="px-1.5 py-1.5 sm:p-2 text-right">{_({ fr: 'Fil Total', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø®ÙŠØ·', en: 'Total Thread', es: 'Hilo Total', pt: 'Fio Total', tr: 'Toplam Ä°plik' })}</th>
                                                <th className="px-1.5 py-1.5 sm:p-2 text-right">{_({ fr: 'Bob.', ar: 'Ø¨ÙƒØ±Ø©', en: 'Bob.', es: 'Bob.', pt: 'Bob.', tr: 'Bob.' })}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                            {colorBreakdown.map((color, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                                    <td className="px-1.5 py-1.5 sm:p-2 font-bold text-slate-700 dark:text-dk-text-soft">{color.colorName}</td>
                                                    <td className="px-1.5 py-1.5 sm:p-2 text-amber-700 font-mono text-[10px] sm:text-xs break-words">{color.threadType || 'â€”'}</td>
                                                    <td className="px-1.5 py-1.5 sm:p-2 text-right tabular-nums text-slate-600 dark:text-dk-text-soft">{formatNumberFr(color.quantity)}</td>
                                                    <td className="px-1.5 py-1.5 sm:p-2 text-right tabular-nums text-blue-600 dark:text-blue-400 font-bold">{formatNumberFr(color.threadMeters)} m</td>
                                                    <td className="px-1.5 py-1.5 sm:p-2 text-right tabular-nums text-green-600 dark:text-green-400 font-bold">{formatNumberFr(color.bobbins)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                    </>)}
                </div>

                <div className="bg-slate-50 dark:bg-dk-bg/60 md:bg-slate-50 border-t border-slate-100 dark:border-dk-border p-4 flex items-center justify-between gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base text-slate-600 dark:text-dk-text-soft font-medium md:font-bold rounded-xl hover:bg-slate-200/70 transition-colors"
                        aria-label={_({ fr: 'Annuler et fermer', ar: 'Ø¥Ù„ØºØ§Ø¡ ÙˆØ¥ØºÙ„Ø§Ù‚', en: 'Cancel and close', es: 'Cancelar y cerrar', pt: 'Cancelar e fechar', tr: 'Ä°ptal et ve kapat' })}
                    >
                        {_({ fr: 'Annuler', ar: 'Ø¥Ù„ØºØ§Ø¡', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'Ä°ptal' })}
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={calcMode === 'poste' ? machineSummary.length === 0 : (!indiceGarment || indiceBobbinsTotal <= 0)}
                        className="px-4 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        aria-label={`${_({ fr: 'Appliquer', ar: 'ØªØ·Ø¨ÙŠÙ‚', en: 'Apply', es: 'Aplicar', pt: 'Aplicar', tr: 'Uygula' })} ${calcMode === 'poste' ? grandTotal.totalBobbins : indiceBobbinsTotal} ${_({ fr: 'bobines', ar: 'Ø¨ÙƒØ±Ø§Øª', en: 'bobbins', es: 'bobinas', pt: 'bobinas', tr: 'bobin' })}`}
                    >
                        <Check className="w-4 h-4" />
                        {_({ fr: 'Appliquer', ar: 'ØªØ·Ø¨ÙŠÙ‚', en: 'Apply', es: 'Aplicar', pt: 'Aplicar', tr: 'Uygula' })} ({calcMode === 'poste' ? grandTotal.totalBobbins : indiceBobbinsTotal} {_({ fr: 'bobines', ar: 'Ø¨ÙƒØ±Ø§Øª', en: 'bobbins', es: 'bobinas', pt: 'bobinas', tr: 'bobin' })})
                    </button>
                </div>
            </div>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
        {typeof document !== 'undefined' && createPortal(
            <ThreadPrintView
                effectiveQty={effectiveQty}
                wastePercent={wastePercent}
                selectedBobbinSize={selectedBobbinSize}
                machineSummary={machineSummary}
                colorBreakdown={colorBreakdown}
                opsData={opsData}
                grandTotal={grandTotal}
            />,
            document.body
        )}
        </>
        );
    }

    // Expanded mode: full page
    return (
        <>
            <div className={`fixed inset-0 z-[100] flex flex-col ${isDark ? 'bg-dk-bg' : 'bg-white dark:bg-dk-surface'}`}>
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-white dark:bg-dk-surface/20 p-2 rounded-xl">
                            <Scissors className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black">{_({ fr: 'Calcul Fil', ar: 'Ø­Ø³Ø§Ø¨ Ø§Ù„Ø®ÙŠØ·', en: 'Thread Calculation', es: 'CÃ¡lculo de Hilo', pt: 'CÃ¡lculo de Fio', tr: 'Ä°plik Hesaplama' })}</h2>
                            <p className="text-sm text-blue-100">{_({ fr: 'Calcul automatique de la consommation de fil', ar: 'Ø­Ø³Ø§Ø¨ ØªÙ„Ù‚Ø§Ø¦ÙŠ Ù„Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ Ø§Ù„Ø®ÙŠØ·', en: 'Automatic thread consumption calculation', es: 'CÃ¡lculo automÃ¡tico del consumo de hilo', pt: 'CÃ¡lculo automÃ¡tico do consumo de fio', tr: 'Otomatik iplik tÃ¼ketimi hesaplamasÄ±' })}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-indigo-500 hover:bg-indigo-400 rounded-lg transition-colors text-xs sm:text-sm font-bold shadow-md dark:shadow-dk-md">
                            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">{_({ fr: 'Imprimer', ar: 'Ø·Ø¨Ø§Ø¹Ø©', en: 'Print', es: 'Imprimir', pt: 'Imprimir', tr: 'YazdÄ±r' })}</span>
                        </button>
                        <button onClick={() => setIsExpanded(false)} className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-white dark:bg-dk-surface/20 hover:bg-white rounded-lg transition-colors text-xs sm:text-sm font-bold">
                            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">{_({ fr: 'Retour', ar: 'Ø±Ø¬ÙˆØ¹', en: 'Back', es: 'Volver', pt: 'Voltar', tr: 'Geri' })}</span>
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

            <div className="bg-slate-50 dark:bg-dk-bg border-b p-4 flex flex-wrap items-center gap-4 shrink-0">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500 dark:text-dk-muted">{_({ fr: 'QUANTITÃ‰:', ar: 'Ø§Ù„ÙƒÙ…ÙŠØ©:', en: 'QUANTITY:', es: 'CANTIDAD:', pt: 'QUANTIDADE:', tr: 'MÄ°KTAR:' })}</label>
                    <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg font-black text-sm">
                        {formatNumberFr(effectiveQty)} {_({ fr: 'pcs', ar: 'Ù‚Ø·Ø¹Ø©', en: 'pcs', es: 'pzas', pt: 'pÃ§', tr: 'adet' })}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500 dark:text-dk-muted">{_({ fr: 'HUMIDITÃ‰/USURE:', ar: 'Ø§Ù„Ø±Ø·ÙˆØ¨Ø©/Ø§Ù„ØªØ¢ÙƒÙ„:', en: 'HUMIDITY/WASTE:', es: 'HUMEDAD/DESPERDICIO:', pt: 'UMIDADE/DESPERDÃCIO:', tr: 'NEM/ATIK:' })}</label>
                    <div className="flex items-center gap-1">
                        <input
                            type="number"
                            min="0"
                            max="30"
                            value={wastePercent}
                            onChange={(e) => {
                                const val = Number(e.target.value);
                                if (!isNaN(val) && val >= 0 && val <= 30) {
                                    setWastePercent(val);
                                }
                            }}
                            className="w-16 px-2 py-1 text-sm border border-slate-300 rounded-lg text-center font-bold bg-white dark:bg-dk-surface"
                            aria-label={_({ fr: 'Pourcentage d\'humiditÃ© ou d\'usure', ar: 'Ù†Ø³Ø¨Ø© Ø§Ù„Ø±Ø·ÙˆØ¨Ø© Ø£Ùˆ Ø§Ù„ØªØ¢ÙƒÙ„', en: 'Humidity or waste percentage', es: 'Porcentaje de humedad o desperdicio', pt: 'Percentual de umidade ou desperdÃ­cio', tr: 'Nem veya atÄ±k yÃ¼zdesi' })}
                        />
                        <span className="text-sm text-slate-500 dark:text-dk-muted">%</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500 dark:text-dk-muted">{_({ fr: 'TAILLE BOBINE:', ar: 'Ø­Ø¬Ù… Ø§Ù„Ø¨ÙƒØ±Ø©:', en: 'BOBBIN SIZE:', es: 'TAMAÃ‘O BOBINA:', pt: 'TAMANHO BOBINA:', tr: 'BOBÄ°N BOYUTU:' })}</label>
                    <select
                        value={selectedBobbinSize}
                        onChange={(e) => setSelectedBobbinSize(Number(e.target.value))}
                        className="px-3 py-1 text-sm border border-slate-300 rounded-lg font-bold bg-white dark:bg-dk-surface"
                        aria-label={_({ fr: 'Taille de la bobine', ar: 'Ø­Ø¬Ù… Ø§Ù„Ø¨ÙƒØ±Ø©', en: 'Bobbin size', es: 'TamaÃ±o de bobina', pt: 'Tamanho da bobina', tr: 'Bobin boyutu' })}
                    >
                        {BOBBIN_SIZES.map(size => (
                            <option key={size.capacityMeters} value={size.capacityMeters}>
                                {size.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500 dark:text-dk-muted">{_({ fr: 'TYPE FIL:', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ·:', en: 'THREAD TYPE:', es: 'TIPO HILO:', pt: 'TIPO FIO:', tr: 'Ä°PLÄ°K TÃœRÃœ:' })}</label>
                    <ThreadTypesManager
                        availableThreadTypes={availableThreadTypes}
                        onAdd={addThreadTypeValue}
                        onRename={renameThreadTypeValue}
                        onDelete={deleteThreadTypeValue}
                    />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Selecteur de mode de calcul */}
                <CalcModeToggle calcMode={calcMode} onChange={setCalcMode} />

                {calcMode === 'indice' && (
                    <IndiceEstimatePanel
                        autoMatchName={autoGarment?.name}
                        garmentKey={garmentKey}
                        garment={indiceGarment}
                        indiceValue={indiceValue}
                        surfilage={indiceSurfilage}
                        assemblage={indiceAssemblage}
                        qty={effectiveQty}
                        wastePercent={wastePercent}
                        bobbinSize={selectedBobbinSize}
                        totalWithWaste={indiceTotalWithWaste}
                        bobbins={indiceBobbins}
                        colorBreakdown={indiceColorBreakdown}
                        onSelectKey={(k) => { setGarmentKey(k); setIndiceOverride(null); }}
                        onIndiceChange={setIndiceOverride}
                        onResetIndice={() => setIndiceOverride(null)}
                    />
                )}

                {calcMode === 'poste' && (<>
                <div className="border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden">
                    <div className="w-full bg-slate-50 dark:bg-dk-bg p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calculator className="w-4 h-4 text-blue-500" />
                            <span className="font-black text-sm text-slate-700 dark:text-dk-text-soft">
                                {_({ fr: 'OPÃ‰RATIONS', ar: 'Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª', en: 'OPERATIONS', es: 'OPERACIONES', pt: 'OPERAÃ‡Ã•ES', tr: 'Ä°ÅžLEMLER' })} ({opsData.filter(op => op.selected).length}/{opsData.length})
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={selectAll} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-bold underline" aria-label={_({ fr: 'SÃ©lectionner toutes les opÃ©rations', ar: 'ØªØ­Ø¯ÙŠØ¯ ÙƒÙ„ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª', en: 'Select all operations', es: 'Seleccionar todas las operaciones', pt: 'Selecionar todas as operaÃ§Ãµes', tr: 'TÃ¼m iÅŸlemleri seÃ§' })}>{_({ fr: 'Tout', ar: 'Ø§Ù„ÙƒÙ„', en: 'All', es: 'Todo', pt: 'Tudo', tr: 'TÃ¼mÃ¼' })}</button>
                            <span className="text-slate-300 dark:text-dk-muted">|</span>
                            <button onClick={deselectAll} className="text-xs text-red-500 hover:text-red-700 font-bold underline" aria-label={_({ fr: 'DÃ©sÃ©lectionner toutes les opÃ©rations', ar: 'Ø¥Ù„ØºØ§Ø¡ ØªØ­Ø¯ÙŠØ¯ ÙƒÙ„ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª', en: 'Deselect all operations', es: 'Deseleccionar todas las operaciones', pt: 'Desmarcar todas as operaÃ§Ãµes', tr: 'TÃ¼m iÅŸlemlerin seÃ§imini kaldÄ±r' })}>{_({ fr: 'Aucun', ar: 'Ù„Ø§ Ø´ÙŠØ¡', en: 'None', es: 'Ninguno', pt: 'Nenhum', tr: 'HiÃ§biri' })}</button>
                        </div>
                    </div>

                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft text-xs uppercase">
                                    <tr>
                                        <th className="p-3 text-left w-10"></th>
                                        <th className="p-3 text-left">NÂ°</th>
                                        <th className="p-3 text-left min-w-[180px]">{_({ fr: 'Description de l\'opÃ©ration', ar: 'ÙˆØµÙ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Operation description', es: 'DescripciÃ³n de la operaciÃ³n', pt: 'DescriÃ§Ã£o da operaÃ§Ã£o', tr: 'Ä°ÅŸlem aÃ§Ä±klamasÄ±' })}</th>
                                        <th className="p-3 text-left">{_({ fr: 'Machine', ar: 'Ø¢Ù„Ø©', en: 'Machine', es: 'MÃ¡quina', pt: 'MÃ¡quina', tr: 'Makine' })}</th>
                                        <th className="p-3 text-left">{_({ fr: 'Type Point', ar: 'Ù†ÙˆØ¹ Ø§Ù„ØºØ±Ø²Ø©', en: 'Stitch Type', es: 'Tipo de Puntada', pt: 'Tipo de Ponto', tr: 'DikiÅŸ TÃ¼rÃ¼' })}</th>
                                        <th className="p-3 text-center text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" title={_({ fr: 'cm pour couture, piÃ¨ces pour boutonniÃ¨re/bouton/bride', ar: 'Ø³Ù… Ù„Ù„Ø®ÙŠØ§Ø·Ø©ØŒ Ù‚Ø·Ø¹ Ù„Ù„Ø¹Ø±ÙˆØ©/Ø§Ù„Ø²Ø±/Ø§Ù„Ø±Ø¨Ø§Ø·', en: 'cm for sewing, pieces for buttonhole/button/tie', es: 'cm para costura, piezas para ojal/botÃ³n/atadura', pt: 'cm para costura, peÃ§as para casa/botÃ£o/amarra', tr: 'dikiÅŸ iÃ§in cm, ilik/dÃ¼ÄŸme/baÄŸ iÃ§in adet' })}>{_({ fr: 'L / QtÃ© (cm/pc)', ar: 'Ø§Ù„Ø·ÙˆÙ„ / Ø§Ù„ÙƒÙ…ÙŠØ© (Ø³Ù…/Ù‚Ø·Ø¹Ø©)', en: 'L / Qty (cm/pc)', es: 'L / Cant (cm/pz)', pt: 'Comp / Qtde (cm/pÃ§)', tr: 'Uzunluk / Miktar (cm/adet)' })}</th>
                                        <th className="p-3 text-right" title={_({ fr: 'MÃ¨tres de fil par mÃ¨tre de couture (ou par piÃ¨ce pour boutonniÃ¨res)', ar: 'Ø£Ù…ØªØ§Ø± Ø§Ù„Ø®ÙŠØ· Ù„ÙƒÙ„ Ù…ØªØ± Ø®ÙŠØ§Ø·Ø© (Ø£Ùˆ Ù„ÙƒÙ„ Ù‚Ø·Ø¹Ø© Ù„Ù„Ø¹Ø±ÙˆØ§Øª)', en: 'Thread meters per meter of seam (or per piece for buttonholes)', es: 'Metros de hilo por metro de costura (o por pieza para ojales)', pt: 'Metros de fio por metro de costura (ou por peÃ§a para casas)', tr: 'Metre dikiÅŸ baÅŸÄ±na iplik metresi (ilikler iÃ§in adet baÅŸÄ±na)' })}>{_({ fr: 'Conso/M', ar: 'Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ/Ù…', en: 'Cons./M', es: 'Cons./M', pt: 'Cons./M', tr: 'TÃ¼k./M' })}</th>
                                        <th className="p-3 text-right">{_({ fr: 'Fil/UnitÃ©', ar: 'Ø®ÙŠØ·/ÙˆØ­Ø¯Ø©', en: 'Thread/Unit', es: 'Hilo/Unidad', pt: 'Fio/Unidade', tr: 'Ä°plik/Birim' })}</th>
                                        <th className="p-3 text-right text-emerald-600 dark:text-emerald-400" title={`${_({ fr: 'Bobines par unitÃ©', ar: 'Ø¨ÙƒØ±Ø§Øª Ù„ÙƒÙ„ ÙˆØ­Ø¯Ø©', en: 'Bobbins per unit', es: 'Bobinas por unidad', pt: 'Bobinas por unidade', tr: 'Birim baÅŸÄ±na bobin' })} (${_({ fr: 'Fil/UnitÃ©', ar: 'Ø®ÙŠØ·/ÙˆØ­Ø¯Ø©', en: 'Thread/Unit', es: 'Hilo/Unidad', pt: 'Fio/Unidade', tr: 'Ä°plik/Birim' })} Ã· ${selectedBobbinSize} m)`}>{_({ fr: 'Bobine', ar: 'Ø¨ÙƒØ±Ø©', en: 'Bobbin', es: 'Bobina', pt: 'Bobina', tr: 'Bobin' })}</th>
                                        <th className="p-3 text-left text-amber-600 dark:text-amber-400" title={_({ fr: 'Type de fil utilisÃ© (ex: Polyester Tex 27, Coton NM 50)', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ· Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… (Ù…Ø«Ø§Ù„: Ø¨ÙˆÙ„ÙŠØ³ØªØ± Tex 27ØŒ Ù‚Ø·Ù† NM 50)', en: 'Thread type used (ex: Polyester Tex 27, Cotton NM 50)', es: 'Tipo de hilo usado (ej: Polyester Tex 27, AlgodÃ³n NM 50)', pt: 'Tipo de fio usado (ex: PoliÃ©ster Tex 27, AlgodÃ£o NM 50)', tr: 'KullanÄ±lan iplik tÃ¼rÃ¼ (Ã¶r: Polyester Tex 27, Pamuk NM 50)' })}>{_({ fr: 'Type Fil', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ·', en: 'Thread Type', es: 'Tipo Hilo', pt: 'Tipo Fio', tr: 'Ä°plik TÃ¼rÃ¼' })}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {opsData.map((op, index) => (
                                        <tr key={op.operation.id} className={`${op.selected ? 'bg-blue-50 dark:bg-blue-900/30/50' : 'bg-white dark:bg-dk-surface'} hover:bg-blue-50 transition-colors`}>
                                            <td className="p-3">
                                                <button onClick={() => toggleOperation(index)} className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${op.selected ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 hover:border-blue-400'}`} aria-label={op.selected ? `${_({ fr: 'DÃ©sÃ©lectionner opÃ©ration', ar: 'Ø¥Ù„ØºØ§Ø¡ ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Deselect operation', es: 'Deseleccionar operaciÃ³n', pt: 'Desmarcar operaÃ§Ã£o', tr: 'Ä°ÅŸlemin seÃ§imini kaldÄ±r' })} ${op.operation.order}` : `${_({ fr: 'SÃ©lectionner opÃ©ration', ar: 'ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Select operation', es: 'Seleccionar operaciÃ³n', pt: 'Selecionar operaÃ§Ã£o', tr: 'Ä°ÅŸlemi seÃ§' })} ${op.operation.order}`} aria-pressed={op.selected}>
                                                    {op.selected && <Check className="w-3 h-3" />}
                                                </button>
                                            </td>
                                            <td className="p-3 font-bold text-slate-600 dark:text-dk-text-soft">{op.operation.order}</td>
                                            <td className="p-3 text-slate-700 dark:text-dk-text-soft">{op.operation.description || <span className="text-slate-300 dark:text-dk-muted">â€”</span>}</td>
                                            <td className="p-3">
                                                <span className="inline-block bg-slate-100/70 border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1 text-xs font-bold text-slate-700 dark:text-dk-text-soft">
                                                    {op.machineRaw || <span className="text-slate-300 dark:text-dk-muted">â€”</span>}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                {op.stitchType ? (
                                                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">{op.stitchType.name}</span>
                                                ) : (
                                                    <span className="bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted px-2 py-0.5 rounded-full text-xs">{_({ fr: 'Non dÃ©fini', ar: 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯', en: 'Undefined', es: 'No definido', pt: 'NÃ£o definido', tr: 'TanÄ±msÄ±z' })}</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <input type="number" min="0" step="1" value={op.lengthCm === 0 ? '' : op.lengthCm} onChange={(e) => updateLength(index, Number(e.target.value))} onFocus={(e) => e.target.select()} onKeyDown={(e) => ['-', 'e', 'E', '+', '.', ','].includes(e.key) && e.preventDefault()} placeholder="-" className="w-16 px-1 py-1 text-center text-xs font-mono font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/30 text-indigo-700 dark:text-dk-accent-text border border-indigo-100 rounded-lg outline-none focus:border-indigo-500 transition-colors" title={op.isPerPiece ? _({ fr: 'Nombre de piÃ¨ces (boutonniÃ¨re / bouton / bride)', ar: 'Ø¹Ø¯Ø¯ Ø§Ù„Ù‚Ø·Ø¹ (Ø¹Ø±ÙˆØ© / Ø²Ø± / Ø±Ø¨Ø§Ø·)', en: 'Number of pieces (buttonhole / button / tie)', es: 'NÃºmero de piezas (ojal / botÃ³n / atadura)', pt: 'NÃºmero de peÃ§as (casa / botÃ£o / amarra)', tr: 'ParÃ§a sayÄ±sÄ± (ilik / dÃ¼ÄŸme / baÄŸ)' }) : _({ fr: 'Longueur de couture en cm', ar: 'Ø·ÙˆÙ„ Ø§Ù„Ø®ÙŠØ§Ø·Ø© Ø¨Ø§Ù„Ø³Ù†ØªÙŠÙ…ØªØ±', en: 'Seam length in cm', es: 'Longitud de costura en cm', pt: 'Comprimento da costura em cm', tr: 'DikiÅŸ uzunluÄŸu (cm)' })} aria-label={op.isPerPiece ? `${_({ fr: 'Nombre de piÃ¨ces pour opÃ©ration', ar: 'Ø¹Ø¯Ø¯ Ø§Ù„Ù‚Ø·Ø¹ Ù„Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Number of pieces for operation', es: 'NÃºmero de piezas para operaciÃ³n', pt: 'NÃºmero de peÃ§as para operaÃ§Ã£o', tr: 'Ä°ÅŸlem iÃ§in parÃ§a sayÄ±sÄ±' })} ${op.operation.order}` : `${_({ fr: 'Longueur de couture en cm pour opÃ©ration', ar: 'Ø·ÙˆÙ„ Ø§Ù„Ø®ÙŠØ§Ø·Ø© Ø¨Ø§Ù„Ø³Ù†ØªÙŠÙ…ØªØ± Ù„Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Seam length in cm for operation', es: 'Longitud de costura en cm para operaciÃ³n', pt: 'Comprimento da costura em cm para operaÃ§Ã£o', tr: 'Ä°ÅŸlem iÃ§in dikiÅŸ uzunluÄŸu (cm)' })} ${op.operation.order}`} />
                                                    <span className="text-[10px] text-slate-400 dark:text-dk-muted">{op.isPerPiece ? _({ fr: 'pc', ar: 'Ù‚Ø·Ø¹Ø©', en: 'pc', es: 'pz', pt: 'pÃ§', tr: 'ad' }) : 'cm'}</span>
                                                </div>
                                            </td>
                                            <td className="p-3 text-right font-mono text-slate-600 dark:text-dk-text-soft">
                                                {op.consumptionFactor > 0 ? `${op.consumptionFactor % 1 === 0 ? op.consumptionFactor.toFixed(0) : op.consumptionFactor.toFixed(2)}${op.isPerPiece ? '/pc' : ''}` : '-'}
                                            </td>
                                            <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400">
                                                {op.threadMetersPerUnit > 0 ? `${op.threadMetersPerUnit.toFixed(2)} m` : '-'}
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={op.threadMetersPerUnit > 0 ? (op.threadMetersPerUnit / selectedBobbinSize).toFixed(2) : ''}
                                                        onChange={(e) => updateBobines(index, Number(e.target.value))}
                                                        onFocus={(e) => e.target.select()}
                                                        onKeyDown={(e) => ['-', 'e', 'E', '+', '.'].includes(e.key) && e.preventDefault()}
                                                        placeholder="0.00"
                                                        className="w-16 px-1 py-1 text-center text-xs font-mono font-bold bg-emerald-50 dark:bg-emerald-900/30/30 text-emerald-700 border border-emerald-100 rounded-lg outline-none focus:border-emerald-500 transition-colors placeholder:text-emerald-300 placeholder:font-normal"
                                                        title={`${op.threadMetersPerUnit.toFixed(2)} m Ã· ${selectedBobbinSize} ${_({ fr: 'm/bobine', ar: 'Ù…/Ø¨ÙƒØ±Ø©', en: 'm/bobbin', es: 'm/bobina', pt: 'm/bobina', tr: 'm/bobin' })}`}
                                                        aria-label={`${_({ fr: 'Bobines par unitÃ© pour opÃ©ration', ar: 'Ø¨ÙƒØ±Ø§Øª Ù„ÙƒÙ„ ÙˆØ­Ø¯Ø© Ù„Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Bobbins per unit for operation', es: 'Bobinas por unidad para operaciÃ³n', pt: 'Bobinas por unidade para operaÃ§Ã£o', tr: 'Ä°ÅŸlem iÃ§in birim baÅŸÄ±na bobin' })} ${op.operation.order}`}
                                                    />
                                                    <span className="text-[10px] text-slate-400 dark:text-dk-muted">{_({ fr: 'bob', ar: 'Ø¨ÙƒØ±Ø©', en: 'bob', es: 'bob', pt: 'bob', tr: 'bob' })}</span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <ColorThreadCell
                                                    op={op}
                                                    index={index}
                                                    effectiveColors={effectiveColors}
                                                    availableThreadTypes={availableThreadTypes}
                                                    onToggleColorActive={toggleColorActive}
                                                    onSetColorThreadType={setColorThreadType}
                                                    onApplyToAll={applyColorThreadToAllOps}
                                                    onUpdateThreadType={updateThreadType}
                                                    onToggleMultiThread={toggleMultiThread}
                                                    onSetThreadSlot={setThreadSlot}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="block md:hidden divide-y divide-slate-100 dark:divide-dk-border bg-white dark:bg-dk-surface">
                            {opsData.map((op, index) => (
                                <div key={op.operation.id} className={`p-4 transition-colors ${op.selected ? 'bg-blue-50 dark:bg-blue-900/30/20' : 'bg-white dark:bg-dk-surface'}`}>
                                    <div className="flex items-start gap-3">
                                        <button
                                            onClick={() => toggleOperation(index)}
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                                op.selected
                                                    ? 'bg-blue-500 border-blue-500 text-white'
                                                    : 'border-slate-300'
                                            }`}
                                            aria-label={op.selected ? `${_({ fr: 'DÃ©sÃ©lectionner opÃ©ration', ar: 'Ø¥Ù„ØºØ§Ø¡ ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Deselect operation', es: 'Deseleccionar operaciÃ³n', pt: 'Desmarcar operaÃ§Ã£o', tr: 'Ä°ÅŸlemin seÃ§imini kaldÄ±r' })} ${op.operation.order}` : `${_({ fr: 'SÃ©lectionner opÃ©ration', ar: 'ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Select operation', es: 'Seleccionar operaciÃ³n', pt: 'Selecionar operaÃ§Ã£o', tr: 'Ä°ÅŸlemi seÃ§' })} ${op.operation.order}`}
                                            aria-pressed={op.selected}
                                        >
                                            {op.selected && <Check className="w-3.5 h-3.5" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                                <span className="font-bold text-xs text-slate-500 dark:text-dk-muted">NÂ° {op.operation.order}</span>
                                                <span className="inline-block bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:text-dk-text-soft">
                                                    {op.machineRaw || 'â€”'}
                                                </span>
                                                {op.stitchType ? (
                                                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                                                        {op.stitchType.name}
                                                    </span>
                                                ) : (
                                                    <span className="bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted px-1.5 py-0.5 rounded-full text-[10px]">
                                                        {_({ fr: 'Non dÃ©fini', ar: 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯', en: 'Undefined', es: 'No definido', pt: 'NÃ£o definido', tr: 'TanÄ±msÄ±z' })}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="font-semibold text-slate-800 dark:text-dk-text text-sm">{op.operation.description || <span className="text-slate-300 dark:text-dk-muted">â€”</span>}</p>
                                        </div>
                                    </div>

                                    <div className="mt-3 pl-8 grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-1">{_({ fr: 'L / QtÃ©', ar: 'Ø§Ù„Ø·ÙˆÙ„ / Ø§Ù„ÙƒÙ…ÙŠØ©', en: 'L / Qty', es: 'L / Cant', pt: 'Comp / Qtde', tr: 'Uzun / Miktar' })}</label>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={op.lengthCm === 0 ? '' : op.lengthCm}
                                                    onChange={(e) => updateLength(index, Number(e.target.value))}
                                                    onFocus={(e) => e.target.select()}
                                                    onKeyDown={(e) => ['-', 'e', 'E', '+', '.', ','].includes(e.key) && e.preventDefault()}
                                                    placeholder="-"
                                                    className="w-full px-2 py-1 text-center text-xs font-mono font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/30 text-indigo-700 dark:text-dk-accent-text border border-indigo-100 rounded-lg outline-none focus:border-indigo-500"
                                                />
                                                <span className="text-[10px] text-slate-400 dark:text-dk-muted font-bold">{op.isPerPiece ? _({ fr: 'pc', ar: 'Ù‚Ø·Ø¹Ø©', en: 'pc', es: 'pz', pt: 'pÃ§', tr: 'ad' }) : 'cm'}</span>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-1">{_({ fr: 'Bobine', ar: 'Ø¨ÙƒØ±Ø©', en: 'Bobbin', es: 'Bobina', pt: 'Bobina', tr: 'Bobin' })}</label>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={op.threadMetersPerUnit > 0 ? (op.threadMetersPerUnit / selectedBobbinSize).toFixed(2) : ''}
                                                    onChange={(e) => updateBobines(index, Number(e.target.value))}
                                                    onFocus={(e) => e.target.select()}
                                                    onKeyDown={(e) => ['-', 'e', 'E', '+', '.'].includes(e.key) && e.preventDefault()}
                                                    placeholder="0.00"
                                                    className="w-full px-2 py-1 text-center text-xs font-mono font-bold bg-emerald-50 dark:bg-emerald-900/30/30 text-emerald-700 border border-emerald-100 rounded-lg outline-none focus:border-emerald-500"
                                                />
                                                <span className="text-[10px] text-slate-400 dark:text-dk-muted font-bold">{_({ fr: 'bob', ar: 'Ø¨ÙƒØ±Ø©', en: 'bob', es: 'bob', pt: 'bob', tr: 'bob' })}</span>
                                            </div>
                                        </div>

                                        <div className="col-span-2 flex justify-between items-center bg-slate-50 dark:bg-dk-bg p-2 rounded-lg text-xs">
                                            <div>
                                                <span className="text-slate-400 dark:text-dk-muted">{_({ fr: 'Conso/M:', ar: 'Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ/Ù…:', en: 'Cons./M:', es: 'Cons./M:', pt: 'Cons./M:', tr: 'TÃ¼k./M:' })} </span>
                                                <span className="font-bold text-slate-700 dark:text-dk-text-soft">
                                                    {op.consumptionFactor > 0 ? `${op.consumptionFactor % 1 === 0 ? op.consumptionFactor.toFixed(0) : op.consumptionFactor.toFixed(2)}${op.isPerPiece ? '/pc' : ''}` : '-'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 dark:text-dk-muted">{_({ fr: 'Fil/UnitÃ©:', ar: 'Ø®ÙŠØ·/ÙˆØ­Ø¯Ø©:', en: 'Thread/Unit:', es: 'Hilo/Unidad:', pt: 'Fio/Unidade:', tr: 'Ä°plik/Birim:' })} </span>
                                                <span className="font-bold text-blue-600 dark:text-blue-400">
                                                    {op.threadMetersPerUnit > 0 ? `${op.threadMetersPerUnit.toFixed(2)} m` : '-'}
                                                </span>
                                            </div>
                                        </div>

                                        {op.selected && (
                                            <div className="col-span-2 border-t border-slate-100 dark:border-dk-border pt-2">
                                                <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-1.5">{_({ fr: 'Type Fil', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ·', en: 'Thread Type', es: 'Tipo Hilo', pt: 'Tipo Fio', tr: 'Ä°plik TÃ¼rÃ¼' })}</span>
                                                <ColorThreadCell
                                                    op={op}
                                                    index={index}
                                                    effectiveColors={effectiveColors}
                                                    availableThreadTypes={availableThreadTypes}
                                                    onToggleColorActive={toggleColorActive}
                                                    onSetColorThreadType={setColorThreadType}
                                                    onApplyToAll={applyColorThreadToAllOps}
                                                    onUpdateThreadType={updateThreadType}
                                                    onToggleMultiThread={toggleMultiThread}
                                                    onSetThreadSlot={setThreadSlot}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                </div>

                <div className="border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden">
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 flex items-center gap-2">
                        <Package className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="font-black text-sm text-green-700">{_({ fr: 'RÃ‰SULTATS PAR MACHINE', ar: 'Ø§Ù„Ù†ØªØ§Ø¦Ø¬ Ø­Ø³Ø¨ Ø§Ù„Ø¢Ù„Ø©', en: 'RESULTS BY MACHINE', es: 'RESULTADOS POR MÃQUINA', pt: 'RESULTADOS POR MÃQUINA', tr: 'MAKÄ°NE BAZINDA SONUÃ‡LAR' })}</span>
                    </div>
                    <div className="p-4">
                        {machineSummary.length === 0 ? (
                            <p className="text-center text-slate-400 dark:text-dk-muted py-4">{_({ fr: 'Aucune opÃ©ration sÃ©lectionnÃ©e', ar: 'Ù„Ù… ÙŠØªÙ… ØªØ­Ø¯ÙŠØ¯ Ø£ÙŠ Ø¹Ù…Ù„ÙŠØ©', en: 'No operation selected', es: 'Ninguna operaciÃ³n seleccionada', pt: 'Nenhuma operaÃ§Ã£o selecionada', tr: 'HiÃ§bir iÅŸlem seÃ§ilmedi' })}</p>
                        ) : (
                            <div className="space-y-3">
                                {machineSummary.map((machine, idx) => (
                                    <div key={idx} className="bg-slate-50 dark:bg-dk-bg rounded-xl p-4 border border-slate-200 dark:border-dk-border">
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <span className="font-black text-slate-700 dark:text-dk-text-soft">{machine.machineLabel}</span>
                                                <span className="ml-2 text-xs text-slate-400 dark:text-dk-muted">({machine.machineCode})</span>
                                                <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">ISO {machine.threadCount} {_({ fr: 'fils', ar: 'Ø®ÙŠÙˆØ·', en: 'threads', es: 'hilos', pt: 'fios', tr: 'iplik' })}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-2xl font-black text-green-600 dark:text-green-400">{machine.totalBobbins}</span>
                                                <span className="text-sm text-slate-500 dark:text-dk-muted ml-1">{_({ fr: 'bobines', ar: 'Ø¨ÙƒØ±Ø§Øª', en: 'bobbins', es: 'bobinas', pt: 'bobinas', tr: 'bobin' })}</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
                                            <div className="flex justify-between sm:block">
                                                <span className="text-slate-500 dark:text-dk-muted">{_({ fr: 'Fil par unitÃ©:', ar: 'Ø®ÙŠØ· Ù„ÙƒÙ„ ÙˆØ­Ø¯Ø©:', en: 'Thread per unit:', es: 'Hilo por unidad:', pt: 'Fio por unidade:', tr: 'Birim baÅŸÄ±na iplik:' })}</span>
                                                <span className="sm:ml-2 font-bold text-slate-700 dark:text-dk-text-soft">{machine.threadMetersPerUnit.toFixed(2)} m</span>
                                            </div>
                                            <div className="flex justify-between sm:block">
                                                <span className="text-slate-500 dark:text-dk-muted">{_({ fr: 'Total:', ar: 'Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ:', en: 'Total:', es: 'Total:', pt: 'Total:', tr: 'Toplam:' })}</span>
                                                <span className="sm:ml-2 font-bold text-blue-600 dark:text-blue-400">{formatNumberFr(machine.totalMeters)} m</span>
                                            </div>
                                            <div className="flex justify-between sm:block">
                                                <span className="text-slate-500 dark:text-dk-muted">+ {wastePercent}% {_({ fr: 'usure:', ar: 'ØªØ¢ÙƒÙ„:', en: 'waste:', es: 'desperdicio:', pt: 'desperdÃ­cio:', tr: 'atÄ±k:' })}</span>
                                                <span className="sm:ml-2 font-bold text-orange-600 dark:text-orange-400">{formatNumberFr(Math.ceil(machine.totalMeters * (1 + wastePercent / 100)))} m</span>
                                            </div>
                                        </div>
                                        {machine.operations.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-dk-border">
                                                <span className="text-xs text-slate-400 dark:text-dk-muted">{_({ fr: 'OpÃ©rations:', ar: 'Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª:', en: 'Operations:', es: 'Operaciones:', pt: 'OperaÃ§Ãµes:', tr: 'Ä°ÅŸlemler:' })}</span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {machine.operations.map((opName, i) => (
                                                        <span key={i} className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border px-2 py-0.5 rounded text-xs text-slate-600 dark:text-dk-text-soft">{opName}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl p-4 sm:p-5 text-white">
                    <div className="grid grid-cols-3 gap-2 sm:gap-6 text-center">
                        <div>
                            <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">{_({ fr: 'Total Fil/UnitÃ©', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø®ÙŠØ·/ÙˆØ­Ø¯Ø©', en: 'Total Thread/Unit', es: 'Total Hilo/Unidad', pt: 'Total Fio/Unidade', tr: 'Toplam Ä°plik/Birim' })}</p>
                            <p className="text-lg sm:text-3xl font-black mt-1">{grandTotal.totalMetersPerUnit.toFixed(2)}</p>
                            <p className="text-blue-200 text-[10px] sm:text-xs">{_({ fr: 'mÃ¨tres', ar: 'Ø£Ù…ØªØ§Ø±', en: 'meters', es: 'metros', pt: 'metros', tr: 'metre' })}</p>
                        </div>
                        <div>
                            <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">{_({ fr: 'Total GÃ©nÃ©ral', ar: 'Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹ Ø§Ù„ÙƒÙ„ÙŠ', en: 'Grand Total', es: 'Gran Total', pt: 'Total Geral', tr: 'Genel Toplam' })}</p>
                            <p className="text-lg sm:text-3xl font-black mt-1">{formatNumberFr(grandTotal.totalMeters)}</p>
                            <p className="text-blue-200 text-[10px] sm:text-xs">{_({ fr: 'mÃ¨tres', ar: 'Ø£Ù…ØªØ§Ø±', en: 'meters', es: 'metros', pt: 'metros', tr: 'metre' })}</p>
                        </div>
                        <div>
                            <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">{_({ fr: 'Bobines Totales', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¨ÙƒØ±Ø§Øª', en: 'Total Bobbins', es: 'Bobinas Totales', pt: 'Bobinas Totais', tr: 'Toplam Bobin' })}</p>
                            <p className="text-lg sm:text-3xl font-black mt-1">{formatNumberFr(grandTotal.totalBobbins)}</p>
                            <p className="text-blue-200 text-[10px] sm:text-xs">{_({ fr: 'bobines', ar: 'Ø¨ÙƒØ±Ø§Øª', en: 'bobbins', es: 'bobinas', pt: 'bobinas', tr: 'bobin' })} {selectedBobbinSize}m</p>
                        </div>
                    </div>
                </div>

                {colorBreakdown.length > 0 && (
                    <div className="border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden">
                        <div className="bg-purple-50 dark:bg-purple-900/30 p-3 flex items-center gap-2">
                            <span className="font-black text-sm text-purple-700">{_({ fr: 'DÃ‰TAIL PAR COULEUR', ar: 'ØªÙØµÙŠÙ„ Ø­Ø³Ø¨ Ø§Ù„Ù„ÙˆÙ†', en: 'DETAIL BY COLOR', es: 'DETALLE POR COLOR', pt: 'DETALHE POR COR', tr: 'RENKLERE GÃ–RE DETAY' })}</span>
                        </div>
                        <div className="p-4">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs sm:text-sm">
                                    <thead className="bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft text-[10px] sm:text-xs uppercase">
                                        <tr>
                                            <th className="px-1.5 py-1.5 sm:p-2 text-left">{_({ fr: 'Couleur', ar: 'Ø§Ù„Ù„ÙˆÙ†', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' })}</th>
                                            <th className="px-1.5 py-1.5 sm:p-2 text-left">{_({ fr: 'Type', ar: 'Ø§Ù„Ù†ÙˆØ¹', en: 'Type', es: 'Tipo', pt: 'Tipo', tr: 'TÃ¼r' })}</th>
                                            <th className="px-1.5 py-1.5 sm:p-2 text-right">{_({ fr: 'QtÃ©', ar: 'Ø§Ù„ÙƒÙ…ÙŠØ©', en: 'Qty', es: 'Cant', pt: 'Qtde', tr: 'Miktar' })}</th>
                                            <th className="px-1.5 py-1.5 sm:p-2 text-right">{_({ fr: 'Fil Total', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø®ÙŠØ·', en: 'Total Thread', es: 'Hilo Total', pt: 'Fio Total', tr: 'Toplam Ä°plik' })}</th>
                                            <th className="px-1.5 py-1.5 sm:p-2 text-right">{_({ fr: 'Bob.', ar: 'Ø¨ÙƒØ±Ø©', en: 'Bob.', es: 'Bob.', pt: 'Bob.', tr: 'Bob.' })}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                        {colorBreakdown.map((color, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                                <td className="px-1.5 py-1.5 sm:p-2 font-bold text-slate-700 dark:text-dk-text-soft">{color.colorName}</td>
                                                <td className="px-1.5 py-1.5 sm:p-2 text-amber-700 font-mono text-[10px] sm:text-xs break-words">{color.threadType || 'â€”'}</td>
                                                <td className="px-1.5 py-1.5 sm:p-2 text-right tabular-nums text-slate-600 dark:text-dk-text-soft">{formatNumberFr(color.quantity)}</td>
                                                <td className="px-1.5 py-1.5 sm:p-2 text-right tabular-nums text-blue-600 dark:text-blue-400 font-bold">{formatNumberFr(color.threadMeters)} m</td>
                                                <td className="px-1.5 py-1.5 sm:p-2 text-right tabular-nums text-green-600 dark:text-green-400 font-bold">{formatNumberFr(color.bobbins)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
                </>)}
            </div>

            <div className="bg-slate-50 dark:bg-dk-bg border-t p-4 flex items-center justify-between shrink-0">
                <button onClick={onClose} className="px-4 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base text-slate-600 dark:text-dk-text-soft font-bold rounded-xl hover:bg-slate-200 transition-colors" aria-label={_({ fr: 'Annuler et fermer', ar: 'Ø¥Ù„ØºØ§Ø¡ ÙˆØ¥ØºÙ„Ø§Ù‚', en: 'Cancel and close', es: 'Cancelar y cerrar', pt: 'Cancelar e fechar', tr: 'Ä°ptal et ve kapat' })}>
                    {_({ fr: 'Annuler', ar: 'Ø¥Ù„ØºØ§Ø¡', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'Ä°ptal' })}
                </button>
                <button onClick={handleApply} disabled={calcMode === 'poste' ? machineSummary.length === 0 : (!indiceGarment || indiceBobbinsTotal <= 0)} className="px-4 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2" aria-label={`${_({ fr: 'Appliquer', ar: 'ØªØ·Ø¨ÙŠÙ‚', en: 'Apply', es: 'Aplicar', pt: 'Aplicar', tr: 'Uygula' })} ${calcMode === 'poste' ? grandTotal.totalBobbins : indiceBobbinsTotal} ${_({ fr: 'bobines', ar: 'Ø¨ÙƒØ±Ø§Øª', en: 'bobbins', es: 'bobinas', pt: 'bobinas', tr: 'bobin' })}`}>
                    <Check className="w-4 h-4" />
                    {_({ fr: 'Appliquer', ar: 'ØªØ·Ø¨ÙŠÙ‚', en: 'Apply', es: 'Aplicar', pt: 'Aplicar', tr: 'Uygula' })} ({calcMode === 'poste' ? grandTotal.totalBobbins : indiceBobbinsTotal} {_({ fr: 'bobines', ar: 'Ø¨ÙƒØ±Ø§Øª', en: 'bobbins', es: 'bobinas', pt: 'bobinas', tr: 'bobin' })})
                </button>
            </div>
        </div>
        {typeof document !== 'undefined' && createPortal(
            <ThreadPrintView
                effectiveQty={effectiveQty}
                wastePercent={wastePercent}
                selectedBobbinSize={selectedBobbinSize}
                machineSummary={machineSummary}
                colorBreakdown={colorBreakdown}
                opsData={opsData}
                grandTotal={grandTotal}
            />,
            document.body
        )}
        </>
    );
}

// ----- Matrice couleur Ã— opÃ©ration : cellule + popup -----

interface ThreadTypesManagerProps {
    availableThreadTypes: string[];
    threadPrices: Record<string, number>;
    onAdd: (value: string) => void;
    onRename: (oldValue: string, newValue: string) => void;
    onDelete: (value: string) => void;
    onUpdatePrice: (type: string, price: number) => void;
}

/**
 * Gestionnaire des types de fil : bouton Â« Ajouter Â» ouvrant un panneau permettant
 * d'ajouter, renommer et supprimer les types de la liste.
 */
function ThreadTypesManager({ availableThreadTypes, threadPrices, onAdd, onRename, onDelete, onUpdatePrice }: ThreadTypesManagerProps) {
    const { lang } = useLang();
    const _ = useCallback((m: TxMap) => tx(lang, m), [lang]);
    const [open, setOpen] = useState(false);
    const [newInput, setNewInput] = useState('');
    const [editing, setEditing] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const handleAdd = () => {
        const v = newInput.trim();
        if (!v) return;
        onAdd(v);
        setNewInput('');
    };

    const startEdit = (tt: string) => { setEditing(tt); setEditValue(tt); };
    const commitEdit = () => {
        if (editing) onRename(editing, editValue);
        setEditing(null);
        setEditValue('');
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-amber-300 rounded-lg font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 hover:bg-amber-100 transition-colors"
                title={_({ fr: 'GÃ©rer les types de fil (ajouter / modifier / supprimer)', ar: 'Ø¥Ø¯Ø§Ø±Ø© Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ø®ÙŠØ· (Ø¥Ø¶Ø§ÙØ© / ØªØ¹Ø¯ÙŠÙ„ / Ø­Ø°Ù)', en: 'Manage thread types (add / edit / delete)', es: 'Gestionar tipos de hilo (aÃ±adir / modificar / eliminar)', pt: 'Gerenciar tipos de fio (adicionar / editar / excluir)', tr: 'Ä°plik tÃ¼rlerini yÃ¶net (ekle / dÃ¼zenle / sil)' })}
                aria-label={_({ fr: 'GÃ©rer les types de fil', ar: 'Ø¥Ø¯Ø§Ø±Ø© Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ø®ÙŠØ·', en: 'Manage thread types', es: 'Gestionar tipos de hilo', pt: 'Gerenciar tipos de fio', tr: 'Ä°plik tÃ¼rlerini yÃ¶net' })}
                aria-expanded={open}
            >
                <Plus className="w-3.5 h-3.5" />
                {_({ fr: 'Ajouter', ar: 'Ø¥Ø¶Ø§ÙØ©', en: 'Add', es: 'AÃ±adir', pt: 'Adicionar', tr: 'Ekle' })}
                {availableThreadTypes.length > 0 && (
                    <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full ml-1">{availableThreadTypes.length}</span>
                )}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-[60]" onClick={() => { setOpen(false); setEditing(null); }} />
                    <div className="absolute z-[70] top-full mt-2 left-0 md:right-auto w-[min(18rem,calc(100vw-6rem))] md:w-72 bg-white dark:bg-dk-surface border border-amber-200 rounded-xl shadow-xl dark:shadow-dk-elevated p-3 space-y-2">
                        <div className="flex items-center gap-1">
                            <input
                                type="text"
                                value={newInput}
                                onChange={(e) => setNewInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setOpen(false); }}
                                placeholder={_({ fr: 'Nouveau type (ex: Polyester Tex 27)', ar: 'Ù†ÙˆØ¹ Ø¬Ø¯ÙŠØ¯ (Ù…Ø«Ø§Ù„: Ø¨ÙˆÙ„ÙŠØ³ØªØ± Tex 27)', en: 'New type (ex: Polyester Tex 27)', es: 'Nuevo tipo (ej: Polyester Tex 27)', pt: 'Novo tipo (ex: PoliÃ©ster Tex 27)', tr: 'Yeni tÃ¼r (Ã¶r: Polyester Tex 27)' })}
                                className="flex-1 min-w-0 px-2 py-1 text-xs border border-amber-200 rounded-lg font-mono bg-amber-50 dark:bg-amber-900/30/50 outline-none focus:border-amber-500"
                                aria-label={_({ fr: 'Nouveau type de fil', ar: 'Ù†ÙˆØ¹ Ø®ÙŠØ· Ø¬Ø¯ÙŠØ¯', en: 'New thread type', es: 'Nuevo tipo de hilo', pt: 'Novo tipo de fio', tr: 'Yeni iplik tÃ¼rÃ¼' })}
                            />
                            <button type="button" onClick={handleAdd} className="p-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors shrink-0" aria-label={_({ fr: 'Ajouter ce type', ar: 'Ø¥Ø¶Ø§ÙØ© Ù‡Ø°Ø§ Ø§Ù„Ù†ÙˆØ¹', en: 'Add this type', es: 'AÃ±adir este tipo', pt: 'Adicionar este tipo', tr: 'Bu tÃ¼rÃ¼ ekle' })}><Plus className="w-4 h-4" /></button>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 pt-1 border-t border-slate-100 dark:border-dk-border">
                            {availableThreadTypes.length === 0 ? (
                                <p className="text-xs text-slate-400 dark:text-dk-muted text-center py-2">{_({ fr: 'Aucun type de fil', ar: 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù†ÙˆØ¹ Ø®ÙŠØ·', en: 'No thread types', es: 'NingÃºn tipo de hilo', pt: 'Nenhum tipo de fio', tr: 'Ä°plik tÃ¼rÃ¼ yok' })}</p>
                            ) : availableThreadTypes.map(tt => (
                                <div key={tt} className="flex items-center gap-1 p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                    {editing === tt ? (
                                        <>
                                            <input
                                                type="text"
                                                value={editValue}
                                                autoFocus
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditing(null); setEditValue(''); } }}
                                                className="flex-1 min-w-0 px-2 py-1 text-xs border border-amber-300 rounded font-mono bg-amber-50 dark:bg-amber-900/30 outline-none focus:border-amber-500"
                                                aria-label={`${_({ fr: 'Renommer', ar: 'Ø¥Ø¹Ø§Ø¯Ø© ØªØ³Ù…ÙŠØ©', en: 'Rename', es: 'Renombrar', pt: 'Renomear', tr: 'Yeniden adlandÄ±r' })} ${tt}`}
                                            />
                                            <button type="button" onClick={commitEdit} className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 rounded shrink-0" aria-label={_({ fr: 'Confirmer', ar: 'ØªØ£ÙƒÙŠØ¯', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' })}><Check className="w-3.5 h-3.5" /></button>
                                            <button type="button" onClick={() => { setEditing(null); setEditValue(''); }} className="p-1 text-slate-400 dark:text-dk-muted hover:bg-slate-100 rounded shrink-0" aria-label={_({ fr: 'Annuler', ar: 'Ø¥Ù„ØºØ§Ø¡', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'Ä°ptal' })}><X className="w-3.5 h-3.5" /></button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex-1 min-w-0 truncate font-mono text-xs text-slate-700 dark:text-dk-text-soft">{tt}</span>
                                            
                                            {/* Price Input */}
                                            <div className="flex items-center gap-0.5 shrink-0 bg-slate-100/80 rounded-md px-1 py-0.5 mr-1 max-w-[80px]">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={threadPrices[tt] !== undefined ? threadPrices[tt] : ''}
                                                    onChange={(e) => onUpdatePrice(tt, parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                    className="w-10 bg-transparent text-right text-[10px] font-bold text-slate-700 dark:text-dk-text-soft outline-none select-all"
                                                    title={_({ fr: 'Prix unitaire par bobine', ar: 'Ø«Ù…Ù† Ø¨ÙˆØ¨ÙŠÙ†Ø© ÙˆØ§Ø­Ø¯Ø©', en: 'Unit price per bobbin' })}
                                                />
                                                <span className="text-[8px] font-bold text-slate-400 dark:text-dk-muted">DH</span>
                                            </div>
                                            <button type="button" onClick={() => startEdit(tt)} className="p-1 text-slate-400 dark:text-dk-muted hover:text-amber-600 hover:bg-amber-50 rounded shrink-0" title={_({ fr: 'Modifier', ar: 'ØªØ¹Ø¯ÙŠÙ„', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'DÃ¼zenle' })} aria-label={`${_({ fr: 'Modifier', ar: 'ØªØ¹Ø¯ÙŠÙ„', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'DÃ¼zenle' })} ${tt}`}><Pencil className="w-3.5 h-3.5" /></button>
                                            <button type="button" onClick={() => onDelete(tt)} className="p-1 text-slate-400 dark:text-dk-muted hover:text-red-500 hover:bg-red-50 rounded shrink-0" title={_({ fr: 'Supprimer', ar: 'Ø­Ø°Ù', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' })} aria-label={`${_({ fr: 'Supprimer', ar: 'Ø­Ø°Ù', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' })} ${tt}`}><Trash2 className="w-3.5 h-3.5" /></button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

interface ColorThreadCellProps {
    op: OperationThreadData;
    index: number;
    effectiveColors: { id: string; name: string }[];
    availableThreadTypes: string[];
    onToggleColorActive: (index: number, colorId: string) => void;
    onSetColorThreadType: (index: number, colorId: string, value: string) => void;
    onApplyToAll: (index: number, colorId: string) => void;
    onUpdateThreadType: (index: number, value: string) => void;
    onToggleMultiThread: (index: number) => void;
    onSetThreadSlot: (index: number, slot: number, value: string) => void;
}

// Palette stable pour distinguer les types de fil standard sur les cercles.
const SLOT_TYPE_PALETTE = ['#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#0ea5e9', '#ec4899', '#84cc16', '#f97316'];
const MODEL_SLOT_COLOR = '#3b82f6'; // fil Â« couleur modÃ¨le Â»

function slotColor(slotValue: string, availableThreadTypes: string[]): string {
    if (!slotValue) return MODEL_SLOT_COLOR;
    const idx = availableThreadTypes.indexOf(slotValue);
    return SLOT_TYPE_PALETTE[(idx >= 0 ? idx : 0) % SLOT_TYPE_PALETTE.length];
}

/**
 * Ã‰diteur multi-fils : un cercle par fil du poste. On choisit un type (pinceau)
 * puis on clique les cercles pour affecter les fils. La consommation du poste est
 * rÃ©partie Ã  parts Ã©gales entre les fils ; les fils Â« couleur modÃ¨le Â» suivent
 * chaque couleur de la commande, les fils typÃ©s sont standard (toutes couleurs).
 */
function MultiThreadEditor({ op, index, effectiveColors, availableThreadTypes, onSetThreadSlot, onToggleColorActive }: {
    op: OperationThreadData;
    index: number;
    effectiveColors: { id: string; name: string }[];
    availableThreadTypes: string[];
    onSetThreadSlot: (index: number, slot: number, value: string) => void;
    onToggleColorActive: (index: number, colorId: string) => void;
}) {
    const { lang } = useLang();
    const _ = useCallback((m: TxMap) => tx(lang, m), [lang]);
    const [brush, setBrush] = useState('');
    const perThread = op.threadSlots.length > 0 ? op.threadMetersPerUnit / op.threadSlots.length : 0;

    const summary = useMemo(() => {
        const counts: Record<string, number> = {};
        op.threadSlots.forEach(s => { const k = s || _({ fr: 'Couleur modÃ¨le', ar: 'Ù„ÙˆÙ† Ø§Ù„Ù†Ù…ÙˆØ°Ø¬', en: 'Model color', es: 'Color modelo', pt: 'Cor modelo', tr: 'Model rengi' }); counts[k] = (counts[k] || 0) + 1; });
        return Object.entries(counts).map(([k, n]) => `${n} Ã— ${k}`).join(' Â· ');
    }, [op.threadSlots, lang]);

    const chip = (value: string, label: string) => {
        const active = brush === value;
        const color = slotColor(value, availableThreadTypes);
        return (
            <button
                key={value || '__model__'}
                type="button"
                onClick={() => setBrush(value)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium transition-colors ${active ? 'border-slate-700 bg-slate-100 dark:bg-dk-elevated text-slate-800 dark:text-dk-text' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted hover:border-slate-400'}`}
                title={value ? `${_({ fr: 'Pinceau :', ar: 'ÙØ±Ø´Ø§Ø©:', en: 'Brush:', es: 'Pincel:', pt: 'Pincel:', tr: 'FÄ±rÃ§a:' })} ${label} (${_({ fr: 'fil standard, toutes couleurs', ar: 'Ø®ÙŠØ· Ù‚ÙŠØ§Ø³ÙŠØŒ ÙƒÙ„ Ø§Ù„Ø£Ù„ÙˆØ§Ù†', en: 'standard thread, all colors', es: 'hilo estÃ¡ndar, todos los colores', pt: 'fio padrÃ£o, todas as cores', tr: 'standart iplik, tÃ¼m renkler' })})` : `${_({ fr: 'Pinceau : fil couleur modÃ¨le (suit chaque couleur de la commande)', ar: 'ÙØ±Ø´Ø§Ø©: Ø®ÙŠØ· Ù„ÙˆÙ† Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ (ÙŠØªØ¨Ø¹ ÙƒÙ„ Ù„ÙˆÙ† Ù…Ù† Ø§Ù„Ø·Ù„Ø¨ÙŠØ©)', en: 'Brush: model color thread (follows each order color)', es: 'Pincel: hilo color modelo (sigue cada color del pedido)', pt: 'Pincel: fio cor modelo (segue cada cor do pedido)', tr: 'FÄ±rÃ§a: model rengi iplik (her sipariÅŸ rengini takip eder)' })}`}
                aria-pressed={active}
            >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="truncate max-w-[90px]">{label}</span>
            </button>
        );
    };

    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
                {chip('', _({ fr: 'Couleur modÃ¨le', ar: 'Ù„ÙˆÙ† Ø§Ù„Ù†Ù…ÙˆØ°Ø¬', en: 'Model color', es: 'Color modelo', pt: 'Cor modelo', tr: 'Model rengi' }))}
                {availableThreadTypes.map(tt => chip(tt, tt))}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
                {op.threadSlots.map((s, i) => (
                    <button
                        key={i}
                        type="button"
                        onClick={() => onSetThreadSlot(index, i, brush)}
                        className="w-5 h-5 rounded-full border-2 border-white shadow ring-1 ring-slate-200 transition-transform hover:scale-110"
                        style={{ backgroundColor: slotColor(s, availableThreadTypes) }}
                        title={`${_({ fr: 'Fil', ar: 'Ø®ÙŠØ·', en: 'Thread', es: 'Hilo', pt: 'Fio', tr: 'Ä°plik' })} ${i + 1} : ${s || _({ fr: 'Couleur modÃ¨le', ar: 'Ù„ÙˆÙ† Ø§Ù„Ù†Ù…ÙˆØ°Ø¬', en: 'Model color', es: 'Color modelo', pt: 'Cor modelo', tr: 'Model rengi' })}${perThread > 0 ? ` (â‰ˆ ${perThread.toFixed(2)} m/pc)` : ''} â€” ${_({ fr: 'cliquer pour affecter', ar: 'Ø§Ù†Ù‚Ø± Ù„ØªØ¹ÙŠÙŠÙ†', en: 'click to assign', es: 'clic para asignar', pt: 'clique para atribuir', tr: 'atamak iÃ§in tÄ±klayÄ±n' })} Â« ${brush || _({ fr: 'Couleur modÃ¨le', ar: 'Ù„ÙˆÙ† Ø§Ù„Ù†Ù…ÙˆØ°Ø¬', en: 'Model color', es: 'Color modelo', pt: 'Cor modelo', tr: 'Model rengi' })} Â»`}
                        aria-label={`${_({ fr: 'Fil', ar: 'Ø®ÙŠØ·', en: 'Thread', es: 'Hilo', pt: 'Fio', tr: 'Ä°plik' })} ${i + 1} ${_({ fr: 'de l\'opÃ©ration', ar: 'Ù…Ù† Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'of operation', es: 'de la operaciÃ³n', pt: 'da operaÃ§Ã£o', tr: 'iÅŸleminin' })} ${op.operation.order} : ${s || _({ fr: 'couleur modÃ¨le', ar: 'Ù„ÙˆÙ† Ø§Ù„Ù†Ù…ÙˆØ°Ø¬', en: 'model color', es: 'color modelo', pt: 'cor modelo', tr: 'model rengi' })}`}
                    />
                ))}
                <span className="text-[10px] text-slate-400 dark:text-dk-muted ml-0.5">{op.threadSlots.length} {_({ fr: 'fils', ar: 'Ø®ÙŠÙˆØ·', en: 'threads', es: 'hilos', pt: 'fios', tr: 'iplik' })}</span>
            </div>

            <p className="text-[10px] text-slate-500 dark:text-dk-muted leading-tight">{summary}</p>

            {availableThreadTypes.length === 0 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">{_({ fr: 'Ajoutez des types de fil (bouton Â« TYPE FIL Â» en haut) pour affecter les cercles.', ar: 'Ø£Ø¶Ù Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ø®ÙŠØ· (Ø²Ø± Â«Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ·Â» Ø¨Ø§Ù„Ø£Ø¹Ù„Ù‰) Ù„ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø¯ÙˆØ§Ø¦Ø±.', en: 'Add thread types (the "THREAD TYPE" button above) to assign the circles.', es: 'AÃ±ada tipos de hilo (botÃ³n "TIPO HILO" arriba) para asignar los cÃ­rculos.', pt: 'Adicione tipos de fio (botÃ£o "TIPO FIO" acima) para atribuir os cÃ­rculos.', tr: 'Daireleri atamak iÃ§in iplik tÃ¼rleri ekleyin (yukarÄ±daki "Ä°PLÄ°K TÃœRÃœ" dÃ¼ÄŸmesi).' })}</p>
            )}

            {effectiveColors.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5 border-t border-slate-100 dark:border-dk-border">
                    {effectiveColors.map(c => {
                        const ct = op.colorThreads[c.id] || { active: true, threadType: '' };
                        return (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => onToggleColorActive(index, c.id)}
                                className={`px-1.5 py-0.5 rounded-full border text-[10px] transition-colors ${ct.active ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-400 dark:text-dk-muted line-through'}`}
                                title={ct.active ? `${c.name} : ${_({ fr: 'utilisÃ©e dans cette opÃ©ration', ar: 'Ù…Ø³ØªØ®Ø¯Ù…Ø© ÙÙŠ Ù‡Ø°Ù‡ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'used in this operation', es: 'usada en esta operaciÃ³n', pt: 'usada nesta operaÃ§Ã£o', tr: 'bu iÅŸlemde kullanÄ±lan' })}` : `${c.name} : ${_({ fr: 'non utilisÃ©e ici', ar: 'ØºÙŠØ± Ù…Ø³ØªØ®Ø¯Ù…Ø© Ù‡Ù†Ø§', en: 'not used here', es: 'no usada aquÃ­', pt: 'nÃ£o usada aqui', tr: 'burada kullanÄ±lmÄ±yor' })}`}
                                aria-pressed={ct.active}
                            >
                                {c.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/**
 * Cellule de la colonne Â« Type Fil Â», affichÃ©e DIRECTEMENT dans la ligne de l'opÃ©ration.
 * - Sans couleurs : sÃ©lecteur simple (comportement historique, fil par opÃ©ration).
 * - Avec couleurs : une ligne par couleur â†’ on/off + type de fil + Â« appliquer Ã  toutes les opÃ©rations Â».
 */
function ColorThreadCell({
    op, index, effectiveColors, availableThreadTypes,
    onToggleColorActive, onSetColorThreadType, onApplyToAll, onUpdateThreadType,
    onToggleMultiThread, onSetThreadSlot,
}: ColorThreadCellProps) {
    const { lang } = useLang();
    const _ = useCallback((m: TxMap) => tx(lang, m), [lang]);
    const multiToggle = (
        <button
            type="button"
            onClick={() => onToggleMultiThread(index)}
            className={`self-start flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold transition-colors ${op.multiThread ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/30 text-blue-700' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-400 dark:text-dk-muted hover:border-blue-300 hover:text-blue-600'}`}
            title={`${_({ fr: 'Mode multi-fils : rÃ©partir les', ar: 'ÙˆØ¶Ø¹ Ù…ØªØ¹Ø¯Ø¯ Ø§Ù„Ø®ÙŠÙˆØ·: ØªÙˆØ²ÙŠØ¹', en: 'Multi-thread mode: distribute the', es: 'Modo multi-hilo: repartir los', pt: 'Modo multi-fio: distribuir os', tr: 'Ã‡ok iplik modu: daÄŸÄ±t' })} ${op.threadSlots.length} ${_({ fr: 'fils du poste entre couleur modÃ¨le et types standard (consommation divisÃ©e Ã  parts Ã©gales)', ar: 'Ø®ÙŠØ· Ù…Ù† Ø§Ù„Ù…Ø­Ø·Ø© Ø¨ÙŠÙ† Ù„ÙˆÙ† Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ ÙˆØ§Ù„Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ù‚ÙŠØ§Ø³ÙŠØ© (Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ Ù…Ù‚Ø³Ù… Ø¨Ø§Ù„ØªØ³Ø§ÙˆÙŠ)', en: 'station threads between model color and standard types (consumption divided equally)', es: 'hilos del puesto entre color modelo y tipos estÃ¡ndar (consumo dividido a partes iguales)', pt: 'fios do posto entre cor modelo e tipos padrÃ£o (consumo dividido igualmente)', tr: 'poste ipliklerini model rengi ve standart tÃ¼rler arasÄ±nda (tÃ¼ketim eÅŸit bÃ¶lÃ¼nÃ¼r)' })}`}
            aria-pressed={op.multiThread}
            aria-label={`${_({ fr: 'Mode multi-fils pour opÃ©ration', ar: 'ÙˆØ¶Ø¹ Ù…ØªØ¹Ø¯Ø¯ Ø§Ù„Ø®ÙŠÙˆØ· Ù„Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Multi-thread mode for operation', es: 'Modo multi-hilo para operaciÃ³n', pt: 'Modo multi-fio para operaÃ§Ã£o', tr: 'Ä°ÅŸlem iÃ§in Ã§ok iplik modu' })} ${op.operation.order}`}
        >
            <span className="flex items-center -space-x-0.5">
                {op.threadSlots.slice(0, 4).map((s, i) => (
                    <span key={i} className="w-2 h-2 rounded-full border border-white" style={{ backgroundColor: op.multiThread ? slotColor(s, availableThreadTypes) : '#cbd5e1' }} />
                ))}
            </span>
            {op.threadSlots.length} {_({ fr: 'fils', ar: 'Ø®ÙŠÙˆØ·', en: 'threads', es: 'hilos', pt: 'fios', tr: 'iplik' })}
        </button>
    );

    if (op.multiThread) {
        return (
            <div className="flex flex-col gap-1 min-w-[200px]">
                {multiToggle}
                <MultiThreadEditor
                    op={op}
                    index={index}
                    effectiveColors={effectiveColors}
                    availableThreadTypes={availableThreadTypes}
                    onSetThreadSlot={onSetThreadSlot}
                    onToggleColorActive={onToggleColorActive}
                />
            </div>
        );
    }

    if (effectiveColors.length === 0) {
        return (
            <div className="flex flex-col gap-1">
                {multiToggle}
                <select
                    value={op.threadType}
                    onChange={(e) => onUpdateThreadType(index, e.target.value)}
                    className="w-36 px-2 py-1 text-xs font-mono bg-amber-50 dark:bg-amber-900/30/30 text-amber-700 border border-amber-100 rounded-lg outline-none focus:border-amber-500 transition-colors"
                    title={_({ fr: 'Type de fil utilisÃ© pour cette opÃ©ration', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ· Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ù„Ù‡Ø°Ù‡ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Thread type used for this operation', es: 'Tipo de hilo usado para esta operaciÃ³n', pt: 'Tipo de fio usado para esta operaÃ§Ã£o', tr: 'Bu iÅŸlem iÃ§in kullanÄ±lan iplik tÃ¼rÃ¼' })}
                    aria-label={`${_({ fr: 'Type de fil pour opÃ©ration', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ· Ù„Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'Thread type for operation', es: 'Tipo de hilo para operaciÃ³n', pt: 'Tipo de fio para operaÃ§Ã£o', tr: 'Ä°ÅŸlem iÃ§in iplik tÃ¼rÃ¼' })} ${op.operation.order}`}
                >
                    <option value="">{_({ fr: 'â€” type fil â€”', ar: 'â€” Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ· â€”', en: 'â€” thread type â€”', es: 'â€” tipo hilo â€”', pt: 'â€” tipo fio â€”', tr: 'â€” iplik tÃ¼rÃ¼ â€”' })}</option>
                    {availableThreadTypes.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                </select>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1 min-w-[200px]">
            {multiToggle}
            {effectiveColors.map(c => {
                const ct = op.colorThreads[c.id] || { active: true, threadType: '' };
                return (
                    <div key={c.id} className={`flex items-center gap-1 ${ct.active ? '' : 'opacity-50'}`}>
                        <button
                            type="button"
                            onClick={() => onToggleColorActive(index, c.id)}
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${ct.active ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'}`}
                            title={ct.active ? `${c.name} : ${_({ fr: 'utilisÃ©e dans cette opÃ©ration', ar: 'Ù…Ø³ØªØ®Ø¯Ù…Ø© ÙÙŠ Ù‡Ø°Ù‡ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'used in this operation', es: 'usada en esta operaciÃ³n', pt: 'usada nesta operaÃ§Ã£o', tr: 'bu iÅŸlemde kullanÄ±lan' })}` : `${c.name} : ${_({ fr: 'non utilisÃ©e ici', ar: 'ØºÙŠØ± Ù…Ø³ØªØ®Ø¯Ù…Ø© Ù‡Ù†Ø§', en: 'not used here', es: 'no usada aquÃ­', pt: 'nÃ£o usada aqui', tr: 'burada kullanÄ±lmÄ±yor' })}`}
                            aria-pressed={ct.active}
                            aria-label={`${_({ fr: 'Activer', ar: 'ØªÙØ¹ÙŠÙ„', en: 'Activate', es: 'Activar', pt: 'Ativar', tr: 'EtkinleÅŸtir' })} ${c.name} ${_({ fr: 'pour opÃ©ration', ar: 'Ù„Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'for operation', es: 'para operaciÃ³n', pt: 'para operaÃ§Ã£o', tr: 'iÅŸlemi iÃ§in' })} ${op.operation.order}`}
                        >
                            {ct.active && <Check className="w-2.5 h-2.5" />}
                        </button>
                        <span className="text-[10px] text-slate-500 dark:text-dk-muted w-12 truncate shrink-0" title={c.name}>{c.name}</span>
                        <select
                            value={ct.threadType}
                            onChange={(e) => onSetColorThreadType(index, c.id, e.target.value)}
                            disabled={!ct.active}
                            className="flex-1 min-w-0 px-1 py-0.5 text-[11px] font-mono bg-amber-50 dark:bg-amber-900/30/30 text-amber-700 border border-amber-100 rounded outline-none focus:border-amber-500 transition-colors disabled:opacity-40"
                            title={`${_({ fr: 'Type de fil pour', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ· Ù„Ù€', en: 'Thread type for', es: 'Tipo de hilo para', pt: 'Tipo de fio para', tr: 'Ä°plik tÃ¼rÃ¼' })} ${c.name} (${_({ fr: 'vide = mÃªme fil que l\'opÃ©ration', ar: 'ÙØ§Ø±Øº = Ù†ÙØ³ Ø®ÙŠØ· Ø§Ù„Ø¹Ù…Ù„ÙŠØ©', en: 'empty = same thread as operation', es: 'vacÃ­o = mismo hilo que la operaciÃ³n', pt: 'vazio = mesmo fio da operaÃ§Ã£o', tr: 'boÅŸ = iÅŸlemle aynÄ± iplik' })})`}
                            aria-label={`${_({ fr: 'Type de fil', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ·', en: 'Thread type', es: 'Tipo de hilo', pt: 'Tipo de fio', tr: 'Ä°plik tÃ¼rÃ¼' })} ${c.name} ${_({ fr: 'opÃ©ration', ar: 'Ø¹Ù…Ù„ÙŠØ©', en: 'operation', es: 'operaciÃ³n', pt: 'operaÃ§Ã£o', tr: 'iÅŸlem' })} ${op.operation.order}`}
                        >
                            <option value="">{_({ fr: 'â€” fil â€”', ar: 'â€” Ø®ÙŠØ· â€”', en: 'â€” thread â€”', es: 'â€” hilo â€”', pt: 'â€” fio â€”', tr: 'â€” iplik â€”' })}</option>
                            {availableThreadTypes.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                        </select>
                        <button
                            type="button"
                            onClick={() => onApplyToAll(index, c.id)}
                            className="p-0.5 text-slate-300 dark:text-dk-muted hover:text-amber-600 shrink-0 transition-colors"
                            title={`${_({ fr: 'Appliquer', ar: 'ØªØ·Ø¨ÙŠÙ‚', en: 'Apply', es: 'Aplicar', pt: 'Aplicar', tr: 'Uygula' })} ${c.name} (on/off + fil) ${_({ fr: 'Ã  toutes les opÃ©rations', ar: 'Ù„ÙƒÙ„ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª', en: 'to all operations', es: 'a todas las operaciones', pt: 'a todas as operaÃ§Ãµes', tr: 'tÃ¼m iÅŸlemlere' })}`}
                            aria-label={`${_({ fr: 'Appliquer', ar: 'ØªØ·Ø¨ÙŠÙ‚', en: 'Apply', es: 'Aplicar', pt: 'Aplicar', tr: 'Uygula' })} ${c.name} ${_({ fr: 'Ã  toutes les opÃ©rations', ar: 'Ù„ÙƒÙ„ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª', en: 'to all operations', es: 'a todas las operaciones', pt: 'a todas as operaÃ§Ãµes', tr: 'tÃ¼m iÅŸlemlere' })}`}
                        >
                            <Copy className="w-3 h-3" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

// Helper functions
function extractCodeFromClass(className: string): string | null {
    if (!className) return null;
    // Check if it's already just a code like "514", "301", "BR"
    const directCode = className.trim().toUpperCase();
    if (/^\d{3}$/.test(directCode) || /^(BR|ZIGZAG|MAN|FER)$/.test(directCode)) {
        return directCode;
    }
    // Try to extract from parentheses like "Piqueuse Plate (301)"
    const match = className.match(/\((\d+)\)/);
    return match ? match[1] : null;
}

function findStitchTypeByMachineCode(code: string): StitchType | null {
    if (!code) return null;

    const cleanCode = code.trim().toUpperCase();

    // Direct match by machineCode
    const directMatch = STITCH_TYPES.find(st => st.machineCode === cleanCode);
    if (directMatch) return directMatch;

    // Match by ISO number
    const isoMatch = STITCH_TYPES.find(st => st.isoNumber.toString() === cleanCode);
    if (isoMatch) return isoMatch;

    // Match by partial code
    const partialMatch = STITCH_TYPES.find(st => cleanCode.startsWith(st.machineCode || ''));
    if (partialMatch) return partialMatch;

    // Specific mappings for common codes
    const codeMap: Record<string, string> = {
        '514': 'SURJET_4F',
        '516': 'SECURITE_5F_CHAINETTE',
        '504': 'SURJET_3F_504',
        '301': 'NOUE',
        '304': 'ZIGZAG_5',
        '402': 'CHAINETTE_3F',
        '256': 'RECOUV_3AIG',
        '602': 'RECOUV_602_3',
        '107': 'BOUTONNIERE_2F',
        '101': 'CHAINETTE_1F',
        'BR': 'BRIDE_NOUE',
        'ZIGZAG': 'ZIGZAG_5',
        'MAN': 'CHAINETTE_1F',
        'FER': 'NOUE',
        '401': 'CHAINETTE_2F',
        '606': 'FLATLOCK',
        '304B': 'BOUTONNIERE_LINGERIE_N',
        'BT+BR': 'BOUTONNIERE_2F',
    };

    const mappedCode = codeMap[cleanCode];
    if (mappedCode) {
        return STITCH_TYPES.find(st => st.code === mappedCode) || null;
    }

    return null;
}

interface ThreadPrintViewProps {
    effectiveQty: number;
    wastePercent: number;
    selectedBobbinSize: number;
    machineSummary: any[];
    colorBreakdown: any[];
    opsData: OperationThreadData[];
    grandTotal: { totalMeters: number; totalBobbins: number; totalMetersPerUnit: number };
}

function ThreadPrintView({
    effectiveQty,
    wastePercent,
    selectedBobbinSize,
    machineSummary,
    colorBreakdown,
    opsData,
    grandTotal,
}: ThreadPrintViewProps) {
    const { lang } = useLang();
    const _ = useCallback((m: TxMap) => tx(lang, m), [lang]);
    return (
        <div className="thread-print-root p-8">
            <style dangerouslySetInnerHTML={{ __html: `
                .thread-print-root {
                    display: none;
                }
                @media print {
                    @page { size: A4; margin: 15mm 15mm 15mm 15mm; }
                    body > *:not(.thread-print-root) {
                        display: none !important;
                    }
                    .thread-print-root {
                        display: block !important;
                        position: relative;
                        width: 100%;
                        background: white;
                        color: black;
                        font-family: system-ui, -apple-system, sans-serif;
                    }
                    .print-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 15px;
                        margin-bottom: 25px;
                    }
                    .print-table th, .print-table td {
                        border: 1px solid #e2e8f0;
                        padding: 8px 12px;
                        text-align: left;
                        font-size: 12px;
                    }
                    .print-table th {
                        background-color: #f8fafc;
                        font-weight: bold;
                        color: #1e293b;
                    }
                    .print-header {
                        border-bottom: 2px solid #2563eb;
                        padding-bottom: 15px;
                        margin-bottom: 25px;
                    }
                    .print-totals-box {
                        background-color: #f1f5f9;
                        border: 1px solid #cbd5e1;
                        border-radius: 8px;
                        padding: 15px;
                        margin-top: 25px;
                        margin-bottom: 25px;
                    }
                }
            ` }} />

            <div className="print-header flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-dk-text tracking-tight">{_({ fr: 'RAPPORT DE CONSOMMATION DE FIL', ar: 'ØªÙ‚Ø±ÙŠØ± Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ Ø§Ù„Ø®ÙŠØ·', en: 'THREAD CONSUMPTION REPORT', es: 'INFORME DE CONSUMO DE HILO', pt: 'RELATÃ“RIO DE CONSUMO DE FIO', tr: 'Ä°PLÄ°K TÃœKETÄ°M RAPORU' })}</h1>
                    <p className="text-sm text-slate-500 dark:text-dk-muted font-medium mt-1">{_({ fr: 'GÃ©nÃ©rÃ© le', ar: 'ØªÙ… Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡ ÙÙŠ', en: 'Generated on', es: 'Generado el', pt: 'Gerado em', tr: 'OluÅŸturulma' })} {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="text-right text-xs text-slate-500 dark:text-dk-muted space-y-1">
                    <p><span className="font-bold">BERAMETHODE</span></p>
                    <p>{_({ fr: 'Atelier MÃ©thodes', ar: 'ÙˆØ±Ø´Ø© Ø§Ù„Ø·Ø±Ù‚', en: 'Methods Workshop', es: 'Taller de MÃ©todos', pt: 'Oficina de MÃ©todos', tr: 'Metot AtÃ¶lyesi' })}</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6 border border-slate-200 dark:border-dk-border rounded-lg p-4 bg-slate-50 dark:bg-dk-bg/50">
                <div>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider">{_({ fr: 'QuantitÃ© Commande', ar: 'ÙƒÙ…ÙŠØ© Ø§Ù„Ø·Ù„Ø¨', en: 'Order Quantity', es: 'Cantidad Pedido', pt: 'Quantidade Pedido', tr: 'SipariÅŸ MiktarÄ±' })}</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-dk-text">{formatNumberFr(effectiveQty)} {_({ fr: 'piÃ¨ces', ar: 'Ù‚Ø·Ø¹Ø©', en: 'pieces', es: 'piezas', pt: 'peÃ§as', tr: 'adet' })}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider">{_({ fr: 'HumiditÃ© / Usure', ar: 'Ø§Ù„Ø±Ø·ÙˆØ¨Ø© / Ø§Ù„ØªØ¢ÙƒÙ„', en: 'Humidity / Waste', es: 'Humedad / Desperdicio', pt: 'Umidade / DesperdÃ­cio', tr: 'Nem / AtÄ±k' })}</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-dk-text">+{wastePercent}%</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider">{_({ fr: 'Taille de Bobine', ar: 'Ø­Ø¬Ù… Ø§Ù„Ø¨ÙƒØ±Ø©', en: 'Bobbin Size', es: 'TamaÃ±o Bobina', pt: 'Tamanho Bobina', tr: 'Bobin Boyutu' })}</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-dk-text">{formatNumberFr(selectedBobbinSize)} m</p>
                </div>
            </div>

            <h2 className="text-base font-bold text-slate-800 dark:text-dk-text mb-2 uppercase tracking-wide border-b pb-1">{_({ fr: '1. RÃ©capitulatif par Machine', ar: '1. Ù…Ù„Ø®Øµ Ø­Ø³Ø¨ Ø§Ù„Ø¢Ù„Ø©', en: '1. Summary by Machine', es: '1. Resumen por MÃ¡quina', pt: '1. Resumo por MÃ¡quina', tr: '1. Makineye GÃ¶re Ã–zet' })}</h2>
            <table className="print-table">
                <thead>
                    <tr>
                        <th>{_({ fr: 'Machine', ar: 'Ø¢Ù„Ø©', en: 'Machine', es: 'MÃ¡quina', pt: 'MÃ¡quina', tr: 'Makine' })}</th>
                        <th>{_({ fr: 'Code', ar: 'Ø§Ù„ÙƒÙˆØ¯', en: 'Code', es: 'CÃ³digo', pt: 'CÃ³digo', tr: 'Kod' })}</th>
                        <th>{_({ fr: 'Fils', ar: 'Ø®ÙŠÙˆØ·', en: 'Threads', es: 'Hilos', pt: 'Fios', tr: 'Ä°plik' })}</th>
                        <th className="text-right">{_({ fr: 'MÃ¨tres / PiÃ¨ce', ar: 'Ø£Ù…ØªØ§Ø± / Ù‚Ø·Ø¹Ø©', en: 'Meters / Piece', es: 'Metros / Pieza', pt: 'Metros / PeÃ§a', tr: 'Metre / Adet' })}</th>
                        <th className="text-right">{_({ fr: 'MÃ¨tres Totaux', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø£Ù…ØªØ§Ø±', en: 'Total Meters', es: 'Metros Totales', pt: 'Metros Totais', tr: 'Toplam Metre' })}</th>
                        <th className="text-right">{_({ fr: 'MÃ¨tres (+', ar: 'Ø£Ù…ØªØ§Ø± (+', en: 'Meters (+', es: 'Metros (+', pt: 'Metros (+', tr: 'Metre (+' })}{wastePercent}%)</th>
                        <th className="text-right">{_({ fr: 'Bobines Requises', ar: 'Ø§Ù„Ø¨ÙƒØ±Ø§Øª Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©', en: 'Required Bobbins', es: 'Bobinas Requeridas', pt: 'Bobinas NecessÃ¡rias', tr: 'Gerekli Bobinler' })}</th>
                    </tr>
                </thead>
                <tbody>
                    {machineSummary.map((m, idx) => (
                        <tr key={idx}>
                            <td className="font-bold">{m.machineLabel}</td>
                            <td className="font-mono text-slate-500 dark:text-dk-muted">{m.machineCode}</td>
                            <td>{m.threadCount} {_({ fr: 'fils', ar: 'Ø®ÙŠÙˆØ·', en: 'threads', es: 'hilos', pt: 'fios', tr: 'iplik' })}</td>
                            <td className="text-right font-mono">{m.threadMetersPerUnit.toFixed(2)} m</td>
                            <td className="text-right font-mono">{formatNumberFr(m.totalMeters, 2, 2)} m</td>
                            <td className="text-right font-mono font-bold text-amber-700">{formatNumberFr(Math.ceil(m.totalMeters * (1 + wastePercent / 100)))} m</td>
                            <td className="text-right font-bold text-emerald-700">{formatNumberFr(m.totalBobbins)} {_({ fr: 'bob', ar: 'Ø¨ÙƒØ±Ø©', en: 'bob', es: 'bob', pt: 'bob', tr: 'bob' })}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {colorBreakdown.length > 0 && (
                <>
                    <h2 className="text-base font-bold text-slate-800 dark:text-dk-text mb-2 uppercase tracking-wide border-b pb-1">{_({ fr: '2. DÃ©tail par Couleur', ar: '2. ØªÙØµÙŠÙ„ Ø­Ø³Ø¨ Ø§Ù„Ù„ÙˆÙ†', en: '2. Detail by Color', es: '2. Detalle por Color', pt: '2. Detalhe por Cor', tr: '2. Renklere GÃ¶re Detay' })}</h2>
                    <table className="print-table">
                        <thead>
                            <tr>
                                <th>{_({ fr: 'Couleur', ar: 'Ø§Ù„Ù„ÙˆÙ†', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' })}</th>
                                <th>{_({ fr: 'Type Fil', ar: 'Ù†ÙˆØ¹ Ø§Ù„Ø®ÙŠØ·', en: 'Thread Type', es: 'Tipo Hilo', pt: 'Tipo Fio', tr: 'Ä°plik TÃ¼rÃ¼' })}</th>
                                <th className="text-right">{_({ fr: 'QuantitÃ© PiÃ¨ces', ar: 'Ø¹Ø¯Ø¯ Ø§Ù„Ù‚Ø·Ø¹', en: 'Piece Quantity', es: 'Cantidad Piezas', pt: 'Quantidade PeÃ§as', tr: 'Adet MiktarÄ±' })}</th>
                                <th className="text-right">{_({ fr: 'MÃ¨tres Totaux', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø£Ù…ØªØ§Ø±', en: 'Total Meters', es: 'Metros Totales', pt: 'Metros Totais', tr: 'Toplam Metre' })}</th>
                                <th className="text-right">{_({ fr: 'Bobines', ar: 'Ø¨ÙƒØ±Ø§Øª', en: 'Bobbins', es: 'Bobinas', pt: 'Bobinas', tr: 'Bobinler' })} ({selectedBobbinSize}m)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {colorBreakdown.map((color, idx) => (
                                <tr key={idx}>
                                    <td className="font-bold">{color.colorName}</td>
                                    <td>{color.threadType || 'â€”'}</td>
                                    <td className="text-right">{formatNumberFr(color.quantity)}</td>
                                    <td className="text-right font-mono">{formatNumberFr(color.threadMeters, 2, 2)} m</td>
                                    <td className="text-right font-bold text-emerald-700">{formatNumberFr(color.bobbins)} {_({ fr: 'bob', ar: 'Ø¨ÙƒØ±Ø©', en: 'bob', es: 'bob', pt: 'bob', tr: 'bob' })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            <div className="print-totals-box">
                <div className="grid grid-cols-3 gap-6 text-center font-bold">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-widest">{_({ fr: 'Total MÃ¨tres / PiÃ¨ce', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø£Ù…ØªØ§Ø± / Ù‚Ø·Ø¹Ø©', en: 'Total Meters / Piece', es: 'Total Metros / Pieza', pt: 'Total Metros / PeÃ§a', tr: 'Toplam Metre / Adet' })}</p>
                        <p className="text-2xl text-slate-800 dark:text-dk-text mt-1">{grandTotal.totalMetersPerUnit.toFixed(2)} m</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-widest">{_({ fr: 'Total MÃ¨tres Global', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø£Ù…ØªØ§Ø± Ø§Ù„ÙƒÙ„ÙŠ', en: 'Total Global Meters', es: 'Total Metros Global', pt: 'Total Metros Global', tr: 'Genel Toplam Metre' })}</p>
                        <p className="text-2xl text-blue-700 mt-1">{formatNumberFr(grandTotal.totalMeters, 2, 2)} m</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-widest">{_({ fr: 'Total Bobines Requises', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¨ÙƒØ±Ø§Øª Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©', en: 'Total Required Bobbins', es: 'Total Bobinas Requeridas', pt: 'Total Bobinas NecessÃ¡rias', tr: 'Toplam Gerekli Bobin' })}</p>
                        <p className="text-2xl text-emerald-700 mt-1">{formatNumberFr(grandTotal.totalBobbins)} {_({ fr: 'bobines', ar: 'Ø¨ÙƒØ±Ø§Øª', en: 'bobbins', es: 'bobinas', pt: 'bobinas', tr: 'bobin' })}</p>
                    </div>
                </div>
            </div>

            <h2 className="text-base font-bold text-slate-800 dark:text-dk-text mb-2 uppercase tracking-wide border-b pb-1 mt-6">
                {colorBreakdown.length > 0 ? '3.' : '2.'} {_({ fr: 'Liste des OpÃ©rations SÃ©lectionnÃ©es', ar: 'Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©', en: 'List of Selected Operations', es: 'Lista de Operaciones Seleccionadas', pt: 'Lista de OperaÃ§Ãµes Selecionadas', tr: 'SeÃ§ilen Ä°ÅŸlemlerin Listesi' })}
            </h2>
            <table className="print-table">
                <thead>
                    <tr>
                        <th className="w-12">NÂ°</th>
                        <th>{_({ fr: 'Description', ar: 'Ø§Ù„ÙˆØµÙ', en: 'Description', es: 'DescripciÃ³n', pt: 'DescriÃ§Ã£o', tr: 'AÃ§Ä±klama' })}</th>
                        <th>{_({ fr: 'Machine', ar: 'Ø¢Ù„Ø©', en: 'Machine', es: 'MÃ¡quina', pt: 'MÃ¡quina', tr: 'Makine' })}</th>
                        <th>{_({ fr: 'Type Point', ar: 'Ù†ÙˆØ¹ Ø§Ù„ØºØ±Ø²Ø©', en: 'Stitch Type', es: 'Tipo Puntada', pt: 'Tipo Ponto', tr: 'DikiÅŸ TÃ¼rÃ¼' })}</th>
                        <th className="text-center">{_({ fr: 'L / QtÃ© (cm/pc)', ar: 'Ø§Ù„Ø·ÙˆÙ„ / Ø§Ù„ÙƒÙ…ÙŠØ© (Ø³Ù…/Ù‚Ø·Ø¹Ø©)', en: 'L / Qty (cm/pc)', es: 'L / Cant (cm/pz)', pt: 'Comp / Qtde (cm/pÃ§)', tr: 'Uzunluk / Miktar (cm/adet)' })}</th>
                        <th className="text-right">{_({ fr: 'Conso/M', ar: 'Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ/Ù…', en: 'Cons./M', es: 'Cons./M', pt: 'Cons./M', tr: 'TÃ¼k./M' })}</th>
                        <th className="text-right">{_({ fr: 'MÃ¨tres/Unit', ar: 'Ù…ØªØ±/ÙˆØ­Ø¯Ø©', en: 'Meters/Unit', es: 'Metros/Unidad', pt: 'Metros/Unidade', tr: 'Metre/Birim' })}</th>
                    </tr>
                </thead>
                <tbody>
                    {opsData.filter(op => op.selected).map((op) => (
                        <tr key={op.operation.id}>
                            <td className="font-bold">{op.operation.order}</td>
                            <td>{op.operation.description || 'â€”'}</td>
                            <td>{op.machineRaw || 'â€”'}</td>
                            <td className="text-xs text-slate-600 dark:text-dk-text-soft">{op.stitchType?.name || _({ fr: 'Non dÃ©fini', ar: 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯', en: 'Undefined', es: 'No definido', pt: 'NÃ£o definido', tr: 'TanÄ±msÄ±z' })}</td>
                            <td className="text-center font-mono">{op.lengthCm} {op.isPerPiece ? _({ fr: 'pc', ar: 'Ù‚Ø·Ø¹Ø©', en: 'pc', es: 'pz', pt: 'pÃ§', tr: 'ad' }) : 'cm'}</td>
                            <td className="text-right font-mono">{op.consumptionFactor.toFixed(2)}</td>
                            <td className="text-right font-mono font-bold text-blue-600 dark:text-blue-400">{op.threadMetersPerUnit.toFixed(2)} m</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-dashed border-slate-300">
                <div className="text-center">
                    <p className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest">{_({ fr: 'Visa MÃ©thodes', ar: 'ØªÙˆÙ‚ÙŠØ¹ Ø§Ù„Ø·Ø±Ù‚', en: 'Methods Approval', es: 'Visto MÃ©todos', pt: 'Visto MÃ©todos', tr: 'Metot OnayÄ±' })}</p>
                    <div className="h-20 border border-slate-200 dark:border-dk-border rounded-lg mt-2 bg-slate-50 dark:bg-dk-bg/50"></div>
                </div>
                <div className="text-center">
                    <p className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest">{_({ fr: 'Visa Production / Appro', ar: 'ØªÙˆÙ‚ÙŠØ¹ Ø§Ù„Ø¥Ù†ØªØ§Ø¬ / Ø§Ù„ØªÙ…ÙˆÙŠÙ†', en: 'Production / Supply Approval', es: 'Visto ProducciÃ³n / Aprovisionamiento', pt: 'Visto ProduÃ§Ã£o / Aprovisionamento', tr: 'Ãœretim / Tedarik OnayÄ±' })}</p>
                    <div className="h-20 border border-slate-200 dark:border-dk-border rounded-lg mt-2 bg-slate-50 dark:bg-dk-bg/50"></div>
                </div>
            </div>
        </div>
    );
}
