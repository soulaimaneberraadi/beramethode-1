import React from 'react';
import type { PlanningEvent, ModelData, AppSettings } from '../../../../types';
import { evClientName, evModelName, evProgressPct, evQty, evModelThumb } from '../../shared/eventAccessors';
import { getClientColor, getClientColorSoft } from '../../shared/clientColors';
import { getModelColor } from '../../shared/modelColors';
import { toWorkStatus } from '../../shared/statusConfig';
import { delayOf } from '../../hooks/useDelayIndicator';
import { fmtShort } from '../../shared/dateFmt';
import { AlertCircle } from 'lucide-react';
import { getWorkMinutesPerDay } from '../../../../utils/planning';

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
    settings?: AppSettings;
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
    onClick, onDoubleClick, onContextMenu, onDragStart, onDragEnd, settings,
}: Props) {
    const h = compact ? 32 : 56;
    const client = evClientName(event, models);
    const modelName = evModelName(event, models);
    
    // Setup buffer visual space calculations
    const model = models.find(m => m.id === event.modelId);
    const bufferLancement = model?.ficheData?.bufferLancement !== undefined 
        ? model.ficheData.bufferLancement 
        : (settings?.changeoverDurationMins ?? 120);

    const workMins = settings ? getWorkMinutesPerDay(settings) : 480;
    const operators = event.chaineId ? (settings?.chainOperators?.[event.chaineId] ?? 30) : 30;

    const defaultEff = settings?.chainActivityRate?.[event.chaineId] ?? 0.60;
    const chainEff = defaultEff;
    const modelEff = model?.ficheData?.targetEfficiency ?? 85;
    const safetyFactor = model?.ficheData?.facteurPlanning ?? 60;
    const performance = model ? (modelEff * safetyFactor) / 10000 : chainEff;

    const samMins = Math.max(0.1, model?.meta_data?.total_temps || 15);
    const capacity = (operators * workMins * performance) / samMins;

    const qty = evQty(event);
    const setupDays = bufferLancement / workMins;
    const productionDays = capacity > 0 ? (qty / capacity) : 1;
    const daysNeeded = Math.ceil(productionDays + setupDays);

    const setupPct = daysNeeded > 0 ? (setupDays / daysNeeded) * 100 : 0;

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
        bufferLancement > 0 ? `Préparation (Lancement): ${bufferLancement} min` : '',
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
                background: event.status === 'BLOCKED_STOCK'
                    ? 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.08) 6px, rgba(245, 158, 11, 0.18) 6px, rgba(245, 158, 11, 0.18) 12px)'
                    : selected 
                        ? (delay === 'LATE' && !event.isSubcontracted ? 'rgba(239, 68, 68, 0.16)' : accentSoft) 
                        : (delay === 'LATE' && !event.isSubcontracted ? 'rgba(239, 68, 68, 0.08)' : accentBg),
                borderLeft: event.status === 'BLOCKED_STOCK' ? '5px solid #F59E0B' : (delay === 'LATE' && !event.isSubcontracted ? '5px solid #EF4444' : `4px solid ${accent}`),
                borderTop: event.status === 'BLOCKED_STOCK' ? '1px solid rgba(245, 158, 11, 0.3)' : event.isSubcontracted ? `1.5px dashed ${accent}` : `1px solid ${delay === 'LATE' && !event.isSubcontracted ? 'rgba(239, 68, 68, 0.3)' : (accent.startsWith('#') ? hexToRgba(accent, 0.15) : 'rgba(0,0,0,0.1)')}`,
                borderRight: event.status === 'BLOCKED_STOCK' ? '1px solid rgba(245, 158, 11, 0.3)' : event.isSubcontracted ? `1.5px dashed ${accent}` : `1px solid ${delay === 'LATE' && !event.isSubcontracted ? 'rgba(239, 68, 68, 0.3)' : (accent.startsWith('#') ? hexToRgba(accent, 0.15) : 'rgba(0,0,0,0.1)')}`,
                borderBottom: event.status === 'BLOCKED_STOCK' ? '1px solid rgba(245, 158, 11, 0.3)' : event.isSubcontracted ? `1.5px dashed ${accent}` : `1px solid ${delay === 'LATE' && !event.isSubcontracted ? 'rgba(239, 68, 68, 0.3)' : (accent.startsWith('#') ? hexToRgba(accent, 0.15) : 'rgba(0,0,0,0.1)')}`,
                boxShadow: event.status === 'BLOCKED_STOCK'
                    ? '0 0 8px rgba(245, 158, 11, 0.25)'
                    : delay === 'LATE' && !event.isSubcontracted 
                        ? '0 0 12px rgba(239, 68, 68, 0.35)' 
                        : (selected
                            ? `0 4px 16px ${accent.startsWith('#') ? hexToRgba(accent, 0.15) : 'rgba(0,0,0,0.1)'}`
                            : `0 1px 2px ${accent.startsWith('#') ? hexToRgba(accent, 0.06) : 'rgba(0,0,0,0.05)'}`),
            }}
        >
            {/* Visual launch buffer watermark / striped region */}
            {!done && setupPct > 0 && (
                <div 
                    className="absolute left-0 top-0 bottom-0 pointer-events-none" 
                    style={{ 
                        width: `${setupPct}%`,
                        backgroundImage: 'repeating-linear-gradient(45deg, rgba(148, 163, 184, 0.06), rgba(148, 163, 184, 0.06) 4px, rgba(148, 163, 184, 0.15) 4px, rgba(148, 163, 184, 0.15) 8px)',
                        borderRight: '1.5px dashed rgba(148, 163, 184, 0.4)',
                        zIndex: 0,
                    }}
                />
            )}
            <div className="h-full flex relative z-10 w-full">
                {/* Model photo thumbnail */}
                {/* Model photo thumbnail (Disabled) */}

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
                        {event.status === 'BLOCKED_STOCK' && (
                            <span className="flex items-center gap-1 text-[9px] font-extrabold text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded shrink-0 shadow-sm">
                                ⏸ EN PAUSE
                            </span>
                        )}
                        {delay === 'LATE' && !event.isSubcontracted && (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-red-600 bg-red-55 border border-red-200 px-1 py-0.5 rounded shrink-0 animate-pulse shadow-sm">
                                <AlertCircle className="w-3 h-3 text-red-500" />
                                RETARD
                            </span>
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
