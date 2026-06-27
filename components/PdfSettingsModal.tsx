import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FileDown, X, Palette, Minus, Plus, Layout, ZoomIn, FileText, Printer, Check, FileSpreadsheet, ArrowLeft, Maximize2, Minimize2, ChevronLeft, ChevronRight } from 'lucide-react';
import { PdfSettings } from '../types';
import { tx, type TxMap } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

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
    onPrint?: () => void;
    onExcel?: () => void;
    pdfSections?: { info: boolean; nomenclature: boolean; pricing: boolean; order: boolean; notes: boolean };
    setPdfSections?: React.Dispatch<React.SetStateAction<{ info: boolean; nomenclature: boolean; pricing: boolean; order: boolean; notes: boolean }>>;
    mode?: 'a4' | 'ticket' | 'compact';
    ticketSize?: { width: number; height: number };
    setTicketSize?: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
    totalPages?: number;
    children: React.ReactNode;
}

const PdfSettingsModal: React.FC<PdfSettingsModalProps> = ({
    t, darkMode, showPdfModal, setShowPdfModal,
    isGeneratingPdf, isLibLoaded, pdfSettings, setPdfSettings, generatePDF,
    onPrint, onExcel, pdfSections, setPdfSections,
    mode = 'a4', ticketSize = { width: 80, height: 150 }, setTicketSize,
    totalPages = 1,
    children
}) => {
    const { lang } = useLang();
    const _ = useCallback((m: TxMap) => tx(lang, m), [lang]);
    const isTicket = mode === 'ticket';
    const isCompact = mode === 'compact';
    const mmToPx = (mm: number) => Math.round((mm / 25.4) * 96);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const [isExpanded, setIsExpanded] = useState(false);
    const [dragOffset, setDragOffset] = useState(0);
    const [dragging, setDragging] = useState(false);
    const dragStartY = useRef(0);

    const [previewZoom, setPreviewZoom] = useState(1);
    const [activePage, setActivePage] = useState(1);
    const clampZoom = (z: number) => Math.min(4, Math.max(1, Math.round(z * 100) / 100));
    const lastTapRef = useRef(0);
    const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
    const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        if (showPdfModal) {
            setActivePage(1);
        }
    }, [showPdfModal]);

    const SHEET_EASE = 'transform 0.34s cubic-bezier(0.32, 0.72, 0, 1)';

    const onHandleTouchStart = (e: React.TouchEvent) => { dragStartY.current = e.touches[0].clientY; setDragging(true); };
    const onHandleTouchMove = (e: React.TouchEvent) => {
        const delta = e.touches[0].clientY - dragStartY.current;
        setDragOffset(delta > 0 ? delta : 0);
    };
    const onHandleTouchEnd = (e: React.TouchEvent) => {
        const delta = (e.changedTouches[0]?.clientY ?? dragStartY.current) - dragStartY.current;
        setDragging(false);
        setDragOffset(0);
        if (isExpanded) {
            if (delta >= 80) setIsExpanded(false);
        } else {
            if (delta <= -40) setIsExpanded(true);
            else if (delta >= 100) setShowPdfModal(false);
        }
    };
    const dragHandlers = { onTouchStart: onHandleTouchStart, onTouchMove: onHandleTouchMove, onTouchEnd: onHandleTouchEnd };

    const onCanvasTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchRef.current = { dist: Math.hypot(dx, dy) || 1, zoom: previewZoom };
        } else if (e.touches.length === 1) {
            swipeStartRef.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            };

            const now = Date.now();
            if (now - lastTapRef.current < 300) {
                setPreviewZoom(z => (z > 1 ? 1 : 2));
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

        if (swipeStartRef.current && e.changedTouches.length === 1 && previewZoom === 1) {
            const deltaX = e.changedTouches[0].clientX - swipeStartRef.current.x;
            const deltaY = e.changedTouches[0].clientY - swipeStartRef.current.y;

            if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 40) {
                if (deltaX < 0) {
                    setActivePage(p => Math.min(totalPages, p + 1));
                } else {
                    setActivePage(p => Math.max(1, p - 1));
                }
            }
        }
        swipeStartRef.current = null;
    };

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
    const paperWidth = isTicket ? mmToPx(ticketSize.width) : (isLandscape ? 1123 : 794);
    const paperHeight = isTicket ? mmToPx(ticketSize.height) : (isLandscape ? 794 : 1123);

    const padding = 40;
    const availableWidth = containerSize.width - padding * 2;
    const availableHeight = containerSize.height - padding * 2;
    const measured = availableWidth > 0 && availableHeight > 0;
    const fitScale = measured
        ? Math.min(availableWidth / paperWidth, availableHeight / paperHeight, 1)
        : 0.62;
    const displayScale = fitScale * pdfSettings.scale * previewZoom;
    const scaledW = paperWidth * displayScale;
    const scaledH = paperHeight * displayScale;

    return (
        <div className={`fixed inset-0 z-[110] flex justify-center bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200 ${isExpanded ? '' : 'items-end md:items-center md:p-4'}`}>

            <div
                className={`shadow-2xl overflow-hidden flex flex-col ${darkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white'} ${
                    isExpanded
                        ? 'w-full h-full'
                        : 'w-full max-h-[92vh] rounded-t-2xl md:rounded-2xl md:w-[95vw] md:h-[90vh] md:max-w-6xl md:max-h-[90vh]'
                }`}
                style={{ transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined, transition: dragging ? 'none' : SHEET_EASE }}
            >

                {!isExpanded && (
                    <div
                        className="md:hidden pt-2.5 pb-1.5 flex items-center justify-center shrink-0 cursor-grab touch-none active:cursor-grabbing"
                        {...dragHandlers}
                    >
                        <span className="w-10 h-1.5 rounded-full bg-slate-300" />
                    </div>
                )}

                <div
                    className={`px-4 py-3 border-b flex justify-between items-center shrink-0 md:touch-auto touch-none ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}
                    {...dragHandlers}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            onClick={() => { if (isExpanded) setIsExpanded(false); else setShowPdfModal(false); }}
                            className={`p-1.5 rounded-lg transition shrink-0 ${darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-slate-100 text-slate-500'}`}
                            title={_({fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}
                            aria-label={_({fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h3 className={`font-bold text-sm truncate ${darkMode ? 'text-white' : 'text-slate-800'}`}>{isTicket ? _({fr:'Paramètres Ticket',ar:'إعدادات التذكرة',en:'Ticket Settings',es:'Configuración de Ticket',pt:'Configurações do Ticket',tr:'Bilet Ayarları'}) : isCompact ? _({fr:'Fiche Compacte',ar:'بطاقة مضغوطة',en:'Compact Sheet',es:'Ficha Compacta',pt:'Ficha Compacta',tr:'Kompakt Kart'}) : t.pdfSettings}</h3>
                            <p className={`text-[10px] truncate ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>{isTicket ? _({fr:'Format personnalisé',ar:'تنسيق مخصص',en:'Custom format',es:'Formato personalizado',pt:'Formato personalizado',tr:'Özel format'}) : isCompact ? _({fr:'Format A4 compact',ar:'تنسيق A4 مضغوط',en:'Compact A4 format',es:'Formato A4 compacto',pt:'Formato A4 compacto',tr:'Kompakt A4 formatı'}) : _({fr:'Mise en page PDF',ar:'تخطيط PDF',en:'PDF layout',es:'Diseño PDF',pt:'Layout PDF',tr:'PDF düzeni'})}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            onClick={() => setIsExpanded(e => !e)}
                            className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-slate-100 text-slate-500'}`}
                            title={isExpanded ? _({fr:'Réduire',ar:'تصغير',en:'Reduce',es:'Reducir',pt:'Reduzir',tr:'Küçült'}) : _({fr:'Agrandir (plein écran)',ar:'تكبير (ملء الشاشة)',en:'Expand (full screen)',es:'Ampliar (pantalla completa)',pt:'Expandir (tela cheia)',tr:'Büyüt (tam ekran)'})}
                            aria-label={isExpanded ? _({fr:'Réduire',ar:'تصغير',en:'Reduce',es:'Reducir',pt:'Reduzir',tr:'Küçült'}) : _({fr:'Agrandir',ar:'تكبير',en:'Expand',es:'Ampliar',pt:'Expandir',tr:'Büyüt'})}
                        >
                            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setShowPdfModal(false)} className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-slate-200 text-slate-500'}`} aria-label={_({fr:'Fermer',ar:'إغلاق',en:'Close',es:'Cerrar',pt:'Fechar',tr:'Kapat'})}>
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col md:flex-row">

                <div className={`order-2 md:order-1 w-full md:w-72 flex-1 md:flex-shrink-0 min-h-0 flex flex-col ${darkMode ? 'bg-gray-800 md:border-r border-gray-700' : 'bg-slate-50 md:border-r border-slate-200'}`}>

                    <div className="flex-1 overflow-y-auto p-4 space-y-5">

                        {!isTicket && (
                        <section>
                            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                                {_({fr:'Orientation',ar:'الاتجاه',en:'Orientation',es:'Orientación',pt:'Orientação',tr:'Yönlendirme'})}
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
                                    <span className="text-[10px] font-bold">{_({fr:'Portrait',ar:'عمودي',en:'Portrait',es:'Retrato',pt:'Retrato',tr:'Dikey'})}</span>
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
                                    <span className="text-[10px] font-bold">{_({fr:'Paysage',ar:'أفقي',en:'Landscape',es:'Paisaje',pt:'Paisagem',tr:'Yatay'})}</span>
                                    {pdfSettings.orientation === 'landscape' && (
                                        <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center">
                                            <Check className="w-2 h-2 text-white" />
                                        </div>
                                    )}
                                </button>
                            </div>
                        </section>
                        )}

                        {isTicket && setTicketSize && (
                        <section>
                            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                                {_({fr:'Dimensions (mm)',ar:'الأبعاد (مم)',en:'Dimensions (mm)',es:'Dimensiones (mm)',pt:'Dimensões (mm)',tr:'Boyutlar (mm)'})}
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {([['width', 'Largeur'], ['height', 'Hauteur']] as const).map(([key, lbl]) => (
                                    <div key={key} className={`rounded-lg border px-2.5 py-1.5 ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-slate-200 bg-white'}`}>
                                        <span className={`block text-[9px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>{_(key === 'width' ? {fr:'Largeur',ar:'العرض',en:'Width',es:'Ancho',pt:'Largura',tr:'Genişlik'} : {fr:'Hauteur',ar:'الارتفاع',en:'Height',es:'Alto',pt:'Altura',tr:'Yükseklik'})}</span>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number" min={20} max={2000}
                                                value={ticketSize[key]}
                                                onChange={(e) => {
                                                    const v = Math.max(20, Math.min(2000, Math.round(Number(e.target.value) || 0)));
                                                    setTicketSize(s => ({ ...s, [key]: v }));
                                                }}
                                                className={`w-full text-sm font-bold tabular-nums bg-transparent outline-none ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}
                                                aria-label={_(key === 'width' ? {fr:'Largeur du ticket en mm',ar:'عرض التذكرة بالملم',en:'Ticket width in mm',es:'Ancho del ticket en mm',pt:'Largura do ticket em mm',tr:'Bilet genişliği (mm)'} : {fr:'Hauteur du ticket en mm',ar:'ارتفاع التذكرة بالملم',en:'Ticket height in mm',es:'Alto del ticket en mm',pt:'Altura do ticket em mm',tr:'Bilet yüksekliği (mm)'})}
                                            />
                                            <span className="text-[10px] text-slate-400">mm</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
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

                        <section>
                            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                                {_({fr:'Couleurs',ar:'الألوان',en:'Colors',es:'Colores',pt:'Cores',tr:'Renkler'})}
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
                                    <Palette className="w-3 h-3" /> {_({fr:'Couleur',ar:'ملون',en:'Color',es:'Color',pt:'Cor',tr:'Renkli'})}
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
                                    <div className="w-3 h-3 rounded-full bg-gradient-to-tr from-black to-white border border-gray-300"></div> {_({fr:'N&B',ar:'أبيض وأسود',en:'B&W',es:'ByN',pt:'P&B',tr:'S&B'})}
                                </button>
                            </div>
                        </section>

                        <section>
                            <div className="flex justify-between items-center mb-2">
                                <label className={`block text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                                    {_({fr:'Échelle',ar:'المقياس',en:'Scale',es:'Escala',pt:'Escala',tr:'Ölçek'})}
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

                        {pdfSections && setPdfSections && (
                            <section>
                                <label className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                                    {_({fr:'Sections à afficher',ar:'الأقسام المراد عرضها',en:'Sections to show',es:'Secciones a mostrar',pt:'Secções a mostrar',tr:'Gösterilecek bölümler'})}
                                </label>
                                <div className="space-y-1.5">
                                    {([
                                        ['info', _({fr:'Infos modèle & image',ar:'معلومات الموديل والصورة',en:'Model info & image',es:'Información del modelo e imagen',pt:'Informações do modelo e imagem',tr:'Model bilgisi ve görsel'})],
                                        ['nomenclature', _({fr:'Nomenclature (matières)',ar:'قائمة المواد',en:'Nomenclature (materials)',es:'Nomenclatura (materiales)',pt:'Nomenclatura (materiais)',tr:'Malzeme listesi'})],
                                        ['pricing', _({fr:'Prix & marges',ar:'السعر والهوامش',en:'Price & margins',es:'Precio y márgenes',pt:'Preço e margens',tr:'Fiyat ve marjlar'})],
                                        ['order', _({fr:'Besoins commande',ar:'احتياجات الطلب',en:'Order requirements',es:'Necesidades del pedido',pt:'Necessidades da encomenda',tr:'Sipariş ihtiyaçları'})],
                                        ['notes', _({fr:'Notes & signatures',ar:'ملاحظات وتوقيعات',en:'Notes & signatures',es:'Notas y firmas',pt:'Notas e assinaturas',tr:'Notlar ve imzalar'})],
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

                        <section className={`p-3 rounded-lg ${darkMode ? 'bg-blue-900/20 border border-blue-800/30' : 'bg-blue-50 border border-blue-100'}`}>
                            <div className="flex items-start gap-2">
                                <ZoomIn className={`w-3.5 h-3.5 mt-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                                <div>
                                    <p className={`text-[10px] font-bold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>{_({fr:'Aperçu en direct',ar:'معاينة مباشرة',en:'Live preview',es:'Vista previa en vivo',pt:'Pré-visualização ao vivo',tr:'Canlı önizleme'})}</p>
                                    <p className={`text-[9px] mt-0.5 ${darkMode ? 'text-blue-400/70' : 'text-blue-600/70'}`}>
                                        {_({fr:"Les modifications sont appliquées instantanément à l'aperçu",ar:'يتم تطبيق التعديلات فوراً على المعاينة',en:'Changes are applied instantly to the preview',es:'Los cambios se aplican instantáneamente a la vista previa',pt:'As alterações são aplicadas instantaneamente à pré-visualização',tr:'Değişiklikler önizlemeye anında uygulanır'})}
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>

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
                                    <span>{_({fr:'Génération...',ar:'جاري التوليد...',en:'Generating...',es:'Generando...',pt:'A gerar...',tr:'Oluşturuluyor...'})}</span>
                                </>
                            ) : (
                                <>
                                    <FileDown className="w-4 h-4" />
                                    <span>{_({fr:'Télécharger PDF',ar:'تحميل PDF',en:'Download PDF',es:'Descargar PDF',pt:'Descarregar PDF',tr:'PDF İndir'})}</span>
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
                                    <span>{_({fr:'Imprimer',ar:'طباعة',en:'Print',es:'Imprimir',pt:'Imprimir',tr:'Yazdır'})}</span>
                                </button>
                            )}
                            {onExcel && !isTicket && (
                                <button
                                    onClick={onExcel}
                                    className={`py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] border ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-100 hover:bg-gray-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                >
                                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                                    <span>{_({fr:'Excel',ar:'Excel',en:'Excel',es:'Excel',pt:'Excel',tr:'Excel'})}</span>
                                </button>
                            )}
                        </div>
                        {!isLibLoaded && (
                            <p className="text-[9px] text-center mt-1.5 text-amber-500">
                                {_({fr:'Chargement de la librairie...',ar:'جاري تحميل المكتبة...',en:'Loading library...',es:'Cargando librería...',pt:'A carregar a biblioteca...',tr:'Kütüphane yükleniyor...'})}
                            </p>
                        )}
                    </div>
                </div>

                <div className={`order-1 md:order-2 flex-shrink-0 h-[52vh] md:h-auto md:flex-1 relative overflow-hidden flex flex-col ${darkMode ? 'bg-gray-950' : 'bg-slate-100'}`}>

                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 px-1.5 py-1 rounded-full shadow-md border bg-white/90 backdrop-blur-sm border-slate-200">
                        <div className="px-2 py-0.5 text-[10px] font-bold flex items-center gap-1.5 border-r border-slate-200">
                            <Layout className="w-3 h-3 text-blue-500" />
                            <span className="text-slate-700">{isTicket ? _({fr:'Ticket',ar:'تذكرة',en:'Ticket',es:'Ticket',pt:'Ticket',tr:'Bilet'}) : isCompact ? _({fr:'Compact',ar:'مضغوط',en:'Compact',es:'Compacto',pt:'Compacto',tr:'Kompakt'}) : 'A4'}</span>
                        </div>
                        <button onClick={() => setPreviewZoom(z => clampZoom(z - 0.25))} disabled={previewZoom <= 1} className="p-1 rounded-full hover:bg-slate-100 text-slate-500 disabled:opacity-30 transition" title={_({fr:'Dézoomer',ar:'تصغير',en:'Zoom out',es:'Alejar',pt:'Afastar',tr:'Uzaklaştır'})} aria-label={_({fr:'Dézoomer',ar:'تصغير',en:'Zoom out',es:'Alejar',pt:'Afastar',tr:'Uzaklaştır'})}>
                            <Minus className="w-3 h-3" />
                        </button>
                        <button onClick={() => setPreviewZoom(1)} className="px-1 text-[10px] font-mono font-bold text-slate-600 hover:text-blue-600 transition min-w-[36px] text-center" title={_({fr:'Réinitialiser le zoom',ar:'إعادة تعيين التكبير',en:'Reset zoom',es:'Restablecer zoom',pt:'Redefinir zoom',tr:'Yakınlaştırmayı sıfırla'})}>
                            {Math.round(previewZoom * 100)}%
                        </button>
                        <button onClick={() => setPreviewZoom(z => clampZoom(z + 0.25))} disabled={previewZoom >= 4} className="p-1 rounded-full hover:bg-slate-100 text-slate-500 disabled:opacity-30 transition" title={_({fr:'Zoomer',ar:'تكبير',en:'Zoom in',es:'Acercar',pt:'Aproximar',tr:'Yakınlaştır'})} aria-label={_({fr:'Zoomer',ar:'تكبير',en:'Zoom in',es:'Acercar',pt:'Aproximar',tr:'Yakınlaştır'})}>
                            <Plus className="w-3 h-3" />
                        </button>
                        <span className="hidden md:inline px-2 py-0.5 text-[10px] font-mono text-slate-400 border-l border-slate-200">
                            {isTicket ? `${ticketSize.width} × ${ticketSize.height}mm` : isCompact ? _({fr:'A4 Compact',ar:'A4 مضغوط',en:'Compact A4',es:'A4 Compacto',pt:'A4 Compacto',tr:'Kompakt A4'}) : `${paperWidth} × ${paperHeight}px`}
                        </span>
                    </div>

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
                        <div className="min-w-full min-h-full flex items-center justify-center p-3 md:p-6">
                            <div style={{ width: scaledW, height: scaledH, position: 'relative', flex: '0 0 auto' }}>
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
                                    className={`bg-white overflow-hidden ${pdfSettings.colorMode === 'grayscale' ? 'grayscale' : ''} active-page-${activePage}`}
                                >
                                    <div className="w-full h-full pointer-events-none select-none">
                                        {children}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    {totalPages && totalPages > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-3 py-1.5 rounded-full shadow-lg border bg-slate-900/90 text-white border-slate-700 backdrop-blur-sm transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <button
                                onClick={() => setActivePage(p => Math.max(1, p - 1))}
                                disabled={activePage === 1}
                                className="p-1 rounded-full hover:bg-slate-800 disabled:opacity-30 transition-all active:scale-90"
                                title={_({fr:'Page précédente',ar:'الصفحة السابقة',en:'Previous page',es:'Página anterior',pt:'Página anterior',tr:'Önceki sayfa'})}
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="text-xs font-black tracking-wider font-mono select-none px-1">
                                {_({fr:'Page',ar:'صفحة',en:'Page',es:'Página',pt:'Página',tr:'Sayfa'})} {activePage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setActivePage(p => Math.min(totalPages, p + 1))}
                                disabled={activePage === totalPages}
                                className="p-1 rounded-full hover:bg-slate-800 disabled:opacity-30 transition-all active:scale-90"
                                title={_({fr:'Page suivante',ar:'الصفحة التالية',en:'Next page',es:'Página siguiente',pt:'Página seguinte',tr:'Sonraki sayfa'})}
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
                </div>
            </div>
        </div>
    );
};

export default PdfSettingsModal;
