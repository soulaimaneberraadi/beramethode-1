import React from 'react';
import type { AppSettings, PlanningEvent } from '../../types';
import { planningLocalDateKey } from '../../utils/planning';
import { dayLoadRatio, getChainDailyCapacity } from '../../utils/capacity';
import { CAPACITY_RIBBON_SEGMENT_CLASS } from './planningDesignTokens';

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
    const cap = getChainDailyCapacity(settings.chainCapacityPerDay, chainId, 1000);
    return (
        <div className="flex w-full shrink-0 border-b border-slate-200/60 bg-slate-50/80">
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
                        className="shrink-0 h-full min-h-[5px] border-r border-slate-200/40"
                        title={`Charge ${chainId} — ${dk} : ${Math.round(r * 100)} % (${cap} pcs/j)`}
                    >
                        <div className={`h-[5px] w-full ${bg}`} />
                    </div>
                );
            })}
        </div>
    );
}
