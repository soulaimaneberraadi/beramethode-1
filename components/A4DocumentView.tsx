import React, { forwardRef } from 'react';
import { Building2, CheckCircle, ChevronRight, PenTool } from 'lucide-react';
import { Material, PurchasingData, AppSettings } from '../types';
import { fmt } from '../constants';
import SensitiveValue from './ui/SensitiveValue';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

interface A4DocumentViewProps {
    t: any;
    currency: string;
    darkMode: boolean;
    productName: string;
    displayDate: string;
    setDisplayDate: (v: string) => void;
    docRef: string;
    setDocRef: (v: string) => void;
    companyName: string;
    setCompanyName: (v: string) => void;
    companyAddress: string;
    setCompanyAddress: (v: string) => void;
    companyLegal: string;
    setCompanyLegal: (v: string) => void;
    companyLogo: string | null;
    handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    baseTime: number;
    totalTime: number;
    settings: AppSettings;
    productImage: string | null;
    materials: Material[];
    laborCost: number;
    costPrice: number;
    sellPriceHT: number;
    sellPriceTTC: number;
    boutiquePrice: number;
    orderQty: number;
    wasteRate: number;
    purchasingData: PurchasingData[];
    totalPurchasingMatCost: number;
    docNotes: string;
    setDocNotes: (v: string) => void;
    isRTL?: boolean;
    isExport?: boolean;
    /** Sous-traitance active : la ligne « Main d'Œuvre » devient « Façon ». */
    soustraitanceActive?: boolean;
    /** Sections à afficher dans la fiche (toutes visibles par défaut). */
    sections?: { info?: boolean; nomenclature?: boolean; pricing?: boolean; order?: boolean; notes?: boolean };
}

