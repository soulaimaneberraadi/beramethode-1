import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar, Info, Clock, CheckCircle2, XCircle, Zap, PartyPopper, Globe } from 'lucide-react';
import { AppSettings } from '../types';

// ── National Holidays Database ──────────────────────────────────────────────
// Fixed dates: MM-DD format. Islamic dates: exact YYYY-MM-DD per year.
const HOLIDAYS_BY_CURRENCY: Record<string, { date: string; name: string; nameAr?: string }[]> = {
    MAD: [ // 🇲🇦 Maroc
        // Fixed
        { date: '01-01', name: 'Nouvel An', nameAr: 'رأس السنة الميلادية' },
        { date: '01-11', name: 'Manifeste de l\'Indépendance', nameAr: 'تقديم وثيقة الاستقلال' },
        { date: '05-01', name: 'Fête du Travail', nameAr: 'عيد الشغل' },
        { date: '07-30', name: 'Fête du Trône', nameAr: 'عيد العرش' },
        { date: '08-14', name: 'Allégeance de Oued Eddahab', nameAr: 'ذكرى استرداد إقليم وادي الذهب' },
        { date: '08-20', name: 'Révolution du Roi et du Peuple', nameAr: 'ذكرى ثورة الملك والشعب' },
        { date: '08-21', name: 'Fête de la Jeunesse', nameAr: 'عيد الشباب' },
        { date: '11-06', name: 'Marche Verte', nameAr: 'ذكرى المسيرة الخضراء' },
        { date: '11-18', name: 'Fête de l\'Indépendance', nameAr: 'عيد الاستقلال' },
        // Islamic 2026 (approximate)
        { date: '2026-03-20', name: 'Aïd Al-Fitr (J1)', nameAr: 'عيد الفطر (يوم 1)' },
        { date: '2026-03-21', name: 'Aïd Al-Fitr (J2)', nameAr: 'عيد الفطر (يوم 2)' },
        { date: '2026-05-27', name: 'Aïd Al-Adha (J1)', nameAr: 'عيد الأضحى (يوم 1)' },
        { date: '2026-05-28', name: 'Aïd Al-Adha (J2)', nameAr: 'عيد الأضحى (يوم 2)' },
        { date: '2026-06-17', name: 'Awal Moharram (Nouvel An Hégirien)', nameAr: 'رأس السنة الهجرية' },
        { date: '2026-08-25', name: 'Mawlid Annabawi', nameAr: 'عيد المولد النبوي الشريف' },
        // Islamic 2025
        { date: '2025-03-30', name: 'Aïd Al-Fitr (J1)', nameAr: 'عيد الفطر (يوم 1)' },
        { date: '2025-03-31', name: 'Aïd Al-Fitr (J2)', nameAr: 'عيد الفطر (يوم 2)' },
        { date: '2025-06-07', name: 'Aïd Al-Adha (J1)', nameAr: 'عيد الأضحى (يوم 1)' },
        { date: '2025-06-08', name: 'Aïd Al-Adha (J2)', nameAr: 'عيد الأضحى (يوم 2)' },
        { date: '2025-06-27', name: 'Awal Moharram', nameAr: 'رأس السنة الهجرية' },
        { date: '2025-09-05', name: 'Mawlid Annabawi', nameAr: 'المولد النبوي الشريف' },
    ],
    DZD: [ // 🇩🇿 Algérie
        { date: '01-01', name: 'Nouvel an', nameAr: 'رأس السنة الميلادية' },
        { date: '05-01', name: 'Fête du Travail', nameAr: 'عيد العمال' },
        { date: '07-05', name: 'Fête de l\'Indépendance', nameAr: 'عيد الاستقلال' },
        { date: '11-01', name: 'Fête de la Révolution', nameAr: 'عيد الثورة' },
        // Islamic 2026
        { date: '2026-03-20', name: 'Aïd Al-Fitr', nameAr: 'عيد الفطر' },
        { date: '2026-03-21', name: 'Aïd Al-Fitr (J2)', nameAr: 'عيد الفطر (يوم 2)' },
        { date: '2026-05-27', name: 'Aïd Al-Adha', nameAr: 'عيد الأضحى' },
        { date: '2026-05-28', name: 'Aïd Al-Adha (J2)', nameAr: 'عيد الأضحى (يوم 2)' },
        { date: '2026-06-17', name: 'Nouvel An Hégirien', nameAr: 'رأس السنة الهجرية' },
        { date: '2026-08-25', name: 'Mawlid Annabawi', nameAr: 'المولد النبوي' },
        { date: '2025-03-30', name: 'Aïd Al-Fitr', nameAr: 'عيد الفطر' },
        { date: '2025-06-07', name: 'Aïd Al-Adha', nameAr: 'عيد الأضحى' },
        { date: '2025-06-27', name: 'Nouvel An Hégirien', nameAr: 'رأس السنة الهجرية' },
        { date: '2025-09-05', name: 'Mawlid Annabawi', nameAr: 'المولد النبوي' },
    ],
    TND: [ // 🇹🇳 Tunisie
        { date: '01-01', name: 'Nouvel an', nameAr: 'رأس السنة' },
        { date: '03-20', name: 'Fête de l\'Indépendance', nameAr: 'عيد الاستقلال' },
        { date: '04-09', name: 'Jour des Martyrs', nameAr: 'يوم الشهداء' },
        { date: '05-01', name: 'Fête du Travail', nameAr: 'عيد الشغل' },
        { date: '07-25', name: 'Fête de la République', nameAr: 'عيد الجمهورية' },
        { date: '08-13', name: 'Fête de la Femme', nameAr: 'عيد المرأة' },
        { date: '10-15', name: 'Fête d\'Évacuation', nameAr: 'عيد الجلاء' },
        { date: '2026-03-20', name: 'Aïd Al-Fitr', nameAr: 'عيد الفطر' },
        { date: '2026-05-27', name: 'Aïd Al-Adha', nameAr: 'عيد الأضحى' },
        { date: '2026-06-17', name: 'Nouvel An Hégirien', nameAr: 'رأس السنة الهجرية' },
        { date: '2026-08-25', name: 'Mawlid Annabawi', nameAr: 'المولد النبوي' },
        { date: '2025-03-30', name: 'Aïd Al-Fitr', nameAr: 'عيد الفطر' },
        { date: '2025-06-07', name: 'Aïd Al-Adha', nameAr: 'عيد الأضحى' },
        { date: '2025-09-05', name: 'Mawlid Annabawi', nameAr: 'المولد النبوي' },
    ],
    EUR: [ // 🇫🇷 France
        { date: '01-01', name: 'Jour de l\'An' },
        { date: '05-01', name: 'Fête du Travail' },
        { date: '05-08', name: 'Victoire 1945' },
        { date: '07-14', name: 'Fête Nationale' },
        { date: '08-15', name: 'Assomption' },
        { date: '11-01', name: 'Toussaint' },
        { date: '11-11', name: 'Armistice' },
        { date: '12-25', name: 'Noël' },
        // Variable 2025
        { date: '2025-04-18', name: 'Vendredi Saint' },
        { date: '2025-04-21', name: 'Lundi de Pâques' },
        { date: '2025-05-29', name: 'Ascension' },
        { date: '2025-06-09', name: 'Lundi de Pentecôte' },
        // Variable 2026
        { date: '2026-04-06', name: 'Lundi de Pâques' },
        { date: '2026-05-14', name: 'Ascension' },
        { date: '2026-05-25', name: 'Lundi de Pentecôte' },
    ],
    TRY: [ // 🇹🇷 Turquie
        { date: '01-01', name: 'Yılbaşı (Nouvel An)' },
        { date: '04-23', name: 'Ulusal Egemenlik ve Çocuk Bayramı' },
        { date: '05-01', name: 'Emek ve Dayanışma Günü (Fête du Travail)' },
        { date: '05-19', name: 'Atatürk\'ü Anma Günü' },
        { date: '07-15', name: 'Demokrasi Bayramı' },
        { date: '08-30', name: 'Zafer Bayramı (Victoire)' },
        { date: '10-29', name: 'Cumhuriyet Bayramı (République)' },
        { date: '2026-03-20', name: 'Ramazan Bayramı (Aïd Al-Fitr)' },
        { date: '2026-05-27', name: 'Kurban Bayramı (Aïd Al-Adha)' },
        { date: '2025-03-30', name: 'Ramazan Bayramı' },
        { date: '2025-06-07', name: 'Kurban Bayramı' },
    ],
    SAR: [ // 🇸🇦 Arabie Saoudite
        { date: '09-23', name: 'Fête Nationale', nameAr: 'اليوم الوطني' },
        { date: '02-22', name: 'Jour Fondateur', nameAr: 'يوم التأسيس' },
        { date: '2026-03-20', name: 'Aïd Al-Fitr', nameAr: 'عيد الفطر' },
        { date: '2026-03-21', name: 'Aïd Al-Fitr (J2)', nameAr: 'عيد الفطر (يوم 2)' },
        { date: '2026-03-22', name: 'Aïd Al-Fitr (J3)', nameAr: 'عيد الفطر (يوم 3)' },
        { date: '2026-05-27', name: 'Aïd Al-Adha', nameAr: 'عيد الأضحى' },
        { date: '2026-05-28', name: 'Aïd Al-Adha (J2)', nameAr: 'عيد الأضحى (يوم 2)' },
        { date: '2026-05-29', name: 'Aïd Al-Adha (J3)', nameAr: 'عيد الأضحى (يوم 3)' },
        { date: '2025-03-30', name: 'Aïd Al-Fitr', nameAr: 'عيد الفطر' },
        { date: '2025-06-07', name: 'Aïd Al-Adha', nameAr: 'عيد الأضحى' },
    ],
    AED: [ // 🇦🇪 Émirats
        { date: '01-01', name: 'Nouvel An', nameAr: 'رأس السنة' },
        { date: '12-01', name: 'Commémoration', nameAr: 'يوم الشهيد' },
        { date: '12-02', name: 'Fête Nationale', nameAr: 'اليوم الوطني' },
        { date: '12-03', name: 'Fête Nationale (J2)', nameAr: 'اليوم الوطني (يوم 2)' },
        { date: '2026-03-20', name: 'Aïd Al-Fitr', nameAr: 'عيد الفطر' },
        { date: '2026-05-27', name: 'Aïd Al-Adha', nameAr: 'عيد الأضحى' },
        { date: '2025-03-30', name: 'Aïd Al-Fitr', nameAr: 'عيد الفطر' },
        { date: '2025-06-07', name: 'Aïd Al-Adha', nameAr: 'عيد الأضحى' },
    ],
};

