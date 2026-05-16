import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, X } from 'lucide-react';
import type { AppSettings } from '../../types';
import MonthGrid from './MonthGrid';
import { planningLocalDateKey } from '../../utils/planning';

export interface DateTimePickerProps {
    value: string;
    onChange: (iso: string) => void;
    mode: 'date' | 'datetime';
    settings: AppSettings;
    label?: string;
    className?: string;
    minDate?: string;
    maxDate?: string;
    disabledDays?: (d: Date) => boolean;
    /** Affiche le bouton déclencheur avec le même style que les inputs Planning */
    inputClassName?: string;
}

function pad(n: number) {
    return String(n).padStart(2, '0');
}

function timeSlots(): { h: number; m: number }[] {
    const out: { h: number; m: number }[] = [];
    for (let h = 6; h <= 22; h++) {
        for (const m of [0, 30]) {
            if (h === 22 && m > 0) break;
            out.push({ h, m });
        }
    }
    return out;
}

function formatTimeLabel(h: number, m: number, fmt: '12h' | '24h'): string {
    if (fmt === '24h') return `${pad(h)}:${pad(m)}`;
    const ap = h >= 12 ? 'pm' : 'am';
    const hr = h % 12 || 12;
    return `${hr}:${pad(m)}${ap}`;
}

export default function DateTimePicker({
    value,
    onChange,
    mode,
    settings,
    label,
    className = '',
    minDate,
    maxDate,
    disabledDays,
    inputClassName,
}: DateTimePickerProps) {
    const uid = useId();
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const datePart = (value || '').split('T')[0];
    const timePart = useMemo(() => {
        const t = value?.includes('T') ? value.split('T')[1] : '';
        if (!t) return { h: 12, m: 0 };
        const [hh, mm] = t.split(':').map(Number);
        return { h: Number.isFinite(hh) ? hh : 12, m: Number.isFinite(mm) ? mm : 0 };
    }, [value]);

    const [monthAnchor, setMonthAnchor] = useState(() => {
        const d = datePart ? new Date(datePart + 'T12:00:00') : new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
    });

    useEffect(() => {
        if (!datePart) return;
        const d = new Date(datePart + 'T12:00:00');
        if (!isNaN(d.getTime())) setMonthAnchor(new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0));
    }, [datePart]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const fmt = settings.timeFormat || '24h';
    const slots = useMemo(() => timeSlots(), []);

    const displayLabel = useMemo(() => {
        if (!datePart) return '—';
        const d = new Date(datePart + 'T12:00:00');
        if (isNaN(d.getTime())) return datePart;
        const base = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        if (mode === 'datetime') return `${base} · ${formatTimeLabel(timePart.h, timePart.m, fmt)}`;
        return base;
    }, [datePart, mode, fmt, timePart.h, timePart.m]);

    const emitDate = (ymd: string) => {
        if (mode === 'date') {
            onChange(ymd);
            setOpen(false);
            return;
        }
        onChange(`${ymd}T${pad(timePart.h)}:${pad(timePart.m)}:00`);
    };

    const emitDateTime = (h: number, m: number) => {
        const ymd = datePart || planningLocalDateKey(new Date());
        onChange(`${ymd}T${pad(h)}:${pad(m)}:00`);
    };

    const pop = open && (
        <div
            ref={popRef}
            className="fixed z-[300] w-[min(100vw-24px,520px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            style={{
                top: Math.min(
                    (anchorRef.current?.getBoundingClientRect().bottom ?? 0) + 8,
                    typeof window !== 'undefined' ? window.innerHeight - 420 : 0,
                ),
                left: Math.max(
                    12,
                    Math.min(
                        (anchorRef.current?.getBoundingClientRect().left ?? 12) - 8,
                        typeof window !== 'undefined' ? window.innerWidth - 540 : 12,
                    ),
                ),
            }}
        >
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                    <Calendar className="h-4 w-4 text-[#2149C1]" />
                    Date
                </div>
                <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Fermer">
                    <X className="h-4 w-4" />
                </button>
            </div>
            <div className={`flex gap-4 ${mode === 'datetime' ? 'flex-col sm:flex-row' : ''}`}>
                <div className="min-w-0 flex-1">
                    <MonthGrid
                        monthAnchor={monthAnchor}
                        selectedDateStr={datePart}
                        onSelectDate={emitDate}
                        settings={settings}
                        minDate={minDate}
                        maxDate={maxDate}
                        extraDisabled={disabledDays}
                        onPrevMonth={() => setMonthAnchor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1, 12, 0, 0, 0))}
                        onNextMonth={() => setMonthAnchor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1, 12, 0, 0, 0))}
                    />
                </div>
                {mode === 'datetime' && (
                    <div className="flex w-full shrink-0 flex-col border-t border-slate-100 pt-3 sm:w-36 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Heure</p>
                        <div className="max-h-56 overflow-y-auto pr-1 [scrollbar-width:thin]">
                            {slots.map(({ h, m }) => {
                                const active = timePart.h === h && timePart.m === m;
                                return (
                                    <button
                                        key={`${h}-${m}`}
                                        type="button"
                                        onClick={() => emitDateTime(h, m)}
                                        className={`mb-0.5 w-full rounded-lg py-1.5 text-left text-xs font-bold ${
                                            active ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                        {formatTimeLabel(h, m, fmt)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button type="button" className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100" onClick={() => setOpen(false)}>
                    Fermer
                </button>
                {mode === 'datetime' && (
                    <button
                        type="button"
                        className="rounded-xl bg-[#2149C1] px-4 py-2 text-sm font-bold text-white hover:bg-[#1a3ba5]"
                        onClick={() => setOpen(false)}
                    >
                        OK
                    </button>
                )}
            </div>
        </div>
    );

    const baseInp =
        inputClassName ||
        'w-full bg-slate-50 border border-slate-200 focus:border-[#2149C1] focus:ring-2 focus:ring-[#2149C1]/10 text-slate-800 rounded-xl px-4 py-2.5 outline-none text-sm transition flex items-center justify-between text-left';

    return (
        <div className={className}>
            {label && (
                <label htmlFor={uid} className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">
                    {label}
                </label>
            )}
            <button
                ref={anchorRef}
                id={uid}
                type="button"
                onClick={() => setOpen(o => !o)}
                className={baseInp}
            >
                <span className={datePart ? 'text-slate-800' : 'text-slate-400'}>{datePart ? displayLabel : 'Choisir…'}</span>
                <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
            {typeof document !== 'undefined' && open && createPortal(pop, document.body)}
        </div>
    );
}
