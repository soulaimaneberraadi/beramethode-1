
import React, { useMemo, useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Operation, Poste, Machine, ComplexityFactor, StandardTime, SavedLayout, ManualLink } from '../types';
import ExcelInput from './ExcelInput';
import {
    Zap,
    Briefcase,
    Printer,
    Grid as GridIcon,
    ArrowRight,
    ArrowDown,
    MoveRight,
    Plus,
    Minus,
    AlertCircle,
    Calculator,
    AlignJustify,
    User,
    FileText,
    X,
    Trash2,
    Check,
    PenTool,
    MoreVertical,
    ChevronRight,
    ChevronLeft,
    Play,
    Pause,
    RotateCcw,
    Layers,
    CornerDownRight,
    Ruler,
    Truck,
    Scissors,
    Package,
    ArrowUp,
    ArrowLeftRight,
    Eye,
    EyeOff,
    Maximize2,
    Hash,
    Maximize,
    Minimize,
    ImageIcon,
    Loader2,
    Timer,
    FolderOpen,
    Save,
    Columns,
    LayoutGrid,
    CircleDashed,
    MousePointerClick,
    Menu,
    Inbox,
    GitMerge,
    AlertTriangle,
    Unlink2,
    Bot,
    Hand,
    LayoutDashboard,
    AlignHorizontalSpaceAround,
    AlignVerticalSpaceAround,
    RefreshCw,
    Move,
    ArrowRightLeft,
    ArrowLeftRight as AlignIcon,
    ArrowRightLeft as SwapIcon,
    Clock,
    Sparkles,
    Thermometer,
    Scaling,
    ZoomIn,
    ZoomOut,
    GripHorizontal,
    Component,
    Download,
    Users,
    Percent,
    List,
    Link as LinkIcon,
    GitCommit,
    Flower2,
    ArrowDownToLine,
    ListPlus,
    Edit,
    Link2,
    SquareDashed,
    Magnet,
    ListOrdered,
    MessageSquare,
    RotateCw,
    BoxSelect,
    Circle,
    Square,
    Image as ImageIconAlt,
    LogOut,
    LayoutTemplate,
    ChevronDown
} from 'lucide-react';

// Declare html2pdf globally
declare var html2pdf: any;

