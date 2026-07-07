import { useCallback } from 'react';
import type { ModelData, FicheData, Operation, Poste, PlanningEvent, ChronoData, CustomStation } from '../types';
import { saveManualLinksByModel, loadManualLinksByModel, deleteManualLinksByModel, normalizeLoadedLayout } from './machineUtils';
const launchDateTimeIso = (date: string, launchTime?: string) => {
    const t = launchTime && /^\d{2}:\d{2}$/.test(launchTime) ? launchTime : '08:00';
    return `${date}T${t}:00`;
};
const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';
import { AUTO_SAVE_KEY } from './constants';
import { lsRemove } from '../lib/storageKeys';
import { addTombstone } from '../src/lib/apiShim';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

interface UseAppModelManagerProps {
    user: any;
    models: ModelData[];
    setModels: React.Dispatch<React.SetStateAction<ModelData[]>>;
    currentModelId: string | null;
    setCurrentModelId: (id: string | null) => void;
    
    postes: Poste[];
    setPostes: (postes: Poste[]) => void;
    assignments: Record<string, string[]>;
    setAssignments: (assignments: Record<string, string[]>) => void;
    layoutMemory: Record<string, any>;
    setLayoutMemory: (mem: Record<string, any>) => void;
    activeLayout: string;
    setActiveLayout: (layout: any) => void;
    
    ficheData: FicheData;
    setFicheData: React.Dispatch<React.SetStateAction<FicheData>>;
    ficheImages: any;
    setFicheImages: (images: any) => void;
    articleName: string;
    setArticleName: (name: string) => void;
    operations: Operation[];
    setOperations: (ops: Operation[]) => void;
    numWorkers: number;
    setNumWorkers: (num: number) => void;
    efficiency: number;
    setEfficiency: (eff: number) => void;
    
    manualLinks: any[];
    setManualLinks: (links: any[]) => void;
    
    globalStats: any;
    setPlanningEvents: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    
    setCurrentView: (view: any) => void;
    setNavigationContext: (ctx: any) => void;
    showToast: (msg: string, type?: 'success' | 'error') => void;
    
    setHistory: (history: any[]) => void;
    setHistoryIndex: (index: number) => void;
    chronoData: Record<string, ChronoData>;
    setChronoData: (data: any) => void;
    chronoCustomStations: CustomStation[];
    setChronoCustomStations: (stations: CustomStation[]) => void;
    chronoLayoutSide: 'left' | 'right' | 'both';
    setChronoLayoutSide: (side: 'left' | 'right' | 'both') => void;
}

