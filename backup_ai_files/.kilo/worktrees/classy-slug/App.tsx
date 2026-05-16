
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    LayoutDashboard,
    FolderOpen,
    Settings as SettingsIcon,
    Bell,
    Search,
    Save,
    CheckCircle2,
    CloudOff,
    LogOut,
    Shield,
    Activity,
    Package,
    Scissors,
    Users,
    Layers,
    Factory,
    PackageCheck
} from 'lucide-react';
import ModelWorkflow from './components/ModelWorkflow';
import Library from './components/Library';
import LaCoupe from './components/LaCoupe';
import Effectifs from './components/Effectifs';
import Machin from './components/Machin';
import Profil from './components/Profil';
import Planning from './components/Planning';
import SuiviLive from './components/SuiviLive';
import Dashboard from './components/Dashboard';
import Magasin from './components/Magasin';
import Atelier from './components/Atelier';
import AdminDashboard from './src/components/AdminDashboard';
import { useAuth } from './src/context/AuthContext';
import Login from './src/components/Login';
import Signup from './src/components/Signup';
import { Machine, Operation, FicheData, Poste, SpeedFactor, ComplexityFactor, StandardTime, Guide, ModelData, AppSettings } from './types';
import Configuration from './components/Configuration';
import StockExport from './components/StockExport';
import LicenseScreen from './components/LicenseScreen';

const DEFAULT_SETTINGS: AppSettings = {
    costMinute: 0.85,
    useCostMinute: true,
    cutRate: 12,
    packRate: 8,
    marginAtelier: 17.5,
    tva: 20,
    marginBoutique: 30,
    workingHoursStart: '08:00',
    workingHoursEnd: '18:00',
    timeFormat: '24h',
    pauses: [{ id: '1', name: 'Pause Déjeuner', start: '12:00', end: '13:00', durationMin: 60 }],
    workingDays: [1, 2, 3, 4, 5],
    currency: 'MAD',
    chainsCount: 12,
    organigram: [],
    chainStaff: {},
    calendarExceptions: {}
};

// Default Data - UPDATED WITH EXCEL DATA
const DEFAULT_MACHINES: Machine[] = [
    { id: '1', name: 'Surjeteuse 5 Fils', classe: '516', speed: 5500, speedMajor: 1.01, cofs: 1.19, active: true },
    { id: '2', name: 'Surjeteuse 4 Fils', classe: '514', speed: 6000, speedMajor: 1.01, cofs: 1.17, active: true },
    { id: '3', name: 'Surjeteuse 3 Fils', classe: '504', speed: 6000, speedMajor: 1.01, cofs: 1.15, active: true },
    { id: '4', name: 'Piqueuse Plate', classe: '301', speed: 4500, speedMajor: 1.01, cofs: 1.17, active: true },
    { id: '5', name: 'Piqueuse Double Aig', classe: '316', speed: 3000, speedMajor: 1.01, cofs: 1.23, active: true },
    { id: '6', name: 'Colleteuse', classe: '602', speed: 4500, speedMajor: 1.01, cofs: 1.15, active: true },
    { id: '7', name: 'Chainette 2 Aig', classe: '402', speed: 4000, speedMajor: 1.01, cofs: 1.14, active: true },
    { id: '8', name: 'Point Invisible', classe: '101', speed: 2500, speedMajor: 1.01, cofs: 1.19, active: true },
    { id: '9', name: 'Pose Bouton', classe: '107', speed: 1800, speedMajor: 1.01, cofs: 1.17, active: true },
    { id: '10', name: 'Boutonnière Droite', classe: '304', speed: 2000, speedMajor: 1.01, cofs: 1.17, active: true },
    { id: '11', name: 'Brideuse', classe: 'BR', speed: 2200, speedMajor: 1.01, cofs: 1.18, active: true },
    { id: '12', name: 'ZigZag', classe: 'ZIGZAG', speed: 3000, speedMajor: 1.01, cofs: 1.19, active: true },
    { id: '13', name: 'Manuel', classe: 'MAN', speed: 0, speedMajor: 1.01, cofs: 1.12, active: true },
    { id: '14', name: 'Repassage', classe: 'FER', speed: 0, speedMajor: 1.01, cofs: 1.12, active: true },
];

