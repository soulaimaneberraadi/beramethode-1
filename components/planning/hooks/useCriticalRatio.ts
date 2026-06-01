import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { AppSettings, ModelData, PlanningEvent } from '../../../types';
import type { PlanningChain } from './usePlanningChains';
import { computeBatchCR } from '../../../utils/criticalRatio';
import type { PlanningEventWithCR } from '../../../utils/criticalRatio';
export type { PlanningEventWithCR };

interface UseCriticalRatioArgs {
    planningEvents: PlanningEvent[];
    models: ModelData[];
    settings: AppSettings;
    chains: PlanningChain[];
}

export interface ActivityRateRecord {
    id: string;
    chain_id: string;
    rate: number;
    source: string;
    sample_date?: string;
    total_observations?: number;
    active_observations?: number;
}

export interface LearningCurveProfileRecord {
    id: string;
    name: string;
    day1: number;
    day2: number;
    day3: number;
    day4: number;
    day5_plus: number;
}

export function useCriticalRatio({
    planningEvents,
    models,
    settings,
    chains,
}: UseCriticalRatioArgs) {
    const [activityRates, setActivityRates] = useState<ActivityRateRecord[]>([]);
    const [learningCurves, setLearningCurves] = useState<LearningCurveProfileRecord[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch constraints data from backend
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [arRes, lcRes] = await Promise.all([
                fetch('/api/scheduling/activity-rates', { credentials: 'include' }),
                fetch('/api/scheduling/learning-curves', { credentials: 'include' }),
            ]);

            if (arRes.ok && lcRes.ok) {
                const arData = await arRes.json();
                const lcData = await lcRes.json();
                setActivityRates(arData);
                setLearningCurves(lcData);
            } else {
                setError('Failed to fetch scheduling constraints.');
            }
        } catch (e: any) {
            setError(e.message || 'An error occurred while fetching scheduling data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Build mapping records for CR engine
    const chainOperatorsMap = useMemo(() => {
        const map: Record<string, number> = {};
        // Add defaults for all chains in settings
        const count = settings.chainsCount || 12;
        for (let i = 1; i <= count; i++) {
            const id = `CHAINE ${i}`;
            map[id] = settings.chainOperators?.[id] ?? 30;
        }
        return map;
    }, [settings.chainOperators, settings.chainsCount]);

    const chainEfficiencyMap = useMemo(() => {
        const map: Record<string, number> = {};
        for (const chain of chains) {
            map[chain.id] = chain.efficiency ?? 0.85;
        }
        return map;
    }, [chains]);

    const chainActivityRatesMap = useMemo(() => {
        const map: Record<string, number> = {};
        // Defaults from settings or fallback
        const count = settings.chainsCount || 12;
        for (let i = 1; i <= count; i++) {
            const id = `CHAINE ${i}`;
            map[id] = settings.chainActivityRate?.[id] ?? 0.85;
        }
        // Override with DB values
        for (const record of activityRates) {
            map[record.chain_id] = record.rate;
        }
        return map;
    }, [activityRates, settings.chainActivityRate, settings.chainsCount]);

    // Compute CR for all events
    const eventsWithCR = useMemo<PlanningEventWithCR[]>(() => {
        if (planningEvents.length === 0 || models.length === 0) return [];
        return computeBatchCR(
            planningEvents,
            models,
            chainOperatorsMap,
            chainEfficiencyMap,
            chainActivityRatesMap,
            settings
        );
    }, [
        planningEvents,
        models,
        chainOperatorsMap,
        chainEfficiencyMap,
        chainActivityRatesMap,
        settings,
    ]);

    // Filter events that are critical (CR < 0.8) or at risk (CR < 1.0) and not finished or subcontracted
    const crisisEvents = useMemo(() => {
        return eventsWithCR.filter(
            ev => ev.status !== 'DONE' && !ev.isSubcontracted && ev.crResult && ev.crResult.cr < 1.0
        );
    }, [eventsWithCR]);

    // Sync calculated CR values back to backend
    const syncCR = useCallback(async (
        updates: Array<{ id: string; crValue: number; crStatus: string; accumulatedDeficit: number }>
    ) => {
        try {
            const res = await fetch('/api/scheduling/update-cr', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates }),
            });
            if (!res.ok) {
                console.error('Failed to sync CR values to the database.');
            }
        } catch (err) {
            console.error('Error syncing CR values:', err);
        }
    }, []);

    // Auto-sync CR values to database when they change
    const lastSyncRef = useRef<string>('');
    useEffect(() => {
        if (eventsWithCR.length === 0) return;

        const updates = eventsWithCR.map(ev => ({
            id: ev.id,
            crValue: ev.crResult?.cr ?? 0,
            crStatus: ev.crResult?.status ?? 'ON_TRACK',
            accumulatedDeficit: ev.crResult?.deficit ?? 0,
        }));

        const sig = JSON.stringify(updates);
        if (sig === lastSyncRef.current) return;
        lastSyncRef.current = sig;

        const timer = setTimeout(() => {
            syncCR(updates);
        }, 3000); // Debounce sync by 3s to prevent spamming DB

        return () => clearTimeout(timer);
    }, [eventsWithCR, syncCR]);

    return {
        eventsWithCR,
        crisisEvents,
        activityRates,
        learningCurves,
        loading,
        error,
        refetch: fetchData,
        syncCR,
    };
}
