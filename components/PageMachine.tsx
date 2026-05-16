import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Clock, Component, Layers, AlertTriangle, CheckCircle2,
  Search, Wrench, XCircle, Database, Plus, LayoutDashboard, History, 
  LogOut, Server, ArrowUpRight, ActivitySquare, AlertCircle, ArrowLeft, Users, Printer
} from 'lucide-react';
import { PlanningEvent, ModelData, AppSettings, Machine, MachineFleetHistoryEntry, MachineInstance } from '../types';
import MachineExitModal, { type MachineExitPayload } from './MachineExitModal';
import { MachineQrTicket } from './MachineQrTicket';
import Implantation from './Implantation';

/** Formatting the date for production launches */
function formatLaunch(ev: PlanningEvent, model: ModelData | null): string {
  if (!model) return (ev.dateLancement || ev.startDate || '').trim() || '—';
  const md = model.meta_data;
  const date = (ev.dateLancement?.trim()) || (String(md?.date_lancement || '').trim()) || (ev.startDate?.trim()) || '';
  const time = (String(md?.heure_lancement || '').trim()) || (model.ficheData?.launchTime?.trim()) || '';
  if (date && time) return `${date} · ${time}`;
  return date || time || '—';
}

interface PageMachineProps {
  planningEvents: PlanningEvent[];
  models: ModelData[];
  settings: AppSettings;
  machines: Machine[]; // Used as the Class/Type Catalog
  machineInstances?: MachineInstance[]; // The real inventory
  machineFleetHistory: MachineFleetHistoryEntry[];
  defaultFleetActorName?: string;
  onSaveMachine?: (m: Machine, ctx: { created: boolean }) => void; // Save a new Class prototype
  onSaveMachineInstance?: (inst: MachineInstance, ctx: { created: boolean }) => void;
  onDeleteMachineInstance?: (id: string) => void;
  onArchiveMachine: (payload: MachineExitPayload) => void;
  onToggleMachine?: (id: string) => void;
  onOpenMachineCatalog?: () => void;
}

type TabType = 'OVERVIEW' | 'INVENTORY' | 'MAINTENANCE' | 'HISTORY';

