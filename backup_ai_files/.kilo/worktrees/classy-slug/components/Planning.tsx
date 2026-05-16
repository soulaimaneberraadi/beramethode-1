import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ModelData, PlanningEvent, PlanningStatus, SuiviData, AppSettings } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar as CalendarIcon, Clock, MoreHorizontal,
    Search, LayoutDashboard, Target, Users, AlertTriangle, Layers, Split, ArrowRightCircle
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

const STATUS_UI: Record<string, { base: string, dot: string }> = {
    READY: { base: 'border-emerald-500 bg-emerald-900/50 text-emerald-100', dot: 'bg-emerald-500' },
    BLOCKED_STOCK: { base: 'border-red-500 bg-red-900/50 text-red-100', dot: 'bg-red-500' },
    EXTERNAL_PROCESS: { base: 'border-orange-500 bg-orange-900/50 text-orange-100', dot: 'bg-orange-500' },
    IN_PROGRESS: { base: 'border-indigo-500 bg-indigo-900/50 text-indigo-100', dot: 'bg-indigo-500' },
    COMPLETED: { base: 'border-gray-500 bg-gray-900/50 text-gray-300', dot: 'bg-gray-500' },
    DONE: { base: 'border-gray-500 bg-gray-900/50 text-gray-300', dot: 'bg-gray-500' },
    ON_TRACK: { base: 'border-indigo-500 bg-indigo-900/50 text-indigo-100', dot: 'bg-indigo-500' },
    AT_RISK: { base: 'border-amber-500 bg-amber-900/50 text-amber-100', dot: 'bg-amber-500' },
    OFF_TRACK: { base: 'border-red-500 bg-red-900/50 text-red-100', dot: 'bg-red-500' },
};

