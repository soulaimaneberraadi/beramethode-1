import { useEffect, useState } from 'react';
import { currentHourKey, currentHourLabel } from '../shared/hours';

/** Updates every 60 seconds. Provides current hour key + label. */
export function useCurrentHour() {
    const [key, setKey] = useState<string>(() => currentHourKey());
    const [label, setLabel] = useState<string>(() => currentHourLabel());

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setKey(currentHourKey(now));
            setLabel(currentHourLabel(now));
        };
        tick();
        const id = setInterval(tick, 60_000);
        return () => clearInterval(id);
    }, []);

    return { key, label };
}
