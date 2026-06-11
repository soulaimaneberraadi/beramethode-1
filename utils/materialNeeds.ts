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
    // `m.qty` est la consommation PAR PIÈCE (cohérent avec la Fiche de Coût :
    // baseQty = m.qty × pièces). Le besoin d'une commande = conso/pièce × quantité.
    // ⚠ NE PAS diviser par ficheData.quantity : c'est l'ancien bug qui ramenait le
    // besoin à ~1 pièce et faisait croire au Planning que le stock suffisait toujours.
    const mats = model?.ficheData?.materials || [];
    return mats.map((m: { name?: string; qty?: number; unit?: string }) => ({
        name: m.name || '—',
        qty: Math.ceil((Number(m.qty) || 0) * orderQty),
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

export type CoverageRow = {
    name: string;
    unit: string;
    productId?: string;
    /** Disponible réel (reste − réservé) sur tous les lots du produit. */
    available: number;
    /** Consommation par pièce (avec gaspillage appliqué). */
    perPiece: number;
    /** Nb de pièces que ce stock permet de couvrir pour cette matière. */
    coverable: number;
    unmatched?: boolean;
};

export type CoverageResult = {
    /** Nb de pièces de la commande réellement couvrables (matière limitante). */
    maxPieces: number;
    /** Nom de la matière qui limite la couverture. */
    limiting?: string;
    rows: CoverageRow[];
};

/**
 * Combien de pièces de la commande le STOCK RÉEL (lots, reste − réservé) permet de
 * couvrir, matière par matière. La matière la plus contraignante fixe `maxPieces`.
 * Répond à : « si le stock ne complète pas la commande, combien de pièces suffit-il ? »
 *
 * La conso/pièce est dérivée de `aggregateMaterialNeeds(model, orderQty) / orderQty`
 * pour rester cohérente avec l'évaluation stock du Planning, puis on applique le
 * gaspillage (%) comme dans la Fiche de Coût.
 */
export function maxPiecesFromStock(
    model: ModelData | undefined,
    orderQty: number,
    products: MagasinProductRef[],
    lots: MagasinLotRef[],
    wastePct = 0,
): CoverageResult {
    const lines = aggregateMaterialNeeds(model, orderQty);
    if (!lines.length || orderQty <= 0 || !products.length) {
        return { maxPieces: orderQty, rows: [] };
    }
    let maxPieces = Infinity;
    let limiting: string | undefined;
    const rows: CoverageRow[] = [];
    for (const line of lines) {
        const pid = matchMagasinProductId(line.name, products);
        const available = pid ? availableQtyForProduct(pid, lots) : 0;
        const perPiece = (line.qty / orderQty) * (1 + wastePct / 100);
        const coverable = perPiece > 0 ? Math.floor(available / perPiece) : orderQty;
        rows.push({ name: line.name, unit: line.unit, productId: pid, available, perPiece, coverable, unmatched: !pid });
        if (coverable < maxPieces) {
            maxPieces = coverable;
            limiting = line.name;
        }
    }
    if (!isFinite(maxPieces)) maxPieces = orderQty;
    return { maxPieces: Math.max(0, Math.min(maxPieces, orderQty)), limiting, rows };
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
