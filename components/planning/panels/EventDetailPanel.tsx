import React from 'react';
import { X, Edit2, Split, Copy, Trash2, Calendar, Package, Clock, Truck, AlertTriangle, Plus, CheckCircle2, Maximize2, Minimize2 } from 'lucide-react';
import type { ModelData, PlanningEvent, AppSettings } from '../../../types';
import MaterialArrivalTimeline from '../MaterialArrivalTimeline';
import { evClientName, evModelName, evModelThumb, evProduced, evQty, evProgressPct, evStartYmd, evEndYmd, evDeadlineYmd } from '../shared/eventAccessors';
import { fmtLong, daysBetween, todayYmd } from '../shared/dateFmt';
import { delayOf } from '../hooks/useDelayIndicator';
import { DELAY_META, STATUS_META, toWorkStatus } from '../shared/statusConfig';
import { getClientColor } from '../shared/clientColors';
import { getModelColor } from '../shared/modelColors';
import { useIsMobile } from '../shared/useIsMobile';
import { calculateRollingEndDate } from '../../../utils/planning';
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

const getExtendedStatusMeta = (status: string | undefined) => {
    if (status === 'EXTERNAL_PROCESS') {
        return {
            label: 'Proc. Externe',
            dot: 'bg-amber-500',
            text: 'text-amber-700',
            bg: 'bg-amber-50',
            border: 'border-amber-200/50',
            softBg: 'bg-amber-50/60',
        };
    }
    if (status === 'BLOCKED_STOCK') {
        return {
            label: 'Bloqué stock',
            dot: 'bg-red-500',
            text: 'text-red-700',
            bg: 'bg-red-50',
            border: 'border-red-200',
            softBg: 'bg-red-50/60',
        };
    }
    const ws = toWorkStatus(status);
    const meta = STATUS_META[ws];
    return {
        label: meta.label,
        dot: meta.dot,
        text: meta.text,
        bg: meta.bg,
        border: meta.border,
        softBg: meta.softBg,
    };
};

interface Props {
    event: PlanningEvent | null;
    models: ModelData[];
    chainName?: string;
    chainCapacity?: number;
    chainEfficiency?: number;
    width: number;
    onResizeStart: (e: React.MouseEvent) => void;
    onClose: () => void;
    onEdit: () => void;
    onSplit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onChangeStatus: (status: PlanningEvent['status']) => void;
    onSetProduced?: (delta: number) => void;
    notes?: string;
    onNotesChange?: (notes: string) => void;
    settings: AppSettings;
    stockProducts?: any[];
    stockLots?: any[];
    onReloadStock?: () => void;
    onApplyWorstSupplierDate?: (ymd: string) => void;
    onAppendDraftPurchaseOrders?: (drafts: any[]) => void;
    onUpdateEvent?: (patch: Partial<PlanningEvent>) => void;
}

