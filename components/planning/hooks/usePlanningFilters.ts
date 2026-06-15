import { useMemo, useState } from 'react';
import type { ModelData, PlanningEvent } from '../../../types';
import { evClientName } from '../shared/eventAccessors';
import { toWorkStatus, type WorkStatus } from '../shared/statusConfig';

export interface PlanningFilters {
    clients: Set<string>;
    statuses: Set<WorkStatus>;
    chains: Set<string>;
    showCriticalOnly: boolean;
    searchText: string;
}

const EMPTY_FILTERS: PlanningFilters = {
    clients: new Set(),
    statuses: new Set(),
    chains: new Set(),
    showCriticalOnly: false,
    searchText: '',
};

export function usePlanningFilters(planningEvents: PlanningEvent[], models: ModelData[], crisisEvents?: PlanningEvent[]) {
    const [filters, setFilters] = useState<PlanningFilters>(EMPTY_FILTERS);
    const crisisSet = new Set(crisisEvents?.map(e => e.id) ?? []);

    const allClients = useMemo(() => {
        const set = new Set<string>();
        for (const ev of planningEvents) set.add(evClientName(ev, models));
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
    }, [planningEvents, models]);

    const allChains = useMemo(() => {
        const set = new Set<string>();
        for (const ev of planningEvents) if (ev.chaineId) set.add(ev.chaineId);
        return Array.from(set).sort((a, b) =>
            a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }));
    }, [planningEvents]);

    const filtered = useMemo(() => {
        let out = planningEvents;
        if (filters.clients.size > 0) {
            out = out.filter(ev => filters.clients.has(evClientName(ev, models)));
        }
        if (filters.chains.size > 0) {
            out = out.filter(ev => filters.chains.has(ev.chaineId));
        }
        if (filters.statuses.size > 0) {
            out = out.filter(ev => filters.statuses.has(toWorkStatus(ev.status)));
        }
        if (filters.showCriticalOnly) {
            out = out.filter(ev => crisisSet.has(ev.id));
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
    }, [planningEvents, filters, models, crisisSet]);

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

    const toggleChain = (c: string) =>
        setFilters(prev => {
            const next = new Set(prev.chains);
            next.has(c) ? next.delete(c) : next.add(c);
            return { ...prev, chains: next };
        });

    const toggleCriticalOnly = () =>
        setFilters(prev => ({ ...prev, showCriticalOnly: !prev.showCriticalOnly }));

    const resetFilters = () => setFilters(EMPTY_FILTERS);

    return {
        filters,
        filtered,
        allClients,
        allChains,
        toggleClient,
        toggleStatus,
        toggleChain,
        toggleCriticalOnly,
        setSearchText: (t: string) => setFilters(prev => ({ ...prev, searchText: t })),
        resetFilters,
        hasActiveFilters: filters.clients.size > 0 || filters.chains.size > 0 || filters.statuses.size > 0 || filters.showCriticalOnly || filters.searchText.length > 0,
        activeFilterCount:
            filters.clients.size +
            filters.chains.size +
            filters.statuses.size +
            (filters.showCriticalOnly ? 1 : 0) +
            (filters.searchText.trim().length > 0 ? 1 : 0),
    };
}
