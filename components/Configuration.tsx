import React, { useState, useCallback, useEffect } from 'react';
import { Settings, Clock, Calendar, Coins, Users, Shield, Save, Building, Plus, Trash2, CheckCircle, ListTodo, CalendarClock, AlertTriangle, Check, X, SkipForward, Factory, Zap, ChevronDown } from 'lucide-react';
import { AppSettings, AppTask, Machine } from '../types';
import { isMachineOperational } from '../utils/machineMatch';
import AgendaModal from './AgendaModal';
import {
  buildPointageTranchesFromAppSettings,
  getDefaultPointageTranches,
  parsePointageTranchesFromSettings,
  type PointageTranchesConfig,
  type PointageTrancheSlot,
} from '../lib/pointageGrille';

interface ConfigurationProps {
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    lang: 'fr' | 'ar';
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
}

const TRANSLATIONS = {
    fr: {
        title: 'Configuration Globale',
        desc: 'Gérez les paramètres généraux de l\'entreprise et de production.',
        general: 'Paramètres Généraux',
        production: 'Horaires & Jours de Travail',
        structure: 'Structure & Encadrement',
        save: 'Enregistrer',
        saved: 'Sauvegardé !',
        currency: 'Devise par défaut',
        timeFormat: 'Format d\'affichage de l\'heure',
        workingHoursStart: 'Heure de début (Atelier)',
        workingHoursEnd: 'Heure de fin (Atelier)',
        chainsCount: 'Nombre de chaînes actives',
        workingDays: 'Jours ouvrables',
        costMinute: 'Coût Minute',
        pauses: 'Pauses & Interruptions',
        addPause: 'Ajouter une pause',
        pauseName: 'Nom',
        pauseStart: 'Début',
        pauseEnd: 'Fin',
        pauseDuration: 'Durée (min)',
        days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
        generalManagers: 'Direction & Encadrement Général',
        chainStaff: 'Personnel par Chaîne',
        rhComptaTitle: 'RH — Pointage & comptabilité',
        rhAutoOvertime: 'Recalcul auto des heures (H.N. / sup.) depuis entrée, sortie et pause',
        rhAutoOvertimeHint: 'Si désactivé, vous pouvez saisir manuellement les heures normales et supplémentaires (onglet Pointage du dossier ou grille journalière).',
        rhComptaRef: 'Référence temps pour compta / valorisation (indicatif)',
        rhComptaRefPointees: 'Heures pointées (travaillées)',
        rhComptaRefNormales: 'Heures normales « paie » uniquement',
        rhComptaRefHint: 'Option documentaire : les exports paie utilisent déjà les lignes pointage ; ce réglage sert d’alignement avec la facturation ou la compta interne.',
        rhSageServerTitle: 'Règles d’heures « SAGE / paie » (serveur)',
        rhSageServerHint: 'L’enregistrement pousse `hr_sage_rounding` et `hr_sage_workday_start` vers la base (priorité : variables d’environnement si définies sur le serveur). Les heures affichées (pointeuse) restent brutes.',
        rhSageRounding: 'Arrondi (minutes, 1–60)',
        rhSageWorkday: 'Ancrage entrée (journée) — ex. 06:00',
        rhSageApply: 'Appliquer pour le calcul H.N. / H.S. / exports',
        rhSageSave: 'Enregistrer les règles SAGE (serveur)',
        rhTranchesTitle: 'Tranches (créneaux) — grille pointage',
        rhTranchesDesc: 'Colonnes du tableau Pointage. Si rien n’est enregistré côté serveur, la grille suit les heures atelier + pauses ci-dessus. Le bouton ci-dessous régénère les tranches à partir de cette même plage.',
        rhTranchesPause: 'Colonne « pause » (ligne —) après la tranche n°',
        rhTranchesNone: 'Aucune',
        rhTranchesLabel: 'Libellé',
        rhTranchesStart: 'Début',
        rhTranchesEnd: 'Fin',
        rhTranchesAdd: 'Ajouter une tranche',
        rhTranchesDel: 'Suppr.',
        rhTranchesReset: 'Générer depuis horaires atelier',
        rhTranchesSave: 'Enregistrer les tranches',
        apsTitle: 'Configuration Moteur APS (Advanced Planning)',
        apsDesc: 'Optimisation de la planification, des taux critiques et de la résolution des retards.',
        apsCapacityMode: 'Mode de calcul de la capacité',
        apsModeStatic: 'Statique (capacité fixe en pièces/jour)',
        apsModeDynamic: 'Dynamique (Opérateurs × Horaires × Efficacité × Q × Lc / SAM)',
        apsOvertimeCost: 'Coût horaire heures supplémentaires (MAD/h)',
        apsSubcontractCost: 'Coût sous-traitance par pièce par défaut (MAD/pc)',
        apsChainConfig: 'Paramètres APS par chaîne',
        apsOperators: 'Opérateurs',
        apsActivityRate: 'Taux Q (Activité)',
        machineModuleTitle: 'Module Machines',
        machineAlertsTitle: 'Alertes Machines',
        machineAlertsLabel: 'Activer les alertes liées aux machines',
        machineAlertsHint: 'Si désactivé, plus aucune alerte machine : couverture machines (Planning + auto-planification), compétences manquantes (Suivi), cartes & santé du parc (Vue Générale) et surlignage panne/maintenance (Gantt). La page Machines reste accessible.',
        machineHideLabel: 'Masquer la page Machines du menu',
        machineHideHint: 'Si activé, les pages Machines (Suivi & Catalogue) disparaissent complètement de la navigation, comme si le module n\'existait pas.',
    },
    ar: {
        title: 'الإعدادات العامة',
        desc: 'إدارة المعايير العامة للشركة والإنتاج.',
        general: 'إعدادات عامة',
        production: 'أوقات وأيام العمل',
        structure: 'الهيكلة والمسؤوليات',
        save: 'حفظ',
        saved: 'تم الحفظ!',
        currency: 'العملة الافتراضية',
        timeFormat: 'صيغة عرض الوقت',
        workingHoursStart: 'وقت بداية العمل',
        workingHoursEnd: 'وقت نهاية العمل',
        chainsCount: 'عدد السلاسل النشطة',
        workingDays: 'أيام العمل',
        costMinute: 'تكلفة الدقيقة الافتراضية',
        pauses: 'أوقات الراحة والفطور',
        addPause: 'إضافة وقت راحة',
        pauseName: 'الاسم',
        pauseStart: 'البداية',
        pauseEnd: 'النهاية',
        pauseDuration: 'المدة (د)',
        days: ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
        generalManagers: 'الإدارة والمسؤولين العامين (General)',
        chainStaff: 'المسؤولين في كل سلسلة (Chaine)',
        rhComptaTitle: 'الموارد البشرية — الحضور والمحاسبة',
        rhAutoOvertime: 'إعادة احتساب تلقائي للساعات (عادية / إضافية) من الدخول والخروج والاستراحة',
        rhAutoOvertimeHint: 'عند الإيقاف يمكن إدخال الساعات يدوياً.',
        rhComptaRef: 'مرجع الوقت للمحاسبة (إرشادي)',
        rhComptaRefPointees: 'ساعات العمل الفعلية',
        rhComptaRefNormales: 'الساعات العادية للأجر فقط',
        rhComptaRefHint: 'خيار توثيقي للتوافق مع الفوترة.',
        rhSageServerTitle: 'ساعات الأجر (مقارب لسAGE) — الخادم',
        rhSageServerHint: 'يُحفظ في قاعدة البيانات مع إمكانية تثبيت ENV على الخادم. عرض الوقت الفعلي دون تغييره.',
        rhSageRounding: 'التقريب (دقائق 1–60)',
        rhSageWorkday: 'بداية نهار دخول (مثال 06:00)',
        rhSageApply: 'تفعيل الاحتساب للساعات العادية/الفائضة/التصدير',
        rhSageSave: 'حفظ قواعد SAGE (الخادم)',
        rhTranchesTitle: 'الفترات (شرائح زمنية) — شبكة الحضور',
        rhTranchesDesc: 'أعمدة جدول الحضور. إن لم تُحفَظ شرائح في الخادم فالشبكة تُبنى من ساعات الوركشة ووقت الاستراحة أعلاه. الزر يُعيد توليد الشرائح من نفس النطاق.',
        rhTranchesPause: 'عمود « استراحة » (—) بعد الشريحة رقم',
        rhTranchesNone: 'بدون',
        rhTranchesLabel: 'الاسم',
        rhTranchesStart: 'البداية',
        rhTranchesEnd: 'النهاية',
        rhTranchesAdd: 'إضافة شريحة',
        rhTranchesDel: 'حذف',
        rhTranchesReset: 'توليد من ساعات الورشة',
        rhTranchesSave: 'حفظ الشرائح',
        apsTitle: 'إعدادات محرك التخطيط APS',
        apsDesc: 'تحسين الجدولة التلقائية وتتبع نسب التأخير وحلول الطوارئ.',
        apsCapacityMode: 'طريقة احتساب القدرة الإنتاجية',
        apsModeStatic: 'ثابت (عدد القطع/يوم لكل خط)',
        apsModeDynamic: 'ديناميكي (العمال × الدقائق × الكفاءة × Q × Lc / SAM)',
        apsOvertimeCost: 'تكلفة الساعة الإضافية (درهم/ساعة)',
        apsSubcontractCost: 'تكلفة المناولة/القطعة الافتراضية (درهم/قطعة)',
        apsChainConfig: 'إعدادات APS لكل خط إنتاج',
        apsOperators: 'العمال/الخياطين',
        apsActivityRate: 'معامل Q (النشاط)',
        machineModuleTitle: 'وحدة الآلات',
        machineAlertsTitle: 'تنبيهات الآلات',
        machineAlertsLabel: 'تفعيل التنبيهات المرتبطة بالآلات',
        machineAlertsHint: 'عند الإيقاف يختفي أي تنبيه آلات: تغطية الآلات (التخطيط والجدولة)، الكفاءات الناقصة (التتبع)، بطاقات وصحة الحظيرة (النظرة العامة)، وتظليل العطل/الصيانة (Gantt). تبقى صفحة الآلات متاحة.',
        machineHideLabel: 'إخفاء صفحة الآلات من القائمة',
        machineHideHint: 'عند التفعيل تختفي صفحات الآلات (التتبع والكتالوج) كلياً من التنقل، وكأن الوحدة غير موجودة.',
    }
};