export default function Planning({ models, planningEvents, setPlanningEvents, setModels, setSuivis, setCurrentView, settings }: PlanningProps) {
    const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
    const [currentDate, setCurrentDate] = useState(new Date());

    const [selectedEvent, setSelectedEvent] = useState<PlanningEvent | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, eventId: string } | null>(null);
    const [splitModalData, setSplitModalData] = useState<PlanningEvent | null>(null);
    const [newSplitQuantity, setNewSplitQuantity] = useState<number>(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    const DAY_WIDTH_MAP = { daily: 240, weekly: 120, monthly: 40 };
    const DAY_WIDTH = DAY_WIDTH_MAP[viewMode];

    // Close Modals
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, []);

    // Derived Chaines
    const chaines = useMemo(() => {
        return Array.from({ length: settings.chainsCount }, (_, i) => {
            const id = `CHAINE ${i + 1}`;
            return {
                id,
                name: settings.chainNames?.[id] || id,
                efficiency: 0.85, // Mock efficiency 85%
                isActive: true
            };
        });
    }, [settings.chainsCount, settings.chainNames]);

    // Timeline Builder
    const timelineDates = useMemo(() => {
        const dates = [];
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
        }
        return dates;
    }, [currentDate]);

    // --- MATH LOGIC ---
    // STEP 5: DRAG & DROP MATH & DATE CALCULATION
    const calculateEndDate = (startDateIso: string, quantity: number, modelId: string, chaineEfficiency: number) => {
        const model = models.find(m => m.id === modelId);
        const stdTime = model?.meta_data.total_temps || 15; // SAM = 15 mins fallback
        
        // 1. Base Time = totalQuantity * (SAM / 60) to get hours.
        const baseTimeHrs = quantity * (stdTime / 60);
        
        // 2. Adjusted Time = Base Time / Chaine.efficiency
        const adjustedTimeHrs = baseTimeHrs / chaineEfficiency;
        
        // 3. Add adjusted time to start date (Simple 24h mockup, enhanced by checkHolidays later)
        const startD = new Date(startDateIso);
        
        // Factory works ~10 hours a day (from AppSettings typically)
        const worksHoursPerDay = 10;
        const daysRequired = adjustedTimeHrs / worksHoursPerDay;
        
        let endD = new Date(startD);
        endD.setHours(endD.getHours() + (daysRequired * 24)); // Roughly adding days

        // STEP 6: AUTO-SHIFT LOGIC (checkHolidays)
        // If weekend, push it out
        if (endD.getDay() === 0 || endD.getDay() === 6) {
            endD.setDate(endD.getDate() + (endD.getDay() === 6 ? 2 : 1)); // Add 48h or 24h if weekend
        }
        
        return endD.toISOString();
    };

    // --- HANDLERS ---
    const handleDragStart = (e: React.DragEvent, eventId: string) => {
        e.dataTransfer.setData("eventId", eventId);
    };

    const handleDrop = (e: React.DragEvent, targetChaineId: string, targetDateStr: string) => {
        e.preventDefault();
        const eventId = e.dataTransfer.getData("eventId");
        if (!eventId) return;

        setPlanningEvents(prev => prev.map(ev => {
            if (ev.id === eventId) {
                const efficiency = chaines.find(c => c.id === targetChaineId)?.efficiency || 0.85;
                const qty = ev.totalQuantity || ev.qteTotal || 0;
                
                const newStartDate = targetDateStr;
                const newEndDate = calculateEndDate(newStartDate, qty, ev.modelId || '', efficiency);
                
                return {
                    ...ev,
                    chaineId: targetChaineId,
                    startDate: newStartDate,
                    dateLancement: newStartDate, // Legacy
                    estimatedEndDate: newEndDate,
                    dateExport: newEndDate       // Legacy
                };
            }
            return ev;
        }));
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    // STEP 7: SPLIT ORDER
    const commitSplit = () => {
        if (!splitModalData || newSplitQuantity <= 0 || newSplitQuantity >= (splitModalData.totalQuantity || splitModalData.qteTotal || 1)) {
            alert("Invalid split quantity");
            return;
        }

        const origQty = (splitModalData.totalQuantity || splitModalData.qteTotal || 1);
        const remainQty = origQty - newSplitQuantity;
        const eff = chaines.find(c => c.id === splitModalData.chaineId)?.efficiency || 0.85;

        const newOrigEndDate = calculateEndDate(splitModalData.startDate || splitModalData.dateLancement || new Date().toISOString(), remainQty, splitModalData.modelId || '', eff);
        
        const cloneId = `event_${Date.now()}`;
        const newEndDate = calculateEndDate(splitModalData.startDate || splitModalData.dateLancement || new Date().toISOString(), newSplitQuantity, splitModalData.modelId || '', eff);

        const newEvent: PlanningEvent = {
            ...splitModalData,
            id: cloneId,
            totalQuantity: newSplitQuantity,
            qteTotal: newSplitQuantity,
            producedQuantity: 0,
            qteProduite: 0,
            status: 'READY',
            estimatedEndDate: newEndDate,
            dateExport: newEndDate
        };

        setPlanningEvents(prev => [
            ...prev.map(ev => ev.id === splitModalData.id ? { 
                ...ev, 
                totalQuantity: remainQty,
                qteTotal: remainQty,
                estimatedEndDate: newOrigEndDate,
                dateExport: newOrigEndDate
            } : ev),
            newEvent
        ]);

        setSplitModalData(null);
    };

    // --- RENDER HELPERS ---
    const getEventStyles = (ev: PlanningEvent) => {
        const start = ev.startDate || ev.dateLancement;
        const end = ev.estimatedEndDate || ev.dateExport;
        if (!start || !end) return { display: 'none' };
        
        const dStart = new Date(start);
        const dEnd = new Date(end);
        
        const firstDate = timelineDates[0];
        const offsetDays = (dStart.getTime() - firstDate.getTime()) / (1000 * 3600 * 24);
        const durationDays = Math.max(0.5, (dEnd.getTime() - dStart.getTime()) / (1000 * 3600 * 24));
        
        return {
            left: `${Math.max(0, offsetDays * DAY_WIDTH)}px`,
            width: `${durationDays * DAY_WIDTH}px`
        };
    };

    const getProgress = (ev: PlanningEvent) => {
        const qty = ev.totalQuantity || ev.qteTotal || 1;
        const prod = ev.producedQuantity || ev.qteProduite || 0;
        return Math.min(100, (prod / qty) * 100);
    };

    // STEP 8: BOTTLENECK & WARNING
    const isEventAtRisk = (ev: PlanningEvent) => {
        if (ev.status === 'BLOCKED_STOCK') return true;
        
        const end = ev.estimatedEndDate || ev.dateExport;
        const dds = ev.strictDeadline_DDS;
        if (end && dds) {
            return new Date(end) > new Date(dds);
        }
        return false;
    };

    return (
        <div className="h-full flex flex-col bg-gray-950 text-gray-200 font-sans overflow-hidden" ref={containerRef}>
            {/* Header */}
            <header className="flex flex-col border-b border-gray-800 bg-gray-900 shadow-sm shrink-0">
                <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.5)]">
                            <Layers className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-white tracking-tight">Advanced Planning</h1>
                            <p className="text-xs text-gray-400 font-medium tracking-wide">Enterpise Gantt Scheduler</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 bg-gray-950 p-1.5 rounded-lg border border-gray-800">
                        {['daily', 'weekly', 'monthly'].map(v => (
                            <button
                                key={v}
                                onClick={() => setViewMode(v as any)}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold capitalize transition-all ${
                                    viewMode === v ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {/* Matrix Board */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar - Chaines */}
                <div className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col z-10 shadow-xl">
                    <div className="h-12 border-b border-gray-800 flex items-center px-4 shrink-0 bg-gray-950">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">LIGNE DE PRODUCTION</span>
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar py-2">
                        {chaines.map(chaine => (
                            <div key={chaine.id} className="h-24 px-4 flex flex-col justify-center border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                                <h3 className="font-bold text-gray-200 text-sm flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                                    {chaine.name}
                                </h3>
                                <p className="text-[10px] text-gray-500 mt-1 uppercase font-semibold">
                                    Efficiency: {(chaine.efficiency * 100).toFixed(0)}%
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Scrollable Timeline */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-gray-950 relative" ref={timelineRef}>
                    
                    {/* Time Header */}
                    <div className="h-12 border-b border-gray-800 flex shrink-0 sticky top-0 z-0 bg-gray-900">
                        {timelineDates.map(date => {
                            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                            return (
                                <div 
                                    key={date.toISOString()} 
                                    className={`flex-shrink-0 border-r border-gray-800 flex flex-col items-center justify-center ${isWeekend ? 'bg-gray-900/40 text-gray-600' : 'text-gray-400'}`}
                                    style={{ width: DAY_WIDTH }}
                                >
                                    <span className="text-[10px] uppercase font-bold tracking-wider">
                                        {date.toLocaleDateString('en-US', { weekday: viewMode === 'daily' ? 'short' : 'narrow' })}
                                    </span>
                                    <span className={`text-sm font-black ${isWeekend ? 'text-gray-600' : 'text-gray-300'}`}>
                                        {date.getDate()} {date.toLocaleDateString('en-US', { month: 'short' })}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Matrix Grid */}
                    <div className="relative py-2">
                        <div className="absolute inset-0 pointer-events-none flex">
                            {timelineDates.map(date => (
                                <div key={'grid'+date.toISOString()} className={`flex-shrink-0 h-full border-r border-gray-800/50 ${(date.getDay() === 0 || date.getDay() === 6) ? 'bg-gray-900/30' : ''}`} style={{ width: DAY_WIDTH }} />
                            ))}
                        </div>

                        {/* Rendering Rows & Dropzones */}
                        {chaines.map(chaine => (
                            <div key={chaine.id} className="h-24 relative border-b border-gray-800/30 flex group hover:bg-gray-900/10 transition-colors">
                                {timelineDates.map(date => (
                                    <div 
                                        key={`drop-${chaine.id}-${date.toISOString()}`}
                                        className="h-full flex-shrink-0 relative"
                                        style={{ width: DAY_WIDTH }}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, chaine.id, date.toISOString())}
                                    />
                                ))}

                                {/* Rendering Events for this Chaine */}
                                {planningEvents.filter(e => e.chaineId === chaine.id).map(ev => {
                                    const m = models.find(mod => mod.id === ev.modelId);
                                    const modelName = ev.modelName || m?.meta_data.nom_modele || "Unknown Order";
                                    const client = ev.clientName || m?.ficheData?.client || "No Client";
                                    const qty = ev.totalQuantity || ev.qteTotal || 0;
                                    const prod = ev.producedQuantity || ev.qteProduite || 0;
                                    
                                    const ui = STATUS_UI[ev.status || 'ON_TRACK'] || STATUS_UI['ON_TRACK'];
                                    const isBlocked = isEventAtRisk(ev);
                                    const progress = getProgress(ev);

                                    return (
                                        <div 
                                            key={ev.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, ev.id)}
                                            onClick={() => setSelectedEvent(ev)}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setContextMenu({ x: e.pageX, y: e.pageY, eventId: ev.id });
                                            }}
                                            className={`absolute top-2 bottom-2 rounded-md border shadow-lg cursor-grab active:cursor-grabbing text-xs overflow-hidden flex flex-col p-2 transition-all group/block hover:shadow-xl ${ui.base} ${isBlocked ? 'animate-pulse border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : ''}`}
                                            style={getEventStyles(ev)}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-bold truncate pr-2 text-white/90">{modelName}</span>
                                                {isBlocked && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                                            </div>
                                            <div className="text-[10px] text-white/60 truncate mb-1">{client}</div>
                                            <div className="mt-auto flex justify-between tracking-wide text-[10px] font-bold z-10 relative">
                                                <span>{prod} / {qty}</span>
                                                <span>{progress.toFixed(0)}%</span>
                                            </div>

                                            {/* Progress Bar absolute bottom */}
                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                                                <div className={`h-full ${ui.dot} opacity-80`} style={{ width: `${progress}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* MODALS */}
            
            {/* 1. Quick View Modal */}
            <AnimatePresence>
                {selectedEvent && (
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setSelectedEvent(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="bg-gray-900 border border-indigo-500/50 rounded-2xl w-full max-w-md shadow-2xl shadow-indigo-500/10 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6">
                                <h2 className="text-2xl font-black text-white mb-2">{selectedEvent.modelName}</h2>
                                <p className="text-sm text-indigo-400 font-bold mb-6">Client: {selectedEvent.clientName}</p>

                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
                                        <p className="text-xs text-gray-500 font-bold uppercase">Objectif</p>
                                        <p className="text-xl font-bold text-white mt-1">{selectedEvent.totalQuantity || selectedEvent.qteTotal} pcs</p>
                                    </div>
                                    <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
                                        <p className="text-xs text-gray-500 font-bold uppercase">Produit</p>
                                        <p className="text-xl font-bold text-emerald-400 mt-1">{selectedEvent.producedQuantity || selectedEvent.qteProduite || 0} pcs</p>
                                    </div>
                                </div>

                                <div className="space-y-3 px-1 text-sm">
                                    <div className="flex justify-between border-b border-gray-800 pb-2">
                                        <span className="text-gray-500">Ligne:</span>
                                        <span className="text-gray-200 font-bold">{chaines.find(c => c.id === selectedEvent.chaineId)?.name || selectedEvent.chaineId}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-800 pb-2">
                                        <span className="text-gray-500">Délai Stricte (DDS):</span>
                                        <span className="text-rose-400 font-bold">{selectedEvent.strictDeadline_DDS || "Non Défini"}</span>
                                    </div>
                                    <div className="flex justify-between pb-2">
                                        <span className="text-gray-500">Statut:</span>
                                        <span className="text-gray-200 font-bold">{selectedEvent.status}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-950 p-4 flex gap-3">
                                <button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-colors">
                                    Éditer la Fiche
                                </button>
                                <button onClick={() => setSelectedEvent(null)} className="px-6 border border-gray-700 hover:bg-gray-800 text-gray-300 font-bold py-3 rounded-xl transition-colors">
                                    Fermer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 2. Context Menu */}
            {contextMenu && (
                <div 
                    className="absolute z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl py-2 w-56 text-sm"
                    style={{ left: Math.min(contextMenu.x, window.innerWidth - 224), top: contextMenu.y }}
                >
                    <div className="px-3 pb-2 mb-2 border-b border-gray-800 text-xs font-bold text-gray-500 uppercase">Actions Rapides</div>
                    
                    <button 
                        className="w-full text-left px-4 py-2 hover:bg-indigo-600 hover:text-white text-gray-300 flex items-center justify-between group"
                        onClick={() => {
                            setPlanningEvents(prev => prev.map(ev => ev.id === contextMenu.eventId ? { ...ev, status: 'READY' } : ev));
                        }}
                    >
                        <span>Marquer PRÊT</span>
                        <div className="w-2 h-2 rounded-full bg-emerald-500 invisible group-hover:visible" />
                    </button>
                    
                    <button 
                        className="w-full text-left px-4 py-2 hover:bg-rose-600 hover:text-white text-gray-300 flex items-center justify-between group"
                        onClick={() => {
                            setPlanningEvents(prev => prev.map(ev => ev.id === contextMenu.eventId ? { ...ev, status: 'BLOCKED_STOCK' } : ev));
                        }}
                    >
                        <span>Bloquer (Stock)</span>
                        <div className="w-2 h-2 rounded-full bg-rose-500 invisible group-hover:visible" />
                    </button>

                    <button 
                        className="w-full text-left px-4 py-2 hover:bg-gray-800 text-gray-300 flex items-center gap-2"
                        onClick={() => {
                            setSplitModalData(planningEvents.find(e => e.id === contextMenu.eventId) || null);
                            setContextMenu(null);
                        }}
                    >
                        <Split className="w-4 h-4 text-indigo-400" /> Fractionner (Split)
                    </button>

                    <div className="h-px bg-gray-800 my-1 font-bold text-gray-500"></div>
                    
                    <button 
                        className="w-full text-left px-4 py-2 hover:bg-indigo-600 hover:text-white text-indigo-400 font-bold flex items-center gap-2"
                        onClick={() => {
                            setCurrentView('suivi');
                        }}
                    >
                        <ArrowRightCircle className="w-4 h-4" /> Voir dans Suivi Live
                    </button>
                </div>
            )}

            {/* 3. Split Modal */}
            <AnimatePresence>
                {splitModalData && (
                     <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                    >
                        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm overflow-hidden p-6 shadow-2xl">
                            <h3 className="text-lg font-bold text-white mb-2">Séparer l'ordre de production</h3>
                            <p className="text-gray-400 text-sm mb-4">Combien de pièces voulez-vous extraire de la quantité totale ({splitModalData.totalQuantity || splitModalData.qteTotal}) ?</p>
                            
                            <input 
                                type="number" 
                                className="w-full bg-gray-950 border border-gray-700 text-white rounded-xl px-4 py-3 outline-none focus:border-indigo-500 mb-6 font-mono text-xl"
                                placeholder="ex: 1000"
                                value={newSplitQuantity || ''}
                                onChange={e => setNewSplitQuantity(parseInt(e.target.value) || 0)}
                            />

                            <div className="flex gap-3">
                                <button onClick={() => setSplitModalData(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-lg font-bold">Annuler</button>
                                <button onClick={commitSplit} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg font-bold">Confirmer</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}
