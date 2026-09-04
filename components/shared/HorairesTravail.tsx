import React, { useState } from 'react';
import { Plus, Trash2, MoreVertical, Clock, X, AlertTriangle } from 'lucide-react';
import type { AppSettings, Pause } from '../../types';
import { creneauxDuJour } from '../../lib/horaires';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import SheetModal from './SheetModal';
import { pickT } from '../../lib/i18n';
import { TRANSLATIONS } from '../configTranslations';

/**
 * Éditeur UNIQUE des horaires de travail (heures, jours ouvrables, pauses),
 * monté uniquement dans la page Admin (CompanyParamsSection).
 *
 * POURQUOI un composant partagé : ces réglages étaient édités à l'identique
 * dans deux pages (Configuration et Admin), avec deux brouillons locaux
 * différents — la sauvegarde de l'un écrasait les changements de l'autre.
 * Un seul éditeur, monté à un seul endroit, supprime le doublon à la racine.
 *
 * Le composant travaille sur un `draft: AppSettings` fourni par l'appelant
 * (via `onChange`, façon `setDraft`) : il ne sauvegarde rien lui-même, la
 * page hôte garde la responsabilité du brouillon et de l'enregistrement.
 */

interface HorairesTravailProps {
    draft: AppSettings;
    onChange: (updater: (prev: AppSettings) => AppSettings) => void;
}

function makePause(): Pause {
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: 'Nouvelle Pause', start: '12:00', end: '13:00', durationMin: 60 };
}

function recomputeDuration(p: Pause): Pause {
    if (!p.start || !p.end) return p;
    const [sh, sm] = p.start.split(':').map(Number);
    const [eh, em] = p.end.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;
    return { ...p, durationMin: diff };
}

