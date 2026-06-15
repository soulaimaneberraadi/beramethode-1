import type { Lot, ModelData } from '../types';

export function newLotId(): string {
    return `lot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Propose des lots à partir de la grille tailles/couleurs du modèle (échelle sur `totalQty`).
 */
export function splitLotsFromModelGrid(
    model: ModelData | undefined,
    totalQty: number,
    defaultDeadlineYmd: string
): Lot[] {
    const grid = (model?.ficheData?.gridQuantities || {}) as Record<string, number>;
    const sizes = model?.ficheData?.sizes || model?.meta_data?.sizes || ['Taille'];
    const totals = sizes.map(() => 0);
    for (const [k, v] of Object.entries(grid)) {
        const parts = k.split('_');
        const idx = parseInt(parts[parts.length - 1], 10);
        if (!Number.isNaN(idx) && idx >= 0 && idx < totals.length) totals[idx] += Number(v) || 0;
    }
    const sumGrid = totals.reduce((a, b) => a + b, 0);
    if (sumGrid <= 0) {
        const n = Math.max(1, sizes.length);
        const base = Math.floor(totalQty / n);
        let rem = totalQty - base * n;
        return sizes.map(taille => {
            const q = base + (rem > 0 ? 1 : 0);
            if (rem > 0) rem--;
            return {
                id: newLotId(),
                taille: String(taille),
                couleur: '-',
                quantite: q,
                deadline: defaultDeadlineYmd,
                status: 'PENDING' as const,
            };
        });
    }
    const scale = totalQty / sumGrid;
    return sizes.map((taille, i) => ({
        id: newLotId(),
        taille: String(taille),
        couleur: '-',
        quantite: Math.max(0, Math.round(totals[i] * scale)),
        deadline: defaultDeadlineYmd,
        status: 'PENDING' as const,
    }));
}

export function totalLotsQty(lots: Lot[]): number {
    return lots.reduce((a, l) => a + (l.quantite || 0), 0);
}
