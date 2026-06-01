import React, { useMemo } from 'react';
import type { AppSettings, ModelData, PlanningEvent, SuiviData } from '../../../../types';
import { deriveHourGrid } from '../../shared/hours';
import { useSuiviActiveContext, type ChainActiveContext } from '../../hooks/useSuiviActiveContext';
import { useSuiviGrid } from '../../hooks/useSuiviGrid';
import { TimelineHeader } from './TimelineHeader';
import { TimelineRow } from './TimelineRow';

interface Props {
    date: string;
    settings: AppSettings;
    chainIds: string[];
    planningEvents: PlanningEvent[];
    models: ModelData[];
    suivis: SuiviData[];
    currentHourKey: string;
    selectedCell: { chaineId: string; hourKey: string } | null;
    onSelectCell: (chaineId: string, hourKey: string) => void;
}

export default function TimelineGrid({
    date, settings, chainIds, planningEvents, models, suivis,
    currentHourKey, selectedCell, onSelectCell,
}: Props) {
    const { hours, keys } = useMemo(() => deriveHourGrid(settings), [settings]);
    const active = useSuiviActiveContext({ date, planningEvents, models });
    const grid = useSuiviGrid({ date, chainIds, hourKeys: keys, suivis, planningEvents });

    return (
        <div className="flex-1 overflow-auto bg-white">
            <div className="min-w-fit">
                <TimelineHeader
                    hours={hours}
                    hourKeys={keys}
                    currentHourKey={currentHourKey}
                    hourTotals={grid.hourTotals}
                />

                {chainIds.length === 0 ? (
                    <div className="px-6 py-20 text-center text-[12px] text-slate-400">
                        Aucune chaîne configurée. Ajoutez une chaîne dans Configuration.
                    </div>
                ) : (
                    chainIds.map((cid, idx) => {
                        const ctx = active.get(cid);
                        return (
                            <TimelineRow
                                key={cid}
                                index={idx}
                                chaineId={cid}
                                activeContext={ctx}
                                hourKeys={keys}
                                hours={hours}
                                currentHourKey={currentHourKey}
                                chainTotal={grid.chainTotals.get(cid) || 0}
                                getCell={grid.get}
                                selectedCell={selectedCell}
                                onSelectCell={onSelectCell}
                            />
                        );
                    })
                )}
            </div>
        </div>
    );
}
