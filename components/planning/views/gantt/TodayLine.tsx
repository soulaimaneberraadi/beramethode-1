import React, { useEffect, useState } from 'react';
import { tx } from '../../../../lib/i18n';
import { useLang } from '../../../../src/context/LanguageContext';

interface Props {
    offsetPx: number;
    height: number;
    pulseKey?: number;
}

export default function TodayLine({ offsetPx, height, pulseKey }: Props) {
    const { lang } = useLang();
    const [pulsing, setPulsing] = useState(false);

    useEffect(() => {
        if (!pulseKey) return;
        setPulsing(true);
        const t = setTimeout(() => setPulsing(false), 2200);
        return () => clearTimeout(t);
    }, [pulseKey]);

    const isRtl = lang === 'ar';
    return (
        <div
            className="absolute top-0 z-[25] pointer-events-none"
            style={{ 
                left: isRtl ? 'auto' : offsetPx, 
                right: isRtl ? offsetPx : 'auto', 
                height 
            }}
        >
            {/* Main line - more visible */}
            <div className={`absolute top-0 left-0 w-0.5 h-full transition-all duration-300 ${
                pulsing
                    ? 'bg-red-500 shadow-[0_0_16px_4px_rgba(239,68,68,0.6)]'
                    : 'bg-red-500/80 shadow-[0_0_8px_2px_rgba(239,68,68,0.3)]'
            }`} />
            
            {/* Today label at top */}
            <div className={`absolute -top-px -left-8 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                pulsing
                    ? 'bg-red-500 text-white shadow-lg dark:shadow-dk-lg'
                    : 'bg-red-500 text-white'
            }`}>
{tx(lang, { fr: "Aujourd'hui", ar: 'اليوم', en: 'Today', es: 'Hoy', pt: 'Hoje', tr: 'Bugün' })}
            </div>
            
            {/* Top dot */}
            <div className={`absolute top-6 -left-[5px] w-2.5 h-2.5 rounded-full border-2 border-white dark:border-dk-surface dark:bg-dk-surface ${
                pulsing ? 'bg-red-500 planning-today-pulse' : 'bg-red-500'
            }`} />
            
            {/* Halo during pulse */}
            {pulsing && (
                <div className="absolute top-4 -left-[12px] w-6 h-6 rounded-full bg-red-400/20 planning-today-halo pointer-events-none" />
            )}
            <style>{`
                @keyframes planning-today-pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
                    50% { transform: scale(1.8); box-shadow: 0 0 0 10px rgba(239,68,68,0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0); }
                }
                @keyframes planning-today-halo {
                    0% { transform: scale(0.6); opacity: 0; }
                    30% { opacity: 1; }
                    100% { transform: scale(3.5); opacity: 0; }
                }
                .planning-today-pulse {
                    animation: planning-today-pulse 1.1s ease-out infinite;
                }
                .planning-today-halo {
                    animation: planning-today-halo 1.4s ease-out infinite;
                }
            `}</style>
        </div>
    );
}
