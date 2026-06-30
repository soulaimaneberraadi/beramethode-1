import React from 'react';
import type { AppSettings, PlanningEvent } from '../../types';
import { planningLocalDateKey } from '../../utils/planning';
import { dayLoadRatio, getChainDailyCapacity } from '../../utils/capacity';
import { CAPACITY_RIBBON_SEGMENT_CLASS } from './planningDesignTokens';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';

type RibbonSegmentClass = (typeof CAPACITY_RIBBON_SEGMENT_CLASS)[keyof typeof CAPACITY_RIBBON_SEGMENT_CLASS];

export interface CapacityRibbonProps {
    timelineDates: Date[];
    chainId: string;
    events: PlanningEvent[];
    settings: AppSettings;
    dayWidth: number;
}

/** Ruban charge — palette §3.1 : charge faible emerald-700, 80–100 % amber-500, dépassement red-500. */
export default function CapacityRibbon({ timelineDates, chainId, events, settings, dayWidth }: CapacityRibbonProps) {
    const { lang } = useLang();
    const cap = getChainDailyCapacity(settings.chainCapacityPerDay, chainId, 1000);
    return (
        <div className="flex w-full shrink-0 border-b border-slate-200 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg/80 dark:bg-dk-bg/80">
            {timelineDates.map(date => {
                const dk = planningLocalDateKey(date);
                const r = dayLoadRatio(dk, events, chainId, cap);
                let bg: RibbonSegmentClass = CAPACITY_RIBBON_SEGMENT_CLASS.under80;
                if (r >= 1) bg = CAPACITY_RIBBON_SEGMENT_CLASS.red;
                else if (r >= 0.8) bg = CAPACITY_RIBBON_SEGMENT_CLASS.amber;
                else if (r >= 0.5) bg = CAPACITY_RIBBON_SEGMENT_CLASS.underHalf;
                return (
                    <div
                        key={`rib-${chainId}-${dk}`}
                        style={{ width: dayWidth, minWidth: dayWidth }}
                        className="shrink-0 h-full min-h-[5px] border-r border-slate-200 dark:border-dk-border/40"
                        title={tx(lang, { fr: `Charge ${chainId} — ${dk} : ${Math.round(r * 100)}% (${cap} pcs/j)`, ar: `الحمل ${chainId} — ${dk} : ${Math.round(r * 100)}% (${cap} قطعة/ي)`, en: `Load ${chainId} — ${dk} : ${Math.round(r * 100)}% (${cap} pcs/d)`, es: `Carga ${chainId} — ${dk} : ${Math.round(r * 100)}% (${cap} pzas/d)`, pt: `Carga ${chainId} — ${dk} : ${Math.round(r * 100)}% (${cap} pçs/d)`, tr: `Yük ${chainId} — ${dk} : %${Math.round(r * 100)} (${cap} adet/g)` })}
                    >
                        <div className={`h-[5px] w-full ${bg}`} />
                    </div>
                );
            })}
        </div>
    );
}
