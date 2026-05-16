import React, { forwardRef } from 'react';
import { Building2, MapPin, FileText, Hash, CheckCircle, ChevronRight, PenTool } from 'lucide-react';
import { Material, PurchasingData, AppSettings } from '../types';
import { fmt } from '../constants';

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
}

const A4DocumentView = forwardRef<HTMLDivElement, A4DocumentViewProps>(({
    currency, productName, displayDate, setDisplayDate, docRef, setDocRef,
    companyName, setCompanyName, companyAddress, setCompanyAddress, companyLegal, setCompanyLegal, companyLogo, handleLogoUpload,
    baseTime, totalTime, settings, productImage,
    materials, laborCost, costPrice, sellPriceHT, sellPriceTTC, boutiquePrice,
    orderQty, wasteRate, purchasingData, totalPurchasingMatCost, docNotes, setDocNotes
}, ref) => {

    // Clean, minimalist input styling for a sharp look
    const inputClasses = "bg-transparent outline-none hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-300 rounded px-1 py-0.5 transition-all w-full text-slate-800 print:text-black";

    return (
        <div
            ref={ref}
            className="w-full max-w-[21cm] mx-auto bg-white p-10 md:p-14 shadow-2xl print:shadow-none print:p-0 print:m-0 animate-in fade-in duration-500 rounded-sm print:rounded-none relative text-slate-800"
            style={{ minHeight: '29.7cm', fontFamily: "'Inter', sans-serif" }}
        >
            {/* Elegant Top Border */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-900 print:bg-black"></div>

            {/* HEADER: Minimalist Split */}
            <header className="flex flex-col md:flex-row justify-between items-start gap-8 mb-10 pt-4 relative">

                {/* Left: Company Details */}
                <div className="w-full md:w-1/2 flex gap-4 items-start">
                    {companyLogo ? (
                        <div className="w-16 h-16 shrink-0 rounded overflow-hidden p-1 border border-slate-200 print:border-none">
                            <img src={companyLogo} alt="Logo" className="w-full h-full object-contain" />
                        </div>
                    ) : (
                        <div className="w-14 h-14 bg-slate-900 flex items-center justify-center shrink-0 rounded-xl print:bg-black">
                            <Building2 className="w-6 h-6 text-white" />
                        </div>
                    )}

                    <div className="flex-1 space-y-1 mt-1">
                        <input
                            type="text"
                            placeholder="MBERATEX SARL"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className={`font-black tracking-tight text-xl uppercase ${inputClasses} placeholder:text-slate-300`}
                        />
                        <div className="flex items-start gap-2 text-sm text-slate-500 print:text-slate-700">
                            <textarea
                                placeholder="123 Zone Industrielle, Tanger"
                                value={companyAddress}
                                onChange={(e) => setCompanyAddress(e.target.value)}
                                className={`resize-none h-10 leading-relaxed text-xs ${inputClasses} placeholder:text-slate-300`}
                            />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 print:text-slate-500">
                            <input
                                type="text"
                                placeholder="RC: 123456 | ICE: 0000000000"
                                value={companyLegal}
                                onChange={(e) => setCompanyLegal(e.target.value)}
                                className={`${inputClasses} placeholder:text-slate-200`}
                            />
                        </div>
                    </div>
                </div>

                {/* Right: Document Title & Meta */}
                <div className="w-full md:w-1/2 flex flex-col items-end text-right">
                    <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-2 print:text-black">
                        FICHE DE COÛT
                    </h1>
                    <div className="w-16 h-1 bg-blue-600 mb-6 print:bg-slate-400"></div>

                    <div className="flex flex-col gap-2 w-full max-w-[200px]">
                        <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1">
                            <span>Date</span>
                            <input
                                type="text"
                                value={displayDate}
                                onChange={(e) => setDisplayDate(e.target.value)}
                                className="text-right w-24 bg-transparent outline-none text-slate-800 print:text-black"
                            />
                        </div>
                        <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1">
                            <span>Référence</span>
                            <div className="flex items-center gap-1">
                                <Hash className="w-3 h-3" />
                                <input
                                    type="text"
                                    value={docRef}
                                    onChange={(e) => setDocRef(e.target.value)}
                                    className="text-right font-mono w-20 bg-transparent outline-none text-slate-800 print:text-black"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* PRODUCT BLOCK: High-contrast sleek card */}
            <div className="mb-10 rounded-2xl overflow-hidden border border-slate-200/60 bg-slate-50/50 print:bg-white print:border-slate-300 flex">
                <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-2 print:text-slate-500">
                        Désignation Modèle
                    </span>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight print:text-black mb-6">
                        {productName || 'Article Non Défini'}
                    </h2>

                    {/* Meta tags for times */}
                    <div className="flex flex-wrap items-center justify-start gap-4">
                        <div className="flex flex-col bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm print:shadow-none print:border-slate-300">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Tps Unitaire</span>
                            <span className="text-lg font-black text-slate-800 leading-none">{fmt(totalTime)} <span className="text-xs font-semibold text-slate-400 ml-0.5">min</span></span>
                        </div>
                        <div className="flex flex-col bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm print:shadow-none print:border-slate-300">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Coût Minute</span>
                            <span className="text-lg font-black text-slate-800 leading-none">{fmt(settings.costMinute)} <span className="text-xs font-semibold text-slate-400 ml-0.5">{currency}</span></span>
                        </div>
                    </div>
                </div>

                {productImage && (
                    <div className="w-40 md:w-56 shrink-0 bg-white border-l border-slate-200/60 p-4 print:border-l-slate-300 flex items-center justify-center">
                        <img src={productImage} alt="Modèle" className="w-full h-full object-contain rounded-lg" />
                    </div>
                )}
            </div>

            {/* MAIN COST TABLE: Clean, Professional, Minimal Borders */}
            <div className="mb-10">
                <span className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-4 print:text-black">
                    <CheckCircle className="w-4 h-4 text-slate-400" /> Nomenclature & Coûts Détaillés
                </span>

                <table className="w-full text-left text-sm border-b border-slate-200 print:border-black">
                    <thead>
                        <tr className="border-b-2 border-slate-900 print:border-black text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                            <th className="pb-3 pt-2 font-bold w-1/2">Composant</th>
                            <th className="pb-3 pt-2 text-center font-bold">Prix U. ({currency})</th>
                            <th className="pb-3 pt-2 text-center font-bold">Consommation</th>
                            <th className="pb-3 pt-2 text-right font-bold w-1/5">Montant ({currency})</th>
                        </tr>
                    </thead>
                    <tbody className="text-slate-700 print:text-black">
                        {materials.map((m, index) => (
                            <tr key={m.id} className="border-b border-slate-100 print:border-slate-200 last:border-0 hover:bg-slate-50">
                                <td className="py-3 font-semibold text-slate-900 print:text-black">
                                    {m.name || '-'}
                                    {m.fournisseur && <span className="block text-[10px] font-medium text-slate-400 mt-0.5">{m.fournisseur}</span>}
                                </td>
                                <td className="py-3 text-center">{m.unitPrice}</td>
                                <td className="py-3 text-center font-mono text-xs">{fmt(m.qty)} <span className="text-[10px] text-slate-400">{m.unit}</span></td>
                                <td className="py-3 text-right font-bold text-slate-900 print:text-black">{fmt(m.qty * m.unitPrice)}</td>
                            </tr>
                        ))}

                        {/* Labor Row */}
                        <tr className="border-b border-slate-200 bg-slate-50/50 print:bg-slate-50 print:border-slate-300">
                            <td className="py-4 font-bold text-slate-900 print:text-black" colSpan={3}>
                                <div className="flex items-center gap-2">
                                    <ChevronRight className="w-4 h-4 text-slate-400" />
                                    Main d'Œuvre
                                    <span className="font-normal text-xs text-slate-500 ml-2">({fmt(totalTime)} min × {settings.costMinute})</span>
                                </div>
                            </td>
                            <td className="py-4 text-right font-bold text-slate-900 print:text-black">{fmt(laborCost)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* PRICING BLOCK: Swiss Minimalist */}
            <div className="flex flex-col md:flex-row justify-end mb-12 page-break-inside-avoid">
                <div className="w-full md:w-7/12 rounded-xl border border-slate-200 overflow-hidden print:border-slate-300">

                    {/* PR Box */}
                    <div className="bg-slate-900 text-white p-6 flex flex-col sm:flex-row justify-between sm:items-center print:bg-slate-100 print:text-black print:border-b print:border-slate-300 gap-2">
                        <span className="font-semibold uppercase tracking-widest text-xs text-slate-400 print:text-slate-600">
                            Coût de Revient (PR)
                        </span>
                        <div className="text-4xl font-black tabular-nums tracking-tight">
                            {fmt(costPrice)} <span className="text-xl font-medium opacity-50">{currency}</span>
                        </div>
                    </div>

                    {/* Margins & Taxes */}
                    <div className="bg-white p-6 space-y-5 print:bg-white text-sm">

                        <div className="flex items-center justify-between pb-4 border-b border-slate-100 print:border-slate-200">
                            <div className="flex flex-col">
                                <span className="text-slate-800 font-bold uppercase tracking-wider text-[11px] print:text-black">
                                    Prix de Vente H.T
                                </span>
                                <span className="text-slate-400 text-[10px] mt-0.5">Avec marge atelier de {settings.marginAtelier}%</span>
                            </div>
                            <span className="font-semibold text-lg text-slate-800 tabular-nums">{fmt(sellPriceHT)}</span>
                        </div>

                        <div className="flex items-center justify-between pb-4 border-b border-slate-100 print:border-slate-200">
                            <div className="flex flex-col">
                                <span className="text-slate-800 font-bold uppercase tracking-wider text-[11px] print:text-black">
                                    Prix de Vente T.T.C
                                </span>
                                <span className="text-slate-400 text-[10px] mt-0.5">Taxe {settings.tva}% incluse</span>
                            </div>
                            <span className="font-bold text-xl text-slate-900 tabular-nums print:text-black">{fmt(sellPriceTTC)}</span>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                                Estimation Prix Boutique
                            </span>
                            <span className="font-black text-slate-400 tabular-nums">{fmt(boutiquePrice)} {currency}</span>
                        </div>

                    </div>
                </div>
            </div>

            {/* ORDER SIMULATION / BOM */}
            {orderQty > 0 && (
                <div className="mb-10 page-break-inside-avoid">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 mb-4 flex items-center justify-between print:text-black">
                        Prévisions d'Achat (BOM)
                        <div className="flex gap-4 font-semibold text-[10px] tracking-normal">
                            <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded print:border print:border-slate-300">Ordre: {orderQty}</span>
                            <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded print:border print:border-slate-300">Taux Déchet: {wasteRate}%</span>
                        </div>
                    </h3>

                    <table className="w-full text-sm text-left border-y-2 border-slate-900 print:border-black">
                        <thead className="text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-slate-200">
                            <tr>
                                <th className="py-3">Matière / Fourniture</th>
                                <th className="py-3 text-center">Quantité à Acheter</th>
                                <th className="py-3 text-right">Budget Requis</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                            {purchasingData.map((m) => (
                                <tr key={m.id} className="hover:bg-slate-50">
                                    <td className="py-3">{m.name}</td>
                                    <td className="py-3 text-center font-mono text-xs">{fmt(m.qtyToBuy)} <span className="text-slate-400">{m.unit}</span></td>
                                    <td className="py-3 text-right">{fmt(m.lineCost)}</td>
                                </tr>
                            ))}
                            <tr className="bg-slate-50 border-t-2 border-slate-200">
                                <td colSpan={2} className="py-4 text-right font-bold text-slate-500 uppercase tracking-widest text-[10px]">
                                    Budget Global Matières:
                                </td>
                                <td className="py-4 text-right font-black text-base text-slate-900">
                                    {fmt(totalPurchasingMatCost)} <span className="text-xs font-semibold grayscale">{currency}</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {/* FOOTER / NOTES */}
            <div className="mt-12 page-break-inside-avoid pt-6 border-t border-slate-200">
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 print:text-slate-500">
                    <PenTool className="w-3 h-3" /> Notes & Conditions
                </span>
                <textarea
                    placeholder="Conditions de paiement, validité de l'offre, délais de production..."
                    value={docNotes}
                    onChange={(e) => setDocNotes(e.target.value)}
                    className="w-full bg-slate-50 hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-slate-300 rounded-lg p-5 outline-none resize-none h-24 text-xs text-slate-600 font-medium placeholder:text-slate-400 transition-all print:bg-white print:border-none print:p-0 print:text-black leading-relaxed"
                />
            </div>

            <div className="mt-8 pt-8 flex justify-between print:flex text-[10px] uppercase font-bold text-slate-500 w-full mb-12">
                <div className="w-[45%] border-t-2 border-slate-200 pt-2 text-center print:border-slate-300">
                    <span className="block mb-12">Signature & Câchet<br /><span className="text-[8px] font-medium opacity-70">L'Entreprise</span></span>
                </div>
                <div className="w-[45%] border-t-2 border-slate-200 pt-2 text-center print:border-slate-300">
                    <span className="block mb-12">Signature & Câchet<br /><span className="text-[8px] font-medium opacity-70">Le Client / Validation</span></span>
                </div>
            </div>

            {/* Very bottom branding */}
            <div className="mt-12 text-center text-[9px] font-bold tracking-widest text-slate-300 uppercase print:text-slate-400 pb-4">
                Document Généré par BeraMethode ERP
            </div>
        </div>
    );
});

export default A4DocumentView;
