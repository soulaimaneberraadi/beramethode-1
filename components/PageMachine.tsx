import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Clock, Component, Layers, AlertTriangle, CheckCircle2,
  Search, Wrench, XCircle, Database, Plus, LayoutDashboard, History, 
  LogOut, Server, ArrowUpRight, ActivitySquare, AlertCircle, ArrowLeft, Users, Printer, ScanLine
} from 'lucide-react';
import { PlanningEvent, ModelData, AppSettings, Machine, MachineFleetHistoryEntry, MachineInstance } from '../types';
import MachineExitModal, { type MachineExitPayload } from './MachineExitModal';
import MachineQuickScanModal from './MachineQuickScanModal';
import { MachineQrTicket } from './MachineQrTicket';
import Implantation from './Implantation';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

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
const NON_SHORTAGE_MACHINE_CLASSES = new Set(['MAN', 'MANUEL', 'FER', 'BR']);

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
  const [scanOpen, setScanOpen] = useState(false);
  const { lang } = useLang();

  // --- Logic & Data Preparation ---
  const filteredChains = useMemo(() => {
    return Array.from({ length: settings?.chainsCount || 4 }).map((_, i) => ({
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

  const getOperationMachineClass = (op: ModelData['gamme_operatoire'][number]) => {
    const rawClass = (op.machineClass || '').trim();
    if (rawClass) {
      const normalizedClass = rawClass.toUpperCase();
      return NON_SHORTAGE_MACHINE_CLASSES.has(normalizedClass) ? undefined : rawClass;
    }

    const byId = op.machineId ? machines.find(m => m.id === op.machineId) : undefined;
    if (byId?.classe) {
      const normalizedClass = byId.classe.toUpperCase();
      return NON_SHORTAGE_MACHINE_CLASSES.has(normalizedClass) ? undefined : byId.classe;
    }

    const rawName = (op.machineName || '').trim();
    if (!rawName || /^p\d+(?:\.\d+)?$/i.test(rawName)) return undefined;

    const normalized = rawName.toLowerCase();
    const byName = machines.find(m =>
      m.name?.trim().toLowerCase() === normalized ||
      m.classe?.trim().toLowerCase() === normalized ||
      m.machineCategory?.trim().toLowerCase() === normalized
    );
    const resolvedClass = byName?.classe || rawName;
    return NON_SHORTAGE_MACHINE_CLASSES.has(resolvedClass.toUpperCase()) ? undefined : resolvedClass;
  };

  const getModelMachineRequirements = (model: ModelData | null): Record<string, number> => {
    if (!model?.gamme_operatoire?.length) return {};
    const required: Record<string, number> = {};
    model.gamme_operatoire.forEach(op => {
      const cls = getOperationMachineClass(op);
      if (!cls) return;
      required[cls] = (required[cls] || 0) + 1;
    });
    return required;
  };

  const getMachineGap = (chainId: string, model: ModelData | null) => {
    const required = getModelMachineRequirements(model);
    const actual = getMachineBreakdown(chainId).breakdown;
    const gap: { cls: string; required: number; actual: number; missing: number; excess: number }[] = [];
    const allClasses = new Set(Object.keys(required));
    allClasses.forEach(cls => {
      const req = required[cls] || 0;
      const act = actual[cls] || 0;
      const missing = Math.max(0, req - act);
      const excess = Math.max(0, act - req);
      gap.push({ cls, required: req, actual: act, missing, excess });
    });
    return gap.filter(g => g.required > 0 || g.actual > 0).sort((a, b) => b.required - a.required);
  };

  const getMachineDisplayMeta = (machineClass: string) => {
    const machineDef = machines.find(m => m.classe === machineClass || m.id === machineClass || m.machineCategory === machineClass);
    return {
      label: machineDef?.classe || machineClass,
      type: machineDef?.machineCategory || machineDef?.name || tx(lang,{fr:'Type non défini',ar:'نوع غير محدد',en:'Undefined type',es:'Tipo no definido',pt:'Tipo não definido',tr:'Tanımlanmamış tip'}),
    };
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
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 md:gap-6"
      >
      {filteredChains.map((chain, idx) => {
        const activeData = planningEvents.find(e => e.chaineId === chain.id && (e.status === 'IN_PROGRESS' || e.status === 'READY'));
        const activeModel = activeData ? models.find(m => m.id === activeData.modelId) : null;
        if (activeModel && !activeModel.meta_data.reference?.trim() && activeModel.meta_data.nom_modele?.trim()) {
          activeModel.meta_data.reference = activeModel.meta_data.nom_modele;
        }
        
        const qteProduite = activeData?.qteProduite || 0;
        const qteTotal = activeData?.qteTotal || activeModel?.meta_data.quantity || 0;
        const progress = qteTotal > 0 ? Math.min(100, Math.round((qteProduite / qteTotal) * 100)) : 0;
        
        const machineGap = activeModel ? getMachineGap(chain.id, activeModel) : [];
        const totalRequired = machineGap.reduce((s, g) => s + g.required, 0);
        const totalActual = machineGap.reduce((s, g) => s + g.actual, 0);
        const totalMissing = machineGap.reduce((s, g) => s + g.missing, 0);
        const machineReadiness = totalRequired > 0 ? Math.round((totalActual / totalRequired) * 100) : 0;
        const topNeeds = [...machineGap]
          .sort((a, b) => {
            if (b.missing !== a.missing) return b.missing - a.missing;
            if (b.required !== a.required) return b.required - a.required;
            return a.cls.localeCompare(b.cls);
          })
          .slice(0, 3);
        const machineInventory = Object.entries(getMachineBreakdown(chain.id).breakdown)
          .sort((a, b) => b[1] - a[1]);

        return (
          <motion.div
            key={chain.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -4, boxShadow: '0 20px 40px -12px rgba(0,0,0,0.1)' }}
            whileTap={{ scale: 0.99 }}
            onClick={() => { setSelectedChainId(chain.id); setViewingModelId(null); }}
            className="group cursor-pointer rounded-2xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border flex flex-col h-full overflow-hidden transition-all duration-300 hover:border-slate-300"
          >
            {activeData && (
              <div className="h-1 w-full bg-emerald-500 shrink-0" />
            )}

            <div className="p-5 flex flex-col h-full gap-4">
              {/* Header: Chain Name + Status + Machine Count */}
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-dk-text text-lg tracking-tight leading-none mb-2">{chain.name}</h3>
                  {activeData ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      {tx(lang,{fr:'En Production',ar:'قيد الإنتاج',en:'In Production',es:'En Producción',pt:'Em Produção',tr:'Üretimde'})}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted text-[10px] font-bold border border-slate-200 dark:border-dk-border">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      {tx(lang,{fr:'Disponible',ar:'متاح',en:'Available',es:'Disponible',pt:'Disponível',tr:'Müsait'})}
                    </span>
                  )}
                </div>
                <div className={`flex flex-col items-center justify-center min-w-[64px] h-[64px] rounded-xl border shrink-0 transition-colors ${
                  activeData ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200' : 'bg-slate-50 dark:bg-dk-bg border-slate-200 dark:border-dk-border'
                }`}>
                  <span className={`text-2xl font-black leading-none ${activeData ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                    {getMachineBreakdown(chain.id).total}
                  </span>
                    <span className="text-[9px] font-semibold text-slate-400 dark:text-dk-muted uppercase tracking-wider mt-0.5">{tx(lang,{fr:'Machines',ar:'آلات',en:'Machines',es:'Máquinas',pt:'Máquinas',tr:'Makineler'})}</span>
                </div>
              </div>

              {activeData && activeModel ? (
                <div className="flex flex-col flex-1">
                  {/* Model Info Card */}
                  <div className="flex gap-3 items-center mb-4 p-3.5 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border">
                    {activeModel.image ? (
                      <img src={activeModel.image} className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-dk-border shrink-0" alt="" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-dk-elevated flex items-center justify-center border border-slate-200 dark:border-dk-border shrink-0">
                        <Component className="w-5 h-5 text-slate-400 dark:text-dk-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text uppercase tracking-wider mb-0.5 truncate">{activeModel.ficheData?.client || activeData.clientName || '—'}</p>
                      <p className="font-bold text-slate-900 dark:text-dk-text text-sm leading-tight truncate">{activeModel.meta_data.nom_modele}</p>
                      <p className="text-[11px] text-slate-500 dark:text-dk-muted mt-0.5 truncate">Ref: {activeModel.meta_data.reference || '—'}</p>
                    </div>
                  </div>

                  {/* Machine Readiness Section */}
                  {machineGap.length > 0 && (
                    <div className="mb-4">
                      {/* Header: Label + Total + Deficit */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider">{tx(lang,{fr:'Matériel',ar:'المعدات',en:'Equipment',es:'Equipo',pt:'Equipamento',tr:'Ekipman'})}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700 dark:text-dk-text-soft">{totalActual} <span className="text-slate-400 dark:text-dk-muted">/</span> {totalRequired}</span>
                          {totalMissing > 0 && (
                            <span className="px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-black border border-rose-200">-{totalMissing}</span>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="h-2 w-full bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden mb-3">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${machineReadiness >= 100 ? 'bg-emerald-500' : machineReadiness >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(100, machineReadiness)}%` }}
                        />
                      </div>

                      {/* Machine Type Grid */}
                      <div className="space-y-1.5">
                        {machineGap.slice(0, 6).map(g => {
                          const meta = getMachineDisplayMeta(g.cls);
                          const displayName = meta.label !== g.cls ? meta.label : g.cls;
                          return (
                            <div key={g.cls} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-700 dark:text-dk-text-soft">{displayName}</span>
                                {meta.label !== g.cls && (
                                  <span className="text-[9px] font-semibold text-slate-400 dark:text-dk-muted bg-slate-100 dark:bg-dk-elevated px-1.5 py-0.5 rounded">{g.cls}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-600 dark:text-dk-text-soft">{g.actual}<span className="text-slate-400 dark:text-dk-muted">/{g.required}</span></span>
                                {g.missing > 0 && <span className="text-xs font-black text-rose-500 dark:text-rose-400">-{g.missing}</span>}
                                {g.excess > 0 && <span className="text-xs font-black text-amber-500 dark:text-amber-400">+{g.excess}</span>}
                                {g.missing === 0 && g.excess === 0 && <span className="text-xs text-emerald-500 dark:text-emerald-400">✓</span>}
                              </div>
                            </div>
                          );
                        })}
                        {machineGap.length > 6 && (
                          <div className="flex items-center justify-center py-2 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">+{machineGap.length - 6} {tx(lang,{fr:'autres',ar:'أخرى',en:'others',es:'más',pt:'outros',tr:'diğer'})}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Progression Section */}
                  <div className="mt-auto space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider">{tx(lang,{fr:'Progression',ar:'التقدم',en:'Progress',es:'Progreso',pt:'Progresso',tr:'İlerleme'})}</span>
                      <span className="text-[10px] font-bold text-slate-600 dark:text-dk-text-soft">{qteProduite}<span className="text-slate-400 dark:text-dk-muted"> / </span>{qteTotal}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col flex-1 items-center justify-center py-8">
                  <ActivitySquare className="w-10 h-10 text-slate-200 mb-3" />
                  <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider">{tx(lang,{fr:'Aucun modèle assigné',ar:'لا يوجد موديل معين',en:'No model assigned',es:'Ningún modelo asignado',pt:'Nenhum modelo atribuído',tr:'Model atanmamış'})}</span>
                </div>
              )}

              {/* Machine Inventory Footer */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-dk-border flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {Object.entries(getMachineBreakdown(chain.id).breakdown).map(([name, count]) => (
                  <div key={name} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border shrink-0">
                    <span className="text-[9px] font-semibold text-slate-500 dark:text-dk-muted uppercase">{name}</span>
                    <span className="text-[10px] font-black text-slate-700 dark:text-dk-text-soft">{count}</span>
                  </div>
                ))}
                {getMachineBreakdown(chain.id).total === 0 && (
                  <span className="text-[9px] text-slate-300 dark:text-dk-muted italic">{tx(lang,{fr:'Aucun matériel',ar:'لا توجد معدات',en:'No equipment',es:'Sin equipo',pt:'Nenhum equipamento',tr:'Ekipman yok'})}</span>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}

      {/* Magasin Central Card */}
      <motion.div 
        whileHover={{ y: -6, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => { setSelectedChainId('MAGASIN'); setViewingModelId(null); }}
        className="group cursor-pointer bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border hover:border-slate-300 transition-all duration-300 flex flex-col h-full relative overflow-hidden"
      >
        <div className="p-5 md:p-6 flex flex-col h-full relative z-10">
          {/* Header */}
          <div className="flex justify-between items-start mb-5">
            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-slate-900 dark:text-dk-text text-lg md:text-xl tracking-tight">{tx(lang,{fr:'Magasin Central',ar:'المخزن المركزي',en:'Central Warehouse',es:'Almacén Central',pt:'Armazém Central',tr:'Merkez Depo'})}</h3>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text text-[10px] font-bold tracking-wide border border-indigo-200">
                <Database className="w-3 h-3" /> {tx(lang,{fr:'Stock Principal',ar:'المخزون الرئيسي',en:'Main Stock',es:'Stock Principal',pt:'Stock Principal',tr:'Ana Stok'})}
              </span>
            </div>
            
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text font-black text-sm border border-indigo-200 group-hover:bg-indigo-100 transition-all duration-300">
              {getMachineBreakdown(null).total}
            </div>
          </div>
          
          {/* Body: Status summary */}
          <div className="flex flex-col flex-1 justify-end space-y-3 mb-2">
             <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/30 p-3 md:p-4 rounded-xl border border-emerald-100 dark:border-emerald-800 group-hover:bg-emerald-100 transition-colors">
                <span className="flex items-center gap-2 text-[10px] font-bold text-emerald-700 uppercase tracking-wider"><CheckCircle2 className="w-4 h-4"/> {tx(lang,{fr:'Prêtes (OK)',ar:'جاهزة (OK)',en:'Ready (OK)',es:'Listas (OK)',pt:'Prontas (OK)',tr:'Hazır (OK)'})}</span>
               <span className="text-lg font-black text-emerald-700">{okC}</span>
             </div>
             <div className="flex justify-between items-center bg-rose-50 dark:bg-rose-900/30 p-3 md:p-4 rounded-xl border border-rose-100 dark:border-rose-800 group-hover:bg-rose-100 transition-colors">
                <span className="flex items-center gap-2 text-[10px] font-bold text-rose-700 uppercase tracking-wider"><AlertTriangle className="w-4 h-4"/> {tx(lang,{fr:'En Réparation',ar:'قيد الإصلاح',en:'Under Repair',es:'En Reparación',pt:'Em Reparação',tr:'Tamirde'})}</span>
               <span className="text-lg font-black text-rose-700">{brokenCount}</span>
             </div>
          </div>
          
          {/* Footer: Machine Breakdown */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-dk-border flex items-center overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
             <div className="flex items-center gap-2 shrink-0">
               {Object.entries(getMachineBreakdown(null).breakdown).map(([name, count]) => (
                 <div key={name} className="flex items-center gap-2 bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border rounded-lg pl-3 pr-2 py-1.5 shrink-0 group-hover:bg-slate-100 transition-colors">
                   <span className="text-[9px] font-semibold text-slate-600 dark:text-dk-text-soft uppercase tracking-wider">{name}</span>
                   <span className="w-5 h-5 rounded-md bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border flex items-center justify-center text-[10px] font-black text-slate-700 dark:text-dk-text-soft">{count}</span>
                 </div>
               ))}
               {getMachineBreakdown(null).total === 0 && (
                  <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Magasin vide',ar:'المخزن فارغ',en:'Warehouse empty',es:'Almacén vacío',pt:'Armazém vazio',tr:'Depo boş'})}</span>
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
          className="bg-white dark:bg-dk-surface rounded-[20px] border border-slate-100 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden"
        >
           <div className="p-6 md:p-8 border-b border-slate-100 dark:border-dk-border flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                 <div className="w-16 h-16 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border overflow-hidden shrink-0 flex items-center justify-center">
                    {model.image ? <img src={model.image} className="w-full h-full object-cover" /> : <Component className="w-6 h-6 text-slate-300 dark:text-dk-muted" />}
                 </div>
                 <div>
                     <h2 className="text-2xl font-black text-slate-900 dark:text-dk-text tracking-tight leading-tight">{model.meta_data.nom_modele || tx(lang,{fr:'Modèle sans nom',ar:'موديل بدون اسم',en:'Unnamed model',es:'Modelo sin nombre',pt:'Modelo sem nome',tr:'İsimsiz model'})}</h2>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft rounded text-[10px] font-black uppercase tracking-widest border border-slate-200 dark:border-dk-border">
                        REF: {model.meta_data.reference || 'N/A'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest flex items-center gap-1">
                          <Layers className="w-3 h-3" /> {tx(lang,{fr:'Implantation (Gamme)',ar:'التوزيع (المراحل)',en:'Layout (Routing)',es:'Implantación (Gama)',pt:'Implantação (Gama)',tr:'Yerleşim (Rota)'})}
                      </span>
                    </div>
                 </div>
              </div>
           </div>

           <div className="w-full h-[600px] relative bg-slate-50 dark:bg-dk-bg">
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
              <div className="bg-slate-900 rounded-[20px] border border-slate-800 shadow-sm dark:shadow-dk-sm p-6 relative overflow-hidden">
                 <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl" />
                  <h2 className="text-2xl font-black text-white tracking-tight mb-1 relative z-10">{tx(lang,{fr:'Magasin Central',ar:'المخزن المركزي',en:'Central Warehouse',es:'Almacén Central',pt:'Armazém Central',tr:'Merkez Depo'})}</h2>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-md text-[10px] font-black uppercase tracking-widest border border-indigo-500/30 relative z-10">
                    {tx(lang,{fr:'Stock Principal',ar:'المخزون الرئيسي',en:'Main Stock',es:'Stock Principal',pt:'Stock Principal',tr:'Ana Stok'})}
                 </span>
                 <div className="mt-8 space-y-3 relative z-10">
                   <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                      <span className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider"><CheckCircle2 className="w-4 h-4"/> {tx(lang,{fr:'Prêtes (OK)',ar:'جاهزة (OK)',en:'Ready (OK)',es:'Listas (OK)',pt:'Prontas (OK)',tr:'Hazır (OK)'})}</span>
                     <span className="text-sm font-black text-white">{okInstances.length}</span>
                   </div>
                   <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                      <span className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider"><AlertTriangle className="w-4 h-4"/> {tx(lang,{fr:'En Réparation',ar:'قيد الإصلاح',en:'Under Repair',es:'En Reparación',pt:'Em Reparação',tr:'Tamirde'})}</span>
                     <span className="text-sm font-black text-white">{brokenInstances.length}</span>
                   </div>
                 </div>
              </div>

              {/* List of broken machines with ETA */}
              <div className="bg-white dark:bg-dk-surface rounded-[20px] border border-slate-100 dark:border-dk-border shadow-sm dark:shadow-dk-sm p-6">
                  <h3 className="font-black text-slate-800 dark:text-dk-text text-sm mb-4 flex items-center gap-2"><Wrench className="w-4 h-4 text-amber-500 dark:text-amber-400"/> {tx(lang,{fr:'En cours de réparation',ar:'قيد الإصلاح حالياً',en:'Currently under repair',es:'En reparación actualmente',pt:'Atualmente em reparação',tr:'Şu anda tamirde'})}</h3>
                 <div className="space-y-3">
                   {brokenInstances.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-dk-muted font-bold">{tx(lang,{fr:'Aucune machine en réparation.',ar:'لا توجد آلة قيد الإصلاح.',en:'No machines under repair.',es:'No hay máquinas en reparación.',pt:'Nenhuma máquina em reparação.',tr:'Tamirde makine yok.'})}</p>
                   ) : (
                     brokenInstances.map(inst => {
                       const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
                       // Generate a pseudo-random ETA date
                       const daysToAdd = (inst.numero % 5) + 1;
                       const eta = new Date();
                       eta.setDate(eta.getDate() + daysToAdd);
                       return (
                         <div key={inst.id} className="p-3 bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border rounded-xl flex flex-col gap-2">
                           <div className="flex justify-between items-start">
                             <div>
                               <p className="text-xs font-black text-slate-800 dark:text-dk-text">{inst.matricule || `MAC-${inst.numero}`}</p>
                               <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest">{c?.classe || inst.classId}</p>
                             </div>
                             <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${inst.status === 'PANNE' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-100'}`}>{inst.status}</span>
                           </div>
                            <div className="pt-2 border-t border-slate-200 dark:border-dk-border/60 flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-dk-muted">
                              <span>{tx(lang,{fr:'Date prévue de remise:',ar:'تاريخ الإرجاع المتوقع:',en:'Expected return date:',es:'Fecha prevista de devolución:',pt:'Data prevista de devolução:',tr:'Beklenen iade tarihi:'})}</span>
                             <span className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text">{eta.toLocaleDateString('fr-FR')}</span>
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
             <div className="bg-white dark:bg-dk-surface rounded-[20px] border border-slate-100 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden flex flex-col h-[700px]">
                 <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                   <div>
                      <h3 className="font-black text-slate-800 dark:text-dk-text text-lg">{tx(lang,{fr:'Inventaire Magasin',ar:'جرد المخزن',en:'Warehouse Inventory',es:'Inventario de Almacén',pt:'Inventário do Armazém',tr:'Depo Envanteri'})}</h3>
                      <p className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mt-1">{unassignedInstances.length} {tx(lang,{fr:'machines disponibles',ar:'آلة متاحة',en:'machines available',es:'máquinas disponibles',pt:'máquinas disponíveis',tr:'makine mevcut'})}</p>
                   </div>
                   <button onClick={() => { setEditingInstance(null); setInstanceEditorOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> {tx(lang,{fr:'Ajouter',ar:'إضافة',en:'Add',es:'Añadir',pt:'Adicionar',tr:'Ekle'})}
                    </button>
                 </div>
                 
                 <div className="flex-1 overflow-auto bg-slate-50 dark:bg-dk-bg/30 p-6">
                   <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {unassignedInstances.map(inst => {
                        const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
                        return (
                          <div key={inst.id} onClick={() => { setEditingInstance(inst); setInstanceEditorOpen(true); }} className="bg-white dark:bg-dk-surface p-4 rounded-xl border border-slate-100 dark:border-dk-border shadow-sm dark:shadow-dk-sm flex flex-col gap-3 group/card hover:border-slate-200 transition-colors cursor-pointer">
                             <div className="flex items-start justify-between">
                               <div className="flex gap-2.5 items-center">
                                 {inst.machinePhotos && inst.machinePhotos.length > 0 ? (
                                   <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-100 dark:border-dk-border shrink-0">
                                     <img src={inst.machinePhotos[0]} className="w-full h-full object-cover" />
                                   </div>
                                 ) : null}
                                 <div>
                                    <div className="font-black text-slate-800 dark:text-dk-text text-sm leading-tight">{inst.matricule || tx(lang,{fr:`Machine N°`,ar:'آلة رقم',en:'Machine No.',es:'Máquina N°',pt:'Máquina N°',tr:'Makine No.'}) + inst.numero}</div>
                                    <div className="font-bold text-slate-400 dark:text-dk-muted text-[10px] uppercase tracking-widest mt-0.5">{inst.brand || tx(lang,{fr:'Marque N/A',ar:'العلامة التجارية N/A',en:'Brand N/A',es:'Marca N/A',pt:'Marca N/A',tr:'Marka N/A'})}</div>
                                 </div>
                               </div>
                               <div className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${
                                 inst.status === 'OK' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' :
                                 inst.status === 'PANNE' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-100'
                               }`}>
                                 {inst.status || 'OK'}
                               </div>
                             </div>
                             <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                               <div className="flex items-center gap-2 overflow-hidden">
                                 <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft text-[10px] font-bold tracking-tight">
                                   {c?.classe || inst.classId}
                                 </span>
                                  <span className="text-[10px] text-slate-400 dark:text-dk-muted truncate max-w-[100px]">{c?.name || tx(lang,{fr:'Inconnu',ar:'غير معروف',en:'Unknown',es:'Desconocido',pt:'Desconhecido',tr:'Bilinmiyor'})}</span>
                               </div>
                               <div className="flex items-center gap-2">
                                 {inst.machineManuals && inst.machineManuals.length > 0 && (
                                   <a 
                                     href={inst.machineManuals[0].dataUrl} 
                                     download={inst.machineManuals[0].name}
                                     onClick={e => e.stopPropagation()}
                                     className="p-1 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded text-slate-400 hover:text-indigo-600 dark:text-dk-accent-text hover:border-indigo-200 transition-colors"
                                      title={tx(lang,{fr:'Télécharger',ar:'تنزيل',en:'Download',es:'Descargar',pt:'Descarregar',tr:'İndir'}) + ` ${inst.machineManuals[0].name}`}
                                   >
                                     <Layers className="w-3 h-3" />
                                   </a>
                                 )}
                                 <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover/card:opacity-100 transition-opacity text-slate-400 dark:text-dk-muted" />
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
    if (activeModel && !activeModel.meta_data.reference?.trim() && activeModel.meta_data.nom_modele?.trim()) {
      activeModel.meta_data.reference = activeModel.meta_data.nom_modele;
    }
    
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
            <div className="bg-white dark:bg-dk-surface rounded-[20px] border border-slate-100 dark:border-dk-border shadow-sm dark:shadow-dk-sm p-6">
               <h2 className="text-2xl font-black text-slate-900 dark:text-dk-text tracking-tight mb-1">{chain.name}</h2>
                {activeData ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-md text-[10px] font-black uppercase tracking-widest border border-emerald-100 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {tx(lang,{fr:'En Production',ar:'قيد الإنتاج',en:'In Production',es:'En Producción',pt:'Em Produção',tr:'Üretimde'})}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted rounded-md text-[10px] font-black uppercase tracking-widest border border-slate-200 dark:border-dk-border">
                    {tx(lang,{fr:'En Attente',ar:'قيد الانتظار',en:'Pending',es:'En Espera',pt:'Em Espera',tr:'Beklemede'})}
                  </span>
                )}

               <div className="mt-8 grid gap-3">
                 <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border">
                   <div>
                      <label className="block text-[9px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-0.5">{tx(lang,{fr:'Chef de Chaîne',ar:'رئيس الخط',en:'Line Manager',es:'Jefe de Línea',pt:'Chefe de Linha',tr:'Hat Yöneticisi'})}</label>
                      <div className="font-bold text-slate-800 dark:text-dk-text text-sm">{activeData?.superviseur || tx(lang,{fr:'Non assigné',ar:'غير معين',en:'Not assigned',es:'No asignado',pt:'Não atribuído',tr:'Atanmamış'})}</div>
                   </div>
                   <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text flex items-center justify-center text-sm shadow-sm dark:shadow-dk-sm">👨‍💼</div>
                 </div>
                 <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border">
                   <div>
                      <label className="block text-[9px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-0.5">{tx(lang,{fr:'Chef Mécanicien',ar:'رئيس الميكانيكيين',en:'Head Mechanic',es:'Jefe Mecánico',pt:'Chefe Mecânico',tr:'Baş Tamirci'})}</label>
                      <div className="font-bold text-slate-800 dark:text-dk-text text-sm">{tx(lang,{fr:'Non assigné',ar:'غير معين',en:'Not assigned',es:'No asignado',pt:'Não atribuído',tr:'Atanmamış'})}</div>
                   </div>
                   <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-sm shadow-sm dark:shadow-dk-sm">🔧</div>
                 </div>
               </div>
            </div>

            {/* Current Model Info */}
            {activeModel && (
              <div 
                onClick={() => setViewingModelId(activeModel.id)}
                className="bg-white dark:bg-dk-surface rounded-3xl p-6 shadow-sm dark:shadow-dk-sm border border-slate-100 dark:border-dk-border/80 cursor-pointer hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 relative overflow-hidden"
              >
                <div className="absolute -right-16 -top-16 w-48 h-48 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/50 rounded-full blur-3xl opacity-50 pointer-events-none" />

                {/* Header */}
                <div className="flex items-center justify-between mb-6 relative z-10">
                   <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 flex items-center justify-center">
                         <Component className="w-4 h-4 text-indigo-500" />
                      </div>
                       <span className="font-bold text-slate-800 dark:text-dk-text text-sm">{tx(lang,{fr:'Dossier Technique',ar:'الملف التقني',en:'Technical File',es:'Expediente Técnico',pt:'Dossier Técnico',tr:'Teknik Dosya'})}</span>
                   </div>
                    <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-widest">
                      {tx(lang,{fr:'En Cours',ar:'قيد التنفيذ',en:'In Progress',es:'En Curso',pt:'Em Curso',tr:'Devam Ediyor'})}
                    </span>
                </div>

                {/* Main Identity */}
                <div className="flex gap-5 items-center mb-8 relative z-10">
                   {activeModel.image ? (
                     <div className="w-24 h-24 rounded-[20px] overflow-hidden shadow-sm dark:shadow-dk-sm border border-slate-100 dark:border-dk-border shrink-0">
                       <img src={activeModel.image} className="w-full h-full object-cover" />
                     </div>
                   ) : (
                     <div className="w-24 h-24 rounded-[20px] bg-slate-50 dark:bg-dk-bg flex items-center justify-center text-slate-300 dark:text-dk-muted border border-slate-100 dark:border-dk-border shrink-0">
                        <Component className="w-8 h-8" />
                     </div>
                   )}
                   <div>
                     <span className="inline-block mb-2 px-2.5 py-0.5 bg-slate-50 dark:bg-dk-bg text-slate-600 dark:text-dk-text-soft text-[10px] font-bold uppercase tracking-widest rounded-md border border-slate-100 dark:border-dk-border/50">
                        {activeModel.ficheData?.client || activeData.clientName || tx(lang,{fr:'Client N/A',ar:'العميل N/A',en:'Client N/A',es:'Cliente N/A',pt:'Cliente N/A',tr:'Müşteri N/A'})}
                     </span>
                     <h2 className="text-[22px] font-black text-slate-800 dark:text-dk-text tracking-tight leading-none mb-1.5">
                       {activeModel.meta_data.nom_modele}
                     </h2>
                     <p className="text-slate-500 dark:text-dk-muted font-medium text-sm">
                        {tx(lang,{fr:'Réf:',ar:'المرجع:',en:'Ref:',es:'Ref:',pt:'Ref:',tr:'Ref:'})} <span className="text-slate-700 dark:text-dk-text-soft">{activeModel.meta_data.reference || 'N/A'}</span> • {activeModel.meta_data.category || activeModel.ficheData?.category || tx(lang,{fr:'Catégorie non définie',ar:'فئة غير محددة',en:'Undefined category',es:'Categoría no definida',pt:'Categoria não definida',tr:'Tanımlanmamış kategori'})}
                     </p>
                   </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3 relative z-10">
                   <div className="bg-slate-50 dark:bg-dk-bg/80 rounded-2xl p-4 border border-slate-100 dark:border-dk-border/50">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-1 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" /> {tx(lang,{fr:'Lancement',ar:'الإطلاق',en:'Launch',es:'Lanzamiento',pt:'Lançamento',tr:'Başlatma'})}
                      </p>
                      <p className="text-sm font-bold text-slate-800 dark:text-dk-text">{(activeData.startDate || '').split('T')[0]}</p>
                   </div>
                   <div className="bg-slate-50 dark:bg-dk-bg/80 rounded-2xl p-4 border border-slate-100 dark:border-dk-border/50">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-1 flex items-center gap-1.5">
                          <Layers className="w-3 h-3" /> {tx(lang,{fr:'Avancement',ar:'التقدم',en:'Progress',es:'Avance',pt:'Progresso',tr:'İlerleme'})}
                      </p>
                      <p className="text-sm font-bold text-slate-800 dark:text-dk-text">
                         <span className="text-emerald-600 dark:text-emerald-400">{activeData.qteProduite || 0}</span> <span className="text-slate-400 dark:text-dk-muted font-medium mx-0.5">/</span> {activeData.qteTotal || activeModel.meta_data.quantity || 0} pces
                      </p>
                   </div>
                </div>
              </div>
            )}

            {/* Next Model Preview */}
            {nextModel && (
              <div className="bg-white dark:bg-dk-surface rounded-3xl p-5 shadow-sm dark:shadow-dk-sm border border-slate-100 dark:border-dk-border/80 flex flex-col gap-4 relative overflow-hidden group hover:border-slate-200 transition-all">
                 <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-dk-muted flex items-center gap-1.5">
                       <ArrowUpRight className="w-3 h-3 text-slate-300 dark:text-dk-muted" /> {tx(lang,{fr:'Prévisionnel',ar:'التوقعي',en:'Forecast',es:'Previsional',pt:'Previsional',tr:'Tahmini'})}
                    </span>
                 </div>
                 <div className="flex gap-4 items-center">
                    {nextModel.image ? (
                      <div className="w-14 h-14 rounded-[14px] overflow-hidden shrink-0 shadow-sm dark:shadow-dk-sm border border-slate-100 dark:border-dk-border">
                        <img src={nextModel.image} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-[14px] bg-slate-50 dark:bg-dk-bg flex items-center justify-center text-slate-300 dark:text-dk-muted border border-slate-100 dark:border-dk-border shrink-0">
                         <Component className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <span className="inline-block mb-1 px-2 py-0.5 bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted text-[9px] font-bold uppercase tracking-widest rounded-md border border-slate-100 dark:border-dk-border/50">
                        {nextModel.ficheData?.client || tx(lang,{fr:'Client N/A',ar:'العميل N/A',en:'Client N/A',es:'Cliente N/A',pt:'Cliente N/A',tr:'Müşteri N/A'})}
                      </span>
                      <h3 className="font-bold text-slate-800 dark:text-dk-text text-sm leading-tight">{nextModel.meta_data.nom_modele}</h3>
                    </div>
                 </div>
              </div>
            )}
          </div>

          {/* Right Column: Machines in this Chain */}
          <div className="xl:col-span-2 space-y-6">
            
            {/* TOTAL MATERIEL SUMMARY */}
            <div className="bg-white dark:bg-dk-surface rounded-[20px] border border-slate-100 dark:border-dk-border shadow-sm dark:shadow-dk-sm p-6">
              <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-slate-800 dark:text-dk-text text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" /> {tx(lang,{fr:'Total Matériel de la chaîne',ar:'إجمالي معدات الخط',en:'Total Chain Equipment',es:'Total Equipo de la línea',pt:'Total Equipamento da linha',tr:'Toplam Hat Ekipmanı'})}</h3>
                 <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text">{chainInstances.length}</span>
              </div>
              {chainInstances.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-dk-muted font-bold">{tx(lang,{fr:'Aucune machine assignée',ar:'لا توجد آلة معينة',en:'No machine assigned',es:'Ninguna máquina asignada',pt:'Nenhuma máquina atribuída',tr:'Makine atanmamış'})}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {Object.entries(chainInstances.reduce((acc, inst) => {
                    const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
                    const name = c?.classe || inst.classId;
                    acc[name] = (acc[name] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)).map(([name, count]) => (
                    <div key={name} className="flex justify-between items-center bg-slate-50 dark:bg-dk-bg p-3 rounded-xl border border-slate-100 dark:border-dk-border">
                      <span className="text-xs font-bold text-slate-700 dark:text-dk-text-soft">{name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[11px] font-black text-slate-800 dark:text-dk-text shadow-sm dark:shadow-dk-sm">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-dk-surface rounded-[20px] border border-slate-100 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden flex flex-col h-[700px]">
               <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                 <div>
                    <h3 className="font-black text-slate-800 dark:text-dk-text text-lg">{tx(lang,{fr:'Parc Machine Local',ar:'أسطول الآلات المحلي',en:'Local Machine Fleet',es:'Parque de Máquinas Local',pt:'Parque de Máquinas Local',tr:'Yerel Makine Filosu'})}</h3>
                    <p className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mt-1">{chainInstances.length} {tx(lang,{fr:'machines assignées',ar:'آلة معينة',en:'machines assigned',es:'máquinas asignadas',pt:'máquinas atribuídas',tr:'makine atandı'})}</p>
                 </div>
                 <button onClick={() => { setEditingInstance(null); setInstanceEditorOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> {tx(lang,{fr:'Assigner',ar:'تعيين',en:'Assign',es:'Asignar',pt:'Atribuir',tr:'Ata'})}
                 </button>
               </div>
               
               <div className="flex-1 overflow-auto bg-slate-50 dark:bg-dk-bg/30 p-6 min-h-[300px]">
                 {chainInstances.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-12">
                      <Database className="w-8 h-8 text-slate-200 mb-3" />
                      <p className="text-sm font-bold text-slate-400 dark:text-dk-muted">{tx(lang,{fr:"Aucune machine n'est assignée à cette chaîne.",ar:'لا توجد آلة معينة لهذا الخط.',en:'No machine is assigned to this chain.',es:'Ninguna máquina está asignada a esta línea.',pt:'Nenhuma máquina está atribuída a esta linha.',tr:'Bu hatta makine atanmamış.'})}</p>
                      <p className="text-xs text-slate-400 dark:text-dk-muted mt-1">{tx(lang,{fr:'Utilisez le bouton ci-dessus pour assigner des machines.',ar:'استخدم الزر أعلاه لتعيين الآلات.',en:'Use the button above to assign machines.',es:'Use el botón de arriba para asignar máquinas.',pt:'Use o botão acima para atribuir máquinas.',tr:'Makine atamak için yukarıdaki düğmeyi kullanın.'})}</p>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {chainInstances.map(inst => {
                        const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
                        return (
                          <div key={inst.id} className="bg-white dark:bg-dk-surface p-4 rounded-xl border border-slate-100 dark:border-dk-border shadow-sm dark:shadow-dk-sm flex flex-col gap-3 group/card hover:border-slate-200 transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="flex gap-2.5 items-center">
                                 {inst.machinePhotos && inst.machinePhotos.length > 0 ? (
                                   <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-100 dark:border-dk-border shrink-0">
                                     <img src={inst.machinePhotos[0]} className="w-full h-full object-cover" />
                                   </div>
                                 ) : null}
                                <div>
                                  <div className="font-black text-slate-800 dark:text-dk-text text-sm leading-tight">{inst.matricule || tx(lang,{fr:'Machine N°',ar:'آلة رقم',en:'Machine No.',es:'Máquina N°',pt:'Máquina N°',tr:'Makine No.'}) + inst.numero}</div>
                                    <div className="font-bold text-slate-400 dark:text-dk-muted text-[10px] uppercase tracking-widest mt-0.5">{inst.brand || tx(lang,{fr:'Marque N/A',ar:'العلامة التجارية N/A',en:'Brand N/A',es:'Marca N/A',pt:'Marca N/A',tr:'Marka N/A'})}</div>
                                </div>
                              </div>
                              <div className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${
                                inst.status === 'OK' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' :
                                inst.status === 'PANNE' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-100'
                              }`}>
                                {inst.status || 'OK'}
                              </div>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft text-[10px] font-bold tracking-tight">
                                  {c?.classe || inst.classId}
                                </span>
                                  <span className="text-[10px] text-slate-400 dark:text-dk-muted truncate max-w-[100px]">{c?.name || tx(lang,{fr:'Inconnu',ar:'غير معروف',en:'Unknown',es:'Desconocido',pt:'Desconhecido',tr:'Bilinmiyor'})}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {inst.machineManuals && inst.machineManuals.length > 0 && (
                                  <a 
                                    href={inst.machineManuals[0].dataUrl} 
                                    download={inst.machineManuals[0].name}
                                    onClick={e => e.stopPropagation()}
                                    className="p-1 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded text-slate-400 hover:text-indigo-600 dark:text-dk-accent-text hover:border-indigo-200 transition-colors"
                                      title={tx(lang,{fr:'Télécharger',ar:'تنزيل',en:'Download',es:'Descargar',pt:'Descarregar',tr:'İndir'}) + ` ${inst.machineManuals[0].name}`}
                                  >
                                    <Layers className="w-3 h-3" />
                                  </a>
                                )}
                                 <button onClick={() => { setEditingInstance(inst); setInstanceEditorOpen(true); }} className="opacity-0 group-hover/card:opacity-100 transition-opacity text-slate-400 hover:text-indigo-600 dark:text-dk-accent-text">
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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800 text-[9px] font-black uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" /> {tx(lang,{fr:'Panne',ar:'عطل',en:'Breakdown',es:'Avería',pt:'Avaria',tr:'Arıza'})}
        </span>
      );
      if (s === 'MAINT') return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-100 text-[9px] font-black uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /> {tx(lang,{fr:'Maint.',ar:'صيانة',en:'Maint.',es:'Mant.',pt:'Manut.',tr:'Bakım'})}
        </span>
      );
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 border border-emerald-100 dark:border-emerald-800 text-[9px] font-black uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> {tx(lang,{fr:'OK',ar:'جيد',en:'OK',es:'OK',pt:'OK',tr:'Tam'})}
        </span>
      );
    };

    return (
      <div className="bg-white dark:bg-dk-surface rounded-[24px] border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-dk-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-400">

        {/* ── Table header */}
        <div className="grid items-center px-5 py-3 bg-slate-50 dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border"
          style={{ gridTemplateColumns: '2fr 3fr 1fr 1fr 1.5fr' }}>
          {[tx(lang,{fr:'Réf / Matricule',ar:'المرجع / الرقم التسلسلي',en:'Ref / Serial No.',es:'Ref / Matrícula',pt:'Ref / Matrícula',tr:'Ref / Seri No.'}), tx(lang,{fr:'Classe & Type',ar:'الفئة والنوع',en:'Class & Type',es:'Clase y Tipo',pt:'Classe e Tipo',tr:'Sınıf ve Tip'}), tx(lang,{fr:'Marque',ar:'العلامة التجارية',en:'Brand',es:'Marca',pt:'Marca',tr:'Marka'}), tx(lang,{fr:'Statut',ar:'الحالة',en:'Status',es:'Estado',pt:'Estado',tr:'Durum'}), tx(lang,{fr:'Affectation',ar:'التعيين',en:'Assignment',es:'Asignación',pt:'Atribuição',tr:'Atama'})].map(h => (
            <span key={h} className="text-[9px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest">{h}</span>
          ))}
        </div>

        {/* ── Rows */}
        <div className="divide-y divide-slate-50 dark:divide-dk-border">
          {inventoryRows.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border flex items-center justify-center">
                <Database className="w-5 h-5 text-slate-300 dark:text-dk-muted" />
              </div>
              <p className="text-sm font-bold text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Aucune machine dans le parc.',ar:'لا توجد آلة في الأسطول.',en:'No machines in the fleet.',es:'No hay máquinas en el parque.',pt:'Nenhuma máquina no parque.',tr:'Filotoda makine yok.'})}</p>
            </div>
          )}

          {inventoryRows.map((inst, idx) => {
            const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
            return (
              <div
                key={inst.id}
                onClick={() => { setEditingInstance(inst); setInstanceEditorOpen(true); }}
                className="grid items-center px-5 py-3.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 dark:bg-dk-accent/20/30 active:bg-indigo-50 dark:bg-dk-accent/20/60 cursor-pointer transition-colors group"
                style={{ gridTemplateColumns: '2fr 3fr 1fr 1fr 1.5fr' }}
              >
                {/* Matricule & Photo */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border flex items-center justify-center shrink-0 overflow-hidden">
                    {inst.machinePhotos && inst.machinePhotos.length > 0 ? (
                      <img src={inst.machinePhotos[0]} className="w-full h-full object-cover" alt={inst.matricule} />
                    ) : (
                      <Component className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                    )}
                  </div>
                  <div>
                    <p className="text-[12px] font-black text-slate-900 leading-none group-hover:text-indigo-700 dark:text-dk-accent-text transition-colors">
                      {inst.matricule || `MAC-${inst.numero}`}
                    </p>
                    <p className="text-[9px] text-slate-400 dark:text-dk-muted font-semibold mt-0.5 font-mono">
                      #{String(idx + 1).padStart(3, '0')}
                    </p>
                  </div>
                </div>

                {/* Classe */}
                <div className="flex items-center gap-2 min-w-0">
                  {c ? (
                    <>
                      <span className="shrink-0 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft text-[10px] font-black tracking-tight">
                        {c.classe}
                      </span>
                      <span className="text-[11px] text-slate-600 dark:text-dk-text-soft font-semibold truncate">{c.name}</span>
                      {c.machineCategory && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-500 text-[8px] font-bold uppercase tracking-wide hidden lg:inline">
                          {c.machineCategory}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-900/30 text-rose-500 dark:text-rose-400 border border-rose-100 dark:border-rose-800 text-[10px] font-bold">
                      {tx(lang,{fr:'Inconnu',ar:'غير معروف',en:'Unknown',es:'Desconocido',pt:'Desconhecido',tr:'Bilinmiyor'})} — {inst.classId}
                    </span>
                  )}
                </div>

                {/* Marque */}
                <div className="text-[11px] font-semibold text-slate-500 dark:text-dk-muted truncate">
                  {inst.brand || <span className="text-slate-300 dark:text-dk-muted">—</span>}
                </div>

                {/* Statut */}
                <div>{statusBadge(inst.status)}</div>

                {/* Affectation & Download */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold truncate ${inst.chainId ? 'text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text' : 'text-slate-400 dark:text-dk-muted'}`}>
                      {inst.chainId || tx(lang,{fr:'Magasin libre',ar:'مخزن حر',en:'Free warehouse',es:'Almacén libre',pt:'Armazém livre',tr:'Serbest depo'})}
                    </span>
                    {inst.machineManuals && inst.machineManuals.length > 0 && (
                      <a 
                        href={inst.machineManuals[0].dataUrl} 
                        download={inst.machineManuals[0].name}
                        onClick={e => e.stopPropagation()}
                        className="p-1 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded text-slate-400 hover:text-indigo-600 dark:text-dk-accent-text hover:border-indigo-200 transition-colors"
                        title={tx(lang,{fr:'Télécharger',ar:'تنزيل',en:'Download',es:'Descargar',pt:'Descarregar',tr:'İndir'}) + ` ${inst.machineManuals[0].name}`}
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
          <div className="px-5 py-3 border-t border-slate-50 bg-slate-50 dark:bg-dk-bg/50 flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest">
              {inventoryRows.length} {tx(lang,{fr:'machine(s) au total',ar:'آلة (آلات) إجمالاً',en:'machine(s) total',es:'máquina(s) en total',pt:'máquina(s) no total',tr:'toplam makine'})}
            </span>
            <span className="text-[9px] font-bold text-slate-300 dark:text-dk-muted">
              {inventoryRows.filter(i => i.status === 'OK' || !i.status).length} {tx(lang,{fr:'opérationnelles',ar:'شغالة',en:'operational',es:'operativas',pt:'operacionais',tr:'çalışır'})} ·{' '}
              {inventoryRows.filter(i => i.status === 'PANNE').length} {tx(lang,{fr:'en panne',ar:'معطلة',en:'broken down',es:'averiadas',pt:'avariadas',tr:'arızalı'})} ·{' '}
              {inventoryRows.filter(i => i.status === 'MAINT').length} {tx(lang,{fr:'en maintenance',ar:'قيد الصيانة',en:'under maintenance',es:'en mantenimiento',pt:'em manutenção',tr:'bakımda'})}
            </span>
          </div>
        )}
      </div>
    );
  };


  const renderMaintenance = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      <div className="bg-white dark:bg-dk-surface rounded-[20px] border border-slate-100 dark:border-dk-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-dk-bg/50 text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest border-b border-slate-100 dark:border-dk-border">
              <tr>
                <th className="py-4 px-6">{tx(lang,{fr:'Réf / Matricule',ar:'المرجع / الرقم التسلسلي',en:'Ref / Serial No.',es:'Ref / Matrícula',pt:'Ref / Matrícula',tr:'Ref / Seri No.'})}</th>
                <th className="py-4 px-6">{tx(lang,{fr:'Classe',ar:'الفئة',en:'Class',es:'Clase',pt:'Classe',tr:'Sınıf'})}</th>
                <th className="py-4 px-6">{tx(lang,{fr:'Intervention',ar:'التدخل',en:'Intervention',es:'Intervención',pt:'Intervenção',tr:'Müdahale'})}</th>
                <th className="py-4 px-6 text-right">{tx(lang,{fr:'Action Rapide',ar:'إجراء سريع',en:'Quick Action',es:'Acción Rápida',pt:'Ação Rápida',tr:'Hızlı İşlem'})}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-dk-border">
              {maintenanceIssueRows.length === 0 ? (
                <tr><td colSpan={4} className="py-12 text-center text-slate-400 dark:text-dk-muted font-bold text-xs">{tx(lang,{fr:'Aucune intervention requise. Le parc est opérationnel.',ar:'لا يوجد تدخل مطلوب. الأسطول جاهز للتشغيل.',en:'No intervention required. The fleet is operational.',es:'No se requiere intervención. El parque está operativo.',pt:'Nenhuma intervenção necessária. O parque está operacional.',tr:'Müdahale gerekmiyor. Filo çalışır durumda.'})}</td></tr>
              ) : (
                maintenanceIssueRows.map(inst => {
                  const c = machines.find(m => m.id === inst.classId || m.classe === inst.classId);
                  return (
                  <tr key={inst.id} className="hover:bg-slate-50/50 dark:hover:bg-dk-elevated/60 transition-colors">
                    <td className="py-3 px-6">
                      <div className="font-black text-slate-800 dark:text-dk-text text-[13px]">{inst.matricule || tx(lang,{fr:'N°',ar:'رقم',en:'No.',es:'N°',pt:'N°',tr:'No.'}) + inst.numero}</div>
                      <div className="font-bold text-slate-400 dark:text-dk-muted text-[10px] mt-0.5 uppercase tracking-widest">{inst.brand || tx(lang,{fr:'Marque N/A',ar:'العلامة التجارية N/A',en:'Brand N/A',es:'Marca N/A',pt:'Marca N/A',tr:'Marka N/A'})}</div>
                    </td>
                    <td className="py-3 px-6 font-bold text-slate-600 dark:text-dk-text-soft text-xs">{c ? c.classe : inst.classId}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest shadow-sm dark:shadow-dk-sm border ${inst.status === 'PANNE' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-100'}`}>
                        {inst.status === 'PANNE' ? <AlertCircle className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                        {inst.status === 'PANNE' ? tx(lang,{fr:'Panne (Arrêt)',ar:'عطل (توقف)',en:'Breakdown (Stop)',es:'Avería (Parada)',pt:'Avaria (Paragem)',tr:'Arıza (Duruş)'}) : tx(lang,{fr:'Maintenance',ar:'صيانة',en:'Maintenance',es:'Mantenimiento',pt:'Manutenção',tr:'Bakım'})}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                       <button onClick={() => onSaveMachineInstance?.({ ...inst, status: 'OK' }, { created: false })} className="text-[10px] font-black tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 border border-emerald-100 dark:border-emerald-800 px-3 py-1.5 rounded-lg uppercase transition-colors">
                          {tx(lang,{fr:'Marquer Résolu',ar:'تحديد كحل',en:'Mark Resolved',es:'Marcar Resuelto',pt:'Marcar Resolvido',tr:'Çözüldü Olarak İşaretle'})}
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
    <div className="bg-white dark:bg-dk-surface rounded-[20px] border border-slate-100 dark:border-dk-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.03)] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 dark:bg-dk-bg/50 text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest border-b border-slate-100 dark:border-dk-border">
            <tr>
              <th className="py-4 px-6">{tx(lang,{fr:'Date & Heure',ar:'التاريخ والوقت',en:'Date & Time',es:'Fecha y Hora',pt:'Data e Hora',tr:'Tarih ve Saat'})}</th>
              <th className="py-4 px-6">{tx(lang,{fr:'Action',ar:'الإجراء',en:'Action',es:'Acción',pt:'Ação',tr:'İşlem'})}</th>
              <th className="py-4 px-6">{tx(lang,{fr:'Détail Machine',ar:'تفاصيل الآلة',en:'Machine Detail',es:'Detalle de Máquina',pt:'Detalhe da Máquina',tr:'Makine Detayı'})}</th>
              <th className="py-4 px-6">{tx(lang,{fr:'Opérateur',ar:'المشغل',en:'Operator',es:'Operador',pt:'Operador',tr:'Operatör'})}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-dk-border">
            {historyRows.length === 0 ? (
               <tr><td colSpan={4} className="py-12 text-center text-slate-400 dark:text-dk-muted font-bold text-xs">{tx(lang,{fr:'Aucun historique disponible.',ar:'لا يوجد سجل متاح.',en:'No history available.',es:'No hay historial disponible.',pt:'Nenhum histórico disponível.',tr:'Geçmiş mevcut değil.'})}</td></tr>
            ) : (
              historyRows.map(h => (
                <tr key={h.id} className="hover:bg-slate-50/50 dark:hover:bg-dk-elevated/60 transition-colors">
                  <td className="py-3 px-6">
                     <div className="font-bold text-slate-800 dark:text-dk-text text-[13px]">{new Date(h.at).toLocaleDateString('fr-FR')}</div>
                     <div className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{new Date(h.at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</div>
                  </td>
                  <td className="py-3 px-6">
                    {h.kind === 'ADD' ? <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-emerald-100 dark:border-emerald-800">{tx(lang,{fr:'Entrée',ar:'إدخال',en:'Entry',es:'Entrada',pt:'Entrada',tr:'Giriş'})}</span> :
                     h.kind === 'SELL' ? <span className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-amber-100">{tx(lang,{fr:'Vente',ar:'بيع',en:'Sale',es:'Venta',pt:'Venda',tr:'Satış'})}</span> :
                     <span className="text-slate-600 dark:text-dk-text-soft bg-slate-100 dark:bg-dk-elevated px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-slate-200 dark:border-dk-border">{tx(lang,{fr:'Sortie',ar:'إخراج',en:'Exit',es:'Salida',pt:'Saída',tr:'Çıkış'})}</span>}
                  </td>
                  <td className="py-3 px-6">
                     <div className="font-black text-slate-800 dark:text-dk-text text-[13px]">{h.machineSnapshot.name}</div>
                     <div className="font-bold text-slate-400 dark:text-dk-muted text-[10px] mt-0.5 uppercase tracking-widest">{tx(lang,{fr:'Classe:',ar:'الفئة:',en:'Class:',es:'Clase:',pt:'Classe:',tr:'Sınıf:'})} {h.machineSnapshot.classe}</div>
                  </td>
                  <td className="py-3 px-6 font-bold text-slate-500 dark:text-dk-muted text-xs">{h.actorName || tx(lang,{fr:'Système',ar:'النظام',en:'System',es:'Sistema',pt:'Sistema',tr:'Sistem'})}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-dk-bg dark:via-dk-surface dark:to-dk-bg text-slate-900 dark:text-dk-text pb-32 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
      {/* ULTRA COMPACT SAAS HEADER & TOOLBAR */}
      <div className="bg-gradient-to-b from-white/90 to-white/70 backdrop-blur-2xl border-b border-slate-200 dark:border-dk-border/40 sticky top-0 z-30 shadow-[0_4px_30px_-10px_rgba(0,0,0,0.08)] transition-all">
        <div className="max-w-[1600px] mx-auto px-3 md:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between gap-3 md:gap-4">
          
          <div className="flex items-center gap-3 md:gap-5">
            <div className="flex items-center gap-2.5 md:gap-3">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-[10px] bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg dark:shadow-dk-lg shadow-indigo-500/25 shrink-0 border border-white/20">
                 <Component className="w-4 h-4 md:w-4.5 md:h-4.5 text-white" strokeWidth={2.5} />
              </div>
              <h1 className="text-base md:text-lg font-black text-slate-900 dark:text-dk-text tracking-tight hidden sm:block drop-shadow-sm">{tx(lang,{fr:'Inventaire',ar:'الجرد',en:'Inventory',es:'Inventario',pt:'Inventário',tr:'Envanter'})}</h1>
            </div>

            <div className="h-5 w-px bg-slate-200/60 hidden md:block" />

            <div className="hidden lg:flex items-center gap-2 text-[9px] font-black tracking-widest uppercase">
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-dk-bg/80 border border-slate-100 dark:border-dk-border text-slate-500 dark:text-dk-muted shadow-sm dark:shadow-dk-sm">
                  {tx(lang,{fr:'TOTAL',ar:'الإجمالي',en:'TOTAL',es:'TOTAL',pt:'TOTAL',tr:'TOPLAM'})} <span className="text-slate-800 dark:text-dk-text ml-0.5 text-[10px]">{fleetStats.total}</span>
                </span>
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30/80 border border-emerald-100/50 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400 shadow-sm dark:shadow-dk-sm">
                  {tx(lang,{fr:'PRÊTES',ar:'جاهزة',en:'READY',es:'LISTAS',pt:'PRONTAS',tr:'HAZIR'})} <span className="text-emerald-700 ml-0.5 text-[10px]">{fleetStats.ok}</span>
                </span>
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-900/30/80 border border-rose-100/50 dark:border-rose-800/50 text-rose-600 dark:text-rose-400 shadow-sm dark:shadow-dk-sm">
                  {tx(lang,{fr:'PANNE',ar:'عطل',en:'BREAKDOWN',es:'AVERÍA',pt:'AVARIA',tr:'ARIZA'})} <span className="text-rose-700 ml-0.5 text-[10px]">{fleetStats.panne}</span>
                </span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-1 justify-end">
            
            {(selectedChainId || viewingModelId) && (
               <button 
                 onClick={() => viewingModelId ? setViewingModelId(null) : setSelectedChainId(null)} 
                 className="flex items-center gap-1 mr-auto px-2.5 md:px-3 py-1.5 bg-white dark:bg-dk-surface text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 rounded-lg text-[10px] md:text-[11px] font-black uppercase tracking-widest transition-all border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm hover:shadow-md"
               >
                  <ArrowLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{tx(lang,{fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}</span>
               </button>
            )}

            <>
              <div className="flex items-center gap-0.5 bg-slate-100/60 p-0.5 rounded-[10px] border border-slate-200 dark:border-dk-border/40 overflow-x-auto hide-scrollbar shrink-0 shadow-inner">
                  {[
                    { id: 'OVERVIEW', label: tx(lang,{fr:'Vue Globale',ar:'نظرة عامة',en:'Overview',es:'Vista General',pt:'Visão Geral',tr:'Genel Bakış'}) },
                    { id: 'INVENTORY', label: tx(lang,{fr:'Inventaire',ar:'الجرد',en:'Inventory',es:'Inventario',pt:'Inventário',tr:'Envanter'}) },
                    { id: 'MAINTENANCE', label: tx(lang,{fr:'Maintenance',ar:'الصيانة',en:'Maintenance',es:'Mantenimiento',pt:'Manutenção',tr:'Bakım'}) },
                    { id: 'HISTORY', label: tx(lang,{fr:'Historique',ar:'السجل',en:'History',es:'Historial',pt:'Histórico',tr:'Geçmiş'}) },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id as TabType); setSelectedChainId(null); setViewingModelId(null); }}
                      className={`px-2.5 md:px-3.5 py-1.5 rounded-md text-[9px] md:text-[11px] font-black transition-all whitespace-nowrap uppercase tracking-wider ${
                        activeTab === tab.id 
                          ? 'bg-white dark:bg-dk-surface text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text shadow-md shadow-indigo-500/10 border border-slate-200 dark:border-dk-border/60' 
                          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/40'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="h-5 w-px bg-slate-200/50 hidden xl:block mx-1" />

                <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                   <div className="relative hidden xl:block w-48 md:w-56 group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400 dark:text-dk-muted group-focus-within:text-indigo-500 transition-colors" />
                      <input 
                        type="text" 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder={tx(lang,{fr:'Filtrer...',ar:'تصفية...',en:'Filter...',es:'Filtrar...',pt:'Filtrar...',tr:'Filtrele...'})} 
                        className="w-full bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border/60 rounded-lg py-1.5 md:py-2 pl-8 md:pl-9 pr-3 text-xs font-bold text-slate-800 dark:text-dk-text placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all shadow-sm dark:shadow-dk-sm"
                      />
                   </div>
                   
                   <button onClick={() => setScanOpen(true)} title={tx(lang,{fr:'Scanner une machine',ar:'مسح آلة',en:'Scan a machine',es:'Escanear una máquina',pt:'Escanear uma máquina',tr:'Makine tara'})} className="flex items-center justify-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text text-[10px] md:text-[11px] font-black rounded-lg border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm hover:border-indigo-300 hover:text-indigo-600 dark:text-dk-accent-text hover:-translate-y-0.5 transition-all tracking-widest uppercase">
                     <ScanLine className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden sm:inline">{tx(lang,{fr:'Scanner',ar:'مسح',en:'Scan',es:'Escanear',pt:'Escanear',tr:'Tara'})}</span>
                   </button>

                   <button onClick={() => { setExitModalInitialId(null); setExitModalOpen(true); }} title={tx(lang,{fr:'Sortie / Réforme machine',ar:'إخراج / تصفية آلة',en:'Machine exit / disposal',es:'Salida / baja de máquina',pt:'Saída / abate de máquina',tr:'Makine çıkışı / hurda'})} className="flex items-center justify-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text text-[10px] md:text-[11px] font-black rounded-lg border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm hover:border-rose-300 hover:text-rose-600 hover:-translate-y-0.5 transition-all tracking-widest uppercase">
                     <LogOut className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden sm:inline">{tx(lang,{fr:'Sortie',ar:'إخراج',en:'Exit',es:'Salida',pt:'Saída',tr:'Çıkış'})}</span>
                   </button>

                   <button onClick={() => { setEditingInstance(null); setInstanceEditorOpen(true); }} className="flex items-center justify-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 bg-slate-900 dark:bg-indigo-600 text-white text-[10px] md:text-[11px] font-black rounded-lg shadow-sm dark:shadow-dk-sm hover:bg-slate-800 dark:hover:bg-indigo-500 hover:-translate-y-0.5 transition-all tracking-widest uppercase">
                     <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden sm:inline">{tx(lang,{fr:'Ajouter',ar:'إضافة',en:'Add',es:'Añadir',pt:'Adicionar',tr:'Ekle'})}</span>
                   </button>
                </div>
              </>
          </div>

        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-3 md:px-6 lg:px-8 mt-4 md:mt-6 lg:mt-8">
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

      <MachineQuickScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        machineInstances={machineInstances}
        machines={machines}
        chains={filteredChains}
        defaultActorName={defaultFleetActorName}
        onAction={(payload) => {
          const inst = machineInstances.find(m => m.id === payload.instanceId);
          if (!inst) return;
          if (payload.kind === 'TRANSFER') {
            onSaveMachineInstance?.({ ...inst, chainId: payload.newChainId || undefined }, { created: false });
          } else {
            const newStatus = payload.kind === 'PANNE' ? 'PANNE' : payload.kind === 'MAINT' ? 'MAINT' : 'OK';
            onSaveMachineInstance?.({ ...inst, status: newStatus }, { created: false });
          }
        }}
      />

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
  const { lang } = useLang();

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-lg animate-in fade-in duration-300">
      <div className="bg-white dark:bg-dk-surface rounded-[28px] shadow-2xl dark:shadow-dk-elevated shadow-indigo-500/10 w-full max-w-md overflow-hidden flex flex-col scale-in-center border border-slate-100 dark:border-dk-border/80">
        
        {/* Header */}
        <div className="p-6 pb-5 flex items-start justify-between relative overflow-hidden bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/30">
          <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-100/50 rounded-full blur-3xl opacity-60 -mr-10 -mt-10 pointer-events-none" />
          
          <div className="flex gap-3.5 items-center relative z-10">
            <div className="w-11 h-11 rounded-[16px] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg dark:shadow-dk-lg shadow-indigo-500/25">
               <Component className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 dark:text-dk-text text-lg tracking-tight leading-none mb-1">
                {instance ? tx(lang,{fr:'Gérer la Machine',ar:'إدارة الآلة',en:'Manage Machine',es:'Gestionar Máquina',pt:'Gerir Máquina',tr:'Makineyi Yönet'}) : tx(lang,{fr:'Ajouter une Machine',ar:'إضافة آلة',en:'Add a Machine',es:'Añadir Máquina',pt:'Adicionar Máquina',tr:'Makine Ekle'})}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Configurez les paramètres du parc',ar:'قم بتكوين إعدادات الأسطول',en:'Configure fleet parameters',es:'Configure los parámetros del parque',pt:'Configure os parâmetros do parque',tr:'Filo parametrelerini yapılandırın'})}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100/80 border border-slate-200 dark:border-dk-border/60 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors relative z-10"><XCircle className="w-4 h-4"/></button>
        </div>
        
        {/* Body Form */}
        <div className="px-6 pb-6 flex flex-col gap-4 relative z-10">
          
          {/* Classe Lookup */}
          <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 p-4 rounded-2xl border border-slate-100 dark:border-dk-border/80">
            <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-2 flex items-center gap-1.5"><Layers className="w-3 h-3" /> {tx(lang,{fr:'Classe & Type',ar:'الفئة والنوع',en:'Class & Type',es:'Clase y Tipo',pt:'Classe e Tipo',tr:'Sınıf ve Tip'})}</label>
            <div className="flex gap-2.5">
              <input 
                list="classes-list"
                value={classId}
                onChange={e => setClassId(e.target.value)}
                placeholder={tx(lang,{fr:'Ex: 301, 516...',ar:'مثال: 301، 516...',en:'E.g. 301, 516...',es:'Ej: 301, 516...',pt:'Ex: 301, 516...',tr:'Örn: 301, 516...'})}
                className="flex-1 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/80 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all placeholder-slate-300 shadow-sm dark:shadow-dk-sm"
              />
              <datalist id="classes-list">
                {classes.map(c => <option key={c.id} value={c.classe}>{c.name}</option>)}
              </datalist>
              
              {!isClassKnown && classId.trim().length > 0 && (
                <button 
                  onClick={() => onAddClassShortcut(classId.trim())}
                  className="px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[9px] font-black uppercase tracking-wider rounded-xl hover:shadow-lg hover:shadow-indigo-500/20 transition-all whitespace-nowrap"
                >
                  + {tx(lang,{fr:'Créer',ar:'إنشاء',en:'Create',es:'Crear',pt:'Criar',tr:'Oluştur'})}
                </button>
              )}
            </div>
            {!isClassKnown && classId.trim().length > 0 && (
              <p className="text-[9px] text-amber-500 dark:text-amber-400 font-bold mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> {tx(lang,{fr:'Classe inconnue, création automatique possible',ar:'فئة غير معروفة، يمكن الإنشاء التلقائي',en:'Unknown class, automatic creation possible',es:'Clase desconocida, creación automática posible',pt:'Classe desconhecida, criação automática possível',tr:'Bilinmeyen sınıf, otomatik oluşturma mümkün'})}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'Réf / Matricule',ar:'المرجع / الرقم التسلسلي',en:'Ref / Serial No.',es:'Ref / Matrícula',pt:'Ref / Matrícula',tr:'Ref / Seri No.'})}</label>
              <input 
                type="text" value={matricule} onChange={e => setMatricule(e.target.value)}
                placeholder="MAC-001"
                className={`w-full bg-slate-50 dark:bg-dk-bg/80 border rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text focus:bg-white focus:outline-none focus:ring-2 transition-all uppercase placeholder-slate-300 ${instances.some(i => i.id !== instance?.id && i.matricule && i.matricule === matricule) ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100 text-rose-600 dark:text-rose-400' : 'border-slate-200 dark:border-dk-border/80 focus:border-indigo-400 focus:ring-indigo-100'}`}
              />
              {instances.some(i => i.id !== instance?.id && i.matricule && i.matricule === matricule) && (
                <p className="text-[8px] font-bold text-rose-500 dark:text-rose-400 mt-1 ml-0.5">{tx(lang,{fr:'Déjà utilisé',ar:'مستعمل بالفعل',en:'Already used',es:'Ya utilizado',pt:'Já utilizado',tr:'Zaten kullanılıyor'})}</p>
              )}
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'Marque',ar:'العلامة التجارية',en:'Brand',es:'Marca',pt:'Marca',tr:'Marka'})}</label>
              <input 
                type="text" value={brand} onChange={e => setBrand(e.target.value)}
                placeholder="Brother, Juki..."
                className="w-full bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border/80 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text focus:bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all placeholder-slate-300"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'N° de Série',ar:'الرقم التسلسلي',en:'Serial No.',es:'N° de Serie',pt:'N° de Série',tr:'Seri No.'})}</label>
              <input 
                type="text" value={serialNumber} onChange={e => setSerialNumber(e.target.value)}
                placeholder="SN-123456789"
                className={`w-full bg-slate-50 dark:bg-dk-bg/80 border rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text focus:bg-white focus:outline-none focus:ring-2 transition-all placeholder-slate-300 ${instances.some(i => i.id !== instance?.id && i.serialNumber && i.serialNumber === serialNumber) ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100 text-rose-600 dark:text-rose-400' : 'border-slate-200 dark:border-dk-border/80 focus:border-indigo-400 focus:ring-indigo-100'}`}
              />
              {instances.some(i => i.id !== instance?.id && i.serialNumber && i.serialNumber === serialNumber) && (
                <p className="text-[8px] font-bold text-rose-500 dark:text-rose-400 mt-1 ml-0.5">{tx(lang,{fr:'Déjà utilisé',ar:'مستعمل بالفعل',en:'Already used',es:'Ya utilizado',pt:'Já utilizado',tr:'Zaten kullanılıyor'})}</p>
              )}
            </div>
          </div>
          {(!matricule.trim() && !serialNumber.trim()) && (
              <p className="text-[9px] font-bold text-amber-500 dark:text-amber-400 flex items-center gap-1.5 -mt-1">
                <AlertTriangle className="w-3.5 h-3.5" /> {tx(lang,{fr:'Veuillez renseigner au moins une Référence ou un N° de Série.',ar:'يرجى إدخال مرجع أو رقم تسلسلي واحد على الأقل.',en:'Please fill in at least one Reference or Serial No.',es:'Por favor, indique al menos una Referencia o N° de Serie.',pt:'Por favor, preencha pelo menos uma Referência ou N° de Série.',tr:'Lütfen en az bir Referans veya Seri No. girin.'})}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'Affectation',ar:'التعيين',en:'Assignment',es:'Asignación',pt:'Atribuição',tr:'Atama'})}</label>
              <select
                value={chainId}
                onChange={e => setChainId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border/80 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text focus:bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all appearance-none cursor-pointer"
              >
                <option value="">{tx(lang,{fr:'Magasin (Libre)',ar:'مخزن (حر)',en:'Warehouse (Free)',es:'Almacén (Libre)',pt:'Armazém (Livre)',tr:'Depo (Serbest)'})}</option>
                {Array.from({ length: 6 }).map((_, i) => (
                  <option key={`CHAINE ${i + 1}`} value={`CHAINE ${i + 1}`}>
                    CHAINE {i + 1}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'Statut',ar:'الحالة',en:'Status',es:'Estado',pt:'Estado',tr:'Durum'})}</label>
              <div className="flex p-0.5 gap-0.5 bg-slate-100/80 rounded-xl border border-slate-200 dark:border-dk-border/50 h-[42px]">
                {(['OK', 'MAINT', 'PANNE'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`flex-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all flex items-center justify-center ${
                      status === s 
                        ? s === 'OK' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md dark:shadow-dk-md shadow-emerald-500/20' : s === 'MAINT' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md dark:shadow-dk-md shadow-amber-500/20' : 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md dark:shadow-dk-md shadow-rose-500/20'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'Photo Machine',ar:'صورة الآلة',en:'Machine Photo',es:'Foto de Máquina',pt:'Foto da Máquina',tr:'Makine Fotoğrafı'})}</label>
              <div className="relative border-2 border-dashed border-slate-200 dark:border-dk-border/60 rounded-xl p-2.5 flex flex-col items-center justify-center bg-slate-50 dark:bg-dk-bg/50 hover:bg-slate-100/50 transition-colors cursor-pointer group overflow-hidden h-[72px]">
                 <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={handlePhotoUpload} />
                 {photos.length > 0 && (
                   <img src={photos[0]} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-30 transition-opacity" />
                 )}
                 <Printer className="w-4 h-4 text-slate-400 dark:text-dk-muted group-hover:text-indigo-500 mb-0.5 z-10 transition-colors" />
                  <span className="text-[8px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-widest z-10 bg-white dark:bg-dk-surface/80 px-2 py-0.5 rounded-full">{photos.length > 0 ? tx(lang,{fr:'Modifier',ar:'تعديل',en:'Edit',es:'Editar',pt:'Editar',tr:'Düzenle'}) : tx(lang,{fr:'Ajouter',ar:'إضافة',en:'Add',es:'Añadir',pt:'Adicionar',tr:'Ekle'})}</span>
              </div>
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'Fichier (PDF/Excel)',ar:'ملف (PDF/Excel)',en:'File (PDF/Excel)',es:'Archivo (PDF/Excel)',pt:'Ficheiro (PDF/Excel)',tr:'Dosya (PDF/Excel)'})}</label>
              <div className="relative border-2 border-dashed border-slate-200 dark:border-dk-border/60 rounded-xl p-2.5 flex flex-col items-center justify-center bg-slate-50 dark:bg-dk-bg/50 hover:bg-slate-100/50 transition-colors cursor-pointer group h-[72px] overflow-hidden">
                 <input type="file" accept=".pdf,.xls,.xlsx,.doc,.docx" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={handleManualUpload} />
                 <Layers className="w-4 h-4 text-slate-400 dark:text-dk-muted group-hover:text-indigo-500 mb-0.5 z-10 transition-colors" />
                 <span className="text-[8px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-widest text-center truncate w-full px-2 z-10 bg-white dark:bg-dk-surface/80 rounded-full py-0.5">
                    {manuals.length > 0 ? manuals[0].name : tx(lang,{fr:'Joindre',ar:'إرفاق',en:'Attach',es:'Adjuntar',pt:'Anexar',tr:'Ekle'})}
                 </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-4 border-t border-slate-100 dark:border-dk-border/80 bg-gradient-to-r from-slate-50/50 to-indigo-50/30 flex items-center justify-between mt-auto">
          {instance ? (
             <button 
               onClick={() => onDelete(instance.id)}
               className="px-4 py-2 text-[10px] font-bold text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:text-rose-600 rounded-xl transition-colors"
             >
               {tx(lang,{fr:'Supprimer',ar:'حذف',en:'Delete',es:'Eliminar',pt:'Eliminar',tr:'Sil'})}
             </button>
          ) : <div />}
          
          <div className="flex gap-2.5">
              <button onClick={onClose} className="px-4 py-2.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-xl transition-colors">{tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}</button>
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
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-md dark:shadow-dk-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30 disabled:opacity-50 disabled:hover:shadow-md transition-all"
            >
              {tx(lang,{fr:'Enregistrer',ar:'حفظ',en:'Save',es:'Guardar',pt:'Guardar',tr:'Kaydet'})}
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
  const { lang } = useLang();
  const [name, setName] = useState(tx(lang,{fr:'Nouvelle Machine',ar:'آلة جديدة',en:'New Machine',es:'Nueva Máquina',pt:'Nova Máquina',tr:'Yeni Makine'}) + ` ${initialClass}`);
  const [machineCategory, setMachineCategory] = useState(tx(lang,{fr:'Surjeteuse',ar:'أوفرلوك',en:'Overlock',es:'Overlock',pt:'Overloque',tr:'Overlok'}) as string);
  const [classe, setClasse] = useState(initialClass);
  const [speed, setSpeed] = useState(3000);
  const [speedMajor, setSpeedMajor] = useState(1.01);
  const [cofs, setCofs] = useState(1.15);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-lg animate-in fade-in duration-300">
      <div className="bg-white dark:bg-dk-surface rounded-[28px] shadow-2xl dark:shadow-dk-elevated shadow-emerald-500/10 w-full max-w-md overflow-hidden flex flex-col scale-in-center border border-slate-100 dark:border-dk-border/80">
        
        {/* Header */}
        <div className="p-6 pb-5 flex items-start justify-between relative overflow-hidden bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/30">
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-100/50 rounded-full blur-3xl opacity-60 -mr-10 -mt-10 pointer-events-none" />
          
          <div className="flex gap-3.5 items-center relative z-10">
            <div className="w-11 h-11 rounded-[16px] bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-lg dark:shadow-dk-lg shadow-emerald-500/25">
               <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 dark:text-dk-text text-lg tracking-tight leading-none mb-1">
                {tx(lang,{fr:'Créer la Classe',ar:'إنشاء الفئة',en:'Create Class',es:'Crear Clase',pt:'Criar Classe',tr:'Sınıf Oluştur'})}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Définissez ce nouveau type',ar:'حدد هذا النوع الجديد',en:'Define this new type',es:'Defina este nuevo tipo',pt:'Defina este novo tipo',tr:'Bu yeni türü tanımlayın'})}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100/80 border border-slate-200 dark:border-dk-border/60 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors relative z-10"><XCircle className="w-4 h-4"/></button>
        </div>
        
        {/* Body Form */}
        <div className="px-6 pb-6 flex flex-col gap-4 relative z-10">
          
          <div>
            <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'Nom *',ar:'الاسم *',en:'Name *',es:'Nombre *',pt:'Nome *',tr:'Ad *'})}</label>
            <input 
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Surjeteuse 5 Fils"
              className="w-full bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border/80 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder-slate-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'Type (Famille)',ar:'النوع (العائلة)',en:'Type (Family)',es:'Tipo (Familia)',pt:'Tipo (Família)',tr:'Tip (Aile)'})}</label>
              <input 
                type="text" value={machineCategory} onChange={e => setMachineCategory(e.target.value)}
                placeholder="Ex: Surjeteuse"
                className="w-full bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border/80 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder-slate-300"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'Classe *',ar:'الفئة *',en:'Class *',es:'Clase *',pt:'Classe *',tr:'Sınıf *'})}</label>
              <input 
                type="text" value={classe} onChange={e => setClasse(e.target.value)}
                placeholder="Ex: 516"
                className="w-full bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border/80 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder-slate-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'Vitesse',ar:'السرعة',en:'Speed',es:'Velocidad',pt:'Velocidade',tr:'Hız'})}</label>
              <input 
                type="number" value={speed} onChange={e => setSpeed(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border/80 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">{tx(lang,{fr:'Majoration',ar:'الزيادة',en:'Markup',es:'Recargo',pt:'Majoração',tr:'Artış'})}</label>
              <input 
                type="number" step="0.01" value={speedMajor} onChange={e => setSpeedMajor(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border/80 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1.5 ml-0.5">COFS</label>
              <input 
                type="number" step="0.01" value={cofs} onChange={e => setCofs(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border/80 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text focus:bg-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-5 pt-4 border-t border-slate-100 dark:border-dk-border/80 bg-gradient-to-r from-slate-50/50 to-emerald-50/30 flex items-center justify-end mt-auto">
          <div className="flex gap-2.5">
            <button onClick={onClose} className="px-4 py-2.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-xl transition-colors">{tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}</button>
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
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-md dark:shadow-dk-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:hover:shadow-md transition-all"
            >
              {tx(lang,{fr:'Enregistrer',ar:'حفظ',en:'Save',es:'Guardar',pt:'Guardar',tr:'Kaydet'})}
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