
import React, { useState } from 'react';
import {
    FileText,
    ClipboardList,
    Activity,
    Scale,
    LayoutTemplate,
    Banknote,
    Save,
    CheckCircle2,
    ChevronRight,
    ArrowRight,
    Check,
    RotateCcw,
    Undo2,
    Redo2
} from 'lucide-react';

import FicheTechnique from './FicheTechnique';
import Gamme from './Gamme';
import Chronometrage from './Chronometrage';
import AnalyseTechnologique from './AnalyseTechnologique';
import Balancing from './Balancing';
import Implantation from './Implantation';
import CostCalculator from './CostCalculator';

import { Machine, Operation, ComplexityFactor, StandardTime, Guide, Poste, FicheData, Material, ChronoData, AppSettings } from '../types';

// ManualLink type for Liaison (connection lines between workstations)
interface ManualLink {
    id: string;
    from: string;
    to: string;
    label?: string;
}

interface ModelWorkflowProps {
    // Shared Data Props
    machines: Machine[];
    operations: Operation[];
    setOperations: React.Dispatch<React.SetStateAction<Operation[]>>;
    speedFactors: any[];
    complexityFactors: ComplexityFactor[];
    standardTimes: StandardTime[];
    guides: Guide[];

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

    // Layout Memory
    layoutMemory: Record<string, { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[]>;
    setLayoutMemory: React.Dispatch<React.SetStateAction<Record<string, { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[]>>>;
    activeLayout: 'zigzag' | 'snake' | 'grid' | 'wheat' | 'free' | 'line';
    setActiveLayout: React.Dispatch<React.SetStateAction<'zigzag' | 'snake' | 'grid' | 'wheat' | 'free' | 'line'>>;

    // Actions
    onSaveToLibrary: () => void;

    // Undo/Redo Props
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;

    // Language
    lang?: 'fr' | 'ar';

    // Global Settings
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
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
        save: 'Sauvegarder',
        next: 'Suivant',
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
        save: 'حفظ',
        next: 'التالي',
        finish: 'إنهاء',
        undo: 'تراجع (Ctrl+Z)',
        redo: 'إعادة (Ctrl+Y)',
        refresh: 'تحديث العرض',
    },
} as const;

export default function ModelWorkflow({
    machines, operations, setOperations, speedFactors, complexityFactors, standardTimes, guides,
    articleName, setArticleName, efficiency, setEfficiency, numWorkers, setNumWorkers, presenceTime, setPresenceTime, bf, globalStats,
    ficheData, setFicheData, ficheImages, setFicheImages,
    assignments, setAssignments, postes, setPostes,
    isAutocompleteEnabled, userVocabulary, setUserVocabulary,
    chronoData, setChronoData,
    layoutMemory, setLayoutMemory,
    activeLayout, setActiveLayout,
    onSaveToLibrary,
    onUndo, onRedo, canUndo, canRedo,
    lang = 'fr',
    settings, setSettings
}: ModelWorkflowProps) {
    const st = STEP_LABELS[lang];

    // Current Step State
    const [currentStep, setCurrentStep] = useState<'fiche' | 'gamme' | 'chrono' | 'analyse' | 'equilibrage' | 'implantation' | 'couts'>('fiche');

    // MANUAL LINKS STATE (Lifted up from Implantation for persistence)
    const [manualLinks, setManualLinks] = useState<ManualLink[]>(() => {
        try {
            const saved = localStorage.getItem('beramethode_manual_links');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    // Persist manualLinks to localStorage whenever they change
    const handleSetManualLinks: React.Dispatch<React.SetStateAction<ManualLink[]>> = (action) => {
        setManualLinks(prev => {
            const next = typeof action === 'function' ? action(prev) : action;
            localStorage.setItem('beramethode_manual_links', JSON.stringify(next));
            return next;
        });
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
    ];

    // Navigation Helper
    const navigateTo = (stepId: string) => {
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
        // Check validation for Step 1
        if (currentStep === 'fiche') {
            if (!ficheData.category || !ficheData.category.trim()) {
                alert("La catégorie du modèle est obligatoire (ex: T-Shirt, Robe...).");
                return;
            }
        }

        const currentIndex = steps.findIndex(s => s.id === currentStep);
        if (currentIndex < steps.length - 1) {
            navigateTo(steps[currentIndex + 1].id);
        }
    };

    const currentIndex = steps.findIndex(s => s.id === currentStep);
    const isLastStep = currentIndex === steps.length - 1;

    return (
        <div className="flex flex-col h-full overflow-hidden">

            {/* STEPPER HEADER + NAVIGATION */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 shrink-0 flex items-center justify-between gap-4 shadow-sm z-20">

                {/* DATA UNDO/REDO NAVIGATION (Left) */}
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200 shrink-0 mr-2 shadow-sm">
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        className={`p-1.5 rounded-md transition-all ${!canUndo
                            ? 'text-slate-300 cursor-not-allowed bg-slate-50'
                            : 'text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm active:scale-95'
                            }`}
                        title={st.undo}
                    >
                        <Undo2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        className={`p-1.5 rounded-md transition-all ${!canRedo
                            ? 'text-slate-300 cursor-not-allowed bg-slate-50'
                            : 'text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm active:scale-95'
                            }`}
                        title={st.redo}
                    >
                        <Redo2 className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
                    <button
                        onClick={handleRefresh}
                        className="p-1.5 rounded-md text-slate-600 hover:bg-white hover:text-emerald-600 transition-all hover:shadow-sm active:scale-95"
                        title={st.refresh}
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                </div>

                {/* CENTER: STEPS LIST (Scrollable) */}
                <div className="flex-1 flex items-center justify-center overflow-hidden">
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full px-2">
                        {steps.map((step, index) => {
                            const isActive = currentStep === step.id;
                            const isPast = steps.findIndex(s => s.id === currentStep) > index;
                            return (
                                <React.Fragment key={step.id}>
                                    <button
                                        onClick={() => navigateTo(step.id)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${isActive
                                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                                            : isPast
                                                ? 'text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100'
                                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : <step.icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-200' : 'text-slate-400'}`} />}
                                        <span className="hidden md:inline">{step.label}</span>
                                        <span className="md:hidden">{index + 1}</span>
                                    </button>
                                    {index < steps.length - 1 && <div className="w-4 h-px bg-slate-200 shrink-0 hidden sm:block"></div>}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT: ACTIONS (Detached) */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={onSaveToLibrary}
                        className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold shadow-sm transition-all"
                        title={st.save}
                    >
                        <Save className="w-4 h-4" />
                        <span className="hidden xl:inline">{st.save}</span>
                    </button>

                    <button
                        onClick={isLastStep ? onSaveToLibrary : handleLinearNext}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm ${isLastStep
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 hover:shadow-emerald-300'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 hover:shadow-indigo-300'
                            }`}
                    >
                        <span className="hidden sm:inline">{isLastStep ? st.finish : st.next}</span>
                        {isLastStep ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-hidden relative bg-slate-50/50">
                <div id="workflow-content" className="absolute inset-0 p-4 sm:p-6 lg:p-8 overflow-y-auto custom-scrollbar">

                    {currentStep === 'fiche' && (
                        <FicheTechnique
                            data={ficheData} setData={setFicheData}
                            articleName={articleName} setArticleName={setArticleName}
                            totalTime={globalStats.totalTime}
                            tempsArticle={globalStats.tempsArticle}
                            numWorkers={numWorkers} setNumWorkers={setNumWorkers}
                            efficiency={efficiency} setEfficiency={setEfficiency}
                            images={ficheImages} setImages={setFicheImages}
                            onNext={handleLinearNext}
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
                            isAutocompleteEnabled={isAutocompleteEnabled}
                            userVocabulary={userVocabulary} setUserVocabulary={setUserVocabulary}
                            // Pass fabric settings
                            fabricSettings={fabricSettings}
                            setFabricSettings={setFabricSettings}
                        />
                    )}

                    {currentStep === 'chrono' && (
                        <Chronometrage
                            operations={operations}
                            chronoData={chronoData}
                            setChronoData={setChronoData}
                            presenceTime={presenceTime}
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
                            setManualLinks={handleSetManualLinks}
                        />
                    )}

                    {currentStep === 'couts' && (() => {
                        const calculatedChronoTotal = Object.values(chronoData).reduce((sum, item) => sum + (item.tempMajore || 0), 0);
                        return (
                            <CostCalculator
                                initialArticleName={articleName}
                                initialTotalTime={globalStats.tempsArticle}
                                chronoTotalTime={calculatedChronoTotal}
                                initialImage={ficheImages.front}
                                initialDate={ficheData.date}
                                initialCostMinute={ficheData.costMinute}
                                settings={settings}
                                ficheData={ficheData}
                                setFicheData={setFicheData}
                            />
                        );
                    })()}

                </div>
            </div>
        </div>
    );
}
