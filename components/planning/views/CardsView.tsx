import React, { useMemo } from 'react';
import type { ModelData, PlanningEvent } from '../../../types';
import { evClientName, evEndYmd, evModelName, evModelThumb, evProgressPct, evQty, evStartYmd } from '../shared/eventAccessors';
import { getClientColor } from '../shared/clientColors';
import { getModelColor } from '../shared/modelColors';
import { STATUS_META, toWorkStatus, type WorkStatus } from '../shared/statusConfig';
import { delayOf } from '../hooks/useDelayIndicator';
import { DELAY_META } from '../shared/statusConfig';
import { Package, Calendar, Clock, Layers } from 'lucide-react';
import { fmtShort, daysBetween, todayYmd } from '../shared/dateFmt';
import { evDeadlineYmd } from '../shared/eventAccessors';
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

/** "CHAINE 1" -> "CH1" ; sinon renvoie tel quel (tronqué). */
function shortChain(chaineId?: string): string | null {
    if (!chaineId) return null;
    const m = chaineId.match(/(\d+)\s*$/);
    return m ? `CH${m[1]}` : chaineId.slice(0, 6);
}

interface Props {
    events: PlanningEvent[];
    models: ModelData[];
    onSelectEvent: (id: string) => void;
    onEditEvent: (id: string) => void;
}

