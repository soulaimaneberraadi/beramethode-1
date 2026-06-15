import React from 'react';
import { X } from 'lucide-react';
import type { WorkStatus } from '../shared/statusConfig';
import { STATUS_META } from '../shared/statusConfig';
import { getClientColor } from '../shared/clientColors';

interface Props {
    open: boolean;
    allClients: string[];
    allChains?: string[];
    chainNames?: Record<string, string>;
    selectedClients: Set<string>;
    selectedStatuses: Set<WorkStatus>;
    selectedChains?: Set<string>;
    hasActive: boolean;
    onToggleClient: (c: string) => void;
    onToggleStatus: (s: WorkStatus) => void;
    onToggleChain?: (c: string) => void;
    onReset: () => void;
    showCriticalOnly?: boolean;
    onToggleCriticalOnly?: () => void;
}

const STATUS_ORDER: WorkStatus[] = ['READY', 'IN_PROGRESS', 'BLOCKED', 'DONE'];

export default function QuickFilters({
    open,
    allClients,
    allChains,
    chainNames,
    selectedClients,
    selectedStatuses,
    selectedChains,
    hasActive,
    onToggleClient,
    onToggleStatus,
    onToggleChain,
    onReset,
    showCriticalOnly,
    onToggleCriticalOnly,
}: Props) {
    if (!open) return null;

    return (
        <div className="shrink-0 px-3 sm:px-6 py-3 border-b border-slate-200/40 bg-white/40 backdrop-blur-md transition-all duration-300 overflow-x-auto">
            <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-3">

                {/* Status section */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1.5">
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
                                className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-lg text-[11px] font-bold transition-all duration-200 active:scale-95 ${
                                    active
                                        ? 'bg-white text-slate-900 ring-1 ring-slate-200/60 shadow-[0_2px_6px_rgba(0,0,0,0.04)]'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                                }`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                                {meta.label}
                            </button>
                        );
                    })}
                </div>

                {/* Chaîne section */}
                {onToggleChain && allChains && allChains.length > 0 && (
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1.5 shrink-0">
                            Chaîne
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {allChains.map(c => {
                                const active = selectedChains?.has(c);
                                const label = chainNames?.[c] || c;
                                return (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => onToggleChain(c)}
                                        className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-lg text-[11px] font-bold transition-all duration-200 active:scale-95 max-w-[10rem] ${
                                            active
                                                ? 'bg-white text-slate-900 ring-1 ring-slate-200/60 shadow-[0_2px_6px_rgba(0,0,0,0.04)]'
                                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                                        }`}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-indigo-500' : 'bg-slate-350'}`} />
                                        <span className="truncate">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Clients section */}
                {allClients.length > 0 && (
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1.5 shrink-0">
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
                                        className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-lg text-[11px] font-bold transition-all duration-200 active:scale-95 max-w-[10rem] ${
                                            active
                                                ? 'bg-white text-slate-900 ring-1 ring-slate-200/60 shadow-[0_2px_6px_rgba(0,0,0,0.04)]'
                                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                                        }`}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                                        <span className="truncate">{c}</span>
                                    </button>
                                );
                            })}
                            {allClients.length > 8 && (
                                <span className="text-[10px] font-bold text-slate-400">
                                    +{allClients.length - 8} autres
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Critical Only Filter section */}
                {onToggleCriticalOnly && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1.5">
                            Filtres
                        </span>
                        <button
                            type="button"
                            onClick={onToggleCriticalOnly}
                            className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-lg text-[11px] font-bold transition-all duration-200 active:scale-95 ${
                                showCriticalOnly
                                    ? 'bg-red-500/10 text-red-700 ring-1 ring-red-550/25 shadow-[0_2px_6px_rgba(239,68,68,0.05)]'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                            }`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${showCriticalOnly ? 'bg-red-550' : 'bg-slate-350'}`} />
                            Taux Critique (CR)
                        </button>
                    </div>
                )}

                {hasActive && (
                    <button
                        type="button"
                        onClick={onReset}
                        className="inline-flex items-center gap-1 h-6 px-2.5 rounded-lg text-[11px] font-bold text-slate-500 hover:text-red-600 hover:bg-red-50/50 border border-transparent hover:border-red-200/50 ml-auto transition-all duration-200 active:scale-95"
                    >
                        <X className="w-3 h-3" />
                        Effacer
                    </button>
                )}
            </div>
        </div>
    );
}
