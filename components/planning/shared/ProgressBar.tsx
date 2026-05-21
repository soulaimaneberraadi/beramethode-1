import React from 'react';

interface Props {
    value: number; // 0–100
    color?: string;
    height?: number;
    className?: string;
}

export default function ProgressBar({ value, color = '#2149C1', height = 4, className = '' }: Props) {
    const v = Math.max(0, Math.min(100, value));
    return (
        <div className={`relative w-full bg-slate-200/60 rounded-full overflow-hidden ${className}`} style={{ height }}>
            <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
                style={{ width: `${v}%`, background: color }}
            />
        </div>
    );
}
