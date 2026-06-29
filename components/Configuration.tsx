import React, { useState, useCallback, useEffect } from 'react';
import { Settings, Users, Shield, Save, Building, Plus, Trash2, CheckCircle, ListTodo, CalendarClock, AlertTriangle, Check, X, SkipForward, Factory, Zap, ChevronDown, Loader2 } from 'lucide-react';
import { AppSettings, AppTask, Machine } from '../types';
import { useTheme } from '../src/context/ThemeContext';
import { isMachineOperational } from '../utils/machineMatch';
import AgendaModal from './AgendaModal';
import {
  buildPointageTranchesFromAppSettings,
  getDefaultPointageTranches,
  parsePointageTranchesFromSettings,
  type PointageTranchesConfig,
  type PointageTrancheSlot,
} from '../lib/pointageGrille';
import { tx, pickT } from '../lib/i18n';
import { TRANSLATIONS } from './configTranslations';

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';
import type { Lang } from '../app/constants';

interface ConfigurationProps {
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    lang: Lang;
    /** Parc machines — affectation par chaîne pour le planning (couverture gamme). */
    machines: Machine[];
    navConfig?: {
        enabled: boolean;
        style: 'dropdown' | 'flat' | 'mobile-only';
        order: string[];
        hidden: string[];
        categories: { id: string; name: string; views: string[] }[];
    };
    setNavConfig?: (cfg: any) => void;
    /** Langue active (code réel) + changement instantané de la langue de l'interface. */
    currentLang?: string;
    onSetLang?: (l: string) => void;
}

const VIEW_LABELS: Record<string, Partial<Record<Lang, string>> & { fr: string }> = {
    dashboard: { fr: 'Tableau de bord', ar: 'لوحة التحكم', en: 'Dashboard', es: 'Panel de control', pt: 'Painel de controlo', tr: 'Gösterge paneli' },
    planning: { fr: 'Planning', ar: 'التخطيط', en: 'Planning', es: 'Planificación', pt: 'Planeamento', tr: 'Planlama' },
    suivi: { fr: 'Suivi Production', ar: 'تتبع الإنتاج', en: 'Production Tracking', es: 'Seguimiento de Producción', pt: 'Acompanhamento de Produção', tr: 'Üretim Takibi' },
    rendement: { fr: 'Rendement', ar: 'المردودية', en: 'Yield', es: 'Rendimiento', pt: 'Rendimento', tr: 'Verim' },
    ingenierie: { fr: 'Ingénierie', ar: 'الهندسة', en: 'Engineering', es: 'Ingeniería', pt: 'Engenharia', tr: 'Mühendislik' },
    atelier: { fr: 'Atelier Méthodes', ar: 'ورشة الأساليب', en: 'Methods Workshop', es: 'Taller de Métodos', pt: 'Oficina de Métodos', tr: 'Metot Atölyesi' },
    atelierProd: { fr: 'Atelier P°', ar: 'ورشة الإنتاج', en: 'Prod. Workshop', es: 'Taller de Prod.', pt: 'Oficina de Prod.', tr: 'Üretim Atölyesi' },
    coupe: { fr: 'La Coupe', ar: 'القص', en: 'Cutting', es: 'El Corte', pt: 'O Corte', tr: 'Kesim' },
    sousTraitance: { fr: 'Sous-traitance', ar: 'التعاقد الفرعي', en: 'Subcontracting', es: 'Subcontratación', pt: 'Subcontratação', tr: 'Fason' },
    effectifs: { fr: 'Effectifs', ar: 'الموارد البشرية', en: 'Workforce', es: 'Plantilla', pt: 'Efetivos', tr: 'İş Gücü' },
    gestionRh: { fr: 'Gestion RH', ar: 'إدارة الموارد البشرية', en: 'HR Management', es: 'Gestión de RRHH', pt: 'Gestão de RH', tr: 'İK Yönetimi' },
    magasin: { fr: 'Magasin', ar: 'المخزن', en: 'Warehouse', es: 'Almacén', pt: 'Armazém', tr: 'Depo' },
    export: { fr: 'Stock Fini', ar: 'تصدير المخزون', en: 'Finished Stock', es: 'Stock Terminado', pt: 'Stock Acabado', tr: 'Bitmiş Stok' },
    facturation: { fr: 'Facturation', ar: 'الفوترة', en: 'Invoicing', es: 'Facturación', pt: 'Faturação', tr: 'Faturalama' },
    library: { fr: 'Bibliothèque', ar: 'المكتبة', en: 'Library', es: 'Biblioteca', pt: 'Biblioteca', tr: 'Kütüphane' },
    pageMachine: { fr: 'Suivi des Machines', ar: 'تتبع الآلات', en: 'Machine Tracking', es: 'Seguimiento de Máquinas', pt: 'Acompanhamento de Máquinas', tr: 'Makine Takibi' },
    machin: { fr: 'Catalogue & Paramètres', ar: 'كتالوج و إعدادات', en: 'Catalog & Settings', es: 'Catálogo y Parámetros', pt: 'Catálogo e Parâmetros', tr: 'Katalog ve Ayarlar' },
    objectifs: { fr: 'Objectifs', ar: 'الأهداف', en: 'Objectives', es: 'Objetivos', pt: 'Objetivos', tr: 'Hedefler' },
    config: { fr: 'Configuration', ar: 'الإعدادات العامة', en: 'Configuration', es: 'Configuración', pt: 'Configuração', tr: 'Yapılandırma' },
    paramètres: { fr: 'Paramètres', ar: 'الإعدادات', en: 'Settings', es: 'Parámetros', pt: 'Parâmetros', tr: 'Ayarlar' },
    admin: { fr: 'Admin', ar: 'المشرف', en: 'Admin', es: 'Admin', pt: 'Admin', tr: 'Yönetici' },
};

