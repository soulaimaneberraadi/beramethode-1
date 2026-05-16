
import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Operation, Poste, Machine } from '../types';
import { 
  Users, 
  Clock, 
  RefreshCw,
  MousePointer2,
  ArrowRightLeft,
  Zap,
  Timer,
  Activity,
  LayoutList,
  TableProperties,
  Cpu,
  Palette,
  BarChart3,
  Pin,
  PinOff,
  Briefcase,
  Plus,
  Trash2,
  Eraser,
  Copy,
  Scissors,
  Clipboard,
  CopyPlus,
  X,
  Save,
  AlertCircle,
  Percent,
  Link,
  PanelTop,
  Hand,
  Calculator,
  ListPlus
} from 'lucide-react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell
} from 'recharts';

interface BalancingProps {
  operations: Operation[];
  // Added setOperations to allow modification of Gamme from Balancing view
  setOperations?: React.Dispatch<React.SetStateAction<Operation[]>>;
  efficiency: number;
  setEfficiency: React.Dispatch<React.SetStateAction<number>>;
  bf: number;
  articleName: string;
  numWorkers: number;
  setNumWorkers: React.Dispatch<React.SetStateAction<number>>;
  presenceTime: number;
  setPresenceTime: React.Dispatch<React.SetStateAction<number>>;
  // Shared State
  assignments: Record<string, string[]>;
  setAssignments: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  postes: Poste[];
  setPostes: React.Dispatch<React.SetStateAction<Poste[]>>;
  machines: Machine[];
}