// Resolve holidays for a given year
const getHolidaysForYear = (currency: string, year: number): { date: string; name: string }[] => {
    const list = HOLIDAYS_BY_CURRENCY[currency] || HOLIDAYS_BY_CURRENCY['MAD'];
    const result: { date: string; name: string }[] = [];
    for (const h of list) {
        if (h.date.includes('-') && h.date.length > 5) {
            // Absolute date YYYY-MM-DD
            if (h.date.startsWith(String(year))) result.push({ date: h.date, name: h.name });
        } else {
            // Recurring MM-DD
            result.push({ date: `${year}-${h.date}`, name: h.name });
        }
    }
    return result;
};

const COUNTRY_LABEL: Record<string, string> = {
    MAD: 'Maroc', DZD: 'Algérie', TND: 'Tunisie', EUR: 'France', TRY: 'Türkiye', SAR: 'KSA', AED: 'UAE',
    QAR: 'Qatar', KWD: 'Kuwait', BHD: 'Bahrain', OMR: 'Oman', ZAR: 'Afr.Sud', XOF: 'UEMOA', XAF: 'CEMAC', USD: 'USA',
};

interface AgendaModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    lang: 'fr' | 'ar';
}

const TRANSLATIONS = {
    fr: {
        title: 'Agenda du Mois',
        close: 'Fermer',
        prev: 'Mois Précédent',
        next: 'Mois Suivant',
        workingDay: 'Jour Ouvrable',
        holiday: 'Jour Férié',
        exceptionalWork: 'Travail Exceptionnel',
        save: 'Enregistrer Exception',
        remove: 'Supprimer',
        notePlaceholder: 'Nom de l\'exception (ex: Aïd, Panne...)',
        days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
        months: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
        details: 'Détails du jour',
        selectPrompt: 'Cliquez sur un jour pour le configurer.\n\nDouble-clic = basculer rapidement.',
        selectedDate: 'Date sélectionnée',
        status: 'Statut de production',
        work: 'Travail',
        off: 'Férié / Repos',
        note: 'Note / Raison',
        reset: 'Rétablir par défaut',
        workingHours: 'Horaires de travail',
        summary: 'Résumé du mois',
        workDays: 'Jours ouvrés',
        offDays: 'Jours de repos',
        exceptions: 'Exceptions',
        quickToggle: 'Clic rapide: basculer le statut',
    },
    ar: {
        title: 'أجندة الشهر',
        close: 'إغلاق',
        prev: 'الشهر السابق',
        next: 'الشهر التالي',
        workingDay: 'يوم عمل',
        holiday: 'يوم عطلة',
        exceptionalWork: 'عمل استثنائي',
        save: 'حفظ',
        remove: 'حذف',
        notePlaceholder: 'اسم العطلة أو السبب...',
        days: ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
        months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
        details: 'تفاصيل اليوم',
        selectPrompt: 'انقر على يوم لإعداده.',
        selectedDate: 'اليوم المحدد',
        status: 'حالة اليوم',
        work: 'عمل',
        off: 'عطلة / توقف',
        note: 'ملاحظة / السبب',
        reset: 'إعادة للحالة الافتراضية',
        workingHours: 'ساعات العمل',
        summary: 'ملخص الشهر',
        workDays: 'أيام العمل',
        offDays: 'أيام الراحة',
        exceptions: 'استثناءات',
        quickToggle: 'نقرة سريعة: تبديل الحالة',
    }
};

