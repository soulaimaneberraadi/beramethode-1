import React from 'react';
import type { PlanningEvent, ModelData } from '../../../../types';
import { evClientName, evModelName, evProgressPct, evQty, evModelThumb } from '../../shared/eventAccessors';
import { getClientColor, getClientColorSoft } from '../../shared/clientColors';
import { getModelColor } from '../../shared/modelColors';
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
    showCRColors?: boolean;
    onClick: (e: React.MouseEvent) => void;
    onDoubleClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
}

function hexToRgba(hex: string, alpha: number): string {
    // Handle named color fallbacks or hex colors that don't start with '#'
    if (!hex.startsWith('#')) {
        return hex;
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function EventBar({
    event, models, style, selected, dimmed, compact, showCRColors,
    onClick, onDoubleClick, onContextMenu, onDragStart, onDragEnd,
}: Props) {
    const h = compact ? 32 : 56;
    const client = evClientName(event, models);
    const modelName = evModelName(event, models);
    
    // Couleur unique par modèle (priorité: modelId > modelName > client)
    const modelKey = event.modelId || modelName || client;
    let accent = (event.modelId || modelName) ? getModelColor(event.modelId || modelName) : (event.color || getModelColor(modelKey));
    let isPulse = false;

    const ws = toWorkStatus(event.status);
    const done = ws === 'DONE';

    if (showCRColors && event.crValue !== undefined) {
        const cr = event.crValue;
        if (done) {
            accent = '#94A3B8'; // Slate 400
        } else if (ws === 'BLOCKED' || event.status === 'BLOCKED_STOCK') {
            accent = '#F59E0B'; // Amber 500
        } else if (cr < 0.8) {
            accent = '#EF4444'; // Red 500
            isPulse = true;
        } else if (cr < 1.0) {
            accent = '#F97316'; // Orange 500
        } else if (cr < 1.3) {
            accent = '#10B981'; // Emerald 500
        } else {
            accent = '#60A5FA'; // Blue 400
        }
    }

    const accentSoft = accent.startsWith('#') ? hexToRgba(accent, 0.12) : accent;
    const accentBg = accent.startsWith('#') ? hexToRgba(accent, 0.06) : accent;

    const qty = evQty(event);
    const progress = evProgressPct(event);
    const delay = delayOf(event);
    const blocked = ws === 'BLOCKED';
    const thumb = evModelThumb(event, models);

    const title = [
        `${client} · ${modelName}`,
        `${qty} pcs · ${progress}%`,
        event.crValue !== undefined ? `Critical Ratio: ${event.crValue.toFixed(2)} (${event.crStatus || ''})` : '',
        event.strictDeadline_DDS ? `DDS: ${fmtShort(event.strictDeadline_DDS)}` : '',
        event.blockedReason ? `Bloqué: ${event.blockedReason}` : '',
        event.isSubcontracted ? `Sous-traitance: ${event.subcontractorName || 'Externe'} (${event.subcontractStatus || 'PENDING'})` : '',
    ].filter(Boolean).join('\n');

    return (
        <div
            draggable={!done}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            title={title}
            className={`planning-event-bar absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing transition-all duration-150 group overflow-hidden rounded-md ${
                selected
                    ? 'ring-2 ring-offset-1 ring-slate-900 z-20'
                    : 'hover:ring-1 hover:ring-slate-300 z-10'
            } ${dimmed ? 'opacity-25' : 'opacity-100'} ${isPulse ? 'animate-pulse' : ''}`}
            style={{
                ...style,
                height: h,
                background: selected ? accentSoft : accentBg,
                borderLeft: `4px solid ${accent}`,
                borderTop: event.isSubcontracted ? `1.5px dashed ${accent}` : `1px solid ${accent.startsWith('#') ? hexToRgba(accent, 0.15) : 'rgba(0,0,0,0.1)'}`,
                borderRight: event.isSubcontracted ? `1.5px dashed ${accent}` : `1px solid ${accent.startsWith('#') ? hexToRgba(accent, 0.15) : 'rgba(0,0,0,0.1)'}`,
                borderBottom: event.isSubcontracted ? `1.5px dashed ${accent}` : `1px solid ${accent.startsWith('#') ? hexToRgba(accent, 0.15) : 'rgba(0,0,0,0.1)'}`,
                boxShadow: selected
                    ? `0 4px 16px ${accent.startsWith('#') ? hexToRgba(accent, 0.15) : 'rgba(0,0,0,0.1)'}`
                    : `0 1px 2px ${accent.startsWith('#') ? hexToRgba(accent, 0.06) : 'rgba(0,0,0,0.05)'}`,
            }}
        >
            <div className="h-full flex">
                {/* Model photo thumbnail */}
                {thumb && (
                    <div className="shrink-0 overflow-hidden border-r" style={{ width: compact ? 28 : 40, borderColor: hexToRgba(accent, 0.2) }}>
                        <img
                            src={thumb}
                            alt={modelName}
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                    </div>
                )}

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
                        <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: getClientColor(client) }}
                            title={`Client: ${client}`}
                        />
                        <span className="text-[11px] font-semibold text-slate-900 truncate">
                            {client}
                        </span>
                        {event.crValue !== undefined && !compact && (
                            <span
                                className={`text-[8px] font-extrabold px-1.5 py-0.25 rounded-full shrink-0 ${
                                    event.crValue < 0.8 ? 'bg-red-100 text-red-700 border border-red-200' :
                                    event.crValue < 1.0 ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                                    event.crValue < 1.3 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                    'bg-blue-100 text-blue-700 border border-blue-200'
                                }`}
                                title={`Critical Ratio: ${event.crValue.toFixed(2)}`}
                            >
                                CR {event.crValue.toFixed(2)}
                            </span>
                        )}
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
                        <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: hexToRgba(accent, 0.15) }}>
                            <div
                                className="h-full rounded-full transition-[width] duration-300"
                                style={{ width: `${progress}%`, background: done ? '#94A3B8' : accent }}
                            />
                        </div>
                        <span className={`text-[10px] tabular-nums font-medium shrink-0 ${done ? 'text-slate-400' : 'text-slate-600'}`}>
                            {progress}%
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
