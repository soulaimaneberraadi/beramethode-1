import React, { useState, useEffect, useMemo } from 'react';
import { ModelData, SubcontractOrder, PlanningEvent } from '../types';
import { 
  Truck, Plus, Search, Trash2, Edit2, X, Check, 
  AlertCircle, Calendar, DollarSign, Package, 
  ChevronDown, ChevronUp, Loader2, Info, Eye, Layers, Palette,
  Printer, CheckSquare, Clock, ShieldCheck, ClipboardCheck, Sparkles, Send, Copy, Coins,
  Users, Building2, EyeOff, LayoutGrid, FileText, Settings, ArrowRight, Star, ChevronRight
} from 'lucide-react';

interface SousTraitanceProps {
  models: ModelData[];
  settings?: any;
  onNavigate?: (view: string) => void;
  planningEvents?: PlanningEvent[];
  setPlanningEvents?: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
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

export default function SousTraitance({ models, settings }: SousTraitanceProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'orders' | 'subcontractors' | 'stock' | 'groups'>('orders');

  // Core Data States
  const [orders, setOrders] = useState<SubcontractOrder[]>([]);
  const [groups, setGroups] = useState<SubcontractorGroup[]>([]);
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

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SubcontractOrder | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<SubcontractOrder | null>(null);

  // Form States (Orders)
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

  // Fetch all initial data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch Subcontract Orders
      const resOrders = await fetch('/api/subcontract', { credentials: 'include' });
      if (!resOrders.ok) throw new Error('Echec du chargement des commandes de sous-traitance');
      const ordersData = await resOrders.json();
      setOrders(ordersData);

      // Fetch Subcontractor Groups
      const resGroups = await fetch('/api/subcontract/groups', { credentials: 'include' });
      if (!resGroups.ok) throw new Error('Echec du chargement des groupes de sous-traitants');
      const groupsData = await resGroups.json();
      setGroups(groupsData);

      // Fetch Sales Invoices
      const resInvoices = await fetch('/api/facturation/factures?type=VENTE', { credentials: 'include' });
      if (!resInvoices.ok) throw new Error('Echec du chargement des factures');
      const invoicesData = await resInvoices.json();
      setInvoices(invoicesData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Une erreur est survenue lors de la récupération des données.');
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
    return Array.from(list);
  }, [orders]);

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
    let activeOrdersCount = 0;
    let pendingFabricCount = 0;
    let pendingSuppliesCount = 0;

    orders.forEach(o => {
      totalQty += o.totalQuantity;
      totalDelivered += o.qtyAccepted || 0;
      if (o.status !== 'COMPLETED') {
        activeOrdersCount++;
      }
      if (o.tissuStatus === 'PENDING') pendingFabricCount++;
      if (o.fournituresStatus === 'PENDING') pendingSuppliesCount++;
    });

    const remainingQty = Math.max(0, totalQty - totalDelivered);

