
import React, { useState } from 'react';
import { 
  FileSpreadsheet,
  Save,
  Printer,
  Calendar,
  Activity,
  ArrowDownToLine,
  Users,
  Clock,
  Briefcase,
  Zap,
  Timer,
  Percent
} from 'lucide-react';
import { Machine, Operation, ComplexityFactor, StandardTime } from '../types';

interface FabricSettings {
  enabled: boolean;
  selected: 'easy' | 'medium' | 'hard';
  values: { easy: number; medium: number; hard: number };
}

interface AnalyseProps {
  machines: Machine[];
  operations: Operation[];
  setOperations: React.Dispatch<React.SetStateAction<Operation[]>>;
  articleName: string;
  efficiency: number;
  setEfficiency: React.Dispatch<React.SetStateAction<number>>; 
  numWorkers: number;
  setNumWorkers: React.Dispatch<React.SetStateAction<number>>;
  presenceTime: number;
  setPresenceTime: React.Dispatch<React.SetStateAction<number>>;
  bf: number;
  complexityFactors: ComplexityFactor[];
  standardTimes: StandardTime[];
  // Receive shared fabric settings
  fabricSettings: FabricSettings;
}

// --- GROUP COLOR PALETTE (IMPORTED FOR CONSISTENCY) ---
const GROUP_COLORS = [
  { bg: 'bg-indigo-50', border: 'border-indigo-500', text: 'text-indigo-700' },
  { bg: 'bg-orange-50', border: 'border-orange-500', text: 'text-orange-700' },
  { bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-700' },
  { bg: 'bg-rose-50', border: 'border-rose-500', text: 'text-rose-700' },
  { bg: 'bg-cyan-50', border: 'border-cyan-500', text: 'text-cyan-700' },
  { bg: 'bg-amber-50', border: 'border-amber-500', text: 'text-amber-700' },
  { bg: 'bg-violet-50', border: 'border-violet-500', text: 'text-violet-700' },
  { bg: 'bg-lime-50', border: 'border-lime-500', text: 'text-lime-700' },
  { bg: 'bg-fuchsia-50', border: 'border-fuchsia-500', text: 'text-fuchsia-700' },
  { bg: 'bg-teal-50', border: 'border-teal-500', text: 'text-teal-700' },
  { bg: 'bg-red-50', border: 'border-red-500', text: 'text-red-700' },
  { bg: 'bg-sky-50', border: 'border-sky-500', text: 'text-sky-700' },
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

export default function AnalyseTechnologique({ 
  machines, 
  operations, 
  setOperations,
  articleName,
  efficiency,
  setEfficiency,
  numWorkers,
  setNumWorkers,
  presenceTime,
  setPresenceTime,
  bf,
  complexityFactors,
  standardTimes,
  fabricSettings
}: AnalyseProps) {

  // State for Global Stitch Count Shortcut
  const [globalStitch, setGlobalStitch] = useState<number>(4);
  
  // --- HELPER: GET DISPLAY INDEX ---
  const getDisplayIndex = (op: Operation, index: number) => {
      let mainCounter = 0;
      let subCounter = 0;
      let lastGroupId = '';

      for (let i = 0; i <= index; i++) {
          const currentOp = operations[i];
          if (currentOp.groupId) {
              if (currentOp.groupId !== lastGroupId) {
                  mainCounter++;
                  subCounter = 1;
                  lastGroupId = currentOp.groupId;
              } else {
                  subCounter++;
              }
          } else {
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

  // --- HELPER: GET MACHINE INFO ---
  const getMachine = (id: string, name?: string) => {
    // Added (mac.name || '') safety check
    const m = machines.find(mac => mac.id === id) || machines.find(mac => (mac.name || '').toLowerCase() === (name || '').toLowerCase());
    return m || { name: name || 'MAN', speed: 2500, speedMajor: 1.01, cofs: 1.12, classe: '' };
  };

  // --- HELPER: GET STANDARD CYCLE TIME FROM PARAMETERS ---
  const getStandardCycleTime = (machineName: string) => {
    const name = (machineName || '').toLowerCase();
    
    // Search in standardTimes for matching label keywords
    const matchedStd = standardTimes.find(s => {
        // Added (s.label || '') safety check
        const label = (s.label || '').toLowerCase();
        if (name.includes('bouton') && (label.includes('bouton') || label.includes('botonière'))) return true;
        if (name.includes('botonière') && (label.includes('bouton') || label.includes('botonière'))) return true;
        if (name.includes('bride') && label.includes('bride')) return true;
        if (name.includes('bartack') && (label.includes('bartack') || label.includes('bride'))) return true;
        if (name.includes('oeillet') && label.includes('oeillet')) return true;
        return false;
    });

    if (matchedStd) {
        return matchedStd.unit === 'sec' ? matchedStd.value / 60 : matchedStd.value;
    }
    
    // Fallbacks if no param found (Default 4s)
    if (name.includes('bouton') || name.includes('botonière')) return 4/60; 
    if (name.includes('bride')) return 4/60; 
    return 0.15; // Generic 9s
  };

  // --- REUSABLE CALCULATION LOGIC ---
  const recalculateOp = (op: Operation): Operation => {
      // IF FORCED TIME EXISTS, USE IT AND SKIP CALCULATION
      if (op.forcedTime !== undefined && op.forcedTime !== null) {
          return { ...op, time: op.forcedTime };
      }

      const machine = getMachine(op.machineId, op.machineName);
      const machineNameUpper = (machine.name || 'MAN').toUpperCase();
      const isMan = machineNameUpper === 'MAN' || machineNameUpper.includes('MANUEL');
      
      // DETECT COUNTER MACHINES (Button, Bartack, etc.)
      const isCounterMachine = 
          machineNameUpper.includes('BOUTON') || 
          machineNameUpper.includes('BRIDE') || 
          machineNameUpper.includes('BARTACK') || 
          machineNameUpper.includes('TROU') || 
          machineNameUpper.includes('OEILLET') ||
          machineNameUpper.includes('POSE');

      // STRICT NUMBER PARSING
      const L = parseFloat(String(op.length)) || 0;
      // stitchCount is now Stitch Length (mm)
      const stitchLengthMm = op.stitchCount !== undefined ? parseFloat(String(op.stitchCount)) : 4; 
      
      const rpm = parseFloat(String(op.rpm)) || machine.speed || 2500;
      const speedFact = parseFloat(String(op.speedFactor)) || machine.speedMajor || 1.01;
      const guideFact = op.guideFactor !== undefined && op.guideFactor !== 0 ? parseFloat(String(op.guideFactor)) : (isCounterMachine ? 1.0 : 1.1);
      
      const endPrecision = op.endPrecision !== undefined ? parseFloat(String(op.endPrecision)) : (isMan ? 0 : 0.01);
      const stop = op.startStop !== undefined ? parseFloat(String(op.startStop)) : (isMan ? 0 : 0.01);
      const maj = parseFloat(String(op.majoration)) || machine.cofs || 1.12;

      let tMac = 0;
      if (!isMan) {
          if (isCounterMachine) {
             // LOGIC: QUANTITY * SECONDS_PER_UNIT
             const quantity = L;
             const cycleTimePerUnit = getStandardCycleTime(machine.name); 
             tMac = (quantity * cycleTimePerUnit) * guideFact;
          } else if (rpm > 0) {
             // Standard Sewing Logic: (L * Density) / RPM
             // Density = 10 / StitchLengthMm (10mm = 1cm)
             const density = stitchLengthMm > 0 ? 10 / stitchLengthMm : 4;
             const baseSewing = (L * density) / rpm;
             tMac = (baseSewing * speedFact * guideFact) + endPrecision + stop;
          }
      }

      // Logic: Auto-calculate Manual Time if not set
      let tMan = parseFloat(String(op.manualTime));
      
      if (tMac > 0 && (!tMan || tMan === 0)) {
         if (L > 0 || isCounterMachine) {
             if (isCounterMachine) {
                 tMan = 0.18;
             } else {
                 // Smart calculation based on length: 0.005 min per cm (handling/aligning)
                 // Minimum 0.15 min (9 sec)
                 tMan = Number(Math.max(0.15, L * 0.005).toFixed(2)); 
             }
         } else {
             tMan = 0.18; // Fallback for 0 length
         }
      } else if (!tMan) {
         tMan = 0;
      }
      
      // Calculate Fabric Penalty
      let fabricPenalty = 0;
      if (fabricSettings && fabricSettings.enabled) {
          const penaltySec = fabricSettings.values[fabricSettings.selected];
          fabricPenalty = penaltySec / 60; 
      }

      // ADD PENALTY TO TOTAL
      const totalMin = ((tMac + tMan) * maj) + fabricPenalty;
      
      return { 
          ...op, 
          time: totalMin 
      };
  };

  const updateOperation = (id: string, field: keyof Operation, value: any) => {
    setOperations(prev => prev.map(op => {
      if (op.id !== id) return op;
      const updatedOp = { ...op, [field]: value };
      
      if (field !== 'description') {
          updatedOp.forcedTime = undefined;
      }
      
      return recalculateOp(updatedOp);
    }));
  };

  const applyGlobalStitchCount = () => {
    setOperations(prev => prev.map(op => {
        const updatedOp = { ...op, stitchCount: globalStitch, forcedTime: undefined };
        return recalculateOp(updatedOp);
    }));
  };

  // --- TOTAL CALCULATIONS ---
  const totalMin = operations.reduce((sum, op) => sum + (recalculateOp(op).time || 0), 0);
  const tempsArticle = totalMin * 1.20;

  // Production Calculations
  const prodDay100 = tempsArticle > 0 ? (presenceTime * numWorkers) / tempsArticle : 0;
  const prodDayEff = prodDay100 * (efficiency / 100);
  const hours = presenceTime / 60;
  const prodHour100 = hours > 0 ? prodDay100 / hours : 0;
  const prodHourEff = hours > 0 ? prodDayEff / hours : 0;

  const totalSec = totalMin * 60;

  // --- STYLING CONSTANTS ---
  const inputClass = "w-full bg-transparent text-center outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded-sm transition-all py-0.5 text-xs text-slate-700 placeholder:text-slate-300 font-medium";
  const headerClass = "py-2 px-1 font-bold text-[9px] uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200 whitespace-nowrap";

  return (
    <div className="space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
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
                <span className="font-black text-orange-500 text-lg leading-none">{Math.round(prodHour100)}</span>
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

            {/* TARGETS */}
            <div className="flex items-center gap-4 px-4 border-l border-slate-100 shrink-0">
                <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">P/J</span>
                    <span className="font-black text-slate-700 text-lg leading-none">{Math.round(prodDayEff)}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">P/H</span>
                    <span className="font-black text-slate-700 text-lg leading-none">{Math.round(prodHourEff)}</span>
                </div>
            </div>

            {/* T. ARTICLE (Right aligned or flexed) */}
            <div className="ml-auto px-4 py-1.5 bg-purple-100 rounded-lg border border-purple-200 flex flex-col items-end shrink-0">
                <span className="text-[9px] font-bold text-purple-500 uppercase flex items-center gap-1"><Timer className="w-3 h-3" /> T. Article</span>
                <span className="font-black text-purple-700 text-xl leading-none">{tempsArticle.toFixed(2)}</span>
            </div>
       </div>

      {/* MODERN TABLE CONTAINER */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="shrink-0 p-3 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white gap-3">
          <div className="flex items-center gap-4">
              <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                 <Activity className="w-4 h-4 text-emerald-500" />
                 Détail des Calculs
              </h3>
              <div className="flex items-center gap-2 px-3 border-l-2 border-slate-100 ml-2">
                 <label className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">L.Pt (mm) Global:</label>
                 <div className="flex items-center gap-1">
                   <input type="number" step="0.5" min="1" value={globalStitch} onChange={(e) => setGlobalStitch(Number(e.target.value))} className="w-12 px-1 py-0.5 text-xs font-bold border border-slate-200 rounded focus:border-emerald-500 outline-none text-center bg-slate-50" />
                   <button onClick={applyGlobalStitchCount} className="flex items-center gap-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold transition-colors border border-slate-200"><ArrowDownToLine className="w-3 h-3" /> Appliquer</button>
                 </div>
              </div>
          </div>
          <div className="flex gap-2 self-end sm:self-auto">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-xs font-bold shadow-sm"><Printer className="w-3.5 h-3.5" /><span>Imprimer</span></button>
          </div>
        </div>

        {/* Scrollable Table Area */}
        <div className="flex-1 overflow-auto relative custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="sticky top-0 z-20 shadow-sm bg-slate-50">
              <tr>
                <th className={`${headerClass} text-center w-12 pl-2 border-r border-slate-200`}>N°</th>
                <th className={`${headerClass} text-left pl-4 min-w-[200px]`}>Opérations</th>
                <th className={`${headerClass} text-center w-24`}>Machine</th>
                <th className={`${headerClass} text-center w-20 text-emerald-600`}>Longueur<br/>/ Qté</th>
                <th className={`${headerClass} text-center w-20 text-emerald-600`}>L. Point<br/>(mm)</th>
                <th className={`${headerClass} text-center w-20`}>Vitesse<br/>(rpm)</th>
                <th className={`${headerClass} text-center w-20`}>Facteur<br/>Machine</th>
                <th className={`${headerClass} text-center w-20`}>Facteur<br/>Guide</th>
                <th className={`${headerClass} text-center w-20`}>Précision<br/>Fin</th>
                <th className={`${headerClass} text-center w-20`}>Constante<br/>Arrêt</th>
                <th className={`${headerClass} text-center w-20 bg-slate-100 border-l border-slate-200 text-slate-600`}>Temps<br/>Machine</th>
                <th className={`${headerClass} text-center w-20 bg-slate-100 text-slate-600`}>Temps<br/>Manuel</th>
                <th className={`${headerClass} text-center w-16 bg-yellow-50 text-yellow-700`}>Majoration</th>
                <th className={`${headerClass} text-center w-20 bg-emerald-50 text-emerald-700 border-l border-emerald-100`}>Temps Total<br/>(min)</th>
                <th className={`${headerClass} text-center w-16 bg-emerald-50 text-emerald-700`}>Secondes</th>
                <th className={`${headerClass} text-center w-20 text-indigo-500 border-l border-slate-200`}>Prod.<br/>Max</th>
                <th className={`${headerClass} text-center w-20 text-indigo-400`}>Prod.<br/>Min</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {operations.map((op, index) => {
                const machine = getMachine(op.machineId, op.machineName);
                const machineNameUpper = (machine.name || 'MAN').toUpperCase();
                const isMan = machineNameUpper === 'MAN' || machineNameUpper.includes('MANUEL');
                
                const isCounterMachine = 
                  machineNameUpper.includes('BOUTON') || 
                  machineNameUpper.includes('BRIDE') || 
                  machineNameUpper.includes('BARTACK') || 
                  machineNameUpper.includes('TROU') ||
                  machineNameUpper.includes('OEILLET') ||
                  machineNameUpper.includes('POSE');

                // STRICT NUMBER PARSING FOR DISPLAY
                const L = parseFloat(String(op.length)) || 0;
                // stitchCount is now Stitch Length (mm)
                const stitchLengthMm = op.stitchCount !== undefined ? parseFloat(String(op.stitchCount)) : 4;
                const rpm = parseFloat(String(op.rpm)) || (machine.speed || 2500);
                const speedFact = parseFloat(String(op.speedFactor)) || (machine.speedMajor || 1.01);
                const guideFact = op.guideFactor !== undefined && op.guideFactor !== 0 ? parseFloat(String(op.guideFactor)) : (isCounterMachine ? 1.0 : 1.1);
                const endPrecision = op.endPrecision !== undefined ? parseFloat(String(op.endPrecision)) : (isMan ? 0 : 0.01);
                const stop = op.startStop !== undefined ? parseFloat(String(op.startStop)) : (isMan ? 0 : 0.01);
                const maj = parseFloat(String(op.majoration)) || (machine.cofs || 1.12);
                
                // RECALCULATE MACHINE TIME FOR DISPLAY
                let tMachineCalc = 0;
                if (!isMan) {
                    if (isCounterMachine) {
                       const quantity = L;
                       const cycleTimePerUnit = getStandardCycleTime(machine.name); 
                       tMachineCalc = (quantity * cycleTimePerUnit) * guideFact;
                    } else if (rpm > 0) {
                        const density = stitchLengthMm > 0 ? 10 / stitchLengthMm : 4;
                        const baseSewing = (L * density) / rpm;
                        tMachineCalc = (baseSewing * speedFact * guideFact) + endPrecision + stop;
                    }
                }
                
                // Logic: Auto-calculate Manual Time if not set (matches recalculateOp)
                let tManuelCalc = parseFloat(String(op.manualTime));
                
                if (tMachineCalc > 0 && (!tManuelCalc || tManuelCalc === 0)) {
                     if (L > 0 || isCounterMachine) {
                         if (isCounterMachine) {
                             tManuelCalc = 0.18;
                         } else {
                             // Smart Calculation based on length
                             tManuelCalc = Number(Math.max(0.15, L * 0.005).toFixed(2));
                         }
                     } else {
                         tManuelCalc = 0.18;
                     }
                } else if (!tManuelCalc) {
                     tManuelCalc = 0;
                }
                
                // --- FABRIC PENALTY ---
                let fabricPenalty = 0;
                if (fabricSettings && fabricSettings.enabled) {
                    const penaltySec = fabricSettings.values[fabricSettings.selected];
                    fabricPenalty = penaltySec / 60; 
                }

                const isForced = op.forcedTime !== undefined && op.forcedTime !== null;
                const tTotalMin = isForced ? op.forcedTime! : ((tMachineCalc + tManuelCalc) * maj) + fabricPenalty;
                const tTotalSec = tTotalMin * 60;
                const pMax = tTotalMin > 0 ? Math.floor(60 / tTotalMin) : 0;
                const pMin = pMax > 0 ? Math.floor(pMax * (efficiency / 100)) : 0;
                
                const disabledIfForced = isForced;

                // Group styling for Index
                const groupStyle = op.groupId ? getGroupStyle(op.groupId) : null;
                let groupClasses = "";
                let groupBorderLeft = "";
                if (groupStyle) {
                    groupClasses = `${groupStyle.bg} hover:${groupStyle.bg.replace('50','100')}`;
                    groupBorderLeft = `border-l-4 ${groupStyle.border}`;
                }

                return (
                  <tr key={op.id} className={`hover:bg-slate-50/80 transition-colors group ${groupClasses}`}>
                    <td className={`py-1.5 px-2 text-center sticky left-0 bg-white group-hover:bg-slate-50 z-20 border-r border-slate-200 border-b border-slate-100 ${groupBorderLeft}`}>
                        <div className="flex items-center justify-center w-8 mx-auto gap-1 text-indigo-600 group-hover:text-emerald-600">
                            <span className="font-mono text-xs font-bold">{getDisplayIndex(op, index)}</span>
                        </div>
                    </td>
                    <td className="py-1.5 px-3 border-r border-slate-100">
                        <input type="text" value={op.description} onChange={(e) => updateOperation(op.id, 'description', e.target.value)} className="w-full bg-transparent outline-none text-xs font-medium text-slate-700 truncate focus:text-clip focus:overflow-visible focus:bg-white focus:absolute focus:z-10 focus:shadow-md focus:px-2 rounded focus:w-auto focus:min-w-full"/>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold uppercase tracking-tight border ${isMan ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-white text-emerald-600 border-emerald-200 shadow-sm'}`}>
                          {machine.name.length > 10 ? machine.name.substring(0,8)+'..' : machine.name}
                        </span>
                    </td>
                    <td className="py-1.5 px-1 text-center">
                        <input 
                            type="number" step="1" 
                            onKeyDown={(e) => ["-", "e", "+", "E", ".", ","].includes(e.key) && e.preventDefault()} 
                            value={op.length === 0 ? '' : op.length} 
                            onChange={(e) => updateOperation(op.id, 'length', Math.floor(Number(e.target.value)))} 
                            onFocus={(e) => e.target.select()} 
                            className={`${inputClass} font-bold ${isCounterMachine ? 'text-amber-600 bg-amber-50/50' : ''}`} 
                            placeholder={isCounterMachine ? 'Qté' : '-'}
                        />
                    </td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="0.1" value={stitchLengthMm} onChange={(e) => updateOperation(op.id, 'stitchCount', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-emerald-600 font-bold"} disabled={disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="100" value={rpm} onChange={(e) => updateOperation(op.id, 'rpm', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-500"} disabled={isMan || disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="0.01" value={speedFact} onChange={(e) => updateOperation(op.id, 'speedFactor', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-500"} disabled={isMan || disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="0.01" value={guideFact} onChange={(e) => updateOperation(op.id, 'guideFactor', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-500"} disabled={isMan || disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="0.01" value={endPrecision} onChange={(e) => updateOperation(op.id, 'endPrecision', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-400"} disabled={isMan || disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="0.01" value={stop} onChange={(e) => updateOperation(op.id, 'startStop', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-400"} disabled={isMan || disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center bg-slate-50/50 border-l border-slate-100 font-mono text-[10px] text-slate-500">{tMachineCalc.toFixed(2)}</td>
                    <td className="py-1.5 px-1 text-center bg-slate-50/50"><input type="number" step="0.01" value={tManuelCalc === 0 ? '' : tManuelCalc} onChange={(e) => updateOperation(op.id, 'manualTime', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-600"} placeholder="Auto" disabled={disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center bg-yellow-50/30"><input type="number" step="0.01" value={maj} onChange={(e) => updateOperation(op.id, 'majoration', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " font-bold text-yellow-700"} disabled={disabledIfForced}/></td>
                    
                    {/* RESULTATS */}
                    <td className="py-1.5 px-1 text-center bg-emerald-50/30 border-l border-emerald-100 font-black text-emerald-700 text-xs">{tTotalMin.toFixed(2)}</td>
                    <td className="py-1.5 px-1 text-center bg-emerald-50/30 text-emerald-600 text-[10px] font-bold">{tTotalSec.toFixed(1)}</td>
                    
                    <td className="py-1.5 px-1 text-center border-l border-slate-100 text-indigo-600 font-bold text-[10px]">{pMax}</td>
                    <td className="py-1.5 px-1 text-center text-indigo-400 font-medium text-[10px]">{pMin}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
