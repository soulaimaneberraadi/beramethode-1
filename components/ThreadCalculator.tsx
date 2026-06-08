import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Check, X, Calculator, Package, ChevronDown, ChevronUp, Maximize2, ArrowLeft, Printer, Plus, Copy, Pencil, Trash2 } from 'lucide-react';
import { Operation, Material } from '../types';
import { STITCH_TYPES, MACHINE_THREAD_CONFIG, BOBBIN_SIZES, type StitchType } from '../data/threadConsumption';
import { suggestClasseFromFamilyInput } from '../lib/machineCategoryClasseLink';

interface ThreadCalculatorProps {
    operations: Operation[];
    setOperations?: React.Dispatch<React.SetStateAction<Operation[]>>;
    orderQty: number;
    colors?: { id: string; name: string }[];
    gridQuantities?: Record<string, number>;
    onApply: (threadMaterials: Material[]) => void;
    onClose: () => void;
}

interface OperationThreadData {
    operation: Operation;
    selected: boolean;
    machineCode: string;
    machineRaw: string;
    machineLabel: string;
    stitchType: StitchType | null;
    /** true = consommation par pièce (boutonnière, bouton, bride) ; false = par mètre de couture */
    isPerPiece: boolean;
    /** Valeur saisie : longueur en cm (par mètre) OU nombre de pièces (par pièce) */
    lengthCm: number;
    consumptionFactor: number;
    threadMetersPerUnit: number;
    /** Libellé libre du type de fil utilisé (ex: "Polyester Tex 27", "Coton NM 50"). Sert à distinguer les modèles qui utilisent plusieurs types de fil. */
    threadType: string;
    /**
     * Matrice couleur × opération : pour chaque couleur de la commande, indique si la
     * couleur est utilisée dans cette opération (active) et quel type de fil lui est
     * associé (threadType vide = hérite du threadType global de l'opération).
     * Couvre les 3 cas : fil par opération (même type pour toutes les couleurs),
     * fil par couleur (type différent par colonne), fil sur certaines couleurs (active=false).
     */
    colorThreads: Record<string, { active: boolean; threadType: string }>;
}

/**
 * Types de points dont la consommation est exprimée PAR PIÈCE (et non par mètre) :
 * boutonnières, boutons et brides. Pour ceux-ci, la valeur saisie est un NOMBRE
 * de pièces, et fil = nombre × facteur (pas de division par 100).
 */
const PER_PIECE_STITCH_CODES = new Set<string>([
    'BOUTONNIERE_2F',
    'BOUTONNIERE_4F',
    'BOUTONNIERE_LINGERIE_N',
    'BOUTONNIERE_LINGERIE_C',
    'BOUTONNIERE_CEILLET',
    'BRIDE_NOUE',
]);

function computeThreadPerUnit(value: number, factor: number, isPerPiece: boolean): number {
    // par pièce : value = nb de pièces ; par mètre : value = longueur en cm → m
    return isPerPiece ? value * factor : (value / 100) * factor;
}

function formatNumberFr(num: number, minimumFractionDigits = 0, maximumFractionDigits = 2): string {
    if (num === undefined || num === null || isNaN(num)) return '0';
    return num.toLocaleString('fr-FR', { minimumFractionDigits, maximumFractionDigits })
              .replace(/[\u202f\u00a0]/g, ' ');
}