export default function CardsView({ events, models, onSelectEvent, onEditEvent }: Props) {
    const { lang } = useLang();

    const COLUMNS: { status: WorkStatus; label: string }[] = [
        { status: 'READY', label: tx(lang, { fr: 'Prêts à lancer', ar: 'جاهزة للانطلاق', en: 'Ready to launch', es: 'Listos para lanzar', pt: 'Prontos para lançar', tr: 'Başlatılmaya hazır' }) },
        { status: 'IN_PROGRESS', label: tx(lang, { fr: 'En cours', ar: 'قيد التنفيذ', en: 'In progress', es: 'En curso', pt: 'Em andamento', tr: 'Devam ediyor' }) },
        { status: 'BLOCKED', label: tx(lang, { fr: 'Bloqués', ar: 'محظورة', en: 'Blocked', es: 'Bloqueados', pt: 'Bloqueados', tr: 'Engellendi' }) },
        { status: 'DONE', label: tx(lang, { fr: 'Terminés', ar: 'منتهية', en: 'Completed', es: 'Terminados', pt: 'Concluídos', tr: 'Tamamlandı' }) },
    ];
    const grouped = useMemo(() => {
        const map: Record<WorkStatus, PlanningEvent[]> = {
            READY: [], IN_PROGRESS: [], BLOCKED: [], DONE: [],
        };
        for (const ev of events) {
            const ws = toWorkStatus(ev.status);
            map[ws].push(ev);
        }
        return map;
    }, [events]);

    if (events.length === 0) {
        return (
            <div className="p-6 bg-slate-50/30 dark:bg-dk-bg min-h-full flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-white dark:bg-dk-surface border border-slate-150 dark:border-dk-border flex items-center justify-center mb-4 shadow-sm">
                    <Layers className="w-6 h-6 text-slate-300 dark:text-dk-muted" strokeWidth={1.75} />
                </div>
                <p className="text-[14px] font-semibold text-slate-700 dark:text-dk-text-soft">{tx(lang, { fr: 'Aucun ordre à afficher', ar: 'لا يوجد أمر للعرض', en: 'No orders to display', es: 'Sin órdenes para mostrar', pt: 'Nenhum pedido para exibir', tr: 'Gösterilecek sipariş yok' })}</p>
                <p className="text-[12px] text-slate-400 dark:text-dk-muted mt-1 max-w-[260px]">
                    {tx(lang, { fr: 'Aucun OF ne correspond. Cliquez sur « Planifier » pour en créer un, ou ajustez vos filtres.', ar: 'لا يوجد أمر تصنيع مطابق. انقر على «تخطيط» لإنشاء واحد، أو اضبط عوامل التصفية.', en: 'No matching manufacturing order. Click "Plan" to create one, or adjust your filters.', es: 'Ninguna OF coincide. Haga clic en « Planificar » para crear una, o ajuste sus filtros.', pt: 'Nenhuma OF corresponde. Clique em « Planejar » para criar uma, ou ajuste seus filtros.', tr: 'Eşleşen üretim emri yok. Oluşturmak için « Planla »ya tıklayın veya filtrelerinizi ayarlayın.' })}</p>
            </div>
        );
    }

    return (
        <div className="p-3 sm:p-6 bg-slate-50/30 min-h-full">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {COLUMNS.map(col => {
                    const items = grouped[col.status];
                    const meta = STATUS_META[col.status];
                    return (
                        <div key={col.status} className="bg-white rounded-xl border border-slate-100 flex flex-col min-h-[200px]">
                            {/* Column header */}
                            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                                    <span className="text-[12px] font-semibold text-slate-900">{col.label}</span>
                                </div>
                                <span className="text-[11px] text-slate-400 tabular-nums">{items.length}</span>
                            </div>

                            {/* Cards */}
                            <div className="p-2 space-y-2 flex-1">
                                {items.length === 0 && (
                                    <div className="text-center text-[11px] text-slate-400 py-8">
                                        {tx(lang, { fr: 'Aucun ordre', ar: 'لا يوجد أمر', en: 'No orders', es: 'Sin órdenes', pt: 'Nenhum pedido', tr: 'Sipariş yok' })}
                                    </div>
                                )}
                                {items.map(ev => (
                                    <EventCard
                                        key={ev.id}
                                        event={ev}
                                        models={models}
                                        onClick={() => onSelectEvent(ev.id)}
                                        onDoubleClick={() => onEditEvent(ev.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function EventCard({
    event, models, onClick, onDoubleClick,
}: { event: PlanningEvent; models: ModelData[]; onClick: () => void; onDoubleClick: () => void }) {
    const { lang } = useLang();
    const client = evClientName(event, models);
    const modelName = evModelName(event, models);
    const thumb = evModelThumb(event, models);
    const modelKey = event.modelId || modelName || client;
    const accent = (event.modelId || modelName) ? getModelColor(event.modelId || modelName) : (event.color || getModelColor(modelKey));
    const qty = evQty(event);
    const progress = evProgressPct(event);
    const delay = delayOf(event);
    const delayMeta = DELAY_META[delay];
    const isSub = !!event.isSubcontracted;
    const chainLabel = shortChain(event.chaineId);
    const ddsYmd = evDeadlineYmd(event);
    const daysToDDS = ddsYmd ? daysBetween(todayYmd(), ddsYmd) : null;

    return (
        <button
            type="button"
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            className={`group w-full text-left hover:shadow-[0_2px_8px_rgba(15,23,42,0.04)] rounded-lg p-3 transition-all ${
                isSub
                    ? 'bg-indigo-50/10 border border-dashed border-indigo-400 hover:border-indigo-500'
                    : 'bg-white border border-slate-100 hover:border-slate-200'
            }`}
        >
            <div className="flex items-start gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-md flex items-center justify-center text-xs font-black text-white shrink-0 shadow-xs" style={{ background: getClientColor(client) }}>
                    {(client || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5 mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getClientColor(client) }} title={`Client: ${client}`} />
                            <span className="text-[10px] text-slate-500 truncate">{client}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            {chainLabel && (
                                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 tabular-nums" title={event.chaineId}>
                                    {chainLabel}
                                </span>
                            )}
                            {isSub && (
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.25 rounded ${
                                    event.subcontractStatus === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    event.subcontractStatus === 'SENT' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                    'bg-slate-50 text-slate-600 border border-slate-200'
                                }`} title={event.subcontractorName}>
                                    {event.subcontractStatus || 'PENDING'}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="text-[12px] font-semibold text-slate-900 truncate">{modelName}</div>
                    {isSub && event.subcontractorName && (
                        <div className="text-[9px] text-indigo-600 font-medium truncate mt-0.5">
                            {tx(lang, { fr: 'S-T:', ar: 'م ب:', en: 'Sub:', es: 'Sub:', pt: 'Sub:', tr: 'Taş:' })} {event.subcontractorName}
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 tabular-nums">{qty} pcs</span>
                    <span className="text-slate-700 font-medium tabular-nums">{progress}%</span>
                </div>
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-[width]" style={{ width: `${progress}%`, background: accent }} />
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                    <div className="flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" strokeWidth={1.75} />
                        <span className="tabular-nums">{fmtShort(evStartYmd(event))}</span>
                    </div>
                    {ddsYmd && (
                        <div className={`flex items-center gap-1 ${delay === 'LATE' ? 'text-red-600 font-semibold' : daysToDDS !== null && daysToDDS <= 7 ? 'text-amber-600 font-medium' : ''}`}>
                            <Clock className="w-2.5 h-2.5" strokeWidth={1.75} />
                            <span className="tabular-nums">{fmtShort(ddsYmd)}</span>
                            {daysToDDS !== null && (
                                <span className="tabular-nums font-semibold">
                                    {daysToDDS < 0 ? `J+${Math.abs(daysToDDS)}` : `J-${daysToDDS}`}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {delay !== 'ON_TIME' && !isSub && (
                    <div className={`inline-flex items-center gap-1 text-[10px] font-medium ${delayMeta.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${delayMeta.dot}`} />
                        {delayMeta.label}
                    </div>
                )}
            </div>
        </button>
    );
}