// --- GROUP COLOR PALETTE (Matched with Gamme - High Contrast Alternating) ---
const GROUP_COLORS = [
  { bg: 'bg-indigo-50', border: 'border-indigo-500', text: 'text-indigo-700' }, // Cool
  { bg: 'bg-orange-50', border: 'border-orange-500', text: 'text-orange-700' }, // Warm
  { bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-700' }, // Cool
  { bg: 'bg-rose-50', border: 'border-rose-500', text: 'text-rose-700' },       // Warm
  { bg: 'bg-cyan-50', border: 'border-cyan-500', text: 'text-cyan-700' },       // Cool
  { bg: 'bg-amber-50', border: 'border-amber-500', text: 'text-amber-700' },    // Warm
  { bg: 'bg-violet-50', border: 'border-violet-500', text: 'text-violet-700' }, // Cool
  { bg: 'bg-lime-50', border: 'border-lime-500', text: 'text-lime-700' },       // Warm
  { bg: 'bg-fuchsia-50', border: 'border-fuchsia-500', text: 'text-fuchsia-700' }, // Cool
  { bg: 'bg-teal-50', border: 'border-teal-500', text: 'text-teal-700' },       // Warm/Cool
  { bg: 'bg-red-50', border: 'border-red-500', text: 'text-red-700' },          // Warm
  { bg: 'bg-sky-50', border: 'border-sky-500', text: 'text-sky-700' },          // Cool
];

const getGroupStyle = (groupId: string) => {
    if (!groupId) return null;
    let hash = 0;
    for (let i = 0; i < groupId.length; i++) {
        hash = groupId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % GROUP_COLORS.length;
    return GROUP_COLORS[index];
};

// --- COLOR PALETTE FOR POSTES (Matched with Gamme Sequence) ---
const POSTE_COLORS = [
  { name: 'indigo',  bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-700',  badge: 'bg-indigo-100',  fill: '#6366f1', badgeText: 'text-indigo-800' },
  { name: 'orange',  bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',  badge: 'bg-orange-100',  fill: '#f97316', badgeText: 'text-orange-800' },
  { name: 'emerald', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100', fill: '#10b981', badgeText: 'text-emerald-800' },
  { name: 'rose',    bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    badge: 'bg-rose-100',    fill: '#f43f5e', badgeText: 'text-rose-800' },
  { name: 'cyan',    bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-700',    badge: 'bg-cyan-100',    fill: '#06b6d4', badgeText: 'text-cyan-800' },
  { name: 'amber',   bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   badge: 'bg-amber-100',   fill: '#f59e0b', badgeText: 'text-amber-800' },
  { name: 'violet',  bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  badge: 'bg-violet-100',  fill: '#8b5cf6', badgeText: 'text-violet-800' },
  { name: 'lime',    bg: 'bg-lime-50',    border: 'border-lime-200',    text: 'text-lime-700',    badge: 'bg-lime-100',    fill: '#84cc16', badgeText: 'text-lime-800' },
  { name: 'fuchsia', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', badge: 'bg-fuchsia-100', fill: '#d946ef', badgeText: 'text-fuchsia-800' },
  { name: 'teal',    bg: 'bg-teal-50',    border: 'border-teal-200',    text: 'text-teal-700',    badge: 'bg-teal-100',    fill: '#14b8a6', badgeText: 'text-teal-800' },
  { name: 'red',     bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     badge: 'bg-red-100',     fill: '#ef4444', badgeText: 'text-red-800' },
  { name: 'sky',     bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-700',     badge: 'bg-sky-100',     fill: '#0ea5e9', badgeText: 'text-sky-800' },
];

const NEUTRAL_COLOR = { 
  name: 'neutral',  
  bg: 'bg-slate-50',  
  border: 'border-slate-200',  
  text: 'text-slate-700',  
  badge: 'bg-slate-100',  
  fill: '#64748b', 
  badgeText: 'text-slate-800' 
};

const getStatusColor = (saturation: number) => {
    if (saturation > 115) return { 
        name: 'overload', 
        bg: 'bg-rose-50', 
        border: 'border-rose-200', 
        text: 'text-rose-700', 
        badge: 'bg-rose-100',
        fill: '#f43f5e',
        badgeText: 'text-rose-800'
    };
    if (saturation < 75 && saturation > 0) return { 
        name: 'underload', 
        bg: 'bg-amber-50', 
        border: 'border-amber-200', 
        text: 'text-amber-700', 
        badge: 'bg-amber-100',
        fill: '#fbbf24',
        badgeText: 'text-amber-800'
    };
    return { 
        name: 'good', 
        bg: 'bg-white',
        border: 'border-emerald-200', 
        text: 'text-emerald-700', 
        badge: 'bg-emerald-50',
        fill: '#10b981',
        badgeText: 'text-emerald-800'
    };
};

const getPosteColor = (index: number) => POSTE_COLORS[index % POSTE_COLORS.length];

export default function Balancing({ 
  operations,
  setOperations,
  efficiency,
  setEfficiency,
  bf, 
  articleName,
  numWorkers,
  setNumWorkers,
  presenceTime,
  setPresenceTime,
  assignments,
  setAssignments,
  postes,
  setPostes,
  machines
}: BalancingProps) {

  const [isManual, setIsManual] = useState(false);
  const [viewMode, setViewMode] = useState<'grouped' | 'matrix'>('matrix');
  const [isSticky, setIsSticky] = useState(true); // Column Sticky
  const [isHeaderSticky, setIsHeaderSticky] = useState(true); // Row Header Sticky
  const [showColors, setShowColors] = useState(true); // Column Colors
  const [showGroupColors, setShowGroupColors] = useState(true); // Row Colors (Groups)

  // --- INSERT MODAL STATE ---
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [insertIndex, setInsertIndex] = useState(-1);
  const [insertData, setInsertData] = useState({
      machine: 'MAN',
      description: '',
      length: 0,
      notes: ''
  });

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    posteId: string | null;
  } | null>(null);

  const [clipboard, setClipboard] = useState<{ poste: Poste | null; mode: 'copy' | 'cut' } | null>(null);

  // Precision Helper: To Fixed 2
  const toSec = (min: number) => Number((min * 60).toFixed(2));
  const bfSeconds = bf * 60;

  // --- ENSURE SORTING (STRICT GAMME ORDER) ---
  const sortedOperations = useMemo(() => {
      return [...operations].sort((a, b) => a.order - b.order);
  }, [operations]);

  // --- SMART INDEXING (1.1, 1.2...) ---
  const getDisplayIndex = (opList: Operation[], index: number) => {
      let mainCounter = 0;
      let subCounter = 0;
      let lastGroupId = '';

      for (let i = 0; i <= index; i++) {
          const currentOp = opList[i];
          if (currentOp.groupId) {
              if (currentOp.groupId !== lastGroupId) {
                  // New Group Start
                  mainCounter++;
                  subCounter = 1;
                  lastGroupId = currentOp.groupId;
              } else {
                  // Inside same group
                  subCounter++;
              }
          } else {
              // No Group
              mainCounter++;
              subCounter = 0;
              lastGroupId = '';
          }
      }

      if (subCounter > 0) {
          return `${mainCounter}.${subCounter}`;
      }
      return `${mainCounter}`;
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleClick, true);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleClick, true);
    }
  }, []);

  // --- INITIALIZATION / AUTO-BALANCE ---
  const runAutoBalancing = (force = false) => {
    if (isManual && !force) return;

    const newAssignments: Record<string, string[]> = {};
    const newPostes: Poste[] = [];

    // Allow 15% tolerance on cycle time
    const limitMax = bf > 0 ? bf * 1.15 : Number.MAX_VALUE;

    let currentPosteOps: Operation[] = [];
    let currentTotalTime = 0;
    let currentMachine = '';
    let posteIdx = 1;

    const flush = () => {
        if (currentPosteOps.length === 0) return;
        
        const posteId = `P${posteIdx}`;
        newPostes.push({ 
            id: posteId, 
            name: `P${posteIdx}`, 
            machine: currentMachine || 'MAN'
        });
        
        currentPosteOps.forEach(op => {
            newAssignments[op.id] = [posteId];
        });

        posteIdx++;
        currentPosteOps = [];
        currentTotalTime = 0;
        currentMachine = '';
    };

    // USE SORTED OPERATIONS FOR AUTO-BALANCING TO RESPECT SEQUENCE
    sortedOperations.forEach(op => {
        // Standard balancing: Operations are processed in sequence.
        let primaryMachine = 'MAN';
        let rawName = op.machineName;
        if (!rawName && op.machineId) {
            const foundM = machines.find(m => m.id === op.machineId);
            if (foundM) rawName = foundM.name;
        }
        if (rawName) {
            let m = rawName.trim().toUpperCase();
            if (m.includes('MANUEL')) m = 'MAN';
            primaryMachine = m;
        }

        const blockTime = op.time || 0;

        const cleanCurrent = (currentMachine || '').trim().toUpperCase();
        const cleanPrimary = (primaryMachine || '').trim().toUpperCase();
        
        const isSameMachine = currentPosteOps.length === 0 || cleanPrimary === cleanCurrent;
        const fits = (currentTotalTime + blockTime) <= limitMax;

        if (isSameMachine && fits) {
            currentPosteOps.push(op);
            currentTotalTime += blockTime;
            if (currentPosteOps.length === 1) currentMachine = primaryMachine;
        } else {
            flush();
            currentPosteOps = [op];
            currentTotalTime = blockTime;
            currentMachine = primaryMachine;
        }
    });
    flush();

    setPostes(newPostes);
    setAssignments(newAssignments);
  };

  useEffect(() => {
    if (!isManual) {
        runAutoBalancing();
    }
  }, [operations, bf, isManual, machines]);

  // --- CONTEXT MENU HANDLERS ---
  const handleContextMenu = (e: React.MouseEvent, posteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.pageX, y: e.pageY, posteId });
  };

  const handleContextAction = (action: 'insert' | 'delete' | 'clear' | 'copy' | 'cut' | 'paste' | 'duplicate' | 'toggleManual') => {
      
      if (action === 'toggleManual') {
          setIsManual(!isManual);
          setContextMenu(null);
          return;
      }

      setIsManual(true);

      if (!contextMenu?.posteId) return;
      const idx = postes.findIndex(p => p.id === contextMenu.posteId);
      if (idx === -1) return;

      let newPostes = [...postes];
      let newAssignments = { ...assignments };

      switch(action) {
          case 'insert': {
              const refPoste = newPostes[idx];
              setInsertData({
                  machine: refPoste.machine || 'MAN',
                  description: 'Nouvelle Opération',
                  length: 0,
                  notes: ''
              });
              setInsertIndex(idx + 1);
              setShowInsertModal(true);
              setContextMenu(null);
              return;
          }
          case 'duplicate': {
              const currentPoste = newPostes[idx];
              const newPoste: Poste = {
                  ...currentPoste,
                  id: `P_${Date.now()}`,
                  name: 'P?' 
              };
              newPostes.splice(idx + 1, 0, newPoste);
              break;
          }
          case 'delete': {
              const pid = newPostes[idx].id;
              newPostes.splice(idx, 1);
              Object.keys(newAssignments).forEach(opId => {
                  newAssignments[opId] = newAssignments[opId].filter(id => id !== pid);
              });
              break;
          }
          case 'clear': {
              const pid = newPostes[idx].id;
              newPostes[idx] = { 
                  ...newPostes[idx], 
                  machine: 'MAN', 
                  timeOverride: undefined, 
                  notes: '', 
                  operatorName: '' 
              };
              Object.keys(newAssignments).forEach(opId => {
                  newAssignments[opId] = newAssignments[opId].filter(id => id !== pid);
              });
              break;
          }
          case 'copy':
              setClipboard({ poste: { ...postes[idx] }, mode: 'copy' });
              break;
          case 'cut':
              setClipboard({ poste: { ...postes[idx] }, mode: 'cut' });
              break;
          case 'paste': {
              if (clipboard?.poste) {
                  const newId = `P_${Date.now()}`;
                  const pastedPoste = {
                      ...clipboard.poste,
                      id: newId,
                      name: 'P?' 
                  };
                  newPostes.splice(idx + 1, 0, pastedPoste);
                  
                  if (clipboard.mode === 'cut') {
                      const oldIdx = newPostes.findIndex(p => p.id === clipboard.poste!.id);
                      if (oldIdx !== -1) {
                          const oldPid = newPostes[oldIdx].id;
                          newPostes.splice(oldIdx, 1);
                          Object.keys(newAssignments).forEach(opId => {
                              newAssignments[opId] = newAssignments[opId].filter(id => id !== oldPid);
                          });
                          setClipboard(null);
                      }
                  }
              }
              break;
          }
      }

      newPostes = newPostes.map((p, i) => ({ ...p, name: `P${i + 1}` }));
      
      setPostes(newPostes);
      setAssignments(newAssignments);
      setContextMenu(null);
  };

  const handleInsertSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (insertIndex === -1) return;

      const newPosteId = `P_${Date.now()}`;
      
      const newPoste: Poste = {
          id: newPosteId,
          name: 'P?',
          machine: insertData.machine,
          notes: insertData.notes,
          operatorName: ''
      };

      const newPostes = [...postes];
      newPostes.splice(insertIndex, 0, newPoste);
      const reindexedPostes = newPostes.map((p, i) => ({ ...p, name: `P${i + 1}` }));
      
      setPostes(reindexedPostes);

      if (setOperations) {
          let calculatedTime = 0;
          const machineObj = machines.find(m => m.name === insertData.machine || m.classe === insertData.machine);
          const isManual = !machineObj || insertData.machine.toUpperCase() === 'MAN';
          
          if (isManual) {
              calculatedTime = 0.25; 
          } else {
              const length = insertData.length || 0;
              const speed = machineObj.speed || 2500;
              const stitchCount = 4;
              const cofs = machineObj.cofs || 1.15;
              
              if (length > 0) {
                  const baseTime = (length * stitchCount) / speed;
                  calculatedTime = ((baseTime * 1.1) + 0.02 + 0.15) * cofs; 
              } else {
                  calculatedTime = 0.20; 
              }
          }

          const newOpId = `op-${Date.now()}`;
          const newOp: Operation = {
              id: newOpId,
              order: operations.length + 1,
              description: insertData.description || 'Opération (Insérée)',
              machineId: machineObj ? machineObj.id : '',
              machineName: insertData.machine,
              length: insertData.length,
              time: Number(calculatedTime.toFixed(3)),
              manualTime: 0,
              guideFactor: 1.1
          };

          setOperations(prev => [...prev, newOp]);
          
          setAssignments(prev => ({
              ...prev,
              [newOpId]: [newPosteId]
          }));
      }

      setShowInsertModal(false);
      setInsertIndex(-1);
  };

  const toggleAssignment = (opId: string, posteId: string) => {
      if (!isManual) return;
      
      setAssignments(prev => {
          const next = { ...prev };
          const currentAss = next[opId] || [];
          const exists = currentAss.includes(posteId);
          
          if (exists) {
              next[opId] = currentAss.filter(id => id !== posteId);
          } else {
              next[opId] = [...currentAss, posteId];
          }
          return next;
      });
  };

  // --- CALCULATIONS ---
  const calculateStats = (currAssignments: Record<string, string[]>, currPostes: Poste[]) => {
      const stats: Record<string, { time: number, nTheo: number, saturation: number }> = {};
      
      currPostes.forEach(p => {
          stats[p.id] = { time: p.timeOverride !== undefined ? p.timeOverride : 0, nTheo: 0, saturation: 0 };
      });

      operations.forEach(op => {
          const assignedIds = currAssignments[op.id] || [];
          const count = assignedIds.length;
          if (count > 0) {
              const timeShare = (op.time || 0) / count;
              assignedIds.forEach(pid => {
                  const poste = currPostes.find(p => p.id === pid);
                  if (stats[pid] && poste && poste.timeOverride === undefined) {
                      stats[pid].time += timeShare;
                  }
              });
          }
      });

      Object.keys(stats).forEach(pid => {
          if (bf > 0) {
              stats[pid].nTheo = stats[pid].time / bf;
              stats[pid].saturation = (stats[pid].time / bf) * 100;
          }
      });
      return stats;
  };

  const posteStats = useMemo(() => calculateStats(assignments, postes), [operations, assignments, postes, bf]);
  
  const tempsArticle = operations.reduce((sum, op) => sum + (op.time || 0), 0) * 1.20;
  
  // --- CHART DATA PREP ---
  const chartData = useMemo(() => {
    const data: any[] = [];
    postes.forEach((p, index) => {
        const stat = posteStats[p.id] || { time: 0, saturation: 0, nTheo: 0 };
        const nReq = stat.nTheo > 1.15 ? Math.ceil(stat.nTheo) : (stat.nTheo > 0 ? 1 : 0);
        
        let colorFill = '';
        if (showColors) {
            colorFill = getPosteColor(index).fill;
        } else {
            const statusColor = getStatusColor(stat.saturation);
            colorFill = statusColor.fill;
        }
        
        if (nReq > 1) {
            const timePerWorker = (stat.time / nReq);
            const satPerWorker = (timePerWorker / bf) * 100;
            if (!showColors) colorFill = getStatusColor(satPerWorker).fill;

            for (let i = 1; i <= nReq; i++) {
                data.push({
                    name: `${p.name.replace('P', '')}.${i}`,
                    fullId: p.name,
                    time: Number((timePerWorker * 60).toFixed(2)),
                    saturation: Math.round(satPerWorker),
                    nTheo: Number((stat.nTheo / nReq).toFixed(2)),
                    machine: p.machine,
                    fill: colorFill 
                });
            }
        } else {
            data.push({
                name: p.name.replace('P', ''),
                fullId: p.name,
                time: Number((stat.time * 60).toFixed(2)),
                saturation: Math.round(stat.saturation),
                nTheo: Number(stat.nTheo.toFixed(2)),
                machine: p.machine,
                fill: colorFill
            });
        }
    });
    return data;
  }, [postes, posteStats, bf, showColors]);

  const totalRequiredWorkers = useMemo(() => {
    return postes.reduce((sum, p) => {
        const stat = posteStats[p.id];
        const nTheo = stat ? stat.nTheo : 0;
        const nReq = nTheo > 1.15 ? Math.ceil(nTheo) : (nTheo > 0 ? 1 : 0);
        return sum + nReq;
    }, 0);
  }, [postes, posteStats]);

  const machineRequirements = useMemo(() => {
    const groups: Record<string, { time: number, count: number }> = {};
    sortedOperations.forEach(op => {
        let rawName = op.machineName;
        if (!rawName && op.machineId) {
            const foundM = machines.find(m => m.id === op.machineId);
            if (foundM) rawName = foundM.name;
        }
        if (!rawName) rawName = 'MAN';

        let mName = rawName.trim().toUpperCase();
        if(mName.includes('MANUEL')) mName = 'MAN';
        
        if (!groups[mName]) groups[mName] = { time: 0, count: 0 };
        groups[mName].time += (op.time || 0);
        groups[mName].count += 1;
    });
    const rows = Object.entries(groups).map(([name, stats]) => {
        const nTheo = bf > 0 ? stats.time / bf : 0;
        const nReq = Math.ceil(nTheo);
        return {
            name,
            opsCount: stats.count,
            totalTime: stats.time,
            nTheo: nTheo,
            nReq: Math.max(nReq, (stats.time > 0 ? 1 : 0))
        };
    });
    return rows.sort((a, b) => b.nTheo - a.nTheo);
  }, [sortedOperations, bf, machines]);

  return (
    <div className="space-y-6 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
       
       {/* 1. SINGLE ROW HEADER - RESPONSIVE */}
       <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 p-2 flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar">
            {/* OUVRIERS / HEURES */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100 shrink-0">
                <div className="flex flex-col items-center border-r border-slate-200 pr-3 mr-3">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Ouvriers</span>
                    <input 
                        type="number" 
                        min="1" 
                        value={Math.round(numWorkers)} 
                        onChange={(e) => setNumWorkers(Math.max(1, Math.round(Number(e.target.value))))} 
                        className="w-12 text-center bg-transparent font-black text-slate-700 outline-none text-sm p-0" 
                    />
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Heures</span>
                    <input 
                        type="number" 
                        min="0" 
                        step="0.5" 
                        value={presenceTime / 60} 
                        onChange={(e) => setPresenceTime(Math.max(0, Number(e.target.value)) * 60)} 
                        className="w-10 text-center bg-transparent font-black text-slate-700 outline-none text-sm p-0" 
                    />
                </div>
            </div>

            {/* BF / MIN TOTALES */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50/50 rounded-lg border border-emerald-100 shrink-0">
                <div className="flex flex-col items-center border-r border-emerald-100 pr-3 mr-3">
                    <span className="text-[9px] font-bold text-emerald-600 uppercase flex items-center gap-1"><Zap className="w-3 h-3" /> BF (s)</span>
                    <span className="font-black text-emerald-700 text-sm">{(bf * 60).toFixed(1)}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-emerald-600 uppercase">Min Tot.</span>
                    <span className="font-black text-emerald-700 text-sm">{presenceTime}</span>
                </div>
            </div>

            {/* P/H 100% */}
            <div className="flex flex-col items-center px-3 py-1.5 shrink-0">
                <span className="text-[9px] font-bold text-orange-400 uppercase">P/H (100%)</span>
                <span className="font-black text-orange-500 text-lg leading-none">
                    {tempsArticle > 0 ? Math.round((presenceTime * numWorkers) / tempsArticle / (presenceTime / 60)) : 0}
                </span>
            </div>

            {/* RENDU */}
            <div className="flex flex-col items-center px-3 py-1.5 bg-indigo-50/50 rounded-lg border border-indigo-100 shrink-0">
                <span className="text-[9px] font-bold text-indigo-400 uppercase">% Rendu</span>
                <div className="flex items-baseline gap-0.5">
                    <input 
                        type="number" 
                        min="1" max="100" 
                        value={efficiency} 
                        onChange={(e) => setEfficiency(Math.max(1, Math.min(100, Number(e.target.value))))} 
                        className="w-8 text-center bg-transparent font-black text-indigo-600 outline-none text-sm border-b border-indigo-200 p-0" 
                    />
                    <span className="text-[10px] font-bold text-indigo-400">%</span>
                </div>
            </div>

            {/* T. ARTICLE (Right aligned or flexed) */}
            <div className="ml-auto px-4 py-1.5 bg-purple-100 rounded-lg border border-purple-200 flex flex-col items-end shrink-0">
                <span className="text-[9px] font-bold text-purple-500 uppercase flex items-center gap-1"><Timer className="w-3 h-3" /> T. Article</span>
                <span className="font-black text-purple-700 text-xl leading-none">{tempsArticle.toFixed(2)}</span>
            </div>
       </div>
      
      {/* 2. CONTROLS (VIEW SWITCHER + ACTIONS) */}
      <div className="flex flex-col sm:flex-row justify-between items-end gap-3 px-2">
         <div className="flex bg-slate-100/80 p-1 rounded-xl shadow-inner border border-slate-200">
             <button onClick={() => setViewMode('grouped')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'grouped' ? 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                <LayoutList className="w-4 h-4" /> Vue Par Poste
             </button>
             <button onClick={() => setViewMode('matrix')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'matrix' ? 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                <TableProperties className="w-4 h-4" /> Matrice
             </button>
         </div>

         <div className="flex items-center gap-2">
            <button
                onClick={() => setIsHeaderSticky(!isHeaderSticky)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${isHeaderSticky ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-1 ring-indigo-100' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                title={isHeaderSticky ? "En-tête figé" : "Figer l'en-tête"}
            >
                <PanelTop className="w-4 h-4" />
            </button>
            <button 
                onClick={() => setShowGroupColors(!showGroupColors)} 
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${showGroupColors ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-1 ring-indigo-100' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`} 
                title={showGroupColors ? "Masquer couleurs groupes" : "Afficher couleurs groupes"}
            >
                <Link className="w-4 h-4" />
            </button>
            <button onClick={() => setShowColors(!showColors)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${showColors ? 'bg-purple-50 border-purple-200 text-purple-700 ring-1 ring-purple-100' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`} title={showColors ? "Désactiver les couleurs" : "Activer les couleurs"}>
                <Palette className="w-4 h-4" />
            </button>
            <button onClick={() => setIsManual(!isManual)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${isManual ? 'bg-amber-50 border-amber-200 text-amber-700 ring-2 ring-amber-100' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {isManual ? <MousePointer2 className="w-3.5 h-3.5" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                {isManual ? 'Mode Manuel Actif' : 'Mode Automatique'}
            </button>
            <button onClick={() => runAutoBalancing(true)} className="px-4 py-2 bg-white border border-slate-200 text-slate-400 rounded-xl hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-2 text-xs font-bold" title="Recalculer">
                <RefreshCw className="w-3.5 h-3.5" />
            </button>
         </div>
      </div>

       {/* 3. MAIN CONTENT (CONDITIONAL VIEW) */}
       {viewMode === 'matrix' ? (
           <div className="flex flex-col gap-6">
                <div className="bg-white rounded-[1rem] border border-slate-200 shadow-sm overflow-hidden h-[600px]">
                    <div className="overflow-auto w-full h-full relative custom-scrollbar pb-2">
                        <table className="text-left border-collapse border-spacing-0 min-w-full">
                            <thead className={`${isHeaderSticky ? 'sticky top-0 z-30' : ''} bg-white shadow-sm`}>
                                <tr className="bg-slate-50">
                                    <th className={`py-2 px-2 border-b-2 border-slate-300 border-r border-slate-300 min-w-[200px] ${isSticky ? 'sticky left-0 z-50 bg-slate-50 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)]' : 'z-40'}`}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Séquence Opératoire</span>
                                            <button onClick={() => setIsSticky(!isSticky)} className={`p-1 rounded-md transition-colors ${isSticky ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-200'}`} title={isSticky ? "Détacher la colonne" : "Figer la colonne"}>
                                            {isSticky ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
                                            </button>
                                        </div>
                                    </th>
                                    {postes.map((p, i) => {
                                        const color = showColors ? getPosteColor(i) : NEUTRAL_COLOR;
                                        const hasOverride = p.timeOverride !== undefined;
                                        return (
                                            <th 
                                                key={p.id} 
                                                onContextMenu={(e) => handleContextMenu(e, p.id)}
                                                className={`py-2 px-1 text-center min-w-[70px] ${color.bg} border-b-2 ${color.border} border-r border-slate-300 relative cursor-context-menu`}
                                            >
                                                {hasOverride && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-purple-500" title="Temps Forcé"></div>}
                                                <div className="flex flex-col items-center justify-center gap-1 pointer-events-none">
                                                    <span className={`inline-block px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold bg-white border ${color.border} ${color.text} uppercase truncate max-w-[65px]`}>{p.machine}</span>
                                                    <div className={`flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs shadow-sm bg-white border ${color.border} ${color.text}`}>{p.name.replace('P','')}</div>
                                                </div>
                                            </th>
                                        );
                                    })}
                                    <th className={`py-2 px-2 bg-slate-50 border-b-2 border-slate-300 border-l border-slate-200 min-w-[70px] text-center ${isHeaderSticky ? 'sticky top-0 z-40' : ''}`}><span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">TOTAL</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {sortedOperations.map((op, idx) => {
                                    const assignedPosts = assignments[op.id] || [];
                                    const timeSec = toSec(op.time);
                                    const displayTime = assignedPosts.length > 0 ? Math.round(timeSec / assignedPosts.length) : Math.round(timeSec);
                                    
                                    let displayName = op.machineName;
                                    if (!displayName && op.machineId) {
                                        const m = machines.find(m => m.id === op.machineId);
                                        if (m) displayName = m.name;
                                    }
                                    if (!displayName) displayName = 'MAN';

                                    const groupStyle = op.groupId ? getGroupStyle(op.groupId) : null;
                                    const rowBgClass = (showGroupColors && groupStyle) ? groupStyle.bg : 'hover:bg-slate-50';
                                    const borderLeftStyle = (showGroupColors && groupStyle) ? `border-l-4 ${groupStyle.border}` : 'border-l border-slate-200';

                                    return (
                                        <tr key={op.id} className={`group transition-colors ${rowBgClass}`}>
                                            <td className={`py-1.5 px-2 border-r border-slate-300 ${groupStyle ? groupStyle.bg : 'bg-white'} group-hover:bg-slate-50 transition-colors border-b border-slate-200 ${isSticky ? 'sticky left-0 z-20 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.05)]' : ''} ${borderLeftStyle}`}>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-[9px] text-slate-400 font-bold w-6 text-center">{getDisplayIndex(sortedOperations, idx)}</span>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="font-bold text-slate-700 text-[11px] truncate max-w-[180px]" title={op.description}>{op.description}</span>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="text-[8px] font-bold px-1 rounded bg-slate-100 text-slate-500 uppercase">{displayName}</span>
                                                            <span className="text-[9px] font-bold text-emerald-600">{Math.round(timeSec)}s</span>
                                                            {op.groupId && (
                                                                <span className={`text-[8px] font-black px-1 rounded border flex items-center gap-0.5 ${groupStyle ? 'bg-white ' + groupStyle.text + ' border-transparent shadow-sm' : 'bg-indigo-100 text-indigo-700 border-indigo-200'}`}>
                                                                    <Link className="w-2 h-2" /> GRP
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            {postes.map((p, i) => {
                                                const isAssigned = assignedPosts.includes(p.id);
                                                const color = showColors ? getPosteColor(i) : NEUTRAL_COLOR;
                                                return (
                                                    <td 
                                                        key={p.id} 
                                                        onClick={() => toggleAssignment(op.id, p.id)} 
                                                        onContextMenu={(e) => handleContextMenu(e, p.id)}
                                                        className={`text-center p-0.5 border-r border-b border-slate-200 transition-colors relative ${isManual ? 'cursor-pointer hover:bg-indigo-50' : ''}`}
                                                    >
                                                        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-50 -z-10 group-hover:bg-slate-100"></div>
                                                        {isAssigned && (
                                                            <div className={`mx-auto min-w-[32px] px-1 py-0.5 rounded font-bold text-[10px] shadow-sm transform hover:scale-110 transition-transform cursor-default text-white`} style={{ backgroundColor: color.fill }}>
                                                                {displayTime}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="border-l border-b border-slate-200 bg-slate-50/20"></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className={`bg-slate-50 border-t-2 border-slate-300 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.05)] ${isHeaderSticky ? 'sticky bottom-0 z-30' : ''}`}>
                                <tr>
                                    <td className={`p-2 border-r border-b border-slate-200 bg-white/95 backdrop-blur ${isSticky ? 'sticky left-0 z-40' : ''}`}>
                                        <div className="flex flex-col items-start"><span className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-indigo-500" /> Saturation %</span></div>
                                    </td>
                                    {postes.map(p => {
                                        const saturation = Math.round(posteStats[p.id]?.saturation || 0);
                                        const isOver = saturation > 115;
                                        const isUnder = saturation < 75;
                                        let colorClass = "text-emerald-700 bg-emerald-100 border-emerald-200";
                                        if (isOver) colorClass = "text-rose-700 bg-rose-100 border-rose-200";
                                        else if (isUnder) colorClass = "text-amber-700 bg-amber-100 border-amber-200";
                                        return <td key={p.id} className="text-center px-1 py-2 border-r border-b border-slate-200 bg-white/50"><span className={`inline-block px-1.5 py-0.5 rounded border font-black text-[10px] ${colorClass}`}>{saturation}%</span></td>
                                    })}
                                    <td className="text-center px-1 py-2 border-l border-b border-slate-200 bg-white/50"><span className="text-[10px] text-slate-300">-</span></td>
                                </tr>
                                <tr>
                                    <td className={`p-2 border-r border-slate-200 bg-slate-50/95 backdrop-blur ${isSticky ? 'sticky left-0 z-40' : ''}`}>
                                        <div className="flex flex-col items-start"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Users className="w-3.5 h-3.5 text-slate-400" /> Effectif Requis</span></div>
                                    </td>
                                    {postes.map(p => {
                                        const nTheo = posteStats[p.id]?.nTheo || 0;
                                        const nReq = nTheo > 1.15 ? Math.ceil(nTheo) : (nTheo > 0 ? 1 : 0);
                                        return <td key={p.id} className="text-center px-1 py-2 border-r border-slate-200"><span className="font-mono font-bold text-slate-600 text-[10px]">{nReq}</span></td>
                                    })}
                                    <td className="text-center px-1 py-2 border-l border-slate-200 bg-emerald-50"><span className="font-black text-emerald-700 text-[11px]">{totalRequiredWorkers}</span></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Charts & Needs - Moved here to be visible in Matrix View too */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Charts Section */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 h-96">
                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Équilibrage & Saturation</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis yAxisId="left" orientation="left" stroke="#64748b" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Temps (s)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f8fafc' }} />
                                <ReferenceLine yAxisId="left" y={bfSeconds} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'BF', position: 'right', fill: '#ef4444', fontSize: 10 }} />
                                <Bar yAxisId="left" dataKey="time" radius={[4, 4, 0, 0]} barSize={40}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                                <Line yAxisId="right" type="monotone" dataKey="saturation" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Machine Requirements Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-96 flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2"><Cpu className="w-4 h-4 text-emerald-500" /> Besoin Matériel</h3>
                        </div>
                        <div className="overflow-auto flex-1 custom-scrollbar">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 sticky top-0 z-10">
                                    <tr>
                                        <th className="py-3 px-6">Machine</th>
                                        <th className="py-3 px-6 text-center">Opérations</th>
                                        <th className="py-3 px-6 text-center">Temps Total</th>
                                        <th className="py-3 px-6 text-center">N. Théorique</th>
                                        <th className="py-3 px-6 text-center">N. Requis</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                    {machineRequirements.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-3 px-6 font-bold text-slate-700">{row.name}</td>
                                            <td className="py-3 px-6 text-center">{row.opsCount}</td>
                                            <td className="py-3 px-6 text-center font-mono text-slate-500">{row.totalTime.toFixed(2)} min</td>
                                            <td className="py-3 px-6 text-center font-mono text-slate-500">{row.nTheo.toFixed(2)}</td>
                                            <td className="py-3 px-6 text-center"><span className="inline-block px-2 py-1 bg-emerald-100 text-emerald-700 rounded font-bold">{row.nReq}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
           </div>
       ) : (
           <div className="space-y-6">
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {postes.map((p, index) => {
                      const ops = operations.filter(op => (assignments[op.id] || []).includes(p.id));
                      const stat = posteStats[p.id] || { time: 0, saturation: 0, nTheo: 0 };
                      const color = showColors ? getPosteColor(index) : NEUTRAL_COLOR;
                      
                      return (
                        <div key={p.id} onContextMenu={(e) => handleContextMenu(e, p.id)} className={`bg-white rounded-xl border ${color.border} shadow-sm p-3 relative group hover:shadow-md transition-all`}>
                           {/* Card content */}
                           <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${color.badge} ${color.badgeText}`}>{p.name.replace('P','')}</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">{p.machine}</span>
                              </div>
                              {p.timeOverride !== undefined && <div className="w-2 h-2 rounded-full bg-purple-500" title="Temps Forcé" />}
                           </div>
                           
                           <div className="space-y-1 mb-3 min-h-[60px]">
                              {ops.length > 0 ? (
                                ops.slice(0, 3).map((op, i) => (
                                  <div key={i} className="text-[10px] text-slate-600 truncate" title={op.description}>
                                    {op.description}
                                  </div>
                                ))
                              ) : (
                                <div className="text-[10px] text-slate-300 italic">Aucune opération</div>
                              )}
                              {ops.length > 3 && <div className="text-[9px] text-slate-400 italic">... +{ops.length - 3} autres</div>}
                           </div>

                           <div className="flex items-end justify-between pt-2 border-t border-slate-100">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-slate-400 font-bold uppercase">Temps</span>
                                <span className={`text-sm font-bold ${color.text}`}>{Math.round(stat.time * 60)}s</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[9px] text-slate-400 font-bold uppercase">Sat.</span>
                                <span className={`text-xs font-black ${stat.saturation > 100 ? 'text-rose-500' : 'text-emerald-500'}`}>{Math.round(stat.saturation)}%</span>
                              </div>
                           </div>
                           
                           <div className="absolute bottom-0 left-0 h-1 bg-slate-100 w-full rounded-b-xl overflow-hidden">
                              <div className={`h-full ${stat.saturation > 100 ? 'bg-rose-500' : color.fill}`} style={{ width: `${Math.min(stat.saturation, 100)}%` }}></div>
                           </div>
                        </div>
                      );
                  })}
               </div>
               
               {/* Charts & Tables duplicated for Postes view for consistency if needed, but per request keeping Matrix view updated mostly */}
           </div>
       )}

       {/* INSERT POST MODAL */}
       {showInsertModal && createPortal(
           <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowInsertModal(false)} />
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <ListPlus className="w-5 h-5 text-indigo-500" />
                            Insérer un Poste
                        </h3>
                        <button onClick={() => setShowInsertModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                    
                    <form onSubmit={handleInsertSubmit} className="p-6 space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Machine</label>
                            <div className="relative">
                                <select 
                                    value={insertData.machine}
                                    onChange={(e) => setInsertData({...insertData, machine: e.target.value})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 appearance-none"
                                >
                                    <option value="MAN">MANUEL (MAN)</option>
                                    <option value="CONTROLE">CONTROLE</option>
                                    <option value="FINITION">FINITION</option>
                                    <option value="FER">REPASSAGE (FER)</option>
                                    {machines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Opération / Description</label>
                            <input 
                                type="text"
                                required
                                placeholder="Ex: Assemblage côtés..."
                                value={insertData.description}
                                onChange={(e) => setInsertData({...insertData, description: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 placeholder:text-slate-300"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Longueur (cm)</label>
                                <input 
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={insertData.length || ''}
                                    onChange={(e) => setInsertData({...insertData, length: Number(e.target.value)})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 text-center"
                                />
                            </div>
                            <div className="flex items-end pb-1">
                                <div className="text-[10px] text-slate-400 leading-tight">
                                    <Calculator className="w-3 h-3 inline mr-1" />
                                    Le temps sera calculé automatiquement basé sur la machine.
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] mt-2">
                            Insérer et Calculer
                        </button>
                    </form>
                </div>
           </div>,
           document.body
       )}

       {/* CONTEXT MENU PORTAL */}
       {contextMenu && contextMenu.visible && createPortal(
           <div 
               className="absolute z-[9999] bg-white border border-slate-200 rounded-xl shadow-2xl py-1 w-56 text-xs font-medium text-slate-700 animate-in fade-in zoom-in-95 duration-100 origin-top-left overflow-hidden ring-4 ring-slate-100/50"
               style={{ top: contextMenu.y, left: contextMenu.x }}
               onClick={(e) => e.stopPropagation()} 
           >
               {/* Manual Toggle */}
               <button onClick={() => handleContextAction('toggleManual')} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-2 font-bold text-indigo-600 border-b border-slate-100">
                   {isManual ? <Hand className="w-3.5 h-3.5" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                   {isManual ? 'Désactiver Mode Manuel' : 'Activer Mode Manuel'}
               </button>

               <button onClick={() => handleContextAction('insert')} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2"><Plus className="w-3.5 h-3.5" /> Insérer Poste</button>
               <button onClick={() => handleContextAction('duplicate')} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2"><CopyPlus className="w-3.5 h-3.5" /> Dupliquer</button>
               <button onClick={() => handleContextAction('copy')} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2"><Copy className="w-3.5 h-3.5" /> Copier</button>
               <button onClick={() => handleContextAction('cut')} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2"><Scissors className="w-3.5 h-3.5" /> Couper</button>
               <button onClick={() => handleContextAction('paste')} disabled={!clipboard} className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 ${!clipboard ? 'opacity-50 cursor-not-allowed' : ''}`}><Clipboard className="w-3.5 h-3.5" /> Coller</button>
               <div className="h-px bg-slate-100 my-1"></div>
               <button onClick={() => handleContextAction('clear')} className="w-full text-left px-4 py-2 hover:bg-amber-50 text-amber-600 flex items-center gap-2"><Eraser className="w-3.5 h-3.5" /> Vider</button>
               <button onClick={() => handleContextAction('delete')} className="w-full text-left px-4 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Supprimer</button>
           </div>,
           document.body
       )}
    </div>
  );
}
