import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    ImageIcon,
    Upload,
    Factory,
    Clock,
    Users,
    Activity,
    TrendingUp,
    Layers,
    X,
    Maximize2,
    Loader2,
    ChevronDown,
    Globe,
    Pause,
    Play,
    CheckCircle2,
    Check,
    Tag,
    User,
    Hash,
    LayoutGrid,
    Calendar
} from 'lucide-react';
import { FicheData, AppSettings, PlanningEvent, PlanningStatus } from '../types';
import { TEXTILE_FABRICS } from '../data/textileData';
import ExcelInput from './ExcelInput';
import RepartitionMatrix from './RepartitionMatrix';
import { compressImage } from '../utils';
import DateTimePicker from './ui/DateTimePicker';
import { pickT, Lang, tx } from '../lib/i18n';

const FICHE_LABELS = {
    fr: {
        matiere: 'Matière Principale / Désignation',
        matierePlaceholder: 'Rechercher un tissu (ex: Popeline, Denim, Jersey...)',
    },
    ar: {
        matiere: 'المادة الرئيسية / التسمية',
        matierePlaceholder: 'بحث عن قماش (مثال: Popeline، Denim...)',
    },
    en: {
        matiere: 'Main Fabric / Designation',
        matierePlaceholder: 'Search fabric (e.g. Popeline, Denim, Jersey...)',
    },
    es: {
        matiere: 'Materia principal / Designación',
        matierePlaceholder: 'Buscar un tejido (ej: Popelina, Denim, Jersey...)',
    },
    pt: {
        matiere: 'Matéria principal / Designação',
        matierePlaceholder: 'Procurar um tecido (ex: Popeline, Denim, Jersey...)',
    },
    tr: {
        matiere: 'Ana Kumaş / Tanımlama',
        matierePlaceholder: 'Kumaş ara (örn: Poplin, Denim, Süprem...)',
    },
} as const;

const PEDIDO_LABELS = {
    fr: {
        identification: 'Identification de la Commande',
        client: 'Client',
        clientPlaceholder: 'Nom du client...',
        modelRef: 'Modèle / Réf',
        modelPlaceholder: 'Référence...',
        category: 'Catégorie',
        categoryPlaceholder: 'T-Shirt, Polo...',
        optional: 'Facultatif',
        launchTitle: 'Date & Heure de Lancement',
        pickLaunchTime: 'Choisir l\'heure de lancement',
        badge24h: '24h',
        timePickerDialog: 'Sélecteur d\'heure de lancement',
        launchHelp: 'Heure en 24h — alignée avec le Planning et le Suivi à l\'enregistrement du modèle.',
        suiviLabel: 'Suivi (Coupe / Statut)',
        kisbaPlaceholder: 'Coupe (Kisba)…',
        halaPlaceholder: 'Statut (Hala)…',
        chaineLabel: 'Chaîne / Ligne',
        chainePlaceholder: 'Sélectionner une chaîne...',
    },
    ar: {
        identification: 'تعريف الطلبية',
        client: 'العميل',
        clientPlaceholder: 'اسم العميل...',
        modelRef: 'مرجع الموديل',
        modelPlaceholder: 'المرجع...',
        category: 'الفئة',
        categoryPlaceholder: 'قميص، سروال...',
        optional: 'اختياري',
        launchTitle: 'تاريخ وساعة الإطلاق',
        pickLaunchTime: 'اختر ساعة الإطلاق',
        badge24h: '24س',
        timePickerDialog: 'محدد ساعة الإطلاق',
        launchHelp: 'ساعة بنظام 24س — متوافقة مع التخطيط والتتبع عند حفظ النموذج.',
        suiviLabel: 'متابعة (فصالة / حالة)',
        kisbaPlaceholder: 'الكسبة (الفصالة)…',
        halaPlaceholder: 'الحالة…',
        chaineLabel: 'خط الإنتاج',
        chainePlaceholder: 'اختر خط الإنتاج...',
    },
    en: {
        identification: 'Order Identification',
        client: 'Customer',
        clientPlaceholder: 'Customer name...',
        modelRef: 'Model / Ref',
        modelPlaceholder: 'Reference...',
        category: 'Category',
        categoryPlaceholder: 'T-Shirt, Polo...',
        optional: 'Optional',
        launchTitle: 'Launch Date & Time',
        pickLaunchTime: 'Choose launch time',
        badge24h: '24h',
        timePickerDialog: 'Launch time selector',
        launchHelp: 'Time in 24h format — aligned with Planning and Tracking upon saving the model.',
        suiviLabel: 'Tracking (Cutting / Status)',
        kisbaPlaceholder: 'Cutting (Kisba)...',
        halaPlaceholder: 'Status (Hala)...',
        chaineLabel: 'Production Line',
        chainePlaceholder: 'Select production line...',
    },
    es: {
        identification: 'Identificación del pedido',
        client: 'Cliente',
        clientPlaceholder: 'Nombre del cliente...',
        modelRef: 'Modelo / Ref',
        modelPlaceholder: 'Referencia...',
        category: 'Categoría',
        categoryPlaceholder: 'Camiseta, Polo...',
        optional: 'Opcional',
        launchTitle: 'Fecha y hora de lanzamiento',
        pickLaunchTime: 'Elegir hora de lanzamiento',
        badge24h: '24h',
        timePickerDialog: 'Selector de hora de lanzamiento',
        launchHelp: 'Hora en formato 24h — alineada con la Planificación y el Seguimiento al guardar el modelo.',
        suiviLabel: 'Seguimiento (Corte / Estado)',
        kisbaPlaceholder: 'Corte (Kisba)...',
        halaPlaceholder: 'Estado (Hala)...',
        chaineLabel: 'Línea de producción',
        chainePlaceholder: 'Seleccionar línea de producción...',
    },
    pt: {
        identification: 'Identificação da encomenda',
        client: 'Cliente',
        clientPlaceholder: 'Nome do cliente...',
        modelRef: 'Modelo / Ref',
        modelPlaceholder: 'Referência...',
        category: 'Categoria',
        categoryPlaceholder: 'T-Shirt, Polo...',
        optional: 'Opcional',
        launchTitle: 'Data e hora de lançamento',
        pickLaunchTime: 'Escolher hora de lançamento',
        badge24h: '24h',
        timePickerDialog: 'Seletor de hora de lançamento',
        launchHelp: 'Hora em formato 24h — alinhada com o Planeamento e o Acompanhamento ao guardar o modelo.',
        suiviLabel: 'Acompanhamento (Corte / Estado)',
        kisbaPlaceholder: 'Corte (Kisba)...',
        halaPlaceholder: 'Estado (Hala)...',
        chaineLabel: 'Linha de produção',
        chainePlaceholder: 'Selecionar linha de produção...',
    },
    tr: {
        identification: 'Sipariş Tanımlama',
        client: 'Müşteri',
        clientPlaceholder: 'Müşteri adı...',
        modelRef: 'Model / Ref',
        modelPlaceholder: 'Referans...',
        category: 'Kategori',
        categoryPlaceholder: 'T-Shirt, Polo...',
        optional: 'İsteğe bağlı',
        launchTitle: 'Başlatma Tarihi ve Saati',
        pickLaunchTime: 'Başlatma saatini seçin',
        badge24h: '24s',
        timePickerDialog: 'Başlatma saati seçici',
        launchHelp: '24 saat formatında saat — model kaydedildiğinde Planlama ve Takip ile uyumlu.',
        suiviLabel: 'Takip (Kesim / Durum)',
        kisbaPlaceholder: 'Kesim (Kisba)...',
        halaPlaceholder: 'Durum (Hala)...',
        chaineLabel: 'Üretim Hattı',
        chainePlaceholder: 'Üretim hattı seçin...',
    }
} as const;

