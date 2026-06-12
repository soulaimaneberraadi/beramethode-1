import React from 'react';
import { ZoomOut, ZoomIn } from 'lucide-react';

// Zoom est désormais une largeur de jour en pixels (continue).
// Plage : 8px (vue année) → 800px (vue heures).
export type ZoomLevel = number;

export const ZOOM_MIN = 8;
export const ZOOM_MAX = 800;
export const ZOOM_DEFAULT = 110;

// Compat : on garde le type littéral pour l'orchestrateur
export type ZoomKind = 'daily' | 'weekly' | 'monthly';

interface Props {
    value: ZoomLevel;
    onChange: (z: ZoomLevel) => void;
}

const PRESETS: { label: string; value: number }[] = [
    { label: 'Année', value: 12 },
    { label: 'Mois', value: 38 },
    { label: 'Semaine', value: 110 },
    { label: 'Jour', value: 260 },
    { label: 'Heure', value: 600 },
];

/** Étiquette synthétique pour l'affichage courant. */
export function zoomLabel(v: number): string {
    if (v < 18) return 'Année';
    if (v < 60) return 'Mois';
    if (v < 180) return 'Semaine';
    if (v < 420) return 'Jour';
    return 'Heure';
}

export default function ZoomSwitcher({ value, onChange }: Props) {
    const decrement = () => onChange(Math.max(ZOOM_MIN, value / 1.5));
    const increment = () => onChange(Math.min(ZOOM_MAX, value * 1.5));

    return (
        <div className="inline-flex items-center gap-1.5 border border-slate-200/50 bg-slate-100/50 rounded-xl p-0.5 pr-2 backdrop-blur-sm shadow-sm">
            <button
                type="button"
                onClick={decrement}
                disabled={value <= ZOOM_MIN}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
                title="Dézoomer"
            >
                <ZoomOut className="w-3 h-3" strokeWidth={2} />
            </button>

            {/* Slider continu */}
            <input
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={1}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-20 accent-indigo-650 cursor-pointer h-1 bg-slate-200 rounded-lg appearance-none"
                title={`Zoom : ${zoomLabel(value)} (${Math.round(value)}px/jour)`}
            />

            <button
                type="button"
                onClick={increment}
                disabled={value >= ZOOM_MAX}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
                title="Zoomer"
            >
                <ZoomIn className="w-3 h-3" strokeWidth={2} />
            </button>

            <span className="text-[10px] font-bold text-slate-500 px-1 min-w-[2.5rem] text-center capitalize tabular-nums">
                {zoomLabel(value)}
            </span>
        </div>
    );
}

/** Presets disponibles via context menu / palette. */
export { PRESETS as ZOOM_PRESETS };
