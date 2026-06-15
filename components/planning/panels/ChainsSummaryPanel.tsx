import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronDown, Eye, Link2, X } from 'lucide-react';
import type { PlanningChain } from '../hooks/usePlanningChains';

interface ChainContextMenu {
    x: number;
    y: number;
    chainId: string;
}

interface Props {
    chains: PlanningChain[];
    soloChainId: string | null;
    onToggleSolo: (id: string) => void;
    onViewChainOnly: (id: string) => void;
}

export default function ChainsSummaryPanel({
    chains,
    soloChainId,
    onToggleSolo,
    onViewChainOnly,
}: Props) {
    const [expanded, setExpanded] = useState(true);
    const [ctxMenu, setCtxMenu] = useState<ChainContextMenu | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const dotColor = (eff: number) =>
        eff >= 1.1 ? 'bg-emerald-400' :
        eff >= 0.9 ? 'bg-emerald-400' :
        eff >= 0.7 ? 'bg-amber-400' :
        'bg-red-400';

    const effStyle = (eff: number) =>
        eff >= 1.1 ? 'text-emerald-600' :
        eff >= 0.9 ? 'text-slate-500' :
        eff >= 0.7 ? 'text-amber-600' :
        'text-red-500';

    const handleRightClick = useCallback((e: React.MouseEvent, chainId: string) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, chainId });
    }, []);

    // Fermer le menu au clic extérieur
    useEffect(() => {
        if (!ctxMenu) return;
        const close = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setCtxMenu(null);
            }
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [ctxMenu]);

    return (
        <div className="shrink-0 border-b border-slate-100">
            {/* Header */}
            <div
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(v => !v)}
                onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
                className="w-full h-8 px-6 flex items-center justify-between hover:bg-slate-50/60 transition-colors cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <Link2 className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-semibold text-slate-400 tracking-widest uppercase">
                        Chaînes
                    </span>
                    <span className="text-[9px] font-black text-slate-400">·</span>
                    <span className="text-[10px] font-bold text-slate-500">{chains.length}</span>
                    {soloChainId && (
                        <span className="ml-2 text-[10px] font-medium text-indigo-500 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                            {soloChainId}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {soloChainId && (
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); onToggleSolo(soloChainId); }}
                            onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onToggleSolo(soloChainId))}
                            className="text-[9px] text-slate-400 hover:text-slate-600 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                            <X className="w-2.5 h-2.5" />
                            Tout
                        </span>
                    )}
                    <ChevronDown
                        className={`w-3 h-3 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        strokeWidth={2.5}
                    />
                </div>
            </div>

            {/* Chains list */}
            {expanded && (
                <div className="flex overflow-x-auto gap-0 border-t border-slate-100 divide-x divide-slate-100">
                    {chains.map(chain => {
                        const isSolo = soloChainId === chain.id;
                        const pct = Math.round(chain.efficiency * 100);
                        return (
                            <button
                                key={chain.id}
                                type="button"
                                title="Clic: isoler · Clic droit: options"
                                onClick={() => onToggleSolo(chain.id)}
                                onContextMenu={e => handleRightClick(e, chain.id)}
                                className={`shrink-0 flex flex-col justify-center gap-0.5 px-4 py-2 text-left transition-colors min-w-[120px] ${
                                    isSolo
                                        ? 'bg-indigo-50 border-b-2 border-b-indigo-500'
                                        : 'hover:bg-slate-50/60 border-b-2 border-b-transparent'
                                }`}
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor(chain.efficiency)}`} />
                                    <span className={`text-[11px] font-semibold truncate ${isSolo ? 'text-indigo-700' : 'text-slate-800'}`}>
                                        {chain.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 ml-3">
                                    <span className="text-[9px] text-slate-400 tabular-nums">
                                        {chain.capacityPerDay.toLocaleString()} pcs/j
                                    </span>
                                    <span className={`text-[9px] font-bold tabular-nums ${effStyle(chain.efficiency)}`}>
                                        η {pct}%
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Context menu */}
            {ctxMenu && (
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
                    className="bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[180px] animate-[planning-fade-up_80ms_ease-out]"
                >
                    <div className="px-3 py-1.5 border-b border-slate-100">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            {ctxMenu.chainId}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            onToggleSolo(ctxMenu.chainId);
                            setCtxMenu(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                        Isoler cette chaîne
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onViewChainOnly(ctxMenu.chainId);
                            setCtxMenu(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <Eye className="w-3.5 h-3.5 text-indigo-500" />
                        Voir seule (modèles)
                    </button>
                    {soloChainId && (
                        <button
                            type="button"
                            onClick={() => {
                                onToggleSolo(soloChainId);
                                setCtxMenu(null);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-500 hover:bg-slate-50 transition-colors border-t border-slate-100"
                        >
                            <X className="w-3.5 h-3.5 text-slate-400" />
                            Tout afficher
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
