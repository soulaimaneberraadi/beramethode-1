import type { PlanningEvent } from '../../../types';
import { evDeadlineYmd, evEndYmd } from '../shared/eventAccessors';
import { daysBetween } from '../shared/dateFmt';
import type { DelayState } from '../shared/statusConfig';

const RISK_BUFFER_DAYS = 2;

/** Indicateur de retard calculé (pas stocké). */
export function delayOf(ev: PlanningEvent): DelayState {
    const end = evEndYmd(ev);
    const dds = evDeadlineYmd(ev);
    if (!end || !dds) return 'ON_TIME';
    const diff = daysBetween(end, dds); // jours entre fin estimée et DDS
    if (diff < 0) return 'LATE';
    if (diff <= RISK_BUFFER_DAYS) return 'AT_RISK';
    return 'ON_TIME';
}
