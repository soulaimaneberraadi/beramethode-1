import React, { useState, useEffect, useMemo } from 'react';
import { 
    Calendar, 
    Users, 
    Percent, 
    Clock, 
    TrendingUp, 
    AlertTriangle, 
    CheckCircle2, 
    Truck, 
    Sliders, 
    UserCheck, 
    Activity, 
    Sparkles,
    Search,
    ChevronRight,
    Split,
    Info,
    X,
    Check
} from 'lucide-react';
import type { ModelData, PlanningEvent, AppSettings } from '../../../types';
import DateTimePicker from '../../ui/DateTimePicker';
import { 
    isPlanningWorkingDay, 
    parsePlanningDateAtNoon, 
    planningLocalDateKey, 
    getWorkMinutesPerDay, 
    addWorkingDaysFromLaunchIso 
} from '../../../utils/planning';
import { getClientColor } from '../shared/clientColors';
import Button from '../shared/Button';

interface ProductionSimulationProps {
    models: ModelData[];
    chains: any[];
    settings: AppSettings;
    planningEvents: PlanningEvent[];
    eventsApi: {
        addEvent: (input: any) => void;
        updateEvent: (id: string, patch: any) => void;
    };
    showToast: (text: string, type?: 'success' | 'error') => void;
}

export default function ProductionSimulation({
    models,
    chains,
    settings,
    planningEvents,
    eventsApi,
    showToast
}: ProductionSimulationProps) {
    // Search and selection
    const [modelSearch, setModelSearch] = useState('');
    const [selectedModelId, setSelectedModelId] = useState<string>('');
    const [selectedEventId, setSelectedEventId] = useState<string>('');

    // Simulation inputs
    const [clientName, setClientName] = useState('');
    const [orderCode, setOrderCode] = useState('');
    const [quantity, setQuantity] = useState<number>(0);
    const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [strictDeadline_DDS, setStrictDeadline_DDS] = useState<string>('');
    const [selectedChainId, setSelectedChainId] = useState<string>('');
    const [numWorkers, setNumWorkers] = useState<number>(30);
    const [efficiency, setEfficiency] = useState<number>(0.85); // default 85%
    const [sam, setSam] = useState<number>(15); // unit time in minutes

    // Outsource dialog state
    const [showSplitConfirm, setShowSplitConfirm] = useState(false);
    const [subcontractorName, setSubcontractorName] = useState('');
    const [subcontractorPhone, setSubcontractorPhone] = useState('');
    const [subcontractPrice, setSubcontractPrice] = useState<number>(0);

    // Selected model object
    const selectedModel = useMemo(() => {
        return models.find(m => m.id === selectedModelId) || null;
    }, [selectedModelId, models]);

    // Filtered models list
    const filteredModels = useMemo(() => {
        const q = modelSearch.toLowerCase().trim();
        if (!q) return models.slice(0, 8); // show first 8 models by default
        return models.filter(m => 
            (m.meta_data?.nom_modele || '').toLowerCase().includes(q) ||
            (m.ficheData?.client || '').toLowerCase().includes(q) ||
            (m.meta_data?.reference || '').toLowerCase().includes(q)
        );
    }, [models, modelSearch]);

    // Existing orders/lots for the selected model
    const modelEvents = useMemo(() => {
        if (!selectedModelId) return [];
        return planningEvents.filter(e => e.modelId === selectedModelId);
    }, [selectedModelId, planningEvents]);

    // Handle selection of a model
    const handleSelectModel = (mId: string) => {
        setSelectedModelId(mId);
        setSelectedEventId('');
        const m = models.find(x => x.id === mId);
        if (m) {
            setClientName(m.ficheData?.client || '');
            setSam(m.meta_data?.total_temps || 15);
            // Default quantity and details
            setQuantity(m.ficheData?.quantity || 1000);
            setOrderCode(m.meta_data?.reference || 'Simul-1');
            
            // Set launch to today
            setStartDate(new Date().toISOString().slice(0, 10));
            // Set delivery date to 2 weeks from now by default
            const twoWeeks = new Date();
            twoWeeks.setDate(twoWeeks.getDate() + 14);
            setStrictDeadline_DDS(twoWeeks.toISOString().slice(0, 10));
            
            // Set first chain as default
            if (chains.length > 0) {
                const defaultChain = chains[0];
                setSelectedChainId(defaultChain.id);
                setNumWorkers(settings.chainOperators?.[defaultChain.id] ?? 30);
                setEfficiency(defaultChain.efficiency || 0.85);
            }
        }
    };

    // Handle selection of an existing planning event/lot to simulate
    const handleSelectEvent = (eId: string) => {
        setSelectedEventId(eId);
        const ev = planningEvents.find(e => e.id === eId);
        if (ev) {
            setClientName(ev.clientName || '');
            setQuantity(ev.totalQuantity || ev.qteTotal || 0);
            
            // Parse event order code from name (e.g. Model — L1)
            const name = ev.modelName || '';
            const suffix = name.includes(' — ') ? name.split(' — ').slice(1).join(' — ') : name;
            setOrderCode(suffix.trim() || 'L1');
            
            setStartDate(ev.startDate || ev.dateLancement || new Date().toISOString().slice(0, 10));
            setStrictDeadline_DDS(ev.strictDeadline_DDS || ev.dateExport || '');
            
            if (ev.chaineId) {
                setSelectedChainId(ev.chaineId);
                // Prefill workers from settings or fallback to 30
                setNumWorkers(settings.chainOperators?.[ev.chaineId] ?? 30);
            }
            
            const m = models.find(x => x.id === ev.modelId);
            if (m) {
                setSam(m.meta_data?.total_temps || 15);
                setEfficiency(m.ficheData?.targetEfficiency ? (m.ficheData.targetEfficiency / 100) : 0.85);
            }
        }
    };

    // Update workers when chain changes
    useEffect(() => {
        if (selectedChainId && !selectedEventId) {
            setNumWorkers(settings.chainOperators?.[selectedChainId] ?? 30);
            const chain = chains.find(c => c.id === selectedChainId);
            if (chain && chain.efficiency) {
                setEfficiency(chain.efficiency);
            }
        }
    }, [selectedChainId, settings, chains, selectedEventId]);

    // Helpers to count working days between dates
    const countWorkingDaysBetween = (startIso: string, endIso: string): number => {
        if (!startIso || !endIso || startIso >= endIso) return 0;
        let count = 0;
        const current = parsePlanningDateAtNoon(startIso);
        const end = parsePlanningDateAtNoon(endIso);
        
        let safety = 0;
        while (current < end && safety < 1000) {
            safety++;
            current.setDate(current.getDate() + 1);
            if (isPlanningWorkingDay(current, settings)) {
                count++;
            }
        }
        return count;
    };

    // Calculate simulation outputs
    const simulationResult = useMemo(() => {
        if (!selectedModelId) return null;
        
        const workMins = getWorkMinutesPerDay(settings);
        // Daily Capacity
        const dailyCapacity = (numWorkers * workMins * efficiency) / Math.max(0.1, sam);
        
        // Days required
        const daysNeeded = dailyCapacity > 0 ? Math.ceil(quantity / dailyCapacity) : 1;
        
        // Estimated End Date
        const end = addWorkingDaysFromLaunchIso(startDate, Math.max(1, daysNeeded), settings);
        const estimatedEndStr = end.toISOString().slice(0, 10);
        
        // Available Working Days
        const availDays = countWorkingDaysBetween(startDate, strictDeadline_DDS);
        
        // Delay calculations
        const isLate = estimatedEndStr > strictDeadline_DDS;
        const delayDays = isLate ? countWorkingDaysBetween(strictDeadline_DDS, estimatedEndStr) : 0;
        const earlyDays = !isLate ? countWorkingDaysBetween(estimatedEndStr, strictDeadline_DDS) : 0;
        
        // Optimization formulas
        let requiredWorkers = numWorkers;
        let requiredEfficiency = efficiency;
        let maxInHouseQty = 0;
        let outsourceQty = quantity;
        
        if (availDays > 0) {
            // Workers required to finish in availDays
            const requiredCapacity = quantity / availDays;
            requiredWorkers = Math.ceil((requiredCapacity * sam) / (workMins * efficiency));
            
            // Efficiency required to finish in availDays
            requiredEfficiency = (quantity * sam) / (numWorkers * workMins * availDays);
            
            // Max internal qty produced in availDays
            maxInHouseQty = Math.floor(availDays * dailyCapacity);
            outsourceQty = Math.max(0, quantity - maxInHouseQty);
        } else {
            outsourceQty = quantity;
            maxInHouseQty = 0;
        }
        
        return {
            dailyCapacity,
            daysNeeded,
            estimatedEndDate: estimatedEndStr,
            availDays,
            isLate,
            delayDays,
            earlyDays,
            requiredWorkers,
            requiredEfficiency,
            maxInHouseQty,
            outsourceQty
        };
    }, [selectedModelId, numWorkers, efficiency, sam, quantity, startDate, strictDeadline_DDS, settings]);

    // Handle split action (saving split events to planning)
    const handleConfirmSplit = () => {
        if (!simulationResult || !selectedModel) return;
        
        const inHouse = simulationResult.maxInHouseQty;
        const outsource = simulationResult.outsourceQty;
        
        if (inHouse <= 0) {
            // All must be outsourced
            eventsApi.addEvent({
                modelId: selectedModelId,
                chaineId: selectedChainId,
                startDate: startDate,
                quantity: outsource,
                clientName: clientName,
                strictDeadline_DDS: strictDeadline_DDS,
                color: '#e11d48', // Subcontract color
                isSubcontracted: true,
                subcontractorName: subcontractorName || 'Sous-traitant Externe',
                subcontractStatus: 'PENDING',
                subcontractorPhone: subcontractorPhone,
                subcontractPricePerPiece: subcontractPrice,
            });
            showToast(`Commande entièrement sous-traitée de ${outsource} pcs créée !`, 'success');
        } else {
            // Split case
            // 1. Create/Update In-house event
            if (selectedEventId) {
                // Modify existing
                eventsApi.updateEvent(selectedEventId, {
                    totalQuantity: inHouse,
                    qteTotal: inHouse,
                    chaineId: selectedChainId,
                    startDate: startDate,
                    dateLancement: startDate,
                    strictDeadline_DDS: strictDeadline_DDS,
                });
            } else {
                // Create new in-house
                eventsApi.addEvent({
                    modelId: selectedModelId,
                    chaineId: selectedChainId,
                    startDate: startDate,
                    quantity: inHouse,
                    clientName: clientName,
                    strictDeadline_DDS: strictDeadline_DDS,
                });
            }
            
            // 2. Create subcontract event
            eventsApi.addEvent({
                modelId: selectedModelId,
                chaineId: selectedChainId,
                startDate: startDate,
                quantity: outsource,
                clientName: clientName,
                strictDeadline_DDS: strictDeadline_DDS,
                color: '#f43f5e', // Subcontract pinkish red
                isSubcontracted: true,
                subcontractorName: subcontractorName || 'Sous-traitant Externe',
                subcontractStatus: 'PENDING',
                subcontractorPhone: subcontractorPhone,
                subcontractPricePerPiece: subcontractPrice,
            });
            
            showToast(`Fractionnement réussi ! Interne: ${inHouse} pcs | Sous-traitance: ${outsource} pcs`, 'success');
        }
        
        setShowSplitConfirm(false);
        // Clear subcontractor form
        setSubcontractorName('');
        setSubcontractorPhone('');
        setSubcontractPrice(0);
    };

    // Format date nicely
    const formatDateFr = (iso: string) => {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    return (
        <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
            {/* Header Title */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                        Simulateur de Production & de Planification
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                        Estimez les délais, ajustez les ressources en temps réel et optimisez le fractionnement (production vs sous-traitance).
                    </p>
                </div>
            </div>

            {/* Model & Order selector */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1. Sélection du Modèle */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col h-[280px]">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-indigo-500" />
                        1. Choisir un Modèle
                    </h3>
                    <div className="relative mb-3">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input 
                            type="text" 
                            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none" 
                            placeholder="Rechercher un modèle..."
                            value={modelSearch}
                            onChange={e => setModelSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                        {filteredModels.map(m => {
                            const isSelected = selectedModelId === m.id;
                            const clientColor = getClientColor(m.ficheData?.client);
                            return (
                                <button
                                    key={m.id}
                                    onClick={() => handleSelectModel(m.id)}
                                    className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between border transition-all ${
                                        isSelected 
                                            ? 'border-indigo-500 bg-indigo-50/50 text-indigo-950 font-semibold' 
                                            : 'border-transparent hover:bg-slate-50 text-slate-700'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <span 
                                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                                            style={{ backgroundColor: clientColor || '#e2e8f0' }} 
                                        />
                                        <div className="truncate">
                                            <div className="font-bold truncate">{m.meta_data?.nom_modele}</div>
                                            <div className="text-[10px] text-slate-400 truncate">
                                                Ref: {m.meta_data?.reference || 'N/A'} | Client: {m.ficheData?.client || 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isSelected ? 'rotate-90 text-indigo-500' : ''}`} />
                                </button>
                            );
                        })}
                        {filteredModels.length === 0 && (
                            <div className="text-center py-8 text-xs text-slate-400">Aucun modèle trouvé</div>
                        )}
                    </div>
                </div>

                {/* 2. Sélection du Lot / Commande */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col h-[280px]">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-emerald-500" />
                        2. Sélectionner un Lot existant (Optionnel)
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                        {selectedModelId ? (
                            <>
                                <button
                                    onClick={() => {
                                        setSelectedEventId('');
                                        // Reset to model defaults
                                        handleSelectModel(selectedModelId);
                                    }}
                                    className={`w-full text-left p-2.5 rounded-lg text-xs border transition-all flex items-center justify-between ${
                                        selectedEventId === ''
                                            ? 'border-emerald-500 bg-emerald-50/30 text-emerald-950 font-semibold'
                                            : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                                    }`}
                                >
                                    <div>
                                        <div className="font-bold">Nouvelle Simulation Libre</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">Saisir les paramètres manuellement</div>
                                    </div>
                                    {selectedEventId === '' && <Check className="w-4 h-4 text-emerald-600" />}
                                </button>
                                
                                {modelEvents.map(ev => {
                                    const isSelected = selectedEventId === ev.id;
                                    const name = ev.modelName || '';
                                    const suffix = name.includes(' — ') ? name.split(' — ').slice(1).join(' — ') : name;
                                    const qty = ev.totalQuantity || ev.qteTotal || 0;
                                    
                                    return (
                                        <button
                                            key={ev.id}
                                            onClick={() => handleSelectEvent(ev.id)}
                                            className={`w-full text-left p-2.5 rounded-lg text-xs border transition-all flex items-center justify-between ${
                                                isSelected
                                                    ? 'border-indigo-500 bg-indigo-50/40 text-indigo-950 font-semibold'
                                                    : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                                            }`}
                                        >
                                            <div>
                                                <div className="font-bold flex items-center gap-1.5">
                                                    <span>Lot : {suffix}</span>
                                                    {ev.isSubcontracted && (
                                                        <span className="bg-rose-100 text-rose-800 px-1 py-0.2 rounded text-[9px]">S/T</span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">
                                                    Qte: {qty} pcs | DDS: {ev.strictDeadline_DDS || 'Non définie'}
                                                </div>
                                            </div>
                                            {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                                        </button>
                                    );
                                })}
                                
                                {modelEvents.length === 0 && (
                                    <div className="text-center py-8 text-xs text-slate-400">
                                        Aucun ordre planifié pour ce modèle.
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="h-full flex items-center justify-center text-center p-6 text-xs text-slate-400">
                                Sélectionnez d'abord un modèle sur la gauche pour afficher ses commandes.
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Récapitulatif du Modèle Sélectionné */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col h-[280px]">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-blue-500" />
                        Informations Modèle
                    </h3>
                    {selectedModel ? (
                        <div className="flex-1 flex flex-col justify-between text-xs space-y-2">
                            <div className="space-y-2">
                                <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                    <span className="text-slate-500 font-medium">Modèle :</span>
                                    <span className="font-bold text-slate-800">{selectedModel.meta_data?.nom_modele}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                    <span className="text-slate-500 font-medium">Référence :</span>
                                    <span className="font-semibold text-slate-700">{selectedModel.meta_data?.reference || '—'}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                    <span className="text-slate-500 font-medium">Client initial :</span>
                                    <span className="font-semibold text-slate-700">{selectedModel.ficheData?.client || '—'}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                    <span className="text-slate-500 font-medium">Temps unitaire (SAM) :</span>
                                    <span className="font-bold text-[#2149C1]">{sam} minutes</span>
                                </div>
                            </div>

                            {/* Selected model image (Disabled) */}
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-center p-6 text-xs text-slate-400">
                            Sélectionnez un modèle pour voir ses détails techniques.
                        </div>
                    )}
                </div>
            </div>

            {selectedModelId && simulationResult && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    
                    {/* Colonne gauche : Curseurs & Paramètres de simulation */}
                    <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
                        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                            <Sliders className="w-4 h-4 text-indigo-500" />
                            Ajuster les Paramètres de Simulation
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Date de lancement */}
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Date de Lancement</label>
                                <DateTimePicker
                                    value={startDate}
                                    onChange={(iso) => setStartDate(iso.split('T')[0])}
                                    mode="date"
                                    settings={settings}
                                    inputClassName="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-left text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>

                            {/* Date de livraison client (DDS) */}
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Date de Livraison Limite (DDS)</label>
                                <DateTimePicker
                                    value={strictDeadline_DDS}
                                    onChange={(iso) => setStrictDeadline_DDS(iso.split('T')[0])}
                                    mode="date"
                                    settings={settings}
                                    inputClassName="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-left text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>

                            {/* Chaine de production */}
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Chaîne de Production</label>
                                <select 
                                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    value={selectedChainId}
                                    onChange={(e) => setSelectedChainId(e.target.value)}
                                >
                                    {chains.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Quantité totale */}
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Quantité (Pièces)</label>
                                <input 
                                    type="number"
                                    min={1}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    value={quantity}
                                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 0))}
                                />
                            </div>

                            {/* Client & Code de commande */}
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Nom du Client</label>
                                <input 
                                    type="text"
                                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                    placeholder="Ex. BERA"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Code/Lot Commande</label>
                                <input 
                                    type="text"
                                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    value={orderCode}
                                    onChange={(e) => setOrderCode(e.target.value)}
                                    placeholder="Ex. L1"
                                />
                            </div>
                        </div>

                        {/* Sliders d'effectifs et de rendement */}
                        <div className="space-y-4 pt-3 border-t border-slate-100">
                            {/* Sliders Effectif */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-slate-600 flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5 text-slate-500" />
                                        Effectif (Nombre d'ouvriers) :
                                    </span>
                                    <span className="font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-[11px] min-w-[40px] text-center">
                                        {numWorkers}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="range"
                                        min={1}
                                        max={100}
                                        className="flex-1 accent-indigo-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none"
                                        value={numWorkers}
                                        onChange={e => setNumWorkers(parseInt(e.target.value, 10))}
                                    />
                                    <input 
                                        type="number"
                                        min={1}
                                        max={150}
                                        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-center"
                                        value={numWorkers}
                                        onChange={e => setNumWorkers(Math.max(1, parseInt(e.target.value, 10) || 0))}
                                    />
                                </div>
                            </div>

                            {/* Sliders Rendement */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-slate-600 flex items-center gap-1.5">
                                        <Percent className="w-3.5 h-3.5 text-slate-500" />
                                        Rendement / Efficacité :
                                    </span>
                                    <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[11px] min-w-[40px] text-center">
                                        {(efficiency * 100).toFixed(0)}%
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="range"
                                        min={10}
                                        max={120}
                                        className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none"
                                        value={Math.round(efficiency * 100)}
                                        onChange={e => setEfficiency(parseInt(e.target.value, 10) / 100)}
                                    />
                                    <input 
                                        type="number"
                                        min={10}
                                        max={150}
                                        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-center"
                                        value={Math.round(efficiency * 100)}
                                        onChange={e => setEfficiency((parseInt(e.target.value, 10) || 0) / 100)}
                                    />
                                </div>
                            </div>

                            {/* Slider SAM (Temps unitaire) */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-slate-600 flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                                        Temps unitaire (SAM en minutes) :
                                    </span>
                                    <span className="font-black text-[#2149C1] bg-blue-50 px-2 py-0.5 rounded text-[11px] min-w-[40px] text-center">
                                        {sam} min
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="range"
                                        min={1}
                                        max={60}
                                        step={0.5}
                                        className="flex-1 accent-[#2149C1] cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none"
                                        value={sam}
                                        onChange={e => setSam(parseFloat(e.target.value))}
                                    />
                                    <input 
                                        type="number"
                                        min={0.1}
                                        step={0.1}
                                        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-center"
                                        value={sam}
                                        onChange={e => setSam(Math.max(0.1, parseFloat(e.target.value) || 0))}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Colonne droite : Résultats & Recommandations d'optimisation */}
                    <div className="space-y-6">
                        
                        {/* A. Résultats de la Simulation */}
                        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                                <TrendingUp className="w-4 h-4 text-indigo-500" />
                                Résultats d'Estimation
                            </h3>

                            {/* Date de livraison vs Date estimée */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <div className="text-xs text-slate-500 font-medium">Fin Estimée :</div>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-slate-800">
                                            {formatDateFr(simulationResult.estimatedEndDate)}
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            ({simulationResult.daysNeeded} jours ouvrés requis)
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <div className="text-xs text-slate-500 font-medium">Délai Client (DDS) :</div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-slate-700">
                                            {formatDateFr(strictDeadline_DDS)}
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            ({simulationResult.availDays} jours ouvrés dispo)
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Statut (En avance ou en retard) */}
                            {simulationResult.isLate ? (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5">
                                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="text-xs font-black text-rose-800 uppercase tracking-wide">DDS Dépassée ! Retard constaté</h4>
                                        <p className="text-[11px] text-rose-700 mt-1">
                                            La production prendra **{simulationResult.delayDays} jours ouvrés** de retard par rapport à la date de livraison.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wide">Production dans les Temps</h4>
                                        <p className="text-[11px] text-emerald-700 mt-1">
                                            Vous finirez la production **{simulationResult.earlyDays} jours ouvrés** avant la livraison.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Statistiques rapides */}
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div className="border border-slate-100 rounded-lg p-2.5 text-center">
                                    <div className="text-[10px] text-slate-400 font-medium">Production Jour</div>
                                    <div className="text-sm font-black text-slate-800 mt-0.5">
                                        {Math.round(simulationResult.dailyCapacity)} <span className="text-[10px] text-slate-400">pcs/j</span>
                                    </div>
                                </div>
                                <div className="border border-slate-100 rounded-lg p-2.5 text-center">
                                    <div className="text-[10px] text-slate-400 font-medium">TRS / Efficacité</div>
                                    <div className="text-sm font-black text-slate-800 mt-0.5">
                                        {(efficiency * 100).toFixed(0)}%
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* B. Recommandations d'optimisation */}
                        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                                <UserCheck className="w-4 h-4 text-emerald-600" />
                                Solutions Recommandées
                            </h3>

                            {simulationResult.isLate ? (
                                <div className="space-y-4 text-xs">
                                    
                                    {/* 1. Augmenter effectif */}
                                    {simulationResult.requiredWorkers > 0 && simulationResult.requiredWorkers < 150 && (
                                        <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                            <div className="font-bold text-slate-700">Option A : Augmenter l'Effectif</div>
                                            <div className="text-slate-500 text-[11px] mt-1">
                                                En passant à un effectif de <span className="font-bold text-indigo-600">{simulationResult.requiredWorkers}</span> ouvriers, vous terminerez à temps.
                                            </div>
                                            <button 
                                                onClick={() => setNumWorkers(simulationResult.requiredWorkers)}
                                                className="mt-2.5 w-full bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
                                            >
                                                <Users className="w-3.5 h-3.5" />
                                                Appliquer {simulationResult.requiredWorkers} ouvriers
                                            </button>
                                        </div>
                                    )}

                                    {/* 2. Améliorer rendement */}
                                    {simulationResult.requiredEfficiency > 0 && simulationResult.requiredEfficiency <= 1.2 && (
                                        <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                            <div className="font-bold text-slate-700">Option B : Améliorer le Rendement</div>
                                            <div className="text-slate-500 text-[11px] mt-1">
                                                Un rendement moyen de <span className="font-bold text-emerald-600">{(simulationResult.requiredEfficiency * 100).toFixed(0)}%</span> permet de respecter la DDS.
                                            </div>
                                            <button 
                                                onClick={() => setEfficiency(parseFloat(simulationResult.requiredEfficiency.toFixed(2)))}
                                                className="mt-2.5 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
                                            >
                                                <Percent className="w-3.5 h-3.5" />
                                                Appliquer {(simulationResult.requiredEfficiency * 100).toFixed(0)}% de rendement
                                            </button>
                                        </div>
                                    )}

                                    {/* 3. Sous-traitance */}
                                    <div className="border border-rose-100 rounded-xl p-3 bg-rose-50/20 hover:bg-rose-50/30 transition-colors">
                                        <div className="font-bold text-rose-800 flex items-center gap-1">
                                            <Split className="w-3.5 h-3.5 text-rose-600" />
                                            Option C : Sous-traitance (Monawla)
                                        </div>
                                        <div className="text-slate-600 text-[11px] mt-1.5 space-y-1">
                                            <div>
                                                • Production en interne : <span className="font-bold text-slate-800">{simulationResult.maxInHouseQty}</span> pcs (jusqu'au {formatDateFr(strictDeadline_DDS)}).
                                            </div>
                                            <div>
                                                • Quantité à sous-traiter : <span className="font-black text-rose-600">{simulationResult.outsourceQty}</span> pcs.
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setShowSplitConfirm(true)}
                                            className="mt-3 w-full bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95"
                                        >
                                            <Truck className="w-3.5 h-3.5" />
                                            Appliquer le Plan de Sous-traitance
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 text-xs">
                                    <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                                        <div className="font-bold text-emerald-800">Aucune surcharge détectée</div>
                                        <p className="text-[11px] text-emerald-700 mt-1 leading-relaxed">
                                            La capacité interne est suffisante. Si besoin, vous pouvez libérer du personnel pour d'autres commandes.
                                        </p>
                                    </div>
                                    
                                    {/* Option to reduce worker count and optimize */}
                                    {simulationResult.requiredWorkers > 0 && simulationResult.requiredWorkers < numWorkers && (
                                        <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                                            <div className="font-bold text-slate-700">Libérer des opérateurs ?</div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                Vous pouvez descendre à <span className="font-bold text-slate-700">{simulationResult.requiredWorkers}</span> ouvriers et finir de produire à temps.
                                            </div>
                                            <button 
                                                onClick={() => setNumWorkers(simulationResult.requiredWorkers)}
                                                className="mt-2 w-full border border-indigo-150 hover:bg-indigo-50 text-indigo-600 text-[11px] font-bold py-1 px-3 rounded-lg transition-colors"
                                            >
                                                Appliquer {simulationResult.requiredWorkers} ouvriers
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE CONFIRMATION DE SCINDEMENT / SOUS-TRAITANCE */}
            {showSplitConfirm && simulationResult && selectedModel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-5 flex flex-col space-y-4 animate-in zoom-in-95 duration-200">
                        
                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                                <Split className="w-4 h-4 text-rose-500" />
                                Fractionnement de la Commande
                            </h4>
                            <button 
                                onClick={() => setShowSplitConfirm(false)}
                                className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Récapitulatif du Split */}
                        <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-2 border border-slate-100">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Modèle :</span>
                                <span className="font-bold text-slate-800">{selectedModel.meta_data?.nom_modele}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-100 pt-1.5">
                                <span className="text-slate-500">Quantité en interne :</span>
                                <span className="font-black text-slate-800">{simulationResult.maxInHouseQty} pcs</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-100 pt-1.5 text-rose-700">
                                <span className="font-bold">Quantité sous-traitée (Monawla) :</span>
                                <span className="font-black">{simulationResult.outsourceQty} pcs</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-100 pt-1.5">
                                <span className="text-slate-500">DDS finale :</span>
                                <span className="font-bold text-slate-700">{formatDateFr(strictDeadline_DDS)}</span>
                            </div>
                        </div>

                        {/* Formulaire sous-traitant */}
                        <div className="space-y-3 text-xs">
                            <div className="font-bold text-slate-700">Paramètres du Sous-traitant</div>
                            
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Nom du Sous-traitant</label>
                                <input 
                                    type="text" 
                                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-semibold"
                                    placeholder="Ex. Atelier Al-Amal"
                                    value={subcontractorName}
                                    onChange={e => setSubcontractorName(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Téléphone</label>
                                    <input 
                                        type="text" 
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-semibold"
                                        placeholder="Ex. 0612345678"
                                        value={subcontractorPhone}
                                        onChange={e => setSubcontractorPhone(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Prix Unitaire (DH)</label>
                                    <input 
                                        type="number" 
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-semibold"
                                        placeholder="Ex. 4.5"
                                        value={subcontractPrice}
                                        onChange={e => setSubcontractPrice(parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                onClick={() => setShowSplitConfirm(false)}
                                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleConfirmSplit}
                                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
                            >
                                Confirmer et Planifier
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
