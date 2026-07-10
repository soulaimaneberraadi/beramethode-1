import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Percent, Banknote, Clock, Package, TrendingUp, Info, AlertTriangle, Truck, Plus, PlusCircle, Search, X, ChevronDown, ChevronRight, Palette, CheckCircle } from 'lucide-react';
import { PurchasingData, Material, FicheData } from '../types';
import { fmt } from '../app/constants';
import MaterialDetailModal from './MaterialDetailModal';
import NumberInput from './ui/NumberInput';
import { findMagasinItem, resolveStock } from '../lib/magasinMatch';
import { confirmReceptionLocal } from '../lib/confirmReception';
import FactureUploader from './FactureUploader';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

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
    modelId?: string;
    modelName?: string;
    onStockConfirmed?: () => void;
}

const OrderSimulation: React.FC<OrderSimulationProps> = ({
    t, currency, darkMode, orderQty, setOrderQty, wasteRate, setWasteRate,
    deductStock,
    purchasingData, totalPurchasingMatCost, laborCost,
    textSecondary, textPrimary, bgCard,
    isExport = false,
    materials = [], ficheData,
    modelId, modelName, onStockConfirmed,
}) => {
    const activeQtyToSimulate = orderQty;
    const { lang } = useLang();
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

    // Confirmation de réception (entrée stock + BR pour le Planning)
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; mat?: any; qty: string }>({ open: false, qty: '' });

    const handleConfirmReception = () => {
        const m = confirmModal.mat;
        const qty = Math.max(0, parseFloat(confirmModal.qty) || 0);
        if (!m || qty <= 0) return;
        const res = confirmReceptionLocal({
            materialName: m.name,
            qty,
            unit: m.unit,
            unitPrice: m.unitPrice,
            modelId: modelId || '',
            modelName,
            supplierName: m.fournisseur || null,
        });
        // Le stock opérationnel local pilote le statut → on rafraîchit directement.
        setMagasinData(res.updatedMagasin);
        onStockConfirmed?.();
        setConfirmModal({ open: false, qty: '' });
    };

    // Per-pidido: each color → its applicable materials with quantities + supplier info
    const pididoBreakdown = useMemo(() => {
        if (!ficheData?.colors?.length || !materials.length) return [];
        const gq = ficheData.gridQuantities || {};
        const sizeCount = (ficheData.sizes || []).length;
        // Le détail par PIDIDO doit suivre la quantité RÉELLE de la commande (orderQty),
        // exactement comme le tableau « Détail des Achats » au-dessus. La grille du modèle
        // (gridQuantities) ne sert qu'à répartir la commande entre les couleurs.
        const commandeTotal = Object.values(gq).reduce((acc: number, v) => acc + (Number(v) || 0), 0);
        const factor = commandeTotal > 0 ? (orderQty / commandeTotal) : 1;
        const seen = new Set<string>();
        return ficheData.colors.map(c => {
            if (seen.has(c.id)) return null;
            seen.add(c.id);
            let rawPieces = 0;
            for (let s = 0; s < sizeCount; s++) rawPieces += Number(gq[`${c.id}_${s}`] || 0);
            if (rawPieces <= 0) return null;
            // Pièces de cette couleur ramenées à la quantité réellement lancée.
            const scaledPieces = rawPieces * factor;
            const pieces = Math.round(scaledPieces);
            const colorMaterials = materials.filter(m => {
                if (m.scope?.colors?.length) return m.scope.colors.includes(c.id);
                if (m.threadColor) return m.threadColor === c.name;
                return true;
            }).map(m => {
                const baseQty = m.qty * scaledPieces;
                const withWaste = baseQty * (1 + wasteRate / 100);
                const buyQty = (m.unit === 'bobine' || m.unit === 'pc') ? Math.ceil(withWaste) : parseFloat(withWaste.toFixed(2));
                const cost = isExport ? 0 : buyQty * m.unitPrice;
                // Statut stock fiable (lien id/référence/nom) + nb de pièces couvrables.
                const st = resolveStock(m, magasinData, buyQty, 0, pieces);
                return {
                    ...m, pieces, baseQty, withWaste, buyQty, cost,
                    fournisseur: st.fournisseur, delaiLivraison: st.delaiLivraison,
                    stockActuel: st.stockActuel, manque: st.manque, piecesCouvertes: st.piecesCouvertes,
                    isDelivered: st.isDelivered, isPartial: st.isPartial,
                };
            });
            if (!colorMaterials.length) return null;
            return { colorId: c.id, colorName: c.name, pieces, materials: colorMaterials };
        }).filter(Boolean) as Array<{
            colorId: string; colorName: string; pieces: number;
            materials: Array<Material & { pieces: number; baseQty: number; withWaste: number; buyQty: number; cost: number; fournisseur: string | null; delaiLivraison: number | null; stockActuel: number; manque: number; piecesCouvertes: number; isDelivered: boolean; isPartial: boolean }>;
        }>;
    }, [ficheData, materials, wasteRate, isExport, magasinData, orderQty]);

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
        <div className={`rounded-lg border overflow-hidden relative ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>

            {/* Substitute Modal */}
            {subModal.open && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm w-full max-w-lg p-6 overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-slate-800 dark:text-dk-text text-lg flex items-center gap-2">
                                <PlusCircle className="w-5 h-5 text-slate-400 dark:text-dk-muted" /> {tx(lang,{fr:'Ajouter un substitut',ar:'إضافة بديل',en:'Add substitute',es:'Añadir sustituto',pt:'Adicionar substituto',tr:'Yedek ekle'})}
                            </h3>
                            <button onClick={() => setSubModal({ open: false, matId: null, matName: null, manque: 0 })} className="p-2 hover:bg-slate-100 rounded-full">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                            <div className="mb-2 text-sm text-slate-600 dark:text-dk-text-soft font-bold px-1">
                                {tx(lang,{fr:'Manque constaté pour',ar:'النقص المسجل لـ',en:'Shortfall for',es:'Déficit para',pt:'Falta constatada para',tr:'Eksiklik tespit edilen'})} <span className="text-[#2149C1]">{subModal.matName}</span> : {subModal.manque}
                            </div>
                        <div className="mb-4">
                            <label className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Rechercher dans le Magasin',ar:'البحث في المخزن',en:'Search in Store',es:'Buscar en Almacén',pt:'Pesquisar no Armazém',tr:'Mağazada Ara'})}</label>
                            <div className="relative mt-1">
                                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-dk-muted" />
                                <input className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-dk-bg border rounded-lg text-sm" placeholder={tx(lang,{fr:'Nom ou référence...',ar:'الاسم أو المرجع...',en:'Name or reference...',es:'Nombre o referencia...',pt:'Nome ou referência...',tr:'Ad veya referans...'})} value={subSearch} onChange={e => setSubSearch(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto min-h-[200px] border rounded-lg divide-y bg-slate-50 dark:bg-dk-bg">
                            {(magasinData.length > 0 ? magasinData.filter(m => (m.nom || m.designation || '').toLowerCase().includes(subSearch.toLowerCase())) : []).map(mItem => (
                                <div key={mItem.id} className="p-3 bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex justify-between items-center text-sm cursor-pointer transition-colors hover:shadow-sm" onClick={() => {
                                    const qtyStr = prompt(tx(lang,{fr:'Quelle quantité prélever de "',ar:'كمية السحب من "',en:'What quantity to take from "',es:'¿Qué cantidad tomar de "',pt:'Qual quantidade retirar de "',tr:'Ne kadar miktar alınsın "'}) + (mItem.nom || mItem.designation) + tx(lang,{fr:'" en stock (',ar:'" بالمخزون (',en:'" in stock (',es:'" en stock (',pt:'" em stock (',tr:'" stokta ('}) + (mItem.stockActuel || 0) + tx(lang,{fr:') ?\n(Nécessaire : ',ar:') ؟\n(المطلوب: ',en:') ?\n(Required: ',es:') ?\n(Necesario: ',pt:') ?\n(Necessário: ',tr:') ?\n(Gerekli: '}) + subModal.manque + tx(lang,{fr:')',ar:')',en:')',es:')',pt:')',tr:')'}), subModal.manque.toString());
                                    if (qtyStr) {
                                        const q = parseFloat(qtyStr.replace(/-/g, ''));
                                        if (!isNaN(q) && q > 0) {
                                            setSubstitutes(prev => [...prev, { originalMatId: subModal.matId!, subId: mItem.id, qty: q, subName: mItem.nom || mItem.designation }]);
                                            setSubModal({ open: false, matId: null, matName: null, manque: 0 });
                                        }
                                    }
                                }}>
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 dark:text-dk-text">{mItem.nom || mItem.designation}</div>
                                        <div className="text-[10px] text-slate-500 dark:text-dk-muted font-mono mt-0.5">Ref: {mItem.reference} | Categ: {mItem.categorie}</div>
                                    </div>
                                    <div className="text-right ml-3">
                                        <div className={`font-semibold ${(mItem.stockActuel || 0) > 0 ? 'text-[#2149C1]' : 'text-slate-300 dark:text-dk-muted'}`}>{mItem.stockActuel || 0} <span className="text-xs font-medium">{mItem.unite || ''}</span></div>
                                        <div className={`text-[10px] font-bold ${(mItem.stockActuel || 0) > 0 ? 'text-slate-400 dark:text-dk-muted' : 'text-slate-300 dark:text-dk-muted'}`}>{(mItem.stockActuel || 0) > 0 ? tx(lang,{fr:'En stock',ar:'في المخزون',en:'In stock',es:'En stock',pt:'Em stock',tr:'Stokta var'}) : tx(lang,{fr:'Stock 0',ar:'المخزون 0',en:'Stock 0',es:'Stock 0',pt:'Stock 0',tr:'Stok 0'})}</div>
                                    </div>
                                </div>
                            ))}
                            {magasinData.length === 0 && (
                                <div className="p-6 text-center">
                                    <div className="text-sm text-slate-400 dark:text-dk-muted font-bold mb-3">{tx(lang,{fr:'Aucun produit dans le magasin',ar:'لا توجد منتجات في المخزن',en:'No products in store',es:'Sin productos en el almacén',pt:'Sem produtos no armazém',tr:'Mağazada ürün yok'})}</div>
                                    <button onClick={() => setShowQuickAddModal(true)} className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5">
                                        <Plus className="w-3.5 h-3.5" /> {tx(lang,{fr:'Ajouter au Magasin',ar:'إضافة إلى المخزن',en:'Add to Store',es:'Añadir al Almacén',pt:'Adicionar ao Armazém',tr:'Depoya Ekle'})}
                                    </button>
                                </div>
                            )}
                            {magasinData.length > 0 && magasinData.filter(m => (m.nom || m.designation || '').toLowerCase().includes(subSearch.toLowerCase())).length === 0 && (
                                <div className="p-6 text-center">
                                    <div className="text-sm text-slate-400 dark:text-dk-muted font-bold mb-3">{tx(lang,{fr:'Aucun résultat pour "',ar:'لا توجد نتائج لـ "',en:'No results for "',es:'Sin resultados para "',pt:'Sem resultados para "',tr:'Sonuç yok "'})}{subSearch}"</div>
                                    <button onClick={() => setShowQuickAddModal(true)} className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5">
                                        <Plus className="w-3.5 h-3.5" /> {tx(lang,{fr:'Ajouter au Magasin',ar:'إضافة إلى المخزن',en:'Add to Store',es:'Añadir al Almacén',pt:'Adicionar ao Armazém',tr:'Depoya Ekle'})}
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="mt-3 flex justify-center">
                            <button onClick={() => setShowQuickAddModal(true)} className="text-[11px] text-[#2149C1] font-bold hover:text-slate-700 transition-colors flex items-center gap-1">
                                <Plus className="w-3.5 h-3.5" /> {tx(lang,{fr:'Ajouter un nouveau produit au magasin',ar:'إضافة منتج جديد إلى المخزن',en:'Add new product to store',es:'Añadir nuevo producto al almacén',pt:'Adicionar novo produto ao armazém',tr:'Depoya yeni ürün ekle'})}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CONFIRMER RÉCEPTION MODAL */}
            {confirmModal.open && confirmModal.mat && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setConfirmModal({ open: false, qty: '' })}>
                    <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="px-5 h-12 border-b border-slate-100 dark:border-dk-border flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                            <div>
                                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text tracking-tight">{tx(lang,{fr:'Confirmer réception',ar:'تأكيد الاستلام',en:'Confirm reception',es:'Confirmar recepción',pt:'Confirmar receção',tr:'Teslim almayı onayla'})}</h3>
                                <p className="text-[11px] text-slate-400 dark:text-dk-muted">{confirmModal.mat.name}</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-3">
                            <div>
                                <label className="block text-[11px] font-medium text-slate-500 dark:text-dk-muted mb-1.5">{tx(lang,{fr:'Quantité reçue',ar:'الكمية المستلمة',en:'Quantity received',es:'Cantidad recibida',pt:'Quantidade recebida',tr:'Alınan miktar'})} ({confirmModal.mat.unit})</label>
                                <input
                                    type="number" min="0" step="0.01" autoFocus
                                    value={confirmModal.qty}
                                    onChange={(e) => setConfirmModal(c => ({ ...c, qty: e.target.value }))}
                                    className="w-full h-9 px-3 bg-slate-50 dark:bg-dk-bg/60 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 focus:bg-white border border-slate-200 dark:border-dk-border focus:border-slate-300 rounded-md text-[13px] font-semibold text-slate-700 dark:text-dk-text-soft focus:ring-2 focus:ring-slate-100 outline-none transition-all tabular-nums"
                                />
                                <p className="text-[10.5px] text-slate-400 dark:text-dk-muted mt-1.5">
                                    {tx(lang,{fr:'Besoin',ar:'الاحتياج',en:'Need',es:'Necesidad',pt:'Necessidade',tr:'İhtiyaç'})} : {fmt(confirmModal.mat.buyQty)} {confirmModal.mat.unit}. {tx(lang,{fr:'La quantité confirmée s\'ajoute au stock et lève « En attente » (BR pour le Planning).',ar:'الكمية المؤكدة تضاف إلى المخزون وترفع "قيد الانتظار" (أمر الإنتاج للتخطيط).',en:'The confirmed quantity adds to stock and clears "Pending" (BR for Planning).',es:'La cantidad confirmada se añade al stock y levanta "Pendiente" (BR para Planificación).',pt:'A quantidade confirmada é adicionada ao stock e levanta "Pendente" (BR para o Planeamento).',tr:'Onaylanan miktar stoğa eklenir ve "Beklemede" durumunu kaldırır (Planlama için BR).'})}
                                </p>
                            </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-dk-bg px-5 py-4 flex justify-end gap-2.5 border-t border-slate-100 dark:border-dk-border">
                            <button onClick={() => setConfirmModal({ open: false, qty: '' })} className="px-4 h-9 text-[12px] font-medium text-slate-600 dark:text-dk-text-soft bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">{tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}</button>
                            <button onClick={handleConfirmReception} className="inline-flex items-center gap-1.5 px-4 h-9 text-[12px] font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors">
                                <CheckCircle className="w-3.5 h-3.5" strokeWidth={2} /> {tx(lang,{fr:'Confirmer',ar:'تأكيد',en:'Confirm',es:'Confirmar',pt:'Confirmar',tr:'Onayla'})}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QUICK ADD MAGASIN MODAL */}
            {showQuickAddModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowQuickAddModal(false)}>
                    <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm w-full max-w-md p-5 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                                <Plus className="w-4 h-4 text-slate-400 dark:text-dk-muted" /> {tx(lang,{fr:'Ajouter au Magasin',ar:'إضافة إلى المخزن',en:'Add to Store',es:'Añadir al Almacén',pt:'Adicionar ao Armazém',tr:'Depoya Ekle'})}
                            </h3>
                            <button onClick={() => setShowQuickAddModal(false)} className="p-1.5 text-slate-400 dark:text-dk-muted hover:bg-slate-100 rounded-full transition-colors">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto p-1">
                            <div className="flex flex-col items-center justify-center mb-3">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-1.5 w-full">{tx(lang,{fr:'Photo du produit',ar:'صورة المنتج',en:'Product photo',es:'Foto del producto',pt:'Foto do produto',tr:'Ürün fotoğrafı'})}</label>
                                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 dark:bg-dk-bg flex items-center justify-center overflow-hidden relative cursor-pointer hover:bg-slate-100 transition-colors">
                                    {quickAddForm.image ? (
                                        <img src={quickAddForm.image} className="w-full h-full object-cover" alt="preview" />
                                    ) : (
                                        <div className="flex flex-col items-center text-slate-400 dark:text-dk-muted">
                                            <Package className="w-5 h-5 mb-0.5 opacity-50" />
                                            <span className="text-[8px] font-bold uppercase">{tx(lang,{fr:'Ajouter',ar:'إضافة',en:'Add',es:'Añadir',pt:'Adicionar',tr:'Ekle'})}</span>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang,{fr:'Désignation / Nom *',ar:'التسمية / الاسم *',en:'Designation / Name *',es:'Designación / Nombre *',pt:'Designação / Nome *',tr:'Tanım / Ad *'})}</label>
                                <input type="text" value={quickAddForm.nom || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, nom: e.target.value })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-slate-100 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-900 dark:text-dk-text focus:bg-white focus:border-slate-300 font-bold" placeholder={tx(lang,{fr:'Ex: Tissu Denim 12oz',ar:'مثال: قماش دنيم 12oz',en:'Ex: Denim Fabric 12oz',es:'Ej: Tela Denim 12oz',pt:'Ex: Tecido Denim 12oz',tr:'Örn: Denim Kumaş 12oz'})} />
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang,{fr:'Référence',ar:'المرجع',en:'Reference',es:'Referencia',pt:'Referência',tr:'Referans'})}</label>
                                    <input type="text" value={quickAddForm.reference || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, reference: e.target.value })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-slate-100 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-900 dark:text-dk-text focus:bg-white focus:border-slate-300" placeholder={tx(lang,{fr:'Ex: REF-001',ar:'مثال: REF-001',en:'Ex: REF-001',es:'Ej: REF-001',pt:'Ex: REF-001',tr:'Örn: REF-001'})} />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang,{fr:'Catégorie',ar:'الفئة',en:'Category',es:'Categoría',pt:'Categoria',tr:'Kategori'})}</label>
                                    <select value={quickAddForm.categorie || 'tissu'} onChange={(e) => setQuickAddForm({ ...quickAddForm, categorie: e.target.value })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-slate-100 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-900 dark:text-dk-text focus:bg-white focus:border-slate-300">
                                        {['tissu', 'fil', 'bouton', 'fermeture', 'etiquette', 'emballage', 'autre'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="w-1/3">
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang,{fr:'Unité',ar:'الوحدة',en:'Unit',es:'Unidad',pt:'Unidade',tr:'Birim'})}</label>
                                    <select value={quickAddForm.unite || 'm'} onChange={(e) => setQuickAddForm({ ...quickAddForm, unite: e.target.value })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-slate-100 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-900 dark:text-dk-text focus:bg-white focus:border-slate-300">
                                        {['m', 'kg', 'piece', 'cone', 'boite'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang,{fr:'Prix U. (DH)',ar:'السعر (درهم)',en:'Unit price (MAD)',es:'Precio U. (MAD)',pt:'Preço U. (MAD)',tr:'Birim fiyat (MAD)'})}</label>
                                    <input type="number" min="0" step="0.01" value={quickAddForm.prixUnitaire || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, prixUnitaire: Number(e.target.value) })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-slate-100 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-900 dark:text-dk-text focus:bg-white focus:border-slate-300 text-[#2149C1] font-semibold" />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang,{fr:'Stock Initial',ar:'المخزون الأولي',en:'Initial stock',es:'Stock inicial',pt:'Stock inicial',tr:'Başlangıç stoğu'})}</label>
                                    <input type="number" min="0" value={quickAddForm.stockActuel || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, stockActuel: Number(e.target.value) })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-slate-100 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-900 dark:text-dk-text focus:bg-white focus:border-slate-300" />
                                </div>
                            </div>
                            <div className="pt-2 border-t border-slate-100 dark:border-dk-border">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang,{fr:'Fournisseur',ar:'المورد',en:'Supplier',es:'Proveedor',pt:'Fornecedor',tr:'Tedarikçi'})}</label>
                                <input type="text" value={quickAddForm.fournisseurNom || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, fournisseurNom: e.target.value })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-slate-100 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-900 dark:text-dk-text focus:bg-white focus:border-slate-300" placeholder={tx(lang,{fr:'Nom du fournisseur',ar:'اسم المورد',en:'Supplier name',es:'Nombre del proveedor',pt:'Nome do fornecedor',tr:'Tedarikçi adı'})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang,{fr:'Délai Livraison (Jours)',ar:'مدة التسليم (أيام)',en:'Delivery time (Days)',es:'Plazo de entrega (días)',pt:'Prazo de entrega (dias)',tr:'Teslim süresi (Gün)'})}</label>
                                <input type="number" min="0" value={quickAddForm.fournisseurDelaiLivraisonJours || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, fournisseurDelaiLivraisonJours: Number(e.target.value) })} className="w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-slate-100 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-900 dark:text-dk-text focus:bg-white focus:border-slate-300" placeholder={tx(lang,{fr:'Ex: 14',ar:'مثال: 14',en:'Ex: 14',es:'Ej: 14',pt:'Ex: 14',tr:'Örn: 14'})} />
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-dk-border flex justify-end gap-2">
                            <button onClick={() => setShowQuickAddModal(false)} className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 rounded-lg transition-colors">{tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}</button>
                            <button onClick={handleQuickAdd} className="px-5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 transition-colors">{tx(lang,{fr:'Enregistrer',ar:'حفظ',en:'Save',es:'Guardar',pt:'Guardar',tr:'Kaydet'})}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header Section */}
            <div className={`px-5 min-h-[3rem] py-2.5 border-b flex flex-col md:flex-row justify-between items-center gap-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white dark:bg-dk-surface border-slate-100 dark:border-dk-border'}`}>
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                    <div>
                        <h2 className={`text-[13px] font-semibold tracking-tight ${darkMode ? 'text-slate-200' : 'text-slate-900 dark:text-dk-text'}`}>{t.needs}</h2>
                        <p className={`text-[11px] ${darkMode ? 'text-slate-500 dark:text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>{tx(lang,{fr:'Estimation des coûts globaux',ar:'تقدير التكاليف الإجمالية',en:'Global cost estimate',es:'Estimación de costos globales',pt:'Estimativa de custos globais',tr:'Genel maliyet tahmini'})}</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {/* Waste Input */}
                    <div className={`flex items-center gap-2 h-8 rounded-md px-2.5 border transition-all focus-within:ring-2 focus-within:ring-slate-100 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-slate-50 dark:bg-dk-bg/60 border-slate-200 dark:border-dk-border'}`}>
                        <span className={`text-[11px] font-medium ${textSecondary}`}>{t.waste}</span>
                        <div className="h-4 w-px bg-slate-200 dark:bg-gray-700"></div>
                        <NumberInput
                            min={0}
                            value={wasteRate}
                            onValueChange={(n) => setWasteRate(n)}
                            className={`w-10 text-center text-[13px] font-semibold tabular-nums text-slate-900 dark:text-dk-text bg-transparent outline-none ${darkMode ? 'text-slate-200' : ''}`}
                        />
                        <Percent className="w-3 h-3 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                    </div>

                    {/* Qté Totale = quantité RÉELLE de la commande (somme du tableau de
                        répartition). Verrouillée : on ne peut pas la modifier à la main
                        pour que le coût reste toujours basé sur la vraie commande. */}
                    <div className={`flex items-center gap-2 h-8 rounded-md px-2.5 border ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-slate-50 dark:bg-dk-bg/60 border-slate-200 dark:border-dk-border'}`} title={tx(lang,{fr:'Quantité de la commande (verrouillée — définie par le tableau de répartition)',ar:'كمية الطلب (مقفلة — محددة بجدول التوزيع)',en:'Order quantity (locked — defined by the distribution table)',es:'Cantidad del pedido (bloqueada — definida por la tabla de distribución)',pt:'Quantidade da encomenda (bloqueada — definida pela tabela de distribuição)',tr:'Sipariş miktarı (kilitli — dağıtım tablosu tarafından belirlenir)'})}>
                        <span className={`text-[11px] font-medium ${textSecondary}`}>{tx(lang,{fr:'Qté Totale',ar:'الكمية الإجمالية',en:'Total Qty',es:'Cant. Total',pt:'Qtd Total',tr:'Toplam Miktar'})}</span>
                        <div className="h-4 w-px bg-slate-200 dark:bg-gray-700"></div>
                        <span className={`w-14 text-center text-[13px] font-semibold tabular-nums ${darkMode ? 'text-slate-200' : 'text-slate-900 dark:text-dk-text'}`}>
                            {orderQty}
                        </span>
                        <ShoppingCart className="w-3 h-3 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                    </div>
                </div>
            </div>

            <div className="p-5 space-y-5">

                {/* Purchasing Table */}
                <div className={`rounded-lg border overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>
                    <div className={`px-4 h-9 flex items-center text-[11px] font-medium uppercase tracking-wide border-b ${darkMode ? 'bg-gray-800 text-slate-400 dark:text-dk-muted border-gray-700' : 'bg-slate-50 dark:bg-dk-bg/60 text-slate-500 dark:text-dk-muted border-slate-100 dark:border-dk-border'}`}>
                        {tx(lang,{fr:'Détail des Achats (Matière Première)',ar:'تفاصيل المشتريات (المواد الخام)',en:'Purchase details (Raw materials)',es:'Detalle de compras (Materia prima)',pt:'Detalhe das compras (Matéria-prima)',tr:'Satın alma detayı (Hammadde)'})}
                    </div>
                    <div className="md:overflow-x-auto">
                    <table className="w-full block md:table text-[13px]">
                        <thead className={`hidden md:table-header-group ${darkMode ? 'bg-gray-800 text-gray-400 dark:text-dk-muted' : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted'} font-medium border-b ${darkMode ? 'border-gray-700' : 'border-slate-100 dark:border-dk-border'} text-[11px] uppercase tracking-wide`}>
                            <tr>
                                <th className="px-4 py-2.5 text-left font-medium">{t.matName}</th>
                                <th className="px-4 py-2.5 text-center font-medium">{t.price}</th>
                                <th className="px-4 py-2.5 text-center font-medium">{tx(lang,{fr:'Besoin Total',ar:'الاحتياج الإجمالي',en:'Total need',es:'Necesidad total',pt:'Necessidade total',tr:'Toplam ihtiyaç'})}</th>
                                <th className="px-4 py-2.5 text-center font-medium border-l border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/40">{tx(lang,{fr:'En Stock',ar:'في المخزون',en:'In Stock',es:'En Stock',pt:'Em Stock',tr:'Stokta'})}</th>
                                <th className="px-4 py-2.5 text-center font-medium bg-slate-50 dark:bg-dk-bg/40">{tx(lang,{fr:'Manque',ar:'النقص',en:'Shortage',es:'Déficit',pt:'Falta',tr:'Eksiklik'})}</th>
                                <th className="px-4 py-2.5 text-center font-medium bg-slate-50 dark:bg-dk-bg/40">{tx(lang,{fr:'Fournisseur / Délais',ar:'المورد / المهل',en:'Supplier / Lead times',es:'Proveedor / Plazos',pt:'Fornecedor / Prazos',tr:'Tedarikçi / Teslim süreleri'})}</th>
                                <th className="px-4 py-2.5 text-right font-medium text-slate-700 dark:text-dk-text-soft border-l border-slate-100 dark:border-dk-border">{t.total}</th>
                            </tr>
                        </thead>
                        <tbody className={`block md:table-row-group md:divide-y text-xs ${darkMode ? 'divide-gray-800' : 'divide-slate-100 dark:divide-dk-border'}`}>
                            {purchasingData.map((m) => {
                                const mItem = findMagasinItem(m, magasinData);
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
                                        <tr className={`block md:table-row border border-slate-200 dark:border-dk-border rounded-xl mb-3 p-2 md:p-0 md:mb-0 md:border-0 md:rounded-none ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-slate-100/30'} transition-colors ${rowSubs.length > 0 ? 'md:bg-slate-100/10' : ''}`}>
                                            <td className={`block md:table-cell px-4 py-2 md:py-3 font-semibold md:font-medium text-[13px] md:text-xs ${textPrimary}`}>
                                                {m.name}
                                                {m.unit === 'bobine' && <span className="text-[10px] text-slate-400 dark:text-dk-muted block font-normal">({m.threadMeters}m / bobine)</span>}
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center ${textSecondary}`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{t.price}</span>
                                                <span>{isExport ? tx(lang,{fr:'0 (Fourni)',ar:'0 (مورد)',en:'0 (Supplied)',es:'0 (Suministrado)',pt:'0 (Fornecido)',tr:'0 (Tedarik Edildi)'}) : `${m.unitPrice} ${currency}`}</span>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center ${textSecondary}`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Besoin Total',ar:'الاحتياج الإجمالي',en:'Total Need',es:'Necesidad Total',pt:'Necessidade Total',tr:'Toplam İhtiyaç'})}</span>
                                                <span title={`(${m.qty} × ${orderQty}) + ${wasteRate}%`} className="font-bold">
                                                    {fmt(m.qtyToBuy)} {m.unit}
                                                </span>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center md:border-l ${originalStockActuel > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-dk-muted'} font-bold md:bg-slate-50/30`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'En Stock',ar:'في المخزون',en:'In Stock',es:'En Stock',pt:'Em Stock',tr:'Stokta'})}</span>
                                                <span>{fmt(originalStockActuel)} {m.unit}</span>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center font-bold md:bg-slate-50/30 ${hasAlert ? 'text-rose-600 dark:text-rose-400' : 'text-slate-300 dark:text-dk-muted'}`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Manque',ar:'النقص',en:'Shortage',es:'Déficit',pt:'Falta',tr:'Eksiklik'})}</span>
                                                <div className="flex flex-row md:flex-col items-center justify-end md:justify-center gap-1">
                                                    <div className="flex items-center gap-1">
                                                        {hasAlert && <AlertTriangle className="w-3 h-3" />}
                                                        {fmt(manque)} {m.unit}
                                                    </div>
                                                    {hasAlert && (
                                                        <button onClick={() => setSubModal({ open: true, matId: m.id, matName: m.name, manque })} className="md:mt-0.5 text-[9px] px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded hover:bg-rose-200 uppercase tracking-widest font-semibold transition-colors active:scale-95 shadow-sm dark:shadow-dk-sm">
                                                            + {tx(lang,{fr:'Substitut',ar:'بديل',en:'Substitute',es:'Sustituto',pt:'Substituto',tr:'Yedek'})}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center md:bg-slate-50/30`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Fournisseur',ar:'المورد',en:'Supplier',es:'Proveedor',pt:'Fornecedor',tr:'Tedarikçi'})}</span>
                                                {fournisseur ? (
                                                    <div className="flex flex-row md:flex-col items-center gap-1">
                                                        <span className="text-[10px] font-bold bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft px-2 py-0.5 rounded uppercase tracking-wider">{fournisseur}</span>
                                                        {delai != null && <span className="text-[10px] text-slate-500 dark:text-dk-muted flex items-center gap-1 md:mt-1"><Truck className="w-3 h-3" /> {tx(lang,{fr:`${delai} jours`,ar:`${delai} يوم`,en:`${delai} days`,es:`${delai} días`,pt:`${delai} dias`,tr:`${delai} gün`})}</span>}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400 dark:text-dk-muted">—</span>
                                                )}
                                            </td>
                                            <td className={`flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 mt-1 pt-2 md:mt-0 md:pt-3 border-t md:border-t-0 border-slate-100 dark:border-dk-border md:text-right font-bold ${textPrimary} md:border-l`}>
                                                <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{t.total}</span>
                                                <div className="flex items-center justify-end gap-1 cursor-help" title={isExport ? tx(lang,{fr:'Fourni par le client (0 DH)',ar:'مقدم من العميل (0 درهم)',en:'Supplied by client (0 MAD)',es:'Suministrado por el cliente (0 MAD)',pt:'Fornecido pelo cliente (0 MZN)',tr:'Müşteri tarafından sağlandı (0 MAD)'}) : `${m.qtyToBuy} × ${m.unitPrice} = ${fmt(m.lineCost)}`}>
                                                    {isExport ? 0 : fmt(m.lineCost)} {currency}
                                                </div>
                                            </td>
                                        </tr>
                                        {rowSubs.map((sub, idx) => (
                                            <tr key={`${m.id}-sub-${idx}`} className="block md:table-row bg-amber-50 dark:bg-amber-900/60 border border-dashed md:border-0 md:border-t border-amber-200 rounded-xl md:rounded-none mb-3 md:mb-0 p-2 md:p-0">
                                                <td className="block md:table-cell px-4 py-2 text-[11px] text-amber-800 flex items-center gap-2 font-bold">
                                                    <div className="w-3 h-3 border-l-2 border-b-2 border-amber-400 md:ml-4 rounded-bl"></div>
                                                    {tx(lang,{fr:'Substitut',ar:'بديل',en:'Substitute',es:'Sustituto',pt:'Substituto',tr:'Yedek'})}: {sub.subName}
                                                </td>
                                                <td className="hidden md:table-cell px-4 py-2 text-center text-amber-600 dark:text-amber-400/70">—</td>
                                                <td className="flex md:table-cell items-center justify-between px-4 py-1.5 md:py-2 md:text-center font-bold text-amber-600 dark:text-amber-400">
                                                    <span className="md:hidden text-[10px] font-semibold uppercase tracking-wide text-amber-700/60">{tx(lang,{fr:'Besoin Total',ar:'الاحتياج الإجمالي',en:'Total Need',es:'Necesidad Total',pt:'Necessidade Total',tr:'Toplam İhtiyaç'})}</span>
                                                    <span>+{fmt(sub.qty)} {m.unit}</span>
                                                </td>
                                                <td className="hidden md:table-cell px-4 py-2 border-l bg-slate-50 dark:bg-dk-bg/10"></td>
                                                <td className="hidden md:table-cell px-4 py-2 bg-slate-50 dark:bg-dk-bg/10"></td>
                                                <td className="hidden md:table-cell px-4 py-2 bg-slate-50 dark:bg-dk-bg/10"></td>
                                                <td className="flex md:table-cell items-center justify-end px-4 py-1.5 md:py-2 md:border-l md:text-right">
                                                    <button onClick={() => setSubstitutes(prev => prev.filter(x => x !== sub))} className="text-[10px] font-bold text-rose-500 hover:text-rose-700 px-2 py-0.5 bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 rounded transition-colors shadow-sm dark:shadow-dk-sm">{tx(lang,{fr:'Retirer',ar:'إزالة',en:'Remove',es:'Retirar',pt:'Remover',tr:'Kaldır'})}</button>
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
                    <div className={`rounded-lg border overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>
                        <button
                            onClick={() => setShowPididoBreakdown(!showPididoBreakdown)}
                            className={`w-full px-4 h-9 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide border-b ${darkMode ? 'bg-gray-800 text-slate-400 dark:text-dk-muted border-gray-700' : 'bg-slate-50 dark:bg-dk-bg/60 text-slate-500 dark:text-dk-muted border-slate-100 dark:border-dk-border'}`}
                        >
                            <span className="flex items-center gap-2">
                                <Palette className="w-3.5 h-3.5" strokeWidth={1.75} />
                                {tx(lang,{fr:'Achats par PIDIDO',ar:'المشتريات حسب PIDIDO',en:'Purchases by PIDIDO',es:'Compras por PIDIDO',pt:'Compras por PIDIDO',tr:'PIDIDO\'ya göre satın almalar'})}
                                <span className="text-[10px] font-normal lowercase normal-case text-slate-400 dark:text-dk-muted">
                                    ({pididoBreakdown.length} couleurs)
                                </span>
                            </span>
                            {showPididoBreakdown ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        {showPididoBreakdown && (
                            <div className="p-3 space-y-2">
                                {pididoBreakdown.map(pg => (
                                    <div key={pg.colorId} className={`rounded-lg border p-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white dark:bg-dk-surface border-slate-100 dark:border-dk-border'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full border border-slate-300" style={pg.colorId && pg.colorId.startsWith('#') ? { backgroundColor: pg.colorId } : { backgroundColor: pg.colorName }} />
                                                <span className={`text-[13px] font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800 dark:text-dk-text'}`}>{pg.colorName}</span>
                                                <span className="text-[11px] text-slate-400 dark:text-dk-muted font-medium">{pg.pieces} pcs</span>
                                            </div>
                                            <span className={`text-[11px] font-semibold ${darkMode ? 'text-slate-300 dark:text-dk-muted' : 'text-slate-600 dark:text-dk-text-soft'}`}>
                                                {fmt(pg.materials.reduce((s, m) => s + m.cost, 0))} {currency}
                                            </span>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-[12px] border-collapse">
                                                <thead>
                                                    <tr className={`text-[10px] uppercase tracking-wider ${darkMode ? 'text-slate-500 dark:text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}`}>
                                                        <th className={`sticky left-0 z-20 border-r text-left px-2 py-1 font-medium ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-slate-50 dark:bg-dk-bg border-slate-200 dark:border-dk-border'}`}>{tx(lang,{fr:'Matière',ar:'المادة',en:'Material',es:'Material',pt:'Material',tr:'Malzeme'})}</th>
                                                        <th className="text-center px-2 py-1 font-medium">{tx(lang,{fr:'Qté/Pièce',ar:'الكمية/قطعة',en:'Qty/Piece',es:'Cant./Prenda',pt:'Qtd/Peça',tr:'Miktar/Parça'})}</th>
                                                        <th className="text-center px-2 py-1 font-medium">{tx(lang,{fr:`Besoin (${pg.pieces}pcs)`,ar:`الاحتياج (${pg.pieces} قطعة)`,en:`Need (${pg.pieces}pcs)`,es:`Necesidad (${pg.pieces}pcs)`,pt:`Necessidade (${pg.pieces}pcs)`,tr:`İhtiyaç (${pg.pieces} adet)`})}</th>
                                                        <th className="text-center px-2 py-1 font-medium">{tx(lang,{fr:`Avec ${wasteRate}%`,ar:`مع ${wasteRate}%`,en:`With ${wasteRate}%`,es:`Con ${wasteRate}%`,pt:`Com ${wasteRate}%`,tr:`${wasteRate}% ile`})}</th>
                                                        <th className="text-center px-2 py-1 font-medium">{tx(lang,{fr:'Fournisseur',ar:'المورد',en:'Supplier',es:'Proveedor',pt:'Fornecedor',tr:'Tedarikçi'})}</th>
                                                        <th className="text-center px-2 py-1 font-medium">{tx(lang,{fr:'Statut',ar:'الحالة',en:'Status',es:'Estado',pt:'Estado',tr:'Durum'})}</th>
                                                        <th className="text-right px-2 py-1 font-medium">{tx(lang,{fr:'Coût HT',ar:'التكلفة غير شامل',en:'Cost HT',es:'Coste HT',pt:'Custo HT',tr:'HT Maliyet'})}</th>
                                                        <th className="text-center px-2 py-1 font-medium">{tx(lang,{fr:'Actions',ar:'الإجراءات',en:'Actions',es:'Acciones',pt:'Ações',tr:'İşlemler'})}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-slate-100 dark:divide-dk-border'}`}>
                                                    {pg.materials.map(m => (
                                                        <tr key={m.id} className={`group ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-slate-100/30'} transition-colors cursor-pointer`} onClick={() => setSelectedMaterial({ ...m, colorName: pg.colorName })}>
                                                            <td className={`sticky left-0 z-10 border-r px-2 py-1.5 font-medium ${darkMode ? 'bg-gray-800 group-hover:bg-gray-750 border-gray-750' : 'bg-white dark:bg-dk-surface group-hover:bg-slate-50/50 border-slate-100 dark:border-dk-border'}`} title={m.name}>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="truncate max-w-[120px]">{m.name}</span>
                                                                    {m.unit === 'bobine' && <span className="text-[10px] text-slate-400 dark:text-dk-muted">({m.threadMeters}m/bobine)</span>}
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center tabular-nums text-slate-600 dark:text-dk-text-soft">{m.qty} {m.unit}</td>
                                                            <td className="px-2 py-1.5 text-center tabular-nums text-slate-600 dark:text-dk-text-soft">{m.baseQty < 10 ? m.baseQty.toFixed(2) : Math.round(m.baseQty)} {m.unit}</td>
                                                            <td className="px-2 py-1.5 text-center tabular-nums font-medium text-slate-700 dark:text-dk-text-soft">{m.buyQty} {m.unit}</td>
                                                            <td className="px-2 py-1.5 text-center">
                                                                {m.fournisseur ? (
                                                                    <span className="text-[10px] font-bold bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft px-2 py-0.5 rounded uppercase tracking-wider">{m.fournisseur}</span>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400 dark:text-dk-muted">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center">
                                                                {m.isDelivered ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                                                                        <CheckCircle className="w-3 h-3" /> {tx(lang,{fr:'Stock OK',ar:'المخزون كافٍ',en:'Stock OK',es:'Stock OK',pt:'Stock OK',tr:'Stok Tam'})}
                                                                    </span>
                                                                ) : m.isPartial ? (
                                                                    <span className="inline-flex flex-col items-center gap-0.5">
                                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                                                                            <AlertTriangle className="w-3 h-3" /> {tx(lang,{fr:'Partiel',ar:'جزئي',en:'Partial',es:'Parcial',pt:'Parcial',tr:'Kısmi'})}
                                                                        </span>
                                                                        <span className="text-[9px] text-amber-600 dark:text-amber-400/80 font-medium">{tx(lang,{fr:`couvre ${fmt(m.piecesCouvertes)} pcs · manque ${fmt(m.manque)} ${m.unit}`,ar:`يغطي ${fmt(m.piecesCouvertes)} قطعة · نقص ${fmt(m.manque)} ${m.unit}`,en:`covers ${fmt(m.piecesCouvertes)} pcs · shortage ${fmt(m.manque)} ${m.unit}`,es:`cubre ${fmt(m.piecesCouvertes)} pcs · déficit ${fmt(m.manque)} ${m.unit}`,pt:`cobre ${fmt(m.piecesCouvertes)} pcs · falta ${fmt(m.manque)} ${m.unit}`,tr:`${fmt(m.piecesCouvertes)} adet kapsar · eksiklik ${fmt(m.manque)} ${m.unit}`})}</span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex flex-col items-center gap-0.5">
                                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded-full">
                                                                            <Clock className="w-3 h-3" /> {tx(lang,{fr:'En attente',ar:'قيد الانتظار',en:'Pending',es:'Pendiente',pt:'Pendente',tr:'Beklemede'})}
                                                                        </span>
                                                                        <span className="text-[9px] text-rose-500/80 font-medium">{tx(lang,{fr:`manque ${fmt(m.manque)} ${m.unit}`,ar:`نقص ${fmt(m.manque)} ${m.unit}`,en:`shortage ${fmt(m.manque)} ${m.unit}`,es:`déficit ${fmt(m.manque)} ${m.unit}`,pt:`falta ${fmt(m.manque)} ${m.unit}`,tr:`eksiklik ${fmt(m.manque)} ${m.unit}`})}</span>
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800 dark:text-dk-text">{fmt(m.cost)} {currency}</td>
                                                            <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                                                <div className="flex items-center justify-center gap-1.5">
                                                                    {!m.isDelivered && modelId && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setConfirmModal({ open: true, mat: m, qty: String(Math.round(m.buyQty)) }); }}
                                                                            className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 h-6 px-2 rounded-md transition-colors whitespace-nowrap"
                                                                            title={tx(lang,{fr:'Confirmer la réception → ajoute au stock',ar:'تأكيد الاستلام → يضاف إلى المخزون',en:'Confirm reception → adds to stock',es:'Confirmar recepción → añade al stock',pt:'Confirmar receção → adiciona ao stock',tr:'Teslim almayı onayla → stoğa ekler'})}
                                                                        >
                                                                            <CheckCircle className="w-3 h-3" /> {tx(lang,{fr:'Reçu',ar:'تم الاستلام',en:'Received',es:'Recibido',pt:'Recebido',tr:'Teslim Alındı'})}
                                                                        </button>
                                                                    )}
                                                                    <FactureUploader modelId={modelId} materialName={m.name} />
                                                                </div>
                                                            </td>
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
                    <div className={`p-4 rounded-lg border flex flex-col justify-between ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <span className={`text-[11px] font-medium mb-1 block ${textSecondary}`}>{t.realBudget}</span>
                                <div className="flex items-baseline gap-1">
                                    <h3 className={`text-[22px] font-semibold tabular-nums ${darkMode ? 'text-slate-200' : 'text-slate-900 dark:text-dk-text'}`}>
                                        {fmt(totalPurchasingMatCost)}
                                    </h3>
                                    <span className="text-[11px] font-normal text-slate-400 dark:text-dk-muted">{currency}</span>
                                </div>
                            </div>
                            <Banknote className="w-4 h-4 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                        </div>
                        <div className={`mt-3 pt-3 border-t text-[11px] flex justify-between ${darkMode ? 'border-gray-700 text-gray-500 dark:text-dk-muted' : 'border-slate-100 dark:border-dk-border text-slate-400 dark:text-dk-muted'}`}>
                            <span>{tx(lang,{fr:`Articles : ${purchasingData.length}`,ar:`المواد: ${purchasingData.length}`,en:`Items: ${purchasingData.length}`,es:`Artículos: ${purchasingData.length}`,pt:`Artigos: ${purchasingData.length}`,tr:`Ürünler: ${purchasingData.length}`})}</span>
                            <span title={tx(lang,{fr:'Formule: Somme(QtéAchat * Prix)',ar:'الصيغة: مجموع(الكمية المشتراة * السعر)',en:'Formula: Sum(QtyToBuy * Price)',es:'Fórmula: Suma(CantCompra * Precio)',pt:'Fórmula: Soma(QtdCompra * Preço)',tr:'Formül: Toplam(AlınanMiktar * Fiyat)'})}>{tx(lang,{fr:'Achats réels',ar:'المشتريات الفعلية',en:'Actual purchases',es:'Compras reales',pt:'Compras reais',tr:'Gerçek alımlar'})}</span>
                        </div>
                    </div>

                    {/* Card 2: Total Labor */}
                    <div className={`p-4 rounded-lg border flex flex-col justify-between ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <span className={`text-[11px] font-medium mb-1 block ${textSecondary}`}>{t.laborCost} (Total)</span>
                                <div className="flex items-baseline gap-1">
                                    <h3 className={`text-[22px] font-semibold tabular-nums ${darkMode ? 'text-slate-200' : 'text-slate-900 dark:text-dk-text'}`}>
                                        {fmt(laborCost * orderQty)}
                                    </h3>
                                    <span className="text-[11px] font-normal text-slate-400 dark:text-dk-muted">{currency}</span>
                                </div>
                            </div>
                            <Clock className="w-4 h-4 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                        </div>
                        <div className={`mt-3 pt-3 border-t text-[11px] flex justify-between ${darkMode ? 'border-gray-700 text-gray-500 dark:text-dk-muted' : 'border-slate-100 dark:border-dk-border text-slate-400 dark:text-dk-muted'}`}>
                            <span>{orderQty} pcs × {fmt(laborCost)}/pc</span>
                            <span title={tx(lang,{fr:`Formule: ${laborCost} * ${orderQty}`,ar:`الصيغة: ${laborCost} * ${orderQty}`,en:`Formula: ${laborCost} * ${orderQty}`,es:`Fórmula: ${laborCost} * ${orderQty}`,pt:`Fórmula: ${laborCost} * ${orderQty}`,tr:`Formül: ${laborCost} * ${orderQty}`})}>{tx(lang,{fr:"Main d'œuvre",ar:'تكلفة اليد العاملة',en:'Labor cost',es:'Mano de obra',pt:'Mão de obra',tr:'İşçilik maliyeti'})}</span>
                        </div>
                    </div>

                    {/* Card 3: Grand Total */}
                    <div className="p-4 rounded-lg bg-slate-900 text-white flex flex-col justify-between">
                        <div>
                            <span className="text-[11px] font-medium text-slate-400 dark:text-dk-muted mb-1 block">{t.totalBudget}</span>
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-[24px] font-semibold tracking-tight tabular-nums">{fmt(totalProjectCost)}</h3>
                                <span className="text-[12px] font-normal text-slate-400 dark:text-dk-muted">{currency}</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center text-[11px] text-slate-300 dark:text-dk-muted">
                            <span>Coût de revient / pièce</span>
                            <span className="bg-white dark:bg-dk-surface/10 px-2 py-0.5 rounded font-medium tabular-nums">{fmt(totalProjectCost / orderQty)} {currency}</span>
                        </div>
                    </div>

                </div>

                {/* Confirm & Deduct Action */}
                <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-dk-border dark:border-gray-800">
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
                        magasinId: selectedMaterial.magasinId,
                        threadReference: selectedMaterial.threadReference,
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
