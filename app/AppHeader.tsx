import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    FolderOpen,
    Settings as SettingsIcon,
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
    Database,
    Menu,
    X,
    Target,
    Truck,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
} from 'lucide-react';
import type { Lang } from './constants';
import { TRANSLATIONS } from './constants';
import SupportWidget from '../components/SupportWidget';
import SyncIndicator from '../components/SyncIndicator';

type ViewType = 'dashboard' | 'ingenierie' | 'library' | 'coupe' | 'effectifs' | 'gestionRh' | 'planning' | 'suivi' | 'magasin' | 'export' | 'config' | 'profil' | 'admin' | 'rendement' | 'pageMachine' | 'machin' | 'facturation' | 'atelierProd' | 'sousTraitance' | 'catalogTemps';

interface AppHeaderProps {
    currentView: ViewType;
    lang: Lang;
    saveStatus: 'saved' | 'saving' | 'unsaved';
    navConfig: {
        enabled: boolean;
        style: 'dropdown' | 'flat' | 'mobile-only';
        order: string[];
        hidden: string[];
        categories: { id: string; name: string; views: string[] }[];
    };
    mobileMenuOpen: boolean;
    setMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    handleNavigation: (view: ViewType) => void;
    user: any;
    logout: () => void;
}

const VIEW_DEFS: Record<string, { label: string | ((t: any) => string); icon: React.ReactNode; activeClass: string }> = {
    dashboard: {
        label: 'Tableau de bord',
        icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>,
        activeClass: 'bg-indigo-50 border-indigo-100 text-indigo-700'
    },
    planning: {
        label: 'Planning',
        icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>,
        activeClass: 'bg-blue-50 border-blue-100 text-blue-700'
    },
    suivi: {
        label: 'Suivi Production',
        icon: <Activity className="w-3.5 h-3.5" />,
        activeClass: 'bg-indigo-50 border-indigo-100 text-indigo-700'
    },
    rendement: {
        label: 'Rendement',
        icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>,
        activeClass: 'bg-violet-50 border-violet-100 text-violet-700'
    },
    ingenierie: {
        label: (t: any) => t.ingenierie,
        icon: <Factory className="w-3.5 h-3.5" />,
        activeClass: 'bg-emerald-50 border-emerald-100 text-emerald-700'
    },
    atelierProd: {
        label: 'Atelier P°',
        icon: <Factory className="w-3.5 h-3.5" />,
        activeClass: 'bg-orange-50 border-orange-100 text-orange-700'
    },
    coupe: {
        label: 'La Coupe',
        icon: <Scissors className="w-3.5 h-3.5" />,
        activeClass: 'bg-rose-50 border-rose-100 text-rose-700'
    },
    sousTraitance: {
        label: 'Sous-traitance',
        icon: <Truck className="w-3.5 h-3.5" />,
        activeClass: 'bg-indigo-50 border-indigo-100 text-indigo-700'
    },
    effectifs: {
        label: (t: any) => t.effectifs,
        icon: <Users className="w-3.5 h-3.5" />,
        activeClass: 'bg-orange-50 border-orange-100 text-orange-700'
    },
    gestionRh: {
        label: 'Gestion RH',
        icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
        activeClass: 'bg-sky-50 border-sky-100 text-sky-700'
    },
    magasin: {
        label: 'Magasin',
        icon: <Package className="w-3.5 h-3.5" />,
        activeClass: 'bg-emerald-50 border-emerald-100 text-emerald-700'
    },
    export: {
        label: 'Stock Fini',
        icon: <PackageCheck className="w-3.5 h-3.5" />,
        activeClass: 'bg-cyan-50 border-cyan-100 text-cyan-700'
    },
    facturation: {
        label: 'Facturation',
        icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
        activeClass: 'bg-blue-50 border-blue-100 text-blue-700'
    },
    library: {
        label: (t: any) => t.library,
        icon: <FolderOpen className="w-3.5 h-3.5" />,
        activeClass: 'bg-indigo-50 border-indigo-100 text-indigo-700'
    },
    pageMachine: {
        label: 'Suivi des Machines',
        icon: <Activity className="w-3.5 h-3.5" />,
        activeClass: 'bg-fuchsia-50 border-fuchsia-100 text-fuchsia-700'
    },
    machin: {
        label: 'Catalogue & Paramètres',
        icon: <Layers className="w-3.5 h-3.5" />,
        activeClass: 'bg-indigo-50 border-indigo-100 text-indigo-700'
    },
    catalogTemps: {
        label: 'Catalogue de Temps',
        icon: <Clock className="w-3.5 h-3.5" />,
        activeClass: 'bg-violet-50 border-violet-100 text-violet-700'
    },
    config: {
        label: (t: any) => t.configuration,
        icon: <SettingsIcon className="w-3.5 h-3.5" />,
        activeClass: 'bg-amber-50 border-amber-100 text-amber-700'
    },
    admin: {
        label: (t: any) => t.admin,
        icon: <Shield className="w-3.5 h-3.5" />,
        activeClass: 'bg-purple-50 border-purple-100 text-purple-700'
    }
};

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
    const navRef = useRef<HTMLElement>(null);

    const scrollNav = (direction: 'left' | 'right') => {
        if (navRef.current) {
            const offset = 200;
            navRef.current.scrollBy({
                left: direction === 'left' ? -offset : offset,
                behavior: 'smooth'
            });
        }
    };

    return (
        <header className="bg-white border-b border-gray-100 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] z-[100] shrink-0 h-12 sticky top-0 print:hidden">
            <div className="h-full px-3 sm:px-4 flex items-center justify-between">
                {/* Left: Hamburger (mobile) + Logo */}
                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Hamburger Menu Button - toujours dispo sur mobile (la nav desktop est cachée < md) */}
                    <button onClick={() => setMobileMenuOpen(v => !v)}
                        aria-label="Menu"
                        className={`${navConfig.style === 'mobile-only' ? 'flex' : 'md:hidden flex'} items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition-colors shrink-0`}>
                        {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                    </button>

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

                {/* Main Navigation - Hidden on mobile, shown on md+ based on style selection */}
                {navConfig.style !== 'mobile-only' && (
                    <div className={`hidden md:flex items-center relative group/nav overflow-hidden py-1 mx-4 ${
                        navConfig.style === 'flat' ? 'max-w-[60vw]' : 'max-w-[72vw]'
                    }`}>
                        {/* Left Scroll Button */}
                        <button
                            onClick={() => scrollNav('left')}
                            type="button"
                            className="absolute left-0 top-0 bottom-0 z-10 w-8 bg-white/40 hover:bg-white/60 backdrop-blur-md border-r border-slate-200/50 text-slate-600 hover:text-indigo-600 transition-all duration-200 active:bg-white/80 opacity-0 group-hover/nav:opacity-100 flex items-center justify-center cursor-pointer"
                            title={t.prev}
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>

                        <nav 
                            ref={navRef}
                            className="flex items-center gap-1 overflow-x-auto hide-scrollbar px-8 scroll-smooth w-full h-full"
                        >
                            {/* Style 1: Dynamic Dropdowns Grouped by Category */}
                            {navConfig.style === 'dropdown' && navConfig.categories?.map((category) => {
                                const visibleViews = category.views.filter(view => {
                                    if (navConfig.hidden.includes(view)) return false;
                                    if (view === 'admin' && user?.role !== 'admin') return false;
                                    return VIEW_DEFS[view] !== undefined;
                                });

                                if (visibleViews.length === 0) return null;

                                const isActive = visibleViews.includes(currentView);
                                const activeClass = VIEW_DEFS[visibleViews[0]]?.activeClass || 'bg-indigo-50 border-indigo-100 text-indigo-700';

                                return (
                                    <NavDropdown
                                        key={category.id}
                                        label={category.name}
                                        views={visibleViews}
                                        currentView={currentView}
                                        activeClass={activeClass}
                                        align={category.id === 'config' || category.id === 'logistique' ? 'right' : 'left'}
                                    >
                                        {visibleViews.map(view => {
                                            const def = VIEW_DEFS[view];
                                            if (!def) return null;
                                            const label = typeof def.label === 'function' ? def.label(t) : def.label;
                                            return (
                                                <DropdownItem
                                                    key={view}
                                                    view={view as any}
                                                    currentView={currentView}
                                                    onClick={handleNavigation}
                                                    activeClass={def.activeClass}
                                                    icon={def.icon}
                                                    label={label}
                                                />
                                            );
                                        })}
                                    </NavDropdown>
                                );
                            })}

                            {/* Admin Button (Dropdown Style only) */}
                            {navConfig.style === 'dropdown' && user?.role === 'admin' && (
                                <NavButton
                                    view="admin"
                                    currentView={currentView}
                                    onClick={handleNavigation}
                                    activeClass="bg-purple-50 border-purple-100 text-purple-700"
                                    icon={<Shield className="w-3.5 h-3.5" />}
                                    label={t.admin}
                                />
                            )}

                            {/* Style 2: Flat List of All Modules */}
                            {navConfig.style === 'flat' && navConfig.order.map(view => {
                                if (navConfig.hidden.includes(view)) return null;
                                if (view === 'admin' && user?.role !== 'admin') return null;
                                const def = VIEW_DEFS[view];
                                if (!def) return null;
                                const label = typeof def.label === 'function' ? def.label(t) : def.label;
                                return (
                                    <NavButton
                                        key={view}
                                        view={view as any}
                                        currentView={currentView}
                                        onClick={handleNavigation}
                                        activeClass={def.activeClass}
                                        icon={def.icon}
                                        label={label}
                                    />
                                );
                            })}
                        </nav>

                        {/* Right Scroll Button */}
                        <button
                            onClick={() => scrollNav('right')}
                            type="button"
                            className="absolute right-0 top-0 bottom-0 z-10 w-8 bg-white/40 hover:bg-white/60 backdrop-blur-md border-l border-slate-200/50 text-slate-600 hover:text-indigo-600 transition-all duration-200 active:bg-white/80 opacity-0 group-hover/nav:opacity-100 flex items-center justify-center cursor-pointer"
                            title={t.next}
                        >
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

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
                            title="Télécharger la base de données (Sauvegarde DB) / تحميل قاعدة البيانات (نسخة احتياطية)"
                        >
                            <Database className="w-3.5 h-3.5" />
                        </button>
                    )}

                    <SyncIndicator />

                    <SupportWidget user={user} />

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
            className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border ${currentView === view
                ? activeClass
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
        >
            {icon}
            {label}
        </button>
    );
}

