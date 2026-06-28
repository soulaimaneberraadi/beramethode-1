import React, { useState, useEffect, useMemo } from 'react';
import { Package, Plus, Trash2, Info, Building2, Search, Palette, Ruler, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Material, FicheData } from '../types';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';
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
    ficheData?: FicheData;
    setMaterialScope?: (id: number, scope: Material['scope']) => void;
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
    totalMaterials, ficheData, setMaterialScope
}) => {
    const { lang } = useLang();
    const optionStyle = darkMode ? { backgroundColor: '#1f2937', color: 'white' } : {};
    const inputCls = `w-full rounded px-1.5 py-1 text-[12px] outline-none transition-all focus:ring-1 focus:ring-slate-100 ${darkMode ? 'bg-gray-700 text-white border-gray-600 focus:bg-gray-600' : 'bg-slate-50 border-slate-200 dark:border-dk-border text-slate-900 dark:text-dk-text focus:bg-white focus:border-slate-300'} border`;

    const [magasinData, setMagasinData] = useState<MagasinItem[]>([]);
    const [focusedRow, setFocusedRow] = useState<number | null>(null);
    const [focusedRefRow, setFocusedRefRow] = useState<number | null>(null);
    const [expandedBobine, setExpandedBobine] = useState<number | null>(null);

    const scopeColors = ficheData?.colors || [];
    const scopeSizes = ficheData?.sizes || [];
    const canAssign = !!setMaterialScope && (scopeColors.length > 0 || scopeSizes.length > 0);
    const [expandedScope, setExpandedScope] = useState<number | null>(null);

    const toggleScopeColor = (m: Material, cid: string) => {
        const cur = m.scope?.colors || [];
        let next = cur.includes(cid) ? cur.filter(x => x !== cid) : [...cur, cid];
        if (next.length === scopeColors.length) next = [];
        setMaterialScope?.(m.id, { ...m.scope, colors: next });
    };
    const toggleScopeSize = (m: Material, si: number) => {
        const cur = m.scope?.sizes || [];
        let next = cur.includes(si) ? cur.filter(x => x !== si) : [...cur, si];
        if (next.length === scopeSizes.length) next = [];
        setMaterialScope?.(m.id, { ...m.scope, sizes: next });
    };
    const colorHex = (cid: string) => (cid && cid.startsWith('#') ? cid : null);

    const ScopeChip = ({ active, onClick, children, hex }: { active: boolean; onClick: () => void; children: React.ReactNode; hex?: string | null }) => (
        <button type="button" onClick={onClick}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-medium transition-colors ${active ? 'border-slate-300 bg-slate-100 dark:bg-dk-elevated text-slate-700 dark:text-dk-text-soft' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}>
            {hex && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />}
            {children}
            {active && <Check className="w-2.5 h-2.5" strokeWidth={2.5} />}
        </button>
    );

    const [showQuickAddModal, setShowQuickAddModal] = useState(false);
    const [quickAddForm, setQuickAddForm] = useState<Partial<MagasinItem>>({ unite: 'm', categorie: 'tissu' });
    const [quickAddTargetRow, setQuickAddTargetRow] = useState<number | null>(null);

    const handleQuickAdd = () => {
        if (!quickAddForm.nom) return;
        const newItem: MagasinItem = {
            id: Date.now().toString(),
            nom: quickAddForm.nom,
            designation: quickAddForm.nom,
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
        const updatedMagasin = [newItem, ...magasinData];
        setMagasinData(updatedMagasin);
        localStorage.setItem('beramethode_magasin', JSON.stringify(updatedMagasin));
        fetch('/api/magasin/products', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...newItem, reference: newItem.reference || newItem.id, designation: newItem.nom }),
        }).catch(() => {});
        if (quickAddTargetRow !== null) {
            updateMaterial(quickAddTargetRow, 'IMPORT_MAGASIN', { ...newItem, prix: newItem.prixUnitaire });
        }
        setShowQuickAddModal(false);
        setQuickAddForm({ unite: 'm', categorie: 'tissu' });
        setQuickAddTargetRow(null);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setQuickAddForm(prev => ({ ...prev, image: reader.result as string }));
            reader.readAsDataURL(file);
        }
    };

    useEffect(() => {
        fetch('/api/magasin/products', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    setMagasinData(data.map((p: any) => ({
                        id: p.id, nom: p.designation || p.nom || '', designation: p.designation || p.nom || '',
                        reference: p.reference, prixUnitaire: p.prixUnitaire, stockActuel: p.stockActuel,
                        stockAlerte: p.stockAlerte, unite: p.unite, categorie: p.categorie,
                        fournisseurNom: p.fournisseurNom, image: p.photo,
                    })));
                } else {
                    const ls = localStorage.getItem('beramethode_magasin');
                    if (ls) setMagasinData(JSON.parse(ls));
                }
            })
            .catch(() => { try { const ls = localStorage.getItem('beramethode_magasin'); if (ls) setMagasinData(JSON.parse(ls)); } catch {} });
    }, []);

    return (
        <>
            {/* QUICK ADD MODAL */}
            {showQuickAddModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border shadow-sm w-full max-w-md p-5 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                                <Plus className="w-4 h-4 text-slate-400 dark:text-dk-muted" /> {tx(lang, {fr:'Ajouter au Magasin',ar:'إضافة إلى المخزن',en:'Add to Store',es:'Añadir al Almacén',pt:'Adicionar ao Armazém',tr:'Depoya Ekle'})}
                            </h3>
                            <button onClick={() => setShowQuickAddModal(false)} className="p-1.5 text-slate-400 dark:text-dk-muted hover:bg-slate-100 rounded-full transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto p-1">
                            <div className="flex flex-col items-center justify-center mb-3">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-1.5 w-full">{tx(lang, {fr:'Photo du produit',ar:'صورة المنتج',en:'Product photo',es:'Foto del producto',pt:'Foto do produto',tr:'Ürün fotoğrafı'})}</label>
                                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 dark:bg-dk-bg flex items-center justify-center overflow-hidden relative cursor-pointer hover:bg-slate-100 transition-colors">
                                    {quickAddForm.image ? (
                                        <img src={quickAddForm.image} className="w-full h-full object-cover" alt="preview" />
                                    ) : (
                                        <div className="flex flex-col items-center text-slate-400 dark:text-dk-muted">
                                            <Package className="w-5 h-5 mb-0.5 opacity-50" />
                                            <span className="text-[8px] font-bold uppercase">{tx(lang, {fr:'Ajouter',ar:'إضافة',en:'Add',es:'Añadir',pt:'Adicionar',tr:'Ekle'})}</span>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang, {fr:'Désignation / Nom *',ar:'التسمية / الاسم *',en:'Designation / Name *',es:'Designación / Nombre *',pt:'Designação / Nome *',tr:'Tanım / Ad *'})}</label>
                                <input type="text" value={quickAddForm.nom || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, nom: e.target.value })} className={`${inputCls} font-bold`} placeholder={tx(lang, {fr:"Ex: Tissu Denim 12oz",ar:"مثال: قماش Denim 12oz",en:"E.g.: Denim Fabric 12oz",es:"Ej: Tela Denim 12oz",pt:"Ex: Tecido Denim 12oz",tr:"Örn: Denim Kumaş 12oz"})} />
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang, {fr:'Catégorie',ar:'الفئة',en:'Category',es:'Categoría',pt:'Categoria',tr:'Kategori'})}</label>
                                    <select value={quickAddForm.categorie || 'tissu'} onChange={(e) => setQuickAddForm({ ...quickAddForm, categorie: e.target.value })} className={inputCls}>
                                        {['tissu', 'fil', 'bouton', 'fermeture', 'etiquette', 'emballage', 'autre'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="w-1/3">
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang, {fr:'Unité',ar:'الوحدة',en:'Unit',es:'Unidad',pt:'Unidade',tr:'Birim'})}</label>
                                    <select value={quickAddForm.unite || 'm'} onChange={(e) => setQuickAddForm({ ...quickAddForm, unite: e.target.value })} className={inputCls}>
                                        {['m', 'kg', 'piece', 'cone', 'boite'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang, {fr:'Prix U.',ar:'سعر الوحدة',en:'Unit price',es:'Precio U.',pt:'Preço U.',tr:'Birim fiyat'})} ({currency})</label>
                                    <input type="number" min="0" step="0.01" value={quickAddForm.prixUnitaire || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, prixUnitaire: Number(e.target.value) })} className={`${inputCls} text-[#2149C1] font-semibold`} />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang, {fr:'Stock Initial',ar:'المخزون الابتدائي',en:'Initial Stock',es:'Stock Inicial',pt:'Stock Inicial',tr:'Başlangıç Stoğu'})}</label>
                                    <input type="number" min="0" value={quickAddForm.stockActuel || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, stockActuel: Number(e.target.value) })} className={inputCls} />
                                </div>
                            </div>
                            <div className="pt-2 border-t border-slate-100 dark:border-dk-border">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang, {fr:'Fournisseur',ar:'المورّد',en:'Supplier',es:'Proveedor',pt:'Fornecedor',tr:'Tedarikçi'})}</label>
                                <input type="text" value={quickAddForm.fournisseurNom || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, fournisseurNom: e.target.value })} className={inputCls} placeholder={tx(lang, {fr:"Nom du fournisseur",ar:"اسم المورّد",en:"Supplier name",es:"Nombre del proveedor",pt:"Nome do fornecedor",tr:"Tedarikçi adı"})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase mb-0.5">{tx(lang, {fr:'Délai Livraison (Jours)',ar:'مهلة التسليم (أيام)',en:'Delivery Time (Days)',es:'Plazo de Entrega (Días)',pt:'Prazo de Entrega (Dias)',tr:'Teslim Süresi (Gün)'})}</label>
                                <input type="number" min="0" value={quickAddForm.fournisseurDelaiLivraisonJours || ''} onChange={(e) => setQuickAddForm({ ...quickAddForm, fournisseurDelaiLivraisonJours: Number(e.target.value) })} className={inputCls} placeholder={tx(lang, {fr:"Ex: 14",ar:"مثال: 14",en:"E.g.: 14",es:"Ej: 14",pt:"Ex: 14",tr:"Örn: 14"})} />
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-dk-border flex justify-end gap-2">
                            <button onClick={() => setShowQuickAddModal(false)} className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 rounded-lg transition-colors">{tx(lang, {fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}</button>
                            <button onClick={handleQuickAdd} className="px-5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 transition-colors">{tx(lang, {fr:'Enregistrer',ar:'حفظ',en:'Save',es:'Guardar',pt:'Guardar',tr:'Kaydet'})}</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface overflow-visible">
                {/* Header */}
                <div className="px-3 sm:px-4 h-auto sm:h-10 border-b border-slate-100 dark:border-dk-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 sm:gap-0 py-1.5 sm:py-0">
                    <div className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                        <h2 className="text-[11px] sm:text-[12px] font-semibold text-slate-900 dark:text-dk-text tracking-tight">{t.materials}</h2>
                        <span className="text-[9px] text-slate-400 dark:text-dk-muted hidden sm:inline">·</span>
                        <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-dk-muted hidden sm:inline">{tx(lang, {fr:'Ajoutez ou sélectionnez depuis le magasin',ar:'أضف أو اختر من المخزن',en:'Add or select from the store',es:'Añada o seleccione desde el almacén',pt:'Adicione ou selecione do armazém',tr:'Depodan ekleyin veya seçin'})}</p>
                    </div>
                    <button onClick={addMaterial} className="inline-flex items-center gap-1 h-6 sm:h-7 px-2 sm:px-2.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[10px] sm:text-[11px] font-medium transition-colors">
                        <Plus className="w-3 h-3" strokeWidth={2} /> {t.addMat}
                    </button>
                </div>

                {/* Desktop: Compact Table */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-[12px] border-collapse">
                        <thead className={`uppercase text-[9px] tracking-wide ${darkMode ? 'bg-gray-800 text-gray-400 dark:text-dk-muted border-gray-700' : 'bg-slate-50/80 text-slate-500 dark:text-dk-muted border-slate-100 dark:border-dk-border'} border-b`}>
                            <tr>
                                <th className="px-3 py-1.5 font-medium w-[28%]">{t.matName}</th>
                                <th className="px-3 py-1.5 font-medium w-[12%] text-center">{t.price} ({currency})</th>
                                <th className="px-3 py-1.5 font-medium w-[20%] text-center">{t.qtyUnit}</th>
                                <th className="px-3 py-1.5 font-medium w-[10%] text-right">{t.total}</th>
                                <th className="px-3 py-1.5 w-[8%]"></th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-slate-100'}`}>
                            {materials.map((item) => (
                                <MaterialRow key={item.id} item={item} t={t} currency={currency} darkMode={darkMode}
                                    inputCls={inputCls} optionStyle={optionStyle} magasinData={magasinData}
                                    focusedRow={focusedRow} setFocusedRow={setFocusedRow} focusedRefRow={focusedRefRow}
                                    setFocusedRefRow={setFocusedRefRow} updateMaterial={updateMaterial}
                                    deleteMaterial={deleteMaterial} canAssign={canAssign} expandedScope={expandedScope}
                                    setExpandedScope={setExpandedScope} toggleScopeColor={toggleScopeColor}
                                    toggleScopeSize={toggleScopeSize} scopeColors={scopeColors} scopeSizes={scopeSizes}
                                    ScopeChip={ScopeChip} colorHex={colorHex} setQuickAddForm={setQuickAddForm}
                                    setQuickAddTargetRow={setQuickAddTargetRow} setShowQuickAddModal={setShowQuickAddModal}
                                    expandedBobine={expandedBobine} setExpandedBobine={setExpandedBobine} setMaterialScope={setMaterialScope} view="desktop" />
                            ))}
                            {materials.length === 0 && (
                                <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400 dark:text-dk-muted text-xs">
                                    <div className="flex flex-col items-center gap-2">
                                        <Package className="w-10 h-10 opacity-20" />
                                        {tx(lang, {fr:'Aucune matière ajoutée. Cliquez sur ',ar:'لم تتم إضافة أي مادة. انقر على ',en:'No materials added. Click ',es:'Ningún material añadido. Haga clic en ',pt:'Nenhum material adicionado. Clique em ',tr:'Malzeme eklenmedi. Tıklayın: '})}<span className="text-[#2149C1] font-bold">{t.addMat}</span>
                                    </div>
                                </td></tr>
                            )}
                        </tbody>
                        <tfoot className={`${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-slate-50/80 border-slate-100 dark:border-dk-border text-slate-800 dark:text-dk-text'} border-t`}>
                            <tr>
                                <td colSpan={3} className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-dk-muted text-right">{t.totalMat || tx(lang, {fr:'Total Matière',ar:'إجمالي المواد',en:'Total Material',es:'Total Material',pt:'Total Material',tr:'Toplam Malzeme'})}</td>
                                <td className="px-3 py-1.5 text-right">
                                    <span className="text-[13px] font-semibold tabular-nums text-slate-900 dark:text-dk-text">{fmt(totalMaterials)} <span className="text-[9px] font-normal text-slate-400 dark:text-dk-muted">{currency}</span></span>
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Mobile: Card Layout */}
                <div className="md:hidden">
                    {materials.map((item) => (
                        <MaterialRow key={item.id} item={item} t={t} currency={currency} darkMode={darkMode}
                            inputCls={inputCls} optionStyle={optionStyle} magasinData={magasinData}
                            focusedRow={focusedRow} setFocusedRow={setFocusedRow} focusedRefRow={focusedRefRow}
                            setFocusedRefRow={setFocusedRefRow} updateMaterial={updateMaterial}
                            deleteMaterial={deleteMaterial} canAssign={canAssign} expandedScope={expandedScope}
                            setExpandedScope={setExpandedScope} toggleScopeColor={toggleScopeColor}
                            toggleScopeSize={toggleScopeSize} scopeColors={scopeColors} scopeSizes={scopeSizes}
                            ScopeChip={ScopeChip} colorHex={colorHex} setQuickAddForm={setQuickAddForm}
                            setQuickAddTargetRow={setQuickAddTargetRow} setShowQuickAddModal={setShowQuickAddModal}
                            expandedBobine={expandedBobine} setExpandedBobine={setExpandedBobine} setMaterialScope={setMaterialScope} view="mobile" />
                    ))}
                    {materials.length === 0 && (
                        <div className="px-3 py-10 text-center text-slate-400 dark:text-dk-muted text-xs">
                            <div className="flex flex-col items-center gap-2">
                                <Package className="w-10 h-10 opacity-20" />
                                {tx(lang, {fr:'Aucune matière ajoutée. Cliquez sur ',ar:'لم تتم إضافة أي مادة. انقر على ',en:'No materials added. Click ',es:'Ningún material añadido. Haga clic en ',pt:'Nenhum material adicionado. Clique em ',tr:'Malzeme eklenmedi. Tıklayın: '})}<span className="text-[#2149C1] font-bold">{t.addMat}</span>
                            </div>
                        </div>
                    )}
                    {/* Mobile Total */}
                    <div className={`px-3 py-2 border-t ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-slate-100 dark:border-dk-border bg-slate-50/80'} flex items-center justify-between`}>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-dk-muted">{t.totalMat || tx(lang, {fr:'Total Matière',ar:'إجمالي المواد',en:'Total Material',es:'Total Material',pt:'Total Material',tr:'Toplam Malzeme'})}</span>
                        <span className="text-[13px] font-semibold tabular-nums text-slate-900 dark:text-dk-text">{fmt(totalMaterials)} <span className="text-[9px] font-normal text-slate-400 dark:text-dk-muted">{currency}</span></span>
                    </div>
                </div>
            </div>
        </>
    );
};

