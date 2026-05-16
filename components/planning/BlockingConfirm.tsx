import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface BlockingConfirmProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning';
    onConfirm: () => void;
    onCancel: () => void;
}

export default function BlockingConfirm({
    open,
    title,
    message,
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
    variant = 'warning',
    onConfirm,
    onCancel,
}: BlockingConfirmProps) {
    if (!open) return null;
    const accent = variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600';
    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                        <div className={`rounded-xl p-2 ${variant === 'danger' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <h3 className="font-black text-slate-900 text-sm leading-tight">{title}</h3>
                    </div>
                    <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fermer">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <p className="text-sm text-slate-600 mb-5 whitespace-pre-wrap break-words">{message}</p>
                <div className="flex gap-2">
                    <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                        {cancelLabel}
                    </button>
                    <button type="button" onClick={onConfirm} className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white shadow ${accent}`}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