    return { 
      totalQty, 
      totalDelivered, 
      remainingQty, 
      activeOrdersCount, 
      pendingFabricCount, 
      pendingSuppliesCount,
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
    const map: Record<string, {
      name: string;
      phone: string;
      orderCount: number;
      totalQty: number;
      deliveredQty: number;
      remainingQty: number;
      models: Set<string>;
    }> = {};

    orders.forEach(o => {
      const sub = o.subcontractorName;
      if (!map[sub]) {
        map[sub] = {
          name: sub,
          phone: o.subcontractorPhone || 'Non spécifié',
          orderCount: 0,
          totalQty: 0,
          deliveredQty: 0,
          remainingQty: 0,
          models: new Set<string>()
        };
      }
      map[sub].orderCount++;
      map[sub].totalQty += o.totalQuantity;
      map[sub].deliveredQty += o.qtyAccepted || 0;
      map[sub].remainingQty += Math.max(0, o.totalQuantity - (o.qtyAccepted || 0));
      if (o.modelName) map[sub].models.add(o.modelName);
    });

    let list = Object.values(map);

    // Apply group filter if active
    if (groupFilter !== 'ALL') {
      list = list.filter(item => groupSubcontractors.includes(item.name));
    }

    return list;
  }, [orders, groupFilter, groupSubcontractors]);

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
      let activeStatus = 'Inactif';

      orders.forEach(o => {
        if (o.modelId === model.id) {
          produced += o.qtyAccepted || 0;
          if (!oldestDate || (o.created_at && o.created_at < oldestDate)) {
            oldestDate = o.created_at || '';
          }
          if (o.status !== 'COMPLETED') {
            activeStatus = 'En production';
          } else if (activeStatus !== 'En production') {
            activeStatus = 'Terminé';
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
      
      // Look up default unit price if any
      const price = model.meta_data.total_temps * 1.5; // simple dynamic estimate based on times

      list.push({
        model,
        producedQty: produced,
        soldQty: sold,
        remainingStock: remaining,
        price: Math.round(price) || 100,
        startDate: oldestDate ? new Date(oldestDate).toLocaleDateString('fr-FR') : 'Non commencée',
        status: activeStatus
      });
    });

    return list;
  }, [models, orders, invoices]);

  // Initialize form for adding order
  const openAddModal = () => {
    const firstModel = models[0];
    setFormModelId(firstModel?.id || 'MANUAL');
    setFormClientName(firstModel?.ficheData?.client || '');
    setFormSubcontractorName('');
    setFormPricePerPiece(0);
    setFormTotalQuantity(firstModel?.meta_data.quantity || 0);
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
      quantity: firstModel?.meta_data.quantity || 0,
      deliveryDate: '',
      notes: '',
      grid: {}
    }]);
    setNewColorInput('');
    setError(null);
    setIsAddModalOpen(true);
  };

  // Sync client name when model changes in order form
  const handleModelChange = (modelId: string) => {
    setFormModelId(modelId);
    if (modelId === 'MANUAL') {
      setFormClientName('');
      return;
    }
    const selected = models.find(m => m.id === modelId);
    if (selected) {
      setFormClientName(selected.ficheData?.client || '');
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
    setBatches(prev => {
      const updated = [...prev];
      delete updated[0].grid[color];
      // Re-sum total quantity
      updated[0].quantity = Object.values(updated[0].grid).reduce((sum, sizes) => {
        return sum + Object.values(sizes).reduce((a, b) => a + b, 0);
      }, 0);
      setFormTotalQuantity(updated[0].quantity);
      return updated;
    });
  };

  const handleUpdateGridQty = (color: string, size: string, qty: number) => {
    const cleanQty = Math.max(0, qty || 0);
    setBatches(prev => {
      const updated = [...prev];
      const batch = updated[0];
      if (batch.grid[color]) {
        batch.grid[color][size] = cleanQty;
      }
      // Re-sum
      batch.quantity = Object.values(batch.grid).reduce((sum, sizes) => {
        return sum + Object.values(sizes).reduce((a, b) => a + b, 0);
      }, 0);
      setFormTotalQuantity(batch.quantity);
      return updated;
    });
  };

  // Submit new subcontract order
  const handleAddOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);

    if (!formSubcontractorName.trim()) {
      setError('Veuillez specifier le nom du sous-traitant.');
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
        throw new Error(errData.message || 'Erreur lors de la creation du lot.');
      }

      setIsAddModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Une erreur est survenue.');
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
        throw new Error(errData.message || 'Erreur lors de la mise a jour.');
      }

      setIsEditModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Une erreur est survenue.');
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
      if (!res.ok) throw new Error('Echec de la modification du statut');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Erreur de communication');
    }
  };

  // Delete subcontract order
  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette commande ?')) return;
    try {
      const res = await fetch(`/api/subcontract/${orderId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Echec de la suppression');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Une erreur est survenue.');
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
    setSaleNotes(`Sortie de stock sous-traitance pour le modele ${item.model.meta_data.nom_modele}`);
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
      alert('La quantite vendue doit etre superieure a 0.');
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
        throw new Error(errData.error || 'Erreur lors de la validation de la facture.');
      }

      setIsSaleModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Une erreur est survenue lors de la facturation.');
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
          <title>Facture de Vente - ${saleInvoiceNumber}</title>
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
                <div style="font-size: 18px; font-weight: 800; color: #1e1b4b;">FACTURE DE VENTE</div>
                <div style="font-size: 12px; font-weight: 600; color: #4f46e5; margin-top: 4px;">N° ${saleInvoiceNumber}</div>
              </div>
            </div>

            <div class="meta-section">
              <div class="box">
                <div class="title">Émetteur</div>
                <div class="val">BeraMéthode Confection</div>
                <div style="color: #64748b; font-size: 11px; margin-top: 4px;">Atelier principal de production</div>
              </div>
              <div class="box">
                <div class="title">Facturé à (Client)</div>
                <div class="val">${saleClient}</div>
                ${saleClientAdresse ? `<div style="font-size: 12px; color: #475569; margin-top: 4px;">${saleClientAdresse}</div>` : ''}
                ${saleClientIce ? `<div style="font-size: 11px; color: #64748b;">ICE: ${saleClientIce}</div>` : ''}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Désignation de l'article</th>
                  <th style="text-align: right;">Quantité</th>
                  <th style="text-align: right;">Prix Unitaire</th>
                  <th style="text-align: right;">Total HT</th>
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
                <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Observations / Notes</div>
                <div style="margin-top: 4px; font-style: italic; color: #334155;">${saleNotes}</div>
              </div>
            ` : ''}

            <div class="footer">
              BeraMéthode - Solution de gestion ERP pour l'industrie de confection.<br/>
              Document généré électroniquement et valable sans signature.
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
      alert('Veuillez specifier un nom de groupe.');
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

      if (!res.ok) throw new Error('Echec de la sauvegarde du groupe');
      
      setIsEditingGroup(false);
      setSelectedGroup(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Une erreur est survenue.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm('Voulez-vous supprimer ce groupe ?')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/subcontract/groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Echec de la suppression');
      
      setIsEditingGroup(false);
      setSelectedGroup(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Une erreur est survenue.');
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
          <title>Bon d'Envoi en Sous-traitance - ${order.modelName}</title>
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
              <div style="font-size: 12px; color: #64748b; font-weight: 600;">ERP de Production & Confection Textile</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 18px; font-weight: 900; color: #4f46e5;">BON D'ENVOI DE SOUS-TRAITANCE</div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 4px;">REF: BS-${order.id.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>

          <div class="meta">
            <div class="meta-box">
              <div class="meta-title">Atelier de Sous-traitance</div>
              <div class="meta-val">${order.subcontractorName}</div>
            </div>
            <div class="meta-box">
              <div class="meta-title">Client / Donneur d'Ordre</div>
              <div class="meta-val">${order.clientName || 'N/A'}</div>
            </div>
            <div class="meta-box">
              <div class="meta-title">Modèle & Réf</div>
              <div class="meta-val">${order.modelName}</div>
            </div>
            <div class="meta-box">
              <div class="meta-title">Date de Livraison Prévue</div>
              <div class="meta-val">${order.deliveryDate}</div>
            </div>
          </div>

          <h3 style="font-size: 15px; margin-bottom: 10px; color: #1e1b4b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; font-weight: 800;">DETAILS DES PIECES</h3>
          <table>
            <thead>
              <tr>
                <th>Couleur</th>
                <th>Détail des Tailles</th>
                <th style="text-align: right;">Quantité</th>
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
                  <td style="font-weight: 800; color: #1e1b4b;">Standard</td>
                  <td style="font-weight: 600;">
                    ${Object.entries(sizes).map(([sz, q]) => `[${sz}]: ${q} pcs`).join(' | ')}
                  </td>
                  <td style="text-align: right; font-weight: 800; color: #4f46e5;">${order.totalQuantity.toLocaleString()} pcs</td>
                </tr>
              `}
              <tr style="background: #f8fafc; font-weight: 900; font-size: 14px; border-top: 2px solid #cbd5e1;">
                <td colspan="2">QUANTITÉ TOTALE ENVOYÉE</td>
                <td style="text-align: right; font-weight: 900; color: #4f46e5; font-size: 16px;">${order.totalQuantity.toLocaleString()} pcs</td>
              </tr>
            </tbody>
          </table>

          ${order.notes ? `
            <div style="background: #faf5ff; border: 1px solid #f3e8ff; border-radius: 12px; padding: 15px; margin-bottom: 30px;">
              <div style="font-size: 10px; font-weight: 800; color: #a21caf; text-transform: uppercase;">Notes</div>
              <div style="font-size: 13px; margin-top: 6px; font-style: italic; color: #581c87; font-weight: 600;">${order.notes}</div>
            </div>
          ` : ''}

          <div class="signatures">
            <div class="sig-box">Livreur / Transporteur</div>
            <div class="sig-box">Réception Sous-traitant</div>
            <div class="sig-box">Contrôle Production</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 p-4 md:p-8 bg-slate-50 min-h-screen text-slate-800 relative font-sans">
      
      {/* Header Banner - Compact and White (No blue) */}
      <div className="relative overflow-hidden rounded-3xl bg-white border border-slate-200/60 p-5 md:p-6 shadow-sm text-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <span className="text-xs font-black text-indigo-600 uppercase tracking-widest block">Plateforme Industrielle</span>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
              Sous-traitance & Monawla
            </h1>
            <p className="text-slate-500 max-w-2xl text-xs md:text-sm leading-relaxed">
              Supervision unifiée des ateliers externes de confection. Suivi logistique des expéditions de matières premières, contrôle qualité à la réception des pièces, et facturation directe des ventes de produits finis.
            </p>
          </div>
          {activeTab === 'orders' && (
            <button 
              onClick={openAddModal}
              className="bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.01] active:scale-[0.99] text-white px-5 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 font-bold w-full md:w-auto text-xs md:text-sm shrink-0 border border-indigo-600"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Nouvelle Commande</span>
            </button>
          )}
        </div>
      </div>

      {/* Modern Pill-Style Tabs Bar */}
      <div className="flex bg-white p-1 rounded-2xl border border-slate-200/60 overflow-x-auto gap-1 shadow-sm max-w-max">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'orders' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
        >
          <Package className="w-4 h-4" />
          <span>Commandes</span>
        </button>
        <button
          onClick={() => setActiveTab('subcontractors')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'subcontractors' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
        >
          <Users className="w-4 h-4" />
          <span>Suivi Fournisseurs</span>
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'stock' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
        >
          <Coins className="w-4 h-4" />
          <span>Stock & Ventes</span>
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'groups' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
        >
          <Layers className="w-4 h-4" />
          <span>Groupements</span>
        </button>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-850 p-4 rounded-2xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200/60 shadow-sm gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Chargement des données de sous-traitance...</p>
        </div>
      ) : (
        <>
          {/* ======================================= */}
          {/* TAB 1: COMMANDES (ORDERS) */}
          {/* ======================================= */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              {/* Clean Minimalist Stats Widgets */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Commandes Actives</span>
                  <span className="text-2xl md:text-3xl font-black text-slate-800 mt-2 tracking-tight">{stats.activeOrdersCount}</span>
                </div>
                <div className="bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Commandé</span>
                  <span className="text-2xl md:text-3xl font-black text-indigo-600 mt-2 tracking-tight">{stats.totalQty.toLocaleString()} <span className="text-xs font-bold text-slate-450">pcs</span></span>
                </div>
                <div className="bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Livré</span>
                  <span className="text-2xl md:text-3xl font-black text-emerald-600 mt-2 tracking-tight">{stats.totalDelivered.toLocaleString()} <span className="text-xs font-bold text-slate-450">pcs</span></span>
                </div>
                <div className="bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Reste à Livrer</span>
                  <span className="text-2xl md:text-3xl font-black text-amber-600 mt-2 tracking-tight">{stats.remainingQty.toLocaleString()} <span className="text-xs font-bold text-slate-450">pcs</span></span>
                </div>
              </div>

              {/* Clean Filters Toolbar */}
              <div className="bg-white rounded-3xl p-4 border border-slate-200/60 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Rechercher sous-traitant, modèle..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full bg-slate-50/50 text-slate-800 placeholder:text-slate-400"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  {/* Group Filter */}
                  <select
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 hover:bg-slate-100"
                  >
                    <option value="ALL">Tous les groupements</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.group_name}</option>
                    ))}
                  </select>

                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 hover:bg-slate-100"
                  >
                    <option value="ALL">Tous les statuts</option>
                    <option value="PENDING">En attente</option>
                    <option value="IN_COUPE">En Coupe</option>
                    <option value="IN_COUTURE">En Couture</option>
                    <option value="IN_FINITION">En Finition</option>
                    <option value="LIVRE_PARTIEL">Livraison Partielle</option>
                    <option value="COMPLETED">Complété</option>
                  </select>

                  {/* View Mode Toggle */}
                  <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                    <button 
                      onClick={() => setViewMode('card')}
                      className={`p-2.5 transition-all ${viewMode === 'card' ? 'bg-indigo-600 text-white shadow-inner' : 'text-slate-400 hover:text-slate-700'}`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setViewMode('table')}
                      className={`p-2.5 transition-all ${viewMode === 'table' ? 'bg-indigo-600 text-white shadow-inner' : 'text-slate-400 hover:text-slate-700'}`}
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* View Rendering */}
              {filteredOrders.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200/60 p-16 text-center text-slate-400 shadow-sm">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-25 text-slate-350" />
                  <p className="text-xs font-semibold">Aucune commande trouvée</p>
                </div>
              ) : viewMode === 'card' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredOrders.map(order => {
                    const progress = order.totalQuantity > 0 
                      ? Math.min(100, Math.round(((order.qtyAccepted || 0) / order.totalQuantity) * 100))
                      : 0;

                    const matchedModel = models.find(m => m.id === order.modelId);
                    const photo = matchedModel?.image || null;

                    return (
                      <div 
                        key={order.id}
                        className="bg-white rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-md hover:border-slate-300 transition-all overflow-hidden flex flex-col justify-between group"
                      >
                        <div className="p-5 space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[9px] font-black text-indigo-655 uppercase tracking-widest block">Client: {order.clientName || 'N/A'}</span>
                              <h3 className="font-bold text-slate-800 text-base mt-1 line-clamp-1">{order.modelName}</h3>
                            </div>
                            <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full uppercase ${
                              order.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                              order.status === 'LIVRE_PARTIEL' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                              order.status === 'IN_COUTURE' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                              order.status === 'IN_COUPE' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                              'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {order.status === 'PENDING' ? 'En attente' :
                               order.status === 'IN_COUPE' ? 'Coupe' :
                               order.status === 'IN_COUTURE' ? 'Couture' :
                               order.status === 'IN_FINITION' ? 'Finition' :
                               order.status === 'LIVRE_PARTIEL' ? 'Partiel' : 'Complété'}
                            </span>
                          </div>

                          <div className="flex gap-4 items-center">
                            <div className="w-14 h-14 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                              {photo ? (
                                <img src={photo} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Building2 className="w-6 h-6 text-slate-400" />
                              )}
                            </div>
                            <div className="space-y-1 text-xs">
                              <p className="font-semibold text-slate-750">Atelier: {order.subcontractorName}</p>
                              {order.subcontractorPhone && (
                                <p className="text-slate-500">Tél: {order.subcontractorPhone}</p>
                              )}
                              <p className="text-slate-550">Date: {new Date(order.deliveryDate).toLocaleDateString('fr-FR')}</p>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] font-semibold">
                              <span className="text-slate-500">Progression : {progress}%</span>
                              <span className="text-indigo-600">{(order.qtyAccepted || 0).toLocaleString()} / {order.totalQuantity.toLocaleString()} pcs</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                          </div>
                        </div>

                        {/* Card Actions Footer */}
                        <div className="px-5 py-3.5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-3 text-xs font-bold">
                          <button 
                            onClick={() => { setDetailOrder(order); setIsDetailModalOpen(true); }}
                            className="text-slate-500 hover:text-indigo-650 transition-colors flex items-center gap-1.5"
                          >
                            <Eye className="w-4 h-4 text-slate-450" />
                            <span>Consulter</span>
                          </button>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => openEditModal(order)}
                              className="text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Modifier</span>
                            </button>
                            <button 
                              onClick={() => handleDeleteOrder(order.id)}
                              className="text-rose-500 hover:text-rose-650 transition-colors"
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
                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                        <tr>
                          <th className="px-6 py-4">Client / Modèle</th>
                          <th className="px-6 py-4">Sous-traitant</th>
                          <th className="px-6 py-4">Quantité</th>
                          <th className="px-6 py-4">Livraison</th>
                          <th className="px-6 py-4">Statut</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                        {filteredOrders.map(order => (
                          <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-4 font-semibold">
                              <span className="text-[9px] text-indigo-600 block font-normal uppercase">{order.clientName || 'N/A'}</span>
                              <span className="text-slate-900">{order.modelName}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-semibold block text-slate-800">{order.subcontractorName}</span>
                              <span className="text-xs text-slate-500">{order.subcontractorPhone || 'Pas de numéro'}</span>
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-800">
                              {(order.qtyAccepted || 0).toLocaleString()} / {order.totalQuantity.toLocaleString()} pcs
                            </td>
                            <td className="px-6 py-4 text-slate-500">
                              {new Date(order.deliveryDate).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="px-6 py-4">
                              <select 
                                value={order.status}
                                onChange={(e) => handleStatusChange(order.id, e.target.value)}
                                className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:border-indigo-500 outline-none hover:bg-slate-100"
                              >
                                <option value="PENDING">En attente</option>
                                <option value="IN_COUPE">En Coupe</option>
                                <option value="IN_COUTURE">En Couture</option>
                                <option value="IN_FINITION">En Finition</option>
                                <option value="LIVRE_PARTIEL">Partiel</option>
                                <option value="COMPLETED">Complété</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setDetailOrder(order); setIsDetailModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button onClick={() => handlePrintDeliveryNote(order)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg" title="Bon d'envoi">
                                  <Printer className="w-4 h-4" />
                                </button>
                                <button onClick={() => openEditModal(order)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg">
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteOrder(order.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg">
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
            </div>
          )}

          {/* ======================================= */}
          {/* TAB 2: SUIVI FOURNISSEURS (TRACKING) */}
          {/* ======================================= */}
          {activeTab === 'subcontractors' && (
            <div className="space-y-6">
              {/* Group filter selection */}
              <div className="bg-white rounded-3xl p-4 border border-slate-200/60 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filtrer par groupement d'entreprises :</p>
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2.5 w-full md:w-64 outline-none focus:border-indigo-500 hover:bg-slate-100"
                >
                  <option value="ALL">Tous les groupements</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.group_name}</option>
                  ))}
                </select>
              </div>

              {subcontractorStats.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200/60 p-16 text-center text-slate-400 shadow-sm">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-25 text-slate-350" />
                  <p className="text-xs font-semibold">Aucun sous-traitant actif trouvé</p>
                </div>
              ) : (
                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                        <tr>
                          <th className="px-6 py-4">Nom de l'Atelier / Tél</th>
                          <th className="px-6 py-4">Commandes</th>
                          <th className="px-6 py-4">Modèles Actifs</th>
                          <th className="px-6 py-4">Quantité Commandée</th>
                          <th className="px-6 py-4">Livrée (fourni)</th>
                          <th className="px-6 py-4">Restante (reste)</th>
                          <th className="px-6 py-4">Progression</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                        {subcontractorStats.map(stat => {
                          const percent = stat.totalQty > 0 
                            ? Math.min(100, Math.round((stat.deliveredQty / stat.totalQty) * 100))
                            : 0;

                          return (
                            <tr key={stat.name} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <span className="font-semibold block text-slate-800">{stat.name}</span>
                                <span className="text-xs text-slate-500">{stat.phone}</span>
                              </td>
                              <td className="px-6 py-4 font-bold text-slate-800">
                                {stat.orderCount}
                              </td>
                              <td className="px-6 py-4 max-w-xs truncate text-xs text-slate-500">
                                {Array.from(stat.models).join(', ') || 'N/A'}
                              </td>
                              <td className="px-6 py-4 font-medium text-slate-800">
                                {stat.totalQty.toLocaleString()} pcs
                              </td>
                              <td className="px-6 py-4 font-semibold text-emerald-600">
                                {stat.deliveredQty.toLocaleString()} pcs
                              </td>
                              <td className="px-6 py-4 font-semibold text-amber-600">
                                {stat.remainingQty.toLocaleString()} pcs
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden shrink-0">
                                    <div className="bg-indigo-600 h-full" style={{ width: `${percent}%` }}></div>
                                  </div>
                                  <span className="font-bold text-xs text-slate-755">{percent}%</span>
                                </div>
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
          )}

          {/* ======================================= */}
          {/* TAB 3: STOCK & VENTES (STOCK & SALES) */}
          {/* ======================================= */}
          {activeTab === 'stock' && (
            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                      <tr>
                        <th className="px-6 py-4">Modèle</th>
                        <th className="px-6 py-4">Date Lancement</th>
                        <th className="px-6 py-4">État de production</th>
                        <th className="px-6 py-4">Produit (réalisé)</th>
                        <th className="px-6 py-4">Vendu (sorti)</th>
                        <th className="px-6 py-4">Stock Restant</th>
                        <th className="px-6 py-4">Prix Estimé</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                      {modelStockStats.map(item => (
                        <tr key={item.model.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                                {item.model.image ? (
                                  <img src={item.model.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                              <div>
                                <span className="font-semibold block text-slate-800">{item.model.meta_data.nom_modele}</span>
                                <span className="text-[9px] text-indigo-600 block font-normal uppercase">Client: {item.model.ficheData?.client || 'N/A'}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-500">
                            {item.startDate}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              item.status === 'Terminé' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                              item.status === 'En production' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                              'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-800">
                            {item.producedQty.toLocaleString()} pcs
                          </td>
                          <td className="px-6 py-4 font-semibold text-indigo-650">
                            {item.soldQty.toLocaleString()} pcs
                          </td>
                          <td className="px-6 py-4 font-bold text-emerald-600">
                            {item.remainingStock.toLocaleString()} pcs
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-800">
                            {item.price} MAD
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              disabled={item.remainingStock <= 0}
                              onClick={() => openSaleModal(item)}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                                item.remainingStock > 0 
                                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white hover:scale-[1.02]' 
                                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                              }`}
                            >
                              Sortie Facture
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

          {/* ======================================= */}
          {/* TAB 4: GROUPEMENTS (GROUPS) */}
          {/* ======================================= */}
          {activeTab === 'groups' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Groups List */}
              <div className="lg:col-span-1 bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 text-xs md:text-sm uppercase tracking-wider">Groupements enregistrés</h3>
                  <button 
                    onClick={handleAddNewGroupMode}
                    className="p-1.5 text-indigo-650 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors text-xs font-bold flex items-center gap-1 border border-indigo-200 bg-white"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nouveau</span>
                  </button>
                </div>
                
                {groups.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">Aucun groupement de sociétés défini</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {groups.map(grp => (
                      <div 
                        key={grp.id}
                        onClick={() => handleSelectGroup(grp)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex justify-between items-center ${
                          selectedGroup?.id === grp.id 
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-900' 
                            : 'border-slate-105 hover:border-slate-200 bg-white'
                        }`}
                      >
                        <div>
                          <p className={`font-semibold text-xs ${selectedGroup?.id === grp.id ? 'text-indigo-900 font-bold' : 'text-slate-800'}`}>{grp.group_name}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{grp.subcontractor_names?.length || 0} sous-traitants liés</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Group Edit Pane */}
              <div className="lg:col-span-2">
                {isEditingGroup ? (
                  <form onSubmit={handleSaveGroup} className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-6">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <h3 className="font-bold text-slate-800 text-xs md:text-sm uppercase tracking-wider">
                        {selectedGroup ? 'Modifier le groupement' : 'Créer un nouveau groupement'}
                      </h3>
                      <button 
                        type="button" 
                        onClick={() => setIsEditingGroup(false)} 
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nom du Groupement *</label>
                      <input 
                        type="text"
                        placeholder="Ex: Groupement Maille, Confection Sud..."
                        value={groupFormName}
                        onChange={(e) => setGroupFormName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs outline-none focus:border-indigo-500 text-slate-800 focus:bg-white"
                        required
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Sous-traitants associés ({groupFormSubs.length})
                      </label>
                      {subcontractorNames.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Aucun sous-traitant disponible dans le système (créez d'abord des commandes)</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1 border border-slate-100 rounded-xl bg-slate-50/50">
                          {subcontractorNames.map(subName => {
                            const isChecked = groupFormSubs.includes(subName);
                            return (
                              <div 
                                key={subName}
                                onClick={() => handleToggleSubInGroup(subName)}
                                className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center gap-3 text-xs ${
                                  isChecked 
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold' 
                                    : 'bg-white border-slate-100 hover:border-slate-200 text-slate-600 shadow-sm'
                                }`}
                              >
                                <input 
                                  type="checkbox"
                                  checked={isChecked}
                                  readOnly
                                  className="rounded bg-white text-indigo-650 focus:ring-indigo-500 border-slate-300"
                                />
                                <span>{subName}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center border-t border-slate-100 pt-4">
                      {selectedGroup && (
                        <button 
                          type="button"
                          onClick={() => handleDeleteGroup(selectedGroup.id)}
                          className="px-4 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-rose-200"
                        >
                          Supprimer le groupe
                        </button>
                      )}
                      <div className="flex gap-3 ml-auto">
                        <button 
                          type="button" 
                          onClick={() => setIsEditingGroup(false)}
                          className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold transition-all"
                        >
                          Annuler
                        </button>
                        <button 
                          type="submit"
                          disabled={actionLoading}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 border border-indigo-500/50"
                        >
                          {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>Enregistrer</span>
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="bg-white border border-slate-200/60 rounded-3xl p-16 text-center text-slate-400 h-full flex flex-col justify-center items-center shadow-sm">
                    <Layers className="w-12 h-12 mb-3 opacity-20 text-slate-400" />
                    <p className="text-xs font-semibold">Sélectionnez un groupe pour le modifier ou créez-en un nouveau.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ======================================= */}
          {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600" />
                <span>Nouvelle Commande de Sous-traitance</span>
              </h2>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-650">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Internal Form Navigation */}
            <div className="flex border-b border-slate-150 bg-slate-50 px-6 gap-4 shrink-0 text-xs font-bold">
              <button 
                type="button"
                onClick={() => setModalFormTab('general')}
                className={`py-3 border-b-2 ${modalFormTab === 'general' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent'}`}
              >
                Général & Quantités
              </button>
              <button 
                type="button"
                onClick={() => setModalFormTab('logistics')}
                className={`py-3 border-b-2 ${modalFormTab === 'logistics' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent'}`}
              >
                Logistique & Suivi
              </button>
              <button 
                type="button"
                onClick={() => setModalFormTab('technical')}
                className={`py-3 border-b-2 ${modalFormTab === 'technical' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent'}`}
              >
                Spécifications Techniques
              </button>
            </div>

            <form onSubmit={handleAddOrder} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-600">
              {modalFormTab === 'general' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Modèle *</label>
                      <select 
                        value={formModelId} 
                        onChange={(e) => handleModelChange(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>{m.meta_data.nom_modele} ({m.meta_data.reference || 'Aucune ref'})</option>
                        ))}
                        <option value="MANUAL">Saisie Manuelle (Sans modèle existant)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Nom du Client</label>
                      <input 
                        type="text" 
                        value={formClientName} 
                        onChange={(e) => setFormClientName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        placeholder="Nom du client donneur d'ordre"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Nom du Sous-traitant *</label>
                      <input 
                        type="text" 
                        value={formSubcontractorName} 
                        onChange={(e) => setFormSubcontractorName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        placeholder="Atelier externe"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Téléphone</label>
                      <input 
                        type="text" 
                        value={formSubcontractorPhone} 
                        onChange={(e) => setFormSubcontractorPhone(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        placeholder="+212..."
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Date livraison prévue *</label>
                      <input 
                        type="date" 
                        value={batches[0].deliveryDate} 
                        onChange={(e) => setBatches(prev => {
                          const updated = [...prev];
                          updated[0].deliveryDate = e.target.value;
                          return updated;
                        })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Quantité Totale *</label>
                      <input 
                        type="number" 
                        value={formTotalQuantity || ''} 
                        onChange={(e) => setFormTotalQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Tarif par pièce (MAD)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={formPricePerPiece || ''} 
                        onChange={(e) => setFormPricePerPiece(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5 col-span-2 md:col-span-1">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Note / Instruction</label>
                      <input 
                        type="text" 
                        value={formNotes} 
                        onChange={(e) => setFormNotes(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        placeholder="Détails logistiques..."
                      />
                    </div>
                  </div>

                  {/* Grid matrix colors & sizes */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <span className="font-bold text-slate-800">Matrice Couleur - Taille (Facultatif)</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          placeholder="Ajouter couleur" 
                          value={newColorInput} 
                          onChange={(e) => setNewColorInput(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] outline-none text-slate-800 focus:border-indigo-500"
                        />
                        <button 
                          type="button" 
                          onClick={handleAddColor}
                          className="bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-500 font-bold transition-all text-[11px]"
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>

                    {Object.keys(batches[0].grid).length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic">Aucune couleur configurée. Le lot sera traité de manière globale.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 font-bold">
                              <th className="py-2 pr-4">Couleur</th>
                              {COMMON_SIZES.map(sz => <th key={sz} className="py-2 px-1 text-center">{sz}</th>)}
                              <th className="py-2 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {Object.entries(batches[0].grid).map(([color, sizesObj]) => (
                              <tr key={color}>
                                <td className="py-2 pr-4 font-semibold text-slate-700">{color}</td>
                                {COMMON_SIZES.map(sz => (
                                  <td key={sz} className="py-1 px-1">
                                    <input 
                                      type="number"
                                      value={sizesObj[sz] || ''}
                                      onChange={(e) => handleUpdateGridQty(color, sz, parseInt(e.target.value) || 0)}
                                      className="w-12 text-center bg-white text-slate-800 border border-slate-200 rounded p-1 text-xs focus:border-indigo-500 outline-none"
                                    />
                                  </td>
                                ))}
                                <td className="py-2 text-right">
                                  <button type="button" onClick={() => handleRemoveColor(color)} className="text-rose-500 hover:text-rose-600">
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

              {modalFormTab === 'logistics' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 border-b border-slate-150 pb-2">Expédition des Matières Premières</h4>
                    
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Statut Tissu</label>
                      <select 
                        value={formTissuStatus} 
                        onChange={(e: any) => setFormTissuStatus(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="PENDING">En attente d'expédition</option>
                        <option value="SENT">Tissu envoyé</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Statut Fournitures / Accessoires</label>
                      <select 
                        value={formFournituresStatus} 
                        onChange={(e: any) => setFormFournituresStatus(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="PENDING">En attente de livraison</option>
                        <option value="DELIVERED">Livrées au sous-traitant</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <input 
                        type="checkbox" 
                        checked={formFicheTechniqueSent}
                        onChange={(e) => setFormFicheTechniqueSent(e.target.checked)}
                        className="rounded bg-white text-indigo-600 w-4 h-4 border-slate-300"
                        id="checkFT"
                      />
                      <label htmlFor="checkFT" className="font-semibold text-slate-700 cursor-pointer">Fiche Technique validée et envoyée</label>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 border-b border-slate-150 pb-2">Profil Sous-traitant</h4>
                    
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Disponibilité de l'atelier</label>
                      <input 
                        type="date"
                        value={formSubcontractorAvailabilityDate}
                        onChange={(e) => setFormSubcontractorAvailabilityDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Évaluation (Note sur 5)</label>
                      <select 
                        value={formSubcontractorRating} 
                        onChange={(e) => setFormSubcontractorRating(parseFloat(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="5">★★★★★ - Excellent</option>
                        <option value="4">★★★★☆ - Très Bon</option>
                        <option value="3">★★★☆☆ - Moyen</option>
                        <option value="2">★★☆☆☆ - Faible</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {modalFormTab === 'technical' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 border-b border-slate-150 pb-2">Cahier des charges</h4>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Type de prestation</label>
                      <select 
                        value={formPrestationType} 
                        onChange={(e: any) => setFormPrestationType(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="CMT">CMT (Coupe, Couture, Finition)</option>
                        <option value="FACON_PURE">Façon Pure (Couture seule)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Provenance du Tissu</label>
                      <select 
                        value={formTissuFournisseur} 
                        onChange={(e: any) => setFormTissuFournisseur(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="CLIENT">Fourni par le donneur d'ordre (Client)</option>
                        <option value="SUBCONTRACTOR">Fourni par le sous-traitant</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Provenance des Fournitures</label>
                      <select 
                        value={formFournituresFournisseur} 
                        onChange={(e: any) => setFormFournituresFournisseur(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="CLIENT">Fourni par le donneur d'ordre (Client)</option>
                        <option value="SUBCONTRACTOR">Acheté par le sous-traitant</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 border-b border-slate-150 pb-2">Contrôle qualité & Administratif</h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Prototype Requis</label>
                        <select 
                          value={formProtoRequired} 
                          onChange={(e) => setFormProtoRequired(parseInt(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                        >
                          <option value="1">Oui, obligatoire</option>
                          <option value="0">Non requis</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Statut du Prototype</label>
                        <select 
                          value={formProtoStatus} 
                          onChange={(e: any) => setFormProtoStatus(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                        >
                          <option value="PENDING">En attente d'approbation</option>
                          <option value="APPROVED">Validé / BPA signé</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Conditions de règlement</label>
                      <select 
                        value={formPaymentTerms} 
                        onChange={(e: any) => setFormPaymentTerms(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="AVANCE_RECEPTION">Acompte à la commande + solde à la livraison</option>
                        <option value="APRES_LIVRAISON">Paiement après réception de facture</option>
                        <option value="ECHEANCES">Paiement échelonné</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Consignes de Couture</label>
                      <textarea 
                        value={formStitchingDetails}
                        onChange={(e) => setFormStitchingDetails(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none h-16 text-slate-800 focus:border-indigo-500 focus:bg-white"
                        placeholder="Instructions spécifiques d'assemblage..."
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end border-t border-slate-150 pt-4 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl font-bold transition-all"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 border border-indigo-500/50"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Créer la Commande</span>
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
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600" />
                <span>Modifier la Commande de Sous-traitance</span>
              </h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-650">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Internal Form Navigation */}
            <div className="flex border-b border-slate-150 bg-slate-50 px-6 gap-4 shrink-0 text-xs font-bold">
              <button 
                type="button"
                onClick={() => setModalFormTab('general')}
                className={`py-3 border-b-2 ${modalFormTab === 'general' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent'}`}
              >
                Général & Quantités
              </button>
              <button 
                type="button"
                onClick={() => setModalFormTab('logistics')}
                className={`py-3 border-b-2 ${modalFormTab === 'logistics' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent'}`}
              >
                Logistique & Suivi
              </button>
              <button 
                type="button"
                onClick={() => setModalFormTab('technical')}
                className={`py-3 border-b-2 ${modalFormTab === 'technical' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent'}`}
              >
                Spécifications Techniques
              </button>
            </div>

            <form onSubmit={handleEditOrder} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-600">
              {modalFormTab === 'general' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Modèle *</label>
                      <select 
                        value={formModelId} 
                        onChange={(e) => handleModelChange(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>{m.meta_data.nom_modele} ({m.meta_data.reference || 'Aucune ref'})</option>
                        ))}
                        <option value="MANUAL">Saisie Manuelle (Sans modèle existant)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Nom du Client</label>
                      <input 
                        type="text" 
                        value={formClientName} 
                        onChange={(e) => setFormClientName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        placeholder="Nom du client donneur d'ordre"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Nom du Sous-traitant *</label>
                      <input 
                        type="text" 
                        value={formSubcontractorName} 
                        onChange={(e) => setFormSubcontractorName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        placeholder="Atelier externe"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Téléphone</label>
                      <input 
                        type="text" 
                        value={formSubcontractorPhone} 
                        onChange={(e) => setFormSubcontractorPhone(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        placeholder="+212..."
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Date livraison prévue *</label>
                      <input 
                        type="date" 
                        value={batches[0].deliveryDate} 
                        onChange={(e) => setBatches(prev => {
                          const updated = [...prev];
                          updated[0].deliveryDate = e.target.value;
                          return updated;
                        })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Quantité Totale *</label>
                      <input 
                        type="number" 
                        value={formTotalQuantity || ''} 
                        onChange={(e) => setFormTotalQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Tarif par pièce (MAD)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={formPricePerPiece || ''} 
                        onChange={(e) => setFormPricePerPiece(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5 col-span-2 md:col-span-1">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Note / Instruction</label>
                      <input 
                        type="text" 
                        value={formNotes} 
                        onChange={(e) => setFormNotes(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                        placeholder="Détails logistiques..."
                      />
                    </div>
                  </div>

                  {/* Grid matrix colors & sizes */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <span className="font-bold text-slate-800">Matrice Couleur - Taille (Facultatif)</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          placeholder="Ajouter couleur" 
                          value={newColorInput} 
                          onChange={(e) => setNewColorInput(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] outline-none text-slate-800 focus:border-indigo-500"
                        />
                        <button 
                          type="button" 
                          onClick={handleAddColor}
                          className="bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-500 font-bold transition-all text-[11px]"
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>

                    {Object.keys(batches[0].grid).length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic">Aucune couleur configurée. Le lot sera traité de manière globale.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 font-bold">
                              <th className="py-2 pr-4">Couleur</th>
                              {COMMON_SIZES.map(sz => <th key={sz} className="py-2 px-1 text-center">{sz}</th>)}
                              <th className="py-2 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {Object.entries(batches[0].grid).map(([color, sizesObj]) => (
                              <tr key={color}>
                                <td className="py-2 pr-4 font-semibold text-slate-700">{color}</td>
                                {COMMON_SIZES.map(sz => (
                                  <td key={sz} className="py-1 px-1">
                                    <input 
                                      type="number"
                                      value={sizesObj[sz] || ''}
                                      onChange={(e) => handleUpdateGridQty(color, sz, parseInt(e.target.value) || 0)}
                                      className="w-12 text-center bg-white text-slate-800 border border-slate-200 rounded p-1 text-xs focus:border-indigo-500 outline-none"
                                    />
                                  </td>
                                ))}
                                <td className="py-2 text-right">
                                  <button type="button" onClick={() => handleRemoveColor(color)} className="text-rose-500 hover:text-rose-600">
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

              {modalFormTab === 'logistics' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 border-b border-slate-150 pb-2">Expédition des Matières Premières</h4>
                    
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Statut Tissu</label>
                      <select 
                        value={formTissuStatus} 
                        onChange={(e: any) => setFormTissuStatus(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="PENDING">En attente d'expédition</option>
                        <option value="SENT">Tissu envoyé</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Statut Fournitures / Accessoires</label>
                      <select 
                        value={formFournituresStatus} 
                        onChange={(e: any) => setFormFournituresStatus(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="PENDING">En attente de livraison</option>
                        <option value="DELIVERED">Livrées au sous-traitant</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <input 
                        type="checkbox" 
                        checked={formFicheTechniqueSent}
                        onChange={(e) => setFormFicheTechniqueSent(e.target.checked)}
                        className="rounded bg-white text-indigo-600 w-4 h-4 border-slate-300"
                        id="checkFT"
                      />
                      <label htmlFor="checkFT" className="font-semibold text-slate-700 cursor-pointer">Fiche Technique validée et envoyée</label>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 border-b border-slate-150 pb-2">Profil Sous-traitant</h4>
                    
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Disponibilité de l'atelier</label>
                      <input 
                        type="date"
                        value={formSubcontractorAvailabilityDate}
                        onChange={(e) => setFormSubcontractorAvailabilityDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Évaluation (Note sur 5)</label>
                      <select 
                        value={formSubcontractorRating} 
                        onChange={(e) => setFormSubcontractorRating(parseFloat(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="5">★★★★★ - Excellent</option>
                        <option value="4">★★★★☆ - Très Bon</option>
                        <option value="3">★★★☆☆ - Moyen</option>
                        <option value="2">★★☆☆☆ - Faible</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {modalFormTab === 'technical' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 border-b border-slate-150 pb-2">Cahier des charges</h4>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Type de prestation</label>
                      <select 
                        value={formPrestationType} 
                        onChange={(e: any) => setFormPrestationType(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="CMT">CMT (Coupe, Couture, Finition)</option>
                        <option value="FACON_PURE">Façon Pure (Couture seule)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Provenance du Tissu</label>
                      <select 
                        value={formTissuFournisseur} 
                        onChange={(e: any) => setFormTissuFournisseur(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="CLIENT">Fourni par le donneur d'ordre (Client)</option>
                        <option value="SUBCONTRACTOR">Fourni par le sous-traitant</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Provenance des Fournitures</label>
                      <select 
                        value={formFournituresFournisseur} 
                        onChange={(e: any) => setFormFournituresFournisseur(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="CLIENT">Fourni par le donneur d'ordre (Client)</option>
                        <option value="SUBCONTRACTOR">Acheté par le sous-traitant</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 border-b border-slate-150 pb-2">Contrôle qualité & Administratif</h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Prototype Requis</label>
                        <select 
                          value={formProtoRequired} 
                          onChange={(e) => setFormProtoRequired(parseInt(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                        >
                          <option value="1">Oui, obligatoire</option>
                          <option value="0">Non requis</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Statut du Prototype</label>
                        <select 
                          value={formProtoStatus} 
                          onChange={(e: any) => setFormProtoStatus(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                        >
                          <option value="PENDING">En attente d'approbation</option>
                          <option value="APPROVED">Validé / BPA signé</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Conditions de règlement</label>
                      <select 
                        value={formPaymentTerms} 
                        onChange={(e: any) => setFormPaymentTerms(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:bg-white"
                      >
                        <option value="AVANCE_RECEPTION">Acompte à la commande + solde à la livraison</option>
                        <option value="APRES_LIVRAISON">Paiement après réception de facture</option>
                        <option value="ECHEANCES">Paiement échelonné</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 uppercase tracking-widest text-[10px]">Consignes de Couture</label>
                      <textarea 
                        value={formStitchingDetails}
                        onChange={(e) => setFormStitchingDetails(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none h-16 text-slate-800 focus:border-indigo-500 focus:bg-white"
                        placeholder="Instructions spécifiques d'assemblage..."
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end border-t border-slate-150 pt-4 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl font-bold transition-all"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 border border-indigo-500/50"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Enregistrer</span>
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
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-750">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/55">
              <h2 className="font-bold text-slate-800 text-base">Fiche de Commande Sous-traitance</h2>
              <button onClick={() => setIsDetailModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50/75 p-4 rounded-xl border border-slate-150">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Sous-traitant</span>
                  <span className="text-sm font-bold text-slate-800 mt-1 block">{detailOrder.subcontractorName}</span>
                  {detailOrder.subcontractorPhone && <span className="text-slate-500 block mt-1">Tél: {detailOrder.subcontractorPhone}</span>}
                </div>
                <div className="bg-slate-50/75 p-4 rounded-xl border border-slate-150">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Client Donneur d'Ordre</span>
                  <span className="text-sm font-bold text-slate-800 mt-1 block">{detailOrder.clientName || 'N/A'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50/75 p-4 rounded-xl border border-slate-150">
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Modèle</span>
                  <span className="font-bold text-slate-800">{detailOrder.modelName}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Quantité totale</span>
                  <span className="font-bold text-slate-800">{detailOrder.totalQuantity.toLocaleString()} pcs</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Tarif unitaire</span>
                  <span className="font-bold text-slate-800">{detailOrder.pricePerPiece || 0} MAD</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Date livraison</span>
                  <span className="font-bold text-slate-800">{new Date(detailOrder.deliveryDate).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>

              {/* Status details */}
              <div className="bg-slate-50/75 border border-slate-150 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Matière (Tissu)</span>
                  <span className={`font-bold text-xs ${detailOrder.tissuStatus === 'SENT' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {detailOrder.tissuStatus === 'SENT' ? 'Expédié' : 'En attente'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Fournitures</span>
                  <span className={`font-bold text-xs ${detailOrder.fournituresStatus === 'DELIVERED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {detailOrder.fournituresStatus === 'DELIVERED' ? 'Livrées' : 'En attente'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Statut Prototype</span>
                  <span className={`font-bold text-xs ${detailOrder.protoStatus === 'APPROVED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {detailOrder.protoStatus === 'APPROVED' ? 'Validé' : 'En attente'}
                  </span>
                </div>
              </div>

              {/* Quantity analysis details */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-slate-50/50">
                <h4 className="font-bold text-slate-700 uppercase tracking-wide">État des pièces livrées</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                    <span className="text-emerald-800 font-bold block text-[9px] uppercase tracking-wide">Acceptées</span>
                    <span className="text-base font-extrabold text-emerald-600 mt-1 block">{(detailOrder.qtyAccepted || 0).toLocaleString()} pcs</span>
                  </div>
                  <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100">
                    <span className="text-amber-800 font-bold block text-[9px] uppercase tracking-wide">À retoucher</span>
                    <span className="text-base font-extrabold text-amber-600 mt-1 block">{(detailOrder.qtyToRepair || 0).toLocaleString()} pcs</span>
                  </div>
                  <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100">
                    <span className="text-rose-800 font-bold block text-[9px] uppercase tracking-wide">Rejetées</span>
                    <span className="text-base font-extrabold text-rose-650 mt-1 block">{(detailOrder.qtyRejected || 0).toLocaleString()} pcs</span>
                  </div>
                </div>
              </div>

              {detailOrder.notes && (
                <div className="bg-indigo-50/70 p-3.5 border border-indigo-100 rounded-xl">
                  <span className="text-[10px] font-bold text-indigo-700 block uppercase tracking-wide">Instructions</span>
                  <p className="mt-1 font-semibold text-indigo-950 italic">{detailOrder.notes}</p>
                </div>
              )}
            </div>

            <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex gap-3 justify-end text-xs font-bold">
              <button 
                onClick={() => handlePrintDeliveryNote(detailOrder)} 
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer Bon d'Envoi</span>
              </button>
              <button 
                onClick={() => setIsDetailModalOpen(false)}
                className="bg-indigo-600 hover:bg-indigo-550 text-white px-5 py-2.5 rounded-xl shadow transition-all border border-indigo-600"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* SALE INVOICE MODAL (TAB 3 ACTION) */}
      {/* ======================================= */}
      {isSaleModalOpen && selectedModelForSale && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] text-slate-850">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/55">
              <h2 className="font-bold text-slate-850 text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span>Générer une facture de sortie de stock (Vente)</span>
              </h2>
              <button onClick={() => setIsSaleModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSaleInvoice} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700">
              {/* Invoice structured details */}
              <div className="bg-slate-50/75 rounded-2xl p-4 border border-slate-150 space-y-4">
                <h3 className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Informations Facture</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 uppercase">N° Facture</label>
                    <input 
                      type="text"
                      value={saleInvoiceNumber}
                      onChange={(e) => setSaleInvoiceNumber(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 font-bold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 uppercase">Nom du client *</label>
                    <input 
                      type="text"
                      value={saleClient}
                      onChange={(e) => setSaleClient(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      placeholder="Nom de l'acheteur"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 uppercase">ICE Client</label>
                    <input 
                      type="text"
                      value={saleClientIce}
                      onChange={(e) => setSaleClientIce(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      placeholder="ICE"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 uppercase">RC Client</label>
                    <input 
                      type="text"
                      value={saleClientRc}
                      onChange={(e) => setSaleClientRc(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      placeholder="RC"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 uppercase">Téléphone</label>
                    <input 
                      type="text"
                      value={saleClientTel}
                      onChange={(e) => setSaleClientTel(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="block font-bold text-slate-500 uppercase">Adresse de livraison</label>
                    <input 
                      type="text"
                      value={saleClientAdresse}
                      onChange={(e) => setSaleClientAdresse(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      placeholder="Adresse"
                    />
                  </div>
                </div>
              </div>

              {/* Items Grid */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Lignes de facturation</h3>
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/30">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-150 text-slate-600 font-bold">
                      <tr>
                        <th className="px-4 py-3">Désignation</th>
                        <th className="px-4 py-3 text-center w-28">Quantité</th>
                        <th className="px-4 py-3 text-center w-36">Prix Unitaire (MAD)</th>
                        <th className="px-4 py-3 text-right w-40">Total HT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 text-slate-700 bg-white">
                      <tr>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          Modèle: {selectedModelForSale.meta_data.nom_modele}
                          <span className="text-[10px] text-slate-500 block font-normal mt-0.5">Réf: {selectedModelForSale.meta_data.reference || 'Aucune'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <input 
                            type="number"
                            value={saleQuantity || ''}
                            onChange={(e) => setSaleQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white text-slate-800 border border-slate-200 rounded-lg p-2 text-center text-xs focus:border-indigo-500 outline-none"
                            required
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input 
                            type="number"
                            value={salePrice || ''}
                            onChange={(e) => setSalePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full bg-white text-slate-800 border border-slate-200 rounded-lg p-2 text-center text-xs focus:border-indigo-500 outline-none"
                            required
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-600">
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
                    <label className="block font-bold text-slate-500 uppercase">Taux TVA (%)</label>
                    <select 
                      value={saleTvaRate} 
                      onChange={(e) => setSaleTvaRate(parseInt(e.target.value))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800 outline-none focus:border-indigo-500"
                    >
                      <option value="20">20% (Standard)</option>
                      <option value="14">14%</option>
                      <option value="10">10%</option>
                      <option value="7">7%</option>
                      <option value="0">0% (Exonéré)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 uppercase">Statut de la facture</label>
                    <select 
                      value={saleStatus} 
                      onChange={(e: any) => setSaleStatus(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800 outline-none focus:border-indigo-500"
                    >
                      <option value="BROUILLON">Brouillon</option>
                      <option value="ENVOYEE">Envoyée au client</option>
                      <option value="PAYEE">Payée / Encaissée</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 uppercase">Note interne / Observation</label>
                    <textarea 
                      value={saleNotes}
                      onChange={(e) => setSaleNotes(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none h-16 text-slate-800 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Calculations preview box */}
                <div className="bg-slate-50/75 rounded-2xl p-5 border border-slate-150 space-y-3 ml-auto w-full md:w-80">
                  <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px] border-b border-slate-150 pb-2">Récapitulatif</h4>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-500">Montant HT</span>
                    <span className="text-slate-800">{(saleQuantity * salePrice).toLocaleString()} MAD</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-500">TVA ({saleTvaRate}%)</span>
                    <span className="text-slate-800">{((saleQuantity * salePrice * saleTvaRate) / 100).toLocaleString()} MAD</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-slate-150 pt-2 text-indigo-600">
                    <span>Total TTC</span>
                    <span>{((saleQuantity * salePrice) * (1 + saleTvaRate / 100)).toLocaleString()} MAD</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end border-t border-slate-150 pt-4 mt-6">
                <button 
                  type="button" 
                  onClick={handlePrintSaleInvoice}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimer la Facture</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsSaleModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl font-bold transition-all"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="bg-indigo-600 hover:bg-indigo-550 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 border border-indigo-600"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Enregistrer la Sortie</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