// ── Dropdown personnalisé (remplace le <select> natif pour un rendu maîtrisé) ──
type FancyOption = {
    value: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    dot: string;        // ex: 'bg-emerald-500'
    text: string;       // ex: 'text-emerald-700'
    iconColor: string;  // ex: 'text-emerald-500'
    ring: string;       // ex: 'focus-within:ring-emerald-100 ...'
    pulse?: boolean;    // animation ping (statut actif)
};

function FancySelect({
    value,
    options,
    onChange,
}: {
    value: string;
    options: FancyOption[];
    onChange: (v: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const current = options.find(o => o.value === value) ?? options[0];

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative">
            {/* Trigger */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center gap-2.5 bg-white dark:bg-dk-surface border rounded-lg px-3 py-2 transition-colors text-left ${open ? 'border-slate-400 dark:border-dk-border ring-1 ring-slate-200 dark:ring-dk-border' : 'border-slate-200 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border'}`}
            >
                <span className="relative flex h-2 w-2 shrink-0">
                    {current.pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${current.dot}`} />}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${current.dot}`} />
                </span>
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-dk-text truncate">{current.label}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* Menu */}
            {open && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-lg shadow-slate-300/40 dark:shadow-dk-bg/60 overflow-hidden p-1 animate-in fade-in slide-in-from-top-1 duration-100">
                    {options.map(o => {
                        const selected = o.value === value;
                        return (
                            <button
                                key={o.value}
                                type="button"
                                onClick={() => { onChange(o.value); setOpen(false); }}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${selected ? 'bg-slate-100 dark:bg-dk-elevated' : 'hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}
                            >
                                <span className={`h-2 w-2 rounded-full shrink-0 ${o.dot}`} />
                                <span className={`flex-1 text-left ${selected ? 'font-semibold text-slate-900 dark:text-dk-text' : 'font-medium text-slate-600 dark:text-dk-text-soft'}`}>{o.label}</span>
                                {selected && <Check className="w-3.5 h-3.5 text-slate-500 dark:text-dk-muted shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

interface FicheTechniqueProps {
    data: FicheData;
    setData: React.Dispatch<React.SetStateAction<FicheData>>;
    totalTime: number;
    tempsArticle: number;
    numWorkers: number;
    setNumWorkers: (n: number) => void;
    efficiency: number;
    setEfficiency: (n: number) => void;
    images: { front: string | null; back: string | null };
    setImages: React.Dispatch<React.SetStateAction<{ front: string | null; back: string | null }>>;
    onSectionSplitChange?: (enabled: boolean) => void;
    lang?: Lang;
    settings: AppSettings;
    /** OF de planification — pour synchroniser le statut du modèle vers ses ordres de fabrication */
    currentModelId?: string | null;
    planningEvents?: PlanningEvent[];
    setPlanningEvents?: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    articleName: string;
    setArticleName: (name: string) => void;
    articleNameError?: boolean;
}

export default function FicheTechnique({
    data,
    setData,
    totalTime,
    tempsArticle,
    numWorkers,
    setNumWorkers,
    efficiency,
    setEfficiency,
    images,
    setImages,
    onSectionSplitChange,
    lang = 'fr',
    settings,
    currentModelId,
    planningEvents,
    setPlanningEvents,
    articleName,
    setArticleName,
    articleNameError = false,
}: FicheTechniqueProps) {
    const ft = pickT(FICHE_LABELS, lang);
    const pt = pickT(PEDIDO_LABELS, lang);

    const frontInputRef = useRef<HTMLInputElement>(null);
    const backInputRef = useRef<HTMLInputElement>(null);



    const [isProcessingImg, setIsProcessingImg] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null);

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

    // Sync calculated Unit Cost back to data
    useEffect(() => {
        const computed = Number((tempsArticle * (data.costMinute || 0)).toFixed(2));
        if (data.unitCost !== computed) {
            setData(prev => ({ ...prev, unitCost: computed }));
        }
    }, [tempsArticle, data.costMinute, setData]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
        const file = e.target.files?.[0];
        if (file) {
            setIsProcessingImg(type);
            try {
                const compressedBase64 = await compressImage(file);
                setImages(prev => ({ ...prev, [type]: compressedBase64 }));
            } catch (error) {
                console.error("Image compression failed", error);
                alert(tx(lang, {
                    fr: "Erreur lors du traitement de l'image.",
                    ar: "خطأ أثناء معالجة الصورة.",
                    en: "Error processing image.",
                    es: "Error al procesar la imagen.",
                    pt: "Erro ao processar a imagem.",
                    tr: "Resim işlenirken hata oluştu."
                }));
            } finally {
                setIsProcessingImg(null);
            }
        }
    };

    const handleChange = (field: keyof FicheData, value: any) => {
        setData(prev => ({ ...prev, [field]: value }));
    };

    // ── Synchronisation Statut Production (modèle) → OF du planning ──
    const [statutSyncMsg, setStatutSyncMsg] = useState<string | null>(null);

    /** Traduit le statut métier du modèle vers le statut technique d'un OF. */
    const mapStatutToPlanning = (statut: string): { status: PlanningStatus; blockedReason?: string } => {
        switch (statut) {
            case 'En Cours': return { status: 'IN_PROGRESS' };
            case 'En Pause': return {
                status: 'BLOCKED_STOCK',
                blockedReason: tx(lang, {
                    fr: '⏸ En pause (manuel)',
                    ar: '⏸ قيد التوقف المؤقت (يدوي)',
                    en: '⏸ Paused (manual)',
                    es: '⏸ En pausa (manual)',
                    pt: '⏸ Em pausa (manual)',
                    tr: '⏸ Duraklatıldı (manuel)'
                })
            };
            case 'Clôturé': return { status: 'DONE' };
            case 'En Attente':
            default: return { status: 'READY' };
        }
    };

    const handleStatutChange = (newStatut: string) => {
        handleChange('statutProduction', newStatut);

        // Propager vers les OF liés à ce modèle
        if (!currentModelId || !planningEvents || !setPlanningEvents) return;
        const linked = planningEvents.filter(ev => ev.modelId === currentModelId);
        if (linked.length === 0) return;

        const { status, blockedReason } = mapStatutToPlanning(newStatut);
        setPlanningEvents(prev => prev.map(ev =>
            ev.modelId === currentModelId
                ? { ...ev, status, blockedReason: blockedReason ?? (ev.status === 'BLOCKED_STOCK' ? undefined : ev.blockedReason) }
                : ev
        ));

        setStatutSyncMsg(
            tx(lang, {
                fr: `${linked.length} OF synchronisé${linked.length > 1 ? 's' : ''} → ${newStatut}`,
                ar: `تم مزامنة ${linked.length} OF → ${newStatut}`,
                en: `${linked.length} OF synchronized → ${newStatut}`,
                es: `${linked.length} OF sincronizado${linked.length > 1 ? 's' : ''} → ${newStatut}`,
                pt: `${linked.length} OF sincronizado${linked.length > 1 ? 's' : ''} → ${newStatut}`,
                tr: `${linked.length} OF senkronize edildi → ${newStatut}`
            })
        );
        setTimeout(() => setStatutSyncMsg(null), 3500);
    };

    // ── Options des dropdowns personnalisés (couleur + icône par valeur) ──
    const marcheOptions: FancyOption[] = [
        {
            value: 'Local',
            label: tx(lang, {
                fr: 'Local (Marché Local)',
                ar: 'محلي (سوق محلي)',
                en: 'Local (Local Market)',
                es: 'Local (Mercado Local)',
                pt: 'Local (Mercado Local)',
                tr: 'Yerel (İç Pazar)'
            }),
            Icon: Layers,
            dot: 'bg-emerald-500',
            text: 'text-emerald-700',
            iconColor: 'text-emerald-500',
            ring: ''
        },
        {
            value: 'Export',
            label: tx(lang, {
                fr: 'Export (Europe)',
                ar: 'تصدير (أوروبا)',
                en: 'Export (Europe)',
                es: 'Exportación (Europa)',
                pt: 'Exportação (Europa)',
                tr: 'İhracat (Avrupa)'
            }),
            Icon: Globe,
            dot: 'bg-blue-500',
            text: 'text-blue-700',
            iconColor: 'text-blue-500',
            ring: ''
        },
    ];
    const statutOptions: FancyOption[] = [
        {
            value: 'En Attente',
            label: tx(lang, {
                fr: 'En Attente',
                ar: 'في الانتظار',
                en: 'Pending',
                es: 'En espera',
                pt: 'Em espera',
                tr: 'Beklemede'
            }),
            Icon: Clock,
            dot: 'bg-amber-500',
            text: 'text-amber-700',
            iconColor: 'text-amber-500',
            ring: ''
        },
        {
            value: 'En Cours',
            label: tx(lang, {
                fr: 'En Cours',
                ar: 'قيد التشغيل',
                en: 'In Progress',
                es: 'En curso',
                pt: 'Em curso',
                tr: 'Devam Ediyor'
            }),
            Icon: Play,
            dot: 'bg-emerald-500',
            text: 'text-emerald-700',
            iconColor: 'text-emerald-500',
            ring: '',
            pulse: true
        },
        {
            value: 'En Pause',
            label: tx(lang, {
                fr: 'En Pause',
                ar: 'قيد التوقف المؤقت',
                en: 'Paused',
                es: 'En pausa',
                pt: 'Em pausa',
                tr: 'Duraklatıldı'
            }),
            Icon: Pause,
            dot: 'bg-orange-500',
            text: 'text-orange-700',
            iconColor: 'text-orange-500',
            ring: ''
        },
        {
            value: 'Clôturé',
            label: tx(lang, {
                fr: 'Clôturé',
                ar: 'مغلق',
                en: 'Closed',
                es: 'Cerrado',
                pt: 'Fechado',
                tr: 'Kapatıldı'
            }),
            Icon: CheckCircle2,
            dot: 'bg-slate-500',
            text: 'text-slate-700',
            iconColor: 'text-slate-500',
            ring: ''
        },
    ];

    return (
        <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-2 duration-300 relative">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-8 space-y-6 order-2 md:order-1">
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
                        <div className="bg-slate-50/50 dark:bg-dk-elevated/60 px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-dk-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Tag className="w-4 h-4 text-indigo-500" />
                                <h3 className="font-bold text-slate-700 dark:text-dk-text text-sm uppercase tracking-wide">{pt.identification}</h3>
                            </div>
                        </div>
                        <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1">{pt.client}</label>
                                <div className="flex items-center gap-3 bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-900/30 focus-within:border-indigo-400 transition-all">
                                    <User className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                                    <input
                                        type="text"
                                        value={data.client || ''}
                                        onChange={(e) => handleChange('client', e.target.value)}
                                        placeholder={pt.clientPlaceholder}
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 dark:text-dk-text outline-none placeholder:text-slate-300 dark:placeholder:text-dk-muted"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1">{pt.modelRef}</label>
                                <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${articleNameError 
                                    ? 'bg-rose-50 dark:bg-rose-900/20 border-2 border-rose-300 dark:border-rose-700 focus-within:ring-2 focus-within:ring-rose-100 dark:focus-within:ring-rose-900/30' 
                                    : 'bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border focus-within:ring-2 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-900/30 focus-within:border-indigo-400'}`}>
                                    <Hash className={`w-4 h-4 ${articleNameError ? 'text-rose-500' : 'text-slate-400 dark:text-dk-muted'}`} />
                                    <input
                                        type="text"
                                        value={articleName}
                                        onChange={(e) => setArticleName(e.target.value)}
                                        placeholder={pt.modelPlaceholder}
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 dark:text-dk-text outline-none placeholder:text-slate-300 dark:placeholder:text-dk-muted"
                                    />
                                </div>
                            </div>

                            {/* Category Field (Optional) */}
                            <div className="space-y-1">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 ml-1">
                                    <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase">{pt.category}</label>
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{pt.optional}</span>
                                </div>
                                <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border focus-within:ring-2 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-900/30 focus-within:border-indigo-400">
                                    <LayoutGrid className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                                    <ExcelInput
                                        suggestions={["T-Shirt", "Polo", "Chemise", "Pantalon", "Robe", "Veste", "Sweat", "Short", "Jupe", "Pyjama", "Sous-vêtement"]}
                                        value={data.category || ''}
                                        onChange={(val) => handleChange('category', val)}
                                        placeholder={pt.categoryPlaceholder}
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 dark:text-dk-text outline-none placeholder:text-slate-300 dark:placeholder:text-dk-muted"
                                    />
                                </div>
                            </div>

                            {/* Suivi metadata: Kisba (Coupe) / Hala (Statut) */}
                            <div className="space-y-1 md:col-span-2">
                                <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1">{pt.suiviLabel}</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <select
                                        value={data.kisba || ''}
                                        onChange={(e) => handleChange('kisba', e.target.value)}
                                        className="bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 dark:text-dk-text outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30"
                                    >
                                        <option value="">{pt.kisbaPlaceholder}</option>
                                        <option value="COUPE">{tx(lang, {fr: 'Coupé',ar: 'مفصل',en: 'Cut',es: 'Cortado',pt: 'Cortado',tr: 'Kesildi'})}</option>
                                        <option value="EN_COURS">{tx(lang, {fr: 'En cours',ar: 'قيد التشغيل',en: 'In progress',es: 'En curso',pt: 'Em curso',tr: 'Devam ediyor'})}</option>
                                        <option value="NON_LANCE">{tx(lang, {fr: 'Non lancé',ar: 'لم يطلق',en: 'Not launched',es: 'No lanzado',pt: 'Não iniciado',tr: 'Başlatılmadı'})}</option>
                                        <option value="AUTRE">{tx(lang, {fr: 'Autre',ar: 'آخر',en: 'Other',es: 'Otro',pt: 'Outro',tr: 'Diğer'})}</option>
                                    </select>
                                    <select
                                        value={data.hala || ''}
                                        onChange={(e) => handleChange('hala', e.target.value)}
                                        className="bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 dark:text-dk-text outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30"
                                    >
                                        <option value="">{pt.halaPlaceholder}</option>
                                        <option value="EN_COURS">{tx(lang, {fr: 'En cours',ar: 'قيد التشغيل',en: 'In progress',es: 'En curso',pt: 'Em curso',tr: 'Devam ediyor'})}</option>
                                        <option value="TERMINE">{tx(lang, {fr: 'Terminé',ar: 'منتهي',en: 'Finished',es: 'Terminado',pt: 'Concluído',tr: 'Tamamlandı'})}</option>
                                        <option value="EN_ATTENTE">{tx(lang, {fr: 'En attente',ar: 'في الانتظار',en: 'Pending',es: 'En espera',pt: 'Em espera',tr: 'Beklemede'})}</option>
                                        <option value="BLOQUE">{tx(lang, {fr: 'Bloqué',ar: 'محظور',en: 'Blocked',es: 'Bloqueado',pt: 'Bloqueado',tr: 'Engellendi'})}</option>
                                    </select>
                                </div>
                            </div>

                        </div>
                    </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">{pt.modelRef}</label>
                                <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${articleNameError 
                                    ? 'bg-rose-50 border-2 border-rose-300 focus-within:ring-2 focus-within:ring-rose-100' 
                                    : 'bg-slate-50 border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400'}`}>
                                    <Hash className={`w-4 h-4 ${articleNameError ? 'text-rose-500' : 'text-slate-400'}`} />
                                    <input
                                        type="text"
                                        value={articleName}
                                        onChange={(e) => setArticleName(e.target.value)}
                                        placeholder={pt.modelPlaceholder}
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            {/* Category Field (Optional) */}
                            <div className="space-y-1">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 ml-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">{pt.category}</label>
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{pt.optional}</span>
                                </div>
                                <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all bg-slate-50 border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400">
                                    <LayoutGrid className="w-4 h-4 text-slate-400" />
                                    <ExcelInput
                                        suggestions={["T-Shirt", "Polo", "Chemise", "Pantalon", "Robe", "Veste", "Sweat", "Short", "Jupe", "Pyjama", "Sous-vêtement"]}
                                        value={data.category || ''}
                                        onChange={(val) => handleChange('category', val)}
                                        placeholder={pt.categoryPlaceholder}
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            {/* Suivi metadata: Kisba (Coupe) / Hala (Statut) */}
                            <div className="space-y-1 md:col-span-2">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">{pt.suiviLabel}</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <select
                                        value={data.kisba || ''}
                                        onChange={(e) => handleChange('kisba', e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                    >
                                        <option value="">{pt.kisbaPlaceholder}</option>
                                        <option value="COUPE">{tx(lang, {
                                            fr: 'Coupé',
                                            ar: 'مفصل',
                                            en: 'Cut',
                                            es: 'Cortado',
                                            pt: 'Cortado',
                                            tr: 'Kesildi'
                                        })}</option>
                                        <option value="EN_COURS">{tx(lang, {
                                            fr: 'En cours',
                                            ar: 'قيد التشغيل',
                                            en: 'In progress',
                                            es: 'En curso',
                                            pt: 'Em curso',
                                            tr: 'Devam ediyor'
                                        })}</option>
                                        <option value="NON_LANCE">{tx(lang, {
                                            fr: 'Non lancé',
                                            ar: 'لم يطلق',
                                            en: 'Not launched',
                                            es: 'No lanzado',
                                            pt: 'Não iniciado',
                                            tr: 'Başlatılmadı'
                                        })}</option>
                                        <option value="AUTRE">{tx(lang, {
                                            fr: 'Autre',
                                            ar: 'آخر',
                                            en: 'Other',
                                            es: 'Otro',
                                            pt: 'Outro',
                                            tr: 'Diğer'
                                        })}</option>
                                    </select>
                                    <select
                                        value={data.hala || ''}
                                        onChange={(e) => handleChange('hala', e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                    >
                                        <option value="">{pt.halaPlaceholder}</option>
                                        <option value="EN_COURS">{tx(lang, {
                                            fr: 'En cours',
                                            ar: 'قيد التشغيل',
                                            en: 'In progress',
                                            es: 'En curso',
                                            pt: 'Em curso',
                                            tr: 'Devam ediyor'
                                        })}</option>
                                        <option value="TERMINE">{tx(lang, {
                                            fr: 'Terminé',
                                            ar: 'منتهي',
                                            en: 'Finished',
                                            es: 'Terminado',
                                            pt: 'Concluído',
                                            tr: 'Tamamlandı'
                                        })}</option>
                                        <option value="EN_ATTENTE">{tx(lang, {
                                            fr: 'En attente',
                                            ar: 'في الانتظار',
                                            en: 'Pending',
                                            es: 'En espera',
                                            pt: 'Em espera',
                                            tr: 'Beklemede'
                                        })}</option>
                                        <option value="BLOQUE">{tx(lang, {
                                            fr: 'Bloqué',
                                            ar: 'محظور',
                                            en: 'Blocked',
                                            es: 'Bloqueado',
                                            pt: 'Bloqueado',
                                            tr: 'Engellendi'
                                        })}</option>
                                    </select>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* MATIERE CARD */}
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden p-4 sm:p-6 space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-dk-text-soft uppercase ml-1 flex items-center gap-2">
                                <Layers className="w-4 h-4 text-indigo-500" />
                                {ft.matiere}
                            </label>
                            <div className="flex items-center gap-3 bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-900/30 focus-within:border-indigo-400 transition-all relative">
                                <Layers className="w-4 h-4 text-slate-400 dark:text-dk-muted z-20 relative" />
                                <ExcelInput
                                    suggestions={TEXTILE_FABRICS}
                                    value={data.designation}
                                    onChange={(val) => handleChange('designation', val)}
                                    placeholder={ft.matierePlaceholder}
                                    className="w-full bg-transparent text-sm font-bold text-slate-700 dark:text-dk-text outline-none placeholder:text-slate-300 dark:placeholder:text-dk-muted pl-9 pr-3"
                                    containerClassName="absolute inset-0 flex items-center"
                                />
                            </div>
                        </div>
                    </div>

                    {/* RÉPARTITION (TAILLES / COULEURS) — même grille éditable que dans Pedido (données partagées) */}
                    <RepartitionMatrix data={data} setData={setData} lang={lang} />

                    {/* PRODUCTION & DATA LINKED CARD */}
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
                        <div className="bg-emerald-50/50 dark:bg-emerald-900/20 px-4 sm:px-6 py-3 border-b border-emerald-100 dark:border-emerald-900/30 flex items-center gap-2">
                            <Factory className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <h3 className="font-bold text-emerald-800 dark:text-emerald-300 text-sm uppercase tracking-wide">
                                {tx(lang, {fr: 'Données Techniques & Production',ar: 'البيانات التقنية والإنتاج',en: 'Technical & Production Data',es: 'Datos técnicos y de producción',pt: 'Dados técnicos e de produção',tr: 'Teknik ve Üretim Verileri'})}
                            </h3>
                        </div>
                        <div className="p-4 sm:p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">

                                {/* Auto Field: Temps Article */}
                                <div className="space-y-1 relative group">
                                    <div className="flex justify-between">
                                        <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1">{tx(lang, {fr: "Temps de l'article (Min)",ar: "وقت القطعة (Min)",en: "Article time (Min)",es: "Tiempo del artículo (Min)",pt: "Tempo do artigo (Min)",tr: "Ürün süresi (Min)"})}</label>
                                        <span className="text-[9px] text-emerald-500 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-900/30 px-1 rounded">AUTO</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-xl px-3 py-3">
                                        <Clock className="w-5 h-5 text-purple-500 dark:text-purple-400" />
                                        <span className="text-xl font-black text-purple-700 dark:text-purple-300">{tempsArticle.toFixed(2)}</span>
                                        <span className="text-xs font-bold text-purple-400 dark:text-purple-400 mt-1">{tx(lang, {fr: "minutes",ar: "دقائق",en: "minutes",es: "minutos",pt: "minutos",tr: "dakika"})}</span>
                                    </div>
                                    <div className="absolute top-full left-0 w-full text-[10px] text-slate-400 dark:text-dk-muted mt-1 opacity-0 group-hover:opacity-100 transition-opacity">{tx(lang, {fr: "Calculé depuis la gamme",ar: "محسوب من تسلسل العمليات",en: "Calculated from routing",es: "Calculado desde la gama",pt: "Calculado a partir da gama",tr: "Rotalama üzerinden hesaplandı"})} ({totalTime.toFixed(2)} + {tx(lang, {fr: "Majoration",ar: "زيادة",en: "Allowance",es: "Incremento",pt: "Acréscimo",tr: "Tolerans"})})</div>
                                </div>

                                {/* Linked Input: Nombre Ouvriers */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1">{tx(lang, {fr: "Nombre d'ouvriers",ar: "عدد العمال",en: "Number of workers",es: "Número de obreros",pt: "Número de operários",tr: "İşçi sayısı"})}</label>
                                    <div className="flex items-center gap-3 bg-white dark:bg-dk-surface border-2 border-slate-100 dark:border-dk-border hover:border-indigo-300 dark:hover:border-indigo-600 rounded-xl px-3 py-2.5 transition-all">
                                        <Users className="w-5 h-5 text-indigo-500" />
                                        <input
                                            type="number"
                                            min="0"
                                            value={numWorkers}
                                            onChange={(e) => setNumWorkers(Math.max(0, Number(e.target.value)))}
                                            className="w-full bg-transparent text-xl font-black text-slate-700 dark:text-dk-text outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Mixed: Efficiency */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1 block">{tx(lang, {fr: "Performance (P°)",ar: "الأداء (P°)",en: "Performance (P°)",es: "Rendimiento (P°)",pt: "Desempenho (P°)",tr: "Performans (P°)"})}</label>
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 ml-1">{tx(lang, {fr: "Réelle (Moyenne)",ar: "الفعلي (المتوسط)",en: "Actual (Average)",es: "Real (Media)",pt: "Real (Média)",tr: "Gerçek (Ortalama)"})}</span>
                                            <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2 py-2">
                                                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                                                <input
                                                    type="number"
                                                    value={efficiency}
                                                    onChange={(e) => setEfficiency(Number(e.target.value))}
                                                    className="w-full text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-transparent outline-none"
                                                />
                                                <span className="text-xs text-emerald-500 dark:text-emerald-400 font-bold">%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Input: Chaine */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1">{pt.chaineLabel}</label>
                                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-900/30 focus-within:border-indigo-400 transition-all h-full">
                                        <Layers className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                                        <select
                                            value={data.chaine || ''}
                                            onChange={(e) => handleChange('chaine', e.target.value)}
                                            className="w-full bg-transparent text-sm font-bold text-slate-700 dark:text-dk-text outline-none"
                                        >
                                            <option value="">{pt.chainePlaceholder}</option>
                                            {Array.from({ length: settings?.chainsCount || 4 }).map((_, i) => {
                                                const chainId = `CHAINE ${i + 1}`;
                                                const chainName = settings?.chainNames?.[chainId] || chainId;
                                                return (
                                                    <option key={chainId} value={chainId}>
                                                        {chainName}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                </div>

                            </div>

                            {/* Costing Footer */}
                            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-dk-border grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1">{tx(lang, {fr: "Prix Client",ar: "سعر العميل",en: "Customer Price",es: "Precio cliente",pt: "Preço cliente",tr: "Müşteri Fiyatı"})}</label>
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                                        <input
                                            type="number" step="0.01"
                                            value={data.clientPrice || ''}
                                            onChange={(e) => handleChange('clientPrice', Number(e.target.value))}
                                            className="bg-transparent font-mono font-bold text-emerald-700 dark:text-emerald-300 outline-none w-24 border-b border-slate-200 dark:border-dk-border focus:border-emerald-500"
                                            placeholder="0.00"
                                        />
                                        <span className="text-xs font-bold text-slate-400 dark:text-dk-muted">DH</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* PLANNING & RISK CONTROLS CARD */}
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
                        <div className="bg-indigo-50/50 dark:bg-indigo-900/20 px-4 sm:px-6 py-3 border-b border-indigo-100 dark:border-indigo-900/30 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            <h3 className="font-bold text-indigo-800 dark:text-indigo-300 text-sm uppercase tracking-wide">
                                {tx(lang, {fr: "Contrôles de Planification & Risques",ar: "مراقبة التخطيط والمخاطر",en: "Planning & Risk Controls",es: "Controles de planificación y riesgos",pt: "Controlos de planeamento e riscos",tr: "Planlama ve Risk Kontrolleri"})}
                            </h3>
                        </div>
                        <div className="p-4 sm:p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">

                                {/* Facteur de Planning */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1">{tx(lang, {fr: "Facteur de Planning",ar: "عامل التخطيط",en: "Planning Factor",es: "Factor de planificación",pt: "Fator de planeamento",tr: "Planlama Faktörü"})}</label>
                                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">{data.facteurPlanning !== undefined ? data.facteurPlanning : 60}%</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="range"
                                            min="10"
                                            max="200"
                                            step="5"
                                            value={data.facteurPlanning !== undefined ? data.facteurPlanning : 60}
                                            onChange={(e) => handleChange('facteurPlanning', Number(e.target.value))}
                                            className="w-full h-2 bg-slate-200 dark:bg-dk-elevated rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                        <input
                                            type="number"
                                            min="10"
                                            max="200"
                                            value={data.facteurPlanning !== undefined ? data.facteurPlanning : 60}
                                            onChange={(e) => handleChange('facteurPlanning', Math.max(10, Math.min(200, Number(e.target.value))))}
                                            className="w-16 text-center text-sm font-bold text-indigo-700 dark:text-indigo-300 bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-lg py-1 outline-none"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 dark:text-dk-muted leading-tight">{tx(lang, {fr: "Coefficient d'ajustement de la performance pour le calcul des dates de fin (Default: 60%).",ar: "معامل تعديل الأداء لحساب تواريخ الانتهاء (افتراضي: 60%).",en: "Performance adjustment coefficient for calculating end dates (Default: 60%).",es: "Coeficiente de ajuste de rendimiento para calcular las fechas de finalización (Predeterminado: 60%).",pt: "Coeficiente de ajuste do desempenho para o cálculo das datas de fim (Predefinido: 60%).",tr: "Bitiş tarihlerinin hesaplanması için performance düzeltme katsayısı (Varsayılan: %60)."})}</p>
                                </div>

                                {/* Buffer de Lancement */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1">{tx(lang, {fr: "Buffer de Lancement (min)",ar: "مهلة الإطلاق (min)",en: "Launch Buffer (min)",es: "Búfer de lanzamiento (min)",pt: "Buffer de lançamento (min)",tr: "Başlatma Tamponu (min)"})}</label>
                                    <div className="flex items-center gap-3 bg-white dark:bg-dk-surface border-2 border-slate-100 dark:border-dk-border hover:border-indigo-300 dark:hover:border-indigo-600 rounded-xl px-3 py-2 transition-all">
                                        <Clock className="w-5 h-5 text-indigo-500" />
                                        <input
                                            type="number"
                                            min="0"
                                            step="10"
                                            value={data.bufferLancement !== undefined ? data.bufferLancement : 120}
                                            onChange={(e) => handleChange('bufferLancement', Math.max(0, Number(e.target.value)))}
                                            className="w-full bg-transparent text-lg font-black text-slate-700 dark:text-dk-text outline-none"
                                        />
                                        <span className="text-xs text-slate-400 dark:text-dk-muted whitespace-nowrap">
                                            {Math.round(((data.bufferLancement !== undefined ? data.bufferLancement : 120) / 60) * 10) / 10} h
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 dark:text-dk-muted leading-tight">{tx(lang, {fr: "Temps nécessaire à la préparation des machines avant production (Default: 120 min / 2h).",ar: "الوقت اللازم لإعداد الآلات قبل الإنتاج (افتراضي: 120 min / 2h).",en: "Time required to prepare machines before production (Default: 120 min / 2h).",es: "Tiempo necesario para preparar las máquinas antes de la producción (Predeterminado: 120 min / 2h).",pt: "Tempo necessário para a preparação das máquinas antes da produção (Predefinido: 120 min / 2h).",tr: "Üretim öncesinde makinelerin hazırlanması için gereken süre (Varsayılan: 120 min / 2h)."})}</p>
                                </div>

                                {/* Type de Marché */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1">{tx(lang, {fr: "Type de Marché",ar: "نوع السوق",en: "Market Type",es: "Tipo de mercado",pt: "Tipo de mercado",tr: "Pazar Türü"})}</label>
                                    <FancySelect
                                        value={data.typeMarche || 'Local'}
                                        options={marcheOptions}
                                        onChange={(v) => handleChange('typeMarche', v)}
                                    />
                                    <p className="text-[10px] text-slate-400 dark:text-dk-muted leading-tight">{tx(lang, {fr: "Configure les règles de planification, de transit et de coûts.",ar: "يضبط قواعد التخطيط والعبور والتكاليف.",en: "Configures planning, transit, and cost rules.",es: "Configura las reglas de planificación, tránsito y costes.",pt: "Configura as regras de planeamento, trânsito e custos.",tr: "Planlama, transit ve maliyet kurallarını yapılandırır."})}</p>
                                </div>

                                {/* Statut Production */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase ml-1">{tx(lang, {fr: "Statut Production",ar: "حالة الإنتاج",en: "Production Status",es: "Estado de producción",pt: "Estado da produção",tr: "Üretim Durumu"})}</label>
                                    <FancySelect
                                        value={data.statutProduction || 'En Attente'}
                                        options={statutOptions}
                                        onChange={handleStatutChange}
                                    />
                                    <p className="text-[10px] text-slate-400 dark:text-dk-muted leading-tight">{tx(lang, {fr: "Statut opérationnel du modèle dans l'atelier.",ar: "الحالة التشغيلية للموديل في الورشة.",en: "Operational status of the model in the workshop.",es: "Estado operativo del modelo en el taller.",pt: "Estado operacional do modelo na oficina.",tr: "Atölyedeki modelin operasyonel durumu."})}</p>
                                    {statutSyncMsg && (
                                        <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 px-2 py-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-300 animate-in fade-in slide-in-from-bottom-1">
                                            <CheckCircle2 className="w-3 h-3" /> {statutSyncMsg}
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Market Type Rule Alerts */}
                            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-dk-border">
                                {data.typeMarche === 'Export' ? (
                                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3">
                                        <div className="bg-blue-500 text-white rounded-full p-1 mt-0.5">
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide font-sans">{tx(lang, {fr: "Règles Spéciales Export (Europe)",ar: "قواعد خاصة بالتصدير (أوروبا)",en: "Special Export Rules (Europe)",es: "Reglas especiales de exportación (Europa)",pt: "Regras especiais de exportação (Europa)",tr: "Özel İhracat Kuralları (Avrupa)"})}</h4>
                                            <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 leading-normal font-sans">
                                                {tx(lang, {fr: "- Un ",ar: "- يتم تلقائيًا خصم ",en: "- A ",es: "- Se deduce automáticamente un ",pt: "- Um ",tr: "- Gümrük ve paketleme için planlamadaki DDS'den otomatik olarak 3 günlük bir "})}
                                                <strong>{tx(lang, {fr: "Buffer de Transit de 3 jours",ar: "مهلة عبور مدتها 3 أيام",en: "3-day Transit Buffer",es: "búfer de tránsito de 3 días",pt: "Buffer de trânsito de 3 dias",tr: "Transit Tamponu"})}</strong>
                                                {tx(lang, {fr: " est automatiquement déduit du DDS dans le planning pour la douane et l'emballage.",ar: " من DDS في التخطيط للجمارك والتعبئة.",en: " is automatically deducted from DDS in the planning for customs and packaging.",es: " de DDS en la planificación para la aduana y el embalaje.",pt: " é deduzido automaticamente do DDS no planeamento para a alfândega e embalagem.",tr: " düşülür."})}
                                                <br />
                                                {tx(lang, {fr: "- L'analyse des coûts (Revenant) se concentre sur la ",ar: "- يركز تحليل التكاليف (سعر التكلفة) على ",en: "- Cost analysis focuses on ",es: "- El análisis de costes se centra únicamente en la ",pt: "- A análise de custos foca-se apenas na ",tr: "- Maliyet analizi yalnızca "})}
                                                <strong>{tx(lang, {fr: "Main d'œuvre",ar: "اليد العاملة",en: "Labor",es: "mano de obra",pt: "mão de obra",tr: "İşçilik"})}</strong>
                                                {tx(lang, {fr: " uniquement (Matières fournies par le client).",ar: " فقط (المواد المقدمة من العميل).",en: " only (Materials supplied by the customer).",es: " (Materiales proporcionados por el cliente).",pt: " (Matérias fornecidas pelo cliente).",tr: " üzerine odaklanır (Malzemeler müşteri tarafından sağlanır)."})}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-start gap-3">
                                        <div className="bg-emerald-500 text-white rounded-full p-1 mt-0.5">
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide font-sans">{tx(lang, {fr: "Règles Spéciales Marché Local",ar: "قواعد خاصة بالسوق المحلي",en: "Special Local Market Rules",es: "Reglas especiales de mercado local",pt: "Regras especiais de mercado local",tr: "Özel Yerel Pazar Kuralları"})}</h4>
                                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 leading-normal font-sans">
                                                {tx(lang, {fr: "- La ",ar: "- إن ",en: "- The ",es: "- La ",pt: "- A ",tr: "- "})}
                                                <strong>{tx(lang, {fr: "BOM (Matrice de matières)",ar: "BOM (جدول المواد)",en: "BOM (Bill of Materials)",es: "BOM (matriz de materias)",pt: "BOM (matriz de matérias)",tr: "BOM (Malzeme Listesi)"})}</strong>
                                                {tx(lang, {fr: " et l'évaluation du stock magasin sont obligatoires.",ar: " وتقييم مخزون المستودع إلزاميان.",en: " and store stock evaluation are mandatory.",es: " y la evaluación del stock de almacén son obligatorias.",pt: " e a avaliação do stock do armazém são obrigatórias.",tr: " ve mağaza stok değerlendirmesi zorunludur."})}
                                                <br />
                                                {tx(lang, {fr: "- Toute pénurie de matière bloquera automatiquement l'ordre de fabrication (Statut: ",ar: "- أي نقص في المواد سيؤدي تلقائيًا إلى حظر أمر التصنيع (الحالة: ",en: "- Any material shortage will automatically block the production order (Status: ",es: "- Cualquier escasez de material bloqueará automáticamente la orden de fabricación (Estado: ",pt: "- Qualquer escassez de material bloqueará automaticamente a ordem de fabrico (Estado: ",tr: "- Herhangi bir malzeme eksikliği, başlatmadan önce üretim emrini otomatik olarak engelleyecektir (Durum: "})}<strong>BLOCKED_STOCK</strong>{tx(lang, {fr: ") avant le lancement.",ar: ") قبل الإطلاق.",en: ") before launch.",es: ") antes del lanzamiento.",pt: ") antes do lançamento.",tr: ")."})}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN: IMAGES & OBSERVATIONS (4 Cols) */}
                <div className="md:col-span-4 space-y-6 order-1 md:order-2 md:sticky md:top-4">

                    {/* IMAGES GRID (SIDE BY SIDE) */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* FRONT IMAGE */}
                        <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-dk-surface/90 backdrop-blur-sm border border-slate-200/80 dark:border-dk-border/80 px-2 py-1 shadow-sm">
                                <span className="text-[9px] font-black tracking-widest text-slate-600 dark:text-dk-text-soft uppercase">{tx(lang, { fr: 'Devant', ar: 'أمام', en: 'Front', es: 'Frente', pt: 'Frente', tr: 'Ön' })}</span>
                            </div>
                            <button
                                onClick={() => frontInputRef.current?.click()}
                                className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-indigo-500 px-2 py-1 text-[9px] font-bold text-white shadow-md transition-all hover:bg-indigo-600 hover:shadow-lg active:scale-95"
                            >
                                <Upload className="w-2.5 h-2.5" />
                                {tx(lang, { fr: 'Photo', ar: 'صورة', en: 'Photo', es: 'Foto', pt: 'Foto', tr: 'Fotoğraf' })}
                            </button>
                            <div
                                className="aspect-[3/4] w-full bg-gradient-to-br from-slate-100 dark:from-dk-elevated to-slate-50 dark:to-dk-surface relative cursor-pointer overflow-hidden flex items-center justify-center"
                                onClick={() => {
                                    if (images.front) setPreviewImage({src: images.front,title: tx(lang, { fr: 'Devant', ar: 'أمام', en: 'Front', es: 'Frente', pt: 'Frente', tr: 'Ön' })});
                                    else frontInputRef.current?.click();
                                }}
                            >
                                <input type="file" ref={frontInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'front')} />
                                {isProcessingImg === 'front' ? (
                                    <div className="flex flex-col items-center gap-2 text-indigo-500">
                                        <Loader2 className="w-7 h-7 animate-spin" />
                                        <span className="text-[9px] font-bold uppercase tracking-wider">{tx(lang, { fr: 'Compression...', ar: 'ضغط...', en: 'Compressing...', es: 'Comprimiendo...', pt: 'A comprimir...', tr: 'Sıkıştırılıyor...' })}</span>
                                    </div>
                                ) : images.front ? (
                                    <>
                                        <img src={images.front} alt="Front" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                                            <div className="flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-dk-surface/90 backdrop-blur-sm px-3 py-1.5 text-[10px] font-bold text-slate-700 dark:text-dk-text shadow">
                                                <Maximize2 className="w-3 h-3" /> {tx(lang, { fr: 'Aperçu', ar: 'معاينة', en: 'Preview', es: 'Vista previa', pt: 'Visualizar', tr: 'Önizleme' })}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-dk-muted p-4">
                                        <div className="rounded-full bg-slate-200/70 dark:bg-dk-elevated p-3">
                                            <ImageIcon className="w-6 h-6" />
                                        </div>
                                        <span className="text-[10px] font-semibold text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Ajouter photo', ar: 'إضافة صورة', en: 'Add photo', es: 'Añadir foto', pt: 'Adicionar foto', tr: 'Fotoğraf ekle' })}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* BACK IMAGE */}
                        <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-dk-surface/90 backdrop-blur-sm border border-slate-200/80 dark:border-dk-border/80 px-2 py-1 shadow-sm">
                                <span className="text-[9px] font-black tracking-widest text-slate-600 dark:text-dk-text-soft uppercase">{tx(lang, { fr: 'Dos', ar: 'ظهر', en: 'Back', es: 'Espalda', pt: 'Costas', tr: 'Arka' })}</span>
                            </div>
                            <button
                                onClick={() => backInputRef.current?.click()}
                                className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-indigo-500 px-2 py-1 text-[9px] font-bold text-white shadow-md transition-all hover:bg-indigo-600 hover:shadow-lg active:scale-95"
                            >
                                <Upload className="w-2.5 h-2.5" />
                                {tx(lang, { fr: 'Photo', ar: 'صورة', en: 'Photo', es: 'Foto', pt: 'Foto', tr: 'Fotoğraf' })}
                            </button>
                            <div
                                className="aspect-[3/4] w-full bg-gradient-to-br from-slate-100 dark:from-dk-elevated to-slate-50 dark:to-dk-surface relative cursor-pointer overflow-hidden flex items-center justify-center"
                                onClick={() => {
                                    if (images.back) setPreviewImage({src: images.back,title: tx(lang, { fr: 'Dos', ar: 'ظهر', en: 'Back', es: 'Espalda', pt: 'Costas', tr: 'Arka' })});
                                    else backInputRef.current?.click();
                                }}
                            >
                                <input type="file" ref={backInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'back')} />
                                {isProcessingImg === 'back' ? (
                                    <div className="flex flex-col items-center gap-2 text-indigo-500">
                                        <Loader2 className="w-7 h-7 animate-spin" />
                                        <span className="text-[9px] font-bold uppercase tracking-wider">{tx(lang, { fr: 'Compression...', ar: 'ضغط...', en: 'Compressing...', es: 'Comprimiendo...', pt: 'A comprimir...', tr: 'Sıkıştırılıyor...' })}</span>
                                    </div>
                                ) : images.back ? (
                                    <>
                                        <img src={images.back} alt="Back" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                                            <div className="flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-dk-surface/90 backdrop-blur-sm px-3 py-1.5 text-[10px] font-bold text-slate-700 dark:text-dk-text shadow">
                                                <Maximize2 className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Aperçu', ar: 'معاينة', en: 'Preview', es: 'Vista previa', pt: 'Visualizar', tr: 'Önizleme' })}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-dk-muted p-4">
                                        <div className="rounded-full bg-slate-200/70 dark:bg-dk-elevated p-3">
                                            <ImageIcon className="w-6 h-6" />
                                        </div>
                                        <span className="text-[10px] font-semibold text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Ajouter photo', ar: 'إضافة صورة', en: 'Add photo', es: 'Añadir photo', pt: 'Adicionar foto', tr: 'Fotoğraf ekle' })}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* SECTION SPLIT TOGGLE */}
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm p-4 flex items-center justify-between gap-4 font-sans">
                        <div>
                            <div className="text-xs font-bold text-slate-500 dark:text-dk-text-soft uppercase">{tx(lang, {fr: "Mode Préparation / Montage",ar: "وضع التحضير / التركيب",en: "Preparation / Assembly Mode",es: "Modo de preparación / montaje",pt: "Modo de preparação / montagem",tr: "Hazırlık / Montaj Modu"})}</div>
                            {data.sectionSplitEnabled && (
                                <div className="text-[11px] text-slate-500 dark:text-dk-text-soft mt-1">{tx(lang, {fr: "Séparation active: flux, effectifs, dates et rendement distincts.",ar: "الفصل نشط: تدفق، عمالة، تواريخ وإنتاجية منفصلة.",en: "Active separation: distinct flow, workforce, dates, and yield.",es: "Separación activa: flujo, personal, fechas y rendimiento distintos.",pt: "Separação ativa: fluxo, pessoal, datas e rendimento distintos.",tr: "Aktif ayırma: belirgin akış, iş gücü, tarihler ve verim."})}</div>
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
                            <div className="w-11 h-6 bg-slate-200 dark:bg-dk-elevated peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-dk-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                    </div>

                    {/* OBSERVATIONS */}
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm p-4 flex flex-col font-sans">
                        <label className="text-xs font-bold text-slate-500 dark:text-dk-text-soft uppercase mb-2">{tx(lang, {fr: "Observations (Echantillon)",ar: "ملاحظات (العينة)",en: "Observations (Sample)",es: "Observaciones (Muestra)",pt: "Observações (Amostra)",tr: "Gözlemler (Numune)"})}</label>
                        <textarea
                            rows={6}
                            value={data.observations}
                            onChange={(e) => handleChange('observations', e.target.value)}
                            className="w-full bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-xl p-3 text-sm text-slate-700 dark:text-dk-text outline-none focus:border-indigo-400 dark:focus:border-indigo-500 focus:bg-white dark:focus:bg-dk-surface transition-all resize-none"
                            placeholder={tx(lang, {fr: "Remarques techniques, défauts tissu, instructions spéciales...",ar: "ملاحظات تقنية، عيوب القماش، تعليمات خاصة...",en: "Technical remarks, fabric defects, special instructions...",es: "Observaciones técnicas, defectos del tejido, instrucciones especiales...",pt: "Observações técnicas, defeitos do tecido, instruções especiais...",tr: "Teknik açıklamalar, kumaş hataları, özel talimatlar..."})}
                        />
                    </div>

                </div>
            </div>

            {/* IMAGE PREVIEW MODAL */}
            {previewImage && createPortal(
                <div
                    className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/60 dark:bg-dk-bg/80 p-3 animate-in fade-in duration-200 sm:p-6"
                    onClick={() => setPreviewImage(null)}
                >
                    <div
                        className="relative flex w-full max-w-5xl max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-slate-200/80 dark:border-dk-border/80 bg-white dark:bg-dk-surface shadow-[0_20px_80px_rgba(15,23,42,0.45)] dark:shadow-[0_20px_80px_rgba(0,0,0,0.6)] font-sans"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-dk-border bg-gradient-to-r from-slate-50 dark:from-dk-elevated/60 via-white dark:via-dk-surface to-slate-50 dark:to-dk-elevated/60 px-4 py-3 sm:px-5">
                            <div className="min-w-0">
                                <h3 className="truncate text-base font-black tracking-wide text-slate-800 dark:text-dk-text sm:text-lg">{previewImage.title}</h3>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-dk-muted">{tx(lang, {fr: "Aperçu haute résolution",ar: "معاينة بدقة عالية",en: "High resolution preview",es: "Vista previa en alta resolución",pt: "Visualização em alta résolution",tr: "Yüksek çözünürlüklü önizleme"})}</p>
                            </div>
                            <button
                                onClick={() => setPreviewImage(null)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-dk-text-soft shadow-sm transition hover:border-slate-300 dark:hover:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 hover:text-slate-900 dark:hover:text-dk-text"
                            >
                                <X className="h-4 w-4" />
                                {tx(lang, { fr: 'Fermer', ar: 'إغلاق', en: 'Close', es: 'Cerrar', pt: 'Fechar', tr: 'Kapat' })}
                            </button>
                        </div>
                        <div className="relative flex-1 overflow-auto bg-[radial-gradient(circle_at_top,_#f8fafc_0%,_#e2e8f0_100%)] dark:bg-[radial-gradient(circle_at_top,_#1c2830_0%,_#151f24_100%)] p-3 sm:p-5">
                            <div className="mx-auto flex min-h-full max-w-[92%] items-center justify-center rounded-2xl border border-white/80 dark:border-dk-border/50 bg-white/60 dark:bg-dk-surface/60 p-2 shadow-inner sm:p-4">
                                <img src={previewImage.src} alt="Full Preview" className="max-h-[74vh] w-auto max-w-full rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface object-contain shadow-xl" />
                            </div>
                        </div>
                        <div className="border-t border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-4 py-2 text-center text-[11px] font-medium text-slate-500 dark:text-dk-muted sm:px-5">
                            {tx(lang, {fr: "Cliquer en dehors ou appuyer sur ",ar: "انقر بالخارج أو اضغط على ",en: "Click outside or press ",es: "Haga clic fuera o presione ",pt: "Clique fora ou prima ",tr: "Dışarıya tıklayın veya "})}
                            <span className="font-bold text-slate-700 dark:text-dk-text">Esc</span>
                            {tx(lang, {fr: " pour fermer",ar: " للإغلاق",en: " to close",es: " para cerrar",pt: " para fechar",tr: " tuşuna basarak kapatın"})}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
