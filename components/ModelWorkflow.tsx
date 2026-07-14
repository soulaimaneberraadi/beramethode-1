
import React, { useState, useRef, useEffect } from 'react';
import {
    ArrowLeft,
    FileText,
    ClipboardList,
    Activity,
    Scale,
    LayoutTemplate,
    Banknote,
    Save,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ArrowRight,
    Check,
    RotateCcw,
    Undo2,
    Redo2,
    AlertTriangle,
    Calendar
} from 'lucide-react';

import FicheTechnique from './FicheTechnique';
import Gamme from './Gamme';
import Chronometrage from './Chronometrage';
import AnalyseTechnologique from './AnalyseTechnologique';
import Balancing from './Balancing';
import Implantation from './Implantation';
import CostCalculator from './CostCalculator';
import Pedido from './Pedido';
import InlineInvoiceList from './InlineInvoiceList';

import { Machine, Operation, ComplexityFactor, StandardTime, Guide, Poste, FicheData, Material, ChronoData, AppSettings, ManualLink, PlanningEvent, CustomStation } from '../types';
import { tx, pickT } from '../lib/i18n';
import type { Lang } from '../app/constants';

type WorkflowStep = 'fiche' | 'gamme' | 'chrono' | 'analyse' | 'equilibrage' | 'implantation' | 'couts' | 'pedido';

interface ModelWorkflowProps {
    // Shared Data Props
    machines: Machine[];
    operations: Operation[];
    setOperations: React.Dispatch<React.SetStateAction<Operation[]>>;
    speedFactors: any[];
    complexityFactors: ComplexityFactor[];
    standardTimes: StandardTime[];
    guides: Guide[];
    setGuides: React.Dispatch<React.SetStateAction<Guide[]>>;

    // Project State
    articleName: string;
    setArticleName: (name: string) => void;
    efficiency: number;
    setEfficiency: React.Dispatch<React.SetStateAction<number>>;
    numWorkers: number;
    setNumWorkers: React.Dispatch<React.SetStateAction<number>>;
    presenceTime: number;
    setPresenceTime: React.Dispatch<React.SetStateAction<number>>;
    bf: number;
    globalStats: { totalTime: number; tempsArticle: number; bf: number };

    // Fiche Specifics
    ficheData: FicheData;
    setFicheData: React.Dispatch<React.SetStateAction<FicheData>>;
    ficheImages: { front: string | null; back: string | null };
    setFicheImages: React.Dispatch<React.SetStateAction<{ front: string | null; back: string | null }>>;

    // Balancing & Implantation State
    assignments: Record<string, string[]>;
    setAssignments: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
    postes: Poste[];
    setPostes: React.Dispatch<React.SetStateAction<Poste[]>>;

    // Autocomplete
    isAutocompleteEnabled: boolean;
    userVocabulary: string[];
    setUserVocabulary: React.Dispatch<React.SetStateAction<string[]>>;

    // Chrono Data
    chronoData: Record<string, ChronoData>;
    setChronoData: React.Dispatch<React.SetStateAction<Record<string, ChronoData>>>;
    chronoCustomStations: CustomStation[];
    setChronoCustomStations: React.Dispatch<React.SetStateAction<CustomStation[]>>;
    chronoLayoutSide: 'left' | 'right' | 'both';
    setChronoLayoutSide: React.Dispatch<React.SetStateAction<'left' | 'right' | 'both'>>;

