import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Percent, Banknote, Clock, Package, TrendingUp, Info, AlertTriangle, Truck, Plus, PlusCircle, Search, X, ChevronDown, ChevronRight, Palette, CheckCircle } from 'lucide-react';
import { PurchasingData, Material, FicheData } from '../types';
import { fmt } from '../constants';
import MaterialDetailModal from './MaterialDetailModal';

interface OrderSimulationProps {
    t: any;
    currency: string;
    darkMode: boolean;
    orderQty: number;
    setOrderQty: (v: number) => void;
    wasteRate: number;
    setWasteRate: (v: number) => void;
    deductStock: () => void;
    purchasingData: PurchasingData[];
    totalPurchasingMatCost: number;
    laborCost: number;
    textSecondary: string;
    textPrimary: string;
    bgCard: string;
    isExport?: boolean;
    materials?: Material[];
    ficheData?: FicheData;
}

const OrderSimulation: React.FC<OrderSimulationProps> = ({
    t, currency, darkMode, orderQty, setOrderQty, wasteRate, setWasteRate,
    deductStock,
    purchasingData, totalPurchasingMatCost, laborCost,
    textSecondary, textPrimary, bgCard,
    isExport = false,
    materials = [], ficheData,
}) => {
    const activeQtyToSimulate = orderQty;
    const totalProjectCost = isExport ? (laborCost * activeQtyToSimulate) : totalPurchasingMatCost + (laborCost * activeQtyToSimulate);

    const [magasinData, setMagasinData] = useState<any[]>([]);

    // Task 2: Substitute states
    const [substitutes, setSubstitutes] = useState<Array<{ originalMatId: number, subId: string, qty: number, subName: string }>>([]);
    const [subModal, setSubModal] = useState<{ open: boolean, matId: number | null, matName: string | null, manque: number }>({ open: false, matId: null, matName: null, manque: 0 });
    const [subSearch, setSubSearch] = useState('');

    // Quick Add Magasin Modal (for substitute modal)
    const [showQuickAddModal, setShowQuickAddModal] = useState(false);
    const [quickAddForm, setQuickAddForm] = useState<Partial<any>>({ unite: 'm', categorie: 'tissu' });

    const [showPididoBreakdown, setShowPididoBreakdown] = useState(true);

    // Material detail modal state
    const [selectedMaterial, setSelectedMaterial] = useState<any>(null);

    // Per-pidido: each color → its applicable materials with quantities + supplier info
    const pididoBreakdown = useMemo(() => {
        if (!ficheData?.colors?.length || !materials.length) return [];
        const gq = ficheData.gridQuantities || {};
        const sizeCount = (ficheData.sizes || []).length;
        const seen = new Set<string>();
        return ficheData.colors.map(c => {
            if (seen.has(c.id)) return null;
            seen.add(c.id);
            let pieces = 0;
            for (let s = 0; s < sizeCount; s++) pieces += Number(gq[`${c.id}_${s}`] || 0);
            if (pieces <= 0) return null;
            const colorMaterials = materials.filter(m => {
                if (m.scope?.colors?.length) return m.scope.colors.includes(c.id);
                if (m.threadColor) return m.threadColor === c.name;
                return true;
            }).map(m => {
                const baseQty = m.qty * pieces;
                const withWaste = baseQty * (1 + wasteRate / 100);
                const buyQty = (m.unit === 'bobine' || m.unit === 'pc') ? Math.ceil(withWaste) : parseFloat(withWaste.toFixed(2));
                const cost = isExport ? 0 : buyQty * m.unitPrice;
                // Get supplier info from magasin
                const mItem = magasinData.find((x: any) => x.nom === m.name || x.designation === m.name);
                const stockActuel = mItem?.stockActuel || 0;
                const fournisseur = m.fournisseur || mItem?.fournisseurNom || mItem?.fournisseur || null;
                const delaiLivraison = mItem?.fournisseurDelaiLivraisonJours || mItem?.delaiLivraison || null;
                const isDelivered = stockActuel >= buyQty;
                const isPartial = stockActuel > 0 && stockActuel < buyQty;
                return { ...m, pieces, baseQty, withWaste, buyQty, cost, fournisseur, delaiLivraison, stockActuel, isDelivered, isPartial };
            });
            if (!colorMaterials.length) return null;
            return { colorId: c.id, colorName: c.name, pieces, materials: colorMaterials };
        }).filter(Boolean) as Array<{
            colorId: string; colorName: string; pieces: number;
            materials: Array<Material & { pieces: number; baseQty: number; withWaste: number; buyQty: number; cost: number; fournisseur: string | null; delaiLivraison: number | null; stockActuel: number; isDelivered: boolean; isPartial: boolean }>;
        }>;
    }, [ficheData, materials, wasteRate, isExport, magasinData]);

    useEffect(() => {
        try {
            const data = localStorage.getItem('beramethode_magasin');
            if (data) setMagasinData(JSON.parse(data));
        } catch (e) {
            console.error(e);
        }
    }, []);

    const handleQuickAdd = () => {
        if (!quickAddForm.nom) return;
        const newItem = {
            id: Date.now().toString(),
            nom: quickAddForm.nom,
            designation: quickAddForm.nom,
            reference: quickAddForm.reference || `REF-${Math.floor(Math.random() * 10000)}`,
            prixUnitaire: Number(quickAddForm.prixUnitaire) || 0,
            stockActuel: Number(quickAddForm.stockActuel) || 0,
            stockAlerte: Number(quickAddForm.stockAlerte) || 10,
            unite: quickAddForm.unite || 'm',
            categorie: quickAddForm.categorie || 'tissu',
            fournisseurNom: quickAddForm.fournisseurNom || '',
            fournisseurDelaiLivraisonJours: Number(quickAddForm.fournisseurDelaiLivraisonJours) || 0,
            image: quickAddForm.image || ''
        };
        const updatedMagasin = [newItem, ...magasinData];
        setMagasinData(updatedMagasin);
        localStorage.setItem('beramethode_magasin', JSON.stringify(updatedMagasin));
        fetch('/api/magasin/products', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...newItem, reference: newItem.reference || newItem.id, designation: newItem.nom }),
        }).catch(() => {});
        setShowQuickAddModal(false);
        setQuickAddForm({ unite: 'm', categorie: 'tissu' });
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setQuickAddForm(prev => ({ ...prev, image: reader.result as string }));
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className={`rounded-lg border overflow-hidden relative ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>

            {/* Substitute Modal */}
            {subModal.open && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                                <PlusCircle className="w-5 h-5 text-indigo-500" /> Ajouter un substitut
                            </h3>
                            <button onClick={() => setSubModal({ open: false, matId: null, matName: null, manque: 0 })} className="p-2 hover:bg-slate-100 rounded-full">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="mb-2 text-sm text-slate-600 font-bold px-1">
                            Manque constaté pour <span className="text-indigo-600">{subModal.matName}</span> : {subModal.manque}
                        </div>
                        <div className="mb-4">
                            <label className="text-xs font-bold text-slate-500 uppercase">Rechercher dans le Magasin</label>
                            <div className="relative mt-1">
                                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                                <input className="w-full pl-9 pr-3 py-2 bg-slate-50 border rounded-lg text-sm" placeholder="Nom ou référence..." value={subSearch} onChange={e => setSubSearch(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto min-h-[200px] border rounded-lg divide-y bg-slate-50">
                            {(magasinData.length > 0 ? magasinData.filter(m => (m.nom || m.designation || '').toLowerCase().includes(subSearch.toLowerCase())) : []).map(mItem => (
                                <div key={mItem.id} className="p-3 bg-white hover:bg-slate-50 flex justify-between items-center text-sm cursor-pointer transition-colors hover:shadow-sm" onClick={() => {
                                    const qtyStr = prompt(`Quelle quantité prélever de "${mItem.nom || mItem.designation}" en stock (${mItem.stockActuel || 0}) ?\n(Nécessaire : ${subModal.manque})`, subModal.manque.toString());
                                    if (qtyStr) {
                                        const q = parseFloat(qtyStr.replace(/-/g, ''));
                                        if (!isNaN(q) && q > 0) {
                                            setSubstitutes(prev => [...prev, { originalMatId: subModal.matId!, subId: mItem.id, qty: q, subName: mItem.nom || mItem.designation }]);
                                            setSubModal({ open: false, matId: null, matName: null, manque: 0 });
                                        }
                                    }
                                }}>
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800">{mItem.nom || mItem.designation}</div>
                                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">Ref: {mItem.reference} | Categ: {mItem.categorie}</div>
                                    </div>
                                    <div className="text-right ml-3">
                                        <div className={`font-black ${(mItem.stockActuel || 0) > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>{mItem.stockActuel || 0} <span className="text-xs font-medium">{mItem.unite || ''}</span></div>
                                        <div className={`text-[10px] font-bold ${(mItem.stockActuel || 0) > 0 ? 'text-slate-400' : 'text-slate-300'}`}>{(mItem.stockActuel || 0) > 0 ? 'En stock' : 'Stock 0'}</div>
                                    </div>
                                </div>
                            ))}
                            {magasinData.length === 0 && (
                                <div className="p-6 text-center">
                                    <div className="text-sm text-slate-400 font-bold mb-3">Aucun produit dans le magasin</div>
                                    <button onClick={() => setShowQuickAddModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 shadow-md transition-colors inline-flex items-center gap-1.5">
                                        <Plus className="w-3.5 h-3.5" /> Ajouter au Magasin
                                    </button>
                                </div>
                            )}
                            {magasinData.length > 0 && magasinData.filter(m => (m.nom || m.designation || '').toLowerCase().includes(subSearch.toLowerCase())).length === 0 && (
                                <div className="p-6 text-center">
                                    <div className="text-sm text-slate-400 font-bold mb-3">Aucun résultat pour "{subSearch}"</div>
                                    <button onClick={() => setShowQuickAddModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 shadow-md transition-colors inline-flex items-center gap-1.5">
                                        <Plus className="w-3.5 h-3.5" /> Ajouter au Magasin
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="mt-3 flex justify-center">
                            <button onClick={() => setShowQuickAddModal(true)} className="text-[11px] text-indigo-600 font-bold hover:text-indigo-800 transition-colors flex items-center gap-1">
                                <Plus className="w-3.5 h-3.5" /> Ajouter un nouveau produit au magasin
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QUICK ADD MAGASIN MODAL */}
            {showQuickAddModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowQuickAddModal(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                                <Plus className="w-4 h-4 text-indigo-500" /> Ajouter au Magasin
                            </h3>
                            <button onClick={() => setShowQuickAddModal(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto p-1">
                            <div className="flex flex-col items-center justify-center mb-3">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 w-full">Photo du produit</label>
                                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden relative cursor-pointer hover:bg-slate-100 transition-colors">
                                    {quickAddForm.image ? (
                                        <img src={quickAddForm.image} className="w-full h-full object-cover" alt="preview" />
                                    ) : (
                                        <div className="flex flex-col items-center text-slate-400">
                                            <Package className="w-5 h-5 mb-0.5 opacity-50" />
                                            <span className="text-[8px] font-bold uppercase">Ajouter</span>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Désignation / Nom *</label>
                                <input type="text" value={quickAddForm.nom || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, nom: e.target.value })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-indigo-200 bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-300 font-bold" placeholder="Ex: Tissu Denim 12oz" />
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Référence</label>
                                    <input type="text" value={quickAddForm.reference || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, reference: e.target.value })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-indigo-200 bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-300" placeholder="Ex: REF-001" />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Catégorie</label>
                                    <select value={quickAddForm.categorie || 'tissu'} onChange={(e) => setQuickAddForm({ ...quickAddForm, categorie: e.target.value })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-indigo-200 bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-300">
                                        {['tissu', 'fil', 'bouton', 'fermeture', 'etiquette', 'emballage', 'autre'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="w-1/3">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Unité</label>
                                    <select value={quickAddForm.unite || 'm'} onChange={(e) => setQuickAddForm({ ...quickAddForm, unite: e.target.value })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-indigo-200 bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-300">
                                        {['m', 'kg', 'piece', 'cone', 'boite'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Prix U. (DH)</label>
                                    <input type="number" min="0" step="0.01" value={quickAddForm.prixUnitaire || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, prixUnitaire: Number(e.target.value) })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-indigo-200 bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-300 text-indigo-700 font-black" />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Stock Initial</label>
                                    <input type="number" min="0" value={quickAddForm.stockActuel || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, stockActuel: Number(e.target.value) })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-indigo-200 bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-300" />
                                </div>
                            </div>
                            <div className="pt-2 border-t border-slate-100">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Fournisseur</label>
                                <input type="text" value={quickAddForm.fournisseurNom || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, fournisseurNom: e.target.value })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-indigo-200 bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-300" placeholder="Nom du fournisseur" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Délai Livraison (Jours)</label>
                                <input type="number" min="0" value={quickAddForm.fournisseurDelaiLivraisonJours || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, fournisseurDelaiLivraisonJours: Number(e.target.value) })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-indigo-200 bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-300" placeholder="Ex: 14" />
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end gap-2">
                            <button onClick={() => setShowQuickAddModal(false)} className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Annuler</button>
                            <button onClick={handleQuickAdd} className="px-5 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 shadow-md transition-colors">Enregistrer</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header Section */}
            <div className={`px-5 min-h-[3rem] py-2.5 border-b flex flex-col md:flex-row justify-between items-center gap-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100'}`}>
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    <div>
                        <h2 className={`text-[13px] font-semibold tracking-tight ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>{t.needs}</h2>
                        <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Estimation des coûts globaux</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {/* Waste Input */}
                    <div className={`flex items-center gap-2 h-8 rounded-md px-2.5 border transition-all focus-within:ring-2 focus-within:ring-slate-100 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-slate-50/60 border-slate-200'}`}>
                        <span className={`text-[11px] font-medium ${textSecondary}`}>{t.waste}</span>
                        <div className="h-4 w-px bg-slate-200 dark:bg-gray-700"></div>
                        <input
                            type="number"
                            min="0"
                            value={wasteRate}
                            onChange={(e) => setWasteRate(Math.max(0, parseFloat(e.target.value.replace(/-/g, '')) || 0))}
                            className={`w-10 text-center text-[13px] font-semibold tabular-nums text-slate-900 bg-transparent outline-none ${darkMode ? 'text-slate-200' : ''}`}
                        />
                        <Percent className="w-3 h-3 text-slate-400" strokeWidth={1.75} />
                    </div>

                    <div className={`flex items-center gap-2 h-8 rounded-md px-2.5 border transition-all focus-within:ring-2 focus-within:ring-slate-100 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-slate-50/60 border-slate-200'}`}>
                        <span className={`text-[11px] font-medium ${textSecondary}`}>Qté Totale</span>
                        <div className="h-4 w-px bg-slate-200 dark:bg-gray-700"></div>
                        <input
                            type="number"
                            min="1"
                            value={orderQty}
                            onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value.replace(/-/g, '')) || 0))}
                            className={`w-14 text-center text-[13px] font-semibold tabular-nums text-slate-900 bg-transparent outline-none ${darkMode ? 'text-slate-200' : ''}`}
                        />
                        <ShoppingCart className="w-3 h-3 text-slate-400" strokeWidth={1.75} />
                    </div>
                </div>
            </div>

            <div className="p-5 space-y-5">

                {/* Purchasing Table */}
                <div className={`rounded-lg border overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-slate-200'}`}>
                    <div className={`px-4 h-9 flex items-center text-[11px] font-medium uppercase tracking-wide border-b ${darkMode ? 'bg-gray-800 text-slate-400 border-gray-700' : 'bg-slate-50/60 text-slate-500 border-slate-100'}`}>
                        Détail des Achats (Matière Première)
                    </div>
                    <div className="md:overflow-x-auto">
                    <table className="w-full block md:table text-[13px]">
                        <thead className={`hidden md:table-header-group ${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-white text-slate-500'} font-medium border-b ${darkMode ? 'border-gray-700' : 'border-slate-100'} text-[11px] uppercase tracking-wide`}>
                            <tr>
                                <th className="px-4 py-2.5 text-left font-medium">{t.matName}</th>
                                <th className="px-4 py-2.5 text-center font-medium">{t.price}</th>
                                <th className="px-4 py-2.5 text-center font-medium">Besoin Total</th>
                                <th className="px-4 py-2.5 text-center font-medium border-l border-slate-100 bg-slate-50/40">En Stock</th>
                                <th className="px-4 py-2.5 text-center font-medium bg-slate-50/40">Manque</th>
                                <th className="px-4 py-2.5 text-center font-medium bg-slate-50/40">Fournisseur / Délais</th>
                                <th className="px-4 py-2.5 text-right font-medium text-slate-700 border-l border-slate-100">{t.total}</th>
                            </tr>
                        </thead>
                        <tbody className={`block md:table-row-group md:divide-y text-xs ${darkMode ? 'divide-gray-800' : 'divide-slate-100'}`}>
                            {purchasingData.map((m) => {
                                const mItem = magasinData.find(x => x.nom === m.name || x.designation === m.name);
                                const originalStockActuel = mItem ? (mItem.stockActuel || 0) : 0;
                                const qtyRequired = m.qtyToBuy;
                                
                                // Handling substitutes
                                const rowSubs = substitutes.filter(s => s.originalMatId === m.id);
                                const totalSubQty = rowSubs.reduce((acc, s) => acc + s.qty, 0);
                                
                                const manque = Math.max(0, qtyRequired - originalStockActuel - totalSubQty);
                                const fournisseur = mItem ? (mItem.fournisseurNom || mItem.fournisseur) : null;
                                const delai = mItem ? (mItem.fournisseurDelaiLivraisonJours || mItem.delaiLivraison) : null;
                                const hasAlert = manque > 0;

                                return (
                                    <React.Fragment key={m.id}>
                                        <tr className={`block md:table-row border border-slate-200 rounded-xl mb-3 p-2 md:p-0 md:mb-0 md:border-0 md:rounded-none ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-indigo-50/30'} transition-colors ${rowSubs.length > 0 ? 'md:bg-indigo-50/10' : ''}`}>
                                            <td className={`block md:table-cell px-4 py-2 md:py-3 font-semibold md:font-medium text-[13px] md:text-xs ${textPrimary}`}>
                                                {m.name}
                                                {m.unit === 'bobine' && <span className="text-[10px] text-slate-400 block font-normal">({m.threadMeters}m / bobine)</span>}
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center ${textSecondary}`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.price}</span>
                                                <span>{isExport ? '0 (Fourni)' : `${m.unitPrice} ${currency}`}</span>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center ${textSecondary}`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">Besoin Total</span>
                                                <span title={`(${m.qty} × ${orderQty}) + ${wasteRate}%`} className="font-bold">
                                                    {fmt(m.qtyToBuy)} {m.unit}
                                                </span>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center md:border-l ${originalStockActuel > 0 ? 'text-emerald-600' : 'text-slate-400'} font-bold md:bg-slate-50/30`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">En Stock</span>
                                                <span>{fmt(originalStockActuel)} {m.unit}</span>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center font-bold md:bg-slate-50/30 ${hasAlert ? 'text-rose-600' : 'text-slate-300'}`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">Manque</span>
                                                <div className="flex flex-row md:flex-col items-center justify-end md:justify-center gap-1">
                                                    <div className="flex items-center gap-1">
                                                        {hasAlert && <AlertTriangle className="w-3 h-3" />}
                                                        {fmt(manque)} {m.unit}
                                                    </div>
                                                    {hasAlert && (
                                                        <button onClick={() => setSubModal({ open: true, matId: m.id, matName: m.name, manque })} className="md:mt-0.5 text-[9px] px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded hover:bg-rose-200 uppercase tracking-widest font-black transition-colors active:scale-95 shadow-sm">
                                                            + Substitut
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center md:bg-slate-50/30`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">Fournisseur</span>
                                                {fournisseur ? (
                                                    <div className="flex flex-row md:flex-col items-center gap-1">
                                                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded uppercase tracking-wider">{fournisseur}</span>
                                                        {delai != null && <span className="text-[10px] text-slate-500 flex items-center gap-1 md:mt-1"><Truck className="w-3 h-3" /> {delai} jours</span>}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 mt-1 pt-2 md:mt-0 md:pt-3 border-t md:border-t-0 border-slate-100 md:text-right font-bold ${textPrimary} md:border-l`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.total}</span>
                                                <div className="flex items-center justify-end gap-1 cursor-help" title={isExport ? "Fourni par le client (0 DH)" : `${m.qtyToBuy} × ${m.unitPrice} = ${fmt(m.lineCost)}`}>
                                                    {isExport ? 0 : fmt(m.lineCost)} {currency}
                                                </div>
                                            </td>
                                        </tr>
                                        {rowSubs.map((sub, idx) => (
                                            <tr key={`${m.id}-sub-${idx}`} className="block md:table-row bg-amber-50/60 border border-dashed md:border-0 md:border-t border-amber-200 rounded-xl md:rounded-none mb-3 md:mb-0 p-2 md:p-0">
                                                <td className="block md:table-cell px-4 py-2 text-[11px] text-amber-800 flex items-center gap-2 font-bold">
                                                    <div className="w-3 h-3 border-l-2 border-b-2 border-amber-400 md:ml-4 rounded-bl"></div>
                                                    Substitut: {sub.subName}
                                                </td>
                                                <td className="hidden md:table-cell px-4 py-2 text-center text-amber-600/70">—</td>
                                                <td className="flex md:table-cell items-center justify-between px-4 py-1.5 md:py-2 md:text-center font-bold text-amber-600">
                                                    <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-amber-700/60">Besoin Total</span>
                                                    <span>+{fmt(sub.qty)} {m.unit}</span>
                                                </td>
                                                <td className="hidden md:table-cell px-4 py-2 border-l bg-slate-50/10"></td>
                                                <td className="hidden md:table-cell px-4 py-2 bg-slate-50/10"></td>
                                                <td className="hidden md:table-cell px-4 py-2 bg-slate-50/10"></td>
                                                <td className="flex md:table-cell items-center justify-end px-4 py-1.5 md:py-2 md:border-l md:text-right">
                                                    <button onClick={() => setSubstitutes(prev => prev.filter(x => x !== sub))} className="text-[10px] font-bold text-rose-500 hover:text-rose-700 px-2 py-0.5 bg-rose-50 hover:bg-rose-100 rounded transition-colors shadow-sm">Retirer</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                    </div>
                </div>

                {/* Per-Pidido Breakdown */}
                {pididoBreakdown.length > 0 && (
                    <div className={`rounded-lg border overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-slate-200'}`}>
                        <button
                            onClick={() => setShowPididoBreakdown(!showPididoBreakdown)}
                            className={`w-full px-4 h-9 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide border-b ${darkMode ? 'bg-gray-800 text-slate-400 border-gray-700' : 'bg-slate-50/60 text-slate-500 border-slate-100'}`}
                        >
                            <span className="flex items-center gap-2">
                                <Palette className="w-3.5 h-3.5" strokeWidth={1.75} />
                                Achats par PIDIDO
                                <span className="text-[10px] font-normal lowercase normal-case text-slate-400">
                                    ({pididoBreakdown.length} couleurs)
                                </span>
                            </span>
                            {showPididoBreakdown ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        {showPididoBreakdown && (
                            <div className="p-3 space-y-2">
                                {pididoBreakdown.map(pg => (
                                    <div key={pg.colorId} className={`rounded-lg border p-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full border border-slate-300" style={{ backgroundColor: pg.colorName }} />
                                                <span className={`text-[13px] font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{pg.colorName}</span>
                                                <span className="text-[11px] text-slate-400 font-medium">{pg.pieces} pcs</span>
                                            </div>
                                            <span className={`text-[11px] font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                                {fmt(pg.materials.reduce((s, m) => s + m.cost, 0))} {currency}
                                            </span>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-[12px]">
                                                <thead>
                                                    <tr className={`text-[10px] uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                                        <th className="text-left px-2 py-1 font-medium">Matière</th>
                                                        <th className="text-center px-2 py-1 font-medium">Qté/Pièce</th>
                                                        <th className="text-center px-2 py-1 font-medium">Besoin ({pg.pieces}pcs)</th>
                                                        <th className="text-center px-2 py-1 font-medium">Avec {wasteRate}%</th>
                                                        <th className="text-center px-2 py-1 font-medium">Fournisseur</th>
                                                        <th className="text-center px-2 py-1 font-medium">Statut</th>
                                                        <th className="text-right px-2 py-1 font-medium">Coût HT</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-slate-100'}`}>
                                                    {pg.materials.map(m => (
                                                        <tr key={m.id} className={`${darkMode ? 'hover:bg-gray-700' : 'hover:bg-indigo-50/30'} transition-colors cursor-pointer`} onClick={() => setSelectedMaterial({ ...m, colorName: pg.colorName })}>
                                                            <td className="px-2 py-1.5 font-medium text-slate-700">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="truncate max-w-[120px]">{m.name}</span>
                                                                    {m.unit === 'bobine' && <span className="text-[10px] text-slate-400">({m.threadMeters}m/bobine)</span>}
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">{m.qty} {m.unit}</td>
                                                            <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">{m.baseQty < 10 ? m.baseQty.toFixed(2) : Math.round(m.baseQty)} {m.unit}</td>
                                                            <td className="px-2 py-1.5 text-center tabular-nums font-medium text-slate-700">{m.buyQty} {m.unit}</td>
                                                            <td className="px-2 py-1.5 text-center">
                                                                {m.fournisseur ? (
                                                                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded uppercase tracking-wider">{m.fournisseur}</span>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center">
                                                                {m.isDelivered ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                                        <CheckCircle className="w-3 h-3" /> Stock OK
                                                                    </span>
                                                                ) : m.isPartial ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                                                        <AlertTriangle className="w-3 h-3" /> Partiel
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                                                                        <Clock className="w-3 h-3" /> En attente
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800">{fmt(m.cost)} {currency}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Summary Dashboard Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

                    {/* Card 1: Total Material */}
                    <div className={`p-4 rounded-lg border flex flex-col justify-between ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <span className={`text-[11px] font-medium mb-1 block ${textSecondary}`}>{t.realBudget}</span>
                                <div className="flex items-baseline gap-1">
                                    <h3 className={`text-[22px] font-semibold tabular-nums ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                                        {fmt(totalPurchasingMatCost)}
                                    </h3>
                                    <span className="text-[11px] font-normal text-slate-400">{currency}</span>
                                </div>
                            </div>
                            <Banknote className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                        </div>
                        <div className={`mt-3 pt-3 border-t text-[11px] flex justify-between ${darkMode ? 'border-gray-700 text-gray-500' : 'border-slate-100 text-slate-400'}`}>
                            <span>Articles : {purchasingData.length}</span>
                            <span title="Formula: Sum(QtyToBuy * Price)">Achats réels</span>
                        </div>
                    </div>

                    {/* Card 2: Total Labor */}
                    <div className={`p-4 rounded-lg border flex flex-col justify-between ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <span className={`text-[11px] font-medium mb-1 block ${textSecondary}`}>{t.laborCost} (Total)</span>
                                <div className="flex items-baseline gap-1">
                                    <h3 className={`text-[22px] font-semibold tabular-nums ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                                        {fmt(laborCost * orderQty)}
                                    </h3>
                                    <span className="text-[11px] font-normal text-slate-400">{currency}</span>
                                </div>
                            </div>
                            <Clock className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                        </div>
                        <div className={`mt-3 pt-3 border-t text-[11px] flex justify-between ${darkMode ? 'border-gray-700 text-gray-500' : 'border-slate-100 text-slate-400'}`}>
                            <span>{orderQty} pcs × {fmt(laborCost)}/pc</span>
                            <span title={`Formula: ${laborCost} * ${orderQty}`}>Main d'œuvre</span>
                        </div>
                    </div>

                    {/* Card 3: Grand Total */}
                    <div className="p-4 rounded-lg bg-slate-900 text-white flex flex-col justify-between">
                        <div>
                            <span className="text-[11px] font-medium text-slate-400 mb-1 block">{t.totalBudget}</span>
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-[24px] font-semibold tracking-tight tabular-nums">{fmt(totalProjectCost)}</h3>
                                <span className="text-[12px] font-normal text-slate-400">{currency}</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center text-[11px] text-slate-300">
                            <span>Coût de revient / pièce</span>
                            <span className="bg-white/10 px-2 py-0.5 rounded font-medium tabular-nums">{fmt(totalProjectCost / orderQty)} {currency}</span>
                        </div>
                    </div>

                </div>

                {/* Confirm & Deduct Action */}
                <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-gray-800">
                    <button
                        onClick={deductStock}
                        className="inline-flex items-center gap-1.5 h-9 px-4 bg-slate-900 text-white text-[12px] font-medium rounded-md hover:bg-slate-800 transition-colors"
                    >
                        <ShoppingCart className="w-3.5 h-3.5" strokeWidth={1.75} />
                        Confirmer & Déduire Stock
                    </button>
                </div>
            </div>

            {/* Material Detail Modal */}
            {selectedMaterial && (
                <MaterialDetailModal
                    material={{
                        name: selectedMaterial.name,
                        unitPrice: selectedMaterial.unitPrice,
                        qtyToBuy: selectedMaterial.buyQty,
                        unit: selectedMaterial.unit,
                        lineCost: selectedMaterial.cost,
                        fournisseur: selectedMaterial.fournisseur || undefined,
                        threadMeters: selectedMaterial.threadMeters,
                        colorName: selectedMaterial.colorName,
                        pieces: selectedMaterial.pieces,
                    }}
                    currency={currency}
                    magasinData={magasinData}
                    onClose={() => setSelectedMaterial(null)}
                />
            )}
        </div >
    );
};

export default OrderSimulation;
