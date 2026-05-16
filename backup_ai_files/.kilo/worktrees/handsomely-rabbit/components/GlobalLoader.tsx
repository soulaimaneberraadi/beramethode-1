import React, { useEffect, useState } from 'react';

interface GlobalLoaderProps {
    isActive: boolean;
    progress: number; // 0 to 100
    text?: string;
    subText?: string;
    isFullScreen?: boolean;
}

export default function GlobalLoader({
    isActive,
    progress,
    text = "Initialisation",
    subText = "Préparation du système",
    isFullScreen = true
}: GlobalLoaderProps) {
    const [displayedProgress, setDisplayedProgress] = useState(0);

    // Smooth progress interpolation
    useEffect(() => {
        if (!isActive) {
            setDisplayedProgress(0);
            return;
        }

        let animationFrameId: number;
        // Easing function for smoother deceleration (easeOutExpo)
        const easeOutExpo = (x: number): number => {
            return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
        };

        const duration = 1200; // ms to reach the target progress
        const startProgress = displayedProgress;
        const targetProgress = Math.min(100, Math.max(0, progress));
        const startTime = performance.now();

        const animateProgress = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progressRatio = Math.min(elapsed / duration, 1);
            const easedRatio = easeOutExpo(progressRatio);
            
            const currentVal = startProgress + (targetProgress - startProgress) * easedRatio;
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

    return (
        <div
            className={`${
                isFullScreen 
                ? 'fixed inset-0 z-[99999]' 
                : 'absolute inset-0 z-[50] rounded-3xl overflow-hidden'
            } flex items-center justify-center bg-[#070b14]/90 backdrop-blur-2xl transition-all duration-700 font-sans`}
            dir="auto"
        >
            {/* Ambient Background Glows */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] min-w-[300px] min-h-[300px] bg-indigo-600/10 rounded-full blur-[120px] mix-blend-screen animate-pulse duration-[4000ms]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] min-w-[300px] min-h-[300px] bg-emerald-600/10 rounded-full blur-[120px] mix-blend-screen animate-pulse duration-[5000ms] delay-1000" />
            </div>

            <div className="relative z-10 flex flex-col items-center w-full max-w-md px-8 py-12">
                
                {/* Glowing Logo Container */}
                <div className="relative mb-16 group scale-110">
                    {/* Animated Rings */}
                    <div className="absolute inset-[-1.5rem] rounded-full border border-indigo-500/20 border-t-indigo-400/60 animate-[spin_5s_linear_infinite]" />
                    <div className="absolute inset-[-0.75rem] rounded-full border border-emerald-500/20 border-b-emerald-400/60 animate-[spin_3s_linear_infinite_reverse]" />
                    
                    {/* Center Core */}
                    <div className="relative w-24 h-24 flex items-center justify-center bg-slate-900/80 rounded-3xl shadow-[0_0_50px_-10px_rgba(99,102,241,0.4)] border border-white/5 backdrop-blur-md overflow-hidden transition-transform duration-700 group-hover:scale-105">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-emerald-500/10" />
                        
                        {/* Animated Shimmer through the logo box */}
                        <div className="absolute inset-0 w-[200%] rotate-45 animate-[shimmer_3s_linear_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full" />
                        
                        <span className="text-5xl font-black bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent relative z-10">
                            B
                        </span>
                    </div>
                </div>

                {/* Typography block */}
                <div className="text-center space-y-4 mb-12 w-full animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <h2 className="text-2xl font-semibold text-white tracking-wide">
                        {text}
                    </h2>
                    
                    {/* Dynamic Status Pill */}
                    <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/50 backdrop-blur-xl shadow-inner">
                        {/* Custom Animated Dots */}
                        <div className="relative flex w-2.5 h-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                            {subText}
                        </span>
                    </div>
                </div>

                {/* Linear Progress Integration */}
                <div className="w-full mt-4">
                    <div className="flex justify-between items-end mb-3 px-1">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest opacity-80">
                            Progression Globale
                        </span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-indigo-400 bg-clip-text text-transparent tabular-nums">
                                {formattedProgress}
                            </span>
                            <span className="text-slate-500 font-bold text-sm">%</span>
                        </div>
                    </div>

                    {/* Highly polished progress bar */}
                    <div className="h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden border border-white/5 relative">
                        <div 
                            className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 via-emerald-400 to-emerald-300 rounded-full transition-all duration-[400ms] ease-out shadow-[0_0_20px_rgba(52,211,153,0.6)]"
                            style={{ width: `${formattedProgress}%` }}
                        >
                            {/* Inner shine */}
                            <div className="absolute top-0 right-0 w-8 h-full bg-gradient-to-r from-transparent to-white/80 blur-[2px]" />
                        </div>
                    </div>
                </div>

            </div>
            
            <style>{`
                @keyframes shimmer {
                    100% { transform: translateX(100%) rotate(45deg); }
                }
            `}</style>
        </div>
    );
}
