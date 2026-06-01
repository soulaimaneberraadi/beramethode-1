
import React, { useRef, useState, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Calendar,
    User,
    Tag,
    Layers,
    Hash,
    DollarSign,
    Image as ImageIcon,
    Upload,
    FileText,
    Factory,
    Clock,
    Users,
    Activity,
    Target,
    TrendingUp,
    Shirt,
    Maximize2,
    X,
    Plus,
    Trash2,
    Edit,
    ArrowRight,
    Grid3X3,
    Palette,
    ChevronDown,
    LayoutGrid,
    Loader2,
    Scissors,
    AlertTriangle,
    CheckCircle
} from 'lucide-react';
import { FicheData, AppSettings, PlanningEvent } from '../types';
import DateTimePicker from './ui/DateTimePicker';
import { TEXTILE_COLORS, TEXTILE_FABRICS } from '../data/textileData';
import ExcelInput from './ExcelInput';
import { compressImage } from '../utils';
import SplitModal from './planning/modals/SplitModal';
import { calculateEndDate } from '../utils/planning';


const LAUNCH_HOUR_OPTS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
// Only multiples of 5 (00, 05, 10 … 55) — 12 options, no scroll needed
const LAUNCH_MINUTE_OPTS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const FICHE_LABELS = {
    fr: {
        identification: 'Identification',
        client: 'Client',
        clientPlaceholder: 'Nom du Client',
        modelRef: 'Modèle / Réf',
        modelPlaceholder: 'Référence Modèle',
        category: 'Catégorie',
        optional: 'facultatif',
        categoryPlaceholder: 'Famille produit (ex. T-Shirt)',
        categoryHelp: 'Laisse vide si besoin : tu peux passer aux étapes suivantes et enregistrer sans catégorie.',
        launchTitle: 'Date & heure de lancement',
        chooseDate: 'Choisir une date',
        pickLaunchTime: 'Choisir l’heure de lancement',
        timePickerDialog: 'Grille heure et minutes',
        hoursHeading: 'Heures (24h)',
        minutesHeading: 'Minutes',
        badge24h: '24h',
        launchHelp: 'Heure en 24 h — alignée avec le Planning et le Suivi à l’enregistrement du modèle.',
        matiere: 'Matière Principale / Désignation',
        matierePlaceholder: 'Rechercher un tissu (ex: Popeline, Denim, Jersey...)',
    },
    ar: {
        identification: 'التعريف',
        client: 'العميل',
        clientPlaceholder: 'اسم العميل',
        modelRef: 'الموديل / المرجع',
        modelPlaceholder: 'مرجع الموديل',
        category: 'الفئة',
        optional: 'اختياري',
        categoryPlaceholder: 'عائلة المنتج (مثال: T-Shirt)',
        categoryHelp: 'يمكن تركه فارغًا: المتابعة إلى المراحل التالية والحفظ دون فئة.',
        launchTitle: 'تاريخ ووقت الانطلاق',
        chooseDate: 'اختر تاريخًا',
        pickLaunchTime: 'اختر وقت الانطلاق',
        timePickerDialog: 'جدول الساعات والدقائق',
        hoursHeading: 'ساعات (24)',
        minutesHeading: 'دقائق',
        badge24h: '24',
        launchHelp: 'توقيت 24 ساعة — يتوافق مع التخطيط والمتابعة عند حفظ النموذج.',
        matiere: 'المادة الرئيسية / التسمية',
        matierePlaceholder: 'بحث عن قماش (مثال: Popeline، Denim...)',
    },
} as const;

interface FicheTechniqueProps {
    data: FicheData;
    setData: React.Dispatch<React.SetStateAction<FicheData>>;
    articleName: string;
    setArticleName: (name: string) => void;
    // Global Computed Data
    totalTime: number; // Temps Gamme
    tempsArticle: number; // Temps Article (with majoration)
    numWorkers: number;
    setNumWorkers: (n: number) => void;
    efficiency: number; // P° Réel / Moyenne
    setEfficiency: (n: number) => void;

    // Images
    images: { front: string | null; back: string | null };
    setImages: React.Dispatch<React.SetStateAction<{ front: string | null; back: string | null }>>;

    // Nav - Not used anymore but kept in interface for compatibility if passed
    onNext?: () => void;
    onSectionSplitChange?: (enabled: boolean) => void;
    lang?: 'fr' | 'ar';
    articleNameError?: boolean;
    /** Calendrier Planning (jours ouvrés / exceptions) — phase 0 DateTimePicker */
    settings: AppSettings;
    currentModelId?: string | null;
    planningEvents?: PlanningEvent[];
    setPlanningEvents?: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
}

