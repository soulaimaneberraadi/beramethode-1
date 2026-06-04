import React from 'react';
import { X, Edit2, Split, Copy, Trash2, Calendar, Package, Clock, Truck, AlertTriangle, Plus, CheckCircle2 } from 'lucide-react';
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
    const [tab, setTab] = React.useState<'details' | 'activity' | 'notes' | 'materials'>('details');
    const [quickAddOpen, setQuickAddOpen] = React.useState(false);
    const [quickAddVal, setQuickAddVal] = React.useState<number>(0);

    React.useEffect(() => {
        setTab('details');
        setQuickAddOpen(false);
        setQuickAddVal(0);
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
        ? 'fixed inset-x-0 bottom-0 top-12 z-40 bg-white rounded-t-2xl shadow-[0_-12px_40px_rgba(15,23,42,0.18)] flex flex-col animate-[planning-slide-in-up_220ms_ease-out]'
        : 'relative shrink-0 bg-white border-l border-slate-100 flex flex-col animate-[planning-slide-in-right_180ms_ease-out]';
    const containerStyle = isMobile ? undefined : { width };

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
                label: "Création de l'OF",
                time: fmtLong(startYmd),
                description: `${qty} pcs sur ${chainName || event.chaineId}`,
            });
        }

        // 2. Réception matières prévue
        if (event.fournisseurDate) {
            const fYmd = event.fournisseurDate.split('T')[0];
            items.push({
                date: fYmd,
                icon: Truck,
                label: "Réception matières prévue",
                time: fmtLong(fYmd),
            });
        }

        // 3. DDS
        if (ddsYmd) {
            items.push({
                date: ddsYmd,
                icon: AlertTriangle,
                label: "DDS (deadline client)",
                time: fmtLong(ddsYmd),
                accent: delay === 'LATE' ? 'text-red-600 font-medium' : '',
            });
        }

        // 4. Progress / Produced
        if (produced > 0) {
            items.push({
                date: todayYmd(),
                icon: Clock,
                label: `${produced} pcs produites`,
                description: `${progress}% complété`,
                time: "Aujourd'hui",
            });
        }

        // 5. Fin estimée
        if (rollingEndYmd) {
            items.push({
                date: rollingEndYmd,
                icon: Clock,
                label: "Fin estimée",
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
    }, [startYmd, qty, chainName, event.chaineId, event.fournisseurDate, ddsYmd, delay, produced, progress, rollingEndYmd]);

    return (
        <aside className={containerCls} style={containerStyle}>
            {isMobile && (
                <div
                    className="fixed inset-0 -z-10 bg-slate-950/30 backdrop-blur-[2px] animate-[planning-fade-in_180ms_ease-out]"
                    style={{ left: '-9999px' }}
                    aria-hidden
                />
            )}
            {isMobile && (
                <div className="pt-2 pb-1 flex items-center justify-center shrink-0">
                    <span className="w-10 h-1 rounded-full bg-slate-300" />
                </div>
            )}
            {/* Drag handle (desktop only) */}
            {!isMobile && (
                <div
                    onMouseDown={onResizeStart}
                    className="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize z-30 group/handle"
                    title="Glissez pour redimensionner"
                >
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-12 rounded-full bg-transparent group-hover/handle:bg-slate-300 transition-colors" />
                </div>
            )}

            {/* Hero */}
            <header className="relative px-6 pt-5 pb-4 border-b border-slate-100">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    aria-label="Fermer"
                >
                    <X className="w-4 h-4" strokeWidth={2} />
                </button>

                <div className="flex items-start gap-3 pr-8">
                    {thumb ? (
                        <img src={thumb} alt="" className="w-11 h-11 rounded-lg object-cover ring-1 ring-slate-200 shrink-0" />
                    ) : (
                        <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                        </div>
                    )}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getClientColor(client) }} title={`Client: ${client}`} />
                            <span className="text-[11px] text-slate-500 truncate">{client}</span>
                        </div>
                        <h3 className="text-[16px] font-semibold text-slate-900 tracking-tight leading-tight">
                            {modelName}
                        </h3>
                    </div>
                </div>

                {/* Status row */}
                <div className="flex items-center gap-2 mt-4">
                    <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded text-[11px] font-medium ${wsMeta.softBg} ${wsMeta.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${wsMeta.dot}`} />
                        {wsMeta.label}
                    </span>
                    <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded text-[11px] font-medium bg-slate-50 text-slate-600">
                        <span className={`w-1.5 h-1.5 rounded-full ${delayMeta.dot}`} />
                        {delayMeta.label}
                    </span>
                    <button
                        type="button"
                        onClick={() => onChangeStatus(event.status === 'BLOCKED_STOCK' ? 'READY' : 'BLOCKED_STOCK')}
                        className={`inline-flex items-center gap-1 h-6 px-2.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all border ${
                            event.status === 'BLOCKED_STOCK'
                                ? 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 shadow-sm'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 shadow-sm'
                        }`}
                    >
                        {event.status === 'BLOCKED_STOCK' ? '▶ Reprendre' : '⏸ En Pause'}
                    </button>
                </div>
            </header>

            {/* Tabs */}
            <div className="px-4 pt-2 flex items-center gap-0 border-b border-slate-100">
                {(['details', 'activity', 'notes', 'materials'] as const).map(t => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        className={`relative h-8 px-3 text-[12px] font-medium transition-colors ${
                            tab === t ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {t === 'details' ? 'Détails' : t === 'activity' ? 'Activité' : t === 'notes' ? 'Notes' : 'Matières'}
                        {tab === t && (
                            <span className="absolute -bottom-px left-2 right-2 h-px bg-slate-900" />
                        )}
                    </button>
                ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">

                {tab === 'details' && (<>

                {/* Progress block */}
                <section className="px-6 py-5 border-b border-slate-50">
                    <div className="flex items-baseline justify-between mb-2.5">
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Progression</span>
                        <span className="text-[18px] font-semibold text-slate-900 tabular-nums tracking-tight">{progress}<span className="text-[12px] text-slate-400 ml-0.5">%</span></span>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-2">
                        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${progress}%`, background: accent }} />
                    </div>
                    <div className="text-[12px] text-slate-500 tabular-nums mb-3">
                        <span className="font-medium text-slate-900">{produced}</span> sur {qty} pcs
                    </div>

                    {/* Quick add produced */}
                    {onSetProduced && (
                        quickAddOpen ? (
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="number"
                                    value={quickAddVal || ''}
                                    onChange={(e) => setQuickAddVal(Number(e.target.value) || 0)}
                                    placeholder="+ pcs"
                                    className="flex-1 h-7 px-2 text-[12px] tabular-nums bg-white border border-slate-200 rounded-md focus:border-slate-400 outline-none"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (quickAddVal !== 0) onSetProduced(quickAddVal);
                                        setQuickAddOpen(false);
                                        setQuickAddVal(0);
                                    }}
                                    className="h-7 px-2 text-[11px] font-medium bg-slate-900 text-white hover:bg-slate-800 rounded-md transition-colors"
                                >
                                    OK
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setQuickAddOpen(false); setQuickAddVal(0); }}
                                    className="h-7 px-2 text-[11px] font-medium text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
                                >
                                    Annuler
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setQuickAddOpen(true)}
                                className="h-7 px-2.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors inline-flex items-center gap-1.5"
                            >
                                <Plus className="w-3 h-3" strokeWidth={2} />
                                Ajouter une production
                            </button>
                        )
                    )}
                </section>

                {/* Properties */}
                <section className="px-6 py-4 space-y-3 border-b border-slate-50">
                    <PropertyRow icon={Calendar} label="Début" value={fmtLong(startYmd)} />
                    <PropertyRow icon={Clock} label="Fin estimée" value={fmtLong(rollingEndYmd)} />
                    {ddsYmd && (
                        <PropertyRow
                            icon={AlertTriangle}
                            label="DDS"
                            value={
                                <span className={delay === 'LATE' ? 'text-red-600 font-medium' : ''}>
                                    {fmtLong(ddsYmd)}
                                    {daysToDDS !== null && (
                                        <span className="ml-1.5 text-[11px] text-slate-400 tabular-nums">
                                            {daysToDDS >= 0 ? `(J−${daysToDDS})` : `(J+${-daysToDDS})`}
                                        </span>
                                    )}
                                </span>
                            }
                        />
                    )}
                    {event.fournisseurDate && (
                        <PropertyRow icon={Truck} label="Matières" value={fmtLong(event.fournisseurDate)} />
                    )}
                </section>

                {/* Chain block */}
                {chainName && (
                    <section className="px-6 py-4 border-b border-slate-50">
                        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Chaîne</div>
                        <div className="flex items-baseline justify-between">
                            <span className="text-[14px] font-semibold text-slate-900">{chainName}</span>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 tabular-nums">
                                {chainCapacity != null && <span>{chainCapacity} pcs/j</span>}
                                {chainEfficiency != null && <span>η {Math.round(chainEfficiency * 100)}%</span>}
                            </div>
                        </div>
                    </section>
                )}

                {/* Subcontracting details block */}
                {event.isSubcontracted && (
                    <section className="px-6 py-4 border-b border-slate-50 bg-indigo-50/10">
                        <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-3">Sous-traitance (المناولة)</div>
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between text-[12px]">
                                <span className="text-slate-500">Sous-traitant :</span>
                                <span className="font-semibold text-slate-900">{event.subcontractorName || 'Non spécifié'}</span>
                            </div>
                            {event.subcontractorPhone && (
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="text-slate-500">Téléphone :</span>
                                    <a href={`tel:${event.subcontractorPhone}`} className="font-semibold text-indigo-600 hover:underline">{event.subcontractorPhone}</a>
                                </div>
                            )}
                            {event.subcontractorRating !== undefined && (
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="text-slate-500">Évaluation :</span>
                                    <span className="font-semibold text-amber-500">
                                        {'★'.repeat(Math.max(0, Math.min(5, Math.round(event.subcontractorRating)))) + '☆'.repeat(Math.max(0, 5 - Math.max(0, Math.min(5, Math.round(event.subcontractorRating)))))}
                                        <span className="text-slate-400 text-[11px] ml-1">({event.subcontractorRating}/5)</span>
                                    </span>
                                </div>
                            )}
                            {event.subcontractorAvailabilityDate && (
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="text-slate-500">Disponibilité :</span>
                                    <span className="font-semibold text-slate-900">{fmtLong(event.subcontractorAvailabilityDate.split('T')[0])}</span>
                                </div>
                            )}
                            {event.strictDeadline_DDS && (
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="text-slate-500">Livraison prévue :</span>
                                    <span className="font-semibold text-slate-900">{fmtLong(event.strictDeadline_DDS.split('T')[0])}</span>
                                </div>
                            )}
                            {event.subcontractPricePerPiece !== undefined && event.subcontractPricePerPiece > 0 && (
                                <>
                                    <div className="flex items-center justify-between text-[12px]">
                                        <span className="text-slate-500">Prix par pièce :</span>
                                        <span className="font-semibold text-slate-900">{event.subcontractPricePerPiece.toFixed(2)} DH</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[12px] pt-1 border-t border-slate-100/50">
                                        <span className="font-medium text-slate-700">Coût total :</span>
                                        <span className="font-bold text-indigo-700 font-mono">{(evQty(event) * event.subcontractPricePerPiece).toFixed(2)} DH</span>
                                    </div>
                                </>
                            )}
                            <div className="flex items-center justify-between text-[12px] pt-2 border-t border-slate-100/50">
                                <span className="text-slate-500">Statut :</span>
                                <select
                                    value={event.subcontractStatus || 'PENDING'}
                                    onChange={(e) => onUpdateEvent?.({ subcontractStatus: e.target.value as any })}
                                    className="h-7 px-2 text-[11px] bg-white border border-slate-200 rounded-md focus:border-slate-400 outline-none text-slate-800"
                                >
                                    <option value="PENDING">En attente (في الانتظار)</option>
                                    <option value="SENT">Envoyé (تم الإرسال)</option>
                                    <option value="COMPLETED">Complété (مكتمل)</option>
                                </select>
                            </div>
                        </div>
                    </section>
                )}

                {/* Blocage */}
                {event.blockedReason && (
                    <section className="mx-6 my-4 p-3 rounded-lg bg-red-50/60 border border-red-100">
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-red-700 uppercase tracking-wider mb-1">
                            <AlertTriangle className="w-3 h-3" strokeWidth={2} />
                            Blocage
                        </div>
                        <p className="text-[12px] text-red-900 leading-snug">{event.blockedReason}</p>
                    </section>
                )}

                {/* Matières manquantes */}
                {event.materialShortages?.length ? (
                    <section className="px-6 py-4 border-b border-slate-50">
                        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Matières manquantes</div>
                        <ul className="space-y-1.5">
                            {event.materialShortages.map((s, i) => (
                                <li key={i} className="flex items-center justify-between gap-3 text-[12px]">
                                    <span className="text-slate-700 truncate">{s.name}</span>
                                    <span className="font-medium tabular-nums text-amber-700 shrink-0">
                                        −{s.missing}{s.unit || ''}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {/* Status switcher */}
                <section className="px-6 py-4">
                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Changer le statut</div>
                    <div className="grid grid-cols-2 gap-1.5">
                        {(['READY', 'IN_PROGRESS', 'BLOCKED_STOCK', 'EXTERNAL_PROCESS', 'DONE'] as const).map(s => {
                            const isActive = event.status === s;
                            const meta = getExtendedStatusMeta(s);
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => onChangeStatus(s)}
                                    className={`h-8 px-2.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                                        isActive
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
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
                        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-3">
                            Chronologie
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
                        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">
                            Notes internes
                        </div>
                        <textarea
                            value={notes || ''}
                            onChange={(e) => onNotesChange?.(e.target.value)}
                            placeholder="Ajoutez des notes pour cet ordre… (visible uniquement par vous)"
                            className="w-full min-h-[180px] p-3 text-[13px] text-slate-800 placeholder:text-slate-400 bg-slate-50/40 border border-slate-200 rounded-md focus:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none resize-y transition-colors"
                        />
                        <p className="text-[10px] text-slate-400 mt-2">
                            Enregistré automatiquement en local
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
            <footer className="px-4 py-3 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
                <div className="flex items-center gap-1">
                    <ActionBtn onClick={onEdit} icon={Edit2}>Modifier</ActionBtn>
                    <ActionBtn onClick={onSplit} icon={Split}>Diviser</ActionBtn>
                    <ActionBtn onClick={onDuplicate} icon={Copy} />
                </div>
                <div className="flex items-center gap-1">
                    {progress === 100 && (
                        <button
                            type="button"
                            onClick={() => onChangeStatus('DONE')}
                            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        >
                            <CheckCircle2 className="w-3 h-3" />
                            Modèle fini
                        </button>
                    )}
                    <ActionBtn onClick={onDelete} icon={Trash2} danger />
                </div>
            </footer>
        </aside>
    );
}

function PropertyRow({
    icon: Icon, label, value,
}: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-baseline gap-3">
            <div className="w-20 shrink-0 flex items-center gap-1.5 text-[11px] text-slate-500">
                <Icon className="w-3 h-3 text-slate-400" strokeWidth={1.75} />
                {label}
            </div>
            <div className="flex-1 text-[12px] text-slate-900 truncate">{value}</div>
        </div>
    );
}

function ActivityItem({
    icon: Icon, label, time, description, accent,
}: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; time?: string; description?: string; accent?: string }) {
    return (
        <li className="relative pl-5">
            <span className="absolute left-[-5px] top-0.5 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-300" />
            <div className={`text-[12px] font-medium text-slate-900 ${accent || ''}`}>{label}</div>
            {time && <div className="text-[11px] text-slate-500 mt-0.5">{time}</div>}
            {description && <div className="text-[11px] text-slate-500 mt-0.5">{description}</div>}
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
            className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium transition-colors ${
                danger
                    ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
        >
            <Icon className="w-3 h-3" strokeWidth={2} />
            {children}
        </button>
    );
}
