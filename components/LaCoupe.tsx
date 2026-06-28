import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ModelData, OrdreCoupe, Faisceau } from '../types';
import {
    Scissors, FileText, CheckCircle2, Clock, Search, Layers, ChevronRight,
    AlertCircle, Printer, PackageSearch, Plus, Trash2, Barcode,
    Send, CheckCircle, XCircle, Truck, PlayCircle, Save,
    Palette, X, Menu, ChevronLeft, LayoutGrid, List, Calendar, BarChart3,
    Download, Filter, Copy, Edit3, MoreVertical, ArrowRight, TrendingUp,
    ArrowUpDown, RefreshCw, Zap, Target, Star, Hash
} from 'lucide-react';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';
import ExcelInput from './ExcelInput';
import { TEXTILE_COLORS } from '../data/textileData';
import { PurchasingData } from '../types';

type ViewMode = 'list' | 'board' | 'calendar' | 'stats';

const BADGE_COLORS = [
    { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
    { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
    { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
    { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
    { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-500' },
];

interface LaCoupeProps {
    models: ModelData[];
    setModels: React.Dispatch<React.SetStateAction<ModelData[]>>;
    onOpenInAtelier?: (model: ModelData) => void;
    currentModelId?: string | null;
    setFicheData?: React.Dispatch<React.SetStateAction<any>>;
}

const MOBILE_BREAKPOINT = 768;

function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.innerWidth < MOBILE_BREAKPOINT;
    });
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
        const onChange = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
        onChange(mq);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return isMobile;
}

export default function LaCoupe({ models, setModels, onOpenInAtelier, currentModelId, setFicheData }: LaCoupeProps) {
    const isMobile = useIsMobile();
    const { lang } = useLang();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedModel, setSelectedModel] = useState<ModelData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [showFilters, setShowFilters] = useState(false);
    const [quickActionMenu, setQuickActionMenu] = useState<{ modelId: string; x: number; y: number } | null>(null);
    const [draggedModel, setDraggedModel] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'date' | 'name' | 'status' | 'qty'>('date');
    const [sortAsc, setSortAsc] = useState(false);

    const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 3500);
    }, []);

    const saveModelToServer = useCallback(async (model: ModelData, successMessage?: string) => {
        try {
            const res = await fetch('/api/models', {
                credentials: 'include',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(model)
            });
            if (!res.ok) throw new Error(tx(lang, { fr: 'Erreur de sauvegarde serveur', ar: 'خطأ في حفظ الخادم', en: 'Server save error', es: 'Error de guardado del servidor', pt: 'Erro ao salvar no servidor', tr: 'Sunucu kaydetme hatası' }));
            if (successMessage) showToast(successMessage, 'success');
            return true;
        } catch (e) {
            console.error("Failed to save model to server:", e);
            showToast(tx(lang, { fr: 'Erreur de sauvegarde Cloud', ar: 'خطأ في الحفظ السحابي', en: 'Cloud save error', es: 'Error de guardado en la nube', pt: 'Erro ao salvar na nuvem', tr: 'Bulut kaydetme hatası' }), "error");
            return false;
        }
    }, [showToast]);

    const deleteModelFromServer = useCallback(async (modelId: string, successMessage?: string) => {
        try {
            const res = await fetch(`/api/models/${modelId}`, {
                credentials: 'include',
                method: 'DELETE'
            });
            if (!res.ok) throw new Error(tx(lang, { fr: 'Erreur de suppression serveur', ar: 'خطأ في حذف الخادم', en: 'Server delete error', es: 'Error de eliminación del servidor', pt: 'Erro ao excluir no servidor', tr: 'Sunucu silme hatası' }));
            if (successMessage) showToast(successMessage, 'success');
            return true;
        } catch (e) {
            console.error("Failed to delete model on server:", e);
            showToast(tx(lang, { fr: 'Erreur de suppression Cloud', ar: 'خطأ في الحذف السحابي', en: 'Cloud delete error', es: 'Error de eliminación en la nube', pt: 'Erro ao excluir na nuvem', tr: 'Bulut silme hatası' }), "error");
            return false;
        }
    }, [showToast]);


    useEffect(() => {
        if (isMobile) setSidebarOpen(false);
    }, [isMobile]);

    const [newSizeInput, setNewSizeInput] = useState('');
    const [newColorInput, setNewColorInput] = useState('');
    const [pickedHexColor, setPickedHexColor] = useState('#10b981');
    const [matrixCtx, setMatrixCtx] = useState<{ x: number; y: number; type: 'size' | 'color'; index: number; id?: string; name?: string } | null>(null);
    const [editingMatrixItem, setEditingMatrixItem] = useState<{ type: 'size' | 'color'; index: number; value: string } | null>(null);

    useEffect(() => {
        const close = () => setMatrixCtx(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    const [ordre, setOrdre] = useState<OrdreCoupe>({
        refModele: '',
        longueurMatelas: 0,
        consommation: 0,
        nbrFeuilles: 0,
        nbrMatelas: 0,
        qteTotale: 0,
        status: 'EN_PREPARATION',
        faisceaux: [],
        matelasLines: [],
        tissuRecu: 0
    });

    const coupeModels = (models || []).filter(m =>
        m && m.meta_data && (m.workflowStatus === 'COUPE' || m.isPublishedToLibrary === false || !m.workflowStatus)
    );

    const filteredModels = coupeModels.filter(m => {
        if (!m) return false;
        const matchesSearch = (m.meta_data?.nom_modele || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
            (m.ordreCoupe?.refModele || '').toLowerCase().includes((searchTerm || '').toLowerCase());
        const st = m.ordreCoupe?.status || 'EN_PREPARATION';
        const matchesStatus = filterStatus === 'ALL' || st === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const sortedModels = useMemo(() => {
        const sorted = [...filteredModels];
        sorted.sort((a, b) => {
            let va = 0, vb = 0;
            switch (sortBy) {
                case 'name':
                    return sortAsc
                        ? (a.meta_data?.nom_modele || '').localeCompare(b.meta_data?.nom_modele || '')
                        : (b.meta_data?.nom_modele || '').localeCompare(a.meta_data?.nom_modele || '');
                case 'status':
                    const order = { 'EN_PREPARATION': 0, 'EN_COURS': 1, 'SOUS_TRAITANCE': 2, 'VALIDE': 3, 'REJETE': 4 };
                    va = order[a.ordreCoupe?.status || 'EN_PREPARATION'] ?? 0;
                    vb = order[b.ordreCoupe?.status || 'EN_PREPARATION'] ?? 0;
                    break;
                case 'qty':
                    va = a.ordreCoupe?.qteTotale || a.meta_data?.quantity || 0;
                    vb = b.ordreCoupe?.qteTotale || b.meta_data?.quantity || 0;
                    break;
                default:
                    va = new Date(a.meta_data?.date_creation || 0).getTime();
                    vb = new Date(b.meta_data?.date_creation || 0).getTime();
            }
            return sortAsc ? va - vb : vb - va;
        });
        return sorted;
    }, [filteredModels, sortBy, sortAsc]);

    const cycleSortBy = () => {
        const order: typeof sortBy[] = ['date', 'name', 'status', 'qty'];
        const idx = order.indexOf(sortBy);
        if (idx === order.length - 1) {
            setSortBy(order[0]);
            setSortAsc(!sortAsc);
        } else {
            setSortBy(order[idx + 1]);
        }
    };

    const getProgress = (model: ModelData): number => {
        const st = model.ordreCoupe?.status || 'EN_PREPARATION';
        if (st === 'EN_PREPARATION') return 25;
        if (st === 'EN_COURS') return 60;
        if (st === 'SOUS_TRAITANCE') return 75;
        if (st === 'VALIDE') return 100;
        if (st === 'REJETE') return 0;
        return 0;
    };

    const handleExportExcel = () => {
        const headers = [
            tx(lang, { fr: 'Référence', ar: 'المرجع', en: 'Reference', es: 'Referencia', pt: 'Referência', tr: 'Referans' }),
            tx(lang, { fr: 'Nom Modèle', ar: 'اسم النموذج', en: 'Model Name', es: 'Nombre del Modelo', pt: 'Nome do Modelo', tr: 'Model Adı' }),
            tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum' }),
            tx(lang, { fr: 'Quantité', ar: 'الكمية', en: 'Quantity', es: 'Cantidad', pt: 'Quantidade', tr: 'Miktar' }),
            tx(lang, { fr: 'Longueur', ar: 'الطول', en: 'Length', es: 'Longitud', pt: 'Comprimento', tr: 'Uzunluk' }),
            tx(lang, { fr: 'Consommation', ar: 'الاستهلاك', en: 'Consumption', es: 'Consumo', pt: 'Consumo', tr: 'Tüketim' }),
            tx(lang, { fr: 'Feuilles', ar: 'الصفائح', en: 'Sheets', es: 'Capas', pt: 'Folhas', tr: 'Tabakalar' }),
            tx(lang, { fr: 'Matelas', ar: 'المفرشات', en: 'Layers', es: 'Capas', pt: 'Esteiras', tr: 'Katmanlar' }),
        ];
        const rows = filteredModels.map(m => [
            m.ordreCoupe?.refModele || '-',
            m.meta_data?.nom_modele || '-',
            m.ordreCoupe?.status || 'EN_PREPARATION',
            m.ordreCoupe?.qteTotale || 0,
            m.ordreCoupe?.longueurMatelas || 0,
            m.ordreCoupe?.consommation || 0,
            m.ordreCoupe?.nbrFeuilles || 0,
            m.ordreCoupe?.nbrMatelas || 0,
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ordres_coupe_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(tx(lang, { fr: 'Export Excel réussi', ar: 'تم تصدير Excel بنجاح', en: 'Excel export successful', es: 'Exportación Excel exitosa', pt: 'Exportação Excel bem-sucedida', tr: 'Excel dışa aktarma başarılı' }), 'success');
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDuplicate = async (model: ModelData) => {
        const newId = `DRAFT_${Date.now()}`;
        const duplicate: ModelData = {
            ...model,
            id: newId,
            filename: `${model.filename || 'model'}_copie.json`,
            isPublishedToLibrary: false,
            workflowStatus: 'COUPE',
            meta_data: {
                ...(model.meta_data || { nom_modele: '', date_creation: new Date().toISOString(), total_temps: 0, effectif: 1 }),
                nom_modele: `${model.meta_data?.nom_modele || 'Modèle'} (${tx(lang, { fr: 'Copie', ar: 'نسخة', en: 'Copy', es: 'Copia', pt: 'Cópia', tr: 'Kopya' })})`,
                date_creation: new Date().toISOString(),
            },
            ordreCoupe: model.ordreCoupe ? { ...model.ordreCoupe, status: 'EN_PREPARATION' } : undefined,
        };
        const success = await saveModelToServer(duplicate);
        if (success) {
            setModels(prev => [duplicate, ...prev]);
            showToast(tx(lang, { fr: 'Ordre dupliqué', ar: 'تم تكرار الأمر', en: 'Order duplicated', es: 'Orden duplicada', pt: 'Ordem duplicada', tr: 'Emir kopyalandı' }), 'success');
        }
        setQuickActionMenu(null);
    };

    const handleDropOnColumn = async (status: string) => {
        if (!draggedModel) return;
        const modelToUpdate = models.find(m => m.id === draggedModel);
        if (!modelToUpdate) return;

        const updatedModel: ModelData = {
            ...modelToUpdate,
            ordreCoupe: {
                ...(modelToUpdate.ordreCoupe || {
                    refModele: modelToUpdate.meta_data?.nom_modele || '',
                    longueurMatelas: 0, consommation: 0, nbrFeuilles: 0, nbrMatelas: 0, qteTotale: 0,
                    faisceaux: []
                }),
                status: status as any
            }
        };

        const success = await saveModelToServer(updatedModel);
        if (success) {
            setModels(prev => prev.map(m => m.id === draggedModel ? updatedModel : m));
            showToast(`${tx(lang, { fr: 'Statut modifié', ar: 'تم تغيير الحالة', en: 'Status changed', es: 'Estado modificado', pt: 'Status alterado', tr: 'Durum değiştirildi' })}: ${STATUS_MAP[status as keyof typeof STATUS_MAP]?.label}`, 'success');
        }
        setDraggedModel(null);
        setDragOverColumn(null);
    };

    const STATUS_MAP = {
        'EN_PREPARATION': { label: tx(lang, { fr: 'En Préparation', ar: 'قيد التحضير', en: 'In Preparation', es: 'En Preparación', pt: 'Em Preparação', tr: 'Hazırlıkta' }), color: 'text-slate-700 dark:text-dk-text-soft border-slate-300', icon: Clock },
        'EN_COURS': { label: tx(lang, { fr: 'En Cours', ar: 'قيد التنفيذ', en: 'In Progress', es: 'En Curso', pt: 'Em Andamento', tr: 'Devam Ediyor' }), color: 'text-blue-700 border-blue-400', icon: PlayCircle },
        'SOUS_TRAITANCE': { label: tx(lang, { fr: 'Extériorisé', ar: 'مقاول خارجي', en: 'Subcontracted', es: 'Subcontratado', pt: 'Terceirizado', tr: 'Taşeron' }), color: 'text-purple-700 border-purple-400', icon: Truck },
        'VALIDE': { label: tx(lang, { fr: 'Validé', ar: 'تم التحقق', en: 'Validated', es: 'Validado', pt: 'Validado', tr: 'Onaylandı' }), color: 'text-emerald-700 border-emerald-400', icon: CheckCircle },
        'REJETE': { label: tx(lang, { fr: 'Rejeté', ar: 'مرفوض', en: 'Rejected', es: 'Rechazado', pt: 'Rejeitado', tr: 'Reddedildi' }), color: 'text-red-700 border-red-400', icon: XCircle },
    };

    const openModel = (model: ModelData) => {
        setSelectedModel(model);
        if (model.ordreCoupe) {
            setOrdre({
                ...model.ordreCoupe,
                qteTotale: model.ordreCoupe.qteTotale || model.meta_data?.quantity || 0,
                faisceaux: model.ordreCoupe.faisceaux || [],
                matelasLines: model.ordreCoupe.matelasLines || [],
                tissuRecu: model.ordreCoupe.tissuRecu || 0
            });
        } else {
            setOrdre({
                refModele: model.meta_data?.nom_modele || tx(lang, { fr: 'Sans Nom', ar: 'بدون اسم', en: 'Unnamed', es: 'Sin Nombre', pt: 'Sem Nome', tr: 'İsimsiz' }),
                longueurMatelas: 0,
                consommation: 0,
                nbrFeuilles: 0,
                nbrMatelas: 0,
                qteTotale: model.meta_data?.quantity || 0,
                status: 'EN_PREPARATION',
                faisceaux: [],
                matelasLines: [],
                tissuRecu: 0
            });
        }
        if (isMobile) setSidebarOpen(false);
    };

    const handleNewModel = async () => {
        const dummyId = `DRAFT_${Date.now()}`;
        const newModel: ModelData = {
            id: dummyId,
            filename: `Draft_Coupe_${dummyId}.json`,
            workflowStatus: 'COUPE',
            isPublishedToLibrary: false,
            meta_data: {
                nom_modele: `${tx(lang, { fr: 'Nouveau Modèle', ar: 'نموذج جديد', en: 'New Model', es: 'Nuevo Modelo', pt: 'Novo Modelo', tr: 'Yeni Model' })} ${Math.floor(Math.random() * 1000)}`,
                date_creation: new Date().toISOString(),
                total_temps: 0,
                effectif: 1
            },
            gamme_operatoire: [],
            ordreCoupe: {
                refModele: `REF-${Math.floor(Math.random() * 10000)}`,
                longueurMatelas: 0,
                consommation: 0,
                nbrFeuilles: 0,
                nbrMatelas: 0,
                qteTotale: 0,
                status: 'EN_PREPARATION',
                faisceaux: [],
                matelasLines: [],
                tissuRecu: 0
            }
        };
        const success = await saveModelToServer(newModel);
        if (success) {
            setModels(prev => [newModel, ...prev]);
            openModel(newModel);
            showToast(tx(lang, { fr: 'Nouveau modèle créé', ar: 'تم إنشاء نموذج جديد', en: 'New model created', es: 'Nuevo modelo creado', pt: 'Novo modelo criado', tr: 'Yeni model oluşturuldu' }), 'success');
        }
    };

    const handleSaveCoupe = async (publish: boolean = false, transferTo: string | null = null) => {
        if (!selectedModel) return;

        let finalStatus = ordre.status;
        let finalWorkflow = selectedModel.workflowStatus;
        let isPublished = selectedModel.isPublishedToLibrary;

        if (publish) isPublished = true;
        if (transferTo === 'METHODES') finalWorkflow = 'METHODES';
        else if (transferTo === 'PLANNING') finalWorkflow = 'PLANNING';
        else if (transferTo === 'SUIVI') finalWorkflow = 'SUIVI';

        if (transferTo === 'PLANNING' && requiredMaterials.length > 0) {
            try {
                const magStr = localStorage.getItem('beramethode_magasin');
                let magItems = magStr ? JSON.parse(magStr) : [];
                requiredMaterials.forEach((mat: any) => {
                    const existingIdx = magItems.findIndex((i: any) =>
                        i.nom === mat.name || i.designation === mat.name
                    );
                    if (existingIdx >= 0) {
                        magItems[existingIdx].stockActuel = Math.max(0,
                            (magItems[existingIdx].stockActuel || 0) - mat.neededForProduction
                        );
                        if (!magItems[existingIdx].mouvements) magItems[existingIdx].mouvements = [];
                        magItems[existingIdx].mouvements.push({
                            id: `MVT-${Date.now()}`,
                            date: new Date().toISOString(),
                            type: 'sortie_production',
                            quantite: -mat.neededForProduction,
                            reference: `Coupe → Planning : ${ordre.refModele}`,
                            responsable: tx(lang, { fr: 'La Coupe', ar: 'قسم القص', en: 'Cutting Dept.', es: 'Departamento de Corte', pt: 'Departamento de Corte', tr: 'Kesim Departmanı' })
                        });
                    }
                });
                localStorage.setItem('beramethode_magasin', JSON.stringify(magItems));
            } catch (e) {
                console.error("Failed to deduct Magasin stock", e);
            }
        }

        const finalQte = matelasCalculations.totalPieces > 0 ? matelasCalculations.totalPieces : ordre.qteTotale;
        const updatedOrdre = {
            ...ordre,
            status: finalStatus,
            qteTotale: finalQte
        };

        const updatedModel: ModelData = {
            ...selectedModel,
            workflowStatus: finalWorkflow,
            isPublishedToLibrary: isPublished,
            ordreCoupe: updatedOrdre,
            meta_data: {
                ...(selectedModel.meta_data || { nom_modele: '', date_creation: new Date().toISOString(), total_temps: 0, effectif: 1 }),
                nom_modele: ordre.refModele || selectedModel.meta_data?.nom_modele || tx(lang, { fr: 'Sans Nom', ar: 'بدون اسم', en: 'Unnamed', es: 'Sin Nombre', pt: 'Sem Nome', tr: 'İsimsiz' }),
                quantity: finalQte
            }
        };

        const success = await saveModelToServer(updatedModel);
        if (success) {
            setModels(prev => prev.map(m => m.id === selectedModel.id ? updatedModel : m));
            setSelectedModel(updatedModel);
            if (transferTo) {
                setSelectedModel(null);
                showToast(`${tx(lang, { fr: 'Transféré vers', ar: 'تم النقل إلى', en: 'Transferred to', es: 'Transferido a', pt: 'Transferido para', tr: 'Aktarıldı' })} ${transferTo}`, 'success');
            } else {
                showToast(tx(lang, { fr: 'Sauvegarde effectuée', ar: 'تم الحفظ بنجاح', en: 'Save successful', es: 'Guardado exitoso', pt: 'Salvo com sucesso', tr: 'Kaydetme başarılı' }), 'success');
            }
        }
    };

    const sizes = selectedModel?.ficheData?.sizes || selectedModel?.meta_data?.sizes || [];
    const colors = selectedModel?.ficheData?.colors || selectedModel?.meta_data?.colors || [];
    const gridQuantities = selectedModel?.ficheData?.gridQuantities || {};

    const matrixStats = React.useMemo(() => {
        const rowTotals: Record<string, number> = {};
        const colTotals: Record<number, number> = {};
        let grandTotal = 0;
        colors.forEach(c => { rowTotals[c.id || (typeof c === 'string' ? c : c.name)] = 0; });
        sizes.forEach((_, i) => { colTotals[i] = 0; });
        Object.entries(gridQuantities).forEach(([key, val]) => {
            const [cId, sIdxStr] = key.split('_');
            const sIdx = parseInt(sIdxStr);
            const qty = Number(val) || 0;
            if (rowTotals[cId] !== undefined) rowTotals[cId] += qty;
            if (colTotals[sIdx] !== undefined) colTotals[sIdx] += qty;
            grandTotal += qty;
        });
        return { rowTotals, colTotals, grandTotal };
    }, [gridQuantities, sizes, colors]);

    const matelasCalculations = React.useMemo(() => {
        const lines = ordre.matelasLines || [];
        let totalPieces = 0;
        let totalFabric = 0;
        const perSize: Record<string, number> = {};
        
        sizes.forEach(s => { perSize[s] = 0; });
        
        lines.forEach(line => {
            let lineRatioSum = 0;
            sizes.forEach(s => {
                const r = Number(line.ratios?.[s]) || 0;
                lineRatioSum += r;
                perSize[s] += (line.plis || 0) * r;
            });
            totalPieces += (line.plis || 0) * lineRatioSum;
            totalFabric += (line.plis || 0) * ((line.longTracee || 0) + 0.03);
        });
        
        return { totalPieces, totalFabric, perSize };
    }, [ordre.matelasLines, sizes]);

    const handleAddMatelasLine = () => {
        const newLine = {
            id: `MAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            plis: 0,
            longTracee: 0,
            ratios: {} as Record<string, number>
        };
        sizes.forEach(s => { newLine.ratios[s] = 0; });
        setOrdre(prev => ({
            ...prev,
            matelasLines: [...(prev.matelasLines || []), newLine]
        }));
    };

    const handleUpdateMatelasLine = (id: string, field: 'plis' | 'longTracee', value: number) => {
        setOrdre(prev => ({
            ...prev,
            matelasLines: (prev.matelasLines || []).map(line => 
                line.id === id ? { ...line, [field]: value } : line
            )
        }));
    };

    const handleUpdateMatelasRatio = (lineId: string, sizeName: string, value: number) => {
        setOrdre(prev => ({
            ...prev,
            matelasLines: (prev.matelasLines || []).map(line => 
                line.id === lineId 
                    ? { ...line, ratios: { ...(line.ratios || {}), [sizeName]: value } }
                    : line
            )
        }));
    };

    const handleDeleteMatelasLine = (id: string) => {
        setOrdre(prev => ({
            ...prev,
            matelasLines: (prev.matelasLines || []).filter(line => line.id !== id)
        }));
    };

    React.useEffect(() => {
        if (selectedModel && matrixStats.grandTotal !== ordre.qteTotale) {
            setOrdre(prev => ({ ...prev, qteTotale: matrixStats.grandTotal }));
        }
    }, [matrixStats.grandTotal, selectedModel]);

    const updateQuantity = (colorId: string, sizeIndex: number, value: string) => {
        if (!selectedModel) return;
        const currentFiche = selectedModel.ficheData || {
            reference: '', article: '', category: '',
            sizes: selectedModel.meta_data?.sizes || [],
            colors: selectedModel.meta_data?.colors || [],
            quantity: selectedModel.meta_data?.quantity || 0,
            date: selectedModel.meta_data?.date_lancement || '',
            client: '', status: '', imageFront: null, imageBack: null,
            gridQuantities: {}, designation: '', color: '', chaine: '', targetEfficiency: 85,
            unitCost: 0, clientPrice: 0, observations: '', costMinute: 0.85
        };
        const key = `${colorId}_${sizeIndex}`;
        const newQuantities = { ...currentFiche.gridQuantities, [key]: parseInt(value) || 0 };
        const updatedFiche = { ...currentFiche, gridQuantities: newQuantities, quantity: matrixStats.grandTotal };
        setModels(prev => prev.map(m => m.id === selectedModel.id ? { ...m, ficheData: updatedFiche } : m));
        setSelectedModel({ ...selectedModel, ficheData: updatedFiche });
        if (currentModelId === selectedModel.id && setFicheData) setFicheData(updatedFiche);
    };

    const colorInputRef = React.useRef<HTMLInputElement>(null);

    const buildFiche = () => selectedModel?.ficheData || {
        reference: '', article: '', category: '',
        sizes: selectedModel?.meta_data?.sizes || [],
        colors: selectedModel?.meta_data?.colors || [],
        quantity: selectedModel?.meta_data?.quantity || 0,
        date: selectedModel?.meta_data?.date_lancement || '',
        client: '', status: '', imageFront: null, imageBack: null,
        gridQuantities: {}, designation: '', color: '', chaine: '', targetEfficiency: 85,
        unitCost: 0, clientPrice: 0, observations: '', costMinute: 0.85
    };

    const applyFicheUpdate = async (updatedFiche: any) => {
        if (!selectedModel) return;
        const updatedModel = { ...selectedModel, ficheData: updatedFiche };
        setModels(prev => prev.map(m => m.id === selectedModel.id ? updatedModel : m));
        setSelectedModel(updatedModel);
        if (currentModelId === selectedModel.id && setFicheData) setFicheData(updatedFiche);
        await saveModelToServer(updatedModel);
    };

    const handleAddSize = () => {
        if (!selectedModel || !newSizeInput.trim()) return;
        const fiche = buildFiche();
        const newSizesList = newSizeInput.split(/[\s,]+/).filter(s => s.trim() !== '');
        if (newSizesList.length === 0) return;
        const updatedSizes = [...fiche.sizes, ...newSizesList.map(s => s.toUpperCase())];
        applyFicheUpdate({ ...fiche, sizes: updatedSizes });
        setNewSizeInput('');
    };

    const handleAddColorText = () => {
        if (!selectedModel || !newColorInput.trim()) return;
        const fiche = buildFiche();
        const newColor = { id: Date.now().toString(), name: newColorInput.trim() };
        applyFicheUpdate({ ...fiche, colors: [...fiche.colors, newColor] });
        setNewColorInput('');
    };

    const hexToColorName = (hex: string): string => {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        const namedColors: { name: string; r: number; g: number; b: number }[] = [
            { name: 'Noir', r: 0, g: 0, b: 0 }, { name: 'Blanc', r: 255, g: 255, b: 255 },
            { name: 'Rouge', r: 255, g: 0, b: 0 }, { name: 'Bordeaux', r: 128, g: 0, b: 32 },
            { name: 'Rose', r: 255, g: 105, b: 180 }, { name: 'Orange', r: 255, g: 165, b: 0 },
            { name: 'Jaune', r: 255, g: 255, b: 0 }, { name: 'Vert', r: 0, g: 128, b: 0 },
            { name: 'Vert Émeraude', r: 16, g: 185, b: 129 }, { name: 'Bleu', r: 0, g: 0, b: 255 },
            { name: 'Bleu Royal', r: 65, g: 105, b: 225 }, { name: 'Bleu Marine', r: 0, g: 0, b: 128 },
            { name: 'Violet', r: 128, g: 0, b: 128 }, { name: 'Marron', r: 139, g: 69, b: 19 },
            { name: 'Beige', r: 245, g: 245, b: 220 }, { name: 'Gris', r: 128, g: 128, b: 128 },
            { name: 'Gris Clair', r: 192, g: 192, b: 192 }, { name: 'Gris Foncé', r: 64, g: 64, b: 64 },
            { name: 'Corail', r: 255, g: 127, b: 80 }, { name: 'Turquoise', r: 64, g: 224, b: 208 },
            { name: 'Kaki', r: 189, g: 183, b: 107 }, { name: 'Lavande', r: 230, g: 230, b: 250 },
            { name: 'Ivoire', r: 255, g: 255, b: 240 }, { name: 'Crème', r: 255, g: 253, b: 208 },
        ];
        let closest = namedColors[0];
        let minDist = Infinity;
        for (const c of namedColors) {
            const dist = Math.sqrt((r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2);
            if (dist < minDist) { minDist = dist; closest = c; }
        }
        return closest.name;
    };

    const handleAddVisualColor = (hex: string) => {
        if (!selectedModel) return;
        const fiche = buildFiche();
        // Même hex = même couleur (id = hex) : on évite d'ajouter un doublon.
        if ((fiche.colors || []).some(c => c.id === hex)) return;
        const detectedName = hexToColorName(hex);
        const newColor = { id: hex, name: detectedName };
        applyFicheUpdate({ ...fiche, colors: [...fiche.colors, newColor] });
    };

    const removeSize = (sizeIndex: number) => {
        if (!selectedModel) return;
        const fiche = buildFiche();
        const updatedSizes = fiche.sizes.filter((_: any, i: number) => i !== sizeIndex);
        const newGrid: Record<string, number> = {};
        Object.entries(fiche.gridQuantities || {}).forEach(([key, val]) => {
            const [cId, sIdxStr] = key.split('_');
            const sIdx = parseInt(sIdxStr);
            if (sIdx === sizeIndex) return;
            const newIdx = sIdx > sizeIndex ? sIdx - 1 : sIdx;
            newGrid[`${cId}_${newIdx}`] = val as number;
        });
        applyFicheUpdate({ ...fiche, sizes: updatedSizes, gridQuantities: newGrid });
    };

    const removeColor = (colorId: string) => {
        if (!selectedModel) return;
        const fiche = buildFiche();
        const updatedColors = fiche.colors.filter((c: any) => {
            const id = c.id || (typeof c === 'string' ? c : c.name);
            return id !== colorId;
        });
        const newGrid: Record<string, number> = {};
        Object.entries(fiche.gridQuantities || {}).forEach(([key, val]) => {
            if (!key.startsWith(`${colorId}_`)) newGrid[key] = val as number;
        });
        applyFicheUpdate({ ...fiche, colors: updatedColors, gridQuantities: newGrid });
    };

    const editSize = (sizeIndex: number, newValue: string) => {
        if (!selectedModel || !newValue.trim()) return;
        const fiche = buildFiche();
        const updatedSizes = [...fiche.sizes];
        updatedSizes[sizeIndex] = newValue.trim().toUpperCase();
        applyFicheUpdate({ ...fiche, sizes: updatedSizes });
        setEditingMatrixItem(null);
    };

    const editColor = (colorId: string, newName: string) => {
        if (!selectedModel || !newName.trim()) return;
        const fiche = buildFiche();
        const updatedColors = fiche.colors.map((c: any) => {
            const id = c.id || (typeof c === 'string' ? c : c.name);
            if (id === colorId) return { ...c, name: newName.trim() };
            return c;
        });
        applyFicheUpdate({ ...fiche, colors: updatedColors });
        setEditingMatrixItem(null);
    };

    const handleDeleteOrder = async (id: string) => {
        const success = await deleteModelFromServer(id);
        if (success) {
            setModels(prev => prev.filter(m => m.id !== id));
            setSelectedModel(null);
            setDeleteConfirm(null);
            showToast(tx(lang, { fr: 'Ordre supprimé', ar: 'تم حذف الأمر', en: 'Order deleted', es: 'Orden eliminada', pt: 'Ordem excluída', tr: 'Emir silindi' }), 'success');
        }
    };

    const handleGenerateBarcodes = () => {
        showToast(tx(lang, { fr: 'Impression des étiquettes code-barres...', ar: 'طباعة ملصقات الباركود...', en: 'Printing barcode labels...', es: 'Imprimiendo etiquetas de código de barras...', pt: 'Imprimindo etiquetas de código de barras...', tr: 'Barkod etiketleri yazdırılıyor...' }), 'info');
    };

    const consoTheorique = matelasCalculations.totalFabric > 0
        ? matelasCalculations.totalFabric
        : ((ordre.longueurMatelas || 0) * (ordre.nbrFeuilles || 0) * (ordre.nbrMatelas || 0));
    const consoReelle = (ordre.consommation || 0) * (matrixStats.grandTotal || ordre.qteTotale || 0);
    const waste = consoTheorique > 0 ? ((consoTheorique - consoReelle) / consoTheorique * 100).toFixed(1) : 0;

    const [magasinItems, setMagasinItems] = useState<any[]>([]);
    useEffect(() => {
        try {
            const magStr = localStorage.getItem('beramethode_magasin');
            if (magStr) setMagasinItems(JSON.parse(magStr));
        } catch (e) {
            console.error("Failed to load magasin items", e);
        }
    }, [selectedModel]);

    const requiredMaterials = React.useMemo(() => {
        if (!selectedModel || !selectedModel.ficheData || !selectedModel.ficheData.materials) return [];
        return selectedModel.ficheData.materials.map((m: PurchasingData) => {
            const targetQty = matrixStats.grandTotal > 0 ? matrixStats.grandTotal : (selectedModel.meta_data?.quantity || 1);
            const qtyPerItem = m.qty;
            const totalRaw = qtyPerItem * targetQty;
            const wasteRate = 5;
            const totalWithWaste = totalRaw * (1 + wasteRate / 100);
            const neededForProduction = (m.unit === 'bobine' || m.unit === 'pc') ? Math.ceil(totalWithWaste) : parseFloat(totalWithWaste.toFixed(2));
            const inMagasin = magasinItems.find((mag: any) => mag.nom === m.name || mag.designation === m.name);
            const stockActuel = inMagasin ? (inMagasin.stockActuel || 0) : 0;
            const isSufficient = stockActuel >= neededForProduction;
            return { ...m, neededForProduction, stockActuel, isSufficient };
        });
    }, [selectedModel, matrixStats.grandTotal, magasinItems]);

    const activeCount = coupeModels.filter(m => m.ordreCoupe?.status === 'EN_COURS').length;
    const prepCount = coupeModels.filter(m => !m.ordreCoupe?.status || m.ordreCoupe?.status === 'EN_PREPARATION').length;
    const valCount = coupeModels.filter(m => m.ordreCoupe?.status === 'VALIDE').length;

    const sidebar = (
        <div className={`flex flex-col h-full bg-white dark:bg-dk-surface ${isMobile ? 'w-full' : 'w-[340px] shrink-0 border-r border-slate-100 dark:border-dk-border'}`}>
            {/* Sidebar header */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-dk-border">
                <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-dk-muted" strokeWidth={2} />
                        <input
                            type="text"
                            placeholder={tx(lang, { fr: 'Rechercher un ordre...', ar: 'البحث عن أمر...', en: 'Search an order...', es: 'Buscar una orden...', pt: 'Pesquisar uma ordem...', tr: 'Bir emir ara...' })}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full h-9 pl-9 pr-3 text-[13px] text-slate-700 dark:text-dk-text-soft placeholder:text-slate-400 bg-slate-50 focus:bg-white border border-transparent focus:border-slate-200 focus:ring-2 focus:ring-slate-100 rounded-md outline-none transition-all"
                        />
                    </div>
                    {isMobile && (
                        <button onClick={() => setSidebarOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
                {/* Quick stats row + Sort */}
                <div className="flex items-center justify-between mt-2.5 px-1">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-dk-muted">{sortedModels.length} {sortedModels.length !== 1 ? tx(lang, { fr: 'ordres', ar: 'أوامر', en: 'orders', es: 'órdenes', pt: 'ordens', tr: 'emirler' }) : tx(lang, { fr: 'ordre', ar: 'أمر', en: 'order', es: 'orden', pt: 'ordem', tr: 'emir' })}</span>
                        <div className="w-px h-3 bg-slate-200" />
                        <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <span className="text-[10px] text-slate-500 dark:text-dk-muted">{prepCount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            <span className="text-[10px] text-slate-500 dark:text-dk-muted">{activeCount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[10px] text-slate-500 dark:text-dk-muted">{valCount}</span>
                        </div>
                    </div>
                    <button
                        onClick={cycleSortBy}
                        className="flex items-center gap-1 text-[9px] font-bold text-slate-400 hover:text-slate-700 transition-colors uppercase tracking-wide"
                        title={`${tx(lang, { fr: 'Trier par', ar: 'ترتيب حسب', en: 'Sort by', es: 'Ordenar por', pt: 'Ordenar por', tr: 'Sırala' })}: ${sortBy === 'date' ? tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' }) : sortBy === 'name' ? tx(lang, { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' }) : sortBy === 'status' ? tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum' }) : tx(lang, { fr: 'Quantité', ar: 'الكمية', en: 'Quantity', es: 'Cantidad', pt: 'Quantidade', tr: 'Miktar' })}`}
                    >
                        <ArrowUpDown className="w-3 h-3" />
                        {sortBy === 'date' ? tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' }) : sortBy === 'name' ? tx(lang, { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' }) : sortBy === 'status' ? tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum' }) : tx(lang, { fr: 'Qté', ar: 'الكمية', en: 'Qty', es: 'Cant', pt: 'Qtd', tr: 'Mik' })}
                    </button>
                </div>
            </div>

            {/* Order list */}
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
                {sortedModels.map(model => {
                    const isSelected = selectedModel?.id === model.id;
                    const st = model.ordreCoupe?.status || 'EN_PREPARATION';
                    const conf = STATUS_MAP[st as keyof typeof STATUS_MAP] || STATUS_MAP['EN_PREPARATION'];
                    const StatusIcon = conf.icon;
                    const ref = model.ordreCoupe?.refModele || model.meta_data?.reference || '';
                    const qte = model.ordreCoupe?.qteTotale || model.meta_data?.quantity || 0;
                    const progress = st === 'EN_PREPARATION' ? 25 : st === 'EN_COURS' ? 60 : st === 'SOUS_TRAITANCE' ? 75 : st === 'VALIDE' ? 100 : st === 'REJETE' ? 0 : 0;
                    return (
                        <div
                            key={model.id}
                            onClick={() => openModel(model)}
                            className={`group flex flex-col gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
                                isSelected
                                    ? 'bg-indigo-50 dark:bg-dk-accent/20 border border-indigo-200 shadow-sm'
                                    : 'hover:bg-slate-50 dark:hover:bg-dk-elevated/60 border border-transparent'
                            }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center ${isSelected ? 'bg-indigo-100' : 'bg-slate-100 dark:bg-dk-elevated'}`}>
                                    {model.image || model.images?.front ? (
                                        <img src={model.image || model.images?.front} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <FileText className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : 'text-slate-300 dark:text-dk-muted'}`} />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <h4 className={`text-[12px] font-semibold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800 dark:text-dk-text'}`}>
                                            {model.meta_data?.nom_modele}
                                        </h4>
                                        {model.isPublishedToLibrary === false && (
                                            <span className="shrink-0 px-1 py-0.5 text-[8px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 rounded">{tx(lang, { fr: 'Draft', ar: 'مسودة', en: 'Draft', es: 'Borrador', pt: 'Rascunho', tr: 'Taslak' })}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {ref && (
                                            <span className={`text-[9px] font-medium truncate ${isSelected ? 'text-indigo-500' : 'text-slate-400 dark:text-dk-muted'}`}>
                                                {ref}
                                            </span>
                                        )}
                                        {qte > 0 && (
                                            <>
                                                <span className="text-slate-300 dark:text-dk-muted text-[8px]">·</span>
                                                <span className={`text-[9px] font-medium ${isSelected ? 'text-indigo-500' : 'text-slate-400 dark:text-dk-muted'}`}>
                                                    {qte} pcs
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide flex items-center gap-1 ${
                                    isSelected ? 'bg-indigo-100 text-indigo-600 dark:text-dk-accent-text' : 'bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted'
                                }`}>
                                    <StatusIcon className="w-2.5 h-2.5" />
                                    <span className="hidden sm:inline">{conf.label.split(' ')[0]}</span>
                                </div>
                            </div>
                            <div className="h-0.5 bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all ${
                                        progress === 100 ? 'bg-emerald-500' : progress > 50 ? 'bg-blue-500' : 'bg-slate-400'
                                    }`}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    );
                })}

                {filteredModels.length === 0 && (
                    <div className="text-center py-16 px-4">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-dk-elevated rounded-full flex items-center justify-center mx-auto mb-4">
                            <Scissors className="w-7 h-7 text-slate-300 dark:text-dk-muted" />
                        </div>
                        <p className="text-[13px] font-semibold text-slate-600 dark:text-dk-text-soft">{tx(lang, { fr: 'Aucun ordre trouvé', ar: 'لم يتم العثور على أي أمر', en: 'No order found', es: 'Ninguna orden encontrada', pt: 'Nenhuma ordem encontrada', tr: 'Hiçbir emir bulunamadı' })}</p>
                        <p className="text-[11px] text-slate-400 dark:text-dk-muted mt-1.5 max-w-[200px] mx-auto">
                            {searchTerm ? tx(lang, { fr: 'Essayez un autre terme de recherche', ar: 'جرب مصطلح بحث آخر', en: 'Try another search term', es: 'Pruebe otro término de búsqueda', pt: 'Tente outro termo de pesquisa', tr: 'Başka bir arama terimi deneyin' }) : tx(lang, { fr: 'Créez un nouvel ordre pour commencer', ar: 'أنشئ أمرًا جديدًا للبدء', en: 'Create a new order to start', es: 'Cree una nueva orden para empezar', pt: 'Crie uma nova ordem para começar', tr: 'Başlamak için yeni bir emir oluşturun' })}
                        </p>
                        {!searchTerm && (
                            <button
                                onClick={handleNewModel}
                                className="mt-4 h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold rounded-md transition-colors inline-flex items-center gap-1.5"
                            >
                                <Plus className="w-3 h-3" strokeWidth={2.5} /> {tx(lang, { fr: 'Nouvel Ordre', ar: 'أمر جديد', en: 'New Order', es: 'Nueva Orden', pt: 'Nova Ordem', tr: 'Yeni Emir' })}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-dk-bg select-none text-slate-800 dark:text-dk-text antialiased relative">
            {/* HEADER — Planning-style minimal */}
            <header className="shrink-0 bg-white dark:bg-dk-surface border-b border-slate-100 dark:border-dk-border relative z-20">
                <div className={`${isMobile ? 'px-3 h-12' : 'px-6 h-14'} flex items-center gap-3`}>
                    {isMobile && selectedModel && (
                        <button
                            onClick={() => { setSelectedModel(null); setSidebarOpen(true); }}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" strokeWidth={2} />
                        </button>
                    )}
                    {isMobile && !selectedModel && (
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                            <Menu className="w-4 h-4" strokeWidth={2} />
                        </button>
                    )}

                    <div className="flex items-baseline gap-2 shrink-0">
                        <h1 className={`${isMobile ? 'text-[15px]' : 'text-[15px]'} font-semibold text-slate-900 dark:text-dk-text tracking-tight`}>{tx(lang, { fr: 'La Coupe', ar: 'قسم القص', en: 'Cutting Dept.', es: 'Departamento de Corte', pt: 'Corte', tr: 'Kesim' })}</h1>
                        {!isMobile && <span className="text-[12px] text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Ordre de Fabrication', ar: 'أمر تصنيع', en: 'Production Order', es: 'Orden de Fabricación', pt: 'Ordem de Fabricação', tr: 'Üretim Emri' })}</span>}
                    </div>

                    {/* Stats inline */}
                    {!isMobile && (
                        <div className="hidden md:flex items-center gap-4 ml-2">
                            <HeaderStat label={tx(lang, { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' })} value={coupeModels.length} />
                            <HeaderStat label={tx(lang, { fr: 'Préparation', ar: 'تحضير', en: 'Preparation', es: 'Preparación', pt: 'Preparação', tr: 'Hazırlık' })} value={prepCount} color="bg-slate-400" />
                            <HeaderStat label={tx(lang, { fr: 'En cours', ar: 'قيد التنفيذ', en: 'In Progress', es: 'En Curso', pt: 'Em Andamento', tr: 'Devam Ediyor' })} value={activeCount} color="bg-blue-500" />
                            <HeaderStat label={tx(lang, { fr: 'Validés', ar: 'تم التحقق', en: 'Validated', es: 'Validados', pt: 'Validados', tr: 'Onaylanan' })} value={valCount} color="bg-emerald-500" />
                        </div>
                    )}

                    {/* View mode tabs */}
                    {!isMobile && (
                        <div className="hidden lg:flex items-center bg-slate-100 dark:bg-dk-elevated rounded-lg p-0.5 gap-0.5 ml-2">
                            {[
                                { id: 'list', icon: List, label: tx(lang, { fr: 'Liste', ar: 'قائمة', en: 'List', es: 'Lista', pt: 'Lista', tr: 'Liste' }) },
                                { id: 'board', icon: LayoutGrid, label: tx(lang, { fr: 'Tableau', ar: 'لوحة', en: 'Board', es: 'Tablero', pt: 'Quadro', tr: 'Pano' }) },
                                { id: 'calendar', icon: Calendar, label: tx(lang, { fr: 'Calendrier', ar: 'تقويم', en: 'Calendar', es: 'Calendario', pt: 'Calendário', tr: 'Takvim' }) },
                                { id: 'stats', icon: BarChart3, label: tx(lang, { fr: 'Stats', ar: 'إحصائيات', en: 'Stats', es: 'Estadísticas', pt: 'Estatísticas', tr: 'İstatistikler' }) },
                            ].map(v => {
                                const Icon = v.icon;
                                return (
                                    <button
                                        key={v.id}
                                        onClick={() => setViewMode(v.id as ViewMode)}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-all ${
                                            viewMode === v.id
                                                ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                        title={v.label}
                                    >
                                        <Icon className="w-3 h-3" />
                                        <span>{v.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex-1" />

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                        {selectedModel && !isMobile && (
                            <button
                                onClick={() => setSelectedModel(null)}
                                className="h-8 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 text-[12px] font-medium transition-colors"
                                title={tx(lang, { fr: 'Retour à la liste', ar: 'العودة إلى القائمة', en: 'Back to list', es: 'Volver a la lista', pt: 'Voltar à lista', tr: 'Listeye dön' })}
                            >
                                <ArrowRight className="w-4 h-4" strokeWidth={2} />
                                <span>{tx(lang, { fr: 'Retour', ar: 'عودة', en: 'Back', es: 'Volver', pt: 'Voltar', tr: 'Geri' })}</span>
                            </button>
                        )}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`${isMobile ? 'w-11 h-11' : 'h-8 px-2.5'} inline-flex items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                                showFilters ? 'bg-indigo-50 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                            title={tx(lang, { fr: 'Filtres', ar: 'مرشحات', en: 'Filters', es: 'Filtros', pt: 'Filtros', tr: 'Filtreler' })}
                        >
                            <Filter className="w-4 h-4" strokeWidth={1.75} />
                            {!isMobile && <span>{tx(lang, { fr: 'Filtres', ar: 'مرشحات', en: 'Filters', es: 'Filtros', pt: 'Filtros', tr: 'Filtreler' })}</span>}
                        </button>
                        <button
                            onClick={handleExportExcel}
                            className={`${isMobile ? 'w-11 h-11' : 'h-8 px-2.5'} inline-flex items-center justify-center gap-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 text-[12px] font-medium transition-colors`}
                            title={tx(lang, { fr: 'Export Excel', ar: 'تصدير Excel', en: 'Export Excel', es: 'Exportar Excel', pt: 'Exportar Excel', tr: 'Excel Aktar' })}
                        >
                            <Download className="w-4 h-4" strokeWidth={1.75} />
                            {!isMobile && <span>{tx(lang, { fr: 'Export', ar: 'تصدير', en: 'Export', es: 'Exportar', pt: 'Exportar', tr: 'Aktar' })}</span>}
                        </button>
                        {selectedModel && (
                            <>
                                <button
                                    onClick={() => onOpenInAtelier && onOpenInAtelier(selectedModel)}
                                    className={`${isMobile ? 'w-11 h-11' : 'h-8 px-3'} inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-dk-accent/20 hover:bg-indigo-100 text-indigo-700 dark:text-dk-accent-text text-[12px] font-medium transition-colors border border-indigo-200`}
                                    title={tx(lang, { fr: 'Méthodes', ar: 'الطرق', en: 'Methods', es: 'Métodos', pt: 'Métodos', tr: 'Yöntemler' })}
                                >
                                    <Layers className="w-4 h-4" strokeWidth={1.75} />
                                    {!isMobile && tx(lang, { fr: 'Méthodes', ar: 'الطرق', en: 'Methods', es: 'Métodos', pt: 'Métodos', tr: 'Yöntemler' })}
                                </button>
                                <button
                                    onClick={() => handleSaveCoupe(false)}
                                    className={`${isMobile ? 'w-11 h-11' : 'h-8 px-3'} inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium transition-colors`}
                                    title={tx(lang, { fr: 'Sauvegarder', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Salvar', tr: 'Kaydet' })}
                                >
                                    <Save className="w-4 h-4" strokeWidth={2} />
                                    {!isMobile && tx(lang, { fr: 'Sauvegarder', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Salvar', tr: 'Kaydet' })}
                                </button>
                                {selectedModel.isPublishedToLibrary === false && (
                                    <button
                                        onClick={() => handleSaveCoupe(true)}
                                        className={`${isMobile ? 'w-11 h-11' : 'h-8 px-3'} inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium transition-colors`}
                                        title={tx(lang, { fr: 'Publier', ar: 'نشر', en: 'Publish', es: 'Publicar', pt: 'Publicar', tr: 'Yayınla' })}
                                    >
                                        <Send className="w-4 h-4" strokeWidth={2} />
                                        {!isMobile && tx(lang, { fr: 'Publier', ar: 'نشر', en: 'Publish', es: 'Publicar', pt: 'Publicar', tr: 'Yayınla' })}
                                    </button>
                                )}
                                {ordre.status === 'VALIDE' && (
                                    <button
                                        onClick={() => handleSaveCoupe(false, 'PLANNING')}
                                        className={`${isMobile ? 'w-11 h-11' : 'h-8 px-3'} inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium transition-colors`}
                                        title={tx(lang, { fr: 'Vers Planning', ar: 'إلى التخطيط', en: 'To Planning', es: 'A Planificación', pt: 'Para Planejamento', tr: 'Planlamaya Git' })}
                                    >
                                        <Truck className="w-4 h-4" strokeWidth={2} />
                                        {!isMobile && tx(lang, { fr: 'Vers Planning', ar: 'إلى التخطيط', en: 'To Planning', es: 'A Planificación', pt: 'Para Planejamento', tr: 'Planlamaya Git' })}
                                    </button>
                                )}
                            </>
                        )}

                        {!selectedModel && (
                            <button
                                onClick={handleNewModel}
                                className={`${isMobile ? 'w-11 h-11' : 'h-8 px-3'} inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium transition-colors`}
                            >
                                <Plus className="w-4 h-4" strokeWidth={2.25} />
                                {!isMobile && tx(lang, { fr: 'Nouvel Ordre', ar: 'أمر جديد', en: 'New Order', es: 'Nueva Orden', pt: 'Nova Ordem', tr: 'Yeni Emir' })}
                            </button>
                        )}

                        <button
                            onClick={() => showToast(tx(lang, { fr: 'Fonction impression à venir', ar: 'وظيفة الطباعة قادمة قريبًا', en: 'Print function coming soon', es: 'Función de impresión próximamente', pt: 'Função de impressão em breve', tr: 'Yazdırma işlevi çok yakında' }), 'info')}
                            className={`${isMobile ? 'w-11 h-11' : 'h-8 px-3'} inline-flex items-center justify-center gap-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 text-[12px] font-medium transition-colors`}
                            title={tx(lang, { fr: 'Imprimer', ar: 'طباعة', en: 'Print', es: 'Imprimir', pt: 'Imprimir', tr: 'Yazdır' })}
                        >
                            <Printer className="w-4 h-4" strokeWidth={1.75} />
                            {!isMobile && tx(lang, { fr: 'Rapport', ar: 'تقرير', en: 'Report', es: 'Informe', pt: 'Relatório', tr: 'Rapor' })}
                        </button>
                        {selectedModel && (
                            <button
                                onClick={() => setDeleteConfirm(selectedModel.id)}
                                className={`${isMobile ? 'w-11 h-11' : 'h-8 px-3'} inline-flex items-center justify-center gap-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-red-600 hover:bg-red-50 text-[12px] font-medium transition-colors`}
                                title={tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' })}
                            >
                                <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* MAIN LAYOUT */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar — always on desktop, drawer on mobile */}
                {!isMobile ? (
                    sidebar
                ) : (
                    <>
                        {sidebarOpen && (
                            <div className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[2px]" onClick={() => setSidebarOpen(false)} />
                        )}
                        <div className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[340px] transform transition-transform duration-200 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                            {sidebar}
                        </div>
                    </>
                )}

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto">
                    {showFilters && (
                        <div className="bg-white dark:bg-dk-surface border-b border-slate-100 dark:border-dk-border px-4 md:px-6 py-3 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">{tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum' })}:</span>
                            {[
                                { v: 'ALL', l: tx(lang, { fr: 'Tous', ar: 'الكل', en: 'All', es: 'Todos', pt: 'Todos', tr: 'Tümü' }), c: 'bg-slate-100 dark:bg-dk-elevated text-slate-700 dark:text-dk-text-soft' },
                                { v: 'EN_PREPARATION', l: tx(lang, { fr: 'Préparation', ar: 'تحضير', en: 'Preparation', es: 'Preparación', pt: 'Preparação', tr: 'Hazırlık' }), c: 'bg-slate-50 dark:bg-dk-bg text-slate-700 dark:text-dk-text-soft' },
                                { v: 'EN_COURS', l: tx(lang, { fr: 'En Cours', ar: 'قيد التنفيذ', en: 'In Progress', es: 'En Curso', pt: 'Em Andamento', tr: 'Devam Ediyor' }), c: 'bg-blue-50 text-blue-700' },
                                { v: 'SOUS_TRAITANCE', l: tx(lang, { fr: 'Extériorisé', ar: 'مقاول خارجي', en: 'Subcontracted', es: 'Subcontratado', pt: 'Terceirizado', tr: 'Taşeron' }), c: 'bg-purple-50 text-purple-700' },
                                { v: 'VALIDE', l: tx(lang, { fr: 'Validé', ar: 'تم التحقق', en: 'Validated', es: 'Validado', pt: 'Validado', tr: 'Onaylandı' }), c: 'bg-emerald-50 text-emerald-700' },
                                { v: 'REJETE', l: tx(lang, { fr: 'Rejeté', ar: 'مرفوض', en: 'Rejected', es: 'Rechazado', pt: 'Rejeitado', tr: 'Reddedildi' }), c: 'bg-rose-50 text-rose-700' },
                            ].map(f => (
                                <button
                                    key={f.v}
                                    onClick={() => setFilterStatus(f.v)}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                                        filterStatus === f.v
                                            ? `${f.c} ring-2 ring-offset-1 ring-slate-200`
                                            : 'text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                                    }`}
                                >
                                    {f.l}
                                </button>
                            ))}
                        </div>
                    )}

                    {selectedModel ? (
                        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4 md:space-y-5">

                            {/* ORDER HEADER CARD */}
                            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden">
                                <div className="bg-slate-900 p-5 md:p-7 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/15 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                        <div className="flex gap-4 items-center">
                                            <div className="w-16 h-16 md:w-20 md:h-20 bg-white dark:bg-dk-surface/10 p-1.5 rounded-xl backdrop-blur-md border border-white/15 shrink-0">
                                                {(selectedModel.image || selectedModel.images?.front) ? (
                                                    <img src={selectedModel.image || selectedModel.images?.front} alt="" className="w-full h-full object-cover rounded-lg" />
                                                ) : (
                                                    <div className="w-full h-full bg-white dark:bg-dk-surface/5 rounded-lg flex items-center justify-center">
                                                        <Scissors className="w-8 h-8 text-white/40" />
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="px-2 py-0.5 bg-rose-500 text-white text-[9px] font-bold uppercase tracking-wider rounded">OF</span>
                                                    <span className="text-slate-400 dark:text-dk-muted text-[11px] font-medium">{tx(lang, { fr: 'Réf', ar: 'مرجع', en: 'Ref', es: 'Ref', pt: 'Ref', tr: 'Ref' })}: {ordre.refModele || 'N/A'}</span>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={ordre.refModele}
                                                    onChange={e => setOrdre({ ...ordre, refModele: e.target.value })}
                                                    className="bg-transparent text-xl md:text-2xl font-bold text-white tracking-tight border-b border-transparent hover:border-white/20 focus:border-rose-500 outline-none w-full sm:w-72 transition-colors"
                                                    placeholder={tx(lang, { fr: 'Nom de la référence...', ar: 'اسم المرجع...', en: 'Reference name...', es: 'Nombre de la referencia...', pt: 'Nome da referência...', tr: 'Referans adı...' })}
                                                />
                                                <p className="text-slate-400 dark:text-dk-muted mt-1 text-[11px] font-medium">{tx(lang, { fr: 'Paramètres de matelassage', ar: 'إعدادات المفرشة', en: 'Layering settings', es: 'Configuración de capas', pt: 'Configurações de esteiramento', tr: 'Katman ayarları' })}</p>
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-dk-surface/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-center">
                                            <p className="text-slate-400 dark:text-dk-muted text-[9px] font-bold uppercase tracking-wider mb-1">{tx(lang, { fr: 'Quantité', ar: 'الكمية', en: 'Quantity', es: 'Cantidad', pt: 'Quantidade', tr: 'Miktar' })}</p>
                                            <div className="flex items-end gap-1.5 text-white">
                                                <input
                                                    type="number"
                                                    value={ordre.qteTotale || ''}
                                                    readOnly
                                                    className="w-20 bg-white dark:bg-dk-surface/5 border border-white/10 rounded text-center font-bold text-xl text-white outline-none py-0.5 cursor-not-allowed opacity-80"
                                                    placeholder="0"
                                                />
                                                <span className="text-rose-400 text-[11px] font-bold mb-0.5">pcs</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Status + Params */}
                                <div className="p-4 md:p-6">
                                    <div className="flex items-center justify-between mb-5">
                                        <div className="flex items-center gap-2">
                                            <Layers className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                                            <h3 className="text-[14px] font-semibold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Paramètres du Matelas', ar: 'إعدادات المفرشة', en: 'Layering Parameters', es: 'Parámetros de Capas', pt: 'Parâmetros do Esteiramento', tr: 'Katman Parametreleri' })}</h3>
                                        </div>
                                    {/* Status segmented control */}
                                    <div className="flex items-center bg-slate-100 dark:bg-dk-elevated rounded-lg p-0.5 gap-0.5 overflow-x-auto">
                    {Object.entries(STATUS_MAP).map(([key, config]: [string, any]) => {
                                            const isActive = ordre.status === key;
                                            const Icon = config.icon;
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => setOrdre({ ...ordre, status: key as any })}
                                                    className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                                                        isActive
                                                            ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm'
                                                            : 'text-slate-500 hover:text-slate-700'
                                                    }`}
                                                    title={config.label}
                                                >
                                                    <Icon className="w-3 h-3" />
                                                    <span>{config.label.split(' ')[0]}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-6">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1.5 uppercase tracking-wide">
                                                {tx(lang, { fr: 'Consommation Référence / Pièce', ar: 'استهلاك المرجع / القطعة', en: 'Reference Consumption / Piece', es: 'Consumo Referencia / Pieza', pt: 'Consumo Referência / Peça', tr: 'Referans Tüketimi / Parça' })}
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={ordre.consommation || ''}
                                                    onChange={e => setOrdre(prev => ({ ...prev, consommation: Number(e.target.value) }))}
                                                    className="w-full bg-slate-50 border border-slate-200 dark:border-dk-border rounded-lg pl-3 pr-12 py-3 text-[13px] font-semibold text-slate-800 dark:text-dk-text outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50/50 transition-all min-h-[44px]"
                                                    placeholder="0.00"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 dark:text-dk-muted bg-slate-200 px-1.5 py-0.5 rounded">Mètres</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1.5 uppercase tracking-wide">
                                                {tx(lang, { fr: 'Tissu Reçu (Métrage Initial)', ar: 'النسيج المستلم (المترات الأولية)', en: 'Fabric Received (Initial Length)', es: 'Tejido Recibido (Metraje Inicial)', pt: 'Tecido Recebido (Metragem Inicial)', tr: 'Alınan Kumaş (Başlangıç Metrajı)' })}
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={ordre.tissuRecu || ''}
                                                    onChange={e => setOrdre(prev => ({ ...prev, tissuRecu: Number(e.target.value) }))}
                                                    className="w-full bg-slate-50 border border-slate-200 dark:border-dk-border rounded-lg pl-3 pr-12 py-3 text-[13px] font-semibold text-slate-800 dark:text-dk-text outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50/50 transition-all min-h-[44px]"
                                                    placeholder="0"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 dark:text-dk-muted bg-slate-200 px-1.5 py-0.5 rounded">Mètres</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* TABLEAU DES MATELAS */}
                                    <div className="border-t border-slate-100 dark:border-dk-border pt-5 mb-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-[12px] font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide flex items-center gap-1.5">
                                                <Scissors className="w-3.5 h-3.5 text-indigo-500" />
                                                {tx(lang, { fr: 'Lignes de Matelas (Coupe)', ar: 'خطوط المفرشات (القص)', en: 'Layer Lines (Cutting)', es: 'Líneas de Capas (Corte)', pt: 'Linhas de Esteiramento (Corte)', tr: 'Katman Hatları (Kesim)' })}
                                            </h4>
                                            <button
                                                type="button"
                                                onClick={handleAddMatelasLine}
                                                className="px-3 py-1.5 bg-indigo-600 dark:bg-dk-accent text-white hover:bg-indigo-700 dark:hover:bg-dk-accent-hover text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors"
                                            >
                                                <Plus className="w-3 h-3" /> {tx(lang, { fr: 'Ajouter Matelas', ar: 'إضافة مفرشة', en: 'Add Layer', es: 'Agregar Capa', pt: 'Adicionar Esteira', tr: 'Katman Ekle' })}
                                            </button>
                                        </div>

                                        {(ordre.matelasLines || []).length === 0 ? (
                                            <div className="text-center py-6 text-slate-400 dark:text-dk-muted text-[12px] font-medium bg-slate-50 dark:bg-dk-bg rounded-lg border border-dashed border-slate-200 dark:border-dk-border">
                                                {tx(lang, { fr: 'Aucun matelas défini. Ajoutez une ligne pour commencer à couper.', ar: 'لم يتم تحديد أي مفرشة. أضف خطًا لبدء القص.', en: 'No layer defined. Add a line to start cutting.', es: 'Ninguna capa definida. Agregue una línea para comenzar a cortar.', pt: 'Nenhuma esteira definida. Adicione uma linha para começar a cortar.', tr: 'Hiçbir katman tanımlanmadı. Kesmeye başlamak için bir satır ekleyin.' })}
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-[12px] border-collapse border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface rounded-lg overflow-hidden min-w-[650px]">
                                                    <thead>
                                                        <tr className="bg-slate-50 dark:bg-dk-bg text-slate-600 dark:text-dk-text-soft border-b border-slate-200 dark:border-dk-border text-[10px] uppercase tracking-wider text-left">
                                                            <th className="py-2.5 px-3 font-bold text-center w-12">{tx(lang, { fr: 'N°', ar: 'رقم', en: 'No.', es: 'N°', pt: 'N°', tr: 'No.' })}</th>
                                                            <th className="py-2.5 px-3 font-bold text-center w-24">{tx(lang, { fr: 'Plis', ar: 'طيات', en: 'Plys', es: 'Pliegues', pt: 'Dobras', tr: 'Kat Sayısı' })}</th>
                                                            <th className="py-2.5 px-3 font-bold text-center w-32">{tx(lang, { fr: 'Long. Tracée (m)', ar: 'الطول المرسوم (م)', en: 'Traced Length (m)', es: 'Long. Trazada (m)', pt: 'Comp. Traçado (m)', tr: 'Çizilen Uzunluk (m)' })}</th>
                                                            {sizes.map((s, idx) => (
                                                                <th key={idx} className="py-2.5 px-2 font-bold text-center text-emerald-700 min-w-[50px]">{s}</th>
                                                            ))}
                                                            <th className="py-2.5 px-3 font-bold text-center w-24">{tx(lang, { fr: 'Total Pcs', ar: 'إجمالي القطع', en: 'Total Pcs', es: 'Total Pzs', pt: 'Total Peças', tr: 'Toplam Adet' })}</th>
                                                            <th className="py-2.5 px-3 font-bold text-center w-28">{tx(lang, { fr: 'Cons. (m)', ar: 'الاستهلاك (م)', en: 'Cons. (m)', es: 'Cons. (m)', pt: 'Cons. (m)', tr: 'Tük. (m)' })}</th>
                                                            <th className="py-2.5 px-3 font-bold text-center w-16"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {(ordre.matelasLines || []).map((line, lIdx) => {
                                                            let lineRatioSum = 0;
                                                            sizes.forEach(s => { lineRatioSum += Number(line.ratios?.[s]) || 0; });
                                                            const linePieces = (line.plis || 0) * lineRatioSum;
                                                            const lineCons = (line.plis || 0) * ((line.longTracee || 0) + 0.03);
                                                            
                                                            return (
                                                                <tr key={line.id} className="hover:bg-slate-50/50 transition-colors">
                                                                    <td className="py-2 px-3 text-center font-bold text-slate-500 dark:text-dk-muted bg-slate-50/50">{lIdx + 1}</td>
                                                                    <td className="py-1 px-2">
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            value={line.plis || ''}
                                                                            onChange={e => handleUpdateMatelasLine(line.id, 'plis', Number(e.target.value))}
                                                                            className="w-full text-center py-1.5 px-1 bg-slate-50 border border-slate-200 dark:border-dk-border rounded text-[12px] font-semibold outline-none focus:bg-white focus:border-indigo-400"
                                                                            placeholder="0"
                                                                        />
                                                                    </td>
                                                                    <td className="py-1 px-2">
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            min="0"
                                                                            value={line.longTracee || ''}
                                                                            onChange={e => handleUpdateMatelasLine(line.id, 'longTracee', Number(e.target.value))}
                                                                            className="w-full text-center py-1.5 px-1 bg-slate-50 border border-slate-200 dark:border-dk-border rounded text-[12px] font-semibold outline-none focus:bg-white focus:border-indigo-400"
                                                                            placeholder="0.00"
                                                                        />
                                                                    </td>
                                                                    {sizes.map((s, idx) => (
                                                                        <td key={idx} className="py-1 px-1">
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                value={line.ratios?.[s] || ''}
                                                                                onChange={e => handleUpdateMatelasRatio(line.id, s, Number(e.target.value))}
                                                                                className="w-full text-center py-1.5 px-1 bg-emerald-50/30 border border-slate-200 dark:border-dk-border rounded text-[12px] font-semibold text-emerald-700 outline-none focus:bg-emerald-50 focus:border-emerald-400"
                                                                                placeholder="0"
                                                                            />
                                                                        </td>
                                                                    ))}
                                                                    <td className="py-2 px-3 text-center font-bold text-slate-800 dark:text-dk-text bg-slate-50/20">{linePieces}</td>
                                                                    <td className="py-2 px-3 text-center font-bold text-slate-800 dark:text-dk-text bg-slate-50/20">{lineCons.toFixed(2)}</td>
                                                                    <td className="py-1 px-2 text-center">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteMatelasLine(line.id)}
                                                                            className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors"
                                                                            title={tx(lang, { fr: 'Supprimer la ligne', ar: 'حذف السطر', en: 'Delete line', es: 'Eliminar línea', pt: 'Excluir linha', tr: 'Satırı sil' })}
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    {/* COMPARAISON TAILLES (Target vs Cut) & BILAN TISSU */}
                                    {(ordre.matelasLines || []).length > 0 && (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-slate-100 dark:border-dk-border pt-5">
                                            {/* Comparative table */}
                                            <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-4 border border-slate-200 dark:border-dk-border">
                                                <h5 className="text-[11px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider mb-2.5">{tx(lang, { fr: 'Bilan par Taille (Cible vs Réalisé)', ar: 'الحسبنة حسب المقاس (المستهدف مقابل المحقق)', en: 'Balance by Size (Target vs Actual)', es: 'Balance por Talla (Objetivo vs Realizado)', pt: 'Balanço por Tamanho (Alvo vs Realizado)', tr: 'Beden Bazında Bilanço (Hedef vs Gerçekleşen)' })}</h5>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-[11px] border-collapse bg-white dark:bg-dk-surface rounded-lg overflow-hidden border border-slate-200 dark:border-dk-border">
                                                        <thead>
                                                            <tr className="bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border-b border-slate-200 dark:border-dk-border text-[9px] uppercase tracking-wider text-left">
                                                                <th className="py-2 px-2.5 font-bold">{tx(lang, { fr: 'Mesure', ar: 'المقاس', en: 'Size', es: 'Medida', pt: 'Medida', tr: 'Ölçü' })}</th>
                                                                {sizes.map((s, idx) => (
                                                                    <th key={idx} className="py-2 px-1 text-center font-bold">{s}</th>
                                                                ))}
                                                                <th className="py-2 px-2.5 text-center font-bold bg-slate-200 text-slate-700 dark:text-dk-text-soft w-16">{tx(lang, { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' })}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            <tr>
                                                                <td className="py-2 px-2.5 font-semibold text-slate-600 dark:text-dk-text-soft">{tx(lang, { fr: 'Cible (Fiche)', ar: 'المستهدف (الورقة)', en: 'Target (Sheet)', es: 'Objetivo (Ficha)', pt: 'Alvo (Ficha)', tr: 'Hedef (Fiş)' })}</td>
                                                                {sizes.map((s, idx) => {
                                                                    // Map size to its column index in gridQuantities
                                                                    return (
                                                                        <td key={idx} className="py-2 px-1 text-center font-semibold text-slate-700 dark:text-dk-text-soft bg-slate-50/50">
                                                                            {matrixStats.colTotals[idx] || 0}
                                                                        </td>
                                                                    );
                                                                })}
                                                                <td className="py-2 px-2.5 text-center font-bold bg-slate-100 dark:bg-dk-elevated text-slate-700 dark:text-dk-text-soft">{matrixStats.grandTotal}</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="py-2 px-2.5 font-semibold text-indigo-700 dark:text-dk-accent-text bg-indigo-50 dark:bg-dk-accent/20/10">{tx(lang, { fr: 'Réalisé (Coupe)', ar: 'المحقق (القص)', en: 'Actual (Cut)', es: 'Realizado (Corte)', pt: 'Realizado (Corte)', tr: 'Gerçekleşen (Kesim)' })}</td>
                                                                {sizes.map((s, idx) => (
                                                                    <td key={idx} className="py-2 px-1 text-center font-bold text-indigo-700 dark:text-dk-accent-text bg-indigo-50 dark:bg-dk-accent/20/10">
                                                                        {matelasCalculations.perSize[s] || 0}
                                                                    </td>
                                                                ))}
                                                                <td className="py-2 px-2.5 text-center font-bold bg-indigo-100 text-indigo-800">{matelasCalculations.totalPieces}</td>
                                                            </tr>
                                                            <tr className="border-t border-slate-200 dark:border-dk-border">
                                                                <td className="py-2 px-2.5 font-bold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Écart (DIF)', ar: 'الفرق', en: 'Gap (DIF)', es: 'Diferencia (DIF)', pt: 'Diferença (DIF)', tr: 'Fark (DIF)' })}</td>
                                                                {sizes.map((s, idx) => {
                                                                    const diff = (matelasCalculations.perSize[s] || 0) - (matrixStats.colTotals[idx] || 0);
                                                                    return (
                                                                        <td
                                                                            key={idx}
                                                                            className={`py-2 px-1 text-center font-bold ${
                                                                                diff === 0 ? 'text-emerald-600 bg-emerald-50/20' : diff > 0 ? 'text-blue-600 bg-blue-50/20' : 'text-rose-600 bg-rose-50/20'
                                                                            }`}
                                                                        >
                                                                            {diff > 0 ? `+${diff}` : diff}
                                                                        </td>
                                                                    );
                                                                })}
                                                                {(() => {
                                                                    const totalDiff = matelasCalculations.totalPieces - matrixStats.grandTotal;
                                                                    return (
                                                                        <td
                                                                            className={`py-2 px-2.5 text-center font-bold ${
                                                                                totalDiff === 0 ? 'bg-emerald-600 text-white' : totalDiff > 0 ? 'bg-blue-600 text-white' : 'bg-rose-600 text-white'
                                                                            }`}
                                                                        >
                                                                            {totalDiff > 0 ? `+${totalDiff}` : totalDiff}
                                                                        </td>
                                                                    );
                                                                })()}
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>

                                            {/* Tissu summary card */}
                                            <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-4 border border-slate-200 dark:border-dk-border flex flex-col justify-between">
                                                <div>
                                                    <h5 className="text-[11px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider mb-2.5">{tx(lang, { fr: 'Bilan Matière', ar: 'حساب المواد', en: 'Material Balance', es: 'Balance de Material', pt: 'Balanço de Material', tr: 'Malzeme Bilançosu' })} (الثوب والمخزون)</h5>
                                                    <div className="grid grid-cols-3 gap-2 text-center">
                                                        <div className="bg-white dark:bg-dk-surface rounded-lg p-2 border border-slate-100 dark:border-dk-border">
                                                            <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang, { fr: 'Tissu Reçu', ar: 'النسيج المستلم', en: 'Fabric Received', es: 'Tejido Recibido', pt: 'Tecido Recebido', tr: 'Alınan Kumaş' })}</p>
                                                            <p className="text-sm font-bold text-slate-700 dark:text-dk-text-soft mt-0.5">{ordre.tissuRecu || 0} m</p>
                                                        </div>
                                                        <div className="bg-white dark:bg-dk-surface rounded-lg p-2 border border-slate-100 dark:border-dk-border">
                                                            <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang, { fr: 'Consommé', ar: 'المستهلك', en: 'Consumed', es: 'Consumido', pt: 'Consumido', tr: 'Tüketilen' })}</p>
                                                            <p className="text-sm font-bold text-indigo-600 dark:text-dk-accent-text mt-0.5">{matelasCalculations.totalFabric.toFixed(1)} m</p>
                                                        </div>
                                                        {(() => {
                                                            const solde = (ordre.tissuRecu || 0) - matelasCalculations.totalFabric;
                                                            return (
                                                                <div className={`rounded-lg p-2 border ${solde >= 0 ? 'bg-emerald-50/55 border-emerald-100 text-emerald-800' : 'bg-rose-50/55 border-rose-100 text-rose-800'}`}>
                                                                    <p className="text-[9px] font-bold uppercase opacity-80">{tx(lang, { fr: 'Reste (DIF)', ar: 'المتبقي', en: 'Remaining (DIF)', es: 'Restante (DIF)', pt: 'Restante (DIF)', tr: 'Kalan (DIF)' })}</p>
                                                                    <p className="text-sm font-bold mt-0.5">{solde.toFixed(1)} m</p>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>

                                                {/* Alerts & Optimization */}
                                                <div className="mt-3">
                                                    {(() => {
                                                        const targetNeed = (ordre.consommation || 0) * (matrixStats.grandTotal || 0);
                                                        const gap = targetNeed - matelasCalculations.totalFabric;
                                                        
                                                        if (targetNeed === 0) return null;
                                                        
                                                        if (gap >= 0) {
                                                            return (
                                                                <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 flex gap-2">
                                                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                                                    <div>
                                                                        <p className="text-[11px] font-bold text-emerald-800">{tx(lang, { fr: 'Économie de tissu réalisée !', ar: 'تم تحقيق توفير في النسيج!', en: 'Fabric savings achieved!', es: '¡Ahorro de tejido logrado!', pt: 'Economia de tecido realizada!', tr: 'Kumaş tasarrufu sağlandı!' })}</p>
                                                                        <p className="text-[10px] text-emerald-700/90 mt-0.5">
                                                                            {tx(lang, { fr: 'Gain de', ar: 'توفير', en: 'Savings of', es: 'Ahorro de', pt: 'Ganho de', tr: 'Tasarruf' })} <strong>{gap.toFixed(1)}m</strong> {tx(lang, { fr: 'par rapport au besoin théorique', ar: 'مقابل الاحتياج النظري', en: 'compared to theoretical need', es: 'con respecto a la necesidad teórica', pt: 'em relação à necessidade teórica', tr: 'teorik ihtiyaca kıyasla' })} ({targetNeed.toFixed(1)}m).
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        } else {
                                                            return (
                                                                <div className="p-2.5 bg-orange-50 rounded-lg border border-orange-200 flex gap-2">
                                                                    <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                                                                    <div>
                                                                        <p className="text-[11px] font-bold text-orange-800">{tx(lang, { fr: 'Surconsommation', ar: 'استهلاك زائد', en: 'Overconsumption', es: 'Sobreconsumo', pt: 'Sobreconsumo', tr: 'Aşırı Tüketim' })} ( ضياع الثوب )</p>
                                                                        <p className="text-[10px] text-orange-700/90 mt-0.5">
                                                                            {tx(lang, { fr: 'Dépassement de', ar: 'تجاوز', en: 'Excess of', es: 'Exceso de', pt: 'Excedente de', tr: 'Fazla' })} <strong>{Math.abs(gap).toFixed(1)}m</strong> {tx(lang, { fr: 'par rapport au besoin théorique', ar: 'مقابل الاحتياج النظري', en: 'compared to theoretical need', es: 'con respecto a la necesidad teórica', pt: 'em relação à necessidade teórica', tr: 'teorik ihtiyaca kıyasla' })} ({targetNeed.toFixed(1)}m).
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* MATRIX CARD */}
                            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden">
                                <div className="px-4 md:px-6 py-4 border-b border-slate-100 dark:border-dk-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <Palette className="w-4 h-4 text-emerald-600" />
                                        <h3 className="text-[14px] font-semibold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Répartition Tailles / Couleurs', ar: 'توزيع المقاسات / الألوان', en: 'Size / Color Distribution', es: 'Distribución de Tallas / Colores', pt: 'Distribuição de Tamanhos / Cores', tr: 'Beden / Renk Dağılımı' })}</h3>
                                    </div>
                                    <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                                        <div className="flex items-center bg-slate-100 dark:bg-dk-elevated rounded-md p-0.5 border border-slate-200 dark:border-dk-border">
                                            <input
                                                type="text"
                                                placeholder={tx(lang, { fr: 'Tailles (ex: 36 38 40)', ar: 'مقاسات (مثال: 36 38 40)', en: 'Sizes (e.g. 36 38 40)', es: 'Tallas (ej: 36 38 40)', pt: 'Tamanhos (ex: 36 38 40)', tr: 'Bedenler (örn: 36 38 40)' })}
                                                className="bg-transparent text-[12px] font-medium px-2 outline-none w-40 text-slate-700 dark:text-dk-text-soft placeholder:text-slate-400 py-1"
                                                value={newSizeInput}
                                                onChange={(e) => setNewSizeInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddSize()}
                                            />
                                            <button onClick={handleAddSize} className="bg-white dark:bg-dk-surface rounded p-1 shadow-sm hover:text-indigo-600 dark:text-dk-accent-text transition-colors">
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleGenerateBarcodes}
                                            disabled={matrixStats.grandTotal === 0}
                                            className="px-3 py-1.5 bg-slate-900 text-white text-[11px] font-semibold rounded-md hover:bg-slate-800 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <Barcode className="w-3 h-3" /> {tx(lang, { fr: 'Tickets', ar: 'تذاكر', en: 'Tickets', es: 'Tickets', pt: 'Etiquetas', tr: 'Etiketler' })}
                                        </button>
                                    </div>
                                </div>

                                {/* Color toolbar */}
                                <div className="px-4 md:px-6 py-2 border-b border-slate-100 dark:border-dk-border bg-slate-50/50 flex flex-wrap gap-2 items-center">
                                    <label className="relative flex items-center justify-center cursor-pointer shrink-0" title={tx(lang, { fr: 'Couleur', ar: 'لون', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' })}>
                                        <input type="color" value={pickedHexColor} onChange={(e) => setPickedHexColor(e.target.value)} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                                        <div className="w-6 h-6 rounded border-2 border-slate-300 shadow-sm cursor-pointer hover:scale-110 transition-transform" style={{ backgroundColor: pickedHexColor }} />
                                    </label>
                                    <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-dk-accent/20 text-indigo-600 dark:text-dk-accent-text text-[9px] font-bold rounded whitespace-nowrap">{hexToColorName(pickedHexColor)}</span>
                                    <div className="relative flex-1 min-w-[120px] flex items-center bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md focus-within:border-indigo-400 px-2 h-7">
                                        <Palette className="w-3 h-3 text-slate-400 dark:text-dk-muted mr-1.5 z-20 relative shrink-0" />
                                        <ExcelInput
                                            suggestions={TEXTILE_COLORS.map(c => c.value)}
                                            placeholder={tx(lang, { fr: 'Nom couleur...', ar: 'اسم اللون...', en: 'Color name...', es: 'Nombre del color...', pt: 'Nome da cor...', tr: 'Renk adı...' })}
                                            className="text-[11px] font-semibold text-slate-700 dark:text-dk-text-soft outline-none w-full pl-5 pr-1"
                                            containerClassName="absolute inset-0 flex items-center"
                                            value={newColorInput}
                                            onChange={(val) => setNewColorInput(val)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    if (newColorInput.trim()) handleAddColorText();
                                                    else handleAddVisualColor(pickedHexColor);
                                                }
                                            }}
                                        />
                                    </div>
                                    <button
                                        onClick={() => { if (newColorInput.trim()) handleAddColorText(); else handleAddVisualColor(pickedHexColor); }}
                                        className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover text-white px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors z-20 h-7"
                                    >
                                        <Plus className="w-3 h-3" /> {tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Agregar', pt: 'Adicionar', tr: 'Ekle' })}
                                    </button>
                                </div>

                                {/* Matrix table */}
                                <div className="relative">
                                    <div className="p-3 md:p-4 overflow-x-auto">
                                        <table className="w-full text-[12px] border-collapse rounded-lg overflow-hidden border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface min-w-[500px]">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-dk-bg text-slate-600 dark:text-dk-text-soft border-b border-slate-200 dark:border-dk-border text-[10px] uppercase tracking-wider">
                                                <th className="py-3 px-3 text-right font-bold border-l border-slate-200 dark:border-dk-border min-w-[120px]">{tx(lang, { fr: 'Couleur \\ Taille', ar: 'اللون \\ المقاس', en: 'Color \\ Size', es: 'Color \\ Talla', pt: 'Cor \\ Tamanho', tr: 'Renk \\ Beden' })}</th>
                                                {sizes.length === 0 && (
                                                    <th className="py-3 px-3 text-center font-normal italic text-slate-400 dark:text-dk-muted border-l border-slate-200 dark:border-dk-border">{tx(lang, { fr: 'Aucune taille', ar: 'لا يوجد مقاس', en: 'No size', es: 'Ninguna talla', pt: 'Nenhum tamanho', tr: 'Beden yok' })}</th>
                                                )}
                                                {sizes.map((s, i) => (
                                                    <th
                                                        key={i}
                                                        className="py-3 px-2 text-center font-bold border-l border-slate-200 dark:border-dk-border text-emerald-700 min-w-[70px] cursor-pointer hover:bg-emerald-50 transition-colors"
                                                        onContextMenu={(e) => { e.preventDefault(); setMatrixCtx({ x: e.pageX, y: e.pageY, type: 'size', index: i, name: s }); }}
                                                        title={tx(lang, { fr: 'Clic droit pour modifier', ar: 'انقر بزر الماوس الأيمن للتعديل', en: 'Right-click to edit', es: 'Clic derecho para editar', pt: 'Clique direito para editar', tr: 'Düzenlemek için sağ tıklayın' })}
                                                    >
                                                        {editingMatrixItem?.type === 'size' && editingMatrixItem.index === i ? (
                                                            <input
                                                                autoFocus type="text"
                                                                className="w-full text-center bg-white dark:bg-dk-surface border-2 border-indigo-400 rounded px-1 py-0.5 text-[12px] font-bold outline-none"
                                                                defaultValue={s}
                                                                onBlur={(e) => editSize(i, e.target.value)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') editSize(i, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingMatrixItem(null); }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        ) : s}
                                                    </th>
                                                ))}
                                                <th className="py-3 px-3 text-center font-bold bg-slate-200 text-slate-800 dark:text-dk-text w-20">{tx(lang, { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' })}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {colors.length === 0 && (
                                                <tr>
                                                    <td colSpan={sizes.length + 2} className="py-8 text-center text-slate-400 dark:text-dk-muted text-[12px] font-medium">
                                                        {tx(lang, { fr: 'Aucune couleur définie', ar: 'لم يتم تحديد أي لون', en: 'No color defined', es: 'Ningún color definido', pt: 'Nenhuma cor definida', tr: 'Renk tanımlanmadı' })}
                                                    </td>
                                                </tr>
                                            )}
                                            {colors.map((c, cIdx) => {
                                                const cId = c.id || (typeof c === 'string' ? c : c.name);
                                                const cName = c.name || (typeof c === 'string' ? c : c.id);
                                                const cHex = c.id && c.id.startsWith('#') ? c.id : null;
                                                const palette = BADGE_COLORS[cIdx % BADGE_COLORS.length];
                                                return (
                                                    <tr key={`${cId}-${cIdx}`} className="hover:bg-emerald-50/30 transition-colors">
                                                        <td
                                                            className="py-2.5 px-3 border-l border-slate-200 dark:border-dk-border font-semibold text-slate-800 dark:text-dk-text cursor-pointer hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors"
                                                            onContextMenu={(e) => { e.preventDefault(); setMatrixCtx({ x: e.pageX, y: e.pageY, type: 'color', index: cIdx, id: cId, name: cName }); }}
                                                            title={tx(lang, { fr: 'Clic droit pour modifier', ar: 'انقر بزر الماوس الأيمن للتعديل', en: 'Right-click to edit', es: 'Clic derecho para editar', pt: 'Clique direito para editar', tr: 'Düzenlemek için sağ tıklayın' })}
                                                        >
                                                            {editingMatrixItem?.type === 'color' && editingMatrixItem.index === cIdx ? (
                                                                <input
                                                                    autoFocus type="text"
                                                                    className="w-full bg-white dark:bg-dk-surface border-2 border-indigo-400 rounded px-1.5 py-0.5 text-[12px] font-bold outline-none"
                                                                    defaultValue={cName}
                                                                    onBlur={(e) => editColor(cId, e.target.value)}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') editColor(cId, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingMatrixItem(null); }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            ) : (
                                                                <div className="flex items-center gap-1.5">
                                                                    <div
                                                                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${cHex ? '' : palette.dot}`}
                                                                        style={cHex ? { backgroundColor: cHex } : undefined}
                                                                    />
                                                                    <span className="truncate max-w-[100px] text-[12px]">
                                                                        {cHex && (cName.includes('personnalisé') || cName.startsWith('#') || cName.includes('rgb(')) ? hexToColorName(cHex) : cName}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </td>
                                                        {sizes.length === 0 && (
                                                            <td className="py-2.5 px-3 border-l border-slate-100 dark:border-dk-border text-center text-slate-300 dark:text-dk-muted">-</td>
                                                        )}
                                                        {sizes.map((s, sIdx) => {
                                                            const key = `${cId}_${sIdx}`;
                                                            const val = gridQuantities[key] || '';
                                                            return (
                                                                <td key={sIdx} className="p-0 border-l border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface hover:bg-emerald-50/50 transition-colors">
                                                                    <input
                                                                        type="number" min="0"
                                                                        className="w-full text-center py-3 bg-transparent outline-none focus:bg-emerald-50 focus:text-emerald-700 font-semibold text-[12px] placeholder:text-slate-200 transition-colors"
                                                                        placeholder="0"
                                                                        value={val}
                                                                        onChange={(e) => updateQuantity(cId, sIdx, e.target.value)}
                                                                    />
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="py-2.5 px-3 text-center border-l border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg font-bold text-slate-800 dark:text-dk-text text-[13px]">
                                                            {matrixStats.rowTotals[cId] || 0}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="border-t border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg">
                                            <tr>
                                                <td className="py-3 px-3 text-left font-bold text-slate-600 dark:text-dk-text-soft border-l border-slate-200 dark:border-dk-border text-[11px]">{tx(lang, { fr: 'GÉNÉRAL', ar: 'الإجمالي', en: 'TOTAL', es: 'GENERAL', pt: 'GERAL', tr: 'GENEL' })}</td>
                                                {sizes.length === 0 && <td className="py-2 px-3 text-center text-slate-300 dark:text-dk-muted border-l border-slate-200 dark:border-dk-border">-</td>}
                                                {sizes.map((_, sIdx) => (
                                                    <td key={sIdx} className="py-2 px-2 text-center border-l border-slate-200 dark:border-dk-border font-bold text-slate-700 dark:text-dk-text-soft text-[12px]">
                                                        {matrixStats.colTotals[sIdx] || 0}
                                                    </td>
                                                ))}
                                                <td className="py-2 px-3 text-center bg-emerald-600 text-white font-bold text-[14px]">
                                                    {matrixStats.grandTotal}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                    </div>
                                    {/* Mobile scroll indicator */}
                                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none sm:hidden" />
                                </div>

                                {/* Matrix context menu */}
                                {matrixCtx && createPortal(
                                    <div
                                        className="fixed bg-white dark:bg-dk-surface rounded-lg shadow-xl border border-slate-200 dark:border-dk-border w-48 z-[9999] py-1.5 text-[12px] text-slate-700 dark:text-dk-text-soft font-medium"
                                        style={{ top: matrixCtx.y, left: matrixCtx.x }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="px-3 py-1 text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider">
                                            {matrixCtx.type === 'size' ? tx(lang, { fr: 'Taille', ar: 'مقاس', en: 'Size', es: 'Talla', pt: 'Tamanho', tr: 'Beden' }) : tx(lang, { fr: 'Couleur', ar: 'لون', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' })}: {matrixCtx.name}
                                        </div>
                                        <div className="h-px bg-slate-100 dark:bg-dk-elevated my-1" />
                                        <button
                                            type="button"
                                            onClick={() => { setEditingMatrixItem({ type: matrixCtx.type, index: matrixCtx.index, value: matrixCtx.name || '' }); setMatrixCtx(null); }}
                                            className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text flex items-center gap-2 font-semibold"
                                        >
                                            {tx(lang, { fr: 'Renommer', ar: 'إعادة تسمية', en: 'Rename', es: 'Renombrar', pt: 'Renomear', tr: 'Yeniden Adlandır' })}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (matrixCtx.type === 'size') { if (confirm(`${tx(lang, { fr: 'Supprimer la taille', ar: 'حذف المقاس', en: 'Delete size', es: 'Eliminar talla', pt: 'Excluir tamanho', tr: 'Bedeni sil' })} "${matrixCtx.name}" ?`)) removeSize(matrixCtx.index); }
                                                else { if (confirm(`${tx(lang, { fr: 'Supprimer la couleur', ar: 'حذف اللون', en: 'Delete color', es: 'Eliminar color', pt: 'Excluir cor', tr: 'Rengi sil' })} "${matrixCtx.name}" ?`)) removeColor(matrixCtx.id!); }
                                                setMatrixCtx(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center gap-2"
                                        >
                                            {tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' })}
                                        </button>
                                    </div>,
                                    document.body
                                )}
                            </div>

                            {/* MATERIALS CARD */}
                            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden">
                                <div className="px-4 md:px-6 py-4 border-b border-slate-100 dark:border-dk-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <PackageSearch className="w-4 h-4 text-indigo-600 dark:text-dk-accent-text" />
                                        <h3 className="text-[14px] font-semibold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Simulation Fournitures', ar: 'محاكاة المواد', en: 'Supplies Simulation', es: 'Simulación de Suministros', pt: 'Simulação de Suprimentos', tr: 'Malzeme Simülasyonu' })}</h3>
                                    </div>
                                    <span className="text-[11px] font-medium text-slate-500 dark:text-dk-muted bg-slate-50 dark:bg-dk-bg px-2 py-1 rounded border border-slate-200 dark:border-dk-border">
                                        {ordre.qteTotale} {tx(lang, { fr: 'pièces', ar: 'قطعة', en: 'pcs', es: 'pzas', pt: 'peças', tr: 'adet' })}
                                    </span>
                                </div>

                                <div className="p-3 md:p-4 overflow-x-auto">
                                    {requiredMaterials.length === 0 ? (
                                        <div className="text-center py-8 text-slate-400 dark:text-dk-muted text-[12px] font-medium bg-slate-50 dark:bg-dk-bg rounded-lg border border-dashed border-slate-200 dark:border-dk-border">
                                            {tx(lang, { fr: 'Aucune fourniture définie dans la Fiche de Coût', ar: 'لم يتم تحديد أي مواد في بطاقة التكلفة', en: 'No supplies defined in the Cost Sheet', es: 'Ningún suministro definido en la Ficha de Costo', pt: 'Nenhum suprimento definido na Ficha de Custo', tr: 'Maliyet Fişinde malzeme tanımlanmadı' })}
                                        </div>
                                    ) : (
                                        <table className="w-full text-[12px] border-collapse rounded-lg overflow-hidden border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-dk-bg text-slate-600 dark:text-dk-text-soft border-b border-slate-200 dark:border-dk-border text-[10px] uppercase tracking-wider text-left">
                                                    <th className="py-3 px-3 font-bold">{tx(lang, { fr: 'Article', ar: 'الخامة', en: 'Article', es: 'Artículo', pt: 'Artigo', tr: 'Malzeme' })}</th>
                                                    <th className="py-3 px-3 font-bold">{tx(lang, { fr: 'Besoin', ar: 'الاحتياج', en: 'Need', es: 'Necesidad', pt: 'Necessidade', tr: 'İhtiyaç' })}</th>
                                                    <th className="py-3 px-3 font-bold">{tx(lang, { fr: 'Stock', ar: 'المخزون', en: 'Stock', es: 'Stock', pt: 'Estoque', tr: 'Stok' })}</th>
                                                    <th className="py-3 px-3 font-bold text-center w-24">{tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum' })}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {requiredMaterials.map((mat, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                                                        <td className="py-3 px-3 font-semibold text-slate-800 dark:text-dk-text">
                                                            {mat.name}
                                                            <span className="text-[9px] text-slate-400 dark:text-dk-muted font-medium block">{mat.fournisseur || '-'}</span>
                                                        </td>
                                                        <td className="py-3 px-3">
                                                            <span className="font-bold text-indigo-600 dark:text-dk-accent-text">{mat.neededForProduction}</span>
                                                            <span className="text-[9px] text-slate-400 dark:text-dk-muted uppercase ml-1">{mat.unit}</span>
                                                        </td>
                                                        <td className="py-3 px-3">
                                                            <span className={`font-bold ${mat.isSufficient ? 'text-emerald-600' : 'text-rose-600'}`}>{mat.stockActuel}</span>
                                                            <span className="text-[9px] text-slate-400 dark:text-dk-muted uppercase ml-1">{mat.unit}</span>
                                                        </td>
                                                        <td className="py-3 px-3 text-center">
                                                            {mat.isSufficient ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200">
                                                                    <CheckCircle2 className="w-3 h-3" /> {tx(lang, { fr: 'OK', ar: 'متوفر', en: 'OK', es: 'OK', pt: 'OK', tr: 'Tamam' })}
                                                                 </span>
                                                             ) : (
                                                                 <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 rounded text-[10px] font-bold border border-rose-200">
                                                                     <AlertCircle className="w-3 h-3" /> {tx(lang, { fr: 'Rupture', ar: 'نفاد', en: 'Out of Stock', es: 'Agotado', pt: 'Esgotado', tr: 'Stok Yok' })}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* PUBLISH FOOTER */}
                            {!selectedModel.isPublishedToLibrary && (
                                <div className="flex justify-end pb-4">
                                    <button
                                        onClick={() => handleSaveCoupe(true)}
                                        className={`${isMobile ? 'h-12 w-full' : 'h-10 px-5'} bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-2`}
                                    >
                                        <Send className="w-4 h-4" />
                                        {tx(lang, { fr: 'Valider & Publier', ar: 'تحقق وانشر', en: 'Validate & Publish', es: 'Validar y Publicar', pt: 'Validar e Publicar', tr: 'Onayla ve Yayınla' })}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        viewMode === 'board' ? (
                            <BoardView
                                models={filteredModels}
                                onOpen={openModel}
                                onDragStart={setDraggedModel}
                                onDragEnd={() => { setDraggedModel(null); setDragOverColumn(null); }}
                                draggedModel={draggedModel}
                                dragOverColumn={dragOverColumn}
                                setDragOverColumn={setDragOverColumn}
                                onDrop={handleDropOnColumn}
                                getProgress={getProgress}
                                onQuickAction={(modelId, x, y) => setQuickActionMenu({ modelId, x, y })}
                            />
                        ) : viewMode === 'calendar' ? (
                            <CalendarView models={filteredModels} onOpen={openModel} getProgress={getProgress} />
                        ) : viewMode === 'stats' ? (
                            <StatsView models={filteredModels} statusMap={STATUS_MAP} />
                        ) : (
                            <EmptyDashboard
                                models={filteredModels}
                                statusMap={STATUS_MAP}
                                prepCount={prepCount}
                                activeCount={activeCount}
                                valCount={valCount}
                                getProgress={getProgress}
                                onNew={handleNewModel}
                                onOpen={openModel}
                            />
                        )
                    )}
                </div>
            </div>

            {/* DELETE CONFIRMATION */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/20 backdrop-blur-[2px]" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-white dark:bg-dk-surface rounded-xl shadow-xl border border-slate-200 dark:border-dk-border p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                                <Trash2 className="w-5 h-5 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-dk-text">{tx(lang, { fr: "Supprimer l'ordre ?", ar: 'حذف الأمر؟', en: 'Delete order?', es: '¿Eliminar orden?', pt: 'Excluir ordem?', tr: 'Emir silinsin mi?' })}</h3>
                                <p className="text-[11px] text-slate-500 dark:text-dk-muted mt-0.5">{tx(lang, { fr: 'Cette action est définitive.', ar: 'هذا الإجراء نهائي.', en: 'This action is irreversible.', es: 'Esta acción es definitiva.', pt: 'Esta ação é definitiva.', tr: 'Bu işlem geri alınamaz.' })}</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-5">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="h-9 px-4 rounded-lg text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 transition-colors"
                            >
                                {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDeleteOrder(deleteConfirm)}
                                className="h-9 px-4 rounded-lg text-[12px] font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
                            >
                                {tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOAST */}
            {toastMessage && (
                <div
                    className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-4 py-2.5 rounded-lg shadow-lg border bg-white dark:bg-dk-surface border-slate-100 dark:border-dk-border"
                    style={{ animation: 'coupe-toast-in 200ms ease-out' }}
                >
                    <div className={`p-0.5 rounded-full ${toastMessage.type === 'success' ? 'text-emerald-600' : toastMessage.type === 'error' ? 'text-red-600' : 'text-blue-600'}`}>
                        {toastMessage.type === 'success' ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    </div>
                    <span className="text-[12px] font-semibold text-slate-800 dark:text-dk-text">{toastMessage.text}</span>
                </div>
            )}

            {/* QUICK ACTION MENU */}
            {quickActionMenu && createPortal(
                <div
                    className="fixed inset-0 z-[80]"
                    onClick={() => setQuickActionMenu(null)}
                >
                    <div
                        className="absolute bg-white dark:bg-dk-surface rounded-lg shadow-xl border border-slate-200 dark:border-dk-border w-52 py-1.5 text-[12px] text-slate-700 dark:text-dk-text-soft font-medium"
                        style={{ top: quickActionMenu.y, left: quickActionMenu.x }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => {
                                const m = models.find(x => x.id === quickActionMenu.modelId);
                                if (m) { openModel(m); }
                                setQuickActionMenu(null);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-2"
                        >
                                                            <Edit3 className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Ouvrir', ar: 'فتح', en: 'Open', es: 'Abrir', pt: 'Abrir', tr: 'Aç' })}
                        </button>
                        <button
                            onClick={() => {
                                const m = models.find(x => x.id === quickActionMenu.modelId);
                                if (m) handleDuplicate(m);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-2"
                        >
                                                            <Copy className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Dupliquer', ar: 'تكرار', en: 'Duplicate', es: 'Duplicar', pt: 'Duplicar', tr: 'Kopyala' })}
                        </button>
                        <button
                            onClick={() => {
                                const m = models.find(x => x.id === quickActionMenu.modelId);
                                if (m) { onOpenInAtelier && onOpenInAtelier(m); }
                                setQuickActionMenu(null);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-2"
                        >
                                                            <Layers className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Méthodes', ar: 'الطرق', en: 'Methods', es: 'Métodos', pt: 'Métodos', tr: 'Yöntemler' })}
                        </button>
                        <div className="h-px bg-slate-100 dark:bg-dk-elevated my-1" />
                        <button
                            onClick={() => {
                                setDeleteConfirm(quickActionMenu.modelId);
                                setQuickActionMenu(null);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2"
                        >
                                                            <Trash2 className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' })}
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* Injected keyframes */}
            <style>{`
                @keyframes coupe-toast-in {
                    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes coupe-fade-in {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes coupe-scale-in {
                    from { opacity: 0; transform: scale(0.96); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}

/* ─────── Board View (Kanban) ─────── */
function BoardView({
    models, onOpen, onDragStart, onDragEnd, draggedModel, dragOverColumn, setDragOverColumn, onDrop, getProgress, onQuickAction
}: {
    models: ModelData[];
    onOpen: (m: ModelData) => void;
    onDragStart: (id: string) => void;
    onDragEnd: () => void;
    draggedModel: string | null;
    dragOverColumn: string | null;
    setDragOverColumn: (s: string | null) => void;
    onDrop: (status: string) => void;
    getProgress: (m: ModelData) => number;
    onQuickAction: (modelId: string, x: number, y: number) => void;
}) {
    const { lang } = useLang();
    const columns = [
        { key: 'EN_PREPARATION', label: tx(lang, { fr: 'Préparation', ar: 'تحضير', en: 'Preparation', es: 'Preparación', pt: 'Preparação', tr: 'Hazırlık' }), color: 'border-slate-300', bg: 'bg-slate-50 dark:bg-dk-bg', icon: Clock, textColor: 'text-slate-700 dark:text-dk-text-soft', cardBorder: 'hover:border-slate-300', progressColor: 'bg-slate-400' },
        { key: 'EN_COURS', label: tx(lang, { fr: 'En Cours', ar: 'قيد التنفيذ', en: 'In Progress', es: 'En Curso', pt: 'Em Andamento', tr: 'Devam Ediyor' }), color: 'border-blue-300', bg: 'bg-blue-50', icon: PlayCircle, textColor: 'text-blue-700', cardBorder: 'hover:border-blue-300', progressColor: 'bg-blue-500' },
        { key: 'SOUS_TRAITANCE', label: tx(lang, { fr: 'Extériorisé', ar: 'مقاول خارجي', en: 'Subcontracted', es: 'Subcontratado', pt: 'Terceirizado', tr: 'Taşeron' }), color: 'border-purple-300', bg: 'bg-purple-50', icon: Truck, textColor: 'text-purple-700', cardBorder: 'hover:border-purple-300', progressColor: 'bg-purple-500' },
        { key: 'VALIDE', label: tx(lang, { fr: 'Validé', ar: 'تم التحقق', en: 'Validated', es: 'Validado', pt: 'Validado', tr: 'Onaylandı' }), color: 'border-emerald-300', bg: 'bg-emerald-50', icon: CheckCircle, textColor: 'text-emerald-700', cardBorder: 'hover:border-emerald-300', progressColor: 'bg-emerald-500' },
    ];

    return (
        <div className="h-full overflow-x-auto overflow-y-hidden bg-slate-50 dark:bg-dk-bg">
            <div className="h-full flex gap-3 p-4 min-w-max">
                {columns.map(col => {
                    const colModels = models.filter(m => (m.ordreCoupe?.status || 'EN_PREPARATION') === col.key);
                    const Icon = col.icon;
                    const isDragOver = dragOverColumn === col.key;
                    return (
                        <div
                            key={col.key}
                            className={`w-72 shrink-0 flex flex-col bg-white dark:bg-dk-surface rounded-xl border-2 transition-all ${
                                isDragOver ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200 dark:border-dk-border'
                            }`}
                            onDragOver={(e) => { e.preventDefault(); setDragOverColumn(col.key); }}
                            onDragLeave={() => setDragOverColumn(null)}
                            onDrop={() => onDrop(col.key)}
                        >
                            <div className={`px-3 py-2.5 border-b border-slate-100 dark:border-dk-border ${col.bg} flex items-center justify-between rounded-t-xl`}>
                                <div className="flex items-center gap-2">
                                    <Icon className={`w-3.5 h-3.5 ${col.textColor}`} />
                                    <h3 className={`text-[12px] font-bold uppercase tracking-wide ${col.textColor}`}>{col.label}</h3>
                                </div>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${col.textColor} bg-white dark:bg-dk-surface`}>{colModels.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                {colModels.map(m => {
                                    const qte = m.ordreCoupe?.qteTotale || m.meta_data?.quantity || 0;
                                    const ref = m.ordreCoupe?.refModele || m.meta_data?.reference || '';
                                    const progress = getProgress(m);
                                    return (
                                        <div
                                            key={m.id}
                                            draggable
                                            onDragStart={() => onDragStart(m.id)}
                                            onDragEnd={onDragEnd}
                                            onClick={() => onOpen(m)}
                                            className={`bg-white dark:bg-dk-surface border rounded-xl p-3 cursor-pointer transition-all duration-200 group ${
                                                draggedModel === m.id
                                                    ? 'opacity-40 scale-95 border-slate-300'
                                                    : `border-slate-200 dark:border-dk-border hover:shadow-lg hover:shadow-slate-200/50 ${col.cardBorder}`
                                            }`}
                                        >
                                            {/* Thumbnail */}
                                            <div className="w-full h-28 rounded-lg overflow-hidden bg-slate-100 dark:bg-dk-elevated mb-2.5 relative">
                                                {m.image || m.images?.front ? (
                                                    <img src={m.image || m.images?.front} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                                                        <Scissors className="w-8 h-8 text-slate-200" />
                                                    </div>
                                                )}
                                                {/* Quick action overlay */}
                                                <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onQuickAction(m.id, e.clientX, e.clientY); }}
                                                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-dk-surface/90 backdrop-blur-sm text-slate-500 hover:text-slate-800 shadow-sm"
                                                    >
                                                        <MoreVertical className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                {/* Draft badge */}
                                                {m.isPublishedToLibrary === false && (
                                                    <div className="absolute top-1.5 left-1.5">
                                                        <span className="px-1.5 py-0.5 text-[8px] font-bold uppercase bg-amber-400 text-white rounded-md shadow-sm">{tx(lang, { fr: 'Draft', ar: 'مسودة', en: 'Draft', es: 'Borrador', pt: 'Rascunho', tr: 'Taslak' })}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Content */}
                                            <div className="space-y-1.5">
                                                <h4 className="text-[12px] font-bold text-slate-800 dark:text-dk-text truncate leading-tight">
                                                    {m.meta_data?.nom_modele}
                                                </h4>
                                                <p className="text-[10px] text-slate-400 dark:text-dk-muted font-medium truncate">{ref || tx(lang, { fr: 'Référence inconnue', ar: 'مرجع غير معروف', en: 'Unknown reference', es: 'Referencia desconocida', pt: 'Referência desconhecida', tr: 'Bilinmeyen referans' })}</p>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-slate-600 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-bg px-1.5 py-0.5 rounded">{qte > 0 ? `${qte} pcs` : '—'}</span>
                                                    {m.isPublishedToLibrary !== false && (
                                                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Progress */}
                                            <div className="mt-2.5">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">{progress}%</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${col.progressColor}`}
                                                        style={{ width: `${progress}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {colModels.length === 0 && (
                                                                    <div className="text-center py-6 text-[11px] text-slate-400 dark:text-dk-muted italic">
                                                                        {tx(lang, { fr: 'Aucun ordre', ar: 'لا يوجد أمر', en: 'No orders', es: 'Ninguna orden', pt: 'Nenhuma ordem', tr: 'Emir yok' })}
                                                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ─────── Calendar View ─────── */
function CalendarView({ models, onOpen, getProgress }: {
    models: ModelData[];
    onOpen: (m: ModelData) => void;
    getProgress: (m: ModelData) => number;
}) {
    const { lang } = useLang();
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const monthName = currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
        days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(i);
    }

    const getOrdersForDay = (day: number) => {
        return models.filter(m => {
            const dateStr = m.meta_data?.date_creation;
            if (!dateStr) return false;
            const d = new Date(dateStr);
            return d.getDate() === day && d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
        });
    };

    const statusDotColors: Record<string, string> = {
        'EN_PREPARATION': 'bg-slate-400',
        'EN_COURS': 'bg-blue-500',
        'SOUS_TRAITANCE': 'bg-purple-500',
        'VALIDE': 'bg-emerald-500',
        'REJETE': 'bg-rose-500',
    };

    const prev = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    const next = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between">
                    <h3 className="text-[14px] font-semibold text-slate-800 dark:text-dk-text capitalize">{monthName}</h3>
                    <div className="flex items-center gap-1">
                        <button onClick={prev} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-600 dark:text-dk-text-soft">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button onClick={() => setCurrentMonth(new Date())} className="h-8 px-3 text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 rounded-md">
                            {tx(lang, { fr: "Aujourd'hui", ar: 'اليوم', en: 'Today', es: 'Hoy', pt: 'Hoje', tr: 'Bugün' })}
                        </button>
                        <button onClick={next} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-600 dark:text-dk-text-soft">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-7 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg">
                    {(() => {
                        const dayNames: Record<string, string[]> = {
                            fr: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
                            ar: ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
                            en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                            es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
                            pt: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
                            tr: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
                        };
                        return (dayNames[lang] || dayNames.fr);
                    })().map(d => (
                        <div key={d} className="py-2 text-center text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide">{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {days.map((day, idx) => {
                        if (day === null) {
                            return <div key={idx} className="h-24 border-r border-b border-slate-100 dark:border-dk-border bg-slate-50/30" />;
                        }
                        const dayModels = getOrdersForDay(day);
                        const isToday = day === new Date().getDate() &&
                            currentMonth.getMonth() === new Date().getMonth() &&
                            currentMonth.getFullYear() === new Date().getFullYear();
                        return (
                            <div key={idx} className={`h-28 border-r border-b border-slate-100 dark:border-dk-border p-1.5 overflow-y-auto transition-colors ${isToday ? 'bg-indigo-50 dark:bg-dk-accent/20/40' : 'bg-white dark:bg-dk-surface hover:bg-slate-50/50'}`}>
                                <div className={`text-[11px] font-bold mb-1 flex items-center justify-between ${isToday ? 'text-indigo-600 dark:text-dk-accent-text' : 'text-slate-500 dark:text-dk-muted'}`}>
                                    <span>{day}</span>
                                    {isToday && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                                </div>
                                <div className="space-y-1">
                                    {dayModels.slice(0, 3).map(m => {
                                        const st = m.ordreCoupe?.status || 'EN_PREPARATION';
                                        return (
                                            <button
                                                key={m.id}
                                                onClick={() => onOpen(m)}
                                                className="w-full text-left px-1.5 py-1 rounded-md text-[10px] font-semibold bg-white border border-slate-200 dark:border-dk-border text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 dark:bg-dk-accent/20 hover:text-indigo-700 dark:text-dk-accent-text truncate transition-all flex items-center gap-1"
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotColors[st] || 'bg-slate-400'}`} />
                                                <span className="truncate">{m.meta_data?.nom_modele}</span>
                                            </button>
                                        );
                                    })}
                                    {dayModels.length > 3 && (
                                        <div className="text-[9px] text-indigo-500 font-semibold px-1">+{dayModels.length - 3} {tx(lang, { fr: 'de plus', ar: 'أخرى', en: 'more', es: 'más', pt: 'mais', tr: 'daha fazla' })}</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/* ─────── Stats View ─────── */
function StatsView({ models, statusMap }: { models: ModelData[]; statusMap: any }) {
    const { lang } = useLang();
    const stats = useMemo(() => {
        const byStatus: Record<string, number> = {};
        const qtyByStatus: Record<string, number> = {};
        let totalQty = 0;
        let totalDrafts = 0;
        let totalPublished = 0;
        let totalWaste = 0;
        let countWaste = 0;
        models.forEach(m => {
            const st = m.ordreCoupe?.status || 'EN_PREPARATION';
            byStatus[st] = (byStatus[st] || 0) + 1;
            const qte = m.ordreCoupe?.qteTotale || m.meta_data?.quantity || 0;
            qtyByStatus[st] = (qtyByStatus[st] || 0) + qte;
            totalQty += qte;
            if (m.isPublishedToLibrary === false) totalDrafts++;
            else totalPublished++;
            if (m.ordreCoupe?.consommation && m.ordreCoupe?.longueurMatelas) {
                const theoretical = m.ordreCoupe.longueurMatelas * (m.ordreCoupe.nbrFeuilles || 1) * (m.ordreCoupe.nbrMatelas || 1);
                const real = m.ordreCoupe.consommation * qte;
                if (theoretical > 0) {
                    totalWaste += ((theoretical - real) / theoretical) * 100;
                    countWaste++;
                }
            }
        });
        const avgWaste = countWaste > 0 ? (totalWaste / countWaste).toFixed(1) : '0';
        return { byStatus, qtyByStatus, totalQty, totalDrafts, totalPublished, avgWaste: Number(avgWaste) };
    }, [models]);

    const statusColors: Record<string, string> = {
        'EN_PREPARATION': 'bg-slate-400',
        'EN_COURS': 'bg-blue-500',
        'SOUS_TRAITANCE': 'bg-purple-500',
        'VALIDE': 'bg-emerald-500',
        'REJETE': 'bg-rose-500',
    };

    const maxCount = Math.max(...Object.values(stats.byStatus), 1);

    // Donut chart data
    const donutTotal = models.length || 1;
    const donutSegments = Object.entries(statusMap).map(([key, config]: [string, any]) => ({
        key,
        label: config.label,
        count: stats.byStatus[key] || 0,
        color: statusColors[key] || 'bg-slate-400',
        pct: ((stats.byStatus[key] || 0) / donutTotal) * 100,
    }));

    let cumulativePct = 0;
    const conicGradient = donutSegments.map(s => {
        const start = cumulativePct;
        cumulativePct += s.pct;
        const colorVar = s.key === 'EN_PREPARATION' ? '#94a3b8' : s.key === 'EN_COURS' ? '#3b82f6' : s.key === 'SOUS_TRAITANCE' ? '#a855f7' : s.key === 'VALIDE' ? '#10b981' : '#f43f5e';
        return `${colorVar} ${start}% ${cumulativePct}%`;
    }).join(', ');

    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
            {/* Top stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label={tx(lang, { fr: 'Total Ordres', ar: 'إجمالي الأوامر', en: 'Total Orders', es: 'Total Órdenes', pt: 'Total Ordens', tr: 'Toplam Emirler' })} value={models.length} icon={Layers} color="bg-slate-900" />
                <StatCard label={tx(lang, { fr: 'Brouillons', ar: 'مسودات', en: 'Drafts', es: 'Borradores', pt: 'Rascunhos', tr: 'Taslaklar' })} value={stats.totalDrafts} icon={FileText} color="bg-amber-500" />
                <StatCard label={tx(lang, { fr: 'Publiés', ar: 'منشور', en: 'Published', es: 'Publicados', pt: 'Publicados', tr: 'Yayınlanan' })} value={stats.totalPublished} icon={CheckCircle2} color="bg-emerald-500" />
                <StatCard label={tx(lang, { fr: 'Total Pièces', ar: 'إجمالي القطع', en: 'Total Pieces', es: 'Total Piezas', pt: 'Total Peças', tr: 'Toplam Adet' })} value={stats.totalQty} icon={PackageSearch} color="bg-indigo-500" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Donut chart */}
                <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-4 md:p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Target className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                        <h3 className="text-[14px] font-semibold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Répartition', ar: 'التوزيع', en: 'Distribution', es: 'Distribución', pt: 'Distribuição', tr: 'Dağılım' })}</h3>
                    </div>
                    <div className="flex items-center justify-center gap-6">
                        <div
                            className="w-32 h-32 rounded-full relative flex items-center justify-center"
                            style={{ background: `conic-gradient(${conicGradient || '#e2e8f0 0% 100%'})` }}
                        >
                            <div className="w-20 h-20 bg-white dark:bg-dk-surface rounded-full flex items-center justify-center flex-col">
                                <span className="text-xl font-bold text-slate-800 dark:text-dk-text">{models.length}</span>
                                <span className="text-[9px] text-slate-400 dark:text-dk-muted font-bold uppercase">{tx(lang, { fr: 'Ordres', ar: 'أوامر', en: 'Orders', es: 'Órdenes', pt: 'Ordens', tr: 'Emirler' })}</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {donutSegments.filter(s => s.count > 0).map(s => (
                                <div key={s.key} className="flex items-center gap-2">
                                    <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                                    <span className="text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft w-24">{s.label}</span>
                                    <span className="text-[11px] font-bold text-slate-800 dark:text-dk-text">{s.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Avg waste + Production qty */}
                <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-4 md:p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <h3 className="text-[14px] font-semibold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Performance', ar: 'الأداء', en: 'Performance', es: 'Rendimiento', pt: 'Desempenho', tr: 'Performans' })}</h3>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-muted">{tx(lang, { fr: 'Taux de chute moyen', ar: 'متوسط نسبة الفاقد', en: 'Avg waste rate', es: 'Tasa de desperdicio media', pt: 'Taxa de desperdício média', tr: 'Ort. fire oranı' })}</span>
                                <span className={`text-[13px] font-bold ${stats.avgWaste > 10 ? 'text-rose-600' : stats.avgWaste > 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                    {stats.avgWaste}%
                                </span>
                            </div>
                            <div className="h-2 bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${stats.avgWaste > 10 ? 'bg-rose-500' : stats.avgWaste > 5 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${Math.min(stats.avgWaste * 5, 100)}%` }}
                                />
                            </div>
                        </div>

                        {/* Qty by status */}
                        <div>
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-muted block mb-2">{tx(lang, { fr: 'Production par statut', ar: 'الإنتاج حسب الحالة', en: 'Production by status', es: 'Producción por estado', pt: 'Produção por status', tr: 'Duruma göre üretim' })}</span>
                            <div className="space-y-2">
                                {Object.entries(stats.qtyByStatus).map(([key, qty]) => {
                                    const maxQty = Math.max(...Object.values(stats.qtyByStatus), 1);
                                    return (
                                        <div key={key} className="flex items-center gap-2">
                                            <span className="text-[10px] font-semibold text-slate-500 dark:text-dk-muted w-16 truncate">{(statusMap[key] as any)?.label || key}</span>
                                            <div className="flex-1 h-2 bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${statusColors[key] || 'bg-slate-400'}`}
                                                    style={{ width: `${((qty as number) / maxQty) * 100}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-dk-text-soft w-12 text-right">{(qty as number).toLocaleString()}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed status bars */}
            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-4 md:p-6">
                <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                    <h3 className="text-[14px] font-semibold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Détail par Statut', ar: 'تفاصيل حسب الحالة', en: 'Detail by Status', es: 'Detalle por Estado', pt: 'Detalhe por Status', tr: 'Duruma Göre Detay' })}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    {Object.entries(statusMap).map(([key, config]: [string, any]) => {
                        const count = stats.byStatus[key] || 0;
                        const pct = models.length > 0 ? ((count / models.length) * 100).toFixed(0) : '0';
                        const Icon = config.icon;
                        return (
                            <div key={key} className="bg-slate-50 dark:bg-dk-bg rounded-lg p-3 text-center border border-slate-100 dark:border-dk-border">
                                <div className={`w-8 h-8 ${statusColors[key]} rounded-lg flex items-center justify-center mx-auto mb-2`}>
                                    <Icon className="w-4 h-4 text-white" />
                                </div>
                                <div className="text-lg font-bold text-slate-800 dark:text-dk-text">{count}</div>
                                <div className="text-[10px] font-semibold text-slate-500 dark:text-dk-muted mt-0.5">{config.label}</div>
                                <div className="text-[9px] font-bold text-slate-400 dark:text-dk-muted mt-0.5">{pct}%</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon: Icon, color, delay }: {
    label: string;
    value: number;
    icon: any;
    color: string;
    delay?: number;
}) {
    return (
        <div
            className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-4 hover:shadow-md transition-all duration-200 hover:border-slate-300 group"
            style={{ animation: 'coupe-fade-in 300ms ease-out forwards', animationDelay: `${delay || 0}ms`, opacity: 0 }}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">{label}</span>
                <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <Icon className="w-4 h-4 text-white" />
                </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-dk-text tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        </div>
    );
}

/* ─────── Empty Dashboard (when no model selected) ─────── */
function EmptyDashboard({
    models, statusMap, prepCount, activeCount, valCount, getProgress, onNew, onOpen,
}: {
    models: ModelData[];
    statusMap: any;
    prepCount: number;
    activeCount: number;
    valCount: number;
    getProgress: (m: ModelData) => number;
    onNew: () => void;
    onOpen: (m: ModelData) => void;
}) {
    const { lang } = useLang();
    const recent = [...models].sort((a, b) => {
        const da = new Date(a.meta_data?.date_creation || 0).getTime();
        const db = new Date(b.meta_data?.date_creation || 0).getTime();
        return db - da;
    }).slice(0, 6);

    const totalQty = models.reduce((sum, m) => sum + (m.ordreCoupe?.qteTotale || m.meta_data?.quantity || 0), 0);
    const drafts = models.filter(m => m.isPublishedToLibrary === false).length;

    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
            {/* Hero */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 md:p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/8 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-500/8 rounded-full blur-3xl" />
                <div className="absolute top-1/2 right-1/4 w-40 h-40 bg-amber-500/5 rounded-full blur-2xl" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 bg-rose-500/20 rounded-lg flex items-center justify-center">
                                <Scissors className="w-4 h-4 text-rose-400" />
                            </div>
                            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">{tx(lang, { fr: 'Atelier Coupe', ar: 'ورشة القص', en: 'Cutting Workshop', es: 'Taller de Corte', pt: 'Oficina de Corte', tr: 'Kesim Atölyesi' })}</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">{tx(lang, { fr: 'Bienvenue à La Coupe', ar: 'مرحبًا بك في قسم القص', en: 'Welcome to Cutting Dept.', es: 'Bienvenido al Departamento de Corte', pt: 'Bem-vindo ao Corte', tr: 'Kesim Departmanına Hoş Geldiniz' })}</h1>
                        <p className="text-slate-400 dark:text-dk-muted text-[13px] mt-1.5 max-w-md leading-relaxed">
                            {tx(lang, { fr: 'Gérez vos ordres de fabrication, suivez la production et optimisez vos processus de coupe textile.', ar: 'إدارة أوامر التصنيع الخاصة بك، تتبع الإنتاج وتحسين عمليات القص النسيجي.', en: 'Manage your production orders, track production and optimize your textile cutting processes.', es: 'Gestione sus órdenes de fabricación, siga la producción y optimice sus procesos de corte textil.', pt: 'Gerencie suas ordens de fabricação, acompanhe a produção e otimize seus processos de corte têxtil.', tr: 'Üretim emirlerinizi yönetin, üretimi takip edin ve tekstil kesim süreçlerinizi optimize edin.' })}
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                        <button
                            onClick={onNew}
                            className="h-12 px-6 bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-slate-900 dark:text-dk-text text-[13px] font-bold rounded-xl transition-colors inline-flex items-center gap-2 shadow-lg shadow-white/10"
                        >
                            <Plus className="w-4 h-4" strokeWidth={2.5} />
                            {tx(lang, { fr: 'Nouvel Ordre', ar: 'أمر جديد', en: 'New Order', es: 'Nueva Orden', pt: 'Nova Ordem', tr: 'Yeni Emir' })}
                        </button>
                        <p className="text-[10px] text-slate-500 dark:text-dk-muted text-center">{tx(lang, { fr: 'Ou sélectionnez un ordre existant', ar: 'أو اختر أمرًا موجودًا', en: 'Or select an existing order', es: 'O seleccione una orden existente', pt: 'Ou selecione uma ordem existente', tr: 'Veya mevcut bir emir seçin' })}</p>
                    </div>
                </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label={tx(lang, { fr: 'Total Ordres', ar: 'إجمالي الأوامر', en: 'Total Orders', es: 'Total Órdenes', pt: 'Total Ordens', tr: 'Toplam Emirler' })} value={models.length} icon={Layers} color="bg-slate-900" delay={0} />
                <StatCard label={tx(lang, { fr: 'Préparation', ar: 'تحضير', en: 'Preparation', es: 'Preparación', pt: 'Preparação', tr: 'Hazırlık' })} value={prepCount} icon={Clock} color="bg-slate-500" delay={50} />
                <StatCard label={tx(lang, { fr: 'En Cours', ar: 'قيد التنفيذ', en: 'In Progress', es: 'En Curso', pt: 'Em Andamento', tr: 'Devam Ediyor' })} value={activeCount} icon={PlayCircle} color="bg-blue-500" delay={100} />
                <StatCard label={tx(lang, { fr: 'Validés', ar: 'تم التحقق', en: 'Validated', es: 'Validados', pt: 'Validados', tr: 'Onaylanan' })} value={valCount} icon={CheckCircle} color="bg-emerald-500" delay={150} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StatCard label={tx(lang, { fr: 'Total Pièces', ar: 'إجمالي القطع', en: 'Total Pieces', es: 'Total Piezas', pt: 'Total Peças', tr: 'Toplam Adet' })} value={totalQty} icon={PackageSearch} color="bg-indigo-500" delay={200} />
                <StatCard label={tx(lang, { fr: 'Brouillons', ar: 'مسودات', en: 'Drafts', es: 'Borradores', pt: 'Rascunhos', tr: 'Taslaklar' })} value={drafts} icon={FileText} color="bg-amber-500" delay={250} />
                <StatCard label={tx(lang, { fr: 'Statuts', ar: 'الحالات', en: 'Statuses', es: 'Estados', pt: 'Status', tr: 'Durumlar' })} value={Object.keys(statusMap).length} icon={BarChart3} color="bg-purple-500" delay={300} />
            </div>

            {/* Quick guide */}
            <div className="bg-gradient-to-r from-indigo-50 to-rose-50 rounded-xl border border-indigo-100 p-4 md:p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-[13px] font-bold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Guide Rapide', ar: 'دليل سريع', en: 'Quick Guide', es: 'Guía Rápida', pt: 'Guia Rápido', tr: 'Hızlı Rehber' })}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-dk-accent-text">1</span>
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold text-slate-700 dark:text-dk-text-soft">{tx(lang, { fr: 'Créer un ordre', ar: 'إنشاء أمر', en: 'Create an order', es: 'Crear una orden', pt: 'Criar uma ordem', tr: 'Emir oluştur' })}</p>
                            <p className="text-[10px] text-slate-500 dark:text-dk-muted">{tx(lang, { fr: 'Définissez les paramètres de matelas', ar: 'حدد إعدادات المفرشة', en: 'Set layering parameters', es: 'Defina los parámetros de capas', pt: 'Defina os parâmetros de esteiramento', tr: 'Katman parametrelerini ayarlayın' })}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-dk-accent-text">2</span>
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold text-slate-700 dark:text-dk-text-soft">{tx(lang, { fr: 'Répartir tailles/couleurs', ar: 'توزيع المقاسات/الألوان', en: 'Distribute sizes/colors', es: 'Distribuir tallas/colores', pt: 'Distribuir tamanhos/cores', tr: 'Bedenleri/renkleri dağıt' })}</p>
                            <p className="text-[10px] text-slate-500 dark:text-dk-muted">{tx(lang, { fr: 'Remplissez la matrice de production', ar: 'املأ مصفوفة الإنتاج', en: 'Fill the production matrix', es: 'Complete la matriz de producción', pt: 'Preencha a matriz de produção', tr: 'Üretim matrisini doldurun' })}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-dk-accent-text">3</span>
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold text-slate-700 dark:text-dk-text-soft">{tx(lang, { fr: 'Publier & Valider', ar: 'نشر وتحقق', en: 'Publish & Validate', es: 'Publicar y Validar', pt: 'Publicar e Validar', tr: 'Yayınla ve Onayla' })}</p>
                            <p className="text-[10px] text-slate-500 dark:text-dk-muted">{tx(lang, { fr: 'Envoyez vers le Planning', ar: 'أرسل إلى التخطيط', en: 'Send to Planning', es: 'Enviar a Planificación', pt: 'Enviar para Planejamento', tr: 'Planlamaya gönder' })}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent orders */}
            {recent.length > 0 && (
                <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                            <h3 className="text-[14px] font-semibold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Ordres Récents', ar: 'الأوامر الأخيرة', en: 'Recent Orders', es: 'Órdenes Recientes', pt: 'Ordens Recentes', tr: 'Son Emirler' })}</h3>
                        </div>
                        <span className="text-[11px] text-slate-400 dark:text-dk-muted font-medium">{recent.length} {tx(lang, { fr: 'derniers', ar: 'الأخيرة', en: 'latest', es: 'últimos', pt: 'últimos', tr: 'son' })}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                        {recent.map(m => {
                            const st = m.ordreCoupe?.status || 'EN_PREPARATION';
                            const conf = statusMap[st] || statusMap['EN_PREPARATION'];
                            const Icon = conf.icon;
                            const qte = m.ordreCoupe?.qteTotale || m.meta_data?.quantity || 0;
                            const progress = getProgress(m);
                            const ref = m.ordreCoupe?.refModele || '';
                            return (
                                <div
                                    key={m.id}
                                    onClick={() => onOpen(m)}
                                    className="px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 cursor-pointer transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 dark:bg-dk-elevated shrink-0 flex items-center justify-center border border-slate-200 dark:border-dk-border group-hover:border-indigo-200 transition-colors">
                                            {m.image || m.images?.front ? (
                                                <img src={m.image || m.images?.front} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <FileText className="w-4 h-4 text-slate-300 dark:text-dk-muted" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-[12px] font-bold text-slate-800 truncate group-hover:text-indigo-700 dark:text-dk-accent-text transition-colors">{m.meta_data?.nom_modele}</h4>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                {ref && <span className="text-[9px] text-slate-400 dark:text-dk-muted font-medium truncate">{ref}</span>}
                                                {qte > 0 && (
                                                    <>
                                                        <span className="text-slate-300 dark:text-dk-muted text-[7px]">·</span>
                                                        <span className="text-[9px] text-slate-400 dark:text-dk-muted font-medium">{qte} pcs</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2.5">
                                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${
                                                    progress === 100 ? 'bg-emerald-500' : progress > 50 ? 'bg-blue-500' : 'bg-slate-400'
                                                }`}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Icon className="w-3 h-3 text-slate-400 dark:text-dk-muted" />
                                            <span className="text-[9px] font-semibold text-slate-500 dark:text-dk-muted">{conf.label.split(' ')[0]}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Empty state when no models */}
            {models.length === 0 && (
                <div className="bg-white dark:bg-dk-surface rounded-xl border-2 border-dashed border-slate-200 dark:border-dk-border p-10 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200 dark:border-dk-border">
                        <Scissors className="w-8 h-8 text-slate-300 dark:text-dk-muted" />
                    </div>
                    <h3 className="text-[15px] font-bold text-slate-700 dark:text-dk-text-soft">{tx(lang, { fr: 'Aucun ordre de coupe', ar: 'لا يوجد أمر قص', en: 'No cutting order', es: 'Ninguna orden de corte', pt: 'Nenhuma ordem de corte', tr: 'Kesim emri yok' })}</h3>
                    <p className="text-[12px] text-slate-400 dark:text-dk-muted mt-1.5 max-w-sm mx-auto leading-relaxed">
                        {tx(lang, { fr: 'Commencez par créer votre premier ordre de fabrication pour suivre vos productions textile.', ar: 'ابدأ بإنشاء أول أمر تصنيع لك لمتابعة إنتاجاتك النسيجية.', en: 'Start by creating your first production order to track your textile productions.', es: 'Comience creando su primera orden de fabricación para seguir sus producciones textiles.', pt: 'Comece criando sua primeira ordem de fabricação para acompanhar suas produções têxteis.', tr: 'Tekstil üretimlerinizi takip etmek için ilk üretim emrinizi oluşturarak başlayın.' })}
                    </p>
                    <button
                        onClick={onNew}
                        className="mt-5 h-11 px-6 bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-bold rounded-xl transition-colors inline-flex items-center gap-2 shadow-lg shadow-slate-900/20"
                    >
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                        {tx(lang, { fr: 'Créer un ordre', ar: 'إنشاء أمر', en: 'Create order', es: 'Crear orden', pt: 'Criar ordem', tr: 'Emir oluştur' })}
                    </button>
                </div>
            )}
        </div>
    );
}

/* ─────── Shared Input Component ─────── */
function InputField({
    label, unit, type = 'text', step, value, onChange, center,
}: {
    label: string; unit?: string; type?: string; step?: string;
    value: string | number; onChange: (v: string) => void; center?: boolean;
}) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1.5 uppercase tracking-wide">{label}</label>
            <div className="relative">
                <input
                    type={type}
                    step={step}
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    className={`w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg ${center ? 'text-center' : 'pl-3'} pr-${unit ? '12' : '3'} py-3 text-[13px] font-semibold text-slate-800 dark:text-dk-text outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50/50 transition-all min-h-[44px]`}
                    placeholder="0"
                />
                {unit && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 dark:text-dk-muted bg-slate-200 px-1.5 py-0.5 rounded">{unit}</span>
                )}
            </div>
        </div>
    );
}

/* ─────── Header Stats ─────── */
function HeaderStat({ label, value, color }: { label: string; value: number; color?: string }) {
    return (
        <div className="inline-flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${color || 'bg-slate-400'}`} />
            <span className="text-[11px] text-slate-500 dark:text-dk-muted">{label}</span>
            <span className="text-[11px] font-semibold tabular-nums text-slate-700 dark:text-dk-text-soft">{value}</span>
        </div>
    );
}
