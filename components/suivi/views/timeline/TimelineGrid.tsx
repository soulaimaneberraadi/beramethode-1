import React, { useMemo } from 'react';
import type { AppSettings, ModelData, PlanningEvent, SuiviData } from '../../../../types';
import { deriveHourGrid } from '../../shared/hours';
import { useSuiviActiveContext, type ChainActiveContext } from '../../hooks/useSuiviActiveContext';
import { useSuiviGrid } from '../../hooks/useSuiviGrid';
import { TimelineHeader } from './TimelineHeader';
import { TimelineRow } from './TimelineRow';
import { useLang } from '../../../../src/context/LanguageContext';
import { tx } from '../../../../lib/i18n';

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
    const { lang } = useLang();
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
                        {tx(lang, {fr:"Aucune chaîne configurée. Ajoutez une chaîne dans Configuration.",ar:"لا توجد خطوط إنتاج مكونة. أضف خط إنتاج في الإعدادات.",en:"No lines configured. Add a line in Configuration.",es:"Ninguna línea configurada. Añada una línea en Configuración.",pt:"Nenhuma linha configurada. Adicione uma linha na Configuração.",tr:"Yapılandırılmış hat yok. Yapılandırmaya bir hat ekleyin."})}
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
