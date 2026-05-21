import React, { useEffect, useState } from 'react';

interface Props {
    offsetPx: number;
    height: number;
    pulseKey?: number; // change → déclenche flash
}

export default function TodayLine({ offsetPx, height, pulseKey }: Props) {
    const [pulsing, setPulsing] = useState(false);

    useEffect(() => {
        if (!pulseKey) return;
        setPulsing(true);
        const t = setTimeout(() => setPulsing(false), 2200);
        return () => clearTimeout(t);
    }, [pulseKey]);

    return (
        <div
            className="absolute top-0 z-30 pointer-events-none"
            style={{ left: offsetPx, height }}
        >
            <div className={`absolute top-0 left-0 w-px h-full transition-all duration-300 ${
                pulsing ? 'bg-orange-500 shadow-[0_0_12px_3px_rgba(249,115,22,0.55)]' : 'bg-orange-400/60'
            }`} />
            <div className={`absolute top-7 -left-[3px] w-1.5 h-1.5 rounded-full bg-orange-500 ${
                pulsing ? 'planning-today-pulse' : ''
            }`} />
            {/* Halo additionnel pendant le pulse */}
            {pulsing && (
                <div className="absolute top-6 -left-[10px] w-5 h-5 rounded-full bg-orange-400/20 planning-today-halo pointer-events-none" />
            )}
            <style>{`
                @keyframes planning-today-pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249,115,22,0.7); }
                    50% { transform: scale(1.6); box-shadow: 0 0 0 8px rgba(249,115,22,0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249,115,22,0); }
                }
                @keyframes planning-today-halo {
                    0% { transform: scale(0.6); opacity: 0; }
                    30% { opacity: 1; }
                    100% { transform: scale(3); opacity: 0; }
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
