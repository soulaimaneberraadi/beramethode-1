import React, { useRef, useState, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Calendar,
    User,
    Tag,
    Layers,
    Plus,
    Trash2,
    Edit,
    Grid3X3,
    ChevronDown,
    LayoutGrid,
    AlertTriangle,
    CheckCircle,
    Clock,
    Hash
} from 'lucide-react';
import { FicheData, AppSettings, PlanningEvent } from '../types';
import DateTimePicker from './ui/DateTimePicker';
import ExcelInput from './ExcelInput';
import RepartitionMatrix from './RepartitionMatrix';

const LAUNCH_HOUR_OPTS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const LAUNCH_MINUTE_OPTS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const PEDIDO_LABELS = {
    fr: {
        identification: 'Identification de la Commande',
        client: 'Client',
        clientPlaceholder: 'Nom du Client',
        modelRef: 'Modèle / Réf',
        modelPlaceholder: 'Référence Modèle',
        category: 'Catégorie',
        optional: 'facultatif',
        categoryPlaceholder: 'Famille produit (ex. T-Shirt)',
        categoryHelp: 'Laisse vide si besoin : tu peux passer aux étapes suivantes et enregistrer sans catégorie.',
        launchTitle: 'Date & heure de lancement',
        chooseDate: 'Choisir une date',
        pickLaunchTime: 'Choisir l’heure de lancement',
        timePickerDialog: 'Grille heure et minutes',
        hoursHeading: 'Heures (24h)',
        minutesHeading: 'Minutes',
        badge24h: '24h',
        launchHelp: 'Heure en 24 h — alignée avec le Planning et le Suivi à l’enregistrement du modèle.',
    },
    ar: {
        identification: 'تعريف الطلبية',
        client: 'العميل',
        clientPlaceholder: 'اسم العميل',
        modelRef: 'الموديل / المرجع',
        modelPlaceholder: 'مرجع الموديل',
        category: 'الفئة',
        optional: 'اختياري',
        categoryPlaceholder: 'عائلة المنتج (مثال: T-Shirt)',
        categoryHelp: 'يمكن تركه فارغًا: المتابعة إلى المراحل التالية والحفظ دون فئة.',
        launchTitle: 'تاريخ ووقت الانطلاق',
        chooseDate: 'اختر تاريخًا',
        pickLaunchTime: 'اختر وقت الانطلاق',
        timePickerDialog: 'جدول الساعات والدقائق',
        hoursHeading: 'ساعات (24)',
        minutesHeading: 'دقائق',
        badge24h: '24',
        launchHelp: 'توقيت 24 ساعة — يتوافق مع التخطيط والمتابعة عند حفظ النموذج.',
    },
} as const;

interface PedidoProps {
    data: FicheData;
    setData: React.Dispatch<React.SetStateAction<FicheData>>;
    articleName: string;
    setArticleName: (name: string) => void;
    lang?: 'fr' | 'ar';
    articleNameError?: boolean;
    settings: AppSettings;
    currentModelId?: string | null;
    planningEvents?: PlanningEvent[];
    setPlanningEvents?: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
}

