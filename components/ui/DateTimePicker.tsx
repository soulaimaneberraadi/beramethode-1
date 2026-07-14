import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, X } from 'lucide-react';
import type { AppSettings } from '../../types';
import MonthGrid from './MonthGrid';
import { planningLocalDateKey } from '../../utils/planning';
import { useLang } from '../../src/context/LanguageContext';
import { tx } from '../../lib/i18n';

export type DatePickerAgendaItem = {
    date: string;
    label: string;
    detail?: string;
    time?: string;
    tone?: 'indigo' | 'emerald' | 'amber' | 'blue' | 'slate';
};

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
    showIcon?: boolean;
    displayValue?: React.ReactNode;
    agendaItems?: DatePickerAgendaItem[];
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
    showIcon = true,
    displayValue,
    agendaItems = [],
}: DateTimePickerProps) {
    const { lang } = useLang();
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
    const cleanAgendaItems = useMemo(() => (
        agendaItems
            .map(item => ({ ...item, date: (item.date || '').split('T')[0] }))
            .filter(item => item.date)
    ), [agendaItems]);
    const markersByDate = useMemo(() => (
        cleanAgendaItems.reduce<Record<string, DatePickerAgendaItem[]>>((acc, item) => {
            (acc[item.date] ||= []).push(item);
            return acc;
        }, {})
    ), [cleanAgendaItems]);

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

    const isCompactViewport = typeof window !== 'undefined' && window.innerWidth < 640;
    const anchorRect = anchorRef.current?.getBoundingClientRect();
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;
    const desktopW = Math.min(420, viewportW - 24);
    const desktopTop = Math.max(12, Math.min((anchorRect?.bottom ?? 0) + 8, viewportH - 560));
    const desktopLeft = Math.max(12, Math.min((anchorRect?.left ?? 12) - 8, viewportW - desktopW - 12));

    const pop = open && (
        <div
            ref={popRef}
            className="fixed z-[300] overflow-y-auto rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-3 shadow-2xl sm:p-4"
            style={isCompactViewport
                ? {
                    left: 8,
                    right: 8,
                    bottom: 8,
                    maxHeight: 'min(82dvh, 620px)',
                    width: 'auto',
                  }
                : {
                    top: desktopTop,
                    left: desktopLeft,
                    width: desktopW,
                    maxHeight: 'min(78vh, 620px)',
                  }}
        >
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 dark:border-dk-border pb-2">
                <div className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-dk-text">
                    <Calendar className="h-4 w-4 text-[#2149C1]" />
                    {tx(lang, {fr:"Date",ar:"التاريخ",en:"Date",es:"Fecha",pt:"Data",tr:"Tarih"})}
                </div>
                <button type="button" className="rounded-lg p-1 text-slate-400 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated" onClick={() => setOpen(false)} aria-label={tx(lang, {fr:"Fermer",ar:"إغلاق",en:"Close",es:"Cerrar",pt:"Fechar",tr:"Kapat"})}>
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
                        markersByDate={markersByDate}
                        onPrevMonth={() => setMonthAnchor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1, 12, 0, 0, 0))}
                        onNextMonth={() => setMonthAnchor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1, 12, 0, 0, 0))}
                    />
                </div>
                {mode === 'datetime' && (
                    <div className="flex w-full shrink-0 flex-col border-t border-slate-100 dark:border-dk-border pt-3 sm:w-36 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted">{tx(lang, {fr:"Heure",ar:"الوقت",en:"Time",es:"Hora",pt:"Hora",tr:"Saat"})}</p>
                        <div className="max-h-56 overflow-y-auto pr-1 [scrollbar-width:thin]">
                            {slots.map(({ h, m }) => {
                                const active = timePart.h === h && timePart.m === m;
                                return (
                                    <button
                                        key={`${h}-${m}`}
                                        type="button"
                                        onClick={() => emitDateTime(h, m)}
                                        className={`mb-0.5 w-full rounded-lg py-1.5 text-left text-xs font-bold ${
                                            active ? 'bg-emerald-700 text-white' : 'text-slate-700 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
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
            {cleanAgendaItems.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-100 dark:border-dk-border bg-slate-50/80 dark:bg-dk-elevated/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted">
                            {tx(lang, {fr:'Agenda du pedido',ar:'جدول الطلب',en:'Order agenda',es:'Agenda del pedido',pt:'Agenda do pedido',tr:'Sipariş ajandası'})}
                        </p>
                        <p className="text-[10px] font-semibold text-slate-400 dark:text-dk-muted tabular-nums">
                            {cleanAgendaItems.length}
                        </p>
                    </div>
                    <div className="grid max-h-36 gap-1.5 overflow-y-auto pr-1 [scrollbar-width:thin] sm:max-h-44">
                        {cleanAgendaItems.map((item, idx) => {
                            const active = item.date === datePart;
                            const dot =
                                item.tone === 'emerald' ? 'bg-emerald-500' :
                                item.tone === 'amber' ? 'bg-amber-500' :
                                item.tone === 'blue' ? 'bg-blue-500' :
                                item.tone === 'slate' ? 'bg-slate-400' :
                                'bg-indigo-500';
                            return (
                                <div
                                    key={`${item.date}-${item.label}-${idx}`}
                                    className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                                        active
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100'
                                            : 'border-white/80 bg-white text-slate-700 dark:border-dk-border dark:bg-dk-surface dark:text-dk-text-soft'
                                    }`}
                                >
                                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${active ? 'bg-emerald-600' : dot}`} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            <span className="font-black">{item.label}</span>
                                            <span className="font-mono text-[11px] font-bold tabular-nums opacity-80">{item.date}</span>
                                            {item.time && <span className="font-mono text-[11px] font-bold tabular-nums opacity-80">{item.time}</span>}
                                        </div>
                                        {item.detail && <p className="mt-0.5 truncate text-[11px] font-medium opacity-75">{item.detail}</p>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-dk-border pt-3">
                <button type="button" className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:hover:bg-dk-elevated" onClick={() => setOpen(false)}>
                    {tx(lang, {fr:"Fermer",ar:"إغلاق",en:"Close",es:"Cerrar",pt:"Fechar",tr:"Kapat"})}
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
        'w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border focus:border-[#2149C1] focus:ring-2 focus:ring-[#2149C1]/10 text-slate-800 dark:text-dk-text rounded-xl px-4 py-2.5 outline-none text-sm transition flex items-center justify-between text-left';

    return (
        <div className={className}>
            {label && (
                <label htmlFor={uid} className="text-[10px] font-black text-slate-500 dark:text-dk-muted uppercase tracking-wider mb-1.5 block">
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
                <span className={datePart ? 'text-slate-800 dark:text-dk-text' : 'text-slate-400 dark:text-dk-muted'}>
                    {displayValue !== undefined ? displayValue : (datePart ? displayLabel : 'Choisir…')}
                </span>
                {showIcon && <Calendar className="h-4 w-4 shrink-0 text-slate-400 dark:text-dk-muted" />}
            </button>
            {typeof document !== 'undefined' && open && createPortal(pop, document.body)}
        </div>
    );
}
