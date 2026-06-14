import React, { useRef, useEffect, useState } from 'react';
import { FileDown, X, Palette, Minus, Plus, Layout, ZoomIn, FileText, Printer, Check, FileSpreadsheet, ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
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
    /** Imprime l'aperçu A4 affiché (mêmes sections/orientation que le PDF). */
    onPrint?: () => void;
    /** Exporte la fiche en Excel (.xlsx). */
    onExcel?: () => void;
    pdfSections?: { info: boolean; nomenclature: boolean; pricing: boolean; order: boolean; notes: boolean };
    setPdfSections?: React.Dispatch<React.SetStateAction<{ info: boolean; nomenclature: boolean; pricing: boolean; order: boolean; notes: boolean }>>;
    /** Format du document : 'a4' (par défaut), 'ticket' (dimensions libres) ou 'compact'. */
    mode?: 'a4' | 'ticket' | 'compact';
    /** Dimensions du ticket en millimètres (mode 'ticket'). */
    ticketSize?: { width: number; height: number };
    setTicketSize?: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
    children: React.ReactNode;
}

const PdfSettingsModal: React.FC<PdfSettingsModalProps> = ({
    t, darkMode, showPdfModal, setShowPdfModal,
    isGeneratingPdf, isLibLoaded, pdfSettings, setPdfSettings, generatePDF,
    onPrint, onExcel, pdfSections, setPdfSections,
    mode = 'a4', ticketSize = { width: 80, height: 150 }, setTicketSize,
    children
}) => {
    const isTicket = mode === 'ticket';
    const isCompact = mode === 'compact';
    // Conversion mm → px (96 dpi) pour l'aperçu écran.
    const mmToPx = (mm: number) => Math.round((mm / 25.4) * 96);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Mode agrandi (plein écran) + glissement de la feuille (mobile), comme « Calcul Fil ».
    const [isExpanded, setIsExpanded] = useState(false);
    const [dragOffset, setDragOffset] = useState(0);
    const [dragging, setDragging] = useState(false);
    const dragStartY = useRef(0);

    // Zoom de l'aperçu (lecture du texte au téléphone) : 1 = ajusté, jusqu'à 4×.
    // Indépendant de « Échelle » (qui, elle, change la sortie PDF).
    const [previewZoom, setPreviewZoom] = useState(1);
    const clampZoom = (z: number) => Math.min(4, Math.max(1, Math.round(z * 100) / 100));
    const lastTapRef = useRef(0);
    // Pincer à 2 doigts pour zoomer (style image sur mobile).
    const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

    // Courbe d'animation « feuille iOS » : départ vif, fin douce (ressort).
    const SHEET_EASE = 'transform 0.34s cubic-bezier(0.32, 0.72, 0, 1)';

    // Glissement de la feuille (poignée + header). Style iPhone / Google :
    //  - feuille  : haut = agrandir (plein écran), bas = fermer.
    //  - agrandi  : bas = revenir à la feuille.
    const onHandleTouchStart = (e: React.TouchEvent) => { dragStartY.current = e.touches[0].clientY; setDragging(true); };
    const onHandleTouchMove = (e: React.TouchEvent) => {
        const delta = e.touches[0].clientY - dragStartY.current;
        setDragOffset(delta > 0 ? delta : 0); // ne suit le doigt que vers le bas
    };
    const onHandleTouchEnd = (e: React.TouchEvent) => {
        const delta = (e.changedTouches[0]?.clientY ?? dragStartY.current) - dragStartY.current;
        setDragging(false);
        setDragOffset(0);
        if (isExpanded) {
            if (delta >= 80) setIsExpanded(false);            // tirer vers le bas → réduire
        } else {
            if (delta <= -40) setIsExpanded(true);            // tirer vers le haut → agrandir
            else if (delta >= 100) setShowPdfModal(false);    // tirer vers le bas → fermer
        }
    };
    const dragHandlers = { onTouchStart: onHandleTouchStart, onTouchMove: onHandleTouchMove, onTouchEnd: onHandleTouchEnd };

    // Aperçu : pincer (2 doigts) pour zoomer, double-tap pour basculer ajusté/2×,
    // glisser (1 doigt) pour se déplacer (défilement natif quand l'aperçu déborde).
    const onCanvasTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchRef.current = { dist: Math.hypot(dx, dy) || 1, zoom: previewZoom };
        } else if (e.touches.length === 1) {
            const now = Date.now();
            if (now - lastTapRef.current < 300) {
                setPreviewZoom(z => (z > 1 ? 1 : 2)); // double-tap
                lastTapRef.current = 0;
            } else {
                lastTapRef.current = now;
            }
        }
    };
    const onCanvasTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && pinchRef.current) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const d = Math.hypot(dx, dy);
            setPreviewZoom(clampZoom(pinchRef.current.zoom * (d / pinchRef.current.dist)));
        }
    };
    const onCanvasTouchEnd = (e: React.TouchEvent) => {
        if (e.touches.length < 2) pinchRef.current = null;
    };

    // Glisser-déplacer (souris) pour parcourir l'aperçu en douceur, gauche/droite
    // et haut/bas, comme une image / une carte. (Le tactile utilise le défilement natif.)
    const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
    const [grabbing, setGrabbing] = useState(false);
    const onCanvasMouseDown = (e: React.MouseEvent) => {
        const el = containerRef.current;
        if (!el) return;
        panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
        setGrabbing(true);
    };
    const onCanvasMouseMove = (e: React.MouseEvent) => {
        const el = containerRef.current;
        if (!el || !panRef.current) return;
        el.scrollLeft = panRef.current.sl - (e.clientX - panRef.current.x);
        el.scrollTop = panRef.current.st - (e.clientY - panRef.current.y);
    };
    const endCanvasPan = () => { panRef.current = null; setGrabbing(false); };

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

    // Échap : réduit le plein écran, sinon ferme le modal.
    useEffect(() => {
        if (!showPdfModal) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (isExpanded) setIsExpanded(false);
            else setShowPdfModal(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showPdfModal, isExpanded, setShowPdfModal]);

    if (!showPdfModal) return null;

    const isLandscape = pdfSettings.orientation === 'landscape';
    // Ticket : dimensions libres (mm → px). A4 : format fixe selon l'orientation.
    const paperWidth = isTicket ? mmToPx(ticketSize.width) : (isLandscape ? 1123 : 794);
    const paperHeight = isTicket ? mmToPx(ticketSize.height) : (isLandscape ? 794 : 1123);

    const padding = 40;
    const availableWidth = containerSize.width - padding * 2;
    const availableHeight = containerSize.height - padding * 2;
    // Avant la première mesure du conteneur, on utilise une échelle de repli pour
    // éviter un aperçu invisible (taille 0 → échelle négative).
    const measured = availableWidth > 0 && availableHeight > 0;
    // On ajuste à la LARGEUR ET à la HAUTEUR : la feuille reste TOUJOURS visible en
    // entier (aucun défilement), aussi bien sur PC que sur mobile.
    const fitScale = measured
        ? Math.min(availableWidth / paperWidth, availableHeight / paperHeight, 1)
        : 0.62;
    // L'aperçu combine : ajustement à l'écran × échelle PDF × zoom de lecture.
    const displayScale = fitScale * pdfSettings.scale * previewZoom;
    const scaledW = paperWidth * displayScale;
    const scaledH = paperHeight * displayScale;

    return (
        <div className={`fixed inset-0 z-[110] flex justify-center bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200 ${isExpanded ? '' : 'items-end md:items-center md:p-4'}`}>

            {/* Conteneur principal — feuille (bottom sheet) sur mobile, centré sur PC,
                plein écran en mode agrandi (même logique que « Calcul Fil »). */}
            <div
                className={`shadow-2xl overflow-hidden flex flex-col ${darkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white'} ${
                    isExpanded
                        ? 'w-full h-full'
                        : 'w-full max-h-[92vh] rounded-t-2xl md:rounded-2xl md:w-[95vw] md:h-[90vh] md:max-w-6xl md:max-h-[90vh]'
                }`}
                style={{ transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined, transition: dragging ? 'none' : SHEET_EASE }}
            >

                {/* Poignée de glissement (mobile) : haut = agrandir, bas = fermer */}
                {!isExpanded && (
                    <div
                        className="md:hidden pt-2.5 pb-1.5 flex items-center justify-center shrink-0 cursor-grab touch-none active:cursor-grabbing"
                        {...dragHandlers}
                    >
                        <span className="w-10 h-1.5 rounded-full bg-slate-300" />
                    </div>
                )}

                {/* Header (calme, partagé entre les deux modes) — zone de glissement (mobile) */}
                <div
                    className={`px-4 py-3 border-b flex justify-between items-center shrink-0 md:touch-auto touch-none ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}
                    {...dragHandlers}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            onClick={() => { if (isExpanded) setIsExpanded(false); else setShowPdfModal(false); }}
                            className={`p-1.5 rounded-lg transition shrink-0 ${darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-slate-100 text-slate-500'}`}
                            title="Retour"
                            aria-label="Retour"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h3 className={`font-bold text-sm truncate ${darkMode ? 'text-white' : 'text-slate-800'}`}>{isTicket ? 'Paramètres Ticket' : isCompact ? 'Fiche Compacte' : t.pdfSettings}</h3>
                            <p className={`text-[10px] truncate ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>{isTicket ? 'Format personnalisé' : isCompact ? 'Format A4 compact' : 'Mise en page PDF'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            onClick={() => setIsExpanded(e => !e)}
                            className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-slate-100 text-slate-500'}`}
                            title={isExpanded ? 'Réduire' : 'Agrandir (plein écran)'}
                            aria-label={isExpanded ? 'Réduire' : 'Agrandir'}
                        >
                            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setShowPdfModal(false)} className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-slate-200 text-slate-500'}`} aria-label="Fermer">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Corps : contrôles + aperçu (colonne sur mobile, deux volets sur PC) */}
                <div className="flex-1 min-h-0 flex flex-col md:flex-row">

                {/* LEFT SIDEBAR - CONTROLS (passe en bas sur mobile) */}
                <div className={`order-2 md:order-1 w-full md:w-72 flex-1 md:flex-shrink-0 min-h-0 flex flex-col ${darkMode ? 'bg-gray-800 md:border-r border-gray-700' : 'bg-slate-50 md:border-r border-slate-200'}`}>

                    {/* Scrollable Settings */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-5">

                        {/* ORIENTATION (A4 uniquement) */}
                        {!isTicket && (
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
                        )}

                        {/* DIMENSIONS (ticket : largeur / hauteur libres en mm) */}
                        {isTicket && setTicketSize && (
                        <section>
                            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                                Dimensions (mm)
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {([['width', 'Largeur'], ['height', 'Hauteur']] as const).map(([key, lbl]) => (
                                    <div key={key} className={`rounded-lg border px-2.5 py-1.5 ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-slate-200 bg-white'}`}>
                                        <span className={`block text-[9px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>{lbl}</span>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number" min={20} max={2000}
                                                value={ticketSize[key]}
                                                onChange={(e) => {
                                                    const v = Math.max(20, Math.min(2000, Math.round(Number(e.target.value) || 0)));
                                                    setTicketSize(s => ({ ...s, [key]: v }));
                                                }}
                                                className={`w-full text-sm font-bold tabular-nums bg-transparent outline-none ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}
                                                aria-label={`${lbl} du ticket en mm`}
                                            />
                                            <span className="text-[10px] text-slate-400">mm</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Préréglages rapides */}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {([
                                    ['58 mm', { width: 58, height: 150 }],
                                    ['80 mm', { width: 80, height: 150 }],
                                    ['1:1', { width: ticketSize.width, height: ticketSize.width }],
                                ] as const).map(([lbl, val]) => (
                                    <button
                                        key={lbl}
                                        type="button"
                                        onClick={() => setTicketSize(val)}
                                        className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors ${darkMode ? 'border-gray-700 text-gray-300 hover:bg-gray-700' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        {lbl}
                                    </button>
                                ))}
                            </div>
                        </section>
                        )}

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
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            {onPrint && (
                                <button
                                    onClick={onPrint}
                                    className={`py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] border ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-100 hover:bg-gray-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                >
                                    <Printer className="w-4 h-4" />
                                    <span>Imprimer</span>
                                </button>
                            )}
                            {onExcel && !isTicket && (
                                <button
                                    onClick={onExcel}
                                    className={`py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] border ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-100 hover:bg-gray-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                >
                                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                                    <span>Excel</span>
                                </button>
                            )}
                        </div>
                        {!isLibLoaded && (
                            <p className="text-[9px] text-center mt-1.5 text-amber-500">
                                Chargement de la librairie...
                            </p>
                        )}
                    </div>
                </div>

                {/* RIGHT - LIVE PREVIEW (passe EN HAUT sur mobile) */}
                <div className={`order-1 md:order-2 flex-shrink-0 h-[52vh] md:h-auto md:flex-1 relative overflow-hidden flex flex-col ${darkMode ? 'bg-gray-950' : 'bg-slate-100'}`}>

                    {/* Top Toolbar — format + zoom de lecture */}
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 px-1.5 py-1 rounded-full shadow-md border bg-white/90 backdrop-blur-sm border-slate-200">
                        <div className="px-2 py-0.5 text-[10px] font-bold flex items-center gap-1.5 border-r border-slate-200">
                            <Layout className="w-3 h-3 text-blue-500" />
                            <span className="text-slate-700">{isTicket ? 'Ticket' : isCompact ? 'Compact' : 'A4'}</span>
                        </div>
                        <button onClick={() => setPreviewZoom(z => clampZoom(z - 0.25))} disabled={previewZoom <= 1} className="p-1 rounded-full hover:bg-slate-100 text-slate-500 disabled:opacity-30 transition" title="Dézoomer" aria-label="Dézoomer">
                            <Minus className="w-3 h-3" />
                        </button>
                        <button onClick={() => setPreviewZoom(1)} className="px-1 text-[10px] font-mono font-bold text-slate-600 hover:text-blue-600 transition min-w-[36px] text-center" title="Réinitialiser le zoom">
                            {Math.round(previewZoom * 100)}%
                        </button>
                        <button onClick={() => setPreviewZoom(z => clampZoom(z + 0.25))} disabled={previewZoom >= 4} className="p-1 rounded-full hover:bg-slate-100 text-slate-500 disabled:opacity-30 transition" title="Zoomer" aria-label="Zoomer">
                            <Plus className="w-3 h-3" />
                        </button>
                        <span className="hidden md:inline px-2 py-0.5 text-[10px] font-mono text-slate-400 border-l border-slate-200">
                            {isTicket ? `${ticketSize.width} × ${ticketSize.height}mm` : isCompact ? 'A4 Compact' : `${paperWidth} × ${paperHeight}px`}
                        </span>
                    </div>

                    {/* Canvas Area — défilement (1 doigt) + pincer / double-tap pour zoomer */}
                    <div
                        ref={containerRef}
                        className={`flex-1 overflow-auto relative select-none ${grabbing ? 'cursor-grabbing' : 'cursor-grab'}`}
                        onTouchStart={onCanvasTouchStart}
                        onTouchMove={onCanvasTouchMove}
                        onTouchEnd={onCanvasTouchEnd}
                        onMouseDown={onCanvasMouseDown}
                        onMouseMove={onCanvasMouseMove}
                        onMouseUp={endCanvasPan}
                        onMouseLeave={endCanvasPan}
                        style={{
                            touchAction: 'pan-x pan-y',
                            WebkitOverflowScrolling: 'touch',
                            scrollBehavior: grabbing ? 'auto' : 'smooth',
                            backgroundImage: darkMode
                                ? 'radial-gradient(#374151 1px, transparent 1px)'
                                : 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                            backgroundSize: '16px 16px'
                        }}
                    >
                        {/* Enveloppe : centre la feuille quand elle tient, et permet le
                            défilement (pan) quand le zoom la fait déborder. */}
                        <div className="min-w-full min-h-full flex items-center justify-center p-3 md:p-6">
                            {/* Cadre qui réserve la place exacte de la feuille mise à l'échelle. */}
                            <div style={{ width: scaledW, height: scaledH, position: 'relative', flex: '0 0 auto' }}>
                                {/* Paper */}
                                <div
                                    id="pdf-print-area"
                                    style={{
                                        width: paperWidth,
                                        height: paperHeight,
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        transform: `scale(${displayScale})`,
                                        transformOrigin: 'top left',
                                        boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.2)'
                                    }}
                                    className={`bg-white overflow-hidden ${pdfSettings.colorMode === 'grayscale' ? 'grayscale' : ''}`}
                                >
                                    <div className="w-full h-full pointer-events-none select-none">
                                        {children}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </div>
        </div>
    );
};

export default PdfSettingsModal;
