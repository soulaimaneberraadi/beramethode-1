// Résolution du lien Matière ↔ Magasin et calcul du statut stock.
// Centralisé ici pour que la Fiche de Coût, le panneau Pedido et les modales
// utilisent EXACTEMENT la même logique (statut « En attente » fiable).

export interface MagasinItem {
    id?: string;
    nom?: string;
    designation?: string;
    reference?: string;
    stockActuel?: number;
    unite?: string;
    fournisseurNom?: string;
    fournisseur?: string;
    fournisseurDelaiLivraisonJours?: number;
    delaiLivraison?: number;
    [k: string]: any;
}

export interface MaterialLink {
    magasinId?: string;
    name?: string;
    threadReference?: string;
    reference?: string;
    fournisseur?: string;
}

const norm = (s?: string) => (s || '').trim().toLowerCase();

/**
 * Résout l'article Magasin lié à une matière, par ordre de fiabilité :
 *   1) magasinId (lien fort posé à l'import)
 *   2) référence
 *   3) nom / désignation (normalisés) — compatibilité avec les anciennes données
 */
export function findMagasinItem(material: MaterialLink, magasinData: MagasinItem[] = []): MagasinItem | undefined {
    if (!material || !magasinData.length) return undefined;

    if (material.magasinId) {
        const byId = magasinData.find(m => String(m.id) === String(material.magasinId));
        if (byId) return byId;
    }

    const ref = norm(material.threadReference || material.reference);
    if (ref) {
        const byRef = magasinData.find(m => norm(m.reference) === ref);
        if (byRef) return byRef;
    }

    const nm = norm(material.name);
    if (nm) {
        const byName = magasinData.find(m => norm(m.nom) === nm || norm(m.designation) === nm);
        if (byName) return byName;
    }

    return undefined;
}

export interface StockStatus {
    item?: MagasinItem;
    /** Stock disponible après déduction des réservations d'autres ordres. */
    stockActuel: number;
    /** Stock brut tel quel dans le magasin (avant réservations). */
    stockBrut: number;
    manque: number;
    /** Nb de pièces du lot que le stock disponible permet de couvrir pour CETTE matière. */
    piecesCouvertes: number;
    isDelivered: boolean;
    isPartial: boolean;
    fournisseur: string | null;
    delaiLivraison: number | null;
}

/**
 * Statut stock d'une matière pour une quantité à acheter (qtyToBuy) donnée.
 * @param reserved quantité déjà réservée par d'autres ordres (défaut 0)
 * @param pieces   nb de pièces du lot auquel correspond qtyToBuy (pour « couvre X pcs »)
 */
export function resolveStock(
    material: MaterialLink,
    magasinData: MagasinItem[],
    qtyToBuy: number,
    reserved = 0,
    pieces = 0,
): StockStatus {
    const item = findMagasinItem(material, magasinData);
    const stockBrut = item?.stockActuel || 0;
    const stockActuel = Math.max(0, stockBrut - reserved);
    const manque = Math.max(0, qtyToBuy - stockActuel);
    const fournisseur = material.fournisseur || item?.fournisseurNom || item?.fournisseur || null;
    const delaiLivraison = item?.fournisseurDelaiLivraisonJours ?? item?.delaiLivraison ?? null;

    const piecesCouvertes = qtyToBuy > 0 && pieces > 0
        ? Math.floor(pieces * Math.min(1, stockActuel / qtyToBuy))
        : 0;

    return {
        item,
        stockActuel,
        stockBrut,
        manque,
        piecesCouvertes,
        isDelivered: qtyToBuy > 0 && stockActuel >= qtyToBuy,
        isPartial: stockActuel > 0 && stockActuel < qtyToBuy,
        fournisseur,
        delaiLivraison,
    };
}
