import React from 'react';
import { useLang } from '../../../../src/context/LanguageContext';
import { tx } from '../../../../lib/i18n';

interface Props {
    hours: string[];
    hourKeys: string[];
    currentHourKey: string;
    hourTotals: Map<string, number>;
}

const SIDEBAR_W = 192;
const HOUR_W = 72;

export function TimelineHeader({ hours, hourKeys, currentHourKey, hourTotals }: Props) {
    const { lang } = useLang();
    return (
        <div className="flex sticky top-0 z-30 bg-white dark:bg-dk-surface border-b border-slate-100 dark:border-dk-border">
            <div className="shrink-0 sticky left-0 z-20 bg-white dark:bg-dk-surface border-r border-slate-100 dark:border-dk-border" style={{ width: SIDEBAR_W }}>
                <div className="h-[56px] flex items-end px-4 pb-2">
                    <span className="text-[10px] font-medium text-slate-400 dark:text-dk-muted uppercase tracking-wider">
                        Chaînes · Heures
                    </span>
                </div>
            </div>
            <div className="flex">
                {hourKeys.map((k, i) => {
                    const isCurrent = k === currentHourKey;
                    const total = hourTotals.get(k) || 0;
                    return (
                        <div
                            key={k}
                            className={`shrink-0 px-1 pb-1.5 pt-2 border-r border-slate-100 dark:border-dk-border flex flex-col items-center ${
                                isCurrent ? 'bg-red-50/60' : ''
                            }`}
                            style={{ width: HOUR_W }}
                        >
                            <span className={`text-[11px] font-semibold tabular-nums ${isCurrent ? 'text-red-600' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                                {hours[i]}
                            </span>
                            <span className={`text-[10px] tabular-nums mt-0.5 ${total > 0 ? 'text-slate-500 dark:text-dk-muted' : 'text-slate-300 dark:text-dk-muted'}`}>
                                {total > 0 ? total : '—'}
                            </span>
                            {isCurrent && (
                                <span className="mt-1 inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-red-600">
                                    <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                                    {tx(lang, {fr:"Maintenant",ar:"الآن",en:"Now",es:"Ahora",pt:"Agora",tr:"Şimdi"})}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
