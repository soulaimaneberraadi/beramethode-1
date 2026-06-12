import { MaterialReceipt } from '../types';

const norm = (s?: string) => (s || '').toLowerCase().trim();

export interface ConfirmReceptionParams {
    materialName: string;
    qty: number;
    unit?: string;
    unitPrice?: number;
    modelId: string;
    modelName?: string;
    /** Commande / événement Planning lié (sinon on retombe sur modelId). */
    pedidoId?: string;
    supplierName?: string | null;
}

export interface ConfirmReceptionResult {
    receipt: MaterialReceipt;
    updatedReceptions: MaterialReceipt[];
    updatedMagasin: any[];
    /** true si une matière correspondante existait déjà dans le magasin. */
    matched: boolean;
}

/**
 * Confirme la réception d'une matière (façon « entrée stock ») :
 *  1. Crée un Bon de Réception (BR) → `beramethode_receptions` + backend
 *     → vu par le Planning (usePlanningValidation, clé modelId + materialName).
 *  2. Incrémente le stock opérationnel `beramethode_magasin` (le `stockActuel`
 *     que lit `resolveStock`) → le statut quitte « En attente » → « Stock OK ».
 *
 * On met à jour le stock opérationnel (legacy) que la fiche de coût lit réellement,
 * pas le système de lots, pour éviter tout double comptage. Retourne les tableaux
 * mis à jour pour que le composant rafraîchisse son état.
 */
export function confirmReceptionLocal(p: ConfirmReceptionParams): ConfirmReceptionResult {
    let receptions: MaterialReceipt[] = [];
    let magasin: any[] = [];
    try { receptions = JSON.parse(localStorage.getItem('beramethode_receptions') || '[]'); } catch { /* ignore */ }
    try { magasin = JSON.parse(localStorage.getItem('beramethode_magasin') || '[]'); } catch { /* ignore */ }

    const receipt: MaterialReceipt = {
        id: `BR-${Date.now().toString().slice(-7)}-${Math.floor(Math.random() * 900 + 100)}`,
        pedidoId: p.pedidoId || p.modelId,
        modelId: p.modelId,
        materialName: p.materialName,
        qtyReceived: p.qty,
        dateReceived: new Date().toISOString().split('T')[0],
        owner: 'client',
        supplierName: p.supplierName || 'Fournisseur',
    };
    const updatedReceptions = [receipt, ...receptions];

    let matched = false;
    let updatedMagasin = magasin.map((it) => {
        if (!matched && (norm(it.nom) === norm(p.materialName) || norm(it.designation) === norm(p.materialName))) {
            matched = true;
            return { ...it, stockActuel: (Number(it.stockActuel) || 0) + p.qty };
        }
        return it;
    });
    if (!matched) {
        updatedMagasin = [{
            id: `mat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            nom: p.materialName,
            designation: p.materialName,
            stockActuel: p.qty,
            prix: p.unitPrice || 0,
            unite: p.unit || 'pc',
            fournisseurNom: p.supplierName || '',
            categorie: 'autre',
        }, ...updatedMagasin];
    }

    // Persistance locale (synchronisée au cloud comme les autres clés).
    try { localStorage.setItem('beramethode_receptions', JSON.stringify(updatedReceptions)); } catch { /* ignore */ }
    try { localStorage.setItem('beramethode_magasin', JSON.stringify(updatedMagasin)); } catch { /* ignore */ }

    // BR côté serveur (best-effort, ne bloque pas l'UI).
    fetch('/api/material-receipts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receipt),
    }).catch(() => { /* hors-ligne : la copie locale suffit */ });

    return { receipt, updatedReceptions, updatedMagasin, matched };
}
