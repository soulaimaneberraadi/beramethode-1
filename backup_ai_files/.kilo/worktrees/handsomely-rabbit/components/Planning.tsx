import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ModelData, PlanningEvent, PlanningStatus, SuiviData, AppSettings } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, Layers, Split, ArrowRightCircle,
    Plus, X, ChevronLeft, ChevronRight, Calendar,
    Clock, Target, Check, Trash2, Eye, Edit2,
    PanelLeftClose, PanelLeftOpen, Package, Ruler, Palette
} from 'lucide-react';

interface PlanningProps {
    models: ModelData[];
    planningEvents: PlanningEvent[];
    setPlanningEvents: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    setModels: React.Dispatch<React.SetStateAction<ModelData[]>>;
    setSuivis: React.Dispatch<React.SetStateAction<SuiviData[]>>;
    setCurrentView: (view: 'planning' | 'suivi' | 'dashboard' | 'atelier' | 'library' | 'coupe' | 'effectifs' | 'magasin' | 'config' | 'profil' | 'admin') => void;
    settings: AppSettings;
}

const STATUS_CONFIG: Record<string, { label: string; bar: string; bg: string; border: string; dot: string }> = {
    READY:            { label: 'Prêt',           bar: 'bg-emerald-500', bg: 'bg-emerald-900/40', border: 'border-emerald-500/70', dot: 'bg-emerald-400' },
    BLOCKED_STOCK:    { label: 'Bloqué Stock',   bar: 'bg-red-500',     bg: 'bg-red-900/40',     border: 'border-red-500/70',     dot: 'bg-red-400'     },
    EXTERNAL_PROCESS: { label: 'Sous-traitance', bar: 'bg-orange-500',  bg: 'bg-orange-900/40',  border: 'border-orange-500/70',  dot: 'bg-orange-400'  },
    IN_PROGRESS:      { label: 'En cours',       bar: 'bg-indigo-500',  bg: 'bg-indigo-900/40',  border: 'border-indigo-500/70',  dot: 'bg-indigo-400'  },
    DONE:             { label: 'Terminé',         bar: 'bg-gray-500',   bg: 'bg-gray-800/60',    border: 'border-gray-600/70',    dot: 'bg-gray-400'    },
    ON_TRACK:         { label: 'En cours',        bar: 'bg-indigo-500', bg: 'bg-indigo-900/40',  border: 'border-indigo-500/70',  dot: 'bg-indigo-400'  },
    AT_RISK:          { label: 'À risque',        bar: 'bg-amber-500',  bg: 'bg-amber-900/40',   border: 'border-amber-500/70',   dot: 'bg-amber-400'   },
    OFF_TRACK:        { label: 'Hors délai',      bar: 'bg-red-500',    bg: 'bg-red-900/40',     border: 'border-red-500/70',     dot: 'bg-red-400'     },
};

const DAY_WIDTH_MAP = { daily: 240, weekly: 120, monthly: 40 };

// ── Helpers ──────────────────────────────────────────────────────────────────

function getNetWorkHours(settings: AppSettings): number {
    const [sh, sm] = settings.workingHoursStart.split(':').map(Number);
    const [eh, em] = settings.workingHoursEnd.split(':').map(Number);
    const totalMins = (eh * 60 + em) - (sh * 60 + sm);
    const pauseMins = (settings.pauses || []).reduce((acc, p) => acc + (p.durationMin || 0), 0);
    return Math.max(1, (totalMins - pauseMins) / 60);
}

function isWorkingDay(date: Date, settings: AppSettings): boolean {
    const day = date.getDay(); // 0=Sun, 6=Sat
    const iso = date.toISOString().split('T')[0];
    const exception = settings.calendarExceptions?.[iso];
    if (exception) return exception.isWorking;
    // workingDays uses 1=Mon ... 7=Sun convention
    const converted = day === 0 ? 7 : day;
    return (settings.workingDays || [1, 2, 3, 4, 5]).includes(converted);
}

function addWorkingDays(startIso: string, daysNeeded: number, settings: AppSettings): Date {
    const d = new Date(startIso);
    let remaining = daysNeeded;
    while (remaining > 0) {
        d.setDate(d.getDate() + 1);
        if (isWorkingDay(d, settings)) remaining--;
    }
    return d;
}

function calculateEndDate(startIso: string, quantity: number, sam: number, efficiency: number, settings: AppSettings): string {
    const hoursPerDay = getNetWorkHours(settings);
    const baseTimeHrs = quantity * (sam / 60);
    const adjustedHrs = baseTimeHrs / Math.max(0.01, efficiency);
    const daysNeeded = Math.ceil(adjustedHrs / hoursPerDay);
    const end = addWorkingDays(startIso, Math.max(1, daysNeeded), settings);
    return end.toISOString();
}

