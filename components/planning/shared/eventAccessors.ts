import type { PlanningEvent, ModelData } from '../../../types';

/** Couche d’abstraction : un seul endroit où on lit les champs (gère le legacy qteTotal/totalQuantity, etc.). */

export const evQty = (ev: PlanningEvent): number =>
    Number(ev.totalQuantity ?? ev.qteTotal ?? 0);

export const evProduced = (ev: PlanningEvent): number =>
    Number(ev.producedQuantity ?? ev.qteProduite ?? 0);

export const evStartYmd = (ev: PlanningEvent): string =>
    (ev.startDate || ev.dateLancement || '').split('T')[0];

export const evEndYmd = (ev: PlanningEvent): string =>
    (ev.estimatedEndDate || ev.dateExport || '').split('T')[0];

export const evDeadlineYmd = (ev: PlanningEvent): string =>
    (ev.strictDeadline_DDS || '').split('T')[0];

export const evProgressPct = (ev: PlanningEvent): number => {
    const q = evQty(ev);
    if (q <= 0) return 0;
    return Math.min(100, Math.round((evProduced(ev) / q) * 100));
};

export const evClientName = (ev: PlanningEvent, models?: ModelData[]): string => {
    if (ev.clientName?.trim()) return ev.clientName.trim();
    const m = models?.find(x => x.id === ev.modelId);
    return (m?.ficheData?.client || '').trim() || '—';
};

export const evModelName = (ev: PlanningEvent, models?: ModelData[]): string => {
    if (ev.modelName?.trim()) return ev.modelName.trim();
    const m = models?.find(x => x.id === ev.modelId);
    return m?.meta_data?.nom_modele || 'Ordre';
};

export const evModelThumb = (ev: PlanningEvent, models?: ModelData[]): string | null => {
    const m = models?.find(x => x.id === ev.modelId);
    return m?.images?.front || m?.image || null;
};
