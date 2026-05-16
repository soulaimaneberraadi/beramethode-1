import type { AppSettings } from '../types';
import { addWorkingDays, parsePlanningDateAtNoon, planningLocalDateKey } from './planning';
import type { MaterialLine } from './materialNeeds';
import { matchMagasinProductId } from './materialNeeds';

/** Date livraison matière = N jours ouvrés après la commande (L). */
export function materialReadyDate(orderDateYmd: string, supplierLeadWorkingDays: number, settings: AppSettings): string {
    const start = parsePlanningDateAtNoon(orderDateYmd);
    const d = addWorkingDays(start, Math.max(0, supplierLeadWorkingDays), settings);
    return planningLocalDateKey(d);
}

/** Produit magasin (ou catalogue) avec délai fournisseur — compatible MagasinProduct. */
export type CatalogProductForEta = {
    id: string;
    designation: string;
    reference?: string;
    fournisseurNom?: string;
    fournisseurDelaiLivraisonJours?: number;
};

export type MaterialArrivalEtaRow = {
    name: string;
    qty: number;
    unit: string;
    productId?: string;
    supplierName?: string;
    leadWorkingDays: number;
    estimatedArrivalYmd: string;
    matched: boolean;
};

export type MaterialArrivalPlan = {
    rows: MaterialArrivalEtaRow[];
    /** Max des dates d’arrivée (ligne la plus tardive) */
    worstArrivalYmd: string | null;
    /** Nom affiché de la matière critique (pire date) */
    criticalMaterialName: string | null;
};

function ymdCompare(a: string, b: string): number {
    return a.localeCompare(b);
}

/**
 * Pour chaque ligne BOM : délai = catalogue magasin (j calendaires → convertis en j ouvrés via materialReadyDate)
 * ou défaut ; date arrivée = commande au lancement + délai (j ouvrés).
 */
export function computeMaterialArrivalPlan(
    lines: MaterialLine[],
    catalog: CatalogProductForEta[],
    orderDateYmd: string,
    settings: AppSettings,
    defaultLeadWorkingDays: number,
): MaterialArrivalPlan {
    const def = Math.max(0, Math.round(defaultLeadWorkingDays || 0));
    if (!orderDateYmd || !lines.length) {
        return { rows: [], worstArrivalYmd: null, criticalMaterialName: null };
    }

    const rows: MaterialArrivalEtaRow[] = [];
    let worst: string | null = null;
    let criticalName: string | null = null;

    for (const line of lines) {
        const pid = catalog.length ? matchMagasinProductId(line.name, catalog) : undefined;
        const prod = pid ? catalog.find(p => p.id === pid) : undefined;
        const rawLead = prod?.fournisseurDelaiLivraisonJours;
        const lead = rawLead != null && rawLead >= 0 ? Math.round(rawLead) : def;
        const estimatedArrivalYmd = materialReadyDate(orderDateYmd, lead, settings);
        rows.push({
            name: line.name,
            qty: line.qty,
            unit: line.unit,
            productId: pid,
            supplierName: prod?.fournisseurNom,
            leadWorkingDays: lead,
            estimatedArrivalYmd,
            matched: !!prod,
        });
        if (!worst || ymdCompare(estimatedArrivalYmd, worst) > 0) {
            worst = estimatedArrivalYmd;
            criticalName = line.name;
        }
    }

    return { rows, worstArrivalYmd: worst, criticalMaterialName: criticalName };
}
