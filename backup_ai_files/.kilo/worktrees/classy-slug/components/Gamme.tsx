
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  ClipboardList, 
  Plus, 
  Trash2, 
  Ruler, 
  GripVertical,
  Users, 
  Clock, 
  Briefcase, 
  Timer, 
  Zap, 
  Sparkles, 
  Loader2, 
  X, 
  Search, 
  Bot, 
  MessageSquare, 
  Send, 
  ArrowDownToLine, 
  ChevronDown, 
  Shirt, 
  Component, 
  Info, 
  Percent, 
  ToggleLeft, 
  ToggleRight, 
  Wand2, 
  Scissors, 
  Copy, 
  CopyPlus,
  Clipboard, 
  Eraser,
  Link as LinkIcon,
  Unlink,
  CheckSquare,
  Layers,
  MousePointer2,
  FileText,
  ArrowRight,
  CornerDownRight,
  MousePointerClick,
  CheckCircle,
  AlertTriangle,
  ArrowRightLeft,
  ArrowLeftToLine,
  MoveDown,
  Split,
  Check,
  MousePointer,
  Minus
} from 'lucide-react';
import { Machine, Operation, ComplexityFactor, StandardTime, Guide } from '../types';
import { analyzeTextileContext } from '../services/gemini';
import { VOCABULARY } from '../data/vocabulary';
import ExcelInput from './ExcelInput';

// --- GROUP COLOR PALETTE (HIGH CONTRAST ALTERNATING) ---
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

// --- TEST DATA: BLOUSE ---
const BLOUSE_OPS: Operation[] = [
    { id: '1', order: 1, description: 'Surfilage parementures et enformes', machineName: 'Surjeteuse 3 Fils', time: 0.35, length: 120, machineId: '', manualTime: 0, side: 'D' },
    { id: '2', order: 2, description: 'Thermocollage col, pieds et poignets', machineName: 'Presse', time: 0.45, length: 0, machineId: '', manualTime: 0 },
    { id: '3', order: 3, description: 'Assemblage col (Piquage)', machineName: 'Piqueuse Plate', time: 0.50, length: 45, machineId: '', manualTime: 0 },
    { id: '4', order: 4, description: 'Dégarnir et retourner col', machineName: 'MAN', time: 0.40, length: 0, machineId: '', manualTime: 0 },
    { id: '5', order: 5, description: 'Surpiqûre col 1 aiguille', machineName: 'Piqueuse Plate', time: 0.55, length: 45, machineId: '', manualTime: 0 },
    { id: '6', order: 6, description: 'Préparation poche (Ourlet)', machineName: 'Piqueuse Plate', time: 0.35, length: 15, machineId: '', manualTime: 0 },
    { id: '7', order: 7, description: 'Plaquage poche sur devant', machineName: 'Piqueuse Plate', time: 0.70, length: 40, machineId: '', manualTime: 0, side: 'G' },
    { id: '8', order: 8, description: 'Assemblage épaules', machineName: 'Surjeteuse 5 Fils', time: 0.45, length: 30, machineId: '', manualTime: 0, side: 'GD' },
    { id: '9', order: 9, description: 'Pose col sur encolure', machineName: 'Piqueuse Plate', time: 0.85, length: 45, machineId: '', manualTime: 0 },
    { id: '10', order: 10, description: 'Rabat de col (Coulissage)', machineName: 'Piqueuse Plate', time: 0.75, length: 45, machineId: '', manualTime: 0 },
    { id: '11', order: 11, description: 'Fente indéchirable manches', machineName: 'Piqueuse Plate', time: 0.60, length: 25, machineId: '', manualTime: 0, side: 'GD' },
    { id: '12', order: 12, description: 'Assemblage manches à plat', machineName: 'Surjeteuse 5 Fils', time: 0.75, length: 90, machineId: '', manualTime: 0, side: 'GD' },
    { id: '13', order: 13, description: 'Fermeture côtés et manches', machineName: 'Surjeteuse 5 Fils', time: 0.95, length: 120, machineId: '', manualTime: 0, side: 'GD' },
    { id: '14', order: 14, description: 'Préparation poignets', machineName: 'Piqueuse Plate', time: 0.60, length: 50, machineId: '', manualTime: 0, side: 'GD' },
    { id: '15', order: 15, description: 'Pose poignets', machineName: 'Piqueuse Plate', time: 0.90, length: 50, machineId: '', manualTime: 0, side: 'GD' },
    { id: '16', order: 16, description: 'Ourlet bas chemisier', machineName: 'Piqueuse Plate', time: 0.80, length: 100, machineId: '', manualTime: 0 },
    { id: '17', order: 17, description: 'Boutonnières (Devant + Col + Poignets)', machineName: 'Boutonnière', time: 1.10, length: 9, machineId: '', manualTime: 0 },
    { id: '18', order: 18, description: 'Pose boutons', machineName: 'Pose-bouton', time: 0.80, length: 9, machineId: '', manualTime: 0 },
    { id: '19', order: 19, description: 'Contrôle final et épluchage', machineName: 'CONTROLE', time: 1.50, length: 0, machineId: '', manualTime: 0 },
    { id: '20', order: 20, description: 'Repassage final et pliage', machineName: 'FER', time: 2.00, length: 0, machineId: '', manualTime: 0 },
];

interface FabricSettings {
  enabled: boolean;
  selected: 'easy' | 'medium' | 'hard';
  values: { easy: number; medium: number; hard: number };
}

interface GammeProps {
  machines: Machine[];
  operations: Operation[];
  setOperations: React.Dispatch<React.SetStateAction<Operation[]>>;
  articleName: string;
  setArticleName: React.Dispatch<React.SetStateAction<string>>;
  efficiency: number;
  setEfficiency: React.Dispatch<React.SetStateAction<number>>; 
  numWorkers: number;
  setNumWorkers: React.Dispatch<React.SetStateAction<number>>;
  presenceTime: number;
  setPresenceTime: React.Dispatch<React.SetStateAction<number>>;
  bf: number;
  complexityFactors: ComplexityFactor[];
  standardTimes: StandardTime[];
  guides?: Guide[];
  // Autocomplete Props
  isAutocompleteEnabled: boolean;
  userVocabulary: string[];
  setUserVocabulary: React.Dispatch<React.SetStateAction<string[]>>;
  // Fabric Settings (Lifted Up)
  fabricSettings: FabricSettings;
  setFabricSettings: React.Dispatch<React.SetStateAction<FabricSettings>>;
}