export function useAppModelManager({
    user, models, setModels, currentModelId, setCurrentModelId,
    postes, setPostes, assignments, setAssignments, layoutMemory, setLayoutMemory, activeLayout, setActiveLayout,
    ficheData, setFicheData, ficheImages, setFicheImages, articleName, setArticleName, operations, setOperations, numWorkers, setNumWorkers,
    efficiency, setEfficiency,
    manualLinks, setManualLinks, globalStats, setPlanningEvents, setCurrentView, setNavigationContext, showToast,
    setHistory, setHistoryIndex, chronoData, setChronoData,
    chronoCustomStations, setChronoCustomStations, chronoLayoutSide, setChronoLayoutSide
}: UseAppModelManagerProps) {

    const { lang } = useLang();

    const saveCurrentModel = useCallback((navigateNext: boolean = true, silent: boolean = false) => {
        // 1. PREPARE DATA
        const currentLayoutSnapshot = postes.map(p => ({
            id: p.id, x: p.x, y: p.y, isPlaced: p.isPlaced, rotation: p.rotation
        }));
        const updatedLayoutMemory = { ...layoutMemory, [activeLayout]: currentLayoutSnapshot };
        setLayoutMemory(updatedLayoutMemory);

        const persistedActiveLayout: any = activeLayout === 'double-zigzag' ? 'zigzag' : activeLayout;

        const modelToSave: ModelData = {
            id: currentModelId || Date.now().toString(),
            filename: `${articleName || 'Sans_Nom'}.json`,
            image: ficheImages.front, // Thumbnail
            images: ficheImages,      // FULL IMAGES
            updatedAt: new Date().toISOString(),
            ficheData: {
                ...ficheData,
                targetEfficiency: efficiency // Sync current efficiency state here
            },
            meta_data: {
                nom_modele: articleName || 'Sans Nom',
                category: ficheData.category,
                date_creation: currentModelId
                    ? (models.find(m => m.id === currentModelId)?.meta_data?.date_creation || new Date().toISOString())
                    : new Date().toISOString(),
                date_lancement: ficheData.date,
                heure_lancement: ficheData.launchTime ?? '08:00',
                total_temps: globalStats.tempsArticle,
                effectif: numWorkers,
                sizes: ficheData.sizes,
                colors: ficheData.colors,
                quantity: ficheData.quantity,
                todm: ficheData.todm,
                kisba: ficheData.kisba,
                hala: ficheData.hala
            },
            gamme_operatoire: operations,
            implantation: {
                postes: postes,
                assignments: assignments,
                layoutMemory: updatedLayoutMemory,
                activeLayout: persistedActiveLayout
            },
            chronoData: chronoData,
            chronoCustomStations: chronoCustomStations,
            chronoLayoutSide: chronoLayoutSide
        };

        saveManualLinksByModel(modelToSave.id, manualLinks);

        setPlanningEvents(prev => prev.map(ev =>
            ev.modelId === modelToSave.id
                ? { 
                    ...ev, 
                    dateLancement: ev.dateLancement || launchDateTimeIso(ficheData.date, ficheData.launchTime), 
                    startDate: ev.startDate || ficheData.date,
                    typeMarche: ev.typeMarche ?? ficheData.typeMarche ?? 'Local',
                    facteurPlanning: ev.facteurPlanning ?? ficheData.facteurPlanning ?? 60,
                    bufferLancement: ev.bufferLancement ?? ficheData.bufferLancement ?? 120,
                  }
                : ev
        ));

        // 3. UPDATE OR ADD
        if (user && !IS_STATIC) {
            fetch('/api/models', {
                credentials: 'include',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modelToSave)
            })
                .then(res => {
                    if (!res.ok) throw new Error('Failed to save to server');
                    return res.json();
                })
                .then(() => {
                    setModels(prev => currentModelId ? prev.map(m => m.id === currentModelId ? modelToSave : m) : [modelToSave, ...prev]);
                    setCurrentModelId(modelToSave.id);
                    if (!silent) showToast(tx(lang, {fr:"Modèle sauvegardé avec succès (Cloud) !",ar:"تم حفظ النموذج بنجاح (سحابة)!",en:"Model saved successfully (Cloud)!",es:"Modelo guardado con éxito (Nube)!",pt:"Modelo salvo com sucesso (Nuvem)!",tr:"Model başarıyla kaydedildi (Bulut)!"}));
                    if (navigateNext) setCurrentView('library');
                })
                .catch(err => {
                    console.error(err);
                    showToast(tx(lang, {fr:"Erreur lors de la sauvegarde sur le serveur.",ar:"خطأ أثناء الحفظ على الخادم.",en:"Error saving to server.",es:"Error al guardar en el servidor.",pt:"Erro ao salvar no servidor.",tr:"Sunucuya kaydedilirken hata oluştu."}), "error");
                });
        } else {
            setModels(prev => currentModelId ? prev.map(m => m.id === currentModelId ? modelToSave : m) : [modelToSave, ...prev]);
            setCurrentModelId(modelToSave.id);
            if (!silent) showToast(tx(lang, {fr:"Modèle sauvegardé avec succès (Local) !",ar:"تم حفظ النموذج بنجاح (محلي)!",en:"Model saved successfully (Local)!",es:"Modelo guardado con éxito (Local)!",pt:"Modelo salvo com sucesso (Local)!",tr:"Model başarıyla kaydedildi (Yerel)!"}));
            if (navigateNext) setCurrentView('library');
        }
    }, [activeLayout, articleName, assignments, currentModelId, ficheData, ficheImages, globalStats.tempsArticle, layoutMemory, manualLinks, models, numWorkers, operations, postes, setCurrentModelId, setCurrentView, setLayoutMemory, setModels, setPlanningEvents, showToast, user, efficiency, chronoData, chronoCustomStations, chronoLayoutSide]);

    const loadModel = useCallback((model: ModelData, fromContext?: 'coupe' | 'planning' | null) => {
        setCurrentModelId(model.id);
        setNavigationContext(fromContext !== undefined ? fromContext : null);
        setArticleName(model.meta_data.nom_modele);
        setOperations(model.gamme_operatoire || []);
        setNumWorkers(model.meta_data.effectif || 1);

        const modelEff = model.ficheData?.targetEfficiency ?? 85;
        setEfficiency(modelEff);

        if (model.ficheData) {
            setFicheData({ 
                ...model.ficheData, 
                launchTime: model.ficheData.launchTime ?? model.meta_data.heure_lancement ?? '08:00',
                facteurPlanning: model.ficheData.facteurPlanning ?? 60,
                bufferLancement: model.ficheData.bufferLancement ?? 120,
                statutProduction: model.ficheData.statutProduction ?? 'En Attente',
                typeMarche: model.ficheData.typeMarche ?? 'Local'
            });
        } else {
            setFicheData(prev => ({
                ...prev,
                date: model.meta_data.date_lancement || new Date().toISOString().split('T')[0],
                launchTime: model.meta_data.heure_lancement ?? '08:00',
                category: model.meta_data.category || '',
                sizes: model.meta_data.sizes || [],
                colors: model.meta_data.colors || [],
                quantity: model.meta_data.quantity || 0,
                facteurPlanning: 60,
                bufferLancement: 120,
                statutProduction: 'En Attente',
                typeMarche: 'Local',
                targetEfficiency: modelEff
            }));
        }

        if (model.images) {
            setFicheImages(model.images);
        } else if (model.image) {
            setFicheImages({ front: model.image, back: null });
        } else {
            setFicheImages({ front: null, back: null });
        }

        if (model.implantation) {
            setPostes(model.implantation.postes || []);
            setAssignments(model.implantation.assignments || {});
            setLayoutMemory(model.implantation.layoutMemory || {});
            setActiveLayout(normalizeLoadedLayout(model.implantation.activeLayout));
            setManualLinks(loadManualLinksByModel(model.id));
        } else {
            setAssignments({});
            setPostes([]);
            setLayoutMemory({});
            setActiveLayout('double-zigzag');
            setManualLinks([]);
        }

        setChronoData(model.chronoData || {});
        setChronoCustomStations(model.chronoCustomStations || []);
        setChronoLayoutSide(model.chronoLayoutSide || 'both');

        setHistory([{ operations: model.gamme_operatoire || [], assignments: model.implantation?.assignments || {}, postes: model.implantation?.postes || [] }]);
        setHistoryIndex(0);
        setCurrentView('ingenierie');
    }, [setActiveLayout, setArticleName, setAssignments, setCurrentModelId, setCurrentView, setFicheData, setFicheImages, setHistory, setHistoryIndex, setLayoutMemory, setManualLinks, setNavigationContext, setNumWorkers, setOperations, setPostes, setEfficiency, setChronoData, setChronoCustomStations, setChronoLayoutSide]);

    const importModel = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target?.result as string);
                if (json && json.meta_data) setModels(prev => [json, ...prev]);
            } catch (err) {
                console.error("Import failed", err);
            }
        };
        reader.readAsText(file);
    }, [setModels]);

    const deleteModel = useCallback((id: string) => {
        const removeLocal = () => {
            setModels(prev => prev.filter(m => m.id !== id));
            deleteManualLinksByModel(id);
            if (currentModelId === id) setCurrentModelId(null);
            // Suppression EXPLICITE de l'utilisateur → shahid (tombstone) pour que
            // la synchro la propage aux autres appareils, sans que le modèle ne
            // « ressuscite » via la fusion union. (La synchro elle-même ne supprime
            // jamais ; seul ce tombstone, issu d'une action utilisateur, le fait.)
            try { addTombstone('models', id); } catch { /* non bloquant */ }
        };
        if (user && !IS_STATIC) {
            fetch(`/api/models/${id}`, { credentials: 'include', method: 'DELETE' })
                .then(res => { if (res.ok) removeLocal(); })
                .catch(err => console.error(err));
        } else {
            removeLocal();
        }
    }, [currentModelId, setCurrentModelId, setModels, user]);

    const duplicateModel = useCallback((model: ModelData) => {
        const copy = { ...model, id: Date.now().toString(), meta_data: { ...model.meta_data, nom_modele: model.meta_data.nom_modele + ' (Copie)' } };
        saveManualLinksByModel(copy.id, loadManualLinksByModel(model.id));
        setModels(prev => [copy, ...prev]);
    }, [setModels]);

    const renameModel = useCallback((id: string, newName: string) => {
        setModels(prev => prev.map(m => m.id === id ? { ...m, meta_data: { ...m.meta_data, nom_modele: newName } } : m));
    }, [setModels]);

    const handleTransferToCoupe = useCallback((model: ModelData) => {
        if (!window.confirm(`Transférer "${model.meta_data.nom_modele}" vers La Coupe ?`)) return;
        setModels(prev => prev.map(m => m.id === model.id ? { ...m, workflowStatus: 'COUPE' } : m));
        setCurrentView('coupe');
    }, [setCurrentView, setModels]);

    const handleTransferToPlanning = useCallback((model: ModelData) => {
        if (!window.confirm(`Planifier "${model.meta_data.nom_modele}" (Envoyer vers Planning) ?`)) return;
        setModels(prev => prev.map(m => m.id === model.id ? { ...m, workflowStatus: 'PLANNING' } : m));
        setCurrentView('planning');
    }, [setCurrentView, setModels]);

    const createNewProject = useCallback(() => {
        lsRemove(AUTO_SAVE_KEY);
        if (!IS_STATIC) {
            fetch('/api/settings', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autosave_workspace: null }) }).catch(() => {});
        }
        setCurrentModelId(null);
        setArticleName('');
        setOperations([]);
        setFicheImages({ front: null, back: null });
        setAssignments({});
        setPostes([]);
        setLayoutMemory({});
        setActiveLayout('double-zigzag');
        setManualLinks([]);
        setChronoData({});
        setFicheData({
            date: new Date().toISOString().split('T')[0],
            launchTime: '08:00',
            client: '',
            category: '',
            designation: '',
            color: '',
            quantity: 0,
            chaine: '',
            targetEfficiency: 85,
            unitCost: 0,
            clientPrice: 0,
            observations: '',
            costMinute: 0.85,
            sizes: [],
            colors: [],
            gridQuantities: {},
            materials: [],
            todm: '',
            kisba: 'NON_LANCE',
            hala: 'EN_ATTENTE',
            facteurPlanning: 1,
            bufferLancement: 0,
            statutProduction: 'En Attente',
            typeMarche: 'Local',
        });
        setHistory([{ operations: [], assignments: {}, postes: [] }]);
        setHistoryIndex(0);
        setCurrentView('ingenierie');
    }, [setActiveLayout, setArticleName, setAssignments, setChronoData, setCurrentModelId, setCurrentView, setFicheData, setFicheImages, setHistory, setHistoryIndex, setLayoutMemory, setManualLinks, setOperations, setPostes]);

    return {
        saveCurrentModel,
        loadModel,
        importModel,
        deleteModel,
        duplicateModel,
        renameModel,
        handleTransferToCoupe,
        handleTransferToPlanning,
        createNewProject
    };
}
