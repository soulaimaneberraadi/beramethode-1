import React, { useRef, useEffect, useState } from 'react';
import { FileDown, X, Palette, Minus, Plus, Layout, ZoomIn, FileText, Printer, Check } from 'lucide-react';
import { PdfSettings } from '../types';

interface PdfSettingsModalProps {
    t: any;
    darkMode: boolean;
    showPdfModal: boolean;
    setShowPdfModal: (v: boolean) => void;
    isGeneratingPdf: boolean;
    isLibLoaded: boolean;
    pdfSettings: PdfSettings;
    setPdfSettings: React.Dispatch<React.SetStateAction<PdfSettings>>;
    generatePDF: (action: 'save' | 'preview') => void;
    pdfSections?: { info: boolean; nomenclature: boolean; pricing: boolean; order: boolean; notes: boolean };
    setPdfSections?: React.Dispatch<React.SetStateAction<{ info: boolean; nomenclature: boolean; pricing: boolean; order: boolean; notes: boolean }>>;
    children: React.ReactNode;
}

const PdfSettingsModal: React.FC<PdfSettingsModalProps> = ({
    t, darkMode, showPdfModal, setShowPdfModal,
    isGeneratingPdf, isLibLoaded, pdfSettings, setPdfSettings, generatePDF,
    pdfSections, setPdfSections,
    children
}) => {
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showPdfModal) return;
        const updateSize = () => {
            if (containerRef.current) {
                setContainerSize({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight
                });
            }
        };
        updateSize();
        // Le conteneur peut avoir une taille 0 au premier rendu (animation/layout) :
        // un ResizeObserver garantit une mise à l'échelle correcte dès qu'il est mesuré.
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
        if (ro && containerRef.current) ro.observe(containerRef.current);
        const raf = requestAnimationFrame(updateSize);
        window.addEventListener('resize', updateSize);
        return () => {
            window.removeEventListener('resize', updateSize);
            cancelAnimationFrame(raf);
            if (ro) ro.disconnect();
        };
    }, [showPdfModal]);

    if (!showPdfModal) return null;

    const isLandscape = pdfSettings.orientation === 'landscape';
    const paperWidth = isLandscape ? 1123 : 794;
    const paperHeight = isLandscape ? 794 : 1123;

    const padding = 40;
    const availableWidth = containerSize.width - padding * 2;
    const availableHeight = containerSize.height - padding * 2;
    // Avant la première mesure du conteneur, on utilise une échelle de repli pour
    // éviter un aperçu invisible (taille 0 → échelle négative).
    const measured = availableWidth > 0 && availableHeight > 0;
    const fitScale = measured
        ? Math.min(availableWidth / paperWidth, availableHeight / paperHeight, 1)
        : 0.62;
    const displayScale = fitScale * pdfSettings.scale;

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center animate-in fade-in duration-200">

            {/* Main Container */}
            <div className={`w-full h-full md:w-[95vw] md:h-[90vh] md:max-w-6xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row ${darkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white'}`}>

                {/* LEFT SIDEBAR - CONTROLS */}
                <div className={`w-full md:w-72 flex-shrink-0 flex flex-col ${darkMode ? 'bg-gray-800 border-r border-gray-700' : 'bg-slate-50 border-r border-slate-200'}`}>

                    {/* Header */}
                    <div className={`px-4 py-3 border-b flex justify-between items-center ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                                <FileText className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <h3 className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                                    {t.pdfSettings}
                                </h3>
                                <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Mise en page PDF</p>
                            </div>
                        </div>
                        <button onClick={() => setShowPdfModal(false)} className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-slate-200 text-slate-500'}`}>
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Scrollable Settings */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-5">

                        {/* ORIENTATION */}
                        <section>
                            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                                Orientation
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setPdfSettings({ ...pdfSettings, orientation: 'portrait' })}
                                    className={`relative p-2.5 rounded-lg border-2 transition-all flex flex-col items-center gap-1.5 ${pdfSettings.orientation === 'portrait'
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                            : darkMode
                                            ? 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                                        }`}
                                >
                                    <div className="w-6 h-8 border-2 border-current rounded-sm"></div>
                                    <span className="text-[10px] font-bold">Portrait</span>
                                    {pdfSettings.orientation === 'portrait' && (
                                        <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center">
                                            <Check className="w-2 h-2 text-white" />
                                        </div>
                                    )}
                                </button>
                                <button
                                    onClick={() => setPdfSettings({ ...pdfSettings, orientation: 'landscape' })}
                                    className={`relative p-2.5 rounded-lg border-2 transition-all flex flex-col items-center gap-1.5 ${pdfSettings.orientation === 'landscape'
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                            : darkMode
                                            ? 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                                        }`}
                                >
                                    <div className="w-8 h-6 border-2 border-current rounded-sm"></div>
                                    <span className="text-[10px] font-bold">Paysage</span>
                                    {pdfSettings.orientation === 'landscape' && (
                                        <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center">
                                            <Check className="w-2 h-2 text-white" />
                                        </div>
                                    )}
                                </button>
                            </div>
                        </section>

                        {/* COLOR MODE */}
                        <section>
                            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                                Couleurs
                            </label>
                            <div className={`flex rounded-lg p-1 ${darkMode ? 'bg-gray-900' : 'bg-slate-100'}`}>
                                <button
                                    onClick={() => setPdfSettings({ ...pdfSettings, colorMode: 'color' })}
                                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${pdfSettings.colorMode === 'color'
                                            ? darkMode
                                                ? 'bg-gray-700 text-purple-400 shadow-sm'
                                                : 'bg-white text-purple-600 shadow-sm'
                                            : darkMode
                                            ? 'text-gray-400'
                                            : 'text-slate-500'
                                        }`}
                                >
                                    <Palette className="w-3 h-3" /> Couleur
                                </button>
                                <button
                                    onClick={() => setPdfSettings({ ...pdfSettings, colorMode: 'grayscale' })}
                                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${pdfSettings.colorMode === 'grayscale'
                                            ? darkMode
                                                ? 'bg-gray-700 text-white shadow-sm'
                                                : 'bg-white text-slate-800 shadow-sm'
                                            : darkMode
                                            ? 'text-gray-400'
                                            : 'text-slate-500'
                                        }`}
                                >
                                    <div className="w-3 h-3 rounded-full bg-gradient-to-tr from-black to-white border border-gray-300"></div> N&B
                                </button>
                            </div>
                        </section>

                        {/* SCALE */}
                        <section>
                            <div className="flex justify-between items-center mb-2">
                                <label className={`block text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                                    Échelle
                                </label>
                                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                                    {Math.round(pdfSettings.scale * 100)}%
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPdfSettings(p => ({ ...p, scale: Math.max(0.5, p.scale - 0.1) }))}
                                    className={`p-1.5 rounded-md border transition active:scale-95 ${darkMode ? 'border-gray-600 hover:bg-gray-700 text-gray-400' : 'border-slate-200 hover:bg-white text-slate-500'}`}
                                >
                                    <Minus className="w-3 h-3" />
                                </button>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="1.5"
                                    step="0.05"
                                    value={pdfSettings.scale}
                                    onChange={(e) => setPdfSettings({ ...pdfSettings, scale: parseFloat(e.target.value) })}
                                    className="flex-1 h-1 bg-slate-200 dark:bg-gray-700 rounded appearance-none cursor-pointer accent-blue-600"
                                />
                                <button
                                    onClick={() => setPdfSettings(p => ({ ...p, scale: Math.min(1.5, p.scale + 0.1) }))}
                                    className={`p-1.5 rounded-md border transition active:scale-95 ${darkMode ? 'border-gray-600 hover:bg-gray-700 text-gray-400' : 'border-slate-200 hover:bg-white text-slate-500'}`}
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            </div>
                        </section>

                        {/* SECTIONS À AFFICHER */}
                        {pdfSections && setPdfSections && (
                            <section>
                                <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                                    Sections à afficher
                                </label>
                                <div className="space-y-1.5">
                                    {([
                                        ['info', 'Infos modèle & image'],
                                        ['nomenclature', 'Nomenclature (matières)'],
                                        ['pricing', 'Prix & marges'],
                                        ['order', 'Besoins commande'],
                                        ['notes', 'Notes & signatures'],
                                    ] as const).map(([key, label]) => (
                                        <label key={key} className="flex items-center justify-between gap-2 cursor-pointer select-none">
                                            <span className={`text-[11px] font-medium ${darkMode ? 'text-gray-300' : 'text-slate-600'}`}>{label}</span>
                                            <button
                                                type="button"
                                                onClick={() => setPdfSections(p => ({ ...p, [key]: !p[key] }))}
                                                className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${pdfSections[key] ? 'bg-blue-500' : darkMode ? 'bg-gray-600' : 'bg-slate-300'}`}
                                                aria-pressed={pdfSections[key]}
                                            >
                                                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${pdfSections[key] ? 'left-[18px]' : 'left-0.5'}`} />
                                            </button>
                                        </label>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* INFO CARD */}
                        <section className={`p-3 rounded-lg ${darkMode ? 'bg-blue-900/20 border border-blue-800/30' : 'bg-blue-50 border border-blue-100'}`}>
                            <div className="flex items-start gap-2">
                                <ZoomIn className={`w-3.5 h-3.5 mt-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                                <div>
                                    <p className={`text-[10px] font-bold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>Aperçu en direct</p>
                                    <p className={`text-[9px] mt-0.5 ${darkMode ? 'text-blue-400/70' : 'text-blue-600/70'}`}>
                                        Les modifications sont appliquées instantanément à l'aperçu
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Footer Actions */}
                    <div className={`p-3 border-t ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
                        <button
                            onClick={() => generatePDF('save')}
                            disabled={!isLibLoaded || isGeneratingPdf}
                            className={`w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${isGeneratingPdf
                                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-md'
                                }`}
                        >
                            {isGeneratingPdf ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                    <span>Génération...</span>
                                </>
                            ) : (
                                <>
                                    <FileDown className="w-4 h-4" />
                                    <span>Télécharger PDF</span>
                                </>
                            )}
                        </button>
                        {!isLibLoaded && (
                            <p className="text-[9px] text-center mt-1.5 text-amber-500">
                                Chargement de la librairie...
                            </p>
                        )}
                    </div>
                </div>

                {/* RIGHT - LIVE PREVIEW */}
                <div className={`flex-1 relative overflow-hidden flex flex-col ${darkMode ? 'bg-gray-950' : 'bg-slate-100'}`}>

                    {/* Top Toolbar */}
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full shadow-md border bg-white/90 backdrop-blur-sm border-slate-200">
                        <div className="px-2 py-0.5 text-[10px] font-bold flex items-center gap-1.5 border-r border-slate-200">
                            <Layout className="w-3 h-3 text-blue-500" />
                            <span className="text-slate-700">A4</span>
                        </div>
                        <div className="px-2 py-0.5 text-[10px] font-mono text-slate-500">
                            {paperWidth} × {paperHeight}px
                        </div>
                    </div>

                    {/* Canvas Area */}
                    <div
                        ref={containerRef}
                        className="flex-1 overflow-auto flex items-center justify-center p-6 relative"
                        style={{
                            backgroundImage: darkMode
                                ? 'radial-gradient(#374151 1px, transparent 1px)'
                                : 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                            backgroundSize: '16px 16px'
                        }}
                    >
                        {/* Paper */}
                        <div
                            style={{
                                width: paperWidth,
                                height: paperHeight,
                                transform: `scale(${displayScale})`,
                                transition: 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.3s, height 0.3s',
                                transformOrigin: 'center center',
                                boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.2)'
                            }}
                            className={`bg-white relative overflow-hidden ${pdfSettings.colorMode === 'grayscale' ? 'grayscale' : ''}`}
                        >
                            <div className="w-full h-full pointer-events-none select-none">
                                {children}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PdfSettingsModal;