export default function AgendaModal({ isOpen, onClose, settings, setSettings, lang }: AgendaModalProps) {
    if (!isOpen) return null;
    const t = TRANSLATIONS[lang];

    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [isWorking, setIsWorking] = useState(false);

    const currency = settings.currency || 'MAD';
    const countryLabel = COUNTRY_LABEL[currency] || currency;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstDay = new Date(year, month, 1).getDay() - 1;
    if (firstDay === -1) firstDay = 6;

    const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    // Build a map of national holidays for this year (date -> name)
    const nationalHolidayMap = (() => {
        const map: Record<string, string> = {};
        const holidays = getHolidaysForYear(currency, year);
        for (const h of holidays) map[h.date] = h.name;
        return map;
    })();

    // Helper: is a date string a default working day?
    const isDefaultWorkingDay = (dateStr: string): boolean => {
        const d = new Date(dateStr);
        let isoDay = d.getDay() === 0 ? 7 : d.getDay();
        return settings.workingDays.includes(isoDay);
    };

    // True effective status (considering exceptions AND national holidays)
    const getEffectiveWorking = (dateStr: string): boolean => {
        const ex = settings.calendarExceptions?.[dateStr];
        if (ex !== undefined) return ex.isWorking;
        // National holiday = day off by default (unless manually overridden above)
        if (nationalHolidayMap[dateStr]) return false;
        return isDefaultWorkingDay(dateStr);
    };

    const handleDayClick = (dayStr: string) => {
        setSelectedDate(dayStr);
        const existing = settings.calendarExceptions?.[dayStr];
        if (existing) {
            setNote(existing.note);
            setIsWorking(existing.isWorking);
        } else {
            setNote('');
            setIsWorking(isDefaultWorkingDay(dayStr));
        }
    };

    // Quick toggle: single click directly flips the day without opening detail panel
    const handleQuickToggle = (dayStr: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const currentlyWorking = getEffectiveWorking(dayStr);
        const defaultWorking = isDefaultWorkingDay(dayStr);
        const newWorking = !currentlyWorking;

        // If new state equals default, remove the exception
        if (newWorking === defaultWorking) {
            setSettings(prev => {
                const copy = { ...(prev.calendarExceptions || {}) };
                delete copy[dayStr];
                return { ...prev, calendarExceptions: copy };
            });
        } else {
            setSettings(prev => ({
                ...prev,
                calendarExceptions: {
                    ...(prev.calendarExceptions || {}),
                    [dayStr]: { isWorking: newWorking, note: prev.calendarExceptions?.[dayStr]?.note || '' }
                }
            }));
        }
        // Also update detail panel if this day is selected
        if (selectedDate === dayStr) setIsWorking(newWorking);
    };

    const handleSaveException = () => {
        if (!selectedDate) return;
        const defaultWorking = isDefaultWorkingDay(selectedDate);
        if (isWorking === defaultWorking && !note.trim()) {
            // Same as default, no note → remove exception
            setSettings(prev => {
                const copy = { ...(prev.calendarExceptions || {}) };
                delete copy[selectedDate];
                return { ...prev, calendarExceptions: copy };
            });
        } else {
            setSettings(prev => ({
                ...prev,
                calendarExceptions: {
                    ...(prev.calendarExceptions || {}),
                    [selectedDate]: { isWorking, note }
                }
            }));
        }
        setSelectedDate(null);
    };

    const handleRemoveException = () => {
        if (!selectedDate) return;
        setSettings(prev => {
            const copy = { ...(prev.calendarExceptions || {}) };
            delete copy[selectedDate];
            return { ...prev, calendarExceptions: copy };
        });
        setSelectedDate(null);
    };

    // Build month summary
    let workCount = 0;
    let offCount = 0;
    let exceptionCount = Object.keys(settings.calendarExceptions || {}).filter(d => d.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).length;
    for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (getEffectiveWorking(ds)) workCount++; else offCount++;
    }

    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col md:flex-row overflow-hidden max-h-[90vh]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>

                {/* Calendar Column */}
                <div className="flex-1 p-6 overflow-y-auto">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-6 h-6 text-indigo-500" />
                            <h2 className="text-xl font-black text-slate-800">{t.title}</h2>
                            <span className="text-xs font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">{countryLabel}</span>
                        </div>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                    </div>

                    {/* Working Hours Banner */}
                    <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 mb-4">
                        <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="text-sm font-bold text-indigo-700">{t.workingHours}:</span>
                        <span className="text-sm font-black text-indigo-900">{settings.workingHoursStart} → {settings.workingHoursEnd}</span>
                        <span className="ml-auto text-xs text-indigo-500 font-bold bg-indigo-100 px-2 py-0.5 rounded-full">
                            {(() => {
                                const [sh, sm] = (settings.workingHoursStart || '08:00').split(':').map(Number);
                                const [eh, em] = (settings.workingHoursEnd || '18:00').split(':').map(Number);
                                const totalMin = (eh * 60 + em) - (sh * 60 + sm) - (settings.pauses?.reduce((a, p) => a + (p.durationMin || 0), 0) || 0);
                                return `${Math.floor(totalMin / 60)}h${totalMin % 60 > 0 ? String(totalMin % 60).padStart(2, '0') : ''} eff.`;
                            })()}
                        </span>
                    </div>

                    {/* Month Nav */}
                    <div className="flex justify-between items-center mb-4 bg-slate-50 p-2 rounded-xl">
                        <button onClick={handlePrevMonth} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                        <span className="font-bold text-slate-700">{t.months[month]} {year}</span>
                        <button onClick={handleNextMonth} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><ChevronRight className="w-5 h-5" /></button>
                    </div>

                    {/* Day Headers */}
                    <div className="grid grid-cols-7 gap-1 mb-1">
                        {t.days.map((d, i) => (
                            <div key={i} className="text-center text-xs font-bold uppercase text-slate-400 py-1">{d}</div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day, i) => {
                            if (!day) return <div key={i} className="h-16 rounded-xl bg-slate-50/30" />;

                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isSelected = selectedDate === dateStr;
                            const isToday = dateStr === todayStr;
                            const exception = settings.calendarExceptions?.[dateStr];
                            const effectivelyWorking = getEffectiveWorking(dateStr);
                            const hasException = exception !== undefined;
                            const nationalHoliday = nationalHolidayMap[dateStr]; // auto holiday name

                            let bgClass = '';
                            if (nationalHoliday) {
                                // National holiday = always amber, regardless of exceptions
                                bgClass = hasException && settings.calendarExceptions?.[dateStr]?.isWorking
                                    ? 'bg-emerald-100 border-emerald-500 text-emerald-900 font-black' // Manually forced to work
                                    : 'bg-amber-50 border-amber-400 text-amber-800 hover:bg-amber-100';
                            } else if (effectivelyWorking) {
                                bgClass = hasException
                                    ? 'bg-emerald-100 border-emerald-500 text-emerald-900 shadow-md shadow-emerald-100 font-black'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400';
                            } else {
                                bgClass = hasException
                                    ? 'bg-rose-100 border-rose-500 text-rose-900 shadow-md shadow-rose-100 font-black'
                                    : 'bg-rose-50/60 border-rose-100 text-rose-400 hover:bg-rose-50 hover:border-rose-200';
                            }

                            if (isSelected) bgClass += ' ring-2 ring-indigo-500 ring-offset-1 shadow-md scale-105 z-10';
                            if (isToday) bgClass += ' ring-2 ring-amber-400 ring-offset-1';

                            // Shorten holiday name for cell display
                            const shortHolidayName = nationalHoliday
                                ? nationalHoliday.replace('Aïd', 'Aïd').replace('Al-Fitr', 'Fitr').replace('Al-Adha', 'Adha').replace('Annabawi', 'Mawlid').replace('Moharram', 'Moh.').replace('Fête du Trône', 'Trône').replace('Fête du Travail', 'Travail').replace('Fête de l\'Indépendance', 'Indép.').replace('Marche Verte', 'March.V').replace('Révolution', 'Révol.').replace('Allégeance', 'Allég.').replace('Manifeste', 'Manif.')
                                : null;

                            return (
                                <button
                                    key={i}
                                    onClick={() => handleDayClick(dateStr)}
                                    onDoubleClick={(e) => handleQuickToggle(dateStr, e)}
                                    title={nationalHoliday || (hasException ? exception?.note : '')}
                                    className={`relative h-16 rounded-xl border-2 transition-all flex flex-col items-center justify-start pt-1.5 font-bold text-sm select-none ${bgClass}`}
                                >
                                    <span className="leading-none">{day}</span>
                                    {isToday && <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[7px] font-black text-amber-500">●</span>}
                                    {/* National holiday label */}
                                    {nationalHoliday && !hasException && (
                                        <span className="text-[7px] font-bold text-amber-600 mt-0.5 px-0.5 text-center leading-tight w-full truncate">⭐ {shortHolidayName}</span>
                                    )}
                                    {/* Manual exception label */}
                                    {hasException && exception?.note && (
                                        <span className="text-[7px] font-bold mt-0.5 px-0.5 text-center leading-tight w-full truncate opacity-80">{exception.note.substring(0, 7)}</span>
                                    )}
                                    {/* Exception dot */}
                                    {hasException && (
                                        <span className={`absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ${effectivelyWorking ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Month Summary */}
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 flex flex-col items-center">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mb-1" />
                            <span className="text-xl font-black text-emerald-700">{workCount}</span>
                            <span className="text-[10px] font-bold text-emerald-600 uppercase">{t.workDays}</span>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 flex flex-col items-center">
                            <XCircle className="w-4 h-4 text-rose-500 mb-1" />
                            <span className="text-xl font-black text-rose-700">{offCount}</span>
                            <span className="text-[10px] font-bold text-rose-600 uppercase">{t.offDays}</span>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex flex-col items-center">
                            <Zap className="w-4 h-4 text-amber-500 mb-1" />
                            <span className="text-xl font-black text-amber-700">{exceptionCount}</span>
                            <span className="text-[10px] font-bold text-amber-600 uppercase">{t.exceptions}</span>
                        </div>
                    </div>

                    {/* Quick tip */}
                    <p className="text-center text-[10px] text-slate-400 mt-2 font-medium">💡 Double-clic = basculer rapidement • Clic simple = détails</p>
                </div>

                {/* Exception Details Column */}
                <div className="w-full md:w-72 bg-slate-50 p-6 flex flex-col border-t md:border-t-0 md:border-l border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Info className="w-5 h-5 text-indigo-500" />
                        {t.details}
                    </h3>

                    {!selectedDate ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 gap-3">
                            <Calendar className="w-12 h-12 opacity-20" />
                            <p className="text-sm font-medium text-slate-500">Cliquez sur un jour pour le configurer</p>
                            <p className="text-xs text-slate-400">Double-clic = basculer rapidement</p>
                        </div>
                    ) : (
                        <div className="space-y-4 flex-1 flex flex-col">
                            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-sm">
                                <span className="block text-xs uppercase font-bold text-slate-400 mb-1">{t.selectedDate}</span>
                                <span className="text-lg font-black text-indigo-700">{selectedDate}</span>
                                {selectedDate === todayStr && (
                                    <span className="block text-xs text-amber-600 font-bold mt-1">● Aujourd'hui</span>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t.status}</label>
                                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
                                    <button
                                        onClick={() => setIsWorking(true)}
                                        className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${isWorking ? 'bg-emerald-500 text-white shadow-md' : 'bg-white text-slate-500 hover:text-emerald-600'}`}
                                    >
                                        {t.work}
                                    </button>
                                    <button
                                        onClick={() => setIsWorking(false)}
                                        className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${!isWorking ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-slate-500 hover:text-rose-600'}`}
                                    >
                                        {t.off}
                                    </button>
                                </div>
                            </div>

                            {/* Show working hours if it's a working day */}
                            {isWorking && (
                                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                                    <Clock className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
                                    <span className="text-sm font-black text-indigo-700">{settings.workingHoursStart} → {settings.workingHoursEnd}</span>
                                    {settings.pauses && settings.pauses.length > 0 && (
                                        <div className="mt-1 space-y-0.5">
                                            {settings.pauses.map(p => (
                                                <p key={p.id} className="text-[10px] text-indigo-500 font-medium">{p.name}: {p.start} → {p.end}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex-1">
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t.note}</label>
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder={t.notePlaceholder}
                                    className="w-full bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-sm font-bold text-slate-700 resize-none h-20"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <button onClick={handleSaveException} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors shadow-md shadow-indigo-600/20 active:scale-95 text-sm">
                                    {t.save}
                                </button>
                                {settings.calendarExceptions?.[selectedDate] && (
                                    <button onClick={handleRemoveException} className="w-full bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 font-bold py-3 rounded-xl transition-colors active:scale-95 text-sm">
                                        {t.reset}
                                    </button>
                                )}
                                <button onClick={() => setSelectedDate(null)} className="w-full text-slate-400 hover:text-slate-600 text-xs font-bold py-1 transition-colors">
                                    Annuler
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