/* ============================================================
   MATERIAL ROW — shared logic for desktop & mobile views
   ============================================================ */
interface MaterialRowProps {
    item: Material; t: any; currency: string; darkMode: boolean;
    inputCls: string; optionStyle: React.CSSProperties;
    magasinData: MagasinItem[]; focusedRow: number | null;
    setFocusedRow: (id: number | null) => void;
    focusedRefRow: number | null; setFocusedRefRow: (id: number | null) => void;
    updateMaterial: (id: number, field: string, value: any) => void;
    deleteMaterial: (id: number) => void;
    canAssign: boolean; expandedScope: number | null;
    setExpandedScope: React.Dispatch<React.SetStateAction<number | null>>;
    setMaterialScope?: (id: number, scope: Material['scope']) => void;
    toggleScopeColor: (m: Material, cid: string) => void;
    toggleScopeSize: (m: Material, si: number) => void;
    scopeColors: any[]; scopeSizes: any[];
    ScopeChip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; hex?: string | null }>;
    colorHex: (cid: string) => string | null;
    setQuickAddForm: (f: any) => void;
    setQuickAddTargetRow: (id: number | null) => void;
    setShowQuickAddModal: (v: boolean) => void;
    expandedBobine: number | null; setExpandedBobine: (id: number | null) => void;
    view: 'desktop' | 'mobile';
}

