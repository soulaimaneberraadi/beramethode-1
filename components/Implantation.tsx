
import React, { useMemo, useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Operation, Poste, Machine, ComplexityFactor, StandardTime, SavedLayout, ManualLink, FicheData } from '../types';
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
    LayoutDashboard,
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

const SAM_MAJORATION = 1.20;

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
    activeLayout?: 'zigzag' | 'free' | 'line' | 'double-zigzag';
    setActiveLayout?: React.Dispatch<React.SetStateAction<'zigzag' | 'free' | 'line' | 'double-zigzag'>>;
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
    readOnly?: boolean;
    ficheData?: FicheData;
    setFicheData?: React.Dispatch<React.SetStateAction<FicheData>>;
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
    dominantSection?: 'PREPARATION' | 'MONTAGE' | 'GLOBAL';
    parentOperators?: number;
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
    onEditLabel,
    hoveredStationIndex
}: {
    links: ManualLink[],
    stations: Workstation[],
    showLinks: boolean,
    zoom: number,
    containerRef: React.RefObject<HTMLDivElement>,
    onRemoveLink: (id: string) => void,
    onEditLabel: (id: string, currentLabel?: string) => void,
    hoveredStationIndex?: number | null
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

    const hoveredStationId = hoveredStationIndex !== null && hoveredStationIndex !== undefined
        ? stations.find(s => s.index === hoveredStationIndex)?.id || null
        : null;

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
            {paths.map(p => {
                const link = links.find(l => l.id === p.id);
                const isHoveredSource = hoveredStationId && link && (link.from === hoveredStationId || `${link.from}__1` === hoveredStationId || hoveredStationId.startsWith(`${link.from}__`));
                const isHoveredTarget = hoveredStationId && link && (link.to === hoveredStationId || `${link.to}__1` === hoveredStationId || hoveredStationId.startsWith(`${link.to}__`));
                const isAnyHovered = hoveredStationId !== null;

                let strokeColor = p.color;
                let strokeWidth = dynamicStrokeWidth;
                let opacityStyle = {};

                if (isAnyHovered) {
                    if (isHoveredSource) {
                        strokeColor = '#0ea5e9'; // sky-500
                        strokeWidth = dynamicStrokeWidth * 1.8;
                    } else if (isHoveredTarget) {
                        strokeColor = '#f59e0b'; // amber-500
                        strokeWidth = dynamicStrokeWidth * 1.8;
                    } else {
                        opacityStyle = { opacity: 0.25 };
                    }
                }

                return (
                    <g key={p.id} className="group pointer-events-auto" style={opacityStyle}>
                        <path d={p.path} stroke="transparent" strokeWidth={dynamicHoverWidth} fill="none" className="cursor-pointer" onClick={() => onEditLabel(p.id, p.label)} />
                        <path
                            d={p.path}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            markerEnd={isAnyHovered && (isHoveredSource || isHoveredTarget) ? `url(#arrow-${strokeColor.replace('#', '')})` : `url(#arrow-${p.color.replace('#', '')})`}
                            className="pointer-events-none transition-all duration-300 group-hover:stroke-width-[4px]"
                        />
                        <circle r={3 / zoom} fill={strokeColor} className="opacity-0 group-hover:opacity-100">
                            <animateMotion dur="2s" repeatCount="indefinite" path={p.path} />
                        </circle>
                        <foreignObject x={p.labelX - (60 / zoom)} y={p.labelY - (15 / zoom)} width={120 / zoom} height={30 / zoom} className="overflow-visible">
                            <div className="flex items-center justify-center gap-1 hover:scale-110 transition-transform origin-center" style={{ transform: `scale(${1 / zoom})` }}>
                                {p.label ? (
                                    <div onClick={() => onEditLabel(p.id, p.label)} className="bg-white/90  text-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg shadow-md border border-slate-200 whitespace-nowrap cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 max-w-[100px] truncate relative z-50" title={p.label}>{p.label}</div>
                                ) : (
                                    <button onClick={() => onEditLabel(p.id)} className="bg-white/90  p-1 rounded-full border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-indigo-500 relative z-50"><MessageSquare className="w-3 h-3" /></button>
                                )}
                                <button onClick={() => onRemoveLink(p.id)} className="bg-white/90  text-slate-300 p-1 rounded-full border border-slate-200 shadow-sm hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity relative z-50"><X className="w-3 h-3" /></button>
                            </div>
                        </foreignObject>
                    </g>
                );
            })}
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
    setManualLinks, // Receive setManualLinks as prop
    readOnly,
    ficheData,
    setFicheData
}: ImplantationProps) {

    const tolerance = ficheData?.toleranceSaturation ?? 115;
    const toleranceRatio = tolerance / 100;

    // --- CALCULATIONS FOR HEADER ---
    const totalMin = useMemo(() => operations.reduce((sum, op) => sum + (op.time || 0), 0), [operations]);
    const tempsArticle = totalMin * 1.20;

    // --- REAL-TIME MACHINE COUNTER ---
    // In auto layouts (zigzag/snake/grid/wheat/line), all non-VIDE postes are considered placed.
    // In free/manual mode, only postes with isPlaced=true are counted.
    const placedMachinesCount = useMemo(() => {
        if (!postes) return 0;
        const lt = activeLayout || 'zigzag';
        const isAutoMode = lt !== 'free';
        if (isAutoMode) {
            return postes.filter(p => p.machine !== 'VIDE' && !p.notes?.includes('Emplacement Vide')).length;
        }
        return postes.filter(p => p.isPlaced && p.machine !== 'VIDE' && !p.notes?.includes('Emplacement Vide')).length;
    }, [postes, activeLayout]);

    const prodDay100 = tempsArticle > 0 ? (presenceTime * numWorkers) / tempsArticle : 0;
    const prodDayEff = prodDay100 * (efficiency / 100);
    const hours = presenceTime / 60;
    const prodHour100 = hours > 0 ? prodDay100 / hours : 0;
    const prodHourEff = hours > 0 ? prodDayEff / hours : 0;

    // --- SECTION METRICS ---
    const preparationMetrics = useMemo(() => {
        const prepTime = operations.filter(op => op.section === 'PREPARATION').reduce((sum, op) => sum + (op.time || 0), 0) * 1.20;
        const workers = postes?.filter(p => (p.machine !== 'VIDE' || p.isPlaced) && (p as any).dominantSection === 'PREPARATION').length || 0;
        const hourly = prepTime > 0 && workers > 0 ? (60 * workers) / prepTime : 0;
        return { time: prepTime, workers, hourly: Math.round(hourly) };
    }, [operations, postes]);

    const montageMetrics = useMemo(() => {
        const montTime = operations.filter(op => op.section === 'MONTAGE').reduce((sum, op) => sum + (op.time || 0), 0) * 1.20;
        const workers = postes?.filter(p => (p.machine !== 'VIDE' || p.isPlaced) && (p as any).dominantSection === 'MONTAGE').length || 0;
        const hourly = montTime > 0 && workers > 0 ? (60 * workers) / montTime : 0;
        return { time: montTime, workers, hourly: Math.round(hourly) };
    }, [operations, postes]);

    // --- STATE ---
    // Use prop if available, otherwise fallback to local state (though prop should always be passed now)
    const [localLayoutType, setLocalLayoutType] = useState<'zigzag' | 'free' | 'line' | 'double-zigzag'>('line');
    const layoutType = activeLayout || localLayoutType;
    const setLayoutType = setActiveLayout || setLocalLayoutType;

    // REMOVED LOCAL layoutMemory - USING PROPS

    const handleLayoutChange = (newType: 'zigzag' | 'free' | 'line' | 'double-zigzag') => {
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
    const [printOrientationModal, setPrintOrientationModal] = useState(false);
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
    const fullscreenWrapperRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [isFullScreen, setIsFullScreen] = useState(false);

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            if (fullscreenWrapperRef.current?.requestFullscreen) {
                fullscreenWrapperRef.current.requestFullscreen().catch(err => {
                    console.error(`Error attempting to enable fullscreen: ${err.message}`);
                    setIsFullScreen(true); // Fallback
                });
            } else {
                setIsFullScreen(true);
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(err => {
                    console.error(err);
                    setIsFullScreen(false);
                });
            } else {
                setIsFullScreen(false);
            }
        }
    };
    const [isExporting, setIsExporting] = useState(false);
    const [showExportOptions, setShowExportOptions] = useState(false);
    const [exportSettings, setExportSettings] = useState({
        header: true,
        stats: true,
        machines: true,
        pageSize: 'single' // 'single' ou 'a4'
    });
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
    const didInitialLayoutGuardRef = useRef(false);

    // --- PANNING STATE (NEW) ---
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [hoveredStationIndex, setHoveredStationIndex] = useState<number | null>(null);
    const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

    // Listen for Space, F, and Escape Keys
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullScreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        const handleKeyDown = (e: KeyboardEvent) => {
            const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA';
            if (isInput) return;

            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault(); // Prevent scrolling
                setIsSpacePressed(true);
            }
            if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                toggleFullScreen();
            }
            if (e.key === 'Escape') {
                if (document.fullscreenElement && document.exitFullscreen) {
                    document.exitFullscreen().catch(() => setIsFullScreen(false));
                } else if (isFullScreen) {
                    setIsFullScreen(false);
                }
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
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isFullScreen]);

    // Sync isManualMode from the persisted layoutType on first mount
    useEffect(() => {
        if (didInitialLayoutGuardRef.current) return;
        didInitialLayoutGuardRef.current = true;
        setIsManualMode(layoutType === 'free');
    }, [layoutType]);

    const activateAutoMode = () => {
        setIsManualMode(false);
        setLayoutType('double-zigzag');
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
                let operatorCount = nTheo > 0 ? Math.max(1, Math.ceil(nTheo / toleranceRatio)) : 0;
                operatorCount = Math.max(1, operatorCount);
                if (operatorCount > 1 && !p.originalId) {
                    for (let i = 1; i <= operatorCount; i++) {
                        splitPosts.push({ ...p, id: `${p.id}__split__${i}`, originalId: p.id, name: `${p.name}.${i}`, isPlaced: false });
                    }
                } else {
                    splitPosts.push({ ...p, isPlaced: false });
                }
            });
            setPostes(splitPosts);
        }
    };

    const handleClearPlan = () => {
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
                let operatorCount = nTheo > 0 ? Math.max(1, Math.ceil(nTheo / toleranceRatio)) : 0;
                operatorCount = Math.max(1, operatorCount);
                if (operatorCount > 1 && !p.originalId) {
                    for (let i = 1; i <= operatorCount; i++) {
                        splitPosts.push({
                            ...p,
                            id: `${p.id}__split__${i}`,
                            originalId: p.id,
                            name: `${p.name}.${i}`,
                            isPlaced: false,
                            x: undefined,
                            y: undefined,
                            rotation: undefined
                        });
                    }
                } else {
                    splitPosts.push({
                        ...p,
                        isPlaced: false,
                        x: undefined,
                        y: undefined,
                        rotation: undefined
                    });
                }
            });
            setPostes(splitPosts);
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
    const handleExportPlan = () => {
        if (!contentRef.current) return;
        setShowExportOptions(true); // Open settings modal instead of direct export
    };

    const executeExport = async () => {
        if (isExporting || !contentRef.current) return;
        setIsExporting(true);
        setShowExportOptions(false);

        try {
            const element = contentRef.current;
            const clone = element.cloneNode(true) as HTMLElement;

            // Get original dimensions
            let width = element.scrollWidth;
            let height = element.scrollHeight;

            if (exportSettings.pageSize === 'a4' && layoutType !== 'free') {
                // Force wrap for A4 multi-page
                clone.style.width = '1122px'; // A4 width in pixels approx (landscape)
                const gridWrappers = clone.querySelectorAll('.flex.gap-6, .flex.gap-12');
                gridWrappers.forEach(el => {
                    (el as HTMLElement).style.flexWrap = 'wrap';
                    (el as HTMLElement).style.justifyContent = 'center';
                });
                width = 1122;
                // Height will be auto-calculated later
            } else if (layoutType === 'free') {
                // AUTO-CROP KWA (EMPTY SPACE) FOR FREE MODE
                const stations = clone.querySelectorAll('[id^="station-card-"]');
                let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
                stations.forEach(st => {
                    const el = st as HTMLElement;
                    // Try to get X, Y from style
                    const x = parseFloat(el.style.left) || 0;
                    const y = parseFloat(el.style.top) || 0;
                    const w = 180; // approximate card width
                    const h = 120; // approximate card height
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x + w > maxX) maxX = x + w;
                    if (y + h > maxY) maxY = y + h;
                });

                if (minX < Infinity && maxX > minX) {
                    const padX = 50;
                    const padY = 50;

                    // Shift all elements
                    stations.forEach(st => {
                        const el = st as HTMLElement;
                        const x = parseFloat(el.style.left) || 0;
                        const y = parseFloat(el.style.top) || 0;
                        el.style.left = `${x - minX + padX}px`;
                        el.style.top = `${y - minY + padY}px`;
                    });

                    // Shift SVG
                    const svg = clone.querySelector('svg');
                    if (svg) {
                        svg.style.marginLeft = `-${minX - padX}px`;
                        svg.style.marginTop = `-${minY - padY}px`;
                    }

                    const newWidth = maxX - minX + (padX * 2);
                    const newHeight = maxY - minY + (padY * 2);

                    const rootDiv = clone.querySelector('.relative.w-\\[3000px\\]') as HTMLElement;
                    if (rootDiv) {
                        rootDiv.style.width = `${newWidth}px`;
                        rootDiv.style.height = `${newHeight}px`;
                    }

                    width = newWidth;
                    height = newHeight;
                    clone.style.width = `${newWidth}px`;
                } else {
                    width = width + 200;
                    clone.style.width = `${width}px`;
                }
            } else {
                width = width + 200; // Add padding
                clone.style.width = `${width}px`;
            }

            // Create a wrapper for styling and headers
            const wrapper = document.createElement('div');
            wrapper.style.backgroundColor = '#ffffff';
            wrapper.style.padding = '40px';
            wrapper.style.width = `${width}px`;
            wrapper.style.position = 'fixed';
            wrapper.style.top = '-9999px';
            wrapper.style.left = '-9999px';
            wrapper.style.zIndex = '-100';

            // 1. ADD HEADER IF OPTION ENABLED
            if (exportSettings.header) {
                const header = document.createElement('div');
                header.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div style="background-color: #1e293b; color: white; padding: 10px 20px; border-radius: 8px; font-weight: bold; font-size: 24px; font-family: sans-serif;">
                                BERAMETHODE
                            </div>
                            <div>
                                <h1 style="margin: 0; color: #334155; font-family: sans-serif; font-size: 28px;">Plan d'Implantation</h1>
                                <p style="margin: 5px 0 0 0; color: #64748b; font-family: sans-serif;">Modèle: <strong>${articleName || 'Générique'}</strong></p>
                            </div>
                        </div>
                        <div style="text-align: right; color: #64748b; font-family: sans-serif; font-size: 14px;">
                            <p style="margin: 0;">Date: ${new Date().toLocaleDateString('fr-FR')}</p>
                            <p style="margin: 5px 0 0 0;">Configuration: ${layoutType.toUpperCase()}</p>
                        </div>
                    </div>
                `;
                wrapper.appendChild(header);
            }

            // 2. ADD STATS IF OPTION ENABLED
            if (exportSettings.stats) {
                const stats = document.createElement('div');
                stats.innerHTML = `
                    <div style="display: flex; gap: 20px; margin-bottom: 30px; font-family: sans-serif;">
                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; flex: 1;">
                            <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Ouvriers</div>
                            <div style="font-size: 20px; font-weight: bold; color: #334155;">${numWorkers}</div>
                        </div>
                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; flex: 1;">
                            <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Heures</div>
                            <div style="font-size: 20px; font-weight: bold; color: #334155;">${hours.toFixed(1)}</div>
                        </div>
                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; flex: 1;">
                            <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Min Totales</div>
                            <div style="font-size: 20px; font-weight: bold; color: #334155;">${presenceTime}</div>
                        </div>
                        <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 15px; border-radius: 8px; flex: 1;">
                            <div style="font-size: 12px; color: #059669; text-transform: uppercase;">BF (s)</div>
                            <div style="font-size: 20px; font-weight: bold; color: #047857;">${(bf * 60).toFixed(1)}</div>
                        </div>
                        <div style="background-color: #fff7ed; border: 1px solid #fed7aa; padding: 15px; border-radius: 8px; flex: 1;">
                            <div style="font-size: 12px; color: #ea580c; text-transform: uppercase;">Prod / H (100%)</div>
                            <div style="font-size: 20px; font-weight: bold; color: #c2410c;">${Math.round(prodHour100)}</div>
                        </div>
                    </div>
                `;
                wrapper.appendChild(stats);
            }

            // Put the layout clone inside the wrapper
            clone.style.position = 'relative';
            clone.style.left = '0';
            clone.style.top = '0';
            clone.style.transform = 'scale(1)';
            clone.style.overflow = 'visible';
            wrapper.appendChild(clone);

            // 3. ADD MACHINE SUMMARY IF OPTION ENABLED
            if (exportSettings.machines) {
                // Generate safe HTML table from machinesSummary
                const mCountsHtml = Object.entries(machinesSummary.counts).map(([name, count]) => `
                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
                        <span style="color: #475569; font-size: 14px;">${name}</span>
                        <span style="font-weight: bold; color: #1e293b; background: #e2e8f0; padding: 2px 8px; border-radius: 12px;">${count}</span>
                    </div>
                `).join('');

                const machDiv = document.createElement('div');
                machDiv.innerHTML = `
                    <div style="margin-top: 40px; page-break-inside: avoid; font-family: sans-serif; max-width: 400px; background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px;">
                        <h3 style="margin-top: 0; color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Résumé Matériel (Total: ${machinesSummary.total})</h3>
                        <div style="margin-top: 15px;">
                            ${mCountsHtml}
                        </div>
                    </div>
                `;
                wrapper.appendChild(machDiv);
            }

            document.body.appendChild(wrapper);

            // Recalculate robust dimensions after assembly
            const finalHeight = wrapper.scrollHeight;
            const finalWidth = wrapper.scrollWidth;

            let jsPdfConfig: any = {
                unit: 'px',
                format: [finalWidth + 40, finalHeight + 40],
                orientation: finalWidth > finalHeight ? 'landscape' : 'portrait'
            };

            if (exportSettings.pageSize === 'a4') {
                jsPdfConfig = {
                    unit: 'mm',
                    format: 'a4',
                    orientation: 'landscape'
                };
            }

            const opt = {
                margin: exportSettings.pageSize === 'a4' ? [10, 10, 10, 10] : 0,
                filename: `Plan_Implantation_${articleName.replace(/\s+/g, '_')}.pdf`,
                image: { type: 'jpeg', quality: 1.0 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                },
                jsPDF: jsPdfConfig,
                pagebreak: exportSettings.pageSize === 'a4' ? { mode: ['css', 'legacy'] } : undefined
            };

            await html2pdf().set(opt).from(wrapper).save();
            document.body.removeChild(wrapper);

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

    // ════════════════════════════════════════════════════════════════════
    //  IMPRESSION / PDF — Document TABLEAU (HTML réel, pas de capture image)
    //  Chaque poste = une ligne du tableau, groupée par section, avec ses
    //  opérations, sa couleur, sa saturation, et ses photos d'opérations.
    //  Ouvre une fenêtre d'impression : Imprimer directement OU "Enregistrer
    //  au format PDF" depuis la boîte de dialogue du navigateur.
    // ════════════════════════════════════════════════════════════════════
    const printPlanTable = (printOrientation: 'landscape' | 'portrait') => {
        const esc = (s: any) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const secColor = (theme?: string) =>
            theme === 'amber' ? '#d97706' : theme === 'sky' ? '#0284c7' : '#4f46e5';

        const satStyle = (sat: number) => {
            if (sat > tolerance) return 'color:#b91c1c;background:#fee2e2;';      // surcharge
            if (sat >= 70) return 'color:#15803d;background:#dcfce7;';            // bon
            if (sat >= 40) return 'color:#b45309;background:#fef3c7;';            // moyen
            return 'color:#64748b;background:#f1f5f9;';                          // faible
        };

        const isAlternating = layoutType === 'double-zigzag' || layoutType === 'zigzag';

        const renderStationCells = (st: Workstation | undefined) => {
            if (!st) {
                return `
                    <td style="border:none;"></td>
                    <td style="border:none;"></td>
                    <td style="border:none;"></td>
                    <td style="border:none;"></td>
                    <td style="border:none;"></td>
                    <td style="border:none;"></td>
                    <td style="border:none;"></td>
                    <td style="border:none;"></td>
                `;
            }

            const fill = (st.color && (st.color as any).fill) || '#64748b';
            const sat = Math.round(st.saturation || 0);
            const opsHtml = (st.operations && st.operations.length > 0)
                ? st.operations.map(op =>
                    `<div style="margin-bottom:2px;line-height:1.3;">
                        • ${esc(op.description)}${op.side ? ` <span style="color:#94a3b8;">(${esc(op.side)})</span>` : ''}
                    </div>`).join('')
                : '<span style="color:#cbd5e1;">—</span>';

            const photos = (st.operations || []).map(op => op.photo).filter(Boolean) as string[];
            const photoSize = 72; // Optimized size to fit side-by-side
            const photoHtml = photos.length > 0
                ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">` +
                    photos.slice(0, 4).map(p =>
                        `<img src="${p}" style="width:${photoSize}px;height:${photoSize}px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;" />`
                    ).join('') + `</div>`
                : '<span style="color:#cbd5e1;">—</span>';

            return `
                <td style="text-align:center;vertical-align:middle;padding:4px;"><div style="width:14px;height:14px;border:1.5px solid #64748b;border-radius:3px;margin:auto;background:#fff;"></div></td>
                <td style="vertical-align:middle;">${photoHtml}</td>
                <td style="border-left:5px solid ${fill};font-weight:800;color:#0f172a;white-space:nowrap;vertical-align:middle;">
                    <span style="background:#f1f5f9;color:#334155;font-size:9px;padding:2px 4px;border-radius:4px;margin-right:5px;font-weight:800;border:1px solid #e2e8f0;">#${st.index}</span>${esc(st.name)}
                </td>
                <td style="font-weight:700;color:#334155;white-space:nowrap;vertical-align:middle;">${esc(st.machine)}</td>
                <td class="ops-col" style="vertical-align:middle;">${opsHtml}</td>
                <td style="font-weight:800;color:#4338ca;white-space:nowrap;vertical-align:middle;">${Math.round((st.totalTime || 0) * 60)}s</td>
                <td style="vertical-align:middle;"><span style="display:inline-block;padding:2px 8px;border-radius:999px;font-weight:800;${satStyle(sat)}">${sat}%</span></td>
                <td style="color:#64748b;white-space:nowrap;vertical-align:middle;">${esc(st.operatorName || '—')}</td>
            `;
        };

        const rowsForSectionSingle = (stations: Workstation[]) => stations.map((st) => {
            const fill = (st.color && (st.color as any).fill) || '#64748b';
            const sat = Math.round(st.saturation || 0);
            const opsHtml = (st.operations && st.operations.length > 0)
                ? st.operations.map(op =>
                    `<div style="margin-bottom:2px;line-height:1.3;">
                        • ${esc(op.description)}${op.side ? ` <span style="color:#94a3b8;">(${esc(op.side)})</span>` : ''}
                    </div>`).join('')
                : '<span style="color:#cbd5e1;">—</span>';

            const photos = (st.operations || []).map(op => op.photo).filter(Boolean) as string[];
            const photoHtml = photos.length > 0
                ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">` +
                    photos.slice(0, 4).map(p =>
                        `<img src="${p}" style="width:96px;height:96px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;" />`
                    ).join('') + `</div>`
                : '<span style="color:#cbd5e1;">—</span>';

            return `
                <tr>
                    <td style="text-align:center;vertical-align:middle;padding:4px;"><div style="width:14px;height:14px;border:1.5px solid #64748b;border-radius:3px;margin:auto;background:#fff;"></div></td>
                    <td style="vertical-align:middle;">${photoHtml}</td>
                    <td style="border-left:5px solid ${fill};font-weight:800;color:#0f172a;white-space:nowrap;vertical-align:middle;">
                        <span style="background:#f1f5f9;color:#334155;font-size:9px;padding:2px 4px;border-radius:4px;margin-right:5px;font-weight:800;border:1px solid #e2e8f0;">#${st.index}</span>${esc(st.name)}
                    </td>
                    <td style="font-weight:700;color:#334155;white-space:nowrap;vertical-align:middle;">${esc(st.machine)}</td>
                    <td class="ops-col" style="vertical-align:middle;">${opsHtml}</td>
                    <td style="font-weight:800;color:#4338ca;white-space:nowrap;vertical-align:middle;">${Math.round((st.totalTime || 0) * 60)}s</td>
                    <td style="vertical-align:middle;"><span style="display:inline-block;padding:2px 8px;border-radius:999px;font-weight:800;${satStyle(sat)}">${sat}%</span></td>
                    <td style="color:#64748b;white-space:nowrap;vertical-align:middle;">${esc(st.operatorName || '—')}</td>
                </tr>`;
        }).join('');

        const sectionsHtml = structureSections.map(section => {
            if (isAlternating) {
                const sideA = section.stations.filter((_, idx) => idx % 2 === 0); // P1, P3, P5...
                const sideB = section.stations.filter((_, idx) => idx % 2 !== 0); // P2, P4, P6...
                const maxRows = Math.max(sideA.length, sideB.length);

                const rowsHtml = [];
                for (let idx = 0; idx < maxRows; idx++) {
                    const leftStation = sideA[idx];  // Odd stations (P1, P3, P5...)
                    const rightStation = sideB[idx]; // Even stations (P2, P4, P6...)

                    rowsHtml.push(`
                        <tr>
                            ${renderStationCells(leftStation)}
                            <td style="background:#f8fafc; border:none; width:16px; padding:0;"></td>
                            ${renderStationCells(rightStation)}
                        </tr>
                    `);
                }

                return `
                <div style="page-break-inside:auto;margin-top:18px;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <span style="background:${secColor(section.theme)};color:#fff;font-weight:800;font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:5px 14px;border-radius:8px;">${esc(section.name)}</span>
                        ${section.hourly ? `<span style="color:#64748b;font-size:11px;font-weight:600;">Objectif : ${section.hourly} p/h</span>` : ''}
                        <span style="color:#94a3b8;font-size:11px;">${section.stations.length} postes</span>
                    </div>
                    <table style="width:100%;">
                        <thead>
                            <tr>
                                <th colspan="8" style="background:#f1f5f9; text-align:center; font-weight:800; color:#475569; border-bottom:2px solid #cbd5e1; font-size:11px; padding:6px 0;">CÔTÉ GAUCHE (POSTES IMPAIRS)</th>
                                <th style="background:#f8fafc; border:none; width:16px; padding:0;"></th>
                                <th colspan="8" style="background:#f1f5f9; text-align:center; font-weight:800; color:#475569; border-bottom:2px solid #cbd5e1; font-size:11px; padding:6px 0;">CÔTÉ DROIT (POSTES PAIRS)</th>
                            </tr>
                            <tr>
                                <th style="width:24px;text-align:center;">✔</th>
                                <th style="width:100px;">Photos</th>
                                <th style="width:40px;">N°</th>
                                <th style="width:70px;">Machine</th>
                                <th>Opérations</th>
                                <th style="width:50px;">Temps</th>
                                <th style="width:50px;">Sat.</th>
                                <th style="width:80px;">Opérateur</th>
                                
                                <th style="background:#f8fafc; border:none; width:16px; padding:0;"></th>
                                
                                <th style="width:24px;text-align:center;">✔</th>
                                <th style="width:100px;">Photos</th>
                                <th style="width:40px;">N°</th>
                                <th style="width:70px;">Machine</th>
                                <th>Opérations</th>
                                <th style="width:50px;">Temps</th>
                                <th style="width:50px;">Sat.</th>
                                <th style="width:80px;">Opérateur</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml.join('')}
                        </tbody>
                    </table>
                </div>`;
            } else {
                return `
                <div style="page-break-inside:auto;margin-top:18px;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                        <span style="background:${secColor(section.theme)};color:#fff;font-weight:800;font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:5px 14px;border-radius:8px;">${esc(section.name)}</span>
                        ${section.hourly ? `<span style="color:#64748b;font-size:11px;font-weight:600;">Objectif : ${section.hourly} p/h</span>` : ''}
                        <span style="color:#94a3b8;font-size:11px;">${section.stations.length} postes</span>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width:24px;text-align:center;">✔</th>
                                <th style="width:120px;">Photos</th>
                                <th style="width:48px;">N°</th>
                                <th style="width:70px;">Machine</th>
                                <th>Opérations</th>
                                <th style="width:60px;">Temps</th>
                                <th style="width:64px;">Sat.</th>
                                <th style="width:90px;">Opérateur</th>
                            </tr>
                        </thead>
                        <tbody>${rowsForSectionSingle(section.stations)}</tbody>
                    </table>
                </div>`;
            }
        }).join('');

        const machinesHtml = machinesSummary.counts.map(([name, count]) => `
            <tr>
                <td style="font-weight:600;color:#475569;">${esc(name)}</td>
                <td style="text-align:right;font-weight:800;color:#0f172a;">${count}</td>
            </tr>`).join('');

        // Photos modèle éventuelles (selon ce que porte ficheData) — tolérant si absent.
        const fd = ficheData as any;
        const modelPhotos = [fd?.images?.front, fd?.images?.back, fd?.image, fd?.photoDataUrl]
            .filter(Boolean) as string[];

        const tableFontSize = isAlternating
            ? (printOrientation === 'landscape' ? '10px' : '8.5px')
            : '11px';

        const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8" />
<title>Plan d'Implantation — ${esc(articleName || 'Modèle')}</title>
<style>
    @page { size: A4 ${printOrientation}; margin: 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color:#1e293b; margin:0; font-size:11px; }
    h1 { margin:0; font-size:22px; color:#1e293b; }
    table { width:100%; border-collapse:collapse; font-size: ${tableFontSize}; }
    thead { display:table-header-group; }
    th { background:#f1f5f9; font-size:10px; text-transform:uppercase; letter-spacing:.4px; color:#475569; padding:6px 8px; text-align:left; border-bottom:2px solid #cbd5e1; }
    td { padding:8px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
    tr { page-break-inside:avoid; }
    .badge { background:#1e293b; color:#fff; font-weight:800; font-size:18px; padding:8px 16px; border-radius:8px; }
    .stat { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; flex:1; }
    .stat b { display:block; font-size:18px; color:#0f172a; margin-top:2px; }
    .no-print { }
    .ops-col { font-size: ${isAlternating ? (printOrientation === 'landscape' ? '12px' : '10.5px') : '12.5px'}; font-weight: 700; color: #0f172a; }
    @media print { .no-print { display:none !important; } }
</style></head>
<body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #e2e8f0;padding-bottom:14px;">
        <div style="display:flex;align-items:center;gap:14px;">
            <span class="badge">BERAMETHODE</span>
            <div>
                <h1>Plan d'Implantation</h1>
                <div style="color:#64748b;margin-top:3px;">Modèle : <b style="color:#334155;">${esc(articleName || 'Générique')}</b></div>
            </div>
        </div>
        <div style="text-align:right;color:#64748b;font-size:11px;">
            <div>${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div style="margin-top:3px;">${structureSections.reduce((n, s) => n + s.stations.length, 0)} postes au total</div>
        </div>
    </div>

    ${modelPhotos.length > 0 ? `<div style="display:flex;gap:10px;margin-top:12px;">${modelPhotos.map(p => `<img src="${p}" style="height:120px;border-radius:8px;border:1px solid #e2e8f0;object-fit:contain;" />`).join('')}</div>` : ''}

    <div style="display:flex;gap:12px;margin-top:14px;">
        <div class="stat"><span style="color:#64748b;font-size:10px;text-transform:uppercase;">Ouvriers</span><b>${numWorkers}</b></div>
        <div class="stat"><span style="color:#64748b;font-size:10px;text-transform:uppercase;">Heures</span><b>${hours.toFixed(1)}</b></div>
        <div class="stat"><span style="color:#64748b;font-size:10px;text-transform:uppercase;">Min. présence</span><b>${presenceTime}</b></div>
        <div class="stat" style="background:#ecfdf5;border-color:#a7f3d0;"><span style="color:#059669;font-size:10px;text-transform:uppercase;">BF (s)</span><b style="color:#047857;">${(bf * 60).toFixed(1)}</b></div>
        <div class="stat" style="background:#fff7ed;border-color:#fed7aa;"><span style="color:#ea580c;font-size:10px;text-transform:uppercase;">Prod / H</span><b style="color:#c2410c;">${Math.round(prodHour100)}</b></div>
    </div>

    ${sectionsHtml}

    <div style="margin-top:22px;page-break-inside:avoid;max-width:320px;">
        <div style="background:#1e293b;color:#fff;font-weight:800;font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:5px 14px;border-radius:8px;display:inline-block;margin-bottom:6px;">Résumé Matériel — ${machinesSummary.total} postes</div>
        <table><tbody>${machinesHtml}</tbody></table>
    </div>

    <script>
        window.onload = function () { 
            setTimeout(function () { 
                window.focus(); 
                window.print(); 
                if (window.parent === window) {
                    window.close(); 
                }
            }, 400); 
        };
    </script>
</body></html>`;

        // Create an invisible iframe for printing to avoid opening extra popup tabs/windows
        const frameId = 'print-plan-iframe';
        let iframe = document.getElementById(frameId) as HTMLIFrameElement | null;
        if (iframe) {
            iframe.parentNode?.removeChild(iframe);
        }
        iframe = document.createElement('iframe');
        iframe.id = frameId;
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.zIndex = '-1000';
        document.body.appendChild(iframe);

        const win = iframe.contentWindow;
        if (!win) {
            alert("Erreur lors de la préparation de l'impression.");
            return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();

        // Clean up the iframe from the DOM after the print dialog is triggered
        setTimeout(() => {
            if (iframe && iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
            }
        }, 3000);
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

    // Refs have been moved up to support native fullscreen implementation

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
        if (readOnly) return;
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
        if (readOnly) return;
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
        if (readOnly) return;
        if (isSpacePressed) return; // Allow panning instead of dragging items if space is pressed

        if (e.type === 'mousedown' && (e as React.MouseEvent).button !== 0) return;
        e.preventDefault();

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

            // --- Bounding Box Constraints to prevent cards from hiding under UI ---
            const MIN_X = 24;
            const MIN_Y = 24;
            const MAX_X = 3000 - 240; // canvas width - approximate workstation width
            const MAX_Y = 2000 - 160; // canvas height - approximate workstation height

            let finalX = startLeft + dx;
            let finalY = startTop + dy;

            finalX = Math.max(MIN_X, Math.min(MAX_X, finalX));
            finalY = Math.max(MIN_Y, Math.min(MAX_Y, finalY));

            dx = finalX - startLeft;
            dy = finalY - startTop;

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
        // Prevent pan if middle clicking or not space pressed on a card.
        // Unfreeze canvas: allow panning if clicking directly on background (scroll container)
        const target = e.target as HTMLElement;
        const isBackgroundClick = target === scrollContainerRef.current || target.id === 'svg-overlay-container';

        if ((isSpacePressed || isBackgroundClick) && scrollContainerRef.current) {
            if (e.button !== 0 && e.button !== 1) return; // Only trigger for Left or Middle mouse button
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
            const dx = (e.clientX - panStartRef.current.x) / zoom;
            const dy = (e.clientY - panStartRef.current.y) / zoom;
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
        if (readOnly) return;
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

    // Removed native fullscreen logic to rely on robust CSS fixed layout

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
                        saturation = ((totalTime * SAM_MAJORATION) / bf) * 100;
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

                    const nTheo = bf > 0 ? (totalTime * SAM_MAJORATION) / bf : 0;
                    operators = nTheo > 0 ? Math.max(1, Math.ceil(nTheo / toleranceRatio)) : 0;

                    if (p.originalId) {
                        operators = 1;
                    }

                    saturation = (operators > 0 && bf > 0) ? ((totalTime * SAM_MAJORATION) / (operators * bf)) * 100 : 0;
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
                // Section dominante: somme du temps par section sur les ops du poste
                const sectionTimes: Record<string, number> = { PREPARATION: 0, MONTAGE: 0, GLOBAL: 0 };
                assignedOps.forEach(o => { sectionTimes[o.section || 'GLOBAL'] += (o.time || 0); });
                const dominantSection: 'PREPARATION' | 'MONTAGE' | 'GLOBAL' =
                    sectionTimes.PREPARATION > sectionTimes.MONTAGE && sectionTimes.PREPARATION > sectionTimes.GLOBAL ? 'PREPARATION'
                        : sectionTimes.MONTAGE > sectionTimes.GLOBAL ? 'MONTAGE'
                            : 'GLOBAL';
                return { ...p, index: 0, originalIndex: realIndex, operations: assignedOps, totalTime, saturation, operators, color, groups, feedsInto, isFeeder, gammeOrderMin, isPlaced: p.isPlaced, status: isBroken ? 'panne' : 'ok', x: p.x, y: p.y, rotation: p.rotation, shape: p.shape, dominantSection };
            });

            const sortedStations = [...initialStations];
            const expandedResult: Workstation[] = [];
            sortedStations.forEach((st, idx) => {
                const showOnCanvas = isManualMode
                    ? (st.isPlaced === true && st.machine !== 'VIDE')
                    : true;
                if (showOnCanvas) {
                    if (isManualMode || st.originalId || st.operators <= 1) {
                        expandedResult.push({ ...st, index: expandedResult.length + 1, isPlaced: true });
                    } else {
                        for (let i = 1; i <= st.operators; i++) {
                            expandedResult.push({
                                ...st,
                                id: `${st.id}__${i}`,
                                originalId: st.id,
                                name: `${st.name.replace('P', '').split('.')[0]}.${i}`,
                                index: expandedResult.length + 1,
                                totalTime: st.totalTime / st.operators,
                                parentOperators: st.operators,
                                operators: 1,
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
                if (bf > 0) { operators = 1; saturation = ((totalTime * SAM_MAJORATION) / bf) * 100; }
            } else {
                assignedOps.forEach(op => {
                    let sharingCount = 1;
                    if (p.originalId) { sharingCount = postes.filter(x => x.originalId === p.originalId).length; } else { sharingCount = assignments[op.id]?.length || 1; }
                    totalTime += (op.time || 0) / sharingCount;
                });
                const nTheo = bf > 0 ? (totalTime * SAM_MAJORATION) / bf : 0;
                operators = nTheo > 0 ? Math.max(1, Math.ceil(nTheo / toleranceRatio)) : 0;
                if (p.originalId) { operators = 1; }
                saturation = (operators > 0 && bf > 0) ? ((totalTime * SAM_MAJORATION) / (operators * bf)) * 100 : 0;
            }
            operators = Math.max(1, operators);
            return { ...p, operations: assignedOps, color: realColor, groups: groups, totalTime, saturation, operators: operators, index: 0, originalIndex: realIndex } as Workstation;
        }).sort((a, b) => {
            const minA = a.operations.length > 0 ? Math.min(...a.operations.map(o => o.order)) : 9999;
            const minB = b.operations.length > 0 ? Math.min(...b.operations.map(o => o.order)) : 9999;
            return minA - minB;
        });
    }, [postes, isManualMode, operations, assignments, bf]);

    const compactPostes = () => {
        if (!setPostes || !postes) return;
        const placed = postes.filter(p => p.isPlaced && p.machine !== 'VIDE');
        const unplaced = postes.filter(p => !p.isPlaced && p.machine !== 'VIDE');
        let pCount = 1;
        const newPlaced = placed.map(p => ({ ...p, name: `P${pCount++}` }));
        setPostes([...newPlaced, ...unplaced]);
    };
    const renumberStations = () => { if (!setPostes || !postes) return; let pCount = 1; const reindexed = postes.map((p) => { if (p.isPlaced && p.machine !== 'VIDE') { return { ...p, name: `P${pCount++}` }; } return p; }); setPostes(reindexed); };
    const restoreGammeOrder = () => {
        if (!setPostes || !postes) return;

        const getMinOpOrder = (poste: Poste) => {
            const assignedOrders = operations
                .filter(op => assignments?.[op.id]?.some(assignedId => assignedId === poste.id || (poste.originalId && assignedId === poste.originalId)))
                .map(op => op.order);
            return assignedOrders.length > 0 ? Math.min(...assignedOrders) : Number.MAX_SAFE_INTEGER;
        };

        const allPostes = [...postes];
        const indexedPostes = allPostes.map((p, idx) => ({ poste: p, idx }));
        const placedReal = indexedPostes.filter(({ poste }) => poste.isPlaced && poste.machine !== 'VIDE');
        const others = indexedPostes.filter(({ poste }) => !(poste.isPlaced && poste.machine !== 'VIDE'));

        if (placedReal.length <= 1) return;

        const sortedPlaced = [...placedReal].sort((a, b) => {
            const byOrder = getMinOpOrder(a.poste) - getMinOpOrder(b.poste);
            return byOrder !== 0 ? byOrder : a.idx - b.idx;
        });

        let pCount = 1;
        const renumberedPlaced = sortedPlaced.map(({ poste }) => ({ ...poste, name: `P${pCount++}` }));
        setPostes([...renumberedPlaced, ...others.map(({ poste }) => poste)]);
    };

    const placeAllOnCanvas = () => {
        if (!setPostes || !postes) return;
        const unplaced = postes.filter(p => !p.isPlaced && p.machine !== 'VIDE');
        if (unplaced.length === 0) return;
        const alreadyPlaced = postes.filter(p => p.isPlaced);
        const startIdx = alreadyPlaced.length;
        const cols = Math.max(6, Math.ceil(Math.sqrt(unplaced.length + startIdx)));
        const newPostes = postes.map(p => {
            if (!p.isPlaced && p.machine !== 'VIDE') {
                const globalIdx = startIdx + unplaced.indexOf(p);
                const col = globalIdx % cols;
                const row = Math.floor(globalIdx / cols);
                return { ...p, isPlaced: true, x: 60 + col * 230, y: 60 + row * 170 };
            }
            return p;
        });
        setPostes(newPostes);
    };

    const handleManualDrop = (stationId: string, dropPos?: { x: number; y: number }) => {
        if (setPostes && postes) {
            const stationFromWaiting = postes.find(p => p.id === stationId && !p.isPlaced);
            if (stationFromWaiting) {
                const newPostes = [...postes];
                const idx = newPostes.findIndex(p => p.id === stationId);
                if (idx !== -1) {
                    const item = {
                        ...newPostes[idx],
                        isPlaced: true,
                        x: dropPos?.x ?? newPostes[idx].x,
                        y: dropPos?.y ?? newPostes[idx].y
                    };
                    newPostes.splice(idx, 1);
                    if (layoutType === 'free') {
                        const placed = newPostes.filter(p => p.isPlaced);
                        const unplaced = newPostes.filter(p => !p.isPlaced);
                        newPostes.splice(0, newPostes.length, ...placed, item, ...unplaced);
                        setPostes(newPostes);
                        return;
                    }
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
                    } else {
                        newPostes.splice(idx, 1); // Remove from canvas position
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

    // ═══════════════════════════════════════════════════════════════
    // SECTIONS & ALTERNATING DISTRIBUTION (Used by ALL structured layouts)
    // ═══════════════════════════════════════════════════════════════
    const structureSections = useMemo(() => {
        if (!workstations || workstations.length === 0) return [];
        const validStations = workstations.filter(st => st.machine !== 'VIDE' || isManualMode);
        
        const prep = validStations.filter(st => st.dominantSection === 'PREPARATION');
        const montage = validStations.filter(st => st.dominantSection === 'MONTAGE');
        const global = validStations.filter(st => st.dominantSection === 'GLOBAL');

        const sections = [];
        if (prep.length > 0) sections.push({ 
            id: 'PREPARATION', 
            name: 'PRÉPARATION', 
            stations: prep, 
            theme: 'amber', 
            hourly: preparationMetrics?.hourly || null 
        });
        if (montage.length > 0) sections.push({ 
            id: 'MONTAGE', 
            name: 'MONTAGE', 
            stations: montage, 
            theme: 'sky', 
            hourly: montageMetrics?.hourly || null 
        });
        if (global.length > 0) sections.push({ 
            id: 'GLOBAL', 
            name: (prep.length || montage.length) ? 'ZONE COMMUNE' : 'PRODUCTION GLOBALE', 
            stations: global, 
            theme: 'indigo', 
            hourly: Math.round(prodHour100) 
        });
        
        // Fallback or full unified layout
        if (prep.length === 0 && montage.length === 0 && global.length === 0 && validStations.length > 0) {
             sections.push({
                id: 'GLOBAL',
                name: 'Flux de Production',
                stations: validStations,
                theme: 'indigo',
                hourly: Math.round(prodHour100)
             });
        }
        
        return sections;
    }, [workstations, isManualMode, preparationMetrics, montageMetrics, prodHour100]);

    // Legacy groupings
    const alternatingRows = useMemo(() => {
        if (!workstations || workstations.length === 0) return { topRow: [], bottomRow: [] };
        const validStations = workstations.filter(st => st.machine !== 'VIDE' || isManualMode);
        const topRow: Workstation[] = [];
        const bottomRow: Workstation[] = [];
        validStations.forEach((st, index) => {
            if (index % 2 === 0) { topRow.push(st); } else { bottomRow.push(st); }
        });
        return { topRow, bottomRow };
    }, [workstations, isManualMode]);

    const sigZagData = alternatingRows;
    const doubleZigzagData = { sideA: alternatingRows.topRow, sideB: alternatingRows.bottomRow };
    const wheatGroups = useMemo(() => { const groups = []; let currentGroup: { left: Workstation | null, right: Workstation | null } = { left: null, right: null }; workstations.forEach((st, i) => { if (!currentGroup.left) { currentGroup.left = st; } else { currentGroup.right = st; groups.push(currentGroup); currentGroup = { left: null, right: null }; } }); if (currentGroup.left) { groups.push(currentGroup); } return groups; }, [workstations]);
    const machinesSummary = useMemo(() => { const summary: Record<string, number> = {}; let total = 0; workstations.forEach(st => { const mName = st.machine.toUpperCase().includes('MAN') ? 'MAN' : st.machine; if (!summary[mName]) summary[mName] = 0; summary[mName] += 1; total += 1; }); return { counts: Object.entries(summary), total }; }, [workstations]);

    const SECTION_LABELS: Record<'PREPARATION' | 'MONTAGE' | 'GLOBAL', string> = {
        PREPARATION: 'Préparation',
        MONTAGE: 'Montage',
        GLOBAL: 'Zone Commune / Manager'
    };
    const isSectionSplitEnabled = useMemo(
        () => operations.some(op => (op.section || 'GLOBAL') !== 'GLOBAL'),
        [operations]
    );
    const [sectionTransferDialog, setSectionTransferDialog] = useState<null | {
        posteName: string;
        source: 'PREPARATION' | 'MONTAGE' | 'GLOBAL';
        target: 'PREPARATION' | 'MONTAGE' | 'GLOBAL';
        mode: 'confirm-transfer' | 'global-choice';
    }>(null);
    const pendingSectionTransferRef = useRef<null | {
        newPostes: Poste[];
        movedPoste: Poste;
        source: 'PREPARATION' | 'MONTAGE' | 'GLOBAL';
        target: 'PREPARATION' | 'MONTAGE' | 'GLOBAL';
    }>(null);

    const getDominantSectionForPoste = useCallback((poste: Poste): 'PREPARATION' | 'MONTAGE' | 'GLOBAL' => {
        if (!assignments) return 'GLOBAL';
        const sectionTimes: Record<'PREPARATION' | 'MONTAGE' | 'GLOBAL', number> = { PREPARATION: 0, MONTAGE: 0, GLOBAL: 0 };
        operations.forEach(op => {
            const assigned = assignments[op.id] || [];
            const linked = assigned.includes(poste.id) || (!!poste.originalId && assigned.includes(poste.originalId));
            if (linked) {
                sectionTimes[(op.section || 'GLOBAL') as 'PREPARATION' | 'MONTAGE' | 'GLOBAL'] += (op.time || 0);
            }
        });
        if (sectionTimes.PREPARATION > sectionTimes.MONTAGE && sectionTimes.PREPARATION > sectionTimes.GLOBAL) return 'PREPARATION';
        if (sectionTimes.MONTAGE > sectionTimes.GLOBAL) return 'MONTAGE';
        return 'GLOBAL';
    }, [assignments, operations]);

    const openSectionTransferDialog = (
        source: 'PREPARATION' | 'MONTAGE' | 'GLOBAL',
        target: 'PREPARATION' | 'MONTAGE' | 'GLOBAL',
        posteName: string,
        newPostes: Poste[],
        movedPoste: Poste
    ): boolean => {
        if (source === target) return false;
        pendingSectionTransferRef.current = { newPostes, movedPoste, source, target };
        setSectionTransferDialog({
            posteName,
            source,
            target,
            mode: (source === 'GLOBAL' || target === 'GLOBAL') ? 'global-choice' : 'confirm-transfer'
        });
        return true;
    };

    const applySectionToPosteOperations = (poste: Poste, section: 'PREPARATION' | 'MONTAGE') => {
        if (!assignments || !setOperations) return;
        const baseIds = new Set<string>([poste.id]);
        if (poste.originalId) baseIds.add(poste.originalId);
        setOperations(prev => prev.map(op => {
            const assigned = assignments[op.id] || [];
            const linked = assigned.some(aid => baseIds.has(aid));
            if (!linked) return op;
            return { ...op, section };
        }));
    };

    const resolveSectionTransferDialog = (decision: 'cancel' | 'keep-global' | 'set-prep' | 'set-montage' | 'confirm-target') => {
        const pending = pendingSectionTransferRef.current;
        if (!pending) {
            setSectionTransferDialog(null);
            return;
        }
        if (decision === 'cancel') {
            pendingSectionTransferRef.current = null;
            setSectionTransferDialog(null);
            return;
        }

        let applySection: 'PREPARATION' | 'MONTAGE' | undefined;
        if (decision === 'set-prep') applySection = 'PREPARATION';
        if (decision === 'set-montage') applySection = 'MONTAGE';
        if (decision === 'confirm-target' && pending.target !== 'GLOBAL') {
            applySection = pending.target;
        }

        if (applySection) {
            applySectionToPosteOperations(pending.movedPoste, applySection);
        }
        setPostes?.(pending.newPostes);
        pendingSectionTransferRef.current = null;
        setSectionTransferDialog(null);
    };

    const handleDragStart = (e: React.DragEvent, index: number, isWaitingList = false, stationId?: string) => {
        if (isSpacePressed) { e.preventDefault(); return; } // Prevent drag if panning
        if (isLinking) { e.preventDefault(); return; }
        if (isWaitingList && stationId) { e.dataTransfer.setData("stationId", stationId); e.dataTransfer.effectAllowed = "copy"; } else if (!canEdit || !isManualMode) { return; } else { setDraggedStationIdx(index); e.dataTransfer.effectAllowed = "move"; } setEditModal(null);
    };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
    const handleDrop = (e: React.DragEvent, targetPosteIdx: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (isLinking) return;

        const droppedStationId = e.dataTransfer.getData("stationId");
        if (!(isManualMode && setPostes && postes)) return;

        let newPostes = [...postes];
        const targetItem = newPostes[targetPosteIdx];
        if (!targetItem) return;

        let movedPoste: Poste | null = null;
        let targetReferencePoste: Poste | null = targetItem;

        if (droppedStationId) {
            const waitingStationIdx = newPostes.findIndex(p => p.id === droppedStationId);
            if (waitingStationIdx === -1) return;
            const stationToPlace = { ...newPostes[waitingStationIdx], isPlaced: true };
            movedPoste = stationToPlace;

            newPostes.splice(waitingStationIdx, 1);
            let adjustedTargetIdx = targetPosteIdx;
            if (waitingStationIdx < targetPosteIdx) adjustedTargetIdx--;

            if (isMagnetic) {
                newPostes.splice(adjustedTargetIdx, 0, stationToPlace);
            } else {
                const currentTarget = newPostes[adjustedTargetIdx];
                if (currentTarget && currentTarget.machine === 'VIDE') {
                    newPostes[adjustedTargetIdx] = stationToPlace;
                } else {
                    newPostes.splice(adjustedTargetIdx, 0, stationToPlace);
                }
            }
        } else if (draggedStationIdx !== null && draggedStationIdx !== undefined) {
            const sourceRealIdx = draggedStationIdx;
            if (sourceRealIdx === -1 || sourceRealIdx >= newPostes.length) return;
            if (sourceRealIdx === targetPosteIdx) {
                setDraggedStationIdx(null);
                return;
            }
            const sourceItem = newPostes[sourceRealIdx];
            const targetSlotItem = newPostes[targetPosteIdx];
            if (!sourceItem || !targetSlotItem) return;
            movedPoste = sourceItem;
            targetReferencePoste = targetSlotItem;

            if (isMagnetic) {
                newPostes.splice(sourceRealIdx, 1);
                let finalTargetIdx = targetPosteIdx;
                if (sourceRealIdx < targetPosteIdx) finalTargetIdx--;
                newPostes.splice(finalTargetIdx, 0, sourceItem);
            } else {
                newPostes[targetPosteIdx] = sourceItem;
                newPostes[sourceRealIdx] = targetSlotItem;
            }
        }

        if (
            isSectionSplitEnabled &&
            movedPoste &&
            targetReferencePoste &&
            movedPoste.machine !== 'VIDE' &&
            targetReferencePoste.machine !== 'VIDE'
        ) {
            const sourceSection = getDominantSectionForPoste(movedPoste);
            const targetSection = getDominantSectionForPoste(targetReferencePoste);
            const needsDecision = openSectionTransferDialog(sourceSection, targetSection, movedPoste.name, newPostes, movedPoste);
            if (needsDecision) {
                setDraggedStationIdx(null);
                return;
            }
        }

        setPostes(newPostes);
        setDraggedStationIdx(null);
    };

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

    const renderStationCard = (station: Workstation, isGrid = false, isMini = false) => {
        const color = station.color; const isVide = station.machine === 'VIDE'; const timeInSeconds = Math.round(station.totalTime * 60); const hasNotes = station.notes && station.notes.trim().length > 0; const hasOperator = station.operatorName && station.operatorName.trim().length > 0; const isOverridden = station.timeOverride !== undefined; const mySimIndex = station.index - 1; const isActive = !isMini && simStep === mySimIndex; const isPassed = simStep > mySimIndex; const isControl = station.machine.toUpperCase().includes('CONTROLE'); const isFer = station.machine.toUpperCase().includes('FER') || station.machine.toUpperCase().includes('REPASSAGE'); const isFinition = station.machine.toUpperCase().includes('FINITION'); const isBroken = station.notes?.includes('#PANNE');
        let bodyBgClass = 'bg-white/10 backdrop-blur-sm'; if (isControl) bodyBgClass = 'bg-orange-50/30 backdrop-blur-sm'; if (isFer) bodyBgClass = 'bg-rose-50/30 backdrop-blur-sm'; if (isFinition) bodyBgClass = 'bg-purple-50/30 backdrop-blur-sm'; const isSpecial = isControl || isFer || isFinition;
        const isFeeder = station.isFeeder; if (isFeeder) bodyBgClass = 'bg-blue-50/60';
        const isSwapSource = swapSourceId === station.id; const isSwapTarget = swapSourceId && swapSourceId !== station.id; const isLinkSource = linkSource === station.id; const isLinkTargetCandidate = isLinking && linkSource && linkSource !== station.id;
        const cardHeightClass = isGrid ? 'min-h-[140px]' : (isMini ? 'min-h-[80px]' : 'h-full min-h-[140px]'); const cardWidthClass = isMini ? 'w-full' : (isGrid ? 'w-full' : 'w-44 sm:w-48 shrink-0');

        // Dynamic styles based on Saturation: Red (>tolerance%), Amber (100%-tolerance%), Green (50%-100%), Grey (<50%)
        let satBadgeClass = 'bg-emerald-50 text-emerald-500';
        let satProgressClass = isActive ? 'bg-emerald-400' : (isFer ? 'bg-rose-500' : (isControl ? 'bg-orange-500' : (isFinition ? 'bg-purple-500' : color.fill)));
        if (station.saturation > tolerance) {
            satBadgeClass = 'bg-rose-100 text-rose-700 border border-rose-200';
            satProgressClass = 'bg-rose-500 animate-pulse';
        } else if (station.saturation >= 100) {
            satBadgeClass = 'bg-amber-100 text-amber-700 border border-amber-200';
            satProgressClass = 'bg-amber-500';
        } else if (station.saturation < 50) {
            satBadgeClass = 'bg-slate-100 text-slate-500 border border-slate-200';
            satProgressClass = 'bg-slate-400';
        }

        // Dynamic tracing highlight based on hoveredStationIndex: predecessor in amber, successor in sky blue, other cards dimmed to 70%
        let hoverTraceClass = '';
        let opacityStyle = {};
        if (hoveredStationIndex !== null) {
            if (hoveredStationIndex === station.index) {
                hoverTraceClass = 'ring-4 ring-indigo-500 border-indigo-600 scale-[1.03] shadow-2xl z-25';
            } else if (station.index === hoveredStationIndex - 1) {
                hoverTraceClass = 'ring-4 ring-amber-400 border-amber-500 scale-[1.03] shadow-lg z-25';
            } else if (station.index === hoveredStationIndex + 1) {
                hoverTraceClass = 'ring-4 ring-sky-400 border-sky-500 scale-[1.03] shadow-lg z-25';
            } else {
                opacityStyle = { opacity: 0.7 };
            }
        }

        const miniCardStyle = isMini ? `${color.bg} ${color.border} border-2` : `bg-white/40 backdrop-blur-md border-2 ${color.border}`; const cursorClass = (canEdit && isManualMode && !swapSourceId && !isLinking && !isSpacePressed) ? 'cursor-move' : 'cursor-default';

        if (isVide && !isMini) {
            return (
                <div
                    id={`station-card-${station.id}`}
                    draggable={canEdit && isManualMode && !swapSourceId && !isLinking && layoutType !== 'free' && !isSpacePressed}
                    onDragStart={(e) => handleDragStart(e, station.originalIndex, false, station.id)}
                    onDragEnd={() => setDraggedStationIdx(null)}
                    onMouseDown={(e) => layoutType === 'free' && handleFreeStart(e, station.id, station.x || 0, station.y || 0)}
                    onTouchStart={(e) => layoutType === 'free' && handleFreeStart(e, station.id, station.x || 0, station.y || 0)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, station.originalIndex); }}
                    onContextMenu={(e) => { handleContextMenu(e, station); }}
                    onMouseEnter={() => !isMini && setHoveredStationIndex(station.index)}
                    onMouseLeave={() => !isMini && setHoveredStationIndex(null)}
                    style={opacityStyle}
                    className={`relative rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-2 group z-10 transition-all ${(canEdit && isManualMode && !swapSourceId && !isLinking && !isSpacePressed && layoutType !== 'free') ? 'cursor-move' : ''} ${cardWidthClass} ${cardHeightClass} ${isManualMode && !isSpacePressed ? 'hover:bg-indigo-50 hover:border-indigo-300' : ''} ${layoutType === 'free' ? 'cursor-move hover:shadow-lg' : ''} ${hoverTraceClass}`}
                >
                    <div className="text-[10px] font-bold text-slate-400 uppercase pointer-events-none">Emplacement Vide</div>
                    {layoutType === 'free' && (
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
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
                id={isMini ? `station-card-mini-${station.id}` : (layoutType === 'free' ? `inner-card-${station.id}` : `station-card-${station.id}`)}
                onClick={() => handleStationClick(station)}
                onContextMenu={(e) => { handleContextMenu(e, station); }}
                onDoubleClick={(e) => handleOpenEditModal(e, station)}
                draggable={canEdit && isManualMode && !swapSourceId && !isLinking && layoutType !== 'free' && !isSpacePressed}
                onDragStart={(e) => {
                    if (layoutType === 'free') {
                        e.preventDefault();
                        return;
                    }
                    handleDragStart(e, station.originalIndex, isMini, station.id);
                }}
                onDragEnd={() => setDraggedStationIdx(null)}
                onDragOver={handleDragOver}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, station.originalIndex); }}
                onMouseEnter={() => !isMini && setHoveredStationIndex(station.index)}
                onMouseLeave={() => !isMini && setHoveredStationIndex(null)}
                style={opacityStyle}
                className={`relative rounded-xl overflow-hidden group shadow-[0_4px_16px_rgb(0,0,0,0.03)] z-10 ${cardWidthClass} ${cardHeightClass} ${canEdit && isManualMode && !isLinking && layoutType !== 'free' && !isSpacePressed ? 'hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]' : ''} ${cursorClass} ${isActive ? 'ring-4 ring-emerald-400 border-emerald-500 scale-105 shadow-xl z-20' : isLinkSource ? 'ring-4 ring-indigo-500 border-indigo-600 scale-105 shadow-xl z-20 animate-pulse' : isLinkTargetCandidate ? 'cursor-pointer hover:ring-4 hover:ring-indigo-300 hover:border-indigo-400' : isSwapSource ? 'ring-4 ring-indigo-500 border-indigo-600 scale-105 shadow-xl z-20' : isSwapTarget ? 'cursor-pointer hover:ring-4 hover:ring-indigo-300 hover:border-indigo-400' : isPassed ? 'border-emerald-200 opacity-90' : (isMini ? color.border : color.border)} ${isBroken ? 'ring-2 ring-rose-500 border-rose-600 bg-rose-50/90' : ''} ${miniCardStyle} ${hoverTraceClass} transition-all duration-300 flex flex-col select-none`}
            >
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isActive ? 'bg-emerald-500' : (isBroken ? 'bg-rose-500' : color.fill)}`}></div>
                <div className={`px-2 pl-3 py-1.5 flex justify-between items-center ${isActive ? 'bg-emerald-500/90 ' : (isPassed ? 'bg-emerald-50/90 ' : (isMini ? color.bg : color.bg + '/90 '))} border-b ${isActive ? 'border-emerald-600' : color.border} transition-colors duration-500 relative`}>
                    {isOverridden && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-purple-500 ring-1 ring-white animate-pulse" title="Temps Forcé"></div>}
                    {isBroken && <div className="absolute top-1 right-3 w-3 h-3 text-rose-600 animate-pulse"><AlertTriangle className="w-3 h-3 fill-current" /></div>}
                    <div className="flex items-center gap-1.5">
                        {!isMini && (
                            <span className="text-[9px] font-black bg-slate-900/10 text-slate-800 px-1 py-0.5 rounded mr-0.5">
                                #{station.index}
                            </span>
                        )}
                        <span className={`text-[10px] font-black ${isActive ? 'text-emerald-600 bg-white/60' : color.text} w-5 h-5 flex items-center justify-center bg-white/40 rounded-md shadow-sm border border-black/5`}> {station.name.replace('P', '').split('.')[0]} </span>
                        <span className={`text-[9px] font-black uppercase truncate max-w-[80px] ${isActive ? 'text-white' : color.text}`} title={station.name}> {station.machine} </span>
                    </div>

                    {station.dominantSection === 'PREPARATION' && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded-sm shadow-sm uppercase tracking-widest z-30 border border-amber-600">
                            PRÉP
                        </div>
                    )}
                    {station.dominantSection === 'MONTAGE' && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-sky-500 text-white text-[8px] font-black px-2 py-0.5 rounded-sm shadow-sm uppercase tracking-widest z-30 border border-sky-600">
                            MONTAGE
                        </div>
                    )}

                    {showLinks && manualLinks && manualLinks.some(l => l.from === station.id || l.to === station.id) && (
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
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
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); handleRemoveFromCanvas(station.id); }}
                                    className="p-1 rounded-md bg-white/20 hover:bg-rose-100 hover:text-rose-600 text-current transition-colors opacity-0 group-hover:opacity-100 z-50"
                                    title="Retirer du plan"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    )}

                    {!isMini && (<div className="flex items-center gap-0.5"> {isFeeder && <div title={`Alimente: ${station.targetStationName || 'Poste Suivant'}`}><GitMerge className={`w-3 h-3 ${isActive ? 'text-white' : 'text-blue-500'}`} /></div>} {hasOperator && <div title={station.operatorName}><User className={`w-3 h-3 ${isActive ? 'text-white' : 'text-slate-400'}`} /></div>} {hasNotes && <div title="Notes"><FileText className={`w-3 h-3 ${isActive ? 'text-yellow-300' : 'text-amber-400'}`} /></div>} </div>)}
                </div>
                <div className={`p-2 pl-3 flex-1 flex flex-col justify-between gap-1 ${isMini ? 'bg-transparent' : bodyBgClass}`}> {station.groups && station.groups.length > 0 && !isMini && (<div className="flex flex-wrap gap-1 mb-1"> {station.groups.slice(0, 2).map(grp => (<span key={grp} className="text-[7px] font-black uppercase text-indigo-600 bg-indigo-100 px-1 py-0.5 rounded border border-indigo-200 truncate max-w-full"> {grp} </span>))} {station.groups.length > 2 && <span className="text-[7px] text-slate-400">+{station.groups.length - 2}</span>} </div>)} <div className="space-y-1"> {station.operations.length > 0 ? (<> {station.operations.slice(0, isMini ? 100 : 3).map((op, i) => { const groupStyle = op.groupId ? getGroupStyle(op.groupId) : null; return (<div key={i} className={`flex justify-between items-center gap-1.5 py-0.5 ${groupStyle && isMini ? groupStyle.bg + ' px-1.5 rounded-md -mx-1.5 my-0.5 border border-transparent hover:border-indigo-200' : ''}`}> <span className={`font-mono text-[9px] font-bold px-1 rounded border shrink-0 ${groupStyle && isMini ? 'bg-transparent border-transparent ' + groupStyle.text : 'bg-transparent text-slate-400 border-slate-200'}`}> {op.order} </span> <div className={`text-[9px] font-bold leading-tight line-clamp-2 flex-1 ${groupStyle && isMini ? groupStyle.text : 'text-slate-600'}`} title={op.description}> {op.description} </div> {groupStyle && isMini && <LinkIcon className={`w-2.5 h-2.5 shrink-0 ${groupStyle.text}`} />} </div>) })} {station.operations.length > (isMini ? 100 : 3) && <div className="text-[8px] text-slate-400 italic font-medium">... +{station.operations.length - (isMini ? 100 : 3)}</div>} </>) : (<div className={`text-[9px] italic flex items-center justify-center ${isMini ? 'h-8' : 'h-12'} ${isOverridden ? 'text-purple-500 font-bold' : (isSpecial ? 'text-slate-400/70' : 'text-slate-300')}`}> {isOverridden ? 'Temps Forcé' : 'Vide'} </div>)} </div> <div className="flex items-center justify-between mt-auto pt-1.5 border-t border-slate-100"> <div className="flex flex-col"> <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Total</span> <span className={`text-sm font-bold ${isActive ? 'text-emerald-600' : (isOverridden ? 'text-purple-600' : color.text)}`}>{timeInSeconds}s</span> </div> <div className="flex flex-col items-end"> <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Sat.</span> <div className="flex items-center gap-1"> {station.operators > 1 && <span className={`text-[9px] font-black px-1 rounded bg-amber-100 text-amber-700`}>x{station.operators}</span>} <span className={`text-[9px] font-black ${satBadgeClass}`}>{Math.round(station.saturation)}%</span> </div> </div> </div> </div> <div className="absolute bottom-0 left-0 h-1 bg-slate-200 w-full"> <div className={`h-full ${!satProgressClass.startsWith('#') ? satProgressClass : ''}`} style={{ width: `${Math.min(station.saturation, 100)}%`, backgroundColor: satProgressClass.startsWith('#') ? satProgressClass : undefined }}></div> </div> </div>
        );
    };

    return (
        <div className="flex flex-col h-full gap-2 relative">
            {/* ... (Header Stats - Hidden in ReadOnly) ... */}
            {!readOnly && (<div className="bg-slate-50/80 rounded-xl border-2 border-slate-200 shadow-sm mb-2 p-2 flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
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
                <div className="flex flex-col items-center px-3 py-1.5 bg-orange-50/50 rounded-lg border border-orange-100 shrink-0">
                    <span className="text-[9px] font-bold text-orange-400 uppercase">P/H (100%)</span>
                    <span className="font-black text-orange-500 text-sm leading-none mt-1">{Math.round(prodHour100)}</span>
                </div>

                {/* TARGETS */}
                <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50/50 rounded-lg border border-slate-100 shrink-0">
                    <div className="flex flex-col items-center border-r border-slate-200 pr-3 mr-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">P/J</span>
                        <span className="font-black text-slate-700 text-sm leading-none mt-1">
                            {Math.round(prodDayEff)}
                        </span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">P/H</span>
                        <span className="font-black text-slate-700 text-sm leading-none mt-1">
                            {Math.round(prodHourEff)}
                        </span>
                    </div>
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

                {/* TOLÉRANCE SATURATION */}
                {setFicheData && (
                    <div className="flex flex-col items-center px-3 py-1.5 bg-rose-50/50 rounded-lg border border-rose-100 shrink-0">
                        <span className="text-[9px] font-bold text-rose-400 uppercase">Tolérance</span>
                        <div className="flex items-baseline gap-0.5">
                            <input
                                type="number"
                                min="50" max="200"
                                value={tolerance}
                                onChange={(e) => setFicheData(prev => ({ ...prev, toleranceSaturation: Math.max(50, Math.min(200, Number(e.target.value))) }))}
                                className="w-10 text-center bg-transparent font-black text-rose-600 outline-none text-sm border-b border-rose-200 p-0"
                            />
                            <span className="text-[10px] font-bold text-rose-400">%</span>
                        </div>
                    </div>
                )}

                {/* T. ARTICLE (Split View) */}
                <div className="ml-auto flex items-stretch gap-2 shrink-0">
                    {useMemo(() => {
                        const prepMin = operations.filter(op => op.section === 'PREPARATION').reduce((sum, op) => sum + (op.time || 0), 0) * 1.2;
                        const montMin = operations.filter(op => op.section === 'MONTAGE').reduce((sum, op) => sum + (op.time || 0), 0) * 1.2;
                        return (
                            <>
                                {prepMin > 0 && (
                                    <div className="px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-200 flex flex-col items-end">
                                        <span className="text-[9px] font-bold text-amber-600 uppercase">Préparation</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-amber-700 text-lg leading-none">{prepMin.toFixed(2)}</span>
                                            {preparationMetrics?.hourly && <span className="text-[10px] bg-amber-200/50 px-1 rounded text-amber-800 font-bold">Obj: {preparationMetrics.hourly}/h</span>}
                                        </div>
                                    </div>
                                )}
                                {montMin > 0 && (
                                    <div className="px-3 py-1.5 bg-sky-50 rounded-lg border border-sky-200 flex flex-col items-end">
                                        <span className="text-[9px] font-bold text-sky-600 uppercase">Montage</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-sky-700 text-lg leading-none">{montMin.toFixed(2)}</span>
                                            {montageMetrics?.hourly && <span className="text-[10px] bg-sky-200/50 px-1 rounded text-sky-800 font-bold">Obj: {montageMetrics.hourly}/h</span>}
                                        </div>
                                    </div>
                                )}
                            </>
                        );
                    }, [operations, preparationMetrics, montageMetrics])}
                    <div className="px-4 py-1.5 bg-purple-100 rounded-lg border border-purple-200 flex flex-col items-end shrink-0">
                        <span className="text-[9px] font-bold text-purple-500 uppercase flex items-center gap-1"><Timer className="w-3 h-3" /> T. Global</span>
                        <span className="font-black text-purple-700 text-xl leading-none">{tempsArticle.toFixed(2)}</span>
                    </div>
                </div>
            </div>)}

            {/* FULLSCREEN WRAPPER */}
            <div ref={fullscreenWrapperRef} className={`flex flex-col flex-1 min-h-0 w-full h-full relative transition-[background-color] duration-500 ${isFullScreen ? 'bg-[#F8FAFC]' : 'bg-transparent'}`}>
                <div className={`flex flex-col flex-1 min-h-0 h-full w-full ${isFullScreen ? 'animate-in fade-in duration-700 ease-out' : ''}`}>



                    {/* TOOLBAR & CONTROLS (Hidden in ReadOnly) */}
                    {!readOnly && (
                        <>
                            <div className="bg-slate-50/80 rounded-2xl border-2 border-slate-200 shadow-sm p-2.5 flex flex-wrap items-center gap-2 shrink-0 z-30 mb-2 mt-4 relative">
                                {/* Mode Toggle */}
                                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                                    <button onClick={activateAutoMode} className={`flex items-center justify-center px-3 py-1.5 rounded-md font-bold transition-all text-xs ${!isManualMode ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                                        Auto
                                    </button>
                                    <button onClick={activateManualMode} className={`flex items-center justify-center px-3 py-1.5 rounded-md font-bold transition-all text-xs ${isManualMode ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                                        Manuel
                                    </button>
                                </div>

                                <div className="w-px h-7 bg-slate-200" />

                                {/* Layout Picker */}
                                <div className="flex items-center gap-0.5 bg-slate-50 p-0.5 rounded-lg border border-slate-200">
                                    {[
                                        { id: 'line', label: '2 Lignes', icon: Columns },
                                        { id: 'double-zigzag', label: 'Zigzag', icon: ArrowLeftRight },
                                        ...(isManualMode ? [{ id: 'free', label: 'Libre', icon: Move }] : []),
                                    ].map((item) => (
                                        <button key={item.id} onClick={() => handleLayoutChange(item.id as any)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${layoutType === item.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-indigo-600'}`}>
                                            <item.icon className="w-3.5 h-3.5" />
                                            <span className="hidden xl:inline">{item.label}</span>
                                        </button>
                                    ))}
                                </div>

                                <div className="w-px h-7 bg-slate-200" />

                                {/* Zoom Controls */}
                                <div className="flex items-center gap-0.5 bg-slate-50 p-0.5 rounded-lg border border-slate-200">
                                    <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-md hover:bg-slate-100 transition-colors" title="Zoom -"><ZoomOut className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setZoom(1)} className="px-2 py-1 text-[10px] font-black text-slate-600 hover:text-indigo-600 rounded-md hover:bg-slate-100 transition-colors min-w-[40px] text-center" title="Réinitialiser Zoom">{Math.round(zoom * 100)}%</button>
                                    <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-md hover:bg-slate-100 transition-colors" title="Zoom +"><ZoomIn className="w-3.5 h-3.5" /></button>
                                </div>

                                <div className="w-px h-7 bg-slate-200" />

                                {/* Orientation Controls */}
                                <div className="flex items-center bg-slate-50 p-0.5 rounded-lg border border-slate-200">
                                    <button 
                                        onClick={() => setOrientation('landscape')} 
                                        className={`px-2.5 py-1.5 rounded-md font-bold transition-all text-xs ${orientation === 'landscape' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'}`}
                                        title="Implantation Horizontale"
                                    >
                                        Paysage
                                    </button>
                                    <button 
                                        onClick={() => setOrientation('portrait')} 
                                        className={`px-2.5 py-1.5 rounded-md font-bold transition-all text-xs ${orientation === 'portrait' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'}`}
                                        title="Implantation Verticale"
                                    >
                                        Portrait
                                    </button>
                                </div>

                                {/* Free Mode Tools */}
                                {isManualMode && layoutType === 'free' && (
                                    <>
                                        <div className="w-px h-7 bg-slate-200" />
                                        <div className="flex items-center gap-0.5 bg-violet-50 p-0.5 rounded-lg border border-violet-200">
                                            <button onClick={() => applyLayoutPattern('U')} className="p-1.5 rounded-md text-violet-600 hover:bg-slate-100 transition-colors" title="Disposition U"><Columns className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => applyLayoutPattern('GRID')} className="p-1.5 rounded-md text-violet-600 hover:bg-slate-100 transition-colors" title="Grille"><LayoutGrid className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => applyLayoutPattern('CIRCLE')} className="p-1.5 rounded-md text-violet-600 hover:bg-slate-100 transition-colors" title="Cercle"><CircleDashed className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => applyLayoutPattern('LINE')} className="p-1.5 rounded-md text-violet-600 hover:bg-slate-100 transition-colors" title="Ligne droite"><ArrowRight className="w-3.5 h-3.5" /></button>
                                        </div>
                                    </>
                                )}

                                {/* Station Counter Badge */}
                                <div className="w-px h-7 bg-slate-200" />
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wide">
                                    <Layers className="w-3.5 h-3.5" />
                                    <span className="text-indigo-600">{workstations.filter(s => s.machine !== 'VIDE').length}</span>
                                    <span>postes</span>
                                    {isManualMode && waitingStations.length > 0 && (
                                        <span className="text-amber-500 ml-0.5">({waitingStations.length} en attente)</span>
                                    )}
                                </div>

                                {/* Spacer */}
                                <div className="flex-1" />

                                {/* Right Actions */}
                                <div className="flex items-center gap-1.5">
                                    <button onClick={handleClearPlan} className="p-1.5 rounded-lg bg-slate-50 text-rose-400 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors flex items-center gap-1" title="Vider tout le plan (basculer en mode libre)">
                                        <Trash2 className="w-4 h-4" />
                                        <span className="text-[10px] uppercase font-black tracking-wider hidden xl:inline">Vider</span>
                                    </button>
                                    {isManualMode && (
                                        <button onClick={renumberStations} className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-200 hover:text-indigo-600 hover:border-indigo-200 transition-colors" title="Renuméroter P1, P2, P3...">
                                            <ListOrdered className="w-4 h-4" />
                                        </button>
                                    )}
                                    {isManualMode && (
                                        <button onClick={restoreGammeOrder} className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-200 hover:text-indigo-600 hover:border-indigo-200 transition-colors" title="Remettre les postes selon l'ordre de la gamme">
                                            <ArrowDownToLine className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button onClick={() => setShowMaterialsPanel(!showMaterialsPanel)} className={`p-1.5 rounded-lg transition-colors ${showMaterialsPanel ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-400 border border-slate-200 hover:text-indigo-600'}`} title="Compteur Machines">
                                        <Calculator className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setShowLoadTemplateModal(true)} className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-200 hover:text-indigo-600 transition-colors" title="Charger un plan">
                                        <FolderOpen className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setShowSaveTemplateModal(true)} className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-200 hover:text-emerald-600 transition-colors" title="Sauvegarder le plan">
                                        <Save className="w-4 h-4" />
                                    </button>
                                    <button onClick={toggleFullScreen} className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-200 hover:text-indigo-600 transition-colors" title={isFullScreen ? "Quitter plein écran (Esc/F)" : "Plein écran (F)"}>
                                        {isFullScreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                                    </button>

                                    <div className="w-px h-7 bg-slate-200" />

                                    {/* Impression / PDF : document TABLEAU (fenêtre d'impression du navigateur). */}
                                    <button onClick={() => setPrintOrientationModal(true)} className="px-3 py-1.5 bg-slate-50 rounded-lg flex items-center gap-1.5 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors text-slate-600 text-xs font-bold whitespace-nowrap">
                                        <Printer className="w-3.5 h-3.5" /> Imprimer
                                    </button>
                                    {onSave && (
                                        <button onClick={() => { onSave(); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 2500); }} className="px-3 py-1.5 bg-slate-800 text-white rounded-lg flex items-center gap-1.5 border border-slate-700 hover:bg-emerald-600 hover:border-emerald-600 transition-colors text-xs font-bold whitespace-nowrap active:scale-95">
                                            {saveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />} {saveSuccess ? 'Sauvé !' : 'Sauver'}
                                        </button>
                                    )}
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

                            {/* 2. ZONES INDICATOR */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto text-[10px] font-bold uppercase text-slate-400 shadow-inner shrink-0 mb-1">
                                <div className="flex items-center gap-2 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-200 opacity-60 shrink-0"><Package className="w-3 h-3 text-slate-400" /> Stock Tissu</div><ArrowRight className="w-3 h-3 text-slate-300 shrink-0" /><div className="flex items-center gap-2 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-200 opacity-60 shrink-0"><Scissors className="w-3 h-3 text-slate-400" /> Coupe & Prep</div><ArrowRight className="w-3 h-3 text-emerald-400 shrink-0" /><div className="flex items-center gap-2 px-2 py-0.5 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-700 shadow-sm shrink-0"><Layers className="w-3 h-3" /> Montage (Atelier)</div><ArrowRight className="w-3 h-3 text-emerald-400 shrink-0" />
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
                                <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" /><div className="flex items-center gap-2 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-200 opacity-60 shrink-0"><Truck className="w-3 h-3 text-slate-400" /> Expédition</div>
                            </div>
                        </>
                    )}

                    {/* 3. CANVAS (With Wrapper & Styles for Scrollbars) */}
                    <div className="flex-1 flex gap-4 min-h-0 relative h-full">

                        {/* MINI-GAMME SIDEBAR (VISIBLE IN MANUAL MODE) - RESPONSIVE (DRAWER ON MOBILE) */}
                        {!readOnly && isManualMode && (
                            <>
                                {/* Mobile Backdrop */}
                                <div
                                    className={`lg:hidden fixed inset-0 bg-black/20 z-20 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                                    onClick={() => setIsSidebarOpen(false)}
                                />

                                <div className={`absolute lg:relative h-full bg-slate-50 border-r border-slate-200 shadow-xl z-30 flex flex-col transition-all duration-300 ease-in-out shrink-0 ${isSidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full lg:w-8 lg:translate-x-0'}`}>
                                    {/* Toggle Button - Repositioned for Mobile vs Desktop */}
                                    <button
                                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                        className={`absolute -right-3 top-4 bg-slate-50 border border-slate-200 text-slate-500 rounded-full p-1 shadow-md hover:text-indigo-600 z-50 transition-transform active:scale-95 ${!isSidebarOpen && window.innerWidth < 1024 ? 'hidden' : ''}`}
                                    >
                                        {isSidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    </button>

                                    {/* Mobile Open Button (When Closed) */}
                                    {!isSidebarOpen && (
                                        <button
                                            onClick={() => setIsSidebarOpen(true)}
                                            className="lg:hidden absolute top-4 left-4 z-20 bg-slate-50 p-2 rounded-lg shadow-md border border-slate-200 text-indigo-600"
                                        >
                                            <Menu className="w-5 h-5" />
                                        </button>
                                    )}

                                    {/* Sidebar Content (Visible when open) */}
                                    <div className={`flex-1 flex flex-col overflow-hidden transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none invisible'}`}>
                                        <div className="p-3 border-b border-slate-200 bg-slate-50">
                                            <div className="flex justify-between items-center mb-2">
                                                <h3 className="font-bold text-xs uppercase text-slate-500 flex items-center gap-2">
                                                    <Inbox className="w-4 h-4" /> File d'attente
                                                </h3>
                                                <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{waitingStations.length}</span>
                                            </div>
                                            {waitingStations.length > 0 && (
                                                <button
                                                    onClick={placeAllOnCanvas}
                                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors active:scale-[0.98] shadow-sm"
                                                >
                                                    <Layers className="w-3.5 h-3.5" /> Tout placer sur le plan
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                                            {waitingStations.map(station => (
                                                <div
                                                    key={station.id}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, station.originalIndex, true, station.id)}
                                                    className="cursor-grab active:cursor-grabbing w-full"
                                                >
                                                    {renderStationCard(station as Workstation, false, true)}
                                                </div>
                                            ))}
                                            {waitingStations.length === 0 && (
                                                <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-300">
                                                    <Check className="w-8 h-8" />
                                                    <span className="text-xs font-bold">Tous les postes sont placés</span>
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
                                            let dropPos: { x: number; y: number } | undefined;
                                            if (layoutType === 'free' && contentRef.current) {
                                                const rect = contentRef.current.getBoundingClientRect();
                                                // The 3000px canvas has 24px left padding and ~64px top offset.
                                                let targetX = Math.round((e.clientX - rect.left) / zoom) - 24;
                                                let targetY = Math.round((e.clientY - rect.top) / zoom) - 64;

                                                // Apply Canvas Bounds Check on Drop
                                                const MIN_X = 24;
                                                const MIN_Y = 24;
                                                const MAX_X = 3000 - 240;
                                                const MAX_Y = 2000 - 160;

                                                targetX = Math.max(MIN_X, Math.min(MAX_X, targetX));
                                                targetY = Math.max(MIN_Y, Math.min(MAX_Y, targetY));

                                                dropPos = { x: targetX, y: targetY };
                                            }
                                            handleManualDrop(id, dropPos);
                                        } else if (draggedStationIdx !== null) {
                                            // Handle dragging existing item from canvas to background
                                        }
                                    }
                                }}
                            >
                                {/* SVG IS NOW INSIDE THE SCALED DIV TO ENSURE PERFECT ALIGNMENT & SCALING */}
                                <div
                                    ref={contentRef}
                                    className={`transition-transform duration-200 ease-out origin-top-left relative min-w-max`}
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
                                            hoveredStationIndex={hoveredStationIndex}
                                        />
                                    )}

                                    {/* FREE LAYOUT MODE */}
                                    {layoutType === 'free' && (
                                        <div className={`flex flex-col gap-6 p-6 w-full min-w-max pb-32 ${orientation === 'portrait' ? 'rotate-90 origin-center scale-75 mt-40' : ''}`}>
                                            <div className="relative mt-4 flex flex-col">
                                                <div className="absolute -top-4 left-6 bg-indigo-600/80 backdrop-blur-md text-white px-5 py-1.5 rounded-xl text-xs font-black shadow-lg uppercase tracking-widest border border-white/20 z-20">Plan Libre</div>

                                                <div className="relative w-[3000px] h-[2000px] mt-4 overflow-hidden">
                                                    {workstations
                                                        .filter(st => st.machine !== 'VIDE' || st.shape === 'circle' || st.shape === 'zone')
                                                        .map((st, idx) => {
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
                                                                    className={`absolute select-none transition-shadow ${isDraggingThis ? 'z-[100] shadow-2xl scale-105 cursor-grabbing' : 'z-10'} ${isSpacePressed ? 'cursor-grab' : 'cursor-move hover:z-50'}`}
                                                                    style={{
                                                                        left: x,
                                                                        top: y,
                                                                        transform: `rotate(${rotation}deg)`
                                                                    }}
                                                                    onDragStart={(e) => e.preventDefault()}
                                                                    onMouseDown={(e) => handleFreeStart(e, st.id, x, y)}
                                                                    onTouchStart={(e) => handleFreeStart(e, st.id, x, y)}
                                                                    onContextMenu={(e) => {
                                                                        handleContextMenu(e, st);
                                                                    }}
                                                                >
                                                                    {shape === 'circle' ? (
                                                                        <div className="w-32 h-32 rounded-full border-4 border-dashed border-slate-300 bg-slate-100/80 flex items-center justify-center shadow-sm pointer-events-none">
                                                                            <div className="text-center">
                                                                                <div className="text-xs font-bold text-slate-500">{st.name}</div>
                                                                                <div className="text-[10px] text-slate-400">{st.machine}</div>
                                                                            </div>
                                                                        </div>
                                                                    ) : shape === 'zone' ? (
                                                                        <div className="w-48 h-32 border-2 border-dashed border-indigo-300 bg-indigo-50/30 rounded-xl flex items-center justify-center pointer-events-none">
                                                                            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Zone {st.name}</span>
                                                                        </div>
                                                                    ) : (
                                                                        renderStationCard(st)
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══ U-LIGNE (Goes forward, U-turns, comes back) ═══ */}
                                    {layoutType === 'zigzag' && (
                                        <div className={`flex flex-col gap-6 items-center min-w-max pb-32 p-8 ${orientation === 'portrait' ? 'rotate-90 origin-center scale-75 mt-40' : ''}`}>
                                            {structureSections.map((section) => {
                                                const topRow = section.stations.filter((_, i) => i % 2 === 0);
                                                const bottomRow = section.stations.filter((_, i) => i % 2 !== 0);

                                                let bgClass = "bg-indigo-600/80";
                                                let borderClass = "border-indigo-500";
                                                if (section.theme === 'amber') { bgClass = "bg-amber-600/80"; borderClass = "border-amber-500"; }
                                                if (section.theme === 'sky') { bgClass = "bg-sky-600/80"; borderClass = "border-sky-500"; }

                                                return (
                                                    <div key={section.id} className="relative w-full border-2 border-dashed border-slate-200 rounded-3xl p-8 bg-slate-50/50 mb-6 shadow-sm flex flex-col items-center">
                                                        <div className={`absolute -top-4 left-6 ${bgClass} backdrop-blur-md text-white px-5 py-1.5 rounded-xl text-xs font-black shadow-lg uppercase tracking-widest border border-white/20 z-20 flex gap-2 items-center`}>
                                                            {section.name}
                                                            {section.hourly && <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">Obj: {section.hourly} p/h</span>}
                                                        </div>

                                                        <div className="flex flex-col gap-6 pt-4 w-full">
                                                            {topRow.length > 0 && (
                                                                <div className="relative w-full">
                                                                    <div className={`absolute -left-4 top-1/2 -translate-y-1/2 ${bgClass} text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider shadow`}>→</div>
                                                                    <div className="flex items-center gap-6 pl-8">
                                                                        {topRow.map((st, i) => (
                                                                            <div key={`utop-${st.id}`} className="flex items-center gap-6">
                                                                                <div id={`station-card-${st.id}`} className={`relative group transition-transform hover:scale-[1.02] shadow-sm hover:shadow-xl rounded-xl border-b-4 ${borderClass}`}>
                                                                                    {renderStationCard(st)}
                                                                                </div>
                                                                                {i < topRow.length - 1 && (() => {
                                                                                    const isOutgoing = hoveredStationIndex === topRow[i].index;
                                                                                    const isIncoming = hoveredStationIndex === topRow[i+1].index;
                                                                                    const isAnyHovered = hoveredStationIndex !== null;
                                                                                    
                                                                                    let lineClass = 'w-6 h-1 bg-slate-200';
                                                                                    let chevronClass = '-ml-2 w-5 h-5 stroke-[3] text-slate-400';
                                                                                    let opacityClass = 'opacity-60';
                                                                                    
                                                                                    if (isAnyHovered) {
                                                                                        if (isOutgoing) {
                                                                                            lineClass = 'w-8 h-1.5 bg-sky-400';
                                                                                            chevronClass = '-ml-2 w-6 h-6 stroke-[4] text-sky-500 scale-110';
                                                                                            opacityClass = 'opacity-100';
                                                                                        } else if (isIncoming) {
                                                                                            lineClass = 'w-8 h-1.5 bg-amber-400';
                                                                                            chevronClass = '-ml-2 w-6 h-6 stroke-[4] text-amber-500 scale-110';
                                                                                            opacityClass = 'opacity-100';
                                                                                        } else {
                                                                                            opacityClass = 'opacity-20';
                                                                                        }
                                                                                    }
                                                                                    return (
                                                                                        <div className={`flex items-center transition-all duration-300 ${opacityClass}`}>
                                                                                            <div className={`rounded transition-all duration-300 ${lineClass}`}></div>
                                                                                            <ChevronRight className={`transition-all duration-300 ${chevronClass}`} />
                                                                                        </div>
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {bottomRow.length > 0 && (
                                                                <div className="flex justify-end w-full pr-12">
                                                                    <div className="flex flex-col items-center opacity-60">
                                                                        <div className="w-1.5 h-8 rounded bg-slate-300"></div>
                                                                        <div className="bg-slate-500 text-white text-[8px] font-black px-2 py-1 rounded shadow">U-TURN</div>
                                                                        <div className="w-1.5 h-8 rounded bg-slate-300"></div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {bottomRow.length > 0 && (
                                                                <div className="relative w-full">
                                                                    <div className="absolute -left-4 top-1/2 -translate-y-1/2 bg-slate-500 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider shadow">←</div>
                                                                    <div className="flex flex-row-reverse items-center gap-6 pr-8">
                                                                        {bottomRow.map((st, i) => (
                                                                            <div key={`ubottom-${st.id}`} className="flex flex-row-reverse items-center gap-6">
                                                                                <div id={`station-card-${st.id}`} className={`relative group transition-transform hover:scale-[1.02] shadow-sm hover:shadow-xl rounded-xl border-t-4 ${borderClass}`}>
                                                                                    {renderStationCard(st)}
                                                                                </div>
                                                                                {i < bottomRow.length - 1 && (() => {
                                                                                    const isOutgoing = hoveredStationIndex === bottomRow[i+1].index;
                                                                                    const isIncoming = hoveredStationIndex === bottomRow[i].index;
                                                                                    const isAnyHovered = hoveredStationIndex !== null;
                                                                                    
                                                                                    let lineClass = 'w-6 h-1 bg-slate-200';
                                                                                    let chevronClass = '-mr-2 w-5 h-5 stroke-[3] text-slate-400';
                                                                                    let opacityClass = 'opacity-60';
                                                                                    
                                                                                    if (isAnyHovered) {
                                                                                        if (isOutgoing) {
                                                                                            lineClass = 'w-8 h-1.5 bg-sky-400';
                                                                                            chevronClass = '-mr-2 w-6 h-6 stroke-[4] text-sky-500 scale-110';
                                                                                            opacityClass = 'opacity-100';
                                                                                        } else if (isIncoming) {
                                                                                            lineClass = 'w-8 h-1.5 bg-amber-400';
                                                                                            chevronClass = '-mr-2 w-6 h-6 stroke-[4] text-amber-500 scale-110';
                                                                                            opacityClass = 'opacity-100';
                                                                                        } else {
                                                                                            opacityClass = 'opacity-20';
                                                                                        }
                                                                                    }
                                                                                    return (
                                                                                        <div className={`flex items-center transition-all duration-300 ${opacityClass}`}>
                                                                                            <ChevronLeft className={`transition-all duration-300 ${chevronClass}`} />
                                                                                            <div className={`rounded transition-all duration-300 ${lineClass}`}></div>
                                                                                        </div>
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            
                                            {/* EXPÉDITION */}
                                            <div className="flex justify-start w-full pl-8 mt-4">
                                                <div className="flex items-center gap-4 bg-slate-800 text-white px-8 py-4 rounded-2xl shadow-2xl border-4 border-slate-700 hover:scale-105 transition-transform">
                                                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg"><Truck className="w-6 h-6 animate-pulse" /></div>
                                                    <div className="flex flex-col"><span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Terminé</span><span className="text-sm font-black uppercase tracking-widest">EXPÉDITION</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══ Double Zigzag Layout ═══ */}
                                    {layoutType === 'double-zigzag' && (
                                        <div className={`flex flex-col gap-6 p-6 w-full min-w-max pb-32 ${orientation === 'portrait' ? 'rotate-90 origin-center scale-75 mt-40' : ''}`}>
                                            {structureSections.map((section) => {
                                                const sideA = section.stations.filter((_, i) => i % 2 === 0);
                                                const sideB = section.stations.filter((_, i) => i % 2 !== 0);

                                                let bgClass = "bg-indigo-600/80";
                                                let borderClassA = "border-indigo-500";
                                                let borderClassB = "border-orange-500";
                                                if (section.theme === 'amber') { bgClass = "bg-amber-600/80"; borderClassA = "border-amber-500"; borderClassB = "border-amber-400"; }
                                                if (section.theme === 'sky') { bgClass = "bg-sky-600/80"; borderClassA = "border-sky-500"; borderClassB = "border-sky-400"; }
                                                let arrowColor = section.theme === 'amber' ? "#f59e0b" : section.theme === 'sky' ? "#0ea5e9" : "#818cf8";

                                                return (
                                                    <div key={section.id} className="relative mt-4 flex flex-col w-full border-2 border-dashed border-slate-200 rounded-3xl p-6 bg-slate-50/50 mb-6 shadow-sm">
                                                        <div className={`absolute -top-4 left-6 ${bgClass} backdrop-blur-md text-white px-5 py-1.5 rounded-xl text-xs font-black shadow-lg uppercase tracking-widest border border-white/20 z-20 flex gap-2 items-center`}>
                                                            {section.name}
                                                            {section.hourly && <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">Obj: {section.hourly} p/h</span>}
                                                        </div>

                                                        <div className="flex flex-col gap-24 relative w-full pt-8">
                                                            {sideA.length > 0 && (
                                                                <div className="flex items-center gap-12 relative z-10 w-full justify-start">
                                                                    {sideA.map((st, i) => (
                                                                        <div key={`sideA-${st.id}`} className="flex items-center gap-12 relative">
                                                                            <div id={`station-card-${st.id}`} className={`relative group transition-transform hover:scale-[1.02] shadow-sm hover:shadow-xl rounded-xl bg-white border-b-4 ${borderClassA}`}>
                                                                                {renderStationCard(st)}
                                                                            </div>
                                                                            {i < sideB.length && (() => {
                                                                                const isOutgoing = hoveredStationIndex === st.index;
                                                                                const isIncoming = hoveredStationIndex === sideB[i].index;
                                                                                const isAnyHovered = hoveredStationIndex !== null;
                                                                                
                                                                                let stroke = arrowColor;
                                                                                let strokeWidth = "4";
                                                                                let opacity = "opacity-80";
                                                                                
                                                                                if (isAnyHovered) {
                                                                                    if (isOutgoing) {
                                                                                        stroke = "#0ea5e9";
                                                                                        strokeWidth = "6";
                                                                                        opacity = "opacity-100";
                                                                                    } else if (isIncoming) {
                                                                                        stroke = "#f59e0b";
                                                                                        strokeWidth = "6";
                                                                                        opacity = "opacity-100";
                                                                                    } else {
                                                                                        opacity = "opacity-20";
                                                                                    }
                                                                                }
                                                                                return (
                                                                                    <div className={`absolute top-[80%] left-[80%] w-[120px] h-[70px] z-0 overflow-visible pointer-events-none transition-all duration-300 ${opacity}`}>
                                                                                        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="overflow-visible ">
                                                                                            <path d="M 0 0 C 40 30, 60 70, 100 100" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6,4" strokeLinecap="round" className="transition-all duration-300" />
                                                                                            <polygon points="85,90 100,100 95,80" fill={stroke} className="transition-all duration-300" />
                                                                                        </svg>
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {sideB.length > 0 && (
                                                                <div className="flex items-center gap-12 relative z-10 w-full justify-start translate-x-16">
                                                                    {sideB.map((st, i) => (
                                                                        <div key={`sideB-${st.id}`} className="flex items-center gap-12 relative">
                                                                            <div id={`station-card-${st.id}`} className={`relative group transition-transform hover:scale-[1.02] shadow-sm hover:shadow-xl rounded-xl bg-white border-t-4 ${borderClassB}`}>
                                                                                {renderStationCard(st)}
                                                                            </div>
                                                                            {i + 1 < sideA.length && (() => {
                                                                                const isOutgoing = hoveredStationIndex === st.index;
                                                                                const isIncoming = hoveredStationIndex === sideA[i+1].index;
                                                                                const isAnyHovered = hoveredStationIndex !== null;
                                                                                
                                                                                let stroke = "#64748b";
                                                                                let strokeWidth = "4";
                                                                                let opacity = "opacity-80";
                                                                                
                                                                                if (isAnyHovered) {
                                                                                    if (isOutgoing) {
                                                                                        stroke = "#0ea5e9";
                                                                                        strokeWidth = "6";
                                                                                        opacity = "opacity-100";
                                                                                    } else if (isIncoming) {
                                                                                        stroke = "#f59e0b";
                                                                                        strokeWidth = "6";
                                                                                        opacity = "opacity-100";
                                                                                    } else {
                                                                                        opacity = "opacity-20";
                                                                                    }
                                                                                }
                                                                                return (
                                                                                    <div className={`absolute bottom-[80%] left-[80%] w-[120px] h-[70px] z-0 overflow-visible pointer-events-none transition-all duration-300 ${opacity}`}>
                                                                                        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="overflow-visible ">
                                                                                            <path d="M 0 100 C 40 70, 60 30, 100 0" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6,4" strokeLinecap="round" className="transition-all duration-300" />
                                                                                            <polygon points="85,10 100,0 95,20" fill={stroke} className="transition-all duration-300" />
                                                                                        </svg>
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            
                                            {/* EXPÉDITION */}
                                            <div className="flex justify-end w-full mt-8 pr-4">
                                                <div className="flex items-center gap-4 bg-slate-800 text-white px-8 py-4 rounded-2xl shadow-2xl border border-white/20 hover:scale-105 transition-transform">
                                                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg"><Truck className="w-6 h-6 animate-pulse" /></div>
                                                    <div className="flex flex-col"><span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Terminé</span><span className="text-sm font-black uppercase tracking-widest">EXPÉDITION</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══ Line Layout ═══ */}
                                    {layoutType === 'line' && (
                                        <div className={`flex flex-col gap-6 p-6 w-full min-w-max pb-32 ${orientation === 'portrait' ? 'rotate-90 origin-center scale-75 mt-40' : ''}`}>
                                            {structureSections.map((section) => {
                                                const topRow = section.stations.filter((_, i) => i % 2 === 0);
                                                const bottomRow = section.stations.filter((_, i) => i % 2 !== 0);

                                                let bgClass = "bg-indigo-600";
                                                let borderClass = "border-indigo-500";
                                                if (section.theme === 'amber') { bgClass = "bg-amber-600"; borderClass = "border-amber-500"; }
                                                if (section.theme === 'sky') { bgClass = "bg-sky-600"; borderClass = "border-sky-500"; }

                                                return (
                                                    <div key={section.id} className="relative mt-4 flex flex-col bg-slate-50/80 rounded-3xl border-2 border-slate-200 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-6">
                                                        <div className={`absolute -top-4 left-6 ${bgClass} text-white px-5 py-1.5 rounded-xl text-xs font-black shadow-lg uppercase tracking-widest border border-white/20 flex gap-2 items-center z-20`}>
                                                            {section.name}
                                                            {section.hourly && <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">Obj: {section.hourly} p/h</span>}
                                                        </div>

                                                        <div className="flex flex-col gap-20 pt-8 w-full">
                                                            {topRow.length > 0 && (
                                                                <div className="relative">
                                                                    <div className="absolute -left-2 top-1/2 -translate-y-1/2 bg-slate-500 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider shadow z-10">A</div>
                                                                    <div className="flex items-center gap-6 pl-8">
                                                                        {topRow.map((st, i) => (
                                                                            <div key={`lineA-${st.id}`} className="flex items-center gap-6">
                                                                                <div id={`station-card-${st.id}`} className={`relative group transition-transform hover:scale-[1.02] shadow-sm hover:shadow-xl rounded-xl border-b-4 ${borderClass}`}>
                                                                                    {renderStationCard(st)}
                                                                                </div>
                                                                                {i < topRow.length - 1 && (() => {
                                                                                    const isOutgoing = hoveredStationIndex === topRow[i].index;
                                                                                    const isIncoming = hoveredStationIndex === topRow[i+1].index;
                                                                                    const isAnyHovered = hoveredStationIndex !== null;
                                                                                    
                                                                                    let lineBg = 'bg-slate-200/40';
                                                                                    let gradientClass = 'bg-gradient-to-r from-transparent via-slate-400 to-transparent';
                                                                                    let chevronClass = 'text-slate-400';
                                                                                    let opacity = 'opacity-80';
                                                                                    
                                                                                    if (isAnyHovered) {
                                                                                        if (isOutgoing) {
                                                                                            lineBg = 'bg-sky-200/40';
                                                                                            gradientClass = 'bg-sky-400';
                                                                                            chevronClass = 'text-sky-500 scale-110 stroke-[5]';
                                                                                            opacity = 'opacity-100';
                                                                                        } else if (isIncoming) {
                                                                                            lineBg = 'bg-amber-200/40';
                                                                                            gradientClass = 'bg-amber-400';
                                                                                            chevronClass = 'text-amber-500 scale-110 stroke-[5]';
                                                                                            opacity = 'opacity-100';
                                                                                        } else {
                                                                                            opacity = 'opacity-20';
                                                                                        }
                                                                                    }
                                                                                    return (
                                                                                        <div className={`flex items-center text-slate-400 shrink-0 transition-all duration-300 ${opacity}`}>
                                                                                            <div className="relative w-10 h-1.5 flex items-center overflow-hidden rounded-l">
                                                                                                <div className={`absolute inset-0 transition-colors duration-300 ${lineBg}`}></div>
                                                                                                <div className={`absolute inset-0 w-full transition-all duration-300 ${gradientClass}`}></div>
                                                                                            </div>
                                                                                            <ChevronRight className={`-ml-2 w-6 h-6 stroke-[4] drop-shadow-md relative z-10 transition-all duration-300 ${chevronClass}`} />
                                                                                        </div>
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {bottomRow.length > 0 && (
                                                                <div className="relative">
                                                                    <div className="absolute -left-2 top-1/2 -translate-y-1/2 bg-slate-500 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider shadow z-10">B</div>
                                                                    <div className="flex items-center gap-6 pl-8">
                                                                        {bottomRow.map((st, i) => (
                                                                            <div key={`lineB-${st.id}`} className="flex items-center gap-6">
                                                                                <div id={`station-card-${st.id}`} className={`relative group transition-transform hover:scale-[1.02] shadow-sm hover:shadow-xl rounded-xl border-t-4 ${borderClass}`}>
                                                                                    {renderStationCard(st)}
                                                                                </div>
                                                                                {i < bottomRow.length - 1 && (() => {
                                                                                    const isOutgoing = hoveredStationIndex === bottomRow[i].index;
                                                                                    const isIncoming = hoveredStationIndex === bottomRow[i+1].index;
                                                                                    const isAnyHovered = hoveredStationIndex !== null;
                                                                                    
                                                                                    let lineBg = 'bg-slate-200/40';
                                                                                    let gradientClass = 'bg-gradient-to-r from-transparent via-slate-400 to-transparent animate-[pulse_1.5s_ease-in-out_infinite_0.3s]';
                                                                                    let chevronClass = 'text-slate-400 animate-[pulse_1.5s_ease-in-out_infinite_0.3s]';
                                                                                    let opacity = 'opacity-80';
                                                                                    
                                                                                    if (isAnyHovered) {
                                                                                        if (isOutgoing) {
                                                                                            lineBg = 'bg-sky-200/40';
                                                                                            gradientClass = 'bg-sky-400';
                                                                                            chevronClass = 'text-sky-500 scale-110 stroke-[5]';
                                                                                            opacity = 'opacity-100';
                                                                                        } else if (isIncoming) {
                                                                                            lineBg = 'bg-amber-200/40';
                                                                                            gradientClass = 'bg-amber-400';
                                                                                            chevronClass = 'text-amber-500 scale-110 stroke-[5]';
                                                                                            opacity = 'opacity-100';
                                                                                        } else {
                                                                                            opacity = 'opacity-20';
                                                                                        }
                                                                                    }
                                                                                    return (
                                                                                        <div className={`flex items-center text-slate-400 shrink-0 transition-all duration-300 ${opacity}`}>
                                                                                            <div className="relative w-10 h-1.5 flex items-center overflow-hidden rounded-l">
                                                                                                <div className={`absolute inset-0 transition-colors duration-300 ${lineBg}`}></div>
                                                                                                <div className={`absolute inset-0 w-full transition-all duration-300 ${gradientClass}`}></div>
                                                                                            </div>
                                                                                            <ChevronRight className={`-ml-2 w-6 h-6 stroke-[4] drop-shadow-md relative z-10 transition-all duration-300 ${chevronClass}`} />
                                                                                        </div>
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            
                                            {/* EXPÉDITION */}
                                            <div className="flex justify-end w-full mt-8 pr-4">
                                                <div className="flex items-center gap-4 bg-slate-800 text-white px-8 py-4 rounded-2xl shadow-2xl border border-white/20 hover:scale-105 transition-transform">
                                                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg"><Truck className="w-6 h-6 animate-pulse" /></div>
                                                    <div className="flex flex-col"><span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Terminé</span><span className="text-sm font-black uppercase tracking-widest">EXPÉDITION</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            </div>
                        </div>

                        {/* FLOATING MATERIAL PANEL */}
                        {showMaterialsPanel && (
                            <div className="fixed z-[5010] bg-slate-50 rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col" style={{ left: matPanel.x, top: matPanel.y, width: matPanel.w, height: matPanel.h }}>
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
                </div>{/* End of Animated Inner Container */}

                {/* Fullscreen Close Button */}
                {isFullScreen && (
                    <button
                        onClick={toggleFullScreen}
                        className="absolute top-6 right-6 z-50 p-3 bg-white/60 backdrop-blur-xl rounded-full shadow-lg border border-slate-200/50 text-slate-500 hover:text-rose-600 hover:bg-white hover:scale-110 active:scale-95 transition-all duration-300 animate-in slide-in-from-top-8 fade-in"
                        title="Quitter plein écran (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

            {sectionTransferDialog && createPortal(
                <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        onClick={() => resolveSectionTransferDialog('cancel')}
                    />
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Changement de catégorie poste</h3>
                            <p className="text-xs text-slate-500 mt-1">
                                Poste <span className="font-bold text-slate-700">{sectionTransferDialog.posteName}</span> :
                                <span className="font-bold"> {SECTION_LABELS[sectionTransferDialog.source]}</span> vers
                                <span className="font-bold"> {SECTION_LABELS[sectionTransferDialog.target]}</span>.
                            </p>
                        </div>

                        <div className="px-5 py-4 space-y-3">
                            {sectionTransferDialog.mode === 'confirm-transfer' ? (
                                <p className="text-sm text-slate-600">
                                    Voulez-vous déplacer ce poste et reclasser ses opérations en
                                    <span className="font-bold"> {SECTION_LABELS[sectionTransferDialog.target]}</span> ?
                                </p>
                            ) : (
                                <p className="text-sm text-slate-600">
                                    Ce poste touche une zone commune. Choisissez comment il doit etre comptabilise.
                                </p>
                            )}
                        </div>

                        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-2 justify-end">
                            <button
                                onClick={() => resolveSectionTransferDialog('cancel')}
                                className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 bg-white hover:bg-slate-100"
                            >
                                Annuler
                            </button>

                            {sectionTransferDialog.mode === 'global-choice' ? (
                                <>
                                    <button
                                        onClick={() => resolveSectionTransferDialog('keep-global')}
                                        className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 bg-white hover:bg-slate-100"
                                    >
                                        Garder Zone Commune
                                    </button>
                                    <button
                                        onClick={() => resolveSectionTransferDialog('set-prep')}
                                        className="px-3 py-2 rounded-lg text-xs font-bold border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
                                    >
                                        Classer Prepa
                                    </button>
                                    <button
                                        onClick={() => resolveSectionTransferDialog('set-montage')}
                                        className="px-3 py-2 rounded-lg text-xs font-bold border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100"
                                    >
                                        Classer Montage
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => resolveSectionTransferDialog('confirm-target')}
                                    className="px-3 py-2 rounded-lg text-xs font-bold border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                                >
                                    OK deplacer
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ... (Existing Edit Modal & Context Menu Portals - no changes needed there) ... */}
            {editModal && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* BACKDROP */}
                    <div className="absolute inset-0 bg-slate-900/60 " onClick={closeEditModal} />
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
                    <div className="absolute inset-0 bg-slate-900/60 " onClick={() => setShowSaveTemplateModal(false)} />
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

            {printOrientationModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-slate-900/60 " onClick={() => setPrintOrientationModal(false)} />
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 z-[1001]">
                        <h3 className="font-bold text-slate-800 text-lg mb-2">Orientation de l'Impression</h3>
                        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                            Choisissez le format d'orientation pour l'exportation du plan d'implantation en PDF / Impression A4 :
                        </p>
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={() => {
                                    setPrintOrientationModal(false);
                                    printPlanTable('landscape');
                                }} 
                                className="w-full py-3 px-4 rounded-xl border-2 border-indigo-100 bg-indigo-50/50 text-indigo-700 font-bold hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-xs flex items-center justify-between"
                            >
                                <span className="flex flex-col items-start text-left">
                                    <span className="font-black text-sm">Paysage (Horizontal)</span>
                                    <span className="text-[10px] text-indigo-500 font-normal mt-0.5">Idéal pour les tables de montage face-à-face (côté-à-côté)</span>
                                </span>
                                <Printer className="w-4 h-4 opacity-70 shrink-0" />
                            </button>
                            <button 
                                onClick={() => {
                                    setPrintOrientationModal(false);
                                    printPlanTable('portrait');
                                }} 
                                className="w-full py-3 px-4 rounded-xl border-2 border-slate-100 bg-slate-50/50 text-slate-700 font-bold hover:bg-slate-50 hover:border-slate-200 transition-colors text-xs flex items-center justify-between"
                            >
                                <span className="flex flex-col items-start text-left">
                                    <span className="font-black text-sm">Portrait (Vertical)</span>
                                    <span className="text-[10px] text-slate-500 font-normal mt-0.5">Idéal pour une liste de postes linéaire simple</span>
                                </span>
                                <Printer className="w-4 h-4 opacity-70 shrink-0" />
                            </button>
                            <button 
                                onClick={() => setPrintOrientationModal(false)} 
                                className="w-full py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors text-xs mt-2"
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showLoadTemplateModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 " onClick={() => setShowLoadTemplateModal(false)} />
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

            {showExportOptions && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowExportOptions(false)} />
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100 p-6 flex flex-col">
                        <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100">
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                <Printer className="w-5 h-5 text-indigo-600" />
                                Options d'export PDF
                            </h3>
                            <button onClick={() => setShowExportOptions(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* Format de page */}
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2.5">Format de page</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setExportSettings({ ...exportSettings, pageSize: 'single' })}
                                        className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5 text-center ${
                                            exportSettings.pageSize === 'single'
                                                ? 'border-indigo-600 bg-indigo-50/30 text-indigo-700 font-bold'
                                                : 'border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <span className="text-xs font-bold">Plan Continu</span>
                                        <span className="text-[10px] text-slate-400 font-medium leading-tight">Page unique ajustée au plan</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setExportSettings({ ...exportSettings, pageSize: 'a4' })}
                                        className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5 text-center ${
                                            exportSettings.pageSize === 'a4'
                                                ? 'border-indigo-600 bg-indigo-50/30 text-indigo-700 font-bold'
                                                : 'border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <span className="text-xs font-bold">Format A4</span>
                                        <span className="text-[10px] text-slate-400 font-medium leading-tight">Mise en page découpée A4</span>
                                    </button>
                                </div>
                            </div>

                            {/* Contenu à inclure */}
                            <div className="space-y-4">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Contenu à inclure</label>
                                
                                <label className="flex items-start gap-3 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={exportSettings.header}
                                        onChange={(e) => setExportSettings({ ...exportSettings, header: e.target.checked })}
                                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-slate-700">En-tête de document</span>
                                        <span className="text-[10px] text-slate-400">Nom du modèle, logo et date de génération</span>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={exportSettings.stats}
                                        onChange={(e) => setExportSettings({ ...exportSettings, stats: e.target.checked })}
                                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-slate-700">Statistiques globales</span>
                                        <span className="text-[10px] text-slate-400">Nombre d'opérateurs, temps de cycle, et rendement cible</span>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={exportSettings.machines}
                                        onChange={(e) => setExportSettings({ ...exportSettings, machines: e.target.checked })}
                                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-slate-700">Résumé matériel / machines</span>
                                        <span className="text-[10px] text-slate-400">Liste récapitulative de toutes les machines requises</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                type="button"
                                onClick={() => setShowExportOptions(false)}
                                className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors text-xs"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={executeExport}
                                disabled={isExporting}
                                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-colors text-xs flex items-center justify-center gap-1.5"
                            >
                                {isExporting ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Génération...
                                    </>
                                ) : (
                                    <>
                                        <Printer className="w-3.5 h-3.5" />
                                        Exporter le PDF
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
