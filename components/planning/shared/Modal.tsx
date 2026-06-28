import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useIsMobile } from './useIsMobile';
import { useLang } from '../../../src/context/LanguageContext';
import { tx } from '../../../lib/i18n';

interface Props {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLS = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-xl',
} as const;

export default function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: Props) {
    const { lang } = useLang();
    const isMobile = useIsMobile();
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) return null;

    const outerCls = isMobile
        ? 'fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 dark:bg-dk-bg/50 backdrop-blur-[3px] animate-[fadeIn_140ms_ease-out]'
        : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[3px] animate-[fadeIn_140ms_ease-out]';

    const innerCls = isMobile
        ? 'relative w-full max-h-[92vh] bg-white dark:bg-dk-surface rounded-t-2xl shadow-[0_-12px_40px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/60 dark:ring-dk-border overflow-hidden flex flex-col'
        : `relative w-full ${SIZE_CLS[size]} bg-white dark:bg-dk-surface rounded-xl shadow-[0_12px_40px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/60 dark:ring-dk-border overflow-hidden flex flex-col max-h-[92vh]`;

    return createPortal(
        <div className={outerCls} onClick={onClose}>
            <div className={innerCls} onClick={(e) => e.stopPropagation()}>
                {isMobile && (
                    <div className="pt-2 pb-1 flex items-center justify-center shrink-0">
                        <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-dk-muted" />
                    </div>
                )}
                <header className={`${isMobile ? 'px-5 pt-2 pb-3' : 'px-6 pt-5 pb-4'} flex items-start justify-between gap-4 shrink-0`}>
                    <div className="min-w-0">
                        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-dk-text tracking-tight truncate">
                            {title}
                        </h2>
                        {subtitle && (
                            <p className="text-[12px] text-slate-500 dark:text-dk-muted mt-0.5 truncate">
                                {subtitle}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-md text-slate-400 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-elevated/60 transition-colors"
                        aria-label={tx(lang, {fr:"Fermer",ar:"إغلاق",en:"Close",es:"Cerrar",pt:"Fechar",tr:"Kapat"})}
                    >
                        <X className="w-4 h-4" strokeWidth={2} />
                    </button>
                </header>
                <div className={`${isMobile ? 'px-5 pb-4' : 'px-6 pb-5'} overflow-y-auto flex-1 min-h-0`}>{children}</div>
                {footer && (
                    <footer className={`${isMobile ? 'px-5 py-3' : 'px-6 py-3'} border-t border-slate-100 dark:border-dk-border bg-slate-50/40 dark:bg-dk-bg flex items-center justify-end gap-2 shrink-0`}>
                        {footer}
                    </footer>
                )}
            </div>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: scale(0.98) translateY(4px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>
        </div>,
        document.body
    );
}