/** Grouped Dropdown Wrapper */
interface NavDropdownProps {
    label: string;
    views: string[];
    currentView: ViewType;
    activeClass: string;
    align?: 'left' | 'right';
    children: React.ReactNode;
}

function NavDropdown({ label, views, currentView, activeClass, align = 'left', children }: NavDropdownProps) {
    const isActive = views.includes(currentView);
    const btnRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number; right: number }>({ top: 0, left: 0, right: 0 });

    const updatePos = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom + 4, left: r.left, right: window.innerWidth - r.right });
    };
    const show = () => { updatePos(); setOpen(true); };
    const hide = () => setOpen(false);

    // Le menu est rendu en Portal (position fixed) : jamais coupé par le scroll horizontal de la nav.
    // On le referme si la page défile, la fenêtre change de taille.
    useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [open]);

    return (
        <div className="relative shrink-0" onMouseEnter={show} onMouseLeave={hide}>
            <button
                ref={btnRef}
                onClick={() => (open ? hide() : show())}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap border ${
                    isActive || open
                        ? activeClass
                        : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
            >
                {label}
                <ChevronDown className={`w-3 h-3 opacity-60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && createPortal(
                <div
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={hide}
                    onClick={() => setOpen(false)}
                    style={{
                        position: 'fixed',
                        top: pos.top,
                        ...(align === 'right' ? { right: pos.right } : { left: pos.left }),
                    }}
                    className="w-48 bg-white border border-gray-100 rounded-xl shadow-lg p-1.5 z-[200] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150"
                >
                    {children}
                </div>,
                document.body
            )}
        </div>
    );
}

/** Dropdown menu item button */
function DropdownItem({ view, currentView, onClick, activeClass, icon, label }: {
    view: ViewType;
    currentView: ViewType;
    onClick: (v: ViewType) => void;
    activeClass: string;
    icon: React.ReactNode;
    label: string;
}) {
    const isActive = currentView === view;
    return (
        <button
            onClick={() => onClick(view)}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg transition-all text-[10.5px] font-bold uppercase tracking-wide text-start border ${
                isActive
                    ? activeClass
                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
        >
            {icon}
            <span className="truncate">{label}</span>
        </button>
    );
}
