import React, { useState } from 'react';
import { ChevronDown, ArrowRight, AlertCircle, AlertTriangle } from 'lucide-react';
import type { Issue } from '../hooks/usePlanningValidation';
import type { ModelData, PlanningEvent } from '../../../types';
import { evClientName, evModelName } from '../shared/eventAccessors';

interface Props {
    issues: Issue[];
    events: PlanningEvent[];
    models: ModelData[];
    onJumpToEvent: (id: string) => void;
}

export default function IssuesPanel({ issues, events, models, onJumpToEvent }: Props) {
    const [expanded, setExpanded] = useState(false);
    if (issues.length === 0) return null;

    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;

    return (
        <div className="shrink-0 border-b border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface">
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full h-9 px-3 sm:px-6 flex items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-dk-elevated/60 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {errors > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-700 dark:text-dk-text-soft">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="font-medium tabular-nums">{errors}</span>
                            <span className="text-slate-500 dark:text-dk-muted">erreur{errors > 1 ? 's' : ''}</span>
                        </span>
                    )}
                    {warnings > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-700 dark:text-dk-text-soft">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span className="font-medium tabular-nums">{warnings}</span>
                            <span className="text-slate-500 dark:text-dk-muted">avertissement{warnings > 1 ? 's' : ''}</span>
                        </span>
                    )}
                </div>
                <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 dark:text-dk-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                    strokeWidth={2}
                />
            </button>

            {expanded && (
                <div className="max-h-[260px] overflow-y-auto border-t border-slate-100 dark:border-dk-border">
                    {issues.map(issue => {
                        const isError = issue.severity === 'error';
                        const ev = events.find(e => e.id === issue.eventId);
                        const ctx = ev ? `${evClientName(ev, models)} · ${evModelName(ev, models)}` : '';
                        return (
                            <button
                                key={issue.id}
                                type="button"
                                onClick={() => onJumpToEvent(issue.eventId)}
                                className="group w-full px-3 sm:px-6 py-3 text-left hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors border-b border-slate-50 dark:border-dk-border/30 last:border-0 flex items-start gap-3"
                            >
                                {isError ? (
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" strokeWidth={2} />
                                ) : (
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" strokeWidth={2} />
                                )}
                                <div className="flex-1 min-w-0 space-y-0.5">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[12px] font-medium text-slate-900 dark:text-dk-text">{issue.title}</span>
                                        {ctx && <span className="text-[11px] text-slate-400 dark:text-dk-muted truncate">{ctx}</span>}
                                    </div>
                                    <p className="text-[11px] text-slate-600 dark:text-dk-text-soft leading-snug">{issue.detail}</p>
                                    {issue.suggestion && (
                                        <p className="text-[11px] text-slate-400 dark:text-dk-muted italic">→ {issue.suggestion}</p>
                                    )}
                                </div>
                                <ArrowRight className="w-3 h-3 text-slate-300 dark:text-dk-muted shrink-0 mt-1 group-hover:text-slate-500 dark:group-hover:text-dk-text-soft transition-colors" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
