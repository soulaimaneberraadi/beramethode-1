import React from 'react';

interface Props {
    color: string; // hex or tailwind class via bg-*
    size?: number;
    pulsing?: boolean;
    className?: string;
}

/** Petit point coloré minimaliste — taille 6px par défaut. */
export default function StatDot({ color, size = 6, pulsing, className = '' }: Props) {
    const isHex = color.startsWith('#');
    return (
        <span
            className={`inline-block shrink-0 rounded-full ${isHex ? '' : color} ${pulsing ? 'animate-pulse' : ''} ${className}`}
            style={{
                width: size,
                height: size,
                ...(isHex ? { background: color } : {}),
            }}
        />
    );
}
