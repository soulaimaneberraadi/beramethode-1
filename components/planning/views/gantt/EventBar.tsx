import React from 'react';
import type { PlanningEvent, ModelData } from '../../../../types';
import { evClientName, evModelName, evProgressPct, evQty } from '../../shared/eventAccessors';
import { getClientColor } from '../../shared/clientColors';
import { toWorkStatus } from '../../shared/statusConfig';
import { delayOf } from '../../hooks/useDelayIndicator';
import { fmtShort } from '../../shared/dateFmt';

interface Props {
    event: PlanningEvent;
    models: ModelData[];
    style: React.CSSProperties;
    selected: boolean;
    dimmed?: boolean;
    compact?: boolean;
    onClick: () => void;
    onDoubleClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onDragStart: (e: React.DragEvent) => void;
}

export default function EventBar({
    event, models, style, selected, dimmed, compact,
    onClick, onDoubleClick, onContextMenu, onDragStart,
}: Props) {
    const h = compact ? 32 : 56;
    const client = evClientName(event, models);
    const modelName = evModelName(event, models);
    const accent = event.color || getClientColor(client);
    const qty = evQty(event);
    const progress = evProgressPct(event);
    const ws = toWorkStatus(event.status);
    const delay = delayOf(event);
    const blocked = ws === 'BLOCKED';
    const done = ws === 'DONE';

    const title = [
        `${client} · ${modelName}`,
        `${qty} pcs · ${progress}%`,
        event.strictDeadline_DDS ? `DDS: ${fmtShort(event.strictDeadline_DDS)}` : '',
        event.blockedReason ? `Bloqué: ${event.blockedReason}` : '',
        event.isSubcontracted ? `Sous-traitance: ${event.subcontractorName || 'Externe'} (${event.subcontractStatus || 'PENDING'})` : '',
    ].filter(Boolean).join('\n');

    return (
        <div
            draggable={!done}
            onDragStart={onDragStart}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            title={title}
            className={`planning-event-bar absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing transition-all duration-150 group overflow-hidden rounded-md ${
                selected
                    ? 'ring-2 ring-offset-1 ring-slate-900 z-20'
                    : 'hover:ring-1 hover:ring-slate-300 z-10'
            } ${dimmed ? 'opacity-25' : 'opacity-100'}`}
            style={{
                ...style,
                height: h,
                background: '#FFFFFF',
                borderLeft: `4px solid ${accent}`,
                borderTop: event.isSubcontracted ? `1.5px dashed ${accent}` : '1px solid #F1F5F9',
                borderRight: event.isSubcontracted ? `1.5px dashed ${accent}` : '1px solid #F1F5F9',
                borderBottom: event.isSubcontracted ? `1.5px dashed ${accent}` : '1px solid #F1F5F9',
                boxShadow: selected
                    ? '0 4px 16px rgba(15,23,42,0.10)'
                    : '0 1px 2px rgba(15,23,42,0.06)',
            }}
        >
            <div className="h-full flex">
                {/* Status indicator strip */}
                <div className={`w-0.5 ${
                    blocked ? 'bg-red-500' :
                    delay === 'LATE' ? 'bg-red-500' :
                    delay === 'AT_RISK' ? 'bg-amber-400' :
                    'bg-transparent'
                }`} />

                {/* Content */}
                <div className="flex-1 min-w-0 px-2.5 py-1.5 flex flex-col justify-between">
                    {/* Top line */}
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[11px] font-semibold text-slate-900 truncate">
                            {client}
                        </span>
                        {event.isSubcontracted && (
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.25 rounded shrink-0 ${
                                event.subcontractStatus === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                event.subcontractStatus === 'SENT' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                'bg-slate-50 text-slate-600 border border-slate-200'
                            }`} title={event.subcontractorName}>
                                {event.subcontractorName ? `Sous-trait: ${event.subcontractorName}` : 'Sous-traitance'}
                            </span>
                        )}
                        {delay === 'LATE' && !event.isSubcontracted && (
                            <span className="text-[9px] font-semibold text-red-600 shrink-0">RETARD</span>
                        )}
                        {delay === 'AT_RISK' && !event.isSubcontracted && (
                            <span className="text-[9px] font-semibold text-amber-600 shrink-0">RISQUE</span>
                        )}
                    </div>

                    {/* Middle line */}
                    <div className="flex items-baseline gap-2 text-[10px] text-slate-500 min-w-0">
                        <span className="truncate">{modelName}</span>
                        <span className="text-slate-300">·</span>
                        <span className="tabular-nums shrink-0">{qty} pcs</span>
                    </div>

                    {/* Progress + done */}
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-[3px] bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-[width] duration-300"
                                style={{ width: `${progress}%`, background: done ? '#94A3B8' : accent }}
                            />
                        </div>
                        <span className={`text-[10px] tabular-nums font-medium shrink-0 ${done ? 'text-slate-400' : 'text-slate-700'}`}>
                            {progress}%
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