export default function ThreadCalculator({
    operations,
    setOperations,
    orderQty,
    colors = [],
    gridQuantities = {},
    onApply,
    onClose
}: ThreadCalculatorProps) {
    const [wastePercent, setWastePercent] = useState(10);
    const [selectedBobbinSize, setSelectedBobbinSize] = useState(5000);
    const [isExpanded, setIsExpanded] = useState(false);
    const [availableThreadTypes, setAvailableThreadTypes] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('beramethode_thread_types');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const saveThreadTypes = (list: string[]) => {
        try { localStorage.setItem('beramethode_thread_types', JSON.stringify(list)); } catch { /* noop */ }
    };

    // Ajoute un type de fil à la liste (ignoré si vide ou déjà présent).
    const addThreadTypeValue = (value: string) => {
        const v = value.trim();
        if (!v || availableThreadTypes.includes(v)) return;
        const next = [...availableThreadTypes, v];
        setAvailableThreadTypes(next);
        saveThreadTypes(next);
    };

    // Renomme un type de fil ET met à jour toutes les références dans les opérations.
    const renameThreadTypeValue = (oldValue: string, newValue: string) => {
        const v = newValue.trim();
        if (!v || v === oldValue) return;
        const next = Array.from(new Set(availableThreadTypes.map(t => (t === oldValue ? v : t))));
        setAvailableThreadTypes(next);
        saveThreadTypes(next);
        setOpsData(prev => prev.map(item => {
            const colorThreads = { ...item.colorThreads };
            Object.keys(colorThreads).forEach(cid => {
                if (colorThreads[cid].threadType === oldValue) colorThreads[cid] = { ...colorThreads[cid], threadType: v };
            });
            return {
                ...item,
                threadType: item.threadType === oldValue ? v : item.threadType,
                colorThreads,
            };
        }));
    };

    // Supprime un type de fil ET vide toutes les références qui l'utilisaient.
    const deleteThreadTypeValue = (value: string) => {
        const next = availableThreadTypes.filter(t => t !== value);
        setAvailableThreadTypes(next);
        saveThreadTypes(next);
        setOpsData(prev => prev.map(item => {
            const colorThreads = { ...item.colorThreads };
            Object.keys(colorThreads).forEach(cid => {
                if (colorThreads[cid].threadType === value) colorThreads[cid] = { ...colorThreads[cid], threadType: '' };
            });
            return {
                ...item,
                threadType: item.threadType === value ? '' : item.threadType,
                colorThreads,
            };
        }));
    };

    // Couleurs effectives de la commande, dédupliquées par id (corrige le doublon
    // « Vert Émeraude » qui apparaissait deux fois dans le détail couleur).
    const effectiveColors = useMemo(() => {
        const seen = new Set<string>();
        return colors.filter(c => {
            if (!c || !c.id || seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
        });
    }, [colors]);

    // Quantité par couleur (somme de la grille couleurs × tailles) — clé `${colorId}_${sizeIndex}`.
    const colorQtyMap = useMemo<Record<string, number>>(() => {
        const map: Record<string, number> = {};
        effectiveColors.forEach(color => {
            map[color.id] = Object.entries(gridQuantities)
                .filter(([key]) => key.startsWith(`${color.id}_`))
                .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
        });
        return map;
    }, [effectiveColors, gridQuantities]);

    // Map operations to thread data
    const operationsData = useMemo<OperationThreadData[]>(() => {
        const initColorThreads = (): Record<string, { active: boolean; threadType: string }> => {
            const ct: Record<string, { active: boolean; threadType: string }> = {};
            effectiveColors.forEach(c => { ct[c.id] = { active: true, threadType: '' }; });
            return ct;
        };
        return operations.map(op => {
            const machineName = op.machineName || op.machineId || '';
            const machineCode = extractCodeFromClass(machineName) || suggestClasseFromFamilyInput(machineName) || '';
            const stitchType = findStitchTypeByMachineCode(machineCode);
            const isPerPiece = !!stitchType && PER_PIECE_STITCH_CODES.has(stitchType.code);
            const lengthCm = op.length || 0;
            const consumptionFactor = stitchType?.consumptionFactor || 0;
            const threadMetersPerUnit = computeThreadPerUnit(lengthCm, consumptionFactor, isPerPiece);

            // Get full machine label from MACHINE_THREAD_CONFIG
            const machineConfig = MACHINE_THREAD_CONFIG.find(m => m.machineCode === machineCode);
            const machineLabel = machineConfig?.machineName || machineConfig?.machineNameAr || machineName || `Machine ${machineCode}`;

            return {
                operation: op,
                selected: threadMetersPerUnit > 0,
                machineCode,
                machineRaw: machineName,
                machineLabel,
                stitchType,
                isPerPiece,
                lengthCm,
                consumptionFactor,
                threadMetersPerUnit,
                threadType: '',
                colorThreads: initColorThreads(),
            };
        });
    }, [operations, effectiveColors]);

    const [opsData, setOpsData] = useState<OperationThreadData[]>(operationsData);

    // Update when operations change
    React.useEffect(() => {
        setOpsData(operationsData);
    }, [operationsData]);

    const toggleOperation = (index: number) => {
        setOpsData(prev => prev.map((item, i) =>
            i === index ? { ...item, selected: !item.selected } : item
        ));
    };

    const selectAll = () => {
        setOpsData(prev => prev.map(item => ({
            ...item,
            selected: item.threadMetersPerUnit > 0,
        })));
    };

    const deselectAll = () => {
        setOpsData(prev => prev.map(item => ({ ...item, selected: false })));
    };

    // Escape key handler
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Prevent background body scroll when modal/page is open
    React.useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    // Edit seam length (cm) directly in the table, like the Gamme
    const updateLength = (index: number, cm: number) => {
        const lengthCm = Math.max(0, Math.floor(cm) || 0);
        setOpsData(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const threadMetersPerUnit = computeThreadPerUnit(lengthCm, item.consumptionFactor, item.isPerPiece);
            return {
                ...item,
                lengthCm,
                threadMetersPerUnit,
                // Auto-select once a usable value is entered
                selected: threadMetersPerUnit > 0 ? true : item.selected,
            };
        }));

        // Sync back to the Gamme: op.length is the same field as the "L/QTÉ" column
        if (setOperations) {
            const opId = opsData[index]?.operation.id;
            if (opId) {
                setOperations(prev => prev.map(o =>
                    o.id === opId ? { ...o, length: lengthCm } : o
                ));
            }
        }
    };

    // Edit bobine count directly: threadMetersPerUnit = bobines × selectedBobbinSize
    const updateBobines = (index: number, bobines: number) => {
        const b = Math.max(0, bobines || 0);
        setOpsData(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const threadMetersPerUnit = b * selectedBobbinSize;
            return {
                ...item,
                threadMetersPerUnit,
                selected: threadMetersPerUnit > 0 ? true : item.selected,
            };
        }));
    };

    // Edit type of thread (libre) used for this operation
    const updateThreadType = (index: number, value: string) => {
        setOpsData(prev => prev.map((item, i) =>
            i === index ? { ...item, threadType: value } : item
        ));
    };

    // --- Matrice couleur × opération ---

    // Active/désactive une couleur pour une opération donnée (cellule de la matrice).
    const toggleColorActive = (index: number, colorId: string) => {
        setOpsData(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const cur = item.colorThreads[colorId] || { active: true, threadType: '' };
            return { ...item, colorThreads: { ...item.colorThreads, [colorId]: { ...cur, active: !cur.active } } };
        }));
    };

    // Définit le type de fil d'une couleur pour une opération donnée.
    const setColorThreadType = (index: number, colorId: string, threadType: string) => {
        setOpsData(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const cur = item.colorThreads[colorId] || { active: true, threadType: '' };
            return { ...item, colorThreads: { ...item.colorThreads, [colorId]: { ...cur, threadType } } };
        }));
    };

    // Applique le type de fil d'une couleur (depuis l'opération `index`) à TOUTES les opérations.
    const applyColorThreadToAllOps = (index: number, colorId: string) => {
        setOpsData(prev => {
            const source = prev[index]?.colorThreads[colorId];
            if (!source) return prev;
            return prev.map(item => ({
                ...item,
                colorThreads: { ...item.colorThreads, [colorId]: { ...source } },
            }));
        });
    };

    // Quantité réelle de la commande : somme de la grille (couleurs × tailles) si elle
    // existe, sinon orderQty. Calculée comme le détail couleur pour rester cohérent.
    const effectiveQty = useMemo(() => {
        const gridTotal = Object.values(colorQtyMap).reduce((sum, v) => sum + (Number(v) || 0), 0);
        return gridTotal > 0 ? gridTotal : (orderQty || 1);
    }, [colorQtyMap, orderQty]);

    // Calculate totals per machine type
    const machineSummary = useMemo(() => {
        const selected = opsData.filter(op => op.selected && op.threadMetersPerUnit > 0);
        const byMachine: Record<string, {
            machineCode: string;
            machineLabel: string;
            threadCount: number;
            threadMetersPerUnit: number;
            totalMeters: number;
            totalBobbins: number;
            operations: string[];
        }> = {};

        selected.forEach(op => {
            const key = op.machineCode || 'UNKNOWN';
            if (!byMachine[key]) {
                byMachine[key] = {
                    machineCode: op.machineCode,
                    machineLabel: op.machineLabel,
                    threadCount: op.stitchType?.threadCount || 1,
                    threadMetersPerUnit: 0,
                    totalMeters: 0,
                    totalBobbins: 0,
                    operations: [],
                };
            }
            byMachine[key].threadMetersPerUnit += op.threadMetersPerUnit;
            byMachine[key].totalMeters += Math.round(op.threadMetersPerUnit * effectiveQty * 100) / 100;
            byMachine[key].operations.push(`Op ${op.operation.order}: ${op.operation.description || op.machineLabel}`);
        });

        // Calculate bobbins
        Object.values(byMachine).forEach(machine => {
            const withWaste = machine.totalMeters * (1 + wastePercent / 100);
            machine.totalBobbins = Math.ceil(withWaste / selectedBobbinSize);
        });

        return Object.values(byMachine);
    }, [opsData, effectiveQty, wastePercent, selectedBobbinSize]);

    // Détail par (couleur + type de fil) : agrège la consommation en respectant la
    // matrice couleur × opération. Une couleur désactivée dans une opération n'y
    // consomme rien ; si une couleur utilise plusieurs types de fil selon les
    // opérations, elle produit plusieurs lignes (une par type).
    const colorBreakdown = useMemo(() => {
        if (effectiveColors.length === 0) return [];

        const buckets: Record<string, {
            colorId: string;
            colorName: string;
            threadType: string;
            quantity: number;
            metersPerUnit: number;
        }> = {};

        const selectedOps = opsData.filter(op => op.selected && op.threadMetersPerUnit > 0);

        effectiveColors.forEach(color => {
            const qty = colorQtyMap[color.id] || 0;
            if (qty <= 0) return;
            selectedOps.forEach(op => {
                const ct = op.colorThreads[color.id];
                // Couleur explicitement désactivée pour cette opération → ne consomme rien
                if (ct && ct.active === false) return;
                const threadType = (ct?.threadType || op.threadType || '').trim();
                const bucketKey = `${color.id}__${threadType}`;
                if (!buckets[bucketKey]) {
                    buckets[bucketKey] = {
                        colorId: color.id,
                        colorName: color.name,
                        threadType,
                        quantity: qty,
                        metersPerUnit: 0,
                    };
                }
                buckets[bucketKey].metersPerUnit += op.threadMetersPerUnit;
            });
        });

        return Object.values(buckets).map(b => {
            const threadMeters = Math.round(b.metersPerUnit * b.quantity * 100) / 100;
            const bobbins = Math.ceil((b.metersPerUnit * b.quantity * (1 + wastePercent / 100)) / selectedBobbinSize);
            return {
                colorName: b.colorName,
                colorId: b.colorId,
                threadType: b.threadType,
                quantity: b.quantity,
                threadMeters,
                bobbins,
            };
        }).filter(c => c.threadMeters > 0);
    }, [effectiveColors, colorQtyMap, opsData, wastePercent, selectedBobbinSize]);

    // Grand totals : fil/unité = somme des opérations sélectionnées ; les totaux
    // mètres & bobines proviennent du détail couleur quand il existe (il respecte
    // les couleurs désactivées), sinon du récapitulatif machine.
    const grandTotal = useMemo(() => {
        const totalMetersPerUnit = machineSummary.reduce((sum, m) => sum + m.threadMetersPerUnit, 0);
        if (colorBreakdown.length > 0) {
            const totalMeters = colorBreakdown.reduce((s, c) => s + c.threadMeters, 0);
            const totalBobbins = colorBreakdown.reduce((s, c) => s + c.bobbins, 0);
            return { totalMeters, totalBobbins, totalMetersPerUnit };
        }
        const totalMeters = machineSummary.reduce((sum, m) => sum + m.totalMeters, 0);
        const totalBobbins = machineSummary.reduce((sum, m) => sum + m.totalBobbins, 0);
        return { totalMeters, totalBobbins, totalMetersPerUnit };
    }, [machineSummary, colorBreakdown]);

    const handleApply = () => {
        const materials: Material[] = [];
        let id = Date.now();

        if (colorBreakdown.length > 0) {
            colorBreakdown.forEach(color => {
                // Nom = « Fil {couleur} – {type} » quand un type de fil est précisé.
                const typeSuffix = color.threadType ? ` – ${color.threadType}` : '';
                materials.push({
                    id: id++,
                    name: `Fil ${color.colorName}${typeSuffix}`,
                    unitPrice: 0,
                    qty: color.bobbins,
                    unit: 'bobine',
                    threadMeters: color.threadMeters,
                    threadCapacity: selectedBobbinSize,
                    fournisseur: '',
                    threadColor: color.colorName,
                    threadReference: color.threadType || '',
                });
            });
        } else {
            machineSummary.forEach(machine => {
                // Récupère les types de fil saisis pour les opérations de cette machine
                const threadTypes = Array.from(new Set(
                    opsData
                        .filter(op => op.selected && op.machineCode === machine.machineCode && op.threadType.trim())
                        .map(op => op.threadType.trim())
                ));
                materials.push({
                    id: id++,
                    name: `Fil ${machine.machineLabel} (${machine.machineCode})`,
                    unitPrice: 0,
                    qty: machine.totalBobbins,
                    unit: 'bobine',
                    threadMeters: Math.round(machine.totalMeters * (1 + wastePercent / 100) * 100) / 100,
                    threadCapacity: selectedBobbinSize,
                    fournisseur: '',
                    threadColor: '',
                    threadReference: threadTypes.join(', '),
                });
            });
        }

        onApply(materials);
    };

    // Modal mode: popup with dark overlay
    if (!isExpanded) {
        return (
            <>
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center md:p-4">
                    <div className="bg-white w-full h-[100dvh] md:h-auto md:max-w-6xl max-h-[100dvh] md:max-h-[90vh] rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-white/20 p-2 rounded-xl">
                                    <Scissors className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black">Calcul Fil</h2>
                                    <p className="text-sm text-blue-100">Calcul automatique de la consommation de fil</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => window.print()} className="p-2 hover:bg-white/20 rounded-lg transition-colors" title="Imprimer le rapport de fil">
                                    <Printer className="w-5 h-5" />
                                </button>
                                <button onClick={() => setIsExpanded(true)} className="p-2 hover:bg-white/20 rounded-lg transition-colors" title="Agrandir (page complète)">
                                    <Maximize2 className="w-5 h-5" />
                                </button>
                                <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                {/* Settings Bar */}
                <div className="bg-slate-50 border-b p-4 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500">QUANTITÉ:</label>
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg font-black text-sm">
                            {formatNumberFr(effectiveQty)} pcs
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500">HUMIDITÉ/USURE:</label>
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min="0"
                                max="30"
                                value={wastePercent}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    if (!isNaN(val) && val >= 0 && val <= 30) {
                                        setWastePercent(val);
                                    }
                                }}
                                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded-lg text-center font-bold"
                                aria-label="Pourcentage d'humidité ou d'usure"
                            />
                            <span className="text-sm text-slate-500">%</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500">TAILLE BOBINE:</label>
                        <select
                            value={selectedBobbinSize}
                            onChange={(e) => setSelectedBobbinSize(Number(e.target.value))}
                            className="px-3 py-1 text-sm border border-slate-300 rounded-lg font-bold bg-white"
                            aria-label="Taille de la bobine"
                        >
                            {BOBBIN_SIZES.map(size => (
                                <option key={size.capacityMeters} value={size.capacityMeters}>
                                    {size.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500">TYPE FIL:</label>
                        <ThreadTypesManager
                            availableThreadTypes={availableThreadTypes}
                            onAdd={addThreadTypeValue}
                            onRename={renameThreadTypeValue}
                            onDelete={deleteThreadTypeValue}
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Operations Table */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="w-full bg-slate-50 p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Calculator className="w-4 h-4 text-blue-500" />
                                <span className="font-black text-sm text-slate-700">
                                    OPÉRATIONS ({opsData.filter(op => op.selected).length}/{opsData.length})
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={selectAll}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-bold underline"
                                    aria-label="Sélectionner toutes les opérations"
                                >
                                    Tout
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                    onClick={deselectAll}
                                    className="text-xs text-red-500 hover:text-red-700 font-bold underline"
                                    aria-label="Désélectionner toutes les opérations"
                                >
                                    Aucun
                                </button>
                            </div>
                        </div>

                        {/* Desktop View Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 text-slate-600 text-xs uppercase">
                                    <tr>
                                        <th className="p-3 text-left w-10"></th>
                                        <th className="p-3 text-left">N°</th>
                                        <th className="p-3 text-left min-w-[180px]">Description de l'opération</th>
                                        <th className="p-3 text-left">Machine</th>
                                        <th className="p-3 text-left">Type Point</th>
                                        <th className="p-3 text-center text-indigo-600" title="cm pour couture, pièces pour boutonnière/bouton/bride">L / Qté (cm/pc)</th>
                                        <th className="p-3 text-right" title="Mètres de fil par mètre de couture (ou par pièce pour boutonnières)">Conso/M</th>
                                        <th className="p-3 text-right">Fil/Unité</th>
                                        <th className="p-3 text-right text-emerald-600" title={`Bobines par unité (Fil/Unité ÷ ${selectedBobbinSize} m)`}>Bobine</th>
                                        <th className="p-3 text-left text-amber-600" title="Type de fil utilisé (ex: Polyester Tex 27, Coton NM 50)">Type Fil</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {opsData.map((op, index) => (
                                        <tr
                                            key={op.operation.id}
                                            className={`${op.selected ? 'bg-blue-50/50' : 'bg-white'} hover:bg-blue-50 transition-colors`}
                                        >
                                            <td className="p-3">
                                                <button
                                                    onClick={() => toggleOperation(index)}
                                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                        op.selected
                                                            ? 'bg-blue-500 border-blue-500 text-white'
                                                            : 'border-slate-300 hover:border-blue-400'
                                                    }`}
                                                    aria-label={op.selected ? `Désélectionner opération ${op.operation.order}` : `Sélectionner opération ${op.operation.order}`}
                                                    aria-pressed={op.selected}
                                                >
                                                    {op.selected && <Check className="w-3 h-3" />}
                                                </button>
                                            </td>
                                            <td className="p-3 font-bold text-slate-600">{op.operation.order}</td>
                                            <td className="p-3 text-slate-700">
                                                {op.operation.description || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="p-3">
                                                <span className="inline-block bg-slate-100/70 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700">
                                                    {op.machineRaw || <span className="text-slate-300">—</span>}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                {op.stitchType ? (
                                                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">
                                                        {op.stitchType.name}
                                                    </span>
                                                ) : (
                                                    <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-xs">
                                                        Non défini
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        value={op.lengthCm === 0 ? '' : op.lengthCm}
                                                        onChange={(e) => updateLength(index, Number(e.target.value))}
                                                        onFocus={(e) => e.target.select()}
                                                        onKeyDown={(e) => ['-', 'e', 'E', '+', '.', ','].includes(e.key) && e.preventDefault()}
                                                        placeholder="-"
                                                        className="w-16 px-1 py-1 text-center text-xs font-mono font-bold bg-indigo-50/30 text-indigo-700 border border-indigo-100 rounded-lg outline-none focus:border-indigo-500 transition-colors"
                                                        title={op.isPerPiece ? 'Nombre de pièces (boutonnière / bouton / bride)' : 'Longueur de couture en cm'}
                                                        aria-label={op.isPerPiece ? `Nombre de pièces pour opération ${op.operation.order}` : `Longueur de couture en cm pour opération ${op.operation.order}`}
                                                    />
                                                    <span className="text-[10px] text-slate-400">{op.isPerPiece ? 'pc' : 'cm'}</span>
                                                </div>
                                            </td>
                                            <td className="p-3 text-right font-mono text-slate-600">
                                                {op.consumptionFactor > 0
                                                    ? `${op.consumptionFactor % 1 === 0 ? op.consumptionFactor.toFixed(0) : op.consumptionFactor.toFixed(2)}${op.isPerPiece ? '/pc' : ''}`
                                                    : '-'}
                                            </td>
                                            <td className="p-3 text-right font-bold text-blue-600">
                                                {op.threadMetersPerUnit > 0 ? `${op.threadMetersPerUnit.toFixed(2)} m` : '-'}
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={op.threadMetersPerUnit > 0 ? (op.threadMetersPerUnit / selectedBobbinSize).toFixed(2) : ''}
                                                        onChange={(e) => updateBobines(index, Number(e.target.value))}
                                                        onFocus={(e) => e.target.select()}
                                                        onKeyDown={(e) => ['-', 'e', 'E', '+', '.'].includes(e.key) && e.preventDefault()}
                                                        placeholder="0.00"
                                                        className="w-16 px-1 py-1 text-center text-xs font-mono font-bold bg-emerald-50/30 text-emerald-700 border border-emerald-100 rounded-lg outline-none focus:border-emerald-500 transition-colors placeholder:text-emerald-300 placeholder:font-normal"
                                                        title={`${op.threadMetersPerUnit.toFixed(2)} m ÷ ${selectedBobbinSize} m/bobine`}
                                                        aria-label={`Bobines par unité pour opération ${op.operation.order}`}
                                                    />
                                                    <span className="text-[10px] text-slate-400">bob</span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <ColorThreadCell
                                                    op={op}
                                                    index={index}
                                                    effectiveColors={effectiveColors}
                                                    availableThreadTypes={availableThreadTypes}
                                                    onToggleColorActive={toggleColorActive}
                                                    onSetColorThreadType={setColorThreadType}
                                                    onApplyToAll={applyColorThreadToAllOps}
                                                    onUpdateThreadType={updateThreadType}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile View Cards */}
                        <div className="block md:hidden divide-y divide-slate-100 bg-white">
                            {opsData.map((op, index) => (
                                <div key={op.operation.id} className={`p-4 transition-colors ${op.selected ? 'bg-blue-50/20' : 'bg-white'}`}>
                                    <div className="flex items-start gap-3">
                                        <button
                                            onClick={() => toggleOperation(index)}
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                                op.selected
                                                    ? 'bg-blue-500 border-blue-500 text-white'
                                                    : 'border-slate-300'
                                            }`}
                                            aria-label={op.selected ? `Désélectionner opération ${op.operation.order}` : `Sélectionner opération ${op.operation.order}`}
                                            aria-pressed={op.selected}
                                        >
                                            {op.selected && <Check className="w-3.5 h-3.5" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                                <span className="font-bold text-xs text-slate-500">N° {op.operation.order}</span>
                                                <span className="inline-block bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                                                    {op.machineRaw || '—'}
                                                </span>
                                                {op.stitchType ? (
                                                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                                                        {op.stitchType.name}
                                                    </span>
                                                ) : (
                                                    <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[10px]">
                                                        Non défini
                                                    </span>
                                                )}
                                            </div>
                                            <p className="font-semibold text-slate-800 text-sm">{op.operation.description || <span className="text-slate-300">—</span>}</p>
                                        </div>
                                    </div>

                                    {/* Inputs row */}
                                    <div className="mt-3 pl-8 grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">L / Qté</label>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={op.lengthCm === 0 ? '' : op.lengthCm}
                                                    onChange={(e) => updateLength(index, Number(e.target.value))}
                                                    onFocus={(e) => e.target.select()}
                                                    onKeyDown={(e) => ['-', 'e', 'E', '+', '.', ','].includes(e.key) && e.preventDefault()}
                                                    placeholder="-"
                                                    className="w-full px-2 py-1 text-center text-xs font-mono font-bold bg-indigo-50/30 text-indigo-700 border border-indigo-100 rounded-lg outline-none focus:border-indigo-500"
                                                />
                                                <span className="text-[10px] text-slate-400 font-bold">{op.isPerPiece ? 'pc' : 'cm'}</span>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Bobine</label>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={op.threadMetersPerUnit > 0 ? (op.threadMetersPerUnit / selectedBobbinSize).toFixed(2) : ''}
                                                    onChange={(e) => updateBobines(index, Number(e.target.value))}
                                                    onFocus={(e) => e.target.select()}
                                                    onKeyDown={(e) => ['-', 'e', 'E', '+', '.'].includes(e.key) && e.preventDefault()}
                                                    placeholder="0.00"
                                                    className="w-full px-2 py-1 text-center text-xs font-mono font-bold bg-emerald-50/30 text-emerald-700 border border-emerald-100 rounded-lg outline-none focus:border-emerald-500"
                                                />
                                                <span className="text-[10px] text-slate-400 font-bold">bob</span>
                                            </div>
                                        </div>

                                        <div className="col-span-2 flex justify-between items-center bg-slate-50 p-2 rounded-lg text-xs">
                                            <div>
                                                <span className="text-slate-400">Conso/M: </span>
                                                <span className="font-bold text-slate-700">
                                                    {op.consumptionFactor > 0
                                                        ? `${op.consumptionFactor % 1 === 0 ? op.consumptionFactor.toFixed(0) : op.consumptionFactor.toFixed(2)}${op.isPerPiece ? '/pc' : ''}`
                                                        : '-'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400">Fil/Unité: </span>
                                                <span className="font-bold text-blue-600">
                                                    {op.threadMetersPerUnit > 0 ? `${op.threadMetersPerUnit.toFixed(2)} m` : '-'}
                                                </span>
                                            </div>
                                        </div>

                                        {op.selected && (
                                            <div className="col-span-2 border-t border-slate-100 pt-2">
                                                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Type Fil</span>
                                                <ColorThreadCell
                                                    op={op}
                                                    index={index}
                                                    effectiveColors={effectiveColors}
                                                    availableThreadTypes={availableThreadTypes}
                                                    onToggleColorActive={toggleColorActive}
                                                    onSetColorThreadType={setColorThreadType}
                                                    onApplyToAll={applyColorThreadToAllOps}
                                                    onUpdateThreadType={updateThreadType}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Results by Machine */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 flex items-center gap-2">
                            <Package className="w-4 h-4 text-green-600" />
                            <span className="font-black text-sm text-green-700">RÉSULTATS PAR MACHINE</span>
                        </div>
                        <div className="p-4">
                            {machineSummary.length === 0 ? (
                                <p className="text-center text-slate-400 py-4">Aucune opération sélectionnée</p>
                            ) : (
                                <div className="space-y-3">
                                    {machineSummary.map((machine, idx) => (
                                        <div key={idx} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                            <div className="flex items-center justify-between mb-2">
                                                <div>
                                                    <span className="font-black text-slate-700">{machine.machineLabel}</span>
                                                    <span className="ml-2 text-xs text-slate-400">({machine.machineCode})</span>
                                                    <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">
                                                        ISO {machine.threadCount} fils
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-2xl font-black text-green-600">{formatNumberFr(machine.totalBobbins)}</span>
                                                    <span className="text-sm text-slate-500 ml-1">bobines</span>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
                                                <div className="flex justify-between sm:block">
                                                    <span className="text-slate-500">Fil par unité:</span>
                                                    <span className="sm:ml-2 font-bold text-slate-700">{machine.threadMetersPerUnit.toFixed(2)} m</span>
                                                </div>
                                                <div className="flex justify-between sm:block">
                                                    <span className="text-slate-500">Total:</span>
                                                    <span className="sm:ml-2 font-bold text-blue-600">{formatNumberFr(machine.totalMeters)} m</span>
                                                </div>
                                                <div className="flex justify-between sm:block">
                                                    <span className="text-slate-500">+ {wastePercent}% usure:</span>
                                                    <span className="sm:ml-2 font-bold text-orange-600">
                                                        {formatNumberFr(Math.ceil(machine.totalMeters * (1 + wastePercent / 100)))} m
                                                    </span>
                                                </div>
                                            </div>
                                            {machine.operations.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-slate-200">
                                                    <span className="text-xs text-slate-400">Opérations:</span>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {machine.operations.map((opName, i) => (
                                                            <span key={i} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-xs text-slate-600">
                                                                {opName}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Grand Total */}
                    <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl p-4 sm:p-5 text-white">
                        <div className="grid grid-cols-3 gap-2 sm:gap-6 text-center">
                            <div>
                                <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">Total Fil/Unité</p>
                                <p className="text-lg sm:text-3xl font-black mt-1">{grandTotal.totalMetersPerUnit.toFixed(2)}</p>
                                <p className="text-blue-200 text-[10px] sm:text-xs">mètres</p>
                            </div>
                            <div>
                                <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">Total Général</p>
                                <p className="text-lg sm:text-3xl font-black mt-1">{formatNumberFr(grandTotal.totalMeters)}</p>
                                <p className="text-blue-200 text-[10px] sm:text-xs">mètres</p>
                            </div>
                            <div>
                                <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">Bobines Totales</p>
                                <p className="text-lg sm:text-3xl font-black mt-1">{formatNumberFr(grandTotal.totalBobbins)}</p>
                                <p className="text-blue-200 text-[10px] sm:text-xs">bobines {selectedBobbinSize}m</p>
                            </div>
                        </div>
                    </div>

                    {/* Color Breakdown (if available) */}
                    {colorBreakdown.length > 0 && (
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="bg-purple-50 p-3 flex items-center gap-2">
                                <span className="font-black text-sm text-purple-700">DÉTAIL PAR COULEUR</span>
                            </div>
                            <div className="p-4">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm min-w-[500px]">
                                        <thead className="bg-slate-100 text-slate-600 text-xs uppercase">
                                            <tr>
                                                <th className="p-2 text-left">Couleur</th>
                                                <th className="p-2 text-left">Type Fil</th>
                                                <th className="p-2 text-right">Quantité</th>
                                                <th className="p-2 text-right">Fil Total</th>
                                                <th className="p-2 text-right">Bobines</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {colorBreakdown.map((color, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50">
                                                    <td className="p-2 font-bold text-slate-700">{color.colorName}</td>
                                                    <td className="p-2 text-amber-700 font-mono text-xs">{color.threadType || '—'}</td>
                                                    <td className="p-2 text-right text-slate-600">{formatNumberFr(color.quantity)}</td>
                                                    <td className="p-2 text-right text-blue-600 font-bold">{formatNumberFr(color.threadMeters)} m</td>
                                                    <td className="p-2 text-right text-green-600 font-bold">{formatNumberFr(color.bobbins)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 border-t p-4 flex items-center justify-between">
                    <button
                        onClick={onClose}
                        className="px-4 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                        aria-label="Annuler et fermer"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={machineSummary.length === 0}
                        className="px-4 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        aria-label={`Appliquer ${grandTotal.totalBobbins} bobines`}
                    >
                        <Check className="w-4 h-4" />
                        Appliquer ({grandTotal.totalBobbins} bobines)
                    </button>
                </div>
            </div>
        </div>
        {typeof document !== 'undefined' && createPortal(
            <ThreadPrintView
                effectiveQty={effectiveQty}
                wastePercent={wastePercent}
                selectedBobbinSize={selectedBobbinSize}
                machineSummary={machineSummary}
                colorBreakdown={colorBreakdown}
                opsData={opsData}
                grandTotal={grandTotal}
            />,
            document.body
        )}
        </>
        );
    }

    // Expanded mode: full page
    return (
        <>
            <div className="fixed inset-0 z-[100] bg-white flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-xl">
                            <Scissors className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black">Calcul Fil</h2>
                            <p className="text-sm text-blue-100">Calcul automatique de la consommation de fil</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-indigo-500 hover:bg-indigo-400 rounded-lg transition-colors text-xs sm:text-sm font-bold shadow-md">
                            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Imprimer</span>
                        </button>
                        <button onClick={() => setIsExpanded(false)} className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-xs sm:text-sm font-bold">
                            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Retour</span>
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

            {/* Settings Bar */}
            <div className="bg-slate-50 border-b p-4 flex flex-wrap items-center gap-4 shrink-0">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500">QUANTITÉ:</label>
                    <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg font-black text-sm">
                        {formatNumberFr(effectiveQty)} pcs
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500">HUMIDITÉ/USURE:</label>
                    <div className="flex items-center gap-1">
                        <input
                            type="number"
                            min="0"
                            max="30"
                            value={wastePercent}
                            onChange={(e) => {
                                const val = Number(e.target.value);
                                if (!isNaN(val) && val >= 0 && val <= 30) {
                                    setWastePercent(val);
                                }
                            }}
                            className="w-16 px-2 py-1 text-sm border border-slate-300 rounded-lg text-center font-bold bg-white"
                            aria-label="Pourcentage d'humidité ou d'usure"
                        />
                        <span className="text-sm text-slate-500">%</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500">TAILLE BOBINE:</label>
                    <select
                        value={selectedBobbinSize}
                        onChange={(e) => setSelectedBobbinSize(Number(e.target.value))}
                        className="px-3 py-1 text-sm border border-slate-300 rounded-lg font-bold bg-white"
                        aria-label="Taille de la bobine"
                    >
                        {BOBBIN_SIZES.map(size => (
                            <option key={size.capacityMeters} value={size.capacityMeters}>
                                {size.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500">TYPE FIL:</label>
                    <ThreadTypesManager
                        availableThreadTypes={availableThreadTypes}
                        onAdd={addThreadTypeValue}
                        onRename={renameThreadTypeValue}
                        onDelete={deleteThreadTypeValue}
                    />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Operations Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="w-full bg-slate-50 p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calculator className="w-4 h-4 text-blue-500" />
                            <span className="font-black text-sm text-slate-700">
                                OPÉRATIONS ({opsData.filter(op => op.selected).length}/{opsData.length})
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800 font-bold underline" aria-label="Sélectionner toutes les opérations">Tout</button>
                            <span className="text-slate-300">|</span>
                            <button onClick={deselectAll} className="text-xs text-red-500 hover:text-red-700 font-bold underline" aria-label="Désélectionner toutes les opérations">Aucun</button>
                        </div>
                    </div>

                        {/* Desktop View Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 text-slate-600 text-xs uppercase">
                                    <tr>
                                        <th className="p-3 text-left w-10"></th>
                                        <th className="p-3 text-left">N°</th>
                                        <th className="p-3 text-left min-w-[180px]">Description de l'opération</th>
                                        <th className="p-3 text-left">Machine</th>
                                        <th className="p-3 text-left">Type Point</th>
                                        <th className="p-3 text-center text-indigo-600" title="cm pour couture, pièces pour boutonnière/bouton/bride">L / Qté (cm/pc)</th>
                                        <th className="p-3 text-right" title="Mètres de fil par mètre de couture (ou par pièce pour boutonnières)">Conso/M</th>
                                        <th className="p-3 text-right">Fil/Unité</th>
                                        <th className="p-3 text-right text-emerald-600" title={`Bobines par unité (Fil/Unité ÷ ${selectedBobbinSize} m)`}>Bobine</th>
                                        <th className="p-3 text-left text-amber-600" title="Type de fil utilisé (ex: Polyester Tex 27, Coton NM 50)">Type Fil</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {opsData.map((op, index) => (
                                        <tr key={op.operation.id} className={`${op.selected ? 'bg-blue-50/50' : 'bg-white'} hover:bg-blue-50 transition-colors`}>
                                            <td className="p-3">
                                                <button onClick={() => toggleOperation(index)} className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${op.selected ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 hover:border-blue-400'}`} aria-label={op.selected ? `Désélectionner opération ${op.operation.order}` : `Sélectionner opération ${op.operation.order}`} aria-pressed={op.selected}>
                                                    {op.selected && <Check className="w-3 h-3" />}
                                                </button>
                                            </td>
                                            <td className="p-3 font-bold text-slate-600">{op.operation.order}</td>
                                            <td className="p-3 text-slate-700">{op.operation.description || <span className="text-slate-300">—</span>}</td>
                                            <td className="p-3">
                                                <span className="inline-block bg-slate-100/70 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700">
                                                    {op.machineRaw || <span className="text-slate-300">—</span>}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                {op.stitchType ? (
                                                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">{op.stitchType.name}</span>
                                                ) : (
                                                    <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-xs">Non défini</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <input type="number" min="0" step="1" value={op.lengthCm === 0 ? '' : op.lengthCm} onChange={(e) => updateLength(index, Number(e.target.value))} onFocus={(e) => e.target.select()} onKeyDown={(e) => ['-', 'e', 'E', '+', '.', ','].includes(e.key) && e.preventDefault()} placeholder="-" className="w-16 px-1 py-1 text-center text-xs font-mono font-bold bg-indigo-50/30 text-indigo-700 border border-indigo-100 rounded-lg outline-none focus:border-indigo-500 transition-colors" title={op.isPerPiece ? 'Nombre de pièces (boutonnière / bouton / bride)' : 'Longueur de couture en cm'} aria-label={op.isPerPiece ? `Nombre de pièces pour opération ${op.operation.order}` : `Longueur de couture en cm pour opération ${op.operation.order}`} />
                                                    <span className="text-[10px] text-slate-400">{op.isPerPiece ? 'pc' : 'cm'}</span>
                                                </div>
                                            </td>
                                            <td className="p-3 text-right font-mono text-slate-600">
                                                {op.consumptionFactor > 0 ? `${op.consumptionFactor % 1 === 0 ? op.consumptionFactor.toFixed(0) : op.consumptionFactor.toFixed(2)}${op.isPerPiece ? '/pc' : ''}` : '-'}
                                            </td>
                                            <td className="p-3 text-right font-bold text-blue-600">
                                                {op.threadMetersPerUnit > 0 ? `${op.threadMetersPerUnit.toFixed(2)} m` : '-'}
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={op.threadMetersPerUnit > 0 ? (op.threadMetersPerUnit / selectedBobbinSize).toFixed(2) : ''}
                                                        onChange={(e) => updateBobines(index, Number(e.target.value))}
                                                        onFocus={(e) => e.target.select()}
                                                        onKeyDown={(e) => ['-', 'e', 'E', '+', '.'].includes(e.key) && e.preventDefault()}
                                                        placeholder="0.00"
                                                        className="w-16 px-1 py-1 text-center text-xs font-mono font-bold bg-emerald-50/30 text-emerald-700 border border-emerald-100 rounded-lg outline-none focus:border-emerald-500 transition-colors placeholder:text-emerald-300 placeholder:font-normal"
                                                        title={`${op.threadMetersPerUnit.toFixed(2)} m ÷ ${selectedBobbinSize} m/bobine`}
                                                        aria-label={`Bobines par unité pour opération ${op.operation.order}`}
                                                    />
                                                    <span className="text-[10px] text-slate-400">bob</span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <ColorThreadCell
                                                    op={op}
                                                    index={index}
                                                    effectiveColors={effectiveColors}
                                                    availableThreadTypes={availableThreadTypes}
                                                    onToggleColorActive={toggleColorActive}
                                                    onSetColorThreadType={setColorThreadType}
                                                    onApplyToAll={applyColorThreadToAllOps}
                                                    onUpdateThreadType={updateThreadType}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile View Cards */}
                        <div className="block md:hidden divide-y divide-slate-100 bg-white">
                            {opsData.map((op, index) => (
                                <div key={op.operation.id} className={`p-4 transition-colors ${op.selected ? 'bg-blue-50/20' : 'bg-white'}`}>
                                    <div className="flex items-start gap-3">
                                        <button
                                            onClick={() => toggleOperation(index)}
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                                op.selected
                                                    ? 'bg-blue-500 border-blue-500 text-white'
                                                    : 'border-slate-300'
                                            }`}
                                            aria-label={op.selected ? `Désélectionner opération ${op.operation.order}` : `Sélectionner opération ${op.operation.order}`}
                                            aria-pressed={op.selected}
                                        >
                                            {op.selected && <Check className="w-3.5 h-3.5" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                                <span className="font-bold text-xs text-slate-500">N° {op.operation.order}</span>
                                                <span className="inline-block bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                                                    {op.machineRaw || '—'}
                                                </span>
                                                {op.stitchType ? (
                                                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                                                        {op.stitchType.name}
                                                    </span>
                                                ) : (
                                                    <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[10px]">
                                                        Non défini
                                                    </span>
                                                )}
                                            </div>
                                            <p className="font-semibold text-slate-800 text-sm">{op.operation.description || <span className="text-slate-300">—</span>}</p>
                                        </div>
                                    </div>

                                    {/* Inputs row */}
                                    <div className="mt-3 pl-8 grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">L / Qté</label>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={op.lengthCm === 0 ? '' : op.lengthCm}
                                                    onChange={(e) => updateLength(index, Number(e.target.value))}
                                                    onFocus={(e) => e.target.select()}
                                                    onKeyDown={(e) => ['-', 'e', 'E', '+', '.', ','].includes(e.key) && e.preventDefault()}
                                                    placeholder="-"
                                                    className="w-full px-2 py-1 text-center text-xs font-mono font-bold bg-indigo-50/30 text-indigo-700 border border-indigo-100 rounded-lg outline-none focus:border-indigo-500"
                                                />
                                                <span className="text-[10px] text-slate-400 font-bold">{op.isPerPiece ? 'pc' : 'cm'}</span>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Bobine</label>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={op.threadMetersPerUnit > 0 ? (op.threadMetersPerUnit / selectedBobbinSize).toFixed(2) : ''}
                                                    onChange={(e) => updateBobines(index, Number(e.target.value))}
                                                    onFocus={(e) => e.target.select()}
                                                    onKeyDown={(e) => ['-', 'e', 'E', '+', '.'].includes(e.key) && e.preventDefault()}
                                                    placeholder="0.00"
                                                    className="w-full px-2 py-1 text-center text-xs font-mono font-bold bg-emerald-50/30 text-emerald-700 border border-emerald-100 rounded-lg outline-none focus:border-emerald-500"
                                                />
                                                <span className="text-[10px] text-slate-400 font-bold">bob</span>
                                            </div>
                                        </div>

                                        <div className="col-span-2 flex justify-between items-center bg-slate-50 p-2 rounded-lg text-xs">
                                            <div>
                                                <span className="text-slate-400">Conso/M: </span>
                                                <span className="font-bold text-slate-700">
                                                    {op.consumptionFactor > 0 ? `${op.consumptionFactor % 1 === 0 ? op.consumptionFactor.toFixed(0) : op.consumptionFactor.toFixed(2)}${op.isPerPiece ? '/pc' : ''}` : '-'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400">Fil/Unité: </span>
                                                <span className="font-bold text-blue-600">
                                                    {op.threadMetersPerUnit > 0 ? `${op.threadMetersPerUnit.toFixed(2)} m` : '-'}
                                                </span>
                                            </div>
                                        </div>

                                        {op.selected && (
                                            <div className="col-span-2 border-t border-slate-100 pt-2">
                                                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Type Fil</span>
                                                <ColorThreadCell
                                                    op={op}
                                                    index={index}
                                                    effectiveColors={effectiveColors}
                                                    availableThreadTypes={availableThreadTypes}
                                                    onToggleColorActive={toggleColorActive}
                                                    onSetColorThreadType={setColorThreadType}
                                                    onApplyToAll={applyColorThreadToAllOps}
                                                    onUpdateThreadType={updateThreadType}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                </div>

                {/* Results by Machine */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 flex items-center gap-2">
                        <Package className="w-4 h-4 text-green-600" />
                        <span className="font-black text-sm text-green-700">RÉSULTATS PAR MACHINE</span>
                    </div>
                    <div className="p-4">
                        {machineSummary.length === 0 ? (
                            <p className="text-center text-slate-400 py-4">Aucune opération sélectionnée</p>
                        ) : (
                            <div className="space-y-3">
                                {machineSummary.map((machine, idx) => (
                                    <div key={idx} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <span className="font-black text-slate-700">{machine.machineLabel}</span>
                                                <span className="ml-2 text-xs text-slate-400">({machine.machineCode})</span>
                                                <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">ISO {machine.threadCount} fils</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-2xl font-black text-green-600">{machine.totalBobbins}</span>
                                                <span className="text-sm text-slate-500 ml-1">bobines</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
                                            <div className="flex justify-between sm:block">
                                                <span className="text-slate-500">Fil par unité:</span>
                                                <span className="sm:ml-2 font-bold text-slate-700">{machine.threadMetersPerUnit.toFixed(2)} m</span>
                                            </div>
                                            <div className="flex justify-between sm:block">
                                                <span className="text-slate-500">Total:</span>
                                                <span className="sm:ml-2 font-bold text-blue-600">{formatNumberFr(machine.totalMeters)} m</span>
                                            </div>
                                            <div className="flex justify-between sm:block">
                                                <span className="text-slate-500">+ {wastePercent}% usure:</span>
                                                <span className="sm:ml-2 font-bold text-orange-600">{formatNumberFr(Math.ceil(machine.totalMeters * (1 + wastePercent / 100)))} m</span>
                                            </div>
                                        </div>
                                        {machine.operations.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-slate-200">
                                                <span className="text-xs text-slate-400">Opérations:</span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {machine.operations.map((opName, i) => (
                                                        <span key={i} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-xs text-slate-600">{opName}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl p-4 sm:p-5 text-white">
                    <div className="grid grid-cols-3 gap-2 sm:gap-6 text-center">
                        <div>
                            <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">Total Fil/Unité</p>
                            <p className="text-lg sm:text-3xl font-black mt-1">{grandTotal.totalMetersPerUnit.toFixed(2)}</p>
                            <p className="text-blue-200 text-[10px] sm:text-xs">mètres</p>
                        </div>
                        <div>
                            <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">Total Général</p>
                            <p className="text-lg sm:text-3xl font-black mt-1">{formatNumberFr(grandTotal.totalMeters)}</p>
                            <p className="text-blue-200 text-[10px] sm:text-xs">mètres</p>
                        </div>
                        <div>
                            <p className="text-blue-100 text-[10px] sm:text-sm font-bold uppercase">Bobines Totales</p>
                            <p className="text-lg sm:text-3xl font-black mt-1">{formatNumberFr(grandTotal.totalBobbins)}</p>
                            <p className="text-blue-200 text-[10px] sm:text-xs">bobines {selectedBobbinSize}m</p>
                        </div>
                    </div>
                </div>

                {/* Color Breakdown */}
                {colorBreakdown.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-purple-50 p-3 flex items-center gap-2">
                            <span className="font-black text-sm text-purple-700">DÉTAIL PAR COULEUR</span>
                        </div>
                        <div className="p-4">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[500px]">
                                    <thead className="bg-slate-100 text-slate-600 text-xs uppercase">
                                        <tr>
                                            <th className="p-2 text-left">Couleur</th>
                                            <th className="p-2 text-left">Type Fil</th>
                                            <th className="p-2 text-right">Quantité</th>
                                            <th className="p-2 text-right">Fil Total</th>
                                            <th className="p-2 text-right">Bobines</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {colorBreakdown.map((color, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-2 font-bold text-slate-700">{color.colorName}</td>
                                                <td className="p-2 text-amber-700 font-mono text-xs">{color.threadType || '—'}</td>
                                                <td className="p-2 text-right text-slate-600">{formatNumberFr(color.quantity)}</td>
                                                <td className="p-2 text-right text-blue-600 font-bold">{formatNumberFr(color.threadMeters)} m</td>
                                                <td className="p-2 text-right text-green-600 font-bold">{formatNumberFr(color.bobbins)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t p-4 flex items-center justify-between shrink-0">
                <button onClick={onClose} className="px-4 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors" aria-label="Annuler et fermer">
                    Annuler
                </button>
                <button onClick={handleApply} disabled={machineSummary.length === 0} className="px-4 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2" aria-label={`Appliquer ${grandTotal.totalBobbins} bobines`}>
                    <Check className="w-4 h-4" />
                    Appliquer ({grandTotal.totalBobbins} bobines)
                </button>
            </div>
        </div>
        {typeof document !== 'undefined' && createPortal(
            <ThreadPrintView
                effectiveQty={effectiveQty}
                wastePercent={wastePercent}
                selectedBobbinSize={selectedBobbinSize}
                machineSummary={machineSummary}
                colorBreakdown={colorBreakdown}
                opsData={opsData}
                grandTotal={grandTotal}
            />,
            document.body
        )}
        </>
    );
}

// ----- Matrice couleur × opération : cellule + popup -----

interface ThreadTypesManagerProps {
    availableThreadTypes: string[];
    onAdd: (value: string) => void;
    onRename: (oldValue: string, newValue: string) => void;
    onDelete: (value: string) => void;
}

/**
 * Gestionnaire des types de fil : bouton « Ajouter » ouvrant un panneau permettant
 * d'ajouter, renommer et supprimer les types de la liste.
 */
function ThreadTypesManager({ availableThreadTypes, onAdd, onRename, onDelete }: ThreadTypesManagerProps) {
    const [open, setOpen] = useState(false);
    const [newInput, setNewInput] = useState('');
    const [editing, setEditing] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const handleAdd = () => {
        const v = newInput.trim();
        if (!v) return;
        onAdd(v);
        setNewInput('');
    };

    const startEdit = (tt: string) => { setEditing(tt); setEditValue(tt); };
    const commitEdit = () => {
        if (editing) onRename(editing, editValue);
        setEditing(null);
        setEditValue('');
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-amber-300 rounded-lg font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                title="Gérer les types de fil (ajouter / modifier / supprimer)"
                aria-label="Gérer les types de fil"
                aria-expanded={open}
            >
                <Plus className="w-3.5 h-3.5" />
                Ajouter
                {availableThreadTypes.length > 0 && (
                    <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full ml-1">{availableThreadTypes.length}</span>
                )}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-[60]" onClick={() => { setOpen(false); setEditing(null); }} />
                    <div className="absolute z-[70] top-full mt-2 right-0 md:right-auto md:left-0 w-72 bg-white border border-amber-200 rounded-xl shadow-xl p-3 space-y-2">
                        <div className="flex items-center gap-1">
                            <input
                                type="text"
                                value={newInput}
                                onChange={(e) => setNewInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setOpen(false); }}
                                placeholder="Nouveau type (ex: Polyester Tex 27)"
                                className="flex-1 min-w-0 px-2 py-1 text-xs border border-amber-200 rounded-lg font-mono bg-amber-50/50 outline-none focus:border-amber-500"
                                aria-label="Nouveau type de fil"
                            />
                            <button type="button" onClick={handleAdd} className="p-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors shrink-0" aria-label="Ajouter ce type"><Plus className="w-4 h-4" /></button>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 pt-1 border-t border-slate-100">
                            {availableThreadTypes.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-2">Aucun type de fil</p>
                            ) : availableThreadTypes.map(tt => (
                                <div key={tt} className="flex items-center gap-1 p-1 rounded-lg hover:bg-slate-50">
                                    {editing === tt ? (
                                        <>
                                            <input
                                                type="text"
                                                value={editValue}
                                                autoFocus
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditing(null); setEditValue(''); } }}
                                                className="flex-1 min-w-0 px-2 py-1 text-xs border border-amber-300 rounded font-mono bg-amber-50 outline-none focus:border-amber-500"
                                                aria-label={`Renommer ${tt}`}
                                            />
                                            <button type="button" onClick={commitEdit} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded shrink-0" aria-label="Confirmer"><Check className="w-3.5 h-3.5" /></button>
                                            <button type="button" onClick={() => { setEditing(null); setEditValue(''); }} className="p-1 text-slate-400 hover:bg-slate-100 rounded shrink-0" aria-label="Annuler"><X className="w-3.5 h-3.5" /></button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex-1 min-w-0 truncate font-mono text-xs text-slate-700">{tt}</span>
                                            <button type="button" onClick={() => startEdit(tt)} className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded shrink-0" title="Modifier" aria-label={`Modifier ${tt}`}><Pencil className="w-3.5 h-3.5" /></button>
                                            <button type="button" onClick={() => onDelete(tt)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded shrink-0" title="Supprimer" aria-label={`Supprimer ${tt}`}><Trash2 className="w-3.5 h-3.5" /></button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

interface ColorThreadCellProps {
    op: OperationThreadData;
    index: number;
    effectiveColors: { id: string; name: string }[];
    availableThreadTypes: string[];
    onToggleColorActive: (index: number, colorId: string) => void;
    onSetColorThreadType: (index: number, colorId: string, value: string) => void;
    onApplyToAll: (index: number, colorId: string) => void;
    onUpdateThreadType: (index: number, value: string) => void;
}

/**
 * Cellule de la colonne « Type Fil », affichée DIRECTEMENT dans la ligne de l'opération.
 * - Sans couleurs : sélecteur simple (comportement historique, fil par opération).
 * - Avec couleurs : une ligne par couleur → on/off + type de fil + « appliquer à toutes les opérations ».
 */
function ColorThreadCell({
    op, index, effectiveColors, availableThreadTypes,
    onToggleColorActive, onSetColorThreadType, onApplyToAll, onUpdateThreadType,
}: ColorThreadCellProps) {
    if (effectiveColors.length === 0) {
        return (
            <select
                value={op.threadType}
                onChange={(e) => onUpdateThreadType(index, e.target.value)}
                className="w-36 px-2 py-1 text-xs font-mono bg-amber-50/30 text-amber-700 border border-amber-100 rounded-lg outline-none focus:border-amber-500 transition-colors"
                title="Type de fil utilisé pour cette opération"
                aria-label={`Type de fil pour opération ${op.operation.order}`}
            >
                <option value="">— type fil —</option>
                {availableThreadTypes.map(tt => <option key={tt} value={tt}>{tt}</option>)}
            </select>
        );
    }

    return (
        <div className="flex flex-col gap-1 min-w-[200px]">
            {effectiveColors.map(c => {
                const ct = op.colorThreads[c.id] || { active: true, threadType: '' };
                return (
                    <div key={c.id} className={`flex items-center gap-1 ${ct.active ? '' : 'opacity-50'}`}>
                        <button
                            type="button"
                            onClick={() => onToggleColorActive(index, c.id)}
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${ct.active ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'}`}
                            title={ct.active ? `${c.name} : utilisée dans cette opération` : `${c.name} : non utilisée ici`}
                            aria-pressed={ct.active}
                            aria-label={`Activer ${c.name} pour opération ${op.operation.order}`}
                        >
                            {ct.active && <Check className="w-2.5 h-2.5" />}
                        </button>
                        <span className="text-[10px] text-slate-500 w-12 truncate shrink-0" title={c.name}>{c.name}</span>
                        <select
                            value={ct.threadType}
                            onChange={(e) => onSetColorThreadType(index, c.id, e.target.value)}
                            disabled={!ct.active}
                            className="flex-1 min-w-0 px-1 py-0.5 text-[11px] font-mono bg-amber-50/30 text-amber-700 border border-amber-100 rounded outline-none focus:border-amber-500 transition-colors disabled:opacity-40"
                            title={`Type de fil pour ${c.name} (vide = même fil que l'opération)`}
                            aria-label={`Type de fil ${c.name} opération ${op.operation.order}`}
                        >
                            <option value="">— fil —</option>
                            {availableThreadTypes.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                        </select>
                        <button
                            type="button"
                            onClick={() => onApplyToAll(index, c.id)}
                            className="p-0.5 text-slate-300 hover:text-amber-600 shrink-0 transition-colors"
                            title={`Appliquer ${c.name} (on/off + fil) à toutes les opérations`}
                            aria-label={`Appliquer ${c.name} à toutes les opérations`}
                        >
                            <Copy className="w-3 h-3" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

// Helper functions
function extractCodeFromClass(className: string): string | null {
    if (!className) return null;
    // Check if it's already just a code like "514", "301", "BR"
    const directCode = className.trim().toUpperCase();
    if (/^\d{3}$/.test(directCode) || /^(BR|ZIGZAG|MAN|FER)$/.test(directCode)) {
        return directCode;
    }
    // Try to extract from parentheses like "Piqueuse Plate (301)"
    const match = className.match(/\((\d+)\)/);
    return match ? match[1] : null;
}

function findStitchTypeByMachineCode(code: string): StitchType | null {
    if (!code) return null;

    const cleanCode = code.trim().toUpperCase();

    // Direct match by machineCode
    const directMatch = STITCH_TYPES.find(st => st.machineCode === cleanCode);
    if (directMatch) return directMatch;

    // Match by ISO number
    const isoMatch = STITCH_TYPES.find(st => st.isoNumber.toString() === cleanCode);
    if (isoMatch) return isoMatch;

    // Match by partial code
    const partialMatch = STITCH_TYPES.find(st => cleanCode.startsWith(st.machineCode || ''));
    if (partialMatch) return partialMatch;

    // Specific mappings for common codes
    const codeMap: Record<string, string> = {
        '514': 'SURJET_4F',
        '516': 'SECURITE_5F_CHAINETTE',
        '504': 'SURJET_3F_504',
        '301': 'NOUE',
        '304': 'ZIGZAG_5',
        '402': 'CHAINETTE_3F',
        '256': 'RECOUV_3AIG',
        '602': 'RECOUV_602_3',
        '107': 'BOUTONNIERE_2F',
        '101': 'CHAINETTE_1F',
        'BR': 'BRIDE_NOUE',
        'ZIGZAG': 'ZIGZAG_5',
        'MAN': 'CHAINETTE_1F',
        'FER': 'NOUE',
        '401': 'CHAINETTE_2F',
        '606': 'FLATLOCK',
        '304B': 'BOUTONNIERE_LINGERIE_N',
        'BT+BR': 'BOUTONNIERE_2F',
    };

    const mappedCode = codeMap[cleanCode];
    if (mappedCode) {
        return STITCH_TYPES.find(st => st.code === mappedCode) || null;
    }

    return null;
}

interface ThreadPrintViewProps {
    effectiveQty: number;
    wastePercent: number;
    selectedBobbinSize: number;
    machineSummary: any[];
    colorBreakdown: any[];
    opsData: OperationThreadData[];
    grandTotal: { totalMeters: number; totalBobbins: number; totalMetersPerUnit: number };
}

function ThreadPrintView({
    effectiveQty,
    wastePercent,
    selectedBobbinSize,
    machineSummary,
    colorBreakdown,
    opsData,
    grandTotal,
}: ThreadPrintViewProps) {
    return (
        <div className="thread-print-root p-8">
            <style dangerouslySetInnerHTML={{ __html: `
                .thread-print-root {
                    display: none;
                }
                @media print {
                    @page { size: A4; margin: 15mm 15mm 15mm 15mm; }
                    body > *:not(.thread-print-root) {
                        display: none !important;
                    }
                    .thread-print-root {
                        display: block !important;
                        position: relative;
                        width: 100%;
                        background: white;
                        color: black;
                        font-family: system-ui, -apple-system, sans-serif;
                    }
                    .print-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 15px;
                        margin-bottom: 25px;
                    }
                    .print-table th, .print-table td {
                        border: 1px solid #e2e8f0;
                        padding: 8px 12px;
                        text-align: left;
                        font-size: 12px;
                    }
                    .print-table th {
                        background-color: #f8fafc;
                        font-weight: bold;
                        color: #1e293b;
                    }
                    .print-header {
                        border-bottom: 2px solid #2563eb;
                        padding-bottom: 15px;
                        margin-bottom: 25px;
                    }
                    .print-totals-box {
                        background-color: #f1f5f9;
                        border: 1px solid #cbd5e1;
                        border-radius: 8px;
                        padding: 15px;
                        margin-top: 25px;
                        margin-bottom: 25px;
                    }
                }
            ` }} />

            {/* Print Header */}
            <div className="print-header flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">RAPPORT DE CONSOMMATION DE FIL</h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">Généré le {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="text-right text-xs text-slate-500 space-y-1">
                    <p><span className="font-bold">BERAMETHODE</span></p>
                    <p>Atelier Méthodes</p>
                </div>
            </div>

            {/* Fiche details */}
            <div className="grid grid-cols-3 gap-4 mb-6 border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quantité Commande</p>
                    <p className="text-sm font-bold text-slate-800">{formatNumberFr(effectiveQty)} pièces</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Humidité / Usure</p>
                    <p className="text-sm font-bold text-slate-800">+{wastePercent}%</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Taille de Bobine</p>
                    <p className="text-sm font-bold text-slate-800">{formatNumberFr(selectedBobbinSize)} m</p>
                </div>
            </div>

            {/* Machine Summary Table */}
            <h2 className="text-base font-bold text-slate-800 mb-2 uppercase tracking-wide border-b pb-1">1. Récapitulatif par Machine</h2>
            <table className="print-table">
                <thead>
                    <tr>
                        <th>Machine</th>
                        <th>Code</th>
                        <th>Fils</th>
                        <th className="text-right">Mètres / Pièce</th>
                        <th className="text-right">Mètres Totaux</th>
                        <th className="text-right">Mètres (+ {wastePercent}%)</th>
                        <th className="text-right">Bobines Requises</th>
                    </tr>
                </thead>
                <tbody>
                    {machineSummary.map((m, idx) => (
                        <tr key={idx}>
                            <td className="font-bold">{m.machineLabel}</td>
                            <td className="font-mono text-slate-500">{m.machineCode}</td>
                            <td>{m.threadCount} fils</td>
                            <td className="text-right font-mono">{m.threadMetersPerUnit.toFixed(2)} m</td>
                            <td className="text-right font-mono">{formatNumberFr(m.totalMeters, 2, 2)} m</td>
                            <td className="text-right font-mono font-bold text-amber-700">{formatNumberFr(Math.ceil(m.totalMeters * (1 + wastePercent / 100)))} m</td>
                            <td className="text-right font-bold text-emerald-700">{formatNumberFr(m.totalBobbins)} bob</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Color Breakdown Table (if available) */}
            {colorBreakdown.length > 0 && (
                <>
                    <h2 className="text-base font-bold text-slate-800 mb-2 uppercase tracking-wide border-b pb-1">2. Détail par Couleur</h2>
                    <table className="print-table">
                        <thead>
                            <tr>
                                <th>Couleur</th>
                                <th>Type Fil</th>
                                <th className="text-right">Quantité Pièces</th>
                                <th className="text-right">Mètres Totaux</th>
                                <th className="text-right">Bobines ({selectedBobbinSize}m)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {colorBreakdown.map((color, idx) => (
                                <tr key={idx}>
                                    <td className="font-bold">{color.colorName}</td>
                                    <td>{color.threadType || '—'}</td>
                                    <td className="text-right">{formatNumberFr(color.quantity)}</td>
                                    <td className="text-right font-mono">{formatNumberFr(color.threadMeters, 2, 2)} m</td>
                                    <td className="text-right font-bold text-emerald-700">{formatNumberFr(color.bobbins)} bob</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {/* Grand Totals */}
            <div className="print-totals-box">
                <div className="grid grid-cols-3 gap-6 text-center font-bold">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Mètres / Pièce</p>
                        <p className="text-2xl text-slate-800 mt-1">{grandTotal.totalMetersPerUnit.toFixed(2)} m</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Mètres Global</p>
                        <p className="text-2xl text-blue-700 mt-1">{formatNumberFr(grandTotal.totalMeters, 2, 2)} m</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Bobines Requises</p>
                        <p className="text-2xl text-emerald-700 mt-1">{formatNumberFr(grandTotal.totalBobbins)} bobines</p>
                    </div>
                </div>
            </div>

            {/* Operations Detail Table */}
            <h2 className="text-base font-bold text-slate-800 mb-2 uppercase tracking-wide border-b pb-1 mt-6">
                {colorBreakdown.length > 0 ? '3.' : '2.'} Liste des Opérations Sélectionnées
            </h2>
            <table className="print-table">
                <thead>
                    <tr>
                        <th className="w-12">N°</th>
                        <th>Description</th>
                        <th>Machine</th>
                        <th>Type Point</th>
                        <th className="text-center">L / Qté (cm/pc)</th>
                        <th className="text-right">Conso/M</th>
                        <th className="text-right">Mètres/Unit</th>
                    </tr>
                </thead>
                <tbody>
                    {opsData.filter(op => op.selected).map((op) => (
                        <tr key={op.operation.id}>
                            <td className="font-bold">{op.operation.order}</td>
                            <td>{op.operation.description || '—'}</td>
                            <td>{op.machineRaw || '—'}</td>
                            <td className="text-xs text-slate-600">{op.stitchType?.name || 'Non défini'}</td>
                            <td className="text-center font-mono">{op.lengthCm} {op.isPerPiece ? 'pc' : 'cm'}</td>
                            <td className="text-right font-mono">{op.consumptionFactor.toFixed(2)}</td>
                            <td className="text-right font-mono font-bold text-blue-600">{op.threadMetersPerUnit.toFixed(2)} m</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-dashed border-slate-300">
                <div className="text-center">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Visa Méthodes</p>
                    <div className="h-20 border border-slate-200 rounded-lg mt-2 bg-slate-50/50"></div>
                </div>
                <div className="text-center">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Visa Production / Appro</p>
                    <div className="h-20 border border-slate-200 rounded-lg mt-2 bg-slate-50/50"></div>
                </div>
            </div>
        </div>
    );
}