const DEFAULT_GUIDES: Guide[] = [
    // --- PIQUEUSE PLATE (301) ---
    { id: 'g1', name: 'Guide Bordeur (Biais)', category: 'Bordeurs & Ourleurs', machineType: 'Piqueuse Plate (301)', description: 'Pour poser du biais à cheval (Ganser).', useCase: 'Encolure, Emmanchure' },
    { id: 'g2', name: 'Pied Compensé (1/16 - 1mm)', category: 'Surpiqûre & Précision', machineType: 'Piqueuse Plate (301)', description: 'Pour surpiqûre nervure régulière (Sirpikaj).', useCase: 'Col, Poignet, Rabat' },
    { id: 'g3', name: 'Pied Compensé (1/4 - 6mm)', category: 'Surpiqûre & Précision', machineType: 'Piqueuse Plate (301)', description: 'Pour surpiqûre large (Sebbat 0.5).', useCase: 'Plaquage poches, Jeans' },
    { id: 'g4', name: 'Pied Fermeture Invisible', category: 'Opérations Spéciales', machineType: 'Piqueuse Plate (301)', description: 'Pour poser les zips invisibles (Snsla Madfona).', useCase: 'Robe, Jupe, Pantalon' },
    { id: 'g5', name: 'Pied Unilatéral (Demi-Pied)', category: 'Opérations Spéciales', machineType: 'Piqueuse Plate (301)', description: 'Pour poser fermeture éclair standard ou passepoil.', useCase: 'Braguette, Coussins' },
    { id: 'g6', name: 'Guide Ourleur (Escargot)', category: 'Bordeurs & Ourleurs', machineType: 'Piqueuse Plate (301)', description: 'Pour faire un ourlet roulotté fin (Ghli R9i9).', useCase: 'Bas chemise, Foulard' },
    { id: 'g7', name: 'Pied Téflon (Plastique)', category: 'Matières Difficiles', machineType: 'Piqueuse Plate (301)', description: 'Pour matières glissantes ou collantes (Cuir, Skai).', useCase: 'Cuir, Simili, Vinyl' },
    { id: 'g8', name: 'Pied Fronceur', category: 'Fronces & Plis', machineType: 'Piqueuse Plate (301)', description: 'Pour froncer automatiquement (Tkrich/Kmmch).', useCase: 'Volants, Manches ballon' },
    { id: 'g9', name: 'Guide Aimanté', category: 'Guides & Jauges', machineType: 'Piqueuse Plate (301)', description: 'Guide mobile pour largeur couture fixe.', useCase: 'Toutes coutures droites' },
    { id: 'g10', name: 'Guide Passepoil', category: 'Opérations Spéciales', machineType: 'Piqueuse Plate (301)', description: 'Pour insérer un passepoil régulier.', useCase: 'Coussins, Poches, Cols' },

    // --- SURJETEUSE (504/514) ---
    { id: 'g11', name: 'Guide Élastique', category: 'Opérations Spéciales', machineType: 'Surjeteuse 4 Fils (514)', description: 'Pour poser élastique en tension (Lastik).', useCase: 'Ceinture, Lingerie' },
    { id: 'g12', name: 'Guide Ourlet Invisible', category: 'Bordeurs & Ourleurs', machineType: 'Surjeteuse 3 Fils (504)', description: 'Pour ourlet invisible bas de pantalon.', useCase: 'Pantalon Classique' },

    // --- RECOUVREUSE (602) ---
    { id: 'g13', name: 'Guide Colletage', category: 'Bordeurs & Ourleurs', machineType: 'Colleteuse (602)', description: 'Pour poser bande de propreté ou biais (Bande).', useCase: 'T-shirt, Col' },
    { id: 'g14', name: 'Guide Ourlet (Bas)', category: 'Bordeurs & Ourleurs', machineType: 'Colleteuse (602)', description: 'Pour ourlet bas et manches (Ghli).', useCase: 'T-shirt, Polo' },

    // --- DOUBLE AIGUILLE (316) ---
    { id: 'g15', name: 'Guide Ceinture', category: 'Guides & Jauges', machineType: 'Piqueuse Double Aig (316)', description: 'Pour montage ceinture (Samta).', useCase: 'Jeans, Pantalon' }
];

const AUTO_SAVE_KEY = 'beramethode_autosave_v1';
const LIBRARY_KEY = 'beramethode_library'; // New Key for Persistence

// History State Type
type HistoryState = {
    operations: Operation[];
    assignments: Record<string, string[]>;
    postes: Poste[];
};

