
import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
    Calendar,
    User,
    Tag,
    Layers,
    Hash,
    DollarSign,
    Image as ImageIcon,
    Upload,
    FileText,
    Factory,
    Clock,
    Users,
    Activity,
    Target,
    TrendingUp,
    Shirt,
    Maximize2,
    X,
    Plus,
    Trash2,
    ArrowRight,
    Grid3X3,
    Coins,
    Palette,
    ChevronDown,
    LayoutGrid,
    Loader2
} from 'lucide-react';
import { FicheData } from '../types';
import { TEXTILE_COLORS, TEXTILE_FABRICS } from '../data/textileData';
import ExcelInput from './ExcelInput';
import { compressImage } from '../utils';

interface FicheTechniqueProps {
    data: FicheData;
    setData: React.Dispatch<React.SetStateAction<FicheData>>;
    articleName: string;
    setArticleName: (name: string) => void;
    // Global Computed Data
    totalTime: number; // Temps Gamme
    tempsArticle: number; // Temps Article (with majoration)
    numWorkers: number;
    setNumWorkers: (n: number) => void;
    efficiency: number; // P° Réel / Moyenne
    setEfficiency: (n: number) => void;

    // Images
    images: { front: string | null; back: string | null };
    setImages: React.Dispatch<React.SetStateAction<{ front: string | null; back: string | null }>>;

    // Nav - Not used anymore but kept in interface for compatibility if passed
    onNext?: () => void;
}

