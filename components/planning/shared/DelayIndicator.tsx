import React from 'react';
import { DELAY_META, type DelayState } from './statusConfig';

interface Props {
    state: DelayState;
    size?: 'xs' | 'sm';
}

export default function DelayIndicator({ state, size = 'xs' }: Props) {
    const meta = DELAY_META[state];
    const dotSize = size === 'xs' ? 'w-1.5 h-1.5' : 'w-2 h-2';
    return (
        <span
            className={`inline-flex items-center gap-1 ${meta.text} dark:text-slate-300`}
            title={meta.label}
        >
            <span className={`${dotSize} rounded-full ${meta.dot} ${state === 'LATE' ? 'animate-pulse' : ''}`} />
        </span>
    );
}
