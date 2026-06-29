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
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

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
    const { lang } = useLang();
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
                subcontractorName: subcontractorName || tx(lang,{fr:'Sous-traitant Externe',ar:'مقاول خارجي',en:'External Subcontractor',es:'Subcontratista Externo',pt:'Subcontratante Externo',tr:'Harici Taşeron'}),
                subcontractStatus: 'PENDING',
                subcontractorPhone: subcontractorPhone,
                subcontractPricePerPiece: subcontractPrice,
            });
            showToast(tx(lang,{fr:`Commande entièrement sous-traitée de ${outsource} pcs créée !`,ar:`تم إنشاء الطلب بالكامل كتعاقد من الباطن بقيمة ${outsource} قطعة!`,en:`Order fully subcontracted for ${outsource} pcs created!`,es:`¡Pedido completamente subcontratado de ${outsource} pzs creado!`,pt:`Pedido totalmente subcontratado de ${outsource} pcs criado!`,tr:`${outsource} adet için tamamen taşere edilen sipariş oluşturuldu!`}), 'success');
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
                subcontractorName: subcontractorName || tx(lang,{fr:'Sous-traitant Externe',ar:'مقاول خارجي',en:'External Subcontractor',es:'Subcontratista Externo',pt:'Subcontratante Externo',tr:'Harici Taşeron'}),
                subcontractStatus: 'PENDING',
                subcontractorPhone: subcontractorPhone,
                subcontractPricePerPiece: subcontractPrice,
            });
            
            showToast(tx(lang,{fr:`Fractionnement réussi ! Interne: ${inHouse} pcs | Sous-traitance: ${outsource} pcs`,ar:`تم التقسيم بنجاح! داخلي: ${inHouse} قطعة | تعاقد من الباطن: ${outsource} قطعة`,en:`Split successful! In-house: ${inHouse} pcs | Subcontract: ${outsource} pcs`,es:`¡División exitosa! Interno: ${inHouse} pzs | Subcontrato: ${outsource} pzs`,pt:`Divisão bem-sucedida! Interno: ${inHouse} pcs | Subcontrato: ${outsource} pcs`,tr:`Başarılı bölme! Dahili: ${inHouse} adet | Taşeron: ${outsource} adet`}), 'success');
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-dk-border pb-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-dk-text flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                        {tx(lang,{fr:'Simulateur de Production & de Planification',ar:'محاكي الإنتاج والتخطيط',en:'Production & Planning Simulator',es:'Simulador de Producción y Planificación',pt:'Simulador de Produção e Planeamento',tr:'Üretim ve Planlama Simülatörü'})}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-dk-muted mt-1">
                        {tx(lang,{fr:"Estimez les délais, ajustez les ressources en temps réel et optimisez le fractionnement (production vs sous-traitance).",ar:"قم بتقدير المهل، وضبط الموارد في الوقت الفعلي، وتحسين التقسيم (الإنتاج مقابل التعاقد من الباطن).",en:"Estimate deadlines, adjust resources in real-time and optimize splitting (production vs subcontracting).",es:"Estime los plazos, ajuste los recursos en tiempo real y optimice la división (producción vs subcontratación).",pt:"Estime prazos, ajuste recursos em tempo real e otimize a divisão (produção vs subcontratação).",tr:"Teslim tarihlerini tahmin edin, kaynakları gerçek zamanlı ayarlayın ve bölmeyi optimize edin (üretim vs taşeron)."})}
                    </p>
                </div>
            </div>

            {/* Model & Order selector */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1. Sélection du Modèle */}
                <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-4 shadow-sm dark:shadow-dk-sm flex flex-col h-[280px]">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-indigo-500" />
                        {tx(lang,{fr:'1. Choisir un Modèle',ar:'1. اختر نموذجًا',en:'1. Choose a Model',es:'1. Elegir un Modelo',pt:'1. Escolher um Modelo',tr:'1. Bir Model Seçin'})}
                    </h3>
                    <div className="relative mb-3">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-dk-muted" />
                        <input 
                            type="text" 
                            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none" 
                            placeholder={tx(lang,{fr:'Rechercher un modèle...',ar:'ابحث عن نموذج...',en:'Search for a model...',es:'Buscar un modelo...',pt:'Pesquisar um modelo...',tr:'Model ara...'})}
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
                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-indigo-900/20 text-indigo-950 font-semibold' 
                                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-slate-700 dark:text-dk-text-soft'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <span 
                                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                                            style={{ backgroundColor: clientColor || '#e2e8f0' }} 
                                        />
                                        <div className="truncate">
                                            <div className="font-bold truncate">{m.meta_data?.nom_modele}</div>
                                            <div className="text-[10px] text-slate-400 dark:text-dk-muted truncate">
                                                {tx(lang,{fr:'Ref',ar:'المرجع',en:'Ref',es:'Ref',pt:'Ref',tr:'Ref'})}: {m.meta_data?.reference || 'N/A'} | {tx(lang,{fr:'Client',ar:'العميل',en:'Client',es:'Cliente',pt:'Cliente',tr:'Müşteri'})}: {m.ficheData?.client || 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight className={`w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${isSelected ? 'rotate-90 text-indigo-500' : ''}`} />
                                </button>
                            );
                        })}
                        {filteredModels.length === 0 && (
                            <div className="text-center py-8 text-xs text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Aucun modèle trouvé',ar:'لم يتم العثور على أي نموذج',en:'No model found',es:'Ningún modelo encontrado',pt:'Nenhum modelo encontrado',tr:'Model bulunamadı'})}</div>
                        )}
                    </div>
                </div>

                {/* 2. Sélection du Lot / Commande */}
                <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-4 shadow-sm dark:shadow-dk-sm flex flex-col h-[280px]">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-emerald-500" />
                        {tx(lang,{fr:'2. Sélectionner un Lot existant (Optionnel)',ar:'2. حدد دفعة موجودة (اختياري)',en:'2. Select an Existing Lot (Optional)',es:'2. Seleccionar un Lote existente (Opcional)',pt:'2. Selecionar um Lote existente (Opcional)',tr:'2. Mevcut Bir Parti Seçin (İsteğe Bağlı)'})}
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
                                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-950 font-semibold'
                                            : 'border-slate-100 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-slate-700 dark:text-dk-text-soft'
                                    }`}
                                >
                                    <div>
                                        <div className="font-bold">{tx(lang,{fr:'Nouvelle Simulation Libre',ar:'محاكاة حرة جديدة',en:'New Free Simulation',es:'Nueva Simulación Libre',pt:'Nova Simulação Livre',tr:'Yeni Serbest Simülasyon'})}</div>
                                        <div className="text-[10px] text-slate-400 dark:text-dk-muted mt-0.5">{tx(lang,{fr:'Saisir les paramètres manuellement',ar:'أدخل المعلمات يدويًا',en:'Enter parameters manually',es:'Introducir los parámetros manualmente',pt:'Inserir os parâmetros manualmente',tr:'Parametreleri manuel olarak girin'})}</div>
                                    </div>
                                    {selectedEventId === '' && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
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
                                                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-indigo-900/20 text-indigo-950 font-semibold'
                                                    : 'border-slate-100 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-slate-700 dark:text-dk-text-soft'
                                            }`}
                                        >
                                            <div>
                                                <div className="font-bold flex items-center gap-1.5">
                                                    <span>{tx(lang,{fr:'Lot',ar:'دفعة',en:'Lot',es:'Lote',pt:'Lote',tr:'Parti'})} : {suffix}</span>
                                                    {ev.isSubcontracted && (
                                                        <span className="bg-rose-100 text-rose-800 px-1 py-0.2 rounded text-[9px]">S/T</span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-slate-400 dark:text-dk-muted mt-0.5">
                                                    {tx(lang,{fr:'Qte',ar:'الكمية',en:'Qty',es:'Cant',pt:'Quant',tr:'Mik'})}: {qty} pcs | DDS: {ev.strictDeadline_DDS || tx(lang,{fr:'Non définie',ar:'غير محددة',en:'Undefined',es:'No definida',pt:'Não definida',tr:'Tanımlanmamış'})}
                                                </div>
                                            </div>
                                            {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" />}
                                        </button>
                                    );
                                })}
                                
                                {modelEvents.length === 0 && (
                                    <div className="text-center py-8 text-xs text-slate-400 dark:text-dk-muted">
                                        {tx(lang,{fr:'Aucun ordre planifié pour ce modèle.',ar:'لا توجد أوامر مخططة لهذا النموذج.',en:'No planned orders for this model.',es:'Ninguna orden planificada para este modelo.',pt:'Nenhuma ordem planeada para este modelo.',tr:'Bu model için planlanmış sipariş yok.'})}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="h-full flex items-center justify-center text-center p-6 text-xs text-slate-400 dark:text-dk-muted">
                                {tx(lang,{fr:"Sélectionnez d'abord un modèle sur la gauche pour afficher ses commandes.",ar:"حدد نموذجًا أولاً على اليسار لعرض أوامره.",en:"First select a model on the left to display its orders.",es:"Seleccione primero un modelo a la izquierda para mostrar sus órdenes.",pt:"Selecione primeiro um modelo à esquerda para mostrar as suas ordens.",tr:"Siparişlerini görüntülemek için önce soldan bir model seçin."})}
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Récapitulatif du Modèle Sélectionné */}
                <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-4 shadow-sm dark:shadow-dk-sm flex flex-col h-[280px]">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-blue-500" />
                        {tx(lang,{fr:'Informations Modèle',ar:'معلومات النموذج',en:'Model Information',es:'Información del Modelo',pt:'Informações do Modelo',tr:'Model Bilgileri'})}
                    </h3>
                    {selectedModel ? (
                        <div className="flex-1 flex flex-col justify-between text-xs space-y-2">
                            <div className="space-y-2">
                                <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                    <span className="text-slate-500 dark:text-dk-muted font-medium">{tx(lang,{fr:'Modèle',ar:'النموذج',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})} :</span>
                                    <span className="font-bold text-slate-800 dark:text-dk-text">{selectedModel.meta_data?.nom_modele}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                    <span className="text-slate-500 dark:text-dk-muted font-medium">{tx(lang,{fr:'Référence',ar:'المرجع',en:'Reference',es:'Referencia',pt:'Referência',tr:'Referans'})} :</span>
                                    <span className="font-semibold text-slate-700 dark:text-dk-text-soft">{selectedModel.meta_data?.reference || '—'}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                    <span className="text-slate-500 dark:text-dk-muted font-medium">{tx(lang,{fr:'Client initial',ar:'العميل الأولي',en:'Initial Client',es:'Cliente inicial',pt:'Cliente inicial',tr:'İlk Müşteri'})} :</span>
                                    <span className="font-semibold text-slate-700 dark:text-dk-text-soft">{selectedModel.ficheData?.client || '—'}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                    <span className="text-slate-500 dark:text-dk-muted font-medium">{tx(lang,{fr:'Temps unitaire (SAM)',ar:'الوقت الوحدة (SAM)',en:'Unit Time (SAM)',es:'Tiempo unitario (SAM)',pt:'Tempo unitário (SAM)',tr:'Birim Süre (SAM)'})} :</span>
                                    <span className="font-bold text-[#2149C1]">{sam} {tx(lang,{fr:'minutes',ar:'دقيقة',en:'minutes',es:'minutos',pt:'minutos',tr:'dakika'})}</span>
                                </div>
                            </div>

                            {/* Selected model image (Disabled) */}
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-center p-6 text-xs text-slate-400 dark:text-dk-muted">
                            {tx(lang,{fr:'Sélectionnez un modèle pour voir ses détails techniques.',ar:'حدد نموذجًا لعرض تفاصيله التقنية.',en:'Select a model to view its technical details.',es:'Seleccione un modelo para ver sus detalles técnicos.',pt:'Selecione um modelo para ver os seus detalhes técnicos.',tr:'Teknik detaylarını görmek için bir model seçin.'})}
                        </div>
                    )}
                </div>
            </div>

            {selectedModelId && simulationResult && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    
                    {/* Colonne gauche : Curseurs & Paramètres de simulation */}
                    <div className="lg:col-span-2 bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-5 shadow-sm dark:shadow-dk-sm space-y-5">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-dk-text border-b border-slate-100 dark:border-dk-border pb-2 flex items-center gap-1.5">
                            <Sliders className="w-4 h-4 text-indigo-500" />
                            {tx(lang,{fr:'Ajuster les Paramètres de Simulation',ar:'ضبط معلمات المحاكاة',en:'Adjust Simulation Parameters',es:'Ajustar los Parámetros de Simulación',pt:'Ajustar os Parâmetros de Simulação',tr:'Simülasyon Parametrelerini Ayarla'})}
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Date de lancement */}
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-dk-muted block mb-1">{tx(lang,{fr:'Date de Lancement',ar:'تاريخ الإطلاق',en:'Launch Date',es:'Fecha de Lanzamiento',pt:'Data de Lançamento',tr:'Başlangıç Tarihi'})}</label>
                                <DateTimePicker
                                    value={startDate}
                                    onChange={(iso) => setStartDate(iso.split('T')[0])}
                                    mode="date"
                                    settings={settings}
                                    inputClassName="w-full rounded-lg border border-slate-200 dark:border-dk-border px-3 py-1.5 text-left text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>

                            {/* Date de livraison client (DDS) */}
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-dk-muted block mb-1">{tx(lang,{fr:'Date de Livraison Limite (DDS)',ar:'تاريخ التسليم النهائي (DDS)',en:'Delivery Deadline (DDS)',es:'Fecha de Entrega Límite (DDS)',pt:'Prazo de Entrega Limite (DDS)',tr:'Teslim Son Tarihi (DDS)'})}</label>
                                <DateTimePicker
                                    value={strictDeadline_DDS}
                                    onChange={(iso) => setStrictDeadline_DDS(iso.split('T')[0])}
                                    mode="date"
                                    settings={settings}
                                    inputClassName="w-full rounded-lg border border-slate-200 dark:border-dk-border px-3 py-1.5 text-left text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>

                            {/* Chaine de production */}
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-dk-muted block mb-1">{tx(lang,{fr:'Chaîne de Production',ar:'خط الإنتاج',en:'Production Line',es:'Línea de Producción',pt:'Linha de Produção',tr:'Üretim Hattı'})}</label>
                                <select 
                                    className="w-full rounded-lg border border-slate-200 dark:border-dk-border px-3 py-1.5 text-xs font-semibold bg-white dark:bg-dk-surface focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-dk-muted block mb-1">{tx(lang,{fr:'Quantité (Pièces)',ar:'الكمية (قطع)',en:'Quantity (Pieces)',es:'Cantidad (Piezas)',pt:'Quantidade (Peças)',tr:'Miktar (Adet)'})}</label>
                                <input 
                                    type="number"
                                    min={1}
                                    className="w-full rounded-lg border border-slate-200 dark:border-dk-border px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    value={quantity}
                                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 0))}
                                />
                            </div>

                            {/* Client & Code de commande */}
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-dk-muted block mb-1">{tx(lang,{fr:'Nom du Client',ar:'اسم العميل',en:'Client Name',es:'Nombre del Cliente',pt:'Nome do Cliente',tr:'Müşteri Adı'})}</label>
                                <input 
                                    type="text"
                                    className="w-full rounded-lg border border-slate-200 dark:border-dk-border px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                    placeholder={tx(lang,{fr:'Ex. BERA',ar:'مثال: BERA',en:'E.g. BERA',es:'Ej. BERA',pt:'Ex. BERA',tr:'Örn. BERA'})}
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-dk-muted block mb-1">{tx(lang,{fr:'Code/Lot Commande',ar:'رمز/دفعة الأمر',en:'Order Code/Lot',es:'Código/Lote de Pedido',pt:'Código/Lote de Encomenda',tr:'Sipariş Kodu/Partisi'})}</label>
                                <input 
                                    type="text"
                                    className="w-full rounded-lg border border-slate-200 dark:border-dk-border px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    value={orderCode}
                                    onChange={(e) => setOrderCode(e.target.value)}
                                    placeholder={tx(lang,{fr:'Ex. L1',ar:'مثال: L1',en:'E.g. L1',es:'Ej. L1',pt:'Ex. L1',tr:'Örn. L1'})}
                                />
                            </div>
                        </div>

                        {/* Sliders d'effectifs et de rendement */}
                        <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-dk-border">
                            {/* Sliders Effectif */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-slate-600 dark:text-dk-text-soft flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5 text-slate-500 dark:text-dk-muted" />
                                        {tx(lang,{fr:"Effectif (Nombre d'ouvriers)",ar:'العمالة (عدد العمال)',en:'Workforce (Number of workers)',es:'Personal (Número de trabajadores)',pt:'Efetivo (Número de trabalhadores)',tr:'İşgücü (İşçi sayısı)'})} :
                                    </span>
                                    <span className="font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 px-2 py-0.5 rounded text-[11px] min-w-[40px] text-center">
                                        {numWorkers}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="range"
                                        min={1}
                                        max={100}
                                        className="flex-1 accent-indigo-600 cursor-pointer h-1.5 bg-slate-100 dark:bg-dk-elevated rounded-lg appearance-none"
                                        value={numWorkers}
                                        onChange={e => setNumWorkers(parseInt(e.target.value, 10))}
                                    />
                                    <input 
                                        type="number"
                                        min={1}
                                        max={150}
                                        className="w-16 rounded-lg border border-slate-200 dark:border-dk-border px-2 py-1 text-xs font-bold text-center"
                                        value={numWorkers}
                                        onChange={e => setNumWorkers(Math.max(1, parseInt(e.target.value, 10) || 0))}
                                    />
                                </div>
                            </div>

                            {/* Sliders Rendement */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-slate-600 dark:text-dk-text-soft flex items-center gap-1.5">
                                        <Percent className="w-3.5 h-3.5 text-slate-500 dark:text-dk-muted" />
                                        {tx(lang,{fr:'Rendement / Efficacité',ar:'الإنتاجية / الكفاءة',en:'Yield / Efficiency',es:'Rendimiento / Eficiencia',pt:'Rendimento / Eficiência',tr:'Verim / Etkinlik'})} :
                                    </span>
                                    <span className="font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded text-[11px] min-w-[40px] text-center">
                                        {(efficiency * 100).toFixed(0)}%
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="range"
                                        min={10}
                                        max={120}
                                        className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-slate-100 dark:bg-dk-elevated rounded-lg appearance-none"
                                        value={Math.round(efficiency * 100)}
                                        onChange={e => setEfficiency(parseInt(e.target.value, 10) / 100)}
                                    />
                                    <input 
                                        type="number"
                                        min={10}
                                        max={150}
                                        className="w-16 rounded-lg border border-slate-200 dark:border-dk-border px-2 py-1 text-xs font-bold text-center"
                                        value={Math.round(efficiency * 100)}
                                        onChange={e => setEfficiency((parseInt(e.target.value, 10) || 0) / 100)}
                                    />
                                </div>
                            </div>

                            {/* Slider SAM (Temps unitaire) */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-slate-600 dark:text-dk-text-soft flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-dk-muted" />
                                        {tx(lang,{fr:'Temps unitaire (SAM en minutes)',ar:'الوقت الوحدوي (SAM بالدقائق)',en:'Unit Time (SAM in minutes)',es:'Tiempo unitario (SAM en minutos)',pt:'Tempo unitário (SAM em minutos)',tr:'Birim Süre (SAM dakika olarak)'})} :
                                    </span>
                                    <span className="font-black text-[#2149C1] bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded text-[11px] min-w-[40px] text-center">
                                        {sam} min
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="range"
                                        min={1}
                                        max={60}
                                        step={0.5}
                                        className="flex-1 accent-[#2149C1] cursor-pointer h-1.5 bg-slate-100 dark:bg-dk-elevated rounded-lg appearance-none"
                                        value={sam}
                                        onChange={e => setSam(parseFloat(e.target.value))}
                                    />
                                    <input 
                                        type="number"
                                        min={0.1}
                                        step={0.1}
                                        className="w-16 rounded-lg border border-slate-200 dark:border-dk-border px-2 py-1 text-xs font-bold text-center"
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
                        <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-5 shadow-sm dark:shadow-dk-sm space-y-4">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-dk-text border-b border-slate-100 dark:border-dk-border pb-2 flex items-center gap-1.5">
                                <TrendingUp className="w-4 h-4 text-indigo-500" />
                                {tx(lang,{fr:"Résultats d'Estimation",ar:'نتائج التقدير',en:'Estimation Results',es:'Resultados de Estimación',pt:'Resultados da Estimativa',tr:'Tahmin Sonuçları'})}
                            </h3>

                            {/* Date de livraison vs Date estimée */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border">
                                    <div className="text-xs text-slate-500 dark:text-dk-muted font-medium">{tx(lang,{fr:'Fin Estimée',ar:'النهاية المقدرة',en:'Estimated End',es:'Fin Estimado',pt:'Fim Estimado',tr:'Tahmini Bitiş'})} :</div>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-slate-800 dark:text-dk-text">
                                            {formatDateFr(simulationResult.estimatedEndDate)}
                                        </div>
                                        <div className="text-[10px] text-slate-400 dark:text-dk-muted">
                                            ({simulationResult.daysNeeded} {tx(lang,{fr:'jours ouvrés requis',ar:'أيام عمل مطلوبة',en:'working days required',es:'días hábiles requeridos',pt:'dias úteis necessários',tr:'gerekli iş günü'})})
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border">
                                    <div className="text-xs text-slate-500 dark:text-dk-muted font-medium">{tx(lang,{fr:'Délai Client (DDS)',ar:'مهلة العميل (DDS)',en:'Customer Deadline (DDS)',es:'Plazo del Cliente (DDS)',pt:'Prazo do Cliente (DDS)',tr:'Müşteri Teslim Tarihi (DDS)'})} :</div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">
                                            {formatDateFr(strictDeadline_DDS)}
                                        </div>
                                        <div className="text-[10px] text-slate-400 dark:text-dk-muted">
                                            ({simulationResult.availDays} {tx(lang,{fr:'jours ouvrés dispo',ar:'أيام عمل متاحة',en:'working days available',es:'días hábiles disponibles',pt:'dias úteis disponíveis',tr:'mevcut iş günü'})})
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Statut (En avance ou en retard) */}
                            {simulationResult.isLate ? (
                                <div className="p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 rounded-xl flex items-start gap-2.5">
                                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="text-xs font-black text-rose-800 uppercase tracking-wide">{tx(lang,{fr:'DDS Dépassée ! Retard constaté',ar:'تجاوز DDS! تأخر ملاحظ',en:'DDS Exceeded! Delay observed',es:'¡DDS Superada! Retraso constatado',pt:'DDS Excedida! Atraso constatado',tr:'DDS Aşıldı! Gecikme Tespit Edildi'})}</h4>
                                        <p className="text-[11px] text-rose-700 mt-1">
                                            {tx(lang,{fr:`La production prendra ${simulationResult.delayDays} jours ouvrés de retard par rapport à la date de livraison.`,ar:`سيتأخر الإنتاج بمقدار ${simulationResult.delayDays} يوم عمل عن تاريخ التسليم.`,en:`Production will be ${simulationResult.delayDays} working days late compared to the delivery date.`,es:`La producción se retrasará ${simulationResult.delayDays} días hábiles respecto a la fecha de entrega.`,pt:`A produção terá um atraso de ${simulationResult.delayDays} dias úteis em relação à data de entrega.`,tr:`Üretim, teslim tarihine göre ${simulationResult.delayDays} iş günü gecikecektir.`})}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 rounded-xl flex items-start gap-2.5">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wide">{tx(lang,{fr:'Production dans les Temps',ar:'الإنتاج في الوقت المحدد',en:'On-Time Production',es:'Producción a Tiempo',pt:'Produção dentro do Prazo',tr:'Zamanında Üretim'})}</h4>
                                        <p className="text-[11px] text-emerald-700 mt-1">
                                            {tx(lang,{fr:`Vous finirez la production ${simulationResult.earlyDays} jours ouvrés avant la livraison.`,ar:`ستنهي الإنتاج قبل ${simulationResult.earlyDays} يوم عمل من التسليم.`,en:`You will finish production ${simulationResult.earlyDays} working days before delivery.`,es:`Terminará la producción ${simulationResult.earlyDays} días hábiles antes de la entrega.`,pt:`Terminará a produção ${simulationResult.earlyDays} dias úteis antes da entrega.`,tr:`Üretimi teslimattan ${simulationResult.earlyDays} iş günü önce bitireceksiniz.`})}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Statistiques rapides */}
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div className="border border-slate-100 dark:border-dk-border rounded-lg p-2.5 text-center">
                                    <div className="text-[10px] text-slate-400 dark:text-dk-muted font-medium">{tx(lang,{fr:'Production Jour',ar:'الإنتاج اليومي',en:'Daily Production',es:'Producción Diaria',pt:'Produção Diária',tr:'Günlük Üretim'})}</div>
                                    <div className="text-sm font-black text-slate-800 dark:text-dk-text mt-0.5">
                                        {Math.round(simulationResult.dailyCapacity)} <span className="text-[10px] text-slate-400 dark:text-dk-muted">pcs/{tx(lang,{fr:'j',ar:'ي',en:'d',es:'d',pt:'d',tr:'g'})}</span>
                                    </div>
                                </div>
                                <div className="border border-slate-100 dark:border-dk-border rounded-lg p-2.5 text-center">
                                    <div className="text-[10px] text-slate-400 dark:text-dk-muted font-medium">{tx(lang,{fr:'TRS / Efficacité',ar:'TRS / الكفاءة',en:'TRS / Efficiency',es:'TRS / Eficiencia',pt:'TRS / Eficiência',tr:'TRS / Etkinlik'})}</div>
                                    <div className="text-sm font-black text-slate-800 dark:text-dk-text mt-0.5">
                                        {(efficiency * 100).toFixed(0)}%
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* B. Recommandations d'optimisation */}
                        <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-5 shadow-sm dark:shadow-dk-sm space-y-4">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-dk-text border-b border-slate-100 dark:border-dk-border pb-2 flex items-center gap-1.5">
                                <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                {tx(lang,{fr:'Solutions Recommandées',ar:'الحلول الموصى بها',en:'Recommended Solutions',es:'Soluciones Recomendadas',pt:'Soluções Recomendadas',tr:'Önerilen Çözümler'})}
                            </h3>

                            {simulationResult.isLate ? (
                                <div className="space-y-4 text-xs">
                                    
                                    {/* 1. Augmenter effectif */}
                                    {simulationResult.requiredWorkers > 0 && simulationResult.requiredWorkers < 150 && (
                                        <div className="border border-slate-100 dark:border-dk-border rounded-xl p-3 bg-slate-50 dark:bg-dk-bg/50 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                                            <div className="font-bold text-slate-700 dark:text-dk-text-soft">{tx(lang,{fr:"Option A : Augmenter l'Effectif",ar:'الخيار أ: زيادة العمالة',en:'Option A: Increase Workforce',es:'Opción A: Aumentar el Personal',pt:'Opção A: Aumentar o Efetivo',tr:'Seçenek A: İşgücünü Artır'})}</div>
                                            <div className="text-slate-500 dark:text-dk-muted text-[11px] mt-1">
                                                {tx(lang,{fr:`En passant à un effectif de ${simulationResult.requiredWorkers} ouvriers, vous terminerez à temps.`,ar:`من خلال زيادة العمالة إلى ${simulationResult.requiredWorkers} عامل، ستنهي في الوقت المحدد.`,en:`By increasing the workforce to ${simulationResult.requiredWorkers} workers, you will finish on time.`,es:`Aumentando el personal a ${simulationResult.requiredWorkers} trabajadores, terminará a tiempo.`,pt:`Aumentando o efetivo para ${simulationResult.requiredWorkers} trabalhadores, terminará a tempo.`,tr:`İşgücünü ${simulationResult.requiredWorkers} işçiye çıkararak zamanında bitireceksiniz.`})}
                                            </div>
                                            <button 
                                                onClick={() => setNumWorkers(simulationResult.requiredWorkers)}
                                                className="mt-2.5 w-full bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover text-white text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
                                            >
                                                <Users className="w-3.5 h-3.5" />
                                                {tx(lang,{fr:`Appliquer ${simulationResult.requiredWorkers} ouvriers`,ar:`تطبيق ${simulationResult.requiredWorkers} عامل`,en:`Apply ${simulationResult.requiredWorkers} workers`,es:`Aplicar ${simulationResult.requiredWorkers} trabajadores`,pt:`Aplicar ${simulationResult.requiredWorkers} trabalhadores`,tr:`${simulationResult.requiredWorkers} işçi uygula`})}
                                            </button>
                                        </div>
                                    )}

                                    {/* 2. Améliorer rendement */}
                                    {simulationResult.requiredEfficiency > 0 && simulationResult.requiredEfficiency <= 1.2 && (
                                        <div className="border border-slate-100 dark:border-dk-border rounded-xl p-3 bg-slate-50 dark:bg-dk-bg/50 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                                            <div className="font-bold text-slate-700 dark:text-dk-text-soft">{tx(lang,{fr:'Option B : Améliorer le Rendement',ar:'الخيار ب: تحسين الإنتاجية',en:'Option B: Improve Efficiency',es:'Opción B: Mejorar el Rendimiento',pt:'Opção B: Melhorar o Rendimento',tr:'Seçenek B: Verimliliği Artır'})}</div>
                                            <div className="text-slate-500 dark:text-dk-muted text-[11px] mt-1">
                                                {tx(lang,{fr:`Un rendement moyen de ${(simulationResult.requiredEfficiency * 100).toFixed(0)}% permet de respecter la DDS.`,ar:`معدل إنتاجية ${(simulationResult.requiredEfficiency * 100).toFixed(0)}% يسمح بالوفاء بـ DDS.`,en:`An average efficiency of ${(simulationResult.requiredEfficiency * 100).toFixed(0)}% allows meeting the DDS.`,es:`Un rendimiento promedio de ${(simulationResult.requiredEfficiency * 100).toFixed(0)}% permite cumplir con la DDS.`,pt:`Um rendimento médio de ${(simulationResult.requiredEfficiency * 100).toFixed(0)}% permite cumprir a DDS.`,tr:`Ortalama ${(simulationResult.requiredEfficiency * 100).toFixed(0)}% verimlilik, DDS'yi karşılamaya olanak tanır.`})}
                                            </div>
                                            <button 
                                                onClick={() => setEfficiency(parseFloat(simulationResult.requiredEfficiency.toFixed(2)))}
                                                className="mt-2.5 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
                                            >
                                                <Percent className="w-3.5 h-3.5" />
                                                {tx(lang,{fr:`Appliquer ${(simulationResult.requiredEfficiency * 100).toFixed(0)}% de rendement`,ar:`تطبيق ${(simulationResult.requiredEfficiency * 100).toFixed(0)}% إنتاجية`,en:`Apply ${(simulationResult.requiredEfficiency * 100).toFixed(0)}% efficiency`,es:`Aplicar ${(simulationResult.requiredEfficiency * 100).toFixed(0)}% de rendimiento`,pt:`Aplicar ${(simulationResult.requiredEfficiency * 100).toFixed(0)}% de rendimento`,tr:`%${(simulationResult.requiredEfficiency * 100).toFixed(0)} verimlilik uygula`})}
                                            </button>
                                        </div>
                                    )}

                                    {/* 3. Sous-traitance */}
                                    <div className="border border-rose-100 dark:border-rose-900/40 rounded-xl p-3 bg-rose-50 dark:bg-rose-900/20 dark:bg-rose-900/10 hover:bg-rose-50/30 dark:hover:bg-rose-900/20 transition-colors">
                                        <div className="font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1">
                                            <Split className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                                            {tx(lang,{fr:'Option C : Sous-traitance (Monawla)',ar:'الخيار ج: التعاقد من الباطن (مناولة)',en:'Option C: Subcontracting (Monawla)',es:'Opción C: Subcontratación (Monawla)',pt:'Opção C: Subcontratação (Monawla)',tr:'Seçenek C: Taşeronluk (Monawla)'})}
                                        </div>
                                        <div className="text-slate-600 dark:text-dk-text-soft text-[11px] mt-1.5 space-y-1">
                                            <div>
                                                • {tx(lang,{fr:'Production en interne',ar:'الإنتاج الداخلي',en:'In-house production',es:'Producción interna',pt:'Produção interna',tr:'Dahili üretim'})} : <span className="font-bold text-slate-800 dark:text-dk-text">{simulationResult.maxInHouseQty}</span> pcs ({tx(lang,{fr:"jusqu'au",ar:'حتى',en:'until',es:'hasta',pt:'até',tr:'kadar'})} {formatDateFr(strictDeadline_DDS)}).
                                            </div>
                                            <div>
                                                • {tx(lang,{fr:'Quantité à sous-traiter',ar:'الكمية للتعاقد من الباطن',en:'Quantity to subcontract',es:'Cantidad a subcontratar',pt:'Quantidade a subcontratar',tr:'Taşere edilecek miktar'})} : <span className="font-black text-rose-600 dark:text-rose-400">{simulationResult.outsourceQty}</span> pcs.
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setShowSplitConfirm(true)}
                                            className="mt-3 w-full bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1 shadow-sm dark:shadow-dk-sm active:scale-95"
                                        >
                                            <Truck className="w-3.5 h-3.5" />
                                            {tx(lang,{fr:'Appliquer le Plan de Sous-traitance',ar:'تطبيق خطة التعاقد من الباطن',en:'Apply Subcontracting Plan',es:'Aplicar el Plan de Subcontratación',pt:'Aplicar o Plano de Subcontratação',tr:'Taşeron Planını Uygula'})}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 text-xs">
                                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                                        <div className="font-bold text-emerald-800 dark:text-emerald-300">{tx(lang,{fr:'Aucune surcharge détectée',ar:'لم يتم اكتشاف أي حمل زائد',en:'No overload detected',es:'Ninguna sobrecarga detectada',pt:'Nenhuma sobrecarga detetada',tr:'Aşırı yük tespit edilmedi'})}</div>
                                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 leading-relaxed">
                                            {tx(lang,{fr:'La capacité interne est suffisante. Si besoin, vous pouvez libérer du personnel pour d\'autres commandes.',ar:'السعة الداخلية كافية. إذا لزم الأمر، يمكنك تحرير الموظفين لأوامر أخرى.',en:'Internal capacity is sufficient. If needed, you can free up staff for other orders.',es:'La capacidad interna es suficiente. Si es necesario, puede liberar personal para otros pedidos.',pt:'A capacidade interna é suficiente. Se necessário, pode libertar pessoal para outras encomendas.',tr:'Dahili kapasite yeterlidir. Gerekirse diğer siparişler için personeli serbest bırakabilirsiniz.'})}
                                        </p>
                                    </div>
                                    
                                    {/* Option to reduce worker count and optimize */}
                                    {simulationResult.requiredWorkers > 0 && simulationResult.requiredWorkers < numWorkers && (
                                        <div className="border border-slate-100 dark:border-dk-border rounded-xl p-3 bg-slate-50 dark:bg-dk-bg/50">
                                            <div className="font-bold text-slate-700 dark:text-dk-text-soft">{tx(lang,{fr:'Libérer des opérateurs ?',ar:'تحرير المشغلين؟',en:'Free up operators?',es:'¿Liberar operadores?',pt:'Libertar operadores?',tr:'Operatörleri serbest bırakmak mı?'})}</div>
                                            <div className="text-[11px] text-slate-500 dark:text-dk-muted mt-1">
                                                {tx(lang,{fr:`Vous pouvez descendre à ${simulationResult.requiredWorkers} ouvriers et finir de produire à temps.`,ar:`يمكنك تقليص العمالة إلى ${simulationResult.requiredWorkers} عامل وإنهاء الإنتاج في الوقت المحدد.`,en:`You can reduce to ${simulationResult.requiredWorkers} workers and finish production on time.`,es:`Puede reducir a ${simulationResult.requiredWorkers} trabajadores y terminar la producción a tiempo.`,pt:`Pode reduzir para ${simulationResult.requiredWorkers} trabalhadores e terminar a produção a tempo.`,tr:`${simulationResult.requiredWorkers} işçiye düşürerek üretimi zamanında bitirebilirsiniz.`})}
                                            </div>
                                            <button 
                                                onClick={() => setNumWorkers(simulationResult.requiredWorkers)}
                                                className="mt-2 w-full border border-indigo-150 hover:bg-indigo-50 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text text-[11px] font-bold py-1 px-3 rounded-lg transition-colors"
                                            >
                                                {tx(lang,{fr:`Appliquer ${simulationResult.requiredWorkers} ouvriers`,ar:`تطبيق ${simulationResult.requiredWorkers} عامل`,en:`Apply ${simulationResult.requiredWorkers} workers`,es:`Aplicar ${simulationResult.requiredWorkers} trabajadores`,pt:`Aplicar ${simulationResult.requiredWorkers} trabalhadores`,tr:`${simulationResult.requiredWorkers} işçi uygula`})}
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
                    <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-xl dark:shadow-dk-elevated w-full max-w-md p-5 flex flex-col space-y-4 animate-in zoom-in-95 duration-200">
                        
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-dk-border pb-2">
                            <h4 className="font-bold text-slate-800 dark:text-dk-text text-sm flex items-center gap-1.5">
                                <Split className="w-4 h-4 text-rose-500" />
                                {tx(lang,{fr:'Fractionnement de la Commande',ar:'تقسيم الطلب',en:'Order Splitting',es:'División del Pedido',pt:'Divisão da Encomenda',tr:'Sipariş Bölme'})}
                            </h4>
                            <button 
onClick={() => setShowSplitConfirm(false)}
                                                                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-dk-elevated text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Récapitulatif du Split */}
                        <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-3 text-xs space-y-2 border border-slate-100 dark:border-dk-border">
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'Modèle',ar:'النموذج',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})} :</span>
                                <span className="font-bold text-slate-800 dark:text-dk-text">{selectedModel.meta_data?.nom_modele}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-100 dark:border-dk-border pt-1.5">
                                <span className="text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'Quantité en interne',ar:'الكمية الداخلية',en:'In-house quantity',es:'Cantidad interna',pt:'Quantidade interna',tr:'Dahili miktar'})} :</span>
                                <span className="font-black text-slate-800 dark:text-dk-text">{simulationResult.maxInHouseQty} pcs</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-100 dark:border-dk-border pt-1.5 text-rose-700 dark:text-rose-400">
                                <span className="font-bold">{tx(lang,{fr:'Quantité sous-traitée (Monawla)',ar:'الكمية المتعاقد من باطنها (مناولة)',en:'Subcontracted quantity (Monawla)',es:'Cantidad subcontratada (Monawla)',pt:'Quantidade subcontratada (Monawla)',tr:'Taşere edilen miktar (Monawla)'})} :</span>
                                <span className="font-black">{simulationResult.outsourceQty} pcs</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-100 dark:border-dk-border pt-1.5">
                                <span className="text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'DDS finale',ar:'DDS النهائي',en:'Final DDS',es:'DDS final',pt:'DDS final',tr:'Son DDS'})} :</span>
                                <span className="font-bold text-slate-700 dark:text-dk-text-soft">{formatDateFr(strictDeadline_DDS)}</span>
                            </div>
                        </div>

                        {/* Formulaire sous-traitant */}
                        <div className="space-y-3 text-xs">
                            <div className="font-bold text-slate-700 dark:text-dk-text-soft">{tx(lang,{fr:'Paramètres du Sous-traitant',ar:'معلمات المقاول من الباطن',en:'Subcontractor Parameters',es:'Parámetros del Subcontratista',pt:'Parâmetros do Subcontratante',tr:'Taşeron Parametreleri'})}</div>
                            
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 dark:text-dk-muted block mb-1">{tx(lang,{fr:'Nom du Sous-traitant',ar:'اسم المقاول من الباطن',en:'Subcontractor Name',es:'Nombre del Subcontratista',pt:'Nome do Subcontratante',tr:'Taşeron Adı'})}</label>
                                <input 
                                    type="text" 
                                    className="w-full rounded-lg border border-slate-200 dark:border-dk-border px-3 py-1.5 font-semibold"
                                    placeholder={tx(lang,{fr:'Ex. Atelier Al-Amal',ar:'مثال: ورشة الأمل',en:'E.g. Atelier Al-Amal',es:'Ej. Taller Al-Amal',pt:'Ex. Oficina Al-Amal',tr:'Örn. Atelier Al-Amal'})}
                                    value={subcontractorName}
                                    onChange={e => setSubcontractorName(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-dk-muted block mb-1">{tx(lang,{fr:'Téléphone',ar:'الهاتف',en:'Phone',es:'Teléfono',pt:'Telefone',tr:'Telefon'})}</label>
                                    <input 
                                        type="text" 
                                        className="w-full rounded-lg border border-slate-200 dark:border-dk-border px-3 py-1.5 font-semibold"
                                        placeholder={tx(lang,{fr:'Ex. 0612345678',ar:'مثال: 0612345678',en:'E.g. 0612345678',es:'Ej. 0612345678',pt:'Ex. 0612345678',tr:'Örn. 0612345678'})}
                                        value={subcontractorPhone}
                                        onChange={e => setSubcontractorPhone(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-dk-muted block mb-1">{tx(lang,{fr:'Prix Unitaire (DH)',ar:'السعر الوحدوي (درهم)',en:'Unit Price (MAD)',es:'Precio Unitario (DH)',pt:'Preço Unitário (DH)',tr:'Birim Fiyat (DH)'})}</label>
                                    <input 
                                        type="number" 
                                        className="w-full rounded-lg border border-slate-200 dark:border-dk-border px-3 py-1.5 font-semibold"
                                        placeholder={tx(lang,{fr:'Ex. 4.5',ar:'مثال: 4.5',en:'E.g. 4.5',es:'Ej. 4.5',pt:'Ex. 4.5',tr:'Örn. 4.5'})}
                                        value={subcontractPrice}
                                        onChange={e => setSubcontractPrice(parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-dk-border">
                            <button
                                onClick={() => setShowSplitConfirm(false)}
                                className="px-3 py-1.5 border border-slate-200 dark:border-dk-border rounded-lg text-xs font-bold text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60"
                            >
                                {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
                            </button>
                            <button
                                onClick={handleConfirmSplit}
                                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm dark:shadow-dk-sm active:scale-95"
                            >
                                {tx(lang,{fr:'Confirmer et Planifier',ar:'تأكيد وتخطيط',en:'Confirm and Schedule',es:'Confirmar y Planificar',pt:'Confirmar e Planear',tr:'Onayla ve Planla'})}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