export default function Pedido({
    data,
    setData,
    articleName,
    setArticleName,
    lang = 'fr',
    articleNameError,
    settings,
    currentModelId = null,
    planningEvents = [],
    setPlanningEvents,
}: PedidoProps) {
    const pt = PEDIDO_LABELS[lang];

    const modelEvents = useMemo(() => {
        if (!planningEvents) return [];
        return planningEvents.filter(e => {
            if (currentModelId && e.modelId === currentModelId) return true;
            if (articleName && e.modelName && e.modelName.toLowerCase().includes(articleName.toLowerCase())) return true;
            return false;
        });
    }, [planningEvents, currentModelId, articleName]);

    /** Prochain code de lot auto-incrémenté (L1 → L2 → … → Ln+1) selon les lots existants du modèle. */
    const nextLotCode = useMemo(() => {
        let max = 0;
        modelEvents.forEach(e => {
            const name = e.modelName || '';
            const suffix = name.includes(' — ') ? name.split(' — ').slice(1).join(' — ') : name;
            const m = suffix.trim().match(/^L\s*(\d+)/i);
            if (m) max = Math.max(max, parseInt(m[1], 10));
        });
        return `L${max + 1}`;
    }, [modelEvents]);

    const getStatusMeta = (status: string | undefined) => {
        if (status === 'EXTERNAL_PROCESS') {
            return {
                label: lang === 'ar' ? 'عملية خارجية' : 'Proc. Externe',
                dot: 'bg-amber-500',
                text: 'text-amber-700',
                bg: 'bg-amber-50',
                border: 'border-amber-200'
            };
        }
        if (status === 'BLOCKED_STOCK') {
            return {
                label: lang === 'ar' ? 'متوقف / حابس' : 'Bloqué stock',
                dot: 'bg-red-500',
                text: 'text-red-700',
                bg: 'bg-red-50',
                border: 'border-red-200'
            };
        }
        const s = status === 'DONE' ? 'DONE' : status === 'BLOCKED_STOCK' ? 'BLOCKED' : (status === 'IN_PROGRESS' || status === 'ON_TRACK' || status === 'AT_RISK' || status === 'OFF_TRACK') ? 'IN_PROGRESS' : 'READY';
        const meta = {
            READY: { label: lang === 'ar' ? 'جاهز' : 'Prêt', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
            BLOCKED: { label: lang === 'ar' ? 'متوقف' : 'Bloqué', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
            IN_PROGRESS: { label: lang === 'ar' ? 'في طور الإنجاز' : 'En cours', dot: 'bg-[#2149C1]', text: 'text-[#1a3ba5]', bg: 'bg-blue-50', border: 'border-blue-200' },
            DONE: { label: lang === 'ar' ? 'مكتمل' : 'Terminé', dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
        };
        return meta[s] || meta.READY;
    };

    // -- INLINE CLIENT SPLITS EDITOR STATES & HANDLERS --
    const [editingEventId, setEditingEventId] = useState<string | 'new' | null>(null);
    const [editDraft, setEditDraft] = useState<Partial<PlanningEvent> | null>(null);

    const startEditNew = () => {
        const initialDist: Record<string, Record<string, number>> = {};
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                initialDist[c.id] = {};
                sizes.forEach(s => {
                    if (s.toLowerCase() !== 'total') {
                        initialDist[c.id][s] = 0;
                    }
                });
            }
        });

        const today = new Date().toISOString().split('T')[0];
        setEditDraft({
            id: `PE-${Date.now()}`,
            modelId: currentModelId || '',
            chaineId: 'CHAINE 1',
            dateLancement: today,
            dateExport: today,
            strictDeadline_DDS: today,
            startDate: today,
            clientName: data.client || '',
            status: 'READY',
            sizeColorDistribution: initialDist,
            qteTotal: 0,
            modelName: `${articleName || ''} — ${nextLotCode}`
        });
        setEditingEventId('new');
    };

    const startEditExisting = (evt: PlanningEvent) => {
        setEditDraft({ ...evt });
        setEditingEventId(evt.id);
    };

    const deleteEvent = (eventId: string) => {
        const confirmMsg = lang === 'ar' 
            ? 'هل أنت متأكد من رغبتك في حذف هذه الدفعة؟ سيتم إزالتها من جدول التخطيط أيضاً.' 
            : 'Êtes-vous sûr de vouloir supprimer ce lot ? Il sera également retiré du planning.';
        if (window.confirm(confirmMsg)) {
            if (setPlanningEvents) {
                setPlanningEvents(prev => prev.filter(e => e.id !== eventId));
            }
        }
    };

    const handleSaveEdit = () => {
        if (!editDraft || !setPlanningEvents) return;
        
        const fullName = editDraft.modelName || '';
        const parts = fullName.split(' — ');
        const suffix = parts.length > 1 ? parts.slice(1).join(' — ').trim() : fullName.trim();
        
        if (!suffix) {
            alert(lang === 'ar' ? 'يرجى إدخال رمز أو اسم الدفعة (مثال: L1)' : 'Veuillez saisir un libellé ou suffixe pour le lot (ex: L1).');
            return;
        }

        let calculatedTotal = 0;
        if (editDraft.sizeColorDistribution) {
            Object.values(editDraft.sizeColorDistribution).forEach(sizeMap => {
                Object.values(sizeMap).forEach(qty => {
                    calculatedTotal += Number(qty) || 0;
                });
            });
        } else {
            calculatedTotal = editDraft.qteTotal || 0;
        }
        
        const finalDraft: PlanningEvent = {
            ...editDraft,
            modelId: editDraft.modelId || currentModelId || '',
            modelName: `${articleName || ''} — ${suffix}`,
            qteTotal: calculatedTotal,
            totalQuantity: calculatedTotal,
            startDate: editDraft.dateLancement,
            strictDeadline_DDS: editDraft.dateExport,
        } as PlanningEvent;

        setPlanningEvents(prev => {
            const exists = prev.some(e => e.id === finalDraft.id);
            if (exists) {
                return prev.map(e => e.id === finalDraft.id ? finalDraft : e);
            } else {
                return [...prev, finalDraft];
            }
        });

        setEditingEventId(null);
        setEditDraft(null);
    };

    const handleCancelEdit = () => {
        setEditingEventId(null);
        setEditDraft(null);
    };

    // -- MATRIX STATE (lecture seule ici ; l'édition se fait via <RepartitionMatrix />) --
    const sizes = data.sizes || [];
    const colors = data.colors || [];
    const gridQuantities = data.gridQuantities || {};

    const matrixStats = useMemo(() => {
        const rowTotals: Record<string, number> = {};
        const colTotals: Record<number, number> = {};
        let grandTotal = 0;

        colors.forEach(c => {
            rowTotals[c.id] = 0;
            sizes.forEach((_, sIdx) => {
                const key = `${c.id}_${sIdx}`;
                const val = gridQuantities[key] || 0;
                rowTotals[c.id] += val;
                colTotals[sIdx] = (colTotals[sIdx] || 0) + val;
                grandTotal += val;
            });
        });

        return { rowTotals, colTotals, grandTotal };
    }, [sizes, colors, gridQuantities]);

    // Update Global Quantity when matrix changes
    useEffect(() => {
        if (matrixStats.grandTotal > 0) {
            setData(prev => ({ ...prev, quantity: matrixStats.grandTotal }));
        }
    }, [matrixStats.grandTotal, setData]);

    const planifiedTotals = useMemo(() => {
        const totals: Record<string, Record<string, number>> = {};
        
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                totals[c.id] = {};
                sizes.forEach(s => {
                    if (s.toLowerCase() !== 'total') {
                        totals[c.id][s] = 0;
                    }
                });
            }
        });

        modelEvents.forEach(evt => {
            const isEditingThis = evt.id === editingEventId;
            const dist = isEditingThis && editDraft ? editDraft.sizeColorDistribution : evt.sizeColorDistribution;
            if (dist) {
                Object.keys(dist).forEach(colorId => {
                    const sizeMap = dist[colorId];
                    if (sizeMap) {
                        Object.keys(sizeMap).forEach(sizeName => {
                            const qty = Number(sizeMap[sizeName]) || 0;
                            if (totals[colorId] && totals[colorId][sizeName] !== undefined) {
                                totals[colorId][sizeName] += qty;
                            }
                        });
                    }
                });
            }
        });

        if (editingEventId === 'new' && editDraft && editDraft.sizeColorDistribution) {
            const dist = editDraft.sizeColorDistribution;
            Object.keys(dist).forEach(colorId => {
                const sizeMap = dist[colorId];
                if (sizeMap) {
                    Object.keys(sizeMap).forEach(sizeName => {
                        const qty = Number(sizeMap[sizeName]) || 0;
                        if (totals[colorId] && totals[colorId][sizeName] !== undefined) {
                            totals[colorId][sizeName] += qty;
                        }
                    });
                }
            });
        }

        return totals;
    }, [modelEvents, editingEventId, editDraft, colors, sizes]);

    const reconciliationDiscrepancies = useMemo(() => {
        let hasErrors = false;
        const diffs: Record<string, Record<string, number>> = {};
        
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                diffs[c.id] = {};
                sizes.forEach((s, sIdx) => {
                    if (s.toLowerCase() !== 'total') {
                        const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                        const plannedVal = planifiedTotals[c.id]?.[s] || 0;
                        const diff = plannedVal - targetVal;
                        diffs[c.id][s] = diff;
                        if (diff !== 0) {
                            hasErrors = true;
                        }
                    }
                });
            }
        });

        return { hasErrors, diffs };
    }, [colors, sizes, gridQuantities, planifiedTotals]);

    const planifiedTotalsExcludingCurrent = useMemo(() => {
        const totals: Record<string, Record<string, number>> = {};
        
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                totals[c.id] = {};
                sizes.forEach(s => {
                    if (s.toLowerCase() !== 'total') {
                        totals[c.id][s] = 0;
                    }
                });
            }
        });

        modelEvents.forEach(evt => {
            if (evt.id === editingEventId) return;
            const dist = evt.sizeColorDistribution;
            if (dist) {
                Object.keys(dist).forEach(colorId => {
                    const sizeMap = dist[colorId];
                    if (sizeMap) {
                        Object.keys(sizeMap).forEach(sizeName => {
                            const qty = Number(sizeMap[sizeName]) || 0;
                            if (totals[colorId] && totals[colorId][sizeName] !== undefined) {
                                totals[colorId][sizeName] += qty;
                            }
                        });
                    }
                });
            }
        });

        return totals;
    }, [modelEvents, editingEventId, colors, sizes]);

    const totalCible = useMemo(() => {
        return matrixStats.grandTotal || data.quantity || 0;
    }, [matrixStats.grandTotal, data.quantity]);

    const totalPlanified = useMemo(() => {
        return modelEvents.reduce((sum, e) => sum + (e.qteTotal || e.totalQuantity || 0), 0);
    }, [modelEvents]);

    const totalProduced = useMemo(() => {
        return modelEvents.reduce((sum, e) => sum + (e.qteProduite || e.producedQuantity || 0), 0);
    }, [modelEvents]);

    const plannedCoverPct = useMemo(() => {
        if (totalCible <= 0) return 0;
        return Math.round((totalPlanified / totalCible) * 100);
    }, [totalPlanified, totalCible]);

    const globalCompletionPct = useMemo(() => {
        if (totalCible <= 0) return 0;
        return Math.round((totalProduced / totalCible) * 100);
    }, [totalProduced, totalCible]);

    const handleChange = (field: keyof FicheData, value: any) => {
        setData(prev => ({ ...prev, [field]: value }));
    };

    const launchHM = useMemo(() => {
        const raw = (data.launchTime ?? '08:00').trim();
        const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
        if (!m) return { h: '08', min: '00' };
        const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
        const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
        return { h: String(h).padStart(2, '0'), min: String(min).padStart(2, '0') };
    }, [data.launchTime]);

    const [launchTimeOpen, setLaunchTimeOpen] = useState(false);
    const [launchPopPos, setLaunchPopPos] = useState({ top: 0, left: 0, width: 280 });
    const launchTimePickerRef = useRef<HTMLDivElement>(null);
    const launchTimeBtnRef = useRef<HTMLButtonElement>(null);
    const launchTimePopRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!launchTimeOpen || !launchTimeBtnRef.current) return;
        const update = () => {
            const el = launchTimeBtnRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const w = 320;
            let left = r.left + (r.width - w) / 2;
            if (left < 12) left = 12;
            if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
            setLaunchPopPos({ top: r.bottom + 8, left, width: w });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [launchTimeOpen]);

    useEffect(() => {
        if (!launchTimeOpen) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (launchTimePickerRef.current?.contains(t)) return;
            if (launchTimePopRef.current?.contains(t)) return;
            setLaunchTimeOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setLaunchTimeOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [launchTimeOpen]);


    const renderEditorForm = () => {
        if (!editDraft) return null;
        
        const fullName = editDraft.modelName || '';
        const parts = fullName.split(' — ');
        const suffix = parts.length > 1 ? parts.slice(1).join(' — ') : '';
        
        const filteredSizes = (sizes || []).filter(s => s.toLowerCase() !== 'total');
        const filteredColors = (colors || []).filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total');
        const hasGrid = filteredSizes.length > 0 && filteredColors.length > 0;

        return (
            <div className="border-2 border-indigo-500/30 rounded-xl p-5 bg-indigo-50/10 space-y-5 animate-in fade-in duration-200 shadow-md">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h4 className="font-black text-sm text-indigo-900 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        {editingEventId === 'new' 
                            ? (lang === 'ar' ? 'إضافة دفعة تسليم جديدة' : 'Nouveau lot de livraison')
                            : (lang === 'ar' ? 'تعديل دفعة التسليم' : 'Modifier le lot de livraison')
                        }
                    </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Client name */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {lang === 'ar' ? 'العميل' : 'Client'}
                        </label>
                        <input
                            type="text"
                            value={editDraft.clientName || ''}
                            onChange={(e) => setEditDraft(prev => prev ? { ...prev, clientName: e.target.value } : prev)}
                            placeholder={lang === 'ar' ? 'اسم العميل' : 'Nom du Client'}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-sans"
                        />
                    </div>

                    {/* Suffix / Lot Code */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {lang === 'ar' ? 'رمز / اسم الدفعة (مثال: L1)' : 'Code / Libellé du lot (ex: L1)'}
                        </label>
                        <input
                            type="text"
                            value={suffix}
                            onChange={(e) => setEditDraft(prev => prev ? { ...prev, modelName: `${articleName || ''} — ${e.target.value}` } : prev)}
                            placeholder="L1"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                        />
                    </div>

                    {/* Delivery Date / DDS */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {lang === 'ar' ? 'تاريخ التسليم (DDS)' : 'Date de livraison (DDS)'}
                        </label>
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                            <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                            <DateTimePicker
                                value={editDraft.dateExport || ''}
                                onChange={(iso) => setEditDraft(prev => prev ? { 
                                    ...prev, 
                                    dateExport: iso.split('T')[0], 
                                    strictDeadline_DDS: iso.split('T')[0],
                                    dateLancement: iso.split('T')[0],
                                    startDate: iso.split('T')[0]
                                } : prev)}
                                mode="date"
                                settings={settings}
                                inputClassName="w-full min-w-0 border-0 bg-transparent shadow-none text-sm font-bold text-slate-700 outline-none focus:ring-0 py-0 px-0 font-mono"
                                showIcon={false}
                            />
                        </div>
                    </div>
                </div>

                {/* Size Color distribution grid */}
                {hasGrid ? (
                    <div className="space-y-2">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 font-sans">
                            <Grid3X3 className="w-3.5 h-3.5" />
                            {lang === 'ar' ? 'التوزيع بالتفصيل للدفعة' : 'Répartition des quantités du lot'}
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold">
                                        <th className="py-2.5 px-3 text-left border-r border-slate-100 min-w-[120px]">Couleur / Taille</th>
                                        {filteredSizes.map((s, i) => (
                                            <th key={i} className="py-2 px-2 text-center border-r border-slate-100 min-w-[60px]">
                                                {s}
                                            </th>
                                        ))}
                                        <th className="py-2 px-3 text-center bg-indigo-50/50 text-indigo-800 w-20">TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredColors.map((c, cIdx) => {
                                        let rowTotal = 0;
                                        return (
                                            <tr key={`${c.id}-${cIdx}`} className="hover:bg-slate-50/30">
                                                <td className="py-2 px-3 border-r border-slate-100 font-semibold text-slate-700 flex items-center gap-2">
                                                    <div
                                                        className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                        style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                    />
                                                    <span className="truncate max-w-[100px]" title={c.name}>{c.name}</span>
                                                </td>
                                                {filteredSizes.map((s) => {
                                                    const qty = editDraft.sizeColorDistribution?.[c.id]?.[s] ?? 0;
                                                    rowTotal += qty;
                                                    
                                                    const sIdx = sizes.indexOf(s);
                                                    const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                                                    const otherVal = planifiedTotalsExcludingCurrent[c.id]?.[s] || 0;
                                                    const totalVal = otherVal + qty;
                                                    const diff = totalVal - targetVal;
                                                    
                                                    return (
                                                        <td key={s} className="py-2 px-1.5 text-center border-r border-slate-100 align-top">
                                                            <div className="flex flex-col items-center gap-1">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={qty || ''}
                                                                    onChange={(e) => {
                                                                        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                                                        setEditDraft(prev => {
                                                                            if (!prev) return prev;
                                                                            const dist = { ...prev.sizeColorDistribution };
                                                                            if (!dist[c.id]) dist[c.id] = {};
                                                                            dist[c.id] = { ...dist[c.id], [s]: val };
                                                                            return { ...prev, sizeColorDistribution: dist };
                                                                        });
                                                                    }}
                                                                    className={`w-14 text-center border rounded-lg py-1 font-mono text-xs font-semibold focus:ring-2 transition-all outline-none ${
                                                                        diff !== 0 
                                                                            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100 bg-rose-50/20 text-rose-700' 
                                                                            : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-100 text-slate-800'
                                                                    }`}
                                                                    placeholder="0"
                                                                />
                                                                <div className="flex flex-col items-center text-[9px] font-mono leading-none">
                                                                    <span className="text-slate-400">/{targetVal}</span>
                                                                    {diff !== 0 ? (
                                                                        <span className="text-rose-600 font-bold mt-0.5" title={diff > 0 ? `${diff} de trop` : `${diff} manquant`}>
                                                                            {diff > 0 ? `+${diff}` : diff}
                                                                        </span>
                                                                    ) : (
                                                                        qty > 0 && <span className="text-emerald-600 font-bold mt-0.5">✓</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                                <td className="py-2 px-3 text-center font-mono font-bold bg-slate-50/50 text-slate-700">
                                                    {rowTotal}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1 max-w-xs">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {lang === 'ar' ? 'الكمية الإجمالية' : 'Quantité totale'}
                        </label>
                        <input
                            type="number"
                            min="0"
                            value={editDraft.qteTotal || ''}
                            onChange={(e) => setEditDraft(prev => prev ? { ...prev, qteTotal: Math.max(0, parseInt(e.target.value, 10) || 0) } : prev)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                        />
                    </div>
                )}

                {/* Form Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <div className="text-xs text-slate-400 font-bold">
                        {lang === 'ar' ? 'المجموع المحسوب:' : 'Total calculé:'} {' '}
                        <span className="text-indigo-600 font-black font-mono">
                            {hasGrid 
                                ? Object.values(editDraft.sizeColorDistribution || {}).reduce(
                                    (sum, sizeMap) => sum + Object.values(sizeMap).reduce((s, val) => s + (val || 0), 0), 
                                    0
                                  )
                                : (editDraft.qteTotal || 0)
                            } pcs
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {editingEventId !== 'new' && (
                            <button
                                type="button"
                                onClick={() => deleteEvent(editDraft.id || '')}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 font-black px-4 py-2 rounded-xl text-xs transition-all border border-rose-150 flex items-center gap-1"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                {lang === 'ar' ? 'حذف' : 'Supprimer'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2 rounded-xl text-xs transition-all"
                        >
                            {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-5 py-2 rounded-xl text-xs transition-all shadow-md flex items-center gap-1"
                        >
                            {lang === 'ar' ? 'حفظ الدفعة' : 'Enregistrer'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-2 duration-300 relative">
            
            {/* INDUSTRIAL DASHBOARD OVERVIEW */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide">
                            {lang === 'ar' ? 'لوحة تتبع الطلبية (Pedido)' : 'Tableau de Bord Suivi Commande (Pedido)'}
                        </h3>
                    </div>
                    <div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${
                            totalPlanified === totalCible && totalCible > 0
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                            {totalPlanified === totalCible && totalCible > 0
                                ? (lang === 'ar' ? 'تغطية كاملة 100%' : 'Plan Alignée 100%')
                                : (lang === 'ar' ? `التغطية: ${plannedCoverPct}%` : `Couverture : ${plannedCoverPct}%`)
                            }
                        </span>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    {/* 3 KPI cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* CARD 1: Cible Commandé */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 flex items-center justify-between shadow-sm">
                            <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                                    {lang === 'ar' ? 'إجمالي الطلب الأصلي' : 'Total Commandé (Cible)'}
                                </span>
                                <span className="text-lg font-black text-slate-700 font-mono block">
                                    {totalCible.toLocaleString()} <span className="text-xs font-bold text-slate-400">pcs</span>
                                </span>
                            </div>
                            <div className="bg-indigo-50 p-2.5 rounded-xl border border-indigo-100 text-indigo-500">
                                <Grid3X3 className="w-4 h-4" />
                            </div>
                        </div>

                        {/* CARD 2: Planifié */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 flex items-center justify-between shadow-sm">
                            <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                                    {lang === 'ar' ? 'الكمية المخططة' : 'Total Planifié (Lots)'}
                                </span>
                                <span className="text-lg font-black text-slate-700 font-mono block">
                                    {totalPlanified.toLocaleString()} <span className="text-xs font-bold text-slate-400">pcs</span>
                                </span>
                                <span className="text-[9px] block font-semibold leading-none">
                                    {totalPlanified === totalCible
                                        ? <span className="text-emerald-600 font-bold">✓ {lang === 'ar' ? 'مطابق' : 'Aligné'}</span>
                                        : <span className="text-amber-600 font-bold">{lang === 'ar' ? `فرق: ${totalPlanified - totalCible}` : `Écart : ${totalPlanified - totalCible}`}</span>
                                    }
                                </span>
                            </div>
                            <div className="bg-indigo-50 p-2.5 rounded-xl border border-indigo-100 text-indigo-500">
                                <Calendar className="w-4 h-4" />
                            </div>
                        </div>

                        {/* CARD 3: Réalisé */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 flex items-center justify-between shadow-sm">
                            <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                                    {lang === 'ar' ? 'الكمية المنتجة' : 'Total Produit (Réalisé)'}
                                </span>
                                <span className="text-lg font-black text-emerald-600 font-mono block">
                                    {totalProduced.toLocaleString()} <span className="text-xs font-bold text-emerald-400">pcs</span>
                                </span>
                                <span className="text-[9px] text-indigo-600 font-bold block leading-none">
                                    {globalCompletionPct}% {lang === 'ar' ? 'جاهز' : 'Prêt'}
                                </span>
                            </div>
                            <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100 text-emerald-600">
                                <CheckCircle className="w-4 h-4" />
                            </div>
                        </div>
                    </div>

                    {/* Overall progress bar */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                            <span>{lang === 'ar' ? 'نسبة تقدم إنجاز الطلبية' : 'Avancement de la commande globale'}</span>
                            <span className="font-mono text-emerald-600 font-black">{globalCompletionPct}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
                            <div
                                className="h-full bg-indigo-600 rounded-full transition-all duration-1000"
                                style={{ width: `${Math.min(100, globalCompletionPct)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* LEFT COLUMN: IDENTIFICATION & REPARTITION (8 Cols) */}
                <div className="lg:col-span-8 space-y-6">

                    {/* 1. GENERAL INFO CARD - ONLY DATE & HEURE DE LANCEMENT */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-indigo-500" />
                                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{pt.launchTitle}</h3>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="space-y-1">
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="flex flex-1 min-w-0 items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all">
                                        <div className="shrink-0 p-1.5 bg-white rounded-lg text-indigo-500 shadow-sm border border-indigo-100 pointer-events-none" aria-hidden>
                                            <Calendar className="w-4 h-4" />
                                        </div>
                                        <DateTimePicker
                                            value={data.date || ''}
                                            onChange={(iso) => handleChange('date', iso.split('T')[0])}
                                            mode="date"
                                            settings={settings}
                                            inputClassName="w-full min-w-0 border-0 bg-transparent shadow-none text-sm font-bold text-slate-700 outline-none focus:ring-0 py-0 px-0 font-mono"
                                            showIcon={false}
                                        />
                                    </div>
                                    <div
                                        ref={launchTimePickerRef}
                                        className={`relative flex flex-1 min-w-0 items-center gap-2 sm:gap-3 rounded-xl border bg-slate-50 px-3 py-2.5 shadow-sm transition ${launchTimeOpen ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}
                                    >
                                        <Clock className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                                        <div className="relative min-w-0 flex-1">
                                            <button
                                                ref={launchTimeBtnRef}
                                                type="button"
                                                aria-expanded={launchTimeOpen}
                                                aria-haspopup="dialog"
                                                aria-label={pt.pickLaunchTime}
                                                onClick={() => setLaunchTimeOpen((o) => !o)}
                                                className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-2 text-left shadow-sm outline-none transition hover:border-indigo-200 focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-100"
                                            >
                                                <span className="font-mono text-sm font-bold tracking-tight text-slate-800">
                                                    {launchHM.h}:{launchHM.min}
                                                </span>
                                                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${launchTimeOpen ? 'rotate-180' : ''}`} aria-hidden />
                                            </button>
                                        </div>
                                        <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:inline">{pt.badge24h}</span>
                                    </div>
                                </div>
                                {launchTimeOpen && createPortal(
                                    <div
                                        ref={launchTimePopRef}
                                        role="dialog"
                                        aria-label={pt.timePickerDialog}
                                        style={{
                                            position: 'fixed',
                                            top: launchPopPos.top,
                                            left: launchPopPos.left,
                                            width: Math.max(launchPopPos.width, 300),
                                            zIndex: 9999
                                        }}
                                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50 ring-1 ring-black/5"
                                    >
                                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
                                            <div>
                                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest font-sans">HEURE DE LANCEMENT</span>
                                            </div>
                                            <div className="font-mono text-lg font-black text-indigo-600 bg-white px-3 py-0.5 rounded-xl shadow-sm border border-indigo-100">
                                                {launchHM.h}:{launchHM.min}
                                            </div>
                                        </div>

                                        <div className="p-4 space-y-4">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5 font-sans">Saisie directe</label>
                                                <input
                                                    type="time"
                                                    step={300}
                                                    value={`${launchHM.h}:${launchHM.min}`}
                                                    onChange={(e) => handleChange('launchTime', e.target.value)}
                                                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 rounded-xl px-4 py-3 font-mono font-black text-2xl text-center text-slate-800 outline-none transition-colors"
                                                />
                                                <p className="text-[10px] text-slate-400 mt-1 text-center font-sans">Pas de 5 minutes</p>
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5 font-sans">Raccourcis</label>
                                                <div className="grid grid-cols-3 gap-1.5 font-sans">
                                                    {['06:00', '07:00', '08:00', '08:30', '09:00', '14:00'].map(t => {
                                                        const active = `${launchHM.h}:${launchHM.min}` === t;
                                                        return (
                                                            <button
                                                                key={t}
                                                                onClick={() => { handleChange('launchTime', t); setLaunchTimeOpen(false); }}
                                                                className={`py-2 text-xs font-mono font-bold rounded-lg transition-all ${active
                                                                    ? 'bg-indigo-600 text-white shadow'
                                                                    : 'bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700'}`}
                                                            >
                                                                {t}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-[10px] text-slate-400 py-2 px-4 border-t border-slate-100 bg-slate-50 font-sans">
                                            <span>Tab/flèches pour ajuster</span>
                                            <button
                                                onClick={() => setLaunchTimeOpen(false)}
                                                className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-500"
                                            >
                                                OK
                                            </button>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                                <p className="text-[10px] text-slate-500 mt-2">
                                    {pt.launchHelp}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 2. RÉPARTITION (TAILLES / COULEURS) CARD — composant partagé avec la Fiche Technique */}
                    <RepartitionMatrix data={data} setData={setData} lang={lang} syncQuantity={false} />

                </div>

                {/* RIGHT COLUMN: PLANIFIED LOTS & OFs (4 Cols) */}
                <div className="lg:col-span-4 space-y-6">

                    {/* 3. PLANIFIED ORDERS & LOTS CARD */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">
                        <div className="bg-indigo-50/50 px-6 py-3 border-b border-indigo-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-indigo-600" />
                                <h3 className="font-bold text-indigo-800 text-xs uppercase tracking-wide">
                                    {lang === 'ar' ? 'دفعات التسليم' : 'Lots & OFs Planifiés'}
                                </h3>
                            </div>
                            <div className="flex items-center gap-3">
                                {currentModelId && editingEventId === null && (
                                    <button
                                        type="button"
                                        onClick={startEditNew}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-sm"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {lang === 'ar' ? 'إضافة دفعة' : 'Ajouter un lot'}
                                    </button>
                                )}
                                <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full font-mono">
                                    {modelEvents.length}
                                </span>
                            </div>
                        </div>
                        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                            {!currentModelId && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-xs font-semibold flex items-center gap-2 font-sans">
                                    <Calendar className="w-5 h-5 text-amber-500 shrink-0" />
                                    <span>
                                        {lang === 'ar' ? 
                                            'يرجى حفظ النموذج أولاً لتتمكن من إضافة وتقسيم طلبيات هذا الموديل.' : 
                                            'Veuillez d\'abord enregistrer le modèle pour pouvoir planifier et diviser les commandes.'
                                        }
                                    </span>
                                </div>
                            )}

                            {currentModelId && editingEventId === 'new' && (
                                <div className="mb-6">
                                    {renderEditorForm()}
                                </div>
                            )}

                            {modelEvents.length === 0 ? (
                                editingEventId !== 'new' && (
                                    <div className="text-center py-12 text-slate-400 text-xs italic flex flex-col items-center justify-center gap-2 font-sans h-full">
                                        <Calendar className="w-8 h-8 text-slate-300" />
                                        <span>
                                            {lang === 'ar' ? 
                                                'لا توجد طلبيات أو دفعات تسليم مبرمجة لهذا الموديل حالياً في جدول التخطيط.' : 
                                                'Aucune commande ou lot de livraison planifié pour ce modèle actuellement dans le planning.'
                                            }
                                        </span>
                                    </div>
                                )
                            ) : (
                                modelEvents.map((evt) => {
                                    if (editingEventId === evt.id) {
                                        return (
                                            <div key={evt.id} className="mb-6">
                                                {renderEditorForm()}
                                            </div>
                                        );
                                    }

                                    const statusMeta = getStatusMeta(evt.status);
                                    const hasDistribution = evt.sizeColorDistribution && Object.keys(evt.sizeColorDistribution).length > 0;
                                    
                                    const filteredSizes = sizes.filter(s => s.toLowerCase() !== 'total');
                                    const filteredColors = colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total');

                                    return (
                                        <div key={evt.id} className="border border-slate-200/80 rounded-2xl p-5 bg-gradient-to-br from-white to-slate-50/30 hover:shadow-md hover:border-indigo-200/80 transition-all space-y-4 shadow-sm font-sans">
                                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-150/60 pb-3">
                                                <div className="space-y-0.5">
                                                    <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                                                        <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg text-xs font-black">OF</span>
                                                        <span className="text-slate-800 font-extrabold">{evt.modelName || articleName}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                                                        {statusMeta.label}
                                                    </span>
                                                    
                                                    <span className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-mono font-black text-xs px-3 py-1.5 rounded-xl shadow-sm">
                                                        {evt.qteTotal} pcs
                                                    </span>

                                                    {currentModelId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditExisting(evt)}
                                                            className="p-2 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all border border-indigo-150 bg-white shadow-sm flex items-center justify-center cursor-pointer"
                                                            title={lang === 'ar' ? 'تعديل الدفعة' : 'Modifier le lot'}
                                                        >
                                                            <Edit className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="bg-gradient-to-r from-indigo-50/40 via-indigo-50/10 to-slate-50/20 rounded-xl px-4 py-3 border border-indigo-100/50 flex items-center justify-between text-xs font-sans">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="bg-indigo-100/80 p-1.5 rounded-lg text-indigo-600">
                                                        <Calendar className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                                                            {lang === 'ar' ? 'تاريخ التسليم (DDS)' : 'Date de livraison (DDS)'}
                                                        </span>
                                                        <span className="font-bold text-slate-700 font-mono text-sm">
                                                            {evt.strictDeadline_DDS || evt.dateExport || '-'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                                                        {lang === 'ar' ? 'العميل' : 'Client'}
                                                    </span>
                                                    <span className="font-extrabold text-slate-700 bg-white px-2.5 py-0.5 rounded-md border border-slate-100 shadow-sm inline-block">
                                                        {evt.clientName || (evt as any).client || '-'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Lot production progress bar */}
                                            {(() => {
                                                const produced = evt.producedQuantity ?? evt.qteProduite ?? 0;
                                                const pct = evt.qteTotal > 0 ? Math.round((produced / evt.qteTotal) * 1000) / 10 : 0;
                                                return (
                                                    <div className="space-y-1 bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-xs font-sans">
                                                        <div className="flex items-center justify-between text-slate-500 font-bold">
                                                            <span>{lang === 'ar' ? 'تقدم إنتاج الدفعة:' : 'Production du lot :'}</span>
                                                            <span className="font-mono text-indigo-600 font-black">
                                                                {produced.toLocaleString()} / {evt.qteTotal.toLocaleString()} pcs ({pct}%)
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full bg-indigo-600 rounded-full transition-all duration-500" 
                                                                style={{ width: `${Math.min(100, pct)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {hasDistribution && (
                                                <div className="space-y-2">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                                        <Grid3X3 className="w-3.5 h-3.5 text-slate-400" />
                                                        {lang === 'ar' ? 'التوزيع بالتفصيل' : 'Répartition des quantités'}
                                                    </div>
                                                    <div className="overflow-x-auto rounded-xl border border-slate-150 bg-white">
                                                        <table className="w-full text-xs border-collapse">
                                                            <thead>
                                                                <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-150 font-bold">
                                                                    <th className="py-2.5 px-3 text-left font-bold border-r border-slate-100 min-w-[100px]">Couleur / Taille</th>
                                                                    {filteredSizes.map((s, i) => (
                                                                        <th key={i} className="py-2 px-2 text-center font-bold border-r border-slate-100">
                                                                            {s}
                                                                        </th>
                                                                    ))}
                                                                    <th className="py-2 px-3 text-center font-bold bg-indigo-50/30 text-indigo-800 w-20">TOTAL</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {filteredColors.map((c, cIdx) => {
                                                                    let rowTotal = 0;
                                                                    return (
                                                                        <tr key={`${c.id}-${cIdx}`} className="hover:bg-slate-50/30 transition-colors">
                                                                            <td className="py-2 px-3 border-r border-slate-100 font-semibold text-slate-600 flex items-center gap-2">
                                                                                <div
                                                                                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                                                    style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                                                />
                                                                                <span className="truncate max-w-[120px] text-slate-700" title={c.name}>{c.name}</span>
                                                                            </td>
                                                                            {filteredSizes.map((s) => {
                                                                                const qty = evt.sizeColorDistribution?.[c.id]?.[s] || 0;
                                                                                rowTotal += qty;
                                                                                return (
                                                                                    <td key={s} className="py-2 px-2 text-center font-mono text-slate-600 border-r border-slate-100">
                                                                                        {qty || <span className="text-slate-300">-</span>}
                                                                                    </td>
                                                                                );
                                                                            })}
                                                                            <td className="py-2 px-3 text-center font-mono font-extrabold bg-slate-50/40 text-slate-700">
                                                                                {rowTotal}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                </div>

            </div>

            {/* RECONCILIATION SUMMARY TABLE (AT BOTTOM, SPANS FULL WIDTH) */}
            {(modelEvents.length > 0 || editingEventId !== null) && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-sans">
                        <div className="space-y-0.5">
                            <h4 className="font-extrabold text-sm text-indigo-900 flex items-center gap-2">
                                <Grid3X3 className="w-4 h-4 text-indigo-600" />
                                {lang === 'ar' ? 'جدول مطابقة الكميات مع التوزيع الإجمالي' : 'Tableau de Réconciliation & Suivi des Délais'}
                            </h4>
                            <p className="text-xs text-slate-500 font-semibold">
                                {lang === 'ar' 
                                    ? 'مقارنة الكميات الموزعة على دفعات التسليم مع التوزيع الإجمالي للموديل (المقاسات والألوان).' 
                                    : 'Comparaison des quantités réparties par lots avec la répartition globale du modèle.'
                                }
                            </p>
                        </div>
                        {reconciliationDiscrepancies.hasErrors ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200/60 shadow-sm animate-pulse">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {lang === 'ar' ? 'انتباه: هناك فروقات!' : 'Attention : Écart détecté !'}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm">
                                <CheckCircle className="w-3.5 h-3.5" />
                                {lang === 'ar' ? 'مطابقة تامة 100%' : 'Correspondance parfaite 100%'}
                            </span>
                        )}
                    </div>

                    {reconciliationDiscrepancies.hasErrors && (
                        <div className="bg-gradient-to-r from-rose-50 to-rose-100/30 border border-rose-150/60 rounded-xl p-4 text-rose-900 text-xs font-medium flex items-start gap-3 shadow-sm font-sans">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="font-bold text-rose-950">
                                    {lang === 'ar' 
                                        ? 'يرجى مراجعة الخانات المشار إليها باللون الأحمر. مجموع كميات الدفعات لا يطابق التوزيع الإجمالي:' 
                                        : 'Veuillez ajuster les cases indiquées en rouge. Le total des lots ne correspond pas à la cible :'
                                    }
                                </p>
                                <ul className="list-disc pl-5 space-y-0.5 font-mono text-[10px] text-rose-700 font-bold">
                                    {colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total').map(c => {
                                        return sizes.filter(s => s.toLowerCase() !== 'total').map((s, sIdx) => {
                                            const diffVal = reconciliationDiscrepancies.diffs[c.id]?.[s] || 0;
                                            if (diffVal !== 0) {
                                                 const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                                                 const plannedVal = planifiedTotals[c.id]?.[s] || 0;
                                                 return (
                                                    <li key={`${c.id}_${s}`}>
                                                        {c.name} ({s}) : {plannedVal} planifié / {targetVal} cible ({diffVal > 0 ? `+${diffVal} de trop` : `${diffVal} manquant`})
                                                    </li>
                                                 );
                                            }
                                            return null;
                                        });
                                    })}
                                </ul>
                            </div>
                        </div>
                    )}

                    <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 text-slate-700 font-sans">
                                    <th className="py-3 px-3 text-left font-extrabold border-r border-slate-200 min-w-[120px] text-[10px] uppercase tracking-wider">Couleur \ Taille</th>
                                    {sizes.filter(s => s.toLowerCase() !== 'total').map((s, i) => (
                                        <th key={i} className="py-2 px-2 text-center font-extrabold border-r border-slate-200 min-w-[80px] text-[10px] uppercase tracking-wider">
                                            {s}
                                        </th>
                                    ))}
                                    <th className="py-2 px-3 text-center font-black bg-slate-200/80 text-slate-800 w-28 text-[10px] uppercase tracking-wider border-l border-slate-200">TOTAL</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150">
                                {colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total').map((c, cIdx) => {
                                    const targetRowTotal = matrixStats.rowTotals[c.id] || 0;
                                    const plannedRowTotal = Object.values(planifiedTotals[c.id] || {}).reduce((a, b) => a + b, 0);
                                    const rowDiff = plannedRowTotal - targetRowTotal;
                                    
                                    const isRowMatching = rowDiff === 0;
                                    const hasRowPlanned = plannedRowTotal > 0;
                                    
                                    let rowCellBg = "bg-slate-50/30";
                                    let rowPlannedColor = "text-slate-700 font-bold";
                                    if (!isRowMatching) {
                                        rowCellBg = "bg-rose-50/40 hover:bg-rose-50/60 transition-colors";
                                        rowPlannedColor = "text-rose-700 font-black";
                                    } else if (hasRowPlanned) {
                                        rowCellBg = "bg-emerald-50/30 hover:bg-emerald-50/45 transition-colors";
                                        rowPlannedColor = "text-emerald-700 font-extrabold";
                                    }

                                    return (
                                        <tr key={`${c.id}-${cIdx}`} className="hover:bg-slate-50/30 transition-colors">
                                            <td className="py-2.5 px-3 border-r border-slate-200 font-extrabold text-slate-700 flex items-center gap-2 bg-slate-50/20 font-sans">
                                                <div
                                                    className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                    style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                />
                                                <span className="truncate max-w-[150px]" title={c.name}>{c.name}</span>
                                            </td>
                                            {sizes.filter(s => s.toLowerCase() !== 'total').map((s, sIdx) => {
                                                const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                                                const plannedVal = planifiedTotals[c.id]?.[s] || 0;
                                                const diff = plannedVal - targetVal;
                                                const isMatching = diff === 0;
                                                const hasPlanned = plannedVal > 0;

                                                let cellBg = "bg-white";
                                                let plannedColor = "text-slate-700 font-bold";
                                                if (!isMatching) {
                                                    cellBg = "bg-rose-50/20 hover:bg-rose-50/40 transition-colors";
                                                    plannedColor = "text-rose-700 font-black";
                                                } else if (hasPlanned) {
                                                    cellBg = "bg-emerald-50/15 hover:bg-emerald-50/30 transition-colors";
                                                    plannedColor = "text-emerald-700 font-extrabold";
                                                } else {
                                                    plannedColor = "text-slate-400 font-medium";
                                                }
                                                
                                                return (
                                                    <td key={s} className={`py-2 px-2 border-r border-slate-150/80 text-center font-mono ${cellBg}`}>
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[9px] text-slate-400 font-medium font-sans">
                                                                {lang === 'ar' ? 'الهدف:' : 'Cible:'} {targetVal}
                                                            </span>
                                                            <span className={`text-xs ${plannedColor}`}>
                                                                {plannedVal}
                                                            </span>
                                                            {diff !== 0 && (
                                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md mt-0.5 border shadow-2xs ${
                                                                    diff > 0 
                                                                        ? 'text-rose-600 bg-rose-50 border-rose-100/60 animate-pulse' 
                                                                        : 'text-amber-600 bg-amber-50 border-amber-100/60 animate-pulse'
                                                                }`}>
                                                                    {diff > 0 ? `+${diff}` : diff}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                            <td className={`py-2 px-3 text-center font-mono border-l border-slate-200 ${rowCellBg}`}>
                                                <div className="flex flex-col items-center justify-center">
                                                    <span className="text-[9px] text-slate-400 font-medium font-sans">{targetRowTotal}</span>
                                                    <span className={`text-xs ${rowPlannedColor}`}>{plannedRowTotal}</span>
                                                    {rowDiff !== 0 && (
                                                        <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md mt-0.5 border border-rose-100 animate-pulse">
                                                            {rowDiff > 0 ? `+${rowDiff}` : rowDiff}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t-2 border-slate-250 font-bold bg-slate-50/80 font-sans">
                                <tr>
                                    <td className="py-2.5 px-3 text-right uppercase text-[10px] tracking-wider text-slate-500 border-r border-slate-200">Total</td>
                                    {sizes.filter(s => s.toLowerCase() !== 'total').map((s, sIdx) => {
                                        const targetColTotal = matrixStats.colTotals[sIdx] || 0;
                                        const plannedColTotal = colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total').reduce((sum, c) => sum + (planifiedTotals[c.id]?.[s] || 0), 0);
                                        const colDiff = plannedColTotal - targetColTotal;
                                        
                                        const isColMatching = colDiff === 0;
                                        const hasColPlanned = plannedColTotal > 0;
                                        
                                        let colCellBg = "bg-slate-50/40";
                                        let colPlannedColor = "text-slate-700 font-bold";
                                        if (!isColMatching) {
                                            colCellBg = "bg-rose-50/30 hover:bg-rose-50/45 transition-colors";
                                            colPlannedColor = "text-rose-700 font-black";
                                        } else if (hasColPlanned) {
                                            colCellBg = "bg-emerald-50/20 hover:bg-emerald-50/35 transition-colors";
                                            colPlannedColor = "text-emerald-700 font-extrabold";
                                        }
                                        
                                        return (
                                            <td key={sIdx} className={`py-2 px-2 text-center border-r border-slate-200 font-mono ${colCellBg}`}>
                                                <div className="flex flex-col items-center justify-center">
                                                    <span className="text-[9px] text-slate-400 font-medium font-sans">{targetColTotal}</span>
                                                    <span className={`text-xs ${colPlannedColor}`}>{plannedColTotal}</span>
                                                    {colDiff !== 0 && (
                                                        <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md mt-0.5 border border-rose-100 animate-pulse">
                                                            {colDiff > 0 ? `+${colDiff}` : colDiff}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                    {(() => {
                                        const targetGrandTotal = matrixStats.grandTotal;
                                        const plannedGrandTotal = Object.values(planifiedTotals).reduce((sum, sizeMap) => sum + Object.values(sizeMap).reduce((s, val) => s + (val || 0), 0), 0);
                                        const grandDiff = plannedGrandTotal - targetGrandTotal;
                                        
                                        const isGrandMatching = grandDiff === 0;
                                        const hasGrandPlanned = plannedGrandTotal > 0;
                                        
                                        let grandCellClass = "";
                                        if (!isGrandMatching) {
                                            grandCellClass = "bg-gradient-to-br from-rose-500 to-rose-600 text-white animate-pulse shadow-md rounded-br-xl";
                                        } else if (hasGrandPlanned) {
                                            grandCellClass = "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md rounded-br-xl";
                                        } else {
                                            grandCellClass = "bg-slate-200 text-slate-700";
                                        }
                                        
                                        return (
                                            <td className={`py-2.5 px-3 text-center border-l border-slate-250 ${grandCellClass}`}>
                                                <div className="flex flex-col items-center justify-center font-mono">
                                                    <span className="text-[9px] opacity-75 font-semibold font-sans">{targetGrandTotal}</span>
                                                    <span className="text-sm font-black">{plannedGrandTotal}</span>
                                                    {grandDiff !== 0 && (
                                                        <span className="text-[9px] font-black bg-white/20 px-1.5 py-0.5 rounded-md mt-0.5 border border-white/10">
                                                            {grandDiff > 0 ? `+${grandDiff}` : grandDiff}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })()}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
