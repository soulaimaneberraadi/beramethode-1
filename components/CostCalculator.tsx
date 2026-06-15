import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Banknote, Receipt, LayoutTemplate, FileDown, Clock, FileText, PieChart as PieChartIcon, SlidersHorizontal, Scissors, Trash2, Check, AlertTriangle, Factory } from 'lucide-react';
import { Material, AppSettings, PdfSettings, FicheData, PurchasingData } from '../types';
import { translations, fmt } from '../constants';
import { findMagasinItem } from '../lib/magasinMatch';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { ResponsiveChart } from './ui/ResponsiveChart';

import ModelInfo from './ModelInfo';
import MaterialsList from './MaterialsList';
import OrderSimulation from './OrderSimulation';
import OrderTablesPanel from './OrderTablesPanel';
import CostSanityCheck from './CostSanityCheck';
import MaterialAssignment from './MaterialAssignment';
import SettingsPanel from './SettingsPanel';
import PdfSettingsModal from './PdfSettingsModal';
import TicketView from './TicketView';
import A4DocumentView from './A4DocumentView';
import A4ResponsiveFrame from './A4ResponsiveFrame';
import CompactCostSheet from './CompactCostSheet';
import ThreadCalculator from './ThreadCalculator';
import SousTraitanceModal, { SousTraitance } from './SousTraitanceModal';
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
    currentModelId?: string;
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
    setOperations,
    currentModelId
}: CostCalculatorProps) {
    // --- UI State Fixed ---
    const lang = 'fr'; // French is better for exact terms requested by user
    const currency = initialPropsSettings?.currency || 'DH';
    const darkMode = false;
    const [viewMode, setViewMode] = useState<'ticket' | 'a4'>('a4'); // Default to A4 as requested
    const docRefA4 = useRef<HTMLDivElement>(null);
    const docRefTicket = useRef<HTMLDivElement>(null);
    // Dimensions du ticket (mm) — réglables dans le modal d'export.
    const [ticketSize, setTicketSize] = useState<{ width: number; height: number }>({ width: 80, height: 150 });
    // Largeur de référence du design du ticket (TicketView = max-w-[400px]). Le contenu
    // est toujours rendu à cette largeur puis mis à l'échelle pour remplir la taille
    // choisie → l'information reste PROPORTIONNELLE quelle que soit la taille du ticket.
    const TICKET_BASE_W = 400;
    const mmToPxC = (mm: number) => Math.round((mm / 25.4) * 96);
    const ticketContentScale = mmToPxC(ticketSize.width) / TICKET_BASE_W;

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
        // Garde-fou : une quantité à acheter absurde trahit des données de fil
        // obsolètes (consommation calculée pour TOUTE la commande au lieu d'UNE pièce).
        // On bloque la déduction pour ne pas vider le magasin par erreur.
        const abnormal = purchasingData.find(m => m.qtyToBuy > 500000);
        if (abnormal) {
            setConfirmDialog({
                isOpen: true,
                title: "Quantités anormales",
                message: `La quantité à acheter pour « ${abnormal.name} » (${fmt(abnormal.qtyToBuy)} ${abnormal.unit}) est anormalement élevée. Recalculez le fil (Calcul Fil → Appliquer) avant de déduire le stock.`,
                type: 'warning',
                hideCancel: true,
                onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })),
            });
            return;
        }
        setConfirmDialog({
            isOpen: true,
            title: "Confirmer la déduction",
            message: `Déduire du magasin les quantités d'achat de ${purchasingData.length} matière(s), pour un budget de ${fmt(totalPurchasingMatCost)} ${currency} ? Cette action est irréversible.`,
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
                        const magItem = findMagasinItem(mat, magasinData);
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
    const [showMaterialAssign, setShowMaterialAssign] = useState(false);
    const [showSousTraitance, setShowSousTraitance] = useState(false);

    // --- State: Materials ---
    const [materials, setMaterials] = useState<Material[]>(ficheData.materials || []);

    // Sync local materials to FicheData on change
    useEffect(() => {
        setFicheData(prev => ({ ...prev, materials: materials as PurchasingData[] }));
    }, [materials, setFicheData]);

    // --- Calculations ---
    const isExport = ficheData.typeMarche === 'Export';

    // --- Sous-traitance (façon) ---
    // Si active : la main d'œuvre = prix fixe / pièce du sous-traitant (au lieu du
    // temps × coût minute). Le mode 'complet' exclut aussi les matières du coût.
    const st = ficheData.soustraitance;
    const stActive = !!st?.active;
    const stPrix = st?.prix || 0;
    const stComplet = stActive && st?.mode === 'complet';
    // Matières exclues du coût en Export OU en sous-traitance « tout compris ».
    const materialsExcluded = isExport || stComplet;
    // Coût matière MOYEN par pièce, pondéré par les quantités de chaque couleur :
    // une matière affectée à une couleur ne pèse que sur SES pièces. Sans affectation
    // (ou sans grille), c'est la somme simple de toutes les matières (rétro-compatible).
    const totalMaterials = (() => {
        if (materialsExcluded) return 0;
        const simpleSum = materials.reduce((acc, item) => acc + (item.unitPrice * item.qty), 0);
        const cols = ficheData.colors || [];
        const sizeCount = (ficheData.sizes || []).length;
        const gq = ficheData.gridQuantities || {};
        const seen = new Set<string>();
        let totalQ = 0;
        const colQ: { id: string; q: number }[] = [];
        cols.forEach(c => {
            if (seen.has(c.id)) return;
            seen.add(c.id);
            let q = 0;
            for (let s = 0; s < sizeCount; s++) q += Number(gq[`${c.id}_${s}`] || 0);
            colQ.push({ id: c.id, q });
            totalQ += q;
        });
        if (totalQ === 0) return simpleSum;
        let weighted = 0;
        colQ.forEach(({ id, q }) => {
            const matCost = materials.reduce((s, m) => {
                const applies = !m.scope?.colors?.length || m.scope.colors.includes(id);
                return applies ? s + m.unitPrice * m.qty : s;
            }, 0);
            weighted += matCost * q;
        });
        return weighted / totalQ;
    })();
    const cutTime = baseTime * (settings.cutRate / 100);
    const packTime = baseTime * (settings.packRate / 100);
    const totalTime = baseTime + cutTime + packTime;

    const laborCost = stActive ? stPrix : totalTime * settings.costMinute;

    const costPrice = materialsExcluded ? laborCost : totalMaterials + laborCost;
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

    // Coûts PAR COULEUR : une matière affectée à une couleur ne pèse que sur les
    // pièces de cette couleur. Une pièce verte (avec dentelle) coûte donc plus
    // qu'une noire. La main d'œuvre est identique pour toutes les couleurs.
    const colorCosts = useMemo(() => {
        const map: Record<string, { matCost: number; pr: number; ht: number; ttc: number; boutique: number }> = {};
        (ficheData.colors || []).forEach(c => {
            const matCost = materialsExcluded ? 0 : materials.reduce((s, m) => {
                const applies = !m.scope?.colors?.length || m.scope.colors.includes(c.id);
                return applies ? s + (m.unitPrice * m.qty) : s;
            }, 0);
            const pr = materialsExcluded ? laborCost : matCost + laborCost;
            const ht = pr * (1 + settings.marginAtelier / 100);
            const ttc = ht * (1 + settings.tva / 100);
            const boutique = ttc * (1 + settings.marginBoutique / 100);
            map[c.id] = { matCost, pr, ht, ttc, boutique };
        });
        return map;
    }, [ficheData.colors, materials, materialsExcluded, laborCost, settings.marginAtelier, settings.tva, settings.marginBoutique]);

    // Par défaut, la simulation d'achat reflète la quantité réelle de la commande.
    // L'utilisateur peut toujours la modifier pour simuler une autre quantité.
    useEffect(() => {
        if (commandeQty > 0) setOrderQty(commandeQty);
    }, [commandeQty]);

    // Auto-correction des fils obsolètes : d'anciens modèles ont stocké la
    // consommation de fil pour TOUTE la commande (centaines de milliers de mètres)
    // au lieu d'UNE pièce, ce qui faisait exploser les coûts. On ramène ces valeurs
    // manifestement aberrantes à une pièce, une seule fois (idempotent : après
    // correction elles passent sous le seuil et ne sont plus retouchées).
    useEffect(() => {
        const STALE_THRESHOLD = 20000; // m/pièce : aucun vêtement n'en consomme autant
        let changed = false;
        const fixed = materials.map(m => {
            if (m.unit !== 'bobine' || !m.threadMeters || m.threadMeters <= STALE_THRESHOLD) return m;
            const divisor = m.threadColor ? (colorQtyByName[m.threadColor] || 0) : commandeQty;
            if (divisor <= 1) return m; // pas de diviseur fiable (grille pas encore chargée)
            const perPiece = Math.round((m.threadMeters / divisor) * 100) / 100;
            if (perPiece <= 0 || perPiece >= m.threadMeters) return m;
            changed = true;
            const qty = m.threadCapacity > 0 ? Math.round((perPiece / m.threadCapacity) * 100000) / 100000 : m.qty;
            return { ...m, threadMeters: perPiece, qty };
        });
        if (changed) setMaterials(fixed);
    }, [materials, colorQtyByName, commandeQty]);

    // Quantité de la commande à laquelle une matière s'applique, selon son « scope »
    // (couleurs / tailles). Sans scope : un fil suit sa couleur (threadColor), sinon
    // la matière s'applique à TOUTE la commande.
    const scopeOrderQty = (m: Material): number => {
        const sc = m.scope;
        const hasColors = !!(sc?.colors && sc.colors.length);
        const hasSizes = !!(sc?.sizes && sc.sizes.length);
        if (!hasColors && !hasSizes) {
            if (m.threadColor && colorQtyByName[m.threadColor] > 0) return colorQtyByName[m.threadColor];
            return commandeQty;
        }
        const gq = ficheData.gridQuantities || {};
        const colIds = hasColors ? sc!.colors! : (ficheData.colors || []).map(c => c.id);
        const sizeIdx = hasSizes ? sc!.sizes! : (ficheData.sizes || []).map((_, i) => i);
        const seen = new Set<string>();
        let sum = 0;
        colIds.forEach(cid => {
            if (seen.has(cid)) return;
            seen.add(cid);
            sizeIdx.forEach(si => { sum += Number(gq[`${cid}_${si}`] || 0); });
        });
        return sum;
    };

    const purchasingData = materials.map(m => {
        // La matière s'applique à la quantité de son « scope ». Si l'utilisateur simule
        // une autre quantité globale (orderQty ≠ commande), on reste proportionnel.
        const scoped = scopeOrderQty(m);
        const baseQty = commandeQty > 0 ? scoped * (orderQty / commandeQty) : (scoped || orderQty);
        const totalRaw = m.qty * baseQty;
        const totalWithWaste = totalRaw * (1 + wasteRate / 100);
        const qtyToBuy = (m.unit === 'bobine' || m.unit === 'pc') ? Math.ceil(totalWithWaste) : parseFloat(totalWithWaste.toFixed(2));
        const lineCost = materialsExcluded ? 0 : qtyToBuy * m.unitPrice;
        return { ...m, totalRaw, totalWithWaste, qtyToBuy, lineCost };
    });

    const totalPurchasingMatCost = materialsExcluded ? 0 : purchasingData.reduce((acc, item) => acc + item.lineCost, 0);

    const costDataForChart = useMemo(() => {
        const matVal = materialsExcluded ? 0 : totalMaterials;
        return [
            { name: 'Matières', value: matVal, color: '#2149C1' }, // accent blue
            { name: stActive ? 'Façon' : 'Main d\'Œuvre', value: laborCost, color: '#94a3b8' },  // slate-400
            // packaging could be separated later, assuming included in materials for now
        ].filter(d => d.value > 0);
    }, [totalMaterials, laborCost, materialsExcluded, stActive]);

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
                updatedItem.name = mItem.nom || mItem.designation || '';
                updatedItem.unitPrice = Number(mItem.prix) || 0;
                updatedItem.unit = mItem.unite || 'pc';
                updatedItem.fournisseur = mItem.fournisseurNom || mItem.fournisseur || '';
                // Lien fort vers le Magasin : statut stock fiable même si le nom change.
                updatedItem.magasinId = mItem.id != null ? String(mItem.id) : updatedItem.magasinId;
                if (mItem.reference) updatedItem.threadReference = mItem.reference;

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

    // Affecte une matière à des couleurs / tailles précises (listes vides = toutes).
    const setMaterialScope = (id: number, scope: Material['scope']) => {
        setMaterials(prev => prev.map(m => {
            if (m.id !== id) return m;
            const colors = scope?.colors && scope.colors.length ? scope.colors : undefined;
            const sizes = scope?.sizes && scope.sizes.length ? scope.sizes : undefined;
            return { ...m, scope: (colors || sizes) ? { colors, sizes } : undefined };
        }));
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

    // Enregistre la config sous-traitance dans le modèle (hide-only, non destructif).
    const applySousTraitance = (value: SousTraitance) => {
        setFicheData(prev => ({ ...prev, soustraitance: value }));
    };

    // Imprime EXACTEMENT l'aperçu A4 du modal (#pdf-print-area) : mêmes sections
    // et orientation que le PDF. On bascule un flag sur <body> que le CSS @media
    // print utilise pour n'afficher que cet aperçu, puis on nettoie après impression.
    const handlePrintFromModal = () => {
        const cleanup = () => {
            document.body.classList.remove('printing-modal');
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        document.body.classList.add('printing-modal');
        // Laisse le DOM appliquer le flag avant d'ouvrir la boîte d'impression.
        requestAnimationFrame(() => window.print());
    };

    const generatePDF = async (action: 'save' | 'preview' = 'save') => {
        const isTicketPdf = viewMode === 'ticket';
        const element = isTicketPdf ? docRefTicket.current : docRefA4.current;
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
        // Le clone est posé en haut-gauche (0,0) puis caché DERRIÈRE l'app
        // (z-index très négatif). Le placer à -10000px provoquait un rognage
        // du côté gauche par html2canvas (colonne « Composant » disparue).
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.zIndex = '-9999';
        container.style.overflow = 'hidden';
        container.style.pointerEvents = 'none';

        const isLandscape = pdfSettings.orientation === 'landscape';
        // Ticket : on capture à la largeur de référence du design (TICKET_BASE_W) ; jsPDF
        // met ensuite l'image à l'échelle du format mm → rendu proportionnel à la taille.
        const captureW = isTicketPdf ? TICKET_BASE_W : (isLandscape ? 1123 : 794);
        const captureH = isTicketPdf ? Math.round(TICKET_BASE_W * (ticketSize.height / ticketSize.width)) : (isLandscape ? 794 : 1123);

        container.style.width = `${captureW}px`;
        container.style.minHeight = `${captureH}px`;
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
            // Marges physiques en mm (haut, gauche, bas, droite). Ticket : marges fines.
            margin: isTicketPdf ? [3, 3, 3, 3] : [12, 14, 12, 14],
            filename: `${productName.replace(/ /g, "_") || (isTicketPdf ? 'Ticket' : 'Fiche')}_${isTicketPdf ? 'Ticket' : 'Cout'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2 * pdfSettings.scale, // netteté des chiffres / textes
                useCORS: true,
                logging: false,
                x: 0,
                y: 0,
                scrollX: 0,
                scrollY: 0,
                width: captureW,        // largeur de capture verrouillée
                windowWidth: captureW
            },
            // Unité mm. Ticket : format personnalisé [largeur, hauteur]. A4 : format standard.
            jsPDF: isTicketPdf
                ? { unit: 'mm', format: [ticketSize.width, ticketSize.height], orientation: 'portrait' }
                : { unit: 'mm', format: 'a4', orientation: pdfSettings.orientation },
            pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'table', 'thead', 'img'] }
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

    // G\u00E9n\u00E8re un devis (brouillon) dans Facturation, une ligne PAR COULEUR au prix
    // HT de sa couleur. Action confirm\u00E9e et r\u00E9versible (brouillon supprimable).
    const generateDevis = () => {
        const seen = new Set<string>();
        const lignes: { designation: string; quantite: number; prix_unitaire: number; total: number }[] = [];
        (ficheData.colors || []).forEach(c => {
            if (seen.has(c.id)) return;
            seen.add(c.id);
            const q = colorQtyByName[c.name] || 0;
            if (q <= 0) return;
            const pu = Math.round((colorCosts[c.id]?.ht ?? sellPriceHT) * 100) / 100;
            lignes.push({ designation: `${productName || 'Article'} \u2014 ${c.name}`, quantite: q, prix_unitaire: pu, total: Math.round(pu * q * 100) / 100 });
        });
        if (lignes.length === 0) {
            const q = commandeQty || 1;
            const pu = Math.round(sellPriceHT * 100) / 100;
            lignes.push({ designation: productName || 'Article', quantite: q, prix_unitaire: pu, total: Math.round(pu * q * 100) / 100 });
        }
        const total_ht = Math.round(lignes.reduce((a, l) => a + l.total, 0) * 100) / 100;
        const taux_tva = settings.tva || 0;
        const total_tva = Math.round(total_ht * taux_tva / 100 * 100) / 100;
        const total_ttc = Math.round((total_ht + total_tva) * 100) / 100;

        setConfirmDialog({
            isOpen: true,
            title: "G\u00E9n\u00E9rer un devis",
            message: `Cr\u00E9er un devis (brouillon) pour \u00AB ${ficheData.client || 'Client'} \u00BB : ${lignes.length} ligne(s) par couleur, total ${fmt(total_ht)} ${currency} HT / ${fmt(total_ttc)} TTC ? Vous pourrez le modifier dans Facturation.`,
            type: 'success',
            confirmText: "Cr\u00E9er le devis",
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                try {
                    const numero = `DEVIS-${new Date().toISOString().slice(0, 10)}-${Math.floor(Math.random() * 9000 + 1000)}`;
                    const payload = {
                        numero, type: 'DEVIS',
                        tiers_nom: ficheData.client || 'Client',
                        date_facture: new Date().toISOString().slice(0, 10),
                        total_ht, taux_tva, total_tva, total_ttc, montant_paye: 0,
                        statut: 'BROUILLON',
                        notes: `G\u00E9n\u00E9r\u00E9 depuis la Fiche de Co\u00FBt \u2014 ${productName}`,
                        lignes,
                    };
                    const res = await fetch('/api/facturation/factures', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                        body: JSON.stringify(payload),
                    });
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    setConfirmDialog({
                        isOpen: true, title: "Devis cr\u00E9\u00E9",
                        message: `Le devis ${numero} a \u00E9t\u00E9 cr\u00E9\u00E9 (brouillon). Ouvrez \u00AB Facturation \u00BB pour le voir, le modifier ou l'envoyer.`,
                        type: 'success', hideCancel: true,
                        onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })),
                    });
                } catch (e) {
                    console.error(e);
                    setConfirmDialog({
                        isOpen: true, title: "Erreur",
                        message: "\u00C9chec de la cr\u00E9ation du devis. V\u00E9rifiez que le serveur est d\u00E9marr\u00E9.",
                        type: 'danger', hideCancel: true,
                        onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })),
                    });
                }
            },
        });
    };

    // Export Excel (.xlsx) structur\u00E9 et stylis\u00E9 \u2014 m\u00EAme identit\u00E9 visuelle que le
    // SaaS UI (bleu nuit #0F172A, gris #F1F5F9). Remplace l'ancien CSV brut.
    const exportToExcel = async () => {
        try {
            const ExcelJS = (await import('exceljs')).default;

            // --- Palette (identique au th\u00E8me web) ---
            const NAVY = 'FF0F172A';      // bleu nuit (header principal / totaux)
            const GREY = 'FFF1F5F9';      // gris clair (rang\u00E9es d'en-t\u00EAte de table)
            const BORDER = 'FFCBD5E1';    // slate-300 pour les bordures
            const thin = { style: 'thin' as const, color: { argb: BORDER } };
            const allBorders = { top: thin, bottom: thin, left: thin, right: thin };

            const wb = new ExcelJS.Workbook();
            wb.creator = 'BERAMETHODE';
            wb.created = new Date();
            const ws = wb.addWorksheet(t.docTitle || 'Fiche de Co\u00FBt', {
                pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
                views: [{ showGridLines: false }],
            });

            // 5 colonnes : Mati\u00E8re | Fournisseur | Prix U. | Qt\u00E9 | Montant
            ws.columns = [
                { width: 32 }, { width: 20 }, { width: 12 }, { width: 16 }, { width: 16 },
            ];

            // --- Bandeau titre (merge A1:E1, fond navy, texte blanc) ---
            ws.mergeCells('A1:E1');
            const title = ws.getCell('A1');
            title.value = `${companyName || 'BERAMETHODE SARL'}  \u2014  ${t.docTitle || 'FICHE DE CO\u00DBT'}`;
            title.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
            title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
            title.alignment = { vertical: 'middle', horizontal: 'center' };
            ws.getRow(1).height = 34;

            // --- M\u00E9ta : d\u00E9signation / date / r\u00E9f ---
            ws.mergeCells('A2:C2');
            ws.getCell('A2').value = `${t.modelName || 'Mod\u00E8le'}: ${productName || '-'}`;
            ws.getCell('A2').font = { bold: true, size: 11 };
            ws.getCell('D2').value = `${t.date || 'Date'}: ${displayDate}`;
            ws.getCell('E2').value = `R\u00E9f: ${docRef || '-'}`;
            ws.getRow(2).height = 18;

            const styleHeaderRow = (row: any) => {
                row.eachCell((cell: any) => {
                    cell.font = { bold: true, size: 10, color: { argb: NAVY } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
                    cell.alignment = { vertical: 'middle' };
                    cell.border = allBorders;
                });
                row.height = 20;
            };
            const styleDataRow = (row: any) => {
                row.eachCell((cell: any) => { cell.border = allBorders; cell.alignment = { vertical: 'middle' }; });
            };

            // --- Section NOMENCLATURE ---
            ws.addRow([]);
            const nomTitleRow = ws.addRow([t.matName ? 'NOMENCLATURE' : 'NOMENCLATURE']);
            ws.mergeCells(`A${nomTitleRow.number}:E${nomTitleRow.number}`);
            nomTitleRow.getCell(1).font = { bold: true, size: 11, color: { argb: NAVY } };

            const nomHeader = ws.addRow([t.matName || 'Mati\u00E8re', 'Fournisseur', t.price || 'Prix U.', t.qtyUnit || 'Qt\u00E9', t.total || 'Montant']);
            styleHeaderRow(nomHeader);
            materials.forEach(m => {
                const r = ws.addRow([m.name || '-', m.fournisseur || '', m.unitPrice, `${fmt(m.qty)} ${m.unit}`, Math.round(m.unitPrice * m.qty * 100) / 100]);
                r.getCell(3).numFmt = '0.00';
                r.getCell(5).numFmt = '0.00';
                styleDataRow(r);
            });
            // Main d'\u0153uvre
            const moRow = ws.addRow([stActive ? 'Fa\u00E7on (sous-traitance)' : `Main d'\u0152uvre`, '', '', '', Math.round(laborCost * 100) / 100]);
            moRow.getCell(5).numFmt = '0.00';
            styleDataRow(moRow);
            // Total mati\u00E8re
            const totMatRow = ws.addRow([`${t.totalMat || 'Total Mati\u00E8re'}`, '', '', '', Math.round(totalMaterials * 100) / 100]);
            ws.mergeCells(`A${totMatRow.number}:D${totMatRow.number}`);
            totMatRow.getCell(1).font = { bold: true };
            totMatRow.getCell(5).font = { bold: true };
            totMatRow.getCell(5).numFmt = '0.00';
            styleDataRow(totMatRow);

            // --- Section PRIX (bloc r\u00E9capitulatif) ---
            ws.addRow([]);
            const prixRows: [string, number][] = [
                [t.costPrice || 'Prix de Revient', costPrice],
                [`${t.sellHT || 'Prix Vente HT'} (+${settings.marginAtelier}%)`, sellPriceHT],
                [`${t.sellTTC || 'Prix Vente TTC'} (+${settings.tva}%)`, sellPriceTTC],
                [t.shopPrice || 'Prix Boutique', boutiquePrice],
            ];
            prixRows.forEach(([label, val], idx) => {
                const r = ws.addRow([label, '', '', '', Math.round(val * 100) / 100]);
                ws.mergeCells(`A${r.number}:D${r.number}`);
                r.getCell(5).numFmt = `0.00 "${currency}"`;
                if (idx === 0) {
                    // Co\u00FBt de Revient = bandeau navy
                    r.eachCell((cell: any) => {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
                        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                    });
                } else {
                    r.getCell(1).font = { bold: idx === 2 };
                    r.getCell(5).font = { bold: idx === 2 };
                }
                styleDataRow(r);
            });

            // --- Section PR\u00C9VISIONS ACHAT ---
            if (orderQty > 0 && purchasingData.length > 0) {
                ws.addRow([]);
                const achTitle = ws.addRow([`${t.orderNeedsTitle || 'Pr\u00E9visions Achat'} (${t.orderQty || 'Qt\u00E9'}: ${orderQty} \u2014 D\u00E9chet: ${wasteRate}%)`]);
                ws.mergeCells(`A${achTitle.number}:E${achTitle.number}`);
                achTitle.getCell(1).font = { bold: true, size: 11, color: { argb: NAVY } };

                const achHeader = ws.addRow([t.matName || 'Mati\u00E8re', 'Fournisseur', t.price || 'Prix U.', t.qtyToBuy || 'Qt\u00E9 \u00E0 Acheter', t.totalLine || 'Total Ligne']);
                styleHeaderRow(achHeader);
                purchasingData.forEach(p => {
                    const r = ws.addRow([p.name || '-', p.fournisseur || '', p.unitPrice, `${fmt(p.qtyToBuy)} ${p.unit}`, Math.round(p.lineCost * 100) / 100]);
                    r.getCell(3).numFmt = '0.00';
                    r.getCell(5).numFmt = '0.00';
                    styleDataRow(r);
                });
                const budgetRow = ws.addRow([`${t.realBudget || 'Budget'}`, '', '', '', Math.round(totalPurchasingMatCost * 100) / 100]);
                ws.mergeCells(`A${budgetRow.number}:D${budgetRow.number}`);
                budgetRow.eachCell((cell: any) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
                    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                });
                budgetRow.getCell(5).numFmt = `0.00 "${currency}"`;
                styleDataRow(budgetRow);
            }

            // --- T\u00E9l\u00E9chargement ---
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${productName.replace(/ /g, '_') || 'Fiche'}_Cout.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Excel export error:', e);
            alert("Erreur lors de la g\u00E9n\u00E9ration du fichier Excel.");
        }
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

            {/* Règles d'impression A4 — isole STRICTEMENT la Fiche de Coût : tout le shell
                de l'application (navbar, stepper, panneaux, boutons) est masqué. */}
            <style>{`
                @media print {
                    @page { size: A4 portrait; margin: 12mm 14mm; }
                    html, body { background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    /* 1. Tout devient invisible par défaut */
                    body * { visibility: hidden !important; }
                    /* 2. Seule la fiche (et ses descendants) redevient visible */
                    .fiche-a4-doc, .fiche-a4-doc * { visibility: visible !important; }
                    .compact-cost-sheet, .compact-cost-sheet * { visibility: visible !important; }
                    /* 3. La fiche occupe seule la page, callée en haut à gauche */
                    .fiche-a4-doc {
                        position: absolute !important; left: 0 !important; top: 0 !important;
                        box-shadow: none !important; max-width: 100% !important; width: 100% !important;
                        margin: 0 !important; padding: 0 !important;
                    }
                    .compact-cost-sheet {
                        position: absolute !important; left: 0 !important; top: 0 !important;
                        box-shadow: none !important; max-width: 100% !important; width: 100% !important;
                        margin: 0 !important; padding: 0 !important;
                    }
                    .fiche-a4-doc table, .fiche-a4-doc tr, .fiche-a4-doc thead, .fiche-a4-doc tbody { break-inside: avoid !important; page-break-inside: avoid !important; }
                    .compact-cost-sheet table, .compact-cost-sheet tr, .compact-cost-sheet thead, .compact-cost-sheet tbody { break-inside: avoid !important; page-break-inside: avoid !important; }
                    .fiche-a4-doc img { max-width: 100% !important; max-height: 60mm !important; object-fit: contain !important; }
                    .compact-cost-sheet img { max-width: 100% !important; max-height: 40mm !important; object-fit: contain !important; }

                    /* Impression depuis le modal : on isole STRICTEMENT l'aperçu #pdf-print-area
                       (le sélecteur #id l'emporte sur la règle .fiche-a4-doc de la page). */
                    body.printing-modal .fiche-a4-doc { visibility: hidden !important; }
                    body.printing-modal .compact-cost-sheet { visibility: hidden !important; }
                    body.printing-modal #pdf-print-area,
                    body.printing-modal #pdf-print-area * { visibility: visible !important; }
                    body.printing-modal #pdf-print-area {
                        position: fixed !important; left: 0 !important; top: 0 !important;
                        transform: none !important; width: 100% !important; height: auto !important;
                        overflow: visible !important; box-shadow: none !important;
                    }
                    body.printing-modal #pdf-print-area .fiche-a4-doc {
                        visibility: visible !important; position: static !important; max-width: 100% !important; width: 100% !important;
                    }
                    body.printing-modal #pdf-print-area .compact-cost-sheet {
                        visibility: visible !important; position: static !important; max-width: 100% !important; width: 100% !important;
                    }
                }
            `}</style>

            <PdfSettingsModal
                t={t} darkMode={darkMode} showPdfModal={showPdfModal} setShowPdfModal={setShowPdfModal}
                isGeneratingPdf={isGeneratingPdf} isLibLoaded={isLibLoaded}
                pdfSettings={pdfSettings} setPdfSettings={setPdfSettings}
                generatePDF={generatePDF}
                onPrint={handlePrintFromModal}
                onExcel={exportToExcel}
                pdfSections={pdfSections} setPdfSections={setPdfSections}
                mode={viewMode} ticketSize={ticketSize} setTicketSize={setTicketSize}
            >
                {viewMode === 'ticket' ? (
                    // Aperçu : on met le contenu (largeur de référence) à l'échelle pour
                    // remplir la largeur du ticket → information proportionnelle à la taille.
                    <div style={{ width: TICKET_BASE_W, transformOrigin: 'top left', transform: `scale(${ticketContentScale})` }}>
                        {/* Cible de capture PDF : contenu non transformé, largeur de référence. */}
                        <div ref={docRefTicket} style={{ width: TICKET_BASE_W }} className="bg-white">
                            <TicketView
                                t={t} currency={currency} darkMode={false}
                                productName={productName} displayDate={displayDate}
                                totalMaterials={totalMaterials} totalTime={totalTime}
                                laborCost={laborCost} costPrice={costPrice}
                                settings={settings} productImage={productImage}
                                textPrimary={'text-slate-800'} textSecondary={'text-slate-500'}
                                materials={materials} cutTime={cutTime} packTime={packTime}
                                sellPriceHT={sellPriceHT} sellPriceTTC={sellPriceTTC}
                                boutiquePrice={boutiquePrice}
                                soustraitanceActive={stActive} materialsHidden={stComplet}
                            />
                        </div>
                    </div>
                ) : (
                    // A4 = design « Fiche Compacte » (facture) — choix utilisateur.
                    <CompactCostSheet
                        ref={null}
                        t={t} currency={currency}
                        productName={productName} displayDate={displayDate}
                        docRef={docRef}
                        companyName={companyName}
                        companyAddress={companyAddress}
                        baseTime={baseTime} cutTime={cutTime} packTime={packTime}
                        totalTime={totalTime} settings={settings}
                        materials={materials} laborCost={laborCost}
                        costPrice={costPrice} sellPriceHT={sellPriceHT}
                        sellPriceTTC={sellPriceTTC} boutiquePrice={boutiquePrice}
                        orderQty={orderQty} wasteRate={wasteRate}
                        purchasingData={purchasingData}
                        totalPurchasingMatCost={totalPurchasingMatCost}
                        productImage={productImage}
                        soustraitanceActive={stActive}
                        stPrix={stPrix} stMode={st?.mode}
                        colors={ficheData.colors || []} gridQuantities={ficheData.gridQuantities || {}} sizes={ficheData.sizes || []}
                    />
                )}
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
                        <CostSanityCheck
                            currency={currency} isExport={materialsExcluded}
                            materials={materials} totalMaterials={totalMaterials}
                            laborCost={laborCost} costPrice={costPrice}
                            purchasingData={purchasingData} totalPurchasingMatCost={totalPurchasingMatCost}
                            commandeQty={commandeQty} ficheData={ficheData} settings={settings}
                        />

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
                            soustraitanceActive={stActive} faconPrix={stPrix} faconMode={st?.mode}
                            laborCost={laborCost}
                        />

                        {/* Barre outils : Sous-traitance + Calcul Fil */}
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowSousTraitance(true)}
                                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[12px] font-medium transition-colors ${stActive ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'}`}
                                title="Confier ce modèle à un sous-traitant à prix fixe / pièce"
                            >
                                <Factory className="w-3.5 h-3.5" strokeWidth={1.75} />
                                Sous-traitance
                                {stActive && (
                                    <span className="bg-white/20 px-1.5 py-0.5 rounded text-[11px] font-medium">
                                        {st?.mode === 'complet' ? 'Tout compris' : 'Façon'}
                                    </span>
                                )}
                            </button>
                            {!stComplet && (
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
                            )}
                        </div>

                        {/* Matières premières — masquées en sous-traitance « tout compris »
                            (données conservées, réaffichées si on désactive). */}
                        {!stComplet && (
                            <>
                                <MaterialsList
                                    t={t} currency={currency} darkMode={darkMode}
                                    materials={materials} addMaterial={addMaterial}
                                    updateMaterial={updateMaterial} deleteMaterial={deleteMaterial}
                                    bgCard={bgCard} bgCardHeader={bgCardHeader}
                                    textPrimary={textPrimary} textSecondary={textSecondary}
                                    tableHeader={tableHeader} tableRowHover={tableRowHover}
                                    totalMaterials={totalMaterials}
                                    ficheData={ficheData} setMaterialScope={setMaterialScope}
                                />

                                {/* Affectation Matières — au-dessus du détail des achats */}
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => setShowMaterialAssign(true)}
                                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[12px] font-medium transition-colors"
                                        title="Affecter les matières à des couleurs / tailles précises"
                                    >
                                        <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.75} />
                                        Affectation Matières
                                    </button>
                                </div>
                            </>
                        )}

                        <OrderSimulation
                            t={t} currency={currency} darkMode={darkMode}
                            orderQty={orderQty} setOrderQty={setOrderQty}
                            deductStock={deductStock}
                            wasteRate={wasteRate} setWasteRate={setWasteRate}
                            purchasingData={purchasingData}
                            totalPurchasingMatCost={totalPurchasingMatCost}
                            laborCost={laborCost}
                            textSecondary={textSecondary} textPrimary={textPrimary} bgCard={bgCard}
                            isExport={materialsExcluded}
                            materials={materials}
                            ficheData={ficheData}
                            modelId={currentModelId}
                            modelName={productName}
                            onStockConfirmed={() => { /* statut recalculé via magasinData */ }}
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

                        {/* Tables (grille couleurs×tailles + sellem des prix) — placées en
                            bas, sous « Analyse & Simulation » (demande utilisateur). */}
                        <OrderTablesPanel
                            ficheData={ficheData} setFicheData={setFicheData}
                            currency={currency} settings={settings}
                            laborCost={laborCost} costPrice={costPrice}
                            sellPriceHT={sellPriceHT} sellPriceTTC={sellPriceTTC}
                            boutiquePrice={boutiquePrice}
                            totalPurchasingMatCost={totalPurchasingMatCost}
                            colorCosts={colorCosts}
                            isExport={materialsExcluded}
                        />
                    </div>

                    <div className="w-full">
                        <div className={`rounded-lg border overflow-hidden flex flex-col bg-white border-slate-200`}>
                            <div className={`p-1.5 border-b flex gap-1 bg-slate-50/60 border-slate-100 print:hidden`}>
                                <button onClick={() => setViewMode('ticket')} className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-all ${viewMode === 'ticket' ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : `text-slate-500 hover:text-slate-700`}`}><Receipt className="w-3.5 h-3.5" strokeWidth={1.75} /> {t.viewTicket}</button>
                                <button onClick={() => setViewMode('a4')} className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-all ${viewMode === 'a4' ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : `text-slate-500 hover:text-slate-700`}`}><FileText className="w-3.5 h-3.5" strokeWidth={1.75} /> Export Fiche A4 ({t.viewDoc})</button>
                            </div>

                            {viewMode === 'ticket' && (
                                <>
                                    <div className={`px-5 h-12 border-b flex justify-between items-center bg-slate-50/60 border-slate-100 print:hidden`}>
                                        <h2 className={`text-[13px] font-semibold text-slate-900`}>Ticket de Coût</h2>
                                        <div className="flex gap-1.5">
                                            <button onClick={() => setShowPdfModal(true)} className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-md bg-slate-900 hover:bg-slate-800 text-white transition-colors" title="Exporter (PDF) ou imprimer le ticket"><FileDown className="w-3.5 h-3.5" strokeWidth={1.75} /> Exporter / Imprimer</button>
                                        </div>
                                    </div>
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
                                        soustraitanceActive={stActive} materialsHidden={stComplet}
                                    />
                                </>
                            )}

                            {viewMode === 'a4' && (
                                <>
                                    <div className={`px-5 h-12 border-b flex justify-between items-center bg-slate-50/60 border-slate-100 print:hidden`}>
                                        <h2 className={`text-[13px] font-semibold text-slate-900`}>Fiche de Coût A4</h2>
                                        <div className="flex gap-1.5">
                                            <button onClick={() => setShowPdfModal(true)} className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-md bg-slate-900 hover:bg-slate-800 text-white transition-colors" title="Exporter (PDF / Excel) ou imprimer la fiche"><FileDown className="w-3.5 h-3.5" strokeWidth={1.75} /> Exporter / Imprimer</button>
                                        </div>
                                    </div>

                                    <div className="bg-slate-100 p-3 sm:p-8 overflow-hidden">
                                      <A4ResponsiveFrame>
                                        {/* A4 = design « Fiche Compacte » (facture) — choix utilisateur. */}
                                        <CompactCostSheet
                                            ref={docRefA4}
                                            t={t} currency={currency}
                                            productName={productName || 'Article...'} displayDate={displayDate}
                                            docRef={docRef}
                                            companyName={companyName}
                                            companyAddress={companyAddress}
                                            baseTime={baseTime} cutTime={cutTime} packTime={packTime}
                                            totalTime={totalTime} settings={settings}
                                            materials={materials} laborCost={laborCost}
                                            costPrice={costPrice} sellPriceHT={sellPriceHT}
                                            sellPriceTTC={sellPriceTTC} boutiquePrice={boutiquePrice}
                                            orderQty={orderQty} wasteRate={wasteRate}
                                            purchasingData={purchasingData}
                                            totalPurchasingMatCost={totalPurchasingMatCost}
                                            productImage={productImage}
                                            soustraitanceActive={stActive}
                                            stPrix={stPrix} stMode={st?.mode}
                                            colors={ficheData.colors || []} gridQuantities={ficheData.gridQuantities || {}} sizes={ficheData.sizes || []}
                                        />
                                      </A4ResponsiveFrame>
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

            {/* Material Assignment Modal */}
            {showMaterialAssign && (
                <MaterialAssignment
                    materials={materials}
                    setMaterialScope={setMaterialScope}
                    ficheData={ficheData}
                    currency={currency}
                    onClose={() => setShowMaterialAssign(false)}
                />
            )}

            {/* Sous-traitance Modal */}
            {showSousTraitance && (
                <SousTraitanceModal
                    currency={currency}
                    value={ficheData.soustraitance}
                    onApply={applySousTraitance}
                    onClose={() => setShowSousTraitance(false)}
                />
            )}
        </div>
    );
};
