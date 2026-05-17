import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import GlobalLoader from './components/GlobalLoader';
import { runBootSequence } from './lib/bootSequence';
import {
    FolderOpen,
    Settings as SettingsIcon,
    Bell,
    CheckCircle2,
    CloudOff,
    LogOut,
    Shield,
    Package,
    Scissors,
    Users,
    Layers,
    Factory,
    PackageCheck,
    Activity,
    HardDrive,
    Save,
    AlertTriangle,
    Menu,
    X,
    Target,
} from 'lucide-react';
import ModelWorkflow from './components/ModelWorkflow';
import Library from './components/Library';
import LaCoupe from './components/LaCoupe';
import Effectifs from './components/Effectifs';
import GestionRH from './components/GESTION-RH';
import Profil from './components/Profil';
import Planning from './components/Planning';
import SuiviProduction from './components/SuiviProduction';
import RendementBoard from './components/RendementBoard';
import Dashboard from './components/Dashboard';
import Magasin from './components/Magasin';
import AdminDashboard from './src/components/AdminDashboard';
import { useAuth } from './src/context/AuthContext';
import { DataOwnerProvider } from './src/context/DataOwnerContext';
import { notifyServerSessionEstablished } from './lib/dataIdentity';
import Login from './src/components/Login';
import Signup from './src/components/Signup';
import { Machine, MachineInstance, MachineFleetHistoryEntry, Operation, FicheData, Poste, SpeedFactor, ComplexityFactor, StandardTime, Guide, ModelData, AppSettings, ManualLink } from './types';
import type { MachineExitPayload } from './components/MachineExitModal';
import Configuration from './components/Configuration';
import StockExport from './components/StockExport';
import Paramitre from './components/Paramitre';
import Machin from './components/Machin';
import PageMachine from './components/PageMachine';
import TasksAndHR from './components/TasksAndHR';
import Facturation from './components/Facturation';
import Atelier from './components/Atelier';
import { sumPiecesFromSuiviForPlanning } from './utils/produced';
import { DEFAULT_CALENDAR_APP_SETTINGS } from './lib/defaultCalendarSettings';

const TRANSLATIONS = {
    fr: {
        title: 'INGÉNIERIE BERAMETHODE',
        dashboard: 'Tableau de bord',
        library: 'Bibliothèque',
        coupe: 'La Coupe',
        effectifs: 'Effectifs',
        objectifs: 'Objectifs',
        atelier: 'Chef Atelier',
        ingenierie: 'Ingénierie',
        admin: 'Admin',
        profile: 'Profil',
        config: 'Paramètres',
        export: 'Export Stocks',
        suivi: 'Suivi Production',
        planning: 'Planning',
        magasin: 'Magasin',
        logout: 'Déconnexion',
        langBtn: 'AR',
        saved: 'Sauvegardé',
        saving: 'Enregistrement...',
        unsaved: 'Non sauvegardé',
        fiche: 'Fiche Technique',
        gamme: 'Gamme de Montage',
        analyse: 'Analyse',
        equilibrage: 'Équilibrage',
        implantation: 'Implantation',
        couts: 'Coûts & Budget',
        save: 'Enregistrer',
        next: 'Suivant',
        finish: 'Terminer',
        undo: 'Annuler (Ctrl+Z)',
        redo: 'Rétablir (Ctrl+Y)',
        refresh: 'Actualiser',
        configuration: 'Configuration'
    },
    ar: {
        title: 'بـيـراميـثـود',
        dashboard: 'لوحة التحكم',
        library: 'المكتبة',
        coupe: 'القص',
        effectifs: 'التأطير',
        objectifs: 'الأهداف',
        atelier: 'رئيس الورشة',
        ingenierie: 'الورشة',
        admin: 'المشرف',
        profile: 'حسابي',
        config: 'الإعدادات',
        export: 'تصدير المخزون',
        suivi: 'تتبع الإنتاج',
        planning: 'التخطيط',
        magasin: 'المخزن',
        saved: 'محفوظ',
        saving: 'جارٍ الحفظ...',
        unsaved: 'غير محفوظ',
        logout: 'تسجيل الخروج',
        langBtn: 'FR',
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
        configuration: 'الإعدادات'
    },
} as const;

type Lang = 'fr' | 'ar';

/** Valeurs initiales globales — identiques à `DEFAULT_CALENDAR_APP_SETTINGS` (calendrier + App). */
const DEFAULT_SETTINGS: AppSettings = DEFAULT_CALENDAR_APP_SETTINGS;

/**
 * Ancien parc « démo » injecté par défaut puis persisté dans `beramethode_machines_v1`.
 * Si le stockage est encore exactement ce préfixe (ids 1…n, mêmes nom + classe), on repart vide.
 */
