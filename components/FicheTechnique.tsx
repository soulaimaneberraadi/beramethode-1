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

const FICHE_LABELS = {
    fr: {
        matiere: 'Matière Principale / Désignation',
        matierePlaceholder: 'Rechercher un tissu (ex: Popeline, Denim, Jersey...)',
    },
    ar: {
        matiere: 'المادة الرئيسية / التسمية',
        matierePlaceholder: 'بحث عن قماش (مثال: Popeline، Denim...)',
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
                className={`w-full flex items-center gap-2.5 bg-white border rounded-lg px-3 py-2 transition-colors text-left ${open ? 'border-slate-400 ring-1 ring-slate-200' : 'border-slate-200 hover:border-slate-300'}`}
            >
                <span className="relative flex h-2 w-2 shrink-0">
                    {current.pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${current.dot}`} />}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${current.dot}`} />
                </span>
                <span className="flex-1 text-sm font-medium text-slate-800 truncate">{current.label}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* Menu */}
            {open && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-300/40 overflow-hidden p-1 animate-in fade-in slide-in-from-top-1 duration-100">
                    {options.map(o => {
                        const selected = o.value === value;
                        return (
                            <button
                                key={o.value}
                                type="button"
                                onClick={() => { onChange(o.value); setOpen(false); }}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${selected ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                            >
                                <span className={`h-2 w-2 rounded-full shrink-0 ${o.dot}`} />
                                <span className={`flex-1 text-left ${selected ? 'font-semibold text-slate-900' : 'font-medium text-slate-600'}`}>{o.label}</span>
                                {selected && <Check className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
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
    lang?: 'fr' | 'ar';
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
    const ft = FICHE_LABELS[lang];
    const pt = PEDIDO_LABELS[lang];

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
                alert("Erreur lors du traitement de l'image.");
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
            case 'En Pause': return { status: 'BLOCKED_STOCK', blockedReason: '⏸ En pause (manuel)' };
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

        setStatutSyncMsg(`${linked.length} OF synchronisé${linked.length > 1 ? 's' : ''} → ${newStatut}`);
        setTimeout(() => setStatutSyncMsg(null), 3500);
    };

    // ── Options des dropdowns personnalisés (couleur + icône par valeur) ──
    const marcheOptions: FancyOption[] = [
        { value: 'Local', label: 'Local (Marché Local)', Icon: Layers, dot: 'bg-emerald-500', text: 'text-emerald-700', iconColor: 'text-emerald-500', ring: '' },
        { value: 'Export', label: 'Export (Europe)', Icon: Globe, dot: 'bg-blue-500', text: 'text-blue-700', iconColor: 'text-blue-500', ring: '' },
    ];
    const statutOptions: FancyOption[] = [
        { value: 'En Attente', label: 'En Attente', Icon: Clock, dot: 'bg-amber-500', text: 'text-amber-700', iconColor: 'text-amber-500', ring: '' },
        { value: 'En Cours', label: 'En Cours', Icon: Play, dot: 'bg-emerald-500', text: 'text-emerald-700', iconColor: 'text-emerald-500', ring: '', pulse: true },
        { value: 'En Pause', label: 'En Pause', Icon: Pause, dot: 'bg-orange-500', text: 'text-orange-700', iconColor: 'text-orange-500', ring: '' },
        { value: 'Clôturé', label: 'Clôturé', Icon: CheckCircle2, dot: 'bg-slate-500', text: 'text-slate-700', iconColor: 'text-slate-500', ring: '' },
    ];

    return (
        <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-2 duration-300 relative">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">

                {/* LEFT COLUMN: DATA INPUTS (8 Cols) */}
                <div className="md:col-span-8 space-y-6 order-2 md:order-1">

                    {/* 1. GENERAL INFO CARD */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Tag className="w-4 h-4 text-indigo-500" />
                                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{pt.identification}</h3>
                            </div>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">{pt.client}</label>
                                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all">
                                    <User className="w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={data.client || ''}
                                        onChange={(e) => handleChange('client', e.target.value)}
                                        placeholder={pt.clientPlaceholder}
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                    />
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

                        </div>
                    </div>

                    {/* MATIERE CARD */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1 flex items-center gap-2">
                                <Layers className="w-4 h-4 text-indigo-500" />
                                {ft.matiere}
                            </label>
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
                    </div>

                    {/* RÉPARTITION (TAILLES / COULEURS) — même grille éditable que dans Pedido (données partagées) */}
                    <RepartitionMatrix data={data} setData={setData} lang={lang} />

                    {/* PRODUCTION & DATA LINKED CARD */}
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

                                {/* Mixed: Efficiency */}
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

                    {/* PLANNING & RISK CONTROLS CARD */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-indigo-50/50 px-6 py-3 border-b border-indigo-100 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-indigo-600" />
                            <h3 className="font-bold text-indigo-800 text-sm uppercase tracking-wide">Contrôles de Planification & Risques</h3>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">

                                {/* Facteur de Planning */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-slate-400 uppercase ml-1">Facteur de Planning</label>
                                        <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                                            {data.facteurPlanning !== undefined ? data.facteurPlanning : 60}%
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="range"
                                            min="10"
                                            max="200"
                                            step="5"
                                            value={data.facteurPlanning !== undefined ? data.facteurPlanning : 60}
                                            onChange={(e) => handleChange('facteurPlanning', Number(e.target.value))}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                        <input
                                            type="number"
                                            min="10"
                                            max="200"
                                            value={data.facteurPlanning !== undefined ? data.facteurPlanning : 60}
                                            onChange={(e) => handleChange('facteurPlanning', Math.max(10, Math.min(200, Number(e.target.value))))}
                                            className="w-16 text-center text-sm font-bold text-indigo-700 bg-slate-50 border border-slate-200 rounded-lg py-1 outline-none"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 leading-tight">
                                        Coefficient d'ajustement de la performance pour le calcul des dates de fin (Default: 60%).
                                    </p>
                                </div>

                                {/* Buffer de Lancement */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Buffer de Lancement (min)</label>
                                    <div className="flex items-center gap-3 bg-white border-2 border-slate-100 hover:border-indigo-300 rounded-xl px-3 py-2 transition-all">
                                        <Clock className="w-5 h-5 text-indigo-500" />
                                        <input
                                            type="number"
                                            min="0"
                                            step="10"
                                            value={data.bufferLancement !== undefined ? data.bufferLancement : 120}
                                            onChange={(e) => handleChange('bufferLancement', Math.max(0, Number(e.target.value)))}
                                            className="w-full bg-transparent text-lg font-black text-slate-700 outline-none"
                                        />
                                        <span className="text-xs text-slate-400 whitespace-nowrap">
                                            {Math.round(((data.bufferLancement !== undefined ? data.bufferLancement : 120) / 60) * 10) / 10} h
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 leading-tight">
                                        Temps nécessaire à la préparation des machines avant production (Default: 120 min / 2h).
                                    </p>
                                </div>

                                {/* Type de Marché */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Type de Marché</label>
                                    <FancySelect
                                        value={data.typeMarche || 'Local'}
                                        options={marcheOptions}
                                        onChange={(v) => handleChange('typeMarche', v)}
                                    />
                                    <p className="text-[10px] text-slate-400 leading-tight">
                                        Configure les règles de planification, de transit et de coûts.
                                    </p>
                                </div>

                                {/* Statut Production */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Statut Production</label>
                                    <FancySelect
                                        value={data.statutProduction || 'En Attente'}
                                        options={statutOptions}
                                        onChange={handleStatutChange}
                                    />
                                    <p className="text-[10px] text-slate-400 leading-tight">
                                        Statut opérationnel du modèle dans l'atelier.
                                    </p>
                                    {statutSyncMsg && (
                                        <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-indigo-50 border border-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-600 animate-in fade-in slide-in-from-bottom-1">
                                            <CheckCircle2 className="w-3 h-3" /> {statutSyncMsg}
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Market Type Rule Alerts */}
                            <div className="mt-6 pt-4 border-t border-slate-100">
                                {data.typeMarche === 'Export' ? (
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                                        <div className="bg-blue-500 text-white rounded-full p-1 mt-0.5">
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide font-sans">Règles Spéciales Export (Europe)</h4>
                                            <p className="text-[11px] text-blue-600 mt-1 leading-normal font-sans">
                                                - Un <strong>Buffer de Transit de 3 jours</strong> est automatiquement déduit du DDS dans le planning pour la douane et l'emballage.<br />
                                                - L'analyse des coûts (Revenant) se concentre sur la <strong>Main d'œuvre</strong> uniquement (Matières fournies par le client).
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                                        <div className="bg-emerald-500 text-white rounded-full p-1 mt-0.5">
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wide font-sans">Règles Spéciales Marché Local</h4>
                                            <p className="text-[11px] text-emerald-600 mt-1 leading-normal font-sans">
                                                - La <strong>BOM (Matrice de matières)</strong> et l'évaluation du stock magasin sont obligatoires.<br />
                                                - Toute pénurie de matière bloquera automatiquement l'ordre de fabrication (Statut: <strong>BLOCKED_STOCK</strong>) avant le lancement.
                                            </p>
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
                        <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                            {/* Label badge */}
                            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-slate-200/80 px-2 py-1 shadow-sm">
                                <span className="text-[9px] font-black tracking-widest text-slate-600 uppercase">Devant</span>
                            </div>
                            {/* Upload button */}
                            <button
                                onClick={() => frontInputRef.current?.click()}
                                className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-indigo-500 px-2 py-1 text-[9px] font-bold text-white shadow-md transition-all hover:bg-indigo-600 hover:shadow-lg active:scale-95"
                            >
                                <Upload className="w-2.5 h-2.5" />
                                Photo
                            </button>
                            {/* Image area */}
                            <div
                                className="aspect-[3/4] w-full bg-gradient-to-br from-slate-100 to-slate-50 relative cursor-pointer overflow-hidden flex items-center justify-center"
                                onClick={() => {
                                    if (images.front) setPreviewImage({ src: images.front, title: 'Devant' });
                                    else frontInputRef.current?.click();
                                }}
                            >
                                <input type="file" ref={frontInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'front')} />
                                {isProcessingImg === 'front' ? (
                                    <div className="flex flex-col items-center gap-2 text-indigo-500">
                                        <Loader2 className="w-7 h-7 animate-spin" />
                                        <span className="text-[9px] font-bold uppercase tracking-wider">Compression...</span>
                                    </div>
                                ) : images.front ? (
                                    <>
                                        <img src={images.front} alt="Front" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                                            <div className="flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1.5 text-[10px] font-bold text-slate-700 shadow">
                                                <Maximize2 className="w-3 h-3" /> Aperçu
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400 p-4">
                                        <div className="rounded-full bg-slate-200/70 p-3">
                                            <ImageIcon className="w-6 h-6" />
                                        </div>
                                        <span className="text-[10px] font-semibold text-slate-400">Ajouter photo</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* BACK IMAGE */}
                        <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                            {/* Label badge */}
                            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-slate-200/80 px-2 py-1 shadow-sm">
                                <span className="text-[9px] font-black tracking-widest text-slate-600 uppercase">Dos</span>
                            </div>
                            {/* Upload button */}
                            <button
                                onClick={() => backInputRef.current?.click()}
                                className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-indigo-500 px-2 py-1 text-[9px] font-bold text-white shadow-md transition-all hover:bg-indigo-600 hover:shadow-lg active:scale-95"
                            >
                                <Upload className="w-2.5 h-2.5" />
                                Photo
                            </button>
                            {/* Image area */}
                            <div
                                className="aspect-[3/4] w-full bg-gradient-to-br from-slate-100 to-slate-50 relative cursor-pointer overflow-hidden flex items-center justify-center"
                                onClick={() => {
                                    if (images.back) setPreviewImage({ src: images.back, title: 'Dos' });
                                    else backInputRef.current?.click();
                                }}
                            >
                                <input type="file" ref={backInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'back')} />
                                {isProcessingImg === 'back' ? (
                                    <div className="flex flex-col items-center gap-2 text-indigo-500">
                                        <Loader2 className="w-7 h-7 animate-spin" />
                                        <span className="text-[9px] font-bold uppercase tracking-wider">Compression...</span>
                                    </div>
                                ) : images.back ? (
                                    <>
                                        <img src={images.back} alt="Back" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                                            <div className="flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1.5 text-[10px] font-bold text-slate-700 shadow">
                                                <Maximize2 className="w-3 h-3" /> Aperçu
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400 p-4">
                                        <div className="rounded-full bg-slate-200/70 p-3">
                                            <ImageIcon className="w-6 h-6" />
                                        </div>
                                        <span className="text-[10px] font-semibold text-slate-400">Ajouter photo</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* SECTION SPLIT TOGGLE */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-4 font-sans">
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
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col font-sans">
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

            {/* IMAGE PREVIEW MODAL */}
            {previewImage && createPortal(
                <div
                    className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/60 p-3 animate-in fade-in duration-200 sm:p-6"
                    onClick={() => setPreviewImage(null)}
                >
                    <div
                        className="relative flex w-full max-w-5xl max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.45)] font-sans"
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
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
