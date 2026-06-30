
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
import { Machine, Operation, ComplexityFactor, StandardTime, Poste } from '../types';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

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
  assignments?: Record<string, string[]>;
  postes?: Poste[];
}

// --- GROUP COLOR PALETTE (IMPORTED FOR CONSISTENCY) ---
const GROUP_COLORS = [
  { bg: 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20', border: 'border-indigo-500', text: 'text-indigo-700 dark:text-dk-accent-text' },
  { bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-500', text: 'text-orange-700' },
  { bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-500', text: 'text-emerald-700' },
  { bg: 'bg-rose-50 dark:bg-rose-900/30', border: 'border-rose-500', text: 'text-rose-700' },
  { bg: 'bg-cyan-50 dark:bg-cyan-900/30', border: 'border-cyan-500', text: 'text-cyan-700' },
  { bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-500', text: 'text-amber-700' },
  { bg: 'bg-violet-50', border: 'border-violet-500', text: 'text-violet-700' },
  { bg: 'bg-lime-50 dark:bg-lime-900/30', border: 'border-lime-500', text: 'text-lime-700' },
  { bg: 'bg-fuchsia-50', border: 'border-fuchsia-500', text: 'text-fuchsia-700' },
  { bg: 'bg-teal-50 dark:bg-teal-900/30', border: 'border-teal-500', text: 'text-teal-700' },
  { bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-500', text: 'text-red-700' },
  { bg: 'bg-sky-50 dark:bg-sky-900/30', border: 'border-sky-500', text: 'text-sky-700' },
];

const POSTE_COLORS = [
  { name: 'indigo', bg: 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20', border: 'border-indigo-200', text: 'text-indigo-700 dark:text-dk-accent-text', badge: 'bg-indigo-100', badgeText: 'text-indigo-800', fill: '#6366f1' },
  { name: 'orange', bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100', badgeText: 'text-orange-800', fill: '#f97316' },
  { name: 'emerald', bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100', badgeText: 'text-emerald-800', fill: '#10b981' },
  { name: 'rose', bg: 'bg-rose-50 dark:bg-rose-900/30', border: 'border-rose-200', text: 'text-rose-700', badge: 'bg-rose-100', badgeText: 'text-rose-800', fill: '#f43f5e' },
  { name: 'cyan', bg: 'bg-cyan-50 dark:bg-cyan-900/30', border: 'border-cyan-200', text: 'text-cyan-700', badge: 'bg-cyan-100', badgeText: 'text-cyan-800', fill: '#06b6d4' },
  { name: 'amber', bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100', badgeText: 'text-amber-800', fill: '#f59e0b' },
  { name: 'violet', bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100', badgeText: 'text-violet-800', fill: '#8b5cf6' },
  { name: 'lime', bg: 'bg-lime-50 dark:bg-lime-900/30', border: 'border-lime-200', text: 'text-lime-700', badge: 'bg-lime-100', badgeText: 'text-lime-800', fill: '#84cc16' },
  { name: 'fuchsia', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', badge: 'bg-fuchsia-100', badgeText: 'text-fuchsia-800', fill: '#d946ef' },
  { name: 'teal', bg: 'bg-teal-50 dark:bg-teal-900/30', border: 'border-teal-200', text: 'text-teal-700', badge: 'bg-teal-100', badgeText: 'text-teal-800', fill: '#14b8a6' },
  { name: 'red', bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100', badgeText: 'text-red-800', fill: '#ef4444' },
  { name: 'sky', bg: 'bg-sky-50 dark:bg-sky-900/30', border: 'border-sky-200', text: 'text-sky-700', badge: 'bg-sky-100', badgeText: 'text-sky-800', fill: '#0ea5e9' },
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
  fabricSettings,
  assignments = {},
  postes = []
}: AnalyseProps) {
  const { lang } = useLang();
  const posteColorById = new Map(
    postes.map((poste, index) => {
      const fallback = POSTE_COLORS[index % POSTE_COLORS.length];
      const mapped = poste.colorName ? (POSTE_COLORS.find((color) => color.name === poste.colorName) || fallback) : fallback;
      return [poste.id, mapped];
    })
  );

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
  const inputClass = "w-full bg-transparent text-center outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded-sm transition-all py-0.5 text-xs text-slate-700 dark:text-dk-text-soft placeholder:text-slate-300 font-medium";
  const headerClass = "py-2 px-1 font-bold text-[9px] uppercase tracking-wider text-slate-500 dark:text-dk-muted bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border whitespace-nowrap";

  return (
    <div className="space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* 1. SINGLE ROW HEADER - RESPONSIVE */}
       <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm mb-4 p-2 flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar">
            {/* OUVRIERS / HEURES */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-dk-bg rounded-lg border border-slate-100 dark:border-dk-border shrink-0">
                <div className="flex flex-col items-center border-r border-slate-200 dark:border-dk-border pr-3 mr-3">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang, { fr: 'Ouvriers', ar: 'العمال', en: 'Workers', es: 'Obreros', pt: 'Trabalhadores', tr: 'İşçiler' })}</span>
                    <input
                        type="number" 
                        min="1" 
                        value={Math.round(numWorkers)} 
                        onChange={(e) => setNumWorkers(Math.max(1, Math.round(Number(e.target.value))))} 
                        className="w-12 text-center bg-transparent font-black text-slate-700 dark:text-dk-text-soft outline-none text-sm p-0" 
                    />
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang, { fr: 'Heures', ar: 'الساعات', en: 'Hours', es: 'Horas', pt: 'Horas', tr: 'Saat' })}</span>
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
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/50 rounded-lg border border-emerald-100 shrink-0">
                <div className="flex flex-col items-center border-r border-emerald-100 pr-3 mr-3">
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-1"><Zap className="w-3 h-3" /> BF (s)</span>
                    <span className="font-black text-emerald-700 text-sm">{(bf * 60).toFixed(1)}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">{tx(lang, { fr: 'Min Tot.', ar: 'إجمالي الدقائق', en: 'Total Min.', es: 'Min Tot.', pt: 'Min Tot.', tr: 'Toplam Dk.' })}</span>
                    <span className="font-black text-emerald-700 text-sm">{presenceTime}</span>
                </div>
            </div>

            {/* P/H 100% */}
            <div className="flex flex-col items-center px-3 py-1.5 bg-orange-50 dark:bg-orange-900/50 rounded-lg border border-orange-100 shrink-0">
                <span className="text-[9px] font-bold text-orange-400 uppercase">{tx(lang, { fr: 'P/H (100%)', ar: 'قطعة/ساعة (100%)', en: 'P/H (100%)', es: 'P/H (100%)', pt: 'P/H (100%)', tr: 'P/S (100%)' })}</span>
                <span className="font-black text-orange-500 text-sm leading-none mt-1">{Math.round(prodHour100)}</span>
            </div>

            {/* RENDU */}
            <div className="flex flex-col items-center px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/50 rounded-lg border border-indigo-100 shrink-0">
                <span className="text-[9px] font-bold text-indigo-400 uppercase">{tx(lang, { fr: '% Rendu', ar: 'الإنتاجية %', en: 'Efficiency %', es: '% Rendimiento', pt: '% Rendimento', tr: 'Verim %' })}</span>
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

            {/* TARGETS */}
            <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 dark:bg-dk-bg/50 rounded-lg border border-slate-100 dark:border-dk-border shrink-0">
                <div className="flex flex-col items-center border-r border-slate-200 dark:border-dk-border pr-3 mr-1">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">P/J</span>
                    <span className="font-black text-slate-700 dark:text-dk-text-soft text-sm leading-none mt-1">{Math.round(prodDayEff)}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">P/H</span>
                    <span className="font-black text-slate-700 dark:text-dk-text-soft text-sm leading-none mt-1">{Math.round(prodHourEff)}</span>
                </div>
            </div>

            {/* T. ARTICLE (Right aligned or flexed) */}
            <div className="ml-auto px-4 py-1.5 bg-purple-100 rounded-lg border border-purple-200 flex flex-col items-end shrink-0">
                <span className="text-[9px] font-bold text-purple-500 uppercase flex items-center gap-1"><Timer className="w-3 h-3" /> {tx(lang, { fr: 'T. Article', ar: 'وقت القطعة', en: 'Article Time', es: 'T. Artículo', pt: 'T. Artigo', tr: 'Ürün Süresi' })}</span>
                <span className="font-black text-purple-700 text-xl leading-none">{tempsArticle.toFixed(2)}</span>
            </div>
       </div>

      {/* MODERN TABLE CONTAINER */}
      <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="shrink-0 p-3 border-b border-slate-100 dark:border-dk-border flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white dark:bg-dk-surface gap-3">
          <div className="flex items-center gap-4">
              <h3 className="font-bold text-slate-700 dark:text-dk-text-soft text-sm flex items-center gap-2">
                 <Activity className="w-4 h-4 text-emerald-500" />
                 {tx(lang, { fr: 'Détail des Calculs', ar: 'تفاصيل الحسابات', en: 'Calculation Details', es: 'Detalle de Cálculos', pt: 'Detalhe dos Cálculos', tr: 'Hesaplama Detayları' })}
              </h3>
              <div className="flex items-center gap-2 px-3 border-l-2 border-slate-100 dark:border-dk-border ml-2">
                 <label className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase whitespace-nowrap">{tx(lang, { fr: 'L.Pt (mm) Global:', ar: 'طول الغرزة (mm) شامل:', en: 'Stitch L. (mm) Global:', es: 'L.Pt (mm) Global:', pt: 'L.Pt (mm) Global:', tr: 'Dikiş U. (mm) Genel:' })}</label>
                 <div className="flex items-center gap-1">
                   <input type="number" step="0.5" min="1" value={globalStitch} onChange={(e) => setGlobalStitch(Number(e.target.value))} className="w-12 px-1 py-0.5 text-xs font-bold border border-slate-200 dark:border-dk-border rounded focus:border-emerald-500 outline-none text-center bg-slate-50 dark:bg-dk-bg" />
                   <button onClick={applyGlobalStitchCount} className="flex items-center gap-1 bg-slate-100 dark:bg-dk-elevated hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 dark:text-dk-text-soft px-2 py-0.5 rounded text-[10px] font-bold transition-colors border border-slate-200 dark:border-dk-border"><ArrowDownToLine className="w-3 h-3" /> {tx(lang, { fr: 'Appliquer', ar: 'تطبيق', en: 'Apply', es: 'Aplicar', pt: 'Aplicar', tr: 'Uygula' })}</button>
                 </div>
              </div>
          </div>
          <div className="flex gap-2 self-end sm:self-auto">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-xs font-bold shadow-sm dark:shadow-dk-sm"><Printer className="w-3.5 h-3.5" /><span>{tx(lang, { fr: 'Imprimer', ar: 'طباعة', en: 'Print', es: 'Imprimir', pt: 'Imprimir', tr: 'Yazdır' })}</span></button>
          </div>
        </div>

        {/* Scrollable Table Area */}
        <div className="flex-1 overflow-auto relative custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="sticky top-0 z-20 shadow-sm dark:shadow-dk-sm bg-slate-50 dark:bg-dk-bg">
              <tr>
                <th className={`${headerClass} text-center w-12 pl-2 border-r border-slate-200 dark:border-dk-border`}>N°</th>
                <th className={`${headerClass} text-left pl-4 min-w-[200px]`}>{tx(lang, { fr: 'Opérations', ar: 'العمليات', en: 'Operations', es: 'Operaciones', pt: 'Operações', tr: 'Operasyonlar' })}</th>
                <th className={`${headerClass} text-center w-24`}>{tx(lang, { fr: 'Machine', ar: 'الآلة', en: 'Machine', es: 'Máquina', pt: 'Máquina', tr: 'Makine' })}</th>
                <th className={`${headerClass} text-center w-20 text-emerald-600 dark:text-emerald-400`}>{tx(lang, { fr: 'Longueur', ar: 'الطول', en: 'Length', es: 'Longitud', pt: 'Comprimento', tr: 'Uzunluk' })}<br/>/ {tx(lang, { fr: 'Qté', ar: 'الكمية', en: 'Qty', es: 'Cant.', pt: 'Qtd', tr: 'Adet' })}</th>
                <th className={`${headerClass} text-center w-20 text-emerald-600 dark:text-emerald-400`}>{tx(lang, { fr: 'L. Point', ar: 'طول الغرزة', en: 'Stitch L.', es: 'L. Punto', pt: 'L. Ponto', tr: 'Dikiş U.' })}<br/>(mm)</th>
                <th className={`${headerClass} text-center w-20`}>{tx(lang, { fr: 'Vitesse', ar: 'السرعة', en: 'Speed', es: 'Velocidad', pt: 'Velocidade', tr: 'Hız' })}<br/>(rpm)</th>
                <th className={`${headerClass} text-center w-20`}>{tx(lang, { fr: 'Facteur', ar: 'عامل', en: 'Factor', es: 'Factor', pt: 'Fator', tr: 'Faktör' })}<br/>{tx(lang, { fr: 'Machine', ar: 'الآلة', en: 'Machine', es: 'Máquina', pt: 'Máquina', tr: 'Makine' })}</th>
                <th className={`${headerClass} text-center w-20`}>{tx(lang, { fr: 'Facteur', ar: 'عامل', en: 'Factor', es: 'Factor', pt: 'Fator', tr: 'Faktör' })}<br/>{tx(lang, { fr: 'Guide', ar: 'الدليل', en: 'Guide', es: 'Guía', pt: 'Guia', tr: 'Kılavuz' })}</th>
                <th className={`${headerClass} text-center w-20`}>{tx(lang, { fr: 'Précision', ar: 'الدقة', en: 'Precision', es: 'Precisión', pt: 'Precisão', tr: 'Hassasiyet' })}<br/>{tx(lang, { fr: 'Fin', ar: 'النهاية', en: 'End', es: 'Fin', pt: 'Fim', tr: 'Bitiş' })}</th>
                <th className={`${headerClass} text-center w-20`}>{tx(lang, { fr: 'Constante', ar: 'ثابت', en: 'Constant', es: 'Constante', pt: 'Constante', tr: 'Sabit' })}<br/>{tx(lang, { fr: 'Arrêt', ar: 'التوقف', en: 'Stop', es: 'Parada', pt: 'Parada', tr: 'Durdurma' })}</th>
                <th className={`${headerClass} text-center w-20 bg-slate-100 dark:bg-dk-elevated border-l border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft`}>{tx(lang, { fr: 'Temps', ar: 'الوقت', en: 'Time', es: 'Tiempo', pt: 'Tempo', tr: 'Süre' })}<br/>{tx(lang, { fr: 'Machine', ar: 'الآلة', en: 'Machine', es: 'Máquina', pt: 'Máquina', tr: 'Makine' })}</th>
                <th className={`${headerClass} text-center w-20 bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft`}>{tx(lang, { fr: 'Temps', ar: 'الوقت', en: 'Time', es: 'Tiempo', pt: 'Tempo', tr: 'Süre' })}<br/>{tx(lang, { fr: 'Manuel', ar: 'اليدوي', en: 'Manual', es: 'Manual', pt: 'Manual', tr: 'Manuel' })}</th>
                <th className={`${headerClass} text-center w-16 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700`}>{tx(lang, { fr: 'Majoration', ar: 'الزيادة', en: 'Markup', es: 'Recargo', pt: 'Acréscimo', tr: 'Artış' })}</th>
                <th className={`${headerClass} text-center w-20 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 border-l border-emerald-100`}>{tx(lang, { fr: 'Temps Total', ar: 'الوقت الإجمالي', en: 'Total Time', es: 'Tiempo Total', pt: 'Tempo Total', tr: 'Toplam Süre' })}<br/>(min)</th>
                <th className={`${headerClass} text-center w-16 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700`}>{tx(lang, { fr: 'Secondes', ar: 'الثواني', en: 'Seconds', es: 'Segundos', pt: 'Segundos', tr: 'Saniye' })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-dk-border">
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
                
                const disabledIfForced = isForced;
                const assignedPostes = assignments[op.id] || [];
                const primaryPosteColor = assignedPostes.length > 0 ? posteColorById.get(assignedPostes[0]) : undefined;

                // Group styling for rows; poste is shown only as a left stripe on the first column
                const groupStyle = op.groupId ? getGroupStyle(op.groupId) : null;
                let groupClasses = "";
                let groupBorderLeft = "";
                if (groupStyle) {
                    groupClasses = `${groupStyle.bg} hover:${groupStyle.bg.replace('50','100')}`;
                    groupBorderLeft = `border-l-4 ${groupStyle.border}`;
                }

                return (
                  <tr key={op.id} className={`transition-colors group hover:bg-slate-50/80 ${groupClasses}`}>
                    <td
                        className={`py-1.5 px-2 text-center sticky left-0 z-20 border-r border-slate-200 dark:border-dk-border border-b border-slate-100 dark:border-dk-border transition-colors ${
                            groupStyle 
                                ? `${groupStyle.bg} group-hover:${groupStyle.bg.replace('50', '100')}` 
                                : 'bg-white dark:bg-dk-surface group-hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                        } ${groupBorderLeft}`}
                    >
                        <div className="flex items-center justify-center min-w-[2.5rem]">
                            {primaryPosteColor ? (
                                <span
                                    className="font-mono text-xs font-black inline-flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-lg text-white shadow-sm dark:shadow-dk-sm ring-1 ring-black/10"
                                    style={{ backgroundColor: primaryPosteColor.fill ?? '#6366f1' }}
                                >
                                    {getDisplayIndex(op, index)}
                                </span>
                            ) : (
                                <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text group-hover:text-emerald-600">
                                    {getDisplayIndex(op, index)}
                                </span>
                            )}
                        </div>
                    </td>
                    <td className="py-1.5 px-3 border-r border-slate-100 dark:border-dk-border">
                        <input type="text" value={op.description} onChange={(e) => updateOperation(op.id, 'description', e.target.value)} className="w-full bg-transparent outline-none text-xs font-medium text-slate-700 dark:text-dk-text-soft truncate focus:text-clip focus:overflow-visible focus:bg-white focus:absolute focus:z-10 focus:shadow-md focus:px-2 rounded focus:w-auto focus:min-w-full"/>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold uppercase tracking-tight border ${isMan ? 'bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border' : 'bg-white dark:bg-dk-surface text-emerald-600 dark:text-emerald-400 border-emerald-200 shadow-sm dark:shadow-dk-sm'}`}>
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
                            className={`${inputClass} font-bold ${isCounterMachine ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/50' : ''}`} 
                            placeholder={isCounterMachine ? tx(lang, { fr: 'Qté', ar: 'الكمية', en: 'Qty', es: 'Cant.', pt: 'Qtd', tr: 'Adet' }) : '-'}
                        />
                    </td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="0.1" value={stitchLengthMm} onChange={(e) => updateOperation(op.id, 'stitchCount', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-emerald-600 dark:text-emerald-400 font-bold"} disabled={disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="100" value={rpm} onChange={(e) => updateOperation(op.id, 'rpm', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-500 dark:text-dk-muted"} disabled={isMan || disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="0.01" value={speedFact} onChange={(e) => updateOperation(op.id, 'speedFactor', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-500 dark:text-dk-muted"} disabled={isMan || disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="0.01" value={guideFact} onChange={(e) => updateOperation(op.id, 'guideFactor', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-500 dark:text-dk-muted"} disabled={isMan || disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="0.01" value={endPrecision} onChange={(e) => updateOperation(op.id, 'endPrecision', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-400 dark:text-dk-muted"} disabled={isMan || disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center"><input type="number" step="0.01" value={stop} onChange={(e) => updateOperation(op.id, 'startStop', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-400 dark:text-dk-muted"} disabled={isMan || disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center bg-slate-50 dark:bg-dk-bg/50 border-l border-slate-100 dark:border-dk-border font-mono text-[10px] text-slate-500 dark:text-dk-muted">{tMachineCalc.toFixed(2)}</td>
                    <td className="py-1.5 px-1 text-center bg-slate-50 dark:bg-dk-bg/50"><input type="number" step="0.01" value={tManuelCalc === 0 ? '' : tManuelCalc} onChange={(e) => updateOperation(op.id, 'manualTime', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " text-slate-600 dark:text-dk-text-soft"} placeholder={tx(lang, { fr: 'Auto', ar: 'تلقائي', en: 'Auto', es: 'Auto', pt: 'Auto', tr: 'Otomatik' })} disabled={disabledIfForced}/></td>
                    <td className="py-1.5 px-1 text-center bg-yellow-50 dark:bg-yellow-900/30"><input type="number" step="0.01" value={maj} onChange={(e) => updateOperation(op.id, 'majoration', e.target.value)} onFocus={(e) => e.target.select()} className={inputClass + " font-bold text-yellow-700"} disabled={disabledIfForced}/></td>
                    
                    {/* RESULTATS */}
                    <td className="py-1.5 px-1 text-center bg-emerald-50 dark:bg-emerald-900/30 border-l border-emerald-100 font-black text-emerald-700 text-xs">{tTotalMin.toFixed(2)}</td>
                    <td className="py-1.5 px-1 text-center bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">{tTotalSec.toFixed(1)}</td>
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