export default function Configuration({ settings, setSettings, lang, machines, navConfig, setNavConfig, currentLang, onSetLang }: ConfigurationProps) {
    const t = pickT(TRANSLATIONS, lang);
    const [showSaveToast, setShowSaveToast] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showAgenda, setShowAgenda] = useState(false);

    // Mode "brouillon" : les modifications restent locales à cette page et ne touchent
    // au reste de l'app (ni ne sont persistées) qu'au clic explicite sur "Enregistrer".
    const [draft, setDraftState] = useState<AppSettings>(settings);
    const [isDirty, setIsDirty] = useState(false);
    useEffect(() => {
        if (!isDirty) setDraftState(settings);
    }, [settings, isDirty]);
    const setDraft: typeof setSettings = (updater) => {
        setDraftState(prev => (typeof updater === 'function' ? (updater as (p: AppSettings) => AppSettings)(prev) : updater));
        setIsDirty(true);
    };

    // Sections repliables (mobile/tablette < xl) — repliées par défaut, toujours ouvertes en desktop (xl)
    const [openSec, setOpenSec] = useState<Record<string, boolean>>({});
    const toggleSec = (k: string) => setOpenSec(prev => ({ ...prev, [k]: !prev[k] }));
    const [sageR, setSageR] = useState(15);
    const [sageW, setSageW] = useState('06:00');
    const [sageA, setSageA] = useState(true);
    const [sageBusy, setSageBusy] = useState(false);
    const [trCfg, setTrCfg] = useState<PointageTranchesConfig>(() => getDefaultPointageTranches());
    const [trBusy, setTrBusy] = useState(false);
    const loadSage = useCallback(() => {
        fetch('/api/settings', { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then((d: Record<string, unknown> | null) => {
                if (!d) return;
                const r0 = d.hr_sage_rounding;
                const w0 = d.hr_sage_workday_start;
                const a0 = d.hr_sage_apply;
                if (r0 != null) setSageR(Math.min(60, Math.max(1, parseInt(String(r0), 10) || 15)));
                if (w0 != null && /^\d{1,2}:\d{2}/.test(String(w0))) setSageW(String(w0).match(/^\d{1,2}:\d{2}/)![0]);
                if (a0 !== undefined) setSageA(a0 !== 'false' && a0 !== false);
                setTrCfg(parsePointageTranchesFromSettings(d.hr_pointage_tranches, draft));
            })
            .catch(() => {});
    }, [draft]);
    useEffect(() => { loadSage(); }, [loadSage]);
    const saveSage = () => {
        setSageBusy(true);
        fetch('/api/settings', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hr_sage_rounding: String(sageR),
                hr_sage_workday_start: sageW,
                hr_sage_apply: sageA ? 'true' : 'false',
            }),
        })
            .then(r => {
                if (r.ok) {
                    setSettings(prev => ({ ...prev, hrSageRounding: sageR, hrSageWorkdayStart: sageW, hrSageApply: sageA }));
                }
            })
            .catch(() => {})
            .finally(() => setSageBusy(false));
    };

    const saveTranches = () => {
        setTrBusy(true);
        fetch('/api/settings', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hr_pointage_tranches: trCfg }),
        })
            .then(r => {
                if (r.ok) {
                    setShowSaveToast(true);
                    setTimeout(() => setShowSaveToast(false), 3000);
                }
            })
            .catch(() => {})
            .finally(() => setTrBusy(false));
    };

    const updateTrSlot = (index: number, patch: Partial<PointageTrancheSlot>) => {
        setTrCfg(c => {
            const slots = c.slots.map((s, i) => (i === index ? { ...s, ...patch } : s));
            return { ...c, slots };
        });
    };

    const removeTrSlot = (index: number) => {
        setTrCfg(c => {
            if (c.slots.length <= 2) return c;
            const slots = c.slots.filter((_, i) => i !== index);
            let sep = c.sepAfterIndex;
            if (sep > slots.length - 2) sep = Math.max(-1, slots.length - 2);
            return { slots, sepAfterIndex: sep };
        });
    };

    const addTrSlot = () => {
        setTrCfg(c => {
            const n = c.slots.length + 1;
            const slots = [...c.slots, { label: `T${n}`, start: '08:00', end: '09:00' }];
            return { ...c, slots };
        });
    };

    const resetTranches = () => {
        setTrCfg(buildPointageTranchesFromAppSettings(draft));
    };

    // --- TASK STATE ---
    const [newTaskText, setNewTaskText] = useState('');
    const [newTaskDate, setNewTaskDate] = useState(new Date().toISOString().split('T')[0]);
    const [newTaskAssignee, setNewTaskAssignee] = useState(''); // FORMAT: "Name|Role"

    const handleAddTask = () => {
        if (!newTaskText || !newTaskAssignee || !newTaskDate) return;

        const [name, role] = newTaskAssignee.split('|');

        const newTask: AppTask = {
            id: Date.now().toString(),
            text: newTaskText,
            assigneeName: name,
            assigneeRole: role,
            status: 'PENDING',
            date: newTaskDate,
            isDone: false, // Legacy
            createdAt: new Date().toISOString()
        };

        setDraft(prev => ({
            ...prev,
            tasks: [...(prev.tasks || []), newTask]
        }));

        setNewTaskText('');
        // Keep date and assignee for multi-entry convenience
    };

    const handleDeleteTask = (taskId: string) => {
        if (confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
            setDraft(prev => ({
                ...prev,
                tasks: prev.tasks?.filter(t => t.id !== taskId) || []
            }));
        }
    };

    const updateTaskStatus = (taskId: string, newStatus: 'PENDING' | 'DONE_OK' | 'DONE_NOT_OK' | 'SKIPPED', reason?: string) => {
        setDraft(prev => ({
            ...prev,
            tasks: prev.tasks?.map(t => {
                if (t.id === taskId) {
                    return { ...t, status: newStatus as any, skipReason: reason, isDone: newStatus === 'DONE_OK' };
                }
                return t;
            }) || []
        }));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setDraft(prev => ({
            ...prev,
            [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value
        }));
    };

    const toggleWorkingDay = (dayIndex: number) => {
        setDraft(prev => {
            const current = prev.workingDays || [];
            const days = current.includes(dayIndex)
                ? current.filter(d => d !== dayIndex)
                : [...current, dayIndex].sort((a, b) => a - b);
            return { ...prev, workingDays: days };
        });
    };

    const addPause = () => {
        setDraft(prev => ({
            ...prev,
            pauses: [...(prev.pauses || []), { id: Date.now().toString(), name: 'Nouvelle Pause', start: '12:00', end: '13:00', durationMin: 60 }]
        }));
    };

    const updatePause = (id: string, field: 'start' | 'end' | 'name', value: string) => {
        setDraft(prev => ({
            ...prev,
            pauses: (prev.pauses || []).map(p => {
                if (p.id !== id) return p;
                const updated = { ...p, [field]: value };
                if ((field === 'start' || field === 'end') && updated.start && updated.end) {
                    const [sh, sm] = updated.start.split(':').map(Number);
                    const [eh, em] = updated.end.split(':').map(Number);
                    let diffMinutes = (eh * 60 + em) - (sh * 60 + sm);
                    if (diffMinutes < 0) diffMinutes += 24 * 60;
                    updated.durationMin = diffMinutes;
                }
                return updated;
            })
        }));
    };

    const removePause = (id: string) => {
        setDraft(prev => ({
            ...prev,
            pauses: (prev.pauses || []).filter(p => p.id !== id)
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // En mode statique (Vercel, sans serveur Express), /api/settings n'existe pas :
            // la persistance passe par localStorage + Supabase via setSettings (cf. App.tsx).
            if (!IS_STATIC) {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ global_settings: draft }),
                });
                if (!res.ok) throw new Error('save failed');
            }
            setSettings(draft); // applique le brouillon au reste de l'app seulement maintenant
            setIsDirty(false);
            setShowSaveToast(true);
            setTimeout(() => setShowSaveToast(false), 3000);
        } catch (e) {
            console.error('Erreur sauvegarde settings:', e);
        } finally {
            setIsSaving(false);
        }
    };

    React.useEffect(() => {
        const handleOpenAgenda = () => {
            setShowAgenda(true);
        };
        window.addEventListener('open-agenda-modal', handleOpenAgenda);
        return () => window.removeEventListener('open-agenda-modal', handleOpenAgenda);
    }, []);

    return (
        <div className="p-4 md:p-8 w-full max-w-none mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24" dir={lang === 'ar' ? 'rtl' : 'ltr'}>

            {/* Success Toast */}
            {showSaveToast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 text-white px-6 py-3 rounded-full shadow-lg dark:shadow-dk-lg flex items-center gap-3 animate-in slide-in-from-top-5 duration-300">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-bold text-sm tracking-wide">{t.saved}</span>
                </div>
            )}

            {/* Header */}
            <div className="bg-white dark:bg-dk-surface p-4 sm:p-6 rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sticky top-0 z-50">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text border border-indigo-100 shrink-0">
                        <Settings className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-dk-text tracking-tight">{t.title}</h1>
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-dk-muted font-medium mt-1">{t.desc}</p>
                        {isDirty && !isSaving && (
                            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                {tx(lang, { fr: 'Modifications non enregistrées', ar: 'تعديلات غير محفوظة', en: 'Unsaved changes', es: 'Cambios sin guardar', pt: 'Alterações não guardadas', tr: 'Kaydedilmemiş değişiklikler' })}
                            </p>
                        )}
                    </div>
                </div>
                <button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 sm:px-8 py-3 bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg dark:shadow-dk-lg shadow-indigo-600/30 active:scale-95 group relative overflow-hidden">
                    <span className="absolute inset-0 w-full h-full bg-white dark:bg-dk-surface/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></span>
                    {isSaving ? (
                        <Loader2 className="w-5 h-5 relative z-10 animate-spin" />
                    ) : (
                        <Save className="w-5 h-5 relative z-10 group-hover:scale-110 transition-transform" />
                    )}
                    <span className="relative z-10">{isSaving ? '...' : t.save}</span>
                    {isDirty && !isSaving && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    )}
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">

                {/* LEFT COLUMN: General & Structure Placeholder */}
                <div className="space-y-6">
                    {/* General Settings */}
                    <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col">
                        <div onClick={() => toggleSec('gen')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center gap-2 cursor-pointer select-none ${openSec['gen'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                            <Building className="w-5 h-5 text-slate-500 dark:text-dk-muted" />
                            <h2 className="font-bold text-slate-800 dark:text-dk-text">{t.general}</h2>
                            <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted ml-auto shrink-0 transition-transform ${openSec['gen'] ? 'rotate-180' : ''}`} />
                        </div>
                        <div className={`p-5 space-y-6 flex-1 ${openSec['gen'] ? '' : 'hidden'}`}>
                            <div className="pt-4 border-t border-slate-100 dark:border-dk-border">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-100 shrink-0">
                                        <Factory className="w-5 h-5" />
                                    </div>
                                    <span className="font-bold text-slate-800 dark:text-dk-text text-sm">{t.machineModuleTitle}</span>
                                </div>

                                {/* Option 1 — Désactiver les alertes */}
                                <div className="flex items-start justify-between gap-4 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3">
                                    <div>
                                        <span className="font-bold text-slate-800 dark:text-dk-text text-sm block">{t.machineAlertsTitle}</span>
                                        <span className="text-xs text-slate-500 dark:text-dk-muted block mt-0.5">{t.machineAlertsLabel}</span>
                                        <span className="text-[11px] text-slate-400 dark:text-dk-muted block mt-1 leading-relaxed">{t.machineAlertsHint}</span>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={draft.machineAlertsEnabled !== false}
                                        onClick={() => setDraft(prev => ({ ...prev, machineAlertsEnabled: prev.machineAlertsEnabled === false ? true : false }))}
                                        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${draft.machineAlertsEnabled !== false ? 'bg-indigo-600 dark:bg-dk-accent' : 'bg-slate-300'}`}
                                    >
                                        <span className={`absolute top-1 w-5 h-5 bg-white dark:bg-dk-surface rounded-full shadow transition-all ${draft.machineAlertsEnabled !== false ? 'left-6' : 'left-1'}`}></span>
                                    </button>
                                </div>

                                {/* Option 2 — Masquer la page Machines du menu */}
                                {navConfig && setNavConfig && (() => {
                                    const MACHINE_VIEWS = ['pageMachine', 'machin'];
                                    const isHidden = MACHINE_VIEWS.every(v => navConfig.hidden.includes(v));
                                    return (
                                        <div className="flex items-start justify-between gap-4 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3 mt-3">
                                            <div>
                                                <span className="font-bold text-slate-800 dark:text-dk-text text-sm block">{t.machineHideLabel}</span>
                                                <span className="text-[11px] text-slate-400 dark:text-dk-muted block mt-1 leading-relaxed">{t.machineHideHint}</span>
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={isHidden}
                                                onClick={() => {
                                                    const hidden = isHidden
                                                        ? navConfig.hidden.filter(v => !MACHINE_VIEWS.includes(v))
                                                        : [...new Set([...navConfig.hidden, ...MACHINE_VIEWS])];
                                                    setNavConfig({ ...navConfig, hidden });
                                                }}
                                                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${isHidden ? 'bg-rose-600' : 'bg-slate-300'}`}
                                            >
                                                <span className={`absolute top-1 w-5 h-5 bg-white dark:bg-dk-surface rounded-full shadow transition-all ${isHidden ? 'left-6' : 'left-1'}`}></span>
                                            </button>
                                        </div>
                                    );
                                })()}

                                {/* Thème (Light / Dark / System) */}
                                {(() => {
                                    const { theme: currentTheme, setTheme } = useTheme();
                                    return (
                                        <div className="flex flex-col gap-2 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3 mt-3">
                                            <div>
                                                <span className="font-bold text-slate-800 dark:text-dk-text text-sm block text-start">{tx(lang, { fr: "Thème de l'application", ar: 'مظهر التطبيق', en: 'Application theme', es: 'Tema de la aplicación', pt: 'Tema da aplicação', tr: 'Uygulama teması' })}</span>
                                                <span className="text-[11px] text-slate-400 dark:text-dk-muted block mt-1 leading-relaxed text-start">
                                                    {tx(lang, { fr: "Choisissez le style visuel de l'application (Clair, Sombre, ou calqué sur le Système).", ar: 'اختر مظهر التطبيق المفضل لديك (فاتح، داكن، أو متوافق مع النظام)', en: 'Choose the visual style of the application (Light, Dark, or matched to the System).', es: 'Elija el estilo visual de la aplicación (Claro, Oscuro o ajustado al Sistema).', pt: 'Escolha o estilo visual da aplicação (Claro, Escuro ou conforme o Sistema).', tr: 'Uygulamanın görsel stilini seçin (Açık, Koyu veya Sisteme uyumlu).' })}
                                                </span>
                                            </div>
                                            <div className="flex gap-2 mt-2">
                                                {(['light', 'dark', 'system'] as const).map(mode => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => setTheme(mode)}
                                                        className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all border ${
                                                            currentTheme === mode
                                                                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                                                                : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-650 hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                                                        }`}
                                                    >
                                                        {mode === 'light' ? tx(lang, { fr: 'Clair ☀️', ar: 'فاتح ☀️', en: 'Light ☀️', es: 'Claro ☀️', pt: 'Claro ☀️', tr: 'Açık ☀️' }) : mode === 'dark' ? tx(lang, { fr: 'Sombre 🌙', ar: 'داكن 🌙', en: 'Dark 🌙', es: 'Oscuro 🌙', pt: 'Escuro 🌙', tr: 'Koyu 🌙' }) : tx(lang, { fr: 'Système 🖥️', ar: 'النظام 🖥️', en: 'System 🖥️', es: 'Sistema 🖥️', pt: 'Sistema 🖥️', tr: 'Sistem 🖥️' })}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Langue de l'interface (changement instantané) */}
                                {(() => {
                                    const isAr = lang === 'ar';
                                    const active = currentLang || lang;
                                    const LANGS: { code: string; label: string }[] = [
                                        { code: 'fr', label: 'Français' },
                                        { code: 'ar', label: 'العربية' },
                                        { code: 'en', label: 'English' },
                                        { code: 'es', label: 'Español' },
                                        { code: 'pt', label: 'Português' },
                                        { code: 'tr', label: 'Türkçe' },
                                    ];
                                    return (
                                        <div className="flex flex-col gap-2 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3 mt-3">
                                            <div>
                                                <span className="font-bold text-slate-800 dark:text-dk-text text-sm block text-start">{isAr ? 'لغة الواجهة' : "Langue de l'interface"}</span>
                                                <span className="text-[11px] text-slate-400 dark:text-dk-muted block mt-1 leading-relaxed text-start">
                                                    {isAr ? 'يتبدّل العرض فوراً. الترجمة الكاملة للصفحات تتوسّع تدريجياً.' : "Le changement est instantané. La traduction complète des pages s'étend progressivement."}
                                                </span>
                                            </div>
                                            <div className="flex gap-2 flex-wrap mt-2">
                                                {LANGS.map(l => (
                                                    <button
                                                        key={l.code}
                                                        type="button"
                                                        onClick={() => { try { localStorage.setItem('bera_lang', l.code); } catch {} onSetLang?.(l.code); }}
                                                        className={`py-2 px-3 rounded-lg text-[11px] font-bold transition-all border ${
                                                            active === l.code
                                                                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                                                                : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-650 hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                                                        }`}
                                                    >
                                                        {l.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="mt-auto pt-4 border-t border-slate-100 dark:border-dk-border">
                                <div className="bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text p-4 rounded-xl text-sm font-medium border border-indigo-100 flex items-start gap-3">
                                    <Settings className="w-5 h-5 shrink-0 mt-0.5" />
                                    <p>{tx(lang, { fr: "L'apparence et la langue s'appliquent instantanément. Les paramètres d'entreprise (devise, coût minute, horaires, structure) sont désormais dans la page Admin.", ar: 'المظهر واللغة يُطبَّقان فوراً. إعدادات الشركة (العملة، تكلفة الدقيقة، أوقات العمل، الهيكلة) أصبحت في صفحة المشرف.', en: 'Appearance and language apply instantly. Company settings (currency, cost/minute, working hours, structure) are now in the Admin page.', es: 'La apariencia y el idioma se aplican al instante. Los ajustes de empresa (moneda, coste/minuto, horarios, estructura) están ahora en la página de Admin.', pt: 'A aparência e o idioma aplicam-se instantaneamente. As definições da empresa (moeda, custo/minuto, horários, estrutura) estão agora na página de Admin.', tr: 'Görünüm ve dil anında uygulanır. Şirket ayarları (para birimi, dakika maliyeti, çalışma saatleri, yapı) artık Admin sayfasında.' })}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col">
                        <div onClick={() => toggleSec('rh')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center gap-2 cursor-pointer select-none ${openSec['rh'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                            <Users className="w-5 h-5 text-slate-500 dark:text-dk-muted" />
                            <h2 className="font-bold text-slate-800 dark:text-dk-text">{t.rhComptaTitle}</h2>
                            <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted ml-auto shrink-0 transition-transform ${openSec['rh'] ? 'rotate-180' : ''}`} />
                        </div>
                        <div className={`p-5 space-y-4 ${openSec['rh'] ? '' : 'hidden'}`}>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 rounded border-slate-300 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text focus:ring-indigo-500"
                                    checked={draft.hrAutoOvertime !== false}
                                    onChange={e => setDraft(prev => ({ ...prev, hrAutoOvertime: e.target.checked }))}
                                />
                                <span>
                                    <span className="font-bold text-slate-800 dark:text-dk-text text-sm block">{t.rhAutoOvertime}</span>
                                    <span className="text-xs text-slate-500 dark:text-dk-muted">{t.rhAutoOvertimeHint}</span>
                                </span>
                            </label>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.rhComptaRef}</label>
                                <select
                                    name="hrComptaPointageRef"
                                    value={draft.hrComptaPointageRef === 'normales_paie' ? 'normales_paie' : 'pointees'}
                                    onChange={e =>
                                        setDraft(prev => ({
                                            ...prev,
                                            hrComptaPointageRef: e.target.value === 'normales_paie' ? 'normales_paie' : 'pointees',
                                        }))
                                    }
                                    className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-medium text-slate-700 dark:text-dk-text-soft transition-all cursor-pointer text-sm"
                                >
                                    <option value="pointees">{t.rhComptaRefPointees}</option>
                                    <option value="normales_paie">{t.rhComptaRefNormales}</option>
                                </select>
                                <p className="text-xs text-slate-500 dark:text-dk-muted mt-2">{t.rhComptaRefHint}</p>
                            </div>
                            <div className="pt-2 border-t border-slate-100 dark:border-dk-border">
                                <p className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide mb-2">{t.rhSageServerTitle}</p>
                                <p className="text-xs text-slate-500 dark:text-dk-muted mb-3">{t.rhSageServerHint}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 dark:text-dk-text-soft mb-1">{t.rhSageRounding}</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={60}
                                            value={sageR}
                                            onChange={e => setSageR(Math.min(60, Math.max(1, parseInt(e.target.value, 10) || 15)))}
                                            className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 dark:text-dk-text-soft mb-1">{t.rhSageWorkday}</label>
                                        <input
                                            type="time"
                                            value={sageW}
                                            onChange={e => setSageW(e.target.value || '06:00')}
                                            className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-mono"
                                        />
                                    </div>
                                </div>
                                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5 rounded border-slate-300 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text"
                                        checked={sageA}
                                        onChange={e => setSageA(e.target.checked)}
                                    />
                                    <span className="text-sm text-slate-800 dark:text-dk-text">{t.rhSageApply}</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={saveSage}
                                    disabled={sageBusy}
                                    className="mt-3 w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold disabled:opacity-50"
                                >
                                    {sageBusy ? '…' : t.rhSageSave}
                                </button>
                            </div>

                            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-dk-border">
                                <p className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide mb-1">{t.rhTranchesTitle}</p>
                                <p className="text-xs text-slate-500 dark:text-dk-muted mb-3">{t.rhTranchesDesc}</p>
                                <div className="mb-3">
                                    <label className="block text-xs font-bold text-slate-600 dark:text-dk-text-soft mb-1">{t.rhTranchesPause}</label>
                                    <select
                                        value={trCfg.sepAfterIndex}
                                        onChange={e => {
                                            const v = parseInt(e.target.value, 10);
                                            setTrCfg(c => ({ ...c, sepAfterIndex: Number.isFinite(v) ? v : -1 }));
                                        }}
                                        className="w-full max-w-xs bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm"
                                    >
                                        <option value={-1}>{t.rhTranchesNone}</option>
                                        {Array.from({ length: Math.max(0, trCfg.slots.length - 1) }, (_, i) => {
                                            const s = trCfg.slots[i];
                                            return (
                                                <option key={i} value={i}>
                                                    {i + 1} — {s?.label ?? ''} (colonne « — » avant la tranche suivante)
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                    {trCfg.slots.map((row, idx) => (
                                        <div key={idx} className="flex flex-wrap items-end gap-2 bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border rounded-lg p-2">
                                            <div className="min-w-[100px] flex-1">
                                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase">{t.rhTranchesLabel}</label>
                                                <input
                                                    value={row.label}
                                                    onChange={e => updateTrSlot(idx, { label: e.target.value })}
                                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded px-2 py-1.5 text-sm"
                                                />
                                            </div>
                                            <div className="w-24">
                                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase">{t.rhTranchesStart}</label>
                                                <input
                                                    type="time"
                                                    value={row.start}
                                                    onChange={e => updateTrSlot(idx, { start: e.target.value })}
                                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded px-2 py-1.5 text-sm font-mono"
                                                />
                                            </div>
                                            <div className="w-24">
                                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase">{t.rhTranchesEnd}</label>
                                                <input
                                                    type="time"
                                                    value={row.end}
                                                    onChange={e => updateTrSlot(idx, { end: e.target.value })}
                                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded px-2 py-1.5 text-sm font-mono"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeTrSlot(idx)}
                                                disabled={trCfg.slots.length <= 2}
                                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 disabled:opacity-30"
                                                title={t.rhTranchesDel}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    <button
                                        type="button"
                                        onClick={addTrSlot}
                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-800 text-xs font-bold border border-indigo-200"
                                    >
                                        <Plus className="w-4 h-4" />
                                        {t.rhTranchesAdd}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetTranches}
                                        className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 dark:text-dk-text-soft text-xs font-bold"
                                    >
                                        {t.rhTranchesReset}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={saveTranches}
                                        disabled={trBusy}
                                        className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold disabled:opacity-50"
                                    >
                                        {trBusy ? '…' : t.rhTranchesSave}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

            </div>

            {/* FULL WIDTH BLOCK: Systèmes de tailles */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col mt-6">
                <div onClick={() => toggleSec('tailles')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center justify-between cursor-pointer select-none ${openSec['tailles'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                    <div className="flex items-center gap-2">
                        <ListTodo className="w-5 h-5 text-slate-500 dark:text-dk-muted" />
                        <h2 className="font-bold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Systèmes de tailles', ar: 'أنظمة المقاسات', en: 'Size systems', es: 'Sistemas de tallas', pt: 'Sistemas de tamanhos', tr: 'Beden sistemleri' })}</h2>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">Beta</span>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${openSec['tailles'] ? 'rotate-180' : ''}`} />
                </div>
                <div className={`p-6 md:p-8 space-y-4 ${openSec['tailles'] ? '' : 'hidden'}`}>
                    {/* Activation de la fonctionnalité (Beta) */}
                    <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/50 border border-amber-100 rounded-xl p-3">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                            <span className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{tx(lang, { fr: 'Activer la fonctionnalité (Beta)', ar: 'تفعيل ميزة أنظمة المقاسات (تجريبية)', en: 'Enable the feature (Beta)', es: 'Activar la funcionalidad (Beta)', pt: 'Ativar a funcionalidade (Beta)', tr: 'Özelliği etkinleştir (Beta)' })}</span>
                        </div>
                        <button
                            onClick={() => setDraft(prev => ({ ...prev, tailleSystemsEnabled: prev.tailleSystemsEnabled === false ? true : false }))}
                            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${draft.tailleSystemsEnabled !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            title={draft.tailleSystemsEnabled !== false ? 'Désactiver' : 'Activer'}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-dk-surface rounded-full shadow transition-transform ${draft.tailleSystemsEnabled !== false ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>

                    {draft.tailleSystemsEnabled === false ? (
                        <p className="text-sm text-slate-400 dark:text-dk-muted italic text-center py-6 bg-slate-50 dark:bg-dk-bg rounded-lg border border-dashed border-slate-200 dark:border-dk-border">
                            {tx(lang, { fr: 'Fonctionnalité désactivée. Activez-la pour définir des systèmes de tailles.', ar: 'الميزة موقوفة. فعّلها للتعريف بأنظمة المقاسات.', en: 'Feature disabled. Enable it to define size systems.', es: 'Funcionalidad desactivada. Actívela para definir sistemas de tallas.', pt: 'Funcionalidade desativada. Ative-a para definir sistemas de tamanhos.', tr: 'Özellik devre dışı. Beden sistemlerini tanımlamak için etkinleştirin.' })}
                        </p>
                    ) : (
                    <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-sm text-slate-500 dark:text-dk-muted font-medium">Définissez les systèmes de tailles de l'usine : alpha (S/M/L), numérique (36-44), en gros (sans tailles) ou personnalisé.</p>
                        <div className="flex items-center gap-2 shrink-0">
                            {(draft.tailleSystems || []).length === 0 && (
                                <button
                                    onClick={() => setDraft(prev => ({ ...prev, tailleSystems: [
                                        { id: 'sys_alpha', label: 'Alpha', mode: 'alpha', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
                                        { id: 'sys_num', label: 'Numérique', mode: 'numerique', sizes: ['36', '38', '40', '42', '44'] },
                                        { id: 'sys_gros', label: 'En gros', mode: 'gros', sizes: [] },
                                    ] }))}
                                    className="text-xs font-bold bg-slate-50 dark:bg-dk-bg text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors border border-slate-200 dark:border-dk-border"
                                >
                                    Charger par défaut
                                </button>
                            )}
                            <button
                                onClick={() => setDraft(prev => ({ ...prev, tailleSystems: [...(prev.tailleSystems || []), { id: Date.now().toString(), label: '', mode: 'alpha', sizes: [] }] }))}
                                className="text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text flex items-center gap-1 hover:text-indigo-700 dark:text-dk-accent-text hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100"
                            >
                                <Plus className="w-3.5 h-3.5" /> Ajouter un système
                            </button>
                        </div>
                    </div>

                    {(draft.tailleSystems || []).map(sys => (
                        <div key={sys.id} className="flex flex-col sm:flex-row sm:items-end gap-3 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3">
                            <div className="flex-1">
                                <label className="block text-[11px] font-black text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' })}</label>
                                <input
                                    value={sys.label}
                                    onChange={e => setDraft(prev => ({ ...prev, tailleSystems: (prev.tailleSystems || []).map(s => s.id === sys.id ? { ...s, label: e.target.value } : s) }))}
                                    placeholder={tx(lang, { fr: 'ex: Alpha', ar: 'مثال: ألفا', en: 'e.g., Alpha', es: 'ej: Alpha', pt: 'ex: Alpha', tr: 'örn: Alfa' })}
                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-black text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Type', ar: 'النوع', en: 'Type', es: 'Tipo', pt: 'Tipo', tr: 'Tür' })}</label>
                                <select
                                    value={sys.mode}
                                    onChange={e => { const mode = e.target.value as 'alpha' | 'numerique' | 'gros' | 'custom'; setDraft(prev => ({ ...prev, tailleSystems: (prev.tailleSystems || []).map(s => s.id === sys.id ? { ...s, mode, sizes: mode === 'gros' ? [] : s.sizes } : s) })); }}
                                    className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500"
                                >
                                    <option value="alpha">{tx(lang, { fr: 'Alpha (S/M/L)', ar: 'ألفا (S/M/L)', en: 'Alpha (S/M/L)', es: 'Alfa (S/M/L)', pt: 'Alfa (S/M/L)', tr: 'Alfa (S/M/L)' })}</option>
                                    <option value="numerique">{tx(lang, { fr: 'Numérique (36-44)', ar: 'رقمي (36-44)', en: 'Numeric (36-44)', es: 'Numérico (36-44)', pt: 'Numérico (36-44)', tr: 'Sayısal (36-44)' })}</option>
                                    <option value="gros">{tx(lang, { fr: 'En gros (sans tailles)', ar: 'بالجملة (بدون مقاسات)', en: 'Bulk (no sizes)', es: 'Al por mayor (sin tallas)', pt: 'Por grosso (sem tamanhos)', tr: 'Toplu (bedensiz)' })}</option>
                                    <option value="custom">{tx(lang, { fr: 'Personnalisé', ar: 'مخصص', en: 'Custom', es: 'Personalizado', pt: 'Personalizado', tr: 'Özel' })}</option>
                                </select>
                            </div>
                            <div className="flex-[2]">
                                <label className="block text-[11px] font-black text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Tailles (séparées par un espace)', ar: 'المقاسات (مفصولة بمسافة)', en: 'Sizes (space-separated)', es: 'Tallas (separadas por espacio)', pt: 'Tamanhos (separados por espaço)', tr: 'Bedenler (boşlukla ayrılmış)' })}</label>
                                <input
                                    disabled={sys.mode === 'gros'}
                                    value={sys.sizes.join(' ')}
                                    onChange={e => setDraft(prev => ({ ...prev, tailleSystems: (prev.tailleSystems || []).map(s => s.id === sys.id ? { ...s, sizes: e.target.value.trim().split(/\s+/).filter(Boolean) } : s) }))}
                                    placeholder={sys.mode === 'gros' ? tx(lang, { fr: '— aucune taille —', ar: '— بدون مقاسات —', en: '— no sizes —', es: '— sin tallas —', pt: '— sem tamanhos —', tr: '— beden yok —' }) : 'S M L XL XXL'}
                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </div>
                            <button
                                onClick={() => setDraft(prev => ({ ...prev, tailleSystems: (prev.tailleSystems || []).filter(s => s.id !== sys.id) }))}
                                className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 border border-transparent hover:border-rose-100 rounded-lg transition-colors shrink-0"
                                title={tx(lang, { fr: 'Supprimer ce système', ar: 'حذف هذا النظام', en: 'Delete this system', es: 'Eliminar este sistema', pt: 'Eliminar este sistema', tr: 'Bu sistemi sil' })}
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}

                    {(draft.tailleSystems || []).length === 0 && (
                        <p className="text-sm text-slate-500 dark:text-dk-muted italic text-center py-4 bg-slate-50 dark:bg-dk-bg rounded-lg border border-dashed border-slate-200 dark:border-dk-border">{tx(lang, { fr: 'Aucun système de tailles défini.', ar: 'لا يوجد أي نظام مقاسات معرف.', en: 'No size system defined.', es: 'Ningún sistema de tallas definido.', pt: 'Nenhum sistema de tamanhos definido.', tr: 'Beden sistemi tanımlanmamış.' })}</p>
                    )}
                    </>
                    )}
                </div>
            </div>

            {/* FULL WIDTH BLOCK: Config Moteur APS */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col mt-6">
                <div onClick={() => toggleSec('aps')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center justify-between cursor-pointer select-none ${openSec['aps'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                    <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                        <h2 className="font-bold text-slate-800 dark:text-dk-text">{t.apsTitle}</h2>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${openSec['aps'] ? 'rotate-180' : ''}`} />
                </div>
                <div className={`p-6 md:p-8 space-y-6 ${openSec['aps'] ? '' : 'hidden'}`}>
                    <p className="text-sm text-slate-500 dark:text-dk-muted font-medium">
                        {t.apsDesc}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Mode de calcul */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                {t.apsCapacityMode}
                            </label>
                            <div className="flex flex-col gap-2">
                                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-dk-text-soft cursor-pointer">
                                    <input
                                        type="radio"
                                        name="capacityMode"
                                        value="STATIC"
                                        checked={(draft.capacityMode || 'STATIC') === 'STATIC'}
                                        onChange={() => setDraft(prev => ({ ...prev, capacityMode: 'STATIC' }))}
                                        className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text focus:ring-indigo-500"
                                    />
                                    <span>{t.apsModeStatic}</span>
                                </label>
                                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-dk-text-soft cursor-pointer">
                                    <input
                                        type="radio"
                                        name="capacityMode"
                                        value="DYNAMIC"
                                        checked={draft.capacityMode === 'DYNAMIC'}
                                        onChange={() => setDraft(prev => ({ ...prev, capacityMode: 'DYNAMIC' }))}
                                        className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text focus:ring-indigo-500"
                                    />
                                    <span>{t.apsModeDynamic}</span>
                                </label>
                            </div>
                        </div>

                        {/* Coût heures supp */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                {t.apsOvertimeCost}
                            </label>
                            <input
                                type="number"
                                value={draft.overtimeCostPerHour ?? 25}
                                onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setDraft(prev => ({ ...prev, overtimeCostPerHour: val }));
                                }}
                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm font-bold text-slate-700 dark:text-dk-text-soft transition-all"
                                min={0}
                            />
                        </div>

                        {/* Coût sous-traitance */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                {t.apsSubcontractCost}
                            </label>
                            <input
                                type="number"
                                value={draft.subcontractDefaultCostPerPiece ?? 15}
                                onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setDraft(prev => ({ ...prev, subcontractDefaultCostPerPiece: val }));
                                }}
                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm font-bold text-slate-700 dark:text-dk-text-soft transition-all"
                                min={0}
                            />
                        </div>
                    </div>

                    <hr className="border-slate-100 dark:border-dk-border" />

                    {/* Paramètres APS par chaîne */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{t.apsChainConfig}</h3>
                        <div className="overflow-x-auto border border-slate-200 dark:border-dk-border rounded-xl">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                        <th className="px-6 py-3">{tx(lang, { fr: 'Chaîne', ar: 'الخط', en: 'Chain', es: 'Cadena', pt: 'Cadeia', tr: 'Hat' })}</th>
                                        <th className="px-6 py-3">{t.apsOperators}</th>
                                        <th className="px-6 py-3">{t.apsActivityRate}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border text-sm font-medium text-slate-700 dark:text-dk-text-soft">
                                    {Array.from({ length: draft.chainsCount || 4 }).map((_, i) => {
                                        const chainKey = `CHAINE ${i + 1}`;
                                        const chainDisplayName = draft.chainNames?.[chainKey] || chainKey;
                                        const operators = draft.chainOperators?.[chainKey] ?? 30;
                                        const rate = draft.chainActivityRate?.[chainKey] ?? 0.85;

                                        return (
                                            <tr key={chainKey} className="hover:bg-slate-50/50 dark:hover:bg-dk-elevated/60">
                                                <td className="px-6 py-4 font-bold">{chainDisplayName}</td>
                                                <td className="px-6 py-4">
                                                    <input
                                                        type="number"
                                                        value={operators}
                                                        onChange={e => {
                                                            const val = parseInt(e.target.value, 10) || 0;
                                                            setDraft(prev => ({
                                                                ...prev,
                                                                chainOperators: {
                                                                    ...(prev.chainOperators || {}),
                                                                    [chainKey]: val,
                                                                },
                                                            }));
                                                        }}
                                                        className="w-24 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft"
                                                        min={0}
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={rate}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            setDraft(prev => ({
                                                                ...prev,
                                                                chainActivityRate: {
                                                                    ...(prev.chainActivityRate || {}),
                                                                    [chainKey]: val,
                                                                },
                                                            }));
                                                        }}
                                                        className="w-24 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft"
                                                        min={0}
                                                        max={1}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* FULL WIDTH BLOCK: Personnalisation du Menu de Navigation */}
            {navConfig && setNavConfig && (
                <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col mt-6">
                    <div onClick={() => toggleSec('nav')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center justify-between cursor-pointer select-none ${openSec['nav'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                        <div className="flex items-center gap-2">
                            <ListTodo className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                            <h2 className="font-bold text-slate-800 dark:text-dk-text">
                                {tx(lang, { fr: 'Configuration de la barre de navigation', ar: 'إعدادات شريط التنقل', en: 'Navigation bar configuration', es: 'Configuración de la barra de navegación', pt: 'Configuração da barra de navegação', tr: 'Gezinme çubuğu yapılandırması' })}
                            </h2>
                            <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${openSec['nav'] ? 'rotate-180' : ''}`} />
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(tx(lang, { fr: 'Voulez-vous vraiment réinitialiser la navigation ?', ar: 'هل تريد حقًا إعادة تعيين القائمة؟', en: 'Do you really want to reset the navigation?', es: '¿Realmente desea restablecer la navegación?', pt: 'Deseja mesmo repor a navegação?', tr: 'Gezinmeyi gerçekten sıfırlamak istiyor musunuz?' }))) {
                                    const defaultCategories = [
                                        { id: 'principal', name: 'Principal', views: ['dashboard', 'library', 'suivi', 'planning'] },
                                        { id: 'production', name: 'Production', views: ['effectifs', 'coupe', 'sousTraitance'] },
                                        { id: 'rh', name: 'RH', views: ['gestionRh', 'catalogTemps'] },
                                        { id: 'logistique', name: 'Logistique', views: ['magasin', 'export', 'facturation'] },
                                        { id: 'config', name: 'Config', views: ['machin', 'rendement', 'pageMachine', 'config'] }
                                    ];
                                    const defaultNavOrder = ['dashboard', 'library', 'suivi', 'planning', 'effectifs', 'magasin', 'gestionRh', 'catalogTemps', 'machin', 'coupe', 'rendement', 'export', 'facturation', 'config', 'pageMachine', 'admin', 'sousTraitance'];
                                    setNavConfig({
                                        enabled: true,
                                        style: 'dropdown',
                                        order: defaultNavOrder,
                                        hidden: [],
                                        categories: defaultCategories
                                    });
                                }
                            }}
                            className="text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-100 transition-colors"
                        >
                            {tx(lang, { fr: 'Réinitialiser', ar: 'إعادة تعيين', en: 'Reset', es: 'Restablecer', pt: 'Repor', tr: 'Sıfırla' })}
                        </button>
                    </div>
                    <div className={`p-6 md:p-8 space-y-6 ${openSec['nav'] ? '' : 'hidden'}`}>
                        <p className="text-sm text-slate-500 dark:text-dk-muted font-medium">
                            {tx(lang, {
                                fr: 'Configurez le type d\'affichage des menus (dropdowns ou ruban plat), modifiez les titres des catégories ou déplacez librement les pages.',
                                ar: 'تخصيص نمط القائمة (منسدلة أو مسطحة)، تعديل أسماء الفئات، أو نقل الصفحات بحرية.',
                                en: 'Configure the menu display type (dropdowns or flat ribbon), edit the category titles or move the pages freely.',
                                es: 'Configure el tipo de visualización de los menús (desplegables o cinta plana), edite los títulos de las categorías o mueva las páginas libremente.',
                                pt: 'Configure o tipo de exibição dos menus (suspensos ou faixa plana), edite os títulos das categorias ou mova as páginas livremente.',
                                tr: 'Menü görüntüleme türünü (açılır menüler veya düz şerit) yapılandırın, kategori başlıklarını düzenleyin veya sayfaları serbestçe taşıyın.',
                            })}
                        </p>

                        {/* Layout Style Selector */}
                        <div className="space-y-3">
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                {tx(lang, { fr: "Type d'affichage", ar: 'نمط العرض', en: 'Display type', es: 'Tipo de visualización', pt: 'Tipo de exibição', tr: 'Görüntüleme türü' })}
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {[
                                    { key: 'dropdown', label: { fr: 'Menus Déroulants Groupés', ar: 'قوائم منسدلة مجموعة', en: 'Grouped Dropdown Menus', es: 'Menús Desplegables Agrupados', pt: 'Menus Suspensos Agrupados', tr: 'Gruplandırılmış Açılır Menüler' } },
                                    { key: 'flat', label: { fr: 'Ruban Plat Horizontal', ar: 'شريط أفقي مسطح', en: 'Horizontal Flat Ribbon', es: 'Cinta Plana Horizontal', pt: 'Faixa Plana Horizontal', tr: 'Yatay Düz Şerit' } },
                                    { key: 'mobile-only', label: { fr: 'Hamburger / Menu Latéral Uniquement', ar: 'زر القائمة الجانبية فقط', en: 'Hamburger / Side Menu Only', es: 'Hamburguesa / Solo Menú Lateral', pt: 'Hambúrguer / Apenas Menu Lateral', tr: 'Hamburger / Yalnızca Yan Menü' } }
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        onClick={() => setNavConfig({ ...navConfig, style: item.key as any })}
                                        className={`p-4 rounded-xl border-2 font-bold text-sm transition-all text-start flex flex-col gap-1 hover:border-indigo-300 active:scale-98 ${
                                            navConfig.style === item.key
                                                ? 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 border-indigo-500 text-indigo-700 dark:text-dk-accent-text shadow-sm dark:shadow-dk-sm'
                                                : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft'
                                        }`}
                                    >
                                        <span>{tx(lang, item.label)}</span>
                                        <span className="text-[10px] font-normal text-slate-400 dark:text-dk-muted">
                                            {item.key === 'dropdown' && tx(lang, { fr: 'Regroupe les 20 modules dans 5 menus compacts', ar: 'تجميع 20 موديول في 5 قوائم مدمجة', en: 'Groups the 20 modules into 5 compact menus', es: 'Agrupa los 20 módulos en 5 menús compactos', pt: 'Agrupa os 20 módulos em 5 menus compactos', tr: '20 modülü 5 kompakt menüde gruplar' })}
                                            {item.key === 'flat' && tx(lang, { fr: "Affiche tous les boutons l'un après l'autre", ar: 'عرض جميع الأزرار متتالية', en: 'Displays all the buttons one after another', es: 'Muestra todos los botones uno tras otro', pt: 'Mostra todos os botões um após o outro', tr: 'Tüm düğmeleri art arda gösterir' })}
                                            {item.key === 'mobile-only' && tx(lang, { fr: "Idéal pour maximiser l'espace de travail", ar: 'مثالي لزيادة مساحة العمل', en: 'Ideal for maximizing the workspace', es: 'Ideal para maximizar el espacio de trabajo', pt: 'Ideal para maximizar o espaço de trabalho', tr: 'Çalışma alanını en üst düzeye çıkarmak için ideal' })}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Hamburger Enable Switch (Only if not mobile-only) */}
                        {navConfig.style !== 'mobile-only' && (
                            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border">
                                <div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">
                                        {tx(lang, { fr: 'Bouton Hamburger (☰)', ar: 'زر القائمة الجانبية (☰)', en: 'Hamburger Button (☰)', es: 'Botón Hamburguesa (☰)', pt: 'Botão Hambúrguer (☰)', tr: 'Hamburger Düğmesi (☰)' })}
                                    </span>
                                    <p className="text-[11px] text-slate-400 dark:text-dk-muted">
                                        {tx(lang, { fr: 'Afficher également le menu hamburger rapide à gauche', ar: 'عرض زر القائمة السريعة الجانبية على اليسار أيضاً', en: 'Also show the quick hamburger menu on the left', es: 'Mostrar también el menú hamburguesa rápido a la izquierda', pt: 'Mostrar também o menu hambúrguer rápido à esquerda', tr: 'Hızlı hamburger menüyü solda da göster' })}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setNavConfig({ ...navConfig, enabled: !navConfig.enabled })}
                                    className={`w-10 h-5 rounded-full p-0.5 transition-colors relative flex items-center ${navConfig.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                >
                                    <div className={`w-4 h-4 bg-white dark:bg-dk-surface rounded-full shadow-sm dark:shadow-dk-sm transition-transform duration-300 ${navConfig.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        )}

                        {/* Categories Organization (Only relevant if dropdown style is active) */}
                        {navConfig.style === 'dropdown' && (
                            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-dk-border">
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                    {tx(lang, { fr: 'Renommer et organiser les catégories', ar: 'تعديل أسماء وتنظيم الفئات', en: 'Rename and organize the categories', es: 'Renombrar y organizar las categorías', pt: 'Renomear e organizar as categorias', tr: 'Kategorileri yeniden adlandır ve düzenle' })}
                                </label>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {navConfig.categories?.map((category, catIdx) => (
                                        <div key={category.id} className="bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-2xl p-4 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={category.name}
                                                    onChange={(e) => {
                                                        const updated = [...navConfig.categories];
                                                        updated[catIdx] = { ...category, name: e.target.value };
                                                        setNavConfig({ ...navConfig, categories: updated });
                                                    }}
                                                    className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:border-indigo-300 focus:border-indigo-500 outline-none rounded-xl px-3 py-2 text-sm font-bold text-slate-800 dark:text-dk-text flex-1 shadow-sm dark:shadow-dk-sm transition-all"
                                                    placeholder={tx(lang, { fr: 'Nom de la catégorie', ar: 'اسم الفئة', en: 'Category name', es: 'Nombre de la categoría', pt: 'Nome da categoria', tr: 'Kategori adı' })}
                                                />
                                                <span className="text-[10px] font-black uppercase bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text px-2 py-1 rounded border border-indigo-100">
                                                    {category.views.length} {tx(lang, { fr: 'Pages', ar: 'صفحات', en: 'Pages', es: 'Páginas', pt: 'Páginas', tr: 'Sayfa' })}
                                                </span>
                                            </div>
                                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                                {category.views.map((view) => {
                                                    const isHidden = navConfig.hidden.includes(view);
                                                    return (
                                                        <div key={view} className="flex items-center justify-between gap-2 bg-white dark:bg-dk-surface px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-xs font-semibold text-slate-700 dark:text-dk-text-soft shadow-sm dark:shadow-dk-sm">
                                                            <span className="truncate">{VIEW_LABELS[view]?.[lang] || view}</span>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                {/* Category Mover selector */}
                                                                <select
                                                                    value={category.id}
                                                                    onChange={(e) => {
                                                                        const targetCatId = e.target.value;
                                                                        const updatedCats = navConfig.categories.map(c => {
                                                                            if (c.id === category.id) {
                                                                                return { ...c, views: c.views.filter(v => v !== view) };
                                                                            }
                                                                            if (c.id === targetCatId) {
                                                                                return { ...c, views: [...c.views, view] };
                                                                            }
                                                                            return c;
                                                                        });
                                                                        setNavConfig({ ...navConfig, categories: updatedCats });
                                                                    }}
                                                                    className="bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-dk-text-soft"
                                                                >
                                                                    {navConfig.categories.map(c => (
                                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                                    ))}
                                                                </select>

                                                                {/* Visibility toggle button */}
                                                                <button
                                                                    onClick={() => {
                                                                        const hidden = isHidden
                                                                            ? navConfig.hidden.filter(v => v !== view)
                                                                            : [...navConfig.hidden, view];
                                                                        setNavConfig({ ...navConfig, hidden });
                                                                    }}
                                                                    className={`px-2 py-0.5 text-[9px] font-bold rounded-full border transition-all ${
                                                                        isHidden
                                                                            ? 'bg-slate-100 dark:bg-dk-elevated border-slate-200 dark:border-dk-border text-slate-400 dark:text-dk-muted'
                                                                            : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 text-emerald-600 dark:text-emerald-400'
                                                                    }`}
                                                                >
                                                                    {isHidden ? tx(lang, { fr: 'Masqué', ar: 'مخفي', en: 'Hidden', es: 'Oculto', pt: 'Oculto', tr: 'Gizli' }) : tx(lang, { fr: 'Visible', ar: 'مرئي', en: 'Visible', es: 'Visible', pt: 'Visível', tr: 'Görünür' })}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Flat Order and Visibility List (Only relevant if flat style is active) */}
                        {navConfig.style === 'flat' && (
                            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-dk-border">
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                    {tx(lang, { fr: 'Ordre et visibilité des modules', ar: 'ترتيب وظهور الوحدات', en: 'Order and visibility of modules', es: 'Orden y visibilidad de los módulos', pt: 'Ordem e visibilidade dos módulos', tr: 'Modüllerin sırası ve görünürlüğü' })}
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                    {navConfig.order.map((view, idx) => {
                                        const isHidden = navConfig.hidden.includes(view);
                                        return (
                                            <div key={view} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                                                isHidden ? 'bg-slate-50 dark:bg-dk-bg border-slate-100 dark:border-dk-border opacity-60' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm'
                                            }`}>
                                                {/* Reorder Buttons */}
                                                <div className="flex flex-col gap-0.5 shrink-0">
                                                    <button
                                                        disabled={idx === 0}
                                                        onClick={() => {
                                                            const newOrder = [...navConfig.order];
                                                            [newOrder[idx], newOrder[idx - 1]] = [newOrder[idx - 1], newOrder[idx]];
                                                            setNavConfig({ ...navConfig, order: newOrder });
                                                        }}
                                                        className="text-[10px] text-slate-400 hover:text-slate-700 disabled:opacity-20 leading-none"
                                                    >
                                                        ▲
                                                    </button>
                                                    <button
                                                        disabled={idx === navConfig.order.length - 1}
                                                        onClick={() => {
                                                            const newOrder = [...navConfig.order];
                                                            [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
                                                            setNavConfig({ ...navConfig, order: newOrder });
                                                        }}
                                                        className="text-[10px] text-slate-400 hover:text-slate-700 disabled:opacity-20 leading-none"
                                                    >
                                                        ▼
                                                    </button>
                                                </div>
                                                <span className="text-sm font-bold text-slate-700 dark:text-dk-text-soft flex-1 truncate">{VIEW_LABELS[view]?.[lang] || view}</span>
                                                <button
                                                    onClick={() => {
                                                        const hidden = isHidden
                                                            ? navConfig.hidden.filter(v => v !== view)
                                                            : [...navConfig.hidden, view];
                                                        setNavConfig({ ...navConfig, hidden });
                                                    }}
                                                    className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-all shrink-0 ${
                                                        isHidden
                                                            ? 'bg-slate-100 dark:bg-dk-elevated border-slate-200 dark:border-dk-border text-slate-400 dark:text-dk-muted'
                                                            : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 text-emerald-600 dark:text-emerald-400'
                                                    }`}
                                                >
                                                    {isHidden ? tx(lang, { fr: 'Masqué', ar: 'مخفي', en: 'Hidden', es: 'Oculto', pt: 'Oculto', tr: 'Gizli' }) : tx(lang, { fr: 'Visible', ar: 'مرئي', en: 'Visible', es: 'Visible', pt: 'Visível', tr: 'Görünür' })}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* FULL WIDTH BLOCK: Gestion des Tâches (Phase 24) */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col mt-6">
                <div onClick={() => toggleSec('tasks')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center justify-between cursor-pointer select-none ${openSec['tasks'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                    <div className="flex items-center gap-2">
                        <ListTodo className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                        <h2 className="font-bold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Gestion des Tâches', ar: 'إدارة المهام', en: 'Task Management', es: 'Gestión de Tareas', pt: 'Gestão de Tarefas', tr: 'Görev Yönetimi' })}</h2>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${openSec['tasks'] ? 'rotate-180' : ''}`} />
                </div>
                <div className={`p-6 md:p-8 space-y-6 ${openSec['tasks'] ? '' : 'hidden'}`}>
                    {/* Add New Task Form */}
                    <div className="bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-end">
                        <div className="flex-1 w-full relative">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Description de la tâche', ar: 'وصف المهمة', en: 'Task description', es: 'Descripción de la tarea', pt: 'Descrição da tarefa', tr: 'Görev açıklaması' })}</label>
                            <input
                                type="text"
                                value={newTaskText}
                                onChange={e => setNewTaskText(e.target.value)}
                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500"
                                placeholder={tx(lang, { fr: 'Nouvelle tâche...', ar: 'مهمة جديدة...', en: 'New task...', es: 'Nueva tarea...', pt: 'Nova tarefa...', tr: 'Yeni görev...' })}
                            />
                        </div>
                        <div className="w-full sm:w-40 relative">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' })}</label>
                            <input
                                type="date"
                                value={newTaskDate}
                                onChange={e => setNewTaskDate(e.target.value)}
                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-dk-text-soft"
                            />
                        </div>
                        <div className="w-full sm:w-64 relative">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Assigner à', ar: 'تعيين إلى', en: 'Assign to', es: 'Asignar a', pt: 'Atribuir a', tr: 'Ata' })}</label>
                            <select
                                value={newTaskAssignee}
                                onChange={e => setNewTaskAssignee(e.target.value)}
                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500"
                            >
                                <option value="">{tx(lang, { fr: 'Choisir un responsable...', ar: 'اختر مسؤولاً...', en: 'Choose a person...', es: 'Elegir un responsable...', pt: 'Escolher um responsável...', tr: 'Bir sorumlu seçin...' })}</option>
                                <optgroup label={tx(lang, { fr: 'Direction', ar: 'الإدارة', en: 'Management', es: 'Dirección', pt: 'Direção', tr: 'Yönetim' })}>
                                    {draft.organigram?.map(p => (
                                        <option key={p.id} value={`${p.name}|${p.role}`}>{p.name} ({p.role})</option>
                                    ))}
                                </optgroup>
                                {Array.from({ length: draft.chainsCount || 4 }).map((_, i) => {
                                    const chainKey = `CHAINE ${i + 1}`;
                                    const staff = draft.chainStaff?.[chainKey] || [];
                                    if (staff.length === 0) return null;
                                    return (
                                        <optgroup key={chainKey} label={chainKey}>
                                            {staff.map(p => (
                                                <option key={p.id} value={`${p.name}|${p.role} - ${chainKey}`}>{p.name} ({p.role})</option>
                                            ))}
                                        </optgroup>
                                    );
                                })}
                            </select>
                        </div>
                        <button
                            onClick={handleAddTask}
                            disabled={!newTaskText || !newTaskAssignee || !newTaskDate}
                            className="w-full sm:w-auto px-6 py-2 bg-indigo-600 dark:bg-dk-accent text-white text-sm font-bold rounded-lg hover:bg-indigo-700 dark:hover:bg-dk-accent-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2 h-[38px] shrink-0"
                        >
                            <Plus className="w-4 h-4" /> {tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}
                        </button>
                    </div>

                    {/* Tasks List (Admin View) */}
                    <div className="space-y-3 mt-6">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-dk-text-soft mb-4">{tx(lang, { fr: 'Toutes les tâches', ar: 'جميع المهام', en: 'All tasks', es: 'Todas las tareas', pt: 'Todas as tarefas', tr: 'Tüm görevler' })} ({draft.tasks?.length || 0})</h3>
                        {(!draft.tasks || draft.tasks.length === 0) && (
                            <p className="text-sm text-slate-500 dark:text-dk-muted italic bg-white dark:bg-dk-surface p-4 rounded-xl border border-dashed border-slate-200 dark:border-dk-border text-center">{tx(lang, { fr: 'Aucune tâche active.', ar: 'لا توجد أي مهمة نشطة.', en: 'No active task.', es: 'Ninguna tarea activa.', pt: 'Nenhuma tarefa ativa.', tr: 'Aktif görev yok.' })}</p>
                        )}
                        <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                            {draft.tasks?.slice().reverse().map(task => (
                                <div key={task.id} className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border p-3 rounded-xl gap-4 hover:border-indigo-200 transition-colors group">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted bg-slate-100 dark:bg-dk-elevated px-2 py-0.5 rounded">{task.assigneeName} {task.assigneeRole ? `(${task.assigneeRole})` : ''}</span>
                                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {task.date}</span>

                                            {/* Status Badge */}
                                            {task.status === 'PENDING' && <span className="text-[10px] font-bold text-slate-500 dark:text-dk-muted bg-slate-100 dark:bg-dk-elevated px-2 py-0.5 rounded border border-slate-200 dark:border-dk-border">PENDING</span>}
                                            {task.status === 'DONE_OK' && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-100">OK</span>}
                                            {task.status === 'DONE_NOT_OK' && <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded border border-rose-100">NOT OK</span>}
                                            {task.status === 'SKIPPED' && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded border border-amber-100">SKIPPED</span>}
                                        </div>
                                        <p className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{task.text}</p>
                                        {task.status === 'SKIPPED' && task.skipReason && (
                                            <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 font-medium bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg inline-block w-full">
                                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                Motif d'annulation: {task.skipReason}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        {task.status === 'PENDING' && (
                                            <>
                                                <button onClick={() => updateTaskStatus(task.id, 'DONE_OK')} className="p-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 rounded-lg border border-emerald-100 transition-colors" title={tx(lang, { fr: 'Marquer comme OK', ar: 'تحديد كمقبول', en: 'Mark as OK', es: 'Marcar como OK', pt: 'Marcar como OK', tr: 'OK olarak işaretle' })}><Check className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => updateTaskStatus(task.id, 'DONE_NOT_OK')} className="p-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 rounded-lg border border-rose-100 transition-colors" title={tx(lang, { fr: 'Marquer comme NOT OK', ar: 'تحديد كغير مقبول', en: 'Mark as NOT OK', es: 'Marcar como NOT OK', pt: 'Marcar como NOT OK', tr: 'OK değil olarak işaretle' })}><X className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => {
                                                    const reason = prompt(tx(lang, { fr: 'Motif d\'annulation ?', ar: 'سبب الإلغاء؟', en: 'Cancellation reason?', es: '¿Motivo de cancelación?', pt: 'Motivo de cancelamento?', tr: 'İptal sebebi?' }));
                                                    if (reason) updateTaskStatus(task.id, 'SKIPPED', reason);
                                                }} className="p-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 rounded-lg border border-amber-100 transition-colors" title={tx(lang, { fr: 'Ignorer / Annuler', ar: 'تخطي / إلغاء', en: 'Skip / Cancel', es: 'Omitir / Cancelar', pt: 'Ignorar / Cancelar', tr: 'Atla / İptal' })}><SkipForward className="w-3.5 h-3.5" /></button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => handleDeleteTask(task.id)}
                                            className="p-1.5 bg-slate-50 dark:bg-dk-bg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg border border-slate-200 dark:border-dk-border hover:border-rose-200 transition-colors"
                                            title={tx(lang, { fr: 'Supprimer la tâche', ar: 'حذف المهمة', en: 'Delete task', es: 'Eliminar tarea', pt: 'Eliminar tarefa', tr: 'Görevi sil' })}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <AgendaModal isOpen={showAgenda} onClose={() => setShowAgenda(false)} settings={draft} setSettings={setDraft} lang={lang} />
        </div >
    );
}