const CURRENCIES = [
    { code: 'MAD', label: 'MAD - Dirham Marocain' },
    { code: 'EUR', label: 'EUR - Euro (Europe, Espagne, Allemagne...)' },
    { code: 'USD', label: 'USD - US Dollar' },
    { code: 'DZD', label: 'DZD - Dinar Algérien' },
    { code: 'TND', label: 'TND - Dinar Tunisien' },
    { code: 'TRY', label: 'TRY - Livre Turque' },
    { code: 'XOF', label: 'XOF - Franc CFA (BCEAO)' },
    { code: 'XAF', label: 'XAF - Franc CFA (BEAC)' },
    { code: 'SAR', label: 'SAR - Riyal Saoudien' },
    { code: 'AED', label: 'AED - Dirham EAU' },
    { code: 'QAR', label: 'QAR - Riyal Qatari' },
    { code: 'KWD', label: 'KWD - Dinar Koweïtien' },
    { code: 'BHD', label: 'BHD - Dinar Bahreïni' },
    { code: 'OMR', label: 'OMR - Rial Omanais' },
    { code: 'ZAR', label: 'ZAR - Rand Sud-Africain' },
];

const VIEW_LABELS: Record<string, { fr: string; ar: string }> = {
    dashboard: { fr: 'Tableau de bord', ar: 'لوحة التحكم' },
    planning: { fr: 'Planning', ar: 'التخطيط' },
    suivi: { fr: 'Suivi Production', ar: 'تتبع الإنتاج' },
    rendement: { fr: 'Rendement', ar: 'المردودية' },
    ingenierie: { fr: 'Ingénierie', ar: 'الهندسة' },
    atelier: { fr: 'Atelier Méthodes', ar: 'ورشة الأساليب' },
    atelierProd: { fr: 'Atelier P°', ar: 'ورشة الإنتاج' },
    coupe: { fr: 'La Coupe', ar: 'القص' },
    sousTraitance: { fr: 'Sous-traitance', ar: 'التعاقد الفرعي' },
    effectifs: { fr: 'Effectifs', ar: 'الموارد البشرية' },
    gestionRh: { fr: 'Gestion RH', ar: 'إدارة الموارد البشرية' },
    magasin: { fr: 'Magasin', ar: 'المخزن' },
    export: { fr: 'Stock Fini', ar: 'تصدير المخزون' },
    facturation: { fr: 'Facturation', ar: 'الفوترة' },
    library: { fr: 'Bibliothèque', ar: 'المكتبة' },
    pageMachine: { fr: 'Suivi des Machines', ar: 'تتبع الآلات' },
    machin: { fr: 'Catalogue & Paramètres', ar: 'كتالوج و إعدادات' },
    objectifs: { fr: 'Objectifs', ar: 'الأهداف' },
    config: { fr: 'Configuration', ar: 'الإعدادات العامة' },
    paramitre: { fr: 'Paramètres', ar: 'الإعدادات' },
    admin: { fr: 'Admin', ar: 'المشرف' },
};