export default function Gamme({ 
  machines, 
  operations, 
  setOperations,
  articleName,
  setArticleName,
  efficiency,
  setEfficiency,
  numWorkers,
  setNumWorkers,
  presenceTime,
  setPresenceTime,
  bf,
  complexityFactors,
  standardTimes,
  guides = [],
  isAutocompleteEnabled,
  userVocabulary,
  setUserVocabulary,
  fabricSettings,
  setFabricSettings
}: GammeProps) {

  const [showLength, setShowLength] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  // Selection Mode State - Controls visibility of checkboxes
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedOpIds, setSelectedOpIds] = useState<string[]>([]);
  
  // Shortcut State
  const [globalGuide, setGlobalGuide] = useState<number>(1.1);

  // UI States
  const [showFabricModal, setShowFabricModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState<{ opId: string, machineName: string } | null>(null);
  const [guideSearch, setGuideSearch] = useState('');

  // Flow/Link State
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [pendingLinkTarget, setPendingLinkTarget] = useState<string | null>(null);
  // Removed setMoveOnLink, movement is now forced
  const [showLinkNotification, setShowLinkNotification] = useState(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    opId: string | null;
    align: 'top' | 'bottom';
  } | null>(null);

  const [clipboard, setClipboard] = useState<{ op: Operation | null; mode: 'copy' | 'cut' } | null>(null);

  // Combine Vocabularies (Memoized)
  const fullVocabulary = useMemo(() => [...VOCABULARY, ...userVocabulary], [userVocabulary]);

  // AI Assistant State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, aiResponse]);

  // Handle Linking Notification Timer (7 seconds)
  useEffect(() => {
      if (isLinkingMode && !pendingLinkTarget) {
          setShowLinkNotification(true);
          const timer = setTimeout(() => {
              setShowLinkNotification(false);
          }, 7000);
          return () => clearTimeout(timer);
      } else {
          setShowLinkNotification(false);
      }
  }, [isLinkingMode, pendingLinkTarget]);

  // Global click listener to close context menu
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    // Also close on scroll to avoid floating menu issues
    window.addEventListener('scroll', handleClick, true); 
    
    // Add escape key listener to cancel linking
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsLinkingMode(false);
            setPendingLinkTarget(null);
        }
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
        window.removeEventListener('click', handleClick);
        window.removeEventListener('scroll', handleClick, true);
        window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // --- NUMBERING LOGIC FOR GROUPS ---
  const getDisplayIndex = (op: Operation, index: number) => {
      // Create a map of groups encountered so far
      let mainCounter = 0;
      let subCounter = 0;
      let lastGroupId = '';

      for (let i = 0; i <= index; i++) {
          const currentOp = operations[i];
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

  const getGlobalIndex = (opId: string) => {
      return operations.findIndex(o => o.id === opId) + 1;
  };

  // HELPER FOR BADGES: Get the display index (e.g., "1.3") for a specific Operation ID
  const getOpDisplayId = (targetId: string) => {
      const idx = operations.findIndex(o => o.id === targetId);
      if (idx === -1) return '?';
      return getDisplayIndex(operations[idx], idx);
  };

  // --- HELPER: NORMALIZE TEXT (SAFE) ---
  const normalize = (str: string) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // --- HELPER: FIND GUIDE BASED ON TEXT (SMART MATCHING WITH DARIJA) ---
  const findBestGuide = (description: string, machineName: string): Guide | undefined => {
      if (!description || !machineName) return undefined;
      
      const descNorm = normalize(description);
      const machNorm = normalize(machineName);

      // 1. Identify Machine Type of the Operation
      const isOpPiqueuse = machNorm.includes('piqueuse') || machNorm.includes('301') || machNorm.includes('plate') || machNorm.includes('automatique') || machNorm.includes('db');
      const isOpSurjet = machNorm.includes('surjet') || machNorm.includes('sj') || machNorm.includes('504') || machNorm.includes('514') || machNorm.includes('516') || machNorm.includes('merrow');
      const isOpRecouvreuse = machNorm.includes('recouvreuse') || machNorm.includes('colleteuse') || machNorm.includes('256') || machNorm.includes('flatlock');
      // If none of above, treat as generic or manual or special

      // 2. Score Candidates
      let bestCandidate: Guide | undefined;
      let maxScore = 0;

      for (const g of guides) {
          const gMachNorm = normalize(g.machineType || '');
          let isCompatible = false;

          // A. COMPATIBILITY CHECK
          if (gMachNorm.includes('toutes') || gMachNorm.includes('divers')) {
              isCompatible = true;
          } 
          else {
              const gIsPiqueuse = gMachNorm.includes('piqueuse') || gMachNorm.includes('301');
              const gIsSurjet = gMachNorm.includes('surjet') || gMachNorm.includes('surjeteuse');
              const gIsRecouvreuse = gMachNorm.includes('recouvreuse') || gMachNorm.includes('colleteuse');

              if (isOpPiqueuse && gIsPiqueuse) isCompatible = true;
              else if (isOpSurjet && gIsSurjet) isCompatible = true;
              else if (isOpRecouvreuse && gIsRecouvreuse) isCompatible = true;
              // Fallback: Name match (e.g. if machine name literally contains guide machine name)
              else if (machNorm.includes(gMachNorm)) isCompatible = true;
          }

          if (!isCompatible) continue;

          // B. SCORING (Description vs Guide Info)
          let score = 0;
          const gInfo = normalize(`${g.name || ''} ${g.category || ''} ${g.useCase || ''}`);
          
          // Weighted Keywords (Including Darija)
          const keywords = [
              // Zips & Fermetures
              { word: 'fermeture', weight: 40 }, { word: 'zip', weight: 40 }, { word: 'eclair', weight: 40 },
              { word: 'invisible', weight: 40 }, { word: 'madfona', weight: 40 }, { word: 'snsla', weight: 40 },
              
              // Bordage & Biais
              { word: 'passepoil', weight: 40 }, { word: 'cordon', weight: 35 },
              { word: 'biais', weight: 30 }, { word: 'border', weight: 30 },
              
              // Fronces
              { word: 'fronce', weight: 35 }, { word: 'plis', weight: 35 }, 
              { word: 'tkrich', weight: 35 }, { word: 'kmmch', weight: 35 },
              
              // Ourlets
              { word: 'ourlet', weight: 25 }, { word: 'roulotte', weight: 25 }, { word: 'roulotté', weight: 25 },
              { word: 'ghli', weight: 25 }, { word: 'kofa', weight: 25 },
              
              // Elastique
              { word: 'elastique', weight: 25 }, { word: 'lastik', weight: 25 },
              
              // Matières
              { word: 'cuir', weight: 20 }, { word: 'skai', weight: 20 }, { word: 'simili', weight: 20 },
              
              // Couture
              { word: 'surpiqure', weight: 15 }, { word: 'piquer', weight: 10 }, { word: 'nervure', weight: 15 },
              { word: 'blaki', weight: 10 }, { word: 'plaquer', weight: 10 },
              
              { word: 'assemblage', weight: 2 }, // Very low weight for generic term
          ];

          for (const k of keywords) {
              if (descNorm.includes(k.word) && gInfo.includes(k.word)) {
                  score += k.weight;
              }
          }

          // Bonus: Exact guide name parts in description
          const gNameParts = normalize(g.name || '').split(' ');
          for(const part of gNameParts) {
              if (part.length > 3 && descNorm.includes(part)) score += 15;
          }

          if (score > maxScore) {
              maxScore = score;
              bestCandidate = g;
          }
      }

      // C. THRESHOLD
      // Must have a meaningful score to assign (at least 10, meaning matched a weak keyword or strong partial)
      // "Assemblage" (weight 2) alone is not enough.
      return maxScore >= 10 ? bestCandidate : undefined;
  };

  // --- AUTO ASSIGN GUIDES (BATCH) ---
  const handleAutoAssignGuides = () => {
      setOperations(prev => prev.map(op => {
          // Skip if no description or machine
          if (!op.description || !op.machineName) return op;
          
          const suggested = findBestGuide(op.description, op.machineName);
          
          if (suggested) {
              return { 
                  ...op, 
                  guideId: suggested.id, 
                  guideName: suggested.name 
              };
          } else {
              return {
                  ...op,
                  guideId: undefined,
                  guideName: ''
              };
          }
      }));
  };

  // --- FILTER GUIDES FOR MODAL ---
  const filteredGuides = useMemo(() => {
      if (!showGuideModal) return [];
      const searchLower = guideSearch.toLowerCase();
      const targetMachine = (showGuideModal.machineName || '').toLowerCase();
      
      return guides.filter(g => {
          const matchSearch = (g.name || '').toLowerCase().includes(searchLower) || (g.category || '').toLowerCase().includes(searchLower);
          
          const gMachine = (g.machineType || '').toLowerCase();
          const matchMachine = targetMachine ? (gMachine.includes(targetMachine) || targetMachine.includes(gMachine) || gMachine.includes('piqueuse')) : true;
          
          return matchSearch && matchMachine;
      });
  }, [guides, guideSearch, showGuideModal]);

  // --- HELPER: GET STANDARD CYCLE TIME ---
  const getStandardCycleTime = (machineName: string) => {
    const name = (machineName || '').toLowerCase();
    
    const matchedStd = standardTimes.find(s => {
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
    
    if (name.includes('bouton') || name.includes('botonière')) return 4/60; 
    if (name.includes('bride')) return 4/60; 
    return 0.15; 
  };

  // --- CALCULATION LOGIC ---
  const calculateOpTimes = (op: Partial<Operation>, machineId: string, machinesList: Machine[]) => {
    let machine = machinesList.find(m => m.id === machineId);
    if (!machine && op.machineName) {
        const val = op.machineName.trim().toLowerCase();
        machine = machinesList.find(m => 
            (m.name || '').toLowerCase().includes(val) || 
            (m.classe || '').toLowerCase().includes(val)
        );
    }
    
    const hasMachineDefinition = !!machine || (op.machineName && op.machineName.trim().length > 0);
    const machineNameUpper = (machine?.name || op.machineName || '').toUpperCase();
    
    const isCounterMachine = 
        machineNameUpper.includes('BOUTON') || 
        machineNameUpper.includes('BRIDE') || 
        machineNameUpper.includes('BARTACK') || 
        machineNameUpper.includes('TROU') || 
        machineNameUpper.includes('OEILLET') ||
        machineNameUpper.includes('POSE');

    const L = parseFloat(String(op.length)) || 0;
    // stitchCount acts as Stitch Length (mm). Density (pts/cm) = 10 / stitchLength
    const stitchLengthMm = op.stitchCount !== undefined ? parseFloat(String(op.stitchCount)) : 4; 
    const speed = parseFloat(String(op.rpm)) || (machine?.speed || 2500); 
    const F_Machine = parseFloat(String(op.speedFactor)) || (machine?.speedMajor || 1.01);
    const F_Guide = op.guideFactor !== undefined ? parseFloat(String(op.guideFactor)) : 1.1; 
    const Majoration = parseFloat(String(op.majoration)) || (machine?.cofs || 1.15); 
    
    const isMachine = hasMachineDefinition && (machine?.name.toUpperCase() !== 'MAN' && !op.machineName?.toUpperCase().includes('MAN'));
    
    let T_Machine = 0;
    let T_Manuel = parseFloat(String(op.manualTime)) || 0;

    if (isMachine) {
        if (isCounterMachine) {
            const quantity = L;
            const cycleTimePerUnit = getStandardCycleTime(machine?.name || op.machineName || '');
            T_Machine = (quantity * cycleTimePerUnit) * F_Machine * F_Guide;
        } else if (speed > 0) {
            const C_EndPrecision = op.endPrecision !== undefined ? parseFloat(String(op.endPrecision)) : 0.01;
            const C_StartStop = op.startStop !== undefined ? parseFloat(String(op.startStop)) : 0.01; 
            
            // Calculate Density from Stitch Length
            const density = stitchLengthMm > 0 ? 10 / stitchLengthMm : 4;
            const baseSewingTime = (L * density) / speed;
            
            T_Machine = (baseSewingTime * F_Machine * F_Guide) + C_EndPrecision + C_StartStop;
        }

        // Logic: Calculate default Manual time if not set
        if (T_Manuel === 0 && T_Machine > 0) {
             if (L > 0 || isCounterMachine) {
                 if (isCounterMachine) {
                     T_Manuel = 0.18;
                 } else {
                     // Smart calculation based on length (0.005 min per cm handling approx)
                     // Minimum 0.15 min (9s) for handling short seams
                     T_Manuel = Math.max(0.15, L * 0.005);
                 }
             }
        }
    }

    const T_Total_Calc = (T_Machine + T_Manuel) * Majoration;

    let fabricPenalty = 0;
    if (fabricSettings.enabled) {
        const penaltySec = fabricSettings.values[fabricSettings.selected];
        fabricPenalty = penaltySec / 60; 
    }

    const T_Total = (op.forcedTime !== undefined && op.forcedTime !== null) 
                    ? op.forcedTime 
                    : T_Total_Calc + fabricPenalty;

    return { T_Total, T_Machine, T_Manuel, isMachine, isCounterMachine };
  };

  // --- ACTIONS ---
  const loadDemoData = () => {
      // Re-calculate times for demo data based on current machines config
      const computedOps = BLOUSE_OPS.map(op => {
          const { T_Total } = calculateOpTimes(op, '', machines);
          return { ...op, time: T_Total };
      });
      setOperations(computedOps);
      setArticleName("Chemisier Femme - Modèle Test");
  };

  const addOperation = () => {
    const newOp: Operation = {
      id: Date.now().toString(),
      order: operations.length + 1,
      description: '',
      machineId: '', 
      machineName: '',
      length: 0,
      manualTime: 0, 
      time: 0,
      guideFactor: 1.1
    };
    setOperations(prev => [...prev, newOp]);
  };

  const updateOperation = (id: string, field: keyof Operation, value: any) => {
    setOperations(prev => prev.map(op => {
      if (op.id !== id) return op;
      
      const updatedOp = { ...op, [field]: value };

      if (field === 'forcedTime') {
         updatedOp.forcedTime = value;
      } else if (field !== 'description' && field !== 'order' && field !== 'guideId' && field !== 'guideName' && field !== 'side') {
         updatedOp.forcedTime = undefined;
      }
      
      const { T_Total } = calculateOpTimes(updatedOp, updatedOp.machineId || '', machines);
      updatedOp.time = T_Total;
      
      return updatedOp;
    }));
  };

  const toggleSide = (id: string) => {
      setOperations(prev => prev.map(op => {
          if (op.id !== id) return op;
          const map: Record<string, 'G' | 'D' | 'GD' | undefined> = {
              'undefined': 'G',
              'G': 'D',
              'D': 'GD',
              'GD': undefined
          };
          return { ...op, side: map[op.side || 'undefined'] };
      }));
  };

  const handleSelectAll = () => {
      if (selectedOpIds.length === operations.length && operations.length > 0) {
          setSelectedOpIds([]);
          // Optionally exit selection mode if deselecting all
          // setIsSelectionMode(false); 
      } else {
          setSelectedOpIds(operations.map(o => o.id));
      }
  };

  const handleRowClick = (targetId: string) => {
      // If we are in "Linking" mode, clicking a row sets it as the TARGET
      if (isLinkingMode) {
          if (selectedOpIds.includes(targetId)) {
              // Can't link to itself if selected
              return;
          }
          setPendingLinkTarget(targetId);
      } else {
          // Normal selection behavior
          if (isSelectionMode) {
              toggleSelection(targetId);
          }
      }
  };

  // --- REORDER AND LINK FLUX ---
  const confirmFlux = () => {
      if (!pendingLinkTarget || selectedOpIds.length === 0) return;

      const targetId = pendingLinkTarget;
      const sourceIds = selectedOpIds;
      
      const newGroupId = `flux-${Date.now()}`;
      
      let finalOps = [...operations];

      // FORCE MOVE: EXTRACT SOURCE ITEMS AND INSERT BEFORE TARGET
      const sourcesOps = finalOps.filter(op => sourceIds.includes(op.id));
      const otherOps = finalOps.filter(op => !sourceIds.includes(op.id)); // Everything else, including target
      
      // Find where the Target is now in the reduced list
      const targetIndex = otherOps.findIndex(op => op.id === targetId);
      
      if (targetIndex !== -1) {
          // Update Sources with Group & Target data
          const updatedSources = sourcesOps.map(op => ({
              ...op,
              groupId: newGroupId,
              targetOperationId: targetId
          }));

          // Insert Sources IMMEDIATELY BEFORE the Target
          finalOps = [...otherOps];
          finalOps.splice(targetIndex, 0, ...updatedSources);
      }

      // Re-index Orders to lock in the new sequence
      finalOps.forEach((op, i) => op.order = i + 1);

      // Update State
      setOperations(finalOps);
      
      // Reset Modes
      setIsLinkingMode(false);
      setPendingLinkTarget(null);
      setSelectedOpIds([]);
      setIsSelectionMode(false); // Exit selection mode
  };

  const cancelFlux = () => {
      setIsLinkingMode(false);
      setPendingLinkTarget(null);
  };

  const clearFlux = (opId: string) => {
      setOperations(prev => prev.map(op => {
          if (op.id !== opId) return op;
          return { ...op, targetOperationId: undefined, groupId: undefined };
      }));
  };

  // --- CONTEXT MENU HANDLERS ---
  const handleContextMenu = (e: React.MouseEvent, opId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Viewport & Scroll
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Menu Dimensions (Estimated)
    const menuW = 240; // w-60 = 15rem = 240px
    const menuH = 380; // Estimated max height with all options

    // Click Position (Page Coords)
    let x = e.pageX;
    let y = e.pageY;
    
    // Click Position (Client Coords)
    const cx = e.clientX;
    const cy = e.clientY;

    // Horizontal Adjustment
    if (cx + menuW > vw - 10) {
        x -= menuW;
    }

    // Vertical Adjustment
    let align: 'top' | 'bottom' = 'top';
    const spaceBelow = vh - cy;
    const spaceAbove = cy;

    if (spaceBelow < menuH && spaceAbove > spaceBelow) {
        align = 'bottom';
        // Check if top cuts off (cy - menuH < 0?)
        // Top edge relative to viewport is cy - menuH (since bottom is at cy)
        if (cy - menuH < 10) {
            // If checking spaceAbove > spaceBelow, likely we have space, 
            // but if menu is HUGE and screen small, we might overflow top.
            // In that case, we need to shift y (anchor) down so top edge is visible.
            // Anchor is at y. Top is y - menuH.
            // We want y - menuH >= scrollY + 10
            const minY = scrollY + 10 + menuH;
            if (y < minY) y = minY;
        }
    } else {
        align = 'top';
        // Check if bottom cuts off
        // Bottom edge is cy + menuH
        if (cy + menuH > vh - 10) {
            // Shift y up so bottom edge is visible.
            // Bottom edge is y + menuH.
            // We want y + menuH <= scrollY + vh - 10
            const maxY = scrollY + vh - 10 - menuH;
            if (y > maxY) y = maxY;
        }
    }

    // USE PAGE COORDINATES FOR ABSOLUTE POSITIONING (SCROLLABLE)
    setContextMenu({
        visible: true,
        x,
        y,
        opId,
        align
    });
  };

  const handleContextAction = (action: 'insert' | 'delete' | 'clear' | 'copy' | 'cut' | 'paste' | 'select' | 'selectGroup' | 'link' | 'unlink' | 'setFlux' | 'targetThis' | 'duplicate') => {
      if (!contextMenu?.opId) return;
      
      const idx = operations.findIndex(o => o.id === contextMenu.opId);
      if (idx === -1) return;

      let newOps = [...operations];

      switch(action) {
          case 'setFlux':
              // ACTIVATE LINKING MODE
              // If single row right-clicked and not selected, select it first
              if (!selectedOpIds.includes(contextMenu.opId)) {
                  setSelectedOpIds([contextMenu.opId]);
              }
              setIsLinkingMode(true);
              setIsSelectionMode(true); // Ensure selection mode is active
              setContextMenu(null);
              return;
          case 'targetThis':
              // This is called when selecting the TARGET row
              setPendingLinkTarget(contextMenu.opId);
              setIsLinkingMode(true); // Ensure linking mode is active if triggered directly
              setContextMenu(null);
              return;
          case 'select':
              setIsSelectionMode(true); // Activate Selection Mode
              const isSelected = selectedOpIds.includes(contextMenu.opId);
              if (isSelected) {
                  setSelectedOpIds(prev => prev.filter(id => id !== contextMenu.opId));
              } else {
                  setSelectedOpIds(prev => [...prev, contextMenu.opId!]);
              }
              break;
          case 'selectGroup':
              setIsSelectionMode(true); // Activate Selection Mode
              const targetOp = operations.find(o => o.id === contextMenu.opId);
              if (targetOp?.groupId) {
                  const groupIds = operations.filter(o => o.groupId === targetOp.groupId).map(o => o.id);
                  // Merge with existing selection, avoiding duplicates
                  setSelectedOpIds(prev => Array.from(new Set([...prev, ...groupIds])));
              }
              break;
          case 'link':
              if (selectedOpIds.length > 1) {
                  const newGroupId = `group-${Date.now()}`;
                  // Link selected operations (Simple Grouping without Move)
                  newOps = newOps.map(op => {
                      if (selectedOpIds.includes(op.id)) {
                          return { ...op, groupId: newGroupId };
                      }
                      return op;
                  });
                  setOperations(newOps);
                  setSelectedOpIds([]);
                  setIsSelectionMode(false); // Done
              }
              break;
          case 'unlink':
              // Unlink only the right-clicked operation if grouped, or all selected if multiple
              const targetIds = selectedOpIds.length > 0 ? selectedOpIds : [contextMenu.opId];
              newOps = newOps.map(op => {
                  if (targetIds.includes(op.id)) {
                      const { groupId, targetOperationId, ...rest } = op;
                      return rest;
                  }
                  return op;
              });
              setOperations(newOps);
              setSelectedOpIds([]);
              break;
          case 'insert':
              const newOp: Operation = {
                  id: Date.now().toString(),
                  order: 0,
                  description: '',
                  machineId: '',
                  machineName: '',
                  length: 0,
                  manualTime: 0,
                  time: 0,
                  guideFactor: 1.1
              };
              newOps.splice(idx + 1, 0, newOp);
              break;
          case 'duplicate':
              const opToDuplicate = newOps[idx];
              const duplicatedOp: Operation = {
                  ...opToDuplicate,
                  id: Date.now().toString(),
                  // Clear flux/group to avoid confusion, but keep properties
                  groupId: undefined,
                  targetOperationId: undefined
              };
              newOps.splice(idx + 1, 0, duplicatedOp);
              break;
          case 'delete':
              newOps.splice(idx, 1);
              break;
          case 'clear':
              newOps[idx] = {
                  ...newOps[idx],
                  description: '',
                  machineId: '',
                  machineName: '',
                  length: 0,
                  manualTime: 0,
                  time: 0,
                  guideFactor: 1.1,
                  forcedTime: undefined,
                  guideId: undefined,
                  guideName: undefined
              };
              break;
          case 'copy':
              setClipboard({ op: { ...operations[idx] }, mode: 'copy' });
              break;
          case 'cut':
              setClipboard({ op: { ...operations[idx] }, mode: 'cut' });
              break;
          case 'paste':
              if (clipboard?.op) {
                  const pastedOp = { 
                      ...clipboard.op, 
                      id: newOps[idx].id, 
                      order: newOps[idx].order 
                  };
                  newOps[idx] = pastedOp;
                  
                  const { T_Total } = calculateOpTimes(pastedOp, pastedOp.machineId || '', machines);
                  newOps[idx].time = T_Total;

                  if (clipboard.mode === 'cut') {
                      const originalIdx = newOps.findIndex(o => o.id === clipboard.op!.id);
                      if (originalIdx !== -1 && originalIdx !== idx) {
                          newOps.splice(originalIdx, 1);
                      }
                      setClipboard(null);
                  }
              }
              break;
      }

      newOps.forEach((op, i) => op.order = i + 1);
      setOperations(newOps);
      setContextMenu(null);
  };

  const toggleSelection = (id: string) => {
      setSelectedOpIds(prev => {
          if (prev.includes(id)) {
              return prev.filter(i => i !== id);
          } else {
              return [...prev, id];
          }
      });
  };

  // --- RECALCULATE ALL WHEN FABRIC SETTINGS CHANGE ---
  useEffect(() => {
      setOperations(prev => prev.map(op => {
          const { T_Total } = calculateOpTimes(op, op.machineId || '', machines);
          return { ...op, time: T_Total };
      }));
  }, [fabricSettings]);

  // --- AUTOCOMPLETE LOGIC ---
  const handleDescriptionChange = (val: string, opId: string) => {
      setOperations(prev => prev.map(o => {
          if (o.id !== opId) return o;
          
          let newGuideId = o.guideId;
          let newGuideName = o.guideName;
          
          // ALWAYS try to find a best guide if machine is known (Auto-Classify)
          // This allows dynamic updates as the user types
          if (o.machineName) {
              const suggested = findBestGuide(val, o.machineName);
              if (suggested) {
                  newGuideId = suggested.id;
                  newGuideName = suggested.name;
              }
          }

          const updatedOp = { ...o, description: val, guideId: newGuideId, guideName: newGuideName };
          
          const { T_Total } = calculateOpTimes(updatedOp, updatedOp.machineId || '', machines);
          updatedOp.time = T_Total;
          
          return updatedOp;
      }));
  };

  // --- SELF LEARNING LOGIC ---
  const handleDescriptionBlur = (description: string) => {
      if (!description) return;

      const words = description.split(/\s+/);
      const newWords: string[] = [];

      words.forEach(w => {
          const cleanWord = w.trim();
          if (cleanWord.length > 2 && isNaN(Number(cleanWord))) {
              const exists = fullVocabulary.some(v => (v || '').toLowerCase() === cleanWord.toLowerCase());
              if (!exists) {
                  newWords.push(cleanWord);
              }
          }
      });

      if (newWords.length > 0) {
          setUserVocabulary(prev => [...prev, ...newWords]);
      }
  };

  const assignGuide = (opId: string, guide: Guide) => {
      setOperations(prev => prev.map(op => {
          if (op.id !== opId) return op;
          return { ...op, guideId: guide.id, guideName: guide.name };
      }));
      setShowGuideModal(null);
  };

  const updateGuideName = (opId: string, name: string) => {
      setOperations(prev => prev.map(op => {
          if (op.id !== opId) return op;
          return { ...op, guideName: name, guideId: undefined }; 
      }));
  };

  const clearGuide = (opId: string) => {
      setOperations(prev => prev.map(op => {
          if (op.id !== opId) return op;
          return { ...op, guideName: '', guideId: undefined }; 
      }));
  };

  const handleMachineChange = (id: string, value: string) => {
    const matchedMachine = machines.find(m => 
      (m.name || '').toLowerCase() === value.toLowerCase() || 
      (m.classe || '').toLowerCase() === value.toLowerCase()
    );
    
    setOperations(prev => prev.map(op => {
      if (op.id !== id) return op;
      
      const updatedOp = { 
        ...op, 
        machineName: value,
        machineId: matchedMachine ? matchedMachine.id : '',
        forcedTime: undefined 
      };

      if (!updatedOp.guideName || updatedOp.guideName === '') {
          const suggested = findBestGuide(updatedOp.description, value);
          if (suggested) {
              updatedOp.guideId = suggested.id;
              updatedOp.guideName = suggested.name;
          }
      }

      const { T_Total } = calculateOpTimes(updatedOp, updatedOp.machineId || '', machines);
      updatedOp.time = T_Total;
      return updatedOp;
    }));
  };

  const deleteOperation = (id: string) => {
    setOperations(prev => prev.filter(o => o.id !== id));
  };

  const applyGlobalGuide = () => {
    setOperations(prev => prev.map(op => {
      const updatedOp = { ...op, guideFactor: globalGuide, forcedTime: undefined };
      const { T_Total } = calculateOpTimes(updatedOp, updatedOp.machineId || '', machines);
      updatedOp.time = T_Total;
      return updatedOp;
    }));
  };

  const updateFabricValue = (key: 'easy' | 'medium' | 'hard', val: number) => {
      setFabricSettings(prev => ({
          ...prev,
          values: { ...prev.values, [key]: val }
      }));
  };

  const selectFabricLevel = (level: 'easy' | 'medium' | 'hard') => {
      setFabricSettings(prev => ({ ...prev, selected: level }));
  };

  const handleAiAssist = async () => {
    if (!aiPrompt.trim()) return;
    
    const userMsg = aiPrompt;
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setAiPrompt('');
    setIsAnalyzing(true);
    
    try {
      const analysisText = await analyzeTextileContext(operations, machines, userMsg);
      setChatHistory(prev => [...prev, { role: 'ai', content: analysisText || "Je n'ai pas pu analyser la gamme." }]);
    } catch (error: any) {
      setChatHistory(prev => [...prev, { role: 'ai', content: "Erreur de connexion avec l'IA." }]);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLTableRowElement>, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    
    const newOps = [...operations];
    const itemToMove = newOps[draggedIndex];
    
    // Check if moving a group
    if (itemToMove.groupId) {
        // Find all items in this group
        const groupIndices = newOps
            .map((op, idx) => op.groupId === itemToMove.groupId ? idx : -1)
            .filter(idx => idx !== -1);
            
        // Extract group items (sort indices descending to remove safely)
        const groupItems = groupIndices.map(idx => newOps[idx]);
        
        // Remove from old positions (iterate backwards)
        for (let i = groupIndices.length - 1; i >= 0; i--) {
            newOps.splice(groupIndices[i], 1);
        }
        
        // Determine insertion index
        // If we dragged downwards, we need to adjust dropIndex because items were removed
        let insertAt = dropIndex;
        const itemsRemovedBeforeDrop = groupIndices.filter(idx => idx < dropIndex).length;
        insertAt -= itemsRemovedBeforeDrop;
        
        // Insert group items
        newOps.splice(insertAt, 0, ...groupItems);
    } else {
        // Single item move
        newOps.splice(draggedIndex, 1);
        newOps.splice(dropIndex, 0, itemToMove);
    }
    
    // Re-index order
    newOps.forEach((op, i) => op.order = i + 1);
    setOperations(newOps);
    setDraggedIndex(null);
  };

  // --- CALCULATIONS FOR HEADER ---
  const totalMin = operations.reduce((sum, op) => sum + (op.time || 0), 0);
  const tempsArticle = totalMin * 1.20; 

  // Prepare suggestions for Machine Input (combining name and classe)
  const machineSuggestions = useMemo(() => {
      return machines.flatMap(m => [m.name, m.classe]);
  }, [machines]);

  const activeOp = operations.find(o => o.id === contextMenu?.opId);
  const isPartOfGroup = !!activeOp?.groupId;

  // --- PENDING TARGET INFO ---
  const targetOpInfo = operations.find(o => o.id === pendingLinkTarget);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-300 relative">
      
       {/* 1. SINGLE ROW HEADER - RESPONSIVE (UNCHANGED) */}
       <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 p-2 flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar">
            {/* ... (Header Stats - Identical to previous) ... */}
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
                    {Math.round((tempsArticle > 0 && presenceTime > 0) ? ((presenceTime * numWorkers) / tempsArticle) / (presenceTime / 60) : 0)}
                </span>
            </div>

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

            <div className="ml-auto px-4 py-1.5 bg-purple-100 rounded-lg border border-purple-200 flex flex-col items-end shrink-0">
                <span className="text-[9px] font-bold text-purple-500 uppercase flex items-center gap-1"><Timer className="w-3 h-3" /> T. Article</span>
                <span className="font-black text-purple-700 text-xl leading-none">{tempsArticle.toFixed(2)}</span>
            </div>
       </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px] relative">
        
        {/* SMALL FLOATING TOAST: LINKING MODE ACTIF (Top Center) - Disappears after 7s */}
        {isLinkingMode && showLinkNotification && !pendingLinkTarget && createPortal(
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] bg-indigo-600 text-white pl-4 pr-2 py-2 rounded-full shadow-xl flex items-center gap-3 animate-in slide-in-from-top-5 duration-300 pointer-events-none">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <MousePointerClick className="w-4 h-4 text-indigo-200" />
                    <span className="text-xs font-bold">Mode Flux Actif</span>
                </div>
                <button 
                    onClick={cancelFlux}
                    className="p-1 hover:bg-white/20 rounded-full transition-colors pointer-events-auto"
                    title="Annuler"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>,
            document.body
        )}

        {/* COMPACT FLOATING BAR: CONFIRMATION (Bottom Center) */}
        {pendingLinkTarget && targetOpInfo && createPortal(
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] bg-white border border-emerald-200 pl-4 pr-1.5 py-1.5 rounded-full shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-300 min-w-[320px]">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-emerald-100 rounded-full text-emerald-600">
                        <LinkIcon className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wide">Lier & Regrouper vers</span>
                        <span className="text-xs font-bold text-slate-800 max-w-[150px] truncate" title={targetOpInfo.description}>
                            {targetOpInfo.description}
                        </span>
                    </div>
                </div>
                
                <div className="flex items-center gap-1 ml-auto">
                    <button 
                        onClick={cancelFlux}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                        title="Annuler"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <div className="w-px h-6 bg-slate-100 mx-1"></div>
                    <button 
                        onClick={confirmFlux}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full text-xs font-bold shadow-lg shadow-emerald-200 transition-all flex items-center gap-2 active:scale-95"
                    >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Confirmer
                    </button>
                </div>
            </div>,
            document.body
        )}

        {/* FLOATING ACTION BAR FOR SELECTION - NOW CONTROLS EXIT */}
        {isSelectionMode && !isLinkingMode && createPortal(
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] bg-white border border-slate-200 pl-4 pr-1.5 py-1.5 rounded-full shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-300 min-w-[220px]">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-100 rounded-full text-indigo-600">
                        <CheckSquare className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-700">Mode Sélection {selectedOpIds.length > 0 && `(${selectedOpIds.length})`}</span>
                </div>
                <div className="h-4 w-px bg-slate-200"></div>
                
                {selectedOpIds.length > 0 && (
                    <button onClick={() => handleContextAction('link')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-bold transition-colors flex items-center gap-2">
                        <LinkIcon className="w-3.5 h-3.5" /> Figer
                    </button>
                )}

                <button 
                    onClick={() => { setSelectedOpIds([]); setIsSelectionMode(false); }} 
                    className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-full transition-colors" 
                    title="Quitter Mode Sélection"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>,
            document.body
        )}

        {/* RESPONSIVE TOOLBAR */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white">
          <h3 className="font-bold text-slate-700 flex items-center gap-2 text-lg">
            <ClipboardList className="w-5 h-5 text-slate-400" />
            Gamme de Montage
          </h3>

          {/* ... Toolbar Content ... */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 w-full md:w-auto">
             
             {/* Guide Factors & Fabric */}
             <div className="flex items-center justify-between gap-1 px-2 py-1 bg-slate-50 rounded-lg border border-slate-100 w-full sm:w-auto">
                 <label className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap mr-1">F.Guide:</label>
                 <div className="relative">
                      <select 
                        value={globalGuide}
                        onChange={(e) => setGlobalGuide(Number(e.target.value))}
                        className="appearance-none w-14 px-1 py-1.5 text-xs font-bold border border-slate-200 rounded focus:border-emerald-500 outline-none bg-white shadow-sm transition-all pr-4 cursor-pointer text-center"
                      >
                         {complexityFactors.map(f => (
                           <option key={f.id} value={f.value}>{f.value}</option>
                         ))}
                      </select>
                      <ChevronDown className="absolute right-0.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                 </div>
                 <button 
                    onClick={() => setShowFabricModal(true)}
                    className={`p-1.5 rounded-md border transition-colors shadow-sm ml-1 ${fabricSettings.enabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700'}`}
                    title="Choisir selon le tissu"
                 >
                    <Shirt className="w-3.5 h-3.5" />
                 </button>
                 <button onClick={applyGlobalGuide} title="Appliquer à toute la gamme" className="p-1.5 bg-white hover:bg-emerald-50 hover:text-emerald-700 text-slate-400 rounded-md border border-slate-200 transition-colors shadow-sm ml-1">
                     <ArrowDownToLine className="w-3.5 h-3.5" />
                 </button>
             </div>

             {/* Action Buttons Group */}
             <div className="flex gap-2 w-full sm:w-auto">
                 
                 {/* Selection Mode Toggle */}
                 <button 
                   onClick={() => setIsSelectionMode(!isSelectionMode)}
                   className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                       isSelectionMode 
                       ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200' 
                       : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                   }`}
                   title="Activer/Désactiver le mode sélection"
                 >
                   <CheckSquare className="w-4 h-4" />
                   <span className="hidden sm:inline">Sélection</span>
                 </button>

                 <button 
                   onClick={() => setShowLength(prev => !prev)}
                   className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition-colors"
                 >
                   <Ruler className="w-4 h-4" />
                   <span className="hidden sm:inline">{showLength ? 'Masquer L' : 'Afficher L'}</span>
                   <span className="sm:hidden">L</span>
                 </button>
                 
                 <button 
                   onClick={handleAutoAssignGuides}
                   className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg font-bold shadow-md shadow-orange-100 transition-all active:scale-95 text-xs uppercase tracking-wide"
                   title="Attribuer automatiquement les guides"
                 >
                   <Wand2 className="w-4 h-4" />
                   <span className="hidden sm:inline">Auto-Guides</span>
                   <span className="sm:hidden">Auto</span>
                 </button>

                 <button 
                   onClick={loadDemoData}
                   className="flex-1 flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-2 rounded-lg font-bold shadow-md shadow-indigo-100 transition-all active:scale-95 text-xs uppercase tracking-wide"
                   title="Charger un modèle exemple (Blouse)"
                 >
                   <FileText className="w-4 h-4" />
                   <span className="hidden sm:inline">Modèle Test</span>
                   <span className="sm:hidden">Test</span>
                 </button>

                 <button 
                   onClick={addOperation}
                   className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold shadow-md shadow-emerald-100 transition-all active:scale-95 text-xs uppercase tracking-wide"
                 >
                   <Plus className="w-4 h-4" />
                   Ajouter
                 </button>
             </div>
          </div>
        </div>

        {/* TABLE CONTAINER - SCROLLABLE */}
        <div className="flex-1 overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[800px]">
            {/* ... Rest of Table Render Logic Unchanged ... */}
            <thead>
              <tr className="bg-white text-slate-500 border-b border-slate-100">
                {/* CHECKBOX COLUMN - VISIBLE ONLY IN SELECTION MODE */}
                {isSelectionMode && (
                    <th className="py-4 px-2 w-8 text-center font-bold text-[11px] text-slate-400 sticky left-0 bg-white z-20 border-r border-slate-100">
                        <button 
                            onClick={handleSelectAll} 
                            className="hover:text-indigo-600 transition-colors focus:outline-none"
                            title="Tout sélectionner / Désélectionner"
                        >
                            {selectedOpIds.length === operations.length && operations.length > 0 ? (
                                <div className="w-4 h-4 border rounded bg-indigo-600 border-indigo-600 flex items-center justify-center text-white">
                                    <Check className="w-3 h-3" />
                                </div>
                            ) : (
                                <div className="w-4 h-4 border rounded border-slate-300"></div>
                            )}
                        </button>
                    </th>
                )}
                
                <th className={`py-4 px-4 w-12 text-center font-bold text-[11px] uppercase tracking-wider text-slate-400 sticky ${isSelectionMode ? 'left-8' : 'left-0'} bg-white z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>N°</th>
                
                {/* SIDE COLUMN HEADER - COMPACT & ALWAYS VISIBLE */}
                <th className={`py-4 px-1 w-10 text-center font-bold text-[11px] uppercase tracking-wider text-slate-400 sticky ${isSelectionMode ? 'left-20' : 'left-12'} bg-white z-20 border-r border-slate-50`} title="Côté (G/D)">C</th>
                
                <th className="py-4 px-4 font-bold text-[11px] uppercase tracking-wider text-slate-400 min-w-[200px]">Description de l'opération</th>
                <th className="py-4 px-4 w-40 font-bold text-[11px] uppercase tracking-wider text-slate-400">Machine</th>
                <th className="py-4 px-4 w-24 text-center font-bold text-[11px] uppercase tracking-wider text-slate-400">F. Guide</th>
                {showLength && (
                  <th className="py-4 px-4 w-20 text-center font-bold text-[11px] uppercase tracking-wider text-indigo-600">L / Qté</th>
                )}
                <th className="py-4 px-4 w-24 text-center font-bold text-[11px] uppercase tracking-wider text-orange-600">Guide</th>
                <th className="py-4 px-4 w-24 text-center font-bold text-[11px] uppercase tracking-wider text-emerald-600">CHRONO</th>
                <th className="py-4 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {operations.map((op, index) => {
                const machineValue = op.machineName || (op.machineId ? machines.find(m => m.id === op.machineId)?.name : '') || '';
                let matchedMachine = machines.find(m => m.id === op.machineId);
                if (!matchedMachine && machineValue) {
                     const val = machineValue.trim().toLowerCase();
                     matchedMachine = machines.find(m => (m.name || '').toLowerCase().includes(val) || (m.classe || '').toLowerCase().includes(val));
                }
                const isMachineValid = machineValue === '' || !!matchedMachine;
                
                const { T_Total, isMachine, isCounterMachine } = calculateOpTimes(op, matchedMachine ? matchedMachine.id : '', machines);
                
                const currentChronoSec = Math.round(T_Total * 60);
                
                const isForced = op.forcedTime !== undefined && op.forcedTime !== null;
                const chronoInputClass = isForced 
                    ? "bg-purple-50 text-purple-700 border-purple-200 focus:border-purple-500 focus:bg-purple-100 font-black shadow-sm"
                    : (isMachine ? 'bg-slate-50 text-slate-600 border-slate-200 focus:bg-white focus:border-indigo-300' : 'bg-emerald-50/40 border-emerald-100 text-emerald-700 focus:border-emerald-500 focus:bg-white');

                const currentGuide = op.guideFactor ?? 1.1;
                const assignedGuideName = op.guideName || (op.guideId ? guides.find(g => g.id === op.guideId)?.name : '') || '';

                const isSelected = selectedOpIds.includes(op.id);
                const hasGroup = !!op.groupId;
                // Group Styling: Use specific background color for linked rows based on groupId
                const groupStyle = op.groupId ? getGroupStyle(op.groupId) : null;
                let groupClasses = "";
                let groupBorderLeft = "";
                if (groupStyle) {
                    groupClasses = `${groupStyle.bg} hover:${groupStyle.bg.replace('50','100')}`;
                    groupBorderLeft = `border-l-4 ${groupStyle.border}`;
                }
                
                // Highlight row when in linking mode
                const isLinkSource = selectedOpIds.includes(op.id);
                const isTargetRow = pendingLinkTarget === op.id;
                
                const linkModeClasses = isLinkingMode 
                    ? (isLinkSource 
                        ? 'bg-indigo-100/80 border-indigo-200' 
                        : (isTargetRow ? 'bg-emerald-100 ring-2 ring-emerald-500 z-30' : 'hover:bg-emerald-50 cursor-crosshair opacity-60'))
                    : '';

                // LOGIC: Find if this row is a TARGET for any flux (Incoming)
                const incomingOps = operations.filter(o => o.targetOperationId === op.id);
                // We want the last operation in the source group (highest index)
                const maxIndexOp = incomingOps.reduce((prev, current) => {
                    return (getGlobalIndex(prev.id) > getGlobalIndex(current.id)) ? prev : current;
                }, incomingOps[0]); // Initial value is first item or undefined
                
                // UPDATED: Use getOpDisplayId instead of incomingIndex
                const incomingDisplayId = maxIndexOp ? getOpDisplayId(maxIndexOp.id) : null;

                // Side Logic styling
                let sideBadgeClass = "text-slate-300 bg-slate-50 border-slate-200 hover:bg-slate-100 hover:text-slate-500";
                let sideText = "-";
                if (op.side === 'G') {
                    sideBadgeClass = "bg-sky-50 text-sky-700 border-sky-200 font-bold hover:bg-sky-100";
                    sideText = "G";
                } else if (op.side === 'D') {
                    sideBadgeClass = "bg-orange-50 text-orange-700 border-orange-200 font-bold hover:bg-orange-100";
                    sideText = "D";
                } else if (op.side === 'GD') {
                    sideBadgeClass = "bg-purple-50 text-purple-700 border-purple-200 font-bold hover:bg-purple-100";
                    sideText = "G/D";
                }

                return (
                  <tr 
                    key={op.id} 
                    draggable={!isLinkingMode}
                    onContextMenu={(e) => handleContextMenu(e, op.id)}
                    onClick={() => handleRowClick(op.id)} 
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    className={`group transition-colors ${linkModeClasses} ${draggedIndex === index ? 'bg-emerald-50 opacity-50' : ''} ${isSelected && !isLinkingMode ? 'bg-indigo-100 hover:bg-indigo-200' : (!isLinkingMode ? 'hover:bg-slate-50' : '')} ${groupClasses}`}
                  >
                    {/* CHECKBOX CELL - VISIBLE ONLY IN SELECTION MODE */}
                    {isSelectionMode && (
                        <td 
                            onClick={(e) => { e.stopPropagation(); toggleSelection(op.id); }}
                            className={`py-3 px-2 text-center sticky left-0 z-20 border-r border-slate-100 cursor-pointer transition-colors ${groupBorderLeft} ${isSelected ? 'bg-indigo-100' : (hasGroup && groupStyle ? groupStyle.bg : 'bg-white hover:bg-slate-100')}`}
                        >
                            <div className={`w-4 h-4 border rounded mx-auto flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                        </td>
                    )}

                    <td className={`py-3 px-2 text-center cursor-move sticky ${isSelectionMode ? 'left-8' : 'left-0'} bg-white group-hover:bg-slate-50 z-20 border-r border-transparent group-hover:border-slate-100 transition-colors ${isSelected ? 'bg-indigo-100' : (hasGroup ? groupStyle?.bg : '')} ${hasGroup ? (groupStyle ? groupStyle.text : 'text-indigo-600') + ' font-black' : ''}`}>
                        <div className="flex items-center justify-center w-8 mx-auto gap-1 text-indigo-600 group-hover:text-emerald-600">
                            <span className="font-mono text-xs font-bold">{getDisplayIndex(op, index)}</span>
                            {!isLinkingMode && <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500 transition-colors" />}
                        </div>
                    </td>
                    
                    {/* SIDE COLUMN - COMPACT */}
                    <td className={`py-3 px-1 text-center sticky ${isSelectionMode ? 'left-20' : 'left-12'} bg-white z-20 border-r border-slate-50 group-hover:bg-slate-50 transition-colors`}>
                        <button 
                            onClick={(e) => { e.stopPropagation(); toggleSide(op.id); }}
                            className={`w-7 h-7 rounded-lg border flex items-center justify-center text-[10px] transition-all mx-auto select-none shadow-sm ${sideBadgeClass}`}
                            title="Changer Côté (G/D)"
                        >
                            {sideText}
                        </button>
                    </td>

                    <td className="py-3 px-4 relative">
                      <div className="relative w-full">
                          {/* USING EXCEL INPUT FOR DESCRIPTION */}
                          <div className="flex flex-col">
                              <ExcelInput
                                suggestions={fullVocabulary}
                                value={op.description}
                                onChange={(val) => handleDescriptionChange(val, op.id)}
                                onBlur={(e) => handleDescriptionBlur(e.target.value)}
                                placeholder="Saisir description..."
                                className="relative z-10 w-full bg-transparent border-none outline-none font-medium text-slate-700 placeholder:text-slate-300 focus:placeholder:text-slate-400 text-sm disabled:cursor-not-allowed"
                                containerClassName="w-full"
                                disabled={isLinkingMode} // Disable text editing when linking
                              />
                              
                              {/* BADGE: INCOMING FLUX (TARGET) - Shows where it comes from */}
                              {incomingDisplayId && (
                                  <div className="flex items-center gap-1 mt-1.5 group/flux">
                                      <div className="relative flex items-center">
                                          <ArrowLeftToLine className="w-3 h-3 text-emerald-500 -ml-0.5 mr-1" />
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm cursor-help" title={`Cette opération reçoit le flux de l'opération N°${incomingDisplayId}`}>
                                              Provient de N° {incomingDisplayId}
                                          </span>
                                      </div>
                                  </div>
                              )}

                              {/* BADGE: OUTGOING FLUX (SOURCE) */}
                              {op.targetOperationId && (
                                  <div className="flex items-center gap-1 mt-1.5 group/flux">
                                      <div className="relative flex items-center">
                                          <CornerDownRight className="w-3 h-3 text-blue-400 -ml-0.5 mr-1" />
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shadow-sm hover:bg-blue-100 transition-colors">
                                              Vers N° {getOpDisplayId(op.targetOperationId)}
                                              <button 
                                                onClick={(e) => { e.stopPropagation(); clearFlux(op.id); }}
                                                className="ml-1 hover:text-red-500 text-blue-400 p-0.5 rounded-full hover:bg-white transition-all"
                                                title="Supprimer le lien"
                                              >
                                                  <X className="w-2.5 h-2.5" />
                                              </button>
                                          </span>
                                      </div>
                                  </div>
                              )}
                          </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        {/* USING EXCEL INPUT FOR MACHINES */}
                        <ExcelInput
                          suggestions={machineSuggestions}
                          value={machineValue}
                          onChange={(val) => handleMachineChange(op.id, val)}
                          className={`w-full bg-slate-100/50 border border-slate-200 rounded-lg px-2 py-2 text-xs outline-none focus:border-emerald-500 focus:bg-white transition-all placeholder:text-slate-400 ${!isMachineValid && machineValue ? 'text-rose-500 font-bold border-rose-200 bg-rose-50/50' : 'text-slate-700'}`}
                          placeholder="Mac"
                          containerClassName="w-full"
                          disabled={isLinkingMode}
                        />
                      </div>
                    </td>
                    {/* ... Rest of row cells ... */}
                    <td className="py-3 px-2">
                         <div className="relative group/select">
                           <select
                            value={currentGuide}
                            onChange={(e) => updateOperation(op.id, 'guideFactor', Number(e.target.value))}
                            disabled={isLinkingMode}
                            className="w-full bg-slate-100/50 border border-slate-200 rounded-lg pl-1 pr-4 py-2 text-center text-xs font-bold outline-none focus:border-emerald-500 transition-all text-slate-600 appearance-none cursor-pointer hover:bg-white hover:shadow-sm disabled:opacity-50"
                           >
                             {complexityFactors.map(f => (
                                 <option key={f.id} value={f.value}>{f.value}</option>
                             ))}
                           </select>
                           <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none group-hover/select:text-emerald-500 transition-colors" />
                        </div>
                    </td>
                    {showLength && (
                      <td className="py-3 px-4">
                        <div className="relative">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            onKeyDown={(e) => ["-", "e", "+", "E", ".", ","].includes(e.key) && e.preventDefault()}
                            value={op.length === 0 ? '' : op.length}
                            onChange={(e) => updateOperation(op.id, 'length', Math.floor(Number(e.target.value)))}
                            onFocus={(e) => e.target.select()}
                            disabled={isLinkingMode}
                            className={`w-full border rounded-lg px-1 py-2 text-center text-xs font-mono font-bold outline-none transition-all ${
                                isCounterMachine 
                                ? 'bg-amber-50 text-amber-700 border-amber-200 focus:border-amber-400' 
                                : 'bg-indigo-50/30 text-indigo-700 border-indigo-100 focus:border-indigo-500'
                            }`}
                            placeholder={isCounterMachine ? "Qté" : "-"}
                          />
                        </div>
                      </td>
                    )}
                    <td className="py-3 px-4 text-center">
                        <div className="relative flex items-center justify-center gap-1 group/guide-col">
                            <input 
                                type="text"
                                value={assignedGuideName}
                                onChange={(e) => updateGuideName(op.id, e.target.value)}
                                placeholder="-"
                                disabled={isLinkingMode}
                                className={`w-full px-2 py-1.5 rounded-lg border text-xs font-bold outline-none transition-all pr-5 ${
                                    assignedGuideName 
                                    ? 'bg-orange-50 border-orange-200 text-orange-700 focus:ring-1 focus:ring-orange-300' 
                                    : 'bg-white border-dashed border-slate-200 text-slate-500 hover:border-orange-300 focus:border-orange-400'
                                }`}
                            />
                            {!isLinkingMode && assignedGuideName && (
                                <button 
                                    onClick={() => clearGuide(op.id)}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover/guide-col:opacity-100"
                                    title="Supprimer le guide"
                                >
                                    <Minus className="w-3 h-3" />
                                </button>
                            )}
                            {!isLinkingMode && !assignedGuideName && (
                                <button 
                                    onClick={() => setShowGuideModal({ opId: op.id, machineName: machineValue })}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-orange-500 transition-colors opacity-0 group-hover/guide-col:opacity-100"
                                    title="Choisir dans la liste"
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </td>
                    <td className="py-3 px-4">
                       <div className="relative flex items-center justify-center">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={currentChronoSec === 0 ? '' : currentChronoSec}
                            onKeyDown={(e) => ["-", "e", "+", "E"].includes(e.key) && e.preventDefault()}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                                const valSec = Math.max(0, Number(e.target.value));
                                const valMin = valSec / 60;
                                updateOperation(op.id, 'forcedTime', valMin);
                            }}
                            disabled={isLinkingMode}
                            className={`w-full border rounded-lg px-2 py-2 text-center text-xs font-mono outline-none transition-all placeholder:text-emerald-200 ${chronoInputClass}`}
                            placeholder="0"
                            title={isForced ? "Temps forcé manuellement" : "Temps calculé"}
                          />
                       </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!isLinkingMode && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteOperation(op.id); }} 
                            className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {/* ALWAYS SHOW ADD ROW - REMOVED operations.length CHECK */}
              <tr>
                <td colSpan={(isSelectionMode || isLinkingMode ? 1 : 0) + (showLength ? 9 : 8)} className="py-3 px-4">
                  
                  {operations.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl mb-4 bg-slate-50/50">
                          <p className="text-sm font-medium mb-3">La gamme est vide.</p>
                          <button 
                            onClick={loadDemoData}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-lg text-xs font-bold transition-colors"
                          >
                              <FileText className="w-4 h-4" /> Charger un modèle test (Blouse)
                          </button>
                      </div>
                  )}

                  <button 
                    onClick={addOperation}
                    className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition-all flex items-center justify-center gap-2 font-medium text-sm group"
                  >
                    <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    Ajouter une ligne
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ... (Existing Portals for Modals) ... */}
      {showFabricModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop with stronger blur and dark overlay */}
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowFabricModal(false)} />
            
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-10">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Shirt className="w-5 h-5 text-emerald-500" />
                        Difficulté Tissu
                    </h3>
                    <button onClick={() => setShowFabricModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-5 space-y-5">
                    
                    {/* Difficulty Selector */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Niveau de difficulté</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['easy', 'medium', 'hard'] as const).map(level => (
                                <button
                                    key={level}
                                    onClick={() => selectFabricLevel(level)}
                                    className={`flex flex-col items-center justify-center py-3 px-1 rounded-xl border-2 transition-all ${
                                        fabricSettings.selected === level
                                        ? (level === 'easy' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : level === 'medium' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-rose-50 border-rose-500 text-rose-700')
                                        : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="text-xs font-bold capitalize">{level === 'easy' ? 'Facile' : level === 'medium' ? 'Moyen' : 'Difficile'}</span>
                                </button>
                            ))}
                        </div>
                        
                        {/* Fabric Description Text */}
                        <div className={`text-xs p-2 rounded-lg border text-center ${
                            fabricSettings.selected === 'easy' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                            fabricSettings.selected === 'medium' ? 'bg-orange-50 border-orange-100 text-orange-600' :
                            'bg-rose-50 border-rose-100 text-rose-600'
                        }`}>
                            <span className="font-bold mr-1">Exemples:</span>
                            {fabricSettings.selected === 'easy' && "Coton, Popeline, Jersey stable"}
                            {fabricSettings.selected === 'medium' && "Denim, Velours, Maille légère"}
                            {fabricSettings.selected === 'hard' && "Soie, Mousseline, Cuir, Satin"}
                        </div>
                    </div>
                    
                    {/* Penalty Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pénalité (Secondes)</label>
                        <div className="relative">
                            <input 
                                type="number" 
                                value={fabricSettings.values[fabricSettings.selected]}
                                onChange={(e) => updateFabricValue(fabricSettings.selected, Number(e.target.value))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">Sec</span>
                        </div>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Info className="w-3 h-3" /> Ajouté à chaque opération machine.
                        </p>
                    </div>

                    {/* Toggle */}
                    <div className="flex items-center justify-between pt-2">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors duration-300 ${fabricSettings.enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${fabricSettings.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                            <span className={`text-sm font-bold ${fabricSettings.enabled ? 'text-emerald-700' : 'text-slate-500'}`}>Activer la pénalité</span>
                            <input 
                                type="checkbox" 
                                className="hidden"
                                checked={fabricSettings.enabled} 
                                onChange={(e) => setFabricSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                            />
                        </label>
                    </div>
                    
                    <button onClick={() => setShowFabricModal(false)} className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all active:scale-[0.98]">
                        Valider
                    </button>
                </div>
            </div>
        </div>,
        document.body
      )}

      {/* GUIDE SELECTION MODAL */}
      {showGuideModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowGuideModal(null)} />
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-10 flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                    <div>
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Layers className="w-5 h-5 text-orange-500" />
                            Choisir un Guide
                        </h3>
                        <p className="text-xs text-slate-400">
                            Machine: <span className="font-bold text-slate-600">{showGuideModal.machineName || 'Toutes'}</span>
                        </p>
                    </div>
                    <button onClick={() => setShowGuideModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-3 border-b border-slate-100 bg-slate-50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            autoFocus
                            placeholder="Rechercher un guide..." 
                            value={guideSearch}
                            onChange={(e) => setGuideSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
                    {filteredGuides.length > 0 ? (
                        filteredGuides.map(guide => (
                            <button 
                                key={guide.id}
                                onClick={() => assignGuide(showGuideModal.opId, guide)}
                                className="w-full text-left p-3 rounded-xl hover:bg-orange-50 border border-transparent hover:border-orange-100 transition-all group flex items-start gap-3"
                            >
                                <div className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-orange-500 shadow-sm group-hover:scale-110 transition-transform">
                                    <Component className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-700 text-sm">{guide.name}</h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">{guide.category}</span>
                                        {guide.machineType && <span className="text-[10px] bg-white border border-slate-200 text-slate-400 px-1.5 py-0.5 rounded">{guide.machineType}</span>}
                                    </div>
                                    {guide.description && <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">{guide.description}</p>}
                                </div>
                            </button>
                        ))
                    ) : (
                        <div className="py-8 text-center">
                            <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                            <p className="text-sm text-slate-400">Aucun guide trouvé.</p>
                            {guideSearch && <p className="text-xs text-slate-300 mt-1">Essayez un autre terme ou vérifiez la machine.</p>}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
      )}

      {/* CONTEXT MENU - USING PORTAL - FIXED TO PAGE COORDS */}
      {contextMenu && contextMenu.visible && createPortal(
        <div 
            className={`absolute z-[9999] bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 w-64 text-xs font-bold text-slate-700 animate-in fade-in zoom-in-95 duration-100 overflow-hidden ring-4 ring-slate-100/50 flex flex-col max-h-[85vh] ${contextMenu.align === 'bottom' ? 'origin-bottom-left' : 'origin-top-left'}`}
            style={{ 
                top: contextMenu.y, 
                left: contextMenu.x,
                transform: contextMenu.align === 'bottom' ? 'translateY(-100%)' : 'none'
            }}
            onClick={(e) => e.stopPropagation()} 
        >
            <div className="overflow-y-auto custom-scrollbar flex-1">
            {/* LINKING ACTION: Only show if items are selected AND clicking on a different row */}
            {isSelectionMode && selectedOpIds.length > 0 && !selectedOpIds.includes(contextMenu.opId!) && (
                <>
                    <button onClick={() => handleContextAction('targetThis')} className="w-full text-left px-4 py-3 hover:bg-emerald-50 flex items-center gap-2.5 transition-colors group text-emerald-700 bg-emerald-50/50">
                        <ArrowLeftToLine className="w-4 h-4 text-emerald-600" /> 
                        <span>🏁 Lier la sélection ici (Flux)</span>
                    </button>
                    <div className="h-px bg-slate-100 my-1 mx-2"></div>
                </>
            )}

            {/* Quick Action: Select Group */}
            {isPartOfGroup && (
                <>
                    <button onClick={() => handleContextAction('selectGroup')} className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 flex items-center gap-2.5 transition-colors group">
                        <Layers className="w-4 h-4 text-indigo-600" /> 
                        <span>Sélectionner Groupe</span>
                    </button>
                    <div className="h-px bg-slate-100 my-1 mx-2"></div>
                </>
            )}

            {/* NEW: LINK FLUX ACTION - Manual Trigger */}
            <button onClick={() => handleContextAction('setFlux')} className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 flex items-center gap-2.5 transition-colors group text-slate-600 hover:text-emerald-700">
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500" /> 
                <span>Définir Flux / Destination</span>
            </button>
            <div className="h-px bg-slate-100 my-1 mx-2"></div>

            <button onClick={() => handleContextAction('select')} className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 flex items-center gap-2.5 transition-colors group">
                <CheckSquare className={`w-4 h-4 ${selectedOpIds.includes(contextMenu.opId!) ? 'text-indigo-600' : 'text-slate-400'}`} /> 
                <span>{selectedOpIds.includes(contextMenu.opId!) ? 'Désélectionner' : 'Sélectionner'}</span>
            </button>
            <div className="h-px bg-slate-100 my-1 mx-2"></div>
            <button onClick={() => handleContextAction('link')} disabled={selectedOpIds.length < 2} className={`w-full text-left px-4 py-2.5 hover:bg-emerald-50 flex items-center gap-2.5 transition-colors group ${selectedOpIds.length < 2 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <LinkIcon className="w-4 h-4 text-emerald-500" /> 
                <span>Grouper / Lier ({selectedOpIds.length})</span>
            </button>
            <button onClick={() => handleContextAction('unlink')} className="w-full text-left px-4 py-2.5 hover:bg-orange-50 flex items-center gap-2.5 transition-colors group">
                <Unlink className="w-4 h-4 text-orange-500" /> 
                <span>Dégrouper</span>
            </button>
            <div className="h-px bg-slate-100 my-1 mx-2"></div>
            <button onClick={() => handleContextAction('insert')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 transition-colors group">
                <Plus className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" /> 
                <span>Insérer Poste</span>
            </button>
            <button onClick={() => handleContextAction('duplicate')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 transition-colors group">
                <CopyPlus className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" /> 
                <span>Dupliquer</span>
            </button>
            <button onClick={() => handleContextAction('cut')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 transition-colors group">
                <Scissors className="w-4 h-4 text-slate-400 group-hover:text-slate-600" /> 
                <span>Couper</span>
            </button>
            <button onClick={() => handleContextAction('copy')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 transition-colors group">
                <Copy className="w-4 h-4 text-slate-400 group-hover:text-slate-600" /> 
                <span>Copier</span>
            </button>
            <button onClick={() => handleContextAction('paste')} disabled={!clipboard} className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 transition-colors group ${!clipboard ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Clipboard className="w-4 h-4 text-slate-400 group-hover:text-slate-600" /> 
                <span>Coller</span>
            </button>
            <div className="h-px bg-slate-100 my-1 mx-2"></div>
            <button onClick={() => handleContextAction('clear')} className="w-full text-left px-4 py-2.5 hover:bg-amber-50 flex items-center gap-2.5 text-amber-600 transition-colors">
                <Eraser className="w-4 h-4" /> 
                <span>Vider le contenu</span>
            </button>
            <button onClick={() => handleContextAction('delete')} className="w-full text-left px-4 py-2.5 hover:bg-rose-50 flex items-center gap-2.5 text-rose-600 transition-colors">
                <Trash2 className="w-4 h-4" /> 
                <span>Supprimer</span>
            </button>
            </div>
        </div>,
        document.body
      )}

      {/* AI Assistant Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isAnalyzing && setShowAiModal(false)} />
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
                {/* AI Header */}
                <div className="bg-gradient-to-r from-rose-500 to-pink-600 p-5 text-white relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-4 -translate-y-4">
                        <Sparkles className="w-24 h-24" />
                    </div>
                    <h3 className="text-lg font-bold flex items-center gap-2 relative z-10">
                        <Bot className="w-5 h-5 text-yellow-300" />
                        Assistant Intelligent
                    </h3>
                    <p className="text-rose-100 text-xs mt-1 relative z-10">
                        Je "lis" votre gamme en temps réel pour apprendre et vous aider.
                    </p>
                    <button onClick={() => setShowAiModal(false)} disabled={isAnalyzing} className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-slate-50 space-y-4">
                    {chatHistory.length === 0 && (
                        <div className="text-center py-8 px-4">
                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                                <MessageSquare className="w-6 h-6 text-rose-400" />
                            </div>
                            <p className="text-slate-500 text-sm font-medium">
                                Bonjour ! J'analyse les <strong className="text-slate-800">{operations.length} opérations</strong> que vous avez saisies.
                            </p>
                            <p className="text-xs text-slate-400 mt-2">
                                Demandez-moi d'identifier le modèle, de vérifier l'équilibrage, ou de suggérer des temps.
                            </p>
                            
                            <div className="flex flex-wrap gap-2 justify-center mt-6">
                                <button onClick={() => { setAiPrompt("Quel est ce modèle ?"); handleAiAssist(); }} className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:border-rose-300 hover:text-rose-600 transition-colors">
                                    Quel est ce modèle ?
                                </button>
                                <button onClick={() => { setAiPrompt("Analyse l'équilibrage"); handleAiAssist(); }} className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:border-rose-300 hover:text-rose-600 transition-colors">
                                    Analyse l'équilibrage
                                </button>
                            </div>
                        </div>
                    )}

                    {chatHistory.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                msg.role === 'user' 
                                ? 'bg-rose-600 text-white rounded-tr-sm' 
                                : 'bg-white text-slate-700 border border-slate-100 rounded-tl-sm'
                            }`}>
                                {msg.content.split('\n').map((line, idx) => (
                                    <p key={idx} className={idx > 0 ? 'mt-1' : ''}>{line}</p>
                                ))}
                            </div>
                        </div>
                    ))}
                    
                    {isAnalyzing && (
                        <div className="flex justify-start">
                            <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-100 shadow-sm flex items-center gap-2 text-sm text-slate-500">
                                <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                                <span>Analyse de la gamme en cours...</span>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
                    <input 
                        type="text" 
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAiAssist()}
                        disabled={isAnalyzing}
                        placeholder="Posez une question sur votre gamme..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rose-400 focus:bg-white transition-all placeholder:text-slate-400"
                    />
                    <button 
                        onClick={handleAiAssist}
                        disabled={!aiPrompt.trim() || isAnalyzing}
                        className={`p-2.5 rounded-xl transition-all ${
                            !aiPrompt.trim() || isAnalyzing 
                            ? 'bg-slate-100 text-slate-300' 
                            : 'bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-200'
                        }`}
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
