import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Plus, Minus, Package, Truck, Calendar, Grid3X3, Palette, Check, Layers } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { Input, Select } from '../shared/Input';
import ModelSelector from './ModelSelector';
import type { ModelData, PlanningEvent, AppSettings } from '../../../types';
import type { PlanningChain } from '../hooks/usePlanningChains';
import { evClientName, evQty, evStartYmd } from '../shared/eventAccessors';
import type { Issue } from '../hooks/usePlanningValidation';
import { getMaterialAvailability } from '../hooks/usePlanningValidation';
import { todayYmd } from '../shared/dateFmt';
import { getClientColor } from '../shared/clientColors';

interface Props {
    open: boolean;
    mode: 'create' | 'edit';
    initial?: PlanningEvent | null;
    models: ModelData[];
    chains: PlanningChain[];
    planningEvents: PlanningEvent[];
    settings: AppSettings;
    onClose: () => void;
    onSubmit: (data: {
        selectedLotId?: string;
        modelId: string;
        chaineId: string;
        startDate: string;
        quantity: number;
        clientName: string;
        strictDeadline_DDS: string;
        fournisseurDate: string;
        color: string;
        isSubcontracted?: boolean;
        subcontractorName?: string;
        subcontractStatus?: 'PENDING' | 'SENT' | 'COMPLETED';
        subcontractorPhone?: string;
        subcontractorRating?: number;
        subcontractorAvailabilityDate?: string;
        subcontractPricePerPiece?: number;
        subcontractSizeColorDistribution?: Record<string, Record<string, number>>;
        sizeColorDistribution?: Record<string, Record<string, number>>;
        subcontractDeadline?: string;
        subcontractQuantity?: number;
        isLocked?: boolean;
    }) => void;
    checkDraft?: (draft: {
        modelId: string; chaineId: string; startDate: string; quantity: number; strictDeadline_DDS?: string;
    }) => Issue[];
    onOpenInIngenierie?: (modelId: string) => void;
}