export default function FicheTechnique({
    data,
    setData,
    articleName,
    setArticleName,
    totalTime,
    tempsArticle,
    numWorkers,
    setNumWorkers,
    efficiency,
    setEfficiency,
    images,
    setImages,
    onNext
}: FicheTechniqueProps) {

    const frontInputRef = useRef<HTMLInputElement>(null);
    const backInputRef = useRef<HTMLInputElement>(null);

    // Loading state for compression
    const [isProcessingImg, setIsProcessingImg] = useState<string | null>(null);

    // -- Image Preview Modal State --
    const [previewImage, setPreviewImage] = useState<{ src: string, title: string } | null>(null);

    // -- MATRIX STATE --
    const sizes = data.sizes || [];
    const setSizes = (updater: React.SetStateAction<string[]>) => {
        setData(prev => ({
            ...prev,
            sizes: typeof updater === 'function' ? updater(prev.sizes || []) : updater
        }));
    };
    const [newSizeInput, setNewSizeInput] = useState('');

    const colors = data.colors || [];
    const setColors = (updater: React.SetStateAction<{ id: string, name: string }[]>) => {
        setData(prev => ({
            ...prev,
            colors: typeof updater === 'function' ? updater(prev.colors || []) : updater
        }));
    };
    const [newColorInput, setNewColorInput] = useState('');
    const [pickedHexColor, setPickedHexColor] = useState('#10b981');

    // Key format: "colorId_sizeIndex" -> value: number
    const gridQuantities = data.gridQuantities || {};
    const setGridQuantities = (updater: React.SetStateAction<Record<string, number>>) => {
        setData(prev => ({
            ...prev,
            gridQuantities: typeof updater === 'function' ? updater(prev.gridQuantities || {}) : updater
        }));
    };

    // Local state for smooth decimal typing in cost fields
    const [localCostMinute, setLocalCostMinute] = useState<string>(data.costMinute?.toString() || '');

    // Sync local input when external data changes
    useEffect(() => {
        // Only update local state if the numeric value is different (handles external updates)
        // but respects current typing (avoids cursor jump or formatting interrupt)
        if (data.costMinute !== parseFloat(localCostMinute) && !(localCostMinute === '' && data.costMinute === 0)) {
            setLocalCostMinute(data.costMinute?.toString() || '');
        }
    }, [data.costMinute]);

    // Sync calculated Unit Cost back to data
    useEffect(() => {
        const computed = Number((tempsArticle * (data.costMinute || 0)).toFixed(2));
        if (data.unitCost !== computed) {
            setData(prev => ({ ...prev, unitCost: computed }));
        }
    }, [tempsArticle, data.costMinute, setData]);

    // --- CALCULATIONS ---
    const matrixStats = useMemo(() => {
        const rowTotals: Record<string, number> = {};
        const colTotals: Record<number, number> = {};
        let grandTotal = 0;

        colors.forEach(c => {
            rowTotals[c.id] = 0;
            sizes.forEach((_, sIdx) => {
                const key = `${c.id}_${sIdx}`;
                const val = gridQuantities[key] || 0;
                rowTotals[c.id] += val;
                colTotals[sIdx] = (colTotals[sIdx] || 0) + val;
                grandTotal += val;
            });
        });

        return { rowTotals, colTotals, grandTotal };
    }, [sizes, colors, gridQuantities]);

    // Update Global Quantity when matrix changes
    useEffect(() => {
        if (matrixStats.grandTotal > 0) {
            setData(prev => ({ ...prev, quantity: matrixStats.grandTotal }));
        }
    }, [matrixStats.grandTotal, setData]);

    // --- HANDLERS ---
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
        const file = e.target.files?.[0];
        if (file) {
            setIsProcessingImg(type);
            try {
                const compressedBase64 = await compressImage(file);
                setImages(prev => ({ ...prev, [type]: compressedBase64 }));
            } catch (error) {
                console.error("Image compression failed", error);
                alert("Erreur lors du traitement de l'image.");
            } finally {
                setIsProcessingImg(null);
            }
        }
    };

    const handleChange = (field: keyof FicheData, value: any) => {
        setData(prev => ({ ...prev, [field]: value }));
    };

    const handleCostMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalCostMinute(val);

        const num = parseFloat(val);
        // If it's a valid number, update the global data
        if (!isNaN(num)) {
            handleChange('costMinute', num);
        } else if (val === '') {
            handleChange('costMinute', 0);
        }
    };

    // Matrix Actions
    const addSize = () => {
        if (!newSizeInput.trim()) return;
        // Allow adding multiple sizes separated by space or comma (e.g. "36 38 40")
        const newSizes = newSizeInput.split(/[\s,]+/).filter(s => s.trim() !== '');
        setSizes(prev => [...prev, ...newSizes]);
        setNewSizeInput('');
    };

    const removeSize = (index: number) => {
        setSizes(prev => prev.filter((_, i) => i !== index));
        // Note: We don't strictly need to clean up gridQuantities as keys rely on index which shifts, 
        // but for a simple app, visual consistency is enough. 
        // Ideally, we'd remap keys, but simple deletion is acceptable for this UX level.
    };

    const addColor = () => {
        if (!newColorInput.trim()) return;
        setColors(prev => [...prev, { id: Date.now().toString(), name: newColorInput.trim() }]);
        setNewColorInput('');
    };

    // Smart color name detection from hex
    const hexToColorName = (hex: string): string => {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        const namedColors: { name: string; r: number; g: number; b: number }[] = [
            { name: 'Noir', r: 0, g: 0, b: 0 },
            { name: 'Blanc', r: 255, g: 255, b: 255 },
            { name: 'Rouge', r: 255, g: 0, b: 0 },
            { name: 'Rouge Foncé', r: 139, g: 0, b: 0 },
            { name: 'Bordeaux', r: 128, g: 0, b: 32 },
            { name: 'Cramoisi', r: 220, g: 20, b: 60 },
            { name: 'Rose', r: 255, g: 105, b: 180 },
            { name: 'Rose Clair', r: 255, g: 182, b: 193 },
            { name: 'Fuchsia', r: 255, g: 0, b: 255 },
            { name: 'Orange', r: 255, g: 165, b: 0 },
            { name: 'Orange Foncé', r: 255, g: 140, b: 0 },
            { name: 'Corail', r: 255, g: 127, b: 80 },
            { name: 'Saumon', r: 250, g: 128, b: 114 },
            { name: 'Jaune', r: 255, g: 255, b: 0 },
            { name: 'Jaune Doré', r: 255, g: 215, b: 0 },
            { name: 'Jaune Pâle', r: 255, g: 255, b: 224 },
            { name: 'Vert', r: 0, g: 128, b: 0 },
            { name: 'Vert Clair', r: 144, g: 238, b: 144 },
            { name: 'Vert Foncé', r: 0, g: 100, b: 0 },
            { name: 'Vert Émeraude', r: 16, g: 185, b: 129 },
            { name: 'Lime', r: 0, g: 255, b: 0 },
            { name: 'Olive', r: 128, g: 128, b: 0 },
            { name: 'Kaki', r: 189, g: 183, b: 107 },
            { name: 'Turquoise', r: 64, g: 224, b: 208 },
            { name: 'Cyan', r: 0, g: 255, b: 255 },
            { name: 'Bleu Ciel', r: 135, g: 206, b: 235 },
            { name: 'Bleu', r: 0, g: 0, b: 255 },
            { name: 'Bleu Royal', r: 65, g: 105, b: 225 },
            { name: 'Bleu Marine', r: 0, g: 0, b: 128 },
            { name: 'Indigo', r: 75, g: 0, b: 130 },
            { name: 'Violet', r: 128, g: 0, b: 128 },
            { name: 'Lavande', r: 230, g: 230, b: 250 },
            { name: 'Mauve', r: 224, g: 176, b: 255 },
            { name: 'Marron', r: 139, g: 69, b: 19 },
            { name: 'Chocolat', r: 210, g: 105, b: 30 },
            { name: 'Beige', r: 245, g: 245, b: 220 },
            { name: 'Crème', r: 255, g: 253, b: 208 },
            { name: 'Ivoire', r: 255, g: 255, b: 240 },
            { name: 'Gris', r: 128, g: 128, b: 128 },
            { name: 'Gris Clair', r: 192, g: 192, b: 192 },
            { name: 'Gris Foncé', r: 64, g: 64, b: 64 },
            { name: 'Argent', r: 192, g: 192, b: 192 },
        ];
        let closest = namedColors[0];
        let minDist = Infinity;
        for (const c of namedColors) {
            const dist = Math.sqrt((r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2);
            if (dist < minDist) { minDist = dist; closest = c; }
        }
        return closest.name;
    };

    const addVisualColor = (hex: string) => {
        const detectedName = hexToColorName(hex);
        setColors(prev => [...prev, { id: hex, name: detectedName }]);
    };

    const removeColor = (id: string) => {
        setColors(prev => prev.filter(c => c.id !== id));
        const newQ = { ...gridQuantities };
        // Clean up keys for this color
        Object.keys(newQ).forEach(k => {
            if (k.startsWith(`${id}_`)) delete newQ[k];
        });
        setGridQuantities(newQ);
    };

    const updateQuantity = (colorId: string, sizeIdx: number, value: string) => {
        const num = parseInt(value) || 0;
        setGridQuantities(prev => ({
            ...prev,
            [`${colorId}_${sizeIdx}`]: num
        }));
    };

    return (
        <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-2 duration-300 relative">

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* LEFT COLUMN: DATA INPUTS (8 Cols) */}
                <div className="lg:col-span-8 space-y-6">

                    {/* 1. GENERAL INFO CARD */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Tag className="w-4 h-4 text-indigo-500" />
                                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Identification</h3>
                            </div>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Client</label>
                                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all">
                                    <User className="w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={data.client}
                                        onChange={(e) => handleChange('client', e.target.value)}
                                        placeholder="Nom du Client"
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Modèle / Réf</label>
                                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all">
                                    <Shirt className="w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={articleName}
                                        onChange={(e) => setArticleName(e.target.value)}
                                        placeholder="Référence Modèle"
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            {/* Category Field */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 flex items-center gap-1">
                                    Catégorie <span className="text-rose-500">*</span>
                                </label>
                                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all">
                                    <LayoutGrid className="w-4 h-4 text-slate-400" />
                                    <ExcelInput
                                        suggestions={["T-Shirt", "Polo", "Chemise", "Pantalon", "Robe", "Veste", "Sweat", "Short", "Jupe", "Pyjama", "Sous-vêtement"]}
                                        value={data.category}
                                        onChange={(val) => handleChange('category', val)}
                                        placeholder="Famille produit"
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Date Lancement</label>
                                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all">
                                    {/* Calendar Trigger: Invisible Overlay Technique */}
                                    <div className="relative group">
                                        <div className="p-1.5 bg-white rounded-lg text-indigo-500 shadow-sm border border-indigo-100 group-hover:bg-indigo-50 transition-colors pointer-events-none">
                                            <Calendar className="w-4 h-4" />
                                        </div>
                                        {/* The invisible input sits on top of the icon. Clicking it opens the native picker immediately. */}
                                        <input
                                            type="date"
                                            value={data.date}
                                            onChange={(e) => handleChange('date', e.target.value)}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            title="Choisir une date"
                                        />
                                    </div>

                                    {/* Manual Entry Input */}
                                    <input
                                        type="date"
                                        value={data.date}
                                        onChange={(e) => handleChange('date', e.target.value)}
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300 font-mono date-input-modern"
                                    />
                                    {/* CSS to hide default calendar picker indicator on the text input so it looks clean */}
                                    <style>{`
                                .date-input-modern::-webkit-calendar-picker-indicator {
                                    display: none;
                                }
                            `}</style>
                                </div>
                            </div>

                            <div className="md:col-span-2 space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Matière Principale / Désignation</label>
                                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all relative">
                                    <Layers className="w-4 h-4 text-slate-400 z-20 relative" />
                                    <ExcelInput
                                        suggestions={TEXTILE_FABRICS}
                                        value={data.designation}
                                        onChange={(val) => handleChange('designation', val)}
                                        placeholder="Rechercher un tissu (ex: Popeline, Denim, Jersey...)"
                                        className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300 pl-9 pr-3"
                                        containerClassName="absolute inset-0 flex items-center"
                                    />
                                </div>
                            </div>

                            {/* MATRIX BREAKDOWN SECTION */}
                            <div className="md:col-span-2 mt-4 pt-4 border-t border-slate-100">
                                <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                        <Grid3X3 className="w-3.5 h-3.5" />
                                        Répartition (Tailles / Couleurs)
                                    </label>

                                    {/* ADD SIZE INPUT */}
                                    <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                                        <input
                                            type="text"
                                            placeholder="Ajouter Tailles (ex: 36 38 40)"
                                            className="bg-transparent text-xs px-2 outline-none w-48 text-slate-700 placeholder:text-slate-400"
                                            value={newSizeInput}
                                            onChange={(e) => setNewSizeInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addSize()}
                                        />
                                        <button onClick={addSize} className="bg-white rounded p-1 shadow-sm hover:text-indigo-600 transition-colors">
                                            <Plus className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                    {/* ADD COLOR INPUT — Unified bar */}
                                    <div className="bg-slate-50 p-2.5 border-b border-slate-200 flex flex-wrap gap-2 items-center">
                                        {/* Color Swatch Picker */}
                                        <label className="relative flex items-center justify-center cursor-pointer shrink-0" title="Choisir une couleur">
                                            <input
                                                type="color"
                                                value={pickedHexColor}
                                                onChange={(e) => setPickedHexColor(e.target.value)}
                                                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                            />
                                            <div className="w-6 h-6 rounded-md border-2 border-slate-300 shadow-sm cursor-pointer hover:scale-110 transition-transform" style={{ backgroundColor: pickedHexColor }}></div>
                                        </label>
                                        {/* Auto-detected name badge */}
                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[11px] font-black rounded-md whitespace-nowrap">
                                            {hexToColorName(pickedHexColor)}
                                        </span>
                                        {/* Text input */}
                                        <div className="relative flex-1 min-w-[120px] flex items-center bg-white border border-slate-200 rounded-lg focus-within:border-indigo-400 px-3 h-7">
                                            <Palette className="w-3 h-3 text-slate-400 mr-2 z-20 relative shrink-0" />
                                            <ExcelInput
                                                suggestions={TEXTILE_COLORS.map(c => c.value)}
                                                placeholder="Nom couleur (ou laisser auto)..."
                                                className="text-xs font-bold text-slate-700 outline-none w-full pl-6 pr-2"
                                                containerClassName="absolute inset-0 flex items-center"
                                                value={newColorInput}
                                                onChange={(val) => setNewColorInput(val)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        if (newColorInput.trim()) addColor();
                                                        else addVisualColor(pickedHexColor);
                                                    }
                                                }}
                                            />
                                        </div>
                                        {/* Add button */}
                                        <button
                                            onClick={() => {
                                                if (newColorInput.trim()) addColor();
                                                else addVisualColor(pickedHexColor);
                                            }}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors z-20 h-7"
                                        >
                                            <Plus className="w-3 h-3" /> Ajouter
                                        </button>
                                    </div>

                                    {/* THE GRID */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                                                    <th className="py-3 px-3 text-left font-bold border-r border-slate-200 min-w-[120px]">Couleur \ Taille</th>
                                                    {sizes.length === 0 && (
                                                        <th className="py-2 px-4 text-center font-normal italic text-slate-400 border-r border-slate-200 min-w-[100px]">
                                                            (Ajouter tailles)
                                                        </th>
                                                    )}
                                                    {sizes.map((s, i) => (
                                                        <th key={i} className="py-2 px-2 text-center font-bold border-r border-slate-200 min-w-[50px] relative group">
                                                            {s}
                                                            <button
                                                                onClick={() => removeSize(i)}
                                                                className="absolute top-0 right-0 p-0.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="Supprimer Taille"
                                                            >
                                                                <X className="w-2.5 h-2.5" />
                                                            </button>
                                                        </th>
                                                    ))}
                                                    <th className="py-2 px-3 text-center font-black bg-slate-200 text-slate-800 w-20">TOTAL</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {colors.length === 0 && (
                                                    <tr>
                                                        <td colSpan={sizes.length + (sizes.length === 0 ? 3 : 2)} className="py-8 text-center text-slate-400 italic">
                                                            Ajoutez des couleurs pour commencer la répartition.
                                                        </td>
                                                    </tr>
                                                )}
                                                {colors.map((c) => (
                                                    <tr key={c.id} className="hover:bg-slate-50 group">
                                                        <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                                                            <div className="flex items-center gap-2">
                                                                <div
                                                                    className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                                    style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                                />
                                                                <span className="truncate max-w-[150px]" title={c.name}>
                                                                    {c.id && c.id.startsWith('#') && (c.name.includes('personnalisé') || c.name.startsWith('#') || c.name.includes('rgb(') || c.name.includes('Couleur P'))
                                                                        ? hexToColorName(c.id)
                                                                        : c.name}
                                                                </span>
                                                            </div>
                                                            <button onClick={() => removeColor(c.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                        {sizes.length === 0 && (
                                                            <td className="p-2 border-r border-slate-100 bg-slate-50/30 text-center text-slate-300 text-[10px] italic">
                                                                -
                                                            </td>
                                                        )}
                                                        {sizes.map((s, sIdx) => {
                                                            const key = `${c.id}_${sIdx}`;
                                                            const val = gridQuantities[key] || '';
                                                            return (
                                                                <td key={sIdx} className="p-0 border-r border-slate-100 bg-white">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        className="w-full h-full text-center py-2.5 bg-transparent outline-none focus:bg-indigo-50 focus:text-indigo-700 transition-colors font-medium placeholder:text-slate-200"
                                                                        placeholder="0"
                                                                        value={val}
                                                                        onChange={(e) => updateQuantity(c.id, sIdx, e.target.value)}
                                                                    />
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="py-2 px-3 text-center font-bold text-slate-700 bg-slate-50 border-l border-slate-200">
                                                            {matrixStats.rowTotals[c.id]}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            {colors.length > 0 && (
                                                <tfoot className="border-t-2 border-slate-200 font-bold bg-slate-50">
                                                    <tr>
                                                        <td className="py-2 px-3 text-right uppercase text-[10px] tracking-wider text-slate-500 border-r border-slate-200">Total</td>
                                                        {sizes.length === 0 && (
                                                            <td className="py-2 px-2 text-center text-slate-700 border-r border-slate-200">-</td>
                                                        )}
                                                        {sizes.map((_, sIdx) => (
                                                            <td key={sIdx} className="py-2 px-2 text-center text-slate-700 border-r border-slate-200">
                                                                {matrixStats.colTotals[sIdx] || 0}
                                                            </td>
                                                        ))}
                                                        <td className="py-2 px-3 text-center bg-indigo-600 text-white font-black text-sm">
                                                            {matrixStats.grandTotal}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. PRODUCTION & DATA LINKED CARD (Unchanged) */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-emerald-50/50 px-6 py-3 border-b border-emerald-100 flex items-center gap-2">
                            <Factory className="w-4 h-4 text-emerald-600" />
                            <h3 className="font-bold text-emerald-800 text-sm uppercase tracking-wide">Données Techniques & Production</h3>
                            <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">LIVE SYNC</span>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">

                                {/* Auto Field: Temps Article */}
                                <div className="space-y-1 relative group">
                                    <div className="flex justify-between">
                                        <label className="text-xs font-bold text-slate-400 uppercase ml-1">Temps de l'article (Min)</label>
                                        <span className="text-[9px] text-emerald-500 font-bold bg-emerald-50 px-1 rounded">AUTO</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl px-3 py-3">
                                        <Clock className="w-5 h-5 text-purple-500" />
                                        <span className="text-xl font-black text-purple-700">{tempsArticle.toFixed(2)}</span>
                                        <span className="text-xs font-bold text-purple-400 mt-1">minutes</span>
                                    </div>
                                    <div className="absolute top-full left-0 w-full text-[10px] text-slate-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        Calculé depuis la gamme ({totalTime.toFixed(2)} + Majoration)
                                    </div>
                                </div>

                                {/* Linked Input: Nombre Ouvriers */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nombre d'ouvriers</label>
                                    <div className="flex items-center gap-3 bg-white border-2 border-slate-100 hover:border-indigo-300 rounded-xl px-3 py-2.5 transition-all">
                                        <Users className="w-5 h-5 text-indigo-500" />
                                        <input
                                            type="number"
                                            min="0"
                                            value={numWorkers}
                                            onChange={(e) => setNumWorkers(Math.max(0, Number(e.target.value)))}
                                            className="w-full bg-transparent text-xl font-black text-slate-700 outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Mixed: Efficiency - Demandée Removed */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 block">Performance (P°)</label>
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-emerald-600 ml-1">Réelle (Moyenne)</span>
                                            <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-2">
                                                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                                                <input
                                                    type="number"
                                                    value={efficiency}
                                                    onChange={(e) => setEfficiency(Number(e.target.value))}
                                                    className="w-full text-sm font-bold text-emerald-700 bg-transparent outline-none"
                                                />
                                                <span className="text-xs text-emerald-500 font-bold">%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Input: Chaine */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Chaîne / Ligne</label>
                                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all h-full">
                                        <Layers className="w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={data.chaine}
                                            onChange={(e) => handleChange('chaine', e.target.value)}
                                            placeholder="Ex: Ligne A, Groupe 2..."
                                            className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-300"
                                        />
                                    </div>
                                </div>

                            </div>

                            {/* Costing Footer */}
                            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-blue-500 uppercase ml-1">Coût Minute (DH)</label>
                                    <div className="flex items-center gap-2">
                                        <Coins className="w-4 h-4 text-blue-400" />
                                        <input
                                            type="number" step="0.01"
                                            value={localCostMinute}
                                            onChange={handleCostMinuteChange}
                                            className="bg-transparent font-mono font-bold text-blue-600 outline-none w-24 border-b border-blue-200 focus:border-blue-500"
                                            placeholder="0.00"
                                        />
                                        <span className="text-xs font-bold text-slate-400">DH</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Prix Client</label>
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                                        <input
                                            type="number" step="0.01"
                                            value={data.clientPrice || ''}
                                            onChange={(e) => handleChange('clientPrice', Number(e.target.value))}
                                            className="bg-transparent font-mono font-bold text-emerald-700 outline-none w-24 border-b border-slate-200 focus:border-emerald-500"
                                            placeholder="0.00"
                                        />
                                        <span className="text-xs font-bold text-slate-400">DH</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN: IMAGES & OBSERVATIONS (4 Cols) */}
                <div className="lg:col-span-4 space-y-6">

                    {/* IMAGES GRID (SIDE BY SIDE) */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* FRONT IMAGE */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col aspect-square group hover:shadow-md transition-shadow">
                            <div className="bg-slate-50/50 px-3 py-2 border-b border-slate-100 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Devant (Front)</span>
                                <button onClick={() => frontInputRef.current?.click()} className="p-1 hover:bg-slate-200 rounded text-indigo-500"><Upload className="w-3 h-3" /></button>
                            </div>
                            <div
                                className="flex-1 bg-slate-100 relative cursor-pointer overflow-hidden flex items-center justify-center"
                                onClick={() => {
                                    if (images.front) setPreviewImage({ src: images.front, title: 'Devant' });
                                    else frontInputRef.current?.click();
                                }}
                            >
                                <input type="file" ref={frontInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'front')} />
                                {isProcessingImg === 'front' ? (
                                    <div className="flex flex-col items-center gap-2 text-indigo-500">
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        <span className="text-[9px] font-bold uppercase">Compression...</span>
                                    </div>
                                ) : images.front ? (
                                    <>
                                        <img src={images.front} alt="Front" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                            <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                        <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                                        <span className="text-[10px] font-medium">Ajouter</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* BACK IMAGE */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col aspect-square group hover:shadow-md transition-shadow">
                            <div className="bg-slate-50/50 px-3 py-2 border-b border-slate-100 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Dos (Back)</span>
                                <button onClick={() => backInputRef.current?.click()} className="p-1 hover:bg-slate-200 rounded text-indigo-500"><Upload className="w-3 h-3" /></button>
                            </div>
                            <div
                                className="flex-1 bg-slate-100 relative cursor-pointer overflow-hidden flex items-center justify-center"
                                onClick={() => {
                                    if (images.back) setPreviewImage({ src: images.back, title: 'Dos' });
                                    else backInputRef.current?.click();
                                }}
                            >
                                <input type="file" ref={backInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'back')} />
                                {isProcessingImg === 'back' ? (
                                    <div className="flex flex-col items-center gap-2 text-indigo-500">
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        <span className="text-[9px] font-bold uppercase">Compression...</span>
                                    </div>
                                ) : images.back ? (
                                    <>
                                        <img src={images.back} alt="Back" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                            <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                        <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                                        <span className="text-[10px] font-medium">Ajouter</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* OBSERVATIONS */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
                        <label className="text-xs font-bold text-slate-500 uppercase mb-2">Observations (Echantillon)</label>
                        <textarea
                            rows={6}
                            value={data.observations}
                            onChange={(e) => handleChange('observations', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:bg-white transition-all resize-none"
                            placeholder="Remarques techniques, défauts tissu, instructions spéciales..."
                        />
                    </div>

                </div>
            </div>

            {/* IMAGE PREVIEW MODAL */}
            {previewImage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
                    <div className="relative max-w-4xl max-h-[90vh] w-full bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="absolute top-4 right-4 z-10">
                            <button onClick={() => setPreviewImage(null)} className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
                            <h3 className="font-bold text-lg text-slate-800">{previewImage.title}</h3>
                        </div>
                        <div className="flex-1 bg-slate-100 flex items-center justify-center p-4 overflow-auto">
                            <img src={previewImage.src} alt="Full Preview" className="max-w-full max-h-[75vh] object-contain shadow-lg rounded" />
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
