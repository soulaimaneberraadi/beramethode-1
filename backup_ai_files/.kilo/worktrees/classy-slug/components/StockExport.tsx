import React, { useState, useMemo } from 'react';
import { ModelData, SuiviData, PlanningEvent } from '../types';
import { Package, Truck, Search, CheckCircle2, Factory, PackageCheck } from 'lucide-react';

interface StockExportProps {
    models: ModelData[];
    suivis: SuiviData[];
    planningEvents?: PlanningEvent[];
}

export default function StockExport({ models, suivis, planningEvents = [] }: StockExportProps) {
    const [searchQuery, setSearchQuery] = useState('');

    // Filter models that are in EXPORT status
    const exportModels = useMemo(() => {
        return models.filter(m => m.workflowStatus === 'EXPORT').map(model => {
            // Find planning events for this model
            const planEventsForModel = planningEvents.filter(p => p.modelId === model.id).map(p => p.id);

            // Calculate total produced across all Suivis for this model
            const associatedSuivis = suivis.filter(s => planEventsForModel.includes(s.planningId));
            const totalProduced = associatedSuivis.reduce((sum, s) => sum + s.totalHeure, 0);

            // Assume missing metadata fields
            const targetQty = model.meta_data.quantity || 0;
            const progress = targetQty > 0 ? Math.min(100, (totalProduced / targetQty) * 100) : 0;

            return {
                ...model,
                totalProduced,
                targetQty,
                progress
            };
        });
    }, [models, suivis, planningEvents]);

    const filteredModels = exportModels.filter(m =>
        m.meta_data.nom_modele.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.meta_data.reference?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col bg-slate-50 relative pb-20">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-20">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <PackageCheck className="w-6 h-6 text-emerald-600" />
                        Stock Produit Fini (Export)
                    </h1>
                    <p className="text-slate-500 mt-1">Gestion des commandes clôturées et prêtes pour l'expédition.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Chercher un modèle..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 w-64 bg-slate-50"
                        />
                    </div>
                </div>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto w-full max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">

                {/* Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                            <PackageCheck className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500">Total Modèles Fini</p>
                            <p className="text-3xl font-black text-slate-800">{exportModels.length}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                            <Factory className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500">Volume Total en Stock (Pcs)</p>
                            <p className="text-3xl font-black text-slate-800">
                                {exportModels.reduce((sum, m) => sum + m.totalProduced, 0).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                            <Truck className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500">Expéditions du Mois</p>
                            <p className="text-3xl font-black text-slate-800">0</p>
                        </div>
                    </div>
                </div>

                {/* List of Finished Models */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <Package className="w-5 h-5 text-slate-500" />
                            Stock Physique Disponible
                        </h2>
                    </div>

                    {filteredModels.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                            <PackageCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="font-bold">Aucun modèle dans le stock produit fini pour le moment.</p>
                            <p className="text-sm mt-1">Clôturez une production depuis le module Suivi pour la voir apparaître ici.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto w-full">
                            <table className="w-full text-left border-collapse whitespace-nowrap">
                                <thead>
                                    <tr className="bg-white border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                        <th className="p-4 w-12"></th>
                                        <th className="p-4">Modèle (OF)</th>
                                        <th className="p-4">Quantité Commandée</th>
                                        <th className="p-4 text-emerald-700">Stock Réel Produit</th>
                                        <th className="p-4">Taux (Rendement)</th>
                                        <th className="p-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredModels.map(model => (
                                        <tr key={model.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                            <td className="p-4 text-center">
                                                <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 mx-auto border border-slate-200">
                                                    {model.image ? (
                                                        <img src={model.image} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <Package className="w-5 h-5 text-slate-300 m-2.5" />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="font-black text-slate-800 tracking-tight text-sm">
                                                    {model.meta_data.nom_modele}
                                                </div>
                                                <div className="text-xs text-slate-500 font-medium">
                                                    Réf: {model.meta_data.reference || 'N/A'} • {model.id.substring(0, 8)}
                                                </div>
                                            </td>
                                            <td className="p-4 font-bold text-slate-600">
                                                {model.targetQty.toLocaleString()} pcs
                                            </td>
                                            <td className="p-4">
                                                <div className="font-black text-lg text-emerald-600">
                                                    {model.totalProduced.toLocaleString()} pcs
                                                </div>
                                            </td>
                                            <td className="p-4 flex items-center gap-3">
                                                <div className="flex-1 min-w-[100px] max-w-[120px] bg-slate-100 h-2 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${model.progress >= 95 ? 'bg-emerald-500' : model.progress >= 80 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                        style={{ width: `${model.progress}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs font-bold text-slate-500 w-8">{Math.round(model.progress)}%</span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => alert(`Module Expédition en cours de création pour ${model.meta_data.nom_modele}`)}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-lg transition-colors shadow-sm inline-flex items-center gap-1.5"
                                                >
                                                    <Truck className="w-3.5 h-3.5" /> Créer Expédition (PL)
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