export default function HorairesTravail({ draft, onChange }: HorairesTravailProps) {
    const { lang } = useLang();
    const t = pickT(TRANSLATIONS, lang);
    const [dayModalFor, setDayModalFor] = useState<number | null>(null);

    const setDraft = onChange;

    const handleGlobalTimeChange = (field: 'workingHoursStart' | 'workingHoursEnd', value: string) => {
        setDraft(prev => ({ ...prev, [field]: value }));
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
        setDraft(prev => ({ ...prev, pauses: [...(prev.pauses || []), makePause()] }));
    };
    const updatePause = (id: string, field: 'start' | 'end' | 'name', value: string) => {
        setDraft(prev => ({
            ...prev,
            pauses: (prev.pauses || []).map(p => (p.id === id ? recomputeDuration({ ...p, [field]: value }) : p)),
        }));
    };
    const removePause = (id: string) => {
        setDraft(prev => ({ ...prev, pauses: (prev.pauses || []).filter(p => p.id !== id) }));
    };

    // --- Exception d'un jour précis (dayScheduleOverrides) ---
    const getOverride = (day: number) => draft.dayScheduleOverrides?.[day];

    const setOverride = (day: number, patch: Partial<{ start?: string; end?: string; pauses?: Pause[]; closed?: boolean }> | null) => {
        setDraft(prev => {
            const overrides = { ...(prev.dayScheduleOverrides || {}) };
            if (patch === null) {
                delete overrides[day];
            } else {
                overrides[day] = { ...(overrides[day] || {}), ...patch };
            }
            return { ...prev, dayScheduleOverrides: overrides };
        });
    };

    const addOverridePause = (day: number) => {
        const cur = getOverride(day)?.pauses || [];
        setOverride(day, { pauses: [...cur, makePause()] });
    };
    const updateOverridePause = (day: number, id: string, field: 'start' | 'end' | 'name', value: string) => {
        const cur = getOverride(day)?.pauses || [];
        setOverride(day, { pauses: cur.map(p => (p.id === id ? recomputeDuration({ ...p, [field]: value }) : p)) });
    };
    const removeOverridePause = (day: number, id: string) => {
        const cur = getOverride(day)?.pauses || [];
        setOverride(day, { pauses: cur.filter(p => p.id !== id) });
    };

    const dayModalOverride = dayModalFor != null ? getOverride(dayModalFor) : undefined;

    return (
        <div className="space-y-6">
            {/* Heures globales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.workingHoursStart}</label>
                    <input type="time" value={draft.workingHoursStart} onChange={(e) => handleGlobalTimeChange('workingHoursStart', e.target.value)} className="w-full min-h-[44px] bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-lg text-slate-700 dark:text-dk-text-soft transition-all text-center" />
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.workingHoursEnd}</label>
                    <input type="time" value={draft.workingHoursEnd} onChange={(e) => handleGlobalTimeChange('workingHoursEnd', e.target.value)} className="w-full min-h-[44px] bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-lg text-slate-700 dark:text-dk-text-soft transition-all text-center" />
                </div>
            </div>

            {/* Jours ouvrables, avec bouton "..." de personnalisation par jour */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500 dark:text-dk-muted">
                        {t.workingDays}
                        <span className="text-[10px] text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 px-2 py-0.5 rounded-full border border-indigo-100 font-black tracking-widest">{(draft.workingDays || []).length}/7</span>
                    </label>
                    <button type="button" onClick={() => setDraft(prev => ({ ...prev, workingDays: [1, 2, 3, 4, 5, 6, 7] }))} className="text-xs font-bold text-slate-500 hover:text-indigo-600 dark:text-dk-accent-text transition-colors uppercase pr-2 border-r border-slate-200 dark:border-dk-border hidden sm:block">
                        {tx(lang, { fr: 'Tous', ar: 'الكل', en: 'All', es: 'Todos', pt: 'Todos', tr: 'Tümü' })}
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7].map((dayCode, idx) => {
                        const isActive = (draft.workingDays || []).includes(dayCode);
                        const hasOverride = !!getOverride(dayCode);
                        return (
                            <div key={dayCode} className={`flex items-center gap-1 rounded-lg border-2 transition-all ${isActive ? 'border-indigo-600 bg-indigo-600 dark:bg-dk-accent' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface'}`}>
                                <button
                                    type="button"
                                    onClick={() => toggleWorkingDay(dayCode)}
                                    className={`flex-1 min-h-[44px] px-2 rounded-l-md font-bold text-xs sm:text-sm transition-all text-left ${isActive ? 'text-white' : 'text-slate-400 hover:text-indigo-600 dark:text-dk-accent-text'}`}
                                >
                                    {t.days[idx]}
                                    {hasOverride && (
                                        <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle ${isActive ? 'bg-white' : 'bg-indigo-500'}`} title={tx(lang, { fr: 'Horaire personnalisé', ar: 'توقيت مخصص', en: 'Custom schedule', es: 'Horario personalizado', pt: 'Horário personalizado', tr: 'Özel çalışma saati' })} />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDayModalFor(dayCode)}
                                    title={tx(lang, { fr: 'Personnaliser ce jour', ar: 'تخصيص هذا اليوم', en: 'Customize this day', es: 'Personalizar este día', pt: 'Personalizar este dia', tr: 'Bu günü özelleştir' })}
                                    className={`shrink-0 w-11 min-h-[44px] flex items-center justify-center rounded-r-md ${isActive ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-indigo-600 dark:text-dk-accent-text'}`}
                                >
                                    <MoreVertical className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Pauses globales */}
            <div className="pt-6 border-t border-slate-100 dark:border-dk-border">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted">{t.pauses}</label>
                        <span className="text-[10px] text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Ces temps seront déduits des temps de présence.', ar: 'ستُخصم هذه الأوقات من أوقات الحضور.', en: 'These times will be deducted from presence times.', es: 'Estos tiempos se deducirán de los tiempos de presencia.', pt: 'Estes tempos serão deduzidos dos tempos de presença.', tr: 'Bu süreler bulunma sürelerinden düşülecektir.' })}</span>
                    </div>
                    <button type="button" onClick={addPause} className="text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text flex items-center gap-1 hover:text-indigo-700 dark:text-dk-accent-text hover:bg-indigo-100 px-3 py-2 min-h-[44px] rounded-lg transition-colors border border-indigo-100">
                        <Plus className="w-3.5 h-3.5" /> {t.addPause}
                    </button>
                </div>

                <PauseList
                    lang={lang}
                    t={t}
                    pauses={draft.pauses || []}
                    onUpdate={updatePause}
                    onRemove={removePause}
                    dayStart={draft.workingHoursStart}
                    dayEnd={draft.workingHoursEnd}
                />
            </div>

            {dayModalFor != null && (
                <SheetModal
                    onClose={() => setDayModalFor(null)}
                    title={`${t.days[dayModalFor - 1]} — ${tx(lang, { fr: 'horaire personnalisé', ar: 'توقيت مخصص', en: 'custom schedule', es: 'horario personalizado', pt: 'horário personalizado', tr: 'özel çalışma saati' })}`}
                    icon={<Clock className="w-4 h-4 text-indigo-600 dark:text-dk-accent-text" />}
                    size="md"
                    footer={(
                        <>
                            {dayModalOverride && (
                                <button
                                    type="button"
                                    onClick={() => { setOverride(dayModalFor, null); setDayModalFor(null); }}
                                    className="px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                                >
                                    {tx(lang, { fr: 'Revenir à l\'horaire général', ar: 'الرجوع إلى التوقيت العام', en: 'Revert to general schedule', es: 'Volver al horario general', pt: 'Voltar ao horário geral', tr: 'Genel çalışma saatine dön' })}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setDayModalFor(null)}
                                className="px-5 py-2.5 min-h-[44px] rounded-xl text-sm font-bold bg-indigo-600 dark:bg-dk-accent text-white hover:bg-indigo-700 transition-colors"
                            >
                                {tx(lang, { fr: 'Terminé', ar: 'تم', en: 'Done', es: 'Hecho', pt: 'Concluído', tr: 'Tamam' })}
                            </button>
                        </>
                    )}
                >
                    <DayOverrideEditor
                        lang={lang}
                        t={t}
                        globalStart={draft.workingHoursStart}
                        globalEnd={draft.workingHoursEnd}
                        globalPauses={draft.pauses || []}
                        override={dayModalOverride}
                        onSetClosed={(closed) => setOverride(dayModalFor, { closed })}
                        onSetStart={(v) => setOverride(dayModalFor, { start: v })}
                        onSetEnd={(v) => setOverride(dayModalFor, { end: v })}
                        onAddPause={() => addOverridePause(dayModalFor)}
                        onUpdatePause={(id, field, v) => updateOverridePause(dayModalFor, id, field, v)}
                        onRemovePause={(id) => removeOverridePause(dayModalFor, id)}
                    />
                </SheetModal>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Liste de pauses (réutilisée pour le global et pour un jour)          */
/* ------------------------------------------------------------------ */

/** "HH:MM" -> minutes depuis minuit (NaN si vide/illisible). */
function hhmmToMin(v: string | undefined | null): number {
    if (!v) return NaN;
    const m = /^(\d{1,2}):(\d{2})/.exec(v);
    if (!m) return NaN;
    return Number(m[1]) * 60 + Number(m[2]);
}

function minToHHMM(m: number): string {
    return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
}

/** Durée lisible : 45 -> "45 m", 735 -> "12h15" (735 m ne saute pas aux yeux). */
function dureeLisible(min: number | undefined): string {
    const v = Number(min) || 0;
    if (v < 60) return `${v} m`;
    const h = Math.floor(v / 60);
    const r = v % 60;
    return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`;
}

interface PauseAnomalie {
    niveau: 'erreur' | 'alerte';
    message: string;
    /** Heure de fin proposée en un tap (confusion AM/PM sur téléphone). */
    correctionFin?: string;
}

/**
 * Contrôle d'une pause face à l'horaire de l'atelier.
 *
 * POURQUOI : le sélecteur d'heure d'iOS est en AM/PM — saisir « 9:15 PM » au
 * lieu de « 9:15 AM » donnait une pause de 735 min (12h15) acceptée sans un
 * mot, qui avalait toute la journée dans la grille de Suivi. Rien n'avertissait
 * l'utilisateur : la case affichait juste « 735 m ».
 */
function analyserPause(pause: Pause, autres: Pause[], dayStartMin: number, dayEndMin: number, lang: string): PauseAnomalie | null {
    const s = hhmmToMin(pause.start);
    const e = hhmmToMin(pause.end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;

    if (e <= s) {
        return {
            niveau: 'erreur',
            message: tx(lang, { fr: "L'heure de fin est avant l'heure de début.", ar: 'وقت النهاية قبل وقت البداية.', en: 'End time is before start time.', es: 'La hora de fin es anterior a la de inicio.', pt: 'A hora de fim é anterior à de início.', tr: 'Bitiş saati başlangıçtan önce.' }),
        };
    }

    const horsAtelier = Number.isFinite(dayStartMin) && Number.isFinite(dayEndMin) && (s < dayStartMin || e > dayEndMin);
    if (horsAtelier) {
        /* Confusion AM/PM : 21:15 alors que 09:15 tient dans la journée. */
        const versMatin = e - 12 * 60;
        const correctionFin = e > dayEndMin && versMatin > s && versMatin <= dayEndMin ? minToHHMM(versMatin) : undefined;
        return {
            niveau: 'erreur',
            message: tx(lang, { fr: `Hors horaire de l'atelier (${minToHHMM(dayStartMin)} → ${minToHHMM(dayEndMin)}).`, ar: `خارج توقيت الورشة (${minToHHMM(dayStartMin)} → ${minToHHMM(dayEndMin)}).`, en: `Outside workshop hours (${minToHHMM(dayStartMin)} → ${minToHHMM(dayEndMin)}).`, es: `Fuera del horario del taller (${minToHHMM(dayStartMin)} → ${minToHHMM(dayEndMin)}).`, pt: `Fora do horário da oficina (${minToHHMM(dayStartMin)} → ${minToHHMM(dayEndMin)}).`, tr: `Atölye mesaisi dışında (${minToHHMM(dayStartMin)} → ${minToHHMM(dayEndMin)}).` }),
            correctionFin,
        };
    }

    const chevauche = autres.some(o => {
        const os = hhmmToMin(o.start);
        const oe = hhmmToMin(o.end);
        return Number.isFinite(os) && Number.isFinite(oe) && oe > os && Math.min(e, oe) > Math.max(s, os);
    });
    if (chevauche) {
        return {
            niveau: 'alerte',
            message: tx(lang, { fr: 'Chevauche une autre pause.', ar: 'تتداخل مع استراحة أخرى.', en: 'Overlaps another break.', es: 'Se solapa con otra pausa.', pt: 'Sobrepõe outra pausa.', tr: 'Başka bir molayla çakışıyor.' }),
        };
    }

    if (e - s >= 240) {
        return {
            niveau: 'alerte',
            message: tx(lang, { fr: 'Pause de plus de 4 h — vérifiez AM / PM.', ar: 'استراحة تتجاوز 4 ساعات — تحقّق من AM / PM.', en: 'Break longer than 4 h — check AM / PM.', es: 'Pausa de más de 4 h — verifique AM / PM.', pt: 'Pausa de mais de 4 h — verifique AM / PM.', tr: '4 saatten uzun mola — AM / PM kontrol edin.' }),
        };
    }

    return null;
}

function PauseList({ lang, t, pauses, onUpdate, onRemove, dayStart, dayEnd }: {
    lang: string;
    t: any;
    pauses: Pause[];
    onUpdate: (id: string, field: 'start' | 'end' | 'name', value: string) => void;
    onRemove: (id: string) => void;
    /** Bornes de la journée d'atelier, pour signaler une pause qui en sort. */
    dayStart: string;
    dayEnd: string;
}) {
    const dayStartMin = hhmmToMin(dayStart);
    const dayEndMin = hhmmToMin(dayEnd);

    return (
        <div className="space-y-3">
            {pauses.map((pause, index) => {
                const anomalie = analyserPause(pause, pauses.filter(p => p.id !== pause.id), dayStartMin, dayEndMin, lang);
                const enErreur = anomalie?.niveau === 'erreur';
                return (
                <div key={pause.id} className={`flex flex-col gap-3 p-3 rounded-xl border transition-colors ${
                    enErreur
                        ? 'bg-rose-50/70 dark:bg-rose-900/20 border-rose-300 dark:border-rose-800'
                        : anomalie
                            ? 'bg-amber-50/70 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800'
                            : 'bg-slate-50 dark:bg-dk-bg border-slate-200 dark:border-dk-border hover:border-indigo-200'
                }`}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 dark:text-dk-muted">{index + 1}.</span>
                        <button type="button" onClick={() => onRemove(pause.id)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 border border-transparent hover:border-rose-100 rounded-lg transition-colors" title={tx(lang, { fr: 'Supprimer cette pause', ar: 'حذف هذا الاستراحة', en: 'Delete this break', es: 'Eliminar esta pausa', pt: 'Eliminar esta pausa', tr: 'Bu molayı sil' })}>
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="col-span-2 sm:col-span-1">
                            <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseName}</span>
                            <input type="text" value={pause.name || ''} onChange={(e) => onUpdate(pause.id, 'name', e.target.value)} className="w-full min-h-[44px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft placeholder:text-slate-300" placeholder={tx(lang, { fr: 'Ex: Déjeuner', ar: 'مثال: غداء', en: 'Ex: Lunch', es: 'Ej: Almuerzo', pt: 'Ex: Almoço', tr: 'Örn: Öğle yemeği' })} />
                        </div>
                        <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseStart}</span>
                            <input type="time" value={pause.start} onChange={(e) => onUpdate(pause.id, 'start', e.target.value)} className="w-full min-h-[44px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft text-center" />
                        </div>
                        <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseEnd}</span>
                            <input type="time" value={pause.end} onChange={(e) => onUpdate(pause.id, 'end', e.target.value)} className="w-full min-h-[44px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft text-center" />
                        </div>
                        <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseDuration}</span>
                            <div className={`w-full min-h-[44px] flex items-center justify-center border rounded-lg px-2 py-1.5 text-center text-sm font-bold select-none ${
                                enErreur
                                    ? 'bg-rose-100 dark:bg-rose-900/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                                    : 'bg-indigo-50 dark:bg-dk-accent/20 border-indigo-100 text-indigo-700 dark:text-dk-accent-text'
                            }`}>
                                {dureeLisible(pause.durationMin)}
                            </div>
                        </div>
                    </div>

                    {anomalie && (
                        <div className={`flex flex-wrap items-center gap-2 text-[11px] font-bold ${enErreur ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{anomalie.message}</span>
                            {anomalie.correctionFin && (
                                <button
                                    type="button"
                                    onClick={() => onUpdate(pause.id, 'end', anomalie.correctionFin!)}
                                    className="px-2 py-1 rounded-md bg-white dark:bg-dk-surface border border-current hover:opacity-80 transition-opacity"
                                >
                                    {tx(lang, { fr: `Corriger → ${anomalie.correctionFin}`, ar: `تصحيح ← ${anomalie.correctionFin}`, en: `Fix → ${anomalie.correctionFin}`, es: `Corregir → ${anomalie.correctionFin}`, pt: `Corrigir → ${anomalie.correctionFin}`, tr: `Düzelt → ${anomalie.correctionFin}` })}
                                </button>
                            )}
                        </div>
                    )}
                </div>
                );
            })}
            {pauses.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-dk-muted italic text-center py-4 bg-slate-50 dark:bg-dk-bg rounded-lg border border-dashed border-slate-200 dark:border-dk-border">
                    {tx(lang, { fr: 'Aucune pause définie pour le moment.', ar: 'لا توجد أي استراحة معرفة حالياً.', en: 'No break defined at the moment.', es: 'Ninguna pausa definida por el momento.', pt: 'Nenhuma pausa definida de momento.', tr: 'Henüz mola tanımlanmamış.' })}
                </p>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Personnalisation d'UN jour (bouton "...")                            */
/* ------------------------------------------------------------------ */

function DayOverrideEditor({
    lang, t, globalStart, globalEnd, globalPauses, override,
    onSetClosed, onSetStart, onSetEnd, onAddPause, onUpdatePause, onRemovePause,
}: {
    lang: string;
    t: any;
    globalStart: string;
    globalEnd: string;
    globalPauses: Pause[];
    override?: { start?: string; end?: string; pauses?: Pause[]; closed?: boolean };
    onSetClosed: (closed: boolean) => void;
    onSetStart: (v: string) => void;
    onSetEnd: (v: string) => void;
    onAddPause: () => void;
    onUpdatePause: (id: string, field: 'start' | 'end' | 'name', value: string) => void;
    onRemovePause: (id: string) => void;
}) {
    const closed = override?.closed === true;
    const pauses = override?.pauses ?? globalPauses;
    const usesOwnPauses = override?.pauses != null;
    const dayStart = override?.start ?? globalStart;
    const dayEnd = override?.end ?? globalEnd;

    /* Aperçu calculé par la MÊME fonction que la grille de Suivi : ce que
       l'atelier verra vraiment. Une pause aberrante (AM/PM) se voit ici tout
       de suite — le total tombe à 2 h au lieu de 9 h 45. */
    const apercu = React.useMemo(() => {
        const faux = { workingHoursStart: dayStart, workingHoursEnd: dayEnd, pauses } as unknown as AppSettings;
        const creneaux = creneauxDuJour(faux);
        const total = creneaux.reduce((acc, c) => acc + c.duration, 0);
        return { nb: creneaux.length, total };
    }, [dayStart, dayEnd, pauses]);

    return (
        <div className="space-y-5">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg cursor-pointer min-h-[44px]">
                <input type="checkbox" checked={closed} onChange={(e) => onSetClosed(e.target.checked)} className="w-5 h-5 accent-rose-600" />
                <span className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">
                    {tx(lang, { fr: 'Jour non travaillé', ar: 'يوم غير عمل', en: 'Non-working day', es: 'Día no laborable', pt: 'Dia não útil', tr: 'Çalışılmayan gün' })}
                </span>
            </label>

            {!closed && (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.workingHoursStart}</span>
                            <input type="time" value={override?.start ?? globalStart} onChange={(e) => onSetStart(e.target.value)} className="w-full min-h-[44px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-center" />
                        </div>
                        <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.workingHoursEnd}</span>
                            <input type="time" value={override?.end ?? globalEnd} onChange={(e) => onSetEnd(e.target.value)} className="w-full min-h-[44px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-center" />
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-indigo-50 dark:bg-dk-accent/20 border border-indigo-100 dark:border-dk-border">
                        <span className="text-[11px] font-bold text-indigo-700 dark:text-dk-accent-text">
                            {tx(lang, { fr: 'Production nette de ce jour', ar: 'الإنتاج الصافي لهذا اليوم', en: 'Net production this day', es: 'Producción neta de este día', pt: 'Produção líquida deste dia', tr: 'Bu günün net üretimi' })}
                        </span>
                        <span className="text-sm font-black tabular-nums text-indigo-800 dark:text-dk-accent-text shrink-0">
                            {dureeLisible(apercu.total)} · {apercu.nb} {tx(lang, { fr: 'créneaux', ar: 'فترات', en: 'slots', es: 'tramos', pt: 'intervalos', tr: 'dilim' })}
                        </span>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase text-slate-500 dark:text-dk-muted">{t.pauses}</span>
                            <button type="button" onClick={onAddPause} className="text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-dk-accent-text flex items-center gap-1 px-3 py-2 min-h-[44px] rounded-lg border border-indigo-100">
                                <Plus className="w-3.5 h-3.5" /> {t.addPause}
                            </button>
                        </div>
                        {!usesOwnPauses && (
                            <p className="text-[11px] text-slate-400 dark:text-dk-muted italic mb-2">
                                {tx(lang, { fr: 'Pauses générales affichées ici. Ajouter une pause pour ce jour crée sa propre liste.', ar: 'الاستراحات العامة معروضة هنا. إضافة استراحة لهذا اليوم تنشئ قائمته الخاصة.', en: 'General breaks shown here. Adding a break for this day creates its own list.', es: 'Pausas generales mostradas aquí. Añadir una pausa para este día crea su propia lista.', pt: 'Pausas gerais mostradas aqui. Adicionar uma pausa para este dia cria a sua própria lista.', tr: 'Genel molalar burada gösterilir. Bu gün için mola eklemek kendi listesini oluşturur.' })}
                            </p>
                        )}
                        <PauseList
                            lang={lang}
                            t={t}
                            pauses={pauses}
                            onUpdate={onUpdatePause}
                            onRemove={onRemovePause}
                            dayStart={override?.start ?? globalStart}
                            dayEnd={override?.end ?? globalEnd}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