const DEFAULT_MACHINES: Machine[] = [
    { id: '1', name: 'Surjeteuse 5 Fils', classe: '516', speed: 5500, speedMajor: 1.01, cofs: 1.19, active: true, machineCategory: 'Surjeteuse' },
    { id: '2', name: 'Surjeteuse 4 Fils', classe: '514', speed: 6000, speedMajor: 1.01, cofs: 1.17, active: true, machineCategory: 'Surjeteuse' },
    { id: '3', name: 'Surjeteuse 3 Fils', classe: '504', speed: 6000, speedMajor: 1.01, cofs: 1.15, active: true, machineCategory: 'Surjeteuse' },
    { id: '4', name: 'Piqueuse Plate', classe: '301', speed: 4500, speedMajor: 1.01, cofs: 1.17, active: true, machineCategory: 'Piqueuse' },
    { id: '5', name: 'Piqueuse Double Aig', classe: '316', speed: 3000, speedMajor: 1.01, cofs: 1.23, active: true, machineCategory: 'Piqueuse' },
    { id: '6', name: 'Colleteuse', classe: '602', speed: 4500, speedMajor: 1.01, cofs: 1.15, active: true, machineCategory: 'Colleteuse' },
    { id: '7', name: 'Chainette 2 Aig', classe: '402', speed: 4000, speedMajor: 1.01, cofs: 1.14, active: true, machineCategory: 'Chainette' },
    { id: '8', name: 'Point Invisible', classe: '101', speed: 2500, speedMajor: 1.01, cofs: 1.19, active: true, machineCategory: 'Spéciale' },
    { id: '9', name: 'Pose Bouton', classe: '107', speed: 1800, speedMajor: 1.01, cofs: 1.17, active: true, machineCategory: 'Spéciale' },
    { id: '10', name: 'Boutonnière Droite', classe: '304', speed: 2000, speedMajor: 1.01, cofs: 1.17, active: true, machineCategory: 'Spéciale' },
    { id: '11', name: 'Brideuse', classe: 'BR', speed: 2200, speedMajor: 1.01, cofs: 1.18, active: true, machineCategory: 'Spéciale' },
    { id: '12', name: 'ZigZag', classe: 'ZIGZAG', speed: 3000, speedMajor: 1.01, cofs: 1.19, active: true, machineCategory: 'Spéciale' },
    { id: '13', name: 'Manuel', classe: 'MAN', speed: 0, speedMajor: 1.01, cofs: 1.12, active: true, machineCategory: 'Manuel' },
    { id: '14', name: 'Repassage', classe: 'FER', speed: 0, speedMajor: 1.01, cofs: 1.12, active: true, machineCategory: 'Repassage' },
];

const LEGACY_BUNDLED_MACHINE_ROW: Record<string, { name: string; classe: string }> = {
    '1': { name: 'Surjeteuse 5 Fils', classe: '516' },
    '2': { name: 'Surjeteuse 4 Fils', classe: '514' },
    '3': { name: 'Surjeteuse 3 Fils', classe: '504' },
    '4': { name: 'Piqueuse Plate', classe: '301' },
    '5': { name: 'Piqueuse Double Aig', classe: '316' },
    '6': { name: 'Colleteuse', classe: '602' },
    '7': { name: 'Chainette 2 Aig', classe: '402' },
    '8': { name: 'Point Invisible', classe: '101' },
    '9': { name: 'Pose Bouton', classe: '107' },
    '10': { name: 'Boutonnière Droite', classe: '304' },
    '11': { name: 'Brideuse', classe: 'BR' },
    '12': { name: 'ZigZag', classe: 'ZIGZAG' },
    '13': { name: 'Manuel', classe: 'MAN' },
    '14': { name: 'Repassage', classe: 'FER' },
};

function isLegacyBundledMachineFleet(rows: Machine[]): boolean {
    if (!rows.length || rows.length > 14) return false;
    const sorted = [...rows].sort((a, b) => Number(String(a.id)) - Number(String(b.id)));
    for (let i = 0; i < sorted.length; i++) {
        const key = String(i + 1);
        const exp = LEGACY_BUNDLED_MACHINE_ROW[key];
        if (!exp) return false;
        const m = sorted[i];
        if (String(m.id) !== key) return false;
        if ((m.name || '').trim() !== exp.name || String(m.classe || '').trim() !== exp.classe) return false;
    }
    return true;
}

/** Parc généré par l’ancien lot démo (fichier JSON / script) — supprimé au chargement pour repartir propre. */
function looksLikeGeneratedDemoFleet(rows: Machine[]): boolean {
    if (rows.length < 20) return false;
    const demoNamed = rows.filter(m => /^Machine démo\s*\d+/i.test((m.name || '').trim()));
    return demoNamed.length >= rows.length * 0.85;
}

function isDemoMachineName(name: string | undefined): boolean {
    return /^Machine démo\s*\d+/i.test((name || '').trim());
}

/** Évite qu’une réponse GET lente écrase une machine ajoutée en local avant le POST `machines_fleet`. */
function mergeServerFleetWithPendingLocal(server: Machine[], local: Machine[]): Machine[] {
    const serverIds = new Set(server.map(m => m.id));
    const pending = local.filter(m => !serverIds.has(m.id));
    return pending.length ? [...server, ...pending] : server;
}

const DEFAULT_GUIDES: Guide[] = [
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
    { id: 'g11', name: 'Guide Élastique', category: 'Opérations Spéciales', machineType: 'Surjeteuse 4 Fils (514)', description: 'Pour poser élastique en tension (Lastik).', useCase: 'Ceinture, Lingerie' },
    { id: 'g12', name: 'Guide Ourlet Invisible', category: 'Bordeurs & Ourleurs', machineType: 'Surjeteuse 3 Fils (504)', description: 'Pour ourlet invisible bas de pantalon.', useCase: 'Pantalon Classique' },
    { id: 'g13', name: 'Guide Colletage', category: 'Bordeurs & Ourleurs', machineType: 'Colleteuse (602)', description: 'Pour poser bande de propreté ou biais (Bande).', useCase: 'T-shirt, Col' },
    { id: 'g14', name: 'Guide Ourlet (Bas)', category: 'Bordeurs & Ourleurs', machineType: 'Colleteuse (602)', description: 'Pour ourlet bas et manches (Ghli).', useCase: 'T-shirt, Polo' },
    { id: 'g15', name: 'Guide Ceinture', category: 'Guides & Jauges', machineType: 'Piqueuse Double Aig (316)', description: 'Pour montage ceinture (Samta).', useCase: 'Jeans, Pantalon' }
];