const MaterialRow: React.FC<MaterialRowProps> = ({
    item, t, currency, darkMode, inputCls, optionStyle, magasinData,
    focusedRow, setFocusedRow, focusedRefRow, setFocusedRefRow,
    updateMaterial, deleteMaterial, canAssign, expandedScope, setExpandedScope,
    toggleScopeColor, toggleScopeSize, scopeColors, scopeSizes, ScopeChip, colorHex,
    setQuickAddForm, setQuickAddTargetRow, setShowQuickAddModal,
    expandedBobine, setExpandedBobine, view, setMaterialScope
}) => {
    const { lang } = useLang();
    const filteredMagasin = focusedRow === item.id
        ? magasinData.filter(m => {
            const q = (item.name || '').toLowerCase();
            return (m.nom || m.designation || '').toLowerCase().includes(q)
                || (m.reference || '').toLowerCase().includes(q)
                || (m.categorie || '').toLowerCase().includes(q);
        })
        : [];

    const isMobile = view === 'mobile';
    const isBobine = item.unit === 'bobine';
    const bobineOpen = expandedBobine === item.id;

    const mMatch = magasinData.find(m => (m.nom || m.designation) === item.name);

    if (isMobile) {
        return (
            <div className={`border-b ${darkMode ? 'border-gray-700' : 'border-slate-100 dark:border-dk-border'} animate-in fade-in duration-150`}>
                {/* Mobile Card */}
                <div className="p-3">
                    {/* Row 1: Name + Total */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 relative">
                            <input type="text" value={item.name}
                                onChange={(e) => updateMaterial(item.id, 'name', e.target.value)}
                                onFocus={() => setFocusedRow(item.id)}
                                onBlur={() => setTimeout(() => setFocusedRow(null), 250)}
                                className={`${inputCls} font-medium text-[13px]`}
                                placeholder={tx(lang, {fr:"Rechercher matière...",ar:"بحث عن مادة...",en:"Search material...",es:"Buscar material...",pt:"Pesquisar material...",tr:"Malzeme ara..."})} />
                            <Search className="w-3 h-3 text-slate-400 dark:text-dk-muted absolute right-2 top-2 pointer-events-none" />
                            {/* Autocomplete Mobile */}
                            {focusedRow === item.id && (filteredMagasin.length > 0 || (item.name && filteredMagasin.length === 0)) && (
                                <div className="absolute z-[100] left-0 right-0 top-[38px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg shadow-lg max-h-48 overflow-y-auto animate-in fade-in">
                                    {filteredMagasin.length > 0 ? filteredMagasin.map(m => (
                                        <div key={m.id}
                                            className={`p-2.5 border-b border-slate-50 cursor-pointer hover:bg-slate-50 dark:hover:bg-dk-elevated/60 ${!m.stockActuel ? 'opacity-70' : ''}`}
                                            onMouseDown={(e) => { e.preventDefault(); updateMaterial(item.id, 'IMPORT_MAGASIN', { ...m, prix: m.prixUnitaire || 0 }); setFocusedRow(null); }}>
                                            <div className="flex justify-between items-start">
                                                <span className="font-bold text-[12px] text-slate-800 dark:text-dk-text">{m.nom || m.designation}</span>
                                                <span className="font-bold text-[10px] text-[#2149C1] bg-slate-100 dark:bg-dk-elevated px-1.5 py-0.5 rounded">{(m.prixUnitaire || 0).toFixed(2)} {currency}</span>
                                            </div>
                                            <div className="flex justify-between items-center mt-0.5">
                                                <span className="text-[9px] text-slate-400 dark:text-dk-muted">{m.reference || '—'}</span>
                                                <span className={`text-[9px] font-bold ${(m.stockActuel || 0) === 0 ? 'text-red-500' : 'text-emerald-600'}`}>{tx(lang, {fr:'Stock: ',ar:'المخزون: ',en:'Stock: ',es:'Stock: ',pt:'Stock: ',tr:'Stok: '})}{m.stockActuel || 0}</span>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="p-2.5 text-center">
                                            <span className="text-[10px] text-slate-400 dark:text-dk-muted italic">{tx(lang, {fr:'Aucune matière trouvée',ar:'لم يتم العثور على مادة',en:'No material found',es:'No se encontró material',pt:'Nenhum material encontrado',tr:'Malzeme bulunamadı'})}</span>
                                            {item.name && item.name.length > 1 && (
                                                <button onMouseDown={(e) => { e.preventDefault(); setQuickAddTargetRow(item.id); setQuickAddForm({ nom: item.name }); setShowQuickAddModal(true); setFocusedRow(null); }}
                                                    className="w-full mt-2 py-1.5 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-700 dark:text-dk-text-soft font-medium text-[10px] rounded-lg hover:bg-slate-100 transition-colors flex items-center justify-center gap-1">
                                                    <Plus className="w-3 h-3" /> {tx(lang, {fr:'Ajouter ',ar:'إضافة ',en:'Add ',es:'Añadir ',pt:'Adicionar ',tr:'Ekle '})}"{item.name}"
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Magasin Info Mobile */}
                            {mMatch && !focusedRow && (
                                <div className="mt-1.5 flex items-center gap-2 p-1.5 bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border rounded-lg text-[10px]">
                                    <div className="w-7 h-7 rounded bg-slate-200 flex items-center justify-center text-slate-400 dark:text-dk-muted shrink-0">
                                        {mMatch.image ? <img src={mMatch.image} className="w-full h-full rounded object-cover" alt="" /> : <Package className="w-3.5 h-3.5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1">
                                            <span className="font-bold text-slate-700 dark:text-dk-text-soft truncate">{mMatch.reference || '—'}</span>
                                            <span className={`px-1 py-0.5 rounded text-[8px] font-semibold ${(mMatch.stockActuel || 0) === 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                                {mMatch.stockActuel || 0} {mMatch.unite}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="text-right shrink-0">
                            <span className="text-[15px] font-bold tabular-nums text-slate-900 dark:text-dk-text">{fmt(item.unitPrice * item.qty)}</span>
                            <span className="text-[9px] text-slate-400 dark:text-dk-muted ml-0.5">{currency}</span>
                        </div>
                    </div>

                    {/* Row 2: Price + Qty + Unit */}
                    <div className="flex items-center gap-2 mb-1.5">
                        <div className="flex-1">
                            <label className="text-[9px] text-slate-400 dark:text-dk-muted uppercase mb-0.5 block">{tx(lang, {fr:'Prix',ar:'السعر',en:'Price',es:'Precio',pt:'Preço',tr:'Fiyat'})}</label>
                            <input type="number" min="0" value={item.unitPrice}
                                onChange={(e) => updateMaterial(item.id, 'unitPrice', e.target.value)}
                                className={`${inputCls} text-center font-mono text-[13px]`} />
                        </div>
                        <div className="flex-1">
                            <label className="text-[9px] text-slate-400 dark:text-dk-muted uppercase mb-0.5 block">{tx(lang, {fr:'Qté',ar:'الكمية',en:'Qty',es:'Cant.',pt:'Qtd',tr:'Miktar'})}</label>
                            {isBobine ? (
                                <div className={`${inputCls} text-center font-mono text-[13px] flex items-center justify-between`}>
                                    <span>{fmt(item.qty)}</span>
                                    <button onClick={() => setExpandedBobine(bobineOpen ? null : item.id)} className="text-slate-400 dark:text-dk-muted hover:text-[#2149C1]">
                                        {bobineOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    </button>
                                </div>
                            ) : (
                                <input type="number" min="0" step="0.001" value={item.qty}
                                    onChange={(e) => updateMaterial(item.id, 'qty', e.target.value)}
                                    className={`${inputCls} text-center font-mono text-[13px]`} />
                            )}
                        </div>
                        <div className="w-16">
                            <label className="text-[9px] text-slate-400 dark:text-dk-muted uppercase mb-0.5 block">{tx(lang, {fr:'Unité',ar:'الوحدة',en:'Unit',es:'Unidad',pt:'Unidade',tr:'Birim'})}</label>
                            <select value={item.unit} onChange={(e) => updateMaterial(item.id, 'unit', e.target.value)}
                                className={`${inputCls} text-[11px] font-bold cursor-pointer`}>
                                {['m','pc','kg','g','bobine','cm','cone','l'].map(u => <option key={u} value={u} style={optionStyle}>{u}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Row 3: Bobine details (collapsible) */}
                    {isBobine && bobineOpen && (
                        <div className={`p-2 rounded-lg border mt-1.5 animate-in fade-in duration-150 ${darkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-100'}`}>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[9px] text-blue-600 font-bold shrink-0">{tx(lang, {fr:'Fil(m):',ar:'الخيط (م):',en:'Thread(m):',es:'Hilo(m):',pt:'Fio(m):',tr:'İplik(m):'})}</span>
                                <input type="number" min="0" placeholder={tx(lang, {fr:"Métrage",ar:"الطول بالأمتار",en:"Length (m)",es:"Metraje",pt:"Metragem",tr:"Uzunluk (m)"})} value={item.threadMeters || ''}
                                    onChange={(e) => updateMaterial(item.id, 'threadMeters', e.target.value)}
                                    className={`flex-1 text-[11px] font-mono border rounded px-1 outline-none text-center h-6 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white dark:bg-dk-surface border-blue-200 text-slate-700 dark:text-dk-text-soft'}`} />
                                <span className="text-slate-400 dark:text-dk-muted text-[10px] font-bold">/</span>
                                <input type="number" min="0" placeholder={tx(lang, {fr:"Capacité",ar:"السعة",en:"Capacity",es:"Capacidad",pt:"Capacidade",tr:"Kapasite"})} value={item.threadCapacity || ''}
                                    onChange={(e) => updateMaterial(item.id, 'threadCapacity', e.target.value)}
                                    className={`flex-1 text-[11px] font-mono border rounded px-1 outline-none text-center h-6 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white dark:bg-dk-surface border-blue-200 text-slate-700 dark:text-dk-text-soft'}`} />
                            </div>
                            {(item.threadColor || item.threadReference) && (
                                <div className="mt-1.5 relative">
                                    <div className={`flex items-center gap-1.5 px-1.5 py-1 rounded border w-full ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>
                                        {item.threadColor && <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft font-medium">{item.threadColor}</span>}
                                        <input type="text" placeholder={tx(lang, {fr:"Réf (NM50, TEX...)",ar:"المرجع (NM50, TEX...)",en:"Ref (NM50, TEX...)",es:"Ref (NM50, TEX...)",pt:"Ref (NM50, TEX...)",tr:"Ref (NM50, TEX...)"})} value={String(item.threadReference || '')}
                                            onChange={(e) => updateMaterial(item.id, 'threadReference', e.target.value)}
                                            onFocus={() => setFocusedRefRow(item.id)}
                                            onBlur={() => setTimeout(() => setFocusedRefRow(null), 250)}
                                            className={`flex-1 text-[10px] border rounded px-1 py-0.5 outline-none ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft'}`} />
                                    </div>
                                    {focusedRefRow === item.id && item.threadReference && (
                                        <div className={`absolute z-50 mt-1 w-full max-h-36 overflow-y-auto rounded-lg border shadow-lg ${darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>
                                            {magasinData.filter(m => {
                                                const q = String(item.threadReference || '').toLowerCase();
                                                return ((m.reference || '').toLowerCase().includes(q) || (m.nom || m.designation || '').toLowerCase().includes(q)) && (m.categorie === 'fil' || !m.categorie);
                                            }).slice(0, 5).map(m => (
                                                <button key={m.id}
                                                    onMouseDown={(e) => { e.preventDefault(); updateMaterial(item.id, 'IMPORT_MAGASIN', { ...m, prix: m.prixUnitaire }); setFocusedRefRow(null); }}
                                                    className={`w-full text-left px-2 py-1.5 text-[10px] hover:bg-blue-50 border-b last:border-0 ${darkMode ? 'hover:bg-gray-700 border-gray-700' : 'border-slate-100 dark:border-dk-border'}`}>
                                                    <div className="flex justify-between"><span className="font-bold text-slate-700 dark:text-dk-text-soft">{m.nom || m.designation}</span><span className="text-[9px] text-slate-400 dark:text-dk-muted">{m.reference}</span></div>
                                                </button>
                                            ))}
                                            {magasinData.filter(m => {
                                                const q = String(item.threadReference || '').toLowerCase();
                                                return ((m.reference || '').toLowerCase().includes(q) || (m.nom || m.designation || '').toLowerCase().includes(q)) && (m.categorie === 'fil' || !m.categorie);
                                            }).length === 0 && <div className="px-2 py-1.5 text-[10px] text-slate-400 dark:text-dk-muted text-center">{tx(lang, {fr:'Aucun fil trouvé',ar:'لم يتم العثور على خيط',en:'No thread found',es:'No se encontró hilo',pt:'Nenhum fio encontrado',tr:'İplik bulunamadı'})}</div>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Row 4: Actions */}
                    <div className="flex items-center justify-end gap-1 mt-1.5">
                        {canAssign && (
                            <button onClick={() => setExpandedScope(prev => prev === item.id ? null : item.id)}
                                className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${expandedScope === item.id || item.scope ? 'text-[#2149C1] bg-slate-100 dark:bg-dk-elevated' : 'text-slate-400 dark:text-dk-muted hover:text-[#2149C1] hover:bg-slate-100'}`}>
                                <Palette className="w-3 h-3" /> {tx(lang, {fr:'Affecter',ar:'تعيين',en:'Assign',es:'Asignar',pt:'Atribuir',tr:'Ata'})}
                            </button>
                        )}
                        <button onClick={() => deleteMaterial(item.id)}
                            className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium text-slate-400 dark:text-dk-muted hover:text-rose-500 hover:bg-rose-50 transition-colors">
                            <Trash2 className="w-3 h-3" /> {tx(lang, {fr:'Supprimer',ar:'حذف',en:'Delete',es:'Eliminar',pt:'Eliminar',tr:'Sil'})}
                        </button>
                    </div>

                    {/* Scope Chips Mobile */}
                    {canAssign && expandedScope === item.id && (
                        <div className="mt-2 p-2 bg-slate-100/40 border border-slate-200 dark:border-dk-border rounded-lg animate-in fade-in duration-150">
                            <div className="flex flex-wrap items-center gap-1">
                                {scopeColors.length > 0 && (
                                    <>
                                        <Palette className="w-3 h-3 text-slate-400 dark:text-dk-muted shrink-0" />
                                        <ScopeChip active={!item.scope?.colors?.length} onClick={() => setMaterialScope?.(item.id, { ...item.scope, colors: [] })}>{tx(lang, {fr:'Toutes',ar:'الكل',en:'All',es:'Todas',pt:'Todas',tr:'Tümü'})}</ScopeChip>
                                        {scopeColors.map(c => (
                                            <ScopeChip key={c.id} active={!!item.scope?.colors?.length && item.scope.colors.includes(c.id)} onClick={() => toggleScopeColor(item, c.id)} hex={colorHex(c.id)}>{c.name}</ScopeChip>
                                        ))}
                                    </>
                                )}
                                {scopeColors.length > 0 && scopeSizes.length > 0 && <span className="w-px h-3 bg-slate-200 mx-0.5 shrink-0" />}
                                {scopeSizes.length > 0 && (
                                    <>
                                        <Ruler className="w-3 h-3 text-slate-400 dark:text-dk-muted shrink-0" />
                                        <ScopeChip active={!item.scope?.sizes?.length} onClick={() => setMaterialScope?.(item.id, { ...item.scope, sizes: [] })}>{tx(lang, {fr:'Toutes',ar:'الكل',en:'All',es:'Todas',pt:'Todas',tr:'Tümü'})}</ScopeChip>
                                        {scopeSizes.map((s, i) => (
                                            <ScopeChip key={i} active={!!item.scope?.sizes?.length && item.scope.sizes.includes(i)} onClick={() => toggleScopeSize(item, i)}>{s}</ScopeChip>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    /* ===== DESKTOP VIEW ===== */
    return (
    <React.Fragment>
        <tr className={`group ${darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-slate-50 dark:hover:bg-dk-elevated/60'} transition-colors`}>
            {/* MATIERE */}
            <td className="px-3 py-1.5 align-top relative">
                <div className="flex items-center gap-1.5">
                    {/* Bouton Affecter — toujours visible devant le nom */}
                    {canAssign && (
                        <button
                            onClick={() => setExpandedScope(prev => prev === item.id ? null : item.id)}
                            title={tx(lang, {fr:'Affecter couleurs / tailles',ar:'تعيين الألوان / المقاسات',en:'Assign colors / sizes',es:'Asignar colores / tallas',pt:'Atribuir cores / tamanhos',tr:'Renk / beden ata'})}
                            className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                                expandedScope === item.id || item.scope
                                    ? 'text-[#2149C1] bg-indigo-100'
                                    : 'text-slate-400 dark:text-dk-muted hover:text-[#2149C1] hover:bg-indigo-50 dark:bg-dk-accent/20'
                            }`}
                        >
                            <Palette className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <div className="relative flex-1">
                        <input type="text" value={item.name}
                            onChange={(e) => updateMaterial(item.id, 'name', e.target.value)}
                            onFocus={() => setFocusedRow(item.id)}
                            onBlur={() => setTimeout(() => setFocusedRow(null), 250)}
                            className={`${inputCls} font-medium pr-6`}
                            placeholder={tx(lang, {fr:'Rechercher matière...',ar:'بحث عن مادة...',en:'Search material...',es:'Buscar material...',pt:'Pesquisar material...',tr:'Malzeme ara...'})} />
                        <Search className="w-3 h-3 text-slate-400 dark:text-dk-muted absolute right-2 top-2 pointer-events-none" />
                    </div>
                </div>
                {/* Autocomplete Desktop */}
                {focusedRow === item.id && (filteredMagasin.length > 0 || (item.name && filteredMagasin.length === 0)) && (
                    <div className="absolute z-[100] left-0 right-0 top-[34px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg shadow-lg max-h-48 overflow-y-auto animate-in fade-in">
                        {filteredMagasin.length > 0 ? filteredMagasin.slice(0, 6).map(m => (
                            <div key={m.id}
                                className={`p-2 border-b border-slate-50 cursor-pointer hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex justify-between items-center ${!m.stockActuel ? 'opacity-70' : ''}`}
                                onMouseDown={(e) => { e.preventDefault(); updateMaterial(item.id, 'IMPORT_MAGASIN', { ...m, prix: m.prixUnitaire || 0 }); setFocusedRow(null); }}>
                                <div className="flex-1 min-w-0">
                                    <span className="font-bold text-[12px] text-slate-800 dark:text-dk-text block truncate">{m.nom || m.designation}</span>
                                    <span className="text-[9px] text-slate-400 dark:text-dk-muted">{m.reference || '—'}</span>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                    <span className="font-bold text-[10px] text-[#2149C1] bg-slate-100 dark:bg-dk-elevated px-1.5 py-0.5 rounded">{(m.prixUnitaire || 0).toFixed(2)}</span>
                                    <span className={`ml-1 text-[9px] font-bold ${(m.stockActuel || 0) === 0 ? 'text-red-500' : 'text-emerald-600'}`}>{m.stockActuel || 0}</span>
                                </div>
                            </div>
                        )) : (
                            <div className="p-2 text-center">
                                <span className="text-[10px] text-slate-400 dark:text-dk-muted italic">{tx(lang, {fr:'Aucune matière trouvée',ar:'لم يتم العثور على مادة',en:'No material found',es:'No se encontró material',pt:'Nenhum material encontrado',tr:'Malzeme bulunamadı'})}</span>
                                {item.name && item.name.length > 1 && (
                                    <button onMouseDown={(e) => { e.preventDefault(); setQuickAddTargetRow(item.id); setQuickAddForm({ nom: item.name }); setShowQuickAddModal(true); setFocusedRow(null); }}
                                        className="w-full mt-1.5 py-1.5 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-700 dark:text-dk-text-soft font-medium text-[10px] rounded-lg hover:bg-slate-100 transition-colors flex items-center justify-center gap-1">
                                        <Plus className="w-3 h-3" /> {tx(lang, {fr:'Ajouter ',ar:'إضافة ',en:'Add ',es:'Añadir ',pt:'Adicionar ',tr:'Ekle '})}"{item.name}"
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {/* Magasin info line */}
                {mMatch && !focusedRow && (
                    <div className="mt-1 flex items-center gap-1.5 text-[9px] text-slate-500 dark:text-dk-muted">
                        <span className="px-1 py-0.5 rounded bg-slate-100 dark:bg-dk-elevated font-bold">{mMatch.reference || '—'}</span>
                        <span className={`px-1 py-0.5 rounded font-bold ${(mMatch.stockActuel || 0) === 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            Stock: {mMatch.stockActuel || 0} {mMatch.unite}
                        </span>
                    </div>
                )}
                {/* Scope tags — colors & sizes assigned via Affecter */}
                {(item.scope?.colors?.length || item.scope?.sizes?.length) ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {item.scope?.colors?.length ? (
                            item.scope.colors.map(cid => {
                                const col = scopeColors.find(c => c.id === cid);
                                if (!col) return null;
                                const hex = col.id?.startsWith('#') ? col.id : null;
                                return (
                                    <span key={cid} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text text-[9px] font-semibold border border-indigo-100">
                                        {hex && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />}
                                        {col.name}
                                    </span>
                                );
                            })
                        ) : null}
                        {item.scope?.colors?.length && item.scope?.sizes?.length ? (
                            <span className="w-px h-3 bg-slate-200 mx-0.5 shrink-0" />
                        ) : null}
                        {item.scope?.sizes?.length ? (
                            item.scope.sizes.map(si => (
                                <span key={si} className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[9px] font-semibold border border-amber-100">
                                    {scopeSizes[si] ?? si}
                                </span>
                            ))
                        ) : null}
                    </div>
                ) : null}
            </td>

            {/* PRIX */}
            <td className="px-3 py-1.5 align-middle text-center">
                <input type="number" min="0" value={item.unitPrice}
                    onChange={(e) => updateMaterial(item.id, 'unitPrice', e.target.value)}
                    className={`${inputCls} text-center font-mono w-20`} />
            </td>

            {/* QTE / UNITE */}
            <td className="px-3 py-1.5 align-middle">
                <div className="flex items-center gap-1.5 justify-center">
                    {isBobine ? (
                        <div className={`flex items-center gap-1.5 rounded px-2 py-1 text-center font-mono border ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-300 dark:text-dk-muted' : 'bg-slate-50 dark:bg-dk-bg border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft'}`}>
                            <span className="text-[12px]">{fmt(item.qty)}</span>
                            <button onClick={() => setExpandedBobine(bobineOpen ? null : item.id)} className="text-slate-400 dark:text-dk-muted hover:text-[#2149C1]">
                                {bobineOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                        </div>
                    ) : (
                        <input type="number" min="0" step="0.001" value={item.qty}
                            onChange={(e) => updateMaterial(item.id, 'qty', e.target.value)}
                            className={`${inputCls} text-center w-20 font-mono`} />
                    )}
                    <select value={item.unit} onChange={(e) => updateMaterial(item.id, 'unit', e.target.value)}
                        className={`rounded px-1.5 py-1 text-[11px] outline-none border cursor-pointer ${darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-slate-50 dark:bg-dk-bg border-slate-300 text-slate-700 dark:text-dk-text-soft font-bold'}`}>
                        {['m','pc','kg','g','bobine','cm','cone','l'].map(u => <option key={u} value={u} style={optionStyle}>{u}</option>)}
                    </select>
                </div>
                {/* Bobine details (collapsible) */}
                {isBobine && bobineOpen && (
                    <div className={`mt-1.5 p-2 rounded border animate-in fade-in duration-150 ${darkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-100'}`}>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-blue-600 font-bold shrink-0">{tx(lang, {fr:'Fil(m):',ar:'الخيط (م):',en:'Thread(m):',es:'Hilo(m):',pt:'Fio(m):',tr:'İplik(m):'})}</span>
                            <input type="number" min="0" placeholder={tx(lang, {fr:'Métrage',ar:'الطول بالأمتار',en:'Length (m)',es:'Metraje',pt:'Metragem',tr:'Uzunluk (m)'})} value={item.threadMeters || ''}
                                onChange={(e) => updateMaterial(item.id, 'threadMeters', e.target.value)}
                                className={`flex-1 text-[10px] font-mono border rounded px-1 outline-none text-center h-5 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white dark:bg-dk-surface border-blue-200 text-slate-700 dark:text-dk-text-soft'}`} />
                            <span className="text-slate-400 dark:text-dk-muted text-[10px] font-bold">/</span>
                            <input type="number" min="0" placeholder={tx(lang, {fr:'Capacité',ar:'السعة',en:'Capacity',es:'Capacidad',pt:'Capacidade',tr:'Kapasite'})} value={item.threadCapacity || ''}
                                onChange={(e) => updateMaterial(item.id, 'threadCapacity', e.target.value)}
                                className={`flex-1 text-[10px] font-mono border rounded px-1 outline-none text-center h-5 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white dark:bg-dk-surface border-blue-200 text-slate-700 dark:text-dk-text-soft'}`} />
                        </div>
                        {(item.threadColor || item.threadReference) && (
                            <div className="mt-1 relative">
                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border w-full ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>
                                    {item.threadColor && <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft font-medium">{item.threadColor}</span>}
                                    <input type="text" placeholder={tx(lang, {fr:'Réf (NM50, TEX...)',ar:'المرجع (NM50, TEX...)',en:'Ref (NM50, TEX...)',es:'Ref (NM50, TEX...)',pt:'Ref (NM50, TEX...)',tr:'Ref (NM50, TEX...)'})} value={String(item.threadReference || '')}
                                        onChange={(e) => updateMaterial(item.id, 'threadReference', e.target.value)}
                                        onFocus={() => setFocusedRefRow(item.id)}
                                        onBlur={() => setTimeout(() => setFocusedRefRow(null), 250)}
                                        className={`flex-1 text-[9px] border rounded px-1 py-0.5 outline-none ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft'}`} />
                                </div>
                                {focusedRefRow === item.id && item.threadReference && (
                                    <div className={`absolute z-50 mt-1 w-full max-h-32 overflow-y-auto rounded border shadow-lg ${darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>
                                        {magasinData.filter(m => {
                                            const q = String(item.threadReference || '').toLowerCase();
                                            return ((m.reference || '').toLowerCase().includes(q) || (m.nom || m.designation || '').toLowerCase().includes(q)) && (m.categorie === 'fil' || !m.categorie);
                                        }).slice(0, 5).map(m => (
                                            <button key={m.id}
                                                onMouseDown={(e) => { e.preventDefault(); updateMaterial(item.id, 'IMPORT_MAGASIN', { ...m, prix: m.prixUnitaire }); setFocusedRefRow(null); }}
                                                className={`w-full text-left px-2 py-1 text-[9px] hover:bg-blue-50 border-b last:border-0 ${darkMode ? 'hover:bg-gray-700 border-gray-700' : 'border-slate-100 dark:border-dk-border'}`}>
                                                <span className="font-bold text-slate-700 dark:text-dk-text-soft">{m.nom || m.designation}</span>
                                                <span className="ml-1 text-slate-400 dark:text-dk-muted">{m.reference}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </td>

            {/* TOTAL */}
            <td className="px-3 py-1.5 align-middle text-right">
                <span className="text-[12px] font-semibold tabular-nums text-slate-900 dark:text-dk-text" title={`${item.unitPrice} × ${fmt(item.qty)} = ${fmt(item.unitPrice * item.qty)}`}>
                    {fmt(item.unitPrice * item.qty)} <span className="text-[9px] font-normal text-slate-400 dark:text-dk-muted">{currency}</span>
                </span>
            </td>

            {/* ACTIONS */}
            <td className="px-3 py-1.5 align-middle text-center">
                <div className="flex items-center justify-center gap-0.5">
                    <button onClick={() => deleteMaterial(item.id)} title={tx(lang, {fr:"Supprimer",ar:"حذف",en:"Delete",es:"Eliminar",pt:"Excluir",tr:"Sil"})}
                        className="p-1 rounded text-slate-400 dark:text-dk-muted hover:text-rose-500 hover:bg-rose-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </td>
        </tr>

        {/* Scope row — separate <tr> at same level */}
        {canAssign && expandedScope === item.id && (
            <tr>
                <td colSpan={5} className="px-3 py-2 bg-slate-100/40 border-b border-slate-200 dark:border-dk-border">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {scopeColors.length > 0 && (
                            <>
                                <Palette className="w-3 h-3 text-slate-400 dark:text-dk-muted shrink-0" />
                                <ScopeChip active={!item.scope?.colors?.length} onClick={() => setMaterialScope?.(item.id, { ...item.scope, colors: [] })}>{tx(lang, {fr:'Toutes',ar:'الكل',en:'All',es:'Todas',pt:'Todas',tr:'Tümü'})}</ScopeChip>
                                {scopeColors.map(c => (
                                    <ScopeChip key={c.id} active={!!item.scope?.colors?.length && item.scope.colors.includes(c.id)} onClick={() => toggleScopeColor(item, c.id)} hex={colorHex(c.id)}>{c.name}</ScopeChip>
                                ))}
                            </>
                        )}
                        {scopeColors.length > 0 && scopeSizes.length > 0 && <span className="w-px h-3 bg-slate-200 mx-0.5 shrink-0" />}
                        {scopeSizes.length > 0 && (
                            <>
                                <Ruler className="w-3 h-3 text-slate-400 dark:text-dk-muted shrink-0" />
                                <ScopeChip active={!item.scope?.sizes?.length} onClick={() => setMaterialScope?.(item.id, { ...item.scope, sizes: [] })}>{tx(lang, {fr:'Toutes',ar:'الكل',en:'All',es:'Todas',pt:'Todas',tr:'Tümü'})}</ScopeChip>
                                {scopeSizes.map((s, i) => (
                                    <ScopeChip key={i} active={!!item.scope?.sizes?.length && item.scope.sizes.includes(i)} onClick={() => toggleScopeSize(item, i)}>{s}</ScopeChip>
                                ))}
                            </>
                        )}
                    </div>
                </td>
            </tr>
        )}
    </React.Fragment>
    );
};

export default MaterialsList;
