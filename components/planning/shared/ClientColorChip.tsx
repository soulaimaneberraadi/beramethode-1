import React from 'react';
import { getClientColor } from './clientColors';

interface Props {
    client: string;
    size?: 'xs' | 'sm' | 'md';
    showName?: boolean;
}

export default function ClientColorChip({ client, size = 'sm', showName = true }: Props) {
    const color = getClientColor(client);
    const dim = size === 'xs' ? 6 : size === 'sm' ? 8 : 10;
    const font = size === 'xs' ? 'text-[9px]' : size === 'sm' ? 'text-[10px]' : 'text-xs';
    return (
        <span className={`inline-flex items-center gap-1.5 ${font} font-medium text-slate-700`}>
            <span
                className="rounded-full shrink-0"
                style={{ width: dim, height: dim, background: color }}
            />
            {showName && <span className="truncate">{client}</span>}
        </span>
    );
}