    // Layout Memory
    layoutMemory: Record<string, { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[]>;
    setLayoutMemory: React.Dispatch<React.SetStateAction<Record<string, { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[]>>>;
    activeLayout: 'zigzag' | 'free' | 'line' | 'double-zigzag';
    setActiveLayout: React.Dispatch<React.SetStateAction<'zigzag' | 'free' | 'line' | 'double-zigzag'>>;
    manualLinks: ManualLink[];
    setManualLinks: React.Dispatch<React.SetStateAction<ManualLink[]>>;

    // Actions
    onSaveToLibrary: () => void;

    // Undo/Redo Props
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;

    // Language
    lang?: Lang;

    // Global Settings
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;

    // Planned events
    currentModelId: string | null;
    planningEvents: PlanningEvent[];
    setPlanningEvents: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    initialStep?: WorkflowStep | null;
    onInitialStepConsumed?: () => void;
}

// Stepper label translations
const STEP_LABELS = {
    fr: {
        fiche: 'Fiche Technique',
        gamme: 'Gamme',
        chrono: 'Chronométrage',
        analyse: 'Analyse',
        equilibrage: 'Équilibrage',
        implantation: 'Implantation',
        couts: 'Coûts & Budget',
        pedido: 'Pedido',
        save: 'Sauvegarder',
        next: 'Suivant',
        back: 'Précédent',
        finish: 'Terminer',
        undo: 'Annuler (Ctrl+Z)',
        redo: 'Rétablir (Ctrl+Y)',
        refresh: 'Actualiser la vue',
    },
    ar: {
        fiche: 'الملف التقني',
        gamme: 'سلسلة العمليات',
        chrono: 'قياس الوقت',
        analyse: 'التحليل',
        equilibrage: 'التوازن',
        implantation: 'التخطيط',
        couts: 'التكاليف والميزانية',
        pedido: 'الطلبية (Pedido)',
        save: 'حفظ',
        next: 'التالي',
        back: 'السابق',
        finish: 'إنهاء',
        undo: 'تراجع (Ctrl+Z)',
        redo: 'إعادة (Ctrl+Y)',
        refresh: 'تحديث العرض',
    },
    en: {
        fiche: 'Technical Sheet',
        gamme: 'Operation Sequence',
        chrono: 'Timing',
        analyse: 'Analysis',
        equilibrage: 'Balancing',
        implantation: 'Layout',
        couts: 'Costs & Budget',
        pedido: 'Pedido',
        save: 'Save',
        next: 'Next',
        back: 'Back',
        finish: 'Finish',
        undo: 'Undo (Ctrl+Z)',
        redo: 'Redo (Ctrl+Y)',
        refresh: 'Refresh view',
    },
    es: {
        fiche: 'Ficha Técnica',
        gamme: 'Secuencia de Operaciones',
        chrono: 'Cronometraje',
        analyse: 'Análisis',
        equilibrage: 'Equilibrado',
        implantation: 'Implantación',
        couts: 'Costos y Presupuesto',
        pedido: 'Pedido',
        save: 'Guardar',
        next: 'Siguiente',
        back: 'Anterior',
        finish: 'Finalizar',
        undo: 'Deshacer (Ctrl+Z)',
        redo: 'Rehacer (Ctrl+Y)',
        refresh: 'Actualizar vista',
    },
    pt: {
        fiche: 'Ficha Técnica',
        gamme: 'Sequência de Operações',
        chrono: 'Cronometragem',
        analyse: 'Análise',
        equilibrage: 'Balanceamento',
        implantation: 'Implantação',
        couts: 'Custos e Orçamento',
        pedido: 'Pedido',
        save: 'Salvar',
        next: 'Próximo',
        back: 'Anterior',
        finish: 'Concluir',
        undo: 'Desfazer (Ctrl+Z)',
        redo: 'Refazer (Ctrl+Y)',
        refresh: 'Atualizar vista',
    },
    tr: {
        fiche: 'Teknik Föy',
        gamme: 'Operasyon Sırası',
        chrono: 'Zamanlama',
        analyse: 'Analiz',
        equilibrage: 'Dengeleme',
        implantation: 'Yerleşim',
        couts: 'Maliyet ve Bütçe',
        pedido: 'Pedido',
        save: 'Kaydet',
        next: 'İleri',
        back: 'Geri',
        finish: 'Bitir',
        undo: 'Geri al (Ctrl+Z)',
        redo: 'Yinele (Ctrl+Y)',
        refresh: 'Görünümü yenile',
    },
} as const;

export default function ModelWorkflow({
    machines, operations, setOperations, speedFactors, complexityFactors, standardTimes, guides, setGuides,
    articleName, setArticleName, efficiency, setEfficiency, numWorkers, setNumWorkers, presenceTime, setPresenceTime, bf, globalStats,
    ficheData, setFicheData, ficheImages, setFicheImages,
    assignments, setAssignments, postes, setPostes,
    isAutocompleteEnabled, userVocabulary, setUserVocabulary,
    chronoData, setChronoData,
    chronoCustomStations, setChronoCustomStations, chronoLayoutSide, setChronoLayoutSide,
    layoutMemory, setLayoutMemory,
    activeLayout, setActiveLayout,
    manualLinks, setManualLinks,
    onSaveToLibrary,
    onUndo, onRedo, canUndo, canRedo,
    lang = 'fr',
    settings, setSettings,
    currentModelId, planningEvents, setPlanningEvents,
    initialStep, onInitialStepConsumed
}: ModelWorkflowProps) {
    const st = pickT(STEP_LABELS as any, lang);

    // Current Step State
    const [currentStep, setCurrentStep] = useState<WorkflowStep>(initialStep || 'fiche');
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        if (!initialStep) return;
        setCurrentStep(initialStep);
        onInitialStepConsumed?.();
    }, [initialStep, onInitialStepConsumed]);

