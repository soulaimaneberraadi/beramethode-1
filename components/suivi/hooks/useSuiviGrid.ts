import { useMemo } from 'react';
import type { ModelData, PlanningEvent, SuiviData } from '../../../types';
import type { ChainActiveContext } from './useSuiviActiveContext';

export interface CellEntry {
    chaineId: string;
    hourKey: string;
    /** Per planningId quantity entered at this hour. */
    perPlanning: Map<string, number>;
    /** Sum of all planning entries at this hour. */
    total: number;
    /** Suivi row IDs touched by this cell. */
    suiviIds: string[];
}

interface Args {
    date: string;
    chainIds: string[];
    hourKeys: string[];
    suivis: SuiviData[];
    planningEvents: PlanningEvent[];
}

/**
 * Build a grid: chainId × hourKey → cell aggregate.
 * Walks suivis for the date, attributes hours to their chain via planningEvent.chaineId.
 */
export function useSuiviGrid({ date, chainIds, hourKeys, suivis, planningEvents }: Args) {
    return useMemo(() => {
        const grid = new Map<string, CellEntry>();
        const cellKey = (c: string, h: string) => `${c}__${h}`;

        const planById = new Map(planningEvents.map(p => [p.id, p]));

        const dayRows = suivis.filter(s => s.date === date);
        for (const s of dayRows) {
            const plan = planById.get(s.planningId);
            const chaineId = plan?.chaineId || s.chaineId;
            if (!chaineId) continue;
            for (const hk of hourKeys) {
                const v = s.sorties?.[hk];
                if (v == null || Number.isNaN(Number(v))) continue;
                const k = cellKey(chaineId, hk);
                let cell = grid.get(k);
                if (!cell) {
                    cell = { chaineId, hourKey: hk, perPlanning: new Map(), total: 0, suiviIds: [] };
                    grid.set(k, cell);
                }
                cell.perPlanning.set(s.planningId, (cell.perPlanning.get(s.planningId) || 0) + Number(v));
                cell.total += Number(v);
                if (!cell.suiviIds.includes(s.id)) cell.suiviIds.push(s.id);
            }
        }

        const get = (chaineId: string, hourKey: string): CellEntry | null => grid.get(cellKey(chaineId, hourKey)) || null;

        // Totals per chain (sum over all hours)
        const chainTotals = new Map<string, number>();
        for (const cid of chainIds) {
            let tot = 0;
            for (const hk of hourKeys) {
                const c = grid.get(cellKey(cid, hk));
                if (c) tot += c.total;
            }
            chainTotals.set(cid, tot);
        }

        // Totals per hour (sum over all chains)
        const hourTotals = new Map<string, number>();
        for (const hk of hourKeys) {
            let tot = 0;
            for (const cid of chainIds) {
                const c = grid.get(cellKey(cid, hk));
                if (c) tot += c.total;
            }
            hourTotals.set(hk, tot);
        }

        const dayTotal = Array.from(hourTotals.values()).reduce((a, b) => a + b, 0);

        return { get, chainTotals, hourTotals, dayTotal };
    }, [date, chainIds, hourKeys, suivis, planningEvents]);
}
