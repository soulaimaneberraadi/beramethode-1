import React from 'react';
import { X } from 'lucide-react';
import type { WorkStatus } from '../shared/statusConfig';
import { STATUS_META } from '../shared/statusConfig';
import { getClientColor } from '../shared/clientColors';

interface Props {
    open: boolean;
    allClients: string[];
    selectedClients: Set<string>;
    selectedStatuses: Set<WorkStatus>;
    hasActive: boolean;
    onToggleClient: (c: string) => void;
    onToggleStatus: (s: WorkStatus) => void;
    onReset: () => void;
}

const STATUS_ORDER: WorkStatus[] = ['READY', 'IN_PROGRESS', 'BLOCKED', 'DONE'];

export default function QuickFilters({
    open,
    allClients,
    selectedClients,
    selectedStatuses,
    hasActive,
    onToggleClient,
    onToggleStatus,
    onReset,
}: Props) {
    if (!open) return null;

    return (
        <div className="shrink-0 px-6 py-3 border-b border-slate-100 bg-slate-50/40">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">

                {/* Status section */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mr-1">
                        Statut
                    </span>
                    {STATUS_ORDER.map(s => {
                        const meta = STATUS_META[s];
                        const active = selectedStatuses.has(s);
                        return (
                            <button
                                key={s}
                                type="button"
                                onClick={() => onToggleStatus(s)}
                                className={`inline-flex items-center gap-1.5 h-6 px-2 rounded text-[11px] font-medium transition-colors ${
                                    active
                                        ? 'bg-white text-slate-900 ring-1 ring-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                                }`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                                {meta.label}
                            </button>
                        );
                    })}
                </div>

                {/* Clients section */}
                {allClients.length > 0 && (
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mr-1 shrink-0">
                            Client
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {allClients.slice(0, 8).map(c => {
                                const active = selectedClients.has(c);
                                const color = getClientColor(c);
                                return (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => onToggleClient(c)}
                                        className={`inline-flex items-center gap-1.5 h-6 px-2 rounded text-[11px] font-medium transition-colors max-w-[10rem] ${
                                            active
                                                ? 'bg-white text-slate-900 ring-1 ring-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                                        }`}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                                        <span className="truncate">{c}</span>
                                    </button>
                                );
                            })}
                            {allClients.length > 8 && (
                                <span className="text-[10px] text-slate-400">
                                    +{allClients.length - 8} autres
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {hasActive && (
                    <button
                        type="button"
                        onClick={onReset}
                        className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium text-slate-500 hover:text-slate-900 hover:bg-white/60 ml-auto transition-colors"
                    >
                        <X className="w-3 h-3" />
                        Effacer
                    </button>
                )}
            </div>
        </div>
    );
}
