import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Check, X, Calculator, Package, ChevronDown, ChevronUp, Maximize2, ArrowLeft, Printer, Plus } from 'lucide-react';
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
    const [showAddThreadType, setShowAddThreadType] = useState(false);
    const [newThreadTypeInput, setNewThreadTypeInput] = useState('');

    const saveThreadTypes = (list: string[]) => {
        try { localStorage.setItem('beramethode_thread_types', JSON.stringify(list)); } catch { /* noop */ }
    };

    const addThreadType = () => {
        const value = newThreadTypeInput.trim();
        if (!value) return;
        if (availableThreadTypes.includes(value)) {
            setShowAddThreadType(false);
            setNewThreadTypeInput('');
            return;
        }
        const next = [...availableThreadTypes, value];
        setAvailableThreadTypes(next);
        saveThreadTypes(next);
        setNewThreadTypeInput('');
        setShowAddThreadType(false);
    };

    // Map operations to thread data
    const operationsData = useMemo<OperationThreadData[]>(() => {
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
            };
        });
    }, [operations]);

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

    // Quantité réelle de la commande : somme de la grille (couleurs × tailles) si elle
    // existe, sinon orderQty. Calculée comme le détail couleur pour rester cohérent.
    const effectiveQty = useMemo(() => {
        const gridTotal = colors.reduce((sum, color) => {
            return sum + Object.entries(gridQuantities)
                .filter(([key]) => key.startsWith(color.id))
                .reduce((s, [, v]) => s + (Number(v) || 0), 0);
        }, 0);
        return gridTotal > 0 ? gridTotal : (orderQty || 1);
    }, [colors, gridQuantities, orderQty]);

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

    // Grand totals
    const grandTotal = useMemo(() => {
        const totalMeters = machineSummary.reduce((sum, m) => sum + m.totalMeters, 0);
        const totalBobbins = machineSummary.reduce((sum, m) => sum + m.totalBobbins, 0);
        const totalMetersPerUnit = machineSummary.reduce((sum, m) => sum + m.threadMetersPerUnit, 0);
        return { totalMeters, totalBobbins, totalMetersPerUnit };
    }, [machineSummary]);

    // Color breakdown
    const colorBreakdown = useMemo(() => {
        if (colors.length === 0) return [];

        return colors.map(color => {
            const colorQty = Object.entries(gridQuantities)
                .filter(([key]) => key.startsWith(color.id))
                .reduce((sum, [, val]) => sum + (val as number), 0);

            return {
                colorName: color.name,
                quantity: colorQty,
                threadMeters: Math.round(grandTotal.totalMetersPerUnit * colorQty * 100) / 100,
                bobbins: Math.ceil((grandTotal.totalMetersPerUnit * colorQty * (1 + wastePercent / 100)) / selectedBobbinSize),
            };
        }).filter(c => c.quantity > 0);
    }, [colors, gridQuantities, grandTotal, wastePercent, selectedBobbinSize]);

    const handleApply = () => {
        const materials: Material[] = [];
        let id = Date.now();

        if (colorBreakdown.length > 0) {
            colorBreakdown.forEach(color => {
                materials.push({
                    id: id++,
                    name: `Fil ${color.colorName}`,
                    unitPrice: 0,
                    qty: color.bobbins,
                    unit: 'bobine',
                    threadMeters: color.threadMeters,
                    threadCapacity: selectedBobbinSize,
                    fournisseur: '',
                    threadColor: color.colorName,
                    threadReference: '',
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
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
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
                            {effectiveQty.toLocaleString()} pcs
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
                        {showAddThreadType ? (
                            <div className="flex items-center gap-1">
                                <input
                                    type="text"
                                    autoFocus
                                    value={newThreadTypeInput}
                                    onChange={(e) => setNewThreadTypeInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') addThreadType();
                                        if (e.key === 'Escape') { setShowAddThreadType(false); setNewThreadTypeInput(''); }
                                    }}
                                    placeholder="Ex: Polyester Tex 27"
                                    className="px-2 py-1 text-sm border border-amber-300 rounded-lg font-mono w-44 bg-amber-50 outline-none focus:border-amber-500"
                                    aria-label="Nouveau type de fil"
                                />
                                <button
                                    type="button"
                                    onClick={addThreadType}
                                    className="p-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                                    aria-label="Confirmer le nouveau type de fil"
                                >
                                    <Check className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setShowAddThreadType(false); setNewThreadTypeInput(''); }}
                                    className="p-1 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"
                                    aria-label="Annuler"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowAddThreadType(true)}
                                className="flex items-center gap-1 px-3 py-1 text-sm border border-amber-300 rounded-lg font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                                title="Ajouter un nouveau type de fil à la liste"
                                aria-label="Ajouter un nouveau type de fil"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Ajouter
                                {availableThreadTypes.length > 0 && (
                                    <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full ml-1">
                                        {availableThreadTypes.length}
                                    </span>
                                )}
                            </button>
                        )}
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

                        <div className="overflow-x-auto">
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
                                                            placeholder="bobine"
                                                            className="w-16 px-1 py-1 text-center text-xs font-mono font-bold bg-emerald-50/30 text-emerald-700 border border-emerald-100 rounded-lg outline-none focus:border-emerald-500 transition-colors placeholder:text-emerald-300 placeholder:font-normal"
                                                            title={`${op.threadMetersPerUnit.toFixed(2)} m ÷ ${selectedBobbinSize} m/bobine`}
                                                            aria-label={`Bobines par unité pour opération ${op.operation.order}`}
                                                        />
                                                        <span className="text-[10px] text-slate-400">bob</span>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <select
                                                        value={op.threadType}
                                                        onChange={(e) => updateThreadType(index, e.target.value)}
                                                        className="w-36 px-2 py-1 text-xs font-mono bg-amber-50/30 text-amber-700 border border-amber-100 rounded-lg outline-none focus:border-amber-500 transition-colors"
                                                        title="Type de fil utilisé pour cette opération (utilisez « + » dans la barre du haut pour ajouter un type)"
                                                        aria-label={`Type de fil pour opération ${op.operation.order}`}
                                                    >
                                                        <option value="">— type fil —</option>
                                                        {availableThreadTypes.map(tt => (
                                                            <option key={tt} value={tt}>{tt}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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
                                                    <span className="text-2xl font-black text-green-600">{machine.totalBobbins}</span>
                                                    <span className="text-sm text-slate-500 ml-1">bobines</span>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4 text-sm">
                                                <div>
                                                    <span className="text-slate-500">Fil par unité:</span>
                                                    <span className="ml-2 font-bold text-slate-700">{machine.threadMetersPerUnit.toFixed(2)} m</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">Total:</span>
                                                    <span className="ml-2 font-bold text-blue-600">{machine.totalMeters.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">+ {wastePercent}% usure:</span>
                                                    <span className="ml-2 font-bold text-orange-600">
                                                        {Math.ceil(machine.totalMeters * (1 + wastePercent / 100)).toLocaleString('fr-FR')} m
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
                    <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl p-5 text-white">
                        <div className="grid grid-cols-3 gap-6 text-center">
                            <div>
                                <p className="text-blue-100 text-sm">TOTAL FIL/UNITÉ</p>
                                <p className="text-3xl font-black">{grandTotal.totalMetersPerUnit.toFixed(2)}</p>
                                <p className="text-blue-200 text-xs">mètres</p>
                            </div>
                            <div>
                                <p className="text-blue-100 text-sm">TOTAL GÉNÉRAL</p>
                                <p className="text-3xl font-black">{grandTotal.totalMeters.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
                                <p className="text-blue-200 text-xs">mètres</p>
                            </div>
                            <div>
                                <p className="text-blue-100 text-sm">BOBINES TOTALES</p>
                                <p className="text-3xl font-black">{grandTotal.totalBobbins}</p>
                                <p className="text-blue-200 text-xs">bobines {selectedBobbinSize}m</p>
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
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 text-slate-600 text-xs uppercase">
                                        <tr>
                                            <th className="p-2 text-left">Couleur</th>
                                            <th className="p-2 text-right">Quantité</th>
                                            <th className="p-2 text-right">Fil Total</th>
                                            <th className="p-2 text-right">Bobines</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {colorBreakdown.map((color, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-2 font-bold text-slate-700">{color.colorName}</td>
                                                <td className="p-2 text-right text-slate-600">{color.quantity.toLocaleString()}</td>
                                                <td className="p-2 text-right text-blue-600 font-bold">{color.threadMeters.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m</td>
                                                <td className="p-2 text-right text-green-600 font-bold">{color.bobbins}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 border-t p-4 flex items-center justify-between">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                        aria-label="Annuler et fermer"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={machineSummary.length === 0}
                        className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 rounded-lg transition-colors text-sm font-bold shadow-md">
                            <Printer className="w-4 h-4" /> Imprimer
                        </button>
                        <button onClick={() => setIsExpanded(false)} className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm font-bold">
                            <ArrowLeft className="w-4 h-4" /> Retour
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

            {/* Settings bar */}
            <div className="bg-slate-50 border-b p-4 flex items-center gap-4 flex-wrap shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-600">Usure:</span>
                    <input
                        type="number"
                        min="0"
                        max="30"
                        value={wastePercent}
                        onChange={(e) => setWastePercent(Math.min(30, Math.max(0, Number(e.target.value))))}
                        className="w-16 px-2 py-1 text-sm border border-slate-300 rounded-lg font-bold"
                        aria-label="Pourcentage d'usure"
                    />
                    <span className="text-sm text-slate-500">%</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-600">Bobine:</span>
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
                    <span className="text-sm font-bold text-slate-600">Type Fil:</span>
                    {showAddThreadType ? (
                        <div className="flex items-center gap-1">
                            <input
                                type="text"
                                autoFocus
                                value={newThreadTypeInput}
                                onChange={(e) => setNewThreadTypeInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') addThreadType();
                                    if (e.key === 'Escape') { setShowAddThreadType(false); setNewThreadTypeInput(''); }
                                }}
                                placeholder="Ex: Polyester Tex 27"
                                className="px-2 py-1 text-sm border border-amber-300 rounded-lg font-mono w-44 bg-amber-50 outline-none focus:border-amber-500"
                                aria-label="Nouveau type de fil"
                            />
                            <button type="button" onClick={addThreadType} className="p-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors" aria-label="Confirmer"><Check className="w-4 h-4" /></button>
                            <button type="button" onClick={() => { setShowAddThreadType(false); setNewThreadTypeInput(''); }} className="p-1 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors" aria-label="Annuler"><X className="w-4 h-4" /></button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setShowAddThreadType(true)}
                            className="flex items-center gap-1 px-3 py-1 text-sm border border-amber-300 rounded-lg font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                            aria-label="Ajouter un nouveau type de fil"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Ajouter
                            {availableThreadTypes.length > 0 && (
                                <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full ml-1">
                                    {availableThreadTypes.length}
                                </span>
                            )}
                        </button>
                    )}
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

                    <div className="overflow-x-auto">
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
                                                        placeholder="bobine"
                                                        className="w-16 px-1 py-1 text-center text-xs font-mono font-bold bg-emerald-50/30 text-emerald-700 border border-emerald-100 rounded-lg outline-none focus:border-emerald-500 transition-colors placeholder:text-emerald-300 placeholder:font-normal"
                                                        title={`${op.threadMetersPerUnit.toFixed(2)} m ÷ ${selectedBobbinSize} m/bobine`}
                                                        aria-label={`Bobines par unité pour opération ${op.operation.order}`}
                                                    />
                                                    <span className="text-[10px] text-slate-400">bob</span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <select
                                                    value={op.threadType}
                                                    onChange={(e) => updateThreadType(index, e.target.value)}
                                                    className="w-36 px-2 py-1 text-xs font-mono bg-amber-50/30 text-amber-700 border border-amber-100 rounded-lg outline-none focus:border-amber-500 transition-colors"
                                                    title="Type de fil utilisé pour cette opération (utilisez « + » dans la barre du haut pour ajouter un type)"
                                                    aria-label={`Type de fil pour opération ${op.operation.order}`}
                                                >
                                                    <option value="">— type fil —</option>
                                                    {availableThreadTypes.map(tt => (
                                                        <option key={tt} value={tt}>{tt}</option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
                                        <div className="grid grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <span className="text-slate-500">Fil par unité:</span>
                                                <span className="ml-2 font-bold text-slate-700">{machine.threadMetersPerUnit.toFixed(2)} m</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500">Total:</span>
                                                <span className="ml-2 font-bold text-blue-600">{machine.totalMeters.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500">+ {wastePercent}% usure:</span>
                                                <span className="ml-2 font-bold text-orange-600">{Math.ceil(machine.totalMeters * (1 + wastePercent / 100)).toLocaleString('fr-FR')} m</span>
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

                {/* Grand Total */}
                <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl p-5 text-white">
                    <div className="grid grid-cols-3 gap-6 text-center">
                        <div>
                            <p className="text-blue-100 text-sm">TOTAL FIL/UNITÉ</p>
                            <p className="text-3xl font-black">{grandTotal.totalMetersPerUnit.toFixed(2)}</p>
                            <p className="text-blue-200 text-xs">mètres</p>
                        </div>
                        <div>
                            <p className="text-blue-100 text-sm">TOTAL GÉNÉRAL</p>
                            <p className="text-3xl font-black">{grandTotal.totalMeters.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
                            <p className="text-blue-200 text-xs">mètres</p>
                        </div>
                        <div>
                            <p className="text-blue-100 text-sm">BOBINES TOTALES</p>
                            <p className="text-3xl font-black">{grandTotal.totalBobbins}</p>
                            <p className="text-blue-200 text-xs">bobines {selectedBobbinSize}m</p>
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
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 text-slate-600 text-xs uppercase">
                                    <tr>
                                        <th className="p-2 text-left">Couleur</th>
                                        <th className="p-2 text-right">Quantité</th>
                                        <th className="p-2 text-right">Fil Total</th>
                                        <th className="p-2 text-right">Bobines</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {colorBreakdown.map((color, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-2 font-bold text-slate-700">{color.colorName}</td>
                                            <td className="p-2 text-right text-slate-600">{color.quantity.toLocaleString()}</td>
                                            <td className="p-2 text-right text-blue-600 font-bold">{color.threadMeters.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m</td>
                                            <td className="p-2 text-right text-green-600 font-bold">{color.bobbins}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t p-4 flex items-center justify-between shrink-0">
                <button onClick={onClose} className="px-6 py-2.5 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors" aria-label="Annuler et fermer">
                    Annuler
                </button>
                <button onClick={handleApply} disabled={machineSummary.length === 0} className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2" aria-label={`Appliquer ${grandTotal.totalBobbins} bobines`}>
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
                    <p className="text-sm font-bold text-slate-800">{effectiveQty.toLocaleString()} pièces</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Humidité / Usure</p>
                    <p className="text-sm font-bold text-slate-800">+{wastePercent}%</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Taille de Bobine</p>
                    <p className="text-sm font-bold text-slate-800">{selectedBobbinSize.toLocaleString()} m</p>
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
                            <td className="text-right font-mono">{m.totalMeters.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</td>
                            <td className="text-right font-mono font-bold text-amber-700">{Math.ceil(m.totalMeters * (1 + wastePercent / 100)).toLocaleString('fr-FR')} m</td>
                            <td className="text-right font-bold text-emerald-700">{m.totalBobbins} bob</td>
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
                                <th className="text-right">Quantité Pièces</th>
                                <th className="text-right">Mètres Totaux</th>
                                <th className="text-right">Bobines ({selectedBobbinSize}m)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {colorBreakdown.map((color, idx) => (
                                <tr key={idx}>
                                    <td className="font-bold">{color.colorName}</td>
                                    <td className="text-right">{color.quantity.toLocaleString()}</td>
                                    <td className="text-right font-mono">{color.threadMeters.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</td>
                                    <td className="text-right font-bold text-emerald-700">{color.bobbins} bob</td>
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
                        <p className="text-2xl text-blue-700 mt-1">{grandTotal.totalMeters.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Bobines Requises</p>
                        <p className="text-2xl text-emerald-700 mt-1">{grandTotal.totalBobbins} bobines</p>
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
