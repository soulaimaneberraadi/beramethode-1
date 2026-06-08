import React, { useState, useEffect } from 'react';
import { Package, Plus, Trash2, Info, Building2, Search } from 'lucide-react';
import { Material } from '../types';
import { fmt } from '../constants';

interface MaterialsListProps {
    t: any;
    currency: string;
    darkMode: boolean;
    materials: Material[];
    addMaterial: () => void;
    updateMaterial: (id: number, field: string, value: string | number | any) => void;
    deleteMaterial: (id: number) => void;
    bgCard: string;
    bgCardHeader: string;
    textPrimary: string;
    textSecondary: string;
    tableHeader: string;
    tableRowHover: string;
    totalMaterials: number;
}

interface MagasinItem {
    id: string;
    nom: string;
    designation?: string;
    reference?: string;
    prixUnitaire?: number;
    prix?: number;
    stockActuel?: number;
    stockAlerte?: number;
    unite?: string;
    categorie?: string;
    fournisseur?: string;
    fournisseurNom?: string;
    fournisseurDelaiLivraisonJours?: number;
    image?: string;
}

const MaterialsList: React.FC<MaterialsListProps> = ({
    t, currency, darkMode, materials, addMaterial, updateMaterial, deleteMaterial,
    bgCard, bgCardHeader, textPrimary, textSecondary, tableHeader, tableRowHover,
    totalMaterials
}) => {
    const optionStyle = darkMode ? { backgroundColor: '#1f2937', color: 'white' } : {};
    const inputStyle = `w-full rounded-md px-2 py-1.5 text-[13px] outline-none transition-all focus:ring-2 focus:ring-slate-100 ${darkMode ? 'bg-gray-700 text-white border-gray-600 focus:bg-gray-600' : 'bg-slate-50/60 border-slate-200 text-slate-900 focus:bg-white focus:border-slate-300'} border`;

    const [magasinData, setMagasinData] = useState<MagasinItem[]>([]);
    const [focusedRow, setFocusedRow] = useState<number | null>(null);
    const [focusedRefRow, setFocusedRefRow] = useState<number | null>(null);

    // --- QUICK ADD TO MAGASIN STATE ---
    const [showQuickAddModal, setShowQuickAddModal] = useState(false);
    const [quickAddForm, setQuickAddForm] = useState<Partial<MagasinItem>>({ unite: 'm', categorie: 'tissu' });
    const [quickAddTargetRow, setQuickAddTargetRow] = useState<number | null>(null);

    const handleQuickAdd = () => {
        if (!quickAddForm.nom) return;
        const newItem: MagasinItem = {
            id: Date.now().toString(),
            nom: quickAddForm.nom,
            designation: quickAddForm.nom, // keep in sync with Magasin.tsx structure
            reference: quickAddForm.reference || `REF-${Math.floor(Math.random() * 10000)}`,
            prixUnitaire: Number(quickAddForm.prixUnitaire) || 0,
            stockActuel: Number(quickAddForm.stockActuel) || 0,
            stockAlerte: Number(quickAddForm.stockAlerte) || 10,
            unite: quickAddForm.unite || 'm',
            categorie: quickAddForm.categorie as any,
            fournisseurNom: quickAddForm.fournisseurNom || '',
            fournisseurDelaiLivraisonJours: Number(quickAddForm.fournisseurDelaiLivraisonJours) || 0,
            image: quickAddForm.image || ''
        };

        // Save to original array
        const updatedMagasin = [newItem, ...magasinData];
        setMagasinData(updatedMagasin);
        localStorage.setItem('beramethode_magasin', JSON.stringify(updatedMagasin));
        // Also sync to server
        fetch('/api/magasin/products', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...newItem, reference: newItem.reference || newItem.id, designation: newItem.nom }),
        }).catch(() => {});

        // Update current row in Cost Calculator
        if (quickAddTargetRow !== null) {
            updateMaterial(quickAddTargetRow, 'IMPORT_MAGASIN', { ...newItem, prix: newItem.prixUnitaire });
        }

        // Close and reset
        setShowQuickAddModal(false);
        setQuickAddForm({ unite: 'm', categorie: 'tissu' });
        setQuickAddTargetRow(null);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setQuickAddForm(prev => ({ ...prev, image: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    useEffect(() => {
        // Try server first, fall back to localStorage for guest mode
        fetch('/api/magasin/products', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    setMagasinData(data.map((p: any) => ({
                        id: p.id,
                        nom: p.designation || p.nom || '',
                        designation: p.designation || p.nom || '',
                        reference: p.reference,
                        prixUnitaire: p.prixUnitaire,
                        stockActuel: p.stockActuel,
                        stockAlerte: p.stockAlerte,
                        unite: p.unite,
                        categorie: p.categorie,
                        fournisseurNom: p.fournisseurNom,
                        image: p.photo,
                    })));
                } else {
                    const ls = localStorage.getItem('beramethode_magasin');
                    if (ls) setMagasinData(JSON.parse(ls));
                }
            })
            .catch(() => {
                try {
                    const ls = localStorage.getItem('beramethode_magasin');
                    if (ls) setMagasinData(JSON.parse(ls));
                } catch {}
            });
    }, []);

    return (
        <>
            {/* QUICK ADD MODAL */}
            {showQuickAddModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                                <Plus className="w-5 h-5 text-indigo-500" /> Ajouter au Magasin
                            </h3>
                            <button onClick={() => setShowQuickAddModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                                <Trash2 className="w-4 h-4" /> {/* Or an X icon, but keeping imports minimal */}
                            </button>
                        </div>

                        <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1 py-2">
                            {/* Photo Upload */}
                            <div className="flex flex-col items-center justify-center mb-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2 w-full">Photo du produit</label>
                                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden relative cursor-pointer hover:bg-slate-100 transition-colors">
                                    {quickAddForm.image ? (
                                        <img src={quickAddForm.image} className="w-full h-full object-cover" alt="preview" />
                                    ) : (
                                        <div className="flex flex-col items-center text-slate-400">
                                            <Package className="w-6 h-6 mb-1 opacity-50" />
                                            <span className="text-[9px] font-bold uppercase">Ajouter</span>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Désignation / Nom *</label>
                                <input type="text" value={quickAddForm.nom || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, nom: e.target.value })} className={`${inputStyle} font-bold`} placeholder="Ex: Tissu Denim 12oz" />
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Catégorie</label>
                                    <select value={quickAddForm.categorie || 'tissu'} onChange={(e) => setQuickAddForm({ ...quickAddForm, categorie: e.target.value })} className={inputStyle}>
                                        {['tissu', 'fil', 'bouton', 'fermeture', 'etiquette', 'emballage', 'autre'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="w-1/3">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Unité</label>
                                    <select value={quickAddForm.unite || 'm'} onChange={(e) => setQuickAddForm({ ...quickAddForm, unite: e.target.value })} className={inputStyle}>
                                        {['m', 'kg', 'piece', 'cone', 'boite'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prix U. ({currency})</label>
                                    <input type="number" min="0" step="0.01" value={quickAddForm.prixUnitaire || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, prixUnitaire: Number(e.target.value) })} className={`${inputStyle} text-indigo-700 font-black`} />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Stock Initial</label>
                                    <input type="number" min="0" value={quickAddForm.stockActuel || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, stockActuel: Number(e.target.value) })} className={inputStyle} />
                                </div>
                            </div>

                            {/* Supplier details added for Task 3 */}
                            <div className="pt-2 border-t border-slate-100">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fournisseur</label>
                                <input type="text" value={quickAddForm.fournisseurNom || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, fournisseurNom: e.target.value })} className={inputStyle} placeholder="Nom du fournisseur" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Délai Livraison (Jours)</label>
                                <input type="number" min="0" value={quickAddForm.fournisseurDelaiLivraisonJours || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, fournisseurDelaiLivraisonJours: Number(e.target.value) })} className={inputStyle} placeholder="Ex: 14" />
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setShowQuickAddModal(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Annuler</button>
                            <button onClick={handleQuickAdd} className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 shadow-md transition-colors w-full sm:w-auto">Enregistrer</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white overflow-visible">
                <div className="px-5 h-12 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                        <div>
                            <h2 className="text-[13px] font-semibold text-slate-900 tracking-tight">{t.materials}</h2>
                            <p className="text-[11px] text-slate-400">Ajoutez ou sélectionnez depuis le magasin</p>
                        </div>
                    </div>
                    <button onClick={addMaterial} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium transition-colors">
                        <Plus className="w-3.5 h-3.5" strokeWidth={2} /> {t.addMat}
                    </button>
                </div>

                <div className="overflow-visible">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className={`${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-slate-50/60 text-slate-500'} uppercase text-[10px] tracking-wide border-b ${darkMode ? 'border-gray-700' : 'border-slate-100'}`}>
                            <tr>
                                <th className="px-2 sm:px-4 py-2.5 font-medium w-1/3">{t.matName}</th>
                                <th className="px-2 sm:px-4 py-2.5 font-medium w-20 sm:w-32">{t.price} ({currency})</th>
                                <th className="px-2 sm:px-4 py-2.5 font-medium w-28 sm:w-48 text-center">{t.qtyUnit}</th>
                                <th className="px-2 sm:px-4 py-2.5 font-medium w-20 sm:w-32 text-right">{t.total}</th>
                                <th className="px-4 py-2.5 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-slate-100'}`}>
                            {materials.map((item) => {
                                const filteredMagasin = focusedRow === item.id
                                    ? magasinData.filter(m => {
                                        const searchName = (m.nom || m.designation || '').toLowerCase();
                                        const searchRef = (m.reference || '').toLowerCase();
                                        const searchCat = (m.categorie || '').toLowerCase();
                                        const query = (item.name || '').toLowerCase();
                                        return searchName.includes(query) || searchRef.includes(query) || searchCat.includes(query);
                                    })
                                    : [];

                                return (
                                    <tr key={item.id} className={`group ${tableRowHover} transition-colors`}>
                                        <td className="p-2 sm:p-3 align-middle relative">
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={item.name}
                                                    onChange={(e) => updateMaterial(item.id, 'name', e.target.value)}
                                                    onFocus={() => setFocusedRow(item.id)}
                                                    onBlur={() => setTimeout(() => setFocusedRow(null), 250)}
                                                    className={`${inputStyle} font-medium pr-8`}
                                                    placeholder="Rechercher matière..."
                                                />
                                                <Search className="w-3 h-3 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                                            </div>

                                            {/* Display details if we detect this is a Magasin item */}
                                            {(() => {
                                                const mMatch = magasinData.find(m => (m.nom || m.designation) === item.name);
                                                if (mMatch && !focusedRow) {
                                                    const stock = mMatch.stockActuel || 0;
                                                    const alerte = mMatch.stockAlerte || 0;
                                                    const isDanger = stock <= alerte;
                                                    const isZero = stock === 0;

                                                    return (
                                                        <div className="mt-2 flex items-start gap-3 p-2 bg-slate-50 border border-slate-100 rounded-lg shadow-sm animate-in fade-in slide-in-from-top-1">
                                                            {mMatch.image ? (
                                                                <img src={mMatch.image} className="w-12 h-12 rounded bg-white object-cover shadow-sm border border-slate-200" alt="Material" />
                                                            ) : (
                                                                <div className="w-12 h-12 rounded bg-slate-200 flex items-center justify-center text-slate-400 border border-slate-300">
                                                                    <Package className="w-6 h-6" />
                                                                </div>
                                                            )}
                                                            <div className="flex flex-col flex-1">
                                                                <div className="flex justify-between items-start">
                                                                    <span className="text-xs font-bold text-slate-700">{mMatch.reference || 'Aucune Réf'}</span>
                                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${isZero ? 'bg-red-100 text-red-700' : isDanger ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                                        Stock: {stock} {mMatch.unite}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between items-center mt-1">
                                                                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">{mMatch.categorie}</span>
                                                                    {(mMatch.fournisseurNom || item.fournisseur) && (
                                                                        <span className="text-[10px] text-blue-600 flex items-center gap-1 font-bold">
                                                                            <Building2 className="w-3 h-3" /> {mMatch.fournisseurNom || item.fournisseur}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                // Fallback to strict "fournisseur" display if not found in Magasin
                                                if (item.fournisseur && !mMatch && !focusedRow) {
                                                    return (
                                                        <div className="text-[10px] text-blue-600 mt-1.5 flex items-center gap-1 font-bold animate-in fade-in slide-in-from-top-1">
                                                            <Building2 className="w-3 h-3" /> {item.fournisseur}
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}

                                            {/* AUTOCOMPLETE DROPDOWN */}
                                            {focusedRow === item.id && (filteredMagasin.length > 0 || (item.name && filteredMagasin.length === 0)) && (
                                                <div className="absolute z-[100] left-3 right-3 top-[44px] bg-white border border-slate-200 rounded-lg shadow-xl max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1 flex flex-col">
                                                    {filteredMagasin.length > 0 ? (
                                                        filteredMagasin.map(m => {
                                                            const stock = m.stockActuel || 0;
                                                            const alerte = m.stockAlerte || 0;
                                                            const price = m.prixUnitaire || m.prix || 0;
                                                            const isDanger = stock <= alerte;
                                                            const isZero = stock === 0;

                                                            return (
                                                                <div
                                                                    key={m.id}
                                                                    className={`p-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 flex flex-col transition ${isZero ? 'opacity-70' : ''}`}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        updateMaterial(item.id, 'IMPORT_MAGASIN', { ...m, prix: price }); // pass normalized price
                                                                        setFocusedRow(null);
                                                                    }}
                                                                >
                                                                    <div className="flex justify-between items-start">
                                                                        <div className="flex flex-col">
                                                                            <span className={`font-bold text-sm ${isZero ? 'text-red-600 line-through' : 'text-slate-800'}`}>{m.nom || m.designation}</span>
                                                                            <span className="text-[10px] text-slate-400 font-mono mt-0.5">{m.reference || 'Aucune Réf'}</span>
                                                                        </div>
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="font-bold text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded mb-1">{price.toFixed(2)} {currency} / {m.unite || 'pc'}</span>
                                                                            <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${isZero ? 'bg-red-100 text-red-700' : isDanger ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                                                Stock: {stock} {m.unite}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    {m.fournisseur && (
                                                                        <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1 mt-1">
                                                                            <Building2 className="w-3 h-3" /> {m.fournisseur}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="p-3">
                                                            <div className="text-xs text-slate-500 text-center italic mb-3">
                                                                Aucune matière trouvée pour "{item.name}"
                                                            </div>
                                                            {item.name && item.name.length > 1 && (
                                                                <button
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        setQuickAddTargetRow(item.id);
                                                                        setQuickAddForm({ ...quickAddForm, nom: item.name });
                                                                        setShowQuickAddModal(true);
                                                                        setFocusedRow(null);
                                                                    }}
                                                                    className="w-full py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-xs rounded-lg hover:bg-indigo-100 hover:border-indigo-200 transition-colors flex items-center justify-center gap-2"
                                                                >
                                                                    <Plus className="w-3 h-3" /> Ajouter "{item.name}" au Magasin
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-2 sm:p-3 align-middle">
                                            <input
                                                type="number"
                                                min="0"
                                                value={item.unitPrice}
                                                onChange={(e) => updateMaterial(item.id, 'unitPrice', e.target.value)}
                                                className={`${inputStyle} text-center font-mono`}
                                            />
                                        </td>
                                        <td className="p-2 sm:p-3 align-middle">
                                            <div className="flex flex-col gap-2 items-center">
                                                <div className="flex items-center gap-2 w-full">
                                                    {item.unit === 'bobine' ? (
                                                        <div className={`flex-1 rounded-md px-2 py-1.5 text-center text-sm font-mono border ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-300' : 'bg-slate-50 border-slate-200 text-slate-600 shadow-inner'}`}>
                                                            {fmt(item.qty)}
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.001"
                                                            value={item.qty}
                                                            onChange={(e) => updateMaterial(item.id, 'qty', e.target.value)}
                                                            className={`${inputStyle} text-center flex-1 font-mono`}
                                                        />
                                                    )}
                                                    <select
                                                        value={item.unit}
                                                        onChange={(e) => updateMaterial(item.id, 'unit', e.target.value)}
                                                        className={`w-20 rounded-md px-2 py-1.5 text-sm outline-none border transition-all focus:ring-2 focus:ring-blue-500 cursor-pointer ${darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-slate-50 border-slate-300 text-slate-700 font-bold'}`}
                                                    >
                                                        <option value="m" style={optionStyle}>m</option>
                                                        <option value="pc" style={optionStyle}>pc</option>
                                                        <option value="kg" style={optionStyle}>kg</option>
                                                        <option value="g" style={optionStyle}>g</option>
                                                        <option value="bobine" style={optionStyle}>bobine</option>
                                                        <option value="cm" style={optionStyle}>cm</option>
                                                        <option value="cone" style={optionStyle}>cône</option>
                                                        <option value="l" style={optionStyle}>L</option>
                                                    </select>
                                                </div>
                                                {item.unit === 'bobine' && (
                                                    <>
                                                        <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded border shadow-sm w-full animate-in fade-in zoom-in duration-200 ${darkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-100'}`}>
                                                            <span className="text-[10px] text-blue-600 font-bold w-12">Fil (m):</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                placeholder="Métrage"
                                                                value={item.threadMeters || ''}
                                                                onChange={(e) => updateMaterial(item.id, 'threadMeters', e.target.value)}
                                                                className={`w-full text-xs font-mono border rounded px-1 outline-none text-center h-6 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-blue-200 text-slate-700'}`}
                                                            />
                                                            <span className="text-slate-400 text-xs font-bold">/</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                placeholder="Capacité"
                                                                value={item.threadCapacity || ''}
                                                                onChange={(e) => updateMaterial(item.id, 'threadCapacity', e.target.value)}
                                                                className={`w-full text-xs font-mono border rounded px-1 outline-none text-center h-6 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-blue-200 text-slate-700'}`}
                                                            />
                                                        </div>
                                                        {(item.threadColor || item.threadReference) && (
                                                            <div className="relative">
                                                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded border shadow-sm w-full ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                                                                    {item.threadColor && (
                                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">{item.threadColor}</span>
                                                                    )}
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Référence (ex: NM50, TEX25...)"
                                                                        value={item.threadReference || ''}
                                                                        onChange={(e) => updateMaterial(item.id, 'threadReference', e.target.value)}
                                                                        onFocus={() => setFocusedRefRow(item.id)}
                                                                        onBlur={() => setTimeout(() => setFocusedRefRow(null), 250)}
                                                                        className={`w-full text-[10px] border rounded px-1.5 py-0.5 outline-none ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
                                                                    />
                                                                </div>
                                                                {focusedRefRow === item.id && item.threadReference && (
                                                                    <div className={`absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border shadow-lg ${darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-slate-200'}`}>
                                                                        {magasinData.filter(m => {
                                                                            const ref = (m.reference || '').toLowerCase();
                                                                            const nom = (m.nom || m.designation || '').toLowerCase();
                                                                            const query = (item.threadReference || '').toLowerCase();
                                                                            return (ref.includes(query) || nom.includes(query)) && (m.categorie === 'fil' || !m.categorie);
                                                                        }).slice(0, 8).map(m => (
                                                                            <button
                                                                                key={m.id}
                                                                                onMouseDown={(e) => {
                                                                                    e.preventDefault();
                                                                                    updateMaterial(item.id, 'IMPORT_MAGASIN', { ...m, prix: m.prixUnitaire });
                                                                                    setFocusedRefRow(null);
                                                                                }}
                                                                                className={`w-full text-left px-2 py-1.5 text-[10px] hover:bg-blue-50 border-b last:border-0 ${darkMode ? 'hover:bg-gray-700 border-gray-700' : 'border-slate-100'}`}
                                                                            >
                                                                                <div className="flex justify-between items-center">
                                                                                    <span className="font-bold text-slate-700">{m.nom || m.designation}</span>
                                                                                    <span className="text-[9px] text-slate-400">{m.reference}</span>
                                                                                </div>
                                                                                <div className="flex justify-between items-center mt-0.5">
                                                                                    <span className="text-[9px] text-slate-500">{m.fournisseurNom || '—'}</span>
                                                                                    <span className={`text-[9px] font-bold ${(m.stockActuel || 0) === 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                                                                        Stock: {m.stockActuel || 0}
                                                                                    </span>
                                                                                </div>
                                                                            </button>
                                                                        ))}
                                                                        {magasinData.filter(m => {
                                                                            const ref = (m.reference || '').toLowerCase();
                                                                            const nom = (m.nom || m.designation || '').toLowerCase();
                                                                            const query = (item.threadReference || '').toLowerCase();
                                                                            return (ref.includes(query) || nom.includes(query)) && (m.categorie === 'fil' || !m.categorie);
                                                                        }).length === 0 && (
                                                                            <div className="px-2 py-2 text-[10px] text-slate-400 text-center">
                                                                                Aucun fil trouvé dans le magasin
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-2 sm:p-3 align-middle text-right">
                                            <div
                                                className={`inline-flex items-center justify-end gap-1 text-[13px] font-semibold tabular-nums cursor-help ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}
                                                title={`${item.unitPrice} ${currency} × ${fmt(item.qty)} ${item.unit} = ${fmt(item.unitPrice * item.qty)} ${currency}`}
                                            >
                                                {fmt(item.unitPrice * item.qty)} <span className="text-[10px] font-normal text-slate-400">{currency}</span>
                                            </div>
                                        </td>
                                        <td className="p-2 sm:p-3 align-middle text-center">
                                            <button onClick={() => deleteMaterial(item.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {materials.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-slate-400 text-sm font-medium">
                                        <div className="flex flex-col items-center gap-3">
                                            <Package className="w-12 h-12 opacity-20" />
                                            Aucune matière ajoutée pour ce modèle.<br />Cliquez sur <span className="text-indigo-600 font-bold">Ajouter Matière</span> ou recherchez dans le magasin.
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className={`border-t ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-slate-50/60 border-slate-100 text-slate-800'}`}>
                            <tr>
                                <td colSpan={3} className="px-4 py-3 text-end text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    {t.totalMat || "Total Matière"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <span className="inline-flex items-center justify-end gap-1 text-[14px] font-semibold tabular-nums text-slate-900">
                                        {fmt(totalMaterials)} <span className="text-[10px] font-normal text-slate-400">{currency}</span>
                                    </span>
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </>
    );
};

export default MaterialsList;
