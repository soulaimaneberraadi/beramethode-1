import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ModelData, SubcontractOrder, PlanningEvent, SubcontractorProfile } from '../types';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';
import InlineInvoiceList from './InlineInvoiceList';
import { 
  Truck, Plus, Search, Trash2, Edit2, X, Check, 
  AlertCircle, Calendar, DollarSign, Package, 
  ChevronDown, ChevronUp, Loader2, Info, Eye, Layers, Palette,
  Printer, CheckSquare, Clock, ShieldCheck, ClipboardCheck, Send, Copy, Coins,
  Users, Building2, EyeOff, LayoutGrid, FileText, Settings, ArrowRight, Star, ChevronRight
} from 'lucide-react';

interface SousTraitanceProps {
  models: ModelData[];
  settings?: any;
  onNavigate?: (view: string) => void;
  onCreateNewProject?: () => void;
  planningEvents?: PlanningEvent[];
  setPlanningEvents?: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
  onLoadModel?: (model: ModelData) => void;
}

interface SubcontractorGroup {
  id: string;
  group_name: string;
  subcontractor_names: string[];
}

interface BatchInput {
  quantity: number;
  deliveryDate: string;
  notes: string;
  grid: Record<string, Record<string, number>>;
}

const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

export default function SousTraitance({ models, settings, onLoadModel, onNavigate, onCreateNewProject }: SousTraitanceProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'orders' | 'stock' | 'profiles'>('orders');

  // Core Data States
  const [orders, setOrders] = useState<SubcontractOrder[]>([]);
  const [groups, setGroups] = useState<SubcontractorGroup[]>([]);
  const [profiles, setProfiles] = useState<SubcontractorProfile[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab 1 (Orders) States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [subcontractorFilter, setSubcontractorFilter] = useState<string>('ALL');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
    const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [expandedSub, setExpandedSub] = useState<string | null>(null);

  // Modal States
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SubcontractOrder | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<SubcontractOrder | null>(null);
  const [selectedSubcontractorForDetail, setSelectedSubcontractorForDetail] = useState<string | null>(null);
  const [isNewSubModalOpen, setIsNewSubModalOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [formSubcontractorAddress, setFormSubcontractorAddress] = useState('');
  const [formSubcontractorServiceType, setFormSubcontractorServiceType] = useState<'COUPE' | 'COUTURE' | 'FINITION' | 'CMT' | 'AUTRE'>('CMT');
  const [formSubcontractorPhoto, setFormSubcontractorPhoto] = useState<string>('');
  const [formSubcontractorIf, setFormSubcontractorIf] = useState('');
  const [formSubcontractorRc, setFormSubcontractorRc] = useState('');
  const [formSubcontractorIce, setFormSubcontractorIce] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [formModelId, setFormModelId] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formSubcontractorName, setFormSubcontractorName] = useState('');
  const [formPricePerPiece, setFormPricePerPiece] = useState<number>(0);
  const [formTotalQuantity, setFormTotalQuantity] = useState<number>(0);
  const [formNotes, setFormNotes] = useState('');
  const [formSubcontractorPhone, setFormSubcontractorPhone] = useState('');
  const [formSubcontractorRating, setFormSubcontractorRating] = useState<number>(5);
  const [formSubcontractorAvailabilityDate, setFormSubcontractorAvailabilityDate] = useState('');
  
  const [formTissuStatus, setFormTissuStatus] = useState<'PENDING' | 'SENT'>('PENDING');
  const [formFournituresStatus, setFormFournituresStatus] = useState<'PENDING' | 'DELIVERED'>('PENDING');
  const [formFicheTechniqueSent, setFormFicheTechniqueSent] = useState<boolean>(false);

  const [formQtyAccepted, setFormQtyAccepted] = useState<number>(0);
  const [formQtyToRepair, setFormQtyToRepair] = useState<number>(0);
  const [formQtyRejected, setFormQtyRejected] = useState<number>(0);

  const [formPrestationType, setFormPrestationType] = useState<'CMT' | 'FACON_PURE'>('CMT');
  const [formTissuFournisseur, setFormTissuFournisseur] = useState<'CLIENT' | 'SUBCONTRACTOR'>('CLIENT');
  const [formFournituresFournisseur, setFormFournituresFournisseur] = useState<'CLIENT' | 'SUBCONTRACTOR'>('CLIENT');
  const [formConditionnementFournisseur, setFormConditionnementFournisseur] = useState<'CLIENT' | 'SUBCONTRACTOR'>('CLIENT');
  const [formProtoRequired, setFormProtoRequired] = useState<number>(1);
  const [formProtoStatus, setFormProtoStatus] = useState<'PENDING' | 'APPROVED'>('PENDING');
  const [formPaymentTerms, setFormPaymentTerms] = useState<'AVANCE_RECEPTION' | 'APRES_LIVRAISON' | 'ECHEANCES'>('AVANCE_RECEPTION');
  const [formDefectRateAccepted, setFormDefectRateAccepted] = useState<number>(1.5);
  const [formStitchingDetails, setFormStitchingDetails] = useState<string>('');
  
  const [modalFormTab, setModalFormTab] = useState<'general' | 'logistics' | 'technical'>('general');
  const [batches, setBatches] = useState<BatchInput[]>([{ quantity: 0, deliveryDate: '', notes: '', grid: {} }]);
  const [newColorInput, setNewColorInput] = useState('');

  // Tab 3 (Stock & Invoice Sale) States
  const [selectedModelForSale, setSelectedModelForSale] = useState<ModelData | null>(null);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [saleClient, setSaleClient] = useState('');
  const [saleClientIce, setSaleClientIce] = useState('');
  const [saleClientRc, setSaleClientRc] = useState('');
  const [saleClientAdresse, setSaleClientAdresse] = useState('');
  const [saleClientTel, setSaleClientTel] = useState('');
  const [saleClientEmail, setSaleClientEmail] = useState('');
  const [saleQuantity, setSaleQuantity] = useState<number>(0);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [saleTvaRate, setSaleTvaRate] = useState<number>(20);
  const [saleNotes, setSaleNotes] = useState('');
  const [saleStatus, setSaleStatus] = useState<'BROUILLON' | 'PAYEE' | 'ENVOYEE'>('BROUILLON');
  const [saleInvoiceNumber, setSaleInvoiceNumber] = useState('');

  // Tab 4 (Groups) States
  const [selectedGroup, setSelectedGroup] = useState<SubcontractorGroup | null>(null);
  const [groupFormName, setGroupFormName] = useState('');
  const [groupFormSubs, setGroupFormSubs] = useState<string[]>([]);
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const { lang } = useLang();

  // Fetch all initial data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch Subcontract Orders
      const resOrders = await fetch('/api/subcontract', { credentials: 'include' });
      if (!resOrders.ok) throw new Error(tx(lang,{fr:'Echec du chargement des commandes de sous-traitance',ar:'فشل تحميل طلبيات المقاولة من الباطن',en:'Failed to load subcontract orders',es:'Error al cargar pedidos de subcontratación',pt:'Falha ao carregar encomendas de subcontratação',tr:'Taşeron siparişleri yüklenemedi'}));
      const ordersData = await resOrders.json();
      setOrders(ordersData);

      // Fetch Subcontractor Groups
      const resGroups = await fetch('/api/subcontract/groups', { credentials: 'include' });
      if (!resGroups.ok) throw new Error(tx(lang,{fr:'Echec du chargement des groupes de sous-traitants',ar:'فشل تحميل مجموعات المقاولين من الباطن',en:'Failed to load subcontractor groups',es:'Error al cargar grupos de subcontratistas',pt:'Falha ao carregar grupos de subcontratados',tr:'Taşeron grupları yüklenemedi'}));
      const groupsData = await resGroups.json();
      setGroups(groupsData);

      // Fetch Subcontractor Profiles
      const resProfiles = await fetch('/api/subcontract/profiles', { credentials: 'include' });
      if (resProfiles.ok) {
        setProfiles(await resProfiles.json());
      }

      // Fetch Sales Invoices
      const resInvoices = await fetch('/api/facturation/factures?type=VENTE', { credentials: 'include' });
      if (!resInvoices.ok) throw new Error(tx(lang,{fr:'Echec du chargement des factures',ar:'فشل تحميل الفواتير',en:'Failed to load invoices',es:'Error al cargar facturas',pt:'Falha ao carregar faturas',tr:'Faturalar yüklenemedi'}));
      const invoicesData = await resInvoices.json();
      setInvoices(invoicesData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || tx(lang,{fr:'Une erreur est survenue lors de la récupération des données.',ar:'حدث خطأ أثناء استرجاع البيانات.',en:'An error occurred while fetching data.',es:'Ocurrió un error al recuperar los datos.',pt:'Ocorreu um erro ao recuperar os dados.',tr:'Veriler alınırken bir hata oluştu.'}));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Helper to parse JSON safely
  const parseJsonSafe = (str: any, fallback = {}) => {
    if (!str) return fallback;
    try {
      return typeof str === 'string' ? JSON.parse(str) : str;
    } catch (e) {
      return fallback;
    }
  };

  // Helper to get unique subcontractors
  const subcontractorNames = useMemo(() => {
    const list = new Set<string>();
    orders.forEach(o => {
      if (o.subcontractorName) list.add(o.subcontractorName);
    });
    profiles.forEach(p => {
      if (p.name) list.add(p.name);
    });
    return Array.from(list);
  }, [orders, profiles]);

  const findProfileByName = (name: string | null | undefined): SubcontractorProfile | undefined =>
    name ? profiles.find(p => p.name === name) : undefined;

  // Find subcontractors belonging to a selected group filter
  const groupSubcontractors = useMemo(() => {
    if (groupFilter === 'ALL') return [];
    const grp = groups.find(g => g.id === groupFilter);
    return grp ? grp.subcontractor_names : [];
  }, [groupFilter, groups]);

    // Statistics for Dashboard (Tab 1)
    const stats = useMemo(() => {
      let totalQty = 0;
      let totalDelivered = 0;
      let totalToRepair = 0;
      let totalRejected = 0;
      let activeOrdersCount = 0;
      let pendingFabricCount = 0;
      let pendingSuppliesCount = 0;

      orders.forEach(o => {
        totalQty += o.totalQuantity;
        totalDelivered += o.qtyAccepted || 0;
        totalToRepair += o.qtyToRepair || 0;
        totalRejected += o.qtyRejected || 0;
        if (o.status !== 'COMPLETED') {
          activeOrdersCount++;
        }
        if (o.tissuStatus === 'PENDING') pendingFabricCount++;
        if (o.fournituresStatus === 'PENDING') pendingSuppliesCount++;
      });

      const remainingQty = Math.max(0, totalQty - totalDelivered - totalToRepair - totalRejected);
      const totalQualityCount = totalDelivered + totalToRepair + totalRejected;
      const avgQualityRate = totalQualityCount > 0 
        ? Math.round((totalDelivered / totalQualityCount) * 100)
        : 100;

      return { 
        totalQty, 
        totalDelivered, 
        remainingQty, 
        activeOrdersCount, 
        pendingFabricCount, 
        pendingSuppliesCount,
        avgQualityRate,
        totalOrdersCount: orders.length 
      };
    }, [orders]);

  // Filtered orders (Tab 1)
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = 
        (o.modelName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.clientName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.subcontractorName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.notes || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const matchSub = subcontractorFilter === 'ALL' || o.subcontractorName === subcontractorFilter;
      
      let matchGroup = true;
      if (groupFilter !== 'ALL') {
        matchGroup = groupSubcontractors.includes(o.subcontractorName);
      }

      return matchSearch && matchStatus && matchSub && matchGroup;
    });
  }, [orders, searchQuery, statusFilter, subcontractorFilter, groupFilter, groupSubcontractors]);

  // Tab 2: Group orders by subcontractor and calculate stats
  const subcontractorStats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const map: Record<string, {
      name: string;
      phone: string;
      orderCount: number;
      totalQty: number;
      deliveredQty: number;
      toRepairQty: number;
      rejectedQty: number;
      remainingQty: number;
      models: Set<string>;
      ratings: number[];
      availabilityDate: string;
      totalValue: number;
      overdueOrders: number;
    }> = {};

    orders.forEach(o => {
      const sub = o.subcontractorName;
      if (!map[sub]) {
        map[sub] = {
          name: sub,
          phone: o.subcontractorPhone || tx(lang,{fr:'Non spécifié',ar:'غير محدد',en:'Not specified',es:'No especificado',pt:'Não especificado',tr:'Belirtilmemiş'}),
          orderCount: 0,
          totalQty: 0,
          deliveredQty: 0,
          toRepairQty: 0,
          rejectedQty: 0,
          remainingQty: 0,
          models: new Set<string>(),
          ratings: [],
          availabilityDate: '',
          totalValue: 0,
          overdueOrders: 0
        };
      }
      const s = map[sub];
      s.orderCount++;
      s.totalQty += o.totalQuantity;
      s.deliveredQty += o.qtyAccepted || 0;
      s.toRepairQty += o.qtyToRepair || 0;
      s.rejectedQty += o.qtyRejected || 0;
      s.remainingQty += Math.max(0, o.totalQuantity - (o.qtyAccepted || 0) - (o.qtyToRepair || 0) - (o.qtyRejected || 0));
      if (o.modelName) s.models.add(o.modelName);
      if (o.subcontractorRating) s.ratings.push(o.subcontractorRating);
      if (o.subcontractorAvailabilityDate) s.availabilityDate = o.subcontractorAvailabilityDate;
      s.totalValue += (o.pricePerPiece || 0) * o.totalQuantity;
      if (o.status !== 'COMPLETED' && o.deliveryDate && o.deliveryDate < todayStr) s.overdueOrders++;
    });

    let list = Object.values(map).map(item => ({
      ...item,
      modelsArr: Array.from(item.models),
      avgRating: item.ratings.length > 0
        ? Math.round((item.ratings.reduce((a, b) => a + b, 0) / item.ratings.length) * 10) / 10
        : 0,
      hasOverdue: item.overdueOrders > 0
    }));

    // Apply group filter if active
    if (groupFilter !== 'ALL') {
      list = list.filter(item => groupSubcontractors.includes(item.name));
    }

    // Sort: overdue first, then by order count desc
    list.sort((a, b) => (b.hasOverdue ? 1 : 0) - (a.hasOverdue ? 1 : 0) || b.orderCount - a.orderCount);

    return list;
  }, [orders, groupFilter, groupSubcontractors]);

  // Tab 2: KPI summary for supplier tracking
  const subcontractorKpis = useMemo(() => {
    const totalOrders = subcontractorStats.reduce((a, s) => a + s.orderCount, 0);
    const delivered = subcontractorStats.reduce((a, s) => a + s.deliveredQty, 0);
    const remaining = subcontractorStats.reduce((a, s) => a + s.remainingQty, 0);
    const overdueCount = subcontractorStats.filter(s => s.hasOverdue).length;
    const rated = subcontractorStats.filter(s => s.avgRating > 0);
    const avgRating = rated.length > 0 ? (rated.reduce((a, s) => a + s.avgRating, 0) / rated.length) : 0;
    return {
      totalSubs: subcontractorStats.length,
      totalOrders,
      delivered,
      remaining,
      overdueCount,
      avgRating
    };
  }, [subcontractorStats]);

  // Helper: get all orders belonging to one subcontractor (for detail panel)
  const getSubOrders = (name: string) =>
    orders.filter(o => o.subcontractorName === name);

  const orderStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return tx(lang,{fr:'Livrée',ar:'مُسلَّم',en:'Delivered',es:'Entregado',pt:'Entregue',tr:'Teslim Edildi'});
      case 'LIVRE_PARTIEL':
        return tx(lang,{fr:'Livraison partielle',ar:'تسليم جزئي',en:'Partial delivery',es:'Entrega parcial',pt:'Entrega parcial',tr:'Kısmi teslimat'});
      case 'IN_COUTURE':
        return tx(lang,{fr:'En couture',ar:'في الخياطة',en:'In sewing',es:'En costura',pt:'Em costura',tr:'Dikişte'});
      case 'IN_FINITION':
        return tx(lang,{fr:'En finition',ar:'في التشطيب',en:'In finishing',es:'En acabado',pt:'Em acabamento',tr:'Finişte'});
      case 'IN_COUPE':
        return tx(lang,{fr:'En coupe',ar:'في القص',en:'In cutting',es:'En corte',pt:'Em corte',tr:'Kesimde'});
      default:
        return tx(lang,{fr:'En attente',ar:'قيد الانتظار',en:'Pending',es:'Pendiente',pt:'Pendente',tr:'Bekliyor'});
    }
  };

  // Tab 3: Calculate finished goods stock and sold quantities for each model
  const modelStockStats = useMemo(() => {
    const list: Array<{
      model: ModelData;
      producedQty: number;
      soldQty: number;
      remainingStock: number;
      price: number;
      startDate: string;
      status: string;
    }> = [];

    models.forEach(model => {
      // 1. Calculate produced/delivered quantity from subcontract orders
      let produced = 0;
      let oldestDate = '';
      let activeStatus = 'INACTIVE';
      const orderPrices: number[] = [];

      orders.forEach(o => {
        if (o.modelId === model.id) {
          produced += o.qtyAccepted || 0;
          if (!oldestDate || (o.created_at && o.created_at < oldestDate)) {
            oldestDate = o.created_at || '';
          }
          if (o.status !== 'COMPLETED') {
            activeStatus = 'IN_PRODUCTION';
          } else if (activeStatus !== 'IN_PRODUCTION') {
            activeStatus = 'FINISHED';
          }
          if (o.pricePerPiece && o.pricePerPiece > 0) {
            orderPrices.push(o.pricePerPiece);
          }
        }
      });

      // 2. Calculate sold quantity from VENTE invoices
      let sold = 0;
      invoices.forEach(inv => {
        const lignes = inv.lignes || [];
        lignes.forEach((line: any) => {
          if (line.modelId === model.id) {
            sold += line.qte || 0;
          } else if (!line.modelId && line.designation && line.designation.includes(model.meta_data.nom_modele)) {
            // Fallback match by model name
            sold += line.qte || 0;
          }
        });
      });

      const remaining = Math.max(0, produced - sold);

      // Estimate unit price by priority:
      // 1) Subcontract price configured on the model (soustraitance)
      // 2) Average pricePerPiece from the model's subcontract orders
      // 3) Fallback: estimate based on production times
      const subConfigPrice = model.ficheData?.soustraitance?.active ? model.ficheData.soustraitance.prix : 0;
      const avgOrderPrice = orderPrices.length > 0
        ? orderPrices.reduce((a, b) => a + b, 0) / orderPrices.length
        : 0;
      const price = subConfigPrice > 0 ? subConfigPrice : (avgOrderPrice > 0 ? avgOrderPrice : model.meta_data.total_temps * 1.5);

      list.push({
        model,
        producedQty: produced,
        soldQty: sold,
        remainingStock: remaining,
        price: Math.round(price * 100) / 100 || 100,
        startDate: oldestDate ? new Date(oldestDate).toLocaleDateString('fr-FR') : tx(lang,{fr:'Non commencée',ar:'لم تبدأ',en:'Not started',es:'No iniciado',pt:'Não iniciado',tr:'Başlamadı'}),
        status: activeStatus
      });
    });

    return list;
  }, [models, orders, invoices]);

  // Helper to calculate raw material costs vs stitching cost for a model
  const getModelPricing = (model?: ModelData | null) => {
    if (!model) return { baseModelPrice: 0, stitchingPrice: 0 };
    
    // Stitching price from sous-traitance section, or costMinute * total_temps
    const stitchingPrice = model.ficheData?.soustraitance?.prix 
      || (model.meta_data?.total_temps ? Math.round(model.meta_data.total_temps * (settings?.costMinute || 1.5) * 100) / 100 : 0)
      || (model.ficheData?.unitCost ? model.ficheData.unitCost : 0)
      || 0;
      
    // Base material cost: sum qty * unitPrice from materials list
    let baseModelPrice = 0;
    if (model.ficheData?.materials && model.ficheData.materials.length > 0) {
      baseModelPrice = model.ficheData.materials.reduce((acc, mat) => acc + (mat.qty || 0) * (mat.unitPrice || 0), 0);
    }
    
    return {
      baseModelPrice: Math.round(baseModelPrice * 100) / 100,
      stitchingPrice: Math.round(stitchingPrice * 100) / 100
    };
  };

  const selectedModelInForm = useMemo(() => models.find(m => m.id === formModelId), [models, formModelId]);
  const selectedModelPricing = useMemo(() => getModelPricing(selectedModelInForm), [selectedModelInForm, settings]);

  // Open Step 1 Choice Modal when clicking "Nouvelle Commande"
  const openAddModal = () => {
    setIsChoiceModalOpen(true);
  };

  // Open Step 2 Order Form Modal directly
  const openOrderFormModal = (prefilledSub?: string) => {
    const targetModelId = 'MANUAL';
    setFormModelId(targetModelId);
    
    const selModel = models.find(m => m.id === targetModelId);
    setFormClientName(selModel?.ficheData?.client || '');
    setFormSubcontractorName(prefilledSub || '');
    
    const pricing = getModelPricing(selModel);
    setFormPricePerPiece(pricing.stitchingPrice);
    
    setFormTotalQuantity(selModel?.meta_data.quantity || 0);
    setFormNotes('');
    setFormTissuStatus('PENDING');
    setFormFournituresStatus('PENDING');
    setFormFicheTechniqueSent(false);
    setFormSubcontractorPhone('');
    setFormSubcontractorRating(5);
    setFormSubcontractorAvailabilityDate('');
    
    setFormPrestationType('CMT');
    setFormTissuFournisseur('CLIENT');
    setFormFournituresFournisseur('CLIENT');
    setFormConditionnementFournisseur('CLIENT');
    setFormProtoRequired(1);
    setFormProtoStatus('PENDING');
    setFormPaymentTerms('AVANCE_RECEPTION');
    setFormDefectRateAccepted(1.5);
    setFormStitchingDetails('');
    setModalFormTab('general');
    
    setBatches([{
      quantity: selModel?.meta_data.quantity || 0,
      deliveryDate: '',
      notes: '',
      grid: {}
    }]);
    setNewColorInput('');
    setError(null);
    setIsAddModalOpen(true);
  };

  // Sync client name and stitching pricing when model changes in order form
  const handleModelChange = (modelId: string) => {
    setFormModelId(modelId);
    if (modelId === 'MANUAL') {
      setFormClientName('');
      setFormPricePerPiece(0);
      return;
    }
    const selected = models.find(m => m.id === modelId);
    if (selected) {
      setFormClientName(selected.ficheData?.client || '');
      const pricing = getModelPricing(selected);
      setFormPricePerPiece(pricing.stitchingPrice);
      if (selected.meta_data.quantity) {
        setFormTotalQuantity(selected.meta_data.quantity);
        setBatches(prev => {
          const updated = [...prev];
          if (updated[0]) updated[0].quantity = selected.meta_data.quantity || 0;
          return updated;
        });
      }
    }
  };

  // Color-Size grid helpers for new order
  const handleAddColor = () => {
    const color = newColorInput.trim();
    if (!color) return;
    setBatches(prev => {
      const updated = [...prev];
      const batch = updated[0];
      if (!batch.grid[color]) {
        const sizes: Record<string, number> = {};
        COMMON_SIZES.forEach(sz => { sizes[sz] = 0; });
        batch.grid[color] = sizes;
      }
      return updated;
    });
    setNewColorInput('');
  };

  const handleRemoveColor = (color: string) => {
    const updated = batches.map((batch, i) => {
      if (i !== 0) return batch;
      const grid = { ...batch.grid };
      delete grid[color];
      const quantity = Object.values(grid).reduce((sum, sizes) => {
        return sum + Object.values(sizes).reduce((a, b) => a + b, 0);
      }, 0);
      return { ...batch, grid, quantity };
    });
    setBatches(updated);
    setFormTotalQuantity(updated[0].quantity);
  };

  const handleUpdateGridQty = (color: string, size: string, qty: number) => {
    const cleanQty = Math.max(0, qty || 0);
    const updated = batches.map((batch, i) => {
      if (i !== 0) return batch;
      const grid = { ...batch.grid };
      if (grid[color]) {
        grid[color] = { ...grid[color], [size]: cleanQty };
      }
      const quantity = Object.values(grid).reduce((sum, sizes) => {
        return sum + Object.values(sizes).reduce((a, b) => a + b, 0);
      }, 0);
      return { ...batch, grid, quantity };
    });
    setBatches(updated);
    setFormTotalQuantity(updated[0].quantity);
  };

  // Submit new subcontract order
  const handleAddOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);

    if (!formSubcontractorName.trim()) {
      setError(tx(lang,{fr:'Veuillez specifier le nom du sous-traitant.',ar:'يرجى تحديد اسم المقاول من الباطن.',en:'Please specify the subcontractor name.',es:'Por favor, especifique el nombre del subcontratista.',pt:'Por favor, especifique o nome do subcontratado.',tr:'Lütfen taşeron adını belirtin.'}));
      setActionLoading(false);
      return;
    }

    const selectedModel = models.find(m => m.id === formModelId);
    const modelName = formModelId === 'MANUAL' ? 'Commande Directe' : (selectedModel?.meta_data?.nom_modele || 'Inconnu');

    // Build colors and sizes summary json from grid
    const sizesSum: Record<string, number> = {};
    const colorsSum: Record<string, number> = {};
    const grid = batches[0].grid;

    Object.entries(grid).forEach(([color, sizesObj]) => {
      const colorTotal = Object.values(sizesObj).reduce((a, b) => a + b, 0);
      if (colorTotal > 0) {
        colorsSum[color] = colorTotal;
      }
      Object.entries(sizesObj).forEach(([sz, qty]) => {
        if (qty > 0) {
          sizesSum[sz] = (sizesSum[sz] || 0) + qty;
        }
      });
    });

    const body = {
      modelId: formModelId,
      modelName,
      clientName: formClientName,
      totalQuantity: formTotalQuantity,
      subcontractorName: formSubcontractorName,
      pricePerPiece: formPricePerPiece,
      deliveryDate: batches[0].deliveryDate || new Date().toISOString().split('T')[0],
      status: 'PENDING',
      sizes_json: Object.keys(sizesSum).length > 0 ? JSON.stringify(sizesSum) : null,
      colors_json: Object.keys(colorsSum).length > 0 ? JSON.stringify(colorsSum) : null,
      notes: formNotes || null,
      tissuStatus: formTissuStatus,
      fournituresStatus: formFournituresStatus,
      ficheTechniqueSent: formFicheTechniqueSent ? 1 : 0,
      qtyAccepted: 0,
      qtyToRepair: 0,
      qtyRejected: 0,
      subcontractorPhone: formSubcontractorPhone || null,
      subcontractorRating: formSubcontractorRating,
      subcontractorAvailabilityDate: formSubcontractorAvailabilityDate || null,
      prestationType: formPrestationType,
      tissuFournisseur: formTissuFournisseur,
      fournituresFournisseur: formFournituresFournisseur,
      conditionnementFournisseur: formConditionnementFournisseur,
      protoRequired: formProtoRequired,
      protoStatus: formProtoStatus,
      paymentTerms: formPaymentTerms,
      defectRateAccepted: formDefectRateAccepted,
      stitchingDetails: formStitchingDetails || null,
      specifications_json: null
    };

    try {
      const res = await fetch('/api/subcontract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || tx(lang,{fr:'Erreur lors de la creation du lot.',ar:'خطأ أثناء إنشاء الدفعة.',en:'Error creating the batch.',es:'Error al crear el lote.',pt:'Erro ao criar o lote.',tr:'Parti oluşturulurken hata.'}));
      }

      setIsAddModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || tx(lang,{fr:'Une erreur est survenue.',ar:'حدث خطأ.',en:'An error occurred.',es:'Ocurrió un error.',pt:'Ocorreu um erro.',tr:'Bir hata oluştu.'}));
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Order Modal
  const openEditModal = (order: SubcontractOrder) => {
    setSelectedOrder(order);
    setFormModelId(order.modelId);
    setFormClientName(order.clientName || '');
    setFormSubcontractorName(order.subcontractorName);
    setFormPricePerPiece(order.pricePerPiece || 0);
    setFormTotalQuantity(order.totalQuantity);
    setFormNotes(order.notes || '');

    setFormTissuStatus(order.tissuStatus || 'PENDING');
    setFormFournituresStatus(order.fournituresStatus || 'PENDING');
    setFormFicheTechniqueSent(order.ficheTechniqueSent === 1);
    
    setFormQtyAccepted(order.qtyAccepted || 0);
    setFormQtyToRepair(order.qtyToRepair || 0);
    setFormQtyRejected(order.qtyRejected || 0);

    setFormSubcontractorPhone(order.subcontractorPhone || '');
    setFormSubcontractorRating(order.subcontractorRating || 5);
    setFormSubcontractorAvailabilityDate(order.subcontractorAvailabilityDate || '');

    setFormPrestationType(order.prestationType || 'CMT');
    setFormTissuFournisseur(order.tissuFournisseur || 'CLIENT');
    setFormFournituresFournisseur(order.fournituresFournisseur || 'CLIENT');
    setFormConditionnementFournisseur(order.conditionnementFournisseur || 'CLIENT');
    setFormProtoRequired(order.protoRequired !== undefined ? order.protoRequired : 1);
    setFormProtoStatus(order.protoStatus || 'PENDING');
    setFormPaymentTerms(order.paymentTerms || 'AVANCE_RECEPTION');
    setFormDefectRateAccepted(order.defectRateAccepted !== undefined ? order.defectRateAccepted : 1.5);
    setFormStitchingDetails(order.stitchingDetails || '');
    
    setModalFormTab('general');

    // Restore matrix from json
    const parsedSizes = parseJsonSafe(order.sizes_json);
    const parsedColors = parseJsonSafe(order.colors_json);
    const grid: Record<string, Record<string, number>> = {};

    if (Object.keys(parsedColors).length > 0) {
      Object.keys(parsedColors).forEach(color => {
        grid[color] = {};
        COMMON_SIZES.forEach(sz => {
          grid[color][sz] = parsedSizes[sz] || 0;
        });
      });
    } else {
      grid['Standard'] = {};
      COMMON_SIZES.forEach(sz => {
        grid['Standard'][sz] = parsedSizes[sz] || 0;
      });
    }

    setBatches([{
      quantity: order.totalQuantity,
      deliveryDate: order.deliveryDate,
      notes: order.notes || '',
      grid
    }]);

    setNewColorInput('');
    setError(null);
    setIsEditModalOpen(true);
  };

  // Submit edit subcontract order
  const handleEditOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setActionLoading(true);
    setError(null);

    // Build colors and sizes summary json from grid
    const sizesSum: Record<string, number> = {};
    const colorsSum: Record<string, number> = {};
    const grid = batches[0].grid;

    Object.entries(grid).forEach(([color, sizesObj]) => {
      const colorTotal = Object.values(sizesObj).reduce((a, b) => a + b, 0);
      if (colorTotal > 0) {
        colorsSum[color] = colorTotal;
      }
      Object.entries(sizesObj).forEach(([sz, qty]) => {
        if (qty > 0) {
          sizesSum[sz] = (sizesSum[sz] || 0) + qty;
        }
      });
    });

    const selectedModel = models.find(m => m.id === formModelId);
    const modelName = formModelId === 'MANUAL' ? 'Commande Directe' : (selectedModel?.meta_data?.nom_modele || 'Inconnu');

    const body = {
      modelId: formModelId,
      modelName,
      clientName: formClientName,
      totalQuantity: formTotalQuantity,
      subcontractorName: formSubcontractorName,
      pricePerPiece: formPricePerPiece,
      deliveryDate: batches[0].deliveryDate || selectedOrder.deliveryDate,
      sizes_json: Object.keys(sizesSum).length > 0 ? JSON.stringify(sizesSum) : null,
      colors_json: Object.keys(colorsSum).length > 0 ? JSON.stringify(colorsSum) : null,
      notes: formNotes || null,
      tissuStatus: formTissuStatus,
      fournituresStatus: formFournituresStatus,
      ficheTechniqueSent: formFicheTechniqueSent ? 1 : 0,
      qtyAccepted: formQtyAccepted,
      qtyToRepair: formQtyToRepair,
      qtyRejected: formQtyRejected,
      subcontractorPhone: formSubcontractorPhone || null,
      subcontractorRating: formSubcontractorRating,
      subcontractorAvailabilityDate: formSubcontractorAvailabilityDate || null,
      prestationType: formPrestationType,
      tissuFournisseur: formTissuFournisseur,
      fournituresFournisseur: formFournituresFournisseur,
      conditionnementFournisseur: formConditionnementFournisseur,
      protoRequired: formProtoRequired,
      protoStatus: formProtoStatus,
      paymentTerms: formPaymentTerms,
      defectRateAccepted: formDefectRateAccepted,
      stitchingDetails: formStitchingDetails || null
    };

    try {
      const res = await fetch(`/api/subcontract/${selectedOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || tx(lang,{fr:'Erreur lors de la mise a jour.',ar:'خطأ أثناء التحديث.',en:'Error during update.',es:'Error durante la actualización.',pt:'Erro durante a atualização.',tr:'Güncelleme sırasında hata.'}));
      }

      setIsEditModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || tx(lang,{fr:'Une erreur est survenue.',ar:'حدث خطأ.',en:'An error occurred.',es:'Ocurrió un error.',pt:'Ocorreu um erro.',tr:'Bir hata oluştu.'}));
    } finally {
      setActionLoading(false);
    }
  };

  // Quick update order status
  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/subcontract/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error(tx(lang,{fr:'Echec de la modification du statut',ar:'فشل تعديل الحالة',en:'Failed to update status',es:'Error al modificar el estado',pt:'Falha ao modificar o estado',tr:'Durum güncellenemedi'}));
      fetchData();
    } catch (err: any) {
      alert(err.message || tx(lang,{fr:'Erreur de communication',ar:'خطأ في الاتصال',en:'Communication error',es:'Error de comunicación',pt:'Erro de comunicação',tr:'İletişim hatası'}));
    }
  };

  // Delete subcontract order
  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm(tx(lang,{fr:'Voulez-vous vraiment supprimer cette commande ?',ar:'هل تريد بالتأكيد حذف هذه الطلبية؟',en:'Are you sure you want to delete this order?',es:'¿Está seguro de eliminar este pedido?',pt:'Tem certeza de que deseja eliminar esta encomenda?',tr:'Bu siparişi silmek istediğinize emin misiniz?'}))) return;
    try {
      const res = await fetch(`/api/subcontract/${orderId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error(tx(lang,{fr:'Echec de la suppression',ar:'فشل الحذف',en:'Deletion failed',es:'Error al eliminar',pt:'Falha ao eliminar',tr:'Silme başarısız'}));
      fetchData();
    } catch (err: any) {
      alert(err.message || tx(lang,{fr:'Une erreur est survenue.',ar:'حدث خطأ.',en:'An error occurred.',es:'Ocurrió un error.',pt:'Ocorreu um erro.',tr:'Bir hata oluştu.'}));
    }
  };

  // Open Sale Invoice Modal for a model (Tab 3)
  const openSaleModal = (item: { model: ModelData, remainingStock: number, price: number }) => {
    const today = new Date().toISOString().split('T')[0];
    const serial = Math.floor(1000 + Math.random() * 9000);
    const num = `FAC-VENTE-${today.replace(/-/g, '')}-${serial}`;
    
    setSelectedModelForSale(item.model);
    setSaleClient(item.model.ficheData?.client || '');
    setSaleClientIce('');
    setSaleClientRc('');
    setSaleClientAdresse('');
    setSaleClientTel('');
    setSaleClientEmail('');
    setSaleQuantity(item.remainingStock);
    setSalePrice(item.price);
    setSaleTvaRate(20);
    setSaleNotes(tx(lang,{fr:'Sortie de stock sous-traitance pour le modele',ar:'إخراج من مخزون المقاولة من الباطن للموديل',en:'Subcontract stock exit for model',es:'Salida de stock de subcontratación para el modelo',pt:'Saída de stock de subcontratação para o modelo',tr:'Taşeron stok çıkışı model için'}) + ` ${item.model.meta_data.nom_modele}`);
    setSaleStatus('BROUILLON');
    setSaleInvoiceNumber(num);
    setIsSaleModalOpen(true);
  };

  // Submit sale invoice (Tab 3)
  const handleSaveSaleInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModelForSale) return;
    setActionLoading(true);

    if (saleQuantity <= 0) {
      alert(tx(lang,{fr:'La quantite vendue doit etre superieure a 0.',ar:'الكمية المباعة يجب أن تكون أكبر من 0.',en:'The sold quantity must be greater than 0.',es:'La cantidad vendida debe ser mayor que 0.',pt:'A quantidade vendida deve ser superior a 0.',tr:'Satılan miktar 0\'dan büyük olmalıdır.'}));
      setActionLoading(false);
      return;
    }

    const totalHT = saleQuantity * salePrice;
    const totalTVA = (totalHT * saleTvaRate) / 100;
    const totalTTC = totalHT + totalTVA;

    // Build lines array matching database convention
    const lines = [{
      designation: `Modele: ${selectedModelForSale.meta_data.nom_modele} (Ref: ${selectedModelForSale.meta_data.reference || 'N/A'})`,
      qte: saleQuantity,
      prix_unitaire: salePrice,
      total: totalHT,
      modelId: selectedModelForSale.id // Store modelId in JSON line item for exact stock calculation
    }];

    const body = {
      numero: saleInvoiceNumber,
      type: 'VENTE',
      tiers_nom: saleClient,
      tiers_ice: saleClientIce || null,
      tiers_rc: saleClientRc || null,
      tiers_adresse: saleClientAdresse || null,
      tiers_tel: saleClientTel || null,
      tiers_email: saleClientEmail || null,
      date_facture: new Date().toISOString().split('T')[0],
      date_echeance: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0], // 30 days due date
      total_ht: totalHT,
      taux_tva: saleTvaRate,
      total_tva: totalTVA,
      total_ttc: totalTTC,
      montant_paye: saleStatus === 'PAYEE' ? totalTTC : 0,
      statut: saleStatus,
      notes: saleNotes || null,
      lignes: lines
    };

    try {
      const res = await fetch('/api/facturation/factures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || tx(lang,{fr:'Erreur lors de la validation de la facture.',ar:'خطأ أثناء التحقق من صحة الفاتورة.',en:'Error validating the invoice.',es:'Error al validar la factura.',pt:'Erro ao validar a fatura.',tr:'Fatura doğrulanırken hata.'}));
      }

      setIsSaleModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || tx(lang,{fr:'Une erreur est survenue lors de la facturation.',ar:'حدث خطأ أثناء إصدار الفاتورة.',en:'An error occurred during invoicing.',es:'Ocurrió un error durante la facturación.',pt:'Ocorreu um erro durante a faturação.',tr:'Faturalama sırasında bir hata oluştu.'}));
    } finally {
      setActionLoading(false);
    }
  };

  // Print Invoice (Tab 3 Invoice template preview)
  const handlePrintSaleInvoice = () => {
    if (!selectedModelForSale) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalHT = saleQuantity * salePrice;
    const totalTVA = (totalHT * saleTvaRate) / 100;
    const totalTTC = totalHT + totalTVA;

    printWindow.document.write(`
      <html>
        <head>
          <title>${tx(lang,{fr:'Facture de Vente',ar:'فاتورة بيع',en:'Sale Invoice',es:'Factura de Venta',pt:'Fatura de Venda',tr:'Satış Faturası'})} - ${saleInvoiceNumber}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            body { font-family: 'Inter', sans-serif; color: #1e293b; padding: 40px; line-height: 1.5; font-size: 13px; }
            .invoice-box { max-width: 800px; margin: auto; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: 800; color: #4f46e5; }
            .meta-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
            .box { background: #f8fafc; border: 1px solid #f1f5f9; padding: 15px; border-radius: 12px; }
            .title { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 5px; }
            .val { font-size: 14px; font-weight: 600; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 30px; }
            th { background: #f1f5f9; padding: 12px; text-align: left; font-size: 11px; color: #475569; font-weight: 700; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; }
            td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
            .total-table { width: 250px; margin-left: auto; margin-top: 20px; }
            .total-table td { padding: 8px 12px; border: none; font-size: 13px; }
            .total-row { font-weight: 700; color: #4f46e5; font-size: 15px !important; border-top: 2px solid #e2e8f0 !important; }
            .footer { margin-top: 60px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body onload="window.print()">
          <div class="invoice-box">
            <div class="header">
              <div>
                <div class="logo">BeraMéthode</div>
                <div style="color: #64748b; font-weight: 500; font-size: 11px;">ERP Textile & Confection</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 18px; font-weight: 800; color: #1e1b4b;">${tx(lang,{fr:'FACTURE DE VENTE',ar:'فاتورة بيع',en:'SALE INVOICE',es:'FACTURA DE VENTA',pt:'FATURA DE VENDA',tr:'SATIŞ FATURASI'})}</div>
                <div style="font-size: 12px; font-weight: 600; color: #4f46e5; margin-top: 4px;">N° ${saleInvoiceNumber}</div>
              </div>
            </div>

            <div class="meta-section">
              <div class="box">
                <div class="title">${tx(lang,{fr:'Émetteur',ar:'المصدر',en:'Issuer',es:'Emisor',pt:'Emitente',tr:'Düzenleyen'})}</div>
                <div class="val">BeraMéthode Confection</div>
                <div style="color: #64748b; font-size: 11px; margin-top: 4px;">${tx(lang,{fr:'Atelier principal de production',ar:'ورشة الإنتاج الرئيسية',en:'Main production workshop',es:'Taller principal de producción',pt:'Oficina principal de produção',tr:'Ana üretim atölyesi'})}</div>
              </div>
              <div class="box">
                <div class="title">${tx(lang,{fr:'Facturé à (Client)',ar:'تمت الفاتورة لـ (العميل)',en:'Invoiced to (Client)',es:'Facturado a (Cliente)',pt:'Faturado a (Cliente)',tr:'Faturalanan (Müşteri)'})}</div>
                <div class="val">${saleClient}</div>
                ${saleClientAdresse ? `<div style="font-size: 12px; color: #475569; margin-top: 4px;">${saleClientAdresse}</div>` : ''}
                ${saleClientIce ? `<div style="font-size: 11px; color: #64748b;">ICE: ${saleClientIce}</div>` : ''}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>${tx(lang,{fr:"Désignation de l'article",ar:'بيان الصنف',en:'Item Description',es:'Designación del artículo',pt:'Designação do artigo',tr:'Ürün Açıklaması'})}</th>
                  <th style="text-align: right;">${tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</th>
                  <th style="text-align: right;">${tx(lang,{fr:'Prix Unitaire',ar:'السعر الوحدة',en:'Unit Price',es:'Precio Unitario',pt:'Preço Unitário',tr:'Birim Fiyat'})}</th>
                  <th style="text-align: right;">${tx(lang,{fr:'Total HT',ar:'الإجمالي HT',en:'Total HT',es:'Total HT',pt:'Total HT',tr:'Toplam HT'})}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="font-weight: 600; color: #1e293b;">
                    Modèle: ${selectedModelForSale.meta_data.nom_modele}
                    <div style="font-size: 11px; color: #64748b; font-weight: 400; margin-top: 2px;">Réf: ${selectedModelForSale.meta_data.reference || 'N/A'}</div>
                  </td>
                  <td style="text-align: right;">${saleQuantity.toLocaleString()} pcs</td>
                  <td style="text-align: right;">${salePrice.toLocaleString()} MAD</td>
                  <td style="text-align: right; font-weight: 600;">${totalHT.toLocaleString()} MAD</td>
                </tr>
              </tbody>
            </table>

            <table class="total-table">
              <tr>
                <td style="color: #64748b;">Total HT</td>
                <td style="text-align: right; font-weight: 600;">${totalHT.toLocaleString()} MAD</td>
              </tr>
              <tr>
                <td style="color: #64748b;">TVA (${saleTvaRate}%)</td>
                <td style="text-align: right; font-weight: 600;">${totalTVA.toLocaleString()} MAD</td>
              </tr>
              <tr class="total-row">
                <td>Total TTC</td>
                <td style="text-align: right;">${totalTTC.toLocaleString()} MAD</td>
              </tr>
            </table>

            ${saleNotes ? `
              <div style="background: #f8fafc; border-left: 3px solid #cbd5e1; padding: 12px; margin-top: 40px; border-radius: 4px;">
                <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">${tx(lang,{fr:'Observations / Notes',ar:'ملاحظات',en:'Remarks / Notes',es:'Observaciones / Notas',pt:'Observações / Notas',tr:'Gözlemler / Notlar'})}</div>
                <div style="margin-top: 4px; font-style: italic; color: #334155;">${saleNotes}</div>
              </div>
            ` : ''}

            <div class="footer">
              BeraMéthode - ${tx(lang,{fr:'Solution de gestion ERP pour l\'industrie de confection.',ar:'حل ERP لإدارة صناعة الخياطة.',en:'ERP management solution for the garment industry.',es:'Solución de gestión ERP para la industria de la confección.',pt:'Solução de gestão ERP para a indústria de confeção.',tr:'Konfeksiyon endüstrisi için ERP yönetim çözümü.'})}<br/>
              ${tx(lang,{fr:'Document généré électroniquement et valable sans signature.',ar:'مستند تم إنشاؤه إلكترونياً وصالح بدون توقيع.',en:'Electronically generated document valid without signature.',es:'Documento generado electrónicamente y válido sin firma.',pt:'Documento gerado eletronicamente e válido sem assinatura.',tr:'Elektronik olarak oluşturulmuş, imzasız geçerli belge.'})}
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Tab 4: Groups editing logic
  const handleSelectGroup = (grp: SubcontractorGroup) => {
    setSelectedGroup(grp);
    setGroupFormName(grp.group_name);
    setGroupFormSubs(grp.subcontractor_names || []);
    setIsEditingGroup(true);
  };

  const handleAddNewGroupMode = () => {
    setSelectedGroup(null);
    setGroupFormName('');
    setGroupFormSubs([]);
    setIsEditingGroup(true);
  };

  const handleToggleSubInGroup = (subName: string) => {
    setGroupFormSubs(prev => 
      prev.includes(subName) ? prev.filter(s => s !== subName) : [...prev, subName]
    );
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupFormName.trim()) {
      alert(tx(lang,{fr:'Veuillez specifier un nom de groupe.',ar:'يرجى تحديد اسم المجموعة.',en:'Please specify a group name.',es:'Por favor, especifique un nombre de grupo.',pt:'Por favor, especifique um nome de grupo.',tr:'Lütfen bir grup adı belirtin.'}));
      return;
    }
    setActionLoading(true);

    const body = {
      id: selectedGroup?.id || null,
      group_name: groupFormName,
      subcontractor_names: groupFormSubs
    };

    try {
      const res = await fetch('/api/subcontract/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error(tx(lang,{fr:'Echec de la sauvegarde du groupe',ar:'فشل حفظ المجموعة',en:'Failed to save group',es:'Error al guardar el grupo',pt:'Falha ao guardar o grupo',tr:'Grup kaydedilemedi'}));
      
      setIsEditingGroup(false);
      setSelectedGroup(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || tx(lang,{fr:'Une erreur est survenue.',ar:'حدث خطأ.',en:'An error occurred.',es:'Ocurrió un error.',pt:'Ocorreu um erro.',tr:'Bir hata oluştu.'}));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm(tx(lang,{fr:'Voulez-vous supprimer ce groupe ?',ar:'هل تريد حذف هذه المجموعة؟',en:'Do you want to delete this group?',es:'¿Quiere eliminar este grupo?',pt:'Deseja eliminar este grupo?',tr:'Bu grubu silmek istiyor musunuz?'}))) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/subcontract/groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error(tx(lang,{fr:'Echec de la suppression',ar:'فشل الحذف',en:'Deletion failed',es:'Error al eliminar',pt:'Falha ao eliminar',tr:'Silme başarısız'}));
      
      setIsEditingGroup(false);
      setSelectedGroup(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || tx(lang,{fr:'Une erreur est survenue.',ar:'حدث خطأ.',en:'An error occurred.',es:'Ocurrió un error.',pt:'Ocorreu um erro.',tr:'Bir hata oluştu.'}));
    } finally {
      setActionLoading(false);
    }
  };

  // Helper to print subcontractor delivery bon/slip (Tab 1 action)
  const handlePrintDeliveryNote = (order: SubcontractOrder) => {
    const sizes = parseJsonSafe(order.sizes_json);
    const colors = parseJsonSafe(order.colors_json);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${tx(lang,{fr:"Bon d'Envoi en Sous-traitance",ar:'مذكرة إرسال للمقاولة من الباطن',en:'Subcontract Delivery Note',es:'Nota de Envío de Subcontratación',pt:'Nota de Remessa de Subcontratação',tr:'Taşeron Sevk İrsaliyesi'})} - ${order.modelName}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; padding: 40px; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; border-bottom: 3px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 28px; font-weight: 900; color: #1e1b4b; text-transform: uppercase; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 12px; }
            .meta-title { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 800; }
            .meta-val { font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 40px; }
            th { background: #f1f5f9; padding: 12px; text-align: left; font-size: 11px; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: 800; }
            td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; }
            .signatures { display: flex; justify-content: space-between; margin-top: 80px; }
            .sig-box { width: 230px; border-top: 2px dashed #cbd5e1; text-align: center; padding-top: 10px; font-size: 11px; color: #475569; font-weight: 800; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <div>
              <div class="title">BeraMéthode</div>
              <div style="font-size: 12px; color: #64748b; font-weight: 600;">${tx(lang,{fr:'ERP de Production & Confection Textile',ar:'ERP للإنتاج وصناعة الخياطة النسيجية',en:'ERP for Textile Production & Garment Manufacturing',es:'ERP de Producción y Confección Textil',pt:'ERP de Produção e Confecção Têxtil',tr:'Tekstil Üretimi ve Konfeksiyon için ERP'})}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 18px; font-weight: 900; color: #4f46e5;">${tx(lang,{fr:"BON D'ENVOI DE SOUS-TRAITANCE",ar:'مذكرة إرسال المقاولة من الباطن',en:'SUBCONTRACT DELIVERY NOTE',es:'NOTA DE ENVÍO DE SUBCONTRATACIÓN',pt:'NOTA DE REMESSA DE SUBCONTRATAÇÃO',tr:'TAŞERON SEVK İRSALİYESİ'})}</div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 4px;">REF: BS-${order.id.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>

          <div class="meta">
            <div class="meta-box">
              <div class="meta-title">${tx(lang,{fr:'Atelier de Sous-traitance',ar:'ورشة المقاولة من الباطن',en:'Subcontract Workshop',es:'Taller de Subcontratación',pt:'Oficina de Subcontratação',tr:'Taşeron Atölyesi'})}</div>
              <div class="meta-val">${order.subcontractorName}</div>
            </div>
            <div class="meta-box">
              <div class="meta-title">${tx(lang,{fr:"Client / Donneur d'Ordre",ar:'العميل / صاحب الطلب',en:'Client / Ordering Party',es:'Cliente / Ordenante',pt:'Cliente / Mandante',tr:'Müşteri / Sipariş Veren'})}</div>
              <div class="meta-val">${order.clientName || 'N/A'}</div>
            </div>
            <div class="meta-box">
              <div class="meta-title">${tx(lang,{fr:'Modèle & Réf',ar:'الموديل والمرجع',en:'Model & Ref',es:'Modelo y Ref',pt:'Modelo e Ref',tr:'Model ve Referans'})}</div>
              <div class="meta-val">${order.modelName}</div>
            </div>
            <div class="meta-box">
              <div class="meta-title">${tx(lang,{fr:'Date de Livraison Prévue',ar:'تاريخ التسليم المتوقع',en:'Expected Delivery Date',es:'Fecha de Entrega Prevista',pt:'Data de Entrega Prevista',tr:'Beklenen Teslimat Tarihi'})}</div>
              <div class="meta-val">${order.deliveryDate}</div>
            </div>
          </div>

          <h3 style="font-size: 15px; margin-bottom: 10px; color: #1e1b4b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; font-weight: 800;">${tx(lang,{fr:'DETAILS DES PIECES',ar:'تفاصيل القطع',en:'PIECE DETAILS',es:'DETALLES DE LAS PIEZAS',pt:'DETALHES DAS PEÇAS',tr:'PARÇA DETAYLARI'})}</h3>
          <table>
            <thead>
              <tr>
                <th>${tx(lang,{fr:'Couleur',ar:'اللون',en:'Color',es:'Color',pt:'Cor',tr:'Renk'})}</th>
                <th>${tx(lang,{fr:'Détail des Tailles',ar:'تفصيل المقاسات',en:'Size Details',es:'Detalle de Tallas',pt:'Detalhe dos Tamanhos',tr:'Beden Detayları'})}</th>
                <th style="text-align: right;">${tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</th>
              </tr>
            </thead>
            <tbody>
              ${Object.keys(colors).length > 0 ? Object.entries(colors).map(([color, qty]) => `
                <tr>
                  <td style="font-weight: 800; color: #1e1b4b;">${color}</td>
                  <td style="font-weight: 600;">
                    ${Object.entries(sizes).map(([sz, q]) => `[${sz}]: ${q} pcs`).join(' | ')}
                  </td>
                  <td style="text-align: right; font-weight: 800; color: #4f46e5;">${qty.toLocaleString()} pcs</td>
                </tr>
              `).join('') : `
                <tr>
                  <td style="font-weight: 800; color: #1e1b4b;">${tx(lang, {fr: 'Standard', ar: 'قياسي', en: 'Standard', es: 'Estándar', pt: 'Padrão', tr: 'Standart'})}</td>
                  <td style="font-weight: 600;">
                    ${Object.entries(sizes).map(([sz, q]) => `[${sz}]: ${q} pcs`).join(' | ')}
                  </td>
                  <td style="text-align: right; font-weight: 800; color: #4f46e5;">${order.totalQuantity.toLocaleString()} pcs</td>
                </tr>
              `}
              <tr style="background: #f8fafc; font-weight: 900; font-size: 14px; border-top: 2px solid #cbd5e1;">
                <td colspan="2">${tx(lang,{fr:'QUANTITÉ TOTALE ENVOYÉE',ar:'الكمية الإجمالية المرسلة',en:'TOTAL QUANTITY SENT',es:'CANTIDAD TOTAL ENVIADA',pt:'QUANTIDADE TOTAL ENVIADA',tr:'GÖNDERİLEN TOPLAM MİKTAR'})}</td>
                <td style="text-align: right; font-weight: 900; color: #4f46e5; font-size: 16px;">${order.totalQuantity.toLocaleString()} pcs</td>
              </tr>
            </tbody>
          </table>

          ${order.notes ? `
            <div style="background: #faf5ff; border: 1px solid #f3e8ff; border-radius: 12px; padding: 15px; margin-bottom: 30px;">
              <div style="font-size: 10px; font-weight: 800; color: #a21caf; text-transform: uppercase;">${tx(lang,{fr:'Notes',ar:'ملاحظات',en:'Notes',es:'Notas',pt:'Notas',tr:'Notlar'})}</div>
              <div style="font-size: 13px; margin-top: 6px; font-style: italic; color: #581c87; font-weight: 600;">${order.notes}</div>
            </div>
          ` : ''}

          <div class="signatures">
            <div class="sig-box">${tx(lang,{fr:'Livreur / Transporteur',ar:'المسلم / الناقل',en:'Delivery Person / Carrier',es:'Repartidor / Transportista',pt:'Entregador / Transportador',tr:'Teslim Eden / Nakliyeci'})}</div>
            <div class="sig-box">${tx(lang,{fr:'Réception Sous-traitant',ar:'استلام المقاول من الباطن',en:'Subcontractor Receipt',es:'Recepción Subcontratista',pt:'Recepção Subcontratado',tr:'Taşeron Teslim Alma'})}</div>
            <div class="sig-box">${tx(lang,{fr:'Contrôle Production',ar:'مراقبة الإنتاج',en:'Production Control',es:'Control de Producción',pt:'Controlo de Produção',tr:'Üretim Kontrolü'})}</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-3.5 lg:space-y-6 p-3 lg:p-6 bg-slate-50 dark:bg-dk-bg text-slate-800 dark:text-dk-text relative font-sans animate-fade-in w-full h-full">
      
      {/* Header Banner - Compact and White - Hidden on Mobile/Tablet */}
      <div className="hidden lg:block relative overflow-hidden rounded-2xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/60 p-3.5 lg:p-4 shadow-sm dark:shadow-dk-sm dark:shadow-none text-slate-800 dark:text-dk-text">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent uppercase tracking-widest block">{tx(lang,{fr:'Plateforme Industrielle',ar:'المنصة الصناعية',en:'Industrial Platform',es:'Plataforma Industrial',pt:'Plataforma Industrial',tr:'Endüstriyel Platform'})}</span>
            <h1 className="text-lg lg:text-xl font-black tracking-tight text-slate-900 dark:text-dk-text">
              {tx(lang,{fr:'Sous-traitance',ar:'المقاولة من الباطن',en:'Subcontracting',es:'Subcontratación',pt:'Subcontratação',tr:'Taşeronluk'})}
            </h1>
          </div>
          {activeTab === 'orders' && (
            <button 
              onClick={openAddModal}
              className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover dark:hover:bg-dk-accent/90 hover:scale-[1.01] active:scale-[0.99] text-white px-4 py-2 rounded-xl transition-all shadow-sm dark:shadow-dk-sm dark:shadow-none flex items-center justify-center gap-2 font-bold w-full sm:w-auto text-xs shrink-0 border border-indigo-600 dark:border-dk-accent"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              <span>{tx(lang,{fr:'Nouvelle Commande',ar:'أمر شراء جديد',en:'New Order',es:'Nuevo Pedido',pt:'Nova Encomenda',tr:'Yeni Sipariş'})}</span>
            </button>
          )}
        </div>
      </div>

      {/* Modern Pill-Style Tabs Bar - Compact */}
      <div className="flex bg-white dark:bg-dk-surface p-0.5 rounded-xl border border-slate-200 dark:border-dk-border/60 overflow-x-auto gap-0.5 shadow-sm dark:shadow-dk-sm dark:shadow-none max-w-max scrollbar-none shrink-0">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-2.5 lg:px-3 py-1.5 rounded-lg font-bold text-[10px] lg:text-xs transition-all flex items-center gap-1 lg:gap-1.5 whitespace-nowrap ${activeTab === 'orders' ? 'bg-indigo-600 dark:bg-dk-accent text-white shadow-sm dark:shadow-dk-sm dark:shadow-none' : 'text-slate-500 dark:text-dk-muted hover:text-slate-800 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated'}`}
        >
          <Package className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
          <span>{tx(lang,{fr:'Commandes',ar:'الطلبيات',en:'Orders',es:'Pedidos',pt:'Encomendas',tr:'Siparişler'})}</span>
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-2.5 lg:px-3 py-1.5 rounded-lg font-bold text-[10px] lg:text-xs transition-all flex items-center gap-1 lg:gap-1.5 whitespace-nowrap ${activeTab === 'stock' ? 'bg-indigo-600 dark:bg-dk-accent text-white shadow-sm dark:shadow-dk-sm dark:shadow-none' : 'text-slate-500 dark:text-dk-muted hover:text-slate-800 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated'}`}
        >
          <Coins className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
          <span>{tx(lang,{fr:'Stock & Ventes',ar:'المخزون والمبيعات',en:'Stock & Sales',es:'Stock & Ventas',pt:'Stock & Vendas',tr:'Stok & Satışlar'})}</span>
        </button>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-900/30 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 text-rose-850 dark:text-rose-400 p-3 lg:p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-4 h-4 lg:w-5 lg:h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <span className="text-xs lg:text-sm font-medium">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-dk-sm dark:shadow-none gap-3">
          <Loader2 className="w-6 h-6 lg:w-8 lg:h-8 text-indigo-500 dark:text-dk-accent animate-spin" />
          <p className="text-[11px] lg:text-xs text-slate-500 dark:text-dk-muted font-medium">{tx(lang,{fr:'Chargement des données de sous-traitance...',ar:'جاري تحميل بيانات المقاولة من الباطن...',en:'Loading subcontracting data...',es:'Cargando datos de subcontratación...',pt:'A carregar dados de subcontratação...',tr:'Taşeronluk verileri yükleniyor...'})}</p>
        </div>
      ) : (
        <>
          {/* ======================================= */}
          {/* TAB 1: COMMANDES (ORDERS) */}
          {/* ======================================= */}
          {activeTab === 'orders' && (
            <div className="space-y-3 lg:space-y-4">
              {/* Clean Minimalist Stats Widgets - Horizontally scrollable on mobile/tablet */}
              <div className="flex flex-row flex-nowrap overflow-x-auto lg:grid lg:grid-cols-4 gap-2 lg:gap-3 pb-1.5 lg:pb-0 scrollbar-none w-full shrink-0">
                <div className="flex-1 min-w-[110px] lg:min-w-0 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/50 p-2 lg:p-2.5 rounded-lg lg:rounded-xl shadow-sm dark:shadow-dk-sm dark:shadow-none flex items-center gap-2 lg:gap-2.5 hover:shadow-md dark:hover:shadow-none transition-all shrink-0">
                  <div className="p-1.5 lg:p-2 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-dk-elevated text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent rounded-md lg:rounded-lg shrink-0">
                    <Truck className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </div>
                  <div>
                    <span className="text-[8px] lg:text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider block">{tx(lang,{fr:'Commandes Actives',ar:'الطلبيات النشطة',en:'Active Orders',es:'Pedidos Activos',pt:'Encomendas Ativas',tr:'Aktif Siparişler'})}</span>
                    <span className="text-xs lg:text-sm font-extrabold text-slate-800 dark:text-dk-text tracking-tight block leading-none mt-0.5">{stats.activeOrdersCount}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-[110px] lg:min-w-0 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/50 p-2 lg:p-2.5 rounded-lg lg:rounded-xl shadow-sm dark:shadow-dk-sm dark:shadow-none flex items-center gap-2 lg:gap-2.5 hover:shadow-md dark:hover:shadow-none transition-all shrink-0">
                  <div className="p-1.5 lg:p-2 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-dk-elevated text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent rounded-md lg:rounded-lg shrink-0">
                    <Package className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </div>
                  <div>
                    <span className="text-[8px] lg:text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider block">{tx(lang,{fr:'Total Commandé',ar:'إجمالي المطلوب',en:'Total Ordered',es:'Total Pedido',pt:'Total Encomendado',tr:'Toplam Sipariş Edilen'})}</span>
                    <span className="text-xs lg:text-sm font-extrabold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent tracking-tight block leading-none mt-0.5" dir="ltr">{stats.totalQty.toLocaleString()} <span className="text-[9px] lg:text-[10px] font-semibold text-slate-400 dark:text-dk-muted">pcs</span></span>
                  </div>
                </div>
                <div className="flex-1 min-w-[110px] lg:min-w-0 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/50 p-2 lg:p-2.5 rounded-lg lg:rounded-xl shadow-sm dark:shadow-dk-sm dark:shadow-none flex items-center gap-2 lg:gap-2.5 hover:shadow-md dark:hover:shadow-none transition-all shrink-0">
                  <div className="p-1.5 lg:p-2 bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-md lg:rounded-lg shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </div>
                  <div>
                    <span className="text-[8px] lg:text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider block">{tx(lang,{fr:'Qualité Moyenne',ar:'متوسط الجودة',en:'Average Quality',es:'Calidad Promedio',pt:'Qualidade Média',tr:'Ortalama Kalite'})}</span>
                    <span className="text-xs lg:text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight block leading-none mt-0.5">{stats.avgQualityRate}%</span>
                  </div>
                </div>
                <div className="flex-1 min-w-[110px] lg:min-w-0 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/50 p-2 lg:p-2.5 rounded-lg lg:rounded-xl shadow-sm dark:shadow-dk-sm dark:shadow-none flex items-center gap-2 lg:gap-2.5 hover:shadow-md dark:hover:shadow-none transition-all shrink-0">
                  <div className="p-1.5 lg:p-2 bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-md lg:rounded-lg shrink-0">
                    <Clock className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </div>
                  <div>
                    <span className="text-[8px] lg:text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider block">{tx(lang,{fr:'Reste à Livrer',ar:'المتبقي للتسليم',en:'Remaining to Deliver',es:'Pendiente de Entrega',pt:'Restante para Entregar',tr:'Teslim Edilecek Kalan'})}</span>
                    <span className="text-xs lg:text-sm font-extrabold text-amber-600 dark:text-amber-400 tracking-tight block leading-none mt-0.5" dir="ltr">{stats.remainingQty.toLocaleString()} <span className="text-[9px] lg:text-[10px] font-semibold text-slate-400 dark:text-dk-muted">pcs</span></span>
                  </div>
                </div>
              </div>

              {/* Clean Filters Toolbar */}
              <div className="bg-white dark:bg-dk-surface rounded-xl p-2 lg:p-3 border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-dk-sm dark:shadow-none flex flex-col gap-2.5 w-full shrink-0">
                {/* Search input + Mobile filter toggle */}
                <div className="flex gap-2 w-full">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={tx(lang,{fr:'Rechercher sous-traitant, modèle...',ar:'بحث عن مقاول من الباطن، موديل...',en:'Search subcontractor, model...',es:'Buscar subcontratista, modelo...',pt:'Pesquisar subcontratado, modelo...',tr:'Taşeron, model ara...'})}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 border border-slate-200 dark:border-dk-border rounded-xl text-[11px] lg:text-xs focus:outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent w-full bg-slate-50 dark:bg-dk-bg/50 dark:bg-dk-surface/50 text-slate-800 dark:text-dk-text placeholder:text-slate-400"
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                    className="lg:hidden flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-slate-200 dark:border-dk-border rounded-xl text-[11px] font-bold text-slate-600 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-bg hover:bg-slate-100 dark:hover:bg-dk-elevated"
                  >
                    <span>{tx(lang,{fr:'Filtres',ar:'تصفية',en:'Filters',es:'Filtros',pt:'Filtros',tr:'Filtreler'})}</span>
                    {showMobileFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* Dropdowns + View Toggle (Always visible on desktop, toggleable on mobile/tablet) */}
                <div className={`${showMobileFilters ? 'flex' : 'hidden'} lg:flex flex-wrap items-center gap-2 w-full lg:justify-end border-t border-slate-150 dark:border-dk-border pt-2 lg:border-t-0 lg:pt-0`}>
                  {/* Group Filter */}
                  <select
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    className="text-[11px] lg:text-xs font-bold text-slate-700 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg p-1.5 outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent hover:bg-slate-100 dark:hover:bg-dk-elevated flex-1 sm:flex-initial"
                  >
                    <option value="ALL">{tx(lang,{fr:'Tous les groupements',ar:'جميع المجموعات',en:'All Groups',es:'Todos los Grupos',pt:'Todos os Grupos',tr:'Tüm Gruplar'})}</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.group_name}</option>
                    ))}
                  </select>

                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-[11px] lg:text-xs font-bold text-slate-700 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg p-1.5 outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent hover:bg-slate-100 dark:hover:bg-dk-elevated flex-1 sm:flex-initial"
                  >
                    <option value="ALL">{tx(lang,{fr:'Tous les statuts',ar:'جميع الحالات',en:'All Statuses',es:'Todos los Estados',pt:'Todos os Estados',tr:'Tüm Durumlar'})}</option>
                    <option value="PENDING">{tx(lang,{fr:'En attente',ar:'قيد الانتظار',en:'Pending',es:'Pendiente',pt:'Pendente',tr:'Beklemede'})}</option>
                    <option value="IN_COUPE">{tx(lang,{fr:'En Coupe',ar:'في القص',en:'In Cutting',es:'En Corte',pt:'Em Corte',tr:'Kesimde'})}</option>
                    <option value="IN_COUTURE">{tx(lang,{fr:'En Couture',ar:'في الخياطة',en:'In Sewing',es:'En Costura',pt:'Em Costura',tr:'Dikişte'})}</option>
                    <option value="IN_FINITION">{tx(lang,{fr:'En Finition',ar:'في التشطيب',en:'In Finishing',es:'En Acabado',pt:'Em Acabamento',tr:'Bitimde'})}</option>
                    <option value="LIVRE_PARTIEL">{tx(lang,{fr:'Partiel',ar:'جزئي',en:'Partial',es:'Parcial',pt:'Parcial',tr:'Kısmi'})}</option>
                    <option value="COMPLETED">{tx(lang,{fr:'Complété',ar:'مكتمل',en:'Completed',es:'Completado',pt:'Concluído',tr:'Tamamlandı'})}</option>
                  </select>

                  {/* View Mode Toggle */}
                  <div className="flex items-center border border-slate-200 dark:border-dk-border rounded-lg overflow-hidden bg-slate-50 dark:bg-dk-bg shrink-0">
                    <button 
                      onClick={() => setViewMode('card')}
                      className="p-2 transition-all"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => setViewMode('table')}
                      className="p-2 transition-all"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* View Rendering */}
              {filteredOrders.length === 0 ? (
                <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border/60 p-12 lg:p-16 text-center text-slate-400 dark:text-dk-muted shadow-sm dark:shadow-dk-sm dark:shadow-none">
                  <Package className="w-10 h-10 lg:w-12 lg:h-12 mx-auto mb-3 opacity-25 text-slate-350 dark:text-dk-muted" />
                  <p className="text-xs font-semibold">{tx(lang,{fr:'Aucune commande trouvée',ar:'لم يتم العثور على أي طلبية',en:'No orders found',es:'No se encontraron pedidos',pt:'Nenhuma encomenda encontrada',tr:'Sipariş bulunamadı'})}</p>
                </div>
              ) : viewMode === 'card' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredOrders.map(order => {
                    const qtyAcc = order.qtyAccepted || 0;
                    const qtyRep = order.qtyToRepair || 0;
                    const qtyRej = order.qtyRejected || 0;
                    const accPct = order.totalQuantity > 0 ? Math.round((qtyAcc / order.totalQuantity) * 100) : 0;
                    const repPct = order.totalQuantity > 0 ? Math.round((qtyRep / order.totalQuantity) * 100) : 0;
                    const rejPct = order.totalQuantity > 0 ? Math.round((qtyRej / order.totalQuantity) * 100) : 0;
                    const progress = Math.min(100, accPct + repPct + rejPct);

                    const matchedModel = models.find(m => m.id === order.modelId);
                    const photo = matchedModel?.image || null;

                    return (
                      <div 
                        key={order.id}
                        className="bg-white dark:bg-dk-surface rounded-3xl border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-dk-sm dark:shadow-none hover:shadow-md dark:hover:shadow-none hover:border-slate-350 transition-all overflow-hidden flex flex-col justify-between group"
                      >
                        <div className="p-4 lg:p-5 space-y-3.5">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent uppercase tracking-widest block">{tx(lang,{fr:'Client:',ar:'العميل:',en:'Client:',es:'Cliente:',pt:'Cliente:',tr:'Müşteri:'})} {order.clientName || 'N/A'}</span>
                              <h3 
                                onClick={() => { if (onLoadModel && matchedModel) onLoadModel(matchedModel); }}
                                className={`font-bold text-slate-800 dark:text-dk-text text-sm mt-0.5 line-clamp-1 ${matchedModel ? 'hover:text-indigo-650 dark:text-dk-accent-text dark:text-dk-accent dark:hover:text-dk-accent hover:underline cursor-pointer' : ''}`}
                                title={matchedModel ? tx(lang,{fr:"Ouvrir dans l'ingénierie",ar:"فتح في الهندسة الفنية"}) : undefined}
                              >
                                {order.modelName}
                              </h3>
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              order.status === 'COMPLETED' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' :
                              order.status === 'LIVRE_PARTIEL' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50' :
                              order.status === 'IN_COUTURE' ? 'bg-purple-100 text-purple-700 dark:text-purple-400 border border-purple-200' :
                              order.status === 'IN_COUPE' ? 'bg-blue-100 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50' :
                              'bg-slate-100 dark:bg-dk-elevated text-slate-700 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border'
                            }`}>
                              {order.status === 'PENDING' ? tx(lang,{fr:'En attente',ar:'قيد الانتظار',en:'Pending',es:'Pendiente',pt:'Pendente',tr:'Beklemede'}) :
                               order.status === 'IN_COUPE' ? tx(lang,{fr:'Coupe',ar:'قص',en:'Cutting',es:'Corte',pt:'Corte',tr:'Kesim'}) :
                               order.status === 'IN_COUTURE' ? tx(lang,{fr:'Couture',ar:'خياطة',en:'Sewing',es:'Costura',pt:'Costura',tr:'Dikiş'}) :
                               order.status === 'IN_FINITION' ? tx(lang,{fr:'Finition',ar:'تشطيب',en:'Finishing',es:'Acabado',pt:'Acabamento',tr:'Bitim'}) :
                               order.status === 'LIVRE_PARTIEL' ? tx(lang,{fr:'Partiel',ar:'جزئي',en:'Partial',es:'Parcial',pt:'Parcial',tr:'Kısmi'}) : tx(lang,{fr:'Complété',ar:'مكتمل',en:'Completed',es:'Completado',pt:'Concluído',tr:'Tamamlandı'})}
                            </span>
                          </div>

                          <div className="flex gap-3 items-center">
                            <div 
                              onClick={() => { if (onLoadModel && matchedModel) onLoadModel(matchedModel); }}
                              className={`w-12 h-12 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden shrink-0 flex items-center justify-center ${matchedModel ? 'cursor-pointer hover:border-indigo-400 hover:shadow-sm dark:shadow-none transition-all' : ''}`}
                              title={matchedModel ? tx(lang,{fr:"Ouvrir dans l'ingénierie",ar:"فتح في الهندسة الفنية"}) : undefined}
                            >
                              {photo ? (
                                <img src={photo} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Building2 className="w-5 h-5 text-slate-400 dark:text-dk-muted" />
                              )}
                            </div>
                            <div className="space-y-0.5 text-[11px] flex-1">
                              <p 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSubcontractorForDetail(order.subcontractorName);
                                }}
                                className="font-bold text-indigo-600 dark:text-dk-accent hover:underline cursor-pointer flex items-center gap-1 leading-none"
                                title={tx(lang,{fr:'Voir la fiche du sous-traitant',ar:'عرض صفحة الورشة',en:'View subcontractor sheet'})}
                              >
                                <span>{tx(lang,{fr:'Atelier:',ar:'الورشة:',en:'Workshop:',es:'Taller:',pt:'Oficina:',tr:'Atölye:'})} {order.subcontractorName}</span>
                                <Eye className="w-3 h-3 text-indigo-500 shrink-0" />
                              </p>
                              {/* Rating display */}
                              <div className="flex items-center gap-1 mt-0.5">
                                <div className="flex text-amber-400 dark:text-amber-300 text-[10px]">
                                  {Array.from({ length: Math.round(order.subcontractorRating || 5) }).map((_, i) => (
                                    <span key={i}>★</span>
                                  ))}
                                  {Array.from({ length: 5 - Math.round(order.subcontractorRating || 5) }).map((_, i) => (
                                    <span key={i} className="text-slate-200 dark:text-dk-text-soft">★</span>
                                  ))}
                                </div>
                                <span className="text-[9px] text-slate-400 dark:text-dk-muted font-semibold">({order.subcontractorRating || 5}/5)</span>
                              </div>
                              <p className="text-slate-400 dark:text-dk-muted text-[10px] mt-0.5">{tx(lang,{fr:'Livraison:',ar:'التسليم:',en:'Delivery:',es:'Entrega:',pt:'Entrega:',tr:'Teslimat:'})} {new Date(order.deliveryDate).toLocaleDateString('fr-FR')}</p>
                            </div>
                          </div>

                          {/* Multi-segment Progress bar */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold">
                              <span className="text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'Progression :',ar:'التقدم:',en:'Progress:',es:'Progresión:',pt:'Progresso:',tr:'İlerleme:'})} {progress}%</span>
                              <span className="text-indigo-650 dark:text-dk-accent-text dark:text-dk-accent" dir="ltr">{(qtyAcc + qtyRep + qtyRej).toLocaleString()} / {order.totalQuantity.toLocaleString()} pcs</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-dk-elevated h-2 rounded-full overflow-hidden flex">
                              <div className="bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-950/300 h-full transition-all duration-300" style={{ width: `${accPct}%` }} title={`Accepté: ${qtyAcc}`} />
                              <div className="bg-amber-400 h-full transition-all duration-300" style={{ width: `${repPct}%` }} title={`À retoucher: ${qtyRep}`} />
                              <div className="bg-rose-50 dark:bg-rose-900/30 dark:bg-rose-950/300 h-full transition-all duration-300" style={{ width: `${rejPct}%` }} title={`Rejeté: ${qtyRej}`} />
                            </div>
                            {/* Detailed Quality Legend */}
                            <div className="flex items-center gap-3 text-[9px] font-semibold text-slate-500 dark:text-dk-muted justify-between">
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-950/300" /> {qtyAcc} ok</span>
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {qtyRep} retouche</span>
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-50 dark:bg-rose-900/30 dark:bg-rose-950/300" /> {qtyRej} rebut</span>
                            </div>
                          </div>

                          {/* Logistics Status Tags */}
                          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-slate-100 dark:border-dk-border">
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                              order.tissuStatus === 'SENT' ? 'bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-150 dark:border-emerald-800/50' : 'bg-slate-50 dark:bg-dk-bg text-slate-400 dark:text-dk-muted border-slate-150 dark:border-dk-border'
                            }`}>
                              <Layers className="w-2.5 h-2.5" />
                              {tx(lang,{fr:'Tissu',ar:'قماش',en:'Fabric',es:'Tejido',pt:'Tecido',tr:'Kumaş'})}
                            </span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                              order.fournituresStatus === 'DELIVERED' ? 'bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-150 dark:border-emerald-800/50' : 'bg-slate-50 dark:bg-dk-bg text-slate-400 dark:text-dk-muted border-slate-150 dark:border-dk-border'
                            }`}>
                              <Settings className="w-2.5 h-2.5" />
                              {tx(lang,{fr:'Fournitures',ar:'لوازم',en:'Supplies',es:'Fornituras',pt:'Acessórios',tr:'Malzemeler'})}
                            </span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                              order.ficheTechniqueSent === 1 ? 'bg-blue-50 dark:bg-blue-900/30 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-150 dark:border-blue-800/50' : 'bg-slate-50 dark:bg-dk-bg text-slate-400 dark:text-dk-muted border-slate-150 dark:border-dk-border'
                            }`}>
                              <FileText className="w-2.5 h-2.5" />
                              {tx(lang,{fr:'FT',ar:'بطاقة فنية',en:'TS',es:'FT',pt:'FT',tr:'FT'})}
                            </span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                              order.protoStatus === 'APPROVED' ? 'bg-purple-50 dark:bg-purple-900/30 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 border-purple-150 dark:border-purple-800/50' : 'bg-slate-50 dark:bg-dk-bg text-slate-400 dark:text-dk-muted border-slate-150 dark:border-dk-border'
                            }`}>
                              <ShieldCheck className="w-2.5 h-2.5" />
                              {tx(lang,{fr:'Proto',ar:'عينة',en:'Proto',es:'Proto',pt:'Proto',tr:'Proto'})}
                            </span>
                          </div>
                        </div>

                      {/* Card Actions Footer */}
                        <div className="px-5 py-3.5 bg-slate-50 dark:bg-dk-bg/50 dark:bg-dk-surface/50 border-t border-slate-100 dark:border-dk-border flex items-center justify-between gap-3 text-xs font-bold">
                          <button 
                            onClick={() => { setDetailOrder(order); setIsDetailModalOpen(true); }}
                            className="text-slate-500 dark:text-dk-muted hover:text-indigo-650 dark:text-dk-accent-text dark:text-dk-accent dark:hover:text-dk-accent transition-colors flex items-center gap-1.5"
                          >
                            <Eye className="w-4 h-4 text-slate-450 dark:text-dk-muted" />
                            <span>{tx(lang,{fr:'Consulter',ar:'عرض',en:'View',es:'Consultar',pt:'Consultar',tr:'Görüntüle'})}</span>
                          </button>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => openEditModal(order)}
                              className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent hover:text-indigo-700 dark:text-dk-accent-text dark:hover:text-dk-accent/90 transition-colors flex items-center gap-1"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>{tx(lang,{fr:'Modifier',ar:'تعديل',en:'Edit',es:'Editar',pt:'Editar',tr:'Düzenle'})}</span>
                            </button>
                            <button 
                              onClick={() => handleDeleteOrder(order.id)}
                              className="text-rose-500 dark:text-rose-400 hover:text-rose-650 dark:hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white dark:bg-dk-surface rounded-3xl border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-dk-sm dark:shadow-none overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border text-slate-500 dark:text-dk-muted font-semibold text-xs uppercase">
                        <tr>
                          <th className="px-6 py-4">{tx(lang,{fr:'Client / Modèle',ar:'العميل / الموديل',en:'Client / Model',es:'Cliente / Modelo',pt:'Cliente / Modelo',tr:'Müşteri / Model'})}</th>
                          <th className="px-6 py-4">{tx(lang,{fr:'Sous-traitant',ar:'المقاول من الباطن',en:'Subcontractor',es:'Subcontratista',pt:'Subcontratado',tr:'Taşeron'})}</th>
                          <th className="px-6 py-4">{tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</th>
                          <th className="px-6 py-4">{tx(lang,{fr:'Livraison',ar:'التسليم',en:'Delivery',es:'Entrega',pt:'Entrega',tr:'Teslimat'})}</th>
                          <th className="px-6 py-4">{tx(lang,{fr:'Statut',ar:'الحالة',en:'Status',es:'Estado',pt:'Estado',tr:'Durum'})}</th>
                          <th className="px-6 py-4 text-right">{tx(lang,{fr:'Actions',ar:'الإجراءات',en:'Actions',es:'Acciones',pt:'Ações',tr:'İşlemler'})}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-dk-border text-slate-700 dark:text-dk-text-soft bg-white dark:bg-dk-surface">
                        {filteredOrders.map(order => (
                          <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated/50 transition-colors group">
                            <td className="px-6 py-4 font-semibold">
                              <span className="text-[9px] text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent block font-normal uppercase">{order.clientName || 'N/A'}</span>
                              <span className="text-slate-900 dark:text-dk-text">{order.modelName}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-semibold block text-slate-800 dark:text-dk-text">{order.subcontractorName}</span>
                              <span className="text-xs text-slate-500 dark:text-dk-muted">{order.subcontractorPhone || tx(lang,{fr:'Pas de numéro',ar:'لا يوجد رقم',en:'No phone',es:'Sin número',pt:'Sem número',tr:'Numara yok'})}</span>
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-800 dark:text-dk-text">
                              {(order.qtyAccepted || 0).toLocaleString()} / {order.totalQuantity.toLocaleString()} pcs
                            </td>
                            <td className="px-6 py-4 text-slate-500 dark:text-dk-muted">
                              {new Date(order.deliveryDate).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="px-6 py-4">
                              <select 
                                value={order.status}
                                onChange={(e) => handleStatusChange(order.id, e.target.value)}
                                className="text-xs font-bold text-slate-700 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg p-1.5 focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent outline-none hover:bg-slate-100 dark:hover:bg-dk-elevated"
                              >
                                <option value="PENDING">{tx(lang,{fr:'En attente',ar:'قيد الانتظار',en:'Pending',es:'Pendiente',pt:'Pendente',tr:'Beklemede'})}</option>
                                <option value="IN_COUPE">{tx(lang,{fr:'En Coupe',ar:'في القص',en:'In Cutting',es:'En Corte',pt:'Em Corte',tr:'Kesimde'})}</option>
                                <option value="IN_COUTURE">{tx(lang,{fr:'En Couture',ar:'في الخياطة',en:'In Sewing',es:'En Costura',pt:'Em Costura',tr:'Dikişte'})}</option>
                                <option value="IN_FINITION">{tx(lang,{fr:'En Finition',ar:'في التشطيب',en:'In Finishing',es:'En Acabado',pt:'Em Acabamento',tr:'Bitimde'})}</option>
                                <option value="LIVRE_PARTIEL">{tx(lang,{fr:'Partiel',ar:'جزئي',en:'Partial',es:'Parcial',pt:'Parcial',tr:'Kısmi'})}</option>
                                <option value="COMPLETED">{tx(lang,{fr:'Complété',ar:'مكتمل',en:'Completed',es:'Completado',pt:'Concluído',tr:'Tamamlandı'})}</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setDetailOrder(order); setIsDetailModalOpen(true); }} className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-lg">
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button onClick={() => handlePrintDeliveryNote(order)} className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:text-dk-accent-text dark:text-dk-accent hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-lg" title={tx(lang,{fr:"Bon d'envoi",ar:'مذكرة إرسال',en:'Delivery Note',es:'Nota de Envío',pt:'Nota de Remessa',tr:'Sevk İrsaliyesi'})}>
                                  <Printer className="w-4 h-4" />
                                </button>
                                <button onClick={() => openEditModal(order)} className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:text-dk-accent-text dark:text-dk-accent hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-lg">
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteOrder(order.id)} className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 dark:text-rose-400 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-lg">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                            )}

                            {/* Floating Action Button (FAB) for Mobile/Tablet */}
                            <button
                              onClick={openAddModal}
                              className="lg:hidden fixed bottom-6 right-6 w-12 h-12 bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover dark:hover:bg-dk-accent/90 active:scale-95 text-white rounded-full shadow-lg dark:shadow-dk-lg flex items-center justify-center transition-all z-50 hover:shadow-xl border border-indigo-500 dark:border-dk-accent"
                              title={tx(lang,{fr:'Nouvelle Commande',ar:'أمر شراء جديد'})}
                            >
                              <Plus className="w-6 h-6 text-white" />
                            </button>
                          </div>
                        )}



          {/* ======================================= */}
          {/* TAB 3: STOCK & VENTES (STOCK & SALES) */}
          {/* ======================================= */}
          {activeTab === 'stock' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-dk-surface rounded-3xl border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-dk-sm dark:shadow-none overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border text-slate-500 dark:text-dk-muted font-semibold text-xs uppercase">
                      <tr>
                        <th className="px-6 py-4">{tx(lang,{fr:'Modèle',ar:'الموديل',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})}</th>
                        <th className="px-6 py-4">{tx(lang,{fr:'Date Lancement',ar:'تاريخ الإطلاق',en:'Launch Date',es:'Fecha de Inicio',pt:'Data de Lançamento',tr:'Başlangıç Tarihi'})}</th>
                        <th className="px-6 py-4">{tx(lang,{fr:'État de production',ar:'حالة الإنتاج',en:'Production Status',es:'Estado de Producción',pt:'Estado de Produção',tr:'Üretim Durumu'})}</th>
                        <th className="px-6 py-4">{tx(lang,{fr:'Produit (réalisé)',ar:'المنتج (المنجز)',en:'Produced',es:'Producido',pt:'Produzido',tr:'Üretilen'})}</th>
                        <th className="px-6 py-4">{tx(lang,{fr:'Vendu (sorti)',ar:'المباع (المخرج)',en:'Sold',es:'Vendido',pt:'Vendido',tr:'Satılan'})}</th>
                        <th className="px-6 py-4">{tx(lang,{fr:'Stock Restant',ar:'المخزون المتبقي',en:'Remaining Stock',es:'Stock Restante',pt:'Stock Restante',tr:'Kalan Stok'})}</th>
                        <th className="px-6 py-4">{tx(lang,{fr:'Prix Estimé',ar:'السعر التقديري',en:'Estimated Price',es:'Precio Estimado',pt:'Preço Estimado',tr:'Tahmini Fiyat'})}</th>
                        <th className="px-6 py-4 text-right">{tx(lang,{fr:'Actions',ar:'الإجراءات',en:'Actions',es:'Acciones',pt:'Ações',tr:'İşlemler'})}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border text-slate-700 dark:text-dk-text-soft bg-white dark:bg-dk-surface">
                      {modelStockStats.map(item => (
                        <tr key={item.model.id} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                                {item.model.image ? (
                                  <img src={item.model.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-5 h-5 text-slate-400 dark:text-dk-muted" />
                                )}
                              </div>
                              <div>
                                <span className="font-semibold block text-slate-800 dark:text-dk-text">{item.model.meta_data.nom_modele}</span>
                                <span className="text-[9px] text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent block font-normal uppercase">{tx(lang,{fr:'Client:',ar:'العميل:',en:'Client:',es:'Cliente:',pt:'Cliente:',tr:'Müşteri:'})} {item.model.ficheData?.client || 'N/A'}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-dk-muted">
                            {item.startDate}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              item.status === 'FINISHED' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' :
                              item.status === 'IN_PRODUCTION' ? 'bg-purple-100 text-purple-700 dark:text-purple-400 border border-purple-200' :
                              'bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border'
                            }`}>
                              {item.status === 'FINISHED' ? tx(lang,{fr:'Terminé',ar:'منتهٍ',en:'Finished',es:'Terminado',pt:'Terminado',tr:'Bitti'}) :
                               item.status === 'IN_PRODUCTION' ? tx(lang,{fr:'En production',ar:'قيد الإنتاج',en:'In production',es:'En producción',pt:'Em produção',tr:'Üretimde'}) :
                               tx(lang,{fr:'Inactif',ar:'غير نشط',en:'Inactive',es:'Inactivo',pt:'Inativo',tr:'Pasif'})}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-800 dark:text-dk-text">
                            {item.producedQty.toLocaleString()} pcs
                          </td>
                          <td className="px-6 py-4 font-semibold text-indigo-650 dark:text-dk-accent-text dark:text-dk-accent">
                            {item.soldQty.toLocaleString()} pcs
                          </td>
                          <td className="px-6 py-4 font-bold text-emerald-600 dark:text-emerald-400">
                            {item.remainingStock.toLocaleString()} pcs
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-800 dark:text-dk-text">
                            {item.price} MAD
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              disabled={item.remainingStock <= 0}
                              onClick={() => openSaleModal(item)}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm dark:shadow-dk-sm dark:shadow-none ${
                                item.remainingStock > 0 
                                  ? 'bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-50 dark:bg-dk-accent/20 dark:hover:bg-dk-elevated dark:bg-dk-elevated0 text-white hover:scale-[1.02]' 
                                  : 'bg-slate-100 dark:bg-dk-elevated text-slate-400 dark:text-dk-muted cursor-not-allowed border border-slate-200 dark:border-dk-border'
                              }`}
                            >
                              {tx(lang,{fr:'Sortie Facture',ar:'إخراج فاتورة',en:'Issue Invoice',es:'Emitir Factura',pt:'Emitir Fatura',tr:'Fatura Kes'})}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}


        </>
      )}

      {/* ======================================= */}
      {/* ======================================= */}
      {/* STEP 1: CHOICE MODAL (NEW ORDER CHOICE) */}
      {/* ======================================= */}
      {typeof document !== 'undefined' && isChoiceModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/70 dark:bg-black/70 backdrop-blur-md" onClick={() => setIsChoiceModalOpen(false)} />
          {/* Modal */}
          <div className="relative my-auto bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-xl overflow-hidden flex flex-col border border-slate-200 dark:border-dk-border">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-dk-accent rounded-2xl">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-dk-text text-sm sm:text-base">
                    {tx(lang, { fr: "Créer une Commande", ar: "إنشاء أمر", en: "Create an Order" })}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-dk-muted">
                    {tx(lang, { fr: "Choisissez comment vous souhaitez commencer", ar: "اختر كيف تريد البدء", en: "Choose how you want to start" })}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsChoiceModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Choice Cards Body */}
            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
              {/* Option 1: Create New Model (same as Library "Nouveau Modèle") */}
              <div 
                onClick={() => {
                  setIsChoiceModalOpen(false);
                  if (onCreateNewProject) {
                    onCreateNewProject();
                  } else {
                    onNavigate?.('library');
                  }
                }}
                className="group relative p-4 sm:p-5 rounded-2xl border-2 border-slate-200 dark:border-dk-border hover:border-indigo-500 dark:hover:border-dk-accent bg-slate-50 dark:bg-dk-bg/40 hover:bg-indigo-50/50 dark:hover:bg-dk-elevated transition-all cursor-pointer flex items-center gap-3 sm:gap-4 shadow-sm"
              >
                <div className="p-3 sm:p-3.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl shrink-0 group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 sm:w-7 sm:h-7 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-extrabold text-slate-800 dark:text-dk-text text-sm group-hover:text-indigo-600 dark:group-hover:text-dk-accent transition-colors">
                    {tx(lang, { fr: "Créer un nouveau modèle", ar: "إنشاء موديل جديد", en: "Create a new model" })}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-dk-muted mt-1 leading-relaxed">
                    {tx(lang, { 
                      fr: "Rediriger vers la bibliothèque pour concevoir un nouveau modèle de A à Z avec sa gamme opératoire.", 
                      ar: "التوجيه إلى المكتبة لتصميم موديل جديد وتحديد التسلسل التشغيلي والتكلفة.", 
                      en: "Redirect to the library to design a new model with operational sequence." 
                    })}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-dk-accent group-hover:translate-x-1 transition-all shrink-0" />
              </div>

              {/* Option 2: Select Existing Model */}
              <div 
                onClick={() => {
                  setIsChoiceModalOpen(false);
                  openOrderFormModal();
                }}
                className="group relative p-4 sm:p-5 rounded-2xl border-2 border-slate-200 dark:border-dk-border hover:border-indigo-500 dark:hover:border-dk-accent bg-slate-50 dark:bg-dk-bg/40 hover:bg-indigo-50/50 dark:hover:bg-dk-elevated transition-all cursor-pointer flex items-center gap-3 sm:gap-4 shadow-sm"
              >
                <div className="p-3 sm:p-3.5 bg-indigo-500/10 text-indigo-600 dark:text-dk-accent rounded-2xl shrink-0 group-hover:scale-110 transition-transform">
                  <Package className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-600 dark:text-dk-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-extrabold text-slate-800 dark:text-dk-text text-sm group-hover:text-indigo-600 dark:group-hover:text-dk-accent transition-colors">
                    {tx(lang, { fr: "Sélectionner un modèle existant", ar: "اختيار موديل موجود من القائمة", en: "Select an existing model" })}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-dk-muted mt-1 leading-relaxed">
                    {tx(lang, { 
                      fr: "Sélectionner un modèle déjà enregistré dans votre catalogue pour lancer immédiatement la commande de sous-traitance.", 
                      ar: "اختيار موديل مسجل في الكتالوج لبدء أمر المقاولة الفرعية مباشرة.", 
                      en: "Select a model saved in catalog to immediately start the order." 
                    })}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-dk-accent group-hover:translate-x-1 transition-all shrink-0" />
              </div>
            </div>
          </div>
        </div>
      , document.body)}
      {/* ======================================= */}
      {/* STEP 2: ADD ORDER FORM MODAL */}
      {/* ======================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 z-[200] flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
            <div className="bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50 dark:bg-dk-surface/50">
                <h2 className="font-bold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                  <Truck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent" />
                  <span>{tx(lang,{fr:'Nouvelle Commande de Sous-traitance',ar:'أمر مقاولة من الباطن جديد',en:'New Subcontract Order',es:'Nuevo Pedido de Subcontratación',pt:'Nova Encomenda de Subcontratação',tr:'Yeni Taşeron Siparişi'})}</span>
                </h2>
                <button onClick={() => setIsAddModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-650 dark:hover:text-dk-text-soft">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddOrder} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-600 dark:text-dk-text-soft">
                  <div className="space-y-5">
                    {/* Model selection with visual card & pricing */}
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                          <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                            {tx(lang,{fr:'Modèle *',ar:'الموديل *',en:'Model *',es:'Modelo *',pt:'Modelo *',tr:'Model *'})}
                          </label>
                          <select 
                            value={formModelId} 
                            onChange={(e) => handleModelChange(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white text-xs font-semibold"
                          >
                            {models.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.meta_data.nom_modele} ({m.meta_data.reference || tx(lang,{fr:'Aucune ref',ar:'لا يوجد مرجع',en:'No ref'})})
                              </option>
                            ))}
                            <option value="MANUAL">{tx(lang,{fr:'Saisie Manuelle (Sans modèle existant)',ar:'إدخال يدوي (بدون موديل موجود)',en:'Manual Entry (No existing model)'})}</option>
                          </select>
                        </div>

                      {/* Display Rich Model Visual Card if a model is selected */}
                      {selectedModelInForm && (
                        <div className="bg-slate-50 dark:bg-dk-bg/60 border border-slate-200 dark:border-dk-border p-4 rounded-2xl flex flex-col sm:flex-row gap-4 items-start sm:items-center shadow-xs">
                          <div className="w-20 h-20 rounded-xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border overflow-hidden shrink-0 flex items-center justify-center shadow-xs">
                            {selectedModelInForm.image || selectedModelInForm.images?.front ? (
                              <img src={selectedModelInForm.image || selectedModelInForm.images?.front || ''} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-8 h-8 text-slate-350 dark:text-dk-muted" />
                            )}
                          </div>
                          <div className="flex-1 space-y-1.5 w-full">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-extrabold text-slate-800 dark:text-dk-text text-sm">
                                {selectedModelInForm.meta_data.nom_modele}
                              </h4>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-dk-accent border border-indigo-200 dark:border-dk-accent/40">
                                Ref: {selectedModelInForm.meta_data.reference || 'N/A'}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-500 dark:text-dk-muted flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>{tx(lang,{fr:'Date de création:',ar:'تاريخ الإنشاء:',en:'Creation Date:'})} <strong>{selectedModelInForm.meta_data.date_creation || 'N/A'}</strong></span>
                            </p>

                            {/* Price details: Base Model Price on top, Stitching Price below */}
                            <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-dk-border/60">
                              <div className="bg-white dark:bg-dk-surface p-2.5 rounded-xl border border-slate-200 dark:border-dk-border">
                                <span className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider">
                                  {tx(lang,{fr:'Prix Modèle (Matière sans façon)',ar:'ثمن الموديل (المواد بدون خياطة)',en:'Model Cost (Raw materials)'})}
                                </span>
                                <span className="font-extrabold text-slate-800 dark:text-dk-text text-sm">
                                  {selectedModelPricing.baseModelPrice.toLocaleString()} MAD
                                </span>
                              </div>
                              <div className="bg-indigo-50/80 dark:bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800/60">
                                <span className="block text-[9px] font-extrabold text-indigo-600 dark:text-dk-accent uppercase tracking-wider">
                                  {tx(lang,{fr:'Prix de la Façon / Couture',ar:'ثمن الخياطة / الصنعة',en:'Stitching / Façon Price'})}
                                </span>
                                <span className="font-black text-indigo-700 dark:text-dk-accent text-sm">
                                  {selectedModelPricing.stitchingPrice.toLocaleString()} MAD / pc
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Subcontractor Selector with inline addition option */}
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                          {tx(lang,{fr:'Nom du Sous-traitant *',ar:'اسم المقاول من الباطن *',en:'Subcontractor Name *'})}
                        </label>
                        <select
                          value={formSubcontractorName}
                          onChange={(e) => {
                            if (e.target.value === '__NEW__') {
                              openNewProfileModal();
                              return;
                            }
                            setFormSubcontractorName(e.target.value);
                          }}
                          className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white text-xs font-semibold"
                          required
                        >
                          <option value="">{tx(lang,{fr:'Sélectionner un sous-traitant...',ar:'اختر ورشة / مقاولاً من الباطن...',en:'Select a subcontractor...'})}</option>
                          {subcontractorNames.map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                          ))}
                          <option value="__NEW__">{tx(lang,{fr:'+ Ajouter un nouveau sous-traitant',ar:'+ إضافة مقاول جديد',en:'+ Add a new subcontractor'})}</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                          {tx(lang,{fr:'Date livraison prévue',ar:'تاريخ التسليم المتوقع',en:'Expected delivery date'})}
                        </label>
                        <input 
                          type="date" 
                          value={batches[0].deliveryDate} 
                          onChange={(e) => setBatches(prev => {
                            const updated = [...prev];
                            updated[0].deliveryDate = e.target.value;
                            return updated;
                          })}
                          className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white text-xs"
                        />
                      </div>
                    </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Quantité Totale *',ar:'الكمية الإجمالية *',en:'Total Quantity *',es:'Cantidad Total *',pt:'Quantidade Total *',tr:'Toplam Miktar *'})}</label>
                      <input 
                        type="number" 
                        value={formTotalQuantity || ''} 
                        onChange={(e) => setFormTotalQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Tarif par pièce (MAD)',ar:'سعر القطعة (MAD)',en:'Price per piece (MAD)',es:'Precio por pieza (MAD)',pt:'Preço por peça (MAD)',tr:'Birim fiyat (MAD)'})}</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={formPricePerPiece || ''} 
                        onChange={(e) => setFormPricePerPiece(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                      />
                    </div>
                  </div>
                </div>

              <div className="flex gap-3 justify-end border-t border-slate-150 dark:border-dk-border pt-4 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated text-slate-500 dark:text-dk-muted rounded-xl font-bold transition-all"
                >
                  {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-50 dark:bg-dk-accent/20 dark:hover:bg-dk-elevated dark:bg-dk-elevated0 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md dark:shadow-dk-md flex items-center gap-2 border border-indigo-500 dark:border-dk-accent/50"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{tx(lang,{fr:'Créer la Commande',ar:'إنشاء الطلبية',en:'Create Order',es:'Crear Pedido',pt:'Criar Encomenda',tr:'Sipariş Oluştur'})}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* NEW SUBCONTRACTOR MODAL (صفحة إضافة ورشة جديدة) */}
      {/* ======================================= */}
      {isNewSubModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 z-[220] flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-xl overflow-hidden flex flex-col border border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600 dark:bg-dk-accent text-white rounded-2xl shadow-sm">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-dk-text text-base">
                    {tx(lang,{fr:'Nouveau Sous-traitant',ar:'مقاول جديد / ورشة جديدة',en:'New Subcontractor'})}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-dk-muted">
                    {tx(lang,{fr:'Enregistrer un nouvel atelier de façon',ar:'تسجيل ورشة / مقاول جديد للعمل',en:'Register a new subcontracting workshop'})}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsNewSubModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (!formSubcontractorName.trim()) return;
                setIsNewSubModalOpen(false);
              }}
              className="p-6 space-y-5"
            >
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                  {tx(lang,{fr:'Nom de l\'atelier / Sous-traitant *',ar:'اسم الورشة / المقاول *',en:'Workshop / Subcontractor Name *'})}
                </label>
                <input 
                  type="text"
                  autoFocus
                  value={formSubcontractorName} 
                  onChange={(e) => setFormSubcontractorName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white text-xs font-semibold"
                  placeholder={tx(lang,{fr:'Ex: Atelier Ouali, Confection Atlas...',ar:'مثال: ورشة الولي، خياطة أطلس...',en:'E.g.: Ouali Workshop, Atlas Confection...'})}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                  {tx(lang,{fr:'Téléphone',ar:'الهاتف',en:'Phone'})}
                </label>
                <input 
                  type="text"
                  value={formSubcontractorPhone} 
                  onChange={(e) => setFormSubcontractorPhone(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white text-xs"
                  placeholder="+212..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                    {tx(lang,{fr:'Évaluation (0-5)',ar:'التقييم (0-5)',en:'Rating (0-5)'})}
                  </label>
                  <input 
                    type="number" 
                    min="0" 
                    max="5" 
                    step="0.5"
                    value={formSubcontractorRating} 
                    onChange={(e) => setFormSubcontractorRating(parseFloat(e.target.value) || 5)}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                    {tx(lang,{fr:'Disponibilité',ar:'التوفر',en:'Availability'})}
                  </label>
                  <input 
                    type="date" 
                    value={formSubcontractorAvailabilityDate} 
                    onChange={(e) => setFormSubcontractorAvailabilityDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white text-xs"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-dk-border">
                <button 
                  type="button" 
                  onClick={() => setIsNewSubModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated text-slate-500 dark:text-dk-muted rounded-xl text-xs font-bold transition-all"
                >
                  {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel'})}
                </button>
                <button 
                  type="submit"
                  className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-50 dark:bg-dk-accent/20 dark:hover:bg-dk-elevated dark:bg-dk-elevated0 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md dark:shadow-dk-md flex items-center gap-2 border border-indigo-500 dark:border-dk-accent/50"
                >
                  <Check className="w-4 h-4" />
                  <span>{tx(lang,{fr:'Ajouter & Continuer',ar:'إضافة ومتابعة',en:'Add & Continue'})}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* EDIT ORDER MODAL */}
      {/* ======================================= */}
      {isEditModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 z-[200] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50 dark:bg-dk-surface/50">
              <h2 className="font-bold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent" />
                <span>{tx(lang,{fr:'Modifier la Commande de Sous-traitance',ar:'تعديل أمر المقاولة من الباطن',en:'Edit Subcontract Order',es:'Editar Pedido de Subcontratación',pt:'Editar Encomenda de Subcontratação',tr:'Taşeron Siparişini Düzenle'})}</span>
              </h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-650 dark:hover:text-dk-text-soft">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Internal Form Navigation */}
            <div className="flex border-b border-slate-150 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-6 gap-4 shrink-0 text-xs font-bold">
              <button 
                type="button"
                onClick={() => setModalFormTab('general')}
                className={`py-3 border-b-2 ${modalFormTab === 'general' ? 'text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent border-indigo-600 dark:border-dk-accent' : 'text-slate-500 dark:text-dk-muted border-transparent'}`}
              >
                {tx(lang,{fr:'Général & Quantités',ar:'عام والكميات',en:'General & Quantities',es:'General y Cantidades',pt:'Geral e Quantidades',tr:'Genel ve Miktarlar'})}
              </button>
            </div>

            <form onSubmit={handleEditOrder} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-600 dark:text-dk-text-soft">
              {modalFormTab === 'general' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Modèle *',ar:'الموديل *',en:'Model *',es:'Modelo *',pt:'Modelo *',tr:'Model *'})}</label>
                      <select 
                        value={formModelId} 
                        onChange={(e) => handleModelChange(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>{m.meta_data.nom_modele} ({m.meta_data.reference || tx(lang,{fr:'Aucune ref',ar:'لا يوجد مرجع',en:'No ref',es:'Sin ref',pt:'Sem ref',tr:'Referans yok'})})</option>
                        ))}
                        <option value="MANUAL">{tx(lang,{fr:'Saisie Manuelle (Sans modèle existant)',ar:'إدخال يدوي (بدون موديل موجود)',en:'Manual Entry (No existing model)',es:'Entrada Manual (Sin modelo existente)',pt:'Inserção Manual (Sem modelo existente)',tr:'Manuel Giriş (Mevcut model yok)'})}</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Nom du Client',ar:'اسم العميل',en:'Client Name',es:'Nombre del Cliente',pt:'Nome do Cliente',tr:'Müşteri Adı'})}</label>
                      <input 
                        type="text" 
                        value={formClientName} 
                        onChange={(e) => setFormClientName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                        placeholder={tx(lang,{fr:"Nom du client donneur d'ordre",ar:'اسم العميل صاحب الطلب',en:'Ordering client name',es:'Nombre del cliente ordenante',pt:'Nome do cliente mandante',tr:'Sipariş veren müşteri adı'})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Nom du Sous-traitant *',ar:'اسم المقاول من الباطن *',en:'Subcontractor Name *',es:'Nombre del Subcontratista *',pt:'Nome do Subcontratado *',tr:'Taşeron Adı *'})}</label>
                      <input 
                        type="text" 
                        value={formSubcontractorName} 
                        onChange={(e) => setFormSubcontractorName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                        placeholder={tx(lang,{fr:'Atelier externe',ar:'ورشة خارجية',en:'External workshop',es:'Taller externo',pt:'Oficina externa',tr:'Harici atölye'})}
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Téléphone',ar:'الهاتف',en:'Phone',es:'Teléfono',pt:'Telefone',tr:'Telefon'})}</label>
                      <input 
                        type="text" 
                        value={formSubcontractorPhone} 
                        onChange={(e) => setFormSubcontractorPhone(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                        placeholder="+212..."
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Date livraison prévue *',ar:'تاريخ التسليم المتوقع *',en:'Expected delivery date *',es:'Fecha de entrega prevista *',pt:'Data de entrega prevista *',tr:'Beklenen teslimat tarihi *'})}</label>
                      <input 
                        type="date" 
                        value={batches[0].deliveryDate} 
                        onChange={(e) => setBatches(prev => {
                          const updated = [...prev];
                          updated[0].deliveryDate = e.target.value;
                          return updated;
                        })}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Quantité Totale *',ar:'الكمية الإجمالية *',en:'Total Quantity *',es:'Cantidad Total *',pt:'Quantidade Total *',tr:'Toplam Miktar *'})}</label>
                      <input 
                        type="number" 
                        value={formTotalQuantity || ''} 
                        onChange={(e) => setFormTotalQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Tarif par pièce (MAD)',ar:'سعر القطعة (MAD)',en:'Price per piece (MAD)',es:'Precio por pieza (MAD)',pt:'Preço por peça (MAD)',tr:'Birim fiyat (MAD)'})}</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={formPricePerPiece || ''} 
                        onChange={(e) => setFormPricePerPiece(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5 col-span-2 md:col-span-1">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Note / Instruction',ar:'ملاحظة / تعليمات',en:'Note / Instruction',es:'Nota / Instrucción',pt:'Nota / Instrução',tr:'Not / Talimat'})}</label>
                      <input 
                        type="text" 
                        value={formNotes} 
                        onChange={(e) => setFormNotes(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                        placeholder={tx(lang,{fr:'Détails logistiques...',ar:'تفاصيل لوجستية...',en:'Logistics details...',es:'Detalles logísticos...',pt:'Detalhes logísticos...',tr:'Lojistik detaylar...'})}
                      />
                    </div>
                  </div>

                  {/* Grid matrix colors & sizes */}
                  <div className="border border-slate-200 dark:border-dk-border rounded-2xl p-4 bg-slate-50 dark:bg-dk-bg/50 dark:bg-dk-surface/50 space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <span className="font-bold text-slate-800 dark:text-dk-text">{tx(lang,{fr:'Matrice Couleur - Taille (Facultatif)',ar:'مصفوفة اللون - المقاس (اختياري)',en:'Color - Size Matrix (Optional)',es:'Matriz Color - Talla (Opcional)',pt:'Matriz Cor - Tamanho (Opcional)',tr:'Renk - Beden Matrisi (İsteğe Bağlı)'})}</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          placeholder={tx(lang,{fr:'Ajouter couleur',ar:'إضافة لون',en:'Add color',es:'Añadir color',pt:'Adicionar cor',tr:'Renk ekle'})} 
                          value={newColorInput} 
                          onChange={(e) => setNewColorInput(e.target.value)}
                          className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-1 text-[11px] outline-none text-slate-800 dark:text-dk-text focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent"
                        />
                        <button 
                          type="button" 
                          onClick={handleAddColor}
                          className="bg-indigo-600 dark:bg-dk-accent text-white px-3 py-1 rounded-lg hover:bg-indigo-50 dark:bg-dk-accent/20 dark:hover:bg-dk-elevated dark:bg-dk-elevated0 font-bold transition-all text-[11px]"
                        >
                          {tx(lang,{fr:'Ajouter',ar:'إضافة',en:'Add',es:'Añadir',pt:'Adicionar',tr:'Ekle'})}
                        </button>
                      </div>
                    </div>

                    {Object.keys(batches[0].grid).length === 0 ? (
                      <p className="text-[11px] text-slate-500 dark:text-dk-muted italic">{tx(lang,{fr:'Aucune couleur configurée. Le lot sera traité de manière globale.',ar:'لم يتم تكوين أي لون. سيتم معالجة الدفعة بشكل إجمالي.',en:'No color configured. The batch will be processed globally.',es:'Ningún color configurado. El lote se procesará de forma global.',pt:'Nenhuma cor configurada. O lote será processado globalmente.',tr:'Hiçbir renk yapılandırılmadı. Parti genel olarak işlenecek.'})}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted font-bold">
                              <th className="py-2 pr-4">{tx(lang,{fr:'Couleur',ar:'اللون',en:'Color',es:'Color',pt:'Cor',tr:'Renk'})}</th>
                              {COMMON_SIZES.map(sz => <th key={sz} className="py-2 px-1 text-center">{sz}</th>)}
                              <th className="py-2 text-right">{tx(lang,{fr:'Action',ar:'إجراء',en:'Action',es:'Acción',pt:'Ação',tr:'İşlem'})}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                            {Object.entries(batches[0].grid).map(([color, sizesObj]) => (
                              <tr key={color}>
                                <td className="py-2 pr-4 font-semibold text-slate-700 dark:text-dk-text-soft">{color}</td>
                                {COMMON_SIZES.map(sz => (
                                  <td key={sz} className="py-1 px-1">
                                    <input 
                                      type="number"
                                      value={sizesObj[sz] || ''}
                                      onChange={(e) => handleUpdateGridQty(color, sz, parseInt(e.target.value) || 0)}
                                      className="w-12 text-center bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border rounded p-1 text-xs focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent outline-none"
                                    />
                                  </td>
                                ))}
                                <td className="py-2 text-right">
                                  <button type="button" onClick={() => handleRemoveColor(color)} className="text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-400">
                                    <Trash2 className="w-4 h-4 inline" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end border-t border-slate-150 dark:border-dk-border pt-4 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated text-slate-500 dark:text-dk-muted rounded-xl font-bold transition-all"
                >
                  {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-50 dark:bg-dk-accent/20 dark:hover:bg-dk-elevated dark:bg-dk-elevated0 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md dark:shadow-dk-md flex items-center gap-2 border border-indigo-500 dark:border-dk-accent/50"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{tx(lang,{fr:'Enregistrer',ar:'حفظ',en:'Save',es:'Guardar',pt:'Guardar',tr:'Kaydet'})}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* DETAILED VIEW MODAL */}
      {/* ======================================= */}
      {isDetailModalOpen && detailOrder && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-750 dark:text-dk-text">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/55 dark:bg-dk-surface/55">
              <h2 className="font-bold text-slate-800 dark:text-dk-text text-base">{tx(lang,{fr:'Fiche de Commande Sous-traitance',ar:'بطاقة أمر المقاولة من الباطن',en:'Subcontract Order Sheet',es:'Ficha de Pedido de Subcontratación',pt:'Ficha de Encomenda de Subcontratação',tr:'Taşeron Sipariş Kartı'})}</h2>
              <button onClick={() => setIsDetailModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-dk-bg/75 dark:bg-dk-surface/75 p-4 rounded-xl border border-slate-150 dark:border-dk-border">
                  <span className="text-[9px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-widest block">{tx(lang,{fr:'Sous-traitant',ar:'المقاول من الباطن',en:'Subcontractor',es:'Subcontratista',pt:'Subcontratado',tr:'Taşeron'})}</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-dk-text mt-1 block">{detailOrder.subcontractorName}</span>
                  {detailOrder.subcontractorPhone && <span className="text-slate-500 dark:text-dk-muted block mt-1">{tx(lang,{fr:'Tél:',ar:'الهاتف:',en:'Tel:',es:'Tel:',pt:'Tel:',tr:'Tel:'})} {detailOrder.subcontractorPhone}</span>}
                </div>
                <div className="bg-slate-50 dark:bg-dk-bg/75 dark:bg-dk-surface/75 p-4 rounded-xl border border-slate-150 dark:border-dk-border">
                  <span className="text-[9px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-widest block">{tx(lang,{fr:'Client Donneur d\'Ordre',ar:'العميل صاحب الطلب',en:'Ordering Client',es:'Cliente Ordenante',pt:'Cliente Mandante',tr:'Sipariş Veren Müşteri'})}</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-dk-text mt-1 block">{detailOrder.clientName || 'N/A'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 dark:bg-dk-bg/75 dark:bg-dk-surface/75 p-4 rounded-xl border border-slate-150 dark:border-dk-border">
                <div>
                  <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Modèle',ar:'الموديل',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})}</span>
                  <span 
                    onClick={() => {
                      const matched = models.find(m => m.id === detailOrder.modelId);
                      if (onLoadModel && matched) {
                        onLoadModel(matched);
                        setIsDetailModalOpen(false);
                      }
                    }}
                    className={`font-bold text-slate-800 dark:text-dk-text block mt-0.5 ${models.find(m => m.id === detailOrder.modelId) ? 'hover:text-indigo-650 dark:text-dk-accent-text dark:text-dk-accent dark:hover:text-dk-accent hover:underline cursor-pointer' : ''}`}
                    title={models.find(m => m.id === detailOrder.modelId) ? tx(lang,{fr:"Ouvrir dans l'ingénierie",ar:"فتح في الهندسة الفنية"}) : undefined}
                  >
                    {detailOrder.modelName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Quantité totale',ar:'الكمية الإجمالية',en:'Total quantity',es:'Cantidad total',pt:'Quantidade total',tr:'Toplam miktar'})}</span>
                  <span className="font-bold text-slate-800 dark:text-dk-text">{detailOrder.totalQuantity.toLocaleString()} pcs</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Tarif unitaire',ar:'السعر الوحدة',en:'Unit price',es:'Precio unitario',pt:'Preço unitário',tr:'Birim fiyat'})}</span>
                  <span className="font-bold text-slate-800 dark:text-dk-text">{detailOrder.pricePerPiece || 0} MAD</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Date livraison',ar:'تاريخ التسليم',en:'Delivery date',es:'Fecha de entrega',pt:'Data de entrega',tr:'Teslimat tarihi'})}</span>
                  <span className="font-bold text-slate-800 dark:text-dk-text">{new Date(detailOrder.deliveryDate).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>

              {/* Status details */}
              <div className="bg-slate-50 dark:bg-dk-bg/75 dark:bg-dk-surface/75 border border-slate-150 dark:border-dk-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Matière (Tissu)',ar:'المادة (القماش)',en:'Material (Fabric)',es:'Material (Tela)',pt:'Material (Tecido)',tr:'Malzeme (Kumaş)'})}</span>
                  <span className={`font-bold text-xs ${detailOrder.tissuStatus === 'SENT' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {detailOrder.tissuStatus === 'SENT' ? tx(lang,{fr:'Expédié',ar:'تم الشحن',en:'Shipped',es:'Enviado',pt:'Expedido',tr:'Sevk Edildi'}) : tx(lang,{fr:'En attente',ar:'قيد الانتظار',en:'Pending',es:'Pendiente',pt:'Pendente',tr:'Beklemede'})}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Fournitures',ar:'اللوازم',en:'Supplies',es:'Suministros',pt:'Fornecimentos',tr:'Malzemeler'})}</span>
                  <span className={`font-bold text-xs ${detailOrder.fournituresStatus === 'DELIVERED' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {detailOrder.fournituresStatus === 'DELIVERED' ? tx(lang,{fr:'Livrées',ar:'تم التسليم',en:'Delivered',es:'Entregado',pt:'Entregue',tr:'Teslim Edildi'}) : tx(lang,{fr:'En attente',ar:'قيد الانتظار',en:'Pending',es:'Pendiente',pt:'Pendente',tr:'Beklemede'})}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Statut Prototype',ar:'حالة النموذج الأولي',en:'Prototype Status',es:'Estado del Prototipo',pt:'Estado do Protótipo',tr:'Prototip Durumu'})}</span>
                  <span className={`font-bold text-xs ${detailOrder.protoStatus === 'APPROVED' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {detailOrder.protoStatus === 'APPROVED' ? tx(lang,{fr:'Validé',ar:'معتمد',en:'Approved',es:'Validado',pt:'Validado',tr:'Onaylandı'}) : tx(lang,{fr:'En attente',ar:'قيد الانتظار',en:'Pending',es:'Pendiente',pt:'Pendente',tr:'Beklemede'})}
                  </span>
                </div>
              </div>

              {/* Quantity analysis details */}
              <div className="border border-slate-200 dark:border-dk-border rounded-2xl p-4 space-y-3 bg-slate-50 dark:bg-dk-bg/50 dark:bg-dk-surface/50">
                <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide">{tx(lang,{fr:'État des pièces livrées',ar:'حالة القطع المسلَّمة',en:'Status of delivered pieces',es:'Estado de las piezas entregadas',pt:'Estado das peças entregues',tr:'Teslim edilen parçaların durumu'})}</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
                    <span className="text-emerald-800 dark:text-emerald-300 font-bold block text-[9px] uppercase tracking-wide">{tx(lang,{fr:'Acceptées',ar:'مقبولة',en:'Accepted',es:'Aceptadas',pt:'Aceites',tr:'Kabul Edilen'})}</span>
                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block">{(detailOrder.qtyAccepted || 0).toLocaleString()} pcs</span>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/50">
                    <span className="text-amber-800 dark:text-amber-300 font-bold block text-[9px] uppercase tracking-wide">{tx(lang,{fr:'À retoucher',ar:'قيد التعديل',en:'To rework',es:'Por retocar',pt:'Por retocar',tr:'Rötus yapılacak'})}</span>
                    <span className="text-base font-extrabold text-amber-600 dark:text-amber-400 mt-1 block">{(detailOrder.qtyToRepair || 0).toLocaleString()} pcs</span>
                  </div>
                  <div className="bg-rose-50 dark:bg-rose-900/30 dark:bg-rose-950/30 p-2.5 rounded-xl border border-rose-100">
                    <span className="text-rose-800 dark:text-rose-400 font-bold block text-[9px] uppercase tracking-wide">{tx(lang,{fr:'Rejetées',ar:'مرفوضة',en:'Rejected',es:'Rechazadas',pt:'Rejeitadas',tr:'Reddedilen'})}</span>
                    <span className="text-base font-extrabold text-rose-650 dark:text-rose-400 mt-1 block">{(detailOrder.qtyRejected || 0).toLocaleString()} pcs</span>
                  </div>
                </div>
              </div>

              {detailOrder.notes && (
                <div className="bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-dk-elevated/70 p-3.5 border border-indigo-100 rounded-xl">
                  <span className="text-[10px] font-bold text-indigo-700 dark:text-dk-accent-text dark:text-dk-accent block uppercase tracking-wide">{tx(lang,{fr:'Instructions',ar:'تعليمات',en:'Instructions',es:'Instrucciones',pt:'Instruções',tr:'Talimatlar'})}</span>
                  <p className="mt-1 font-semibold text-indigo-950 dark:text-dk-accent italic">{detailOrder.notes}</p>
                </div>
              )}

              {detailOrder.modelId && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-dk-border">
                  <InlineInvoiceList
                    productId={detailOrder.modelId}
                    productLabel={detailOrder.modelName || ''}
                    sourceModule="sousTraitance"
                  />
                </div>
              )}
            </div>

            <div className="bg-slate-50 dark:bg-dk-bg border-t border-slate-100 dark:border-dk-border px-6 py-4 flex gap-3 justify-end text-xs font-bold">
              <button 
                onClick={() => handlePrintDeliveryNote(detailOrder)} 
                className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated text-slate-700 dark:text-dk-text-soft px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm dark:shadow-dk-sm dark:shadow-none transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>{tx(lang,{fr:"Imprimer Bon d'Envoi",ar:'طباعة مذكرة الإرسال',en:'Print Delivery Note',es:'Imprimir Nota de Envío',pt:'Imprimir Nota de Remessa',tr:'Sevk İrsaliyesi Yazdır'})}</span>
              </button>
              <button 
                onClick={() => setIsDetailModalOpen(false)}
                className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-550 text-white px-5 py-2.5 rounded-xl shadow dark:shadow-dk-sm transition-all border border-indigo-600 dark:border-dk-accent"
              >
                {tx(lang,{fr:'Fermer',ar:'إغلاق',en:'Close',es:'Cerrar',pt:'Fechar',tr:'Kapat'})}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* SALE INVOICE MODAL (TAB 3 ACTION) */}
      {/* ======================================= */}
      {isSaleModalOpen && selectedModelForSale && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] text-slate-850 dark:text-dk-text">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/55 dark:bg-dk-surface/55">
              <h2 className="font-bold text-slate-850 dark:text-dk-text text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent" />
                <span>{tx(lang,{fr:'Générer une facture de sortie de stock (Vente)',ar:'إنشاء فاتورة إخراج من المخزون (بيع)',en:'Generate stock exit invoice (Sale)',es:'Generar factura de salida de stock (Venta)',pt:'Gerar fatura de saída de stock (Venda)',tr:'Stok çıkış faturası oluştur (Satış)'})}</span>
              </h2>
              <button onClick={() => setIsSaleModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSaleInvoice} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700 dark:text-dk-text-soft">
              {/* Invoice structured details */}
              <div className="bg-slate-50 dark:bg-dk-bg/75 dark:bg-dk-surface/75 rounded-2xl p-4 border border-slate-150 dark:border-dk-border space-y-4">
                <h3 className="font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider text-[9px]">{tx(lang,{fr:'Informations Facture',ar:'معلومات الفاتورة',en:'Invoice Information',es:'Información de Factura',pt:'Informações da Fatura',tr:'Fatura Bilgileri'})}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'N° Facture',ar:'رقم الفاتورة',en:'Invoice N°',es:'N° Factura',pt:'N° Fatura',tr:'Fatura No'})}</label>
                    <input 
                      type="text"
                      value={saleInvoiceNumber}
                      onChange={(e) => setSaleInvoiceNumber(e.target.value)}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text font-bold outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Nom du client *',ar:'اسم العميل *',en:'Client Name *',es:'Nombre del Cliente *',pt:'Nome do Cliente *',tr:'Müşteri Adı *'})}</label>
                    <input 
                      type="text"
                      value={saleClient}
                      onChange={(e) => setSaleClient(e.target.value)}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
                      placeholder={tx(lang,{fr:"Nom de l'acheteur",ar:'اسم المشتري',en:'Buyer name',es:'Nombre del comprador',pt:'Nome do comprador',tr:'Alıcı adı'})}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">ICE {tx(lang,{fr:'Client',ar:'العميل',en:'Client',es:'Cliente',pt:'Cliente',tr:'Müşteri'})}</label>
                    <input 
                      type="text"
                      value={saleClientIce}
                      onChange={(e) => setSaleClientIce(e.target.value)}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
                      placeholder="ICE"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">RC {tx(lang,{fr:'Client',ar:'العميل',en:'Client',es:'Cliente',pt:'Cliente',tr:'Müşteri'})}</label>
                    <input 
                      type="text"
                      value={saleClientRc}
                      onChange={(e) => setSaleClientRc(e.target.value)}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
                      placeholder="RC"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Téléphone',ar:'الهاتف',en:'Phone',es:'Teléfono',pt:'Telefone',tr:'Telefon'})}</label>
                    <input 
                      type="text"
                      value={saleClientTel}
                      onChange={(e) => setSaleClientTel(e.target.value)}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Adresse de livraison',ar:'عنوان التسليم',en:'Delivery address',es:'Dirección de entrega',pt:'Morada de entrega',tr:'Teslimat adresi'})}</label>
                    <input 
                      type="text"
                      value={saleClientAdresse}
                      onChange={(e) => setSaleClientAdresse(e.target.value)}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
                      placeholder={tx(lang,{fr:'Adresse',ar:'العنوان',en:'Address',es:'Dirección',pt:'Morada',tr:'Adres'})}
                    />
                  </div>
                </div>
              </div>

              {/* Items Grid */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider text-[9px]">{tx(lang,{fr:'Lignes de facturation',ar:'بنود الفاتورة',en:'Invoice Lines',es:'Líneas de Facturación',pt:'Linhas de Faturação',tr:'Fatura Kalemleri'})}</h3>
                <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden bg-slate-50 dark:bg-dk-bg/30">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-dk-bg border-b border-slate-150 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold">
                      <tr>
                        <th className="px-4 py-3">{tx(lang,{fr:'Désignation',ar:'البيان',en:'Description',es:'Designación',pt:'Designação',tr:'Açıklama'})}</th>
                        <th className="px-4 py-3 text-center w-28">{tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</th>
                        <th className="px-4 py-3 text-center w-36">{tx(lang,{fr:'Prix Unitaire (MAD)',ar:'السعر الوحدة (MAD)',en:'Unit Price (MAD)',es:'Precio Unitario (MAD)',pt:'Preço Unitário (MAD)',tr:'Birim Fiyat (MAD)'})}</th>
                        <th className="px-4 py-3 text-right w-40">{tx(lang,{fr:'Total HT',ar:'الإجمالي HT',en:'Total HT',es:'Total HT',pt:'Total HT',tr:'Toplam HT'})}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 dark:divide-dk-border text-slate-700 dark:text-dk-text-soft bg-white dark:bg-dk-surface">
                      <tr>
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-dk-text">
                          {tx(lang,{fr:'Modèle:',ar:'الموديل:',en:'Model:',es:'Modelo:',pt:'Modelo:',tr:'Model:'})} {selectedModelForSale.meta_data.nom_modele}
                          <span className="text-[10px] text-slate-500 dark:text-dk-muted block font-normal mt-0.5">{tx(lang,{fr:'Réf:',ar:'المرجع:',en:'Ref:',es:'Ref:',pt:'Ref:',tr:'Ref:'})} {selectedModelForSale.meta_data.reference || tx(lang,{fr:'Aucune',ar:'لا يوجد',en:'None',es:'Ninguna',pt:'Nenhuma',tr:'Yok'})}</span>
                        </td>
                        <td className="px-4 py-3">
                          <input 
                            type="number"
                            value={saleQuantity || ''}
                            onChange={(e) => setSaleQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border rounded-lg p-2 text-center text-xs focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent outline-none"
                            required
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input 
                            type="number"
                            value={salePrice || ''}
                            onChange={(e) => setSalePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border rounded-lg p-2 text-center text-xs focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent outline-none"
                            required
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent">
                          {(saleQuantity * salePrice).toLocaleString()} MAD
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals & Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Taux TVA (%)',ar:'نسبة TVA',en:'VAT Rate (%)',es:'Tipo de IVA (%)',pt:'Taxa de IVA (%)',tr:'KDV Oranı (%)'})}</label>
                    <select 
                      value={saleTvaRate} 
                      onChange={(e) => setSaleTvaRate(parseInt(e.target.value))}
                      className="w-full border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent"
                    >
                      <option value="20">{tx(lang,{fr:'20% (Standard)',ar:'20% (قياسي)',en:'20% (Standard)',es:'20% (Estándar)',pt:'20% (Padrão)',tr:'%20 (Standart)'})}</option>
                      <option value="14">14%</option>
                      <option value="10">10%</option>
                      <option value="7">7%</option>
                      <option value="0">{tx(lang,{fr:'0% (Exonéré)',ar:'0% (معفى)',en:'0% (Exempt)',es:'0% (Exento)',pt:'0% (Isento)',tr:'%0 (Muaf)'})}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Statut de la facture',ar:'حالة الفاتورة',en:'Invoice Status',es:'Estado de la Factura',pt:'Estado da Fatura',tr:'Fatura Durumu'})}</label>
                    <select 
                      value={saleStatus} 
                      onChange={(e: any) => setSaleStatus(e.target.value)}
                      className="w-full border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent"
                    >
                      <option value="BROUILLON">{tx(lang,{fr:'Brouillon',ar:'مسودة',en:'Draft',es:'Borrador',pt:'Rascunho',tr:'Taslak'})}</option>
                      <option value="ENVOYEE">{tx(lang,{fr:'Envoyée au client',ar:'أرسلت للعميل',en:'Sent to client',es:'Enviada al cliente',pt:'Enviada ao cliente',tr:'Müşteriye gönderildi'})}</option>
                      <option value="PAYEE">{tx(lang,{fr:'Payée / Encaissée',ar:'مدفوعة / مقبوضة',en:'Paid / Received',es:'Pagada / Cobrada',pt:'Paga / Recebida',tr:'Ödendi / Tahsil Edildi'})}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Note interne / Observation',ar:'ملاحظة داخلية',en:'Internal Note / Remark',es:'Nota interna / Observación',pt:'Nota interna / Observação',tr:'Dahili Not / Gözlem'})}</label>
                    <textarea 
                      value={saleNotes}
                      onChange={(e) => setSaleNotes(e.target.value)}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 outline-none h-16 text-slate-800 dark:text-dk-text focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent"
                    />
                  </div>
                </div>

                {/* Calculations preview box */}
                <div className="bg-slate-50 dark:bg-dk-bg/75 dark:bg-dk-surface/75 rounded-2xl p-5 border border-slate-150 dark:border-dk-border space-y-3 ml-auto w-full md:w-80">
                  <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wider text-[10px] border-b border-slate-150 dark:border-dk-border pb-2">{tx(lang,{fr:'Récapitulatif',ar:'الملخص',en:'Summary',es:'Resumen',pt:'Resumo',tr:'Özet'})}</h4>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'Montant HT',ar:'المبلغ HT',en:'HT Amount',es:'Importe HT',pt:'Valor HT',tr:'HT Tutarı'})}</span>
                    <span className="text-slate-800 dark:text-dk-text">{(saleQuantity * salePrice).toLocaleString()} MAD</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'TVA',ar:'TVA',en:'VAT',es:'IVA',pt:'IVA',tr:'KDV'})} ({saleTvaRate}%)</span>
                    <span className="text-slate-800 dark:text-dk-text">{((saleQuantity * salePrice * saleTvaRate) / 100).toLocaleString()} MAD</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-slate-150 dark:border-dk-border pt-2 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent">
                    <span>{tx(lang,{fr:'Total TTC',ar:'الإجمالي TTC',en:'Total TTC',es:'Total TTC',pt:'Total TTC',tr:'Toplam TTC'})}</span>
                    <span>{((saleQuantity * salePrice) * (1 + saleTvaRate / 100)).toLocaleString()} MAD</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end border-t border-slate-150 dark:border-dk-border pt-4 mt-6">
                <button 
                  type="button" 
                  onClick={handlePrintSaleInvoice}
                  className="px-4 py-2 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated text-slate-700 dark:text-dk-text-soft rounded-xl font-bold flex items-center gap-2 shadow-sm dark:shadow-dk-sm dark:shadow-none transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>{tx(lang,{fr:'Imprimer la Facture',ar:'طباعة الفاتورة',en:'Print Invoice',es:'Imprimir Factura',pt:'Imprimir Fatura',tr:'Fatura Yazdır'})}</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsSaleModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated text-slate-500 dark:text-dk-muted rounded-xl font-bold transition-all"
                >
                  {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-550 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md dark:shadow-dk-md flex items-center gap-2 border border-indigo-600 dark:border-dk-accent"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{tx(lang,{fr:'Enregistrer la Sortie',ar:'حفظ الإخراج',en:'Save Exit',es:'Guardar Salida',pt:'Guardar Saída',tr:'Çıkışı Kaydet'})}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* SPECIAL SUBCONTRACTOR PROFILE MODAL (صفحة خاصة لكل ورشة) */}
      {/* ========================================================== */}
      {selectedSubcontractorForDetail && (() => {
        const subData = subcontractorStats.find(s => s.name === selectedSubcontractorForDetail) || {
          name: selectedSubcontractorForDetail,
          phone: tx(lang,{fr:'Non spécifié',ar:'غير محدد',en:'Not specified'}),
          orderCount: 0,
          totalQty: 0,
          deliveredQty: 0,
          remainingQty: 0,
          avgRating: 5,
          availabilityDate: ''
        };
        const subOrders = orders.filter(o => o.subcontractorName === selectedSubcontractorForDetail);
        const completionPct = subData.totalQty > 0 ? Math.min(100, Math.round((subData.deliveredQty / subData.totalQty) * 100)) : 0;

        return (
          <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 z-[250] flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
            <div className="bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-600 dark:bg-dk-accent text-white rounded-2xl shadow-sm">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-black text-slate-800 dark:text-dk-text text-lg flex items-center gap-2">
                      <span>{subData.name}</span>
                      {subData.avgRating > 0 && (
                        <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          {subData.avgRating}
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-dk-muted flex items-center gap-3 mt-0.5 font-semibold">
                      <span>📞 {subData.phone}</span>
                      {subData.availabilityDate && (
                        <span>📅 {tx(lang,{fr:'Disponible le:',ar:'متاح بتاريخ:',en:'Available date:'})} {subData.availabilityDate}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      const subName = selectedSubcontractorForDetail;
                      setSelectedSubcontractorForDetail(null);
                      openOrderFormModal(subName);
                    }}
                    className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{tx(lang,{fr:'Nouvelle Commande',ar:'أمر جديد',en:'New Order'})}</span>
                  </button>
                  <button 
                    onClick={() => setSelectedSubcontractorForDetail(null)}
                    className="p-2 hover:bg-slate-200 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-slate-50 dark:bg-dk-bg p-4 rounded-2xl border border-slate-200 dark:border-dk-border">
                    <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'Commandes',ar:'الطلبيات',en:'Orders'})}</span>
                    <span className="font-extrabold text-slate-800 dark:text-dk-text text-lg">{subData.orderCount}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-dk-bg p-4 rounded-2xl border border-slate-200 dark:border-dk-border">
                    <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'Quantité Totale',ar:'الكمية الإجمالية',en:'Total Qty'})}</span>
                    <span className="font-extrabold text-slate-800 dark:text-dk-text text-lg">{subData.totalQty.toLocaleString()} pcs</span>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/40">
                    <span className="block text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">{tx(lang,{fr:'Livré',ar:'المسلم',en:'Delivered'})}</span>
                    <span className="font-extrabold text-emerald-700 dark:text-emerald-300 text-lg">{subData.deliveredQty.toLocaleString()} pcs</span>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-800/40">
                    <span className="block text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">{tx(lang,{fr:'Membres Reste',ar:'المتبقي',en:'Remaining'})}</span>
                    <span className="font-extrabold text-amber-700 dark:text-amber-300 text-lg">{subData.remainingQty.toLocaleString()} pcs</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="bg-slate-50 dark:bg-dk-bg p-4 rounded-2xl border border-slate-200 dark:border-dk-border space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-dk-text">
                    <span>{tx(lang,{fr:'Taux de réalisation global',ar:'نسبة الإنجاز الإجمالية',en:'Overall Completion Rate'})}</span>
                    <span>{completionPct}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-dk-elevated h-2.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 dark:bg-dk-accent h-full transition-all" style={{ width: `${completionPct}%` }}></div>
                  </div>
                </div>

                {/* Assigned Orders Table */}
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-800 dark:text-dk-text text-sm uppercase tracking-wider">
                    {tx(lang,{fr:'Liste des commandes assignées',ar:'قائمة الطلبيات المخصصة لهذه الورشة',en:'Assigned Orders List'})} ({subOrders.length})
                  </h3>

                  {subOrders.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-dk-muted py-6 text-center italic">
                      {tx(lang,{fr:'Aucune commande assignée',ar:'لا توجد طلبية مخصصة لهذا المقاول',en:'No assigned orders'})}
                    </p>
                  ) : (
                    <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden bg-white dark:bg-dk-surface">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border text-slate-500 font-semibold uppercase">
                            <tr>
                              <th className="px-4 py-3">{tx(lang,{fr:'Modèle',ar:'الموديل',en:'Model'})}</th>
                              <th className="px-4 py-3">{tx(lang,{fr:'Client',ar:'العميل',en:'Client'})}</th>
                              <th className="px-4 py-3">{tx(lang,{fr:'Qté',ar:'الكمية',en:'Qty'})}</th>
                              <th className="px-4 py-3">{tx(lang,{fr:'Livré',ar:'المسلم',en:'Delivered'})}</th>
                              <th className="px-4 py-3">{tx(lang,{fr:'Prix/pc',ar:'السعر/قطعة',en:'Price/pc'})}</th>
                              <th className="px-4 py-3">{tx(lang,{fr:'Date Livraison',ar:'تاريخ التسليم',en:'Delivery Date'})}</th>
                              <th className="px-4 py-3">{tx(lang,{fr:'Statut',ar:'الحالة',en:'Status'})}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                            {subOrders.map(o => (
                              <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/50 transition-colors">
                                <td className="px-4 py-3 font-bold text-slate-800 dark:text-dk-text">{o.modelName}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-dk-text-soft">{o.clientName || 'N/A'}</td>
                                <td className="px-4 py-3 font-semibold">{o.totalQuantity} pcs</td>
                                <td className="px-4 py-3 text-emerald-600 font-semibold">{o.qtyAccepted || 0} pcs</td>
                                <td className="px-4 py-3 font-bold">{o.pricePerPiece || 0} MAD</td>
                                <td className="px-4 py-3 text-slate-500">{o.deliveryDate}</td>
                                <td className="px-4 py-3">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {o.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}