export default function PageMachine({ 
  planningEvents = [], 
  models = [], 
  settings, 
  machines = [], 
  machineInstances = [],
  machineFleetHistory = [],
  defaultFleetActorName = '',
  onSaveMachine,
  onSaveMachineInstance,
  onDeleteMachineInstance,
  onArchiveMachine,
  onToggleMachine,
  onOpenMachineCatalog,
}: PageMachineProps) {
  
  const [activeTab, setActiveTab] = useState<TabType>('OVERVIEW');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [viewingModelId, setViewingModelId] = useState<string | null>(null);
  
  // Modals state
  const [instanceEditorOpen, setInstanceEditorOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<MachineInstance | null>(null);
  
  const [classShortcutOpen, setClassShortcutOpen] = useState(false);
  const [classShortcutInitialClass, setClassShortcutInitialClass] = useState('');

  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [exitModalInitialId, setExitModalInitialId] = useState<string | null>(null);
  
  const [qrMachine, setQrMachine] = useState<Machine | null>(null);

  // --- Logic & Data Preparation ---
  const filteredChains = useMemo(() => {
    return Array.from({ length: settings?.chainsCount || 6 }).map((_, i) => ({
      id: `CHAINE ${i + 1}`,
      name: settings?.chainNames?.[`CHAINE ${i + 1}`] || `CHAINE ${i + 1}`
    }));
  }, [settings]);

  const getMachineHealth = (machineClass: string) => {
    const classInstances = machineInstances.filter(inst => {
      const c = machines.find(m => m.id === inst.classId);
      return c?.classe === machineClass || inst.classId === machineClass;
    });
    if (!classInstances.length) return 'UNKNOWN';
    if (classInstances.some(m => m.status === 'PANNE')) return 'PANNE';
    if (classInstances.some(m => m.status === 'MAINT')) return 'MAINT';
    return 'OK';
  };

  const getAvailability = (machineClass: string) => {
    return machineInstances.filter(inst => {
      const c = machines.find(m => m.id === inst.classId);
      return (c?.classe === machineClass || inst.classId === machineClass) && inst.status !== 'PANNE';
    }).length;
  };

  const fleetStats = useMemo(() => {
    const total = machineInstances.length;
    const ok = machineInstances.filter(m => m.status === 'OK' || !m.status).length;
    const panne = machineInstances.filter(m => m.status === 'PANNE').length;
    const maint = machineInstances.filter(m => m.status === 'MAINT').length;
    return { total, ok, panne, maint, health: total > 0 ? Math.round((ok / total) * 100) : 0 };
  }, [machineInstances]);

  const maintenanceIssueRows = useMemo(() => {
    return machineInstances.filter(m => m.status === 'MAINT' || m.status === 'PANNE')
                   .filter(inst => {
                     if (!searchTerm) return true;
                     const c = machines.find(m => m.id === inst.classId);
                     return inst.matricule?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            c?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            c?.classe?.toLowerCase().includes(searchTerm.toLowerCase());
                   });
  }, [machineInstances, machines, searchTerm]);

  const historyRows = useMemo(() => {
    return machineFleetHistory.filter(h => 
      !searchTerm || 
      h.machineSnapshot.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.actorName.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [machineFleetHistory, searchTerm]);


  // --- Render Helpers ---

  const getMachineBreakdown = (chainId: string | null) => {
    const instances = machineInstances.filter(m => chainId ? m.chainId === chainId : (!m.chainId || m.chainId === ''));
    const breakdown = instances.reduce((acc, inst) => {
      const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
      const name = c?.classe || inst.classId;
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { breakdown, total: instances.length };
  };

  const renderOverviewMap = () => {
    const brokenCount = machineInstances.filter(m => (!m.chainId || m.chainId === '') && (m.status === 'PANNE' || m.status === 'MAINT')).length;
    const unassignedMachinesLength = getMachineBreakdown(null).total;
    const okC = unassignedMachinesLength - brokenCount;

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
      >
      {filteredChains.map((chain) => {
        const activeData = planningEvents.find(e => e.chaineId === chain.id && (e.status === 'IN_PROGRESS' || e.status === 'READY'));
        const activeModel = activeData ? models.find(m => m.id === activeData.modelId) : null;
        
        const qteProduite = activeData?.qteProduite || 0;
        const qteTotal = activeData?.qteTotal || activeModel?.meta_data.quantity || 0;
        const progress = qteTotal > 0 ? Math.min(100, Math.round((qteProduite / qteTotal) * 100)) : 0;

        return (
          <motion.div 
            key={chain.id} 
            whileHover={{ y: -8, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setSelectedChainId(chain.id); setViewingModelId(null); }}
            className={`group cursor-pointer rounded-3xl shadow-xl border transition-all duration-500 flex flex-col h-full relative overflow-hidden ${activeData ? 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900 via-slate-900 to-black border-emerald-700/40 hover:shadow-emerald-500/30 hover:border-emerald-500/60' : 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black border-slate-700/50 hover:shadow-indigo-500/20 hover:border-indigo-500/30'}`}
          >
            {/* Dynamic Background Glows */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
               {activeData ? (
                 <>
                   <div className="absolute -top-16 -right-16 w-56 h-56 bg-emerald-500/30 rounded-full blur-3xl group-hover:bg-emerald-400/50 group-hover:scale-125 transition-all duration-700" />
                   <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-teal-600/20 rounded-full blur-3xl group-hover:bg-teal-500/35 transition-all duration-700" />
                 </>
               ) : (
                 <>
                   <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl group-hover:bg-indigo-400/35 group-hover:scale-125 transition-all duration-700" />
                   <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-slate-600/20 rounded-full blur-3xl group-hover:bg-slate-500/30 transition-all duration-700" />
                 </>
               )}
               <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            </div>

            <div className="p-6 flex flex-col h-full relative z-10">
              {/* Header: Title + Status + Machine Count */}
              <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col gap-2">
                  <h3 className="font-black text-white text-xl tracking-tight drop-shadow-md">{chain.name}</h3>
                  {activeData ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-black tracking-wide border border-emerald-500/30 backdrop-blur-sm status-glow-ok">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                      </span>
                      En Production
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 text-slate-400 text-[11px] font-black tracking-wide border border-white/10 backdrop-blur-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                      Disponible
                    </span>
                  )}
                </div>

                <div className="w-11 h-11 rounded-[14px] bg-white/5 flex items-center justify-center text-white font-black text-sm border border-white/10 shadow-sm backdrop-blur-md group-hover:bg-white/15 transition-all duration-300">
                  {getMachineBreakdown(chain.id).total}
                </div>
              </div>

              {/* Body: Model Info or Empty State */}
              {activeData && activeModel ? (
                <div className="flex flex-col flex-1 justify-end">
                  <div className="flex gap-4 items-center mb-6 bg-white/5 backdrop-blur-md p-3.5 rounded-[20px] border border-white/10 shadow-sm group-hover:bg-white/10 transition-colors">
                     {activeModel.image ? (
                       <img src={activeModel.image} className="w-16 h-16 rounded-[14px] object-cover shadow-sm border border-white/10 shrink-0 group-hover:scale-105 transition-transform duration-500" />
                     ) : (
                       <div className="w-16 h-16 rounded-[14px] bg-white/5 flex items-center justify-center text-white/30 border border-white/10 shadow-inner shrink-0">
                          <Component className="w-6 h-6" />
                       </div>
                     )}
                     <div className="flex-1 min-w-0">
                       <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-0.5">{activeModel.ficheData?.client || activeData.clientName || 'Client N/A'}</p>
                       <p className="font-black text-white text-[16px] leading-tight truncate drop-shadow-md">{activeModel.meta_data.nom_modele}</p>
                       <p className="text-[11px] font-bold text-white/50 truncate mt-0.5">Réf: <span className="text-white/70">{activeModel.meta_data.reference || '-'}</span></p>
                       <p className="text-[10px] font-bold text-white/40 mt-1 flex items-center gap-1">
                         <Clock className="w-3 h-3 text-white/30"/> Lancement: {(activeData.startDate || '').split('T')[0]}
                       </p>
                     </div>
                  </div>

                  {/* Progress Section */}
                  <div className="space-y-2 mt-auto mb-2 relative z-10">
                     <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                        <span className="text-white/40">Progression</span>
                        <span className="text-white/80">{qteProduite} <span className="text-white/30">/</span> {qteTotal}</span>
                     </div>
                     <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden shadow-inner border border-white/5">
                       <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full transition-all duration-700 relative overflow-hidden" style={{ width: `${progress}%` }}>
                          <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] -skew-x-12"></div>
                       </div>
                     </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col flex-1 items-center justify-center py-6 relative z-10">
                   <ActivitySquare className="w-12 h-12 mb-3 text-white/15 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500" />
                   <span className="text-[11px] font-black text-white/30 uppercase tracking-widest">Aucun modèle</span>
                </div>
              )}

              {/* Footer: Machine Breakdown */}
              <div className="mt-auto pt-4 border-t border-white/10 flex items-center overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="flex items-center gap-2 shrink-0">
                  {Object.entries(getMachineBreakdown(chain.id).breakdown).map(([name, count]) => (
                    <div key={name} className="flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/5 rounded-lg pl-3 pr-1 py-1 shrink-0 hover:bg-black/60 transition-colors shadow-inner">
                      <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">{name}</span>
                      <span className="w-5 h-5 rounded-md bg-white/10 border border-white/5 flex items-center justify-center text-[10px] font-black text-white shadow-sm">{count}</span>
                    </div>
                  ))}
                  {getMachineBreakdown(chain.id).total === 0 && (
                    <span className="text-[10px] font-bold text-white/25 italic">Aucun matériel assigné</span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}

      {/* Magasin Central Card */}
      <motion.div 
        whileHover={{ y: -8, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => { setSelectedChainId('MAGASIN'); setViewingModelId(null); }}
        className="group cursor-pointer bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900 via-slate-900 to-black rounded-3xl shadow-xl border border-indigo-700/50 hover:shadow-2xl hover:shadow-indigo-500/40 hover:border-indigo-400/60 transition-all duration-500 flex flex-col h-full relative overflow-hidden"
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-16 -right-16 w-56 h-56 bg-indigo-500/40 rounded-full blur-3xl group-hover:bg-indigo-400/60 group-hover:scale-125 transition-all duration-700" />
          <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-violet-600/25 rounded-full blur-3xl group-hover:bg-violet-500/45 transition-all duration-700" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-400/20 transition-all duration-700" />
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent"></div>
          <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent"></div>
        </div>
        
        <div className="p-6 flex flex-col h-full relative z-10">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div className="flex flex-col gap-2">
              <h3 className="font-black text-white text-xl tracking-tight drop-shadow-md">Magasin Central</h3>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-[11px] font-black tracking-wide border border-indigo-500/20 backdrop-blur-sm shadow-inner">
                <Database className="w-3 h-3" /> Stock Principal
              </span>
            </div>
            
            <div className="w-11 h-11 rounded-[14px] bg-white/5 flex items-center justify-center text-indigo-300 font-black text-sm border border-white/10 shadow-sm backdrop-blur-md group-hover:bg-indigo-500/30 group-hover:text-white transition-all duration-300">
              {getMachineBreakdown(null).total}
            </div>
          </div>
          
          {/* Body: Status summary */}
          <div className="flex flex-col flex-1 justify-end space-y-3 mb-2">
             <div className="flex justify-between items-center bg-white/5 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 shadow-sm group-hover:bg-white/10 transition-colors">
               <span className="flex items-center gap-2 text-xs font-black text-emerald-400 uppercase tracking-widest drop-shadow-sm"><CheckCircle2 className="w-4 h-4"/> Prêtes (OK)</span>
               <span className="text-base font-black text-white drop-shadow-md">{okC}</span>
             </div>
             <div className="flex justify-between items-center bg-white/5 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 shadow-sm group-hover:bg-white/10 transition-colors">
               <span className="flex items-center gap-2 text-xs font-black text-rose-400 uppercase tracking-widest drop-shadow-sm"><AlertTriangle className="w-4 h-4"/> En Réparation</span>
               <span className="text-base font-black text-white drop-shadow-md">{brokenCount}</span>
             </div>
          </div>
          
          {/* Footer: Machine Breakdown */}
          <div className="mt-5 pt-4 border-t border-white/10 flex items-center overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
             <div className="flex items-center gap-2 shrink-0">
               {Object.entries(getMachineBreakdown(null).breakdown).map(([name, count]) => (
                 <div key={name} className="flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/5 rounded-lg pl-3 pr-1 py-1 shrink-0 hover:bg-black/60 transition-colors shadow-inner">
                   <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest drop-shadow-sm">{name}</span>
                   <span className="w-5 h-5 rounded-md bg-white/10 border border-white/5 flex items-center justify-center text-[10px] font-black text-white shadow-sm">{count}</span>
                 </div>
               ))}
               {getMachineBreakdown(null).total === 0 && (
                 <span className="text-[10px] font-bold text-slate-500">Magasin vide</span>
               )}
             </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
    );
  };

  const renderModelImplantation = (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    if (!model) return null;

    const gamme = model.gamme_operatoire || [];

    return (
      <div className="max-w-4xl mx-auto">
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-[20px] border border-slate-100 shadow-sm overflow-hidden"
        >
           <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                 <div className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {model.image ? <img src={model.image} className="w-full h-full object-cover" /> : <Component className="w-6 h-6 text-slate-300" />}
                 </div>
                 <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{model.meta_data.nom_modele || 'Modèle sans nom'}</h2>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-black uppercase tracking-widest border border-slate-200">
                        REF: {model.meta_data.reference || 'N/A'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                         <Layers className="w-3 h-3" /> Implantation (Gamme)
                      </span>
                    </div>
                 </div>
              </div>
           </div>

           <div className="w-full h-[600px] relative bg-slate-50">
             <Implantation
                bf={(model as any).bf || 1}
                operations={gamme}
                setOperations={() => {}}
                numWorkers={(model as any).numWorkers || 1}
                setNumWorkers={() => {}}
                presenceTime={(model as any).presenceTime || 480}
                setPresenceTime={() => {}}
                efficiency={(model as any).efficiency || 100}
                setEfficiency={() => {}}
                articleName={model.meta_data.nom_modele || ''}
                assignments={model.implantation?.assignments || (model as any).assignments || {}}
                postes={model.implantation?.postes || (model as any).postes || []}
                setPostes={() => {}}
                layoutMemory={model.implantation?.layoutMemory || (model as any).layoutMemory || {}}
                setLayoutMemory={() => {}}
                activeLayout={model.implantation?.activeLayout || (model as any).activeLayout || 'zigzag'}
                setActiveLayout={() => {}}
                machines={machines}
                speedFactors={[]}
                complexityFactors={[]}
                standardTimes={[]}
                fabricSettings={{ enabled: false, selected: 'easy', values: { easy: 0, medium: 3, hard: 6 } }}
                manualLinks={model.implantation?.manualLinks || (model as any).manualLinks || []}
                setManualLinks={() => {}}
                readOnly={true}
             />
           </div>
        </motion.div>
      </div>
    );
  };

  const renderMagasinDetail = () => {
    const unassignedInstances = machineInstances.filter(m => !m.chainId || m.chainId === '');
    const okInstances = unassignedInstances.filter(m => m.status === 'OK' || !m.status);
    const brokenInstances = unassignedInstances.filter(m => m.status === 'PANNE' || m.status === 'MAINT');

    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-6"
      >

         <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
           {/* Left Column: Summary */}
           <div className="xl:col-span-1 space-y-6">
              <div className="bg-slate-900 rounded-[20px] border border-slate-800 shadow-sm p-6 relative overflow-hidden">
                 <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl" />
                 <h2 className="text-2xl font-black text-white tracking-tight mb-1 relative z-10">Magasin Central</h2>
                 <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-md text-[10px] font-black uppercase tracking-widest border border-indigo-500/30 relative z-10">
                   Stock Principal
                 </span>
                 <div className="mt-8 space-y-3 relative z-10">
                   <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                     <span className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider"><CheckCircle2 className="w-4 h-4"/> Prêtes (OK)</span>
                     <span className="text-sm font-black text-white">{okInstances.length}</span>
                   </div>
                   <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                     <span className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider"><AlertTriangle className="w-4 h-4"/> En Réparation</span>
                     <span className="text-sm font-black text-white">{brokenInstances.length}</span>
                   </div>
                 </div>
              </div>

              {/* List of broken machines with ETA */}
              <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-6">
                 <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2"><Wrench className="w-4 h-4 text-amber-500"/> En cours de réparation</h3>
                 <div className="space-y-3">
                   {brokenInstances.length === 0 ? (
                     <p className="text-xs text-slate-400 font-bold">Aucune machine en réparation.</p>
                   ) : (
                     brokenInstances.map(inst => {
                       const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
                       // Generate a pseudo-random ETA date
                       const daysToAdd = (inst.numero % 5) + 1;
                       const eta = new Date();
                       eta.setDate(eta.getDate() + daysToAdd);
                       return (
                         <div key={inst.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-2">
                           <div className="flex justify-between items-start">
                             <div>
                               <p className="text-xs font-black text-slate-800">{inst.matricule || `MAC-${inst.numero}`}</p>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c?.classe || inst.classId}</p>
                             </div>
                             <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${inst.status === 'PANNE' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{inst.status}</span>
                           </div>
                           <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-slate-500">
                             <span>Date prévue de remise:</span>
                             <span className="text-indigo-600">{eta.toLocaleDateString('fr-FR')}</span>
                           </div>
                         </div>
                       )
                     })
                   )}
                 </div>
              </div>
           </div>

           {/* Right Column: Inventory */}
           <div className="xl:col-span-2">
             <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[700px]">
                 <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                   <div>
                     <h3 className="font-black text-slate-800 text-lg">Inventaire Magasin</h3>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{unassignedInstances.length} machines disponibles</p>
                   </div>
                   <button onClick={() => { setEditingInstance(null); setInstanceEditorOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors">
                     <Plus className="w-3.5 h-3.5" /> Ajouter
                   </button>
                 </div>
                 
                 <div className="flex-1 overflow-auto bg-slate-50/30 p-6">
                   <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {unassignedInstances.map(inst => {
                        const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
                        return (
                          <div key={inst.id} onClick={() => { setEditingInstance(inst); setInstanceEditorOpen(true); }} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-3 group/card hover:border-slate-200 transition-colors cursor-pointer">
                             <div className="flex items-start justify-between">
                               <div className="flex gap-2.5 items-center">
                                 {inst.machinePhotos && inst.machinePhotos.length > 0 ? (
                                   <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-100 shrink-0">
                                     <img src={inst.machinePhotos[0]} className="w-full h-full object-cover" />
                                   </div>
                                 ) : null}
                                 <div>
                                   <div className="font-black text-slate-800 text-sm leading-tight">{inst.matricule || `Machine N°${inst.numero}`}</div>
                                   <div className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mt-0.5">{inst.brand || 'Marque N/A'}</div>
                                 </div>
                               </div>
                               <div className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${
                                 inst.status === 'OK' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                 inst.status === 'PANNE' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                               }`}>
                                 {inst.status || 'OK'}
                               </div>
                             </div>
                             <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                               <div className="flex items-center gap-2 overflow-hidden">
                                 <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold tracking-tight">
                                   {c?.classe || inst.classId}
                                 </span>
                                 <span className="text-[10px] text-slate-400 truncate max-w-[100px]">{c?.name || 'Inconnu'}</span>
                               </div>
                               <div className="flex items-center gap-2">
                                 {inst.machineManuals && inst.machineManuals.length > 0 && (
                                   <a 
                                     href={inst.machineManuals[0].dataUrl} 
                                     download={inst.machineManuals[0].name}
                                     onClick={e => e.stopPropagation()}
                                     className="p-1 bg-white border border-slate-200 rounded text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                                     title={`Télécharger ${inst.machineManuals[0].name}`}
                                   >
                                     <Layers className="w-3 h-3" />
                                   </a>
                                 )}
                                 <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover/card:opacity-100 transition-opacity text-slate-400" />
                               </div>
                             </div>
                          </div>
                        )
                      })}
                   </div>
                 </div>
             </div>
           </div>
         </div>
      </motion.div>
    );
  };

  const renderChainDetail = (chainId: string) => {
    if (viewingModelId) return renderModelImplantation(viewingModelId);
    if (chainId === 'MAGASIN') return renderMagasinDetail();

    const chain = filteredChains.find(c => c.id === chainId);
    if (!chain) return null;

    const activeData = planningEvents.find(e => e.chaineId === chain.id && (e.status === 'IN_PROGRESS' || e.status === 'READY'));
    const activeModel = activeData ? models.find(m => m.id === activeData.modelId) : null;
    
    // Find next model
    const upcomingEvents = planningEvents.filter(e => e.chaineId === chain.id && e.id !== activeData?.id && (e.status === 'READY' || (e.status as string) === 'PENDING')).sort((a, b) => new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime());
    const nextData = upcomingEvents[0];
    const nextModel = nextData ? models.find(m => m.id === nextData.modelId) : null;

    // Find machines assigned to this chain
    const chainInstances = machineInstances.filter(m => m.chainId === chain.id);

    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-6"
      >
        {/* Big Dashboard for the Chain */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column: Info & Personnel */}
          <div className="xl:col-span-1 space-y-6">
            <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-6">
               <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-1">{chain.name}</h2>
               {activeData ? (
                 <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-md text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                   <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En Production
                 </span>
               ) : (
                 <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 text-slate-500 rounded-md text-[10px] font-black uppercase tracking-widest border border-slate-200">
                   En Attente
                 </span>
               )}

               <div className="mt-8 grid gap-3">
                 <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                   <div>
                     <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Chef de Chaîne</label>
                     <div className="font-bold text-slate-800 text-sm">{activeData?.superviseur || 'Non assigné'}</div>
                   </div>
                   <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm shadow-sm">👨‍💼</div>
                 </div>
                 <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                   <div>
                     <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Chef Mécanicien</label>
                     <div className="font-bold text-slate-800 text-sm">Non assigné</div>
                   </div>
                   <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center text-sm shadow-sm">🔧</div>
                 </div>
               </div>
            </div>

            {/* Current Model Info */}
            {activeModel && (
              <div 
                onClick={() => setViewingModelId(activeModel.id)}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100/80 cursor-pointer hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 relative overflow-hidden"
              >
                <div className="absolute -right-16 -top-16 w-48 h-48 bg-indigo-50/50 rounded-full blur-3xl opacity-50 pointer-events-none" />

                {/* Header */}
                <div className="flex items-center justify-between mb-6 relative z-10">
                   <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                         <Component className="w-4 h-4 text-indigo-500" />
                      </div>
                      <span className="font-bold text-slate-800 text-sm">Dossier Technique</span>
                   </div>
                   <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold uppercase tracking-widest">
                     En Cours
                   </span>
                </div>

                {/* Main Identity */}
                <div className="flex gap-5 items-center mb-8 relative z-10">
                   {activeModel.image ? (
                     <div className="w-24 h-24 rounded-[20px] overflow-hidden shadow-sm border border-slate-100 shrink-0">
                       <img src={activeModel.image} className="w-full h-full object-cover" />
                     </div>
                   ) : (
                     <div className="w-24 h-24 rounded-[20px] bg-slate-50 flex items-center justify-center text-slate-300 border border-slate-100 shrink-0">
                        <Component className="w-8 h-8" />
                     </div>
                   )}
                   <div>
                     <span className="inline-block mb-2 px-2.5 py-0.5 bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-md border border-slate-100/50">
                       {activeModel.ficheData?.client || activeData.clientName || 'Client N/A'}
                     </span>
                     <h2 className="text-[22px] font-black text-slate-800 tracking-tight leading-none mb-1.5">
                       {activeModel.meta_data.nom_modele}
                     </h2>
                     <p className="text-slate-500 font-medium text-sm">
                       Réf: <span className="text-slate-700">{activeModel.meta_data.reference || 'N/A'}</span> • {activeModel.meta_data.category || activeModel.ficheData?.category || 'Catégorie non définie'}
                     </p>
                   </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3 relative z-10">
                   <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100/50">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1.5">
                         <Clock className="w-3 h-3" /> Lancement
                      </p>
                      <p className="text-sm font-bold text-slate-800">{(activeData.startDate || '').split('T')[0]}</p>
                   </div>
                   <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100/50">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1.5">
                         <Layers className="w-3 h-3" /> Avancement
                      </p>
                      <p className="text-sm font-bold text-slate-800">
                         <span className="text-emerald-600">{activeData.qteProduite || 0}</span> <span className="text-slate-400 font-medium mx-0.5">/</span> {activeData.qteTotal || activeModel.meta_data.quantity || 0} pces
                      </p>
                   </div>
                </div>
              </div>
            )}

            {/* Next Model Preview */}
            {nextModel && (
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100/80 flex flex-col gap-4 relative overflow-hidden group hover:border-slate-200 transition-all">
                 <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <ArrowUpRight className="w-3 h-3 text-slate-300" /> Prévisionnel
                    </span>
                 </div>
                 <div className="flex gap-4 items-center">
                    {nextModel.image ? (
                      <div className="w-14 h-14 rounded-[14px] overflow-hidden shrink-0 shadow-sm border border-slate-100">
                        <img src={nextModel.image} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-[14px] bg-slate-50 flex items-center justify-center text-slate-300 border border-slate-100 shrink-0">
                         <Component className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <span className="inline-block mb-1 px-2 py-0.5 bg-slate-50 text-slate-500 text-[9px] font-bold uppercase tracking-widest rounded-md border border-slate-100/50">
                        {nextModel.ficheData?.client || 'Client N/A'}
                      </span>
                      <h3 className="font-bold text-slate-800 text-sm leading-tight">{nextModel.meta_data.nom_modele}</h3>
                    </div>
                 </div>
              </div>
            )}
          </div>

          {/* Right Column: Machines in this Chain */}
          <div className="xl:col-span-2 space-y-6">
            
            {/* TOTAL MATERIEL SUMMARY */}
            <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                 <h3 className="font-black text-slate-800 text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" /> Total Matériel de la chaîne</h3>
                 <span className="text-xl font-black text-indigo-600">{chainInstances.length}</span>
              </div>
              {chainInstances.length === 0 ? (
                 <p className="text-xs text-slate-400 font-bold">Aucune machine assignée</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {Object.entries(chainInstances.reduce((acc, inst) => {
                    const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
                    const name = c?.classe || inst.classId;
                    acc[name] = (acc[name] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)).map(([name, count]) => (
                    <div key={name} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-xs font-bold text-slate-700">{name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-black text-slate-800 shadow-sm">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[700px]">
               <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                 <div>
                   <h3 className="font-black text-slate-800 text-lg">Parc Machine Local</h3>
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{chainInstances.length} machines assignées</p>
                 </div>
                 <button onClick={() => { setEditingInstance(null); setInstanceEditorOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors">
                   <Plus className="w-3.5 h-3.5" /> Assigner
                 </button>
               </div>
               
               <div className="flex-1 overflow-auto bg-slate-50/30 p-6 min-h-[300px]">
                 {chainInstances.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-12">
                      <Database className="w-8 h-8 text-slate-200 mb-3" />
                      <p className="text-sm font-bold text-slate-400">Aucune machine n'est assignée à cette chaîne.</p>
                      <p className="text-xs text-slate-400 mt-1">Utilisez le bouton ci-dessus pour assigner des machines.</p>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {chainInstances.map(inst => {
                        const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
                        return (
                          <div key={inst.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-3 group/card hover:border-slate-200 transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="flex gap-2.5 items-center">
                                 {inst.machinePhotos && inst.machinePhotos.length > 0 ? (
                                   <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-100 shrink-0">
                                     <img src={inst.machinePhotos[0]} className="w-full h-full object-cover" />
                                   </div>
                                 ) : null}
                                <div>
                                  <div className="font-black text-slate-800 text-sm leading-tight">{inst.matricule || `Machine N°${inst.numero}`}</div>
                                  <div className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mt-0.5">{inst.brand || 'Marque N/A'}</div>
                                </div>
                              </div>
                              <div className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${
                                inst.status === 'OK' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                inst.status === 'PANNE' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                              }`}>
                                {inst.status || 'OK'}
                              </div>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold tracking-tight">
                                  {c?.classe || inst.classId}
                                </span>
                                <span className="text-[10px] text-slate-400 truncate max-w-[100px]">{c?.name || 'Inconnu'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {inst.machineManuals && inst.machineManuals.length > 0 && (
                                  <a 
                                    href={inst.machineManuals[0].dataUrl} 
                                    download={inst.machineManuals[0].name}
                                    onClick={e => e.stopPropagation()}
                                    className="p-1 bg-white border border-slate-200 rounded text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                                    title={`Télécharger ${inst.machineManuals[0].name}`}
                                  >
                                    <Layers className="w-3 h-3" />
                                  </a>
                                )}
                                 <button onClick={() => { setEditingInstance(inst); setInstanceEditorOpen(true); }} className="opacity-0 group-hover/card:opacity-100 transition-opacity text-slate-400 hover:text-indigo-600">
                                   <ArrowUpRight className="w-3.5 h-3.5" />
                                 </button>
                               </div>
                             </div>
                          </div>
                        )
                      })}
                    </div>
                 )}
               </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderInventory = () => {
    const inventoryRows = machineInstances.filter(inst => {
      if (!searchTerm) return true;
      const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
      return inst.matricule?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             c?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             c?.classe?.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const statusBadge = (s?: string) => {
      if (s === 'PANNE') return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-100 text-[9px] font-black uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" /> Panne
        </span>
      );
      if (s === 'MAINT') return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-100 text-[9px] font-black uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /> Maint.
        </span>
      );
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] font-black uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> OK
        </span>
      );
    };

    return (
      <div className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-400">

        {/* ── Table header */}
        <div className="grid items-center px-5 py-3 bg-slate-50 border-b border-slate-100"
          style={{ gridTemplateColumns: '2fr 3fr 1fr 1fr 1.5fr' }}>
          {['Réf / Matricule', 'Classe & Type', 'Marque', 'Statut', 'Affectation'].map(h => (
            <span key={h} className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</span>
          ))}
        </div>

        {/* ── Rows */}
        <div className="divide-y divide-slate-50">
          {inventoryRows.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                <Database className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-400">Aucune machine dans le parc.</p>
            </div>
          )}

          {inventoryRows.map((inst, idx) => {
            const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
            return (
              <div
                key={inst.id}
                onClick={() => { setEditingInstance(inst); setInstanceEditorOpen(true); }}
                className="grid items-center px-5 py-3.5 hover:bg-indigo-50/30 active:bg-indigo-50/60 cursor-pointer transition-colors group"
                style={{ gridTemplateColumns: '2fr 3fr 1fr 1fr 1.5fr' }}
              >
                {/* Matricule & Photo */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                    {inst.machinePhotos && inst.machinePhotos.length > 0 ? (
                      <img src={inst.machinePhotos[0]} className="w-full h-full object-cover" alt={inst.matricule} />
                    ) : (
                      <Component className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-[12px] font-black text-slate-900 leading-none group-hover:text-indigo-700 transition-colors">
                      {inst.matricule || `MAC-${inst.numero}`}
                    </p>
                    <p className="text-[9px] text-slate-400 font-semibold mt-0.5 font-mono">
                      #{String(idx + 1).padStart(3, '0')}
                    </p>
                  </div>
                </div>

                {/* Classe */}
                <div className="flex items-center gap-2 min-w-0">
                  {c ? (
                    <>
                      <span className="shrink-0 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-black tracking-tight">
                        {c.classe}
                      </span>
                      <span className="text-[11px] text-slate-600 font-semibold truncate">{c.name}</span>
                      {c.machineCategory && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 text-[8px] font-bold uppercase tracking-wide hidden lg:inline">
                          {c.machineCategory}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-500 border border-rose-100 text-[10px] font-bold">
                      Inconnu — {inst.classId}
                    </span>
                  )}
                </div>

                {/* Marque */}
                <div className="text-[11px] font-semibold text-slate-500 truncate">
                  {inst.brand || <span className="text-slate-300">—</span>}
                </div>

                {/* Statut */}
                <div>{statusBadge(inst.status)}</div>

                {/* Affectation & Download */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold truncate ${inst.chainId ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {inst.chainId || 'Magasin libre'}
                    </span>
                    {inst.machineManuals && inst.machineManuals.length > 0 && (
                      <a 
                        href={inst.machineManuals[0].dataUrl} 
                        download={inst.machineManuals[0].name}
                        onClick={e => e.stopPropagation()}
                        className="p-1 bg-white border border-slate-200 rounded text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                        title={`Télécharger ${inst.machineManuals[0].name}`}
                      >
                        <Layers className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-200 group-hover:text-indigo-400 transition-colors shrink-0 ml-1" />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer count */}
        {inventoryRows.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/50 flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              {inventoryRows.length} machine{inventoryRows.length > 1 ? 's' : ''} au total
            </span>
            <span className="text-[9px] font-bold text-slate-300">
              {inventoryRows.filter(i => i.status === 'OK' || !i.status).length} opérationnelles ·{' '}
              {inventoryRows.filter(i => i.status === 'PANNE').length} en panne ·{' '}
              {inventoryRows.filter(i => i.status === 'MAINT').length} en maintenance
            </span>
          </div>
        )}
      </div>
    );
  };


  const renderMaintenance = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      <div className="bg-white rounded-[20px] border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="py-4 px-6">Réf / Matricule</th>
                <th className="py-4 px-6">Classe</th>
                <th className="py-4 px-6">Intervention</th>
                <th className="py-4 px-6 text-right">Action Rapide</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {maintenanceIssueRows.length === 0 ? (
                <tr><td colSpan={4} className="py-12 text-center text-slate-400 font-bold text-xs">Aucune intervention requise. Le parc est opérationnel.</td></tr>
              ) : (
                maintenanceIssueRows.map(inst => {
                  const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
                  return (
                  <tr key={inst.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-6">
                      <div className="font-black text-slate-800 text-[13px]">{inst.matricule || `N°${inst.numero}`}</div>
                      <div className="font-bold text-slate-400 text-[10px] mt-0.5 uppercase tracking-widest">{inst.brand || 'Marque N/A'}</div>
                    </td>
                    <td className="py-3 px-6 font-bold text-slate-600 text-xs">{c ? c.classe : inst.classId}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest shadow-sm border ${inst.status === 'PANNE' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                        {inst.status === 'PANNE' ? <AlertCircle className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                        {inst.status === 'PANNE' ? 'Panne (Arrêt)' : 'Maintenance'}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                       <button onClick={() => onSaveMachineInstance?.({ ...inst, status: 'OK' }, { created: false })} className="text-[10px] font-black tracking-widest text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 px-3 py-1.5 rounded-lg uppercase transition-colors">
                         Marquer Résolu
                       </button>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="bg-white rounded-[20px] border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.03)] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
            <tr>
              <th className="py-4 px-6">Date & Heure</th>
              <th className="py-4 px-6">Action</th>
              <th className="py-4 px-6">Détail Machine</th>
              <th className="py-4 px-6">Opérateur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {historyRows.length === 0 ? (
               <tr><td colSpan={4} className="py-12 text-center text-slate-400 font-bold text-xs">Aucun historique disponible.</td></tr>
            ) : (
              historyRows.map(h => (
                <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-6">
                     <div className="font-bold text-slate-800 text-[13px]">{new Date(h.at).toLocaleDateString('fr-FR')}</div>
                     <div className="text-[10px] font-bold text-slate-400 uppercase">{new Date(h.at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</div>
                  </td>
                  <td className="py-3 px-6">
                    {h.kind === 'ADD' ? <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-emerald-100">Entrée</span> :
                     h.kind === 'SELL' ? <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-amber-100">Vente</span> :
                     <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-slate-200">Sortie</span>}
                  </td>
                  <td className="py-3 px-6">
                     <div className="font-black text-slate-800 text-[13px]">{h.machineSnapshot.name}</div>
                     <div className="font-bold text-slate-400 text-[10px] mt-0.5 uppercase tracking-widest">Classe: {h.machineSnapshot.classe}</div>
                  </td>
                  <td className="py-3 px-6 font-bold text-slate-500 text-xs">{h.actorName || 'Système'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="w-full min-h-screen bg-[#fafcff] text-slate-900 pb-32 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
      {/* ULTRA COMPACT SAAS HEADER & TOOLBAR */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/50 sticky top-0 z-30 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] transition-all">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-4 md:gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0 border border-indigo-400/20">
                 <Component className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
              </div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight hidden sm:block drop-shadow-sm">Inventaire</h1>
            </div>

            <div className="h-6 w-px bg-slate-200 hidden md:block" />

            <div className="hidden lg:flex items-center gap-3 text-[10px] font-black tracking-widest uppercase">
               <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-100 text-slate-500 shadow-sm">
                 TOTAL <span className="text-slate-800 ml-0.5 text-[11px]">{fleetStats.total}</span>
               </span>
               <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-100 text-emerald-600 shadow-sm">
                 PRÊTES <span className="text-emerald-700 ml-0.5 text-[11px]">{fleetStats.ok}</span>
               </span>
               <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 border border-rose-100 text-rose-600 shadow-sm">
                 PANNE <span className="text-rose-700 ml-0.5 text-[11px]">{fleetStats.panne}</span>
               </span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 flex-1 justify-end">
            
            {(selectedChainId || viewingModelId) && (
               <button 
                 onClick={() => viewingModelId ? setViewingModelId(null) : setSelectedChainId(null)} 
                 className="flex items-center gap-1.5 mr-auto px-3 py-1.5 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all border border-slate-200 shadow-sm hover:shadow-md"
               >
                 <ArrowLeft className="w-3.5 h-3.5" /> Retour
               </button>
            )}

            <>
              <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-[10px] border border-slate-200/50 overflow-x-auto hide-scrollbar shrink-0 shadow-inner">
                  {[
                    { id: 'OVERVIEW', label: 'Vue Globale' },
                    { id: 'INVENTORY', label: 'Inventaire' },
                    { id: 'MAINTENANCE', label: 'Maintenance' },
                    { id: 'HISTORY', label: 'Historique' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id as TabType); setSelectedChainId(null); setViewingModelId(null); }}
                      className={`px-3.5 py-1.5 rounded-md text-[11px] font-black transition-all whitespace-nowrap uppercase tracking-wider ${
                        activeTab === tab.id 
                          ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/80 drop-shadow-sm' 
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="h-6 w-px bg-slate-200 hidden xl:block mx-1" />

                <div className="flex items-center gap-2 shrink-0">
                   <div className="relative hidden xl:block w-56 group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                      <input 
                        type="text" 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Filtrer..." 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all shadow-sm"
                      />
                   </div>
                   
                   <button onClick={() => { setEditingInstance(null); setInstanceEditorOpen(true); }} className="flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[11px] font-black rounded-lg shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-0.5 transition-all tracking-widest uppercase border border-indigo-400/20">
                     <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Ajouter</span>
                   </button>
                </div>
              </>
          </div>

        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 md:px-8 mt-6 md:mt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + (selectedChainId || '') + (viewingModelId || '')}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            {activeTab === 'OVERVIEW' && (selectedChainId ? renderChainDetail(selectedChainId) : renderOverviewMap())}
            {activeTab === 'INVENTORY' && renderInventory()}
            {activeTab === 'MAINTENANCE' && renderMaintenance()}
            {activeTab === 'HISTORY' && renderHistory()}
          </motion.div>
        </AnimatePresence>
      </div>

      {instanceEditorOpen && (
        <InstanceEditorModal
          open={instanceEditorOpen}
          onClose={() => {
            setInstanceEditorOpen(false);
            setEditingInstance(null);
          }}
          instance={editingInstance || undefined}
          onSave={(inst, ctx) => {
            onSaveMachineInstance?.(inst, ctx);
            if (ctx.created) {
               const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
               setQrMachine({ ...(c || {} as Machine), ...inst, id: inst.id } as Machine);
            }
            setInstanceEditorOpen(false);
            setEditingInstance(null);
          }}
          onDelete={(id) => {
            onDeleteMachineInstance?.(id);
            setInstanceEditorOpen(false);
            setEditingInstance(null);
          }}
          classes={machines}
          instances={machineInstances}
          onAddClassShortcut={(className) => {
            setClassShortcutInitialClass(className);
            setClassShortcutOpen(true);
          }}
        />
      )}

      {classShortcutOpen && (
        <ClassEditorModal 
          open={classShortcutOpen}
          initialClass={classShortcutInitialClass}
          onClose={() => setClassShortcutOpen(false)}
          onSave={(newClass) => {
            onSaveMachine?.(newClass, { created: true });
            setClassShortcutOpen(false);
          }}
        />
      )}

      {exitModalOpen && (
        <MachineExitModal
          open={exitModalOpen}
          onClose={() => {
            setExitModalOpen(false);
            setExitModalInitialId(null);
          }}
          machines={machines}
          onConfirm={(payload) => {
            onArchiveMachine(payload);
            setExitModalOpen(false);
            setExitModalInitialId(null);
          }}
          initialMachineId={exitModalInitialId || undefined}
          defaultActorName={defaultFleetActorName}
        />
      )}

      {qrMachine && (
        <MachineQrTicket
          machine={qrMachine}
          companyProfile={settings.companyProfile}
          onClose={() => setQrMachine(null)}
        />
      )}

    </div>
  );
}

// -----------------------------------------------------------------------------------------
// Inline Editor Modal for Machine Instance (Real Machine)
// -----------------------------------------------------------------------------------------

function InstanceEditorModal({
  open, onClose, instance, onSave, onDelete, classes, instances, onAddClassShortcut
}: {
  open: boolean; onClose: () => void; instance?: MachineInstance;
  onSave: (inst: MachineInstance, ctx: { created: boolean }) => void;
  onDelete: (id: string) => void;
  classes: Machine[];
  instances: MachineInstance[];
  onAddClassShortcut: (className: string) => void;
}) {
  const [classId, setClassId] = useState(instance?.classId || '');
  const [matricule, setMatricule] = useState(instance?.matricule || '');
  const [brand, setBrand] = useState(instance?.brand || '');
  const [serialNumber, setSerialNumber] = useState(instance?.serialNumber || '');
  const [status, setStatus] = useState<'OK'|'PANNE'|'MAINT'>(instance?.status || 'OK');
  const [chainId, setChainId] = useState(instance?.chainId || '');
  const [photos, setPhotos] = useState<string[]>(instance?.machinePhotos || []);
  const [manuals, setManuals] = useState<{dataUrl: string, name: string}[]>(instance?.machineManuals || []);

  const isClassKnown = classes.some(c => c.classe === classId || c.id === classId);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setPhotos([ev.target.result as string]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setManuals([{ dataUrl: ev.target.result as string, name: file.name }]);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/30 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-[32px] shadow-2xl shadow-indigo-500/10 w-full max-w-md overflow-hidden flex flex-col scale-in-center border border-slate-100">
        
        {/* Header */}
        <div className="p-8 pb-6 flex items-start justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-50 rounded-full blur-3xl opacity-60 -mr-10 -mt-10 pointer-events-none" />
          
          <div className="flex gap-4 items-center relative z-10">
            <div className="w-12 h-12 rounded-[20px] bg-indigo-50 border border-indigo-100/50 flex items-center justify-center shrink-0 shadow-sm">
               <Component className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-xl tracking-tight leading-none mb-1.5">
                {instance ? 'Gérer la Machine' : 'Ajouter une Machine'}
              </h2>
              <p className="text-xs font-bold text-slate-400">Configurez les paramètres du parc</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 border border-slate-100 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors relative z-10"><XCircle className="w-4 h-4"/></button>
        </div>
        
        {/* Body Form */}
        <div className="px-8 pb-8 flex flex-col gap-5 relative z-10">
          
          {/* Classe Lookup */}
          <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-100/80">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Layers className="w-3 h-3" /> Classe & Type</label>
            <div className="flex gap-3">
              <input 
                list="classes-list"
                value={classId}
                onChange={e => setClassId(e.target.value)}
                placeholder="Ex: 301, 516..."
                className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all placeholder-slate-300 shadow-sm"
              />
              <datalist id="classes-list">
                {classes.map(c => <option key={c.id} value={c.classe}>{c.name}</option>)}
              </datalist>
              
              {!isClassKnown && classId.trim().length > 0 && (
                <button 
                  onClick={() => onAddClassShortcut(classId.trim())}
                  className="px-4 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider rounded-xl hover:bg-indigo-700 transition-colors whitespace-nowrap shadow-sm"
                >
                  + Créer
                </button>
              )}
            </div>
            {!isClassKnown && classId.trim().length > 0 && (
              <p className="text-[10px] text-amber-500 font-bold mt-2.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Classe inconnue, création automatique possible
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Réf / Matricule</label>
              <input 
                type="text" value={matricule} onChange={e => setMatricule(e.target.value)}
                placeholder="MAC-001"
                className={`w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 transition-all uppercase placeholder-slate-300 ${instances.some(i => i.id !== instance?.id && i.matricule && i.matricule === matricule) ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100 text-rose-600' : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'}`}
              />
              {instances.some(i => i.id !== instance?.id && i.matricule && i.matricule === matricule) && (
                <p className="text-[9px] font-bold text-rose-500 mt-1 ml-1">Déjà utilisé</p>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Marque</label>
              <input 
                type="text" value={brand} onChange={e => setBrand(e.target.value)}
                placeholder="Brother, Juki..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all placeholder-slate-300"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">N° de Série</label>
              <input 
                type="text" value={serialNumber} onChange={e => setSerialNumber(e.target.value)}
                placeholder="SN-123456789"
                className={`w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 transition-all placeholder-slate-300 ${instances.some(i => i.id !== instance?.id && i.serialNumber && i.serialNumber === serialNumber) ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100 text-rose-600' : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'}`}
              />
              {instances.some(i => i.id !== instance?.id && i.serialNumber && i.serialNumber === serialNumber) && (
                <p className="text-[9px] font-bold text-rose-500 mt-1 ml-1">Déjà utilisé</p>
              )}
            </div>
          </div>
          {(!matricule.trim() && !serialNumber.trim()) && (
            <p className="text-[10px] font-bold text-amber-500 flex items-center gap-1.5 -mt-2">
              <AlertTriangle className="w-3.5 h-3.5" /> Veuillez renseigner au moins une Référence ou un N° de Série.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Affectation</label>
              <select
                value={chainId}
                onChange={e => setChainId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all appearance-none cursor-pointer"
              >
                <option value="">Magasin (Libre)</option>
                {Array.from({ length: 6 }).map((_, i) => (
                  <option key={`CHAINE ${i + 1}`} value={`CHAINE ${i + 1}`}>
                    CHAINE {i + 1}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Statut</label>
              <div className="flex p-1 gap-1 bg-slate-100 rounded-xl border border-slate-200/60 h-[42px]">
                {(['OK', 'MAINT', 'PANNE'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`flex-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center ${
                      status === s 
                        ? s === 'OK' ? 'bg-emerald-500 text-white shadow-sm' : s === 'MAINT' ? 'bg-amber-500 text-white shadow-sm' : 'bg-rose-500 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Photo Machine</label>
              <div className="relative border-2 border-dashed border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group overflow-hidden h-[80px]">
                 <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={handlePhotoUpload} />
                 {photos.length > 0 && (
                   <img src={photos[0]} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                 )}
                 <Printer className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 mb-1 z-10 transition-colors" />
                 <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest z-10 bg-white/80 px-2 py-0.5 rounded-full">{photos.length > 0 ? 'Modifier Photo' : 'Ajouter Photo'}</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Fichier (PDF/Excel)</label>
              <div className="relative border-2 border-dashed border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group h-[80px] overflow-hidden">
                 <input type="file" accept=".pdf,.xls,.xlsx,.doc,.docx" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={handleManualUpload} />
                 <Layers className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 mb-1 z-10 transition-colors" />
                 <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center truncate w-full px-2 z-10 bg-white/80 rounded-full py-0.5">
                   {manuals.length > 0 ? manuals[0].name : 'Joindre Fichier'}
                 </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between mt-auto">
          {instance ? (
             <button 
               onClick={() => onDelete(instance.id)}
               className="px-4 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors"
             >
               Supprimer
             </button>
          ) : <div />}
          
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-xl transition-colors">Annuler</button>
            <button 
              onClick={() => {
                const matchedClass = classes.find(c => c.classe === classId);
                const finalClassId = matchedClass ? matchedClass.id : classId;
                onSave({
                  id: instance?.id || `inst_${Date.now()}`,
                  classId: finalClassId,
                  numero: instance?.numero || Date.now(),
                  matricule, brand, serialNumber, status, chainId: chainId || undefined,
                  machinePhotos: photos,
                  machineManuals: manuals
                }, { created: !instance });
              }}
              disabled={
                (!matricule.trim() && !serialNumber.trim()) || 
                !classId.trim() ||
                instances.some(i => i.id !== instance?.id && i.matricule && i.matricule === matricule) ||
                instances.some(i => i.id !== instance?.id && i.serialNumber && i.serialNumber === serialNumber)
              }
              className="px-7 py-2.5 bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest rounded-xl shadow-md hover:bg-indigo-600 hover:shadow-lg hover:shadow-indigo-500/20 disabled:opacity-50 disabled:hover:bg-slate-900 transition-all"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .scale-in-center { animation: scale-in-center 0.25s cubic-bezier(0.250, 0.460, 0.450, 0.940) both; }
        @keyframes scale-in-center { 0% { transform: scale(0.95); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

// -----------------------------------------------------------------------------------------
// Inline Editor Modal for Machine Class (Shortcut)
// -----------------------------------------------------------------------------------------

function ClassEditorModal({
  open, initialClass, onClose, onSave
}: {
  open: boolean; initialClass: string; onClose: () => void;
  onSave: (c: Machine) => void;
}) {
  const [name, setName] = useState(`Nouvelle Machine ${initialClass}`);
  const [machineCategory, setMachineCategory] = useState('Surjeteuse');
  const [classe, setClasse] = useState(initialClass);
  const [speed, setSpeed] = useState(3000);
  const [speedMajor, setSpeedMajor] = useState(1.01);
  const [cofs, setCofs] = useState(1.15);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/30 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-[32px] shadow-2xl shadow-indigo-500/10 w-full max-w-md overflow-hidden flex flex-col scale-in-center border border-slate-100">
        
        {/* Header */}
        <div className="p-8 pb-6 flex items-start justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-50 rounded-full blur-3xl opacity-60 -mr-10 -mt-10 pointer-events-none" />
          
          <div className="flex gap-4 items-center relative z-10">
            <div className="w-12 h-12 rounded-[20px] bg-emerald-50 border border-emerald-100/50 flex items-center justify-center shrink-0 shadow-sm">
               <Plus className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-xl tracking-tight leading-none mb-1.5">
                Créer la Classe
              </h2>
              <p className="text-xs font-bold text-slate-400">Définissez ce nouveau type</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 border border-slate-100 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors relative z-10"><XCircle className="w-4 h-4"/></button>
        </div>
        
        {/* Body Form */}
        <div className="px-8 pb-8 flex flex-col gap-5 relative z-10">
          
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Nom *</label>
            <input 
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Surjeteuse 5 Fils"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder-slate-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Type (Famille)</label>
              <input 
                type="text" value={machineCategory} onChange={e => setMachineCategory(e.target.value)}
                placeholder="Ex: Surjeteuse"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder-slate-300"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Classe *</label>
              <input 
                type="text" value={classe} onChange={e => setClasse(e.target.value)}
                placeholder="Ex: 516"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder-slate-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Vitesse</label>
              <input 
                type="number" value={speed} onChange={e => setSpeed(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Majoration</label>
              <input 
                type="number" step="0.01" value={speedMajor} onChange={e => setSpeedMajor(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">COFS</label>
              <input 
                type="number" step="0.01" value={cofs} onChange={e => setCofs(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 pt-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end mt-auto">
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-xl transition-colors">Annuler</button>
            <button 
              onClick={() => {
                onSave({
                  id: Date.now().toString(),
                  name,
                  classe,
                  machineCategory,
                  speed,
                  speedMajor,
                  cofs,
                  active: true
                });
              }}
              disabled={!name.trim() || !classe.trim()}
              className="px-7 py-2.5 bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl shadow-md hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:hover:bg-emerald-600 transition-all"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .scale-in-center { animation: scale-in-center 0.25s cubic-bezier(0.250, 0.460, 0.450, 0.940) both; }
        @keyframes scale-in-center { 0% { transform: scale(0.95); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}
