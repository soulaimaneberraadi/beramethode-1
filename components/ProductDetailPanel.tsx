import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    X, Package, TrendingUp, TrendingDown, History, Building2, MapPin,
    Phone, Mail, Edit2, Save, ChevronRight, Layers, Factory, Calendar,
    AlertTriangle, CheckCircle, Clock, ArrowUpCircle, ArrowDownCircle,
    Droplets, DollarSign, BarChart3, Activity, ExternalLink, Truck,
    FileText, Hash, Globe, CreditCard, Timer, ShoppingCart, StickyNote
} from 'lucide-react';
import { MouvementStock } from '../types';
import { tx, type TxMap } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';
import InlineInvoiceList from './InlineInvoiceList';

export interface MagasinProduct {
    id: string;
    reference: string;
    designation: string;
    categorie: 'tissu' | 'fil' | 'bouton' | 'fermeture' | 'etiquette' | 'emballage' | 'autre';
    unite: 'm' | 'kg' | 'piece' | 'cone' | 'boite' | 'rouleau';
    photo?: string;
    fournisseurNom?: string;
    fournisseurTel?: string;
    fournisseurEmail?: string;
    fournisseurAdresse?: string;
    fournisseurIce?: string;
    fournisseurRc?: string;
    fournisseurConditionsPaiement?: string;
    fournisseurDelaiLivraisonJours?: number;
    fournisseurMoq?: number;
    fournisseurDevise?: string;
    fournisseurContact?: string;
    fournisseurNotes?: string;
    fournisseurLogo?: string;
    chaineExclusive?: string;
    emplacement?: string;
    prixUnitaire: number;
    cump?: number;
    stockAlerte: number;
}

export interface LotStock {
    id: string;
    productId: string;
    quantiteRestante: number;
    quantiteInitiale: number;
    prixUnitaire: number;
    dateEntree: string;
    fournisseur?: string;
    numBain?: string;
    dateExpiration?: string;
    variante?: string;
    etat?: 'disponible' | 'quarantaine';
}

interface ProductDetailPanelProps {
    product: MagasinProduct;
    lots: LotStock[];
    mouvements: MouvementStock[];
    onClose: () => void;
    onSave: (product: MagasinProduct) => void;
    onEditMovement?: (movement: MouvementStock) => void;
    initialTab?: 'overview' | 'history' | 'supplier' | 'lots';
    startEditing?: boolean;
    lang?: 'fr' | 'ar' | 'en';
}

const stockQty = (lots: LotStock[], pid: string) => 
    lots.filter(l => l.productId === pid).reduce((s, l) => s + l.quantiteRestante, 0);

const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' });
const formatTime = (d: string) => new Date(d).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });

const CAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    tissu: { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700', border: 'border-blue-200' },
    fil: { bg: 'bg-purple-50 dark:bg-purple-900/30', text: 'text-purple-700', border: 'border-purple-200' },
    bouton: { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700', border: 'border-amber-200' },
    fermeture: { bg: 'bg-slate-50 dark:bg-dk-bg', text: 'text-slate-700 dark:text-dk-text-soft', border: 'border-slate-200 dark:border-dk-border' },
    etiquette: { bg: 'bg-green-50 dark:bg-green-900/30', text: 'text-green-700', border: 'border-green-200' },
    emballage: { bg: 'bg-orange-50 dark:bg-orange-900/30', text: 'text-orange-700', border: 'border-orange-200' },
    autre: { bg: 'bg-rose-50 dark:bg-rose-900/30', text: 'text-rose-700', border: 'border-rose-200' },
};

const MVT_ICONS: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    entree: { icon: ArrowDownCircle, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    sortie: { icon: ArrowUpCircle, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30' },
    regularisation: { icon: Activity, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    retour_atelier: { icon: Factory, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    rebut: { icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
    reservation: { icon: Clock, color: 'text-violet-600', bg: 'bg-violet-50' },
};

export default function ProductDetailPanel({ product, lots, mouvements, onClose, onSave, onEditMovement, initialTab, startEditing, lang: propLang = 'fr' }: ProductDetailPanelProps) {
    const { lang: ctxLang } = useLang();
    const lang = ctxLang || propLang;
    const _ = useCallback((m: TxMap) => tx(lang, m), [lang]);
    const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'supplier' | 'lots' | 'factures'>(initialTab || 'overview');
    const [isEditing, setIsEditing] = useState(!!startEditing);
    const [editData, setEditData] = useState<MagasinProduct>({ ...product });

    useEffect(() => {
        setEditData({ ...product });
    }, [product]);

    useEffect(() => {
        setActiveTab(initialTab || 'overview');
        setIsEditing(!!startEditing);
    }, [initialTab, startEditing]);

    const productLots = useMemo(() => lots.filter(l => l.productId === product.id), [lots, product.id]);
    const productMvts = useMemo(() => 
        mouvements.filter(m => m.productId === product.id).sort((a, b) => 
            new Date(b.date).getTime() - new Date(a.date).getTime()
        ), [mouvements, product.id]);
    
    const currentStock = useMemo(() => stockQty(lots, product.id), [lots, product.id]);
    const stockValue = useMemo(() => currentStock * (product.cump || product.prixUnitaire), [currentStock, product]);

    const consumptionStats = useMemo(() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentSorties = productMvts.filter(m => 
            (m.type === 'sortie' || m.type === 'rebut') && 
            new Date(m.date) > thirtyDaysAgo
        );
        
        const totalConsumed = recentSorties.reduce((s, m) => s + m.quantite, 0);
        const avgPerWeek = totalConsumed / 4.3;
        
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const previousSorties = productMvts.filter(m => 
            (m.type === 'sortie' || m.type === 'rebut') && 
            new Date(m.date) > sixtyDaysAgo &&
            new Date(m.date) <= thirtyDaysAgo
        );
        const previousTotal = previousSorties.reduce((s, m) => s + m.quantite, 0);
        
        const trend = previousTotal > 0 ? ((totalConsumed - previousTotal) / previousTotal) * 100 : 0;
        
        const daysRemaining = avgPerWeek > 0 ? Math.floor((currentStock / avgPerWeek) * 7) : Infinity;
        
        return { totalConsumed, avgPerWeek, trend, daysRemaining };
    }, [productMvts, currentStock]);

    const chainsUsage = useMemo(() => {
        const chains: Record<string, { qty: number; lastUse: string; ofs: string[] }> = {};
        productMvts.filter(m => m.type === 'sortie' && m.chaineId).forEach(m => {
            const ch = m.chaineId!;
            if (!chains[ch]) chains[ch] = { qty: 0, lastUse: m.date, ofs: [] };
            chains[ch].qty += m.quantite;
            if (m.modeleRef && !chains[ch].ofs.includes(m.modeleRef)) {
                chains[ch].ofs.push(m.modeleRef);
            }
            if (new Date(m.date) > new Date(chains[ch].lastUse)) {
                chains[ch].lastUse = m.date;
            }
        });
        return Object.entries(chains).map(([id, data]) => ({ id, ...data }));
    }, [productMvts]);

    const availableBains = useMemo(() => 
        productLots.filter(l => l.quantiteRestante > 0 && l.numBain)
            .map(l => ({ bain: l.numBain!, qty: l.quantiteRestante, date: l.dateEntree }))
    , [productLots]);

    const handleSave = () => {
        onSave(editData);
        setIsEditing(false);
    };

    const setField = (key: keyof MagasinProduct, value: any) => {
        setEditData(prev => ({ ...prev, [key]: value }));
    };

    const catColor = CAT_COLORS[product.categorie] || CAT_COLORS.autre;

    return (
        <div className="fixed inset-0 z-[100] flex">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            
            <div className="relative ml-auto w-full max-w-2xl h-full bg-white dark:bg-dk-surface shadow-2xl dark:shadow-dk-elevated dark:shadow-dk-lg flex flex-col animate-in slide-in-from-right duration-300">
                
                <div className={`shrink-0 ${catColor.bg} border-b ${catColor.border}`}>
                    <div className="p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                <div className="w-20 h-20 rounded-2xl bg-white dark:bg-dk-surface border-2 border-white shadow-lg dark:shadow-dk-lg overflow-hidden shrink-0">
                                    {product.photo ? (
                                        <img src={product.photo} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                                            <Package className="w-8 h-8 text-slate-400 dark:text-dk-muted" />
                                        </div>
                                    )}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide ${catColor.bg} ${catColor.text} border ${catColor.border}`}>
                                            {product.categorie}
                                        </span>
                                        <span className="text-xs font-mono text-slate-500 dark:text-dk-muted">{product.reference}</span>
                                    </div>
                                    <h2 className="text-xl font-black text-slate-800 dark:text-dk-text truncate">{product.designation}</h2>
                                    {product.emplacement && (
                                        <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-dk-muted mt-1">
                                            <MapPin className="w-3.5 h-3.5" />
                                            {product.emplacement}
                                        </p>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 shrink-0">
                                {!isEditing ? (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-sm font-bold text-slate-700 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-all shadow-sm dark:shadow-dk-sm"
                                    >
                                        <Edit2 className="w-4 h-4" /> {_({fr:'Modifier',ar:'تعديل',en:'Edit',es:'Editar',pt:'Editar',tr:'Düzenle'})}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleSave}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg dark:shadow-dk-lg shadow-emerald-200"
                                    >
                                        <Save className="w-4 h-4" /> {_({fr:'Enregistrer',ar:'حفظ',en:'Save',es:'Guardar',pt:'Salvar',tr:'Kaydet'})}
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-xl hover:bg-white text-slate-500 dark:text-dk-muted hover:text-slate-800 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="px-6 flex gap-1">
                        {[
                            { id: 'overview', k: 'Aperçu', icon: BarChart3 },
                            { id: 'history', k: 'Historique', icon: History },
                            { id: 'supplier', k: 'Fournisseur', icon: Building2 },
                            { id: 'lots', k: 'Lots/Bains', icon: Droplets },
                            { id: 'factures', k: 'Factures', icon: FileText },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all ${
                                    activeTab === tab.id
                                        ? 'bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text shadow-sm dark:shadow-dk-sm'
                                        : 'text-slate-600 dark:text-dk-text-soft hover:text-slate-800 hover:bg-white'
                                }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {_(tab.id === 'overview' ? {fr:'Aperçu',ar:'نظرة عامة',en:'Overview',es:'Resumen',pt:'Visão Geral',tr:'Genel Bakış'} :
                                  tab.id === 'history' ? {fr:'Historique',ar:'السجل',en:'History',es:'Historial',pt:'Histórico',tr:'Geçmiş'} :
                                  tab.id === 'supplier' ? {fr:'Fournisseur',ar:'المورد',en:'Supplier',es:'Proveedor',pt:'Fornecedor',tr:'Tedarikçi'} :
                                  tab.id === 'lots' ? {fr:'Lots/Bains',ar:'الدفعات/الأحواض',en:'Lots/Baths',es:'Lotes/Baños',pt:'Lotes/Tingimentos',tr:'Partiler/Banyolar'} :
                                  {fr:'Factures',ar:'الفواتير',en:'Invoices',es:'Facturas',pt:'Faturas',tr:'Faturalar'})}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-dk-bg">
                    
                    {activeTab === 'overview' && (
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" />
                                        {currentStock <= product.stockAlerte ? (
                                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-black">{_({fr:'ALERTE',ar:'تنبيه',en:'ALERT',es:'ALERTA',pt:'ALERTA',tr:'UYARI'})}</span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">{_({fr:'OK',ar:'موافق',en:'OK',es:'OK',pt:'OK',tr:'Tamam'})}</span>
                                        )}
                                    </div>
                                    <p className="text-3xl font-black text-slate-800 dark:text-dk-text">{currentStock.toFixed(1)}</p>
                                    <p className="text-xs text-slate-500 dark:text-dk-muted font-bold mt-1">{product.unite} {_({fr:'en stock',ar:'في المخزون',en:'in stock',es:'en stock',pt:'em stock',tr:'stokta'})}</p>
                                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-dk-border text-[10px] text-slate-400 dark:text-dk-muted">
                                        {_({fr:'Seuil:',ar:'الحد الأدنى:',en:'Threshold:',es:'Umbral:',pt:'Limite:',tr:'Eşik:'})} {product.stockAlerte} {product.unite}
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <Activity className="w-5 h-5 text-violet-600" />
                                        {consumptionStats.trend > 0 ? (
                                            <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 text-xs font-bold">
                                                <TrendingUp className="w-3 h-3" /> +{consumptionStats.trend.toFixed(0)}%
                                            </span>
                                        ) : consumptionStats.trend < 0 ? (
                                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                                                <TrendingDown className="w-3 h-3" /> {consumptionStats.trend.toFixed(0)}%
                                            </span>
                                        ) : null}
                                    </div>
                                    <p className="text-3xl font-black text-slate-800 dark:text-dk-text">{consumptionStats.avgPerWeek.toFixed(1)}</p>
                                    <p className="text-xs text-slate-500 dark:text-dk-muted font-bold mt-1">{product.unite}/{_({fr:'semaine',ar:'أسبوع',en:'week',es:'semana',pt:'semana',tr:'hafta'})}</p>
                                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-dk-border text-[10px] text-slate-400 dark:text-dk-muted">
                                        30j: {consumptionStats.totalConsumed.toFixed(1)} {product.unite}
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        <span className="text-[10px] text-slate-400 dark:text-dk-muted font-bold">CUMP</span>
                                    </div>
                                    <p className="text-3xl font-black text-slate-800 dark:text-dk-text">{stockValue.toLocaleString()}</p>
                                    <p className="text-xs text-slate-500 dark:text-dk-muted font-bold mt-1">{_({fr:'DH valeur stock',ar:'درهم قيمة المخزون',en:'MAD stock value',es:'DH valor stock',pt:'DH valor stock',tr:'Stok değeri (MAD)'})}</p>
                                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-dk-border text-[10px] text-slate-400 dark:text-dk-muted">
                                        PU: {(product.cump || product.prixUnitaire).toFixed(2)} DH
                                    </div>
                                </div>
                            </div>

                            {consumptionStats.daysRemaining < 14 && consumptionStats.daysRemaining !== Infinity && (
                                <div className={`rounded-2xl p-4 flex items-center gap-4 ${
                                    consumptionStats.daysRemaining < 7 
                                        ? 'bg-red-50 dark:bg-red-900/30 border border-red-200' 
                                        : 'bg-amber-50 dark:bg-amber-900/30 border border-amber-200'
                                }`}>
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                        consumptionStats.daysRemaining < 7 ? 'bg-red-100' : 'bg-amber-100'
                                    }`}>
                                        <AlertTriangle className={`w-6 h-6 ${
                                            consumptionStats.daysRemaining < 7 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                                        }`} />
                                    </div>
                                    <div>
                                        <p className={`font-black ${
                                            consumptionStats.daysRemaining < 7 ? 'text-red-800' : 'text-amber-800'
                                        }`}>
                                            {consumptionStats.daysRemaining < 7 ? _({fr:'Rupture imminente !',ar:'نفاد وشيك!',en:'Imminent stockout!',es:'¡Desabastecimiento inminente!',pt:'Rotura iminente!',tr:'Yakında tükeniyor!'}) : _({fr:'Stock faible',ar:'مخزون منخفض',en:'Low stock',es:'Stock bajo',pt:'Stock baixo',tr:'Düşük stok'})}
                                        </p>
                                        <p className={`text-sm ${
                                            consumptionStats.daysRemaining < 7 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                                        }`}>
                                            {_({fr:'~{0} jours restants au rythme actuel',ar:'~{0} يوم متبقي بالمعدل الحالي',en:'~{0} days left at current rate',es:'~{0} días restantes al ritmo actual',pt:'~{0} dias restantes ao ritmo atual',tr:'Mevcut hızda ~{0} gün kaldı'}).replace('{0}', String(consumptionStats.daysRemaining))}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {chainsUsage.length > 0 && (
                                <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden">
                                    <div className="px-5 py-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between">
                                        <h3 className="font-black text-slate-800 dark:text-dk-text flex items-center gap-2">
                                            <Factory className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                                            {_({fr:'Chaînes Utilisatrices',ar:'الخطوط المستخدمة',en:'Using Lines',es:'Líneas Usuarias',pt:'Linhas Utilizadoras',tr:'Kullanan Hatlar'})}
                                        </h3>
                                        <span className="text-xs text-slate-400 dark:text-dk-muted font-bold">{chainsUsage.length} {_({fr:'chaîne(s)',ar:'خط(وط)',en:'line(s)',es:'línea(s)',pt:'linha(s)',tr:'hat'})}</span>
                                    </div>
                                    <div className="divide-y divide-slate-50 dark:divide-dk-border">
                                        {chainsUsage.slice(0, 5).map(ch => (
                                            <div key={ch.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 flex items-center justify-center">
                                                        <Factory className="w-5 h-5 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-800 dark:text-dk-text">{ch.id}</p>
                                                        <p className="text-xs text-slate-400 dark:text-dk-muted">{_({fr:'Dernier:',ar:'آخر:',en:'Last:',es:'Último:',pt:'Último:',tr:'Son:'})} {formatDate(ch.lastUse)}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-black text-slate-700 dark:text-dk-text-soft">{ch.qty.toFixed(1)} {product.unite}</p>
                                                    {ch.ofs.length > 0 && (
                                                        <p className="text-[10px] text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text font-bold">{ch.ofs.slice(0, 2).join(', ')}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between">
                                    <h3 className="font-black text-slate-800 dark:text-dk-text flex items-center gap-2">
                                        <History className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                                        {_({fr:'Activité Récente',ar:'النشاط الأخير',en:'Recent Activity',es:'Actividad Reciente',pt:'Atividade Recente',tr:'Son Aktivite'})}
                                    </h3>
                                    <button 
                                        onClick={() => setActiveTab('history')}
                                        className="text-xs text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text font-bold hover:text-indigo-700 dark:text-dk-accent-text flex items-center gap-1"
                                    >
                                        {_({fr:'Voir tout',ar:'عرض الكل',en:'View all',es:'Ver todo',pt:'Ver tudo',tr:'Tümünü gör'})} <ChevronRight className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="divide-y divide-slate-50 dark:divide-dk-border">
                                    {productMvts.slice(0, 4).map(mvt => {
                                        const conf = MVT_ICONS[mvt.type] || MVT_ICONS.sortie;
                                        const Icon = conf.icon;
                                        return (
                                            <button
                                                key={mvt.id}
                                                type="button"
                                                onClick={() => onEditMovement?.(mvt)}
                                                className="w-full text-left px-5 py-3 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors"
                                            >
                                                <div className={`w-9 h-9 rounded-lg ${conf.bg} flex items-center justify-center shrink-0`}>
                                                    <Icon className={`w-4 h-4 ${conf.color}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-slate-700 dark:text-dk-text-soft capitalize">{mvt.type.replace('_', ' ')}</p>
                                                    <p className="text-xs text-slate-400 dark:text-dk-muted truncate">{mvt.notes || (mvt.chaineId ? `→ ${mvt.chaineId}` : '—')}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className={`font-black ${mvt.type === 'entree' || mvt.type === 'retour_atelier' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                        {mvt.type === 'entree' || mvt.type === 'retour_atelier' ? '+' : '-'}{mvt.quantite}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 dark:text-dk-muted">{formatDate(mvt.date)}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                    {productMvts.length === 0 && (
                                        <div className="px-5 py-8 text-center text-slate-400 dark:text-dk-muted text-sm">
                                            {_({fr:'Aucun mouvement enregistré',ar:'لا توجد حركات مسجلة',en:'No movements recorded',es:'Sin movimientos registrados',pt:'Nenhum movimento registado',tr:'Kayıtlı hareket yok'})}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="p-6">
                            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 dark:border-dk-border">
                                    <h3 className="font-black text-slate-800 dark:text-dk-text">{_({fr:'Historique Complet',ar:'السجل الكامل',en:'Full History',es:'Historial Completo',pt:'Histórico Completo',tr:'Tam Geçmiş'})}</h3>
                                    <p className="text-xs text-slate-400 dark:text-dk-muted mt-0.5">{productMvts.length} {_({fr:'mouvement(s) enregistré(s)',ar:'حركة (حركات) مسجلة',en:'movement(s) recorded',es:'movimiento(s) registrado(s)',pt:'movimento(s) registado(s)',tr:'kayıtlı hareket'})}</p>
                                </div>
                                <div className="max-h-[500px] overflow-y-auto">
                                    {productMvts.map((mvt, i) => {
                                        const conf = MVT_ICONS[mvt.type] || MVT_ICONS.sortie;
                                        const Icon = conf.icon;
                                        return (
                                            <button
                                                key={mvt.id}
                                                type="button"
                                                onClick={() => onEditMovement?.(mvt)}
                                                className={`w-full text-left px-5 py-4 flex gap-4 ${i % 2 === 0 ? 'bg-white dark:bg-dk-surface' : 'bg-slate-50 dark:bg-dk-bg/50'} hover:bg-slate-100 transition-colors`}
                                            >
                                                <div className={`w-11 h-11 rounded-xl ${conf.bg} flex items-center justify-center shrink-0`}>
                                                    <Icon className={`w-5 h-5 ${conf.color}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-black text-slate-800 dark:text-dk-text capitalize">{mvt.type.replace('_', ' ')}</span>
                                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                            mvt.type === 'entree' || mvt.type === 'retour_atelier' 
                                                                ? 'bg-emerald-100 text-emerald-700' 
                                                                : 'bg-rose-100 text-rose-700'
                                                        }`}>
                                                            {mvt.type === 'entree' || mvt.type === 'retour_atelier' ? '+' : '-'}{mvt.quantite} {product.unite}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-dk-muted">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-3 h-3" />
                                                            {formatDate(mvt.date)} à {formatTime(mvt.date)}
                                                        </span>
                                                        {mvt.chaineId && (
                                                            <span className="flex items-center gap-1">
                                                                <Factory className="w-3 h-3" />
                                                                {mvt.chaineId}
                                                            </span>
                                                        )}
                                                        {mvt.modeleRef && (
                                                            <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text font-bold">
                                                                <FileText className="w-3 h-3" />
                                                                {mvt.modeleRef}
                                                            </span>
                                                        )}
                                                        {mvt.bain && (
                                                            <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-bold">
                                                                <Droplets className="w-3 h-3" />
                                                                {_({fr:'Bain:',ar:'الحوض:',en:'Bath:',es:'Baño:',pt:'Tingimento:',tr:'Banyo:'})} {mvt.bain}
                                                            </span>
                                                        )}
                                                        {mvt.fournisseurId && (
                                                            <span className="flex items-center gap-1">
                                                                <Truck className="w-3 h-3" />
                                                                {mvt.fournisseurId}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {mvt.notes && (
                                                        <p className="mt-2 text-xs text-slate-600 dark:text-dk-text-soft italic bg-slate-50 dark:bg-dk-bg rounded-lg px-3 py-2">
                                                            "{mvt.notes}"
                                                        </p>
                                                    )}
                                                </div>
                                                {mvt.prixUnitaire && (
                                                    <div className="text-right shrink-0">
                                                        <p className="text-sm font-bold text-slate-600 dark:text-dk-text-soft">{mvt.prixUnitaire.toFixed(2)} DH</p>
                                                        <p className="text-[10px] text-slate-400 dark:text-dk-muted">/{product.unite}</p>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                    {productMvts.length === 0 && (
                                        <div className="px-5 py-16 text-center">
                                            <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                            <p className="text-slate-400 dark:text-dk-muted font-bold">{_({fr:'Aucun mouvement',ar:'لا توجد حركات',en:'No movements',es:'Sin movimientos',pt:'Nenhum movimento',tr:'Hareket yok'})}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'supplier' && (
                        <div className="p-6 space-y-6">
                            <div
                                className={`bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden ${!isEditing ? 'cursor-pointer hover:shadow-md' : ''}`}
                                onClick={() => {
                                    if (!isEditing) {
                                        setActiveTab('supplier');
                                        setIsEditing(true);
                                    }
                                }}
                            >
                                <div className="px-5 py-4 border-b border-slate-100 dark:border-dk-border bg-gradient-to-r from-indigo-50 to-purple-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-white dark:bg-dk-surface shadow-sm dark:shadow-dk-sm flex items-center justify-center">
                                            <Building2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-black text-slate-800 dark:text-dk-text">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={editData.fournisseurNom || ''}
                                                        onChange={e => setField('fournisseurNom', e.target.value)}
                                                        className="w-full px-3 py-1 rounded-lg border border-indigo-200 text-slate-800 dark:text-dk-text font-black"
                                                        placeholder={_({fr:'Nom du fournisseur',ar:'اسم المورد',en:'Supplier name',es:'Nombre del proveedor',pt:'Nome do fornecedor',tr:'Tedarikçi adı'})}
                                                    />
                                                ) : (
                                                    product.fournisseurNom || _({fr:'Non défini',ar:'غير محدد',en:'Not set',es:'No definido',pt:'Não definido',tr:'Tanımlanmamış'})
                                                )}
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-dk-muted">{_({fr:'Fournisseur Principal',ar:'المورد الرئيسي',en:'Main Supplier',es:'Proveedor Principal',pt:'Fornecedor Principal',tr:'Ana Tedarikçi'})}</p>
                                        </div>
                                        {!isEditing && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsEditing(true);
                                                }}
                                                className="rounded-full px-3 py-1 text-xs font-black text-indigo-700 dark:text-dk-accent-text bg-indigo-100 hover:bg-indigo-200"
                                            >
                                                {_({fr:'Modifier',ar:'تعديل',en:'Edit',es:'Editar',pt:'Editar',tr:'Düzenle'})}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="p-5 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> {_({fr:'Téléphone',ar:'الهاتف',en:'Phone',es:'Teléfono',pt:'Telefone',tr:'Telefon'})}
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="tel"
                                                    value={editData.fournisseurTel || ''}
                                                    onChange={e => setField('fournisseurTel', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-sm"
                                                    placeholder="+212 5XX-XXXXXX"
                                                />
                                            ) : (
                                                <p className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{product.fournisseurTel || '—'}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase flex items-center gap-1">
                                                <Mail className="w-3 h-3" /> Email
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="email"
                                                    value={editData.fournisseurEmail || ''}
                                                    onChange={e => setField('fournisseurEmail', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-sm"
                                                    placeholder="contact@fournisseur.ma"
                                                />
                                            ) : (
                                                <p className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{product.fournisseurEmail || '—'}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase flex items-center gap-1">
                                            <MapPin className="w-3 h-3" /> {_({fr:'Adresse',ar:'العنوان',en:'Address',es:'Dirección',pt:'Endereço',tr:'Adres'})}
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editData.fournisseurAdresse || ''}
                                                onChange={e => setField('fournisseurAdresse', e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-sm"
                                                placeholder={_({fr:'Adresse complète',ar:'العنوان الكامل',en:'Full address',es:'Dirección completa',pt:'Endereço completo',tr:'Tam adres'})}
                                            />
                                        ) : (
                                            <p className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{product.fournisseurAdresse || '—'}</p>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-dk-border">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase flex items-center gap-1">
                                                <Hash className="w-3 h-3" /> ICE
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editData.fournisseurIce || ''}
                                                    onChange={e => setField('fournisseurIce', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-sm font-mono"
                                                />
                                            ) : (
                                                <p className="text-sm font-mono text-slate-600 dark:text-dk-text-soft">{product.fournisseurIce || '—'}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase flex items-center gap-1">
                                                <FileText className="w-3 h-3" /> RC
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editData.fournisseurRc || ''}
                                                    onChange={e => setField('fournisseurRc', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-sm font-mono"
                                                />
                                            ) : (
                                                <p className="text-sm font-mono text-slate-600 dark:text-dk-text-soft">{product.fournisseurRc || '—'}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-dk-border">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase flex items-center gap-1">
                                                <Timer className="w-3 h-3" /> {_({fr:'Délai (jours)',ar:'المهلة (أيام)',en:'Lead time (days)',es:'Plazo (días)',pt:'Prazo (dias)',tr:'Teslim süresi (gün)'})}
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={editData.fournisseurDelaiLivraisonJours || ''}
                                                    onChange={e => setField('fournisseurDelaiLivraisonJours', e.target.value ? parseInt(e.target.value) : undefined)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-sm"
                                                />
                                            ) : (
                                                <p className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{product.fournisseurDelaiLivraisonJours ?? '—'}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase flex items-center gap-1">
                                                <ShoppingCart className="w-3 h-3" /> MOQ
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={editData.fournisseurMoq || ''}
                                                    onChange={e => setField('fournisseurMoq', e.target.value ? parseFloat(e.target.value) : undefined)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-sm"
                                                />
                                            ) : (
                                                <p className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{product.fournisseurMoq ?? '—'}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase flex items-center gap-1">
                                                <Globe className="w-3 h-3" /> {_({fr:'Devise',ar:'العملة',en:'Currency',es:'Moneda',pt:'Moeda',tr:'Para Birimi'})}
                                            </label>
                                            {isEditing ? (
                                                <select
                                                    value={editData.fournisseurDevise || ''}
                                                    onChange={e => setField('fournisseurDevise', e.target.value || undefined)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-sm"
                                                >
                                                    <option value="">—</option>
                                                    <option value="MAD">MAD</option>
                                                    <option value="EUR">EUR</option>
                                                    <option value="USD">USD</option>
                                                </select>
                                            ) : (
                                                <p className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{product.fournisseurDevise || '—'}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-1 pt-4 border-t border-slate-100 dark:border-dk-border">
                                        <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase flex items-center gap-1">
                                            <CreditCard className="w-3 h-3" /> {_({fr:'Conditions de Paiement',ar:'شروط الدفع',en:'Payment Terms',es:'Condiciones de Pago',pt:'Condições de Pagamento',tr:'Ödeme Koşulları'})}
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editData.fournisseurConditionsPaiement || ''}
                                                onChange={e => setField('fournisseurConditionsPaiement', e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-sm"
                                                placeholder={_({fr:'Ex: 30j fin de mois',ar:'مثال: 30 يوم نهاية الشهر',en:'E.g.: 30 days end of month',es:'Ej: 30 días fin de mes',pt:'Ex: 30 dias fim do mês',tr:'Örn: Ay sonu 30 gün'})}
                                            />
                                        ) : (
                                            <p className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{product.fournisseurConditionsPaiement || '—'}</p>
                                        )}
                                    </div>

                                    <div className="space-y-1 pt-4 border-t border-slate-100 dark:border-dk-border">
                                        <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase flex items-center gap-1">
                                            <StickyNote className="w-3 h-3" /> {_({fr:'Notes',ar:'ملاحظات',en:'Notes',es:'Notas',pt:'Notas',tr:'Notlar'})}
                                        </label>
                                        {isEditing ? (
                                            <textarea
                                                value={editData.fournisseurNotes || ''}
                                                onChange={e => setField('fournisseurNotes', e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-sm resize-none"
                                                rows={3}
                                                placeholder={_({fr:'Notes sur le fournisseur...',ar:'ملاحظات حول المورد...',en:'Notes about the supplier...',es:'Notas sobre el proveedor...',pt:'Notas sobre o fornecedor...',tr:'Tedarikçi hakkında notlar...'})}
                                            />
                                        ) : (
                                            <p className="text-sm text-slate-600 dark:text-dk-text-soft italic">{product.fournisseurNotes || _({fr:'Aucune note',ar:'لا توجد ملاحظات',en:'No notes',es:'Sin notas',pt:'Sem notas',tr:'Not yok'})}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'lots' && (
                        <div className="p-6 space-y-6">
                            {availableBains.length > 0 && (
                                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-5 border border-purple-100">
                                    <h3 className="font-black text-purple-800 flex items-center gap-2 mb-3">
                                        <Droplets className="w-5 h-5" />
                                        {_({fr:'Bains Disponibles',ar:'الأحواض المتاحة',en:'Available Baths',es:'Baños Disponibles',pt:'Tingimentos Disponíveis',tr:'Mevcut Banyolar'})}
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {availableBains.map((b, i) => (
                                            <div key={i} className="px-3 py-2 bg-white dark:bg-dk-surface rounded-xl border border-purple-200 shadow-sm dark:shadow-dk-sm">
                                                <p className="font-black text-purple-700">{b.bain}</p>
                                                <p className="text-xs text-slate-500 dark:text-dk-muted">{b.qty.toFixed(1)} {product.unite}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 dark:border-dk-border">
                                    <h3 className="font-black text-slate-800 dark:text-dk-text">{_({fr:'Tous les Lots',ar:'جميع الدفعات',en:'All Lots',es:'Todos los Lotes',pt:'Todos os Lotes',tr:'Tüm Partiler'})}</h3>
                                    <p className="text-xs text-slate-400 dark:text-dk-muted mt-0.5">{productLots.length} {_({fr:'lot(s) enregistré(s)',ar:'دفعة (دفعات) مسجلة',en:'lot(s) recorded',es:'lote(s) registrado(s)',pt:'lote(s) registado(s)',tr:'kayıtlı parti(ler)'})}</p>
                                </div>
                                <div className="max-h-[400px] overflow-y-auto">
                                    {productLots.map((lot, i) => (
                                        <div key={lot.id} className={`px-5 py-4 flex items-center gap-4 ${i % 2 === 0 ? 'bg-white dark:bg-dk-surface' : 'bg-slate-50 dark:bg-dk-bg/50'}`}>
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                lot.quantiteRestante > 0 
                                                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' 
                                                    : 'bg-slate-100 dark:bg-dk-elevated text-slate-400 dark:text-dk-muted'
                                            }`}>
                                                <Layers className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {lot.numBain && (
                                                        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-xs font-bold">
                                                            {_({fr:'Bain:',ar:'الحوض:',en:'Bath:',es:'Baño:',pt:'Tingimento:',tr:'Banyo:'})} {lot.numBain}
                                                        </span>
                                                    )}
                                                    {lot.etat === 'quarantaine' && (
                                                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-bold">
                                                            {_({fr:'Quarantaine',ar:'الحجر الصحي',en:'Quarantine',es:'Cuarentena',pt:'Quarentena',tr:'Karantina'})}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-dk-muted">
                                                    <span>{_({fr:'Entrée:',ar:'دخول:',en:'Entry:',es:'Entrada:',pt:'Entrada:',tr:'Giriş:'})} {formatDate(lot.dateEntree)}</span>
                                                    {lot.fournisseur && <span>{_({fr:'Frs:',ar:'المورد:',en:'Supp:',es:'Prov:',pt:'Forn:',tr:'Tedarikçi:'})} {lot.fournisseur}</span>}
                                                    <span>{lot.prixUnitaire.toFixed(2)} DH/{product.unite}</span>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className={`text-lg font-black ${lot.quantiteRestante > 0 ? 'text-slate-800 dark:text-dk-text' : 'text-slate-400 dark:text-dk-muted'}`}>
                                                    {lot.quantiteRestante.toFixed(1)}
                                                </p>
                                                <p className="text-[10px] text-slate-400 dark:text-dk-muted">/ {lot.quantiteInitiale.toFixed(1)} {product.unite}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {productLots.length === 0 && (
                                        <div className="px-5 py-16 text-center">
                                            <Layers className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                            <p className="text-slate-400 dark:text-dk-muted font-bold">{_({fr:'Aucun lot enregistré',ar:'لا توجد دفعات مسجلة',en:'No lots recorded',es:'Sin lotes registrados',pt:'Nenhum lote registado',tr:'Kayıtlı parti yok'})}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'factures' && (
                        <div className="p-6">
                            <InlineInvoiceList
                                productId={product.id}
                                productLabel={product.designation}
                                sourceModule="magasin"
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
