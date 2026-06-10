import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Banknote, Receipt, LayoutTemplate, FileSpreadsheet, FileDown, Printer, Clock, FileText, PieChart as PieChartIcon, SlidersHorizontal, Scissors, Trash2, Check, AlertTriangle } from 'lucide-react';
import { Material, AppSettings, PdfSettings, FicheData, PurchasingData } from '../types';
import { translations, fmt } from '../constants';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { ResponsiveChart } from './ui/ResponsiveChart';

import ModelInfo from './ModelInfo';
import MaterialsList from './MaterialsList';
import OrderSimulation from './OrderSimulation';
import SettingsPanel from './SettingsPanel';
import PdfSettingsModal from './PdfSettingsModal';
import TicketView from './TicketView';
import A4DocumentView from './A4DocumentView';
import ThreadCalculator from './ThreadCalculator';
import { Operation } from '../types';

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
    operations?: Operation[];
    setOperations?: React.Dispatch<React.SetStateAction<Operation[]>>;
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
    setFicheData,
    operations = [],
    setOperations
}: CostCalculatorProps) {
    // --- UI State Fixed ---
    const lang = 'fr'; // French is better for exact terms requested by user
    const currency = initialPropsSettings?.currency || 'DH';
    const darkMode = false;
    const [viewMode, setViewMode] = useState<'ticket' | 'a4'>('a4'); // Default to A4 as requested
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

    // Sections visibles dans la fiche PDF (l'utilisateur masque ce qu'il ne veut pas).
    const [pdfSections, setPdfSections] = useState({
        info: true,
        nomenclature: true,
        pricing: true,
        order: true,
        notes: true,
    });

    // --- Editable Fields for Document ---
    const [companyName, setCompanyName] = useState("");
    const [companyAddress, setCompanyAddress] = useState("");
    const [companyLegal, setCompanyLegal] = useState("");
    const [docNotes, setDocNotes] = useState("");

    const [docTitle, setDocTitle] = useState("");
    const [docRef, setDocRef] = useState(Math.floor(Math.random() * 10000).toString());
    const [displayDate, setDisplayDate] = useState(initialDate || new Date().toLocaleDateString('fr-FR'));

    // --- Confirm Modal State ---
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'danger' | 'success' | 'warning';
        onConfirm: () => void;
        confirmText?: string;
        hideCancel?: boolean;
    }>({ isOpen: false, title: '', message: '', type: 'danger', onConfirm: () => {} });

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
        setConfirmDialog({
            isOpen: true,
            title: "Confirmer la déduction",
            message: "Voulez-vous vraiment déduire les matières du magasin ? Cette action est irréversible.",
            type: 'danger',
            confirmText: "Déduire",
            onConfirm: () => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
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
                        setConfirmDialog({
                            isOpen: true,
                            title: "Succès",
                            message: "Stock déduit avec succès !",
                            type: 'success',
                            hideCancel: true,
                            onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })),
                        });
                    } else {
                        setConfirmDialog({
                            isOpen: true,
                            title: "Attention",
                            message: "Aucune matière correspondante trouvée dans le magasin pour la déduction.",
                            type: 'warning',
                            hideCancel: true,
                            onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })),
                        });
                    }
                } catch (e) {
                    console.error(e);
                    setConfirmDialog({
                        isOpen: true,
                        title: "Erreur",
                        message: "Erreur lors de la déduction du stock.",
                        type: 'danger',
                        hideCancel: true,
                        onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })),
                    });
                }
            }
        });
    };

    // --- State: Thread Calculator ---
    const [showThreadCalc, setShowThreadCalc] = useState(false);

    // --- State: Materials ---
    const [materials, setMaterials] = useState<Material[]>(ficheData.materials || []);

    // Sync local materials to FicheData on change
    useEffect(() => {
        setFicheData(prev => ({ ...prev, materials: materials as PurchasingData[] }));
    }, [materials, setFicheData]);

    // --- Calculations ---
    const isExport = ficheData.typeMarche === 'Export';
    const totalMaterials = isExport ? 0 : materials.reduce((acc, item) => acc + (item.unitPrice * item.qty), 0);
    const cutTime = baseTime * (settings.cutRate / 100);
    const packTime = baseTime * (settings.packRate / 100);
    const totalTime = baseTime + cutTime + packTime;

    const laborCost = totalTime * settings.costMinute;

    const costPrice = isExport ? laborCost : totalMaterials + laborCost;
    const sellPriceHT = costPrice * (1 + settings.marginAtelier / 100);
    const sellPriceTTC = sellPriceHT * (1 + settings.tva / 100);
    const boutiquePrice = sellPriceTTC * (1 + settings.marginBoutique / 100);

    // Quantité réelle de la commande = somme de la grille (couleurs × tailles),
    // sinon la quantité du modèle. C'est elle qui pilote « Estimation des Besoins ».
    const commandeQty = useMemo(() => {
        const gq = ficheData.gridQuantities || {};
        const total = Object.values(gq).reduce((acc: number, v) => acc + (Number(v) || 0), 0);
        return total > 0 ? total : (ficheData.quantity || 0);
    }, [ficheData.gridQuantities, ficheData.quantity]);

    // Quantité par couleur (nom de couleur → nb de pièces) pour ventiler les fils :
    // un fil ne se consomme que sur les pièces de SA couleur, pas sur toute la commande.
    const colorQtyByName = useMemo(() => {
        const gq = ficheData.gridQuantities || {};
        const cols = ficheData.colors || [];
        const sizeCount = (ficheData.sizes || []).length;
        const map: Record<string, number> = {};
        const seen = new Set<string>();
        cols.forEach(c => {
            // Ignore les couleurs en double (même id → même grille) pour ne pas
            // compter deux fois la même quantité de fil.
            if (seen.has(c.id)) return;
            seen.add(c.id);
            let sum = 0;
            for (let s = 0; s < sizeCount; s++) sum += Number(gq[`${c.id}_${s}`] || 0);
            if (c.name) map[c.name] = (map[c.name] || 0) + sum;
        });
        return map;
    }, [ficheData.gridQuantities, ficheData.colors, ficheData.sizes]);

    // Par défaut, la simulation d'achat reflète la quantité réelle de la commande.
    // L'utilisateur peut toujours la modifier pour simuler une autre quantité.
    useEffect(() => {
        if (commandeQty > 0) setOrderQty(commandeQty);
    }, [commandeQty]);

    const purchasingData = materials.map(m => {
        // Un fil suit la quantité de SA couleur ; les autres matières suivent la
        // quantité totale de la commande. Si l'utilisateur simule une autre quantité
        // (orderQty ≠ commande), la ventilation des fils reste proportionnelle.
        const colorQty = m.threadColor ? (colorQtyByName[m.threadColor] || 0) : 0;
        const baseQty = colorQty > 0
            ? (commandeQty > 0 ? colorQty * (orderQty / commandeQty) : colorQty)
            : orderQty;
        const totalRaw = m.qty * baseQty;
        const totalWithWaste = totalRaw * (1 + wasteRate / 100);
        const qtyToBuy = (m.unit === 'bobine' || m.unit === 'pc') ? Math.ceil(totalWithWaste) : parseFloat(totalWithWaste.toFixed(2));
        const lineCost = isExport ? 0 : qtyToBuy * m.unitPrice;
        return { ...m, totalRaw, totalWithWaste, qtyToBuy, lineCost };
    });

    const totalPurchasingMatCost = isExport ? 0 : purchasingData.reduce((acc, item) => acc + item.lineCost, 0);

    const costDataForChart = useMemo(() => {
        const matVal = isExport ? 0 : totalMaterials;
        return [
            { name: 'Matières', value: matVal, color: '#2149C1' }, // accent blue
            { name: 'Main d\'Œuvre', value: laborCost, color: '#94a3b8' },  // slate-400
            // packaging could be separated later, assuming included in materials for now
        ].filter(d => d.value > 0);
    }, [totalMaterials, laborCost, isExport]);

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

    const applyThreadMaterials = (threadMaterials: Material[]) => {
        // Remove existing thread materials (those starting with "Fil ")
        const filtered = materials.filter(m => !m.name.startsWith('Fil '));
        // Add new thread materials with new IDs
        const maxId = filtered.length > 0 ? Math.max(...filtered.map(m => m.id)) : 0;
        const newMaterials = threadMaterials.map((m, i) => ({ ...m, id: maxId + i + 1 }));
        setMaterials([...filtered, ...newMaterials]);
        setShowThreadCalc(false);
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
    const bgCard = 'bg-white border-slate-200 transition-colors';
    const bgCardHeader = 'bg-white border-slate-100';
    const textPrimary = 'text-slate-800';
    const textSecondary = 'text-slate-500';
    const inputBg = 'bg-slate-50/60 border-slate-200 text-slate-900';
    const tableHeader = 'bg-slate-50/60 text-slate-500';
    const tableRowHover = 'hover:bg-slate-50/50';

    return (
        <div dir="ltr" className={`min-h-screen ${bgMain} p-2 sm:p-4 pb-24 transition-colors duration-300`}>

            <PdfSettingsModal
                t={t} darkMode={darkMode} showPdfModal={showPdfModal} setShowPdfModal={setShowPdfModal}
                isGeneratingPdf={isGeneratingPdf} isLibLoaded={isLibLoaded}
                pdfSettings={pdfSettings} setPdfSettings={setPdfSettings}
                generatePDF={generatePDF}
                pdfSections={pdfSections} setPdfSections={setPdfSections}
            >
                <A4DocumentView
                    ref={null}
                    sections={pdfSections}
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
                    isExport={isExport}
                />
            </PdfSettingsModal>

            <div className={`w-full mx-auto mb-3 sm:mb-5 flex flex-col md:flex-row justify-between items-start sm:items-center bg-white px-3 sm:px-5 h-auto md:h-14 py-2.5 sm:py-3 md:py-0 rounded-lg border border-slate-200 gap-2 sm:gap-3 print:hidden`}>
                <div className="flex items-center gap-2 sm:gap-3 self-start md:self-center">
                    <div className="flex items-baseline gap-1.5 sm:gap-2.5">
                        <h1 className={`text-[13px] sm:text-[15px] font-semibold tracking-tight text-slate-900`}>Fiche de Coût</h1>
                        <span className="text-[10px] sm:text-[12px] text-slate-400">Prix &amp; marges</span>
                        {ficheData.typeMarche === 'Export' && (
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded font-medium">
                                Export · Main d'œuvre seule
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 self-end md:self-center">
                    {chronoTotalTime !== undefined && chronoTotalTime > 0 && (
                        <div className="inline-flex p-0.5 bg-slate-100/60 rounded-md" title="Source du temps de couture">
                            <button
                                onClick={() => setTimeSource('gamme')}
                                className={`px-2 sm:px-2.5 h-6 sm:h-7 text-[10px] sm:text-[11px] font-medium rounded transition-all ${timeSource === 'gamme' ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Gamme ({initialTotalTime} min)
                            </button>
                            <button
                                onClick={() => setTimeSource('chrono')}
                                className={`px-2 sm:px-2.5 h-6 sm:h-7 text-[10px] sm:text-[11px] font-medium rounded transition-all inline-flex items-center gap-1 ${timeSource === 'chrono' ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" strokeWidth={1.75} /> Chrono ({chronoTotalTime} min)
                            </button>
                        </div>
                    )}

                </div>
            </div>

            {/* ── FICHE DE COÛT (page unique) ── */}
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

                        {/* Calcul Fil Button */}
                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowThreadCalc(true)}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium transition-colors"
                            >
                                <Scissors className="w-3.5 h-3.5" strokeWidth={1.75} />
                                Calcul Fil
                                {operations.length > 0 && (
                                    <span className="bg-white/15 px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums">
                                        {operations.length} op.
                                    </span>
                                )}
                            </button>
                        </div>

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
                            isExport={isExport}
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
                            <div className="bg-white rounded-lg border border-slate-200 flex flex-col overflow-hidden">
                                <div className="px-5 h-12 border-b border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <SlidersHorizontal className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                                        <div>
                                            <h3 className="text-[13px] font-semibold text-slate-900 tracking-tight">Analyse &amp; Simulation</h3>
                                            <p className="text-[11px] text-slate-400">Marge &amp; répartition</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5 flex flex-col md:flex-row gap-6">
                                    <div className="flex-1 flex flex-col">
                                        <h4 className="text-[11px] font-medium text-slate-500 mb-3">Simulateur de Marge</h4>
                                        <div className="bg-slate-50/60 p-4 rounded-md border border-slate-200">
                                            <div className="flex justify-between items-center mb-2.5">
                                                <span className="text-[12px] text-slate-600">Marge Atelier ciblée</span>
                                                <span className="text-[15px] font-semibold text-slate-900 tabular-nums">{settings.marginAtelier}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0" max="100" step="1"
                                                value={settings.marginAtelier}
                                                onChange={handleMarginChange}
                                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                                            />
                                            <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-200">
                                                <span className="text-[12px] text-slate-500">Prix de Vente HT simulé</span>
                                                <span className="text-[15px] font-semibold text-slate-900 tabular-nums">{fmt(sellPriceHT)} <span className="text-[11px] font-normal text-slate-400">{currency}</span></span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-44 h-44 shrink-0 flex flex-col relative">
                                        <h4 className="text-[11px] font-medium text-slate-500 text-center absolute -top-1 left-0 right-0 z-10">Répartition Coût (PR)</h4>
                                        {totalMaterials > 0 || laborCost > 0 ? (
                                            <ResponsiveChart>
                                                <PieChart>
                                                    <Pie data={costDataForChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={60} stroke="none">
                                                        {costDataForChart.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                                                    </Pie>
                                                    <RechartsTooltip formatter={(val: number) => `${fmt(val)} ${currency}`} />
                                                    <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                                                </PieChart>
                                            </ResponsiveChart>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-medium">Aucune donnée</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full">
                        <div className={`rounded-lg border overflow-hidden flex flex-col bg-white border-slate-200`}>
                            <div className={`p-1.5 border-b flex gap-1 bg-slate-50/60 border-slate-100 print:hidden`}>
                                <button onClick={() => setViewMode('ticket')} className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-all ${viewMode === 'ticket' ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : `text-slate-500 hover:text-slate-700`}`}><Receipt className="w-3.5 h-3.5" strokeWidth={1.75} /> {t.viewTicket}</button>
                                <button onClick={() => setViewMode('a4')} className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-all ${viewMode === 'a4' ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : `text-slate-500 hover:text-slate-700`}`}><FileText className="w-3.5 h-3.5" strokeWidth={1.75} /> Export Fiche A4 ({t.viewDoc})</button>
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
                                    <div className={`px-5 h-12 border-b flex justify-between items-center bg-slate-50/60 border-slate-100 print:hidden`}>
                                        <h2 className={`text-[13px] font-semibold text-slate-900`}>Fiche de Rendement A4</h2>
                                        <div className="flex gap-1.5">
                                            <button onClick={exportToExcel} className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"><FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" strokeWidth={1.75} /> Excel</button>
                                            <button onClick={() => setShowPdfModal(true)} className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"><FileDown className="w-3.5 h-3.5 text-rose-600" strokeWidth={1.75} /> PDF</button>
                                            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-md bg-slate-900 hover:bg-slate-800 text-white transition-colors"><Printer className="w-3.5 h-3.5" strokeWidth={1.75} /> Imprimer</button>
                                        </div>
                                    </div>

                                    <div className="bg-slate-100 p-8 flex justify-center">
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
                                            isExport={isExport}
                                            sections={pdfSections}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

            {/* Confirm Modal */}
            {confirmDialog.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md sm:max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-full shrink-0 ${
                                    confirmDialog.type === 'danger' ? 'text-red-500 bg-red-100' :
                                    confirmDialog.type === 'success' ? 'text-emerald-500 bg-emerald-100' :
                                    'text-amber-500 bg-amber-100'
                                }`}>
                                    {confirmDialog.type === 'success' ? <Check className="w-6 h-6" /> :
                                     confirmDialog.type === 'danger' ? <Trash2 className="w-6 h-6" /> :
                                     <AlertTriangle className="w-6 h-6" />}
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 mb-2">{confirmDialog.title}</h3>
                                    <p className="text-slate-600 text-sm leading-relaxed">{confirmDialog.message}</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-50 px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-end gap-3 border-t border-slate-100">
                            {!confirmDialog.hideCancel && (
                                <button
                                    onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                                    className="px-4 py-2.5 font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors w-full sm:w-auto"
                                >
                                    Annuler
                                </button>
                            )}
                            <button
                                onClick={confirmDialog.onConfirm}
                                className={`px-4 py-2.5 font-bold text-white rounded-xl transition-colors w-full sm:w-auto ${
                                    confirmDialog.type === 'danger' ? 'bg-red-500 hover:bg-red-600' :
                                    confirmDialog.type === 'success' ? 'bg-emerald-500 hover:bg-emerald-600' :
                                    'bg-amber-500 hover:bg-amber-600'
                                }`}
                            >
                                {confirmDialog.confirmText || 'Confirmer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Thread Calculator Modal */}
            {showThreadCalc && (
                <ThreadCalculator
                    operations={operations}
                    setOperations={setOperations}
                    orderQty={orderQty || ficheData.quantity || 1}
                    colors={ficheData.colors}
                    gridQuantities={ficheData.gridQuantities}
                    modelCategory={ficheData.category}
                    onApply={applyThreadMaterials}
                    onClose={() => setShowThreadCalc(false)}
                />
            )}
        </div>
    );
};
