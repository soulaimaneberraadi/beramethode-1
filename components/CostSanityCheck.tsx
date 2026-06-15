import React, { useState, useMemo } from 'react';
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, Check, AlertTriangle, Info } from 'lucide-react';
import { Material, PurchasingData, FicheData, AppSettings } from '../types';
import { fmt } from '../constants';

interface CostSanityCheckProps {
    currency: string;
    isExport: boolean;
    materials: Material[];
    totalMaterials: number;
    laborCost: number;
    costPrice: number;
    purchasingData: PurchasingData[];
    totalPurchasingMatCost: number;
    commandeQty: number;
    ficheData: FicheData;
    settings: AppSettings;
}

type CheckStatus = 'ok' | 'warn' | 'info';
interface CheckRow {
    status: CheckStatus;
    label: string;
    detail: string;
}

const STALE_THREAD = 20000;   // m/pièce : au-delà = données obsolètes
const ABSURD_BUY = 500000;    // qté d'achat aberrante

/**
 * Garde-fou des calculs de la Fiche de Coût. Vérifie en direct les égalités clés
 * et signale toute valeur aberrante AVANT qu'elle ne coûte (tarif/achat erroné).
 */
const CostSanityCheck: React.FC<CostSanityCheckProps> = ({
    currency, isExport, materials, totalMaterials, laborCost, costPrice,
    purchasingData, totalPurchasingMatCost, commandeQty, ficheData, settings,
}) => {
    const checks = useMemo<CheckRow[]>(() => {
        const rows: CheckRow[] = [];

        // 1. PR = Matières + Main d'œuvre (cohérence de la formule)
        const expectedPR = isExport ? laborCost : totalMaterials + laborCost;
        rows.push({
            status: Math.abs(costPrice - expectedPR) < 0.01 ? 'ok' : 'warn',
            label: 'Prix de Revient = Matières + Main d\'œuvre',
            detail: `${fmt(costPrice)} = ${fmt(totalMaterials)} + ${fmt(laborCost)} ${currency}`,
        });

        // 2. Coût Minute défini
        rows.push({
            status: settings.costMinute > 0 ? 'ok' : 'warn',
            label: 'Coût Minute défini',
            detail: settings.costMinute > 0 ? `${fmt(settings.costMinute)} ${currency}/min` : 'Coût Minute = 0 → main d\'œuvre nulle',
        });

        // 3. Consommation de fil réaliste (par pièce)
        const staleThread = materials.filter(m => m.unit === 'bobine' && m.threadMeters > STALE_THREAD);
        rows.push({
            status: staleThread.length === 0 ? 'ok' : 'warn',
            label: 'Consommation de fil réaliste (par pièce)',
            detail: staleThread.length === 0
                ? 'Tous les fils ≤ 20000 m/pièce'
                : `${staleThread.length} fil(s) aberrant(s) (ex: ${staleThread[0].name} = ${fmt(staleThread[0].threadMeters)} m) → relancez Calcul Fil`,
        });

        // 4. Prix des matières renseignés
        const zeroPrice = materials.filter(m => (m.name || '').trim() !== '' && m.unitPrice <= 0);
        rows.push({
            status: isExport || zeroPrice.length === 0 ? 'ok' : 'warn',
            label: 'Prix des matières renseignés',
            detail: isExport
                ? 'Marché Export — matières fournies'
                : zeroPrice.length === 0 ? 'Toutes les matières ont un prix' : `${zeroPrice.length} matière(s) à prix 0 (ex: ${zeroPrice[0].name})`,
        });

        // 5. Quantité commande = somme de la grille (détecte couleur dupliquée)
        const sizeCount = (ficheData.sizes || []).length;
        const gq = ficheData.gridQuantities || {};
        const seen = new Set<string>();
        let gridSum = 0;
        (ficheData.colors || []).forEach(c => {
            if (seen.has(c.id)) return;
            seen.add(c.id);
            for (let s = 0; s < sizeCount; s++) gridSum += Number(gq[`${c.id}_${s}`] || 0);
        });
        const qtyMatches = gridSum === 0 || !ficheData.quantity || ficheData.quantity === gridSum;
        rows.push({
            status: qtyMatches ? 'ok' : 'warn',
            label: 'Quantité = somme de la grille',
            detail: qtyMatches
                ? `${gridSum || ficheData.quantity || 0} pièces`
                : `Modèle: ${ficheData.quantity} ≠ grille: ${gridSum} (couleur en double ?)`,
        });

        // 6. Pas de couleur dupliquée (même id)
        const ids = (ficheData.colors || []).map(c => c.id);
        const dup = ids.length - new Set(ids).size;
        rows.push({
            status: dup === 0 ? 'ok' : 'warn',
            label: 'Couleurs sans doublon',
            detail: dup === 0 ? `${ids.length} couleur(s)` : `${dup} couleur(s) en double → quantités gonflées`,
        });

        // 7. Quantités d'achat réalistes
        const absurd = purchasingData.filter(m => m.qtyToBuy > ABSURD_BUY);
        rows.push({
            status: absurd.length === 0 ? 'ok' : 'warn',
            label: 'Quantités d\'achat réalistes',
            detail: absurd.length === 0
                ? 'Aucun besoin aberrant'
                : `${absurd.length} matière(s) > ${fmt(ABSURD_BUY)} (ex: ${absurd[0].name} = ${fmt(absurd[0].qtyToBuy)})`,
        });

        // 8. Budget Matière = Σ(achat × prix) (transparence)
        const sumLine = purchasingData.reduce((a, m) => a + m.lineCost, 0);
        rows.push({
            status: Math.abs(totalPurchasingMatCost - sumLine) < 0.5 ? 'ok' : 'warn',
            label: 'Budget Matière = Σ(achat × prix)',
            detail: `${fmt(totalPurchasingMatCost)} ${currency} sur ${commandeQty} pièces`,
        });

        return rows;
    }, [currency, isExport, materials, totalMaterials, laborCost, costPrice, purchasingData, totalPurchasingMatCost, commandeQty, ficheData, settings]);

    const warnings = checks.filter(c => c.status === 'warn').length;
    const allOk = warnings === 0;
    const [open, setOpen] = useState(false);

    return (
        <div className={`rounded-lg border overflow-hidden ${allOk ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/50'}`}>
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full px-4 h-11 flex items-center justify-between"
            >
                <div className="flex items-center gap-2">
                    {allOk
                        ? <ShieldCheck className="w-4 h-4 text-emerald-600" strokeWidth={2} />
                        : <ShieldAlert className="w-4 h-4 text-amber-600" strokeWidth={2} />}
                    <span className={`text-[13px] font-semibold ${allOk ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {allOk ? 'Vérification : tous les calculs sont cohérents' : `Vérification : ${warnings} point(s) à corriger`}
                    </span>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {open && (
                <div className="px-3 pb-3 pt-1 space-y-1 bg-white/60 border-t border-slate-200/60">
                    {checks.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-md">
                            <span className="mt-0.5 shrink-0">
                                {c.status === 'ok' && <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />}
                                {c.status === 'warn' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" strokeWidth={2.5} />}
                                {c.status === 'info' && <Info className="w-3.5 h-3.5 text-slate-400" strokeWidth={2.5} />}
                            </span>
                            <div className="min-w-0">
                                <div className={`text-[12px] font-medium ${c.status === 'warn' ? 'text-amber-800' : 'text-slate-700'}`}>{c.label}</div>
                                <div className="text-[11px] text-slate-500 tabular-nums">{c.detail}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CostSanityCheck;