const A4DocumentView = forwardRef<HTMLDivElement, A4DocumentViewProps>(({
    currency, productName, displayDate, setDisplayDate, docRef, setDocRef,
    companyName, setCompanyName, companyAddress, setCompanyAddress, companyLegal, setCompanyLegal, companyLogo, handleLogoUpload,
    baseTime, totalTime, settings, productImage,
    materials, laborCost, costPrice, sellPriceHT, sellPriceTTC, boutiquePrice,
    orderQty, wasteRate, purchasingData, totalPurchasingMatCost, docNotes, setDocNotes,
    isExport = false, soustraitanceActive = false, sections = {}
}, ref) => {

    const { lang } = useLang();

    // Visibilité des sections (visible par défaut quand non précisé).
    const show = {
        info: sections.info !== false,
        nomenclature: sections.nomenclature !== false,
        pricing: sections.pricing !== false,
        order: sections.order !== false,
        notes: sections.notes !== false,
    };

    const inputClasses = "bg-transparent outline-none hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-300 rounded px-1 py-0.5 transition-all w-full text-slate-800 print:text-black text-[10px]";

    return (
        <div
            ref={ref}
            className="fiche-a4-doc w-full max-w-[21cm] mx-auto bg-white p-4 md:p-5 print:shadow-none print:p-0 print:m-0 text-slate-800"
            style={{ fontFamily: "'Inter', sans-serif" }}
        >
            {/* Top Border */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-900 print:bg-black"></div>

            {/* HEADER - Ultra Compact */}
            <header className="flex justify-between items-start gap-3 mb-4 pt-2">
                <div className="flex gap-2 items-start">
                    {companyLogo ? (
                        <div className="w-8 h-8 shrink-0 rounded overflow-hidden border border-slate-200">
                            <img src={companyLogo} alt="Logo" className="w-full h-full object-contain" />
                        </div>
                    ) : (
                        <div className="w-7 h-7 bg-slate-900 flex items-center justify-center shrink-0 rounded">
                            <Building2 className="w-3 h-3 text-white" />
                        </div>
                    )}
                    <div className="flex-1 space-y-0">
                        <input
                            type="text"
                            placeholder={tx(lang, {fr:'BERAMETHODE SARL', ar:'BERAMETHODE SARL', en:'BERAMETHODE SARL', es:'BERAMETHODE SARL', pt:'BERAMETHODE SARL', tr:'BERAMETHODE SARL'})}
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className={`font-black tracking-tight text-xs uppercase ${inputClasses} placeholder:text-slate-300`}
                        />
                        <input
                            type="text"
                            placeholder={tx(lang, {fr:'123 Zone Industrielle', ar:'123 Zone Industrielle', en:'123 Zone Industrielle', es:'123 Zone Industrielle', pt:'123 Zone Industrielle', tr:'123 Zone Industrielle'})}
                            value={companyAddress}
                            onChange={(e) => setCompanyAddress(e.target.value)}
                            className={`text-[8px] text-slate-500 ${inputClasses} placeholder:text-slate-300`}
                        />
                    </div>
                </div>

                <div className="flex flex-col items-end text-right">
                    <h1 className="text-sm font-black text-slate-900 tracking-tight uppercase print:text-black">
                        {tx(lang, {fr:'FICHE DE COÛT', ar:'بطاقة التكلفة', en:'COST SHEET', es:'FICHA DE COSTE', pt:'FICHA DE CUSTO', tr:'MALİYET FİŞİ'})}
                    </h1>
                    <div className="w-8 h-0.5 bg-blue-600 mb-1 print:bg-slate-400"></div>
                    <div className="flex gap-3 text-[8px] font-semibold text-slate-500">
                        <div className="flex items-center gap-0.5">
                            <span className="text-slate-400">{tx(lang, {fr:'Date:', ar:'التاريخ:', en:'Date:', es:'Fecha:', pt:'Data:', tr:'Tarih:'})}</span>
                            <input
                                type="text"
                                value={displayDate}
                                onChange={(e) => setDisplayDate(e.target.value)}
                                className="w-16 bg-transparent outline-none text-slate-700 print:text-black"
                            />
                        </div>
                        <div className="flex items-center gap-0.5">
                            <span className="text-slate-400">{tx(lang, {fr:'Réf:', ar:'المرجع:', en:'Ref:', es:'Ref:', pt:'Ref:', tr:'Ref:'})}</span>
                            <input
                                type="text"
                                value={docRef}
                                onChange={(e) => setDocRef(e.target.value)}
                                className="w-12 bg-transparent outline-none text-slate-700 print:text-black"
                            />
                        </div>
                    </div>
                </div>
            </header>

            {/* PRODUCT BLOCK - Compact */}
            {show.info && (
            <div className="mb-4 rounded overflow-hidden border border-slate-200/60 bg-slate-50 dark:bg-dk-bg/50 flex">
                <div className="flex-1 p-3 flex flex-col justify-center">
                    <span className="text-[7px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-0.5">
                        {tx(lang, {fr:'Désignation', ar:'التسمية', en:'Designation', es:'Designación', pt:'Designação', tr:'Tanım'})}
                    </span>
                    <h2 className="text-sm font-black text-slate-900 tracking-tight print:text-black mb-2">
                        {productName || tx(lang, {fr:'Article Non Défini', ar:'منتج غير محدد', en:'Undefined Item', es:'Artículo No Definido', pt:'Artigo Não Definido', tr:'Tanımsız Ürün'})}
                    </h2>
                    <div className="flex items-center gap-2">
                        <div className="bg-white border border-slate-200 rounded px-2 py-1 shadow-sm">
                            <span className="text-[6px] font-bold text-slate-400 uppercase block">{tx(lang, {fr:'Tps', ar:'الوقت', en:'Time', es:'Tpo', pt:'Tmp', tr:'Sür'})}</span>
                            <span className="text-[10px] font-black text-slate-800">{fmt(totalTime)} min</span>
                        </div>
                        <div className="bg-white border border-slate-200 rounded px-2 py-1 shadow-sm">
                            <span className="text-[6px] font-bold text-slate-400 uppercase block">{soustraitanceActive ? tx(lang, {fr:'Façon/pc', ar:'تشغيل/قطعة', en:'Subcon/pc', es:'Subcon/pz', pt:'Subcon/pc', tr:'Taşeron/ad'}) : tx(lang, {fr:'Coût/M', ar:'تكلفة/د', en:'Cost/M', es:'Costo/M', pt:'Custo/M', tr:'Maliyet/dk'})}</span>
                            <span className="text-[10px] font-black text-slate-800">{fmt(soustraitanceActive ? laborCost : settings.costMinute)} {currency}</span>
                        </div>
                    </div>
                </div>
                {productImage && (
                    <div className="w-16 shrink-0 bg-white border-l border-slate-200/60 p-1 flex items-center justify-center">
                        <img src={productImage} alt={tx(lang, {fr:'Modèle', ar:'النموذج', en:'Model', es:'Modelo', pt:'Modelo', tr:'Model'})} className="w-full h-full object-contain rounded" />
                    </div>
                )}
            </div>
            )}

            {/* COST TABLE - Ultra Compact */}
            {show.nomenclature && (
            <div className="mb-4">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-900 flex items-center gap-1 mb-1.5">
                    <CheckCircle className="w-2.5 h-2.5 text-slate-400" /> {tx(lang, {fr:'Nomenclature', ar:'قائمة المواد', en:'Bill of Materials', es:'Lista de Materiales', pt:'Lista de Materiais', tr:'Malzeme Listesi'})}
                </span>
                <table className="w-full text-left text-[9px] border-b border-slate-200" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                        <col style={{ width: '46%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '18%' }} />
                    </colgroup>
                    <thead>
                        <tr className="border-b border-slate-900 text-[7px] uppercase font-bold text-slate-500 tracking-widest">
                            <th className="pb-1 pt-1 font-bold">{tx(lang, {fr:'Composant', ar:'المكون', en:'Component', es:'Componente', pt:'Componente', tr:'Bileşen'})}</th>
                            <th className="pb-1 pt-1 text-center font-bold">{tx(lang, {fr:'Prix U.', ar:'سعر الوحدة', en:'Unit Price', es:'Precio U.', pt:'Preço Uni.', tr:'Birim Fiyat'})}</th>
                            <th className="pb-1 pt-1 text-center font-bold">{tx(lang, {fr:'Qté', ar:'الكمية', en:'Qty', es:'Cant', pt:'Qtde', tr:'Miktar'})}</th>
                            <th className="pb-1 pt-1 text-right font-bold">{tx(lang, {fr:'Montant', ar:'المبلغ', en:'Amount', es:'Importe', pt:'Valor', tr:'Tutar'})}</th>
                        </tr>
                    </thead>
                    <tbody className="text-slate-700">
                        {materials.map((m) => (
                            <tr key={m.id} className="border-b border-slate-100 last:border-0">
                                <td className="py-0.5 font-semibold text-slate-900">{m.name || '-'}</td>
                                <td className="py-0.5 text-center text-[8px]">{isExport ? 0 : m.unitPrice}</td>
                                <td className="py-0.5 text-center font-mono text-[8px]">{fmt(m.qty)} <span className="text-[6px] text-slate-400">{m.unit}</span></td>
                                <td className="py-0.5 text-right font-bold text-slate-900 text-[8px]">{isExport ? 0 : fmt(m.qty * m.unitPrice)}</td>
                            </tr>
                        ))}
                        <tr className="border-b border-slate-200 bg-slate-50 dark:bg-dk-bg/50">
                            <td className="py-1 font-bold text-slate-900" colSpan={3}>
                                <div className="flex items-center gap-0.5">
                                    <ChevronRight className="w-2 h-2 text-slate-400" />
                                    <span className="text-[8px]">{soustraitanceActive ? tx(lang, {fr:'Façon (sous-traitance)', ar:'تشغيل (مقاولة خارجية)', en:'Subcontracting', es:'Subcontratación', pt:'Subcontratação', tr:'Taşeron'}) : tx(lang, {fr:`Main d'Œuvre (${fmt(totalTime)} × ${settings.costMinute})`, ar:`اليد العاملة (${fmt(totalTime)} × ${settings.costMinute})`, en:`Labor (${fmt(totalTime)} × ${settings.costMinute})`, es:`Mano de Obra (${fmt(totalTime)} × ${settings.costMinute})`, pt:`Mão de Obra (${fmt(totalTime)} × ${settings.costMinute})`, tr:`İşçilik (${fmt(totalTime)} × ${settings.costMinute})`})}</span>
                                </div>
                            </td>
                            <td className="py-1 text-right font-bold text-slate-900 text-[8px]">{fmt(laborCost)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            )}

            {/* PRICING - Compact */}
            {show.pricing && (
            <div className="flex justify-end mb-4">
                <div className="w-full md:w-8/12 rounded border border-slate-200 overflow-hidden">
                    <div className="bg-slate-900 text-white px-3 py-2 flex justify-between items-center">
                        <span className="font-semibold uppercase tracking-widest text-[8px] text-slate-400">{tx(lang, {fr:'Coût de Revient', ar:'تكلفة الإنتاج', en:'Cost Price', es:'Precio de Coste', pt:'Preço de Custo', tr:'Maliyet Fiyatı'})}</span>
                        <div className="text-base font-black tabular-nums"><SensitiveValue field="model.prix_revient">{fmt(costPrice)} <span className="text-[8px] opacity-50">{currency}</span></SensitiveValue></div>
                    </div>
                    <div className="bg-white px-3 py-2 space-y-1.5">
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                            <span className="text-[8px] font-bold uppercase text-slate-600">{tx(lang, {fr:'Prix Vente HT', ar:'سعر البيع بدون الضريبة', en:'Selling Price (excl. tax)', es:'Precio Venta sin IVA', pt:'Preço Venda s/IVA', tr:'Satış Fiyatı (KDV Hariç)'})} <span className="text-slate-400">+{settings.marginAtelier}%</span></span>
                            <span className="font-semibold text-[10px] text-slate-800">{fmt(sellPriceHT)}</span>
                        </div>
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                            <span className="text-[8px] font-bold uppercase text-slate-600">{tx(lang, {fr:'Prix Vente TTC', ar:'سعر البيع شامل الضريبة', en:'Selling Price (incl. tax)', es:'Precio Venta con IVA', pt:'Preço Venda c/IVA', tr:'Satış Fiyatı (KDV Dahil)'})} <span className="text-slate-400">+{settings.tva}%</span></span>
                            <span className="font-bold text-[10px] text-slate-900">{fmt(sellPriceTTC)}</span>
                        </div>
                        <div className="flex items-center justify-between pt-0.5">
                            <span className="text-[7px] font-bold uppercase text-slate-400">{tx(lang, {fr:'Prix Boutique', ar:'سعر المتجر', en:'Retail Price', es:'Precio Tienda', pt:'Preço Loja', tr:'Perakende Fiyat'})}</span>
                            <span className="font-black text-[10px] text-slate-400">{fmt(boutiquePrice)} {currency}</span>
                        </div>
                    </div>
                </div>
            </div>
            )}

            {/* ORDER - Compact */}
            {show.order && orderQty > 0 && (
                <div className="mb-4">
                    <h3 className="text-[8px] font-black uppercase tracking-widest text-slate-900 mb-1 flex items-center justify-between">
                        {tx(lang, {fr:'Prévisions Achat', ar:'توقعات الشراء', en:'Purchase Forecast', es:'Previsión de Compra', pt:'Previsão de Compra', tr:'Satın Alma Tahmini'})}
                        <div className="flex gap-1.5 font-semibold text-[7px] tracking-normal">
                            <span className="bg-slate-100 text-slate-600 px-1 py-0.5 rounded">{tx(lang, {fr:'Ordre:', ar:'الطلب:', en:'Order:', es:'Pedido:', pt:'Pedido:', tr:'Sipariş:'})} {orderQty}</span>
                            <span className="bg-slate-100 text-slate-600 px-1 py-0.5 rounded">{tx(lang, {fr:'Déchet:', ar:'التالف:', en:'Waste:', es:'Desperdicio:', pt:'Desperdício:', tr:'Fire:'})} {wasteRate}%</span>
                        </div>
                    </h3>
                    <table className="w-full text-[8px] text-left border-y border-slate-900" style={{ tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '52%' }} />
                            <col style={{ width: '26%' }} />
                            <col style={{ width: '22%' }} />
                        </colgroup>
                        <thead className="text-[6px] uppercase tracking-widest text-slate-500 font-bold border-b border-slate-200">
                            <tr>
                                <th className="py-1">{tx(lang, {fr:'Matière', ar:'المادة', en:'Material', es:'Material', pt:'Material', tr:'Malzeme'})}</th>
                                <th className="py-1 text-center">{tx(lang, {fr:'Qté', ar:'الكمية', en:'Qty', es:'Cant', pt:'Qtde', tr:'Miktar'})}</th>
                                <th className="py-1 text-right">{tx(lang, {fr:'Budget', ar:'الميزانية', en:'Budget', es:'Presupuesto', pt:'Orçamento', tr:'Bütçe'})}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-800">
                            {purchasingData.map((m) => (
                                <tr key={m.id}>
                                    <td className="py-0.5">{m.name}</td>
                                    <td className="py-0.5 text-center font-mono">{fmt(m.qtyToBuy)} <span className="text-[6px] text-slate-400">{m.unit}</span></td>
                                    <td className="py-0.5 text-right">{fmt(m.lineCost)}</td>
                                </tr>
                            ))}
                            <tr className="bg-slate-50 dark:bg-dk-bg border-t border-slate-200">
                                <td colSpan={2} className="py-1 text-right font-bold text-slate-500 uppercase text-[6px]">{tx(lang, {fr:'Budget:', ar:'الميزانية:', en:'Budget:', es:'Presupuesto:', pt:'Orçamento:', tr:'Bütçe:'})}</td>
                                <td className="py-1 text-right font-black text-[9px] text-slate-900">{fmt(totalPurchasingMatCost)} {currency}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {/* NOTES & SIGNATURES - Ultra Compact */}
            {show.notes && (
            <div className="mt-3 pt-2 border-t border-slate-200">
                <textarea
                    placeholder={tx(lang, {fr:'Notes...', ar:'ملاحظات...', en:'Notes...', es:'Notas...', pt:'Notas...', tr:'Notlar...'})}
                    value={docNotes}
                    onChange={(e) => setDocNotes(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-dk-bg rounded p-1.5 outline-none resize-none h-8 text-[8px] text-slate-600 placeholder:text-slate-400 print:bg-white print:text-black"
                />
            </div>
            )}

            <div className="mt-2 pt-2 flex justify-between text-[7px] uppercase font-bold text-slate-500">
                <div className="w-[45%] border-t border-slate-200 pt-1 text-center">{tx(lang, {fr:'Signature', ar:'التوقيع', en:'Signature', es:'Firma', pt:'Assinatura', tr:'İmza'})}</div>
                <div className="w-[45%] border-t border-slate-200 pt-1 text-center">{tx(lang, {fr:'Signature', ar:'التوقيع', en:'Signature', es:'Firma', pt:'Assinatura', tr:'İmza'})}</div>
            </div>

            <div className="mt-2 text-center text-[7px] font-bold tracking-widest text-slate-300 uppercase pb-1">
                BeraMethode ERP
            </div>
        </div>
    );
});

A4DocumentView.displayName = 'A4DocumentView';
export default A4DocumentView;
