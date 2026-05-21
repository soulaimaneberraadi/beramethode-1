import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Edit2, Split, Copy, Trash2, Eye } from 'lucide-react';

interface Props {
    x: number;
    y: number;
    onClose: () => void;
    onView: () => void;
    onEdit: () => void;
    onSplit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}

const ITEMS: { id: string; label: string; Icon: typeof Eye; danger?: boolean }[] = [
    { id: 'view', label: 'Voir les détails', Icon: Eye },
    { id: 'edit', label: 'Modifier', Icon: Edit2 },
    { id: 'split', label: 'Fractionner', Icon: Split },
    { id: 'duplicate', label: 'Dupliquer', Icon: Copy },
    { id: 'delete', label: 'Supprimer', Icon: Trash2, danger: true },
];

export default function ContextMenu({ x, y, onClose, onView, onEdit, onSplit, onDuplicate, onDelete }: Props) {
    const ref = useRef<HTMLDivElement>(null);

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

    const handlers: Record<string, () => void> = {
        view: onView, edit: onEdit, split: onSplit, duplicate: onDuplicate, delete: onDelete,
    };

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[100] min-w-[180px] bg-white rounded-xl shadow-xl shadow-slate-900/10 ring-1 ring-slate-200 py-1 animate-[fadeIn_120ms_ease]"
            style={{ left: x, top: y }}
        >
            {ITEMS.map(({ id, label, Icon, danger }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => { handlers[id](); onClose(); }}
                    className={`w-full px-3 py-1.5 text-left text-[11px] flex items-center gap-2 transition-colors ${
                        danger
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-slate-700 hover:bg-slate-50'
                    }`}
                >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                </button>
            ))}
        </div>,
        document.body
    );
}
