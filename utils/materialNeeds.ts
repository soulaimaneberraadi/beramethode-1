import type { ModelData } from '../types';

export type MaterialLine = { name: string; qty: number; unit: string };

export type MagasinProductRef = { id: string; designation: string; reference?: string };
export type MagasinLotRef = { productId: string; quantiteRestante: number; quantiteReservee?: number };

export type MaterialStockRow = {
    name: string;
    unit: string;
    productId?: string;
    required: number;
    available: number;
    missing: number;
    unmatched?: boolean;
};

export type EvaluateStockResult = { ok: boolean; shortages: MaterialStockRow[]; lines: MaterialLine[] };

export function aggregateMaterialNeeds(model: ModelData | undefined, orderQty: number): MaterialLine[] {
    const fdQty = model?.ficheData?.quantity || model?.meta_data?.quantity || 0;
    const scale = fdQty > 0 ? orderQty / fdQty : 1;
    const mats = model?.ficheData?.materials || [];
    return mats.map((m: { name?: string; qty?: number; unit?: string }) => ({
        name: m.name || '—',
        qty: Math.ceil((Number(m.qty) || 0) * scale),
        unit: m.unit || 'u',
    }));
}

function norm(s: string): string {
    return s.trim().toLowerCase();
}

/** Associe une ligne BOM au catalogue magasin (désignation / référence / inclusion partielle). */
export function matchMagasinProductId(materialName: string, products: MagasinProductRef[]): string | undefined {
    const n = norm(materialName);
    if (!n) return undefined;
    const byDes = products.find(p => norm(p.designation) === n);
    if (byDes) return byDes.id;
    const byRef = products.find(p => p.reference && norm(p.reference) === n);
    if (byRef) return byRef.id;
    const partial = products.find(
        p =>
            norm(p.designation).includes(n) ||
            n.includes(norm(p.designation)) ||
            (p.reference && (norm(p.reference).includes(n) || n.includes(norm(p.reference)))),
    );
    return partial?.id;
}

export function availableQtyForProduct(productId: string, lots: MagasinLotRef[]): number {
    return lots
        .filter(l => l.productId === productId)
        .reduce((s, l) => s + (l.quantiteRestante - (l.quantiteReservee || 0)), 0);
}

export function allocateFIFO(
    lines: { name: string; qty: number }[],
    products: any[],
    lots: any[]
): { productId: string; lotId: string; quantite: number }[] {
    const allocations: { productId: string; lotId: string; quantite: number }[] = [];
    
    for (const line of lines) {
        const pid = matchMagasinProductId(line.name, products);
        if (!pid) continue;
        
        const productLots = lots
            .filter((l: any) => l.productId === pid)
            .map((l: any) => ({
                ...l,
                available: Math.max(0, (l.quantiteRestante || 0) - (l.quantiteReservee || 0)),
            }))
            .filter((l: any) => l.available > 0);
            
        productLots.sort((a: any, b: any) => {
            const dateA = a.dateEntree || '';
            const dateB = b.dateEntree || '';
            if (dateA !== dateB) {
                return dateA.localeCompare(dateB);
            }
            return (a.id || '').localeCompare(b.id || '');
        });
        
        let remainingNeed = line.qty;
        for (const lot of productLots) {
            if (remainingNeed <= 0) break;
            const take = Math.min(remainingNeed, lot.available);
            if (take > 0) {
                allocations.push({
                    productId: pid,
                    lotId: lot.id,
                    quantite: Number(take.toFixed(4)),
                });
                remainingNeed -= take;
            }
        }
    }
    
    return allocations;
}

/**
 * Compare les besoins agrégés au stock disponible (reste − réservé par lot).
 * Si le catalogue magasin est vide, retourne ok: true (pas de blocage automatique).
 */
export function evaluateStockForPlanning(
    model: ModelData | undefined,
    orderQty: number,
    products: MagasinProductRef[],
    lots: MagasinLotRef[],
): EvaluateStockResult {
    const lines = aggregateMaterialNeeds(model, orderQty);
    if (!lines.length) {
        return { ok: true, shortages: [], lines };
    }
    if (!products.length) {
        return { ok: true, shortages: [], lines };
    }

    const shortages: MaterialStockRow[] = [];
    for (const line of lines) {
        const pid = matchMagasinProductId(line.name, products);
        if (!pid) {
            shortages.push({
                name: line.name,
                unit: line.unit,
                required: line.qty,
                available: 0,
                missing: line.qty,
                unmatched: true,
            });
            continue;
        }
        const available = availableQtyForProduct(pid, lots);
        if (available < line.qty) {
            shortages.push({
                name: line.name,
                unit: line.unit,
                productId: pid,
                required: line.qty,
                available,
                missing: line.qty - available,
            });
        }
    }
    return { ok: shortages.length === 0, shortages, lines };
}

/** Lignes pour tableau détail OF (besoin vs disponible lot par produit magasin). */
export function materialStockRowsForDisplay(
    model: ModelData | undefined,
    orderQty: number,
    products: MagasinProductRef[],
    lots: MagasinLotRef[],
): { name: string; unit: string; required: number; available: number; ok: boolean; unmatched?: boolean }[] {
    const lines = aggregateMaterialNeeds(model, orderQty);
    return lines.map(line => {
        const pid = matchMagasinProductId(line.name, products);
        if (!pid) {
            return {
                name: line.name,
                unit: line.unit,
                required: line.qty,
                available: 0,
                ok: false,
                unmatched: true,
            };
        }
        const available = availableQtyForProduct(pid, lots);
        return {
            name: line.name,
            unit: line.unit,
            required: line.qty,
            available,
            ok: available >= line.qty,
        };
    });
}

export function formatStockBlockedReason(shortages: MaterialStockRow[]): string {
    if (shortages.length === 0) return '';
    if (shortages.length === 1) {
        const s = shortages[0];
        if (s.unmatched) return `Article inconnu au magasin : ${s.name}`;
        return `Stock insuffisant : ${s.name} (besoin ${s.required} ${s.unit}, dispo ${Math.round(s.available * 1000) / 1000})`;
    }
    return `Stock insuffisant (${shortages.length} références)`;
}
