import React from 'react';
import { X, Truck, CheckCircle, Clock, AlertTriangle, Package, MapPin, Calendar } from 'lucide-react';
import { fmt } from '../constants';
import { resolveStock } from '../lib/magasinMatch';

interface MaterialDetailModalProps {
    material: {
        name: string;
        unitPrice: number;
        qtyToBuy: number;
        unit: string;
        lineCost: number;
        fournisseur?: string;
        threadMeters?: number;
        colorName?: string;
        pieces?: number;
        magasinId?: string;
        threadReference?: string;
        /** Quantité déjà réservée par d'autres ordres (défaut 0). */
        reserved?: number;
    };
    currency: string;
    magasinData?: any[];
    onClose: () => void;
}

const MaterialDetailModal: React.FC<MaterialDetailModalProps> = ({
    material, currency, magasinData = [], onClose
}) => {
    const st = resolveStock(material, magasinData, material.qtyToBuy, material.reserved || 0, material.pieces || 0);
    const stockActuel = st.stockActuel;
    const delaiLivraison = st.delaiLivraison;
    const fournisseurNom = st.fournisseur;
    const isDelivered = st.isDelivered;
    const isPartial = st.isPartial;
    const manque = st.manque;
    const piecesCouvertes = st.piecesCouvertes;

    const getStatus = () => {
        if (isDelivered) return { label: 'En stock', icon: CheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' };
        if (isPartial) return { label: 'Stock partiel', icon: AlertTriangle, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
        return { label: 'En attente', icon: Clock, color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' };
    };

    const status = getStatus();
    const StatusIcon = status.icon;

    return (
        <div dir="ltr" className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                {/* Header — style Calcul Fil */}
                <div className="px-4 sm:px-5 h-12 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={1.75} />
                        <div className="min-w-0">
                            <h3 className="text-[13px] font-semibold text-slate-900 tracking-tight truncate">{material.name}</h3>
                            {material.colorName && (
                                <p className="text-[11px] text-slate-400 truncate">Couleur : {material.colorName}</p>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0">
                        <X className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                </div>

                {/* Content — scrollable sur mobile */}
                <div className="p-3 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto">
                    {/* Statut */}
                    <div className={`flex items-center gap-2.5 p-3 rounded-md border ${status.bg} ${status.border}`}>
                        <StatusIcon className={`w-4 h-4 shrink-0 ${status.color}`} strokeWidth={1.75} />
                        <div className="min-w-0">
                            <span className={`text-[12px] font-semibold ${status.color}`}>{status.label}</span>
                            {isPartial && (
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    {fmt(stockActuel)} {material.unit} en stock / {fmt(material.qtyToBuy)} {material.unit} nécessaires
                                    {material.pieces ? <> · couvre <span className="font-semibold text-amber-700">{fmt(piecesCouvertes)}</span> / {fmt(material.pieces)} pcs</> : null}
                                </p>
                            )}
                            {isDelivered && (
                                <p className="text-[11px] text-slate-500 mt-0.5">Stock suffisant : {fmt(stockActuel)} {material.unit}</p>
                            )}
                            {!isDelivered && !isPartial && (
                                <p className="text-[11px] text-slate-500 mt-0.5">{fmt(manque)} {material.unit} manquants</p>
                            )}
                        </div>
                    </div>

                    {/* Grille de détails */}
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                        <div className="bg-slate-50/60 rounded-md p-3 border border-slate-200">
                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Prix Unitaire HT</span>
                            <span className="text-[15px] font-semibold text-slate-900 tabular-nums">{fmt(material.unitPrice)} <span className="text-[11px] font-normal text-slate-400">{currency}</span></span>
                        </div>
                        <div className="bg-slate-50/60 rounded-md p-3 border border-slate-200">
                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Quantité à acheter</span>
                            <span className="text-[15px] font-semibold text-slate-900 tabular-nums">{fmt(material.qtyToBuy)} <span className="text-[11px] font-normal text-slate-400">{material.unit}</span></span>
                        </div>
                        <div className="bg-[#2149C1]/5 rounded-md p-3 border border-[#2149C1]/20">
                            <span className="text-[10px] font-medium text-[#2149C1] uppercase tracking-wider block mb-1">Coût Total HT</span>
                            <span className="text-[15px] font-semibold text-[#2149C1] tabular-nums">{fmt(material.lineCost)} <span className="text-[11px] font-normal text-[#2149C1]/60">{currency}</span></span>
                        </div>
                        {material.pieces !== undefined && (
                            <div className="bg-slate-50/60 rounded-md p-3 border border-slate-200">
                                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">Pièces concernées</span>
                                <span className="text-[15px] font-semibold text-slate-900 tabular-nums">{fmt(material.pieces)} <span className="text-[11px] font-normal text-slate-400">pcs</span></span>
                            </div>
                        )}
                    </div>

                    {/* Fournisseur & livraison */}
                    <div className="rounded-md border border-slate-200 p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-2.5">
                            <Truck className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Fournisseur & Livraison</span>
                        </div>
                        {fournisseurNom ? (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5 text-[#2149C1]" strokeWidth={1.75} />
                                    <span className="text-[13px] font-semibold text-slate-800">{fournisseurNom}</span>
                                </div>
                                {delaiLivraison !== null && (
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                                        <span className="text-[12px] text-slate-600">Délai de livraison : <span className="font-semibold">{delaiLivraison} jours</span></span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-[12px] text-slate-400 italic">Aucun fournisseur renseigné</p>
                        )}
                    </div>

                    {/* État du stock */}
                    <div className="rounded-md border border-slate-200 p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Package className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">État du Stock</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div>
                                <span className="text-[10px] text-slate-400 font-medium uppercase block mb-0.5">En Stock</span>
                                <span className={`text-[14px] font-semibold tabular-nums ${stockActuel > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{fmt(stockActuel)}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-medium uppercase block mb-0.5">Besoin</span>
                                <span className="text-[14px] font-semibold text-slate-900 tabular-nums">{fmt(material.qtyToBuy)}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-medium uppercase block mb-0.5">Manque</span>
                                <span className={`text-[14px] font-semibold tabular-nums ${manque > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(manque)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-4 sm:px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
                    <button
                        onClick={onClose}
                        className="inline-flex items-center justify-center h-9 px-4 bg-slate-900 text-white text-[12px] font-medium rounded-md hover:bg-slate-800 transition-colors"
                    >
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MaterialDetailModal;