const AUTO_SAVE_KEY = 'beramethode_autosave_v1';
const LIBRARY_KEY = 'beramethode_library';
const MANUAL_LINKS_BY_MODEL_KEY = 'beramethode_manual_links_by_model';
const MACHINES_STORAGE_KEY = 'beramethode_machines_v1';
const MACHINE_INSTANCES_KEY = 'beramethode_machine_instances';
const MACHINE_FLEET_HISTORY_KEY = 'beramethode_machines_fleet_history_v1';
const MAX_MACHINE_FLEET_HISTORY = 500;

const loadMachinesFromStorage = (): Machine[] => {
    try {
        const raw = localStorage.getItem(MACHINES_STORAGE_KEY);
        if (!raw) return DEFAULT_MACHINES;
        const parsed = JSON.parse(raw) as Machine[];
        if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MACHINES;
        if (isLegacyBundledMachineFleet(parsed)) return DEFAULT_MACHINES;
        if (looksLikeGeneratedDemoFleet(parsed)) {
            const kept = parsed.filter(m => !isDemoMachineName(m.name));
            try {
                if (kept.length === 0) {
                    localStorage.removeItem(MACHINES_STORAGE_KEY);
                    localStorage.removeItem(MACHINE_INSTANCES_KEY);
                } else {
                    localStorage.setItem(MACHINES_STORAGE_KEY, JSON.stringify(kept));
                }
            } catch {
                /* ignore */
            }
            return kept.length > 0 ? kept : DEFAULT_MACHINES;
        }
        return parsed;
    } catch {
        return DEFAULT_MACHINES;
    }
};