export default function EventEditor({ open, mode, initial, models, chains, planningEvents, settings, onClose, onSubmit, checkDraft, onOpenInIngenierie }: Props) {
    const [modelId, setModelId] = useState('');
    const [chaineId, setChaineId] = useState(chains[0]?.id || 'CHAINE 1');
    const [startDate, setStartDate] = useState(todayYmd());
    const [quantity, setQuantity] = useState(0);
    const [clientName, setClientName] = useState('');
    const [strictDeadline, setStrictDeadline] = useState('');
    const [fournisseurDate, setFournisseurDate] = useState('');
    const [isSubcontracted, setIsSubcontracted] = useState(false);
    const [subcontractorName, setSubcontractorName] = useState('');
    const [subcontractStatus, setSubcontractStatus] = useState<'PENDING' | 'SENT' | 'COMPLETED'>('PENDING');
    const [subcontractorPhone, setSubcontractorPhone] = useState('');
    const [subcontractorRating, setSubcontractorRating] = useState<number>(5);
    const [subcontractorAvailabilityDate, setSubcontractorAvailabilityDate] = useState('');
    const [subcontractPricePerPiece, setSubcontractPricePerPiece] = useState<number>(0);
    const [subcontractDist, setSubcontractDist] = useState<Record<string, Record<string, number>>>({});
    const [showSubcontractDist, setShowSubcontractDist] = useState(false);
    const [subcontractQuantity, setSubcontractQuantity] = useState(0);
    const [subcontractDeadline, setSubcontractDeadline] = useState('');
    const [totalQuantity, setTotalQuantity] = useState(0);
    
    // Distribution state: { colorId: { size: qty } }
    const [distribution, setDistribution] = useState<Record<string, Record<string, number>>>({});
    const [showDistribution, setShowDistribution] = useState(false);
    // Pididos (couleurs de la fiche) sélectionnés pour cet ordre.
    const [selectedPididos, setSelectedPididos] = useState<Set<string>>(new Set());
    const [selectedLotId, setSelectedLotId] = useState('');
    const [isLocked, setIsLocked] = useState(false);

    const selectedModel = models.find(m => m.id === modelId);

    const lastOpenRef = useRef(false);
    const lastInitialRef = useRef<PlanningEvent | null | undefined>(undefined);
    const lastModeRef = useRef<'create' | 'edit' | undefined>(undefined);

    useEffect(() => {
        if (!open) {
            lastOpenRef.current = false;
            return;
        }

        const modeChanged = lastModeRef.current !== mode;
        const initialChanged = lastInitialRef.current !== initial;
        const opened = !lastOpenRef.current;

        if (opened || modeChanged || initialChanged) {
            lastOpenRef.current = true;
            lastModeRef.current = mode;
            lastInitialRef.current = initial;

            if (mode === 'edit' && initial) {
                setModelId(initial.modelId);
                setChaineId(initial.chaineId);
                setStartDate(evStartYmd(initial) || todayYmd());
                setIsLocked(!!initial.isLocked);
                setQuantity(initial.isSubcontracted ? 0 : evQty(initial));
                setClientName(evClientName(initial, models));
                setStrictDeadline((initial.strictDeadline_DDS || '').split('T')[0]);
                setFournisseurDate((initial.fournisseurDate || '').split('T')[0]);
                setIsSubcontracted(!!initial.isSubcontracted);
                setSubcontractorName(initial.subcontractorName || '');
                setSubcontractStatus(initial.subcontractStatus || 'PENDING');
                setSubcontractorPhone(initial.subcontractorPhone || '');
                setSubcontractorRating(initial.subcontractorRating || 5);
                setSubcontractorAvailabilityDate((initial.subcontractorAvailabilityDate || '').split('T')[0]);
                setSubcontractPricePerPiece(initial.subcontractPricePerPiece || 0);
                setSubcontractDeadline(initial.isSubcontracted ? (initial.strictDeadline_DDS || '').split('T')[0] : (initial.subcontractorAvailabilityDate || '').split('T')[0] || (initial.strictDeadline_DDS || '').split('T')[0]);
                setSelectedLotId(initial.id || '');

                if (initial.subcontractSizeColorDistribution) {
                    setSubcontractDist(initial.subcontractSizeColorDistribution);
                    setShowSubcontractDist(true);
                } else {
                    setSubcontractDist({});
                    setShowSubcontractDist(false);
                }

                // Restore distribution if exists
                if (initial.sizeColorDistribution) {
                    setDistribution(initial.sizeColorDistribution);
                    setShowDistribution(true);
                } else {
                    setDistribution({});
                    setShowDistribution(false);
                }

                let subQty = (initial as any).subcontractQuantity || 0;
                if (!subQty && initial.subcontractSizeColorDistribution) {
                    subQty = Object.values(initial.subcontractSizeColorDistribution).reduce(
                        (sum, cm) => sum + Object.values(cm).reduce((s, q) => s + q, 0), 0
                    );
                }
                setSubcontractQuantity(subQty);
                setTotalQuantity(initial.isSubcontracted ? evQty(initial) : evQty(initial) + subQty);
            } else {
                setModelId('');
                setChaineId(chains[0]?.id || 'CHAINE 1');
                setStartDate(todayYmd());
                setIsLocked(false);
                setQuantity(0);
                setClientName('');
                setStrictDeadline('');
                setFournisseurDate('');
                setIsSubcontracted(false);
                setSubcontractorName('');
                setSubcontractStatus('PENDING');
                setSubcontractorPhone('');
                setSubcontractorRating(5);
                setSubcontractorAvailabilityDate('');
                setSubcontractPricePerPiece(0);
                setSubcontractDist({});
                setShowSubcontractDist(false);
                setDistribution({});
                setShowDistribution(false);
                setSelectedPididos(new Set());
                setSubcontractQuantity(0);
                setSubcontractDeadline('');
                setTotalQuantity(0);
                setSelectedLotId('');
            }
        }
    }, [open, mode, initial, chains, models, planningEvents]);

    useEffect(() => {
        if (mode === 'create' && selectedModel && !clientName) {
            setClientName(selectedModel.ficheData?.client || '');
        }
    }, [modelId, selectedModel, mode]);

    useEffect(() => {
        if (mode === 'create') {
            setSelectedLotId('');
        }
    }, [modelId, mode]);

    // Initialize distribution structure when model changes
    useEffect(() => {
        if (selectedModel && showDistribution) {
            const colors = selectedModel.meta_data?.colors || [];
            const sizes = selectedModel.meta_data?.sizes || [];
            
            // Only initialize if empty
            if (Object.keys(distribution).length === 0 && colors.length > 0 && sizes.length > 0) {
                const newDist: Record<string, Record<string, number>> = {};
                colors.forEach(c => {
                    newDist[c.id] = {};
                    sizes.forEach(s => {
                        newDist[c.id][s] = 0;
                    });
                });
                setDistribution(newDist);
            }
        }
    }, [selectedModel, showDistribution]);

    // Initialize subcontract distribution structure when model changes
    useEffect(() => {
        if (selectedModel && isSubcontracted) {
            const colors = selectedModel.meta_data?.colors || [];
            const sizes = selectedModel.meta_data?.sizes || [];
            
            // Only initialize if empty
            if (Object.keys(subcontractDist).length === 0 && colors.length > 0 && sizes.length > 0) {
                const newDist: Record<string, Record<string, number>> = {};
                colors.forEach(c => {
                    newDist[c.id] = {};
                    sizes.forEach(s => {
                        newDist[c.id][s] = 0;
                    });
                });
                setSubcontractDist(newDist);
            }
        }
    }, [selectedModel, isSubcontracted, subcontractDist]);

    // Calculate total from distribution
    const calculatedTotal = useMemo(() => {
        let total = 0;
        Object.values(distribution).forEach(colorMap => {
            Object.values(colorMap).forEach(qty => {
                total += qty;
            });
        });
        return total;
    }, [distribution]);

    // Calculate total from subcontract distribution
    const calculatedSubcontractTotal = useMemo(() => {
        let total = 0;
        Object.values(subcontractDist).forEach(colorMap => {
            Object.values(colorMap).forEach(qty => {
                total += qty;
            });
        });
        return total;
    }, [subcontractDist]);

    // Sync quantities when showDistribution is true
    useEffect(() => {
        if (showDistribution) {
            setTotalQuantity(calculatedTotal);
            setSubcontractQuantity(calculatedSubcontractTotal);
            const localQty = isSubcontracted 
                ? Math.max(0, calculatedTotal - calculatedSubcontractTotal)
                : calculatedTotal;
            setQuantity(localQty);
        }
    }, [calculatedTotal, calculatedSubcontractTotal, showDistribution, isSubcontracted]);

    // Sync quantities when showDistribution is false
    useEffect(() => {
        if (!showDistribution) {
            const localQty = isSubcontracted
                ? Math.max(0, totalQuantity - subcontractQuantity)
                : totalQuantity;
            setQuantity(localQty);
        }
    }, [totalQuantity, subcontractQuantity, showDistribution, isSubcontracted]);

    // Ensure subcontract distribution does not exceed total distribution
    useEffect(() => {
        if (showDistribution && isSubcontracted) {
            let changed = false;
            const newSubDist = { ...subcontractDist };
            Object.keys(subcontractDist).forEach(colorId => {
                if (subcontractDist[colorId]) {
                    newSubDist[colorId] = { ...subcontractDist[colorId] };
                    Object.keys(subcontractDist[colorId]).forEach(size => {
                        const maxVal = distribution[colorId]?.[size] || 0;
                        if ((subcontractDist[colorId]?.[size] || 0) > maxVal) {
                            newSubDist[colorId][size] = maxVal;
                            changed = true;
                        }
                    });
                }
            });
            if (changed) {
                setSubcontractDist(newSubDist);
            }
        }
    }, [distribution, showDistribution, isSubcontracted, subcontractDist]);

    const updateDistribution = (colorId: string, size: string, value: number) => {
        setDistribution(prev => ({
            ...prev,
            [colorId]: {
                ...prev[colorId],
                [size]: value,
            },
        }));
    };

    const updateSubcontractDistribution = (colorId: string, size: string, value: number) => {
        const maxVal = distribution[colorId]?.[size] || 0;
        const clampedVal = Math.max(0, Math.min(value, maxVal));
        setSubcontractDist(prev => ({
            ...prev,
            [colorId]: {
                ...prev[colorId],
                [size]: clampedVal,
            },
        }));
    };

    const draftIssues = useMemo<Issue[]>(() => {
        if (!checkDraft || !modelId || quantity <= 0) return [];
        return checkDraft({ modelId, chaineId, startDate, quantity, strictDeadline_DDS: strictDeadline });
    }, [checkDraft, modelId, chaineId, startDate, quantity, strictDeadline]);

    const color = getClientColor(clientName);

    const submit = () => {
        const finalTotalQty = showDistribution ? calculatedTotal : totalQuantity;
        const finalSubcontractQty = showDistribution ? calculatedSubcontractTotal : subcontractQuantity;
        if (!modelId || finalTotalQty <= 0) return;
        
        let localQty = quantity;
        let localDist = showDistribution ? distribution : undefined;
        
        if (isSubcontracted && showDistribution && calculatedSubcontractTotal > 0) {
            localQty = Math.max(0, calculatedTotal - calculatedSubcontractTotal);
            const computedLocal: Record<string, Record<string, number>> = {};
            Object.keys(distribution).forEach(colorId => {
                computedLocal[colorId] = {};
                Object.keys(distribution[colorId]).forEach(size => {
                    const totalVal = distribution[colorId][size] || 0;
                    const subVal = subcontractDist[colorId]?.[size] || 0;
                    computedLocal[colorId][size] = Math.max(0, totalVal - subVal);
                });
            });
            localDist = computedLocal;
        }

        onSubmit({
            selectedLotId: selectedLotId || undefined,
            modelId, chaineId, startDate, 
            quantity: localQty, 
            clientName, strictDeadline_DDS: strictDeadline,
            fournisseurDate, color,
            isSubcontracted,
            subcontractorName: isSubcontracted ? subcontractorName : undefined,
            subcontractStatus: isSubcontracted ? subcontractStatus : undefined,
            subcontractorPhone: isSubcontracted ? subcontractorPhone : undefined,
            subcontractorRating: isSubcontracted ? subcontractorRating : undefined,
            subcontractorAvailabilityDate: isSubcontracted ? subcontractorAvailabilityDate : undefined,
            subcontractPricePerPiece: isSubcontracted ? subcontractPricePerPiece : undefined,
            subcontractSizeColorDistribution: isSubcontracted && calculatedSubcontractTotal > 0 ? subcontractDist : undefined,
            sizeColorDistribution: localDist,
            subcontractDeadline: isSubcontracted ? subcontractDeadline : undefined,
            subcontractQuantity: isSubcontracted ? finalSubcontractQty : undefined,
            isLocked,
        });
    };

    const colors = selectedModel?.meta_data?.colors || [];
    const sizes = selectedModel?.meta_data?.sizes || [];

    // Filter lots for the selected model
    const modelLots = useMemo(() => {
        if (!selectedModel || !planningEvents) return [];
        return planningEvents.filter(e => e.modelId === selectedModel.id);
    }, [selectedModel, planningEvents]);

    const activeLot = useMemo(() => {
        if (!selectedLotId) return null;
        return modelLots.find(e => e.id === selectedLotId) || null;
    }, [selectedLotId, modelLots]);

    const lotMaterialAvailability = useMemo(() => {
        if (!modelId || !selectedModel) return null;
        const activeQty = activeLot ? evQty(activeLot) : totalQuantity;
        return getMaterialAvailability(modelId, models, totalQuantity, activeQty);
    }, [modelId, selectedModel, models, totalQuantity, activeLot]);

    const toggleLot = (lotId: string) => {
        if (selectedLotId === lotId) {
            // Deselect: reset states
            setSelectedLotId('');
            setQuantity(0);
            setClientName(selectedModel?.ficheData?.client || '');
            setStrictDeadline('');
            setFournisseurDate('');
            setDistribution({});
            setShowDistribution(false);
            setIsSubcontracted(false);
            setSubcontractorName('');
            setSubcontractorPhone('');
            setSubcontractorRating(5);
            setSubcontractorAvailabilityDate('');
            setSubcontractPricePerPiece(0);
            setSubcontractDist({});
            setShowSubcontractDist(false);
            setSubcontractQuantity(0);
            setSubcontractDeadline('');
            setTotalQuantity(0);
        } else {
            // Select: load lot details
            const lot = modelLots.find(e => e.id === lotId);
            if (!lot) return;

            setSelectedLotId(lotId);
            const lotQty = evQty(lot);
            setQuantity(lot.isSubcontracted ? 0 : lotQty);
            setClientName(evClientName(lot, models));
            setStrictDeadline((lot.strictDeadline_DDS || '').split('T')[0]);
            setFournisseurDate((lot.fournisseurDate || '').split('T')[0]);
            setIsSubcontracted(!!lot.isSubcontracted);
            setSubcontractorName(lot.subcontractorName || '');
            setSubcontractStatus(lot.subcontractStatus || 'PENDING');
            setSubcontractorPhone(lot.subcontractorPhone || '');
            setSubcontractorRating(lot.subcontractorRating || 5);
            setSubcontractorAvailabilityDate((lot.subcontractorAvailabilityDate || '').split('T')[0]);
            setSubcontractPricePerPiece(lot.subcontractPricePerPiece || 0);
            setSubcontractDeadline(lot.isSubcontracted ? (lot.strictDeadline_DDS || '').split('T')[0] : (lot.subcontractorAvailabilityDate || '').split('T')[0] || (lot.strictDeadline_DDS || '').split('T')[0]);
            
            const startStr = evStartYmd(lot);
            if (startStr) {
                setStartDate(startStr);
            }

            if (lot.subcontractSizeColorDistribution) {
                setSubcontractDist(lot.subcontractSizeColorDistribution);
                setShowSubcontractDist(true);
            } else {
                setSubcontractDist({});
                setShowSubcontractDist(false);
            }

            if (lot.sizeColorDistribution) {
                setDistribution(lot.sizeColorDistribution);
                setShowDistribution(true);
            } else {
                setDistribution({});
                setShowDistribution(false);
            }

            let subQty = (lot as any).subcontractQuantity || 0;
            if (!subQty && lot.subcontractSizeColorDistribution) {
                subQty = Object.values(lot.subcontractSizeColorDistribution).reduce(
                    (sum, cm) => sum + Object.values(cm).reduce((s, q) => s + q, 0), 0
                );
            }
            setSubcontractQuantity(subQty);
            setTotalQuantity(lot.isSubcontracted ? lotQty : lotQty + subQty);
        }
    };

    // Pididos = couleurs de la fiche, avec la quantité planifiée (grille du modèle).
    const grid = selectedModel?.ficheData?.gridQuantities || {};
    const pididoOptions = useMemo(() => {
        return colors.map(c => {
            let qty = 0;
            for (let i = 0; i < sizes.length; i++) qty += Number(grid[`${c.id}_${i}`] || 0);
            return { id: c.id, name: c.name, qty };
        }).filter(p => p.qty > 0);
    }, [colors, sizes, grid]);

    /** Coche/décoche un pidido (couleur) et reconstruit la répartition depuis la grille fiche. */
    const togglePidido = (colorId: string) => {
        const next = new Set(selectedPididos);
        if (next.has(colorId)) next.delete(colorId); else next.add(colorId);
        setSelectedPididos(next);

        const newDist: Record<string, Record<string, number>> = {};
        next.forEach(cid => {
            newDist[cid] = {};
            sizes.forEach((s, i) => { newDist[cid][s] = Number(grid[`${cid}_${i}`] || 0); });
        });
        setDistribution(newDist);
        setShowDistribution(next.size > 0);
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={mode === 'create' ? 'Nouvel ordre' : 'Modifier l\'ordre'}
            subtitle={mode === 'create' ? 'Configurez les paramètres principaux' : initial?.modelName}
            size="lg"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Annuler</Button>
                    <Button variant="primary" onClick={submit} disabled={!modelId || (showDistribution ? calculatedTotal <= 0 : totalQuantity <= 0)}>
                        {mode === 'create' ? 'Créer l\'ordre' : 'Enregistrer'}
                    </Button>
                </>
            }
        >
            <div className="space-y-5">
                {/* Modèle */}
                <ModelSelector
                    models={models}
                    value={modelId}
                    onChange={(id) => setModelId(id)}
                    label="Modèle"
                    planningEvents={planningEvents}
                    chainEfficiency={chains.find(c => c.id === chaineId)?.efficiency || 0.85}
                    quantity={quantity}
                    startDate={startDate}
                    strictDeadline={strictDeadline}
                    onOpenInIngenierie={onOpenInIngenierie}
                    settings={settings}
                    chainId={chaineId}
                />

                {/* Lots / Pedidos du modèle — sélection rapide */}
                {selectedModel && (modelLots.length > 0 ? (
                    <div className="space-y-3">
                        <div className="rounded-lg border border-white/25 bg-white/40 backdrop-blur-md p-3 shadow-sm">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="text-[11px] font-semibold text-slate-700">Pididos du modèle — choisis ceux à lancer</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {modelLots.map(lot => {
                                    const active = selectedLotId === lot.id;
                                    const clientColor = getClientColor(lot.clientName || '');
                                    const lotName = lot.modelName || '';
                                    const suffix = lotName.includes(' — ') ? lotName.split(' — ').slice(1).join(' — ') : lotName;
                                    const qty = evQty(lot);
                                    
                                    // Fetch material status for this lot
                                    const matAv = getMaterialAvailability(selectedModel.id, models, qty, qty);
                                    
                                    return (
                                        <button
                                            key={lot.id}
                                            type="button"
                                            onClick={() => toggleLot(lot.id)}
                                            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12px] font-medium transition-colors ${active ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            <span 
                                                className="w-2.5 h-2.5 rounded-full border border-slate-300" 
                                                style={{ backgroundColor: clientColor || '#ccc' }} 
                                            />
                                            <span className="truncate max-w-[150px] font-semibold">{suffix}</span>
                                            <span className="tabular-nums text-slate-400 font-bold">{qty} pcs</span>
                                            <span className="text-[11px]" title={matAv.label}>{matAv.emoji}</span>
                                            {active && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                        </button>
                                    );
                                })}
                            </div>
                            {selectedLotId && (
                                <p className="mt-2 text-[10px] text-slate-400">
                                    Le lot sélectionné pré-remplit les dates, client, quantité et répartition.
                                </p>
                            )}
                        </div>

                        {/* Logistics details card for the selected lot */}
                        {activeLot && (
                            <div className="rounded-xl border border-white/20 bg-white/55 backdrop-blur-md p-3 space-y-3 shadow-sm animate-in fade-in duration-200">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                    <h4 className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                        <Package className="w-3.5 h-3.5 text-indigo-500" />
                                        Suivi Logistique : {activeLot.modelName?.split(' — ').slice(1).join(' — ') || activeLot.modelName}
                                    </h4>
                                    <div className="flex items-center gap-1.5">
                                        {/* Lot production status badge */}
                                        {(() => {
                                            const status = activeLot.status || 'READY';
                                            const label = status === 'DONE' ? 'Terminé' : status === 'BLOCKED_STOCK' ? 'Bloqué' : status === 'IN_PROGRESS' ? 'En cours' : 'Prêt';
                                            const colorCls = status === 'DONE' ? 'bg-slate-100 text-slate-600 border-slate-200' : status === 'BLOCKED_STOCK' ? 'bg-rose-50 text-rose-700 border-rose-200' : status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                            return (
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${colorCls}`}>
                                                    {label}
                                                </span>
                                            );
                                        })()}
                                        {/* Material status badge */}
                                        {lotMaterialAvailability && (
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border flex items-center gap-1 ${
                                                lotMaterialAvailability.color === 'green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                lotMaterialAvailability.color === 'yellow' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                lotMaterialAvailability.color === 'red' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                                            }`}>
                                                <span>{lotMaterialAvailability.emoji}</span>
                                                <span>{lotMaterialAvailability.label}</span>
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-[11px] bg-white/40 backdrop-blur-sm p-2.5 rounded-lg border border-white/20 shadow-xs">
                                    <div className="space-y-1">
                                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Planning</span>
                                        <div className="space-y-0.5 text-slate-700 font-semibold">
                                            <div className="flex justify-between">
                                                <span>Début :</span>
                                                <span className="font-mono text-slate-900">{activeLot.startDate || activeLot.dateLancement || '—'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>DDS (Délai) :</span>
                                                <span className="font-mono text-slate-900">{activeLot.strictDeadline_DDS ? activeLot.strictDeadline_DDS.split('T')[0] : '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Fournitures</span>
                                        <div className="space-y-0.5 text-slate-700 font-semibold">
                                            <div className="flex justify-between items-center">
                                                <span>Arrivée prévue :</span>
                                                {activeLot.fournisseurDate ? (
                                                    <span className="font-mono text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-150">
                                                        {activeLot.fournisseurDate.split('T')[0]}
                                                    </span>
                                                ) : (
                                                    <span className="text-amber-600 italic font-medium">Non définie</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Materials breakdown list */}
                                {lotMaterialAvailability && lotMaterialAvailability.details.length > 0 && (
                                    <div className="pt-1.5">
                                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                            Taux de Couverture des Fournitures (BOM)
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto pr-1">
                                            {lotMaterialAvailability.details.map((d, idx) => (
                                                <div key={idx} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-medium ${
                                                    d.covered ? 'border-emerald-500/20 bg-emerald-500/5 backdrop-blur-xs text-emerald-800' : 'border-rose-500/20 bg-rose-500/5 backdrop-blur-xs text-rose-850'
                                                }`}>
                                                    <span className="truncate max-w-[120px] font-bold" title={d.materialName}>
                                                        {d.materialName}
                                                    </span>
                                                    <span className="font-mono font-black">
                                                        {d.received} / {Math.round(d.needed)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    pididoOptions.length > 0 && (
                        <div className="rounded-lg border border-white/25 bg-white/40 backdrop-blur-md p-3 shadow-sm">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Palette className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="text-[11px] font-semibold text-slate-700">Pididos du modèle — choisis ceux à lancer</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {pididoOptions.map(p => {
                                    const active = selectedPididos.has(p.id);
                                    const hex = p.id.startsWith('#') ? p.id : null;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => togglePidido(p.id)}
                                            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12px] font-medium transition-colors ${active ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            <span className={`w-2.5 h-2.5 rounded-full border border-slate-300 ${hex ? '' : 'bg-slate-300'}`} style={hex ? { backgroundColor: hex } : undefined} />
                                            <span className="truncate max-w-[110px]">{p.name}</span>
                                            <span className="tabular-nums text-slate-400">{p.qty}</span>
                                            {active && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                        </button>
                                    );
                                })}
                            </div>
                            {selectedPididos.size > 0 && (
                                <p className="mt-2 text-[10px] text-slate-400">
                                    La répartition ci-dessous est pré-remplie depuis la fiche pour les pididos choisis.
                                </p>
                            )}
                        </div>
                    )
                ))}

                {/* Grid 2 cols */}
                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label={isSubcontracted ? "Quantité totale" : "Quantité"}
                        type="number"
                        value={showDistribution ? (calculatedTotal || '') : (totalQuantity || '')}
                        onChange={(e) => {
                            if (!showDistribution) {
                                setTotalQuantity(Number(e.target.value) || 0);
                            }
                        }}
                        placeholder="0"
                        min={0}
                        readOnly={showDistribution}
                        className={showDistribution ? 'opacity-50 cursor-not-allowed' : ''}
                    />
                    <Select label="Chaîne" value={chaineId} onChange={(e) => setChaineId(e.target.value)}>
                        {chains.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.name}  ·  η {Math.round(c.efficiency * 100)}%
                            </option>
                        ))}
                    </Select>

                    <Input
                        label="Date de lancement"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                    <div className="flex items-center gap-1.5 pt-0.5 pb-2">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isLocked}
                                onChange={(e) => setIsLocked(e.target.checked)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                            />
                            <span className="text-[11px] font-semibold text-slate-500 select-none">
                                Figer la date (ne pas décaler automatiquement)
                            </span>
                        </label>
                    </div>
                    <Input
                        label="DDS (deadline)"
                        type="date"
                        value={strictDeadline}
                        onChange={(e) => setStrictDeadline(e.target.value)}
                    />

                    <div className="space-y-1.5">
                        <label className="block text-[11px] font-medium text-slate-600">Client</label>
                        <div className="relative">
                            <span
                                className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                                style={{ background: color }}
                            />
                            <input
                                type="text"
                                className="w-full h-9 pl-8 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-colors"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="Nom du client"
                            />
                        </div>
                    </div>

                    <Input
                        label="Matières (optionnel)"
                        type="date"
                        value={fournisseurDate}
                        onChange={(e) => setFournisseurDate(e.target.value)}
                    />
                </div>

                {/* Répartition Tailles / Couleurs */}
                {selectedModel && colors.length > 0 && sizes.length > 0 && (
                    <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
                        <div className="flex items-center justify-between mb-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showDistribution}
                                    onChange={(e) => setShowDistribution(e.target.checked)}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-[12px] font-semibold text-slate-800 flex items-center gap-1.5">
                                    <Grid3X3 className="w-4 h-4 text-indigo-600" />
                                    Répartition (Tailles / Couleurs)
                                </span>
                            </label>
                            {showDistribution && (
                                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                                    Total: {calculatedTotal} pcs
                                </span>
                            )}
                        </div>

                        {showDistribution && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] font-semibold text-slate-800">
                                        Répartition Totale (Commande)
                                    </span>
                                </div>
                                <div className="bg-white/30 backdrop-blur-md rounded-xl border border-white/20 overflow-hidden shadow-sm animate-[planning-slide-in-right_150ms_ease-out]">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-white/40 border-b border-white/20 backdrop-blur-sm">
                                                    <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-md border-r border-white/10 z-10">
                                                        Couleur \ Taille
                                                    </th>
                                                    {sizes.map(size => (
                                                        <th key={size} className="px-4 py-3 text-center text-[11px] font-bold text-slate-600 uppercase tracking-wider min-w-[80px]">
                                                            {size}
                                                        </th>
                                                    ))}
                                                    <th className="px-4 py-3 text-center text-[11px] font-bold text-white bg-indigo-600 uppercase tracking-wider min-w-[80px]">
                                                        Total
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {colors.map((color, cIdx) => {
                                                    const colorTotal = Object.values(distribution[color.id] || {}).reduce((a, b) => a + b, 0);
                                                    return (
                                                        <tr key={`${color.id}-${cIdx}`} className="hover:bg-white/50 transition-colors">
                                                            <td className="px-4 py-2 sticky left-0 bg-white/90 backdrop-blur-md z-10 border-r border-white/20">
                                                                <div className="flex items-center gap-2">
                                                                    <div 
                                                                        className="w-3 h-3 rounded-full border border-slate-300 shadow-sm" 
                                                                        style={{ background: color.id || '#888' }} 
                                                                    />
                                                                    <span className="text-[12px] font-medium text-slate-800 truncate max-w-[120px]">
                                                                        {color.name}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            {sizes.map(size => (
                                                                <td key={size} className="px-2 py-2">
                                                                    <input
                                                                        type="number"
                                                                        value={distribution[color.id]?.[size] || ''}
                                                                        onChange={(e) => updateDistribution(color.id, size, Number(e.target.value) || 0)}
                                                                        className="w-full h-8 px-2 text-center text-[12px] tabular-nums bg-white border border-slate-200 rounded-md focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                                                        min={0}
                                                                        placeholder="0"
                                                                    />
                                                                </td>
                                                            ))}
                                                            <td className="px-4 py-2 text-center bg-indigo-50/30">
                                                                <span className="text-[13px] font-bold text-indigo-700 tabular-nums">
                                                                    {colorTotal}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-white/50 border-t border-white/30 backdrop-blur-sm">
                                                    <td className="px-4 py-3 text-right text-[11px] font-bold text-slate-700 uppercase sticky left-0 bg-white/90 backdrop-blur-md border-r border-white/20 z-10">
                                                        Total
                                                    </td>
                                                    {sizes.map(size => {
                                                        const sizeTotal = colors.reduce((sum, c) => sum + (distribution[c.id]?.[size] || 0), 0);
                                                        return (
                                                            <td key={size} className="px-4 py-3 text-center">
                                                                <span className="text-[12px] font-semibold text-slate-700 tabular-nums">
                                                                    {sizeTotal}
                                                                </span>
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-4 py-3 text-center bg-indigo-600">
                                                        <span className="text-[14px] font-bold text-white tabular-nums">
                                                            {calculatedTotal}
                                                        </span>
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {showDistribution && isSubcontracted && (
                            <div className="mt-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] font-semibold text-indigo-800 flex items-center gap-1.5">
                                        <Truck className="w-4 h-4 text-indigo-600" />
                                        Répartition Sous-traitance
                                    </span>
                                    <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                                        Total sous-traité: {calculatedSubcontractTotal} pcs
                                    </span>
                                </div>
                                <div className="bg-white/30 backdrop-blur-md rounded-xl border border-white/20 overflow-hidden shadow-sm animate-[planning-slide-in-right_150ms_ease-out]">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-white/40 border-b border-white/20 backdrop-blur-sm">
                                                    <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-md border-r border-white/10 z-10">
                                                        Couleur \ Taille
                                                    </th>
                                                    {sizes.map(size => (
                                                        <th key={size} className="px-4 py-3 text-center text-[11px] font-bold text-slate-600 uppercase tracking-wider min-w-[80px]">
                                                            {size}
                                                        </th>
                                                    ))}
                                                    <th className="px-4 py-3 text-center text-[11px] font-bold text-white bg-indigo-600 uppercase tracking-wider min-w-[80px]">
                                                        Total
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {colors.map((color, cIdx) => {
                                                    const colorTotal = Object.values(subcontractDist[color.id] || {}).reduce((a, b) => a + b, 0);
                                                    return (
                                                        <tr key={`${color.id}-${cIdx}`} className="hover:bg-white/50 transition-colors">
                                                            <td className="px-4 py-2 sticky left-0 bg-white/90 backdrop-blur-md z-10 border-r border-white/20">
                                                                <div className="flex items-center gap-2">
                                                                    <div 
                                                                        className="w-3 h-3 rounded-full border border-slate-300 shadow-sm" 
                                                                        style={{ background: color.id || '#888' }} 
                                                                    />
                                                                    <span className="text-[12px] font-medium text-slate-800 truncate max-w-[120px]">
                                                                        {color.name}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            {sizes.map(size => (
                                                                <td key={size} className="px-2 py-2">
                                                                    <input
                                                                        type="number"
                                                                        value={subcontractDist[color.id]?.[size] || ''}
                                                                        onChange={(e) => updateSubcontractDistribution(color.id, size, Number(e.target.value) || 0)}
                                                                        className="w-full h-8 px-2 text-center text-[12px] tabular-nums bg-white border border-slate-200 rounded-md focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                                                        min={0}
                                                                        max={distribution[color.id]?.[size] || 0}
                                                                        placeholder="0"
                                                                    />
                                                                </td>
                                                            ))}
                                                            <td className="px-4 py-2 text-center bg-indigo-50/30">
                                                                <span className="text-[13px] font-bold text-indigo-700 tabular-nums">
                                                                    {colorTotal}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-white/50 border-t border-white/30 backdrop-blur-sm">
                                                    <td className="px-4 py-3 text-right text-[11px] font-bold text-slate-700 uppercase sticky left-0 bg-white/90 backdrop-blur-md border-r border-white/20 z-10">
                                                        Total
                                                    </td>
                                                    {sizes.map(size => {
                                                        const sizeTotal = colors.reduce((sum, c) => sum + (subcontractDist[c.id]?.[size] || 0), 0);
                                                        return (
                                                            <td key={size} className="px-4 py-3 text-center">
                                                                <span className="text-[12px] font-semibold text-slate-700 tabular-nums">
                                                                    {sizeTotal}
                                                                </span>
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-4 py-3 text-center bg-indigo-600">
                                                        <span className="text-[14px] font-bold text-white tabular-nums">
                                                            {calculatedSubcontractTotal}
                                                        </span>
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {showDistribution && isSubcontracted && (
                            <div className="mt-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] font-semibold text-emerald-800 flex items-center gap-1.5">
                                        <Package className="w-4 h-4 text-emerald-600" />
                                        Reste en Production Interne (Chaîne)
                                    </span>
                                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                                        Reste interne: {Math.max(0, calculatedTotal - calculatedSubcontractTotal)} pcs
                                    </span>
                                </div>
                                <div className="bg-emerald-500/5 backdrop-blur-md rounded-xl border border-emerald-500/20 overflow-hidden shadow-sm animate-[planning-slide-in-right_150ms_ease-out]">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-emerald-500/10 border-b border-emerald-500/20 backdrop-blur-sm">
                                                    <th className="px-4 py-3 text-left text-[11px] font-bold text-emerald-800 uppercase tracking-wider sticky left-0 bg-emerald-50/90 backdrop-blur-md border-r border-emerald-500/10 z-10">
                                                        Couleur \ Taille
                                                    </th>
                                                    {sizes.map(size => (
                                                        <th key={size} className="px-4 py-3 text-center text-[11px] font-bold text-emerald-800 uppercase tracking-wider min-w-[80px]">
                                                            {size}
                                                        </th>
                                                    ))}
                                                    <th className="px-4 py-3 text-center text-[11px] font-bold text-white bg-emerald-600 uppercase tracking-wider min-w-[80px]">
                                                        Total
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-emerald-100">
                                                {colors.map((color, cIdx) => {
                                                    const colorTotalTotal = Object.values(distribution[color.id] || {}).reduce((a, b) => a + b, 0);
                                                    const colorSubTotal = Object.values(subcontractDist[color.id] || {}).reduce((a, b) => a + b, 0);
                                                    const colorTotal = Math.max(0, colorTotalTotal - colorSubTotal);
                                                    return (
                                                        <tr key={`${color.id}-${cIdx}`} className="hover:bg-white/50 transition-colors">
                                                            <td className="px-4 py-2 sticky left-0 bg-emerald-50/95 backdrop-blur-md z-10 border-r border-emerald-500/20">
                                                                <div className="flex items-center gap-2">
                                                                    <div 
                                                                        className="w-3 h-3 rounded-full border border-slate-300 shadow-sm" 
                                                                        style={{ background: color.id || '#888' }} 
                                                                    />
                                                                    <span className="text-[12px] font-medium text-slate-800 truncate max-w-[120px]">
                                                                        {color.name}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            {sizes.map(size => {
                                                                const cellTotalVal = distribution[color.id]?.[size] || 0;
                                                                const cellSubVal = subcontractDist[color.id]?.[size] || 0;
                                                                const cellVal = Math.max(0, cellTotalVal - cellSubVal);
                                                                return (
                                                                    <td key={size} className="px-2 py-2 text-center text-[12px] font-medium text-slate-800 tabular-nums">
                                                                        {cellVal}
                                                                    </td>
                                                                );
                                                            })}
                                                            <td className="px-4 py-2 text-center bg-emerald-50/50">
                                                                <span className="text-[13px] font-bold text-emerald-700 tabular-nums">
                                                                    {colorTotal}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-emerald-500/20 border-t border-emerald-500/35 backdrop-blur-sm">
                                                    <td className="px-4 py-3 text-right text-[11px] font-bold text-emerald-800 uppercase sticky left-0 bg-emerald-50/95 backdrop-blur-md border-r border-emerald-500/20 z-10">
                                                        Total
                                                    </td>
                                                    {sizes.map(size => {
                                                        const sizeTotalTotal = colors.reduce((sum, c) => sum + (distribution[c.id]?.[size] || 0), 0);
                                                        const sizeSubTotal = colors.reduce((sum, c) => sum + (subcontractDist[c.id]?.[size] || 0), 0);
                                                        const sizeTotal = Math.max(0, sizeTotalTotal - sizeSubTotal);
                                                        return (
                                                            <td key={size} className="px-4 py-3 text-center">
                                                                <span className="text-[12px] font-semibold text-emerald-800 tabular-nums">
                                                                    {sizeTotal}
                                                                </span>
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-4 py-3 text-center bg-emerald-600">
                                                        <span className="text-[14px] font-bold text-white tabular-nums">
                                                            {Math.max(0, calculatedTotal - calculatedSubcontractTotal)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Subcontracting */}
                <div className="border-t border-slate-100 pt-3 mt-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isSubcontracted}
                            onChange={(e) => setIsSubcontracted(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-[12px] font-medium text-slate-700">En sous-traitance</span>
                    </label>
                    
                    {isSubcontracted && (
                        <div className="mt-4 p-4 bg-white/40 backdrop-blur-md border border-white/20 rounded-xl space-y-4 shadow-sm animate-[planning-slide-in-right_150ms_ease-out]">
                            <h4 className="text-[12px] font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                <Truck className="w-4 h-4 text-indigo-600" />
                                Détails du Partenaire Sous-traitant
                            </h4>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <Input
                                    label="Nom du sous-traitant"
                                    type="text"
                                    value={subcontractorName}
                                    onChange={(e) => setSubcontractorName(e.target.value)}
                                    placeholder="Ex: Atelier X"
                                />
                                <Input
                                    label="Téléphone"
                                    type="tel"
                                    value={subcontractorPhone}
                                    onChange={(e) => setSubcontractorPhone(e.target.value)}
                                    placeholder="Ex: +212 600000000"
                                />
                                
                                <Select
                                    label="Statut"
                                    value={subcontractStatus}
                                    onChange={(e) => setSubcontractStatus(e.target.value as any)}
                                >
                                    <option value="PENDING">En attente</option>
                                    <option value="SENT">Envoyé</option>
                                    <option value="COMPLETED">Complété</option>
                                </Select>

                                <Input
                                    label="Date de disponibilité"
                                    type="date"
                                    value={subcontractorAvailabilityDate}
                                    onChange={(e) => setSubcontractorAvailabilityDate(e.target.value)}
                                />

                                <Input
                                    label="Date de livraison prévue"
                                    type="date"
                                    value={subcontractDeadline}
                                    onChange={(e) => setSubcontractDeadline(e.target.value)}
                                />

                                {!showDistribution && (
                                    <Input
                                        label="Quantité sous-traitée"
                                        type="number"
                                        value={subcontractQuantity || ''}
                                        onChange={(e) => {
                                            const val = Number(e.target.value) || 0;
                                            setSubcontractQuantity(Math.min(val, totalQuantity));
                                        }}
                                        placeholder="0"
                                        min={0}
                                        max={totalQuantity}
                                    />
                                )}

                                <Input
                                    label="Prix par pièce (DH)"
                                    type="number"
                                    step="0.01"
                                    value={subcontractPricePerPiece || ''}
                                    onChange={(e) => setSubcontractPricePerPiece(Number(e.target.value) || 0)}
                                    placeholder="0.00"
                                    min={0}
                                />
                            </div>

                            <div className="flex justify-between items-center bg-indigo-500/10 p-3 rounded-lg border border-indigo-500/20 backdrop-blur-sm">
                                <span className="text-[12px] font-semibold text-slate-700">Coût total estimé :</span>
                                <span className="text-[14px] font-bold text-indigo-700 tabular-nums">
                                    {((showDistribution ? calculatedSubcontractTotal : subcontractQuantity) * subcontractPricePerPiece).toFixed(2)} DH
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Validation */}
                {draftIssues.length > 0 && (
                    <div className="rounded-lg bg-amber-50/40 border border-amber-100 p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800">
                            <AlertTriangle className="w-3 h-3" strokeWidth={2} />
                            {draftIssues.length} point{draftIssues.length > 1 ? 's' : ''} d'attention
                        </div>
                        {draftIssues.map(i => (
                            <div key={i.id} className="text-[11px] text-amber-900 leading-snug">
                                <span className="font-medium">{i.title}</span> — {i.detail}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
