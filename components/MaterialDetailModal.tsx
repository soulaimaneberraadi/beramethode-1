import React from 'react';
import { Truck, CheckCircle, Clock, AlertTriangle, Package, MapPin, Calendar } from 'lucide-react';
import { fmt } from '../app/constants';
import { resolveStock } from '../lib/magasinMatch';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';
import SheetModal from './shared/SheetModal';

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
        /* Fiche de lecture seule : aucune saisie, donc la fermeture au fond et
           par Échap reste autorisée. Pas de bouton plein écran non plus — trois
           encadrés de chiffres n'ont rien à gagner à occuper tout l'écran. */
        <SheetModal
            onClose={onClose}
            title={<span dir="ltr">{material.name}</span>}
            subtitle={material.colorName
                ? <span dir="ltr">{tx(lang, {fr:'Couleur :', ar:'اللون :', en:'Color:', es:'Color:', pt:'Cor:', tr:'Renk:'})} {material.colorName}</span>
                : undefined}
            icon={<Package className="w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0" strokeWidth={1.75} />}
            size="lg"
            zClass="z-[200]"
            footer={(
                <button
                    onClick={onClose}
                    className="inline-flex items-center justify-center h-9 px-4 bg-slate-900 dark:bg-dk-elevated text-white dark:text-dk-text text-[12px] font-medium rounded-md hover:bg-slate-800 dark:hover:bg-dk-border transition-colors"
                >
                    {tx(lang, {fr:'Fermer', ar:'إغلاق', en:'Close', es:'Cerrar', pt:'Fechar', tr:'Kapat'})}
                </button>
            )}
            bodyClassName="flex-1 overflow-y-auto min-h-0 p-3 sm:p-5"
        >
            {/* `dir="ltr"` conservé : les chiffres et unités (m, kg, DH) se lisent
                de gauche à droite même quand l'interface est en arabe. */}
            <div dir="ltr" className="space-y-3 sm:space-y-4">
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
        </SheetModal>
    );
};

export default MaterialDetailModal;
