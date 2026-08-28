import React, { useState, useEffect } from 'react';
import { Coins, Clock, Calendar, Plus, Trash2, Save, Loader2, Users, Shield, Building, CheckCircle } from 'lucide-react';
import { AppSettings, Machine } from '../../types';
import { tx, pickT } from '../../lib/i18n';
import { TRANSLATIONS, CURRENCIES } from '../configTranslations';

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

type Lang = 'fr' | 'ar' | 'en' | 'es' | 'pt' | 'tr';

// Hook partage : brouillon local + sauvegarde explicite (POST /api/settings),
// identique au mecanisme de la page Configuration.
function useSettingsDraft(settings, setSettings) {
    const [draft, setDraftState] = useState(settings);
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showToast, setShowToast] = useState(false);
    useEffect(() => { if (!isDirty) setDraftState(settings); }, [settings, isDirty]);
    const setDraft = (updater) => {
        setDraftState(prev => (typeof updater === 'function' ? updater(prev) : updater));
        setIsDirty(true);
    };
    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (!IS_STATIC) {
                const res = await fetch('/api/settings', {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ global_settings: draft }),
                });
                if (!res.ok) throw new Error('save failed');
            }
            setSettings(draft);
            setIsDirty(false);
            setShowToast(true);
            setTimeout(() => setShowToast(false), 2500);
        } catch (e) {
            console.error('Erreur sauvegarde settings:', e);
        } finally {
            setIsSaving(false);
        }
    };
    return { draft, setDraft, isDirty, isSaving, showToast, handleSave };
}

function SaveBar({ lang, isDirty, isSaving, showToast, onSave }) {
    const t = pickT(TRANSLATIONS, lang);
    return (
        <div className="flex items-center justify-end gap-3 pt-2">
            {showToast && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="w-4 h-4" /> {t.saved}
                </span>
            )}
            {isDirty && !isSaving && (
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    {tx(lang, { fr: 'Modifications non enregistrees', ar: 'تعديلات غير محفوظة', en: 'Unsaved changes', es: 'Cambios sin guardar', pt: 'Alteracoes nao guardadas', tr: 'Kaydedilmemis degisiklikler' })}
                </span>
            )}
            <button onClick={onSave} disabled={isSaving || !isDirty}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-sm active:scale-95">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{isSaving ? '...' : t.save}</span>
            </button>
        </div>
    );
}

