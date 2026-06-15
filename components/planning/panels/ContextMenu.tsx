import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Edit2, Split, Copy, Trash2, Eye, Pause, Play } from 'lucide-react';
import { useIsMobile } from '../shared/useIsMobile';

interface Props {
    x: number;
    y: number;
    onClose: () => void;
    onView: () => void;
    onEdit: () => void;
    onSplit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    isPaused?: boolean;
    onTogglePause?: () => void;
}

export default function ContextMenu({
    x, y, onClose, onView, onEdit, onSplit, onDuplicate, onDelete, isPaused, onTogglePause
}: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const isMobile = useIsMobile();

    useEffect(() => {
        const onOutside = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) onClose();
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', onOutside);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onOutside);
            document.removeEventListener('keydown', onEsc);
        };
    }, [onClose]);

    const items = [
        { id: 'view', label: 'Voir les détails', Icon: Eye },
        { id: 'edit', label: 'Modifier', Icon: Edit2 },
        { id: 'split', label: 'Fractionner', Icon: Split },
        { id: 'duplicate', label: 'Dupliquer', Icon: Copy },
        ...(onTogglePause ? [{
            id: 'togglePause',
            label: isPaused ? 'Reprendre (Relancer)' : 'Geler / Pause (Freeze)',
            Icon: isPaused ? Play : Pause
        }] : []),
        { id: 'delete', label: 'Supprimer', Icon: Trash2, danger: true },
    ];

    const handlers: Record<string, () => void> = {
        view: onView,
        edit: onEdit,
        split: onSplit,
        duplicate: onDuplicate,
        delete: onDelete,
        togglePause: onTogglePause || (() => {}),
    };

    // Desktop : positionne au curseur en gardant le menu dans le viewport.
    // Mobile : feuille en bas (bottom sheet) pleine largeur.
    const MENU_W = 200;
    const MENU_H = items.length * 40 + 8;
    const clampedLeft = typeof window !== 'undefined' ? Math.min(x, window.innerWidth - MENU_W - 8) : x;
    const clampedTop = typeof window !== 'undefined' ? Math.min(y, window.innerHeight - MENU_H - 8) : y;

    const menu = (
        <div
            ref={ref}
            className={
                isMobile
                    ? 'fixed inset-x-0 bottom-0 z-[100] bg-white rounded-t-2xl shadow-xl shadow-slate-900/20 ring-1 ring-slate-200 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] animate-[fadeIn_120ms_ease]'
                    : 'fixed z-[100] min-w-[180px] bg-white rounded-xl shadow-xl shadow-slate-900/10 ring-1 ring-slate-200 py-1 animate-[fadeIn_120ms_ease]'
            }
            style={isMobile ? undefined : { left: Math.max(8, clampedLeft), top: Math.max(8, clampedTop) }}
        >
            {isMobile && <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-slate-300" />}
            {items.map(({ id, label, Icon, danger }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => { handlers[id](); onClose(); }}
                    className={`w-full text-left flex items-center gap-2 transition-colors ${
                        isMobile ? 'px-5 py-3 text-sm' : 'px-3 py-1.5 text-[11px]'
                    } ${
                        danger
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-slate-700 hover:bg-slate-50'
                    }`}
                >
                    <Icon className={isMobile ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                    {label}
                </button>
            ))}
        </div>
    );

    return createPortal(
        isMobile
            ? <>
                <div className="fixed inset-0 z-[99] bg-black/30 animate-[fadeIn_120ms_ease]" onClick={onClose} />
                {menu}
              </>
            : menu,
        document.body
    );
}
