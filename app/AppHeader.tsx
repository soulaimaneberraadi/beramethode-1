import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    BarChart3,
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
import { TRANSLATIONS, CATEGORY_TRANSLATIONS } from './constants';
import { tx } from '../lib/i18n';
import SupportWidget from '../components/SupportWidget';
import SyncIndicator from '../components/SyncIndicator';
import { clearLocalAppData } from '../src/lib/cloudSync';

type ViewType = 'vuegenerale' | 'dashboard' | 'ingenierie' | 'library' | 'coupe' | 'effectifs' | 'gestionRh' | 'planning' | 'suivi' | 'magasin' | 'export' | 'config' | 'profil' | 'admin' | 'rendement' | 'pageMachine' | 'machin' | 'facturation' | 'atelierProd' | 'sousTraitance' | 'catalogTemps';

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

export type ViewLabelFn = (lang: Lang) => string;
export const VIEW_DEFS: Record<string, { label: string | ViewLabelFn; icon: React.ReactNode; activeClass: string }> = {
    vuegenerale: {
        label: (l: any) => tx(l, { fr: 'Vue Générale', ar: 'نظرة عامة', en: 'Overview', es: 'Vista General', pt: 'Visão Geral', tr: 'Genel Bakış' }),
        icon: <BarChart3 className="w-3.5 h-3.5" />,
        activeClass: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 text-indigo-700'
    },
    dashboard: {
        label: (l: any) => tx(l, { fr: 'Tableau de bord', ar: 'لوحة التحكم', en: 'Dashboard', es: 'Panel', pt: 'Painel', tr: 'Gösterge Paneli' }),
        icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>,
        activeClass: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 text-indigo-700'
    },
    planning: {
        label: (l: any) => tx(l, { fr: 'Planning', ar: 'التخطيط', en: 'Planning', es: 'Planificación', pt: 'Planeamento', tr: 'Planlama' }),
        icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>,
        activeClass: 'bg-blue-50 dark:bg-blue-900/30 border-blue-100 text-blue-700'
    },
    suivi: {
        label: (l: any) => tx(l, { fr: 'Suivi Production', ar: 'تتبع الإنتاج', en: 'Production Tracking', es: 'Seguimiento Producción', pt: 'Acompanhamento Produção', tr: 'Üretim Takibi' }),
        icon: <Activity className="w-3.5 h-3.5" />,
        activeClass: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 text-indigo-700'
    },
    rendement: {
        label: (l: any) => tx(l, { fr: 'Rendement', ar: 'الإنتاجية', en: 'Yield', es: 'Rendimiento', pt: 'Rendimento', tr: 'Verim' }),
        icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>,
        activeClass: 'bg-violet-50 border-violet-100 text-violet-700'
    },
    ingenierie: {
        label: (l: any) => tx(l, { fr: 'Ingénierie', ar: 'الهندسة', en: 'Engineering', es: 'Ingeniería', pt: 'Engenharia', tr: 'Mühendislik' }),
        icon: <Factory className="w-3.5 h-3.5" />,
        activeClass: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 text-emerald-700'
    },
    atelierProd: {
        label: (l: any) => tx(l, { fr: 'Atelier P°', ar: 'ورشة الإنتاج', en: 'Workshop Prod.', es: 'Taller Prod.', pt: 'Oficina Prod.', tr: 'Atölye Üretim' }),
        icon: <Factory className="w-3.5 h-3.5" />,
        activeClass: 'bg-orange-50 dark:bg-orange-900/30 border-orange-100 text-orange-700'
    },
    coupe: {
        label: (l: any) => tx(l, { fr: 'La Coupe', ar: 'القص', en: 'Cutting', es: 'Corte', pt: 'Corte', tr: 'Kesim' }),
        icon: <Scissors className="w-3.5 h-3.5" />,
        activeClass: 'bg-rose-50 dark:bg-rose-900/30 border-rose-100 text-rose-700'
    },
    sousTraitance: {
        label: (l: any) => tx(l, { fr: 'Sous-traitance', ar: 'مقاولة من الباطن', en: 'Subcontracting', es: 'Subcontratación', pt: 'Subcontratação', tr: 'Taşeron' }),
        icon: <Truck className="w-3.5 h-3.5" />,
        activeClass: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 text-indigo-700'
    },
    effectifs: {
        label: (l: any) => tx(l, { fr: 'Effectifs', ar: 'التأطير', en: 'Staffing', es: 'Personal', pt: 'Efetivos', tr: 'Personel' }),
        icon: <Users className="w-3.5 h-3.5" />,
        activeClass: 'bg-orange-50 dark:bg-orange-900/30 border-orange-100 text-orange-700'
    },
    gestionRh: {
        label: (l: any) => tx(l, { fr: 'Gestion RH', ar: 'إدارة الموارد البشرية', en: 'HR Management', es: 'Gestión RRHH', pt: 'Gestão RH', tr: 'İK Yönetimi' }),
        icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
        activeClass: 'bg-sky-50 dark:bg-sky-900/30 border-sky-100 text-sky-700'
    },
    magasin: {
        label: (l: any) => tx(l, { fr: 'Magasin', ar: 'المخزن', en: 'Warehouse', es: 'Almacén', pt: 'Armazém', tr: 'Depo' }),
        icon: <Package className="w-3.5 h-3.5" />,
        activeClass: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 text-emerald-700'
    },
    export: {
        label: (l: any) => tx(l, { fr: 'Stock Fini', ar: 'المخزون النهائي', en: 'Finished Stock', es: 'Stock Terminado', pt: 'Stock Final', tr: 'Bitmiş Stok' }),
        icon: <PackageCheck className="w-3.5 h-3.5" />,
        activeClass: 'bg-cyan-50 dark:bg-cyan-900/30 border-cyan-100 text-cyan-700'
    },
    facturation: {
        label: (l: any) => tx(l, { fr: 'Facturation', ar: 'الفوترة', en: 'Invoicing', es: 'Facturación', pt: 'Faturação', tr: 'Faturalama' }),
        icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
        activeClass: 'bg-blue-50 dark:bg-blue-900/30 border-blue-100 text-blue-700'
    },
    library: {
        label: (l: any) => tx(l, { fr: 'Bibliothèque', ar: 'المكتبة', en: 'Library', es: 'Biblioteca', pt: 'Biblioteca', tr: 'Kütüphane' }),
        icon: <FolderOpen className="w-3.5 h-3.5" />,
        activeClass: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 text-indigo-700'
    },
    pageMachine: {
        label: (l: any) => tx(l, { fr: 'Suivi des Machines', ar: 'متابعة الآلات', en: 'Machine Monitoring', es: 'Seguimiento de Máquinas', pt: 'Acompanhamento de Máquinas', tr: 'Makine Takibi' }),
        icon: <Activity className="w-3.5 h-3.5" />,
        activeClass: 'bg-fuchsia-50 border-fuchsia-100 text-fuchsia-700'
    },
    machin: {
        label: (l: any) => tx(l, { fr: 'Catalogue & Paramètres', ar: 'الكتالوج والإعدادات', en: 'Catalog & Settings', es: 'Catálogo y Ajustes', pt: 'Catálogo e Definições', tr: 'Katalog ve Ayarlar' }),
        icon: <Layers className="w-3.5 h-3.5" />,
        activeClass: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 text-indigo-700'
    },
    catalogTemps: {
        label: (l: any) => tx(l, { fr: 'Catalogue de Temps', ar: 'كتالوج الأوقات', en: 'Time Catalog', es: 'Catálogo de Tiempos', pt: 'Catálogo de Tempos', tr: 'Zaman Kataloğu' }),
        icon: <Clock className="w-3.5 h-3.5" />,
        activeClass: 'bg-violet-50 border-violet-100 text-violet-700'
    },
    config: {
        label: (l: any) => tx(l, { fr: 'Configuration', ar: 'الإعدادات', en: 'Configuration', es: 'Configuración', pt: 'Configuração', tr: 'Yapılandırma' }),
        icon: <SettingsIcon className="w-3.5 h-3.5" />,
        activeClass: 'bg-amber-50 dark:bg-amber-900/30 border-amber-100 text-amber-700'
    },
    admin: {
        label: (l: any) => tx(l, { fr: 'Admin', ar: 'المشرف', en: 'Admin', es: 'Admin', pt: 'Admin', tr: 'Yönetici' }),
        icon: <Shield className="w-3.5 h-3.5" />,
        activeClass: 'bg-purple-50 dark:bg-purple-900/30 border-purple-100 text-purple-700'
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
        <header className="bg-white dark:bg-dk-surface border-b border-gray-100 dark:border-dk-border shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] z-[100] shrink-0 h-12 sticky top-0 print:hidden">
            <div className="h-full px-3 sm:px-4 flex items-center justify-between">
                {/* Left: Hamburger (mobile) + Logo */}
                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Hamburger Menu Button - toujours dispo sur mobile (la nav desktop est cachée < md) */}
                    <button onClick={() => setMobileMenuOpen(v => !v)}
                        aria-label="Menu"
                        className={`${navConfig.style === 'mobile-only' ? 'flex' : 'md:hidden flex'} items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface hover:bg-gray-50 dark:hover:bg-dk-elevated/60 text-gray-500 dark:text-dk-text-soft hover:text-gray-900 dark:hover:text-dk-text transition-colors shrink-0`}>
                        {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                    </button>

                    {/* Logo */}
                    <button
                        type="button"
                        aria-label={tx(lang, {fr:"Retour au tableau de bord",ar:"العودة إلى لوحة القيادة",en:"Back to dashboard",es:"Volver al panel",pt:"Voltar ao painel",tr:"Gösterge paneline dön"})}
                        onClick={() => handleNavigation('dashboard')}
                        className="group relative inline-flex items-center justify-center px-1 py-0.5 rounded-sm border-none transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                    >
                        <span
                            className={`relative font-extrabold text-base sm:text-lg tracking-tight transition-all duration-200 [text-shadow:none] group-hover:[text-shadow:0_1px_3px_rgba(16,185,129,0.4),0_2px_8px_rgba(16,185,129,0.22)] ${currentView === 'dashboard' ? 'text-gray-900 dark:text-dk-text' : 'text-gray-800 dark:text-dk-text group-hover:text-emerald-700 dark:group-hover:text-emerald-400'}`}
                        >
                            BERA<span className="text-emerald-600 dark:text-emerald-400">METHODE</span>
                        </span>
                    </button>

                    {/* WORKSPACE SWITCHER — bascule entre sociétés isolées du même compte */}
                    <WorkspaceSwitcher lang={lang} />

                    {/* AUTO-SAVE INDICATOR */}
                    {currentView === 'ingenierie' && (
                        <div className="ml-2 sm:ml-4 flex items-center gap-1.5 px-2 py-1 bg-slate-50 dark:bg-dk-bg dark:bg-dk-surface rounded-full border border-slate-100 dark:border-dk-border">
                            {saveStatus === 'saved' ? (
                                <>
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted hidden md:inline">{t.saved}</span>
                                </>
                            ) : saveStatus === 'saving' ? (
                                <>
                                    <div className="w-3 h-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                                    <span className="text-[10px] font-bold text-indigo-400 dark:text-indigo-300 hidden md:inline">{t.saving}</span>
                                </>
                            ) : (
                                <>
                                    <CloudOff className="w-3 h-3 text-amber-500" />
                                    <span className="text-[10px] font-bold text-amber-500 dark:text-amber-400 hidden md:inline">{t.unsaved}</span>
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
                            className="absolute left-0 top-0 bottom-0 z-10 w-8 bg-white/40 dark:bg-dk-bg/40 hover:bg-white/60 dark:hover:bg-dk-surface/60 backdrop-blur-md border-r border-slate-200/50 dark:border-dk-border text-slate-600 dark:text-dk-text-soft hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-200 active:bg-white/80 dark:active:bg-dk-surface/80 opacity-0 group-hover/nav:opacity-100 flex items-center justify-center cursor-pointer"
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
                                const activeClass = VIEW_DEFS[visibleViews[0]]?.activeClass || 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 text-indigo-700';

                                return (
                                    <NavDropdown
                                        key={category.id}
                                        label={CATEGORY_TRANSLATIONS[category.id] ? tx(lang, CATEGORY_TRANSLATIONS[category.id]) : category.name}
                                        views={visibleViews}
                                        currentView={currentView}
                                        activeClass={activeClass}
                                        align={category.id === 'config' || category.id === 'logistique' ? 'right' : 'left'}
                                    >
                                        {visibleViews.map(view => {
                                            const def = VIEW_DEFS[view];
                                            if (!def) return null;
                                            const label = typeof def.label === 'function' ? def.label(lang) : def.label;
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
                                    activeClass="bg-purple-50 dark:bg-purple-900/30 border-purple-100 text-purple-700"
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
                                const label = typeof def.label === 'function' ? def.label(lang) : def.label;
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
                            className="absolute right-0 top-0 bottom-0 z-10 w-8 bg-white/40 dark:bg-dk-bg/40 hover:bg-white/60 dark:hover:bg-dk-surface/60 backdrop-blur-md border-l border-slate-200/50 dark:border-dk-border text-slate-600 dark:text-dk-text-soft hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-200 active:bg-white/80 dark:active:bg-dk-surface/80 opacity-0 group-hover/nav:opacity-100 flex items-center justify-center cursor-pointer"
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
                            className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-dk-surface border border-gray-100 dark:border-dk-border text-gray-400 dark:text-dk-muted hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-100 dark:hover:border-blue-800 transition-colors cursor-pointer"
                            title={tx(lang, {fr:"Télécharger la base de données (Sauvegarde DB)",ar:"تحميل قاعدة البيانات (نسخة احتياطية)",en:"Download database (DB backup)",es:"Descargar base de datos (Respaldo DB)",pt:"Baixar banco de dados (Backup DB)",tr:"Veritabanını indir (DB yedekleme)"})}
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
                            ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800'
                            : 'bg-white dark:bg-dk-surface border-gray-100 dark:border-dk-border hover:border-gray-200 dark:hover:border-dk-elevated'
                            }`}
                    >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                            {user?.name ? user.name.substring(0, 2).toUpperCase() : 'SB'}
                        </div>
                    </button>

                    <button
                        onClick={logout}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-dk-surface border border-gray-100 dark:border-dk-border text-gray-400 dark:text-dk-muted hover:text-red-600 dark:hover:text-red-400 hover:border-red-100 dark:hover:border-red-800 transition-colors cursor-pointer"
                        title={t.logout}
                    >
                        <LogOut className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </header>
    );
}

/** Sélecteur de workspace (société) — liste, bascule, création. Visible en mode serveur. */
interface WorkspaceItem { ownerId: number; name: string; isActive: boolean; }
function WorkspaceSwitcher({ lang }: { lang: Lang }) {
    const [open, setOpen] = useState(false);
    const [list, setList] = useState<WorkspaceItem[]>([]);
    const [busy, setBusy] = useState(false);
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const btnRef = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    const load = () => {
        fetch('/api/workspaces', { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (d?.ok && Array.isArray(d.workspaces)) setList(d.workspaces); })
            .catch(() => { /* mode statique / hors-ligne : on masque */ });
    };
    useEffect(() => { load(); }, []);

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

    const active = list.find(w => w.isActive) || list[0];

    const openMenu = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom + 6, left: r.left });
        load();
        setAdding(false);
        setNewName('');
        setOpen(o => !o);
    };

    const switchTo = (ownerId: number) => {
        if (busy || ownerId === active?.ownerId) { setOpen(false); return; }
        setBusy(true);
        fetch('/api/workspaces/switch', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerId }),
        })
            .then(r => { if (!r.ok) throw new Error('switch failed'); return r.json(); })
            .then(() => {
                // Purge des données locales (machines, paramètres, biblio, planning…)
                // pour qu'elles ne fuient PAS de l'ancien workspace vers le nouveau.
                // Les données serveur sont déjà re-cloisonnées par companyId au reload.
                clearLocalAppData();
                window.location.reload();
            })
            .catch(() => setBusy(false));
    };

    const create = () => {
        const name = newName.trim();
        if (!name || busy) return;
        setBusy(true);
        fetch('/api/workspaces', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        })
            .then(r => { if (!r.ok) throw new Error('create failed'); return r.json(); })
            .then(() => {
                // Nouveau workspace = données vierges : on purge le local pour ne pas
                // hériter de l'ancien (le serveur est déjà cloisonné par companyId).
                clearLocalAppData();
                window.location.reload();
            })
            .catch(() => setBusy(false));
    };

    // Rien à afficher tant que la liste n'est pas chargée (ou mode statique).
    if (list.length === 0) return null;

    return (
        <div className="relative shrink-0">
            <button
                ref={btnRef}
                onClick={openMenu}
                disabled={busy}
                title={tx(lang, { fr: 'Changer de société', ar: 'تبديل الشركة', en: 'Switch workspace', es: 'Cambiar empresa', pt: 'Trocar empresa', tr: 'Çalışma alanını değiştir' })}
                className="hidden sm:flex items-center gap-1.5 max-w-[180px] pl-2 pr-1.5 py-1 rounded-lg border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface hover:bg-gray-50 dark:hover:bg-dk-elevated/60 text-gray-700 dark:text-dk-text transition-colors disabled:opacity-50"
            >
                <Factory className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="text-[11px] font-bold truncate">{active?.name || '—'}</span>
                <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && createPortal(
                <>
                    <div className="fixed inset-0 z-[190]" onClick={() => setOpen(false)} />
                    <div
                        style={{ position: 'fixed', top: pos.top, left: pos.left }}
                        className="w-60 bg-white dark:bg-dk-surface border border-gray-100 dark:border-dk-border rounded-xl shadow-lg p-1.5 z-[200] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150"
                    >
                        <div className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-dk-muted">
                            {tx(lang, { fr: 'Sociétés', ar: 'الشركات', en: 'Workspaces', es: 'Empresas', pt: 'Empresas', tr: 'Çalışma alanları' })}
                        </div>
                        {list.map(w => (
                            <button
                                key={w.ownerId}
                                onClick={() => switchTo(w.ownerId)}
                                className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg transition-all text-[12px] font-bold text-start ${
                                    w.isActive ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-dk-text-soft hover:bg-gray-50 dark:hover:bg-dk-elevated/60'
                                }`}
                            >
                                <Factory className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                <span className="truncate flex-1">{w.name}</span>
                                {w.isActive && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                            </button>
                        ))}

                        <div className="h-px bg-gray-100 dark:bg-dk-border my-1" />

                        {adding ? (
                            <div className="flex items-center gap-1 px-1.5 py-1">
                                <input
                                    autoFocus
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setAdding(false); }}
                                    placeholder={tx(lang, { fr: 'Nom de la société', ar: 'اسم الشركة', en: 'Workspace name', es: 'Nombre', pt: 'Nome', tr: 'Ad' })}
                                    className="flex-1 min-w-0 px-2 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-dk-border dark:bg-dk-bg dark:text-dk-text focus:border-indigo-300 dark:focus:border-indigo-500 focus:outline-none"
                                />
                                <button
                                    onClick={create}
                                    disabled={busy || !newName.trim()}
                                    className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {tx(lang, { fr: 'Créer', ar: 'إنشاء', en: 'Create', es: 'Crear', pt: 'Criar', tr: 'Oluştur' })}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setAdding(true)}
                                className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[12px] font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-start"
                            >
                                <span className="w-3.5 h-3.5 flex items-center justify-center text-base leading-none">+</span>
                                {tx(lang, { fr: 'Nouvelle société', ar: 'شركة جديدة', en: 'New workspace', es: 'Nueva empresa', pt: 'Nova empresa', tr: 'Yeni çalışma alanı' })}
                            </button>
                        )}
                    </div>
                </>,
                document.body
            )}
        </div>
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
                : 'bg-transparent border-transparent text-gray-500 dark:text-dk-text-soft hover:text-gray-900 dark:hover:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-elevated/60'
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
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearHideTimer = () => {
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    };

    const updatePos = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom, left: r.left, right: window.innerWidth - r.right });
    };
    const show = () => { clearHideTimer(); updatePos(); setOpen(true); };
    const hide = () => { clearHideTimer(); setOpen(false); };
    const hideDelayed = () => {
        clearHideTimer();
        hideTimerRef.current = setTimeout(() => setOpen(false), 200);
    };

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
        <div className="relative shrink-0" onMouseEnter={show} onMouseLeave={hideDelayed}>
            <button
                ref={btnRef}
                onClick={() => (open ? hide() : show())}
                className={                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap border ${
                    isActive || open
                        ? activeClass
                        : 'bg-transparent border-transparent text-gray-500 dark:text-dk-text-soft hover:text-gray-900 dark:hover:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-elevated/60'
                }`}
            >
                {label}
                <ChevronDown className={`w-3 h-3 opacity-60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && createPortal(
                <div
                    onMouseEnter={clearHideTimer}
                    onMouseLeave={hideDelayed}
                    onClick={() => setOpen(false)}
                    style={{
                        position: 'fixed',
                        top: pos.top,
                        ...(align === 'right' ? { right: pos.right } : { left: pos.left }),
                    }}
                    className="w-48 bg-white dark:bg-dk-surface border border-gray-100 dark:border-dk-border rounded-xl shadow-lg p-1.5 z-[200] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150"
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
                    : 'bg-transparent border-transparent text-gray-500 dark:text-dk-text-soft hover:text-gray-900 dark:hover:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-elevated/60'
            }`}
        >
            {icon}
            <span className="truncate">{label}</span>
        </button>
    );
}