    const showValidationError = (msg: string) => {
        setValidationError(msg);
        setTimeout(() => setValidationError(null), 4000); // Increased to 4 seconds for better visibility
    };

    const validateFiche = () => {
        if (!articleName || !articleName.trim()) {
            showValidationError(tx(lang, { fr: 'La référence du modèle est obligatoire.', ar: 'مرجع الموديل مطلوب', en: 'The model reference is required.', es: 'La referencia del modelo es obligatoria.', pt: 'A referência do modelo é obrigatória.', tr: 'Model referansı zorunludur.' }));
            return false;
        }

        // Category is optional - no validation needed
        return true;
    };

    // FABRIC SETTINGS STATE (Lifted Up)
    const [fabricSettings, setFabricSettings] = useState<{
        enabled: boolean;
        selected: 'easy' | 'medium' | 'hard';
        values: { easy: number; medium: number; hard: number };
    }>({
        enabled: false,
        selected: 'easy',
        values: { easy: 0, medium: 3, hard: 6 }
    });

    const steps = [
        { id: 'fiche', label: st.fiche, icon: FileText },
        { id: 'gamme', label: st.gamme, icon: ClipboardList },
        { id: 'chrono', label: st.chrono, icon: Activity }, // New Chrono Step
        { id: 'analyse', label: st.analyse, icon: Activity },
        { id: 'equilibrage', label: st.equilibrage, icon: Scale },
        { id: 'implantation', label: st.implantation, icon: LayoutTemplate },
        { id: 'couts', label: st.couts, icon: Banknote },
        { id: 'pedido', label: st.pedido, icon: Calendar },
    ];

    // Navigation Helper
    const navigateTo = (stepId: string) => {
        if (currentStep === 'fiche' && stepId !== 'fiche' && !validateFiche()) return;
        setCurrentStep(stepId as any);
    };

