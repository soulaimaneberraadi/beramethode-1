import React from 'react';
import { X, Truck, CheckCircle, Clock, AlertTriangle, Package, MapPin, Calendar } from 'lucide-react';
import { fmt } from '../constants';

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
    };
    currency: string;
    magasinData?: any[];
    onClose: () => void;
}

const MaterialDetailModal: React.FC<MaterialDetailModalProps> = ({
    material, currency, magasinData = [], onClose
}) => {
    const mItem = magasinData.find((m: any) => m.nom === material.name || m.designation === material.name);
    const stockActuel = mItem?.stockActuel || 0;
    const delaiLivraison = mItem?.fournisseurDelaiLivraisonJours || mItem?.delaiLivraison || null;
    const fournisseurNom = material.fournisseur || mItem?.fournisseurNom || mItem?.fournisseur || null;
    
    const isDelivered = stockActuel >= material.qtyToBuy;
    const isPartial = stockActuel > 0 && stockActuel < material.qtyToBuy;
    const manque = Math.max(0, material.qtyToBuy - stockActuel);

    const getStatus = () => {
        if (isDelivered) return { label: 'En stock', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
        if (isPartial) return { label: 'Stock partiel', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
        return { label: 'En attente', icon: Clock, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' };
    };

    const status = getStatus();
    const StatusIcon = status.icon;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-xl">
                            <Package className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900 text-base">{material.name}</h3>
                            {material.colorName && (
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Couleur: {material.colorName}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {/* Status Badge */}
                    <div className={`flex items-center gap-3 p-4 rounded-xl border ${status.bg} ${status.border}`}>
                        <StatusIcon className={`w-6 h-6 ${status.color}`} />
                        <div>
                            <span className={`text-sm font-bold ${status.color}`}>{status.label}</span>
                            {isPartial && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {fmt(stockActuel)} {material.unit} en stock / {fmt(material.qtyToBuy)} {material.unit} nécessaires
                                </p>
                            )}
                            {isDelivered && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Stock suffisant: {fmt(stockActuel)} {material.unit}
                                </p>
                            )}
                            {!isDelivered && !isPartial && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {fmt(manque)} {material.unit} manquants
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Prix Unitaire HT</span>
                            <span className="text-lg font-black text-slate-800">{fmt(material.unitPrice)} <span className="text-xs font-medium text-slate-400">{currency}</span></span>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Quantité à acheter</span>
                            <span className="text-lg font-black text-slate-800">{fmt(material.qtyToBuy)} <span className="text-xs font-medium text-slate-400">{material.unit}</span></span>
                        </div>
                        <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">Coût Total HT</span>
                            <span className="text-lg font-black text-indigo-700">{fmt(material.lineCost)} <span className="text-xs font-medium text-indigo-400">{currency}</span></span>
                        </div>
                        {material.pieces !== undefined && (
                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Pièces concernées</span>
                                <span className="text-lg font-black text-slate-800">{fmt(material.pieces)} <span className="text-xs font-medium text-slate-400">pcs</span></span>
                            </div>
                        )}
                    </div>

                    {/* Supplier Info */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Truck className="w-4 h-4 text-slate-400" />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fournisseur & Livraison</span>
                        </div>
                        {fournisseurNom ? (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                                    <span className="text-sm font-bold text-slate-800">{fournisseurNom}</span>
                                </div>
                                {delaiLivraison !== null && (
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                        <span className="text-xs text-slate-600">Délai de livraison: <span className="font-bold">{delaiLivraison} jours</span></span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 italic">Aucun fournisseur renseigné</p>
                        )}
                    </div>

                    {/* Stock Info */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Package className="w-4 h-4 text-slate-400" />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">État du Stock</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">En Stock</span>
                                <span className={`text-sm font-black ${stockActuel > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{fmt(stockActuel)}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Besoin</span>
                                <span className="text-sm font-black text-slate-800">{fmt(material.qtyToBuy)}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Manque</span>
                                <span className={`text-sm font-black ${manque > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmt(manque)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-colors"
                    >
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MaterialDetailModal;
