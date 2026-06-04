import React, { useEffect, useState } from 'react';
import BeraLogo from './BeraLogo';

interface GlobalLoaderProps {
    isActive: boolean;
    progress: number; // 0 to 100
    text?: string;
    subText?: string;
    isFullScreen?: boolean;
    error?: string | null;
    onRetry?: () => void;
    onContinueOffline?: () => void;
}

export default function GlobalLoader({
    isActive,
    progress,
    text = "Initialisation",
    subText = "Préparation du système",
    isFullScreen = true,
    error = null,
    onRetry,
    onContinueOffline,
}: GlobalLoaderProps) {
    const [displayedProgress, setDisplayedProgress] = useState(0);

    // Smooth progress interpolation (easeOutExpo)
    useEffect(() => {
        if (!isActive) {
            setDisplayedProgress(0);
            return;
        }

        const targetProgress = Math.min(100, Math.max(0, isFinite(progress) ? progress : 0));
        
        if (targetProgress === 100) {
            setDisplayedProgress(100);
            return;
        }

        let animationFrameId: number;
        const easeOutExpo = (x: number): number => {
            return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
        };

        const duration = 320;
        const startProgress = displayedProgress;
        const startTime = performance.now();

        const animateProgress = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progressRatio = Math.min(elapsed / duration, 1);
            const easedRatio = easeOutExpo(progressRatio);
            
            const currentVal = Math.max(0, startProgress + (targetProgress - startProgress) * easedRatio);
            setDisplayedProgress(currentVal);

            if (progressRatio < 1) {
                animationFrameId = requestAnimationFrame(animateProgress);
            }
        };

        animationFrameId = requestAnimationFrame(animateProgress);

        return () => cancelAnimationFrame(animationFrameId);
    }, [progress, isActive]);

    if (!isActive) return null;

    const formattedProgress = Math.round(displayedProgress);

    const wrapperClass = `${
        isFullScreen 
        ? 'fixed inset-0 z-[99999]' 
        : 'absolute inset-0 z-[50] rounded-3xl overflow-hidden'
    } flex items-center justify-center font-sans select-none cad-dot-grid`;

    const cardClass = "relative z-10 flex flex-col items-center max-w-sm w-full mx-4 bg-white/90 backdrop-blur-xl border border-slate-100 rounded-[32px] p-8 md:p-10 shadow-[0_20px_50px_rgba(15,23,42,0.05)] shadow-xl shadow-slate-100/50";

    return (
        <div className={wrapperClass} dir="auto">
            {/* Main Content Card Container */}
            <div className={cardClass}>
                {/* Green Logo Box & Dashed Ring */}
                <div className="relative mb-8 flex items-center justify-center">
                    {/* Subtle thin dashed ring */}
                    <div className="border border-dashed border-emerald-500/20 w-24 h-24 absolute rounded-full animate-[spin_40s_linear_infinite] pointer-events-none" />
                    
                    {/* Solid emerald-green box */}
                    <div className="relative bg-emerald-600 w-16 h-16 rounded-[20px] flex items-center justify-center shadow-lg shadow-emerald-600/20 select-none transition-transform duration-300 hover:scale-105 z-10">
                        <BeraLogo className="w-9 h-9 text-white z-10" accentOpacity={0.45} />
                    </div>
                </div>

                {/* Brand Identity Text */}
                <div className="text-center mb-6">
                    <h1 className="select-none text-xl font-extrabold tracking-[0.15em] uppercase text-slate-900">
                        BERA<span className="text-emerald-600">METHODE</span>
                    </h1>
                </div>

                {/* Typography Block */}
                <div className="text-center space-y-3 mb-8 w-full">
                    {/* Header text with animation on key change */}
                    <h2 
                        key={`text-${text}`} 
                        className="text-base font-bold text-slate-800 tracking-tight leading-snug animate-[fade-slide-up_0.35s_ease-out]"
                    >
                        {text}
                    </h2>

                    {/* Status Pill */}
                    {error ? (
                        <div 
                            key="error-pill"
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-100 animate-[fade-slide-up_0.4s_ease-out]"
                        >
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                            <span className="text-xs font-bold text-rose-700 tracking-wide uppercase">
                                Erreur de connexion
                            </span>
                        </div>
                    ) : (
                        <div 
                            key={`subText-${subText}`}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-100 animate-[fade-slide-up_0.4s_ease-out]"
                        >
                            <div className="relative flex w-2 h-2">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </div>
                            <span className="text-xs font-semibold text-slate-500 tracking-wide">
                                {subText}
                            </span>
                        </div>
                    )}
                </div>

                {/* Error layout or Progress bar */}
                {error ? (
                    <div className="w-full flex flex-col items-center gap-5 mt-2 animate-[fade-slide-up_0.35s_ease-out]">
                        <p className="text-sm text-center leading-relaxed text-slate-600 max-w-xs">
                            {error}
                        </p>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 w-full mt-2">
                            {onRetry && (
                                <button
                                    type="button"
                                    onClick={onRetry}
                                    className="flex-1 py-3 px-5 rounded-2xl text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/10 hover:shadow-emerald-600/20 active:scale-[0.98] transition-all duration-200"
                                >
                                    Réessayer
                                </button>
                            )}
                            {onContinueOffline && (
                                <button
                                    type="button"
                                    onClick={onContinueOffline}
                                    className="flex-1 py-3 px-5 rounded-2xl text-xs font-bold uppercase tracking-wider bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.98] transition-all duration-200"
                                >
                                    Hors-ligne
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="w-full mt-4 space-y-4">
                        {/* Progress label & value */}
                        <div className="flex justify-between items-baseline px-1">
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                Chargement
                            </span>
                            <span className="text-slate-900 font-black text-2xl tracking-tight tabular-nums">
                                {formattedProgress}%
                            </span>
                        </div>

                        {/* Linear progress bar */}
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/10">
                            <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300 ease-out relative"
                                style={{ width: `${formattedProgress}%` }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full h-full animate-[shimmer-bar_2s_infinite]" />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Component Keyframe Animations */}
            <style>{`
                .cad-dot-grid {
                    background-color: #fafafa;
                    background-size: 24px 24px;
                    background-image: radial-gradient(circle, #cbd5e1 1.5px, transparent 1.5px);
                }

                @keyframes shimmer-bar {
                    0% {
                        transform: translateX(-100%);
                    }
                    100% {
                        transform: translateX(100%);
                    }
                }

                @keyframes fade-slide-up {
                    from {
                        opacity: 0;
                        transform: translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}
