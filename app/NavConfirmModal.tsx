import React from 'react';
import { Save, AlertTriangle } from 'lucide-react';
import type { Lang } from '../app/constants';

interface NavConfirmModalProps {
    isOpen: boolean;
    type: 'save' | 'new' | 'effectifs' | null;
    lang: Lang;
    user: any;
    onConfirm: (action: 'yes' | 'no' | 'cancel') => void;
}

export default function NavConfirmModal({ isOpen, type, lang, user, onConfirm }: NavConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
            style={{ animation: 'modalFadeIn 0.2s ease-out both' }}
        >
            {/* Darker Blur Backdrop */}
            <div
                className="absolute inset-0 bg-slate-950/40 backdrop-blur-[12px] transition-opacity duration-300"
                onClick={() => onConfirm('cancel')}
            />

            {/* Ultra-Glass Card */}
            <div
                className="relative w-full max-w-[400px] overflow-hidden"
                style={{
                    background: 'rgba(255, 255, 255, 0.94)',
                    backdropFilter: 'blur(16px)',
                    borderRadius: '24px',
                    boxShadow: `
                    0 0 0 1px rgba(0, 0, 0, 0.05),
                    0 20px 50px -12px rgba(0, 0, 0, 0.3),
                    0 4px 10px -2px rgba(0, 0, 0, 0.1)
                `,
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
                                ? 'rgba(99, 102, 241, 0.12)'
                                : type === 'save'
                                ? 'rgba(16, 185, 129, 0.1)'
                                : 'rgba(245, 158, 11, 0.1)',
                            color: type === 'effectifs'
                                ? '#4f46e5'
                                : type === 'save' ? '#059669' : '#d97706',
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.4)',
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
                        <h3 className="text-[22px] font-black text-slate-900 tracking-tight leading-tight">
                            {lang === 'ar'
                                ? (type === 'effectifs'
                                    ? 'حفظ تأطير اليوم؟'
                                    : type === 'save' ? 'حفظ التغييرات؟' : 'تنبيه: نموذج قيد العمل')
                                : (type === 'effectifs'
                                    ? 'Enregistrer les effectifs du jour ?'
                                    : type === 'save' ? 'Sauvegarder ?' : 'Modèle en cours')
                            }
                        </h3>
                        <p className="text-[14px] text-slate-500 font-medium leading-relaxed max-w-[280px]">
                            {lang === 'ar'
                                ? (type === 'effectifs'
                                    ? 'لديك تغييرات على التأطير. أكد لمزامنة الخادم والخروج، أو ألغِ للبقاء.'
                                    : type === 'save'
                                    ? 'هل تريد حفظ النموذج الحالي قبل الانتقال للإجراء التالي؟'
                                    : 'لديك عمل غير محفوظ حالياً. هل تريد إكمال العمل أم البدء من جديد؟')
                                : (type === 'effectifs'
                                    ? (user
                                        ? 'Vous avez modifié des effectifs. Confirmez pour envoyer tout de suite au serveur et quitter, ou annulez pour rester sur cette page.'
                                        : 'Vous avez modifié des effectifs (sauvegarde locale). Confirmez pour quitter ou annulez pour rester.')
                                    : type === 'save'
                                    ? 'Voulez-vous sauvegarder votre travail actuel avant de quitter cette vue ?'
                                    : 'Vous avez des modifications non sauvées. Voulez-vous continuer ou recommencer ?')
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
                                background: '#0f172a',
                                boxShadow: '0 8px 20px -6px rgba(15, 23, 42, 0.4)',
                            }}
                        >
                            <span className="relative z-10">
                                {type === 'effectifs'
                                    ? (lang === 'ar' ? 'تأكيد والخروج' : 'Confirmer et quitter')
                                    : type === 'save'
                                    ? (lang === 'ar' ? 'نعم، حفظ العمل' : 'Oui, Sauvegarder')
                                    : (lang === 'ar' ? 'مشروع جديد (مسح)' : 'Nouveau projet')
                                }
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-white/10 to-emerald-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
                        </button>

                        {/* Secondary Action — masqué pour Effectifs (2 choix : confirmer / annuler) */}
                        {type !== 'effectifs' && (
                        <button
                            type="button"
                            onClick={() => onConfirm('no')}
                            className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-[14px] transition-all duration-200 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
                        >
                            {type === 'save'
                                ? (lang === 'ar' ? 'تجاهل والحذف' : 'Quitter sans sauvegarder')
                                : (lang === 'ar' ? 'المتابعة في الحالي' : "Continuer l'actuel")
                            }
                        </button>
                        )}

                        {/* Subtle Cancel */}
                        <button
                            type="button"
                            onClick={() => onConfirm('cancel')}
                            className="w-full h-10 font-bold text-[12px] text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest pt-2"
                        >
                            {lang === 'ar' ? 'إلغاء الأمر' : 'Annuler'}
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
