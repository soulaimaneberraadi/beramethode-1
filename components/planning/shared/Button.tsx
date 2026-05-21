import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    icon?: React.ReactNode;
}

const VARIANT_CLS: Record<Variant, string> = {
    primary:
        'bg-slate-900 text-white hover:bg-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.06)]',
    secondary:
        'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50',
    ghost:
        'text-slate-500 hover:text-slate-900 hover:bg-slate-100',
    danger:
        'text-red-600 hover:text-red-700 hover:bg-red-50',
};

const SIZE_CLS: Record<Size, string> = {
    sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-md',
    md: 'h-8 px-3 text-[13px] gap-2 rounded-md',
};

export default function Button({
    variant = 'secondary',
    size = 'sm',
    icon,
    children,
    className = '',
    ...rest
}: Props) {
    return (
        <button
            {...rest}
            className={`inline-flex items-center font-medium transition-colors duration-150 ${VARIANT_CLS[variant]} ${SIZE_CLS[size]} ${className}`}
        >
            {icon && <span className="shrink-0">{icon}</span>}
            {children}
        </button>
    );
}
