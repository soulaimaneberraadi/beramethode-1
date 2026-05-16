import React, { useState } from 'react';
import { Settings, Clock, Calendar, Coins, Users, Shield, Save, Building, Plus, Trash2, CheckCircle, ListTodo, CalendarClock, AlertTriangle, Check, X, SkipForward } from 'lucide-react';
import { AppSettings, AppTask } from '../types';
import AgendaModal from './AgendaModal';

interface ConfigurationProps {
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    lang: 'fr' | 'ar';
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

export default function Configuration({ settings, setSettings, lang }: ConfigurationProps) {
    const t = TRANSLATIONS[lang];
    const [showSaveToast, setShowSaveToast] = useState(false);
    const [showAgenda, setShowAgenda] = useState(false);

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
            const days = prev.workingDays.includes(dayIndex)
                ? prev.workingDays.filter(d => d !== dayIndex)
                : [...prev.workingDays, dayIndex].sort((a, b) => a - b);
            return { ...prev, workingDays: days };
        });
    };

    const addPause = () => {
        setSettings(prev => ({
            ...prev,
            pauses: [...prev.pauses, { id: Date.now().toString(), name: 'Nouvelle Pause', start: '12:00', end: '13:00', durationMin: 60 }]
        }));
    };

    const updatePause = (id: string, field: 'start' | 'end' | 'name', value: string) => {
        setSettings(prev => ({
            ...prev,
            pauses: prev.pauses.map(p => {
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
            pauses: prev.pauses.filter(p => p.id !== id)
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
                        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                            <Building className="w-5 h-5 text-slate-500" />
                            <h2 className="font-bold text-slate-800">{t.general}</h2>
                        </div>
                        <div className="p-5 space-y-6 flex-1">
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

                            <div className="mt-auto pt-4 border-t border-slate-100">
                                <div className="bg-indigo-50 text-indigo-700 p-4 rounded-xl text-sm font-medium border border-indigo-100 flex items-start gap-3">
                                    <Settings className="w-5 h-5 shrink-0 mt-0.5" />
                                    <p>Les paramètres globaux (Devise, Coût Minute, Horaires) sont synchronisés instantanément sur toutes les pages de l'application.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN: Production Schedule */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-fit">
                    <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-slate-500" />
                        <h2 className="font-bold text-slate-800">{t.production}</h2>
                    </div>
                    <div className="p-5 space-y-6 flex-1">

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
                        <div className="grid grid-cols-2 gap-4">
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
                                <label className="flex items-center gap-2 block text-xs font-bold uppercase text-slate-500">{t.workingDays} <span className="text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 font-black tracking-widest">{settings.workingDays.length}/7</span></label>
                                <div className="flex gap-2">
                                    <button onClick={() => setSettings(prev => ({ ...prev, workingDays: [1, 2, 3, 4, 5, 6, 7] }))} className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors uppercase pr-2 border-r border-slate-200 hidden sm:block">Tous</button>
                                    <button onClick={() => setShowAgenda(true)} className="text-[11px] font-bold bg-indigo-50 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100 border border-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm active:scale-95">
                                        <Calendar className="w-3.5 h-3.5" /> Agenda
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-2">
                                {[1, 2, 3, 4, 5, 6, 7].map((dayCode, idx) => {
                                    const isActive = settings.workingDays.includes(dayCode);
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
                                {settings.pauses.map((pause, index) => (
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
                                {settings.pauses.length === 0 && (
                                    <p className="text-sm text-slate-500 italic text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">Aucune pause définie pour le moment.</p>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

            </div>

            {/* FULL WIDTH BLOCK: Structure & Encadrement */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col mt-6">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-slate-500" />
                        <h2 className="font-bold text-slate-800">{t.structure}</h2>
                    </div>
                </div>
                <div className="p-6 md:p-8 space-y-10">

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
                                <input type="number" min="1" max="50" name="chainsCount" value={settings.chainsCount} onChange={handleChange} className="w-full bg-white border-2 border-indigo-200 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 font-black text-xl text-indigo-900 transition-all" />
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

                </div>
            </div>

            {/* FULL WIDTH BLOCK: Gestion des Tâches (Phase 24) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col mt-6">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ListTodo className="w-5 h-5 text-indigo-500" />
                        <h2 className="font-bold text-slate-800">Gestion des Tâches</h2>
                    </div>
                </div>
                <div className="p-6 md:p-8 space-y-6">
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
