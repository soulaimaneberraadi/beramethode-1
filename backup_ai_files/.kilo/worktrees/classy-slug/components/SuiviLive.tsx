import React, { useState, useEffect, useMemo } from 'react';
import { ModelData, PlanningEvent, SuiviData, DefectType, ProductionLog, AppSettings } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, AlertTriangle, ArrowLeft, Activity, Target } from 'lucide-react';

interface SuiviLiveProps {
    models: ModelData[];
    planningEvents: PlanningEvent[];
    suivis: SuiviData[];
    setSuivis: React.Dispatch<React.SetStateAction<SuiviData[]>>;
    setPlanningEvents: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    setCurrentView: (view: 'planning' | 'suivi' | 'dashboard' | 'atelier' | 'library' | 'coupe' | 'effectifs' | 'magasin' | 'config' | 'profil' | 'admin') => void;
    settings?: AppSettings;
}

export default function SuiviLive({ models, planningEvents, suivis, setSuivis, setPlanningEvents, setCurrentView, settings }: SuiviLiveProps) {
    // Session State (Mocking a selected Chaine/Event for the Tablet View)
    // Normally, a Tablet is permanently locked to one Chaine. We simulate choosing the first active event.
    const activeEvent = useMemo(() => planningEvents.find(e => (e.status === 'IN_PROGRESS' || e.status === 'ON_TRACK')), [planningEvents]) || planningEvents[0];
    const activeModel = useMemo(() => models.find(m => m.id === activeEvent?.modelId), [activeEvent, models]);

    // Local State
    const [status, setStatus] = useState<'RUNNING' | 'PAUSED'>('RUNNING');
    const [presentWorkers, setPresentWorkers] = useState(activeModel?.meta_data.effectif || 15);
    const [showDefectModal, setShowDefectModal] = useState(false);
    
    const [recentActivity, setRecentActivity] = useState<{ id: string, time: string, action: string, type: 'ok' | 'defect' }[]>([]);

    const totalQty = activeEvent?.totalQuantity || activeEvent?.qteTotal || 1;
    const piecesOk = activeEvent?.producedQuantity || activeEvent?.qteProduite || 0;
    
    // We mock defects since the old PlanningEvent didn't store them directly, we'll store them in local state for this UI
    const [piecesDefect, setPiecesDefect] = useState(0);

    // Activity Logger
    const logActivity = (action: string, type: 'ok' | 'defect') => {
        const time = new Date().toLocaleTimeString('fr-FR');
        setRecentActivity(prev => [{ id: Date.now().toString(), time, action, type }, ...prev].slice(0, 5));
    };

    // --- STEP 7 & 8: REAL-TIME MATH & FIREBASE SYNC MOCKUP ---
    const sam = activeModel?.meta_data.total_temps || 15; // Standard Allowed Minute
    
    const { targetPieces, efficiency, cpm } = useMemo(() => {
        // Mock elapsed time as 4 hours for demo purposes, normally: (Date.now() - shiftStartTime)
        const elapsedMinutes = 4 * 60; 
        
        // Target = (Elapsed * Workers) / SAM
        const target = status === 'RUNNING' ? Math.floor((elapsedMinutes * presentWorkers) / sam) : 50; 
        
        // Rendement
        const eff = target > 0 ? (piecesOk / target) * 100 : 0;
        
        // CPM (Mock Daily wage = 100 MAD per worker)
        const totalCost = presentWorkers * 100;
        const totalCurrentMins = elapsedMinutes * presentWorkers;
        const costPerMin = totalCurrentMins > 0 ? (totalCost / totalCurrentMins) / (eff / 100 || 1) : 0;

        return { targetPieces: target > 0 ? target : 50, efficiency: eff, cpm: costPerMin };
    }, [piecesOk, presentWorkers, sam, status]);

    const logProductionTick = (type: 'OK' | 'DEFECT', reason?: DefectType) => {
        if (!activeEvent) return;

        const timestamp = new Date().toISOString();
        const productionLog: ProductionLog = {
            id: `log_${Date.now()}`,
            planningEventId: activeEvent.id,
            chaineId: activeEvent.chaineId,
            timestamp,
            piecesOk: type === 'OK' ? 1 : 0,
            piecesDefect: type === 'DEFECT' ? 1 : 0,
            defectReason: reason,
            recordedBy: 'Chef_01'
        };

        // 1. Log Activity UI
        logActivity(type === 'OK' ? '+1 Pièce OK' : `Défaut: ${reason}`, type.toLowerCase() as 'ok'|'defect');

        // 2. Global State Sync (Updates the Parent App Planning Events so Gantt responds instantly)
        if (type === 'OK') {
            setPlanningEvents(prev => prev.map(ev => 
                ev.id === activeEvent.id 
                ? { ...ev, producedQuantity: (ev.producedQuantity || ev.qteProduite || 0) + 1, qteProduite: (ev.producedQuantity || ev.qteProduite || 0) + 1 } 
                : ev
            ));
        } else {
            setPiecesDefect(prev => prev + 1);
        }

        // 3. Mock Firebase push
        console.log("🔥 [Firebase Realtime API] Pushed log:", productionLog);
    };

    if (!activeEvent) {
        return <div className="h-full bg-gray-950 flex items-center justify-center text-white">Aucune tâche en cours trouvée.</div>;
    }

    return (
        <div className="h-full flex flex-col bg-gray-950 font-sans select-none overflow-hidden text-gray-200">
            {/* --- STEP 2: TABLET HEADER --- */}
            <header className="flex items-center justify-between p-6 bg-gray-900 border-b border-gray-800 shadow-xl shrink-0">
                <div className="flex items-center gap-6">
                    <button onClick={() => setCurrentView('planning')} className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 transition active:scale-95">
                        <ArrowLeft className="w-6 h-6 text-gray-300" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight">{activeEvent.chaineId}</h1>
                        <p className="text-lg text-indigo-400 font-bold uppercase tracking-widest">{activeModel?.meta_data.nom_modele || "Modèle Inconnu"} - {activeEvent.clientName}</p>
                    </div>
                </div>

                <button 
                    onClick={() => setStatus(prev => prev === 'RUNNING' ? 'PAUSED' : 'RUNNING')}
                    className={`px-8 py-3 rounded-2xl flex items-center gap-3 font-black text-xl tracking-wider transition-all shadow-lg ${
                        status === 'RUNNING' 
                        ? 'bg-emerald-900/40 text-emerald-400 border-2 border-emerald-500/50 shadow-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.2)]' 
                        : 'bg-amber-900/40 text-amber-400 border-2 border-amber-500/50 shadow-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                    }`}
                >
                    {status === 'RUNNING' ? <Activity className="w-7 h-7" /> : <Pause className="w-7 h-7" />}
                    {status}
                </button>
            </header>

            {/* --- STEP 3: KPI DASHBOARD ZONE --- */}
            <div className="p-6 shrink-0 grid grid-cols-4 gap-6">
                <div className="bg-gray-900 rounded-3xl p-6 border border-gray-800 flex flex-col justify-center items-center shadow-lg">
                    <p className="text-gray-500 font-bold text-sm uppercase tracking-widest mb-2 flex items-center gap-2"><Target className="w-5 h-5"/> Objectif / Heure</p>
                    <p className="text-6xl font-black text-white">{targetPieces}</p>
                </div>
                
                <div className="bg-gray-900 rounded-3xl p-6 border border-gray-800 flex flex-col justify-center items-center shadow-lg relative overflow-hidden">
                    <p className="text-gray-500 font-bold text-sm uppercase tracking-widest mb-2">Production Réelle</p>
                    <p className="text-6xl font-black text-indigo-400 z-10">{piecesOk}</p>
                    <div className="absolute inset-x-0 bottom-0 h-2 bg-indigo-950">
                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${Math.min(100, (piecesOk / totalQty) * 100)}%` }}></div>
                    </div>
                </div>

                <div className="bg-gray-900 rounded-3xl p-6 border border-gray-800 flex flex-col justify-center items-center shadow-lg">
                    <p className="text-gray-500 font-bold text-sm uppercase tracking-widest mb-2">Rendement %</p>
                    <p className={`text-6xl font-black ${efficiency >= 90 ? 'text-emerald-400' : efficiency >= 75 ? 'text-amber-400' : 'text-rose-500'}`}>
                        {efficiency.toFixed(0)}%
                    </p>
                </div>

                <div className="bg-gray-900 rounded-3xl p-6 border border-gray-800 flex flex-col justify-center items-center shadow-lg">
                    <p className="text-gray-500 font-bold text-sm uppercase tracking-widest mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-500"/> Défauts</p>
                    <p className="text-6xl font-black text-rose-500">{piecesDefect}</p>
                </div>
            </div>

            {/* --- STEP 4 & 6: ACTION ZONE & ACTIVITY FEED --- */}
            <div className="flex-1 px-6 pb-6 flex gap-6 overflow-hidden">
                {/* BIG BUTTONS */}
                <div className="flex-1 flex gap-6">
                    <motion.button 
                        whileTap={{ scale: 0.95 }}
                        whileHover={{ scale: 1.02 }}
                        onClick={() => status === 'RUNNING' && logProductionTick('OK')}
                        disabled={status !== 'RUNNING'}
                        className={`flex-1 rounded-[3rem] shadow-2xl flex flex-col items-center justify-center gap-6 border-4 transition-all ${status === 'RUNNING' ? 'bg-gradient-to-br from-emerald-600 to-emerald-800 border-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.3)]' : 'bg-gray-800 border-gray-700 opacity-50 cursor-not-allowed'}`}
                    >
                        <span className="text-9xl font-black text-white drop-shadow-xl">+1</span>
                        <span className="text-3xl font-bold text-emerald-100 uppercase tracking-widest">Pièce OK</span>
                    </motion.button>

                    <motion.button 
                        whileTap={{ scale: 0.95 }}
                        whileHover={{ scale: 1.02 }}
                        onClick={() => status === 'RUNNING' && setShowDefectModal(true)}
                        disabled={status !== 'RUNNING'}
                        className={`w-1/3 rounded-[3rem] border-4 flex flex-col items-center justify-center gap-4 transition-all ${status === 'RUNNING' ? 'bg-gray-900 border-rose-500/50 hover:bg-rose-950/30' : 'bg-gray-800 border-gray-700 opacity-50 cursor-not-allowed'}`}
                    >
                        <AlertTriangle className="w-20 h-20 text-rose-500" />
                        <span className="text-2xl font-bold text-rose-500 uppercase tracking-widest text-center px-4">Défaut / 2ème Choix</span>
                    </motion.button>
                </div>

                {/* ACTIVITY FEED */}
                <div className="w-80 bg-gray-900 rounded-[2rem] border border-gray-800 p-6 flex flex-col shadow-xl">
                    <h3 className="text-gray-500 font-bold text-sm uppercase tracking-widest mb-6 px-2">Activité Récente</h3>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {recentActivity.map(act => (
                            <motion.div 
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                                key={act.id} 
                                className="bg-gray-950 p-4 rounded-2xl border border-gray-800 flex items-center gap-4"
                            >
                                <div className="text-xs font-mono text-gray-500 font-bold shrink-0">{act.time}</div>
                                <div className={`font-bold text-lg truncate ${act.type === 'ok' ? 'text-emerald-400' : 'text-rose-500'}`}>
                                    {act.action}
                                </div>
                            </motion.div>
                        ))}
                        {recentActivity.length === 0 && (
                            <div className="text-center text-gray-600 font-bold mt-10">Aucune activité</div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- STEP 5: DEFECT SELECTION MODAL --- */}
            <AnimatePresence>
                {showDefectModal && (
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-gray-950/90 backdrop-blur-md flex items-center justify-center p-6"
                    >
                        <div className="bg-gray-900 w-full max-w-4xl rounded-[3rem] border border-gray-800 p-10 shadow-2xl flex flex-col">
                            <h2 className="text-4xl font-black text-rose-500 mb-2 text-center">Déclarer un Défaut</h2>
                            <p className="text-gray-400 text-center mb-10 text-xl">Sélectionnez le type de défaut constaté</p>

                            <div className="grid grid-cols-2 gap-6 flex-1">
                                {['TACHE', 'DECHIRURE', 'COUTURE_FOU', 'MESURE'].map((type) => (
                                    <motion.button
                                        key={type}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => {
                                            logProductionTick('DEFECT', type as DefectType);
                                            setShowDefectModal(false);
                                        }}
                                        className="bg-gray-950 hover:bg-rose-950/40 border-2 border-gray-800 hover:border-rose-500/50 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all min-h-[200px]"
                                    >
                                        <AlertTriangle className="w-16 h-16 text-gray-600 group-hover:text-rose-500 transition-colors" />
                                        <span className="text-3xl font-black text-gray-300 uppercase tracking-widest">{type.replace('_', ' ')}</span>
                                    </motion.button>
                                ))}
                            </div>

                            <button 
                                onClick={() => setShowDefectModal(false)}
                                className="mt-10 mx-auto px-16 py-6 rounded-full bg-gray-800 hover:bg-gray-700 text-white font-bold text-2xl tracking-widest transition-colors"
                            >
                                ANNULER
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}
