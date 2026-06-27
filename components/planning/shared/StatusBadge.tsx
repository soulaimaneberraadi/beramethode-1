import React from 'react';
import { STATUS_META, type WorkStatus, toWorkStatus } from './statusConfig';
import type { PlanningStatus } from '../../../types';
import { useLang } from '../../../src/context/LanguageContext';
import { tx } from '../../../lib/i18n';

interface Props {
    status: PlanningStatus | WorkStatus | string | undefined;
    size?: 'xs' | 'sm';
    showLabel?: boolean;
}

export default function StatusBadge({ status, size = 'sm', showLabel = true }: Props) {
    const { lang } = useLang();
    if (status === 'EXTERNAL_PROCESS') {
        const dotSize = size === 'xs' ? 'w-1.5 h-1.5' : 'w-2 h-2';
        const fontSize = size === 'xs' ? 'text-[9px]' : 'text-[10px]';
        return (
            <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium bg-amber-50 text-amber-700 border border-amber-200/50 ${fontSize}`}
                title={tx(lang, {fr:"Proc. Externe",ar:"إجراء خارجي",en:"Ext. Process",es:"Proc. Externo",pt:"Proc. Externo",tr:"Harici Süreç"})}
            >
                <span className={`${dotSize} rounded-full bg-amber-500`} />
                {showLabel && <span>{tx(lang, {fr:"Proc. Externe",ar:"إجراء خارجي",en:"Ext. Process",es:"Proc. Externo",pt:"Proc. Externo",tr:"Harici Süreç"})}</span>}
            </span>
        );
    }
    const ws = toWorkStatus(status);
    const meta = STATUS_META[ws];
    const dotSize = size === 'xs' ? 'w-1.5 h-1.5' : 'w-2 h-2';
    const fontSize = size === 'xs' ? 'text-[9px]' : 'text-[10px]';
    return (
        <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium ${meta.softBg} ${meta.text} ${fontSize}`}
            title={meta.label}
        >
            <span className={`${dotSize} rounded-full ${meta.dot}`} />
            {showLabel && <span>{meta.label}</span>}
        </span>
    );
}