interface ImplantationProps {
    bf: number;
    operations: Operation[];
    setOperations: React.Dispatch<React.SetStateAction<Operation[]>>;
    numWorkers: number;
    setNumWorkers: React.Dispatch<React.SetStateAction<number>>;
    presenceTime: number;
    setPresenceTime: React.Dispatch<React.SetStateAction<number>>;
    efficiency: number;
    setEfficiency: React.Dispatch<React.SetStateAction<number>>;
    articleName: string;
    // Shared State from App/Balancing
    assignments?: Record<string, string[]>;
    postes?: Poste[];
    setPostes?: React.Dispatch<React.SetStateAction<Poste[]>>;
    layoutMemory?: Record<string, { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[]>;
    setLayoutMemory?: React.Dispatch<React.SetStateAction<Record<string, { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[]>>>;
    activeLayout?: 'zigzag' | 'snake' | 'grid' | 'wheat' | 'free' | 'line';
    setActiveLayout?: React.Dispatch<React.SetStateAction<'zigzag' | 'snake' | 'grid' | 'wheat' | 'free' | 'line'>>;
    machines: Machine[];
    // Calculation Params
    speedFactors: any[];
    complexityFactors: ComplexityFactor[];
    standardTimes: StandardTime[];
    fabricSettings: any;
    // Actions
    onSave?: () => void;
    // Manual Links State (Passed from Parent for Persistence)
    manualLinks?: ManualLink[];
    setManualLinks?: React.Dispatch<React.SetStateAction<ManualLink[]>>;
}

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

const POSTE_COLORS = [
    { name: 'indigo', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-100', fill: '#6366f1', badgeText: 'text-indigo-800' },
    { name: 'orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100', fill: '#f97316', badgeText: 'text-orange-800' },
    { name: 'emerald', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100', fill: '#10b981', badgeText: 'text-emerald-800' },
    { name: 'rose', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', badge: 'bg-rose-100', fill: '#f43f5e', badgeText: 'text-rose-800' },
    { name: 'cyan', bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', badge: 'bg-cyan-100', fill: '#06b6d4', badgeText: 'text-cyan-800' },
    { name: 'amber', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100', fill: '#f59e0b', badgeText: 'text-amber-800' },
    { name: 'violet', bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100', fill: '#8b5cf6', badgeText: 'text-violet-800' },
    { name: 'lime', bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', badge: 'bg-lime-100', fill: '#84cc16', badgeText: 'text-lime-800' },
    { name: 'fuchsia', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', badge: 'bg-fuchsia-100', fill: '#d946ef', badgeText: 'text-fuchsia-800' },
    { name: 'teal', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', badge: 'bg-teal-100', fill: '#14b8a6', badgeText: 'text-teal-800' },
    { name: 'red', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100', fill: '#ef4444', badgeText: 'text-red-800' },
    { name: 'sky', bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', badge: 'bg-sky-100', fill: '#0ea5e9', badgeText: 'text-sky-800' },
];

const SPECIAL_COLORS = {
    controle: { name: 'orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', fill: '#f97316', badge: 'bg-orange-100', badgeText: 'text-orange-800' },
    fer: { name: 'rose', bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-800', fill: '#e11d48', badge: 'bg-rose-200', badgeText: 'text-rose-900' },
    finition: { name: 'purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', fill: '#a855f7', badge: 'bg-purple-100', badgeText: 'text-purple-800' },
    vide: { name: 'vide', bg: 'bg-transparent', border: 'border-slate-300 border-2 border-dashed', text: 'text-slate-400', fill: 'transparent', badge: 'bg-slate-100', badgeText: 'text-slate-500' },
};

const getPosteColor = (index: number, machineName: string, colorName?: string) => {
    if (machineName === 'VIDE') return SPECIAL_COLORS.vide;
    if (colorName) {
        const found = POSTE_COLORS.find(c => c.name === colorName);
        if (found) return found;
    }
    const name = machineName.toUpperCase();
    if (name.includes('CONTROL') || name.includes('CONTROLE')) return SPECIAL_COLORS.controle;
    if (name.includes('FER') || name.includes('REPASSAGE')) return SPECIAL_COLORS.fer;
    if (name.includes('FINITION')) return SPECIAL_COLORS.finition;
    return POSTE_COLORS[index % POSTE_COLORS.length];
};

interface Workstation extends Poste {
    index: number;
    originalIndex: number;
    operations: Operation[];
    totalTime: number;
    saturation: number;
    operators: number;
    color: typeof POSTE_COLORS[0];
    groups: string[];
    feedsInto?: string;
    isFeeder?: boolean;
    targetStationName?: string;
    gammeOrderMin: number;
    isPlaced?: boolean;
    status?: 'ok' | 'panne';
}

const DimensionMarkerHorizontal = ({ label }: { label: string }) => (
    <div className="flex flex-col items-center w-full px-2 opacity-70 scale-90">
        <div className="flex items-center w-full text-[8px] text-slate-500 font-mono font-bold whitespace-nowrap">
            <div className="h-1.5 w-px bg-slate-400"></div>
            <div className="h-px bg-slate-400 flex-1 relative"><span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[140%] bg-white px-0.5">{label}</span></div>
            <div className="h-1.5 w-px bg-slate-400"></div>
        </div>
    </div>
);

const DimensionMarkerVertical = ({ label, height = 'h-full' }: { label: string, height?: string }) => (
    <div className={`flex flex-row items-center justify-center ${height} opacity-70 scale-90`}>
        <div className="flex flex-col items-center h-full text-[8px] text-slate-500 font-mono font-bold whitespace-nowrap">
            <div className="w-1.5 h-px bg-slate-400"></div>
            <div className="w-px bg-slate-400 flex-1 relative"><span className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-[140%] bg-white py-0.5 rotate-90">{label}</span></div>
            <div className="w-1.5 h-px bg-slate-400"></div>
        </div>
    </div>
);

const SpecialZoneControl = ({ label, type, icon: Icon, color, currentCount, onAdd, onRemove }: any) => (
    <div className={`flex items-center gap-2 px-2 py-0.5 rounded-lg border ${color.bg} ${color.border} shadow-sm transition-colors`}>
        <div className={`flex items-center gap-1 ${color.text}`}><Icon className="w-3 h-3" /><span className="text-[9px] font-bold uppercase">{label}</span></div>
        <div className="flex items-center bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
            <button onClick={() => onRemove(type)} className="p-0.5 hover:bg-slate-100 text-slate-400 hover:text-rose-500 transition-colors border-r border-slate-100"><Minus className="w-2.5 h-2.5" /></button>
            <span className="w-5 text-center text-[9px] font-bold text-slate-700">{currentCount}</span>
            <button onClick={() => onAdd(type)} className="p-0.5 hover:bg-slate-100 text-slate-400 hover:text-emerald-500 transition-colors"><Plus className="w-2.5 h-2.5" /></button>
        </div>
    </div>
);

// HELPER: Create Orthogonal Path (Manhattan Style) with Rounded Corners
const getOrthogonalPath = (points: { x: number, y: number }[], radius: number = 10) => {
    if (points.length < 2) return "";
    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length - 1; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];

        // Directions
        const dx1 = p1.x - p0.x;
        const dy1 = p1.y - p0.y;
        const dx2 = p2.x - p1.x;
        const dy2 = p2.y - p1.y;

        // Normalize direction vectors
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        if (len1 === 0 || len2 === 0) continue;

        const ux1 = dx1 / len1;
        const uy1 = dy1 / len1;
        const ux2 = dx2 / len2;
        const uy2 = dy2 / len2;

        // Effective Radius (clamped)
        const r = Math.min(radius, len1 / 2, len2 / 2);

        // Start of curve (backing up from p1 towards p0)
        const start = {
            x: p1.x - ux1 * r,
            y: p1.y - uy1 * r
        };

        // End of curve (moving from p1 towards p2)
        const end = {
            x: p1.x + ux2 * r,
            y: p1.y + uy2 * r
        };

        d += ` L ${start.x} ${start.y} Q ${p1.x} ${p1.y} ${end.x} ${end.y}`;
    }

    // Final segment
    d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
    return d;
};

// DISTINCT PATH COLORS FOR BETTER VISIBILITY
const PATH_COLORS = [
    '#6366f1', // Indigo
    '#f43f5e', // Rose
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
    '#d946ef', // Fuchsia
    '#84cc16'  // Lime
];

const LinkOverlay = ({
    links,
    stations,
    showLinks,
    zoom,
    containerRef,
    onRemoveLink,
    onEditLabel
}: {
    links: ManualLink[],
    stations: Workstation[],
    showLinks: boolean,
    zoom: number,
    containerRef: React.RefObject<HTMLDivElement>,
    onRemoveLink: (id: string) => void,
    onEditLabel: (id: string, currentLabel?: string) => void
}) => {
    const [paths, setPaths] = useState<{ id: string, path: string, labelX: number, labelY: number, label?: string, color: string, type: 'forward' | 'loop' | 'vertical' }[]>([]);

    const calculatePaths = useCallback(() => {
        if (!showLinks || !containerRef.current) {
            setPaths([]);
            return;
        }

        const containerRect = containerRef.current.getBoundingClientRect();

        const newPaths = links.map((link, index) => {
            // Try exact match first, then try with __1 suffix (expanded stations)
            let fromEl = document.getElementById(`station-card-${link.from}`);
            let toEl = document.getElementById(`station-card-${link.to}`);

            // If not found, look for __1 variant (workstation expansion)
            if (!fromEl) {
                fromEl = document.getElementById(`station-card-${link.from}__1`) ||
                    document.querySelector(`[id^="station-card-${link.from}"]`) as HTMLElement | null;
            }
            if (!toEl) {
                toEl = document.getElementById(`station-card-${link.to}__1`) ||
                    document.querySelector(`[id^="station-card-${link.to}"]`) as HTMLElement | null;
            }

            if (!fromEl || !toEl) return null;

            // containerRef is the scrollContainerRef (ouside zoom), but the SVG is inside contentRef (zoomed).
            // We need coordinates in the unzoomed SVG space.
            // Formula: svgX = (elementRect.left - contentRect.left + scrollLeft) / zoom... but since
            // the SVG is already INSIDE the scaled div, element positions relative to the container ARE the right coords.
            // We compute: pos = (rect.left - containerRect.left + containerRef.scrollLeft) / zoom
            const scrollLeft = containerRef.current?.scrollLeft || 0;
            const scrollTop = containerRef.current?.scrollTop || 0;

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();

            // Compute positions in SVG coordinate space (unzoomed)
            const fromX = (fromRect.left - containerRect.left + scrollLeft) / zoom;
            const fromY = (fromRect.top - containerRect.top + scrollTop) / zoom;
            const fromW = fromRect.width / zoom;
            const fromH = fromRect.height / zoom;

            const toX = (toRect.left - containerRect.left + scrollLeft) / zoom;
            const toY = (toRect.top - containerRect.top + scrollTop) / zoom;
            const toW = toRect.width / zoom;
            const toH = toRect.height / zoom;

            // Anchor Points
            const srcRight = fromX + fromW;
            const srcCy = fromY + fromH / 2;
            const srcBottom = fromY + fromH;

            const tgtLeft = toX;
            const tgtCy = toY + toH / 2;
            const tgtBottom = toY + toH;

            let points: { x: number, y: number }[] = [];
            let labelX = 0;
            let labelY = 0;

            const color = PATH_COLORS[index % PATH_COLORS.length];
            let type: 'forward' | 'loop' | 'vertical' = 'forward';

            // Phase 25: SMART ROUTING LOGIC (CIRCUIT BOARD STYLE)
            // 1. Direct Horizontal (Adjacent cards in the same row)
            if (toX > srcRight + 10 && toX < srcRight + 300 && Math.abs(tgtCy - srcCy) < 50) {
                const midX = srcRight + (tgtLeft - srcRight) / 2;
                points = [
                    { x: srcRight, y: srcCy },
                    { x: midX, y: srcCy },
                    { x: midX, y: tgtCy },
                    { x: tgtLeft, y: tgtCy }
                ];
                labelX = midX;
                labelY = (srcCy + tgtCy) / 2;
                type = 'forward';
            } else {
                // 2. Bus Routing (Dodge cards by routing over or under)
                // Assign each link a vertical lane offset
                const laneOffset = (index % 6 + 1) * 12;
                // Determine routing direction (above or below)
                const routeBelow = toY >= fromY;

                const busY = routeBelow
                    ? Math.max(srcBottom, tgtBottom) + 25 + laneOffset
                    : Math.min(fromY, toY) - 25 - laneOffset;

                // Stagger exits and entrances to prevent overlapping lines
                const exitX = srcRight + 15 + (index % 4) * 6;
                const enterX = tgtLeft - 15 - (index % 4) * 6;

                points = [
                    { x: srcRight, y: srcCy },
                    { x: exitX, y: srcCy },
                    { x: exitX, y: busY },
                    { x: enterX, y: busY },
                    { x: enterX, y: tgtCy },
                    { x: tgtLeft, y: tgtCy }
                ];

                labelX = (exitX + enterX) / 2;
                labelY = busY - 10; // Label slightly above the bus line
                type = 'loop';
            }

            return {
                id: link.id,
                path: getOrthogonalPath(points, 12),
                labelX,
                labelY,
                label: link.label,
                color,
                type
            };
        }).filter(Boolean) as any[];

        setPaths(newPaths);
    }, [links, stations, showLinks, zoom]);

    useLayoutEffect(() => {
        const frame = requestAnimationFrame(calculatePaths);
        return () => cancelAnimationFrame(frame);
    }, [calculatePaths]);

    // Also recalculate on window resize or scroll events
    useEffect(() => {
        const debouncedCalc = () => { requestAnimationFrame(calculatePaths); };
        window.addEventListener('resize', debouncedCalc);
        const container = containerRef.current;
        if (container) container.addEventListener('scroll', debouncedCalc, { passive: true });
        // Use MutationObserver to detect DOM changes (card movements)
        const observer = new MutationObserver(debouncedCalc);
        if (container) observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
        return () => {
            window.removeEventListener('resize', debouncedCalc);
            if (container) container.removeEventListener('scroll', debouncedCalc);
            observer.disconnect();
        };
    }, [calculatePaths, containerRef]);

    if (!showLinks) return null;

    const dynamicStrokeWidth = 2.5 / zoom;
    const dynamicHoverWidth = 20 / zoom;

    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
            <defs>
                {/* Dynamically generate markers for each color */}
                {PATH_COLORS.map(c => (
                    <marker key={c} id={`arrow-${c.replace('#', '')}`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                        <path d="M0,0 L5,2.5 L0,5 Z" fill={c} />
                    </marker>
                ))}
            </defs>
            {paths.map(p => (
                <g key={p.id} className="group pointer-events-auto">
                    <path d={p.path} stroke="transparent" strokeWidth={dynamicHoverWidth} fill="none" className="cursor-pointer" onClick={() => onEditLabel(p.id, p.label)} />
                    <path
                        d={p.path}
                        stroke={p.color}
                        strokeWidth={dynamicStrokeWidth}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        markerEnd={`url(#arrow-${p.color.replace('#', '')})`}
                        className="pointer-events-none transition-all duration-300 group-hover:stroke-width-[4px]"
                    />
                    <circle r={3 / zoom} fill={p.color} className="opacity-0 group-hover:opacity-100">
                        <animateMotion dur="2s" repeatCount="indefinite" path={p.path} />
                    </circle>
                    <foreignObject x={p.labelX - (60 / zoom)} y={p.labelY - (15 / zoom)} width={120 / zoom} height={30 / zoom} className="overflow-visible">
                        <div className="flex items-center justify-center gap-1 hover:scale-110 transition-transform origin-center" style={{ transform: `scale(${1 / zoom})` }}>
                            {p.label ? (
                                <div onClick={() => onEditLabel(p.id, p.label)} className="bg-white/90 backdrop-blur-sm text-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg shadow-md border border-slate-200 whitespace-nowrap cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 max-w-[100px] truncate relative z-50" title={p.label}>{p.label}</div>
                            ) : (
                                <button onClick={() => onEditLabel(p.id)} className="bg-white/90 backdrop-blur-sm p-1 rounded-full border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-indigo-500 relative z-50"><MessageSquare className="w-3 h-3" /></button>
                            )}
                            <button onClick={() => onRemoveLink(p.id)} className="bg-white/90 backdrop-blur-sm text-slate-300 p-1 rounded-full border border-slate-200 shadow-sm hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity relative z-50"><X className="w-3 h-3" /></button>
                        </div>
                    </foreignObject>
                </g>
            ))}
        </svg>
    );
};

export default function Implantation({
    bf,
    operations,
    setOperations,
    numWorkers,
    setNumWorkers,
    presenceTime,
    setPresenceTime,
    efficiency,
    setEfficiency,
    articleName,
    assignments,
    postes,
    setPostes,
    layoutMemory,
    setLayoutMemory,
    activeLayout,
    setActiveLayout,
    machines,
    speedFactors,
    complexityFactors,
    standardTimes,
    fabricSettings,
    onSave,
    manualLinks, // Receive manualLinks as prop
    setManualLinks // Receive setManualLinks as prop
}: ImplantationProps) {

    // --- CALCULATIONS FOR HEADER ---
    const totalMin = useMemo(() => operations.reduce((sum, op) => sum + (op.time || 0), 0), [operations]);
    const tempsArticle = totalMin * 1.20;

    // --- NEW: REAL-TIME MACHINE COUNTER ---
    const placedMachinesCount = useMemo(() => {
        if (!postes) return 0;
        return postes.filter(p => p.isPlaced && p.machine !== 'VIDE' && !p.notes?.includes('Emplacement Vide')).length;
    }, [postes]);

    const prodDay100 = tempsArticle > 0 ? (presenceTime * numWorkers) / tempsArticle : 0;
    const prodDayEff = prodDay100 * (efficiency / 100);
    const hours = presenceTime / 60;
    const prodHour100 = hours > 0 ? prodDay100 / hours : 0;
    const prodHourEff = hours > 0 ? prodDayEff / hours : 0;

    // --- STATE ---
    // Use prop if available, otherwise fallback to local state (though prop should always be passed now)
    const [localLayoutType, setLocalLayoutType] = useState<'zigzag' | 'snake' | 'grid' | 'wheat' | 'free' | 'line'>('zigzag');
    const layoutType = activeLayout || localLayoutType;
    const setLayoutType = setActiveLayout || setLocalLayoutType;

    // REMOVED LOCAL layoutMemory - USING PROPS

    const handleLayoutChange = (newType: 'zigzag' | 'snake' | 'grid' | 'wheat' | 'free' | 'line') => {
        if (layoutType === newType) return;

        if (setPostes && postes && layoutMemory && setLayoutMemory) {
            // 1. Save Current State
            const currentSnapshot = postes.map(p => ({
                id: p.id,
                x: p.x,
                y: p.y,
                isPlaced: p.isPlaced,
                rotation: p.rotation
            }));

            const updatedMemory = { ...layoutMemory, [layoutType]: currentSnapshot };
            setLayoutMemory(updatedMemory);

            // 2. Load New State
            const savedSnapshot = updatedMemory[newType];
            if (savedSnapshot) {
                const currentPostesMap = new Map(postes.map(p => [p.id, p]));
                const newPostes: Poste[] = [];
                const processedIds = new Set<string>();

                // Restore saved items
                savedSnapshot.forEach(saved => {
                    const p = currentPostesMap.get(saved.id);
                    if (p) {
                        newPostes.push({
                            ...p,
                            x: saved.x,
                            y: saved.y,
                            isPlaced: saved.isPlaced,
                            rotation: saved.rotation
                        });
                        processedIds.add(saved.id);
                    }
                });

                // Append new items
                postes.forEach(p => {
                    if (!processedIds.has(p.id)) {
                        newPostes.push(p);
                    }
                });

                setPostes(newPostes);
            } else {
                // Reset positions if no saved state exists for the new layout
                const resetPostes = postes.map(p => ({
                    ...p,
                    x: undefined,
                    y: undefined,
                    isPlaced: false,
                    rotation: 0
                }));
                setPostes(resetPostes);
            }
        }
        setLayoutType(newType);
    };

    const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
    const [draggedStationIdx, setDraggedStationIdx] = useState<number | null>(null);
    const [selectedMachineToAdd, setSelectedMachineToAdd] = useState<string>('MAN');
    const [showDimensions, setShowDimensions] = useState(false);
    const [swapControlFinition, setSwapControlFinition] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [simulationActive, setSimulationActive] = useState(false);

    // --- FIX 4: RESET SCROLL ON ORIENTATION CHANGE ---
    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }
    }, [orientation]);

    const [simStep, setSimStep] = useState(-1);
    const [showMaterialsPanel, setShowMaterialsPanel] = useState(false);
    const [matPanel, setMatPanel] = useState({ x: window.innerWidth - 340, y: 120, w: 300, h: 400 });
    const [isDraggingMat, setIsDraggingMat] = useState(false);
    const [isResizingMat, setIsResizingMat] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isExporting, setIsExporting] = useState(false); // Export State
    const matDragStart = useRef({ x: 0, y: 0, w: 0, h: 0, startX: 0, startY: 0 });

    // Free Mode Drag State
    const freeDragRef = useRef<{ id: string, startX: number, startY: number, startLeft: number, startTop: number, hasMoved: boolean } | null>(null);

    // MANUAL ASSIGNMENT STATE
    const [isManualMode, setIsManualMode] = useState(false);
    const [groupDragMode, setGroupDragMode] = useState(true);
    const [saveSuccess, setSaveSuccess] = useState(false);
    // NEW: Magnetic Mode State
    const [isMagnetic, setIsMagnetic] = useState(false);
    // NEW: Sidebar Collapse State - Start open only on large screens
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);

    // --- NEW: LAYOUT MENU TOGGLE STATE ---
    const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);

    // --- PANNING STATE (NEW) ---
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

    // Listen for Space Key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !e.repeat && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                e.preventDefault(); // Prevent scrolling
                setIsSpacePressed(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                setIsSpacePressed(false);
                setIsPanning(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    const toggleMagnetic = () => {
        if (!isMagnetic) { compactPostes(); }
        setIsMagnetic(!isMagnetic);
    };

    const activateAutoMode = () => {
        setIsManualMode(false);
        setLayoutType('zigzag');
        if (setPostes && postes) {
            const newPostes = postes.filter(p => p.machine !== 'VIDE').map(p => ({ ...p, isPlaced: true }));
            setPostes(newPostes);
        }
    };

    const activateManualMode = () => {
        setIsManualMode(true);
        setLayoutType('free');
        if (setPostes && postes) {
            const splitPosts: Poste[] = [];
            const realStations = postes.filter(p => p.machine !== 'VIDE');
            realStations.forEach(p => {
                let totalTime = 0;
                if (p.timeOverride !== undefined) {
                    totalTime = p.timeOverride;
                } else {
                    const assignedOps = operations.filter(op => assignments?.[op.id]?.includes(p.id));
                    assignedOps.forEach(op => {
                        const numAssigned = assignments[op.id]?.length || 1;
                        totalTime += (op.time || 0) / numAssigned;
                    });
                }
                const nTheo = bf > 0 ? totalTime / bf : 0;
                let operatorCount = nTheo > 1.15 ? Math.ceil(nTheo) : (nTheo > 0 ? 1 : 0);
                operatorCount = Math.max(1, operatorCount);
                if (operatorCount > 1 && !p.originalId) {
                    for (let i = 1; i <= operatorCount; i++) {
                        splitPosts.push({ ...p, id: `${p.id}__split__${i}`, originalId: p.id, name: `${p.name}.${i}`, isPlaced: false });
                    }
                } else {
                    splitPosts.push({ ...p, isPlaced: false });
                }
            });
            const emptySlots: Poste[] = Array.from({ length: 20 }).map((_, i) => ({ id: `empty-${Date.now()}-${i}`, name: `P${i + 1}`, machine: 'VIDE', isPlaced: true, colorName: 'vide' }));
            setPostes([...emptySlots, ...splitPosts]);
        }
    };

    const refreshAuto = () => {
        setIsManualMode(false);
        if (setPostes && postes) {
            const newPostes = postes.filter(p => p.machine !== 'VIDE').map(p => ({ ...p, isPlaced: true }));
            setPostes(newPostes);
        }
        setZoom(1);
    };

    // --- AUTOMATIC LAYOUT PATTERN GENERATORS FOR FREE MODE ---
    const applyLayoutPattern = (type: 'U' | 'CIRCLE' | 'GRID' | 'LINE') => {
        if (!setPostes || !postes) return;

        // Ensure we are in Free Mode
        if (layoutType !== 'free') {
            setLayoutType('free');
            setIsManualMode(true);
        }

        // Take all non-empty stations and ensure they are marked as placed
        const itemsToArrange = postes.filter(p => p.machine !== 'VIDE').map(p => ({ ...p, isPlaced: true }));
        const otherItems = postes.filter(p => p.machine === 'VIDE');

        const updatedItems = itemsToArrange.map((p, idx) => {
            let x = 0, y = 0, rotation = 0;

            if (type === 'U') {
                const colSpacing = 220;
                const rowSpacing = 160;
                const midPoint = Math.ceil(itemsToArrange.length / 2);

                if (idx < midPoint) {
                    // Left Column (Top to Bottom)
                    x = 100;
                    y = 100 + (idx * rowSpacing);
                    rotation = 0;
                } else {
                    // Right Column (Bottom to Top)
                    x = 100 + colSpacing + 100; // Gap
                    const relativeIdx = idx - midPoint;
                    y = 100 + ((midPoint - 1 - relativeIdx) * rowSpacing);
                    rotation = 0;
                }
            }
            else if (type === 'CIRCLE') {
                const radius = Math.max(300, itemsToArrange.length * 40);
                const centerX = radius + 100;
                const centerY = radius + 100;
                const angleStep = (2 * Math.PI) / itemsToArrange.length;
                const angle = idx * angleStep;

                x = centerX + radius * Math.cos(angle);
                y = centerY + radius * Math.sin(angle);
                rotation = (angle * 180) / Math.PI + 90; // Face outward
            }
            else if (type === 'GRID') {
                const cols = Math.ceil(Math.sqrt(itemsToArrange.length));
                const spacingX = 240;
                const spacingY = 180;

                const col = idx % cols;
                const row = Math.floor(idx / cols);

                x = 100 + (col * spacingX);
                y = 100 + (row * spacingY);
                rotation = 0;
            }
            else if (type === 'LINE') {
                x = 100 + (idx * 240);
                y = 300;
                rotation = 0;
            }

            return { ...p, x, y, rotation };
        });

        setPostes([...updatedItems, ...otherItems]);
    };

    // --- EXPORT FUNCTION ---
    const handleExportPlan = async () => {
        if (isExporting || !contentRef.current) return;
        setIsExporting(true);

        try {
            const element = contentRef.current;

            // 1. Clone element to avoid zoom issues
            const clone = element.cloneNode(true) as HTMLElement;
            const originalTransform = element.style.transform;

            // Get bounds of content if in free mode to set PDF size accurately
            const width = element.scrollWidth + 100;
            const height = element.scrollHeight + 100;

            clone.style.width = `${width}px`;
            clone.style.height = `${height}px`;
            clone.style.transform = 'scale(1)'; // Reset zoom
            clone.style.position = 'fixed';
            clone.style.top = '-9999px';
            clone.style.left = '-9999px';
            clone.style.zIndex = '-100';
            clone.style.backgroundColor = '#f1f5f9'; // Slate-100 background

            document.body.appendChild(clone);

            const opt = {
                margin: 10,
                filename: `Plan_Implantation_${articleName.replace(/\s+/g, '_')}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    windowWidth: width,
                    windowHeight: height
                },
                jsPDF: {
                    unit: 'px',
                    format: [width + 20, height + 20],
                    orientation: width > height ? 'landscape' : 'portrait'
                }
            };

            await html2pdf().set(opt).from(clone).save();
            document.body.removeChild(clone);

        } catch (error) {
            console.error("Export failed:", error);
            alert("Erreur lors de l'exportation du plan.");
        } finally {
            setIsExporting(false);
        }
    };

    // ... (Rest of existing state & handlers) ...
    const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
    const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
    const [templateName, setTemplateName] = useState("");
    const [showLoadTemplateModal, setShowLoadTemplateModal] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('beramethode_layouts');
        if (saved) {
            try {
                setSavedLayouts(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to load layouts", e);
            }
        }
    }, []);

    const persistLayouts = (layouts: SavedLayout[]) => {
        localStorage.setItem('beramethode_layouts', JSON.stringify(layouts));
        setSavedLayouts(layouts);
    };

    const handleSaveTemplate = () => {
        if (!templateName.trim() || !postes) return;
        const newTemplate: SavedLayout = {
            id: Date.now().toString(),
            name: templateName,
            date: new Date().toISOString(),
            postes: postes,
            manualLinks: manualLinks || [] // SAVE LINKS
        };
        persistLayouts([...savedLayouts, newTemplate]);
        setTemplateName("");
        setShowSaveTemplateModal(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
    };

    const handleLoadTemplate = (layout: SavedLayout) => {
        if (setPostes) {
            setPostes(layout.postes);
            if (setManualLinks) {
                setManualLinks(layout.manualLinks || []); // LOAD LINKS
            }
            setLayoutType('free');
            setShowLoadTemplateModal(false);
        }
    };

    const handleDeleteTemplate = (id: string) => {
        persistLayouts(savedLayouts.filter(l => l.id !== id));
    };

    // REMOVED LOCAL STATE FOR MANUALLINKS HERE - USING PROPS
    const [isLinking, setIsLinking] = useState(false);
    const [linkSource, setLinkSource] = useState<string | null>(null);
    const [showLinks, setShowLinks] = useState(true);

    const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{
        visible: boolean;
        x: number;
        y: number;
        station: Workstation | null;
    } | null>(null);

    const [freeContextMenu, setFreeContextMenu] = useState<{
        visible: boolean;
        x: number;
        y: number;
        canvasX: number;
        canvasY: number;
    } | null>(null);

    const [editModal, setEditModal] = useState<{
        isOpen: boolean;
        stationIndex: number;
        data: Poste;
        color: typeof POSTE_COLORS[0];
        operators: number;
    } | null>(null);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const canEdit = !!setPostes && !!postes && postes.length > 0;

    const fullscreenWrapperRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // ... (Event Handlers: Click, Drag, Drop, Context, etc.) ...
    useEffect(() => {
        const handleClick = () => {
            setContextMenu(null);
            setFreeContextMenu(null);
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, station: Workstation) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            visible: true,
            x: e.pageX,
            y: e.pageY,
            station
        });
    };

    const handleContextAction = (action: string) => {
        if (!contextMenu?.station || !setPostes || !postes) return;
        const currentStation = contextMenu.station;

        const currentIndex = postes.findIndex(p => p.id === currentStation.id);

        if (currentIndex === -1) {
            return;
        }

        switch (action) {
            case 'modify': handleOpenEditModal(null, currentStation); break;
            case 'swap': setSwapSourceId(currentStation.id); break;
            case 'rotate': if (layoutType === 'free') { rotateStation(currentStation.id); } break;
            case 'shape_circle': if (layoutType === 'free') { changeStationShape(currentStation.id, 'circle'); } break;
            case 'shape_rect': if (layoutType === 'free') { changeStationShape(currentStation.id, 'rect'); } break;
            case 'insert':
                const nextColorIndex = postes.length % POSTE_COLORS.length;
                const assignedColorName = POSTE_COLORS[nextColorIndex].name;
                const newPoste: Poste = { id: `P_${Date.now()}`, name: 'P?', machine: 'MAN', notes: '', operatorName: '', isPlaced: isManualMode, colorName: assignedColorName };
                const newPostesInsert = [...postes];
                newPostesInsert.splice(currentIndex + 1, 0, newPoste);
                setPostes(newPostesInsert.map((p, i) => ({ ...p, name: `P${i + 1}` })));
                break;
            case 'delete':
                if (isManualMode) {
                    handleRemoveFromCanvas(currentStation.id);
                } else {
                    const newPostesDel = [...postes];
                    newPostesDel.splice(currentIndex, 1);
                    setPostes(newPostesDel.map((p, i) => ({ ...p, name: `P${i + 1}` })));
                }
                break;
        }
        setContextMenu(null);
    };

    const handleFreeContextMenu = (e: React.MouseEvent) => {
        if (layoutType !== 'free') return;
        e.preventDefault();

        const container = contentRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();

        const canvasX = (e.clientX - rect.left) / zoom;
        const canvasY = (e.clientY - rect.top) / zoom;

        setFreeContextMenu({
            visible: true,
            x: e.pageX,
            y: e.pageY,
            canvasX,
            canvasY
        });
    };

    const handleAddFreeItem = (type: 'poste' | 'circle' | 'rect') => {
        if (!setPostes || !postes || !freeContextMenu) return;

        const newItem: Poste = {
            id: `free-${Date.now()}`,
            name: type === 'poste' ? `P${postes.length + 1}` : (type === 'circle' ? 'Zone' : 'Area'),
            machine: type === 'poste' ? 'MAN' : 'VIDE',
            x: freeContextMenu.canvasX,
            y: freeContextMenu.canvasY,
            shape: type === 'poste' ? 'rect' : type === 'circle' ? 'circle' : 'zone',
            isPlaced: true,
            rotation: 0
        };

        setPostes([...postes, newItem]);
        setFreeContextMenu(null);
    };

    // --- MOUSE & TOUCH HANDLERS FOR FREE MODE (DRAGGING ITEMS) ---
    const handleFreeStart = (e: React.MouseEvent | React.TouchEvent, id: string, currentX: number, currentY: number) => {
        if (isSpacePressed) return; // Allow panning instead of dragging items if space is pressed

        if (e.type === 'mousedown' && (e as React.MouseEvent).button !== 0) return;

        let clientX, clientY;
        if (e.type === 'touchstart') {
            // Prevent scrolling while dragging (handled in useEffect, here we just capture coords)
            clientX = (e as React.TouchEvent).touches[0].clientX;
            clientY = (e as React.TouchEvent).touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        freeDragRef.current = {
            id,
            startX: clientX,
            startY: clientY,
            startLeft: currentX,
            startTop: currentY,
            hasMoved: false
        };
    };

    useEffect(() => {
        const handleMove = (e: MouseEvent | TouchEvent) => {
            if (!freeDragRef.current || !setPostes) return;

            let clientX, clientY;
            if (e.type === 'touchmove') {
                if (e.cancelable) e.preventDefault();
                clientX = (e as TouchEvent).touches[0].clientX;
                clientY = (e as TouchEvent).touches[0].clientY;
            } else {
                clientX = (e as MouseEvent).clientX;
                clientY = (e as MouseEvent).clientY;
            }

            const { id, startX, startY, startLeft, startTop } = freeDragRef.current;

            let dx = Math.round((clientX - startX) / zoom);
            let dy = Math.round((clientY - startY) / zoom);

            // Phase 25: Magnetic Snap-to-grid in Free Layout
            // Snap to 40px grid relative to the absolute background coordinate system
            if (isMagnetic) {
                const GRID_SIZE = 40;
                const currentX = startLeft + dx;
                const currentY = startTop + dy;
                const snapX = Math.round(currentX / GRID_SIZE) * GRID_SIZE;
                const snapY = Math.round(currentY / GRID_SIZE) * GRID_SIZE;

                dx = snapX - startLeft;
                dy = snapY - startTop;
            }

            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                freeDragRef.current.hasMoved = true;
            }

            setPostes(prev => prev.map(p => {
                if (p.id === id) {
                    return { ...p, x: startLeft + dx, y: startTop + dy };
                }
                return p;
            }));
        };

        const handleUp = () => {
            freeDragRef.current = null;
        };

        if (layoutType === 'free') {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleUp);
            window.addEventListener('touchmove', handleMove, { passive: false });
            window.addEventListener('touchend', handleUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleUp);
        };
    }, [layoutType, zoom, setPostes]);

    // --- PANNING HANDLERS ---
    const handlePanStart = (e: React.MouseEvent) => {
        if (isSpacePressed && scrollContainerRef.current) {
            e.preventDefault();
            setIsPanning(true);
            panStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                scrollLeft: scrollContainerRef.current.scrollLeft,
                scrollTop: scrollContainerRef.current.scrollTop
            };
        }
    };

    const handlePanMove = (e: React.MouseEvent) => {
        if (isPanning && scrollContainerRef.current) {
            const dx = e.clientX - panStartRef.current.x;
            const dy = e.clientY - panStartRef.current.y;
            scrollContainerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
            scrollContainerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
        }
    };

    const handlePanEnd = () => {
        setIsPanning(false);
    };

    const rotateStation = (stationId: string) => {
        if (!setPostes) return;
        setPostes(prev => prev.map(p => {
            if (p.id === stationId) {
                return { ...p, rotation: (p.rotation || 0) + 45 };
            }
            return p;
        }));
    };

    const changeStationShape = (stationId: string, shape: 'rect' | 'circle' | 'zone') => {
        if (!setPostes) return;
        setPostes(prev => prev.map(p => {
            if (p.id === stationId) {
                return { ...p, shape };
            }
            return p;
        }));
    };

    const handleLinkClick = (stationId: string) => {
        if (!isLinking || !setManualLinks || !manualLinks) return;

        if (!linkSource) {
            setLinkSource(stationId);
        } else {
            if (linkSource === stationId) {
                setLinkSource(null);
                return;
            }
            const exists = manualLinks.find(l => l.from === linkSource && l.to === stationId);
            if (!exists) {
                const newLink: ManualLink = {
                    id: `link-${Date.now()}`,
                    from: linkSource,
                    to: stationId
                };
                setManualLinks(prev => [...prev, newLink]);
            }
            setLinkSource(null);
        }
    };

    const handleRemoveLink = (linkId: string) => {
        if (setManualLinks) {
            setManualLinks(prev => prev.filter(l => l.id !== linkId));
        }
    };

    const handleEditLinkLabel = (linkId: string, currentLabel?: string) => {
        if (setManualLinks) {
            const newLabel = window.prompt("Ajouter un commentaire (Flux):", currentLabel || "");
            if (newLabel !== null) {
                setManualLinks(prev => prev.map(l => l.id === linkId ? { ...l, label: newLabel } : l));
            }
        }
    };

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            if (fullscreenWrapperRef.current) {
                fullscreenWrapperRef.current.requestFullscreen().catch((err) => {
                    console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                });
            }
        } else {
            document.exitFullscreen();
        }
    };

    useEffect(() => {
        const handleFullScreenChange = () => {
            setIsFullScreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullScreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
    }, []);

    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                setZoom(prev => Math.min(2, Math.max(0.5, prev + delta)));
            }
        };

        const container = scrollContainerRef.current;
        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
        }
        return () => {
            if (container) container.removeEventListener('wheel', handleWheel);
        };
    }, []);

    const startDragMat = (e: React.MouseEvent) => {
        setIsDraggingMat(true);
        matDragStart.current = { startX: e.clientX, startY: e.clientY, x: matPanel.x, y: matPanel.y, w: matPanel.w, h: matPanel.h };
    };
    const startResizeMat = (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        setIsResizingMat(true);
        matDragStart.current = { startX: e.clientX, startY: e.clientY, x: matPanel.x, y: matPanel.y, w: matPanel.w, h: matPanel.h };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingMat) {
                e.preventDefault();
                const dx = e.clientX - matDragStart.current.startX;
                const dy = e.clientY - matDragStart.current.startY;
                setMatPanel(prev => ({ ...prev, x: matDragStart.current.x + dx, y: matDragStart.current.y + dy }));
            } else if (isResizingMat) {
                e.preventDefault();
                const dx = e.clientX - matDragStart.current.startX;
                const dy = e.clientY - matDragStart.current.startY;
                setMatPanel(prev => ({ ...prev, w: Math.max(250, matDragStart.current.w + dx), h: Math.max(200, matDragStart.current.h + dy) }));
            }
        };
        const handleMouseUp = () => { setIsDraggingMat(false); setIsResizingMat(false); };
        if (isDraggingMat || isResizingMat) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
        return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }, [isDraggingMat, isResizingMat]);

    // ... (Calculation Logic: calculateOpTimeForEdit, etc. UNCHANGED) ...
    const calculateOpTimeForEdit = (op: Operation) => {
        const machine = machines.find(m => m.id === op.machineId) || machines.find(m => (m.name || '').toLowerCase() === (op.machineName || '').toLowerCase());
        const machineNameUpper = (machine?.name || op.machineName || 'MAN').toUpperCase();
        const isMan = machineNameUpper === 'MAN' || machineNameUpper.includes('MANUEL');

        const isCounterMachine =
            machineNameUpper.includes('BOUTON') ||
            machineNameUpper.includes('BRIDE') ||
            machineNameUpper.includes('BARTACK') ||
            machineNameUpper.includes('TROU') ||
            machineNameUpper.includes('OEILLET') ||
            machineNameUpper.includes('POSE');

        const getStandardCycleTime = (mName: string) => {
            const name = (mName || '').toLowerCase();
            const matchedStd = standardTimes.find(s => {
                const label = (s.label || '').toLowerCase();
                if (name.includes('bouton') && (label.includes('bouton') || label.includes('botonière'))) return true;
                if (name.includes('botonière') && (label.includes('bouton') || label.includes('botonière'))) return true;
                if (name.includes('bride') && label.includes('bride')) return true;
                if (name.includes('bartack') && (label.includes('bartack') || label.includes('bride'))) return true;
                if (name.includes('oeillet') && label.includes('oeillet')) return true;
                return false;
            });
            if (matchedStd) return matchedStd.unit === 'sec' ? matchedStd.value / 60 : matchedStd.value;
            if (name.includes('bouton') || name.includes('botonière')) return 4 / 60;
            if (name.includes('bride')) return 4 / 60;
            return 0.15;
        };

        const L = parseFloat(String(op.length)) || 0;
        const stitchLengthMm = op.stitchCount !== undefined ? parseFloat(String(op.stitchCount)) : 4;
        const rpm = parseFloat(String(op.rpm)) || (machine?.speed || 2500);
        const speedFact = parseFloat(String(op.speedFactor)) || (machine?.speedMajor || 1.01);
        const guideFact = op.guideFactor !== undefined && op.guideFactor !== 0 ? parseFloat(String(op.guideFactor)) : (isCounterMachine ? 1.0 : 1.1);
        const endPrecision = op.endPrecision !== undefined ? parseFloat(String(op.endPrecision)) : (isMan ? 0 : 0.01);
        const stop = op.startStop !== undefined ? parseFloat(String(op.startStop)) : (isMan ? 0 : 0.01);
        const maj = parseFloat(String(op.majoration)) || (machine?.cofs || 1.12);

        let tMac = 0;
        if (!isMan) {
            if (isCounterMachine) {
                const quantity = L;
                const cycleTimePerUnit = getStandardCycleTime(machine?.name || op.machineName || '');
                tMac = (quantity * cycleTimePerUnit) * guideFact;
            } else if (rpm > 0) {
                const density = stitchLengthMm > 0 ? 10 / stitchLengthMm : 4;
                const baseSewing = (L * density) / rpm;
                tMac = (baseSewing * speedFact * guideFact) + endPrecision + stop;
            }
        }

        let tMan = parseFloat(String(op.manualTime));
        if (tMac > 0 && (!tMan || tMan === 0)) {
            if (L > 0 || isCounterMachine) {
                if (isCounterMachine) tMan = 0.18;
                else tMan = Number(Math.max(0.15, L * 0.005).toFixed(2));
            } else {
                tMan = 0.18;
            }
        } else if (!tMan) {
            tMan = 0;
        }

        let fabricPenalty = 0;
        if (fabricSettings && fabricSettings.enabled) {
            const penaltySec = fabricSettings.values[fabricSettings.selected];
            fabricPenalty = penaltySec / 60;
        }

        const totalMin = ((tMac + tMan) * maj) + fabricPenalty;
        return totalMin;
    };

    const handleUpdateOperation = (opId: string, field: keyof Operation, value: any) => {
        setOperations(prev => prev.map(op => {
            if (op.id !== opId) return op;

            let updatedOp = { ...op, [field]: value };

            if (field === 'forcedTime') {
                updatedOp.time = value;
            } else {
                if (field !== 'description' && field !== 'guideName') {
                    updatedOp.forcedTime = undefined;
                }
                if (field === 'machineName') {
                    const m = machines.find(mac => (mac.name || '').toLowerCase() === (value || '').toLowerCase());
                    updatedOp.machineId = m ? m.id : '';
                }
                updatedOp.time = calculateOpTimeForEdit(updatedOp);
            }
            return updatedOp;
        }));
    };

    // ... (Workstation Calculation, Waiting Stations, compactPostes... UNCHANGED) ...
    const workstations = useMemo(() => {
        if (postes && postes.length > 0 && assignments) {
            let initialStations: Workstation[] = postes.map((p, realIndex) => {
                let totalTime = 0; let saturation = 0; let operators = 1;
                const assignedOps = operations.filter(op => assignments[op.id]?.some(aid => aid === p.id || (p.originalId && aid === p.originalId)));
                const groups = [...new Set(assignedOps.map(op => op.groupId).filter(Boolean) as string[])];
                const gammeOrderMin = assignedOps.length > 0 ? Math.min(...assignedOps.map(o => o.order)) : 9999;

                if (p.timeOverride !== undefined) {
                    totalTime = p.timeOverride;
                    if (bf > 0) {
                        operators = 1;
                        saturation = (totalTime / bf) * 100;
                    }
                } else {
                    assignedOps.forEach(op => {
                        let sharingCount = 1;
                        if (p.originalId) {
                            sharingCount = postes.filter(x => x.originalId === p.originalId).length;
                        } else {
                            sharingCount = assignments[op.id]?.length || 1;
                        }

                        totalTime += (op.time || 0) / sharingCount;
                    });

                    const nTheo = bf > 0 ? totalTime / bf : 0;
                    operators = nTheo > 1.15 ? Math.ceil(nTheo) : (nTheo > 0 ? 1 : 0);

                    if (p.originalId) {
                        operators = 1;
                    }

                    saturation = (operators > 0 && bf > 0) ? (totalTime / (operators * bf)) * 100 : 0;
                }
                operators = Math.max(1, operators);
                const pNum = parseInt(p.name.replace(/^P/i, ''));
                const effectiveIndex = !isNaN(pNum) ? pNum - 1 : realIndex;
                const color = getPosteColor(effectiveIndex, p.machine, p.colorName);

                let feedsInto: string | undefined = undefined;
                let isFeeder = false;

                for (const op of assignedOps) {
                    if (op.targetOperationId) {
                        const targetStation = postes.find(st => assignments[op.targetOperationId!]?.includes(st.id));
                        if (targetStation && targetStation.id !== p.id) {
                            feedsInto = targetStation.id;
                            isFeeder = true;
                            break;
                        }
                    }
                }

                const isBroken = p.notes?.includes('#PANNE');
                return { ...p, index: 0, originalIndex: realIndex, operations: assignedOps, totalTime, saturation, operators, color, groups, feedsInto, isFeeder, gammeOrderMin, isPlaced: p.isPlaced, status: isBroken ? 'panne' : 'ok', x: p.x, y: p.y, rotation: p.rotation, shape: p.shape };
            });

            const sortedStations = [...initialStations];
            const expandedResult: Workstation[] = [];
            sortedStations.forEach((st, idx) => {
                const showOnCanvas = isManualMode ? (st.isPlaced === true || st.machine === 'VIDE') : true;
                if (showOnCanvas) {
                    if (st.originalId) {
                        expandedResult.push({ ...st, index: expandedResult.length + 1, isPlaced: true });
                    } else {
                        for (let i = 1; i <= st.operators; i++) {
                            expandedResult.push({
                                ...st,
                                id: `${st.id}__${i}`,
                                name: st.operators > 1 ? `${st.name.replace('P', '').split('.')[0]}.${i}` : st.name,
                                index: expandedResult.length + 1,
                                totalTime: st.totalTime / st.operators,
                                isPlaced: true
                            });
                        }
                    }
                }
            });
            return expandedResult;
        }
        return [];
    }, [operations, bf, assignments, postes, isManualMode]);

    const waitingStations = useMemo(() => {
        if (!isManualMode || !postes) return [];
        return postes.filter(p => !p.isPlaced && p.machine !== 'VIDE').map((p, idx) => {
            const assignedOps = operations.filter(op => assignments?.[op.id]?.some(aid => aid === p.id || (p.originalId && aid === p.originalId)));
            const groups = [...new Set(assignedOps.map(op => op.groupId).filter(Boolean) as string[])];
            const realIndex = postes.findIndex(station => station.id === p.id);
            const pNum = parseInt(p.name.replace(/^P/i, ''));
            const effectiveIndex = !isNaN(pNum) ? pNum - 1 : realIndex;
            const realColor = getPosteColor(effectiveIndex, p.machine, p.colorName);
            let totalTime = 0; let saturation = 0; let operators = 1;
            if (p.timeOverride !== undefined) {
                totalTime = p.timeOverride;
                if (bf > 0) { operators = 1; saturation = (totalTime / bf) * 100; }
            } else {
                assignedOps.forEach(op => {
                    let sharingCount = 1;
                    if (p.originalId) { sharingCount = postes.filter(x => x.originalId === p.originalId).length; } else { sharingCount = assignments[op.id]?.length || 1; }
                    totalTime += (op.time || 0) / sharingCount;
                });
                const nTheo = bf > 0 ? totalTime / bf : 0;
                operators = nTheo > 1.15 ? Math.ceil(nTheo) : (nTheo > 0 ? 1 : 0);
                if (p.originalId) { operators = 1; }
                saturation = (operators > 0 && bf > 0) ? (totalTime / (operators * bf)) * 100 : 0;
            }
            operators = Math.max(1, operators);
            return { ...p, operations: assignedOps, color: realColor, groups: groups, totalTime, saturation, operators: operators, index: 0, originalIndex: realIndex } as Workstation;
        }).sort((a, b) => {
            const minA = a.operations.length > 0 ? Math.min(...a.operations.map(o => o.order)) : 9999;
            const minB = b.operations.length > 0 ? Math.min(...b.operations.map(o => o.order)) : 9999;
            return minA - minB;
        });
    }, [postes, isManualMode, operations, assignments, bf]);

    const compactPostes = () => { if (!setPostes || !postes) return; const placed = postes.filter(p => p.isPlaced && p.machine !== 'VIDE'); const unplaced = postes.filter(p => !p.isPlaced && p.machine !== 'VIDE'); const emptySlotsNeeded = Math.max(0, 20 - placed.length); const empties: Poste[] = Array.from({ length: emptySlotsNeeded }).map((_, i) => ({ id: `empty-auto-${Date.now()}-${i}`, name: `Slot`, machine: 'VIDE', isPlaced: true, colorName: 'vide' })); let pCount = 1; const newPlaced = placed.map(p => ({ ...p, name: `P${pCount++}` })); setPostes([...newPlaced, ...empties, ...unplaced]); };
    const renumberStations = () => { if (!setPostes || !postes) return; let pCount = 1; const reindexed = postes.map((p) => { if (p.isPlaced && p.machine !== 'VIDE') { return { ...p, name: `P${pCount++}` }; } return p; }); setPostes(reindexed); };

    const handleManualDrop = (stationId: string) => {
        if (setPostes && postes) {
            const stationFromWaiting = postes.find(p => p.id === stationId && !p.isPlaced);
            if (stationFromWaiting) {
                const newPostes = [...postes];
                const idx = newPostes.findIndex(p => p.id === stationId);
                if (idx !== -1) {
                    const item = { ...newPostes[idx], isPlaced: true };
                    newPostes.splice(idx, 1);
                    if (isMagnetic) {
                        const firstEmptySlotIdx = newPostes.findIndex(p => p.machine === 'VIDE' && p.isPlaced);
                        if (firstEmptySlotIdx !== -1) { newPostes[firstEmptySlotIdx] = item; } else { const placed = newPostes.filter(p => p.isPlaced); const unplaced = newPostes.filter(p => !p.isPlaced); newPostes.splice(0, newPostes.length, ...placed, item, ...unplaced); }
                    } else {
                        const firstVideIndex = newPostes.findIndex(p => p.isPlaced && p.machine === 'VIDE');
                        if (firstVideIndex !== -1) { newPostes[firstVideIndex] = item; } else { const placed = newPostes.filter(p => p.isPlaced); const unplaced = newPostes.filter(p => !p.isPlaced); newPostes.splice(0, newPostes.length, ...placed, item, ...unplaced); }
                    }
                    setPostes(newPostes);
                }
            }
        }
    };

    const handleRemoveFromCanvas = (stationId: string) => {
        if (setPostes && postes) {
            const idx = postes.findIndex(p => p.id === stationId);
            if (idx !== -1) {
                const newPostes = [...postes];
                const itemToRemove = { ...newPostes[idx], isPlaced: false };

                // Only remove completely if it's an auto-generated empty slot or manual empty slot
                const isRealStation = itemToRemove.machine !== 'VIDE' || (itemToRemove.notes && itemToRemove.notes.length > 0);

                if (isRealStation) {
                    // Keep it, just unplace it
                    if (isMagnetic) {
                        newPostes.splice(idx, 1); // Remove from current position
                        newPostes.push(itemToRemove); // Add to end (waiting list)

                        // Add empty slot to fill gap if needed (magnetic behavior)
                        const videItem: Poste = { id: `empty-auto-fill-${Date.now()}`, name: 'Slot', machine: 'VIDE', isPlaced: true, colorName: 'vide' };
                        let lastPlacedIdx = -1;
                        for (let i = newPostes.length - 1; i >= 0; i--) { if (newPostes[i].isPlaced) { lastPlacedIdx = i; break; } }
                        newPostes.splice(lastPlacedIdx + 1, 0, videItem);
                    } else {
                        const videItem: Poste = { id: `empty-replaced-${Date.now()}`, name: 'Slot', machine: 'VIDE', isPlaced: true, colorName: 'vide' };
                        newPostes[idx] = videItem; // Replace with empty slot
                        newPostes.push(itemToRemove); // Add to end (waiting list)
                    }
                } else {
                    // It's just an empty slot
                    if (isMagnetic) {
                        newPostes.splice(idx, 1);
                    } else {
                        // Completely remove if manual delete requested on empty slot
                        newPostes.splice(idx, 1);
                    }
                }
                setPostes(newPostes);

                // CLEANUP: Remove any links associated with this station (USING PROPS)
                if (setManualLinks) {
                    setManualLinks(prev => prev.filter(l => l.from !== stationId && l.to !== stationId));
                }
            }
        }
    };

    // ... (Other helpers: addSingleEmptySlot, activateManualMode, etc. UNCHANGED) ...
    const addSingleEmptySlot = () => {
        if (!setPostes || !postes) return;

        // Calculate center position for new empty slot
        const containerRect = contentRef.current?.getBoundingClientRect();
        const parentRect = scrollContainerRef.current?.getBoundingClientRect();

        let startX = 100;
        let startY = 100;

        if (parentRect && containerRect) {
            // Attempt to place in center of view
            const scrollX = scrollContainerRef.current?.scrollLeft || 0;
            const scrollY = scrollContainerRef.current?.scrollTop || 0;
            startX = (scrollX + parentRect.width / 2) / zoom;
            startY = (scrollY + parentRect.height / 2) / zoom;
        }

        const newSlot: Poste = {
            id: `empty-manual-${Date.now()}`,
            name: 'Slot',
            machine: 'VIDE',
            isPlaced: true,
            colorName: 'vide',
            x: startX,
            y: startY
        };

        // Add to placed items (at the end of array usually, but rendered position matters)
        setPostes([...postes, newSlot]);
    };

    const saveManualLayout = () => { setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); };

    useEffect(() => { let interval: any; const totalSteps = Math.max(0, (workstations.length * 2) + 2); if (simulationActive) { interval = setInterval(() => { setSimStep(prev => { if (prev >= totalSteps) { setSimulationActive(false); return totalSteps; } return prev + 1; }); }, 500); } return () => clearInterval(interval); }, [simulationActive, workstations.length]);
    const toggleSimulation = () => { if (simulationActive) { setSimulationActive(false); } else { setSimStep(-1); setSimulationActive(true); } };
    const resetSimulation = () => { setSimulationActive(false); setSimStep(-1); };

    const zigZagPairs = useMemo(() => { const pairs = []; const usedIndices = new Set<number>(); if (isManualMode) { for (let i = 0; i < workstations.length; i += 2) { const top = workstations[i]; const bottom = workstations[i + 1]; pairs.push({ top, bottom }); } } else { for (let i = 0; i < workstations.length; i++) { if (usedIndices.has(i)) continue; const current = workstations[i]; if (current.machine === 'VIDE') continue; let bottomCandidateIndex = -1; if (current.isFeeder) { const targetBaseId = current.feedsInto; for (let j = i + 1; j < workstations.length; j++) { if (usedIndices.has(j)) continue; const candidate = workstations[j]; const candidateBaseId = candidate.id.split('__')[0]; if (candidateBaseId === targetBaseId) { bottomCandidateIndex = j; break; } } } if (bottomCandidateIndex !== -1) { pairs.push({ top: current, bottom: workstations[bottomCandidateIndex] }); usedIndices.add(i); usedIndices.add(bottomCandidateIndex); } else { let nextIndex = i + 1; while ((usedIndices.has(nextIndex) || (workstations[nextIndex] && workstations[nextIndex].machine === 'VIDE')) && nextIndex < workstations.length) nextIndex++; if (nextIndex < workstations.length) { pairs.push({ top: current, bottom: workstations[nextIndex] }); usedIndices.add(i); usedIndices.add(nextIndex); } else { pairs.push({ top: current, bottom: undefined }); usedIndices.add(i); } } } } return pairs; }, [workstations, isManualMode]);
    const wheatGroups = useMemo(() => { const groups = []; let currentGroup: { left: Workstation | null, right: Workstation | null } = { left: null, right: null }; workstations.forEach((st, i) => { if (!currentGroup.left) { currentGroup.left = st; } else { currentGroup.right = st; groups.push(currentGroup); currentGroup = { left: null, right: null }; } }); if (currentGroup.left) { groups.push(currentGroup); } return groups; }, [workstations]);
    const machinesSummary = useMemo(() => { const summary: Record<string, number> = {}; let total = 0; workstations.forEach(st => { const mName = st.machine.toUpperCase().includes('MAN') ? 'MAN' : st.machine; if (!summary[mName]) summary[mName] = 0; summary[mName] += 1; total += 1; }); return { counts: Object.entries(summary), total }; }, [workstations]);

    const handleDragStart = (e: React.DragEvent, index: number, isWaitingList = false, stationId?: string) => {
        if (isSpacePressed) { e.preventDefault(); return; } // Prevent drag if panning
        if (isLinking) { e.preventDefault(); return; }
        if (isWaitingList && stationId) { e.dataTransfer.setData("stationId", stationId); e.dataTransfer.effectAllowed = "copy"; } else if (!canEdit || !isManualMode) { return; } else { setDraggedStationIdx(index); e.dataTransfer.effectAllowed = "move"; } setEditModal(null);
    };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
    const handleDrop = (e: React.DragEvent, targetPosteIdx: number) => { e.preventDefault(); e.stopPropagation(); if (isLinking) return; const droppedStationId = e.dataTransfer.getData("stationId"); if (isManualMode && setPostes && postes) { let newPostes = [...postes]; const targetItem = newPostes[targetPosteIdx]; if (!targetItem) return; if (droppedStationId) { const waitingStationIdx = newPostes.findIndex(p => p.id === droppedStationId); if (waitingStationIdx === -1) return; const stationToPlace = { ...newPostes[waitingStationIdx], isPlaced: true }; newPostes.splice(waitingStationIdx, 1); let adjustedTargetIdx = targetPosteIdx; if (waitingStationIdx < targetPosteIdx) { adjustedTargetIdx--; } if (isMagnetic) { newPostes.splice(adjustedTargetIdx, 0, stationToPlace); } else { const currentTarget = newPostes[adjustedTargetIdx]; if (currentTarget && currentTarget.machine === 'VIDE') { newPostes[adjustedTargetIdx] = stationToPlace; } else { newPostes.splice(adjustedTargetIdx, 0, stationToPlace); } } } else if (draggedStationIdx !== null && draggedStationIdx !== undefined) { const sourceRealIdx = draggedStationIdx; if (sourceRealIdx === -1 || sourceRealIdx >= newPostes.length) return; if (sourceRealIdx === targetPosteIdx) { setDraggedStationIdx(null); return; } const sourceItem = newPostes[sourceRealIdx]; const targetSlotItem = newPostes[targetPosteIdx]; if (!sourceItem || !targetSlotItem) return; if (isMagnetic) { newPostes.splice(sourceRealIdx, 1); let finalTargetIdx = targetPosteIdx; if (sourceRealIdx < targetPosteIdx) finalTargetIdx--; newPostes.splice(finalTargetIdx, 0, sourceItem); } else { newPostes[targetPosteIdx] = sourceItem; newPostes[sourceRealIdx] = targetSlotItem; } } setPostes(newPostes); setDraggedStationIdx(null); } };

    const handleAddPost = () => { if (!setPostes || !postes) return; const newId = `P${postes.length + 1}`; const newPoste: Poste = { id: newId, name: newId, machine: selectedMachineToAdd, notes: '', operatorName: '', isPlaced: isManualMode }; setPostes([...postes, newPoste]); };
    const reorderPostes = (list: Poste[], isSwapped: boolean) => { const isControl = (p: Poste) => { const m = p.machine.toUpperCase(); return m.includes('CONTROLE') || m.includes('CONTROL'); }; const isFinition = (p: Poste) => { const m = p.machine.toUpperCase(); return m.includes('FINITION'); }; const control = list.filter(isControl); const finition = list.filter(isFinition); const others = list.filter(p => !isControl(p) && !isFinition(p)); const newOrder = isSwapped ? [...others, ...control, ...finition] : [...others, ...finition, ...control]; return newOrder.map((p, i) => ({ ...p, name: `P${i + 1}` })); };
    const handleSwapZones = () => { if (!setPostes || !postes) return; const newState = !swapControlFinition; setSwapControlFinition(newState); setPostes(reorderPostes(postes, newState)); };
    const handleAddSpecial = (type: 'CONTROLE' | 'FINITION') => { if (!setPostes || !postes) return; const newPoste: Poste = { id: `P_${Date.now()}`, name: 'P?', machine: type, notes: '', operatorName: '', isPlaced: isManualMode }; const newList = [...postes, newPoste]; setPostes(reorderPostes(newList, swapControlFinition)); };
    const handleRemoveSpecial = (type: 'CONTROLE' | 'FINITION') => { if (!setPostes || !postes) return; const reversedPostes = [...postes].reverse(); const indexToRemoveReversed = reversedPostes.findIndex(p => { const m = p.machine.toUpperCase(); if (type === 'CONTROLE') return m.includes('CONTROLE') || m.includes('CONTROL'); if (type === 'FINITION') return m.includes('FINITION'); return false; }); if (indexToRemoveReversed !== -1) { const realIndex = postes.length - 1 - indexToRemoveReversed; const newPostes = [...postes]; newPostes.splice(realIndex, 1); setPostes(reorderPostes(newPostes, swapControlFinition)); } };

    const handleStationClick = (targetStation: Workstation) => { if (isLinking) { handleLinkClick(targetStation.id); return; } if (swapSourceId && setPostes && postes) { if (swapSourceId === targetStation.id) { setSwapSourceId(null); return; } const sourceBaseId = swapSourceId.split('__')[0]; const targetBaseId = targetStation.id.split('__')[0]; const sourceIndex = postes.findIndex(p => p.id === sourceBaseId); const targetIndex = postes.findIndex(p => p.id === targetBaseId); if (sourceIndex !== -1 && targetIndex !== -1) { const newPostes = [...postes]; const sourceItem = newPostes[sourceIndex]; const targetItem = newPostes[targetIndex]; newPostes[sourceIndex] = targetItem; newPostes[targetIndex] = sourceItem; const reindexed = newPostes.map((p, i) => ({ ...p, name: `P${i + 1}` })); setPostes(reindexed); } setSwapSourceId(null); } };
    const handleOpenEditModal = (e: React.MouseEvent | null, station: Workstation) => { if (e) { e.preventDefault(); e.stopPropagation(); } if (!canEdit) return; const realIdx = postes!.findIndex(p => p.id === station.id.split('__')[0]); if (realIdx === -1) return; setShowDeleteConfirm(false); setEditModal({ isOpen: true, stationIndex: realIdx, data: { ...postes![realIdx] }, color: station.color, operators: station.operators }); };
    const closeEditModal = () => { setEditModal(null); setShowDeleteConfirm(false); };
    const saveStationMetadata = (updatedData: Partial<Poste>) => { if (!setPostes || !postes || !editModal) return; setEditModal(prev => prev ? ({ ...prev, data: { ...prev.data, ...updatedData } }) : null); const newPostes = [...postes]; newPostes[editModal.stationIndex] = { ...newPostes[editModal.stationIndex], ...updatedData }; setPostes(newPostes); };
    const deleteFromModal = () => { if (!setPostes || !postes || !editModal) return; const newPostes = [...postes]; newPostes.splice(editModal.stationIndex, 1); const reindexed = newPostes.map((p, i) => ({ ...p, name: `P${i + 1}` })); setPostes(reindexed); closeEditModal(); };
    const modalOps = useMemo(() => { if (!editModal || !assignments) return []; const stationId = editModal.data.id; const parentId = editModal.data.originalId; return operations.filter(op => { const assignedTo = assignments[op.id] || []; return assignedTo.includes(stationId) || (parentId && assignedTo.includes(parentId)); }).sort((a, b) => a.order - b.order); }, [editModal, operations, assignments]);

    const StationCard: React.FC<{ station: Workstation; isGrid?: boolean; isMini?: boolean }> = ({ station, isGrid = false, isMini = false }) => {
        const color = station.color; const isVide = station.machine === 'VIDE'; const timeInSeconds = Math.round(station.totalTime * 60); const hasNotes = station.notes && station.notes.trim().length > 0; const hasOperator = station.operatorName && station.operatorName.trim().length > 0; const isOverridden = station.timeOverride !== undefined; const mySimIndex = station.index - 1; const isActive = !isMini && simStep === mySimIndex; const isPassed = simStep > mySimIndex; const isControl = station.machine.toUpperCase().includes('CONTROLE'); const isFer = station.machine.toUpperCase().includes('FER') || station.machine.toUpperCase().includes('REPASSAGE'); const isFinition = station.machine.toUpperCase().includes('FINITION'); const isBroken = station.notes?.includes('#PANNE');
        let bodyBgClass = 'bg-white'; if (isControl) bodyBgClass = 'bg-orange-50'; if (isFer) bodyBgClass = 'bg-rose-50'; if (isFinition) bodyBgClass = 'bg-purple-50'; const isSpecial = isControl || isFer || isFinition;
        const isFeeder = station.isFeeder; if (isFeeder) bodyBgClass = 'bg-blue-50/50';
        const isSwapSource = swapSourceId === station.id; const isSwapTarget = swapSourceId && swapSourceId !== station.id; const isLinkSource = linkSource === station.id; const isLinkTargetCandidate = isLinking && linkSource && linkSource !== station.id;
        const cardHeightClass = isGrid ? 'min-h-[140px]' : (isMini ? 'min-h-[80px]' : 'h-full min-h-[140px]'); const cardWidthClass = isMini ? 'w-full' : (isGrid ? 'w-full' : 'w-44 sm:w-48 shrink-0'); const miniCardStyle = isMini ? `${color.bg} ${color.border} border-2` : `bg-white border-2`; const cursorClass = (canEdit && isManualMode && !swapSourceId && !isLinking && !isSpacePressed) ? 'cursor-move' : 'cursor-default';

        // MODIFIED: Make Vide slots behave like normal cards in auto/free modes (draggable, context menu)
        if (isVide && !isMini) {
            return (
                <div
                    id={`station-card-${station.id}`}
                    // Drag logic for AUTO modes (swapping)
                    draggable={canEdit && isManualMode && !swapSourceId && !isLinking && layoutType !== 'free' && !isSpacePressed}
                    onDragStart={(e) => handleDragStart(e, station.originalIndex, false, station.id)}
                    onDragEnd={() => setDraggedStationIdx(null)}
                    // Drag events for Free Mode
                    onMouseDown={(e) => layoutType === 'free' && handleFreeStart(e, station.id, station.x || 0, station.y || 0)}
                    onTouchStart={(e) => layoutType === 'free' && handleFreeStart(e, station.id, station.x || 0, station.y || 0)}
                    // Keep Drop Logic
                    onDragOver={handleDragOver}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, station.originalIndex); }}
                    // Context Menu
                    onContextMenu={(e) => { handleContextMenu(e, station); }}
                    className={`relative rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-2 group z-10 transition-all ${(canEdit && isManualMode && !swapSourceId && !isLinking && !isSpacePressed && layoutType !== 'free') ? 'cursor-move' : ''} ${cardWidthClass} ${cardHeightClass} ${isManualMode && !isSpacePressed ? 'hover:bg-indigo-50 hover:border-indigo-300' : ''} ${layoutType === 'free' ? 'cursor-move hover:shadow-lg' : ''}`}
                >
                    <div className="text-[10px] font-bold text-slate-400 uppercase pointer-events-none">Emplacement Vide</div>

                    {/* Delete Button for Free Mode */}
                    {layoutType === 'free' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveFromCanvas(station.id); }}
                            className="absolute top-2 right-2 p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            );
        }

        return (
            <div
                id={isMini ? `station-card-mini-${station.id}` : `station-card-${station.id}`}
                onClick={() => handleStationClick(station)}
                onContextMenu={(e) => { handleContextMenu(e, station); }}
                onDoubleClick={(e) => handleOpenEditModal(e, station)}
                draggable={canEdit && isManualMode && !swapSourceId && !isLinking && layoutType !== 'free' && !isSpacePressed}
                onDragStart={(e) => handleDragStart(e, station.originalIndex, isMini, station.id)}
                onDragEnd={() => setDraggedStationIdx(null)}
                onDragOver={handleDragOver}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, station.originalIndex); }}
                // Added z-10 and relative positioning to ensure cards are above the SVG lines
                className={`relative rounded-xl overflow-hidden group shadow-sm z-10 bg-white ${cardWidthClass} ${cardHeightClass} ${canEdit && isManualMode && !isLinking && layoutType !== 'free' && !isSpacePressed ? 'hover:-translate-y-1 hover:shadow-lg' : ''} ${cursorClass} ${isActive ? 'ring-4 ring-emerald-400 border-emerald-500 scale-105 shadow-xl z-20' : isLinkSource ? 'ring-4 ring-indigo-500 border-indigo-600 scale-105 shadow-xl z-20 animate-pulse' : isLinkTargetCandidate ? 'cursor-pointer hover:ring-4 hover:ring-indigo-300 hover:border-indigo-400' : isSwapSource ? 'ring-4 ring-indigo-500 border-indigo-600 scale-105 shadow-xl z-20' : isSwapTarget ? 'cursor-pointer hover:ring-4 hover:ring-indigo-300 hover:border-indigo-400' : isPassed ? 'border-emerald-200 opacity-90' : (isMini ? color.border : color.border)} ${isBroken ? 'ring-2 ring-rose-500 border-rose-600 bg-rose-50' : ''} ${miniCardStyle} transition-all duration-300 flex flex-col select-none`}
            >
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isActive ? 'bg-emerald-500' : (isBroken ? 'bg-rose-500' : color.fill)}`}></div>
                <div className={`px-2 pl-3 py-1.5 flex justify-between items-center ${isActive ? 'bg-emerald-500' : (isPassed ? 'bg-emerald-50' : (isMini ? color.bg : color.bg))} border-b ${isActive ? 'border-emerald-600' : color.border} transition-colors duration-500 relative`}>
                    {isOverridden && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-purple-500 ring-1 ring-white animate-pulse" title="Temps Forcé"></div>}
                    {isBroken && <div className="absolute top-1 right-3 w-3 h-3 text-rose-600 animate-pulse"><AlertTriangle className="w-3 h-3 fill-current" /></div>}
                    <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-black ${isActive ? 'text-emerald-600 bg-white' : color.text} w-5 h-5 flex items-center justify-center bg-white rounded-md shadow-sm border border-black/5`}> {station.name.replace('P', '').split('.')[0]} </span>
                        <span className={`text-[9px] font-black uppercase truncate max-w-[80px] ${isActive ? 'text-white' : color.text}`} title={station.name}> {station.machine} </span>
                    </div>

                    {/* DELETE LINK BUTTON ON CARD */}
                    {showLinks && manualLinks && manualLinks.some(l => l.from === station.id || l.to === station.id) && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const linkToDelete = manualLinks.find(l => l.from === station.id || l.to === station.id);
                                if (linkToDelete) handleRemoveLink(linkToDelete.id);
                            }}
                            className="p-1 rounded-full bg-rose-500 text-white shadow-md hover:bg-rose-600 transition-colors z-30"
                            title="Supprimer la liaison"
                        >
                            <Unlink2 className="w-2.5 h-2.5" />
                        </button>
                    )}

                    {!isMini && (
                        <div className="ml-auto mr-1 flex items-center gap-1">
                            {isManualMode && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleRemoveFromCanvas(station.id); }}
                                    className="p-1 rounded-md bg-white/20 hover:bg-rose-100 hover:text-rose-600 text-current transition-colors opacity-0 group-hover:opacity-100 z-50"
                                    title="Retirer du plan"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                            <button
                                onClick={(e) => handleContextMenu(e, station)}
                                className="p-1 rounded-md bg-white/20 hover:bg-white/40 text-current transition-colors"
                            >
                                <MoreVertical className="w-3 h-3" />
                            </button>
                        </div>
                    )}

                    {!isMini && (<div className="flex items-center gap-0.5"> {isFeeder && <div title={`Alimente: ${station.targetStationName || 'Poste Suivant'}`}><GitMerge className={`w-3 h-3 ${isActive ? 'text-white' : 'text-blue-500'}`} /></div>} {hasOperator && <div title={station.operatorName}><User className={`w-3 h-3 ${isActive ? 'text-white' : 'text-slate-400'}`} /></div>} {hasNotes && <div title="Notes"><FileText className={`w-3 h-3 ${isActive ? 'text-yellow-300' : 'text-amber-400'}`} /></div>} </div>)}
                </div>
                <div className={`p-2 pl-3 flex-1 flex flex-col justify-between gap-1 ${isMini ? 'bg-white' : bodyBgClass}`}> {station.groups && station.groups.length > 0 && !isMini && (<div className="flex flex-wrap gap-1 mb-1"> {station.groups.slice(0, 2).map(grp => (<span key={grp} className="text-[7px] font-black uppercase text-indigo-600 bg-indigo-100 px-1 py-0.5 rounded border border-indigo-200 truncate max-w-full"> {grp} </span>))} {station.groups.length > 2 && <span className="text-[7px] text-slate-400">+{station.groups.length - 2}</span>} </div>)} <div className="space-y-1"> {station.operations.length > 0 ? (<> {station.operations.slice(0, isMini ? 100 : 3).map((op, i) => { const groupStyle = op.groupId ? getGroupStyle(op.groupId) : null; return (<div key={i} className={`flex justify-between items-center gap-1.5 py-0.5 ${groupStyle && isMini ? groupStyle.bg + ' px-1.5 rounded-md -mx-1.5 my-0.5 border border-transparent hover:border-indigo-200' : ''}`}> <span className={`font-mono text-[9px] font-bold px-1 rounded border shrink-0 ${groupStyle && isMini ? 'bg-white/50 border-transparent ' + groupStyle.text : 'bg-slate-50 text-slate-400 border-slate-100'}`}> {op.order} </span> <div className={`text-[9px] font-bold leading-tight line-clamp-2 flex-1 ${groupStyle && isMini ? groupStyle.text : 'text-slate-600'}`} title={op.description}> {op.description} </div> {groupStyle && isMini && <LinkIcon className={`w-2.5 h-2.5 shrink-0 ${groupStyle.text}`} />} </div>) })} {station.operations.length > (isMini ? 100 : 3) && <div className="text-[8px] text-slate-400 italic font-medium">... +{station.operations.length - (isMini ? 100 : 3)}</div>} </>) : (<div className={`text-[9px] italic flex items-center justify-center ${isMini ? 'h-8' : 'h-12'} ${isOverridden ? 'text-purple-500 font-bold' : (isSpecial ? 'text-slate-400/70' : 'text-slate-300')}`}> {isOverridden ? 'Temps Forcé' : 'Vide'} </div>)} </div> <div className="flex items-center justify-between mt-auto pt-1.5 border-t border-slate-100"> <div className="flex flex-col"> <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Total</span> <span className={`text-sm font-bold ${isActive ? 'text-emerald-600' : (isOverridden ? 'text-purple-600' : color.text)}`}>{timeInSeconds}s</span> </div> <div className="flex flex-col items-end"> <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Sat.</span> <div className="flex items-center gap-1"> {station.operators > 1 && <span className={`text-[9px] font-black px-1 rounded bg-amber-100 text-amber-700`}>x{station.operators}</span>} <span className={`text-[9px] font-black ${station.saturation > 100 ? 'text-rose-500' : 'text-emerald-500'}`}>{Math.round(station.saturation)}%</span> </div> </div> </div> </div> <div className="absolute bottom-0 left-0 h-1 bg-slate-200 w-full"> <div className={`h-full ${isActive ? 'bg-emerald-400' : (isFer ? 'bg-rose-500' : (isControl ? 'bg-orange-500' : (isFinition ? 'bg-purple-500' : color.fill)))}`} style={{ width: `${Math.min(station.saturation, 100)}%` }}></div> </div> </div>);
    };

    return (
        <div className="flex flex-col h-full gap-2 relative">
            {/* ... (Header Stats - UNCHANGED) ... */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-2 p-2 flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
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

                {/* T. ARTICLE */}
                <div className="ml-auto px-4 py-1.5 bg-purple-100 rounded-lg border border-purple-200 flex flex-col items-end shrink-0">
                    <span className="text-[9px] font-bold text-purple-500 uppercase flex items-center gap-1"><Timer className="w-3 h-3" /> T. Article</span>
                    <span className="font-black text-purple-700 text-xl leading-none">{tempsArticle.toFixed(2)}</span>
                </div>
            </div>

            {/* FULLSCREEN WRAPPER */}
            <div ref={fullscreenWrapperRef} className={`flex flex-col flex-1 min-h-0 relative transition-all duration-300 ${isFullScreen ? 'bg-white p-4 overflow-hidden fixed inset-0 z-[5000]' : ''}`}>

                {/* --- LIVE COUNTER WIDGET --- */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <div className="bg-slate-800/90 backdrop-blur-md text-white px-5 py-2 rounded-full shadow-lg border border-slate-700/50 flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                        <Calculator className="w-4 h-4 text-emerald-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Machines Placées</span>
                        <div className="flex items-center justify-center w-7 h-7 bg-white/10 rounded-full font-black text-sm text-emerald-400">
                            {placedMachinesCount}
                        </div>
                    </div>
                </div>

                {/* TOOLBAR (CLEANED UP & ORGANIZED) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center justify-between gap-4 shrink-0 z-30 mb-2 mt-4 relative">

                    {/* LEFT: Modes & Auto Refresh */}
                    <div className="flex items-center gap-3">
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                            <button
                                onClick={activateAutoMode}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all text-sm ${!isManualMode ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                <Bot className="w-4 h-4" /> <span className="hidden lg:inline">Mode Auto</span><span className="lg:hidden">Auto</span>
                            </button>
                            <button
                                onClick={activateManualMode}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all text-sm ${isManualMode ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                <Hand className="w-4 h-4" /> <span className="hidden lg:inline">Mode Manuel</span><span className="lg:hidden">Manuel</span>
                            </button>
                        </div>

                        {!isManualMode && (
                            <button onClick={refreshAuto} title="Actualiser la distribution" className="flex items-center justify-center p-3 bg-emerald-50/80 border border-emerald-200 text-emerald-600 font-bold rounded-xl hover:bg-emerald-100 transition-colors shadow-sm active:scale-95">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        )}

                        {isManualMode && (
                            <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-200">
                                <button onClick={addSingleEmptySlot} className="p-2 text-slate-500 hover:text-emerald-600 transition-colors" title="Ajouter Poste Vide"><Plus className="w-4 h-4" /></button>
                                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                                <button onClick={compactPostes} className="p-2 text-slate-500 hover:text-blue-600 transition-colors" title="Compacter"><Maximize2 className="w-4 h-4" /></button>
                            </div>
                        )}
                    </div>

                    {/* CENTER: Layout Styles */}
                    <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 shadow-inner overflow-x-auto no-scrollbar">
                        {[
                            { id: 'zigzag', label: 'U (Lignes)', icon: LayoutDashboard },
                            { id: 'line', label: 'Ligne', icon: AlignHorizontalSpaceAround },
                            { id: 'snake', label: 'Serpent', icon: AlignIcon },
                            { id: 'grid', label: 'Grille', icon: GridIcon },
                            { id: 'free', label: 'Libre', icon: Move },
                        ].map((item) => (
                            <button
                                key={item.id}
                                onClick={() => handleLayoutChange(item.id as any)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${layoutType === item.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-indigo-600'}`}
                            >
                                <item.icon className="w-4 h-4" />
                                <span className="hidden xl:inline">{item.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* RIGHT: Actions (Free mode tools + Export) */}
                    <div className="flex items-center gap-3">
                        {isManualMode && layoutType === 'free' && (
                            <div className="hidden lg:flex items-center bg-violet-50 p-1 rounded-xl border border-violet-200 shadow-inner">
                                <span className="text-[10px] font-black tracking-wider text-violet-400 px-2 uppercase">Assistant</span>
                                <button onClick={() => applyLayoutPattern('U')} className="p-2 rounded-lg text-violet-600 hover:bg-white transition-colors" title="Forme U"><Columns className="w-4 h-4" /></button>
                                <button onClick={() => applyLayoutPattern('GRID')} className="p-2 rounded-lg text-violet-600 hover:bg-white transition-colors" title="Grille"><LayoutGrid className="w-4 h-4" /></button>
                                <button onClick={() => applyLayoutPattern('CIRCLE')} className="p-2 rounded-lg text-violet-600 hover:bg-white transition-colors" title="Cercle"><CircleDashed className="w-4 h-4" /></button>
                            </div>
                        )}

                        {/* --- NEW: MAGNETIC SNAP TOGGLE --- */}
                        {isManualMode && layoutType === 'free' && (
                            <button
                                onClick={toggleMagnetic}
                                title="Alignement Magnétique"
                                className={`flex items-center justify-center p-2 rounded-xl font-bold text-sm transition-all shadow-sm ${isMagnetic ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:text-indigo-600 active:scale-95'}`}
                            >
                                <Magnet className={`w-5 h-5 ${isMagnetic ? 'rotate-180 drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]' : ''} transition-transform duration-300`} />
                            </button>
                        )}

                        {isManualMode && (
                            <button onClick={() => setIsLinking(!isLinking)} title="Mode Liaison (Flux)" className={`flex items-center justify-center p-2 rounded-xl font-bold text-sm transition-all shadow-sm ${isLinking ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:text-indigo-600 active:scale-95'}`}>
                                <MousePointerClick className="w-5 h-5" />
                            </button>
                        )}

                        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 shadow-inner">
                            {/* Materials Panel Toggle (Machine Counter) */}
                            <button onClick={() => setShowMaterialsPanel(!showMaterialsPanel)} className={`p-2 rounded-lg transition-colors shadow-sm ${showMaterialsPanel ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:text-indigo-600 border border-slate-100'}`} title="Compteur de machines">
                                <Calculator className="w-4 h-4" />
                            </button>

                            {/* Load / Save Layout History */}
                            <button onClick={() => setShowLoadTemplateModal(true)} className="p-2 rounded-lg bg-white text-slate-500 hover:text-indigo-600 border border-slate-100 transition-colors shadow-sm" title="Ouvrir un plan sauvegardé">
                                <FolderOpen className="w-4 h-4" />
                            </button>
                            <button onClick={() => setShowSaveTemplateModal(true)} className="p-2 rounded-lg bg-white text-slate-500 hover:text-emerald-600 border border-slate-100 transition-colors shadow-sm" title="Sauvegarder le plan actuel">
                                <Save className="w-4 h-4" />
                            </button>

                            {/* Clear Canvas Button for Free Mode */}
                            {isManualMode && layoutType === 'free' && (
                                <button
                                    onClick={() => {
                                        if (confirm("Voulez-vous vraiment effacer le plan libre ? Tous les postes retourneront dans la file d'attente.")) {
                                            setPostes(prev => prev.map(p => ({ ...p, isPlaced: false, x: undefined, y: undefined })));
                                            if (setManualLinks) setManualLinks([]);
                                        }
                                    }}
                                    className="p-2 rounded-lg bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-100 transition-colors shadow-sm"
                                    title="Effacer le plan"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}

                            <button onClick={handleExportPlan} className="px-3 py-2 bg-white rounded-lg flex items-center gap-2 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-100 transition-colors shadow-sm text-slate-700 text-xs font-bold whitespace-nowrap">
                                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />} <span className="hidden sm:inline">Exporter</span>
                            </button>
                            {onSave && (
                                <button onClick={() => { onSave(); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 2500); }} className="px-3 py-2 bg-slate-800 text-white rounded-lg flex items-center gap-2 border border-slate-700 hover:bg-emerald-600 hover:border-emerald-600 transition-colors shadow-sm text-xs font-bold whitespace-nowrap active:scale-95">
                                    {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} <span className="hidden sm:inline">{saveSuccess ? 'Sauvé' : 'Sauver'}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* LINKING MODE BANNER */}
                {isLinking && (
                    <div className="bg-indigo-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-md mb-2 rounded-lg animate-in slide-in-from-top-2 z-20">
                        <div className="flex items-center gap-2">
                            <MousePointerClick className="w-4 h-4 text-indigo-200" />
                            <span>Mode Liaison : {linkSource ? "Sélectionnez la destination..." : "Sélectionnez le poste de départ"}</span>
                        </div>
                        <button
                            onClick={() => { setIsLinking(false); setLinkSource(null); }}
                            className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-md text-[10px] transition-colors"
                        >
                            Terminer
                        </button>
                    </div>
                )}

                {/* SWAP MODE BANNER */}
                {swapSourceId && !isLinking && (
                    <div className="bg-orange-500 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-md mb-2 rounded-lg animate-in slide-in-from-top-2 z-20">
                        <div className="flex items-center gap-2">
                            <SwapIcon className="w-4 h-4" />
                            <span>Mode Échange Actif : Sélectionnez le poste cible pour échanger.</span>
                        </div>
                        <button
                            onClick={() => setSwapSourceId(null)}
                            className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-md text-[10px] transition-colors"
                        >
                            Annuler
                        </button>
                    </div>
                )}

                {/* 2. ZONES INDICATOR - UNCHANGED */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto text-[10px] font-bold uppercase text-slate-400 shadow-inner shrink-0 mb-1">
                    <div className="flex items-center gap-2 px-2 py-0.5 bg-white rounded-lg border border-slate-200 opacity-60 shrink-0"><Package className="w-3 h-3 text-slate-400" /> Stock Tissu</div><ArrowRight className="w-3 h-3 text-slate-300 shrink-0" /><div className="flex items-center gap-2 px-2 py-0.5 bg-white rounded-lg border border-slate-200 opacity-60 shrink-0"><Scissors className="w-3 h-3 text-slate-400" /> Coupe & Prep</div><ArrowRight className="w-3 h-3 text-emerald-400 shrink-0" /><div className="flex items-center gap-2 px-2 py-0.5 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-700 shadow-sm shrink-0"><Layers className="w-3 h-3" /> Montage (Atelier)</div><ArrowRight className="w-3 h-3 text-emerald-400 shrink-0" />
                    <div className="flex items-center gap-3">
                        {swapControlFinition ? (
                            <>
                                <SpecialZoneControl label="Contrôle" type="CONTROLE" icon={Eye} color={{ bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', hoverBg: 'hover:bg-orange-100' }} currentCount={postes?.filter(p => p.machine.toUpperCase().includes('CONTROLE')).length || 0} onAdd={handleAddSpecial} onRemove={handleRemoveSpecial} />
                                <button onClick={handleSwapZones} className="p-1 hover:bg-slate-200 rounded-full transition-colors shrink-0 transform active:rotate-180 duration-300" title="Inverser ordre"><ArrowRightLeft className="w-3 h-3 text-slate-400" /></button>
                                <SpecialZoneControl label="Finition" type="FINITION" icon={Sparkles} color={{ bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', hoverBg: 'hover:bg-purple-100' }} currentCount={postes?.filter(p => p.machine.toUpperCase().includes('FINITION')).length || 0} onAdd={handleAddSpecial} onRemove={handleRemoveSpecial} />
                            </>
                        ) : (
                            <>
                                <SpecialZoneControl label="Finition" type="FINITION" icon={Sparkles} color={{ bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', hoverBg: 'hover:bg-purple-100' }} currentCount={postes?.filter(p => p.machine.toUpperCase().includes('FINITION')).length || 0} onAdd={handleAddSpecial} onRemove={handleRemoveSpecial} />
                                <button onClick={handleSwapZones} className="p-1 hover:bg-slate-200 rounded-full transition-colors shrink-0 transform active:rotate-180 duration-300" title="Inverser ordre"><ArrowRightLeft className="w-3 h-3 text-slate-400" /></button>
                                <SpecialZoneControl label="Contrôle" type="CONTROLE" icon={Eye} color={{ bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', hoverBg: 'hover:bg-orange-100' }} currentCount={postes?.filter(p => p.machine.toUpperCase().includes('CONTROLE')).length || 0} onAdd={handleAddSpecial} onRemove={handleRemoveSpecial} />
                            </>
                        )}
                    </div>
                    <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" /><div className="flex items-center gap-2 px-2 py-0.5 bg-white rounded-lg border border-slate-200 opacity-60 shrink-0"><Truck className="w-3 h-3 text-slate-400" /> Expédition</div>
                </div>

                {/* 3. CANVAS (With Wrapper & Styles for Scrollbars) */}
                <div className="flex-1 flex gap-4 min-h-0 relative h-full">

                    {/* MINI-GAMME SIDEBAR (VISIBLE IN MANUAL MODE) - RESPONSIVE (DRAWER ON MOBILE) */}
                    {isManualMode && (
                        <>
                            {/* Mobile Backdrop */}
                            <div
                                className={`lg:hidden fixed inset-0 bg-black/20 z-20 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                                onClick={() => setIsSidebarOpen(false)}
                            />

                            <div className={`absolute lg:relative h-full bg-white border-r border-slate-200 shadow-xl z-30 flex flex-col transition-all duration-300 ease-in-out shrink-0 ${isSidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full lg:w-8 lg:translate-x-0'}`}>
                                {/* Toggle Button - Repositioned for Mobile vs Desktop */}
                                <button
                                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                    className={`absolute -right-3 top-4 bg-white border border-slate-200 text-slate-500 rounded-full p-1 shadow-md hover:text-indigo-600 z-50 transition-transform active:scale-95 ${!isSidebarOpen && window.innerWidth < 1024 ? 'hidden' : ''}`}
                                >
                                    {isSidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </button>

                                {/* Mobile Open Button (When Closed) */}
                                {!isSidebarOpen && (
                                    <button
                                        onClick={() => setIsSidebarOpen(true)}
                                        className="lg:hidden absolute top-4 left-4 z-20 bg-white p-2 rounded-lg shadow-md border border-slate-200 text-indigo-600"
                                    >
                                        <Menu className="w-5 h-5" />
                                    </button>
                                )}

                                {/* Sidebar Content (Visible when open) */}
                                <div className={`flex-1 flex flex-col overflow-hidden transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none invisible'}`}>
                                    <div className="p-3 border-b border-slate-200 bg-white flex justify-between items-center">
                                        <div>
                                            <h3 className="font-bold text-xs uppercase text-slate-500 flex items-center gap-2">
                                                <Inbox className="w-4 h-4" /> Gamme d'attente
                                            </h3>
                                            <p className="text-[9px] text-slate-400 mt-0.5">Glissez vers la zone</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setGroupDragMode(!groupDragMode)}
                                                className={`p-1.5 rounded-md transition-colors border ${groupDragMode ? 'bg-indigo-100 text-indigo-600 border-indigo-200' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'}`}
                                                title={groupDragMode ? "Déplacement Groupé Actif" : "Déplacement Simple"}
                                            >
                                                {groupDragMode ? <LinkIcon className="w-3.5 h-3.5" /> : <Unlink2 className="w-3.5 h-3.5" />}
                                            </button>
                                            <span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">{waitingStations.length}</span>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                        {waitingStations.map(station => (
                                            <div key={station.id} className="cursor-grab active:cursor-grabbing w-full">
                                                <StationCard station={station as Workstation} isMini={true} />
                                            </div>
                                        ))}
                                        {waitingStations.length === 0 && (
                                            <div className="text-center py-8 text-slate-400 text-xs italic">
                                                Tous les postes sont placés.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Collapsed State Indicator (Visible when closed on Desktop) */}
                                {!isSidebarOpen && (
                                    <div className="absolute inset-0 flex flex-col items-center pt-16 gap-4 w-full lg:flex hidden">
                                        <Inbox className="w-5 h-5 text-indigo-500" />
                                        <div className="h-full w-full flex justify-center">
                                            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest whitespace-nowrap" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}>
                                                Gamme d'attente ({waitingStations.length})
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ... (Main Canvas Area with force-scrollbar styles same as before) ... */}
                    <div className="flex-1 rounded-2xl bg-slate-100 border border-slate-200 shadow-inner relative overflow-hidden flex flex-col transition-all duration-300">

                        {/* Injected Styles for Scrollbars */}
                        <style>{`
                       .force-scrollbar {
                           scrollbar-width: thin;
                           scrollbar-color: #cbd5e1 transparent;
                       }
                       .force-scrollbar::-webkit-scrollbar {
                           display: block;
                           width: 8px;
                           height: 8px;
                       }
                       .force-scrollbar::-webkit-scrollbar-track {
                           background: transparent;
                       }
                       .force-scrollbar::-webkit-scrollbar-thumb {
                           background-color: #94a3b8;
                           border-radius: 20px;
                           border: 2px solid transparent;
                           background-clip: content-box;
                       }
                       .force-scrollbar::-webkit-scrollbar-thumb:hover {
                           background-color: #6366f1;
                       }
                       .force-scrollbar::-webkit-scrollbar-corner {
                           background: transparent;
                       }
                   `}</style>

                        <div
                            className="absolute inset-0 opacity-[0.4] transition-all duration-200"
                            style={{
                                backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                                backgroundSize: '20px 20px',
                                cursor: isPanning ? 'grabbing' : (isSpacePressed ? 'grab' : 'default')
                            }}
                        />

                        {/* DROPPABLE AREA FOR MANUAL MODE - CHANGED HERE TO FIX ZOOM ALIGNMENT */}
                        <div
                            ref={scrollContainerRef}
                            className={`flex-1 overflow-auto p-4 relative z-10 custom-scrollbar force-scrollbar flex flex-col ${orientation === 'portrait' ? 'items-center' : 'items-start pl-4'}`}
                            style={{ cursor: isPanning ? 'grabbing' : (isSpacePressed ? 'grab' : 'auto') }}
                            onMouseDown={handlePanStart}
                            onMouseMove={handlePanMove}
                            onMouseUp={handlePanEnd}
                            onMouseLeave={handlePanEnd}
                            onContextMenu={handleFreeContextMenu} // Right click on background
                            onDragOver={(e) => isManualMode && e.preventDefault()}
                            onDrop={(e) => {
                                if (isManualMode) {
                                    e.preventDefault();
                                    const id = e.dataTransfer.getData("stationId");
                                    if (id) {
                                        handleManualDrop(id);
                                    } else if (draggedStationIdx !== null) {
                                        // Handle dragging existing item from canvas to background
                                    }
                                }
                            }}
                        >
                            {/* SVG IS NOW INSIDE THE SCALED DIV TO ENSURE PERFECT ALIGNMENT & SCALING */}
                            <div
                                ref={contentRef}
                                className={`transition-transform duration-200 ease-out origin-top-left relative ${layoutType === 'grid' ? 'w-full' : 'min-w-max'}`}
                                style={{ transform: `scale(${zoom})` }}
                            >
                                {/* SVG OVERLAY - inside zoomed contentRef, uses scrollContainerRef for scroll offsets */}
                                {manualLinks && (
                                    <LinkOverlay
                                        links={manualLinks}
                                        stations={workstations}
                                        showLinks={showLinks}
                                        zoom={zoom}
                                        containerRef={scrollContainerRef}
                                        onRemoveLink={handleRemoveLink}
                                        onEditLabel={handleEditLinkLabel}
                                    />
                                )}

                                {/* FREE LAYOUT MODE */}
                                {layoutType === 'free' && (
                                    <div className="relative w-[3000px] h-[2000px] bg-slate-50/20 rounded-xl" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
                                        {workstations.map((st, idx) => {
                                            // Calculate default positions if not set
                                            const col = idx % 6;
                                            const row = Math.floor(idx / 6);
                                            const defaultX = 50 + (col * 240);
                                            const defaultY = 50 + (row * 180);

                                            const x = st.x ?? defaultX;
                                            const y = st.y ?? defaultY;
                                            const rotation = st.rotation || 0;
                                            const shape = st.shape || 'rect';

                                            const isDraggingThis = freeDragRef.current?.id === st.id;

                                            return (
                                                <div
                                                    key={st.id}
                                                    id={`station-card-${st.id}`}
                                                    className={`absolute transition-shadow ${isDraggingThis ? 'z-[100] shadow-2xl scale-105 cursor-grabbing' : 'z-10'} ${isSpacePressed ? 'cursor-grab' : 'cursor-move hover:z-50'}`}
                                                    style={{
                                                        left: x,
                                                        top: y,
                                                        transform: `rotate(${rotation}deg)`
                                                    }}
                                                    onMouseDown={(e) => handleFreeStart(e, st.id, x, y)}
                                                    onTouchStart={(e) => handleFreeStart(e, st.id, x, y)}
                                                    onContextMenu={(e) => {
                                                        // Prevent default context menu, let background one handle general or item specific
                                                        // For now, we use the same handler but pass station info via state if needed, or rely on selection
                                                        handleContextMenu(e, st);
                                                    }}
                                                >
                                                    <div className="pointer-events-none">
                                                        {shape === 'circle' ? (
                                                            <div className="w-32 h-32 rounded-full border-4 border-dashed border-slate-300 bg-white/80 flex items-center justify-center shadow-sm">
                                                                <div className="text-center">
                                                                    <div className="text-xs font-bold text-slate-500">{st.name}</div>
                                                                    <div className="text-[10px] text-slate-400">{st.machine}</div>
                                                                </div>
                                                            </div>
                                                        ) : shape === 'zone' ? (
                                                            <div className="w-48 h-32 border-2 border-dashed border-indigo-300 bg-indigo-50/30 rounded-xl flex items-center justify-center">
                                                                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Zone {st.name}</span>
                                                            </div>
                                                        ) : (
                                                            <StationCard station={st} />
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* ... (Layout rendering logic: WHEAT, ZIGZAG, GRID - UNCHANGED) ... */}
                                {layoutType === 'wheat' && (
                                    <div className="flex flex-col gap-12 items-center pb-20 w-full min-w-max px-8 pt-8">
                                        {wheatGroups.map((group, idx) => {
                                            const left = group.left;
                                            const right = group.right;

                                            return (
                                                <div key={idx} className="flex flex-col items-center relative">
                                                    {/* CENTRAL SPINE CONNECTOR */}
                                                    <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-1.5 bg-slate-300 -z-10 rounded-full h-[140%]" />

                                                    <div className="flex items-center gap-16 relative">
                                                        {/* LEFT WING */}
                                                        <div className="relative w-44">
                                                            {left ? (
                                                                <>
                                                                    <StationCard station={left} />
                                                                    {/* Connector Arm to Spine */}
                                                                    <div className="absolute top-1/2 left-full w-8 h-1.5 bg-slate-300 -translate-y-1/2 z-0"></div>
                                                                    <div className="absolute top-1/2 left-full translate-x-4 -translate-y-1/2 w-3 h-3 bg-white border-2 border-slate-300 rounded-full z-10"></div>
                                                                </>
                                                            ) : (
                                                                <div className="h-20 w-full border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 text-xs font-bold uppercase">
                                                                    Emplacement Libre
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* CENTER NODE */}
                                                        <div className="relative z-10 w-4 h-4 bg-slate-800 rounded-full border-2 border-white shadow-sm shrink-0"></div>

                                                        {/* RIGHT WING */}
                                                        <div className="relative w-44">
                                                            {right ? (
                                                                <>
                                                                    <StationCard station={right} />
                                                                    {/* Connector Arm to Spine */}
                                                                    <div className="absolute top-1/2 right-full w-8 h-1.5 bg-slate-300 -translate-y-1/2 z-0"></div>
                                                                    <div className="absolute top-1/2 right-full -translate-x-7 -translate-y-1/2 w-3 h-3 bg-white border-2 border-slate-300 rounded-full z-10"></div>
                                                                </>
                                                            ) : (
                                                                <div className="h-20 w-full border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 text-xs font-bold uppercase">
                                                                    Emplacement Libre
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div className="mt-8 flex flex-col items-center relative z-10">
                                            <div className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-xl shadow-lg border-2 border-slate-700">
                                                <Truck className="w-5 h-5" /> <span className="text-sm font-bold uppercase">Expédition</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* FIXED: Zigzag U-Shape Layout - Proper aligned pairs with flow indicators */}
                                {(layoutType === 'zigzag' || layoutType === 'snake') && (
                                    <div className={`flex gap-6 pb-20 min-w-max ${orientation === 'landscape' ? 'flex-col items-center pt-8' : 'flex-row items-start pl-8'}`}>
                                        <div className="relative">
                                            {/* Production Path Arrow SVG Background (Conceptual U-Turn) */}
                                            <div className="absolute -inset-4 border-2 border-slate-200 border-dashed rounded-[40px] opacity-20 -z-10 pointer-events-none" />

                                            <div className={`flex items-stretch gap-6 relative z-10 ${orientation === 'landscape' ? 'flex-row' : 'flex-col'}`}>
                                                {zigZagPairs.map((pair, i) => {
                                                    const isLastCol = i === zigZagPairs.length - 1;
                                                    const isEven = i % 2 === 0;

                                                    return (
                                                        <div key={i} className={`flex relative ${orientation === 'landscape' ? 'flex-col items-center gap-0' : 'flex-row items-center gap-0'}`}>
                                                            {/* COL LABEL REMOVED AS REQUESTED IN PHASE 25 */}
                                                            {/* TOP CARD */}
                                                            <div className="relative z-10 transition-transform hover:scale-[1.02]">
                                                                <StationCard station={pair.top} />
                                                            </div>

                                                            {/* CONNECTOR with Direction Arrow between TOP and BOTTOM */}
                                                            <div className={`${orientation === 'landscape' ? 'w-1 h-10 bg-slate-200 mx-auto relative' : 'h-1 w-10 bg-slate-200 my-auto relative'}`}>
                                                                <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full p-0.5 shadow-sm z-20`}>
                                                                    {pair.bottom && (
                                                                        <ArrowDown className={`w-3 h-3 ${orientation === 'landscape' ? 'text-indigo-400' : 'rotate-[-90deg] text-indigo-400'}`} />
                                                                    )}
                                                                </div>
                                                                {/* Flow line animation */}
                                                                <div className="absolute inset-0 overflow-hidden">
                                                                    <div className={`absolute inset-0 bg-indigo-500 opacity-20 ${isEven ? 'animate-pulse' : ''}`} />
                                                                </div>
                                                            </div>

                                                            {/* BOTTOM CARD */}
                                                            <div className="relative z-10 transition-transform hover:scale-[1.02]">
                                                                {pair.bottom ? (
                                                                    <StationCard station={pair.bottom} />
                                                                ) : (

                                                                    <div className="w-48 h-[140px] border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-300 bg-white/50">
                                                                        <div className="w-8 h-8 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center">
                                                                            <Plus className="w-4 h-4" />
                                                                        </div>
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider">Emplacement Vide</span>
                                                                    </div>

                                                                )}
                                                            </div>

                                                            {/* FLOW ARROW / HORIZONTAL CONNECTOR to next column */}
                                                            {!isLastCol && (
                                                                <div className={`absolute z-20 flex items-center justify-center ${orientation === 'landscape'
                                                                    ? `bottom-[-20px] right-[-15px] translate-x-full`
                                                                    : 'right-[-25px] top-1/2 -translate-y-1/2 translate-x-full'
                                                                    }`}>
                                                                    <div className="flex items-center gap-1 opacity-40">
                                                                        <ChevronRight className="w-5 h-5 text-indigo-300" />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}

                                                {/* Expédition at the heart of the U-Turn or at the end */}
                                                <div className={`flex items-center justify-center ${orientation === 'landscape' ? 'self-center ml-12' : 'mt-12'}`}>
                                                    <div className="flex items-center gap-3 px-6 py-4 bg-slate-800 text-white rounded-2xl shadow-xl border border-slate-700 hover:bg-slate-900 transition-colors group">
                                                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center group-hover:bg-emerald-500 transition-colors">
                                                            <Truck className="w-6 h-6" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Destination</span>
                                                            <span className="text-sm font-black uppercase tracking-widest">EXPÉDITION</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* OTHER LAYOUTS REMAIN SAME */}
                                {layoutType === 'grid' && (
                                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 min-h-[500px]">
                                        {workstations.map(st => <StationCard key={st.id} station={st} isGrid={true} />)}
                                    </div>
                                )}

                                {layoutType === 'line' && (
                                    <div className="flex flex-col gap-12 p-8 w-full">
                                        {/* Line 1 */}
                                        <div className="flex items-center gap-4">

                                            <div className="flex gap-4 overflow-x-auto pb-4 pt-2 px-2 border-b border-dashed border-slate-200 w-full custom-scrollbar">
                                                {workstations.slice(0, Math.ceil(workstations.length / 2)).map(st => (
                                                    <div key={st.id} className="shrink-0">
                                                        <StationCard station={st} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Line 2 */}
                                        <div className="flex items-center gap-4">

                                            <div className="flex gap-4 overflow-x-auto pb-4 pt-2 px-2 w-full custom-scrollbar">
                                                {workstations.slice(Math.ceil(workstations.length / 2)).map(st => (
                                                    <div key={st.id} className="shrink-0">
                                                        <StationCard station={st} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* FLOATING MATERIAL PANEL */}
                    {showMaterialsPanel && (
                        <div className="fixed z-[5010] bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col" style={{ left: matPanel.x, top: matPanel.y, width: matPanel.w, height: matPanel.h }}>
                            <div onMouseDown={startDragMat} className="p-4 bg-slate-50 border-b border-slate-100 cursor-move select-none flex justify-between items-center">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm pointer-events-none"><Calculator className="w-4 h-4 text-indigo-500" /> Total Matériel</h3>
                                <button onClick={() => setShowMaterialsPanel(false)} onMouseDown={(e) => e.stopPropagation()} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                                <table className="w-full text-left border-collapse"><tbody>{machinesSummary.counts.map(([name, count]) => (<tr key={name} className="border-b border-slate-50 hover:bg-slate-50"><td className="py-2 px-3 text-xs font-medium text-slate-600">{name}</td><td className="py-2 px-3 text-right"><span className="inline-flex items-center justify-center bg-slate-100 text-slate-700 font-bold text-[10px] px-2 py-0.5 rounded-full min-w-[24px]">{count}</span></td></tr>))}</tbody></table>
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100 relative"><div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-500 uppercase">Total Postes</span><span className="text-lg font-black text-indigo-600">{machinesSummary.total}</span></div><div onMouseDown={startResizeMat} className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-center justify-center opacity-50 hover:opacity-100"><Scaling className="w-4 h-4 text-slate-400 rotate-90" /></div></div>
                        </div>
                    )}
                </div>

                {/* Fullscreen Close Button */}
                {isFullScreen && (
                    <button
                        onClick={toggleFullScreen}
                        className="absolute top-4 right-4 z-50 p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all hover:scale-110"
                        title="Quitter plein écran"
                    >
                        <X className="w-6 h-6" />
                    </button>
                )}
            </div>

            {/* ... (Existing Edit Modal & Context Menu Portals - no changes needed there) ... */}
            {editModal && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* BACKDROP */}
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeEditModal} />
                    {/* MODAL CONTENT */}
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        {/* DYNAMIC HEADER COLOR */}
                        <div className={`px-6 py-4 border-b flex justify-between items-center shrink-0 ${editModal.color.bg} ${editModal.color.border}`}>
                            {/* ... same header ... */}
                            <div className="flex items-center gap-3">
                                <div className={`p-2 bg-white rounded-lg shadow-sm border ${editModal.color.border}`}>
                                    <PenTool className={`w-5 h-5 ${editModal.color.text}`} />
                                </div>
                                <div>
                                    <h3 className={`font-bold text-lg leading-tight ${editModal.color.text}`}>Modifier Poste {editModal.data.name}</h3>
                                    <p className="text-[10px] uppercase font-bold text-slate-500 opacity-80 flex items-center gap-2">
                                        {editModal.data.machine}
                                        <span className="w-px h-3 bg-slate-300"></span>
                                        {modalOps.length} Opérations
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 ml-auto mr-4">
                                <div className="relative group">
                                    <User className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Opérateur..."
                                        value={editModal.data.operatorName || ''}
                                        onChange={(e) => saveStationMetadata({ operatorName: e.target.value })}
                                        className="pl-7 pr-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white/80 focus:bg-white focus:border-indigo-400 outline-none w-32"
                                    />
                                </div>
                                <div className="relative group">
                                    <Clock className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input
                                        type="number"
                                        placeholder="T. Forcé"
                                        value={editModal.data.timeOverride !== undefined ? Math.round(editModal.data.timeOverride * 60) : ''}
                                        onChange={(e) => { const val = e.target.value === '' ? undefined : Number(e.target.value); saveStationMetadata({ timeOverride: val !== undefined ? val / 60 : undefined }); }}
                                        className="pl-7 pr-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white/80 focus:bg-white focus:border-purple-400 outline-none w-24 text-purple-600 placeholder:text-slate-400"
                                        title="Forcer temps poste (sec)"
                                    />
                                </div>
                            </div>
                            <button onClick={closeEditModal} className={`p-1.5 hover:bg-white/50 rounded-lg transition-colors ${editModal.color.text}`}><X className="w-5 h-5" /></button>
                        </div>
                        {/* SCROLLABLE TABLE BODY */}
                        <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50 p-4">
                            <table className="w-full text-left border-collapse bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="py-3 px-4 w-12 text-center border-b border-slate-200">N°</th>
                                        <th className="py-3 px-4 border-b border-slate-200">Description</th>
                                        <th className="py-3 px-4 w-40 border-b border-slate-200">Machine</th>
                                        <th className="py-3 px-4 w-20 text-center border-b border-slate-200">L / Qté</th>
                                        <th className="py-3 px-4 w-20 text-center border-b border-slate-200">F.Guide</th>
                                        <th className="py-3 px-4 w-24 text-center border-b border-slate-200 text-emerald-600">Temps</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-sm">
                                    {modalOps.map((op, idx) => {
                                        const isForced = op.forcedTime !== undefined;
                                        return (
                                            <tr key={op.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="py-2 px-2 text-center font-mono text-slate-400 font-bold border-r border-slate-50">{op.order}</td>
                                                <td className="py-2 px-2">
                                                    <input
                                                        type="text"
                                                        value={op.description}
                                                        onChange={(e) => handleUpdateOperation(op.id, 'description', e.target.value)}
                                                        className="w-full bg-transparent outline-none font-medium text-slate-700 placeholder:text-slate-300 focus:bg-white focus:shadow-sm rounded px-2 py-1 transition-all"
                                                        placeholder="Description..."
                                                    />
                                                </td>
                                                <td className="py-2 px-2">
                                                    <ExcelInput
                                                        suggestions={machines.map(m => m.name)}
                                                        value={op.machineName || ''}
                                                        onChange={(val) => handleUpdateOperation(op.id, 'machineName', val)}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-600 outline-none focus:border-indigo-400 focus:bg-white transition-all uppercase"
                                                        placeholder="MAC"
                                                    />
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                    <input
                                                        type="number"
                                                        value={op.length !== undefined && op.length !== null ? op.length : ''}
                                                        onChange={(e) => handleUpdateOperation(op.id, 'length', Number(e.target.value))}
                                                        className="w-full text-center bg-transparent outline-none font-mono text-slate-600 focus:bg-white focus:shadow-sm rounded px-1 py-1"
                                                        placeholder="-"
                                                    />
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                    <select
                                                        value={op.guideFactor || 1.1}
                                                        onChange={(e) => handleUpdateOperation(op.id, 'guideFactor', Number(e.target.value))}
                                                        className="bg-transparent outline-none text-xs font-bold text-slate-500 cursor-pointer hover:text-indigo-600 appearance-none text-center w-full"
                                                    >
                                                        {complexityFactors.map(f => (
                                                            <option key={f.id} value={f.value}>{f.value}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="py-2 px-2 text-center bg-slate-50/50">
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={Math.round((op.time || 0) * 60)}
                                                            readOnly
                                                            className={`w-full text-center font-bold outline-none bg-transparent ${isForced ? 'text-purple-600' : 'text-emerald-600'}`}
                                                            disabled
                                                        />
                                                        <span className="text-[9px] text-slate-400 absolute right-0 top-1/2 -translate-y-1/2">s</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {modalOps.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-slate-400 italic bg-white">
                                                Aucune opération assignée. Utilisez le mode Manuel pour ajouter des opérations.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot className="bg-slate-50 border-t border-slate-200">
                                    <tr>
                                        <td colSpan={5} className="py-3 px-4 text-right font-bold text-xs uppercase text-slate-500">Total Poste:</td>
                                        <td className="py-3 px-4 text-center font-black text-emerald-700 bg-emerald-50 border-l border-emerald-100">
                                            {Math.round(modalOps.reduce((sum, op) => sum + (op.time || 0), 0) * 60)}s
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        {/* FOOTER ACTIONS - WITH DELETE CONFIRMATION */}
                        <div className="p-4 bg-white border-t border-slate-200 flex justify-between gap-3 shrink-0 transition-all">
                            {showDeleteConfirm ? (
                                <div className="flex items-center justify-between w-full bg-rose-50 p-2 rounded-lg border border-rose-100 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="flex items-center gap-2 text-rose-700 font-bold text-xs px-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        <span>Êtes-vous sûr de vouloir supprimer ce poste ?</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="px-3 py-1.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors"
                                        >
                                            Annuler
                                        </button>
                                        <button
                                            onClick={() => deleteFromModal()}
                                            className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 shadow-sm transition-colors"
                                        >
                                            Confirmer
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 rounded-xl text-xs font-bold transition-all shadow-sm text-slate-500">
                                        <Trash2 className="w-4 h-4" />
                                        <span>Supprimer</span>
                                    </button>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => closeEditModal()}
                                            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-colors"
                                        >
                                            Fermer
                                        </button>
                                        <button
                                            onClick={() => closeEditModal()}
                                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-100 transition-colors"
                                        >
                                            Enregistrer
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
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
                    <button onClick={() => handleContextAction('modify')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2 transition-colors"><PenTool className="w-3.5 h-3.5 text-indigo-500" /> Modifier Poste</button>
                    <button onClick={() => handleContextAction('swap')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2 transition-colors"><ArrowRightLeft className="w-3.5 h-3.5 text-orange-500" /> Échanger (Swap)</button>
                    {layoutType === 'free' && (
                        <>
                            <div className="h-px bg-slate-100 my-1"></div>
                            <button onClick={() => handleContextAction('rotate')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2 transition-colors"><RotateCw className="w-3.5 h-3.5 text-blue-500" /> Rotation (+45°)</button>
                            <div className="px-4 py-1 text-[9px] font-bold text-slate-400 uppercase mt-1">Forme</div>
                            <button onClick={() => handleContextAction('shape_rect')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2 transition-colors"><Square className="w-3.5 h-3.5 text-slate-500" /> Rectangle</button>
                            <button onClick={() => handleContextAction('shape_circle')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2 transition-colors"><Circle className="w-3.5 h-3.5 text-slate-500" /> Cercle / Rond</button>
                        </>
                    )}
                    <div className="h-px bg-slate-100 my-1"></div>
                    <button onClick={() => handleContextAction('insert')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2 transition-colors"><Plus className="w-3.5 h-3.5 text-emerald-500" /> Insérer Vide</button>

                    {isManualMode ? (
                        <button onClick={() => handleContextAction('delete')} className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-amber-600 flex items-center gap-2 transition-colors font-bold">
                            <LogOut className="w-3.5 h-3.5" /> Retirer du plan
                        </button>
                    ) : (
                        <button onClick={() => handleContextAction('delete')} className="w-full text-left px-4 py-2.5 hover:bg-rose-50 text-rose-600 flex items-center gap-2 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" /> Supprimer
                        </button>
                    )}
                </div>,
                document.body
            )}

            {/* FREE MODE BACKGROUND CONTEXT MENU */}
            {freeContextMenu && freeContextMenu.visible && createPortal(
                <div
                    className="absolute z-[9999] bg-white border border-slate-200 rounded-xl shadow-2xl py-1 w-56 text-xs font-medium text-slate-700 animate-in fade-in zoom-in-95 duration-100 origin-top-left overflow-hidden ring-4 ring-slate-100/50"
                    style={{ top: freeContextMenu.y, left: freeContextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ajouter Élément</div>
                    <button onClick={() => handleAddFreeItem('poste')} className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center gap-3 transition-colors text-indigo-700 font-bold"><Plus className="w-4 h-4" /> Nouveau Poste</button>
                    <div className="h-px bg-slate-100 my-1"></div>
                    <button onClick={() => handleAddFreeItem('circle')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2 transition-colors"><Circle className="w-3.5 h-3.5 text-slate-500" /> Zone Circulaire</button>
                    <button onClick={() => handleAddFreeItem('rect')} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2 transition-colors"><BoxSelect className="w-3.5 h-3.5 text-slate-500" /> Zone Rectangulaire</button>
                </div>,
                document.body
            )}

            {/* ... (Existing Save/Load Template Modals - NO CHANGES NEEDED) ... */}
            {showSaveTemplateModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSaveTemplateModal(false)} />
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6">
                        <h3 className="font-bold text-slate-800 text-lg mb-4">Sauvegarder le Gabarit</h3>
                        <input
                            type="text"
                            autoFocus
                            placeholder="Nom du gabarit (ex: Standard T-Shirt)"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            className="w-full border border-slate-300 rounded-xl px-4 py-3 mb-6 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-sm font-medium"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowSaveTemplateModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors text-xs">Annuler</button>
                            <button onClick={handleSaveTemplate} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-colors text-xs">Enregistrer</button>
                        </div>
                    </div>
                </div>
            )}

            {showLoadTemplateModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowLoadTemplateModal(false)} />
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-700">Mes Gabarits</h3>
                            <button onClick={() => setShowLoadTemplateModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
                        </div>
                        <div className="p-2 overflow-y-auto custom-scrollbar flex-1">
                            {savedLayouts.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 text-sm">Aucun gabarit enregistré.</div>
                            ) : (
                                savedLayouts.map(layout => (
                                    <div key={layout.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg border-b border-slate-50 group">
                                        <div>
                                            <div className="font-bold text-slate-700 text-sm">{layout.name}</div>
                                            <div className="text-[10px] text-slate-400">{new Date(layout.date).toLocaleDateString()} • {layout.postes.length} éléments</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleLoadTemplate(layout)} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors">Charger</button>
                                            <button onClick={() => handleDeleteTemplate(layout.id)} className="p-1.5 text-slate-300 hover:text-rose-500 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