export default function FicheTechnique({
    data,
    setData,
    articleName,
    setArticleName,
    totalTime,
    tempsArticle,
    numWorkers,
    setNumWorkers,
    efficiency,
    setEfficiency,
    images,
    setImages,
    onNext,
    onSectionSplitChange,
    lang = 'fr',
    articleNameError,
    settings,
    currentModelId = null,
    planningEvents = [],
    setPlanningEvents,
}: FicheTechniqueProps) {

    const ft = FICHE_LABELS[lang];

    const frontInputRef = useRef<HTMLInputElement>(null);
    const backInputRef = useRef<HTMLInputElement>(null);

    const modelEvents = useMemo(() => {
        if (!planningEvents) return [];
        return planningEvents.filter(e => {
            if (currentModelId && e.modelId === currentModelId) return true;
            if (articleName && e.modelName && e.modelName.toLowerCase().includes(articleName.toLowerCase())) return true;
            return false;
        });
    }, [planningEvents, currentModelId, articleName]);

    const getStatusMeta = (status: string | undefined) => {
        if (status === 'EXTERNAL_PROCESS') {
            return {
                label: lang === 'ar' ? 'عملية خارجية' : 'Proc. Externe',
                dot: 'bg-amber-500',
                text: 'text-amber-700',
                bg: 'bg-amber-50',
                border: 'border-amber-200'
            };
        }
        if (status === 'BLOCKED_STOCK') {
            return {
                label: lang === 'ar' ? 'متوقف / حابس' : 'Bloqué stock',
                dot: 'bg-red-500',
                text: 'text-red-700',
                bg: 'bg-red-50',
                border: 'border-red-200'
            };
        }
        const s = status === 'DONE' ? 'DONE' : status === 'BLOCKED_STOCK' ? 'BLOCKED' : (status === 'IN_PROGRESS' || status === 'ON_TRACK' || status === 'AT_RISK' || status === 'OFF_TRACK') ? 'IN_PROGRESS' : 'READY';
        const meta = {
            READY: { label: lang === 'ar' ? 'جاهز' : 'Prêt', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
            BLOCKED: { label: lang === 'ar' ? 'متوقف' : 'Bloqué', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
            IN_PROGRESS: { label: lang === 'ar' ? 'في طور الإنجاز' : 'En cours', dot: 'bg-[#2149C1]', text: 'text-[#1a3ba5]', bg: 'bg-blue-50', border: 'border-blue-200' },
            DONE: { label: lang === 'ar' ? 'مكتمل' : 'Terminé', dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
        };
        return meta[s] || meta.READY;
    };

    // -- INLINE CLIENT SPLITS EDITOR STATES & HANDLERS --
    const [editingEventId, setEditingEventId] = useState<string | 'new' | null>(null);
    const [editDraft, setEditDraft] = useState<Partial<PlanningEvent> | null>(null);

    const startEditNew = () => {
        const initialDist: Record<string, Record<string, number>> = {};
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                initialDist[c.id] = {};
                sizes.forEach(s => {
                    if (s.toLowerCase() !== 'total') {
                        initialDist[c.id][s] = 0;
                    }
                });
            }
        });

        const today = new Date().toISOString().split('T')[0];
        setEditDraft({
            id: `PE-${Date.now()}`,
            modelId: currentModelId || '',
            chaineId: 'CHAINE 1',
            dateLancement: today,
            dateExport: today,
            strictDeadline_DDS: today,
            startDate: today,
            clientName: data.client || '',
            status: 'READY',
            sizeColorDistribution: initialDist,
            qteTotal: 0,
            modelName: `${articleName || ''} — L1`
        });
        setEditingEventId('new');
    };

    const startEditExisting = (evt: PlanningEvent) => {
        setEditDraft({ ...evt });
        setEditingEventId(evt.id);
    };

    const deleteEvent = (eventId: string) => {
        const confirmMsg = lang === 'ar' 
            ? 'هل أنت متأكد من رغبتك في حذف هذه الدفعة؟ سيتم إزالتها من جدول التخطيط أيضاً.' 
            : 'Êtes-vous sûr de vouloir supprimer ce lot ? Il sera également retiré du planning.';
        if (window.confirm(confirmMsg)) {
            if (setPlanningEvents) {
                setPlanningEvents(prev => prev.filter(e => e.id !== eventId));
            }
        }
    };

    const handleSaveEdit = () => {
        if (!editDraft || !setPlanningEvents) return;
        
        const fullName = editDraft.modelName || '';
        const parts = fullName.split(' — ');
        const suffix = parts.length > 1 ? parts.slice(1).join(' — ').trim() : fullName.trim();
        
        if (!suffix) {
            alert(lang === 'ar' ? 'يرجى إدخال رمز أو اسم الدفعة (مثال: L1)' : 'Veuillez saisir un libellé ou suffixe pour le lot (ex: L1).');
            return;
        }

        let calculatedTotal = 0;
        if (editDraft.sizeColorDistribution) {
            Object.values(editDraft.sizeColorDistribution).forEach(sizeMap => {
                Object.values(sizeMap).forEach(qty => {
                    calculatedTotal += Number(qty) || 0;
                });
            });
        } else {
            calculatedTotal = editDraft.qteTotal || 0;
        }
        
        const finalDraft: PlanningEvent = {
            ...editDraft,
            modelId: editDraft.modelId || currentModelId || '',
            modelName: `${articleName || ''} — ${suffix}`,
            qteTotal: calculatedTotal,
            totalQuantity: calculatedTotal,
            startDate: editDraft.dateLancement,
            strictDeadline_DDS: editDraft.dateExport,
        } as PlanningEvent;

        setPlanningEvents(prev => {
            const exists = prev.some(e => e.id === finalDraft.id);
            if (exists) {
                return prev.map(e => e.id === finalDraft.id ? finalDraft : e);
            } else {
                return [...prev, finalDraft];
            }
        });

        setEditingEventId(null);
        setEditDraft(null);
    };

    const handleCancelEdit = () => {
        setEditingEventId(null);
        setEditDraft(null);
    };

    const renderEditorForm = () => {
        if (!editDraft) return null;
        
        const fullName = editDraft.modelName || '';
        const parts = fullName.split(' — ');
        const suffix = parts.length > 1 ? parts.slice(1).join(' — ') : '';
        
        const filteredSizes = (sizes || []).filter(s => s.toLowerCase() !== 'total');
        const filteredColors = (colors || []).filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total');
        const hasGrid = filteredSizes.length > 0 && filteredColors.length > 0;

        return (
            <div className="border-2 border-indigo-500/30 rounded-xl p-5 bg-indigo-50/10 space-y-5 animate-in fade-in duration-200 shadow-md">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h4 className="font-black text-sm text-indigo-900 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        {editingEventId === 'new' 
                            ? (lang === 'ar' ? 'إضافة دفعة تسليم جديدة' : 'Nouveau lot de livraison')
                            : (lang === 'ar' ? 'تعديل دفعة التسليم' : 'Modifier le lot de livraison')
                        }
                    </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Client name */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {lang === 'ar' ? 'العميل' : 'Client'}
                        </label>
                        <input
                            type="text"
                            value={editDraft.clientName || ''}
                            onChange={(e) => setEditDraft(prev => prev ? { ...prev, clientName: e.target.value } : prev)}
                            placeholder={lang === 'ar' ? 'اسم العميل' : 'Nom du Client'}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-sans"
                        />
                    </div>

                    {/* Suffix / Lot Code */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {lang === 'ar' ? 'رمز / اسم الدفعة (مثال: L1)' : 'Code / Libellé du lot (ex: L1)'}
                        </label>
                        <input
                            type="text"
                            value={suffix}
                            onChange={(e) => setEditDraft(prev => prev ? { ...prev, modelName: `${articleName || ''} — ${e.target.value}` } : prev)}
                            placeholder="L1"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                        />
                    </div>

                    {/* Delivery Date / DDS */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {lang === 'ar' ? 'تاريخ التسليم (DDS)' : 'Date de livraison (DDS)'}
                        </label>
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                            <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                            <DateTimePicker
                                value={editDraft.dateExport || ''}
                                onChange={(iso) => setEditDraft(prev => prev ? { 
                                    ...prev, 
                                    dateExport: iso.split('T')[0], 
                                    strictDeadline_DDS: iso.split('T')[0],
                                    dateLancement: iso.split('T')[0],
                                    startDate: iso.split('T')[0]
                                } : prev)}
                                mode="date"
                                settings={settings}
                                inputClassName="w-full min-w-0 border-0 bg-transparent shadow-none text-sm font-bold text-slate-700 outline-none focus:ring-0 py-0 px-0 font-mono"
                                showIcon={false}
                            />
                        </div>
                    </div>
                </div>

                {/* Size Color distribution grid */}
                {hasGrid ? (
                    <div className="space-y-2">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 font-sans">
                            <Grid3X3 className="w-3.5 h-3.5" />
                            {lang === 'ar' ? 'التوزيع بالتفصيل للدفعة' : 'Répartition des quantités du lot'}
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold">
                                        <th className="py-2.5 px-3 text-left border-r border-slate-100 min-w-[120px]">Couleur / Taille</th>
                                        {filteredSizes.map((s, i) => (
                                            <th key={i} className="py-2 px-2 text-center border-r border-slate-100 min-w-[60px]">
                                                {s}
                                            </th>
                                        ))}
                                        <th className="py-2 px-3 text-center bg-indigo-50/50 text-indigo-800 w-20">TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredColors.map((c) => {
                                        let rowTotal = 0;
                                        return (
                                            <tr key={c.id} className="hover:bg-slate-50/30">
                                                <td className="py-2 px-3 border-r border-slate-100 font-semibold text-slate-700 flex items-center gap-2">
                                                    <div
                                                        className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                        style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                    />
                                                    <span className="truncate max-w-[100px]" title={c.name}>{c.name}</span>
                                                </td>
                                                {filteredSizes.map((s) => {
                                                    const qty = editDraft.sizeColorDistribution?.[c.id]?.[s] ?? 0;
                                                    rowTotal += qty;
                                                    
                                                    const sIdx = sizes.indexOf(s);
                                                    const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                                                    const otherVal = planifiedTotalsExcludingCurrent[c.id]?.[s] || 0;
                                                    const totalVal = otherVal + qty;
                                                    const diff = totalVal - targetVal;
                                                    
                                                    return (
                                                        <td key={s} className="py-2 px-1.5 text-center border-r border-slate-100 align-top">
                                                            <div className="flex flex-col items-center gap-1">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={qty || ''}
                                                                    onChange={(e) => {
                                                                        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                                                        setEditDraft(prev => {
                                                                            if (!prev) return prev;
                                                                            const dist = { ...prev.sizeColorDistribution };
                                                                            if (!dist[c.id]) dist[c.id] = {};
                                                                            dist[c.id] = { ...dist[c.id], [s]: val };
                                                                            return { ...prev, sizeColorDistribution: dist };
                                                                        });
                                                                    }}
                                                                    className={`w-14 text-center border rounded-lg py-1 font-mono text-xs font-semibold focus:ring-2 transition-all outline-none ${
                                                                        diff !== 0 
                                                                            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100 bg-rose-50/20 text-rose-700' 
                                                                            : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-100 text-slate-800'
                                                                    }`}
                                                                    placeholder="0"
                                                                />
                                                                <div className="flex flex-col items-center text-[9px] font-mono leading-none">
                                                                    <span className="text-slate-400">/{targetVal}</span>
                                                                    {diff !== 0 ? (
                                                                        <span className="text-rose-600 font-bold mt-0.5" title={diff > 0 ? `${diff} de trop` : `${diff} manquant`}>
                                                                            {diff > 0 ? `+${diff}` : diff}
                                                                        </span>
                                                                    ) : (
                                                                        qty > 0 && <span className="text-emerald-600 font-bold mt-0.5">✓</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                                <td className="py-2 px-3 text-center font-mono font-bold bg-slate-50/50 text-slate-700">
                                                    {rowTotal}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1 max-w-xs">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {lang === 'ar' ? 'الكمية الإجمالية' : 'Quantité totale'}
                        </label>
                        <input
                            type="number"
                            min="0"
                            value={editDraft.qteTotal || ''}
                            onChange={(e) => setEditDraft(prev => prev ? { ...prev, qteTotal: Math.max(0, parseInt(e.target.value, 10) || 0) } : prev)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                        />
                    </div>
                )}

                {/* Form Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <div className="text-xs text-slate-400 font-bold">
                        {lang === 'ar' ? 'المجموع المحسوب:' : 'Total calculé:'} {' '}
                        <span className="text-indigo-600 font-black font-mono">
                            {hasGrid 
                                ? Object.values(editDraft.sizeColorDistribution || {}).reduce(
                                    (sum, sizeMap) => sum + Object.values(sizeMap).reduce((s, val) => s + (val || 0), 0), 
                                    0
                                  )
                                : (editDraft.qteTotal || 0)
                            } pcs
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {editingEventId !== 'new' && (
                            <button
                                type="button"
                                onClick={() => deleteEvent(editDraft.id || '')}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 font-black px-4 py-2 rounded-xl text-xs transition-all border border-rose-150 flex items-center gap-1"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                {lang === 'ar' ? 'حذف' : 'Supprimer'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2 rounded-xl text-xs transition-all"
                        >
                            {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-5 py-2 rounded-xl text-xs transition-all shadow-md flex items-center gap-1"
                        >
                            {lang === 'ar' ? 'حفظ الدفعة' : 'Enregistrer'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Loading state for compression
    const [isProcessingImg, setIsProcessingImg] = useState<string | null>(null);

    // -- Image Preview Modal State --
    const [previewImage, setPreviewImage] = useState<{ src: string, title: string } | null>(null);
    useEffect(() => {
        if (!previewImage) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setPreviewImage(null);
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [previewImage]);

    // -- MATRIX STATE --
    const sizes = data.sizes || [];
    const setSizes = (updater: React.SetStateAction<string[]>) => {
        setData(prev => ({
            ...prev,
            sizes: typeof updater === 'function' ? updater(prev.sizes || []) : updater
        }));
    };
    const [newSizeInput, setNewSizeInput] = useState('');

    const colors = data.colors || [];
    const setColors = (updater: React.SetStateAction<{ id: string, name: string }[]>) => {
        setData(prev => ({
            ...prev,
            colors: typeof updater === 'function' ? updater(prev.colors || []) : updater
        }));
    };
    const [newColorInput, setNewColorInput] = useState('');
    const [pickedHexColor, setPickedHexColor] = useState('#10b981');

    // Key format: "colorId_sizeIndex" -> value: number
    const gridQuantities = data.gridQuantities || {};
    const setGridQuantities = (updater: React.SetStateAction<Record<string, number>>) => {
        setData(prev => ({
            ...prev,
            gridQuantities: typeof updater === 'function' ? updater(prev.gridQuantities || {}) : updater
        }));
    };

    // Sync calculated Unit Cost back to data
    useEffect(() => {
        const computed = Number((tempsArticle * (data.costMinute || 0)).toFixed(2));
        if (data.unitCost !== computed) {
            setData(prev => ({ ...prev, unitCost: computed }));
        }
    }, [tempsArticle, data.costMinute, setData]);

    // --- CALCULATIONS ---
    const matrixStats = useMemo(() => {
        const rowTotals: Record<string, number> = {};
        const colTotals: Record<number, number> = {};
        let grandTotal = 0;

        colors.forEach(c => {
            rowTotals[c.id] = 0;
            sizes.forEach((_, sIdx) => {
                const key = `${c.id}_${sIdx}`;
                const val = gridQuantities[key] || 0;
                rowTotals[c.id] += val;
                colTotals[sIdx] = (colTotals[sIdx] || 0) + val;
                grandTotal += val;
            });
        });

        return { rowTotals, colTotals, grandTotal };
    }, [sizes, colors, gridQuantities]);

    // Update Global Quantity when matrix changes
    useEffect(() => {
        if (matrixStats.grandTotal > 0) {
            setData(prev => ({ ...prev, quantity: matrixStats.grandTotal }));
        }
    }, [matrixStats.grandTotal, setData]);

    // -- DYNAMIC RECONCILIATION TOTALS AND DISCREPANCIES --
    const planifiedTotals = useMemo(() => {
        const totals: Record<string, Record<string, number>> = {};
        
        // Initialize with zeros for each color and size
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                totals[c.id] = {};
                sizes.forEach(s => {
                    if (s.toLowerCase() !== 'total') {
                        totals[c.id][s] = 0;
                    }
                });
            }
        });

        // Sum over all modelEvents, considering editDraft for the one being edited
        modelEvents.forEach(evt => {
            const isEditingThis = evt.id === editingEventId;
            const dist = isEditingThis && editDraft ? editDraft.sizeColorDistribution : evt.sizeColorDistribution;
            if (dist) {
                Object.keys(dist).forEach(colorId => {
                    const sizeMap = dist[colorId];
                    if (sizeMap) {
                        Object.keys(sizeMap).forEach(sizeName => {
                            const qty = Number(sizeMap[sizeName]) || 0;
                            if (totals[colorId] && totals[colorId][sizeName] !== undefined) {
                                totals[colorId][sizeName] += qty;
                            }
                        });
                    }
                });
            }
        });

        // If editing a new one, include editDraft
        if (editingEventId === 'new' && editDraft && editDraft.sizeColorDistribution) {
            const dist = editDraft.sizeColorDistribution;
            Object.keys(dist).forEach(colorId => {
                const sizeMap = dist[colorId];
                if (sizeMap) {
                    Object.keys(sizeMap).forEach(sizeName => {
                        const qty = Number(sizeMap[sizeName]) || 0;
                        if (totals[colorId] && totals[colorId][sizeName] !== undefined) {
                            totals[colorId][sizeName] += qty;
                        }
                    });
                }
            });
        }

        return totals;
    }, [modelEvents, editingEventId, editDraft, colors, sizes]);

    const reconciliationDiscrepancies = useMemo(() => {
        let hasErrors = false;
        const diffs: Record<string, Record<string, number>> = {};
        
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                diffs[c.id] = {};
                sizes.forEach((s, sIdx) => {
                    if (s.toLowerCase() !== 'total') {
                        const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                        const plannedVal = planifiedTotals[c.id]?.[s] || 0;
                        const diff = plannedVal - targetVal;
                        diffs[c.id][s] = diff;
                        if (diff !== 0) {
                            hasErrors = true;
                        }
                    }
                });
            }
        });

        return { hasErrors, diffs };
    }, [colors, sizes, gridQuantities, planifiedTotals]);

    const planifiedTotalsExcludingCurrent = useMemo(() => {
        const totals: Record<string, Record<string, number>> = {};
        
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                totals[c.id] = {};
                sizes.forEach(s => {
                    if (s.toLowerCase() !== 'total') {
                        totals[c.id][s] = 0;
                    }
                });
            }
        });

        modelEvents.forEach(evt => {
            if (evt.id === editingEventId) return;
            const dist = evt.sizeColorDistribution;
            if (dist) {
                Object.keys(dist).forEach(colorId => {
                    const sizeMap = dist[colorId];
                    if (sizeMap) {
                        Object.keys(sizeMap).forEach(sizeName => {
                            const qty = Number(sizeMap[sizeName]) || 0;
                            if (totals[colorId] && totals[colorId][sizeName] !== undefined) {
                                totals[colorId][sizeName] += qty;
                            }
                        });
                    }
                });
            }
        });

        return totals;
    }, [modelEvents, editingEventId, colors, sizes]);

    // --- HANDLERS ---
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
        const file = e.target.files?.[0];
        if (file) {
            setIsProcessingImg(type);
            try {
                const compressedBase64 = await compressImage(file);
                setImages(prev => ({ ...prev, [type]: compressedBase64 }));
            } catch (error) {
                console.error("Image compression failed", error);
                alert("Erreur lors du traitement de l'image.");
            } finally {
                setIsProcessingImg(null);
            }
        }
    };

    const handleChange = (field: keyof FicheData, value: any) => {
        setData(prev => ({ ...prev, [field]: value }));
    };

    const launchHM = useMemo(() => {
        const raw = (data.launchTime ?? '08:00').trim();
        const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
        if (!m) return { h: '08', min: '00' };
        const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
        const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
        return { h: String(h).padStart(2, '0'), min: String(min).padStart(2, '0') };
    }, [data.launchTime]);

    const [launchTimeOpen, setLaunchTimeOpen] = useState(false);
    const [launchPopPos, setLaunchPopPos] = useState({ top: 0, left: 0, width: 280 });
    const launchTimePickerRef = useRef<HTMLDivElement>(null);
    const launchTimeBtnRef = useRef<HTMLButtonElement>(null);
    const launchTimePopRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!launchTimeOpen || !launchTimeBtnRef.current) return;
        const update = () => {
            const el = launchTimeBtnRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const w = 320;
            // Center under the button when possible
            let left = r.left + (r.width - w) / 2;
            if (left < 12) left = 12;
            if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
            setLaunchPopPos({ top: r.bottom + 8, left, width: w });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [launchTimeOpen]);

    useEffect(() => {
        if (!launchTimeOpen) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (launchTimePickerRef.current?.contains(t)) return;
            if (launchTimePopRef.current?.contains(t)) return;
            setLaunchTimeOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setLaunchTimeOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [launchTimeOpen]);

    // Matrix Actions
    const addSize = () => {
        if (!newSizeInput.trim()) return;
        // Allow adding multiple sizes separated by space or comma (e.g. "36 38 40")
        const newSizes = newSizeInput.split(/[\s,]+/).filter(s => s.trim() !== '');
        setSizes(prev => [...prev, ...newSizes]);
        setNewSizeInput('');
    };

    const removeSize = (index: number) => {
        setSizes(prev => prev.filter((_, i) => i !== index));
        // Note: We don't strictly need to clean up gridQuantities as keys rely on index which shifts, 
        // but for a simple app, visual consistency is enough. 
        // Ideally, we'd remap keys, but simple deletion is acceptable for this UX level.
    };

    const addColor = () => {
        if (!newColorInput.trim()) return;
        setColors(prev => [...prev, { id: Date.now().toString(), name: newColorInput.trim() }]);
        setNewColorInput('');
    };

    // Smart color name detection from hex
    const hexToColorName = (hex: string): string => {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        const namedColors: { name: string; r: number; g: number; b: number }[] = [
            { name: 'Noir', r: 0, g: 0, b: 0 },
            { name: 'Blanc', r: 255, g: 255, b: 255 },
            { name: 'Rouge', r: 255, g: 0, b: 0 },
            { name: 'Rouge Foncé', r: 139, g: 0, b: 0 },
            { name: 'Bordeaux', r: 128, g: 0, b: 32 },
            { name: 'Cramoisi', r: 220, g: 20, b: 60 },
            { name: 'Rose', r: 255, g: 105, b: 180 },
            { name: 'Rose Clair', r: 255, g: 182, b: 193 },
            { name: 'Fuchsia', r: 255, g: 0, b: 255 },
            { name: 'Orange', r: 255, g: 165, b: 0 },
            { name: 'Orange Foncé', r: 255, g: 140, b: 0 },
            { name: 'Corail', r: 255, g: 127, b: 80 },
            { name: 'Saumon', r: 250, g: 128, b: 114 },
            { name: 'Jaune', r: 255, g: 255, b: 0 },
            { name: 'Jaune Doré', r: 255, g: 215, b: 0 },
            { name: 'Jaune Pâle', r: 255, g: 255, b: 224 },
            { name: 'Vert', r: 0, g: 128, b: 0 },
            { name: 'Vert Clair', r: 144, g: 238, b: 144 },
            { name: 'Vert Foncé', r: 0, g: 100, b: 0 },
            { name: 'Vert Émeraude', r: 16, g: 185, b: 129 },
            { name: 'Lime', r: 0, g: 255, b: 0 },
            { name: 'Olive', r: 128, g: 128, b: 0 },
            { name: 'Kaki', r: 189, g: 183, b: 107 },
            { name: 'Turquoise', r: 64, g: 224, b: 208 },
            { name: 'Cyan', r: 0, g: 255, b: 255 },
            { name: 'Bleu Ciel', r: 135, g: 206, b: 235 },
            { name: 'Bleu', r: 0, g: 0, b: 255 },
            { name: 'Bleu Royal', r: 65, g: 105, b: 225 },
            { name: 'Bleu Marine', r: 0, g: 0, b: 128 },
            { name: 'Indigo', r: 75, g: 0, b: 130 },
            { name: 'Violet', r: 128, g: 0, b: 128 },
            { name: 'Lavande', r: 230, g: 230, b: 250 },
            { name: 'Mauve', r: 224, g: 176, b: 255 },
            { name: 'Marron', r: 139, g: 69, b: 19 },
            { name: 'Chocolat', r: 210, g: 105, b: 30 },
            { name: 'Beige', r: 245, g: 245, b: 220 },
            { name: 'Crème', r: 255, g: 253, b: 208 },
            { name: 'Ivoire', r: 255, g: 255, b: 240 },
            { name: 'Gris', r: 128, g: 128, b: 128 },
            { name: 'Gris Clair', r: 192, g: 192, b: 192 },
            { name: 'Gris Foncé', r: 64, g: 64, b: 64 },
            { name: 'Argent', r: 192, g: 192, b: 192 },
        ];
        let closest = namedColors[0];
        let minDist = Infinity;
        for (const c of namedColors) {
            const dist = Math.sqrt((r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2);
            if (dist < minDist) { minDist = dist; closest = c; }
        }
        return closest.name;
    };

    const addVisualColor = (hex: string) => {
        const detectedName = hexToColorName(hex);
        setColors(prev => [...prev, { id: hex, name: detectedName }]);
    };

    const removeColor = (id: string) => {
        setColors(prev => prev.filter(c => c.id !== id));
        const newQ = { ...gridQuantities };
        // Clean up keys for this color
        Object.keys(newQ).forEach(k => {
            if (k.startsWith(`${id}_`)) delete newQ[k];
        });
        setGridQuantities(newQ);
    };

    const updateQuantity = (colorId: string, sizeIdx: number, value: string) => {
        const num = parseInt(value) || 0;
        setGridQuantities(prev => ({
            ...prev,
            [`${colorId}_${sizeIdx}`]: num
        }));
    };

    return (
        <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-2 duration-300 relative">

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* LEFT COLUMN: DATA INPUTS (8 Cols) */}
                <div className="lg:col-span-8 space-y-6">

                    {/* 1. GENERAL INFO CARD */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Tag className="w-4 h-4 text-indigo-500" />
                                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{ft.identification}</h3>
                            </div>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">{ft.client}</label>
                                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all">
                                    <User className="w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={data.client}
                                        onChange={(e) => handleChange('client', e.target.value)}
                                        placeholder={ft.clientPlaceholder}
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">{ft.modelRef}</label>
                                <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${articleNameError 
                                    ? 'bg-rose-50 border-2 border-rose-300 focus-within:ring-2 focus-within:ring-rose-100' 
                                    : 'bg-slate-50 border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400'}`}>
                                    <Shirt className={`w-4 h-4 ${articleNameError ? 'text-rose-500' : 'text-slate-400'}`} />
                                    <input
                                        type="text"
                                        value={articleName}
                                        onChange={(e) => setArticleName(e.target.value)}
                                        placeholder={ft.modelPlaceholder}
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            {/* Category Field (Optional) */}
                            <div className="space-y-1">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 ml-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">{ft.category}</label>
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{ft.optional}</span>
                                </div>
                                <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all bg-slate-50 border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400">
                                    <LayoutGrid className="w-4 h-4 text-slate-400" />
                                    <ExcelInput
                                        suggestions={["T-Shirt", "Polo", "Chemise", "Pantalon", "Robe", "Veste", "Sweat", "Short", "Jupe", "Pyjama", "Sous-vêtement"]}
                                        value={data.category}
                                        onChange={(val) => handleChange('category', val)}
                                        placeholder={ft.categoryPlaceholder}
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            {/* Suivi metadata: Todm / Kisba / Hala */}
                            <div className="space-y-1 md:col-span-2">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Suivi (Todm / Kisba / Hala)</label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <input
                                        type="text"
                                        value={data.todm || ''}
                                        onChange={(e) => handleChange('todm', e.target.value)}
                                        placeholder="Todm (ex: 60%)"
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                    />
                                    <select
                                        value={data.kisba || ''}
                                        onChange={(e) => handleChange('kisba', e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                    >
                                        <option value="">Kisba…</option>
                                        <option value="COUPE">Coupé</option>
                                        <option value="EN_COURS">En cours</option>
                                        <option value="NON_LANCE">Non lancé</option>
                                        <option value="AUTRE">Autre</option>
                                    </select>
                                    <select
                                        value={data.hala || ''}
                                        onChange={(e) => handleChange('hala', e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                    >
                                        <option value="">Hala…</option>
                                        <option value="EN_COURS">En cours</option>
                                        <option value="TERMINE">Terminé</option>
                                        <option value="EN_ATTENTE">En attente</option>
                                        <option value="BLOQUE">Bloqué</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1 md:col-span-2">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">{ft.launchTitle}</label>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="flex flex-1 min-w-0 items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all">
                                        <div className="shrink-0 p-1.5 bg-white rounded-lg text-indigo-500 shadow-sm border border-indigo-100 pointer-events-none" aria-hidden>
                                            <Calendar className="w-4 h-4" />
                                        </div>
                                        <DateTimePicker
                                            value={data.date || ''}
                                            onChange={(iso) => handleChange('date', iso.split('T')[0])}
                                            mode="date"
                                            settings={settings}
                                            inputClassName="w-full min-w-0 border-0 bg-transparent shadow-none text-sm font-bold text-slate-700 outline-none focus:ring-0 py-0 px-0 font-mono"
                                            showIcon={false}
                                        />
                                    </div>
                                    <div
                                        ref={launchTimePickerRef}
                                        className={`relative flex flex-1 min-w-0 items-center gap-2 sm:gap-3 rounded-xl border bg-slate-50 px-3 py-2.5 shadow-sm transition ${launchTimeOpen ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}
                                    >
                                        <Clock className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                                        <div className="relative min-w-0 flex-1">
                                            <button
                                                ref={launchTimeBtnRef}
                                                type="button"
                                                aria-expanded={launchTimeOpen}
                                                aria-haspopup="dialog"
                                                aria-label={ft.pickLaunchTime}
                                                onClick={() => setLaunchTimeOpen((o) => !o)}
                                                className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-2 text-left shadow-sm outline-none transition hover:border-indigo-200 focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-100"
                                            >
                                                <span className="font-mono text-sm font-bold tracking-tight text-slate-800">
                                                    {launchHM.h}:{launchHM.min}
                                                </span>
                                                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${launchTimeOpen ? 'rotate-180' : ''}`} aria-hidden />
                                            </button>
                                        </div>
                                        <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:inline">{ft.badge24h}</span>
                                    </div>
                                </div>
                                {launchTimeOpen && createPortal(
                                    <div
                                        ref={launchTimePopRef}
                                        role="dialog"
                                        aria-label={ft.timePickerDialog}
                                        style={{
                                            position: 'fixed',
                                            top: launchPopPos.top,
                                            left: launchPopPos.left,
                                            width: Math.max(launchPopPos.width, 300),
                                            zIndex: 9999
                                        }}
                                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50 ring-1 ring-black/5"
                                    >
                                        {/* Compact Header */}
                                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
                                            <div>
                                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">HEURE DE LANCEMENT</span>
                                            </div>
                                            <div className="font-mono text-lg font-black text-indigo-600 bg-white px-3 py-0.5 rounded-xl shadow-sm border border-indigo-100">
                                                {launchHM.h}:{launchHM.min}
                                            </div>
                                        </div>

                                        <div className="p-4 space-y-4">
                                            {/* Native time picker — clavier + roue, plus rapide */}
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Saisie directe</label>
                                                <input
                                                    type="time"
                                                    step={300}
                                                    value={`${launchHM.h}:${launchHM.min}`}
                                                    onChange={(e) => handleChange('launchTime', e.target.value)}
                                                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 rounded-xl px-4 py-3 font-mono font-black text-2xl text-center text-slate-800 outline-none transition-colors"
                                                />
                                                <p className="text-[10px] text-slate-400 mt-1 text-center">Pas de 5 minutes</p>
                                            </div>

                                            {/* Quick presets — démarrages fréquents */}
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Raccourcis</label>
                                                <div className="grid grid-cols-3 gap-1.5">
                                                    {['06:00', '07:00', '08:00', '08:30', '09:00', '14:00'].map(t => {
                                                        const active = `${launchHM.h}:${launchHM.min}` === t;
                                                        return (
                                                            <button
                                                                key={t}
                                                                onClick={() => { handleChange('launchTime', t); setLaunchTimeOpen(false); }}
                                                                className={`py-2 text-xs font-mono font-bold rounded-lg transition-all ${active
                                                                    ? 'bg-indigo-600 text-white shadow'
                                                                    : 'bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700'}`}
                                                            >
                                                                {t}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-[10px] text-slate-400 py-2 px-4 border-t border-slate-100 bg-slate-50">
                                            <span>Tab/flèches pour ajuster</span>
                                            <button
                                                onClick={() => setLaunchTimeOpen(false)}
                                                className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-500"
                                            >
                                                OK
                                            </button>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                                <p className="text-[10px] text-slate-500 ml-1">
                                    {ft.launchHelp}
                                </p>
                                <style>{`
                                .date-input-modern::-webkit-calendar-picker-indicator {
                                    display: none;
                                }
                            `}</style>
                            </div>

                            <div className="md:col-span-2 space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">{ft.matiere}</label>
                                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all relative">
                                    <Layers className="w-4 h-4 text-slate-400 z-20 relative" />
                                    <ExcelInput
                                        suggestions={TEXTILE_FABRICS}
                                        value={data.designation}
                                        onChange={(val) => handleChange('designation', val)}
                                        placeholder={ft.matierePlaceholder}
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300 pl-9 pr-3"
                                        containerClassName="absolute inset-0 flex items-center"
                                    />
                                </div>
                            </div>

                            {/* MATRIX BREAKDOWN SECTION */}
                            <div className="md:col-span-2 mt-4 pt-4 border-t border-slate-100">
                                <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                        <Grid3X3 className="w-3.5 h-3.5" />
                                        Répartition (Tailles / Couleurs)
                                    </label>

                                    {/* ADD SIZE INPUT */}
                                    <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                                        <input
                                            type="text"
                                            placeholder="Ajouter Tailles (ex: 36 38 40)"
                                            className="bg-transparent text-xs px-2 outline-none w-48 text-slate-700 placeholder:text-slate-400"
                                            value={newSizeInput}
                                            onChange={(e) => setNewSizeInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addSize()}
                                        />
                                        <button onClick={addSize} className="bg-white rounded p-1 shadow-sm hover:text-indigo-600 transition-colors">
                                            <Plus className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                    {/* ADD COLOR INPUT — Unified bar */}
                                    <div className="bg-slate-50 p-2.5 border-b border-slate-200 flex flex-wrap gap-2 items-center">
                                        {/* Color Swatch Picker */}
                                        <label className="relative flex items-center justify-center cursor-pointer shrink-0" title="Choisir une couleur">
                                            <input
                                                type="color"
                                                value={pickedHexColor}
                                                onChange={(e) => setPickedHexColor(e.target.value)}
                                                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                            />
                                            <div className="w-6 h-6 rounded-md border-2 border-slate-300 shadow-sm cursor-pointer hover:scale-110 transition-transform" style={{ backgroundColor: pickedHexColor }}></div>
                                        </label>
                                        {/* Auto-detected name badge */}
                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[11px] font-black rounded-md whitespace-nowrap">
                                            {hexToColorName(pickedHexColor)}
                                        </span>
                                        {/* Text input */}
                                        <div className="relative flex-1 min-w-[120px] flex items-center bg-white border border-slate-200 rounded-lg focus-within:border-indigo-400 px-3 h-7">
                                            <Palette className="w-3 h-3 text-slate-400 mr-2 z-20 relative shrink-0" />
                                            <ExcelInput
                                                suggestions={TEXTILE_COLORS.map(c => c.value)}
                                                placeholder="Nom couleur (ou laisser auto)..."
                                                className="text-xs font-bold text-slate-700 outline-none w-full pl-6 pr-2"
                                                containerClassName="absolute inset-0 flex items-center"
                                                value={newColorInput}
                                                onChange={(val) => setNewColorInput(val)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        if (newColorInput.trim()) addColor();
                                                        else addVisualColor(pickedHexColor);
                                                    }
                                                }}
                                            />
                                        </div>
                                        {/* Add button */}
                                        <button
                                            onClick={() => {
                                                if (newColorInput.trim()) addColor();
                                                else addVisualColor(pickedHexColor);
                                            }}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors z-20 h-7"
                                        >
                                            <Plus className="w-3 h-3" /> Ajouter
                                        </button>
                                    </div>

                                    {/* THE GRID */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                                                    <th className="py-3 px-3 text-left font-bold border-r border-slate-200 min-w-[120px]">Couleur \ Taille</th>
                                                    {sizes.length === 0 && (
                                                        <th className="py-2 px-4 text-center font-normal italic text-slate-400 border-r border-slate-200 min-w-[100px]">
                                                            (Ajouter tailles)
                                                        </th>
                                                    )}
                                                    {sizes.map((s, i) => (
                                                        <th key={i} className="py-2 px-2 text-center font-bold border-r border-slate-200 min-w-[50px] relative group">
                                                            {s}
                                                            <button
                                                                onClick={() => removeSize(i)}
                                                                className="absolute top-0 right-0 p-0.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="Supprimer Taille"
                                                            >
                                                                <X className="w-2.5 h-2.5" />
                                                            </button>
                                                        </th>
                                                    ))}
                                                    <th className="py-2 px-3 text-center font-black bg-slate-200 text-slate-800 w-20">TOTAL</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {colors.length === 0 && (
                                                    <tr>
                                                        <td colSpan={sizes.length + (sizes.length === 0 ? 3 : 2)} className="py-8 text-center text-slate-400 italic">
                                                            Ajoutez des couleurs pour commencer la répartition.
                                                        </td>
                                                    </tr>
                                                )}
                                                {colors.map((c) => (
                                                    <tr key={c.id} className="hover:bg-slate-50 group">
                                                        <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                                                            <div className="flex items-center gap-2">
                                                                <div
                                                                    className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                                    style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                                />
                                                                <span className="truncate max-w-[150px]" title={c.name}>
                                                                    {c.id && c.id.startsWith('#') && (c.name.includes('personnalisé') || c.name.startsWith('#') || c.name.includes('rgb(') || c.name.includes('Couleur P'))
                                                                        ? hexToColorName(c.id)
                                                                        : c.name}
                                                                </span>
                                                            </div>
                                                            <button onClick={() => removeColor(c.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                        {sizes.length === 0 && (
                                                            <td className="p-2 border-r border-slate-100 bg-slate-50/30 text-center text-slate-300 text-[10px] italic">
                                                                -
                                                            </td>
                                                        )}
                                                        {sizes.map((s, sIdx) => {
                                                            const key = `${c.id}_${sIdx}`;
                                                            const val = gridQuantities[key] || '';
                                                            return (
                                                                <td key={sIdx} className="p-0 border-r border-slate-100 bg-white">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        className="w-full h-full text-center py-2.5 bg-transparent outline-none focus:bg-indigo-50 focus:text-indigo-700 transition-colors font-medium placeholder:text-slate-200"
                                                                        placeholder="0"
                                                                        value={val}
                                                                        onChange={(e) => updateQuantity(c.id, sIdx, e.target.value)}
                                                                    />
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="py-2 px-3 text-center font-bold text-slate-700 bg-slate-50 border-l border-slate-200">
                                                            {matrixStats.rowTotals[c.id]}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            {colors.length > 0 && (
                                                <tfoot className="border-t-2 border-slate-200 font-bold bg-slate-50">
                                                    <tr>
                                                        <td className="py-2 px-3 text-right uppercase text-[10px] tracking-wider text-slate-500 border-r border-slate-200">Total</td>
                                                        {sizes.length === 0 && (
                                                            <td className="py-2 px-2 text-center text-slate-700 border-r border-slate-200">-</td>
                                                        )}
                                                        {sizes.map((_, sIdx) => (
                                                            <td key={sIdx} className="py-2 px-2 text-center text-slate-700 border-r border-slate-200">
                                                                {matrixStats.colTotals[sIdx] || 0}
                                                            </td>
                                                        ))}
                                                        <td className="py-2 px-3 text-center bg-indigo-600 text-white font-black text-sm">
                                                            {matrixStats.grandTotal}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. PLANIFIED ORDERS & LOTS CARD */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
                        <div className="bg-indigo-50/50 px-6 py-3 border-b border-indigo-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-indigo-600" />
                                <h3 className="font-bold text-indigo-800 text-sm uppercase tracking-wide">
                                    {lang === 'ar' ? 'تقسيم طلبية العميل (الطلبيات المبرمجة)' : 'Commandes & Lots de Livraison Planifiés'}
                                </h3>
                            </div>
                            <div className="flex items-center gap-3">
                                {currentModelId && editingEventId === null && (
                                    <button
                                        type="button"
                                        onClick={startEditNew}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-sm"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {lang === 'ar' ? 'إضافة دفعة / طلبية' : 'Ajouter un lot'}
                                    </button>
                                )}
                                <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                                    {modelEvents.length} {modelEvents.length > 1 ? 'lots' : 'lot'}
                                </span>
                            </div>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Warn if unsaved model */}
                            {!currentModelId && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-xs font-semibold flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-amber-500 shrink-0" />
                                    <span>
                                        {lang === 'ar' ? 
                                            'يرجى حفظ النموذج أولاً لتتمكن من إضافة وتقسيم طلبيات هذا الموديل.' : 
                                            'Veuillez d\'abord enregistrer le modèle pour pouvoir planifier et diviser les commandes.'
                                        }
                                    </span>
                                </div>
                            )}

                            {/* Render inline editor for new event */}
                            {currentModelId && editingEventId === 'new' && (
                                <div className="mb-6">
                                    {renderEditorForm()}
                                </div>
                            )}

                            {modelEvents.length === 0 ? (
                                editingEventId !== 'new' && (
                                    <div className="text-center py-8 text-slate-400 text-xs italic flex flex-col items-center justify-center gap-2">
                                        <Calendar className="w-8 h-8 text-slate-300" />
                                        <span>
                                            {lang === 'ar' ? 
                                                'لا توجد طلبيات أو دفعات تسليم مبرمجة لهذا الموديل حالياً في جدول التخطيط.' : 
                                                'Aucune commande ou lot de livraison planifié pour ce modèle actuellement dans le planning.'
                                            }
                                        </span>
                                    </div>
                                )
                            ) : (
                                modelEvents.map((evt) => {
                                    if (editingEventId === evt.id) {
                                        return (
                                            <div key={evt.id} className="mb-6">
                                                {renderEditorForm()}
                                            </div>
                                        );
                                    }

                                    const statusMeta = getStatusMeta(evt.status);
                                    const hasDistribution = evt.sizeColorDistribution && Object.keys(evt.sizeColorDistribution).length > 0;
                                    
                                    // Filter out 'total' keys case-insensitively
                                    const filteredSizes = sizes.filter(s => s.toLowerCase() !== 'total');
                                    const filteredColors = colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total');

                                    return (
                                        <div key={evt.id} className="border border-slate-200/80 rounded-2xl p-5 bg-gradient-to-br from-white to-slate-50/30 hover:shadow-md hover:border-indigo-200/80 transition-all space-y-4 shadow-sm">
                                            {/* Lot Header */}
                                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-150/60 pb-3">
                                                <div className="space-y-0.5">
                                                    <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                                                        <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg text-xs font-black">OF</span>
                                                        <span className="text-slate-800 font-extrabold">{evt.modelName || articleName}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {/* Status badge */}
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                                                        {statusMeta.label}
                                                    </span>
                                                    
                                                    {/* Quantity */}
                                                    <span className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-mono font-black text-xs px-3 py-1.5 rounded-xl shadow-sm">
                                                        {evt.qteTotal} pcs
                                                    </span>

                                                    {/* Edit button */}
                                                    {currentModelId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditExisting(evt)}
                                                            className="p-2 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all border border-indigo-150 bg-white shadow-sm flex items-center justify-center cursor-pointer"
                                                            title={lang === 'ar' ? 'تعديل الدفعة' : 'Modifier le lot'}
                                                        >
                                                            <Edit className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Delivery Info Banner (Replaced old Date blocks) */}
                                            <div className="bg-gradient-to-r from-indigo-50/40 via-indigo-50/10 to-slate-50/20 rounded-xl px-4 py-3 border border-indigo-100/50 flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="bg-indigo-100/80 p-1.5 rounded-lg text-indigo-600">
                                                        <Calendar className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                                                            {lang === 'ar' ? 'تاريخ التسليم (DDS)' : 'Date de livraison (DDS)'}
                                                        </span>
                                                        <span className="font-bold text-slate-700 font-mono text-sm">
                                                            {evt.strictDeadline_DDS || evt.dateExport || '-'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                                                        {lang === 'ar' ? 'العميل' : 'Client'}
                                                    </span>
                                                    <span className="font-extrabold text-slate-700 bg-white px-2.5 py-0.5 rounded-md border border-slate-100 shadow-sm inline-block">
                                                        {evt.clientName || (evt as any).client || '-'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Lot Size/Color Distribution */}
                                            {hasDistribution && (
                                                <div className="space-y-2">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                                        <Grid3X3 className="w-3.5 h-3.5 text-slate-400" />
                                                        {lang === 'ar' ? 'التوزيع بالتفصيل' : 'Répartition des quantités'}
                                                    </div>
                                                    <div className="overflow-x-auto rounded-xl border border-slate-150 bg-white">
                                                        <table className="w-full text-xs border-collapse">
                                                            <thead>
                                                                <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-150 font-bold">
                                                                    <th className="py-2.5 px-3 text-left font-bold border-r border-slate-100 min-w-[100px]">Couleur / Taille</th>
                                                                    {filteredSizes.map((s, i) => (
                                                                        <th key={i} className="py-2 px-2 text-center font-bold border-r border-slate-100">
                                                                            {s}
                                                                        </th>
                                                                    ))}
                                                                    <th className="py-2 px-3 text-center font-bold bg-indigo-50/30 text-indigo-800 w-20">TOTAL</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {filteredColors.map((c) => {
                                                                    let rowTotal = 0;
                                                                    return (
                                                                        <tr key={c.id} className="hover:bg-slate-50/30 transition-colors">
                                                                            <td className="py-2 px-3 border-r border-slate-100 font-semibold text-slate-600 flex items-center gap-2">
                                                                                <div
                                                                                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                                                    style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                                                />
                                                                                <span className="truncate max-w-[120px] text-slate-700" title={c.name}>{c.name}</span>
                                                                            </td>
                                                                            {filteredSizes.map((s) => {
                                                                                const qty = evt.sizeColorDistribution?.[c.id]?.[s] || 0;
                                                                                rowTotal += qty;
                                                                                return (
                                                                                    <td key={s} className="py-2 px-2 text-center font-mono text-slate-600 border-r border-slate-100">
                                                                                        {qty || <span className="text-slate-300">-</span>}
                                                                                    </td>
                                                                                );
                                                                            })}
                                                                            <td className="py-2 px-3 text-center font-mono font-extrabold bg-slate-50/40 text-slate-700">
                                                                                {rowTotal}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}

                            {/* RECONCILIATION TABLE */}
                            {(modelEvents.length > 0 || editingEventId !== null) && (
                                <div className="mt-8 border-t border-slate-150/60 pt-6 space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="space-y-0.5">
                                            <h4 className="font-extrabold text-sm text-indigo-900 flex items-center gap-2">
                                                <Grid3X3 className="w-4 h-4 text-indigo-600" />
                                                {lang === 'ar' ? 'جدول مطابقة الكميات مع التوزيع الإجمالي' : 'Tableau de Réconciliation & Suivi des Délais'}
                                            </h4>
                                            <p className="text-xs text-slate-500 font-semibold">
                                                {lang === 'ar' 
                                                    ? 'مقارنة الكميات الموزعة على دفعات التسليم مع التوزيع الإجمالي للموديل (المقاسات والألوان).' 
                                                    : 'Comparaison des quantités réparties par lots avec la répartition globale du modèle.'
                                                }
                                            </p>
                                        </div>
                                        {reconciliationDiscrepancies.hasErrors ? (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200/60 shadow-sm animate-pulse">
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                {lang === 'ar' ? 'انتباه: هناك فروقات!' : 'Attention : Écart détecté !'}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm">
                                                <CheckCircle className="w-3.5 h-3.5" />
                                                {lang === 'ar' ? 'مطابقة تامة 100%' : 'Correspondance parfaite 100%'}
                                            </span>
                                        )}
                                    </div>

                                    {reconciliationDiscrepancies.hasErrors && (
                                        <div className="bg-gradient-to-r from-rose-50 to-rose-100/30 border border-rose-150/60 rounded-xl p-4 text-rose-900 text-xs font-medium flex items-start gap-3 shadow-sm">
                                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                            <div className="space-y-1">
                                                <p className="font-bold text-rose-950">
                                                    {lang === 'ar' 
                                                        ? 'يرجى مراجعة الخانات المشار إليها باللون الأحمر. مجموع كميات الدفعات لا يطابق التوزيع الإجمالي:' 
                                                        : 'Veuillez ajuster les cases indiquées en rouge. Le total des lots ne correspond pas à la cible :'
                                                    }
                                                </p>
                                                <ul className="list-disc pl-5 space-y-0.5 font-mono text-[10px] text-rose-700 font-bold">
                                                    {colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total').map(c => {
                                                        return sizes.filter(s => s.toLowerCase() !== 'total').map((s, sIdx) => {
                                                            const diffVal = reconciliationDiscrepancies.diffs[c.id]?.[s] || 0;
                                                            if (diffVal !== 0) {
                                                                 const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                                                                 const plannedVal = planifiedTotals[c.id]?.[s] || 0;
                                                                 return (
                                                                    <li key={`${c.id}_${s}`}>
                                                                        {c.name} ({s}) : {plannedVal} planifié / {targetVal} cible ({diffVal > 0 ? `+${diffVal} de trop` : `${diffVal} manquant`})
                                                                    </li>
                                                                 );
                                                            }
                                                            return null;
                                                        });
                                                    })}
                                                </ul>
                                            </div>
                                        </div>
                                    )}

                                    <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm">
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 text-slate-700">
                                                    <th className="py-3 px-3 text-left font-extrabold border-r border-slate-200 min-w-[120px] text-[10px] uppercase tracking-wider">Couleur \ Taille</th>
                                                    {sizes.filter(s => s.toLowerCase() !== 'total').map((s, i) => (
                                                        <th key={i} className="py-2 px-2 text-center font-extrabold border-r border-slate-200 min-w-[80px] text-[10px] uppercase tracking-wider">
                                                            {s}
                                                        </th>
                                                    ))}
                                                    <th className="py-2 px-3 text-center font-black bg-slate-200/80 text-slate-800 w-28 text-[10px] uppercase tracking-wider border-l border-slate-200">TOTAL</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-150">
                                                {colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total').map((c) => {
                                                    const targetRowTotal = matrixStats.rowTotals[c.id] || 0;
                                                    const plannedRowTotal = Object.values(planifiedTotals[c.id] || {}).reduce((a, b) => a + b, 0);
                                                    const rowDiff = plannedRowTotal - targetRowTotal;
                                                    
                                                    const isRowMatching = rowDiff === 0;
                                                    const hasRowPlanned = plannedRowTotal > 0;
                                                    
                                                    let rowCellBg = "bg-slate-50/30";
                                                    let rowPlannedColor = "text-slate-700 font-bold";
                                                    if (!isRowMatching) {
                                                        rowCellBg = "bg-rose-50/40 hover:bg-rose-50/60 transition-colors";
                                                        rowPlannedColor = "text-rose-700 font-black";
                                                    } else if (hasRowPlanned) {
                                                        rowCellBg = "bg-emerald-50/30 hover:bg-emerald-50/45 transition-colors";
                                                        rowPlannedColor = "text-emerald-700 font-extrabold";
                                                    }

                                                    return (
                                                        <tr key={c.id} className="hover:bg-slate-50/30 transition-colors">
                                                            <td className="py-2.5 px-3 border-r border-slate-200 font-extrabold text-slate-700 flex items-center gap-2 bg-slate-50/20">
                                                                <div
                                                                    className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                                    style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                                />
                                                                <span className="truncate max-w-[150px]" title={c.name}>{c.name}</span>
                                                            </td>
                                                            {sizes.filter(s => s.toLowerCase() !== 'total').map((s, sIdx) => {
                                                                const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                                                                const plannedVal = planifiedTotals[c.id]?.[s] || 0;
                                                                const diff = plannedVal - targetVal;
                                                                const isMatching = diff === 0;
                                                                const hasPlanned = plannedVal > 0;

                                                                let cellBg = "bg-white";
                                                                let plannedColor = "text-slate-700 font-bold";
                                                                if (!isMatching) {
                                                                    cellBg = "bg-rose-50/20 hover:bg-rose-50/40 transition-colors";
                                                                    plannedColor = "text-rose-700 font-black";
                                                                } else if (hasPlanned) {
                                                                    cellBg = "bg-emerald-50/15 hover:bg-emerald-50/30 transition-colors";
                                                                    plannedColor = "text-emerald-700 font-extrabold";
                                                                } else {
                                                                    plannedColor = "text-slate-400 font-medium";
                                                                }
                                                                
                                                                return (
                                                                    <td key={s} className={`py-2 px-2 border-r border-slate-150/80 text-center font-mono ${cellBg}`}>
                                                                        <div className="flex flex-col items-center">
                                                                            <span className="text-[9px] text-slate-400 font-medium">
                                                                                {lang === 'ar' ? 'الهدف:' : 'Cible:'} {targetVal}
                                                                            </span>
                                                                            <span className={`text-xs ${plannedColor}`}>
                                                                                {plannedVal}
                                                                            </span>
                                                                            {diff !== 0 && (
                                                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md mt-0.5 border shadow-2xs ${
                                                                                    diff > 0 
                                                                                        ? 'text-rose-600 bg-rose-50 border-rose-100/60 animate-pulse' 
                                                                                        : 'text-amber-600 bg-amber-50 border-amber-100/60 animate-pulse'
                                                                                }`}>
                                                                                    {diff > 0 ? `+${diff}` : diff}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                );
                                                            })}
                                                            <td className={`py-2 px-3 text-center font-mono border-l border-slate-200 ${rowCellBg}`}>
                                                                <div className="flex flex-col items-center justify-center">
                                                                    <span className="text-[9px] text-slate-400 font-medium">{targetRowTotal}</span>
                                                                    <span className={`text-xs ${rowPlannedColor}`}>{plannedRowTotal}</span>
                                                                    {rowDiff !== 0 && (
                                                                        <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md mt-0.5 border border-rose-100 animate-pulse">
                                                                            {rowDiff > 0 ? `+${rowDiff}` : rowDiff}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot className="border-t-2 border-slate-250 font-bold bg-slate-50/80">
                                                <tr>
                                                    <td className="py-2.5 px-3 text-right uppercase text-[10px] tracking-wider text-slate-500 border-r border-slate-200">Total</td>
                                                    {sizes.filter(s => s.toLowerCase() !== 'total').map((s, sIdx) => {
                                                        const targetColTotal = matrixStats.colTotals[sIdx] || 0;
                                                        const plannedColTotal = colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total').reduce((sum, c) => sum + (planifiedTotals[c.id]?.[s] || 0), 0);
                                                        const colDiff = plannedColTotal - targetColTotal;
                                                        
                                                        const isColMatching = colDiff === 0;
                                                        const hasColPlanned = plannedColTotal > 0;
                                                        
                                                        let colCellBg = "bg-slate-50/40";
                                                        let colPlannedColor = "text-slate-700 font-bold";
                                                        if (!isColMatching) {
                                                            colCellBg = "bg-rose-50/30 hover:bg-rose-50/45 transition-colors";
                                                            colPlannedColor = "text-rose-700 font-black";
                                                        } else if (hasColPlanned) {
                                                            colCellBg = "bg-emerald-50/20 hover:bg-emerald-50/35 transition-colors";
                                                            colPlannedColor = "text-emerald-700 font-extrabold";
                                                        }
                                                        
                                                        return (
                                                            <td key={sIdx} className={`py-2 px-2 text-center border-r border-slate-200 font-mono ${colCellBg}`}>
                                                                <div className="flex flex-col items-center justify-center">
                                                                    <span className="text-[9px] text-slate-400 font-medium">{targetColTotal}</span>
                                                                    <span className={`text-xs ${colPlannedColor}`}>{plannedColTotal}</span>
                                                                    {colDiff !== 0 && (
                                                                        <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md mt-0.5 border border-rose-100 animate-pulse">
                                                                            {colDiff > 0 ? `+${colDiff}` : colDiff}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                    {(() => {
                                                        const targetGrandTotal = matrixStats.grandTotal;
                                                        const plannedGrandTotal = Object.values(planifiedTotals).reduce((sum, sizeMap) => sum + Object.values(sizeMap).reduce((s, val) => s + (val || 0), 0), 0);
                                                        const grandDiff = plannedGrandTotal - targetGrandTotal;
                                                        
                                                        const isGrandMatching = grandDiff === 0;
                                                        const hasGrandPlanned = plannedGrandTotal > 0;
                                                        
                                                        let grandCellClass = "";
                                                        if (!isGrandMatching) {
                                                            grandCellClass = "bg-gradient-to-br from-rose-500 to-rose-600 text-white animate-pulse shadow-md rounded-br-xl";
                                                        } else if (hasGrandPlanned) {
                                                            grandCellClass = "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md rounded-br-xl";
                                                        } else {
                                                            grandCellClass = "bg-slate-200 text-slate-700";
                                                        }
                                                        
                                                        return (
                                                            <td className={`py-2.5 px-3 text-center border-l border-slate-250 ${grandCellClass}`}>
                                                                <div className="flex flex-col items-center justify-center font-mono">
                                                                    <span className="text-[9px] opacity-75 font-semibold">{targetGrandTotal}</span>
                                                                    <span className="text-sm font-black">{plannedGrandTotal}</span>
                                                                    {grandDiff !== 0 && (
                                                                        <span className="text-[9px] font-black bg-white/20 px-1.5 py-0.5 rounded-md mt-0.5 border border-white/10">
                                                                            {grandDiff > 0 ? `+${grandDiff}` : grandDiff}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        );
                                                    })()}
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. PRODUCTION & DATA LINKED CARD (Unchanged) */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-emerald-50/50 px-6 py-3 border-b border-emerald-100 flex items-center gap-2">
                            <Factory className="w-4 h-4 text-emerald-600" />
                            <h3 className="font-bold text-emerald-800 text-sm uppercase tracking-wide">Données Techniques & Production</h3>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">

                                {/* Auto Field: Temps Article */}
                                <div className="space-y-1 relative group">
                                    <div className="flex justify-between">
                                        <label className="text-xs font-bold text-slate-400 uppercase ml-1">Temps de l'article (Min)</label>
                                        <span className="text-[9px] text-emerald-500 font-bold bg-emerald-50 px-1 rounded">AUTO</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl px-3 py-3">
                                        <Clock className="w-5 h-5 text-purple-500" />
                                        <span className="text-xl font-black text-purple-700">{tempsArticle.toFixed(2)}</span>
                                        <span className="text-xs font-bold text-purple-400 mt-1">minutes</span>
                                    </div>
                                    <div className="absolute top-full left-0 w-full text-[10px] text-slate-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        Calculé depuis la gamme ({totalTime.toFixed(2)} + Majoration)
                                    </div>
                                </div>

                                {/* Linked Input: Nombre Ouvriers */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nombre d'ouvriers</label>
                                    <div className="flex items-center gap-3 bg-white border-2 border-slate-100 hover:border-indigo-300 rounded-xl px-3 py-2.5 transition-all">
                                        <Users className="w-5 h-5 text-indigo-500" />
                                        <input
                                            type="number"
                                            min="0"
                                            value={numWorkers}
                                            onChange={(e) => setNumWorkers(Math.max(0, Number(e.target.value)))}
                                            className="w-full bg-transparent text-xl font-black text-slate-700 outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Mixed: Efficiency - Demandée Removed */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 block">Performance (P°)</label>
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-emerald-600 ml-1">Réelle (Moyenne)</span>
                                            <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-2">
                                                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                                                <input
                                                    type="number"
                                                    value={efficiency}
                                                    onChange={(e) => setEfficiency(Number(e.target.value))}
                                                    className="w-full text-sm font-bold text-emerald-700 bg-transparent outline-none"
                                                />
                                                <span className="text-xs text-emerald-500 font-bold">%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Input: Chaine */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Chaîne / Ligne</label>
                                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all h-full">
                                        <Layers className="w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={data.chaine}
                                            onChange={(e) => handleChange('chaine', e.target.value)}
                                            placeholder="Ex: Ligne A, Groupe 2..."
                                            className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                        />
                                    </div>
                                </div>

                            </div>

                            {/* Costing Footer */}
                            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Prix Client</label>
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                                        <input
                                            type="number" step="0.01"
                                            value={data.clientPrice || ''}
                                            onChange={(e) => handleChange('clientPrice', Number(e.target.value))}
                                            className="bg-transparent font-mono font-bold text-emerald-700 outline-none w-24 border-b border-slate-200 focus:border-emerald-500"
                                            placeholder="0.00"
                                        />
                                        <span className="text-xs font-bold text-slate-400">DH</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN: IMAGES & OBSERVATIONS (4 Cols) */}
                <div className="lg:col-span-4 space-y-6">

                    {/* IMAGES GRID (SIDE BY SIDE) */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* FRONT IMAGE */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col aspect-square group hover:shadow-md transition-shadow">
                            <div className="bg-slate-50/50 px-3 py-2 border-b border-slate-100 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Devant (Front)</span>
                                <button onClick={() => frontInputRef.current?.click()} className="p-1 hover:bg-slate-200 rounded text-indigo-500"><Upload className="w-3 h-3" /></button>
                            </div>
                            <div
                                className="flex-1 bg-slate-100 relative cursor-pointer overflow-hidden flex items-center justify-center"
                                onClick={() => {
                                    if (images.front) setPreviewImage({ src: images.front, title: 'Devant' });
                                    else frontInputRef.current?.click();
                                }}
                            >
                                <input type="file" ref={frontInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'front')} />
                                {isProcessingImg === 'front' ? (
                                    <div className="flex flex-col items-center gap-2 text-indigo-500">
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        <span className="text-[9px] font-bold uppercase">Compression...</span>
                                    </div>
                                ) : images.front ? (
                                    <>
                                        <img src={images.front} alt="Front" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                            <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                        <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                                        <span className="text-[10px] font-medium">Ajouter</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* BACK IMAGE */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col aspect-square group hover:shadow-md transition-shadow">
                            <div className="bg-slate-50/50 px-3 py-2 border-b border-slate-100 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Dos (Back)</span>
                                <button onClick={() => backInputRef.current?.click()} className="p-1 hover:bg-slate-200 rounded text-indigo-500"><Upload className="w-3 h-3" /></button>
                            </div>
                            <div
                                className="flex-1 bg-slate-100 relative cursor-pointer overflow-hidden flex items-center justify-center"
                                onClick={() => {
                                    if (images.back) setPreviewImage({ src: images.back, title: 'Dos' });
                                    else backInputRef.current?.click();
                                }}
                            >
                                <input type="file" ref={backInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'back')} />
                                {isProcessingImg === 'back' ? (
                                    <div className="flex flex-col items-center gap-2 text-indigo-500">
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        <span className="text-[9px] font-bold uppercase">Compression...</span>
                                    </div>
                                ) : images.back ? (
                                    <>
                                        <img src={images.back} alt="Back" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                            <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                        <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                                        <span className="text-[10px] font-medium">Ajouter</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* SECTION SPLIT TOGGLE */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-4">
                        <div>
                            <div className="text-xs font-bold text-slate-500 uppercase">Mode Préparation / Montage</div>
                            {data.sectionSplitEnabled && (
                                <div className="text-[11px] text-slate-500 mt-1">
                                    Séparation active: flux, effectifs, dates et rendement distincts.
                                </div>
                            )}
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={!!data.sectionSplitEnabled}
                                onChange={(e) => {
                                    const enabled = e.target.checked;
                                    handleChange('sectionSplitEnabled' as any, enabled as any);
                                    onSectionSplitChange?.(enabled);
                                }}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                    </div>

                    {/* OBSERVATIONS */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
                        <label className="text-xs font-bold text-slate-500 uppercase mb-2">Observations (Echantillon)</label>
                        <textarea
                            rows={6}
                            value={data.observations}
                            onChange={(e) => handleChange('observations', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:bg-white transition-all resize-none"
                            placeholder="Remarques techniques, défauts tissu, instructions spéciales..."
                        />
                    </div>

                </div>
            </div>

            {/* IMAGE PREVIEW MODAL — portaled to body so z-index is always on top */}
            {previewImage && createPortal(
                <div
                    className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/60 p-3 animate-in fade-in duration-200 sm:p-6"
                    onClick={() => setPreviewImage(null)}
                >
                    <div
                        className="relative flex w-full max-w-5xl max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.45)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-4 py-3 sm:px-5">
                            <div className="min-w-0">
                                <h3 className="truncate text-base font-black tracking-wide text-slate-800 sm:text-lg">{previewImage.title}</h3>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Aperçu haute résolution</p>
                            </div>
                            <button
                                onClick={() => setPreviewImage(null)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                            >
                                <X className="h-4 w-4" />
                                Fermer
                            </button>
                        </div>
                        <div className="relative flex-1 overflow-auto bg-[radial-gradient(circle_at_top,_#f8fafc_0%,_#e2e8f0_100%)] p-3 sm:p-5">
                            <div className="mx-auto flex min-h-full max-w-[92%] items-center justify-center rounded-2xl border border-white/80 bg-white/60 p-2 shadow-inner sm:p-4">
                                <img src={previewImage.src} alt="Full Preview" className="max-h-[74vh] w-auto max-w-full rounded-xl border border-slate-200 bg-white object-contain shadow-xl" />
                            </div>
                        </div>
                        <div className="border-t border-slate-200 bg-white px-4 py-2 text-center text-[11px] font-medium text-slate-500 sm:px-5">
                            Cliquer en dehors ou appuyer sur <span className="font-bold text-slate-700">Esc</span> pour fermer
                        </div>
                        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/50" />
                    </div>
                </div>,
                document.body
            )}

        </div>
    );
}
