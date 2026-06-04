import type { PlanningEvent } from '../../../types';
import { evDeadlineYmd, evEndYmd } from '../shared/eventAccessors';
import { daysBetween } from '../shared/dateFmt';
import type { DelayState } from '../shared/statusConfig';

const RISK_BUFFER_DAYS = 2;

/** Indicateur de retard calculé (pas stocké). */
export function delayOf(ev: PlanningEvent): DelayState {
    const end = evEndYmd(ev);
    let dds = evDeadlineYmd(ev);
    if (!end || !dds) return 'ON_TIME';

    // Apply 3-day transit buffer deduction for Export models
    if (ev.typeMarche === 'Export') {
        const raw = (dds || '').split('T')[0];
        const [y, m, d] = raw.split('-').map(Number);
        if (y && m && d) {
            const dateObj = new Date(y, m - 1, d);
            dateObj.setDate(dateObj.getDate() - 3);
            const ny = dateObj.getFullYear();
            const nm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const nd = String(dateObj.getDate()).padStart(2, '0');
            dds = `${ny}-${nm}-${nd}`;
        }
    }

    const diff = daysBetween(end, dds); // jours entre fin estimée et DDS
    if (diff < 0) return 'LATE';
    if (diff <= RISK_BUFFER_DAYS) return 'AT_RISK';
    return 'ON_TIME';
}
