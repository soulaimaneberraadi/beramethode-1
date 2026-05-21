import React from 'react';
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
    Menu,
    X,
    Target,
    Truck,
} from 'lucide-react';
import type { Lang } from './constants';
import { TRANSLATIONS } from './constants';

type ViewType = 'dashboard' | 'ingenierie' | 'atelier' | 'library' | 'coupe' | 'effectifs' | 'gestionRh' | 'planning' | 'suivi' | 'magasin' | 'export' | 'config' | 'profil' | 'admin' | 'rendement' | 'pageMachine' | 'machin' | 'objectifs' | 'facturation' | 'atelierProd' | 'vuegenerale' | 'sousTraitance';

interface AppHeaderProps {
    currentView: ViewType;
    lang: Lang;
    saveStatus: 'saved' | 'saving' | 'unsaved';
    navConfig: { enabled: boolean; order: string[]; hidden: string[] };
    mobileMenuOpen: boolean;
    setMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    handleNavigation: (view: ViewType) => void;
    user: any;
    logout: () => void;
}

export default function AppHeader({
    currentView,
    lang,
    saveStatus,
    navConfig,
    mobileMenuOpen,
    setMobileMenuOpen,
    handleNavigation,
    user,
    logout,
}: AppHeaderProps) {
    const t = TRANSLATIONS[lang];

    return (
        <header className="bg-white border-b border-gray-100 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] z-50 shrink-0 h-12 sticky top-0 print:hidden">
            <div className="h-full px-3 sm:px-4 flex items-center justify-between">
                {/* Left: Hamburger (mobile) + Logo */}
                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Hamburger Menu Button - Left side on mobile */}
                    {navConfig.enabled && (
                        <button onClick={() => setMobileMenuOpen(v => !v)}
                            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition-colors shrink-0">
                            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                        </button>
                    )}

                    {/* Logo */}
                    <button
                        type="button"
                        aria-label="Retour au tableau de bord"
                        onClick={() => handleNavigation('dashboard')}
                        className="group relative inline-flex items-center justify-center px-1 py-0.5 rounded-sm border-none transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                    >
                        <span
                            className={`relative font-extrabold text-base sm:text-lg tracking-tight transition-all duration-200 [text-shadow:none] group-hover:[text-shadow:0_1px_3px_rgba(16,185,129,0.4),0_2px_8px_rgba(16,185,129,0.22)] ${currentView === 'dashboard' ? 'text-gray-900' : 'text-gray-800 group-hover:text-emerald-700'}`}
                        >
                            BERA<span className="text-emerald-600">METHODE</span>
                        </span>
                    </button>

                    {/* AUTO-SAVE INDICATOR */}
                    {currentView === 'ingenierie' && (
                        <div className="ml-2 sm:ml-4 flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-full border border-slate-100">
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

                {/* Main Navigation - Hidden on mobile, shown on md+ */}
                <nav className="hidden md:flex items-center gap-1 mx-4 overflow-x-auto no-scrollbar">
                    <NavButton view="dashboard" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-indigo-50 border-indigo-100 text-indigo-700"
                        icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>}
                        label="Tableau de bord" />
                    <NavButton view="vuegenerale" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-emerald-50 border-emerald-100 text-emerald-700"
                        icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>}
                        label="Vue Générale" />
                    <NavButton view="ingenierie" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-emerald-50 border-emerald-100 text-emerald-700"
                        icon={<Factory className="w-3.5 h-3.5" />} label={t.ingenierie} />
                    <NavButton view="library" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-indigo-50 border-indigo-100 text-indigo-700"
                        icon={<FolderOpen className="w-3.5 h-3.5" />} label={t.library} />
                    <NavButton view="coupe" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-rose-50 border-rose-100 text-rose-700"
                        icon={<Scissors className="w-3.5 h-3.5" />} label="La Coupe" />
                    <NavButton view="effectifs" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-orange-50 border-orange-100 text-orange-700"
                        icon={<Users className="w-3.5 h-3.5" />} label={t.effectifs} />
                    <NavButton view="gestionRh" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-sky-50 border-sky-100 text-sky-700"
                        icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                        label="Gestion RH" />
                    <NavButton view="planning" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-blue-50 border-blue-100 text-blue-700"
                        icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>}
                        label="Planning" />
                    <NavButton view="suivi" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-indigo-50 border-indigo-100 text-indigo-700"
                        icon={<Activity className="w-3.5 h-3.5" />} label="Suivi P°" />
                    <NavButton view="rendement" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-violet-50 border-violet-100 text-violet-700"
                        icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>}
                        label="Rendement" />
                    <NavButton view="magasin" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-emerald-50 border-emerald-100 text-emerald-700"
                        icon={<Package className="w-3.5 h-3.5" />} label="Magasin" />
                    <NavButton view="export" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-cyan-50 border-cyan-100 text-cyan-700"
                        icon={<PackageCheck className="w-3.5 h-3.5" />} label="Stock Fini" />
                    <NavButton view="config" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-amber-50 border-amber-100 text-amber-700"
                        icon={<SettingsIcon className="w-3.5 h-3.5" />} label={t.configuration} />
                    <NavButton view="pageMachine" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-fuchsia-50 border-fuchsia-100 text-fuchsia-700"
                        icon={<Activity className="w-3.5 h-3.5" />} label="Suivi des Machines" />
                    <NavButton view="machin" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-indigo-50 border-indigo-100 text-indigo-700"
                        icon={<Layers className="w-3.5 h-3.5" />} label="Catalogue & Paramètres" />
                    <NavButton view="objectifs" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-rose-50 border-rose-100 text-rose-700"
                        icon={<Target className="w-3.5 h-3.5" />} label="Objectifs" />
                    <NavButton view="facturation" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-blue-50 border-blue-100 text-blue-700"
                        icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
                        label="Facturation" />
                    <NavButton view="atelierProd" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-orange-50 border-orange-100 text-orange-700"
                        icon={<Factory className="w-3.5 h-3.5" />} label="Atelier P°" />
                    <NavButton view="sousTraitance" currentView={currentView} onClick={handleNavigation}
                        activeClass="bg-indigo-50 border-indigo-100 text-indigo-700"
                        icon={<Truck className="w-3.5 h-3.5" />} label="Sous-traitance" />
                    {user?.role === 'admin' && (
                        <NavButton view="admin" currentView={currentView} onClick={handleNavigation}
                            activeClass="bg-purple-50 border-purple-100 text-purple-700"
                            icon={<Shield className="w-3.5 h-3.5" />} label={t.admin} />
                    )}
                </nav>

                {/* Right Side Tools */}
                <div className="flex items-center gap-2">
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
    );
}

/** Reusable nav button */
function NavButton({ view, currentView, onClick, activeClass, icon, label }: {
    view: ViewType;
    currentView: ViewType;
    onClick: (v: ViewType) => void;
    activeClass: string;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            onClick={() => onClick(view)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === view
                ? activeClass
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
        >
            {icon}
            {label}
        </button>
    );
}
