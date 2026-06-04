import React, { useState, useMemo, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import GlobalLoader from './components/GlobalLoader';
import AnnouncementBar from './components/AnnouncementBar';
import LicenseBanner from './components/LicenseBanner';
import { runBootSequence } from './lib/bootSequence';
import {
    LogOut,
    Save,
    AlertTriangle,
    Factory,
    FolderOpen,
    Scissors,
    Users,
    Activity,
    Package,
    PackageCheck,
    Settings as SettingsIcon,
    Layers,
    Target,
    Shield,
    CheckCircle2,
    X,
    Truck,
    Share2
} from 'lucide-react';
import { useAuth } from './src/context/AuthContext';
import { useLicense } from './src/context/LicenseContext';
import { DataOwnerProvider } from './src/context/DataOwnerContext';
import { notifyServerSessionEstablished } from './lib/dataIdentity';
import { Machine, MachineInstance, MachineFleetHistoryEntry, Operation, FicheData, Poste, SpeedFactor, ComplexityFactor, StandardTime, Guide, ModelData, AppSettings, ManualLink } from './types';
import type { MachineExitPayload } from './components/MachineExitModal';
import { sumPiecesFromSuiviForPlanning } from './utils/produced';
import { rollPlanningEvents } from './utils/planning';
import { computeChainEfficiency } from './utils/efficiency';
import { DEFAULT_CALENDAR_APP_SETTINGS } from './lib/defaultCalendarSettings';

const Login = lazy(() => import('./src/components/Login'));
const Signup = lazy(() => import('./src/components/Signup'));
const AdminDashboard = lazy(() => import('./src/components/AdminDashboard'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const Planning = lazy(() => import('./components/Planning'));
const Magasin = lazy(() => import('./components/Magasin'));
const GestionRH = lazy(() => import('./components/GESTION-RH'));
const Facturation = lazy(() => import('./components/Facturation'));
const Configuration = lazy(() => import('./components/Configuration'));
const ModelWorkflow = lazy(() => import('./components/ModelWorkflow'));
const Library = lazy(() => import('./components/Library'));
const LaCoupe = lazy(() => import('./components/LaCoupe'));
const Effectifs = lazy(() => import('./components/Effectifs'));
const Profil = lazy(() => import('./components/Profil'));
const SuiviProduction = lazy(() => import('./components/SuiviProduction'));
const RendementBoard = lazy(() => import('./components/RendementBoard'));
const StockExport = lazy(() => import('./components/StockExport'));
const Machin = lazy(() => import('./components/Machin'));
const PageMachine = lazy(() => import('./components/PageMachine'));
const VueGenerale = lazy(() => import('./components/VueGenerale'));
const TasksAndHR = lazy(() => import('./components/TasksAndHR'));
const Atelier = lazy(() => import('./components/Atelier'));
const SousTraitance = lazy(() => import('./components/SousTraitance'));

// ── Extracted modules ──
import { TRANSLATIONS, Lang, DEFAULT_MACHINES, DEFAULT_GUIDES, AUTO_SAVE_KEY, LIBRARY_KEY, MANUAL_LINKS_BY_MODEL_KEY, MACHINES_STORAGE_KEY, MACHINE_INSTANCES_KEY, MACHINE_FLEET_HISTORY_KEY, MAX_MACHINE_FLEET_HISTORY, defaultNavOrder } from './app/constants';
import { isLegacyBundledMachineFleet, looksLikeGeneratedDemoFleet, isDemoMachineName, mergeServerFleetWithPendingLocal, loadMachinesFromStorage, loadMachineFleetHistoryFromStorage, normalizeLoadedLayout, loadManualLinksByModel, saveManualLinksByModel, deleteManualLinksByModel } from './app/machineUtils';
import AppHeader from './app/AppHeader';
import NavConfirmModal from './app/NavConfirmModal';
import { useAppModelManager } from './app/useAppModelManager';

/** Valeurs initiales globales — identiques à `DEFAULT_CALENDAR_APP_SETTINGS` (calendrier + App). */
const DEFAULT_SETTINGS: AppSettings = DEFAULT_CALENDAR_APP_SETTINGS;

type HistoryState = {
    operations: Operation[];
    assignments: Record<string, string[]>;
    postes: Poste[];
};

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

export default function App() {
    const { user, loading: authLoading, logout: authLogout, login } = useAuth();
    // Licence BERA MASTER : modules masqués selon le forfait (vide si non appliqué).
    const { hiddenModules: licenseHiddenModules } = useLicense();
    const [authView, setAuthView] = useState<'login' | 'signup'>('login');
    const [isGuest, setIsGuest] = useState(false);
    const [lang, setLang] = useState<Lang>('fr');
    const t = TRANSLATIONS[lang];

    const [appLoading, setAppLoading] = useState<{
        isActive: boolean;
        progress: number;
        text: string;
        subText: string;
        error: string | null;
    }>({
        isActive: true,
        progress: 0,
        text: 'BERAMETHODE V2',
        subText: 'Initialisation des modules...',
        error: null,
    });
    const [bootAttempt, setBootAttempt] = useState(0);
    const bootRunIdRef = useRef(0);

    useEffect(() => {
        if (import.meta.env.VITE_STATIC_MODE === 'true') {
            setAppLoading(prev => ({ ...prev, isActive: false, error: null }));
            return;
        }
        if (authLoading) {
            setAppLoading({ isActive: true, progress: 5, text: 'BERAMETHODE V2', subText: 'Vérification de la session...', error: null });
            return;
        }
        if (!user) {
            setAppLoading(prev => ({ ...prev, isActive: false, error: null }));
            return;
        }
        const offlineGuest = Boolean(user.id === 0 && isGuest);
        if (offlineGuest) {
            setAppLoading(prev => ({ ...prev, isActive: false, error: null }));
            return;
        }
        const myRun = ++bootRunIdRef.current;
        const controller = new AbortController();
        let isCancelled = false;
        setAppLoading(prev => ({ ...prev, isActive: true, progress: Math.max(prev.progress, 5), text: 'BERAMETHODE V2', subText: 'Initialisation des modules...', error: null }));
        runBootSequence((p) => {
            if (isCancelled) return;
            if (myRun !== bootRunIdRef.current) return;
            setAppLoading(prev => ({ ...prev, progress: Math.max(prev.progress, p.progress), subText: p.currentLabel, error: null }));
        }, controller.signal).then(result => {
            if (isCancelled) return;
            if (myRun !== bootRunIdRef.current) return;
            if (!result.ok && result.error) {
                setAppLoading(prev => ({ ...prev, isActive: true, error: `Étape « ${result.error!.stepId} » : ${result.error!.message}`, subText: 'Connexion impossible' }));
                return;
            }
            setTimeout(() => {
                if (isCancelled) return;
                if (myRun !== bootRunIdRef.current) return;
                setAppLoading(prev => ({ ...prev, isActive: false }));
            }, 350);
        });
        return () => {
            isCancelled = true;
            bootRunIdRef.current += 1;
            controller.abort();
        };
    }, [authLoading, user?.id, isGuest, bootAttempt]);

    const retryBoot = useCallback(() => setBootAttempt(n => n + 1), []);
    const continueOffline = useCallback(() => {
        setAppLoading(prev => ({ ...prev, isActive: false, error: null }));
    }, []);

    const handleGuestLogin = async () => {
        try {
            const res = await fetch('/api/auth/login', {
                credentials: 'include',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'guest@local', password: 'guest2024' }),
            });
            if (res.ok) {
                const data = await res.json();
                notifyServerSessionEstablished(data.user?.id ?? 0);
                login(data.user);
            } else {
                login({ id: 0, email: 'guest@local', name: 'Invité', role: 'user' });
            }
        } catch {
            login({ id: 0, email: 'guest@local', name: 'Invité', role: 'user' });
        }
        setIsGuest(true);
    };

    const logout = async () => {
        await authLogout();
        setIsGuest(false);
        setAuthView('login');
    };

    const [currentView, setCurrentView] = useState<'dashboard' | 'ingenierie' | 'atelier' | 'library' | 'coupe' | 'effectifs' | 'gestionRh' | 'planning' | 'suivi' | 'magasin' | 'export' | 'config' | 'profil' | 'admin' | 'rendement' | 'pageMachine' | 'machin' | 'objectifs' | 'facturation' | 'atelierProd' | 'vuegenerale' | 'sousTraitance'>('dashboard');
    const [directSuiviModelId, setDirectSuiviModelId] = useState<string | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    // En static mode, on garde tous les modules visibles — leurs données viennent de Supabase
    // via cloud sync (snapshot localStorage). Les fetch /api/* qui échouent sont absorbés
    // par les .catch() existants ou les fallbacks localStorage.
    const defaultNavOrder = ['vuegenerale', 'dashboard', 'ingenierie', 'atelier', 'atelierProd', 'library', 'coupe', 'effectifs', 'gestionRh', 'planning', 'suivi', 'rendement', 'magasin', 'export', 'facturation', 'config', 'pageMachine', 'machin', 'objectifs', 'admin', 'sousTraitance'];
    const [navConfig, setNavConfig] = useState<{
        enabled: boolean;
        style: 'dropdown' | 'flat' | 'mobile-only';
        order: string[];
        hidden: string[];
        categories: { id: string; name: string; views: string[] }[];
    }>(() => {
        const defaultCategories = [
            { id: 'principal', name: 'Principal', views: ['dashboard', 'vuegenerale', 'planning', 'suivi', 'rendement'] },
            { id: 'production', name: 'Production', views: ['ingenierie', 'atelier', 'atelierProd', 'coupe', 'sousTraitance'] },
            { id: 'rh', name: 'RH', views: ['effectifs', 'gestionRh'] },
            { id: 'logistique', name: 'Logistique', views: ['magasin', 'export', 'facturation'] },
            { id: 'config', name: 'Config', views: ['library', 'pageMachine', 'machin', 'config', 'objectifs'] }
        ];
        try {
            const s = localStorage.getItem('bera_nav_config');
            if (s) {
                const parsed = JSON.parse(s);
                if (!parsed.style) parsed.style = 'dropdown';
                if (!parsed.categories) parsed.categories = defaultCategories;
                if (parsed.enabled === undefined) parsed.enabled = true;
                
                // Merge any new views that aren't in the saved order yet
                if (parsed.order && parsed.order.length) {
                    const savedSet = new Set(parsed.order);
                    const missing = defaultNavOrder.filter(v => !savedSet.has(v));
                    if (missing.length > 0) {
                        parsed.order = [...parsed.order, ...missing];
                    }
                } else {
                    parsed.order = [...defaultNavOrder];
                }

                // Ensure all views are present in some category (except 'admin')
                const allCategorizedViews = new Set(parsed.categories.flatMap((c: any) => c.views));
                const missingFromCategories = defaultNavOrder.filter(v => !allCategorizedViews.has(v) && v !== 'admin');
                if (missingFromCategories.length > 0) {
                    missingFromCategories.forEach(view => {
                        const targetDefCat = defaultCategories.find(c => c.views.includes(view));
                        if (targetDefCat) {
                            const parsedCat = parsed.categories.find((c: any) => c.id === targetDefCat.id);
                            if (parsedCat) {
                                parsedCat.views = [...parsedCat.views, view];
                                return;
                            }
                        }
                        const firstCat = parsed.categories[0];
                        if (firstCat) {
                            firstCat.views = [...firstCat.views, view];
                        }
                    });
                }

                return parsed;
            }
        } catch {}
        return {
            enabled: true,
            style: 'dropdown',
            order: [...defaultNavOrder],
            hidden: [],
            categories: defaultCategories
        };
    });
    const saveNavConfig = (cfg: typeof navConfig) => { setNavConfig(cfg); localStorage.setItem('bera_nav_config', JSON.stringify(cfg)); };
    const navOrder = navConfig.order.length ? navConfig.order : defaultNavOrder;
    // Config de nav effective : fusionne les modules masqués par la licence (vide si non appliqué).
    const effectiveNavConfig = licenseHiddenModules.length
        ? { ...navConfig, hidden: [...new Set([...navConfig.hidden, ...licenseHiddenModules])] }
        : navConfig;


    useEffect(() => {
        const ALLOW = new Set(['dashboard', 'ingenierie', 'atelier', 'library', 'coupe', 'effectifs', 'gestionRh', 'planning', 'suivi', 'magasin', 'export', 'config', 'profil', 'admin', 'rendement', 'pageMachine', 'machin', 'objectifs', 'facturation', 'atelierProd', 'vuegenerale', 'sousTraitance']);
        const applyHash = () => {
            const h = window.location.hash.replace(/^#\/?/, '').toLowerCase();
            if (h && ALLOW.has(h)) setCurrentView(h as typeof currentView);
        };
        applyHash();
        window.addEventListener('hashchange', applyHash);
        return () => window.removeEventListener('hashchange', applyHash);
    }, []);

    const [navigationContext, setNavigationContext] = useState<'coupe' | 'planning' | null>(null);
    const [navConfirm, setNavConfirm] = useState<{ isOpen: boolean; type: 'save' | 'new' | 'effectifs' | null; targetView: typeof currentView | null; }>({ isOpen: false, type: null, targetView: null });

    const [planningEvents, setPlanningEvents] = useState<import('./types').PlanningEvent[]>([]);
    const [suivis, setSuivis] = useState<import('./types').SuiviData[]>([]);
    const [demandesAppro, setDemandesAppro] = useState<import('./types').DemandeAppro[]>([]);

    /** Baseline des suivis à l’entrée sur Effectifs (une fois par visite) pour détecter les changements. */
    const effectifsSuivisSnapshotRef = useRef<string>('');
    const effectifsBaselineCapturedRef = useRef(false);
    const [effectifsDirty, setEffectifsDirty] = useState(false);

    useEffect(() => {
        if (currentView !== 'effectifs') {
            effectifsBaselineCapturedRef.current = false;
            setEffectifsDirty(false);
            return;
        }
        if (!effectifsBaselineCapturedRef.current) {
            effectifsSuivisSnapshotRef.current = JSON.stringify(suivis);
            effectifsBaselineCapturedRef.current = true;
            setEffectifsDirty(false);
            return;
        }
        setEffectifsDirty(JSON.stringify(suivis) !== effectifsSuivisSnapshotRef.current);
    }, [currentView, suivis]);

    useEffect(() => {
        if (!effectifsDirty || currentView !== 'effectifs') return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [effectifsDirty, currentView]);



    useEffect(() => {
        const loadFromLocal = () => {
            try { const s = localStorage.getItem('beramethode_planning'); setPlanningEvents(s ? JSON.parse(s) : []); } catch { setPlanningEvents([]); }
            try { const s = localStorage.getItem('beramethode_suivis'); setSuivis(s ? JSON.parse(s) : []); } catch { setSuivis([]); }
            try { const s = localStorage.getItem('beramethode_demandesAppro'); setDemandesAppro(s ? JSON.parse(s) : []); } catch { setDemandesAppro([]); }
        };
        if (user && !IS_STATIC) {
            fetch('/api/planning', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(data => setPlanningEvents(Array.isArray(data) ? data : [])).catch(() => setPlanningEvents([]));
            fetch('/api/suivi', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(data => setSuivis(Array.isArray(data) ? data : [])).catch(() => setSuivis([]));
            fetch('/api/demandes-appro', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(data => setDemandesAppro(Array.isArray(data) ? data : [])).catch(() => setDemandesAppro([]));
        } else {
            // Static mode (Vercel) or guest: localStorage is the source of truth.
            // Supabase cloudSync populates localStorage on login and dispatches
            // 'beramethode:cloud-sync-applied' after pulling a remote snapshot.
            loadFromLocal();
        }
        if (IS_STATIC) {
            const onCloudApplied = () => loadFromLocal();
            window.addEventListener('beramethode:cloud-sync-applied', onCloudApplied);
            return () => window.removeEventListener('beramethode:cloud-sync-applied', onCloudApplied);
        }
    }, [user]);

    useEffect(() => {
        if (!user || IS_STATIC) {
            // Guest & static (Vercel): persist to localStorage; cloudSync handles upstream sync.
            localStorage.setItem('beramethode_planning', JSON.stringify(planningEvents));
            if (!user) {
                localStorage.setItem('beramethode_suivis', JSON.stringify(suivis));
                localStorage.setItem('beramethode_demandesAppro', JSON.stringify(demandesAppro));
            }
            return;
        }
        const timer = setTimeout(() => {
            fetch('/api/planning', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: planningEvents }) }).catch(() => { });
        }, 1200);
        return () => clearTimeout(timer);
    }, [planningEvents, user]);

    useEffect(() => {
        if (!user) return;
        if (IS_STATIC) {
            localStorage.setItem('beramethode_suivis', JSON.stringify(suivis));
            return;
        }
        const timer = setTimeout(() => {
            fetch('/api/suivi', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suivis }) }).catch(() => { });
        }, 1200);
        return () => clearTimeout(timer);
    }, [suivis, user]);



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

    const [layoutMemory, setLayoutMemory] = useState<Record<string, { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[]>>({});
    const [activeLayout, setActiveLayout] = useState<'zigzag' | 'free' | 'line' | 'double-zigzag'>('double-zigzag');
    const [manualLinks, setManualLinks] = useState<ManualLink[]>(() => {
        try { const saved = localStorage.getItem('beramethode_manual_links'); return saved ? JSON.parse(saved) : []; } catch { return []; }
    });
    const [savedPlantations, setSavedPlantations] = useState<{ id: string, name: string, date: string, layoutType: string, postes: { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[] }[]>([]);

    const [globalSettings, setGlobalSettings] = useState<AppSettings>(() => {
        try { const saved = localStorage.getItem('beramethode_settings'); return saved ? JSON.parse(saved) : DEFAULT_SETTINGS; } catch { return DEFAULT_SETTINGS; }
    });

    useEffect(() => { localStorage.setItem('beramethode_settings', JSON.stringify(globalSettings)); }, [globalSettings]);

    const [machines, setMachines] = useState<Machine[]>(loadMachinesFromStorage);
    const [machineFleetHistory, setMachineFleetHistory] = useState<MachineFleetHistoryEntry[]>(loadMachineFleetHistoryFromStorage);

    const [machineInstances, setMachineInstances] = useState<MachineInstance[]>(() => {
        try { const s = localStorage.getItem(MACHINE_INSTANCES_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
    });

    useEffect(() => {
        if (machineInstances.length === 0 && machines.length > 0) {
            const brands = ['Juki', 'Brother', 'Pegasus', 'Siruba', 'Jack'];
            const statuses = ['OK', 'OK', 'OK', 'OK', 'PANNE', 'MAINT'];
            const generated: MachineInstance[] = [];
            for (let i = 0; i < 50; i++) {
                const classObj = machines[Math.floor(Math.random() * machines.length)];
                generated.push({
                    id: `gen-${Date.now()}-${i}`,
                    classId: classObj.id,
                    numero: i + 1,
                    matricule: `MAC-${Math.floor(Math.random() * 10000)}`,
                    brand: brands[Math.floor(Math.random() * brands.length)],
                    status: statuses[Math.floor(Math.random() * statuses.length)] as any,
                    chainId: Math.random() > 0.5 ? `CHAINE ${Math.floor(Math.random() * 6) + 1}` : undefined
                });
            }
            setMachineInstances(generated);
        }
    }, [machineInstances.length, machines]);

    useEffect(() => {
        try {
            localStorage.setItem(MACHINES_STORAGE_KEY, JSON.stringify(machines));
        } catch {
            /* ignore quota / private mode */
        }
    }, [machines]);

    useEffect(() => {
        try { localStorage.setItem(MACHINE_INSTANCES_KEY, JSON.stringify(machineInstances)); } catch { /* ignore */ }
    }, [machineInstances]);

    useEffect(() => {
        try {
            localStorage.setItem(MACHINE_FLEET_HISTORY_KEY, JSON.stringify(machineFleetHistory));
        } catch {
            /* ignore */
        }
    }, [machineFleetHistory]);

    /** Après chargement serveur : évite d’écraser `machines_fleet` distante par un POST basé sur le localStorage avant GET. */
    const [serverSettingsHydrated, setServerSettingsHydrated] = useState(true);

    useEffect(() => {
        if (!user || IS_STATIC) return;
        const timer = setTimeout(() => {
            fetch('/api/settings', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ global_settings: globalSettings }) }).catch(() => { });
        }, 1500);
        return () => clearTimeout(timer);
    }, [globalSettings, user]);

    useEffect(() => {
        if (!user || IS_STATIC) {
            setServerSettingsHydrated(true);
            return;
        }
        setServerSettingsHydrated(false);
        fetch('/api/settings', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                if (data.global_settings) {
                    try {
                        const parsed = typeof data.global_settings === 'string' ? JSON.parse(data.global_settings) : data.global_settings;
                        setGlobalSettings(s => ({
                            ...DEFAULT_SETTINGS,
                            ...parsed,
                            companyProfile: { ...DEFAULT_SETTINGS.companyProfile, ...(parsed.companyProfile || {}) },
                            chainCapacityPerDay: { ...DEFAULT_SETTINGS.chainCapacityPerDay, ...(parsed.chainCapacityPerDay || {}) },
                            chainMachines: { ...DEFAULT_SETTINGS.chainMachines, ...(parsed.chainMachines || {}) },
                        }));
                    } catch { /* ignore */ }
                }
                if (Object.prototype.hasOwnProperty.call(data, 'machines_fleet')) {
                    try {
                        const raw = data.machines_fleet;
                        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        if (Array.isArray(parsed)) {
                            if (isLegacyBundledMachineFleet(parsed)) setMachines(DEFAULT_MACHINES);
                            else if (looksLikeGeneratedDemoFleet(parsed)) {
                                setMachines(prev => {
                                    const next = prev.filter(m => !isDemoMachineName(m.name));
                                    const allowed = new Set(next.map(m => m.id));
                                    setMachineInstances(pi => pi.filter(i => allowed.has(i.classId)));
                                    return next.length > 0 ? next : DEFAULT_MACHINES;
                                });
                            }
                            /** Parc vide côté serveur : ne pas écraser le localStorage (souvent parc local pas encore POST). */
                            else if (parsed.length > 0) {
                                setMachines(prev => mergeServerFleetWithPendingLocal(parsed, prev));
                            } else if (parsed.length === 0) {
                                setMachines(prev => prev.length > 0 ? prev : DEFAULT_MACHINES);
                            }
                        }
                    } catch { /* ignore */ }
                }
                if (Object.prototype.hasOwnProperty.call(data, 'machines_fleet_history')) {
                    try {
                        const raw = data.machines_fleet_history;
                        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            setMachineFleetHistory(parsed as MachineFleetHistoryEntry[]);
                        }
                    } catch { /* ignore */ }
                }
            })
            .catch(() => { /* ignore */ })
            .finally(() => setServerSettingsHydrated(true));
    }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Parc machines : même persistance que les autres réglages (`owner_id` = utilisateur connecté). */
    useEffect(() => {
        if (!user || !serverSettingsHydrated || IS_STATIC) return;
        const timer = setTimeout(() => {
            fetch('/api/settings', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machines_fleet: machines }),
            }).catch(() => { });
        }, 1500);
        return () => clearTimeout(timer);
    }, [machines, user, serverSettingsHydrated]);

    /** Historique parc (entrées / sorties) — même persistance `owner_id`. */
    useEffect(() => {
        if (!user || !serverSettingsHydrated || IS_STATIC) return;
        const timer = setTimeout(() => {
            fetch('/api/settings', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machines_fleet_history: machineFleetHistory }),
            }).catch(() => { });
        }, 1600);
        return () => clearTimeout(timer);
    }, [machineFleetHistory, user, serverSettingsHydrated]);

    /** Retire les IDs absents du parc dans chainMachines (orphelins après suppression, ou après sync API). */
    useEffect(() => {
        const validIds = new Set(machines.map(m => m.id));
        setGlobalSettings(prev => {
            const cm = { ...(prev.chainMachines || {}) };
            let changed = false;
            for (const chainKey of Object.keys(cm)) {
                const arr = cm[chainKey];
                if (!arr?.length) continue;
                const next = arr.filter(mid => validIds.has(mid));
                if (next.length !== arr.length) {
                    changed = true;
                    if (next.length) cm[chainKey] = next;
                    else delete cm[chainKey];
                }
            }
            if (!changed) return prev;
            const keys = Object.keys(cm);
            return { ...prev, chainMachines: keys.length ? cm : undefined };
        });
    }, [machines, globalSettings.chainMachines]);

    const handleSaveMachine = useCallback((m: Machine, ctx?: { created: boolean }) => {
        setMachines(prev => {
            const i = prev.findIndex(x => x.id === m.id);
            if (i >= 0) {
                const next = [...prev];
                next[i] = m;
                return next;
            }
            return [...prev, m];
        });
        if (ctx?.created) {
            const actor = ((user?.name || user?.email || 'Utilisateur') as string).trim() || 'Utilisateur';
            const entry: MachineFleetHistoryEntry = {
                id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                at: new Date().toISOString(),
                kind: 'ADD',
                actorName: actor,
                details: 'Entrée au parc',
                machineSnapshot: { ...m },
            };
            setMachineFleetHistory(prev => [entry, ...prev].slice(0, MAX_MACHINE_FLEET_HISTORY));
        }
    }, [user?.name, user?.email]);

    const handleArchiveMachine = useCallback((payload: MachineExitPayload) => {
        const { machine, kind, actorName, details, confirmationRef } = payload;
        const entry: MachineFleetHistoryEntry = {
            id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            at: new Date().toISOString(),
            kind,
            actorName,
            details,
            machineSnapshot: { ...machine },
            confirmationRef,
        };
        setMachineFleetHistory(prev => [entry, ...prev].slice(0, MAX_MACHINE_FLEET_HISTORY));
        setMachines(prev => prev.filter(x => x.id !== machine.id));
        setGlobalSettings(prev => {
            const cm = { ...(prev.chainMachines || {}) };
            let changed = false;
            for (const chainKey of Object.keys(cm)) {
                const arr = cm[chainKey];
                if (!arr?.length) continue;
                const next = arr.filter(x => x !== machine.id);
                if (next.length !== arr.length) {
                    changed = true;
                    if (next.length) cm[chainKey] = next;
                    else delete cm[chainKey];
                }
            }
            if (!changed) return prev;
            const keys = Object.keys(cm);
            return { ...prev, chainMachines: keys.length ? cm : undefined };
        });
    }, []);

    const handleDeleteMachine = useCallback((id: string) => {
        setMachines(prev => prev.filter(x => x.id !== id));
        setGlobalSettings(prev => {
            const cm = { ...(prev.chainMachines || {}) };
            let changed = false;
            for (const chainKey of Object.keys(cm)) {
                const arr = cm[chainKey];
                if (!arr?.length) continue;
                const next = arr.filter(x => x !== id);
                if (next.length !== arr.length) {
                    changed = true;
                    if (next.length) cm[chainKey] = next;
                    else delete cm[chainKey];
                }
            }
            if (!changed) return prev;
            const keys = Object.keys(cm);
            return { ...prev, chainMachines: keys.length ? cm : undefined };
        });
    }, []);

    const handleToggleMachine = useCallback((id: string) => {
        setMachines(prev => prev.map(x => (x.id === id ? { ...x, active: !x.active } : x)));
    }, []);

    /** Vide tout le parc (classes) et les machines physiques associées — ex. retrait des données démo. */
    const handlePurgeAllMachines = useCallback(() => {
        setMachines([]);
        setMachineInstances([]);
    }, []);

    const handleSaveMachineInstance = useCallback((inst: MachineInstance) => {
        setMachineInstances(prev => {
            const i = prev.findIndex(x => x.id === inst.id);
            if (i >= 0) { const next = [...prev]; next[i] = inst; return next; }
            return [...prev, inst];
        });
    }, []);

    const handleDeleteMachineInstance = useCallback((id: string) => {
        setMachineInstances(prev => prev.filter(x => x.id !== id));
    }, []);
    const [speedFactors, setSpeedFactors] = useState<SpeedFactor[]>([]);
    const [complexityFactors, setComplexityFactors] = useState<ComplexityFactor[]>([
        { id: '1', label: 'Simple', value: 1.0 },
        { id: '2', label: 'Moyen', value: 1.1 },
        { id: '3', label: 'Complexe', value: 1.2 }
    ]);
    const [standardTimes, setStandardTimes] = useState<StandardTime[]>([]);
    const [guides, setGuides] = useState<Guide[]>(DEFAULT_GUIDES);
    const [isAutocompleteEnabled, setIsAutocompleteEnabled] = useState(true);
    const [userVocabulary, setUserVocabulary] = useState<string[]>([]);

    const [currentModelId, setCurrentModelId] = useState<string | null>(null);
    const [articleName, setArticleName] = useState('');
    const [efficiency, setEfficiency] = useState(85);
    const [numWorkers, setNumWorkers] = useState(1);
    const [presenceTime, setPresenceTime] = useState(480);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    const [skipAutosaveRestore, setSkipAutosaveRestore] = useState(false);

    const [operations, setOperations] = useState<Operation[]>([]);
    const [assignments, setAssignments] = useState<Record<string, string[]>>({});
    const [postes, setPostes] = useState<Poste[]>([]);
    const [chronoData, setChronoData] = useState<Record<string, import('./types').ChronoData>>({});

    const [history, setHistory] = useState<HistoryState[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const [toastMessage, setToastMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 3000);
    };

    useEffect(() => {
        setHistory([{ operations: [], assignments: {}, postes: [] }]);
        setHistoryIndex(0);
    }, []);

    const saveToHistory = useCallback((newState: HistoryState) => {
        setHistoryIndex(prevIndex => {
            setHistory(prev => {
                const currentHistory = prev.slice(0, prevIndex + 1);
                const newHistory = [...currentHistory, newState];
                if (newHistory.length > 50) newHistory.shift();
                return newHistory;
            });
            return Math.min(prevIndex + 1, 49);
        });
    }, []);

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

    const setOperationsWithHistory = (action: React.SetStateAction<Operation[]>) => {
        setOperations(prev => {
            const newVal = typeof action === 'function' ? (action as (p: Operation[]) => Operation[])(prev) : action;
            saveToHistory({ operations: newVal, assignments, postes });
            return newVal;
        });
    };

    const setAssignmentsWithHistory = (action: React.SetStateAction<Record<string, string[]>>) => {
        setAssignments(prev => {
            const newVal = typeof action === 'function' ? (action as (p: Record<string, string[]>) => Record<string, string[]>)(prev) : action;
            saveToHistory({ operations, assignments: newVal, postes });
            return newVal;
        });
    };

    const setPostesWithHistory = (action: React.SetStateAction<Poste[]>) => {
        setPostes(prev => {
            const newVal = typeof action === 'function' ? (action as (p: Poste[]) => Poste[])(prev) : action;
            saveToHistory({ operations, assignments, postes: newVal });
            return newVal;
        });
    };

    const launchDateTimeIso = (date: string, launchTime?: string) => {
        const t = launchTime && /^\d{2}:\d{2}$/.test(launchTime) ? launchTime : '08:00';
        return `${date}T${t}:00`;
    };

    const [ficheData, setFicheData] = useState<FicheData>({
        date: new Date().toISOString().split('T')[0],
        launchTime: '08:00',
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

    useEffect(() => {
        if (!user || IS_STATIC || skipAutosaveRestore) return;
        fetch('/api/settings', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data?.autosave_workspace) return;
                try {
                    const ws = typeof data.autosave_workspace === 'string' ? JSON.parse(data.autosave_workspace) : data.autosave_workspace;
                    if (!ws || typeof ws !== 'object') return;
                    const localRaw = localStorage.getItem(AUTO_SAVE_KEY);
                    const localTs = localRaw ? (JSON.parse(localRaw).lastSaved || 0) : 0;
                    if ((ws.lastSaved || 0) <= localTs) return;
                    if (ws.articleName !== undefined) setArticleName(ws.articleName);
                    if (ws.currentModelId !== undefined) setCurrentModelId(ws.currentModelId);
                    if (Array.isArray(ws.operations)) setOperations(ws.operations);
                    if (ws.assignments) setAssignments(ws.assignments);
                    if (Array.isArray(ws.postes)) setPostes(ws.postes);
                    if (ws.ficheData) setFicheData(prev => ({ ...prev, ...ws.ficheData }));
                    if (ws.efficiency !== undefined) setEfficiency(ws.efficiency);
                    if (ws.numWorkers !== undefined) setNumWorkers(ws.numWorkers);
                } catch { /* silent */ }
            })
            .catch(() => { });
    }, [user, skipAutosaveRestore]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        setSaveStatus('saving');
        const timer = setTimeout(() => {
            const dataToSave = { currentModelId, articleName, operations, assignments, postes, ficheData, ficheImages, efficiency, numWorkers, presenceTime, layoutMemory, activeLayout, manualLinks, savedPlantations, chronoData, lastSaved: Date.now() };
            try {
                localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(dataToSave));
                setSaveStatus('saved');
            } catch (e) {
                console.error('Auto-save failed (likely quota exceeded)', e);
                setSaveStatus('unsaved');
            }
            if (user && !IS_STATIC) {
                fetch('/api/settings', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autosave_workspace: dataToSave }) }).catch(() => { });
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [currentModelId, articleName, operations, assignments, postes, ficheData, ficheImages, efficiency, numWorkers, presenceTime, layoutMemory, activeLayout, manualLinks, savedPlantations, chronoData, user]);

    useEffect(() => {
        localStorage.setItem('beramethode_manual_links', JSON.stringify(manualLinks));
        if (!user || IS_STATIC) return;
        const timer = setTimeout(() => {
            fetch('/api/settings', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manual_links: manualLinks }) }).catch(() => { });
        }, 1500);
        return () => clearTimeout(timer);
    }, [manualLinks, user]);

    const globalStats = useMemo(() => {
        const totalTime = operations.reduce((acc, op) => acc + (op.time || 0), 0);
        const tempsArticle = Math.round((totalTime * 1.20) * 100) / 100;
        const calculatedBF = (numWorkers > 0 && efficiency > 0) ? tempsArticle / (numWorkers * (efficiency / 100)) : 0;
        return { totalTime, tempsArticle, bf: calculatedBF };
    }, [operations, numWorkers, presenceTime, efficiency]);

    const [models, setModels] = useState<ModelData[]>([]);

    // Reactive functional effect to sync Suivi outputs to Plan Master and apply dynamic rolling
    useEffect(() => {
        if (!models || models.length === 0 || suivis.length === 0) return;

        setPlanningEvents(prev => {
            if (prev.length === 0) return prev;
            let changed = false;
            const next = prev.map(evt => {
                const pieces = sumPiecesFromSuiviForPlanning(evt.id, suivis);
                const current = evt.producedQuantity ?? evt.qteProduite ?? 0;

                let nextStatus = evt.status;
                if (pieces >= evt.qteTotal) {
                    nextStatus = 'DONE';
                } else if (pieces > 0 && evt.status === 'READY') {
                    nextStatus = 'IN_PROGRESS';
                }

                if (pieces !== current || evt.status !== nextStatus) {
                    changed = true;
                    return {
                        ...evt,
                        producedQuantity: pieces,
                        qteProduite: pieces,
                        status: nextStatus,
                        lastSyncedFromSuivi: new Date().toISOString(),
                    };
                }
                return evt;
            });

            if (!changed) return prev;

            // Recalculate chain efficiencies with the new progress
            const efficiencies: Record<string, number> = {};
            const count = globalSettings.chainsCount || 12;
            for (let i = 1; i <= count; i++) {
                const chainId = `CHAINE ${i}`;
                efficiencies[chainId] = computeChainEfficiency(suivis, next, models, chainId, globalSettings).eff || 0.85;
            }

            // Apply dynamic rolling to shift subsequent events on each chain
            const rolled = rollPlanningEvents(next, models, globalSettings, efficiencies);

            // Persist locally if offline/guest
            if (!user) {
                try {
                    localStorage.setItem('beramethode_planning', JSON.stringify(rolled));
                } catch (e) {}
            }

            return rolled;
        });
    }, [suivis, models, globalSettings, user]);

    useEffect(() => {
        const loadFromLocal = () => {
            const savedLibrary = localStorage.getItem(LIBRARY_KEY);
            if (savedLibrary) {
                try {
                    const parsed = JSON.parse(savedLibrary);
                    if (Array.isArray(parsed)) setModels(parsed);
                } catch (e) {
                    console.error("Failed to load Library", e);
                }
            } else {
                setModels([]);
            }
        };
        if (user && !IS_STATIC) {
            const fetchModels = () => {
                fetch('/api/models', { credentials: 'include' })
                    .then(res => { if (res.ok) return res.json(); throw new Error('Failed to fetch models'); })
                    .then(data => setModels(data))
                    .catch(err => console.error(err));
            };

            fetchModels();

            // Synchronisation en temps réel (Polling + Focus)
            const interval = setInterval(fetchModels, 10000);
            window.addEventListener('focus', fetchModels);

            return () => {
                clearInterval(interval);
                window.removeEventListener('focus', fetchModels);
            };
        }

        // Static (Vercel) or guest: localStorage is the source of truth.
        loadFromLocal();
        if (IS_STATIC) {
            const onCloudApplied = () => loadFromLocal();
            window.addEventListener('beramethode:cloud-sync-applied', onCloudApplied);
            return () => window.removeEventListener('beramethode:cloud-sync-applied', onCloudApplied);
        }
    }, [user]);

    // 2. Persist Library on Change (Server or Local)
    // Static (Vercel) writes to localStorage; cloudSync upstreams to Supabase.
    useEffect(() => {
        if ((!user || IS_STATIC) && models.length > 0) {
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

    const {
        saveCurrentModel,
        loadModel,
        importModel,
        deleteModel,
        duplicateModel,
        renameModel,
        handleTransferToCoupe,
        handleTransferToPlanning,
        createNewProject: rawCreateNewProject
    } = useAppModelManager({
        user, models, setModels, currentModelId, setCurrentModelId,
        postes, setPostes, assignments, setAssignments, layoutMemory, setLayoutMemory, activeLayout, setActiveLayout,
        ficheData, setFicheData, ficheImages, setFicheImages, articleName, setArticleName, operations, setOperations: setOperationsWithHistory, numWorkers, setNumWorkers,
        efficiency, setEfficiency,
        manualLinks, setManualLinks, globalStats, setPlanningEvents, setCurrentView, setNavigationContext, showToast,
        setHistory, setHistoryIndex, setChronoData
    });

    const createNewProject = useCallback(() => {
        setSkipAutosaveRestore(true);
        rawCreateNewProject();
        setTimeout(() => setSkipAutosaveRestore(false), 3000);
    }, [rawCreateNewProject]);

    if (authLoading) {
        return (
            <GlobalLoader
                isActive
                progress={appLoading.progress}
                text={appLoading.text}
                subText={appLoading.subText}
            />
        );
    }

    if (!user) {
        return (
            <Suspense fallback={<GlobalLoader isActive={true} progress={50} text="BERAMETHODE" subText="Chargement..." />}>
                {authView === 'login'
                    ? <Login onSwitch={() => setAuthView('signup')} onGuest={handleGuestLogin} />
                    : <Signup onSwitch={() => setAuthView('login')} onGuest={handleGuestLogin} />}
            </Suspense>
        );
    }

    const handleNavigation = (targetView: typeof currentView) => {
        if (currentView === 'effectifs' && targetView !== 'effectifs' && effectifsDirty) {
            setNavConfirm({ isOpen: true, type: 'effectifs', targetView });
            return;
        }

        if ((currentView === 'ingenierie' || currentView === 'atelier') && targetView !== 'ingenierie' && targetView !== 'atelier') {
            if (operations.length > 0 || articleName || currentModelId) {
                setNavConfirm({ isOpen: true, type: 'save', targetView });
                return;
            }
        }

        if (targetView === 'ingenierie' && currentView !== 'ingenierie' && currentView !== 'atelier') {
            if (operations.length > 0 || articleName || currentModelId) {
                setNavConfirm({ isOpen: true, type: 'new', targetView });
                return;
            }
        }

        setCurrentView(targetView);
    };

    const handleModalConfirm = async (action: 'yes' | 'no' | 'cancel') => {
        const { type, targetView } = navConfirm;
        setNavConfirm({ isOpen: false, type: null, targetView: null });

        if (!targetView || action === 'cancel') return;

        if (type === 'effectifs') {
            if (action === 'yes') {
                if (user) {
                    try {
                        await fetch('/api/suivi', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ suivis }),
                        });
                    } catch {
                        /* ignore */
                    }
                }
                setCurrentView(targetView);
            }
            return;
        }

        if (type === 'save') {
            if (action === 'yes') saveCurrentModel(false, true); // true = silent, no alert
            setCurrentView(targetView);
        } else if (type === 'new') {
            if (action === 'yes') {
                createNewProject();
                setCurrentView('ingenierie');
            } else {
                setCurrentView(targetView);
            }
        }
    };

    return (
        <DataOwnerProvider user={user ? { ...user, id: Number(user.id) } : null} isGuest={isGuest}>
            <div className="flex flex-col h-screen bg-white text-gray-800 font-sans overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <AnnouncementBar />
                <LicenseBanner />
                {/* HEADER TOP BAR - COMPACT (h-12) & CLEAN */}
                <AppHeader
                    currentView={currentView}
                    lang={lang}
                    saveStatus={saveStatus}
                    navConfig={effectiveNavConfig}
                    mobileMenuOpen={mobileMenuOpen}
                    setMobileMenuOpen={setMobileMenuOpen}
                    handleNavigation={handleNavigation}
                    user={user}
                    logout={logout}
                />

                {/* MOBILE NAV OVERLAY */}
                {(navConfig.enabled || navConfig.style === 'mobile-only') && mobileMenuOpen && (
                    <div className="fixed inset-0 z-[200] flex">
                        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
                        <nav className="relative w-72 max-w-[85vw] bg-white shadow-2xl h-full overflow-y-auto flex flex-col animate-in slide-in-from-left duration-200">
                            {/* Header */}
                            <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                                <span className="font-extrabold text-lg text-gray-900">BERA<span className="text-emerald-600">METHODE</span></span>
                                <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Menu Items */}
                            <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
                                {(() => {
                                    const allItems: Record<string, { label: string; icon: React.ReactNode; active: string }> = {
                                        dashboard: { label: 'Tableau de bord', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>, active: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                                        vuegenerale: { label: 'Vue Générale', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>, active: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
                                        planning: { label: 'Planning', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>, active: 'bg-blue-50 border-blue-100 text-blue-700' },
                                        suivi: { label: 'Suivi Production', icon: <Activity className="w-4 h-4" />, active: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                                        rendement: { label: 'Rendement', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>, active: 'bg-violet-50 border-violet-100 text-violet-700' },
                                        ingenierie: { label: t.ingenierie, icon: <Factory className="w-4 h-4" />, active: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
                                        atelier: { label: 'Atelier Méthodes', icon: <Layers className="w-4 h-4" />, active: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                                        atelierProd: { label: 'Atelier Production', icon: <Factory className="w-4 h-4" />, active: 'bg-orange-50 border-orange-100 text-orange-700' },
                                        coupe: { label: 'La Coupe', icon: <Scissors className="w-4 h-4" />, active: 'bg-rose-50 border-rose-100 text-rose-700' },
                                        effectifs: { label: t.effectifs, icon: <Users className="w-4 h-4" />, active: 'bg-orange-50 border-orange-100 text-orange-700' },
                                        gestionRh: { label: 'Gestion RH', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, active: 'bg-sky-50 border-sky-100 text-sky-700' },
                                        magasin: { label: 'Magasin', icon: <Package className="w-4 h-4" />, active: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
                                        export: { label: 'Stock Fini', icon: <PackageCheck className="w-4 h-4" />, active: 'bg-cyan-50 border-cyan-100 text-cyan-700' },
                                        facturation: { label: 'Facturation', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, active: 'bg-blue-50 border-blue-100 text-blue-700' },
                                        library: { label: t.library, icon: <FolderOpen className="w-4 h-4" />, active: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                                        pageMachine: { label: 'Suivi Machines', icon: <Activity className="w-4 h-4" />, active: 'bg-fuchsia-50 border-fuchsia-100 text-fuchsia-700' },
                                        machin: { label: 'Catalogue Machines', icon: <Layers className="w-4 h-4" />, active: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                                        config: { label: t.configuration, icon: <SettingsIcon className="w-4 h-4" />, active: 'bg-amber-50 border-amber-100 text-amber-700' },
                                        objectifs: { label: 'Objectifs', icon: <Target className="w-4 h-4" />, active: 'bg-rose-50 border-rose-100 text-rose-700' },
                                        sousTraitance: { label: 'Sous-traitance', icon: <Truck className="w-4 h-4" />, active: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                                        admin: { label: t.admin, icon: <Shield className="w-4 h-4" />, active: 'bg-purple-50 border-purple-100 text-purple-700' },
                                    };

                                    const sections = [
                                        ...(navConfig.categories || []).map(c => ({
                                            title: c.name,
                                            items: c.views
                                        })),
                                        ...(user?.role === 'admin' ? [{ title: 'Administration', items: ['admin'] }] : []),
                                    ];

                                    const visibleItems = new Set(
                                        navOrder
                                            .filter(v => !effectiveNavConfig.hidden.includes(v))
                                            .filter(v => v !== 'admin' || user?.role === 'admin')
                                    );

                                    return sections
                                        .map(section => ({
                                            ...section,
                                            items: section.items.filter(v => visibleItems.has(v) && allItems[v])
                                        }))
                                        .filter(section => section.items.length > 0)
                                        .flatMap((section, si) => [
                                            <div key={`sep-${si}`} className="pt-4 pb-1.5 px-3">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{section.title}</span>
                                            </div>,
                                            ...section.items.map(view => {
                                                const item = allItems[view];
                                                const isActive = currentView === view;
                                                return (
                                                    <button key={view} onClick={() => { handleNavigation(view as any); setMobileMenuOpen(false); }}
                                                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wide transition-all border mb-0.5 ${isActive ? item.active : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 border-transparent'}`}>
                                                        {item.icon}{item.label}
                                                    </button>
                                                );
                                            })
                                        ]);
                                })()}
                            </div>

                            {/* Footer */}
                            <div className="px-3 py-3 border-t border-gray-100 shrink-0">
                                <button onClick={() => { handleNavigation('profil' as any); setMobileMenuOpen(false); }}
                                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[12px] font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-[10px] font-bold text-white">
                                        {user?.name ? user.name.substring(0, 2).toUpperCase() : 'SB'}
                                    </div>
                                    Profil
                                </button>
                                <button onClick={() => { logout(); setMobileMenuOpen(false); }}
                                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[12px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 transition-all mt-0.5">
                                    <LogOut className="w-4 h-4" />
                                    Déconnexion
                                </button>
                            </div>
                        </nav>
                    </div>
                )}

                {/* MAIN CONTENT */}
                <main className="flex-1 min-h-0 min-w-0 overflow-hidden relative flex flex-col bg-[#fafafa]">
                    {currentView === 'vuegenerale' && (
                        <VueGenerale
                            models={models}
                            planningEvents={planningEvents}
                            settings={globalSettings}
                            machines={machines}
                            machineInstances={machineInstances}
                            onNavigate={(view) => {
                                if (view === 'planning') setCurrentView('planning');
                                else if (view === 'machines') setCurrentView('pageMachine');
                                else setCurrentView('dashboard');
                            }}
                        />
                    )}

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
                            onNavigateModule={handleNavigation}
                        />
                    )}

                    {(currentView === 'ingenierie' || currentView === 'atelier') && (
                        <ModelWorkflow
                            machines={machines}
                            operations={operations}
                            setOperations={setOperationsWithHistory}
                            speedFactors={speedFactors}
                            complexityFactors={complexityFactors}
                            standardTimes={standardTimes}
                            guides={guides}
                            setGuides={setGuides}

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

                            currentModelId={currentModelId}
                            planningEvents={planningEvents}
                            setPlanningEvents={setPlanningEvents}

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
                            manualLinks={manualLinks}
                            setManualLinks={setManualLinks}

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
                            onStartSuivi={(m) => {
                                // PHASE 6 — Lancer Suivi depuis Bibliothèque sans passer par Planning
                                const existing = planningEvents.find(p => p.modelId === m.id);
                                if (!existing) {
                                    const chaineId = window.prompt(
                                        `Chaîne pour le suivi direct de "${m.meta_data.nom_modele}" ?`,
                                        'CHAINE 1'
                                    ) || 'CHAINE 1';
                                    const today = new Date().toISOString().split('T')[0];
                                    const syntheticEvent: import('./types').PlanningEvent = {
                                        id: `suivi_direct_${Date.now()}`,
                                        modelId: m.id,
                                        chaineId,
                                        dateLancement: today,
                                        startDate: today,
                                        dateExport: today,
                                        estimatedEndDate: today,
                                        qteTotal: Number(m.meta_data?.quantity) || 0,
                                        totalQuantity: Number(m.meta_data?.quantity) || 0,
                                        qteProduite: 0,
                                        producedQuantity: 0,
                                        status: 'IN_PROGRESS',
                                        modelName: m.meta_data.nom_modele,
                                        clientName: m.ficheData?.client || '',
                                        color: '#6366f1',
                                        // @ts-ignore — Phase 6 flag
                                        source: 'LIBRARY_DIRECT',
                                    } as any;
                                    setPlanningEvents(prev => [...prev, syntheticEvent]);
                                }
                                setDirectSuiviModelId(m.id);
                                setCurrentView('suivi');
                            }}
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
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden w-full">
                            <Effectifs onOpenGestionRH={() => setCurrentView('gestionRh')} suivis={suivis} setSuivis={setSuivis} planningEvents={planningEvents} settings={globalSettings} />
                        </div>
                    )}

                    {currentView === 'gestionRh' && (
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden w-full">
                            <GestionRH
                                suivis={suivis}
                                planningEvents={planningEvents}
                                settings={globalSettings}
                                onBack={() => setCurrentView('dashboard')}
                            />
                        </div>
                    )}



                    {currentView === 'planning' && (
                        <Planning
                            models={models}
                            planningEvents={planningEvents}
                            suivis={suivis}
                            setPlanningEvents={setPlanningEvents}
                            setModels={setModels}
                            setSuivis={setSuivis}
                            setCurrentView={setCurrentView}
                            onOpenInIngenierie={(modelId) => {
                                const m = models.find(x => x.id === modelId);
                                if (m) { loadModel(m, 'planning'); setCurrentView('ingenierie'); }
                            }}
                            onOpenSuivi={(planningEventId) => {
                                const ev = planningEvents.find(e => e.id === planningEventId);
                                if (ev) setDirectSuiviModelId(ev.modelId);
                                setCurrentView('suivi');
                            }}
                            settings={globalSettings}
                            machines={machines}
                        />
                    )}

                    {currentView === 'suivi' && (
                        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                            <SuiviProduction
                                models={models}
                                suivis={suivis}
                                setSuivis={setSuivis}
                                planningEvents={planningEvents}
                                settings={globalSettings}
                                directModelId={directSuiviModelId}
                                clearDirectModel={() => setDirectSuiviModelId(null)}
                                machines={machines}
                            />
                        </div>
                    )}

                    {currentView === 'rendement' && (
                        <RendementBoard
                            models={models}
                            planningEvents={planningEvents}
                            suivis={suivis}
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
                            settings={globalSettings}
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
                        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar bg-[#fafafa]">
                            <Configuration
                                settings={globalSettings}
                                setSettings={setGlobalSettings}
                                lang={lang}
                                machines={machines}
                                navConfig={navConfig}
                                setNavConfig={saveNavConfig}
                            />
                        </div>
                    )}



                    {currentView === 'profil' && <Profil />}

                    {currentView === 'pageMachine' && (
                        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar bg-[#fafcff] w-full relative">
                            <PageMachine 
                                planningEvents={planningEvents}
                                models={models}
                                settings={globalSettings}
                                machines={machines}
                                machineInstances={machineInstances}
                                machineFleetHistory={machineFleetHistory}
                                onArchiveMachine={(p) => {
                                    // Implementation for archiving machine if needed
                                    console.log("Archive machine", p);
                                }}
                            />
                        </div>
                    )}

                    {currentView === 'machin' && (
                        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar bg-[#fafafa]">
                            <Machin 
                                machines={machines}
                                onSaveMachine={handleSaveMachine}
                                onDeleteMachine={handleDeleteMachine}
                                onToggleMachine={handleToggleMachine}
                                speedFactors={speedFactors}
                                setSpeedFactors={setSpeedFactors}
                                complexityFactors={complexityFactors}
                                setComplexityFactors={setComplexityFactors}
                                standardTimes={standardTimes}
                                setStandardTimes={setStandardTimes}
                                guides={guides}
                                setGuides={setGuides}
                            />
                        </div>
                    )}

                    {currentView === 'objectifs' && (
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden w-full">
                            <TasksAndHR 
                                settings={globalSettings}
                                setSettings={setGlobalSettings}
                                onOpenGestionRH={() => setCurrentView('gestionRh')}
                            />
                        </div>
                    )}

                    {currentView === 'facturation' && (
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden w-full">
                            <Facturation t={(k) => k} lang={lang} />
                        </div>
                    )}

                    {currentView === 'atelierProd' && (
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden w-full">
                            <Atelier 
                                models={models} 
                                planningEvents={planningEvents} 
                                suivis={suivis} 
                                settings={globalSettings} 
                                handleAddDemandeAppro={() => console.log('Demande appro')} 
                                setPlanningEvents={setPlanningEvents} 
                                setModels={setModels} 
                                setSuivis={setSuivis} 
                            />
                        </div>
                    )}

                    {currentView === 'admin' && user?.role === 'admin' && <AdminDashboard />}

                    {currentView === 'sousTraitance' && (
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden w-full">
                            <Suspense fallback={<div className="p-8 text-center text-gray-500">Chargement...</div>}>
                                <SousTraitance models={models} settings={globalSettings} />
                            </Suspense>
                        </div>
                    )}

                    {/* --- FLOATING RETURN BUTTON --- */}
                    {navigationContext && (currentView === 'atelier' || currentView === 'library' || currentView === 'ingenierie') && (
                        <div className="absolute bottom-4 right-4 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <button
                                onClick={() => {
                                    setCurrentView(navigationContext);
                                    setNavigationContext(null); // Clear context after returning
                                }}
                                title={`Retourner au ${navigationContext === 'coupe' ? 'La Coupe' : 'Planning'}`}
                                className="group flex items-center gap-2 bg-slate-900 border border-slate-700 text-white rounded-full pl-2.5 pr-3.5 py-1.5 shadow-lg hover:bg-slate-800 hover:-translate-y-0.5 transition-all"
                            >
                                <LogOut className="w-3.5 h-3.5 text-white rotate-180 shrink-0" />
                                <span className="text-[11px] font-semibold whitespace-nowrap">Retour {navigationContext === 'coupe' ? 'La Coupe' : 'Planning'}</span>
                            </button>
                        </div>
                    )}
                </main>

                {/* GLOBAL PROGRESS & SPLASH LOADER */}
                <GlobalLoader
                    isActive={appLoading.isActive}
                    progress={appLoading.progress}
                    text={appLoading.text}
                    subText={appLoading.subText}
                    error={appLoading.error}
                    onRetry={retryBoot}
                    onContinueOffline={continueOffline}
                />

                {/* NAVIGATION CONFIRM MODAL — ULTRA MODERN SYSTEM DIALOG */}
                <NavConfirmModal
                    isOpen={navConfirm.isOpen}
                    type={navConfirm.type}
                    lang={lang}
                    user={user}
                    onConfirm={handleModalConfirm}
                />

                {/* TOAST NOTIFICATION */}
                {toastMessage && (
                    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border animate-in slide-in-from-top-4 fade-in duration-300"
                        style={{
                            backgroundColor: toastMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
                            borderColor: toastMessage.type === 'success' ? '#a7f3d0' : '#fecaca',
                            color: toastMessage.type === 'success' ? '#065f46' : '#991b1b'
                        }}
                    >
                        {toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-red-500" />}
                        <span className="text-sm font-bold">{toastMessage.text}</span>
                    </div>
                )}
            </div>
        </DataOwnerProvider>
    );
}