export default function Configuration({ settings, setSettings, lang, machines, navConfig, setNavConfig }: ConfigurationProps) {
    const t = TRANSLATIONS[lang];
    const [showSaveToast, setShowSaveToast] = useState(false);
    const [showAgenda, setShowAgenda] = useState(false);

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
                setTrCfg(parsePointageTranchesFromSettings(d.hr_pointage_tranches, settings));
            })
            .catch(() => {});
    }, [settings]);
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
        setTrCfg(buildPointageTranchesFromAppSettings(settings));
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

        setSettings(prev => ({
            ...prev,
            tasks: [...(prev.tasks || []), newTask]
        }));

        setNewTaskText('');
        // Keep date and assignee for multi-entry convenience
    };

    const handleDeleteTask = (taskId: string) => {
        if (confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
            setSettings(prev => ({
                ...prev,
                tasks: prev.tasks?.filter(t => t.id !== taskId) || []
            }));
        }
    };

    const updateTaskStatus = (taskId: string, newStatus: 'PENDING' | 'DONE_OK' | 'DONE_NOT_OK' | 'SKIPPED', reason?: string) => {
        setSettings(prev => ({
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
        setSettings(prev => ({
            ...prev,
            [name]: type === 'number' ? parseFloat(value) || 0 : value
        }));
    };

    const toggleWorkingDay = (dayIndex: number) => {
        setSettings(prev => {
            const current = prev.workingDays || [];
            const days = current.includes(dayIndex)
                ? current.filter(d => d !== dayIndex)
                : [...current, dayIndex].sort((a, b) => a - b);
            return { ...prev, workingDays: days };
        });
    };

    const addPause = () => {
        setSettings(prev => ({
            ...prev,
            pauses: [...(prev.pauses || []), { id: Date.now().toString(), name: 'Nouvelle Pause', start: '12:00', end: '13:00', durationMin: 60 }]
        }));
    };

    const updatePause = (id: string, field: 'start' | 'end' | 'name', value: string) => {
        setSettings(prev => ({
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
        setSettings(prev => ({
            ...prev,
            pauses: (prev.pauses || []).filter(p => p.id !== id)
        }));
    };

    const handleSave = () => {
        setShowSaveToast(true);
        setTimeout(() => setShowSaveToast(false), 3000);
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
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 animate-in slide-in-from-top-5 duration-300">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-bold text-sm tracking-wide">{t.saved}</span>
                </div>
            )}

            {/* Header */}
            <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sticky top-0 z-50">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 border border-indigo-100 shrink-0">
                        <Settings className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">{t.title}</h1>
                        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">{t.desc}</p>
                    </div>
                </div>
                <button onClick={handleSave} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 sm:px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30 active:scale-95 group relative overflow-hidden">
                    <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></span>
                    <Save className="w-5 h-5 relative z-10 group-hover:scale-110 transition-transform" />
                    <span className="relative z-10">{t.save}</span>
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">

                {/* LEFT COLUMN: General & Structure Placeholder */}
                <div className="space-y-6">
                    {/* General Settings */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div onClick={() => toggleSec('gen')} className={`px-5 py-4 bg-slate-50 flex items-center gap-2 cursor-pointer select-none ${openSec['gen'] ? 'border-b border-slate-100' : ''}`}>
                            <Building className="w-5 h-5 text-slate-500" />
                            <h2 className="font-bold text-slate-800">{t.general}</h2>
                            <ChevronDown className={`w-5 h-5 text-slate-400 ml-auto shrink-0 transition-transform ${openSec['gen'] ? 'rotate-180' : ''}`} />
                        </div>
                        <div className={`p-5 space-y-6 flex-1 ${openSec['gen'] ? '' : 'hidden'}`}>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t.currency}</label>
                                <select name="currency" value={settings.currency} onChange={handleChange} className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-slate-700 transition-all cursor-pointer">
                                    {CURRENCIES.map(c => (
                                        <option key={c.code} value={c.code}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t.costMinute}</label>
                                <div className="relative">
                                    <input type="number" step="0.01" name="costMinute" value={settings.costMinute} onChange={handleChange} className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl pl-11 pr-4 py-3 outline-none focus:border-indigo-500 font-black text-lg text-slate-800 transition-all" />
                                    <Coins className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                                        <Factory className="w-5 h-5" />
                                    </div>
                                    <span className="font-bold text-slate-800 text-sm">{t.machineModuleTitle}</span>
                                </div>

                                {/* Option 1 — Désactiver les alertes */}
                                <div className="flex items-start justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3">
                                    <div>
                                        <span className="font-bold text-slate-800 text-sm block">{t.machineAlertsTitle}</span>
                                        <span className="text-xs text-slate-500 block mt-0.5">{t.machineAlertsLabel}</span>
                                        <span className="text-[11px] text-slate-400 block mt-1 leading-relaxed">{t.machineAlertsHint}</span>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={settings.machineAlertsEnabled !== false}
                                        onClick={() => setSettings(prev => ({ ...prev, machineAlertsEnabled: prev.machineAlertsEnabled === false ? true : false }))}
                                        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${settings.machineAlertsEnabled !== false ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                    >
                                        <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.machineAlertsEnabled !== false ? 'left-6' : 'left-1'}`}></span>
                                    </button>
                                </div>

                                {/* Option 2 — Masquer la page Machines du menu */}
                                {navConfig && setNavConfig && (() => {
                                    const MACHINE_VIEWS = ['pageMachine', 'machin'];
                                    const isHidden = MACHINE_VIEWS.every(v => navConfig.hidden.includes(v));
                                    return (
                                        <div className="flex items-start justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3 mt-3">
                                            <div>
                                                <span className="font-bold text-slate-800 text-sm block">{t.machineHideLabel}</span>
                                                <span className="text-[11px] text-slate-400 block mt-1 leading-relaxed">{t.machineHideHint}</span>
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
                                                <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${isHidden ? 'left-6' : 'left-1'}`}></span>
                                            </button>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="mt-auto pt-4 border-t border-slate-100">
                                <div className="bg-indigo-50 text-indigo-700 p-4 rounded-xl text-sm font-medium border border-indigo-100 flex items-start gap-3">
                                    <Settings className="w-5 h-5 shrink-0 mt-0.5" />
                                    <p>Les paramètres globaux (Devise, Coût Minute, Horaires) sont synchronisés instantanément sur toutes les pages de l'application.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div onClick={() => toggleSec('rh')} className={`px-5 py-4 bg-slate-50 flex items-center gap-2 cursor-pointer select-none ${openSec['rh'] ? 'border-b border-slate-100' : ''}`}>
                            <Users className="w-5 h-5 text-slate-500" />
                            <h2 className="font-bold text-slate-800">{t.rhComptaTitle}</h2>
                            <ChevronDown className={`w-5 h-5 text-slate-400 ml-auto shrink-0 transition-transform ${openSec['rh'] ? 'rotate-180' : ''}`} />
                        </div>
                        <div className={`p-5 space-y-4 ${openSec['rh'] ? '' : 'hidden'}`}>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    checked={settings.hrAutoOvertime !== false}
                                    onChange={e => setSettings(prev => ({ ...prev, hrAutoOvertime: e.target.checked }))}
                                />
                                <span>
                                    <span className="font-bold text-slate-800 text-sm block">{t.rhAutoOvertime}</span>
                                    <span className="text-xs text-slate-500">{t.rhAutoOvertimeHint}</span>
                                </span>
                            </label>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t.rhComptaRef}</label>
                                <select
                                    name="hrComptaPointageRef"
                                    value={settings.hrComptaPointageRef === 'normales_paie' ? 'normales_paie' : 'pointees'}
                                    onChange={e =>
                                        setSettings(prev => ({
                                            ...prev,
                                            hrComptaPointageRef: e.target.value === 'normales_paie' ? 'normales_paie' : 'pointees',
                                        }))
                                    }
                                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-medium text-slate-700 transition-all cursor-pointer text-sm"
                                >
                                    <option value="pointees">{t.rhComptaRefPointees}</option>
                                    <option value="normales_paie">{t.rhComptaRefNormales}</option>
                                </select>
                                <p className="text-xs text-slate-500 mt-2">{t.rhComptaRefHint}</p>
                            </div>
                            <div className="pt-2 border-t border-slate-100">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{t.rhSageServerTitle}</p>
                                <p className="text-xs text-slate-500 mb-3">{t.rhSageServerHint}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">{t.rhSageRounding}</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={60}
                                            value={sageR}
                                            onChange={e => setSageR(Math.min(60, Math.max(1, parseInt(e.target.value, 10) || 15)))}
                                            className="w-full bg-slate-50 border-2 border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">{t.rhSageWorkday}</label>
                                        <input
                                            type="time"
                                            value={sageW}
                                            onChange={e => setSageW(e.target.value || '06:00')}
                                            className="w-full bg-slate-50 border-2 border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                                        />
                                    </div>
                                </div>
                                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5 rounded border-slate-300 text-indigo-600"
                                        checked={sageA}
                                        onChange={e => setSageA(e.target.checked)}
                                    />
                                    <span className="text-sm text-slate-800">{t.rhSageApply}</span>
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

                            <div className="pt-4 mt-4 border-t border-slate-200">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{t.rhTranchesTitle}</p>
                                <p className="text-xs text-slate-500 mb-3">{t.rhTranchesDesc}</p>
                                <div className="mb-3">
                                    <label className="block text-xs font-bold text-slate-600 mb-1">{t.rhTranchesPause}</label>
                                    <select
                                        value={trCfg.sepAfterIndex}
                                        onChange={e => {
                                            const v = parseInt(e.target.value, 10);
                                            setTrCfg(c => ({ ...c, sepAfterIndex: Number.isFinite(v) ? v : -1 }));
                                        }}
                                        className="w-full max-w-xs bg-slate-50 border-2 border-slate-200 rounded-lg px-3 py-2 text-sm"
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
                                        <div key={idx} className="flex flex-wrap items-end gap-2 bg-slate-50/80 border border-slate-200 rounded-lg p-2">
                                            <div className="min-w-[100px] flex-1">
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase">{t.rhTranchesLabel}</label>
                                                <input
                                                    value={row.label}
                                                    onChange={e => updateTrSlot(idx, { label: e.target.value })}
                                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-sm"
                                                />
                                            </div>
                                            <div className="w-24">
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase">{t.rhTranchesStart}</label>
                                                <input
                                                    type="time"
                                                    value={row.start}
                                                    onChange={e => updateTrSlot(idx, { start: e.target.value })}
                                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-sm font-mono"
                                                />
                                            </div>
                                            <div className="w-24">
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase">{t.rhTranchesEnd}</label>
                                                <input
                                                    type="time"
                                                    value={row.end}
                                                    onChange={e => updateTrSlot(idx, { end: e.target.value })}
                                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-sm font-mono"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeTrSlot(idx)}
                                                disabled={trCfg.slots.length <= 2}
                                                className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30"
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
                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-800 text-xs font-bold border border-indigo-200"
                                    >
                                        <Plus className="w-4 h-4" />
                                        {t.rhTranchesAdd}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetTranches}
                                        className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold"
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

                {/* RIGHT COLUMN: Production Schedule */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-fit">
                    <div onClick={() => toggleSec('prod')} className={`px-5 py-4 bg-slate-50 flex items-center gap-2 cursor-pointer select-none ${openSec['prod'] ? 'border-b border-slate-100' : ''}`}>
                        <Clock className="w-5 h-5 text-slate-500" />
                        <h2 className="font-bold text-slate-800">{t.production}</h2>
                        <ChevronDown className={`w-5 h-5 text-slate-400 ml-auto shrink-0 transition-transform ${openSec['prod'] ? 'rotate-180' : ''}`} />
                    </div>
                    <div className={`p-5 space-y-6 flex-1 ${openSec['prod'] ? '' : 'hidden'}`}>

                        {/* Time Format */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t.timeFormat}</label>
                            <div className="flex p-1 bg-slate-100 border border-slate-200 rounded-xl relative overflow-hidden">
                                <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm border border-slate-200 transition-all duration-300 ${settings.timeFormat === '12h' ? 'left-[calc(50%+2px)]' : 'left-1'}`}></div>
                                <button onClick={() => setSettings(prev => ({ ...prev, timeFormat: '24h' }))} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors relative z-10 ${settings.timeFormat === '24h' ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>24 Heures</button>
                                <button onClick={() => setSettings(prev => ({ ...prev, timeFormat: '12h' }))} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors relative z-10 ${settings.timeFormat === '12h' ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>12 Heures (AM/PM)</button>
                            </div>
                        </div>

                        {/* Working Hours */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t.workingHoursStart}</label>
                                <input type="time" name="workingHoursStart" value={settings.workingHoursStart} onChange={handleChange} className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-lg text-slate-700 transition-all text-center" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t.workingHoursEnd}</label>
                                <input type="time" name="workingHoursEnd" value={settings.workingHoursEnd} onChange={handleChange} className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-lg text-slate-700 transition-all text-center" />
                            </div>
                        </div>

                        {/* Working Days */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="flex items-center gap-2 block text-xs font-bold uppercase text-slate-500">{t.workingDays} <span className="text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 font-black tracking-widest">{(settings.workingDays || []).length}/7</span></label>
                                <div className="flex gap-2">
                                    <button onClick={() => setSettings(prev => ({ ...prev, workingDays: [1, 2, 3, 4, 5, 6, 7] }))} className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors uppercase pr-2 border-r border-slate-200 hidden sm:block">Tous</button>
                                    <button onClick={() => setShowAgenda(true)} className="text-[11px] font-bold bg-indigo-50 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100 border border-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm active:scale-95">
                                        <Calendar className="w-3.5 h-3.5" /> Agenda
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-2">
                                {[1, 2, 3, 4, 5, 6, 7].map((dayCode, idx) => {
                                    const isActive = (settings.workingDays || []).includes(dayCode);
                                    return (
                                        <button
                                            key={dayCode}
                                            onClick={() => toggleWorkingDay(dayCode)}
                                            className={`flex-1 min-w-[3.5rem] py-2.5 rounded-lg font-bold text-xs sm:text-sm transition-all border-2 active:scale-95 ${isActive
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                                                : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                                                }`}
                                        >
                                            {t.days[idx].substring(0, 3)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Breaks / Pauses */}
                        <div className="pt-6 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500">{t.pauses}</label>
                                    <span className="text-[10px] text-slate-400">Ces temps seront déduits des temps de présence.</span>
                                </div>
                                <button onClick={addPause} className="text-xs font-bold bg-indigo-50 text-indigo-600 flex items-center gap-1 hover:text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100">
                                    <Plus className="w-3.5 h-3.5" /> {t.addPause}
                                </button>
                            </div>

                            <div className="space-y-3">
                                {(settings.pauses || []).map((pause, index) => (
                                    <div key={pause.id} className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors">
                                        <span className="text-xs font-bold text-slate-400 w-6 text-center">{index + 1}.</span>
                                        <div className="flex-1 flex flex-col xl:flex-row gap-3 w-full">
                                            <div className="flex-[1.5]">
                                                <span className="text-[10px] uppercase text-slate-400 font-bold block mb-1">{t.pauseName}</span>
                                                <input type="text" value={pause.name || ''} onChange={(e) => updatePause(pause.id, 'name', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 placeholder:text-slate-300" placeholder="Ex: Déjeuner" />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[10px] uppercase text-slate-400 font-bold block mb-1">{t.pauseStart}</span>
                                                <input type="time" value={pause.start} onChange={(e) => updatePause(pause.id, 'start', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 text-center" />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[10px] uppercase text-slate-400 font-bold block mb-1">{t.pauseEnd}</span>
                                                <input type="time" value={pause.end} onChange={(e) => updatePause(pause.id, 'end', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 text-center" />
                                            </div>
                                            <div className="w-20">
                                                <span className="text-[10px] uppercase text-slate-400 font-bold block mb-1">{t.pauseDuration}</span>
                                                <div className="w-full bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-indigo-700 select-none">
                                                    {pause.durationMin} m
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => removePause(pause.id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-colors Shrink-0 mt-4 sm:mt-0" title="Supprimer cette pause">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {(settings.pauses || []).length === 0 && (
                                    <p className="text-sm text-slate-500 italic text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">Aucune pause définie pour le moment.</p>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

            </div>

            {/* FULL WIDTH BLOCK: Structure & Encadrement */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col mt-6">
                <div onClick={() => toggleSec('struct')} className={`px-5 py-4 bg-slate-50 flex items-center justify-between cursor-pointer select-none ${openSec['struct'] ? 'border-b border-slate-100' : ''}`}>
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-slate-500" />
                        <h2 className="font-bold text-slate-800">{t.structure}</h2>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${openSec['struct'] ? 'rotate-180' : ''}`} />
                </div>
                <div className={`p-6 md:p-8 space-y-10 ${openSec['struct'] ? '' : 'hidden'}`}>

                    {/* Encadrement Général */}
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-sm shrink-0">
                                    <Shield className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-800 tracking-tight">{t.generalManagers}</h3>
                                    <p className="text-sm text-slate-500 mt-0.5 font-medium">Direction, administration, pointeurs, chronométreurs...</p>
                                </div>
                            </div>
                            <button onClick={() => setSettings(prev => ({ ...prev, organigram: [...(prev.organigram || []), { id: Date.now().toString(), name: '', role: '' }] }))} className="w-full sm:w-auto text-sm font-bold bg-white text-indigo-600 flex items-center justify-center gap-2 hover:text-indigo-700 hover:bg-indigo-50 px-5 py-2.5 rounded-xl transition-all border border-slate-200 shadow-sm active:scale-95">
                                <Plus className="w-4 h-4" /> Ajouter Un Membre
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {(settings.organigram || []).map((person) => (
                                <div key={person.id} className="flex flex-col gap-3 bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all relative group overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <button onClick={() => setSettings(prev => ({ ...prev, organigram: prev.organigram.filter(p => p.id !== person.id) }))} className="absolute top-3 right-3 p-1.5 bg-rose-50 text-rose-500 hover:text-rose-600 hover:bg-rose-100 rounded-lg shadow-sm border border-rose-100 opacity-0 group-hover:opacity-100 transition-all active:scale-90" title="Supprimer">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Nom Complet</label>
                                        <input type="text" value={person.name} onChange={(e) => setSettings(prev => ({ ...prev, organigram: prev.organigram.map(p => p.id === person.id ? { ...p, name: e.target.value } : p) }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-bold text-slate-800 placeholder:text-slate-300 transition-all font-sans" placeholder="ex: Ahmed" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Rôle / Poste</label>
                                        <input type="text" value={person.role} onChange={(e) => setSettings(prev => ({ ...prev, organigram: prev.organigram.map(p => p.id === person.id ? { ...p, role: e.target.value } : p) }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-medium text-slate-600 placeholder:text-slate-300 transition-all" placeholder="ex: Directeur" />
                                    </div>
                                </div>
                            ))}
                            {(!settings.organigram || settings.organigram.length === 0) && (
                                <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4 p-8 border-2 border-dashed border-slate-200 rounded-3xl text-center flex flex-col items-center justify-center gap-3 bg-slate-50">
                                    <Shield className="w-10 h-10 text-slate-300" />
                                    <span className="text-slate-500 font-bold text-sm">Aucun responsable général défini.</span>
                                    <span className="text-slate-400 text-xs">Cliquez sur « Ajouter un membre » pour commencer.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* Number of Chains Config */}
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3"></div>
                        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                            <div className="flex-1">
                                <label className="block text-lg font-black text-indigo-900 mb-1">{t.chainsCount}</label>
                                <p className="text-sm text-indigo-700/70 font-medium">Modifier ce nombre mettra à jour l'usine numérique (Effet immédiat sur Suivi, Planning, Effectifs).</p>
                            </div>
                            <div className="relative w-40 shrink-0">
                                <input type="number" min="1" max="50" name="chainsCount" value={settings.chainsCount ?? 1} onChange={handleChange} className="w-full bg-white border-2 border-indigo-200 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 font-black text-xl text-indigo-900 transition-all" />
                                <Building className="w-6 h-6 text-indigo-400 absolute left-4 top-3.5" />
                            </div>
                        </div>
                    </div>

                    {/* Effectifs par Chaîne */}
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100"><Users className="w-5 h-5" /></div>
                            <div>
                                <h3 className="text-base font-black text-slate-800 tracking-tight">{t.chainStaff}</h3>
                                <p className="text-xs text-slate-500 mt-0.5 font-medium">Chef de groupe, moniteur, qualiticien de ligne...</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                            {Array.from({ length: settings.chainsCount }).map((_, i) => {
                                const chainKey = `CHAINE ${i + 1}`;
                                const staff = settings.chainStaff?.[chainKey] || [];
                                return (
                                    <div key={chainKey} className="bg-white border-2 border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:border-emerald-200 transition-colors flex flex-col">
                                        <div className="bg-emerald-50/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between border-b border-emerald-100 gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-white border border-emerald-200 shadow-sm flex items-center justify-center text-emerald-600 font-black text-sm">{i + 1}</div>
                                                <input
                                                    type="text"
                                                    value={settings.chainNames?.[chainKey] || chainKey}
                                                    onChange={(e) => setSettings(prev => ({
                                                        ...prev,
                                                        chainNames: { ...(prev.chainNames || {}), [chainKey]: e.target.value || chainKey }
                                                    }))}
                                                    className="font-black text-slate-800 tracking-wider text-base bg-transparent border-b-2 border-transparent hover:border-emerald-300 focus:border-emerald-500 focus:bg-white px-1 outline-none transition-all w-32"
                                                    placeholder="Nom de la chaîne..."
                                                />
                                            </div>
                                            <button onClick={() => setSettings(prev => ({
                                                ...prev,
                                                chainStaff: {
                                                    ...(prev.chainStaff || {}),
                                                    [chainKey]: [...staff, { id: Date.now().toString(), name: '', role: 'Chef de chaîne' }]
                                                }
                                            }))} className="w-full sm:w-auto text-[11px] font-bold uppercase tracking-wider bg-white text-slate-600 hover:text-emerald-700 px-4 py-2 rounded-xl shadow-sm border border-slate-200 hover:border-emerald-300 transition-all flex items-center justify-center gap-1.5 active:scale-95">
                                                <Plus className="w-3.5 h-3.5" /> Ajouter
                                            </button>
                                        </div>
                                        <div className="p-5 bg-white flex-1 flex flex-col">
                                            {staff.length > 0 ? (
                                                <div className="space-y-4">
                                                    {staff.map((person) => (
                                                        <div key={person.id} className="flex flex-col sm:flex-row items-center gap-3 group relative bg-slate-50 p-3 rounded-2xl border border-slate-100 hover:border-emerald-200 transition-colors">
                                                            <div className="flex-1 w-full">
                                                                <input type="text" value={person.name} onChange={(e) => setSettings(prev => ({ ...prev, chainStaff: { ...prev.chainStaff, [chainKey]: prev.chainStaff[chainKey].map(p => p.id === person.id ? { ...p, name: e.target.value } : p) } }))} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm font-bold text-slate-700 transition-all" placeholder="Nom Complet" />
                                                            </div>
                                                            <div className="flex-1 w-full">
                                                                <input type="text" value={person.role} onChange={(e) => setSettings(prev => ({ ...prev, chainStaff: { ...prev.chainStaff, [chainKey]: prev.chainStaff[chainKey].map(p => p.id === person.id ? { ...p, role: e.target.value } : p) } }))} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm font-medium text-slate-600 transition-all" placeholder="Rôle (ex: Qualité)" />
                                                            </div>
                                                            <button onClick={() => setSettings(prev => ({ ...prev, chainStaff: { ...prev.chainStaff, [chainKey]: prev.chainStaff[chainKey].filter(p => p.id !== person.id) } }))} className="w-full sm:w-10 sm:h-10 text-rose-400 hover:text-rose-600 bg-white hover:bg-rose-50 rounded-xl border border-slate-200 hover:border-rose-300 shadow-sm transition-all focus:outline-none shrink-0 flex items-center justify-center active:scale-90 py-2 sm:py-0" title="Supprimer">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex-1 flex flex-col items-center justify-center py-8">
                                                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                                                        <Users className="w-6 h-6 text-slate-300" />
                                                    </div>
                                                    <span className="text-sm text-slate-400 font-bold bg-slate-50 px-5 py-2 rounded-full border border-slate-100">Aucun personnel affecté</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    <div className="mt-10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                                <Factory className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-800 tracking-tight">
                                    {lang === 'fr' ? 'Machines par chaîne (planning)' : 'الماكينات حسب الخط (التخطيط)'}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5 font-medium max-w-3xl">
                                    {lang === 'fr'
                                        ? 'Cochez les machines réellement sur chaque ligne. Par défaut (aucune sélection enregistrée), le planning utilise tout le parc actif hors panne / maintenance. Réduire la liste force la vérification « gamme vs machines » sur ce sous-ensemble.'
                                        : 'اختر الماكينات الفعلية لكل خط. بدون اختيار محفوظ يستخدم التخطيط كامل الماكينات النشطة الصالحة.'}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                            {Array.from({ length: settings.chainsCount }).map((_, i) => {
                                const chainKey = `CHAINE ${i + 1}`;
                                const baseIds = machines.filter(isMachineOperational).map(m => m.id);
                                const explicit = settings.chainMachines?.[chainKey];
                                const selected =
                                    explicit != null && explicit.length > 0 ? explicit.filter(id => baseIds.includes(id)) : baseIds;
                                const chainDisplayName = settings.chainNames?.[chainKey] || chainKey;
                                return (
                                    <div
                                        key={`cm-${chainKey}`}
                                        className="bg-white border-2 border-slate-100 rounded-3xl overflow-hidden shadow-sm p-5 flex flex-col gap-3"
                                    >
                                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                            <span className="font-black text-slate-800 text-sm">{chainDisplayName}</span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setSettings(prev => {
                                                        const cm = { ...(prev.chainMachines || {}) };
                                                        delete cm[chainKey];
                                                        const keys = Object.keys(cm);
                                                        return { ...prev, chainMachines: keys.length ? cm : undefined };
                                                    })
                                                }
                                                className="text-[10px] font-bold uppercase text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50"
                                            >
                                                {lang === 'fr' ? 'Tout le parc' : 'الكل'}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                            {machines
                                                .filter(m => m.active)
                                                .map(m => {
                                                    const usable = isMachineOperational(m);
                                                    const checked = usable && selected.includes(m.id);
                                                    return (
                                                        <label
                                                            key={`${chainKey}-${m.id}`}
                                                            className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer select-none ${
                                                                usable
                                                                    ? 'border-slate-200 bg-slate-50 hover:border-indigo-200'
                                                                    : 'border-slate-100 bg-slate-50/60 text-slate-400 cursor-not-allowed'
                                                            }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                                checked={checked}
                                                                disabled={!usable}
                                                                onChange={() => {
                                                                    if (!usable) return;
                                                                    setSettings(prev => {
                                                                        const b = machines.filter(isMachineOperational).map(x => x.id);
                                                                        const cur =
                                                                            prev.chainMachines?.[chainKey]?.length
                                                                                ? prev.chainMachines![chainKey]!
                                                                                : [...b];
                                                                        const on = cur.includes(m.id);
                                                                        const next = on
                                                                            ? cur.filter(id => id !== m.id)
                                                                            : [...cur, m.id];
                                                                        const sortedB = [...b].sort().join(',');
                                                                        const sortedN = [...next].sort().join(',');
                                                                        const cm = { ...(prev.chainMachines || {}) };
                                                                        if (next.length === 0 || sortedB === sortedN) {
                                                                            delete cm[chainKey];
                                                                        } else {
                                                                            cm[chainKey] = next;
                                                                        }
                                                                        const keys = Object.keys(cm);
                                                                        return {
                                                                            ...prev,
                                                                            chainMachines: keys.length ? cm : undefined,
                                                                        };
                                                                    });
                                                                }}
                                                            />
                                                            <span className="font-mono text-slate-700">{m.classe}</span>
                                                            <span className="text-slate-500 font-medium truncate max-w-[100px]">{m.name}</span>
                                                            {!usable && m.status && (
                                                                <span className="text-[9px] uppercase text-amber-600">{m.status}</span>
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>
            </div>

            {/* FULL WIDTH BLOCK: Config Moteur APS */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col mt-6">
                <div onClick={() => toggleSec('aps')} className={`px-5 py-4 bg-slate-50 flex items-center justify-between cursor-pointer select-none ${openSec['aps'] ? 'border-b border-slate-100' : ''}`}>
                    <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-amber-500" />
                        <h2 className="font-bold text-slate-800">{t.apsTitle}</h2>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${openSec['aps'] ? 'rotate-180' : ''}`} />
                </div>
                <div className={`p-6 md:p-8 space-y-6 ${openSec['aps'] ? '' : 'hidden'}`}>
                    <p className="text-sm text-slate-500 font-medium">
                        {t.apsDesc}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Mode de calcul */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider">
                                {t.apsCapacityMode}
                            </label>
                            <div className="flex flex-col gap-2">
                                <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="capacityMode"
                                        value="STATIC"
                                        checked={(settings.capacityMode || 'STATIC') === 'STATIC'}
                                        onChange={() => setSettings(prev => ({ ...prev, capacityMode: 'STATIC' }))}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>{t.apsModeStatic}</span>
                                </label>
                                <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="capacityMode"
                                        value="DYNAMIC"
                                        checked={settings.capacityMode === 'DYNAMIC'}
                                        onChange={() => setSettings(prev => ({ ...prev, capacityMode: 'DYNAMIC' }))}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>{t.apsModeDynamic}</span>
                                </label>
                            </div>
                        </div>

                        {/* Coût heures supp */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider">
                                {t.apsOvertimeCost}
                            </label>
                            <input
                                type="number"
                                value={settings.overtimeCostPerHour ?? 25}
                                onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setSettings(prev => ({ ...prev, overtimeCostPerHour: val }));
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm font-bold text-slate-700 transition-all"
                                min={0}
                            />
                        </div>

                        {/* Coût sous-traitance */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider">
                                {t.apsSubcontractCost}
                            </label>
                            <input
                                type="number"
                                value={settings.subcontractDefaultCostPerPiece ?? 15}
                                onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setSettings(prev => ({ ...prev, subcontractDefaultCostPerPiece: val }));
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm font-bold text-slate-700 transition-all"
                                min={0}
                            />
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* Paramètres APS par chaîne */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-700">{t.apsChainConfig}</h3>
                        <div className="overflow-x-auto border border-slate-200 rounded-xl">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500 tracking-wider">
                                        <th className="px-6 py-3">{lang === 'fr' ? 'Chaîne' : 'الخط'}</th>
                                        <th className="px-6 py-3">{t.apsOperators}</th>
                                        <th className="px-6 py-3">{t.apsActivityRate}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                                    {Array.from({ length: settings.chainsCount }).map((_, i) => {
                                        const chainKey = `CHAINE ${i + 1}`;
                                        const chainDisplayName = settings.chainNames?.[chainKey] || chainKey;
                                        const operators = settings.chainOperators?.[chainKey] ?? 30;
                                        const rate = settings.chainActivityRate?.[chainKey] ?? 0.85;

                                        return (
                                            <tr key={chainKey} className="hover:bg-slate-50/50">
                                                <td className="px-6 py-4 font-bold">{chainDisplayName}</td>
                                                <td className="px-6 py-4">
                                                    <input
                                                        type="number"
                                                        value={operators}
                                                        onChange={e => {
                                                            const val = parseInt(e.target.value, 10) || 0;
                                                            setSettings(prev => ({
                                                                ...prev,
                                                                chainOperators: {
                                                                    ...(prev.chainOperators || {}),
                                                                    [chainKey]: val,
                                                                },
                                                            }));
                                                        }}
                                                        className="w-24 bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700"
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
                                                            setSettings(prev => ({
                                                                ...prev,
                                                                chainActivityRate: {
                                                                    ...(prev.chainActivityRate || {}),
                                                                    [chainKey]: val,
                                                                },
                                                            }));
                                                        }}
                                                        className="w-24 bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700"
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
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col mt-6">
                    <div onClick={() => toggleSec('nav')} className={`px-5 py-4 bg-slate-50 flex items-center justify-between cursor-pointer select-none ${openSec['nav'] ? 'border-b border-slate-100' : ''}`}>
                        <div className="flex items-center gap-2">
                            <ListTodo className="w-5 h-5 text-indigo-500" />
                            <h2 className="font-bold text-slate-800">
                                {lang === 'fr' ? 'Configuration de la barre de navigation' : 'إعدادات شريط التنقل'}
                            </h2>
                            <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${openSec['nav'] ? 'rotate-180' : ''}`} />
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(lang === 'fr' ? 'Voulez-vous vraiment réinitialiser la navigation ?' : 'هل تريد حقًا إعادة تعيين القائمة؟')) {
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
                            className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-100 transition-colors"
                        >
                            {lang === 'fr' ? 'Réinitialiser' : 'إعادة تعيين'}
                        </button>
                    </div>
                    <div className={`p-6 md:p-8 space-y-6 ${openSec['nav'] ? '' : 'hidden'}`}>
                        <p className="text-sm text-slate-500 font-medium">
                            {lang === 'fr'
                                ? 'Configurez le type d\'affichage des menus (dropdowns ou ruban plat), modifiez les titres des catégories ou déplacez librement les pages.'
                                : 'تخصيص نمط القائمة (منسدلة أو مسطحة)، تعديل أسماء الفئات، أو نقل الصفحات بحرية.'}
                        </p>

                        {/* Layout Style Selector */}
                        <div className="space-y-3">
                            <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider">
                                {lang === 'fr' ? 'Type d\'affichage' : 'نمط العرض'}
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {[
                                    { key: 'dropdown', labelFr: 'Menus Déroulants Groupés', labelAr: 'قوائم منسدلة مجموعة' },
                                    { key: 'flat', labelFr: 'Ruban Plat Horizontal', labelAr: 'شريط أفقي مسطح' },
                                    { key: 'mobile-only', labelFr: 'Hamburger / Menu Latéral Uniquement', labelAr: 'زر القائمة الجانبية فقط' }
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        onClick={() => setNavConfig({ ...navConfig, style: item.key as any })}
                                        className={`p-4 rounded-xl border-2 font-bold text-sm transition-all text-start flex flex-col gap-1 hover:border-indigo-300 active:scale-98 ${
                                            navConfig.style === item.key
                                                ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm'
                                                : 'bg-white border-slate-200 text-slate-600'
                                        }`}
                                    >
                                        <span>{lang === 'fr' ? item.labelFr : item.labelAr}</span>
                                        <span className="text-[10px] font-normal text-slate-400">
                                            {item.key === 'dropdown' && (lang === 'fr' ? 'Regroupe les 20 modules dans 5 menus compacts' : 'تجميع 20 موديول في 5 قوائم مدمجة')}
                                            {item.key === 'flat' && (lang === 'fr' ? 'Affiche tous les boutons l\'un après l\'autre' : 'عرض جميع الأزرار متتالية')}
                                            {item.key === 'mobile-only' && (lang === 'fr' ? 'Idéal pour maximiser l\'espace de travail' : 'مثالي لزيادة مساحة العمل')}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Hamburger Enable Switch (Only if not mobile-only) */}
                        {navConfig.style !== 'mobile-only' && (
                            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <div>
                                    <span className="text-sm font-bold text-slate-700">
                                        {lang === 'fr' ? 'Bouton Hamburger (☰)' : 'زر القائمة الجانبية (☰)'}
                                    </span>
                                    <p className="text-[11px] text-slate-400">
                                        {lang === 'fr' ? 'Afficher également le menu hamburger rapide à gauche' : 'عرض زر القائمة السريعة الجانبية على اليسار أيضاً'}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setNavConfig({ ...navConfig, enabled: !navConfig.enabled })}
                                    className={`w-10 h-5 rounded-full p-0.5 transition-colors relative flex items-center ${navConfig.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${navConfig.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        )}

                        {/* Categories Organization (Only relevant if dropdown style is active) */}
                        {navConfig.style === 'dropdown' && (
                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider">
                                    {lang === 'fr' ? 'Renommer et organiser les catégories' : 'تعديل أسماء وتنظيم الفئات'}
                                </label>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {navConfig.categories?.map((category, catIdx) => (
                                        <div key={category.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={category.name}
                                                    onChange={(e) => {
                                                        const updated = [...navConfig.categories];
                                                        updated[catIdx] = { ...category, name: e.target.value };
                                                        setNavConfig({ ...navConfig, categories: updated });
                                                    }}
                                                    className="bg-white border border-slate-200 hover:border-indigo-300 focus:border-indigo-500 outline-none rounded-xl px-3 py-2 text-sm font-bold text-slate-800 flex-1 shadow-sm transition-all"
                                                    placeholder={lang === 'fr' ? 'Nom de la catégorie' : 'اسم الفئة'}
                                                />
                                                <span className="text-[10px] font-black uppercase bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100">
                                                    {category.views.length} {lang === 'fr' ? 'Pages' : 'صفحات'}
                                                </span>
                                            </div>
                                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                                {category.views.map((view) => {
                                                    const isHidden = navConfig.hidden.includes(view);
                                                    return (
                                                        <div key={view} className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 shadow-sm">
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
                                                                    className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-600"
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
                                                                            ? 'bg-slate-100 border-slate-200 text-slate-400'
                                                                            : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                                                    }`}
                                                                >
                                                                    {isHidden ? (lang === 'fr' ? 'Masqué' : 'مخفي') : (lang === 'fr' ? 'Visible' : 'مرئي')}
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
                            <div className="space-y-3 pt-4 border-t border-slate-100">
                                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider">
                                    {lang === 'fr' ? 'Ordre et visibilité des modules' : 'ترتيب وظهور الوحدات'}
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                    {navConfig.order.map((view, idx) => {
                                        const isHidden = navConfig.hidden.includes(view);
                                        return (
                                            <div key={view} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                                                isHidden ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 shadow-sm'
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
                                                <span className="text-sm font-bold text-slate-700 flex-1 truncate">{VIEW_LABELS[view]?.[lang] || view}</span>
                                                <button
                                                    onClick={() => {
                                                        const hidden = isHidden
                                                            ? navConfig.hidden.filter(v => v !== view)
                                                            : [...navConfig.hidden, view];
                                                        setNavConfig({ ...navConfig, hidden });
                                                    }}
                                                    className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-all shrink-0 ${
                                                        isHidden
                                                            ? 'bg-slate-100 border-slate-200 text-slate-400'
                                                            : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                                    }`}
                                                >
                                                    {isHidden ? (lang === 'fr' ? 'Masqué' : 'مخفي') : (lang === 'fr' ? 'Visible' : 'مرئي')}
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
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col mt-6">
                <div onClick={() => toggleSec('tasks')} className={`px-5 py-4 bg-slate-50 flex items-center justify-between cursor-pointer select-none ${openSec['tasks'] ? 'border-b border-slate-100' : ''}`}>
                    <div className="flex items-center gap-2">
                        <ListTodo className="w-5 h-5 text-indigo-500" />
                        <h2 className="font-bold text-slate-800">Gestion des Tâches</h2>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${openSec['tasks'] ? 'rotate-180' : ''}`} />
                </div>
                <div className={`p-6 md:p-8 space-y-6 ${openSec['tasks'] ? '' : 'hidden'}`}>
                    {/* Add New Task Form */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-end">
                        <div className="flex-1 w-full relative">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Description de la tâche</label>
                            <input
                                type="text"
                                value={newTaskText}
                                onChange={e => setNewTaskText(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500"
                                placeholder="Nouvelle tâche..."
                            />
                        </div>
                        <div className="w-full sm:w-40 relative">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Date</label>
                            <input
                                type="date"
                                value={newTaskDate}
                                onChange={e => setNewTaskDate(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600"
                            />
                        </div>
                        <div className="w-full sm:w-64 relative">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Assigner à</label>
                            <select
                                value={newTaskAssignee}
                                onChange={e => setNewTaskAssignee(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500"
                            >
                                <option value="">Choisir un responsable...</option>
                                <optgroup label="Direction">
                                    {settings.organigram?.map(p => (
                                        <option key={p.id} value={`${p.name}|${p.role}`}>{p.name} ({p.role})</option>
                                    ))}
                                </optgroup>
                                {Array.from({ length: settings.chainsCount }).map((_, i) => {
                                    const chainKey = `CHAINE ${i + 1}`;
                                    const staff = settings.chainStaff?.[chainKey] || [];
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
                            className="w-full sm:w-auto px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 h-[38px] shrink-0"
                        >
                            <Plus className="w-4 h-4" /> Ajouter
                        </button>
                    </div>

                    {/* Tasks List (Admin View) */}
                    <div className="space-y-3 mt-6">
                        <h3 className="text-sm font-bold text-slate-700 mb-4">Toutes les tâches ({settings.tasks?.length || 0})</h3>
                        {(!settings.tasks || settings.tasks.length === 0) && (
                            <p className="text-sm text-slate-500 italic bg-white p-4 rounded-xl border border-dashed border-slate-200 text-center">Aucune tâche active.</p>
                        )}
                        <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                            {settings.tasks?.slice().reverse().map(task => (
                                <div key={task.id} className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-white border border-slate-200 p-3 rounded-xl gap-4 hover:border-indigo-200 transition-colors group">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{task.assigneeName} {task.assigneeRole ? `(${task.assigneeRole})` : ''}</span>
                                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {task.date}</span>

                                            {/* Status Badge */}
                                            {task.status === 'PENDING' && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">PENDING</span>}
                                            {task.status === 'DONE_OK' && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">OK</span>}
                                            {task.status === 'DONE_NOT_OK' && <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">NOT OK</span>}
                                            {task.status === 'SKIPPED' && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">SKIPPED</span>}
                                        </div>
                                        <p className="text-sm font-bold text-slate-700">{task.text}</p>
                                        {task.status === 'SKIPPED' && task.skipReason && (
                                            <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 font-medium bg-amber-50 p-2 rounded-lg inline-block w-full">
                                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                Motif d'annulation: {task.skipReason}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        {task.status === 'PENDING' && (
                                            <>
                                                <button onClick={() => updateTaskStatus(task.id, 'DONE_OK')} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg border border-emerald-100 transition-colors" title="Marquer comme OK"><Check className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => updateTaskStatus(task.id, 'DONE_NOT_OK')} className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg border border-rose-100 transition-colors" title="Marquer comme NOT OK"><X className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => {
                                                    const reason = prompt('Motif d\'annulation ?');
                                                    if (reason) updateTaskStatus(task.id, 'SKIPPED', reason);
                                                }} className="p-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg border border-amber-100 transition-colors" title="Ignorer / Annuler"><SkipForward className="w-3.5 h-3.5" /></button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => handleDeleteTask(task.id)}
                                            className="p-1.5 bg-slate-50 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 hover:border-rose-200 transition-colors"
                                            title="Supprimer la tâche"
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

            <AgendaModal isOpen={showAgenda} onClose={() => setShowAgenda(false)} settings={settings} setSettings={setSettings} lang={lang} />
        </div >
    );
}
