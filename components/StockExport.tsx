import React, { useState, useMemo, useEffect } from 'react';
import { ModelData, SuiviData, PlanningEvent, AppSettings } from '../types';
import { getWorkMinutesPerDay } from '../utils/planning';
import { computeChainEfficiency } from '../utils/efficiency';
import {
    Package, Truck, Search, CheckCircle2, Factory, PackageCheck, 
    ChevronDown, ChevronUp, Layers, Calendar, Plus, Clock, 
    ClipboardList, DollarSign, Check, AlertCircle, Trash2, X
} from 'lucide-react';

interface StockExportProps {
    models: ModelData[];
    suivis: SuiviData[];
    planningEvents?: PlanningEvent[];
    setModels?: React.Dispatch<React.SetStateAction<ModelData[]>>;
    setSuivis?: React.Dispatch<React.SetStateAction<SuiviData[]>>;
    setCurrentView?: (view: 'dashboard' | 'ingenierie' | 'library' | 'coupe' | 'effectifs' | 'gestionRh' | 'planning' | 'suivi' | 'magasin' | 'export' | 'config' | 'profil' | 'admin' | 'rendement' | 'pageMachine' | 'machin' | 'facturation' | 'atelierProd' | 'sousTraitance' | 'catalogTemps') => void;
    createNewProject?: () => void;
    settings?: AppSettings;
}

