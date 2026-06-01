import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlanningEvent } from '../../../types';

const MAX_HISTORY = 50;

interface Args {
    planningEvents: PlanningEvent[];
    setPlanningEvents: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
}

/**
 * Wraps planningEvents with undo/redo. Returns a wrapped setter — every call
 * to it pushes the previous state onto the past stack. External writes to
 * planningEvents (cloud sync, login) go straight to setPlanningEvents and
 * don't pollute history (their redo stack just gets cleared).
 */
export function usePlanningHistory({ planningEvents, setPlanningEvents }: Args) {
    const pastRef = useRef<PlanningEvent[][]>([]);
    const futureRef = useRef<PlanningEvent[][]>([]);
    const eventsRef = useRef(planningEvents);
    const skipNextSyncRef = useRef(false);
    const [version, setVersion] = useState(0);
    const bump = () => setVersion(v => v + 1);

    // Keep ref in sync with the latest events, and clear redo on external writes.
    useEffect(() => {
        eventsRef.current = planningEvents;
        if (skipNextSyncRef.current) {
            skipNextSyncRef.current = false;
            return;
        }
        if (futureRef.current.length > 0) {
            futureRef.current = [];
            bump();
        }
    }, [planningEvents]);

    /** Wrapped setter — snapshots the current state into the past stack. */
    const setWithHistory = useCallback((updater: React.SetStateAction<PlanningEvent[]>) => {
        pastRef.current = [...pastRef.current, eventsRef.current].slice(-MAX_HISTORY);
        futureRef.current = [];
        skipNextSyncRef.current = true;
        setPlanningEvents(updater);
        bump();
    }, [setPlanningEvents]);

    const undo = useCallback(() => {
        if (pastRef.current.length === 0) return;
        const previous = pastRef.current[pastRef.current.length - 1];
        pastRef.current = pastRef.current.slice(0, -1);
        futureRef.current = [eventsRef.current, ...futureRef.current].slice(0, MAX_HISTORY);
        skipNextSyncRef.current = true;
        setPlanningEvents(previous);
        bump();
    }, [setPlanningEvents]);

    const redo = useCallback(() => {
        if (futureRef.current.length === 0) return;
        const next = futureRef.current[0];
        futureRef.current = futureRef.current.slice(1);
        pastRef.current = [...pastRef.current, eventsRef.current].slice(-MAX_HISTORY);
        skipNextSyncRef.current = true;
        setPlanningEvents(next);
        bump();
    }, [setPlanningEvents]);

    return {
        setWithHistory,
        undo,
        redo,
        canUndo: pastRef.current.length > 0,
        canRedo: futureRef.current.length > 0,
        pastCount: pastRef.current.length,
        futureCount: futureRef.current.length,
        _version: version,
    };
}