// Parametres de l'entreprise (devise, cout minute, horaires)
export function CompanyParamsSection({ settings, setSettings, lang }) {
    const t = pickT(TRANSLATIONS, lang);
    const { draft, setDraft, isDirty, isSaving, showToast, handleSave } = useSettingsDraft(settings, setSettings);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        setDraft(prev => ({ ...prev, [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value }));
    };
    const toggleWorkingDay = (dayIndex) => {
        setDraft(prev => {
            const current = prev.workingDays || [];
            const days = current.includes(dayIndex) ? current.filter(d => d !== dayIndex) : [...current, dayIndex].sort((a, b) => a - b);
            return { ...prev, workingDays: days };
        });
    };
    const addPause = () => {
        setDraft(prev => ({ ...prev, pauses: [...(prev.pauses || []), { id: Date.now().toString(), name: 'Nouvelle Pause', start: '12:00', end: '13:00', durationMin: 60 }] }));
    };
    const updatePause = (id, field, value) => {
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
    const removePause = (id) => {
        setDraft(prev => ({ ...prev, pauses: (prev.pauses || []).filter(p => p.id !== id) }));
    };

    return (
        <div className="space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            {/* Identite legale de l'emetteur. Une facture marocaine qui n'en
                porte pas les mentions (ICE, IF, RC, patente) est refusee par la
                comptabilite du client : elle ne peut pas etre deduite. Ces
                champs sont donc saisis une fois ici, et recopies sur chaque
                facture au moment ou elle est etablie. */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm p-5 sm:p-6 space-y-4">
                <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-dk-text">
                        {tx(lang, { fr: 'Identite de facturation', ar: 'هوية الفوترة', en: 'Invoicing identity', es: 'Identidad de facturacion', pt: 'Identidade de faturacao', tr: 'Fatura kimligi' })}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-dk-muted mt-0.5">
                        {tx(lang, { fr: 'Ces mentions figurent en tete de chaque facture. Sans elles, le client ne peut pas la deduire.', ar: 'هاد المعلومات كتبان فراس كل فاتورة. بلاها الزبون ما يقدرش يخصمها.', en: 'These details head every invoice. Without them the customer cannot deduct it.', es: 'Estos datos encabezan cada factura.', pt: 'Estes dados encabecam cada fatura.', tr: 'Bu bilgiler her faturanin basinda yer alir.' })}
                    </p>
                </div>
                {(() => {
                    const cp = draft.companyProfile || ({} as any);
                    const majCp = (champ: string, valeur: any) => setDraft(prev => ({
                        ...prev,
                        companyProfile: { ...(prev.companyProfile || {} as any), [champ]: valeur },
                    }));
                    const champTexte = (champ: string, libelle: string, placeholder = '') => (
                        <div>
                            <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-dk-muted mb-1">{libelle}</label>
                            <input
                                value={(cp as any)[champ] ?? ''}
                                onChange={e => majCp(champ, e.target.value)}
                                placeholder={placeholder}
                                className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-800 dark:text-dk-text transition-all"
                            />
                        </div>
                    );
                    const champNombre = (champ: string, libelle: string, suffixe = '') => (
                        <div>
                            <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-dk-muted mb-1">{libelle}{suffixe ? ` (${suffixe})` : ''}</label>
                            <input
                                type="number"
                                value={(cp as any)[champ] ?? ''}
                                onChange={e => majCp(champ, e.target.value === '' ? undefined : Number(e.target.value))}
                                className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-800 dark:text-dk-text transition-all"
                            />
                        </div>
                    );
                    return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {champTexte('legalName', tx(lang, { fr: 'Raison sociale', ar: 'التسمية القانونية', en: 'Legal name', es: 'Razon social', pt: 'Denominacao social', tr: 'Unvan' }))}
                            {champTexte('formeJuridique', tx(lang, { fr: 'Forme juridique', ar: 'الشكل القانوني', en: 'Legal form', es: 'Forma juridica', pt: 'Forma juridica', tr: 'Hukuki sekil' }), 'SARL, SARL AU, SA…')}
                            {champNombre('capitalSocial', tx(lang, { fr: 'Capital social', ar: 'رأس المال', en: 'Share capital', es: 'Capital social', pt: 'Capital social', tr: 'Sermaye' }), draft.currency)}
                            {champTexte('ice', 'ICE')}
                            {champTexte('identifiantFiscal', tx(lang, { fr: 'Identifiant fiscal (IF)', ar: 'التعريف الضريبي', en: 'Tax ID (IF)', es: 'Identificacion fiscal', pt: 'Identificacao fiscal', tr: 'Vergi no' }))}
                            {champTexte('rc', tx(lang, { fr: 'Registre de commerce (RC)', ar: 'السجل التجاري', en: 'Trade register (RC)', es: 'Registro mercantil', pt: 'Registo comercial', tr: 'Ticaret sicili' }))}
                            {champTexte('rcVille', tx(lang, { fr: 'RC — ville de depot', ar: 'مدينة السجل التجاري', en: 'Trade register city', es: 'Ciudad del registro', pt: 'Cidade do registo', tr: 'Sicil sehri' }))}
                            {champTexte('patente', tx(lang, { fr: 'Taxe professionnelle (patente)', ar: 'الضريبة المهنية', en: 'Business tax', es: 'Impuesto profesional', pt: 'Imposto profissional', tr: 'Meslek vergisi' }))}
                            {champTexte('cnss', 'CNSS')}
                            {champTexte('banque', tx(lang, { fr: 'Banque', ar: 'البنك', en: 'Bank', es: 'Banco', pt: 'Banco', tr: 'Banka' }))}
                            {champTexte('rib', 'RIB')}
                            {champNombre('delaiPaiementJours', tx(lang, { fr: 'Delai de paiement', ar: 'أجل الأداء', en: 'Payment term', es: 'Plazo de pago', pt: 'Prazo de pagamento', tr: 'Odeme vadesi' }), tx(lang, { fr: 'jours', ar: 'يوم', en: 'days', es: 'dias', pt: 'dias', tr: 'gun' }))}
                            {champNombre('penaliteRetard', tx(lang, { fr: 'Penalite de retard', ar: 'غرامة التأخير', en: 'Late penalty', es: 'Penalizacion por retraso', pt: 'Penalizacao por atraso', tr: 'Gecikme cezasi' }), '%')}
                        </div>
                    );
                })()}
            </div>

            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm p-5 sm:p-6 space-y-6">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.currency}</label>
                                <select name="currency" value={draft.currency} onChange={handleChange} className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-slate-700 dark:text-dk-text-soft transition-all cursor-pointer">
                                    {CURRENCIES.map(c => (
                                        <option key={c.code} value={c.code}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.costMinute}</label>
                                <div className="relative">
                                    <input type="number" step="0.01" name="costMinute" value={draft.costMinute} onChange={handleChange} className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl pl-11 pr-4 py-3 outline-none focus:border-indigo-500 font-black text-lg text-slate-800 dark:text-dk-text transition-all" />
                                    <Coins className="w-5 h-5 text-slate-400 dark:text-dk-muted absolute left-4 top-3.5" />
                                </div>
                            </div>
            </div>
            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm p-5 sm:p-6 space-y-6">
                        {/* Time Format */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.timeFormat}</label>
                            <div className="flex p-1 bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl relative overflow-hidden">
                                <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-dk-surface rounded-lg shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border transition-all duration-300 ${draft.timeFormat === '12h' ? 'left-[calc(50%+2px)]' : 'left-1'}`}></div>
                                <button onClick={() => setDraft(prev => ({ ...prev, timeFormat: '24h' }))} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors relative z-10 ${draft.timeFormat === '24h' ? 'text-indigo-700 dark:text-dk-accent-text' : 'text-slate-500 hover:text-slate-700'}`}>{tx(lang, { fr: '24 Heures', ar: '24 ساعة', en: '24 Hours', es: '24 Horas', pt: '24 Horas', tr: '24 Saat' })}</button>
                                <button onClick={() => setDraft(prev => ({ ...prev, timeFormat: '12h' }))} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors relative z-10 ${draft.timeFormat === '12h' ? 'text-indigo-700 dark:text-dk-accent-text' : 'text-slate-500 hover:text-slate-700'}`}>{tx(lang, { fr: '12 Heures (AM/PM)', ar: '12 ساعة (AM/PM)', en: '12 Hours (AM/PM)', es: '12 Horas (AM/PM)', pt: '12 Horas (AM/PM)', tr: '12 Saat (AM/PM)' })}</button>
                            </div>
                        </div>

                        {/* Working Hours */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.workingHoursStart}</label>
                                <input type="time" name="workingHoursStart" value={draft.workingHoursStart} onChange={handleChange} className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-lg text-slate-700 dark:text-dk-text-soft transition-all text-center" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.workingHoursEnd}</label>
                                <input type="time" name="workingHoursEnd" value={draft.workingHoursEnd} onChange={handleChange} className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-lg text-slate-700 dark:text-dk-text-soft transition-all text-center" />
                            </div>
                        </div>

                        {/* Working Days */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="flex items-center gap-2 block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted">{t.workingDays} <span className="text-[10px] text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 px-2 py-0.5 rounded-full border border-indigo-100 font-black tracking-widest">{(draft.workingDays || []).length}/7</span></label>
                                <div className="flex gap-2">
                                    <button onClick={() => setDraft(prev => ({ ...prev, workingDays: [1, 2, 3, 4, 5, 6, 7] }))} className="text-xs font-bold text-slate-500 hover:text-indigo-600 dark:text-dk-accent-text transition-colors uppercase pr-2 border-r border-slate-200 dark:border-dk-border hidden sm:block">{tx(lang, { fr: 'Tous', ar: 'الكل', en: 'All', es: 'Todos', pt: 'Todos', tr: 'Tümü' })}</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-2">
                                {[1, 2, 3, 4, 5, 6, 7].map((dayCode, idx) => {
                                    const isActive = (draft.workingDays || []).includes(dayCode);
                                    return (
                                        <button
                                            key={dayCode}
                                            onClick={() => toggleWorkingDay(dayCode)}
                                            className={`flex-1 min-w-[3.5rem] py-2.5 rounded-lg font-bold text-xs sm:text-sm transition-all border-2 active:scale-95 ${isActive
                                                ? 'bg-indigo-600 dark:bg-dk-accent text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                                                : 'bg-white dark:bg-dk-surface text-slate-400 border-slate-200 dark:border-dk-border hover:border-indigo-300 hover:text-indigo-600 dark:text-dk-accent-text'
                                                }`}
                                        >
                                            {t.days[idx].substring(0, 3)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Breaks / Pauses */}
                        <div className="pt-6 border-t border-slate-100 dark:border-dk-border">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted">{t.pauses}</label>
                                    <span className="text-[10px] text-slate-400 dark:text-dk-muted">Ces temps seront déduits des temps de présence.</span>
                                </div>
                                <button onClick={addPause} className="text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text flex items-center gap-1 hover:text-indigo-700 dark:text-dk-accent-text hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100">
                                    <Plus className="w-3.5 h-3.5" /> {t.addPause}
                                </button>
                            </div>

                            <div className="space-y-3">
                                {(draft.pauses || []).map((pause, index) => (
                                    <div key={pause.id} className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 dark:bg-dk-bg p-3 rounded-xl border border-slate-200 dark:border-dk-border hover:border-indigo-200 transition-colors">
                                        <span className="text-xs font-bold text-slate-400 dark:text-dk-muted w-6 text-center">{index + 1}.</span>
                                        <div className="flex-1 flex flex-col xl:flex-row gap-3 w-full">
                                            <div className="flex-[1.5]">
                                                <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseName}</span>
                                                <input type="text" value={pause.name || ''} onChange={(e) => updatePause(pause.id, 'name', e.target.value)} className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft placeholder:text-slate-300" placeholder={tx(lang, { fr: 'Ex: Déjeuner', ar: 'مثال: غداء', en: 'Ex: Lunch', es: 'Ej: Almuerzo', pt: 'Ex: Almoço', tr: 'Örn: Öğle yemeği' })} />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseStart}</span>
                                                <input type="time" value={pause.start} onChange={(e) => updatePause(pause.id, 'start', e.target.value)} className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft text-center" />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseEnd}</span>
                                                <input type="time" value={pause.end} onChange={(e) => updatePause(pause.id, 'end', e.target.value)} className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft text-center" />
                                            </div>
                                            <div className="w-20">
                                                <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseDuration}</span>
                                                <div className="w-full bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 border border-indigo-100 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-indigo-700 dark:text-dk-accent-text select-none">
                                                    {pause.durationMin} m
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => removePause(pause.id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 border border-transparent hover:border-rose-100 rounded-lg transition-colors Shrink-0 mt-4 sm:mt-0" title={tx(lang, { fr: 'Supprimer cette pause', ar: 'حذف هذا الاستراحة', en: 'Delete this break', es: 'Eliminar esta pausa', pt: 'Eliminar esta pausa', tr: 'Bu molayı sil' })}>
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {(draft.pauses || []).length === 0 && (
                                    <p className="text-sm text-slate-500 dark:text-dk-muted italic text-center py-4 bg-slate-50 dark:bg-dk-bg rounded-lg border border-dashed border-slate-200 dark:border-dk-border">{tx(lang, { fr: 'Aucune pause définie pour le moment.', ar: 'لا توجد أي استراحة معرفة حالياً.', en: 'No break defined at the moment.', es: 'Ninguna pausa definida por el momento.', pt: 'Nenhuma pausa definida de momento.', tr: 'Henüz mola tanımlanmamış.' })}</p>
                                )}
                            </div>
                        </div>
            </div>
            <SaveBar lang={lang} isDirty={isDirty} isSaving={isSaving} showToast={showToast} onSave={handleSave} />
        </div>
    );
}

// Structure & encadrement (organigramme, chaines, machines/chaine)
export function StructureSection({ settings, setSettings, lang, machines }) {
    const t = pickT(TRANSLATIONS, lang);
    const { draft, setDraft, isDirty, isSaving, showToast, handleSave } = useSettingsDraft(settings, setSettings);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        setDraft(prev => ({ ...prev, [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value }));
    };

    return (
        <div className="space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm p-6 md:p-8 space-y-10">

                    {/* Encadrement Général */}
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 shadow-sm dark:shadow-dk-sm shrink-0">
                                    <Shield className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-800 dark:text-dk-text tracking-tight">{t.generalManagers}</h3>
                                    <p className="text-sm text-slate-500 dark:text-dk-muted mt-0.5 font-medium">{tx(lang, { fr: 'Direction, administration, pointeurs, chronométreurs...', ar: 'الإدارة، الإشراف، مراقبو الوقت...', en: 'Management, administration, timekeepers...', es: 'Dirección, administración, cronometradores...', pt: 'Direção, administração, cronometristas...', tr: 'Yönetim, idare, zaman hakemleri...' })}</p>
                                </div>
                            </div>
                            <button onClick={() => setDraft(prev => ({ ...prev, organigram: [...(prev.organigram || []), { id: Date.now().toString(), name: '', role: '' }] }))} className="w-full sm:w-auto text-sm font-bold bg-white dark:bg-dk-surface text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text flex items-center justify-center gap-2 hover:text-indigo-700 dark:text-dk-accent-text hover:bg-indigo-50 dark:bg-dk-accent/20 px-5 py-2.5 rounded-xl transition-all border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm active:scale-95">
                                <Plus className="w-4 h-4" /> {tx(lang, { fr: 'Ajouter Un Membre', ar: 'إضافة عضو', en: 'Add a Member', es: 'Añadir un miembro', pt: 'Adicionar um membro', tr: 'Üye Ekle' })}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {(draft.organigram || []).map((person) => (
                                <div key={person.id} className="flex flex-col gap-3 bg-white dark:bg-dk-surface p-5 rounded-2xl border border-slate-200 dark:border-dk-border hover:border-blue-300 hover:shadow-md dark:hover:shadow-dk-md transition-all relative group overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <button onClick={() => setDraft(prev => ({ ...prev, organigram: prev.organigram.filter(p => p.id !== person.id) }))} className="absolute top-3 right-3 p-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-500 hover:text-rose-600 hover:bg-rose-100 rounded-lg shadow-sm dark:shadow-dk-sm border border-rose-100 opacity-0 group-hover:opacity-100 transition-all active:scale-90" title={tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' })}>
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted mb-1 block">{tx(lang, { fr: 'Nom Complet', ar: 'الاسم الكامل', en: 'Full Name', es: 'Nombre Completo', pt: 'Nome Completo', tr: 'Tam Ad' })}</label>
                                        <input type="text" value={person.name} onChange={(e) => setDraft(prev => ({ ...prev, organigram: prev.organigram.map(p => p.id === person.id ? { ...p, name: e.target.value } : p) }))} className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-bold text-slate-800 dark:text-dk-text placeholder:text-slate-300 transition-all font-sans" placeholder={tx(lang, { fr: 'ex: Ahmed', ar: 'مثال: أحمد', en: 'e.g., Ahmed', es: 'ej: Ahmed', pt: 'ex: Ahmed', tr: 'örn: Ahmed' })} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted mb-1 block">{tx(lang, { fr: 'Rôle / Poste', ar: 'الدور / المنصب', en: 'Role / Position', es: 'Rol / Puesto', pt: 'Função / Cargo', tr: 'Rol / Pozisyon' })}</label>
                                        <input type="text" value={person.role} onChange={(e) => setDraft(prev => ({ ...prev, organigram: prev.organigram.map(p => p.id === person.id ? { ...p, role: e.target.value } : p) }))} className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-medium text-slate-600 dark:text-dk-text-soft placeholder:text-slate-300 transition-all" placeholder={tx(lang, { fr: 'ex: Directeur', ar: 'مثال: مدير', en: 'e.g., Director', es: 'ej: Director', pt: 'ex: Diretor', tr: 'örn: Müdür' })} />
                                    </div>
                                </div>
                            ))}
                            {(!draft.organigram || draft.organigram.length === 0) && (
                                <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4 p-8 border-2 border-dashed border-slate-200 dark:border-dk-border rounded-3xl text-center flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-dk-bg">
                                    <Shield className="w-10 h-10 text-slate-300 dark:text-dk-muted" />
                                    <span className="text-slate-500 dark:text-dk-muted font-bold text-sm">{tx(lang, { fr: 'Aucun responsable général défini.', ar: 'لا يوجد أي مسؤول عام معرف.', en: 'No supervisor defined.', es: 'Ningún responsable general definido.', pt: 'Nenhum responsável geral definido.', tr: 'Hiçbir yönetici tanımlanmamış.' })}</span>
                                    <span className="text-slate-400 dark:text-dk-muted text-xs">{tx(lang, { fr: 'Cliquez sur « Ajouter un membre » pour commencer.', ar: 'انقر على « إضافة عضو » للبدء.', en: 'Click "Add a member" to get started.', es: 'Haga clic en « Añadir un miembro » para comenzar.', pt: 'Clique em « Adicionar um membro » para começar.', tr: 'Başlamak için « Üye Ekle »ye tıklayın.' })}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <hr className="border-slate-100 dark:border-dk-border" />

                    {/* Number of Chains Config */}
                    <div className="bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 border border-indigo-100 rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3"></div>
                        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                            <div className="flex-1">
                                <label className="block text-lg font-black text-indigo-900 dark:text-indigo-300 mb-1">{t.chainsCount}</label>
                                <p className="text-sm text-indigo-700 dark:text-dk-accent-text/70 font-medium">Modifier ce nombre mettra à jour l'usine numérique (Effet immédiat sur Suivi, Planning, Effectifs).</p>
                            </div>
                            <div className="relative w-40 shrink-0">
                                <input type="number" min="1" max="50" name="chainsCount" value={draft.chainsCount !== undefined ? draft.chainsCount : 4} onChange={handleChange} className="w-full bg-white dark:bg-dk-surface border-2 border-indigo-200 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 font-black text-xl text-indigo-900 dark:text-indigo-300 transition-all" />
                                <Building className="w-6 h-6 text-indigo-400 absolute left-4 top-3.5" />
                            </div>
                        </div>
                    </div>

                    {/* Effectifs par Chaîne */}
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100"><Users className="w-5 h-5" /></div>
                            <div>
                                <h3 className="text-base font-black text-slate-800 dark:text-dk-text tracking-tight">{t.chainStaff}</h3>
                                <p className="text-xs text-slate-500 dark:text-dk-muted mt-0.5 font-medium">Chef de groupe, moniteur, qualiticien de ligne...</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                            {Array.from({ length: draft.chainsCount || 4 }).map((_, i) => {
                                const chainKey = `CHAINE ${i + 1}`;
                                const staff = draft.chainStaff?.[chainKey] || [];
                                return (
                                    <div key={chainKey} className="bg-white dark:bg-dk-surface border-2 border-slate-100 dark:border-dk-border rounded-3xl overflow-hidden shadow-sm dark:shadow-dk-sm hover:border-emerald-200 transition-colors flex flex-col">
                                        <div className="bg-emerald-50 dark:bg-emerald-900/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between border-b border-emerald-100 gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-white dark:bg-dk-surface border border-emerald-200 shadow-sm dark:shadow-dk-sm flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-black text-sm">{i + 1}</div>
                                                <input
                                                    type="text"
                                                    value={draft.chainNames?.[chainKey] || chainKey}
                                                    onChange={(e) => setDraft(prev => ({
                                                        ...prev,
                                                        chainNames: { ...(prev.chainNames || {}), [chainKey]: e.target.value || chainKey }
                                                    }))}
                                                    className="font-black text-slate-800 dark:text-dk-text tracking-wider text-base bg-transparent border-b-2 border-transparent hover:border-emerald-300 focus:border-emerald-500 focus:bg-white px-1 outline-none transition-all w-32"
                                                    placeholder={tx(lang, { fr: 'Nom de la chaîne...', ar: 'اسم الخط...', en: 'Chain name...', es: 'Nombre de la cadena...', pt: 'Nome da cadeia...', tr: 'Hat adı...' })}
                                                />
                                            </div>
                                            <button onClick={() => setDraft(prev => ({
                                                ...prev,
                                                chainStaff: {
                                                    ...(prev.chainStaff || {}),
                                                    [chainKey]: [...staff, { id: Date.now().toString(), name: '', role: 'Chef de chaîne' }]
                                                }
                                            }))} className="w-full sm:w-auto text-[11px] font-bold uppercase tracking-wider bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft hover:text-emerald-700 px-4 py-2 rounded-xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border hover:border-emerald-300 transition-all flex items-center justify-center gap-1.5 active:scale-95">
                                                <Plus className="w-3.5 h-3.5" /> Ajouter
                                            </button>
                                        </div>
                                        <div className="p-5 bg-white dark:bg-dk-surface flex-1 flex flex-col">
                                            {staff.length > 0 ? (
                                                <div className="space-y-4">
                                                    {staff.map((person) => (
                                                        <div key={person.id} className="flex flex-col sm:flex-row items-center gap-3 group relative bg-slate-50 dark:bg-dk-bg p-3 rounded-2xl border border-slate-100 dark:border-dk-border hover:border-emerald-200 transition-colors">
                                                            <div className="flex-1 w-full">
                                                                <input type="text" value={person.name} onChange={(e) => setDraft(prev => ({ ...prev, chainStaff: { ...prev.chainStaff, [chainKey]: prev.chainStaff[chainKey].map(p => p.id === person.id ? { ...p, name: e.target.value } : p) } }))} className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm font-bold text-slate-700 dark:text-dk-text-soft transition-all" placeholder={tx(lang, { fr: 'Nom Complet', ar: 'الاسم الكامل', en: 'Full Name', es: 'Nombre Completo', pt: 'Nome Completo', tr: 'Tam Ad' })} />
                                                            </div>
                                                            <div className="flex-1 w-full">
                                                                <input type="text" value={person.role} onChange={(e) => setDraft(prev => ({ ...prev, chainStaff: { ...prev.chainStaff, [chainKey]: prev.chainStaff[chainKey].map(p => p.id === person.id ? { ...p, role: e.target.value } : p) } }))} className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm font-medium text-slate-600 dark:text-dk-text-soft transition-all" placeholder={tx(lang, { fr: 'Rôle (ex: Qualité)', ar: 'الدور (مثال: الجودة)', en: 'Role (ex: Quality)', es: 'Rol (ej: Calidad)', pt: 'Função (ex: Qualidade)', tr: 'Rol (örn: Kalite)' })} />
                                                            </div>
                                                             <button onClick={() => setDraft(prev => ({ ...prev, chainStaff: { ...prev.chainStaff, [chainKey]: prev.chainStaff[chainKey].filter(p => p.id !== person.id) } }))} className="w-full sm:w-10 sm:h-10 text-rose-400 hover:text-rose-600 bg-white dark:bg-dk-surface hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl border border-slate-200 dark:border-dk-border hover:border-rose-300 shadow-sm dark:shadow-dk-sm transition-all focus:outline-none shrink-0 flex items-center justify-center active:scale-90 py-2 sm:py-0" title={tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' })}>
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex-1 flex flex-col items-center justify-center py-8">
                                                    <div className="w-12 h-12 bg-slate-50 dark:bg-dk-bg rounded-full flex items-center justify-center mb-3">
                                                        <Users className="w-6 h-6 text-slate-300 dark:text-dk-muted" />
                                                    </div>
                                                    <span className="text-sm text-slate-400 dark:text-dk-muted font-bold bg-slate-50 dark:bg-dk-bg px-5 py-2 rounded-full border border-slate-100 dark:border-dk-border">{tx(lang, { fr: 'Aucun personnel affecté', ar: 'لا يوجد موظفون معينون', en: 'No staff assigned', es: 'Ningún personal asignado', pt: 'Nenhum pessoal atribuído', tr: 'Atanmış personel yok' })}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

            </div>
            <SaveBar lang={lang} isDirty={isDirty} isSaving={isSaving} showToast={showToast} onSave={handleSave} />
        </div>
    );
}