export default function StockExport({ models, suivis, planningEvents = [], setModels, setSuivis, setCurrentView, createNewProject, settings }: StockExportProps) {
    const [activeTab, setActiveTab] = useState<'finition' | 'emballage' | 'complet'>('finition');
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        return new Date().toISOString().split('T')[0];
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

    // Finished Goods Stock from Database
    const [finishedGoods, setFinishedGoods] = useState<any[]>([]);

    // Load finished goods from server
    const loadFinishedGoods = async () => {
        try {
            const res = await fetch('/api/finished-goods', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setFinishedGoods(data);
            }
        } catch (e) {
            console.error("Failed to load finished goods from server", e);
        }
    };

    useEffect(() => {
        loadFinishedGoods();
    }, []);

    // Active Models: Models that are not fully shipped or are active/followed up
    const activeModels = useMemo(() => {
        return models.filter(m => {
            const fg = finishedGoods.find(f => f.modelId === m.id);
            const isShipped = fg?.statut === 'expedie';
            const hasActiveStatus = m.workflowStatus === 'COUPE' || m.workflowStatus === 'PLANNING' || m.workflowStatus === 'EXPORT' || m.workflowStatus === 'SUIVI';
            const isExport = m.ficheData?.typeMarche === 'Export' || planningEvents.some(p => p.modelId === m.id);
            const hasSuiviData = suivis.some(s => s.modelId === m.id || s.planningId === m.id);
            const shouldShow = hasActiveStatus || isExport || hasSuiviData;
            return shouldShow && (!isShipped || activeTab === 'complet');
        });
    }, [models, finishedGoods, activeTab, planningEvents, suivis]);

    const filteredModels = useMemo(() => {
        return activeModels.filter(m =>
            (m?.meta_data?.nom_modele || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (m?.meta_data?.reference || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (m?.ficheData?.client || '').toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [activeModels, searchQuery]);

    // Helper to get total expected quantity per size
    const getExpectedQtyForSize = (model: ModelData, sIdx: number) => {
        const colors = model.ficheData?.colors || model.meta_data?.colors || [];
        const gridQuantities = model.ficheData?.gridQuantities || {};
        const sizes = model.ficheData?.sizes || model.meta_data?.sizes || ['S', 'M', 'L', 'XL'];
        
        let qty = 0;
        if (colors.length === 0) {
            qty = Number(gridQuantities[`default_${sIdx}`] || 0);
        } else {
            qty = colors.reduce((sum, c) => sum + Number(gridQuantities[`${c.id}_${sIdx}`] || 0), 0);
        }

        // Fallback: if size-specific quantity is 0 but model has a total quantity, distribute it
        if (qty === 0) {
            const totalQty = model.ficheData?.quantity || model.meta_data?.quantity || 0;
            if (totalQty > 0 && sizes.length > 0) {
                return Math.round(totalQty / sizes.length);
            }
        }
        return qty;
    };

    // Synchronize a finished goods stock entry to the server database
    const syncFinishedGoodToDb = async (model: ModelData, totalDepot: number, status: 'expedie' | 'disponible' = 'disponible') => {
        const fg = finishedGoods.find(f => f.modelId === model.id);
        const fgId = fg?.id || `FG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

        const body = {
            id: fgId,
            modelId: model.id,
            planningId: planningEvents.find(p => p.modelId === model.id)?.id || null,
            reference: model.meta_data?.reference || 'N/A',
            designation: model.meta_data?.nom_modele || 'Sans Nom',
            clientName: model.ficheData?.client || 'Client Divers',
            chaineId: 'Dépôt',
            quantiteProduite: totalDepot,
            quantiteDefaut: 0,
            quantiteExpediee: status === 'expedie' ? totalDepot : 0,
            quantiteRestante: status === 'expedie' ? 0 : totalDepot,
            statut: status,
            dateProduction: new Date().toISOString().split('T')[0],
            notes: status === 'expedie' ? 'Expédié via module Tsarja (Stock Export)' : 'Mis à jour via module Dépôt (Stock Export)'
        };

        try {
            const res = await fetch('/api/finished-goods', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body)
            });
            if (res.ok) {
                loadFinishedGoods();
            }
        } catch (e) {
            console.error("Failed to sync finished good to database", e);
        }
    };

    // Actions
    const handleUpdateFinition = async (model: ModelData, sizeName: string, field: 'entree' | 'sortie', val: number) => {
        if (!setSuivis) return;

        let newSuivis = [...suivis];
        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
        const planningId = associatedPlan?.id || model.id;

        let entry = newSuivis.find(s => s.date === selectedDate && (s.planningId === planningId || s.modelId === model.id));
        if (!entry) {
            entry = {
                id: `sv_export_${model.id}_${selectedDate}_${Date.now()}`,
                planningId: planningId,
                modelId: model.id,
                chaineId: 'Finition',
                date: selectedDate,
                entrer: 0,
                sorties: {},
                totalHeure: 0,
                pJournaliere: 0,
                enCour: 0,
                resteEntrer: 0,
                resteSortie: 0,
                totalWorkers: 0,
                source: 'PLANNING'
            };
            newSuivis.push(entry);
        }

        const sizeFinitionData = (entry as any).finitionData || {};
        if (!sizeFinitionData[sizeName]) {
            sizeFinitionData[sizeName] = { entree: 0, sortie: 0 };
        }
        sizeFinitionData[sizeName][field] = val;

        newSuivis = newSuivis.map(s => {
            if (s.id === entry!.id) {
                return {
                    ...s,
                    finitionData: sizeFinitionData
                } as any;
            }
            return s;
        });

        setSuivis(newSuivis);

        // Save to server database
        try {
            await fetch('/api/suivi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ suivis: newSuivis })
            });
        } catch (e) {
            console.error("Failed to save finition suivi to database", e);
        }
    };

    // Saisie des défauts / retouches de finition (par modèle, pour la date sélectionnée)
    const handleUpdateDefauts = async (model: ModelData, val: number) => {
        if (!setSuivis) return;

        let newSuivis = [...suivis];
        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
        const planningId = associatedPlan?.id || model.id;

        let entry = newSuivis.find(s => s.date === selectedDate && (s.planningId === planningId || s.modelId === model.id));
        if (!entry) {
            entry = {
                id: `sv_export_${model.id}_${selectedDate}_${Date.now()}`,
                planningId: planningId,
                modelId: model.id,
                chaineId: 'Finition',
                date: selectedDate,
                entrer: 0,
                sorties: {},
                totalHeure: 0,
                pJournaliere: 0,
                enCour: 0,
                resteEntrer: 0,
                resteSortie: 0,
                totalWorkers: 0,
                source: 'PLANNING'
            };
            newSuivis.push(entry);
        }

        newSuivis = newSuivis.map(s => s.id === entry!.id ? ({ ...s, defautsFinition: val } as any) : s);
        setSuivis(newSuivis);

        try {
            await fetch('/api/suivi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ suivis: newSuivis })
            });
        } catch (e) {
            console.error("Failed to save défauts to database", e);
        }
    };

    const handleUpdateEmballage = async (model: ModelData, sizeName: string, field: 'mika_tiki' | 'depot', val: number) => {
        if (!setSuivis) return;

        let newSuivis = [...suivis];
        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
        const planningId = associatedPlan?.id || model.id;

        let entry = newSuivis.find(s => s.date === selectedDate && (s.planningId === planningId || s.modelId === model.id));
        if (!entry) {
            entry = {
                id: `sv_export_${model.id}_${selectedDate}_${Date.now()}`,
                planningId: planningId,
                modelId: model.id,
                chaineId: 'Emballage',
                date: selectedDate,
                entrer: 0,
                sorties: {},
                totalHeure: 0,
                pJournaliere: 0,
                enCour: 0,
                resteEntrer: 0,
                resteSortie: 0,
                totalWorkers: 0,
                source: 'PLANNING'
            };
            newSuivis.push(entry);
        }

        const sizeEmballageData = (entry as any).emballageData || {};
        if (!sizeEmballageData[sizeName]) {
            sizeEmballageData[sizeName] = { mika_tiki: 0, depot: 0 };
        }
        sizeEmballageData[sizeName][field] = val;

        newSuivis = newSuivis.map(s => {
            if (s.id === entry!.id) {
                return {
                    ...s,
                    emballageData: sizeEmballageData
                } as any;
            }
            return s;
        });

        setSuivis(newSuivis);

        // Save to server database
        try {
            await fetch('/api/suivi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ suivis: newSuivis })
            });
        } catch (e) {
            console.error("Failed to save emballage suivi to database", e);
        }

        // Calculate new total depot quantity for this model across all suivis
        let totalDepotIn = 0;
        newSuivis.forEach(s => {
            if (s.modelId === model.id || s.planningId === planningId) {
                const sizesData = (s as any).emballageData || {};
                Object.values(sizesData).forEach((sz: any) => {
                    totalDepotIn += sz.depot || 0;
                });
            }
        });

        // Sync to finished_goods_stock in server database
        syncFinishedGoodToDb(model, totalDepotIn);
    };

    const handleShipModel = (model: ModelData) => {
        const agg = getModelAggregations(model);
        syncFinishedGoodToDb(model, agg.totalDepotIn, 'expedie');
    };

    const handleResetShipModel = async (modelId: string) => {
        const fg = finishedGoods.find(f => f.modelId === modelId);
        if (!fg) return;

        const body = {
            ...fg,
            quantiteExpediee: 0,
            quantiteRestante: fg.quantiteProduite,
            statut: 'disponible'
        };

        try {
            const res = await fetch('/api/finished-goods', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body)
            });
            if (res.ok) {
                loadFinishedGoods();
            }
        } catch (e) {
            console.error("Failed to reset ship model in database", e);
        }
    };

    // Helper to calculate total cumulative sewing output of a model (sum of totalHeure where chaineId is not Finition/Emballage/Dépôt)
    const getModelSewingOutput = (model: ModelData) => {
        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
        const planningId = associatedPlan?.id || model.id;
        return suivis
            .filter(s => (s.modelId === model.id || s.planningId === planningId) && 
                         s.chaineId !== 'Finition' && 
                         s.chaineId !== 'Emballage' && 
                         s.chaineId !== 'Dépôt' && 
                         s.chaineId !== 'depot' && 
                         s.chaineId !== 'finition' && 
                         s.chaineId !== 'emballage')
            .reduce((sum, s) => sum + (s.totalHeure || 0), 0);
    };

    // Helper to calculate size-specific cumulative sewing output for a model
    const getSizeSewingOutput = (model: ModelData, sizeName: string) => {
        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
        const planningId = associatedPlan?.id || model.id;
        let total = 0;
        suivis.forEach(s => {
            if ((s.modelId === model.id || s.planningId === planningId) && 
                s.chaineId !== 'Finition' && 
                s.chaineId !== 'Emballage' && 
                s.chaineId !== 'Dépôt' && 
                s.chaineId !== 'depot' && 
                s.chaineId !== 'finition' && 
                s.chaineId !== 'emballage') {
                total += (s as any).sizeData?.[sizeName]?.sortie || 0;
            }
        });
        return total;
    };

    // Helper to calculate size-specific daily sewing output for a model on selectedDate
    const getSizeDailySewingOutput = (model: ModelData, sizeName: string, dateStr: string) => {
        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
        const planningId = associatedPlan?.id || model.id;
        let total = 0;
        suivis.forEach(s => {
            if (s.date === dateStr && 
                (s.modelId === model.id || s.planningId === planningId) && 
                s.chaineId !== 'Finition' && 
                s.chaineId !== 'Emballage' && 
                s.chaineId !== 'Dépôt' && 
                s.chaineId !== 'depot' && 
                s.chaineId !== 'finition' && 
                s.chaineId !== 'emballage') {
                total += (s as any).sizeData?.[sizeName]?.sortie || 0;
            }
        });
        return total;
    };

    // Helper to calculate size-specific cumulative finition output for a model
    const getSizeFinitionOutput = (model: ModelData, sizeName: string) => {
        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
        const planningId = associatedPlan?.id || model.id;
        let total = 0;
        suivis.forEach(s => {
            if (s.modelId === model.id || s.planningId === planningId) {
                total += (s as any).finitionData?.[sizeName]?.sortie || 0;
            }
        });
        return total;
    };

    // Helper to calculate size-specific daily finition output for a model on selectedDate
    const getSizeDailyFinitionOutput = (model: ModelData, sizeName: string, dateStr: string) => {
        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
        const planningId = associatedPlan?.id || model.id;
        let total = 0;
        suivis.forEach(s => {
            if (s.date === dateStr && (s.modelId === model.id || s.planningId === planningId)) {
                total += (s as any).finitionData?.[sizeName]?.sortie || 0;
            }
        });
        return total;
    };

    // Calculate aggregations for a model across all time
    const getModelAggregations = (model: ModelData) => {
        const sizes = model.ficheData?.sizes || model.meta_data?.sizes || ['S', 'M', 'L', 'XL'];
        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
        const planningId = associatedPlan?.id || model.id;
        
        // 1. Total expected
        const totalExpected = sizes.reduce((sum, _, idx) => sum + getExpectedQtyForSize(model, idx), 0);

        // 2. Total finished (Finition outputs)
        let totalFinitionOut = 0;
        suivis.forEach(s => {
            if (s.modelId === model.id || s.planningId === planningId) {
                const sizesData = (s as any).finitionData || {};
                Object.values(sizesData).forEach((sz: any) => {
                    totalFinitionOut += sz.sortie || 0;
                });
            }
        });

        // 3. Total received in dépôt (Emballage depot entries)
        let totalDepotIn = 0;
        suivis.forEach(s => {
            if (s.modelId === model.id || s.planningId === planningId) {
                const sizesData = (s as any).emballageData || {};
                Object.values(sizesData).forEach((sz: any) => {
                    totalDepotIn += sz.depot || 0;
                });
            }
        });

        // 4. Shipped status
        const fg = finishedGoods.find(f => f.modelId === model.id);
        const isShipped = fg?.statut === 'expedie';
        const totalShipped = isShipped ? totalDepotIn : 0; // If shipped, all depot items are out

        // 5. Current stock in dépôt
        const currentStock = totalDepotIn - totalShipped;

        // 6. Values
        const unitPrice = model.ficheData?.clientPrice || model.ficheData?.unitCost || 0;
        const stockValue = currentStock * unitPrice;

        return {
            totalExpected,
            totalFinitionOut,
            totalDepotIn,
            totalShipped,
            currentStock,
            stockValue,
            unitPrice,
            isShipped,
            shippedAt: isShipped ? fg?.updated_at || fg?.dateProduction || '' : ''
        };
    };

    // ----- Helpers vue matrice (Finition / Emballage) -----
    // Chaîne (ou sous-traitance) qui travaille le modèle — lue depuis le Planning
    const getModelChaine = (model: ModelData) => {
        const plan = planningEvents.find(p => p.modelId === model.id);
        return plan?.chaineId || model.ficheData?.chaine || '—';
    };

    // Jours restants jusqu'à la deadline (DDS) — lue depuis le Planning
    const getDaysRemaining = (model: ModelData): number | null => {
        const plan = planningEvents.find(p => p.modelId === model.id);
        const dds = plan?.strictDeadline_DDS || plan?.dateExport;
        if (!dds) return null;
        return Math.ceil((new Date(dds).getTime() - new Date(selectedDate).getTime()) / 86400000);
    };

    // Valeur saisie pour la date sélectionnée (sortie finition / reçu dépôt) par taille
    const getCellValue = (model: ModelData, sizeName: string): number | '' => {
        const plan = planningEvents.find(p => p.modelId === model.id);
        const planningId = plan?.id || model.id;
        const s = suivis.find(x => x.date === selectedDate && (x.modelId === model.id || x.planningId === planningId));
        const v = activeTab === 'finition'
            ? (s as any)?.finitionData?.[sizeName]?.sortie
            : (s as any)?.emballageData?.[sizeName]?.depot;
        return v || '';
    };

    // Défauts / retouches cumulés (toutes dates) pour un modèle
    const getModelDefauts = (model: ModelData) => {
        const plan = planningEvents.find(p => p.modelId === model.id);
        const planningId = plan?.id || model.id;
        return suivis.reduce((sum, s) => {
            if (s.modelId === model.id || s.planningId === planningId) return sum + ((s as any).defautsFinition || 0);
            return sum;
        }, 0);
    };

    // Défauts saisis pour la date sélectionnée
    const getDefautsToday = (model: ModelData): number | '' => {
        const plan = planningEvents.find(p => p.modelId === model.id);
        const planningId = plan?.id || model.id;
        const s = suivis.find(x => x.date === selectedDate && (x.modelId === model.id || x.planningId === planningId));
        return ((s as any)?.defautsFinition) || '';
    };

    // Cadence requise vs capacité — UNIFIÉ avec le moteur du Planning
    // (capacité = opérateurs × minutes/jour × efficacité × activité ÷ SAM, cf. utils/criticalRatio)
    const getModelCadence = (model: ModelData) => {
        const agg = getModelAggregations(model);
        const reste = Math.max(0, agg.totalExpected - agg.totalDepotIn);
        const days = getDaysRemaining(model);

        const plan = planningEvents.find(p => p.modelId === model.id);
        const chaineId = plan?.chaineId || '';
        const sam = model.meta_data?.total_temps || 15;
        const workMin = settings ? getWorkMinutesPerDay(settings) : 480;
        const operators = settings?.chainOperators?.[chaineId] ?? 30;
        const activityRate = (plan as any)?.activityRateOverride ?? settings?.chainActivityRate?.[chaineId] ?? 0.85;
        const efficiency = settings ? (computeChainEfficiency(suivis, planningEvents, models, chaineId, settings).eff || 0.85) : 0.85;
        const capacityPerDay = sam > 0 ? Math.round((operators * workMin * efficiency * activityRate) / sam) : 0; // pcs/jour (objectif)

        const cadenceRequise = (days !== null && days > 0) ? Math.ceil(reste / days) : reste;  // pcs/jour requis
        const daysNeeded = capacityPerDay > 0 ? Math.ceil(reste / capacityPerDay) : null;       // jours nécessaires à pleine capacité
        const atRisk = reste > 0 && days !== null && (days <= 0 || (daysNeeded !== null && daysNeeded > days));
        return { reste, days, capacityPerDay, cadenceRequise, daysNeeded, atRisk };
    };

    // Metrics for the dashboard
    const metrics = useMemo(() => {
        let totalFiniModels = 0;
        let totalStockPcs = 0;
        let totalShippedMonth = 0;

        activeModels.forEach(m => {
            const agg = getModelAggregations(m);
            if (agg.isShipped) {
                totalShippedMonth += agg.totalShipped;
            } else {
                totalStockPcs += agg.currentStock;
            }
            if (agg.totalDepotIn >= agg.totalExpected && agg.totalExpected > 0) {
                totalFiniModels++;
            }
        });

        return {
            totalFiniModels,
            totalStockPcs,
            totalShippedMonth
        };
    }, [activeModels, suivis, finishedGoods]);

    return (
        <div className="h-full flex flex-col bg-slate-50 relative pb-20">
            {/* Top Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between shrink-0 shadow-sm gap-4 z-20">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <PackageCheck className="w-6 h-6 text-emerald-600" />
                        Suivi Emballage & Dépôt Final
                    </h1>
                    <p className="text-slate-550 mt-1 text-sm font-medium">Suivi de finition, emballage et expédition des modèles au dépôt final.</p>
                </div>
                
                {/* Search & Actions */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Rechercher un modèle..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 w-60 bg-slate-50 font-bold"
                        />
                    </div>

                    {activeTab !== 'complet' && (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1.5 text-emerald-700">
                            <Calendar className="w-4 h-4" />
                            <input 
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent outline-none font-bold text-xs border-none cursor-pointer focus:ring-0 p-0 text-emerald-800"
                            />
                        </div>
                    )}

                    {setCurrentView && (
                        <button
                            onClick={() => {
                                if (createNewProject) createNewProject();
                                setCurrentView('ingenierie');
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 hover:scale-[1.02] active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            Nouveau Modèle
                        </button>
                    )}
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-white border-b border-slate-200 px-6 py-2 shrink-0 flex items-center gap-2">
                <button
                    onClick={() => { setActiveTab('finition'); setExpandedModelId(null); }}
                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
                        activeTab === 'finition' 
                            ? 'bg-slate-100 text-slate-800 shadow-sm border border-slate-200' 
                            : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <Layers className="w-4 h-4" />
                    Suivi Finition
                </button>
                <button
                    onClick={() => { setActiveTab('emballage'); setExpandedModelId(null); }}
                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
                        activeTab === 'emballage' 
                            ? 'bg-slate-100 text-slate-800 shadow-sm border border-slate-200' 
                            : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <Package className="w-4 h-4" />
                    Suivi Emballage & Dépôt
                </button>
                <button
                    onClick={() => { setActiveTab('complet'); setExpandedModelId(null); }}
                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
                        activeTab === 'complet' 
                            ? 'bg-slate-100 text-slate-800 shadow-sm border border-slate-200' 
                            : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <ClipboardList className="w-4 h-4" />
                    Stock Complet & Tarifs
                </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto w-full max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">
                
                {/* Metrics Widgets */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                            <PackageCheck className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-500">Total Modèles Complétés</p>
                            <p className="text-2xl font-black text-slate-800">{metrics.totalFiniModels}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                            <Factory className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-500">Volume Total en Stock (Dépôt)</p>
                            <p className="text-2xl font-black text-slate-800">{metrics.totalStockPcs.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                            <Truck className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-500">Expéditions Shipped (Mois)</p>
                            <p className="text-2xl font-black text-slate-800">{metrics.totalShippedMonth.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* Bandeau d'alerte : modèles à risque de retard */}
                {activeTab !== 'complet' && (() => {
                    const atRiskModels = filteredModels.filter(m => getModelCadence(m).atRisk);
                    if (atRiskModels.length === 0) return null;
                    return (
                        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <AlertCircle className="w-5 h-5 text-rose-600" />
                                <span className="font-black text-sm text-rose-800">{atRiskModels.length} modèle(s) à risque de retard</span>
                            </div>
                            <div className="space-y-1.5 mb-3">
                                {atRiskModels.map(m => {
                                    const c = getModelCadence(m);
                                    return (
                                        <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                                            <span className="font-bold text-slate-800">{m.meta_data?.nom_modele || 'Sans Nom'}</span>
                                            <span className="text-rose-700 font-bold">Reste {c.reste.toLocaleString()} pcs</span>
                                            <span className="text-slate-600">
                                                {c.days !== null && c.days <= 0 ? 'délai dépassé' : `${c.days}j restants`} · requis ≈ {c.cadenceRequise.toLocaleString()} pcs/j
                                                {c.capacityPerDay > 0 && <span className="text-slate-400"> (capacité ≈ {c.capacityPerDay.toLocaleString()} pcs/j)</span>}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-500">Solutions :</span>
                                {setCurrentView && (
                                    <>
                                        <button
                                            onClick={() => setCurrentView('planning')}
                                            className="bg-white hover:bg-slate-50 text-slate-700 font-bold text-[11px] px-3 py-1.5 rounded-lg border border-slate-200 transition-colors inline-flex items-center gap-1.5"
                                        >
                                            <Layers className="w-3.5 h-3.5" />
                                            Fractionner sur une autre chaîne
                                        </button>
                                        <button
                                            onClick={() => setCurrentView('sousTraitance')}
                                            className="bg-white hover:bg-slate-50 text-slate-700 font-bold text-[11px] px-3 py-1.5 rounded-lg border border-slate-200 transition-colors inline-flex items-center gap-1.5"
                                        >
                                            <Truck className="w-3.5 h-3.5" />
                                            Sous-traiter
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* Main Table Card */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h2 className="font-black text-sm text-slate-800 flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-slate-500" />
                            {activeTab === 'finition' ? 'Journal de Suivi Quotidien - Finition' :
                             activeTab === 'emballage' ? 'Journal de Suivi Quotidien - Emballage & Dépôt' :
                             'État Général du Stock Complet & Valeurs Financières'}
                        </h2>
                    </div>

                    {filteredModels.length === 0 ? (
                        <div className="p-16 text-center text-slate-400">
                            <PackageCheck className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                            <p className="font-bold text-slate-700">Aucun modèle actif à afficher.</p>
                            <p className="text-xs mt-2 text-slate-500">Créez un nouveau modèle ou clôturez une production pour le voir apparaître.</p>
                        </div>
                    ) : activeTab !== 'complet' ? (
                        <div className="overflow-x-auto w-full">
                            <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
                                <thead>
                                    <tr className="bg-white border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 font-black">
                                        <th className="p-3">Modèle (N° OF)</th>
                                        <th className="p-3 text-center">Chaîne</th>
                                        <th className="p-3 text-center">Tailles — {activeTab === 'finition' ? 'sortie finition' : 'reçu dépôt'}</th>
                                        {activeTab === 'finition' && <th className="p-3 text-center bg-rose-50/40 text-rose-700">Défauts</th>}
                                        <th className="p-3 text-center bg-amber-50/40 text-amber-700">WIP (en-cours)</th>
                                        <th className="p-3 text-center bg-indigo-50/40 text-indigo-700">{activeTab === 'finition' ? 'Cumul fini' : 'Cumul dépôt'}</th>
                                        <th className="p-3 text-center bg-emerald-50/40 text-emerald-700">Reste à produire</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredModels.map(model => {
                                        const sizes = model.ficheData?.sizes || model.meta_data?.sizes || [];
                                        const agg = getModelAggregations(model);
                                        const cumul = activeTab === 'finition' ? agg.totalFinitionOut : agg.totalDepotIn;
                                        const sewing = sizes.reduce((sum, sz) => sum + getSizeSewingOutput(model, sz), 0);
                                        const wip = activeTab === 'finition'
                                            ? Math.max(0, sewing - agg.totalFinitionOut)
                                            : Math.max(0, agg.totalFinitionOut - agg.totalDepotIn);
                                        // Reste basé sur le reçu au dépôt (commande finie = entrée dépôt)
                                        const reste = Math.max(0, agg.totalExpected - agg.totalDepotIn);
                                        const days = getDaysRemaining(model);
                                        const cad = getModelCadence(model);
                                        const atRisk = cad.atRisk;
                                        const tight = !atRisk && reste > 0 && days !== null && days > 0 && days <= 3;
                                        return (
                                            <tr key={model.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                                <td className="p-3">
                                                    <div className="font-black text-slate-800 text-sm">{model?.meta_data?.nom_modele || 'Sans Nom'}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold">Réf: {model?.meta_data?.reference || 'N/A'}</div>
                                                </td>
                                                <td className="p-3 text-center font-bold text-slate-600">{getModelChaine(model)}</td>
                                                <td className="p-2">
                                                    {sizes.length === 0 ? (
                                                        <span className="text-slate-300 text-xs">— aucune taille définie —</span>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-2">
                                                            {sizes.map(sz => (
                                                                <div key={sz} className="flex flex-col items-center">
                                                                    <span className="text-[9px] font-black text-slate-400 uppercase">{sz}</span>
                                                                    <input
                                                                        type="number"
                                                                        value={getCellValue(model, sz)}
                                                                        onChange={(e) => {
                                                                            const v = Math.max(0, parseInt(e.target.value) || 0);
                                                                            if (activeTab === 'finition') handleUpdateFinition(model, sz, 'sortie', v);
                                                                            else handleUpdateEmballage(model, sz, 'depot', v);
                                                                        }}
                                                                        placeholder="0"
                                                                        className="w-14 text-center font-bold text-xs bg-slate-50 border border-slate-200 rounded-lg py-1 focus:bg-white focus:border-emerald-500 outline-none transition-all"
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                {activeTab === 'finition' && (
                                                    <td className="p-2 text-center bg-rose-50/20">
                                                        <input
                                                            type="number"
                                                            value={getDefautsToday(model)}
                                                            onChange={(e) => handleUpdateDefauts(model, Math.max(0, parseInt(e.target.value) || 0))}
                                                            placeholder="0"
                                                            className="w-14 text-center font-bold text-xs bg-rose-50/50 border border-rose-100 rounded-lg py-1 focus:bg-white focus:border-rose-400 outline-none transition-all text-rose-700"
                                                        />
                                                        {getModelDefauts(model) > 0 && (
                                                            <div className="text-[9px] text-rose-500 font-bold mt-0.5">cumul {getModelDefauts(model).toLocaleString()}</div>
                                                        )}
                                                    </td>
                                                )}
                                                <td className="p-3 text-center font-bold text-amber-600 bg-amber-50/20">{wip.toLocaleString()}</td>
                                                <td className="p-3 text-center font-black text-sm text-indigo-700 bg-indigo-50/30">{cumul.toLocaleString()}</td>
                                                <td className="p-3 text-center bg-emerald-50/30">
                                                    <div className={`font-black text-sm ${atRisk ? 'text-rose-700' : 'text-emerald-700'}`}>{reste.toLocaleString()} pcs</div>
                                                    {days !== null && (
                                                        <div className={`text-[10px] font-bold ${days < 0 ? 'text-rose-600' : (atRisk || tight) ? 'text-amber-600' : 'text-slate-500'}`}>
                                                            {reste === 0 ? '✓ Complet' : days < 0 ? `${Math.abs(days)}j de retard` : days === 0 ? "Aujourd'hui" : `${days} jours restants`}
                                                        </div>
                                                    )}
                                                    {reste > 0 && cad.cadenceRequise > 0 && (
                                                        <div className="text-[10px] font-bold text-indigo-600">≈ {cad.cadenceRequise.toLocaleString()} pcs/j requis</div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {/* Ligne Total */}
                                    <tr className="bg-slate-50 font-black border-t-2 border-slate-200 text-slate-800">
                                        <td className="p-3 uppercase">Total</td>
                                        <td className="p-3 text-center text-slate-300">—</td>
                                        <td className="p-3 text-center text-slate-700">
                                            {filteredModels.reduce((acc, m) => {
                                                const szList = m.ficheData?.sizes || m.meta_data?.sizes || [];
                                                const plan = planningEvents.find(p => p.modelId === m.id);
                                                const planningId = plan?.id || m.id;
                                                const s = suivis.find(x => x.date === selectedDate && (x.modelId === m.id || x.planningId === planningId));
                                                return acc + szList.reduce((s2, sz) => {
                                                    const d = activeTab === 'finition'
                                                        ? (s as any)?.finitionData?.[sz]?.sortie
                                                        : (s as any)?.emballageData?.[sz]?.depot;
                                                    return s2 + (d || 0);
                                                }, 0);
                                            }, 0).toLocaleString()} <span className="text-[9px] text-slate-400">pcs / jour</span>
                                        </td>
                                        {activeTab === 'finition' && (
                                            <td className="p-3 text-center text-rose-700">
                                                {filteredModels.reduce((acc, m) => acc + getModelDefauts(m), 0).toLocaleString()}
                                            </td>
                                        )}
                                        <td className="p-3 text-center text-amber-600">
                                            {filteredModels.reduce((acc, m) => {
                                                const a = getModelAggregations(m);
                                                const sizesM = m.ficheData?.sizes || m.meta_data?.sizes || [];
                                                const sew = sizesM.reduce((s2, sz) => s2 + getSizeSewingOutput(m, sz), 0);
                                                const w = activeTab === 'finition'
                                                    ? Math.max(0, sew - a.totalFinitionOut)
                                                    : Math.max(0, a.totalFinitionOut - a.totalDepotIn);
                                                return acc + w;
                                            }, 0).toLocaleString()}
                                        </td>
                                        <td className="p-3 text-center text-indigo-700">
                                            {filteredModels.reduce((acc, m) => {
                                                const a = getModelAggregations(m);
                                                return acc + (activeTab === 'finition' ? a.totalFinitionOut : a.totalDepotIn);
                                            }, 0).toLocaleString()}
                                        </td>
                                        <td className="p-3 text-center text-emerald-700">
                                            {filteredModels.reduce((acc, m) => {
                                                const a = getModelAggregations(m);
                                                return acc + Math.max(0, a.totalExpected - a.totalDepotIn);
                                            }, 0).toLocaleString()} pcs
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="overflow-x-auto w-full">
                            <table className="w-full text-left border-collapse whitespace-nowrap">
                                <thead>
                                    <tr className="bg-white border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 font-black">
                                        <th className="p-4 w-10"></th>
                                        <th className="p-4 w-12">Image</th>
                                        <th className="p-4">Modèle (N° OF)</th>
                                        <th className="p-4">Client</th>
                                        <th className="p-4">Qté Initiale</th>
                                        {activeTab === 'complet' && (
                                            <>
                                                <th className="p-4">Cumul Reçu Dépôt</th>
                                                <th className="p-4">Stock Actuel</th>
                                                <th className="p-4">Prix Unitaire</th>
                                                <th className="p-4">Valeur Totale Stock</th>
                                            </>
                                        )}
                                        <th className="p-4 text-center">Statut</th>
                                        <th className="p-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredModels.map(model => {
                                        const agg = getModelAggregations(model);
                                        const isExpanded = expandedModelId === model.id;
                                        const sizes = model.ficheData?.sizes || model.meta_data?.sizes || ['S', 'M', 'L', 'XL'];
                                        const dateKey = `${selectedDate}_${model.id}`;
                                        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
                                        const planningId = associatedPlan?.id || model.id;

                                        return (
                                            <React.Fragment key={model.id}>
                                                <tr className={`border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${isExpanded ? 'bg-slate-50/20' : ''}`}>
                                                    <td className="p-4 text-center">
                                                        <button 
                                                            onClick={() => setExpandedModelId(isExpanded ? null : model.id)}
                                                            className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
                                                        >
                                                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                        </button>
                                                    </td>

                                                    <td className="p-4 text-center">
                                                        <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 mx-auto border border-slate-200 flex items-center justify-center">
                                                            {model.image ? (
                                                                <img src={model.image} className="w-full h-full object-cover" alt="" />
                                                            ) : (
                                                                <Package className="w-5 h-5 text-slate-350" />
                                                            )}
                                                        </div>
                                                    </td>

                                                    <td className="p-4">
                                                        <div className="font-black text-slate-800 text-sm">
                                                            {model?.meta_data?.nom_modele || 'Sans Nom'}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-bold">
                                                            Réf: {model?.meta_data?.reference || 'N/A'}
                                                        </div>
                                                    </td>

                                                    <td className="p-4 font-bold text-xs text-slate-600">
                                                        {model.ficheData?.client || 'Client Divers'}
                                                    </td>

                                                    <td className="p-4 font-black text-slate-700 text-xs">
                                                        {agg.totalExpected.toLocaleString()} pcs
                                                    </td>

                                                    {activeTab === 'complet' && (
                                                        <>
                                                            <td className="p-4 font-bold text-xs text-slate-600">
                                                                {agg.totalDepotIn.toLocaleString()} pcs
                                                            </td>
                                                            <td className="p-4 font-black text-sm text-indigo-750">
                                                                {agg.currentStock.toLocaleString()} pcs
                                                            </td>
                                                            <td className="p-4 font-bold text-xs text-slate-600">
                                                                {agg.unitPrice.toFixed(2)} DH
                                                            </td>
                                                            <td className="p-4 font-black text-xs text-emerald-700 bg-emerald-50/30">
                                                                {agg.stockValue.toLocaleString()} DH
                                                            </td>
                                                        </>
                                                    )}

                                                    <td className="p-4 text-center">
                                                        {agg.isShipped ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                                                                <Truck className="w-3 h-3" />
                                                                Expédié (Tsarja)
                                                            </span>
                                                        ) : (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                                agg.totalDepotIn >= agg.totalExpected && agg.totalExpected > 0
                                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-250'
                                                                    : agg.totalDepotIn > 0 
                                                                        ? 'bg-amber-50 text-amber-700 border border-amber-250'
                                                                        : 'bg-slate-50 text-slate-605 border border-slate-200'
                                                            }`}>
                                                                {agg.totalDepotIn >= agg.totalExpected && agg.totalExpected > 0 ? 'Complet au Dépôt' :
                                                                 agg.totalDepotIn > 0 ? 'Réception Partielle' : 'En attente'}
                                                            </span>
                                                        )}
                                                    </td>

                                                    <td className="p-4 text-right">
                                                        {agg.isShipped && (
                                                            <button
                                                                onClick={() => handleResetShipModel(model.id)}
                                                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition-colors border border-slate-200 inline-flex items-center gap-1"
                                                            >
                                                                Réinitialiser
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>

                                                {isExpanded && (
                                                    <tr className="bg-slate-50/60">
                                                        <td colSpan={14} className="p-6 border-b border-slate-200">
                                                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden max-w-4xl">
                                                                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                                                    <span className="text-xs font-black text-slate-700 tracking-wider flex items-center gap-1.5">
                                                                        <Layers className="w-4 h-4 text-emerald-600" />
                                                                        Détails de Complétion Globale par Taille
                                                                    </span>
                                                                    {agg.isShipped && (
                                                                        <span className="text-[10px] font-bold text-slate-500">
                                                                            Expédié le : {agg.shippedAt}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="overflow-x-auto">
                                                                    <table className="w-full text-left border-collapse text-xs">
                                                                        <thead>
                                                                            <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                                                                                <th className="p-3">Taille</th>
                                                                                <th className="p-3 text-right">Qté Attendue (OF)</th>

                                                                                {activeTab === 'complet' && (
                                                                                    <>
                                                                                        <th className="p-3 text-right">Reçu Cumulé</th>
                                                                                        <th className="p-3 text-right">Reste</th>
                                                                                        <th className="p-3 text-center">Taux de Complétion</th>
                                                                                    </>
                                                                                )}

                                                                                <th className="p-3 text-center">Statut</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-100">
                                                                            {sizes.map((sizeName, sIdx) => {
                                                                                const expected = getExpectedQtyForSize(model, sIdx);
                                                                                
                                                                                // Retrieve daily values from corresponding suivi
                                                                                const matchingSuivi = suivis.find(s => s.date === selectedDate && (s.modelId === model.id || s.planningId === planningId));
                                                                                const sizeKeyData = (matchingSuivi as any)?.finitionData?.[sizeName] || { entree: 0, sortie: 0 };
                                                                                const sizeEmbData = (matchingSuivi as any)?.emballageData?.[sizeName] || { mika_tiki: 0, depot: 0 };

                                                                                // Retrieve aggregated totals across all dates
                                                                                let totalFinitionOut = 0;
                                                                                suivis.forEach(s => {
                                                                                    if (s.modelId === model.id || s.planningId === planningId) {
                                                                                        totalFinitionOut += (s as any).finitionData?.[sizeName]?.sortie || 0;
                                                                                    }
                                                                                });

                                                                                let totalDepotIn = 0;
                                                                                suivis.forEach(s => {
                                                                                    if (s.modelId === model.id || s.planningId === planningId) {
                                                                                        totalDepotIn += (s as any).emballageData?.[sizeName]?.depot || 0;
                                                                                    }
                                                                                });

                                                                                const reste = Math.max(0, expected - totalDepotIn);
                                                                                const completionRate = expected > 0 ? Math.min(100, (totalDepotIn / expected) * 100) : 0;
                                                                                
                                                                                const status = totalDepotIn >= expected && expected > 0
                                                                                    ? 'Clôturé'
                                                                                    : totalDepotIn > 0 ? 'En cours' : 'En attente';

                                                                                return (
                                                                                    <tr key={sizeName} className="hover:bg-slate-50/40">
                                                                                        <td className="p-3 font-black text-slate-800 text-sm">{sizeName}</td>
                                                                                        <td className="p-3 text-right font-medium text-slate-600">{expected.toLocaleString()} pcs</td>
                                                                                        
                                                                                        {activeTab === 'complet' && (
                                                                                            <>
                                                                                                <td className="p-3 text-right font-bold text-indigo-650">{totalDepotIn.toLocaleString()} pcs</td>
                                                                                                <td className="p-3 text-right font-medium text-slate-500">{reste.toLocaleString()} pcs</td>
                                                                                                <td className="p-3">
                                                                                                    <div className="flex items-center justify-center gap-2">
                                                                                                        <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                                                                            <div
                                                                                                                className={`h-full ${completionRate >= 100 ? 'bg-emerald-500' : completionRate >= 80 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                                                                                style={{ width: `${completionRate}%` }}
                                                                                                            />
                                                                                                        </div>
                                                                                                        <span className="font-bold text-slate-500">{Math.round(completionRate)}%</span>
                                                                                                    </div>
                                                                                                </td>
                                                                                            </>
                                                                                        )}

                                                                                        <td className="p-3 text-center">
                                                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black ${
                                                                                                status === 'Clôturé' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                                                                status === 'En cours' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                                                                'bg-slate-50 text-slate-600 border border-slate-200'
                                                                                            }`}>
                                                                                                {status === 'Clôturé' ? '✅ Clôturé' :
                                                                                                 status === 'En cours' ? '🔄 En cours' :
                                                                                                 '⏳ En attente'}
                                                                                            </span>
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                            
                                                                            {/* Summary total row */}
                                                                            <tr className="bg-slate-55/40 font-black border-t border-slate-200 text-slate-800">
                                                                                <td className="p-3 uppercase font-black">Total</td>
                                                                                <td className="p-3 text-right">{sizes.reduce((sum, _, idx) => sum + getExpectedQtyForSize(model, idx), 0).toLocaleString()} pcs</td>

                                                                                {activeTab === 'complet' && (
                                                                                    <>
                                                                                        <td className="p-3 text-right text-indigo-600">{agg.totalDepotIn.toLocaleString()} pcs</td>
                                                                                        <td className="p-3 text-right text-slate-550">{Math.max(0, agg.totalExpected - agg.totalDepotIn).toLocaleString()} pcs</td>
                                                                                        <td className="p-3 text-center">
                                                                                            <div className="flex items-center justify-center gap-2">
                                                                                                <div className="w-16 bg-slate-200 h-2 rounded-full overflow-hidden">
                                                                                                    <div
                                                                                                        className={`h-full ${
                                                                                                            (agg.totalDepotIn / (agg.totalExpected || 1) * 100) >= 100 ? 'bg-emerald-500' : 
                                                                                                            (agg.totalDepotIn / (agg.totalExpected || 1) * 100) >= 80 ? 'bg-amber-500' : 'bg-rose-500'
                                                                                                        }`}
                                                                                                        style={{ width: `${(agg.totalDepotIn / (agg.totalExpected || 1) * 100)}%` }}
                                                                                                    />
                                                                                                </div>
                                                                                                <span>
                                                                                                    {Math.round(agg.totalDepotIn / (agg.totalExpected || 1) * 100)}%
                                                                                                </span>
                                                                                            </div>
                                                                                        </td>
                                                                                    </>
                                                                                )}

                                                                                <td className="p-3 text-center">
                                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black ${
                                                                                        agg.totalDepotIn >= agg.totalExpected && agg.totalExpected > 0 ? 'bg-emerald-100 text-emerald-800' :
                                                                                        agg.totalDepotIn > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                                                                                    }`}>
                                                                                        {agg.totalDepotIn >= agg.totalExpected && agg.totalExpected > 0 ? 'Clôturé' : 'En cours'}
                                                                                    </span>
                                                                                </td>
                                                                            </tr>
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
