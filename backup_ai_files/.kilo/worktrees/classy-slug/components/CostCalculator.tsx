import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Banknote, Receipt, LayoutTemplate, FileSpreadsheet, FileDown, Printer, Clock, FileText, PieChart as PieChartIcon, SlidersHorizontal, ClipboardList } from 'lucide-react';
import { Material, AppSettings, PdfSettings, FicheData, PurchasingData } from '../types';
import { translations, fmt } from '../constants';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

import ModelInfo from './ModelInfo';
import MaterialsList from './MaterialsList';
import OrderSimulation from './OrderSimulation';
import SettingsPanel from './SettingsPanel';
import PdfSettingsModal from './PdfSettingsModal';
import TicketView from './TicketView';
import A4DocumentView from './A4DocumentView';
import OrderModelPage from './OrderModelPage';

interface CostCalculatorProps {
    initialArticleName: string;
    initialTotalTime: number;
    chronoTotalTime?: number;
    initialImage: string | null;
    initialDate: string;
    initialCostMinute: number;
    settings: AppSettings;
    ficheData: FicheData;
    setFicheData: React.Dispatch<React.SetStateAction<FicheData>>;
}

export default function CostCalculator({
    initialArticleName,
    initialTotalTime,
    chronoTotalTime,
    initialImage,
    initialDate,
    initialCostMinute,
    settings: initialPropsSettings,
    ficheData,
    setFicheData
}: CostCalculatorProps) {
    // --- UI State Fixed ---
    const lang = 'fr'; // French is better for exact terms requested by user
    const currency = initialPropsSettings?.currency || 'DH';
    const darkMode = false;
    const [viewMode, setViewMode] = useState<'ticket' | 'a4'>('a4'); // Default to A4 as requested
    const [costPage, setCostPage] = useState<'calculator' | 'orderModel'>('calculator');
    const docRefA4 = useRef<HTMLDivElement>(null);

    // --- PDF Settings State ---
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isLibLoaded, setIsLibLoaded] = useState(false);
    const [pdfSettings, setPdfSettings] = useState<PdfSettings>({
        orientation: 'portrait',
        colorMode: 'color',
        scale: 1
    });

    // --- Editable Fields for Document ---
    const [companyName, setCompanyName] = useState("");
    const [companyAddress, setCompanyAddress] = useState("");
    const [companyLegal, setCompanyLegal] = useState("");
    const [docNotes, setDocNotes] = useState("");

    const [docTitle, setDocTitle] = useState("");
    const [docRef, setDocRef] = useState(Math.floor(Math.random() * 10000).toString());
    const [displayDate, setDisplayDate] = useState(initialDate || new Date().toLocaleDateString('fr-FR'));

    const t = translations[lang];

    useEffect(() => {
        if (!docTitle) setDocTitle(t.docTitle);
    }, [lang, t.docTitle, docTitle]);

    useEffect(() => {
        // Need to handle html2pdf using standard browser global
        if ((window as any).html2pdf) {
            setIsLibLoaded(true);
        } else {
            const interval = setInterval(() => {
                if ((window as any).html2pdf) {
                    setIsLibLoaded(true);
                    clearInterval(interval);
                }
            }, 500);
            return () => clearInterval(interval);
        }
    }, []);

    // --- State: Global Settings ---
    const [settings, setSettings] = useState<AppSettings>({
        ...initialPropsSettings,
        costMinute: initialCostMinute || initialPropsSettings?.costMinute || 0.80,
        cutRate: 10,
        packRate: 10,
        marginAtelier: 20,
        tva: 20,
        marginBoutique: 50
    });

    const [tempSettings, setTempSettings] = useState<AppSettings>(settings);

    // --- State: Product ---
    const [productName, setProductName] = useState(initialArticleName || "");

    // Choose between Gamme or Chrono
    const [timeSource, setTimeSource] = useState<'gamme' | 'chrono'>(chronoTotalTime ? 'chrono' : 'gamme');
    const activeBaseTime = timeSource === 'gamme' ? initialTotalTime : (chronoTotalTime || initialTotalTime);
    const [baseTime, setBaseTime] = useState(activeBaseTime);

    const [productImage, setProductImage] = useState<string | null>(initialImage);

    // Update baseTime if source changes
    useEffect(() => {
        setBaseTime(timeSource === 'chrono' && chronoTotalTime ? chronoTotalTime : initialTotalTime);
    }, [timeSource, chronoTotalTime, initialTotalTime]);

    // --- ORDER SIMULATION ---
    const [orderQty, setOrderQty] = useState(1);
    const [partialQty, setPartialQty] = useState(0); // 0 means use total orderQty
    const [wasteRate, setWasteRate] = useState(5);
    const [linkedOrderId, setLinkedOrderId] = useState<string>('');
    const [suiviData, setSuiviData] = useState<any[]>([]);

    useEffect(() => {
        try {
            const data = localStorage.getItem('beramethode_suivi');
            if (data) setSuiviData(JSON.parse(data));
        } catch (e) {
            console.error(e);
        }
    }, []);

    const deductStock = () => {
        if (!confirm("Voulez-vous vraiment déduire les matières du magasin ? Cette action est irréversible.")) return;

        try {
            const magasinStr = localStorage.getItem('beramethode_magasin');
            if (!magasinStr) return;

            let magasinData = JSON.parse(magasinStr);
            let updated = false;

            purchasingData.forEach(mat => {
                const magItem = magasinData.find((m: any) => m.nom === mat.name || m.designation === mat.name);
                if (magItem) {
                    magItem.stockActuel = Math.max(0, (magItem.stockActuel || 0) - mat.qtyToBuy);
                    updated = true;
                }
            });

            if (updated) {
                localStorage.setItem('beramethode_magasin', JSON.stringify(magasinData));
                alert("Stock déduit avec succès !");
                // Trigger a re-render or state update if needed, but local storage is updated.
            } else {
                alert("Aucune matière correspondante trouvée dans le magasin pour la déduction.");
            }
        } catch (e) {
            console.error(e);
            alert("Erreur lors de la déduction du stock.");
        }
    };

    // --- State: Materials ---
    const [materials, setMaterials] = useState<Material[]>(ficheData.materials || []);

    // Sync local materials to FicheData on change
    useEffect(() => {
        setFicheData(prev => ({ ...prev, materials: materials as PurchasingData[] }));
    }, [materials, setFicheData]);

    // --- Calculations ---
    const totalMaterials = materials.reduce((acc, item) => acc + (item.unitPrice * item.qty), 0);
    const cutTime = baseTime * (settings.cutRate / 100);
    const packTime = baseTime * (settings.packRate / 100);
    const totalTime = baseTime + cutTime + packTime;

    const laborCost = totalTime * settings.costMinute;

    const costPrice = totalMaterials + laborCost;
    const sellPriceHT = costPrice * (1 + settings.marginAtelier / 100);
    const sellPriceTTC = sellPriceHT * (1 + settings.tva / 100);
    const boutiquePrice = sellPriceTTC * (1 + settings.marginBoutique / 100);

    const purchasingData = materials.map(m => {
        const totalRaw = m.qty * orderQty;
        const totalWithWaste = totalRaw * (1 + wasteRate / 100);
        const qtyToBuy = (m.unit === 'bobine' || m.unit === 'pc') ? Math.ceil(totalWithWaste) : parseFloat(totalWithWaste.toFixed(2));
        const lineCost = qtyToBuy * m.unitPrice;
        return { ...m, totalRaw, totalWithWaste, qtyToBuy, lineCost };
    });

    const totalPurchasingMatCost = purchasingData.reduce((acc, item) => acc + item.lineCost, 0);

    const costDataForChart = useMemo(() => {
        return [
            { name: 'Matières', value: totalMaterials, color: '#3b82f6' }, // blue-500
            { name: 'Main d\'Œuvre', value: laborCost, color: '#f59e0b' },  // amber-500
            // packaging could be separated later, assuming included in materials for now
        ].filter(d => d.value > 0);
    }, [totalMaterials, laborCost]);

    const handleInstantSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: Math.max(0, parseFloat(value) || 0) }));
    };

    const handleMarginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSettings(prev => ({ ...prev, marginAtelier: parseInt(e.target.value) || 0 }));
    };

    const handleTempSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (parseFloat(value) < 0) return;
        setTempSettings(prev => ({ ...prev, [name]: value }));
    };

    const applyCostMinute = () => {
        setSettings(prev => ({ ...prev, costMinute: Math.max(0, Number(tempSettings.costMinute) || 0) }));
    };

    const addMaterial = () => {
        const newId = materials.length > 0 ? Math.max(...materials.map(m => m.id)) + 1 : 1;
        setMaterials([...materials, { id: newId, name: '', unitPrice: 0, qty: 1, unit: 'pc', threadMeters: 0, threadCapacity: 0 }]);
    };

    const updateMaterial = (id: number, field: string, value: string | number) => {
        setMaterials(materials.map(m => {
            if (m.id !== id) return m;
            let updatedItem = { ...m };

            // Special check if we are importing from Magasin (which passes an object)
            if (field === 'IMPORT_MAGASIN' && typeof value === 'object') {
                const mItem = value as any;
                updatedItem.name = mItem.nom || '';
                updatedItem.unitPrice = Number(mItem.prix) || 0;
                updatedItem.unit = mItem.unite || 'pc';
                updatedItem.fournisseur = mItem.fournisseur || '';

                if (updatedItem.unit === 'bobine') {
                    updatedItem.threadCapacity = 5000;
                    updatedItem.threadMeters = 0;
                    updatedItem.qty = 0;
                }
                return updatedItem;
            }

            if (field === 'name' || field === 'unit') {
                (updatedItem as any)[field] = value;
                if (field === 'unit' && value === 'bobine' && m.threadCapacity === 0) {
                    updatedItem.threadCapacity = 5000;
                    updatedItem.threadMeters = 0;
                    updatedItem.qty = 0;
                }
            } else {
                const numValue = Math.max(0, Number(value) || 0);
                (updatedItem as any)[field] = numValue;
                if (m.unit === 'bobine') {
                    if (field === 'threadMeters' || field === 'threadCapacity') {
                        const con = field === 'threadMeters' ? numValue : m.threadMeters;
                        const cap = field === 'threadCapacity' ? numValue : m.threadCapacity;
                        updatedItem.qty = cap > 0 ? con / cap : 0;
                    }
                }
            }
            return updatedItem;
        }));
    };

    const deleteMaterial = (id: number) => {
        setMaterials(materials.filter(m => m.id !== id));
    };

    const generatePDF = async (action: 'save' | 'preview' = 'save') => {
        const element = docRefA4.current;
        if (!element || !(window as any).html2pdf) return;

        setIsGeneratingPdf(true);

        const clone = element.cloneNode(true) as HTMLElement;
        clone.setAttribute('dir', 'ltr'); // Force LTR since FR

        // Transfer Inputs
        const originalInputs = element.querySelectorAll('input, textarea');
        const cloneInputs = clone.querySelectorAll('input, textarea');
        originalInputs.forEach((original: any, index) => {
            if (cloneInputs[index]) {
                (cloneInputs[index] as HTMLInputElement).value = original.value;
                (cloneInputs[index] as HTMLElement).style.border = 'none';
                (cloneInputs[index] as HTMLElement).style.background = 'transparent';
                (cloneInputs[index] as HTMLElement).style.resize = 'none';
                (cloneInputs[index] as HTMLElement).style.color = 'black';
            }
        });

        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '-10000px';
        container.style.left = '-10000px';
        container.style.zIndex = '-9999';

        const isLandscape = pdfSettings.orientation === 'landscape';
        const widthPx = isLandscape ? '1123px' : '794px';
        const heightPx = isLandscape ? '794px' : '1123px';

        container.style.width = widthPx;
        container.style.minHeight = heightPx;
        container.style.backgroundColor = '#ffffff';

        clone.style.width = '100%';
        clone.style.height = 'auto';
        clone.style.backgroundColor = '#ffffff';
        clone.style.color = '#000000';
        clone.style.padding = '0';
        clone.style.margin = '0';
        clone.style.boxSizing = 'border-box';
        clone.style.fontFamily = "'Inter', sans-serif";

        if (pdfSettings.colorMode === 'grayscale') {
            clone.style.filter = 'grayscale(100%)';
        }

        const allEls = clone.querySelectorAll('*');
        allEls.forEach((el: any) => {
            el.style.color = '#000000';
            if (el.tagName === 'IMG') {
                el.style.maxWidth = '100%';
                el.style.maxHeight = '100%';
                el.style.objectFit = 'contain';
            }
            if (el.classList.contains('bg-slate-800') || el.classList.contains('bg-gray-900')) {
                el.style.backgroundColor = '#f3f4f6';
                el.style.borderColor = '#000';
            }
            if (el.tagName === 'TH') {
                el.style.backgroundColor = '#e5e7eb';
                el.style.color = '#000';
                el.style.border = '1px solid #ccc';
            }
            if (el.tagName === 'TD') {
                el.style.borderBottom = '1px solid #ccc';
            }
            if (el.classList.contains('text-white')) el.classList.remove('text-white');
            if (el.classList.contains('text-gray-100')) el.classList.remove('text-gray-100');
            if (el.tagName === 'BUTTON' || el.tagName === 'LABEL') el.style.display = 'none';
        });

        container.appendChild(clone);
        document.body.appendChild(container);

        const opt = {
            margin: 10,
            filename: `${productName.replace(/ /g, "_") || 'Fiche'}_Revenient.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2 * pdfSettings.scale,
                useCORS: true,
                logging: false,
                scrollX: 0,
                scrollY: 0,
                windowWidth: isLandscape ? 1123 : 794
            },
            jsPDF: { unit: 'px', format: isLandscape ? [1123, 794] : [794, 1123], orientation: pdfSettings.orientation }
        };

        try {
            const worker = (window as any).html2pdf().set(opt).from(clone);
            if (action === 'save') {
                await worker.save();
                setShowPdfModal(false);
            }
        } catch (e) {
            console.error("PDF Error:", e);
            alert("Error generating PDF. Please check your inputs.");
        } finally {
            document.body.removeChild(container);
            setIsGeneratingPdf(false);
        }
    };

    const exportToExcel = () => {
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF";

        csvContent += `${t.docTitle}\n`;
        csvContent += `${t.date}: ${displayDate}\n`;
        csvContent += `${t.modelName}: ${productName}\n\n`;

        csvContent += `${t.matName};Fournisseur;${t.price};${t.qtyUnit};${t.total}\n`;
        materials.forEach(m => {
            csvContent += `"${m.name}";"${m.fournisseur || ''}";${m.unitPrice};${m.qty} ${m.unit};${fmt(m.unitPrice * m.qty)}\n`;
        });
        csvContent += `;;;;${t.totalMat}: ${fmt(totalMaterials)} ${currency}\n\n`;

        csvContent += `${t.laborCost};${fmt(laborCost)} ${currency}\n`;
        csvContent += `${t.costPrice};${fmt(costPrice)} ${currency}\n`;
        csvContent += `${t.sellHT};${fmt(sellPriceHT)} ${currency}\n`;
        csvContent += `${t.sellTTC};${fmt(sellPriceTTC)} ${currency}\n`;
        csvContent += `${t.shopPrice};${fmt(boutiquePrice)} ${currency}\n\n`;

        csvContent += `${t.orderNeedsTitle} (${t.orderQty}: ${orderQty})\n`;
        csvContent += `${t.matName};Fournisseur;${t.price};${t.qtyToBuy};${t.totalLine}\n`;
        purchasingData.forEach(p => {
            csvContent += `"${p.name}";"${p.fournisseur || ''}";${p.unitPrice};${fmt(p.qtyToBuy)} ${p.unit};${fmt(p.lineCost)}\n`;
        });
        csvContent += `;;;;${t.realBudget}: ${fmt(totalPurchasingMatCost)} ${currency}\n`;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${productName.replace(/ /g, "_") || 'donnees'}_data.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const bgMain = 'bg-gray-50';
    const bgCard = 'bg-white border-slate-200 object-shadow-sm transition-all hover:shadow-md';
    const bgCardHeader = 'bg-slate-50 border-slate-200';
    const textPrimary = 'text-slate-800';
    const textSecondary = 'text-slate-500';
    const inputBg = 'bg-white border-slate-300 text-slate-900';
    const tableHeader = 'bg-slate-50 text-slate-500';
    const tableRowHover = 'hover:bg-blue-50/30';

    return (
        <div dir="ltr" style={{ fontFamily: "'Inter', sans-serif" }} className={`min-h-screen ${bgMain} p-4 pb-24 transition-colors duration-300`}>

            <PdfSettingsModal
                t={t} darkMode={darkMode} showPdfModal={showPdfModal} setShowPdfModal={setShowPdfModal}
                isGeneratingPdf={isGeneratingPdf} isLibLoaded={isLibLoaded}
                pdfSettings={pdfSettings} setPdfSettings={setPdfSettings}
                generatePDF={generatePDF}
            >
                <A4DocumentView
                    ref={null}
                    t={t} currency={currency} darkMode={false}
                    productName={productName} displayDate={displayDate} setDisplayDate={setDisplayDate}
                    docRef={docRef} setDocRef={setDocRef}
                    companyName={companyName} setCompanyName={setCompanyName}
                    companyAddress={companyAddress} setCompanyAddress={setCompanyAddress}
                    companyLegal={companyLegal} setCompanyLegal={setCompanyLegal}
                    companyLogo={null} handleLogoUpload={() => { }}
                    baseTime={baseTime} totalTime={totalTime} settings={settings}
                    productImage={productImage} materials={materials}
                    laborCost={laborCost} costPrice={costPrice}
                    sellPriceHT={sellPriceHT} sellPriceTTC={sellPriceTTC}
                    boutiquePrice={boutiquePrice} orderQty={orderQty}
                    wasteRate={wasteRate} purchasingData={purchasingData}
                    totalPurchasingMatCost={totalPurchasingMatCost}
                    docNotes={docNotes} setDocNotes={setDocNotes}
                />
            </PdfSettingsModal>

            <div className={`w-full mx-auto mb-6 flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4 print:hidden`}>
                <div className="flex items-center gap-4 self-start md:self-center">
                    <div className="flex flex-col">
                        <h1 className={`text-2xl font-black tracking-tight text-slate-800`}>Fiche de Coût</h1>
                        <p className={`text-sm font-medium text-slate-500`}>Gestion des prix et marges commerciales</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 self-end md:self-center">
                    {/* أمر الإنتاج Button */}
                    <button
                        onClick={() => setCostPage(costPage === 'orderModel' ? 'calculator' : 'orderModel')}
                        className={`flex items-center gap-2 px-4 py-2 text-xs rounded-lg font-bold transition-all border ${costPage === 'orderModel'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
                            }`}
                    >
                        <ClipboardList className="w-4 h-4" /> أمر الإنتاج
                    </button>

                    {chronoTotalTime !== undefined && chronoTotalTime > 0 && (
                        <div className="flex bg-slate-100 rounded-lg p-1" title="Source du temps de couture">
                            <button
                                onClick={() => setTimeSource('gamme')}
                                className={`px-4 py-2 text-xs rounded-md font-bold transition-all ${timeSource === 'gamme' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Gamme ({initialTotalTime} min)
                            </button>
                            <button
                                onClick={() => setTimeSource('chrono')}
                                className={`px-4 py-2 text-xs rounded-md font-bold transition-all flex items-center gap-1 ${timeSource === 'chrono' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Clock className="w-3 h-3" /> Chrono ({chronoTotalTime} min)
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── COST PAGE: ORDER MODEL ── */}
            {costPage === 'orderModel' && (
                <OrderModelPage
                    productName={productName}
                    productImage={productImage}
                    displayDate={displayDate}
                    currency={currency}
                    materials={materials}
                    addMaterial={addMaterial}
                    updateMaterial={updateMaterial}
                    deleteMaterial={deleteMaterial}
                    totalMaterials={totalMaterials}
                    wasteRate={wasteRate}
                    setWasteRate={setWasteRate}
                    purchasingData={purchasingData}
                    totalPurchasingMatCost={totalPurchasingMatCost}
                    laborCost={laborCost}
                    costPrice={costPrice}
                    sellPriceHT={sellPriceHT}
                    sellPriceTTC={sellPriceTTC}
                    boutiquePrice={boutiquePrice}
                    totalTime={totalTime}
                    baseTime={baseTime}
                    settings={settings}
                    ficheData={ficheData}
                    setFicheData={setFicheData}
                    deductStock={deductStock}
                />
            )}

            {/* ── COST PAGE: CALCULATOR (original) ── */}
            {costPage === 'calculator' && (
                <div className="w-full mx-auto space-y-8">
                    <div className="space-y-6 print:hidden">
                        <ModelInfo
                            t={t} currency={currency} darkMode={darkMode}
                            productName={productName} setProductName={setProductName}
                            baseTime={baseTime} setBaseTime={setBaseTime}
                            totalTime={totalTime} settings={settings} setSettings={setSettings}
                            tempSettings={tempSettings} setTempSettings={setTempSettings}
                            productImage={productImage} setProductImage={setProductImage}
                            applyCostMinute={applyCostMinute}
                            handleInstantSettingChange={handleInstantSettingChange}
                            handleTempSettingChange={handleTempSettingChange}
                            inputBg={inputBg} textPrimary={textPrimary}
                            textSecondary={textSecondary} bgCard={bgCard} bgCardHeader={bgCardHeader}
                        />

                        <MaterialsList
                            t={t} currency={currency} darkMode={darkMode}
                            materials={materials} addMaterial={addMaterial}
                            updateMaterial={updateMaterial} deleteMaterial={deleteMaterial}
                            bgCard={bgCard} bgCardHeader={bgCardHeader}
                            textPrimary={textPrimary} textSecondary={textSecondary}
                            tableHeader={tableHeader} tableRowHover={tableRowHover}
                            totalMaterials={totalMaterials}
                        />

                        <OrderSimulation
                            t={t} currency={currency} darkMode={darkMode}
                            orderQty={orderQty} setOrderQty={setOrderQty}
                            deductStock={deductStock}
                            wasteRate={wasteRate} setWasteRate={setWasteRate}
                            purchasingData={purchasingData}
                            totalPurchasingMatCost={totalPurchasingMatCost}
                            laborCost={laborCost}
                            textSecondary={textSecondary} textPrimary={textPrimary} bgCard={bgCard}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <SettingsPanel
                                t={t} darkMode={darkMode} settings={settings}
                                handleChange={handleInstantSettingChange}
                                bgCard={bgCard} bgCardHeader={bgCardHeader}
                                textPrimary={textPrimary} textSecondary={textSecondary}
                                inputBg={inputBg}
                            />

                            {/* ADVANCED: Margin Simulator & Chart */}
                            <div className={`${bgCard} rounded-2xl border shadow-sm flex flex-col overflow-hidden`}>
                                <div className={`${bgCardHeader} p-4 border-b flex items-center justify-between`}>
                                    <h3 className={`font-black text-lg ${textPrimary} flex items-center gap-2`}><SlidersHorizontal className="w-5 h-5 text-blue-500" /> Analyse & Simulation</h3>
                                </div>
                                <div className="p-6 flex flex-col md:flex-row gap-8">
                                    <div className="flex-1 flex flex-col">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Simulateur de Marge</h4>
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-semibold text-sm text-slate-700">Marge Atelier ciblée</span>
                                                <span className="font-black text-blue-600 text-lg">{settings.marginAtelier}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0" max="100" step="1"
                                                value={settings.marginAtelier}
                                                onChange={handleMarginChange}
                                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                            <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-200">
                                                <span className="text-xs font-semibold text-slate-500">Prix de Vente HT simulé:</span>
                                                <span className="font-black text-slate-800 text-xl">{fmt(sellPriceHT)} <span className="text-xs opacity-50">{currency}</span></span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-48 h-48 shrink-0 flex flex-col relative">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center absolute -top-2 left-0 right-0 z-10">Répartition Coût (PR)</h4>
                                        {totalMaterials > 0 || laborCost > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={costDataForChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={60} stroke="none">
                                                        {costDataForChart.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                                                    </Pie>
                                                    <RechartsTooltip formatter={(val: number) => `${fmt(val)} ${currency}`} />
                                                    <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-medium">Aucune donnée</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full">
                        <div className={`rounded-xl shadow-lg border overflow-hidden flex flex-col bg-white border-slate-200`}>
                            <div className={`p-2 border-b flex gap-2 bg-slate-50 border-slate-200 print:hidden`}>
                                <button onClick={() => setViewMode('ticket')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition ${viewMode === 'ticket' ? 'bg-blue-600 text-white shadow-sm' : `text-slate-500 hover:bg-black/5`}`}><Receipt className="w-4 h-4" /> {t.viewTicket}</button>
                                <button onClick={() => setViewMode('a4')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition ${viewMode === 'a4' ? 'bg-blue-600 text-white shadow-sm' : `text-slate-500 hover:bg-black/5`}`}><FileText className="w-4 h-4" /> Export Fiche A4 ({t.viewDoc})</button>
                            </div>

                            {viewMode === 'ticket' && (
                                <TicketView
                                    t={t} currency={currency} darkMode={darkMode}
                                    productName={productName} displayDate={displayDate}
                                    totalMaterials={totalMaterials} totalTime={totalTime}
                                    laborCost={laborCost} costPrice={costPrice}
                                    settings={settings} productImage={productImage}
                                    textPrimary={textPrimary} textSecondary={textSecondary}
                                    materials={materials} cutTime={cutTime} packTime={packTime}
                                    sellPriceHT={sellPriceHT} sellPriceTTC={sellPriceTTC}
                                    boutiquePrice={boutiquePrice}
                                />
                            )}

                            {viewMode === 'a4' && (
                                <>
                                    <div className={`p-4 border-b flex justify-between items-center bg-slate-50 border-slate-200 print:hidden`}>
                                        <h2 className={`font-bold text-slate-800`}>Fiche de Rendement A4</h2>
                                        <div className="flex gap-2">
                                            <button onClick={exportToExcel} className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-sm transition"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
                                            <button onClick={() => setShowPdfModal(true)} className="flex items-center gap-1 text-xs bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg shadow-sm transition"><FileDown className="w-4 h-4" /> PDF</button>
                                            <button onClick={() => window.print()} className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg shadow-sm transition"><Printer className="w-4 h-4" /> Imprimer</button>
                                        </div>
                                    </div>

                                    <div className="bg-slate-200 p-8 flex justify-center">
                                        <A4DocumentView
                                            ref={docRefA4}
                                            t={t} currency={currency} darkMode={false}
                                            productName={productName || 'Article...'} displayDate={displayDate} setDisplayDate={setDisplayDate}
                                            docRef={docRef} setDocRef={setDocRef}
                                            companyName={companyName} setCompanyName={setCompanyName}
                                            companyAddress={companyAddress} setCompanyAddress={setCompanyAddress}
                                            companyLegal={companyLegal} setCompanyLegal={setCompanyLegal}
                                            companyLogo={null} handleLogoUpload={() => { }}
                                            baseTime={baseTime} totalTime={totalTime} settings={settings}
                                            productImage={productImage} materials={materials}
                                            laborCost={laborCost} costPrice={costPrice}
                                            sellPriceHT={sellPriceHT} sellPriceTTC={sellPriceTTC}
                                            boutiquePrice={boutiquePrice} orderQty={orderQty}
                                            wasteRate={wasteRate} purchasingData={purchasingData}
                                            totalPurchasingMatCost={totalPurchasingMatCost}
                                            docNotes={docNotes} setDocNotes={setDocNotes}
                                            isRTL={false}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