const loadMachineFleetHistoryFromStorage = (): MachineFleetHistoryEntry[] => {
    try {
        const raw = localStorage.getItem(MACHINE_FLEET_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as MachineFleetHistoryEntry[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

type HistoryState = {
    operations: Operation[];
    assignments: Record<string, string[]>;
    postes: Poste[];
};

const normalizeLoadedLayout = (layout: unknown): 'zigzag' | 'free' | 'line' | 'double-zigzag' => {
    if (layout === 'free' || layout === 'line' || layout === 'double-zigzag') return layout;
    if (layout === 'zigzag' || layout === 'snake' || layout === 'grid' || layout === 'wheat') return 'double-zigzag';
    return 'double-zigzag';
};

const loadManualLinksByModel = (modelId: string): ManualLink[] => {
    try {
        const raw = localStorage.getItem(MANUAL_LINKS_BY_MODEL_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as Record<string, ManualLink[]>;
        return parsed[modelId] || [];
    } catch {
        return [];
    }
};

const saveManualLinksByModel = (modelId: string, links: ManualLink[]) => {
    try {
        const raw = localStorage.getItem(MANUAL_LINKS_BY_MODEL_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, ManualLink[]>) : {};
        parsed[modelId] = links;
        localStorage.setItem(MANUAL_LINKS_BY_MODEL_KEY, JSON.stringify(parsed));
    } catch {
        // Silent fail
    }
};

const deleteManualLinksByModel = (modelId: string) => {
    try {
        const raw = localStorage.getItem(MANUAL_LINKS_BY_MODEL_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, ManualLink[]>;
        delete parsed[modelId];
        localStorage.setItem(MANUAL_LINKS_BY_MODEL_KEY, JSON.stringify(parsed));
    } catch {
        // Silent fail
    }
};

function NavMenuSettings({ navConfig, saveNavConfig, defaultNavOrder, navLabels, isAdmin }: {
    navConfig: { enabled: boolean; order: string[]; hidden: string[] };
    saveNavConfig: (cfg: { enabled: boolean; order: string[]; hidden: string[] }) => void;
    defaultNavOrder: string[];
    navLabels: Record<string, string>;
    isAdmin?: boolean;
}) {
    const [draft, setDraft] = React.useState(navConfig);
    const [showConfirm, setShowConfirm] = React.useState(false);
    const order = draft.order.length ? draft.order : [...defaultNavOrder];
    const visibleItems = order.filter(v => v !== 'admin' || isAdmin);
    const isDirty = JSON.stringify(draft) !== JSON.stringify(navConfig);

    const move = (idx: number, dir: -1 | 1) => {
        const newOrder = [...order];
        const target = idx + dir;
        if (target < 0 || target >= newOrder.length) return;
        [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
        setDraft({ ...draft, order: newOrder });
    };
    const toggleHidden = (view: string) => {
        const hidden = draft.hidden.includes(view) ? draft.hidden.filter(v => v !== view) : [...draft.hidden, view];
        setDraft({ ...draft, hidden });
    };
    const handleSave = () => setShowConfirm(true);
    const confirmSave = () => { saveNavConfig(draft); setShowConfirm(false); };
    const handleReset = () => setDraft({ enabled: true, order: [], hidden: [] });

    return (
        <div className="mt-10 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                <Menu className="w-5 h-5 text-indigo-500" /> Navigation & Menu
            </h2>
            <p className="text-sm text-slate-500 mb-5">Personnalisez le menu hamburger et l'ordre des modules.</p>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 mb-5">
                <div>
                    <span className="text-sm font-bold text-slate-700">Menu hamburger (☰)</span>
                    <p className="text-[11px] text-slate-400">Afficher le bouton menu rapide dans la barre de navigation</p>
                </div>
                <button onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors relative flex items-center ${draft.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${draft.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
            </div>
            <div className="space-y-1.5 mb-5">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ordre des modules</span>
                {visibleItems.map((view, idx) => (
                    <div key={view} className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${draft.hidden.includes(view) ? 'bg-slate-50 border-slate-100 opacity-50' : 'bg-white border-slate-200'}`}>
                        <div className="flex flex-col gap-0.5">
                            <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-[10px] leading-none">▲</button>
                            <button onClick={() => move(idx, 1)} disabled={idx === visibleItems.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-[10px] leading-none">▼</button>
                        </div>
                        <span className="text-sm font-semibold text-slate-700 flex-1">{navLabels[view] || view}</span>
                        {view !== 'dashboard' && (
                            <button onClick={() => toggleHidden(view)}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${draft.hidden.includes(view) ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'}`}>
                                {draft.hidden.includes(view) ? 'Masqué' : 'Visible'}
                            </button>
                        )}
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-3">
                <button onClick={handleSave} disabled={!isDirty} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Enregistrer</button>
                <button onClick={handleReset} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors">Réinitialiser</button>
            </div>
            {showConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
                        <h3 className="text-base font-bold text-slate-800 mb-2">Confirmer les changements</h3>
                        <p className="text-sm text-slate-500 mb-5">Voulez-vous sauvegarder la nouvelle configuration du menu ?</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50">Annuler</button>
                            <button onClick={confirmSave} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">Confirmer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function App() {
    const { user, loading: authLoading, logout: authLogout, login } = useAuth();
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

    const [currentView, setCurrentView] = useState<'dashboard' | 'ingenierie' | 'atelier' | 'library' | 'coupe' | 'effectifs' | 'gestionRh' | 'planning' | 'suivi' | 'magasin' | 'export' | 'config' | 'profil' | 'admin' | 'rendement' | 'pageMachine' | 'machin' | 'objectifs' | 'facturation' | 'atelierProd'>('dashboard');
    const [directSuiviModelId, setDirectSuiviModelId] = useState<string | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    // En static mode, on garde tous les modules visibles — leurs données viennent de Supabase
    // via cloud sync (snapshot localStorage). Les fetch /api/* qui échouent sont absorbés
    // par les .catch() existants ou les fallbacks localStorage.
    const defaultNavOrder = ['dashboard', 'ingenierie', 'atelierProd', 'library', 'coupe', 'effectifs', 'gestionRh', 'planning', 'suivi', 'rendement', 'magasin', 'export', 'facturation', 'config', 'pageMachine', 'machin', 'objectifs', 'admin'];
    const [navConfig, setNavConfig] = useState<{ enabled: boolean; order: string[]; hidden: string[] }>(() => {
        try { const s = localStorage.getItem('bera_nav_config'); if (s) return JSON.parse(s); } catch {}
        return { enabled: true, order: [], hidden: [] };
    });
    const saveNavConfig = (cfg: typeof navConfig) => { setNavConfig(cfg); localStorage.setItem('bera_nav_config', JSON.stringify(cfg)); };
    const navOrder = navConfig.order.length ? navConfig.order : defaultNavOrder;

    useEffect(() => {
        const ALLOW = new Set(['dashboard', 'ingenierie', 'atelier', 'library', 'coupe', 'effectifs', 'gestionRh', 'planning', 'suivi', 'magasin', 'export', 'config', 'profil', 'admin', 'rendement', 'pageMachine', 'machin', 'objectifs', 'facturation', 'atelierProd']);
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
        if (user) {
            fetch('/api/planning', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(data => setPlanningEvents(Array.isArray(data) ? data : [])).catch(() => setPlanningEvents([]));
            fetch('/api/suivi', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(data => setSuivis(Array.isArray(data) ? data : [])).catch(() => setSuivis([]));
            fetch('/api/demandes-appro', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(data => setDemandesAppro(Array.isArray(data) ? data : [])).catch(() => setDemandesAppro([]));
        } else {
            try { const s = localStorage.getItem('beramethode_planning'); setPlanningEvents(s ? JSON.parse(s) : []); } catch { setPlanningEvents([]); }
            try { const s = localStorage.getItem('beramethode_suivis'); setSuivis(s ? JSON.parse(s) : []); } catch { setSuivis([]); }
            try { const s = localStorage.getItem('beramethode_demandesAppro'); setDemandesAppro(s ? JSON.parse(s) : []); } catch { setDemandesAppro([]); }
        }
    }, [user]);

    useEffect(() => {
        if (!user) {
            localStorage.setItem('beramethode_planning', JSON.stringify(planningEvents));
            localStorage.setItem('beramethode_suivis', JSON.stringify(suivis));
            localStorage.setItem('beramethode_demandesAppro', JSON.stringify(demandesAppro));
            return;
        }
        const timer = setTimeout(() => {
            fetch('/api/planning', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: planningEvents }) }).catch(() => { });
        }, 1200);
        return () => clearTimeout(timer);
    }, [planningEvents, user]);

    useEffect(() => {
        if (!user) return;
        const timer = setTimeout(() => {
            fetch('/api/suivi', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suivis }) }).catch(() => { });
        }, 1200);
        return () => clearTimeout(timer);
    }, [suivis, user]);

    /** Sync pièces produites depuis les suivis (sorties horaires) vers le planning. */
    useEffect(() => {
        setPlanningEvents(prev => {
            let changed = false;
            const next = prev.map(ev => {
                const pieces = sumPiecesFromSuiviForPlanning(ev.id, suivis);
                const current = ev.producedQuantity ?? ev.qteProduite ?? 0;
                if (pieces === current) return ev;
                changed = true;
                return {
                    ...ev,
                    producedQuantity: pieces,
                    qteProduite: pieces,
                    lastSyncedFromSuivi: new Date().toISOString(),
                };
            });
            return changed ? next : prev;
        });
    }, [suivis]);

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
        if (!user) return;
        const timer = setTimeout(() => {
            fetch('/api/settings', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ global_settings: globalSettings }) }).catch(() => { });
        }, 1500);
        return () => clearTimeout(timer);
    }, [globalSettings, user]);

    useEffect(() => {
        if (!user) {
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
        if (!user || !serverSettingsHydrated) return;
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
        if (!user || !serverSettingsHydrated) return;
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
        if (!user) return;
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
    }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

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
            if (user) {
                fetch('/api/settings', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autosave_workspace: dataToSave }) }).catch(() => { });
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [currentModelId, articleName, operations, assignments, postes, ficheData, ficheImages, efficiency, numWorkers, presenceTime, layoutMemory, activeLayout, manualLinks, savedPlantations, chronoData, user]);

    useEffect(() => {
        localStorage.setItem('beramethode_manual_links', JSON.stringify(manualLinks));
        if (!user) return;
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

    useEffect(() => {
        if (user) {
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
        return authView === 'login'
            ? <Login onSwitch={() => setAuthView('signup')} onGuest={handleGuestLogin} />
            : <Signup onSwitch={() => setAuthView('login')} onGuest={handleGuestLogin} />;
    }

    const saveCurrentModel = (navigateNext: boolean = true, silent: boolean = false) => {
        // 1. PREPARE DATA
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
        const persistedActiveLayout: 'zigzag' | 'snake' | 'grid' | 'wheat' | 'free' | 'line' =
            activeLayout === 'double-zigzag' ? 'zigzag' : activeLayout;

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
                heure_lancement: ficheData.launchTime ?? '08:00',
                total_temps: globalStats.tempsArticle,
                effectif: numWorkers,
                sizes: ficheData.sizes,
                colors: ficheData.colors,
                quantity: ficheData.quantity,
                todm: ficheData.todm,
                kisba: ficheData.kisba,
                hala: ficheData.hala
            },
            gamme_operatoire: operations,
            implantation: {
                postes: postes,
                assignments: assignments,
                layoutMemory: updatedLayoutMemory,
                activeLayout: persistedActiveLayout
            }
        };

        saveManualLinksByModel(modelToSave.id, manualLinks);

        setPlanningEvents(prev => prev.map(ev =>
            ev.modelId === modelToSave.id
                ? { ...ev, dateLancement: launchDateTimeIso(ficheData.date, ficheData.launchTime), startDate: ficheData.date }
                : ev
        ));

        // 3. UPDATE OR ADD
        if (user) {
            // Save to Server
            fetch('/api/models', {
                credentials: 'include',
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
                    if (!silent) showToast("Modèle sauvegardé avec succès (Cloud) !");
                    if (navigateNext) setCurrentView('library');
                })
                .catch(err => {
                    console.error(err);
                    showToast("Erreur lors de la sauvegarde sur le serveur.", "error");
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
            if (!silent) showToast("Modèle sauvegardé avec succès (Local) !");
            if (navigateNext) setCurrentView('library');
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
            setFicheData({
                ...model.ficheData,
                launchTime: model.ficheData.launchTime ?? model.meta_data.heure_lancement ?? '08:00',
            });
        } else {
            setFicheData(prev => ({
                ...prev,
                date: model.meta_data.date_lancement || new Date().toISOString().split('T')[0],
                launchTime: model.meta_data.heure_lancement ?? '08:00',
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
            setActiveLayout(normalizeLoadedLayout(model.implantation.activeLayout));
            setManualLinks(loadManualLinksByModel(model.id));
        } else {
            // Reset assignments if not in saved model (legacy support)
            setAssignments({});
            setPostes([]);
            setLayoutMemory({});
            setActiveLayout('double-zigzag');
            setManualLinks([]);
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
            fetch(`/api/models/${id}`, { credentials: 'include', method: 'DELETE' })
                .then(res => {
                    if (res.ok) {
                        setModels(prev => prev.filter(m => m.id !== id));
                        deleteManualLinksByModel(id);
                        if (currentModelId === id) setCurrentModelId(null);
                    }
                })
                .catch(err => console.error(err));
        } else {
            setModels(prev => prev.filter(m => m.id !== id));
            deleteManualLinksByModel(id);
            if (currentModelId === id) setCurrentModelId(null);
        }
    };

    const duplicateModel = (model: ModelData) => {
        const copy = { ...model, id: Date.now().toString(), meta_data: { ...model.meta_data, nom_modele: model.meta_data.nom_modele + ' (Copie)' } };
        saveManualLinksByModel(copy.id, loadManualLinksByModel(model.id));
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
        setActiveLayout('double-zigzag');
        setManualLinks([]);
        setChronoData({}); // NEW: Reset chrono data
        setFicheData(prev => ({
            ...prev,
            date: new Date().toISOString().split('T')[0],
            launchTime: '08:00',
            category: '',
            designation: '',
        }));

        // Reset History
        setHistory([{ operations: [], assignments: {}, postes: [] }]);
        setHistoryIndex(0);

        setCurrentView('atelier');
    };

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
        <DataOwnerProvider user={user} isGuest={isGuest}>
            <div className="flex flex-col h-screen bg-white text-gray-800 font-sans overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                {/* HEADER TOP BAR - COMPACT (h-12) & CLEAN */}
                <header className="bg-white border-b border-gray-100 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] z-50 shrink-0 h-12 sticky top-0 print:hidden">
                    <div className="h-full px-4 flex items-center justify-between">
                        {/* Logo Section */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                aria-label="Retour au tableau de bord"
                                onClick={() => handleNavigation('dashboard')}
                                className="group relative hidden sm:inline-flex items-center justify-center px-1 py-0.5 rounded-sm border-none transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                            >
                                <span
                                    className={`relative font-extrabold text-lg tracking-tight transition-all duration-200 [text-shadow:none] group-hover:[text-shadow:0_1px_3px_rgba(16,185,129,0.4),0_2px_8px_rgba(16,185,129,0.22)] ${currentView === 'dashboard' ? 'text-gray-900' : 'text-gray-800 group-hover:text-emerald-700'}`}
                                >
                                    BERA<span className="text-emerald-600">METHODE</span>
                                </span>
                            </button>
                            <span className="font-extrabold text-lg tracking-tight text-gray-900 sm:hidden">
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

                        {/* Hamburger Menu Button */}
                        {navConfig.enabled && (
                            <button onClick={() => setMobileMenuOpen(v => !v)}
                                className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition-colors shrink-0">
                                {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                            </button>
                        )}

                        {/* Main Navigation - Compact Pills */}
                        <nav className="flex items-center gap-1 mx-4 overflow-x-auto no-scrollbar">
                            <button
                                onClick={() => handleNavigation('dashboard')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'dashboard'
                                    ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
                                Tableau de bord
                            </button>
                            <button
                                onClick={() => handleNavigation('ingenierie')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'ingenierie'
                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <Factory className="w-3.5 h-3.5" />
                                {t.ingenierie}
                            </button>

                            <button
                                onClick={() => handleNavigation('library')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'library'
                                    ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <FolderOpen className="w-3.5 h-3.5" />
                                {t.library}
                            </button>
                            <button
                                onClick={() => handleNavigation('coupe')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'coupe'
                                    ? 'bg-rose-50 border-rose-100 text-rose-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <Scissors className="w-3.5 h-3.5" />
                                La Coupe
                            </button>
                            <button
                                onClick={() => handleNavigation('effectifs')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'effectifs'
                                    ? 'bg-orange-50 border-orange-100 text-orange-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <Users className="w-3.5 h-3.5" />
                                {t.effectifs}
                            </button>
                            <button
                                onClick={() => handleNavigation('gestionRh')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'gestionRh'
                                    ? 'bg-sky-50 border-sky-100 text-sky-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                Gestion RH
                            </button>

                            <button
                                onClick={() => handleNavigation('planning')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'planning'
                                    ? 'bg-blue-50 border-blue-100 text-blue-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>
                                Planning
                            </button>
                            <button
                                onClick={() => handleNavigation('suivi')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'suivi'
                                    ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <Activity className="w-3.5 h-3.5" />
                                Suivi P°
                            </button>
                            <button
                                onClick={() => handleNavigation('rendement')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'rendement'
                                    ? 'bg-violet-50 border-violet-100 text-violet-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
                                Rendement
                            </button>
                            <button
                                onClick={() => handleNavigation('magasin')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'magasin'
                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <Package className="w-3.5 h-3.5" />
                                Magasin
                            </button>
                            <button
                                onClick={() => handleNavigation('export')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'export'
                                    ? 'bg-cyan-50 border-cyan-100 text-cyan-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <PackageCheck className="w-3.5 h-3.5" />
                                Stock Fini
                            </button>
                            <button
                                onClick={() => handleNavigation('config')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'config'
                                    ? 'bg-amber-50 border-amber-100 text-amber-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <SettingsIcon className="w-3.5 h-3.5" />
                                {t.configuration}
                            </button>

                            <button
                                onClick={() => handleNavigation('pageMachine')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'pageMachine'
                                    ? 'bg-fuchsia-50 border-fuchsia-100 text-fuchsia-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <Activity className="w-3.5 h-3.5" />
                                Suivi des Machines
                            </button>

                            <button
                                onClick={() => handleNavigation('machin')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'machin'
                                    ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <Layers className="w-3.5 h-3.5" />
                                Catalogue & Paramètres
                            </button>

                            <button
                                onClick={() => handleNavigation('objectifs')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'objectifs'
                                    ? 'bg-rose-50 border-rose-100 text-rose-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <Target className="w-3.5 h-3.5" />
                                Objectifs
                            </button>

                            <button
                                onClick={() => handleNavigation('facturation')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'facturation'
                                    ? 'bg-blue-50 border-blue-100 text-blue-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                Facturation
                            </button>

                            <button
                                onClick={() => handleNavigation('atelierProd')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === 'atelierProd'
                                    ? 'bg-orange-50 border-orange-100 text-orange-700'
                                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <Factory className="w-3.5 h-3.5" />
                                Atelier P°
                            </button>

                            {user?.role === 'admin' && (
                                <button
                                    onClick={() => handleNavigation('admin')}
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

                            {/* DB Backup Download (Admin only) */}
                            {user?.role === 'admin' && (
                                <button
                                    onClick={() => {
                                        const a = document.createElement('a');
                                        a.href = '/api/admin/download-db';
                                        a.download = 'beramethode-backup.sqlite';
                                        a.click();
                                    }}
                                    className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-100 text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-colors cursor-pointer"
                                    title="Télécharger la base de données (Backup)"
                                >
                                    <HardDrive className="w-3.5 h-3.5" />
                                </button>
                            )}

                            <div className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-100 text-gray-400 hover:text-emerald-600 hover:border-emerald-100 transition-colors cursor-pointer">
                                <Bell className="w-3.5 h-3.5" />
                            </div>

                            {/* User Profile - Compact */}
                            <button
                                onClick={() => handleNavigation('profil')}
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

                {/* MOBILE NAV OVERLAY */}
                {navConfig.enabled && mobileMenuOpen && (
                    <div className="fixed inset-0 z-[60] flex">
                        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
                        <nav className="relative w-64 max-w-[80vw] bg-white shadow-2xl h-full overflow-y-auto py-4 px-3 flex flex-col gap-0.5 animate-in slide-in-from-left duration-200">
                            <div className="px-2 pb-3 mb-2 border-b border-gray-100">
                                <span className="font-extrabold text-lg text-gray-900">BERA<span className="text-emerald-600">METHODE</span></span>
                            </div>
                            {(() => {
                                const allItems: Record<string, { label: string; icon: React.ReactNode; active: string }> = {
                                    dashboard: { label: 'Tableau de bord', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>, active: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                                    ingenierie: { label: t.ingenierie, icon: <Factory className="w-4 h-4" />, active: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
                                    library: { label: t.library, icon: <FolderOpen className="w-4 h-4" />, active: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                                    coupe: { label: 'La Coupe', icon: <Scissors className="w-4 h-4" />, active: 'bg-rose-50 border-rose-100 text-rose-700' },
                                    effectifs: { label: t.effectifs, icon: <Users className="w-4 h-4" />, active: 'bg-orange-50 border-orange-100 text-orange-700' },
                                    gestionRh: { label: 'Gestion RH', icon: <Users className="w-4 h-4" />, active: 'bg-sky-50 border-sky-100 text-sky-700' },
                                    planning: { label: 'Planning', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>, active: 'bg-blue-50 border-blue-100 text-blue-700' },
                                    suivi: { label: 'Suivi P°', icon: <Activity className="w-4 h-4" />, active: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                                    rendement: { label: 'Rendement', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>, active: 'bg-violet-50 border-violet-100 text-violet-700' },
                                    magasin: { label: 'Magasin', icon: <Package className="w-4 h-4" />, active: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
                                    export: { label: 'Stock Fini', icon: <PackageCheck className="w-4 h-4" />, active: 'bg-cyan-50 border-cyan-100 text-cyan-700' },
                                    facturation: { label: 'Facturation', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, active: 'bg-blue-50 border-blue-100 text-blue-700' },
                                    atelierProd: { label: 'Atelier P°', icon: <Factory className="w-4 h-4" />, active: 'bg-orange-50 border-orange-100 text-orange-700' },
                                    config: { label: t.configuration, icon: <SettingsIcon className="w-4 h-4" />, active: 'bg-amber-50 border-amber-100 text-amber-700' },
                                    pageMachine: { label: 'Suivi des Machines', icon: <Activity className="w-4 h-4" />, active: 'bg-fuchsia-50 border-fuchsia-100 text-fuchsia-700' },
                                    machin: { label: 'Catalogue & Paramètres', icon: <Layers className="w-4 h-4" />, active: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                                    objectifs: { label: 'Objectifs (Roadmap)', icon: <Target className="w-4 h-4" />, active: 'bg-rose-50 border-rose-100 text-rose-700' },
                                    admin: { label: t.admin, icon: <Shield className="w-4 h-4" />, active: 'bg-purple-50 border-purple-100 text-purple-700' },
                                };
                                return navOrder.filter(v => !navConfig.hidden.includes(v)).filter(v => v !== 'admin' || user?.role === 'admin').filter(v => allItems[v]).map(view => ({ view, ...allItems[view] }));
                            })().map(item => (
                                <button key={item.view} onClick={() => { handleNavigation(item.view as any); setMobileMenuOpen(false); }}
                                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wide transition-all border ${currentView === item.view ? item.active : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 border-transparent'}`}>
                                    {item.icon}{item.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                )}

                {/* MAIN CONTENT */}
                <main className="flex-1 min-h-0 min-w-0 overflow-hidden relative flex flex-col bg-[#fafafa]">
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
                            <Configuration settings={globalSettings} setSettings={setGlobalSettings} lang={lang} machines={machines} />
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
                {navConfirm.isOpen && (
                    <div
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
                        style={{ animation: 'modalFadeIn 0.2s ease-out both' }}
                    >
                        {/* Darker Blur Backdrop */}
                        <div
                            className="absolute inset-0 bg-slate-950/40 backdrop-blur-[12px] transition-opacity duration-300"
                            onClick={() => handleModalConfirm('cancel')}
                        />

                        {/* Ultra-Glass Card */}
                        <div
                            className="relative w-full max-w-[400px] overflow-hidden"
                            style={{
                                background: 'rgba(255, 255, 255, 0.94)',
                                backdropFilter: 'blur(16px)',
                                borderRadius: '24px',
                                boxShadow: `
                                0 0 0 1px rgba(0, 0, 0, 0.05),
                                0 20px 50px -12px rgba(0, 0, 0, 0.3),
                                0 4px 10px -2px rgba(0, 0, 0, 0.1)
                            `,
                                animation: 'modalEntrance 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
                            }}
                        >
                            {/* Decorative Gradient Background Glow */}
                            <div className="absolute top-0 left-0 right-0 h-[240px] opacity-[0.03] pointer-events-none"
                                style={{
                                    background: navConfirm.type === 'effectifs'
                                        ? 'radial-gradient(circle at 50% 0%, #6366f1 0%, transparent 70%)'
                                        : navConfirm.type === 'save'
                                        ? 'radial-gradient(circle at 50% 0%, #10b981 0%, transparent 70%)'
                                        : 'radial-gradient(circle at 50% 0%, #f59e0b 0%, transparent 70%)'
                                }}
                            />

                            <div className="relative px-8 pt-10 pb-8 flex flex-col items-center text-center">
                                {/* Icon Circle - More Minimalist */}
                                <div
                                    className={`mb-6 w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-500`}
                                    style={{
                                        background: navConfirm.type === 'effectifs'
                                            ? 'rgba(99, 102, 241, 0.12)'
                                            : navConfirm.type === 'save'
                                            ? 'rgba(16, 185, 129, 0.1)'
                                            : 'rgba(245, 158, 11, 0.1)',
                                        color: navConfirm.type === 'effectifs'
                                            ? '#4f46e5'
                                            : navConfirm.type === 'save' ? '#059669' : '#d97706',
                                        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.4)',
                                        animation: 'iconPulse 2s ease-in-out infinite'
                                    }}
                                >
                                    {navConfirm.type === 'effectifs' ? (
                                        <Save className="w-8 h-8" strokeWidth={1.5} />
                                    ) : navConfirm.type === 'save' ? (
                                        <Save className="w-8 h-8" strokeWidth={1.5} />
                                    ) : (
                                        <AlertTriangle className="w-8 h-8" strokeWidth={1.5} />
                                    )}
                                </div>

                                <div className="space-y-2 mb-8">
                                    <h3 className="text-[22px] font-black text-slate-900 tracking-tight leading-tight">
                                        {lang === 'ar'
                                            ? (navConfirm.type === 'effectifs'
                                                ? 'حفظ تأطير اليوم؟'
                                                : navConfirm.type === 'save' ? 'حفظ التغييرات؟' : 'تنبيه: نموذج قيد العمل')
                                            : (navConfirm.type === 'effectifs'
                                                ? 'Enregistrer les effectifs du jour ?'
                                                : navConfirm.type === 'save' ? 'Sauvegarder ?' : 'Modèle en cours')
                                        }
                                    </h3>
                                    <p className="text-[14px] text-slate-500 font-medium leading-relaxed max-w-[280px]">
                                        {lang === 'ar'
                                            ? (navConfirm.type === 'effectifs'
                                                ? 'لديك تغييرات على التأطير. أكد لمزامنة الخادم والخروج، أو ألغِ للبقاء.'
                                                : navConfirm.type === 'save'
                                                ? 'هل تريد حفظ النموذج الحالي قبل الانتقال للإجراء التالي؟'
                                                : 'لديك عمل غير محفوظ حالياً. هل تريد إكمال العمل أم البدء من جديد؟')
                                            : (navConfirm.type === 'effectifs'
                                                ? (user
                                                    ? 'Vous avez modifié des effectifs. Confirmez pour envoyer tout de suite au serveur et quitter, ou annulez pour rester sur cette page.'
                                                    : 'Vous avez modifié des effectifs (sauvegarde locale). Confirmez pour quitter ou annulez pour rester.')
                                                : navConfirm.type === 'save'
                                                ? 'Voulez-vous sauvegarder votre travail actuel avant de quitter cette vue ?'
                                                : 'Vous avez des modifications non sauvées. Voulez-vous continuer ou recommencer ?')
                                        }
                                    </p>
                                </div>

                                {/* Action Buttons - Modern Stack */}
                                <div className="w-full space-y-3" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                                    {/* Primary CTA */}
                                    <button
                                        type="button"
                                        onClick={() => void handleModalConfirm('yes')}
                                        className="group relative w-full h-12 flex items-center justify-center gap-3 rounded-xl font-bold text-[14px] text-white transition-all duration-200 active:scale-[0.98] overflow-hidden"
                                        style={{
                                            background: '#0f172a',
                                            boxShadow: '0 8px 20px -6px rgba(15, 23, 42, 0.4)',
                                        }}
                                    >
                                        <span className="relative z-10">
                                            {navConfirm.type === 'effectifs'
                                                ? (lang === 'ar' ? 'تأكيد والخروج' : 'Confirmer et quitter')
                                                : navConfirm.type === 'save'
                                                ? (lang === 'ar' ? 'نعم، حفظ العمل' : 'Oui, Sauvegarder')
                                                : (lang === 'ar' ? 'مشروع جديد (مسح)' : 'Nouveau projet')
                                            }
                                        </span>
                                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-white/10 to-emerald-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
                                    </button>

                                    {/* Secondary Action — masqué pour Effectifs (2 choix : confirmer / annuler) */}
                                    {navConfirm.type !== 'effectifs' && (
                                    <button
                                        type="button"
                                        onClick={() => void handleModalConfirm('no')}
                                        className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-[14px] transition-all duration-200 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
                                    >
                                        {navConfirm.type === 'save'
                                            ? (lang === 'ar' ? 'تجاهل والحذف' : 'Quitter sans sauvegarder')
                                            : (lang === 'ar' ? 'المتابعة في الحالي' : "Continuer l'actuel")
                                        }
                                    </button>
                                    )}

                                    {/* Subtle Cancel */}
                                    <button
                                        type="button"
                                        onClick={() => void handleModalConfirm('cancel')}
                                        className="w-full h-10 font-bold text-[12px] text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest pt-2"
                                    >
                                        {lang === 'ar' ? 'إلغاء الأمر' : 'Annuler'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Keyframes for the Ultra Modern Look */}
                        <style>{`
                        @keyframes modalFadeIn { from { opacity: 0 } to { opacity: 1 } }
                        @keyframes modalEntrance { 
                            from { opacity: 0; transform: scale(0.9) translateY(30px); filter: blur(10px); } 
                            to { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); } 
                        }
                        @keyframes iconPulse {
                            0% { transform: scale(1); filter: brightness(1); }
                            50% { transform: scale(1.05); filter: brightness(1.2); }
                            100% { transform: scale(1); filter: brightness(1); }
                        }
                    `}</style>
                    </div>
                )}

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

