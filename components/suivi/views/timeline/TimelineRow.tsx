import React from 'react';
import type { ChainActiveContext } from '../../hooks/useSuiviActiveContext';
import type { CellEntry } from '../../hooks/useSuiviGrid';
import { useLang } from '../../../../src/context/LanguageContext';
import { tx } from '../../../../lib/i18n';

interface Props {
    index: number;
    chaineId: string;
    activeContext: ChainActiveContext | undefined;
    hourKeys: string[];
    hours: string[];
    currentHourKey: string;
    chainTotal: number;
    getCell: (chaineId: string, hourKey: string) => CellEntry | null;
    selectedCell: { chaineId: string; hourKey: string } | null;
    onSelectCell: (chaineId: string, hourKey: string) => void;
}

const SIDEBAR_W = 192;
const HOUR_W = 72;
const ROW_H = 72;

function hexToRgba(hex: string, alpha: number): string {
    if (!hex.startsWith('#') || hex.length !== 7) return `rgba(100,116,139,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function TimelineRow({
    index, chaineId, activeContext, hourKeys, hours, currentHourKey,
    chainTotal, getCell, selectedCell, onSelectCell,
}: Props) {
    const { lang } = useLang();
    const primaryColor = activeContext?.primary?.color || '#94a3b8';
    const conflict = !!activeContext?.conflict;
    const activeModels = activeContext?.activeModels || [];

    return (
        <div
            className="flex border-b border-slate-50 dark:border-dk-border/30 hover:bg-slate-50/30 dark:hover:bg-dk-elevated/60 transition-colors animate-[planning-fade-in_240ms_ease-out]"
            style={{ animationDelay: `${Math.min(index * 30, 240)}ms` }}
        >
            {/* Sidebar */}
            <div
                className="shrink-0 sticky left-0 z-10 bg-white dark:bg-dk-surface border-r border-slate-100 dark:border-dk-border px-3 py-2 flex flex-col justify-center"
                style={{ width: SIDEBAR_W, minHeight: ROW_H }}
            >
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: primaryColor }} />
                    <span className="text-[12px] font-semibold text-slate-900 dark:text-dk-text truncate">{chaineId}</span>
                    {conflict && (
                        <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                            {activeModels.length}×
                        </span>
                    )}
                </div>
                {activeModels.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                        {activeModels.slice(0, 2).map(m => (
                            <div key={m.planningId} className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.color }} />
                                <span className="text-[10px] text-slate-600 dark:text-dk-text-soft truncate">{m.modelName}</span>
                            </div>
                        ))}
                        {activeModels.length > 2 && (
                            <span className="text-[9px] text-slate-400 dark:text-dk-muted">+{activeModels.length - 2} autres</span>
                        )}
                    </div>
                ) : (
                    <div className="mt-1 text-[10px] text-slate-400 dark:text-dk-muted">{tx(lang, {fr:"Aucun OF actif",ar:"لا يوجد أمر تصنيع نشط",en:"No active WO",es:"Ningún OF activo",pt:"Nenhum OF ativo",tr:"Aktif İE yok"})}</div>
                )}
                <div className="mt-1 text-[10px] text-slate-500 dark:text-dk-muted tabular-nums">
                    {tx(lang, {fr:"Total :",ar:"المجموع:",en:"Total:",es:"Total:",pt:"Total:",tr:"Toplam:"})} <span className="font-semibold text-slate-900 dark:text-dk-text">{chainTotal}</span>
                </div>
            </div>

            {/* Cells */}
            <div className="flex">
                {hourKeys.map(hk => {
                    const cell = getCell(chaineId, hk);
                    const isCurrent = hk === currentHourKey;
                    const isSelected = selectedCell?.chaineId === chaineId && selectedCell?.hourKey === hk;

                    // Determine the per-cell display style based on entries
                    let cellBg: React.CSSProperties = {};
                    let stripes: React.ReactNode = null;
                    if (cell && cell.perPlanning.size > 0) {
                        const entries = Array.from(cell.perPlanning.entries()).map(([pid, qty]) => {
                            const info = activeModels.find(m => m.planningId === pid);
                            return { pid, qty, color: info?.color || primaryColor };
                        });
                        if (entries.length === 1) {
                            cellBg = { background: hexToRgba(entries[0].color, 0.15), borderLeft: `3px solid ${entries[0].color}` };
                        } else {
                            // Stripes for multi-model
                            const stops = entries.map((e, i) => {
                                const pct = (i / entries.length) * 100;
                                const next = ((i + 1) / entries.length) * 100;
                                return `${hexToRgba(e.color, 0.2)} ${pct}% ${next}%`;
                            }).join(', ');
                            cellBg = { background: `linear-gradient(135deg, ${stops})` };
                        }
                    }

                    return (
                        <button
                            key={hk}
                            type="button"
                            onClick={() => onSelectCell(chaineId, hk)}
                            className={`shrink-0 relative border-r border-slate-100 dark:border-dk-border transition-all flex items-center justify-center group ${
                                isCurrent ? 'bg-red-50 dark:bg-red-900/30/30 dark:bg-red-900/20' : ''
                            } ${isSelected ? 'ring-2 ring-indigo-400 ring-inset z-10' : 'hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}
                            style={{ width: HOUR_W, height: ROW_H, ...cellBg }}
                        >
                            {cell && cell.total > 0 ? (
                                <div className="flex flex-col items-center">
                                    <span className="text-[16px] font-bold text-slate-900 dark:text-dk-text tabular-nums leading-none">
                                        {cell.total}
                                    </span>
                                    {cell.perPlanning.size > 1 && (
                                        <span className="mt-0.5 text-[9px] text-slate-500 dark:text-dk-muted tabular-nums">
                                            {cell.perPlanning.size} modèles
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <span className="text-[18px] text-slate-200 dark:text-dk-muted group-hover:text-slate-400 dark:group-hover:text-dk-text-soft transition-colors">＋</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
