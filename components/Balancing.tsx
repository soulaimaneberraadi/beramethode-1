
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Operation, Poste, Machine, FicheData } from '../types';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';
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
  ListPlus,
  Split,
  Combine
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
  Cell
} from 'recharts';
import { ResponsiveChart } from './ui/ResponsiveChart';

const SAM_MAJORATION = 1.20;

// --- RÈGLES D'ÉQUILIBRAGE (méthode) ---
// Saturation visée par poste : proche du takt (BF = 100%), plafonnée à ce seuil MÊME si la
// Tolérance d'affichage est réglée plus haut. Un poste au-delà est un goulot : on le scinde
// au lieu de l'accepter. C'est ce qui empêche les postes à 151% / 167%.
const AUTO_BALANCE_TARGET_CEIL = 1.15;
// Plafond absolu, toléré uniquement quand l'effectif est insuffisant (cram contrôlé, jamais 167%).
const AUTO_BALANCE_HARD_CEIL = 1.30;

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
  ficheData: FicheData;
  setFicheData: React.Dispatch<React.SetStateAction<FicheData>>;
}

// --- GROUP COLOR PALETTE (Matched with Gamme - High Contrast Alternating) ---
const GROUP_COLORS = [
  { bg: 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20', border: 'border-indigo-500', text: 'text-indigo-700 dark:text-dk-accent-text' }, // Cool
  { bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-500', text: 'text-orange-700' }, // Warm
  { bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-500', text: 'text-emerald-700' }, // Cool
  { bg: 'bg-rose-50 dark:bg-rose-900/30', border: 'border-rose-500', text: 'text-rose-700' },       // Warm
  { bg: 'bg-cyan-50 dark:bg-cyan-900/30', border: 'border-cyan-500', text: 'text-cyan-700' },       // Cool
  { bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-500', text: 'text-amber-700' },    // Warm
  { bg: 'bg-violet-50', border: 'border-violet-500', text: 'text-violet-700' }, // Cool
  { bg: 'bg-lime-50 dark:bg-lime-900/30', border: 'border-lime-500', text: 'text-lime-700' },       // Warm
  { bg: 'bg-fuchsia-50', border: 'border-fuchsia-500', text: 'text-fuchsia-700' }, // Cool
  { bg: 'bg-teal-50 dark:bg-teal-900/30', border: 'border-teal-500', text: 'text-teal-700' },       // Warm/Cool
  { bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-500', text: 'text-red-700' },          // Warm
  { bg: 'bg-sky-50 dark:bg-sky-900/30', border: 'border-sky-500', text: 'text-sky-700' },          // Cool
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
  { name: 'indigo',  bg: 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20',  border: 'border-indigo-200',  text: 'text-indigo-700 dark:text-dk-accent-text',  badge: 'bg-indigo-100',  fill: '#6366f1', badgeText: 'text-indigo-800' },
  { name: 'orange',  bg: 'bg-orange-50 dark:bg-orange-900/30',  border: 'border-orange-200',  text: 'text-orange-700',  badge: 'bg-orange-100',  fill: '#f97316', badgeText: 'text-orange-800' },
  { name: 'emerald', bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100', fill: '#10b981', badgeText: 'text-emerald-800' },
  { name: 'rose',    bg: 'bg-rose-50 dark:bg-rose-900/30',    border: 'border-rose-200',    text: 'text-rose-700',    badge: 'bg-rose-100',    fill: '#f43f5e', badgeText: 'text-rose-800' },
  { name: 'cyan',    bg: 'bg-cyan-50 dark:bg-cyan-900/30',    border: 'border-cyan-200',    text: 'text-cyan-700',    badge: 'bg-cyan-100',    fill: '#06b6d4', badgeText: 'text-cyan-800' },
  { name: 'amber',   bg: 'bg-amber-50 dark:bg-amber-900/30',   border: 'border-amber-200',   text: 'text-amber-700',   badge: 'bg-amber-100',   fill: '#f59e0b', badgeText: 'text-amber-800' },
  { name: 'violet',  bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  badge: 'bg-violet-100',  fill: '#8b5cf6', badgeText: 'text-violet-800' },
  { name: 'lime',    bg: 'bg-lime-50 dark:bg-lime-900/30',    border: 'border-lime-200',    text: 'text-lime-700',    badge: 'bg-lime-100',    fill: '#84cc16', badgeText: 'text-lime-800' },
  { name: 'fuchsia', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', badge: 'bg-fuchsia-100', fill: '#d946ef', badgeText: 'text-fuchsia-800' },
  { name: 'teal',    bg: 'bg-teal-50 dark:bg-teal-900/30',    border: 'border-teal-200',    text: 'text-teal-700',    badge: 'bg-teal-100',    fill: '#14b8a6', badgeText: 'text-teal-800' },
  { name: 'red',     bg: 'bg-red-50 dark:bg-red-900/30',     border: 'border-red-200',     text: 'text-red-700',     badge: 'bg-red-100',     fill: '#ef4444', badgeText: 'text-red-800' },
  { name: 'sky',     bg: 'bg-sky-50 dark:bg-sky-900/30',     border: 'border-sky-200',     text: 'text-sky-700',     badge: 'bg-sky-100',     fill: '#0ea5e9', badgeText: 'text-sky-800' },
];

const NEUTRAL_COLOR = { 
  name: 'neutral',  
  bg: 'bg-slate-50 dark:bg-dk-bg',  
  border: 'border-slate-200 dark:border-dk-border',  
  text: 'text-slate-700 dark:text-dk-text-soft',  
  badge: 'bg-slate-100 dark:bg-dk-elevated',  
  fill: '#64748b', 
  badgeText: 'text-slate-800 dark:text-dk-text' 
};

const getStatusColor = (saturation: number, tolerance = 115) => {
    if (saturation > tolerance) return { 
        name: 'overload', 
        bg: 'bg-rose-50 dark:bg-rose-900/30', 
        border: 'border-rose-200', 
        text: 'text-rose-700', 
        badge: 'bg-rose-100',
        fill: '#f43f5e',
        badgeText: 'text-rose-800'
    };
    if (saturation < 75 && saturation > 0) return { 
        name: 'underload', 
        bg: 'bg-amber-50 dark:bg-amber-900/30', 
        border: 'border-amber-200', 
        text: 'text-amber-700', 
        badge: 'bg-amber-100',
        fill: '#fbbf24',
        badgeText: 'text-amber-800'
    };
    return { 
        name: 'good', 
        bg: 'bg-white dark:bg-dk-surface',
        border: 'border-emerald-200', 
        text: 'text-emerald-700', 
        badge: 'bg-emerald-50 dark:bg-emerald-900/30',
        fill: '#10b981',
        badgeText: 'text-emerald-800'
    };
};

const getDefaultPosteColorName = (index: number) => POSTE_COLORS[index % POSTE_COLORS.length].name;

const getPosteColor = (poste: Poste, index: number) => {
  if (poste.colorName) {
    const existingColor = POSTE_COLORS.find(color => color.name === poste.colorName);
    if (existingColor) return existingColor;
  }
  return POSTE_COLORS[index % POSTE_COLORS.length];
};

const calculatePostRequirements = (
    postes: Poste[],
    posteStats: Record<string, { nTheo: number }>,
    targetNumWorkers: number,
    toleranceRatio: number
): Record<string, number> => {
    const requirements: Record<string, number> = {};
    
    postes.forEach(p => {
        const nTheo = posteStats[p.id]?.nTheo || 0;
        requirements[p.id] = nTheo > 0 ? Math.max(1, Math.ceil(nTheo / toleranceRatio)) : 0;
    });

    return requirements;
};

const splitPostOperations = (ops: Operation[], nReq: number): Operation[][] => {
    const splits: Operation[][] = Array.from({ length: nReq }, () => []);
    if (ops.length === 0) return splits;
    if (nReq <= 1) {
        splits[0] = ops;
        return splits;
    }

    const totalTime = ops.reduce((sum, op) => sum + (op.time || 0), 0);
    const targetTime = totalTime / nReq;

    let currentSplitIdx = 0;
    let currentSplitTime = 0;

    ops.forEach(op => {
        const opTime = op.time || 0;
        if (currentSplitIdx < nReq - 1 && currentSplitTime > 0 && (currentSplitTime + opTime / 2) > targetTime) {
            currentSplitIdx++;
            currentSplitTime = 0;
        }
        splits[currentSplitIdx].push(op);
        currentSplitTime += opTime;
    });

    return splits;
};

const splitPostesAndAssignments = (
    currPostes: Poste[],
    currAssignments: Record<string, string[]>,
    posteStats: Record<string, { nTheo: number }>,
    targetNumWorkers: number,
    toleranceRatio: number,
    sortedOps: Operation[]
) => {
    const postRequirements = calculatePostRequirements(currPostes, posteStats, targetNumWorkers, toleranceRatio);

    const newPostes: Poste[] = [];
    const newAssignments: Record<string, string[]> = {};

    sortedOps.forEach(op => {
        newAssignments[op.id] = [];
    });

    let newPostIdx = 1;

    currPostes.forEach(p => {
        const nReq = postRequirements[p.id] || 0;
        if (nReq <= 0) return;

        const postOps = sortedOps.filter(op => (currAssignments[op.id] || []).includes(p.id));

        if (nReq === 1 || postOps.length <= 1) {
            const newPosteId = `P${newPostIdx}`;
            const newPosteName = `P${newPostIdx}`;
            newPostes.push({
                ...p,
                id: newPosteId,
                name: newPosteName,
                originalId: p.id
            });
            postOps.forEach(op => {
                newAssignments[op.id].push(newPosteId);
            });
            newPostIdx++;
        } else {
            const splits = splitPostOperations(postOps, nReq);
            splits.forEach((splitOps, sIdx) => {
                if (splitOps.length === 0) return;

                const newPosteId = `P${newPostIdx}`;
                const newPosteName = `P${p.name.replace('P', '')}.${sIdx + 1}`;
                
                newPostes.push({
                    ...p,
                    id: newPosteId,
                    name: newPosteName,
                    originalId: p.id
                });

                splitOps.forEach(op => {
                    newAssignments[op.id].push(newPosteId);
                });
                newPostIdx++;
            });
        }
    });

    return { newPostes, newAssignments };
};


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
  machines,
  ficheData,
  setFicheData
}: BalancingProps) {

  const { lang } = useLang();

  const tolerance = ficheData?.toleranceSaturation ?? 115;
  const toleranceRatio = tolerance / 100;

  const roundedOperations = useMemo(() => {
    return operations.map(op => ({
      ...op,
      time: Math.round((op.time || 0) * 60) / 60
    }));
  }, [operations]);

  const calculateStats = (currAssignments: Record<string, string[]>, currPostes: Poste[]) => {
      const stats: Record<string, { time: number, nTheo: number, saturation: number }> = {};
      
      currPostes.forEach(p => {
          stats[p.id] = { time: p.timeOverride !== undefined ? p.timeOverride : 0, nTheo: 0, saturation: 0 };
      });

      roundedOperations.forEach(op => {
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
              const sam = stats[pid].time * SAM_MAJORATION;
              stats[pid].nTheo = sam / bf;
              stats[pid].saturation = (sam / bf) * 100;
          }
      });
      return stats;
  };

  const [isManual, setIsManual] = useState(false);
  const [viewMode, setViewMode] = useState<'grouped' | 'matrix'>('matrix');
  const [isSticky, setIsSticky] = useState(true); // Column Sticky
  const [isHeaderSticky, setIsHeaderSticky] = useState(true); // Row Header Sticky
  const [showColors, setShowColors] = useState(true); // Column Colors
  const [showGroupColors, setShowGroupColors] = useState(true); // Row Colors (Groups)

  // Section split summary (read-only insights when ops are tagged Préparation/Montage)
  const sectionStats = React.useMemo(() => {
      const acc = { PREPARATION: 0, MONTAGE: 0, GLOBAL: 0 };
      roundedOperations.forEach(o => { acc[o.section || 'GLOBAL'] += (o.time || 0); });
      const has = acc.PREPARATION > 0 || acc.MONTAGE > 0;
      const targetPH = (sam: number) => sam > 0 ? Math.round((numWorkers * efficiency * 60) / sam) : 0;
      return {
          has,
          prepSAM: acc.PREPARATION,
          montageSAM: acc.MONTAGE,
          globalSAM: acc.GLOBAL,
          prepPH: targetPH(acc.PREPARATION),
          montagePH: targetPH(acc.MONTAGE),
      };
  }, [roundedOperations, numWorkers, efficiency]);

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
      return [...roundedOperations].sort((a, b) => a.order - b.order);
  }, [roundedOperations]);

  const getCombinedMachineName = (ops: Operation[]) => {
      const machs = new Set<string>();
      ops.forEach(op => {
          let rawName = op.machineName;
          if (!rawName && op.machineId) {
              const foundM = machines.find(m => m.id === op.machineId);
              if (foundM) rawName = foundM.name;
          }
          if (!rawName) rawName = 'MAN';
          let m = rawName.trim().toUpperCase();
          if (m.includes('MANUEL')) m = 'MAN';
          machs.add(m);
      });
      if (machs.size > 1 && machs.has('MAN')) {
          machs.delete('MAN');
      }
      return Array.from(machs).sort().join('+');
  };

  const simulateRequiredWorkers = useCallback((testNumWorkers: number): number => {
      if (testNumWorkers <= 0) return 0;
      const tempsArticleVal = roundedOperations.reduce((sum, op) => sum + (op.time || 0), 0) * 1.20;
      const testBF = testNumWorkers > 0 ? tempsArticleVal / testNumWorkers : 0;
      if (testBF <= 0) return 0;

      // On vise le takt (BF), plafonné à un seuil sain indépendamment de la Tolérance d'affichage.
      const packRatio = Math.min(toleranceRatio, AUTO_BALANCE_TARGET_CEIL);
      const baseLimitMax = (testBF / SAM_MAJORATION) * packRatio;
      const hardLimitMax = (testBF / SAM_MAJORATION) * AUTO_BALANCE_HARD_CEIL;

      let adjustmentFactor = 1.0;
      let attempts = 0;
      const maxAttempts = 50;
      let finalRequired = 999;

      while (attempts < maxAttempts) {
          const limitMax = Math.min(baseLimitMax * adjustmentFactor, hardLimitMax);

          const simAssignments: Record<string, string[]> = {};
          const simPostes: { id: string, machine: string }[] = [];
          let currentPosteOps: Operation[] = [];
          let currentTotalTime = 0;
          let currentMachine = '';
          let posteIdx = 1;

          // Textile: 1 ouvrier = 1 machine. Jamais mélanger deux machines réelles (seul MAN absorbé).
          const relaxMachine = false;

          const flushSim = () => {
              if (currentPosteOps.length === 0) return;
              const posteId = `P${posteIdx}`;
              const postMachine = relaxMachine ? getCombinedMachineName(currentPosteOps) : (currentMachine || 'MAN');
              simPostes.push({ id: posteId, machine: postMachine });
              currentPosteOps.forEach(op => {
                  simAssignments[op.id] = [posteId];
              });
              posteIdx++;
              currentPosteOps = [];
              currentTotalTime = 0;
              currentMachine = '';
          };

          sortedOperations.forEach(op => {
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
              
              let isSameMachine = false;
              let nextMachine = currentMachine;

              if (relaxMachine) {
                  isSameMachine = true;
              } else {
                  if (currentPosteOps.length === 0) {
                      isSameMachine = true;
                      nextMachine = primaryMachine;
                  } else {
                      const cleanCurrent = (currentMachine || '').trim().toUpperCase();
                      const cleanPrimary = (primaryMachine || '').trim().toUpperCase();
                      
                      if (cleanCurrent === cleanPrimary) {
                          isSameMachine = true;
                          nextMachine = currentMachine;
                      } else if (cleanPrimary === 'MAN') {
                          isSameMachine = true;
                          nextMachine = currentMachine;
                      } else if (cleanCurrent === 'MAN') {
                          isSameMachine = true;
                          nextMachine = primaryMachine;
                      }
                  }
              }

              const fits = (currentTotalTime + blockTime) <= limitMax;

              if (isSameMachine && fits) {
                  currentPosteOps.push(op);
                  currentTotalTime += blockTime;
                  currentMachine = nextMachine;
              } else {
                  flushSim();
                  currentPosteOps = [op];
                  currentTotalTime = blockTime;
                  currentMachine = primaryMachine;
              }
          });
          flushSim();

          const stats: Record<string, { time: number }> = {};
          simPostes.forEach(p => {
              stats[p.id] = { time: 0 };
          });

          operations.forEach(op => {
              const assignedIds = simAssignments[op.id] || [];
              const count = assignedIds.length;
              if (count > 0) {
                  const timeShare = (op.time || 0) / count;
                  assignedIds.forEach(pid => {
                      if (stats[pid]) {
                          stats[pid].time += timeShare;
                      }
                  });
              }
          });

          let simTotalRequiredWorkers = 0;
          simPostes.forEach(p => {
              const time = stats[p.id]?.time || 0;
              const sam = time * SAM_MAJORATION;
              const nTheo = testBF > 0 ? sam / testBF : 0;
              const nReq = nTheo > 0 ? Math.max(1, Math.ceil(nTheo / toleranceRatio)) : 0;
              simTotalRequiredWorkers += nReq;
          });

          finalRequired = simTotalRequiredWorkers;

          if (simTotalRequiredWorkers <= testNumWorkers) {
              break;
          }

          adjustmentFactor += 0.01;
          attempts++;
      }

      return finalRequired;
  }, [operations, sortedOperations, efficiency, toleranceRatio, machines]);

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

  useEffect(() => {
    if (!postes.some((poste) => !poste.colorName)) return;
    setPostes((prev) =>
      prev.map((poste, index) => ({
        ...poste,
        colorName: poste.colorName || getDefaultPosteColorName(index),
      }))
    );
  }, [postes, setPostes]);

  // --- INITIALIZATION / AUTO-BALANCE ---
  const runAutoBalancing = (force = false) => {
    if (isManual && !force) return;

    const targetNumWorkers = numWorkers;
    const existingColorByName = new Map(
      postes
        .filter((p) => !!p.colorName)
        .map((p) => [p.name, p.colorName as string])
    );

    // Allow tolerance on cycle time
    const tempsArticleVal = roundedOperations.reduce((sum, op) => sum + (op.time || 0), 0) * 1.20;
    const targetBF = targetNumWorkers > 0 ? tempsArticleVal / targetNumWorkers : 0;
    // Remplissage vers le takt (BF), plafonné à un seuil sain même si Tolérance d'affichage élevée.
    const packRatio = Math.min(toleranceRatio, AUTO_BALANCE_TARGET_CEIL);
    const baseLimitMax = targetBF > 0 ? (targetBF / SAM_MAJORATION) * packRatio : Number.MAX_VALUE;
    const hardLimitMax = targetBF > 0 ? (targetBF / SAM_MAJORATION) * AUTO_BALANCE_HARD_CEIL : Number.MAX_VALUE;

    let adjustmentFactor = 1.0;
    let attempts = 0;
    const maxAttempts = 50;

    let finalAssignments: Record<string, string[]> = {};
    let finalPostes: Poste[] = [];

    while (attempts < maxAttempts) {
        const limitMax = Math.min(baseLimitMax * adjustmentFactor, hardLimitMax);
        const currentAssignments: Record<string, string[]> = {};
        const currentPostes: Poste[] = [];
        let currentPosteOps: Operation[] = [];
        let currentTotalTime = 0;
        let currentMachine = '';
        let posteIdx = 1;

        // Textile: 1 ouvrier = 1 machine. Pas de fusion automatique de deux machines réelles.
        const relaxMachine = false;

        const flush = () => {
            if (currentPosteOps.length === 0) return;
            
            const posteId = `P${posteIdx}`;
            const posteName = `P${posteIdx}`;
            const postMachine = relaxMachine ? getCombinedMachineName(currentPosteOps) : (currentMachine || 'MAN');

            currentPostes.push({ 
                id: posteId, 
                name: posteName, 
                machine: postMachine,
                colorName: existingColorByName.get(posteName) || getDefaultPosteColorName(posteIdx - 1)
            });
            
            currentPosteOps.forEach(op => {
                currentAssignments[op.id] = [posteId];
            });

            posteIdx++;
            currentPosteOps = [];
            currentTotalTime = 0;
            currentMachine = '';
        };

        sortedOperations.forEach(op => {
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
            
            let isSameMachine = false;
            let nextMachine = currentMachine;

            if (relaxMachine) {
                isSameMachine = true;
            } else {
                if (currentPosteOps.length === 0) {
                    isSameMachine = true;
                    nextMachine = primaryMachine;
                } else {
                    const cleanCurrent = (currentMachine || '').trim().toUpperCase();
                    const cleanPrimary = (primaryMachine || '').trim().toUpperCase();
                    
                    if (cleanCurrent === cleanPrimary) {
                        isSameMachine = true;
                        nextMachine = currentMachine;
                    } else if (cleanPrimary === 'MAN') {
                        isSameMachine = true;
                        nextMachine = currentMachine;
                    } else if (cleanCurrent === 'MAN') {
                        isSameMachine = true;
                        nextMachine = primaryMachine;
                    }
                }
            }

            const fits = (currentTotalTime + blockTime) <= limitMax;

            if (isSameMachine && fits) {
                currentPosteOps.push(op);
                currentTotalTime += blockTime;
                currentMachine = nextMachine;
            } else {
                flush();
                currentPosteOps = [op];
                currentTotalTime = blockTime;
                currentMachine = primaryMachine;
            }
        });
        flush();

        // Calculate stats for this iteration to get simulated required workers
        const stats: Record<string, { time: number }> = {};
        currentPostes.forEach(p => {
            stats[p.id] = { time: 0 };
        });

        roundedOperations.forEach(op => {
            const assignedIds = currentAssignments[op.id] || [];
            const count = assignedIds.length;
            if (count > 0) {
                const timeShare = (op.time || 0) / count;
                assignedIds.forEach(pid => {
                    if (stats[pid]) {
                        stats[pid].time += timeShare;
                    }
                });
            }
        });

        let simTotalRequiredWorkers = 0;
        currentPostes.forEach(p => {
            const time = stats[p.id]?.time || 0;
            const sam = time * SAM_MAJORATION;
            const nTheo = targetBF > 0 ? sam / targetBF : 0;
            const nReq = nTheo > 0 ? Math.max(1, Math.ceil(nTheo / toleranceRatio)) : 0;
            simTotalRequiredWorkers += nReq;
        });

        finalAssignments = currentAssignments;
        finalPostes = currentPostes;

        if (simTotalRequiredWorkers <= targetNumWorkers) {
            break;
        }

        adjustmentFactor += 0.01;
        attempts++;
    }

    const finalStats = calculateStats(finalAssignments, finalPostes);
    const { newPostes, newAssignments } = splitPostesAndAssignments(
        finalPostes,
        finalAssignments,
        finalStats,
        targetNumWorkers,
        toleranceRatio,
        sortedOperations
    );

    setPostes(newPostes);
    setAssignments(newAssignments);
  };

  useEffect(() => {
    if (!isManual) {
        runAutoBalancing();
    }
  }, [roundedOperations, bf, isManual, machines]);

  // Keep parent postes in sync with computed machine names when assignments change in manual mode
  useEffect(() => {
    if (!isManual) return;
    
    let changed = false;
    const nextPostes = postes.map(p => {
      const assignedOps = roundedOperations.filter(op => (assignments[op.id] || []).includes(p.id));
      const machinesSet = new Set<string>();
      assignedOps.forEach(op => {
          machinesSet.add(machineClassOf(op));
      });
      if (machinesSet.size > 1 && machinesSet.has('MAN')) {
          machinesSet.delete('MAN');
      }
      const machineName = Array.from(machinesSet).sort().join('+') || 'MAN';
      if (p.machine !== machineName) {
        changed = true;
      }
      return { ...p, machine: machineName };
    });

    if (changed) {
      setPostes(nextPostes);
    }
  }, [assignments, postes, roundedOperations, machines, isManual, setPostes]);

  // --- CONTEXT MENU HANDLERS ---
  const handleContextMenu = (e: React.MouseEvent, posteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.pageX, y: e.pageY, posteId });
  };

  // Normalise un nom de machine d'une opération (MANUEL -> MAN).
  const machineClassOf = (op: Operation): string => {
      let raw = op.machineName;
      if (!raw && op.machineId) {
          const m = machines.find(mm => mm.id === op.machineId);
          if (m) raw = m.name;
      }
      if (!raw) raw = 'MAN';
      let m = raw.trim().toUpperCase();
      if (m.includes('MANUEL')) m = 'MAN';
      return m;
  };

  const handleContextAction = (action: 'insert' | 'delete' | 'clear' | 'copy' | 'cut' | 'paste' | 'duplicate' | 'separate' | 'merge' | 'toggleManual') => {
      
      if (action === 'toggleManual') {
          const nextManual = !isManual;
          setIsManual(nextManual);
          if (!nextManual) {
              runAutoBalancing(true);
          }
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
                    description: tx(lang, {fr:'Nouvelle Opération',ar:'عملية جديدة',en:'New Operation',es:'Nueva Operación',pt:'Nova Operação',tr:'Yeni Operasyon'}),
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
                  name: 'P?',
                  colorName: currentPoste.colorName || getDefaultPosteColorName(idx + 1)
              };
              newPostes.splice(idx + 1, 0, newPoste);
              break;
          }
          case 'separate': {
              // Sépare un poste qui mélange plusieurs machines en un poste par machine.
              const target = newPostes[idx];
              const pid = target.id;
              const ops = sortedOperations.filter(op => (newAssignments[op.id] || []).includes(pid));

              const distinctNonMan = Array.from(new Set(ops.map(machineClassOf).filter(m => m !== 'MAN')));
              if (distinctNonMan.length <= 1) {
                  setContextMenu(null);
                  return;
              }

              // Groupe les ops par classe machine, dans l'ordre de séquence. Les ops MAN sont
              // rattachées à la machine qui les précède (réalité chaîne). Si une op MAN apparaît
              // avant toute machine réelle, elle rejoint la première machine de la séquence.
              const firstRealMachine = ops.map(machineClassOf).find(m => m !== 'MAN');
              const order: string[] = [];
              const groups: Record<string, Operation[]> = {};
              let lastRealMachine: string | undefined = undefined;
              ops.forEach(op => {
                  const raw = machineClassOf(op);
                  let key = raw;
                  if (raw === 'MAN') {
                      key = lastRealMachine || firstRealMachine || 'MAN';
                  } else {
                      lastRealMachine = raw;
                  }
                  if (!(key in groups)) { groups[key] = []; order.push(key); }
                  groups[key].push(op);
              });

              const replacements: Poste[] = order.map((key, k) => ({
                  ...target,
                  id: `P_${Date.now()}_${k}`,
                  machine: key,
                  colorName: undefined, // Reset color so they alternate based on column index
                  originalId: undefined,
                  timeOverride: undefined,
              }));
              const keyToId: Record<string, string> = {};
              order.forEach((key, k) => { keyToId[key] = replacements[k].id; });

              ops.forEach(op => {
                  newAssignments[op.id] = (newAssignments[op.id] || []).filter(id => id !== pid);
                  newAssignments[op.id].push(keyToId[machineClassOf(op)]);
              });

              newPostes.splice(idx, 1, ...replacements);
              break;
          }
          case 'merge': {
              // Fusionne ce poste avec son voisin (suivant, sinon précédent).
              if (newPostes.length < 2) {
                  setContextMenu(null);
                  return;
              }
              const neighbor = idx + 1 < newPostes.length ? idx + 1 : idx - 1;
              const survivorIdx = Math.min(idx, neighbor);
              const removedIdx = Math.max(idx, neighbor);
              const survivorId = newPostes[survivorIdx].id;
              const removedId = newPostes[removedIdx].id;

              Object.keys(newAssignments).forEach(opId => {
                  const arr = newAssignments[opId] || [];
                  if (arr.includes(removedId)) {
                      newAssignments[opId] = arr.filter(id => id !== removedId);
                      if (!newAssignments[opId].includes(survivorId)) {
                          newAssignments[opId].push(survivorId);
                      }
                  }
              });

              newPostes.splice(removedIdx, 1);
              const survivorOps = sortedOperations.filter(op => (newAssignments[op.id] || []).includes(survivorId));
              newPostes[survivorIdx] = {
                  ...newPostes[survivorIdx],
                  machine: getCombinedMachineName(survivorOps),
                  timeOverride: undefined,
              };
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
                      name: 'P?',
                      colorName: clipboard.poste.colorName || getDefaultPosteColorName(idx + 1)
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

      newPostes = newPostes.map((p, i) => ({
          ...p,
          name: `P${i + 1}`,
          colorName: p.colorName || getDefaultPosteColorName(i)
      }));
      
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
          operatorName: '',
          colorName: getDefaultPosteColorName(insertIndex)
      };

      const newPostes = [...postes];
      newPostes.splice(insertIndex, 0, newPoste);
      const reindexedPostes = newPostes.map((p, i) => ({
          ...p,
          name: `P${i + 1}`,
          colorName: p.colorName || getDefaultPosteColorName(i)
      }));
      
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
              description: insertData.description || tx(lang,{fr:'Opération (Insérée)',ar:'عملية (مدرجة)',en:'Operation (Inserted)',es:'Operación (Insertada)',pt:'Operação (Inserida)',tr:'Operasyon (Eklendi)'}),
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
  const posteStats = useMemo(() => calculateStats(assignments, postes), [roundedOperations, assignments, postes, bf]);

  const postRequirements = useMemo(() => {
    return calculatePostRequirements(postes, posteStats, numWorkers, toleranceRatio);
  }, [postes, posteStats, numWorkers, toleranceRatio]);

  const totalMinReq = useMemo(() => {
    let total = 0;
    postes.forEach(p => {
      const stat = posteStats[p.id];
      const nTheo = stat?.nTheo || 0;
      const req = nTheo > 0 ? Math.max(1, Math.ceil(nTheo / toleranceRatio)) : 0;
      total += req;
    });
    return total;
  }, [postes, posteStats, toleranceRatio]);
  
  const tempsArticle = roundedOperations.reduce((sum, op) => sum + (op.time || 0), 0) * 1.20;
  
  // --- CHART DATA PREP ---
  const chartData = useMemo(() => {
    const virtualPoints: any[] = [];
    postes.forEach((p, index) => {
        const stat = posteStats[p.id] || { time: 0, saturation: 0, nTheo: 0 };
        const nReq = postRequirements[p.id] || 0;
        const saturationPerWorker = nReq > 0 ? stat.saturation / nReq : stat.saturation;
        
        let colorFill = '';
        if (showColors) {
            colorFill = getPosteColor(p, index).fill;
        } else {
            const statusColor = getStatusColor(saturationPerWorker, tolerance);
            colorFill = statusColor.fill;
        }
        
        if (nReq > 1) {
            const timePerWorker = (stat.time / nReq);
            const satPerWorker = ((timePerWorker * SAM_MAJORATION) / bf) * 100;
            if (!showColors) colorFill = getStatusColor(satPerWorker, tolerance).fill;

            for (let i = 1; i <= nReq; i++) {
                virtualPoints.push({
                    name: `${p.name.replace('P', '')}.${i}`,
                    fullId: p.name,
                    parentId: p.id,
                    time: Number((timePerWorker * 60).toFixed(2)),
                    saturation: Math.round(satPerWorker),
                    nTheo: Number((stat.nTheo / nReq).toFixed(2)),
                    machine: p.machine,
                    fill: colorFill 
                });
            }
        } else {
            virtualPoints.push({
                name: p.name.replace('P', ''),
                fullId: p.name,
                parentId: (p as any).originalId || p.id,
                time: Number((stat.time * 60).toFixed(2)),
                saturation: Math.round(saturationPerWorker),
                nTheo: Number(stat.nTheo.toFixed(2)),
                machine: p.machine,
                fill: colorFill
            });
        }
    });

    for (let i = 0; i < virtualPoints.length; i++) {
        const current = virtualPoints[i];
        const prev = virtualPoints[i - 1];
        const next = virtualPoints[i + 1];

        const leftDashed = prev && prev.parentId && prev.parentId === current.parentId;
        const rightDashed = next && next.parentId && next.parentId === current.parentId;

        if (leftDashed && rightDashed) {
            current.satSolid = null;
            current.satDashed = current.saturation;
        } else if (leftDashed && !rightDashed) {
            current.satSolid = current.saturation;
            current.satDashed = current.saturation;
        } else if (!leftDashed && rightDashed) {
            current.satSolid = current.saturation;
            current.satDashed = current.saturation;
        } else {
            current.satSolid = current.saturation;
            current.satDashed = null;
        }
    }

    return virtualPoints;
  }, [postes, posteStats, bf, showColors, tolerance, postRequirements]);

  const totalRequiredWorkers = useMemo(() => {
    return postes.reduce((sum, p) => sum + (postRequirements[p.id] || 0), 0);
  }, [postes, postRequirements]);



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
        const nTheo = bf > 0 ? (stats.time * SAM_MAJORATION) / bf : 0;
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
    <div className="space-y-4 sm:space-y-6 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
       
       {/* 1. SINGLE ROW HEADER - RESPONSIVE */}
       <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm mb-4 p-2 flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar">
            {/* OUVRIERS / HEURES */}
            <div className="flex items-center gap-2 px-2 py-1 sm:px-3 sm:py-1.5 bg-slate-50 dark:bg-dk-bg rounded-lg border border-slate-100 dark:border-dk-border shrink-0">
                <div className="flex flex-col items-center border-r border-slate-200 dark:border-dk-border pr-3 mr-3">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'Ouvriers',ar:'العمال',en:'Workers',es:'Obreros',pt:'Trabalhadores',tr:'İşçiler'})}</span>
                    <input 
                        type="number" 
                        min="1" 
                        value={Math.round(numWorkers)} 
                        onChange={(e) => setNumWorkers(Math.max(1, Math.round(Number(e.target.value))))} 
                        className="w-12 text-center bg-transparent font-black text-slate-700 dark:text-dk-text-soft outline-none text-sm p-0" 
                    />
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'Heures',ar:'ساعات',en:'Hours',es:'Horas',pt:'Horas',tr:'Saatler'})}</span>
                    <input 
                        type="number" 
                        min="0" 
                        step="0.5" 
                        value={presenceTime / 60} 
                        onChange={(e) => setPresenceTime(Math.max(0, Number(e.target.value)) * 60)} 
                        className="w-10 text-center bg-transparent font-black text-slate-700 dark:text-dk-text-soft outline-none text-sm p-0" 
                    />
                </div>
            </div>

            {/* BF / MIN TOTALES */}
            <div className="flex items-center gap-2 px-2 py-1 sm:px-3 sm:py-1.5 bg-emerald-50 dark:bg-emerald-900/30/50 rounded-lg border border-emerald-100 shrink-0">
                <div className="flex flex-col items-center border-r border-emerald-100 pr-3 mr-3">
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-1"><Zap className="w-3 h-3" /> BF (s)</span>
                    <span className="font-black text-emerald-700 text-sm">{(bf * 60).toFixed(1)}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">{tx(lang,{fr:'Min Tot.',ar:'إجمالي الدقائق',en:'Tot Min',es:'Min Tot',pt:'Min Total',tr:'Top Dak'})}</span>
                    <span className="font-black text-emerald-700 text-sm">{presenceTime}</span>
                </div>
            </div>

            {/* P/H 100% */}
            <div className="flex flex-col items-center px-3 py-1.5 bg-orange-50 dark:bg-orange-900/30/50 rounded-lg border border-orange-100 shrink-0">
                <span className="text-[9px] font-bold text-orange-400 uppercase">{tx(lang,{fr:'P/H (100%)',ar:'ق/س (100%)',en:'P/H (100%)',es:'P/H (100%)',pt:'P/H (100%)',tr:'A/S (100%)'})}</span>
                <span className="font-black text-orange-500 text-sm leading-none mt-1">
                    {tempsArticle > 0 ? Math.round((presenceTime * numWorkers) / tempsArticle / (presenceTime / 60)) : 0}
                </span>
            </div>

            {/* TARGETS */}
            <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 dark:bg-dk-bg/50 rounded-lg border border-slate-100 dark:border-dk-border shrink-0">
                <div className="flex flex-col items-center border-r border-slate-200 dark:border-dk-border pr-3 mr-1">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'P/J',ar:'ق/ي',en:'P/D',es:'P/D',pt:'P/D',tr:'A/G'})}</span>
                    <span className="font-black text-slate-700 dark:text-dk-text-soft text-sm leading-none mt-1">
                        {tempsArticle > 0 ? Math.round(((presenceTime * numWorkers) / tempsArticle) * (efficiency / 100)) : 0}
                    </span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'P/H',ar:'ق/س',en:'P/H',es:'P/H',pt:'P/H',tr:'A/S'})}</span>
                    <span className="font-black text-slate-700 dark:text-dk-text-soft text-sm leading-none mt-1">
                        {tempsArticle > 0 ? Math.round(((presenceTime * numWorkers) / tempsArticle / (presenceTime / 60)) * (efficiency / 100)) : 0}
                    </span>
                </div>
            </div>

            {/* RENDU */}
            <div className="flex flex-col items-center px-2 py-1 sm:px-3 sm:py-1.5 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/50 rounded-lg border border-indigo-100 shrink-0">
                <span className="text-[9px] font-bold text-indigo-400 uppercase">{tx(lang,{fr:'% Rendu',ar:'% الإنتاجية',en:'% Yield',es:'% Rendimiento',pt:'% Rendimento',tr:'% Verim'})}</span>
                <div className="flex items-baseline gap-0.5">
                    <input 
                        type="number" 
                        min="1" max="100" 
                        value={efficiency} 
                        onChange={(e) => setEfficiency(Math.max(1, Math.min(100, Number(e.target.value))))} 
                        className="w-8 text-center bg-transparent font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text outline-none text-sm border-b border-indigo-200 p-0" 
                    />
                    <span className="text-[10px] font-bold text-indigo-400">%</span>
                </div>
            </div>

            {/* TOLÉRANCE SATURATION */}
            <div className="flex flex-col items-center px-2 py-1 sm:px-3 sm:py-1.5 bg-rose-50 dark:bg-rose-900/30/50 rounded-lg border border-rose-100 shrink-0">
                <span className="text-[9px] font-bold text-rose-400 uppercase">{tx(lang,{fr:'Tolérance',ar:'التسامح',en:'Tolerance',es:'Tolerancia',pt:'Tolerância',tr:'Tolerans'})}</span>
                <div className="flex items-baseline gap-0.5">
                    <input 
                        type="number" 
                        min="50" max="200" 
                        value={tolerance || ''} 
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                                setFicheData(prev => ({ ...prev, toleranceSaturation: 0 }));
                                return;
                            }
                            setFicheData(prev => ({ ...prev, toleranceSaturation: Number(val) }));
                        }}
                        onBlur={() => {
                            setFicheData(prev => ({ 
                                ...prev, 
                                toleranceSaturation: Math.max(50, Math.min(200, prev.toleranceSaturation || 115)) 
                            }));
                        }}
                        className="w-10 text-center bg-transparent font-black text-rose-600 dark:text-rose-400 outline-none text-sm border-b border-rose-200 p-0" 
                    />
                    <span className="text-[10px] font-bold text-rose-400">%</span>
                </div>
            </div>

            {/* T. ARTICLE (Right aligned or flexed) */}
            <div className="ml-auto px-4 py-1.5 bg-purple-100 rounded-lg border border-purple-200 flex flex-col items-end shrink-0">
                <span className="text-[9px] font-bold text-purple-500 uppercase flex items-center gap-1"><Timer className="w-3 h-3" /> {tx(lang,{fr:'T. Article',ar:'وقت القطعة',en:'Art. Time',es:'T. Prenda',pt:'T. Peça',tr:'Parça Süresi'})}</span>
                <span className="font-black text-purple-700 text-xl leading-none">{tempsArticle.toFixed(2)}</span>
            </div>
       </div>
      
      {sectionStats.has && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 mx-2 bg-gradient-to-r from-blue-50 to-emerald-50 rounded-xl border border-slate-200 dark:border-dk-border">
          <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'Sections',ar:'الأقسام',en:'Sections',es:'Secciones',pt:'Seções',tr:'Bölümler'})}</span>
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-lg">
            <span className="text-[10px] font-bold uppercase">{tx(lang,{fr:'Préparation',ar:'تحضير',en:'Preparation',es:'Preparación',pt:'Preparação',tr:'Hazırlık'})}</span>
            <span className="text-xs font-black">SAM {sectionStats.prepSAM.toFixed(2)} min</span>
            <span className="text-xs font-black">P/H {sectionStats.prepPH}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg">
            <span className="text-[10px] font-bold uppercase">{tx(lang,{fr:'Montage',ar:'تجميع',en:'Assembly',es:'Montaje',pt:'Montagem',tr:'Montaj'})}</span>
            <span className="text-xs font-black">SAM {sectionStats.montageSAM.toFixed(2)} min</span>
            <span className="text-xs font-black">P/H {sectionStats.montagePH}</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-dk-muted italic">{tx(lang,{fr:'Bilan informatif — équilibrage actuel sur opérations sélectionnées',ar:'موجز إعلامي — التوازن الحالي على العمليات المحددة',en:'Informative summary — current balancing on selected operations',es:'Resumen informativo — equilibrio actual sobre operaciones seleccionadas',pt:'Resumo informativo — balanceamento atual nas operações selecionadas',tr:'Bilgilendirici özet — seçilen operasyonlarda mevcut dengeleme'})}</span>
        </div>
      )}

      {/* 2. CONTROLS (VIEW SWITCHER + ACTIONS) */}
      <div className="flex flex-col sm:flex-row justify-between items-end gap-3 px-2">
         <div className="flex bg-slate-100/80 p-1 rounded-xl shadow-inner border border-slate-200 dark:border-dk-border">
             <button onClick={() => setViewMode('grouped')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'grouped' ? 'bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text-soft shadow-sm ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                <LayoutList className="w-4 h-4" /> {tx(lang,{fr:'Vue Par Poste',ar:'عرض حسب المحطة',en:'View By Station',es:'Vista Por Puesto',pt:'Vista Por Posto',tr:'İstasyon Görünümü'})}
             </button>
             <button onClick={() => setViewMode('matrix')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'matrix' ? 'bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text-soft shadow-sm ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                <TableProperties className="w-4 h-4" /> {tx(lang,{fr:'Matrice',ar:'مصفوفة',en:'Matrix',es:'Matriz',pt:'Matriz',tr:'Matris'})}
             </button>
         </div>

         <div className="flex items-center gap-2">
            <button
                onClick={() => setIsHeaderSticky(!isHeaderSticky)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${isHeaderSticky ? 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 border-indigo-200 text-indigo-700 dark:text-dk-accent-text ring-1 ring-indigo-100' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}
                title={isHeaderSticky ? tx(lang,{fr:"En-tête figé",ar:'رأس ثابت',en:'Header Frozen',es:'Cabecera fijada',pt:'Cabeçalho fixo',tr:'Başlık Sabitlendi'}) : tx(lang,{fr:"Figer l'en-tête",ar:'تثبيت الرأس',en:'Freeze Header',es:'Fijar cabecera',pt:'Fixar cabeçalho',tr:'Başlığı Sabitle'})}
            >
                <PanelTop className="w-4 h-4" />
            </button>
            <button 
                onClick={() => setShowGroupColors(!showGroupColors)} 
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${showGroupColors ? 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 border-indigo-200 text-indigo-700 dark:text-dk-accent-text ring-1 ring-indigo-100' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`} 
                title={showGroupColors ? tx(lang,{fr:"Masquer couleurs groupes",ar:'إخفاء ألوان المجموعات',en:'Hide Group Colors',es:'Ocultar colores grupos',pt:'Ocultar cores grupos',tr:'Grup Renklerini Gizle'}) : tx(lang,{fr:"Afficher couleurs groupes",ar:'إظهار ألوان المجموعات',en:'Show Group Colors',es:'Mostrar colores grupos',pt:'Mostrar cores grupos',tr:'Grup Renklerini Göster'})}
            >
                <Link className="w-4 h-4" />
            </button>
            <button onClick={() => setShowColors(!showColors)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${showColors ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 text-purple-700 ring-1 ring-purple-100' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`} title={showColors ? tx(lang,{fr:"Désactiver les couleurs",ar:'تعطيل الألوان',en:'Disable Colors',es:'Desactivar colores',pt:'Desativar cores',tr:'Renkleri Devre Dışı Bırak'}) : tx(lang,{fr:"Activer les couleurs",ar:'تفعيل الألوان',en:'Enable Colors',es:'Activar colores',pt:'Ativar cores',tr:'Renkleri Etkinleştir'})}>
                <Palette className="w-4 h-4" />
            </button>
            <button 
                onClick={() => {
                    const nextManual = !isManual;
                    setIsManual(nextManual);
                    if (!nextManual) {
                        runAutoBalancing(true);
                    }
                }} 
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${isManual ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 text-amber-700 ring-2 ring-amber-100' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}
            >
                {isManual ? <MousePointer2 className="w-3.5 h-3.5" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                {isManual ? tx(lang,{fr:'Mode Manuel Actif',ar:'الوضع اليدوي نشط',en:'Manual Mode Active',es:'Modo Manual Activo',pt:'Modo Manual Ativo',tr:'Manuel Mod Aktif'}) : tx(lang,{fr:'Mode Automatique',ar:'الوضع التلقائي',en:'Automatic Mode',es:'Modo Automático',pt:'Modo Automático',tr:'Otomatik Mod'})}
            </button>
            <button onClick={() => runAutoBalancing(true)} className="px-4 py-2 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-slate-400 dark:text-dk-muted rounded-xl hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-2 text-xs font-bold" title={tx(lang,{fr:'Recalculer',ar:'إعادة حساب',en:'Recalculate',es:'Recalcular',pt:'Recalcular',tr:'Yeniden Hesapla'})}>
                <RefreshCw className="w-3.5 h-3.5" />
            </button>
         </div>
      </div>

       {/* 3. MAIN CONTENT (CONDITIONAL VIEW) */}
       {viewMode === 'matrix' ? (
           <div className="flex flex-col gap-6">
                <div className="bg-white dark:bg-dk-surface rounded-[1rem] border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden h-[450px] sm:h-[600px]">
                    <div className="overflow-auto w-full h-full relative custom-scrollbar pb-2">
                        <table className="text-left border-collapse border-spacing-0 min-w-full">
                            <thead className={`${isHeaderSticky ? 'sticky top-0 z-30' : ''} bg-white dark:bg-dk-surface shadow-sm`}>
                                <tr className="bg-slate-50 dark:bg-dk-bg">
                                    <th className={`py-2 px-2 border-b-2 border-slate-300 border-r border-slate-300 min-w-[130px] sm:min-w-[200px] ${isSticky ? 'sticky left-0 z-50 bg-slate-50 dark:bg-dk-bg shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)]' : 'z-40'}`}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-slate-600 dark:text-dk-text-soft uppercase tracking-widest truncate">{tx(lang,{fr:'Séquence Opératoire',ar:'التسلسل التشغيلي',en:'Operating Sequence',es:'Secuencia Operativa',pt:'Sequência Operatória',tr:'Operasyon Sırası'})}</span>
                                            <button onClick={() => setIsSticky(!isSticky)} className={`p-1 rounded-md transition-colors ${isSticky ? 'bg-indigo-100 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text' : 'text-slate-400 dark:text-dk-muted hover:bg-slate-200'}`} title={isSticky ? tx(lang,{fr:"Détacher la colonne",ar:'فصل العمود',en:'Detach Column',es:'Despegar columna',pt:'Desanexar coluna',tr:'Sütunu Ayır'}) : tx(lang,{fr:"Figer la colonne",ar:'تثبيت العمود',en:'Freeze Column',es:'Fijar columna',pt:'Fixar coluna',tr:'Sütunu Sabitle'})}>
                                            {isSticky ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
                                            </button>
                                        </div>
                                    </th>
                                    {postes.map((p, i) => {
                                        const color = showColors ? getPosteColor(p, i) : NEUTRAL_COLOR;
                                        const hasOverride = p.timeOverride !== undefined;
                                        const isMixed = (p.machine || '').includes('+');
                                        return (
                                            <th
                                                key={p.id}
                                                onContextMenu={(e) => handleContextMenu(e, p.id)}
                                                className={`py-2 px-1 text-center min-w-[70px] ${color.bg} border-b-2 ${color.border} border-r border-slate-300 relative cursor-context-menu`}
                                            >
                                                {hasOverride && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-purple-500" title={tx(lang,{fr:'Temps Forcé',ar:'وقت إجباري',en:'Forced Time',es:'Tiempo Forzado',pt:'Tempo Forçado',tr:'Zorunlu Süre'})}></div>}
                                                {isMixed && <div className="absolute top-1 left-1 text-amber-500" title={tx(lang,{fr:'Poste multi-machines — clic droit → Séparer par machine',ar:'محطة متعددة الآلات — زر أيمن → فصل حسب الآلة',en:'Multi-machine station — right click → Separate by machine',es:'Puesto multi-máquinas — clic derecho → Separar por máquina',pt:'Posto multi-máquinas — clique direito → Separar por máquina',tr:'Çoklu makine istasyonu — sağ tık → Makineye göre ayır'})}><AlertCircle className="w-3 h-3" /></div>}
                                                <div className="flex flex-col items-center justify-center gap-1 pointer-events-none">
                                                    <span className={`inline-block px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold bg-white dark:bg-dk-surface border ${color.border} ${color.text} uppercase truncate max-w-[65px]`}>{p.machine}</span>
                                                    <div className={`flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs shadow-sm bg-white dark:bg-dk-surface border ${color.border} ${color.text}`}>{p.name.replace('P','')}</div>
                                                </div>
                                            </th>
                                        );
                                    })}
                                    <th className={`py-2 px-2 bg-slate-50 dark:bg-dk-bg border-b-2 border-slate-300 border-l border-slate-200 dark:border-dk-border min-w-[70px] text-center ${isHeaderSticky ? 'sticky top-0 z-40' : ''}`}><span className="text-[10px] font-black text-slate-600 dark:text-dk-text-soft uppercase tracking-widest">{tx(lang,{fr:'TOTAL',ar:'المجموع',en:'TOTAL',es:'TOTAL',pt:'TOTAL',tr:'TOPLAM'})}</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-dk-border">
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
                                    const rowBgClass = (showGroupColors && groupStyle) ? groupStyle.bg : 'hover:bg-slate-50 dark:hover:bg-dk-elevated/60';
                                    const borderLeftStyle = (showGroupColors && groupStyle) ? `border-l-4 ${groupStyle.border}` : 'border-l border-slate-200 dark:border-dk-border';

                                    return (
                                        <tr key={op.id} className={`group transition-colors ${rowBgClass}`}>
                                            <td className={`py-1.5 px-2 border-r border-slate-300 min-w-[130px] sm:min-w-[200px] ${groupStyle ? groupStyle.bg : 'bg-white dark:bg-dk-surface'} group-hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors border-b border-slate-200 dark:border-dk-border ${isSticky ? 'sticky left-0 z-20 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.05)]' : ''} ${borderLeftStyle}`}>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-[9px] text-slate-400 dark:text-dk-muted font-bold w-6 text-center">{getDisplayIndex(sortedOperations, idx)}</span>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="font-bold text-slate-700 dark:text-dk-text-soft text-[11px] truncate max-w-[90px] sm:max-w-[180px]" title={op.description}>{op.description}</span>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="text-[8px] font-bold px-1 rounded bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted uppercase">{displayName}</span>
                                                            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">{Math.round(timeSec)}s</span>
                                                            {op.groupId && (
                                                                <span className={`text-[8px] font-black px-1 rounded border flex items-center gap-0.5 ${groupStyle ? 'bg-white dark:bg-dk-surface ' + groupStyle.text + ' border-transparent shadow-sm' : 'bg-indigo-100 text-indigo-700 dark:text-dk-accent-text border-indigo-200'}`}>
                                                                    <Link className="w-2 h-2" /> GRP
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            {postes.map((p, i) => {
                                                const isAssigned = assignedPosts.includes(p.id);
                                                const color = showColors ? getPosteColor(p, i) : NEUTRAL_COLOR;
                                                return (
                                                    <td 
                                                        key={p.id} 
                                                        onClick={() => toggleAssignment(op.id, p.id)} 
                                                        onContextMenu={(e) => handleContextMenu(e, p.id)}
                                                        className={`text-center p-0.5 border-r border-b border-slate-200 dark:border-dk-border transition-colors relative ${isManual ? 'cursor-pointer hover:bg-indigo-50 dark:bg-dk-accent/20' : ''}`}
                                                    >
                                                        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-50 dark:bg-dk-bg -z-10 group-hover:bg-slate-100"></div>
                                                        {isAssigned && (
                                                            <div className={`mx-auto min-w-[32px] px-1 py-0.5 rounded font-bold text-[10px] shadow-sm transform hover:scale-110 transition-transform cursor-default text-white`} style={{ backgroundColor: color.fill }}>
                                                                {displayTime}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="border-l border-b border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/20"></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className={`bg-slate-50 dark:bg-dk-bg border-t-2 border-slate-300 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.05)] ${isHeaderSticky ? 'sticky bottom-0 z-30' : ''}`}>
                                <tr>
                                    <td className={`p-2 border-r border-b border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface/95 backdrop-blur ${isSticky ? 'sticky left-0 z-40' : ''}`}>
                                        <div className="flex flex-col items-start"><span className="text-[10px] font-black text-slate-700 dark:text-dk-text-soft uppercase tracking-widest flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-indigo-500" /> {tx(lang,{fr:'Saturation %',ar:'% التشبع',en:'Saturation %',es:'Saturación %',pt:'Saturação %',tr:'Doygunluk %'})}</span></div>
                                    </td>
                                    {postes.map(p => {
                                        const stat = posteStats[p.id];
                                        const nReq = postRequirements[p.id] || 0;
                                        const rawSaturation = stat?.saturation || 0;
                                        const saturation = nReq > 0 ? Math.round(rawSaturation / nReq) : 0;
                                        const isOver = saturation > tolerance;
                                        const isUnder = saturation < 75;
                                        let colorClass = "text-emerald-700 bg-emerald-100 border-emerald-200";
                                        if (isOver) colorClass = "text-rose-700 bg-rose-100 border-rose-200";
                                        else if (isUnder) colorClass = "text-amber-700 bg-amber-100 border-amber-200";
                                        return <td key={p.id} className="text-center px-1 py-2 border-r border-b border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface/50"><span className={`inline-block px-1.5 py-0.5 rounded border font-black text-[10px] ${colorClass}`}>{saturation}%</span></td>
                                    })}
                                    <td className="text-center px-1 py-2 border-l border-b border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface/50"><span className="text-[10px] text-slate-300 dark:text-dk-muted">-</span></td>
                                </tr>
                                <tr>
                                    <td className={`p-2 border-r border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/95 backdrop-blur ${isSticky ? 'sticky left-0 z-40' : ''}`}>
                                        <div className="flex flex-col items-start"><span className="text-[10px] font-black text-slate-500 dark:text-dk-muted uppercase tracking-widest flex items-center gap-2"><Users className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted" /> {tx(lang,{fr:'Effectif Requis',ar:'العدد المطلوب',en:'Required Staff',es:'Personal Requerido',pt:'Efetivo Necessário',tr:'Gerekli Personel'})}</span></div>
                                    </td>
                                    {postes.map(p => {
                                        const nReq = postRequirements[p.id] || 0;
                                        return <td key={p.id} className="text-center px-1 py-2 border-r border-slate-200 dark:border-dk-border"><span className="font-mono font-bold text-slate-600 dark:text-dk-text-soft text-[10px]">{nReq}</span></td>
                                    })}
                                    <td className="text-center px-1 py-2 border-l border-slate-200 dark:border-dk-border bg-emerald-50 dark:bg-emerald-900/30"><span className="font-black text-emerald-700 text-[11px]">{totalRequiredWorkers}</span></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* TOLÉRANCE CONTROLLER BELOW TABLE */}
                <div className="flex flex-wrap items-center gap-3 mt-2 mb-2">
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm w-fit">
                        <span className="text-xs font-black text-slate-500 dark:text-dk-muted uppercase tracking-wider flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-indigo-500" /> {tx(lang,{fr:'Tolérance Saturation :',ar:'تسامح التشبع :',en:'Saturation Tolerance :',es:'Tolerancia de Saturación :',pt:'Tolerância de Saturação :',tr:'Doygunluk Toleransı :'})}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs bg-rose-50 dark:bg-rose-900/30 text-rose-700 px-2 py-0.5 rounded-lg border border-rose-200 shadow-sm">
                            <input 
                                type="number" 
                                min="50" max="200" 
                                value={tolerance || ''} 
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '') {
                                        setFicheData(prev => ({ ...prev, toleranceSaturation: 0 }));
                                        return;
                                    }
                                    setFicheData(prev => ({ ...prev, toleranceSaturation: Number(val) }));
                                }}
                                onBlur={() => {
                                    setFicheData(prev => ({ 
                                        ...prev, 
                                        toleranceSaturation: Math.max(50, Math.min(200, prev.toleranceSaturation || 115)) 
                                    }));
                                }}
                                className="w-10 text-center bg-transparent font-black text-rose-700 outline-none p-0 border-b border-rose-300" 
                            />
                            <span className="font-bold">%</span>
                        </div>
                        {tolerance > AUTO_BALANCE_TARGET_CEIL * 100 && (
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1" title={tx(lang,{fr:`L'équilibrage automatique ne remplit jamais un poste au-delà de ${AUTO_BALANCE_TARGET_CEIL * 100}% (règle anti-goulot). La Tolérance ne sert qu'à l'affichage des couleurs.`,ar:`التوازن التلقائي لا يملأ محطة أبدًا بأكثر من ${AUTO_BALANCE_TARGET_CEIL * 100}% (قاعدة منع الاختناق). التسامح يستخدم فقط لعرض الألوان.`,en:`Auto-balancing never fills a station beyond ${AUTO_BALANCE_TARGET_CEIL * 100}% (anti-bottleneck rule). Tolerance only affects color display.`,es:`El equilibrio automático nunca llena un puesto más allá del ${AUTO_BALANCE_TARGET_CEIL * 100}% (regla anti-cuello de botella). La tolerancia solo afecta la visualización de colores.`,pt:`O balanceamento automático nunca preenche um posto além de ${AUTO_BALANCE_TARGET_CEIL * 100}% (regra anti-gargalo). A tolerância só afeta a exibição de cores.`,tr:`Otomatik dengeleme bir istasyonu asla ${AUTO_BALANCE_TARGET_CEIL * 100}%'nin ötesine doldurmaz (darboğaz önleme kuralı). Tolerans yalnızca renk görüntülemesini etkiler.`})}>
                                <AlertCircle className="w-3 h-3" /> {tx(lang,{fr:`Équilibrage plafonné à ${Math.round(AUTO_BALANCE_TARGET_CEIL * 100)}% (anti-goulot)`,ar:`التوازن محدود بـ ${Math.round(AUTO_BALANCE_TARGET_CEIL * 100)}% (منع الاختناق)`,en:`Balancing capped at ${Math.round(AUTO_BALANCE_TARGET_CEIL * 100)}% (anti-bottleneck)`,es:`Equilibrio limitado al ${Math.round(AUTO_BALANCE_TARGET_CEIL * 100)}% (anti-cuello de botella)`,pt:`Balanceamento limitado a ${Math.round(AUTO_BALANCE_TARGET_CEIL * 100)}% (anti-gargalo)`,tr:`Dengeleme ${Math.round(AUTO_BALANCE_TARGET_CEIL * 100)}% ile sınırlı (darboğaz önleme)`})}
                            </span>
                        )}
                    </div>

                    {numWorkers < totalMinReq && (
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 rounded-xl shadow-sm text-xs text-rose-700 font-bold animate-in fade-in slide-in-from-left-2 duration-300">
                            <AlertCircle className="w-4 h-4 text-rose-500 animate-pulse" />
                            <span>{tx(lang,{fr:`Effectif insuffisant pour respecter la tolérance (Requis : ${totalMinReq} ouvriers)`,ar:`عدد غير كافٍ لاحترام التسامح (المطلوب: ${totalMinReq} عمال)`,en:`Insufficient staff to meet tolerance (Required: ${totalMinReq} workers)`,es:`Personal insuficiente para cumplir tolerancia (Requerido: ${totalMinReq} obreros)`,pt:`Efetivo insuficiente para respeitar a tolerância (Necessário: ${totalMinReq} trabalhadores)`,tr:`Toleransı karşılamak için yetersiz personel (Gerekli: ${totalMinReq} işçi)`})}</span>
                            <button 
                                onClick={() => setNumWorkers(totalMinReq)}
                                className="ml-2 bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-black transition-all hover:scale-105 active:scale-95 shadow-sm animate-bounce"
                            >
                                {tx(lang,{fr:`Ajuster à ${totalMinReq}`,ar:`ضبط إلى ${totalMinReq}`,en:`Adjust to ${totalMinReq}`,es:`Ajustar a ${totalMinReq}`,pt:`Ajustar para ${totalMinReq}`,tr:`${totalMinReq} olarak ayarla`})}
                            </button>
                        </div>
                    )}
                </div>

                {/* Charts & Needs - Moved here to be visible in Matrix View too */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
                    {/* Charts Section */}
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm p-3 sm:p-4 h-80 sm:h-96">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-dk-text-soft mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> {tx(lang,{fr:'Équilibrage & Saturation',ar:'التوازن والتشبع',en:'Balancing & Saturation',es:'Equilibrio y Saturación',pt:'Balanceamento e Saturação',tr:'Dengeleme ve Doygunluk'})}</h3>
                        <ResponsiveChart>
                            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={45} />
                                <YAxis yAxisId="left" orientation="left" stroke="#64748b" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: tx(lang,{fr:'Temps (s)',ar:'الوقت (ث)',en:'Time (s)',es:'Tiempo (s)',pt:'Tempo (s)',tr:'Süre (s)'}), angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f8fafc' }} />
                                <ReferenceLine yAxisId="left" y={bfSeconds} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'BF', position: 'right', fill: '#ef4444', fontSize: 10 }} />
                                <Bar yAxisId="left" dataKey="time" radius={[4, 4, 0, 0]} barSize={40} isAnimationActive={false}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                                <Line yAxisId="right" type="monotone" dataKey="saturation" stroke="none" dot={{ r: 3, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
                                <Line yAxisId="right" type="monotone" dataKey="satSolid" stroke="#6366f1" strokeWidth={2} connectNulls={false} dot={false} isAnimationActive={false} />
                                <Line yAxisId="right" type="monotone" dataKey="satDashed" stroke="#6366f1" strokeWidth={2} strokeDasharray="3 3" connectNulls={false} dot={false} isAnimationActive={false} />
                            </ComposedChart>
                        </ResponsiveChart>
                    </div>

                    {/* Machine Requirements Table */}
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden h-80 sm:h-96 flex flex-col">
                        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between shrink-0">
                            <h3 className="font-bold text-slate-700 dark:text-dk-text-soft flex items-center gap-2"><Cpu className="w-4 h-4 text-emerald-500" /> {tx(lang,{fr:'Besoin Matériel',ar:'الاحتياج من المعدات',en:'Equipment Need',es:'Necesidad de Equipo',pt:'Necessidade de Equipamento',tr:'Ekipman İhtiyacı'})}</h3>
                        </div>
                        <div className="overflow-auto flex-1 custom-scrollbar">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-dk-bg text-[10px] uppercase font-bold text-slate-500 dark:text-dk-muted sticky top-0 z-10">
                                    <tr>
                                        <th className="py-2 sm:py-3 px-2 sm:px-6">{tx(lang,{fr:'Machine',ar:'آلة',en:'Machine',es:'Máquina',pt:'Máquina',tr:'Makine'})}</th>
                                        <th className="py-2 sm:py-3 px-2 sm:px-6 text-center">{tx(lang,{fr:'Opérations',ar:'العمليات',en:'Operations',es:'Operaciones',pt:'Operações',tr:'Operasyonlar'})}</th>
                                        <th className="py-2 sm:py-3 px-2 sm:px-6 text-center">{tx(lang,{fr:'Temps Total',ar:'الوقت الإجمالي',en:'Total Time',es:'Tiempo Total',pt:'Tempo Total',tr:'Toplam Süre'})}</th>
                                        <th className="py-2 sm:py-3 px-2 sm:px-6 text-center">{tx(lang,{fr:'N. Théorique',ar:'العدد النظري',en:'Theoretical N.',es:'N. Teórico',pt:'N. Teórico',tr:'Teorik S.'})}</th>
                                        <th className="py-2 sm:py-3 px-2 sm:px-6 text-center">{tx(lang,{fr:'N. Requis',ar:'العدد المطلوب',en:'Required N.',es:'N. Requerido',pt:'N. Necessário',tr:'Gerekli S.'})}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                    {machineRequirements.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                                            <td className="py-2 sm:py-3 px-2 sm:px-6 font-bold text-slate-700 dark:text-dk-text-soft">{row.name}</td>
                                            <td className="py-2 sm:py-3 px-2 sm:px-6 text-center">{row.opsCount}</td>
                                            <td className="py-2 sm:py-3 px-2 sm:px-6 text-center font-mono text-slate-500 dark:text-dk-muted">{row.totalTime.toFixed(2)} min</td>
                                            <td className="py-2 sm:py-3 px-2 sm:px-6 text-center font-mono text-slate-500 dark:text-dk-muted">{row.nTheo.toFixed(2)}</td>
                                            <td className="py-2 sm:py-3 px-2 sm:px-6 text-center"><span className="inline-block px-2 py-1 bg-emerald-100 text-emerald-700 rounded font-bold">{row.nReq}</span></td>
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
                      const ops = roundedOperations.filter(op => (assignments[op.id] || []).includes(p.id));
                      const stat = posteStats[p.id] || { time: 0, saturation: 0, nTheo: 0 };
                      const nReq = postRequirements[p.id] || 0;
                      const saturation = nReq > 0 ? Math.round(stat.saturation / nReq) : 0;
                      const color = showColors ? getPosteColor(p, index) : NEUTRAL_COLOR;
                      
                      return (
                        <div key={p.id} onContextMenu={(e) => handleContextMenu(e, p.id)} className={`bg-white dark:bg-dk-surface rounded-xl border ${color.border} shadow-sm p-3 relative group hover:shadow-md transition-all`}>
                           {/* Card content */}
                           <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${color.badge} ${color.badgeText}`}>{p.name.replace('P','')}</span>
                                <span className="text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase">{p.machine}</span>
                              </div>
                              {p.timeOverride !== undefined && <div className="w-2 h-2 rounded-full bg-purple-500" title={tx(lang,{fr:'Temps Forcé',ar:'وقت إجباري',en:'Forced Time',es:'Tiempo Forzado',pt:'Tempo Forçado',tr:'Zorunlu Süre'})} />}
                           </div>
                           
                           <div className="space-y-1 mb-3 min-h-[60px]">
                              {ops.length > 0 ? (
                                ops.slice(0, 3).map((op, i) => (
                                  <div key={i} className="text-[10px] text-slate-600 dark:text-dk-text-soft truncate" title={op.description}>
                                    {op.description}
                                  </div>
                                ))
                              ) : (
                                <div className="text-[10px] text-slate-300 dark:text-dk-muted italic">{tx(lang,{fr:'Aucune opération',ar:'لا توجد عملية',en:'No operation',es:'Sin operación',pt:'Nenhuma operação',tr:'Operasyon yok'})}</div>
                              )}
                              {ops.length > 3 && <div className="text-[9px] text-slate-400 dark:text-dk-muted italic">{tx(lang,{fr:`... +${ops.length - 3} autres`,ar:`... +${ops.length - 3} أخرى`,en:`... +${ops.length - 3} more`,es:`... +${ops.length - 3} más`,pt:`... +${ops.length - 3} mais`,tr:`... +${ops.length - 3} daha`})}</div>}
                           </div>

                           <div className="flex items-end justify-between pt-2 border-t border-slate-100 dark:border-dk-border">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-slate-400 dark:text-dk-muted font-bold uppercase">{tx(lang,{fr:'Temps',ar:'الوقت',en:'Time',es:'Tiempo',pt:'Tempo',tr:'Süre'})}</span>
                                <span className={`text-sm font-bold ${color.text}`}>{Math.round(stat.time * 60)}s</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[9px] text-slate-400 dark:text-dk-muted font-bold uppercase">{tx(lang,{fr:'Sat.',ar:'تشبع',en:'Sat.',es:'Sat.',pt:'Sat.',tr:'Doy.'})}</span>
                                <span className={`text-xs font-black ${saturation > tolerance ? 'text-rose-500' : 'text-emerald-500'}`}>{saturation}%</span>
                              </div>
                           </div>
                           
                           <div className="absolute bottom-0 left-0 h-1 bg-slate-100 dark:bg-dk-elevated w-full rounded-b-xl overflow-hidden">
                              <div className={`h-full ${saturation > tolerance ? 'bg-rose-500' : color.fill}`} style={{ width: `${Math.min(saturation, 100)}%` }}></div>
                           </div>
                        </div>
                      );
                  })}
               </div>
           </div>
       )}

       {/* INSERT POST MODAL */}
       {showInsertModal && createPortal(
           <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowInsertModal(false)} />
                <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl w-full max-w-sm relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border flex justify-between items-center bg-white dark:bg-dk-surface">
                        <h3 className="font-bold text-slate-800 dark:text-dk-text flex items-center gap-2">
                            <ListPlus className="w-5 h-5 text-indigo-500" />
                            {tx(lang,{fr:'Insérer un Poste',ar:'إضافة محطة',en:'Insert Station',es:'Insertar Puesto',pt:'Inserir Posto',tr:'İstasyon Ekle'})}
                        </h3>
                        <button onClick={() => setShowInsertModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                    
                    <form onSubmit={handleInsertSubmit} className="p-6 space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Machine',ar:'آلة',en:'Machine',es:'Máquina',pt:'Máquina',tr:'Makine'})}</label>
                            <div className="relative">
                                <select 
                                    value={insertData.machine}
                                    onChange={(e) => setInsertData({...insertData, machine: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-dk-text-soft outline-none focus:border-indigo-500 appearance-none"
                                >
                                    <option value="MAN">{tx(lang,{fr:'MANUEL (MAN)',ar:'يدوي (MAN)',en:'MANUAL (MAN)',es:'MANUAL (MAN)',pt:'MANUAL (MAN)',tr:'MANUEL (MAN)'})}</option>
                                    <option value="CONTROLE">{tx(lang,{fr:'CONTRÔLE',ar:'مراقبة',en:'INSPECTION',es:'INSPECCIÓN',pt:'INSPEÇÃO',tr:'KONTROL'})}</option>
                                    <option value="FINITION">{tx(lang,{fr:'FINITION',ar:'تشطيب',en:'FINISHING',es:'ACABADO',pt:'ACABAMENTO',tr:'BİTİŞ'})}</option>
                                    <option value="FER">{tx(lang,{fr:'REPASSAGE (FER)',ar:'كي (FER)',en:'IRONING (FER)',es:'PLANCHADO (FER)',pt:'ENGOMAR (FER)',tr:'ÜTÜLEME (FER)'})}</option>
                                    {machines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-dk-muted">▼</div>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Opération / Description',ar:'العملية / الوصف',en:'Operation / Description',es:'Operación / Descripción',pt:'Operação / Descrição',tr:'Operasyon / Tanım'})}</label>
                            <input 
                                type="text"
                                required
                                placeholder={tx(lang,{fr:'Ex: Assemblage côtés...',ar:'مثال: تجميع الجوانب...',en:'Ex: Side assembly...',es:'Ej: Ensamblaje laterales...',pt:'Ex: Montagem laterais...',tr:'Örn: Yan montaj...'})}
                                value={insertData.description}
                                onChange={(e) => setInsertData({...insertData, description: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-dk-text-soft outline-none focus:border-indigo-500 placeholder:text-slate-300"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Longueur (cm)',ar:'الطول (سم)',en:'Length (cm)',es:'Longitud (cm)',pt:'Comprimento (cm)',tr:'Uzunluk (cm)'})}</label>
                                <input 
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={insertData.length || ''}
                                    onChange={(e) => setInsertData({...insertData, length: Number(e.target.value)})}
                                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 dark:text-dk-text-soft outline-none focus:border-indigo-500 text-center"
                                />
                            </div>
                            <div className="flex items-end pb-1">
                                <div className="text-[10px] text-slate-400 dark:text-dk-muted leading-tight">
                                    <Calculator className="w-3 h-3 inline mr-1" />
                                    {tx(lang,{fr:'Le temps sera calculé automatiquement basé sur la machine.',ar:'سيتم حساب الوقت تلقائيًا بناءً على الآلة.',en:'Time will be calculated automatically based on the machine.',es:'El tiempo se calculará automáticamente según la máquina.',pt:'O tempo será calculado automaticamente com base na máquina.',tr:'Süre, makineye göre otomatik olarak hesaplanacaktır.'})}
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="w-full py-3 bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] mt-2">
                            {tx(lang,{fr:'Insérer et Calculer',ar:'إدراج وحساب',en:'Insert & Calculate',es:'Insertar y Calcular',pt:'Inserir e Calcular',tr:'Ekle ve Hesapla'})}
                        </button>
                    </form>
                </div>
           </div>,
           document.body
       )}

       {/* CONTEXT MENU PORTAL */}
       {contextMenu && contextMenu.visible && createPortal(
           <div 
               className="absolute z-[9999] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl shadow-2xl py-1 w-56 text-xs font-medium text-slate-700 dark:text-dk-text-soft animate-in fade-in zoom-in-95 duration-100 origin-top-left overflow-hidden ring-4 ring-slate-100/50"
               style={{ top: contextMenu.y, left: contextMenu.x }}
               onClick={(e) => e.stopPropagation()} 
           >
               {/* Manual Toggle */}
               <button onClick={() => handleContextAction('toggleManual')} className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-2 font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text border-b border-slate-100 dark:border-dk-border">
                   {isManual ? <Hand className="w-3.5 h-3.5" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                    {isManual ? tx(lang,{fr:'Désactiver Mode Manuel',ar:'تعطيل الوضع اليدوي',en:'Disable Manual Mode',es:'Desactivar Modo Manual',pt:'Desativar Modo Manual',tr:'Manuel Modu Devre Dışı Bırak'}) : tx(lang,{fr:'Activer Mode Manuel',ar:'تفعيل الوضع اليدوي',en:'Enable Manual Mode',es:'Activar Modo Manual',pt:'Ativar Modo Manual',tr:'Manuel Modu Etkinleştir'})}
               </button>

               {(() => {
                   const ctxOps = contextMenu.posteId ? sortedOperations.filter(op => (assignments[op.id] || []).includes(contextMenu.posteId!)) : [];
                   const ctxDistinctMachines = Array.from(new Set(ctxOps.map(machineClassOf).filter(m => m !== 'MAN')));
                   const canSeparate = ctxDistinctMachines.length > 1;
                   const canMerge = postes.length > 1;
                   return (
                       <>
                            <button onClick={() => canSeparate && handleContextAction('separate')} disabled={!canSeparate} title={canSeparate ? tx(lang,{fr:`Séparer en ${ctxDistinctMachines.length} postes (${ctxDistinctMachines.join(', ')})`,ar:`الفصل إلى ${ctxDistinctMachines.length} محطات (${ctxDistinctMachines.join(', ')})`,en:`Split into ${ctxDistinctMachines.length} stations (${ctxDistinctMachines.join(', ')})`,es:`Separar en ${ctxDistinctMachines.length} puestos (${ctxDistinctMachines.join(', ')})`,pt:`Separar em ${ctxDistinctMachines.length} postos (${ctxDistinctMachines.join(', ')})`,tr:`${ctxDistinctMachines.length} istasyona ayır (${ctxDistinctMachines.join(', ')})`}) : tx(lang,{fr:'Poste à une seule machine — rien à séparer',ar:'محطة بآلة واحدة — لا شيء للفصل',en:'Single-machine station — nothing to separate',es:'Puesto de una sola máquina — nada que separar',pt:'Posto de máquina única — nada a separar',tr:'Tek makine istasyonu — ayrılacak bir şey yok'})} className={`w-full text-left px-4 py-2 flex items-center gap-2 font-semibold ${canSeparate ? 'hover:bg-emerald-50 text-emerald-700' : 'opacity-40 cursor-not-allowed text-slate-400 dark:text-dk-muted'}`}><Split className="w-3.5 h-3.5" /> {tx(lang,{fr:'Séparer par machine',ar:'فصل حسب الآلة',en:'Separate by machine',es:'Separar por máquina',pt:'Separar por máquina',tr:'Makineye göre ayır'})}{canSeparate ? ` (${ctxDistinctMachines.length})` : ''}</button>
                            <button onClick={() => canMerge && handleContextAction('merge')} disabled={!canMerge} title={canMerge ? tx(lang,{fr:'Fusionner avec le poste voisin',ar:'دمج مع المحطة المجاورة',en:'Merge with neighboring station',es:'Fusionar con el puesto vecino',pt:'Fundir com o posto vizinho',tr:'Komşu istasyonla birleştir'}) : tx(lang,{fr:'Un seul poste — rien à fusionner',ar:'محطة واحدة — لا شيء للدمج',en:'Single station — nothing to merge',es:'Un solo puesto — nada que fusionar',pt:'Posto único — nada a fundir',tr:'Tek istasyon — birleştirilecek bir şey yok'})} className={`w-full text-left px-4 py-2 flex items-center gap-2 font-semibold ${canMerge ? 'hover:bg-emerald-50 text-emerald-700' : 'opacity-40 cursor-not-allowed text-slate-400 dark:text-dk-muted'}`}><Combine className="w-3.5 h-3.5" /> {tx(lang,{fr:'Fusionner (voisin)',ar:'دمج (مجاور)',en:'Merge (neighbor)',es:'Fusionar (vecino)',pt:'Fundir (vizinho)',tr:'Birleştir (komşu)'})}</button>
                       </>
                   );
               })()}
               <div className="h-px bg-slate-100 dark:bg-dk-elevated my-1"></div>

                <button onClick={() => handleContextAction('insert')} className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-2"><Plus className="w-3.5 h-3.5" /> {tx(lang,{fr:'Insérer Poste',ar:'إدراج محطة',en:'Insert Station',es:'Insertar Puesto',pt:'Inserir Posto',tr:'İstasyon Ekle'})}</button>
                <button onClick={() => handleContextAction('duplicate')} className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-2"><CopyPlus className="w-3.5 h-3.5" /> {tx(lang,{fr:'Dupliquer',ar:'نسخ مكرر',en:'Duplicate',es:'Duplicar',pt:'Duplicar',tr:'Çoğalt'})}</button>
                <button onClick={() => handleContextAction('copy')} className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-2"><Copy className="w-3.5 h-3.5" /> {tx(lang,{fr:'Copier',ar:'نسخ',en:'Copy',es:'Copiar',pt:'Copiar',tr:'Kopyala'})}</button>
                <button onClick={() => handleContextAction('cut')} className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-2"><Scissors className="w-3.5 h-3.5" /> {tx(lang,{fr:'Couper',ar:'قص',en:'Cut',es:'Cortar',pt:'Cortar',tr:'Kes'})}</button>
                <button onClick={() => handleContextAction('paste')} disabled={!clipboard} className={`w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-2 ${!clipboard ? 'opacity-50 cursor-not-allowed' : ''}`}><Clipboard className="w-3.5 h-3.5" /> {tx(lang,{fr:'Coller',ar:'لصق',en:'Paste',es:'Pegar',pt:'Colar',tr:'Yapıştır'})}</button>
                <div className="h-px bg-slate-100 dark:bg-dk-elevated my-1"></div>
                <button onClick={() => handleContextAction('clear')} className="w-full text-left px-4 py-2 hover:bg-amber-50 text-amber-600 dark:text-amber-400 flex items-center gap-2"><Eraser className="w-3.5 h-3.5" /> {tx(lang,{fr:'Vider',ar:'إفراغ',en:'Clear',es:'Vaciar',pt:'Limpar',tr:'Temizle'})}</button>
                <button onClick={() => handleContextAction('delete')} className="w-full text-left px-4 py-2 hover:bg-rose-50 text-rose-600 dark:text-rose-400 flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> {tx(lang,{fr:'Supprimer',ar:'حذف',en:'Delete',es:'Eliminar',pt:'Eliminar',tr:'Sil'})}</button>
           </div>,
           document.body
       )}
    </div>
  );
}
