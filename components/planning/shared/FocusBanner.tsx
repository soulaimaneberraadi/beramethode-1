import React from 'react';
import { Eye, X } from 'lucide-react';

interface Props {
    visible: boolean;
    label: string;
    onExit: () => void;
}

export default function FocusBanner({ visible, label, onExit }: Props) {
    if (!visible) return null;
    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[55] bg-slate-900 text-white rounded-full pl-3 pr-1.5 py-1 flex items-center gap-2 shadow-[0_8px_24px_rgba(15,23,42,0.20)] animate-[planning-fade-up_180ms_ease-out]">
            <Eye className="w-3 h-3 text-slate-400" strokeWidth={2} />
            <span className="text-[11px] font-medium">Focus · {label}</span>
            <button
                type="button"
                onClick={onExit}
                className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                title="Sortir du focus (Esc)"
            >
                <X className="w-3 h-3" strokeWidth={2} />
            </button>
        </div>
    );
}