// ── Language Translations ────────────────────────────────────────────────────
const TRANSLATIONS = {
    fr: {
        ingenierie: 'Ingénierie',
        atelier: 'Atelier',
        bibliotheque: 'Bibliothèque',
        configuration: 'Configuration',
        admin: 'Admin',
        saved: 'Sauvegardé',
        saving: 'Enregistrement...',
        unsaved: 'Non enregistré',
        logout: 'Logout',
        langBtn: 'عربي',
        // Workflow steps
        fiche: 'Fiche Technique',
        gamme: 'Gamme',
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
        ingenierie: 'الهندسة',
        atelier: 'الورشة',
        bibliotheque: 'المكتبة',
        configuration: 'الإعدادات',
        admin: 'المشرف',
        saved: 'محفوظ',
        saving: 'جارٍ الحفظ...',
        unsaved: 'غير محفوظ',
        logout: 'تسجيل الخروج',
        langBtn: 'FR',
        // Workflow steps
        fiche: 'الملف التقني',
        gamme: 'سلسلة العمليات',
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
type Lang = 'fr' | 'ar';

export default function App() {
    const { user, loading, logout } = useAuth();
    const [authView, setAuthView] = useState<'login' | 'signup'>('login');
    const [isGuest, setIsGuest] = useState(true); // DEFAULT TO TRUE - NO LOGIN REQUIRED
    const [lang, setLang] = useState<Lang>('fr');
    const t = TRANSLATIONS[lang];

    // --- AUTO GUEST LOGIN TRICK ---
    // This silently gets a valid token from the server without needing to restart it!
    useEffect(() => {
        if (isGuest && !user) {
            fetch('/api/auth/register', { 
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name: 'Force Guest', email: 'guest123@local.com', password: '123' })
            }).finally(() => {
                fetch('/api/auth/login', { 
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ email: 'guest123@local.com', password: '123' })
                });
            });
        }
    }, [isGuest, user]);

    // --- STATE: NAVIGATION ---
    const [currentView, setCurrentView] = useState<'dashboard' | 'ingenierie' | 'atelier' | 'library' | 'coupe' | 'effectifs' | 'planning' | 'suivi' | 'magasin' | 'export' | 'config' | 'parametres' | 'profil' | 'admin'>('dashboard');
    const [navigationContext, setNavigationContext] = useState<'coupe' | 'planning' | null>(null); // NEW: Track where to return to
    const [planningEvents, setPlanningEvents] = useState<import('./types').PlanningEvent[]>(() => {
        try {
            const saved = localStorage.getItem('beramethode_planning');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    const [suivis, setSuivis] = useState<import('./types').SuiviData[]>(() => {
        try {
            const saved = localStorage.getItem('beramethode_suivis');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    // --- STATE: MAGASIN & ATELIER ---
    const [demandesAppro, setDemandesAppro] = useState<import('./types').DemandeAppro[]>(() => {
        try {
            const saved = localStorage.getItem('beramethode_demandesAppro');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    // Save planning and suivis to localstorage
    useEffect(() => {
        localStorage.setItem('beramethode_planning', JSON.stringify(planningEvents));
        localStorage.setItem('beramethode_suivis', JSON.stringify(suivis));
        localStorage.setItem('beramethode_demandesAppro', JSON.stringify(demandesAppro));
    }, [planningEvents, suivis, demandesAppro]);

    const handleAddDemandeAppro = (d: Partial<import('./types').DemandeAppro>) => {
        const newDemande: import('./types').DemandeAppro = {
            id: `DA-${Date.now()}`,
            dateDemande: new Date().toISOString(),
            modelId: d.modelId || '',
            chaineId: d.chaineId || '',
            produitDesignation: d.produitDesignation || '',
            quantiteDemandee: d.quantiteDemandee || 0,
            demandeur: d.demandeur || 'Atelier',
            notes: d.notes,
            statut: 'attente'
        };
        setDemandesAppro(prev => [newDemande, ...prev]);
    };

    // --- STATE: LAYOUT MEMORY (Lifted Up) ---
    const [layoutMemory, setLayoutMemory] = useState<Record<string, { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[]>>({});
    const [activeLayout, setActiveLayout] = useState<'zigzag' | 'snake' | 'grid' | 'wheat' | 'free' | 'line'>('zigzag'); // NEW: Track active layout
    const [savedPlantations, setSavedPlantations] = useState<{ id: string, name: string, date: string, layoutType: string, postes: { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[] }[]>([]); // NEW: Manual saves

    // --- STATE: GLOBAL DATA (MACHINES & CONFIG) ---
    const [globalSettings, setGlobalSettings] = useState<AppSettings>(() => {
        try {
            const saved = localStorage.getItem('beramethode_settings');
            return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
        } catch { return DEFAULT_SETTINGS; }
    });

    useEffect(() => {
        localStorage.setItem('beramethode_settings', JSON.stringify(globalSettings));
    }, [globalSettings]);

    // --- PHASE 24: TASK ROLLOVER LOGIC ---
    // Automatically move PENDING tasks from the past to TODAY
    useEffect(() => {
        if (!globalSettings.tasks || globalSettings.tasks.length === 0) return;

        const todayTimestamp = new Date().setHours(0, 0, 0, 0); // Start of today

        // Find tasks that need rollover
        let needsUpdate = false;
        const updatedTasks = globalSettings.tasks.map(task => {
            if (task.status === 'PENDING') {
                const taskTimestamp = new Date(task.date).setHours(0, 0, 0, 0);
                if (taskTimestamp < todayTimestamp) {
                    needsUpdate = true;
                    return {
                        ...task,
                        date: new Date().toISOString().split('T')[0] // Set to today
                    };
                }
            }
            return task;
        });

        if (needsUpdate) {
            setGlobalSettings(prev => ({
                ...prev,
                tasks: updatedTasks
            }));
        }
    }, [globalSettings.tasks]);


    const [machines, setMachines] = useState<Machine[]>(DEFAULT_MACHINES);

    const [speedFactors, setSpeedFactors] = useState<SpeedFactor[]>([]);
    const [complexityFactors, setComplexityFactors] = useState<ComplexityFactor[]>([
        { id: '1', label: 'Simple', value: 1.0 },
        { id: '2', label: 'Moyen', value: 1.1 },
        { id: '3', label: 'Complexe', value: 1.2 }
    ]);
    const [standardTimes, setStandardTimes] = useState<StandardTime[]>([]);
    const [guides, setGuides] = useState<Guide[]>(DEFAULT_GUIDES);

    // Autocomplete
    const [isAutocompleteEnabled, setIsAutocompleteEnabled] = useState(true);
    const [userVocabulary, setUserVocabulary] = useState<string[]>([]);

    // --- STATE: CURRENT MODEL (WORKFLOW) ---
    const [currentModelId, setCurrentModelId] = useState<string | null>(null); // NEW: Track currently open model ID
    const [articleName, setArticleName] = useState('');
    const [efficiency, setEfficiency] = useState(85);
    const [numWorkers, setNumWorkers] = useState(1);
    const [presenceTime, setPresenceTime] = useState(480); // 8 hours in mins
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

    // CORE MODEL STATE
    const [operations, setOperations] = useState<Operation[]>([]);
    const [assignments, setAssignments] = useState<Record<string, string[]>>({});
    const [postes, setPostes] = useState<Poste[]>([]);

    // --- NEW: CHRONO STATE ---
    const [chronoData, setChronoData] = useState<Record<string, import('./types').ChronoData>>({});

    // --- HISTORY MANAGEMENT ---
    const [history, setHistory] = useState<HistoryState[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Initialize History
    useEffect(() => {
        if (history.length === 0) {
            const initialState = { operations, assignments, postes };
            setHistory([initialState]);
            setHistoryIndex(0);
        }
    }, []);

    const saveToHistory = useCallback((newState: HistoryState) => {
        setHistory(prev => {
            const currentHistory = prev.slice(0, historyIndex + 1);
            const newHistory = [...currentHistory, newState];
            // Limit history to 50 steps to prevent memory issues
            if (newHistory.length > 50) newHistory.shift();
            return newHistory;
        });
        setHistoryIndex(prev => Math.min(prev + 1, 49));
    }, [historyIndex]);

    const handleUndo = () => {
        if (historyIndex > 0) {
            const prevIndex = historyIndex - 1;
            const prevState = history[prevIndex];
            setOperations(prevState.operations);
            setAssignments(prevState.assignments);
            setPostes(prevState.postes);
            setHistoryIndex(prevIndex);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            const nextState = history[nextIndex];
            setOperations(nextState.operations);
            setAssignments(nextState.assignments);
            setPostes(nextState.postes);
            setHistoryIndex(nextIndex);
        }
    };

    // Wrapped Setters to trigger History Save
    const setOperationsWithHistory = (action: React.SetStateAction<Operation[]>) => {
        setOperations(prev => {
            const newVal = typeof action === 'function' ? (action as Function)(prev) : action;
            saveToHistory({ operations: newVal, assignments, postes });
            return newVal;
        });
    };

    const setAssignmentsWithHistory = (action: React.SetStateAction<Record<string, string[]>>) => {
        setAssignments(prev => {
            const newVal = typeof action === 'function' ? (action as Function)(prev) : action;
            saveToHistory({ operations, assignments: newVal, postes });
            return newVal;
        });
    };

    const setPostesWithHistory = (action: React.SetStateAction<Poste[]>) => {
        setPostes(prev => {
            const newVal = typeof action === 'function' ? (action as Function)(prev) : action;
            saveToHistory({ operations, assignments, postes: newVal });
            return newVal;
        });
    };

    // --- REST OF STATE ---
    const [ficheData, setFicheData] = useState<FicheData>({
        date: new Date().toISOString().split('T')[0],
        client: '',
        category: '',
        designation: '',
        color: '',
        quantity: 0,
        chaine: '',
        targetEfficiency: 85,
        unitCost: 0,
        clientPrice: 0,
        observations: '',
        costMinute: 0.85
    });

    const [ficheImages, setFicheImages] = useState<{ front: string | null; back: string | null }>({ front: null, back: null });



    // --- AUTO-SAVE LOGIC ---

    // 1. Load from LocalStorage on Mount
    useEffect(() => {
        const savedData = localStorage.getItem(AUTO_SAVE_KEY);
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                // Only load if there is meaningful data
                if (parsed.articleName || parsed.operations?.length > 0) {
                    console.log("Loading Auto-Save...");
                    if (parsed.currentModelId) setCurrentModelId(parsed.currentModelId);
                    if (parsed.articleName) setArticleName(parsed.articleName);
                    if (parsed.operations) setOperations(parsed.operations);
                    if (parsed.assignments) setAssignments(parsed.assignments);
                    if (parsed.postes) setPostes(parsed.postes);
                    if (parsed.ficheData) setFicheData(parsed.ficheData);
                    if (parsed.ficheImages) setFicheImages(parsed.ficheImages);
                    if (parsed.efficiency) setEfficiency(parsed.efficiency);
                    if (parsed.numWorkers) setNumWorkers(parsed.numWorkers);
                    if (parsed.presenceTime) setPresenceTime(parsed.presenceTime);
                    if (parsed.layoutMemory) setLayoutMemory(parsed.layoutMemory);
                    if (parsed.activeLayout) setActiveLayout(parsed.activeLayout);
                    if (parsed.savedPlantations) setSavedPlantations(parsed.savedPlantations);
                    if (parsed.chronoData) setChronoData(parsed.chronoData); // NEW: Load chrono data

                    // Re-init history with loaded state
                    setHistory([{
                        operations: parsed.operations || [],
                        assignments: parsed.assignments || {},
                        postes: parsed.postes || []
                    }]);
                    setHistoryIndex(0);
                }
            } catch (e) {
                console.error("Failed to load auto-save", e);
            }
        }
    }, []);

    // 2. Save to LocalStorage on Change (Debounced)
    useEffect(() => {
        setSaveStatus('saving');
        const timer = setTimeout(() => {
            const dataToSave = {
                currentModelId,
                articleName,
                operations,
                assignments,
                postes,
                ficheData,
                ficheImages,
                efficiency,
                numWorkers,
                presenceTime,
                layoutMemory,
                activeLayout,
                savedPlantations,
                chronoData, // NEW: Save chrono data
                lastSaved: Date.now()
            };

            try {
                localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(dataToSave));
                setSaveStatus('saved');
            } catch (e) {
                console.error("Auto-save failed (likely quota exceeded)", e);
                setSaveStatus('unsaved');
            }
        }, 2000); // Save after 2 seconds of inactivity

        return () => clearTimeout(timer);
    }, [currentModelId, articleName, operations, assignments, postes, ficheData, ficheImages, efficiency, numWorkers, presenceTime, layoutMemory, activeLayout, savedPlantations, chronoData]);


    // --- DERIVED STATS ---
    const globalStats = useMemo(() => {
        const totalTime = operations.reduce((acc, op) => acc + (op.time || 0), 0);
        const tempsArticle = Math.round((totalTime * 1.20) * 100) / 100;
        const calculatedBF = (numWorkers > 0 && efficiency > 0)
            ? tempsArticle / (numWorkers * (efficiency / 100))
            : 0;

        return { totalTime, tempsArticle, bf: calculatedBF };
    }, [operations, numWorkers, presenceTime, efficiency]);

    // --- LIBRARY STATE & PERSISTENCE ---
    const [models, setModels] = useState<ModelData[]>([]);

    // 1. Load Library on Mount (Server or Local)
    useEffect(() => {
        if (user) {
            // Load from Server
            fetch('/api/models')
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Failed to fetch models');
                })
                .then(data => setModels(data))
                .catch(err => console.error(err));
        } else {
            // Load from LocalStorage (Guest)
            const savedLibrary = localStorage.getItem(LIBRARY_KEY);
            if (savedLibrary) {
                try {
                    const parsed = JSON.parse(savedLibrary);
                    if (Array.isArray(parsed)) {
                        setModels(parsed);
                    }
                } catch (e) {
                    console.error("Failed to load Library", e);
                }
            }
        }
    }, [user]);

    // 2. Persist Library on Change (Server or Local)
    // Note: For server, we usually save individually, but here we might need to refactor saveCurrentModel
    // to call API directly instead of relying on this effect.
    // For now, let's keep LocalStorage sync for Guest, and disable it for User (handled in saveCurrentModel)
    useEffect(() => {
        if (!user && models.length > 0) {
            try {
                localStorage.setItem(LIBRARY_KEY, JSON.stringify(models));
            } catch (e) {
                console.error("Failed to save Library (Quota?)", e);
            }
        }
    }, [models, user]);

    // --- EXPORT EVENT LISTENER ---
    useEffect(() => {
        const handleExportModel = (e: any) => {
            const { modelId } = e.detail;
            setModels(prev => prev.map(m => m.id === modelId ? { ...m, workflowStatus: 'EXPORT' } : m));
            setPlanningEvents(prev => prev.map(evt => evt.modelId === modelId ? { ...evt, status: 'DONE' } : evt));
        };
        window.addEventListener('export-model', handleExportModel);
        return () => window.removeEventListener('export-model', handleExportModel);
    }, []);

    // --- RENDERING CONDITIONS ---
    // License screen removed - app opens directly

    if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

    if (!user && !isGuest) {
        return authView === 'login'
            ? <Login onSwitch={() => setAuthView('signup')} onGuest={() => setIsGuest(true)} />
            : <Signup onSwitch={() => setAuthView('login')} />;
    }

    const handleSaveMachine = (m: Machine) => {
        setMachines(prev => {
            const exists = prev.find(item => item.id === m.id);
            if (exists) return prev.map(item => item.id === m.id ? m : item);
            return [...prev, m];
        });
    };

    const handleDeleteMachine = (id: string) => {
        setMachines(prev => prev.filter(m => m.id !== id));
    };

    const handleToggleMachine = (id: string) => {
        setMachines(prev => prev.map(m => m.id === id ? { ...m, active: !m.active } : m));
    };

    const saveCurrentModel = () => {
        // 1. VALIDATION: Category is mandatory
        if (!ficheData.category || ficheData.category.trim() === '') {
            alert("Erreur : La catégorie (Famille produit) est obligatoire pour sauvegarder. Veuillez la renseigner dans la Fiche Technique.");
            return;
        }

        // 2. PREPARE DATA
        // Update layoutMemory with current postes state for the active layout
        const currentLayoutSnapshot = postes.map(p => ({
            id: p.id,
            x: p.x,
            y: p.y,
            isPlaced: p.isPlaced,
            rotation: p.rotation
        }));
        const updatedLayoutMemory = { ...layoutMemory, [activeLayout]: currentLayoutSnapshot };
        setLayoutMemory(updatedLayoutMemory); // Update state as well

        // If updating, keep existing ID and date_creation. If new, generate.
        const modelToSave: ModelData = {
            id: currentModelId || Date.now().toString(),
            filename: `${articleName || 'Sans_Nom'}.json`,
            image: ficheImages.front, // Thumbnail
            images: ficheImages,      // FULL IMAGES (Front + Back)
            ficheData: ficheData,     // NEW: Store complete FicheData for matrix sync
            meta_data: {
                nom_modele: articleName || 'Sans Nom',
                category: ficheData.category,
                date_creation: currentModelId
                    ? (models.find(m => m.id === currentModelId)?.meta_data.date_creation || new Date().toISOString())
                    : new Date().toISOString(),
                date_lancement: ficheData.date,
                total_temps: globalStats.tempsArticle,
                effectif: numWorkers,
                sizes: ficheData.sizes,
                colors: ficheData.colors,
                quantity: ficheData.quantity
            },
            gamme_operatoire: operations,
            implantation: {
                postes: postes,
                assignments: assignments,
                layoutMemory: updatedLayoutMemory,
                activeLayout: activeLayout
            }
        };

        // 3. UPDATE OR ADD
        if (user) {
            // Save to Server
            fetch('/api/models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modelToSave)
            })
                .then(res => {
                    if (!res.ok) throw new Error('Failed to save to server');
                    return res.json();
                })
                .then(() => {
                    setModels(prev => {
                        if (currentModelId) {
                            return prev.map(m => m.id === currentModelId ? modelToSave : m);
                        } else {
                            return [modelToSave, ...prev];
                        }
                    });
                    setCurrentModelId(modelToSave.id);
                    alert("Modèle sauvegardé avec succès (Cloud) !");
                    setCurrentView('library');
                })
                .catch(err => {
                    console.error(err);
                    alert("Erreur lors de la sauvegarde sur le serveur.");
                });
        } else {
            // Save to LocalStorage (Guest)
            setModels(prev => {
                if (currentModelId) {
                    return prev.map(m => m.id === currentModelId ? modelToSave : m);
                } else {
                    return [modelToSave, ...prev];
                }
            });
            setCurrentModelId(modelToSave.id);
            alert("Modèle sauvegardé avec succès (Local) !");
            setCurrentView('library');
        }
    };

    const loadModel = (model: ModelData, fromContext?: 'coupe' | 'planning' | null) => {
        setCurrentModelId(model.id); // Track the loaded model ID
        if (fromContext !== undefined) {
            setNavigationContext(fromContext);
        } else {
            setNavigationContext(null); // Default to clear if not explicitly provided
        }
        setArticleName(model.meta_data.nom_modele);
        setOperations(model.gamme_operatoire || []);
        setNumWorkers(model.meta_data.effectif || 1);

        // Load Complete FicheData if available, else fallback to meta_data assembly
        if (model.ficheData) {
            setFicheData(model.ficheData);
        } else {
            setFicheData(prev => ({
                ...prev,
                date: model.meta_data.date_lancement || new Date().toISOString().split('T')[0],
                category: model.meta_data.category || '',
                sizes: model.meta_data.sizes || [],
                colors: model.meta_data.colors || [],
                quantity: model.meta_data.quantity || 0,
            }));
        }

        // RESTORE IMAGES
        if (model.images) {
            setFicheImages(model.images);
        } else if (model.image) {
            // Legacy support for single image
            setFicheImages({ front: model.image, back: null });
        } else {
            setFicheImages({ front: null, back: null });
        }

        // RESTORE IMPLANTATION IF AVAILABLE
        if (model.implantation) {
            setPostes(model.implantation.postes || []);
            setAssignments(model.implantation.assignments || {});
            setLayoutMemory(model.implantation.layoutMemory || {});
            setActiveLayout(model.implantation.activeLayout || 'zigzag');
        } else {
            // Reset assignments if not in saved model (legacy support)
            setAssignments({});
            setPostes([]);
            setLayoutMemory({});
            setActiveLayout('zigzag');
        }

        // Reset History
        setHistory([{
            operations: model.gamme_operatoire || [],
            assignments: model.implantation?.assignments || {},
            postes: model.implantation?.postes || []
        }]);
        setHistoryIndex(0);

        // DO NOT change workflowStatus here. It just changes the view.
        setCurrentView('atelier');
    };

    const importModel = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target?.result as string);
                if (json && json.meta_data) {
                    setModels(prev => [json, ...prev]);
                }
            } catch (err) {
                console.error("Import failed", err);
            }
        };
        reader.readAsText(file);
    };

    const deleteModel = (id: string) => {
        if (user) {
            fetch(`/api/models/${id}`, { method: 'DELETE' })
                .then(res => {
                    if (res.ok) {
                        setModels(prev => prev.filter(m => m.id !== id));
                        if (currentModelId === id) setCurrentModelId(null);
                    }
                })
                .catch(err => console.error(err));
        } else {
            setModels(prev => prev.filter(m => m.id !== id));
            if (currentModelId === id) setCurrentModelId(null);
        }
    };

    const duplicateModel = (model: ModelData) => {
        const copy = { ...model, id: Date.now().toString(), meta_data: { ...model.meta_data, nom_modele: model.meta_data.nom_modele + ' (Copie)' } };
        setModels(prev => [copy, ...prev]);
    };

    const renameModel = (id: string, newName: string) => {
        setModels(prev => prev.map(m => m.id === id ? { ...m, meta_data: { ...m.meta_data, nom_modele: newName } } : m));
    };

    const handleTransferToCoupe = (model: ModelData) => {
        if (!window.confirm(`Transférer "${model.meta_data.nom_modele}" vers La Coupe ?`)) return;
        setModels(prev => prev.map(m => m.id === model.id ? { ...m, workflowStatus: 'COUPE' } : m));
        setCurrentView('coupe');
    };

    const handleTransferToPlanning = (model: ModelData) => {
        if (!window.confirm(`Planifier "${model.meta_data.nom_modele}" (Envoyer vers Planning) ?`)) return;
        setModels(prev => prev.map(m => m.id === model.id ? { ...m, workflowStatus: 'PLANNING' } : m));
        setCurrentView('planning');
    };

    const createNewProject = () => {
        // Clear Local Storage
        localStorage.removeItem(AUTO_SAVE_KEY);

        setCurrentModelId(null); // Reset ID for new project
        setArticleName('');
        setOperations([]);
        setFicheImages({ front: null, back: null });
        setAssignments({});
        setPostes([]);
        setLayoutMemory({});
        setActiveLayout('zigzag');
        setChronoData({}); // NEW: Reset chrono data
        setFicheData(prev => ({ ...prev, category: '', designation: '' }));

        // Reset History
        setHistory([{ operations: [], assignments: {}, postes: [] }]);
        setHistoryIndex(0);

        setCurrentView('atelier');
    };

    return (
        <div className="flex flex-col h-screen bg-white text-gray-800 font-sans overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            {/* HEADER TOP BAR - COMPACT (h-12) & CLEAN */}
            <header className="bg-white border-b border-gray-100 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] z-50 shrink-0 h-12 sticky top-0 print:hidden">
                <div className="h-full px-4 flex items-center justify-between">
                    {/* Logo Section */}
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center font-black text-sm text-white shadow-sm shadow-emerald-100">
                            B
                        </div>
                        <span className="font-extrabold text-lg tracking-tight text-gray-900 hidden sm:block">
                            BERA<span className="text-emerald-600">METHODE</span>
                        </span>

                        {/* AUTO-SAVE INDICATOR */}
                        {currentView === 'ingenierie' && (
                            <div className="ml-4 flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-full border border-slate-100">
                                {saveStatus === 'saved' ? (
                                    <>
                                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                        <span className="text-[10px] font-bold text-slate-400 hidden md:inline">{t.saved}</span>
                                    </>
                                ) : saveStatus === 'saving' ? (
                                    <>
                                        <div className="w-3 h-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                                        <span className="text-[10px] font-bold text-indigo-400 hidden md:inline">{t.saving}</span>
                                    </>
                                ) : (
                                    <>
                                        <CloudOff className="w-3 h-3 text-amber-500" />
                                        <span className="text-[10px] font-bold text-amber-500 hidden md:inline">{t.unsaved}</span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Main Navigation - Compact Pills */}
                    <nav className="flex items-center gap-1 mx-4 overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => setCurrentView('dashboard')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'dashboard'
                                ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
                            Tableau de bord
                        </button>
                        <button
                            onClick={() => setCurrentView('ingenierie')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'ingenierie'
                                ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <LayoutDashboard className="w-3.5 h-3.5" />
                            {t.ingenierie}
                        </button>
                        <button
                            onClick={() => setCurrentView('atelier')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'atelier'
                                ? 'bg-orange-50 border-orange-100 text-orange-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <Factory className="w-3.5 h-3.5" />
                            {t.atelier}
                        </button>
                        <button
                            onClick={() => setCurrentView('library')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'library'
                                ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <FolderOpen className="w-3.5 h-3.5" />
                            {t.bibliotheque}
                        </button>
                        <button
                            onClick={() => setCurrentView('coupe')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'coupe'
                                ? 'bg-rose-50 border-rose-100 text-rose-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <Scissors className="w-3.5 h-3.5" />
                            La Coupe
                        </button>
                        <button
                            onClick={() => setCurrentView('effectifs')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'effectifs'
                                ? 'bg-orange-50 border-orange-100 text-orange-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <Users className="w-3.5 h-3.5" />
                            Effectifs
                        </button>
                        <button
                            onClick={() => setCurrentView('planning')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'planning'
                                ? 'bg-blue-50 border-blue-100 text-blue-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>
                            Planning
                        </button>
                        <button
                            onClick={() => setCurrentView('suivi')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'suivi'
                                ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <Activity className="w-3.5 h-3.5" />
                            Suivi P°
                        </button>
                        <button
                            onClick={() => setCurrentView('magasin')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'magasin'
                                ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <Package className="w-3.5 h-3.5" />
                            Magasin
                        </button>
                        <button
                            onClick={() => setCurrentView('export')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'export'
                                ? 'bg-cyan-50 border-cyan-100 text-cyan-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <PackageCheck className="w-3.5 h-3.5" />
                            Stock Fini
                        </button>
                        <button
                            onClick={() => setCurrentView('config')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'config'
                                ? 'bg-amber-50 border-amber-100 text-amber-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <SettingsIcon className="w-3.5 h-3.5" />
                            {t.configuration}
                        </button>
                        <button
                            onClick={() => setCurrentView('parametres')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'parametres'
                                ? 'bg-violet-50 border-violet-100 text-violet-700'
                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Paramètres
                        </button>

                        {user?.role === 'admin' && (
                            <button
                                onClick={() => setCurrentView('admin')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'admin'
                                    ? 'bg-purple-50 border-purple-100 text-purple-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <Shield className="w-3.5 h-3.5" />
                                {t.admin}
                            </button>
                        )}
                    </nav>

                    {/* Right Side Tools */}
                    <div className="flex items-center gap-2">
                        {/* Language Toggle Button */}
                        <button
                            onClick={() => setLang(l => l === 'fr' ? 'ar' : 'fr')}
                            className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800 transition-all text-[11px] font-bold tracking-wide"
                            title={lang === 'fr' ? 'Switch to Arabic' : 'Passer au Français'}
                        >
                            <span className="text-base leading-none">{lang === 'fr' ? '🇩🇿' : '🇫🇷'}</span>
                            <span>{t.langBtn}</span>
                        </button>

                        <div className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-100 text-gray-400 hover:text-emerald-600 hover:border-emerald-100 transition-colors cursor-pointer">
                            <Bell className="w-3.5 h-3.5" />
                        </div>

                        {/* User Profile - Compact */}
                        <button
                            onClick={() => setCurrentView('profil')}
                            className={`flex items-center gap-2 pl-1 pr-1 py-1 rounded-full border transition-all ${currentView === 'profil'
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-white border-gray-100 hover:border-gray-200'
                                }`}
                        >
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                                {user?.name ? user.name.substring(0, 2).toUpperCase() : 'SB'}
                            </div>
                        </button>

                        <button
                            onClick={logout}
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-100 text-gray-400 hover:text-red-600 hover:border-red-100 transition-colors cursor-pointer"
                            title={t.logout}
                        >
                            <LogOut className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT */}
            <main className="flex-1 overflow-hidden relative flex flex-col bg-[#fafafa]">
                {currentView === 'dashboard' && (
                    <Dashboard
                        models={models}
                        suivis={suivis}
                        planningEvents={planningEvents}
                        settings={globalSettings}
                        setSettings={setGlobalSettings}
                        onOpenAgenda={() => {
                            setCurrentView('config');
                            // We need to signal Configuration to open Agenda. We can use a custom event or a temporary state.
                            // The simplest way without refactoring too much is dispatching a custom event.
                            setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('open-agenda-modal'));
                            }, 100);
                        }}
                    />
                )}

                {currentView === 'ingenierie' && (
                    <ModelWorkflow
                        machines={machines}
                        operations={operations}
                        setOperations={setOperationsWithHistory}
                        speedFactors={speedFactors}
                        complexityFactors={complexityFactors}
                        standardTimes={standardTimes}
                        guides={guides}

                        articleName={articleName}
                        setArticleName={setArticleName}
                        efficiency={efficiency}
                        setEfficiency={setEfficiency}
                        numWorkers={numWorkers}
                        setNumWorkers={setNumWorkers}
                        presenceTime={presenceTime}
                        setPresenceTime={setPresenceTime}
                        bf={globalStats.bf}
                        globalStats={globalStats}

                        ficheData={ficheData}
                        setFicheData={setFicheData}
                        ficheImages={ficheImages}
                        setFicheImages={setFicheImages}

                        settings={globalSettings}
                        setSettings={setGlobalSettings}

                        assignments={assignments}
                        setAssignments={setAssignmentsWithHistory}
                        postes={postes}
                        setPostes={setPostesWithHistory}

                        isAutocompleteEnabled={isAutocompleteEnabled}
                        userVocabulary={userVocabulary}
                        setUserVocabulary={setUserVocabulary}

                        layoutMemory={layoutMemory}
                        setLayoutMemory={setLayoutMemory}
                        activeLayout={activeLayout}
                        setActiveLayout={setActiveLayout}

                        chronoData={chronoData}
                        setChronoData={setChronoData}

                        onSaveToLibrary={saveCurrentModel}

                        // History Props
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        canUndo={historyIndex > 0}
                        canRedo={historyIndex < history.length - 1}
                        lang={lang}
                    />
                )}

                {currentView === 'atelier' && (
                    <Atelier
                        models={models}
                        planningEvents={planningEvents}
                        suivis={suivis}
                        settings={globalSettings}
                        handleAddDemandeAppro={handleAddDemandeAppro}
                        setPlanningEvents={setPlanningEvents}
                        setModels={setModels}
                        setSuivis={setSuivis}
                    />
                )}

                {currentView === 'library' && (
                    <Library
                        models={models}
                        onLoadModel={loadModel}
                        onImportModel={importModel}
                        onDeleteModel={deleteModel}
                        onDuplicateModel={duplicateModel}
                        onRenameModel={renameModel}
                        onCreateNewProject={createNewProject}
                        onTransferToCoupe={handleTransferToCoupe}
                        onTransferToPlanning={handleTransferToPlanning}
                    />
                )}

                {currentView === 'coupe' && (
                    <LaCoupe
                        models={models}
                        setModels={setModels}
                        onOpenInAtelier={loadModel}
                        currentModelId={currentModelId}
                        setFicheData={setFicheData}
                    />
                )}

                {currentView === 'effectifs' && (
                    <Effectifs settings={globalSettings} />
                )}

                {currentView === 'planning' && (
                    <Planning
                        models={models}
                        planningEvents={planningEvents}
                        setPlanningEvents={setPlanningEvents}
                        setModels={setModels}
                        setSuivis={setSuivis}
                        setCurrentView={setCurrentView}
                        settings={globalSettings}
                    />
                )}

                {currentView === 'suivi' && (
                    <SuiviLive
                        models={models}
                        suivis={suivis}
                        setSuivis={setSuivis}
                        planningEvents={planningEvents}
                        settings={globalSettings}
                    />
                )}

                {currentView === 'magasin' && (
                    <Magasin
                        models={models}
                        planningEvents={planningEvents}
                        demandes={demandesAppro}
                        setDemandes={setDemandesAppro}
                        lang={lang}
                    />
                )}

                {currentView === 'export' && (
                    <StockExport
                        models={models}
                        suivis={suivis}
                        planningEvents={planningEvents}
                    />
                )}

                {currentView === 'config' && (
                    <div className="flex-1 overflow-y-auto no-scrollbar bg-[#fafafa]">
                        <Configuration settings={globalSettings} setSettings={setGlobalSettings} lang={lang} />
                    </div>
                )}

                {currentView === 'parametres' && (
                    <div className="flex-1 overflow-y-auto no-scrollbar bg-[#fafafa]">
                        <div className="px-8 max-w-6xl mx-auto pb-24 pt-6">
                            <Machin
                                machines={machines}
                                onSave={handleSaveMachine}
                                onDelete={handleDeleteMachine}
                                onToggle={handleToggleMachine}

                                speedFactors={speedFactors}
                                setSpeedFactors={setSpeedFactors}
                                complexityFactors={complexityFactors}
                                setComplexityFactors={setComplexityFactors}
                                standardTimes={standardTimes}
                                setStandardTimes={setStandardTimes}
                                guides={guides}
                                setGuides={setGuides}

                                isAutocompleteEnabled={isAutocompleteEnabled}
                                setIsAutocompleteEnabled={setIsAutocompleteEnabled}
                            />
                        </div>
                    </div>
                )}

                {currentView === 'profil' && <Profil />}

                {currentView === 'admin' && user?.role === 'admin' && <AdminDashboard />}

                {/* --- FLOATING RETURN BUTTON --- */}
                {navigationContext && (currentView === 'atelier' || currentView === 'library') && (
                    <div className="absolute bottom-8 right-8 z-[100] animate-in fade-in slide-in-from-bottom-8 duration-500">
                        <button
                            onClick={() => {
                                setCurrentView(navigationContext);
                                setNavigationContext(null); // Clear context after returning
                            }}
                            className="group flex flex-col items-center gap-2 bg-slate-900 border border-slate-700 text-white rounded-2xl p-4 shadow-2xl hover:bg-slate-800 hover:-translate-y-1 transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                    <LogOut className="w-4 h-4 text-white rotate-180" />
                                </div>
                                <div className="text-left leading-tight">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-300">Quitter le composant</p>
                                    <p className="font-black text-sm">Retourner au {navigationContext === 'coupe' ? 'La Coupe' : 'Planning'}</p>
                                </div>
                            </div>
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
