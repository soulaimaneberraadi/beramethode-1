// ════════════════════════════════════════════════════════════════════════════
// LicenseActivation — بطاقة تفعيل الترخيص (BERA-XXXX-XXXX-XXXX).
// تظهر داخل صفحة الإعدادات فقط. ليست بوّابة إقلاع — لا تقفل التطبيق إطلاقاً.
// تستدعي activate(keyCode) من LicenseContext ثم تعرض حالة النجاح/الخطأ.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { KeyRound, ShieldCheck, ShieldAlert, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useLicense } from '../src/context/LicenseContext';

interface LicenseActivationProps {
    lang: 'fr' | 'ar';
}

const T = {
    fr: {
        title: 'Licence / Abonnement',
        desc: 'Activez BERAMETHODE avec votre clé de licence.',
        placeholder: 'BERA-XXXX-XXXX-XXXX',
        activate: 'Activer',
        activating: 'Activation…',
        success: 'Licence active',
        invalid: 'Clé invalide ou activation échouée. Vérifiez la clé et réessayez.',
        status: 'Statut',
        expires: 'Expire le',
        modulesCount: 'Modules autorisés',
        daysLeft: 'Jours restants',
        noKey: 'Saisissez une clé au format BERA-XXXX-XXXX-XXXX.',
        currentlyActive: 'Une licence est déjà active.',
    },
    ar: {
        title: 'الترخيص / الاشتراك',
        desc: 'فعّل BERAMETHODE باستعمال مفتاح الترخيص الخاص بك.',
        placeholder: 'BERA-XXXX-XXXX-XXXX',
        activate: 'تفعيل',
        activating: 'جارٍ التفعيل…',
        success: 'الترخيص مُفعّل',
        invalid: 'مفتاح غير صالح أو فشل التفعيل. تحقّق من المفتاح وأعد المحاولة.',
        status: 'الحالة',
        expires: 'ينتهي في',
        modulesCount: 'الوحدات المسموحة',
        daysLeft: 'الأيام المتبقية',
        noKey: 'أدخل مفتاحاً بصيغة BERA-XXXX-XXXX-XXXX.',
        currentlyActive: 'يوجد ترخيص مُفعّل بالفعل.',
    },
};

/** يُنسّق الإدخال إلى BERA-XXXX-XXXX-XXXX (حروف/أرقام، حد أقصى 12 خانة بعد BERA). */
function formatKey(raw: string): string {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // إزالة بادئة BERA إن وُجدت لإعادة بنائها موحّدة.
    const body = cleaned.startsWith('BERA') ? cleaned.slice(4) : cleaned;
    const trimmed = body.slice(0, 12);
    const groups = trimmed.match(/.{1,4}/g) || [];
    return ['BERA', ...groups].join('-').replace(/-+$/, '');
}

export default function LicenseActivation({ lang }: LicenseActivationProps) {
    const t = T[lang];
    const isAr = lang === 'ar';
    const { license, activate } = useLicense();
    const [keyCode, setKeyCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isActive = license.ok && license.active && !license.expired;
    const canSubmit = keyCode.replace(/[^A-Z0-9]/gi, '').length >= 8 && !busy;

    const handleActivate = async () => {
        if (!canSubmit) {
            setError(t.noKey);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const state = await activate(keyCode);
            if (!state.ok) {
                setError(t.invalid);
            }
        } catch {
            setError(t.invalid);
        } finally {
            setBusy(false);
        }
    };

    const fmtDate = (iso: string | null): string => {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR', {
                year: 'numeric', month: '2-digit', day: '2-digit',
            });
        } catch {
            return iso;
        }
    };

    return (
        <div
            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col"
            dir={isAr ? 'rtl' : 'ltr'}
        >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-slate-500" />
                <h2 className="font-bold text-slate-800">{t.title}</h2>
            </div>

            <div className="p-5 space-y-4">
                <p className="text-xs text-slate-500 font-medium">{t.desc}</p>

                {/* État actif courant */}
                {isActive && (
                    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <span className="font-bold text-emerald-700 block">{t.success}</span>
                            <span className="text-xs text-emerald-600/80">{t.currentlyActive}</span>
                        </div>
                    </div>
                )}

                {/* Champ de saisie + bouton */}
                <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                    <input
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={keyCode}
                        onChange={(e) => { setKeyCode(formatKey(e.target.value)); setError(null); }}
                        placeholder={t.placeholder}
                        className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-mono font-bold tracking-wider text-slate-800 transition-all text-center sm:text-start uppercase placeholder:text-slate-300 placeholder:tracking-normal"
                    />
                    <button
                        type="button"
                        onClick={handleActivate}
                        disabled={!canSubmit}
                        className="shrink-0 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30 active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:active:scale-100"
                    >
                        {busy
                            ? <><Loader2 className="w-5 h-5 animate-spin" /> {t.activating}</>
                            : <><ShieldCheck className="w-5 h-5" /> {t.activate}</>}
                    </button>
                </div>

                {/* Erreur */}
                {error && (
                    <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-xl p-3 text-sm">
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <span className="text-rose-700 font-medium">{error}</span>
                    </div>
                )}

                {/* Détails de la licence (succès) */}
                {license.ok && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{t.status}</span>
                            <span className={`inline-flex items-center gap-1 text-xs font-black ${isActive ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                                {license.status}
                            </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{t.expires}</span>
                            <span className="text-xs font-black text-slate-700 font-mono">{fmtDate(license.expires_at)}</span>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{t.daysLeft}</span>
                            <span className="text-sm font-black text-slate-800">{license.daysLeft}</span>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{t.modulesCount}</span>
                            <span className="text-sm font-black text-slate-800">{license.modules.length}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