export default function EventDetailPanel({
    event, models, chainName, chainCapacity, chainEfficiency,
    width, onResizeStart,
    onClose, onEdit, onSplit, onDuplicate, onDelete, onChangeStatus,
    onSetProduced, notes, onNotesChange,
    settings, stockProducts, stockLots, onReloadStock, onApplyWorstSupplierDate, onAppendDraftPurchaseOrders,
    onUpdateEvent,
}: Props) {
    const { lang } = useLang();
    const [tab, setTab] = React.useState<'details' | 'activity' | 'notes' | 'materials'>('details');
    const [quickAddOpen, setQuickAddOpen] = React.useState(false);
    const [quickAddVal, setQuickAddVal] = React.useState<number>(0);

    // Bottom-sheet (mobile) — plein écran + glissement, comme « Paramètres PDF »
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [dragOffset, setDragOffset] = React.useState(0);
    const [dragging, setDragging] = React.useState(false);
    const dragStartY = React.useRef(0);
    const SHEET_EASE = 'transform 0.34s cubic-bezier(0.32, 0.72, 0, 1)';

    const onHandleTouchStart = (e: React.TouchEvent) => { dragStartY.current = e.touches[0].clientY; setDragging(true); };
    const onHandleTouchMove = (e: React.TouchEvent) => {
        const delta = e.touches[0].clientY - dragStartY.current;
        setDragOffset(delta > 0 ? delta : 0); // ne suit le doigt que vers le bas
    };
    const onHandleTouchEnd = (e: React.TouchEvent) => {
        const delta = (e.changedTouches[0]?.clientY ?? dragStartY.current) - dragStartY.current;
        setDragging(false);
        setDragOffset(0);
        if (isExpanded) {
            if (delta >= 80) setIsExpanded(false);          // tirer vers le bas → réduire
        } else {
            if (delta <= -40) setIsExpanded(true);          // tirer vers le haut → agrandir
            else if (delta >= 100) onClose();               // tirer vers le bas → fermer
        }
    };
    const dragHandlers = { onTouchStart: onHandleTouchStart, onTouchMove: onHandleTouchMove, onTouchEnd: onHandleTouchEnd };

    React.useEffect(() => {
        setTab('details');
        setQuickAddOpen(false);
        setQuickAddVal(0);
        setIsExpanded(false);
        setDragOffset(0);
    }, [event?.id]);

    if (!event) return null;

    const client = evClientName(event, models);
    const modelName = evModelName(event, models);
    const thumb = evModelThumb(event, models);
    const modelKey = event.modelId || modelName || client;
    const accent = (event.modelId || modelName) ? getModelColor(event.modelId || modelName) : (event.color || getModelColor(modelKey));
    const qty = evQty(event);
    const produced = evProduced(event);
    const progress = evProgressPct(event);
    const startYmd = evStartYmd(event);
    const endYmd = evEndYmd(event);
    const model = models.find(m => m.id === event.modelId);
    let rollingEndYmd = endYmd;
    if (model && qty > 0) {
        const sam = Number(model.meta_data?.total_temps) || 15;
        const eff = chainEfficiency ?? 0.85;
        rollingEndYmd = calculateRollingEndDate(event, sam, eff, settings).split('T')[0];
    }
    const ddsYmd = evDeadlineYmd(event);
    const wsMeta = getExtendedStatusMeta(event.status);
    const delay = delayOf(event);
    const delayMeta = DELAY_META[delay];
    const daysToDDS = ddsYmd ? daysBetween(todayYmd(), ddsYmd) : null;
    const isMobile = useIsMobile();
    const containerCls = isMobile
        ? `fixed inset-x-0 bottom-0 z-40 bg-white/80 border-t border-white/20 backdrop-blur-md shadow-[0_-12px_40px_rgba(15,23,42,0.18)] flex flex-col ${
            isExpanded ? 'top-0 rounded-none' : 'top-12 rounded-t-3xl animate-[planning-slide-in-up_220ms_ease-out]'
          }`
        : 'relative shrink-0 bg-white/70 border-l border-white/20 backdrop-blur-md flex flex-col animate-[planning-slide-in-right_180ms_ease-out] shadow-[-10px_0_40px_rgba(0,0,0,0.04)] z-20';
    const containerStyle = isMobile
        ? { transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined, transition: dragging ? 'none' : SHEET_EASE }
        : { width };

    // Chronology calculation
    const chronoItems = React.useMemo(() => {
        interface ChronoItem {
            date: string;
            icon: any;
            label: string;
            time?: string;
            description?: string;
            accent?: string;
        }

        const items: ChronoItem[] = [];

        // 1. Création
        if (startYmd) {
            items.push({
                date: startYmd,
                icon: Calendar,
                label: tx(lang, { fr: 'Création de l\'OF', ar: 'إنشاء أمر التصنيع', en: 'Creation of WO', es: 'Creación de la OF', pt: 'Criação da OF', tr: 'İş emri oluşturma' }),
                time: fmtLong(startYmd),
                description: `${qty} pcs ${tx(lang, { fr: 'sur', ar: 'على', en: 'on', es: 'en', pt: 'em', tr: 'üzerinde' })} ${chainName || event.chaineId}`,
            });
        }

        // 2. Réception matières prévue
        if (event.fournisseurDate) {
            const fYmd = event.fournisseurDate.split('T')[0];
            items.push({
                date: fYmd,
                icon: Truck,
                label: tx(lang, { fr: 'Réception matières prévue', ar: 'استلام المواد المتوقع', en: 'Expected material receipt', es: 'Recepción de materiales prevista', pt: 'Receção de materiais prevista', tr: 'Beklenen malzeme teslimi' }),
                time: fmtLong(fYmd),
            });
        }

        // 3. DDS
        if (ddsYmd) {
            items.push({
                date: ddsYmd,
                icon: AlertTriangle,
                label: tx(lang, { fr: 'DDS (deadline client)', ar: 'DDS (الموعد النهائي للعميل)', en: 'DDS (client deadline)', es: 'DDS (fecha límite cliente)', pt: 'DDS (prazo do cliente)', tr: 'DDS (müşteri teslim tarihi)' }),
                time: fmtLong(ddsYmd),
                accent: delay === 'LATE' ? 'text-red-650 font-bold' : '',
            });
        }

        // 4. Progress / Produced
        if (produced > 0) {
            items.push({
                date: todayYmd(),
                icon: Clock,
                label: `${produced} ${tx(lang, { fr: 'pcs produites', ar: 'قطعة منتجة', en: 'pcs produced', es: 'uds producidas', pt: 'peças produzidas', tr: 'adet üretildi' })}`,
                description: `${progress}% ${tx(lang, { fr: 'complété', ar: 'مكتمل', en: 'completed', es: 'completado', pt: 'concluído', tr: 'tamamlandı' })}`,
                time: tx(lang, { fr: 'Aujourd\'hui', ar: 'اليوم', en: 'Today', es: 'Hoy', pt: 'Hoje', tr: 'Bugün' }),
            });
        }

        // 5. Fin estimée
        if (rollingEndYmd) {
            items.push({
                date: rollingEndYmd,
                icon: Clock,
                label: tx(lang, { fr: 'Fin estimée', ar: 'النهاية المتوقعة', en: 'Estimated end', es: 'Fin estimado', pt: 'Fim estimado', tr: 'Tahmini bitiş' }),
                time: fmtLong(rollingEndYmd),
            });
        }

        const getPriority = (label: string) => {
            if (label.startsWith("Création")) return 1;
            if (label.startsWith("Réception")) return 2;
            if (label.includes("produites")) return 3;
            if (label.startsWith("Fin")) return 4;
            if (label.startsWith("DDS")) return 5;
            return 6;
        };

        return items.sort((a, b) => {
            const cmp = a.date.localeCompare(b.date);
            if (cmp !== 0) return cmp;
            return getPriority(a.label) - getPriority(b.label);
        });
    }, [startYmd, qty, chainName, event.chaineId, event.fournisseurDate, ddsYmd, delay, produced, progress, rollingEndYmd, lang]);

    return (
        <>
        {isMobile && (
            <div
                className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-[2px] animate-[planning-fade-in_180ms_ease-out]"
                onClick={onClose}
                aria-hidden
            />
        )}
        <aside className={containerCls} style={containerStyle}>
            {isMobile && (
                <div
                    className="pt-2.5 pb-1.5 flex items-center justify-center shrink-0 cursor-grab touch-none active:cursor-grabbing"
                    {...dragHandlers}
                >
                    <span className="w-10 h-1.5 rounded-full bg-slate-300" />
                </div>
            )}
            {/* Drag handle (desktop only) */}
            {!isMobile && (
                <div
                    onMouseDown={onResizeStart}
                    className="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize z-30 group/handle"
                    title={tx(lang, { fr: 'Glissez pour redimensionner', ar: 'اسحب لتغيير الحجم', en: 'Drag to resize', es: 'Arrastre para redimensionar', pt: 'Arraste para redimensionar', tr: 'Yeniden boyutlandırmak için sürükleyin' })}
                >
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-12 rounded-full bg-transparent group-hover/handle:bg-slate-300 transition-colors" />
                </div>
            )}

            {/* Hero */}
            <header className="relative px-6 pt-5 pb-4 border-b border-slate-200/40">
                <div className="absolute top-4 right-4 flex items-center gap-1">
                    {isMobile && (
                        <button
                            type="button"
                            onClick={() => setIsExpanded(e => !e)}
                            className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100/70 border border-transparent hover:border-slate-200/30 transition-all duration-200 active:scale-95 shadow-sm"
                            aria-label={isExpanded ? tx(lang, { fr: 'Réduire', ar: 'تصغير', en: 'Minimize', es: 'Reducir', pt: 'Reduzir', tr: 'Küçült' }) : tx(lang, { fr: 'Agrandir', ar: 'تكبير', en: 'Maximize', es: 'Ampliar', pt: 'Ampliar', tr: 'Büyüt' })}
                        >
                            {isExpanded ? <Minimize2 className="w-4 h-4" strokeWidth={2} /> : <Maximize2 className="w-4 h-4" strokeWidth={2} />}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100/70 border border-transparent hover:border-slate-200/30 transition-all duration-200 active:scale-95 shadow-sm"
                        aria-label={tx(lang, { fr: 'Fermer', ar: 'إغلاق', en: 'Close', es: 'Cerrar', pt: 'Fechar', tr: 'Kapat' })}
                    >
                        <X className="w-4 h-4" strokeWidth={2} />
                    </button>
                </div>

                <div className="flex items-start gap-3 pr-8">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0 shadow-sm" style={{ background: getClientColor(client) }}>
                        {(client || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getClientColor(client) }} title={`Client: ${client}`} />
                            <span className="text-[11px] font-bold text-slate-500 truncate">{client}</span>
                        </div>
                        <h3 className="text-[15px] font-extrabold text-slate-900 tracking-tight leading-tight">
                            {modelName}
                        </h3>
                    </div>
                </div>

                {/* Status row */}
                <div className="flex items-center gap-2 mt-4">
                    <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-xl text-[11px] font-bold ${wsMeta.softBg} ${wsMeta.text} border ${wsMeta.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${wsMeta.dot}`} />
                        {wsMeta.label}
                    </span>
                    <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-xl text-[11px] font-bold bg-slate-100/60 text-slate-650 border border-slate-200/30">
                        <span className={`w-1.5 h-1.5 rounded-full ${delayMeta.dot}`} />
                        {delayMeta.label}
                    </span>
                    <button
                        type="button"
                        onClick={() => onChangeStatus(event.status === 'BLOCKED_STOCK' ? 'READY' : 'BLOCKED_STOCK')}
                        className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
                            event.status === 'BLOCKED_STOCK'
                                ? 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 shadow-sm active:scale-95'
                                : 'bg-white text-slate-650 border-slate-200/60 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 shadow-sm active:scale-95'
                        }`}
                    >
                        {event.status === 'BLOCKED_STOCK' ? tx(lang, { fr: '▶ Reprendre', ar: '▶ استئناف', en: '▶ Resume', es: '▶ Reanudar', pt: '▶ Retomar', tr: '▶ Devam' }) : tx(lang, { fr: '⏸ En Pause', ar: '⏸ إيقاف مؤقت', en: '⏸ Pause', es: '⏸ Pausa', pt: '⏸ Pausa', tr: '⏸ Duraklat' })}
                    </button>
                </div>
            </header>

            {/* Tabs */}
            <div className="px-4 py-2 border-b border-slate-200/40 bg-white/30 backdrop-blur-sm shrink-0">
                <div className="flex bg-white/40 p-0.5 rounded-xl gap-1 border border-white/20 backdrop-blur-sm">
                    {(['details', 'activity', 'notes', 'materials'] as const).map(t => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setTab(t)}
                            className={`flex-1 h-7 text-[11px] font-bold rounded-lg transition-all duration-200 active:scale-95 ${
                                tab === t
                                    ? 'bg-white/80 text-indigo-650 shadow-[0_2px_6px_rgba(99,102,241,0.08)]'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                            }`}
                        >
                            {t === 'details' ? tx(lang, { fr: 'Détails', ar: 'تفاصيل', en: 'Details', es: 'Detalles', pt: 'Detalhes', tr: 'Detaylar' }) : t === 'activity' ? tx(lang, { fr: 'Activité', ar: 'النشاط', en: 'Activity', es: 'Actividad', pt: 'Atividade', tr: 'Aktivite' }) : t === 'notes' ? tx(lang, { fr: 'Notes', ar: 'ملاحظات', en: 'Notes', es: 'Notas', pt: 'Notas', tr: 'Notlar' }) : tx(lang, { fr: 'Matières', ar: 'المواد', en: 'Materials', es: 'Materiales', pt: 'Materiais', tr: 'Malzemeler' })}
                        </button>
                    ))}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">

                {tab === 'details' && (<>
                {!model && (
                    <div className="mx-6 mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-slate-700 space-y-2">
                        <div className="flex items-center gap-2 text-[12px] font-bold text-amber-800">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                            {tx(lang, { fr: 'Modèle introuvable dans la bibliothèque', ar: 'النموذج غير موجود في المكتبة', en: 'Model not found in library', es: 'Modelo no encontrado en la biblioteca', pt: 'Modelo não encontrado na biblioteca', tr: 'Model kütüphanede bulunamadı' })}
                        </div>
                        <p className="text-[11px] leading-normal text-amber-700 font-medium">
                            {tx(lang, { fr: 'Ce modèle a été supprimé ou n\'existe pas. Certaines informations de production ne peuvent pas être calculées ou affichées.', ar: 'تم حذف هذا النموذج أو أنه غير موجود. لا يمكن حساب أو عرض بعض معلومات الإنتاج.', en: 'This model has been deleted or does not exist. Some production information cannot be calculated or displayed.', es: 'Este modelo ha sido eliminado o no existe. No se puede calcular o mostrar alguna información de producción.', pt: 'Este modelo foi eliminado ou não existe. Algumas informações de produção não podem ser calculadas ou exibidas.', tr: 'Bu model silinmiş veya mevcut değil. Bazı üretim bilgileri hesaplanamaz veya görüntülenemez.' })}
                        </p>
                    </div>
                )}

                {/* Progress block */}
                <section className="px-6 py-5 border-b border-slate-200/30">
                    <div className="flex items-baseline justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tx(lang, { fr: 'Progression', ar: 'التقدم', en: 'Progress', es: 'Progreso', pt: 'Progresso', tr: 'İlerleme' })}</span>
                        <span className="text-[18px] font-extrabold text-slate-900 tabular-nums tracking-tight">{progress}<span className="text-[12px] text-slate-400 ml-0.5">%</span></span>
                    </div>
                    <div className="h-1.5 bg-white/40 rounded-full overflow-hidden mb-2 border border-white/20 shadow-inner">
                        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${progress}%`, background: accent }} />
                    </div>
                    <div className="text-[12px] text-slate-550 tabular-nums mb-3 font-medium">
                        <span className="font-extrabold text-slate-900">{produced}</span> {tx(lang, { fr: 'sur', ar: 'من', en: 'of', es: 'de', pt: 'de', tr: '/' })} {qty} {tx(lang, { fr: 'pcs', ar: 'قطعة', en: 'pcs', es: 'uds', pt: 'peças', tr: 'adet' })}
                    </div>

                    {/* Quick add produced */}
                    {onSetProduced && (
                        quickAddOpen ? (
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="number"
                                    value={quickAddVal || ''}
                                    onChange={(e) => setQuickAddVal(Number(e.target.value) || 0)}
                                    placeholder={tx(lang, { fr: '+ pcs', ar: '+ قطعة', en: '+ pcs', es: '+ uds', pt: '+ peças', tr: '+ adet' })}
                                    className="flex-1 h-7.5 px-2.5 text-[12px] font-bold tabular-nums bg-white border border-slate-200 rounded-lg focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10 outline-none shadow-sm transition-all duration-200"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (quickAddVal !== 0) onSetProduced(quickAddVal);
                                        setQuickAddOpen(false);
                                        setQuickAddVal(0);
                                    }}
                                    className="h-7.5 px-3 text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-lg shadow-sm transition-all duration-200 active:scale-95"
                                >
                                    {tx(lang, { fr: 'OK', ar: 'موافق', en: 'OK', es: 'OK', pt: 'OK', tr: 'Tamam' })}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setQuickAddOpen(false); setQuickAddVal(0); }}
                                    className="h-7.5 px-3 text-[11px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-all duration-200 active:scale-95"
                                >
                                    {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setQuickAddOpen(true)}
                                className="h-7.5 px-3 text-[11px] font-bold text-slate-650 hover:text-slate-900 hover:bg-white/80 border border-slate-200/50 hover:border-slate-300 rounded-lg shadow-sm transition-all duration-200 active:scale-95 inline-flex items-center gap-1.5"
                            >
                                <Plus className="w-3.5 h-3.5 text-slate-500" strokeWidth={2.25} />
                                {tx(lang, { fr: 'Ajouter une production', ar: 'إضافة إنتاج', en: 'Add production', es: 'Añadir producción', pt: 'Adicionar produção', tr: 'Üretim ekle' })}
                            </button>
                        )
                    )}
                </section>

                {/* Properties */}
                <section className="px-6 py-4 space-y-3 border-b border-slate-200/30">
                    <PropertyRow icon={Calendar} label={tx(lang, { fr: 'Début', ar: 'البداية', en: 'Start', es: 'Inicio', pt: 'Início', tr: 'Başlangıç' })} value={fmtLong(startYmd)} />
                    <PropertyRow icon={Clock} label={tx(lang, { fr: 'Fin estimée', ar: 'النهاية المتوقعة', en: 'Estimated end', es: 'Fin estimado', pt: 'Fim estimado', tr: 'Tahmini bitiş' })} value={fmtLong(rollingEndYmd)} />
                    {ddsYmd && (
                        <PropertyRow
                            icon={AlertTriangle}
                            label={tx(lang, { fr: 'DDS', ar: 'DDS', en: 'DDS', es: 'DDS', pt: 'DDS', tr: 'DDS' })}
                            value={
                                <span className={delay === 'LATE' ? 'text-red-650 font-bold' : ''}>
                                    {fmtLong(ddsYmd)}
                                    {daysToDDS !== null && (
                                        <span className="ml-1.5 text-[11px] text-slate-450 font-bold tabular-nums">
                                            {daysToDDS >= 0 ? `(J−${daysToDDS})` : `(J+${-daysToDDS})`}
                                        </span>
                                    )}
                                </span>
                            }
                        />
                    )}
                    {event.fournisseurDate && (
                        <PropertyRow icon={Truck} label={tx(lang, { fr: 'Matières', ar: 'المواد', en: 'Materials', es: 'Materiales', pt: 'Materiais', tr: 'Malzemeler' })} value={fmtLong(event.fournisseurDate)} />
                    )}
                </section>

                {/* Chain block */}
                {chainName && (
                    <section className="px-6 py-4 border-b border-slate-200/30">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{tx(lang, { fr: 'Chaîne', ar: 'الخط', en: 'Line', es: 'Línea', pt: 'Linha', tr: 'Hat' })}</div>
                        <div className="flex items-baseline justify-between">
                            <span className="text-[14px] font-extrabold text-slate-900">{chainName}</span>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 font-bold tabular-nums">
                                {chainCapacity != null && <span>{chainCapacity} {tx(lang, { fr: 'pcs/j', ar: 'قطعة/يوم', en: 'pcs/d', es: 'uds/d', pt: 'peças/d', tr: 'adet/gün' })}</span>}
                                {chainEfficiency != null && <span>η {Math.round(chainEfficiency * 100)}%</span>}
                            </div>
                        </div>
                    </section>
                )}

                {/* Subcontracting details block */}
                {event.isSubcontracted && (
                    <section className="px-6 py-4 border-b border-white/20 bg-indigo-500/5 border-t border-white/20 backdrop-blur-xs">
                        <div className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mb-3">{tx(lang, { fr: 'Sous-traitance', ar: 'مقاولة من الباطن', en: 'Subcontracting', es: 'Subcontratación', pt: 'Subcontratação', tr: 'Taşeron' })}</div>
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between text-[12px]">
                                <span className="text-slate-500 font-medium">{tx(lang, { fr: 'Sous-traitant :', ar: 'المقاول من الباطن:', en: 'Subcontractor:', es: 'Subcontratista:', pt: 'Subcontratado:', tr: 'Taşeron:' })}</span>
                                <span className="font-bold text-slate-900">{event.subcontractorName || tx(lang, { fr: 'Non spécifié', ar: 'غير محدد', en: 'Not specified', es: 'No especificado', pt: 'Não especificado', tr: 'Belirtilmemiş' })}</span>
                            </div>
                            {event.subcontractorPhone && (
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="text-slate-500 font-medium">{tx(lang, { fr: 'Téléphone :', ar: 'الهاتف:', en: 'Phone:', es: 'Teléfono:', pt: 'Telefone:', tr: 'Telefon:' })}</span>
                                    <a href={`tel:${event.subcontractorPhone}`} className="font-bold text-indigo-650 hover:underline">{event.subcontractorPhone}</a>
                                </div>
                            )}
                            {event.subcontractorRating !== undefined && (
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="text-slate-500 font-medium">{tx(lang, { fr: 'Évaluation :', ar: 'التقييم:', en: 'Rating:', es: 'Valoración:', pt: 'Avaliação:', tr: 'Değerlendirme:' })}</span>
                                    <span className="font-bold text-amber-500">
                                        {'★'.repeat(Math.max(0, Math.min(5, Math.round(event.subcontractorRating)))) + '☆'.repeat(Math.max(0, 5 - Math.max(0, Math.min(5, Math.round(event.subcontractorRating)))))}
                                        <span className="text-slate-400 text-[11px] ml-1">({event.subcontractorRating}/5)</span>
                                    </span>
                                </div>
                            )}
                            {event.subcontractorAvailabilityDate && (
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="text-slate-500 font-medium">{tx(lang, { fr: 'Disponibilité :', ar: 'التوفر:', en: 'Availability:', es: 'Disponibilidad:', pt: 'Disponibilidade:', tr: 'Müsaitlik:' })}</span>
                                    <span className="font-bold text-slate-900">{fmtLong(event.subcontractorAvailabilityDate.split('T')[0])}</span>
                                </div>
                            )}
                            {event.strictDeadline_DDS && (
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="text-slate-500 font-medium">{tx(lang, { fr: 'Livraison prévue :', ar: 'التسليم المتوقع:', en: 'Expected delivery:', es: 'Entrega prevista:', pt: 'Entrega prevista:', tr: 'Teslim tarihi:' })}</span>
                                    <span className="font-bold text-slate-900">{fmtLong(event.strictDeadline_DDS.split('T')[0])}</span>
                                </div>
                            )}
                            {event.subcontractPricePerPiece !== undefined && event.subcontractPricePerPiece > 0 && (
                                <>
                                    <div className="flex items-center justify-between text-[12px]">
                                        <span className="text-slate-500 font-medium">{tx(lang, { fr: 'Prix par pièce :', ar: 'سعر القطعة:', en: 'Price per piece:', es: 'Precio por pieza:', pt: 'Preço por peça:', tr: 'Birim fiyat:' })}</span>
                                        <span className="font-bold text-slate-900">{event.subcontractPricePerPiece.toFixed(2)} DH</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[12px] pt-1 border-t border-slate-200/40">
                                        <span className="font-bold text-slate-700">{tx(lang, { fr: 'Coût total :', ar: 'التكلفة الإجمالية:', en: 'Total cost:', es: 'Coste total:', pt: 'Custo total:', tr: 'Toplam maliyet:' })}</span>
                                        <span className="font-extrabold text-indigo-700 font-mono">{(evQty(event) * event.subcontractPricePerPiece).toFixed(2)} DH</span>
                                    </div>
                                </>
                            )}
                            <div className="flex items-center justify-between text-[12px] pt-2 border-t border-slate-200/40">
                                <span className="text-slate-500 font-medium">{tx(lang, { fr: 'Statut :', ar: 'الحالة:', en: 'Status:', es: 'Estado:', pt: 'Estado:', tr: 'Durum:' })}</span>
                                <select
                                    value={event.subcontractStatus || 'PENDING'}
                                    onChange={(e) => onUpdateEvent?.({ subcontractStatus: e.target.value as any })}
                                    className="h-7 px-2 text-[11px] font-bold bg-white border border-slate-200/60 rounded-lg focus:border-indigo-500/40 outline-none text-slate-800 shadow-sm cursor-pointer"
                                >
                                    <option value="PENDING">{tx(lang, { fr: 'En attente', ar: 'قيد الانتظار', en: 'Pending', es: 'Pendiente', pt: 'Pendente', tr: 'Beklemede' })}</option>
                                    <option value="SENT">{tx(lang, { fr: 'Envoyé', ar: 'أُرسل', en: 'Sent', es: 'Enviado', pt: 'Enviado', tr: 'Gönderildi' })}</option>
                                    <option value="COMPLETED">{tx(lang, { fr: 'Complété', ar: 'مكتمل', en: 'Completed', es: 'Completado', pt: 'Concluído', tr: 'Tamamlandı' })}</option>
                                </select>
                            </div>
                        </div>
                    </section>
                )}

                {/* Blocage */}
                {event.blockedReason && (
                    <section className="mx-6 my-4 p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-700 uppercase tracking-widest mb-1">
                            <AlertTriangle className="w-3 h-3 text-red-500" strokeWidth={2.25} />
                            {tx(lang, { fr: 'Blocage', ar: 'حظر', en: 'Blockage', es: 'Bloqueo', pt: 'Bloqueio', tr: 'Engelleme' })}
                        </div>
                        <p className="text-[12px] text-red-900 leading-snug font-medium">{event.blockedReason}</p>
                    </section>
                )}

                {/* Matières manquantes */}
                {event.materialShortages?.length ? (
                    <section className="px-6 py-4 border-b border-slate-200/30">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{tx(lang, { fr: 'Matières manquantes', ar: 'المواد الناقصة', en: 'Missing materials', es: 'Materiales faltantes', pt: 'Materiais em falta', tr: 'Eksik malzemeler' })}</div>
                        <ul className="space-y-1.5">
                            {event.materialShortages.map((s, i) => (
                                <li key={i} className="flex items-center justify-between gap-3 text-[12px]">
                                    <span className="text-slate-700 font-medium truncate">{s.name}</span>
                                    <span className="font-extrabold tabular-nums text-amber-700 shrink-0">
                                        −{s.missing}{s.unit || ''}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {/* Status switcher */}
                <section className="px-6 py-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{tx(lang, { fr: 'Changer le statut', ar: 'تغيير الحالة', en: 'Change status', es: 'Cambiar estado', pt: 'Alterar estado', tr: 'Durumu değiştir' })}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                        {(['READY', 'IN_PROGRESS', 'BLOCKED_STOCK', 'EXTERNAL_PROCESS', 'DONE'] as const).map(s => {
                            const isActive = event.status === s;
                            const meta = getExtendedStatusMeta(s);
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => onChangeStatus(s)}
                                    className={`h-8 px-2.5 rounded-lg text-[11px] font-bold transition-all duration-200 active:scale-95 flex items-center gap-1.5 ${
                                        isActive
                                            ? 'bg-slate-900 text-white shadow-md'
                                            : 'bg-slate-100/50 text-slate-700 hover:bg-white border border-transparent hover:border-slate-200/30'
                                    }`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white/80' : meta.dot}`} />
                                    {meta.label}
                                </button>
                            );
                        })}
                    </div>
                </section>
                </>)}

                {/* ──────────────── Activité ──────────────── */}
                {tab === 'activity' && (
                    <div className="px-6 py-5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                            {tx(lang, { fr: 'Chronologie', ar: 'الجدول الزمني', en: 'Timeline', es: 'Cronología', pt: 'Cronologia', tr: 'Zaman çizelgesi' })}
                        </div>
                        <ol className="relative border-l border-slate-200 ml-1.5 space-y-4">
                            {chronoItems.map((item, idx) => (
                                <ActivityItem
                                    key={idx}
                                    icon={item.icon}
                                    label={item.label}
                                    time={item.time}
                                    description={item.description}
                                    accent={item.accent}
                                />
                            ))}
                        </ol>
                    </div>
                )}

                {/* ──────────────── Notes ──────────────── */}
                {tab === 'notes' && (
                    <div className="px-6 py-5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            {tx(lang, { fr: 'Notes internes', ar: 'ملاحظات داخلية', en: 'Internal notes', es: 'Notas internas', pt: 'Notas internas', tr: 'Dahili notlar' })}
                        </div>
                        <textarea
                            value={notes || ''}
                            onChange={(e) => onNotesChange?.(e.target.value)}
                            placeholder={tx(lang, { fr: 'Ajoutez des notes pour cet ordre… (visible uniquement par vous)', ar: 'أضف ملاحظات لهذا الأمر… (مرئي لك فقط)', en: 'Add notes for this order… (visible only to you)', es: 'Añada notas para esta orden… (visible solo para usted)', pt: 'Adicione notas para esta ordem… (visível apenas para si)', tr: 'Bu sipariş için not ekleyin… (yalnızca size görünür)' })}
                            className="w-full min-h-[180px] p-3 text-[13px] text-slate-800 placeholder:text-slate-450 bg-white/30 border border-white/20 focus:bg-white/85 focus:border-indigo-500/25 focus:ring-4 focus:ring-indigo-500/10 rounded-xl outline-none resize-y transition-all duration-200 backdrop-blur-sm"
                        />
                        <p className="text-[10px] text-slate-400 font-bold mt-2">
                            {tx(lang, { fr: 'Enregistré automatiquement en local', ar: 'يُحفظ تلقائياً محلياً', en: 'Auto-saved locally', es: 'Guardado automáticamente en local', pt: 'Guardado automaticamente localmente', tr: 'Otomatik olarak yerel olarak kaydedildi' })}
                        </p>
                    </div>
                )}

                {/* ──────────────── Materials (Matières) ──────────────── */}
                {tab === 'materials' && (
                    <div className="px-6 py-5">
                        <MaterialArrivalTimeline
                            model={models.find(m => m.id === event.modelId)}
                            orderQty={qty}
                            event={event}
                            settings={settings}
                            catalogProducts={stockProducts}
                            catalogLots={stockLots}
                            onReloadStock={onReloadStock}
                            onApplyWorstSupplierDate={onApplyWorstSupplierDate}
                            onAppendDraftPurchaseOrders={onAppendDraftPurchaseOrders}
                        />
                    </div>
                )}
            </div>

            {/* Footer actions */}
            <footer className="px-4 py-3 border-t border-white/20 bg-white/50 backdrop-blur-md flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1">
                    <ActionBtn onClick={onEdit} icon={Edit2}>{tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })}</ActionBtn>
                    <ActionBtn onClick={onSplit} icon={Split}>{tx(lang, { fr: 'Diviser', ar: 'تقسيم', en: 'Split', es: 'Dividir', pt: 'Dividir', tr: 'Böl' })}</ActionBtn>
                    <ActionBtn onClick={onDuplicate} icon={Copy} />
                </div>
                <div className="flex items-center gap-1">
                    {progress === 100 && (
                        <button
                            type="button"
                            onClick={() => onChangeStatus('DONE')}
                            className="inline-flex items-center gap-1.5 h-7.5 px-3 rounded-lg text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm active:scale-95"
                        >
                            <CheckCircle2 className="w-3 h-3" />
                            {tx(lang, { fr: 'Modèle fini', ar: 'نموذج منتهٍ', en: 'Model completed', es: 'Modelo terminado', pt: 'Modelo concluído', tr: 'Model tamamlandı' })}
                        </button>
                    )}
                    <ActionBtn onClick={onDelete} icon={Trash2} danger />
                </div>
            </footer>
        </aside>
        </>
    );
}

