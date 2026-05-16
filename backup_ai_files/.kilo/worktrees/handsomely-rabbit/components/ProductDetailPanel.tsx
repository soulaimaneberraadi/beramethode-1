import React, { useState, useMemo } from 'react';
import {
    X, Package, TrendingUp, TrendingDown, History, Building2, MapPin,
    Phone, Mail, Edit2, Save, ChevronRight, Layers, Factory, Calendar,
    AlertTriangle, CheckCircle, Clock, ArrowUpCircle, ArrowDownCircle,
    Droplets, DollarSign, BarChart3, Activity, ExternalLink, Truck,
    FileText, Hash, Globe, CreditCard, Timer, ShoppingCart, StickyNote
} from 'lucide-react';
import { MouvementStock } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────
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
    lang?: 'fr' | 'ar' | 'en';
}

// ─── Helper Functions ────────────────────────────────────────────────────────
const stockQty = (lots: LotStock[], pid: string) => 
    lots.filter(l => l.productId === pid).reduce((s, l) => s + l.quantiteRestante, 0);

const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' });
const formatTime = (d: string) => new Date(d).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });

const CAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    tissu: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    fil: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    bouton: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    fermeture: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
    etiquette: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    emballage: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    autre: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

const MVT_ICONS: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    entree: { icon: ArrowDownCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    sortie: { icon: ArrowUpCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
    regularisation: { icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
    retour_atelier: { icon: Factory, color: 'text-blue-600', bg: 'bg-blue-50' },
    rebut: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    reservation: { icon: Clock, color: 'text-violet-600', bg: 'bg-violet-50' },
};

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ProductDetailPanel({ product, lots, mouvements, onClose, onSave, lang = 'fr' }: ProductDetailPanelProps) {
    const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'supplier' | 'lots'>('overview');
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<MagasinProduct>({ ...product });

    // ─── Computed Stats ──────────────────────────────────────────────────────
    const productLots = useMemo(() => lots.filter(l => l.productId === product.id), [lots, product.id]);
    const productMvts = useMemo(() => 
        mouvements.filter(m => m.productId === product.id).sort((a, b) => 
            new Date(b.date).getTime() - new Date(a.date).getTime()
        ), [mouvements, product.id]);
    
    const currentStock = useMemo(() => stockQty(lots, product.id), [lots, product.id]);
    const stockValue = useMemo(() => currentStock * (product.cump || product.prixUnitaire), [currentStock, product]);

    // Consumption stats (last 30 days)
    const consumptionStats = useMemo(() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentSorties = productMvts.filter(m => 
            (m.type === 'sortie' || m.type === 'rebut') && 
            new Date(m.date) > thirtyDaysAgo
        );
        
        const totalConsumed = recentSorties.reduce((s, m) => s + m.quantite, 0);
        const avgPerWeek = totalConsumed / 4.3; // ~4.3 weeks in 30 days
        
        // Compare with previous 30 days
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const previousSorties = productMvts.filter(m => 
            (m.type === 'sortie' || m.type === 'rebut') && 
            new Date(m.date) > sixtyDaysAgo &&
            new Date(m.date) <= thirtyDaysAgo
        );
        const previousTotal = previousSorties.reduce((s, m) => s + m.quantite, 0);
        
        const trend = previousTotal > 0 ? ((totalConsumed - previousTotal) / previousTotal) * 100 : 0;
        
        // Days until stockout
        const daysRemaining = avgPerWeek > 0 ? Math.floor((currentStock / avgPerWeek) * 7) : Infinity;
        
        return { totalConsumed, avgPerWeek, trend, daysRemaining };
    }, [productMvts, currentStock]);

    // Chains that use this product
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

    // Available bains
    const availableBains = useMemo(() => 
        productLots.filter(l => l.quantiteRestante > 0 && l.numBain)
            .map(l => ({ bain: l.numBain!, qty: l.quantiteRestante, date: l.dateEntree }))
    , [productLots]);

    // ─── Handlers ────────────────────────────────────────────────────────────
    const handleSave = () => {
        onSave(editData);
        setIsEditing(false);
    };

    const setField = (key: keyof MagasinProduct, value: any) => {
        setEditData(prev => ({ ...prev, [key]: value }));
    };

    const catColor = CAT_COLORS[product.categorie] || CAT_COLORS.autre;

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[100] flex">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            
            {/* Panel - Slides from right */}
            <div className="relative ml-auto w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                
                {/* ═══ HEADER ═══ */}
                <div className={`shrink-0 ${catColor.bg} border-b ${catColor.border}`}>
                    <div className="p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                {/* Product Image */}
                                <div className="w-20 h-20 rounded-2xl bg-white border-2 border-white shadow-lg overflow-hidden shrink-0">
                                    {product.photo ? (
                                        <img src={product.photo} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                                            <Package className="w-8 h-8 text-slate-400" />
                                        </div>
                                    )}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide ${catColor.bg} ${catColor.text} border ${catColor.border}`}>
                                            {product.categorie}
                                        </span>
                                        <span className="text-xs font-mono text-slate-500">{product.reference}</span>
                                    </div>
                                    <h2 className="text-xl font-black text-slate-800 truncate">{product.designation}</h2>
                                    {product.emplacement && (
                                        <p className="flex items-center gap-1 text-sm text-slate-500 mt-1">
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
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                                    >
                                        <Edit2 className="w-4 h-4" /> Modifier
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleSave}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                                    >
                                        <Save className="w-4 h-4" /> Enregistrer
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-xl hover:bg-white/80 text-slate-500 hover:text-slate-800 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    {/* Tabs */}
                    <div className="px-6 flex gap-1">
                        {[
                            { id: 'overview', label: 'Aperçu', icon: BarChart3 },
                            { id: 'history', label: 'Historique', icon: History },
                            { id: 'supplier', label: 'Fournisseur', icon: Building2 },
                            { id: 'lots', label: 'Lots/Bains', icon: Droplets },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all ${
                                    activeTab === tab.id
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                                }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ═══ CONTENT ═══ */}
                <div className="flex-1 overflow-y-auto bg-slate-50">
                    
                    {/* ─── OVERVIEW TAB ─── */}
                    {activeTab === 'overview' && (
                        <div className="p-6 space-y-6">
                            {/* KPI Cards */}
                            <div className="grid grid-cols-3 gap-4">
                                {/* Stock Actuel */}
                                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <Package className="w-5 h-5 text-indigo-600" />
                                        {currentStock <= product.stockAlerte ? (
                                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-black">ALERTE</span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">OK</span>
                                        )}
                                    </div>
                                    <p className="text-3xl font-black text-slate-800">{currentStock.toFixed(1)}</p>
                                    <p className="text-xs text-slate-500 font-bold mt-1">{product.unite} en stock</p>
                                    <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                                        Seuil: {product.stockAlerte} {product.unite}
                                    </div>
                                </div>

                                {/* Consommation */}
                                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <Activity className="w-5 h-5 text-violet-600" />
                                        {consumptionStats.trend > 0 ? (
                                            <span className="flex items-center gap-1 text-rose-600 text-xs font-bold">
                                                <TrendingUp className="w-3 h-3" /> +{consumptionStats.trend.toFixed(0)}%
                                            </span>
                                        ) : consumptionStats.trend < 0 ? (
                                            <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                                                <TrendingDown className="w-3 h-3" /> {consumptionStats.trend.toFixed(0)}%
                                            </span>
                                        ) : null}
                                    </div>
                                    <p className="text-3xl font-black text-slate-800">{consumptionStats.avgPerWeek.toFixed(1)}</p>
                                    <p className="text-xs text-slate-500 font-bold mt-1">{product.unite}/semaine</p>
                                    <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                                        30j: {consumptionStats.totalConsumed.toFixed(1)} {product.unite}
                                    </div>
                                </div>

                                {/* Valeur */}
                                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <DollarSign className="w-5 h-5 text-emerald-600" />
                                        <span className="text-[10px] text-slate-400 font-bold">CUMP</span>
                                    </div>
                                    <p className="text-3xl font-black text-slate-800">{stockValue.toLocaleString()}</p>
                                    <p className="text-xs text-slate-500 font-bold mt-1">DH valeur stock</p>
                                    <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                                        PU: {(product.cump || product.prixUnitaire).toFixed(2)} DH
                                    </div>
                                </div>
                            </div>

                            {/* Stock Alert Banner */}
                            {consumptionStats.daysRemaining < 14 && consumptionStats.daysRemaining !== Infinity && (
                                <div className={`rounded-2xl p-4 flex items-center gap-4 ${
                                    consumptionStats.daysRemaining < 7 
                                        ? 'bg-red-50 border border-red-200' 
                                        : 'bg-amber-50 border border-amber-200'
                                }`}>
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                        consumptionStats.daysRemaining < 7 ? 'bg-red-100' : 'bg-amber-100'
                                    }`}>
                                        <AlertTriangle className={`w-6 h-6 ${
                                            consumptionStats.daysRemaining < 7 ? 'text-red-600' : 'text-amber-600'
                                        }`} />
                                    </div>
                                    <div>
                                        <p className={`font-black ${
                                            consumptionStats.daysRemaining < 7 ? 'text-red-800' : 'text-amber-800'
                                        }`}>
                                            {consumptionStats.daysRemaining < 7 ? 'Rupture imminente !' : 'Stock faible'}
                                        </p>
                                        <p className={`text-sm ${
                                            consumptionStats.daysRemaining < 7 ? 'text-red-600' : 'text-amber-600'
                                        }`}>
                                            ~{consumptionStats.daysRemaining} jours restants au rythme actuel
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Chains Usage */}
                            {chainsUsage.length > 0 && (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                                        <h3 className="font-black text-slate-800 flex items-center gap-2">
                                            <Factory className="w-4 h-4 text-slate-400" />
                                            Chaînes Utilisatrices
                                        </h3>
                                        <span className="text-xs text-slate-400 font-bold">{chainsUsage.length} chaîne(s)</span>
                                    </div>
                                    <div className="divide-y divide-slate-50">
                                        {chainsUsage.slice(0, 5).map(ch => (
                                            <div key={ch.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                                        <Factory className="w-5 h-5 text-indigo-600" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-800">{ch.id}</p>
                                                        <p className="text-xs text-slate-400">Dernier: {formatDate(ch.lastUse)}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-black text-slate-700">{ch.qty.toFixed(1)} {product.unite}</p>
                                                    {ch.ofs.length > 0 && (
                                                        <p className="text-[10px] text-indigo-600 font-bold">{ch.ofs.slice(0, 2).join(', ')}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recent Activity Mini */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                                    <h3 className="font-black text-slate-800 flex items-center gap-2">
                                        <History className="w-4 h-4 text-slate-400" />
                                        Activité Récente
                                    </h3>
                                    <button 
                                        onClick={() => setActiveTab('history')}
                                        className="text-xs text-indigo-600 font-bold hover:text-indigo-700 flex items-center gap-1"
                                    >
                                        Voir tout <ChevronRight className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="divide-y divide-slate-50">
                                    {productMvts.slice(0, 4).map(mvt => {
                                        const conf = MVT_ICONS[mvt.type] || MVT_ICONS.sortie;
                                        const Icon = conf.icon;
                                        return (
                                            <div key={mvt.id} className="px-5 py-3 flex items-center gap-4">
                                                <div className={`w-9 h-9 rounded-lg ${conf.bg} flex items-center justify-center shrink-0`}>
                                                    <Icon className={`w-4 h-4 ${conf.color}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-slate-700 capitalize">{mvt.type.replace('_', ' ')}</p>
                                                    <p className="text-xs text-slate-400 truncate">{mvt.notes || (mvt.chaineId ? `→ ${mvt.chaineId}` : '—')}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className={`font-black ${mvt.type === 'entree' || mvt.type === 'retour_atelier' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {mvt.type === 'entree' || mvt.type === 'retour_atelier' ? '+' : '-'}{mvt.quantite}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400">{formatDate(mvt.date)}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {productMvts.length === 0 && (
                                        <div className="px-5 py-8 text-center text-slate-400 text-sm">
                                            Aucun mouvement enregistré
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── HISTORY TAB ─── */}
                    {activeTab === 'history' && (
                        <div className="p-6">
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100">
                                    <h3 className="font-black text-slate-800">Historique Complet</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">{productMvts.length} mouvement(s) enregistré(s)</p>
                                </div>
                                <div className="max-h-[500px] overflow-y-auto">
                                    {productMvts.map((mvt, i) => {
                                        const conf = MVT_ICONS[mvt.type] || MVT_ICONS.sortie;
                                        const Icon = conf.icon;
                                        return (
                                            <div key={mvt.id} className={`px-5 py-4 flex gap-4 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                <div className={`w-11 h-11 rounded-xl ${conf.bg} flex items-center justify-center shrink-0`}>
                                                    <Icon className={`w-5 h-5 ${conf.color}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-black text-slate-800 capitalize">{mvt.type.replace('_', ' ')}</span>
                                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                            mvt.type === 'entree' || mvt.type === 'retour_atelier' 
                                                                ? 'bg-emerald-100 text-emerald-700' 
                                                                : 'bg-rose-100 text-rose-700'
                                                        }`}>
                                                            {mvt.type === 'entree' || mvt.type === 'retour_atelier' ? '+' : '-'}{mvt.quantite} {product.unite}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
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
                                                            <span className="flex items-center gap-1 text-indigo-600 font-bold">
                                                                <FileText className="w-3 h-3" />
                                                                {mvt.modeleRef}
                                                            </span>
                                                        )}
                                                        {mvt.bain && (
                                                            <span className="flex items-center gap-1 text-purple-600 font-bold">
                                                                <Droplets className="w-3 h-3" />
                                                                Bain: {mvt.bain}
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
                                                        <p className="mt-2 text-xs text-slate-600 italic bg-slate-50 rounded-lg px-3 py-2">
                                                            "{mvt.notes}"
                                                        </p>
                                                    )}
                                                </div>
                                                {mvt.prixUnitaire && (
                                                    <div className="text-right shrink-0">
                                                        <p className="text-sm font-bold text-slate-600">{mvt.prixUnitaire.toFixed(2)} DH</p>
                                                        <p className="text-[10px] text-slate-400">/{product.unite}</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {productMvts.length === 0 && (
                                        <div className="px-5 py-16 text-center">
                                            <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                            <p className="text-slate-400 font-bold">Aucun mouvement</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── SUPPLIER TAB ─── */}
                    {activeTab === 'supplier' && (
                        <div className="p-6 space-y-6">
                            {/* Supplier Card */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
                                            <Building2 className="w-6 h-6 text-indigo-600" />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-slate-800">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={editData.fournisseurNom || ''}
                                                        onChange={e => setField('fournisseurNom', e.target.value)}
                                                        className="w-full px-3 py-1 rounded-lg border border-indigo-200 text-slate-800 font-black"
                                                        placeholder="Nom du fournisseur"
                                                    />
                                                ) : (
                                                    product.fournisseurNom || 'Non défini'
                                                )}
                                            </h3>
                                            <p className="text-xs text-slate-500">Fournisseur Principal</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 space-y-4">
                                    {/* Contact Info */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> Téléphone
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="tel"
                                                    value={editData.fournisseurTel || ''}
                                                    onChange={e => setField('fournisseurTel', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                                    placeholder="+212 5XX-XXXXXX"
                                                />
                                            ) : (
                                                <p className="text-sm font-bold text-slate-700">{product.fournisseurTel || '—'}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                                <Mail className="w-3 h-3" /> Email
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="email"
                                                    value={editData.fournisseurEmail || ''}
                                                    onChange={e => setField('fournisseurEmail', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                                    placeholder="contact@fournisseur.ma"
                                                />
                                            ) : (
                                                <p className="text-sm font-bold text-slate-700">{product.fournisseurEmail || '—'}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Address */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                            <MapPin className="w-3 h-3" /> Adresse
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editData.fournisseurAdresse || ''}
                                                onChange={e => setField('fournisseurAdresse', e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                                placeholder="Adresse complète"
                                            />
                                        ) : (
                                            <p className="text-sm font-bold text-slate-700">{product.fournisseurAdresse || '—'}</p>
                                        )}
                                    </div>

                                    {/* Legal Info */}
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                                <Hash className="w-3 h-3" /> ICE
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editData.fournisseurIce || ''}
                                                    onChange={e => setField('fournisseurIce', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                                                />
                                            ) : (
                                                <p className="text-sm font-mono text-slate-600">{product.fournisseurIce || '—'}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                                <FileText className="w-3 h-3" /> RC
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editData.fournisseurRc || ''}
                                                    onChange={e => setField('fournisseurRc', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                                                />
                                            ) : (
                                                <p className="text-sm font-mono text-slate-600">{product.fournisseurRc || '—'}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Business Terms */}
                                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                                <Timer className="w-3 h-3" /> Délai (jours)
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={editData.fournisseurDelaiLivraisonJours || ''}
                                                    onChange={e => setField('fournisseurDelaiLivraisonJours', e.target.value ? parseInt(e.target.value) : undefined)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                                />
                                            ) : (
                                                <p className="text-sm font-bold text-slate-700">{product.fournisseurDelaiLivraisonJours ?? '—'}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                                <ShoppingCart className="w-3 h-3" /> MOQ
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={editData.fournisseurMoq || ''}
                                                    onChange={e => setField('fournisseurMoq', e.target.value ? parseFloat(e.target.value) : undefined)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                                />
                                            ) : (
                                                <p className="text-sm font-bold text-slate-700">{product.fournisseurMoq ?? '—'}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                                <Globe className="w-3 h-3" /> Devise
                                            </label>
                                            {isEditing ? (
                                                <select
                                                    value={editData.fournisseurDevise || ''}
                                                    onChange={e => setField('fournisseurDevise', e.target.value || undefined)}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                                >
                                                    <option value="">—</option>
                                                    <option value="MAD">MAD</option>
                                                    <option value="EUR">EUR</option>
                                                    <option value="USD">USD</option>
                                                </select>
                                            ) : (
                                                <p className="text-sm font-bold text-slate-700">{product.fournisseurDevise || '—'}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Payment Terms */}
                                    <div className="space-y-1 pt-4 border-t border-slate-100">
                                        <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                            <CreditCard className="w-3 h-3" /> Conditions de Paiement
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editData.fournisseurConditionsPaiement || ''}
                                                onChange={e => setField('fournisseurConditionsPaiement', e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                                placeholder="Ex: 30j fin de mois"
                                            />
                                        ) : (
                                            <p className="text-sm font-bold text-slate-700">{product.fournisseurConditionsPaiement || '—'}</p>
                                        )}
                                    </div>

                                    {/* Notes */}
                                    <div className="space-y-1 pt-4 border-t border-slate-100">
                                        <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                            <StickyNote className="w-3 h-3" /> Notes
                                        </label>
                                        {isEditing ? (
                                            <textarea
                                                value={editData.fournisseurNotes || ''}
                                                onChange={e => setField('fournisseurNotes', e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none"
                                                rows={3}
                                                placeholder="Notes sur le fournisseur..."
                                            />
                                        ) : (
                                            <p className="text-sm text-slate-600 italic">{product.fournisseurNotes || 'Aucune note'}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── LOTS TAB ─── */}
                    {activeTab === 'lots' && (
                        <div className="p-6 space-y-6">
                            {/* Bains Summary */}
                            {availableBains.length > 0 && (
                                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-5 border border-purple-100">
                                    <h3 className="font-black text-purple-800 flex items-center gap-2 mb-3">
                                        <Droplets className="w-5 h-5" />
                                        Bains Disponibles
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {availableBains.map((b, i) => (
                                            <div key={i} className="px-3 py-2 bg-white rounded-xl border border-purple-200 shadow-sm">
                                                <p className="font-black text-purple-700">{b.bain}</p>
                                                <p className="text-xs text-slate-500">{b.qty.toFixed(1)} {product.unite}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* All Lots */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100">
                                    <h3 className="font-black text-slate-800">Tous les Lots</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">{productLots.length} lot(s) enregistré(s)</p>
                                </div>
                                <div className="max-h-[400px] overflow-y-auto">
                                    {productLots.map((lot, i) => (
                                        <div key={lot.id} className={`px-5 py-4 flex items-center gap-4 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                lot.quantiteRestante > 0 
                                                    ? 'bg-emerald-50 text-emerald-600' 
                                                    : 'bg-slate-100 text-slate-400'
                                            }`}>
                                                <Layers className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {lot.numBain && (
                                                        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-xs font-bold">
                                                            Bain: {lot.numBain}
                                                        </span>
                                                    )}
                                                    {lot.etat === 'quarantaine' && (
                                                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-bold">
                                                            Quarantaine
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                                    <span>Entrée: {formatDate(lot.dateEntree)}</span>
                                                    {lot.fournisseur && <span>Frs: {lot.fournisseur}</span>}
                                                    <span>{lot.prixUnitaire.toFixed(2)} DH/{product.unite}</span>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className={`text-lg font-black ${lot.quantiteRestante > 0 ? 'text-slate-800' : 'text-slate-400'}`}>
                                                    {lot.quantiteRestante.toFixed(1)}
                                                </p>
                                                <p className="text-[10px] text-slate-400">/ {lot.quantiteInitiale.toFixed(1)} {product.unite}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {productLots.length === 0 && (
                                        <div className="px-5 py-16 text-center">
                                            <Layers className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                            <p className="text-slate-400 font-bold">Aucun lot enregistré</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
