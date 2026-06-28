import React from 'react';
import { Save, AlertTriangle } from 'lucide-react';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';
import { useIsDark } from '../src/context/ThemeContext';
import type { Lang } from '../app/constants';

interface NavConfirmModalProps {
    isOpen: boolean;
    type: 'save' | 'new' | 'effectifs' | null;
    lang: Lang;
    user: any;
    onConfirm: (action: 'yes' | 'no' | 'cancel') => void;
}

export default function NavConfirmModal({ isOpen, type, user, onConfirm }: NavConfirmModalProps) {
    const { lang } = useLang();
    const isDark = useIsDark();
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
            style={{ animation: 'modalFadeIn 0.2s ease-out both' }}
        >
            {/* Darker Blur Backdrop */}
            <div
                className={`absolute inset-0 transition-opacity duration-300 ${
                    isDark ? 'bg-black/60 backdrop-blur-[12px]' : 'bg-slate-950/40 backdrop-blur-[12px]'
                }`}
                onClick={() => onConfirm('cancel')}
            />

            {/* Ultra-Glass Card */}
            <div
                className="relative w-full max-w-[400px] overflow-hidden"
                style={{
                    background: isDark ? 'rgba(29, 46, 40, 0.96)' : 'rgba(255, 255, 255, 0.94)',
                    backdropFilter: 'blur(16px)',
                    borderRadius: '24px',
                    boxShadow: isDark 
                        ? '0 0 0 1px rgba(255, 255, 255, 0.08), 0 20px 50px -12px rgba(0, 0, 0, 0.5), 0 4px 10px -2px rgba(0, 0, 0, 0.2)'
                        : '0 0 0 1px rgba(0, 0, 0, 0.05), 0 20px 50px -12px rgba(0, 0, 0, 0.3), 0 4px 10px -2px rgba(0, 0, 0, 0.1)',
                    animation: 'modalEntrance 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
                }}
            >
                {/* Decorative Gradient Background Glow */}
                <div className="absolute top-0 left-0 right-0 h-[240px] opacity-[0.03] pointer-events-none"
                    style={{
                        background: type === 'effectifs'
                            ? 'radial-gradient(circle at 50% 0%, #6366f1 0%, transparent 70%)'
                            : type === 'save'
                            ? 'radial-gradient(circle at 50% 0%, #10b981 0%, transparent 70%)'
                            : 'radial-gradient(circle at 50% 0%, #f59e0b 0%, transparent 70%)'
                    }}
                />

                <div className="relative px-8 pt-10 pb-8 flex flex-col items-center text-center">
                    {/* Icon Circle - More Minimalist */}
                    <div
                        className={`mb-6 w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-500`}
                        style={{
                            background: type === 'effectifs'
                                ? (isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.12)')
                                : type === 'save'
                                ? (isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.1)')
                                : (isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.1)'),
                            color: type === 'effectifs'
                                ? (isDark ? '#818cf8' : '#4f46e5')
                                : type === 'save' 
                                ? (isDark ? '#34d399' : '#059669') 
                                : (isDark ? '#fbbf24' : '#d97706'),
                            boxShadow: isDark ? 'inset 0 0 0 1px rgba(255,255,255,0.1)' : 'inset 0 0 0 1px rgba(255,255,255,0.4)',
                            animation: 'iconPulse 2s ease-in-out infinite'
                        }}
                    >
                        {type === 'effectifs' ? (
                            <Save className="w-8 h-8" strokeWidth={1.5} />
                        ) : type === 'save' ? (
                            <Save className="w-8 h-8" strokeWidth={1.5} />
                        ) : (
                            <AlertTriangle className="w-8 h-8" strokeWidth={1.5} />
                        )}
                    </div>

                    <div className="space-y-2 mb-8">
                        <h3 className={`text-[22px] font-black tracking-tight leading-tight ${
                            isDark ? 'text-dk-text' : 'text-slate-900'
                        }`}>
                            {type === 'effectifs'
                                ? tx(lang, {ar: 'حفظ تأطير اليوم؟', fr: 'Enregistrer les effectifs du jour ?', en: "Save today's staffing?", es: '¿Guardar el personal de hoy?', pt: 'Salvar os efetivos de hoje?', tr: 'Bugünkü personeli kaydet?'})
                                : type === 'save'
                                ? tx(lang, {ar: 'حفظ التغييرات؟', fr: 'Sauvegarder ?', en: 'Save changes?', es: '¿Guardar cambios?', pt: 'Salvar alterações?', tr: 'Değişiklikleri kaydet?'})
                                : tx(lang, {ar: 'تنبيه: نموذج قيد العمل', fr: 'Modèle en cours', en: 'Model in progress', es: 'Modelo en curso', pt: 'Modelo em andamento', tr: 'Devam eden model'})
                            }
                        </h3>
                        <p className={`text-[14px] font-medium leading-relaxed max-w-[280px] ${
                            isDark ? 'text-dk-muted' : 'text-slate-500'
                        }`}>
                            {type === 'effectifs'
                                ? (user
                                    ? tx(lang, {ar: 'لديك تغييرات على التأطير. أكد لمزامنة الخادم والخروج، أو ألغِ للبقاء.', fr: 'Vous avez modifié des effectifs. Confirmez pour envoyer tout de suite au serveur et quitter, ou annulez pour rester sur cette page.', en: 'You have modified staffing. Confirm to send to server and leave, or cancel to stay.', es: 'Ha modificado el personal. Confirme para enviar al servidor y salir, o cancele para quedarse.', pt: 'Modificou os efetivos. Confirme para enviar ao servidor e sair, ou cancele para ficar.', tr: 'Personeli değiştirdiniz. Sunucuya göndermek ve çıkmak için onaylayın veya kalmak için iptal edin.'})
                                    : tx(lang, {ar: 'لديك تغييرات على التأطير. أكد لمزامنة الخادم والخروج، أو ألغِ للبقاء.', fr: 'Vous avez modifié des effectifs (sauvegarde locale). Confirmez pour quitter ou annulez pour rester.', en: 'You have modified staffing (local save). Confirm to leave or cancel to stay.', es: 'Ha modificado el personal (guardado local). Confirme para salir o cancele para quedarse.', pt: 'Modificou os efetivos (salvo localmente). Confirme para sair ou cancele para ficar.', tr: 'Personeli değiştirdiniz (yerel kayıt). Çıkmak için onaylayın veya iptal edin.'}))
                                : type === 'save'
                                ? tx(lang, {ar: 'هل تريد حفظ النموذج الحالي قبل الانتقال للإجراء التالي؟', fr: 'Voulez-vous sauvegarder votre travail actuel avant de quitter cette vue ?', en: 'Do you want to save your current work before leaving this view?', es: '¿Quiere guardar su trabajo actual antes de salir de esta vista?', pt: 'Deseja salvar seu trabalho atual antes de sair desta visualização?', tr: 'Bu görünümden ayrılmadan önce mevcut çalışmanızı kaydetmek istiyor musunuz?'})
                                : tx(lang, {ar: 'لديك عمل غير محفوظ حالياً. هل تريد إكمال العمل أم البدء من جديد؟', fr: 'Vous avez des modifications non sauvées. Voulez-vous continuer ou recommencer ?', en: 'You have unsaved changes. Do you want to continue or start over?', es: 'Tiene cambios sin guardar. ¿Quiere continuar o empezar de nuevo?', pt: 'Você tem alterações não salvas. Deseja continuar ou começar de novo?', tr: 'Kaydedilmemiş değişiklikleriniz var. Devam etmek mi yoksa yeniden başlamak mı istiyorsunuz?'})
                            }
                        </p>
                    </div>

                    {/* Action Buttons - Modern Stack */}
                    <div className="w-full space-y-3" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                        {/* Primary CTA */}
                        <button
                            type="button"
                            onClick={() => onConfirm('yes')}
                            className="group relative w-full h-12 flex items-center justify-center gap-3 rounded-xl font-bold text-[14px] text-white transition-all duration-200 active:scale-[0.98] overflow-hidden"
                            style={{
                                background: isDark ? '#2F9E64' : '#0f172a',
                                boxShadow: isDark 
                                    ? '0 8px 20px -6px rgba(47, 158, 100, 0.4)'
                                    : '0 8px 20px -6px rgba(15, 23, 42, 0.4)',
                            }}
                        >
                            <span className="relative z-10">
                                {type === 'effectifs'
                                    ? tx(lang, {ar: 'تأكيد والخروج', fr: 'Confirmer et quitter', en: 'Confirm and leave', es: 'Confirmar y salir', pt: 'Confirmar e sair', tr: 'Onayla ve çık'})
                                    : type === 'save'
                                    ? tx(lang, {ar: 'نعم، حفظ العمل', fr: 'Oui, Sauvegarder', en: 'Yes, Save', es: 'Sí, Guardar', pt: 'Sim, Salvar', tr: 'Evet, Kaydet'})
                                    : tx(lang, {ar: 'مشروع جديد (مسح)', fr: 'Nouveau projet', en: 'New project', es: 'Nuevo proyecto', pt: 'Novo projeto', tr: 'Yeni proje'})
                                }
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-white/10 to-emerald-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
                        </button>

                        {/* Secondary Action — masqué pour Effectifs (2 choix : confirmer / annuler) */}
                        {type !== 'effectifs' && (
                        <button
                            type="button"
                            onClick={() => onConfirm('no')}
                            className={`w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-[14px] transition-all duration-200 border active:scale-[0.98] ${
                                isDark 
                                    ? 'border-dk-border bg-dk-elevated/40 text-dk-text-soft hover:bg-dk-elevated/80' 
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            {type === 'save'
                                ? tx(lang, {ar: 'تجاهل والحذف', fr: 'Quitter sans sauvegarder', en: 'Discard and leave', es: 'Descartar y salir', pt: 'Descartar e sair', tr: 'At ve çık'})
                                : tx(lang, {ar: 'المتابعة في الحالي', fr: "Continuer l'actuel", en: 'Continue current', es: 'Continuar actual', pt: 'Continuar atual', tr: 'Mevcut devam'})
                            }
                        </button>
                        )}

                        {/* Subtle Cancel */}
                        <button
                            type="button"
                            onClick={() => onConfirm('cancel')}
                            className={`w-full h-10 font-bold text-[12px] transition-colors uppercase tracking-widest pt-2 ${
                                isDark ? 'text-dk-muted hover:text-dk-text-soft' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            {tx(lang, {ar: 'إلغاء الأمر', fr: 'Annuler', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal'})}
                        </button>
                    </div>
                </div>
            </div>

            {/* Keyframes for the Ultra Modern Look */}
            <style>{`
            @keyframes modalFadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes modalEntrance { 
                from { opacity: 0; transform: scale(0.9) translateY(30px); filter: blur(10px); } 
                to { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); } 
            }
            @keyframes iconPulse {
                0% { transform: scale(1); filter: brightness(1); }
                50% { transform: scale(1.05); filter: brightness(1.2); }
                100% { transform: scale(1); filter: brightness(1); }
            }
        `}</style>
        </div>
    );
}