function PropertyRow({
    icon: Icon, label, value,
}: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-baseline gap-3">
            <div className="w-20 shrink-0 flex items-center gap-1.5 text-[11px] text-slate-500 font-bold">
                <Icon className="w-3 h-3 text-slate-400" strokeWidth={2} />
                {label}
            </div>
            <div className="flex-1 text-[12px] text-slate-900 font-medium truncate">{value}</div>
        </div>
    );
}

function ActivityItem({
    icon: Icon, label, time, description, accent,
}: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; time?: string; description?: string; accent?: string }) {
    return (
        <li className="relative pl-5">
            <span className="absolute left-[-5px] top-0.5 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-350" />
            <div className={`text-[12px] font-bold text-slate-900 ${accent || ''}`}>{label}</div>
            {time && <div className="text-[11px] text-slate-500 mt-0.5 font-medium">{time}</div>}
            {description && <div className="text-[11px] text-slate-550 mt-0.5 font-medium">{description}</div>}
        </li>
    );
}

function ActionBtn({
    onClick, icon: Icon, children, danger,
}: { onClick: () => void; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; children?: React.ReactNode; danger?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 h-7.5 px-2.5 rounded-lg text-[11px] font-bold transition-all duration-200 active:scale-95 border ${
                danger
                    ? 'text-red-650 bg-red-500/5 hover:bg-red-500/10 hover:text-red-700 border-red-200/20 hover:border-red-200/40'
                    : 'text-slate-650 bg-slate-100/50 hover:bg-white hover:text-slate-900 border-slate-200/30 hover:border-slate-250/50 shadow-sm'
            }`}
        >
            <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
            {children}
        </button>
    );
}
