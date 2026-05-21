import { useMemo, useState } from 'react';
import type { ModelData, PlanningEvent } from '../../../types';
import { evClientName } from '../shared/eventAccessors';
import { toWorkStatus, type WorkStatus } from '../shared/statusConfig';

export interface PlanningFilters {
    clients: Set<string>;
    statuses: Set<WorkStatus>;
    showLate: boolean;
    searchText: string;
}

const EMPTY_FILTERS: PlanningFilters = {
    clients: new Set(),
    statuses: new Set(),
    showLate: false,
    searchText: '',
};

export function usePlanningFilters(planningEvents: PlanningEvent[], models: ModelData[]) {
    const [filters, setFilters] = useState<PlanningFilters>(EMPTY_FILTERS);

    const allClients = useMemo(() => {
        const set = new Set<string>();
        for (const ev of planningEvents) set.add(evClientName(ev, models));
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
    }, [planningEvents, models]);

    const filtered = useMemo(() => {
        let out = planningEvents;
        if (filters.clients.size > 0) {
            out = out.filter(ev => filters.clients.has(evClientName(ev, models)));
        }
        if (filters.statuses.size > 0) {
            out = out.filter(ev => filters.statuses.has(toWorkStatus(ev.status)));
        }
        if (filters.searchText.trim()) {
            const q = filters.searchText.trim().toLowerCase();
            out = out.filter(ev => {
                const client = evClientName(ev, models).toLowerCase();
                const name = (ev.modelName || '').toLowerCase();
                return client.includes(q) || name.includes(q);
            });
        }
        return out;
    }, [planningEvents, filters, models]);

    const toggleClient = (c: string) =>
        setFilters(prev => {
            const next = new Set(prev.clients);
            next.has(c) ? next.delete(c) : next.add(c);
            return { ...prev, clients: next };
        });

    const toggleStatus = (s: WorkStatus) =>
        setFilters(prev => {
            const next = new Set(prev.statuses);
            next.has(s) ? next.delete(s) : next.add(s);
            return { ...prev, statuses: next };
        });

    const resetFilters = () => setFilters(EMPTY_FILTERS);

    return {
        filters,
        filtered,
        allClients,
        toggleClient,
        toggleStatus,
        setSearchText: (t: string) => setFilters(prev => ({ ...prev, searchText: t })),
        resetFilters,
        hasActiveFilters: filters.clients.size > 0 || filters.statuses.size > 0 || filters.searchText.length > 0,
    };
}
