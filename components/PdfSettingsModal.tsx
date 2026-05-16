import React, { useRef, useEffect, useState } from 'react';
import { FileDown, X, Palette, Minus, Plus, Maximize, Smartphone, Monitor, Layout, Check, Grid3X3 } from 'lucide-react';
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
    children: React.ReactNode;
}

const PdfSettingsModal: React.FC<PdfSettingsModalProps> = ({
    t, darkMode, showPdfModal, setShowPdfModal,
    isGeneratingPdf, isLibLoaded, pdfSettings, setPdfSettings, generatePDF,
    children
}) => {
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Measure container for auto-scaling
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
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, [showPdfModal]);

    if (!showPdfModal) return null;

    // Calculate Scale to fit container
    const isLandscape = pdfSettings.orientation === 'landscape';
    const paperWidth = isLandscape ? 1123 : 794; // A4 dimensions in px at 96 DPI
    const paperHeight = isLandscape ? 794 : 1123;

    // Padding around the paper in the preview
    const padding = 40;
    const availableWidth = containerSize.width - padding * 2;
    const availableHeight = containerSize.height - padding * 2;

    const scaleX = availableWidth / paperWidth;
    const scaleY = availableHeight / paperHeight;
    const fitScale = Math.min(scaleX, scaleY, 1); // Never scale up more than 100% by default

    // Final display scale combines fit-to-screen and user manual zoom
    const displayScale = fitScale * pdfSettings.scale;


    return (
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center backdrop-blur-md animate-in fade-in duration-200">

            {/* Main Modal Container */}
            <div className={`w-full h-full md:w-[95vw] md:h-[90vh] md:max-w-7xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row ${darkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white'}`}>

                {/* LEFT SIDEBAR: CONTROLS */}
                <div className={`w-full md:w-80 flex-shrink-0 flex flex-col border-r z-20 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-slate-50 border-slate-200'}`}>

                    {/* Header */}
                    <div className={`p-5 border-b flex justify-between items-center ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
                        <div>
                            <h3 className={`font-bold text-lg flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                                <FileDown className="w-5 h-5 text-blue-500" />
                                {t.pdfSettings}
                            </h3>
                            <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Ajustez la mise en page avant l'impression</p>
                        </div>
                        <button onClick={() => setShowPdfModal(false)} className={`p-2 rounded-full transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-slate-200 text-slate-500'}`}>
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Scrollable Settings Area */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-8">

                        {/* 1. Orientation */}
                        <section>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-3 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                                {t.orientation}
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setPdfSettings({ ...pdfSettings, orientation: 'portrait' })}
                                    className={`relative group p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-2 ${pdfSettings.orientation === 'portrait'
                                            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                                            : 'border-transparent bg-white dark:bg-gray-750 text-slate-500 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600 shadow-sm'
                                        }`}
                                >
                                    <div className="w-8 h-10 border-2 border-current rounded-sm"></div>
                                    <span className="text-xs font-bold">{t.portrait}</span>
                                    {pdfSettings.orientation === 'portrait' && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500"></div>}
                                </button>

                                <button
                                    onClick={() => setPdfSettings({ ...pdfSettings, orientation: 'landscape' })}
                                    className={`relative group p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-2 ${pdfSettings.orientation === 'landscape'
                                            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                                            : 'border-transparent bg-white dark:bg-gray-750 text-slate-500 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600 shadow-sm'
                                        }`}
                                >
                                    <div className="w-10 h-8 border-2 border-current rounded-sm"></div>
                                    <span className="text-xs font-bold">{t.landscape}</span>
                                    {pdfSettings.orientation === 'landscape' && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500"></div>}
                                </button>
                            </div>
                        </section>

                        {/* 2. Appearance */}
                        <section>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-3 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                                {t.colorMode}
                            </label>
                            <div className={`flex rounded-lg p-1 border ${darkMode ? 'bg-gray-950 border-gray-700' : 'bg-slate-100 border-slate-200'}`}>
                                <button
                                    onClick={() => setPdfSettings({ ...pdfSettings, colorMode: 'color' })}
                                    className={`flex-1 py-2 text-xs font-bold rounded-md flex items-center justify-center gap-2 transition-all ${pdfSettings.colorMode === 'color'
                                            ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm'
                                            : 'text-slate-500 dark:text-gray-400 hover:text-slate-700'
                                        }`}
                                >
                                    <Palette className="w-3.5 h-3.5" /> {t.color}
                                </button>
                                <button
                                    onClick={() => setPdfSettings({ ...pdfSettings, colorMode: 'grayscale' })}
                                    className={`flex-1 py-2 text-xs font-bold rounded-md flex items-center justify-center gap-2 transition-all ${pdfSettings.colorMode === 'grayscale'
                                            ? 'bg-white dark:bg-gray-700 text-slate-800 dark:text-white shadow-sm'
                                            : 'text-slate-500 dark:text-gray-400 hover:text-slate-700'
                                        }`}
                                >
                                    <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-black to-white border border-gray-300"></div> {t.grayscale}
                                </button>
                            </div>
                        </section>

                        {/* 3. Scale */}
                        <section>
                            <div className="flex justify-between items-center mb-3">
                                <label className={`block text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                                    {t.zoom}
                                </label>
                                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                                    {Math.round(pdfSettings.scale * 100)}%
                                </span>
                            </div>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setPdfSettings(p => ({ ...p, scale: Math.max(0.5, p.scale - 0.1) }))}
                                    className={`p-1.5 rounded-md border transition active:scale-95 ${darkMode ? 'border-gray-600 hover:bg-gray-700 text-gray-400' : 'border-slate-200 hover:bg-white text-slate-500'}`}
                                >
                                    <Minus className="w-4 h-4" />
                                </button>

                                <div className="flex-1 relative h-6 flex items-center">
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="1.5"
                                        step="0.05"
                                        value={pdfSettings.scale}
                                        onChange={(e) => setPdfSettings({ ...pdfSettings, scale: parseFloat(e.target.value) })}
                                        className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                </div>

                                <button
                                    onClick={() => setPdfSettings(p => ({ ...p, scale: Math.min(1.5, p.scale + 0.1) }))}
                                    className={`p-1.5 rounded-md border transition active:scale-95 ${darkMode ? 'border-gray-600 hover:bg-gray-700 text-gray-400' : 'border-slate-200 hover:bg-white text-slate-500'}`}
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </section>
                    </div>

                    {/* Footer Actions */}
                    <div className={`p-5 border-t ${darkMode ? 'border-gray-700 bg-gray-850' : 'border-slate-200 bg-slate-50'}`}>
                        <button
                            onClick={() => generatePDF('save')}
                            disabled={!isLibLoaded || isGeneratingPdf}
                            className={`w-full py-4 rounded-xl font-bold text-sm shadow-lg shadow-green-500/20 flex items-center justify-center gap-2 transition-all transform active:scale-[0.98] ${isGeneratingPdf
                                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                    : 'bg-green-600 hover:bg-green-500 text-white'
                                }`}
                        >
                            {isGeneratingPdf ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                    <span>Génération en cours...</span>
                                </>
                            ) : (
                                <>
                                    <FileDown className="w-5 h-5" />
                                    <span>{t.download} PDF</span>
                                </>
                            )}
                        </button>
                        {!isLibLoaded && (
                            <p className="text-[10px] text-center mt-2 text-red-500 animate-pulse">
                                Chargement de la librairie PDF...
                            </p>
                        )}
                    </div>
                </div>

                {/* RIGHT SIDE: LIVE PREVIEW CANVAS */}
                <div className={`flex-1 relative overflow-hidden flex flex-col ${darkMode ? 'bg-gray-950' : 'bg-slate-100'}`}>

                    {/* Toolbar */}
                    <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-1 py-1 rounded-full shadow-lg border backdrop-blur-sm ${darkMode ? 'bg-gray-800/80 border-gray-600' : 'bg-white/80 border-slate-200'}`}>
                        <div className="px-3 py-1.5 text-xs font-bold flex items-center gap-2 border-r border-gray-200 dark:border-gray-600">
                            <Layout className="w-3 h-3 text-blue-500" />
                            <span className={darkMode ? 'text-gray-300' : 'text-slate-600'}>A4</span>
                        </div>
                        <div className="px-3 py-1.5 text-xs font-mono text-slate-400">
                            {paperWidth} × {paperHeight} px
                        </div>
                    </div>

                    {/* Canvas Area */}
                    <div
                        ref={containerRef}
                        className="flex-1 overflow-auto flex items-center justify-center p-10 relative cursor-grab active:cursor-grabbing"
                        style={{
                            backgroundImage: darkMode
                                ? 'radial-gradient(#374151 1px, transparent 1px)'
                                : 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                            backgroundSize: '20px 20px'
                        }}
                    >
                        {/* Paper Container with Transform */}
                        <div
                            style={{
                                width: paperWidth,
                                height: paperHeight,
                                transform: `scale(${displayScale})`,
                                transition: 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.3s, height 0.3s',
                                transformOrigin: 'center center',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                            }}
                            className={`bg-white relative overflow-hidden ${pdfSettings.colorMode === 'grayscale' ? 'grayscale' : ''}`}
                        >
                            {/* Render Children (Live Component) */}
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
