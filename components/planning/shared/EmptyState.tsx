import React from 'react';

interface Props {
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
    secondary?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon: Icon, title, description, action, secondary }: Props) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-20 animate-[planning-fade-up_240ms_ease-out]">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-dk-surface flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-slate-400 dark:text-dk-muted" strokeWidth={1.5} />
            </div>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-dk-text mb-1">{title}</h3>
            {description && (
                <p className="text-[12px] text-slate-500 dark:text-dk-muted max-w-xs leading-relaxed">{description}</p>
            )}
            {(action || secondary) && (
                <div className="flex items-center gap-2 mt-5">
                    {action && (
                        <button
                            type="button"
                            onClick={action.onClick}
                            className="h-8 px-3 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-dk-accent dark:hover:bg-dk-accent/80 text-white dark:text-dk-accent-text text-[12px] font-medium transition-colors"
                        >
                            {action.label}
                        </button>
                    )}
                    {secondary && (
                        <button
                            type="button"
                            onClick={secondary.onClick}
                            className="h-8 px-3 rounded-md text-[12px] font-medium text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:hover:bg-dk-elevated/60 transition-colors"
                        >
                            {secondary.label}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
