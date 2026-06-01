import React, { useState, useEffect, useMemo } from 'react';
import { ModelData, SubcontractOrder } from '../types';
import { 
  Truck, Plus, Search, Trash2, Edit2, X, Check, 
  AlertCircle, Calendar, DollarSign, Package, 
  ChevronDown, ChevronUp, Loader2, Info, Eye, Layers, Palette,
  Printer, CheckSquare, Clock, ShieldCheck, ClipboardCheck, Sparkles, Send, Copy
} from 'lucide-react';

interface SousTraitanceProps {
  models: ModelData[];
  settings?: any;
}

interface BatchInput {
  quantity: number;
  deliveryDate: string;
  notes: string;
  // Dynamic color-size structure: { [color]: { [size]: quantity } }
  grid: Record<string, Record<string, number>>;
}

const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

export default function SousTraitance({ models, settings }: SousTraitanceProps) {
  const [orders, setOrders] = useState<SubcontractOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active Tab: 'list' (Table) or 'timeline' (Gantt/Timeline chart)
  const [activeTab, setActiveTab] = useState<'list' | 'timeline'>('list');

  // Filters and Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [subcontractorFilter, setSubcontractorFilter] = useState<string>('ALL');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SubcontractOrder | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<SubcontractOrder | null>(null);

  // Form Fields (Common fields for new order group)
  const [formModelId, setFormModelId] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formSubcontractorName, setFormSubcontractorName] = useState('');
  const [formPricePerPiece, setFormPricePerPiece] = useState<number>(0);
  const [formTotalQuantity, setFormTotalQuantity] = useState<number>(0);
  const [formNotes, setFormNotes] = useState('');
  const [formSubcontractorPhone, setFormSubcontractorPhone] = useState('');
  const [formSubcontractorRating, setFormSubcontractorRating] = useState<number>(5);
  const [formSubcontractorAvailabilityDate, setFormSubcontractorAvailabilityDate] = useState('');
  
  // Advanced features state fields (Logistics tracking)
  const [formTissuStatus, setFormTissuStatus] = useState<'PENDING' | 'SENT'>('PENDING');
  const [formFournituresStatus, setFormFournituresStatus] = useState<'PENDING' | 'DELIVERED'>('PENDING');
  const [formFicheTechniqueSent, setFormFicheTechniqueSent] = useState<boolean>(false);

  // Quality Control state fields
  const [formQtyAccepted, setFormQtyAccepted] = useState<number>(0);
  const [formQtyToRepair, setFormQtyToRepair] = useState<number>(0);
  const [formQtyRejected, setFormQtyRejected] = useState<number>(0);

  // Clipboard copy alert state
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  // Batches state for splitting
  const [batches, setBatches] = useState<BatchInput[]>([
    { quantity: 0, deliveryDate: '', notes: '', grid: {} }
  ]);

  // Temporary color input for adding new colors to the grid
  const [newColorInputs, setNewColorInputs] = useState<string[]>(['']);

  // Fetch orders from API
  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/subcontract', { credentials: 'include' });
      if (!res.ok) throw new Error('Échec du chargement des commandes de sous-traitance');
      const data = await res.json();
      setOrders(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Une erreur est survenue lors de la récupération des données.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Sync client name when model changes
  const handleModelChange = (modelId: string) => {
    setFormModelId(modelId);
    if (modelId === 'MANUAL') {
      setFormClientName('');
      return;
    }
    const selected = models.find(m => m.id === modelId);
    if (selected) {
      setFormClientName(selected.ficheData?.client || '');
      // Autofill target quantity if available
      if (selected.meta_data.quantity && formTotalQuantity === 0) {
        setFormTotalQuantity(selected.meta_data.quantity);
        // Sync first batch quantity
        setBatches(prev => {
          const updated = [...prev];
          if (updated[0]) updated[0].quantity = selected.meta_data.quantity || 0;
          return updated;
        });
      }
    }
  };

  // Add a new empty batch for splitting
  const addBatch = () => {
    setBatches([...batches, { quantity: 0, deliveryDate: '', notes: '', grid: {} }]);
    setNewColorInputs([...newColorInputs, '']);
  };

  // Remove a batch
  const removeBatch = (index: number) => {
    if (batches.length === 1) return;
    const updated = batches.filter((_, i) => i !== index);
    setBatches(updated);
    const updatedInputs = newColorInputs.filter((_, i) => i !== index);
    setNewColorInputs(updatedInputs);
  };

  // Update specific batch fields
  const updateBatchField = (index: number, field: keyof BatchInput, value: any) => {
    setBatches(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Add color to a batch grid
  const addColorToBatch = (batchIndex: number) => {
    const colorName = newColorInputs[batchIndex].trim();
    if (!colorName) return;

    setBatches(prev => {
      const updated = [...prev];
      const batch = updated[batchIndex];
      if (!batch.grid[colorName]) {
        // Initialize sizes with 0
        const initialSizes: Record<string, number> = {};
        COMMON_SIZES.forEach(sz => { initialSizes[sz] = 0; });
        batch.grid[colorName] = initialSizes;
      }
      return updated;
    });

    // Reset color input for this batch
    setNewColorInputs(prev => {
      const updated = [...prev];
      updated[batchIndex] = '';
      return updated;
    });
  };

  // Remove color from a batch grid
  const removeColorFromBatch = (batchIndex: number, color: string) => {
    setBatches(prev => {
      const updated = [...prev];
      const batch = updated[batchIndex];
      delete batch.grid[color];
      // Recalculate total quantity from grid
      batch.quantity = calculateBatchGridTotal(batch.grid);
      return updated;
    });
  };

  // Update quantity for a specific color and size in a batch grid
  const updateGridQty = (batchIndex: number, color: string, size: string, qty: number) => {
    const cleanQty = Math.max(0, qty || 0);
    setBatches(prev => {
      const updated = [...prev];
      const batch = updated[batchIndex];
      if (batch.grid[color]) {
        batch.grid[color][size] = cleanQty;
      }
      // Recalculate total quantity of this batch
      batch.quantity = calculateBatchGridTotal(batch.grid);
      return updated;
    });
  };

  // Helper to calculate total pieces in a batch grid
  const calculateBatchGridTotal = (grid: Record<string, Record<string, number>>) => {
    let sum = 0;
    Object.values(grid).forEach(sizes => {
      Object.values(sizes).forEach(qty => {
        sum += qty;
      });
    });
    return sum;
  };

  // Calculate sum of all batches quantities
  const totalBatchesQty = useMemo(() => {
    return batches.reduce((sum, b) => sum + b.quantity, 0);
  }, [batches]);

  // Unique Subcontractors list for filter
  const subcontractorNames = useMemo(() => {
    const list = new Set<string>();
    orders.forEach(o => {
      if (o.subcontractorName) list.add(o.subcontractorName);
    });
    return Array.from(list);
  }, [orders]);

  // Group orders by subcontractor for Timeline View
  const subcontractorGroups = useMemo(() => {
    const groups: Record<string, SubcontractOrder[]> = {};
    orders.forEach(o => {
      if (!groups[o.subcontractorName]) {
        groups[o.subcontractorName] = [];
      }
      groups[o.subcontractorName].push(o);
    });
    return groups;
  }, [orders]);

  // Statistics
  const stats = useMemo(() => {
    let totalQty = 0;
    let totalCost = 0;
    let pendingCount = 0;
    let coupeCount = 0;
    let coutureCount = 0;
    let finitionCount = 0;
    let livrePartielCount = 0;
    let completedCount = 0;

    orders.forEach(o => {
      totalQty += o.totalQuantity;
      totalCost += o.totalQuantity * (o.pricePerPiece || 0);
      if (o.status === 'PENDING') pendingCount++;
      else if (o.status === 'IN_COUPE') coupeCount++;
      else if (o.status === 'IN_COUTURE') coutureCount++;
      else if (o.status === 'IN_FINITION') finitionCount++;
      else if (o.status === 'LIVRE_PARTIEL') livrePartielCount++;
      else if (o.status === 'COMPLETED') completedCount++;
    });

    return { 
      totalQty, totalCost, pendingCount, coupeCount, coutureCount, finitionCount,
      livrePartielCount, completedCount, totalOrdersCount: orders.length 
    };
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = 
        (o.modelName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.clientName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.subcontractorName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.notes || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const matchSub = subcontractorFilter === 'ALL' || o.subcontractorName === subcontractorFilter;

      return matchSearch && matchStatus && matchSub;
    });
  }, [orders, searchQuery, statusFilter, subcontractorFilter]);

  // Initialize form for adding
  const openAddModal = () => {
    setFormModelId(models[0]?.id || 'MANUAL');
    setFormClientName(models[0]?.ficheData?.client || '');
    setFormSubcontractorName('');
    setFormPricePerPiece(0);
    setFormTotalQuantity(models[0]?.meta_data.quantity || 0);
    setFormNotes('');
    setFormTissuStatus('PENDING');
    setFormFournituresStatus('PENDING');
    setFormFicheTechniqueSent(false);
    setFormSubcontractorPhone('');
    setFormSubcontractorRating(5);
    setFormSubcontractorAvailabilityDate('');
    
    // Initial batch
    setBatches([{
      quantity: models[0]?.meta_data.quantity || 0,
      deliveryDate: '',
      notes: '',
      grid: {}
    }]);
    setNewColorInputs(['']);
    
    setError(null);
    setIsAddModalOpen(true);
  };

  // Submit Subcontract Orders (Handles splitting into multiple DB rows if multiple batches exist)
  const handleAddOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);

    // Validations
    if (!formSubcontractorName.trim()) {
      setError('Veuillez spécifier le nom du sous-traitant (المناول).');
      setActionLoading(false);
      return;
    }

    // Check if total batches quantity equals total quantity entered, or force use of total quantity if no grid specified
    let finalBatches = [...batches];
    
    // If user set up grid and multiple batches, check matching quantities
    if (finalBatches.length > 1 || Object.keys(finalBatches[0].grid).length > 0) {
      if (totalBatchesQty !== formTotalQuantity) {
        setError(`La somme des quantités des lots (${totalBatchesQty} pcs) ne correspond pas à la quantité totale (${formTotalQuantity} pcs).`);
        setActionLoading(false);
        return;
      }
    } else {
      // Single simple batch without grid - auto-fill from main quantity
      finalBatches[0].quantity = formTotalQuantity;
      if (!finalBatches[0].deliveryDate) {
        setError('Veuillez spécifier une date de livraison.');
        setActionLoading(false);
        return;
      }
    }

    const selectedModel = models.find(m => m.id === formModelId);
    const modelName = formModelId === 'MANUAL' ? 'Commande Directe (طلبية مباشرة)' : (selectedModel?.meta_data.nom_modele || 'Inconnu');

    try {
      // Loop and save each batch as an individual SubcontractOrder row
      for (const batch of finalBatches) {
        // Flatten sizes and colors JSONs from grid
        const sizes: Record<string, number> = {};
        const colors: Record<string, number> = {};

        Object.entries(batch.grid).forEach(([color, sizesObj]) => {
          colors[color] = (colors[color] || 0) + Object.values(sizesObj).reduce((a, b) => a + b, 0);
          Object.entries(sizesObj).forEach(([size, qty]) => {
            if (qty > 0) {
              sizes[size] = (sizes[size] || 0) + qty;
            }
          });
        });

        const body = {
          modelId: formModelId,
          modelName,
          clientName: formClientName,
          totalQuantity: batch.quantity,
          subcontractorName: formSubcontractorName,
          pricePerPiece: formPricePerPiece,
          deliveryDate: batch.deliveryDate,
          status: 'PENDING',
          sizes_json: Object.keys(sizes).length > 0 ? JSON.stringify(sizes) : null,
          colors_json: Object.keys(colors).length > 0 ? JSON.stringify(colors) : null,
          notes: batch.notes || formNotes || null,
          tissuStatus: formTissuStatus,
          fournituresStatus: formFournituresStatus,
          ficheTechniqueSent: formFicheTechniqueSent ? 1 : 0,
          qtyAccepted: 0,
          qtyToRepair: 0,
          qtyRejected: 0,
          subcontractorPhone: formSubcontractorPhone || null,
          subcontractorRating: formSubcontractorRating,
          subcontractorAvailabilityDate: formSubcontractorAvailabilityDate || null
        };

        const res = await fetch('/api/subcontract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || 'Erreur lors de la création du lot.');
        }
      }

      setIsAddModalOpen(false);
      fetchOrders();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Modal for a single batch
  const openEditModal = (order: SubcontractOrder) => {
    setSelectedOrder(order);
    setFormModelId(order.modelId);
    setFormClientName(order.clientName || '');
    setFormSubcontractorName(order.subcontractorName);
    setFormPricePerPiece(order.pricePerPiece || 0);
    setFormTotalQuantity(order.totalQuantity);
    setFormNotes(order.notes || '');

    // Set advanced features values
    setFormTissuStatus(order.tissuStatus || 'PENDING');
    setFormFournituresStatus(order.fournituresStatus || 'PENDING');
    setFormFicheTechniqueSent(order.ficheTechniqueSent === 1);
    setFormQtyAccepted(order.qtyAccepted || 0);
    setFormQtyToRepair(order.qtyToRepair || 0);
    setFormQtyRejected(order.qtyRejected || 0);
    setFormSubcontractorPhone(order.subcontractorPhone || '');
    setFormSubcontractorRating(order.subcontractorRating || 5);
    setFormSubcontractorAvailabilityDate(order.subcontractorAvailabilityDate || '');

    // Reconstruct grid structure from JSONs
    let initialGrid: Record<string, Record<string, number>> = {};
    try {
      const parsedSizes = order.sizes_json ? JSON.parse(order.sizes_json) as Record<string, number> : {};
      const parsedColors = order.colors_json ? JSON.parse(order.colors_json) as Record<string, number> : {};

      // If we have sizes & colors but no matching matrix, let's distribute roughly or create a generic color entry
      if (Object.keys(parsedColors).length > 0) {
        Object.keys(parsedColors).forEach(color => {
          initialGrid[color] = {};
          COMMON_SIZES.forEach(sz => {
            initialGrid[color][sz] = parsedSizes[sz] || 0; // Simple fallback
          });
        });
      } else if (Object.keys(parsedSizes).length > 0) {
        initialGrid['Standard'] = {};
        COMMON_SIZES.forEach(sz => {
          initialGrid['Standard'][sz] = parsedSizes[sz] || 0;
        });
      }
    } catch (e) {
      console.error("Error parsing JSONs in edit mode", e);
    }

    setBatches([{
      quantity: order.totalQuantity,
      deliveryDate: order.deliveryDate,
      notes: order.notes || '',
      grid: initialGrid
    }]);
    setNewColorInputs(['']);
    
    setError(null);
    setIsEditModalOpen(true);
  };

  // Update Subcontract Order
  const handleEditOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setActionLoading(true);
    setError(null);

    const batch = batches[0];
    // Flatten sizes and colors JSONs from grid
    const sizes: Record<string, number> = {};
    const colors: Record<string, number> = {};

    if (Object.keys(batch.grid).length > 0) {
      Object.entries(batch.grid).forEach(([color, sizesObj]) => {
        colors[color] = (colors[color] || 0) + Object.values(sizesObj).reduce((a, b) => a + b, 0);
        Object.entries(sizesObj).forEach(([size, qty]) => {
          if (qty > 0) {
            sizes[size] = (sizes[size] || 0) + qty;
          }
        });
      });
    }

    // If grid was updated, use its total quantity, otherwise use the form's total quantity
    const totalQty = Object.keys(batch.grid).length > 0 ? calculateBatchGridTotal(batch.grid) : formTotalQuantity;

    const selectedModel = models.find(m => m.id === formModelId);
    const modelName = formModelId === 'MANUAL' ? 'Commande Directe (طلبية مباشرة)' : (selectedModel?.meta_data.nom_modele || 'Inconnu');

    const body = {
      modelId: formModelId,
      modelName,
      clientName: formClientName,
      totalQuantity: totalQty,
      subcontractorName: formSubcontractorName,
      pricePerPiece: formPricePerPiece,
      deliveryDate: batch.deliveryDate || selectedOrder.deliveryDate,
      status: selectedOrder.status,
      sizes_json: Object.keys(sizes).length > 0 ? JSON.stringify(sizes) : selectedOrder.sizes_json,
      colors_json: Object.keys(colors).length > 0 ? JSON.stringify(colors) : selectedOrder.colors_json,
      notes: formNotes || null,
      tissuStatus: formTissuStatus,
      fournituresStatus: formFournituresStatus,
      ficheTechniqueSent: formFicheTechniqueSent ? 1 : 0,
      qtyAccepted: formQtyAccepted,
      qtyToRepair: formQtyToRepair,
      qtyRejected: formQtyRejected,
      subcontractorPhone: formSubcontractorPhone || null,
      subcontractorRating: formSubcontractorRating,
      subcontractorAvailabilityDate: formSubcontractorAvailabilityDate || null
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
        throw new Error(errData.message || 'Erreur lors de la mise à jour.');
      }

      setIsEditModalOpen(false);
      fetchOrders();
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
      if (!res.ok) throw new Error('Échec de la modification du statut');
      
      // Update local state
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as any } : o));
    } catch (err: any) {
      alert(err.message || 'Erreur de communication');
    }
  };

  // Delete Order
  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce lot de sous-traitance ?')) return;

    try {
      const res = await fetch(`/api/subcontract/${orderId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Échec de la suppression');
      
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch (err: any) {
      alert(err.message || 'Une erreur est survenue.');
    }
  };

  // Printing delivery note
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
            .title { font-size: 28px; font-weight: 900; color: #1e1b4b; text-transform: uppercase; letter-spacing: -0.5px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 12px; }
            .meta-title { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.5px; }
            .meta-val { font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 40px; }
            th { background: #f1f5f9; padding: 12px; text-align: left; font-size: 11px; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: 800; }
            td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; }
            .signatures { display: flex; justify-content: space-between; margin-top: 80px; }
            .sig-box { width: 230px; border-top: 2px dashed #cbd5e1; text-align: center; padding-top: 10px; font-size: 11px; color: #475569; font-weight: 800; text-transform: uppercase; }
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
              <div style="font-size: 18px; font-weight: 900; color: #4f46e5; letter-spacing: -0.5px;">BON D'ENVOI DE SOUS-TRAITANCE</div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 4px;">RÉF: BS-${order.id.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>

          <div class="meta">
            <div class="meta-box">
              <div class="meta-title">Atelier de Sous-traitance (المناول)</div>
              <div class="meta-val">${order.subcontractorName}</div>
            </div>
            <div class="meta-box">
              <div class="meta-title">Donneur d'Ordre / Client (الزبون)</div>
              <div class="meta-val">${order.clientName || 'N/A'}</div>
            </div>
            <div class="meta-box">
              <div class="meta-title">Modèle & Réf (الموديل)</div>
              <div class="meta-val">${order.modelName}</div>
            </div>
            <div class="meta-box">
              <div class="meta-title">Date de Livraison Prévue (تاريخ التسليم)</div>
              <div class="meta-val">${order.deliveryDate}</div>
            </div>
          </div>

          <h3 style="font-size: 15px; margin-bottom: 10px; color: #1e1b4b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; font-weight: 800;">DÉTAILS DES PIÈCES À LIVRER (COLOR-SIZE MATRIX)</h3>
          <table>
            <thead>
              <tr>
                <th>Couleur (اللون)</th>
                <th>Détail des Tailles (المقاسات المحددة للدفعة)</th>
                <th style="text-align: right;">Quantité (الكمية)</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(colors).map(([color, qty]) => `
                <tr>
                  <td style="font-weight: 800; color: #1e1b4b;">${color}</td>
                  <td style="font-weight: 600;">
                    ${Object.entries(sizes).map(([sz, q]) => `[${sz}]: ${q} pcs`).join(' | ')}
                  </td>
                  <td style="text-align: right; font-weight: 800; color: #4f46e5;">${qty.toLocaleString()} pcs</td>
                </tr>
              `).join('')}
              <tr style="background: #f8fafc; font-weight: 900; font-size: 14px; border-top: 2px solid #cbd5e1;">
                <td colspan="2">QUANTITÉ TOTALE ENVOYÉE</td>
                <td style="text-align: right; font-weight: 900; color: #4f46e5; font-size: 16px;">${order.totalQuantity.toLocaleString()} pcs</td>
              </tr>
            </tbody>
          </table>

          ${order.notes ? `
            <div style="background: #faf5ff; border: 1px solid #f3e8ff; border-radius: 12px; padding: 15px; margin-bottom: 30px;">
              <div style="font-size: 10px; font-weight: 800; color: #a21caf; text-transform: uppercase;">Instructions Logistiques & Notes</div>
              <div style="font-size: 13px; margin-top: 6px; font-style: italic; color: #581c87; font-weight: 600;">${order.notes}</div>
            </div>
          ` : ''}

          <div class="signatures">
            <div class="sig-box">
              Chauffeur / Livreur (الناقل)
            </div>
            <div class="sig-box">
              Réception Sous-traitant (المناول)
            </div>
            <div class="sig-box">
              Contrôle Production (المصنع)
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Helper to copy access portal link to clipboard
  const handleCopyPortalLink = (order: SubcontractOrder) => {
    const dummyUrl = `${window.location.origin}/portal/subcontractor/${order.id.slice(0, 8)}`;
    navigator.clipboard.writeText(dummyUrl).then(() => {
      setCopiedOrderId(order.id);
      setTimeout(() => setCopiedOrderId(null), 2500);
    });
  };

  // Helper to parse JSON safely
  const parseJsonSafe = (jsonStr?: string): Record<string, number> => {
    if (!jsonStr) return {};
    try {
      return JSON.parse(jsonStr);
    } catch {
      return {};
    }
  };

  // Helper to get status color badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'IN_COUPE':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'IN_COUTURE':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'IN_FINITION':
        return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'LIVRE_PARTIEL':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING': return 'En Attente (معلق)';
      case 'IN_COUPE': return 'En Coupe (في القص)';
      case 'IN_COUTURE': return 'En Couture (في الخياطة)';
      case 'IN_FINITION': return 'En Finition (في التشطيب)';
      case 'LIVRE_PARTIEL': return 'Partiel (تسليم جزئي)';
      case 'COMPLETED': return 'Moyen/Complété (مكتمل)';
      default: return status;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative pb-20 overflow-hidden">
      
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0 shadow-sm z-20">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
              <Truck className="w-5 h-5 text-indigo-600" />
            </div>
            Sous-traitance (إدارة المناولة الخارجية)
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Planifier et distribuer les modèles chez les sous-traitants, suivre la logistique, la qualité et les échéances.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openAddModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 self-start md:self-auto hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4" /> Distribuer en sous-traitance (توزيع طلبيات)
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto w-full p-4 md:p-6 space-y-6">
        
        {/* KPI Section */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Total Lots</p>
              <p className="text-xl font-black text-slate-800">{stats.totalOrdersCount}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Volume Total</p>
              <p className="text-xl font-black text-slate-800">{stats.totalQty.toLocaleString()} pcs</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Coût Estimé</p>
              <p className="text-xl font-black text-emerald-600">{(stats.totalCost).toLocaleString()} DH</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">En Attente / Coupe</p>
              <p className="text-xl font-black text-slate-800">{stats.pendingCount + stats.coupeCount}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-pink-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Exécution Couture</p>
              <p className="text-xl font-black text-slate-800">{stats.coutureCount + stats.finitionCount}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Check className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Complétés</p>
              <p className="text-xl font-black text-emerald-700">{stats.completedCount}</p>
            </div>
          </div>
        </div>

        {/* View Tabs Selector */}
        <div className="flex border-b border-slate-200 gap-4 shrink-0">
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-2.5 font-black text-sm px-2.5 transition-colors relative ${activeTab === 'list' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-700'}`}
          >
            📋 Tableau des commandes (جدول الطلبيات)
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`pb-2.5 font-black text-sm px-2.5 transition-colors relative ${activeTab === 'timeline' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-700'}`}
          >
            📊 Vue Chronologique Gantt (التخطيط البصري)
          </button>
        </div>

        {/* Filters Panel */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher sous-traitant, modèle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full bg-slate-50 font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Statut:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="PENDING">En attente (معلق)</option>
                <option value="IN_COUPE">En Coupe (في القص)</option>
                <option value="IN_COUTURE">En Couture (في الخياطة)</option>
                <option value="IN_FINITION">En Finition (في التشطيب)</option>
                <option value="LIVRE_PARTIEL">Partiel (تسليم جزئي)</option>
                <option value="COMPLETED">Complété (مكتمل)</option>
              </select>
            </div>

            {/* Subcontractor Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Sous-traitant:</span>
              <select
                value={subcontractorFilter}
                onChange={(e) => setSubcontractorFilter(e.target.value)}
                className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">Tous les sous-traitants</option>
                {subcontractorNames.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* --- VIEW 1: TABLE VIEW --- */}
        {activeTab === 'list' && (
          loading ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
              <p className="font-bold text-slate-600">Chargement des données de sous-traitance...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
              <Truck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-lg font-black text-slate-700">Aucune commande de sous-traitance</p>
              <button
                onClick={openAddModal}
                className="mt-4 bg-indigo-50 text-indigo-600 border border-indigo-200 font-bold text-xs px-4 py-2.5 rounded-xl transition-all"
              >
                Créer un premier lot
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400 font-black">
                      <th className="p-4">Modèle / Client</th>
                      <th className="p-4">Sous-traitant</th>
                      <th className="p-4 text-center">Quantité</th>
                      <th className="p-4 text-center">Tissus / Fournitures</th>
                      <th className="p-4 text-center">Coût Total</th>
                      <th className="p-4">Date de Livraison</th>
                      <th className="p-4">Grille Tailles/Couleurs</th>
                      <th className="p-4 text-center">Contrôle Qualité</th>
                      <th className="p-4 text-center">Statut</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map(order => {
                      const sizes = parseJsonSafe(order.sizes_json);
                      const colors = parseJsonSafe(order.colors_json);
                      const cost = order.totalQuantity * (order.pricePerPiece || 0);

                      // Calculate QC yield rate
                      const qcDone = (order.qtyAccepted || 0) + (order.qtyToRepair || 0) + (order.qtyRejected || 0);
                      const yieldRate = qcDone > 0 ? Math.round(((order.qtyAccepted || 0) / order.totalQuantity) * 100) : null;

                      return (
                        <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          
                          {/* Model / Client */}
                          <td className="p-4">
                            <div className="font-black text-slate-800 text-sm tracking-tight">
                              {order.modelName}
                            </div>
                            <div className="text-xs font-bold text-slate-400 mt-0.5">
                              Client: {order.clientName || 'N/A'}
                            </div>
                          </td>

                          {/* Subcontractor */}
                          <td className="p-4">
                            <span className="inline-flex items-center gap-1.5 font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg text-xs">
                              <Truck className="w-3.5 h-3.5 text-slate-500" />
                              {order.subcontractorName}
                            </span>
                          </td>

                          {/* Quantity */}
                          <td className="p-4 text-center">
                            <span className="font-black text-slate-700 text-sm">
                              {order.totalQuantity.toLocaleString()}
                            </span>
                            <span className="text-xs font-semibold text-slate-400 ml-1">pcs</span>
                          </td>

                          {/* Tissu & Fournitures logistics statuses */}
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {/* Tissu status badge */}
                              <span 
                                title="Statut du tissu coupé" 
                                className={`text-[10px] font-black px-2 py-0.5 border rounded-full ${order.tissuStatus === 'SENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
                              >
                                Tissu: {order.tissuStatus === 'SENT' ? 'Envoyé' : 'Attente'}
                              </span>

                              {/* Accessories/Fournitures status badge */}
                              <span 
                                title="Statut des fournitures" 
                                className={`text-[10px] font-black px-2 py-0.5 border rounded-full ${order.fournituresStatus === 'DELIVERED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
                              >
                                Acc: {order.fournituresStatus === 'DELIVERED' ? 'Prêt' : 'Attente'}
                              </span>
                            </div>
                          </td>

                          {/* Total Cost */}
                          <td className="p-4 text-center">
                            <span className="font-black text-emerald-600 text-sm">
                              {cost.toLocaleString()} DH
                            </span>
                          </td>

                          {/* Delivery Date */}
                          <td className="p-4">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              {order.deliveryDate}
                            </div>
                          </td>

                          {/* Colors & Sizes Summary */}
                          <td className="p-4 max-w-[180px] truncate">
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(colors).map(([color, qty]) => (
                                <span key={color} className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-100 text-[10px] font-black px-1.5 py-0.5 rounded">
                                  <Palette className="w-2.5 h-2.5" />
                                  {color}: {qty}
                                </span>
                              ))}
                              {Object.keys(sizes).length > 0 && (
                                <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  T: {Object.keys(sizes).join(', ')}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Quality Control Yield */}
                          <td className="p-4 text-center">
                            {yieldRate !== null ? (
                              <div className="inline-flex flex-col items-center">
                                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${yieldRate >= 90 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                  {yieldRate}% Conforme
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold mt-0.5">
                                  A: {order.qtyAccepted} | R: {order.qtyToRepair} | D: {order.qtyRejected}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-slate-400 italic">Non Inspecté</span>
                            )}
                          </td>

                          {/* Status Select */}
                          <td className="p-4 text-center">
                            <select
                              value={order.status}
                              onChange={(e) => handleStatusChange(order.id, e.target.value)}
                              className={`text-xs font-black border rounded-lg px-2.5 py-1 focus:outline-none transition-colors ${getStatusBadge(order.status)}`}
                            >
                              <option value="PENDING">EN ATTENTE</option>
                              <option value="IN_COUPE">EN COUPE</option>
                              <option value="IN_COUTURE">EN COUTURE</option>
                              <option value="IN_FINITION">EN FINITION</option>
                              <option value="LIVRE_PARTIEL">LIVRAISON PARTIELLE</option>
                              <option value="COMPLETED">COMPLÉTÉ</option>
                            </select>
                          </td>

                          {/* Action Buttons */}
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handlePrintDeliveryNote(order)}
                                title="Imprimer Bon d'Envoi (PDF)"
                                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-500 hover:text-indigo-600"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleCopyPortalLink(order)}
                                title={copiedOrderId === order.id ? "Lien copié !" : "Copier le lien d'accès pour le مناول"}
                                className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${copiedOrderId === order.id ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-50'}`}
                              >
                                {copiedOrderId === order.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => { setDetailOrder(order); setIsDetailModalOpen(true); }}
                                title="Détails complets"
                                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-500 hover:text-slate-800"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openEditModal(order)}
                                title="Modifier / Contrôle Qualité"
                                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-slate-500 hover:text-indigo-600"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteOrder(order.id)}
                                title="Supprimer"
                                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-rose-50 hover:border-rose-200 transition-colors text-slate-500 hover:text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* --- VIEW 2: TIMELINE / GANTT VIEW --- */}
        {activeTab === 'timeline' && (
          <div className="space-y-6">
            {Object.keys(subcontractorGroups).length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
                <Truck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-lg font-black text-slate-700">Aucun planning chronologique disponible</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  Plannings de Livraison par Atelier de Sous-traitant
                </h3>

                <div className="space-y-6">
                  {Object.entries(subcontractorGroups).map(([subcontractor, orderList]) => (
                    <div key={subcontractor} className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-4">
                      
                      {/* Subcontractor Row Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="font-black text-slate-800 text-sm flex items-center gap-2">
                          <Truck className="w-4 h-4 text-indigo-500" />
                          {subcontractor}
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          {orderList.length} Lot(s) assigné(s)
                        </span>
                      </div>

                      {/* Orders under this subcontractor */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {orderList.map(ord => {
                          const cost = ord.totalQuantity * (ord.pricePerPiece || 0);
                          const progress = ord.status === 'COMPLETED' ? 100 : ord.status === 'LIVRE_PARTIEL' ? 70 : ord.status === 'IN_FINITION' ? 50 : ord.status === 'IN_COUTURE' ? 30 : 5;

                          return (
                            <div key={ord.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md transition-shadow relative">
                              <span className={`absolute top-3 right-3 text-[9px] font-black border rounded px-1.5 py-0.5 ${getStatusBadge(ord.status)}`}>
                                {getStatusLabel(ord.status)}
                              </span>

                              <div className="text-xs font-black text-slate-800 pr-20 truncate">{ord.modelName}</div>
                              <div className="text-[10px] font-bold text-slate-400 mt-0.5">Client: {ord.clientName || 'N/A'}</div>

                              {/* Progress bar */}
                              <div className="mt-3">
                                <div className="flex justify-between items-center text-[10px] font-black text-slate-400 mb-1">
                                  <span>Progression Est.</span>
                                  <span className="text-indigo-600 font-bold">{progress}%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5">
                                  <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${progress}%` }}></div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] font-black mt-4 pt-3 border-t border-slate-100 text-slate-600">
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{ord.deliveryDate}</span>
                                </div>
                                <div className="font-bold text-indigo-900">
                                  {ord.totalQuantity.toLocaleString()} Pcs
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* --- ADD MODAL --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-4xl border border-slate-200 shadow-2xl flex flex-col my-8 max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="bg-indigo-900 px-6 py-4 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-300" />
                <div>
                  <h3 className="font-black text-lg tracking-tight">Distribuer une nouvelle production (المناولة)</h3>
                  <p className="text-indigo-200 text-xs mt-0.5">Créer une commande de sous-traitance, diviser les lots et configurer les matières.</p>
                </div>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="w-8 h-8 rounded-xl bg-indigo-800/50 flex items-center justify-center hover:bg-indigo-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form onSubmit={handleAddOrder} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
              
              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-sm font-bold text-rose-800">{error}</div>
                </div>
              )}

              {/* Step 1: Communes Information */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-4">
                <h4 className="text-xs font-black text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-4 h-4" />
                  Informations Générales de la Commande
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Model Choice */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Sélectionner un Modèle (الموديل)</label>
                    <select
                      value={formModelId}
                      onChange={(e) => handleModelChange(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
                    >
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.meta_data.nom_modele} {m.meta_data.reference ? `(${m.meta_data.reference})` : ''}</option>
                      ))}
                      <option value="MANUAL">+ Saisie Manuelle (طلبية مباشرة خارج الموديلات)</option>
                    </select>
                  </div>

                  {/* Client Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Client (الزبون)</label>
                    <input
                      type="text"
                      placeholder="Nom du client..."
                      value={formClientName}
                      onChange={(e) => setFormClientName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Subcontractor Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Sous-traitant (اسم ورشة المناول) *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Atelier Nord, ModCouture..."
                      value={formSubcontractorName}
                      onChange={(e) => setFormSubcontractorName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Subcontractor Phone */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Téléphone (الهاتف)</label>
                    <input
                      type="tel"
                      placeholder="Ex: +212 600000000"
                      value={formSubcontractorPhone}
                      onChange={(e) => setFormSubcontractorPhone(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Subcontractor Rating */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Note / Évaluation (التقييم)</label>
                    <select
                      value={formSubcontractorRating}
                      onChange={(e) => setFormSubcontractorRating(Number(e.target.value) || 5)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value={5}>★★★★★ (5/5)</option>
                      <option value={4}>★★★★☆ (4/5)</option>
                      <option value={3}>★★★☆☆ (3/5)</option>
                      <option value={2}>★★☆☆☆ (2/5)</option>
                      <option value={1}>★☆☆☆☆ (1/5)</option>
                    </select>
                  </div>

                  {/* Subcontractor Availability Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Disponible à partir de (تاريخ التوفر)</label>
                    <input
                      type="date"
                      value={formSubcontractorAvailabilityDate}
                      onChange={(e) => setFormSubcontractorAvailabilityDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Price Per Piece */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Prix par قطعة (ثمن القطعة بالدرهم)</label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formPricePerPiece || ''}
                        onChange={(e) => setFormPricePerPiece(parseFloat(e.target.value) || 0)}
                        className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Total Quantity */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Quantité Totale Demandée (الكمية الإجمالية) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="1000"
                      value={formTotalQuantity || ''}
                      onChange={(e) => setFormTotalQuantity(parseInt(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-black text-indigo-900 bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Total Cost summary */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Coût total estimé (المبلغ الإجمالي)</label>
                    <div className="flex items-center gap-2 p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                      <span className="text-sm font-black text-indigo-700 font-mono">
                        {(formTotalQuantity * formPricePerPiece).toFixed(2)} DH
                      </span>
                    </div>
                  </div>

                  {/* Mock Fabric/Warehouse verification */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Vérification المخزن الافتراضي</label>
                    <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span className="text-xs font-bold text-emerald-700">Stock disponible estimé (قماش متوفر) ✅</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Logistics status selector */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-4">
                <h4 className="text-xs font-black text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ClipboardCheck className="w-4 h-4" />
                  Statut des Matériaux & Dossier Technique (اللوجستيك)
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Tissu status */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Ques/Tissus (حالة القماش)</label>
                    <select
                      value={formTissuStatus}
                      onChange={(e) => setFormTissuStatus(e.target.value as any)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 bg-white"
                    >
                      <option value="PENDING">En attente (في انتظار القص/الإرسال)</option>
                      <option value="SENT">Envoyé (تم تسليم القماش المقصوص)</option>
                    </select>
                  </div>

                  {/* Accessories status */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Accessoires / Fournitures</label>
                    <select
                      value={formFournituresStatus}
                      onChange={(e) => setFormFournituresStatus(e.target.value as any)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 bg-white"
                    >
                      <option value="PENDING">En préparation (قيد التجهيز)</option>
                      <option value="DELIVERED">Prêt/Livre (جاهز وتم تسليمه)</option>
                    </select>
                  </div>

                  {/* Fiche technique checkbox */}
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id="formFicheTechniqueSent"
                      checked={formFicheTechniqueSent}
                      onChange={(e) => setFormFicheTechniqueSent(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded"
                    />
                    <label htmlFor="formFicheTechniqueSent" className="text-xs font-bold text-slate-600 uppercase">
                      Dossier Technique Envoyé (الملف التقني)
                    </label>
                  </div>
                </div>
              </div>

              {/* Step 2: Batches & Splitting */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                    <Layers className="w-5 h-5 text-indigo-600" />
                    Lots de Livraison & Grille de Tailles/Couleurs (تقسيم الدفعات)
                  </h4>
                  <button
                    type="button"
                    onClick={addBatch}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    + Diviser / Ajouter un lot
                  </button>
                </div>

                {/* Grid Info Alert */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-indigo-800">
                    Saisissez les dates et quantités par lot. Pour chaque lot, ajoutez ses couleurs et répartissez les quantités par taille. La somme des lots doit correspondre à <strong>{formTotalQuantity} pcs</strong>. Actuellement saisi: <strong>{totalBatchesQty} pcs</strong>.
                  </p>
                </div>

                {/* Batches Loop */}
                {batches.map((batch, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-2xl p-4 bg-white space-y-4 shadow-sm relative">
                    {/* Delete Batch Button */}
                    {batches.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBatch(idx)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-rose-600 w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">Lot de Livraison {idx + 1}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Delivery Date for Batch */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Date de livraison prévue *</label>
                        <input
                          type="date"
                          required
                          value={batch.deliveryDate}
                          onChange={(e) => updateBatchField(idx, 'deliveryDate', e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-700 bg-white"
                        />
                      </div>

                      {/* Calculated Quantity for Batch */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Quantité de ce lot (Calculée ou Fixée)</label>
                        <input
                          type="number"
                          readOnly={Object.keys(batch.grid).length > 0}
                          value={batch.quantity || ''}
                          onChange={(e) => updateBatchField(idx, 'quantity', parseInt(e.target.value) || 0)}
                          className={`w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-black ${Object.keys(batch.grid).length > 0 ? 'bg-slate-50 text-indigo-600' : 'bg-white text-slate-700'}`}
                        />
                      </div>
                    </div>

                    {/* Color & Size matrix setup */}
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Répartition Tailles & Couleurs (Détail)</span>
                        
                        {/* New Color Add form */}
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder="Nouvelle couleur..."
                            value={newColorInputs[idx] || ''}
                            onChange={(e) => {
                              setNewColorInputs(prev => {
                                const updated = [...prev];
                                updated[idx] = e.target.value;
                                return updated;
                              });
                            }}
                            className="border border-slate-200 rounded px-2 py-1 text-[11px] font-medium bg-white focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => addColorToBatch(idx)}
                            className="bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded px-2 py-1 text-[11px] font-black"
                          >
                            Ajouter
                          </button>
                        </div>
                      </div>

                      {/* Color-Size Matrix */}
                      {Object.keys(batch.grid).length === 0 ? (
                        <p className="text-[11px] text-slate-400 font-medium italic">Aucune couleur spécifiée. Ajoutez une couleur ci-dessus pour détailler les tailles.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-400 font-bold">
                                <th className="py-1.5 px-2">Couleur</th>
                                {COMMON_SIZES.map(sz => (
                                  <th key={sz} className="py-1.5 px-1 text-center w-12">{sz}</th>
                                ))}
                                <th className="py-1.5 px-2 text-right w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(batch.grid).map(([color, sizesObj]) => (
                                <tr key={color} className="border-b border-slate-100 last:border-0">
                                  <td className="py-1 px-2 font-black text-slate-700">{color}</td>
                                  {COMMON_SIZES.map(sz => (
                                    <td key={sz} className="py-1 px-0.5 text-center">
                                      <input
                                        type="number"
                                        min="0"
                                        value={sizesObj[sz] || ''}
                                        placeholder="0"
                                        onChange={(e) => updateGridQty(idx, color, sz, parseInt(e.target.value) || 0)}
                                        className="w-10 border border-slate-200 rounded text-center py-1 text-[11px] font-bold focus:outline-none focus:border-indigo-500"
                                      />
                                    </td>
                                  ))}
                                  <td className="py-1 px-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => removeColorFromBatch(idx, color)}
                                      className="text-slate-400 hover:text-rose-600 transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Batch-specific notes */}
                    <div>
                      <input
                        type="text"
                        placeholder="Remarques spécifiques à ce lot (ex: Tissu fourni par client...)"
                        value={batch.notes}
                        onChange={(e) => updateBatchField(idx, 'notes', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white placeholder-slate-400"
                      />
                    </div>

                  </div>
                ))}
              </div>

              {/* Form Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Notes Générales</label>
                <textarea
                  rows={2}
                  placeholder="Remarques et instructions importantes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

            </form>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-slate-200 shrink-0">
              <span className="text-xs font-bold text-slate-500">
                Somme des lots: <strong className="text-indigo-600">{totalBatchesQty} pcs</strong> / {formTotalQuantity} pcs
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm px-4 py-2.5 rounded-xl transition-all"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleAddOrder}
                  disabled={actionLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Sauvegarder
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* --- EDIT / QC MODAL --- */}
      {isEditModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl border border-slate-200 shadow-2xl flex flex-col my-8 max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-slate-400" />
                <div>
                  <h3 className="font-black text-lg tracking-tight">Modifier & Contrôle de Qualité (المناولة)</h3>
                  <p className="text-slate-400 text-xs mt-0.5">{selectedOrder.modelName} - {selectedOrder.subcontractorName}</p>
                </div>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form onSubmit={handleEditOrder} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-sm font-bold text-rose-800">{error}</div>
                </div>
              )}

              {/* Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Model Choice */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Modèle (الموديل)</label>
                  <select
                    value={formModelId}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.meta_data.nom_modele}</option>
                    ))}
                    <option value="MANUAL">Saisie Manuelle</option>
                  </select>
                </div>

                {/* Client Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Client (الزبون)</label>
                  <input
                    type="text"
                    value={formClientName}
                    onChange={(e) => setFormClientName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white"
                  />
                </div>

                {/* Subcontractor Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Sous-traitant *</label>
                  <input
                    type="text"
                    required
                    value={formSubcontractorName}
                    onChange={(e) => setFormSubcontractorName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white"
                  />
                </div>

                {/* Subcontractor Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Téléphone</label>
                  <input
                    type="tel"
                    placeholder="Ex: +212 600000000"
                    value={formSubcontractorPhone}
                    onChange={(e) => setFormSubcontractorPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white"
                  />
                </div>

                {/* Subcontractor Rating */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Note / Évaluation</label>
                  <select
                    value={formSubcontractorRating}
                    onChange={(e) => setFormSubcontractorRating(Number(e.target.value) || 5)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white"
                  >
                    <option value={5}>★★★★★ (5/5)</option>
                    <option value={4}>★★★★☆ (4/5)</option>
                    <option value={3}>★★★☆☆ (3/5)</option>
                    <option value={2}>★★☆☆☆ (2/5)</option>
                    <option value={1}>★☆☆☆☆ (1/5)</option>
                  </select>
                </div>

                {/* Subcontractor Availability Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Disponible à partir de</label>
                  <input
                    type="date"
                    value={formSubcontractorAvailabilityDate}
                    onChange={(e) => setFormSubcontractorAvailabilityDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white"
                  />
                </div>

                {/* Price Per Piece */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Prix par pièce</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formPricePerPiece || ''}
                    onChange={(e) => setFormPricePerPiece(parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white"
                  />
                </div>

                {/* Total Quantity */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Quantité du Lot *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formTotalQuantity || ''}
                    onChange={(e) => setFormTotalQuantity(parseInt(e.target.value) || 0)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-indigo-900 bg-white"
                  />
                </div>

                {/* Total Cost summary */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Coût total estimé</label>
                  <div className="flex items-center gap-2 p-2 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <span className="text-sm font-black text-indigo-700 font-mono">
                      {(formTotalQuantity * formPricePerPiece).toFixed(2)} DH
                    </span>
                  </div>
                </div>

                {/* Delivery Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Date de Livraison *</label>
                  <input
                    type="date"
                    required
                    value={batches[0]?.deliveryDate || ''}
                    onChange={(e) => {
                      const dateVal = e.target.value;
                      setBatches(prev => {
                        const updated = [...prev];
                        if (updated[0]) updated[0].deliveryDate = dateVal;
                        return updated;
                      });
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white"
                  />
                </div>
              </div>

              {/* Logistics fields */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-4">
                <span className="text-xs font-black text-indigo-800 uppercase block mb-1">Matières & Fiche Technique</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tissu status</label>
                    <select
                      value={formTissuStatus}
                      onChange={(e) => setFormTissuStatus(e.target.value as any)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white"
                    >
                      <option value="PENDING">En attente</option>
                      <option value="SENT">Envoyé</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Accessoires status</label>
                    <select
                      value={formFournituresStatus}
                      onChange={(e) => setFormFournituresStatus(e.target.value as any)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white"
                    >
                      <option value="PENDING">En attente</option>
                      <option value="DELIVERED">Prêt</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="formFicheTechniqueSentEdit"
                      checked={formFicheTechniqueSent}
                      onChange={(e) => setFormFicheTechniqueSent(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded"
                    />
                    <label htmlFor="formFicheTechniqueSentEdit" className="text-[10px] font-bold text-slate-600 uppercase">
                      Dossier Technique Envoyé
                    </label>
                  </div>
                </div>
              </div>

              {/* Quality Control Fields (Contrôle Qualité) */}
              <div className="border-2 border-emerald-100 rounded-2xl p-4 bg-emerald-50/50 space-y-4">
                <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                  Contrôle Qualité à la Réception (فحص الجودة عند الاستلام)
                </h4>
                <p className="text-[10px] font-medium text-slate-500">
                  Renseignez les quantités inspectées lors du déchargement pour mesurer la qualité effective de la confection.
                </p>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-emerald-700 uppercase mb-1">Conformes (سليمة)</label>
                    <input
                      type="number"
                      min="0"
                      value={formQtyAccepted}
                      onChange={(e) => setFormQtyAccepted(parseInt(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-black text-emerald-700 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-amber-700 uppercase mb-1">À Retoucher (إصلاح)</label>
                    <input
                      type="number"
                      min="0"
                      value={formQtyToRepair}
                      onChange={(e) => setFormQtyToRepair(parseInt(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-black text-amber-700 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-rose-700 uppercase mb-1">Rebuts/Déchets (تالفة)</label>
                    <input
                      type="number"
                      min="0"
                      value={formQtyRejected}
                      onChange={(e) => setFormQtyRejected(parseInt(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-black text-rose-700 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Color/Size Edit Matrix */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-500 uppercase">Grille Tailles & Couleurs (Modifier)</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      placeholder="Nouvelle couleur..."
                      value={newColorInputs[0] || ''}
                      onChange={(e) => {
                        setNewColorInputs([e.target.value]);
                      }}
                      className="border border-slate-200 rounded px-2 py-1 text-[11px] font-medium bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => addColorToBatch(0)}
                      className="bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded px-2.5 py-1 text-[11px] font-black"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>

                {Object.keys(batches[0]?.grid || {}).length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 font-bold">
                          <th className="py-1 px-2">Couleur</th>
                          {COMMON_SIZES.map(sz => (
                            <th key={sz} className="py-1 px-1 text-center w-12">{sz}</th>
                          ))}
                          <th className="py-1 px-2 text-right"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(batches[0].grid).map(([color, sizesObj]) => (
                          <tr key={color} className="border-b border-slate-100 last:border-0">
                            <td className="py-1 px-2 font-black text-slate-700">{color}</td>
                            {COMMON_SIZES.map(sz => (
                              <td key={sz} className="py-1 px-0.5 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={sizesObj[sz] || ''}
                                  placeholder="0"
                                  onChange={(e) => updateGridQty(0, color, sz, parseInt(e.target.value) || 0)}
                                  className="w-10 border border-slate-200 rounded text-center py-1 text-[11px] font-bold"
                                />
                              </td>
                            ))}
                            <td className="py-1 px-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeColorFromBatch(0, color)}
                                className="text-slate-400 hover:text-rose-600 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* General Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Notes Générales</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 bg-white"
                />
              </div>

            </form>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm px-4 py-2.5 rounded-xl transition-all"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleEditOrder}
                disabled={actionLoading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2"
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- DETAIL MODAL --- */}
      {isDetailModalOpen && detailOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg border border-slate-200 shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white shrink-0 rounded-t-3xl">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-black text-lg tracking-tight">Détails de la Sous-traitance</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Fiche complète du lot</p>
                </div>
              </div>
              <button onClick={() => setIsDetailModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 text-sm font-semibold max-h-[70vh] overflow-y-auto no-scrollbar">
              <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase">Modèle (الموديل)</span>
                  <p className="text-slate-800 font-black">{detailOrder.modelName}</p>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase">Client (الزبون)</span>
                  <p className="text-slate-800">{detailOrder.clientName || 'N/A'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase">Sous-traitant (المناول)</span>
                  <p className="text-slate-800 font-bold">{detailOrder.subcontractorName}</p>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase">Date Limite (التاريخ)</span>
                  <p className="text-slate-800 font-bold">{detailOrder.deliveryDate}</p>
                </div>
              </div>

              {(detailOrder.subcontractorPhone || detailOrder.subcontractorRating !== undefined || detailOrder.subcontractorAvailabilityDate) && (
                <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
                  {detailOrder.subcontractorPhone && (
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase">Téléphone (الهاتف)</span>
                      <p className="text-slate-800 font-bold">
                        <a href={`tel:${detailOrder.subcontractorPhone}`} className="text-indigo-600 hover:underline">{detailOrder.subcontractorPhone}</a>
                      </p>
                    </div>
                  )}
                  {detailOrder.subcontractorRating !== undefined && (
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase">Évaluation (التقييم)</span>
                      <p className="text-amber-500 font-bold">
                        {'★'.repeat(Math.max(0, Math.min(5, Math.round(detailOrder.subcontractorRating)))) + '☆'.repeat(Math.max(0, 5 - Math.max(0, Math.min(5, Math.round(detailOrder.subcontractorRating)))))}
                        <span className="text-slate-400 text-[10px] font-normal ml-1">({detailOrder.subcontractorRating}/5)</span>
                      </p>
                    </div>
                  )}
                  {detailOrder.subcontractorAvailabilityDate && (
                    <div className="col-span-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase">Disponible à partir de</span>
                      <p className="text-slate-800">{detailOrder.subcontractorAvailabilityDate}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase">Quantité</span>
                  <p className="text-indigo-900 font-black text-base">{detailOrder.totalQuantity} pcs</p>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase">Prix/Pcs</span>
                  <p className="text-slate-800 font-bold">{detailOrder.pricePerPiece || 0} DH</p>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase">Total Coût</span>
                  <p className="text-emerald-600 font-black text-base">{(detailOrder.totalQuantity * (detailOrder.pricePerPiece || 0)).toLocaleString()} DH</p>
                </div>
              </div>

              {/* Logistics status indicators */}
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                <span className="text-[10px] font-black text-slate-400 uppercase block">Logistique et Approvisionnement</span>
                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-bold">Matière / Tissu:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${detailOrder.tissuStatus === 'SENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      {detailOrder.tissuStatus === 'SENT' ? 'LIVRÉ À L\'ATELIER' : 'EN ATTENTE DE LIVRAISON'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-bold">Accessoires & Fournitures:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${detailOrder.fournituresStatus === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      {detailOrder.fournituresStatus === 'DELIVERED' ? 'FOURNITURES PRÊTES' : 'LIVRAISON SUSPENDUE'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-bold">Fiche Technique:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${detailOrder.ficheTechniqueSent === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {detailOrder.ficheTechniqueSent === 1 ? 'ENVOYÉE' : 'NON DISPONIBLE'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quality inspection details */}
              {(detailOrder.qtyAccepted !== 0 || detailOrder.qtyToRepair !== 0 || detailOrder.qtyRejected !== 0) && (
                <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50/20 space-y-2">
                  <span className="text-[10px] font-black text-emerald-800 uppercase block">Résultats du Contrôle Qualité</span>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-emerald-50 rounded p-2">
                      <span className="text-[9px] text-emerald-800 block uppercase font-black">Conformes</span>
                      <strong className="text-sm font-black text-emerald-900">{detailOrder.qtyAccepted} pcs</strong>
                    </div>
                    <div className="bg-amber-50 rounded p-2">
                      <span className="text-[9px] text-amber-800 block uppercase font-black">Retouches</span>
                      <strong className="text-sm font-black text-amber-900">{detailOrder.qtyToRepair} pcs</strong>
                    </div>
                    <div className="bg-rose-50 rounded p-2">
                      <span className="text-[9px] text-rose-800 block uppercase font-black">Déchets</span>
                      <strong className="text-sm font-black text-rose-900">{detailOrder.qtyRejected} pcs</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Sizes distribution */}
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Détails des Tailles</span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(parseJsonSafe(detailOrder.sizes_json)).map(([sz, qty]) => (
                    <span key={sz} className="bg-slate-100 border border-slate-200 text-slate-700 px-2 py-1 rounded-lg text-xs font-bold">
                      Taille {sz} : <strong className="text-indigo-600">{qty}</strong>
                    </span>
                  ))}
                  {Object.keys(parseJsonSafe(detailOrder.sizes_json)).length === 0 && (
                    <span className="text-slate-400 text-xs italic">Aucune taille détaillée</span>
                  )}
                </div>
              </div>

              {/* Colors distribution */}
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Détails des Couleurs</span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(parseJsonSafe(detailOrder.colors_json)).map(([color, qty]) => (
                    <span key={color} className="bg-violet-50 border border-violet-100 text-violet-800 px-2 py-1 rounded-lg text-xs font-black">
                      {color} : <strong className="text-indigo-600">{qty}</strong>
                    </span>
                  ))}
                  {Object.keys(parseJsonSafe(detailOrder.colors_json)).length === 0 && (
                    <span className="text-slate-400 text-xs italic">Aucune couleur détaillée</span>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Notes / Instructions</span>
                <p className="text-slate-600 text-xs whitespace-pre-wrap">{detailOrder.notes || 'Aucune remarque supplémentaire.'}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-between rounded-b-3xl shrink-0">
              <button
                onClick={() => handlePrintDeliveryNote(detailOrder)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> Bon d'Envoi
              </button>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-5 py-2 rounded-xl transition-all shadow-md"
              >
                Fermer
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
