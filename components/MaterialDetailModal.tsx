import React from 'react';
import { X, Truck, CheckCircle, Clock, AlertTriangle, Package, MapPin, Calendar } from 'lucide-react';
import { fmt } from '../constants';
import { resolveStock } from '../lib/magasinMatch';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';

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
        reserved?: number;
    };
    currency: string;
    magasinData?: any[];
    onClose: () => void;
}

const MaterialDetailModal: React.FC<MaterialDetailModalProps> = ({
    material, currency, magasinData = [], onClose
}) => {
    const { lang } = useLang();
    const st = resolveStock(material, magasinData, material.qtyToBuy, material.reserved || 0, material.pieces || 0);
    const stockActuel = st.stockActuel;
    const delaiLivraison = st.delaiLivraison;
    const fournisseurNom = st.fournisseur;
    const isDelivered = st.isDelivered;
    const isPartial = st.isPartial;
    const manque = st.manque;
    const piecesCouvertes = st.piecesCouvertes;

    const getStatus = () => {
        if (isDelivered) return { label: tx(lang, {fr:'En stock', ar:'متوفر بالمخزون', en:'In stock', es:'En stock', pt:'Em stock', tr:'Stokta'}), icon: CheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200' };
        if (isPartial) return { label: tx(lang, {fr:'Stock partiel', ar:'مخزون جزئي', en:'Partial stock', es:'Stock parcial', pt:'Stock parcial', tr:'Kısmi stok'}), icon: AlertTriangle, color: 'text-amber-700', bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-200' };
        return { label: tx(lang, {fr:'En attente', ar:'قيد الانتظار', en:'Pending', es:'Pendiente', pt:'Pendente', tr:'Beklemede'}), icon: Clock, color: 'text-rose-700', bg: 'bg-rose-50 dark:bg-rose-900/30', border: 'border-rose-200' };
    };

    const status = getStatus();
    const StatusIcon = status.icon;

    return (
        <div dir="ltr" className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white dark:bg-dk-surface rounded-lg border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="px-4 sm:px-5 h-12 border-b border-slate-100 dark:border-dk-border flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0" strokeWidth={1.75} />
                        <div className="min-w-0">
                            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text tracking-tight truncate">{material.name}</h3>
                            {material.colorName && (
                                <p className="text-[11px] text-slate-400 dark:text-dk-muted truncate">{tx(lang, {fr:'Couleur :', ar:'اللون :', en:'Color:', es:'Color:', pt:'Cor:', tr:'Renk:'})} {material.colorName}</p>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0">
                        <X className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                </div>

                <div className="p-3 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto">
                    <div className={`flex items-center gap-2.5 p-3 rounded-md border ${status.bg} ${status.border}`}>
                        <StatusIcon className={`w-4 h-4 shrink-0 ${status.color}`} strokeWidth={1.75} />
                        <div className="min-w-0">
                            <span className={`text-[12px] font-semibold ${status.color}`}>{status.label}</span>
                            {isPartial && (
                                <p className="text-[11px] text-slate-500 dark:text-dk-muted mt-0.5">
                                    {fmt(stockActuel)} {material.unit} {tx(lang, {fr:'en stock /', ar:'في المخزون /', en:'in stock /', es:'en stock /', pt:'em stock /', tr:'stokta /'})} {fmt(material.qtyToBuy)} {material.unit} {tx(lang, {fr:'nécessaires', ar:'مطلوبة', en:'required', es:'necesarios', pt:'necessários', tr:'gerekli'})}
                                    {material.pieces ? <> · {tx(lang, {fr:'couvre', ar:'يغطي', en:'covers', es:'cubre', pt:'cobre', tr:'kapsar'})} <span className="font-semibold text-amber-700">{fmt(piecesCouvertes)}</span> / {fmt(material.pieces)} pcs</> : null}
                                </p>
                            )}
                            {isDelivered && (
                                <p className="text-[11px] text-slate-500 dark:text-dk-muted mt-0.5">{tx(lang, {fr:'Stock suffisant :', ar:'مخزون كاف:', en:'Sufficient stock:', es:'Stock suficiente:', pt:'Stock suficiente:', tr:'Yeterli stok:'})} {fmt(stockActuel)} {material.unit}</p>
                            )}
                            {!isDelivered && !isPartial && (
                                <p className="text-[11px] text-slate-500 dark:text-dk-muted mt-0.5">{fmt(manque)} {material.unit} {tx(lang, {fr:'manquants', ar:'مفقودة', en:'missing', es:'faltantes', pt:'faltando', tr:'eksik'})}</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                        <div className="bg-slate-50 dark:bg-dk-bg/60 rounded-md p-3 border border-slate-200 dark:border-dk-border">
                            <span className="text-[10px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wider block mb-1">{tx(lang, {fr:'Prix Unitaire HT', ar:'السعر الوحدوي HT', en:'Unit Price HT', es:'Precio Unitario HT', pt:'Preço Unitário HT', tr:'Birim Fiyat HT'})}</span>
                            <span className="text-[15px] font-semibold text-slate-900 dark:text-dk-text tabular-nums">{fmt(material.unitPrice)} <span className="text-[11px] font-normal text-slate-400 dark:text-dk-muted">{currency}</span></span>
                        </div>
                        <div className="bg-slate-50 dark:bg-dk-bg/60 rounded-md p-3 border border-slate-200 dark:border-dk-border">
                            <span className="text-[10px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wider block mb-1">{tx(lang, {fr:'Quantité à acheter', ar:'الكمية المطلوب شراؤها', en:'Quantity to buy', es:'Cantidad a comprar', pt:'Quantidade a comprar', tr:'Satın alınacak miktar'})}</span>
                            <span className="text-[15px] font-semibold text-slate-900 dark:text-dk-text tabular-nums">{fmt(material.qtyToBuy)} <span className="text-[11px] font-normal text-slate-400 dark:text-dk-muted">{material.unit}</span></span>
                        </div>
                        <div className="bg-[#2149C1]/5 rounded-md p-3 border border-[#2149C1]/20">
                            <span className="text-[10px] font-medium text-[#2149C1] uppercase tracking-wider block mb-1">{tx(lang, {fr:'Coût Total HT', ar:'التكلفة الإجمالية HT', en:'Total Cost HT', es:'Costo Total HT', pt:'Custo Total HT', tr:'Toplam Maliyet HT'})}</span>
                            <span className="text-[15px] font-semibold text-[#2149C1] tabular-nums">{fmt(material.lineCost)} <span className="text-[11px] font-normal text-[#2149C1]/60">{currency}</span></span>
                        </div>
                        {material.pieces !== undefined && (
                            <div className="bg-slate-50 dark:bg-dk-bg/60 rounded-md p-3 border border-slate-200 dark:border-dk-border">
                                <span className="text-[10px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wider block mb-1">{tx(lang, {fr:'Pièces concernées', ar:'القطع المعنية', en:'Pieces concerned', es:'Piezas concernidas', pt:'Peças concernidas', tr:'İlgili parçalar'})}</span>
                                <span className="text-[15px] font-semibold text-slate-900 dark:text-dk-text tabular-nums">{fmt(material.pieces)} <span className="text-[11px] font-normal text-slate-400 dark:text-dk-muted">pcs</span></span>
                            </div>
                        )}
                    </div>

                    <div className="rounded-md border border-slate-200 dark:border-dk-border p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-2.5">
                            <Truck className="w-4 h-4 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                            <span className="text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wider">{tx(lang, {fr:'Fournisseur & Livraison', ar:'المورد والتسليم', en:'Supplier & Delivery', es:'Proveedor y Entrega', pt:'Fornecedor e Entrega', tr:'Tedarikçi ve Teslimat'})}</span>
                        </div>
                        {fournisseurNom ? (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5 text-[#2149C1]" strokeWidth={1.75} />
                                    <span className="text-[13px] font-semibold text-slate-800 dark:text-dk-text">{fournisseurNom}</span>
                                </div>
                                {delaiLivraison !== null && (
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                                        <span className="text-[12px] text-slate-600 dark:text-dk-text-soft">{tx(lang, {fr:'Délai de livraison :', ar:'مدة التسليم :', en:'Delivery time:', es:'Plazo de entrega:', pt:'Prazo de entrega:', tr:'Teslim süresi:'})} <span className="font-semibold">{delaiLivraison} {tx(lang, {fr:'jours', ar:'أيام', en:'days', es:'días', pt:'dias', tr:'gün'})}</span></span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-[12px] text-slate-400 dark:text-dk-muted italic">{tx(lang, {fr:'Aucun fournisseur renseigné', ar:'لا يوجد مورد مدخل', en:'No supplier entered', es:'Ningún proveedor informado', pt:'Nenhum fornecedor informado', tr:'Tedarikçi girilmemiş'})}</p>
                        )}
                    </div>

                    <div className="rounded-md border border-slate-200 dark:border-dk-border p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Package className="w-4 h-4 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                            <span className="text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wider">{tx(lang, {fr:'État du Stock', ar:'حالة المخزون', en:'Stock Status', es:'Estado del Stock', pt:'Estado do Stock', tr:'Stok Durumu'})}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div>
                                <span className="text-[10px] text-slate-400 dark:text-dk-muted font-medium uppercase block mb-0.5">{tx(lang, {fr:'En Stock', ar:'في المخزون', en:'In Stock', es:'En Stock', pt:'Em Stock', tr:'Stokta'})}</span>
                                <span className={`text-[14px] font-semibold tabular-nums ${stockActuel > 0 ? 'text-emerald-700' : 'text-slate-400 dark:text-dk-muted'}`}>{fmt(stockActuel)}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 dark:text-dk-muted font-medium uppercase block mb-0.5">{tx(lang, {fr:'Besoin', ar:'الاحتياج', en:'Need', es:'Necesidad', pt:'Necessidade', tr:'İhtiyaç'})}</span>
                                <span className="text-[14px] font-semibold text-slate-900 dark:text-dk-text tabular-nums">{fmt(material.qtyToBuy)}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 dark:text-dk-muted font-medium uppercase block mb-0.5">{tx(lang, {fr:'Manque', ar:'الناقص', en:'Shortage', es:'Falta', pt:'Falta', tr:'Eksik'})}</span>
                                <span className={`text-[14px] font-semibold tabular-nums ${manque > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(manque)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-4 sm:px-5 py-3.5 border-t border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg flex justify-end shrink-0">
                    <button
                        onClick={onClose}
                        className="inline-flex items-center justify-center h-9 px-4 bg-slate-900 text-white text-[12px] font-medium rounded-md hover:bg-slate-800 transition-colors"
                    >
                        {tx(lang, {fr:'Fermer', ar:'إغلاق', en:'Close', es:'Cerrar', pt:'Fechar', tr:'Kapat'})}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MaterialDetailModal;
