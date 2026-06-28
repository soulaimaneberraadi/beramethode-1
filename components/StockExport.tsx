import React, { useState, useMemo, useEffect } from 'react';
import { ModelData, SuiviData, PlanningEvent, AppSettings } from '../types';
import { getWorkMinutesPerDay } from '../utils/planning';
import { computeChainEfficiency } from '../utils/efficiency';
import { deriveHourGrid } from './suivi/shared/hours';
import {
    Package, Truck, Search, CheckCircle2, Factory, PackageCheck, 
    ChevronDown, ChevronUp, Layers, Calendar, Plus, Clock, 
    ClipboardList, DollarSign, Check, AlertCircle, Trash2, X
} from 'lucide-react';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

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
    // Mode de saisie : 'jour' = matrice tous modÃ¨les ; 'heure' = un modÃ¨le, crÃ©neaux horaires (comme Suivi Production)
    const [entryMode, setEntryMode] = useState<'jour' | 'heure'>('jour');
    const [activeModelId, setActiveModelId] = useState<string | null>(null);
    const [modelPickerOpen, setModelPickerOpen] = useState(false);
    const { lang } = useLang();

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
            chaineId: 'DÃ©pÃ´t',
            quantiteProduite: totalDepot,
            quantiteDefaut: 0,
            quantiteExpediee: status === 'expedie' ? totalDepot : 0,
            quantiteRestante: status === 'expedie' ? 0 : totalDepot,
            statut: status,
            dateProduction: new Date().toISOString().split('T')[0],
            notes: status === 'expedie' ? 'ExpÃ©diÃ© via module Tsarja (Stock Export)' : 'Mis Ã  jour via module DÃ©pÃ´t (Stock Export)'
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

    // Saisie des dÃ©fauts / retouches de finition (par modÃ¨le, pour la date sÃ©lectionnÃ©e)
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
            console.error(tx(lang, {fr:'Ã‰chec de l\'enregistrement des dÃ©fauts dans la base de donnÃ©es',ar:'ÙØ´Ù„ Ø­ÙØ¸ Ø§Ù„Ø¹ÙŠÙˆØ¨ ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª',en:'Failed to save dÃ©fauts to database',es:'Error al guardar dÃ©fauts en la base de datos',pt:'Falha ao salvar dÃ©fauts no banco de dados',tr:'Defauts veritabanÄ±na kaydedilemedi'}), e);
        }
    };

    // Saisie horaire (mode 'heure') â€” stocke par crÃ©neau ET recalcule le total jour/taille
    const handleUpdateHourly = async (model: ModelData, hourKey: string, sizeName: string, val: number) => {
        if (!setSuivis) return;
        let newSuivis = [...suivis];
        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
        const planningId = associatedPlan?.id || model.id;

        let entry = newSuivis.find(s => s.date === selectedDate && (s.planningId === planningId || s.modelId === model.id));
        if (!entry) {
            entry = {
                id: `sv_export_${model.id}_${selectedDate}_${Date.now()}`,
                planningId, modelId: model.id, chaineId: activeTab === 'finition' ? 'Finition' : 'Emballage',
                date: selectedDate, entrer: 0, sorties: {}, totalHeure: 0, pJournaliere: 0,
                enCour: 0, resteEntrer: 0, resteSortie: 0, totalWorkers: 0, source: 'PLANNING'
            };
            newSuivis.push(entry);
        }

        const isFin = activeTab === 'finition';
        const hourlyKey = isFin ? 'finitionHourly' : 'emballageHourly';
        const hourly = { ...(((entry as any)[hourlyKey]) || {}) };
        hourly[hourKey] = { ...(hourly[hourKey] || {}), [sizeName]: val };

        // Total jour pour cette taille = somme des crÃ©neaux
        let dailySum = 0;
        Object.values(hourly).forEach((slot: any) => { dailySum += slot?.[sizeName] || 0; });

        newSuivis = newSuivis.map(s => {
            if (s.id !== entry!.id) return s;
            const updated: any = { ...s, [hourlyKey]: hourly };
            if (isFin) {
                const fd = { ...(((s as any).finitionData) || {}) };
                fd[sizeName] = { ...(fd[sizeName] || { entree: 0, sortie: 0 }), sortie: dailySum };
                updated.finitionData = fd;
            } else {
                const ed = { ...(((s as any).emballageData) || {}) };
                ed[sizeName] = { ...(ed[sizeName] || { mika_tiki: 0, depot: 0 }), depot: dailySum };
                updated.emballageData = ed;
            }
            return updated;
        });

        setSuivis(newSuivis);
        try {
            await fetch('/api/suivi', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ suivis: newSuivis })
            });
        } catch (e) {
            console.error("Failed to save hourly suivi to database", e);
        }

        if (!isFin) {
            let totalDepotIn = 0;
            newSuivis.forEach(s => {
                if (s.modelId === model.id || s.planningId === planningId) {
                    Object.values((s as any).emballageData || {}).forEach((sz: any) => { totalDepotIn += sz?.depot || 0; });
                }
            });
            syncFinishedGoodToDb(model, totalDepotIn);
        }
    };

    // Valeur horaire saisie (mode 'heure')
    const getHourlyValue = (model: ModelData, hourKey: string, sizeName: string): number | '' => {
        const plan = planningEvents.find(p => p.modelId === model.id);
        const planningId = plan?.id || model.id;
        const s = suivis.find(x => x.date === selectedDate && (x.modelId === model.id || x.planningId === planningId));
        const hourlyKey = activeTab === 'finition' ? 'finitionHourly' : 'emballageHourly';
        const v = (s as any)?.[hourlyKey]?.[hourKey]?.[sizeName];
        return v || '';
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

    // Helper to calculate total cumulative sewing output of a model (sum of totalHeure where chaineId is not Finition/Emballage/DÃ©pÃ´t)
    const getModelSewingOutput = (model: ModelData) => {
        const associatedPlan = planningEvents.find(p => p.modelId === model.id);
        const planningId = associatedPlan?.id || model.id;
        return suivis
            .filter(s => (s.modelId === model.id || s.planningId === planningId) && 
                         s.chaineId !== 'Finition' && 
                         s.chaineId !== 'Emballage' && 
                         s.chaineId !== 'DÃ©pÃ´t' && 
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
                s.chaineId !== 'DÃ©pÃ´t' && 
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
                s.chaineId !== 'DÃ©pÃ´t' && 
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

        // 3. Total received in dÃ©pÃ´t (Emballage depot entries)
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

        // 5. Current stock in dÃ©pÃ´t
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
    // ChaÃ®ne (ou sous-traitance) qui travaille le modÃ¨le â€” lue depuis le Planning
    const getModelChaine = (model: ModelData) => {
        const plan = planningEvents.find(p => p.modelId === model.id);
        return plan?.chaineId || model.ficheData?.chaine || 'â€”';
    };

    // Jours restants jusqu'Ã  la deadline (DDS) â€” lue depuis le Planning
    const getDaysRemaining = (model: ModelData): number | null => {
        const plan = planningEvents.find(p => p.modelId === model.id);
        const dds = plan?.strictDeadline_DDS || plan?.dateExport;
        if (!dds) return null;
        return Math.ceil((new Date(dds).getTime() - new Date(selectedDate).getTime()) / 86400000);
    };

    // Valeur saisie pour la date sÃ©lectionnÃ©e (sortie finition / reÃ§u dÃ©pÃ´t) par taille
    const getCellValue = (model: ModelData, sizeName: string): number | '' => {
        const plan = planningEvents.find(p => p.modelId === model.id);
        const planningId = plan?.id || model.id;
        const s = suivis.find(x => x.date === selectedDate && (x.modelId === model.id || x.planningId === planningId));
        const v = activeTab === 'finition'
            ? (s as any)?.finitionData?.[sizeName]?.sortie
            : (s as any)?.emballageData?.[sizeName]?.depot;
        return v || '';
    };

    // DÃ©fauts / retouches cumulÃ©s (toutes dates) pour un modÃ¨le
    const getModelDefauts = (model: ModelData) => {
        const plan = planningEvents.find(p => p.modelId === model.id);
        const planningId = plan?.id || model.id;
        return suivis.reduce((sum, s) => {
            if (s.modelId === model.id || s.planningId === planningId) return sum + ((s as any).defautsFinition || 0);
            return sum;
        }, 0);
    };

    // DÃ©fauts saisis pour la date sÃ©lectionnÃ©e
    const getDefautsToday = (model: ModelData): number | '' => {
        const plan = planningEvents.find(p => p.modelId === model.id);
        const planningId = plan?.id || model.id;
        const s = suivis.find(x => x.date === selectedDate && (x.modelId === model.id || x.planningId === planningId));
        return ((s as any)?.defautsFinition) || '';
    };

    // Cadence requise vs capacitÃ© â€” UNIFIÃ‰ avec le moteur du Planning
    // (capacitÃ© = opÃ©rateurs Ã— minutes/jour Ã— efficacitÃ© Ã— activitÃ© Ã· SAM, cf. utils/criticalRatio)
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
        const daysNeeded = capacityPerDay > 0 ? Math.ceil(reste / capacityPerDay) : null;       // jours nÃ©cessaires Ã  pleine capacitÃ©
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
        <div className="h-full flex flex-col bg-slate-50 dark:bg-dk-bg relative pb-20">
            <style>{`.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}.scrollbar-hide::-webkit-scrollbar{display:none}`}</style>
            {/* Top Header */}
            <div className="bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border px-4 md:px-6 py-3 md:py-4 shrink-0 shadow-sm dark:shadow-dk-sm z-20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
                    {/* Title + Nouveau ModÃ¨le */}
                    <div className="flex items-center justify-between gap-2 min-w-0 w-full md:w-auto">
                        <div className="flex items-center gap-2 min-w-0">
                            <PackageCheck className="w-5 h-5 md:w-6 md:h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <h1 className="text-lg md:text-2xl font-black text-slate-800 dark:text-dk-text tracking-tight truncate">{tx(lang, {fr:"Suivi Emballage & DÃ©pÃ´t",ar:"Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ØªØºÙ„ÙŠÙ ÙˆØ§Ù„Ù…Ø³ØªÙˆØ¯Ø¹",en:"Packaging & Warehouse Tracking",es:"Seguimiento de Embalaje y AlmacÃ©n",pt:"Acompanhamento de Embalagem e DepÃ³sito",tr:"Paketleme ve Depo Takibi"})}</h1>
                        </div>
                        {setCurrentView && (
                            <button
                                onClick={() => {
                                    if (createNewProject) createNewProject();
                                    setCurrentView('ingenierie');
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] md:text-xs px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl transition-all shadow-sm dark:shadow-dk-sm flex items-center gap-1 hover:scale-[1.02] active:scale-95 shrink-0 ml-auto"
                            >
                                {tx(lang,{fr:"Nouveau",ar:"Ø¬Ø¯ÙŠØ¯",en:"New",es:"Nuevo",pt:"Novo",tr:"Yeni"})}
                                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>
                        )}
                    </div>
                    
                    {/* Search & Actions */}
                    <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto">
                        <div className="relative w-full sm:w-auto">
                            <Search className="w-4 h-4 text-slate-400 dark:text-dk-muted absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder={tx(lang,{fr:"Rechercher...",ar:"Ø¨Ø­Ø«...",en:"Search...",es:"Buscar...",pt:"Pesquisar...",tr:"Ara..."})}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-4 py-2.5 md:py-2 border border-slate-200 dark:border-dk-border rounded-xl text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 w-full sm:w-60 bg-slate-50 dark:bg-dk-bg font-bold"
                            />
                        </div>

                        {activeTab !== 'complet' && (
                            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 rounded-xl px-2 md:px-3 py-1.5 text-emerald-700 shrink-0">
                                <Calendar className="w-4 h-4 shrink-0" />
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="bg-transparent outline-none font-bold text-xs border-none cursor-pointer focus:ring-0 p-0 text-emerald-800 w-[90px] md:w-auto"
                                />
                            </div>
                        )}

                        {/* Bascule Jour / Heure */}
                        {activeTab !== 'complet' && (
                            <div className="flex items-center bg-slate-100 dark:bg-dk-elevated rounded-xl p-0.5 text-xs font-black shrink-0">
                                <button
                                    onClick={() => setEntryMode('jour')}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${entryMode === 'jour' ? 'bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text shadow-sm dark:shadow-dk-sm' : 'text-slate-500 dark:text-dk-muted'}`}
                                >
                                    {tx(lang,{fr:"Jour",ar:"ÙŠÙˆÙ…",en:"Day",es:"DÃ­a",pt:"Dia",tr:"GÃ¼n"})}
                                </button>
                                <button
                                    onClick={() => setEntryMode('heure')}
                                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${entryMode === 'heure' ? 'bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text shadow-sm dark:shadow-dk-sm' : 'text-slate-500 dark:text-dk-muted'}`}
                                >
                                    <Clock className="w-3.5 h-3.5" />
                                    {tx(lang,{fr:"Heure",ar:"Ø³Ø§Ø¹Ø©",en:"Hour",es:"Hora",pt:"Hora",tr:"Saat"})}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <p className="text-slate-550 mt-1 text-xs md:text-sm font-medium hidden md:block">{tx(lang,{fr:"Suivi de finition, emballage et expÃ©dition des modÃ¨les au dÃ©pÃ´t final.",ar:"Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ØªØ´Ø·ÙŠØ¨ ÙˆØ§Ù„ØªØºÙ„ÙŠÙ ÙˆØ´Ø­Ù† Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„Ø§Øª Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ.",en:"Tracking finishing, packaging and shipping of models to the final warehouse.",es:"Seguimiento de acabado, embalaje y envÃ­o de modelos al almacÃ©n final.",pt:"Acompanhamento de acabamento, embalagem e expediÃ§Ã£o dos modelos ao depÃ³sito final.",tr:"Modellerin bitirme, paketleme ve nihai depoya sevkiyatÄ±nÄ±n takibi."})}</p>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border px-4 md:px-6 py-2 shrink-0 flex items-center gap-1.5 md:gap-2 overflow-x-auto scrollbar-hide">
                <button
                    onClick={() => { setActiveTab('finition'); setExpandedModelId(null); }}
                    className={`px-3 md:px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'finition' 
                            ? 'bg-slate-100 dark:bg-dk-elevated text-slate-800 dark:text-dk-text shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border' 
                            : 'text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                    }`}
                >
                    <Layers className="w-4 h-4" />
                    <span className="hidden sm:inline">{tx(lang,{fr:"Suivi Finition",ar:"Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ØªØ´Ø·ÙŠØ¨",en:"Finishing Tracking",es:"Seguimiento de Acabado",pt:"Acompanhamento de Acabamento",tr:"Bitirme Takibi"})}</span>
                    <span className="sm:hidden">{tx(lang,{fr:"Finition",ar:"ØªØ´Ø·ÙŠØ¨",en:"Finishing",es:"Acabado",pt:"Acabamento",tr:"Bitirme"})}</span>
                </button>
                <button
                    onClick={() => { setActiveTab('emballage'); setExpandedModelId(null); }}
                    className={`px-3 md:px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'emballage' 
                            ? 'bg-slate-100 dark:bg-dk-elevated text-slate-800 dark:text-dk-text shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border' 
                            : 'text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                    }`}
                >
                    <Package className="w-4 h-4" />
                    <span className="hidden sm:inline">{tx(lang,{fr:"Suivi Emballage & DÃ©pÃ´t",ar:"Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ØªØºÙ„ÙŠÙ ÙˆØ§Ù„Ù…Ø³ØªÙˆØ¯Ø¹",en:"Packaging & Warehouse Tracking",es:"Seguimiento de Embalaje y AlmacÃ©n",pt:"Acompanhamento de Embalagem e DepÃ³sito",tr:"Paketleme ve Depo Takibi"})}</span>
                    <span className="sm:hidden">{tx(lang,{fr:"Emballage",ar:"ØªØºÙ„ÙŠÙ",en:"Packaging",es:"Embalaje",pt:"Embalagem",tr:"Paketleme"})}</span>
                </button>
                <button
                    onClick={() => { setActiveTab('complet'); setExpandedModelId(null); }}
                    className={`px-3 md:px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'complet' 
                            ? 'bg-slate-100 dark:bg-dk-elevated text-slate-800 dark:text-dk-text shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border' 
                            : 'text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                    }`}
                >
                    <ClipboardList className="w-4 h-4" />
                    <span className="hidden sm:inline">{tx(lang,{fr:"Stock Complet & Tarifs",ar:"Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„ÙƒØ§Ù…Ù„ ÙˆØ§Ù„Ø£Ø³Ø¹Ø§Ø±",en:"Complete Stock & Prices",es:"Stock Completo y Precios",pt:"Stock Completo e PreÃ§os",tr:"Tam Stok ve Fiyatlar"})}</span>
                    <span className="sm:hidden">{tx(lang,{fr:"Stock",ar:"Ù…Ø®Ø²ÙˆÙ†",en:"Stock",es:"Stock",pt:"Stock",tr:"Stok"})}</span>
                </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto w-full max-w-[1400px] mx-auto p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6">
                


                {/* Bandeau d'alerte : modÃ¨les Ã  risque de retard */}
                {activeTab !== 'complet' && (() => {
                    const atRiskModels = filteredModels.filter(m => getModelCadence(m).atRisk);
                    if (atRiskModels.length === 0) return null;
                    return (
                        <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 rounded-2xl p-3 md:p-4 shadow-sm dark:shadow-dk-sm">
                            <div className="flex items-center gap-2 mb-2 md:mb-3">
                                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                                <span className="font-black text-sm text-rose-800">{atRiskModels.length} {tx(lang,{fr:"modÃ¨le(s) Ã  risque",ar:"Ù…ÙˆØ¯ÙŠÙ„(Ø§Øª) Ù…Ø¹Ø±Ø¶Ø© Ù„Ù„Ø®Ø·Ø±",en:"model(s) at risk",es:"modelo(s) en riesgo",pt:"modelo(s) em risco",tr:"risk altÄ±ndaki model(ler)"})}</span>
                            </div>
                            <div className="space-y-1.5 mb-3">
                                {atRiskModels.map(m => {
                                    const c = getModelCadence(m);
                                    return (
                                        <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                                            <span className="font-bold text-slate-800 dark:text-dk-text">{m.meta_data?.nom_modele || tx(lang,{fr:"Sans Nom",ar:"Ø¨Ø¯ÙˆÙ† Ø§Ø³Ù…",en:"Unnamed",es:"Sin Nombre",pt:"Sem Nome",tr:"Ä°simsiz"})}</span>
                                            <span className="text-rose-700 font-bold">{tx(lang,{fr:"Reste",ar:"Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ",en:"Remaining",es:"Restante",pt:"Restante",tr:"Kalan"})} {c.reste.toLocaleString()} pcs</span>
                                            <span className="text-slate-600 dark:text-dk-text-soft">
                                                {c.days !== null && c.days <= 0 ? tx(lang,{fr:"dÃ©lai dÃ©passÃ©",ar:"ØªØ¬Ø§ÙˆØ² Ø§Ù„Ù…ÙˆØ¹Ø¯",en:"deadline passed",es:"plazo vencido",pt:"prazo excedido",tr:"sÃ¼re aÅŸÄ±ldÄ±"}) : `${c.days} ${tx(lang,{fr:"j restants",ar:"Ø£ÙŠØ§Ù… Ù…ØªØ¨Ù‚ÙŠØ©",en:"d remaining",es:"d restantes",pt:"d restantes",tr:"g kalan"})}`} Â· {tx(lang,{fr:"requis â‰ˆ",ar:"Ø§Ù„Ù…Ø·Ù„ÙˆØ¨ â‰ˆ",en:"required â‰ˆ",es:"requerido â‰ˆ",pt:"necessÃ¡rio â‰ˆ",tr:"gerekli â‰ˆ"})} {c.cadenceRequise.toLocaleString()} pcs/j
                                                {c.capacityPerDay > 0 && <span className="text-slate-400 dark:text-dk-muted"> ({tx(lang,{fr:"capacitÃ© â‰ˆ",ar:"Ø§Ù„Ø·Ø§Ù‚Ø© â‰ˆ",en:"capacity â‰ˆ",es:"capacidad â‰ˆ",pt:"capacidade â‰ˆ",tr:"kapasite â‰ˆ"})} {c.capacityPerDay.toLocaleString()} pcs/j)</span>}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-500 dark:text-dk-muted">{tx(lang,{fr:"Solutions :",ar:"Ø§Ù„Ø­Ù„ÙˆÙ„:",en:"Solutions:",es:"Soluciones:",pt:"SoluÃ§Ãµes:",tr:"Ã‡Ã¶zÃ¼mler:"})}</span>
                                {setCurrentView && (
                                    <>
                                        <button
                                            onClick={() => setCurrentView('planning')}
                                            className="bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-slate-700 dark:text-dk-text-soft font-bold text-[11px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border transition-colors inline-flex items-center gap-1.5"
                                        >
                                            <Layers className="w-3.5 h-3.5" />
                                            {tx(lang,{fr:"Fractionner sur une autre chaÃ®ne",ar:"ØªÙˆØ²ÙŠØ¹ Ø¹Ù„Ù‰ Ø®Ø· Ø¥Ù†ØªØ§Ø¬ Ø¢Ø®Ø±",en:"Split to another line",es:"Dividir en otra lÃ­nea",pt:"Dividir noutra linha",tr:"BaÅŸka bir hatta bÃ¶l"})}
                                        </button>
                                        <button
                                            onClick={() => setCurrentView('sousTraitance')}
                                            className="bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-slate-700 dark:text-dk-text-soft font-bold text-[11px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border transition-colors inline-flex items-center gap-1.5"
                                        >
                                            <Truck className="w-3.5 h-3.5" />
                                            {tx(lang,{fr:"Sous-traiter",ar:"Ù…Ù‚Ø§ÙˆÙ„Ø© Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù†",en:"Subcontract",es:"Subcontratar",pt:"Subcontratar",tr:"TaÅŸeron"})}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* Main Table Card */}
                <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-2xl shadow-sm dark:shadow-dk-sm overflow-hidden">
                    <div className="p-4 bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border flex justify-between items-center">
                        <h2 className="font-black text-sm text-slate-800 dark:text-dk-text flex items-center gap-2 truncate">
                            <ClipboardList className="w-4 h-4 text-slate-500 dark:text-dk-muted shrink-0" />
                            <span className="hidden sm:inline">
                                {activeTab === 'finition' ? tx(lang,{fr:"Journal de Suivi Quotidien - Finition",ar:"Ø³Ø¬Ù„ Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ÙŠÙˆÙ…ÙŠØ© - Ø§Ù„ØªØ´Ø·ÙŠØ¨",en:"Daily Tracking Log - Finishing",es:"Registro Diario de Seguimiento - Acabado",pt:"Registo DiÃ¡rio de Acompanhamento - Acabamento",tr:"GÃ¼nlÃ¼k Takip Defteri - Bitirme"}) :
                                 activeTab === 'emballage' ? tx(lang,{fr:"Journal de Suivi Quotidien - Emballage & DÃ©pÃ´t",ar:"Ø³Ø¬Ù„ Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ÙŠÙˆÙ…ÙŠØ© - Ø§Ù„ØªØºÙ„ÙŠÙ ÙˆØ§Ù„Ù…Ø³ØªÙˆØ¯Ø¹",en:"Daily Tracking Log - Packaging & Warehouse",es:"Registro Diario de Seguimiento - Embalaje y AlmacÃ©n",pt:"Registo DiÃ¡rio de Acompanhamento - Embalagem e DepÃ³sito",tr:"GÃ¼nlÃ¼k Takip Defteri - Paketleme ve Depo"}) :
                                 tx(lang,{fr:"Ã‰tat GÃ©nÃ©ral du Stock Complet & Valeurs FinanciÃ¨res",ar:"Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø¹Ø§Ù…Ø© Ù„Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„ÙƒØ§Ù…Ù„ ÙˆØ§Ù„Ù‚ÙŠÙ… Ø§Ù„Ù…Ø§Ù„ÙŠØ©",en:"General Status of Complete Stock & Financial Values",es:"Estado General del Stock Completo y Valores Financieros",pt:"Estado Geral do Stock Completo e Valores Financeiros",tr:"Tam Stok ve Finansal DeÄŸerler Genel Durumu"})}
                            </span>
                            <span className="sm:hidden">
                                {activeTab === 'finition' ? tx(lang,{fr:"Suivi Finition",ar:"Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ØªØ´Ø·ÙŠØ¨",en:"Finishing Tracking",es:"Seguimiento de Acabado",pt:"Acompanhamento de Acabamento",tr:"Bitirme Takibi"}) :
                                 activeTab === 'emballage' ? tx(lang,{fr:"Suivi Emballage",ar:"Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ØªØºÙ„ÙŠÙ",en:"Packaging Tracking",es:"Seguimiento de Embalaje",pt:"Acompanhamento de Embalagem",tr:"Paketleme Takibi"}) :
                                 tx(lang,{fr:"Stock Complet",ar:"Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„ÙƒØ§Ù…Ù„",en:"Complete Stock",es:"Stock Completo",pt:"Stock Completo",tr:"Tam Stok"})}
                            </span>
                        </h2>
                    </div>

                    {filteredModels.length === 0 ? (
                        <div className="p-8 md:p-16 text-center text-slate-400 dark:text-dk-muted">
                            <PackageCheck className="w-12 h-12 md:w-16 md:h-16 text-slate-200 mx-auto mb-3 md:mb-4" />
                            <p className="font-bold text-slate-700 dark:text-dk-text-soft">{tx(lang,{fr:"Aucun modÃ¨le actif Ã  afficher.",ar:"Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…ÙˆØ¯ÙŠÙ„ Ù†Ø´Ø· Ù„Ù„Ø¹Ø±Ø¶.",en:"No active model to display.",es:"No hay modelo activo para mostrar.",pt:"Nenhum modelo ativo para exibir.",tr:"GÃ¶sterilecek aktif model yok."})}</p>
                            <p className="text-xs mt-2 text-slate-500 dark:text-dk-muted">{tx(lang,{fr:"CrÃ©ez un nouveau modÃ¨le ou clÃ´turez une production pour le voir apparaÃ®tre.",ar:"Ø£Ù†Ø´Ø¦ Ù…ÙˆØ¯ÙŠÙ„Ø§Ù‹ Ø¬Ø¯ÙŠØ¯Ø§Ù‹ Ø£Ùˆ Ø£Ù†Ù‡Ù Ø¥Ù†ØªØ§Ø¬Ø§Ù‹ Ù„ÙŠØ¸Ù‡Ø± Ù‡Ù†Ø§.",en:"Create a new model or close a production for it to appear here.",es:"Cree un nuevo modelo o cierre una producciÃ³n para que aparezca aquÃ­.",pt:"Crie um novo modelo ou encerre uma produÃ§Ã£o para que apareÃ§a aqui.",tr:"Burada gÃ¶rÃ¼nmesi iÃ§in yeni bir model oluÅŸturun veya bir Ã¼retimi kapatÄ±n."})}</p>
                        </div>
                    ) : activeTab !== 'complet' && entryMode === 'heure' ? (
                        <div className="p-3 md:p-4 space-y-3 md:space-y-4">
                            {(() => {
                                const activeModel = filteredModels.find(m => m.id === activeModelId) || filteredModels[0];
                                if (!activeModel) return null;
                                const sizes = activeModel.ficheData?.sizes || activeModel.meta_data?.sizes || [];
                                const cols = sizes.length ? sizes : ['Total'];
                                const grid = settings ? deriveHourGrid(settings) : deriveHourGrid({} as AppSettings);
                                const agg = getModelAggregations(activeModel);
                                const cumul = activeTab === 'finition' ? agg.totalFinitionOut : agg.totalDepotIn;
                                const reste = Math.max(0, agg.totalExpected - agg.totalDepotIn);
                                const dayTotal = grid.keys.reduce((acc, key) => acc + cols.reduce((s2, c) => s2 + (Number(getHourlyValue(activeModel, key, c)) || 0), 0), 0);
                                return (
                                    <>
                                        {/* Carte modÃ¨le actif = sÃ©lecteur (photo + rÃ©f + chaÃ®ne + client), style Suivi Production */}
                                        <div className="relative">
                                            <span className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-wider">{tx(lang,{fr:"ModÃ¨le actif",ar:"Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„Ù†Ø´Ø·",en:"Active Model",es:"Modelo Activo",pt:"Modelo Ativo",tr:"Aktif Model"})}</span>
                                            <button
                                                onClick={() => setModelPickerOpen(o => !o)}
                                                className="mt-1 w-full flex items-center gap-2 md:gap-3 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-2.5 md:p-3 hover:border-emerald-300 transition-colors text-left"
                                            >
                                                <div className="w-10 h-10 md:w-14 md:h-14 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border overflow-hidden flex items-center justify-center shrink-0">
                                                    {activeModel.image ? (
                                                        <img src={activeModel.image} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <Package className="w-6 h-6 text-slate-300 dark:text-dk-muted" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-black text-slate-800 dark:text-dk-text text-sm truncate">{activeModel.meta_data?.nom_modele || tx(lang,{fr:"Sans Nom",ar:"Ø¨Ø¯ÙˆÙ† Ø§Ø³Ù…",en:"Unnamed",es:"Sin Nombre",pt:"Sem Nome",tr:"Ä°simsiz"})}</div>
                                                    <div className="text-[11px] text-slate-500 dark:text-dk-muted font-bold flex flex-wrap gap-x-2">
                                                        <span>{tx(lang,{fr:"RÃ©f:",ar:"Ø§Ù„Ù…Ø±Ø¬Ø¹:",en:"Ref:",es:"Ref:",pt:"Ref:",tr:"Ref:"})} {activeModel.meta_data?.reference || 'N/A'}</span>
                                                        <span className="text-emerald-600 dark:text-emerald-400">{getModelChaine(activeModel)}</span>
                                                        <span>{activeModel.ficheData?.client || tx(lang,{fr:"Client Divers",ar:"Ø¹Ù…ÙŠÙ„ Ù…ØªÙ†ÙˆØ¹",en:"Various Client",es:"Cliente Varios",pt:"Cliente Diversos",tr:"Ã‡eÅŸitli MÃ¼ÅŸteri"})}</span>
                                                    </div>
                                                </div>
                                                <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
                                            </button>

                                            {modelPickerOpen && (
                                                <>
                                                    <div className="fixed inset-0 z-20" onClick={() => setModelPickerOpen(false)} />
                                                    <div className="absolute z-30 mt-1 w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl shadow-lg dark:shadow-dk-lg max-h-72 overflow-y-auto py-1">
                                                        {filteredModels.map(m => (
                                                            <button
                                                                key={m.id}
                                                                onClick={() => { setActiveModelId(m.id); setModelPickerOpen(false); }}
                                                                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-left transition-colors ${m.id === activeModel.id ? 'bg-emerald-50 dark:bg-emerald-900/30' : ''}`}
                                                            >
                                                                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border overflow-hidden flex items-center justify-center shrink-0">
                                                                    {m.image ? <img src={m.image} className="w-full h-full object-cover" alt="" /> : <Package className="w-4 h-4 text-slate-300 dark:text-dk-muted" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="font-bold text-slate-800 dark:text-dk-text text-xs truncate">{m.meta_data?.nom_modele || tx(lang,{fr:"Sans Nom",ar:"Ø¨Ø¯ÙˆÙ† Ø§Ø³Ù…",en:"Unnamed",es:"Sin Nombre",pt:"Sem Nome",tr:"Ä°simsiz"})}</div>
                                                                    <div className="text-[10px] text-slate-500 dark:text-dk-muted font-bold">{getModelChaine(m)} Â· {m.ficheData?.client || tx(lang,{fr:"Client Divers",ar:"Ø¹Ù…ÙŠÙ„ Ù…ØªÙ†ÙˆØ¹",en:"Various Client",es:"Cliente Varios",pt:"Cliente Diversos",tr:"Ã‡eÅŸitli MÃ¼ÅŸteri"})}</div>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2">
                                            <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-2 md:p-3 text-center"><p className="text-[9px] md:text-[10px] font-bold text-slate-500 dark:text-dk-muted">{tx(lang,{fr:"Cible (OF)",ar:"Ø§Ù„Ù‡Ø¯Ù (Ø£Ù…Ø± Ø§Ù„ØªØµÙ†ÙŠØ¹)",en:"Target (OF)",es:"Objetivo (OF)",pt:"Alvo (OF)",tr:"Hedef (OF)"})}</p><p className="text-base md:text-lg font-black text-slate-800 dark:text-dk-text">{agg.totalExpected.toLocaleString()}</p></div>
                                            <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-2 md:p-3 text-center"><p className="text-[9px] md:text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{tx(lang,{fr:"Total du jour",ar:"Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„ÙŠÙˆÙ…",en:"Day Total",es:"Total del dÃ­a",pt:"Total do dia",tr:"GÃ¼n ToplamÄ±"})}</p><p className="text-base md:text-lg font-black text-emerald-700">{dayTotal.toLocaleString()}</p></div>
                                            <div className="bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 rounded-xl p-2 md:p-3 text-center"><p className="text-[9px] md:text-[10px] font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text">{activeTab === 'finition' ? tx(lang,{fr:"Cumul fini",ar:"Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ",en:"Finished Total",es:"Total Terminado",pt:"Total Acabado",tr:"BitmiÅŸ Toplam"}) : tx(lang,{fr:"Cumul dÃ©pÃ´t",ar:"Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹",en:"Deposit Total",es:"Total DepÃ³sito",pt:"Total DepÃ³sito",tr:"Depo ToplamÄ±"})}</p><p className="text-base md:text-lg font-black text-indigo-700 dark:text-dk-accent-text">{cumul.toLocaleString()}</p></div>
                                            <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-2 md:p-3 text-center"><p className="text-[9px] md:text-[10px] font-bold text-amber-600 dark:text-amber-400">{tx(lang,{fr:"Reste Ã  produire",ar:"Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ Ù„Ù„Ø¥Ù†ØªØ§Ø¬",en:"Remaining to Produce",es:"Restante por Producir",pt:"Restante por Produzir",tr:"Ãœretilecek Kalan"})}</p><p className="text-base md:text-lg font-black text-amber-700">{reste.toLocaleString()}</p></div>
                                        </div>

                                        <div className="overflow-x-auto border border-slate-200 dark:border-dk-border rounded-xl">
                                            <table className="w-full lg:w-auto lg:min-w-[680px] lg:mx-auto text-left border-collapse text-xs">
                                                <thead>
                                                    <tr className="bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border text-[10px] uppercase tracking-wider text-slate-500 dark:text-dk-muted font-black">
                                                            <th className="p-2 md:p-3 lg:px-6">{tx(lang,{fr:"H",ar:"Ø³",en:"H",es:"H",pt:"H",tr:"S"})}</th>
                                                            {cols.map(c => <th key={c} className="p-2 md:p-3 lg:px-6 text-center">{c}</th>)}
                                                            <th className="p-2 md:p-3 lg:px-6 text-center bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/40 text-indigo-700 dark:text-dk-accent-text">{tx(lang,{fr:"Tot",ar:"Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹",en:"Tot",es:"Tot",pt:"Tot",tr:"Top"})}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {grid.keys.map((key, i) => {
                                                        const rowTotal = cols.reduce((s2, c) => s2 + (Number(getHourlyValue(activeModel, key, c)) || 0), 0);
                                                        return (
                                                            <tr key={key} className="border-b border-slate-100 dark:border-dk-border hover:bg-slate-50/50">
                                                                <td className="p-2 md:p-3 lg:px-6 font-black text-slate-700 dark:text-dk-text-soft">{grid.hours[i]}</td>
                                                                {cols.map(c => (
                                                                    <td key={c} className="p-1.5 md:p-2 lg:px-6 text-center">
                                                                        <input
                                                                            type="number"
                                                                            value={getHourlyValue(activeModel, key, c)}
                                                                            onChange={(e) => handleUpdateHourly(activeModel, key, c, Math.max(0, parseInt(e.target.value) || 0))}
                                                                            placeholder="0"
                                                                            className="w-14 md:w-20 lg:w-24 mx-auto block text-center font-bold text-sm bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg py-2 focus:bg-white focus:border-emerald-500 outline-none transition-all"
                                                                        />
                                                                    </td>
                                                                ))}
                                                                <td className="p-2 md:p-3 lg:px-6 text-center font-bold text-indigo-700 dark:text-dk-accent-text">{rowTotal.toLocaleString()}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                    <tr className="bg-slate-50 dark:bg-dk-bg font-black border-t-2 border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text">
                                                        <td className="p-2 md:p-3 lg:px-6 uppercase text-[10px]">{tx(lang,{fr:"Total",ar:"Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹",en:"Total",es:"Total",pt:"Total",tr:"Toplam"})}</td>
                                                        {cols.map(c => {
                                                            const colTotal = grid.keys.reduce((acc, key) => acc + (Number(getHourlyValue(activeModel, key, c)) || 0), 0);
                                                            return <td key={c} className="p-2 md:p-3 lg:px-6 text-center">{colTotal.toLocaleString()}</td>;
                                                        })}
                                                        <td className="p-2 md:p-3 lg:px-6 text-center text-indigo-700 dark:text-dk-accent-text">{dayTotal.toLocaleString()}</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* DÃ©tail par taille â€” toutes les tailles du modÃ¨le */}
                                        {sizes.length > 0 && (
                                            <div>
                                                <p className="text-[10px] md:text-[11px] font-black text-slate-500 dark:text-dk-muted uppercase tracking-wider mb-1.5 md:mb-2 flex items-center gap-1.5">
                                                    <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {tx(lang,{fr:"DÃ©tail par taille",ar:"Ø§Ù„ØªÙØ§ØµÙŠÙ„ Ø­Ø³Ø¨ Ø§Ù„Ù…Ù‚Ø§Ø³",en:"Detail by Size",es:"Detalle por Talla",pt:"Detalhe por Tamanho",tr:"Beden DetayÄ±"})}
                                                </p>
                                                <div className="overflow-x-auto border border-slate-200 dark:border-dk-border rounded-xl">
                                                    <table className="w-full lg:w-auto lg:min-w-[520px] lg:mx-auto text-left border-collapse text-xs">
                                                        <thead>
                                                            <tr className="bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border text-[10px] uppercase tracking-wider text-slate-500 dark:text-dk-muted font-black">
                                                                <th className="p-2 md:p-3 lg:px-8">{tx(lang,{fr:"Taille",ar:"Ø§Ù„Ù…Ù‚Ø§Ø³",en:"Size",es:"Talla",pt:"Tamanho",tr:"Beden"})}</th>
                                                                <th className="p-2 md:p-3 text-right">{tx(lang,{fr:"Cible",ar:"Ø§Ù„Ù‡Ø¯Ù",en:"Target",es:"Objetivo",pt:"Alvo",tr:"Hedef"})}</th>
                                                                <th className="p-2 md:p-3 text-right text-indigo-700 dark:text-dk-accent-text">{activeTab === 'finition' ? tx(lang,{fr:"Cumul",ar:"Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ",en:"Total",es:"Acumulado",pt:"Acumulado",tr:"Toplam"}) : tx(lang,{fr:"DÃ©pÃ´t",ar:"Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹",en:"Deposit",es:"DepÃ³sito",pt:"DepÃ³sito",tr:"Depo"})}</th>
                                                                <th className="p-2 md:p-3 text-right text-emerald-700">{tx(lang,{fr:"Reste",ar:"Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ",en:"Remaining",es:"Restante",pt:"Restante",tr:"Kalan"})}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sizes.map((sz, idx) => {
                                                                const expected = getExpectedQtyForSize(activeModel, idx);
                                                                const plan = planningEvents.find(p => p.modelId === activeModel.id);
                                                                const pid = plan?.id || activeModel.id;
                                                                let cumulSize = 0;
                                                                if (activeTab === 'finition') {
                                                                    cumulSize = getSizeFinitionOutput(activeModel, sz);
                                                                } else {
                                                                    suivis.forEach(s => {
                                                                        if (s.modelId === activeModel.id || s.planningId === pid) {
                                                                            cumulSize += (s as any).emballageData?.[sz]?.depot || 0;
                                                                        }
                                                                    });
                                                                }
                                                                const resteSize = Math.max(0, expected - cumulSize);
                                                                return (
                                                                    <tr key={sz} className="border-b border-slate-100 dark:border-dk-border">
                                                                        <td className="p-2 md:p-3 font-black text-slate-800 dark:text-dk-text uppercase">{sz}</td>
                                                                        <td className="p-2 md:p-3 text-right text-slate-600 dark:text-dk-text-soft">{expected.toLocaleString()}</td>
                                                                        <td className="p-2 md:p-3 text-right font-bold text-indigo-700 dark:text-dk-accent-text">{cumulSize.toLocaleString()}</td>
                                                                        <td className="p-2 md:p-3 text-right font-bold text-emerald-700">{resteSize.toLocaleString()}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    ) : activeTab !== 'complet' ? (
                        <div className="overflow-x-auto w-full relative group/table">
                            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none z-10 md:hidden opacity-0 group-hover/table:opacity-100 transition-opacity" />
                            <table className="min-w-full lg:min-w-0 lg:w-auto lg:mx-auto text-left border-collapse whitespace-nowrap text-xs">
                                <thead>
                                    <tr className="bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border text-[10px] uppercase tracking-wider text-slate-500 dark:text-dk-muted font-black">
                                        <th className="p-3 sticky left-0 bg-white dark:bg-dk-surface z-10">{tx(lang,{fr:"ModÃ¨le (NÂ° OF)",ar:"Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ (Ø±Ù‚Ù… Ø£Ù…Ø± Ø§Ù„ØªØµÙ†ÙŠØ¹)",en:"Model (OF No.)",es:"Modelo (NÂ° OF)",pt:"Modelo (NÂ° OF)",tr:"Model (Ä°ÅŸ Emri No.)"})}</th>
                                        <th className="p-3 text-center">{tx(lang,{fr:"ChaÃ®ne",ar:"Ø§Ù„Ø®Ø·",en:"Line",es:"LÃ­nea",pt:"Linha",tr:"Hat"})}</th>
                                        <th className="p-3 text-center">
                                            <span className="hidden md:inline">{tx(lang,{fr:"Tailles â€”",ar:"Ø§Ù„Ù…Ù‚Ø§Ø³Ø§Øª â€”",en:"Sizes â€”",es:"Tallas â€”",pt:"Tamanhos â€”",tr:"Bedenler â€”"})} {activeTab === 'finition' ? tx(lang,{fr:"sortie finition",ar:"Ù…Ø®Ø±Ø¬Ø§Øª Ø§Ù„ØªØ´Ø·ÙŠØ¨",en:"finishing output",es:"salida acabado",pt:"saÃ­da acabamento",tr:"bitirme Ã§Ä±ktÄ±sÄ±"}) : tx(lang,{fr:"reÃ§u dÃ©pÃ´t",ar:"Ø§Ù„ÙˆØ§Ø±Ø¯ Ù„Ù„Ù…Ø³ØªÙˆØ¯Ø¹",en:"received at deposit",es:"recibido depÃ³sito",pt:"recebido depÃ³sito",tr:"depoya alÄ±nan"})}</span>
                                            <span className="md:hidden">{tx(lang,{fr:"Tailles",ar:"Ø§Ù„Ù…Ù‚Ø§Ø³Ø§Øª",en:"Sizes",es:"Tallas",pt:"Tamanhos",tr:"Bedenler"})}</span>
                                        </th>
                                        {activeTab === 'finition' && <th className="p-3 text-center bg-rose-50 dark:bg-rose-900/30/40 text-rose-700">{tx(lang,{fr:"DÃ©fauts",ar:"Ø§Ù„Ø¹ÙŠÙˆØ¨",en:"Defects",es:"Defectos",pt:"Defeitos",tr:"Kusurlar"})}</th>}
                                        <th className="p-3 text-center bg-amber-50 dark:bg-amber-900/30/40 text-amber-700">WIP</th>
                                        <th className="p-3 text-center bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/40 text-indigo-700 dark:text-dk-accent-text">{activeTab === 'finition' ? tx(lang,{fr:"Cumul",ar:"Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ",en:"Total",es:"Acumulado",pt:"Acumulado",tr:"Toplam"}) : tx(lang,{fr:"DÃ©pÃ´t",ar:"Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹",en:"Deposit",es:"DepÃ³sito",pt:"DepÃ³sito",tr:"Depo"})}</th>
                                        <th className="p-3 text-center bg-emerald-50 dark:bg-emerald-900/30/40 text-emerald-700">{tx(lang,{fr:"Reste",ar:"Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ",en:"Remaining",es:"Restante",pt:"Restante",tr:"Kalan"})}</th>
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
                                        // Reste basÃ© sur le reÃ§u au dÃ©pÃ´t (commande finie = entrÃ©e dÃ©pÃ´t)
                                        const reste = Math.max(0, agg.totalExpected - agg.totalDepotIn);
                                        const days = getDaysRemaining(model);
                                        const cad = getModelCadence(model);
                                        const atRisk = cad.atRisk;
                                        const tight = !atRisk && reste > 0 && days !== null && days > 0 && days <= 3;
                                        return (
                                            <tr key={model.id} className="border-b border-slate-100 dark:border-dk-border hover:bg-slate-50/50 transition-colors">
                                                <td className="p-3 sticky left-0 bg-white dark:bg-dk-surface z-10">
                                                    <div className="font-black text-slate-800 dark:text-dk-text text-sm truncate max-w-[120px] sm:max-w-none">{model?.meta_data?.nom_modele || tx(lang,{fr:"Sans Nom",ar:"Ø¨Ø¯ÙˆÙ† Ø§Ø³Ù…",en:"Unnamed",es:"Sin Nombre",pt:"Sem Nome",tr:"Ä°simsiz"})}</div>
                                                    <div className="text-[10px] text-slate-400 dark:text-dk-muted font-bold truncate">{tx(lang,{fr:"RÃ©f:",ar:"Ø§Ù„Ù…Ø±Ø¬Ø¹:",en:"Ref:",es:"Ref:",pt:"Ref:",tr:"Ref:"})} {model?.meta_data?.reference || 'N/A'}</div>
                                                </td>
                                                <td className="p-3 text-center font-bold text-slate-600 dark:text-dk-text-soft">{getModelChaine(model)}</td>
                                                <td className="p-2">
                                                    {sizes.length === 0 ? (
                                                        <span className="text-slate-300 dark:text-dk-muted text-xs">{tx(lang,{fr:"â€” aucune taille dÃ©finie â€”",ar:"â€” Ù„Ù… ÙŠØªÙ… ØªØ­Ø¯ÙŠØ¯ Ø£ÙŠ Ù…Ù‚Ø§Ø³ â€”",en:"â€” no size defined â€”",es:"â€” ninguna talla definida â€”",pt:"â€” nenhum tamanho definido â€”",tr:"â€” beden tanÄ±mlanmamÄ±ÅŸ â€”"})}</span>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-2">
                                                            {sizes.map(sz => (
                                                                <div key={sz} className="flex flex-col items-center">
                                                                    <span className="text-[9px] font-black text-slate-400 dark:text-dk-muted uppercase">{sz}</span>
                                                                    <input
                                                                        type="number"
                                                                        value={getCellValue(model, sz)}
                                                                        onChange={(e) => {
                                                                            const v = Math.max(0, parseInt(e.target.value) || 0);
                                                                            if (activeTab === 'finition') handleUpdateFinition(model, sz, 'sortie', v);
                                                                            else handleUpdateEmballage(model, sz, 'depot', v);
                                                                        }}
                                                                        placeholder="0"
                                                                        className="w-12 md:w-14 text-center font-bold text-xs bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg py-2 md:py-1 focus:bg-white focus:border-emerald-500 outline-none transition-all"
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                {activeTab === 'finition' && (
                                                    <td className="p-2 text-center bg-rose-50 dark:bg-rose-900/30/20">
                                                        <input
                                                            type="number"
                                                            value={getDefautsToday(model)}
                                                            onChange={(e) => handleUpdateDefauts(model, Math.max(0, parseInt(e.target.value) || 0))}
                                                            placeholder="0"
                                                            className="w-12 md:w-14 text-center font-bold text-xs bg-rose-50 dark:bg-rose-900/30/50 border border-rose-100 rounded-lg py-2 md:py-1 focus:bg-white focus:border-rose-400 outline-none transition-all text-rose-700"
                                                        />
                                                        {getModelDefauts(model) > 0 && (
                                                            <div className="text-[9px] text-rose-500 font-bold mt-0.5">{tx(lang,{fr:"cumul",ar:"Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ",en:"total",es:"acum.",pt:"acum.",tr:"toplam"})} {getModelDefauts(model).toLocaleString()}</div>
                                                        )}
                                                    </td>
                                                )}
                                                <td className="p-3 text-center font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30/20">{wip.toLocaleString()}</td>
                                                <td className="p-3 text-center font-black text-sm text-indigo-700 dark:text-dk-accent-text bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/30">{cumul.toLocaleString()}</td>
                                                <td className="p-3 text-center bg-emerald-50 dark:bg-emerald-900/30/30">
                                                    <div className={`font-black text-sm ${atRisk ? 'text-rose-700' : 'text-emerald-700'}`}>{reste.toLocaleString()} pcs</div>
                                                    {days !== null && (
                                                        <div className={`text-[10px] font-bold ${days < 0 ? 'text-rose-600 dark:text-rose-400' : (atRisk || tight) ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-dk-muted'}`}>
                                                            {reste === 0 ? tx(lang,{fr:"âœ“ Complet",ar:"âœ“ Ù…ÙƒØªÙ…Ù„",en:"âœ“ Complete",es:"âœ“ Completo",pt:"âœ“ Completo",tr:"âœ“ TamamlandÄ±"}) : days < 0 ? `${Math.abs(days)} ${tx(lang,{fr:"j de retard",ar:"Ø£ÙŠØ§Ù… ØªØ£Ø®ÙŠØ±",en:"days late",es:"dÃ­as de retraso",pt:"dias de atraso",tr:"gÃ¼n gecikme"})}` : days === 0 ? tx(lang,{fr:"Aujourd'hui",ar:"Ø§Ù„ÙŠÙˆÙ…",en:"Today",es:"Hoy",pt:"Hoje",tr:"BugÃ¼n"}) : `${days} ${tx(lang,{fr:"jours restants",ar:"Ø£ÙŠØ§Ù… Ù…ØªØ¨Ù‚ÙŠØ©",en:"days remaining",es:"dÃ­as restantes",pt:"dias restantes",tr:"gÃ¼n kalan"})}`}
                                                        </div>
                                                    )}
                                                    {reste > 0 && cad.cadenceRequise > 0 && (
                                                        <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text">â‰ˆ {cad.cadenceRequise.toLocaleString()} {tx(lang,{fr:"pcs/j requis",ar:"Ù‚Ø·Ø¹Ø©/ÙŠÙˆÙ… Ù…Ø·Ù„ÙˆØ¨",en:"pcs/d required",es:"pcs/d requerido",pt:"pcs/d necessÃ¡rio",tr:"adet/gÃ¼n gerekli"})}</div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {/* Ligne Total */}
                                    <tr className="bg-slate-50 dark:bg-dk-bg font-black border-t-2 border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text">
                                        <td className="p-3 uppercase">{tx(lang,{fr:"Total",ar:"Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹",en:"Total",es:"Total",pt:"Total",tr:"Toplam"})}</td>
                                        <td className="p-3 text-center text-slate-300 dark:text-dk-muted">â€”</td>
                                        <td className="p-3 text-center text-slate-700 dark:text-dk-text-soft">
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
                                            }, 0).toLocaleString()} <span className="text-[9px] text-slate-400 dark:text-dk-muted">{tx(lang,{fr:"pcs / jour",ar:"Ù‚Ø·Ø¹Ø© / ÙŠÙˆÙ…",en:"pcs / day",es:"pcs / dÃ­a",pt:"pcs / dia",tr:"adet / gÃ¼n"})}</span>
                                        </td>
                                        {activeTab === 'finition' && (
                                            <td className="p-3 text-center text-rose-700">
                                                {filteredModels.reduce((acc, m) => acc + getModelDefauts(m), 0).toLocaleString()}
                                            </td>
                                        )}
                                        <td className="p-3 text-center text-amber-600 dark:text-amber-400">
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
                                        <td className="p-3 text-center text-indigo-700 dark:text-dk-accent-text">
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
                        <div className="overflow-x-auto w-full relative group/table">
                            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none z-10 md:hidden opacity-0 group-hover/table:opacity-100 transition-opacity" />
                            <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
                                <thead>
                                    <tr className="bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border text-[10px] uppercase tracking-wider text-slate-500 dark:text-dk-muted font-black">
                                        <th className="p-3 md:p-4 w-10 sticky left-0 bg-white dark:bg-dk-surface z-10"></th>
                                        <th className="p-3 md:p-4 w-12 hidden md:table-cell">{tx(lang,{fr:"Image",ar:"Ø§Ù„ØµÙˆØ±Ø©",en:"Image",es:"Imagen",pt:"Imagem",tr:"GÃ¶rsel"})}</th>
                                        <th className="p-3 md:p-4">{tx(lang,{fr:"ModÃ¨le",ar:"Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„",en:"Model",es:"Modelo",pt:"Modelo",tr:"Model"})}</th>
                                        <th className="p-3 md:p-4 hidden md:table-cell">{tx(lang,{fr:"Client",ar:"Ø§Ù„Ø¹Ù…ÙŠÙ„",en:"Client",es:"Cliente",pt:"Cliente",tr:"MÃ¼ÅŸteri"})}</th>
                                        <th className="p-3 md:p-4 text-center">{tx(lang,{fr:"QtÃ©",ar:"Ø§Ù„ÙƒÙ…ÙŠØ©",en:"Qty",es:"Cdad",pt:"Qtd",tr:"Mik"})}</th>
                                        {activeTab === 'complet' && (
                                            <>
                                                <th className="p-3 md:p-4 text-center">{tx(lang,{fr:"ReÃ§u",ar:"Ø§Ù„ÙˆØ§Ø±Ø¯",en:"Received",es:"Recibido",pt:"Recebido",tr:"AlÄ±nan"})}</th>
                                                <th className="p-3 md:p-4 text-center hidden lg:table-cell">{tx(lang,{fr:"Stock",ar:"Ø§Ù„Ù…Ø®Ø²ÙˆÙ†",en:"Stock",es:"Stock",pt:"Stock",tr:"Stok"})}</th>
                                                <th className="p-3 md:p-4 text-center hidden lg:table-cell">{tx(lang,{fr:"Prix U.",ar:"Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø©",en:"Unit Price",es:"Precio U.",pt:"PreÃ§o U.",tr:"Birim Fiyat"})}</th>
                                                <th className="p-3 md:p-4 text-center hidden lg:table-cell">{tx(lang,{fr:"Valeur",ar:"Ø§Ù„Ù‚ÙŠÙ…Ø©",en:"Value",es:"Valor",pt:"Valor",tr:"DeÄŸer"})}</th>
                                            </>
                                        )}
                                        <th className="p-3 md:p-4 text-center">{tx(lang,{fr:"Statut",ar:"Ø§Ù„Ø­Ø§Ù„Ø©",en:"Status",es:"Estado",pt:"Estado",tr:"Durum"})}</th>
                                        <th className="p-3 md:p-4 text-right">{tx(lang,{fr:"Actions",ar:"Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª",en:"Actions",es:"Acciones",pt:"AÃ§Ãµes",tr:"Ä°ÅŸlemler"})}</th>
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
                                                <tr className={`border-b border-slate-100 dark:border-dk-border hover:bg-slate-50/50 transition-colors ${isExpanded ? 'bg-slate-50 dark:bg-dk-bg/20' : ''}`}>
                                                    <td className="p-3 md:p-4 text-center sticky left-0 bg-white dark:bg-dk-surface z-10">
                                                        <button 
                                                            onClick={() => setExpandedModelId(isExpanded ? null : model.id)}
                                                            className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500 dark:text-dk-muted"
                                                        >
                                                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                        </button>
                                                    </td>

                                                    <td className="p-3 md:p-4 text-center hidden md:table-cell">
                                                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-slate-100 dark:bg-dk-elevated overflow-hidden shrink-0 mx-auto border border-slate-200 dark:border-dk-border flex items-center justify-center">
                                                            {model.image ? (
                                                                <img src={model.image} className="w-full h-full object-cover" alt="" />
                                                            ) : (
                                                                <Package className="w-4 h-4 md:w-5 md:h-5 text-slate-350" />
                                                            )}
                                                        </div>
                                                    </td>

                                                    <td className="p-3 md:p-4">
                                                        <div className="font-black text-slate-800 dark:text-dk-text text-sm truncate max-w-[100px] md:max-w-none">
                                                            {model?.meta_data?.nom_modele || tx(lang,{fr:"Sans Nom",ar:"Ø¨Ø¯ÙˆÙ† Ø§Ø³Ù…",en:"Unnamed",es:"Sin Nombre",pt:"Sem Nome",tr:"Ä°simsiz"})}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 dark:text-dk-muted font-bold truncate">
                                                            {tx(lang,{fr:"RÃ©f:",ar:"Ø§Ù„Ù…Ø±Ø¬Ø¹:",en:"Ref:",es:"Ref:",pt:"Ref:",tr:"Ref:"})} {model?.meta_data?.reference || 'N/A'}
                                                        </div>
                                                    </td>

                                                    <td className="p-3 md:p-4 font-bold text-xs text-slate-600 dark:text-dk-text-soft hidden md:table-cell truncate max-w-[80px] md:max-w-none">
                                                        {model.ficheData?.client || tx(lang,{fr:"Client Divers",ar:"Ø¹Ù…ÙŠÙ„ Ù…ØªÙ†ÙˆØ¹",en:"Various Client",es:"Cliente Varios",pt:"Cliente Diversos",tr:"Ã‡eÅŸitli MÃ¼ÅŸteri"})}
                                                    </td>

                                                    <td className="p-3 md:p-4 font-black text-slate-700 dark:text-dk-text-soft text-xs">
                                                        {agg.totalExpected.toLocaleString()}
                                                    </td>

                                                    {activeTab === 'complet' && (
                                                        <>
                                                            <td className="p-3 md:p-4 font-bold text-xs text-slate-600 dark:text-dk-text-soft text-center">
                                                                {agg.totalDepotIn.toLocaleString()}
                                                            </td>
                                                            <td className="p-3 md:p-4 font-black text-xs md:text-sm text-indigo-750 text-center hidden lg:table-cell">
                                                                {agg.currentStock.toLocaleString()}
                                                            </td>
                                                            <td className="p-3 md:p-4 font-bold text-xs text-slate-600 dark:text-dk-text-soft text-center hidden lg:table-cell">
                                                                {agg.unitPrice.toFixed(2)}
                                                            </td>
                                                            <td className="p-3 md:p-4 font-black text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30/30 text-center hidden lg:table-cell">
                                                                {agg.stockValue.toLocaleString()}
                                                            </td>
                                                        </>
                                                    )}

                                                    <td className="p-3 md:p-4 text-center">
                                                        {agg.isShipped ? (
                                                            <span className="inline-flex items-center gap-1 px-1.5 md:px-2.5 py-0.5 rounded-full text-[9px] md:text-[10px] font-black bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border">
                                                                <Truck className="w-3 h-3" />
                                                                <span className="hidden sm:inline">{tx(lang,{fr:"ExpÃ©diÃ©",ar:"ØªÙ… Ø§Ù„Ø´Ø­Ù†",en:"Shipped",es:"Enviado",pt:"Expedido",tr:"Sevk Edildi"})}</span>
                                                                <span className="sm:hidden">{tx(lang,{fr:"EnvoyÃ©",ar:"Ù…Ø±Ø³Ù„",en:"Sent",es:"Enviado",pt:"Enviado",tr:"GÃ¶nderildi"})}</span>
                                                            </span>
                                                        ) : (
                                                            <span className={`inline-flex items-center px-1.5 md:px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-black ${
                                                                agg.totalDepotIn >= agg.totalExpected && agg.totalExpected > 0
                                                                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 border border-emerald-250'
                                                                    : agg.totalDepotIn > 0 
                                                                        ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 border border-amber-250'
                                                                        : 'bg-slate-50 dark:bg-dk-bg text-slate-605 border border-slate-200 dark:border-dk-border'
                                                            }`}>
                                                                {agg.totalDepotIn >= agg.totalExpected && agg.totalExpected > 0 ? tx(lang,{fr:"Complet au DÃ©pÃ´t",ar:"Ù…ÙƒØªÙ…Ù„ ÙÙŠ Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹",en:"Complete at Deposit",es:"Completo en DepÃ³sito",pt:"Completo no DepÃ³sito",tr:"Depoda TamamlandÄ±"}) :
                                                                 agg.totalDepotIn > 0 ? tx(lang,{fr:"RÃ©ception Partielle",ar:"Ø§Ø³ØªÙ„Ø§Ù… Ø¬Ø²Ø¦ÙŠ",en:"Partial Reception",es:"RecepciÃ³n Parcial",pt:"ReceÃ§Ã£o Parcial",tr:"KÄ±smi TesellÃ¼m"}) : tx(lang,{fr:"En attente",ar:"Ù‚ÙŠØ¯ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±",en:"Pending",es:"Pendiente",pt:"Pendente",tr:"Beklemede"})}
                                                            </span>
                                                        )}
                                                    </td>

                                                    <td className="p-3 md:p-4 text-right">
                                                        {agg.isShipped && (
                                                            <button
                                                                onClick={() => handleResetShipModel(model.id)}
                                                                className="bg-slate-100 dark:bg-dk-elevated hover:bg-slate-200 text-slate-700 dark:text-dk-text-soft font-bold text-[9px] md:text-[10px] px-2 md:px-2.5 py-1.5 rounded-lg transition-colors border border-slate-200 dark:border-dk-border inline-flex items-center gap-1"
                                                            >
                                                                {tx(lang,{fr:"Reset",ar:"Ø¥Ø¹Ø§Ø¯Ø©",en:"Reset",es:"Reiniciar",pt:"Repor",tr:"SÄ±fÄ±rla"})}
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>

                                                {isExpanded && (
                                                    <tr className="bg-slate-50 dark:bg-dk-bg/60">
                                                        <td colSpan={11} className="p-4 md:p-6 border-b border-slate-200 dark:border-dk-border">
                                                            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden">
                                                                <div className="px-3 md:px-4 py-2.5 md:py-3 bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border flex items-center justify-between">
                                                                    <span className="text-[10px] md:text-xs font-black text-slate-700 dark:text-dk-text-soft tracking-wider flex items-center gap-1.5">
                                                                    <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                                                    {tx(lang,{fr:"DÃ©tails de ComplÃ©tion Globale par Taille",ar:"ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø¥Ù†Ø¬Ø§Ø² Ø§Ù„ÙƒÙ„ÙŠ Ø­Ø³Ø¨ Ø§Ù„Ù…Ù‚Ø§Ø³",en:"Global Completion Details by Size",es:"Detalles de FinalizaciÃ³n Global por Talla",pt:"Detalhes de ConclusÃ£o Global por Tamanho",tr:"Beden BazÄ±nda Genel Tamamlanma DetaylarÄ±"})}
                                                                </span>
                                                                {agg.isShipped && (
                                                                    <span className="text-[10px] font-bold text-slate-500 dark:text-dk-muted">
                                                                        {tx(lang,{fr:"ExpÃ©diÃ© le :",ar:"ØªÙ… Ø§Ù„Ø´Ø­Ù† ÙÙŠ:",en:"Shipped on:",es:"Enviado el:",pt:"Expedido em:",tr:"Sevk tarihi:"})} {agg.shippedAt}
                                                                    </span>
                                                                )}
                                                                </div>

                                                                <div className="overflow-x-auto">
                                                                    <table className="w-full text-left border-collapse text-xs">
                                                                        <thead>
                                                                            <tr className="bg-slate-50 dark:bg-dk-bg text-[10px] font-black uppercase text-slate-500 dark:text-dk-muted border-b border-slate-200 dark:border-dk-border">
                                                                            <th className="p-3">{tx(lang,{fr:"Taille",ar:"Ø§Ù„Ù…Ù‚Ø§Ø³",en:"Size",es:"Talla",pt:"Tamanho",tr:"Beden"})}</th>
                                                                            <th className="p-3 text-right">{tx(lang,{fr:"QtÃ© Attendue (OF)",ar:"Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…ØªÙˆÙ‚Ø¹Ø© (Ø£Ù…Ø± Ø§Ù„ØªØµÙ†ÙŠØ¹)",en:"Expected Qty (OF)",es:"Cdad Esperada (OF)",pt:"Qtd Esperada (OF)",tr:"Beklenen Mik. (OF)"})}</th>

                                                                            {activeTab === 'complet' && (
                                                                                <>
                                                                                    <th className="p-3 text-right">{tx(lang,{fr:"ReÃ§u CumulÃ©",ar:"Ø§Ù„ÙˆØ§Ø±Ø¯ Ø§Ù„ØªØ±Ø§ÙƒÙ…ÙŠ",en:"Cumulative Received",es:"Recibido Acumulado",pt:"Recebido Acumulado",tr:"KÃ¼mÃ¼latif AlÄ±nan"})}</th>
                                                                                    <th className="p-3 text-right">{tx(lang,{fr:"Reste",ar:"Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ",en:"Remaining",es:"Restante",pt:"Restante",tr:"Kalan"})}</th>
                                                                                    <th className="p-3 text-center">{tx(lang,{fr:"Taux de ComplÃ©tion",ar:"Ù…Ø¹Ø¯Ù„ Ø§Ù„Ø¥Ù†Ø¬Ø§Ø²",en:"Completion Rate",es:"Tasa de FinalizaciÃ³n",pt:"Taxa de ConclusÃ£o",tr:"Tamamlanma OranÄ±"})}</th>
                                                                                </>
                                                                            )}

                                                                            <th className="p-3 text-center">{tx(lang,{fr:"Statut",ar:"Ø§Ù„Ø­Ø§Ù„Ø©",en:"Status",es:"Estado",pt:"Estado",tr:"Durum"})}</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
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
                                                                                    ? 'ClÃ´turÃ©'
                                                                                    : totalDepotIn > 0 ? 'En cours' : 'En attente';

                                                                                return (
                                                                                    <tr key={sizeName} className="hover:bg-slate-50/40">
                                                                                        <td className="p-3 font-black text-slate-800 dark:text-dk-text text-sm">{sizeName}</td>
                                                                                        <td className="p-3 text-right font-medium text-slate-600 dark:text-dk-text-soft">{expected.toLocaleString()} pcs</td>
                                                                                        
                                                                                        {activeTab === 'complet' && (
                                                                                            <>
                                                                                                <td className="p-3 text-right font-bold text-indigo-650 dark:text-dk-accent-text">{totalDepotIn.toLocaleString()} pcs</td>
                                                                                                <td className="p-3 text-right font-medium text-slate-500 dark:text-dk-muted">{reste.toLocaleString()} pcs</td>
                                                                                                <td className="p-3">
                                                                                                    <div className="flex items-center justify-center gap-2">
                                                                                                        <div className="w-16 bg-slate-100 dark:bg-dk-elevated h-1.5 rounded-full overflow-hidden">
                                                                                                            <div
                                                                                                                className={`h-full ${completionRate >= 100 ? 'bg-emerald-500' : completionRate >= 80 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                                                                                style={{ width: `${completionRate}%` }}
                                                                                                            />
                                                                                                        </div>
                                                                                                        <span className="font-bold text-slate-500 dark:text-dk-muted">{Math.round(completionRate)}%</span>
                                                                                                    </div>
                                                                                                </td>
                                                                                            </>
                                                                                        )}

                                                                                        <td className="p-3 text-center">
                                                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black ${
                                                                                                status === 'ClÃ´turÃ©' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 border border-emerald-200' :
                                                                                                status === 'En cours' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 border border-amber-200' :
                                                                                                'bg-slate-50 dark:bg-dk-bg text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border'
                                                                                            }`}>
                                                                                                {status === 'ClÃ´turÃ©' ? 'âœ… ' + tx(lang,{fr:"ClÃ´turÃ©",ar:"Ù…ØºÙ„Ù‚",en:"Closed",es:"Cerrado",pt:"Fechado",tr:"KapatÄ±ldÄ±"}) :
                                                                                                 status === 'En cours' ? 'ðŸ”„ ' + tx(lang,{fr:"En cours",ar:"Ù‚ÙŠØ¯ Ø§Ù„ØªÙ†ÙÙŠØ°",en:"In Progress",es:"En curso",pt:"Em curso",tr:"Devam Ediyor"}) :
                                                                                                 'â³ ' + tx(lang,{fr:"En attente",ar:"Ù‚ÙŠØ¯ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±",en:"Pending",es:"Pendiente",pt:"Pendente",tr:"Beklemede"})}
                                                                                            </span>
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                            
                                                                            {/* Summary total row */}
                                                                            <tr className="bg-slate-55/40 font-black border-t border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text">
                                                                                <td className="p-3 uppercase font-black">{tx(lang,{fr:"Total",ar:"Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹",en:"Total",es:"Total",pt:"Total",tr:"Toplam"})}</td>
                                                                                <td className="p-3 text-right">{sizes.reduce((sum, _, idx) => sum + getExpectedQtyForSize(model, idx), 0).toLocaleString()} pcs</td>

                                                                                {activeTab === 'complet' && (
                                                                                    <>
                                                                                        <td className="p-3 text-right text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text">{agg.totalDepotIn.toLocaleString()} pcs</td>
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
                                                                                        agg.totalDepotIn > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 dark:bg-dk-elevated text-slate-700 dark:text-dk-text-soft'
                                                                                    }`}>
                                                                                        {agg.totalDepotIn >= agg.totalExpected && agg.totalExpected > 0 ? tx(lang,{fr:"ClÃ´turÃ©",ar:"Ù…ØºÙ„Ù‚",en:"Closed",es:"Cerrado",pt:"Fechado",tr:"KapatÄ±ldÄ±"}) : tx(lang,{fr:"En cours",ar:"Ù‚ÙŠØ¯ Ø§Ù„ØªÙ†ÙÙŠØ°",en:"In Progress",es:"En curso",pt:"Em curso",tr:"Devam Ediyor"})}
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