    // Handle Refresh (Scroll to top)
    const handleRefresh = () => {
        const scrollContainer = document.getElementById('workflow-content');
        if (scrollContainer) {
            scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Linear "Next" Button (Process Flow)
    const handleLinearNext = () => {
        if (currentStep === 'fiche' && !validateFiche()) return;
        const currentIndex = steps.findIndex(s => s.id === currentStep);
        if (currentIndex < steps.length - 1) {
            setCurrentStep(steps[currentIndex + 1].id as any);
        }
    };

    // Linear "Previous" Button (retour d'une étape, sans validation)
    const handleLinearPrev = () => {
        const currentIndex = steps.findIndex(s => s.id === currentStep);
        if (currentIndex > 0) {
            setCurrentStep(steps[currentIndex - 1].id as any);
        }
    };

    // Auto-scroll : garde l'étape active visible dans la barre quand elle déborde.
    const activeStepRef = useRef<HTMLButtonElement>(null);
    const stepperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        activeStepRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [currentStep]);

    const scrollSteps = (direction: 'left' | 'right') => {
        if (stepperRef.current) {
            const offset = 200;
            stepperRef.current.scrollBy({
                left: direction === 'left' ? -offset : offset,
                behavior: 'smooth'
            });
        }
    };

    const handleSave = () => {
        if (!validateFiche()) {
            if (currentStep !== 'fiche') setCurrentStep('fiche');
            return;
        }
        onSaveToLibrary();
    };

    const handleSectionSplitChange = (enabled: boolean) => {
        if (enabled) return;
        // Turning split OFF forces all operations back to GLOBAL.
        setOperations(prev => prev.map(op => ({ ...op, section: 'GLOBAL' })));
    };

    const currentIndex = steps.findIndex(s => s.id === currentStep);
    const isLastStep = currentIndex === steps.length - 1;

    return (
        <div className="flex flex-col h-full overflow-hidden">

            {/* STEPPER HEADER + NAVIGATION */}
            <div className="bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border px-3 sm:px-4 py-2 sm:py-3 shrink-0 flex flex-wrap items-center justify-between gap-y-2 gap-x-4 shadow-sm dark:shadow-dk-sm z-20">

                {/* DATA UNDO/REDO NAVIGATION (Left) */}
                <div className="flex items-center gap-1 bg-slate-50 dark:bg-dk-bg p-1 rounded-lg border border-slate-200 dark:border-dk-border shrink-0 mr-2 shadow-sm dark:shadow-dk-sm">
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        className={`p-1.5 rounded-md transition-all ${!canUndo
                            ? 'text-slate-300 dark:text-dk-muted cursor-not-allowed bg-slate-50 dark:bg-dk-bg'
                            : 'text-slate-600 dark:text-dk-text-soft hover:bg-white dark:hover:bg-dk-surface hover:text-indigo-600 dark:text-dk-accent-text hover:shadow-sm active:scale-95'
                            }`}
                        title={st.undo}
                    >
                        <Undo2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        className={`p-1.5 rounded-md transition-all ${!canRedo
                            ? 'text-slate-300 dark:text-dk-muted cursor-not-allowed bg-slate-50 dark:bg-dk-bg'
                            : 'text-slate-600 dark:text-dk-text-soft hover:bg-white dark:hover:bg-dk-surface hover:text-indigo-600 dark:text-dk-accent-text hover:shadow-sm active:scale-95'
                            }`}
                        title={st.redo}
                    >
                        <Redo2 className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
                    <button
                        onClick={handleRefresh}
                        className="p-1.5 rounded-md text-slate-600 dark:text-dk-text-soft hover:bg-white dark:hover:bg-dk-surface hover:text-emerald-600 transition-all hover:shadow-sm active:scale-95"
                        title={st.refresh}
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                </div>

                {/* CENTER: STEPS LIST (Scrollable with Integrated Glassy Arrow Navigation) */}
                <div className="order-last w-full md:order-none md:w-auto md:flex-1 flex items-center justify-start md:justify-center overflow-hidden relative group/stepper py-1">
                    {/* Left Scroll Button */}
                    <button
                        onClick={() => scrollSteps('left')}
                        className="absolute left-0 top-0 bottom-0 z-10 w-8 bg-white/40 dark:bg-dk-surface/40 hover:bg-white dark:hover:bg-dk-surface/60 backdrop-blur-md border-r border-slate-200/50 dark:border-dk-border/50 text-slate-600 dark:text-dk-text-soft hover:text-indigo-600 dark:text-dk-accent-text transition-all duration-200 active:bg-white dark:active:bg-dk-surface/80 opacity-0 group-hover/stepper:opacity-100 flex items-center justify-center"
                        title={tx(lang, { fr: 'Précédent', ar: 'السابق', en: 'Previous', es: 'Anterior', pt: 'Anterior', tr: 'Önceki' })}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Scrollable Container */}
                    <div 
                        ref={stepperRef}
                        className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full px-10 scroll-smooth"
                    >
                        {steps.map((step, index) => {
                            const isActive = currentStep === step.id;
                            const isPast = steps.findIndex(s => s.id === currentStep) > index;
                            return (
                                <React.Fragment key={step.id}>
                                    <button
                                        ref={isActive ? activeStepRef : undefined}
                                        onClick={() => navigateTo(step.id)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${isActive
                                            ? 'bg-indigo-600 dark:bg-dk-accent text-white shadow-md dark:shadow-dk-md shadow-indigo-200'
                                            : isPast
                                                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/50 hover:bg-emerald-100'
                                                : 'text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-bg'
                                            }`}
                                    >
                                        {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : <step.icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-200' : 'text-slate-400 dark:text-dk-muted'}`} />}
                                        <span className="hidden md:inline">{step.label}</span>
                                        {/* Mobile : label complet sur l'étape active, numéro sinon */}
                                        <span className="md:hidden">{isActive ? step.label : index + 1}</span>
                                    </button>
                                    {index < steps.length - 1 && <div className="w-4 h-px bg-slate-200 shrink-0 hidden sm:block"></div>}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Right Scroll Button */}
                    <button
                        onClick={() => scrollSteps('right')}
                        className="absolute right-0 top-0 bottom-0 z-10 w-8 bg-white/40 dark:bg-dk-surface/40 hover:bg-white dark:hover:bg-dk-surface/60 backdrop-blur-md border-l border-slate-200/50 dark:border-dk-border/50 text-slate-600 dark:text-dk-text-soft hover:text-indigo-600 dark:text-dk-accent-text transition-all duration-200 active:bg-white dark:active:bg-dk-surface/80 opacity-0 group-hover/stepper:opacity-100 flex items-center justify-center"
                        title={tx(lang, { fr: 'Suivant', ar: 'التالي', en: 'Next', es: 'Siguiente', pt: 'Próximo', tr: 'İleri' })}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* RIGHT: ACTIONS (Detached) */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handleLinearPrev}
                        disabled={currentIndex === 0}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm dark:shadow-dk-sm border ${currentIndex === 0
                            ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-dk-border text-slate-300 dark:text-dk-muted bg-white dark:bg-dk-surface'
                            : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-bg text-slate-600 dark:text-dk-text-soft'
                            }`}
                        title={st.back}
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">{st.back}</span>
                    </button>

                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-bg text-slate-600 dark:text-dk-text-soft rounded-xl text-xs font-bold shadow-sm dark:shadow-dk-sm transition-all"
                        title={st.save}
                    >
                        <Save className="w-4 h-4" />
                        <span className="hidden xl:inline">{st.save}</span>
                    </button>

                    <button
                        onClick={isLastStep ? handleSave : handleLinearNext}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm dark:shadow-dk-sm ${isLastStep
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 hover:shadow-emerald-300'
                            : 'bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover text-white shadow-indigo-200 hover:shadow-indigo-300'
                            }`}
                    >
                        <span className="hidden sm:inline">{isLastStep ? st.finish : st.next}</span>
                        {isLastStep ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-hidden relative bg-slate-50 dark:bg-dk-bg/50">
                {/* FLOATING ERROR MESSAGE (4s with shake animation) */}
                {validationError && (
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 duration-300">
                        <div className="bg-rose-600 text-white px-6 py-4 rounded-2xl shadow-2xl dark:shadow-dk-elevated dark:shadow-dk-lg flex items-center gap-3 border-2 border-rose-400 backdrop-blur-sm animate-pulse">
                            <AlertTriangle className="w-6 h-6 text-rose-100 animate-bounce" />
                            <span className="font-black text-base tracking-wide">{validationError}</span>
                        </div>
                    </div>
                )}
                <div id="workflow-content" className="absolute inset-0 p-4 sm:p-6 lg:p-8 overflow-y-auto custom-scrollbar">

                    {currentStep === 'fiche' && (
                        <FicheTechnique
                            data={ficheData}
                            setData={setFicheData}
                            totalTime={globalStats.totalTime}
                            tempsArticle={globalStats.tempsArticle}
                            numWorkers={numWorkers}
                            setNumWorkers={setNumWorkers}
                            efficiency={efficiency}
                            setEfficiency={setEfficiency}
                            images={ficheImages}
                            setImages={setFicheImages}
                            onSectionSplitChange={handleSectionSplitChange}
                            lang={lang}
                            settings={settings}
                            currentModelId={currentModelId}
                            planningEvents={planningEvents}
                            setPlanningEvents={setPlanningEvents}
                            articleName={articleName}
                            setArticleName={setArticleName}
                            articleNameError={validationError?.includes(tx(lang, { fr: 'référence', ar: 'مرجع', en: 'reference', es: 'referencia', pt: 'referência', tr: 'referans' })) || false}
                        />
                    )}

                    {currentStep === 'gamme' && (
                        <Gamme
                            machines={machines}
                            operations={operations} setOperations={setOperations}
                            articleName={articleName} setArticleName={setArticleName}
                            efficiency={efficiency} setEfficiency={setEfficiency}
                            numWorkers={numWorkers} setNumWorkers={setNumWorkers}
                            presenceTime={presenceTime} setPresenceTime={setPresenceTime}
                            bf={bf}
                            complexityFactors={complexityFactors}
                            standardTimes={standardTimes}
                            guides={guides}
                            setGuides={setGuides}
                            isAutocompleteEnabled={isAutocompleteEnabled}
                            userVocabulary={userVocabulary} setUserVocabulary={setUserVocabulary}
                            // Pass fabric settings
                            fabricSettings={fabricSettings}
                            setFabricSettings={setFabricSettings}
                            sectionSplitEnabled={!!ficheData.sectionSplitEnabled}
                            assignments={assignments}
                            postes={postes}
                        />
                    )}

                    {currentStep === 'chrono' && (
                        <Chronometrage
                            operations={operations}
                            chronoData={chronoData}
                            setChronoData={setChronoData}
                            presenceTime={presenceTime}
                            setPresenceTime={setPresenceTime}
                            bf={bf}
                            numWorkers={numWorkers}
                            setNumWorkers={setNumWorkers}
                            efficiency={efficiency}
                            setEfficiency={setEfficiency}
                            machines={machines}
                            assignments={assignments}
                            postes={postes}
                            currentModelId={currentModelId}
                            articleName={articleName}
                            activeLayout={activeLayout}
                            toleranceSaturation={ficheData.toleranceSaturation ?? 115}
                            chronoCustomStations={chronoCustomStations}
                            setChronoCustomStations={setChronoCustomStations}
                            chronoLayoutSide={chronoLayoutSide}
                            setChronoLayoutSide={setChronoLayoutSide}
                        />
                    )}

                    {currentStep === 'analyse' && (
                        <AnalyseTechnologique
                            machines={machines}
                            operations={operations} setOperations={setOperations}
                            articleName={articleName}
                            efficiency={efficiency} setEfficiency={setEfficiency}
                            numWorkers={numWorkers} setNumWorkers={setNumWorkers}
                            presenceTime={presenceTime} setPresenceTime={setPresenceTime}
                            bf={bf}
                            complexityFactors={complexityFactors}
                            standardTimes={standardTimes}
                            // Pass fabric settings
                            fabricSettings={fabricSettings}
                            assignments={assignments}
                            postes={postes}
                        />
                    )}

                    {currentStep === 'equilibrage' && (
                        <Balancing
                            operations={operations}
                            efficiency={efficiency} setEfficiency={setEfficiency}
                            bf={bf}
                            articleName={articleName}
                            numWorkers={numWorkers} setNumWorkers={setNumWorkers}
                            presenceTime={presenceTime} setPresenceTime={setPresenceTime}
                            assignments={assignments} setAssignments={setAssignments}
                            postes={postes} setPostes={setPostes}
                            machines={machines}
                            ficheData={ficheData}
                            setFicheData={setFicheData}
                        />
                    )}

                    {currentStep === 'implantation' && (
                        <Implantation
                            bf={bf}
                            operations={operations}
                            setOperations={setOperations}
                            numWorkers={numWorkers} setNumWorkers={setNumWorkers}
                            presenceTime={presenceTime} setPresenceTime={setPresenceTime}
                            efficiency={efficiency} setEfficiency={setEfficiency}
                            articleName={articleName}
                            assignments={assignments}
                            postes={postes} setPostes={setPostes}
                            layoutMemory={layoutMemory} setLayoutMemory={setLayoutMemory}
                            activeLayout={activeLayout} setActiveLayout={setActiveLayout}
                            machines={machines}
                            speedFactors={speedFactors}
                            complexityFactors={complexityFactors}
                            standardTimes={standardTimes}
                            fabricSettings={fabricSettings}
                            onSave={onSaveToLibrary}
                            manualLinks={manualLinks}
                            setManualLinks={setManualLinks}
                            ficheData={ficheData}
                            setFicheData={setFicheData}
                        />
                    )}

                    {currentStep === 'couts' && (() => {
                        const calculatedChronoTotal = operations.reduce((sum, op) => {
                            const stKeys = Object.keys(chronoData).filter(k => k.endsWith(`__${op.id}`));
                            if (stKeys.length > 0) {
                                const avg = stKeys.reduce((acc, k) => acc + (chronoData[k].tempMajore || 0), 0) / stKeys.length;
                                return sum + avg;
                            }
                            return sum + (chronoData[op.id]?.tempMajore || 0);
                        }, 0);
                        return (
                            <CostCalculator
                                initialArticleName={articleName}
                                initialTotalTime={globalStats.tempsArticle}
                                chronoTotalTime={calculatedChronoTotal}
                                initialImage={ficheImages.front}
                                onImageChange={(img) => setFicheImages(prev => ({ ...prev, front: img }))}
                                initialDate={ficheData.date}
                                initialCostMinute={ficheData.costMinute}
                                settings={settings}
                                ficheData={ficheData}
                                setFicheData={setFicheData}
                                operations={operations}
                                setOperations={setOperations}
                                currentModelId={currentModelId}
                            />
                        );
                    })()}

                    {currentStep === 'couts' && currentModelId && (
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-dk-border">
                            <InlineInvoiceList
                                productId={currentModelId}
                                productLabel={articleName}
                                sourceModule="model"
                            />
                        </div>
                    )}

                    {currentStep === 'pedido' && (
                        <Pedido
                            data={ficheData}
                            setData={setFicheData}
                            articleName={articleName}
                            setArticleName={setArticleName}
                            lang={lang}
                            articleNameError={validationError?.includes(tx(lang, { fr: 'référence', ar: 'مرجع', en: 'reference', es: 'referencia', pt: 'referência', tr: 'referans' })) || false}
                            settings={settings}
                            currentModelId={currentModelId}
                            planningEvents={planningEvents}
                            setPlanningEvents={setPlanningEvents}
                        />
                    )}

                </div>
            </div>
        </div>
    );
}