function buildTimeline(refDate: Date): Date[] {
    const dates: Date[] = [];
    const start = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
    const end   = new Date(refDate.getFullYear(), refDate.getMonth() + 2, 0);
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d));
    }
    return dates;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Planning({ models, planningEvents, setPlanningEvents, setModels, setSuivis, setCurrentView, settings }: PlanningProps) {

    const [viewMode, setViewMode]     = useState<'daily' | 'weekly' | 'monthly'>('weekly');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedEvent, setSelectedEvent] = useState<PlanningEvent | null>(null);
    const [contextMenu, setContextMenu]     = useState<{ x: number; y: number; eventId: string } | null>(null);
    const [splitModal, setSplitModal]       = useState<PlanningEvent | null>(null);
    const [splitQty, setSplitQty]           = useState(0);
    const [addModal, setAddModal]           = useState(false);
    const [dragOverInfo, setDragOverInfo]   = useState<{ chaineId: string; dateIso: string } | null>(null);
    const [sidebarOpen, setSidebarOpen]     = useState(false); // مغلق افتراضياً
    const [editModal, setEditModal]         = useState<PlanningEvent | null>(null);
    const [editForm, setEditForm]           = useState({ quantity: 0, startDate: '', strictDeadline_DDS: '', chaineId: '', clientName: '' });

    // New event form state
    const [newEv, setNewEv] = useState({
        modelId: '',
        chaineId: 'CHAINE 1',
        startDate: new Date().toISOString().split('T')[0],
        quantity: 0,
        clientName: '',
        strictDeadline_DDS: '',
    });

    // Open edit modal
    const openEditModal = (ev: PlanningEvent) => {
        setEditModal(ev);
        setEditForm({
            quantity: ev.totalQuantity || ev.qteTotal || 0,
            startDate: (ev.startDate || ev.dateLancement || '').split('T')[0],
            strictDeadline_DDS: ev.strictDeadline_DDS || '',
            chaineId: ev.chaineId || '',
            clientName: ev.clientName || '',
        });
    };

    // Commit edit
    const commitEdit = () => {
        if (!editModal) return;
        const model  = models.find(m => m.id === editModal.modelId);
        const chaine = chaines.find(c => c.id === editForm.chaineId);
        const sam    = model?.meta_data.total_temps || 15;
        const endIso = calculateEndDate(editForm.startDate, editForm.quantity, sam, chaine?.efficiency || 0.85, settings);
        setPlanningEvents(prev => prev.map(ev => ev.id === editModal.id ? {
            ...ev,
            totalQuantity: editForm.quantity,
            qteTotal: editForm.quantity,
            startDate: editForm.startDate,
            dateLancement: editForm.startDate,
            estimatedEndDate: endIso,
            dateExport: endIso,
            strictDeadline_DDS: editForm.strictDeadline_DDS || undefined,
            chaineId: editForm.chaineId,
            clientName: editForm.clientName,
        } : ev));
        setEditModal(null);
    };

    const DAY_WIDTH = DAY_WIDTH_MAP[viewMode];
    const timelineRef = useRef<HTMLDivElement>(null);

    // Build chaines
    const chaines = useMemo(() => {
        return Array.from({ length: settings.chainsCount || 12 }, (_, i) => {
            const id = `CHAINE ${i + 1}`;
            return { id, name: settings.chainNames?.[id] || id, efficiency: 0.85 };
        });
    }, [settings.chainsCount, settings.chainNames]);

    // Build timeline dates
    const timelineDates = useMemo(() => buildTimeline(currentDate), [currentDate]);

    // Close context menu on click outside
    useEffect(() => {
        const handle = () => setContextMenu(null);
        window.addEventListener('click', handle);
        return () => window.removeEventListener('click', handle);
    }, []);

    // Today marker position
    const todayOffset = useMemo(() => {
        const today = new Date();
        const first = timelineDates[0];
        const diff = (today.getTime() - first.getTime()) / (1000 * 3600 * 24);
        return diff * DAY_WIDTH;
    }, [timelineDates, DAY_WIDTH]);

    // ── Event style (position + width) ──────────────────────────────────────
    const getEventStyle = (ev: PlanningEvent) => {
        const start = ev.startDate || ev.dateLancement;
        const end   = ev.estimatedEndDate || ev.dateExport;
        if (!start || !end) return { display: 'none' } as React.CSSProperties;
        const first = timelineDates[0];
        const offsetDays   = (new Date(start).getTime() - first.getTime()) / (1000 * 3600 * 24);
        const durationDays = Math.max(0.5, (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 3600 * 24));
        return { left: `${Math.max(0, offsetDays * DAY_WIDTH)}px`, width: `${durationDays * DAY_WIDTH}px` } as React.CSSProperties;
    };

    const getProgress = (ev: PlanningEvent) => {
        const qty  = ev.totalQuantity  || ev.qteTotal     || 1;
        const prod = ev.producedQuantity || ev.qteProduite || 0;
        return Math.min(100, Math.round((prod / qty) * 100));
    };

    const isAtRisk = (ev: PlanningEvent) => {
        if (ev.status === 'BLOCKED_STOCK') return true;
        const end = ev.estimatedEndDate || ev.dateExport;
        const dds = ev.strictDeadline_DDS;
        return !!(end && dds && new Date(end) > new Date(dds));
    };

    // ── Drag & Drop ──────────────────────────────────────────────────────────
    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData('eventId', id);
    };

    const handleDragOver = (e: React.DragEvent, chaineId: string, dateIso: string) => {
        e.preventDefault();
        setDragOverInfo({ chaineId, dateIso });
    };

    const handleDrop = (e: React.DragEvent, chaineId: string, dateIso: string) => {
        e.preventDefault();
        setDragOverInfo(null);
        const id = e.dataTransfer.getData('eventId');
        if (!id) return;
        setPlanningEvents(prev => prev.map(ev => {
            if (ev.id !== id) return ev;
            const chaine = chaines.find(c => c.id === chaineId);
            const model  = models.find(m => m.id === ev.modelId);
            const sam    = model?.meta_data.total_temps || 15;
            const qty    = ev.totalQuantity || ev.qteTotal || 0;
            const endIso = calculateEndDate(dateIso, qty, sam, chaine?.efficiency || 0.85, settings);
            return { ...ev, chaineId, startDate: dateIso, dateLancement: dateIso, estimatedEndDate: endIso, dateExport: endIso };
        }));
    };

    // ── Commit Split ─────────────────────────────────────────────────────────
    const commitSplit = () => {
        if (!splitModal) return;
        const origQty = splitModal.totalQuantity || splitModal.qteTotal || 1;
        if (splitQty <= 0 || splitQty >= origQty) { alert('Quantité invalide'); return; }
        const remQty  = origQty - splitQty;
        const chaine  = chaines.find(c => c.id === splitModal.chaineId);
        const model   = models.find(m => m.id === splitModal.modelId);
        const sam     = model?.meta_data.total_temps || 15;
        const start   = splitModal.startDate || splitModal.dateLancement || new Date().toISOString();
        const eff     = chaine?.efficiency || 0.85;

        const newOrigEnd  = calculateEndDate(start, remQty,  sam, eff, settings);
        const newSplitEnd = calculateEndDate(start, splitQty, sam, eff, settings);

        const cloned: PlanningEvent = {
            ...splitModal,
            id: `event_${Date.now()}`,
            totalQuantity: splitQty, qteTotal: splitQty,
            producedQuantity: 0, qteProduite: 0,
            status: 'READY',
            estimatedEndDate: newSplitEnd, dateExport: newSplitEnd,
        };

        setPlanningEvents(prev => [
            ...prev.map(ev => ev.id === splitModal.id
                ? { ...ev, totalQuantity: remQty, qteTotal: remQty, estimatedEndDate: newOrigEnd, dateExport: newOrigEnd }
                : ev),
            cloned
        ]);
        setSplitModal(null); setSplitQty(0);
    };

    // ── Add New Event ────────────────────────────────────────────────────────
    const commitAddEvent = () => {
        if (!newEv.modelId || newEv.quantity <= 0) { alert('Modèle et quantité requis'); return; }
        const model  = models.find(m => m.id === newEv.modelId);
        const chaine = chaines.find(c => c.id === newEv.chaineId);
        const sam    = model?.meta_data.total_temps || 15;
        const endIso = calculateEndDate(newEv.startDate, newEv.quantity, sam, chaine?.efficiency || 0.85, settings);
        const ev: PlanningEvent = {
            id: `event_${Date.now()}`,
            modelId: newEv.modelId,
            chaineId: newEv.chaineId,
            dateLancement: newEv.startDate, startDate: newEv.startDate,
            dateExport: endIso, estimatedEndDate: endIso,
            qteTotal: newEv.quantity, totalQuantity: newEv.quantity,
            qteProduite: 0, producedQuantity: 0,
            status: 'READY',
            modelName: model?.meta_data.nom_modele || 'Nouveau',
            clientName: newEv.clientName || model?.ficheData?.client || '',
            strictDeadline_DDS: newEv.strictDeadline_DDS || undefined,
        };
        setPlanningEvents(prev => [ev, ...prev]);
        setAddModal(false);
        setNewEv({ modelId: '', chaineId: 'CHAINE 1', startDate: new Date().toISOString().split('T')[0], quantity: 0, clientName: '', strictDeadline_DDS: '' });
    };

    // ── Stats ────────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const total    = planningEvents.length;
        const blocked  = planningEvents.filter(e => e.status === 'BLOCKED_STOCK').length;
        const inProg   = planningEvents.filter(e => e.status === 'IN_PROGRESS' || e.status === 'ON_TRACK').length;
        const done     = planningEvents.filter(e => e.status === 'DONE').length;
        const atRisk   = planningEvents.filter(e => isAtRisk(e)).length;
        return { total, blocked, inProg, done, atRisk };
    }, [planningEvents]);

    // ── RENDER ───────────────────────────────────────────────────────────────
    return (
        <div className="h-full flex flex-col bg-gray-950 text-gray-200 font-sans overflow-hidden select-none">

            {/* ── Header ── */}
            <header className="shrink-0 bg-gray-900 border-b border-gray-800 shadow-lg">
                <div className="flex items-center justify-between px-6 py-3 gap-4">
                    {/* Title */}
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)]">
                            <Calendar className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h1 className="text-base font-black text-white tracking-tight leading-none">Planning Production</h1>
                            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest mt-0.5">Gantt Scheduler — {chaines.length} lignes</p>
                        </div>
                    </div>

                    {/* Stats pills */}
                    <div className="hidden lg:flex items-center gap-2">
                        {[
                            { label: 'Ordres',  val: stats.total,   color: 'bg-gray-800 text-gray-300' },
                            { label: 'En cours', val: stats.inProg, color: 'bg-indigo-900/60 text-indigo-300' },
                            { label: 'Bloqués', val: stats.blocked, color: 'bg-red-900/60 text-red-300' },
                            { label: 'À risque', val: stats.atRisk, color: 'bg-amber-900/60 text-amber-300' },
                            { label: 'Terminés', val: stats.done,   color: 'bg-emerald-900/60 text-emerald-300' },
                        ].map(s => (
                            <div key={s.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${s.color}`}>
                                <span className="opacity-70">{s.label}</span>
                                <span className="text-sm font-black">{s.val}</span>
                            </div>
                        ))}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2">
                        {/* View Mode */}
                        <div className="flex bg-gray-950 rounded-lg border border-gray-800 p-1 gap-1">
                            {(['daily', 'weekly', 'monthly'] as const).map(v => (
                                <button
                                    key={v}
                                    onClick={() => setViewMode(v)}
                                    className={`px-3 py-1 rounded-md text-xs font-bold capitalize transition-all ${viewMode === v ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                                >{v}</button>
                            ))}
                        </div>

                        {/* Month nav */}
                        <div className="flex items-center gap-1 bg-gray-950 rounded-lg border border-gray-800 p-1">
                            <button onClick={() => setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })} className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs font-bold text-gray-300 px-2 min-w-[90px] text-center">
                                {currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={() => setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })} className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Today button */}
                        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold rounded-lg border border-gray-700 transition-all">
                            Auj.
                        </button>

                        {/* Add button */}
                        <button
                            onClick={() => setAddModal(true)}
                            className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.5)]"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Planifier
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Main Board ── */}
            <div className="flex-1 flex overflow-hidden">

                {/* Sidebar */}
                <div className={`shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col z-10 transition-all duration-300 ${sidebarOpen ? 'w-60' : 'w-12'}`}>
                    {/* Toggle button */}
                    <div className="h-12 shrink-0 border-b border-gray-800 flex items-center justify-between px-2 bg-gray-950">
                        {sidebarOpen && <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] pl-2">Lignes</span>}
                        <button
                            onClick={() => setSidebarOpen(v => !v)}
                            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-indigo-400 transition-colors ml-auto"
                            title={sidebarOpen ? 'Réduire' : 'Ouvrir lignes'}
                        >
                            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto overflow-x-hidden">
                        {chaines.map(ch => {
                            const evCount = planningEvents.filter(e => e.chaineId === ch.id).length;
                            return (
                                <div key={ch.id} className="h-24 px-2 flex flex-col justify-center border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                                    {sidebarOpen ? (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] shrink-0" />
                                                <h3 className="font-bold text-gray-200 text-sm truncate">{ch.name}</h3>
                                            </div>
                                            <div className="flex items-center justify-between mt-1.5">
                                                <span className="text-[10px] text-gray-600 font-semibold">Eff. {Math.round(ch.efficiency * 100)}%</span>
                                                {evCount > 0 && <span className="text-[9px] bg-indigo-900/60 text-indigo-300 font-bold px-1.5 py-0.5 rounded-full">{evCount}</span>}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                            {evCount > 0 && <span className="text-[9px] text-indigo-300 font-black">{evCount}</span>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Timeline area */}
                <div className="flex-1 overflow-auto relative" ref={timelineRef} style={{ scrollBehavior: 'smooth' }}>
                    {/* Total width container */}
                    <div style={{ width: timelineDates.length * DAY_WIDTH, minWidth: '100%' }}>

                        {/* Date header */}
                        <div className="h-12 flex sticky top-0 z-20 bg-gray-900 border-b border-gray-800 shadow-md">
                            {timelineDates.map(date => {
                                const isWeekend = !isWorkingDay(date, settings);
                                const isToday   = date.toDateString() === new Date().toDateString();
                                return (
                                    <div
                                        key={date.toISOString()}
                                        style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                                        className={`shrink-0 border-r flex flex-col items-center justify-center transition-colors
                                            ${isToday   ? 'bg-indigo-900/40 border-indigo-700' :
                                              isWeekend ? 'bg-gray-900/60 border-gray-800/40 text-gray-700' :
                                                          'border-gray-800/50 text-gray-400'}`}
                                    >
                                        <span className="text-[9px] uppercase font-black tracking-wider">
                                            {date.toLocaleDateString('fr-FR', { weekday: viewMode === 'daily' ? 'short' : 'narrow' })}
                                        </span>
                                        <span className={`font-black text-sm ${isToday ? 'text-indigo-300' : isWeekend ? 'text-gray-700' : 'text-gray-300'}`}>
                                            {date.getDate()}{viewMode !== 'daily' && date.getDate() === 1 ? ` ${date.toLocaleDateString('fr-FR', { month: 'short' })}` : ''}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Grid rows */}
                        <div className="relative">
                            {/* Grid lines background */}
                            <div className="absolute inset-0 flex pointer-events-none">
                                {timelineDates.map(date => {
                                    const isWeekend = !isWorkingDay(date, settings);
                                    return (
                                        <div
                                            key={'g' + date.toISOString()}
                                            style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                                            className={`shrink-0 h-full border-r ${isWeekend ? 'bg-gray-900/40 border-gray-800/20' : 'border-gray-800/20'}`}
                                        />
                                    );
                                })}
                            </div>

                            {/* Today vertical line */}
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-indigo-500/60 z-10 pointer-events-none"
                                style={{ left: todayOffset + DAY_WIDTH / 2 }}
                            >
                                <div className="w-2 h-2 rounded-full bg-indigo-400 -translate-x-[3px] -translate-y-[1px]" />
                            </div>

                            {/* Chaine rows */}
                            {chaines.map(ch => {
                                const chaineEvents = planningEvents.filter(e => e.chaineId === ch.id);
                                return (
                                    <div key={ch.id} className="h-24 relative border-b border-gray-800/30 flex hover:bg-gray-900/10 transition-colors group">
                                        {/* Drop zones */}
                                        {timelineDates.map(date => (
                                            <div
                                                key={`dz-${ch.id}-${date.toISOString()}`}
                                                style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                                                className={`shrink-0 h-full relative transition-colors ${dragOverInfo?.chaineId === ch.id && dragOverInfo?.dateIso === date.toISOString() ? 'bg-indigo-900/30' : ''}`}
                                                onDragOver={e => handleDragOver(e, ch.id, date.toISOString())}
                                                onDragLeave={() => setDragOverInfo(null)}
                                                onDrop={e => handleDrop(e, ch.id, date.toISOString())}
                                            />
                                        ))}

                                        {/* Event bars */}
                                        {chaineEvents.map(ev => {
                                            const cfg      = STATUS_CONFIG[ev.status] || STATUS_CONFIG.ON_TRACK;
                                            const progress = getProgress(ev);
                                            const risk     = isAtRisk(ev);
                                            const qty      = ev.totalQuantity  || ev.qteTotal     || 0;
                                            const prod     = ev.producedQuantity || ev.qteProduite  || 0;
                                            const name     = ev.modelName || models.find(m => m.id === ev.modelId)?.meta_data.nom_modele || 'Ordre';
                                            const client   = ev.clientName || models.find(m => m.id === ev.modelId)?.ficheData?.client || '';

                                            return (
                                                <div
                                                    key={ev.id}
                                                    draggable
                                                    onDragStart={e => handleDragStart(e, ev.id)}
                                                    onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                                                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, eventId: ev.id }); }}
                                                    style={getEventStyle(ev)}
                                                    className={`absolute top-2 bottom-2 rounded-lg border cursor-grab active:cursor-grabbing 
                                                        flex flex-col p-2 overflow-hidden text-xs transition-all hover:brightness-110
                                                        ${cfg.bg} ${cfg.border}
                                                        ${risk ? 'animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]' : 'shadow-md'}`}
                                                >
                                                    <div className="flex items-start justify-between gap-1 mb-0.5">
                                                        <span className="font-bold text-white/90 truncate leading-tight">{name}</span>
                                                        {risk && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
                                                    </div>
                                                    {client && <div className="text-[10px] text-white/50 truncate">{client}</div>}
                                                    <div className="mt-auto">
                                                        <div className="flex justify-between text-[10px] font-bold text-white/60 mb-1">
                                                            <span>{prod}/{qty} pcs</span>
                                                            <span>{progress}%</span>
                                                        </div>
                                                        <div className="h-1 bg-black/30 rounded-full overflow-hidden">
                                                            <div className={`h-full ${cfg.bar} opacity-80 transition-all`} style={{ width: `${progress}%` }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}

                            {/* Empty state */}
                            {planningEvents.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                                    <div className="w-20 h-20 rounded-2xl bg-gray-800/60 border border-gray-700 flex items-center justify-center">
                                        <Calendar className="w-8 h-8 text-gray-600" />
                                    </div>
                                    <div>
                                        <p className="text-gray-400 font-bold text-base">Aucun ordre planifié</p>
                                        <p className="text-gray-600 text-sm mt-1">Cliquez sur "Planifier" pour créer votre premier ordre</p>
                                    </div>
                                    <button onClick={() => setAddModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm shadow-lg transition-all">
                                        <Plus className="w-4 h-4" /> Planifier un ordre
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ══ MODALS ══════════════════════════════════════════════════════════ */}

            {/* 1. Quick View Modal */}
            <AnimatePresence>
                {selectedEvent && (() => {
                    const ev  = selectedEvent;
                    const cfg = STATUS_CONFIG[ev.status] || STATUS_CONFIG.ON_TRACK;
                    const qty    = ev.totalQuantity    || ev.qteTotal     || 0;
                    const prod   = ev.producedQuantity || ev.qteProduite  || 0;
                    const prog   = getProgress(ev);
                    const chain  = chaines.find(c => c.id === ev.chaineId);
                    const model  = models.find(m => m.id === ev.modelId);
                    const name   = ev.modelName   || model?.meta_data.nom_modele || 'Ordre';
                    const client = ev.clientName  || model?.ficheData?.client    || '—';
                    return (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4"
                            onClick={() => setSelectedEvent(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
                                onClick={e => e.stopPropagation()}
                            >
                                {/* Top accent */}
                                <div className={`h-1 w-full ${cfg.bar}`} />
                                <div className="p-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <h2 className="text-xl font-black text-white">{name}</h2>
                                            <p className="text-sm text-gray-400 mt-0.5">{client}</p>
                                        </div>
                                        <button onClick={() => setSelectedEvent(null)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Progress */}
                                    <div className="bg-gray-950 rounded-xl p-4 mb-4 border border-gray-800">
                                        <div className="flex justify-between items-end mb-2">
                                            <div>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Avancement</p>
                                                <p className="text-2xl font-black text-white mt-0.5">{prog}<span className="text-gray-500 text-base">%</span></p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-gray-500 font-bold uppercase">Produit / Objectif</p>
                                                <p className="text-sm font-bold text-gray-300 mt-0.5"><span className="text-emerald-400">{prod}</span> / {qty} pcs</p>
                                            </div>
                                        </div>
                                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                            <div className={`h-full ${cfg.bar} transition-all`} style={{ width: `${prog}%` }} />
                                        </div>
                                    </div>

                                    {/* Info grid */}
                                    <div className="space-y-2 text-sm">
                                        {[
                                            { label: 'Ligne', val: chain?.name || ev.chaineId },
                                            { label: 'Statut', val: cfg.label },
                                            { label: 'Lancement', val: (ev.startDate || ev.dateLancement || '—').split('T')[0] },
                                            { label: 'Fin estimée', val: (ev.estimatedEndDate || ev.dateExport || '—').split('T')[0] },
                                            { label: 'DDS', val: ev.strictDeadline_DDS || 'Non défini' },
                                        ].map(row => (
                                            <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-gray-800 last:border-0">
                                                <span className="text-gray-500">{row.label}</span>
                                                <span className="text-gray-200 font-bold">{row.val}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {/* Fiche Technique details */}
                                {(() => {
                                    const fd = model?.ficheData;
                                    const mats = fd?.materials || [];
                                    const sizes = fd?.sizes || model?.meta_data.sizes || [];
                                    const colors = fd?.colors || model?.meta_data.colors || [];
                                    const gridQty = fd?.gridQuantities || {};
                                    if (!fd && mats.length === 0 && sizes.length === 0) return null;
                                    return (
                                        <div className="mx-6 mb-4 bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
                                            <div className="px-4 py-2 border-b border-gray-800 text-[10px] font-black text-gray-500 uppercase tracking-widest">Fiche Technique</div>
                                            <div className="p-3 space-y-2">
                                                {sizes.length > 0 && (
                                                    <div className="flex items-start gap-2">
                                                        <Ruler className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                                                        <div>
                                                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Tailles</p>
                                                            <div className="flex flex-wrap gap-1">
                                                                {sizes.map(s => (
                                                                    <span key={s} className="px-2 py-0.5 bg-indigo-900/40 text-indigo-300 text-[10px] font-black rounded-md border border-indigo-700/30">
                                                                        {s}{gridQty[s] ? ` (${gridQty[s]})` : ''}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                {colors.length > 0 && (
                                                    <div className="flex items-start gap-2">
                                                        <Palette className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                                                        <div>
                                                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Coloris</p>
                                                            <div className="flex flex-wrap gap-1">
                                                                {colors.map(c => (
                                                                    <span key={c.id} className="px-2 py-0.5 bg-purple-900/40 text-purple-300 text-[10px] font-black rounded-md border border-purple-700/30">{c.name}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                {mats.length > 0 && (
                                                    <div className="flex items-start gap-2">
                                                        <Package className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                                                        <div className="flex-1">
                                                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Fournitures / Matières</p>
                                                            <div className="space-y-1">
                                                                {mats.map(m => (
                                                                    <div key={m.id} className="flex justify-between items-center">
                                                                        <span className="text-[10px] text-gray-300 font-semibold truncate max-w-[160px]">{m.name}</span>
                                                                        <span className="text-[10px] text-amber-300 font-black ml-2 shrink-0">{m.qty} {m.unit}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div className="bg-gray-950 p-4 flex gap-3">
                                    <button
                                        onClick={() => { setCurrentView('suivi'); setSelectedEvent(null); }}
                                        className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
                                    >
                                        <Eye className="w-4 h-4" /> Suivi
                                    </button>
                                    <button
                                        onClick={() => { openEditModal(ev); setSelectedEvent(null); }}
                                        className="flex items-center justify-center gap-2 px-4 border border-indigo-700/50 hover:bg-indigo-900/40 text-indigo-400 font-bold py-2.5 rounded-xl text-sm transition-colors"
                                        title="Modifier"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => { setSplitModal(ev); setSelectedEvent(null); }}
                                        className="flex items-center justify-center gap-2 px-4 border border-gray-700 hover:bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl text-sm transition-colors"
                                        title="Fractionner"
                                    >
                                        <Split className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => { if (window.confirm('Supprimer cet ordre ?')) { setPlanningEvents(p => p.filter(e => e.id !== ev.id)); setSelectedEvent(null); } }}
                                        className="flex items-center justify-center gap-2 px-4 border border-red-800/50 hover:bg-red-900/40 text-red-400 font-bold py-2.5 rounded-xl text-sm transition-colors"
                                        title="Supprimer"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* 2. Context Menu */}
            <AnimatePresence>
                {contextMenu && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                        className="fixed z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl py-2 w-52 text-sm"
                        style={{ left: Math.min(contextMenu.x, window.innerWidth - 210), top: Math.min(contextMenu.y, window.innerHeight - 200) }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-3 pb-2 mb-1 border-b border-gray-800 text-[10px] font-black text-gray-500 uppercase tracking-widest">Actions rapides</div>
                        {([
                            { label: 'Marquer PRÊT',     status: 'READY',          color: 'hover:bg-emerald-700 hover:text-white',  dot: 'bg-emerald-500' },
                            { label: 'En cours',          status: 'IN_PROGRESS',    color: 'hover:bg-indigo-700 hover:text-white',   dot: 'bg-indigo-500'  },
                            { label: 'Bloquer (Stock)',   status: 'BLOCKED_STOCK',  color: 'hover:bg-red-700 hover:text-white',      dot: 'bg-red-500'     },
                            { label: 'Sous-traitance',    status: 'EXTERNAL_PROCESS', color: 'hover:bg-orange-700 hover:text-white', dot: 'bg-orange-500'  },
                            { label: 'Terminé',           status: 'DONE',           color: 'hover:bg-gray-700 hover:text-white',     dot: 'bg-gray-500'    },
                        ] as const).map(item => (
                            <button key={item.status}
                                className={`w-full text-left px-4 py-2 text-gray-300 flex items-center gap-3 transition-colors ${item.color}`}
                                onClick={() => { setPlanningEvents(p => p.map(e => e.id === contextMenu.eventId ? { ...e, status: item.status } : e)); setContextMenu(null); }}
                            >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${item.dot}`} />
                                {item.label}
                            </button>
                        ))}
                        <div className="h-px bg-gray-800 my-1" />
                        <button className="w-full text-left px-4 py-2 text-gray-300 hover:bg-gray-800 flex items-center gap-3 transition-colors"
                            onClick={() => { const ev = planningEvents.find(e => e.id === contextMenu.eventId); if (ev) { setSplitModal(ev); } setContextMenu(null); }}>
                            <Split className="w-3.5 h-3.5 text-indigo-400" /> Fractionner
                        </button>
                        <button className="w-full text-left px-4 py-2 text-indigo-400 hover:bg-indigo-800/40 flex items-center gap-3 font-bold transition-colors"
                            onClick={() => { setCurrentView('suivi'); setContextMenu(null); }}>
                            <ArrowRightCircle className="w-3.5 h-3.5" /> Voir dans Suivi
                        </button>
                        <div className="h-px bg-gray-800 my-1" />
                        <button className="w-full text-left px-4 py-2 text-red-400 hover:bg-red-900/30 flex items-center gap-3 transition-colors"
                            onClick={() => { if (window.confirm('Supprimer cet ordre ?')) { setPlanningEvents(p => p.filter(e => e.id !== contextMenu.eventId)); } setContextMenu(null); }}>
                            <Trash2 className="w-3.5 h-3.5" /> Supprimer
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 3. Split Modal */}
            <AnimatePresence>
                {splitModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setSplitModal(null)}
                    >
                        <motion.div initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
                            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-9 h-9 rounded-lg bg-indigo-900/60 flex items-center justify-center">
                                    <Split className="w-4 h-4 text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="font-black text-white">Fractionner l'ordre</h3>
                                    <p className="text-xs text-gray-500">{splitModal.modelName || 'Ordre'} — {splitModal.totalQuantity || splitModal.qteTotal} pcs total</p>
                                </div>
                            </div>
                            <p className="text-sm text-gray-400 mb-4">Combien de pièces voulez-vous extraire ?</p>
                            <input
                                type="number" min={1} max={(splitModal.totalQuantity || splitModal.qteTotal || 1) - 1}
                                className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-4 py-3 outline-none font-mono text-xl mb-2 transition-colors"
                                placeholder={`1 – ${(splitModal.totalQuantity || splitModal.qteTotal || 2) - 1}`}
                                value={splitQty || ''}
                                onChange={e => setSplitQty(parseInt(e.target.value) || 0)}
                            />
                            {splitQty > 0 && (
                                <div className="flex gap-2 text-xs text-gray-500 mb-4">
                                    <span>Lot 1: <strong className="text-gray-300">{(splitModal.totalQuantity || splitModal.qteTotal || 0) - splitQty} pcs</strong></span>
                                    <span>·</span>
                                    <span>Lot 2: <strong className="text-gray-300">{splitQty} pcs</strong></span>
                                </div>
                            )}
                            <div className="flex gap-3">
                                <button onClick={() => { setSplitModal(null); setSplitQty(0); }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">Annuler</button>
                                <button onClick={commitSplit} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                                    <Check className="w-4 h-4" /> Confirmer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 4. Add Event Modal */}
            <AnimatePresence>
                {addModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setAddModal(false)}
                    >
                        <motion.div initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
                            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-indigo-900/60 flex items-center justify-center">
                                        <Plus className="w-4 h-4 text-indigo-400" />
                                    </div>
                                    <h3 className="font-black text-white">Planifier un ordre</h3>
                                </div>
                                <button onClick={() => setAddModal(false)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                {/* Model select */}
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Modèle *</label>
                                    <select
                                        className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-4 py-2.5 outline-none text-sm transition-colors"
                                        value={newEv.modelId}
                                        onChange={e => {
                                            const m = models.find(mod => mod.id === e.target.value);
                                            setNewEv(p => ({ ...p, modelId: e.target.value, clientName: m?.ficheData?.client || '', quantity: m?.ficheData?.quantity || m?.meta_data.quantity || 0 }));
                                        }}
                                    >
                                        <option value="">-- Choisir un modèle --</option>
                                        {models.map(m => <option key={m.id} value={m.id}>{m.meta_data.nom_modele}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    {/* Chaine */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Ligne *</label>
                                        <select
                                            className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-4 py-2.5 outline-none text-sm transition-colors"
                                            value={newEv.chaineId}
                                            onChange={e => setNewEv(p => ({ ...p, chaineId: e.target.value }))}
                                        >
                                            {chaines.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    {/* Quantity */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Quantité *</label>
                                        <input
                                            type="number" min={1}
                                            className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-4 py-2.5 outline-none text-sm transition-colors"
                                            placeholder="ex: 2500"
                                            value={newEv.quantity || ''}
                                            onChange={e => setNewEv(p => ({ ...p, quantity: parseInt(e.target.value) || 0 }))}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    {/* Start date */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Date lancement *</label>
                                        <input
                                            type="date"
                                            className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-4 py-2.5 outline-none text-sm transition-colors"
                                            value={newEv.startDate}
                                            onChange={e => setNewEv(p => ({ ...p, startDate: e.target.value }))}
                                        />
                                    </div>
                                    {/* DDS */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">DDS (deadline)</label>
                                        <input
                                            type="date"
                                            className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-4 py-2.5 outline-none text-sm transition-colors"
                                            value={newEv.strictDeadline_DDS}
                                            onChange={e => setNewEv(p => ({ ...p, strictDeadline_DDS: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                {/* Client */}
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Client</label>
                                    <input
                                        type="text"
                                        className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-4 py-2.5 outline-none text-sm transition-colors"
                                        placeholder="Nom du client"
                                        value={newEv.clientName}
                                        onChange={e => setNewEv(p => ({ ...p, clientName: e.target.value }))}
                                    />
                                </div>

                                {/* Preview */}
                                {newEv.modelId && newEv.quantity > 0 && (() => {
                                    const m   = models.find(mod => mod.id === newEv.modelId);
                                    const sam = m?.meta_data.total_temps || 15;
                                    const ch  = chaines.find(c => c.id === newEv.chaineId);
                                    const endIso = calculateEndDate(newEv.startDate, newEv.quantity, sam, ch?.efficiency || 0.85, settings);
                                    return (
                                        <div className="bg-indigo-900/20 border border-indigo-700/40 rounded-xl p-3 text-xs text-indigo-300">
                                            <span className="font-bold">Fin estimée :</span> {endIso.split('T')[0]}
                                            <span className="ml-3 text-indigo-500">SAM: {sam} min</span>
                                        </div>
                                    );
                                })()}
                            </div>
                            <div className="p-4 bg-gray-950 flex gap-3">
                                <button onClick={() => setAddModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">Annuler</button>
                                <button onClick={commitAddEvent} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                                    <Plus className="w-4 h-4" /> Créer l'ordre
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 5. Edit Event Modal */}
            <AnimatePresence>
                {editModal && (() => {
                    const model = models.find(m => m.id === editModal.modelId);
                    const sam   = model?.meta_data.total_temps || 15;
                    const ch    = chaines.find(c => c.id === editForm.chaineId);
                    const previewEnd = editForm.startDate && editForm.quantity > 0
                        ? calculateEndDate(editForm.startDate, editForm.quantity, sam, ch?.efficiency || 0.85, settings).split('T')[0]
                        : null;
                    return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                            onClick={() => setEditModal(null)}
                        >
                            <motion.div initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
                                className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="p-5 border-b border-gray-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-900/60 flex items-center justify-center">
                                            <Edit2 className="w-4 h-4 text-indigo-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-white text-sm">Modifier l'ordre</h3>
                                            <p className="text-[10px] text-gray-500">{editModal.modelName || model?.meta_data.nom_modele}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setEditModal(null)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Ligne (Chaîne)</label>
                                            <select
                                                className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-3 py-2 outline-none text-sm transition-colors"
                                                value={editForm.chaineId}
                                                onChange={e => setEditForm(p => ({ ...p, chaineId: e.target.value }))}
                                            >
                                                {chaines.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Quantité</label>
                                            <input
                                                type="number" min={1}
                                                className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-3 py-2 outline-none text-sm transition-colors"
                                                value={editForm.quantity || ''}
                                                onChange={e => setEditForm(p => ({ ...p, quantity: parseInt(e.target.value) || 0 }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Date Lancement</label>
                                            <input
                                                type="date"
                                                className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-3 py-2 outline-none text-sm transition-colors"
                                                value={editForm.startDate}
                                                onChange={e => setEditForm(p => ({ ...p, startDate: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">DDS (Deadline)</label>
                                            <input
                                                type="date"
                                                className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-3 py-2 outline-none text-sm transition-colors"
                                                value={editForm.strictDeadline_DDS}
                                                onChange={e => setEditForm(p => ({ ...p, strictDeadline_DDS: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Client</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 text-white rounded-xl px-3 py-2 outline-none text-sm transition-colors"
                                            value={editForm.clientName}
                                            onChange={e => setEditForm(p => ({ ...p, clientName: e.target.value }))}
                                        />
                                    </div>
                                    {previewEnd && (
                                        <div className="bg-indigo-900/20 border border-indigo-700/40 rounded-xl p-3 text-xs text-indigo-300">
                                            <span className="font-bold">Fin estimée :</span> {previewEnd}
                                            <span className="ml-3 text-indigo-500">SAM: {sam} min</span>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 bg-gray-950 flex gap-3">
                                    <button onClick={() => setEditModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">Annuler</button>
                                    <button onClick={commitEdit} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                                        <Check className="w-4 h-4" /> Enregistrer
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>
        </div>
    );
}
