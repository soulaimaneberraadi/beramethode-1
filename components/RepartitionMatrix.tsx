import React, { useState, useMemo, useEffect } from 'react';
import { Grid3X3, Plus, X, Trash2, Palette } from 'lucide-react';
import { FicheData } from '../types';
import { TEXTILE_COLORS } from '../data/textileData';
import ExcelInput from './ExcelInput';
import { tx, pickT } from '../lib/i18n';
import type { Lang } from '../app/constants';

interface RepartitionMatrixProps {
    data: FicheData;
    setData: React.Dispatch<React.SetStateAction<FicheData>>;
    lang?: Lang;
    /** Quand true, met Ã  jour data.quantity avec le total de la grille (Pedido le gÃ¨re dÃ©jÃ  de son cÃ´tÃ©). */
    syncQuantity?: boolean;
}

/**
 * Carte Â« RÃ©partition (Tailles / Couleurs) Â» rÃ©utilisable.
 * Source unique de la grille couleurs Ã— tailles, partagÃ©e par Pedido et Fiche Technique.
 * Les donnÃ©es vivent dans FicheData (sizes / colors / gridQuantities) â†’ Ã©dition synchronisÃ©e partout.
 */
export default function RepartitionMatrix({ data, setData, lang = 'fr', syncQuantity = true }: RepartitionMatrixProps) {
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

    const gridQuantities = data.gridQuantities || {};
    const setGridQuantities = (updater: React.SetStateAction<Record<string, number>>) => {
        setData(prev => ({
            ...prev,
            gridQuantities: typeof updater === 'function' ? updater(prev.gridQuantities || {}) : updater
        }));
    };

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

    // Met Ã  jour la quantitÃ© globale du modÃ¨le quand la matrice change.
    useEffect(() => {
        if (syncQuantity && matrixStats.grandTotal > 0) {
            setData(prev => (prev.quantity === matrixStats.grandTotal ? prev : { ...prev, quantity: matrixStats.grandTotal }));
        }
    }, [syncQuantity, matrixStats.grandTotal, setData]);

    // Nettoie les couleurs en double (mÃªme id) hÃ©ritÃ©es d'anciens modÃ¨les. Les
    // doublons partagent la mÃªme grille (clÃ©s `${id}_${taille}`), donc supprimer
    // l'entrÃ©e redondante ne perd aucune quantitÃ© et corrige le total double-comptÃ©.
    useEffect(() => {
        setData(prev => {
            const cols = prev.colors || [];
            const seen = new Set<string>();
            const deduped = cols.filter(c => {
                if (seen.has(c.id)) return false;
                seen.add(c.id);
                return true;
            });
            return deduped.length === cols.length ? prev : { ...prev, colors: deduped };
        });
    }, [data.colors, setData]);

    const addSize = () => {
        if (!newSizeInput.trim()) return;
        const newSizes = newSizeInput.split(/[\s,]+/).filter(s => s.trim() !== '');
        setSizes(prev => [...prev, ...newSizes]);
        setNewSizeInput('');
    };

    const removeSize = (index: number) => {
        setSizes(prev => prev.filter((_, i) => i !== index));
    };

    const addColor = () => {
        if (!newColorInput.trim()) return;
        setColors(prev => [...prev, { id: Date.now().toString(), name: newColorInput.trim() }]);
        setNewColorInput('');
    };

    const hexToColorName = (hex: string): string => {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        const namedColors: { name: string; r: number; g: number; b: number }[] = [
            { name: 'Noir', r: 0, g: 0, b: 0 },
            { name: 'Blanc', r: 255, g: 255, b: 255 },
            { name: 'Rouge', r: 255, g: 0, b: 0 },
            { name: 'Rouge FoncÃ©', r: 139, g: 0, b: 0 },
            { name: 'Bordeaux', r: 128, g: 0, b: 32 },
            { name: 'Cramoisi', r: 220, g: 20, b: 60 },
            { name: 'Rose', r: 255, g: 105, b: 180 },
            { name: 'Rose Clair', r: 255, g: 182, b: 193 },
            { name: 'Fuchsia', r: 255, g: 0, b: 255 },
            { name: 'Orange', r: 255, g: 165, b: 0 },
            { name: 'Orange FoncÃ©', r: 255, g: 140, b: 0 },
            { name: 'Corail', r: 255, g: 127, b: 80 },
            { name: 'Saumon', r: 250, g: 128, b: 114 },
            { name: 'Jaune', r: 255, g: 255, b: 0 },
            { name: 'Jaune DorÃ©', r: 255, g: 215, b: 0 },
            { name: 'Jaune PÃ¢le', r: 255, g: 255, b: 224 },
            { name: 'Vert', r: 0, g: 128, b: 0 },
            { name: 'Vert Clair', r: 144, g: 238, b: 144 },
            { name: 'Vert FoncÃ©', r: 0, g: 100, b: 0 },
            { name: 'Vert Ã‰meraude', r: 16, g: 185, b: 129 },
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
            { name: 'CrÃ¨me', r: 255, g: 253, b: 208 },
            { name: 'Ivoire', r: 255, g: 255, b: 240 },
            { name: 'Gris', r: 128, g: 128, b: 128 },
            { name: 'Gris Clair', r: 192, g: 192, b: 192 },
            { name: 'Gris FoncÃ©', r: 64, g: 64, b: 64 },
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
        // MÃªme hex = mÃªme couleur (id = hex) : on Ã©vite d'ajouter un doublon.
        const detectedName = hexToColorName(hex);
        setColors(prev => prev.some(c => c.id === hex) ? prev : [...prev, { id: hex, name: detectedName }]);
    };

    const removeColor = (id: string) => {
        setColors(prev => prev.filter(c => c.id !== id));
        const newQ = { ...gridQuantities };
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
        <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-dk-bg/50 px-6 py-4 border-b border-slate-150 flex flex-wrap items-end justify-between gap-3">
                <label className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase flex items-center gap-2">
                    <Grid3X3 className="w-3.5 h-3.5 text-indigo-500" />
                    {tx(lang, { fr: 'RÃ©partition (Tailles / Couleurs)', ar: 'ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ù…Ù‚Ø§Ø³Ø§Øª ÙˆØ§Ù„Ø£Ù„ÙˆØ§Ù†', en: 'Distribution (Sizes / Colors)', es: 'DistribuciÃ³n (Tallas / Colores)', pt: 'DistribuiÃ§Ã£o (Tamanhos / Cores)', tr: 'DaÄŸÄ±lÄ±m (Bedenler / Renkler)' })}
                </label>

                {/* ADD SIZE INPUT */}
                <div className="flex items-center bg-slate-100 dark:bg-dk-elevated rounded-lg p-1 border border-slate-200 dark:border-dk-border font-sans">
                    <input
                        type="text"
                        placeholder={tx(lang, { fr: 'Ajouter Tailles (ex: 36 38 40)', ar: 'Ø£Ø¶Ù Ù…Ù‚Ø§Ø³Ø§Øª (Ù…Ø«Ø§Ù„: 36 38)', en: 'Add Sizes (e.g. 36 38 40)', es: 'AÃ±adir Tallas (ej: 36 38 40)', pt: 'Adicionar Tamanhos (ex: 36 38 40)', tr: 'Beden Ekle (Ã¶rn: 36 38 40)' })}
                        className="bg-transparent text-xs px-2 outline-none w-48 text-slate-700 dark:text-dk-text-soft placeholder:text-slate-400 font-semibold"
                        value={newSizeInput}
                        onChange={(e) => setNewSizeInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addSize()}
                    />
                    <button onClick={addSize} className="bg-white dark:bg-dk-surface rounded p-1 shadow-sm dark:shadow-dk-sm hover:text-indigo-600 dark:text-dk-accent-text transition-colors">
                        <Plus className="w-3 h-3" />
                    </button>
                </div>
            </div>

            <div className="p-6 space-y-4">
                <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden flex flex-col">
                    {/* ADD COLOR INPUT */}
                    <div className="bg-slate-50 dark:bg-dk-bg p-2.5 border-b border-slate-200 dark:border-dk-border flex flex-wrap gap-2 items-center font-sans">
                        <label className="relative flex items-center justify-center cursor-pointer shrink-0 animate-in fade-in" title="Choisir une couleur">
                            <input
                                type="color"
                                value={pickedHexColor}
                                onChange={(e) => setPickedHexColor(e.target.value)}
                                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                            />
                            <div className="w-6 h-6 rounded-md border-2 border-slate-300 shadow-sm dark:shadow-dk-sm cursor-pointer hover:scale-110 transition-transform" style={{ backgroundColor: pickedHexColor }}></div>
                        </label>
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:text-dk-accent-text text-[11px] font-black rounded-md whitespace-nowrap">
                            {hexToColorName(pickedHexColor)}
                        </span>
                        <div className="relative flex-1 min-w-[120px] flex items-center bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg focus-within:border-indigo-400 px-3 h-7">
                            <Palette className="w-3 h-3 text-slate-400 dark:text-dk-muted mr-2 z-20 relative shrink-0" />
                            <ExcelInput
                                suggestions={TEXTILE_COLORS.map(c => c.value)}
                                placeholder="Nom couleur (ou laisser auto)..."
                                className="text-xs font-bold text-slate-700 dark:text-dk-text-soft outline-none w-full pl-6 pr-2"
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
                        <button
                            onClick={() => {
                                if (newColorInput.trim()) addColor();
                                else addVisualColor(pickedHexColor);
                            }}
                            className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors z-20 h-7"
                        >
                            <Plus className="w-3 h-3" /> {tx(lang, { fr: 'Ajouter', ar: 'Ø¥Ø¶Ø§ÙØ©', en: 'Add', es: 'AÃ±adir', pt: 'Adicionar', tr: 'Ekle' })}
                        </button>
                    </div>

                    {/* THE GRID */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border-b border-slate-200 dark:border-dk-border font-sans">
                                    <th className="py-3 px-3 text-left font-bold border-r border-slate-200 dark:border-dk-border min-w-[120px]">Couleur \ Taille</th>
                                    {sizes.length === 0 && (
                                        <th className="py-2 px-4 text-center font-normal italic text-slate-400 dark:text-dk-muted border-r border-slate-200 dark:border-dk-border min-w-[100px]">
                                            (Ajouter tailles)
                                        </th>
                                    )}
                                    {sizes.map((s, i) => (
                                        <th key={i} className="py-2 px-2 text-center font-bold border-r border-slate-200 dark:border-dk-border min-w-[50px] relative group">
                                            {s}
                                            <button
                                                onClick={() => removeSize(i)}
                                                className="absolute top-0 right-0 p-0.5 text-slate-300 dark:text-dk-muted hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Supprimer Taille"
                                            >
                                                <X className="w-2.5 h-2.5" />
                                            </button>
                                        </th>
                                    ))}
                                    <th className="py-2 px-3 text-center font-black bg-slate-200 text-slate-800 dark:text-dk-text w-20">TOTAL</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {colors.length === 0 && (
                                    <tr>
                                        <td colSpan={sizes.length + (sizes.length === 0 ? 3 : 2)} className="py-8 text-center text-slate-400 dark:text-dk-muted italic font-sans">
                                            {tx(lang, { fr: 'Ajoutez des couleurs pour commencer la rÃ©partition.', ar: 'Ø£Ø¶Ù Ø£Ù„ÙˆØ§Ù†Ù‹Ø§ Ù„Ù„Ø¨Ø¯Ø¡ ÙÙŠ ØªÙ‚Ø³ÙŠÙ… Ø§Ù„ÙƒÙ…ÙŠØ§Øª.', en: 'Add colors to start the distribution.', es: 'AÃ±ada colores para comenzar la distribuciÃ³n.', pt: 'Adicione cores para iniciar a distribuiÃ§Ã£o.', tr: 'DaÄŸÄ±lÄ±ma baÅŸlamak iÃ§in renk ekleyin.' })}
                                        </td>
                                    </tr>
                                )}
                                {colors.map((c, cIdx) => (
                                    <tr key={`${c.id}-${cIdx}`} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60 group">
                                        <td className="py-2 px-3 border-r border-slate-200 dark:border-dk-border font-bold text-slate-700 dark:text-dk-text-soft flex justify-between items-center font-sans">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm dark:shadow-dk-sm ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                    style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                />
                                                <span className="truncate max-w-[150px]" title={c.name}>
                                                    {c.id && c.id.startsWith('#') && (c.name.includes('personnalisÃ©') || c.name.startsWith('#') || c.name.includes('rgb(') || c.name.includes('Couleur P'))
                                                        ? hexToColorName(c.id)
                                                        : c.name}
                                                </span>
                                            </div>
                                            <button onClick={() => removeColor(c.id)} className="text-slate-300 dark:text-dk-muted hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                        {sizes.length === 0 && (
                                            <td className="p-2 border-r border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/30 text-center text-slate-300 dark:text-dk-muted text-[10px] italic">
                                                -
                                            </td>
                                        )}
                                        {sizes.map((s, sIdx) => {
                                            const key = `${c.id}_${sIdx}`;
                                            const val = gridQuantities[key] || '';
                                            return (
                                                <td key={sIdx} className="p-0 border-r border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        className="w-full h-full text-center py-2.5 bg-transparent outline-none focus:bg-indigo-50 dark:bg-dk-accent/20 focus:text-indigo-700 dark:text-dk-accent-text transition-colors font-mono font-semibold placeholder:text-slate-200"
                                                        placeholder="0"
                                                        value={val}
                                                        onChange={(e) => updateQuantity(c.id, sIdx, e.target.value)}
                                                    />
                                                </td>
                                            );
                                        })}
                                        <td className="py-2 px-3 text-center font-bold text-slate-700 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-bg border-l border-slate-200 dark:border-dk-border font-mono">
                                            {matrixStats.rowTotals[c.id]}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {colors.length > 0 && (
                                <tfoot className="border-t-2 border-slate-200 dark:border-dk-border font-bold bg-slate-50 dark:bg-dk-bg font-sans">
                                    <tr>
                                        <td className="py-2 px-3 text-right uppercase text-[10px] tracking-wider text-slate-500 dark:text-dk-muted border-r border-slate-200 dark:border-dk-border">Total</td>
                                        {sizes.length === 0 && (
                                            <td className="py-2 px-2 text-center text-slate-700 dark:text-dk-text-soft border-r border-slate-200 dark:border-dk-border">-</td>
                                        )}
                                        {sizes.map((_, sIdx) => (
                                            <td key={sIdx} className="py-2 px-2 text-center text-slate-700 dark:text-dk-text-soft border-r border-slate-200 dark:border-dk-border font-mono">
                                                {matrixStats.colTotals[sIdx] || 0}
                                            </td>
                                        ))}
                                        <td className="py-2 px-3 text-center bg-indigo-600 dark:bg-dk-accent text-white font-black text-sm font-mono">
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
    );
}
